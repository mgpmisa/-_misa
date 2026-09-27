// 調味料（塩・酢・魚醤・油・たれ）・香辛料・砂糖と蜜・嗜好品（香草の葉・嗅ぎ薬・噛み物）・野の食べ物・供え物
const { add, mk } = require('./h');

// ---- 塩 ----
const SALT = [
  ['salt', '塩', { seasalt: 1 }, 'saltmaker', 1, 3, '料理に使う白い塩。海塩を煮直して細かくしたもの。すべての台所に要る。', [{ k: 'craft', note: '味付け・塩漬け・乳酪作り' }, { k: 'trade' }, { k: 'gift', note: '新しい家への贈り物' }, { k: 'ritual', note: '清め' }]],
  ['salt_rock_ground', '挽いた岩塩', { rocksalt: 1 }, 'miller', 1.4, 2, '岩塩を石臼で挽いた、ほのかに甘い塩。', [{ k: 'craft', note: '味付け' }]],
  ['salt_herb', '香草塩', { salt: 1, herbs: 0.1 }, 'cook', 3, 1, '塩に乾かした香草を合わせたもの。肉を焼くときにふる。', [{ k: 'craft', note: '肉と魚の味付け' }]],
  ['salt_smoked', '燻し塩', { salt: 1 }, 'saltmaker', 3, 0, '樫の煙で燻した茶色の塩。', [{ k: 'craft', note: '味付け' }, { k: 'luxury', note: '食通の品' }]],
  ['salt_black', '火山の黒塩', { rocksalt: 1, volcanicash: 0.05 }, 'saltmaker', 4, 1, 'ハルン族が火山の熱で焼く、卵の香りのする黒い塩。', [{ k: 'craft', note: '味付け' }, { k: 'trade', note: 'ハルン族の名産' }], 'harn'],
  ['salt_desert', '砂海の塩の板', { rocksalt: 1 }, 'saltmaker', 2, 1, 'ネフェル族が塩湖から切り出して隊商で運ぶ板状の塩。', [{ k: 'craft', note: '味付け' }, { k: 'trade', note: '隊商の品' }], 'nefer'],
  ['salt_curing', '漬け込み塩', { coarsesalt: 1, saltpeter: 0.02 }, 'butcher', 1.5, 2, '粗塩に硝石を少し混ぜた、肉を赤く漬けるための塩。', [{ k: 'craft', note: '塩漬け肉・ハム作り' }]],
];
for (const [id, name, from, by, v, demand, desc, use, tribe] of SALT) {
  add({ id, name, sub: 'salt', w: 0.5, v, stack: 30, make: mk(from, by, 1), how: 'cook', food: 1, noEat: true, demand, tribe, use, desc, trade: id === 'salt' });
}

// ---- 酢 ----
const VIN = [
  ['vinegar', '酢', { wine_table: 1 }, 1, 3, 'ふつうの酢。酸っぱくなった葡萄酒や麦酒をさらに寝かせて作る。漬物・料理・掃除・傷洗いに使う。'],
  ['vinegar_wine', '葡萄酢', { wine_red: 1 }, 1.5, 2, '赤葡萄酒から作った香りのよい酢。'],
  ['vinegar_ale', '麦酢', { ale: 1 }, 0.8, 2, '麦酒から作った安い茶色の酢。酒場の漬物に。'],
  ['vinegar_cider', '林檎酢', { cider: 1 }, 1.2, 1, '林檎酒から作ったまろやかな酢。水で割って飲む者もいる。'],
  ['vinegar_honey', '蜜酢', { mead: 1 }, 2.5, 0, '蜂蜜酒から作った甘い香りの酢。'],
  ['vinegar_herb', '香草酢', { vinegar_wine: 1, herbs: 0.05 }, 3, 0, '香草を漬けた酢。和え物に。'],
  ['vinegar_aged', '熟成葡萄酢', { juice_grape: 3 }, 25, 0, '葡萄の汁を煮詰めて樽を替えながら十二年寝かせた、黒く甘い酢。数滴で料理が変わる。', 'noble'],
];
for (const [id, name, from, v, demand, desc, grade] of VIN) {
  add({ id, name, sub: 'vinegar', w: 1, v, stack: 10, rare: grade ? 2 : 0, make: mk(from, id === 'vinegar_aged' ? 'vintner' : 'brewer', id === 'vinegar_aged' ? 8760 : 480), how: 'brew', drink: 2, noEat: true, demand, grade,
    use: [{ k: 'craft', note: '漬物・たれ・料理の酸味' }, ...(id === 'vinegar' ? [{ k: 'medicine', note: '傷を洗い、疫病よけに部屋をふく' }, { k: 'tool', note: '掃除・金物の錆落とし・染め物の色止め' }, { k: 'trade' }] : []),
      ...(id === 'vinegar_cider' ? [{ k: 'medicine', note: '水で割って疲れに' }] : []), ...(grade ? [{ k: 'luxury', note: '食通の品' }, { k: 'collect', note: '年代物' }] : [])],
    loot: id === 'vinegar_aged' ? ['ruins'] : undefined, desc });
}

