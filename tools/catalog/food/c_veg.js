// 野菜料理・漬物・スープ・煮込み・甘いパイ・菓子・果実の加工
const { add, mk } = require('./h');

// ---- 漬物・野菜料理 ----
const VEG = [
  // [id, 名前, 小分類, 材料, 作り手, 値, 満腹, 日持ち, 需要, 説明, 民族, 格]
  ['pickled_cabbage', '酢漬けの甘藍', 'pickle', { cabbage: 1, salt: 0.03 }, 'household', 1, 10, 180, 3, '甘藍を刻んで塩で漬け、酸っぱく熟れさせたもの。冬の青物で、船乗りの病を防ぐ。'],
  ['pickled_cucumber', '胡瓜の酢漬け', 'pickle', { cucumber: 1, vinegar_wine: 0.05, dill: 0.01 }, 'household', 1.2, 6, 120, 2, '蒔蘿の香りの胡瓜の酢漬け。'],
  ['pickled_onion', '小玉葱の酢漬け', 'pickle', { onion: 0.5, vinegar_ale: 0.05 }, 'household', 1, 5, 180, 1, '小さな玉葱を丸ごと酢に漬けたもの。酒場のつまみ。'],
  ['pickled_beet', '赤蕪の酢漬け', 'pickle', { beet: 1, vinegar_wine: 0.05 }, 'household', 1, 8, 120, 1, '真っ赤に染まる赤蕪の酢漬け。'],
  ['pickled_turnip', '蕪の塩漬け', 'pickle', { turnip: 1, salt: 0.03 }, 'household', 0.7, 8, 120, 2, '蕪を塩で漬けた、村の冬の漬物。'],
  ['pickled_mushroom', '茸の酢漬け', 'pickle', { mushroom: 0.5, vinegar_wine: 0.05 }, 'household', 2, 6, 120, 1, '秋の茸を酢と香草に漬けたもの。'],
  ['olives_brined', '塩水漬けの橄欖', 'pickle', { olive: 0.5, salt: 0.05 }, 'household', 2.5, 8, 365, 1, '渋を抜いて塩水に漬けた橄欖の実。', undefined],
  ['capers_pickled', '風鳥木の蕾の酢漬け', 'pickle', { caper_bud: 0.1, vinegar_wine: 0.05 }, 'cook', 5, 2, 365, 0, '小さな蕾を酢に漬けた、魚料理の薬味。', null, 'noble'],
  ['kimchi_radish', '大根の辛漬け', 'pickle', { radish: 1, chili: 0.05, salt: 0.03 }, 'household', 1.2, 8, 90, 1, '大根を唐辛子で漬けた、ぴりりと辛い漬物。'],
  ['mashed_turnip', '蕪のつぶし煮', 'veg', { turnip: 1, butter: 0.02 }, 'household', 0.8, 18, 1, 2, '蕪を茹でてつぶし、乳脂を落としたもの。'],
  ['roast_roots', '根菜の炉焼き', 'veg', { carrot: 0.5, parsnip: 0.5, turnip: 0.5 }, 'household', 1, 24, 1, 2, '人参と白人参と蕪を炉の灰で焼いたもの。'],
  ['boiled_potato', '茹で芋', 'veg', { potato: 1, salt: 0.01 }, 'household', 0.6, 24, 1, 2, '塩茹でした芋。'],
  ['baked_potato', '焼き芋の乳脂のせ', 'veg', { potato: 1, butter: 0.02 }, 'innkeeper', 1.5, 28, 1, 1, '皮ごと焼いた芋に乳脂をのせた、冬の屋台の品。'],
  ['potato_pancake', '芋の薄焼き', 'veg', { potato: 1, egg: 0.5, lard: 0.02 }, 'household', 1.2, 24, 1, 1, 'すりおろした芋を脂でかりっと焼いたもの。'],
  ['baked_pumpkin', '南瓜の窯焼き', 'veg', { pumpkin: 1 }, 'household', 1, 26, 2, 1, '南瓜を窯で焼いた甘い一皿。収穫祭の品。'],
  ['stuffed_cabbage', '甘藍の肉包み', 'veg', { cabbage: 0.5, meat: 0.2, groats_barley: 0.1 }, 'household', 2.5, 32, 1, 1, '甘藍の葉で肉と麦を包んで煮たもの。'],
  ['fried_mushroom', '茸の乳脂炒め', 'veg', { mushroom: 0.4, butter: 0.03 }, 'household', 2, 14, 1, 1, '森の茸を乳脂で炒めた秋の皿。'],
  ['mushroom_morel_cream', '網笠茸の乳脂煮', 'veg', { morel: 0.2, cream: 0.1 }, 'cook', 14, 14, 1, 0, '春にしかとれない網笠茸を乳脂で煮た、貴族の皿。', null, 'noble'],
  ['truffle_shaved', '黒茸の削りかけ', 'veg', { truffle: 0.05, egg: 2 }, 'cook', 30, 16, 1, 0, '卵料理に黒い地下茸を薄く削ってかけた、香りの皿。', null, 'royal'],
  ['bean_stew', '豆の煮込み', 'stew', { bean: 0.5, onion: 0.2, lard: 0.02 }, 'household', 1, 34, 2, 3, '干し豆を一晩煮た、貧しい家の力の素。'],
  ['lentil_stew', 'レンズ豆の煮込み', 'stew', { lentil: 0.4, onion: 0.2 }, 'household', 1, 32, 2, 2, '平たい豆を煮くずした茶色い煮込み。'],
  ['chickpea_paste', '雛豆の練り物', 'veg', { chickpea: 0.4, sesame_paste: 0.05, oil_olive: 0.02 }, 'household', 1.8, 20, 3, 1, '雛豆をすりつぶして胡麻の練り物と油で和えたもの。平焼きパンにつける。'],
  ['herb_salad', '香草の和え物', 'veg', { herbs: 0.1, oil_olive: 0.02, vinegar_wine: 0.01 }, 'household', 1.5, 6, 1, 1, '若い香草と葉を油と酢で和えたもの。'],
  ['flower_salad', '花の和え物', 'veg', { herbs: 0.1, rose_petal: 0.02, oil_walnut: 0.02 }, 'cook', 10, 6, 1, 0, '菫や薔薇の花びらを散らした、貴族の春の皿。', null, 'noble'],
  ['asparagus_butter', '白い若芽の乳脂かけ', 'veg', { asparagus: 0.3, butter: 0.03 }, 'cook', 8, 10, 1, 0, '春の若芽を茹でて乳脂をかけた、貴族の好む皿。', null, 'noble'],
  ['onion_roast', '丸焼き玉葱', 'veg', { onion: 1 }, 'household', 0.5, 12, 1, 1, '玉葱を皮ごと灰にうずめて焼いた、甘い一品。'],
  ['leek_braised', '葱の蒸し煮', 'veg', { leek: 1, butter: 0.02 }, 'household', 0.8, 12, 1, 1, '長葱を乳脂で柔らかく蒸し煮にしたもの。'],
  ['sauerkraut_pork', '酢漬け甘藍と豚の煮込み', 'stew', { pickled_cabbage: 0.5, pork: 0.3 }, 'household', 3, 38, 2, 2, '酢漬けの甘藍と豚ばらを煮込んだ、北の冬の料理。'],
];
for (const [id, name, sub, from, by, v, food, keep, demand, desc, tribe, grade] of VEG) {
  const u = [];
  if (id === 'pickled_cabbage') u.push({ k: 'medicine', note: '長い航海で歯ぐきの病を防ぐ' }, { k: 'trade' });
  if (keep >= 120 && sub === 'pickle') u.push({ k: 'food', note: '冬の備え' });
  add({ id, name, sub, w: sub === 'pickle' ? 0.4 : 0.5, v, stack: keep >= 30 ? 10 : 1, rare: grade === 'royal' ? 2 : grade === 'noble' ? 1 : 0, make: mk(from, by, sub === 'pickle' ? 48 : 1),
    food, keep, demand, grade, tribe: tribe || undefined, use: u, desc });
}

