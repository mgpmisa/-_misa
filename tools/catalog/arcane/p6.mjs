import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);

// ================= 貝殻（拾う） =================
const SH = [
  ['seashell_common', '巻き貝の殻', 0.5, 0, ['beach'], 0.5, '浜にいくらでも落ちている巻き貝。子どもが集める。'],
  ['seashell_cowrie', '宝貝', 2, 0, ['beach'], 0.3, 'つやつやの小さな貝。南の島ではお金の代わりにもなる。'],
  ['seashell_scallop', '帆立の殻', 1, 0, ['beach', 'sea'], 0.3, '扇の形の殻。巡礼のしるしにもなる。'],
  ['seashell_turban', '夜光貝', 8, 1, ['beach', 'sea'], 0.08, '内側が虹色に光る大きな貝。細工に使う。'],
  ['seashell_sakura', '桜貝', 3, 1, ['beach'], 0.1, '薄紅色の薄い貝。恋のお守りにする娘もいる。'],
  ['seashell_nautilus', '鸚鵡貝', 25, 2, ['deep', 'sea'], 0.02, '中が渦を巻く部屋に分かれた美しい殻。学者が好む。'],
  ['seashell_pearl', '真珠貝の殻', 4, 0, ['sea'], 0.2, '真珠採りが開けた貝の殻。内側は真珠色。'],
  ['seashell_murex', '骨貝', 2, 0, ['beach', 'sea'], 0.2, 'とげとげの巻き貝。紫の染料が取れる。'],
  ['seashell_conch', '大巻き貝', 6, 1, ['sea', 'beach'], 0.05, '法螺貝や遠声の貝になる大きな巻き貝。'],
  ['star_sand', '星の砂', 3, 1, ['beach'], 0.05, '星の形をした小さな砂粒。小瓶に詰めて土産にする。'],
  ['sea_urchin_shell', '海胆の殻', 2, 0, ['beach'], 0.15, 'とげの落ちた海胆の殻。灯りの笠にもなる。'],
  ['abalone_shell', '虹色の鮑殻', 12, 1, ['sea'], 0.05, '螺鈿細工に使う、虹色に光る鮑の殻。'],
  ['giant_clam', '大しゃこ貝の殻', 40, 2, ['deep'], 0.01, '子どもが入れるほど大きな貝殻。教会の聖水盤に使われる。'],
  ['dragon_cowrie', '竜の宝貝', 150, 3, ['deep'], 0.002, '金色に輝く伝説の宝貝。持つ者は海で溺れないという。'],
  ['singing_whelk', '鳴き貝', 20, 2, ['beach'], 0.01, '風が吹くと笛のように鳴る貝。'],
  ['river_mussel', '川真珠貝の殻', 1, 0, ['river', 'lake'], 0.2, '川の貝の殻。ボタンに削る。'],
];
for (const [id, name, v, r, on, rate, desc] of SH) I(id, name, 'shell', id === 'giant_clam' ? 20 : 0.05, v, { st: 30, r, d: r ? 1 : 0, lim: r >= 2 ? 'herd' : 'none', src: [g('gather', on, rate)], use: U('collect:集めて飾ると気分が上がる', r >= 1 ? 'luxury:貴族が高く買う' : 'hobby:子どもの貝集め', ...(/murex/.test(id) ? ['dye:貝紫の染料'] : []), ...(/conch|cowrie|turban|abalone|clam/.test(id) ? ['craft:細工と楽器'] : [])), fx: { mood: 1 + r }, desc });