// ---- 魚醤・たれ ----
const SAUCE = [
  ['fish_sauce', '魚醤', { sardine: 2, salt: 0.5 }, 'fisher', 3, 2, 720, '鰯を塩で漬けて一年日に当て、にじみ出た汁を漉したもの。料理に深い旨みを足す。'],
  ['fish_sauce_fine', '上等の魚醤', { mackerel: 2, salt: 0.5 }, 'fisher', 10, 0, 1000, '鯖の腹わただけで作った琥珀色の魚醤。貴族の料理人が使う。', 'noble'],
  ['oyster_sauce', '牡蠣の醤', { oyster: 6, salt: 0.1 }, 'fisher', 6, 0, 365, '牡蠣を煮詰めた濃い茶色のたれ。'],
  ['mustard', '芥子練り', { mustard_seed: 0.1, vinegar: 0.05 }, 'household', 2, 2, 180, '芥子の種を酢で練った、鼻にぬける辛い練り物。腸詰めにつける。'],
  ['sauce_green', '緑のたれ', { parsley: 0.05, bread_stale: 0.05, vinegar: 0.05 }, 'cook', 2, 1, 2, '香草とパンと酢をすりつぶした緑のたれ。魚に添える。'],
  ['sauce_garlic', '大蒜のたれ', { garlic: 0.1, oil_olive: 0.05 }, 'household', 1.5, 1, 5, '大蒜を油ですりつぶした白いたれ。'],
  ['sauce_cameline', '肉桂のたれ', { ground_cinnamon: 0.01, bread_stale: 0.05, vinegar_wine: 0.05 }, 'cook', 6, 0, 3, '肉桂と酢とパンのたれ。貴族の焼き肉に添える。', 'noble'],
  ['sauce_mint', '薄荷のたれ', { mint: 0.05, vinegar: 0.05, sugar: 0.01 }, 'household', 1.5, 1, 7, '薄荷を刻んで酢と砂糖で和えたたれ。羊肉に添える。'],
  ['sauce_horseradish', '山葵大根のたれ', { horseradish: 0.1, cream: 0.05 }, 'household', 2, 1, 5, '山葵大根をすりおろして乳脂で和えた辛いたれ。'],
  ['sauce_lingonberry', '苔桃のたれ', { lingonberry: 0.2, honey: 0.03 }, 'household', 1.5, 1, 90, '苔桃を煮た赤いたれ。肉と団子に添える。', null, 'yarvi'],
  ['sauce_pepper', '胡椒のたれ', { ground_pepper: 0.01, wine_red: 0.1, bread_stale: 0.05 }, 'cook', 7, 0, 3, '胡椒と赤葡萄酒の黒いたれ。鹿肉のために作る。', 'noble'],
  ['verjuice', '未熟葡萄の酢汁', { juice_grape_unripe: 1, salt: 0.01 }, 'household', 1.5, 1, 180, '未熟な葡萄の酸汁を塩で保たせたもの。酢より柔らかい酸味。'],
  ['gravy', '焼き汁のたれ', { dripping: 0.1, flour_wheat: 0.02, bone_broth: 0.2 }, 'household', 1, 1, 1, '焼き肉の脂と骨の出汁を粉でとろめたたれ。'],
];
for (const [id, name, from, by, v, demand, keep, desc, grade, tribe] of SAUCE) {
  add({ id, name, sub: 'sauce', w: 0.3, v, stack: 10, rare: grade ? 1 : 0, make: mk(from, by, id.startsWith('fish') ? 8760 : 0.5), food: 2, noEat: true, keep, demand, grade, tribe,
    use: [{ k: 'craft', note: '料理の味付け' }, ...(id === 'fish_sauce' ? [{ k: 'trade', note: '港町から内陸へ' }] : [])], desc });
}

