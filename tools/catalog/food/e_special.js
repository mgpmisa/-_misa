// 民族の料理と酒・神殿/エルフ/ドワーフの酒・旅と戦の食べ物・薬の飲み物
const { add, mk } = require('./h');

// ---- 民族の料理 ----
// [id, 名前, 小分類, 材料, 作り手, 値, 満腹, 飲み, 日持ち, 需要, 民族, 説明, 追加の使い道, 効き目, 希少]
const TRIBAL = [
  // フィアナの民（深森の弓の民）
  ['fianna_venison_berry', '鹿肉の森苺添え', 'meat', { venison: 0.5, blackberry: 0.1 }, 'hunter', 5, 36, 0, 2, 2, 'fianna', '初矢の祭りで角の王に捧げたあと、皆で分ける鹿の炙り肉。', [{ k: 'ritual', note: '初矢の祭り' }]],
  ['fianna_nut_cake', '木の実と蜜の焼き固め', 'sweet', { hazelnut: 0.2, walnut: 0.1, honey_forest: 0.05 }, 'household', 3, 20, 0, 60, 1, 'fianna', '森の木の実を蜜で固めて石の上で焼いた、弓の民の旅の糧。', [{ k: 'food', note: '狩りの携行食' }]],
  ['fianna_mushroom_pot', '森の茸と野草の鍋', 'stew', { mushroom: 0.4, herbs: 0.1, rabbit_meat: 0.2 }, 'household', 2, 30, 8, 1, 2, 'fianna', '倒木の茸と野草と兎を煮た、深森の家の鍋。', []],
  ['fianna_pine_bread', '松の実の平焼き', 'bread', { pine_nut: 0.1, flour_acorn: 0.3 }, 'household', 2, 26, 0, 7, 1, 'fianna', '団栗の粉に松の実を混ぜて焼く、畑を持たない民のパン。', []],
  ['fianna_smoked_boar', '森の燻し猪', 'meat', { boar_meat: 0.5 }, 'hunter', 6, 30, 0, 45, 1, 'fianna', '倒れた木の枝だけで燻した猪肉。王国の市で高く売れる。', [{ k: 'trade' }]],
  // ヤルヴィ族（雪原のトナカイの民）
  ['yarvi_frozen_fish', '凍り魚の削り身', 'fish', { lakefish: 0.4 }, 'fisher', 3, 20, 0, 30, 1, 'yarvi', '凍った湖の魚を薄く削り、塩をつけて食べる。冬の間じゅう腐らない。', []],
  ['yarvi_reindeer_blood_sausage', 'トナカイの血の腸詰め', 'cured', { reindeer_meat: 0.2, animal_blood: 0.3 }, 'household', 3, 24, 0, 20, 1, 'yarvi', '長い夜の祭りで作る、トナカイの血と脂の腸詰め。', [{ k: 'ritual', note: '長い夜の祭り' }]],
  ['yarvi_lingon_mash', '苔桃のつぶし和え', 'fruit', { lingonberry: 0.5 }, 'household', 1.5, 8, 0, 180, 1, 'yarvi', '苔桃を水に漬けてつぶしたもの。肉に添えれば冬の病を防ぐ。', [{ k: 'medicine', note: '冬の病を防ぐ' }]],
  ['yarvi_bark_bread', '松の甘皮のパン', 'bread', { pine_bark: 0.3, flour_rye: 0.1 }, 'household', 0.6, 20, 0, 30, 0, 'yarvi', '飢えた冬に松の甘皮を粉にして焼く、苦いパン。', [{ k: 'quest', note: '飢えた冬の救い' }]],
  ['yarvi_reindeer_stew', 'トナカイの焚き火鍋', 'stew', { reindeer_meat: 0.4, snowmelt: 0.5 }, 'household', 3, 38, 10, 1, 2, 'yarvi', '九つの石の火床で煮る、トナカイ肉の白い汁。', []],
  // マヒナの民（島々の舟の民）
  ['mahina_taro_paste', '芋の練り粥', 'porridge', { taro: 1 }, 'household', 1, 30, 5, 5, 3, 'mahina', '蒸した芋をつぶして寝かせた、少し酸っぱい紫の練り粥。島の主食。', []],
  ['mahina_coconut_fish', '椰子の乳の魚煮', 'fish', { fish: 0.4, coconut: 1 }, 'household', 3, 30, 5, 1, 2, 'mahina', '魚を椰子の乳で煮た、白く甘い島の料理。', []],
  ['mahina_raw_fish', '柑橘締めの生魚', 'fish', { tuna: 0.3, citron: 0.2 }, 'fisher', 4, 22, 0, 1, 1, 'mahina', '獲れたての魚を香橙の汁と塩で締めたもの。', []],
  ['mahina_pit_pig', '土窯焼きの豚', 'meat', { pork: 3, banana_leaf: 1 }, 'household', 18, 150, 0, 2, 0, 'mahina', '焼け石と葉で包んで地面の穴で一日蒸し焼きにする、島の宴の豚。', [{ k: 'ritual', note: '大潮の送りの宴' }]],
  ['mahina_seaweed_salad', '海藻の和え物', 'veg', { seaweed: 0.2 }, 'household', 1, 8, 0, 2, 1, 'mahina', '浜の海藻を塩と椰子の油で和えたもの。', []],
  ['mahina_breadfruit', 'パンの実の蒸し焼き', 'veg', { breadfruit: 1 }, 'household', 1, 34, 0, 2, 2, 'mahina', '島に生るパンの実を丸ごと焼いた、パンのような芋のような糧。', []],
  // ミクトラ族（翠の密林の民）
  ['mictla_tortilla', '玉蜀黍の薄焼き', 'bread', { flour_maize: 0.3 }, 'household', 0.8, 20, 0, 2, 3, 'mictla', '灰汁で煮た玉蜀黍をすりつぶして焼く、密林の民の毎日のパン。', []],
  ['mictla_tamale', '葉包みの蒸し玉蜀黍', 'bread', { flour_maize: 0.3, bean: 0.1, banana_leaf: 0.2 }, 'household', 1.5, 28, 0, 3, 2, 'mictla', '玉蜀黍の生地に豆や肉を包み、葉でくるんで蒸したもの。', [{ k: 'ritual', note: '雨呼びの祭りの供え物' }]],
  ['mictla_bean_maize', '豆と玉蜀黍の煮込み', 'stew', { bean: 0.3, maize: 0.3, chili: 0.02 }, 'household', 1, 34, 8, 2, 3, 'mictla', '豆と玉蜀黍と唐辛子の、密林の民の力の素。', []],
  ['mictla_chili_sauce', '唐辛子のたれ', 'sauce', { chili: 0.1, tomato: 0.2 }, 'household', 1.5, 2, 0, 5, 2, 'mictla', '焼いた唐辛子と赤い実をすりつぶした辛いたれ。', [{ k: 'craft', note: '料理の味付け' }]],
  ['mictla_turkey_mole', '七面鳥の黒いたれ煮', 'meat', { turkey_meat: 0.5, cacao: 0.05, chili: 0.02 }, 'cook', 14, 38, 0, 2, 0, 'mictla', '七面鳥をカカオと唐辛子の黒いたれで煮た、日の頂の祭りのごちそう。', [{ k: 'ritual', note: '日の頂の祭り' }], null, 1],
  // ドルグ族（風の草原の騎馬の民）
  ['kumis', '馬乳酒', 'ale', { mare_milk: 2 }, 'shepherd', 2, 8, 22, 5, 2, 'dorgu', '馬の乳を革袋で千回かき回して醸した、酸っぱく泡立つ酒。草原の民の命の飲み物。', [{ k: 'luxury', note: '気分が上がる' }, { k: 'trade', note: 'ドルグ族の名産' }, { k: 'medicine', note: '胸の病に効くという' }], { drunk: 0.08, mood: 2 }],
  ['dorgu_boiled_mutton', '茹で羊の大皿', 'meat', { mutton: 1, salt: 0.02 }, 'household', 6, 70, 0, 2, 2, 'dorgu', '羊を骨ごと塩茹でして大皿に盛る。客にはいちばん良い部位を出す。', [{ k: 'gift', note: '客へのもてなし' }]],
  ['dorgu_stone_goat', '焼け石の蒸し山羊', 'meat', { goat_meat: 2 }, 'household', 10, 110, 0, 2, 0, 'dorgu', '山羊の腹に焼け石を詰めて内側から蒸し焼く、角の宴の料理。', [{ k: 'ritual', note: '角の宴' }]],
  ['dorgu_meat_dumpling', '草原の肉包み', 'dumpling', { mutton: 0.2, flour_wheat: 0.2 }, 'household', 2, 26, 0, 2, 2, 'dorgu', '羊肉を小麦の皮で包んで蒸した、草原の祝い日の包み。', []],
  ['dorgu_horse_sausage', '馬肉の腸詰め', 'cured', { horse_meat: 0.5, salt: 0.03 }, 'butcher', 5, 26, 0, 120, 1, 'dorgu', '馬の脂身ごと詰めて干した、騎馬の民の冬の腸詰め。', [{ k: 'trade' }]],
  ['dorgu_milk_tea', '草原の乳茶', 'tea', { tea_brick: 0.02, mare_milk: 0.3, salt: 0.005 }, 'household', 1.5, 6, 25, 1, 2, 'dorgu', '固め茶を馬の乳と塩で煮た、草原の民が朝から晩まで飲む茶。', [{ k: 'gift', note: '客にまず出す' }]],
  // ネフェル族（砂海の墓守）
  ['nefer_sand_bread', '砂焼きのパン', 'bread', { flour_wheat: 0.4 }, 'household', 1, 26, 0, 4, 3, 'nefer', '熱い砂にうずめて焼く平たいパン。砂を払って食べる。', []],
  ['nefer_lentil_date', '豆とナツメヤシの煮込み', 'stew', { lentil: 0.3, dried_date: 0.1, ground_cumin: 0.005 }, 'household', 2, 32, 8, 2, 2, 'nefer', '平たい豆とナツメヤシを馬芹で煮た、甘くて香ばしい煮込み。', []],
  ['nefer_date_syrup', 'ナツメヤシの蜜', 'sugar', { date: 2 }, 'household', 4, 10, 0, 365, 1, 'nefer', 'ナツメヤシを煮詰めた黒く濃い蜜。砂海の甘味。', [{ k: 'craft', note: '菓子と料理の甘み' }, { k: 'trade' }]],
  ['sesame_paste', '胡麻の練り物', 'sauce', { sesame: 0.3 }, 'household', 3, 10, 0, 180, 1, 'nefer', '胡麻を石臼ですりつぶした練り物。雛豆の練り物や菓子に使う。', [{ k: 'craft', note: '料理と菓子の材料' }]],
  ['nefer_star_feast', '星の名づけの皿', 'meat', { camel_meat: 0.5, dried_apricot: 0.1, dried_date: 0.1 }, 'household', 12, 50, 0, 2, 0, 'nefer', '亡くなった人に星を選ぶ夜、駱駝の肉と干し果実を炊いて皆で食べる皿。', [{ k: 'ritual', note: '星の名づけ' }], null, 1],
  // ガライ族（鉄峰の鉱夫の民）
  ['garai_goat_stew', '崖山羊の煮込み', 'stew', { goat_meat: 0.4, cave_mushroom: 0.2 }, 'household', 3, 38, 8, 2, 2, 'garai', '崖の山羊と坑道の白茸を炉で一晩煮た、鉄峰の家の味。', []],
  ['garai_lard_bread', '豚脂を塗った黒パン', 'bread', { bread_black: 1, lard: 0.05 }, 'household', 2.5, 50, 0, 3, 2, 'garai', '厚く切った黒パンに豚脂と塩を塗った、坑夫の朝食。', []],
  ['garai_smoked_goat', '炉の燻し山羊', 'meat', { goat_meat: 0.5 }, 'household', 5, 30, 0, 60, 1, 'garai', '共同の炉の煙で燻した山羊の脚。炉開きに最初の一切れを祖霊へ。', [{ k: 'ritual', note: '炉開き' }]],
  ['ale_miner_black', '坑夫の黒麦酒', 'ale', { malt_dark: 0.2, malt_barley: 0.3 }, 'brewer', 3, 5, 20, 60, 2, 'garai', '坑道から上がった坑夫が必ず飲む、焦がし麦の濃い黒麦酒。', [{ k: 'luxury', note: '疲れがとれる' }], { drunk: 0.2, mood: 3 }],
  // ボロタ族（霧の沼の民）
  ['bolota_eel_stew', '鰻と葦の芽の煮込み', 'stew', { eel: 0.4, cattail_root: 0.3 }, 'household', 3, 36, 8, 1, 2, 'bolota', '沼の鰻と葦の根を泥炭の火で煮た、霧の民の鍋。', []],
  ['bolota_frog_legs', '大蛙の腿の揚げ物', 'meat', { frog_meat: 0.3, flour_wheat: 0.05, lard: 0.03 }, 'household', 2.5, 20, 0, 1, 1, 'bolota', '大蛙の腿を揚げたもの。鶏に似た淡い味。', []],
  ['bolota_cattail_bread', '蒲の根のパン', 'bread', { cattail_root: 0.5 }, 'household', 0.8, 26, 0, 5, 2, 'bolota', '蒲の根を干して粉にし、焼いた沼の民のパン。', []],
  ['bolota_pike_dumpling', 'カワカマスの魚団子', 'fish', { pike: 0.4, breadcrumbs: 0.1, egg: 1 }, 'household', 3, 28, 0, 1, 1, 'bolota', 'カワカマスの身を叩いて団子にし、茹でたもの。', []],
  ['bolota_peat_fish', '泥炭燻しの魚', 'fish', { fish: 0.4 }, 'fisher', 3, 20, 0, 45, 1, 'bolota', '泥炭の煙でいぶした、土の香りの魚。', [{ k: 'trade' }]],
  ['bolota_snail_pot', '田螺の香草煮', 'fish', { river_snail: 0.3, garlic: 0.02 }, 'household', 2, 16, 0, 1, 1, 'bolota', '沼の田螺を大蒜と香草で煮た、酒のつまみ。', []],
  ['bolota_first_fish', '初魚の供え皿', 'fish', { fish: 0.5, bread: 1 }, 'household', 4, 40, 0, 1, 0, 'bolota', '春の最初の魚とパンを葦の舟にのせて沼へ流す、初魚の祭りの皿。', [{ k: 'ritual', note: '初魚の祭り' }]],
  // ハルン族（火の山の民）
  ['harn_steamed_potato', '温泉蒸しの芋', 'veg', { potato: 1 }, 'household', 0.8, 26, 0, 2, 3, 'harn', '温泉の湯気の穴に芋を入れて蒸したもの。ほっくり甘い。', []],
  ['harn_bean_paste', '火山豆の練り物', 'veg', { bean: 0.3, salt_black: 0.01 }, 'household', 1.5, 20, 0, 60, 2, 'harn', '火山灰の畑の豆を煮て黒い塩で練った、日持ちのするおかず。', []],
  ['harn_obsidian_meat', '黒曜の板焼き肉', 'meat', { goat_meat: 0.4 }, 'household', 4, 32, 0, 1, 1, 'harn', '熱い黒曜石の板で肉を焼く、火の山の民の料理。', []],
  ['harn_ash_valley_soup', '灰の谷の汁', 'soup', { potato: 0.3, bean: 0.2, herbs: 0.02 }, 'household', 1, 26, 10, 1, 1, 'harn', '捨ててきた故郷の谷を思い、灰の谷の夜に作る薄い汁。', [{ k: 'ritual', note: '灰の谷の夜' }]],
  // エルダの灯守（古王国の末裔）
  ['elda_herb_bread', '灯守の薬草パン', 'bread', { flour_spelt: 0.4, herbs: 0.05 }, 'household', 4, 36, 0, 7, 1, 'elda', '古い写本にある配合の薬草を練りこんだ、隠れ谷のパン。', [{ k: 'medicine', note: '疲れ目と頭痛に' }], { hp: 1 }],
  ['elda_ancient_soup', '古王国の薬膳汁', 'soup', { herbs: 0.1, mushroom: 0.2, lentil: 0.1 }, 'household', 5, 24, 10, 1, 0, 'elda', '古王国の写本から蘇らせた、七つの薬草の汁。', [{ k: 'medicine', note: '病の回復を早める' }], { hp: 4 }, 1],
  ['elda_scholar_tonic', '書き写しの気つけ', 'tonic', { honey: 0.05, rosemary: 0.02, springwater: 1 }, 'herbalist', 6, 2, 20, 30, 0, 'elda', '夜通し星を写す灯守が飲む、迷迭香と蜂蜜の飲み物。', [{ k: 'medicine', note: '眠気を払う' }], { mood: 3 }, 1],
  ['elda_moon_dew', '月花の露', 'drink', { moonflower: 0.05, springwater: 1 }, 'herbalist', 20, 0, 20, 7, 0, 'elda', '満月の夜にだけ開く花の露を集めた、澄んだ甘い飲み物。', [{ k: 'magic', note: '魔力の回復を助ける' }, { k: 'gift' }], { mood: 5 }, 2],
  // ホリン衆（灰色谷の逃散民）
  ['hollin_escape_porridge', '逃散の夜の麦粥', 'porridge', { groats_barley: 0.4, honey: 0.02 }, 'household', 1, 30, 5, 1, 1, 'hollin', '村を出た夜を忍び、空の麦袋をかぶって谷を歩いたあと皆で食べる麦粥。', [{ k: 'ritual', note: '逃散の夜' }]],
  ['hollin_smoked_ham', '峠の燻しもも', 'cured', { pork: 2, salt: 0.2 }, 'household', 22, 100, 0, 240, 1, 'hollin', '炭焼き窯の煙で燻したもも肉。抜け荷の品として峠を越える。', [{ k: 'trade', note: '峠越えの品' }]],
  ['hollin_charcoal_trout', '炭火の鱒', 'fish', { trout: 0.4, salt: 0.01 }, 'household', 3, 26, 0, 1, 2, 'hollin', '炭焼きの残り火で焼いた谷川の鱒。', []],
  ['hollin_honey_cake', '谷の蜜菓子', 'sweet', { flour_buckwheat: 0.2, honey: 0.1 }, 'household', 2.5, 14, 0, 30, 1, 'hollin', '蕎麦粉と蜂蜜の黒い焼き菓子。糸の番の夜に配る。', [{ k: 'ritual', note: '糸の番' }]],
];
for (const [id, name, sub, from, by, v, food, drink, keep, demand, tribe, desc, extra, fx, rare = 0] of TRIBAL) {
  const brew = ['ale', 'tonic', 'drink', 'tea'].includes(sub) && drink >= 20;
  add({ id, name, sub, w: food >= 100 ? food / 60 : drink ? 1 : Math.max(0.1, food / 70), v, stack: food >= 60 ? 1 : keep >= 30 ? 10 : 3, rare, make: mk(from, by, sub === 'ale' ? 72 : 2), how: brew && sub === 'ale' ? 'brew' : 'cook',
    food: food || undefined, drink: drink || undefined, keep, demand, tribe, use: extra, fx: fx || undefined, desc });
}