// ================= 虫と蝶の標本（捕まえて箱に留める） =================
const BUG = [
  ['spec_bluemorpho', '瑠璃蝶の標本', 'forest', 15, 1, '空色に光る羽の蝶。'],
  ['spec_swallowtail', '黄金揚羽の標本', 'grass', 10, 1, '黄と黒の大きな揚羽。'],
  ['spec_lunamoth', '月の蛾の標本', 'dense', 20, 2, '満月の夜だけ飛ぶ、青白い大きな蛾。'],
  ['spec_glowmoth', '夜光蛾の標本', 'cave', 25, 2, '死んでも羽がほのかに光る蛾。'],
  ['spec_purple_emperor', '森の大紫の標本', 'forest', 18, 1, '国の蝶と呼ばれる、紫に光る蝶。'],
  ['spec_snow_white', '雪原の白蝶の標本', 'snow', 22, 2, '雪の上を舞う、透きとおった白い蝶。'],
  ['spec_desert_red', '砂漠の赤蝶の標本', 'desert', 18, 1, 'オアシスにだけ現れる、炎のような赤い蝶。'],
  ['spec_jewel_beetle', '宝石甲虫の標本', 'jungle', 30, 2, '翠玉のように光る密林の甲虫。首飾りにも使われる。'],
  ['spec_horned_beetle', '角の大甲虫の標本', 'jungle', 20, 1, '大きな一本角の甲虫。男の子の憧れ。'],
  ['spec_stag_beetle', '鍬形の標本', 'forest', 8, 0, '大あごの立派な鍬形。'],
  ['spec_tamamushi', '玉虫の標本', 'forest', 12, 1, '見る向きで色が変わる虫。'],
  ['spec_dragonfly', '大蜻蛉の標本', 'river', 5, 0, '夏の川辺の大きな蜻蛉。'],
  ['spec_demon_butterfly', '魔界の黒蝶の標本', 'volcano', 80, 3, '魔界ネクロスの赤い空を舞う黒い蝶。羽に目玉の模様。'],
  ['spec_scorpion', '大サソリの標本', 'desert', 10, 0, '毒針を抜いたサソリ。'],
  ['spec_giant_spider', '大蜘蛛の脚の標本', 'cave', 25, 1, '大蜘蛛の脚一本。冒険者の自慢話の種。'],
];
for (const [id, name, on, v, r, desc] of BUG) I(id, name, 'specimen', 0.2, v, { st: 1, r, d: 0, lim: 'herd', src: [g('forage', [on], 0.05 / (r + 1)), trade()], use: U('collect:標本箱に並べる（学者と好事家が買う）', 'magic:学者の研究（動物誌）', 'gift'), fx: { mood: 2, research: 1 }, desc: desc + '捕まえて標本の針で留め、硝子の箱に収める。' });
C('insect_pin', '標本の針と箱', 'specimen', 0.3, 3, 'smith', { iron: 0.02, planks: 0.3, glass: 0.1 }, 0.5, { st: 10, d: 0, use: U('tool:虫や蝶を標本にする'), desc: '細い針と硝子ぶたの箱。' });
I('amber_insect', '虫入り琥珀', 'specimen', 0.05, 80, { st: 1, r: 2, d: 0, lim: 'vein', src: [g('gather', ['beach'], 0.005), g('mine', ['mine'], 0.003)], use: U('collect:大昔の虫が閉じ込められた琥珀', 'magic:研究', 'luxury'), fx: { mood: 3, research: 2 }, desc: '琥珀の中に小さな虫が眠っている。' });
// 鳥の卵と羽根の標本
const EG = [['egg_eagle_spec', '鷲の卵の殻', 'mountain', 12, 1], ['egg_seagull_spec', 'カモメの卵の殻', 'beach', 2, 0], ['egg_owl_spec', 'フクロウの卵の殻', 'forest', 6, 0], ['egg_wyvern_spec', 'ワイバーンの卵の殻', 'mountain', 120, 3], ['feather_album', '羽根の見本帳', 'forest', 15, 0]];
for (const [id, name, on, v, r] of EG) I(id, name, 'specimen', 0.1, v, { st: 1, r, d: 0, lim: r >= 3 ? 'herd' : 'none', src: [g('forage', [on], 0.03 / (r + 1))], use: U('collect:鳥の卵集め', 'magic:学者の研究'), fx: { mood: 1 + r }, desc: `${name}。中身を抜いて乾かしてある。` });

