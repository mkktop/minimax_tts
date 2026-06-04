/**
 * 资源历史记录模块
 * 供各模块功能页调用，显示最近的生成记录
 *
 * 用法:
 *   initResourceHistory('tts')    // 在页面加载后调用
 *   refreshResourceHistory()      // 生成完成后刷新
 */

let currentHistoryType = '';
let historyContainer = null;

/**
 * 初始化历史记录区域
 * @param {string} type - 资源类型: 'tts' | 'image' | 'music'
 */
function initResourceHistory(type) {
    currentHistoryType = type;

    // 找到或创建容器
    historyContainer = document.getElementById('resourceHistory');
    if (!historyContainer) {
        // 在结果区域后面插入
        const resultSection = document.querySelector('.result-section') || document.querySelector('.work-area');
        if (resultSection) {
            const div = document.createElement('div');
            div.id = 'resourceHistory';
            div.className = 'resource-history';
            resultSection.appendChild(div);
            historyContainer = div;
        }
    }

    // 监听登录状态变化
    window.addEventListener('authChanged', () => {
        refreshResourceHistory();
    });

    // 初始加载
    refreshResourceHistory();
}

/**
 * 刷新历史记录列表
 */
async function refreshResourceHistory() {
    if (!historyContainer) return;
    if (!window.currentUser) {
        historyContainer.innerHTML = '';
        return;
    }

    try {
        const res = await fetch(`/api/resources?type=${currentHistoryType}&limit=15`, {
            credentials: 'include'
        });
        const data = await res.json();

        if (!data.success) {
            historyContainer.innerHTML = '';
            return;
        }

        const resources = data.data || [];
        const iconMap = { tts: '🎵', image: '🖼️', music: '🎶' };
        const icon = iconMap[currentHistoryType] || '📄';

        let html = `
            <div class="resource-history-title">
                ${icon} 历史记录 <span class="count">${resources.length} 条</span>
            </div>
        `;

        if (resources.length === 0) {
            html += `<div class="resource-empty">暂无记录，生成后会自动保存在这里</div>`;
        } else {
            html += `<div class="resource-history-list">`;
            resources.forEach(r => {
                const prompt = r.prompt || r.model || '未知';
                const shortPrompt = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
                const time = formatTime(r.created_at);
                const size = formatSize(r.file_size);
                const meta = [r.model, size, time].filter(Boolean).join(' · ');

                html += `
                    <div class="resource-item" data-id="${r.id}">
                        <span class="resource-item-icon">${icon}</span>
                        <div class="resource-item-info">
                            <div class="resource-item-prompt" title="${escapeHtml(prompt)}">${escapeHtml(shortPrompt)}</div>
                            <div class="resource-item-meta">${escapeHtml(meta)}</div>
                        </div>
                        <div class="resource-item-actions">
                            ${currentHistoryType === 'image'
                                ? `<button onclick="previewResource('${r.id}')">预览</button>`
                                : `<button onclick="playResource('${r.id}')">播放</button>`
                            }
                            <button onclick="downloadResource('${r.id}', '${r.format || 'bin'}')">下载</button>
                            <button class="btn-delete" onclick="deleteResource('${r.id}')">删除</button>
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        historyContainer.innerHTML = html;
    } catch (err) {
        console.error('[History] 加载失败:', err);
    }
}

/**
 * 播放资源（TTS/音乐）
 */
async function playResource(id) {
    try {
        const res = await fetch(`/api/resources/${id}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        // 找到或创建 audio 播放器
        let audio = document.getElementById('historyAudio');
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'historyAudio';
            audio.controls = true;
            audio.style.cssText = 'width:100%;margin-top:8px;';
            // 插入到当前 item 后面
        }
        audio.src = url;
        audio.play().catch(() => {});

        // 在历史列表下方显示播放器
        const list = historyContainer.querySelector('.resource-history-list');
        if (list && !list.nextElementSibling?.matches('audio')) {
            historyContainer.appendChild(audio);
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('播放失败', 'error');
    }
}

/**
 * 预览资源（图片）
 */
async function previewResource(id) {
    try {
        const res = await fetch(`/api/resources/${id}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        // 在页面结果区显示图片
        const resultContent = document.getElementById('resultContent') || document.getElementById('resultImage');
        if (resultContent) {
            resultContent.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px;">`;
            const resultSection = resultContent.closest('.result-section');
            if (resultSection) resultSection.classList.remove('hidden');
        } else {
            window.open(url, '_blank');
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('预览失败', 'error');
    }
}

/**
 * 下载资源
 */
async function downloadResource(id, format) {
    try {
        const res = await fetch(`/api/resources/${id}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentHistoryType}_${id}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        if (typeof showToast === 'function') showToast('下载失败', 'error');
    }
}

/**
 * 删除资源
 */
async function deleteResource(id) {
    if (!confirm('确定要删除这条记录吗？')) return;
    try {
        const res = await fetch(`/api/resources/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            if (typeof showToast === 'function') showToast('已删除', 'success');
            refreshResourceHistory();
        } else {
            if (typeof showToast === 'function') showToast(data.error || '删除失败', 'error');
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('删除失败', 'error');
    }
}

// ============ 工具函数 ============

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 7) return `${diffDay} 天前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
