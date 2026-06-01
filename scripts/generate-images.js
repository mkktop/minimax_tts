/**
 * AI 图片生成脚本
 * 使用 MiniMax Image API 为网站生成配图
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.MINIMAX_API_KEY;
const API_URL = 'https://api.minimaxi.com/v1/image_generation';

const IMAGES_DIR = path.join(__dirname, 'images');

// 确保图片目录存在
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// 要生成的图片
const IMAGES = [
    {
        name: 'hero-bg',
        prompt: 'Futuristic AI voice synthesis concept, blue and purple gradient background, abstract sound wave and microphone elements, modern technology style, 4K, minimalist, elegant',
        aspect_ratio: '16:9',
        description: 'Hero 背景图'
    },
    {
        name: 'streaming-icon',
        prompt: 'Modern technology icon for audio streaming, glowing sound waves emanating from a microphone, blue and purple gradient, futuristic style, clean design, transparent background, 4K',
        aspect_ratio: '1:1',
        description: '同步合成图标'
    },
    {
        name: 'async-icon',
        prompt: 'Cloud computing and audio processing icon, data flow with sound waves, cloud with gears and audio waveform, blue gradient, modern tech style, transparent background, 4K',
        aspect_ratio: '1:1',
        description: '异步合成图标'
    },
    {
        name: 'clone-icon',
        prompt: 'Voice cloning DNA concept icon, double helix DNA strand transforming into sound waves, purple and blue gradient, technology innovation, transparent background, 4K',
        aspect_ratio: '1:1',
        description: '音色复刻图标'
    },
    {
        name: 'feature-tts',
        prompt: 'Professional voice recording studio with microphone and sound waves visualization, modern design with blue ambient lighting, clean and futuristic, 4K',
        aspect_ratio: '16:9',
        description: 'TTS 功能配图'
    }
];

async function generateImage(imageConfig) {
    if (!API_KEY) {
        console.log('⚠️  未设置 MINIMAX_API_KEY 环境变量，跳过图片生成');
        console.log('   请运行: export MINIMAX_API_KEY=你的API密钥');
        console.log('   或在 Windows 上: set MINIMAX_API_KEY=你的API密钥');
        return null;
    }

    console.log(`🎨 正在生成: ${imageConfig.description}`);

    try {
        const response = await axios.post(API_URL, {
            model: 'image-01',
            prompt: imageConfig.prompt,
            aspect_ratio: imageConfig.aspect_ratio,
            response_format: 'base64'
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const images = response.data.data?.image_base64;
        if (!images || images.length === 0) {
            console.error(`❌  生成失败: ${imageConfig.name}`);
            return null;
        }

        // 保存第一张图片
        const imageData = Buffer.from(images[0], 'base64');
        const ext = imageConfig.name.includes('icon') ? 'png' : 'jpg';
        const filename = `${imageConfig.name}.${ext}`;
        const filepath = path.join(IMAGES_DIR, filename);

        fs.writeFileSync(filepath, imageData);
        console.log(`✅ 已保存: ${filename}`);

        return filepath;
    } catch (error) {
        console.error(`❌  生成失败 (${imageConfig.name}): ${error.message}`);
        return null;
    }
}

async function main() {
    console.log('🚀 开始生成 AI 图片...\n');

    const results = [];
    for (const img of IMAGES) {
        const filepath = await generateImage(img);
        if (filepath) {
            results.push({ name: img.name, path: filepath });
        }
    }

    console.log('\n📊 生成结果:');
    if (results.length === 0) {
        console.log('   未生成任何图片（请确保已设置 MINIMAX_API_KEY）');
    } else {
        results.forEach(r => {
            console.log(`   ${r.name}: ${r.path}`);
        });
    }
}

main().catch(console.error);