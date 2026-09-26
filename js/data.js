// 世界の基本データ（名前・身分・職業・品物・生き物・研究など）

export const WORLD_NAME = 'エルデラント';
export const ERA = '大陸暦';
export const DAYS_PER_SEASON = 10;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
export const SEASONS = ['春', '夏', '秋', '冬'];
export const HISTORY_YEARS = 280;

export const MALE_NAMES = [
  'ハンス', 'ルーカス', 'エミール', 'フリッツ', 'ヨハン', 'カール', 'オットー', 'マティアス', 'テオ', 'ニコ',
  'パウル', 'フェリクス', 'ベン', 'ヤコブ', 'ルドルフ', 'ヴィルヘルム', 'アルベルト', 'ゲオルク', 'レオン', 'マックス',
  'ユリアン', 'アントン', 'ベルント', 'クラウス', 'ディーター', 'ミヒャエル', 'ロルフ', 'ジーモン', 'トビアス', 'ヴァルター',
  'コンラート', 'ハインリヒ', 'ルートヴィヒ', 'フランツ', 'エーリヒ', 'グスタフ', 'ラインハルト', 'ウルリヒ', 'オスカー', 'イーヴォ',
  'アルヴィン', 'セドリック', 'ギルベルト', 'レオポルト', 'ジークフリート', 'エドガー', 'ロタール', 'ベネディクト', 'カスパー', 'ラザロ',
];
export const FEMALE_NAMES = [
  'エマ', 'アンナ', 'マリー', 'ソフィア', 'ハンナ', 'クララ', 'リーナ', 'ミア', 'グレタ', 'ローザ',
  'エルザ', 'イルゼ', 'ヘレナ', 'マルタ', 'ロッテ', 'フリーダ', 'ゾフィー', 'ベルタ', 'アガーテ', 'ユリア',
  'レナ', 'イダ', 'カタリーナ', 'ミラ', 'ノラ', 'エファ', 'リリー', 'テレーゼ', 'ドーラ', 'ルイーゼ',
  'ヒルデ', 'ゲルダ', 'アメリー', 'パウラ', 'ヨハンナ', 'マグダ', 'ウルズラ', 'ヴィルマ', 'エディト', 'ネレ',
  'イゾルデ', 'ロザリンデ', 'エレオノーレ', 'ヴィクトリア', 'セレスティナ', 'アデーレ', 'コルネリア', 'オリヴィア', 'フェリシア', 'ベアトリクス',
];
// 南方（砂漠の国）の名前
export const SOUTH_MALE = ['ハーミド', 'ラシード', 'ザイード', 'カリーム', 'ナビール', 'ファリド', 'ユースフ', 'サミール', 'アミール', 'タリク', 'バシール', 'マフムード', 'イドリス', 'ジャラール', 'ワリード'];
export const SOUTH_FEMALE = ['ライラ', 'ヤスミン', 'アミラ', 'ファティマ', 'ナディア', 'サラ', 'ザフラ', 'ヌール', 'ラナ', 'ダリア', 'シャイマ', 'マリカ', 'ハディージャ', 'ルビナ', 'サミーラ'];
export const FAMILY_NAMES = [
  'ベルク', 'ミュラー', 'シュミット', 'ファーバー', 'ホルツ', 'ヴァイス', 'クラウゼ', 'ブラウン', 'ランゲ', 'ケラー',
  'フィッシャー', 'ベッカー', 'ヴォルフ', 'ハーン', 'ローゼ', 'リンデ', 'ブルンネン', 'アイヒェ', 'シュトルム', 'ハルトマン',
  'ツィマー', 'フォーゲル', 'ゾンマー', 'ヴィンター', 'シュタイン', 'アドラー', 'グラーフ', 'ノイマン', 'リヒター', 'ケーニヒ',
];
export const SOUTH_FAMILIES = ['アル＝サハル', 'イブン＝ラーシド', 'アル＝ナージー', 'バヌー＝ハリーム', 'アル＝ファーリス', 'イブン＝ザイン', 'アル＝カマル', 'バヌー＝ヌール'];

export const ORIGINS = ['東の山向こう', '南の砂漠の町', '北の雪国', '西の港町', '遠い異国', '峠の宿場', '海の向こうの島'];

// 国
export const KINGDOMS = [
  { name: 'アルデリア王国', capital: '王都アルデン', color: '#3f7fd0', banner: '#2f6394', south: false, villages: ['リンデンベルク村', 'ヘルツ村'], port: '港町ゼーハーフェン', motto: '剣と麦の国' },
  { name: 'ヴェルムント王国', capital: '王都ヴェルム', color: '#c9463a', banner: '#8e2c24', south: false, villages: ['ティーフタール村', 'ロッゲン村'], port: '港町ノルトブルク', motto: '鉄と雪の国' },
  { name: 'サハル王国', capital: '王都サハラン', color: '#d9a13a', banner: '#a8761e', south: true, villages: ['オアシスの村カラム', 'ジャヌーブ村'], port: '港町ミナー', motto: '砂と黄金の国' },
];
export const DEMON_REALM = { name: '魔界ネクロス', castle: '魔王城' };

