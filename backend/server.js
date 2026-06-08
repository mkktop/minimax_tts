/**
 * MiniMax TTS 后端服务
 * 提供 API Key 保护、用户认证和文件上传代理
 */

// 加载 .env 环境变量（必须在最顶部）
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const WebSocket = require('ws');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

// 数据库与认证模块
const db = require('./db/database');
const { requireAuth, authenticateWebSocket } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const resourcesRouter = require('./routes/resources');

const app = express();
const PORT = process.env.PORT || 3000;

// 创建 HTTP 服务器（用于 WebSocket 升级）
const server = http.createServer(app);

/**
 * 调用系统 ffmpeg 转码
 * @param {Buffer} inputBuffer  输入音频二进制
 * @param {string[]} args        ffmpeg 参数（不含输入文件名，固定从 stdin 读）
 * @returns {Promise<Buffer>}    输出音频二进制
 */
function ffmpegConvert(inputBuffer, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args, 'pipe:1']);
        const chunks = [];
        proc.stdout.on('data', c => chunks.push(c));
        proc.on('error', reject);
        proc.on('close', code => {
            if (code === 0) resolve(Buffer.concat(chunks));
            else reject(new Error(`ffmpeg 退出码 ${code}`));
        });
        proc.stdin.on('error', () => {}); // 子进程可能主动关闭
        proc.stdin.write(inputBuffer);
        proc.stdin.end();
    });
}

/**
 * mp3 → ogg/opus (16kHz 单声道 32kbps，适配小智 ESP32 协议)
 */
async function mp3ToOggOpus(mp3Buffer) {
    return ffmpegConvert(mp3Buffer, [
        '-f', 'mp3',
        '-c:a', 'libopus',
        '-ar', '16000',
        '-ac', '1',
        '-b:a', '32k',
        '-application', 'voip',
        '-vbr', 'on',
        '-compression_level', '10',
        '-f', 'ogg'
    ]);
}


// 文件上传配置
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// 中间件
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Session 配置
const SESSION_SECRET = process.env.SESSION_SECRET || 'minimax-studio-change-me-in-production';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'minimax.sid';

// 自定义 MySQL Session Store
class MySQLSessionStore extends session.Store {
    constructor() {
        super();
    }
    async get(sid, callback) {
        try {
            const data = await db.getSession(sid);
            if (!data) return callback(null, null);
            callback(null, data);
        } catch (err) {
            callback(err);
        }
    }
    async set(sid, sessionData, callback) {
        try {
            const ttl = sessionData.cookie?.maxAge || 86400000;
            await db.setSession(sid, sessionData, ttl);
            callback && callback();
        } catch (err) {
            callback && callback(err);
        }
    }
    async destroy(sid, callback) {
        try {
            await db.destroySession(sid);
            callback && callback();
        } catch (err) {
            callback && callback(err);
        }
    }
    async touch(sid, sessionData, callback) {
        try {
            const ttl = sessionData.cookie?.maxAge || 86400000;
            await db.setSession(sid, sessionData, ttl);
            callback && callback();
        } catch (err) {
            callback && callback(err);
        }
    }
}

