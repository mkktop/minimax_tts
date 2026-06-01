/**
 * 同步合成（流式）- JavaScript
 * 边合成边播放，低延迟体验
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

// 其他语言的音色将从后端获取
const OTHER_LANGUAGES = ['葡萄牙文', '法文', '印尼文', '德文', '俄文', '意大利文', '阿拉伯文', '土耳其文', '越南文', '泰文'];

// 状态变量
let audioElement = null;
let isPlaying = false;
let audioBlob = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initModelSelection();
    initLanguageSelect();
    initSliders();
    initTextInput();
    initAudioPlayer();
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
    // 这里只保留空函数避免报错
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

    // 获取设置
    const model = document.querySelector('.model-option.selected')?.dataset.model || 'speech-2.8-hd';
    const voiceId = window.getSelectedVoiceId ? window.getSelectedVoiceId() : 'male-qn-qingse';
    const speed = parseFloat(document.getElementById('speedSlider').value);
    const pitch = parseInt(document.getElementById('pitchSlider').value);
    const vol = parseFloat(document.getElementById('volSlider').value);
    const sampleRate = parseInt(document.getElementById('sampleRateSelect').value);
    const format = document.getElementById('formatSelect').value;

    // 显示状态
    const statusSection = document.getElementById('statusSection');
    statusSection.classList.remove('hidden');
    updateStatus('processing', '连接中...', '正在建立 WebSocket 连接');

    const synthBtn = document.getElementById('synthBtn');
    synthBtn.disabled = true;
    synthBtn.innerHTML = '<span class="spinner"></span> 合成中...';

    try {
        // 由于浏览器无法直接连接 WebSocket wss://，我们需要通过后端代理
        // 这里使用 HTTP API 作为替代方案
        updateStatus('processing', '合成中...', '正在处理文本');

        const response = await fetch('/api/tts/http', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                model: model,
                text: text,
                voice_setting: {
                    voice_id: voiceId,
                    speed: speed,
                    pitch: pitch,
                    vol: vol,
                    english_normalization: false
                },
                audio_setting: {
                    sample_rate: sampleRate,
                    bitrate: 128000,
                    format: format,
                    channel: 1
                }
            })
        });

        if (!response.ok) {
            throw new Error('合成失败');
        }

        // 获取音频数据 - MiniMax 返回的是 hex 编码的音频
        const result = await response.json();

        if (result.success && result.data?.data?.audio) {
            // 将 hex 字符串转换为二进制数据
            const hexString = result.data.data.audio;
            const audioBytes = new Uint8Array(hexString.length / 2);
            for (let i = 0; i < hexString.length; i += 2) {
                audioBytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
            }

            const mimeType = format === 'wav' ? 'audio/wav' : format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
            audioBlob = new Blob([audioBytes], { type: mimeType });
        } else {
            // 兜底：直接作为二进制处理
            const audioData = await response.arrayBuffer();
            audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
        }

        const audioUrl = URL.createObjectURL(audioBlob);

        audioElement.src = audioUrl;

        // 等待元数据加载完成
        await new Promise((resolve) => {
            const onLoaded = () => {
                audioElement.removeEventListener('loadedmetadata', onLoaded);
                audioElement.removeEventListener('error', onLoaded);
                resolve();
            };
            audioElement.addEventListener('loadedmetadata', onLoaded);
            audioElement.addEventListener('error', onLoaded);
        });

        // 显示播放器
        document.getElementById('audioPlayer').classList.remove('hidden');
        updateStatus('success', '合成完成', '音频已准备就绪');

        // 自动播放
        audioElement.play().catch(err => {
            console.log('Auto-play blocked:', err);
        });
        isPlaying = true;
        document.querySelector('.audio-play-btn').textContent = '⏸';

    } catch (error) {
        console.error('Synthesis error:', error);
        updateStatus('error', '合成失败', error.message || '请检查 API Key 和网络连接');
        showToast('合成失败: ' + (error.message || '未知错误'), 'error');
    } finally {
        synthBtn.disabled = false;
        synthBtn.innerHTML = '🎤 开始合成';
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
    const ext = format === 'mp3' ? 'mp3' : format === 'wav' ? 'wav' : 'ogg';
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