// 身分（数字が大きいほど高い）
export const RANKS = {
  king: { name: '王', lv: 9 }, royal: { name: '王族', lv: 8 }, noble: { name: '貴族', lv: 7 }, knight: { name: '騎士', lv: 6 },
  citizen: { name: '市民', lv: 5 }, commoner: { name: '平民', lv: 4 }, adventurer: { name: '冒険者', lv: 4 },
  wanderer: { name: '放浪者', lv: 3 }, homeless: { name: '宿なし', lv: 2 }, outlaw: { name: 'お尋ね者', lv: 1 }, prisoner: { name: '囚人', lv: 0 },
};

// 職業（place = 働く場所, goods = 生み出す品, combat = 戦える）
export const JOBS = {
  king:       { name: '国王',         place: 'castle',    rank: 'king' },
  royal:      { name: '王族',         place: 'castle',    rank: 'royal' },
  noble:      { name: '貴族',         place: 'mansion',   rank: 'noble' },
  knight:     { name: '騎士',         place: 'barracks',  rank: 'knight', combat: 3 },
  soldier:    { name: '兵士',         place: 'barracks',  rank: 'citizen', combat: 2 },
  guard:      { name: '衛兵',         place: 'patrol',    rank: 'citizen', combat: 2 },
  jailer:     { name: '看守',         place: 'prison',    rank: 'citizen', combat: 1 },
  farmer:     { name: '農夫',         place: 'field',     rank: 'commoner', goods: 'wheat' },
  rancher:    { name: '牧場主',       place: 'ranch',     rank: 'commoner', goods: 'meat' },
  hunter:     { name: '狩人',         place: 'wild',      rank: 'commoner', goods: 'meat', combat: 1 },
  fisher:     { name: '漁師',         place: 'shore',     rank: 'commoner', goods: 'fish' },
  woodcutter: { name: '木こり',       place: 'forest',    rank: 'commoner', goods: 'wood' },
  miner:      { name: '鉱夫',         place: 'mine',      rank: 'commoner', goods: 'ore' },
  baker:      { name: 'パン職人',     place: 'bakery',    rank: 'citizen', goods: 'bread' },
  smith:      { name: '鍛冶屋',       place: 'smithy',    rank: 'citizen', goods: 'tools' },
  carpenter:  { name: '大工',         place: 'workshop',  rank: 'citizen', goods: 'furniture' },
  innkeeper:  { name: '宿屋の主人',   place: 'tavern',    rank: 'citizen', goods: 'ale' },
  merchant:   { name: '商人',         place: 'market',    rank: 'citizen' },
  tailor:     { name: '仕立て屋',     place: 'workshop',  rank: 'citizen', goods: 'cloth' },
  servant:    { name: '召使い',       place: 'castle',    rank: 'commoner' },
  priest:     { name: '司祭',         place: 'church',    rank: 'citizen' },
  elder:      { name: '村長',         place: 'church',    rank: 'commoner' },
  wizard:     { name: '魔法使い',     place: 'magictower', rank: 'citizen', combat: 3, research: 1 },
  scholar:    { name: '学者',         place: 'observatory', rank: 'citizen', research: 1.4 },
  adventurer: { name: '冒険者',       place: 'guild',     rank: 'adventurer', combat: 2 },
  sailor:     { name: '船乗り',       place: 'dock',      rank: 'commoner', goods: 'fish' },
  thief:      { name: '盗賊',         place: 'hideout',   rank: 'outlaw', combat: 1 },
  wanderer:   { name: '旅人',         place: 'road',      rank: 'wanderer' },
  beggar:     { name: '物乞い',       place: 'plaza',     rank: 'homeless' },
  bard:       { name: '吟遊詩人',     place: 'tavern',    rank: 'wanderer' },

  // 宮廷
  chancellor: { name: '宰相',         place: 'castle',    rank: 'noble', svc: 'advise', pay: 3 },
  treasurer:  { name: '財務大臣',     place: 'castle',    rank: 'noble', svc: 'finance', pay: 3 },
  general:    { name: '将軍',         place: 'barracks',  rank: 'knight', combat: 4, svc: 'command', pay: 3 },
  royalguard: { name: '近衛騎士',     place: 'castle',    rank: 'knight', combat: 3, pay: 1.6 },
  courtmage:  { name: '宮廷魔術師',   place: 'magictower', rank: 'noble', combat: 3, research: 1.6, pay: 2 },
  butler:     { name: '執事',         place: 'castle',    rank: 'citizen', pay: 1.2 },
  maid:       { name: '侍女',         place: 'castle',    rank: 'commoner', pay: 0.9 },
  cook:       { name: '宮廷料理人',   place: 'castle',    rank: 'citizen', pay: 1.1, svc: 'feed' },
  gardener:   { name: '庭師',         place: 'castle',    rank: 'commoner', pay: 0.8 },
  jester:     { name: '道化師',       place: 'castle',    rank: 'citizen', pay: 0.8, svc: 'entertain' },
  // 町
  doctor:     { name: '医者',         place: 'clinic',    rank: 'citizen', svc: 'heal', pay: 1.5 },
  herbalist:  { name: '薬師',         place: 'clinic',    rank: 'citizen', goods: 'medicine' },
  midwife:    { name: '産婆',         place: 'clinic',    rank: 'commoner', svc: 'birth', pay: 0.8 },
  teacher:    { name: '教師',         place: 'school',    rank: 'citizen', svc: 'teach', pay: 1.1 },
  scribe:     { name: '書記',         place: 'castle',    rank: 'citizen', research: 0.5, pay: 1 },
  changer:    { name: '両替商',       place: 'market',    rank: 'citizen', svc: 'bank' },
  butcher:    { name: '肉屋',         place: 'market',    rank: 'citizen', goods: 'meat' },
  brewer:     { name: '酒造り',       place: 'tavern',    rank: 'citizen', goods: 'ale' },
  cobbler:    { name: '靴屋',         place: 'workshop',  rank: 'citizen', goods: 'shoes' },
  potter:     { name: '陶工',         place: 'workshop',  rank: 'citizen', goods: 'pottery' },
  weaver:     { name: '機織り',       place: 'workshop',  rank: 'commoner', goods: 'cloth' },
  jeweler:    { name: '宝石職人',     place: 'workshop',  rank: 'citizen', goods: 'jewelry' },
  alchemist:  { name: '錬金術師',     place: 'magictower', rank: 'citizen', goods: 'medicine', research: 0.6 },
  fortune:    { name: '占い師',       place: 'plaza',     rank: 'wanderer', svc: 'entertain' },
  painter:    { name: '画家',         place: 'plaza',     rank: 'citizen', svc: 'entertain' },
  musician:   { name: '楽師',         place: 'tavern',    rank: 'citizen', svc: 'entertain' },
  dancer:     { name: '踊り子',       place: 'tavern',    rank: 'commoner', svc: 'entertain' },
  stablehand: { name: '馬丁',         place: 'stable',    rank: 'commoner', pay: 0.7 },
  messenger:  { name: '伝令',         place: 'road',      rank: 'commoner', svc: 'news', pay: 0.9 },
  watchman:   { name: '夜警',         place: 'patrol',    rank: 'citizen', combat: 1, pay: 0.9 },
  gravedigger:{ name: '墓守',         place: 'church',    rank: 'commoner', pay: 0.6 },
  laundress:  { name: '洗濯婦',       place: 'shore',     rank: 'commoner', svc: 'service' },
  nanny:      { name: '乳母',         place: 'home',      rank: 'commoner', svc: 'childcare', pay: 0.6 },
  barber:     { name: '床屋',         place: 'plaza',     rank: 'citizen', svc: 'service' },
  storyteller:{ name: '語り部',       place: 'plaza',     rank: 'commoner', svc: 'story' },
  nun:        { name: '修道女',       place: 'church',    rank: 'commoner', svc: 'heal', pay: 0.6 },
  // 村
  shepherd:   { name: '羊飼い',       place: 'ranch',     rank: 'commoner', goods: 'wool' },
  beekeeper:  { name: '養蜂家',       place: 'field',     rank: 'commoner', goods: 'honey' },
  miller:     { name: '粉屋',         place: 'mill',      rank: 'commoner', svc: 'mill' },
  charcoal:   { name: '炭焼き',       place: 'forest',    rank: 'commoner', goods: 'wood' },
  mason:      { name: '石工',         place: 'mine',      rank: 'commoner', goods: 'stone' },
  gatherer:   { name: '薬草摘み',     place: 'forest',    rank: 'commoner', goods: 'herbs' },
  // 港
  captain:    { name: '船長',         place: 'dock',      rank: 'citizen', goods: 'fish', svc: 'trade' },
  shipwright: { name: '船大工',       place: 'workshop',  rank: 'citizen', goods: 'furniture' },
  keeper:     { name: '灯台守',       place: 'lighthouse', rank: 'commoner', pay: 0.7 },
  diver:      { name: '真珠採り',     place: 'shore',     rank: 'commoner', goods: 'gem' },
  pirate:     { name: '海賊',         place: 'dock',      rank: 'outlaw', combat: 2, crook: true },
  smuggler:   { name: '密輸人',       place: 'dock',      rank: 'citizen', crook: true, svc: 'trade' },
  // 冒険者
  warrior:    { name: '戦士',         place: 'guild',     rank: 'adventurer', combat: 3 },
  archer:     { name: '弓使い',       place: 'guild',     rank: 'adventurer', combat: 2 },
  cleric:     { name: '僧侶',         place: 'church',    rank: 'adventurer', combat: 1, svc: 'heal' },
  sage:       { name: '賢者',         place: 'magictower', rank: 'adventurer', combat: 3, research: 0.8 },
  paladin:    { name: '聖騎士',       place: 'church',    rank: 'knight', combat: 4 },
  guildmaster:{ name: 'ギルドマスター', place: 'guild',   rank: 'citizen', combat: 3, svc: 'quests' },
  // 悪党
  banditchief:{ name: '盗賊の頭',     place: 'hideout',   rank: 'outlaw', combat: 3, crook: true },
  pickpocket: { name: 'スリ',         place: 'plaza',     rank: 'citizen', crook: true },
  swindler:   { name: '詐欺師',       place: 'market',    rank: 'citizen', crook: true },
};