app.use(session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new MySQLSessionStore(),
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, filePath) => {
        // JS/CSS/HTML 文件不缓存，确保用户总能拿到最新版本
        if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// 根路径返回首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// MiniMax API 配置
const MINIMAX_API_BASE = 'https://api.minimaxi.com';

// 音色列表（从文档中整理）
const VOICES = {
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
        { id: 'male-qn-jingying-jingpin', name: '精英青年音色-beta' },
        { id: 'male-qn-badao-jingpin', name: '霸道青年音色-beta' },
        { id: 'male-qn-daxuesheng-jingpin', name: '青年大学生音色-beta' },
        { id: 'female-shaonv-jingpin', name: '少女音色-beta' },
        { id: 'female-yujie-jingpin', name: '御姐音色-beta' },
        { id: 'female-chengshu-jingpin', name: '成熟女性音色-beta' },
        { id: 'female-tianmei-jingpin', name: '甜美女性音色-beta' },
        { id: 'clever_boy', name: '聪明男童' },
        { id: 'cute_boy', name: '可爱男童' },
        { id: 'lovely_girl', name: '萌萌女童' },
        { id: 'cartoon_pig', name: '卡通猪小琪' },
        { id: 'bingjiao_didi', name: '病娇弟弟' },
        { id: 'junlang_nanyou', name: '俊朗男友' },
        { id: 'chunzhen_xuedi', name: '纯真学弟' },
        { id: 'lengdan_xiongzhang', name: '冷淡学长' },
        { id: 'badao_shaoye', name: '霸道少爷' },
        { id: 'tianxin_xiaoling', name: '甜心小玲' },
        { id: 'qiaopi_mengmei', name: '俏皮萌妹' },
        { id: 'wumei_yujie', name: '妩媚御姐' },
        { id: 'diadia_xuemei', name: '嗲嗲学妹' },
        { id: 'danya_xuejie', name: '淡雅学姐' },
        { id: 'Chinese (Mandarin)_Reliable_Executive', name: '沉稳高管' },
        { id: 'Chinese (Mandarin)_News_Anchor', name: '新闻女声' },
        { id: 'Chinese (Mandarin)_Mature_Woman', name: '傲娇御姐' },
        { id: 'Chinese (Mandarin)_Unrestrained_Young_Man', name: '不羁青年' },
        { id: 'Arrogant_Miss', name: '嚣张小姐' },
        { id: 'Robot_Armor', name: '机械战甲' },
        { id: 'Chinese (Mandarin)_Kind-hearted_Antie', name: '热心大婶' },
        { id: 'Chinese (Mandarin)_HK_Flight_Attendant', name: '港普空姐' },
        { id: 'Chinese (Mandarin)_Humorous_Elder', name: '搞笑大爷' },
        { id: 'Chinese (Mandarin)_Gentleman', name: '温润男声' },
        { id: 'Chinese (Mandarin)_Warm_Bestie', name: '温暖闺蜜' },
        { id: 'Chinese (Mandarin)_Male_Announcer', name: '播报男声' },
        { id: 'Chinese (Mandarin)_Sweet_Lady', name: '甜美女声' },
        { id: 'Chinese (Mandarin)_Southern_Young_Man', name: '南方小哥' },
        { id: 'Chinese (Mandarin)_Wise_Women', name: '阅历姐姐' },
        { id: 'Chinese (Mandarin)_Gentle_Youth', name: '温润青年' },
        { id: 'Chinese (Mandarin)_Warm_Girl', name: '温暖少女' },
        { id: 'Chinese (Mandarin)_Kind-hearted_Elder', name: '花甲奶奶' },
        { id: 'Chinese (Mandarin)_Cute_Spirit', name: '憨憨萌兽' },
        { id: 'Chinese (Mandarin)_Radio_Host', name: '电台男主播' },
        { id: 'Chinese (Mandarin)_Lyrical_Voice', name: '抒情男声' },
        { id: 'Chinese (Mandarin)_Straightforward_Boy', name: '率真弟弟' },
        { id: 'Chinese (Mandarin)_Sincere_Adult', name: '真诚青年' },
        { id: 'Chinese (Mandarin)_Gentle_Senior', name: '温柔学姐' },
        { id: 'Chinese (Mandarin)_Stubborn_Friend', name: '嘴硬竹马' },
        { id: 'Chinese (Mandarin)_Crisp_Girl', name: '清脆少女' },
        { id: 'Chinese (Mandarin)_Pure-hearted_Boy', name: '清澈邻家弟弟' },
        { id: 'Chinese (Mandarin)_Soft_Girl', name: '柔和少女' }
    ],
    '中文（粤语）': [
        { id: 'Cantonese_ProfessionalHost（F）', name: '专业女主持' },
        { id: 'Cantonese_GentleLady', name: '温柔女声' },
        { id: 'Cantonese_ProfessionalHost（M）', name: '专业男主持' },
        { id: 'Cantonese_PlayfulMan', name: '活泼男声' },
        { id: 'Cantonese_CuteGirl', name: '可爱女孩' },
        { id: 'Cantonese_KindWoman', name: '善良女声' }
    ],
    '英文': [
        { id: 'Santa_Claus', name: 'Santa Claus' },
        { id: 'Grinch', name: 'Grinch' },
        { id: 'Rudolph', name: 'Rudolph' },
        { id: 'Arnold', name: 'Arnold' },
        { id: 'Charming_Santa', name: 'Charming Santa' },
        { id: 'Charming_Lady', name: 'Charming Lady' },
        { id: 'Sweet_Girl', name: 'Sweet Girl' },
        { id: 'Cute_Elf', name: 'Cute Elf' },
        { id: 'Attractive_Girl', name: 'Attractive Girl' },
        { id: 'Serene_Woman', name: 'Serene Woman' },
        { id: 'English_Trustworthy_Man', name: 'Trustworthy Man' },
        { id: 'English_Graceful_Lady', name: 'Graceful Lady' },
        { id: 'English_Aussie_Bloke', name: 'Aussie Bloke' },
        { id: 'English_Whispering_girl', name: 'Whispering girl' },
        { id: 'English_Diligent_Man', name: 'Diligent Man' },
        { id: 'English_Gentle-voiced_man', name: 'Gentle-voiced man' }
    ],
    '日文': [
        { id: 'Japanese_IntellectualSenior', name: 'Intellectual Senior' },
        { id: 'Japanese_DecisivePrincess', name: 'Decisive Princess' },
        { id: 'Japanese_LoyalKnight', name: 'Loyal Knight' },
        { id: 'Japanese_DominantMan', name: 'Dominant Man' },
        { id: 'Japanese_SeriousCommander', name: 'Serious Commander' },
        { id: 'Japanese_ColdQueen', name: 'Cold Queen' },
        { id: 'Japanese_DependableWoman', name: 'Dependable Woman' },
        { id: 'Japanese_GentleButler', name: 'Gentle Butler' },
        { id: 'Japanese_KindLady', name: 'Kind Lady' },
        { id: 'Japanese_CalmLady', name: 'Calm Lady' },
        { id: 'Japanese_OptimisticYouth', name: 'Optimistic Youth' },
        { id: 'Japanese_GenerousIzakayaOwner', name: 'Generous Izakaya Owner' },
        { id: 'Japanese_SportyStudent', name: 'Sporty Student' },
        { id: 'Japanese_InnocentBoy', name: 'Innocent Boy' },
        { id: 'Japanese_GracefulMaiden', name: 'Graceful Maiden' }
    ],
    '韩文': [
        { id: 'Korean_SweetGirl', name: 'Sweet Girl' },
        { id: 'Korean_CheerfulBoyfriend', name: 'Cheerful Boyfriend' },
        { id: 'Korean_EnchantingSister', name: 'Enchanting Sister' },
        { id: 'Korean_ShyGirl', name: 'Shy Girl' },
        { id: 'Korean_ReliableSister', name: 'Reliable Sister' },
        { id: 'Korean_StrictBoss', name: 'Strict Boss' },
        { id: 'Korean_SassyGirl', name: 'Sassy Girl' },
        { id: 'Korean_ChildhoodFriendGirl', name: 'Childhood Friend Girl' },
        { id: 'Korean_PlayboyCharmer', name: 'Playboy Charmer' },
        { id: 'Korean_ElegantPrincess', name: 'Elegant Princess' },
        { id: 'Korean_BraveFemaleWarrior', name: 'Brave Female Warrior' },
        { id: 'Korean_BraveYouth', name: 'Brave Youth' },
        { id: 'Korean_CalmLady', name: 'Calm Lady' },
        { id: 'Korean_EnthusiasticTeen', name: 'Enthusiastic Teen' },
        { id: 'Korean_SoothingLady', name: 'Soothing Lady' },
        { id: 'Korean_IntellectualSenior', name: 'Intellectual Senior' },
        { id: 'Korean_LonelyWarrior', name: 'Lonely Warrior' },
        { id: 'Korean_MatureLady', name: 'Mature Lady' },
        { id: 'Korean_InnocentBoy', name: 'Innocent Boy' },
        { id: 'Korean_CharmingSister', name: 'Charming Sister' },
        { id: 'Korean_AthleticStudent', name: 'Athletic Student' },
        { id: 'Korean_BraveAdventurer', name: 'Brave Adventurer' },
        { id: 'Korean_CalmGentleman', name: 'Calm Gentleman' },
        { id: 'Korean_WiseElf', name: 'Wise Elf' },
        { id: 'Korean_CheerfulCoolJunior', name: 'Cheerful Cool Junior' },
        { id: 'Korean_DecisiveQueen', name: 'Decisive Queen' },
        { id: 'Korean_ColdYoungMan', name: 'Cold Young Man' },
        { id: 'Korean_MysteriousGirl', name: 'Mysterious Girl' },
        { id: 'Korean_QuirkyGirl', name: 'Quirky Girl' },
        { id: 'Korean_ConsiderateSenior', name: 'Considerate Senior' },
        { id: 'Korean_CheerfulLittleSister', name: 'Cheerful Little Sister' },
        { id: 'Korean_DominantMan', name: 'Dominant Man' },
        { id: 'Korean_AirheadedGirl', name: 'Airheaded Girl' },
        { id: 'Korean_ReliableYouth', name: 'Reliable Youth' },
        { id: 'Korean_FriendlyBigSister', name: 'Friendly Big Sister' },
        { id: 'Korean_GentleBoss', name: 'Gentle Boss' },
        { id: 'Korean_ColdGirl', name: 'Cold Girl' },
        { id: 'Korean_HaughtyLady', name: 'Haughty Lady' },
        { id: 'Korean_CharmingElderSister', name: 'Charming Elder Sister' },
        { id: 'Korean_IntellectualMan', name: 'Intellectual Man' },
        { id: 'Korean_CaringWoman', name: 'Caring Woman' },
        { id: 'Korean_WiseTeacher', name: 'Wise Teacher' },
        { id: 'Korean_ConfidentBoss', name: 'Confident Boss' },
        { id: 'Korean_AthleticGirl', name: 'Athletic Girl' },
        { id: 'Korean_PossessiveMan', name: 'Possessive Man' },
        { id: 'Korean_GentleWoman', name: 'Gentle Woman' },
        { id: 'Korean_CockyGuy', name: 'Cocky Guy' },
        { id: 'Korean_ThoughtfulWoman', name: 'Thoughtful Woman' },
        { id: 'Korean_OptimisticYouth', name: 'Optimistic Youth' }
    ],
    '西班牙文': [
        { id: 'Spanish_SereneWoman', name: 'Serene Woman' },
        { id: 'Spanish_MaturePartner', name: 'Mature Partner' },
        { id: 'Spanish_CaptivatingStoryteller', name: 'Captivating Storyteller' },
        { id: 'Spanish_Narrator', name: 'Narrator' },
        { id: 'Spanish_WiseScholar', name: 'Wise Scholar' },
        { id: 'Spanish_Kind-heartedGirl', name: 'Kind-hearted Girl' },
        { id: 'Spanish_DeterminedManager', name: 'Determined Manager' },
        { id: 'Spanish_BossyLeader', name: 'Bossy Leader' },
        { id: 'Spanish_ReservedYoungMan', name: 'Reserved Young Man' },
        { id: 'Spanish_ConfidentWoman', name: 'Confident Woman' },
        { id: 'Spanish_ThoughtfulMan', name: 'Thoughtful Man' },
        { id: 'Spanish_Strong-WilledBoy', name: 'Strong-willed Boy' },
        { id: 'Spanish_SophisticatedLady', name: 'Sophisticated Lady' },
        { id: 'Spanish_RationalMan', name: 'Rational Man' },
        { id: 'Spanish_AnimeCharacter', name: 'Anime Character' },
        { id: 'Spanish_Deep-tonedMan', name: 'Deep-toned Man' },
        { id: 'Spanish_Fussyhostess', name: 'Fussy hostess' },
        { id: 'Spanish_SincereTeen', name: 'Sincere Teen' },
        { id: 'Spanish_FrankLady', name: 'Frank Lady' },
        { id: 'Spanish_Comedian', name: 'Comedian' },
        { id: 'Spanish_Debator', name: 'Debator' },
        { id: 'Spanish_ToughBoss', name: 'Tough Boss' },
        { id: 'Spanish_Wiselady', name: 'Wise Lady' },
        { id: 'Spanish_Steadymentor', name: 'Steady Mentor' },
        { id: 'Spanish_Jovialman', name: 'Jovial Man' },
        { id: 'Spanish_SantaClaus', name: 'Santa Claus' },
        { id: 'Spanish_Rudolph', name: 'Rudolph' },
        { id: 'Spanish_Intonategirl', name: 'Intonate Girl' },
        { id: 'Spanish_Arnold', name: 'Arnold' },
        { id: 'Spanish_Ghost', name: 'Ghost' },
        { id: 'Spanish_HumorousElder', name: 'Humorous Elder' },
        { id: 'Spanish_EnergeticBoy', name: 'Energetic Boy' },
        { id: 'Spanish_WhimsicalGirl', name: 'Whimsical Girl' },
        { id: 'Spanish_StrictBoss', name: 'Strict Boss' },
        { id: 'Spanish_ReliableMan', name: 'Reliable Man' },
        { id: 'Spanish_SereneElder', name: 'Serene Elder' },
        { id: 'Spanish_AngryMan', name: 'Angry Man' },
        { id: 'Spanish_AssertiveQueen', name: 'Assertive Queen' },
        { id: 'Spanish_CaringGirlfriend', name: 'Caring Girlfriend' },
        { id: 'Spanish_PowerfulSoldier', name: 'Powerful Soldier' },
        { id: 'Spanish_PassionateWarrior', name: 'Passionate Warrior' },
        { id: 'Spanish_ChattyGirl', name: 'Chatty Girl' },
        { id: 'Spanish_RomanticHusband', name: 'Romantic Husband' },
        { id: 'Spanish_CompellingGirl', name: 'Compelling Girl' },
        { id: 'Spanish_PowerfulVeteran', name: 'Powerful Veteran' },
        { id: 'Spanish_SensibleManager', name: 'Sensible Manager' },
        { id: 'Spanish_ThoughtfulLady', name: 'Thoughtful Lady' }
    ],
    '葡萄牙文': [
        { id: 'Portuguese_SentimentalLady', name: 'Sentimental Lady' },
        { id: 'Portuguese_BossyLeader', name: 'Bossy Leader' },
        { id: 'Portuguese_Wiselady', name: 'Wise lady' },
        { id: 'Portuguese_Strong-WilledBoy', name: 'Strong-willed Boy' },
        { id: 'Portuguese_Deep-VoicedGentleman', name: 'Deep-voiced Gentleman' },
        { id: 'Portuguese_UpsetGirl', name: 'Upset Girl' },
        { id: 'Portuguese_PassionateWarrior', name: 'Passionate Warrior' },
        { id: 'Portuguese_AnimeCharacter', name: 'Anime Character' },
        { id: 'Portuguese_ConfidentWoman', name: 'Confident Woman' },
        { id: 'Portuguese_AngryMan', name: 'Angry Man' },
        { id: 'Portuguese_CaptivatingStoryteller', name: 'Captivating Storyteller' },
        { id: 'Portuguese_Godfather', name: 'Godfather' },
        { id: 'Portuguese_ReservedYoungMan', name: 'Reserved Young Man' },
        { id: 'Portuguese_SmartYoungGirl', name: 'Smart Young Girl' },
        { id: 'Portuguese_Kind-heartedGirl', name: 'Kind-hearted Girl' },
        { id: 'Portuguese_Pompouslady', name: 'Pompous lady' },
        { id: 'Portuguese_Grinch', name: 'Grinch' },
        { id: 'Portuguese_Debator', name: 'Debator' },
        { id: 'Portuguese_SweetGirl', name: 'Sweet Girl' },
        { id: 'Portuguese_AttractiveGirl', name: 'Attractive Girl' },
        { id: 'Portuguese_ThoughtfulMan', name: 'Thoughtful Man' },
        { id: 'Portuguese_PlayfulGirl', name: 'Playful Girl' },
        { id: 'Portuguese_GorgeousLady', name: 'Gorgeous Lady' },
        { id: 'Portuguese_LovelyLady', name: 'Lovely Lady' },
        { id: 'Portuguese_SereneWoman', name: 'Serene Woman' },
        { id: 'Portuguese_SadTeen', name: 'Sad Teen' },
        { id: 'Portuguese_MaturePartner', name: 'Mature Partner' },
        { id: 'Portuguese_Comedian', name: 'Comedian' },
        { id: 'Portuguese_NaughtySchoolgirl', name: 'Naughty Schoolgirl' },
        { id: 'Portuguese_Narrator', name: 'Narrator' },
        { id: 'Portuguese_ToughBoss', name: 'Tough Boss' },
        { id: 'Portuguese_Fussyhostess', name: 'Fussy hostess' },
        { id: 'Portuguese_Dramatist', name: 'Dramatist' },
        { id: 'Portuguese_Steadymentor', name: 'Steady Mentor' },
        { id: 'Portuguese_Jovialman', name: 'Jovial Man' },
        { id: 'Portuguese_CharmingQueen', name: 'Charming Queen' },
        { id: 'Portuguese_SantaClaus', name: 'Santa Claus' },
        { id: 'Portuguese_Rudolph', name: 'Rudolph' },
        { id: 'Portuguese_Arnold', name: 'Arnold' },
        { id: 'Portuguese_CharmingSanta', name: 'Charming Santa' },
        { id: 'Portuguese_CharmingLady', name: 'Charming Lady' },
        { id: 'Portuguese_Ghost', name: 'Ghost' },
        { id: 'Portuguese_HumorousElder', name: 'Humorous Elder' },
        { id: 'Portuguese_CalmLeader', name: 'Calm Leader' },
        { id: 'Portuguese_GentleTeacher', name: 'Gentle Teacher' },
        { id: 'Portuguese_EnergeticBoy', name: 'Energetic Boy' },
        { id: 'Portuguese_ReliableMan', name: 'Reliable Man' },
        { id: 'Portuguese_SereneElder', name: 'Serene Elder' },
        { id: 'Portuguese_GrimReaper', name: 'Grim Reaper' },
        { id: 'Portuguese_AssertiveQueen', name: 'Assertive Queen' },
        { id: 'Portuguese_WhimsicalGirl', name: 'Whimsical Girl' },
        { id: 'Portuguese_StressedLady', name: 'Stressed Lady' },
        { id: 'Portuguese_FriendlyNeighbor', name: 'Friendly Neighbor' },
        { id: 'Portuguese_CaringGirlfriend', name: 'Caring Girlfriend' },
        { id: 'Portuguese_PowerfulSoldier', name: 'Powerful Soldier' },
        { id: 'Portuguese_FascinatingBoy', name: 'Fascinating Boy' },
        { id: 'Portuguese_RomanticHusband', name: 'Romantic Husband' },
        { id: 'Portuguese_StrictBoss', name: 'Strict Boss' },
        { id: 'Portuguese_InspiringLady', name: 'Inspiring Lady' },
        { id: 'Portuguese_PlayfulSpirit', name: 'Playful Spirit' },
        { id: 'Portuguese_ElegantGirl', name: 'Elegant Girl' },
        { id: 'Portuguese_CompellingGirl', name: 'Compelling Girl' },
        { id: 'Portuguese_PowerfulVeteran', name: 'Powerful Veteran' },
        { id: 'Portuguese_SensibleManager', name: 'Sensible Manager' },
        { id: 'Portuguese_ThoughtfulLady', name: 'Thoughtful Lady' },
        { id: 'Portuguese_TheatricalActor', name: 'Theatrical Actor' },
        { id: 'Portuguese_FragileBoy', name: 'Fragile Boy' },
        { id: 'Portuguese_ChattyGirl', name: 'Chatty Girl' },
        { id: 'Portuguese_Conscientiousinstructor', name: 'Conscientious Instructor' },
        { id: 'Portuguese_RationalMan', name: 'Rational Man' },
        { id: 'Portuguese_WiseScholar', name: 'Wise Scholar' },
        { id: 'Portuguese_FrankLady', name: 'Frank Lady' },
        { id: 'Portuguese_DeterminedManager', name: 'Determined Manager' }
    ],
    '法文': [
        { id: 'French_Male_Speech_New', name: 'Level-Headed Man' },
        { id: 'French_Female_News Anchor', name: 'Patient Female Presenter' },
        { id: 'French_CasualMan', name: 'Casual Man' },
        { id: 'French_MovieLeadFemale', name: 'Movie Lead Female' },
        { id: 'French_FemaleAnchor', name: 'Female Anchor' },
        { id: 'French_MaleNarrator', name: 'Male Narrator' }
    ],
    '印尼文': [
        { id: 'Indonesian_SweetGirl', name: 'Sweet Girl' },
        { id: 'Indonesian_ReservedYoungMan', name: 'Reserved Young Man' },
        { id: 'Indonesian_CharmingGirl', name: 'Charming Girl' },
        { id: 'Indonesian_CalmWoman', name: 'Calm Woman' },
        { id: 'Indonesian_ConfidentWoman', name: 'Confident Woman' },
        { id: 'Indonesian_CaringMan', name: 'Caring Man' },
        { id: 'Indonesian_BossyLeader', name: 'Bossy Leader' },
        { id: 'Indonesian_DeterminedBoy', name: 'Determined Boy' },
        { id: 'Indonesian_GentleGirl', name: 'Gentle Girl' }
    ],
    '德文': [
        { id: 'German_FriendlyMan', name: 'Friendly Man' },
        { id: 'German_SweetLady', name: 'Sweet Lady' },
        { id: 'German_PlayfulMan', name: 'Playful Man' }
    ],
    '俄文': [
        { id: 'Russian_HandsomeChildhoodFriend', name: 'Handsome Childhood Friend' },
        { id: 'Russian_BrightHeroine', name: 'Bright Queen' },
        { id: 'Russian_AmbitiousWoman', name: 'Ambitious Woman' },
        { id: 'Russian_ReliableMan', name: 'Reliable Man' },
        { id: 'Russian_CrazyQueen', name: 'Crazy Girl' },
        { id: 'Russian_PessimisticGirl', name: 'Pessimistic Girl' },
        { id: 'Russian_AttractiveGuy', name: 'Attractive Guy' },
        { id: 'Russian_Bad-temperedBoy', name: 'Bad-tempered Boy' }
    ],
    '意大利文': [
        { id: 'Italian_BraveHeroine', name: 'Brave Heroine' },
        { id: 'Italian_Narrator', name: 'Narrator' },
        { id: 'Italian_WanderingSorcerer', name: 'Wandering Sorcerer' },
        { id: 'Italian_DiligentLeader', name: 'Diligent Leader' }
    ],
    '阿拉伯文': [
        { id: 'Arabic_CalmWoman', name: 'Calm Woman' },
        { id: 'Arabic_FriendlyGuy', name: 'Friendly Guy' }
    ],
    '土耳其文': [
        { id: 'Turkish_CalmWoman', name: 'Calm Woman' },
        { id: 'Turkish_Trustworthyman', name: 'Trustworthy man' }
    ],
    '乌克兰文': [
        { id: 'Ukrainian_CalmWoman', name: 'Calm Woman' },
        { id: 'Ukrainian_WiseScholar', name: 'Wise Scholar' }
    ],
    '荷兰文': [
        { id: 'Dutch_kindhearted_girl', name: 'Kind-hearted girl' },
        { id: 'Dutch_bossy_leader', name: 'Bossy leader' }
    ],
    '越南文': [
        { id: 'Vietnamese_kindhearted_girl', name: 'Kind-hearted girl' }
    ],
    '泰文': [
        { id: 'Thai_male_1_sample8', name: 'Serene Man' },
        { id: 'Thai_male_2_sample2', name: 'Friendly Man' },
        { id: 'Thai_female_1_sample1', name: 'Confident Woman' },
        { id: 'Thai_female_2_sample2', name: 'Energetic Woman' }
    ],
    '波兰文': [
        { id: 'Polish_male_1_sample4', name: 'Male Narrator' },
        { id: 'Polish_male_2_sample3', name: 'Male Anchor' },
        { id: 'Polish_female_1_sample1', name: 'Calm Woman' },
        { id: 'Polish_female_2_sample3', name: 'Casual Woman' }
    ],
    '罗马尼亚文': [
        { id: 'Romanian_male_1_sample2', name: 'Reliable Man' },
        { id: 'Romanian_male_2_sample1', name: 'Energetic Youth' },
        { id: 'Romanian_female_1_sample4', name: 'Optimistic Youth' },
        { id: 'Romanian_female_2_sample1', name: 'Gentle Woman' }
    ],
    '希腊文': [
        { id: 'greek_male_1a_v1', name: 'Thoughtful Mentor' },
        { id: 'Greek_female_1_sample1', name: 'Gentle Lady' },
        { id: 'Greek_female_2_sample3', name: 'Girl Next Door' }
    ],
    '捷克文': [
        { id: 'czech_male_1_v1', name: 'Assured Presenter' },
        { id: 'czech_female_5_v7', name: 'Steadfast Narrator' },
        { id: 'czech_female_2_v2', name: 'Elegant Lady' }
    ],
    '芬兰文': [
        { id: 'finnish_male_3_v1', name: 'Upbeat Man' },
        { id: 'finnish_male_1_v2', name: 'Friendly Boy' },
        { id: 'finnish_female_4_v1', name: 'Assetive Woman' }
    ],
    '印地文': [
        { id: 'hindi_male_1_v2', name: 'Trustworthy Advisor' },
        { id: 'hindi_female_2_v1', name: 'Tranquil Woman' },
        { id: 'hindi_female_1_v2', name: 'News Anchor' }
    ]
};

