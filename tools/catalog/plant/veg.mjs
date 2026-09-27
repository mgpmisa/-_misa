import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 2, ...o });
const FARM = ['farm', 'field'];
// 野菜：[id, 名, sub, 重さ, 値, 満腹, 日持ち, 使い道, 説明, 種の作り方 seed|self|none, demand, 野生の場所]
const VEG = [
  ['turnip', '蕪', 'root', 0.5, 0.6, 6, 60, '煮込み・漬物・冬の家畜の餌', '寒さに強い根菜。冬の貯蔵に。', 'seed', 3],
  ['radish', '大根', 'root', 1.2, 0.8, 8, 40, '煮物・漬物・干して切り干し', '太く白い根。葉も食べる。', 'seed', 2],
  ['carrot', '人参', 'root', 0.3, 0.6, 5, 60, '汁・煮込み・馬のごほうび', '赤い根菜。', 'seed', 2],
  ['parsnip', '白人参', 'root', 0.3, 0.6, 5, 60, '焼く・汁（霜に当たると甘い）', '白く甘い根。冬の野菜。', 'seed', 1],
  ['beet', '赤蕪', 'root', 0.4, 0.6, 5, 60, '赤い汁・酢漬け', '血のように赤い根菜。', 'seed', 1],
  ['sugar_beet', '甜菜', 'root', 1, 0.8, 4, 60, '煮詰めて砂糖を取る'], 
  ['potato', '馬鈴薯', 'root', 0.3, 0.5, 8, 120, '茹でる・焼く・潰す・酒', '痩せ地でもよく採れる芋。飢えを救う。', 'self', 3],
  ['taro', '里芋', 'root', 0.2, 0.6, 6, 60, '煮っころがし・汁', 'ぬめりのある芋。', 'self', 1],
  ['sweet_potato', '甘藷', 'root', 0.4, 0.7, 9, 90, '焼き芋・干し芋', '甘い芋。暑い土地の荒れ地でも育つ。', 'self', 2],
  ['yam', '山芋', 'root', 1, 2, 9, 60, 'すりおろして麦飯に', '山で掘る長い芋。精がつく。', 'self', 1, ['forest', 'hill']],
  ['burdock', '牛蒡', 'root', 0.3, 0.8, 4, 30, 'きんぴら・汁', '土の香りの長い根。', 'seed', 1],
  ['onion', '玉葱', 'root', 0.2, 0.5, 3, 150, 'どんな料理にも・皮は黄色の染め', '吊るしておけば冬を越せる。', 'seed', 3],
  ['leek', '韮葱', 'veg', 0.4, 0.6, 4, 30, '汁・煮込み', '太い葱。冬の汁の具。', 'seed', 2],
  ['welsh_onion', '葱', 'veg', 0.1, 0.3, 2, 14, '薬味・鍋', '香りの強い青い葱。風邪に効く。', 'seed', 2],
  ['garlic', '大蒜', 'root', 0.05, 0.4, 1, 180, '香りづけ・精力・吸血鬼除け', '鱗片を植えると増える。魔除けにもなる。', 'self', 2],
  ['chive', '韮', 'veg', 0.1, 0.3, 2, 5, '炒め物・餃子', '刈ってもまた伸びる。', 'seed', 1],
  ['ginger', '生姜', 'root', 0.1, 1.2, 1, 60, '香りづけ・体を温める薬', '辛い根茎。風邪と冷えに。', 'self', 1],
  ['wasabi', '山葵', 'root', 0.1, 4, 1, 14, '生魚の薬味', '冷たい清流でしか育たない辛い根。', 'self', 0, ['river']],
  ['horseradish', '辛根', 'root', 0.3, 0.8, 1, 60, '肉料理の辛い薬味', 'すりおろすと涙が出るほど辛い根。', 'self', 1],
  ['lily_bulb', '百合根', 'root', 0.1, 2, 4, 60, '茶碗蒸し・甘く煮る', '百合の球根。ほっくり甘い。', 'self', 0],
  ['lotus_root', '蓮根', 'root', 0.5, 1.2, 6, 20, '煮物・揚げ物', '泥田の蓮の地下茎。穴があいている。', 'self', 1, ['swamp', 'lake']],
  ['konjac', '蒟蒻芋', 'root', 1, 1, 0, 90, '灰汁で固めて蒟蒻', 'そのままでは食べられない芋。', 'self', 0],
  ['cassava', '木芋', 'root', 0.8, 0.5, 9, 7, '水に晒して毒を抜き粉に', '南の国の主食の芋。生では毒。', 'self', 1, ['jungle']],
  ['cabbage', '甘藍', 'veg', 1.5, 0.8, 6, 60, '汁・塩漬けの酢キャベツ', '葉が固く巻いた野菜。塩漬けで冬を越す。', 'seed', 3],
  ['napa_cabbage', '白菜', 'veg', 2, 0.8, 6, 40, '鍋・漬物', '柔らかい大きな葉野菜。', 'seed', 2],
  ['lettuce', '萵苣', 'veg', 0.4, 0.5, 2, 5, '生で食べる・肉を包む', '柔らかい葉。夏の野菜。', 'seed', 1],
  ['spinach', '菠薐草', 'veg', 0.3, 0.5, 2, 4, 'おひたし・汁', '冬の青菜。血を増やす。', 'seed', 1],
  ['mustard_greens', '芥子菜', 'veg', 0.3, 0.3, 2, 5, '漬物・炒め物', 'ぴりっと辛い青菜。種は辛子になる。', 'seed', 1],
  ['kale', '羽衣甘藍', 'veg', 0.4, 0.4, 3, 10, '汁・家畜の冬の餌', '冬でも枯れない強い葉野菜。', 'seed', 1],
  ['chard', '不断草', 'veg', 0.3, 0.3, 2, 5, '汁・炒め物', '一年中摘める色とりどりの茎の菜。', 'seed', 1],
  ['celery', '芹菜', 'veg', 0.5, 0.6, 2, 14, '汁のだし・生で', '香りの強い茎野菜。', 'seed', 1],
  ['asparagus', '竜髭菜', 'veg', 0.2, 2, 2, 4, '茹でて（春の贅沢）', '春にだけ出る若い芽。貴族の好物。', 'seed', 1],
  ['artichoke', '朝鮮薊', 'veg', 0.3, 1.5, 3, 7, '蕾を茹でて', '大きな薊の蕾を食べる。', 'seed', 0],
  ['cucumber', '胡瓜', 'veg', 0.3, 0.4, 2, 7, '生で・酢漬け', '夏の瓜。', 'seed', 2],
  ['pumpkin', '南瓜', 'veg', 4, 1.2, 20, 120, '煮物・汁・菓子・種は炒って', '秋に採れて冬まで持つ大きな瓜。', 'seed', 2],
  ['gourd', '瓢箪', 'veg', 1, 0.8, 0, 365, '乾かして水筒・酒入れ・柄杓・楽器', '食べずに器にする瓜。', 'seed', 1],
  ['eggplant', '茄子', 'veg', 0.2, 0.4, 3, 7, '焼き茄子・漬物・煮込み', '夏の紫の実。', 'seed', 1],
  ['tomato', '赤茄子', 'veg', 0.2, 0.5, 2, 7, '煮込み・汁・生で', '赤い夏の実。昔は毒と思われていた。', 'seed', 2],
  ['chili', '唐辛子', 'spice', 0.02, 0.3, 0, 365, '辛味・干して冬の保存料・虫除け', '真っ赤な辛い実。干して吊るす。', 'seed', 1],
  ['bell_pepper', '甘唐辛子', 'veg', 0.2, 0.4, 2, 10, '焼く・詰め物', '辛くない肉厚の唐辛子。', 'seed', 1],
  ['okra', '陸蓮根', 'veg', 0.05, 0.3, 1, 5, '汁のとろみ', '切ると星形のねばる実。暑い地の野菜。', 'seed', 0],
  ['watercress', '水芥子', 'veg', 0.1, 0.3, 1, 3, '肉の付け合わせ・汁', '清水に茂る辛い草。', 'self', 1, ['river']],
  ['sorrel', '酸葉', 'veg', 0.1, 0.1, 1, 3, '酸っぱい汁・魚の香草', '野原に生える酸っぱい葉。', 'seed', 0, ['grass']],
  ['purslane', '滑莧', 'veg', 0.1, 0.1, 1, 3, 'おひたし・夏の青物', '畑の雑草だが食べられる。', 'none', 0, ['farm', 'grass']],
];
for (const [id, n, sub, w, v, food, keep, note, desc, seed = 'seed', d = 1, wild] of VEG) {
  const src = [S('harvest', FARM, 1)];
  if (wild) src.push(S('forage', wild, 0.3));
  const use = [U(note.startsWith('煮詰めて') || note.startsWith('乾かして') || note.startsWith('灰汁') || note.startsWith('水に晒して') ? 'craft' : 'food', note)];
  if (seed === 'self') use.push(U('craft', '畑に植える：種芋・種球として一部を植える'));
  if (['turnip', 'kale', 'beet', 'carrot'].includes(id)) use.push(U('feed', '家畜の冬の餌'));
  X(id, n, sub, w, v, { d, src, food, keep, use, desc: desc || '甘い根。煮詰めて砂糖を取る。' });
  if (seed === 'seed') X(`${id}_seed`, `${n}の種`, 'seed', 0.01, Math.max(0.1, v * 0.4), { st: 100, src: [S('harvest', FARM, 0.3), S('trade')], use: [PLANT], d: 1, desc: `${n}の種。実を一部残して種を取る。` });
}
// 葉など、野菜の副産物
X('radish_leaves', '大根葉', 'veg', 0.2, 0.05, { src: [S('harvest', FARM, 1)], food: 2, keep: 3, use: [U('food', '菜飯・漬物'), U('feed', '鶏の餌')], desc: '大根の葉。捨てずに食べる。' });
X('turnip_greens', '蕪の葉', 'veg', 0.2, 0.05, { src: [S('harvest', FARM, 1)], food: 2, keep: 3, use: [U('food', '汁の青み'), U('feed')], desc: '蕪の葉。' });
X('onion_skin', '玉葱の皮', 'dye', 0.05, 0.02, { src: [S('harvest', FARM, 1)], use: [U('dye', '黄色から茶色の染め・復活祭の卵の色づけ')], desc: '台所で出る茶色い皮。よい染め草になる。' });
X('pumpkin_seeds', '南瓜の種', 'seed', 0.05, 0.2, { src: [S('harvest', FARM, 1)], food: 2, keep: 180, use: [U('food', '炒って塩をふる'), PLANT], desc: '南瓜の中の種。' });
X('corn_husk', '玉蜀黍の皮', 'straw', 0.1, 0.02, { src: [S('harvest', FARM, 1)], use: [U('craft', '人形・敷物・団子を包む'), U('feed')], desc: '玉蜀黍を包む皮。' });
X('cabbage_leaves_outer', '甘藍の外葉', 'veg', 0.3, 0.02, { src: [S('harvest', FARM, 1)], use: [U('feed', '豚と兎の餌'), U('fertilize')], desc: '固くて人は食べない外の葉。' });
// 山菜
const WILD = [
  ['bracken', '蕨', ['grass', 'hill', 'forest'], 0.1, 0.4, 3, '灰汁であくを抜いて煮物・根は蕨粉', '春の山菜。生では毒。'],
  ['zenmai', '薇', ['forest', 'river'], 0.1, 0.6, 3, '干して保存・煮物', '綿毛をかぶった渦巻きの若芽。'],
  ['butterbur', '蕗', ['river', 'forest'], 0.3, 0.3, 2, '煮物・佃煮', '大きな葉の山菜。葉は傘の代わりになる。'],
  ['butterbur_bud', '蕗の薹', ['river', 'forest', 'snow'], 0.02, 0.5, 1, '春一番の苦い味・味噌和え', '雪解けに顔を出す蕗の蕾。'],
  ['udo', '独活', ['forest', 'hill'], 0.3, 0.8, 2, '酢味噌・天ぷら', '香りのよい山の若茎。'],
  ['wild_garlic', '行者大蒜', ['forest', 'mountain'], 0.05, 0.8, 1, '炒め物・精をつける', '山にこもる行者が食べた強い香りの草。'],
  ['fiddlehead', '草蘇鉄の若芽', ['forest', 'river'], 0.05, 0.4, 1, '茹でて', 'くるりと巻いた羊歯の若芽。'],
  ['wild_parsley', '芹', ['river', 'swamp'], 0.05, 0.2, 1, '汁・七草粥', '水辺の香り高い草。'],
  ['shepherds_purse', '薺', ['grass', 'farm', 'town'], 0.02, 0.05, 1, '七草粥・血止め', 'どこにでも生える三角の実の草。'],
  ['chickweed', '繁縷', ['grass', 'farm'], 0.02, 0.05, 1, '七草粥・小鳥の餌', '柔らかい小さな草。'],
  ['wild_leek', '野蒜', ['grass', 'field'], 0.02, 0.1, 1, '味噌をつけて生で', '土手に生える小さな葱。'],
  ['goosefoot', '藜', ['grass', 'farm'], 0.05, 0.05, 1, '若葉を茹でて・種は穀物の代わり', '荒れ地の草。茎は乾かすと軽い杖になる。'],
];
for (const [id, n, on, w, v, food, note, desc] of WILD) X(id, n, 'wildveg', w, v, { src: [S('forage', on, 0.5)], food, keep: 3, use: [U('food', note)], desc });
X('kudzu_root', '葛の根', 'root', 2, 0.5, { src: [S('dig', ['forest', 'hill', 'grass'], 0.3)], use: [U('craft', '晒して葛粉'), U('medicine', '葛根：風邪の煎じ薬')], desc: '地中深くまで伸びる太い根。掘るのは重労働。' });
X('kudzu_starch', '葛粉', 'flour', 0.5, 4, { d: 1, make: M({ kudzu_root: 3 }, 'miller', 12), keep: 365, use: [U('food', '葛湯・葛餅（病人の滋養）'), U('medicine', 'お腹を温める')], desc: '葛の根を何度も水に晒して取った真っ白な粉。' });
X('katakuri_starch', '片栗粉', 'flour', 0.5, 5, { r: 1, make: M({ katakuri_bulb: 5 }, 'miller', 8), keep: 365, use: [U('food', 'とろみ・揚げ物の衣')], desc: '片栗の球根から取る白い粉。' });
X('katakuri_bulb', '片栗の球根', 'root', 0.02, 0.4, { src: [S('forage', ['forest', 'hill'], 0.3)], use: [U('craft', '挽いて片栗粉'), U('food')], food: 1, keep: 30, desc: '春の森に咲く紫の花の球根。' });
X('cassava_flour', '木芋粉', 'flour', 1, 1.2, { make: M({ cassava: 2 }, 'miller', 4), keep: 180, use: [U('food', '平焼き・団子'), U('craft', '粒にして甘い菓子')], desc: '晒して毒を抜いた木芋の粉。' });
X('bracken_starch', '蕨粉', 'flour', 0.5, 6, { r: 1, make: M({ bracken: 20 }, 'miller', 12), keep: 365, use: [U('food', '蕨餅'), U('craft', '傘や籠を貼る強い糊')], desc: '蕨の根から少しだけ取れる貴重な粉。' });
X('potato_starch', '芋の澱粉', 'flour', 0.5, 1.5, { make: M({ potato: 4 }, 'miller', 4), keep: 365, use: [U('food', 'とろみ'), U('craft', '洗濯の糊（襟をぱりっと）')], desc: '芋を擂って沈めた白い粉。' });
X('konjac_cake', '蒟蒻玉の粉', 'flour', 0.5, 2, { make: M({ konjac: 2, lye: 1 }, 'cook', 4), keep: 30, use: [U('food', '固めて蒟蒻'), U('craft', '紙に塗ると水に強い（蒟蒻糊）')], desc: '蒟蒻芋を干して挽いた粉。' });