// ================= 古銭 =================
const CO = [
  ['coin_elda', '古王国エルダの銀貨', 80, 3, ['ruins'], '七つの灯が刻まれた古王国の銀貨。'],
  ['coin_helwet', 'ヘルウェトの金貨', 90, 3, ['pyramid'], '砂の古王国の、四角い金貨。'],
  ['coin_jade', '翠の都の翡翠貨', 70, 3, ['ruins'], '翡翠を丸く削った、密林の都のお金。'],
  ['coin_alderia_first', '初代アルデリア銅貨', 20, 2, ['ruins', 'field'], '建国のころの粗い銅貨。麦の穂の刻印。'],
  ['coin_vermund_first', '初代ヴェルムント鉄貨', 18, 2, ['ruins', 'mine'], '鉄で鋳た古い硬貨。雪の結晶の刻印。'],
  ['coin_sahal_gold', 'サハルの砂金貨', 40, 2, ['pyramid', 'desert'], '砂金を打ち固めた小さな金貨。'],
  ['coin_war_scrip', '魔王戦役の軍票', 10, 1, ['ruins', 'dungeon'], '魔王戦役のとき王国が兵に配った札。いまは使えない。'],
  ['coin_holed', '穴あき銭', 2, 0, ['field', 'town'], '紐に通して持ち歩いた昔の銭。'],
  ['coin_pirate', '海賊の八つ割り金貨', 50, 2, ['dungeon', 'beach'], '八つに割って使った、海賊の金貨。'],
  ['coin_demon', '魔界の黒銀貨', 60, 3, ['demoncastle'], '魔王の顔が刻まれた黒い銀貨。持つと夢見が悪い。'],
  ['coin_misstruck', '刻印ずれの銀貨', 30, 2, ['town'], '刻印がずれたしくじりの銀貨。好事家が喜ぶ。'],
];
for (const [id, name, v, r, on, desc] of CO) I(id, name, 'coin', 0.02, v, { st: 50, r, d: 1, lim: 'relic', src: [loot(on.filter((x) => ['ruins', 'dungeon', 'pyramid', 'demoncastle'].includes(x)).length ? on.filter((x) => ['ruins', 'dungeon', 'pyramid', 'demoncastle'].includes(x)) : D, 0.03), ...(on.some((x) => ['field', 'town', 'mine', 'desert', 'beach'].includes(x)) ? [g('dig', on.filter((x) => ['field', 'town', 'mine', 'desert', 'beach'].includes(x)), 0.005)] : [])], use: U('collect:古銭集め（揃えると名声）', 'magic:学者の研究（歴史）', 'trade'), fx: { fame: r }, desc });
C('coin_album', '古銭の飾り箱', 'coin', 1, 20, 'carpenter', { planks: 1, velvet: 0.3 }, 2, { st: 1, d: 0, use: U('collect:古銭を並べて飾る', 'gift:好事家への贈り物'), fx: { mood: 2 }, desc: '天鵞絨に丸いくぼみを並べた、古銭を飾る箱。' });
C('commem_coin', '戴冠記念の大銀貨', 'coin', 0.05, 35, 'minter', { silver: 1 }, 1, { st: 20, r: 1, d: 1, use: U('collect:記念の品', 'gift'), fx: { fame: 1, mood: 2 }, desc: '新しい王の戴冠を祝って鋳られた大きな銀貨。', more: [trade()] });