// ---- スープ ----
const SOUP = [
  ['soup_cabbage', '甘藍のスープ', { cabbage: 0.4, onion: 0.1 }, 0.6, 22, 3, '甘藍を煮ただけの、どこの家にもある汁。'],
  ['soup_onion', '玉葱のスープ', { onion: 0.5, bread_stale: 0.3, cheese_hard: 0.05 }, 1.5, 26, 2, '飴色に炒めた玉葱の汁に古パンと乳酪をのせて焼いたもの。'],
  ['soup_leek', '葱と芋のスープ', { leek: 0.4, potato: 0.4 }, 1, 26, 2, '葱と芋を煮くずした、白くとろりとした汁。'],
  ['soup_pea', '豌豆のスープ', { pea: 0.3, bacon: 0.05 }, 1.2, 28, 2, '干し豌豆を燻し豚ばらと煮た、緑色の濃い汁。'],
  ['soup_lentil', 'レンズ豆のスープ', { lentil: 0.3, onion: 0.1 }, 1, 26, 2, '平たい豆を煮た茶色の汁。'],
  ['soup_beet', '赤蕪のスープ', { beet: 0.4, cabbage: 0.2, sour_milk: 0.05 }, 1.2, 24, 2, '赤蕪で真っ赤に染まった汁に酸乳を落としたもの。'],
  ['soup_mushroom', '茸のスープ', { mushroom: 0.3, cream: 0.05 }, 2, 20, 1, '森の茸を乳脂で煮た秋の汁。'],
  ['soup_nettle', '刺草のスープ', { nettle: 0.3, potato: 0.2 }, 0.5, 18, 1, '春一番の刺草の若葉を煮た緑の汁。体の毒を流すという。'],
  ['soup_garlic', '大蒜のスープ', { garlic: 0.1, bread_stale: 0.2, egg: 1 }, 1, 20, 1, '大蒜と古パンと卵の汁。風邪のひきはじめに。'],
  ['soup_herb', '香草のスープ', { herbs: 0.1, onion: 0.1 }, 0.8, 16, 1, '庭の香草をありったけ入れた汁。'],
  ['soup_chicken', '鶏のスープ', { chicken: 0.3, carrot: 0.2, onion: 0.1 }, 2.5, 26, 2, '鶏を丸ごと煮た金色の汁。病人に飲ませる。'],
  ['soup_bread', 'パンのスープ', { bread_stale: 0.4, bone_broth: 0.3 }, 0.7, 24, 2, '古パンを骨の出汁で煮た、節約の汁。'],
  ['soup_beer', '麦酒のスープ', { ale: 0.3, bread_stale: 0.2, egg: 1 }, 1, 22, 1, '温めた麦酒に古パンと卵を溶いた、寒い朝の汁。'],
  ['soup_wine', '葡萄酒のスープ', { wine_white: 0.2, egg: 1, sugar: 0.02 }, 4, 14, 0, '白葡萄酒を卵でとろめた、貴族の夜食の汁。', 'noble'],
  ['soup_fruit_cold', '冷たい果実のスープ', { cherry: 0.3, sour_milk: 0.1, sugar: 0.03 }, 3, 12, 0, '夏に井戸で冷やす、桜桃の甘い汁。', 'noble'],
  ['soup_pumpkin', '南瓜のスープ', { pumpkin: 0.5, milk: 0.1 }, 1.2, 24, 1, '南瓜を乳でのばした、甘い橙色の汁。'],
  ['soup_bean', '豆と燻し肉のスープ', { bean: 0.3, bacon: 0.05 }, 1.3, 30, 2, '白い豆と燻し肉を煮た、働き手の汁。'],
  ['soup_barley', '大麦と羊のスープ', { groats_barley: 0.2, mutton: 0.2 }, 2, 32, 2, '羊と大麦を煮た、濃いとろみの汁。'],
  ['soup_consomme_royal', '王宮の澄まし汁', { beef: 1, chicken: 0.5, egg: 2 }, 25, 12, 0, '三日かけて肉を煮出し、卵白で濁りを抜いた琥珀色の澄んだ汁。', 'royal'],
  ['soup_almond', '巴旦杏の白い汁', { almond_milk: 0.3, chicken: 0.1 }, 8, 16, 0, '巴旦杏の乳で鶏を煮た、斎日の貴族の汁。', 'noble'],
  ['soup_dragon_bone', '竜骨のスープ', { dragon_bone: 1, onion: 0.2 }, 40, 30, 0, '竜の骨を七日煮出した汁。飲めば三日は疲れないという。', 'royal'],
  ['soup_soldier', '兵舎の大鍋汁', { meat: 0.1, cabbage: 0.2, groats_barley: 0.1 }, 0.8, 28, 2, '兵舎で百人分を炊く、具の少ない汁。'],
];
for (const [id, name, from, v, food, demand, desc, grade] of SOUP) {
  const u = [];
  if (['soup_chicken', 'soup_garlic', 'soup_nettle'].includes(id)) u.push({ k: 'medicine', note: '病人と風邪の者に' });
  if (id === 'soup_dragon_bone') u.push({ k: 'medicine', note: '疲れを忘れる' });
  add({ id, name, sub: 'soup', w: 0.5, v, stack: 1, rare: grade === 'royal' ? 2 : grade === 'noble' ? 1 : 0,
    make: mk(from, grade ? 'cook' : id === 'soup_soldier' ? 'soldier' : 'household', grade ? 4 : 1), food, drink: 12, keep: 1, demand, grade, use: u,
    fx: ['soup_chicken', 'soup_garlic'].includes(id) ? { hp: 3 } : id === 'soup_dragon_bone' ? { hp: 12 } : undefined, desc });
}
// ---- 煮込み（肉以外の組み合わせ）----
const STEW = [
  ['stew_hunter', '狩人の鍋', { venison: 0.2, boar_meat: 0.2, mushroom: 0.2, juniper_berry: 0.01 }, 'hunter', 4, 40, 1, null, 'その日の獲物と茸を杜松の実で煮た、森の鍋。'],
  ['stew_harvest', '収穫の寄せ煮', { meat: 0.2, carrot: 0.3, turnip: 0.3, cabbage: 0.3, bean: 0.2 }, 'household', 3, 44, 2, null, '畑のものを全部入れて煮た、収穫祭の大鍋。'],
  ['stew_potfeu', '肉と根菜の寄せ煮', { beef: 0.3, leek: 0.2, carrot: 0.2, bone: 1 }, 'household', 3.5, 42, 2, null, '牛の骨と肉と根菜を長く煮て、汁と具を別に食べる。'],
  ['stew_goulash', '赤い牛煮込み', { beef: 0.3, onion: 0.3, ground_chili: 0.01 }, 'innkeeper', 5, 40, 2, 'inn', '牛肉を玉葱と唐辛子の粉で赤く煮込んだ、牧人の鍋。'],
  ['stew_ragout_noble', '貴族の煮込み', { veal: 0.3, mushroom: 0.2, wine_white: 0.2, cream: 0.1 }, 'cook', 20, 36, 1, 'noble', '子牛と茸を白葡萄酒と乳脂で煮た、白く上品な煮込み。'],
  ['stew_fish_inn', '宿の魚の煮込み', { fish: 0.4, onion: 0.2, wine_white: 0.1 }, 'innkeeper', 5, 36, 2, 'inn', '川魚を白葡萄酒で煮た、川辺の宿の名物。'],
  ['stew_mushroom', '茸の煮込み', { mushroom: 0.5, onion: 0.2, sour_milk: 0.05 }, 'household', 2, 26, 1, null, '茸ばかりを酸乳で煮込んだ秋の鍋。肉の日でない日に。'],
  ['stew_cave', '洞窟茸の煮込み', { cave_mushroom: 0.4, goat_meat: 0.2 }, 'household', 3, 34, 1, null, '坑道の奥で育つ白い茸と山羊肉の煮込み。'],
];
for (const [id, name, from, by, v, food, demand, grade, desc] of STEW) {
  add({ id, name, sub: 'stew', w: 0.6, v, stack: 1, rare: grade === 'noble' ? 1 : 0, make: mk(from, by, 3), food, keep: 2, demand, grade,
    use: id === 'stew_harvest' ? [{ k: 'ritual', note: '収穫祭' }] : [], desc });
}

