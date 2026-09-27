import { A, S, U, M } from './gen_core.mjs';

// ===== 岩の種類（追加） =====
const ROCKS2 = [
  ['porphyry', '斑岩', ['mountain'], 14, 1, '王の間の柱・棺', '赤紫の地に白い斑が散る石。王家の色として尊ばれる。'],
  ['travertine', '石灰華', ['volcano', 'hill'], 6, 0, '浴場・噴水・広場', '温泉が固めた、小さな穴のあるあたたかい色の石。'],
  ['diorite', '閃緑岩', ['mountain'], 4, 0, '碑・彫像の台座', '白と黒のごま模様のとても硬い石。碑文が長く残る。'],
  ['coralstone', '珊瑚石', ['beach'], 1.5, 0, '南の浜の家の壁', '浜で切り出す白く軽い石。切ったあと固まる。'],
  ['lavarock', '溶岩石', ['volcano'], 1.5, 0, 'かまど・蒸し風呂の焼き石・石垣', '溶岩が冷えた穴だらけの黒い石。熱に強い。'],
];
for (const [id, nm, on, v, rare, note, desc] of ROCKS2) {
  A(`${id}_raw`, `${nm}の原石`, 'rock', 20, v, { limit: 'vein', rare, demand: 1, src: [S('mine', [...on, 'mine'], rare ? 0.08 : 0.4)], use: [U('build', note), U('craft', '切り石・石板に加工する')], desc: `${desc}（掘り出したままの塊）` });
  A(`${id}_block`, `${nm}の切り石`, 'rock', 18, v * 2.2, { rare, demand: 1, make: M({ [`${id}_raw`]: 1 }, 'mason', 2), use: [U('build', note)], desc: `${nm}を四角く切りそろえた石材。` });
  A(`${id}_slab`, `${nm}の石板`, 'rock', 10, v * 1.5, { rare, demand: 1, make: M({ [`${id}_block`]: 1 }, 'mason', 2), use: [U('build', '床・壁の張り石'), U('craft', '作業台・墓の蓋')], desc: `${nm}を薄く挽いた板。` });
  A(`${id}_polished`, `磨いた${nm}`, 'rock', 10, v * 4, { rare: rare + 1, demand: 0, make: M({ [`${id}_slab`]: 1, volcanicsand: 1 }, 'mason', 4), use: [U('luxury', '館の床・卓の天板'), U('build', '宮殿の飾り')], desc: `砂で磨き上げた${nm}。` });
}
const MARB = [
  ['black', '黒大理石', '夜のように黒く、白い筋が稲妻のように走る。'],
  ['red', '紅大理石', '血のように赤い大理石。王の間の床に使う。'],
  ['green', '緑大理石', '深い森の緑の大理石。神殿の柱に好まれる。'],
];
for (const [k, nm, d] of MARB) {
  A(`marble_${k}_raw`, `${nm}の原石`, 'rock', 20, 25, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['mountain', 'mine'], 0.02)], use: [U('build', '宮殿と神殿の飾り石'), U('trade')], desc: d });
  A(`marble_${k}_polished`, `磨いた${nm}`, 'rock', 10, 90, { rare: 3, demand: 0, make: M({ [`marble_${k}_raw`]: 1, volcanicsand: 1 }, 'mason', 8), use: [U('luxury', '王族の床・卓・浴槽'), U('collect')], desc: `鏡のように磨いた${nm}。` });
}

