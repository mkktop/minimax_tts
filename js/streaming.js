/**
 * 同步合成（流式 WebSocket）- JavaScript
 * 基于 WebSocket 协议实时流式生成音频
 * 协议流程：task_start → task_continue(text) → task_finish
 */

// 音色数据由 voice-library.js 统一提供（VOICE_LIBRARY）

// 状态变量
let mediaSource = null;     // MediaSource instance
let sourceBuffer = null;   // SourceBuffer for audio chunks
let mediaSourceReady = false;
let pendingChunks = [];     // chunks buffered before SourceBuffer is ready
let mimeType = 'audio/mpeg'; // set when format is known
let streamingActive = false;
let audioElement = null;
let isPlaying = false;
let audioBlob = null; // fallback blob for download
let ws = null; // WebSocket 连接
let subtitleEntries = []; // 字幕条目
let startTime = 0;

// ============ 设置持久化 ============
const SETTINGS_KEY = 'minimax_tts_streaming_settings';

function saveSettings() {
    const settings = {
        model: document.querySelector('.model-option.selected')?.dataset.model || 'speech-2.8-hd',
        speed: document.getElementById('speedSlider').value,
        pitch: document.getElementById('pitchSlider').value,
        vol: document.getElementById('volSlider').value,
        sampleRate: document.getElementById('sampleRateSelect').value,
        bitrate: document.getElementById('bitrateSelect').value,
        format: document.getElementById('formatSelect').value,
        channel: document.getElementById('channelSelect').value,
        emotion: document.getElementById('emotionSelect').value,
        languageBoost: document.getElementById('languageBoostSelect').value,
        englishNormalization: document.getElementById('englishNormalization').checked,
        latexRead: document.getElementById('latexRead').checked,
        pronunciation: document.getElementById('pronunciationInput').value,
        modifyPitch: document.getElementById('modifyPitchSlider').value,
        modifyIntensity: document.getElementById('modifyIntensitySlider').value,
        modifyTimbre: document.getElementById('modifyTimbreSlider').value,
        soundEffects: document.getElementById('soundEffectsSelect').value,
        subtitleEnable: document.getElementById('subtitleEnable').checked,
        subtitleType: document.getElementById('subtitleTypeSelect').value,
        continuousSound: document.getElementById('continuousSound').checked,
        text: document.getElementById('textInput').value
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        if (s.model) {
            const opt = document.querySelector(`.model-option[data-model="${s.model}"]`);
            if (opt) {
                document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            }
        }
        if (s.speed != null) { document.getElementById('speedSlider').value = s.speed; document.getElementById('speedValue').textContent = s.speed + 'x'; }
        if (s.pitch != null) { document.getElementById('pitchSlider').value = s.pitch; document.getElementById('pitchValue').textContent = s.pitch; }
        if (s.vol != null) { document.getElementById('volSlider').value = s.vol; document.getElementById('volValue').textContent = s.vol; }
        if (s.sampleRate) document.getElementById('sampleRateSelect').value = s.sampleRate;
        if (s.bitrate) document.getElementById('bitrateSelect').value = s.bitrate;
        if (s.format) document.getElementById('formatSelect').value = s.format;
        if (s.channel) document.getElementById('channelSelect').value = s.channel;
        if (s.emotion != null) document.getElementById('emotionSelect').value = s.emotion;
        if (s.languageBoost != null) document.getElementById('languageBoostSelect').value = s.languageBoost;
        if (s.englishNormalization) document.getElementById('englishNormalization').checked = true;
        if (s.latexRead) document.getElementById('latexRead').checked = true;
        if (s.pronunciation) document.getElementById('pronunciationInput').value = s.pronunciation;
        if (s.modifyPitch != null) { document.getElementById('modifyPitchSlider').value = s.modifyPitch; document.getElementById('modifyPitchValue').textContent = s.modifyPitch; }
        if (s.modifyIntensity != null) { document.getElementById('modifyIntensitySlider').value = s.modifyIntensity; document.getElementById('modifyIntensityValue').textContent = s.modifyIntensity; }
        if (s.modifyTimbre != null) { document.getElementById('modifyTimbreSlider').value = s.modifyTimbre; document.getElementById('modifyTimbreValue').textContent = s.modifyTimbre; }
        if (s.soundEffects != null) document.getElementById('soundEffectsSelect').value = s.soundEffects;
        if (s.subtitleEnable) {
            document.getElementById('subtitleEnable').checked = true;
            document.getElementById('subtitleTypeGroup').style.display = 'block';
        }
        if (s.subtitleType) document.getElementById('subtitleTypeSelect').value = s.subtitleType;
        if (s.continuousSound) document.getElementById('continuousSound').checked = true;
        if (s.text) {
            document.getElementById('textInput').value = s.text;
            document.getElementById('textInput').dispatchEvent(new Event('input'));
        }
    } catch (e) { /* ignore */ }
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initModelSelection();
    initLanguageSelect();
    initSliders();
    initTextInput();
    initAudioPlayer();
    initSubtitleToggle();
    initVoiceModifySliders();
    // 恢复设置
    loadSettings();

    // #6 联动：从异步合成页传入文本
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'async') {
        const ttsText = sessionStorage.getItem('tts_text');
        if (ttsText) {
            document.getElementById('textInput').value = ttsText;
            document.getElementById('textInput').dispatchEvent(new Event('input'));
            sessionStorage.removeItem('tts_text');
            showToast('已从异步合成页导入文本', 'success');
        }
    }

    // 监听变化自动保存
    ['speedSlider','pitchSlider','volSlider','sampleRateSelect','bitrateSelect',
     'formatSelect','channelSelect','emotionSelect','languageBoostSelect',
     'englishNormalization','latexRead','pronunciationInput',
     'modifyPitchSlider','modifyIntensitySlider','modifyTimbreSlider','soundEffectsSelect',
     'subtitleEnable','subtitleTypeSelect','continuousSound','textInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSettings);
        if (el) el.addEventListener('input', () => { clearTimeout(el._saveTimer); el._saveTimer = setTimeout(saveSettings, 500); });
    });
    initResourceHistory('tts-streaming');
});

