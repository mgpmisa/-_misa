import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 2, ...o });
// 木の実
const NUT = [
  ['walnut', '胡桃', ['forest', 'river'], 0.02, 0.2, 2, '割って食べる・菓子・搾って油', '固い殻の実。'],
  ['chestnut', '栗', ['forest', 'hill'], 0.02, 0.15, 3, '焼き栗・栗粉・甘露煮', '棘のいがに包まれた実。山の民の主食。'],
  ['hazelnut', '榛の実', ['forest', 'grass'], 0.01, 0.15, 2, '炒って・菓子', '生け垣の小さな丸い実。'],
  ['almond', '扁桃', ['hill', 'desert'], 0.01, 0.4, 2, '菓子・扁桃の乳・油', '乾いた丘に育つ木の実。貴族の菓子に。'],
  ['acorn', '団栗', ['forest', 'dense'], 0.01, 0.02, 1, '水に晒して団栗粉・豚の餌', '樫や楢の実。豚を森に放して食べさせる。'],
  ['chinquapin', '椎の実', ['forest'], 0.01, 0.05, 1, '炒ってそのまま（あく抜き不要）', '小さな甘い団栗。'],
  ['horse_chestnut', '栃の実', ['forest', 'mountain'], 0.03, 0.05, 2, '灰汁で何日もあく抜きして栃餅', 'あく抜きしないと食べられない大きな実。飢饉の備え。'],
  ['pine_nut', '松の実', ['mountain', 'forest'], 0.01, 0.6, 1, '炒って・菓子・薬膳', '大きな松かさから取る小さな実。'],
  ['torreya_nut', '榧の実', ['forest', 'mountain'], 0.01, 0.3, 1, '炒って・虫下し', '碁盤の木の実。'],
  ['water_caltrop', '菱の実', ['swamp', 'lake'], 0.02, 0.1, 2, '茹でて', '沼に浮かぶ草の角のある実。'],
  ['pistachio', '阿月渾子', ['desert', 'hill'], 0.01, 0.6, 1, '炒って・菓子', '乾いた地の緑の実。殻が笑うように開く。'],
];
for (const [id, n, on, w, v, food, note, desc] of NUT) X(id, n, 'nut', w, v, { d: 1, src: [S('gather', on, 0.6)], food, keep: 180, use: [U('food', note), U('craft', '植えれば木に育つ（苗床に植える）')].concat(id === 'acorn' ? [U('feed', '豚の秋の餌'), U('dye', '灰色の染め')] : []), desc });
X('acorn_flour', '団栗粉', 'flour', 1, 0.5, { make: M({ acorn: 40 }, 'miller', 24), keep: 120, use: [U('food', '団栗パン・団栗の粥（飢えの年の糧）')], desc: '水に晒して渋を抜いた団栗の粉。' });
X('chestnut_flour', '栗粉', 'flour', 1, 2, { make: M({ chestnut: 20 }, 'miller', 4), keep: 120, use: [U('food', '栗の平焼き・粥')], desc: '干した栗を挽いた甘い粉。山里のパン。' });
X('walnut_shell', '胡桃の殻', 'nut', 0.1, 0.02, { make: M({ walnut: 10 }, 'cook', 1), use: [U('fuel'), U('craft', '砕いて金物の磨き粉'), U('dye', '茶色の染め')], desc: '割った胡桃の固い殻。' });
// 油をとる種
const SEED = [
  ['rapeseed', '菜種', 0.3, '搾って菜種油', '菜の花の種。春の畑を黄色く染める。'],
  ['sesame', '胡麻', 0.8, '炒って和え物・搾って胡麻油', '小さな種。開けと唱えれば扉が開くという。'],
  ['sunflower_seed', '向日葵の種', 0.3, '炒って食べる・搾って油・鳥の餌', '大きな花の種。'],
  ['poppy_seed', '芥子の実', 0.4, 'パンにまぶす・油', '罌粟の花の熟した種（眠りの毒はない）。'],
  ['perilla_seed', '荏胡麻', 0.4, '搾って荏油（灯りと防水）', '紫蘇の仲間の種。'],
  ['camellia_seed', '椿の実', 0.5, '搾って椿油', '椿の固い実。'],
  ['castor_seed', '蓖麻子', 0.3, '搾って蓖麻子油（生で食べると死ぬ毒）', '斑模様の毒の種。'],
  ['mustard_seed', '芥子菜の種', 0.5, '挽いて辛子・油', '辛い小さな種。'],
  ['cotton_seed', '綿の種', 0.05, '搾って綿実油・家畜の餌', '綿を繰ると出る種。'],
];
for (const [id, n, v, note, desc] of SEED) X(id, n, 'seed', 0.1, v, { d: 1, src: [S('harvest', ['farm', 'field'], 1)], keep: 365, use: [U('craft', note), PLANT].concat(id === 'castor_seed' ? [U('craft', '毒')] : []), fx: id === 'castor_seed' ? { poison: 50 } : undefined, desc });
// 油
const OIL = [
  ['rapeseed_oil', '菜種油', { rapeseed: 10 }, 2, 3, '灯り（行灯）・揚げ物・料理', '町の夜を照らすいちばん多い油。'],
  ['olive_oil', '橄欖油', { olive_fruit: 20 }, 3, 3, '料理・灯り・石鹸・聖油・肌の手入れ', '南の丘の富の源。神殿の灯りにも。'],
  ['walnut_oil', '胡桃油', { walnut: 30 }, 4, 1, '絵の具を練る・木の器の仕上げ・料理', '乾くと固まる油。画家が使う。'],
  ['linseed_oil', '亜麻仁油', { linseed: 10 }, 2.5, 2, '絵の具・床と家具の塗り・革の手入れ', '乾く油。木を水から守る。'],
  ['sesame_oil', '胡麻油', { sesame: 10 }, 5, 1, '香りのよい料理・揚げ物', '香ばしい高級な油。'],
  ['camellia_oil', '椿油', { camellia_seed: 10 }, 6, 1, '髪油・刃物の錆止め・薬', '刀鍛冶と髪結いが使う。錆びない。'],
  ['sunflower_oil', '向日葵油', { sunflower_seed: 10 }, 2, 1, '料理・灯り', '癖のない油。'],
  ['hemp_oil', '麻の実油', { hempseed: 10 }, 2, 1, '灯り・塗料・石鹸', '麻の実から搾る緑がかった油。'],
  ['perilla_oil', '荏油', { perilla_seed: 10 }, 3, 1, '油紙・傘・雨合羽の防水・灯り', '塗ると乾いて水をはじく。'],
  ['castor_oil', '蓖麻子油', { castor_seed: 10 }, 4, 1, '車軸と水車の潤滑・灯り・下し薬（少しだけ）', '粘りの強い油。毒は搾ると抜ける。'],
  ['coconut_oil', 'ヤシ油', { coconut: 5 }, 3, 1, '石鹸・髪油・料理', '南の国の白く固まる油。'],
  ['almond_oil', '扁桃油', { almond: 30 }, 8, 1, '香油の元・肌の手入れ・菓子', '香りのない上等な油。香水の元になる。'],
  ['cottonseed_oil', '綿実油', { cotton_seed: 20 }, 1.5, 1, '安い灯り・石鹸', '安い油。煙が多い。'],
  ['mustard_oil', '辛子油', { mustard_seed: 10 }, 3, 0, '辛い料理・塗り薬（肩こり）', '鼻に来る辛い油。'],
];
for (const [id, n, from, v, d, note, desc] of OIL) X(id, n, 'oil', 1, v, { d, make: M(from, 'miller', 4), keep: 365, use: [U('craft', note)].concat(/灯り/.test(note) ? [U('fuel', '灯り')] : []).concat(/料理/.test(note) ? [U('food', '料理の油')] : []), desc });
X('oilcake', '油かす', 'seed', 1, 0.2, { d: 1, make: M({ rapeseed: 10 }, 'miller', 4), use: [U('fertilize', '最良の肥やし'), U('feed', '牛の餌')], desc: '油を搾ったあとの種のかす。' });
X('mustard_paste', '辛子', 'spice', 0.2, 1, { make: M({ mustard_seed: 5 }, 'cook', 1), keep: 60, use: [U('food', '肉と腸詰めの薬味'), U('medicine', '胸に貼る湿布')], desc: '芥子菜の種を挽いて練った黄色い薬味。' });