// ===== 石の品（建物と暮らし） =====
A('statue_block', '彫像用の石塊', 'stone', 200, 60, { stack: 1, demand: 0, make: M({ marble_raw: 6 }, 'mason', 8), use: [U('craft', '彫刻家が像を彫る')], desc: 'きずのない大理石を選んで荒く四角に整えた大きな塊。' });
A('stone_statue', '石の像', 'stone', 150, 400, { rare: 2, stack: 1, demand: 0, make: M({ statue_block: 1 }, 'sculptor', 120), use: [U('luxury', '広場・庭園・宮殿の飾り'), U('ritual', '英雄と神を祀る')], desc: '王や英雄や神を刻んだ石の像。' });
A('stone_lantern', '石の灯り台', 'stone', 60, 25, { stack: 1, demand: 0, make: M({ granite_block: 2 }, 'mason', 10), use: [U('build', '庭と参道の灯り'), U('hobby', '庭造り')], desc: '中に油皿や灯り石を置く、石を組んだ灯り台。' });
A('keystone', '要石', 'stone', 40, 15, { stack: 1, demand: 0, make: M({ cutstone: 2 }, 'mason', 6), use: [U('build', '石橋と門の石組みの弧の頂の石')], desc: '石組みの弧のてっぺんにはめる楔形の石。これを抜けば橋が落ちる。' });
A('wellring', '井戸枠の石', 'stone', 80, 18, { stack: 1, demand: 1, make: M({ cutstone: 3 }, 'mason', 6), use: [U('build', '井戸の縁と内壁')], desc: '井戸の口を囲む丸く削った石の枠。' });
A('stonestep', '石段', 'stone', 40, 8, { stack: 1, demand: 1, make: M({ cutstone: 2 }, 'mason', 3), use: [U('build', '坂道・城・神殿の階段')], desc: '段の形に切った石。' });
A('boundarystone', '境界石', 'stone', 30, 6, { stack: 1, demand: 1, make: M({ stone: 1 }, 'mason', 2), use: [U('build', '畑と土地の境を示す（動かすのは重い罪）')], desc: '土地の持ち主の印を刻んだ境の石。' });
A('catapultstone', '投石機の石弾', 'stone', 30, 4, { stack: 1, demand: 1, make: M({ granite_raw: 1 }, 'mason', 2), use: [U('tool', '攻城戦で城壁を崩す')], desc: '丸く削った重い石の弾。戦のたびに石工が忙しくなる。' });
A('sauna_stones', '蒸し風呂の焼き石', 'stone', 10, 3, { demand: 1, make: M({ lavarock_raw: 1 }, 'mason', 1), use: [U('luxury', '焼いて水をかけ蒸し風呂にする'), U('medicine', '汗で病を出す')], desc: '割れにくい溶岩石を拳大にそろえたもの。' });
A('mine_tailings', '捨て石', 'stone', 5, 0.02, { limit: 'none', demand: 0, src: [S('gather', ['mine'], 0.9)], use: [U('build', '道と堤の盛り土・石垣の裏込め')], desc: '鉱石を選んだあとに残る石。山のように積まれている。' });

// ===== 金物の建材 =====
A('lead_pipe', '鉛の水道管', 'metal', 3, 12, { demand: 1, make: M({ lead_sheet: 1 }, 'smith', 2), use: [U('build', '町の水道・噴水・浴場')], desc: '鉛の板を丸めてつないだ管。' });
A('iron_grille', '鉄格子', 'metal', 15, 40, { stack: 1, demand: 1, make: M({ iron_rod: 3 }, 'smith', 6), use: [U('build', '牢・窓・宝物庫の守り')], desc: '鉄の棒を組んだ格子。' });
A('hinge', '蝶番', 'metal', 0.3, 4, { demand: 2, make: M({ iron_sheet: 1 }, 'smith', 1), use: [U('build', '扉・窓・箱のふた')], desc: '扉を開け閉めする鉄の金具。ひとつの延べ棒から四つ作る。' });
A('rivet', '鋲', 'metal', 0.5, 6, { demand: 1, make: M({ iron_rod: 1 }, 'smith', 1), use: [U('craft', '鎧・盾・船板を留める')], desc: '板と板を貫いて潰して留める金具のひと袋。' });
A('copper_gutter', '銅の雨樋', 'metal', 4, 18, { demand: 0, make: M({ copper_sheet: 2 }, 'smith', 3), use: [U('build', '屋根の雨水を集める（裕福な家）')], desc: '銅の板を曲げて作った雨樋。年とともに緑に変わる。' });