// 语言列表
const LANGUAGES = Object.keys(VOICES);

// ============ 挂载认证与资源路由 ============
app.use('/api/auth', authRouter);
app.use('/api/resources', resourcesRouter);

// 辅助函数：hex 字符串转 Buffer
function hexToBuffer(hexString) {
    const hex = hexString.replace(/\s/g, '');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return Buffer.from(bytes);
}

// 辅助函数：保存生成资源到数据库（不阻塞响应）
function saveResourceAsync(userId, type, fileData, meta) {
    const id = uuidv4();
    db.saveResource({ id, userId, type, fileData, meta }).catch(err => {
        console.error(`[Resource] 保存 ${type} 资源失败:`, err.message);
    });
    return id; // 返回资源 ID
}

// ============ API 路由 ============

// 获取音色列表
app.get('/api/voices', (req, res) => {
    res.json({
        success: true,
        data: VOICES,
        languages: LANGUAGES
    });
});

// 获取语言列表
app.get('/api/languages', (req, res) => {
    res.json({
        success: true,
        data: LANGUAGES
    });
});

// 同步合成（HTTP）- 创建任务
app.post('/api/tts/http', requireAuth, async (req, res) => {
    try {
        const {
            model = 'speech-2.8-hd',
            text,
            stream = false,
            stream_options,
            voice_setting,
            audio_setting,
            pronunciation_dict,
            timbre_weights,
            language_boost,
            voice_modify,
            subtitle_enable = false,
            subtitle_type,
            output_format = 'hex',
            aigc_watermark = false,
            text_file_id
        } = req.body;

        // 校验模型
        const validModels = [
            'speech-2.8-hd', 'speech-2.8-turbo',
            'speech-2.6-hd', 'speech-2.6-turbo',
            'speech-02-hd', 'speech-02-turbo',
            'speech-01-hd', 'speech-01-turbo'
        ];
        if (!validModels.includes(model)) {
            return res.status(400).json({
                success: false,
                error: `model 必须为: ${validModels.join(' / ')}`
            });
        }

        // 校验 text
        if (!text && !text_file_id) {
            return res.status(400).json({ success: false, error: 'text 不能为空' });
        }
        if (text && text.length > 10000) {
            return res.status(400).json({ success: false, error: 'text 长度不能超过 10000 字符' });
        }

        // 校验 audio_setting.format（MiniMax T2A v2 本身仅支持 mp3/pcm/flac/wav；
        // 我们额外支持 opus，由后端按 16kHz/mono/mp3 调 API，收到后用 ffmpeg 重封装为 ogg/opus）
        const validFormats = ['mp3', 'pcm', 'flac', 'wav', 'opus'];
        const wantOpus = audio_setting?.format === 'opus';
        if (audio_setting?.format && !validFormats.includes(audio_setting.format)) {
            return res.status(400).json({
                success: false,
                error: `format 必须为: ${validFormats.join(' / ')}`
            });
        }

        const payload = {
            model,
            stream,
            voice_setting: voice_setting || { voice_id: 'male-qn-qingse', speed: 1, vol: 1, pitch: 0 },
            // opus 选项：后端强制按 16kHz / 单声道 / mp3 调 API，收到后再用 ffmpeg 重封装为 ogg/opus
            audio_setting: (() => {
                const base = audio_setting || { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 };
                if (wantOpus) {
                    return { ...base, sample_rate: 16000, channel: 1, format: 'mp3' };
                }
                return base;
            })(),
            subtitle_enable,
            output_format,
            aigc_watermark
        };

        if (text) payload.text = text;
        if (text_file_id) payload.text_file_id = text_file_id;
        if (stream_options) payload.stream_options = stream_options;
        if (pronunciation_dict) payload.pronunciation_dict = pronunciation_dict;
        if (timbre_weights && Array.isArray(timbre_weights)) payload.timbre_weights = timbre_weights;
        if (language_boost) payload.language_boost = language_boost;
        if (voice_modify) payload.voice_modify = voice_modify;
        if (subtitle_type) payload.subtitle_type = subtitle_type;

        const axiosOpts = {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        };

        // 流式返回
        if (stream) {
            axiosOpts.responseType = 'stream';
            const response = await axios.post(`${MINIMAX_API_BASE}/v1/t2a_v2`, payload, axiosOpts);
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // 收集流式数据用于保存
            const chunks = [];
            response.data.on('data', (chunk) => {
                chunks.push(chunk);
            });

            response.data.on('end', () => {
                // 流结束后保存资源
                if (req.userId && chunks.length > 0) {
                    try {
                        const fullData = Buffer.concat(chunks).toString();
                        const audioFormat = audio_setting?.format || 'mp3';
                        // 解析 SSE 事件提取音频数据
                        const audioParts = [];
                        fullData.split('\n').forEach(line => {
                            if (line.startsWith('data:')) {
                                try {
                                    const evt = JSON.parse(line.slice(5));
                                    if (evt.data?.audio) {
                                        audioParts.push(evt.data.audio);
                                    }
                                } catch {}
                            }
                        });
                        if (audioParts.length > 0) {
                            const hexAudio = audioParts.join('');
                            const audioBuffer = output_format === 'hex' ? hexToBuffer(hexAudio) : Buffer.from(hexAudio, 'hex');
                            saveResourceAsync(req.userId, 'tts-http', audioBuffer, {
                                model,
                                prompt: text,
                                voiceId: voice_setting?.voice_id,
                                format: audioFormat,
                                params: { voice_setting, audio_setting, stream: true }
                            });
                        }
                    } catch (saveErr) {
                        console.error('[Resource] TTS HTTP 流式保存失败:', saveErr.message);
                    }
                }
            });

            response.data.pipe(res);
            return;
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/t2a_v2`, payload, axiosOpts);
        const result = { success: true, data: response.data };

        // 保存资源到数据库 + 必要时转码为 ogg/opus
        if (response.data?.data?.audio) {
            try {
                let audioBuffer = output_format === 'hex'
                    ? hexToBuffer(response.data.data.audio)
                    : Buffer.from(response.data.data.audio, 'base64');
                let audioFormat = audio_setting?.format || 'mp3';

                if (wantOpus) {
                    audioBuffer = await mp3ToOggOpus(audioBuffer);
                    audioFormat = 'opus';
                }

                // 把转码后的内容放回 result，前端用 hex 解码
                result.data = {
                    ...response.data,
                    data: { ...response.data.data, audio: audioBuffer.toString('hex') }
                };

                if (req.userId) {
                    const resourceId = saveResourceAsync(req.userId, 'tts-http', audioBuffer, {
                        model,
                        prompt: text,
                        voiceId: voice_setting?.voice_id,
                        format: audioFormat,
                        params: { voice_setting, audio_setting }
                    });
                    result.resourceId = resourceId;
                }
            } catch (saveErr) {
                console.error('[Resource] TTS HTTP 保存失败:', saveErr.message);
            }
        }

        res.json(result);
    } catch (error) {
        console.error('TTS HTTP Error:', error.message);
        const errData = error.response?.data;
        res.status(500).json({
            success: false,
            error: errData?.base_resp?.status_msg || errData?.message || error.message
        });
    }
});

// 异步合成 - 创建任务
app.post('/api/tts/async/create', requireAuth, async (req, res) => {
    try {
        const { model, text, text_file_id, voice_setting, audio_setting, language_boost, pronunciation_dict, voice_modify, aigc_watermark } = req.body;

        const wantOpus = audio_setting?.format === 'opus';

        const payload = {
            model: model || 'speech-2.8-hd',
            voice_setting: voice_setting || {
                voice_id: 'male-qn-qingse',
                speed: 1,
                vol: 10,
                pitch: 1
            },
            // opus 选项：后端强制按 16kHz / 单声道 / mp3 创建任务，下载时再用 ffmpeg 转 ogg/opus
            audio_setting: (() => {
                const base = audio_setting || {
                    audio_sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3',
                    channel: 2
                };
                if (wantOpus) {
                    return { ...base, audio_sample_rate: 16000, channel: 1, format: 'mp3' };
                }
                return base;
            })()
        };

        if (text_file_id) {
            payload.text_file_id = text_file_id;
        } else if (text) {
            payload.text = text;
        } else {
            return res.status(400).json({ error: 'text or text_file_id is required' });
        }

        if (language_boost) payload.language_boost = language_boost;
        if (pronunciation_dict) payload.pronunciation_dict = pronunciation_dict;
        if (voice_modify) payload.voice_modify = voice_modify;
        if (aigc_watermark) payload.aigc_watermark = true;

        // 校验 audio_setting.format（支持 mp3/pcm/flac/wav，opus 由后端内部转码）
        const validFormats = ['mp3', 'pcm', 'flac', 'wav', 'opus'];
        if (audio_setting?.format && !validFormats.includes(audio_setting.format)) {
            return res.status(400).json({
                success: false,
                error: `format 必须为: ${validFormats.join(' / ')}`
            });
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/t2a_async_v2`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Async TTS Create Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 异步合成 - 查询任务状态
app.get('/api/tts/async/query', requireAuth, async (req, res) => {
    try {
        const { task_id } = req.query;
        if (!task_id) {
            return res.status(400).json({ error: 'task_id is required' });
        }

        const response = await axios.get(`${MINIMAX_API_BASE}/v1/query/t2a_async_query_v2?task_id=${task_id}`, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Async TTS Query Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 异步合成 - 下载音频
app.get('/api/tts/async/download', requireAuth, async (req, res) => {
    try {
        const { file_id, format: downloadFormat } = req.query;
        if (!file_id) {
            return res.status(400).json({ error: 'file_id is required' });
        }

        const response = await axios.get(`${MINIMAX_API_BASE}/v1/files/retrieve_content?file_id=${file_id}`, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`
            },
            responseType: 'arraybuffer'
        });

        let audioBuffer = Buffer.from(response.data);
        let finalFormat = 'mp3';
        let contentType = 'audio/mpeg';

        // opus 选项：用 ffmpeg 把 MiniMax 返回的 mp3 重封装为 ogg/opus
        if (downloadFormat === 'opus') {
            try {
                audioBuffer = await mp3ToOggOpus(audioBuffer);
                finalFormat = 'opus';
                contentType = 'audio/ogg';
            } catch (ffErr) {
                console.error('[Async TTS] opus 转码失败，回退到 mp3:', ffErr.message);
            }
        }

        // 保存资源到数据库（始终保存原 mp3，节省空间）
        if (req.userId && response.data) {
            try {
                const resourceId = saveResourceAsync(req.userId, 'tts-async', Buffer.from(response.data), {
                    model: 'async',
                    format: 'mp3',
                    params: { file_id, downloadFormat }
                });
                // 在响应头中返回资源 ID
                res.setHeader('X-Resource-Id', resourceId);
            } catch (saveErr) {
                console.error('[Resource] Async TTS 下载保存失败:', saveErr.message);
            }
        }

        res.set('Content-Type', contentType);
        res.set('Content-Disposition', `attachment; filename="tts_async_${file_id}.${finalFormat === 'opus' ? 'ogg' : finalFormat}"`);
        res.send(audioBuffer);
    } catch (error) {
        console.error('Async TTS Download Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

/**
 * 通用音频转码端点
 * POST /api/convert-audio
 * Body: { audioBase64: string, sourceFormat?: string, targetFormat: 'opus' | 'mp3' | 'wav' }
 * Returns: { success, data: { audioBase64, format, contentType } }
 */
app.post('/api/convert-audio', requireAuth, express.json({ limit: '50mb' }), async (req, res) => {
    try {
        const { audioBase64, sourceFormat, targetFormat = 'opus' } = req.body;
        if (!audioBase64) {
            return res.status(400).json({ success: false, error: 'audioBase64 不能为空' });
        }
        if (targetFormat !== 'opus') {
            return res.status(400).json({ success: false, error: '目前仅支持 targetFormat=opus' });
        }

        const inputBuffer = Buffer.from(audioBase64, 'base64');
        const opusBuffer = await mp3ToOggOpus(inputBuffer);

        res.json({
            success: true,
            data: {
                audioBase64: opusBuffer.toString('base64'),
                format: 'opus',
                contentType: 'audio/ogg'
            }
        });
    } catch (error) {
        console.error('[Convert Audio] 错误:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ WebSocket 代理（流式合成）============
// 浏览器连 ws://localhost:3000/ws/tts，后端转发到 wss://api.minimaxi.com/ws/v1/t2a_v2
const wss = new WebSocket.Server({ noServer: true });

// 处理 HTTP 升级到 WebSocket（使用 session 认证）
server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/tts') {
        // 通过 session cookie 认证
        const authResult = await authenticateWebSocket(request);
        if (!authResult.authenticated) {
            console.log('[WS] 认证失败:', authResult.error);
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            ws._minimaxApiKey = authResult.apiKey;
            ws._userId = authResult.userId;
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (clientWs, request) => {
    const apiKey = clientWs._minimaxApiKey;
    console.log('[WS] 客户端连接，开始代理到 MiniMax WebSocket');

    // 连接到 MiniMax WebSocket 服务器
    // 注意：MiniMax WS 鉴权要求把 Authorization 放在 header（不能放 query string，放 query 会被判 "invalid api key"）
    const minimaxWs = new WebSocket('wss://api.minimaxi.com/ws/v1/t2a_v2', {
        headers: {
            'Authorization': `Bearer ${apiKey}`
        }
    });

    let clientClosed = false;
    let upstreamClosed = false;

    minimaxWs.on('open', () => {
        console.log('[WS] 已连接到 MiniMax WebSocket 服务器');
        if (clientClosed) {
            minimaxWs.close();
            return;
        }
    });

    // 上游（MiniMax）→ 客户端（浏览器）
    minimaxWs.on('message', (data) => {
        if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data.toString());
        }
    });

    minimaxWs.on('close', (code, reason) => {
        upstreamClosed = true;
        console.log(`[WS] MiniMax 连接关闭: ${code}`);
        if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(code, reason);
        }
    });

    minimaxWs.on('error', (err) => {
        console.error('[WS] MiniMax 连接错误:', err.message);
        if (!clientClosed && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                event: 'proxy_error',
                error: '无法连接到 MiniMax WebSocket 服务器',
                detail: err.message
            }));
            clientWs.close(1011, err.message);
        }
    });

    // 客户端（浏览器）→ 上游（MiniMax）
    clientWs.on('message', (data) => {
        if (!upstreamClosed && minimaxWs.readyState === WebSocket.OPEN) {
            minimaxWs.send(data.toString());
        } else if (!upstreamClosed && minimaxWs.readyState === WebSocket.CONNECTING) {
            // 等上游连接好了再发
            minimaxWs.once('open', () => {
                minimaxWs.send(data.toString());
            });
        }
    });

    clientWs.on('close', (code) => {
        clientClosed = true;
        console.log(`[WS] 客户端断开: ${code}`);
        if (!upstreamClosed) {
            minimaxWs.close();
        }
    });

    clientWs.on('error', (err) => {
        console.error('[WS] 客户端错误:', err.message);
    });
});

// 文件上传代理 - 使用 multer 解析
const uploadMiddleware = upload.fields([{ name: 'file', maxCount: 1 }]);

// 文件上传（通用）
app.post('/api/files/upload', requireAuth, uploadMiddleware, async (req, res) => {
    try {
        const { purpose } = req.body;
        const files = req.files;
        const file = files?.file?.[0];

        if (!file) {
            return res.status(400).json({ error: 'file is required' });
        }

        const formData = new FormData();
        if (purpose) formData.append('purpose', purpose);
        formData.append('file', file.buffer, file.originalname);

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/files/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                ...formData.getHeaders()
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('File Upload Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 音色复刻 - 上传克隆音频
app.post('/api/clone/upload', requireAuth, uploadMiddleware, async (req, res) => {
    try {
        const files = req.files;
        const file = files?.file?.[0];
        if (!file) {
            return res.status(400).json({ error: 'file is required' });
        }

        const formData = new FormData();
        formData.append('purpose', 'voice_clone');
        formData.append('file', file.buffer, file.originalname);

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/files/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                ...formData.getHeaders()
            }
        });

        res.json({
            success: true,
            file_id: response.data.file?.file_id
        });
    } catch (error) {
        console.error('Clone Upload Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 音色复刻 - 上传示例音频
app.post('/api/clone/prompt', requireAuth, uploadMiddleware, async (req, res) => {
    try {
        const files = req.files;
        const file = files?.file?.[0];
        if (!file) {
            return res.status(400).json({ error: 'file is required' });
        }

        const formData = new FormData();
        formData.append('purpose', 'prompt_audio');
        formData.append('file', file.buffer, file.originalname);

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/files/upload`, formData, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                ...formData.getHeaders()
            }
        });

        res.json({
            success: true,
            file_id: response.data.file?.file_id
        });
    } catch (error) {
        console.error('Clone Prompt Upload Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 音色复刻 - 执行克隆
app.post('/api/clone/execute', requireAuth, async (req, res) => {
    try {
        const { file_id, voice_id, clone_prompt, text, model, language_boost, need_noise_reduction, need_volume_normalization, aigc_watermark } = req.body;

        const payload = {
            file_id,
            voice_id,
            model: model || 'speech-2.8-hd',
            text: text || '您好，这是测试音频。'
        };

        if (clone_prompt) {
            payload.clone_prompt = clone_prompt;
        }

        if (language_boost) payload.language_boost = language_boost;
        if (need_noise_reduction) payload.need_noise_reduction = true;
        if (need_volume_normalization) payload.need_volume_normalization = true;
        if (aigc_watermark) payload.aigc_watermark = true;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/voice_clone`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Clone Execute Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// ============ 音色设计 ============
app.post('/api/voice/design', requireAuth, async (req, res) => {
    try {
        const { prompt, preview_text, voice_id, aigc_watermark } = req.body;

        if (!prompt || !preview_text) {
            return res.status(400).json({ error: 'prompt and preview_text are required' });
        }

        const payload = {
            prompt,
            preview_text
        };

        if (voice_id) payload.voice_id = voice_id;
        if (aigc_watermark) payload.aigc_watermark = true;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/voice_design`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Voice Design Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.base_resp?.status_msg || error.response?.data?.message || error.message
        });
    }
});

// ============ 查询可用音色 ============
app.post('/api/voice/list', requireAuth, async (req, res) => {
    try {
        const { voice_type } = req.body;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/get_voice`, {
            voice_type: voice_type || 'all'
        }, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Voice List Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.base_resp?.status_msg || error.response?.data?.message || error.message
        });
    }
});

// 删除音色
app.post('/api/voice/delete', requireAuth, async (req, res) => {
    try {
        const { voice_type, voice_id } = req.body;

        if (!voice_type || !voice_id) {
            return res.status(400).json({ error: 'voice_type and voice_id are required' });
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/delete_voice`, {
            voice_type,
            voice_id
        }, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Voice Delete Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.base_resp?.status_msg || error.response?.data?.message || error.message
        });
    }
});

// 图片生成
app.post('/api/image/generate', requireAuth, async (req, res) => {
    try {
        const {
            model = 'image-01',
            prompt,
            aspect_ratio = '1:1',
            width,
            height,
            response_format = 'base64',
            seed,
            n = 1,
            prompt_optimizer = false,
            aigc_watermark = false,
            style,
            subject_reference
        } = req.body;

        // 校验 prompt
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'prompt 不能为空'
            });
        }
        if (prompt.length > 1500) {
            return res.status(400).json({
                success: false,
                error: 'prompt 长度不能超过 1500 字符'
            });
        }

        // 校验 model
        const validModels = ['image-01', 'image-01-live'];
        if (!validModels.includes(model)) {
            return res.status(400).json({
                success: false,
                error: `model 必须为 ${validModels.join(' / ')}`
            });
        }

        const payload = { model, prompt, response_format, n, prompt_optimizer, aigc_watermark };

        // image-01 支持 aspect_ratio 和 width/height
        // image-01-live 仅支持 aspect_ratio
        if (model === 'image-01') {
            if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
            if (width && height) {
                payload.width = width;
                payload.height = height;
            }
        } else if (model === 'image-01-live') {
            if (aspect_ratio) payload.aspect_ratio = aspect_ratio;
            if (style && typeof style === 'object') {
                payload.style = style;
            }
        }

        if (seed !== undefined && seed !== null) {
            payload.seed = parseInt(seed);
        }

        if (subject_reference) {
            payload.subject_reference = subject_reference;
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/image_generation`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        const imageResult = { success: true, data: response.data };

        // 保存资源到数据库（保存所有图片，不只是一张）
        if (req.userId) {
            try {
                // API 可能返回 image_base64（response_format=base64）或 image_urls（URL 列表）
                const base64List = response.data?.data?.image_base64 || [];
                const urlList = response.data?.data?.image_urls || [];
                const allImages = [...base64List, ...urlList];
                const resourceIds = [];
                for (let i = 0; i < allImages.length; i++) {
                    try {
                        const imageBuffer = Buffer.from(allImages[i], 'base64');
                        const rid = saveResourceAsync(req.userId, 'image', imageBuffer, {
                            model,
                            prompt,
                            format: 'png',
                            params: { aspect_ratio, width, height, seed, prompt_optimizer, style, index: allImages.length > 1 ? i + 1 : undefined }
                        });
                        resourceIds.push(rid);
                    } catch (e) {
                        console.error(`[Resource] 图片 ${i + 1} 保存失败:`, e.message);
                    }
                }
                if (resourceIds.length > 0) {
                    imageResult.resourceId = resourceIds[0];
                    if (resourceIds.length > 1) imageResult.resourceIds = resourceIds;
                }
            } catch (saveErr) {
                console.error('[Resource] 图片保存失败:', saveErr.message);
            }
        }

        res.json(imageResult);
    } catch (error) {
        console.error('Image Generation Error:', error.message);
        const errData = error.response?.data;
        res.status(500).json({
            success: false,
            error: errData?.base_resp?.status_msg || errData?.message || error.message,
            code: errData?.base_resp?.status_code
        });
    }
});

// ============ 音乐生成 ============
// 音乐生成（text → music）
app.post('/api/music/generate', requireAuth, async (req, res) => {
    try {
        const {
            model = 'music-2.6',
            prompt,
            lyrics = '',
            stream = false,
            output_format = 'hex',
            audio_setting = {},
            aigc_watermark = false,
            lyrics_optimizer = false,
            is_instrumental = false,
            audio_url,
            audio_base64,
            cover_feature_id
        } = req.body;

        // 校验 model
        const validModels = ['music-2.6', 'music-cover', 'music-2.6-free', 'music-cover-free'];
        if (!validModels.includes(model)) {
            return res.status(400).json({
                success: false,
                error: `model 必须为 ${validModels.join(' / ')}`
            });
        }

        const isCover = model.startsWith('music-cover');

        // 校验 prompt
        if (isCover) {
            // music-cover: 必填，10-300 字符
            if (!prompt) {
                return res.status(400).json({ success: false, error: 'music-cover 模型必须提供 prompt' });
            }
            if (prompt.length < 10 || prompt.length > 300) {
                return res.status(400).json({ success: false, error: 'music-cover 的 prompt 长度需在 10-300 字符之间' });
            }
            if (audio_url && audio_base64) {
                return res.status(400).json({ success: false, error: 'audio_url 和 audio_base64 只能二选一' });
            }
            if (cover_feature_id && (audio_url || audio_base64)) {
                return res.status(400).json({ success: false, error: 'cover_feature_id 与 audio_url/audio_base64 互斥' });
            }
            if (!cover_feature_id && !audio_url && !audio_base64) {
                return res.status(400).json({ success: false, error: '需要提供 audio_url / audio_base64 / cover_feature_id 其一' });
            }
        } else {
            // music-2.6: 纯音乐必填 1-2000；非纯音乐可选 0-2000
            if (is_instrumental) {
                if (!prompt || prompt.length < 1 || prompt.length > 2000) {
                    return res.status(400).json({ success: false, error: '纯音乐 prompt 长度需在 1-2000 字符之间' });
                }
            } else {
                if (prompt && prompt.length > 2000) {
                    return res.status(400).json({ success: false, error: 'prompt 长度不能超过 2000 字符' });
                }
            }
        }

        // 校验 lyrics
        if (lyrics) {
            if (isCover) {
                if (lyrics.length < 10 || lyrics.length > 1000) {
                    return res.status(400).json({ success: false, error: 'music-cover 的 lyrics 长度需在 10-1000 字符之间' });
                }
            } else {
                // music-2.6
                if (!is_instrumental) {
                    if (lyrics.length < 1 || lyrics.length > 3500) {
                        return res.status(400).json({ success: false, error: 'lyrics 长度需在 1-3500 字符之间' });
                    }
                }
            }
        } else if (!is_instrumental && !isCover && !lyrics_optimizer) {
            // music-2.6 非纯音乐必须有 lyrics 或 lyrics_optimizer
            return res.status(400).json({ success: false, error: 'music-2.6 非纯音乐必须提供 lyrics 或启用 lyrics_optimizer' });
        } else if (!is_instrumental && isCover && cover_feature_id && !lyrics) {
            // music-cover 两步模式: cover_feature_id 已提供，lyrics 必填
            return res.status(400).json({ success: false, error: '两步翻唱必须提供修改后的 lyrics' });
        }

        // 校验 output_format
        if (!['url', 'hex'].includes(output_format)) {
            return res.status(400).json({ success: false, error: 'output_format 必须为 url 或 hex' });
        }

        // 校验 audio_setting
        const validSampleRates = [16000, 24000, 32000, 44100, 48000];
        const validBitrates = [32000, 64000, 128000, 192000, 256000, 320000];
        const validFormats = ['mp3', 'wav', 'pcm'];
        const sr = audio_setting.sample_rate || 44100;
        const br = audio_setting.bitrate || 256000;
        const fmt = audio_setting.format || 'mp3';
        if (!validSampleRates.includes(sr)) {
            return res.status(400).json({ success: false, error: `sample_rate 必须为 ${validSampleRates.join(' / ')}` });
        }
        if (!validBitrates.includes(br)) {
            return res.status(400).json({ success: false, error: `bitrate 必须为 ${validBitrates.join(' / ')}` });
        }
        if (!validFormats.includes(fmt)) {
            return res.status(400).json({ success: false, error: `format 必须为 ${validFormats.join(' / ')}` });
        }

        const payload = {
            model,
            audio_setting: { sample_rate: sr, bitrate: br, format: fmt },
            output_format
        };

        if (stream) payload.stream = true;
        if (aigc_watermark) payload.aigc_watermark = true;
        if (lyrics_optimizer && !isCover) payload.lyrics_optimizer = true;
        if (is_instrumental && !isCover) payload.is_instrumental = true;

        if (prompt) payload.prompt = prompt;
        if (lyrics) payload.lyrics = lyrics;
        if (audio_url) payload.audio_url = audio_url;
        if (audio_base64) payload.audio_base64 = audio_base64;
        if (cover_feature_id) payload.cover_feature_id = cover_feature_id;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/music_generation`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 300000,
            responseType: stream ? 'stream' : 'json'
        });

        if (stream) {
            res.setHeader('Content-Type', 'audio/mpeg');

            // 收集流式数据用于保存
            const chunks = [];
            response.data.on('data', (chunk) => {
                chunks.push(chunk);
            });
            response.data.on('end', () => {
                if (req.userId && chunks.length > 0) {
                    try {
                        const audioBuffer = Buffer.concat(chunks);
                        saveResourceAsync(req.userId, 'music', audioBuffer, {
                            model,
                            prompt,
                            format: fmt || 'mp3',
                            params: { lyrics, audio_setting, is_instrumental, isCover }
                        });
                    } catch (saveErr) {
                        console.error('[Resource] Music 流式保存失败:', saveErr.message);
                    }
                }
            });

            response.data.pipe(res);
            return;
        }

        const musicResult = { success: true, data: response.data };

        // 保存资源到数据库
        if (response.data?.data?.audio && req.userId) {
            try {
                const audioFormat = audio_setting?.format || fmt || 'mp3';
                let audioBuffer;
                if (output_format === 'hex') {
                    audioBuffer = hexToBuffer(response.data.data.audio);
                } else {
                    audioBuffer = Buffer.from(response.data.data.audio, 'base64');
                }
                const resourceId = saveResourceAsync(req.userId, 'music', audioBuffer, {
                    model,
                    prompt,
                    format: audioFormat,
                    params: { lyrics, audio_setting, is_instrumental, isCover }
                });
                musicResult.resourceId = resourceId;
            } catch (saveErr) {
                console.error('[Resource] 音乐保存失败:', saveErr.message);
            }
        }

        res.json(musicResult);
    } catch (error) {
        console.error('Music Generation Error:', error.message);
        const errData = error.response?.data;
        res.status(500).json({
            success: false,
            error: errData?.base_resp?.status_msg || errData?.message || error.message,
            code: errData?.base_resp?.status_code
        });
    }
});

// 歌词生成
app.post('/api/music/lyrics', requireAuth, async (req, res) => {
    try {
        const { mode = 'write_full_song', prompt, lyrics, title } = req.body;

        // mode 校验
        if (!['write_full_song', 'edit'].includes(mode)) {
            return res.status(400).json({
                success: false,
                error: 'mode 必须为 write_full_song 或 edit'
            });
        }

        // edit 模式必须有 lyrics
        if (mode === 'edit' && !lyrics) {
            return res.status(400).json({
                success: false,
                error: 'edit 模式必须提供 lyrics'
            });
        }

        // prompt 长度校验
        if (prompt && prompt.length > 2000) {
            return res.status(400).json({
                success: false,
                error: 'prompt 长度不能超过 2000 字符'
            });
        }

        // lyrics 长度校验
        if (lyrics && lyrics.length > 3500) {
            return res.status(400).json({
                success: false,
                error: 'lyrics 长度不能超过 3500 字符'
            });
        }

        const payload = { mode };
        if (prompt) payload.prompt = prompt;
        if (lyrics) payload.lyrics = lyrics;
        if (title) payload.title = title;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/lyrics_generation`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Lyrics Generation Error:', error.message);
        const errData = error.response?.data;
        res.status(500).json({
            success: false,
            error: errData?.base_resp?.status_msg || errData?.message || error.message
        });
    }
});

// 翻唱前处理（提取音频特征和歌词）
app.post('/api/music/cover/preprocess', requireAuth, async (req, res) => {
    try {
        const { model = 'music-cover', audio_url, audio_base64 } = req.body;

        if (!audio_url && !audio_base64) {
            return res.status(400).json({
                success: false,
                error: 'audio_url 或 audio_base64 必须提供其中一个'
            });
        }

        if (audio_url && audio_base64) {
            return res.status(400).json({
                success: false,
                error: 'audio_url 和 audio_base64 只能二选一'
            });
        }

        const payload = { model };
        if (audio_url) payload.audio_url = audio_url;
        if (audio_base64) payload.audio_base64 = audio_base64;

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/music_cover_preprocess`, payload, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 120000
        });

        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Cover Preprocess Error:', error.message);
        const errData = error.response?.data;
        res.status(500).json({
            success: false,
            error: errData?.base_resp?.status_msg || errData?.message || error.message
        });
    }
});

