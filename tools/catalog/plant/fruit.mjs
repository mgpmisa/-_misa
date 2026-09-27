import { P, S, U, M, PLANT, has } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 2, ...o });
const ORCH = ['farm'];
// 果物：[id, 名, 重さ, 値, 満腹, 日持ち, 使い道, 説明, 野生の場所 or null, 苗の種類 tree|bush|vine|none|seed, rare, demand, 畑以外の採り方]
const FR = [
  ['apple', '林檎', 0.2, 0.5, 5, 90, '生で・焼き林檎・林檎酒・酢', '寒い土地の果物。地下室で春まで持つ。', null, 'tree', 0, 3],
  ['pear', '梨', 0.3, 0.6, 5, 30, '生で・梨酒', 'みずみずしい果物。', null, 'tree', 0, 2],
  ['quince', '榲桲', 0.3, 0.6, 2, 60, '煮詰めて榲桲の羹（固いゼリー）・香りづけ', '生では固く酸っぱい黄色い実。部屋に置くと香る。', null, 'tree', 0, 1],
  ['karin', '花梨', 0.3, 0.6, 1, 60, '蜂蜜漬けで咳止め・香りの酒', '石のように固い実。喉の薬。', null, 'tree', 0, 1],
  ['peach', '桃', 0.2, 1, 4, 5, '生で・蜜煮', '甘く柔らかい実。長寿の象徴。', null, 'tree', 0, 2],
  ['apricot', '杏', 0.05, 0.4, 2, 7, '干し杏・ジャム・種は薬（杏仁）', '夏の初めの小さな実。', null, 'tree', 0, 1],
  ['plum', '李', 0.05, 0.3, 2, 7, '干し李・ジャム・李の酒', '紫の小さな実。', null, 'tree', 0, 1],
  ['ume', '梅の実', 0.02, 0.3, 0, 7, '塩漬けの梅干し・梅酒・梅酢', '生では食べない酸っぱい実。梅干しは旅と戦の友。', null, 'tree', 0, 2],
  ['cherries', '桜桃', 0.01, 0.3, 1, 3, '生で・菓子・桜桃酒', '赤い宝石のような小さな実。', null, 'tree', 1, 1],
  ['fig', '無花果', 0.05, 0.4, 2, 3, '生で・干し無花果', '花が見えないまま実る果物。', null, 'tree', 0, 1],
  ['pomegranate', '柘榴', 0.3, 0.8, 3, 60, '粒を食べる・汁・皮は染料と薬', '赤い粒が詰まった実。子宝の象徴。', null, 'tree', 0, 1],
  ['jujube', '棗', 0.01, 0.2, 1, 90, '干して薬膳・菓子', '干すと甘くなる小さな実。', null, 'tree', 0, 1],
  ['persimmon', '柿', 0.2, 0.4, 4, 20, '生で・干し柿', '秋の橙色の実。渋柿は干すと甘くなる。', null, 'tree', 0, 2],
  ['mandarin', '蜜柑', 0.1, 0.4, 2, 30, '生で・皮は干して薬', '暖かい土地の甘い柑橘。', null, 'tree', 0, 2],
  ['yuzu', '柚子', 0.1, 0.5, 0, 30, '皮と汁を香りづけ・冬至の湯', '香りの強い柑橘。', null, 'tree', 0, 1],
  ['lemon', '檸檬', 0.1, 0.8, 0, 30, '汁を料理と飲み物に・船乗りの壊血病除け', '酸っぱい黄色い柑橘。長い航海に積む。', null, 'tree', 1, 1],
  ['bitter_orange', '橙', 0.2, 0.5, 0, 30, '皮で砂糖漬け・汁で酢の代わり・正月飾り', '代々実が落ちないめでたい柑橘。', null, 'tree', 0, 1],
  ['loquat', '枇杷', 0.05, 0.4, 1, 3, '生で', '初夏の実。葉は薬になる。', null, 'tree', 0, 1],
  ['olive_fruit', '橄欖の実', 0.01, 0.1, 0, 10, '塩漬けにして食べる・搾って油', '渋くて生では食べられない実。', null, 'none', 0, 2],
  ['mulberry', '桑の実', 0.01, 0.1, 1, 2, '生で・ジャム', '黒紫の甘い実。', ['forest', 'grass'], 'tree', 0, 1],
  ['grape', '葡萄', 0.5, 1, 4, 7, '生で・干し葡萄・搾って葡萄酒', '房なりの実。葡萄酒は神殿にも王宮にも欠かせない。', null, 'vine', 0, 3],
  ['wild_grape', '山葡萄', 0.3, 0.4, 2, 5, 'ジャム・野の酒・汁で紫の染め', '森に自生する酸っぱい葡萄。', ['forest', 'hill'], 'none', 0, 1],
  ['strawberry', '苺', 0.01, 0.3, 1, 2, '生で・ジャム・菓子', '初夏の赤い実。', ['grass', 'forest'], 'bush', 0, 1],
  ['raspberry', '木苺', 0.01, 0.2, 1, 2, '生で・ジャム', '棘のある茂みの赤い実。葉は安産のお茶。', ['forest', 'grass'], 'bush', 0, 1],
  ['blackberry', '黒苺', 0.01, 0.2, 1, 2, '生で・パイ・紫の染め', '生け垣に茂る黒い実。', ['forest', 'grass', 'field'], 'bush', 0, 1],
  ['lingonberry', '苔桃', 0.01, 0.2, 1, 30, '肉料理のジャム', '北の森の赤い酸っぱい実。腐りにくい。', ['snow', 'tundra', 'forest'], 'none', 0, 1],
  ['bilberry', '越橘', 0.01, 0.3, 1, 3, '生で・菓子・目の薬', '夜目が利くようになると言われる青黒い実。', ['forest', 'mountain'], 'none', 0, 1],
  ['currant', '酸塊', 0.01, 0.2, 1, 3, 'ジャム・果実酒', '房なりの赤や黒の酸っぱい実。', ['forest'], 'bush', 0, 1],
  ['elderberry', '接骨木の実', 0.01, 0.1, 0, 3, '煮て汁・酒（生では腹を壊す）・紫の染め', '黒い小さな実。風邪の薬の汁になる。', ['forest', 'grass'], 'none', 0, 1],
  ['rosehip', '野薔薇の実', 0.01, 0.1, 0, 60, 'お茶・ジャム（冬の青物の代わり）', '赤い楕円の実。', ['grass', 'field'], 'none', 0, 1],
  ['sloe', '黒棘の実', 0.01, 0.1, 0, 30, '黒棘酒（霜の後に摘む）', '渋い青黒い実。棘の茂みは生け垣になる。', ['grass', 'field'], 'none', 0, 1],
  ['cranberry', '蔓苔桃', 0.01, 0.2, 1, 60, '甘く煮て肉料理に', '沼地の赤い実。水を張って浮かせて集める。', ['swamp'], 'none', 0, 1],
  ['akebi', '通草', 0.1, 0.3, 2, 3, '甘い果肉・皮は炒める', '秋に口を開ける紫の実。つるはかご細工に。', ['forest', 'hill'], 'none', 0, 1],
  ['hardy_kiwi', '猿梨', 0.01, 0.2, 1, 5, '生で・果実酒', '猿も好む小さな緑の実。', ['forest', 'mountain'], 'none', 0, 1],
  ['crowberry', '岩高蘭', 0.01, 0.1, 1, 10, '汁・酒', '凍った大地に這う黒い実。', ['tundra', 'snow'], 'none', 0, 0],
  ['cloudberry', '雲苺', 0.01, 1, 1, 3, '王族の菓子・ジャム', '沼の多い雪国の橙色の実。めったに採れない。', ['tundra', 'swamp'], 'none', 2, 1],
  ['sea_buckthorn', '沙棘', 0.01, 0.2, 0, 10, '酸っぱい汁（滋養）・油', '浜辺や砂地の棘の茂みの橙色の実。', ['beach', 'desert'], 'none', 0, 1],
  ['watermelon', '西瓜', 5, 1.5, 6, 20, '夏の渇きを癒す・種は炒って', '大きな瓜。水の少ない土地では水代わり。', null, 'seed', 0, 2],
  ['melon', '真桑瓜', 1, 1.2, 4, 10, '生で', '甘く香る瓜。', null, 'seed', 0, 1],
  ['coconut', 'ヤシの実', 1.5, 0.8, 8, 90, '汁を飲む・果肉を食べる・殻は器と繊維', '南の浜の大きな実。中に甘い水が入っている。', ['beach', 'jungle'], 'none', 0, 2],
  ['date', '棗椰子の実', 0.01, 0.3, 2, 365, '干して旅の食料・菓子', '砂漠の民の命をつなぐ甘い実。', ['desert'], 'none', 0, 2],
  ['banana', '芭蕉の実', 0.2, 0.3, 5, 5, '生で・焼く・干す', '房なりの甘い実。', ['jungle'], 'none', 0, 2],
  ['mango', '檬果', 0.4, 1, 4, 5, '生で・干して', '南の国の甘い実。', ['jungle'], 'none', 1, 1],
  ['lychee', '茘枝', 0.02, 0.5, 1, 3, '生で（昔の王妃が愛した）', '鱗のような皮の白い実。すぐ傷む。', ['jungle'], 'none', 1, 1],
  ['cactus_fruit', '仙人掌の実', 0.1, 0.3, 2, 7, '棘を焼き落として食べる・汁は赤い染め', '仙人掌の赤い実。', ['desert'], 'none', 0, 1],
  ['desert_melon', '苦瓜（砂漠）', 0.5, 0.2, 0, 60, '下し薬（毒にもなる）・種を煎って食べる', '砂の上に転がる苦い瓜。', ['desert'], 'none', 0, 0],
  ['hawthorn_berry', '山査子の実', 0.01, 0.1, 0, 60, '心の臓の薬・ジャム', '生け垣の山査子の赤い実。', ['grass', 'field'], 'none', 0, 1],
];
for (const [id, n, w, v, food, keep, note, desc, wild, sap, rare, d] of FR) {
  const src = [];
  if (sap !== 'none' || !wild) src.push(S('harvest', sap === 'tree' ? ORCH : ['farm', 'field'], 1));
  if (wild) src.push(S(['coconut', 'date', 'banana'].includes(id) ? 'gather' : 'forage', wild, rare ? 0.1 : 0.5));
  if (['lemon', 'mango', 'lychee', 'date'].includes(id)) src.push(S('trade'));
  const use = [U('food', note)];
  if (sap === 'seed') use.push(PLANT);
  if (rare) use.push(U('luxury'));
  X(id === 'apple' ? 'apple' : id, n, 'fruit', w, v, { r: rare, d, src, food, keep, use, desc });
  const sid = `${id}_sapling`;
  if (sap === 'tree' && !has(sid)) X(sid, `${n}の苗木`, 'sapling', 2, 2 + v * 2, { src: [S('trade')], make: M({ [id]: 5 }, 'gardener', 24), use: [U('craft', '果樹園に植える：植えれば数年で実をつける')], desc: `${n}の苗木。種から育てたり接ぎ木して作る。` });
  if (sap === 'bush') X(`${id}_cutting`, `${n}の株分け`, 'sapling', 0.5, 0.5, { src: [S('forage', wild || ['forest'], 0.2)], use: [U('craft', '畑や垣根に植える：植えれば翌年から実る')], desc: `${n}の根付きの株。` });
  if (sap === 'vine') X(`${id}_cutting`, `${n}の挿し木`, 'sapling', 0.3, 1, { src: [S('trade')], make: M({ [id]: 1 }, 'gardener', 2), use: [U('craft', '葡萄畑に植える：植えれば3年目から実る')], desc: '冬に切った葡萄のつるの一節。' });
}
X('grape_leaves', '葡萄の葉', 'leaf', 0.02, 0.05, { src: [S('harvest', ['farm'], 1)], food: 1, keep: 30, use: [U('food', '塩漬けにして肉や米を包む')], desc: '若い葡萄の葉。' });
X('grape_pomace', '葡萄の搾りかす', 'fruit', 1, 0.05, { src: [S('harvest', ['farm'], 0.5)], use: [U('feed', '豚の餌'), U('craft', '蒸留して粕の酒'), U('fertilize')], desc: '葡萄酒を搾った後に残る皮と種。' });
X('mulberry_leaves', '桑の葉', 'leaf', 0.3, 0.2, { d: 1, src: [S('gather', ['forest', 'grass', 'farm'], 0.8)], use: [U('feed', '蚕の唯一の餌（絹を作るのに欠かせない）'), U('drink', '桑茶')], desc: '蚕を飼う家が毎日山ほど摘む葉。' });
X('unripe_persimmon', '青柿', 'fruit', 0.2, 0.1, { src: [S('harvest', ['farm'], 0.5)], use: [U('craft', '搗いて寝かせ柿渋を取る')], desc: '渋の強い青い柿。' });
X('persimmon_tannin', '柿渋', 'dye', 1, 1.5, { d: 1, make: M({ unripe_persimmon: 10 }, 'farmer', 240), use: [U('craft', '紙・網・桶・傘の防水と防腐'), U('dye', '茶色の渋染め')], desc: '青柿の汁を一年寝かせた茶色い液。臭いがよく効く。' });
X('loquat_leaf', '枇杷の葉', 'leaf', 0.02, 0.1, { src: [S('harvest', ['farm'], 0.5)], use: [U('medicine', '葉を温めて当てると痛みが和らぐ・咳止めの茶')], desc: '厚い大きな葉。薬の木と呼ばれる。' });
X('citrus_peel', '陳皮', 'spice', 0.02, 0.3, { make: M({ mandarin: 3 }, 'herbalist', 48), keep: 700, use: [U('medicine', '胃と咳の薬'), U('food', '香りづけ')], desc: '蜜柑の皮を何年も干したもの。古いほど良い。' });
X('pomegranate_rind', '柘榴の皮', 'dye', 0.05, 0.1, { src: [S('harvest', ['farm'], 0.5)], use: [U('dye', '黄色の染め・なめし'), U('medicine', '腹の虫下し')], desc: '固い柘榴の皮。' });
X('apricot_kernel', '杏仁', 'nut', 0.01, 0.3, { make: M({ apricot: 5 }, 'herbalist', 1), use: [U('medicine', '咳止め（多いと毒）'), U('food', '杏仁の菓子')], desc: '杏の種の中の仁。' });
// 伝説・魔法の果物
X('golden_apple', '黄金の林檎', 'magicfruit', 0.3, 800, { r: 4, st: 1, src: [S('loot', ['ruins', 'dungeon'], 0.003)], food: 30, fx: { hp: 200, age: -5 }, use: [U('food', '食べると若返る'), U('quest', '王が探し求める'), U('collect')], desc: '神々の庭にだけ実るという金色の林檎。' });
X('immortal_peach', '仙桃', 'magicfruit', 0.3, 500, { r: 4, st: 1, src: [S('loot', ['ruins', 'dungeon'], 0.005)], food: 30, fx: { hp: 150, sick: -100 }, use: [U('food', '病を払い命を延ばす'), U('gift', '王への献上品')], desc: '三千年に一度実るという桃。' });
X('dragon_fruit', '竜の果実', 'magicfruit', 0.5, 60, { r: 3, src: [S('forage', ['volcano'], 0.05)], food: 12, fx: { atk: 5, warm: 30 }, use: [U('food', '食べると体が燃えるように熱い'), U('magic', '火の霊薬')], desc: '火山の岩の割れ目に実る赤い棘の実。' });
X('blood_pomegranate', '血柘榴', 'magicfruit', 0.3, 40, { r: 3, src: [S('forage', ['demoncastle'], 0.08)], food: 8, fx: { mp: 30, poison: 10 }, use: [U('magic', '闇の魔法の触媒'), U('luxury', '魔族の好物')], desc: '魔界に実る黒い柘榴。粒は血の味がする。' });
X('dream_fruit', '夢見の実', 'magicfruit', 0.05, 20, { r: 2, src: [S('forage', ['dense', 'jungle'], 0.05)], food: 2, fx: { sleep: 40 }, use: [U('magic', '占い師が未来を夢で見る'), U('luxury')], desc: '食べると深い眠りと鮮やかな夢に落ちる紫の実。' });
X('star_fruit', '星の実', 'magicfruit', 0.05, 30, { r: 3, src: [S('forage', ['mountain', 'snow'], 0.04)], food: 3, fx: { mp: 20 }, use: [U('magic', '星読みの儀式'), U('collect', '夜に光る')], desc: '高い山で流れ星の夜にだけ光る小さな実。' });
X('spirit_berry', '精霊の苺', 'magicfruit', 0.01, 8, { r: 2, src: [S('forage', ['dense'], 0.08)], food: 2, fx: { hp: 20, mp: 10 }, use: [U('food', '疲れが消える'), U('magic')], desc: '精霊の森にだけ実る青い苺。' });
