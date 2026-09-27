import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);
const JW = 'jeweler';
const relic = (id, name, sub, w, v, r, on, rate, use, desc, fx, eq) => I(id, name, sub, w, v, { st: 1, r, d: 1, lim: 'relic', src: [loot(on, rate)], use, fx, eq, desc });
const tre = (note) => U('collect:' + note, 'trade:王家の宝物庫や好事家が買い取る', 'luxury');

// ================= 既存の宝（TREASURE_ITEMS）と伝説の宝（lore.js LEGENDS） =================
relic('ancient_gold_coin', '古代の金貨', 'relic', 0.02, 60, 2, D, 0.1, U('collect:古銭集め', 'trade:両替商が地金として買う'), '古王国のころの金貨。王の横顔がすり減っている。');
relic('dragonscale_necklace', '竜の鱗の首飾り', 'relic', 0.2, 350, 3, ['dungeon', 'demoncastle'], 0.01, tre('王族の自慢の品'), '竜の鱗を黄金でつないだ首飾り。火を寄せつけない。', { ward: 'fire', fame: 3 }, { slot: 'accessory' });
relic('magicstone_crown', '魔石の王冠', 'crown', 1.5, 900, 4, ['demoncastle'], 0.003, tre('魔王の宝'), '大魔石をいくつもはめた王冠。かぶると魔力が満ちる。', { mana: 100, fame: 10 }, { slot: 'head' });
relic('pharaoh_mask', 'ファラオの黄金仮面', 'relic', 3, 1200, 4, ['pyramid'], 0.002, U('quest:墓に戻せば王の亡霊が眠る', 'collect:伝説の品', 'trade'), '眠れる王ネフェルカーの黄金の仮面。持ち出した者には呪いがかかるという。', { curse: 2, fame: 10 });
relic('holysilver_dagger', '聖銀の短剣', 'relic', 0.5, 500, 3, ['dungeon', 'ruins'], 0.005, U('quest:嘆きの迷宮の団長の短剣', 'collect', 'wear:不死の魔物を斬る'), 'ヴェルムントの騎士団長の短剣。刃に聖句が刻まれている。', { ward: 'undead' }, { slot: 'weapon' });
relic('stargazer_crystal', '星読みの水晶', 'relic', 1, 600, 3, ['ruins'], 0.005, U('magic:星を読む・先を知る', 'collect', 'quest'), 'エルダの灯守が守ってきた水晶。覗くと星の書の一節が浮かぶ。', { foresee: 5, research: 10 });
relic('mermaid_tear', '人魚の涙', 'relic', 0.01, 300, 3, ['dungeon', 'ruins'], 0.01, U('magic:真実の恋の霊薬', 'collect', 'gift:求婚の贈り物'), '人魚が流した涙が固まった青い真珠。', { love: 10 });
relic('spirit_feather', '精霊の羽根', 'relic', 0.01, 250, 3, ['dungeon', 'ruins'], 0.01, U('magic:精霊の護符', 'collect'), '触れると風が起こる、虹色の羽根。');
relic('royal_signet_ring', '王家の紋章入り指輪', 'relic', 0.05, 400, 3, ['ruins', 'dungeon'], 0.005, U('collect', 'quest:王家に返すと褒美', 'trade'), '昔の王家の紋章が刻まれた金の指輪。', { fame: 5 }, { slot: 'accessory' });
relic('twilight_crown', '黄昏の冠', 'crown', 2, 3000, 4, ['ruins'], 0.001, U('quest:古代都市の遺跡の地下の伝説', 'magic:星の書が読めるようになる', 'collect:伝説の品'), '古王国エルダ最後の王の冠。かぶれば星の書を読めるが、死を恐れる心も受け継ぐ。', { research: 50, mood: -10 }, { slot: 'head' });
relic('jade_heart', '翠の心臓', 'relic', 1.5, 2500, 4, ['ruins'], 0.001, U('quest:ミクトラ族の神殿に返す', 'ritual:大蛇ヨワリの祭壇', 'collect:伝説の品'), '大蛇ヨワリの鱗から削り出した握りこぶし大の翠玉。', { faith: 20 });
relic('dragon_eggshell_cup', '竜の卵殻の盃', 'relic', 0.8, 2000, 4, ['dungeon'], 0.001, U('magic:この盃で水を飲めば竜の言葉がわかる', 'collect:伝説の品', 'quest'), '赤き竜ヴァルグリムが生まれた卵の殻の盃。', { speak: 'dragon' });
relic('first_fire_flint', '始まりの火の火打ち石', 'relic', 0.3, 400, 3, ['ruins', 'cave'], 0.003, U('ritual:すべての守り神に通じる', 'collect:伝説の品', 'quest'), '古の洞窟の壁画の焚き火の前に置かれていた火打ち石。', { faith: 10 });
// ================= 冠 =================
relic('ancient_king_crown', '古王の冠', 'crown', 1.5, 800, 3, ['ruins', 'pyramid'], 0.003, tre('王族の収集'), '名も忘れられた古い王の金の冠。', { fame: 8 }, { slot: 'head' });
C('silver_coronet', '銀の小冠', 'crown', 0.5, 150, JW, { silver: 3, pearl: 1 }, 20, { st: 1, r: 1, d: 1, use: U('wear:貴族の礼装', 'luxury', 'gift'), fx: { fame: 3 }, eq: { slot: 'head' }, desc: '貴族の娘が成人の祝いにかぶる銀の小冠。' });
C('bridal_crown', '花嫁の冠', 'crown', 0.4, 90, JW, { silver: 1, pearl: 1, rose: 3 }, 10, { st: 1, r: 1, d: 1, use: U('ritual:婚礼', 'luxury', 'gift'), fx: { mood: 10 }, eq: { slot: 'head' }, desc: '婚礼の日に花嫁がかぶる冠。村で一つを代々貸し借りする。' });
relic('demon_horn_crown', '魔将の角冠', 'crown', 2, 700, 3, ['demoncastle'], 0.005, tre('魔王軍との戦の戦利品'), '魔将の角を黒鉄で束ねた冠。持つと勇気がわく。', { courage: 10, curse: 1 }, { slot: 'head' });
relic('desert_headdress', '砂漠の王の頭飾り', 'crown', 1, 600, 3, ['pyramid'], 0.004, tre('サハルの王族の宝'), '瑠璃と金の砂漠の王の頭飾り。', { fame: 6 }, { slot: 'head' });
C('laurel_wreath', '月桂の冠', 'crown', 0.2, 8, 'gardener', { laurel: 3 }, 1, { st: 1, d: 1, use: U('ritual:競技と詩の勝者に贈る', 'collect:記念'), fx: { fame: 3, mood: 8 }, eq: { slot: 'head' }, desc: '祭りの馬比べや詩比べの勝者に贈る月桂の冠。' });