// ---- 神殿の酒・エルフの霊酒・ドワーフの火酒 ----
const HOLY = [
  ['holy_wine_cathedral', '大聖堂の祝福酒', 'holy', { wine_red: 1, holyspring: 0.1 }, 'priest', 30, 0.25, 1, '大聖堂の祭壇で七日祈りを捧げた葡萄酒。祝日に司教が掲げる。', [{ k: 'ritual', note: '大祭の儀式' }, { k: 'medicine', note: '病人の枕元で一口' }], { hp: 3, mood: 4 }, null],
  ['holy_mead_pilgrim', '巡礼の蜂蜜酒', 'holy', { mead: 1 }, 'nun', 8, 0.2, 1, '聖地の修道院で巡礼者に売られる小瓶の蜂蜜酒。旅の加護があるという。', [{ k: 'ritual', note: '巡礼' }, { k: 'gift', note: '巡礼の土産' }], { mood: 3 }, null],
  ['holy_altar_wine', '祭壇の供え酒', 'holy', { wine_table: 1 }, 'priest', 4, 0.22, 1, '毎朝祭壇に供え、夕べに下げて貧しい者に分ける葡萄酒。', [{ k: 'ritual', note: '供え物' }], { mood: 2 }, null],
  ['holy_harvest_wine', '豊穣の神の新酒', 'holy', { wine_new: 1 }, 'priest', 6, 0.25, 2, '収穫祭で神に最初に捧げる新酒。畑にも少し撒く。', [{ k: 'ritual', note: '収穫祭' }, { k: 'fertilize', note: '畑に撒く祈り' }], { mood: 3 }, null],
  ['holy_saint_spirit', '聖者の涙', 'holy', { liqueur_herb_monastery: 1, holyspring: 0.2 }, 'priest', 45, 0.4, 0, '聖者の墓の前で百日漬けた薬草酒。一滴で熱が引くと言い伝えられる。', [{ k: 'medicine', note: '熱病の気つけ' }, { k: 'collect', note: '聖遺物に次ぐ宝' }], { hp: 8 }, null, 2],
  ['elf_moondrop', '月雫の霊酒', 'elven', { springwater: 1, moonflower: 0.1, honey_linden: 0.1 }, 'elf_brewer', 80, 0.2, 0, '月の光を百夜あてて醸したと伝わる、青白く光る酒。エルフの国から稀に届く。', [{ k: 'magic', note: '魔力が澄む' }, { k: 'collect', note: '伝説の酒' }], { mood: 10, mana: 5 }, null, 3],
  ['elf_starflower', '星花の霊酒', 'elven', { elderflower: 0.3, honey_linden: 0.2, springwater: 1 }, 'elf_brewer', 60, 0.2, 0, '星の形の白い花を千輪漬けた、飲むと歌いたくなる酒。', [{ k: 'magic' }, { k: 'gift', note: '王への献上品' }], { mood: 12 }, null, 3],
  ['elf_ancient_sap', '古木の樹液酒', 'elven', { birch_sap: 3 }, 'elf_brewer', 50, 0.15, 0, '千年を生きた木の樹液を分けてもらって醸す、森の記憶の酒。', [{ k: 'medicine', note: '老いた体を若返らせるという' }, { k: 'collect' }], { hp: 6, mood: 6 }, null, 3],
  ['elf_millennium_mead', '千年蜜酒', 'elven', { honey_forest: 1, springwater: 1 }, 'elf_brewer', 120, 0.3, 0, 'エルフの蔵で千年眠っていたとされる蜂蜜酒。一口で千年の夏を見る。', [{ k: 'collect', note: '伝説の酒' }, { k: 'gift', note: '王への献上品' }], { mood: 15 }, null, 4],
  ['elf_spirit_dew', '精霊の露', 'elven', { springwater: 1, herbs: 0.05 }, 'elf_brewer', 40, 0.05, 0, '朝露を葉から一粒ずつ集めた、酔わない霊酒。傷ついた者の気を戻す。', [{ k: 'medicine', note: '傷と疲れを癒やす' }, { k: 'magic' }], { hp: 10, mana: 3 }, null, 3],
  ['dwarf_dragonfire', '竜炎の火酒', 'dwarven', { spirit_grain: 2, chili: 0.05 }, 'dwarf_distiller', 45, 0.95, 0, '飲めば口から火を吹くと言われる、ドワーフの山の最も強い酒。', [{ k: 'collect', note: '武勇伝の酒' }, { k: 'quest', note: '酒飲み比べの賞品' }], { drunk: 1, warmth: 10, courage: 5 }, null, 2],
  ['dwarf_ironpeak_black', '鉄峰の黒火酒', 'dwarven', { spirit_rye: 1, malt_dark: 0.2 }, 'dwarf_distiller', 25, 0.85, 0, '焦がし麦で黒く染め、鉄の樽で寝かせたドワーフの火酒。', [{ k: 'trade', note: '山の民の名産' }], { drunk: 0.9, warmth: 8 }, null, 1],
  ['dwarf_lava_drop', '溶岩の雫', 'dwarven', { spirit_grain: 1, sulfurspring: 0.1 }, 'dwarf_distiller', 60, 0.9, 0, '火山の熱で蒸留し、溶岩のように赤く光る火酒。', [{ k: 'collect' }], { drunk: 0.9, warmth: 12 }, null, 3],
  ['dwarf_cavern_aged', '岩窟熟成の火酒', 'dwarven', { spirit_grain: 1 }, 'dwarf_distiller', 70, 0.8, 0, '地底深くの岩窟で百年寝かせた、石のように重い香りの火酒。', [{ k: 'collect', note: '百年物' }, { k: 'gift' }], { drunk: 0.8, warmth: 8, mood: 8 }, null, 3],
  ['dwarf_forge_toast', '鍛冶場の祝い火酒', 'dwarven', { spirit_grain: 1, honey: 0.1 }, 'dwarf_distiller', 18, 0.75, 1, '名剣が打ち上がった日に、炉に一杯注ぎ、残りを職人で回し飲む火酒。', [{ k: 'ritual', note: '刃の打ち上がりの祝い' }], { drunk: 0.8, warmth: 6, mood: 6 }, null, 1],
];
for (const [id, name, sub, from, by, v, drunk, demand, desc, extra, fx, _g, rare = 1] of HOLY) {
  const src = [{ how: 'brew' }];
  if (sub !== 'holy') src.push({ how: 'trade' }, { how: 'loot', on: sub === 'elven' ? ['ruins', 'dungeon'] : ['mine', 'dungeon'] });
  add({ id, name, sub, w: 0.7, v, stack: 5, rare, src, make: mk(from, by, sub === 'holy' ? 24 : 2160), drink: sub === 'elven' ? 25 : 10, food: 1,
    keep: undefined, demand, use: [{ k: 'luxury', note: '気分が上がる' }, ...extra], fx: { drunk, ...fx }, desc });
}

