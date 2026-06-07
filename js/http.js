/**
 * 同步合成（HTTP）- JavaScript
 * 完整音频一次返回，简单可靠
 */

// 音色数据由 voice-library.js 统一提供（VOICE_LIBRARY）

// 状态变量
let audioElement = null;
let isPlaying = false;
let audioBlob = null;

// ============ 设置持久化 ============
const SETTINGS_KEY = 'minimax_tts_http_settings';

function saveSettings() {
    const settings = {
        model: document.querySelector('.model-option.selected')?.dataset.model || 'speech-2.8-hd',
        speed: document.getElementById('speedSlider').value,
        pitch: document.getElementById('pitchSlider').value,
        vol: document.getElementById('volSlider').value,
        sampleRate: document.getElementById('sampleRateSelect').value,
        bitrate: document.getElementById('bitrateSelect').value,
        format: document.getElementById('formatSelect').value,
        emotion: document.getElementById('emotionSelect').value,
        languageBoost: document.getElementById('languageBoostSelect').value,
        pronunciation: document.getElementById('pronunciationInput').value,
        modifyPitch: document.getElementById('modifyPitchSlider').value,
        modifyIntensity: document.getElementById('modifyIntensitySlider').value,
        modifyTimbre: document.getElementById('modifyTimbreSlider').value,
        soundEffects: document.getElementById('soundEffectsSelect').value,
        aigcWatermark: document.getElementById('aigcWatermark').checked,
        text: document.getElementById('textInput').value
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        // 模型
        if (s.model) {
            const opt = document.querySelector(`.model-option[data-model="${s.model}"]`);
            if (opt) {
                document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            }
        }
        // 滑块
        if (s.speed != null) { document.getElementById('speedSlider').value = s.speed; document.getElementById('speedValue').textContent = s.speed + 'x'; }
        if (s.pitch != null) { document.getElementById('pitchSlider').value = s.pitch; document.getElementById('pitchValue').textContent = s.pitch; }
        if (s.vol != null) { document.getElementById('volSlider').value = s.vol; document.getElementById('volValue').textContent = s.vol; }
        // 下拉
        if (s.sampleRate) document.getElementById('sampleRateSelect').value = s.sampleRate;
        if (s.bitrate) document.getElementById('bitrateSelect').value = s.bitrate;
        if (s.format) document.getElementById('formatSelect').value = s.format;
        if (s.emotion) document.getElementById('emotionSelect').value = s.emotion;
        if (s.languageBoost != null) document.getElementById('languageBoostSelect').value = s.languageBoost;
        if (s.pronunciation) document.getElementById('pronunciationInput').value = s.pronunciation;
        if (s.modifyPitch != null) {
            document.getElementById('modifyPitchSlider').value = s.modifyPitch;
            document.getElementById('modifyPitchValue').textContent = s.modifyPitch;
        }
        if (s.modifyIntensity != null) {
            document.getElementById('modifyIntensitySlider').value = s.modifyIntensity;
            document.getElementById('modifyIntensityValue').textContent = s.modifyIntensity;
        }
        if (s.modifyTimbre != null) {
            document.getElementById('modifyTimbreSlider').value = s.modifyTimbre;
            document.getElementById('modifyTimbreValue').textContent = s.modifyTimbre;
        }
        if (s.soundEffects) document.getElementById('soundEffectsSelect').value = s.soundEffects;
        if (s.aigcWatermark) document.getElementById('aigcWatermark').checked = true;
        // 文本
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
    // 恢复设置
    loadSettings();
    // 监听变化自动保存
    ['speedSlider','pitchSlider','volSlider','sampleRateSelect','bitrateSelect','formatSelect',
     'emotionSelect','languageBoostSelect','pronunciationInput',
     'modifyPitchSlider','modifyIntensitySlider','modifyTimbreSlider','soundEffectsSelect',
     'aigcWatermark','textInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSettings);
        if (el) el.addEventListener('input', () => { clearTimeout(el._saveTimer); el._saveTimer = setTimeout(saveSettings, 500); });
    });
    initResourceHistory('tts-http');
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
    // 这里只保留空函数避免报错
}

