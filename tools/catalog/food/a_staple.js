// 粉・麦芽・種・パン・粥・団子
const { add, mk } = require('./h');

// ---- 粉（粉屋がひく） ----
const FLOURS = [
  ['flour_wheat', '小麦粉', 'wheat', 0.9, 3, 'ふつうの小麦をひいた粉。パンと菓子のもと。'],
  ['flour_white', '白い上粉', 'wheat', 2.2, 1, '小麦のふすまを細かいふるいで除いた真っ白な粉。貴族のパン用。'],
  ['flour_rye', 'ライ麦粉', 'rye', 0.7, 3, '黒パンになる、色の濃い粉。寒い土地でよく使う。'],
  ['flour_barley', '大麦粉', 'barley', 0.6, 2, '大麦をひいた粉。平焼きや粥にまぜる。'],
  ['flour_spelt', '古代小麦の粉', 'spelt', 1.1, 1, '殻の固い古い麦をひいた粉。香ばしいパンになる。'],
  ['flour_buckwheat', '蕎麦粉', 'buckwheat', 0.8, 2, '灰色谷で好まれる蕎麦の粉。薄焼きや団子に。'],
  ['flour_maize', '玉蜀黍の粉', 'maize', 0.7, 2, '密林の民の主食になる黄色い粉。'],
  ['flour_millet', '黍の粉', 'millet', 0.6, 1, '乾いた土地でもとれる黍の粉。'],
  ['flour_chestnut', '栗の粉', 'chestnut', 1.4, 1, '干した栗をひいた甘い粉。麦の少ない山里の粉。'],
  ['flour_acorn', '団栗の粉', 'acorn', 0.3, 1, 'あく抜きした団栗の粉。飢えた年の救いの粉。'],
  ['flour_bean', '豆の粉', 'bean', 0.8, 1, '豆をひいた粉。汁にとろみをつけ、団子にもなる。'],
  ['flour_oat', '押し燕麦', 'oat', 0.6, 2, '燕麦を押しつぶしたもの。粥にすぐ煮える。'],
];
for (const [id, name, g, v, d, desc] of FLOURS) {
  add({ id, name, sub: 'flour', w: 1, v, stack: 20, make: mk({ [g]: 1 }, 'miller', 0.5), food: 6, noEat: true, keep: 120, demand: d,
    use: [{ k: 'craft', note: 'パン・粥・菓子の材料' }, { k: 'feed', note: '古くなった粉は家畜の餌' }], trade: v > 1, desc });
}
add({ id: 'bran', name: 'ふすま', sub: 'flour', w: 0.5, v: 0.2, stack: 30, make: mk({ wheat: 1 }, 'miller', 0.3), food: 2, noEat: true, keep: 60, demand: 1,
  use: [{ k: 'feed', note: '馬と豚の餌' }, { k: 'craft', note: '黒パンのかさ増し' }], desc: '白い上粉をふるったときに残る麦の皮。' });
add({ id: 'groats_barley', name: '挽き割り大麦', sub: 'flour', w: 1, v: 0.6, stack: 20, make: mk({ barley: 1 }, 'miller', 0.3), food: 6, noEat: true, keep: 180, demand: 2,
  use: [{ k: 'craft', note: '粥・スープの具' }], desc: '粗く割った大麦。煮込みにとろみと腹持ちを足す。' });
add({ id: 'groats_buckwheat', name: '炒り蕎麦の実', sub: 'flour', w: 1, v: 0.8, stack: 20, make: mk({ buckwheat: 1 }, 'miller', 0.4), food: 6, noEat: true, keep: 180, demand: 1,
  use: [{ k: 'craft', note: '蕎麦の実の粥' }], desc: '蕎麦の実を炒って殻を除いたもの。' });
add({ id: 'malt_barley', name: '大麦の麦芽', sub: 'malt', w: 1, v: 1.2, stack: 20, make: mk({ barley: 1 }, 'brewer', 4), food: 4, noEat: true, keep: 240, demand: 2,
  use: [{ k: 'craft', note: '麦酒・蒸留酒の材料' }], trade: true, desc: '大麦を芽吹かせて乾かしたもの。麦酒の甘みのもと。' });
