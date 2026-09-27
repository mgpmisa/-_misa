// 飲み物：水・果汁・茶・薬草茶・麦酒・葡萄酒・蜂蜜酒・林檎酒・蒸留酒
const { add, mk } = require('./h');

// ---- 水 ----
const WATER = [
  ['cactus_water', '仙人掌の水', [{ how: 'forage', on: ['desert'], rate: 0.3 }], 0.5, 0, '砂海の仙人掌を割って搾った、ぬるく青臭い水。命をつなぐ。', 'grove', [{ k: 'quest', note: '砂漠で遭難した者の救い' }]],
];
for (const [id, name, src, v, demand, desc, limit, extra] of WATER) {
  add({ id, name, sub: 'water', w: 1, v, stack: 5, src, drink: 30, keep: id === 'holyspring' ? 30 : 7, demand, limit, use: extra, desc });
}
add({ id: 'birch_sap', name: '白樺の樹液', sub: 'water', w: 1, v: 0.6, stack: 5, src: [{ how: 'forage', on: ['forest', 'snow'], rate: 0.3 }], drink: 25, food: 2, keep: 3, demand: 1, limit: 'grove',
  use: [{ k: 'medicine', note: '春の体の毒を流す' }, { k: 'craft', note: '白樺の酒・煮詰めて蜜' }], desc: '春先に白樺の幹に穴をあけて集める、ほのかに甘い水。' });
add({ id: 'maple_sap', name: '楓の樹液', sub: 'water', w: 1, v: 0.5, stack: 5, src: [{ how: 'forage', on: ['forest'], rate: 0.3 }], drink: 25, food: 2, keep: 3, demand: 0, limit: 'grove',
  use: [{ k: 'craft', note: '煮詰めて楓の蜜にする' }], desc: '早春に楓からしたたる甘い樹液。' });
add({ id: 'coconut_water', name: '椰子の実の水', sub: 'juice', w: 1, v: 0.8, stack: 5, src: [{ how: 'forage', on: ['beach', 'jungle'], rate: 0.4 }], drink: 25, food: 3, keep: 5, demand: 1, limit: 'grove',
  tribe: 'mahina', use: [{ k: 'medicine', note: '熱の病で渇いた体に' }], desc: '若い椰子の実を割ると出てくる甘い水。' });

// ---- 果汁・甘い飲み物 ----
const JUICE = [
  ['juice_apple', '林檎の搾り汁', { apple: 2 }, 1, 2], ['juice_grape', '葡萄の搾り汁', { grape: 2 }, 1.5, 1], ['juice_pear', '梨の搾り汁', { pear: 2 }, 1, 1],
  ['juice_cherry', '桜桃の汁', { cherry: 1 }, 2, 1], ['juice_berry', '森苺の汁', { raspberry: 0.5, blueberry: 0.5 }, 1.5, 1], ['juice_orange', '橙の搾り汁', { orange: 2 }, 2.5, 1],
  ['juice_pomegranate', '石榴の汁', { pomegranate: 2 }, 3, 0], ['juice_carrot', '人参の搾り汁', { carrot: 2 }, 0.6, 0], ['juice_date', 'ナツメヤシの甘汁', { date: 1 }, 1.5, 1, 'nefer'],
  ['juice_grape_unripe', '未熟葡萄の酸汁', { grape: 2 }, 1.2, 1],
];
for (const [id, name, from, v, demand, tribe] of JUICE) {
  const sour = id === 'juice_grape_unripe';
  add({ id, name, sub: 'juice', w: 1, v, stack: 5, make: mk(from, 'household', 0.3), drink: sour ? 5 : 25, food: sour ? 1 : 4, keep: 2, demand, tribe,
    use: sour ? [{ k: 'craft', note: '酢の代わりに料理の酸味' }] : [{ k: 'luxury', note: '暑い日の楽しみ' }, { k: 'craft', note: '酒の仕込み' }],
    desc: sour ? '熟す前の葡萄を搾った酸っぱい汁。料理に酸味を足す。' : `${name.replace(/の(搾り)?汁|の甘汁/, '')}を搾ったばかりの甘い汁。すぐに酒になりかけるので早く飲む。` });
}
const SWEETDRINK = [
  ['citron_water', '香橙の蜂蜜水', { citron: 0.3, honey: 0.05, springwater: 1 }, 3, 1, '香橙を搾って蜂蜜で甘くした水。夏の貴族の飲み物。', 'noble'],
  ['rosehip_drink', '野薔薇の実の飲み物', { rosehip: 0.3, honey: 0.05 }, 1.5, 1, '野薔薇の赤い実を煮出した甘酸っぱい飲み物。冬の風邪よけ。'],
  ['almond_milk', '巴旦杏の乳', { almond: 0.3, springwater: 1 }, 5, 1, '巴旦杏をすりつぶして漉した白い飲み物。肉と乳を断つ斎日に乳の代わりにする。', 'noble'],
  ['honey_water', '蜂蜜水', { honey: 0.05, freshwater: 1 }, 1, 2, '蜂蜜を水に溶いただけの甘い飲み物。働き手の疲れをとる。'],
  ['hot_milk_honey', '蜂蜜入りの温め乳', { milk: 0.5, honey: 0.03 }, 1.5, 2, '温めた乳に蜂蜜を溶かしたもの。眠れない夜に。'],
  ['posset', '麦酒入りの乳酒', { milk: 0.5, ale: 0.3, sugar: 0.02 }, 2.5, 1, '熱い乳に麦酒を注いで固まりかけたところを飲む、風邪の夜の飲み物。'],
  ['caudle', '卵と葡萄酒の粥飲み', { wine_white: 0.3, egg: 1, flour_oat: 0.05, sugar: 0.02 }, 4, 0, '葡萄酒と卵と燕麦を温めた、産後の女性や病人の滋養の飲み物。', 'noble'],
  ['cacao_bitter', '苦い神の飲み物', { cacao: 0.1, chili: 0.01, springwater: 1 }, 6, 1, 'カカオの豆を砕いて唐辛子と泡立てた、ミクトラ族が客に最初に出す飲み物。', null, 'mictla'],
  ['cacao_sweet_drink', '甘い豆の飲み物', { cacao_paste: 0.1, sugar: 0.05, milk: 0.5 }, 15, 0, '密林の豆の練り物を乳と砂糖で溶いた、王国の貴婦人に流行りの飲み物。', 'noble'],
  ['cacao_spiced', '香辛料の豆の飲み物', { cacao_paste: 0.1, ground_cinnamon: 0.005, vanilla_pod: 0.1, honey: 0.05 }, 30, 0, '豆の飲み物に肉桂と香り莢を加えた、王宮の朝の一杯。', 'royal'],
  ['barley_water', '麦湯', { barley: 0.05, freshwater: 1 }, 0.3, 2, '炒った大麦を煮出した香ばしい湯。夏の畑で冷まして飲む。'],
  ['acorn_drink', '炒り団栗の湯', { acorn: 0.1, freshwater: 1 }, 0.2, 0, '団栗を炒って煮出した、苦い黒い湯。茶の買えない者の飲み物。'],
  ['dandelion_drink', '蒲公英の根の湯', { dandelion: 0.05, freshwater: 1 }, 0.4, 0, '蒲公英の根を炒って煮出した苦い湯。肝によいと言われる。'],
  ['maple_syrup_drink', '楓蜜の湯', { maple_syrup: 0.03, freshwater: 1 }, 1, 0, '楓の蜜を湯に溶いた、北の森の冬の飲み物。'],
];
for (const [id, name, from, v, demand, desc, grade, tribe] of SWEETDRINK) {
  const u = [];
  if (id.startsWith('cacao')) u.push({ k: 'luxury', note: '気分が上がる' }, { k: 'gift', note: '客のもてなし' });
  if (id === 'cacao_bitter') u.push({ k: 'ritual', note: '日の頂の祭りの供え物' });
  if (['rosehip_drink', 'caudle', 'posset', 'hot_milk_honey', 'dandelion_drink'].includes(id)) u.push({ k: 'medicine', note: id === 'hot_milk_honey' ? 'よく眠れる' : '病人と風邪に' });
  if (id === 'almond_milk') u.push({ k: 'craft', note: '斎日の料理と菓子の材料' });
  if (id === 'honey_water') u.push({ k: 'luxury', note: '疲れがとれる' });
  add({ id, name, sub: id.startsWith('cacao') ? 'cacao' : 'drink', w: 1, v, stack: 5, rare: grade === 'royal' ? 2 : grade === 'noble' || tribe ? 1 : 0, make: mk(from, grade ? 'cook' : 'household', 0.5),
    drink: 25, food: ['caudle', 'almond_milk', 'posset'].includes(id) ? 10 : 3, keep: ['barley_water', 'acorn_drink', 'dandelion_drink'].includes(id) ? 2 : 1, demand, grade, tribe, use: u,
    fx: id === 'hot_milk_honey' ? { sleep: 5 } : id.startsWith('cacao') ? { mood: grade === 'royal' ? 8 : 4 } : ['caudle', 'posset', 'rosehip_drink'].includes(id) ? { hp: 2 } : undefined, desc });
}

