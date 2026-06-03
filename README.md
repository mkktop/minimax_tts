# MiniMax Studio

基于 MiniMax 多模态 API 的现代化 Web 工作室，集成**语音合成 / 图像生成 / 音乐创作**三大模块，本地化、零依赖、开箱即用。

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
├── index.html              # 主页（三大模块入口）
├── tts/                    # 语音生成模块
│   ├── index.html          #   子首页
│   ├── streaming.html      #   同步合成（WebSocket 流式）
│   ├── http.html           #   同步合成（HTTP）
│   ├── async.html          #   异步合成（≤5万字符）
│   ├── clone.html          #   音色复刻
│   └── voice-design.html   #   音色设计（文字描述生成）
├── image/                  # 图像生成模块
│   ├── index.html          #   子首页
│   └── generate.html       #   文生图 / 图生图
├── music/                  # 音乐生成模块
│   ├── index.html          #   子首页
│   ├── generate.html       #   音乐生成
│   ├── lyrics.html         #   AI 作词
│   └── cover.html          #   歌曲翻唱
├── js/                     # 前端逻辑
│   ├── streaming.js        #   WebSocket 流式
│   ├── http.js             #   HTTP 合成
│   ├── async.js            #   异步合成
│   ├── clone.js            #   音色复刻
│   ├── voice-design.js     #   音色设计
│   ├── voice-library.js    #   音色库 + 自定义音色管理
│   ├── image.js            #   图像生成
│   ├── music.js            #   音乐生成
│   └── custom-select.js    #   自定义下拉选择器
├── css/
│   ├── style.css           # 全局样式
│   ├── home.css            # 子首页样式
│   ├── hero.css            # 主页轮播/模块卡片
│   └── subhome.css         # 模块子首页样式
├── backend/
│   └── server.js           # Express 后端 + WebSocket 代理
├── scripts/
│   └── generate-images.js  # AI 配图生成
└── package.json
```

## ✨ 功能矩阵

### 🎙️ 语音生成（6 个子页面）

| 子页面 | 后端 API | 主要功能 |
|---|---|---|
| 同步合成（WebSocket） | `wss://api.minimaxi.com/ws/v1/t2a_v2`（通过后端代理） | 流式 hex 音频拼接，边收边播 |
| 同步合成（HTTP） | `POST /v1/t2a_v2` | 完整音频一次返回（≤10,000 字符） |
| 异步合成 | `POST /v1/t2a_async_v2` | 长文本（≤50,000 字符）+ 字幕时间戳 |
| 音色复刻 | `POST /v1/voice_clone` | 上传 10s-5min 音频克隆（含示例音频） |
| 音色设计 | `POST /v1/voice_design` | 文字描述生成专属音色 |
| 音色管理 | `POST /v1/get_voice` / `/v1/delete_voice` | 查询/删除自定义音色 |

**全部支持的高级参数**：语速、音调、音量、情绪（9 种）、语言增强（40+ 语种）、发音字典、声音效果器、比特率、采样率、7 种音频格式、声道、AIGC 水印、字幕、连续推理…

### 🎨 图像生成

- **模型**：image-01（8 种宽高比）/ image-01-live（带画风，4 种）
- **功能**：文生图 / 图生图（人物参考 subject_reference）
- **批量**：1-9 张 / 次
- **参数**：prompt（≤1500 字符）、seed、prompt_optimizer、AIGC 水印
- **后端 API**：`POST /v1/image_generation`

### 🎵 音乐生成

- **音乐生成**（music-2.6 / music-2.6-free）
  - prompt + 歌词 → 完整歌曲
  - 歌词 ≤3500 字符（-free ≤1000）
  - 纯音乐 / 人声两种模式
  - 30-90 秒出歌
- **AI 作词**（POST `/v1/lyrics_generation`）
  - `write_full_song`：一句话生成完整歌曲（含段落结构）
  - `edit`：基于已有歌词编辑 / 续写
- **歌曲翻唱**（POST `/v1/music_cover_preprocess` + `/v1/music_generation`）
  - 一步翻唱：URL + 风格 → 自动提取歌词
  - 两步翻唱：提取特征 → 修改歌词 → 生成