function initApiKey() {
    updateApiKeyDisplay();
}

// API Key 管理由 api-key.js 统一提供

function initModelSelection() {
    const options = document.querySelectorAll('.model-option');
    options.forEach(opt => {
        opt.addEventListener('click', function() {
            options.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            saveSettings();
        });
    });
}

function initLanguageSelect() {
    // 音色选择逻辑已迁移到 voice-library.js
}

function initSliders() {
    const sliders = [
        { id: 'speedSlider', valueId: 'speedValue', format: v => v + 'x' },
        { id: 'pitchSlider', valueId: 'pitchValue', format: v => v },
        { id: 'volSlider', valueId: 'volValue', format: v => v }
    ];

    sliders.forEach(({ id, valueId, format }) => {
        const slider = document.getElementById(id);
        const valueEl = document.getElementById(valueId);
        slider.addEventListener('input', function() {
            valueEl.textContent = format(this.value);
        });
    });
}

function initVoiceModifySliders() {
    const sliders = [
        { id: 'modifyPitchSlider', valueId: 'modifyPitchValue', format: v => v },
        { id: 'modifyIntensitySlider', valueId: 'modifyIntensityValue', format: v => v },
        { id: 'modifyTimbreSlider', valueId: 'modifyTimbreValue', format: v => v }
    ];

    sliders.forEach(({ id, valueId, format }) => {
        const slider = document.getElementById(id);
        const valueEl = document.getElementById(valueId);
        slider.addEventListener('input', function() {
            valueEl.textContent = format(this.value);
        });
    });
}

function initSubtitleToggle() {
    const checkbox = document.getElementById('subtitleEnable');
    const typeGroup = document.getElementById('subtitleTypeGroup');
    checkbox.addEventListener('change', function() {
        typeGroup.style.display = this.checked ? 'block' : 'none';
    });
}

function initTextInput() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');

    textInput.addEventListener('input', function() {
        const len = this.value.length;
        charCount.textContent = `${len} / 10,000`;
        charCount.style.color = len > 10000 ? 'var(--accent-red)' : 'var(--text-muted)';
    });
}