// ---- 茶 ----
const TEA = [
  ['tea_green', '緑の茶', { tea_leaf: 0.01 }, 2, 1, '東の山から隊商が運ぶ茶の葉を淹れた、青い香りの茶。', null, 1],
  ['tea_black', '黒い茶', { tea_leaf: 0.01 }, 3, 1, '茶の葉を発酵させて乾かした、赤黒い茶。貴族の午後の楽しみ。', 'noble', 1],
  ['tea_brick_brewed', '固め茶の煮出し', { tea_brick: 0.02 }, 1.5, 1, '固めた茶を削って煮出した、渋くて濃い旅の茶。', null, 0],
  ['tea_butter', '乳脂の塩茶', { tea_brick: 0.02, butter: 0.02, salt: 0.005 }, 2, 1, '固め茶に乳脂と塩を入れて搗いた、寒い高地の滋養の茶。', null, 0],
  ['tea_spiced', '香辛料の茶', { tea_leaf: 0.01, milk: 0.2, ground_spice_sweet: 0.005 }, 5, 0, '黒い茶を乳と香辛料で煮た甘い茶。', 'noble', 1],
  ['tea_royal', '王宮の白銀の茶', { tea_silver_tip: 0.01, springwater: 1 }, 25, 0, '若芽の先だけを摘んだ銀色の茶葉を、泉の水で淹れた王の茶。', 'royal', 2],
  ['tea_mint_desert', '砂海の薄荷茶', { tea_leaf: 0.01, mint: 0.02, sugar: 0.02 }, 2, 1, '緑の茶に薄荷と砂糖をたっぷり入れた、砂海の民のもてなしの茶。', null, 0, 'nefer'],
];
for (const [id, name, from, v, demand, desc, grade, rare, tribe] of TEA) {
  add({ id, name, sub: 'tea', w: 0.5, v, stack: 5, rare, make: mk(from, grade ? 'cook' : 'household', 0.2), drink: 25, keep: 1, demand, grade, tribe,
    use: [{ k: 'luxury', note: '気分が落ち着く' }, { k: 'gift', note: '客のもてなし' }], fx: { mood: grade === 'royal' ? 6 : 2 }, desc });
}
add({ id: 'tea_brick', name: '固め茶', sub: 'tea', w: 0.5, v: 12, stack: 10, rare: 1, make: mk({ tea_leaf: 0.5 }, 'herbalist', 24), trade: true, food: 0, drink: 1, noEat: true, demand: 1,
  use: [{ k: 'trade', note: '隊商の運ぶ品。草原ではお金の代わりにもなる' }, { k: 'craft', note: '削って煮出す' }], desc: '茶の葉を蒸して板のように固めたもの。何年ももち、遠くへ運べる。' });