// 品物
export const GOODS = {
  wheat:     { name: '小麦',   base: 2,  meals: 1, target: 40 },
  bread:     { name: 'パン',   base: 3,  meals: 2, target: 30 },
  fish:      { name: '魚',     base: 4,  meals: 2, target: 16 },
  meat:      { name: '肉',     base: 6,  meals: 3, target: 12 },
  wood:      { name: '材木',   base: 2,  meals: 0, target: 30 },
  ore:       { name: '鉄鉱石', base: 5,  meals: 0, target: 20 },
  tools:     { name: '道具',   base: 14, meals: 0, target: 6 },
  weapons:   { name: '武器',   base: 30, meals: 0, target: 6 },
  ale:       { name: '麦酒',   base: 2,  meals: 0, target: 20 },
  cloth:     { name: '布',     base: 8,  meals: 0, target: 10 },
  furniture: { name: '家具',   base: 26, meals: 0, target: 4 },
  gem:       { name: '宝石',   base: 80, meals: 0, target: 3 },
  honey:     { name: 'はちみつ', base: 5, meals: 1, target: 8 },
  wool:      { name: '羊毛',   base: 4,  meals: 0, target: 12 },
  herbs:     { name: '薬草',   base: 3,  meals: 0, target: 12 },
  medicine:  { name: '薬',     base: 12, meals: 0, target: 6 },
  shoes:     { name: '靴',     base: 10, meals: 0, target: 6 },
  pottery:   { name: '陶器',   base: 6,  meals: 0, target: 8 },
  jewelry:   { name: '装身具', base: 60, meals: 0, target: 3 },
  stone:     { name: '石材',   base: 3,  meals: 0, target: 20 },
};
// 冒険で手に入る貴重品
export const TREASURES = ['古代の金貨', '竜の鱗', '魔石', 'ファラオの黄金仮面', '聖銀の短剣', '星読みの水晶', '古文書', '人魚の涙', '精霊の羽根', '王家の紋章入り指輪'];

