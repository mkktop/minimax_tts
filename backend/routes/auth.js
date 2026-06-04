/**
 * 认证路由 — 注册 / 登录 / 登出 / API Key 管理
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ============ 注册 ============

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 参数校验
        if (!username || !password) {
            return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
        }
        if (username.length < 3 || username.length > 30) {
            return res.status(400).json({ success: false, error: '用户名长度需在 3-30 个字符之间' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, error: '密码长度不能少于 6 个字符' });
        }
        if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) {
            return res.status(400).json({ success: false, error: '用户名只能包含字母、数字、下划线或中文' });
        }

        // 检查用户名是否已存在
        const existing = await db.getUserByUsername(username);
        if (existing) {
            return res.status(409).json({ success: false, error: '用户名已被占用' });
        }

        // 创建用户
        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await db.createUser(id, username, passwordHash);

        // 自动登录
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        console.error('[Auth] 注册失败:', err);
        res.status(500).json({ success: false, error: '注册失败，请稍后重试' });
    }
});

// ============ 登录 ============

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
        }

        const user = await db.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ success: false, error: '用户名或密码错误' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: '用户名或密码错误' });
        }

        // 创建 session
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({
            success: true,
            user: { id: user.id, username: user.username },
            hasApiKey: !!user.api_key
        });
    } catch (err) {
        console.error('[Auth] 登录失败:', err);
        res.status(500).json({ success: false, error: '登录失败，请稍后重试' });
    }
});

// ============ 登出 ============

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[Auth] 登出失败:', err);
            return res.status(500).json({ success: false, error: '登出失败' });
        }
        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'minimax.sid');
        res.json({ success: true });
    });
});

// ============ 获取当前登录状态 ============

router.get('/me', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.json({ authenticated: false });
        }

        const user = await db.getUserById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.json({ authenticated: false });
        }

        res.json({
            authenticated: true,
            user: { id: user.id, username: user.username },
            hasApiKey: !!user.api_key
        });
    } catch (err) {
        console.error('[Auth] 检查登录状态失败:', err);
        res.json({ authenticated: false });
    }
});

// ============ API Key 管理 ============

// 检查是否已设置 API Key
router.get('/apikey', requireLogin, async (req, res) => {
    try {
        const apiKey = await db.getUserApiKey(req.userId);
        res.json({ success: true, set: !!apiKey });
    } catch (err) {
        res.status(500).json({ success: false, error: '查询失败' });
    }
});

// 保存 API Key
router.put('/apikey', requireLogin, async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey || !apiKey.trim()) {
            return res.status(400).json({ success: false, error: 'API Key 不能为空' });
        }
        await db.updateUserApiKey(req.userId, apiKey.trim());
        res.json({ success: true });
    } catch (err) {
        console.error('[Auth] 保存 API Key 失败:', err);
        res.status(500).json({ success: false, error: '保存失败' });
    }
});

// 删除 API Key
router.delete('/apikey', requireLogin, async (req, res) => {
    try {
        await db.updateUserApiKey(req.userId, null);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: '删除失败' });
    }
});

module.exports = router;