// ---- 油 ----
const OIL = [
  ['oil_olive', '橄欖油', { olive: 3 }, 4, 2, '橄欖の実を搾った金緑色の油。料理・灯り・肌の手入れに。', [{ k: 'fuel', note: '灯明' }, { k: 'medicine', note: '肌と傷の手入れ' }, { k: 'ritual', note: '聖油の元' }, { k: 'trade' }]],
  ['oil_olive_first', '初搾りの橄欖油', { olive: 5 }, 12, 0, '最初の一搾りだけを集めた青い香りの油。貴族の食卓の品。', [{ k: 'luxury', note: '食通の品' }, { k: 'gift' }], 'noble'],
  ['oil_walnut', '胡桃油', { walnut: 2 }, 4, 1, '胡桃を搾った香ばしい油。和え物と絵の具に。', [{ k: 'craft', note: '画家の絵の具の油' }]],
  ['oil_hazelnut', '榛の実の油', { hazelnut: 2 }, 5, 0, '甘い香りの貴重な油。', [{ k: 'luxury' }]],
  ['oil_linseed', '亜麻仁油', { flax_seed: 2 }, 2, 1, '亜麻の種を搾った油。食べるほか木に塗って守る。', [{ k: 'craft', note: '木と革の手入れ・絵の具' }]],
  ['oil_rapeseed', '菜種油', { rapeseed: 2 }, 2, 2, '菜の花の種を搾った油。揚げ物と灯りに。', [{ k: 'fuel', note: '灯りの油' }]],
  ['oil_sesame', '胡麻油', { sesame: 2 }, 5, 1, '炒った胡麻を搾った濃い香りの油。', [{ k: 'trade' }], null, 'nefer'],
  ['oil_poppy', '芥子の実の油', { poppy_seed: 2 }, 4, 0, '芥子の実を搾った淡い油。', [{ k: 'craft', note: '絵の具の油' }]],
  ['oil_hemp', '麻の実の油', { hemp_seed: 2 }, 2, 0, '麻の実を搾った緑色の油。', [{ k: 'fuel' }]],
  ['oil_coconut', '椰子の油', { coconut: 2 }, 3, 1, '椰子の実の白い脂。島では料理にも髪にも使う。', [{ k: 'wear', note: '髪と肌の手入れ' }], null, 'mahina'],
  ['oil_fish', '魚油', { herring: 3 }, 1, 1, '鰊を煮て浮いた脂。臭いが強く、食べるより灯りに使う。', [{ k: 'fuel', note: '港の灯り' }, { k: 'craft', note: '革と船の手入れ' }]],
  ['oil_whale', '鯨油', { whale_meat: 2 }, 3, 0, '鯨の脂を煮出した油。よく燃え、煙が少ない。', [{ k: 'fuel', note: '灯台と館の灯り' }, { k: 'trade' }], null, 'mahina'],
];
for (const [id, name, from, v, demand, desc, extra, grade, tribe] of OIL) {
  const edible = !['oil_fish', 'oil_whale'].includes(id);
  add({ id, name, sub: 'oil', w: 1, v, stack: 10, rare: grade ? 1 : 0, make: mk(from, 'miller', 2), how: 'cook', food: 3, noEat: true, keep: 365, demand, grade, tribe,
    use: [...(edible ? [{ k: 'craft', note: '炒め物・揚げ物・和え物' }] : []), ...extra], desc });
}

// ---- 香辛料（挽いたもの・合わせたもの）----
// [id, 名前, 原料, 値, 需要, 希少, 説明, 追加]
const SPICE = [
  ['ground_pepper', '挽き胡椒', 'peppercorn', 12, 1, 1, '南の海の果てから来る黒い粒を挽いたもの。同じ重さの銀と取り引きされたこともある。', [{ k: 'medicine', note: '腹を温める' }]],
  ['ground_white_pepper', '白胡椒', 'peppercorn', 15, 0, 1, '胡椒の皮をむいて挽いた、白く上品な辛み。'],
  ['ground_long_pepper', '長胡椒', 'long_pepper', 14, 0, 2, '細長い房の胡椒を挽いた、甘い辛み。'],
  ['ground_cinnamon', '肉桂の粉', 'cinnamon_bark', 10, 1, 1, '木の皮を巻いて乾かし挽いた甘い香りの粉。菓子と温め酒に。'],
  ['ground_clove', '丁子の粉', 'clove', 12, 0, 1, '釘の形の花の蕾を挽いたもの。歯の痛みにも効く。', [{ k: 'medicine', note: '歯の痛みに' }]],
  ['ground_nutmeg', '肉荳蔲の粉', 'nutmeg', 14, 0, 2, '遠い島の種を削った香り高い粉。'],
  ['spice_mace', '肉荳蔲の赤皮', 'nutmeg', 18, 0, 2, '肉荳蔲の種を包む赤い網を乾かしたもの。種より高い。'],
  ['ground_ginger', '干し生姜の粉', 'ginger', 5, 1, 0, '生姜を干して挽いた粉。焼き菓子と薬に。', [{ k: 'medicine', note: '冷えと吐き気に' }]],
  ['ground_saffron', '番紅花', 'saffron', 60, 0, 2, '花の赤いめしべだけを集めて干したもの。料理を金色に染める、世界で最も高い香辛料。', [{ k: 'dye', note: '金色の染め物' }, { k: 'medicine' }]],
  ['ground_cardamom', '小荳蔲', 'cardamom', 12, 0, 1, '緑の莢の中の香り高い種。茶と菓子に。'],
  ['ground_cumin', '馬芹の実', 'cumin', 3, 1, 0, '砂海の料理に欠かせない、土の香りの種。'],
  ['ground_coriander', '胡荽の実', 'coriander', 2.5, 1, 0, '柑橘に似た香りの丸い種。腸詰めに入れる。'],
  ['anise_seed', '茴香の種', 'anise', 3, 0, 0, '甘い香りの種。菓子と酒と腹の薬に。', [{ k: 'medicine', note: '腹の張りに' }]],
  ['caraway_seed', '姫茴香の種', 'caraway', 2, 1, 0, '黒パンと酢漬け甘藍に入れる細長い種。'],
  ['ground_mustard', '芥子の粉', 'mustard_seed', 2, 1, 0, '芥子の種の粉。練れば芥子練りになる。'],
  ['ground_chili', '唐辛子の粉', 'chili', 3, 1, 0, '密林の赤い実を干して挽いた、火のように辛い粉。', [{ k: 'medicine', note: '体を温める' }]],
  ['vanilla_pod', '香り莢', 'vanilla', 40, 0, 2, '密林の蘭の莢を何か月も汗をかかせて黒くしたもの。甘い香りの王。', [{ k: 'luxury' }]],
  ['grains_paradise', '楽園の粒', 'paradise_grain', 16, 0, 2, '南の海岸から来る、胡椒に似た香りの粒。温め酒に使う。'],
  ['sumac_ground', '漆の実の粉', 'sumac', 3, 0, 0, '赤い実を挽いた酸っぱい粉。砂海の料理にふる。', [], 'nefer'],
  ['juniper_dried', '干し杜松の実', 'juniper_berry', 2, 1, 0, '杜松の青黒い実を干したもの。獣肉とキャベツと酒に。'],
  ['bay_dried', '干し月桂樹の葉', 'bay_leaf', 1.5, 1, 0, '煮込みに一枚入れる、乾かした月桂樹の葉。', [{ k: 'ritual', note: '勝者の冠' }]],
  ['herbs_dried_mix', '香草の合わせ', 'herbs', 2, 2, 0, '立麝香草・迷迭香・鼠尾草などを乾かして合わせたもの。どの家の台所にも吊してある。'],
  ['herbs_fines', '細香草の合わせ', 'parsley', 3, 1, 0, '刻んだ芹・蒔蘿・胡葱の若葉を合わせたもの。卵と魚に。'],
  ['ground_spice_sweet', '甘い香辛料の合わせ', 'cinnamon_bark', 14, 0, 1, '肉桂・生姜・丁子・肉荳蔲を合わせた粉。菓子と温め酒に。'],
  ['ground_spice_strong', '強い香辛料の合わせ', 'peppercorn', 16, 0, 1, '胡椒・丁子・楽園の粒を合わせた辛い粉。肉料理と薬に。'],
  ['spice_royal_box', '王家の香辛料箱', 'saffron', 250, 0, 3, '番紅花・香り莢・肉荳蔲の赤皮などを銀の小箱に詰めた、王家の台所の宝。', [{ k: 'collect', note: '銀の小箱' }, { k: 'gift', note: '外交の贈り物' }]],
  ['rosewater', '薔薇水', 'rose_petal', 8, 0, 1, '薔薇の花びらを蒸して集めた香りの水。菓子と手洗いに。', [{ k: 'wear', note: '香水・手洗い' }, { k: 'ritual' }]],
  ['orange_flower_water', '橙花水', 'orange', 8, 0, 1, '橙の花を蒸して集めた香りの水。菓子の香りづけに。', [{ k: 'wear', note: '香水' }]],
];
for (const [id, name, raw, v, demand, rare, desc, extra = [], tribe] of SPICE) {
  const box = id === 'spice_royal_box';
  add({ id, name, sub: 'spice', w: box ? 0.5 : 0.05, v, stack: box ? 1 : 30, rare, make: mk({ [raw]: box ? 0.5 : 0.1 }, box ? 'cook' : ['rosewater', 'orange_flower_water'].includes(id) ? 'alchemist' : 'herbalist', 1), how: 'cook',
    trade: rare >= 1, food: 1, noEat: true, keep: undefined, demand, tribe, grade: box ? 'royal' : undefined,
    use: [{ k: 'craft', note: '料理・菓子・酒の香りづけ' }, ...(rare >= 1 ? [{ k: 'trade', note: '高い交易品' }, { k: 'luxury', note: '富のしるし' }] : []), ...extra], desc });
}

