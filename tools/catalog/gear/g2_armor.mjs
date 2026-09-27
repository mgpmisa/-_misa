// 防具（gear2.js）
import { add, r, CR, LOOT, TR, uWear, uMelt } from './g0_common.mjs';
import { Q } from './g1_weapons.mjs';

const F = 'gear2';
const AM = {
  bronze: { n: '青銅', m: 0.8, vm: 0.8, wm: 1.1, d: 0.8, rare: 0, dem: 1, ing: 'bronze', t: 0.9 },
  iron: { n: '鉄', m: 1, vm: 1, wm: 1, d: 1, rare: 0, dem: 2, ing: 'iron', t: 1 },
  steel: { n: '鋼', m: 1.25, vm: 1.8, wm: 1, d: 1.3, rare: 1, dem: 1, ing: 'steel', t: 1.4 },
  silver: { n: '銀', m: 0.9, vm: 4, wm: 1.1, d: 0.8, rare: 1, dem: 1, ing: 'silver', t: 1.3, note: '儀式と式典のための輝く防具。' },
  mithril: { n: 'ミスリル', m: 1.5, vm: 12, wm: 0.5, d: 1.8, rare: 2, dem: 1, ing: 'mithril', t: 2, note: '重さは鉄の半分で、錆びない。' },
  adamantite: { n: 'アダマンタイト', m: 1.75, vm: 24, wm: 1.3, d: 3, rare: 3, dem: 1, ing: 'adamantite', t: 3, note: 'どんな刃も通さないが、とても重い。' },
  dragon: { n: '竜鱗', m: 1.9, vm: 26, wm: 0.8, d: 2.6, rare: 3, dem: 1, ing: 'scale', t: 3, note: '竜の鱗を綴じた防具。火を通さない。' },
};
const SH = [
  { k: 'kettlehat', n: '鍋兜', slot: 'head', def: 1, i: 1, w: 1.5, v: 12, desc: 'つばの広い鍋のような兜。兵士に多い。' },
  { k: 'helm', n: '兜', slot: 'head', def: 2, i: 1, lt: 1, w: 2, v: 20, desc: '頭をすっぽり覆う兜。' },
  { k: 'coif', n: '鎖頭巾', slot: 'head', def: 1, i: 1, w: 1.5, v: 18, desc: '鎖を編んだ頭巾。兜の下にもかぶる。' },
  { k: 'barbute', n: '面頬付き兜', slot: 'head', def: 2, i: 2, lt: 1, w: 2.5, v: 35, desc: '顔の前まで覆う兜。' },
  { k: 'greathelm', n: '大兜', slot: 'head', def: 3, i: 2, lt: 1, w: 3.5, v: 45, desc: '桶のように頭を包む騎士の兜。' },
  { k: 'chainmail', n: '鎖かたびら', slot: 'armor', def: 6, i: 3, w: 12, v: 70, desc: '小さな輪を何万も編んだ鎧。' },
  { k: 'scalemail', n: '鱗鎧', slot: 'armor', def: 7, i: 4, lt: 1, w: 14, v: 85, desc: '小さな板を魚の鱗のように革に綴じた鎧。' },
  { k: 'breastplate', n: '胸当て', slot: 'armor', def: 5, i: 3, lt: 1, w: 8, v: 60, desc: '胸と背中だけを守る軽い鎧。' },
  { k: 'brigandine', n: '鋲打ち鎧', slot: 'armor', def: 7, i: 3, lt: 2, w: 11, v: 80, desc: '布の裏に鉄の小板を鋲で留めた鎧。' },
  { k: 'halfplate', n: '半身鎧', slot: 'armor', def: 8, i: 4, lt: 1, w: 15, v: 110, desc: '上半身を板金で、脚を鎖で守る鎧。' },
  { k: 'platearmor', n: '板金鎧', slot: 'armor', def: 10, i: 6, lt: 2, w: 20, v: 150, desc: '全身を板金で覆う騎士の鎧。重い。' },
  { k: 'buckler', n: '小盾', slot: 'shield', def: 2, i: 1, w: 1.5, v: 14, desc: '拳で握る小さな丸い盾。' },
  { k: 'roundshield', n: '丸盾', slot: 'shield', def: 4, i: 2, w: 4, v: 45, desc: '腕に通して構える丸い盾。' },
  { k: 'heatershield', n: '紋章盾', slot: 'shield', def: 4, i: 2, wd: 1, w: 3.5, v: 50, desc: '家の紋章を描く逆三角の盾。' },
  { k: 'kiteshield', n: '凧形の盾', slot: 'shield', def: 5, i: 2, wd: 1, w: 5, v: 55, desc: '脚まで守る縦長の盾。' },
  { k: 'towershield', n: '大盾', slot: 'shield', def: 7, i: 4, wd: 2, w: 10, v: 90, desc: '身を隠せるほど大きな盾。動きが鈍る。' },
  { k: 'gauntlets', n: '籠手', slot: 'hands', def: 1, i: 1, lt: 1, w: 1.5, v: 20, desc: '手と手首を守る金属の手袋。' },
  { k: 'greaves', n: 'すね当て', slot: 'feet', def: 1, i: 1, lt: 1, w: 2, v: 18, desc: '脛を守る金属の当て物。' },
  { k: 'sabatons', n: '鎧靴', slot: 'feet', def: 1, i: 1, lt: 1, w: 2, v: 20, desc: '足の甲まで板金で覆った靴。' },
];
const ONLY = {
  bronze: ['kettlehat', 'helm', 'coif', 'barbute', 'chainmail', 'scalemail', 'breastplate', 'buckler', 'roundshield', 'kiteshield', 'gauntlets', 'greaves', 'sabatons'],
  silver: ['helm', 'greathelm', 'breastplate', 'platearmor', 'heatershield', 'gauntlets'],
  dragon: ['helm', 'barbute', 'greathelm', 'scalemail', 'breastplate', 'brigandine', 'halfplate', 'platearmor', 'buckler', 'roundshield', 'heatershield', 'kiteshield', 'towershield', 'gauntlets', 'greaves', 'sabatons'],
};
const EXIST = { iron: { chainmail: ['chainmail', '鎖かたびら'], platearmor: ['platearmor', '板金鎧'], roundshield: ['ironshield', '鉄の盾'] }, dragon: { scalemail: ['scalearmor', '竜鱗の鎧'] } };
const QSH = ['chainmail', 'breastplate', 'platearmor', 'helm', 'roundshield', 'kiteshield', 'gauntlets'];

