/**
 * 前端认证模块 — 登录/注册弹窗 + 认证状态管理
 * 所有页面统一使用此模块管理用户登录状态
 */

// 全局认证状态
window.currentUser = null;
window.authChecked = false;

/**
 * 检查当前登录状态
 */
async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
            window.currentUser = data.user;
            window.hasApiKey = data.hasApiKey;
            showAuthenticatedUI(data.user, data.hasApiKey);
            // 尝试迁移 localStorage 中的旧 API Key
            await migrateLocalApiKey();
        } else {
            window.currentUser = null;
            window.hasApiKey = false;
            showGuestUI();
        }
        window.authChecked = true;
        // 通知其他模块认证状态已就绪
        window.dispatchEvent(new CustomEvent('authChanged', {
            detail: { authenticated: !!data.authenticated, user: window.currentUser }
        }));
    } catch (err) {
        console.error('[Auth] 检查登录状态失败:', err);
        window.currentUser = null;
        window.authChecked = true;
        showGuestUI();
        window.dispatchEvent(new CustomEvent('authChanged', {
            detail: { authenticated: false }
        }));
    }
}

/**
 * 显示已登录 UI
 */
function showAuthenticatedUI(user, hasApiKey) {
    const authSection = document.getElementById('authSection');
    const loginSection = document.getElementById('loginSection');
    const userDisplay = document.getElementById('userDisplay');

    // 用 style.display 直接控制，更可靠
    if (authSection) authSection.style.display = 'flex';
    if (loginSection) loginSection.style.display = 'none';

    if (userDisplay) {
        userDisplay.textContent = user.username;
    }

    // 更新设置按钮的提示文字
    const settingsBtn = authSection ? authSection.querySelector('.btn-icon') : null;
    if (settingsBtn) {
        settingsBtn.title = hasApiKey ? 'API Key 已设置，点击修改' : '设置 API Key';
        settingsBtn.style.opacity = hasApiKey ? '0.6' : '1';
    }
}

/**
 * 显示未登录 UI
 */
function showGuestUI() {
    const authSection = document.getElementById('authSection');
    const apiKeySection = document.getElementById('apiKeySection');
    const loginSection = document.getElementById('loginSection');

    if (authSection) authSection.style.display = 'none';
    if (apiKeySection) apiKeySection.style.display = 'none';
    if (loginSection) loginSection.style.display = 'flex';
}

/**
 * 迁移 localStorage 中的旧 API Key 到服务端
 */
async function migrateLocalApiKey() {
    const oldKey = localStorage.getItem('minimax_tts_api_key');
    if (!oldKey) return;

    try {
        const res = await fetch('/api/auth/apikey', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ apiKey: oldKey })
        });
        if (res.ok) {
            localStorage.removeItem('minimax_tts_api_key');
            window.hasApiKey = true;
            if (typeof showToast === 'function') {
                showToast('API Key 已安全保存到您的账户', 'success');
            }
            showAuthenticatedUI(window.currentUser, true);
        }
    } catch (err) {
        console.error('[Auth] API Key 迁移失败:', err);
    }
}

// ============ 登录/注册弹窗 ============

/**
 * 显示登录弹窗
 */
function showLoginModal() {
    let modal = document.getElementById('loginModal');
    if (!modal) {
        createLoginModal();
        modal = document.getElementById('loginModal');
    }
    modal.classList.remove('hidden');
    switchLoginTab('login');
    setTimeout(() => {
        const input = document.getElementById('loginUsername');
        if (input) input.focus();
    }, 100);
}

/**
 * 隐藏登录弹窗
 */
function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.add('hidden');
}

/**
 * 创建登录弹窗 DOM
 */