// 薬草茶 [id, 名前, 材料, 効き目, 効き目のことば, 需要]
const HTEA = [
  ['tea_mint', '薄荷の茶', 'mint', { mood: 2 }, '胃をすっきりさせる', 2], ['tea_chamomile', '加密列の茶', 'chamomile', { sleep: 4 }, '眠りを誘い、心を静める', 2],
  ['tea_linden', '菩提樹の花の茶', 'linden_flower', { sleep: 3 }, '熱を下げ、心を和らげる', 1], ['tea_nettle', '刺草の茶', 'nettle', { hp: 1 }, '血を増やす', 1],
  ['tea_rosehip', '野薔薇の実の茶', 'rosehip', { hp: 1 }, '冬の風邪を防ぐ', 1], ['tea_sage', '鼠尾草の茶', 'sage', { hp: 1 }, 'のどの腫れに', 1],
  ['tea_thyme', '立麝香草の茶', 'thyme', { hp: 2 }, '咳を鎮める', 1], ['tea_lemonbalm', '香水薄荷の茶', 'lemon_balm', { mood: 3 }, '憂いを晴らす', 1],
  ['tea_elderflower', '接骨木の花の茶', 'elderflower', { hp: 2 }, '汗を出して熱を下げる', 1], ['tea_pine', '松葉の茶', 'pine_needle', { hp: 1 }, '冬の歯ぐきの病を防ぐ', 1],
  ['tea_birchleaf', '白樺の葉の茶', 'birch_leaf', { hp: 1 }, '体のむくみをとる', 0], ['tea_yarrow', '鋸草の茶', 'yarrow', { hp: 2 }, '傷の血を止め、熱を下げる', 1],
  ['tea_valerian', '吉草根の湯', 'valerian', { sleep: 6 }, '深く眠れる（臭いが強い）', 1], ['tea_ginger', '生姜湯', 'ginger', { warmth: 4 }, '体を芯から温める', 2],
  ['tea_fennel', '茴香の茶', 'fennel', { hp: 1 }, '腹の張りを治す', 1], ['tea_lavender', '薫衣草の茶', 'lavender', { sleep: 3, mood: 2 }, '頭痛を和らげる', 1],
  ['tea_heather', '石楠花草の茶', 'heather', { mood: 1 }, '疲れた足を癒やす', 0], ['tea_willow', '柳の樹皮の煎じ湯', 'willow_bark', { hp: 3 }, '痛みと熱を和らげる', 1],
  ['tea_wormwood', '苦艾の煎じ湯', 'wormwood', { hp: 2 }, '腹の虫を下す（とても苦い）', 0], ['tea_dandelion', '蒲公英の葉の茶', 'dandelion', { hp: 1 }, '肝を助ける', 0],
  ['tea_spruce', '樅の若芽の茶', 'spruce_tip', { warmth: 2 }, '雪原の民の冬の青物代わり', 1, 'yarvi'], ['tea_rose', '薔薇の花びらの茶', 'rose_petal', { mood: 4 }, '心を華やがせる（貴婦人の茶）', 0],
  ['tea_starnight', '星夜の茶', 'moonflower', { sleep: 3, mood: 3 }, '星写しの夜に飲む、夢見のよい茶', 0, 'elda'], ['tea_forestleaf', '森の葉の茶', 'herbs', { hp: 1 }, 'フィアナの民の旅立ちの茶', 1, 'fianna'],
  ['tea_herbs', '薬草茶', 'herbs', { hp: 2 }, '薬師が体に合わせて調合する', 2],
];
for (const [id, name, herb, fx, note, demand, tribe] of HTEA) {
  add({ id, name, sub: 'herbtea', w: 0.5, v: ['tea_rose', 'tea_starnight'].includes(id) ? 4 : 0.8, stack: 5, rare: tribe === 'elda' ? 1 : 0, make: mk({ [herb]: 0.03, freshwater: 1 }, id === 'tea_herbs' || id === 'tea_willow' || id === 'tea_valerian' ? 'herbalist' : 'household', 0.2),
    drink: 25, keep: 1, demand, tribe, use: [{ k: 'medicine', note }, { k: 'luxury', note: '心が落ち着く' }], fx, desc: `${name.replace(/の(茶|湯|煎じ湯)$|湯$/, '')}を湯で煮出したもの。${note}。` });
}

