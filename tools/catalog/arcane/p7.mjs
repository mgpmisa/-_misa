import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);
const PR = 'priest', CH = 'chandler', SH = 'shaman';

// ================= 聖印・数珠 =================
const HS = [
  ['holy_symbol_wood', '木の聖印', { wood: 0.1 }, 2, 'carpenter', 0, 3, '村人が首にかける木彫りの聖印。'],
  ['holy_symbol_silver', '銀の聖印', { silver: 0.2 }, 25, 'jeweler', 1, 1, '司祭と僧侶が下げる銀の聖印。'],
  ['holy_symbol_gold', '金の聖印', { gold: 0.2 }, 90, 'jeweler', 2, 1, '大司祭が儀式で掲げる金の聖印。'],
  ['holy_symbol_paladin', '聖騎士の聖印', { holy_silver: 0.3 }, 150, PR, 2, 1, '聖騎士の叙任で授かる聖銀の聖印。不死の魔物が退く。'],
  ['rosary_nut', '木の実の数珠', { nut: 20, yarn: 0.1 }, 2, 'nun', 0, 2, '木の実を連ねた数珠。祈りを数えるのに使う。'],
  ['rosary_bone', '骨の数珠', { bone: 1, yarn: 0.1 }, 4, 'nun', 0, 1, '骨を丸く削った数珠。墓守や僧侶が持つ。'],
  ['rosary_crystal', '水晶の数珠', { quartz: 1, silk: 0.1 }, 40, 'jeweler', 1, 1, '水晶の玉の数珠。祈りが澄むという。'],
  ['rosary_pearl', '真珠の数珠', { pearl: 2, silk: 0.1 }, 120, 'jeweler', 2, 1, '王妃が礼拝に持つ真珠の数珠。'],
];
for (const [id, name, from, v, by, r, d, desc] of HS) C(id, name, 'holy', 0.05, v, by, from, 0.5 + v / 30, { st: 5, r, d, use: U('ritual:祈りが深まる', 'wear', ...(r >= 1 ? ['gift:洗礼と叙任の贈り物'] : ['trade'])), fx: { faith: 2 + r * 2, mood: 1, ...(id.includes('paladin') ? { ward: 'undead' } : {}) }, eq: { slot: 'accessory' }, desc });

// ================= 香 =================
const IN = [
  ['incense_frank', '乳香', { frankincense: 1 }, 10, 2, '教会の礼拝で焚く白い煙の香。', { faith: 3 }],
  ['incense_myrrh', '没薬の香', { myrrh: 1 }, 12, 1, '葬儀と死者の祈りに焚く苦い香。', { faith: 3, calm: true }],
  ['incense_sandal', '白檀の香', { sandalwood: 1 }, 14, 1, '甘く落ち着く香り。瞑想に。', { mood: 3, focus: 3 }],
  ['incense_cedar', '杉の香', { cedar: 1 }, 3, 1, '家の清めに焚く、安い杉の香。', { ward: 'evil' }],
  ['incense_lavender', 'ラベンダーの香', { lavender: 2 }, 4, 1, '寝室で焚くと眠りが深くなる。', { sleep: 2, mood: 2 }],
  ['incense_rose', '薔薇の香', { rose: 3 }, 8, 1, '恋人たちの部屋の甘い香。', { love: 2, mood: 2 }],
  ['incense_mint', '薄荷の香', { mint: 2 }, 3, 1, '病人の部屋の空気を清める香。', { cure: 'cold', sev: 3 }],
  ['incense_holy', '聖香', { incense_frank: 1, incense_myrrh: 1, holy_water: 0.2 }, 30, 1, '大聖堂の大祭でだけ焚く合わせ香。', { faith: 8 }],
  ['incense_ward', '魔除けの香', { cedar: 1, sulfur: 0.2, silver_powder: 0.1 }, 10, 1, '開拓地や墓地で焚くと魔物と死霊が遠のく。', { ward: 'monster', hours: 12 }],
  ['incense_ambergris', '竜涎香の練り香', { ambergris: 0.2, wax: 0.1 }, 80, 0, '王の寝所に焚く、鯨の腹から出た香。', { mood: 6, fame: 1 }],
  ['incense_meditation', '瞑想の香', { sandalwood: 1, clove: 0.5 }, 12, 1, '魔法使いが呪文を練るときに焚く香。', { focus: 6, mana: 5 }],
  ['smudge_bundle', '燻し草の束', { mugwort: 2, sage_herb: 1 }, 2, 1, '奥地の民が家と体を清めるのに燻す草の束。', { ward: 'evil', faith: 1 }],
];
for (const [id, name, from, v, d, desc, fx] of IN) C(id, name, 'incense', 0.05, v, id === 'smudge_bundle' ? SH : 'incense_maker', from, 0.5, { st: 20, r: v >= 30 ? 1 : 0, d, use: U('ritual:焚いて祈る・清める', v >= 30 ? 'luxury' : 'trade', ...(fx.sleep ? ['medicine:よく眠れる'] : [])), fx, desc });
C('censer', '香炉', 'ritual_tool', 1.5, 20, 'smith', { copper: 1 }, 2, { st: 1, d: 1, use: U('tool:香を焚く', 'ritual'), desc: '鎖で振って煙を広げる銅の香炉。' });