// 7つの根源的な欲求
export const DESIRES = {
  survival: '生存欲', sleep: '睡眠欲', hunger: '食欲', lust: '性欲', sloth: '怠惰欲', pleasure: '感楽欲', esteem: '承認欲',
};

// 研究（国ごとに発見していく）
export const TECHS = [
  { id: 'rotation', name: '輪作農法', cost: 60, desc: '畑の実りが増える' },
  { id: 'steel', name: '鋼の製法', cost: 90, desc: '武器と道具が強くなる' },
  { id: 'medicine', name: '薬草学', cost: 80, desc: '病で死ぬ人が減る' },
  { id: 'telescope', name: '望遠鏡', cost: 100, desc: '魔物の襲来を早く察知できる' },
  { id: 'navigation', name: '航海術', cost: 110, desc: '漁と交易が盛んになる' },
  { id: 'healing', name: '治癒魔法', cost: 140, desc: '戦いの傷が早く癒える' },
  { id: 'barrier', name: '結界魔法', cost: 170, desc: '町に魔物が近づきにくくなる' },
  { id: 'printing', name: '活版印刷', cost: 130, desc: '知識が早く広まる' },
  { id: 'holy', name: '聖剣の鍛造', cost: 240, desc: '魔王と戦う力になる' },
  { id: 'irrigation', name: '灌漑', cost: 120, desc: '日照りでも作物が育つ' },
];

// 口癖・ことわざ
export const SAYINGS = [
  '麦は踏まれて強くなる', '急ぐ川は海に着かない', '腹が減っては剣も握れん', '隣の窯の火を笑うな',
  '雨の日には雨の仕事がある', '借りた斧は研いで返せ', '冬を越えた者だけが春を語れる', '海は嘘をつかない',
  '口より先に手を動かせ', '鐘が鳴ったら家に帰れ', '友と麦酒は古いほどいい', '風の向きは変わるが山は動かん',
  '明日のパンより今日の笑顔', '森の木は一本ずつしか倒れない', '家族は屋根、友は窓', '王冠より温かいスープ',
  '魔物より怖いのは空の麦袋', '剣は抜かぬうちが一番強い', '砂は水を覚えている', '星は迷い人の地図',
];
export const DREAMS = [
  '自分の店を持つ', '王都を一度この目で見る', '伝説の魔物を倒す', '村いちばんの麦畑をつくる', '子どもたちに立派な家を残す',
  '海の向こうへ渡る', '騎士に取り立てられる', '誰よりもうまいパンを焼く', '世界の端を確かめる', '静かに年をとる',
  '星の運行の謎を解く', '魔王を討って名を残す', '誰にも頭を下げずに生きる', '新しい魔法を編み出す', '砂漠の古代遺跡の秘密を知る',
  '王様に認められる', '大金持ちになる', 'だれかに心から愛される', '故郷に錦を飾る', 'もう一度家族と暮らす',
];

export const DEATH_CAUSES = {
  old: '老衰', sick: '流行り病', winter: '冬の寒さ', accident: '事故', lake: '水の事故', birth: 'お産', infant: '幼い病',
  war: '戦', justice: '討伐', monster: '魔物', murder: '何者かの凶刃', execution: '処刑', hunger: '飢え', beast: '獣', demon: '魔王軍',
};

