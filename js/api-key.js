/**
 * 共享 API Key 管理模块
 * 所有页面统一使用此模块管理 API Key
 * 现已对接服务端 session，API Key 存储在服务端
 */

const API_KEY_STORAGE = 'minimax_tts_api_key';

/**
 * 获取 API Key
 * 已登录时返回占位符，由服务端从 session 中获取真实 key
 * 未登录时返回空（触发登录弹窗）
 */
function getApiKey() {
    // 如果已登录且有服务端 API Key，返回占位符
    if (window.currentUser && window.hasApiKey) {
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
        // 保存到服务端
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
                // 清除旧的 localStorage
                localStorage.removeItem(API_KEY_STORAGE);
            }
        } catch (err) {
            console.error('[API Key] 保存到服务端失败:', err);
            // 回退到 localStorage
            localStorage.setItem(API_KEY_STORAGE, key);
        }
    } else {
        // 删除
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
    // 不回显旧 key（现在存在服务端）
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
 * 初始化 — 已移到 auth.js 的 DOMContentLoaded 中统一处理
 * 保留此函数签名以兼容旧调用
 */
function initApiKey() {
    // auth.js 已在 DOMContentLoaded 中调用 checkAuth()
    // 此函数保留为空以兼容
}