// ===== 土（追加） =====
A('fullersearth', '漂布土', 'soil', 3, 1, { limit: 'vein', demand: 1, src: [S('dig', ['hill', 'swamp'], 0.1)], use: [U('craft', '羊毛と布の脂を抜く・毛織物の縮絨'), U('medicine', '腹下しの薬')], desc: '水を吸ってふくらむ灰色の土。布屋が脂抜きに使う。' });
A('diatomite', '珪藻土', 'soil', 1, 0.8, { limit: 'vein', src: [S('dig', ['lake', 'swamp'], 0.1)], use: [U('build', '湿気を吸う壁・かまどの断熱'), U('craft', '水と酒の濾し土')], desc: '白く軽い土。太古の小さな水草の殻でできている。' });
A('marl', '泥灰土', 'soil', 5, 0.2, { limit: 'none', demand: 1, src: [S('dig', ['field', 'lake', 'hill'], 0.3)], use: [U('fertilize', '痩せた畑に撒く')], desc: '石灰を含んだ粘る土。撒けば麦がよく実る。' });
A('medicinalclay', '薬の土', 'soil', 0.5, 5, { limit: 'vein', rare: 1, src: [S('dig', ['hill', 'mountain'], 0.02)], use: [U('medicine', '毒を吸い出す・腹の薬'), U('trade', '印を押した丸薬として売られる')], desc: '毒消しになると言われる赤い粘土。' });
A('coralsand', '珊瑚の砂', 'soil', 5, 0.2, { limit: 'none', src: [S('dig', ['beach'], 0.3)], use: [U('build', '焼いて石灰にする'), U('hobby', '水槽と庭の敷き砂')], desc: '砕けた珊瑚と貝殻でできた白い砂。' });
A('ironsoil', '鉄さびの土', 'soil', 5, 0.3, { limit: 'none', src: [S('dig', ['swamp', 'river'], 0.2)], use: [U('dye', '黒染めの鉄漿（鉄の媒染）'), U('craft', '沼鉄の手がかり')], desc: '赤くさびた水がしみた土。' });

// ===== 水（追加） =====
A('ironspring', '鉄泉の水', 'water', 1, 0.3, { limit: 'none', stack: 10, src: [S('gather', ['hill', 'mountain', 'volcano'], 0.05)], use: [U('medicine', '血の薄い人の湯治'), U('dye', '黒染め')], drink: 20, desc: '鉄の味がする赤茶けた泉の水。' });
A('sulfurspring', '硫黄泉の水', 'water', 1, 0.3, { limit: 'none', stack: 10, src: [S('gather', ['volcano'], 0.2)], use: [U('medicine', '肌の病の湯治'), U('luxury', '湯あみ')], desc: '卵の腐ったようなにおいの白く濁った湯。肌の病によく効く。' });
A('yunohana', '湯の花', 'mineral', 0.2, 3, { limit: 'none', demand: 1, src: [S('gather', ['volcano'], 0.1)], use: [U('medicine', '家の湯で湯治ができる'), U('luxury'), U('gift', '湯治場のみやげ')], desc: '温泉のふちに咲く黄白色の結晶。家の風呂に入れると温泉になる。' });
A('bathsalt', '湯の塩', 'salt', 0.5, 5, { demand: 1, make: M({ seasalt: 1, yunohana: 1 }, 'alchemist', 1), use: [U('luxury', '湯あみ'), U('medicine', '疲れと冷えを取る')], desc: '海塩に湯の花を混ぜた、湯あみ用の塩。' });

