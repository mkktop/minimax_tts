/**
 * 文生图功能
 */

// API Key 管理由 api-key.js 统一提供
let selectedModel = 'image-01';
let currentMode = 'text2img'; // 'text2img' or 'img2img'
let refImageData = null; // { dataUrl, size, type }
let currentResults = []; // 保存当前生成的图片

// 宽高比定义
const ASPECT_RATIOS = {
    'image-01': [
        { value: '1:1', label: '1:1 (1024×1024)', w: 1024, h: 1024 },
        { value: '16:9', label: '16:9 (1280×720)', w: 1280, h: 720 },
        { value: '4:3', label: '4:3 (1152×864)', w: 1152, h: 864 },
        { value: '3:2', label: '3:2 (1248×832)', w: 1248, h: 832 },
        { value: '2:3', label: '2:3 (832×1248)', w: 832, h: 1248 },
        { value: '3:4', label: '3:4 (864×1152)', w: 864, h: 1152 },
        { value: '9:16', label: '9:16 (720×1280)', w: 720, h: 1280 },
        { value: '21:9', label: '21:9 (1344×576)', w: 1344, h: 576 }
    ],
    'image-01-live': [
        { value: '1:1', label: '1:1 (1024×1024)', w: 1024, h: 1024 },
        { value: '16:9', label: '16:9 (1280×720)', w: 1280, h: 720 },
        { value: '4:3', label: '4:3 (1152×864)', w: 1152, h: 864 },
        { value: '3:2', label: '3:2 (1248×832)', w: 1248, h: 832 },
        { value: '2:3', label: '2:3 (832×1248)', w: 832, h: 1248 },
        { value: '3:4', label: '3:4 (864×1152)', w: 864, h: 1152 },
        { value: '9:16', label: '9:16 (720×1280)', w: 720, h: 1280 }
    ]
};

const STYLE_TYPES = [
    { value: '漫画', label: '📺 漫画' },
    { value: '元气', label: '✨ 元气' },
    { value: '中世纪', label: '🏰 中世纪' },
    { value: '水彩', label: '🎨 水彩' }
];

// ============ 工具函数 ============

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast toast-' + type;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function setPrompt(text) {
    document.getElementById('promptInput').value = text;
    updateCharCount();
}

function updateCharCount() {
    const text = document.getElementById('promptInput').value;
    const len = text.length;
    document.getElementById('charCount').textContent = `${len} / 1500`;
    if (len > 1500) {
        document.getElementById('charCount').style.color = 'var(--accent-red)';
    } else {
        document.getElementById('charCount').style.color = '';
    }
}

function setStatus(text, detail, type) {
    document.getElementById('statusSection').classList.remove('hidden');
    document.getElementById('statusText').textContent = text;
    document.getElementById('statusDetail').textContent = detail || '';
    const icon = document.getElementById('statusIcon');
    icon.className = 'status-icon ' + (type || 'processing');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✗' : '⏳';
}

function hideStatus() {
    document.getElementById('statusSection').classList.add('hidden');
}

// ============ 初始化自定义下拉框 ============
function initAspectRatioSelect() {
    const ratios = ASPECT_RATIOS[selectedModel];
    const container = document.getElementById('aspectRatioSelect');
    if (window.createCustomSelect) {
        const sel = window.createCustomSelect(container, {
            value: '1:1',
            options: ratios.map(r => ({ value: r.value, label: r.label })),
            onChange: (val) => {
                const r = ratios.find(x => x.value === val);
                if (r) document.getElementById('aspectHint').textContent = `${r.w} × ${r.h}`;
            }
        });
        document.getElementById('aspectHint').textContent = `${ratios[0].w} × ${ratios[0].h}`;
    }
}

function initStyleTypeSelect() {
    const container = document.getElementById('styleTypeSelect');
    if (window.createCustomSelect) {
        window.createCustomSelect(container, {
            value: '漫画',
            options: STYLE_TYPES
        });
    }
}

// ============ 切换模型 ============
function switchModel(model) {
    selectedModel = model;
    document.getElementById('styleGroup').style.display = model === 'image-01-live' ? 'block' : 'none';
    initAspectRatioSelect();
}