// ---- 旅の保存食・弁当・野戦食 ----
const TRAVEL = [
  ['bento_travel', '旅の弁当', { bread: 1, cheese: 0.2, sausage_dry: 0.2 }, 'household', 5, 70, 3, 2, 'パンと乳酪と乾かし腸詰めを布に包んだ、旅立ちの日の弁当。'],
  ['bento_farmer', '畑の昼の包み', { bread_black: 1, onion: 0.3, cheese: 0.1 }, 'household', 3, 60, 1, 3, '黒パンと玉葱と乳酪。畑に持っていく昼の包み。'],
  ['bento_fisher', '漁師の弁当', { bread: 1, smokedfish_herring: 1 }, 'household', 3.5, 58, 2, 2, 'パンに燻し鰊をはさんだ、舟の上の昼食。'],
  ['bento_shepherd', '羊飼いの弁当', { oatcake: 2, cheese: 0.2 }, 'household', 3, 56, 7, 2, '燕麦の平焼きと乳酪。何日も山にいる羊飼いの糧。'],
  ['bento_hunter', '狩人の包み', { jerky_venison: 1, dried_blueberry: 0.2, bread: 0.5 }, 'hunter', 6, 50, 30, 1, '鹿の干し肉と干し黒苺とパン。森で三日過ごす狩人の包み。'],
  ['bento_adventurer', '冒険者の携行食', { hardtack: 2, jerky: 1, dried_apple: 0.3, cheese_hard: 0.2 }, 'innkeeper', 9, 110, 60, 2, 'ギルドの売店で売る、三日分の干し肉と堅焼きパンと干し果実の袋。'],
  ['bento_pilgrim', '巡礼の袋', { bread_black: 1, dried_fig: 0.2, cheese: 0.1 }, 'nun', 3, 60, 7, 1, '修道院で巡礼者に持たせる、質素な糧の袋。'],
  ['bento_peddler', '行商人の包み', { flatbread: 2, sausage_smoked: 0.3, pickled_onion: 0.2 }, 'household', 4, 60, 14, 1, '平焼きパンと燻し腸詰め。村から村へ歩く行商人の包み。'],
  ['trail_mix', '木の実と干し果実の袋', { hazelnut: 0.1, walnut: 0.1, raisins: 0.1, dried_apricot: 0.1 }, 'household', 4, 24, 120, 1, '木の実と干し果実を混ぜた小袋。歩きながらつまむ。'],
  ['dried_porridge', '干し粥', { flour_oat: 0.3, salt: 0.01 }, 'household', 1, 28, 180, 1, '炒った燕麦に塩を混ぜたもの。湯を注げばすぐ粥になる。'],
  ['noble_hamper', '貴族の遠出の籠', { bread_white: 1, pate_game: 0.2, wine_white: 1, candied_cherry: 0.1 }, 'cook', 40, 90, 2, 0, '白パン・野禽の壺詰め・白葡萄酒・菓子を詰めた、貴族の遠乗りの籠。'],
  ['royal_hunt_feast', '王の狩りの野宴', { venison: 3, bread_white: 4, wine_red: 4, hippocras: 1 }, 'cook', 250, 400, 1, 0, '王の狩りのあと、森の天幕で広げる野宴の料理一式。'],
  ['ration_field', '野戦の乾パン', { hardtack: 2 }, 'soldier', 3, 48, 365, 2, '兵一人の一日分として配る堅焼きパン二枚。'],
  ['ration_ball', '兵糧丸', { flour_oat: 0.1, honey: 0.03, sesame: 0.02, jerky: 0.1 }, 'soldier', 2, 30, 180, 1, '麦と蜂蜜と干し肉を丸めた小さな玉。一粒で半日動けるという。'],
  ['ration_soldier_jerky', '兵の干し肉の束', { jerky: 3 }, 'soldier', 10, 70, 120, 1, '兵に十日分ずつ配る干し肉の束。'],
  ['ration_camp_pot', '陣中の粥', { groats_barley: 0.5, meat_salted: 0.1 }, 'soldier', 1.5, 36, 1, 2, '陣の大鍋で挽き割り大麦と塩漬け肉を煮た粥。'],
  ['ration_siege', '籠城の粉袋', { flour_wheat: 10, salt: 0.5 }, 'miller', 12, 300, 365, 1, '城の蔵に積む、小麦粉と塩の大袋。一人ひと月分。'],
  ['ration_knight', '騎士の携行食', { sausage_dry: 0.5, bread_white: 1, cheese_hard: 0.3, wine_fortified: 0.5 }, 'cook', 20, 100, 30, 1, '騎士が鞍袋に入れる、上等な腸詰めと乳酪と強めの葡萄酒。'],
  ['ration_march_ale', '行軍の配給酒', { ale_ration: 3 }, 'soldier', 2.5, 9, 14, 1, '行軍中に三日分ずつ配る薄い麦酒。'],
  ['ration_sailor', '船乗りの一週間の糧', { ship_biscuit: 7, saltfish_cod: 2, pickled_cabbage: 1 }, 'household', 15, 250, 180, 1, '乾パン七枚と塩漬け鱈と酢漬け甘藍。船乗り一人一週間分。'],
];
for (const [id, name, from, by, v, food, keep, demand, desc] of TRAVEL) {
  const u = [{ k: 'food', note: id.startsWith('ration') ? '行軍・籠城の糧' : '旅の携行食' }];
  if (id.startsWith('ration')) u.push({ k: 'trade', note: '軍と城への卸し' }, { k: 'quest', note: '討伐隊の補給' });
  if (id === 'bento_adventurer') u.push({ k: 'trade', note: 'ギルドの売店の品' });
  if (id === 'noble_hamper' || id === 'royal_hunt_feast') u.push({ k: 'luxury', note: '野遊び' }, { k: 'gift' });
  if (id === 'bento_pilgrim') u.push({ k: 'ritual', note: '巡礼' });
  add({ id, name, sub: 'ration', w: Math.max(0.3, food / 70), v, stack: food >= 150 ? 1 : 5, rare: v >= 100 ? 2 : v >= 30 ? 1 : 0, make: mk(from, by, 0.5), food, drink: id === 'ration_march_ale' ? 60 : undefined,
    keep, demand, grade: by === 'cook' ? (v >= 100 ? 'royal' : 'noble') : undefined, use: u, fx: id === 'ration_ball' ? { hp: 2 } : undefined, desc });
}

