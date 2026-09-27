import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 3, ...o });
const u = (arr) => arr.map((s) => { const i = s.indexOf(':'); return i < 0 ? U(s) : U(s.slice(0, i), s.slice(i + 1)); });
// 毒草：[id, 名, 部位, 場所, 値, fx, uses, 説明, rare]
const POI = [
  ['hemlock', '毒人参', '根と葉', ['river', 'grass'], 1.5, { poison: 60 }, ['craft:毒杯（罪人の刑）', 'medicine:ごく少量で痛み止め'], '人参に似た白い花の草。賢者を死なせた毒。', 0],
  ['aconite', '鳥兜', '根', ['mountain', 'forest'], 3, { poison: 80 }, ['craft:狩りの毒矢・狼殺し', 'medicine:ほんの一滴で冷えと痛みの薬'], '兜の形の青紫の花。根は猛毒。', 1],
  ['foxglove', '狐の手袋', '葉', ['forest', 'hill'], 1, { poison: 40, heart: 20 }, ['medicine:弱った心の臓の薬（量を誤ると死ぬ）', 'collect:庭の花'], '釣り鐘の花が並ぶ草。医者と毒殺者の両方が使う。', 0],
  ['water_hemlock', '毒芹', '根', ['swamp', 'river'], 0.8, { poison: 70 }, ['craft:毒'], '芹に似ているが、食べれば痙攣して死ぬ。', 0],
  ['henbane', '莨菪', '種と葉', ['field', 'town'], 1.5, { poison: 30, sleep: 30 }, ['medicine:眠り薬・歯痛', 'magic:魔女の飛び薬'], '臭い草。昔は麦酒に入れて酔いを強めた。', 0],
  ['datura', '曼陀羅華', '種と花', ['field', 'desert', 'town'], 2, { poison: 30, sleep: 40 }, ['medicine:手術の麻酔', 'magic:幻を見る儀式'], '大きな白いラッパの花。幻と眠りをもたらす。', 1],
  ['belladonna', '毒茄子', '実', ['forest', 'ruins'], 2, { poison: 50 }, ['luxury:貴婦人が瞳を大きく見せる目薬', 'craft:毒', 'medicine:胃の痙攣止め'], '黒く艶のある甘い実。美しい女という名の毒草。', 1],
  ['oleander', '夾竹桃', '葉', ['town', 'beach', 'hill'], 0.5, { poison: 50 }, ['craft:毒（枝を串にしただけで死ぬ）', 'collect:庭木'], '夏に紅い花が咲く木。燃やした煙も毒。', 0],
  ['asebi', '馬酔木', '葉', ['hill', 'forest'], 0.3, { poison: 20 }, ['craft:煮汁で家畜の虫と畑の虫を殺す'], '馬が食べると酔ったようになる木の葉。', 0],
  ['shikimi', '樒', '枝と実', ['mountain', 'forest'], 0.5, { poison: 50 }, ['ritual:墓と祭壇に供える', 'craft:粉にして抹香'], '香りのよい枝。実は猛毒で、八角と間違えると死ぬ。', 0],
  ['poppy_latex', '芥子の乳', '乳液', ['field'], 6, { sleep: 50, pain: -40 }, ['medicine:強い痛み止めと眠り薬', 'luxury:溺れると身を滅ぼす煙'], '未熟な罌粟坊主を傷つけて取る白い乳。王の許しなく作ってはならない。', 1],
  ['fishbane', '魚毒草', '根', ['river', 'jungle'], 0.3, { poison: 10 }, ['tool:川に流して魚を痺れさせて捕る'], '搗いて川に流すと魚が浮いてくる根。', 0],
  ['wolfsbane_lichen', '狼殺しの地衣', '地衣', ['forest', 'mountain', 'snow'], 1, { poison: 40 }, ['craft:肉に混ぜて狼の毒餌'], '黄色い地衣。狼退治に使う。', 0],
  ['numbweed', '痺れ草', '葉', ['forest', 'swamp'], 1.2, { numb: 30 }, ['craft:痺れ薬・痺れ矢', 'medicine:傷を縫う前の麻痺薬'], '噛むと舌が痺れる草。狩人が矢に塗る。', 0],
  ['sleepgrass', '眠り草', '葉', ['grass', 'forest'], 1, { sleep: 40 }, ['medicine:眠り薬', 'craft:眠りの香（泥棒も使う）'], '触ると葉を閉じる草。煎じて飲むと朝まで眠る。', 0],
  ['laughing_weed', '笑い草', '花', ['grass', 'field'], 0.8, { mood: 20, confuse: 20 }, ['luxury:宴の悪ふざけ', 'craft:混乱の薬'], '嗅ぐと笑いが止まらなくなる黄色い花。', 0],
  ['black_lotus', '黒蓮', '花', ['swamp'], 60, { poison: 100, mp: 50 }, ['magic:強大な呪いの触媒', 'craft:暗殺の毒'], '毒の沼にまれに咲く漆黒の蓮。触れただけで痺れる。', 3],
  ['rot_vine', '腐れ蔓', '蔓', ['swamp', 'demoncastle'], 1, { poison: 20, sick: 20 }, ['magic:病の呪い', 'craft:害獣の毒餌'], '触れた草木を腐らせる紫の蔓。', 1],
  ['mock_strawberry', '蛇苺', '実', ['grass', 'field'], 0.05, {}, ['medicine:潰して虫刺されの塗り薬', 'hobby:子どもの遊び'], '毒と言われるが味がないだけの赤い実。', 0],
];
for (const [id, n, part, on, v, fx, uses, desc, rare] of POI) X(id, n, 'poison', 0.05, v, { r: rare, d: rare >= 3 ? 0 : 1, src: [S(rare >= 2 ? 'forage' : 'gather', on, rare >= 2 ? 0.03 : 0.4)], fx, keep: 60, use: u(uses), desc: `${desc}（使うのは${part}）` });
X('poison_extract', '毒草の煎じ汁', 'poison', 0.2, 6, { make: M({ aconite: 2, hemlock: 1 }, 'alchemist', 4), fx: { poison: 90 }, keep: 60, use: u(['craft:毒矢・毒の刃（狩りと魔物退治）', 'quest:魔物の巣の駆除']), desc: '鳥兜と毒人参を煮詰めた黒い汁。狩人組合だけが扱える。' });
X('numbing_salve', '痺れ草の膏', 'medicine', 0.1, 4, { make: M({ numbweed: 3, pine_resin: 1 }, 'herbalist', 2), fx: { pain: -30 }, keep: 180, use: u(['medicine:傷を縫うときに塗る・歯痛']), desc: '痺れ草を松脂で練った塗り薬。' });
// 魔法の草：部位ごとに効き目がちがう
// [id, 名, 場所, rare, 部位リスト[[suffix, 部位名, 値, fx, uses, 説明]], 全体の説明]
const MAG = [
  ['moonlight', '月光草', ['grass', 'hill', 'dense'], 2, [
    ['flower', '花', 18, { mp: 25 }, ['magic:魔力回復薬の主材料', 'luxury:月夜の飾り'], '満月の夜にだけ開き、青白く光る花。'],
    ['leaf', '葉', 5, { mp: 8 }, ['magic:魔力の茶', 'medicine:夜目が利く'], '昼は閉じている銀色の葉。'],
    ['seed', '種', 12, null, ['craft:月の見える畑に植える：植えれば月光草が育つ（畑に植える）', 'trade'], '夜にほのかに光る種。']]],
  ['dragonblood', '竜血草', ['volcano', 'mountain', 'rock'], 2, [
    ['leaf', '葉', 15, { atk: 5, hp: 10 }, ['medicine:戦の前の力の薬', 'magic:火の魔法の触媒'], '竜の血が落ちた地に生えるという赤い葉。'],
    ['root', '根', 30, { hp: 30, stamina: 30 }, ['medicine:瀕死の戦士を立ち上がらせる', 'trade'], '血のように赤い汁を出す根。'],
    ['seed', '種', 20, null, ['craft:熱い岩場に植える（畑に植える）'], '触ると熱い種。']]],
  ['stargazer', '星見草', ['mountain', 'hill', 'snow'], 2, [
    ['flower', '花', 14, { mind: 20 }, ['magic:星読み・占い', 'ritual:暦の祭り'], '星の位置に合わせて花の向きを変える草。'],
    ['dew', '朝露', 20, { mp: 15, mind: 10 }, ['magic:未来視の目薬'], '星見草の花に宿る夜明けの露。']]],
  ['managrass', '魔素草', ['dense', 'cave', 'ruins'], 1, [
    ['leaf', '葉', 4, { mp: 10 }, ['magic:魔力回復薬・魔石の研磨液', 'feed:魔獣の餌'], '魔力の濃い地に生える青い草。'],
    ['root', '根', 8, { mp: 15 }, ['magic:錬金の触媒'], '魔石のかけらを抱いた根。'],
    ['seed', '種', 6, null, ['craft:魔力のある土に植える（畑に植える）'], '青い種。']]],
  ['spiritflower', '精霊花', ['dense', 'lake'], 3, [
    ['flower', '花', 40, { mp: 30, calm: 20 }, ['magic:精霊を呼ぶ儀式', 'gift:最上の贈り物'], '精霊が宿る七色の花。'],
    ['pollen', '花粉', 25, { mp: 10 }, ['magic:妖精の粉（体が軽くなる）'], '光る金色の花粉。']]],
  ['saintlily', '聖者の百合', ['town', 'hill', 'ruins'], 2, [
    ['flower', '花', 20, { cure: 'curse' }, ['ritual:聖水の材料・葬礼', 'magic:呪いを解く'], '聖者の墓に咲いたという純白の百合。不死の魔物が近寄らない。'],
    ['bulb', '球根', 15, null, ['craft:神殿の庭に植える（畑に植える）'], '清らかな地でしか育たない球根。']]],
  ['deathflower', '死人花', ['grass', 'field', 'ruins'], 1, [
    ['flower', '花', 3, { poison: 20 }, ['ritual:死者の供養・墓地の境', 'magic:死霊術'], '墓地に咲く真っ赤な花。花と葉は決して会わない。'],
    ['bulb', '球根', 2, { poison: 40 }, ['craft:田の畦に植えてネズミ除け（畑に植える）', 'food:晒せば飢饉の糧'], '毒のある球根。']]],
  ['nightsinger', '夜鳴き草', ['forest', 'dense'], 2, [
    ['flower', '花', 12, { calm: 15, sleep: 10 }, ['hobby:夜に歌う花を飼う', 'magic:子守りの呪文'], '夜風に揺れると歌うような音を立てる花。']]],
  ['whispergrass', '風囁き草', ['hill', 'mountain', 'grass'], 2, [
    ['leaf', '葉', 10, null, ['magic:遠くの声を聞く・伝言の魔法'], '風に乗った遠くの声を運ぶという草。'],
    ['seed', '綿毛', 8, null, ['magic:風の魔法の触媒', 'craft:風の強い丘に蒔く（畑に植える）'], '何日も空を飛ぶ綿毛の種。']]],
  ['flamegrass', '火炎草', ['volcano', 'desert'], 1, [
    ['leaf', '葉', 5, { warm: 20 }, ['magic:火の魔法の触媒', 'fuel:湿っていても燃える'], '葉先が小さく燃えている草。'],
    ['ash', '灰', 8, null, ['magic:炎の魔法陣を描く粉', 'craft:消えない松明'], '燃え尽きても熱を持つ灰。']]],
  ['icecrystal', '氷晶花', ['snow', 'tundra', 'mountain'], 2, [
    ['flower', '花', 15, { cool: 20, hp: 5 }, ['magic:氷の魔法の触媒', 'medicine:熱冷まし・火傷'], '花びらが氷でできた花。溶けない。'],
    ['seed', '種', 10, null, ['craft:雪原に植える（畑に植える）'], '冷たい透明な種。']]],
  ['thundergrass', '雷鳴草', ['hill', 'mountain', 'savanna'], 2, [
    ['leaf', '葉', 12, { speed: 10 }, ['magic:雷の魔法の触媒', 'medicine:痺れた体を動かす'], '雷の落ちた地に生える、触るとぱちっとする草。']]],
  ['shadowgrass', '影草', ['cave', 'dense', 'ruins'], 2, [
    ['leaf', '葉', 12, { hide: 20 }, ['magic:姿を隠す薬', 'craft:盗賊の外套の染め'], '光を吸って黒い草。持つ者の影が薄くなる。']]],
  ['dreamgrass', '夢見草', ['grass', 'forest'], 1, [
    ['flower', '花', 6, { sleep: 20, mood: 10 }, ['luxury:枕に入れてよい夢', 'magic:夢占い'], '眠った人の枕元で香る淡い花。']]],
  ['forgetgrass', '忘却草', ['swamp', 'river'], 2, [
    ['leaf', '葉', 15, { mind: -20, calm: 30 }, ['medicine:辛い記憶を和らげる', 'magic:記憶を消す薬'], '忘れ川のほとりに生えるという草。']]],
  ['lovegrass', '惚れ草', ['field', 'grass'], 2, [
    ['flower', '花', 20, { charm: 20 }, ['luxury:惚れ薬の材料', 'gift:恋のお守り'], 'この花を贈られると心が揺れるという桃色の花。']]],
  ['silverleaf', '銀葉草', ['mountain', 'hill'], 1, [
    ['leaf', '葉', 6, { hp: 12 }, ['medicine:上等な回復薬の材料', 'magic:銀の武器の手入れ'], '葉の表が銀色に光る薬草。']]],
  ['goldthread', '金糸草', ['forest', 'mountain'], 2, [
    ['root', '根', 18, { hp: 15, cure: 'sick' }, ['medicine:疫病の薬', 'craft:金色の刺繍糸の染め'], '金の糸のような細い根。']]],
  ['bloodvine', '血吸い蔓', ['jungle', 'demoncastle', 'dense'], 2, [
    ['vine', '蔓', 10, { poison: 20 }, ['magic:生命を奪う呪い', 'craft:獣を捕らえる罠'], '獣に絡みついて血を吸う蔓。']]],
  ['singingflower', '歌う花', ['dense', 'jungle'], 3, [
    ['flower', '花', 35, { mood: 30 }, ['hobby:王侯が庭で聴く', 'collect', 'gift'], '朝になると澄んだ声で歌う花。']]],
  ['devilclaw', '悪魔の爪草', ['desert', 'demoncastle', 'savanna'], 1, [
    ['root', '根', 5, { pain: -15 }, ['medicine:関節の痛み', 'magic:悪魔祓いの逆の儀式'], '鉤爪のような実をつける草の根。']]],
  ['resurrection_fern', '蘇り羊歯', ['rock', 'desert', 'cave'], 2, [
    ['frond', '葉', 25, { hp: 40 }, ['medicine:死にかけた者を持ちこたえさせる', 'magic:蘇りの儀式の材料'], '枯れて丸まっても水をかけると蘇る羊歯。']]],
  ['phoenixflower', '不死鳥花', ['volcano'], 3, [
    ['flower', '花', 80, { revive: 1 }, ['medicine:死者を一度だけ呼び戻す', 'quest:王の依頼'], '燃え尽きては灰から咲き直す紅蓮の花。'],
    ['ash', '灰', 50, { hp: 100 }, ['medicine:不死鳥の霊薬の材料', 'magic'], '不死鳥花の灰。']]],
  ['mandrake', '恋茄子', ['dense', 'ruins', 'field'], 2, [
    ['root', '根', 30, { sleep: 30, mp: 20 }, ['magic:錬金術の最高の材料', 'medicine:麻酔'], '人の形をした根。引き抜くと叫び、聞いた者は気を失う。'],
    ['leaf', '葉', 5, { sleep: 10 }, ['medicine:痛み止めの湿布'], '大きなしわのある葉。']]],
  ['witchgrass', '魔女の三つ葉', ['swamp', 'forest'], 1, [
    ['leaf', '葉', 4, { mp: 5 }, ['magic:見習いの魔法薬', 'ritual:魔女の集会'], '三枚の葉が互い違いに光る草。']]],
];
for (const [id, n, on, rare, parts] of MAG) for (const [suf, pn, v, fx, uses, desc] of parts) {
  const o = { r: rare, d: rare >= 3 ? 0 : 1, src: [S(rare >= 2 ? 'forage' : 'gather', on, rare >= 3 ? 0.01 : rare >= 2 ? 0.05 : 0.2)], use: u(uses), keep: suf === 'seed' || suf === 'bulb' || suf === 'ash' ? undefined : 30, desc };
  if (fx) o.fx = fx;
  if (uses.some((s) => s.includes('植える'))) o.src.push(S('harvest', ['farm'], 0.3));
  X(`${id}_${suf}`, `${n}の${pn}`, 'magicherb', 0.02, v, o);
}
X('glowmoss', '光苔', 'magicherb', 0.05, 3, { r: 1, src: [S('gather', ['cave', 'dungeon', 'mine'], 0.4)], use: u(['tool:瓶に入れて洞窟の灯り', 'magic:光の魔法の触媒']), desc: '洞窟の壁で緑に光る苔。' });
X('sage_moss', '賢者の苔', 'magicherb', 0.05, 25, { r: 3, src: [S('gather', ['ruins', 'cave'], 0.02)], fx: { mind: 30 }, use: u(['magic:知恵の薬・魔導書の研究', 'medicine:物忘れ']), desc: '古い図書館の石に生える苔。知恵を授けるという。' });
X('mermaid_weed', '人魚藻', 'magicherb', 0.1, 20, { r: 2, src: [S('fish', ['deep', 'sea'], 0.03)], fx: { breath: 60 }, use: u(['magic:水中で息ができる薬', 'luxury:人魚の髪飾り']), desc: '深い海で揺れる翠色の藻。人魚の髪と言われる。' });
X('demon_rose', '魔界の薔薇', 'magicherb', 0.05, 30, { r: 2, src: [S('forage', ['demoncastle'], 0.05)], fx: { mp: 20, poison: 10 }, use: u(['magic:闇の魔法の触媒', 'luxury:魔族の貴婦人の飾り', 'collect']), desc: '魔界に咲く黒い薔薇。棘が血を吸う。' });
X('miasma_grass', '瘴気草', 'magicherb', 0.05, 4, { r: 1, src: [S('gather', ['demoncastle', 'swamp'], 0.3)], fx: { poison: 15 }, use: u(['magic:瘴気を吸うので魔界の開拓で植えて浄化する', 'craft:毒']), desc: '瘴気を吸って育つ灰色の草。枯れると瘴気が消える。' });
X('holy_basil', '聖目箒', 'magicherb', 0.02, 3, { r: 1, src: [S('harvest', ['farm'], 1), S('gather', ['town', 'hill'], 0.2)], fx: { cure: 'curse' }, use: u(['ritual:神殿の供え物', 'medicine:軽い呪いを払う茶', 'craft:神殿の庭に植える（畑に植える）']), desc: '神殿の庭で育てる聖なる香草。' });
X('four_leaf_clover', '四つ葉の白詰草', 'collect', 0.001, 5, { r: 2, src: [S('forage', ['grass', 'field'], 0.01)], use: u(['collect:幸運のお守り', 'gift:恋人や旅立つ者に贈る']), desc: '千に一つの四つ葉。持つと幸運が訪れるという。' });
