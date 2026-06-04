/**
 * 认证中间件
 * - requireAuth: 必须登录且已设置 API Key
 * - optionalAuth: 可选登录（用于首页等公开页面）
 */

const db = require('../db/database');

/**
 * 从 Cookie header 中解析 session ID
 */
function parseSessionCookie(cookieHeader, cookieName) {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(new RegExp(`${cookieName}=([^;\\s]+)`));
    return match ? match[1] : null;
}

/**
 * 必须登录 + 必须已设置 API Key
 * 替代旧的 validateApiKey 中间件
 */
async function requireAuth(req, res, next) {
    try {
        // 1. 检查 session
        if (!req.session || !req.session.userId) {
            return res.status(401).json({
                success: false,
                error: '请先登录',
                code: 'AUTH_REQUIRED'
            });
        }

        // 2. 从数据库获取用户 API Key
        const apiKey = await db.getUserApiKey(req.session.userId);
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: '请先设置 API Key',
                code: 'APIKEY_REQUIRED'
            });
        }

        // 3. 注入 API Key 供后续路由使用
        req.apiKey = apiKey;
        req.userId = req.session.userId;
        next();
    } catch (err) {
        console.error('[Auth] requireAuth 错误:', err);
        res.status(500).json({ success: false, error: '服务器错误' });
    }
}

/**
 * 可选认证 — 不强制要求登录
 * 如果已登录，注入 userId 和 apiKey
 */
async function optionalAuth(req, res, next) {
    try {
        if (req.session && req.session.userId) {
            req.userId = req.session.userId;
            req.apiKey = await db.getUserApiKey(req.session.userId);
        }
        next();
    } catch (err) {
        // 不阻断请求
        next();
    }
}

/**
 * 仅要求登录（不检查 API Key）
 * 用于 /api/auth/apikey 等接口
 */
async function requireLogin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            success: false,
            error: '请先登录',
            code: 'AUTH_REQUIRED'
        });
    }
    req.userId = req.session.userId;
    next();
}

/**
 * WebSocket 升级时的认证
 * 从 Cookie 中解析 session，验证用户并获取 API Key
 */
async function authenticateWebSocket(request) {
    const cookieName = process.env.SESSION_COOKIE_NAME || 'minimax.sid';
    const cookieHeader = request.headers.cookie;
    const sid = parseSessionCookie(cookieHeader, cookieName);

    if (!sid) {
        return { authenticated: false, error: 'No session cookie' };
    }

    // decode SID (express-session 使用 base64 编码的 sid 前缀 + session ID)
    // express-session 的 connect.sid 格式: "s%3A<sessionId>.<signature>"
    // 我们需要提取 <sessionId> 部分
    const decodedSid = decodeURIComponent(sid);
    const sidParts = decodedSid.split('.');
    const rawSid = sidParts[0].replace(/^s:/, '');

    const sessionData = await db.getSession(rawSid);
    if (!sessionData || !sessionData.userId) {
        return { authenticated: false, error: 'Invalid or expired session' };
    }

    const apiKey = await db.getUserApiKey(sessionData.userId);
    if (!apiKey) {
        return { authenticated: false, error: 'API Key not set' };
    }

    return {
        authenticated: true,
        userId: sessionData.userId,
        apiKey: apiKey
    };
}

module.exports = {
    requireAuth,
    optionalAuth,
    requireLogin,
    authenticateWebSocket
};