// ---- 果実の加工（干し・煮詰め・砂糖漬け）----
// [果実id, 名前]
const FRUITS = [
  ['apple', '林檎'], ['pear', '梨'], ['grape', '葡萄'], ['plum', '李'], ['cherry', '桜桃'], ['apricot', '杏'], ['peach', '桃'], ['fig', '無花果'],
  ['date', 'ナツメヤシの実'], ['quince', '榲桲'], ['strawberry', '野苺'], ['blueberry', '黒苺'], ['raspberry', '木苺'], ['blackberry', '黒木苺'],
  ['lingonberry', '苔桃'], ['cranberry', '蔓苔桃'], ['elderberry', '接骨木の実'], ['cloudberry', '雲苺'], ['orange', '橙'], ['citron', '香橙'], ['pomegranate', '石榴'], ['rosehip', '野薔薇の実'],
];
const DRYABLE = ['apple', 'pear', 'plum', 'apricot', 'peach', 'fig', 'date', 'cherry', 'blueberry', 'cranberry'];
for (const [f, n] of FRUITS) {
  if (DRYABLE.includes(f)) {
    const id = f === 'plum' ? 'prunes' : `dried_${f}`;
    add({ id, name: f === 'plum' ? '干し李' : `干し${n}`, sub: 'fruit', w: 0.2, v: f === 'date' || f === 'fig' ? 2.5 : 1.8, stack: 20, make: mk({ [f]: 1 }, 'household', 48),
      food: 10, keep: 365, demand: 1, trade: ['date', 'fig', 'apricot'].includes(f), tribe: f === 'date' ? 'nefer' : undefined,
      use: [{ k: 'craft', note: '菓子・パン・煮込みの甘み' }, { k: 'food', note: '旅の甘い携行食' }], desc: `${n}を日に干して甘みを閉じこめたもの。` });
  }
  if (!['date', 'citron'].includes(f)) {
    const jam = f === 'quince' ? '榲桲の固め煮' : f === 'orange' ? '橙の皮入り煮詰め' : `${n}の煮詰め`;
    add({ id: `jam_${f}`, name: jam, sub: 'sweet', w: 0.3, v: ['orange', 'cloudberry', 'pomegranate', 'quince'].includes(f) ? 5 : 3, stack: 10, make: mk({ [f]: 1, honey: 0.1 }, 'confectioner', 2),
      food: 10, keep: 365, demand: 1, use: [{ k: 'craft', note: 'パンに塗る・菓子の中身' }, { k: 'gift', note: '手作りの贈り物' }],
      tribe: f === 'lingonberry' || f === 'cloudberry' ? 'yarvi' : undefined, desc: `${n}を蜂蜜で煮詰めて瓶に詰めたもの。冬に夏の味を楽しむ。` });
  }
}
add({ id: 'raisins', name: '干し葡萄', sub: 'fruit', w: 0.2, v: 2, stack: 20, make: mk({ grape: 1 }, 'household', 72), food: 10, keep: 365, demand: 2, trade: true,
  use: [{ k: 'craft', note: 'パン・菓子・葡萄の酒' }, { k: 'food', note: '旅の甘い携行食' }], desc: '葡萄を房ごと干したもの。甘くて軽い。' });
