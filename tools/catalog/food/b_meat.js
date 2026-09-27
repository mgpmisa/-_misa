// 肉・魚・乳・卵・腸詰め
const { add, mk } = require('./h');

// 肉の材料 [材料id, 名前, 値打ちの倍率, 希少, 民族]
const MEATS = [
  ['meat', '肉', 1, 0], ['beef', '牛肉', 1.2, 0], ['veal', '子牛肉', 1.8, 1], ['pork', '豚肉', 1, 0], ['mutton', '羊肉', 0.9, 0], ['lamb', '子羊肉', 1.6, 1],
  ['goat_meat', '山羊肉', 0.8, 0, 'garai'], ['venison', '鹿肉', 1.5, 0, 'fianna'], ['boar_meat', '猪肉', 1.3, 0], ['rabbit_meat', '兎肉', 0.9, 0],
  ['chicken', '鶏肉', 1.1, 0], ['duck_meat', '鴨肉', 1.3, 0, 'bolota'], ['goose_meat', '鵞鳥の肉', 1.5, 0], ['pheasant_meat', '雉肉', 2, 1],
  ['quail_meat', '鶉肉', 2.2, 1], ['pigeon_meat', '鳩肉', 1.2, 0], ['reindeer_meat', 'トナカイ肉', 1.2, 0, 'yarvi'], ['horse_meat', '馬肉', 1, 0, 'dorgu'],
  ['bear_meat', '熊肉', 1.8, 1], ['camel_meat', '駱駝の肉', 1.2, 1, 'nefer'], ['frog_meat', '大蛙の腿肉', 0.9, 0, 'bolota'], ['croc_meat', '鰐の肉', 2, 1, 'mictla'],
  ['snake_meat', '大蛇の肉', 1.5, 1, 'mictla'], ['turtle_meat', '大亀の肉', 3, 2], ['whale_meat', '鯨肉', 1.5, 1, 'mahina'], ['wyvern_meat', '飛竜の肉', 8, 2], ['dragon_meat', '竜の肉', 30, 3],
];
const BASE = 4; // 焼いた肉一皿のふつうの値打ち
// 料理法 [頭, 名前の付け方, 作り手, 時間, 重さ, 値の倍率, 満腹, 日持ち, 需要, 説明, 使い道, 対象の肉]
const METHODS = [
  ['roast', (n) => n + 'の炙り焼き', 'household', 1.5, 0.4, 1, 34, 2, 2, (n) => n + 'を火で炙った、一皿のごちそう。', [], null],
  ['skewer', (n) => n + 'の串焼き', 'innkeeper', 0.5, 0.2, 0.6, 18, 1, 2, (n) => '小さく切った' + n + 'を串に刺して焼いた、屋台と酒場の品。', [{ k: 'trade', note: '市場の屋台で売る' }],
    ['meat', 'beef', 'pork', 'mutton', 'lamb', 'goat_meat', 'chicken', 'horse_meat', 'frog_meat', 'snake_meat', 'camel_meat', 'reindeer_meat', 'croc_meat', 'wyvern_meat']],
  ['smoked', (n) => '燻製の' + n, 'butcher', 12, 0.4, 1.4, 30, 40, 1, (n) => n + 'を煙で燻して日持ちさせたもの。', [],
    ['meat', 'beef', 'pork', 'mutton', 'goat_meat', 'venison', 'boar_meat', 'duck_meat', 'goose_meat', 'reindeer_meat', 'horse_meat', 'bear_meat', 'whale_meat', 'wyvern_meat']],
  ['salted', (n) => '塩漬けの' + n, 'butcher', 24, 0.5, 1.1, 30, 180, 2, (n) => n + 'を塩にうずめて樽に詰めたもの。冬と船旅の備え。', [],
    ['meat', 'beef', 'pork', 'mutton', 'goat_meat', 'horse_meat', 'whale_meat', 'goose_meat']],
  ['jerky', (n) => n + 'の干し肉', 'hunter', 24, 0.15, 1.3, 24, 120, 2, (n) => '薄く切った' + n + 'を塩と風で干したもの。軽くて旅に向く。', [],
    ['meat', 'beef', 'mutton', 'goat_meat', 'venison', 'boar_meat', 'reindeer_meat', 'horse_meat', 'bear_meat', 'camel_meat', 'snake_meat', 'croc_meat', 'wyvern_meat']],
  ['stew', (n) => n + 'の煮込み', 'household', 3, 0.5, 1, 36, 2, 3, (n) => n + 'を根菜と一緒にことこと煮た、家の味。', [],
    ['meat', 'beef', 'pork', 'mutton', 'lamb', 'goat_meat', 'venison', 'boar_meat', 'rabbit_meat', 'chicken', 'duck_meat', 'pigeon_meat', 'reindeer_meat', 'horse_meat', 'bear_meat', 'camel_meat', 'frog_meat', 'croc_meat', 'turtle_meat', 'whale_meat', 'dragon_meat']],
  ['pie', (n) => n + 'のパイ', 'baker', 3, 1, 2.2, 60, 4, 1, (n) => n + 'を練り粉の皮で包んで焼いたパイ。切り分けて皆で食べる。', [{ k: 'gift', note: '訪問の手土産' }],
    ['meat', 'beef', 'pork', 'mutton', 'venison', 'boar_meat', 'rabbit_meat', 'chicken', 'pigeon_meat', 'pheasant_meat', 'quail_meat', 'goose_meat']],
];
const VEG_FOR = { roast: {}, skewer: { onion: 0.2 }, smoked: {}, salted: { salt: 0.2 }, jerky: { salt: 0.1 }, stew: { onion: 0.3, carrot: 0.3, turnip: 0.3 }, pie: { flour_wheat: 0.5, lard: 0.1 } };
for (const [key, nameF, by, t, w, vm, food, keep, demand, descF, extra, only] of METHODS) {
  for (const [mid, mname, mv, rare, tribe] of MEATS) {
    if (only && !only.includes(mid)) continue;
    const id = mid === 'meat' ? { roast: 'meat_roast', skewer: 'meat_skewer', smoked: 'meat_smoked', salted: 'meat_salted', jerky: 'jerky', stew: 'stew_meat', pie: 'pie_meat' }[key] : `${key}_${mid.replace(/_meat$/, '')}`;
    const from = { [mid]: key === 'skewer' ? 0.25 : key === 'jerky' ? 0.5 : 0.5, ...VEG_FOR[key] };
    const u = [...extra];
    if (rare >= 2) u.push({ k: 'luxury', note: '珍味。話の種になる' });
    if (mid === 'dragon_meat') u.push({ k: 'medicine', note: '力がみなぎると言われる' }, { k: 'collect', note: '一生に一度の珍味' });
    if (mid === 'bear_meat') u.push({ k: 'medicine', note: '冬の滋養' });
    if (mid === 'turtle_meat') u.push({ k: 'medicine', note: '長寿の滋養' });
    if (key === 'roast' && ['venison', 'boar_meat', 'pheasant_meat', 'goose_meat'].includes(mid)) u.push({ k: 'luxury', note: '宴のごちそう' });
    add({ id, name: nameF(mname), sub: key === 'pie' ? 'pie' : key === 'stew' ? 'stew' : 'meat', w, v: BASE * mv * vm, stack: keep >= 30 ? 10 : key === 'skewer' ? 5 : 1, rare,
      make: mk(from, rare >= 2 && key !== 'jerky' && key !== 'smoked' ? 'cook' : by, t), food: Math.round(food * (mid === 'dragon_meat' ? 1.5 : 1)), keep,
      demand: rare >= 2 ? 0 : Math.max(0, demand - (mv > 1.7 ? 1 : 0)), tribe, use: u, fx: mid === 'dragon_meat' ? { hp: 15 } : mid === 'wyvern_meat' ? { hp: 4 } : undefined,
      desc: descF(mname) + (tribe && key === 'roast' ? '' : '') });
  }
}
// ---- 格の違う肉料理 ----
const GRADED = [
  ['inn_stew_daily', '宿の日替わり煮込み', 'stew', { meat: 0.3, onion: 0.3, turnip: 0.3, bread_roll: 1 }, 'innkeeper', 4, 44, 'inn', 3, '大鍋で一日じゅう煮ている宿の煮込み。小丸パン付き。'],
  ['inn_roast_plate', '宿の焼き肉の皿', 'meat', { pork: 0.4, bread_roll: 1, pickled_cabbage: 0.2 }, 'innkeeper', 6, 46, 'inn', 2, '豚の炙り焼きに酢漬け菜と小丸パンを添えた、旅人の一皿。'],
  ['inn_breakfast', '宿の朝の皿', 'meat', { bread_roll: 1, egg: 2, bacon: 0.1 }, 'innkeeper', 4, 36, 'inn', 2, '卵二つと燻し豚ばらを焼き、小丸パンを添えた朝食。'],
  ['noble_venison_wine', '鹿肉の赤葡萄酒煮', 'stew', { venison: 0.5, wine_red: 0.3, ground_pepper: 0.01 }, 'cook', 20, 38, 'noble', 1, '狩りの鹿を赤葡萄酒と胡椒で煮た、貴族の秋の皿。'],
  ['noble_duck_orange', '鴨の橙煮', 'meat', { duck_meat: 0.5, orange: 1, honey: 0.05 }, 'cook', 22, 34, 'noble', 1, '鴨を焼いて橙と蜂蜜のたれで煮た貴族の皿。'],
  ['noble_lamb_herb', '子羊の香草焼き', 'meat', { lamb: 0.5, rosemary: 0.05, garlic: 0.05 }, 'cook', 18, 36, 'noble', 1, '子羊の骨付き肉を迷迭香と大蒜で焼いた皿。'],
  ['noble_pheasant_stuffed', '雉の詰め物焼き', 'meat', { pheasant_meat: 1, breadcrumbs: 0.2, chestnut: 0.3 }, 'cook', 26, 40, 'noble', 1, '雉のお腹に栗とパン屑を詰めて焼いた、狩りの宴の皿。'],
  ['noble_boar_honey', '猪の蜂蜜焼き', 'meat', { boar_meat: 0.8, honey: 0.1, ground_clove: 0.01 }, 'cook', 24, 44, 'noble', 1, '猪のもも肉に蜂蜜と丁子を塗って照り焼きにした皿。'],
  ['noble_veal_cream', '子牛の乳脂煮', 'stew', { veal: 0.5, cream: 0.2, mushroom: 0.2 }, 'cook', 22, 38, 'noble', 1, '子牛を茸と乳脂でやわらかく煮た、白い煮込み。'],
  ['royal_peacock', '孔雀の飾り焼き', 'meat', { peacock_meat: 1, gold_leaf: 0.01 }, 'cook', 120, 60, 'royal', 0, '焼いた孔雀に羽を戻して飾り、くちばしに金箔を貼った王宮の宴の目玉。'],
  ['royal_swan', '白鳥の蒸し焼き', 'meat', { swan_meat: 1, ground_saffron: 0.01 }, 'cook', 100, 60, 'royal', 0, '王だけが食べてよいとされる白鳥を、番紅花の汁で蒸し焼きにした皿。'],
  ['royal_boar_head', '猪頭の祝い焼き', 'meat', { boar_meat: 3, apple: 1, ground_spice_strong: 0.05 }, 'cook', 90, 150, 'royal', 0, '冬至の宴に運ばれる、口に林檎をくわえた猪の頭。'],
  ['royal_ox_whole', '牛の丸焼き', 'meat', { beef: 20, salt: 1 }, 'cook', 400, 900, 'royal', 0, '祝勝や戴冠の日に広場で焼いて民に振る舞う、牛一頭の丸焼き。'],
  ['royal_quail_grapes', '鶉の葡萄詰め', 'meat', { quail_meat: 0.5, grape: 0.3, wine_white: 0.1 }, 'cook', 45, 26, 'royal', 0, '鶉に葡萄を詰めて白葡萄酒で焼いた、王妃の好物。'],
  ['royal_dragon_braise', '竜肉の王宮煮', 'stew', { dragon_meat: 0.5, wine_red: 0.5, ground_spice_strong: 0.05 }, 'cook', 400, 60, 'royal', 0, '竜を討った勇者を讃える宴でだけ出る、伝説の煮込み。'],
  ['royal_jelly_meat', '薄紅の肉の煮凝り', 'meat', { veal: 0.5, wine_red: 0.2, ground_saffron: 0.01 }, 'cook', 60, 24, 'royal', 0, '肉の煮汁を冷やして固め、葡萄酒と番紅花で紅と金に染め分けた宴の飾り皿。'],
];
for (const [id, name, sub, from, by, v, food, grade, demand, desc] of GRADED) {
  const royal = grade === 'royal';
  add({ id, name, sub, w: food >= 150 ? food / 60 : 0.6, v, stack: 1, rare: royal ? 2 : grade === 'noble' ? 1 : 0, make: mk(from, by, royal ? 6 : 3),
    food, keep: 2, demand, grade, use: royal ? [{ k: 'ritual', note: '祝いの儀式' }, { k: 'gift', note: '王からの下賜' }] : grade === 'noble' ? [{ k: 'luxury', note: '宴のごちそう' }] : [],
    fx: royal ? { mood: 12 } : grade === 'noble' ? { mood: 6 } : undefined, desc });
}

