import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const { I } = { I: B.I.bind(B) }; const C = B.C.bind(B);
const HB = 'herbalist', AL = 'alchemist', WZ = 'wizard', CM = 'courtmage', PR = 'priest', DR = 'doctor';
const med = (note) => U('medicine:' + note, 'trade');

// ================= 薬（今ある id を先に） =================
C('medicine', '薬', 'medicine', 0.2, 12, HB, { herbs: 2, vial: 1 }, 1.5, { d: 3, use: med('病とけがの手当て（ふつうの煎じ薬）'), fx: { hp: 20, cure: 'any', sev: 14 }, desc: '薬草を煎じて小瓶に詰めた、町の薬屋のいちばんふつうの薬。', more: [trade()] });
C('potion', '回復薬', 'medicine', 0.2, 12, HB, { herb: 2, vial: 1 }, 1.2, { d: 3, use: U('medicine:冒険者の傷の手当て', 'quest:依頼の納品'), fx: { hp: 45 }, desc: '飲めばみるみる傷がふさがる、冒険者の必需品。', more: [loot(D, 0.2)] });
C('antidote', '解毒薬', 'medicine', 0.15, 8, HB, { herb: 1, mugwort: 1, vial: 1 }, 1, { d: 2, use: med('蛇・蜘蛛・毒草の毒を消す'), fx: { hp: 15, cure: 'poison' }, desc: '蓬と薬草を煮詰めた苦い薬。たいていの毒に効く。', more: [loot(D, 0.12)] });
C('elixir', '霊薬', 'medicine', 0.2, 110, AL, { rareherb: 1, magicstone: 1, vial: 1 }, 6, { r: 2, d: 1, use: U('medicine:重い病・長寿の薬', 'luxury:王侯が買い求める', 'trade'), fx: { hp: 200, cure: 'all', youth: 1 }, desc: '霊草と魔石を練り上げた王侯の霊薬。どんな病も退けるという。', more: [loot(D, 0.02)] });

// ---- 回復の段 ----
C('salve_simple', '傷薬の膏薬', 'medicine', 0.1, 4, HB, { herbs: 1, tallow: 1 }, 0.6, { d: 3, st: 20, use: med('すり傷・切り傷に塗る'), fx: { hp: 10 }, desc: '獣脂に薬草を練り込んだ、どの家にもある塗り薬。' });
C('potion_high', '上回復薬', 'medicine', 0.2, 35, AL, { potion: 2, rareherb: 1 }, 2, { r: 1, d: 2, use: U('medicine:深手の手当て', 'quest'), fx: { hp: 90 }, desc: '回復薬に霊草を加えて煮詰めた、騎士団が備える薬。', more: [loot(D, 0.06)] });
C('potion_great', '大回復薬', 'medicine', 0.25, 80, AL, { potion_high: 1, jelly: 2, magicstone: 1 }, 4, { r: 2, d: 1, use: U('medicine:瀕死の者を立ち直らせる', 'trade'), fx: { hp: 160 }, desc: '魔石の力で傷をふさぐ濃い薬。死にかけた者も起き上がる。', more: [loot(D, 0.03)] });
C('elixir_grand', '万能の霊薬', 'medicine', 0.2, 400, AL, { elixir: 1, horn_powder: 1, quintessence: 1 }, 12, { r: 3, d: 1, use: U('medicine:どんな病も傷も治す', 'luxury:王の枕もとの薬', 'trade'), fx: { hp: 999, cure: 'all', youth: 2 }, desc: '一角獣の角と第五元素を溶かした、伝え話に出てくる薬。', more: [loot(['demoncastle'], 0.01)] });
C('elixir_youth', '若返りの霊薬', 'medicine', 0.2, 900, AL, { elixir: 2, philosopher_shard: 1, dragon_blood: 1 }, 24, { r: 4, d: 1, use: U('luxury:老いた王族がのどから手が出るほど欲しがる', 'medicine:老いを五年ぶん戻す'), fx: { youth: 5 }, desc: '竜の血と賢者の石のかけらで作るという、若返りの薬。', more: [loot(['demoncastle', 'ruins'], 0.003)] });
C('bandage_clean', '清めた包帯', 'medicine', 0.1, 2, 'nun', { cloth: 1, holy_water: 1 }, 0.3, { d: 2, st: 20, use: med('傷口を巻いて膿みを防ぐ'), fx: { hp: 5, cure: 'wound', sev: 6 }, desc: '煮て聖水で清めた布を巻いたもの。' });
C('healing_moss', '沼苔の膏薬', 'medicine', 0.1, 9, 'shaman', { swamp_moss: 2, jelly: 1 }, 1, { d: 2, use: U('medicine:膿んだ傷と古傷に効く', 'trade:ボロタ族の名物'), fx: { hp: 25, cure: 'wound', sev: 16 }, desc: 'ボロタ族が沼の苔とヒルの唾で練る膏薬。', more: [trade()] });