function initAudioPlayer() {
    audioElement = document.getElementById('audioElement');
    if (!audioElement) return;

    // Set up standard event listeners (timeupdate, ended, click for play/pause)
    audioElement.addEventListener('timeupdate', function() {
        if (!audioElement.duration) return;
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        document.getElementById('audioProgressFill').style.width = progress + '%';
        const current = formatTime(audioElement.currentTime);
        const total = formatTime(audioElement.duration);
        document.getElementById('audioTime').textContent = `${current} / ${total}`;
    });
    audioElement.addEventListener('ended', function() {
        isPlaying = false;
        const btn = document.querySelector('.audio-play-btn');
        if (btn) btn.textContent = '▶';
    });
    audioElement.addEventListener('click', function() { togglePlay(); });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============ MediaSource 流式播放 ============

function initMediaSource(format) {
    if (mediaSource) {
        try { if (sourceBuffer) sourceBuffer.removeEventListener('updateend', flushPendingChunks); } catch(e) {}
        try { mediaSource.endAndClear(); } catch(e) {}
    }
    mediaSource = new MediaSource();
    mimeType = getMimeType(format || 'mp3');

    audioElement.src = URL.createObjectURL(mediaSource);

    return new Promise((resolve, reject) => {
        mediaSource.addEventListener('error', e => reject(e));

        mediaSource.addEventListener('sourceopen', () => {
            try {
                if (MediaSource.isTypeSupported(mimeType)) {
                    sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                } else {
                    // Fallback: mp3 always works
                    mimeType = 'audio/mpeg';
                    if (MediaSource.isTypeSupported(mimeType)) {
                        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                    } else {
                        reject(new Error('MediaSource 不支持此格式'));
                        return;
                    }
                }
                sourceBuffer.addEventListener('updateend', flushPendingChunks);
                sourceBuffer.addEventListener('error', e => reject(e));
                mediaSourceReady = true;
                resolve();
            } catch(e) { reject(e); }
        });

        mediaSource.addEventListener('sourceended', () => { streamingActive = false; });
        mediaSource.addEventListener('sourceclose', () => { streamingActive = false; });
    });
}

function flushPendingChunks() {
    while (pendingChunks.length > 0 && !sourceBuffer.updating) {
        const bytes = pendingChunks.shift();
        if (bytes.byteLength > 0) sourceBuffer.appendBuffer(bytes);
    }
}

function getMimeType(format) {
    const map = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'pcm': 'audio/pcm',
        'opus': 'audio/ogg',
        'pcmu_raw': 'audio/pcm',
        'pcmu_wav': 'audio/wav'
    };
    return map[format] || 'audio/mpeg';
}

function appendChunk(hexString) {
    const bytes = hexToBytes(hexString);
    if (!bytes || bytes.byteLength === 0) return;

    if (streamingActive && sourceBuffer && !sourceBuffer.updating && mediaSourceReady) {
        sourceBuffer.appendBuffer(bytes);
    } else if (streamingActive && sourceBuffer && sourceBuffer.updating) {
        pendingChunks.push(bytes);
    } else if (streamingActive) {
        pendingChunks.push(bytes);
    }
}

function hexToBytes(hex) {
    if (!hex) return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
}

async function streamPlay(format) {
    try {
        await initMediaSource(format);
        streamingActive = true;
        document.getElementById('audioPlayer').classList.remove('hidden');

        // Flush any chunks that arrived before SourceBuffer opened
        flushPendingChunks();

        audioElement.play().catch(e => console.log('Auto-play blocked:', e));
        isPlaying = true;
        const btn = document.querySelector('.audio-play-btn');
        if (btn) btn.textContent = '⏸';

        document.getElementById('statusText').textContent = '边收边播中';
    } catch(e) {
        console.error('[MediaSource] fallback to blob mode:', e);
        // Fallback to blob mode: collect all chunks and play at end
        streamingActive = false;
    }
}

// ============ WebSocket 流式合成核心 ============

