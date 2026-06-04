"""
网站图片生成脚本（Python 版）
为首页、TTS/Image/Music 三个模块生成专属视觉图片

用法（先 set 环境变量再执行）:
    set MINIMAX_API_KEY=your_key
    python scripts/generate_images.py
"""
import os
import sys
import io
import time
import base64
import requests
from pathlib import Path

# 修复 Windows GBK 编码无法打印 emoji 的问题
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

API_KEY = os.environ.get("MINIMAX_API_KEY")
API_URL = "https://api.minimaxi.com/v1/image_generation"
IMAGES_DIR = Path(__file__).resolve().parent.parent / "images"
IMAGES_DIR.mkdir(exist_ok=True)

# 18 张图片配置
# aspect_ratio: 16:9 hero 背景，1:1 卡片图标，21:9 宽幅 banner
IMAGES = [
    # 首页 hero 背景（6 张，主题色各异）
    {"name": "hero-bg", "aspect": "16:9", "desc": "首页 hero 主背景（蓝紫宇宙）",
     "prompt": "Abstract deep space background, flowing neon blue and purple light waves converging at center, subtle particle effects, futuristic cosmic atmosphere, 4K ultra HD, no text, no people, no logos, cinematic composition, dark theme"},
    {"name": "hero-bg-1", "aspect": "16:9", "desc": "首页 hero 背景 2（声波可视化）",
     "prompt": "Abstract digital waveform visualization, cyan and electric blue glowing lines, audio frequency spectrum aesthetic, dark background with subtle grid pattern, futuristic tech atmosphere, 4K, no text, no logos"},
    {"name": "hero-bg-2", "aspect": "16:9", "desc": "首页 hero 背景 3（神经网络）",
     "prompt": "Abstract neural network visualization, glowing nodes connected with thin luminous lines, deep purple and magenta color palette, dark space background, AI artificial intelligence concept, 4K, no text"},
    {"name": "hero-bg-3", "aspect": "16:9", "desc": "首页 hero 背景 4（粉紫流体）",
     "prompt": "Abstract fluid gradient background, smooth flowing waves of pink magenta and purple, dark navy base color, elegant motion blur effect, modern digital art style, 4K, no text, no logos"},
    {"name": "hero-bg-4", "aspect": "16:9", "desc": "首页 hero 背景 5（赛博城市）",
     "prompt": "Abstract futuristic cityscape at night, deep cyan and teal neon lights, dark sky with stars, cyberpunk aesthetic but elegant, glass and metal skyscrapers with glowing windows, 4K, no text"},
    {"name": "hero-bg-5", "aspect": "16:9", "desc": "首页 hero 背景 6（音乐律动）",
     "prompt": "Abstract musical sound waves converging, golden amber and warm orange light trails, dark indigo background, dynamic flowing energy, music audio concept visualization, 4K, no text"},

    # TTS 模块专属图（青蓝色调）
    {"name": "tts-module-bg", "aspect": "21:9", "desc": "TTS 模块头图（青蓝声波）",
     "prompt": "Wide banner background for voice synthesis technology, cyan blue and teal gradient, subtle sound wave patterns, microphone silhouette in background blur, deep dark theme, 4K, no text"},
    {"name": "streaming-icon", "aspect": "1:1", "desc": "流式合成图标",
     "prompt": "Icon design, modern studio microphone with glowing sound waves emanating outward, cyan blue gradient, dark background, neon glow effect, flat icon style with depth, no text, square 1:1"},
    {"name": "http-icon", "aspect": "1:1", "desc": "HTTP 合成图标",
     "prompt": "Icon design, fast delivery package with sound wave trails, representing instant HTTP response, blue and cyan gradient, dark background, neon glow, no text, square 1:1"},
    {"name": "async-icon", "aspect": "1:1", "desc": "异步合成图标",
     "prompt": "Icon design, cloud computing with hourglass and audio waveform, representing long-form async processing, blue and teal gradient, dark background, neon glow, no text, square 1:1"},
    {"name": "clone-icon", "aspect": "1:1", "desc": "音色复刻图标",
     "prompt": "Icon design, DNA double helix transforming into sound waves, voice cloning concept, blue and purple gradient, dark background, neon glow, futuristic biotech aesthetic, no text, square 1:1"},
    {"name": "voice-design-icon", "aspect": "1:1", "desc": "音色设计图标",
     "prompt": "Icon design, magic wand with sparkles creating voice waveforms, voice design concept, purple and pink gradient, dark background, neon glow, no text, square 1:1"},

    # Image 模块专属图（品红/玫红色调）
    {"name": "image-module-bg", "aspect": "21:9", "desc": "Image 模块头图（品红画笔）",
     "prompt": "Wide banner background for AI image generation, pink magenta and rose gradient, abstract paint brush strokes and color splashes, deep dark theme, 4K, no text"},
    {"name": "text2img-icon", "aspect": "1:1", "desc": "文生图图标",
     "prompt": "Icon design, text bubble transforming into magical painting with sparkles, pink and magenta gradient, dark background, neon glow, no text, square 1:1"},
    {"name": "img2img-icon", "aspect": "1:1", "desc": "图生图图标",
     "prompt": "Icon design, two images morphing into each other with magical aura, image-to-image transformation concept, pink and orange gradient, dark background, neon glow, no text, square 1:1"},

    # Music 模块专属图（紫罗兰/琥珀色调）
    {"name": "music-module-bg", "aspect": "21:9", "desc": "Music 模块头图（紫橙律动）",
     "prompt": "Wide banner background for AI music generation, warm violet and amber orange gradient, flowing musical notes and equalizer bars, deep dark theme, 4K, no text"},
    {"name": "music-generate-icon", "aspect": "1:1", "desc": "音乐生成图标",
     "prompt": "Icon design, music sheet with AI sparkles, creative music generation concept, violet and amber gradient, dark background, neon glow, no text, square 1:1"},
    {"name": "lyrics-icon", "aspect": "1:1", "desc": "歌词生成图标",
     "prompt": "Icon design, magic pen writing poetic text with music notes, AI lyrics generation, violet and pink gradient, dark background, neon glow, no text, square 1:1"},
    {"name": "cover-icon", "aspect": "1:1", "desc": "翻唱生成图标",
     "prompt": "Icon design, vinyl record with rainbow light refractions, cover song remix concept, violet and gold gradient, dark background, neon glow, no text, square 1:1"},
]