// ---- 病ごとの薬（health.js の AILS：cold flu fever belly ache wound） ----
const AIL = [
  ['cold', '風邪', [['cold_tea', '生姜と蜂蜜の煎じ湯', { ginger: 1, honey: 1 }, 3, 8, '風邪のひき始めに飲む家の薬。体が温まる。'], ['cough_drop', '咳止めの飴', { mint: 1, honey: 1, sugar: 1 }, 4, 10, '薄荷の効いた飴。のどの痛みと咳をしずめる。'], ['cold_cure', '風邪の特効薬', { herbs: 2, ginger: 1, vial: 1 }, 10, 22, '薬師が調合するよく効く風邪薬。']]],
  ['flu', '流行り病', [['flu_draught', '流行り病の煎じ薬', { herbs: 2, garlic: 1, vial: 1 }, 14, 18, '大蒜と薬草の強い煎じ薬。流行り病の熱を下げる。'], ['plague_pill', '疫病除けの丸薬', { herbs: 1, sulfur_flower: 1, charcoal: 1 }, 16, 22, '硫黄華を練り込んだ黒い丸薬。病をよせつけない。'], ['flu_holy', '聖別の流行り病薬', { flu_draught: 1, holy_water: 1 }, 30, 40, '教会で祈りをこめた煎じ薬。重い流行り病にも効く。']]],
  ['fever', '熱病', [['fever_powder', '柳の皮の熱さまし', { willow_bark: 2 }, 6, 12, '柳の皮を粉にした熱さまし。苦いがよく効く。'], ['fever_draught', '熱さましの煎じ薬', { willow_bark: 1, chamomile: 1, vial: 1 }, 12, 18, 'カミツレと柳の皮の煎じ薬。熱にうなされる夜に。'], ['fever_elixir', '熱病の霊薬', { fever_draught: 1, rareherb: 1 }, 30, 45, '霊草を加えた薬。命にかかわる熱病を退ける。']]],
  ['belly', '腹下し', [['belly_charcoal', '炭の粉薬', { charcoal: 1 }, 6, 3, '細かな炭の粉。悪い物を食べたときに飲む。'], ['belly_pill', '整腸の丸薬', { herbs: 1, mint: 1, flour: 1 }, 10, 10, '薄荷と薬草を練った丸薬。おなかを整える。'], ['belly_tonic', '腹下し止めの薬酒', { herbs: 2, aqua_vitae: 1 }, 18, 20, '薬草を酒精に漬けた薬。ひどい腹下しに効く。']]],
  ['ache', '古傷の痛み', [['ache_poultice', '温湿布', { mugwort: 1, cloth: 1 }, 6, 6, '蓬を包んで温めた布。痛む所に当てる。'], ['ache_salve', '痛み止めの膏薬', { herbs: 1, tallow: 1, clove: 1 }, 12, 14, '丁子の香りの膏薬。古傷のうずきをしずめる。'], ['ache_oil', '古傷の塗り油', { oil: 1, rareherb: 1, lavender: 1 }, 24, 30, '霊草を漬けた油。何年もの痛みがやわらぐ。']]],
  ['wound', '傷の膿み', [['wound_wash', '傷口洗いの薬酒', { aqua_vitae: 1 }, 8, 6, '強い酒精。しみるが傷口を清める。'], ['wound_salve', '化膿止めの軟膏', { herbs: 1, aloe: 1, jelly: 1 }, 14, 14, '蘆薈とスライムのゼリーの軟膏。膿みを止める。'], ['wound_holy', '聖油の軟膏', { wound_salve: 1, holy_oil: 1 }, 28, 34, '聖油を練り込んだ軟膏。深い膿みも清まる。']]],
];
for (const [ail, an, list] of AIL) list.forEach(([id, name, from, sev, v, desc], i) => C(id, name, 'medicine', 0.1, v, i === 0 ? 'gatherer' : HB, i < 2 ? from : from, i + 0.5, { d: i === 0 ? 3 : 2, r: i === 2 ? 1 : 0, st: 20, use: med(`${an}に効く`), fx: { hp: 5 + i * 10, cure: ail, sev }, desc }));

