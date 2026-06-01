/**
 * 音色复刻 - JavaScript
 * 上传音频样本，克隆你的专属音色
 */

// 状态变量
let cloneAudioFile = null;
let promptAudioFile = null;
let cloneAudioFileId = null;
let promptAudioFileId = null;
let customVoices = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initApiKey();
    initDragDrop();
    loadCustomVoices();
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

    cloneAudioFile = file;

    // 显示文件信息
    const infoEl = document.getElementById('cloneAudioInfo');
    const nameEl = document.getElementById('cloneAudioName');
    const sizeEl = document.getElementById('cloneAudioSize');

    if (infoEl) {
        infoEl.classList.remove('hidden');
        nameEl.textContent = file.name;
        sizeEl.textContent = formatFileSize(file.size);
    }

    showToast('克隆音频已选择', 'success');
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

    // 示例音频应小于 8 秒
    promptAudioFile = file;

    const infoEl = document.getElementById('promptAudioInfo');
    const nameEl = document.getElementById('promptAudioName');
    const sizeEl = document.getElementById('promptAudioSize');

    if (infoEl) {
        infoEl.classList.remove('hidden');
        nameEl.textContent = file.name;
        sizeEl.textContent = formatFileSize(file.size);
    }

    showToast('示例音频已选择', 'success');
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 开始复刻
async function startClone() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showApiKeyModal();
        return;
    }

    if (!cloneAudioFile) {
        showToast('请上传克隆音频', 'error');
        return;
    }

    const voiceId = document.getElementById('voiceIdInput').value.trim();
    if (!voiceId) {
        showToast('请输入自定义音色 ID', 'error');
        return;
    }

    // 验证 voice_id 格式（只能包含字母、数字、下划线）
    if (!/^[a-zA-Z0-9_]+$/.test(voiceId)) {
        showToast('音色 ID 只能包含字母、数字和下划线', 'error');
        return;
    }

    const testText = document.getElementById('testTextInput').value.trim() || '您好，这是您的专属音色试听。';
    const model = document.getElementById('modelSelect').value;

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
            headers: {
                'x-api-key': apiKey
            },
            body: cloneFormData
        });

        const cloneResult1 = await cloneResponse.json();

        if (!cloneResponse.ok || !cloneResult1.success) {
            throw new Error(cloneResult1.error?.message || '克隆音频上传失败');
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
                headers: {
                    'x-api-key': apiKey
                },
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

        // 步骤 3: 执行音色克隆
        updateStep(3, 'processing', '克隆中...');

        const clonePayload = {
            file_id: cloneAudioFileId,
            voice_id: voiceId,
            model: model,
            text: testText
        };

        if (promptAudioFileId) {
            clonePayload.clone_prompt = {
                prompt_audio: promptAudioFileId,
                prompt_text: testText
            };
        }

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
            throw new Error(executeResult.error?.message || '音色克隆失败');
        }

        updateStep(3, 'success', '克隆完成');

        // 步骤 4: 生成试听音频（使用刚克隆的音色合成测试文本）
        updateStep(4, 'processing', '生成试听中...');

        const synthResponse = await fetch('/api/tts/http', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                model: model,
                text: testText,
                voice_setting: {
                    voice_id: voiceId,
                    speed: 1,
                    pitch: 0,
                    vol: 1
                },
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 1
                }
            })
        });

        if (!synthResponse.ok) {
            // 克隆成功但试听失败
            updateStep(4, 'success', '克隆成功（试听生成失败）');
            showCloneResult(voiceId, null);
        } else {
            const audioData = await synthResponse.arrayBuffer();
            const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);

            const audioElement = document.getElementById('audioElement');
            audioElement.src = audioUrl;

            updateStep(4, 'success', '试听生成完成');
            showCloneResult(voiceId, audioBlob);
        }

        // 添加到自定义音色列表
        addCustomVoice(voiceId, model);

        showToast('音色复刻成功！', 'success');

    } catch (error) {
        console.error('Clone error:', error);
        showToast('复刻失败: ' + (error.message || '未知错误'), 'error');

        // 标记失败的步骤
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById('step' + i);
            if (step && !step.querySelector('.status-icon.success')) {
                const icon = step.querySelector('.status-icon');
                const detail = step.querySelector('.status-detail');
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

function showCloneResult(voiceId, audioBlob) {
    const cloneResult = document.getElementById('cloneResult');
    const resultVoiceId = document.getElementById('resultVoiceId');

    resultVoiceId.textContent = voiceId;

    // 保存音频blob供下载和试听使用
    cloneResult.dataset.audioBlob = audioBlob ? 'true' : 'false';
    if (audioBlob) {
        cloneResult.dataset.voiceId = voiceId;
    }

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
    const audioElement = document.getElementById('audioElement');
    if (!audioElement.src) {
        showToast('没有可下载的音频', 'error');
        return;
    }

    // 从 audio 元素获取音频数据
    const audioUrl = audioElement.src;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `cloned_voice_${Date.now()}.mp3`;
    a.click();

    showToast('开始下载', 'success');
}

function useCloneVoice() {
    // 跳转到同步合成页面，使用刚复刻的音色
    const cloneResult = document.getElementById('cloneResult');
    const voiceId = cloneResult.dataset.voiceId;

    if (voiceId) {
        // 保存到 localStorage 供其他页面使用
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
    // 检查是否已存在
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