// ================= 装身具 =================
C('jewelry', '装身具', 'jewelry', 0.05, 60, JW, { gem: 0.2, silver: 0.5 }, 6, { st: 5, r: 1, d: 1, use: U('luxury:貴族の身だしなみ', 'gift:贈り物', 'collect'), fx: { beauty: 4, fame: 1 }, eq: { slot: 'accessory' }, desc: '原石を磨いて銀の台にはめた、ありふれた装身具。' });
C('ring', '銀の指輪', 'jewelry', 0.02, 60, JW, { gem: 0.2, silver: 0.3 }, 4, { st: 1, r: 1, d: 1, use: U('wear:身につけて守りが少し上がる', 'gift:婚約の指輪', 'luxury'), fx: { def: 1, beauty: 2 }, eq: { slot: 'accessory' }, desc: '小さな石をはめた銀の指輪。', more: [loot(D, 0.05)] });
const MET = [['copper', '銅', 1, 0.3], ['silver', '銀', 20, 1], ['gold', '金', 80, 2.2], ['holy_silver', '聖銀', 60, 3]];
const KIND = [['ring', '指輪', 0.1, 0.02], ['necklace', '首飾り', 0.4, 0.1], ['earring', '耳飾り', 0.15, 0.02], ['bracelet', '腕輪', 0.4, 0.08], ['brooch', '胸飾り', 0.25, 0.04], ['hairpin', '髪飾り', 0.15, 0.03], ['anklet', '足輪', 0.3, 0.06]];
for (const [m, mn, mv, rm] of MET) for (const [k, kn, amt, w] of KIND) {
  if (m === 'silver' && k === 'ring') continue; // ring（銀の指輪）は既存の id
  const v = Math.max(3, Math.round(mv * amt * 2.5 + 4 * rm));
  const r = m === 'holy_silver' ? 2 : m === 'gold' ? 1 : 0;
  C(`${m}_${k}`, `${mn}の${kn}`, 'jewelry', w, v, m === 'copper' ? 'smith' : JW, { [m]: amt }, 1 + rm * 2, { st: 5, r, d: m === 'copper' ? 2 : 1, use: U('wear:身につけて見栄えがよくなる', 'gift:贈ると好かれる', m === 'copper' ? 'trade' : 'luxury'), fx: { beauty: Math.round(1 + rm * 2), ...(m === 'holy_silver' ? { ward: 'undead' } : {}) }, eq: { slot: 'accessory' }, desc: `${mn}を打ち出して作った${kn}。${m === 'copper' ? '村娘の晴れの日の飾り。' : m === 'silver' ? '町の女たちの憧れ。' : m === 'gold' ? '貴族の身につける品。' : '死霊を寄せつけないと、聖騎士の妻が身につける。'}` });
}
const GEM = [['ruby', '紅玉', 2], ['sapphire', '青玉', 2], ['emerald', '翠玉', 2], ['pearl', '真珠', 1], ['amber', '琥珀', 0], ['amethyst', '紫水晶', 1], ['opal', '蛋白石', 1], ['topaz', '黄玉', 1], ['garnet', '柘榴石', 0], ['lapis', '瑠璃', 1], ['jade', '翡翠', 1], ['coral', '珊瑚', 1]];
for (const [gm, gn, r] of GEM) {
  C(`${gm}_ring`, `${gn}の指輪`, 'jewelry', 0.02, 60 + r * 60, JW, { [gm]: 1, gold: 0.1 }, 6, { st: 1, r: r + 1, d: 1, use: U('wear', 'gift:求婚の指輪', 'luxury', 'collect'), fx: { beauty: 4 + r * 2, fame: r }, eq: { slot: 'accessory' }, desc: `${gn}を金の台にはめた指輪。` });
  C(`${gm}_pendant`, `${gn}の首飾り`, 'jewelry', 0.08, 90 + r * 80, JW, { [gm]: 2, silver: 0.3 }, 8, { st: 1, r: r + 1, d: 1, use: U('wear', 'gift', 'luxury', 'collect'), fx: { beauty: 5 + r * 2, fame: r + 1 }, eq: { slot: 'accessory' }, desc: `${gn}を銀の鎖に下げた首飾り。` });
}
C('tiara_jewel', '宝石の髪冠', 'jewelry', 0.3, 700, JW, { gold: 1, ruby: 1, sapphire: 1, pearl: 3 }, 40, { st: 1, r: 3, d: 1, use: U('wear:王女と王妃の正装', 'collect:王家の宝物庫'), fx: { beauty: 20, fame: 8 }, eq: { slot: 'head' }, desc: '紅玉と青玉と真珠をちりばめた、王女の髪冠。' });