// ================= 蝋燭 =================
const CA = [
  ['candle_tallow', '獣脂の蝋燭', { tallow: 0.3, yarn: 0.02 }, 0.5, 3, '臭くて煙が多いが安い蝋燭。庶民の夜の灯り。', { light: 2 }],
  ['candle_beeswax', '蜜蝋の蝋燭', { wax: 0.3, yarn: 0.02 }, 2, 2, '明るく甘い香りの蝋燭。教会と屋敷で使う。', { light: 3 }],
  ['candle_altar', '祭壇の大蝋燭', { wax: 3, yarn: 0.1 }, 15, 1, '大祭のあいだ燃え続ける太い蝋燭。', { light: 5, faith: 2 }],
  ['candle_red', '赤い蝋燭', { wax: 0.3, madder: 0.05 }, 3, 1, '婚礼と祝いの日にともす赤い蝋燭。', { light: 3, love: 1 }],
  ['candle_white', '白い蝋燭', { wax: 0.3, lime: 0.02 }, 3, 1, '洗礼と清めの儀式の白い蝋燭。', { light: 3, faith: 1 }],
  ['candle_black', '黒い蝋燭', { wax: 0.3, lampblack: 0.05 }, 4, 0, '葬儀と、ときには呪いの儀式に使う黒い蝋燭。', { light: 2 }],
  ['candle_scented', '香り蝋燭', { wax: 0.3, lavender: 0.5 }, 5, 1, 'ラベンダーを練り込んだ蝋燭。', { light: 3, mood: 2 }],
  ['candle_prayer', '祈りの小蝋燭', { wax: 0.1 }, 0.5, 2, '教会の燭台に一つずつ灯す小さな蝋燭。願いごとに一本。', { faith: 1 }],
  ['candle_eternal', '永遠の灯の蝋燭', { wax: 1, light_essence: 0.5 }, 60, 0, '魔法で燃え尽きない蝋燭。墓所や聖堂の奥に。', { light: 5, faith: 3 }],
  ['elda_lamp_oil', '灯の油', { oil: 1, light_essence: 0.05 }, 8, 1, 'エルダの灯守が封印の七つの灯を絶やさないための清めた油。', { light: 5, ward: 'undead' }],
];
for (const [id, name, from, v, d, desc, fx] of CA) C(id, name, 'candle', 0.1, v, id === 'elda_lamp_oil' ? 'tribe_elder' : CH, from, 0.3, { st: 20, r: v >= 60 ? 2 : 0, d, use: U('tool:夜の明かり', 'ritual:祈りと儀式', 'fuel'), fx, desc });

