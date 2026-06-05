/**
 * 资源路由 — 列表 / 下载 / 删除 / 清理
 */

const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// 所有资源接口都需要登录
router.use(requireLogin);

/**
 * 前端上传保存资源（用于流式合成等无法在后端直接保存的场景）
 * POST /api/resources
 * body: { type, fileBase64, format, model, prompt, voiceId, params }
 */
router.post('/', async (req, res) => {
    try {
        const { type, fileBase64, format, model, prompt, voiceId, params } = req.body;
        if (!type || !fileBase64) {
            return res.status(400).json({ success: false, error: '缺少 type 或 fileBase64' });
        }

        const fileData = Buffer.from(fileBase64, 'base64');
        const id = require('uuid').v4();

        await require('../db/database').saveResource({
            id,
            userId: req.userId,
            type,
            fileData,
            meta: { model: model || '', prompt: prompt || '', voiceId: voiceId || '', format: format || 'mp3', params: params || {} }
        });

        res.json({ success: true, data: { id } });
    } catch (err) {
        console.error('[Resources] 上传保存失败:', err);
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

/**
 * 获取当前用户的资源列表（不含文件数据）
 * GET /api/resources?type=tts&limit=20&offset=0
 */
router.get('/', async (req, res) => {
    try {
        const { type, limit = '20', offset = '0' } = req.query;
        const resources = await db.listResources(
            req.userId,
            type || null,
            Math.min(parseInt(limit) || 20, 100),
            parseInt(offset) || 0
        );
        res.json({ success: true, data: resources });
    } catch (err) {
        console.error('[Resources] 列表查询失败:', err);
        res.status(500).json({ success: false, error: '查询失败' });
    }
});

/**
 * 下载资源文件（从 DB BLOB 读取）
 * GET /api/resources/:id/download
 */
router.get('/:id/download', async (req, res) => {
    try {
        const resource = await db.getResource(req.params.id, req.userId);
        if (!resource) {
            return res.status(404).json({ success: false, error: '资源不存在' });
        }
        if (!resource.file_data) {
            return res.status(404).json({ success: false, error: '文件数据为空' });
        }

        // 设置响应头
        const format = resource.format || 'bin';
        const mimeTypes = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'pcm': 'audio/pcm',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp'
        };

        const contentType = mimeTypes[format] || 'application/octet-stream';
        const filename = `${resource.type}_${resource.id}.${format}`;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', resource.file_data.length);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(resource.file_data);
    } catch (err) {
        console.error('[Resources] 下载失败:', err);
        res.status(500).json({ success: false, error: '下载失败' });
    }
});

/**
 * 获取资源详情（返回文件数据的 base64，用于前端播放/预览）
 * GET /api/resources/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const resource = await db.getResource(req.params.id, req.userId);
        if (!resource) {
            return res.status(404).json({ success: false, error: '资源不存在' });
        }

        // 解析 params JSON
        try { resource.params = JSON.parse(resource.params); } catch {}

        // 不直接返回大 BLOB，只返回元数据 + 是否有文件
        const result = {
            id: resource.id,
            type: resource.type,
            model: resource.model,
            prompt: resource.prompt,
            voice_id: resource.voice_id,
            params: resource.params,
            format: resource.format,
            file_size: resource.file_size,
            duration: resource.duration,
            has_file: !!resource.file_data,
            created_at: resource.created_at
        };

        res.json({ success: true, data: result });
    } catch (err) {
        console.error('[Resources] 详情查询失败:', err);
        res.status(500).json({ success: false, error: '查询失败' });
    }
});

/**
 * 删除当前用户所有资源（或指定类型）
 * DELETE /api/resources/all?type=tts-http
 */
router.delete('/all', async (req, res) => {
    try {
        const { type } = req.query;
        const count = await db.deleteAllResources(req.userId, type || null);
        res.json({ success: true, deleted: count });
    } catch (err) {
        console.error('[Resources] 批量删除失败:', err);
        res.status(500).json({ success: false, error: '删除失败' });
    }
});

/**
 * 删除单个资源
 * DELETE /api/resources/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await db.deleteResource(req.params.id, req.userId);
        if (!deleted) {
            return res.status(404).json({ success: false, error: '资源不存在' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Resources] 删除失败:', err);
        res.status(500).json({ success: false, error: '删除失败' });
    }
});

module.exports = router;
