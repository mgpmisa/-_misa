// 世界の基本データ（名前・職業・品物・ことわざなど）

export const VILLAGE = 'リンデンベルク';
export const ERA = 'リンデン暦';
export const DAYS_PER_SEASON = 10;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
export const SEASONS = ['春', '夏', '秋', '冬'];
export const HISTORY_YEARS = 312; // 村ができてから今までの年数

export const MALE_NAMES = [
  'ハンス', 'ルーカス', 'エミール', 'フリッツ', 'ヨハン', 'カール', 'オットー', 'マティアス', 'テオ', 'ニコ',
  'パウル', 'フェリクス', 'ベン', 'ヤコブ', 'ルドルフ', 'ヴィルヘルム', 'アルベルト', 'ゲオルク', 'レオン', 'マックス',
  'ユリアン', 'アントン', 'ベルント', 'クラウス', 'ディーター', 'ミヒャエル', 'ロルフ', 'ジーモン', 'トビアス', 'ヴァルター',
  'コンラート', 'ハインリヒ', 'ルートヴィヒ', 'フランツ', 'エーリヒ', 'グスタフ', 'ラインハルト', 'ウルリヒ', 'オスカー', 'イーヴォ',
];
export const FEMALE_NAMES = [
  'エマ', 'アンナ', 'マリー', 'ソフィア', 'ハンナ', 'クララ', 'リーナ', 'ミア', 'グレタ', 'ローザ',
  'エルザ', 'イルゼ', 'ヘレナ', 'マルタ', 'ロッテ', 'フリーダ', 'ゾフィー', 'ベルタ', 'アガーテ', 'ユリア',
  'レナ', 'イダ', 'カタリーナ', 'ミラ', 'ノラ', 'エファ', 'リリー', 'テレーゼ', 'ドーラ', 'ルイーゼ',
  'ヒルデ', 'ゲルダ', 'アメリー', 'パウラ', 'ヨハンナ', 'マグダ', 'ウルズラ', 'ヴィルマ', 'エディト', 'ネレ',
];
export const FOUNDER_FAMILIES = ['ベルク', 'ミュラー', 'シュミット', 'ファーバー', 'ホルツ', 'ヴァイス'];
export const IMMIGRANT_FAMILIES = [
  'クラウゼ', 'ブラウン', 'ランゲ', 'ケラー', 'フィッシャー', 'ベッカー', 'ヴォルフ', 'ハーン', 'ローゼ', 'リンデ',
  'ブルンネン', 'アイヒェ', 'シュトルム', 'ハルトマン', 'ツィマー', 'フォーゲル', 'ゾンマー', 'ウィンター',
];
export const ORIGINS = ['東の山向こうの村', '南の川沿いの町', '北の森の集落', '西の港町', '遠い王都', '峠の宿場'];

// 職業
export const JOBS = {
  farmer:     { name: '農夫',       place: 'field',  goods: 'wheat',  deed: '村いちばんの麦を育てた' },
  baker:      { name: 'パン職人',   place: 'bakery', goods: 'bread',  deed: '毎朝だれよりも早く窯に火を入れた' },
  fisher:     { name: '漁師',       place: 'pond',   goods: 'fish',   deed: '湖の主と呼ばれる大魚を釣り上げた' },
  woodcutter: { name: '木こり',     place: 'forest', goods: 'wood',   deed: '森の奥の大木を一人で倒した' },
  smith:      { name: '鍛冶屋',     place: 'smithy', goods: 'tools',  deed: '村じゅうの鍬を打ち直した' },
  innkeeper:  { name: '酒場の主人', place: 'tavern', goods: 'ale',    deed: '旅人たちの話を集めていた' },
  merchant:   { name: '商人',       place: 'market', goods: null,     deed: '王都まで荷馬車で商いに行った' },
  carpenter:  { name: '大工',       place: 'workshop', goods: 'furniture', deed: '村の半分の家の梁を組んだ' },
  priest:     { name: '司祭',       place: 'chapel', goods: null,     deed: '村人の婚礼と弔いを数えきれないほど執り行った' },
  mayor:      { name: '村長',       place: 'hall',   goods: null,     deed: '村の揉め事をいくつも収めた' },
};
// 最低限必要な人数
export const JOB_QUOTA = { baker: 2, fisher: 2, woodcutter: 2, smith: 1, innkeeper: 1, merchant: 1, carpenter: 1, priest: 1, mayor: 1 };

// 品物（base=基準価格 銅貨, meals=食事何回分か）
export const GOODS = {
  wheat:     { name: '小麦', base: 2,  meals: 1, target: 40 },
  bread:     { name: 'パン', base: 3,  meals: 2, target: 30 },
  fish:      { name: '魚',   base: 4,  meals: 2, target: 16 },
  wood:      { name: '薪',   base: 2,  meals: 0, target: 30 },
  tools:     { name: '道具', base: 14, meals: 0, target: 6 },
  ale:       { name: '麦酒', base: 2,  meals: 0, target: 20 },
  furniture: { name: '家具', base: 26, meals: 0, target: 4 },
};

// 口癖・家訓
export const SAYINGS = [
  '麦は踏まれて強くなる', '急ぐ川は海に着かない', '腹が減っては鍬も持てん', '隣の窯の火を笑うな',
  '雨の日には雨の仕事がある', '借りた斧は研いで返せ', '冬を越えた者だけが春を語れる', '湖は嘘をつかない',
  '口より先に手を動かせ', '鐘が鳴ったら家に帰れ', '友と麦酒は古いほどいい', '風の向きは変わるが山は動かん',
  '明日のパンより今日の笑顔', '森の木は一本ずつしか倒れない', '家族は屋根、友は窓', '空を見上げる暇があれば畑を見ろ',
];

// 夢・野心
export const DREAMS = [
  '自分の店を持つ', '王都を一度この目で見る', '湖でいちばん大きな魚を釣る', '村いちばんの麦畑をつくる',
  '子どもたちに立派な家を残す', '海というものを見てみる', '村長になる', '誰よりもうまいパンを焼く',
  '旅に出て世界の端を確かめる', '静かに年をとる', '鐘楼の上から星を数える', '家族みんなで収穫祭の踊りを踊る',
];

export const DEATH_CAUSES = {
  old: '老衰', sick: '流行り病', winter: '冬の寒さ', accident: '森での事故', lake: '湖の事故', birth: 'お産', infant: '幼い病', war: '遠い戦',
};

// 性格の特徴ラベル
export function traitLabels(p) {
  const t = [];
  const { O, C, E, A, N } = p.pers;
  if (E > 0.68) t.push('陽気'); else if (E < 0.3) t.push('無口');
  if (A > 0.7) t.push('お人好し'); else if (A < 0.3) t.push('皮肉屋');
  if (C > 0.7) t.push('働き者'); else if (C < 0.3) t.push('のんびり屋');
  if (N > 0.68) t.push('心配性'); else if (N < 0.25) t.push('肝がすわっている');
  if (O > 0.7) t.push('夢見がち'); else if (O < 0.3) t.push('頑固');
  if (p.values.faith > 0.75) t.push('信心深い');
  if (p.values.ambition > 0.75) t.push('野心家');
  if (p.values.family > 0.8) t.push('家族思い');
  if (E > 0.55 && A < 0.45) t.push('噂好き');
  return t.slice(0, 4);
}