// ---- 腸詰め・ハム・肉の加工 ----
const CURED = [
  ['sausage_pork', '豚の腸詰め', { pork: 0.4, salt: 0.02 }, 3, 20, 10, 2, '刻んだ豚肉を腸に詰めた、市場の定番。'],
  ['sausage_smoked', '燻し腸詰め', { sausage_pork: 1 }, 4, 20, 45, 2, '腸詰めを燻して日持ちさせたもの。'],
  ['sausage_dry', '乾かし腸詰め', { pork: 0.5, salt: 0.05, ground_pepper: 0.01 }, 6, 22, 180, 1, '塩と胡椒で漬けて長く干した固い腸詰め。旅と行軍に。'],
  ['sausage_blood', '血の腸詰め', { animal_blood: 0.3, groats_barley: 0.2, lard: 0.05 }, 2, 20, 5, 2, '屠った日に作る、血と麦の黒い腸詰め。'],
  ['sausage_liver', '肝の腸詰め', { liver: 0.3, onion: 0.1 }, 2.5, 20, 6, 1, '肝を練った柔らかい腸詰め。パンに塗って食べる。'],
  ['sausage_white', '白い腸詰め', { veal: 0.3, parsley: 0.02 }, 4, 18, 3, 1, '子牛と香草の白い腸詰め。朝のうちに食べる。'],
  ['sausage_venison', '鹿の腸詰め', { venison: 0.4, juniper_berry: 0.02 }, 5, 20, 30, 1, '鹿肉を杜松の実で香りづけした狩人の腸詰め。'],
  ['sausage_boar', '猪の腸詰め', { boar_meat: 0.4, garlic: 0.02 }, 4.5, 20, 30, 1, '大蒜のきいた猪の腸詰め。'],
  ['sausage_mutton', '羊の腸詰め', { mutton: 0.4, ground_cumin: 0.01 }, 3, 20, 20, 1, '馬芹の実で臭みを消した羊の腸詰め。'],
  ['sausage_herb', '香草の腸詰め', { pork: 0.4, herbs: 0.05 }, 3.5, 20, 10, 1, '香草をたっぷり練りこんだ腸詰め。'],
  ['sausage_truffle', '黒茸の腸詰め', { pork: 0.4, truffle: 0.02 }, 18, 20, 20, 0, '香りの王である黒い地下茸を入れた、貴族の腸詰め。'],
  ['ham', '燻しもも肉', { pork: 3, salt: 0.3 }, 40, 120, 240, 1, '豚のもも肉を塩漬けにして長く燻したもの。冬至の宴の主役。'],
  ['bacon', '燻し豚ばら', { pork: 1, salt: 0.1 }, 8, 60, 90, 2, '豚ばら肉の塩漬けを燻したもの。薄く切って焼く。'],
  ['salt_pork_barrel', '塩漬け豚の樽', { meat_salted: 20 }, 110, 600, 365, 1, '塩漬けの豚を樽いっぱいに詰めたもの。船と城の備蓄。'],
  ['headcheese', '頭肉の煮凝り', { pork: 0.5, vinegar_ale: 0.05 }, 2.5, 20, 5, 1, '豚の頭を煮てその汁で固めた、捨てるところのない料理。'],
  ['pate_liver', '肝の練り物', { liver: 0.3, butter: 0.05 }, 5, 18, 6, 1, '肝を乳脂で練った、パンに塗るなめらかな練り物。'],
  ['pate_game', '野禽の壺詰め', { pheasant_meat: 0.3, lard: 0.1 }, 12, 24, 30, 0, '野鳥の肉を脂で封じて壺に詰めた、狩りの保存食。'],
  ['confit_duck', '鴨の脂漬け', { duck_meat: 0.5, lard: 0.2 }, 8, 30, 90, 1, '鴨を脂で煮てそのまま脂に沈めた保存食。'],
  ['potted_meat', '壺詰め肉', { meat: 0.5, lard: 0.1 }, 5, 30, 60, 1, '煮た肉を叩いて壺に詰め、脂で封をしたもの。'],
  ['meat_floss', '肉の粉', { jerky: 1 }, 5, 24, 365, 0, '干し肉を叩いて粉にしたもの。湯で戻せば汁になる。騎馬の民の携行食。'],
  ['pemmican', '脂固め肉', { jerky: 0.5, lard: 0.2, cranberry: 0.1 }, 5, 45, 400, 1, '干し肉と脂と木の実を練り固めた、北の狩人の非常食。'],
  ['lard', '豚脂', { pork: 0.5 }, 1.2, 0, 180, 2, '豚の脂を煮て漉したもの。料理の油・パイの皮・灯りにも。'],
  ['dripping', '肉の焼き脂', { meat_roast: 0.1 }, 0.5, 0, 60, 1, '焼き肉からたれた脂。パンに塗ると庶民のごちそう。'],
  ['bone_broth', '骨の出汁', { bone: 2, onion: 0.2 }, 0.8, 8, 3, 2, '骨を半日煮出した濃い汁。スープのもと。'],
];
for (const [id, name, from, v, food, keep, demand, desc] of CURED) {
  const u = [];
  if (id === 'lard') u.push({ k: 'craft', note: '料理の油・パイの皮' }, { k: 'fuel', note: '灯りの油の代わり' });
  if (id === 'dripping') u.push({ k: 'craft', note: '料理の油' });
  if (id === 'bone_broth') u.push({ k: 'craft', note: 'スープ・煮込みのもと' }, { k: 'medicine', note: '病み上がりの滋養' });
  if (id === 'ham') u.push({ k: 'gift', note: '冬至の贈り物' }, { k: 'trade' });
  if (id === 'salt_pork_barrel') u.push({ k: 'trade', note: '船と城への卸し' });
  if (id === 'sausage_truffle' || id === 'pate_game') u.push({ k: 'luxury', note: '貴族の珍味' });
  const w = id === 'salt_pork_barrel' ? 45 : id === 'ham' ? 3 : food > 0 ? Math.max(0.2, food / 90) : 0.5;
  add({ id, name, sub: ['lard', 'dripping'].includes(id) ? 'oil' : id === 'bone_broth' ? 'soup' : 'cured', w, v, stack: id === 'salt_pork_barrel' ? 1 : id === 'ham' ? 4 : 10,
    make: mk(from, ['bone_broth', 'dripping'].includes(id) ? 'household' : id === 'pemmican' || id === 'pate_game' ? 'hunter' : 'butcher', id === 'ham' ? 72 : 3), how: 'cook',
    food: food || 8, noEat: food === 0, drink: id === 'bone_broth' ? 15 : undefined, keep, demand, use: u,
    tribe: id === 'meat_floss' ? 'dorgu' : undefined, desc });
}