// ================= 聖水・聖油・供え物 =================
C('holy_water', '聖水', 'holy', 0.3, 5, PR, { water: 1, refined_salt: 0.1 }, 0.5, { st: 20, d: 2, use: U('ritual:洗礼と清め', 'medicine:傷の清め', 'magic:不死の魔物を退ける'), fx: { faith: 2, ward: 'undead' }, desc: '司祭が祈りをこめた水。死霊が嫌う。', more: [trade()] });
C('holy_water_great', '大聖堂の聖水', 'holy', 0.3, 20, PR, { holy_water: 3, frankincense: 0.2 }, 3, { st: 20, r: 1, d: 1, use: U('ritual', 'magic:強い死霊を払う', 'quest'), fx: { faith: 5, ward: 'undead', dmgUndead: 40 }, desc: '王都の大聖堂で三日祈りをこめた聖水。' });
I('holy_spring_water', '泉の聖水', 'holy', 0.3, 12, { st: 20, r: 1, d: 1, lim: 'none', src: [g('gather', ['mountain', 'forest'], 0.05)], use: U('ritual:巡礼の土産', 'medicine:目と肌の病に効くという'), fx: { faith: 3, hp: 5 }, desc: '奇跡が起きたと伝わる泉の水。巡礼者が汲んで帰る。' });
C('holy_oil', '聖油', 'holy', 0.2, 18, PR, { oil: 1, myrrh: 0.2, holy_water: 0.5 }, 2, { st: 10, r: 1, d: 1, use: U('ritual:戴冠・叙任・臨終の塗油', 'medicine:軟膏に混ぜる'), fx: { faith: 4 }, desc: '王の戴冠と死にゆく人の額に塗る香り高い油。' });
const OF = [
  ['offering_bread', '供えのパン', { flour: 1 }, 3, 3, '祭壇に供える編み目の丸パン。祭りのあとは貧しい人に配る。'],
  ['offering_wreath', '供えの花輪', { rose: 2, lily: 2 }, 4, 2, '墓と祭壇に手向ける花輪。'],
  ['offering_wine', '供えの葡萄酒', { wine: 1 }, 6, 2, '聖餐と先祖の祭りに供える葡萄酒。'],
  ['offering_figure', '奉納の小像', { wax: 0.3 }, 3, 1, '治ってほしい体の形を蝋で作って教会に納める。'],
  ['wish_tablet', '願い札', { planks: 0.1 }, 1, 2, '願いごとを書いて祠に掛ける木の札。'],
  ['offering_grain', '初穂の束', { wheat: 3 }, 2, 2, 'その年の最初の麦を束ねて神に捧げる。豊作の祈り。'],
  ['offering_coin_death', '渡し賃の銀貨', { silver: 0.05 }, 2, 2, '死者の口に含ませる銀貨。あの世への渡し賃。'],
  ['funeral_flowers', '弔いの百合', { lily: 3 }, 3, 2, '棺に入れる白い百合の束。'],
];
for (const [id, name, from, v, d, desc] of OF) C(id, name, 'offering', 0.3, v, id === 'offering_bread' ? 'baker' : id.includes('flower') || id.includes('wreath') ? 'gardener' : PR, from, 0.5, { st: 10, d, use: U('ritual:教会や祠に納めると信仰が深まる', 'gift'), fx: { faith: 2, mood: 1 }, desc });
// 祭具
const RT = [
  ['chalice', '聖杯', { silver: 1 }, 60, 1, 'jeweler', '聖餐の葡萄酒を注ぐ銀の杯。'],
  ['altar_cloth', '祭壇布', { cloth: 2, gold_leaf: 0.3 }, 25, 0, 'weaver', '金糸の縁取りの祭壇の布。'],
  ['church_bell_small', '祈りの鐘', { copper: 3, tin: 1 }, 40, 0, 'smith', '村の礼拝堂の小さな鐘。刻を告げる。'],
  ['reliquary', '聖遺物箱', { silver: 2, gold_leaf: 1 }, 150, 1, 'jeweler', '聖人の遺物を納める宝石で飾った箱。'],
  ['pilgrim_staff', '巡礼杖', { wood: 1, seashell_scallop: 1 }, 4, 0, 'carpenter', '帆立の殻をつけた巡礼者の杖。'],
  ['holy_banner', '聖旗', { cloth: 3, dye: 0.5 }, 30, 0, 'weaver', '祭りの行列と聖戦に掲げる旗。'],
  ['aspergillum', '聖水撒き', { silver: 0.3, horse_hair: 0.1 }, 20, 0, 'jeweler', '聖水を振りかける銀の刷毛。'],
];
for (const [id, name, from, v, r, by, desc] of RT) C(id, name, 'ritual_tool', 1, v, by, from, 2 + v / 20, { st: 1, r, d: 1, use: U('ritual:教会の儀式に使う', 'build:教会の備え'), fx: { faith: 2 + r * 2 }, desc });
I('saint_relic', '聖人の指の骨', 'holy', 0.05, 400, { st: 1, r: 3, d: 1, lim: 'relic', src: [loot(['ruins', 'dungeon'], 0.003)], use: U('ritual:教会に納めると巡礼者が集まる', 'collect:聖遺物', 'quest'), fx: { faith: 20, fame: 5 }, desc: '奇跡を起こした聖人の指の骨とされる。本物かどうかは神のみぞ知る。' });