// ---- 宿の定食・宴の料理 ----
const INN = [
  ['inn_travelers_plate', '旅人の皿', { stew_meat: 1, bread: 1, ale: 1 }, 6, 90, 20, 3, '煮込みとパンと麦酒一杯。宿でいちばん頼まれる一皿。'],
  ['inn_lunch_set', '宿の昼の定食', { soup_cabbage: 1, bread_roll: 2, sausage_pork: 1 }, 4, 70, 5, 2, '汁と小丸パン二つと腸詰め一本の、昼の定食。'],
  ['inn_supper_fine', '宿の上等な夕食', { roast_chicken: 1, bread_white: 1, wine_inn: 1, pie_apple: 0.2 }, 18, 100, 20, 1, '鶏の炙り焼きと白パンと葡萄酒に林檎のパイ。商人が泊まる夜の夕食。'],
  ['tavern_snack_plate', '酒場のつまみ皿', { pickled_onion: 0.2, cheese: 0.1, pretzel: 1, egg_pickled: 1 }, 3, 36, 0, 2, '酢漬け玉葱と乳酪と結びパンと卵。麦酒のお供。'],
  ['feast_village', '村の宴の大皿', { roast_pork: 4, bread: 6, pie_apple: 1 }, 30, 400, 0, 0, '婚礼や祭りで村人が囲む大皿。豚の炙り焼きとパンとパイ。'],
  ['feast_noble_course', '貴族の宴の三皿', { soup_almond: 1, noble_venison_wine: 1, tart_almond: 0.3 }, 60, 110, 0, 0, '汁、鹿の赤葡萄酒煮、巴旦杏のタルト。館の宴の三皿の流れ。'],
  ['feast_royal_banquet', '王宮の大宴', { royal_peacock: 1, royal_boar_head: 1, soup_consomme_royal: 4, sugar_sculpture: 1, wine_aged_noble: 6 }, 900, 800, 0, 0, '孔雀、猪の頭、澄まし汁、砂糖細工の城。外国の使者を迎える王宮の大宴の料理一式。'],
  ['funeral_meal', '弔いの食事', { bread_funeral: 2, soup_bean: 2, ale: 2 }, 10, 120, 40, 0, '葬儀のあとに遺族が参列者に振る舞う、黒パンと豆の汁と麦酒。'],
];
for (const [id, name, from, v, food, drink, demand, desc] of INN) {
  const royal = id.startsWith('feast_royal'), noble = id.startsWith('feast_noble');
  const u = [];
  if (id.startsWith('feast')) u.push({ k: 'ritual', note: '宴・祝いごと' }, { k: 'luxury', note: '気分が大きく上がる' });
  if (id === 'funeral_meal') u.push({ k: 'ritual', note: '葬儀' });
  if (royal) u.push({ k: 'gift', note: '外交のもてなし' });
  add({ id, name, sub: 'meal', w: food / 60, v, stack: 1, rare: royal ? 3 : noble ? 1 : 0, make: mk(from, royal || noble ? 'cook' : id.startsWith('feast') || id === 'funeral_meal' ? 'household' : 'innkeeper', royal ? 24 : 1),
    food, drink: drink || undefined, keep: 1, demand, grade: royal ? 'royal' : noble ? 'noble' : id.startsWith('inn') || id.startsWith('tavern') ? 'inn' : undefined, use: u,
    fx: { mood: royal ? 20 : noble ? 10 : id.startsWith('feast') ? 8 : 3 }, desc });
}