// ---- 麦酒 ----
// [id, 名前, 材料, 作り手, 日数(時間), 値, 酔い, 日持ち, 需要, 説明, 格, 民族, 希少]
const ALE = [
  ['ale', '麦酒', { malt_barley: 0.3, hops: 0.02 }, 'brewer', 72, 2, 0.15, 30, 3, '酒場で出るふつうの麦酒。働いたあとの一杯。'],
  ['ale_small', '薄い麦酒', { malt_barley: 0.1 }, 'household', 48, 0.5, 0.05, 10, 3, '二番搾りの薄い麦酒。子どもも水代わりに飲む。', 'common'],
  ['ale_dark', '黒麦酒', { malt_barley: 0.3, malt_dark: 0.1, hops: 0.02 }, 'brewer', 96, 3, 0.2, 60, 2, '焦がし麦芽で黒く苦い麦酒。港の男たちが好む。'],
  ['ale_pale', '淡い麦酒', { malt_barley: 0.3, hops: 0.04 }, 'brewer', 96, 3, 0.15, 45, 2, '明るい金色の、苦みの強い麦酒。'],
  ['ale_strong', '強い麦酒', { malt_barley: 0.5, hops: 0.03 }, 'brewer', 240, 5, 0.35, 180, 1, '倍の麦芽で醸して冬まで寝かせた、甘く強い麦酒。'],
  ['ale_wheat', '小麦の白麦酒', { malt_wheat: 0.3 }, 'brewer', 48, 2.5, 0.12, 14, 2, '小麦で醸した白く濁った麦酒。夏の飲み物。'],
  ['ale_oat', '燕麦の麦酒', { flour_oat: 0.2, malt_barley: 0.1 }, 'brewer', 72, 2, 0.12, 20, 1, 'なめらかな口あたりの燕麦の麦酒。'],
  ['ale_rye', 'ライ麦の麦酒', { flour_rye: 0.2, malt_barley: 0.1 }, 'brewer', 72, 2, 0.15, 30, 1, '赤みがかった、少し酸っぱいライ麦の麦酒。'],
  ['ale_honey', '蜂蜜の麦酒', { malt_barley: 0.3, honey: 0.05 }, 'brewer', 96, 4, 0.2, 60, 1, '蜂蜜を加えて醸した、甘い香りの麦酒。'],
  ['ale_heather', '石楠花草の麦酒', { malt_barley: 0.3, heather: 0.05 }, 'brewer', 96, 3.5, 0.15, 45, 1, '苦み草のかわりに花咲く石楠花草で香りづけした、丘の民の麦酒。'],
  ['ale_gruit', '香草麦酒', { malt_barley: 0.3, herbs: 0.05 }, 'brewer', 96, 2.5, 0.15, 30, 1, '苦み草がない土地で、香草を合わせて醸す古い麦酒。'],
  ['ale_juniper', '杜松の麦酒', { malt_barley: 0.3, juniper_berry: 0.02 }, 'brewer', 96, 3, 0.18, 45, 1, '杜松の枝で漉して醸す、森の香りの麦酒。'],
  ['ale_spruce', '樅の新芽の麦酒', { malt_barley: 0.2, spruce_tip: 0.05 }, 'brewer', 72, 2.5, 0.12, 30, 1, '樅の若芽で醸す、雪原の民の麦酒。冬の病を防ぐ。', null, 'yarvi'],
  ['ale_smoked', '燻し麦酒', { malt_barley: 0.3, hops: 0.02 }, 'brewer', 96, 3, 0.18, 60, 1, '麦芽を焚き火の煙で乾かした、燻製のような香りの麦酒。'],
  ['ale_spiced', '香辛料の温め麦酒', { ale: 1, ground_spice_sweet: 0.005, honey: 0.03 }, 'innkeeper', 0.5, 3.5, 0.15, 1, 1, '麦酒を香辛料と蜂蜜で温めた、冬の酒場の一杯。', 'inn'],
  ['barley_wine', '大麦の古酒', { malt_barley: 0.8, hops: 0.04 }, 'brewer', 720, 12, 0.5, 1000, 0, '麦芽を三倍使って一年寝かせた、葡萄酒ほど強い麦の酒。', 'noble', null, 1],
  ['ale_monastery', '修道院の麦酒', { malt_barley: 0.4, hops: 0.03 }, 'priest', 240, 5, 0.25, 180, 1, '修道士が断食の間の糧として醸す、濃くて栄養のある麦酒。', null, null, 1],
  ['ale_house', '宿自慢の麦酒', { malt_barley: 0.35, hops: 0.03 }, 'innkeeper', 96, 3, 0.18, 45, 2, '宿の主人が裏で醸す、その宿でしか飲めない麦酒。', 'inn'],
  ['ale_noble', '貴族の熟成麦酒', { malt_barley: 0.5, hops: 0.04, honey: 0.03 }, 'brewer', 480, 10, 0.3, 365, 0, '館の地下蔵で半年寝かせた、琥珀色に澄んだ麦酒。', 'noble', null, 1],
  ['ale_royal', '王宮の祝い麦酒', { malt_barley: 0.6, hops: 0.04, honey: 0.1 }, 'brewer', 720, 30, 0.35, 720, 0, '戴冠と王子の誕生の年にだけ仕込む、王家の紋の樽の麦酒。', 'royal', null, 2],
  ['ale_ration', '兵の配給麦酒', { malt_barley: 0.15 }, 'brewer', 48, 0.8, 0.08, 14, 2, '兵舎で一日一杯配られる薄い麦酒。士気を保つ。'],
  ['ale_harvest', '収穫祭の麦酒', { malt_barley: 0.4, honey: 0.05 }, 'brewer', 96, 3, 0.25, 30, 1, '新しい麦で真っ先に醸し、祭りの広場で樽をあける麦酒。'],
  ['ale_buckwheat', '蕎麦の麦酒', { groats_buckwheat: 0.3 }, 'brewer', 72, 2, 0.15, 30, 1, '灰色谷で蕎麦から醸す、黒っぽい素朴な酒。', null, 'hollin'],
  ['ale_maize', '玉蜀黍の酒', { maize: 0.4 }, 'brewer', 72, 1.5, 0.12, 7, 1, '玉蜀黍を噛んで吐き戻して醸す、ミクトラ族の濁り酒。', null, 'mictla'],
  ['ale_millet', '黍の濁り酒', { millet: 0.4 }, 'brewer', 72, 1.2, 0.12, 7, 1, '黍を煮て醸す酸っぱい濁り酒。草原の祭りで回し飲みする。'],
  ['kvass', '黒パンの酸い飲み物', { bread_black: 0.5 }, 'household', 48, 0.6, 0.02, 7, 2, '黒パンを水に浸して醸した、ほとんど酔わない酸っぱい飲み物。'],
];
for (const [id, name, from, by, t, v, drunk, keep, demand, desc, grade, tribe, rare = 0] of ALE) {
  const u = [{ k: 'luxury', note: '気分が上がる・宴の酒' }];
  if (['ale_harvest', 'ale_royal', 'ale_maize', 'ale_millet'].includes(id)) u.push({ k: 'ritual', note: '祭り' });
  if (['ale', 'ale_strong', 'ale_dark', 'barley_wine'].includes(id)) u.push({ k: 'trade', note: '樽で売る' });
  if (id === 'ale_ration') u.push({ k: 'quest', note: '兵の士気を保つ' });
  if (id === 'ale_monastery') u.push({ k: 'food', note: '断食中の糧' });
  if (id === 'ale_spruce') u.push({ k: 'medicine', note: '冬の病を防ぐ' });
  add({ id, name, sub: 'ale', w: 1, v, stack: 5, rare, make: mk(from, by, t), how: 'brew', drink: 20, food: id === 'ale_monastery' ? 8 : 3, keep, demand, grade, tribe, use: u,
    fx: { drunk, mood: Math.round(drunk * 10) + 1 }, desc });
}