add({ id: 'malt_wheat', name: '小麦の麦芽', sub: 'malt', w: 1, v: 1.4, stack: 20, make: mk({ wheat: 1 }, 'brewer', 4), food: 4, noEat: true, keep: 240, demand: 1,
  use: [{ k: 'craft', note: '白麦酒の材料' }], desc: '小麦を芽吹かせて乾かしたもの。' });
add({ id: 'malt_dark', name: '焦がし麦芽', sub: 'malt', w: 1, v: 1.6, stack: 20, make: mk({ malt_barley: 1 }, 'brewer', 1), food: 4, noEat: true, keep: 240, demand: 1,
  use: [{ k: 'craft', note: '黒麦酒の色と苦みのもと' }], desc: '麦芽を釜で深く焦がしたもの。' });
add({ id: 'sourdough', name: 'パン種', sub: 'yeast', w: 0.3, v: 0.5, stack: 10, make: mk({ flour_rye: 1 }, 'baker', 24), food: 2, noEat: true, keep: 7, demand: 2,
  use: [{ k: 'craft', note: 'パンをふくらませる' }, { k: 'gift', note: '嫁入りのとき母から娘へ分ける' }], desc: '粉と水を寝かせて育てた酸っぱい種。家ごとに味が違う。' });
add({ id: 'ale_yeast', name: '酒の澱', sub: 'yeast', w: 0.3, v: 0.6, stack: 10, make: mk({ ale: 1 }, 'brewer', 2), food: 2, noEat: true, keep: 10, demand: 1,
  use: [{ k: 'craft', note: '酒を醸す種・白パンのふくらし' }], desc: '麦酒の樽の底にたまる澱。次の酒とパンをふくらませる。' });

