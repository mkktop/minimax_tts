/**
 * 音色复刻 - JavaScript
 * 上传音频样本，克隆你的专属音色
 * API: POST /v1/voice_clone
 */

// 状态变量
let cloneAudioFile = null;
let promptAudioFile = null;
let cloneAudioFileId = null;
let promptAudioFileId = null;
let customVoices = [];

// ============ 设置持久化 ============
const SETTINGS_KEY = 'minimax_tts_clone_settings';

function saveSettings() {
    const settings = {
        voiceId: document.getElementById('voiceIdInput').value,
        testText: document.getElementById('testTextInput').value,
        model: document.getElementById('modelSelect').value,
        languageBoost: document.getElementById('languageBoostSelect').value,
        needNoiseReduction: document.getElementById('needNoiseReduction').checked,
        needVolumeNormalization: document.getElementById('needVolumeNormalization').checked,
        aigcWatermark: document.getElementById('aigcWatermark').checked
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
        const s = JSON.parse(raw);
        if (s.voiceId) document.getElementById('voiceIdInput').value = s.voiceId;
        if (s.testText) document.getElementById('testTextInput').value = s.testText;
        if (s.model) document.getElementById('modelSelect').value = s.model;
        if (s.languageBoost != null) document.getElementById('languageBoostSelect').value = s.languageBoost;
        if (s.needNoiseReduction) document.getElementById('needNoiseReduction').checked = true;
        if (s.needVolumeNormalization) document.getElementById('needVolumeNormalization').checked = true;
        if (s.aigcWatermark) document.getElementById('aigcWatermark').checked = true;
    } catch (e) { /* ignore */ }
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initDragDrop();
    loadCustomVoices();
    loadSettings();
    initResourceHistory('tts-clone');
    // 监听变化自动保存
    ['voiceIdInput','testTextInput','modelSelect','languageBoostSelect',
     'needNoiseReduction','needVolumeNormalization','aigcWatermark'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSettings);
        if (el) el.addEventListener('input', () => { clearTimeout(el._saveTimer); el._saveTimer = setTimeout(saveSettings, 500); });
    });
});

function initApiKey() {
    updateApiKeyDisplay();
}

// API Key 管理由 api-key.js 统一提供

// 拖拽上传
function initDragDrop() {
    const cloneZone = document.getElementById('cloneAudioZone');
    const promptZone = document.getElementById('promptAudioZone');

    [cloneZone, promptZone].forEach(zone => {
        if (!zone) return;

        zone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });

        zone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        });

        zone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');

            const file = e.dataTransfer.files[0];
            if (!file) return;

            const input = this.querySelector('input[type="file"]');
            if (input) {
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            }
        });
    });
}

// 处理克隆音频上传
function handleCloneAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
        showToast('请上传 mp3、m4a 或 wav 格式的音频文件', 'error');
        return;
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
        showToast('文件大小不能超过 20MB', 'error');
        return;
    }

    // 校验音频时长：≥10秒，≤5分钟
    validateAudioDuration(file, 10, 300, (ok, duration) => {
        if (!ok) return;
        cloneAudioFile = file;
        showFileInfo('clone', file, duration);
        showToast('克隆音频已选择', 'success');
    });
}

// 处理示例音频上传
function handlePromptAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav)$/i)) {
        showToast('请上传 mp3、m4a 或 wav 格式的音频文件', 'error');
        return;
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
        showToast('文件大小不能超过 20MB', 'error');
        return;
    }

    // 校验音频时长：<8秒
    validateAudioDuration(file, 0, 8, (ok, duration) => {
        if (!ok) return;
        promptAudioFile = file;
        showFileInfo('prompt', file, duration);
        showToast('示例音频已选择', 'success');
    });
}