async function startSynthesis() {
    if (!ensureApiKey()) {
        return;
    }
    const apiKey = getApiKey();

    const text = document.getElementById('textInput').value.trim();
    if (!text) {
        showToast('请输入要转换的文本', 'error');
        return;
    }

    if (text.length > 10000) {
        showToast('文本不能超过 10,000 字符', 'error');
        return;
    }

    // 收集所有参数
    const model = document.querySelector('.model-option.selected')?.dataset.model || 'speech-2.8-hd';
    const voiceId = window.getSelectedVoiceId ? window.getSelectedVoiceId() : 'male-qn-qingse';
    const speed = parseFloat(document.getElementById('speedSlider').value);
    const pitch = parseInt(document.getElementById('pitchSlider').value);
    const vol = parseFloat(document.getElementById('volSlider').value);
    const sampleRate = parseInt(document.getElementById('sampleRateSelect').value);
    const bitrate = parseInt(document.getElementById('bitrateSelect').value);
    const format = document.getElementById('formatSelect').value;
    const channel = parseInt(document.getElementById('channelSelect').value);
    const emotion = document.getElementById('emotionSelect').value;
    const languageBoost = document.getElementById('languageBoostSelect').value;
    const englishNormalization = document.getElementById('englishNormalization').checked;
    const latexRead = document.getElementById('latexRead').checked;
    const pronunciationText = document.getElementById('pronunciationInput').value.trim();
    const modifyPitch = parseInt(document.getElementById('modifyPitchSlider').value);
    const modifyIntensity = parseInt(document.getElementById('modifyIntensitySlider').value);
    const modifyTimbre = parseInt(document.getElementById('modifyTimbreSlider').value);
    const soundEffects = document.getElementById('soundEffectsSelect').value;
    const subtitleEnable = document.getElementById('subtitleEnable').checked;
    const subtitleType = document.getElementById('subtitleTypeSelect').value;
    const continuousSound = document.getElementById('continuousSound').checked;

    // 解析发音字典
    let pronunciationDict = undefined;
    if (pronunciationText) {
        const tones = pronunciationText.split('\n').map(l => l.trim()).filter(Boolean);
        if (tones.length > 0) {
            pronunciationDict = { tone: tones };
        }
    }

    // 构建 voice_modify（仅在有修改时添加）
    let voiceModify = undefined;
    if (modifyPitch !== 0 || modifyIntensity !== 0 || modifyTimbre !== 0 || soundEffects) {
        voiceModify = {};
        if (modifyPitch !== 0) voiceModify.pitch = modifyPitch;
        if (modifyIntensity !== 0) voiceModify.intensity = modifyIntensity;
        if (modifyTimbre !== 0) voiceModify.timbre = modifyTimbre;
        if (soundEffects) voiceModify.sound_effects = soundEffects;
    }

    // 构建 voice_setting
    const voiceSetting = {
        voice_id: voiceId,
        speed: speed,
        pitch: pitch,
        vol: vol
    };
    if (emotion) voiceSetting.emotion = emotion;
    if (englishNormalization) voiceSetting.english_normalization = true;
    if (latexRead) voiceSetting.latex_read = true;

    // opus 选项：MiniMax 不支持，强制按 16kHz/mono/mp3 流式合成，前端接收完再转码
    const wantOpus = format === 'opus';
    const audioSetting = {
        sample_rate: wantOpus ? 16000 : sampleRate,
        bitrate: bitrate,
        format: wantOpus ? 'mp3' : format,
        channel: wantOpus ? 1 : channel
    };

    // 构建 task_start 消息
    const taskStartMsg = {
        event: 'task_start',
        model: model,
        voice_setting: voiceSetting,
        audio_setting: audioSetting
    };
    if (pronunciationDict) taskStartMsg.pronunciation_dict = pronunciationDict;
    if (languageBoost) taskStartMsg.language_boost = languageBoost;
    if (voiceModify) taskStartMsg.voice_modify = voiceModify;
    if (subtitleEnable) {
        taskStartMsg.subtitle_enable = true;
        taskStartMsg.subtitle_type = subtitleType;
    }
    if (continuousSound) taskStartMsg.continuous_sound = true;

    // UI 状态
    const statusSection = document.getElementById('statusSection');
    statusSection.classList.remove('hidden');
    document.getElementById('streamInfo').classList.remove('hidden');
    updateStatus('processing', '连接中...', '正在建立 WebSocket 连接');
    document.getElementById('chunkCount').textContent = '0';
    document.getElementById('dataSize').textContent = '0 KB';
    document.getElementById('latency').textContent = '-';

    const synthBtn = document.getElementById('synthBtn');
    synthBtn.disabled = true;
    synthBtn.innerHTML = '<span class="spinner"></span> 边收边播中...';

    // 重置
    pendingChunks = [];
    subtitleEntries = [];
    startTime = Date.now();

    try {
        // 连接到后端 WebSocket 代理（session cookie 自动携带）
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${location.host}/ws/tts`;

        await new Promise((resolve, reject) => {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('[WS] 已连接到后端代理');
                updateStatus('processing', '已连接', '发送 task_start...');
                resolve();
            };

            ws.onerror = (err) => {
                reject(new Error('WebSocket 连接失败'));
            };

            ws.onclose = (event) => {
                if (!pendingChunks.length && !streamingActive) {
                    reject(new Error(`连接关闭 (${event.code})`));
                }
            };

            // 设置连接超时
            setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    reject(new Error('连接超时'));
                }
            }, 10000);
        });

        // 监听消息
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleServerMessage(msg);
            } catch (e) {
                console.error('[WS] 解析消息失败:', e);
            }
        };

        ws.onclose = (event) => {
            console.log(`[WS] 连接关闭: ${event.code}`);
        };

        ws.onerror = (err) => {
            console.error('[WS] 错误:', err);
        };

        // 发送 task_start
        updateStatus('processing', '发送参数...', 'task_start');
        streamPlay(format);
        ws.send(JSON.stringify(taskStartMsg));

    } catch (error) {
        console.error('WebSocket error:', error);
        updateStatus('error', '连接失败', error.message);
        showToast('连接失败: ' + error.message, 'error');
        synthBtn.disabled = false;
        synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
    }
}

function handleServerMessage(msg) {
    const synthBtn = document.getElementById('synthBtn');

    switch (msg.event) {
        case 'connected_success':
            console.log('[WS] MiniMax 建连成功, session:', msg.session_id);
            break;

        case 'task_started':
            console.log('[WS] 任务已开始');
            if (msg.base_resp?.status_code === 0) {
                updateStatus('processing', '合成中...', '边收边播中...');
                streamPlay(document.getElementById('formatSelect').value);
                // 发送 task_continue（文本）
                const text = document.getElementById('textInput').value.trim();
                ws.send(JSON.stringify({
                    event: 'task_continue',
                    text: text
                }));
                // 发送 task_finish
                ws.send(JSON.stringify({
                    event: 'task_finish'
                }));
            } else {
                updateStatus('error', '任务启动失败', msg.base_resp?.status_msg || '未知错误');
                synthBtn.disabled = false;
                synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
            }
            break;

        case 'task_continued':
            // 收到音频片段 - 立即播放
            if (msg.data?.audio) {
                appendChunk(msg.data.audio);
                const totalSize = pendingChunks.reduce((sum, bytes) => sum + bytes.byteLength, 0);
                document.getElementById('chunkCount').textContent = pendingChunks.length;
                document.getElementById('dataSize').textContent = (totalSize / 1024).toFixed(1) + ' KB';
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                document.getElementById('latency').textContent = elapsed + 's';
            }

            // 收集字幕信息（如果有）
            if (msg.subtitle) {
                subtitleEntries.push(msg.subtitle);
            }

            // 任务完成
            if (msg.is_final) {
                endStreaming(msg.extra_info);
            }
            break;

        case 'task_finished':
            console.log('[WS] 任务结束');
            break;

        case 'task_failed':
            console.error('[WS] 任务失败:', msg);
            updateStatus('error', '合成失败', msg.base_resp?.status_msg || '未知错误');
            showToast('合成失败: ' + (msg.base_resp?.status_msg || '未知错误'), 'error');
            synthBtn.disabled = false;
            synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
            if (ws) ws.close();
            break;

        case 'proxy_error':
            updateStatus('error', '代理错误', msg.detail || msg.error);
            showToast(msg.error || '代理连接失败', 'error');
            synthBtn.disabled = false;
            synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
            break;

        default:
            console.log('[WS] 未知事件:', msg.event, msg);
    }
}

function finishSynthesis(extraInfo) {
    const synthBtn = document.getElementById('synthBtn');

    if (pendingChunks.length === 0) {
        updateStatus('error', '合成失败', '未收到音频数据');
        synthBtn.disabled = false;
        synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
        return;
    }

    // Fallback: build blob from pendingChunks (already Uint8Array bytes)
    const format = document.getElementById('formatSelect').value;
    mimeType = getMimeType(format);
    audioBlob = new Blob(pendingChunks, { type: mimeType });

    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    // 等待元数据加载
    audioElement.addEventListener('loadedmetadata', function onMeta() {
        audioElement.removeEventListener('loadedmetadata', onMeta);
        document.getElementById('audioPlayer').classList.remove('hidden');
        updateStatus('success', '合成完成', `音频 ${extraInfo?.audio_length ? (extraInfo.audio_length / 1000).toFixed(1) + 's' : ''}，${pendingChunks.length} 片段`);

        // 显示字幕（如果有）
        if (subtitleEntries.length > 0) {
            renderSubtitles();
        }

        // 自动播放
        audioElement.play().catch(err => console.log('Auto-play blocked:', err));
        isPlaying = true;
        document.querySelector('.audio-play-btn').textContent = '⏸';
    }, { once: true });

    synthBtn.disabled = false;
    synthBtn.innerHTML = '🎤 开始合成（WebSocket）';

    // 关闭 WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }

    // 保存音频到数据库
    saveStreamingAudio(extraInfo);
}

/**
 * 保存流式合成音频到数据库
 */
async function saveStreamingAudio(extraInfo) {
    try {
        if (!window.currentUser || pendingChunks.length === 0) return;

        const format = document.getElementById('formatSelect').value;
        const model = document.querySelector('.model-option.selected')?.dataset.model || 'speech-2.8-hd';
        const text = document.getElementById('textInput').value.trim();
        const voiceId = window.getSelectedVoiceId ? window.getSelectedVoiceId() : '';

        // 收集所有音频 chunk 为一个 Blob
        let blob = new Blob(pendingChunks, { type: 'audio/mpeg' });

        // opus 选项：把 mp3 发到后端 /api/convert-audio 转码为标准 ogg/opus 再保存
        if (format === 'opus') {
            showToast('正在转码为 Opus 16kHz 单声道...', 'info');
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const res = await fetch('/api/convert-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ audioBase64: base64, targetFormat: 'opus' })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '转码失败');
            const bin = atob(data.data.audioBase64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            blob = new Blob([bytes], { type: 'audio/ogg' });
        }

        const reader = new FileReader();
        reader.onload = async function() {
            const base64 = reader.result.split(',')[1]; // 去掉 data:xxx;base64, 前缀
            try {
                const res = await fetch('/api/resources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        type: 'tts-streaming',
                        fileBase64: base64,
                        format: format,
                        model: model,
                        prompt: text,
                        voiceId: voiceId,
                        params: { extraInfo }
                    })
                });
                const data = await res.json();
                if (data.success) {
                    console.log('[Streaming] 资源已保存, id:', data.data.id);
                    refreshResourceHistory();
                }
            } catch (err) {
                console.error('[Streaming] 保存资源失败:', err);
            }
        };
        reader.readAsDataURL(blob);
    } catch (err) {
        console.error('[Streaming] saveStreamingAudio 失败:', err);
    }
}

function endStreaming(extraInfo) {
    if (ws) { ws.close(); ws = null; }

    if (!streamingActive) {
        // Fallback: build blob from pendingChunks
        finishSynthesis(extraInfo);
        return;
    }

    if (mediaSource && mediaSource.readyState === 'open') {
        mediaSource.endOfStream();
    }

    const synthBtn = document.getElementById('synthBtn');
    if (synthBtn) { synthBtn.disabled = false; synthBtn.innerHTML = '🎤 开始合成（WebSocket）'; }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    updateStatus('success', '合成完成', `实时流式播放，耗时 ${elapsed}s`);
    showToast('边收边播完成', 'success');

    if (subtitleEntries.length > 0) renderSubtitles();

    // 保存音频到数据库
    saveStreamingAudio(extraInfo);
}

function renderSubtitles() {
    const section = document.getElementById('subtitleSection');
    const content = document.getElementById('subtitleContent');
    section.classList.remove('hidden');

    let srtContent = '';
    let index = 1;
    subtitleEntries.forEach(entry => {
        // 简单渲染
        if (entry.text) {
            const start = formatSrtTime(entry.begin_time || 0);
            const end = formatSrtTime(entry.end_time || 0);
            srtContent += `${index}\n${start} --> ${end}\n${entry.text}\n\n`;
            index++;
        }
    });

    content.textContent = srtContent || '（字幕数据解析中...）';
}

function formatSrtTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

function downloadSubtitle() {
    const content = document.getElementById('subtitleContent').textContent;
    if (!content) {
        showToast('没有字幕数据', 'error');
        return;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitle_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('字幕下载成功', 'success');
}

function updateStatus(type, text, detail) {
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusDetail = document.getElementById('statusDetail');

    statusIcon.className = 'status-icon ' + type;

    const icons = {
        pending: '⏳',
        processing: '🔄',
        success: '✅',
        error: '❌'
    };

    statusIcon.textContent = icons[type] || '⏳';
    statusText.textContent = text || '';
    statusDetail.textContent = detail || '';
}

function togglePlay() {
    if (!audioElement || !audioElement.src) return;
    if (isPlaying) {
        audioElement.pause();
        isPlaying = false;
        const btn = document.querySelector('.audio-play-btn');
        if (btn) btn.textContent = '▶';
    } else {
        audioElement.play().catch(e => console.log(e));
        isPlaying = true;
        const btn = document.querySelector('.audio-play-btn');
        if (btn) btn.textContent = '⏸';
    }
}

function seekAudio(event) {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    audioElement.currentTime = pos * audioElement.duration;
}

async function downloadAudio() {
    const format = document.getElementById('formatSelect').value;
    const extMap = {
        'mp3': 'mp3', 'wav': 'wav', 'flac': 'flac', 'pcm': 'pcm',
        'opus': 'opus'
    };
    const ext = extMap[format] || 'mp3';
    const filename = `minimax_tts_${Date.now()}.${ext}`;

    let blobToDownload = audioBlob;

    // In streaming mode, build blob from pendingChunks for download
    if (streamingActive && pendingChunks.length > 0) {
        blobToDownload = new Blob(pendingChunks, { type: 'audio/mpeg' });
    }

    if (!blobToDownload) {
        showToast('没有可下载的音频', 'error');
        return;
    }

    // opus 选项：把 mp3 发到后端 /api/convert-audio 转码为标准 ogg/opus 再下载
    if (format === 'opus') {
        showToast('正在转码为 Opus 16kHz 单声道...', 'info');
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blobToDownload);
            });
            const res = await fetch('/api/convert-audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ audioBase64: base64, targetFormat: 'opus' })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '转码失败');
            // 后端返回 base64
            const bin = atob(data.data.audioBase64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            blobToDownload = new Blob([bytes], { type: 'audio/ogg' });
        } catch (err) {
            showToast('Opus 转码失败: ' + err.message, 'error');
            return;
        }
    }

    const url = URL.createObjectURL(blobToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast('开始下载: ' + filename, 'success');
}

function transferToCover() {
    const text = document.getElementById('textInput').value.trim();
    if (!text) {
        showToast('请先输入文本', 'error');
        return;
    }
    sessionStorage.setItem('tts_lyrics', text);
    window.location.href = '../music/cover.html?from=tts';
}

function transferToLyrics() {
    const text = document.getElementById('textInput').value.trim();
    if (!text) {
        showToast('请先输入文本', 'error');
        return;
    }
    sessionStorage.setItem('lyrics_source', text);
    window.location.href = '../music/lyrics.html?from=tts';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