// ---- 毒消し ----
C('antidote_snake', '蛇毒の血清', 'medicine', 0.1, 14, HB, { snake_venom: 1, herbs: 1, vial: 1 }, 2, { d: 1, use: med('蛇にかまれたとき'), fx: { cure: 'poison', hp: 10 }, desc: '蛇の毒を薄めて作る、蛇毒だけに効く薬。' });
C('antidote_spider', '蜘蛛毒の解毒薬', 'medicine', 0.1, 16, HB, { spider_venom: 1, mugwort: 1, vial: 1 }, 2, { d: 1, use: med('大蜘蛛の毒に'), fx: { cure: 'poison', hp: 10 }, desc: '大蜘蛛の巣へ向かう冒険者の必携品。' });
C('antidote_scorpion', 'サソリ毒の塗り薬', 'medicine', 0.1, 12, HB, { scorpion_sting: 1, aloe: 1 }, 1.5, { d: 1, use: med('砂漠でサソリに刺されたとき'), fx: { cure: 'poison', hp: 8 }, desc: 'サハルの隊商がかならず持つ塗り薬。' });
C('antidote_mushroom', '毒茸あたりの吐き薬', 'medicine', 0.1, 6, HB, { mustard_seed: 1, salt: 1 }, 0.5, { d: 1, use: med('毒茸を食べてしまったとき'), fx: { cure: 'poison', mood: -2 }, desc: '無理に吐かせて毒を出す、つらい薬。' });
C('antidote_all', '万能解毒薬', 'medicine', 0.1, 40, AL, { antidote: 1, antidote_snake: 1, horn_powder: 1 }, 4, { r: 2, use: med('どんな毒も消す'), fx: { cure: 'poison', hp: 30 }, desc: '一角獣の角の粉を混ぜた、あらゆる毒の解毒薬。', more: [loot(D, 0.02)] });
C('theriac', '百薬の練り薬', 'medicine', 0.2, 30, AL, { herbs: 3, honey: 1, myrrh: 1, snake_venom: 1 }, 6, { r: 1, use: U('medicine:毒と病の予防', 'luxury:貴族が毎朝ひと匙なめる'), fx: { cure: 'poison', ward: 'sick', days: 5 }, desc: '何十種もの薬を蜜で練り、何年も寝かせた高価な薬。' });

// ---- 眠り・目覚め・心の薬 ----
C('sleep_draught', '眠り薬', 'medicine', 0.1, 8, HB, { chamomile: 1, lavender: 1, vial: 1 }, 1, { d: 2, use: med('眠れない夜に'), fx: { sleep: 8, mood: 2 }, desc: 'カミツレとラベンダーの、やさしい眠り薬。' });
C('sleep_strong', '強い眠り薬', 'medicine', 0.1, 20, AL, { poppy: 1, sleepcap: 1, vial: 1 }, 2, { r: 1, use: U('medicine:手術の前に眠らせる', 'tool:見張りを眠らせる'), fx: { sleep: 16 }, desc: '芥子と眠り茸の薬。ひと口で丸一日眠る。' });
C('smelling_salts', '気付けの嗅ぎ塩', 'medicine', 0.05, 7, AL, { refined_salt: 1, lavender: 1 }, 0.5, { d: 1, use: med('気を失った人を起こす'), fx: { wake: true, energy: 10 }, desc: 'つんとくる塩。倒れた貴婦人の鼻先に。' });
C('tonic', '滋養強壮の薬酒', 'medicine', 0.3, 10, HB, { herbs: 2, ginger: 1, wine: 1 }, 1, { d: 2, use: U('medicine:疲れを取る', 'drink'), fx: { energy: 30, hp: 5 }, desc: '生姜と薬草を漬けた葡萄酒。働き者の寝酒。' });
C('calm_draught', '気鬱の薬', 'medicine', 0.1, 12, HB, { chamomile: 1, lavender: 1, honey: 1 }, 1, { use: med('悲しみと不安をやわらげる'), fx: { mood: 12, calm: true }, desc: '家族を亡くした人に薬師がすすめる甘い薬。' });
C('courage_draught', '勇気の薬', 'medicine', 0.1, 18, AL, { aqua_vitae: 1, dragon_blood: 1 }, 2, { r: 1, use: U('medicine:戦の前に飲む', 'quest'), fx: { courage: 20, mood: 5 }, desc: '竜の血を一滴たらした酒精。恐れを忘れる。' });
C('focus_tea', '冴えの茶', 'medicine', 0.05, 5, HB, { tea_leaf: 1, mint: 1 }, 0.3, { use: U('medicine:学問と研究がはかどる', 'luxury'), fx: { focus: 10, energy: 5 }, desc: '学者と写字生が夜ふけに飲む、目の冴える茶。' });
C('sober_draught', '断薬の助け', 'medicine', 0.1, 15, HB, { chamomile: 1, willow_bark: 1, honey: 1, vial: 1 }, 2, { use: med('薬に溺れた人が立ち直るのを助ける'), fx: { sober: 10, mood: 3 }, desc: '震えと渇きをしずめる薬。修道院が施す。' });
C('hangover_cure', '二日酔いの薬', 'medicine', 0.1, 3, HB, { mint: 1, salt: 1 }, 0.3, { d: 2, st: 20, use: med('飲みすぎた翌朝に'), fx: { energy: 10, mood: 3 }, desc: '酒場の親父がこっそり売る薬。' });
C('forget_draught', '忘れ薬', 'medicine', 0.1, 60, AL, { moonflower: 1, lotus_water: 1, vial: 1 }, 4, { r: 2, use: U('medicine:つらい思い出を一つ忘れる', 'trade'), fx: { forget: 1, mood: 10 }, desc: '月見花の薬。いちばんつらい記憶が霧に包まれる。' });
C('truth_serum', '真実の薬', 'medicine', 0.1, 70, AL, { mandrake: 1, quicksilver: 1, vial: 1 }, 4, { r: 2, use: U('tool:取り調べで嘘をつけなくする', 'trade'), fx: { truth: true }, desc: '飲んだ者は半日のあいだ嘘をつけない。裁きの場で使われる。' });