// 校验音频时长
function validateAudioDuration(file, minSeconds, maxSeconds, callback) {
    const audio = new Audio();
    const url = URL.createObjectURL(file);

    audio.onloadedmetadata = function() {
        URL.revokeObjectURL(url);
        const duration = audio.duration;

        if (isNaN(duration) || duration <= 0) {
            callback(true, null);
            return;
        }

        if (minSeconds > 0 && duration < minSeconds) {
            showToast(`音频时长过短（${duration.toFixed(1)}秒），至少需要 ${minSeconds} 秒`, 'error');
            callback(false, duration);
            return;
        }

        if (maxSeconds > 0 && duration > maxSeconds) {
            showToast(`音频时长过长（${duration.toFixed(1)}秒），不能超过 ${maxSeconds} 秒`, 'error');
            callback(false, duration);
            return;
        }

        callback(true, duration);
    };

    audio.onerror = function() {
        URL.revokeObjectURL(url);
        callback(true, null);
    };

    audio.src = url;
}

// 显示文件信息
function showFileInfo(type, file, duration) {
    const infoEl = document.getElementById(type + 'AudioInfo');
    const nameEl = document.getElementById(type + 'AudioName');
    const sizeEl = document.getElementById(type + 'AudioSize');

    if (infoEl) {
        infoEl.classList.remove('hidden');
        nameEl.textContent = file.name;
        const durText = duration != null ? ` | ${duration.toFixed(1)}秒` : '';
        sizeEl.textContent = formatFileSize(file.size) + durText;
    }
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 校验 voice_id 格式
function validateVoiceId(voiceId) {
    if (!voiceId) {
        showToast('请输入自定义音色 ID', 'error');
        return false;
    }
    // 长度 8-256
    if (voiceId.length < 8 || voiceId.length > 256) {
        showToast('音色 ID 长度需在 8-256 个字符之间', 'error');
        return false;
    }
    // 首字符必须为英文字母
    if (!/^[a-zA-Z]/.test(voiceId)) {
        showToast('音色 ID 首字符必须为英文字母', 'error');
        return false;
    }
    // 只允许字母、数字、-、_
    if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
        showToast('音色 ID 只能包含字母、数字、- 和 _', 'error');
        return false;
    }
    // 末位不能是 - 或 _
    if (voiceId.endsWith('-') || voiceId.endsWith('_')) {
        showToast('音色 ID 末位不能是 - 或 _', 'error');
        return false;
    }
    return true;
}