// ---- 葡萄酒・果実酒 ----
const WINE = [
  ['wine_red', '赤葡萄酒', { grape: 3 }, 'vintner', 4, 0.3, 720, 2, '葡萄を皮ごと醸した赤い酒。町の食卓の酒。'],
  ['wine_white', '白葡萄酒', { grape: 3 }, 'vintner', 4, 0.3, 540, 2, '皮を除いて醸した淡い金色の酒。魚料理に合う。'],
  ['wine_rose', '薄紅の葡萄酒', { grape: 3 }, 'vintner', 4.5, 0.28, 365, 1, '皮を短い間だけ漬けた、薄紅色の軽い酒。'],
  ['wine_new', '新酒', { grape: 3 }, 'vintner', 3, 0.25, 60, 2, '秋に仕込んだばかりの、甘く若い葡萄酒。祭りで皆が飲む。'],
  ['wine_table', '並の葡萄酒', { grape: 2, freshwater: 0.5 }, 'vintner', 2, 0.22, 365, 2, '水でのばして樽から量り売りする、ありふれた葡萄酒。', 'common'],
  ['piquette', '搾りかすの水割り酒', { grape_pomace: 1, freshwater: 1 }, 'vintner', 0.5, 0.08, 30, 1, '搾りかすに水を足して醸した、葡萄畑の働き手の酒。', 'common'],
  ['wine_inn', '宿の葡萄酒', { grape: 3 }, 'innkeeper', 3, 0.28, 365, 2, '宿が樽で買い付けて水差しで出す葡萄酒。', 'inn'],
  ['wine_aged_noble', '十年寝かせの赤', { wine_red: 1 }, 'vintner', 30, 0.35, 0, 0, '館の地下で十年寝かせた、深い色の赤葡萄酒。', 'noble', 1],
  ['wine_royal_vintage', '王家の秘蔵葡萄酒', { wine_red: 1 }, 'vintner', 120, 0.35, 0, 0, '当たり年の葡萄だけを王家の蔵で五十年寝かせた、国に数本しかない酒。', 'royal', 3],
  ['wine_noble_rot', '貴い腐れの甘葡萄酒', { grape: 6 }, 'vintner', 40, 0.3, 0, 0, '霧で縮んだ葡萄からわずかに搾る、黄金色の甘露。', 'noble', 2],
  ['wine_ice', '氷の葡萄酒', { grape: 6 }, 'vintner', 45, 0.28, 0, 0, '木の上で凍った葡萄を夜明けに摘んで搾る、とても甘い酒。', 'noble', 2],
  ['wine_fortified', '強めの葡萄酒', { wine_red: 1, brandy_grape: 0.2 }, 'vintner', 8, 0.45, 0, 1, '火酒を足して強くし、長い船旅にも耐える葡萄酒。', null, 0],
  ['wine_mulled', '香料の温め葡萄酒', { wine_red: 1, ground_spice_sweet: 0.005, honey: 0.05 }, 'innkeeper', 5, 0.25, 1, 1, '赤葡萄酒を香辛料と蜂蜜で温めた、冬の広場の酒。', 'inn'],
  ['hippocras', '香辛料の甘葡萄酒', { wine_red: 1, sugar: 0.1, ground_spice_sweet: 0.02 }, 'cook', 20, 0.3, 90, 0, '葡萄酒に砂糖と香辛料を漬けて袋で漉した、宴の終わりの酒。', 'noble', 1],
  ['wine_sparkling', '泡立つ葡萄酒', { wine_white: 1, sugar: 0.02 }, 'vintner', 40, 0.3, 720, 0, '瓶の中で二度醸して泡を閉じこめた、祝いの酒。栓が飛ぶ。', 'noble', 2],
  ['wine_resin', '松脂の葡萄酒', { grape: 3, pine_resin: 0.05 }, 'vintner', 3, 0.3, 365, 1, '松脂で封をした甕で醸した、独特の香りの葡萄酒。'],
  ['wine_raisin', '干し葡萄の酒', { raisins: 1 }, 'vintner', 6, 0.35, 720, 0, '干し葡萄から醸す濃く甘い酒。'],
  ['wine_temple', '聖餐の葡萄酒', { wine_red: 1 }, 'priest', 6, 0.3, 720, 1, '司祭が祝福した赤葡萄酒。礼拝で一口ずつ分け合う。', null, 0],
  ['wine_cherry', '桜桃の酒', { cherry: 3, sugar: 0.1 }, 'vintner', 4, 0.25, 365, 1, '桜桃で醸した赤い果実酒。'],
  ['wine_plum', '李の酒', { plum: 3, sugar: 0.1 }, 'vintner', 3.5, 0.25, 365, 1, '李を醸した甘酸っぱい酒。'],
  ['wine_blackberry', '黒木苺の酒', { blackberry: 3, honey: 0.1 }, 'household', 3, 0.22, 365, 1, '垣根の黒木苺で家ごとに醸す酒。'],
  ['wine_elderberry', '接骨木の実の酒', { elderberry: 3, honey: 0.1 }, 'household', 3, 0.22, 365, 1, '黒い接骨木の実の酒。冬の咳に効くという。'],
  ['wine_elderflower', '接骨木の花の酒', { elderflower: 0.3, honey: 0.2 }, 'household', 3, 0.15, 180, 1, '白い花の香りの軽い酒。初夏に仕込む。'],
  ['wine_dandelion', '蒲公英の酒', { dandelion: 0.5, honey: 0.2 }, 'household', 2.5, 0.18, 365, 0, '蒲公英の花だけを摘んで醸す、黄色い春の酒。'],
  ['wine_rose_petal', '薔薇の酒', { rose_petal: 0.5, wine_white: 1 }, 'cook', 25, 0.25, 365, 0, '薔薇の花びらを白葡萄酒に漬けた、貴婦人の酒。', 'noble', 1],
  ['wine_pomegranate', '石榴の酒', { pomegranate: 3 }, 'vintner', 8, 0.25, 365, 0, '石榴の赤い粒から醸す、宝石色の酒。', null, 1],
  ['wine_fig', '無花果の酒', { fig: 3 }, 'vintner', 5, 0.25, 365, 0, '無花果の甘く重い酒。'],
  ['wine_date', 'ナツメヤシの酒', { date: 2 }, 'vintner', 3, 0.3, 365, 1, 'ナツメヤシの実から醸す、砂海の甘い酒。', null, 0, 'nefer'],
  ['wine_palm', '椰子の樹液酒', { palm_sap: 1 }, 'household', 1.5, 0.12, 3, 1, '椰子の花房から垂れる樹液が一晩で酒になる。マヒナの民の日々の酒。', null, 0, 'mahina'],
  ['wine_birch', '白樺酒', { birch_sap: 2, honey: 0.1 }, 'household', 2, 0.12, 60, 0, '白樺の樹液を醸した、春の森の軽い酒。', null, 0, 'fianna'],
  ['wine_lingonberry', '苔桃の酒', { lingonberry: 3, honey: 0.1 }, 'household', 3, 0.2, 365, 1, '雪原の苔桃で醸す酸っぱい赤い酒。', null, 0, 'yarvi'],
  ['wine_cask', '葡萄酒の樽', { wine_red: 40 }, 'vintner', 150, 0.3, 720, 1, '赤葡萄酒をいっぱいに詰めた大樽。酒場と館への卸しに。'],
  ['ale_cask', '麦酒の樽', { ale: 40 }, 'brewer', 70, 0.15, 30, 1, '麦酒をいっぱいに詰めた樽。酒場は一日に一樽あける。'],
];
for (const [id, name, from, by, v, drunk, keep, demand, desc, grade, rare = 0, tribe] of WINE) {
  const cask = id.endsWith('_cask');
  const u = [{ k: 'luxury', note: '気分が上がる・宴の酒' }];
  if (cask) u.push({ k: 'trade', note: '酒場と館への卸し' }, { k: 'ritual', note: '祭りの振る舞い酒' });
  if (grade === 'noble' || grade === 'royal' || rare >= 1) u.push({ k: 'gift', note: '身分の高い人への贈り物' });
  if (rare >= 2) u.push({ k: 'collect', note: '年代物を集める趣味' });
  if (['wine_temple'].includes(id)) u.push({ k: 'ritual', note: '礼拝・聖餐' });
  if (['wine_new', 'wine_palm'].includes(id)) u.push({ k: 'ritual', note: '祭り' });
  if (['wine_elderberry', 'wine_fortified'].includes(id)) u.push({ k: 'medicine', note: id === 'wine_elderberry' ? '冬の咳に' : '船旅の気つけ' });
  if (['wine_red', 'wine_white', 'wine_fortified', 'wine_date'].includes(id)) u.push({ k: 'trade' });
  if (id === 'wine_red' || id === 'wine_white') u.push({ k: 'craft', note: '料理と酢の材料' });
  add({ id, name, sub: cask ? 'cask' : 'wine', w: cask ? 45 : 1, v, stack: cask ? 1 : 5, rare, make: mk(from, by, cask ? 2 : grade === 'royal' ? 8760 : grade === 'noble' && by === 'vintner' ? 2160 : 240), how: 'brew',
    drink: cask ? 800 : 20, food: 2, keep: keep || undefined, demand, grade, tribe,
    loot: rare >= 2 && !cask ? ['dungeon', 'demoncastle'] : undefined, use: u, fx: { drunk, mood: Math.round(drunk * 12) + (grade === 'royal' ? 6 : grade === 'noble' ? 3 : 1) }, desc });
}