## 📡 后端 API 端点

| 方法 | 端点 | 代理到 | 说明 |
|---|---|---|---|
| POST | `/api/tts/http` | `/v1/t2a_v2` | 同步 HTTP 合成 |
| WS | `/ws/tts` | `wss://api.minimaxi.com/ws/v1/t2a_v2` | WebSocket 流式 |
| POST | `/api/tts/async/create` | `/v1/t2a_async_v2` | 创建异步任务 |
| GET | `/api/tts/async/query` | `/v1/query/t2a_async_query_v2` | 查询任务状态 |
| GET | `/api/tts/async/download` | `/v1/files/retrieve_content` | 下载异步结果 |
| POST | `/api/clone/upload` | `/v1/files/upload` (purpose: voice_clone) | 上传克隆音频 |
| POST | `/api/clone/prompt` | `/v1/files/upload` (purpose: prompt_audio) | 上传示例音频 |
| POST | `/api/clone/execute` | `/v1/voice_clone` | 执行音色克隆 |
| POST | `/api/voice/design` | `/v1/voice_design` | 音色设计 |
| POST | `/api/voice/list` | `/v1/get_voice` | 查询账号音色 |
| POST | `/api/voice/delete` | `/v1/delete_voice` | 删除自定义音色 |
| POST | `/api/image/generate` | `/v1/image_generation` | 图像生成 |
| POST | `/api/music/generate` | `/v1/music_generation` | 音乐生成 |
| POST | `/api/music/lyrics` | `/v1/lyrics_generation` | 歌词生成 |
| POST | `/api/music/cover/preprocess` | `/v1/music_cover_preprocess` | 翻唱预处理 |
| POST | `/api/files/upload` | `/v1/files/upload` | 通用文件上传 |
| GET | `/api/voices` | — | 返回静态音色数据 |
| GET | `/api/languages` | — | 返回语言列表 |

所有端点（除 `/`、`/api/voices`、`/api/languages`）均需 `x-api-key` 请求头或 WebSocket `?token=` 参数。

## 🎯 关键技术特性

- **WebSocket 代理**：浏览器无法直连 wss://，后端用 `ws` 库代理转发，客户端 API Key 通过 `?token=` 注入
- **hex 音频解码**：MiniMax 流式返回 hex 编码音频，前端逐 chunk 拼接 → Blob → ObjectURL 播放
- **设置持久化**：所有 TTS 页面的模型/参数/文本通过 `localStorage` 保存，关闭浏览器后保留
- **远程音色缓存**：账号下的复刻/设计音色自动加载到「我的音色」分组，可删除
- **文件时长校验**：克隆音频/示例音频上传前用 HTML5 Audio API 解码校验时长
- **降噪/音量归一化**：可选的克隆前处理参数
- **AIGC 水印**：音频末尾节奏标识
- **跨模块导航**：所有 9 个子页面互相可达

## 🎨 AI 配图生成

```bash
# 设置 API Key（Windows）
set MINIMAX_API_KEY=你的密钥

# 生成图片
npm run generate-images
```

## 🛠️ 技术栈

- **前端**：纯 HTML + CSS + JavaScript（无构建工具）
- **后端**：Node.js + Express
- **WebSocket**：`ws` 库（双向代理）
- **上传处理**：Multer
- **HTTP 客户端**：Axios
- **API 代理**：保护 API Key 安全，浏览器不直连 MiniMax

## 📝 文档对齐

所有功能均按 MiniMax 官方 OpenAPI 文档实现，包括：
- 同步语音合成 HTTP / WebSocket（8 个模型 + 全高级参数）
- 异步语音合成（含 file_id 输入）
- 音色快速复刻（clone + prompt + noise reduction + volume normalization）
- 音色设计（prompt + preview_text）
- 查询/删除可用音色
- 音乐生成（music-2.6 + music-cover 系列）
- 歌词生成（write_full_song + edit）
- 翻唱前处理
- 图像生成（image-01 + image-01-live + subject_reference）
