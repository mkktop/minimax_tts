/**
 * 异步合成 - JavaScript
 * 长文本专用，支持字幕时间戳
 * API: POST /v1/t2a_async_v2
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
        { id: 'female-tianmei', name: '甜美女性音色' }
    ],
    '中文（粤语）': [
        { id: 'Cantonese_ProfessionalHost（F）', name: '专业女主持' },
        { id: 'Cantonese_GentleLady', name: '温柔女声' }
    ],
    '英文': [
        { id: 'Santa_Claus', name: 'Santa Claus' },
        { id: 'Grinch', name: 'Grinch' },
        { id: 'Arnold', name: 'Arnold' }
    ]
};

const OTHER_LANGUAGES = ['葡萄牙文', '法文', '印尼文', '德文', '俄文', '意大利文', '阿拉伯文', '土耳其文', '越南文', '泰文', '日文', '韩文', '西班牙文'];

// 状态变量
let currentTaskId = null;
let currentFileId = null;
let pollInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initModelSelection();
    initLanguageSelect();
    initSliders();
    initTextInput();
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

function initTextInput() {
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');

    textInput.addEventListener('input', function() {
        const len = this.value.length;
        charCount.textContent = `${len} / 100,000`;
        charCount.style.color = len > 100000 ? 'var(--accent-red)' : 'var(--text-muted)';
    });
}

// 处理文件上传
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
        showToast('文件大小不能超过 20MB', 'error');
        return;
    }

    const textInput = document.getElementById('textInput');
    const reader = new FileReader();

    if (file.name.endsWith('.zip')) {
        showToast('正在解压和处理文件...', 'info');
        reader.onload = function(e) {
            showToast('ZIP 文件需要后端处理，请使用纯文本输入', 'info');
        };
        reader.readAsText(file);
    } else {
        reader.onload = function(e) {
            textInput.value = e.target.result;
            textInput.dispatchEvent(new Event('input'));
            showToast('文件加载成功', 'success');
        };
        reader.readAsText(file);
    }
}

// 创建任务
async function createTask() {
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

    if (text.length > 100000) {
        showToast('文本不能超过 100,000 字符', 'error');
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
    const pronunciationText = document.getElementById('pronunciationInput').value.trim();
    const modifyPitch = parseInt(document.getElementById('modifyPitchSlider').value);
    const modifyIntensity = parseInt(document.getElementById('modifyIntensitySlider').value);
    const modifyTimbre = parseInt(document.getElementById('modifyTimbreSlider').value);
    const soundEffects = document.getElementById('soundEffectsSelect').value;
    const aigcWatermark = document.getElementById('aigcWatermark').checked;

    // 解析发音字典
    let pronunciationDict = undefined;
    if (pronunciationText) {
        const tones = pronunciationText.split('\n').map(l => l.trim()).filter(Boolean);
        if (tones.length > 0) {
            pronunciationDict = { tone: tones };
        }
    }

    // 构建 voice_modify
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

    // 构建 audio_setting（注意异步 API 字段名是 audio_sample_rate）
    const audioSetting = {
        audio_sample_rate: sampleRate,
        bitrate: bitrate,
        format: format,
        channel: channel
    };

    // 显示状态
    const taskSection = document.getElementById('taskSection');
    taskSection.classList.remove('hidden');
    updateStatus('processing', '创建任务中...', '正在提交到服务器');

    const synthBtn = document.getElementById('synthBtn');
    synthBtn.disabled = true;
    synthBtn.innerHTML = '<span class="spinner"></span> 创建中...';

    try {
        const body = {
            model: model,
            text: text,
            voice_setting: voiceSetting,
            audio_setting: audioSetting
        };
        if (languageBoost) body.language_boost = languageBoost;
        if (pronunciationDict) body.pronunciation_dict = pronunciationDict;
        if (voiceModify) body.voice_modify = voiceModify;
        if (aigcWatermark) body.aigc_watermark = true;

        const response = await fetch('/api/tts/async/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error?.message || result.error || '创建任务失败');
        }

        currentTaskId = result.data.task_id;
        currentFileId = result.data.file_id;
        document.getElementById('taskIdInput').value = currentTaskId;

        updateStatus('processing', '任务已创建', `Task ID: ${currentTaskId}`);

        // 开始轮询状态
        startPolling();

    } catch (error) {
        console.error('Create task error:', error);
        updateStatus('error', '创建失败', error.message);
        showToast('创建任务失败: ' + (error.message || '未知错误'), 'error');
    } finally {
        synthBtn.disabled = false;
        synthBtn.innerHTML = '⏳ 创建任务';
    }
}

// 查询任务状态
async function queryTask() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    const taskId = document.getElementById('taskIdInput').value.trim();
    if (!taskId) {
        showToast('请输入 Task ID', 'error');
        return;
    }

    currentTaskId = taskId;
    updateStatus('processing', '查询中...', '正在查询任务状态');

    try {
        const response = await fetch(`/api/tts/async/query?task_id=${taskId}`, {
            headers: {
                'x-api-key': apiKey
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error?.message || '查询失败');
        }

        const data = result.data;
        const status = data.status;
        const progress = data.progress || 0;

        document.getElementById('progressFill').style.width = progress + '%';

        switch (status) {
            case 'Pending':
                updateStatus('pending', '排队中...', '任务等待处理');
                break;
            case 'Processing':
                updateStatus('processing', '处理中...', `进度: ${progress}%`);
                break;
            case 'Success':
                currentFileId = data.file_id;
                updateStatus('success', '任务完成', '音频已就绪，点击下载');
                document.getElementById('progressFill').style.width = '100%';
                document.getElementById('taskResult').classList.remove('hidden');
                document.getElementById('downloadSubtitleBtn').classList.remove('hidden');
                stopPolling();
                break;
            case 'Failed':
                updateStatus('error', '任务失败', data.failed_reason || '未知错误');
                stopPolling();
                break;
            default:
                updateStatus('pending', status, `进度: ${progress}%`);
        }

    } catch (error) {
        console.error('Query task error:', error);
        updateStatus('error', '查询失败', error.message);
        showToast('查询失败: ' + (error.message || '未知错误'), 'error');
    }
}

// 开始轮询
function startPolling() {
    if (pollInterval) return;

    pollInterval = setInterval(() => {
        if (currentTaskId) {
            queryTask();
        } else {
            stopPolling();
        }
    }, 3000); // 每 3 秒查询一次
}

// 停止轮询
function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// 下载音频
async function downloadAudio() {
    const apiKey = getApiKey();
    if (!apiKey || !currentFileId) {
        showToast('没有可下载的音频', 'error');
        return;
    }

    showToast('正在下载音频...', 'info');

    try {
        const response = await fetch(`/api/tts/async/download?file_id=${currentFileId}`, {
            headers: {
                'x-api-key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error('下载失败');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const format = document.getElementById('formatSelect').value;
        const extMap = { 'mp3': 'mp3', 'wav': 'wav', 'flac': 'flac', 'pcm': 'pcm', 'opus': 'ogg', 'pcmu_raw': 'pcmu', 'pcmu_wav': 'wav' };
        a.download = `minimax_async_${currentTaskId}.${extMap[format] || 'mp3'}`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('下载成功', 'success');

    } catch (error) {
        console.error('Download error:', error);
        showToast('下载失败: ' + (error.message || '未知错误'), 'error');
    }
}

// 下载字幕
function downloadSubtitle() {
    if (!currentFileId) {
        showToast('没有字幕数据', 'error');
        return;
    }
    // 异步任务的字幕通过 file_id 下载，和音频在同一个文件组中
    showToast('字幕随音频一起下载', 'info');
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

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