// ---- パン ----
// [id, 名前, 材料, 作り手, 時間, 重さ, 値, 満腹, 日持ち, 需要, 格, 説明, 追加の使い道, 希少]
const BREADS = [
  ['bread', 'パン', { flour_wheat: 1, sourdough: 0.1 }, 'baker', 2, 0.5, 3, 40, 4, 3, null, '町のパン屋が毎朝焼く、ふつうの小麦のパン。', []],
  ['bread_black', '黒パン', { flour_rye: 1, sourdough: 0.2 }, 'baker', 3, 0.6, 2, 42, 8, 3, 'common', '酸っぱくて固い、ライ麦の黒パン。庶民の毎日の糧。', []],
  ['bread_white', '白パン', { flour_white: 1, ale_yeast: 0.1 }, 'baker', 2, 0.4, 7, 36, 3, 1, 'noble', '上粉だけで焼いたふわりと白いパン。貴族の食卓の品。', []],
  ['bread_maslin', '混ぜ麦パン', { flour_wheat: 0.5, flour_rye: 0.5, sourdough: 0.1 }, 'baker', 2, 0.5, 2.5, 40, 6, 2, 'common', '小麦とライ麦をまぜて焼いた、村のパン。', []],
  ['bread_barley', '大麦パン', { flour_barley: 1 }, 'household', 2, 0.5, 1.5, 36, 5, 2, 'common', 'ぼそぼそした大麦のパン。貧しい家の糧。', []],
  ['bread_bran', 'ふすまパン', { bran: 1, flour_rye: 0.3 }, 'household', 2, 0.5, 0.8, 26, 5, 1, 'common', 'ふすまでかさを増した粗いパン。牢や救貧院でも出る。', [{ k: 'feed', note: '家畜の餌' }]],
  ['bread_acorn', '団栗パン', { flour_acorn: 1 }, 'household', 2, 0.5, 0.6, 24, 6, 0, 'common', '飢饉の年に焼く、渋みの残るパン。', [{ k: 'quest', note: '飢えた村への施し' }]],
  ['bread_chestnut', '栗パン', { flour_chestnut: 1, sourdough: 0.1 }, 'baker', 2, 0.5, 3.5, 40, 5, 1, null, 'ほんのり甘い、山里の栗のパン。', []],
  ['bread_spelt', '古代小麦のパン', { flour_spelt: 1, sourdough: 0.1 }, 'baker', 2, 0.5, 4, 40, 5, 1, null, '香ばしく、よく噛むほど甘い。修道院でよく焼かれる。', []],
  ['flatbread', '平焼きパン', { flour_wheat: 0.6 }, 'household', 0.5, 0.25, 1.2, 22, 3, 3, 'common', 'ふくらませずに鉄板で焼いた薄いパン。何でも包める。', []],
  ['flatbread_barley', '大麦の平焼き', { flour_barley: 0.6 }, 'household', 0.5, 0.25, 0.8, 20, 4, 2, 'common', '大麦の粉を練って石で焼いた平たいパン。', []],
  ['oatcake', '燕麦の平焼き', { flour_oat: 0.5 }, 'household', 0.5, 0.2, 0.8, 20, 20, 2, 'common', '燕麦を固めて焼いた平たい菓子パン。羊飼いの弁当。', []],
  ['galette_buckwheat', '蕎麦粉の薄焼き', { flour_buckwheat: 0.4, egg: 0.5 }, 'household', 0.5, 0.2, 1.5, 22, 2, 2, 'common', '灰色谷の薄焼き。卵や乳酪をのせて食べる。', []],
  ['bread_millet', '黍の丸パン', { flour_millet: 0.6 }, 'household', 1, 0.3, 1, 26, 4, 1, 'common', '乾いた土地の小さな丸パン。', []],
  ['bread_roll', '小丸パン', { flour_wheat: 0.3, ale_yeast: 0.05 }, 'baker', 1.5, 0.15, 1, 14, 3, 2, 'inn', '宿で一人に一つ添える小さな丸パン。', []],
  ['bread_milk', '乳パン', { flour_wheat: 0.8, milk: 0.5, ale_yeast: 0.1 }, 'baker', 2, 0.4, 4, 38, 3, 1, 'inn', '乳でこねた柔らかいパン。子どもと年寄りに喜ばれる。', []],
  ['bread_butter', '乳脂パン', { flour_white: 0.6, butter: 0.2, egg: 1 }, 'baker', 2, 0.35, 8, 36, 3, 1, 'noble', '乳脂と卵をたっぷり使った、黄色くて甘いパン。', []],
  ['bread_royal', '王宮の卵パン', { flour_white: 0.6, butter: 0.3, egg: 3, sugar: 0.1 }, 'cook', 3, 0.4, 20, 38, 3, 0, 'royal', '王の朝食のためだけに焼く、金色の柔らかいパン。', [], 1],
  ['bread_honey', '蜂蜜パン', { flour_wheat: 0.8, honey: 0.2 }, 'baker', 2, 0.45, 6, 40, 5, 1, null, '蜂蜜を練りこんだ、甘く日持ちするパン。', [{ k: 'gift', note: '子どもへの土産' }]],
  ['bread_raisin', '干し葡萄パン', { flour_wheat: 0.8, raisins: 0.2 }, 'baker', 2, 0.45, 6, 42, 5, 1, null, '干し葡萄を散らした、祝い事のパン。', [{ k: 'gift' }]],
  ['bread_nut', '胡桃パン', { flour_rye: 0.8, walnut: 0.3 }, 'baker', 2, 0.5, 5, 44, 6, 1, null, '胡桃を練りこんだ黒パン。噛むほどに香る。', []],
  ['bread_seed', '種まぶしのパン', { flour_wheat: 0.8, poppy_seed: 0.1, sesame: 0.1 }, 'baker', 2, 0.45, 4.5, 40, 4, 1, null, '芥子の実と胡麻をまぶして焼いたパン。', []],
  ['bread_herb', '香草パン', { flour_wheat: 0.8, herbs: 0.2 }, 'baker', 2, 0.45, 4, 40, 4, 1, null, '刻んだ香草を練りこんだ香りのよいパン。', []],
  ['bread_onion', '玉葱パン', { flour_wheat: 0.8, onion: 1 }, 'baker', 2, 0.5, 3.5, 42, 3, 1, 'inn', '炒めた玉葱をのせた、酒場の人気のパン。', []],
  ['bread_cheese', '乳酪のせパン', { flour_wheat: 0.8, cheese_hard: 0.2 }, 'baker', 2, 0.5, 6, 46, 3, 1, 'inn', '焼いた乳酪がとろける、腹持ちのよいパン。', []],
  ['bread_garlic', '大蒜パン', { bread: 1, garlic: 0.2, oil_olive: 0.05 }, 'innkeeper', 0.3, 0.5, 4, 42, 2, 1, 'inn', 'パンに大蒜と油を塗って炙った、酒のつまみ。', []],
  ['bread_braid', '祭りの編みパン', { flour_white: 1, egg: 2, butter: 0.2 }, 'baker', 3, 0.7, 12, 60, 4, 1, null, '三つ編みに編んで焼く、祭りと婚礼のパン。', [{ k: 'ritual', note: '祭りの供え物' }, { k: 'gift', note: '婚礼の贈り物' }]],
  ['bread_wedding', '婚礼の大丸パン', { flour_white: 2, egg: 4, honey: 0.3, raisins: 0.3 }, 'baker', 5, 2, 40, 180, 5, 0, null, '婚礼の日に新郎新婦が二人で割る大きな丸パン。', [{ k: 'ritual', note: '婚礼の儀式' }, { k: 'gift' }], 1],
  ['bread_funeral', '弔いのパン', { flour_rye: 1, poppy_seed: 0.1 }, 'baker', 2, 0.5, 4, 40, 6, 0, null, '芥子の実をのせた黒い丸パン。葬儀で参列者に配る。', [{ k: 'ritual', note: '葬儀で配る' }]],
  ['host_wafer', '聖餅', { flour_white: 0.1 }, 'priest', 0.5, 0.02, 1, 1, 60, 1, null, '祭壇で祝福される薄い白い餅。', [{ k: 'ritual', note: '礼拝・聖餐' }], 0, 60, 50],
  ['bread_harvest', '収穫祭の麦束パン', { flour_wheat: 2, egg: 1 }, 'baker', 4, 1.5, 15, 120, 6, 0, null, '麦の束の形に焼き、祭壇に飾ってから皆で分ける。', [{ k: 'ritual', note: '収穫祭の供え物' }, { k: 'collect', note: '祭りの飾り' }]],
  ['hardtack', '堅焼きパン', { flour_wheat: 0.6 }, 'baker', 3, 0.25, 1.5, 24, 365, 2, null, '水気を抜いて石のように固く焼いたパン。一年もつ。', [{ k: 'food', note: '旅・航海・行軍の携行食' }], 0, 20, 40],
  ['ship_biscuit', '船乗りの乾パン', { flour_wheat: 0.5, flour_barley: 0.2 }, 'baker', 3, 0.25, 1.4, 24, 500, 2, null, '四角く二度焼きした航海用の乾パン。虫がわかないよう塩を少し。', [{ k: 'food', note: '航海の携行食' }], 0, 20, 40],
  ['rusk', '二度焼きパン', { bread: 1 }, 'baker', 1, 0.3, 3.5, 36, 60, 1, null, '薄く切ったパンをもう一度焼いた、さくさくのパン。', [{ k: 'medicine', note: '病人・乳飲み子にふやかして与える' }]],
  ['crispbread_rye', 'ライ麦の薄焼き', { flour_rye: 0.5 }, 'baker', 1, 0.2, 1.2, 20, 180, 2, 'common', '穴をあけて乾かした、寒い土地の円い薄焼き。', [], 0, 20],
  ['trencher', '皿パン', { flour_maslin: 0, bread_maslin: 1 }, 'baker', 0, 0.4, 1, 30, 5, 1, 'inn', '四日置いた固いパンを皿にして肉をのせる。食後は施しに。', [{ k: 'tool', note: '皿の代わり' }, { k: 'ritual', note: '食後は貧しい者への施し' }]],
  ['bread_fried', '揚げパン', { flour_wheat: 0.4, lard: 0.1 }, 'household', 0.5, 0.2, 1.5, 22, 2, 2, 'common', '脂で揚げたふくらんだパン。市場の屋台の品。', []],
  ['griddle_cake', '薄焼き菓子パン', { flour_wheat: 0.3, egg: 1, milk: 0.3 }, 'household', 0.5, 0.2, 2, 20, 1, 2, 'common', '卵と乳の生地を鉄板で焼いた薄い菓子パン。', []],
  ['waffle', '格子焼き', { flour_wheat: 0.3, egg: 1, butter: 0.1 }, 'confectioner', 0.5, 0.15, 3, 16, 2, 1, null, '格子模様の鉄型ではさんで焼く。縁日の屋台の品。', [{ k: 'luxury', note: '祭りの楽しみ' }]],
  ['pretzel', '結びパン', { flour_wheat: 0.3, salt: 0.02 }, 'baker', 1, 0.15, 1.2, 14, 4, 2, 'inn', '腕を組んだ形の塩味のパン。麦酒によく合う。', []],
  ['bread_stale', '古パン', { bread: 1 }, 'household', 0, 0.45, 0.5, 30, 20, 1, 'common', '固くなったパン。スープにひたして食べ、残りは家畜へ。', [{ k: 'feed', note: '豚と鶏の餌' }, { k: 'craft', note: 'パン粥・パン屑の材料' }]],
  ['breadcrumbs', 'パン屑', { bread_stale: 1 }, 'household', 0.2, 0.4, 0.4, 20, 60, 1, null, '古パンを砕いたもの。揚げ衣と詰め物に使う。', [{ k: 'craft', note: '衣・詰め物・団子のつなぎ' }, { k: 'feed' }]],
];
for (const [id, name, from, by, t, w, v, food, keep, demand, grade, desc, extra, rare = 0, stack = 10, dm] of BREADS) {
  const f = { ...from }; for (const k in f) if (!f[k]) delete f[k];
  add({ id, name, sub: 'bread', w, v, stack, rare, make: mk(f, by, t), food, keep, demand, grade, use: extra, desc,
    how: 'cook', eatNote: undefined, ...(dm ? {} : {}) });
}

