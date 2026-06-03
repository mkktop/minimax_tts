/**
 * 同步合成（流式 WebSocket）- JavaScript
 * 基于 WebSocket 协议实时流式生成音频
 * 协议流程：task_start → task_continue(text) → task_finish
 */

// 音色数据
const VOICES_DATA = {
    '中文（普通话）': [
        { id: 'male-qn-qingse', name: '青涩青年音色' },
        { id: 'male-qn-jingying', name: '精英青年音色' },
        { id: 'male-qn-badao', name: '霸道青年音色' },
        { id: 'male-qn-daxuesheng', name: '青年大学生音色' },
        { id: 'female-shaonv', name: '少女音色' },
        { id: 'female-yujie', name: '御姐音色' },
        { id: 'female-chengshu', name: '成熟女性音色' },
        { id: 'female-tianmei', name: '甜美女性音色' },
        { id: 'male-qn-qingse-jingpin', name: '青涩青年音色-beta' },
        { id: 'male-qn-jingying-jingpin', name: '精英青年音色-beta' }
    ],
    '中文（粤语）': [
        { id: 'Cantonese_ProfessionalHost（F）', name: '专业女主持' },
        { id: 'Cantonese_GentleLady', name: '温柔女声' },
        { id: 'Cantonese_PlayfulMan', name: '活泼男声' },
        { id: 'Cantonese_CuteGirl', name: '可爱女孩' }
    ],
    '英文': [
        { id: 'Santa_Claus', name: 'Santa Claus' },
        { id: 'Grinch', name: 'Grinch' },
        { id: 'Arnold', name: 'Arnold' },
        { id: 'Sweet_Girl', name: 'Sweet Girl' },
        { id: 'Attractive_Girl', name: 'Attractive Girl' }
    ],
    '日文': [
        { id: 'Japanese_IntellectualSenior', name: 'Intellectual Senior' },
        { id: 'Japanese_DecisivePrincess', name: 'Decisive Princess' },
        { id: 'Japanese_LoyalKnight', name: 'Loyal Knight' }
    ],
    '韩文': [
        { id: 'Korean_SweetGirl', name: 'Sweet Girl' },
        { id: 'Korean_CheerfulBoyfriend', name: 'Cheerful Boyfriend' },
        { id: 'Korean_EnchantingSister', name: 'Enchanting Sister' }
    ],
    '西班牙文': [
        { id: 'Spanish_SereneWoman', name: 'Serene Woman' },
        { id: 'Spanish_Narrator', name: 'Narrator' },
        { id: 'Spanish_WiseScholar', name: 'Wise Scholar' }
    ],
    '其他': []
};

const OTHER_LANGUAGES = ['葡萄牙文', '法文', '印尼文', '德文', '俄文', '意大利文', '阿拉伯文', '土耳其文', '越南文', '泰文'];

// 状态变量
let audioElement = null;
let isPlaying = false;
let audioBlob = null;
let ws = null; // WebSocket 连接
let audioChunks = []; // 收集 hex 音频片段
let subtitleEntries = []; // 字幕条目
let startTime = 0;

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
});

function initApiKey() {
    const key = getApiKey();
    updateApiKeyDisplay();
    if (!key) {
        showApiKeyModal();
    }
}

function getApiKey() {
    return localStorage.getItem('minimax_tts_api_key') || '';
}

function updateApiKeyDisplay() {
    const key = getApiKey();
    const display = document.getElementById('apiKeyDisplay');
    if (key) {
        display.textContent = '****' + key.slice(-6);
        display.classList.add('set');
    } else {
        display.textContent = '未设置 API Key';
        display.classList.remove('set');
    }
}

function showApiKeyModal() {
    const modal = document.getElementById('apiKeyModal');
    const input = document.getElementById('apiKeyInput');
    input.value = getApiKey();
    modal.classList.remove('hidden');
}

function hideApiKeyModal() {
    document.getElementById('apiKeyModal').classList.add('hidden');
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    const key = input.value.trim();
    if (key) {
        localStorage.setItem('minimax_tts_api_key', key);
        updateApiKeyDisplay();
        hideApiKeyModal();
        showToast('API Key 保存成功', 'success');
    } else {
        showToast('请输入有效的 API Key', 'error');
    }
}

