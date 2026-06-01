#!/bin/bash
# ============================================
# MiniMax TTS 服务器初始化脚本
# 在 Ubuntu/Debian VPS 上运行此脚本
# 用法: bash deploy-setup.sh <git-repo-url> [deploy-path]
# 示例: bash deploy-setup.sh https://github.com/yourname/minimax_tts.git
# ============================================

set -e

REPO_URL="${1:?用法: bash deploy-setup.sh <git-repo-url> [deploy-path]}"
DEPLOY_PATH="${2:-$HOME/minimax_tts}"

echo "========================================"
echo "  MiniMax TTS 服务器初始化"
echo "========================================"
echo ""
echo "仓库地址: $REPO_URL"
echo "部署路径: $DEPLOY_PATH"
echo ""

# 1. 更新系统
echo ">>> [1/6] 更新系统包..."
sudo apt-get update -y

# 2. 安装 Node.js 20.x (via NodeSource)
echo ">>> [2/6] 安装 Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node.js 版本: $(node -v)"
echo "npm 版本: $(npm -v)"

# 3. 安装 PM2
echo ">>> [3/6] 安装 PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi
echo "PM2 版本: $(pm2 -v)"

# 4. 安装 Git
echo ">>> [4/6] 确保 Git 已安装..."
sudo apt-get install -y git

# 5. Clone 仓库
echo ">>> [5/6] 克隆项目..."
if [ -d "$DEPLOY_PATH" ]; then
    echo "目录已存在，跳过克隆"
else
    git clone "$REPO_URL" "$DEPLOY_PATH"
fi
cd "$DEPLOY_PATH"

# 安装依赖
echo "安装依赖..."
npm install --production

# 创建日志目录
mkdir -p logs

# 6. 启动应用 & 配置开机自启
echo ">>> [6/6] 启动应用..."
pm2 start ecosystem.config.js
pm2 save

# 配置开机自启
echo ""
echo ">>> 配置 PM2 开机自启..."
pm2 startup systemd -u "$(whoami)" --hp "$HOME"
echo ""
echo "请运行上面提示的 sudo 命令来完成开机自启配置。"
echo ""

# 开放防火墙端口
echo ">>> 配置防火墙..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 3000/tcp
    echo "已开放 3000 端口"
else
    echo "ufw 未安装，请手动开放 3000 端口"
fi

echo ""
echo "========================================"
echo "  ✅ 部署完成！"
echo "========================================"
echo ""
echo "  访问地址: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "  常用命令:"
echo "    pm2 status          # 查看状态"
echo "    pm2 logs minimax-tts  # 查看日志"
echo "    pm2 restart minimax-tts # 重启"
echo "    pm2 stop minimax-tts    # 停止"
echo ""