// ================= 民族の祭具と仮面（民族ごと2つ） =================
const TR = [
  ['fianna', 'フィアナの民', [['mask_antler', '角の王の仮面', '初矢の祭りで長老がかぶる、鹿の角をつけた木の仮面。', { wood: 1, antler: 1 }], ['ritual_bow_first', '初矢の弓', '秋の最初の獲物を射る、飾り彫りの弓。', { wood: 2, silk: 0.2 }]]],
  ['yarvi', 'ヤルヴィ族', [['mask_frost', '霜の翁の仮面', '長い夜の祭りでかぶる、白い毛皮の仮面。', { hide: 1, bone: 0.5 }], ['drum_shaman_yarvi', '巫の輪太鼓', '北の空の光の精を呼ぶ、トナカイ皮の輪太鼓。', { hide: 1, wood: 0.5 }]]],
  ['mahina', 'マヒナの民', [['mask_tide', '潮の主の仮面', '大潮の送りで舵取りがかぶる、貝を埋めた仮面。', { wood: 1, seashell_cowrie: 5 }], ['flower_boat', '花の舟', '大潮の夜に真珠と魚を積んで沖に流す小舟。', { planks: 2, rose: 5 }]]],
  ['mictla', 'ミクトラ族', [['mask_serpent', '翠鱗の蛇の仮面', '蛇の巫がかぶる、翡翠をはめた仮面。', { wood: 1, jade: 0.5 }], ['rain_rattle', '雨呼びのがらがら', '雨の四兄弟を呼ぶ、種を詰めた瓢箪。', { gourd: 1, nut: 10 }]]],
  ['dorgu', 'ドルグ族', [['mask_thunderbird', '雷鳥の仮面', '雷の競馬の前夜、旗持ちがかぶる羽根の仮面。', { feather: 10, leather: 0.5 }], ['spirit_banner', '風の祖霊の旗', '馬の毛の房をつけた祖霊の旗竿。', { horse_hair: 2, wood: 1 }]]],
  ['nefer', 'ネフェル族', [['mask_sleeping_king', '眠れる王の仮面', '星の名づけの夜にかぶる、青い釉の陶の仮面。', { clay: 1, lapis: 0.2 }], ['water_jar_ritual', '水の返しの甕', '泉の水を砂丘に注ぐ、祈りの文字を刻んだ甕。', { pottery: 2 }]]],
  ['garai', 'ガライ族', [['mask_ash_dragon', '灰の竜の仮面', '竜の十分の一を運ぶ者がかぶる鉄の仮面。', { iron: 1 }], ['forge_idol', '炉の火の小像', '炉の火の神をかたどった鉄の小像。', { iron: 0.5 }]]],
  ['bolota', 'ボロタ族', [['mask_bog', '沼の翁の仮面', '葦と泥で作る、ヴォドニクの仮面。', { reed: 3, clay: 0.5 }], ['soul_pot', '魂の小壺', '溺れた者の魂を入れて沼の主に預けるという壺。', { clay: 0.5 }]]],
  ['harn', 'ハルン族', [['mask_salamander', '炉の主の仮面', '火の山の祭りでかぶる、赤く塗った黒曜の仮面。', { obsidian: 1, ochre: 0.2 }], ['ash_bowl', '祖霊の灰の鉢', '失われた灰の谷の灰を納めた鉢。', { pottery: 1 }]]],
  ['elda', 'エルダの灯守', [['seven_lamp_stand', '七つの灯の燭台', '封印を守る七つの灯をともす青銅の燭台。', { copper: 3 }], ['star_scribe_stylus', '星の書き手の鉄筆', '古い文字を刻むための細い銀の筆。', { silver: 0.3 }]]],
  ['hollin', 'ホリン衆', [['mask_spider_crone', '糸の媼の仮面', '谷の入口の祭りでかぶる、灰色の糸の仮面。', { silk: 1, wood: 0.5 }], ['grain_saint_sack', '麦袋の聖者の像', '麦袋を背負った聖者の藁の像。', { straw: 2, cloth: 0.5 }]]],
];
for (const [t, tn, list] of TR) list.forEach(([id, name, desc, from], i) => C(id, name, 'tribal_ritual', 1, 30 + i * 10, SH, from, 4, { st: 1, r: 2, d: 0, use: U(`ritual:${tn}の祭りに欠かせない`, 'collect:学者と好事家が欲しがる', 'quest:民族に返すと喜ばれる'), fx: { faith: 5 }, desc: `${tn}の祭具。${desc}`, more: [trade()] }));

