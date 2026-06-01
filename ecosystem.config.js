module.exports = {
  apps: [{
    name: 'minimax-tts',
    script: 'backend/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 实例数量，可根据 CPU 核心数调整
    instances: 1,
    // 自动重启
    autorestart: true,
    // 监听文件变化（生产环境建议关闭）
    watch: false,
    // 最大内存限制，超过自动重启
    max_memory_restart: '256M',
    // 日志配置
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // 优雅退出
    kill_timeout: 5000,
    listen_timeout: 10000,
  }]
};