function initModelSelection() {
    const options = document.querySelectorAll('.model-option');
    options.forEach(opt => {
        opt.addEventListener('click', function() {
            options.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
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

    audioElement.addEventListener('timeupdate', function() {
        const progress = (audioElement.currentTime / audioElement.duration) * 100;
        document.getElementById('audioProgressFill').style.width = progress + '%';
        document.getElementById('audioTime').textContent = formatTime(audioElement.currentTime) + ' / ' + formatTime(audioElement.duration);
    });

    audioElement.addEventListener('ended', function() {
        isPlaying = false;
        document.querySelector('.audio-play-btn').textContent = '▶';
    });
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============ WebSocket 流式合成核心 ============

async function startSynthesis() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        return;
    }

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

    // 构建 audio_setting
    const audioSetting = {
        sample_rate: sampleRate,
        bitrate: bitrate,
        format: format,
        channel: channel
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
    synthBtn.innerHTML = '<span class="spinner"></span> 合成中...';

    // 重置
    audioChunks = [];
    subtitleEntries = [];
    startTime = Date.now();

    try {
        // 连接到后端 WebSocket 代理
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${location.host}/ws/tts?token=${encodeURIComponent(apiKey)}`;

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
                if (!audioChunks.length) {
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
                updateStatus('processing', '合成中...', '发送文本...');
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
            // 收到音频片段
            if (msg.data?.audio) {
                audioChunks.push(msg.data.audio);
                const totalSize = audioChunks.reduce((sum, hex) => sum + hex.length / 2, 0);
                document.getElementById('chunkCount').textContent = audioChunks.length;
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
                finishSynthesis(msg.extra_info);
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

    if (audioChunks.length === 0) {
        updateStatus('error', '合成失败', '未收到音频数据');
        synthBtn.disabled = false;
        synthBtn.innerHTML = '🎤 开始合成（WebSocket）';
        return;
    }

    // 合并所有 hex 音频片段
    const fullHex = audioChunks.join('');
    const audioBytes = new Uint8Array(fullHex.length / 2);
    for (let i = 0; i < fullHex.length; i += 2) {
        audioBytes[i / 2] = parseInt(fullHex.substr(i, 2), 16);
    }

    const format = document.getElementById('formatSelect').value;
    const mimeTypeMap = {
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'flac': 'audio/flac',
        'pcm': 'audio/pcm',
        'opus': 'audio/ogg',
        'pcmu_raw': 'audio/pcm',
        'pcmu_wav': 'audio/wav'
    };
    const mimeType = mimeTypeMap[format] || 'audio/mpeg';
    audioBlob = new Blob([audioBytes], { type: mimeType });

    const audioUrl = URL.createObjectURL(audioBlob);
    audioElement.src = audioUrl;

    // 等待元数据加载
    audioElement.addEventListener('loadedmetadata', function onMeta() {
        audioElement.removeEventListener('loadedmetadata', onMeta);
        document.getElementById('audioPlayer').classList.remove('hidden');
        updateStatus('success', '合成完成', `音频 ${extraInfo?.audio_length ? (extraInfo.audio_length / 1000).toFixed(1) + 's' : ''}，${audioChunks.length} 片段`);

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
    if (!audioElement.src) return;

    if (isPlaying) {
        audioElement.pause();
        document.querySelector('.audio-play-btn').textContent = '▶';
    } else {
        audioElement.play();
        document.querySelector('.audio-play-btn').textContent = '⏸';
    }
    isPlaying = !isPlaying;
}

function seekAudio(event) {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    audioElement.currentTime = pos * audioElement.duration;
}

function downloadAudio() {
    if (!audioBlob) {
        showToast('没有可下载的音频', 'error');
        return;
    }

    const format = document.getElementById('formatSelect').value;
    const extMap = {
        'mp3': 'mp3', 'wav': 'wav', 'flac': 'flac', 'pcm': 'pcm',
        'opus': 'ogg', 'pcmu_raw': 'pcmu', 'pcmu_wav': 'wav'
    };
    const ext = extMap[format] || 'mp3';
    const filename = `minimax_tts_${Date.now()}.${ext}`;

    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showToast('开始下载: ' + filename, 'success');
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