function initSliders() {
    const sliders = [
        { id: 'speedSlider', valueId: 'speedValue', format: v => v + 'x' },
        { id: 'pitchSlider', valueId: 'pitchValue', format: v => v },
        { id: 'volSlider', valueId: 'volValue', format: v => v },
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

// 开始合成
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
    const pronunciationText = document.getElementById('pronunciationInput').value.trim();
    const aigcWatermark = document.getElementById('aigcWatermark').checked;

    // 语音修改参数
    const modifyPitch = parseInt(document.getElementById('modifyPitchSlider').value);
    const modifyIntensity = parseInt(document.getElementById('modifyIntensitySlider').value);
    const modifyTimbre = parseInt(document.getElementById('modifyTimbreSlider').value);
    const soundEffects = document.getElementById('soundEffectsSelect').value;

    // 构建 voice_modify（有非零值时才发送）
    let voiceModify = undefined;
    if (modifyPitch !== 0 || modifyIntensity !== 0 || modifyTimbre !== 0 || soundEffects) {
        voiceModify = {};
        if (modifyPitch !== 0) voiceModify.pitch = modifyPitch;
        if (modifyIntensity !== 0) voiceModify.intensity = modifyIntensity;
        if (modifyTimbre !== 0) voiceModify.timbre = modifyTimbre;
        if (soundEffects) voiceModify.sound_effects = soundEffects;
    }

    // 解析发音字典
    let pronunciationDict = undefined;
    if (pronunciationText) {
        const tones = pronunciationText.split('\n').map(l => l.trim()).filter(Boolean);
        if (tones.length > 0) {
            pronunciationDict = { tone: tones };
        }
    }

    // 显示状态
    const statusSection = document.getElementById('statusSection');
    statusSection.classList.remove('hidden');
    updateStatus('processing', '合成中...', '正在处理文本');

    const synthBtn = document.getElementById('synthBtn');
    synthBtn.disabled = true;
    synthBtn.innerHTML = '<span class="spinner"></span> 合成中...';

    // 更新进度条
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        if (progress > 90) progress = 90;
        document.getElementById('progressFill').style.width = progress + '%';
    }, 500);

    try {
        // opus 选项：原样把 format='opus' 传给后端，由后端识别后
        // 用 mp3/16k/mono 调 MiniMax、收到后用 ffmpeg 转 ogg/opus 再返回
        const response = await fetch('/api/tts/http', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                model: model,
                text: text,
                output_format: 'hex',
                aigc_watermark: aigcWatermark,
                voice_setting: {
                    voice_id: voiceId,
                    speed: speed,
                    pitch: pitch,
                    vol: vol,
                    ...(emotion && { emotion })
                },
                audio_setting: {
                    sample_rate: sampleRate,
                    bitrate: bitrate,
                    format: format,
                    channel: channel
                },
                ...(languageBoost && { language_boost: languageBoost }),
                ...(pronunciationDict && { pronunciation_dict: pronunciationDict }),
                ...(voiceModify && { voice_modify: voiceModify })
            })
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            throw new Error('合成失败');
        }

        // 解析响应 - MiniMax 返回的是 hex 编码的音频
        const result = await response.json();

        if (result.success && result.data?.data?.audio) {
            // 将 hex 字符串转换为二进制数据
            const hexString = result.data.data.audio;
            const audioBytes = new Uint8Array(hexString.length / 2);
            for (let i = 0; i < hexString.length; i += 2) {
                audioBytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
            }

            // opus 选项：后端已用 ffmpeg 重封装为 ogg/opus 容器；其余按原始格式
            const mimeType = format === 'opus' ? 'audio/ogg'
                : format === 'wav' ? 'audio/wav'
                : format === 'flac' ? 'audio/flac'
                : format === 'pcm' ? 'audio/pcm'
                : 'audio/mpeg';
            audioBlob = new Blob([audioBytes], { type: mimeType });
        } else {
            // 兜底：直接处理二进制
            const audioData = await response.arrayBuffer();
            audioBlob = new Blob([audioData], { type: wantOpus ? 'audio/ogg' : 'audio/mpeg' });
        }

        const audioUrl = URL.createObjectURL(audioBlob);

        audioElement.src = audioUrl;

        // 等待元数据加载完成，确保 duration 正确
        await new Promise((resolve) => {
            const onLoaded = () => {
                audioElement.removeEventListener('loadedmetadata', onLoaded);
                audioElement.removeEventListener('error', onLoaded);
                resolve();
            };
            audioElement.addEventListener('loadedmetadata', onLoaded);
            audioElement.addEventListener('error', onLoaded);
        });

        document.getElementById('audioPlayer').classList.remove('hidden');
        document.getElementById('progressFill').style.width = '100%';
        updateStatus('success', '合成完成', '音频已准备就绪');

        // 自动播放
        audioElement.play().catch(err => {
            console.log('Auto-play blocked:', err);
        });
        isPlaying = true;
        document.querySelector('.audio-play-btn').textContent = '⏸';

    } catch (error) {
        clearInterval(progressInterval);
        console.error('Synthesis error:', error);
        updateStatus('error', '合成失败', error.message || '请检查 API Key 和网络连接');
        showToast('合成失败: ' + (error.message || '未知错误'), 'error');
    } finally {
        synthBtn.disabled = false;
        synthBtn.innerHTML = '📡 开始合成';
    }
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
    const extMap = { mp3: 'mp3', wav: 'wav', flac: 'flac', pcm: 'pcm', opus: 'ogg' };
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