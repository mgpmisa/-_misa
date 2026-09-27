import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);
const SB = 'scribe', BB = 'bookbinder', PM = 'papermaker';

// ================= 紙・書く道具 =================
const P = [
  ['parchment', '羊皮紙', { hide: 1, lime: 0.2 }, 3, PM, 2, '羊や山羊の皮を石灰でさらして伸ばした紙。証文と写本に。'],
  ['vellum', '上質の皮紙', { hide: 1, lime: 0.3 }, 8, PM, 1, '子牛の皮の、透けるほど薄く白い皮紙。王の勅書に使う。'],
  ['paper_reed', '葦紙', { reed: 3 }, 1, PM, 2, '葦を叩いて重ね干しした、安くて軽い紙。'],
  ['paper_hemp', '麻紙', { hemp: 2, water: 1 }, 1.5, PM, 2, 'ぼろ麻を漉いた丈夫な紙。帳簿と手紙に。'],
  ['paper_fine', '絹漉きの紙', { cotton: 2, silk: 0.2 }, 5, PM, 1, '絹の網で漉いた、なめらかな上等紙。詩人が好む。'],
  ['paper_gilt', '金縁の便箋', { paper_fine: 1, gold_leaf: 0.2 }, 12, PM, 0, '縁に金箔を押した貴族の便箋。'],
  ['scroll_blank', '白紙の巻物', { parchment: 2, wood: 0.1 }, 7, SB, 1, '木の軸に巻いた白い羊皮紙。魔法の巻物の元。'],
  ['book_blank', '白紙の帳面', { paper_hemp: 10, leather: 0.5 }, 12, BB, 1, '革で綴じた白紙の帳面。日記や写本に。'],
  ['ledger', '帳簿', { paper_hemp: 10, leather: 0.5 }, 10, BB, 1, '罫線を引いた帳面。商人と財務大臣の必需品。'],
  ['wax_tablet', '蝋板', { planks: 0.3, wax: 0.3 }, 3, 'carpenter', 1, '蝋を流した木の板。書いて消せる子どもの練習帳。'],
  ['slate_board', '石板と白墨', { slate: 1, chalk: 0.2 }, 2, 'mason', 1, '学び舎で使う黒い石板。'],
  ['sealing_wax', '封蝋', { wax: 0.2, vermilion: 0.05 }, 2, 'chandler', 2, '手紙に封をする赤い蝋。'],
  ['signet', '印章', { silver: 0.2 }, 30, 'jeweler', 0, '家の紋を彫った指輪型の印。封蝋に押す。'],
  ['ink_soot', '煤墨', { lampblack: 1, glue: 0.2 }, 2, SB, 2, '油煙をにかわで固めた黒い墨。'],
  ['ink_gall', '没食子インク', { oak_gall: 2, green_vitriol: 0.5 }, 3, SB, 2, '何百年も消えない黒インク。証文と写本に。'],
  ['ink_color', '色インク', { dye: 0.5, glue: 0.1 }, 4, SB, 1, '赤・青・緑の色インクの組。飾り文字に。'],
  ['ink_vermilion', '朱墨', { vermilion: 0.3, glue: 0.1 }, 8, SB, 1, '朱で作る墨。お札と写本の見出しに。'],
  ['ink_gold', '金泥', { gold_leaf: 2, glue: 0.1 }, 30, SB, 0, '金を膠で溶いたインク。聖典の飾りに。'],
  ['ink_silver', '銀泥', { silver_powder: 1, glue: 0.1 }, 15, SB, 0, '銀を膠で溶いたインク。'],
  ['ink_magic', '魔法のインク', { manastone_dust: 1, ink_gall: 1 }, 12, 'wizard', 1, '魔石の粉を混ぜた青く光るインク。巻物と魔導書を書く。'],
  ['ink_blood', '血のインク', { dragon_blood: 0.1, ink_gall: 1 }, 40, 'witch', 0, '竜の血を混ぜた赤黒いインク。禁呪を書くのに使う。'],
  ['ink_invisible', '消えるインク', { lemon_juice: 1 }, 5, SB, 0, '火にかざすと文字が浮かぶ、密書のインク。'],
  ['ink_glow', '夜光インク', { glowcap: 1, glue: 0.1 }, 10, SB, 0, '暗がりで光るインク。海図と迷宮の地図に。'],
  ['quill', '羽ペン', { feather: 1 }, 1, SB, 2, '鵞鳥の羽根を削ったペン。'],
  ['quill_crow', '鴉の羽ペン', { crow_feather: 1 }, 2, SB, 1, '細い字が書ける鴉の羽ペン。写字生が好む。'],
  ['quill_eagle', '鷲の羽ペン', { eagle_feather: 1 }, 8, SB, 0, '大きく堂々とした鷲の羽ペン。王の署名用。'],
  ['reed_pen', '葦ペン', { reed: 1 }, 0.5, SB, 1, 'サハルの書記が使う葦のペン。'],
  ['silver_nib', '銀のペン先', { silver: 0.1 }, 12, 'jeweler', 0, '擦り減らない銀のペン先。'],
  ['brush_writing', '筆', { wood: 0.1, horse_hair: 0.2 }, 3, SB, 1, '馬の毛の筆。字も絵も描ける。'],
  ['pounce', '吸い取り砂', { sand: 0.5, bone_ash: 0.2 }, 0.5, SB, 1, 'インクを乾かす細かい砂。'],
  ['inkwell', 'インク壺', { pottery: 0.3 }, 3, 'potter', 1, 'こぼれにくい形の小さな壺。'],
  ['writing_box', '文箱', { planks: 1, lacquer: 0.2 }, 18, 'carpenter', 0, 'ペンとインクと紙をしまう漆塗りの箱。'],
  ['glue', 'にかわ', { hide: 0.5, bone: 0.5 }, 1.5, 'tanner', 2, '皮と骨を煮て作る糊。本の綴じ・家具・墨に。'],
];
for (const [id, name, from, v, by, d, desc] of P) C(id, name, /ink/.test(id) ? 'ink' : /quill|pen|nib|brush|pounce|inkwell|box/.test(id) ? 'writing' : 'paper', /box|slate/.test(id) ? 1.5 : 0.1, v, by, from, 0.5 + v / 10, { st: v > 20 ? 5 : 20, d, r: v >= 30 ? 1 : 0, use: U(/ink|quill|pen|nib|brush|pounce|inkwell|box/.test(id) ? 'tool:書き物をする' : 'craft:書く・写す・綴じる', ...(v >= 12 ? ['luxury'] : ['trade'])), desc });

