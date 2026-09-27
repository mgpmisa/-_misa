import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 1, ...o });
const BAM = ['forest', 'hill', 'jungle'];
// 竹
X('bamboo_culm', '竹', 'wood', 8, 1, { d: 2, src: [S('chop', BAM, 1)], use: [U('build', '垣根・足場・屋根の垂木'), U('craft', '水筒・柄杓・笛・釣り竿・物干し竿'), U('craft', '割って竹ひご')], desc: '切り出した青竹。三年で使える太さになり、切っても地下の根から生えてくる。' });
X('bamboo_strip', '竹ひご', 'fiber', 0.3, 0.2, { make: M({ bamboo_culm: 1 }, 'carpenter', 1, 10), use: [U('craft', 'かご・ざる・扇・傘の骨・凧')], desc: '竹を細く割って削った材。' });
X('bamboo_sheath', '竹の皮', 'bark', 0.05, 0.05, { src: [S('gather', BAM, 0.6)], use: [U('craft', 'おにぎりや肉を包む・草履の表')], desc: '筍が育つときに落とす皮。水をはじき食べ物を包める。' });
X('bamboo_leaves', '笹の葉', 'leaf', 0.05, 0.05, { src: [S('gather', BAM, 0.8)], use: [U('food', '団子や魚を包む（腐りにくい）'), U('ritual', '七夕の笹飾り'), U('feed', '馬の餌')], desc: '香りのよい細長い葉。' });
X('bamboo_shoot', '筍', 'veg', 1, 0.8, { d: 2, src: [S('forage', BAM, 0.5)], food: 10, keep: 2, use: [U('food', '茹でて煮物・炊き込み飯')], desc: '春に土から顔を出す竹の子。一晩で伸びるので朝掘る。' });
X('bamboo_charcoal', '竹炭', 'charcoal', 1, 0.8, { make: M({ bamboo_culm: 2 }, 'charcoal', 12, 4), use: [U('fuel'), U('craft', '水の濾過・床下の湿気取り')], desc: '竹を焼いた穴だらけの軽い炭。臭いと湿気を吸う。' });
X('bamboo_rhizome', '竹の根株', 'sapling', 3, 1, { src: [S('dig', BAM, 0.3)], use: [U('craft', '林や畑の端に植える：根が広がり竹林になる')], desc: '竹林を増やすための地下茎。' });
// ヤシ
const PALM = ['beach', 'jungle', 'savanna'];
X('palm_trunk', 'ヤシの幹', 'wood', 40, 2, { st: 1, src: [S('chop', PALM, 0.8)], use: [U('build', '南の国の柱・桟橋・丸木舟')], desc: '繊維質のまっすぐな幹。' });
X('palm_frond', 'ヤシの葉', 'leaf', 2, 0.1, { d: 2, src: [S('gather', PALM, 0.8)], use: [U('build', '南国の屋根葺き'), U('craft', '敷物・団扇・かご'), U('ritual', '祝いの飾り')], desc: '大きな羽根のような葉。雨を通さない屋根になる。' });
X('coir', 'ヤシ殻の繊維', 'fiber', 0.5, 0.3, { make: M({ coconut: 2 }, 'weaver', 2), use: [U('craft', '塩水に強い船の綱・たわし・敷物')], desc: 'ヤシの実の殻から取る硬い繊維。' });
X('palm_sap', 'ヤシの樹液', 'sap', 1, 0.4, { src: [S('gather', PALM, 0.3)], drink: 12, keep: 1, use: [U('drink', '甘い汁'), U('craft', '発酵させてヤシ酒・煮詰めてヤシ糖')], desc: '花の茎を切って滴を集めた甘い汁。すぐ酸っぱくなる。' });
X('palm_sapling', 'ヤシの苗', 'sapling', 3, 1, { src: [S('gather', PALM, 0.2)], use: [U('craft', '浜や南の畑に植える：植えれば実のなるヤシに育つ')], desc: '芽を出したヤシの実。' });
X('date_palm_sapling', '棗椰子の苗', 'sapling', 3, 2, { src: [S('gather', ['desert'], 0.2)], use: [U('craft', 'オアシスに植える：植えれば棗椰子に育つ')], desc: '砂漠のオアシスを広げる苗。' });
// 樹脂の木
X('frankincense', '乳香', 'resin', 0.1, 8, { r: 2, d: 1, src: [S('gather', ['desert', 'rock'], 0.15), S('trade')], use: [U('ritual', '神殿で焚く最高の香'), U('medicine', '傷と口の病'), U('trade')], desc: '砂漠の乳香樹から滴る白い樹脂。神々への捧げ物。' });
X('myrrh', '没薬', 'resin', 0.1, 9, { r: 2, d: 1, src: [S('gather', ['desert', 'savanna'], 0.15), S('trade')], use: [U('ritual', '葬礼と遺体の防腐'), U('medicine', '傷の消毒'), U('luxury', '香油')], desc: '棘の多い低木の赤い樹脂。苦い香り。ミイラ作りに使われた。' });
X('agarwood', '沈香', 'incense', 0.2, 40, { r: 3, d: 1, src: [S('forage', ['jungle'], 0.03), S('trade')], use: [U('ritual', '王の香'), U('luxury', '香を聞く遊び'), U('collect')], desc: '傷ついた木が何十年もかけて樹脂を溜めた香木。水に沈む。' });
X('dragon_blood_resin', '竜血', 'resin', 0.1, 12, { r: 2, d: 1, src: [S('gather', ['desert', 'rock'], 0.1), S('trade')], use: [U('dye', '深紅の顔料・ニス'), U('magic', '魔法陣を描く赤い墨'), U('medicine', '止血')], desc: '竜血樹の幹から出る真っ赤な樹脂。竜の血と言われる。' });
X('dragon_tree_sapling', '竜血樹の苗', 'sapling', 3, 10, { r: 2, src: [S('forage', ['desert', 'rock'], 0.05)], use: [U('craft', '乾いた岩場に植える：何百年もかかって竜血樹になる')], desc: '傘のような形に育つ木の苗。' });
X('kapok_floss', '木綿の木の綿毛', 'fiber', 0.1, 0.8, { src: [S('gather', ['jungle', 'savanna'], 0.4)], use: [U('craft', '枕・布団・鞍の詰め物・救命の浮き'), U('fuel', '火口')], desc: '大木の実から出る軽い綿毛。水に浮く。' });
X('cork', '栓皮', 'bark', 1, 1.2, { d: 1, src: [S('chop', ['hill', 'forest'], 0.2)], use: [U('craft', '瓶と樽の栓・網の浮き・靴底'), U('build', '寒さを防ぐ壁張り')], desc: '栓皮樫の厚い樹皮。9年ごとに剥いでも木は枯れない。' });
X('baobab_bark', '壺の木の樹皮', 'fiber', 2, 0.3, { src: [S('chop', ['savanna'], 0.4)], use: [U('craft', '縄・網・かご')], desc: '太い幹の巨木の皮。剥いでもまた生えてくる。' });
X('baobab_fruit', '壺の木の実', 'fruit', 1, 0.8, { src: [S('gather', ['savanna'], 0.4)], food: 8, keep: 60, use: [U('food', '酸っぱい粉を水に溶いて飲む'), U('craft', '殻は器に')], desc: '猿のパンと呼ばれる大きな実。乾いた果肉は粉のよう。' });
X('ginkgo_nut', '銀杏', 'nut', 0.01, 0.1, { src: [S('gather', ['town', 'forest'], 0.5)], food: 1, keep: 60, use: [U('food', '炒って酒の肴に（食べすぎると毒）'), U('medicine', '咳止め')], desc: '臭い実の中の種。炒ると翡翠色になる。' });
// 魔法の木
X('world_tree_branch', '世界樹の枝', 'magicwood', 2, 400, { r: 4, st: 1, d: 1, src: [S('loot', ['ruins', 'dungeon'], 0.01)], use: [U('craft', '伝説の杖・弓の材'), U('magic', '魔力が尽きない杖になる'), U('collect')], desc: '世界の中心に立つと言われる樹の枝。折れても枯れずに脈打っている。' });
X('world_tree_leaf', '世界樹の葉', 'magicherb', 0.01, 300, { r: 4, st: 5, d: 2, src: [S('loot', ['ruins', 'dungeon', 'demoncastle'], 0.01)], fx: { revive: 1 }, use: [U('medicine', '死にかけた者を蘇らせる'), U('quest', '王の依頼の品')], desc: '一枚で瀕死の者を呼び戻すという葉。' });
X('world_tree_dew', '世界樹の雫', 'magicsap', 0.1, 350, { r: 4, st: 5, src: [S('loot', ['ruins', 'dungeon'], 0.005)], fx: { hp: 999, mp: 999 }, drink: 5, use: [U('medicine', '傷も魔力もすべて癒す'), U('magic', '霊薬の核')], desc: '葉先から落ちる光る水滴。' });
X('world_tree_bark', '世界樹の樹皮', 'magicwood', 0.5, 250, { r: 4, st: 5, src: [S('loot', ['ruins', 'dungeon'], 0.008)], use: [U('craft', '伝説の盾・鎧の裏張り'), U('magic', '呪いを弾く護符')], desc: '触れると温かい樹皮のかけら。' });
X('world_tree_seed', '世界樹の種', 'magicseed', 0.2, 2000, { r: 4, st: 1, src: [S('loot', ['ruins'], 0.001)], use: [U('craft', '植える：千年かけて新しい世界樹が育つと言われる'), U('collect', '国宝'), U('quest')], desc: '伝説の種。国ひとつと引き換えにしてもよいという王もいる。' });
X('spirit_wood', '精霊樹の材', 'magicwood', 6, 60, { r: 2, d: 1, src: [S('chop', ['dense'], 0.05)], use: [U('craft', '魔法の杖・弓・楽器'), U('magic', '精霊の力を通す')], desc: '精霊が宿る古木の材。切るには森の許しが要るという。' });
X('spirit_twig', '精霊樹の小枝', 'magicwood', 0.2, 20, { r: 2, src: [S('gather', ['dense'], 0.05)], use: [U('craft', '小さな杖（見習い魔法使いの杖）'), U('magic')], desc: '精霊樹から自然に落ちた小枝。淡く光る。' });
X('spirit_leaf', '精霊樹の葉', 'magicherb', 0.02, 10, { r: 2, src: [S('gather', ['dense'], 0.08)], fx: { mp: 15 }, use: [U('magic', '魔力を戻す薬の材料'), U('medicine')], desc: '葉脈が光る葉。' });
X('silvermoon_branch', '銀月樹の枝', 'magicwood', 1, 45, { r: 3, src: [S('chop', ['dense', 'snow'], 0.03)], use: [U('craft', '夜に光る杖・破魔の矢'), U('magic', '不死者に強い')], desc: '月夜に銀色に輝く木の枝。不死の魔物が嫌う。' });
X('silvermoon_leaf', '銀月樹の葉', 'magicherb', 0.02, 12, { r: 3, src: [S('gather', ['dense', 'snow'], 0.05)], use: [U('magic', '聖水を作る材料'), U('ritual', '葬いの清め')], desc: '裏が銀色の葉。夜に淡く光る。' });
X('flametree_log', '炎樹の丸太', 'magicwood', 30, 40, { st: 1, r: 2, src: [S('chop', ['volcano'], 0.1)], use: [U('fuel', '何日も燃え続ける'), U('craft', '炎の杖・炉の芯')], desc: '溶岩のそばで育つ赤い木。切り口がいつまでも熱い。' });
X('eternal_charcoal', '永炎炭', 'charcoal', 2, 30, { r: 2, d: 1, make: M({ flametree_log: 1 }, 'charcoal', 48, 5), use: [U('fuel', '一つで七日燃える：鍛冶の名工が使う'), U('magic', '火の魔石の代わり')], desc: '炎樹を焼いた炭。消えずにくすぶり続ける。' });
X('flametree_leaf', '炎樹の葉', 'magicherb', 0.05, 5, { r: 2, src: [S('gather', ['volcano'], 0.2)], fx: { warm: 20 }, use: [U('medicine', '寒さしのぎの煎じ薬'), U('magic', '火の魔法の触媒')], desc: '手に持つと温かい葉。' });
X('icetree_sap', '氷樹の樹液', 'magicsap', 0.5, 25, { r: 2, src: [S('gather', ['snow', 'tundra'], 0.08)], use: [U('craft', '凍らない油（冬の車軸・弓弦）'), U('magic', '氷の魔法の触媒')], desc: '真冬でも凍らない透明な樹液。' });
X('icetree_lumber', '氷樹材', 'magicwood', 8, 35, { r: 2, src: [S('chop', ['snow', 'tundra'], 0.05)], use: [U('craft', '食べ物を冷やす箱・氷の杖'), U('build', '氷室')], desc: '触ると冷たい白い材。夏でも霜がつく。' });
X('bonewood', '骨木', 'magicwood', 6, 15, { r: 2, src: [S('chop', ['demoncastle'], 0.2)], use: [U('craft', '死霊術の杖・呪いの人形'), U('magic', '闇の触媒'), U('fuel', '青い炎で燃える')], desc: '魔界の荒野に生える骨のように白く節くれた木。' });
X('demonwood', '魔樹の材', 'magicwood', 10, 25, { r: 2, src: [S('chop', ['demoncastle', 'dense'], 0.1)], use: [U('craft', '呪われた武器の柄・魔族の家具'), U('magic', '魔力を吸う')], desc: '魔力を吸って黒く捻れた木。切ると呻き声のような音がする。' });
X('demonwood_sap', '魔樹の黒い樹液', 'magicsap', 0.3, 18, { r: 2, src: [S('gather', ['demoncastle'], 0.1)], fx: { poison: 30 }, use: [U('magic', '呪いの薬・毒'), U('craft', '黒い漆')], desc: '血のように粘る黒い樹液。' });