function metalArmor(mk, s, q) {
  const M = AM[mk];
  const ex = EXIST[mk]?.[s.k];
  const base = ex ? ex[0] : `${mk}_${s.k}`;
  const id = q ? `${base}_${q.k}` : base;
  const bname = ex ? ex[1] : `${M.n}の${s.n}`;
  const name = q ? q.n + bname : bname;
  let def = Math.max(1, Math.round(s.def * M.m * (q ? q.m : 1)));
  let v = r(s.v * M.vm * (q ? q.vm : 1));
  const from = { [M.ing]: s.i };
  if (s.lt) from.leather = s.lt;
  if (s.wd) from.wood = s.wd;
  let makeFrom = from;
  if (id === 'scalearmor') { def = 16; v = 450; makeFrom = { scale: 3, leather: 2 }; }
  if (id === 'chainmail' || id === 'platearmor') makeFrom = { iron: s.i };
  if (id === 'ironshield') makeFrom = { iron: 2 };
  const src = [CR];
  if (['bronze', 'iron', 'steel'].includes(mk) && q?.k !== 'master') src.push(LOOT(q?.k === 'crude' ? 0.06 : 0.02, ['dungeon', 'ruins']));
  if (['mithril', 'adamantite', 'dragon'].includes(mk) || q?.k === 'master') src.push(LOOT(0.004, ['dungeon', 'demoncastle']));
  const use = [uWear(s.slot === 'shield' ? '盾として構える' : '身を守る'), uMelt, { k: 'trade' }];
  if (mk === 'dragon') use[1] = { k: 'craft', note: 'ほどいて鱗を取り直す' };
  if (mk === 'silver') use.push({ k: 'ritual', note: '式典・戴冠式' }, { k: 'luxury' });
  if (q?.k === 'master' || M.rare >= 2) use.push({ k: 'collect', note: '名品として飾る' }, { k: 'gift' });
  if (s.k === 'heatershield') use.push({ k: 'collect', note: '家の紋章を描いて広間に飾る' });
  const rare = q ? (q.k === 'master' ? Math.min(4, M.rare + 2) : q.k === 'fine' ? Math.max(M.rare, 1) : M.rare) : M.rare;
  const eq = { slot: s.slot, def, dur: r(M.d * (q ? q.d : 1), 2), kg: r(s.w * M.wm, 1) };
  if (s.k === 'towershield' || s.k === 'platearmor') eq.slow = 1;
  if (mk === 'dragon') eq.fire = 1;
  add(F, {
    id, name, sub: s.slot === 'shield' ? 'shield' : s.slot === 'armor' ? 'armor_' + (s.k === 'chainmail' || s.k === 'coif' ? 'chain' : s.k === 'scalemail' ? 'scale' : 'plate') : s.slot,
    w: r(s.w * M.wm, 2), v, rare, demand: q ? q.dem : M.dem, src, use,
    make: { from: makeFrom, by: 'armorer', t: r((4 + s.i * 3) * M.t * (q ? q.t : 1), 1) }, eq,
    desc: (q ? q.desc : s.desc) + (M.note && !q ? M.note : ''),
  });
}

