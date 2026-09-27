import { P, S, U, M, PLANT, has } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 4, ...o });
const u = (arr) => arr.map((s) => { const i = s.indexOf(':'); return i < 0 ? U(s) : U(s.slice(0, i), s.slice(i + 1)); });
// ── キノコ ──
// [id, 名, 場所, 値, 満腹, fx, uses, 説明, rare, 原木で育つ]
const MUS = [
  ['shiitake', '椎茸', ['forest'], 0.8, 3, null, ['food:焼く・汁・干して旨味の出汁'], '広葉樹の倒木に生える茸。干すと香りが増す。', 0, 1],
  ['maitake', '舞茸', ['forest', 'dense'], 2, 4, null, ['food:天ぷら・炊き込み飯'], '見つけた者が舞い踊るという大株の茸。', 1, 0],
  ['oyster_mushroom', '平茸', ['forest'], 0.5, 3, null, ['food:汁・炒め物'], '倒木に重なって生える茸。', 0, 1],
  ['shimeji', '占地', ['forest'], 0.6, 2, null, ['food:汁・炊き込み'], '香り松茸、味占地。', 0, 0],
  ['matsutake', '松茸', ['forest', 'mountain'], 12, 3, null, ['food:焼いて香りを楽しむ', 'luxury:貴族の秋の贈り物', 'gift'], '赤松の林にだけ生える香り高い茸。育てられない。', 2, 0],
  ['nameko', '滑子', ['forest', 'dense'], 0.4, 2, null, ['food:ぬめりのある汁'], '橅の倒木に群れる茸。', 0, 1],
  ['wood_ear', '木耳', ['forest', 'jungle'], 0.5, 1, null, ['food:干して炒め物・汁'], '耳の形の茸。干すと何年も持つ。', 0, 1],
  ['black_truffle', '黒松露', ['forest'], 40, 2, null, ['luxury:王の食卓の宝石', 'trade', 'food:香りづけ'], '樫の根元の土の中に育つ黒い塊の茸。豚や犬に探させる。', 3, 0],
  ['white_truffle', '白松露', ['forest', 'hill'], 70, 2, null, ['luxury:最も高価な茸', 'trade'], '秋の丘の地中にだけ育つ白い松露。', 3, 0],
  ['chanterelle', '杏茸', ['forest'], 1.5, 2, null, ['food:乳酪で炒める'], '杏の香りのする黄色い茸。', 1, 0],
  ['porcini', '山鳥茸', ['forest', 'mountain'], 2, 4, null, ['food:干して煮込み・汁'], '太い軸の茶色い茸。干すと香りが強い。', 1, 0],
  ['morel', '網笠茸', ['forest', 'field'], 3, 2, null, ['food:春の贅沢な煮込み'], '網目模様の頭の春の茸。山火事の跡に多く出る。', 1, 0],
  ['button_mushroom', '馬糞茸', ['field', 'farm'], 0.3, 2, null, ['food:汁・炒め物'], '厩の堆肥の上に育つ白い茸。育てやすい。', 0, 0],
  ['lingzhi', '霊芝', ['dense', 'mountain'], 20, 0, { hp: 20, age: -1 }, ['medicine:不老長寿の薬', 'luxury:献上品'], '漆を塗ったように光る硬い茸。万年茸とも言う。', 2, 0],
  ['cordyceps', '冬虫夏草', ['mountain', 'snow'], 30, 0, { stamina: 40 }, ['medicine:滋養強壮の霊薬', 'trade'], '冬は虫、夏は草という不思議な茸。', 3, 0],
  ['tinder_fungus', '火口茸', ['forest', 'dense'], 0.5, 0, null, ['fuel:煮て叩いて火口（火打ち石の火を受ける）', 'craft:帽子や鞍の敷き革の代わり'], '樺の幹に生える蹄の形の茸。旅人の火種。', 0, 0],
  ['fly_agaric', '紅天狗茸', ['forest', 'snow'], 1, 0, { poison: 30, confuse: 40 }, ['craft:蠅取り（牛乳に浸す）', 'magic:北の呪術師の幻視'], '赤い笠に白い斑点の毒茸。', 1, 0],
  ['death_cap', '死の笠', ['forest'], 2, 0, { poison: 100 }, ['craft:毒（食べて数日後に死ぬ）'], '見た目はおいしそうな淡緑の毒茸。', 1, 0],
  ['destroying_angel', '毒鶴茸', ['forest', 'dense'], 2, 0, { poison: 100 }, ['craft:暗殺の毒'], '純白の美しい猛毒茸。', 1, 0],
  ['laughing_mushroom', '笑い茸', ['field', 'grass'], 1, 0, { confuse: 30, mood: 20 }, ['luxury:宴の悪戯', 'magic:道化の儀式'], '食べると笑いが止まらない茸。', 1, 0],
  ['moonlight_mushroom', '月夜茸', ['forest', 'dense'], 1, 0, { poison: 20 }, ['tool:夜に青白く光る灯り', 'collect'], '夜に光る毒茸。', 1, 0],
  ['cave_glowcap', '洞窟の光茸', ['cave', 'dungeon', 'mine'], 1.5, 1, { mp: 5 }, ['tool:坑道の灯り', 'magic:光の薬', 'food'], '地下で青く光る茸。坑夫が道しるべに植える。', 1, 0],
  ['giant_mushroom', '大鬼茸', ['cave', 'swamp', 'jungle'], 3, 25, null, ['food:一つで一家族が満腹', 'build:笠は小屋の屋根'], '人の背丈ほどに育つ茸。', 2, 0],
  ['bone_mushroom', '骨茸', ['ruins', 'demoncastle', 'cave'], 4, 0, { mp: 10, poison: 10 }, ['magic:死霊術の触媒', 'craft:骨を柔らかくする薬'], '墓場の骨から生える白い茸。', 2, 0],
  ['miasma_mushroom', '瘴気茸', ['demoncastle', 'swamp'], 3, 0, { poison: 40 }, ['magic:毒霧の触媒', 'craft:魔物除けの煙（燻すと魔物が嫌う）'], '魔界の荒野に群れる紫の茸。胞子は毒の霧。', 1, 0],
  ['dream_mushroom', '夢茸', ['dense', 'cave'], 6, 0, { sleep: 30, mind: 10 }, ['magic:予知の夢', 'luxury'], '食べると未来の夢を見るという茸。', 2, 0],
  ['firecap', '火炎茸', ['volcano', 'dense'], 5, 0, { poison: 50, warm: 20 }, ['magic:火の魔法の触媒', 'craft:触るとただれる毒'], '炎のような赤い茸。触れるだけで肌が焼ける。', 2, 0],
  ['puffball', '埃茸', ['grass', 'field'], 0.2, 2, null, ['food:若いうちは食べられる', 'medicine:熟した胞子の粉は血止め'], '踏むと煙のような胞子を吹く丸い茸。', 0, 0],
  ['enoki', '榎茸', ['forest', 'snow'], 0.4, 2, null, ['food:鍋・汁'], '冬の榎の切り株に生える茸。', 0, 1],
  ['king_trumpet', '王茸', ['forest', 'grass'], 3, 5, null, ['food:焼いて肉のような歯ごたえ', 'luxury'], '太く白い軸の茸。', 2, 0],
];
for (const [id, n, on, v, food, fx, uses, desc, rare, log] of MUS) {
  const src = [S(rare >= 2 ? 'forage' : 'gather', on, rare >= 3 ? 0.01 : rare >= 2 ? 0.05 : 0.4)];
  const use = u(uses);
  if (log) { src.push(S('harvest', ['farm'], 1)); use.push(U('craft', '原木に種駒を打って植える（畑に植える）')); }
  const o = { r: rare, d: food ? 1 : 0, src, use, keep: 5, desc };
  if (food) o.food = food;
  if (fx) o.fx = fx;
  X(id, n, 'mushroom', 0.1, v, o);
}
X('mushroom_spawn', '茸の種駒', 'seed', 0.1, 1, { make: M({ shiitake: 1, konara_sawdust: 1 }, 'farmer', 48), use: [U('craft', '原木に打って椎茸・平茸・滑子を育てる（畑に植える）')], desc: '茸の菌を移した木の駒。' });
X('dried_shiitake', '干し椎茸', 'mushroom', 0.02, 1.5, { d: 1, make: M({ shiitake: 5 }, 'farmer', 48), food: 2, keep: 700, use: [U('food', '水で戻して出汁'), U('trade')], desc: '日に干した椎茸。旨味が増して何年も持つ。' });
// ── 苔・地衣 ──
const MOSS = [
  ['sphagnum', '水苔', ['swamp'], 0.2, ['medicine:傷の手当ての詰め物（血と膿を吸う）', 'craft:苗や魚を湿らせて運ぶ・おしめ'], '水をよく吸う沼の苔。'],
  ['hair_moss', '杉苔', ['forest', 'dense'], 0.1, ['craft:丸太小屋の隙間の詰め物', 'hobby:苔庭'], '杉のような形の苔。'],
  ['reindeer_lichen', '雪原の地衣', ['tundra', 'snow'], 0.1, ['feed:冬のトナカイの餌', 'food:飢えたときの粥'], '白く枝分かれした地衣。'],
  ['old_mans_beard', '猿麻桛', ['dense', 'mountain'], 0.2, ['medicine:傷の消毒', 'fuel:火口', 'craft:詰め物'], '木の枝から髭のように垂れる地衣。'],
  ['rock_tripe', '石茸', ['rock', 'mountain'], 1, ['food:崖で命がけで採る珍味'], '岩肌に張り付く地衣。'],
  ['litmus_lichen', '色変わり苔', ['beach', 'rock'], 1, ['dye:紫の染め', 'magic:錬金術で酸を見分ける'], '汁が酸で赤、灰汁で青に変わる地衣。'],
  ['oakmoss', '樫苔', ['forest'], 0.8, ['luxury:香水の土台の香り', 'craft:詰め物'], '樫の幹に付く地衣。深い森の香り。'],
  ['snow_moss', '雪苔', ['snow', 'mountain'], 0.5, ['medicine:凍傷の塗り薬'], '雪の下でも緑の苔。'],
  ['grave_moss', '墓苔', ['ruins', 'town'], 1.5, ['magic:死霊術', 'ritual:墓守の供養'], '古い墓石にだけ生える黒い苔。'],
  ['dragon_moss', '竜苔', ['volcano', 'mountain'], 8, ['magic:竜の巣の目印', 'medicine:火傷'], '竜の巣の岩に生える赤い苔。'],
  ['sulfur_moss', '硫黄苔', ['volcano'], 1, ['medicine:皮膚病の塗り薬', 'craft:黄色い染め'], '温泉と火口のそばの黄色い苔。'],
  ['moss_clump', '苔の塊', ['forest', 'dense', 'river'], 0.05, ['craft:壁の隙間・枕の詰め物', 'fertilize'], 'どこにでもある苔の塊。'],
];
for (const [id, n, on, v, uses, desc] of MOSS) X(id, n, 'moss', 0.1, v, { d: 0, src: [S('gather', on, 0.5)], use: u(uses), desc });
// ── 海藻 ──
const SEA = [
  ['kombu', '昆布', ['sea'], 1.5, 2, ['food:出汁の王・煮物', 'trade:干して遠くへ売る'], '北の冷たい海の大きな海藻。'],
  ['wakame', '若布', ['sea', 'beach'], 0.3, 2, ['food:汁の具'], '春の海の柔らかい海藻。'],
  ['nori', '海苔', ['beach', 'sea'], 1, 1, ['food:干して紙のように漉く・飯を巻く'], '岩場の黒い海藻。'],
  ['agar_weed', '天草', ['sea', 'beach'], 0.5, 0, ['craft:煮て寒天（菓子・菌を育てる床）'], '赤い海藻。煮ると固まる。'],
  ['hijiki', '鹿尾菜', ['beach'], 0.5, 2, ['food:煮物'], '岩に生える黒い海藻。'],
  ['sea_lettuce', '石蓴', ['beach'], 0.1, 1, ['food:汁の青み', 'feed:家畜の餌'], '薄い緑の海藻。'],
  ['bladderwrack', '浮き袋藻', ['beach', 'sea'], 0.1, 0, ['fertilize:浜の畑の肥やし', 'craft:焼いて灰（硝子と石鹸）'], '浮き袋のついた茶色い海藻。浜に打ち上がる。'],
  ['giant_kelp', '大海草', ['deep', 'sea'], 0.3, 1, ['craft:丈夫な繊維・焼いて灰', 'feed'], '海の森を作る巨大な海藻。'],
  ['sea_grapes', '海葡萄', ['sea', 'beach'], 2, 1, ['food:珍味（ぷちぷち）', 'luxury'], '南の海の粒々の海藻。'],
  ['river_nori', '川海苔', ['river'], 3, 1, ['food:清流の珍味'], '清流の石につく緑の海苔。'],
  ['lake_ball', '毬藻', ['lake'], 5, 0, ['collect:瓶で飼う丸い藻', 'gift'], '湖の底を転がる丸い藻。'],
  ['coral_weed', '珊瑚藻', ['sea'], 0.5, 0, ['fertilize:酸っぱい畑を直す', 'medicine:骨を強くする'], '石灰をまとった硬い赤い海藻。'],
  ['glow_algae', '深海の光藻', ['deep'], 6, 0, ['tool:瓶に詰めて水中の灯り', 'magic:水の魔法の触媒'], '深い海で青く光る藻。'],
  ['seagrass', '甘藻', ['sea', 'beach'], 0.05, 0, ['craft:布団と鞍の詰め物・屋根葺き', 'fertilize'], '浅い海の草原を作る細長い草。'],
];
for (const [id, n, on, v, food, uses, desc] of SEA) { const o = { d: food ? 2 : 1, src: [S(on.includes('beach') || on.includes('river') || on.includes('lake') ? 'gather' : 'fish', on, 0.4)], use: u(uses), keep: 30, desc }; if (food) o.food = food * 2; X(id, n, 'seaweed', 0.2, v, o); }
X('dried_kombu', '干し昆布', 'seaweed', 0.1, 2.5, { d: 2, make: M({ kombu: 2 }, 'fisher', 48), keep: 700, use: [U('food', '出汁'), U('trade', '遠くの内陸で高く売れる')], desc: '天日で干した昆布。' });
X('agar', '寒天', 'seaweed', 0.05, 3, { make: M({ agar_weed: 5 }, 'cook', 24), keep: 700, use: [U('food', '菓子を固める'), U('craft', '錬金術師が菌や苔を育てる床')], desc: '天草を煮て凍らせ干したもの。' });
X('kelp_ash', '海藻灰', 'ash', 0.5, 0.8, { make: M({ bladderwrack: 10 }, 'charcoal', 4), use: [U('craft', '硝子・石鹸の原料'), U('fertilize')], desc: '海藻を焼いた灰。' });
X('glasswort', '塩草', 'wildveg', 0.1, 0.2, { src: [S('gather', ['beach', 'swamp', 'desert'], 0.6)], food: 2, keep: 3, use: [U('food', '塩味の青物'), U('craft', '焼いた灰で硝子を作る')], desc: '塩水の浜に生える節のある草。' });
X('glasswort_ash', '塩草の灰', 'ash', 0.5, 1.5, { d: 1, make: M({ glasswort: 10 }, 'charcoal', 4), use: [U('craft', '最良の硝子と石鹸の原料')], desc: '硝子職人が買い求める灰。' });
// ── 花 ──
// [id, 名, 場所, 値, uses, 説明, 植え方 seed|bulb|none, rare]
const FL = [
  ['rose', '薔薇', ['grass', 'town'], 1, ['gift:愛の贈り物', 'luxury:花の香水', 'food:花弁の砂糖漬け'], '棘のある香り高い花。王家の紋にも。', 'cutting', 0],
  ['lily', '百合', ['grass', 'hill'], 0.8, ['ritual:婚礼と葬礼', 'gift'], '純白の大きな花。', 'bulb', 0],
  ['violet', '菫', ['grass', 'forest'], 0.2, ['food:砂糖漬けの菓子', 'luxury:香水', 'gift'], '春の小さな紫の花。', 'seed', 0],
  ['carnation', '撫子', ['field', 'grass'], 0.4, ['gift:母に贈る', 'luxury'], '縁がぎざぎざの花。', 'seed', 0],
  ['chrysanthemum', '菊', ['field', 'hill'], 0.6, ['ritual:葬礼・菊の節句', 'food:花を酢の物', 'hobby:菊作りの品評会'], '秋の気高い花。', 'cutting', 0],
  ['tree_peony', '牡丹', ['town', 'hill'], 3, ['luxury:花の王（貴族の庭）', 'medicine:根の皮は血の薬', 'hobby'], '豪華な大輪の花。', 'cutting', 1],
  ['peony', '芍薬', ['hill', 'field'], 1.5, ['gift', 'luxury'], '牡丹に似た大輪の花。', 'bulb', 0],
  ['bellflower', '桔梗', ['grass', 'hill'], 0.3, ['medicine:根は咳の薬', 'collect'], '星形の青紫の花。', 'seed', 0],
  ['sunflower', '向日葵', ['field'], 0.3, ['collect', 'hobby:子どもの背比べ'], '太陽を追う大きな花。種は油と食べ物。', 'seed', 0],
  ['daisy', '雛菊', ['grass', 'field'], 0.05, ['hobby:花冠を編む', 'gift'], '野原に咲く小さな白い花。', 'seed', 0],
  ['forget_me_not', '勿忘草', ['river', 'grass'], 0.2, ['gift:別れの贈り物', 'collect'], '私を忘れないでという青い小花。', 'seed', 0],
  ['narcissus', '水仙', ['beach', 'grass'], 0.3, ['collect', 'gift'], '冬に香る花。球根は毒。', 'bulb', 0],
  ['lily_of_the_valley', '鈴蘭', ['forest'], 0.4, ['gift:幸運の贈り物', 'luxury:香水', 'craft:毒（全草）'], '鈴のような白い花。猛毒。', 'bulb', 0],
  ['tulip', '鬱金香', ['field', 'town'], 1.5, ['collect:珍しい色は家一軒の値段', 'hobby', 'trade'], '杯の形の花。珍しい縞模様の球根に金持ちが熱を上げる。', 'bulb', 1],
  ['iris', '菖蒲', ['swamp', 'river'], 0.5, ['ritual:端午の節句の魔除け湯', 'luxury:根は香水の元'], '剣のような葉の水辺の花。', 'bulb', 0],
  ['hydrangea', '紫陽花', ['town', 'forest'], 0.4, ['collect', 'hobby:土で色が変わる'], '雨の季節の丸い花。', 'cutting', 0],
  ['osmanthus', '金木犀', ['town', 'hill'], 0.4, ['luxury:香り袋・花の酒', 'food:花の蜜煮'], '秋に町中を甘く香らせる橙の小花。', 'cutting', 0],
  ['daphne', '沈丁花', ['town', 'hill'], 0.3, ['luxury:香り'], '春の初めに香る花。', 'cutting', 0],
  ['plum_blossom', '梅の花', ['town', 'hill', 'farm'], 0.2, ['ritual:春を告げる祭り', 'hobby:観梅の宴'], '雪の残るころ咲く梅の花。', 'none', 0],
  ['camellia', '椿', ['forest', 'town', 'beach'], 0.3, ['collect', 'ritual:神木の花'], '冬に咲く赤い花。花ごと落ちる。', 'cutting', 0],
  ['wisteria_flower', '藤の花', ['forest', 'town'], 0.3, ['hobby:藤棚の見物', 'food:花の天ぷら'], '垂れ下がる紫の房の花。', 'none', 0],
  ['water_lily', '睡蓮', ['lake', 'swamp'], 0.5, ['collect', 'ritual'], '水面に浮かぶ花。昼に咲いて夜に閉じる。', 'bulb', 0],
  ['lotus', '蓮の花', ['swamp', 'lake'], 1, ['ritual:神殿の供花（泥から清らかに咲く）', 'food:実と根を食べる'], '泥の沼から咲く清らかな花。', 'bulb', 0],
  ['jasmine', '茉莉花', ['jungle', 'town'], 2, ['luxury:香水・花茶', 'trade'], '夜に強く香る白い花。', 'cutting', 1],
  ['orange_blossom', '橙花', ['hill', 'farm'], 1.5, ['luxury:香水・花嫁の髪飾り'], '柑橘の白い花。', 'none', 1],
  ['cornflower', '矢車菊', ['field'], 0.1, ['dye:青い絵の具', 'collect'], '麦畑に混じって咲く青い花。', 'seed', 0],
  ['poppy', '雛罌粟', ['field', 'grass'], 0.1, ['ritual:戦死者を悼む赤い花', 'collect'], '麦畑の赤い花。', 'seed', 0],
  ['opium_poppy', '罌粟', ['field'], 2, ['craft:未熟な実から乳を取る（国の許しが要る）', 'collect'], '眠りの花。育てるには王の許しが要る。', 'seed', 1],
  ['orchid', '蘭', ['jungle', 'dense'], 8, ['collect:蘭の収集は貴族の道楽', 'hobby', 'trade'], '密林の木に着く色とりどりの花。', 'cutting', 2],
  ['gentian_flower', '竜胆', ['mountain', 'grass'], 0.3, ['collect', 'gift'], '秋の山の青い花。', 'seed', 0],
  ['cactus_flower', '仙人掌の花', ['desert'], 1, ['collect', 'food:花のつぼみ'], '砂漠の雨の後に一晩だけ咲く。', 'none', 1],
  ['queen_of_night', '月下美人', ['jungle', 'desert'], 5, ['collect:一夜だけの花を見る宴', 'luxury'], '年に一度、真夜中に数刻だけ咲く白い花。', 'cutting', 2],
  ['black_rose', '黒薔薇', ['ruins', 'demoncastle'], 25, ['collect', 'gift:別れの花', 'magic:呪い'], '廃墟に咲く黒い薔薇。', 'none', 3],
  ['blue_rose', '青い薔薇', ['dense', 'ruins'], 150, ['collect:伝説の花', 'gift:王妃への献上', 'quest'], '決して咲かないと言われた奇跡の青い薔薇。', 'none', 4],
  ['snowdrop', '雪割草', ['snow', 'forest'], 0.5, ['gift:希望の花', 'collect'], '雪を割って咲く最初の花。', 'bulb', 0],
  ['wild_rose', '野薔薇', ['grass', 'field'], 0.1, ['luxury:薔薇水', 'hobby:生け垣'], '野に咲く白い小さな薔薇。', 'none', 0],
  ['clover', '白詰草', ['grass', 'field'], 0.02, ['feed:牛と羊の一番の餌', 'fertilize:畑を肥やす', 'hobby:花冠'], '野原を覆う白い花。蜂の好物。', 'seed', 0],
  ['heather', '石南花の荒野草', ['hill', 'mountain', 'tundra'], 0.05, ['craft:箒・屋根・寝床', 'feed:蜂の蜜源'], '荒れ野を紫に染める小さな花。', 'none', 0],
  ['rhododendron', '石楠花', ['mountain'], 0.5, ['collect', 'craft:葉は毒'], '高い山の大きな花。蜜は毒になる。', 'none', 0],
  ['marigold', '万寿菊', ['field', 'town'], 0.1, ['ritual:死者の祭りの飾り', 'dye:橙', 'craft:畑の虫除け'], '橙色の強い香りの花。', 'seed', 0],
  ['everlasting', '永久花', ['desert', 'hill'], 0.4, ['collect:乾かしても色が褪せない', 'ritual:墓の飾り'], 'かさかさした花びらの枯れない花。', 'seed', 0],
];
for (const [id, n, on, v, uses, desc, how, rare] of FL) {
  const src = [S(rare >= 2 ? 'forage' : 'gather', on, rare >= 4 ? 0.002 : rare >= 2 ? 0.05 : 0.4)];
  if (how !== 'none') src.push(S('harvest', ['farm', 'town'], 1));
  X(id, n, 'flower', 0.05, v, { r: rare, d: rare ? 1 : 1, src, use: u(uses), keep: 4, desc });
  if (how === 'bulb' && !has(`${id}_bulb`)) X(`${id}_bulb`, `${n}の球根`, 'bulb', 0.05, Math.max(0.2, v * (id === 'tulip' ? 3 : 0.8)), { r: rare, src: [S('harvest', ['farm', 'town'], 0.5), S('forage', on, 0.1)], use: [U('craft', '庭や畑に植える：秋に植えれば春に咲く')].concat(id === 'tulip' ? [U('trade', '投機の的')] : []), desc: `${n}の球根。` });
  if (how === 'seed' && !has(`${id}_seed`)) X(`${id}_seed`, `${n}の種`, 'seed', 0.005, Math.max(0.05, v * 0.3), { st: 100, src: [S('harvest', ['farm', 'town'], 0.5), S('gather', on, 0.2)], use: [U('craft', '庭や畑に植える（畑に植える）')], desc: `${n}の種。` });
  if (how === 'cutting' && !has(`${id}_cutting`)) X(`${id}_cutting`, `${n}の挿し穂`, 'sapling', 0.05, Math.max(0.2, v * 0.8), { r: rare, src: [S('harvest', ['farm', 'town'], 0.5)], use: [U('craft', '庭に植える：挿し木で根付く')], desc: `${n}の枝の先を切った挿し穂。` });
}
X('rose_petals', '薔薇の花弁', 'flower', 0.02, 1.5, { d: 1, make: M({ rose: 2 }, 'gardener', 1), keep: 3, use: u(['luxury:湯に浮かべる・婚礼にまく', 'craft:薔薇水と薔薇油']), desc: '摘んだ薔薇の花びら。' });
X('rose_water', '薔薇水', 'perfume', 0.5, 6, { d: 1, make: M({ rose_petals: 10 }, 'alchemist', 6), use: u(['luxury:香り水・菓子の香り', 'medicine:目と肌を洗う']), desc: '花弁を蒸して取った香り水。' });
X('rose_oil', '薔薇油', 'perfume', 0.02, 60, { r: 2, d: 1, make: M({ rose_petals: 200 }, 'alchemist', 24), use: u(['luxury:最高の香水', 'trade', 'gift']), desc: '一滴取るのに花弁が山ほど要る香油。金より高い。' });
X('lavender_oil', '薫衣草油', 'perfume', 0.05, 8, { make: M({ lavender: 30 }, 'alchemist', 12), use: u(['luxury:香水', 'medicine:火傷・虫刺され・眠り']), desc: '薫衣草を蒸して取った精油。' });
X('jasmine_oil', '茉莉花油', 'perfume', 0.02, 40, { r: 2, make: M({ jasmine: 100 }, 'alchemist', 24), use: u(['luxury:夜の香水', 'trade']), desc: '夜に摘んだ茉莉花の香油。' });
X('neroli_oil', '橙花油', 'perfume', 0.02, 35, { r: 2, make: M({ orange_blossom: 80 }, 'alchemist', 24), use: u(['luxury:貴婦人の香水', 'gift']), desc: '橙の花の香油。' });
X('iris_root', '菖蒲の根', 'perfume', 0.1, 2, { make: M({ iris_bulb: 2 }, 'herbalist', 240), use: u(['luxury:干して香りの粉（香水を留める）', 'ritual:菖蒲湯']), desc: '何年も干すと菫の香りになる根。' });
X('potpourri', '香り草の袋', 'perfume', 0.1, 3, { d: 1, make: M({ rose_petals: 3, lavender: 2, oakmoss: 1 }, 'herbalist', 1), use: u(['luxury:衣装箱と寝室の香り', 'gift']), desc: '干した花と香草を混ぜた袋。' });
X('pressed_flower', '押し花', 'collect', 0.01, 0.5, { make: M({ violet: 1 }, 'gardener', 72), use: u(['hobby:押し花の帳面', 'gift:手紙に添える']), desc: '本に挟んで平たく干した花。' });
X('flower_crown', '花冠', 'collect', 0.1, 0.3, { make: M({ daisy: 10 }, 'gardener', 1), keep: 2, use: u(['gift:子どもや恋人へ', 'ritual:五月祭の娘の冠']), desc: '野の花で編んだ冠。' });
// ── 染め物のもと ──
const DYE = [
  ['woad', '菘', 'harvest', ['farm', 'field'], 0.5, '葉を発酵させて藍色（西の藍）', '青を染める草。'],
  ['indigo_leaf', '蓼藍', 'harvest', ['farm', 'field'], 0.6, '葉を発酵させて藍玉', '藍染めの草。'],
  ['madder_root', '茜の根', 'harvest', ['farm', 'field', 'forest'], 1, '赤（兵士の上着・王家の赤）', '赤い根の蔓草。'],
  ['safflower', '紅花', 'harvest', ['farm', 'field'], 1.5, '紅（口紅・頬紅・上等な赤）', '黄色い花から紅を取る。'],
  ['gromwell_root', '紫根', 'forage', ['grass', 'hill'], 4, '紫（高貴な色）・根は傷薬', '紫を染める白い花の草の根。'],
  ['weld', '木犀草', 'harvest', ['farm', 'field'], 0.4, '明るい黄色', '黄色を染める草。'],
  ['kariyasu', '刈安', 'gather', ['hill', 'grass'], 0.2, '黄色', '山の黄色の染め草。'],
  ['sappan_wood', '蘇芳の木片', 'trade', null, 3, '赤紫', '南の国の赤い木の芯。'],
  ['oak_gall', '五倍子', 'gather', ['forest'], 1, '黒（没食子の墨・黒染め）・なめし', '虫が樫や白膠木に作る瘤。鉄と合わせると黒いインクになる。'],
  ['phellodendron_bark', '黄檗の樹皮', 'chop', ['forest', 'mountain'], 1, '鮮やかな黄色・胃薬・虫除けの紙', '内皮が真っ黄色の木の皮。'],
  ['gardenia_fruit', '梔子の実', 'harvest', ['farm', 'hill'], 0.5, '黄色（料理の色づけも）', '口を開けない橙の実。'],
  ['harlequin_berry', '臭木の実', 'gather', ['forest', 'hill'], 0.3, '空色', '赤い萼に青い実。'],
  ['logwood', '血木の芯', 'trade', null, 3, '黒・紫', '南の海辺の木の赤い芯。'],
  ['dyers_lichen', '染め地衣', 'gather', ['rock', 'beach'], 0.8, '紫・茶', '岩の地衣。羊毛を染める。'],
];
for (const [id, n, how, on, v, note, desc] of DYE) {
  const src = [S(how, on || undefined, how === 'trade' ? undefined : 0.5)];
  const use = [U('dye', note)];
  if (how === 'harvest') use.push(PLANT);
  X(id, n, 'dye', 0.1, v, { d: 1, src, use, desc });
}
X('indigo_cake', '藍玉', 'dye', 0.5, 6, { d: 1, make: M({ indigo_leaf: 20 }, 'weaver', 240), use: [U('dye', '藍甕で布を青く染める'), U('trade')], desc: '藍の葉を百日寝かせて固めた染料。' });
X('woad_ball', '菘の玉', 'dye', 0.5, 4, { make: M({ woad: 20 }, 'weaver', 120), use: [U('dye', '青い布')], desc: '菘の葉を潰して丸めて干した玉。' });
X('safflower_cake', '紅餅', 'dye', 0.1, 10, { r: 1, make: M({ safflower: 20 }, 'weaver', 48), use: [U('dye', '紅染め'), U('luxury', '口紅（紅花一匁は金一匁）')], desc: '紅花を寝かせて固めた紅の元。' });
X('ink_gall_black', '五倍子の黒汁', 'dye', 0.3, 2, { make: M({ oak_gall: 3 }, 'scribe', 4), use: [U('craft', '書き物の墨'), U('dye', 'お歯黒・黒染め')], desc: '五倍子を煮た汁。鉄を入れると黒くなる。' });
// ── 地形ごとの植物 ──
const TER = [
  ['cactus_pad', '仙人掌の葉', ['desert'], 0.5, 0.2, 5, ['food:棘を焼いて食べる', 'drink:切ると水が出る（砂漠の命綱）', 'medicine:火傷'], '水を蓄えた厚い茎。'],
  ['agave_heart', '竜舌蘭の芯', ['desert'], 5, 1, 15, ['food:焼くと甘い', 'craft:汁を醸して竜舌蘭の酒'], '何十年に一度だけ花を咲かせる草の芯。'],
  ['tumbleweed', '転がり草', ['desert', 'savanna'], 0.3, 0.01, 0, ['fuel:砂漠の焚き火', 'feed:駱駝の餌'], '枯れて風に転がる草の玉。'],
  ['desert_thorn', '砂茨', ['desert'], 1, 0.05, 0, ['build:獣除けの囲い', 'fuel'], '棘だらけの低木。'],
  ['saxaul', '砂の木', ['desert'], 5, 0.5, 0, ['fuel:石炭のように長く燃える', 'build:砂を止める植林'], '砂漠に生える硬く重い木。'],
  ['tundra_sedge', '凍原の菅', ['tundra', 'snow'], 0.3, 0.02, 0, ['craft:靴の中に敷いて凍えを防ぐ', 'feed'], '凍った大地の丈夫な草。'],
  ['arctic_willow', '這い柳', ['tundra', 'snow'], 0.3, 0.1, 0, ['fuel:凍原の数少ない薪', 'medicine:樹皮は痛み止め'], '地面を這う小さな柳。'],
  ['snow_cabbage', '雪下菜', ['snow'], 0.5, 0.4, 5, ['food:雪の下で甘くなった菜'], '雪に埋もれても枯れない野の菜。'],
  ['pitcher_plant', '捕虫袋', ['jungle', 'swamp'], 0.3, 0.5, 0, ['craft:袋の水は飲める・虫取り', 'collect'], '袋の形の葉で虫を捕らえて溶かす草。'],
  ['giant_leaf', '大傘の葉', ['jungle'], 1, 0.02, 0, ['tool:雨よけの傘', 'craft:料理を包む・屋根'], '人が隠れるほど大きな葉。'],
  ['jungle_liana', '密林の垂れ蔓', ['jungle'], 2, 0.05, 0, ['craft:吊り橋・綱', 'drink:切ると水が滴る'], '木から垂れ下がる太い蔓。'],
  ['rubber_sap', '弾む木の乳', ['jungle'], 0.5, 2, 0, ['craft:水を通さない布・弾む球・靴底'], '木に傷をつけると出る白い乳。固まると弾む。'],
  ['swamp_reed_root', '葦の根', ['swamp', 'river'], 0.5, 0.1, 5, ['food:飢えのときの糧', 'medicine:熱冷まし'], '葦の甘い地下茎。'],
  ['cattail_root', '蒲の根', ['swamp', 'lake'], 0.5, 0.1, 6, ['food:焼いて・粉にして'], '蒲の地下茎。澱粉が多い。'],
  ['will_o_wisp_grass', '鬼火草', ['swamp'], 0.05, 3, 0, ['tool:夜の沼で青く燃える灯り', 'magic'], '夜の沼で青い火を灯す草。旅人を迷わせる。'],
  ['elephant_grass', '象草', ['savanna'], 3, 0.05, 0, ['feed:家畜の餌', 'build:垣根・屋根'], '人の背丈を越える草。'],
  ['savanna_hay', '乾き原の枯れ草', ['savanna'], 2, 0.03, 0, ['feed', 'fuel'], '乾季のサバンナの枯れ草。'],
  ['beach_pea', '浜豌豆', ['beach'], 0.1, 0.1, 3, ['food:若いさや'], '砂浜を這う豆。'],
  ['beach_rose', '浜梨', ['beach'], 0.1, 0.1, 1, ['food:実はジャム', 'dye:根で茶色'], '浜辺の薔薇。実は梨のように甘酸っぱい。'],
  ['sea_fennel', '浜防風', ['beach'], 0.05, 0.3, 1, ['food:刺身のつま', 'medicine:風邪'], '砂浜の香る草。'],
  ['marram_grass', '砂止め草', ['beach', 'desert'], 0.5, 0.02, 0, ['build:砂丘を止める植え込み', 'craft:かご・縄'], '砂に根を張る硬い草。'],
  ['alpine_herb', '高山の香草', ['mountain'], 0.05, 0.5, 0, ['drink:山の茶', 'medicine:高山の病'], '高い山にだけ生える香り草。'],
  ['iwanashi', '岩梨', ['mountain', 'rock'], 0.01, 0.2, 1, ['food:甘い小さな実'], '岩場に這う低木の実。'],
  ['cave_lichen', '洞窟の白苔', ['cave', 'mine'], 0.05, 0.1, 0, ['feed:洞窟の家畜の餌', 'medicine:湿布'], '光のない洞窟に生える白い苔。'],
  ['volcanic_fern', '火山羊歯', ['volcano'], 0.2, 1, 0, ['fuel:すぐに燃え上がる', 'medicine:温める湿布'], '溶岩の間に最初に生える羊歯。'],
  ['ruin_ivy', '廃墟の蔦', ['ruins', 'pyramid'], 0.2, 0.5, 0, ['craft:古い石を探す目印', 'magic:古い魔力を吸う'], '遺跡の石を覆う古い蔦。'],
  ['pyramid_papyrus', '紙草', ['river', 'desert'], 1, 0.5, 0, ['craft:茎を叩いて紙・舟・かご・縄'], '砂漠の大河に茂る背の高い草。古い王国の紙の元。'],
  ['bracken_frond', '羊歯の葉', ['forest', 'hill'], 0.5, 0.02, 0, ['feed:家畜の寝床', 'craft:屋根葺き・荷の包み'], '森を覆う羊歯の大きな葉。'],
  ['nettle_leaves', '蕁麻の若葉', ['forest', 'grass'], 0.1, 0.05, 2, ['food:汁（春の力）', 'fertilize:水に浸けて肥やし汁'], '蕁麻の柔らかい若葉。'],
  ['wild_grass', '野草', ['grass', 'field', 'hill'], 1, 0.01, 0, ['feed:家畜の青草', 'fertilize'], '野原に生えるふつうの草。'],
];
for (const [id, n, on, w, v, food, uses, desc] of TER) { const o = { d: 1, src: [S('gather', on, 0.6)], use: u(uses), desc }; if (food) { o.food = food; o.keep = 5; } X(id, n, 'wild', w, v, o); }
// ── 畑と暮らしの加工品 ──
X('hay', '干し草', 'fodder', 5, 0.3, { d: 3, make: M({ fodder_grass: 3 }, 'farmer', 48), src: [S('harvest', ['farm', 'field'], 1)], use: [U('feed', '冬の牛馬羊の餌'), U('craft', '寝床・詰め物')], desc: '夏に刈って干した牧草。冬を越す家畜の命。' });
X('fodder_grass', '牧草', 'fodder', 3, 0.1, { d: 2, src: [S('harvest', ['farm', 'field'], 1), S('gather', ['grass', 'savanna'], 0.8)], keep: 3, use: [U('feed', '家畜の青草'), U('craft', '干して干し草')], desc: '牧場に育てる草。' });
X('fodder_seed', '牧草の種', 'seed', 0.05, 0.2, { src: [S('harvest', ['farm', 'field'], 0.3), S('trade')], use: [U('craft', '牧場に蒔く（畑に植える）')], desc: '牧草と白詰草を混ぜた種。' });
X('compost', '堆肥', 'fertilizer', 5, 0.2, { d: 2, make: M({ straw: 2, fallen_leaves: 2 }, 'farmer', 720), use: [U('fertilize', '畑を肥やして実りを増やす')], desc: '藁と落ち葉と家畜の糞を積んで一月寝かせたもの。' });
X('green_manure', '緑肥', 'fertilizer', 3, 0.05, { make: M({ vetch: 3 }, 'farmer', 24), use: [U('fertilize', '畑に鋤き込む')], desc: '豆や草を青いうちに刈って畑に鋤き込むもの。' });
X('silage', '漬け草', 'fodder', 5, 0.3, { make: M({ fodder_grass: 3, maize: 1 }, 'farmer', 480), keep: 180, use: [U('feed', '冬の牛の餌（乳がよく出る）')], desc: '青草を穴に詰めて漬けた餌。' });
X('rice_seedling', '稲の苗', 'sapling', 0.5, 0.3, { make: M({ rice_paddy: 1 }, 'farmer', 720), use: [U('craft', '水田に植える（畑に植える）')], desc: '苗代で育てた稲の苗。' });
X('seed_potato', '種芋', 'seed', 0.3, 0.6, { make: M({ potato: 1 }, 'farmer', 1), use: [U('craft', '畑に植える：芽の付いた芋を切って植える')], desc: '植えるために取っておく芋。' });
X('seed_wheat', '種麦', 'seed', 1, 2.5, { d: 2, make: M({ wheat: 1 }, 'farmer', 1), use: [U('craft', '畑に植える：一番よい麦を選り分けた種')], desc: '食べずに残す種麦。飢えても種麦は食べるなと言う。' });
X('honey', 'はちみつ', 'sweet', 0.5, 5, { d: 2, src: [S('harvest', ['farm'], 1), S('gather', ['forest', 'dense'], 0.1)], food: 8, keep: 3650, use: [U('food', '甘味・菓子'), U('craft', '蜂蜜酒'), U('medicine', '傷と喉の薬')], desc: '花の蜜から蜂が作る甘い蜜。養蜂家の巣箱か森の野蜂の巣から採る。腐らない。' });
X('flower_honey_heather', '荒野の花の蜜', 'sweet', 0.5, 8, { r: 1, d: 1, src: [S('gather', ['hill', 'mountain', 'tundra'], 0.1)], food: 8, keep: 3650, use: [U('luxury', '濃い香りの蜜'), U('craft', '上等な蜂蜜酒')], desc: '荒野草の花からだけ採れる濃い色の蜜。' });
X('nectar', '花の蜜', 'sweet', 0.05, 0.3, { src: [S('gather', ['grass', 'field', 'forest'], 0.2)], food: 1, keep: 2, use: [U('food', '子どもが吸う甘い蜜'), U('craft', '錬金術の甘味')], desc: '花の奥の甘い滴。' });
X('pollen', '花粉', 'sweet', 0.02, 1, { src: [S('gather', ['field', 'grass'], 0.2)], use: [U('medicine', '滋養'), U('magic', '妖精の粉の代わり')], desc: '花から集めた黄色い粉。' });
X('herbal_tea_mix', '薬草茶の葉', 'drinkleaf', 0.1, 1.5, { make: M({ chamomile: 1, mint: 1, linden_flower: 1 }, 'herbalist', 1), keep: 365, use: [U('drink', '眠る前・病人の茶'), U('medicine')], desc: '干した香草を混ぜた茶葉。' });
X('dried_herbs', '干し香草', 'herb', 0.05, 1, { make: M({ thyme: 1, rosemary: 1, laurel: 1 }, 'cook', 48), keep: 700, use: [U('food', '冬の煮込みの香り')], desc: '台所の梁に吊るして干した香草の束。' });
X('smudge_bundle', '清めの香草束', 'herb', 0.1, 1, { make: M({ sage: 2, juniper_berry: 1 }, 'herbalist', 1), use: [U('ritual', '燻して家と病室を清める')], desc: '束ねた香草。燻すと病の気が去るという。' });
X('incense_stick', '線香', 'incense', 0.05, 0.5, { d: 1, make: M({ cedar_leaves: 2, }, 'herbalist', 2) , use: [U('ritual', '祈りと供養'), U('luxury', '香り')], desc: '杉の葉の粉を練って細く固めた香。' });
X('thatch_bundle', '屋根葺きの束', 'straw', 5, 0.5, { d: 2, make: M({ thatch_grass: 3 }, 'farmer', 2), use: [U('build', '茅葺き・藁葺き屋根')], desc: '茅や藁を束ねたもの。屋根一つに何百束も要る。' });
X('straw_rope', '藁縄', 'straw', 0.5, 0.3, { d: 2, make: M({ straw: 3 }, 'farmer', 1), use: [U('craft', '縛る・俵・垣根を結う'), U('tool', '安い縄')], desc: '冬の夜なべに藁でなった縄。' });
X('straw_mat', 'むしろ', 'straw', 3, 0.6, { d: 1, make: M({ rice_straw: 4 }, 'farmer', 4), use: [U('craft', '敷物・穀物を干す・包み'), U('build', '小屋の仕切り')], desc: '藁を編んだ敷物。' });
X('tinder', '火口', 'fuel', 0.02, 0.2, { d: 2, make: M({ tinder_fungus: 1 }, 'charcoal', 2), use: [U('fuel', '火打ち石の火を受けて火を起こす'), U('tool', '旅の必需品')], desc: '茸や布を焦がして作る火種。' });
X('torch_pine', '松明の芯木', 'fuel', 1, 0.2, { make: M({ pine_log: 1 }, 'woodcutter', 1, 10), use: [U('fuel', '松明（脂が多く明るく燃える）'), U('tool', '夜道と洞窟の灯り')], desc: '脂の多い松の芯を割った木。' });
// 魔法・宝の担当から頼まれた物
X('soapnut', '無患子', 'nut', 0.01, 0.3, { d: 1, src: [S('gather', ['forest', 'hill', 'town'], 0.5)], use: [U('craft', '皮を水で揉むと泡立つ：洗濯・髪洗い（石鹸の代わり）'), U('ritual', '黒い種は数珠・羽根突きの玉')], desc: '子が患わないと書く木の実。皮が泡立つ。' });
X('sleepcap', '眠り茸', 'mushroom', 0.1, 3, { r: 1, src: [S('gather', ['forest', 'dense', 'cave'], 0.2)], fx: { sleep: 50 }, keep: 10, use: [U('medicine', '眠り薬・手術の眠り'), U('craft', '眠り矢')], desc: '胞子を吸うと眠くなる灰色の茸。' });
X('madcap', '狂い茸', 'mushroom', 0.1, 4, { r: 1, src: [S('gather', ['dense', 'swamp', 'ruins'], 0.1)], fx: { confuse: 60, atk: 5 }, keep: 10, use: [U('magic', '狂戦士の薬（痛みを忘れて暴れる）'), U('craft', '混乱の毒')], desc: '食べると怒り狂う赤黒い茸。北の狂戦士が戦の前に食べた。' });
X('bark', '樹皮', 'bark', 1, 0.1, { d: 1, src: [S('chop', ['forest', 'dense', 'hill', 'jungle'], 0.8)], use: [U('craft', '屋根・かご・なめしの渋'), U('fuel', '焚きつけ'), U('fertilize', '畑の敷き物')], desc: '雑木から剥いだ樹皮。' });
X('nut', '木の実', 'nut', 0.05, 0.1, { d: 1, src: [S('gather', ['forest', 'dense', 'hill'], 0.6)], food: 2, keep: 120, use: [U('food', '炒って食べる'), U('feed', '豚とリスの餌'), U('craft', '植えれば木に育つ（苗床に植える）')], desc: '森で拾った団栗や榛などの混ざった木の実。' });