function createLoginModal() {
    const modal = document.createElement('div');
    modal.id = 'loginModal';
    modal.className = 'login-modal hidden';
    modal.innerHTML = `
        <div class="login-modal-overlay" onclick="hideLoginModal()"></div>
        <div class="login-modal-content">
            <button class="login-modal-close" onclick="hideLoginModal()">&#10005;</button>
            <h2 class="login-modal-title">&#127908; MiniMax Studio</h2>
            <div class="login-tabs">
                <button class="login-tab active" data-tab="login" onclick="switchLoginTab('login')">登录</button>
                <button class="login-tab" data-tab="register" onclick="switchLoginTab('register')">注册</button>
            </div>
            <div id="loginError" class="login-error hidden"></div>
            <form id="loginForm" class="login-form" onsubmit="handleLogin(event)">
                <div class="login-field">
                    <label for="loginUsername">用户名</label>
                    <input type="text" id="loginUsername" placeholder="请输入用户名" autocomplete="username" required>
                </div>
                <div class="login-field">
                    <label for="loginPassword">密码</label>
                    <input type="password" id="loginPassword" placeholder="请输入密码" autocomplete="current-password" required>
                </div>
                <button type="submit" class="login-submit" id="loginSubmitBtn">登录</button>
            </form>
            <form id="registerForm" class="login-form hidden" onsubmit="handleRegister(event)">
                <div class="login-field">
                    <label for="regUsername">用户名</label>
                    <input type="text" id="regUsername" placeholder="3-30 位字母、数字、下划线或中文" autocomplete="username" required>
                </div>
                <div class="login-field">
                    <label for="regPassword">密码</label>
                    <input type="password" id="regPassword" placeholder="至少 6 个字符" autocomplete="new-password" required>
                </div>
                <div class="login-field">
                    <label for="regPassword2">确认密码</label>
                    <input type="password" id="regPassword2" placeholder="再次输入密码" autocomplete="new-password" required>
                </div>
                <button type="submit" class="login-submit" id="registerSubmitBtn">注册</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
}

/**
 * 切换登录/注册 Tab
 */
function switchLoginTab(tab) {
    const tabs = document.querySelectorAll('.login-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const error = document.getElementById('loginError');
    if (loginForm) loginForm.classList.toggle('hidden', tab !== 'login');
    if (registerForm) registerForm.classList.toggle('hidden', tab !== 'register');
    if (error) error.classList.add('hidden');
}

/**
 * 显示错误信息
 */
function showLoginError(msg) {
    const error = document.getElementById('loginError');
    if (error) {
        error.textContent = msg;
        error.classList.remove('hidden');
    }
}

/**
 * 处理登录
 */
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '登录中...';

    try {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            showLoginError('请填写用户名和密码');
            return;
        }

        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            window.currentUser = data.user;
            window.hasApiKey = data.hasApiKey;
            hideLoginModal();
            showAuthenticatedUI(data.user, data.hasApiKey);
            await migrateLocalApiKey();
            if (typeof showToast === 'function') {
                showToast('欢迎回来，' + data.user.username + '！', 'success');
            }
            window.dispatchEvent(new CustomEvent('authChanged', { detail: data }));
        } else {
            showLoginError(data.error || '登录失败');
        }
    } catch (err) {
        showLoginError('网络错误，请稍后重试');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/**
 * 处理注册
 */
async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('registerSubmitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '注册中...';

    try {
        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;
        const password2 = document.getElementById('regPassword2').value;

        if (!username || !password) {
            showLoginError('请填写用户名和密码');
            return;
        }
        if (password !== password2) {
            showLoginError('两次密码输入不一致');
            return;
        }

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            window.currentUser = data.user;
            window.hasApiKey = false;
            hideLoginModal();
            showAuthenticatedUI(data.user, false);
            if (typeof showToast === 'function') {
                showToast('注册成功！请设置 API Key 开始使用', 'success');
            }
            // 注册后自动弹出 API Key 设置
            if (typeof showApiKeyModal === 'function') {
                setTimeout(() => showApiKeyModal(), 500);
            }
            window.dispatchEvent(new CustomEvent('authChanged', { detail: data }));
        } else {
            showLoginError(data.error || '注册失败');
        }
    } catch (err) {
        showLoginError('网络错误，请稍后重试');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

/**
 * 登出
 */
async function logout() {
    // 先更新 UI，不管 fetch 是否成功
    window.currentUser = null;
    window.hasApiKey = false;
    showGuestUI();

    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) {
        console.error('[Auth] 登出请求失败:', err);
    }

    if (typeof showToast === 'function') {
        showToast('已退出登录', 'success');
    }
    window.dispatchEvent(new CustomEvent('authChanged', { detail: { authenticated: false } }));
}

// ============ DOMContentLoaded ============
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
});