// 生き物の種類
// kind: livestock(家畜) / wild(野生) / neutral(中立の魔物) / hostile(敵対する魔物) / demon(魔王軍)
// shape: 描き方, biome: 生息地
export const SPECIES = {
  // 家畜
  cow:      { name: '牛', kind: 'livestock', shape: 'quad', col: '#f2eee6', col2: '#3a2e28', size: 1.0, hp: 30, atk: 2, speed: 0.4, diet: 'grass' },
  sheep:    { name: '羊', kind: 'livestock', shape: 'quad', col: '#f4f1ea', col2: '#2e2622', size: 0.7, hp: 15, atk: 0, speed: 0.4, diet: 'grass', wool: true },
  pig:      { name: '豚', kind: 'livestock', shape: 'quad', col: '#f0b4b0', col2: '#c47a78', size: 0.7, hp: 18, atk: 1, speed: 0.4, diet: 'grass' },
  chicken:  { name: '鶏', kind: 'livestock', shape: 'bird', col: '#ffffff', col2: '#d9463a', size: 0.4, hp: 4, atk: 0, speed: 0.5, diet: 'grass' },
  horse:    { name: '馬', kind: 'livestock', shape: 'quad', col: '#8a5a34', col2: '#3a2618', size: 1.1, hp: 35, atk: 3, speed: 1.2, diet: 'grass', tall: true },
  goat:     { name: 'ヤギ', kind: 'livestock', shape: 'quad', col: '#e8e0d0', col2: '#6a5a4a', size: 0.6, hp: 14, atk: 2, speed: 0.6, diet: 'grass', horns: true },
  // 野生動物
  deer:     { name: 'シカ', kind: 'wild', shape: 'quad', col: '#b07a3a', col2: '#f0e0c0', size: 0.9, hp: 20, atk: 2, speed: 1.2, diet: 'grass', biome: ['forest', 'dense', 'grass'], antlers: true, tall: true },
  boar:     { name: 'イノシシ', kind: 'wild', shape: 'quad', col: '#5a4030', col2: '#e8e0d0', size: 0.8, hp: 30, atk: 6, speed: 0.9, diet: 'grass', biome: ['forest', 'dense'], tusks: true },
  wolf:     { name: 'オオカミ', kind: 'wild', shape: 'quad', col: '#7a7a80', col2: '#c8c8cc', size: 0.8, hp: 28, atk: 8, speed: 1.3, diet: 'meat', biome: ['dense', 'forest', 'snow'], ears: true, pack: true },
  bear:     { name: 'クマ', kind: 'wild', shape: 'quad', col: '#4a3222', col2: '#2a1a10', size: 1.3, hp: 70, atk: 14, speed: 0.9, diet: 'both', biome: ['dense', 'forest'], ears: true },
  fox:      { name: 'キツネ', kind: 'wild', shape: 'quad', col: '#d9782e', col2: '#ffffff', size: 0.55, hp: 10, atk: 3, speed: 1.3, diet: 'meat', biome: ['forest', 'grass'], ears: true },
  rabbit:   { name: 'ウサギ', kind: 'wild', shape: 'quad', col: '#c8b8a0', col2: '#ffffff', size: 0.35, hp: 4, atk: 0, speed: 1.4, diet: 'grass', biome: ['grass', 'forest', 'snow'], ears: true },
  squirrel: { name: 'リス', kind: 'wild', shape: 'quad', col: '#a8602a', col2: '#f0d8b0', size: 0.3, hp: 3, atk: 0, speed: 1.4, diet: 'grass', biome: ['forest', 'dense'], ears: true },
  camel:    { name: 'ラクダ', kind: 'wild', shape: 'quad', col: '#d8b07a', col2: '#8a6a40', size: 1.2, hp: 40, atk: 3, speed: 0.8, diet: 'grass', biome: ['desert'], tall: true, hump: true },
  scorpion: { name: 'サソリ', kind: 'wild', shape: 'bug', col: '#2a2420', col2: '#c9a23a', size: 0.4, hp: 8, atk: 5, speed: 0.8, diet: 'meat', biome: ['desert'] },
  croc:     { name: 'ワニ', kind: 'wild', shape: 'lizard', col: '#4a6a32', col2: '#c8d890', size: 1.0, hp: 45, atk: 12, speed: 0.6, diet: 'meat', biome: ['jungle', 'river'] },
  monkey:   { name: 'サル', kind: 'wild', shape: 'biped', col: '#8a5a34', col2: '#f0c8a0', size: 0.5, hp: 12, atk: 2, speed: 1.2, diet: 'grass', biome: ['jungle'] },
  tiger:    { name: 'トラ', kind: 'wild', shape: 'quad', col: '#e0892e', col2: '#1a1410', size: 1.1, hp: 60, atk: 15, speed: 1.3, diet: 'meat', biome: ['jungle'], stripes: true, ears: true },
  parrot:   { name: 'オウム', kind: 'wild', shape: 'bird', col: '#d9463a', col2: '#3b8fd9', size: 0.35, hp: 3, atk: 0, speed: 1.2, diet: 'grass', biome: ['jungle'], flies: true },
  reindeer: { name: 'トナカイ', kind: 'wild', shape: 'quad', col: '#8a6a50', col2: '#f0f0f0', size: 1.0, hp: 30, atk: 3, speed: 1.0, diet: 'grass', biome: ['snow'], antlers: true, tall: true },
  polarbear:{ name: 'ホッキョクグマ', kind: 'wild', shape: 'quad', col: '#f4f4f0', col2: '#2a2a2a', size: 1.4, hp: 80, atk: 16, speed: 0.9, diet: 'meat', biome: ['snow'], ears: true },
  penguin:  { name: 'ペンギン', kind: 'wild', shape: 'biped', col: '#1a1a22', col2: '#ffffff', size: 0.45, hp: 6, atk: 0, speed: 0.5, diet: 'meat', biome: ['snowcoast'] },
  seagull:  { name: 'カモメ', kind: 'wild', shape: 'bird', col: '#ffffff', col2: '#8a8a8a', size: 0.35, hp: 3, atk: 0, speed: 1.4, diet: 'meat', biome: ['beach'], flies: true },
  eagle:    { name: 'ワシ', kind: 'wild', shape: 'bird', col: '#5a3a22', col2: '#ffffff', size: 0.5, hp: 10, atk: 4, speed: 1.6, diet: 'meat', biome: ['mountain'], flies: true },
  dolphin:  { name: 'イルカ', kind: 'wild', shape: 'fish', col: '#6a8aa8', col2: '#d8e4ee', size: 0.9, hp: 20, atk: 1, speed: 1.4, diet: 'meat', biome: ['sea'], swims: true },
  whale:    { name: 'クジラ', kind: 'wild', shape: 'fish', col: '#3a4a60', col2: '#c8d0d8', size: 2.4, hp: 200, atk: 5, speed: 0.6, diet: 'meat', biome: ['deepsea'], swims: true },
  dog:      { name: '犬', kind: 'livestock', shape: 'quad', col: '#a8783a', col2: '#f0e0c0', size: 0.55, hp: 16, atk: 5, speed: 1.2, diet: 'meat', ears: true },
  cat:      { name: '猫', kind: 'livestock', shape: 'quad', col: '#e0a060', col2: '#ffffff', size: 0.35, hp: 8, atk: 3, speed: 1.2, diet: 'meat', ears: true },
  donkey:   { name: 'ロバ', kind: 'livestock', shape: 'quad', col: '#8a8078', col2: '#e0dcd8', size: 0.9, hp: 28, atk: 2, speed: 0.7, diet: 'grass', ears: true, tall: true },
  duck:     { name: 'アヒル', kind: 'livestock', shape: 'bird', col: '#ffffff', col2: '#f0a030', size: 0.35, hp: 4, atk: 0, speed: 0.5, diet: 'grass' },
  rat:      { name: 'ネズミ', kind: 'wild', shape: 'quad', col: '#6a6058', col2: '#c8a8a0', size: 0.22, hp: 2, atk: 1, speed: 1.2, diet: 'grass', biome: ['town'], ears: true },
  crow:     { name: 'カラス', kind: 'wild', shape: 'bird', col: '#1a1a22', col2: '#3a3a4a', size: 0.35, hp: 4, atk: 1, speed: 1.4, diet: 'meat', biome: ['grass', 'forest', 'town'], flies: true },
  owl:      { name: 'フクロウ', kind: 'wild', shape: 'bird', col: '#8a6a4a', col2: '#f0d8a0', size: 0.4, hp: 6, atk: 2, speed: 1.2, diet: 'meat', biome: ['forest', 'dense'], flies: true },
  frog:     { name: 'カエル', kind: 'wild', shape: 'lizard', col: '#4f9a3a', col2: '#c8e0a0', size: 0.2, hp: 2, atk: 0, speed: 0.7, diet: 'meat', biome: ['jungle', 'river'] },
  snake:    { name: 'ヘビ', kind: 'wild', shape: 'lizard', col: '#6a7a2a', col2: '#c8b84a', size: 0.5, hp: 10, atk: 6, speed: 0.8, diet: 'meat', biome: ['jungle', 'desert', 'grass'] },
  turtle:   { name: 'カメ', kind: 'wild', shape: 'lizard', col: '#5a6a3a', col2: '#a88a5a', size: 0.45, hp: 20, atk: 1, speed: 0.2, diet: 'grass', biome: ['beach', 'river'] },
  bat:      { name: 'コウモリ', kind: 'wild', shape: 'bird', col: '#3a2a3a', col2: '#6a4a5a', size: 0.3, hp: 3, atk: 1, speed: 1.5, diet: 'meat', biome: ['mountain', 'cave'], flies: true },
  // 中立の魔物
  slime:    { name: 'スライム', kind: 'neutral', shape: 'blob', col: '#4fc3e8', col2: '#1d6f9a', size: 0.5, hp: 12, atk: 2, speed: 0.5, diet: 'grass', biome: ['grass', 'forest'], evolve: 'bigslime', monster: true },
  bigslime: { name: 'ビッグスライム', kind: 'neutral', shape: 'blob', col: '#6fd86a', col2: '#2f7a2a', size: 0.9, hp: 40, atk: 6, speed: 0.5, diet: 'grass', evolve: 'kingslime', monster: true },
  kingslime:{ name: 'キングスライム', kind: 'hostile', shape: 'blob', col: '#e8c83a', col2: '#9a7a1a', size: 1.5, hp: 120, atk: 14, speed: 0.4, diet: 'meat', crown: true, monster: true },
  unicorn:  { name: 'ユニコーン', kind: 'neutral', shape: 'quad', col: '#ffffff', col2: '#e8c8f0', size: 1.1, hp: 60, atk: 10, speed: 1.4, diet: 'grass', biome: ['dense'], horn: true, tall: true, monster: true },
  golem:    { name: 'ゴーレム', kind: 'neutral', shape: 'biped', col: '#8a8478', col2: '#4fc3e8', size: 1.4, hp: 150, atk: 16, speed: 0.3, diet: 'none', biome: ['mountain'], monster: true },
  // 敵対する魔物
  goblin:   { name: 'ゴブリン', kind: 'hostile', shape: 'biped', col: '#6a9a3a', col2: '#5a3a22', size: 0.6, hp: 18, atk: 5, speed: 0.9, diet: 'meat', biome: ['forest', 'dense', 'cave'], evolve: 'hobgoblin', monster: true, loot: 8 },
  hobgoblin:{ name: 'ホブゴブリン', kind: 'hostile', shape: 'biped', col: '#4a7a2a', col2: '#3a2618', size: 0.85, hp: 45, atk: 10, speed: 0.9, diet: 'meat', evolve: 'goblinlord', monster: true, loot: 20 },
  goblinlord:{ name: 'ゴブリンロード', kind: 'hostile', shape: 'biped', col: '#2f5a1a', col2: '#c9a23a', size: 1.2, hp: 110, atk: 18, speed: 0.8, diet: 'meat', crown: true, monster: true, loot: 60 },
  orc:      { name: 'オーク', kind: 'hostile', shape: 'biped', col: '#7a8a4a', col2: '#4a3222', size: 1.0, hp: 55, atk: 11, speed: 0.8, diet: 'meat', biome: ['dense', 'waste'], evolve: 'orcking', monster: true, loot: 25 },
  orcking:  { name: 'オークキング', kind: 'hostile', shape: 'biped', col: '#5a6a2a', col2: '#c9a23a', size: 1.4, hp: 160, atk: 22, speed: 0.7, diet: 'meat', crown: true, monster: true, loot: 90 },
  skeleton: { name: 'スケルトン', kind: 'hostile', shape: 'biped', col: '#e8e4d8', col2: '#2a2a2a', size: 0.9, hp: 30, atk: 9, speed: 0.7, diet: 'none', biome: ['cave'], evolve: 'skelknight', monster: true, loot: 15, undead: true },
  skelknight:{ name: 'スケルトンナイト', kind: 'hostile', shape: 'biped', col: '#d8d4c8', col2: '#5a5a6a', size: 1.0, hp: 70, atk: 15, speed: 0.7, diet: 'none', evolve: 'lich', monster: true, loot: 40, undead: true },
  lich:     { name: 'リッチ', kind: 'hostile', shape: 'biped', col: '#6a3a8a', col2: '#e8e4d8', size: 1.1, hp: 150, atk: 24, speed: 0.6, diet: 'none', monster: true, loot: 120, undead: true, crown: true },
  mummy:    { name: 'ミイラ', kind: 'hostile', shape: 'biped', col: '#d8c8a0', col2: '#8a7a5a', size: 0.9, hp: 40, atk: 9, speed: 0.5, diet: 'none', biome: ['pyramid'], evolve: 'pharaoh', monster: true, loot: 25, undead: true },
  pharaoh:  { name: 'ファラオの亡霊', kind: 'hostile', shape: 'biped', col: '#3a6ab0', col2: '#e8c83a', size: 1.2, hp: 170, atk: 22, speed: 0.6, diet: 'none', monster: true, loot: 150, undead: true, crown: true },
  spider:   { name: '大蜘蛛', kind: 'hostile', shape: 'spider', col: '#2a2228', col2: '#c9463a', size: 0.8, hp: 35, atk: 10, speed: 1.0, diet: 'meat', biome: ['jungle', 'cave', 'dense'], evolve: 'arachne', monster: true, loot: 18 },
  arachne:  { name: 'アラクネ', kind: 'hostile', shape: 'spider', col: '#4a2a4a', col2: '#e8c8a0', size: 1.3, hp: 120, atk: 19, speed: 1.0, diet: 'meat', monster: true, loot: 80 },
  wyvern:   { name: 'ワイバーン', kind: 'hostile', shape: 'dragon', col: '#6a4a8a', col2: '#c8a8e8', size: 1.4, hp: 110, atk: 18, speed: 1.3, diet: 'meat', biome: ['mountain'], evolve: 'dragon', monster: true, loot: 80, flies: true },
  dragon:   { name: 'ドラゴン', kind: 'hostile', shape: 'dragon', col: '#b8322a', col2: '#e8c83a', size: 2.4, hp: 450, atk: 40, speed: 1.1, diet: 'meat', monster: true, loot: 400, flies: true },
  // 魔王軍
  imp:      { name: 'インプ', kind: 'demon', shape: 'biped', col: '#8a2a3a', col2: '#1a1a1a', size: 0.6, hp: 25, atk: 8, speed: 1.0, diet: 'none', monster: true, loot: 12, horns: true, evolve: 'demonsoldier' },
  demonsoldier:{ name: '魔族兵', kind: 'demon', shape: 'biped', col: '#4a2a5a', col2: '#c9463a', size: 1.0, hp: 70, atk: 15, speed: 0.9, diet: 'none', monster: true, loot: 35, horns: true, evolve: 'demongeneral' },
  demongeneral:{ name: '魔将', kind: 'demon', shape: 'biped', col: '#2a1a3a', col2: '#e8c83a', size: 1.4, hp: 220, atk: 28, speed: 0.9, diet: 'none', monster: true, loot: 150, horns: true },
  demonlord:{ name: '魔王', kind: 'demon', shape: 'biped', col: '#1a0e22', col2: '#d9263a', size: 2.0, hp: 900, atk: 55, speed: 0.8, diet: 'none', monster: true, loot: 1000, horns: true, crown: true, boss: true },
};