// ---- 惚れ薬 ----
C('love_potion', '惚れ薬', 'medicine', 0.1, 30, AL, { rose: 2, mandrake: 1, vial: 1 }, 3, { r: 1, use: U('gift:意中の人に', 'trade'), fx: { love: 20 }, desc: '薔薇色の薬。飲ませた相手の心がこちらに向くという。' });
C('love_potion_weak', '恋の甘露', 'medicine', 0.1, 10, HB, { rose: 1, honey: 1 }, 1, { use: U('gift:恋人どうしで飲む', 'luxury'), fx: { love: 6, mood: 5 }, desc: '祭りの屋台で売る、恋の気分になる甘い水。' });
C('love_potion_true', '真実の恋の霊薬', 'medicine', 0.1, 150, AL, { love_potion: 1, mermaid_tear: 1 }, 6, { r: 3, use: U('gift', 'luxury:王族の縁談の裏で使われる'), fx: { love: 60 }, desc: '人魚の涙を一滴落とした、決して醒めない恋の薬。' });
C('fertility_draught', '子宝の薬', 'medicine', 0.1, 14, 'midwife', { herbs: 1, honey: 1, egg: 1 }, 1, { use: med('子を望む夫婦に'), fx: { fertile: 10 }, desc: '産婆がすすめる、子宝にめぐまれる薬。' });
C('birth_draught', '産後の薬湯', 'medicine', 0.2, 6, 'midwife', { herbs: 2, ginger: 1 }, 1, { d: 2, use: med('お産のあとの体をいたわる'), fx: { hp: 20, energy: 10 }, desc: '産婆が煎じる、母親の体を温める湯。' });
// ---- その他の家庭薬 ----
const home = [
  ['eye_drops', '目薬', 'eyebright', 5, '目の疲れとかすみに効く。', { sight: 3 }],
  ['toothache_oil', '歯痛止めの丁子油', 'clove', 6, '丁子を漬けた油。痛む歯にすり込む。', { mood: 4 }],
  ['burn_salve', '火傷の薬', 'aloe', 6, '蘆薈の汁を練った薬。鍛冶屋の常備薬。', { hp: 12 }],
  ['frost_salve', 'しもやけの膏薬', 'ginger', 5, '北の国の家に欠かせない温まる膏薬。', { hp: 8, warmth: 5 }],
  ['worm_powder', '虫下し', 'wormwood', 4, '子どもの腹の虫を下す苦い粉。', { hp: 6 }],
  ['child_syrup', '子どもの甘い薬', 'honey', 5, '蜜にとかした薬。子どもも嫌がらずに飲む。', { hp: 8, cure: 'cold', sev: 6 }],
  ['joint_oil', '節々の塗り油', 'lavender', 8, '年寄りの膝と腰に塗る油。', { mood: 4, cure: 'ache', sev: 8 }],
  ['bug_repellent', '虫よけの香油', 'mint', 4, '夏の野良仕事や密林の旅で肌に塗る。', { ward: 'bugs' }],
  ['sun_salve', '日焼け止めの泥膏', 'clay', 3, '砂漠の旅人が顔に塗る白い泥。', { ward: 'sun' }],
  ['hair_tonic', '髪の香油', 'rose', 12, '貴婦人の髪をつややかにする香油。', { beauty: 5, mood: 3 }],
  ['skin_lotion', '肌の化粧水', 'lily', 10, '百合の花から作る化粧水。', { beauty: 5 }],
  ['rouge', '紅', 'madder', 9, '茜で染めた頬と唇の紅。', { beauty: 6 }],
];
for (const [id, name, m, v, desc, fx] of home) C(id, name, 'medicine', 0.1, v, HB, { [m]: 1, oil: 1 }, 0.8, { d: fx.beauty ? 1 : 2, st: 20, use: fx.beauty ? U('luxury:身だしなみ', 'gift') : med(desc.slice(0, 12)), fx, desc });