// ---- 砂糖・蜜 ----
const SUGAR = [
  ['honey', 'はちみつ', null, 'beekeeper', 5, 2, 0, '養蜂家の巣箱からとれる蜂蜜。甘みと薬と酒のもと。', [{ k: 'craft', note: '菓子・蜂蜜酒・料理' }, { k: 'medicine', note: '傷とのど' }, { k: 'trade' }, { k: 'gift' }], [{ how: 'harvest', on: ['farm', 'field'] }, { how: 'forage', on: ['forest'], rate: 0.1 }]],
  ['honey_wildflower', '野の花の蜜', null, 'beekeeper', 5, 1, 0, '野原の百の花から集めた、季節ごとに味の変わる蜜。', [{ k: 'craft' }], [{ how: 'harvest', on: ['field'] }]],
  ['honey_heather', '石楠花草の蜜', null, 'beekeeper', 8, 1, 1, '丘の石楠花草の、濃くとろりとした赤茶の蜜。', [{ k: 'craft', note: '蜂蜜酒' }, { k: 'trade' }], [{ how: 'harvest', on: ['hill'] }]],
  ['honey_forest', '森の黒蜜', null, 'beekeeper', 7, 1, 1, '森の木の蜜露から集めた黒く苦い蜜。フィアナの民の名産。', [{ k: 'craft', note: '森の蜜酒' }, { k: 'medicine', note: '傷の手当て' }], [{ how: 'forage', on: ['forest', 'dense'], rate: 0.15 }], 'fianna'],
  ['honey_linden', '菩提樹の蜜', null, 'beekeeper', 9, 0, 1, '菩提樹の花の、白く澄んだ上品な蜜。', [{ k: 'craft', note: '王家の蜂蜜酒' }, { k: 'gift' }], [{ how: 'harvest', on: ['town', 'field'] }]],
  ['honey_clover', '白詰草の蜜', null, 'beekeeper', 5, 1, 0, '牧草地の白詰草の、淡く軽い蜜。', [{ k: 'craft' }], [{ how: 'harvest', on: ['farm', 'grass'] }]],
  ['royal_jelly', '女王蜂の乳', null, 'beekeeper', 40, 0, 2, '女王蜂を育てる白い乳。若さを保つと貴婦人が欲しがる。', [{ k: 'medicine', note: '若さを保つという' }, { k: 'luxury' }, { k: 'gift' }], [{ how: 'harvest', on: ['farm'] }]],
  ['honeycomb', '蜂の巣', null, 'beekeeper', 6, 1, 0, '蜜の詰まった巣をそのまま切り出したもの。噛めば蜜があふれ、蝋が残る。', [{ k: 'luxury', note: '子どものごちそう' }, { k: 'craft', note: '蜜と蝋に分ける' }], [{ how: 'forage', on: ['forest', 'grass', 'savanna'], rate: 0.1 }, { how: 'harvest', on: ['farm'] }]],
  ['sugar', '砂糖', { sugarcane: 3 }, 'confectioner', 8, 1, 1, '南の甘蔗の汁を煮詰めて固め、白くした砂糖。蜂蜜より高い。', [{ k: 'craft', note: '菓子・酒・薬' }, { k: 'trade', note: '高い交易品' }, { k: 'luxury' }]],
  ['sugar_brown', '黒砂糖', { sugarcane: 2 }, 'confectioner', 4, 1, 0, '白くする前の茶色い砂糖。船乗りが舐める。', [{ k: 'craft' }, { k: 'trade' }]],
  ['sugar_loaf', '砂糖の塊', { sugar: 3 }, 'confectioner', 26, 0, 1, '円錐形に固めた砂糖。鋏で割って少しずつ使う、館の蔵の宝。', [{ k: 'trade' }, { k: 'gift', note: '館への贈り物' }, { k: 'collect' }]],
  ['maple_syrup', '楓の蜜', { maple_sap: 10 }, 'household', 6, 0, 0, '楓の樹液を大鍋で一日煮詰めた琥珀色の蜜。', [{ k: 'craft', note: '菓子と甘み' }, { k: 'trade' }]],
  ['birch_syrup', '白樺の蜜', { birch_sap: 20 }, 'household', 9, 0, 1, '白樺の樹液を煮詰めた、少し苦い蜜。量がとれない。', [{ k: 'craft' }], null, 'fianna'],
  ['grape_molasses', '葡萄の煮詰め蜜', { juice_grape: 4 }, 'household', 3, 1, 0, '葡萄の汁を煮詰めた黒い蜜。砂糖の代わりに使う。', [{ k: 'craft', note: '菓子と料理の甘み' }]],
  ['cacao_paste', 'カカオの練り物', { cacao: 1 }, 'household', 10, 0, 1, 'カカオの豆を炒って石の上ですりつぶした黒い練り物。', [{ k: 'craft', note: '甘い豆の飲み物と菓子' }, { k: 'trade', note: 'ミクトラ族の名産' }, { k: 'ritual', note: '日の頂の祭りの供え物' }], null, 'mictla'],
];
for (const [id, name, from, by, v, demand, rare, desc, use, src, tribe] of SUGAR) {
  const hive = !from;
  add({ id, name, sub: hive ? 'honey' : id === 'cacao_paste' ? 'cacao' : 'sugar', w: 0.5, v, stack: 20, rare, src: hive ? src : undefined, make: hive ? undefined : mk(from, by, 6), how: 'cook',
    trade: !hive && ['sugar', 'sugar_brown', 'cacao_paste'].includes(id), food: id === 'royal_jelly' ? 2 : 10, keep: id === 'royal_jelly' ? 30 : id === 'honeycomb' ? 180 : undefined,
    demand, tribe, limit: hive && src.some((s) => s.how === 'forage') ? 'grove' : undefined, use, fx: id === 'royal_jelly' ? { hp: 3 } : undefined, desc });
}