export const JOB_QUOTA = {
  capital: {
    king: 1, beggar: 2, thief: 1, pickpocket: 1, swindler: 1, knight: 2, soldier: 3, guard: 2, jailer: 1, watchman: 1,
    chancellor: 1, treasurer: 1, general: 1, royalguard: 2, courtmage: 1, butler: 1, maid: 2, cook: 1, gardener: 1, jester: 1,
    scholar: 1, wizard: 1, alchemist: 1, scribe: 1, doctor: 1, herbalist: 1, midwife: 1, teacher: 1, nun: 1,
    adventurer: 1, warrior: 1, archer: 1, cleric: 1, sage: 1, paladin: 1, guildmaster: 1,
    merchant: 1, changer: 1, butcher: 1, brewer: 1, cobbler: 1, potter: 1, weaver: 1, jeweler: 1, tailor: 1,
    priest: 1, baker: 1, smith: 1, innkeeper: 1, carpenter: 1, fortune: 1, painter: 1, musician: 1, dancer: 1,
    stablehand: 1, messenger: 1, gravedigger: 1, laundress: 1, nanny: 1, barber: 1, noble: 2,
  },
  village: { elder: 1, farmer: 5, rancher: 1, shepherd: 1, beekeeper: 1, miller: 1, hunter: 1, woodcutter: 1, charcoal: 1, gatherer: 1, mason: 1, innkeeper: 1, priest: 1, smith: 1, miner: 1, storyteller: 1, midwife: 1 },
  port: { fisher: 3, sailor: 2, captain: 1, shipwright: 1, keeper: 1, diver: 1, pirate: 1, smuggler: 1, merchant: 1, innkeeper: 1, priest: 1, guard: 2, baker: 1, laundress: 1, musician: 1 },
};