// WebSocket 代理（用于流式合成）- 需要单独处理
// 注意：实际的 WebSocket 代理需要在客户端直接连接 MiniMax API
// 后端仅提供 token 验证和连接引导

// 启动服务器（先初始化数据库）
async function startServer() {
    try {
        // 初始化数据库
        await db.initTables();
        console.log('[DB] 数据库初始化完成');

        // 清理过期 session
        await db.cleanupSessions();

        // 每 6 小时清理过期资源和 session
        setInterval(async () => {
            try {
                await db.cleanupExpiredResources(7);
                await db.cleanupSessions();
            } catch (err) {
                console.error('[定时任务] 清理失败:', err.message);
            }
        }, 6 * 60 * 60 * 1000);

        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🎙️  MiniMax Studio 启动成功！                          ║
║                                                           ║
║     本地地址: http://localhost:${PORT}                       ║
║                                                           ║
║     功能页面:                                              ║
║       - /                  首页                            ║
║       - /tts/              语音合成                        ║
║       - /tts/streaming     流式合成                        ║
║       - /tts/http          HTTP合成                        ║
║       - /tts/async         异步合成                        ║
║       - /tts/clone         音色复刻                        ║
║       - /tts/voice-design  音色设计                        ║
║       - /image/            图片生成                        ║
║       - /music/            音乐生成                        ║
║       - /music/lyrics      歌词生成                        ║
║       - /music/cover       翻唱生成                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('[启动] 服务器启动失败:', err);
        process.exit(1);
    }
}

startServer();