// ---- 蜂蜜酒・林檎酒 ----
const MEAD = [
  ['mead', '蜂蜜酒', { honey: 0.4, freshwater: 1 }, 'brewer', 5, 0.3, 720, 2, '蜂蜜を水で割って醸した、古くからある金色の酒。'],
  ['mead_sweet', '甘い蜂蜜酒', { honey: 0.6, freshwater: 1 }, 'brewer', 7, 0.28, 720, 1, '蜂蜜を多めにした、とろりと甘い蜂蜜酒。'],
  ['mead_dry', '辛口の蜂蜜酒', { honey: 0.3, freshwater: 1 }, 'brewer', 5, 0.32, 720, 1, '甘みが残らないまで醸しきった蜂蜜酒。'],
  ['mead_spiced', '香料の蜂蜜酒', { honey: 0.4, freshwater: 1, ground_spice_sweet: 0.01 }, 'brewer', 9, 0.3, 720, 1, '香辛料と香草を漬けた、薬にもなる蜂蜜酒。'],
  ['mead_berry', '苺の蜂蜜酒', { honey: 0.3, raspberry: 0.5, freshwater: 1 }, 'brewer', 7, 0.28, 540, 1, '木苺と一緒に醸した紅色の蜂蜜酒。'],
  ['mead_apple', '林檎の蜂蜜酒', { honey: 0.3, juice_apple: 1 }, 'brewer', 6, 0.28, 540, 1, '林檎の搾り汁と蜂蜜で醸した酒。'],
  ['mead_grape', '葡萄の蜂蜜酒', { honey: 0.3, juice_grape: 1 }, 'brewer', 8, 0.3, 720, 0, '葡萄の汁と蜂蜜の酒。昔の貴族が好んだ。'],
  ['mead_heather', '石楠花草の蜂蜜酒', { honey_heather: 0.4, freshwater: 1 }, 'brewer', 8, 0.3, 720, 0, '石楠花草の蜜だけで醸した、濃い琥珀色の酒。'],
  ['braggot', '麦と蜜の酒', { honey: 0.2, malt_barley: 0.2, freshwater: 1 }, 'brewer', 4, 0.25, 180, 1, '麦酒と蜂蜜酒のあいだの酒。'],
  ['mead_forest', '森の蜜酒', { honey_forest: 0.4, springwater: 1 }, 'brewer', 12, 0.3, 720, 1, 'フィアナの民が木のうろで醸す、濃く野生の香りの蜂蜜酒。', null, 1, 'fianna'],
  ['mead_royal', '王家の黄金蜂蜜酒', { honey_linden: 0.6, springwater: 1, ground_saffron: 0.005 }, 'brewer', 60, 0.3, 0, 0, '菩提樹の蜜と番紅花で醸した、王の即位の酒。', 'royal', 2],
  ['mead_wedding', '婚礼の蜜酒', { honey: 0.5, freshwater: 1 }, 'brewer', 10, 0.3, 720, 1, '新郎新婦がひと月のあいだ毎晩飲む蜜酒。子宝を授かるという。'],
  ['mead_offering', '生贄の儀の蜜酒', { honey_forest: 0.5, springwater: 1, herbs: 0.05 }, 'shaman', 15, 0.35, 720, 0, '奥地の民が守り神への儀式の前に飲み、残りを祠に注ぐ濃い蜜酒。', null, 1],
  ['cider', '林檎酒', { apple: 3 }, 'brewer', 2.5, 0.18, 180, 2, '林檎を搾って醸した酒。林檎の村の日々の酒。'],
  ['cider_sweet', '甘い林檎酒', { apple: 3, honey: 0.05 }, 'brewer', 3, 0.15, 120, 1, '醸しを早めに止めた、甘い林檎酒。'],
  ['cider_dry', '辛口の林檎酒', { apple: 3 }, 'brewer', 3, 0.2, 240, 1, '渋い林檎で醸した、きりっと辛い林檎酒。'],
  ['perry', '梨酒', { pear: 3 }, 'brewer', 3.5, 0.18, 180, 1, '梨を搾って醸した、淡く香る酒。'],
  ['cider_quince', '榲桲酒', { quince: 3 }, 'brewer', 5, 0.18, 240, 0, '榲桲の強い香りの酒。'],
  ['cider_ice', '氷の林檎酒', { apple: 8 }, 'brewer', 25, 0.25, 0, 0, '凍らせた林檎の汁の甘い芯だけを醸した、冬の甘露。', 'noble', 1],
  ['cider_mulled', '温め林檎酒', { cider: 1, ground_cinnamon: 0.005 }, 'innkeeper', 3, 0.15, 1, 1, '林檎酒を肉桂で温めた、冬の宿の一杯。', 'inn'],
  ['cider_sparkling', '泡立つ林檎酒', { cider: 1, sugar: 0.02 }, 'brewer', 15, 0.18, 365, 0, '瓶で二度醸して泡立たせた、貴族の庭の宴の酒。', 'noble', 1],
  ['wassail', '祝い鉢の酒', { ale_strong: 1, baked_apple: 1, ground_spice_sweet: 0.01 }, 'innkeeper', 4, 0.3, 1, 1, '冬至の夜に大鉢に強い麦酒と焼き林檎を浮かべ、果樹に歌を捧げてから回し飲む。', null, 0],
];
for (const [id, name, from, by, v, drunk, keep, demand, desc, grade, rare = 0, tribe] of MEAD) {
  const u = [{ k: 'luxury', note: '気分が上がる・宴の酒' }];
  if (['mead_wedding', 'mead_offering', 'wassail', 'mead_royal'].includes(id)) u.push({ k: 'ritual', note: id === 'mead_wedding' ? '婚礼' : id === 'wassail' ? '冬至の祝い' : id === 'mead_royal' ? '即位式' : '守り神への儀式' });
  if (id === 'mead_spiced') u.push({ k: 'medicine', note: '冷えと咳に' });
  if (grade || rare >= 1) u.push({ k: 'gift' });
  if (['mead', 'cider'].includes(id)) u.push({ k: 'trade' });
  add({ id, name, sub: id.startsWith('cider') || id === 'perry' || id === 'wassail' ? 'cider' : 'mead', w: 1, v, stack: 5, rare, make: mk(from, by, 240), how: 'brew',
    drink: 20, food: 3, keep: keep || undefined, demand, grade, tribe, loot: rare >= 2 ? ['dungeon'] : undefined, use: u, fx: { drunk, mood: Math.round(drunk * 12) + 1 }, desc });
}