// ================= 彫像・絵・器（美術品） =================
C('statue', '彫像', 'art', 80, 55, 'mason', { stone: 6 }, 12, { st: 1, r: 1, d: 1, use: U('collect:広場と屋敷の飾り', 'luxury'), fx: { mood: 3, fame: 2 }, desc: '切り石を刻んだ人の背丈ほどの像。' });
C('painting', '絵画', 'art', 4, 45, 'painter', { cloth: 1, planks: 1, dye: 1 }, 8, { st: 1, r: 1, d: 1, use: U('collect:屋敷と教会の飾り', 'luxury', 'gift'), fx: { mood: 3 }, desc: '画家が描いた一枚の絵。飾ると部屋が明るくなる。' });
const ART = [
  ['statue_goddess', '大理石の女神像', { marble: 8 }, 300, 2, 'mason', 120, '大聖堂の職人が刻んだ女神の像。教会に納めると信仰が深まる。', { faith: 5, mood: 3 }],
  ['statue_knight', '青銅の騎士像', { copper: 10, tin: 2 }, 350, 2, 'smith', 150, '英雄の騎士を象った青銅の像。広場の顔になる。', { fame: 5 }],
  ['statue_cat_gold', '黄金の猫の像', { gold: 3 }, 500, 3, JW, 5, 'サハルの王家で守り神とされる黄金の猫。', { luck: 5, fame: 5 }],
  ['statue_jade_dragon', '翡翠の竜の置物', { jade: 5 }, 400, 3, JW, 8, '大きな翡翠から竜を彫り出した置物。', { fame: 5 }],
  ['statue_wood_saint', '木彫りの聖人像', { wood: 2 }, 20, 0, 'carpenter', 5, '村の礼拝堂に置く小さな聖人像。', { faith: 2 }],
  ['statue_clay_horse', '素焼きの馬', { clay: 2 }, 6, 0, 'potter', 2, '子どもの守りに窓辺に置く素焼きの馬。', { mood: 1 }],
  ['painting_landscape', '風景画', { cloth: 1, planks: 1, pigment_set: 1 }, 60, 1, 'painter', 4, '湖と山を描いた風景画。', { mood: 4 }],
  ['painting_religious', '宗教画', { cloth: 2, planks: 2, pigment_set: 1, gold_leaf: 1 }, 150, 2, 'painter', 5, '聖人の奇跡を描いた金地の絵。教会の祭壇に。', { faith: 5, mood: 3 }],
  ['painting_still', '静物画', { cloth: 1, planks: 1, pigment_set: 1 }, 40, 1, 'painter', 3, '果物と杯を描いた静かな絵。', { mood: 3 }],
  ['painting_battle', '海戦の絵', { cloth: 3, planks: 2, pigment_set: 2 }, 200, 2, 'painter', 6, '昔の海戦を描いた大きな絵。将軍と船長が好む。', { courage: 3, fame: 3 }],
  ['vase_gilded', '金彩の花瓶', { pottery: 2, gold_leaf: 1 }, 80, 1, 'potter', 5, '金で縁取った白い花瓶。花を生けると部屋が華やぐ。', { mood: 3 }],
  ['vase_desert_blue', '砂漠の青い壺', { pottery: 2, lapis: 0.5 }, 60, 1, 'potter', 3, 'サハルの瑠璃色の釉の壺。', { mood: 2 }],
  ['plate_dragon', '竜紋の大皿', { pottery: 3, vermilion: 0.3 }, 70, 1, 'potter', 4, '朱で竜を描いた大皿。宴の卓を飾る。', { fame: 2 }],
  ['candlestick_silver', '銀の燭台', { silver: 2 }, 70, 1, JW, 3, '晩餐の卓を照らす三つ又の銀の燭台。', { fame: 2 }],
  ['goblet_gold', '黄金の杯', { gold: 1 }, 180, 2, JW, 4, '王の乾杯に使う黄金の杯。', { fame: 4 }],
  ['jewelbox', '宝石箱', { planks: 1, silver: 0.5, velvet: 0.5 }, 45, 1, 'carpenter', 3, '内張りに天鵞絨を貼った小箱。装身具をしまう。', { mood: 2 }],
  ['tapestry', '壁掛けの織物', { cloth: 6, dye: 2 }, 120, 1, 'weaver', 3, '王の狩りの場面を織り出した大きな壁掛け。城の冷たい壁を暖める。', { warmth: 2, fame: 3 }],
];
for (const [id, name, from, v, r, by, w, desc, fx] of ART) C(id, name, 'art', w, v, by, from, v / 10, { st: 1, r, d: 1, use: U('collect:飾ると気分が上がる', r >= 2 ? 'luxury:貴族と王族が高く買う' : 'gift', ...(fx.faith ? ['ritual:教会に納める'] : [])), fx, desc });
// 骨董と遺物
const REL = [
  ['ancient_urn', '古代の壺', 3, 70, 1, ['ruins', 'pyramid'], '遺跡から掘り出された、模様の褪せた壺。'],
  ['mural_fragment', '古代の壁画のかけら', 5, 90, 2, ['ruins', 'cave'], '古の洞窟の壁画の一片。守り神の姿が描かれている。'],
  ['ancient_gear', '古代の歯車', 1, 60, 2, ['ruins'], '何に使ったかわからない、錆びない金属の歯車。'],
  ['ancient_core', '古代の魔導核', 2, 400, 3, ['ruins'], '古王国の魔導具の心臓部。まだかすかに脈打つ。'],
  ['stone_tablet', '碑文の石板', 20, 80, 2, ['ruins', 'pyramid'], '古い文字がびっしり刻まれた石板。古語辞典で読める。'],
  ['seal_key', '封印の鍵', 0.3, 300, 3, ['ruins', 'demoncastle'], '何かの封印を解く、骨でできた鍵。'],
  ['sword_hilt', '古い剣の柄', 0.5, 40, 1, ['dungeon', 'ruins'], '刃は失われ、宝石の柄だけが残る。'],
  ['lost_royal_seal', '失われた王家の印章', 0.4, 500, 3, ['ruins'], '滅んだ王家の印章。持つ者が王位を名乗った例もある。'],
  ['singing_shell', '歌う大貝', 1, 150, 2, ['dungeon', 'beach'], '耳に当てると、遠い海の歌が聞こえる大きな貝。'],
  ['demonlord_horn', '魔王の角', 10, 2000, 4, ['demoncastle'], '討たれた魔王の角。王家が戦勝の証として飾る。'],
  ['hero_helm_crest', '勇者の兜の飾り', 0.5, 800, 4, ['demoncastle', 'ruins'], '昔の勇者の兜についていた金の羽根飾り。'],
  ['canopic_jar', '墓守の壺', 2, 80, 2, ['pyramid'], 'ピラミッドの王の臓物を収めた壺。ネフェル族は返してほしがる。'],
  ['golden_scarab', '黄金の甲虫の護り', 0.1, 150, 2, ['pyramid'], '砂の古王国の、再生を願う黄金の甲虫。'],
  ['ancient_armor_piece', '古代の鎧のかけら', 3, 50, 1, ['dungeon', 'ruins'], '古代の騎士の肩当て。修理すれば飾れる。'],
  ['pirate_chest', '海賊の宝箱', 8, 200, 2, ['dungeon', 'beach'], '錆びた錠の宝箱。中身は古い金貨と宝石。'],
  ['crystal_skull', '水晶の髑髏', 3, 900, 4, ['ruins'], '水晶を削った髑髏。誰が作ったのか、学者たちも答えを出せない。'],
];
for (const [id, name, w, v, r, on, desc] of REL) relic(id, name, 'relic', w, v, r, on, 0.02 / r, U('collect:骨董として飾る', 'trade:王家の宝物庫と好事家が買う', ...(r >= 2 ? ['magic:学者と魔法使いの研究'] : []), ...(id === 'canopic_jar' || id === 'stone_tablet' ? ['quest'] : [])), desc, { fame: r * 2 });
I('antique', '骨董・古文書', 'relic', 2, 70, { st: 1, r: 2, d: 1, lim: 'relic', src: [loot(D, 0.08), trade()], use: U('collect:貴族の収集', 'magic:学者の研究', 'trade:競売'), fx: { fame: 2 }, desc: '遺跡から出た、名の知れない古い品々。' });
I('coin', '古代の硬貨', 'coin', 0.02, 25, { st: 50, r: 2, d: 1, lim: 'relic', src: [loot(D, 0.1), g('dig', ['ruins', 'field'], 0.01)], use: U('collect:古銭集め', 'magic:学者の研究'), fx: { fame: 1 }, desc: '畑や遺跡から出てくる古い硬貨。' });
export default B.list;
