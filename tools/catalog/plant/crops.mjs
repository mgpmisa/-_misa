import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 2, ...o });
const FARM = ['farm', 'field'];
const H = (rate = 1, on = FARM) => S('harvest', on, rate);
// ── 穀物 ──
X('wheat', '小麦', 'grain', 1, 2, { d: 3, src: [H()], food: 10, keep: 365, use: [U('craft', '挽いて小麦粉（パン）'), U('food', '煮て麦粥'), PLANT, U('feed', '鶏の餌')], desc: 'もっとも大切な穀物。1つで1食分の粉になる。' });
X('barley', '大麦', 'grain', 1, 1.5, { d: 3, src: [H()], food: 9, keep: 365, use: [U('craft', '麦芽にして麦酒'), U('food', '麦粥・麦飯'), U('feed', '馬の餌'), PLANT], desc: '寒さと痩せ地に強い麦。麦酒の元。' });
X('rye', '黒麦', 'grain', 1, 1.4, { d: 2, src: [H()], food: 9, keep: 365, use: [U('craft', '挽いて黒パン'), PLANT], desc: '寒い北の地でも育つ麦。酸っぱい黒パンになる。まれに麦角という毒がつく。' });
X('oats', '燕麦', 'grain', 1, 1.2, { d: 2, src: [H()], food: 8, keep: 365, use: [U('feed', '馬の一番の餌'), U('food', '挽き割って粥'), PLANT], desc: '馬の餌として欠かせない麦。貧しい家では人も粥にして食べる。' });
X('spelt', '古麦', 'grain', 1, 2.2, { d: 1, src: [H(0.8)], food: 10, keep: 365, use: [U('craft', '香ばしい粉'), U('food'), PLANT], desc: '殻が固い昔ながらの麦。痩せた土でも育つ。' });
X('millet', '粟', 'grain', 0.8, 1, { d: 1, src: [H()], food: 8, keep: 400, use: [U('food', '粟粥・粟餅'), U('feed', '小鳥の餌'), PLANT], desc: '小さな黄色い粒。日照りに強い。' });
X('barnyard_millet', '稗', 'grain', 0.8, 0.6, { d: 1, src: [H(), S('forage', ['swamp', 'grass'], 0.3)], food: 7, keep: 700, use: [U('food', '飢饉の備え（何年も持つ）'), U('feed'), PLANT], desc: 'どこでも育つ粗末な穀物。蔵にしまえば何年も腐らない。' });
X('proso_millet', '黍', 'grain', 0.8, 1, { d: 1, src: [H()], food: 8, keep: 400, use: [U('food', '黍団子'), U('craft', '黍の酒'), PLANT], desc: 'もちもちとした粒の穀物。' });
X('sorghum', '高黍', 'grain', 1, 1, { d: 1, src: [H(1, ['farm', 'field', 'savanna'])], food: 8, keep: 400, use: [U('food', '平焼きのパン・粥'), U('craft', '醸して酒・茎は甘い'), PLANT], desc: '背の高い穀物。暑さと乾きに強くサバンナの民の主食。' });
X('buckwheat', '蕎麦', 'grain', 0.8, 1.3, { d: 2, src: [H()], food: 8, keep: 365, use: [U('craft', '挽いて蕎麦粉'), PLANT], desc: '75日で実る早い作物。山の痩せ地で育つ。' });
X('maize', '玉蜀黍', 'grain', 1.2, 1.2, { d: 2, src: [H()], food: 10, keep: 300, use: [U('food', '焼いて・茹でて'), U('craft', '挽いて玉蜀黍粉'), U('feed', '家畜の餌'), PLANT], desc: '背丈を超える茎に実る黄色い粒の穂。' });
X('rice_paddy', '籾', 'grain', 1, 1.8, { d: 3, src: [H(1, ['farm', 'field', 'swamp'])], keep: 700, use: [U('craft', '籾摺りして玄米'), U('trade', '籾のままなら何年も蔵で持つ'), U('craft', '田に植える：苗を育てて水田に植える')], desc: '殻つきの米。水を張った田で育てる。' });
X('brown_rice', '玄米', 'grain', 1, 2.2, { d: 2, make: M({ rice_paddy: 1 }, 'miller', 1), food: 11, keep: 180, use: [U('food', '炊いて食べる（体に良い）'), U('craft', '搗いて白米')], desc: '籾殻を取った米。' });
X('rice', '白米', 'grain', 1, 3, { d: 3, make: M({ brown_rice: 1 }, 'miller', 1), food: 12, keep: 120, use: [U('food', '炊いて主食'), U('craft', '米粉・餅・米の酒・酢'), U('ritual', '神に供える')], desc: '糠を取った白い米。' });
X('wild_rice', '真菰の実', 'grain', 0.8, 2, { r: 1, src: [S('forage', ['swamp', 'lake'], 0.3)], food: 9, keep: 365, use: [U('food', '炊いて食べる'), U('trade', '珍しい穀物')], desc: '沼の真菰に実る細長い黒い実。舟を漕いで集める。' });
// 麦わら・殻・ぬか
X('straw', '麦藁', 'straw', 1, 0.1, { d: 3, src: [H(1)], use: [U('craft', '藁縄・俵・むしろ・草履・帽子'), U('build', '屋根葺き・土壁のつなぎ'), U('feed', '家畜の寝床と冬の餌'), U('fertilize', '堆肥')], desc: '麦を刈ると自然に出る。小麦1につき藁1。捨てていた物が役に立つ。' });
X('rye_straw', '黒麦の藁', 'straw', 1, 0.15, { src: [H(1)], use: [U('build', '長くて丈夫：屋根葺きに最良'), U('craft', '蜂の巣箱・帽子')], desc: 'ひときわ長い藁。屋根葺き職人が好む。' });
X('oat_straw', '燕麦の藁', 'straw', 1, 0.1, { src: [H(1)], use: [U('feed', '柔らかく牛馬が好んで食べる'), U('craft', '寝床の詰め物')], desc: '柔らかい藁。家畜の冬の餌になる。' });
X('rice_straw', '稲藁', 'straw', 1, 0.15, { d: 2, src: [H(1, ['farm', 'field', 'swamp'])], use: [U('craft', '縄・米俵・草鞋・蓑・畳の芯・注連縄'), U('feed'), U('fertilize')], desc: '稲を刈ったあとの藁。しなやかで編み物に向く。' });
X('chaff', 'もみがら', 'straw', 0.3, 0.02, { d: 1, src: [H(1)], use: [U('feed', '家畜の寝床'), U('craft', '枕の詰め物・卵や果物の詰め箱の緩衝'), U('fertilize')], desc: '麦を脱穀したときに出る殻。' });
X('rice_husk', '籾殻', 'straw', 0.3, 0.02, { make: M({ rice_paddy: 5 }, 'miller', 1), use: [U('fuel', '燻して籾殻燻炭（畑の肥やし）'), U('craft', '断熱の詰め物・土壁')], desc: '籾摺りで出る殻。' });
X('bran', 'ふすま', 'grain', 0.5, 0.2, { d: 1, make: M({ wheat: 4 }, 'miller', 1), use: [U('feed', '家畜の餌'), U('food', '貧しい者のパンに混ぜる')], desc: '小麦を挽いたときに出る皮のくず。' });
X('rice_bran', '米糠', 'grain', 0.5, 0.2, { d: 1, make: M({ brown_rice: 4 }, 'miller', 1), use: [U('food', '糠漬けの床'), U('craft', '床や柱を磨く・肌を洗う'), U('feed'), U('fertilize')], desc: '玄米を白くするときに出る粉。' });
X('ergot', '麦角', 'poison', 0.01, 3, { r: 1, src: [H(0.02)], fx: { poison: 25 }, use: [U('medicine', '産婆がお産の出血止めに少しだけ使う'), U('craft', '毒')], desc: '黒麦の穂につく黒い角のような毒。混ざったパンを食べると幻を見て手足が焼けるように痛む。' });
// 粉
const FL = (id, n, from, v, food, note, d = 2) => X(id, n, 'flour', 1, v, { d, make: M({ [from]: 1 }, 'miller', 1), food, keep: 120, use: [U('craft', note)], desc: `${n}。水車か風車の粉屋で挽く。` });
FL('flour', '小麦粉', 'wheat', 2.5, 0, 'パン・菓子・麺・衣', 3);
FL('wholemeal_flour', '全粒粉', 'spelt', 2.4, 0, '香ばしい田舎パン');
FL('barley_flour', '大麦粉', 'barley', 1.8, 0, '平焼きパン・麦こがし');
FL('rye_flour', '黒麦粉', 'rye', 1.8, 0, '黒パン（酸っぱい種で膨らます）');
FL('oatmeal', '挽き割り燕麦', 'oats', 1.6, 8, '粥・焼き菓子');
FL('rice_flour', '米粉', 'rice', 3.5, 0, '団子・餅菓子');
FL('buckwheat_flour', '蕎麦粉', 'buckwheat', 1.8, 0, '蕎麦切り・蕎麦がき・薄焼き');
FL('cornmeal', '玉蜀黍粉', 'maize', 1.5, 0, '粥・平焼き・揚げ団子');
FL('millet_flour', '粟粉', 'millet', 1.3, 0, '粟餅・団子', 1);
FL('sorghum_flour', '高黍粉', 'sorghum', 1.3, 0, '平焼きのパン・粥', 1);
X('barley_malt', '大麦麦芽', 'grain', 0.8, 2.5, { d: 2, make: M({ barley: 1 }, 'brewer', 72), use: [U('craft', '麦酒を仕込む'), U('food', '水飴')], desc: '大麦を水に浸けて芽を出させ、乾かしたもの。' });
X('wheat_malt', '小麦麦芽', 'grain', 0.8, 3, { make: M({ wheat: 1 }, 'brewer', 72), use: [U('craft', '白い麦酒')], desc: '小麦の麦芽。泡の多い白い麦酒になる。' });
// ── 豆 ──
const BEAN = [
  ['fava_bean', '空豆', 1.2, 9, '塩茹で・潰して粥', '大粒の豆。貧しい者の肉と呼ばれる。'],
  ['pea', '豌豆', 1.2, 8, '豆の粥・干して冬の保存食', '寒さに強い豆。畑を肥やす。'],
  ['lentil', '扁豆', 1.5, 9, '煮込み・汁', '平たい小さな豆。すぐ煮える。'],
  ['chickpea', '雛豆', 1.6, 9, '煮込み・潰して練り物・炒り豆', '鳥の頭のような形の豆。乾いた土地で育つ。'],
  ['soybean', '大豆', 1.5, 9, '味噌・醤・豆腐・豆乳・きな粉', '畑の肉。醤や豆腐の元。'],
  ['azuki', '小豆', 2, 8, '餡・赤飯・汁粉', '赤い小さな豆。祝いの席に欠かせない。'],
  ['kidney_bean', '隠元豆', 1.4, 8, '煮豆・煮込み', 'つるを伸ばす豆。若いさやも食べる。'],
  ['mung_bean', '緑豆', 1.5, 8, '豆もやし・春雨・粥', '小さな緑の豆。暑気払いに良い。'],
  ['peanut', '落花生', 1.8, 10, '炒り豆・搾って油', '花が土にもぐって実る不思議な豆。'],
  ['lupin', '羽扇豆', 1, 6, '何日も水に晒して苦味を抜いて食べる', '苦い豆。痩せ地に植えると土が肥える。'],
];
for (const [id, n, v, food, note, desc] of BEAN) X(id, n, 'bean', 1, v, { d: 2, src: [H()], food, keep: 365, use: [U('food', note), PLANT, U('fertilize', '豆を植えると畑が肥える（輪作）')], desc });
X('vetch', '野豌豆', 'bean', 1, 0.5, { src: [H(), S('forage', ['grass'], 0.3)], use: [U('feed', '牛馬の飼い葉'), U('fertilize', '畑に鋤き込む緑の肥やし'), PLANT], desc: '家畜の餌と土作りのために植える豆。' });
X('bean_stalks', '豆殻', 'straw', 1, 0.05, { src: [H(1)], use: [U('feed', '家畜の餌'), U('fuel', '焚きつけ')], desc: '豆を取ったあとの茎とさや。' });
X('bean_flour', 'きな粉', 'flour', 1, 2.5, { make: M({ soybean: 1 }, 'miller', 1), food: 0, keep: 120, use: [U('food', '団子や餅にまぶす')], desc: '炒った大豆を挽いた甘い香りの粉。' });
X('chickpea_flour', '雛豆粉', 'flour', 1, 2, { make: M({ chickpea: 1 }, 'miller', 1), keep: 120, use: [U('craft', '揚げ物の衣・平焼き')], desc: '雛豆を挽いた黄色い粉。' });