// ---- 嗜好品：香草の葉（煙を楽しむ）・嗅ぎ薬・噛み物 ----
const SMOKE = [
  ['smokeleaf_cut', '刻み香草葉', { smokeleaf: 0.2 }, 2, 2, 0, '香草の葉を干して刻んだもの。煙管で吸う。港と酒場の男の楽しみ。'],
  ['smokeleaf_aged', '熟成の刻み葉', { smokeleaf: 0.3 }, 5, 1, 0, '三年寝かせて甘みの出た刻み葉。'],
  ['smokeleaf_honey', '蜜漬けの刻み葉', { smokeleaf: 0.2, honey: 0.02 }, 4, 1, 0, '蜂蜜に漬けて干した甘い香りの刻み葉。'],
  ['smokeleaf_cherry', '桜木燻しの刻み葉', { smokeleaf: 0.2 }, 5, 0, 0, '桜の木の煙でいぶした、赤茶色の刻み葉。'],
  ['smokeleaf_twist', '縒り葉', { smokeleaf: 0.3, grape_molasses: 0.02 }, 3, 1, 0, '葉を縄のように縒った船乗りの葉。噛んでも吸ってもよい。'],
  ['smokeleaf_noble', '貴族の合わせ葉', { smokeleaf: 0.3, rose_petal: 0.01 }, 15, 0, 1, '異国の葉と薔薇を合わせた、書斎で吸う上品な葉。', 'noble'],
  ['smokeleaf_royal', '王家の献上葉', { smokeleaf: 0.4, vanilla_pod: 0.05 }, 60, 0, 2, '香り莢で香りづけし、金の紙で巻いた献上品の葉。', 'royal'],
  ['smokeleaf_black', '鉱夫の黒葉', { smokeleaf: 0.3 }, 2.5, 1, 0, '煙の強い黒い葉。坑道の外で一服する鉱夫の楽しみ。'],
  ['smoke_bark_forest', '森の樹皮の煙草', { herbs: 0.1, birch_leaf: 0.05 }, 1.5, 0, 0, 'フィアナの民が長老の集いで回す、樹皮と薬草を合わせた煙。', null, 'fianna'],
  ['smoke_ceremonial', '儀式の煙の葉', { smokeleaf: 0.2, herbs: 0.05 }, 8, 0, 1, 'ミクトラ族の祭司が雨の四兄弟に煙を捧げるときの葉。', null, 'mictla'],
  ['smoke_steppe_herb', '草原の香り葉', { sage: 0.1, smokeleaf: 0.1 }, 2, 0, 0, '鼠尾草と葉を合わせた、ドルグ族の天幕の煙。', null, 'dorgu'],
  ['snuff_plain', '嗅ぎ薬', { smokeleaf_cut: 0.1 }, 4, 1, 0, '葉をごく細かく挽いた粉。鼻から吸ってくしゃみをすると頭がすっきりする。'],
  ['snuff_mint', '薄荷の嗅ぎ薬', { smokeleaf_cut: 0.1, mint: 0.01 }, 5, 0, 0, '薄荷の香りの嗅ぎ薬。書記と学者が好む。'],
  ['snuff_rose', '薔薇の嗅ぎ薬', { smokeleaf_cut: 0.1, rose_petal: 0.01 }, 9, 0, 1, '薔薇の香りの嗅ぎ薬。貴婦人が小箱に入れて持ち歩く。', 'noble'],
  ['snuff_clove', '丁子の嗅ぎ薬', { smokeleaf_cut: 0.1, ground_clove: 0.005 }, 8, 0, 1, '丁子の香りの嗅ぎ薬。'],
  ['snuff_royal', '王家の嗅ぎ薬', { smokeleaf_aged: 0.1, ground_saffron: 0.002 }, 40, 0, 2, '金の嗅ぎ箱に入った、王の御前でだけ開ける嗅ぎ薬。', 'royal'],
  ['chewnut', '噛み木の実', { chewnut_raw: 1 }, 1, 1, 0, '南の木の実を干して割ったもの。噛むと口が赤くなり、疲れを忘れる。'],
  ['chewnut_spiced', '香辛料の噛み包み', { chewnut_raw: 1, ground_cardamom: 0.005 }, 3, 0, 0, '噛み木の実を葉で包み、小荳蔲をはさんだもの。'],
  ['mastic_chew', '乳香の噛み樹脂', { mastic_resin: 0.05 }, 6, 0, 1, '島の木の樹脂の粒。噛むと松に似た香りで口が清まる。'],
  ['pine_resin_chew', '松脂の噛み玉', { pine_resin: 0.05 }, 0.5, 1, 0, '松脂を煮て固めた噛み玉。北の子どもが噛む。', null, 'yarvi'],
  ['kola_chew', '眠気払いの実', { kola_nut: 1 }, 3, 0, 1, '苦い赤い実。噛むと一晩眠くならない。見張りと隊商の友。'],
  ['awake_leaf', '目覚めの葉', { awake_leaf_raw: 0.1 }, 4, 0, 1, '山の民が噛む葉。高い所の息苦しさと疲れを和らげる。', null, 'mictla'],
  ['licorice_chew', '甘草の噛み根', { licorice_root: 0.05 }, 1, 1, 0, '甘草の根を干したもの。噛むと甘い。子どもと禁煙した者に。'],
];
for (const [id, name, from, v, demand, rare, desc, grade, tribe] of SMOKE) {
  const smoke = id.startsWith('smoke'), snuff = id.startsWith('snuff');
  const u = [{ k: 'luxury', note: smoke ? '一服して気分が落ち着く' : snuff ? 'くしゃみで頭がすっきりする' : '噛んで気分が上がる' }];
  if (rare >= 1) u.push({ k: 'gift' });
  if (grade === 'royal') u.push({ k: 'collect', note: '金の箱入り' });
  if (['smoke_bark_forest', 'smoke_ceremonial'].includes(id)) u.push({ k: 'ritual', note: '長老の集い・祈り' });
  if (['kola_chew', 'awake_leaf'].includes(id)) u.push({ k: 'medicine', note: '眠気と疲れを払う' });
  if (id === 'mastic_chew') u.push({ k: 'medicine', note: '口の病・息を清める' });
  if (id === 'smokeleaf_cut') u.push({ k: 'trade' });
  add({ id, name, sub: smoke ? 'smoke' : snuff ? 'snuff' : 'chew', w: 0.05, v, stack: 30, rare, make: mk(from, smoke || snuff ? 'leafcurer' : 'household', smoke ? 240 : 2), how: 'cook',
    food: 1, noEat: true, keep: undefined, demand, grade, tribe, use: u, fx: { mood: grade === 'royal' ? 6 : 2, ...(['kola_chew', 'awake_leaf', 'chewnut'].includes(id) ? { energy: 3 } : {}) }, desc });
}