// 开始复刻
async function startClone() {
    if (!ensureApiKey()) {
        return;
    }
    const apiKey = getApiKey();

    if (!cloneAudioFile) {
        showToast('请上传克隆音频', 'error');
        return;
    }

    const voiceId = document.getElementById('voiceIdInput').value.trim();
    if (!validateVoiceId(voiceId)) return;

    const testText = document.getElementById('testTextInput').value.trim() || '您好，这是您的专属音色试听。';
    const model = document.getElementById('modelSelect').value;
    const languageBoost = document.getElementById('languageBoostSelect').value;
    const needNoiseReduction = document.getElementById('needNoiseReduction').checked;
    const needVolumeNormalization = document.getElementById('needVolumeNormalization').checked;
    const aigcWatermark = document.getElementById('aigcWatermark').checked;

    // 显示进度
    const cloneResult = document.getElementById('cloneResult');
    const cloneProgress = document.getElementById('cloneProgress');
    cloneProgress.classList.remove('hidden');
    cloneResult.classList.add('hidden');

    const cloneBtn = document.getElementById('cloneBtn');
    cloneBtn.disabled = true;
    cloneBtn.innerHTML = '<span class="spinner"></span> 复刻中...';

    try {
        // 步骤 1: 上传克隆音频
        updateStep(1, 'processing', '上传中...');

        const cloneFormData = new FormData();
        cloneFormData.append('file', cloneAudioFile);
        cloneFormData.append('purpose', 'voice_clone');

        const cloneResponse = await fetch('/api/clone/upload', {
            method: 'POST',
            headers: { 'x-api-key': apiKey },
            body: cloneFormData
        });

        const cloneResult1 = await cloneResponse.json();

        if (!cloneResponse.ok || !cloneResult1.success) {
            throw new Error(cloneResult1.error?.message || cloneResult1.error || '克隆音频上传失败');
        }

        cloneAudioFileId = cloneResult1.file_id;
        updateStep(1, 'success', '上传完成');

        // 步骤 2: 上传示例音频（可选）
        updateStep(2, 'pending', '等待中...');

        if (promptAudioFile) {
            updateStep(2, 'processing', '上传中...');

            const promptFormData = new FormData();
            promptFormData.append('file', promptAudioFile);
            promptFormData.append('purpose', 'prompt_audio');

            const promptResponse = await fetch('/api/clone/prompt', {
                method: 'POST',
                headers: { 'x-api-key': apiKey },
                body: promptFormData
            });

            const promptResult = await promptResponse.json();

            if (!promptResponse.ok || !promptResult.success) {
                throw new Error(promptResult.error?.message || '示例音频上传失败');
            }

            promptAudioFileId = promptResult.file_id;
            updateStep(2, 'success', '上传完成');
        } else {
            updateStep(2, 'success', '跳过（未上传）');
        }

        // 步骤 3: 执行音色克隆（含试听）
        updateStep(3, 'processing', '克隆中...');

        const clonePayload = {
            file_id: cloneAudioFileId,
            voice_id: voiceId,
            text: testText,
            model: model
        };

        if (promptAudioFileId) {
            clonePayload.clone_prompt = {
                prompt_audio: promptAudioFileId,
                prompt_text: testText
            };
        }

        if (languageBoost) clonePayload.language_boost = languageBoost;
        if (needNoiseReduction) clonePayload.need_noise_reduction = true;
        if (needVolumeNormalization) clonePayload.need_volume_normalization = true;
        if (aigcWatermark) clonePayload.aigc_watermark = true;

        const executeResponse = await fetch('/api/clone/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(clonePayload)
        });

        const executeResult = await executeResponse.json();

        if (!executeResponse.ok || !executeResult.success) {
            throw new Error(executeResult.error?.message || executeResult.error || '音色克隆失败');
        }

        updateStep(3, 'success', '克隆完成');

        // 步骤 4: 播放试听音频（使用 clone API 返回的 demo_audio URL）
        updateStep(4, 'processing', '加载试听...');

        const cloneData = executeResult.data;
        if (cloneData?.demo_audio) {
            const audioElement = document.getElementById('audioElement');
            audioElement.src = cloneData.demo_audio;
            updateStep(4, 'success', '试听已就绪');
            showCloneResult(voiceId, cloneData.demo_audio);
        } else {
            updateStep(4, 'success', '克隆成功（无试听）');
            showCloneResult(voiceId, null);
        }

        // 风控提示
        if (cloneData?.input_sensitive && cloneData.input_sensitive !== false) {
            showToast('⚠️ 输入音频命中风控，请检查内容', 'error');
        }

        // 添加到自定义音色列表
        addCustomVoice(voiceId, model);
        showToast('音色复刻成功！', 'success');

        // 保存试听音频到数据库
        if (cloneData?.demo_audio && window.currentUser) {
            try {
                const audioRes = await fetch(cloneData.demo_audio);
                const audioBlob = await audioRes.blob();
                const reader = new FileReader();
                reader.onload = async function() {
                    const base64 = reader.result.split(',')[1];
                    try {
                        await fetch('/api/resources', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                type: 'tts-clone',
                                fileBase64: base64,
                                format: 'mp3',
                                model: model || 'speech-2.8-hd',
                                prompt: '音色复刻: ' + voiceId,
                                voiceId: voiceId
                            })
                        });
                        refreshResourceHistory();
                    } catch (e) { console.error('[Clone] 保存资源失败:', e); }
                };
                reader.readAsDataURL(audioBlob);
            } catch (e) { console.error('[Clone] 下载试听音频失败:', e); }
        }

    } catch (error) {
        console.error('Clone error:', error);
        showToast('复刻失败: ' + (error.message || '未知错误'), 'error');

        // 标记失败的步骤
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById('step' + i);
            if (step && !step.querySelector('.status-icon.success')) {
                const icon = step.querySelector('.status-icon');
                if (icon && !icon.classList.contains('success')) {
                    icon.className = 'status-icon error';
                    icon.textContent = '❌';
                }
            }
        }
    } finally {
        cloneBtn.disabled = false;
        cloneBtn.innerHTML = '🎭 开始复刻';
    }
}