// 性格の特徴ラベル
export function traitLabels(p) {
  const t = [];
  const { O, C, E, A, N } = p.pers;
  if (E > 0.68) t.push('陽気'); else if (E < 0.3) t.push('無口');
  if (A > 0.7) t.push('お人好し'); else if (A < 0.3) t.push('皮肉屋');
  if (C > 0.7) t.push('働き者'); else if (C < 0.3) t.push('怠け者');
  if (N > 0.68) t.push('心配性'); else if (N < 0.25) t.push('肝がすわっている');
  if (O > 0.7) t.push('好奇心旺盛'); else if (O < 0.3) t.push('頑固');
  if (p.values.faith > 0.75) t.push('信心深い');
  if (p.values.ambition > 0.75) t.push('野心家');
  if (p.values.family > 0.8) t.push('家族思い');
  if (p.values.courage > 0.75) t.push('勇敢'); else if (p.values.courage < 0.22) t.push('臆病');
  if (p.sleepType === 'short') t.push('ショートスリーパー'); else if (p.sleepType === 'long') t.push('ロングスリーパー');
  if (E > 0.55 && A < 0.45) t.push('噂好き');
  return t.slice(0, 5);
}

// 生き物の役割
export const ROLES = {
  leader: '群れの長', sentry: '見張り', scout: '斥候', guardian: '巣の守り手', member: '群れの一員', loner: 'はぐれ者', parent: '子育て中', young: '子ども',
  dairy: '乳牛', plow: '畑を耕す役', mount: '乗用馬', pack: '荷運び', layer: '卵を産む役', wool: '毛を刈られる役', meat: '食肉用',
  herder: '牧羊犬', watchdog: '番犬', mouser: 'ネズミ捕り', pest: '食糧を荒らす', raider: '襲撃部隊', herald: '魔王の伝令', aide: '魔王の側近', castleguard: '魔王城の番兵', overlord: '魔界の支配者',
  wanderer: 'さすらい', treasure: '宝の番人',
};
