import { P, S, U, M } from './core.mjs';
const F = 1; // plant.js
// 木材になる木：[id, 名, 生える所, rare, 値打ち倍率, 重さ倍率, 材の使い道, 説明, demand]
const TREES = [
  ['oak', '樫', ['forest', 'dense'], 0, 1.6, 1.3, '硬く水に強い：船の竜骨・樽・梁・荷車の車輪', '森の王と呼ばれる堅い木。どんぐりが実る。', 2],
  ['konara', '楢', ['forest', 'hill'], 0, 1.3, 1.2, '硬い：床板・酒樽・家具', '里山に多い木。酒樽にすると酒に良い香りが移る。', 2],
  ['pine', '松', ['forest', 'mountain', 'hill', 'beach'], 0, 1.0, 0.9, 'まっすぐで脂が多い：梁・足場・松明', 'どこにでも生える針葉樹。脂が多くよく燃える。', 3],
  ['cedar', '杉', ['forest', 'mountain'], 0, 1.2, 0.7, 'まっすぐで軽い：柱・天井板・桶・舟', 'まっすぐ高く伸びる木。香りがよく、家の柱に好まれる。', 2],
  ['birch', '樺', ['forest', 'snow', 'tundra'], 0, 0.9, 1.0, '白くきめ細かい：糸巻き・匙・靴の木型', '白い幹の木。寒い土地に多い。樹皮は火口になる。', 1],
  ['willow', '柳', ['river', 'swamp', 'lake'], 0, 0.6, 0.7, '軽く裂けにくい：盾の芯・義足・かご枠', '水辺の木。若い枝はしなやかでかご編みに欠かせない。', 1],
  ['maple', '楓', ['forest', 'hill'], 0, 1.4, 1.1, '硬く響きがよい：竪琴・床・木鉢', '秋に赤く色づく木。春の樹液は煮詰めると甘い蜜になる。', 1],
  ['ebony', '黒檀', ['jungle'], 2, 14, 1.5, '真っ黒で重く硬い：王侯の家具・楽器の指板・駒', '南の密林の奥に生える黒い木。水に沈むほど重い。', 1],
  ['beech', '橅', ['forest', 'dense'], 0, 1.1, 1.2, '粘りがある：椅子・食器・道具の柄', '深い森を作る木。保水が良く、森の下に水場ができる。', 2],
  ['ash', '梣', ['forest', 'river'], 0, 1.4, 1.1, '粘り強くしなる：槍の柄・斧の柄・弓・櫂', '粘りのある木。武器の柄はこれに限ると兵士は言う。', 2],
  ['yew', '一位', ['dense', 'mountain'], 1, 3.5, 1.1, 'よくしなる：長弓・細工物', 'ゆっくり育つ常緑の木。葉と種は毒。長弓の材として名高い。', 1],
  ['elm', '楡', ['forest', 'river'], 0, 1.1, 1.1, '水の中で腐らない：水道管・井戸枠・棺・車輪の甲', '川辺の大木。水に浸けておくと何百年も持つ。', 1],
  ['chestnut', '栗', ['forest', 'hill'], 0, 1.2, 1.1, '腐りにくい：柵の杭・土台・線路の枕木', '実のなる木。材は雨ざらしでも腐りにくい。', 2],
  ['walnut', '胡桃', ['forest', 'river'], 0, 3.0, 1.1, '美しい木目：上等な家具・銃床のような飾り彫り・箱', '実のなる木。木目が美しく家具職人に好まれる。', 1],
  ['cherry', '山桜', ['forest', 'hill'], 0, 2.0, 1.0, '赤みのある材：家具・版木・煙管', '春に花が咲く木。樹皮は細工物に、薪は燻製に使う。', 1],
  ['hinoki', '檜', ['mountain', 'forest'], 1, 3.0, 0.8, '香りよく腐らない：神殿・王宮の柱・湯船', '山の奥の香り高い木。神殿を建てるならこれ。', 1],
  ['fir', '樅', ['snow', 'mountain'], 0, 0.9, 0.7, 'まっすぐ：帆柱・箱・板', '雪国の常緑樹。冬至の祭りに飾る。', 1],
  ['larch', '落葉松', ['mountain', 'snow', 'tundra'], 0, 1.1, 1.0, '脂が多く水に強い：杭・橋・屋根板', '冬に葉を落とす針葉樹。脂が多く水に強い。', 1],
  ['spruce', '唐檜', ['snow', 'mountain'], 0, 1.3, 0.7, '軽くよく響く：竪琴や弦楽器の表板・帆柱・櫂', '北の森の木。軽くて音がよく響く。', 1],
  ['alder', '榛の木', ['river', 'swamp'], 0, 0.8, 0.9, '水中で腐らない：杭・水車の羽根・木靴', '湿地に生える木。切り口が赤く染まる。', 1],
  ['poplar', '白楊', ['river', 'grass'], 0, 0.6, 0.6, '軽く柔らかい：箱・盾の芯・荷車の底板', '育つのが速い木。軽く燃えにくい。', 1],
  ['linden', '菩提樹', ['forest', 'town'], 0, 1.2, 0.8, '柔らかく彫りやすい：彫像・聖像・人形', '町の広場に植えられる木。花は香り高いお茶になる。', 1],
  ['camphor', '楠', ['forest', 'jungle'], 1, 2.5, 0.9, '香りで虫がつかない：衣装箱・船・仏像', '大きく育つ常緑の木。材から樟脳が取れる。', 1],
  ['sandalwood', '白檀', ['jungle', 'savanna'], 2, 18, 1.0, '甘い香り：扇・香木・数珠', '香りの王と呼ばれる木。削りくずまで香る。', 1],
  ['ironwood', '鉄木', ['jungle'], 2, 8, 1.8, '鉄のように硬い：水車の軸受け・杵・棍棒', '斧の刃がこぼれるほど硬い木。水に沈む。', 1],
  ['mahogany', '紅木', ['jungle'], 1, 6, 1.1, '赤い美しい材：王侯の机・船室の内装', '南の国から運ばれる赤い木。富の証とされる。', 1],
  ['rosewood', '紫檀', ['jungle'], 2, 12, 1.4, '紫がかった重い材：楽器・箱・飾り棚', '紫がかった硬い木。削るとほのかに甘く香る。', 1],
  ['mangrove', '紅樹', ['swamp', 'beach'], 0, 0.9, 1.2, '塩水に強い：桟橋の杭・舟', '海と川の境に根を張る木。樹皮は渋が強い。', 1],
  ['acacia', '棘合歓', ['savanna', 'desert'], 0, 1.2, 1.2, '硬い：杭・柄・炭', '棘のある乾いた地の木。樹脂はゴムのように粘る。', 1],
  ['paulownia', '桐', ['grass', 'hill'], 0, 2.2, 0.4, '軽く燃えにくく湿気を通さない：箪笥・琴・下駄', '娘が生まれたら植える木。嫁入り箪笥になる。', 1],
  ['zelkova', '欅', ['forest', 'town'], 0, 2.2, 1.2, '硬く木目が美しい：寺院の柱・盆・臼', '大きく枝を広げる木。臼や盆はこれで作る。', 1],
  ['cypress', '糸杉', ['hill', 'grass', 'desert'], 0, 1.8, 0.9, '腐らず香る：棺・扉・墓地の柱', '天を指すように細く伸びる木。墓地に植えられる。', 1],
  ['juniper', '杜松', ['hill', 'mountain', 'snow'], 0, 1.2, 0.9, '香る：小箱・鉛筆のような筆軸・杖', '低い針葉樹。実は香りづけと清めに使う。', 1],
  ['boxwood', '黄楊', ['hill', 'forest'], 1, 5, 1.3, 'きめが細かい：櫛・駒・印章・版木', '育つのが遅くきめの細かい木。櫛の材として最上。', 1],
  ['holly', '柊', ['forest'], 0, 1.5, 1.1, '白い材：象嵌・駒・杖', '棘のある葉の木。魔除けとして門に飾る。', 1],
  ['rowan', '七竈', ['mountain', 'forest'], 0, 1.3, 1.1, '燃えにくい：杖・護符・紡錘', '七度竈に入れても燃え残ると言われる木。魔女除けになる。', 1],
  ['olive', '橄欖', ['hill', 'grass'], 0, 2.5, 1.2, '黄色い硬い材：匙・器・まな板', '乾いた丘の実のなる木。何百年も実をつける。', 1],
  ['apple', '林檎', ['farm', 'hill'], 0, 1.3, 1.1, '硬い：木槌・歯車・彫り物', '果樹。古くなった木は切られて燻製の薪になる。', 1],
  ['pear', '梨', ['farm', 'hill'], 0, 1.5, 1.1, 'きめ細かい：物差し・版木・楽器', '果樹。材はきめ細かく狂いが少ない。', 1],
  ['lacquer', '漆', ['forest', 'hill'], 1, 1.5, 0.9, '黄色い材：小箱', '傷つけると出る樹液が漆になる木。触るとかぶれる。', 1],
  ['sumac', '櫨', ['hill', 'forest'], 0, 1.0, 0.9, '黄色い材：寄木・弓', '秋に真っ赤に色づく木。実から蝋が取れる。', 1],
];
const byName = {};
for (const [id, n, on, rare, m, dens, lumberNote, desc, d] of TREES) {
  byName[id] = n;
  const wild = !['apple', 'pear'].includes(id);
  const chop = S('chop', on, rare >= 2 ? 0.2 : rare ? 0.5 : 1);
  P(`${id}_log`, `${n}の丸太`, 'wood', 45 * dens, 2 * m, { st: 1, r: rare, d: rare ? 1 : 2, src: [chop], use: [U('craft', '材木・板に挽く'), U('build', '丸太小屋・柵の柱'), U('fuel', '割れば薪になる')], desc: `${desc}切り倒したままの丸太。重いので運ぶには荷車か縄が要る。`, file: F });
  P(`${id}_lumber`, `${n}材`, 'wood', 12 * dens, 2 * m, { st: 5, r: rare, d: rare ? 1 : 2, make: M({ [`${id}_log`]: 1 }, 'carpenter', 2, 2), use: [U('build', '梁・柱・壁'), U('craft', lumberNote)].concat(m >= 5 ? [U('luxury', '王侯の家具'), U('trade', '遠くの国でも高く売れる')] : []), desc: `${n}の丸太を角に挽いた材木。${lumberNote.split('：')[0]}。`, file: F });
  P(`${id}_plank`, `${n}の板`, 'wood', 3 * dens, 0.6 * m, { st: 20, r: rare, d: rare ? 1 : 2, make: M({ [`${id}_lumber`]: 1 }, 'carpenter', 1, 4), use: [U('build', '床・壁・屋根板'), U('craft', '箱・棚・家具・扉')], desc: `${n}材を薄く挽いた板。1本の材木から4枚取れる。`, file: F });
  P(`${id}_firewood`, `${n}の薪`, 'fuel', 5 * dens, 0.25 * Math.min(m, 3) * (dens > 1 ? 1.3 : 1), { st: 20, r: 0, d: 2, src: [S('chop', on, 0.3)], make: M({ [`${id}_log`]: 1 }, 'woodcutter', 1, 8), use: [U('fuel', dens >= 1.1 ? '火持ちがよい' : '火付きがよい')].concat(['apple', 'cherry', 'konara', 'alder', 'pear'].includes(id) ? [U('food', '燻製の煙に使うと肉や魚に良い香りが付く')] : []), desc: `割った${n}の薪。${dens >= 1.1 ? '重く、長く燃える。' : '軽く、すぐ燃え上がる。'}`, file: F });
  P(`${id}_sapling`, `${n}の苗木`, 'sapling', 2, 1 * Math.min(m, 6), { st: 10, r: rare, d: 1, src: wild ? [S('gather', on, 0.2)] : [S('trade')], make: wild ? undefined : M({ [`${id}_branch`]: 1 }, 'gardener', 2), use: [U('craft', '畑や林に植える：植えれば何年かで木に育つ（植林）')].concat(['olive', 'apple', 'pear', 'walnut', 'chestnut'].includes(id) ? [U('craft', '果樹園に植える')] : []), desc: wild ? `${n}の若木。切った分だけ植えれば林は絶えない。` : `${n}の若木。枝を接ぎ木して増やす。`, file: F });
}
// 木ごとの特別な部位
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: F, ...o });
X('apple_branch', '林檎の若枝', 'branch', 0.3, 0.3, { src: [S('gather', ['farm'], 0.3)], use: [U('craft', '接ぎ木して林檎の苗木を増やす'), U('fuel', '燻製の香りづけ')], desc: '剪定で落とした林檎の枝。' });
X('pear_branch', '梨の若枝', 'branch', 0.3, 0.3, { src: [S('gather', ['farm'], 0.3)], use: [U('craft', '接ぎ木して梨の苗木を増やす'), U('fuel')], desc: '剪定で落とした梨の枝。' });
X('oak_bark', '樫の樹皮', 'bark', 2, 0.6, { d: 2, src: [S('chop', ['forest', 'dense'], 0.5)], use: [U('craft', '革なめしの渋（皮を革にする）'), U('dye', '黒・茶色の染め')], desc: '渋を多く含む樹皮。なめし屋が買い集める。' });
X('oak_charcoal', '樫の炭', 'charcoal', 2, 1.2, { d: 2, make: M({ oak_log: 1 }, 'charcoal', 24, 6), use: [U('fuel', '火力が強く長持ち：鍛冶・鋳物'), U('luxury', '貴族の火鉢')], desc: '樫を焼いた硬い炭。叩くと金属のような音がする。' });
X('konara_charcoal', '楢炭', 'charcoal', 2, 0.9, { d: 2, make: M({ konara_log: 1 }, 'charcoal', 24, 6), use: [U('fuel', '料理・暖房・鍛冶')], desc: '火付きと火持ちのつり合いがよい炭。' });
X('konara_sawdust', '楢のおがくず', 'sawdust', 1, 0.1, { make: M({ konara_lumber: 1 }, 'carpenter', 1), use: [U('fuel', '燻製の煙（肉・魚・乳酪）'), U('craft', 'きのこの床（楢の菌床）')], desc: '楢を挽いたときの粉。燻製とキノコ作りに使う。' });
X('pine_resin', '松脂', 'resin', 0.5, 0.8, { d: 2, src: [S('gather', ['forest', 'mountain', 'hill'], 0.4)], use: [U('craft', '船の継ぎ目・樽の目止め・弓の弦の滑り止め'), U('fuel', '松明・火口'), U('medicine', '膏薬の練り込み')], desc: '松の幹に傷をつけて集めた脂。' });
X('pine_tar', '松の黒脂', 'resin', 2, 1.5, { d: 1, make: M({ pine_log: 1 }, 'charcoal', 12, 3), use: [U('craft', '船底・綱・屋根の防腐'), U('medicine', '家畜の傷薬')], desc: '松の根や幹を蒸し焼きにして取る黒い粘る脂。船乗りには欠かせない。' });
X('turpentine', '松精油', 'resin', 0.5, 2, { make: M({ pine_resin: 2 }, 'alchemist', 3), use: [U('craft', '絵の具・ニスを薄める'), U('medicine', '塗り薬')], desc: '松脂を蒸して取った強い香りの油。' });
X('pine_needles', '松葉', 'leaf', 0.5, 0.05, { d: 0, src: [S('gather', ['forest', 'mountain', 'hill', 'beach'], 0.8)], use: [U('fuel', '焚きつけ'), U('fertilize', '畑の敷き草'), U('drink', '松葉茶（冬の青物の代わり）')], desc: '落ちた松の葉。よく燃え、畑の敷き草にもなる。' });
X('pine_cone', '松かさ', 'seed', 0.1, 0.05, { d: 0, src: [S('gather', ['forest', 'mountain', 'hill', 'beach'], 0.6)], use: [U('fuel', '火付けに最適'), U('hobby', '子どもの遊び・飾り')], desc: '松ぼっくり。乾いたものはよく燃える。' });
X('cedar_bark', '杉皮', 'bark', 3, 0.5, { src: [S('chop', ['forest', 'mountain'], 0.5)], use: [U('build', '屋根葺き・壁の張り板')], desc: '杉の幹から剥いだ皮。屋根を葺くのに使う。' });
X('cedar_leaves', '杉の葉', 'leaf', 0.5, 0.1, { src: [S('gather', ['forest', 'mountain'], 0.6)], use: [U('ritual', '線香の原料'), U('fuel', '焚きつけ')], desc: '枯れた杉の葉。粉にすると線香になる。' });
X('birch_bark', '樺の皮', 'bark', 0.5, 0.4, { d: 2, src: [S('chop', ['forest', 'snow', 'tundra'], 0.6)], use: [U('fuel', '湿っていても燃える最良の火口'), U('craft', '器・かご・舟の皮張り'), U('hobby', '字を書く紙の代わり')], desc: '白く薄く剥がれる樹皮。雨の日の火起こしに持ち歩く。' });
X('birch_sap', '樺の樹液', 'sap', 1, 0.5, { src: [S('gather', ['forest', 'snow'], 0.3)], drink: 12, keep: 3, use: [U('drink', '春先の甘い水'), U('craft', '醸せば樺の酒')], desc: '春先に幹に穴を開けて取るほのかに甘い水。' });
X('birch_twigs', '樺の小枝', 'branch', 1, 0.1, { src: [S('gather', ['forest', 'snow'], 0.6)], use: [U('craft', '箒・蒸し風呂のたたき束')], desc: 'しなやかな細枝。束ねて箒にする。' });
X('willow_withy', '柳の枝', 'fiber', 1, 0.3, { d: 2, src: [S('gather', ['river', 'swamp', 'lake'], 0.8)], use: [U('craft', 'かご・魚籠・行李・柵・魚のわな'), U('build', '編み垣（土を塗って壁）')], desc: 'その年に伸びたしなやかな柳の枝。かご編みの材料。根ごと切らなければ毎年刈れる。' });
X('willow_bark', '柳の樹皮', 'bark', 0.3, 0.8, { d: 2, src: [S('gather', ['river', 'swamp', 'lake'], 0.4)], fx: { pain: -10 }, use: [U('medicine', '煎じると熱と痛みを下げる')], desc: '苦い樹皮。煎じ汁は頭痛と熱に効く。' });
X('willow_charcoal', '柳炭', 'charcoal', 0.2, 0.6, { make: M({ willow_withy: 2 }, 'charcoal', 6, 5), use: [U('hobby', '絵描きの下書き用の炭筆'), U('craft', '火薬のような燃え草の材料')], desc: '細い柳の枝を焼いた柔らかい炭。画家が使う。' });
X('maple_sap', '楓の樹液', 'sap', 1, 0.6, { src: [S('gather', ['forest', 'hill'], 0.3)], drink: 10, keep: 4, use: [U('craft', '煮詰めて楓蜜にする'), U('drink')], desc: '春に楓の幹から取る甘い汁。' });
X('maple_syrup', '楓蜜', 'sap', 0.5, 4, { d: 1, make: M({ maple_sap: 20 }, 'cook', 6), food: 6, use: [U('food', '菓子・パンにかける'), U('luxury', '甘味')], desc: '樹液を40分の1まで煮詰めた琥珀色の蜜。' });
X('maple_leaves', '紅葉した楓の葉', 'leaf', 0.05, 0.2, { src: [S('gather', ['forest', 'hill'], 0.5)], use: [U('collect', '押し葉・飾り'), U('food', '衣を付けて揚げ菓子に')], desc: '秋に真っ赤に色づいた葉。' });
X('ebony_offcut', '黒檀の端材', 'wood', 0.3, 3, { r: 1, make: M({ ebony_lumber: 1 }, 'carpenter', 1, 6), use: [U('craft', '駒・柄・象嵌・ボタン'), U('luxury')], desc: '黒檀を挽いた残りの小片。小物に高く売れる。' });
X('beechnut', '橅の実', 'nut', 0.02, 0.05, { src: [S('gather', ['forest', 'dense'], 0.5)], food: 2, keep: 60, use: [U('feed', '豚の餌'), U('food', '炒って食べる'), U('craft', '搾れば油')], desc: '三角の小さな実。豚を森に放して太らせる。' });
X('beech_charcoal', '橅炭', 'charcoal', 2, 0.8, { make: M({ beech_log: 1 }, 'charcoal', 24, 6), use: [U('fuel', '料理と暖房')], desc: '火付きのよいふつうの炭。' });
X('yew_stave', '一位の弓材', 'wood', 1.5, 6, { r: 1, d: 1, make: M({ yew_log: 1 }, 'carpenter', 4, 2), use: [U('craft', '長弓：芯材と辺材が一本でばねになる')], desc: '赤い芯と白い辺材をあわせて割り出した弓の素材。' });
X('yew_needles', '一位の葉', 'leaf', 0.2, 0.3, { src: [S('gather', ['dense', 'mountain'], 0.5)], fx: { poison: 20 }, use: [U('ritual', '墓地に植える木の葉：死者の守り'), U('craft', '毒矢の毒')], desc: '毒のある常緑の葉。家畜が食べると死ぬので牧場に入れない。' });
X('elm_bast', '楡の内皮', 'fiber', 0.5, 0.3, { src: [S('chop', ['forest', 'river'], 0.5)], use: [U('craft', '縄・椅子の座面'), U('food', '飢饉のときの粉の足し')], desc: '楡の皮の内側の繊維。丈夫な縄になる。' });
X('chestnut_post', '栗の杭', 'wood', 6, 1.5, { d: 2, make: M({ chestnut_log: 1 }, 'carpenter', 1, 4), use: [U('build', '柵・土台・畑の境の杭：土に埋めても腐らない')], desc: '割った栗の杭。開拓の柵に何百本も要る。' });
X('walnut_husk', '胡桃の青皮', 'dye', 0.3, 0.1, { src: [S('gather', ['forest', 'river'], 0.5)], use: [U('dye', '焦げ茶の染め・髪染め・木材の着色')], desc: '胡桃の実を包む緑の皮。手が黒く染まる。' });
X('cherry_bark', '桜の皮', 'bark', 0.3, 0.8, { src: [S('chop', ['forest', 'hill'], 0.4)], use: [U('craft', '茶筒・印籠などの皮細工'), U('medicine', '咳止め')], desc: '光沢のある桜の樹皮。' });
X('cherry_blossom', '桜の花', 'flower', 0.01, 0.2, { src: [S('gather', ['forest', 'hill', 'town'], 0.4)], keep: 2, use: [U('food', '塩漬けで祝いのお茶'), U('ritual', '春の祭り'), U('gift')], desc: '春に一斉に咲く淡い花。' });
X('hinoki_bark', '檜皮', 'bark', 2, 1.5, { r: 1, src: [S('chop', ['mountain', 'forest'], 0.4)], use: [U('build', '神殿の屋根を葺く最上の材')], desc: '檜から剥いだ皮。神殿の屋根はこれで葺く。' });
X('hinoki_shavings', '檜のかんなくず', 'sawdust', 0.3, 0.3, { make: M({ hinoki_lumber: 1 }, 'carpenter', 1), use: [U('luxury', '湯に浮かべて香りを楽しむ'), U('ritual', '香'), U('craft', '枕の詰め物')], desc: '薄く削れた檜のくず。部屋中が香る。' });
X('fir_resin', '樅脂', 'resin', 0.3, 0.8, { src: [S('gather', ['snow', 'mountain'], 0.3)], use: [U('craft', '絵画の仕上げ・ガラスの接着'), U('medicine', '傷の膏薬')], desc: '樅の樹皮の膨らみに溜まる透き通った脂。' });
X('fir_bough', '樅の枝', 'branch', 1, 0.2, { src: [S('chop', ['snow', 'mountain'], 0.5)], use: [U('ritual', '冬至祭の飾り・花輪'), U('craft', '寝床の敷物')], desc: '冬でも緑の枝。祭りの飾りにする。' });
X('spruce_tonewood', '唐檜の響板', 'wood', 1, 6, { r: 1, make: M({ spruce_lumber: 1 }, 'carpenter', 6, 2), use: [U('craft', '竪琴・弦楽器の表板'), U('hobby', '楽器作り')], desc: '年輪の細かい唐檜を何年も乾かした板。楽器の音を決める。' });
X('alder_bark', '榛の木の皮', 'bark', 0.5, 0.3, { src: [S('chop', ['river', 'swamp'], 0.5)], use: [U('dye', '黒・茶色の染め'), U('craft', 'なめし')], desc: '切ると赤く変わる皮。' });
X('linden_bast', '菩提樹の靭皮', 'fiber', 0.5, 0.4, { src: [S('chop', ['forest', 'town'], 0.5)], use: [U('craft', '縄・むしろ・靴（樹皮靴）')], desc: '菩提樹の皮の内側の繊維。水に浸して剥ぐ。' });
X('linden_flower', '菩提樹の花', 'flower', 0.05, 0.4, { src: [S('gather', ['forest', 'town'], 0.4)], fx: { calm: 5 }, use: [U('drink', '眠る前の花茶'), U('medicine', '風邪の汗出し')], desc: '初夏に咲く甘く香る花。蜂がよく集まる。' });
X('camphor_crystal', '樟脳', 'resin', 0.1, 4, { r: 1, make: M({ camphor_lumber: 1 }, 'alchemist', 6), use: [U('craft', '衣類の虫除け'), U('medicine', '塗り薬・気付け'), U('trade')], desc: '楠の木片を蒸して取る白い結晶。鼻にツンと来る。' });
X('sandalwood_chips', '白檀の香木片', 'incense', 0.1, 6, { r: 2, make: M({ sandalwood_lumber: 1 }, 'carpenter', 2, 8), use: [U('ritual', '神殿の香'), U('luxury', '香り袋'), U('trade')], desc: '削った白檀のかけら。焚くと甘い煙が立つ。' });
X('mangrove_bark', '紅樹の皮', 'bark', 1, 0.5, { src: [S('chop', ['swamp', 'beach'], 0.5)], use: [U('craft', '網や帆を渋で染めて腐らせない・革なめし'), U('dye', '赤茶')], desc: '渋の多い赤い皮。漁師の網を染める。' });
X('acacia_gum', '棘合歓のゴム', 'resin', 0.2, 1.5, { src: [S('gather', ['savanna', 'desert'], 0.3)], use: [U('craft', 'インクと絵の具の糊・菓子の固め')], desc: '幹から出て固まった透明な樹脂。水に溶ける。' });
X('paulownia_flower', '桐の花', 'flower', 0.02, 0.2, { src: [S('gather', ['grass', 'hill'], 0.4)], use: [U('collect', '紋章の意匠'), U('gift')], desc: '初夏の紫の花。高貴な家の紋に使われる。' });
X('zelkova_burl', '欅の瘤', 'wood', 8, 12, { r: 2, src: [S('chop', ['forest', 'town'], 0.05)], use: [U('craft', '飾り盆・高級な器'), U('collect'), U('luxury')], desc: '幹にできた瘤。渦巻く木目が珍重される。' });
X('cypress_cone', '糸杉の実', 'seed', 0.05, 0.2, { src: [S('gather', ['hill', 'grass'], 0.4)], use: [U('medicine', '血止めの煎じ薬'), U('ritual', '喪の飾り')], desc: '丸い小さな実。喪に服す家に飾る。' });
X('juniper_berry', '杜松の実', 'spice', 0.01, 0.3, { d: 1, src: [S('gather', ['hill', 'mountain', 'snow'], 0.5)], use: [U('craft', '杜松酒の香りづけ'), U('food', '獣肉の臭み消し'), U('ritual', '焚いて病室を清める')], desc: '青黒い小さな実。松に似た香り。' });
X('holly_sprig', '柊の枝', 'branch', 0.2, 0.2, { src: [S('gather', ['forest'], 0.5)], use: [U('ritual', '門に飾る魔除け・冬至の飾り')], desc: '赤い実と棘のある葉のついた枝。' });
X('rowan_berry', '七竈の実', 'fruit', 0.01, 0.1, { src: [S('gather', ['mountain', 'forest'], 0.5)], use: [U('craft', 'ジャムや酒（霜に当てると苦みが抜ける）'), U('ritual', '赤い糸に通して魔除けの首飾り')], desc: '房なりの赤い実。鳥が好む。' });
X('lacquer_sap', '生漆', 'sap', 0.5, 6, { r: 1, d: 1, src: [S('gather', ['forest', 'hill'], 0.1)], fx: { rash: 10 }, use: [U('craft', '器・鞘・鎧を塗る漆塗り'), U('luxury')], desc: '漆の幹を傷つけて一滴ずつ集める樹液。一本の木から一夏で茶碗一杯。' });
X('sumac_berries', '櫨の実', 'seed', 0.01, 0.1, { src: [S('gather', ['hill', 'forest'], 0.5)], use: [U('craft', '搾って木蝋を取る')], desc: '房なりの小さな実。蝋を含む。' });
X('vegetable_wax', '木蝋', 'wax', 0.3, 2, { d: 2, make: M({ sumac_berries: 10 }, 'miller', 3), use: [U('craft', '蝋燭・髪油・艶出し'), U('fuel', '灯り')], desc: '櫨の実から搾った蝋。煙の少ない蝋燭になる。' });
X('olive_leaves', '橄欖の葉', 'leaf', 0.05, 0.1, { src: [S('gather', ['hill', 'grass'], 0.5)], use: [U('ritual', '平和の冠'), U('medicine', '熱冷ましの茶')], desc: '銀色がかった細い葉。和睦のしるし。' });
// 雑木・一般の木の物
X('wood', '材木', 'wood', 10, 2, { d: 3, src: [S('chop', ['forest', 'dense', 'jungle', 'hill'], 1)], make: M({ log: 1 }, 'carpenter', 2, 2), use: [U('build', '家・柵・橋'), U('craft', '家具・道具の柄・武器の柄'), U('fuel')], desc: 'いろいろな木を混ぜて挽いたふつうの材木。どの町でも毎日要る。' });
X('log', '雑木の丸太', 'wood', 40, 1.5, { st: 1, d: 2, src: [S('chop', ['forest', 'dense', 'jungle', 'hill', 'grass'], 1)], use: [U('craft', '材木に挽く'), U('build', '丸太小屋・柵'), U('fuel', '割れば薪')], desc: '開拓で切り倒した雑木の丸太。' });
X('firewood', '薪', 'fuel', 5, 0.3, { d: 3, src: [S('chop', ['forest', 'dense', 'hill', 'grass'], 1)], make: M({ log: 1 }, 'woodcutter', 1, 8), use: [U('fuel', '煮炊き・暖房・パン窯')], desc: 'どの家でも毎日燃やす薪。冬は倍要る。' });
X('kindling', '焚きつけの小枝', 'fuel', 1, 0.05, { d: 2, src: [S('gather', ['forest', 'dense', 'hill', 'grass', 'jungle', 'savanna'], 1)], use: [U('fuel', '火を起こす'), U('craft', '柴垣・鳥の巣箱')], desc: '森に落ちている細い枯れ枝。子どもの仕事で集める。' });
X('branch', '木の枝', 'branch', 1.5, 0.1, { d: 1, src: [S('chop', ['forest', 'dense', 'jungle', 'hill'], 1)], use: [U('craft', '杖・柵・棚・鳥もちの竿'), U('fuel')], desc: '伐採で払った太めの枝。' });
X('charcoal', '木炭', 'charcoal', 2, 0.8, { d: 3, make: M({ log: 1 }, 'charcoal', 24, 6), use: [U('fuel', '鍛冶・鋳物・煮炊き・火鉢：煙が少なく火力が強い'), U('craft', '製鉄に欠かせない'), U('medicine', '粉にして毒消し')], desc: '雑木を炭焼き窯で焼いた炭。鍛冶屋が大量に使う。' });
X('sawdust', 'おがくず', 'sawdust', 1, 0.02, { d: 1, make: M({ wood: 1 }, 'carpenter', 1), use: [U('craft', '家畜小屋の敷き物・床の掃除・氷室の断熱'), U('fertilize', '堆肥に混ぜる'), U('fuel')], desc: '材木を挽くと出るくず。捨てずに敷き物にする。' });
X('wood_chips', '木っ端', 'fuel', 2, 0.05, { make: M({ log: 1 }, 'carpenter', 1, 4), use: [U('fuel', '焚きつけ'), U('craft', '道の泥よけ敷き')], desc: '斧で削った木のかけら。' });
X('fallen_leaves', '落ち葉', 'leaf', 1, 0.01, { d: 1, lim: 'none', src: [S('gather', ['forest', 'dense', 'hill', 'town'], 1)], use: [U('fertilize', '積んで腐葉土・堆肥に'), U('feed', '家畜の寝床'), U('fuel', '焚き火')], desc: '秋の森に積もる落ち葉。畑を肥やす。' });
X('wood_ash', '草木灰', 'ash', 1, 0.1, { d: 2, make: M({ firewood: 2 }, 'charcoal', 1), src: [S('gather', ['town'], 0.5)], use: [U('fertilize', '畑にまく'), U('craft', '灰汁を取って石鹸・洗濯・焼き物の釉'), U('craft', 'ガラスの原料')], desc: 'かまどに溜まる灰。捨てずに灰買いが集めに来る。' });
X('lye', '灰汁', 'ash', 1, 0.3, { make: M({ wood_ash: 2 }, 'laundress', 1), use: [U('craft', '石鹸を煮る・布の漂白・山菜のあく抜き・麻を柔らかくする')], desc: '灰に水を通して取った上澄み。' });
X('burl', '木の瘤', 'wood', 4, 3, { r: 1, src: [S('chop', ['forest', 'dense'], 0.05)], use: [U('craft', '器・杯・飾り'), U('collect')], desc: 'ときどき木の幹にできる瘤。うねった木目の器になる。' });
X('driftwood', '流木', 'wood', 5, 0.3, { lim: 'none', src: [S('gather', ['beach', 'river', 'lake'], 0.5)], use: [U('fuel', '塩気で色のついた炎'), U('hobby', '飾り・置物')], desc: '水に洗われて白くなった木。浜辺で拾える。' });
X('dead_wood', '倒木', 'wood', 30, 0.5, { st: 1, src: [S('gather', ['forest', 'dense', 'jungle'], 0.3)], use: [U('fuel', '割れば薪'), U('craft', 'キノコの原木')], desc: '森の中で倒れて乾いた木。切らずに拾える。' });
X('rotten_wood', '朽ち木', 'wood', 3, 0.02, { lim: 'none', src: [S('gather', ['forest', 'dense', 'swamp'], 0.5)], use: [U('fertilize', '腐葉土'), U('feed', '甲虫の幼虫を飼う'), U('craft', '光るキノコの床')], desc: 'ぼろぼろに腐った木。虫とキノコの家。' });
export const TREE_NAMES = byName;