def generate(cfg):
    print(f"\n🎨 正在生成: {cfg['name']} - {cfg['desc']}")
    print(f"   Prompt: {cfg['prompt'][:80]}...")

    try:
        resp = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "image-01",
                "prompt": cfg["prompt"],
                "aspect_ratio": cfg["aspect"],
                "response_format": "base64",
                "n": 1
            },
            timeout=120
        )
        resp.raise_for_status()
        data = resp.json()
        imgs = data.get("data", {}).get("image_base64")
        if not imgs:
            print(f"   ❌ 失败: 无图片数据")
            print(f"   响应: {str(data)[:200]}")
            return False

        img_bytes = base64.b64decode(imgs[0])
        ext = "png" if cfg["aspect"] == "1:1" else "jpg"
        filename = f"{cfg['name']}.{ext}"
        filepath = IMAGES_DIR / filename
        filepath.write_bytes(img_bytes)
        print(f"   ✅ 已保存: {filename} ({len(img_bytes)/1024:.1f} KB)")
        return True
    except Exception as e:
        print(f"   ❌ 失败: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   响应: {e.response.text[:200]}")
        return False


def main():
    if not API_KEY:
        print("❌ 错误: 未设置 MINIMAX_API_KEY 环境变量")
        print("   用法: set MINIMAX_API_KEY=你的密钥 && python scripts/generate_images.py")
        sys.exit(1)

    print("🚀 开始生成网站图片资源...\n")
    print(f"   总数: {len(IMAGES)} 张")
    print(f"   输出目录: {IMAGES_DIR}\n")

    success, failed = 0, 0
    for cfg in IMAGES:
        if generate(cfg):
            success += 1
        else:
            failed += 1
        time.sleep(1.5)  # 避免请求过快

    print(f"\n📊 生成结果: 成功 {success} / 失败 {failed}")
    print(f"   输出目录: {IMAGES_DIR}")


if __name__ == "__main__":
    main()