// ---- 野で食べられる物（拾ってすぐ食べる）----
const FORAGE = [
  ['tree_grub', '木の幼虫', ['forest', 'dense', 'jungle'], 0.5, 6, 1, '朽ち木を割ると出てくる白い幼虫。焼くと木の実のような味で、迷子の命をつなぐ。', 'herd'],
  ['grub_roasted', '焼き幼虫', null, 1, 8, 1, '木の幼虫を串で炙ったもの。ミクトラ族とボロタ族の子どものおやつ。'],
  ['locust', '飛蝗', ['savanna', 'grass', 'desert'], 0.3, 4, 1, '草原の大きな飛蝗。群れの年には畑を食い荒らす。', 'herd'],
  ['locust_roasted', '炒り飛蝗', null, 0.8, 6, 1, '飛蝗を塩で炒ったもの。砂海の民が袋に入れて持ち歩く。'],
  ['river_snail', '田螺', ['swamp', 'river', 'lake'], 0.3, 4, 1, '沼や川の泥にいる巻貝。茹でて身をほじる。', 'herd'],
  ['wild_greens', '摘み菜', ['grass', 'field', 'forest', 'river'], 0.2, 5, 2, '野原で摘んだ若い葉の寄せ集め。汁の実にする。', 'grove'],
  ['wild_nuts_mix', '拾い木の実', ['forest', 'dense'], 0.5, 8, 1, '森の落ち葉の下から拾った団栗・榛・栗のまじり。', 'grove'],
  ['bird_nest_eggs', '野鳥の卵', ['forest', 'grass', 'beach', 'swamp'], 0.6, 8, 1, '草むらや崖で見つけた野鳥の卵。一度に二つ三つ。', 'herd'],
  ['palm_heart', '椰子の芯', ['jungle', 'beach'], 1, 12, 0, '若い椰子を切った芯。白く甘い。一本の木から一度しかとれない。', 'grove'],
];
for (const [id, name, on, v, food, demand, desc, limit] of FORAGE) {
  const cooked = !on;
  add({ id, name, sub: 'wild', w: 0.1, v, stack: 20, src: on ? [{ how: 'forage', on, rate: 0.3 }] : undefined,
    make: cooked ? mk({ [id === 'grub_roasted' ? 'tree_grub' : 'locust']: 1, ...(id === 'locust_roasted' ? { salt: 0.01 } : {}) }, 'household', 0.2) : undefined,
    food, keep: cooked ? 30 : 3, demand, limit, tribe: id === 'locust_roasted' ? 'nefer' : undefined,
    use: [{ k: 'food', note: cooked ? '持ち歩けるおやつ' : '野で飢えをしのぐ' }, ...(['tree_grub', 'locust'].includes(id) ? [{ k: 'feed', note: '鶏の餌・釣りの餌' }] : []), ...(id === 'river_snail' ? [{ k: 'craft', note: '田螺の香草煮' }] : [])], desc });
}