// ---- 粥 ----
const PORR = [
  ['porridge_wheat', '麦粥', { flour_wheat: 0.3 }, 1, 1, 'common', '小麦を水で煮た、いちばん安い朝の粥。', 3],
  ['porridge_barley', '大麦の粥', { groats_barley: 0.4 }, 1, 0.8, 'common', '挽き割り大麦を塩で煮た粥。村の朝ごはん。', 3],
  ['porridge_oat', '燕麦の粥', { flour_oat: 0.3 }, 1, 0.8, 'common', '燕麦を煮たとろりとした粥。寒い朝に体が温まる。', 2],
  ['porridge_oat_milk', '乳入りの燕麦粥', { flour_oat: 0.3, milk: 0.3 }, 1, 1.6, 'common', '燕麦を乳で煮た、子どもの好きな粥。', 2],
  ['porridge_honey', '蜂蜜の粥', { flour_oat: 0.3, milk: 0.3, honey: 0.1 }, 1, 3, 'inn', '乳粥に蜂蜜をかけた、宿の朝の甘い粥。', 1],
  ['porridge_rye', 'ライ麦の粥', { flour_rye: 0.3 }, 1, 0.7, 'common', '酸味のある灰色の粥。北の村の朝食。', 2],
  ['kasha_buckwheat', '蕎麦の実の粥', { groats_buckwheat: 0.4, butter: 0.05 }, 1, 1.4, 'common', '炒った蕎麦の実を煮て乳脂をのせた、灰色谷の粥。', 2],
  ['porridge_millet', '黍の粥', { flour_millet: 0.3 }, 1, 0.8, 'common', '黄色くほろほろした黍の粥。', 1],
  ['porridge_maize', '玉蜀黍の粥', { flour_maize: 0.4 }, 1, 0.9, 'common', '玉蜀黍の粉を練った黄色い粥。', 2],
  ['porridge_pease', '豆の粥', { pea: 0.5 }, 3, 1, 'common', '干し豌豆を一晩煮くずした、どろりとした緑の粥。', 2],
  ['frumenty', '小麦の乳煮', { wheat: 0.4, milk: 0.5, egg: 1 }, 2, 3.5, 'inn', '小麦の粒を乳と卵で煮た、祝い日の粥。', 1],
  ['frumenty_saffron', '番紅花の小麦乳煮', { wheat: 0.4, milk: 0.5, egg: 2, ground_saffron: 0.01, sugar: 0.05 }, 2, 18, 'noble', '番紅花で金色に染めた小麦の乳煮。鹿肉に添える貴族の品。', 0],
  ['porridge_bread', 'パン粥', { bread_stale: 1, milk: 0.3 }, 0.5, 0.8, 'common', '古パンを乳で煮た、やわらかい粥。歯の弱い年寄りに。', 2],
  ['gruel_acorn', '団栗の重湯', { flour_acorn: 0.3 }, 1, 0.3, 'common', '飢えた冬にすする渋い重湯。', 0],
  ['gruel_invalid', '病人の重湯', { flour_oat: 0.2, salt: 0.01 }, 1, 1, null, 'ごく薄く煮た燕麦の重湯。熱のある病人に。', 1],
  ['porridge_blood', '血の粥', { groats_barley: 0.3, animal_blood: 0.3 }, 1, 1, 'common', '屠った日に血と麦で煮る黒い粥。無駄にしない知恵。', 1],
  ['porridge_fruit', '果実の甘粥', { flour_oat: 0.3, milk: 0.3, blueberry: 0.2 }, 1, 2.5, 'inn', '木の実と乳を入れた夏の甘い粥。', 1],
  ['porridge_nut', '木の実の粥', { flour_oat: 0.3, hazelnut: 0.2, honey: 0.05 }, 1, 2.8, null, '砕いた榛の実を入れた香ばしい粥。', 1],
];
for (const [id, name, from, t, v, grade, desc, demand] of PORR) {
  const extra = [];
  if (id === 'gruel_invalid') extra.push({ k: 'medicine', note: '病人の回復食' });
  if (id === 'gruel_acorn') extra.push({ k: 'quest', note: '飢えた村への施し' });
  add({ id, name, sub: 'porridge', w: 0.5, v, stack: 1, make: mk(from, grade === 'noble' ? 'cook' : grade === 'inn' ? 'innkeeper' : 'household', t),
    food: id.startsWith('gruel') ? 14 : 30, drink: 5, keep: 1, demand, grade, use: extra, fx: id === 'gruel_invalid' ? { hp: 4 } : undefined, desc });
}