// ===== 珍しい石・お守りの石 =====
A('viewingstone', '奇岩の置き石', 'stone', 8, 40, { limit: 'vein', rare: 2, demand: 0, src: [S('gather', ['river', 'mountain', 'beach'], 0.005)], use: [U('hobby', '山や波に見立てて眺める趣味'), U('collect', '好事家が大金を払う')], desc: '自然が削った、山や滝のように見える石。' });
A('meteorite_shard', '隕石のかけら', 'stone', 0.2, 20, { limit: 'relic', rare: 2, demand: 0, src: [S('gather', ['grass', 'desert', 'snow', 'field'], 0.002)], use: [U('collect'), U('ritual', '星の神のお守り')], desc: '夜空から落ちてきた黒い石のかけら。ずっしり重い。' });
A('fulgurite', '雷の砂管', 'stone', 0.2, 18, { limit: 'relic', rare: 2, demand: 0, src: [S('dig', ['desert', 'beach'], 0.002)], use: [U('collect', '雷が砂を焼いた管'), U('magic', '雷の魔法の触媒')], desc: '雷が砂に落ちて溶かした、硝子の枝のような管。' });
A('desertrose', '砂漠の薔薇', 'stone', 0.5, 12, { limit: 'vein', rare: 2, demand: 0, src: [S('dig', ['desert'], 0.005)], use: [U('collect'), U('gift', '砂漠の旅人の贈り物')], desc: '石膏と砂が薔薇の花の形に固まった石。' });
A('fairycross', '妖精の十字石', 'stone', 0.05, 10, { limit: 'vein', rare: 2, demand: 0, src: [S('gather', ['hill', 'mountain'], 0.003)], use: [U('ritual', '妖精の涙から生まれた厄よけ'), U('collect')], desc: '自然に十字の形をした茶色の石。' });
A('hagstone', '穴あき石', 'stone', 0.2, 2, { limit: 'none', rare: 1, demand: 0, src: [S('gather', ['beach', 'river'], 0.01)], use: [U('ritual', '穴から覗けば妖精が見える・家畜の魔よけ')], desc: '水が自然に穴を穿った小石。紐を通して戸口に吊るす。' });
A('eaglestone', '鷲石', 'stone', 0.3, 15, { limit: 'vein', rare: 2, demand: 0, src: [S('gather', ['mountain'], 0.002), S('hunt', ['eagle'], 0.02)], use: [U('ritual', '安産のお守り（振ると中で小石が鳴る）'), U('gift')], desc: '鷲の巣から見つかる、中が空洞で小石の入った石。' });
A('thunderstone', '雷斧石', 'stone', 0.5, 6, { limit: 'relic', rare: 1, demand: 0, src: [S('dig', ['field', 'hill'], 0.003)], use: [U('ritual', '雷よけに屋根裏に置く'), U('collect')], desc: '雷の落ちた跡から出るという、斧の形の黒い石。' });