// ---- 供え物・贈り物 ----
const GIFT = [
  ['offering_basket', '初物の果実籠', { apple: 3, grape: 1, pear: 2 }, 6, 60, 'その年の最初の果実を籠に盛った、神殿と祖霊への供え物。', [{ k: 'ritual', note: '初物の供え物' }, { k: 'gift' }]],
  ['offering_spirit_milk', '精霊への乳の椀', { milk: 0.5, honey: 0.02 }, 1.2, 10, '家の精霊や森の精霊のために、夜に戸口へ置く乳の椀。', [{ k: 'ritual', note: '精霊への供え物' }]],
  ['offering_dead_cake', '死者の日の菓子', { flour_wheat: 0.2, honey: 0.05, sesame: 0.02 }, 2, 14, '死者の日に墓の前に置き、残りを子どもが食べる小さな菓子。', [{ k: 'ritual', note: '死者の日' }]],
  ['offering_salt_bread', 'パンと塩の贈り', { bread: 1, salt: 0.1 }, 4, 40, '新しい家に移った人や客人に、歓迎のしるしとして差し出すパンと塩。', [{ k: 'gift', note: '歓迎のしるし' }, { k: 'ritual', note: '新居の祝い' }]],
  ['gift_sweets_box', '贈答の菓子箱', { marzipan: 0.3, candied_orange: 0.2, sugar_almonds: 0.2 }, 45, 20, '砂糖漬けと練り菓子を木箱に詰めた、身分の高い人への贈り物。', [{ k: 'gift', note: '身分の高い人への贈り物' }, { k: 'luxury' }]],
  ['gift_honey_jar', '贈答の蜜壺', { honey: 1, pottery: 1 }, 12, 40, '絵付けの壺に詰めた蜂蜜。婚約や出産の祝いに。', [{ k: 'gift', note: '祝いの贈り物' }, { k: 'collect', note: '壺は飾りに' }]],
  ['gift_wine_crate', '葡萄酒の贈答箱', { wine_aged_noble: 3 }, 100, 0, '十年物の赤を三本並べた木箱。騎士の叙任や貴族の婚礼の贈り物。', [{ k: 'gift', note: '叙任・婚礼の贈り物' }, { k: 'luxury' }]],
  ['tribute_spirit_offering', '守り神への供え膳', { mead_offering: 1, roast_venison: 1, honey_forest: 0.3 }, 40, 50, '奥地の民が守り神の祠に並べる、蜜酒と炙り肉と黒蜜の膳。', [{ k: 'ritual', note: '守り神への約束' }, { k: 'quest', note: '村を守る儀式' }]],
];
for (const [id, name, from, v, food, desc, use] of GIFT) {
  add({ id, name, sub: 'offering', w: 1, v, stack: 1, rare: v >= 40 ? 1 : 0, make: mk(from, id.startsWith('tribute') ? 'shaman' : id.startsWith('gift') ? 'confectioner' : 'household', 1),
    food: food || undefined, drink: id === 'gift_wine_crate' ? 60 : undefined, keep: id === 'gift_wine_crate' || id === 'gift_honey_jar' ? undefined : id === 'gift_sweets_box' ? 180 : 3,
    demand: 1, use, fx: v >= 40 ? { mood: 6 } : undefined, desc });
}