const CANDIED = [
  ['candied_orange', '橙の皮の砂糖漬け', { orange: 1, sugar: 0.2 }, 6, '橙の皮を砂糖で何日も煮た、香りのよい菓子。'],
  ['candied_citron', '香橙の砂糖漬け', { citron: 1, sugar: 0.2 }, 7, '香橙の厚い皮の砂糖漬け。菓子に刻んで入れる。'],
  ['candied_ginger', '生姜の砂糖漬け', { ginger: 0.3, sugar: 0.2 }, 6, '生姜を砂糖で煮た、辛くて甘い菓子。腹を温める。'],
  ['candied_cherry', '桜桃の砂糖漬け', { cherry: 0.5, sugar: 0.2 }, 5, '赤く艶のある桜桃の砂糖漬け。菓子の飾り。'],
  ['candied_violet', '菫の花の砂糖衣', { violet_flower: 0.1, sugar: 0.1 }, 12, '菫の花びらに砂糖をまとわせた、貴婦人の菓子。'],
  ['candied_angelica', '当帰の茎の砂糖漬け', { angelica: 0.2, sugar: 0.2 }, 8, '緑の当帰の茎の砂糖漬け。修道院の菓子。'],
  ['candied_chestnut', '栗の蜜煮', { chestnut: 0.5, sugar: 0.2 }, 9, '栗を何日もかけて蜜で煮た、冬の贈り物の菓子。'],
  ['fruit_leather_apple', '林檎の干し板', { apple: 1 }, 1.5, '林檎を煮つぶして薄く干した、しなやかな板。子どものおやつ。'],
  ['fruit_leather_apricot', '杏の干し板', { apricot: 1 }, 2.5, '杏を煮つぶして干した橙色の板。砂海の隊商の甘味。'],
  ['fruit_leather_berry', '黒苺の干し板', { blueberry: 1 }, 2, '黒苺を干して固めた紫の板。'],
];
for (const [id, name, from, v, desc] of CANDIED) {
  add({ id, name, sub: 'sweet', w: 0.1, v, stack: 20, rare: v >= 8 ? 1 : 0, make: mk(from, id.startsWith('fruit_leather') ? 'household' : 'confectioner', 6), food: 6, keep: 365, demand: v >= 8 ? 0 : 1,
    use: [{ k: 'luxury', note: '甘い楽しみ' }, { k: 'gift', note: '贈り物' }, ...(id === 'candied_ginger' ? [{ k: 'medicine', note: '腹を温め、船酔いを抑える' }] : [])], fx: { mood: v >= 8 ? 4 : 2 }, desc });
}