// ================= 書物（読むと学べる・書庫の飾り） =================
const bk = (id, name, sub, v, fx, use, desc, o = {}) => C(id, name, sub, o.w ?? 1, v, o.by || SB, o.from || { book_blank: 1, ink_gall: 1 }, o.t ?? 10, { st: 1, r: o.r ?? 0, d: o.d ?? 1, lim: o.lim, use, fx, desc, more: o.more || [trade()] });
C('book', '書物', 'book', 1, 22, SB, { leather: 1, dye: 0.2, feather: 0.1 }, 5, { st: 5, d: 2, use: U('hobby:読書', 'magic:学者と魔法使いの研究', 'collect:貴族の書庫'), fx: { research: 2, mood: 2 }, desc: '写字生が一冊ずつ写した、ありふれた書物。', more: [trade()] });
// 歴史書
const H = [
  ['hist_alderia', 'アルデリア王国史', '剣と麦の国の歩みを記した正史。'],
  ['hist_vermund', 'ヴェルムント王国史', '鉄と雪の国の王と戦の記録。'],
  ['hist_sahal', 'サハル王国史', '砂と黄金の国の、オアシスの王たちの年代記。'],
  ['hist_continent', '大陸通史', '大陸暦のはじめから今までの、三つの国の通史。'],
  ['hist_demonwar', '魔王戦役記', '歴代の魔王と、それと戦った英雄たちの記録。'],
  ['hist_elda', '古王国エルダ興亡記', '灰の王に滅ぼされた古王国の、わずかに残る記録。'],
  ['hist_helwet', '砂の古王国ヘルウェトの記', 'ピラミッドを築いた古王国と、王ネフェルカーの話。'],
  ['hist_emerald', '翠の都イシュ＝カナル年代記', '密林に栄えた翠の都と大蛇ヨワリの神殿の記録。'],
  ['hist_knights', '騎士団の歴史', '王国の騎士団の創設と武勲を記した書。騎士の必読書。'],
  ['genealogy', '王家の系図', '王家と貴族の家々の血筋を記した大きな書。'],
];
for (const [id, name, desc] of H) bk(id, name, 'history', id === 'hist_elda' ? 120 : 40, { research: 4, lore: 1 }, U('hobby:読書', 'collect:貴族と学者の書庫', 'magic:研究（歴史）'), desc, { r: id === 'hist_elda' ? 2 : 0, more: id === 'hist_elda' ? [loot(['ruins'], 0.03)] : [trade()] });
// 民族誌（民族ごと）
const TR = [['fianna', 'フィアナの民'], ['yarvi', 'ヤルヴィ族'], ['mahina', 'マヒナの民'], ['mictla', 'ミクトラ族'], ['dorgu', 'ドルグ族'], ['nefer', 'ネフェル族'], ['garai', 'ガライ族'], ['bolota', 'ボロタ族'], ['harn', 'ハルン族'], ['hollin', 'ホリン衆']];
for (const [t, n] of TR) bk(`ethno_${t}`, `${n}の風俗誌`, 'history', 35, { research: 3, lore: 1 }, U('hobby:読書', 'collect:学者の書庫', 'quest:民族と仲良くなる手がかり'), `旅の学者が${n}の暮らし・祭り・守り神の伝えを書き留めた書。`, { by: 'scholar' });
// 物語・詩
const ST = [
  ['story_knight', '騎士物語', 15, '若い騎士が姫を救う、町いちばん人気の物語。'],
  ['story_love', '恋物語', 12, '身分違いの恋を描いた、娘たちが夢中になる物語。'],
  ['story_adventure', '冒険譚', 14, 'ダンジョンに挑む冒険者の手に汗にぎる話。'],
  ['story_fairy', '童話集', 8, '子どもに読み聞かせる昔話を集めた本。'],
  ['story_ghost', '怪談集', 10, '嘆きの迷宮や古い屋敷の怖い話を集めた本。'],
  ['story_epic', '英雄叙事詩', 25, '魔王を討った英雄の一生を歌った長い詩。'],
  ['story_funny', '笑い話集', 7, '道化師がネタ帳にする、酒場の笑い話集。'],
  ['story_travel', '旅行記', 18, '三つの国と奥地の民を歩いた旅人の記録。'],
  ['story_dragon', '竜退治の物語', 16, '赤き竜ヴァルグリムに挑んだ者たちの物語。'],
  ['story_pirate', '海賊の冒険記', 12, '南の海を荒らした海賊船長の自伝（嘘も多い）。'],
];
for (const [id, name, v, desc] of ST) bk(id, name, 'story', v, { mood: 6 }, U('hobby:読書（気晴らし）', 'gift:贈り物', 'luxury'), desc, { d: 2 });
const PO = [['poem_love', '恋の詩集', '恋人に贈られることの多い、甘い詩集。'], ['poem_pastoral', '田園詩集', '麦畑と羊飼いの暮らしをうたった詩集。'], ['poem_elegy', '挽歌集', '亡き人をしのぶ詩。葬儀で読まれる。'], ['poem_war', '戦の歌集', '兵が行軍しながら歌う歌の詞。'], ['songbook_bard', '吟遊詩人の歌本', '酒場で受ける歌の詞と節を書きつけた帳面。']];
for (const [id, name, desc] of PO) bk(id, name, 'poem', 12, { mood: 5 }, U('hobby:詩を読む・歌う', 'gift:恋人への贈り物'), desc);
// 学問書
const AC = [
  ['herbal', '薬草学の書', 'herb', '薬草の見分け方と煎じ方。薬師の教科書。'],
  ['alch_manual', '錬金術の手引き', 'alchemy', '三原質と七つの金属の業を記した書。'],
  ['astronomy', '天文学の書', 'astro', '星の運行と暦の作り方。'],
  ['mathematics', '数学の書', 'math', '幾何と算術の定理を記した書。'],
  ['architecture', '建築の書', 'build', '城と橋と大聖堂の建て方。普請奉行が読む。'],
  ['agronomy', '農学の書', 'farm', '輪作と土づくりの工夫。'],
  ['medicine_book', '医学の書', 'medic', '病の見立てと手当ての仕方。医者の教科書。'],
  ['bestiary', '魔物図鑑', 'monster', '魔物の弱点と巣の見つけ方。冒険者の必携書。'],
  ['zoology', '動物誌', 'beast', '獣と鳥の暮らしを記した書。狩人も読む。'],
  ['botany', '植物誌', 'plant', '森と野の草木の図鑑。'],
  ['mineralogy', '鉱物誌', 'mineral', '鉱石と宝石の見分け方。鉱夫と宝石職人が読む。'],
  ['navigation_book', '航海術の書', 'sea', '星と潮の読み方。船長の必読書。'],
  ['law_code', '法典', 'law', '王国の法と罰を記した書。裁きの場に置かれる。'],
  ['theology', '神学の書', 'faith', '神と魂について論じた聖職者の書。'],
  ['philosophy', '哲学の書', 'mind', 'よく生きるとは何かを問う古い賢者の対話。'],
  ['old_dictionary', '古語辞典', 'lang', '古王国の文字を読み解く辞典。遺跡の碑文読みに。'],
  ['arithmetic', '算術の手引き', 'math', '子ども向けの数の数え方と計算。'],
  ['bookkeeping', '商いの帳簿術', 'trade', '借りと貸しの付け方。商人の子が学ぶ。'],
  ['smith_secrets', '鍛冶の秘伝書', 'smith', '鋼の焼き入れの秘伝。鍛冶屋の家に伝わる。'],
  ['weaving_book', '織りの模様帳', 'weave', '機織りの模様を記した帳面。'],
  ['heraldry', '紋章図鑑', 'noble', '大陸じゅうの家の紋章を集めた図鑑。'],
  ['magic_theory', '魔法学の基礎', 'magic', '魔法学園で最初に学ぶ教科書。'],
];
for (const [id, name, f, desc] of AC) bk(id, name, 'study', 45, { research: 8, study: f }, U(`magic:研究（${name.replace(/の書$/, '')}）`, 'hobby:学問', 'collect:書庫'), desc, { d: 1 });
const COOK = [['cook_court', '宮廷料理の書', '王の食卓に出す料理の作り方。'], ['cook_home', '家庭料理の覚え書き', '母から娘へ伝わる家の料理。'], ['cook_desert', '砂漠の料理書', 'サハルの香辛料料理の作り方。'], ['cook_north', '北の保存食の書', '冬を越すための塩漬けと燻製の作り方。'], ['cook_monster', '魔物料理の書', '魔物の肉を安全に食べる方法。冒険者向け。']];
for (const [id, name, desc] of COOK) bk(id, name, 'study', 20, { skill: 'cook' }, U('hobby:料理の腕を上げる', 'gift'), desc, { d: 1 });
const WAR = [['war_tactics', '兵法書', '陣の組み方と戦の運び方。将軍の座右の書。'], ['war_siege', '攻城の書', '城攻めと籠城の技を記した書。'], ['war_sword', '剣術指南書', '剣の師範の型と心得を図入りで記した書。'], ['war_archery', '弓術の書', '風を読んで遠くを射る技。']];
for (const [id, name, desc] of WAR) bk(id, name, 'study', 60, { skill: 'combat', research: 3 }, U('tool:兵と騎士の訓練', 'collect'), desc, { d: 1 });
// 信仰・暮らしの書
bk('holy_scripture', '聖典', 'faith', 50, { faith: 10 }, U('ritual:祈りと説教', 'collect:教会の宝'), '教会の教えを記した大きな書。金泥の飾り文字。', { by: 'priest', from: { book_blank: 2, ink_gall: 1, ink_gold: 1 }, t: 40 });
bk('prayer_book', '祈祷書', 'faith', 10, { faith: 4, mood: 2 }, U('ritual:毎日の祈り', 'gift:洗礼の贈り物'), '朝夕の祈りを記した小さな本。', { w: 0.3, d: 2 });
bk('hymnal', '聖歌集', 'faith', 14, { faith: 3, mood: 3 }, U('ritual:礼拝で歌う', 'hobby:歌'), '礼拝で歌う聖歌の詞と節。');
bk('almanac', '暦', 'study', 4, { season: true }, U('tool:種まきと祭りの日を知る', 'trade'), 'その年の月の満ち欠けと祭りの日を記した暦。農家が毎年買う。', { w: 0.3, d: 2 });
bk('primer', '読み書きの手本', 'study', 5, { study: 'read' }, U('tool:子どもが字を覚える'), '学び舎で使う文字の手本。', { w: 0.3, d: 2 });
bk('fortune_book', '占いの書', 'study', 15, { foresee: 1 }, U('hobby:占い', 'tool:占い師の商売'), '夢占い・手相・星占いの手引き。');
bk('love_letter', '恋文の手本', 'story', 6, { love: 2 }, U('hobby', 'gift'), '恋文の書き方の例文集。字の書けない人は代書屋に頼む。', { w: 0.2 });
bk('diary_old', '古い日記', 'story', 8, { lore: 1, mood: 2 }, U('collect:ほかの人の人生を読む', 'quest:遺族に届ける'), '誰かが書き残した日記。旅の途中で拾われる。', { from: { book_blank: 1 }, more: [loot(['ruins', 'dungeon'], 0.05)] });
// 禁書（教会が持つことを禁じる）
const FB = [['forbidden_demon', '魔王崇拝の経典', '魔王を神とあがめる邪教の書。'], ['forbidden_curse', '呪詛の書', '人を呪い殺す方法を記した書。'], ['forbidden_heresy', '異端の書', '教会の教えを真っ向から否定する書。焚書の対象。'], ['forbidden_alch', '禁じられた錬金術', '人の命を材料にする錬金の業。']];
for (const [id, name, desc] of FB) bk(id, name, 'forbidden', 250, { research: 10, curse: 1 }, U('magic:禁じられた研究', 'collect:禁書の好事家が大金を払う', 'trade:闇で売れる'), desc, { r: 3, d: 0, from: { book_blank: 1, ink_blood: 1 }, more: [loot(['demoncastle', 'ruins'], 0.01)] });
// 古文書（既存の宝）と民族の書
I('old_document', '古文書', 'history', 0.5, 90, { st: 1, r: 2, d: 1, lim: 'relic', src: [loot(D, 0.05), trade()], use: U('magic:古い魔法と歴史の研究', 'collect:学者が高く買う', 'quest'), fx: { research: 15, lore: 2 }, desc: '遺跡から出た古い文書。古語辞典がないと読めない。' });
C('old_document_copy', '古文書の写し', 'history', 0.5, 35, 'tribe_elder', { parchment: 3, ink_gall: 1 }, 20, { st: 1, r: 1, d: 1, use: U('magic:研究', 'collect', 'trade:エルダの灯守の名物'), fx: { research: 6 }, desc: 'エルダの灯守が千年書き写し続けてきた古文書の写し。', more: [trade()] });
C('star_book', '星の書', 'history', 2, 800, 'tribe_elder', { vellum: 20, ink_gold: 3 }, 200, { st: 1, r: 4, d: 1, lim: 'relic', use: U('magic:古王国の大魔法', 'collect:伝説の書'), fx: { research: 50, learn: 'star', lv: 1 }, desc: '古王国エルダの叡智のすべて。黄昏の冠をかぶった者だけが読めるという。', more: [loot(['ruins'], 0.001)] });