// ---- 魚と海の幸 ----
// [材料id, 名前, 値の倍率, 希少, 民族]
const FISH = [
  ['fish', '魚', 1, 0], ['trout', '鱒', 1.2, 0], ['salmon', '鮭', 1.4, 0], ['carp', '鯉', 1, 0], ['pike', 'カワカマス', 1.1, 0, 'bolota'], ['eel', '鰻', 1.4, 0, 'bolota'],
  ['catfish', '鯰', 0.9, 0], ['herring', '鰊', 0.7, 0], ['cod', '鱈', 0.9, 0], ['sardine', '鰯', 0.5, 0], ['mackerel', '鯖', 0.7, 0], ['tuna', '鮪', 1.8, 1, 'mahina'],
  ['sturgeon', '蝶鮫', 2.5, 1], ['bream', '鯛', 1.6, 0], ['flatfish', '鰈', 1, 0], ['lakefish', '湖の白身魚', 1, 0, 'yarvi'],
];
const FMETH = [
  ['grilled', (n) => n + 'の塩焼き', 'household', 0.5, 0.3, 1, 26, 1, 2, (n) => n + 'に塩をふって炭火で焼いたもの。', null],
  ['fishstew', (n) => n + 'の煮付け', 'household', 1, 0.4, 1.1, 30, 1, 2, (n) => n + 'を香草と一緒に煮た、漁村の家の味。',
    ['fish', 'carp', 'pike', 'eel', 'catfish', 'cod', 'bream', 'lakefish', 'tuna', 'sturgeon']],
  ['smokedfish', (n) => '燻し' + n, 'fisher', 12, 0.25, 1.4, 22, 30, 1, (n) => n + 'を煙でいぶして日持ちさせたもの。',
    ['fish', 'trout', 'salmon', 'eel', 'herring', 'mackerel', 'sturgeon', 'lakefish', 'pike']],
  ['driedfish', (n) => '干し' + n, 'fisher', 48, 0.12, 1.2, 18, 180, 2, (n) => n + 'を開いて浜で干し固めたもの。水で戻して使う。',
    ['fish', 'cod', 'herring', 'sardine', 'mackerel', 'flatfish', 'tuna', 'catfish']],
  ['saltfish', (n) => '塩漬けの' + n, 'fisher', 24, 0.3, 1.1, 22, 240, 2, (n) => n + 'を塩で樽漬けにしたもの。内陸へ運ばれる。',
    ['fish', 'herring', 'cod', 'sardine', 'mackerel', 'salmon']],
  ['pickledfish', (n) => n + 'の酢漬け', 'household', 24, 0.3, 1.3, 20, 60, 1, (n) => n + 'を酢と玉葱に漬けたもの。',
    ['herring', 'sardine', 'mackerel', 'eel']],
  ['friedfish', (n) => n + 'の揚げ物', 'innkeeper', 0.5, 0.3, 1.4, 28, 1, 2, (n) => n + 'に粉をはたいて脂で揚げた、港の酒場の品。',
    ['fish', 'cod', 'flatfish', 'sardine', 'carp', 'catfish', 'trout']],
  ['fishpie', (n) => n + 'のパイ', 'baker', 3, 1, 2.2, 55, 3, 1, (n) => n + 'を乳脂と一緒にパイ皮で包んで焼いたもの。',
    ['fish', 'eel', 'salmon', 'cod']],
];
const FVEG = { grilled: { salt: 0.02 }, fishstew: { onion: 0.2, herbs: 0.05 }, smokedfish: {}, driedfish: { salt: 0.02 }, saltfish: { salt: 0.2 }, pickledfish: { vinegar_wine: 0.1, onion: 0.1 }, friedfish: { flour_wheat: 0.05, lard: 0.05 }, fishpie: { flour_wheat: 0.5, butter: 0.1 } };
for (const [key, nameF, by, t, w, vm, food, keep, demand, descF, only] of FMETH) {
  for (const [fid, fname, fv, rare, tribe] of FISH) {
    if (only && !only.includes(fid)) continue;
    const id = `${key}_${fid}`;
    const u = [];
    if (key === 'smokedfish' && fid === 'lakefish') u.push({ k: 'trade', note: 'ヤルヴィ族の名産' });
    if (key === 'smokedfish' && fid === 'eel') u.push({ k: 'trade', note: 'ボロタ族の名産' });
    if (key === 'driedfish' && fid === 'tuna') u.push({ k: 'trade', note: 'マヒナの民の名産' }, { k: 'ritual', note: '大潮の送りの供え物' });
    if (key === 'fishstew' && fid === 'sturgeon') u.push({ k: 'luxury', note: '貴族の宴' });
    add({ id, name: nameF(fname), sub: key === 'fishpie' ? 'pie' : 'fish', w, v: 3 * fv * vm, stack: keep >= 30 ? 10 : 1, rare, make: mk({ [fid]: 0.4, ...FVEG[key] }, by, t),
      food, keep, demand: Math.max(0, demand - rare), tribe: ['smokedfish', 'driedfish'].includes(key) ? tribe : undefined, use: u,
      trade: ['saltfish', 'driedfish'].includes(key), desc: descF(fname) });
  }
}
// 貝・海老・蟹・卵など
const SEA = [
  ['crab_boiled', '茹で蟹', { crab: 1, salt: 0.02 }, 'fisher', 4, 22, 1, 1, '赤く茹で上がった蟹。脚の身をほじって食べる。'],
  ['shrimp_grilled', '海老の串焼き', { shrimp: 0.3 }, 'innkeeper', 3, 14, 1, 1, '海老を串に刺して焼いた、港の屋台の品。'],
  ['shrimp_paste', '海老の塩辛', { shrimp: 0.5, salt: 0.1 }, 'fisher', 3, 6, 365, 1, '小海老を塩で漬けて発酵させた練り物。味付けに少し使う。'],
  ['oyster_raw', '生牡蠣', { oyster: 6 }, 'fisher', 6, 12, 1, 0, '殻をあけてすぐにすする牡蠣。貴族は冬に好む。'],
  ['oyster_stew', '牡蠣の乳煮', { oyster: 6, milk: 0.3, butter: 0.05 }, 'cook', 14, 26, 1, 0, '牡蠣を乳と乳脂で煮た、冬の港町の贅沢。'],
  ['clam_soup', '蛤の汁', { clam: 0.5, onion: 0.1 }, 'household', 2, 20, 1, 2, '浜で拾った蛤を煮た澄んだ汁。'],
  ['mussel_steamed', '貽貝の酒蒸し', { mussel: 0.6, ale: 0.2 }, 'innkeeper', 3, 20, 1, 1, '貽貝を麦酒で蒸した、港の酒場の大鍋料理。'],
  ['squid_grilled', '烏賊の丸焼き', { squid: 1 }, 'household', 2.5, 20, 1, 1, '烏賊をそのまま炭火で焼いたもの。'],
  ['squid_dried', '干し烏賊', { squid: 1 }, 'fisher', 3, 14, 180, 1, '開いて干した烏賊。炙ると香ばしい酒のつまみ。'],
  ['octopus_grilled', '蛸の石焼き', { octopus: 1 }, 'household', 3, 22, 1, 1, '焼け石の上で蛸を焼く、島の料理。'],
  ['lobster_royal', '大海老の乳脂焼き', { lobster: 1, butter: 0.1 }, 'cook', 30, 28, 1, 0, '大海老を半分に割って乳脂で焼いた、貴族と王宮の皿。'],
  ['urchin_raw', '雲丹の殻盛り', { sea_urchin: 3 }, 'fisher', 8, 8, 1, 0, '棘の殻を割って中の黄金色を食べる、島の珍味。'],
  ['roe_salmon', '鮭の卵の塩漬け', { salmon: 1, salt: 0.05 }, 'fisher', 6, 8, 60, 0, '鮭の腹から取った赤い粒を塩漬けにしたもの。'],
  ['roe_sturgeon', '蝶鮫の黒い卵', { sturgeon: 1, salt: 0.05 }, 'fisher', 60, 6, 90, 0, '蝶鮫の黒い卵の塩漬け。王の食卓に上る、とても高い珍味。'],
  ['fish_soup', '魚のあら汁', { fish: 0.3, onion: 0.1 }, 'household', 1, 24, 1, 2, '魚の頭と骨を煮た、漁師の家の汁。'],
  ['fishermans_stew', '漁師の大鍋', { fish: 0.5, mussel: 0.2, shrimp: 0.1, onion: 0.2 }, 'innkeeper', 4, 40, 1, 2, 'その日に揚がった魚と貝を全部入れる、港の大鍋料理。'],
  ['turtle_soup', '大亀の汁', { turtle_meat: 0.5, wine_fortified: 0.05 }, 'cook', 30, 30, 1, 0, '大亀の肉を煮込んだ濃い汁。長生きの薬と言われる。'],
  ['kraken_grilled', '大烏賊の足の焼き物', { kraken_tentacle: 1 }, 'cook', 25, 60, 2, 0, '船を襲う大烏賊の足を輪切りにして焼いたもの。一本で大勢が食べられる。'],
  ['sea_serpent_steak', '海竜の身の厚焼き', { sea_serpent_meat: 0.5 }, 'cook', 60, 40, 2, 0, '海竜の身を厚く切って焼いた、船乗りが一生自慢する味。'],
];
for (const [id, name, from, by, v, food, keep, demand, desc] of SEA) {
  const u = [];
  if (v >= 20) u.push({ k: 'luxury', note: '貴族の珍味' });
  if (id === 'turtle_soup') u.push({ k: 'medicine', note: '長寿の滋養' });
  if (id === 'roe_sturgeon') u.push({ k: 'gift', note: '王への献上品' }, { k: 'trade' });
  if (id === 'kraken_grilled' || id === 'sea_serpent_steak') u.push({ k: 'collect', note: '船乗りの武勇伝の証' });
  add({ id, name, sub: id.includes('soup') || id.includes('stew') ? 'soup' : 'fish', w: Math.max(0.1, food / 80), v, stack: keep >= 30 ? 10 : 1,
    rare: v >= 50 ? 2 : v >= 12 ? 1 : 0, make: mk(from, by, 1), food, drink: id.includes('soup') ? 10 : undefined, keep, demand,
    grade: by === 'cook' ? 'noble' : undefined, use: u, desc });
}

