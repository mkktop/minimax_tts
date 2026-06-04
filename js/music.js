/**
 * 音乐生成模块通用工具
 * API Key 管理由 api-key.js 统一提供
 */

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function setStatus(text, detail, type) {
    const section = document.getElementById('statusSection');
    const textEl = document.getElementById('statusText');
    const detailEl = document.getElementById('statusDetail');
    const icon = document.getElementById('statusIcon');
    if (!section) return;
    section.classList.remove('hidden');
    if (textEl) textEl.textContent = text;
    if (detailEl) detailEl.textContent = detail || '';
    if (icon) {
        icon.className = 'status-icon ' + (type || 'processing');
        icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳';
    }
}

function hideStatus() {
    const section = document.getElementById('statusSection');
    if (section) section.classList.add('hidden');
}

function setBtnLoading(btn, loading, origText) {
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? '⏳ 生成中...' : origText;
}

/**
 * 调用音乐生成 API
 * @param {Object} payload - 请求体
 * @returns {Promise<{success, data, error}>}
 */
async function callMusicAPI(payload) {
    const apiKey = getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        showToast('请先设置 API Key', 'error');
        return { success: false, error: '未设置 API Key' };
    }

    try {
        const response = await fetch('/api/music/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || '生成失败');
        }
        return { success: true, data: result.data };
    } catch (error) {
        console.error('Music API error:', error);
        return { success: false, error: error.message };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    updateApiKeyDisplay();
});
