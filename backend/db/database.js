/**
 * MySQL 数据库连接与辅助函数
 * 表名统一使用 minimax_ 前缀
 */

const mysql = require('mysql2/promise');

// 从环境变量读取配置，提供默认值
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'minimax_studio'
};

let pool = null;

/**
 * 获取连接池（懒初始化）
 */
async function getPool() {
    if (pool) return pool;
    pool = mysql.createPool({
        ...DB_CONFIG,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4'
    });
    // 测试连接
    try {
        const conn = await pool.getConnection();
        console.log(`[DB] MySQL 连接成功: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
        conn.release();
    } catch (err) {
        console.error('[DB] MySQL 连接失败:', err.message);
        throw err;
    }
    return pool;
}

/**
 * 初始化数据库表（启动时调用）
 */
async function initTables() {
    const db = await getPool();

    await db.execute(`
        CREATE TABLE IF NOT EXISTS minimax_users (
            id            VARCHAR(36) PRIMARY KEY,
            username      VARCHAR(30) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            api_key       TEXT,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS minimax_sessions (
            sid     VARCHAR(255) PRIMARY KEY,
            expired BIGINT NOT NULL,
            sess    TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS minimax_resources (
            id         VARCHAR(36) PRIMARY KEY,
            user_id    VARCHAR(36) NOT NULL,
            type       ENUM('tts','image','music') NOT NULL,
            model      VARCHAR(100),
            prompt     TEXT,
            voice_id   VARCHAR(100),
            params     TEXT,
            file_data  MEDIUMBLOB,
            file_size  INT,
            format     VARCHAR(20),
            duration   FLOAT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES minimax_users(id) ON DELETE CASCADE,
            INDEX idx_user_type (user_id, type),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('[DB] 数据表初始化完成');
}

// ============ 用户操作 ============

/**
 * 根据 ID 查找用户
 */
async function getUserById(id) {
    const db = await getPool();
    const [rows] = await db.execute('SELECT * FROM minimax_users WHERE id = ?', [id]);
    return rows[0] || null;
}

/**
 * 根据用户名查找用户
 */
async function getUserByUsername(username) {
    const db = await getPool();
    const [rows] = await db.execute('SELECT * FROM minimax_users WHERE username = ?', [username]);
    return rows[0] || null;
}

/**
 * 创建新用户
 */
async function createUser(id, username, passwordHash) {
    const db = await getPool();
    await db.execute(
        'INSERT INTO minimax_users (id, username, password_hash) VALUES (?, ?, ?)',
        [id, username, passwordHash]
    );
    return getUserById(id);
}

/**
 * 更新用户 API Key
 */
async function updateUserApiKey(userId, apiKey) {
    const db = await getPool();
    await db.execute(
        'UPDATE minimax_users SET api_key = ? WHERE id = ?',
        [apiKey || null, userId]
    );
}

/**
 * 获取用户 API Key
 */
async function getUserApiKey(userId) {
    const db = await getPool();
    const [rows] = await db.execute('SELECT api_key FROM minimax_users WHERE id = ?', [userId]);
    return rows[0]?.api_key || null;
}

// ============ Session 操作 ============

/**
 * 获取 session
 */
async function getSession(sid) {
    const db = await getPool();
    const [rows] = await db.execute(
        'SELECT sess, expired FROM minimax_sessions WHERE sid = ?',
        [sid]
    );
    if (!rows[0]) return null;
    if (rows[0].expired < Date.now()) {
        // 已过期，清理
        await db.execute('DELETE FROM minimax_sessions WHERE sid = ?', [sid]);
        return null;
    }
    return JSON.parse(rows[0].sess);
}

/**
 * 设置 session
 */
async function setSession(sid, sessionData, ttlMs) {
    const db = await getPool();
    const expired = Date.now() + (ttlMs || 86400000); // 默认 24h
    const sess = JSON.stringify(sessionData);
    await db.execute(
        'INSERT INTO minimax_sessions (sid, expired, sess) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sess = ?, expired = ?',
        [sid, expired, sess, sess, expired]
    );
}

/**
 * 销毁 session
 */
async function destroySession(sid) {
    const db = await getPool();
    await db.execute('DELETE FROM minimax_sessions WHERE sid = ?', [sid]);
}

/**
 * 清理过期 session
 */
async function cleanupSessions() {
    const db = await getPool();
    const [result] = await db.execute(
        'DELETE FROM minimax_sessions WHERE expired < ?',
        [Date.now()]
    );
    if (result.affectedRows > 0) {
        console.log(`[DB] 清理了 ${result.affectedRows} 个过期 session`);
    }
}

// ============ 资源操作 ============

/**
 * 保存资源到数据库
 * @param {object} params - 资源参数
 * @param {string} params.id - UUID
 * @param {string} params.userId - 用户 ID
 * @param {string} params.type - tts/image/music
 * @param {Buffer} params.fileData - 文件二进制数据
 * @param {object} params.meta - 元数据
 */
async function saveResource({ id, userId, type, fileData, meta }) {
    const db = await getPool();
    await db.execute(
        `INSERT INTO minimax_resources
         (id, user_id, type, model, prompt, voice_id, params, file_data, file_size, format, duration)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            userId,
            type,
            meta.model || null,
            meta.prompt || null,
            meta.voiceId || null,
            meta.params ? JSON.stringify(meta.params) : null,
            fileData,
            fileData ? fileData.length : 0,
            meta.format || null,
            meta.duration || null
        ]
    );
}

/**
 * 获取用户资源列表（不含文件数据）
 */
async function listResources(userId, type, limit = 20, offset = 0) {
    const db = await getPool();
    let sql = 'SELECT id, user_id, type, model, prompt, voice_id, params, file_size, format, duration, created_at FROM minimax_resources WHERE user_id = ?';
    const params = [userId];
    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }
    // LIMIT/OFFSET 直接拼接（已确保是整数），避免 prepared statement 不兼容
    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`;
    const [rows] = await db.execute(sql, params);
    // 解析 params JSON
    return rows.map(r => {
        try { r.params = JSON.parse(r.params); } catch {}
        return r;
    });
}

/**
 * 获取单个资源（含文件数据）
 */
async function getResource(id, userId) {
    const db = await getPool();
    const sql = userId
        ? 'SELECT * FROM minimax_resources WHERE id = ? AND user_id = ?'
        : 'SELECT * FROM minimax_resources WHERE id = ?';
    const params = userId ? [id, userId] : [id];
    const [rows] = await db.execute(sql, params);
    return rows[0] || null;
}

/**
 * 删除资源
 */
async function deleteResource(id, userId) {
    const db = await getPool();
    const [result] = await db.execute(
        'DELETE FROM minimax_resources WHERE id = ? AND user_id = ?',
        [id, userId]
    );
    return result.affectedRows > 0;
}

/**
 * 清理超过 N 天的资源
 */
async function cleanupExpiredResources(days = 7) {
    const db = await getPool();
    const [result] = await db.execute(
        'DELETE FROM minimax_resources WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [days]
    );
    if (result.affectedRows > 0) {
        console.log(`[DB] 清理了 ${result.affectedRows} 个超过 ${days} 天的资源`);
    }
    return result.affectedRows;
}

module.exports = {
    getPool,
    initTables,
    getUserById,
    getUserByUsername,
    createUser,
    updateUserApiKey,
    getUserApiKey,
    getSession,
    setSession,
    destroySession,
    cleanupSessions,
    saveResource,
    listResources,
    getResource,
    deleteResource,
    cleanupExpiredResources
};