// ---- 乳と乳の品 ----
const MILKS = [
  ['milk', '牛の乳', 'cow', 0.8, 3, 'common', '朝しぼった牛の乳。そのまま飲み、乳酪や乳脂にもなる。'],
  ['goat_milk', '山羊の乳', 'goat', 0.9, 2, null, '少し癖のある山羊の乳。山の村の飲み物。'],
  ['sheep_milk', '羊の乳', 'sheep', 1, 1, null, '濃くて脂の多い羊の乳。上等な乳酪になる。'],
  ['mare_milk', '馬の乳', 'horse', 1.2, 1, null, 'ドルグ族がしぼる馬の乳。そのままでは腹をこわしやすく、馬乳酒にする。'],
  ['reindeer_milk', 'トナカイの乳', 'reindeer', 1.5, 1, null, '量は少ないがとても濃いトナカイの乳。'],
  ['camel_milk', '駱駝の乳', 'camel', 1.2, 1, null, '砂海を渡る隊商の命綱になる、塩気のある乳。'],
];
for (const [id, name, sp, v, demand, grade, desc] of MILKS) {
  add({ id, name, sub: 'milk', w: 1, v, stack: 5, src: [{ how: 'milk', on: [sp] }], food: 8, drink: 25, keep: 2, demand, grade,
    use: [{ k: 'craft', note: '乳酪・乳脂・菓子の材料' }, { k: 'medicine', note: '子どもと病人の滋養' }, ...(id === 'milk' ? [{ k: 'ritual', note: '精霊への供え物' }] : [])],
    tribe: { mare_milk: 'dorgu', reindeer_milk: 'yarvi', camel_milk: 'nefer' }[id], limit: 'herd', desc });
}
const DAIRY = [
  ['cream', '乳脂の上澄み', 'dairy', { milk: 2 }, 'cheesemaker', 3, 10, 3, 1, '乳を寝かせて浮いた濃い上澄み。菓子と貴族の料理に。'],
  ['butter', '乳脂', 'dairy', { cream: 1 }, 'cheesemaker', 5, 20, 20, 2, '上澄みを樽で搗いて固めたもの。パンに塗り、料理の油にする。'],
  ['butter_salted', '塩入りの乳脂', 'dairy', { cream: 1, salt: 0.05 }, 'cheesemaker', 5.5, 20, 90, 1, '塩を練りこんで日持ちさせた乳脂。樽で遠くへ運ばれる。'],
  ['ghee', '澄まし乳脂', 'dairy', { butter: 1 }, 'cheesemaker', 7, 22, 365, 1, '乳脂を煮て澄ませたもの。腐りにくく、灯明にも使う。'],
  ['butter_goat', '山羊の乳脂', 'dairy', { goat_milk: 3 }, 'cheesemaker', 5, 20, 20, 1, '白くてさっぱりした山羊の乳脂。'],
  ['buttermilk', '乳脂を搗いた後の乳', 'milk', { cream: 1 }, 'cheesemaker', 0.4, 6, 2, 2, '乳脂を搗いたあとに残る酸っぱい乳。働き手ののどを潤す。'],
  ['whey', '乳清', 'milk', { milk: 1 }, 'cheesemaker', 0.2, 3, 2, 1, '乳酪を作ったあとの薄い汁。豚の餌にも、貧しい者の飲み物にも。'],
  ['curd', '白い乳酪', 'cheese', { milk: 2 }, 'cheesemaker', 1.6, 16, 3, 2, '乳を固めて水を切っただけの柔らかい乳酪。'],
  ['sour_milk', '酸乳', 'milk', { milk: 1 }, 'household', 0.9, 12, 5, 2, '乳を温かい所に置いて酸っぱく固めたもの。腹の調子を整える。'],
  ['sour_milk_sheep', '羊の酸乳', 'milk', { sheep_milk: 1 }, 'household', 1.2, 14, 5, 1, '羊の乳の濃い酸乳。蜂蜜をかけて食べる。'],
];
for (const [id, name, sub, from, by, v, food, keep, demand, desc] of DAIRY) {
  const u = [];
  if (['butter', 'butter_salted', 'ghee', 'butter_goat', 'cream'].includes(id)) u.push({ k: 'craft', note: '料理と菓子の材料' });
  if (id === 'ghee') u.push({ k: 'fuel', note: '神殿の灯明' }, { k: 'ritual' });
  if (id === 'whey') u.push({ k: 'feed', note: '豚の餌' });
  if (id === 'sour_milk') u.push({ k: 'medicine', note: '腹の調子を整える' });
  add({ id, name, sub, w: 0.5, v, stack: 10, make: mk(from, by, 2), how: 'cook', food, drink: sub === 'milk' ? 20 : undefined, keep, demand, use: u,
    trade: id === 'butter_salted', desc });
}
// 乳酪（チーズ）[id, 名前, 乳, 値, 日持ち, 需要, 希少, 説明, 民族]
const CHEESE = [
  ['cheese', '乳酪', 'milk', 4, 60, 2, 0, '村でふつうに作る、牛の乳の丸い乳酪。'],
  ['cheese_hard', '固い乳酪', 'milk', 6, 240, 2, 0, '大きな輪を半年寝かせた固い乳酪。削って使う。'],
  ['cheese_aged', '三年寝かせの乳酪', 'milk', 18, 1000, 1, 1, '洞窟で三年寝かせた、ひび割れるほど固く旨い乳酪。'],
  ['cheese_smoked', '燻し乳酪', 'milk', 6, 120, 1, 0, '燻して茶色い皮をまとった乳酪。'],
  ['cheese_blue', '青かび乳酪', 'sheep_milk', 14, 90, 1, 1, '羊の乳を洞窟で寝かせ、青いかびを育てた刺激の強い乳酪。'],
  ['cheese_brined', '塩水漬けの白乳酪', 'sheep_milk', 5, 60, 1, 0, '羊の乳の白い乳酪を塩水に沈めたもの。'],
  ['cheese_goat', '山羊の乳酪', 'goat_milk', 5, 90, 2, 0, 'ガライ族の崖の山羊の乳で作る名高い乳酪。', 'garai'],
  ['cheese_goat_ash', '灰まぶしの山羊乳酪', 'goat_milk', 9, 60, 1, 1, '木の灰をまぶして寝かせた、白と黒の山羊乳酪。'],
  ['cheese_herb', '香草入りの乳酪', 'milk', 6, 90, 1, 0, '香草を練りこんだ緑の筋の入った乳酪。'],
  ['cheese_wine', '葡萄酒洗いの乳酪', 'milk', 12, 120, 1, 1, '皮を葡萄酒で洗いながら寝かせた、香り高い乳酪。'],
  ['cheese_reindeer', 'トナカイの乳酪', 'reindeer_milk', 8, 120, 1, 1, '焚き火で焼いて食べる、ヤルヴィ族の濃い乳酪。', 'yarvi'],
  ['cheese_camel', '駱駝の乳酪', 'camel_milk', 7, 60, 1, 1, '砂海の隊商が作る、塩気の強い乳酪。', 'nefer'],
  ['cheese_mare_dried', '干し乳酪の粒', 'mare_milk', 3, 365, 1, 0, '馬の乳を煮詰めて石のように固く干した粒。馬上でしゃぶる。', 'dorgu'],
  ['cheese_royal', '王家の大輪の乳酪', 'milk', 60, 1500, 0, 2, '王家の牧場の乳だけで作り、十年寝かせた大輪の乳酪。', null],
  ['cheese_monastery', '修道院の乳酪', 'milk', 8, 150, 1, 0, '修道士が祈りのあいまに作る、なめらかな乳酪。'],
];
for (const [id, name, m, v, keep, demand, rare, desc, tribe] of CHEESE) {
  const u = [{ k: 'craft', note: '料理の材料' }];
  if (v >= 12) u.push({ k: 'luxury', note: '酒のつまみ・宴' }, { k: 'gift' });
  if (id === 'cheese_royal') u.push({ k: 'collect', note: '王家の紋入りの輪' });
  if (keep >= 120) u.push({ k: 'trade' });
  add({ id, name, sub: 'cheese', w: 0.5, v, stack: 10, rare, make: mk({ [m]: 3, salt: 0.02 }, id === 'cheese_monastery' ? 'priest' : 'cheesemaker', 24), food: 30, keep,
    demand, tribe, grade: id === 'cheese_royal' ? 'royal' : undefined, use: u, desc });
}