// ---- ほかの担当から頼まれた材料 ----
add({ id: 'oil', name: '植物油', sub: 'oil', w: 1, v: 2, stack: 10, make: mk({ rapeseed: 2 }, 'miller', 2), how: 'cook', trade: true, food: 3, noEat: true, keep: 365, demand: 3,
  use: [{ k: 'craft', note: '炒め物・揚げ物・薬や香油の練り台' }, { k: 'fuel', note: '灯りの油' }, { k: 'trade' }], desc: '菜種や亜麻などの種を搾った、ふつうの植物の油。台所でも工房でも使う。' });
add({ id: 'egg', name: '鶏の卵', sub: 'egg', w: 0.06, v: 0.5, stack: 20, src: [{ how: 'milk', on: ['chicken'] }, { how: 'trade' }], food: 6, keep: 14, demand: 3, limit: 'herd',
  use: [{ k: 'craft', note: '菓子・パン・卵料理・絵の具の練り' }, { k: 'ritual', note: '春の祭りの色卵' }], desc: '鶏小屋で毎朝集める卵。' });
add({ id: 'duck_egg', name: '鴨の卵', sub: 'egg', w: 0.08, v: 0.7, stack: 20, src: [{ how: 'milk', on: ['duck'] }, { how: 'forage', on: ['swamp', 'river'], rate: 0.1 }], food: 8, keep: 14, demand: 1, limit: 'herd',
  use: [{ k: 'craft', note: '塩漬け卵' }], desc: '鶏の卵より大きく濃い味の卵。' });
add({ id: 'cacao', name: 'カカオの豆', sub: 'cacao', w: 0.5, v: 6, stack: 20, rare: 1, src: [{ how: 'harvest', on: ['jungle'] }, { how: 'trade' }], food: 4, noEat: true, keep: 365, demand: 1, limit: 'grove', tribe: 'mictla',
  use: [{ k: 'craft', note: '苦い神の飲み物・練り菓子' }, { k: 'trade', note: '密林ではお金の代わりにもなる' }, { k: 'ritual', note: '日の頂の祭りの供え物' }, { k: 'magic', note: '錬金の材料' }],
  desc: '密林のカカオの実から取り出して発酵させ、干した豆。ミクトラ族の宝。' });
add({ id: 'lemon_juice', name: '柑橘の汁', sub: 'juice', w: 0.3, v: 1.5, stack: 10, make: mk({ citron: 1 }, 'household', 0.2), drink: 5, food: 1, keep: 5, demand: 1,
  use: [{ k: 'craft', note: '料理の酸味・薬の調合・染めの色止め' }, { k: 'medicine', note: '船乗りの歯ぐきの病を防ぐ' }], desc: '香橙を搾った酸っぱい汁。' });
add({ id: 'grape_pomace', name: '葡萄の搾りかす', sub: 'fruit', w: 1, v: 0.1, stack: 20, make: mk({ grape: 3 }, 'vintner', 1), food: 3, noEat: true, keep: 7, demand: 0,
  use: [{ k: 'craft', note: '搾りかすの水割り酒・葡萄の火酒' }, { k: 'feed', note: '豚の餌' }, { k: 'fertilize', note: '葡萄畑に戻す' }], desc: '葡萄酒を搾ったあとに残る皮と種。何ひとつ捨てない。' });
add({ id: 'palm_sap', name: '椰子の樹液', sub: 'water', w: 1, v: 0.4, stack: 5, src: [{ how: 'forage', on: ['beach', 'jungle'], rate: 0.3 }], drink: 20, food: 3, keep: 1, demand: 1, limit: 'grove', tribe: 'mahina',
  use: [{ k: 'craft', note: '椰子の樹液酒・煮詰めて砂糖' }], desc: '椰子の花房を切ると垂れてくる甘い樹液。半日で酒になりはじめる。' });