// ---- 団子・麺 ----
const DUMP = [
  ['dumpling_bread', 'パン団子', { breadcrumbs: 0.3, egg: 1, milk: 0.1 }, 1.2, 'common', 'パン屑を卵でまとめて茹でた団子。煮込みに添える。'],
  ['dumpling_flour', '粉団子', { flour_wheat: 0.3 }, 0.8, 'common', '粉を練って汁に落とした素朴な団子。'],
  ['dumpling_meat', '肉まんじゅう', { flour_wheat: 0.3, meat: 0.2, onion: 0.2 }, 3, 'inn', '刻んだ肉を生地で包んで蒸した、宿の人気の品。'],
  ['dumpling_cheese', '乳酪の包み茹で', { flour_wheat: 0.3, curd: 0.2 }, 2.5, null, '白い乳酪を包んで茹で、乳脂をかけて食べる。'],
  ['dumpling_potato', '芋団子', { potato: 1, flour_wheat: 0.1 }, 1, 'common', 'すりおろした芋の団子。山の村の冬の糧。'],
  ['dumpling_liver', '肝の団子', { liver: 0.3, breadcrumbs: 0.2 }, 2, 'common', '肝を刻んでパン屑でまとめた団子。汁に入れる。'],
  ['noodles_wheat', '小麦の麺', { flour_wheat: 0.4, egg: 1 }, 2, null, '卵で練って細く切った麺。乾かせば日持ちする。'],
  ['noodles_buckwheat', '蕎麦切り', { flour_buckwheat: 0.4 }, 2, 'common', '灰色谷で打つ灰色の麺。茹でて汁で食べる。'],
];
for (const [id, name, from, v, grade, desc] of DUMP) {
  add({ id, name, sub: 'dumpling', w: 0.3, v, stack: 5, make: mk(from, grade === 'inn' ? 'innkeeper' : 'household', 1), food: 26, keep: id.startsWith('noodles') ? 60 : 2,
    demand: 2, grade, tribe: id === 'noodles_buckwheat' ? 'hollin' : undefined, desc });
}