// ============ 模式切换 ============
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.image-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
    });
    const refSection = document.getElementById('refImageSection');
    refSection.classList.toggle('hidden', mode !== 'img2img');
    document.getElementById('generateBtn').textContent = mode === 'img2img' ? '🖼️ 生成图生图' : '🎨 开始生成';
}

// ============ 参考图上传 ============
function handleRefImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 校验
    if (file.size > 10 * 1024 * 1024) {
        showToast('图片不能超过 10MB', 'error');
        return;
    }
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        showToast('仅支持 JPG / JPEG / PNG 格式', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        refImageData = {
            dataUrl: e.target.result,
            size: file.size,
            type: file.type
        };
        // 显示预览
        document.getElementById('refImagePreviewImg').src = e.target.result;
        document.getElementById('refImagePreview').style.display = 'block';
        document.getElementById('refImagePlaceholder').style.display = 'none';
        const sizeKB = (file.size / 1024).toFixed(1);
        document.getElementById('refImageInfo').textContent = `已选择：${(file.name || 'image').substring(0, 30)} (${sizeKB} KB)`;
        showToast('参考图已上传', 'success');
    };
    reader.readAsDataURL(file);
}

function clearRefImage() {
    refImageData = null;
    document.getElementById('refImagePreviewImg').src = '';
    document.getElementById('refImagePreview').style.display = 'none';
    document.getElementById('refImagePlaceholder').style.display = 'block';
    document.getElementById('refImageInfo').textContent = '';
    document.getElementById('refImageInput').value = '';
}

