/**
 * 为功能页面生成模块背景图
 * 用法: node scripts/gen-page-bg.js <API_KEY>
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2] || process.env.MINIMAX_API_KEY;
if (!API_KEY) { console.error('Need API_KEY'); process.exit(1); }

const IMAGES_DIR = path.join(__dirname, '..', 'images');
const API_URL = 'https://api.minimaxi.com/v1/image_generation';

const IMAGES = [
    {
        name: 'tts-page-bg',
        prompt: 'Sound wave audio visualization, deep blue and cyan glowing frequency bars, microphone silhouette, dark navy background, audio spectrum aesthetic, professional studio atmosphere, 4K ultra HD wallpaper, no text no logos no people',
    },
    {
        name: 'image-page-bg',
        prompt: 'Abstract digital art canvas, colorful paint splashes and brush strokes, vibrant gradient from purple to orange, modern art gallery atmosphere with soft lighting, creative artistic background, 4K wallpaper, no text no logos no people',
    },
    {
        name: 'music-page-bg',
        prompt: 'Musical notes floating in space, golden treble clef and musical symbols, deep purple and gold color scheme, concert stage lights bokeh effect, elegant musical atmosphere, 4K ultra HD wallpaper, no text no logos no people',
    },
];

async function generate() {
    for (const img of IMAGES) {
        console.log(`Generating ${img.name}...`);
        try {
            const res = await axios.post(API_URL, {
                model: 'image-01',
                prompt: img.prompt,
                aspect_ratio: '21:9',
                n: 1,
                response_format: 'base64'
            }, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });

            const b64 = res.data.data.image_base64[0];
            const buf = Buffer.from(b64, 'base64');
            const filePath = path.join(IMAGES_DIR, `${img.name}.jpg`);
            fs.writeFileSync(filePath, buf);
            console.log(`  OK: ${img.name}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
        } catch (err) {
            console.error(`  FAIL: ${img.name}: ${err.message}`);
        }
    }
    console.log('All done!');
}

generate();