// ================= 守り神への捧げ物（lore.js GUARDIANS） =================
const GO = [
  ['gift_orvan', '角の王への初矢の獲物', { meat: 5, feather: 2 }, 'fianna', '角の王オルヴァンに捧げる、その秋の最初の獲物。'],
  ['gift_hormi', '霜の翁への九つの角杯', { horn_cattle: 9, mead: 2 }, 'yarvi', '霜の翁ホルミに差し出す、蜂蜜酒を満たした九つの角杯。'],
  ['gift_waimoana', '潮の主への真珠と魚の舟', { pearl: 3, fish: 5, planks: 1 }, 'mahina', '潮の主ワイ＝モアナへ、大潮の夜に流す捧げ物。'],
  ['gift_yowali', '大蛇への翠玉とカカオの包み', { jade: 1, cacao: 5 }, 'mictla', '翠鱗の大蛇ヨワリに日の頂の祭りで捧げる包み。'],
  ['gift_borgai', '雷鳥への羽根と馬乳酒', { eagle_feather: 5, milk: 3 }, 'dorgu', '雷鳥ボルガイに捧げる羽根の束と馬の乳の酒。'],
  ['gift_jarka', '砂の大鯨への青い硝子と塩', { glass: 1, salt: 3 }, 'nefer', '砂海の主ジャルカとの約束で砂丘に埋める青い硝子と塩。'],
  ['gift_gorzaul', '古竜への十分の一の宝袋', { gem: 1, silver: 3 }, 'garai', '灰の古竜ゴルザウルに十年に一度運び上げる宝石と銀。'],
  ['gift_vodnik', '沼の主への灯りの壺', { soul_pot: 1, candle_beeswax: 3 }, 'bolota', '沼の主ヴォドニクの灯りのために沈める蝋燭入りの壺。'],
  ['gift_urg', '炉の主への黒曜の供物', { obsidian: 3, meat: 3 }, 'harn', '炉の主ウルグの飢えを鎮めるため火口に投げ入れる供物。'],
  ['gift_ashking', '灰の王の封じの灯芯', { elda_lamp_oil: 3, silk: 0.5 }, 'elda', '灰の王を眠らせておくための、七つの灯の灯芯と油。'],
  ['gift_ito', '糸の媼への糸巻き', { silk: 2, honey: 1 }, 'hollin', '糸の媼に捧げる絹の糸巻きと蜜。谷の入口に吊るす。'],
];
for (const [id, name, from, t, desc] of GO) C(id, name, 'guardian_offering', 3, 40, SH, from, 4, { st: 1, r: 1, d: 1, use: U('ritual:守り神に捧げると村が守られる（生贄の代わりにはならない）', 'quest:民族の祭りを手伝う'), fx: { faith: 8, guardian: t }, desc });

