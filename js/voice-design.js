/**
 * 音色设计 - JavaScript
 * 用文字描述想要的音色，AI 生成专属声音
 * API: POST /v1/voice_design
 */

// 快捷模板
const TEMPLATES = {
    suspense: {
        prompt: '讲述悬疑故事的播音员，声音低沉富有磁性，语速时快时慢，营造紧张神秘的氛围。',
        preview: '夜深了，古屋里只有他一人。窗外传来若有若无的脚步声，他屏住呼吸，慢慢地，慢慢地，走向那扇吱呀作响的门……'
    },
    warm: {
        prompt: '温柔的电台DJ女声，声音温暖治愈，像在耳边轻声说话，适合深夜电台节目。',
        preview: '晚上好，欢迎收听今晚的节目。在这个安静的夜晚，让我陪你聊聊那些温暖的小事。'
    },
    narrator: {
        prompt: '有声书男播音员，声音浑厚稳重，咬字清晰，节奏感强，适合长篇文学作品的朗读。',
        preview: '那是一个秋天的傍晚，夕阳将整个小镇染成了金色。他站在老槐树下，等待着那个承诺会回来的人。'
    },
    news: {
        prompt: '专业的新闻女主播，声音清亮标准，语速适中，吐字清晰有力，具有权威感。',
        preview: '各位观众朋友们大家好，欢迎收看今天的新闻节目。首先来关注一条重要消息。'
    },
    child: {
        prompt: '活泼可爱的儿童节目主持人，声音明亮欢快，充满童趣和活力，语速略快。',
        preview: '小朋友们好呀！今天我们要讲一个超级有趣的故事，准备好了吗？让我们开始吧！'
    },
    commercial: {
        prompt: '广告男配音，声音浑厚大气，富有感染力和穿透力，适合品牌广告和宣传片。',
        preview: '品质生活，从这里开始。我们用心打造每一件产品，只为给你最好的体验。'
    }
};

// 状态变量
let audioElement = null;
let isPlaying = false;
let audioBlob = null;

// ============ 设置持久化 ============
const SETTINGS_KEY = 'minimax_tts_voice_design_settings';

function saveSettings() {
    const settings = {
        prompt: document.getElementById('promptInput').value,
        previewText: document.getElementById('previewTextInput').value,
        voiceId: document.getElementById('voiceIdInput').value,
        aigcWatermark: document.getElementById('aigcWatermark').checked
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        if (s.prompt) document.getElementById('promptInput').value = s.prompt;
        if (s.previewText) document.getElementById('previewTextInput').value = s.previewText;
        if (s.voiceId) document.getElementById('voiceIdInput').value = s.voiceId;
        if (s.aigcWatermark) document.getElementById('aigcWatermark').checked = true;
        updatePreviewCount();
    } catch (e) { /* ignore */ }
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initAudioPlayer();
    initTextCounters();
    loadSettings();
    // 自动保存
    ['promptInput', 'previewTextInput', 'voiceIdInput', 'aigcWatermark'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSettings);
        if (el) el.addEventListener('input', () => { clearTimeout(el._saveTimer); el._saveTimer = setTimeout(saveSettings, 500); });
    });
});

function initApiKey() {
    const key = getApiKey();
    updateApiKeyDisplay();
    if (!key) showApiKeyModal();
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

function initTextCounters() {
    document.getElementById('previewTextInput').addEventListener('input', updatePreviewCount);
}

function updatePreviewCount() {
    const len = document.getElementById('previewTextInput').value.length;
    const el = document.getElementById('previewCount');
    el.textContent = `(${len} / 500)`;
    el.style.color = len > 500 ? 'var(--accent-red)' : '';
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// 应用模板
function applyTemplate(name) {
    const tpl = TEMPLATES[name];
    if (!tpl) return;
    document.getElementById('promptInput').value = tpl.prompt;
    document.getElementById('previewTextInput').value = tpl.preview;
    updatePreviewCount();
    saveSettings();
    showToast('已应用模板', 'success');
}

// 开始设计
async function startDesign() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        showToast('请输入音色描述', 'error');
        return;
    }

    const previewText = document.getElementById('previewTextInput').value.trim();
    if (!previewText) {
        showToast('请输入试听文本', 'error');
        return;
    }

    if (previewText.length > 500) {
        showToast('试听文本不能超过 500 字符', 'error');
        return;
    }

    const voiceId = document.getElementById('voiceIdInput').value.trim();
    const aigcWatermark = document.getElementById('aigcWatermark').checked;

    // UI 状态
    document.getElementById('statusSection').classList.remove('hidden');
    document.getElementById('resultSection').classList.add('hidden');
    updateStatus('processing', '设计中...', 'AI 正在根据描述生成音色');

    const designBtn = document.getElementById('designBtn');
    designBtn.disabled = true;
    designBtn.innerHTML = '<span class="spinner"></span> 设计中...';

    try {
        const body = {
            prompt: prompt,
            preview_text: previewText
        };
        if (voiceId) body.voice_id = voiceId;
        if (aigcWatermark) body.aigc_watermark = true;

        const response = await fetch('/api/voice/design', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || '音色设计失败');
        }

        const data = result.data;

        // 检查状态码
        if (data.base_resp && data.base_resp.status_code !== 0) {
            throw new Error(data.base_resp.status_msg || '设计失败');
        }

        // 保存生成的 voice_id
        const generatedVoiceId = data.voice_id;

        // 解析试听音频（hex 编码）
        if (data.trial_audio) {
            const hexString = data.trial_audio;
            const audioBytes = new Uint8Array(hexString.length / 2);
            for (let i = 0; i < hexString.length; i += 2) {
                audioBytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
            }
            audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            audioElement.src = audioUrl;
        }

        // 显示结果
        document.getElementById('resultVoiceId').textContent = generatedVoiceId;
        document.getElementById('resultSection').classList.remove('hidden');
        document.getElementById('resultSection').dataset.voiceId = generatedVoiceId;
        updateStatus('success', '设计完成', `音色 ID: ${generatedVoiceId}`);

        // 自动播放试听
        if (audioBlob) {
            audioElement.play().catch(err => console.log('Auto-play blocked:', err));
            isPlaying = true;
            document.querySelector('.audio-play-btn').textContent = '⏸';
        }

        showToast('音色设计成功！', 'success');

    } catch (error) {
        console.error('Voice design error:', error);
        updateStatus('error', '设计失败', error.message);
        showToast('设计失败: ' + error.message, 'error');
    } finally {
        designBtn.disabled = false;
        designBtn.innerHTML = '🎨 开始设计';
    }
}

// 播放控制
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
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice_design_${Date.now()}.mp3`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('开始下载', 'success');
}

function useVoice() {
    const section = document.getElementById('resultSection');
    const voiceId = section.dataset.voiceId;
    if (voiceId) {
        localStorage.setItem('selected_voice_id', voiceId);
        window.location.href = 'streaming.html';
    } else {
        showToast('音色信息无效', 'error');
    }
}

function redesign() {
    document.getElementById('resultSection').classList.add('hidden');
    document.getElementById('statusSection').classList.add('hidden');
    document.getElementById('promptInput').focus();
}

function updateStatus(type, text, detail) {
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusDetail = document.getElementById('statusDetail');

    statusIcon.className = 'status-icon ' + type;

    const icons = { pending: '⏳', processing: '🔄', success: '✅', error: '❌' };
    statusIcon.textContent = icons[type] || '⏳';
    statusText.textContent = text || '';
    statusDetail.textContent = detail || '';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}