// ================= 地図と海図 =================
const MP = [
  ['map_continent', '大陸図', 30, 0, '三つの国と奥地を描いた大きな地図。'],
  ['map_alderia', 'アルデリア王国図', 12, 0, '町と村と街道を描いた国の地図。'],
  ['map_vermund', 'ヴェルムント王国図', 12, 0, '雪の峠と鉱山の町を描いた地図。'],
  ['map_sahal', 'サハル王国図', 12, 0, 'オアシスと隊商路を描いた地図。'],
  ['map_roads', '街道図', 8, 0, '宿場と渡し場の場所を記した旅人向けの図。'],
  ['map_frontier', '開拓地の見取り図', 10, 0, '未開の土地と魔物の巣の場所を記した図。開拓者が買う。'],
  ['map_mine', '鉱脈図', 60, 1, '鉱山の坑道と鉱脈の走りを記した秘密の図。'],
  ['map_dungeon', 'ダンジョンの地図', 40, 1, '迷宮の通路と罠の場所を記した図。冒険者が高く買う。'],
  ['map_treasure', '宝の地図', 50, 2, '×印のついた古い地図。本物かどうかは掘るまでわからない。'],
  ['map_pirate', '海賊の宝の地図', 80, 2, '島の形と歩数だけが書かれた海賊の地図。'],
  ['map_ancient', 'エルダの古地図', 300, 3, '古王国のころの大陸を描いた地図。いまはない町が載っている。'],
  ['chart_coast', '近海の海図', 20, 0, '港と岬と浅瀬を記した海図。'],
  ['chart_ocean', '外洋の海図', 70, 1, '沖の潮の流れと風を記した海図。'],
  ['chart_islands', '島々の海図', 90, 2, 'マヒナの民の星の舟の道を写した海図。'],
  ['star_chart', '星図', 40, 1, '星座と明るい星を記した図。星見と航海に。'],
  ['star_map_elda', 'エルダの星図', 400, 3, '七つの灯と灰に埋もれた冠が描かれた古い星図。'],
];
for (const [id, name, v, r, desc] of MP) {
  const o = { st: 1, r, d: r ? 0 : 1, use: U('tool:道と場所を知る', r >= 2 ? 'quest:宝を探しに行く' : 'trade', r >= 1 ? 'collect' : 'hobby:地図を眺める'), fx: { map: true, ...(r >= 2 ? { detect: 'treasure' } : {}) }, desc };
  if (r >= 2) I(id, name, 'map', 0.2, v, { ...o, lim: r >= 3 ? 'relic' : undefined, src: [loot(D, 0.03 / r), trade()] });
  else C(id, name, 'map', 0.2, v, 'cartographer', { parchment: 2, ink_gall: 1 }, 6 + r * 10, { ...o, more: [trade()] });
}
export default B.list;