// 革・毛皮の防具
const LM = {
  leather: { n: '革', m: 1, vm: 1, ing: 'leather', rare: 0, dem: 2 },
  hide: { n: '毛皮', m: 0.9, vm: 1, ing: 'hide', rare: 0, dem: 1, note: '寒さに強い。' },
  boar: { n: '猪革', m: 1.1, vm: 1.2, ing: 'boar_hide', rare: 0, dem: 1, note: '分厚く、枝や棘を通さない。' },
  wolf: { n: '狼革', m: 1.05, vm: 1.3, ing: 'wolf_hide', rare: 0, dem: 1, note: 'しなやかで音を立てない。' },
  bear: { n: '熊革', m: 1.25, vm: 1.8, ing: 'bear_hide', rare: 1, dem: 1, note: '熊の分厚い革。寒さにも強い。' },
  tiger: { n: '虎革', m: 1.3, vm: 3, ing: 'tiger_hide', rare: 1, dem: 1, note: '縞模様の見事な革。勇者の証。' },
  croc: { n: '鰐革', m: 1.45, vm: 2.5, ing: 'croc_hide', rare: 1, dem: 1, note: '鱗のある硬い革。水に強い。' },
  wyvern: { n: 'ワイバーン革', m: 1.9, vm: 8, ing: 'wyvern_hide', rare: 2, dem: 1, note: '飛竜の革。軽く、矢を弾く。' },
};
const LS = [
  { k: 'cap', n: '帽子', slot: 'head', def: 1, lt: 1, w: 0.5, v: 6 },
  { k: 'armor', n: '鎧', slot: 'armor', def: 3, lt: 2, w: 8, v: 25 },
  { k: 'hardarmor', n: '煮固め鎧', slot: 'armor', def: 4, lt: 3, w: 9, v: 35, pre: 1 },
  { k: 'gloves', n: '籠手', slot: 'hands', def: 1, lt: 1, w: 0.5, v: 8 },
  { k: 'boots', n: '長靴', slot: 'feet', def: 1, lt: 2, w: 1.5, v: 12 },
  { k: 'shield', n: '張りの盾', slot: 'shield', def: 2, lt: 1, wd: 2, w: 3, v: 18 },
];
function leatherArmor(mk, s, q) {
  const M = LM[mk];
  const exist = mk === 'leather' && s.k === 'armor';
  const base = exist ? 'leatherarmor' : `${mk}_${s.k}`;
  const id = q ? `${base}_${q.k}` : base;
  const bname = exist ? '革鎧' : s.k === 'hardarmor' ? `煮固めた${M.n}の鎧` : s.k === 'shield' ? `${M.n}張りの盾` : `${M.n}の${s.n}`;
  const from = { [M.ing]: s.lt };
  if (s.wd) from.wood = s.wd;
  add(F, {
    id, name: q ? q.n + bname : bname, sub: s.slot === 'armor' ? 'armor_leather' : s.slot === 'shield' ? 'shield' : s.slot,
    w: s.w, v: r(s.v * M.vm * (q ? q.vm : 1)), rare: q?.k === 'master' ? 2 : M.rare, demand: q ? q.dem : M.dem,
    src: [CR, ...(mk === 'leather' ? [LOOT(0.03, ['dungeon', 'ruins'])] : [])],
    use: [uWear(s.slot === 'shield' ? '盾として構える' : '身を守る'), { k: 'trade' }, ...(s.k === 'boots' ? [{ k: 'tool', note: 'ぬかるみや雪の道を歩く' }] : [])],
    make: { from: exist ? { leather: 2 } : from, by: 'leatherworker', t: r((2 + s.lt * 2) * (q ? q.t : 1), 1) },
    eq: { slot: s.slot, def: Math.max(1, Math.round(s.def * M.m * (q ? q.m : 1))), dur: r(0.85 * (1 + (M.m - 1)) * (q ? q.d : 1), 2), kg: s.w, ...(mk === 'hide' || mk === 'bear' ? { warm: 1 } : {}) },
    desc: (q ? q.desc : '') + (M.note || '') + (s.k === 'hardarmor' ? '蝋で煮て固めた硬い革。' : ''),
  });
}