// ================= 鉱物と化石の標本 =================
const MI = [
  ['spec_quartz_cluster', '水晶の群晶', 'mine', 25, 1, 'vein', '柱のような水晶が花のように集まった標本。'],
  ['spec_amethyst_geode', '紫水晶の晶洞', 'mine', 60, 2, 'vein', '割ると中に紫の結晶がびっしり。'],
  ['spec_pyrite', '黄鉄鉱の立方体', 'mine', 10, 0, 'vein', 'さいころのような金色の石。「愚か者の金」とも。'],
  ['spec_fulgurite', '雷の石', 'desert', 30, 2, 'none', '雷が砂に落ちてできた硝子の枝。ドルグ族は雷鳥の足跡と呼ぶ。'],
  ['spec_fern_fossil', '羊歯の化石', 'rock', 15, 1, 'vein', '石に羊歯の葉が写し取られている。'],
  ['spec_fish_fossil', '魚の化石', 'rock', 25, 1, 'vein', '山の上から出た魚の化石。昔は海だった証。'],
  ['spec_ammonite', '石の渦貝', 'rock', 20, 1, 'vein', '渦を巻いた大昔の貝の化石。'],
  ['spec_dragon_bone_fossil', '古竜の骨の化石', 'mountain', 300, 3, 'vein', '家ほどもある竜の骨の化石の一部。学者が群がる。'],
  ['spec_meteorite', '天の石', 'field', 150, 3, 'none', '夜空から落ちてきた黒い鉄の石。'],
  ['spec_desert_rose', '砂漠の薔薇', 'desert', 12, 1, 'none', '砂の中で薔薇の花のように育った石。'],
  ['spec_fluorite', '蛍石', 'mine', 15, 1, 'vein', '熱すると光る、緑と紫の石。'],
  ['spec_opal_rough', '虹色の蛋白石の原石', 'mine', 50, 2, 'vein', '磨く前から虹が走る原石。'],
  ['spec_serpentine', '蛇紋石', 'mountain', 8, 0, 'vein', '蛇の肌のような模様の石。'],
  ['spec_malachite_rough', '孔雀石の縞原石', 'mine', 20, 1, 'vein', '緑の縞が年輪のように重なる原石。'],
  ['spec_obsidian_ball', '黒曜石の玉', 'volcano', 18, 1, 'vein', '磨いて丸くした黒曜石。占いの玉にもなる。'],
];
for (const [id, name, on, v, r, lim, desc] of MI) I(id, name, 'mineral_spec', 1, v, { st: 5, r, d: 0, lim, src: [g(on === 'mine' ? 'mine' : 'forage', [on], 0.03 / (r + 1))], use: U('collect:標本棚に飾る（学者と好事家が買う）', 'magic:学者の研究（鉱物誌）', ...(r >= 2 ? ['luxury'] : [])), fx: { mood: 1, research: 1 + r }, desc });
I('fossil', '化石', 'mineral_spec', 3, 30, { st: 5, r: 2, d: 0, lim: 'vein', src: [g('dig', ['rock', 'hill', 'mountain'], 0.005), g('mine', ['mine'], 0.01)], use: U('collect:好事家の収集', 'magic:学者の研究'), fx: { research: 2 }, desc: '石になった大昔の生き物。' });

