/**
 * MiniMax TTS 后端服务
 * 提供 API Key 保护和文件上传代理
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// 文件上传配置
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

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

// API Key 验证
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey) {
        return res.status(401).json({ error: 'API Key is required' });
    }
    req.apiKey = apiKey;
    next();
};

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
app.post('/api/tts/http', validateApiKey, async (req, res) => {
    try {
        const { model, text, voice_setting, audio_setting, text_file_id } = req.body;

        const payload = {
            model: model || 'speech-2.8-hd',
            voice_setting: voice_setting || {},
            audio_setting: audio_setting || {
                format: 'mp3',
                bitrate: 128000,
                sample_rate: 32000,
                channel: 1
            }
        };

        if (text_file_id) {
            payload.text_file_id = text_file_id;
        } else if (text) {
            payload.text = text;
        } else {
            return res.status(400).json({ error: 'text or text_file_id is required' });
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/t2a_v2`, payload, {
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
        console.error('TTS HTTP Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// 异步合成 - 创建任务
app.post('/api/tts/async/create', validateApiKey, async (req, res) => {
    try {
        const { model, text, text_file_id, voice_setting, audio_setting, language_boost, pronunciation_dict, voice_modify } = req.body;

        const payload = {
            model: model || 'speech-2.8-hd',
            voice_setting: voice_setting || {
                voice_id: 'male-qn-qingse',
                speed: 1,
                vol: 10,
                pitch: 1
            },
            audio_setting: audio_setting || {
                audio_sample_rate: 32000,
                bitrate: 128000,
                format: 'mp3',
                channel: 2
            }
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
app.get('/api/tts/async/query', validateApiKey, async (req, res) => {
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
app.get('/api/tts/async/download', validateApiKey, async (req, res) => {
    try {
        const { file_id } = req.query;
        if (!file_id) {
            return res.status(400).json({ error: 'file_id is required' });
        }

        const response = await axios.get(`${MINIMAX_API_BASE}/v1/files/retrieve_content?file_id=${file_id}`, {
            headers: {
                'Authorization': `Bearer ${req.apiKey}`
            },
            responseType: 'arraybuffer'
        });

        res.set('Content-Type', 'audio/mpeg');
        res.send(response.data);
    } catch (error) {
        console.error('Async TTS Download Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// ============ WebSocket 代理（流式合成）============
// 用于客户端 WebSocket 直连的 Token 验证
app.post('/api/tts/websocket/token', validateApiKey, (req, res) => {
    res.json({
        success: true,
        ws_url: 'wss://api.minimaxi.com/ws/v1/t2a_v2',
        // API Key 直接传给客户端，让客户端使用原生 WebSocket 连接
        message: 'WebSocket 直连模式 - API Key 已验证'
    });
});

// WebSocket 文本上传代理（用于流式合成的文本输入）
app.post('/api/tts/websocket/text', validateApiKey, async (req, res) => {
    // 文本上传逻辑（如果需要后端处理）
    res.json({ success: true, message: 'text uploaded' });
});

// 文件上传代理 - 使用 multer 解析
const uploadMiddleware = upload.fields([{ name: 'file', maxCount: 1 }]);

// 文件上传（通用）
app.post('/api/files/upload', validateApiKey, uploadMiddleware, async (req, res) => {
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
app.post('/api/clone/upload', validateApiKey, uploadMiddleware, async (req, res) => {
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
app.post('/api/clone/prompt', validateApiKey, uploadMiddleware, async (req, res) => {
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
app.post('/api/clone/execute', validateApiKey, async (req, res) => {
    try {
        const { file_id, voice_id, clone_prompt, text, model } = req.body;

        const payload = {
            file_id,
            voice_id,
            model: model || 'speech-2.8-hd',
            text: text || '您好，这是测试音频。'
        };

        if (clone_prompt) {
            payload.clone_prompt = clone_prompt;
        }

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

// 图片生成
app.post('/api/image/generate', validateApiKey, async (req, res) => {
    try {
        const { prompt, aspect_ratio, response_format, subject_reference } = req.body;

        const payload = {
            model: 'image-01',
            prompt,
            aspect_ratio: aspect_ratio || '16:9',
            response_format: response_format || 'base64'
        };

        if (subject_reference) {
            payload.subject_reference = subject_reference;
        }

        const response = await axios.post(`${MINIMAX_API_BASE}/v1/image_generation`, payload, {
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
        console.error('Image Generation Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// WebSocket 代理（用于流式合成）- 需要单独处理
// 注意：实际的 WebSocket 代理需要在客户端直接连接 MiniMax API
// 后端仅提供 token 验证和连接引导

// 启动服务器
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     🎙️  MiniMax TTS 语音合成器 启动成功！                  ║
║                                                           ║
║     本地地址: http://localhost:${PORT}                       ║
║                                                           ║
║     功能页面:                                              ║
║       - /              首页                                ║
║       - /streaming     同步合成（流式）                    ║
║       - /http          同步合成（HTTP）                     ║
║       - /async         异步合成                            ║
║       - /clone         音色复刻                            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});