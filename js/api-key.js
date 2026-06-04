/**
 * 共享 API Key 管理模块
 * 所有页面统一使用此模块管理 API Key
 */

const API_KEY_STORAGE = 'minimax_tts_api_key';

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || '';
}

function setApiKey(key) {
    if (key) {
        localStorage.setItem(API_KEY_STORAGE, key);
    } else {
        localStorage.removeItem(API_KEY_STORAGE);
    }
    updateApiKeyDisplay();
}

function updateApiKeyDisplay() {
    const key = getApiKey();
    const display = document.getElementById('apiKeyDisplay');
    if (!display) return;
    if (key) {
        display.textContent = '****' + key.slice(-6);
        display.classList.add('set');
    } else {
        display.textContent = '未设置 API Key';
        display.classList.remove('set');
    }
}

function showApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('apiKeyInput');
    if (!modal || !input) return;
    input.value = getApiKey();
    modal.classList.remove('hidden');
}

function hideApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    if (modal) modal.classList.add('hidden');
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (!input) return;
    const key = input.value.trim();
    if (key) {
        setApiKey(key);
        hideApiKeyModal();
        if (typeof showToast === 'function') {
            showToast('API Key 保存成功', 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('请输入有效的 API Key', 'error');
        }
    }
}