// ---- 甘いパイ・タルト ----
const TART = [
  ['pie_apple', '林檎のパイ', { apple: 1, flour_wheat: 0.4, butter: 0.1, honey: 0.05 }, 5, 50, '林檎を甘く煮て包んだパイ。どの家にも自慢の焼き方がある。', 2],
  ['pie_pear', '梨のパイ', { pear: 1, flour_wheat: 0.4, butter: 0.1, wine_red: 0.1 }, 6, 50, '梨を赤葡萄酒で煮て包んだパイ。', 1],
  ['pie_cherry', '桜桃のパイ', { cherry: 0.6, flour_wheat: 0.4, butter: 0.1, sugar: 0.05 }, 7, 48, '初夏の桜桃を敷きつめた真っ赤なパイ。', 1],
  ['pie_berry', '木苺のパイ', { raspberry: 0.5, blackberry: 0.3, flour_wheat: 0.4, butter: 0.1 }, 6, 46, '森で摘んだ苺を詰めたパイ。', 1],
  ['pie_plum', '李のパイ', { plum: 0.8, flour_wheat: 0.4, butter: 0.1 }, 5, 48, '酸っぱい李を焼きこんだパイ。', 1],
  ['pie_pumpkin', '南瓜のパイ', { pumpkin: 0.6, egg: 2, flour_wheat: 0.4, ground_cinnamon: 0.01 }, 5, 52, '南瓜と卵と肉桂のパイ。収穫祭の菓子。', 1],
  ['pie_cheese', '乳酪のパイ', { curd: 0.4, egg: 2, flour_wheat: 0.4, honey: 0.05 }, 6, 54, '白い乳酪と卵を焼いた、しっとりしたパイ。', 1],
  ['pie_mushroom', '茸のパイ', { mushroom: 0.5, onion: 0.2, flour_wheat: 0.4, butter: 0.1 }, 5, 48, '茸と玉葱を詰めた、肉を食べない日のパイ。', 1],
  ['tart_onion', '玉葱のタルト', { onion: 0.6, egg: 2, cream: 0.1, flour_wheat: 0.3 }, 5, 46, '玉葱と卵と乳脂を浅い皮に流して焼いたもの。', 1],
  ['tart_honey', '蜂蜜のタルト', { honey: 0.2, walnut: 0.2, flour_wheat: 0.3, butter: 0.1 }, 8, 40, '蜂蜜と胡桃のねっとりした甘いタルト。', 1],
  ['tart_custard', '卵乳のタルト', { egg: 3, milk: 0.3, sugar: 0.05, flour_white: 0.3 }, 9, 40, '卵と乳の黄色い中身が揺れる、貴族の菓子。', 0, 'noble'],
  ['tart_almond', '巴旦杏のタルト', { almond: 0.3, sugar: 0.1, egg: 2, flour_white: 0.3 }, 14, 40, '巴旦杏の粉と砂糖を焼いた、香ばしい貴族の菓子。', 0, 'noble'],
  ['pie_royal_gilded', '金箔の宴のパイ', { pheasant_meat: 1, venison: 0.5, flour_white: 1, gold_leaf: 0.02, ground_spice_sweet: 0.05 }, 120, 200, '城の形に焼き上げ、金箔で飾った大パイ。切ると中から鳥の肉が出てくる。', 0, 'royal'],
  ['hand_pie', '手包みのパイ', { meat: 0.2, turnip: 0.2, flour_wheat: 0.3, lard: 0.05 }, 2.5, 34, '片手で食べられる半月形のパイ。畑や旅の弁当に。', 3],
  ['pasty_miner', '坑夫のパイ', { beef: 0.2, potato: 0.3, flour_wheat: 0.3, lard: 0.05 }, 3, 42, '厚い縁を持って食べ、汚れた縁は山の精に投げる、坑夫の弁当。', 2, null, 'garai'],
  ['pie_eel_jellied', '鰻の煮凝り', { eel: 0.4, vinegar_wine: 0.02 }, 3, 24, '鰻を煮て、その汁ごと冷やし固めたもの。', 1],
];
for (const [id, name, from, v, food, desc, demand, grade, tribe] of TART) {
  const u = [{ k: 'gift', note: '訪問の手土産' }];
  if (['pie_pumpkin', 'pie_apple'].includes(id)) u.push({ k: 'ritual', note: '収穫祭の供え物' });
  if (grade === 'royal') u.push({ k: 'collect', note: '宴の語り草' });
  if (id === 'pasty_miner') u.push({ k: 'ritual', note: '縁を山の精に捧げる' });
  add({ id, name, sub: 'pie', w: food / 50, v, stack: food >= 40 ? 1 : 5, rare: grade === 'royal' ? 3 : grade === 'noble' ? 1 : 0,
    make: mk(from, grade ? 'cook' : 'baker', grade === 'royal' ? 12 : 3), food, keep: id === 'hand_pie' || id === 'pasty_miner' ? 4 : 3, demand, grade, tribe, use: u,
    fx: grade ? { mood: grade === 'royal' ? 10 : 5 } : undefined, desc });
}