export function genArmor() {
  for (const mk of Object.keys(AM)) for (const s of SH) if (!ONLY[mk] || ONLY[mk].includes(s.k)) metalArmor(mk, s);
  for (const mk of ['iron', 'steel']) for (const sk of QSH) for (const q of Q) metalArmor(mk, SH.find((x) => x.k === sk), q);
  for (const mk of Object.keys(LM)) for (const s of LS) leatherArmor(mk, s);
  for (const q of Q) leatherArmor('leather', LS[1], q);

  // 布の防具・木の盾
  const CL = [
    ['gambeson', '刺し子の鎧', 'armor', 2, { linen: 3, wool: 2 }, 3, 14, 2, 'armorer', '布を何枚も重ねて縫った綿入れの鎧。鎖かたびらの下にも着る。'],
    ['paddedcoif', '綿入れ頭巾', 'head', 1, { linen: 1, wool: 1 }, 0.4, 4, 1, 'tailor', '兜の下にかぶる詰め物入りの頭巾。'],
    ['paddedmittens', '刺し子の手甲', 'hands', 1, { linen: 1 }, 0.3, 3, 1, 'tailor', '布を重ねて縫った手甲。'],
    ['silkarmor', '蜘蛛絹の鎧下', 'armor', 3, { spidersilkcloth: 3 }, 1.5, 120, 1, 'tailor', '大蜘蛛の糸で織った布の鎧。矢が刺さりにくい。'],
    ['mageguardcoat', '護りの縫い取りの上着', 'armor', 3, { woolcloth: 2, magicstone: 1 }, 1.5, 90, 1, 'tailor', '魔法の文字を縫い取った上着。呪文を少し弾く。'],
  ];
  for (const [id, name, slot, def, from, w, v, dem, by, desc] of CL) add(F, { id, name, sub: slot === 'armor' ? 'armor_cloth' : slot, w, v, rare: v > 80 ? 1 : 0, demand: dem,
    src: [CR], use: [uWear('身を守る'), { k: 'trade' }], make: { from, by, t: r(2 + v / 8, 1) }, eq: { slot, def, dur: 0.6, kg: w }, desc });
  const WS = [
    ['shield', '木の盾', 2, { wood: 2 }, 3, 15, 2, '板を張り合わせた簡素な盾。'],
    ['wickershield', '枝編みの盾', 1, { willow: 3 }, 1.5, 3, 1, '柳の枝を編んだ軽い盾。農民の自衛に。'],
    ['pavise', '置き盾', 5, { wood: 4, iron: 1, leather: 1 }, 12, 40, 1, '地面に立てて弩兵が身を隠す大きな盾。'],
    ['oakshield', '樫の丸盾', 3, { oak: 2, iron: 1 }, 4.5, 22, 1, '鉄の縁を付けた樫の丸盾。'],
    ['trainingshield', '稽古用の盾', 1, { wood: 1, leather: 1 }, 2, 6, 1, '剣の稽古で使う、布を張った木の盾。'],
  ];
  for (const [id, name, def, from, w, v, dem, desc] of WS) add(F, { id, name, sub: 'shield', w, v, demand: dem, src: [CR],
    use: [uWear('盾として構える'), { k: 'fuel', note: '壊れたら薪になる' }], make: { from, by: 'carpenter', t: r(2 + v / 8, 1) }, eq: { slot: 'shield', def, dur: 0.75, kg: w }, desc });

  // 民族の防具
  const TA = [
    ['barkarmor', '木の皮の鎧', 'armor', 2, { bark: 4, vine: 2 }, 4, 6, ['forest', 'dense'], '厚い木の皮を蔓で綴じた森の民の鎧。'],
    ['bonearmor', '骨の鎧', 'armor', 4, { bone: 8, sinew: 2 }, 7, 18, ['tundra', 'snow'], '獣の骨を並べて綴じた鎧。'],
    ['furparka', '雪原の民の毛皮の上着', 'armor', 2, { hide: 3, sinew: 1 }, 4, 20, ['snow', 'tundra'], '毛を内側にして縫った、極寒でも凍えない上着。'],
    ['featherheaddress', '羽根の頭飾り', 'head', 0, { feather: 20, leather: 1 }, 0.3, 30, ['jungle', 'savanna'], '勇者だけが許される、色とりどりの羽根の冠。'],
    ['rattanshield', '藤編みの盾', 'shield', 3, { rattan: 4 }, 2, 8, ['jungle', 'swamp'], '籐をきつく編んだ軽く丈夫な盾。'],
    ['beastmask', '獣面の兜', 'head', 2, { bear_skull: 1, hide: 1 }, 1.5, 25, ['forest', 'mountain'], '熊の頭骨をそのままかぶる兜。敵を怯ませる。'],
    ['crocscaleshirt', '鰐鱗の胴着', 'armor', 5, { croc_hide: 3 }, 6, 55, ['swamp'], '沼の民が鰐の背の鱗で作る胴着。'],
    ['hideshield', '牛皮の大盾', 'shield', 3, { hide: 2, wood: 2 }, 4, 12, ['savanna', 'grass'], '牛の皮を張った大きな楕円の盾。'],
    ['woodenmask', '祭りの木面', 'head', 1, { wood: 1, dye: 1 }, 0.6, 15, ['jungle', 'forest'], '魔物を模した木彫りの面。祭りと戦で着ける。'],
    ['turtleshell', '大亀の甲羅の盾', 'shield', 5, { turtle_shell: 1, leather: 1 }, 5, 40, ['beach', 'sea'], '大海亀の甲羅を盾にしたもの。'],
    ['shellarmor', '貝殻の胸当て', 'armor', 3, { shell: 12, sinew: 2 }, 4, 22, ['beach', 'sea'], '大きな貝殻を並べた海の民の胸当て。'],
    ['desertveil', '砂の民の覆面と頭布', 'head', 0, { cottoncloth: 2 }, 0.3, 6, ['desert'], '砂嵐から顔を守る長い布。'],
    ['quiltedrobe', '砂の民の綿入れ長衣', 'armor', 2, { cottoncloth: 4 }, 2.5, 18, ['desert'], '昼の熱と夜の寒さをしのぐ厚い長衣。刃も通しにくい。'],
    ['snowgoggles', '骨の雪眼鏡', 'head', 0, { bone: 1, sinew: 1 }, 0.05, 4, ['snow', 'tundra'], '細い切れ目から覗く骨の眼鏡。雪の照り返しで目を傷めない。'],
    ['warpaint', '戦化粧の顔料', 'accessory', 0, { ochre: 1, fat: 1 }, 0.1, 2, ['jungle', 'savanna'], '戦の前に顔に塗る赤い顔料。勇気が湧く。'],
    ['sacrificialrobe', '生贄の白衣', 'armor', 0, { linen: 3 }, 0.8, 30, ['jungle', 'mountain'], '魔物に捧げられる者が着る白い衣。村の祭司が縫う。'],
    ['shamanmask', '呪い師の面', 'head', 1, { wood: 1, feather: 5, magicstone: 1 }, 0.8, 80, ['jungle', 'swamp', 'tundra'], '村の呪い師が魔物と語るときにかぶる面。'],
    ['bearcloak', '熊の毛皮の頭巾外套', 'armor', 3, { bear_hide: 2 }, 6, 45, ['forest', 'snow'], '熊の頭をかぶったまま背にまとう戦士の外套。'],
  ];
  for (const [id, name, slot, def, from, w, v, on, desc] of TA) add(F, { id, name, sub: 'tribal_armor', w, v, rare: v >= 40 ? 1 : 0, demand: 1,
    src: [TR(on), CR], use: [uWear(def ? '身を守る' : '身に着ける'), { k: /生贄|祭|呪い師|頭飾り|戦化粧/.test(name) ? 'ritual' : 'trade', note: /生贄|祭|呪い師/.test(name) ? '村の祭りと儀式' : undefined }, { k: 'collect', note: '異郷の珍しい品' }],
    make: { from, by: 'tribal_crafter', t: r(2 + v / 8, 1) }, eq: { slot, def, dur: 0.8, kg: w, ...(id === 'furparka' || id === 'bearcloak' ? { warm: 2 } : {}) }, desc });

  // 魔法の防具（宝箱から）
  const MA = [
    ['flamemail', '炎の加護の鎖かたびら', 'armor', 10, 11, 700, 3, { fire: 1 }, '炎の中を歩いても焼けない鎖かたびら。'],
    ['frostplate', '霜の板金鎧', 'armor', 15, 19, 900, 3, { ice: 1 }, '冷気をまとい、触れた敵を凍えさせる。'],
    ['windcloak', '風の外套', 'armor', 5, 1, 520, 3, { dodge: 1 }, '風が矢をそらす外套。'],
    ['shadowcloak', '影の外套', 'armor', 4, 1, 560, 3, { stealth: 1 }, '闇にまぎれて姿が見えにくくなる外套。'],
    ['holyplate', '聖騎士の白銀鎧', 'armor', 17, 16, 1200, 3, { holy: 1, undead: 1 }, '祈りを込めて鍛えた白い鎧。'],
    ['archmagerobe', '大魔導士のローブ', 'armor', 7, 1.5, 1100, 3, { mag: 6 }, '星々を縫い取った青いローブ。'],
    ['thornarmor', '茨の鎧', 'armor', 11, 13, 620, 3, { thorns: 1 }, '打ちかかった者に棘が返る鎧。'],
    ['regenmail', '癒しの鎖かたびら', 'armor', 9, 11, 800, 3, { regen: 1 }, '着ているあいだ、傷が少しずつ癒える。'],
    ['dragonkingarmor', '竜王の鎧', 'armor', 24, 18, 3500, 4, { fire: 1, dragon: 1 }, '竜の王の鱗で作られた伝説の鎧。', 1],
    ['heroshield', '勇者の盾', 'shield', 12, 5, 2400, 4, { holy: 1 }, '魔王の炎を防いだという青い盾。', 1],
    ['mirrorshield', '鏡の盾', 'shield', 8, 4, 900, 3, { reflect: 1 }, '呪文を跳ね返す、鏡のように磨かれた盾。'],
    ['giantshield', '巨人の大盾', 'shield', 11, 14, 700, 3, { slow: 1 }, '岩のように重い巨人の盾。'],
    ['spiritshield', '精霊の小盾', 'shield', 6, 1, 480, 2, { mag: 2 }, '精霊が宿る小さな盾。'],
    ['crownhelm', '王者の兜', 'head', 6, 2, 1500, 4, { command: 1 }, '初代の王がかぶった金の兜。兵の士気が上がる。', 1],
    ['seerhood', '千里眼の頭巾', 'head', 2, 0.3, 450, 2, { sight: 1 }, '遠くの魔物の気配がわかる頭巾。'],
    ['ironwillhelm', '不屈の兜', 'head', 5, 2.5, 520, 3, { fear: 0 }, '恐れを知らなくなる兜。'],
    ['strengthgauntlets', '剛力の籠手', 'hands', 3, 1.5, 700, 3, { str: 2 }, 'はめると大岩も持ち上げられる。持てる重さが増える。'],
    ['thiefgloves', '盗賊の手袋', 'hands', 1, 0.1, 400, 2, { lockpick: 1 }, 'どんな鍵も開けられるという黒い手袋。'],
    ['swiftboots', '俊足の長靴', 'feet', 2, 1, 520, 2, { speed: 1.3 }, '履くと風のように走れる長靴。'],
    ['levitateboots', '浮遊の靴', 'feet', 1, 0.5, 800, 3, { float: 1 }, '水の上や沼の上を歩ける靴。'],
    ['bootsofthesnow', '雪渡りの靴', 'feet', 1, 1, 300, 2, { snow: 1 }, '深い雪にも沈まない靴。'],
    ['demonplate', '魔将の黒鎧', 'armor', 18, 20, 1300, 3, { dark: 1 }, '魔王軍の将が着ていた黒い鎧。'],
    ['pharaohmask', '黄金の死者の仮面', 'head', 3, 1.5, 1800, 3, { undead: 1 }, '砂の下の王墓に眠る黄金の仮面をかたどった兜。'],
    ['mermaidmail', '人魚の鱗の胴着', 'armor', 8, 3, 900, 3, { water: 1 }, '水の中で息ができる虹色の胴着。'],
  ];
  for (const [id, name, slot, def, w, v, rare, ex, desc, relic] of MA) add(F, { id, name, sub: 'magic_' + slot, w, v, rare, demand: 1, ...(relic ? { limit: 'relic' } : {}),
    src: [LOOT(relic ? 0.0005 : rare >= 3 ? 0.003 : 0.01, id === 'pharaohmask' ? ['pyramid'] : id === 'mermaidmail' ? ['ruins', 'sea'] : ['dungeon', 'ruins', 'demoncastle'])],
    use: [uWear('魔法の防具'), { k: 'magic' }, { k: 'trade', note: '王族や貴族が高く買う' }, { k: 'collect' }],
    eq: { slot, def, dur: relic ? 20 : 3, kg: w, ...ex }, desc });
}