// ---- 卵料理 ----
const EGG = [
  ['egg_boiled', '茹で卵', { egg: 1 }, 0.6, 10, 3, 2, '殻ごと茹でた卵。持ち歩ける。'],
  ['egg_fried', '目玉焼き', { egg: 2, lard: 0.02 }, 1.2, 18, 1, 2, '鉄鍋で脂を引いて焼いた卵二つ。'],
  ['omelette_herb', '香草の卵焼き', { egg: 3, herbs: 0.02 }, 2.5, 26, 1, 1, '香草を混ぜて焼いた卵焼き。'],
  ['omelette_cheese', '乳酪入りの卵焼き', { egg: 3, cheese: 0.1 }, 3.5, 30, 1, 1, '乳酪を包んだ卵焼き。宿の朝の人気の品。'],
  ['omelette_mushroom', '茸の卵焼き', { egg: 3, mushroom: 0.2 }, 3, 28, 1, 1, '炒めた茸を包んだ卵焼き。'],
  ['egg_pickled', '卵の酢漬け', { egg: 1, vinegar_ale: 0.05 }, 0.8, 10, 60, 1, '茹で卵を酢に漬けたもの。酒場の壺に入っている。'],
  ['egg_salted_duck', '塩漬けの鴨の卵', { duck_egg: 1, salt: 0.05 }, 1.2, 12, 60, 1, '鴨の卵を塩の泥に漬けたもの。黄身が赤く固まる。'],
  ['egg_quail_royal', '鶉の卵の金盛り', { quail_egg: 12, ground_saffron: 0.005 }, 15, 16, 1, 0, '小さな鶉の卵を番紅花で金色に染めて盛った、王宮の前菜。'],
  ['egg_custard', '卵の蒸し菓子', { egg: 2, milk: 0.3, sugar: 0.05 }, 4, 16, 2, 1, '卵と乳を蒸して固めた、ふるふるした菓子。'],
  ['egg_hotspring', '温泉卵', { egg: 1 }, 1, 10, 3, 1, 'ハルン族の湯に浸けておく、白身のとろりとした卵。', 'harn'],
  ['egg_goose_roast', '鵞鳥の卵の灰焼き', { goose_egg: 1 }, 1.5, 16, 2, 1, '大きな鵞鳥の卵を灰にうずめて焼いたもの。'],
];
for (const [id, name, from, v, food, keep, demand, desc, tribe] of EGG) {
  add({ id, name, sub: id === 'egg_custard' ? 'sweet' : 'egg', w: 0.15, v, stack: 10, rare: id === 'egg_quail_royal' ? 1 : 0, make: mk(from, id === 'egg_quail_royal' ? 'cook' : id === 'egg_pickled' ? 'innkeeper' : 'household', 0.3),
    food, keep, demand, tribe, grade: id === 'egg_quail_royal' ? 'royal' : undefined, use: id === 'egg_boiled' ? [{ k: 'food', note: '旅の弁当' }] : [], desc });
}