// ================= 大人向け（matureCrimes が有効な時だけ出る） =================
const MA = [
  ['drug_dream', '夢見草の包み', { dreamgrass: 2 }, 6, 1, { mood: 15, hook: 14 }, '干した夢見草を紙に包んだもの。吸うと甘い夢を見る。禁制品。'],
  ['drug_lotus', '黒蓮の粉', { black_lotus: 1 }, 10, 2, { mood: 25, hook: 20, energy: -10 }, '黒蓮の実を挽いた粉。強い酔いと引き換えに心がすり減る。禁制品。'],
  ['drug_mana', '魔薬', { black_lotus: 1, manastone_dust: 1 }, 16, 2, { mood: 30, mana: 20, hook: 28 }, '魔石の粉を混ぜた最も強い禁制の薬。魔力が湧くが、抜けられなくなる。'],
  ['incense_hallucination', '幻覚の香', { madcap: 1, poppy: 1 }, 12, 1, { mood: 12, hook: 10, sight: -5 }, '焚くと壁の模様が踊りだす香。闇の酒場で焚かれる。'],
  ['madcap_dried', '狂い茸の干物', { madcap: 2 }, 5, 1, { mood: 10, hook: 8 }, '笑いが止まらなくなる茸。量を誤れば錯乱する。'],
  ['poppy_tears', '芥子の涙', { poppy: 3 }, 20, 2, { mood: 20, sleep: 6, hook: 22 }, '芥子の実の汁を固めた黒い塊。痛みを消すが、溺れる者も多い。'],
  ['dream_pipe', '夢見の煙管', { pipe_clay: 1, silver: 0.05 }, 8, 0, {}, '禁制の草を吸うための、火皿の小さな煙管。', true],
  ['aphrodisiac_strong', '強い媚薬', { mandrake: 1, musk: 0.2 }, 30, 1, { love: 10, lust: 20, hook: 5 }, '闇で売られる媚薬。大人どうしでしか使われない。'],
  ['numbing_wine', '麻酔の酒', { wine: 1, poppy: 1 }, 10, 1, { mood: 8, sleep: 4, hook: 6 }, '芥子を溶かした酒。酒場の裏で売られる。'],
];
for (const [id, name, from, v, r, fx, desc, tool] of MA) C(id, name, 'mature', 0.02, v, 'smuggler', from, 0.5, { st: 20, r, d: 1, mature: true, use: tool ? U('tool:禁制の薬を吸う', 'trade:闇の商人が扱う') : U('luxury:一時の快楽（溺れると依存する）', 'trade:闇の商人が高く売る'), fx, desc, more: [trade()] });
export default B.list;