// ---- 薬と滋養の飲み物 ----
const TONIC = [
  ['syrup_honey_cough', '咳止めの蜂蜜', { honey: 0.1, thyme: 0.02 }, 'herbalist', 3, 2, '蜂蜜に立麝香草を漬けた、子どもの咳止め。', { hp: 3 }, [{ k: 'medicine', note: '咳とのどに' }], 0],
  ['syrup_elderberry', '接骨木の実の蜜', { elderberry: 0.5, honey: 0.1 }, 'herbalist', 3, 2, '接骨木の黒い実を煮詰めた蜜。冬の風邪よけに毎朝ひと匙。', { hp: 2 }, [{ k: 'medicine', note: '風邪よけ' }], 0],
  ['syrup_ginger', '生姜の蜜', { ginger: 0.1, honey: 0.1 }, 'herbalist', 3, 1, '生姜を蜂蜜で煮た辛い蜜。湯に溶いて体を温める。', { warmth: 5 }, [{ k: 'medicine', note: '冷えと腹痛に' }], 0],
  ['syrup_poppy', '芥子の眠り蜜', { poppy_seed: 0.05, honey: 0.1 }, 'herbalist', 8, 0, '芥子の汁を蜂蜜で薄めた眠り薬。医者の許しなく使ってはならない。', { sleep: 10 }, [{ k: 'medicine', note: '痛みで眠れない者に' }], 1],
  ['tonic_garlic', '大蒜の酢漬け', { garlic: 0.2, vinegar_wine: 0.1 }, 'household', 1.5, 1, '大蒜を酢に漬けたもの。一粒ずつかじれば疫病が寄らないという。', { hp: 1 }, [{ k: 'medicine', note: '疫病よけ' }], 0],
  ['tonic_wine_herb', '薬草の葡萄酒', { wine_red: 1, herbs: 0.1 }, 'herbalist', 5, 1, '薬草を葡萄酒に漬けた、年寄りの滋養の酒。', { hp: 3, drunk: 0.1 }, [{ k: 'medicine', note: '年寄りの滋養' }], 0],
  ['tonic_restorative', '滋養の汁', { bone_broth: 1, egg: 1, wine_red: 0.1 }, 'doctor', 6, 1, '骨の出汁に卵と葡萄酒を落とした、医者がすすめる病み上がりの汁。', { hp: 6 }, [{ k: 'medicine', note: '病み上がり' }], 0],
  ['tonic_hangover', '二日酔い覚まし', { pickled_cucumber: 0.2, sour_milk: 0.3, salt: 0.01 }, 'innkeeper', 1.5, 2, '酢漬けの汁と酸乳を混ぜた、酒場の朝の定番。', { drunk: -0.5 }, [{ k: 'medicine', note: '二日酔いに' }], 0],
  ['tonic_strength', '力水', { honey: 0.1, egg: 1, spirit_grain: 0.05, springwater: 0.5 }, 'herbalist', 5, 1, '騎士と兵が鍛錬の前に飲む、蜂蜜と卵と火酒の飲み物。', { hp: 2, courage: 2 }, [{ k: 'medicine', note: '鍛錬の前' }], 0],
  ['tonic_mother', '産後の滋養粥', { flour_oat: 0.2, milk: 0.3, egg: 1, honey: 0.05 }, 'midwife', 3, 1, '産婆が産後の母親に作る、卵と乳の粥。', { hp: 5 }, [{ k: 'medicine', note: '産後の回復' }, { k: 'gift', note: '出産祝い' }], 0],
  ['theriac_honey', '万能の練り蜜', { honey: 0.2, herbs: 0.3, ground_spice_strong: 0.02 }, 'alchemist', 30, 0, '六十の薬を蜂蜜で練った万能薬と言われる黒い練り物。毒にも効くという。', { hp: 12, cure: 1 }, [{ k: 'medicine', note: '毒と疫病に' }, { k: 'trade' }], 2],
];
for (const [id, name, from, by, v, demand, desc, fx, u, rare] of TONIC) {
  add({ id, name, sub: 'tonic', w: 0.2, v, stack: 10, rare, make: mk(from, by, 2), food: ['tonic_mother', 'tonic_restorative'].includes(id) ? 20 : 2,
    drink: ['tonic_wine_herb', 'tonic_restorative', 'tonic_hangover', 'tonic_strength'].includes(id) ? 15 : undefined, keep: ['tonic_mother', 'tonic_restorative', 'tonic_hangover'].includes(id) ? 1 : 365, demand, use: u, fx, desc });
}