// ================= 民族の工芸品（民族ごと3つ） =================
const TC = [
  ['fianna', 'フィアナの民', [['antler_carving', '角の王の木彫り', { wood: 1 }, 15, '森の古き獣オルヴァンを彫った像。'], ['bark_basket', '樹皮の籠', { bark: 2 }, 5, '樹皮を編んだ軽い籠。'], ['bow_ornament', '弓飾りの房', { feather: 3, yarn: 0.1 }, 6, '初矢の祭りで弓に結ぶ房飾り。']]],
  ['yarvi', 'ヤルヴィ族', [['reindeer_bone_carving', 'トナカイの骨彫り', { bone: 1 }, 12, '骨に雪原の狩りの絵を彫り込んだ飾り。'], ['embroidered_mitten', '刺繍の手袋', { wool: 1, dye: 0.1 }, 10, '赤と青の刺繍の毛糸の手袋。'], ['snow_silver', '雪の結晶の銀細工', { silver: 0.2 }, 35, '雪の結晶を写した銀の胸飾り。']]],
  ['mahina', 'マヒナの民', [['shell_lei', '貝の首飾り', { seashell_cowrie: 5, yarn: 0.1 }, 8, '宝貝をつないだ首飾り。旅人を迎える贈り物。'], ['star_boat_model', '星の舟の模型', { planks: 0.5, cloth: 0.1 }, 18, '二つの船体をつないだ舟の模型。'], ['palm_fan', '棕櫚編みの団扇', { palm_leaf: 2 }, 4, '棕櫚の葉を編んだ団扇。']]],
  ['mictla', 'ミクトラ族', [['feather_headdress', '羽根の冠飾り', { feather: 8, dye: 0.2 }, 30, '色鮮やかな鳥の羽根を並べた冠飾り。'], ['obsidian_mirror', '黒曜の鏡', { obsidian: 1 }, 40, '黒曜石を磨いた鏡。巫が未来を映す。'], ['cacao_cup', 'カカオの器', { clay: 0.5, ochre: 0.1 }, 8, '神に捧げるカカオを入れる赤い器。']]],
  ['dorgu', 'ドルグ族', [['horsehair_tassel', '馬の毛の房飾り', { horse_hair: 1 }, 6, '馬の尾の毛を束ねた旗の房。'], ['felt_rug', '草原の毛氈', { wool: 3, dye: 0.2 }, 25, '模様を縫い込んだ厚い毛の敷物。'], ['thunder_plume', '雷鳥の羽根飾り', { eagle_feather: 2 }, 20, '雷の競馬の勝者がつける羽根飾り。']]],
  ['nefer', 'ネフェル族', [['blue_glass_eye', '青いガラスの護り目', { glass: 0.2, lapis: 0.05 }, 7, '泉と墓を守る青い硝子の目。'], ['tomb_figurine', '墓守の小さな陶俑', { clay: 0.5 }, 12, '死者に仕える小さな焼き物の人。'], ['salt_carving', '塩の結晶の彫り物', { salt: 2 }, 6, '塩の塊を彫った小さな獣。']]],
  ['garai', 'ガライ族', [['iron_bell_garai', '鉄峰の鈴', { iron: 0.2 }, 6, '坑道の魔除けに腰に下げる鉄の鈴。'], ['gem_mosaic', '宝石のはめ絵', { gem: 0.3, stone: 1 }, 60, '砕いた宝石で竜を描いたはめ絵。'], ['iron_dragon', '鉄細工の竜', { iron: 1 }, 30, '鍛冶の腕を見せる、翼の動く鉄の竜。']]],
  ['bolota', 'ボロタ族', [['reed_basket', '葦のかご', { reed: 3 }, 3, '葦を編んだ丈夫なかご。ボロタ族の名物。'], ['peat_doll', '泥炭の人形', { peat: 1 }, 3, '沼の主への願いを込めて泥炭を固めた人形。'], ['moss_dyed_cloth', '沼苔染めの布', { cloth: 1, swamp_moss: 1 }, 15, '沼の苔で深い緑に染めた布。']]],
  ['harn', 'ハルン族', [['obsidian_knife_orn', '飾り黒曜の小刀', { obsidian: 0.5, wood: 0.1 }, 20, '黒曜石を割って作った儀式の小刀。'], ['sulfur_crystal_orn', '硫黄の結晶の置物', { sulfur: 1 }, 10, '火口で採れた黄色い結晶。'], ['hotspring_cloth', '温泉染めの飾り布', { cloth: 1, alum: 0.1 }, 18, '温泉の湯で染めた、赤茶の縞の布。']]],
  ['hollin', 'ホリン衆', [['silver_thread_cloth', '糸の谷の銀糸の布', { silk: 2, silver_powder: 0.3 }, 60, '銀糸を織り込んだ、ホリン衆の秘伝の布。'], ['buckwheat_doll', '蕎麦わら人形', { straw: 1 }, 2, '収穫を祝って蕎麦わらで作る人形。'], ['beeswax_lantern', '蜜蝋細工の灯り', { wax: 0.5 }, 8, '蜜蝋を花の形に固めた灯り。']]],
];
for (const [t, tn, list] of TC) for (const [id, name, from, v, desc] of list) C(id, name, 'tribal_craft', 0.4, v, 'tribal_artisan', from, 1 + v / 10, { st: v < 10 ? 10 : 1, r: v >= 30 ? 2 : 1, d: 1, use: U(`collect:${tn}の工芸品`, 'gift:民族と仲良くなる贈り物・王都の土産', 'trade:民族との交易品'), fx: { mood: 2 }, desc: `${tn}の手仕事。${desc}`, more: [trade()] });

// ================= 記念品・土産 =================
const SV = [
  ['souvenir_plate', '王都の絵皿', { pottery: 1, dye: 0.1 }, 6, '王城を描いた土産の皿。'],
  ['ship_in_bottle', '瓶詰めの帆船', { glass: 0.3, planks: 0.1 }, 15, '瓶の中に組み上げた帆船。港町の土産。'],
  ['pilgrim_badge', '巡礼章', { tin: 0.05 }, 3, '聖地を巡った証に帽子につける錫の章。'],
  ['festival_mask', '祭りの面', { paper_reed: 1, dye: 0.1 }, 4, '収穫祭で子どもがかぶる紙の面。'],
  ['sand_vial', '砂漠の砂の小瓶', { vial: 1, sand: 0.1 }, 3, 'サハルの赤い砂を詰めた小瓶。'],
  ['snow_globe', '雪の舞う水晶玉', { glass: 0.5, water: 0.2 }, 20, '振ると中で雪が舞う硝子の玉。ヴェルムントの土産。'],
  ['postcard_painted', '名所の絵札', { paper_hemp: 1, ink_color: 0.1 }, 2, '名所を描いた小さな絵札。旅の思い出に。'],
  ['lock_of_hair', '恋人の髪の房', { yarn: 0.01 }, 1, '恋人と交わした髪の房。ロケットに入れて持ち歩く。'],
  ['wedding_ribbon', '婚礼のリボン', { silk: 0.1 }, 3, '婚礼の日の飾り。夫婦が大事にとっておく。'],
  ['battle_trophy', '魔物の牙の戦利品', { fang: 2, planks: 0.3 }, 10, '初めて倒した魔物の牙を板に打ちつけた飾り。'],
];
for (const [id, name, from, v, desc] of SV) C(id, name, 'souvenir', 0.2, v, id === 'battle_trophy' ? 'hunter' : 'toymaker', from, 0.5, { st: 5, d: 1, use: U('collect:思い出の品として飾る', 'gift:家族と恋人への贈り物'), fx: { mood: 3 }, desc });