// ---- 菓子 ----
const SWEET = [
  // [id, 名前, 材料, 作り手, 値, 満腹, 日持ち, 需要, 説明, 追加, 格, 民族]
  ['honey_cake', '蜂蜜菓子', { flour_wheat: 0.2, honey: 0.1 }, 'baker', 2.5, 12, 30, 2, '蜂蜜をたっぷり練った素朴な焼き菓子。祭りの日に子どもがもらう。'],
  ['gingerbread', '生姜焼き菓子', { flour_rye: 0.2, honey: 0.1, ground_ginger: 0.01, ground_cinnamon: 0.005 }, 'confectioner', 4, 12, 90, 1, '生姜と肉桂の香る堅い焼き菓子。型で人や馬の形に抜く。', [{ k: 'collect', note: '型抜きの飾り菓子' }]],
  ['spice_cookie', '香辛料の小焼き菓子', { flour_wheat: 0.1, sugar: 0.05, ground_spice_sweet: 0.005 }, 'confectioner', 3, 6, 90, 1, '冬至の頃に焼く、香辛料のきいた小さな焼き菓子。'],
  ['butter_biscuit', '乳脂の焼き菓子', { flour_wheat: 0.1, butter: 0.05, sugar: 0.03 }, 'confectioner', 3, 6, 30, 1, 'ほろほろと崩れる乳脂の焼き菓子。'],
  ['oat_biscuit', '燕麦の焼き菓子', { flour_oat: 0.1, honey: 0.03 }, 'household', 1, 6, 30, 1, '燕麦と蜂蜜の固い焼き菓子。'],
  ['marzipan', '巴旦杏の練り菓子', { almond: 0.2, sugar: 0.2, rosewater: 0.01 }, 'confectioner', 14, 8, 120, 0, '巴旦杏と砂糖を練って果物や動物の形に作る、貴族の菓子。', [{ k: 'collect', note: '細工の菓子' }], 'noble'],
  ['nougat', '蜜と木の実の練り菓子', { honey: 0.1, almond: 0.1, hazelnut: 0.1 }, 'confectioner', 8, 8, 180, 1, '蜂蜜と卵白と木の実を練り固めた白い菓子。'],
  ['halva', '胡麻の練り菓子', { sesame_paste: 0.2, honey: 0.1 }, 'confectioner', 5, 10, 180, 1, '胡麻の練り物を蜂蜜で固めた、砂海の隊商の菓子。', [], null, 'nefer'],
  ['honey_candy', '蜂蜜の飴', { honey: 0.1 }, 'confectioner', 2, 2, 365, 1, '蜂蜜を煮詰めて固めた琥珀色の飴。のどの痛みにも。', [{ k: 'medicine', note: 'のどの痛みに' }]],
  ['barley_sugar', '麦の飴', { sugar: 0.1, barley: 0.02 }, 'confectioner', 2, 2, 365, 1, '麦の煮汁と砂糖を煮詰めてねじった金色の飴。'],
  ['toffee', '焦がし乳脂飴', { sugar: 0.1, butter: 0.03 }, 'confectioner', 3, 3, 180, 1, '砂糖と乳脂を焦がして固めた、歯にくっつく飴。'],
  ['sugar_almonds', '糖衣の巴旦杏', { almond: 0.1, sugar: 0.1 }, 'confectioner', 8, 4, 365, 0, '巴旦杏を白い砂糖で包んだ粒。婚礼で客に五粒ずつ配る。', [{ k: 'ritual', note: '婚礼で客に配る' }], 'noble'],
  ['candied_nuts', '蜜がけの木の実', { walnut: 0.1, hazelnut: 0.1, honey: 0.05 }, 'confectioner', 4, 6, 120, 1, '木の実を蜂蜜で絡めて乾かしたもの。'],
  ['sugar_sculpture', '砂糖細工の城', { sugar: 2, rosewater: 0.05, gold_leaf: 0.01 }, 'confectioner', 150, 30, 365, 0, '宴の卓の真ん中に飾る、砂糖で作った城。最後に皆で割って食べる。', [{ k: 'collect', note: '宴の飾り' }], 'royal'],
  ['cake_festival', '祭りの大菓子', { flour_wheat: 1, egg: 4, honey: 0.3, raisins: 0.2 }, 'baker', 18, 120, 5, 0, '祭りの日に村じゅうで分ける大きな菓子。', [{ k: 'ritual', note: '祭り' }]],
  ['cake_fruit', '果実の焼き菓子', { flour_wheat: 0.5, raisins: 0.2, candied_orange: 0.1, butter: 0.2, egg: 3 }, 'confectioner', 20, 80, 180, 0, '干し果実を詰めた重い焼き菓子。酒を染みこませれば一年もつ。', [{ k: 'gift', note: '冬至の贈り物' }]],
  ['cake_wedding', '婚礼の塔菓子', { flour_white: 2, egg: 10, sugar: 1, butter: 0.5, marzipan: 0.5 }, 'confectioner', 120, 400, 5, 0, '三段に積んだ白い婚礼の菓子。貴族の婚礼の目玉。', [{ k: 'ritual', note: '婚礼' }], 'noble'],
  ['cake_cheese', '乳酪の焼き菓子', { curd: 0.3, egg: 2, honey: 0.1, flour_wheat: 0.1 }, 'baker', 6, 30, 3, 1, '白い乳酪と卵と蜂蜜を焼いた、しっとりした菓子。'],
  ['custard_pudding', '卵乳の焼きプディング', { egg: 3, milk: 0.4, sugar: 0.05 }, 'cook', 5, 18, 2, 1, '卵と乳を焼いて固め、焦がした砂糖をかけた菓子。', [], 'noble'],
  ['pudding_rosewater', '薔薇水のプディング', { almond_milk: 0.3, rosewater: 0.02, sugar: 0.05, flour_white: 0.05 }, 'cook', 18, 14, 1, 0, '巴旦杏の乳を薔薇水で香りづけして固めた、王妃の好む菓子。', [], 'royal'],
  ['pudding_bread', 'パンのプディング', { bread_stale: 0.5, milk: 0.3, egg: 1, raisins: 0.05 }, 'household', 1.5, 30, 2, 2, '古パンを乳と卵に浸して焼いた、無駄にしない菓子。'],
  ['fritter_apple', '林檎の揚げ菓子', { apple: 0.5, flour_wheat: 0.1, lard: 0.05, honey: 0.03 }, 'innkeeper', 2, 12, 1, 1, '輪切りの林檎に衣をつけて揚げ、蜂蜜をかけたもの。'],
  ['fritter_sweet', '揚げ菓子の輪', { flour_wheat: 0.15, egg: 1, lard: 0.05, sugar: 0.02 }, 'confectioner', 1.5, 10, 2, 2, '輪にして揚げた菓子。祭りの屋台で揚げたてを売る。'],
  ['fritter_elder', '接骨木の花の揚げ菓子', { elderflower: 0.05, flour_wheat: 0.1, lard: 0.05 }, 'household', 2, 8, 1, 1, '初夏に咲く接骨木の花房に衣をつけて揚げたもの。'],
  ['crepe', '薄焼きの巻き菓子', { flour_wheat: 0.1, egg: 1, milk: 0.2, jam_apple: 0.05 }, 'confectioner', 2.5, 12, 1, 1, '薄く焼いた生地に煮詰めた果実を巻いたもの。'],
  ['sweet_dumpling', '甘い包み団子', { flour_wheat: 0.2, plum: 0.3, sugar: 0.02 }, 'household', 1.5, 16, 1, 1, '李を丸ごと生地で包んで茹で、砂糖をかけたもの。'],
  ['chestnut_roast', '焼き栗', { chestnut: 0.3 }, 'household', 1, 12, 7, 2, '秋の広場で焼く、ほくほくの栗。'],
  ['baked_apple', '焼き林檎', { apple: 1, honey: 0.03 }, 'household', 1, 12, 2, 1, '芯を抜いて蜂蜜を詰めて焼いた林檎。'],
  ['royal_apple_gilded', '王宮の蜜がけ焼き林檎', { apple: 1, honey: 0.05, ground_cinnamon: 0.005, gold_leaf: 0.005 }, 'cook', 12, 12, 2, 0, '焼き林檎に肉桂の蜜をかけ、金箔を一枚のせた王宮の菓子。', [], 'royal'],
  ['cacao_sweet', '苦い豆の練り菓子', { cacao_paste: 0.1, honey: 0.05 }, 'confectioner', 12, 6, 90, 0, '密林の豆の練り物を蜂蜜で固めた、黒くほろ苦い菓子。', [], 'noble', 'mictla'],
  ['date_cake', 'ナツメヤシの菓子', { dried_date: 0.2, flour_wheat: 0.1, sesame: 0.02 }, 'household', 3, 14, 60, 1, 'ナツメヤシの実を練りこんで胡麻をまぶした砂海の菓子。', [], null, 'nefer'],
  ['licorice_stick', '甘草の棒', { licorice_root: 0.05 }, 'herbalist', 1, 0, 365, 1, '甘草の根を切った棒。噛むと甘く、のどによい。', [{ k: 'medicine', note: 'のどと咳に' }]],
  ['rock_sugar', '氷砂糖', { sugar: 0.2 }, 'confectioner', 4, 4, 0, 1, '砂糖の汁から何日もかけて育てた透き通った結晶。'],
  ['flower_jelly', '花の寒天', { rose_petal: 0.05, sugar: 0.05, isinglass: 0.01 }, 'cook', 14, 4, 2, 0, '花びらを閉じこめた透き通った寄せ菓子。', [{ k: 'collect', note: '宴の飾り' }], 'noble'],
  ['sweets_fairground', '縁日の砂糖菓子', { sugar: 0.05 }, 'confectioner', 1, 2, 60, 1, '色をつけた砂糖を小さく固めたもの。子どもの小遣いで買える。'],
  ['sweet_birthday_prince', '王子の誕生祝いの菓子', { flour_white: 1, egg: 6, sugar: 0.5, candied_cherry: 0.2 }, 'cook', 60, 150, 3, 0, '王子や王女の誕生を祝って焼かれ、城下の子どもにも一切れずつ配られる菓子。', [{ k: 'ritual', note: '誕生祝い' }], 'royal'],
];
for (const [id, name, from, by, v, food, keep, demand, desc, extra = [], grade, tribe] of SWEET) {
  const u = [{ k: 'luxury', note: '甘い楽しみ・気分が上がる' }, ...extra];
  if (!u.some((x) => x.k === 'gift')) u.push({ k: 'gift' });
  add({ id, name, sub: 'sweet', w: Math.max(0.05, food / 80), v, stack: food >= 60 ? 1 : 10, rare: grade === 'royal' ? 2 : grade === 'noble' ? 1 : 0, make: mk(from, by, food >= 60 ? 6 : 2),
    food: food || 1, noEat: food === 0, keep: keep || undefined, demand, grade, tribe, use: u, fx: { mood: grade === 'royal' ? 8 : grade === 'noble' ? 5 : 2 }, desc });
}
