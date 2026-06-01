# MiniMax TTS 语音合成器

基于 MiniMax 语音 API 的现代化 Web 界面，支持同步/异步合成和音色复刻。

## 🚀 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动服务
npm start

# 3. 打开浏览器
# 访问 http://localhost:3000
```

## 📁 项目结构

```
minimax-tts/
├── index.html          # 首页（功能选择）
├── streaming.html      # 同步合成（流式）
├── http.html           # 同步合成（HTTP）
├── async.html          # 异步合成（长文本）
├── clone.html          # 音色复刻
├── css/
│   ├── style.css       # 全局样式
│   └── home.css        # 首页样式
├── js/
│   ├── streaming.js    # 流式合成
│   ├── http.js         # HTTP合成
│   ├── async.js        # 异步合成
│   └── clone.js        # 音色复刻
├── backend/
│   └── server.js       # Express 后端
├── scripts/
│   └── generate-images.js  # AI 配图生成
└── package.json
```

## ✨ 功能特点

| 功能 | 说明 |
|-----|-----|
| 🎤 同步合成（流式） | 边合成边播放，低延迟 |
| 📡 同步合成（HTTP） | 完整音频一次返回 |
| ⏳ 异步合成 | 长文本（≤10万字符）+ 字幕时间戳 |
| 🎭 音色复刻 | 上传音频克隆专属音色 |
| 🎵 327+ 预设音色 | 支持 40 种语言 |
| ⚙️ 高级参数 | 语速/音调/音量/采样率等 |

## 📡 API 接口（后端代理）

| 方法 | 端点 | 说明 |
|-----|------|------|
| POST | `/api/tts/http` | 同步合成 HTTP |
| POST | `/api/tts/async/create` | 创建异步任务 |
| GET | `/api/tts/async/query` | 查询任务状态 |
| GET | `/api/tts/async/download` | 下载音频 |
| POST | `/api/tts/websocket/token` | WebSocket Token 验证 |
| POST | `/api/files/upload` | 通用文件上传 |
| POST | `/api/clone/upload` | 上传克隆音频 |
| POST | `/api/clone/prompt` | 上传示例音频 |
| POST | `/api/clone/execute` | 执行音色克隆 |
| POST | `/api/image/generate` | 图片生成 |
| GET | `/api/voices` | 获取音色列表 |

## 🎨 AI 配图生成

```bash
# 设置 API Key（Windows）
set MINIMAX_API_KEY=你的密钥

# 生成图片
npm run generate-images
```

## ⚠️ 重要说明

### 1. AI 配图
- 默认未生成 AI 配图（需要 `MINIMAX_API_KEY` 环境变量）
- 配图脚本位于 `scripts/generate-images.js`
- 可以手动添加图片到 `images/` 目录

### 2. API 接口
- 全部基于你提供的 4 份文档（同步/异步合成、音色复刻、系统音色、图片生成）
- 官方接口已完整实现，包括 WebSocket Token 验证
- **未独立搜索官网验证**（开发环境无法访问外网），基于文档内容实现

### 3. WebSocket 流式合成
- 浏览器原生 WebSocket 可直连 `wss://api.minimaxi.com/ws/v1/t2a_v2`
- 后端提供 Token 验证，避免暴露 API Key

## 🎯 使用流程

1. 启动服务后访问 `http://localhost:3000`
2. 点击右上角「设置」输入 API Key
3. 选择对应功能（同步合成/异步合成/音色复刻）
4. 配置参数并提交

## 🛠️ 技术栈

- **前端**：纯 HTML + CSS + JavaScript
- **后端**：Node.js + Express
- **上传处理**：Multer
- **HTTP 客户端**：Axios
- **API 代理**：保护 API Key 安全