// ================= 勲章 =================
const MD = [
  ['medal_valor', '武功章', 40, 1, '戦で手柄を立てた兵に王が授ける銀の章。'],
  ['medal_hero', '勇者章', 300, 3, '魔王軍の将を討った者に授ける金の大章。'],
  ['medal_lifesaver', '救命章', 30, 1, '火事や水難から人を救った者への章。'],
  ['medal_service', '長年勤続章', 20, 0, '二十年仕えた騎士・兵・役人に授ける章。'],
  ['medal_hunter', '魔物討伐章', 50, 1, '魔物の巣を払った討伐隊に授ける章。'],
  ['medal_dragonslayer', '竜殺しの章', 800, 4, '竜を討った者だけが胸に下げる紅玉の章。'],
  ['medal_knighthood', '騎士叙任の章', 100, 2, '騎士に取り立てられた日に授かる剣の章。'],
  ['guild_badge_bronze', '冒険者の銅の等級章', 5, 0, 'ギルドに入った冒険者が最初にもらう章。'],
  ['guild_badge_silver', '冒険者の銀の等級章', 25, 1, '腕の立つ冒険者の証。'],
  ['guild_badge_gold', '冒険者の金の等級章', 120, 2, '大陸に数えるほどしかいない一流の冒険者の証。'],
  ['medal_scholar', '学術褒章', 60, 2, '大きな発見をした学者に王が授ける章。'],
  ['medal_pioneer', '開拓功労章', 40, 1, '新しい村を拓いた開拓者に授ける章。'],
];
for (const [id, name, v, r, desc] of MD) C(id, name, 'medal', 0.05, v, 'jeweler', { [r >= 2 ? 'gold' : r >= 1 ? 'silver' : 'copper']: 0.1, silk: 0.05 }, 2, { st: 1, r, d: 1, use: U('collect:胸に下げると名声が上がる', 'quest:王とギルドが手柄に授ける'), fx: { fame: 2 + r * 3, mood: 5 }, eq: { slot: 'accessory' }, desc });

// ================= 肖像画 =================
const PT = [
  ['portrait_king', '王の肖像画', 200, 2, '玉座の王を描いた大きな肖像画。役所と城に掛ける。'],
  ['portrait_noble', '貴族の肖像画', 80, 1, '家の当主を描いた肖像画。屋敷の廊下に並ぶ。'],
  ['portrait_family', '家族の肖像画', 40, 0, '夫婦と子どもたちを描いた絵。家の宝。'],
  ['portrait_hero', '英雄の肖像画', 120, 2, '魔王を討った英雄の姿。酒場の壁にも写しが掛かる。'],
  ['portrait_locket', '肖像入りの小箱', 30, 1, '小さな肖像を入れて首に下げる銀の小箱。'],
  ['portrait_ancestor', '先祖の肖像画', 60, 1, '何代も前の先祖を描いた古い絵。'],
];
for (const [id, name, v, r, desc] of PT) C(id, name, 'portrait', id === 'portrait_locket' ? 0.05 : 3, v, 'painter', id === 'portrait_locket' ? { silver: 0.2, paper_fine: 0.1 } : { canvas: 1, pigment_set: 1, planks: 1 }, 6 + r * 4, { st: 1, r, d: 1, use: U('collect:飾ると家の名声が上がる', 'gift', ...(id === 'portrait_locket' ? ['wear'] : ['luxury'])), fx: { fame: 1 + r, mood: 3 }, eq: id === 'portrait_locket' ? { slot: 'accessory' } : undefined, desc });
export default B.list;