// ---- 冒険の薬（魔法の効き目） ----
const adv = [
  ['potion_nightsight', '夜目の薬', { glowcap: 1, vial: 1 }, 15, { sight: 10, hours: 8 }, '暗い洞窟でも昼のように見える。'],
  ['potion_waterbreath', '水中息の薬', { gill_weed: 1, vial: 1 }, 25, { breath: 1, hours: 4 }, '水の中で息ができる。真珠採りが欲しがる。'],
  ['potion_strength', '剛力の薬', { dragon_blood: 1, vial: 1 }, 30, { strength: 5, hours: 6 }, '大岩も持ち上がるほど力がみなぎる。'],
  ['potion_swift', '疾風の薬', { wind_essence: 1, vial: 1 }, 28, { speed: 5, hours: 6 }, '足が軽くなり、馬のように駆けられる。'],
  ['potion_stone', '石肌の薬', { earth_essence: 1, vial: 1 }, 30, { def: 6, hours: 6 }, '肌が石のように硬くなる。'],
  ['potion_fireward', '火除けの薬', { water_essence: 1, vial: 1 }, 26, { ward: 'fire', hours: 8 }, '竜の火や溶岩の熱を防ぐ。'],
  ['potion_coldward', '寒さ除けの薬', { fire_essence: 1, vial: 1 }, 20, { warmth: 20, hours: 12 }, '雪原でも汗ばむほど体が温まる。'],
  ['potion_unstone', '石化解きの薬', { basilisk_eye: 1, holy_water: 1 }, 45, { cure: 'stone' }, '石にされた者に振りかけると元に戻る。'],
  ['potion_uncurse', '解呪の聖薬', { holy_water: 2, light_essence: 1 }, 50, { cure: 'curse' }, '呪いの品の呪いを解き、呪われた者を清める。'],
  ['potion_invis', '姿隠しの薬', { dark_essence: 1, vial: 1 }, 60, { invis: true, hours: 1 }, 'ひととき姿が見えなくなる。盗賊がのどから手が出るほど欲しがる。'],
  ['potion_luck', '幸運の薬', { clover4: 1, gold_leaf: 1, vial: 1 }, 40, { luck: 10, hours: 24 }, '一日だけ運がよくなる。賭け事の前に飲む人も。'],
  ['potion_feather', '羽根の薬', { eagle_feather: 1, wind_essence: 1 }, 35, { fall: true, hours: 2 }, '高い所から落ちても羽根のようにゆっくり降りる。'],
];
for (const [id, name, from, v, fx, desc] of adv) C(id, name, 'medicine', 0.15, v, AL, from, 3, { r: v >= 40 ? 2 : 1, use: U('medicine:冒険の備え', 'quest', 'trade'), fx, desc, more: [loot(D, 0.04)] });
// ---- 魔力の霊薬 ----
C('mana_potion', '魔力の水薬', 'medicine', 0.15, 18, AL, { manastone_dust: 1, vial: 1 }, 1.5, { d: 1, use: U('magic:使い果たした魔力を戻す', 'quest'), fx: { mana: 30 }, desc: '魔石の粉をとかした青い水薬。', more: [loot(D, 0.12)] });
C('mana_potion_high', '上魔力の霊薬', 'medicine', 0.15, 50, AL, { mana_potion: 2, mana_crystal_s: 1 }, 3, { r: 1, use: U('magic:大きな魔法の前に', 'trade'), fx: { mana: 80 }, desc: '魔晶を溶かした濃い霊薬。宮廷魔術師が使う。', more: [loot(D, 0.05)] });
C('mana_potion_great', '大魔力の霊薬', 'medicine', 0.15, 160, AL, { mana_potion_high: 1, demoncore_essence: 1 }, 6, { r: 2, use: U('magic:魔力を満たしきる', 'trade'), fx: { mana: 200 }, desc: '魔核の精を加えた、魔力をあふれさせる霊薬。', more: [loot(['demoncastle'], 0.03)] });
C('wisdom_draught', '叡智の霊薬', 'medicine', 0.1, 90, AL, { owl_eye: 1, quintessence: 1 }, 6, { r: 2, use: U('magic:研究の閃き', 'luxury'), fx: { focus: 40, research: 20 }, desc: '飲めばひと晩で一年分の研究が進むという。' });

// ================= 毒 =================
const PO = [
  ['poison', '毒薬', { nightshade: 2, vial: 1 }, 20, { poison: 40 }, 1, '毒茄子を煮詰めた、よくある毒。', U('trade:闇で売れる', 'tool:害獣退治')],
  ['poison_rat', '鼠取りの毒団子', { hemlock: 1, flour: 1 }, 2, { poison: 10 }, 0, '穀物蔵のネズミを退治する毒団子。', U('tool:蔵のネズミ退治')],
  ['poison_bug', '虫殺しの粉', { sulfur: 1, lime: 1 }, 2, { poison: 3 }, 0, '畑と蔵の虫を退治する粉。', U('tool:畑の虫よけ', 'fertilize')],
  ['poison_fish', '魚しびれの草汁', { soapnut: 2 }, 3, { poison: 2 }, 0, '川に流して魚をしびれさせる漁の毒。', U('tool:毒流し漁')],
  ['poison_arrow', '矢毒', { wolfsbane: 1, snake_venom: 1 }, 15, { poison: 30 }, 1, '狩人と密林の民が矢じりに塗る毒。', U('craft:毒矢を作る', 'tool:大物狩り')],
  ['poison_sleep', '眠り毒の粉', { sleepcap: 2 }, 12, { sleep: 12 }, 1, '吸うと眠くなる粉。盗賊が見張りに使う。', U('tool:見張りを眠らせる', 'trade')],
  ['poison_paralyze', 'しびれ毒', { spider_venom: 1, vial: 1 }, 18, { stun: 6 }, 1, '体がしびれて動けなくなる毒。', U('tool:魔物を生け捕りにする', 'trade')],
  ['poison_wolfsbane', '狼殺し', { wolfsbane: 2, vial: 1 }, 16, { poison: 50 }, 1, 'トリカブトの根の毒。狼退治の毒餌にする。', U('tool:狼と魔物の毒餌', 'trade')],
  ['poison_slow', '遅効の毒', { hemlock: 1, quicksilver: 1 }, 60, { poison: 80, delay: 3 }, 2, '三日たってから効き始める毒。暗殺者が好む。', U('trade:闇の商人が高く買う')],
  ['poison_assassin', '闇夜の雫', { poison_slow: 1, dark_essence: 1 }, 200, { poison: 999 }, 3, '一滴で命を奪う。色も味もない。', U('trade:暗殺者の秘宝', 'collect:毒の好事家')],
  ['poison_monster', '魔物除けの毒餌', { meat: 1, wolfsbane: 1 }, 4, { poison: 20 }, 0, '開拓地のまわりに撒いて魔物を遠ざける。', U('tool:開拓地の守り')],
  ['poison_basilisk', '石化の毒', { basilisk_eye: 1, vial: 1 }, 120, { stone: true }, 3, '浴びた者を石に変えるという恐ろしい毒。', U('trade', 'magic:石化の研究')],
];
for (const [id, name, from, v, fx, r, desc, use] of PO) C(id, name, 'poison', 0.1, v, r >= 2 ? AL : HB, from, 1 + r, { r, d: r ? 0 : 1, use, fx, desc, more: r >= 2 ? [loot(D, 0.02)] : [] });