// ---- 蒸留酒 ----
const SPIRIT = [
  ['spirit_grain', '麦の火酒', { ale: 5 }, 'distiller', 6, 0.7, 1, '麦酒を釜で煮て、立ちのぼる湯気を冷やして集めた強い酒。'],
  ['spirit_rye', 'ライ麦の火酒', { ale_rye: 5 }, 'distiller', 6, 0.7, 1, '北の寒い村で冬を越すための、ぴりっと辛い火酒。'],
  ['brandy_apple', '林檎の火酒', { cider: 5 }, 'distiller', 9, 0.7, 1, '林檎酒を蒸留した、林檎の香りの火酒。'],
  ['brandy_plum', '李の火酒', { wine_plum: 4 }, 'distiller', 8, 0.75, 1, '山の村で祝いごとに開ける、透きとおった李の火酒。'],
  ['brandy_cherry', '桜桃の火酒', { wine_cherry: 4 }, 'distiller', 9, 0.75, 0, '桜桃の種の香りがほのかにする火酒。'],
  ['brandy_pear', '梨の火酒', { perry: 4 }, 'distiller', 10, 0.75, 0, '甘く香る梨の火酒。'],
  ['brandy_grape', '葡萄の火酒', { wine_red: 4 }, 'distiller', 10, 0.7, 1, '葡萄酒を蒸留した火酒。強めの葡萄酒の材料にもなる。'],
  ['brandy_aged', '樽寝かせの火酒', { brandy_grape: 1 }, 'distiller', 40, 0.7, 0, '樫の樽で二十年寝かせ、琥珀色になった葡萄の火酒。', 'noble', 2],
  ['spirit_juniper', '杜松の火酒', { spirit_grain: 1, juniper_berry: 0.05 }, 'distiller', 8, 0.7, 1, '杜松の実で香りづけした透明な火酒。港の酒場で安く飲まれる。'],
  ['spirit_anise', '茴香の火酒', { spirit_grain: 1, anise: 0.05 }, 'distiller', 9, 0.7, 0, '水を注ぐと白く濁る、甘い香りの火酒。'],
  ['spirit_wormwood', '苦艾の緑の酒', { spirit_grain: 1, wormwood: 0.05, anise: 0.02 }, 'distiller', 16, 0.8, 0, '苦艾で緑に染まる、詩人と画家が好む妖しい酒。'],
  ['liqueur_herb_monastery', '修道院の薬草酒', { spirit_grain: 1, herbs: 0.2, honey: 0.1 }, 'priest', 20, 0.6, 1, '四十の薬草を漬けた修道院秘伝の酒。薬として売られる。', null, 1],
  ['bitters', '苦味酒', { spirit_grain: 1, wormwood: 0.02, gentian_root: 0.02 }, 'herbalist', 8, 0.5, 1, '苦い根と草を漬けた酒。食前に一口飲むと腹の具合がよくなる。'],
  ['liqueur_honey', '蜂蜜の甘い火酒', { spirit_grain: 1, honey: 0.2 }, 'distiller', 10, 0.5, 1, '火酒に蜂蜜を溶かした甘い酒。婦人に好まれる。'],
  ['liqueur_walnut', '青胡桃の酒', { spirit_grain: 1, walnut: 0.3 }, 'distiller', 10, 0.55, 0, '夏至の日に摘んだ青い胡桃を漬けた、黒い酒。'],
  ['liqueur_berry', '苺の甘い酒', { spirit_grain: 1, raspberry: 0.3, sugar: 0.1 }, 'distiller', 9, 0.45, 1, '木苺を火酒と砂糖に漬けた紅色の甘い酒。'],
  ['liqueur_mint', '薄荷の酒', { spirit_grain: 1, mint: 0.1, sugar: 0.1 }, 'distiller', 9, 0.45, 0, '緑色の薄荷の酒。食後に飲む。'],
  ['spirit_potato', '芋の火酒', { potato: 5 }, 'distiller', 4, 0.75, 1, '芋を醸して蒸留した安い火酒。ハルン族の火山の村の酒。', null, 0, 'harn'],
  ['spirit_buckwheat', '蕎麦の蒸留酒', { ale_buckwheat: 5 }, 'distiller', 9, 0.7, 1, '灰色谷のホリン衆が峠越えで運ぶ名高い蒸留酒。', null, 1, 'hollin'],
  ['spirit_date', 'ナツメヤシの火酒', { wine_date: 4 }, 'distiller', 9, 0.75, 1, '水で白く濁る、砂海の民の火酒。', null, 0, 'nefer'],
  ['spirit_cane', '甘蔗の火酒', { sugarcane: 5 }, 'distiller', 5, 0.75, 1, '南の島の甘蔗から造る、船乗りと海賊の酒。'],
  ['spirit_maize', '玉蜀黍の火酒', { ale_maize: 5 }, 'distiller', 6, 0.75, 0, '玉蜀黍の酒を蒸留した、密林の祭司の酒。', null, 0, 'mictla'],
  ['spirit_kumis', '馬乳の火酒', { kumis: 5 }, 'distiller', 7, 0.5, 1, '馬乳酒をもう一度煮て集めた、ドルグ族の澄んだ酒。', null, 0, 'dorgu'],
  ['spirit_reindeer', 'トナカイ乳の火酒', { reindeer_milk: 5 }, 'distiller', 10, 0.5, 0, '発酵させたトナカイの乳を蒸留した、雪原の民の儀式の酒。', null, 1, 'yarvi'],
  ['spirit_courage', '兵の気つけ酒', { spirit_grain: 0.3, freshwater: 0.2 }, 'distiller', 2, 0.4, 1, '戦いの前に一口ずつ配られる、水で割った火酒。', null],
];
for (const [id, name, from, by, v, drunk, demand, desc, grade, rare = 0, tribe] of SPIRIT) {
  const u = [{ k: 'luxury', note: '強い酒・気分が上がる' }];
  if (['liqueur_herb_monastery', 'bitters'].includes(id)) u.push({ k: 'medicine', note: '腹の具合と気つけ' });
  u.push({ k: 'medicine', note: '傷を洗う・気つけ' });
  if (rare >= 1 || grade) u.push({ k: 'gift' });
  if (['spirit_buckwheat', 'spirit_date', 'spirit_cane', 'brandy_apple', 'spirit_grain'].includes(id)) u.push({ k: 'trade', note: '遠くまで運べる' });
  if (['spirit_reindeer', 'spirit_maize'].includes(id)) u.push({ k: 'ritual' });
  if (id === 'spirit_courage') u.push({ k: 'quest', note: '戦いの前の士気' });
  add({ id, name, sub: 'spirit', w: 1, v, stack: 5, rare, make: mk(from, by, grade === 'noble' ? 8760 : 12), how: 'brew', drink: 5, demand, grade, tribe,
    loot: rare >= 2 ? ['dungeon', 'ruins'] : undefined, use: u, fx: { drunk, mood: Math.round(drunk * 10), warmth: 3, ...(id === 'spirit_courage' ? { courage: 3 } : {}) }, desc });
}