function updateStep(stepNum, status, detail) {
    const step = document.getElementById('step' + stepNum);
    if (!step) return;

    const icon = step.querySelector('.status-icon');
    const detailEl = step.querySelector('.status-detail');

    icon.className = 'status-icon ' + status;

    const icons = {
        pending: stepNum,
        processing: '🔄',
        success: '✅',
        error: '❌'
    };

    icon.textContent = icons[status] || stepNum;
    if (detailEl) detailEl.textContent = detail;
}

function showCloneResult(voiceId, demoAudioUrl) {
    const cloneResult = document.getElementById('cloneResult');
    const resultVoiceId = document.getElementById('resultVoiceId');

    resultVoiceId.textContent = voiceId;
    cloneResult.dataset.voiceId = voiceId;
    cloneResult.dataset.demoAudio = demoAudioUrl || '';

    cloneResult.classList.remove('hidden');
}

function playPreview() {
    const audioElement = document.getElementById('audioElement');
    if (audioElement.src) {
        audioElement.play();
    } else {
        showToast('没有可试听的音频', 'error');
    }
}

function downloadCloneAudio() {
    const cloneResult = document.getElementById('cloneResult');
    const demoAudioUrl = cloneResult.dataset.demoAudio;

    if (!demoAudioUrl) {
        // 没有 URL，从 audio 元素下载
        const audioElement = document.getElementById('audioElement');
        if (!audioElement.src) {
            showToast('没有可下载的音频', 'error');
            return;
        }
        const a = document.createElement('a');
        a.href = audioElement.src;
        a.download = `cloned_voice_${Date.now()}.mp3`;
        a.click();
    } else {
        // 从 demo_audio URL 下载
        const a = document.createElement('a');
        a.href = demoAudioUrl;
        a.download = `cloned_voice_${Date.now()}.mp3`;
        a.target = '_blank';
        a.click();
    }

    showToast('开始下载', 'success');
}

function useCloneVoice() {
    const cloneResult = document.getElementById('cloneResult');
    const voiceId = cloneResult.dataset.voiceId;

    if (voiceId) {
        localStorage.setItem('selected_voice_id', voiceId);
        window.location.href = 'streaming.html';
    } else {
        showToast('音色信息无效', 'error');
    }
}

// 自定义音色管理
function loadCustomVoices() {
    const stored = localStorage.getItem('custom_voices');
    if (stored) {
        try {
            customVoices = JSON.parse(stored);
            renderCustomVoices();
        } catch (e) {
            customVoices = [];
        }
    }
}

function saveCustomVoices() {
    localStorage.setItem('custom_voices', JSON.stringify(customVoices));
}

function addCustomVoice(voiceId, model) {
    const existing = customVoices.find(v => v.voice_id === voiceId);
    if (existing) return;

    customVoices.push({
        voice_id: voiceId,
        model: model,
        created_at: new Date().toISOString()
    });

    saveCustomVoices();
    renderCustomVoices();
}

function renderCustomVoices() {
    const listEl = document.getElementById('customVoicesList');
    if (!listEl) return;

    if (customVoices.length === 0) {
        listEl.innerHTML = '<div class="text-muted text-center" style="padding: 20px; font-size: 0.875rem;">暂无自定义音色</div>';
        return;
    }

    listEl.innerHTML = customVoices.map(voice => `
        <div class="voice-item" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div class="voice-name">${voice.voice_id}</div>
                <div class="voice-id">${voice.model}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="useCustomVoice('${voice.voice_id}')">使用</button>
        </div>
    `).join('');
}

function useCustomVoice(voiceId) {
    localStorage.setItem('selected_voice_id', voiceId);
    window.location.href = 'streaming.html';
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