// ================= 錬金の途中の物 =================
const al = (id, name, v, from, t, o) => C(id, name, o.sub || 'alchemy', o.w ?? 0.2, v, o.by || AL, from, t, { st: o.st ?? 20, r: o.r ?? 0, d: o.d ?? 1, use: o.use, fx: o.fx, desc: o.desc, more: o.more || [] });
al('vial', '薬瓶', 1.5, { glass: 0.3 }, 0.2, { by: 'glassblower', d: 2, st: 30, sub: 'vessel', use: U('craft:薬と香水を詰める'), desc: '小さな硝子の瓶。薬屋が大量に使う。' });
al('distilled_water', '蒸留水', 0.5, { water: 2 }, 0.5, { d: 1, use: U('magic:錬金の基本の水', 'medicine:薬の溶き水'), desc: '一度湯気にして集めた、混じりけのない水。' });
al('aqua_vitae', '生命の水（酒精）', 4, { wine: 2 }, 1, { d: 2, use: U('medicine:傷を清める・薬を漬ける', 'magic', 'drink:強い酒として'), desc: '葡萄酒を蒸留した強い酒精。錬金術の基本。' });
al('refined_salt', '精製した塩', 4, { salt: 2, distilled_water: 1 }, 1, { use: U('magic:錬金の三原質の一つ', 'medicine'), desc: '真っ白に精製した塩。錬金術で「体」を表す。' });
al('quicksilver', '水銀', 18, { cinnabar: 2, charcoal: 1 }, 2, { r: 1, use: U('magic:錬金の三原質の一つ（霊）', 'craft:金めっき・鏡'), desc: '辰砂を焼いて取り出す、銀色の流れる金属。' });
al('sulfur_flower', '硫黄華', 5, { sulfur: 2 }, 1, { use: U('magic:錬金の三原質の一つ（魂）', 'medicine:疫病除けの丸薬'), desc: '硫黄を熱して集めた黄色い粉。' });
al('wood_ash', '木灰', 0.2, { firewood: 1 }, 0.2, { by: 'charcoal', d: 1, st: 40, use: U('craft:灰汁・釉薬・石鹸', 'fertilize'), desc: '薪を燃やした灰。畑にもまく。' });
al('lye', '灰汁', 0.8, { wood_ash: 2, water: 1 }, 0.5, { d: 1, use: U('craft:石鹸・布の漂白・なめし'), desc: '灰を水にさらした、ぬるぬるした汁。' });
al('alum', '明礬', 5, { clay: 2, oil_of_vitriol: 1 }, 2, { use: U('dye:染め物の色止め', 'medicine:止血', 'craft:皮なめし'), desc: '染め物の色を止める白い結晶。' });
al('green_vitriol', '緑礬', 4, { ore: 1, water: 1 }, 1, { use: U('craft:インクと染め物', 'magic'), desc: '鉄の鉱石を湿らせてできる緑の結晶。' });
al('oil_of_vitriol', '礬油', 12, { green_vitriol: 3 }, 3, { r: 1, use: U('magic:金属を溶かす', 'craft:硝石精を作る'), desc: '緑礬を焼いて取る、物を焦がす恐ろしい油。' });
al('aqua_fortis', '硝石精', 16, { saltpeter: 2, oil_of_vitriol: 1 }, 3, { r: 1, use: U('magic:銀を溶かして金と分ける', 'craft:銅版を彫る'), desc: '銀を溶かす強い水。金銀の目利きに使う。' });
al('aqua_regia', '王水', 40, { aqua_fortis: 1, refined_salt: 1 }, 3, { r: 2, use: U('magic:金さえ溶かす'), desc: '金をも溶かす「水の王」。' });
al('vermilion', '朱（辰砂の紅）', 14, { quicksilver: 1, sulfur_flower: 1 }, 2, { use: U('dye:朱墨と絵の具', 'ritual:祭具の朱塗り'), desc: '水銀と硫黄を合わせた鮮やかな朱色。' });
al('verdigris', '緑青', 6, { copper: 1, vinegar: 1 }, 2, { use: U('dye:緑の絵の具', 'medicine:傷の膏薬'), desc: '銅を酢にさらしてできる青緑の錆。' });
al('lead_white', '鉛白', 6, { lead: 1, vinegar: 1 }, 2, { use: U('dye:白の絵の具', 'luxury:貴婦人のおしろい'), desc: '鉛を酢の湯気にあてた白い粉。' });
al('lampblack', '油煙', 2, { oil: 1 }, 0.5, { by: 'chandler', use: U('craft:墨とインク', 'dye:黒の絵の具'), desc: '灯火の煤を集めた真っ黒な粉。' });
al('gold_leaf', '金箔', 20, { gold: 0.2 }, 3, { by: 'jeweler', st: 50, use: U('craft:写本の飾り・祭壇・額縁', 'luxury'), desc: '金を紙より薄く打ちのばしたもの。' });
al('silver_powder', '銀粉', 8, { silver: 0.3 }, 1, { by: 'jeweler', use: U('magic:魔除けの粉', 'craft:銀泥'), desc: '銀をやすりで削った粉。死霊が嫌う。' });
al('holy_silver', '聖銀', 60, { silver: 2, holy_water: 1 }, 6, { r: 2, w: 0.5, by: PR, use: U('craft:聖銀の武具と装身具', 'magic', 'ritual'), desc: '聖水の中で七日祈りをこめた銀。不死の魔物を退ける。' });
al('bone_ash', '骨灰', 1, { bone: 2 }, 0.5, { use: U('craft:陶器の白い土・坩堝', 'fertilize', 'magic:死霊術の粉'), desc: '骨を焼いた白い灰。' });
al('horn_powder', '一角獣の角の粉', 80, { horn: 0.3 }, 2, { r: 2, st: 10, use: U('medicine:万能の解毒', 'magic'), desc: '一角獣の角を削った粉。どんな毒も消すという。' });
al('manastone_dust', '魔石の粉', 8, { magicstone: 0.25 }, 0.5, { d: 2, st: 40, use: U('magic:魔法のインク・水薬・護符'), desc: '魔石を砕いて挽いた、ほのかに光る粉。' });
al('mana_crystal_s', '小魔晶', 25, { manastone_dust: 3, quartz: 1 }, 2, { r: 1, w: 0.1, use: U('magic:魔導具の心臓', 'trade'), desc: '魔石の粉を水晶に吸わせた、小さな魔力の結晶。' });
al('crystal', '大魔石', 160, { magicstone: 4 }, 8, { r: 2, w: 0.5, by: CM, st: 5, use: U('magic:宮廷魔術の大研究・結界', 'collect:王族の収集'), desc: '魔石を練り合わせた握りこぶし大の魔石。' });
al('demoncore_essence', '魔核の精', 70, { demoncore: 1, aqua_vitae: 1 }, 4, { r: 2, use: U('magic:禁じられた強い魔法', 'medicine:大魔力の霊薬'), desc: '魔核を酒精に溶かした黒く光る液。' });
al('slime_essence', 'スライムの精', 5, { jelly: 3 }, 1, { use: U('craft:膏薬の練り台・にかわ', 'magic'), desc: 'スライムのゼリーを煮詰めた透明な精。' });
al('dragon_essence', '竜血の精', 120, { dragon_blood: 1, aqua_vitae: 1 }, 5, { r: 3, use: U('magic:竜の力を宿す', 'medicine'), desc: '竜の血を煮詰めた、赤く燃える精。' });
al('lotus_water', '蓮の露', 12, { lily: 2, distilled_water: 1 }, 1, { use: U('magic', 'medicine:忘れ薬'), desc: '夜明けの蓮の葉の露を集めたもの。' });
// 元素の精
const EL = [['fire', '火', { sulfur_flower: 1, magicstone: 0.5 }, '火山の熱を封じた赤い粉。'], ['water', '水', { distilled_water: 2, magicstone: 0.5 }, '冷たく澄んだ青い雫。'], ['earth', '土', { quartz: 1, magicstone: 0.5 }, '重く温かな茶色の粉。'], ['wind', '風', { feather: 3, magicstone: 0.5 }, '瓶の中でたえず渦を巻く白い霧。'], ['light', '光', { holy_water: 1, magicstone: 0.5 }, '暗闇でまぶしく光る金の粉。'], ['dark', '闇', { bat_wing: 2, magicstone: 0.5 }, '光を吸い込む黒い煙。']];
for (const [e, n, from, desc] of EL) al(`${e}_essence`, `${n}の元素の精`, 22, from, 3, { r: 1, use: U(`magic:${n}の魔法の触媒`, 'craft:魔導具'), desc });
al('quintessence', '第五元素', 150, { fire_essence: 1, water_essence: 1, earth_essence: 1, wind_essence: 1 }, 12, { r: 3, st: 5, use: U('magic:賢者の石への道', 'medicine:万能の霊薬'), desc: '四つの元素の精を一つにした、錬金術師の夢の液。' });
al('red_tincture', '赤き獅子の粉', 90, { quicksilver: 1, gold_leaf: 2, fire_essence: 1 }, 10, { r: 2, use: U('magic:鉛を金に近づける'), desc: '錬金術の「赤の業」で作る赤い粉。' });
al('white_tincture', '白き百合の水', 70, { quicksilver: 1, silver_powder: 2, water_essence: 1 }, 10, { r: 2, use: U('magic:銅を銀に近づける'), desc: '錬金術の「白の業」で作る白い水。' });
al('philosopher_shard', '賢者の石のかけら', 500, { red_tincture: 1, white_tincture: 1, quintessence: 1 }, 40, { r: 4, w: 0.05, st: 1, use: U('magic:鉛を金に変える', 'medicine:若返りの霊薬', 'collect:錬金術師の夢'), desc: '赤く透きとおる小さなかけら。持てば錬金術師の名が大陸に轟く。', more: [loot(['demoncastle', 'ruins'], 0.005)] });
al('philosopher_stone', '賢者の石', 5000, { philosopher_shard: 7 }, 200, { r: 4, w: 0.3, st: 1, use: U('magic:あらゆる物を変える', 'collect:伝説の品'), desc: '錬金術の到達点。いまだ誰も完成させたことがない。', more: [loot(['demoncastle'], 0.0005)] });
al('homunculus_flask', '小人の瓶', 300, { quintessence: 1, vial: 1, dragon_essence: 1 }, 40, { r: 3, w: 1, st: 1, sub: 'vessel', use: U('magic:瓶の中の小人が研究を手伝う', 'collect'), fx: { research: 5 }, desc: '瓶の中で指ほどの小人がしゃべる。錬金術師の秘密の助手。' });
al('alkahest', '万物溶解液', 400, { aqua_regia: 1, quintessence: 1 }, 20, { r: 4, st: 1, use: U('magic:どんな物も溶かす'), desc: '何でも溶かすという液。入れ物をどうするかは誰も知らない。' });
al('gunpowder', '火薬', 8, { saltpeter: 2, sulfur: 1, charcoal: 1 }, 1, { d: 1, use: U('tool:鉱山の発破・花火', 'craft'), desc: '黒い粉。火をつけると大きな音と煙を出す。' });
al('fireworks', '花火', 12, { gunpowder: 1, copper: 0.1, planks: 0.2 }, 1, { by: AL, use: U('luxury:祭りと婚礼の夜空', 'ritual:戴冠と戦勝の祝い'), fx: { mood: 8 }, desc: '夜空に色とりどりの火の花を咲かせる。町じゅうが見上げる。' });
al('soap', '石鹸', 1.5, { lye: 1, tallow: 1 }, 0.5, { by: 'chandler', d: 2, use: U('tool:体と衣を洗う', 'medicine:病を防ぐ'), fx: { clean: 10 }, desc: '灰汁と獣脂の石鹸。流行り病を遠ざける。' });
al('perfume', '香水', 25, { herbs: 2, spice: 0.3, glass: 0.3 }, 3, { st: 10, use: U('luxury:貴族のたしなみ', 'gift:贈り物'), fx: { beauty: 6, mood: 4 }, desc: '花と香料を酒精で溶いた香り。' });
al('perfume_rose', '薔薇の香水', 45, { rose: 5, aqua_vitae: 1, vial: 1 }, 4, { r: 1, st: 10, use: U('luxury', 'gift:求婚の贈り物'), fx: { beauty: 10, mood: 5 }, desc: '五十輪の薔薇から一瓶しか取れない香水。' });
al('perfume_amber', '竜涎の香水', 120, { ambergris: 1, aqua_vitae: 1, vial: 1 }, 5, { r: 2, st: 10, use: U('luxury:王妃の香り', 'gift'), fx: { beauty: 15, mood: 6 }, desc: '鯨の腹から出る竜涎香の、深く甘い香水。' });
// 錬金の道具
const tl = (id, name, v, from, by, desc, w = 2) => C(id, name, 'lab', w, v, by, from, 3, { st: 1, d: 0, use: U('tool:錬金と薬づくりの道具'), eq: { slot: 'tool' }, desc });
tl('alembic', '蒸留器', 30, { glass: 2, copper: 1 }, 'glassblower', '湯気を冷やして精を集める硝子と銅の器。');
tl('mortar', '乳鉢と乳棒', 6, { stone: 1 }, 'mason', '薬草や鉱石をすりつぶす石の鉢。');
tl('crucible', '坩堝', 5, { clay: 2, bone_ash: 1 }, 'potter', '金属を溶かす、火に強い小さな壺。');
tl('balance_scale', '薬の天秤', 18, { copper: 1, iron: 0.2 }, 'smith', '薬の分量を量る、細い竿の天秤。', 1);
tl('athanor', '錬金の炉', 80, { brick: 20, iron: 3 }, 'mason', '何十日も同じ火加減を保つ、錬金術師の塔の炉。', 200);

export default B.list;
