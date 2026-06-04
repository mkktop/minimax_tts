/**
 * 共享 API Key 管理模块
 * 所有页面统一使用此模块管理 API Key
 * 现已对接服务端 session，API Key 存储在服务端
 */

const API_KEY_STORAGE = 'minimax_tts_api_key';

/**
 * 获取 API Key
 * 已登录时返回占位符，由服务端从 session 中获取真实 key
 * 即使没设置 API Key 也返回占位符（弹窗推迟到真正调用 API 时）
 */
function getApiKey() {
    // 已登录就返回占位符，服务端从 session 取真实 key
    if (window.currentUser) {
        return '__session__';
    }
    // 未登录时检查 localStorage 兼容（迁移前）
    return localStorage.getItem(API_KEY_STORAGE) || '';
}

/**
 * 设置 API Key（保存到服务端）
 */
async function setApiKey(key) {
    if (key) {
        try {
            const res = await fetch('/api/auth/apikey', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (data.success) {
                window.hasApiKey = true;
                localStorage.removeItem(API_KEY_STORAGE);
            }
        } catch (err) {
            console.error('[API Key] 保存到服务端失败:', err);
            localStorage.setItem(API_KEY_STORAGE, key);
        }
    } else {
        try {
            await fetch('/api/auth/apikey', {
                method: 'DELETE',
                credentials: 'include'
            });
            window.hasApiKey = false;
        } catch (err) {
            console.error('[API Key] 删除失败:', err);
        }
        localStorage.removeItem(API_KEY_STORAGE);
    }
    updateApiKeyDisplay();
}

/**
 * 更新 API Key 显示状态
 */
function updateApiKeyDisplay() {
    const display = document.getElementById('apiKeyDisplay');
    if (!display) return;

    if (window.currentUser && window.hasApiKey) {
        display.textContent = 'API Key 已设置 ✓';
        display.classList.add('set');
    } else if (window.currentUser && !window.hasApiKey) {
        display.textContent = '未设置 API Key';
        display.classList.remove('set');
    } else {
        display.textContent = '未设置 API Key';
        display.classList.remove('set');
    }
}

/**
 * 显示 API Key 设置弹窗
 */
function showApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('apiKeyInput');
    if (!modal || !input) return;
    input.value = '';
    modal.classList.remove('hidden');
}

/**
 * 隐藏 API Key 设置弹窗
 */
function hideApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 保存 API Key（从弹窗）
 */
async function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (!input) return;
    const key = input.value.trim();
    if (key) {
        await setApiKey(key);
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

/**
 * 检查是否可以调用 API（在真正调用 API 前调用）
 * 返回 true 表示可以继续，false 表示需要设置
 */
function ensureApiKey() {
    if (!window.currentUser) {
        showLoginModal();
        return false;
    }
    if (!window.hasApiKey) {
        showApiKeyModal();
        return false;
    }
    return true;
}

/**
 * 初始化 — 不再自动弹 API Key 弹窗，只更新显示
 */
function initApiKey() {
    updateApiKeyDisplay();
}