// ===== 宝石（追加） =====
const GEMS2 = [
  ['chrysoprase', '緑玉髄', 25, 1, ['hill', 'mine'], '林檎の若葉色の玉髄。'],
  ['morganite', '桃色緑柱石', 60, 2, ['mountain', 'mine'], '桃の花のように淡い石。'],
  ['heliodor', '黄金緑柱石', 55, 2, ['mountain', 'mine'], '日の光を集めたような黄金の石。'],
  ['snowobsidian', '雪花黒曜石', 10, 0, ['volcano'], '黒地に白い雪の花が咲く黒曜石。'],
  ['seapattern', '海紋石', 50, 2, ['beach', 'volcano'], '浅い海の水面を写したような水色の石。'],
  ['sodalite', '方曹達石', 12, 0, ['mountain', 'mine'], '白い筋の入った紺色の石。瑠璃のかわりに使われる。'],
  ['chrysocolla', '珪孔雀石', 18, 1, ['mine', 'desert'], '青と緑が溶け合った柔らかな石。'],
  ['amazonite', '天河石', 14, 0, ['mountain'], '青緑の、女戦士が好んだという石。'],
  ['prehnite', '葡萄石', 16, 1, ['mountain', 'volcano'], '葡萄の房のように丸く連なる淡い緑の石。'],
  ['aventurine', '砂金石', 10, 0, ['river', 'mountain'], 'きらきらと金粉を散らしたような緑の石。'],
];
for (const [id, nm, v, rare, on, lore] of GEMS2) {
  A(`${id}_chip`, `${nm}の屑石`, 'gem', 0.02, v * 0.08, { limit: 'vein', rare: Math.max(0, rare - 1), demand: 1, stack: 99, src: [S('mine', on, 0.08)], use: [U('craft', '象嵌・安い装身具'), U('trade')], desc: `${nm}の小さなかけら。${lore}` });
  A(`${id}_rough`, `${nm}の原石`, 'gem', 0.1, v * 0.4, { limit: 'vein', rare, demand: 1, stack: 50, src: [S('mine', on, rare === 2 ? 0.005 : 0.02), S('loot', ['dungeon'], 0.03)], use: [U('craft', '宝石職人が磨く'), U('trade')], desc: `掘り出したままの${nm}。${lore}` });
  A(id, nm, 'gem', 0.02, v, { rare, demand: 1, stack: 50, make: M({ [`${id}_rough`]: 1 }, 'jeweler', 3), use: [U('craft', '指輪・首飾り・帯留め'), U('luxury'), U('gift')], desc: `磨き上げた${nm}。${lore}` });
  A(`${id}_flawless`, `極上の${nm}`, 'gem', 0.03, v * 6, { rare: Math.min(4, rare + 1), demand: 0, stack: 10, src: [S('loot', ['dungeon', 'demoncastle', 'pyramid'], 0.002)], make: M({ [`${id}_rough`]: 3 }, 'jeweler', 12), use: [U('collect', '王族が競って集める'), U('luxury'), U('trade')], desc: `傷ひとつない大粒の${nm}。` });
}

// ===== 合わさった属性の結晶 =====
const MIX = [
  ['thunder', '雷', 'fire', 'wind', '雷の魔法・避雷の結界', '青白い火花が内でぱちぱち弾ける結晶。'],
  ['frost', '氷', 'water', 'wind', '氷の魔法・氷室を冷やす', '霜をまとった、溶けない氷の結晶。'],
  ['magma', '溶岩', 'fire', 'earth', '溶岩の魔法・溶鉱炉の火', 'どろりと赤く脈打つ、重い結晶。'],
  ['life', '命', 'light', 'water', '癒やしの魔法・枯れた畑をよみがえらせる', 'ほのかに温かく、若葉の香りがする結晶。'],
  ['venom', '毒', 'dark', 'water', '毒と解毒の研究', '緑黒くにごった、触れると痺れる結晶。'],
  ['chaos', '混沌', 'light', 'dark', '禁じられた大魔法・世界の理の研究', '光と闇が渦を巻く、見る者を不安にさせる結晶。'],
];
for (const [k, nm, a, b, note, desc] of MIX) {
  A(`${k}_crystal`, `${nm}の結晶`, 'element', 0.3, k === 'chaos' ? 600 : 120, { rare: k === 'chaos' ? 4 : 3, demand: 0, stack: 20, make: M({ [`${a}_crystal`]: 1, [`${b}_crystal`]: 1 }, 'alchemist', k === 'chaos' ? 72 : 24), src: [S('loot', ['dungeon', 'demoncastle'], 0.002)], use: [U('magic', note), U('trade')], desc });
  A(`${k}_dust`, `${nm}の結晶の粉`, 'element', 0.05, k === 'chaos' ? 120 : 25, { rare: 2, demand: 0, stack: 99, make: M({ [`${k}_crystal`]: 1 }, 'alchemist', 2), use: [U('magic', `${nm}の魔法薬・魔法陣`)], desc: `${nm}の結晶を砕いた粉。ひとつの結晶から少ししかとれない。` });
}
