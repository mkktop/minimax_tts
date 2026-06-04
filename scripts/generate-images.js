/**
 * 网站图片生成脚本
 * 为首页、TTS/Image/Music 三个模块生成专属视觉图片
 *
 * 用法：node scripts/generate-images.js
 * 需要环境变量 MINIMAX_API_KEY
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 优先从环境变量读取 API Key
// 也可以通过命令行参数传入: node scripts/generate-images.js <API_KEY>
let API_KEY = process.argv[2] || process.env.MINIMAX_API_KEY;
const API_URL = 'https://api.minimaxi.com/v1/image_generation';
const IMAGES_DIR = path.join(__dirname, '..', 'images');

if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// 要生成的图片清单
// aspect_ratio: 16:9 用于 hero 背景，1:1 用于卡片图标，21:9 用于宽幅 banner
const IMAGES = [
    // ===== 首页 hero 背景（4 张） =====
    {
        name: 'hero-bg',
        prompt: 'Abstract deep space background, flowing neon blue and purple light waves converging at center, subtle particle effects, futuristic cosmic atmosphere, 4K ultra HD, no text, no people, no logos, cinematic composition, dark theme',
        aspect_ratio: '16:9',
        description: '首页 hero 主背景（蓝紫宇宙）'
    },
    {
        name: 'hero-bg-1',
        prompt: 'Abstract digital waveform visualization, cyan and electric blue glowing lines, audio frequency spectrum aesthetic, dark background with subtle grid pattern, futuristic tech atmosphere, 4K, no text, no logos',
        aspect_ratio: '16:9',
        description: '首页 hero 背景 2（声波可视化）'
    },
    {
        name: 'hero-bg-2',
        prompt: 'Abstract neural network visualization, glowing nodes connected with thin luminous lines, deep purple and magenta color palette, dark space background, AI artificial intelligence concept, 4K, no text',
        aspect_ratio: '16:9',
        description: '首页 hero 背景 3（神经网络）'
    },
    {
        name: 'hero-bg-3',
        prompt: 'Abstract fluid gradient background, smooth flowing waves of pink magenta and purple, dark navy base color, elegant motion blur effect, modern digital art style, 4K, no text, no logos',
        aspect_ratio: '16:9',
        description: '首页 hero 背景 4（粉紫渐变流体）'
    },
    {
        name: 'hero-bg-4',
        prompt: 'Abstract futuristic cityscape at night, deep cyan and teal neon lights, dark sky with stars, cyberpunk aesthetic but elegant, glass and metal skyscrapers with glowing windows, 4K, no text',
        aspect_ratio: '16:9',
        description: '首页 hero 背景 5（赛博城市）'
    },
    {
        name: 'hero-bg-5',
        prompt: 'Abstract musical sound waves converging, golden amber and warm orange light trails, dark indigo background, dynamic flowing energy, music audio concept visualization, 4K, no text',
        aspect_ratio: '16:9',
        description: '首页 hero 背景 6（音乐律动）'
    },

    // ===== TTS 模块专属图 =====
    {
        name: 'tts-module-bg',
        prompt: 'Abstract background for voice synthesis technology, cyan blue and teal gradient, subtle sound wave patterns, microphone silhouette in background blur, deep dark theme, 4K, no text',
        aspect_ratio: '21:9',
        description: 'TTS 模块头图（青蓝声波）'
    },
    {
        name: 'streaming-icon',
        prompt: 'Icon design, modern studio microphone with glowing sound waves emanating outward, cyan blue gradient, dark background, neon glow effect, flat icon style with depth, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '流式合成图标'
    },
    {
        name: 'http-icon',
        prompt: 'Icon design, fast delivery package with sound wave trails, representing instant HTTP response, blue and cyan gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: 'HTTP 合成图标'
    },
    {
        name: 'async-icon',
        prompt: 'Icon design, cloud computing with hourglass and audio waveform, representing long-form async processing, blue and teal gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '异步合成图标'
    },
    {
        name: 'clone-icon',
        prompt: 'Icon design, DNA double helix transforming into sound waves, voice cloning concept, blue and purple gradient, dark background, neon glow, futuristic biotech aesthetic, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '音色复刻图标'
    },
    {
        name: 'voice-design-icon',
        prompt: 'Icon design, magic wand with sparkles creating voice waveforms, voice design concept, purple and pink gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '音色设计图标'
    },

    // ===== Image 模块专属图 =====
    {
        name: 'image-module-bg',
        prompt: 'Abstract background for AI image generation, pink magenta and rose gradient, abstract paint brush strokes and color splashes, deep dark theme, 4K, no text',
        aspect_ratio: '21:9',
        description: 'Image 模块头图（品红画笔）'
    },
    {
        name: 'text2img-icon',
        prompt: 'Icon design, text bubble transforming into magical painting with sparkles, pink and magenta gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '文生图图标'
    },
    {
        name: 'img2img-icon',
        prompt: 'Icon design, two images morphing into each other with magical aura, image-to-image transformation concept, pink and orange gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '图生图图标'
    },

    // ===== Music 模块专属图 =====
    {
        name: 'music-module-bg',
        prompt: 'Abstract background for AI music generation, warm violet and amber orange gradient, flowing musical notes and equalizer bars, deep dark theme, 4K, no text',
        aspect_ratio: '21:9',
        description: 'Music 模块头图（紫橙律动）'
    },
    {
        name: 'music-generate-icon',
        prompt: 'Icon design, music sheet with AI sparkles, creative music generation concept, violet and amber gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '音乐生成图标'
    },
    {
        name: 'lyrics-icon',
        prompt: 'Icon design, magic pen writing poetic text with music notes, AI lyrics generation, violet and pink gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '歌词生成图标'
    },
    {
        name: 'cover-icon',
        prompt: 'Icon design, vinyl record with rainbow light refractions, cover song remix concept, violet and gold gradient, dark background, neon glow, no text, square 1:1',
        aspect_ratio: '1:1',
        description: '翻唱生成图标'
    }
];

async function generateImage(config) {
    console.log(`\n🎨 正在生成: ${config.name} - ${config.description}`);
    console.log(`   Prompt: ${config.prompt.slice(0, 80)}...`);

    try {
        const response = await axios.post(API_URL, {
            model: 'image-01',
            prompt: config.prompt,
            aspect_ratio: config.aspect_ratio,
            response_format: 'base64',
            n: 1
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        const images = response.data?.data?.image_base64;
        if (!images || images.length === 0) {
            console.error(`   ❌ 失败: 无图片数据`);
            console.error(`   响应: ${JSON.stringify(response.data).slice(0, 200)}`);
            return false;
        }

        const imageData = Buffer.from(images[0], 'base64');
        const ext = config.aspect_ratio === '1:1' ? 'png' : 'jpg';
        const filename = `${config.name}.${ext}`;
        const filepath = path.join(IMAGES_DIR, filename);

        fs.writeFileSync(filepath, imageData);
        console.log(`   ✅ 已保存: ${filename} (${(imageData.length / 1024).toFixed(1)} KB)`);
        return true;
    } catch (error) {
        console.error(`   ❌ 失败: ${error.message}`);
        if (error.response) {
            console.error(`   响应: ${JSON.stringify(error.response.data).slice(0, 200)}`);
        }
        return false;
    }
}

async function main() {
    if (!API_KEY) {
        console.error('❌ 错误: 未提供 API Key');
        console.error('   用法 1: set MINIMAX_API_KEY=你的密钥 && node scripts/generate-images.js');
        console.error('   用法 2: node scripts/generate-images.js <API_KEY>');
        process.exit(1);
    }

    console.log('🚀 开始生成网站图片资源...\n');
    console.log(`   总数: ${IMAGES.length} 张`);
    console.log(`   输出目录: ${IMAGES_DIR}\n`);

    const results = { success: 0, failed: 0 };
    for (const config of IMAGES) {
        const ok = await generateImage(config);
        if (ok) results.success++;
        else results.failed++;
        // 避免请求过快
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n📊 生成结果: 成功 ${results.success} / 失败 ${results.failed}`);
    console.log(`   输出目录: ${IMAGES_DIR}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
