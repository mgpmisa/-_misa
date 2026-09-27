import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 3, ...o });
const FARM = ['farm', 'field'];
// 今ある品
X('herb', '薬草', 'herb', 0.05, 3, { d: 2, src: [S('gather', ['grass', 'forest', 'hill'], 0.6), S('harvest', FARM, 0.5)], fx: { hp: 8 }, keep: 20, use: [U('medicine', '傷に貼る・煎じて飲む・回復薬の材料'), U('craft', '薬師が薬に調合する')], desc: '野に生える傷と病に効く草。冒険者は必ず何束か持ち歩く。' });
X('herbs', '薬草の束', 'herb', 0.5, 3, { d: 2, src: [S('gather', ['grass', 'forest', 'hill'], 0.4)], make: M({ herb: 5 }, 'herbalist', 1), keep: 20, use: [U('medicine', '薬の材料'), U('trade', '市場で売り買いする薬草の単位')], desc: '市場で売り買いされる薬草を束ねたもの。薬屋の仕入れ品。' });
// 薬になる草：[id, 名, 部位, 採れる所, 値, 効き目, 使い道, 説明, 畑で育つ, rare, demand]
const MED = [
  ['mugwort', '蓬', '葉', ['grass', 'field', 'hill'], 0.1, { hp: 3 }, ['medicine:止血・お灸の艾', 'food:草餅', 'ritual:邪気払い'], '野原の香る草。艾にしてお灸をすえる。', 1, 0, 2],
  ['mint', '薄荷', '葉', ['river', 'grass'], 0.2, { calm: 5 }, ['drink:薄荷茶', 'medicine:胃と頭痛', 'craft:歯磨き粉・虫除け'], '清涼な香りの草。増えすぎるほど丈夫。', 1, 0, 1],
  ['rosemary', '迷迭香', '葉', ['hill', 'beach'], 0.3, { mind: 5 }, ['food:肉料理の香り', 'medicine:物忘れと気付け', 'ritual:婚礼と葬礼の飾り（忘れない誓い）'], '海の露と呼ばれる香草。記憶を助けるという。', 1, 0, 1],
  ['thyme', '立麝香草', '葉', ['hill', 'rock'], 0.3, { hp: 2 }, ['food:煮込みの香り', 'medicine:咳・のどの薬', 'luxury:騎士の勇気の印'], '岩場に這う小さな香草。', 1, 0, 1],
  ['sage_herb', '鼠尾草', '葉', ['hill', 'field'], 0.3, { hp: 3 }, ['food:腸詰めの香り', 'medicine:のどの痛み・汗止め', 'ritual:煙で清め'], '賢者の草と呼ばれる銀緑の葉。', 1, 0, 1],
  ['lavender', '薫衣草', '花', ['hill', 'field'], 0.4, { calm: 10, sleep: 5 }, ['luxury:香り袋・洗濯水の香り', 'medicine:眠れぬ夜・虫刺され', 'craft:香油'], '紫の穂の花。衣装箱に入れると虫がつかない。', 1, 0, 1],
  ['chamomile', '加密列', '花', ['grass', 'field'], 0.3, { calm: 8, sleep: 5 }, ['drink:眠る前のお茶', 'medicine:胃痛・子どもの夜泣き'], '林檎の香りの小さな白い花。', 1, 0, 1],
  ['fennel', '茴香', '種', ['field', 'beach'], 0.3, {}, ['food:魚料理とパンの香り', 'medicine:腹の張り・乳の出'], '甘い香りの種。', 1, 0, 1],
  ['dill', '蒔蘿', '葉', ['field'], 0.2, {}, ['food:酢漬けと魚の香り', 'medicine:赤子の腹痛'], '細い羽根のような葉の香草。', 1, 0, 1],
  ['coriander', '胡荽', '種', ['field'], 0.3, {}, ['food:煮込み・腸詰めの香り', 'medicine:胃'], '葉も種も香る草。', 1, 0, 1],
  ['basil', '目箒', '葉', ['field'], 0.3, {}, ['food:赤茄子料理', 'medicine:目の汚れを取る'], '王の草と呼ばれる香りの葉。', 1, 0, 1],
  ['parsley', '和蘭芹', '葉', ['field'], 0.2, {}, ['food:料理の青み・口臭消し'], 'どの台所にもある香草。', 1, 0, 1],
  ['laurel', '月桂樹の葉', '葉', ['hill', 'forest'], 0.2, {}, ['food:煮込みの香り', 'ritual:勝者の冠'], '勝利の冠を編む木の葉。', 0, 0, 1],
  ['licorice', '甘草', '根', ['grass', 'desert'], 0.8, { hp: 3 }, ['medicine:咳・薬を飲みやすくする', 'luxury:甘い噛み根'], '砂糖より甘い根。どの薬にも少し混ぜる。', 1, 0, 1],
  ['angelica', '当帰', '根', ['mountain', 'forest'], 1, { hp: 5 }, ['medicine:女の病・血を補う', 'craft:酒の香り'], '天使の草と呼ばれる大きな草の根。', 1, 0, 1],
  ['peony_root', '芍薬の根', '根', ['hill'], 1.2, { pain: -10 }, ['medicine:痛み止め・痙攣止め'], '芍薬の根。花も美しい。', 1, 0, 1],
  ['ginseng', '朝鮮人参', '根', ['dense', 'mountain'], 25, { hp: 30, stamina: 30 }, ['medicine:万病の薬・老人の滋養', 'luxury:王族への献上品', 'trade:同じ重さの銀と換えられる'], '人の形をした根。山奥で数十年育ったものは宝。', 0, 2, 1],
  ['gentian', '竜胆の根', '根', ['mountain'], 1, {}, ['medicine:苦い胃薬・食欲', 'craft:苦い薬酒'], '青い花の草の根。竜の胆より苦いという。', 0, 1, 1],
  ['dokudami', '蕺草', '葉', ['forest', 'town'], 0.1, { hp: 3 }, ['medicine:十の薬（腫れ物・毒虫・便通）'], '日陰に生える臭い草。十薬とも言う。', 0, 0, 1],
  ['plantain', '大葉子', '葉', ['grass', 'town', 'field'], 0.05, { hp: 3 }, ['medicine:切り傷・咳止め'], '道端でどれだけ踏まれても生える草。', 0, 0, 1],
  ['dandelion', '蒲公英', '根と葉', ['grass', 'field', 'town'], 0.05, {}, ['food:若葉の和え物・根を煎って代用の珈琲', 'medicine:肝と尿'], 'どこにでも咲く黄色い花。', 0, 0, 1],
  ['calendula', '金盞花', '花', ['field', 'grass'], 0.2, { hp: 4 }, ['medicine:傷と肌荒れの軟膏', 'dye:黄色', 'food:乳酪の色づけ'], '橙色の花。', 1, 0, 1],
  ['st_johns_wort', '弟切草', '花', ['grass', 'hill'], 0.4, { calm: 10 }, ['medicine:気の塞ぎ・傷の赤い油', 'ritual:夏至の魔除け'], '葉に黒い点のある黄色い花。傷薬の秘伝を兄が漏らしたという伝説。', 0, 0, 1],
  ['yarrow', '鋸草', '葉', ['grass', 'field'], 0.2, { hp: 5 }, ['medicine:戦傷の血止め', 'ritual:茎で占い'], '兵士の傷薬と呼ばれる草。', 0, 0, 1],
  ['comfrey', '骨接ぎ草', '根と葉', ['river', 'grass'], 0.4, { hp: 6 }, ['medicine:骨折と打ち身の湿布'], '折れた骨を早く接ぐと言われる草。', 1, 0, 1],
  ['valerian', '纈草', '根', ['river', 'grass'], 0.6, { sleep: 20 }, ['medicine:眠り薬・不安を鎮める'], '根がひどく臭う草。猫が酔う。', 1, 0, 1],
  ['feverfew', '夏白菊', '葉', ['field', 'town'], 0.3, { pain: -5 }, ['medicine:熱と頭痛'], '熱を追い払う小さな白い菊。', 1, 0, 1],
  ['hyssop', '柳薄荷', '葉', ['hill', 'rock'], 0.3, {}, ['ritual:神殿の清めの水をまく束', 'medicine:咳'], '聖なる清めに使う香草。', 1, 0, 1],
  ['marshmallow', '沼葵', '根', ['swamp', 'river'], 0.4, { hp: 3 }, ['medicine:のどの痛み・咳', 'food:根の粘りで柔らかい菓子'], '湿地の葵。根はぬるぬるしている。', 1, 0, 1],
  ['lemon_balm', '檸檬香草', '葉', ['field', 'grass'], 0.2, { calm: 8 }, ['drink:香りのお茶', 'hobby:蜂を呼ぶ'], '檸檬の香りの葉。蜂がよく集まる。', 1, 0, 1],
  ['horehound', '苦薄荷', '葉', ['grass', 'rock'], 0.2, {}, ['medicine:咳止めの飴'], '苦い毛の生えた葉。', 1, 0, 1],
  ['tansy', '蓬菊', '花', ['field', 'river'], 0.1, {}, ['craft:蚤と虫除け（床にまく）', 'medicine:腹の虫下し'], '黄色いボタンのような花。', 0, 0, 1],
  ['wormwood', '苦艾', '葉', ['grass', 'rock'], 0.2, {}, ['medicine:腹の虫下し', 'craft:苦い緑の酒の香り・衣の虫除け'], '世界でいちばん苦いと言われる草。', 1, 0, 1],
  ['rue', '芸香', '葉', ['hill', 'rock'], 0.2, {}, ['medicine:目の薬・毒消し', 'ritual:恵みの草（邪視除け）'], '青みがかった強い臭いの草。', 1, 0, 0],
  ['catnip', '猫薄荷', '葉', ['field', 'town'], 0.1, {}, ['hobby:猫が喜んで転げ回る', 'drink:風邪の茶'], '猫が酔う草。', 1, 0, 0],
  ['meadowsweet', '草地の雪草', '花', ['river', 'swamp'], 0.2, { pain: -8 }, ['medicine:痛みと熱を下げる', 'craft:蜂蜜酒の香り・床にまく香草'], '水辺の白いふわふわの花。', 0, 0, 1],
  ['lungwort', '肺草', '葉', ['forest'], 0.2, {}, ['medicine:肺の病・咳'], '葉の斑が肺に似ている草。', 0, 0, 0],
  ['eyebright', '目薬草', '葉', ['grass', 'mountain'], 0.3, {}, ['medicine:目の洗い薬'], '小さな白い花の草。目を明るくする。', 0, 0, 0],
  ['aloe', '蘆薈', '葉', ['desert', 'beach'], 0.5, { hp: 8 }, ['medicine:火傷と日焼けの塗り薬・下し薬'], '厚い葉の中にぬるぬるの汁が詰まった草。医者いらずと呼ばれる。', 1, 0, 1],
  ['snow_lotus', '雪蓮', '花', ['snow', 'mountain'], 30, { hp: 40, warm: 30 }, ['medicine:凍えと古傷を癒す霊薬', 'luxury:王族への献上品'], '雪の高峰の岩場に咲く白い花。数年に一度しか咲かない。', 0, 2, 1],
  ['edelweiss', '薄雪草', '花', ['mountain', 'snow'], 3, {}, ['gift:恋人への贈り物（命がけで摘んだ証）', 'collect:押し花'], '断崖に咲く白い星の花。', 0, 1, 1],
  ['arnica', '山金車', '花', ['mountain', 'grass'], 0.6, { hp: 5 }, ['medicine:打ち身と捻挫の塗り薬（飲むと毒）'], '山の黄色い花。', 0, 0, 1],
  ['ephedra', '麻黄', '茎', ['desert', 'rock'], 1, { stamina: 15 }, ['medicine:咳と熱・眠気覚まし'], '砂漠の節のある細い茎。', 0, 0, 1],
  ['bupleurum', '柴胡', '根', ['hill', 'grass'], 0.8, {}, ['medicine:熱と胸のつかえ'], '細い葉の草の根。', 0, 0, 0],
  ['skullcap', '黄芩', '根', ['hill'], 0.8, {}, ['medicine:熱と下痢'], '黄色い根の草。', 0, 0, 0],
  ['motherwort', '益母草', '葉', ['grass', 'field'], 0.3, {}, ['medicine:お産の後の薬・産婆が使う'], '母を益する草と書く。', 0, 0, 1],
  ['imperata_root', '白茅根', '根', ['grass', 'field'], 0.2, {}, ['medicine:血止め・尿'], '茅の白い根。噛むと甘い。', 0, 0, 0],
  ['moxa', '艾', '葉', [], 0.5, { pain: -10 }, ['medicine:お灸（肩・腰の痛み）'], '蓬の葉の裏の綿毛を集めたもの。', 0, 0, 1],
];
for (const [id, n, part, on, v, fx, uses, desc, farm, rare, d] of MED) {
  const src = [];
  if (on.length) src.push(S(rare >= 2 ? 'forage' : 'gather', on, rare >= 2 ? 0.05 : 0.5));
  if (farm) src.push(S('harvest', FARM, 1));
  const use = uses.map((s) => { const i = s.indexOf(':'); return U(s.slice(0, i), s.slice(i + 1)); });
  if (farm) use.push(U('craft', '薬草畑に植える（畑に植える）'));
  const o = { r: rare, d, src, use, keep: part === '根' ? 180 : 30, desc: `${desc}（使うのは${part}）` };
  if (Object.keys(fx).length) o.fx = fx;
  if (id === 'moxa') o.make = M({ mugwort: 10 }, 'herbalist', 8);
  X(id, n, 'herb', 0.05, v, o);
}
// 香辛料（多くは南の国から商人が運ぶ）
const SP = [
  ['black_pepper', '胡椒', ['jungle'], 6, '肉の味つけと保存・薬', '黒い小さな実。同じ重さの銀と換えられたこともある香辛料の王。', 1, 2],
  ['cinnamon', '肉桂', ['jungle'], 5, '菓子・煮込み・香り酒・薬', '木の内皮を丸めて干したもの。甘い香り。', 1, 1],
  ['clove', '丁子', ['jungle'], 7, '肉の香り・歯の痛み止め・香り玉', '釘の形の蕾を干したもの。', 2, 1],
  ['nutmeg', '肉豆蔻', ['jungle'], 8, '菓子・肉料理（多いと酔う）', '赤い網をかぶった種。遠い島でしか採れない。', 2, 1],
  ['mace', '肉豆蔻花', ['jungle'], 10, '上等な菓子と汁', '肉豆蔻の種を包む赤い網。', 2, 0],
  ['cardamom', '小豆蔻', ['jungle'], 7, '菓子・珈琲の香り・口臭消し', '緑の莢の中の香る種。', 2, 0],
  ['star_anise', '八角', ['jungle', 'mountain'], 3, '煮込みの香り・咳の薬', '星の形の実。', 1, 0],
  ['sansho', '山椒', ['forest', 'hill'], 1, '鰻や汁の痺れる薬味・胃の薬', '小粒でぴりりと辛い実。', 0, 1],
  ['turmeric', '鬱金', ['jungle', 'farm'], 1.5, '煮込みの色と香り・黄色の染め・薬', '黄色い根。', 1, 1],
  ['saffron', '番紅花の雌しべ', ['field', 'hill'], 40, '米料理と菓子の金色・薬・王家の染め', '花一つから3本しか取れない赤い糸。金より高い香辛料。', 2, 1],
  ['vanilla', '香草蘭の莢', ['jungle'], 15, '菓子の甘い香り・香水', '蘭の莢を何か月も発酵させて干したもの。', 2, 1],
  ['cumin', '馬芹', ['desert', 'field'], 1.5, '煮込み・腸詰めの香り', '乾いた地の香る種。', 1, 1],
  ['caraway', '姫茴香', ['field', 'grass'], 1, 'パン・乳酪・酢キャベツの香り', '三日月形の香る種。', 0, 1],
  ['anise', '茴芹', ['field', 'hill'], 1.5, '菓子・薬酒の香り', '甘い香りの種。', 1, 0],
  ['fenugreek', '胡廬巴', ['field', 'desert'], 1, '煮込み・乳の出をよくする', '楓のような香りの種。', 1, 0],
  ['galangal', '良姜', ['jungle'], 2, '汁の香り・胃薬', '生姜に似た赤い根。', 1, 0],
  ['long_pepper', '長胡椒', ['jungle'], 7, '胡椒より辛い香辛料・薬', '棒のような形の胡椒。', 2, 0],
  ['sumac_spice', '赤紫蘇の実粉', ['hill', 'desert'], 1, '酸っぱい赤い粉を肉にふる', '酸っぱい赤い実を挽いた粉。', 1, 0],
  ['shiso', '紫蘇', ['farm', 'field'], 0.2, '梅干しの赤・刺身の薬味・魚の毒消し', '赤と青の香る葉。', 0, 1],
  ['wild_thyme', '伊吹麝香草', ['mountain', 'rock'], 0.5, '香り・お茶', '山の岩場の小さな香草。', 0, 0],
];
for (const [id, n, on, v, note, desc, rare, d] of SP) {
  const tr = rare >= 1;
  const src = [S(on.includes('farm') ? 'harvest' : 'gather', on, tr ? 0.2 : 0.6)];
  if (tr) src.push(S('trade'));
  X(id, n, 'spice', 0.02, v, { r: rare, d: d + 1, src, keep: 700, use: [U('food', note)].concat(tr ? [U('trade', '遠い国の品：高く売れる'), U('luxury')] : []).concat(id === 'saffron' ? [U('dye', '王家の黄色')] : []).concat(id === 'turmeric' ? [U('dye', '黄色')] : []), desc });
}
X('saffron_crocus_bulb', '番紅花の球根', 'bulb', 0.02, 3, { r: 1, src: [S('trade')], use: [U('craft', '畑に植える：秋に紫の花が咲き、雌しべを摘む')], desc: '番紅花を育てるための球根。' });
X('black_pepper_vine', '胡椒の蔓', 'sapling', 0.5, 20, { r: 2, src: [S('forage', ['jungle'], 0.05)], use: [U('craft', '暑い土地の畑に植える：胡椒の実がなる')], desc: '持ち出しを禁じられた胡椒の苗。' });
// 飲み物・嗜好品の元
X('tea_leaf', '茶の葉', 'leaf', 0.1, 0.5, { d: 2, src: [S('harvest', ['farm', 'hill'], 1)], keep: 3, use: [U('craft', '蒸して緑の茶・揉んで寝かせて黒い茶'), U('craft', '茶畑に植える（畑に植える）')], desc: '茶の木の若葉。摘んだらすぐに加工する。' });
X('green_tea', '緑の茶葉', 'drinkleaf', 0.1, 3, { d: 2, make: M({ tea_leaf: 5 }, 'farmer', 4), keep: 365, use: [U('drink', '淹れて茶'), U('luxury'), U('medicine', '眠気覚まし・食あたり')], desc: '蒸して揉んで乾かした茶葉。' });
X('black_tea', '黒茶葉', 'drinkleaf', 0.1, 4, { d: 2, make: M({ tea_leaf: 5 }, 'farmer', 24), keep: 700, use: [U('drink', '淹れて赤い茶'), U('luxury'), U('trade', '長い船旅でも傷まない')], desc: '揉んで寝かせた黒い茶葉。' });
X('tea_seed', '茶の実', 'seed', 0.02, 0.3, { src: [S('harvest', ['farm', 'hill'], 0.3)], use: [PLANT, U('craft', '搾れば茶油')], desc: '茶の木の種。' });
X('coffee_cherry', '珈琲の実', 'fruit', 0.02, 0.4, { d: 1, src: [S('harvest', ['farm', 'jungle', 'mountain'], 1), S('gather', ['jungle'], 0.3)], keep: 7, use: [U('craft', '種を取り出して干して煎る'), PLANT], desc: '赤い小さな実。山羊が食べて跳ね回ったのが始まりという。' });
X('coffee_bean', '煎り珈琲豆', 'drinkleaf', 0.1, 4, { r: 1, d: 1, make: M({ coffee_cherry: 5 }, 'cook', 2), keep: 180, use: [U('drink', '挽いて淹れる黒い飲み物（眠気覚まし）'), U('luxury'), U('trade')], desc: '煎った珈琲の種。' });
X('cacao_pod', '可可の実', 'fruit', 0.5, 1, { r: 1, src: [S('harvest', ['farm', 'jungle'], 1), S('gather', ['jungle'], 0.2)], keep: 10, use: [U('craft', '種を発酵させて可可豆に'), PLANT], desc: '幹から直に実る大きな瓜のような実。' });
X('cacao_bean', '可可豆', 'drinkleaf', 0.1, 5, { r: 1, d: 1, make: M({ cacao_pod: 1 }, 'cook', 120), keep: 365, use: [U('drink', '煎って挽いて苦い神の飲み物'), U('luxury', '貴族の菓子'), U('trade', '南の国ではお金代わり')], desc: '発酵させて干した可可の種。' });
X('tobacco_leaf', '煙草の葉', 'leaf', 0.1, 0.8, { d: 1, src: [S('harvest', FARM, 1)], keep: 5, use: [U('craft', '干して刻み煙草'), PLANT, U('craft', '煮汁は畑の虫除け')], desc: '大きな葉。' });
X('cured_tobacco', '刻み煙草', 'luxury', 0.05, 3, { d: 2, make: M({ tobacco_leaf: 3 }, 'farmer', 240), keep: 700, use: [U('luxury', '煙管でふかす・噛む'), U('trade')], desc: '干して寝かせ細かく刻んだ煙草。船乗りと兵士の楽しみ。' });
X('hops', '酒花', 'herb', 0.05, 0.8, { d: 2, src: [S('harvest', FARM, 1), S('gather', ['forest', 'river'], 0.3)], keep: 180, fx: { sleep: 5 }, use: [U('craft', '麦酒に苦味と日持ちを与える'), U('medicine', '眠り枕'), PLANT], desc: '蔓に実る松かさのような花。麦酒が腐らなくなる。' });
X('gruit', '麦酒の香草束', 'herb', 0.2, 1.5, { make: M({ bog_myrtle: 2, yarrow: 1, rosemary: 1 }, 'brewer', 1), keep: 180, use: [U('craft', '酒花の代わりの麦酒の香りづけ')], desc: '昔ながらの麦酒の香草の合わせ。修道院の秘伝。' });
X('bog_myrtle', '湿地の香木', 'herb', 0.05, 0.3, { src: [S('gather', ['swamp'], 0.5)], use: [U('craft', '麦酒の香り'), U('craft', '蚤除け')], desc: '沼に茂る香りのよい低木の葉。' });
X('sugarcane', '甘蔗', 'crop', 2, 0.8, { d: 2, src: [S('harvest', ['farm', 'field', 'jungle'], 1)], keep: 14, food: 4, use: [U('craft', '搾って煮詰め砂糖・糖蜜・甘蔗の酒'), U('food', 'かじって甘い汁'), PLANT], desc: '甘い汁を蓄える背の高い草。' });
X('bagasse', '甘蔗の搾りかす', 'straw', 1, 0.02, { src: [S('harvest', ['farm', 'field', 'jungle'], 1)], use: [U('fuel', '砂糖を煮る火に使う'), U('feed')], desc: '甘蔗を搾った後の繊維。' });
X('chicory_root', '菊苦菜の根', 'root', 0.2, 0.3, { src: [S('harvest', FARM, 1), S('forage', ['grass'], 0.3)], use: [U('drink', '煎って珈琲の代わり'), U('food', '葉は苦い菜'), PLANT], desc: '青い花の草の根。' });
X('barley_tea', '麦茶の麦', 'drinkleaf', 0.5, 0.5, { d: 1, make: M({ barley: 1 }, 'cook', 1), keep: 365, use: [U('drink', '煮出して夏の麦茶')], desc: '殻ごと煎った大麦。' });
X('mate_leaf', '草原茶の葉', 'drinkleaf', 0.1, 1.5, { src: [S('gather', ['savanna', 'grass'], 0.4), S('trade')], keep: 365, use: [U('drink', '瓢箪で回し飲む苦いお茶'), U('medicine', '眠気覚まし')], desc: '草原の民が回し飲む苦い茶の葉。' });
X('kola_nut', '覚醒の実', 'nut', 0.02, 1.5, { r: 1, src: [S('gather', ['jungle', 'savanna'], 0.3)], keep: 60, fx: { stamina: 15 }, use: [U('luxury', '噛むと疲れが消える'), U('gift', '南の国では客人に贈る'), U('trade')], desc: '噛むと苦くて眠気が飛ぶ実。' });
X('betel_leaf', '檳榔の実と葉', 'luxury', 0.02, 0.5, { src: [S('gather', ['jungle'], 0.4)], use: [U('luxury', '噛む嗜好品（口が赤く染まる）')], desc: '南の国で噛まれる実と葉。' });
