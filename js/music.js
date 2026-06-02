/**
 * 音乐生成模块通用工具
 */

const API_KEY_STORAGE = 'minimax_tts_api_key';

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
}

function setApiKey(key) {
    localStorage.setItem(API_KEY_STORAGE, key);
    updateApiKeyDisplay();
}

function updateApiKeyDisplay() {
    const key = getApiKey();
    const display = document.getElementById('apiKeyDisplay');
    if (display) {
        if (key) {
            display.textContent = '****' + key.slice(-6);
            display.classList.add('set');
        } else {
            display.textContent = '未设置 API Key';
            display.classList.remove('set');
        }
    }
}

function showApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('apiKeyInput');
    if (input) input.value = getApiKey();
    if (modal) modal.classList.remove('hidden');
}

function hideApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    if (modal) modal.classList.add('hidden');
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    const key = input ? input.value.trim() : '';
    if (key) {
        setApiKey(key);
        hideApiKeyModal();
        showToast('API Key 保存成功', 'success');
    } else {
        showToast('请输入有效的 API Key', 'error');
    }
}

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

/**
 * 从音乐生成响应中提取音频 URL
 */
function extractAudioUrl(apiResponse) {
    if (!apiResponse) return null;
    // 兼容多种返回格式
    if (apiResponse.data) {
        if (typeof apiResponse.data === 'string') return apiResponse.data;
        if (apiResponse.data.audio) return apiResponse.data.audio;
        if (apiResponse.data.audio_url) return apiResponse.data.audio_url;
        if (apiResponse.data.url) return apiResponse.data.url;
        if (apiResponse.data.data?.audio) return apiResponse.data.data.audio;
    }
    if (apiResponse.audio) return apiResponse.audio;
    if (apiResponse.audio_url) return apiResponse.audio_url;
    if (apiResponse.url) return apiResponse.url;
    return null;
}

document.addEventListener('DOMContentLoaded', function() {
    updateApiKeyDisplay();
});