// ============ 调用 API ============
async function generateImage() {
    const prompt = document.getElementById('promptInput').value.trim();
    if (!prompt) {
        showToast('请输入画面描述', 'error');
        return;
    }
    if (prompt.length > 1500) {
        showToast('描述超过 1500 字符', 'error');
        return;
    }

    // 图生图：必须上传参考图
    if (currentMode === 'img2img' && !refImageData) {
        showToast('请上传人物参考图', 'error');
        return;
    }

    if (!ensureApiKey()) {
        return;
    }
    const apiKey = getApiKey();

    const aspectSel = document.querySelector('#aspectRatioSelect .custom-select-value');
    const aspectRatio = aspectSel ? aspectSel.dataset.value : '1:1';

    const n = parseInt(document.getElementById('countSlider').value);
    const seedVal = document.getElementById('seedInput').value.trim();
    const seed = seedVal ? parseInt(seedVal) : undefined;

    const payload = {
        model: selectedModel,
        prompt,
        aspect_ratio: aspectRatio,
        response_format: 'base64',
        n,
        prompt_optimizer: document.getElementById('promptOptimizer').checked,
        aigc_watermark: document.getElementById('aigcWatermark').checked
    };

    if (seed !== undefined && !isNaN(seed)) {
        payload.seed = seed;
    }

    if (selectedModel === 'image-01-live') {
        const styleValEl = document.querySelector('#styleTypeSelect .custom-select-value');
        if (styleValEl) {
            payload.style = {
                style_type: styleValEl.dataset.value,
                style_weight: parseFloat(document.getElementById('styleWeightSlider').value)
            };
        }
    }

    // 图生图：附加 subject_reference
    if (currentMode === 'img2img' && refImageData) {
        payload.subject_reference = [
            {
                type: 'character',
                image_file: refImageData.dataUrl // 直接传 base64 Data URL
            }
        ];
    }

    const btn = document.getElementById('generateBtn');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = '⏳ 生成中...';
    document.getElementById('resultSection').classList.add('hidden');
    setStatus('正在生成图片...', currentMode === 'img2img' ? '图生图需要 20-40 秒' : '预计需要 10-30 秒，请耐心等待', 'processing');

    try {
        const response = await fetch('/api/image/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || '生成失败');
        }

        const data = result.data;
        const metadata = data.metadata || {};

        if (metadata.failed_count > 0) {
            showToast(`${metadata.success_count} 张成功，${metadata.failed_count} 张因内容安全被拦截`, 'error');
        } else {
            showToast(`成功生成 ${metadata.success_count || 1} 张图片`, 'success');
        }

        const urls = data.data?.image_urls || [];
        const base64List = data.data?.image_base64 || [];

        if (base64List.length > 0) {
            currentResults = base64List.map((b64, i) => ({
                src: `data:image/png;base64,${b64}`,
                index: i,
                isBase64: true
            }));
        } else if (urls.length > 0) {
            currentResults = urls.map((url, i) => ({
                src: url,
                index: i,
                isBase64: false
            }));
        } else {
            throw new Error('未返回图片数据');
        }

        renderResults();
        setStatus('生成完成！', `共 ${currentResults.length} 张图片`, 'success');

    } catch (error) {
        console.error('Generate error:', error);
        setStatus('生成失败', error.message, 'error');
        showToast('生成失败：' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

function renderResults() {
    const grid = document.getElementById('imageGrid');
    grid.innerHTML = '';
    document.getElementById('resultCount').textContent = currentResults.length;
    document.getElementById('resultSection').classList.remove('hidden');

    currentResults.forEach((item, i) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
            <img src="${item.src}" alt="生成图片 ${i + 1}" loading="lazy">
            <div class="image-card-actions">
                <button class="btn btn-secondary" onclick="viewImage(${i})">👁 查看</button>
                <button class="btn btn-primary" onclick="downloadImage(${i})">⬇ 下载</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function viewImage(index) {
    const item = currentResults[index];
    if (!item) return;
    const w = window.open('');
    if (w) {
        w.document.write(`
            <html><head><title>图片预览</title>
            <style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh;display:block}</style>
            </head><body><img src="${item.src}"></body></html>
        `);
    }
}

function downloadImage(index) {
    const item = currentResults[index];
    if (!item) return;
    const a = document.createElement('a');
    a.href = item.src;
    a.download = `minimax_image_${Date.now()}_${index + 1}.png`;
    a.click();
    showToast(`已下载第 ${index + 1} 张`, 'success');
}

async function downloadAll() {
    if (currentResults.length === 0) return;
    showToast(`开始下载 ${currentResults.length} 张图片...`, 'success');
    for (let i = 0; i < currentResults.length; i++) {
        await new Promise(r => setTimeout(r, 200));
        downloadImage(i);
    }
}

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', function() {
    updateApiKeyDisplay();
    initAspectRatioSelect();
    initStyleTypeSelect();

    // 模型选择
    document.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', function() {
            document.querySelectorAll('.model-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            switchModel(this.dataset.model);
        });
    });

    // Tab 切换
    document.querySelectorAll('.image-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchMode(this.dataset.mode);
        });
    });

    // 滑块
    document.getElementById('countSlider').addEventListener('input', function() {
        document.getElementById('countValue').textContent = this.value + ' 张';
    });

    document.getElementById('styleWeightSlider').addEventListener('input', function() {
        document.getElementById('styleWeightValue').textContent = parseFloat(this.value).toFixed(1);
    });

    // 字符计数
    document.getElementById('promptInput').addEventListener('input', updateCharCount);

    // 拖拽上传参考图
    const dropZone = document.getElementById('refImageZone');
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.style.borderColor = 'var(--primary)'; });
        });
        ['dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropZone.style.borderColor = ''; });
        });
        dropZone.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file) {
                const fakeEvent = { target: { files: [file] } };
                handleRefImageUpload(fakeEvent);
            }
        });
    }

    // URL 参数 ?mode=img2img 自动切换
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'img2img') {
        switchMode('img2img');
    }

    // #3 联动：从音乐页传入封面 prompt
    if (params.get('from') === 'music') {
        const imagePrompt = sessionStorage.getItem('image_prompt');
        if (imagePrompt) {
            document.getElementById('promptInput').value = imagePrompt;
            updateCharCount();
            sessionStorage.removeItem('image_prompt');
            showToast('已从音乐页导入封面设计提示', 'success');
        }
    }
    initResourceHistory('image');
});
