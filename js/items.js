// アイテム：武器・防具・装身具・道具・素材・消耗品・宝物
// 一人ひとりが所持品（inv）と装備（eq）を持つ。品質（q）が性能と値段を左右する。

export const ITEMS = {
  // 武器（atk：攻撃力）
  dagger:     { name: '短剣',     type: 'weapon', atk: 4,  value: 15,  mat: { iron: 1 } },
  sword:      { name: '剣',       type: 'weapon', atk: 8,  value: 40,  mat: { iron: 2 } },
  longsword:  { name: '長剣',     type: 'weapon', atk: 11, value: 75,  mat: { iron: 3 } },
  greatsword: { name: '大剣',     type: 'weapon', atk: 15, value: 130, mat: { iron: 5 } },
  spear:      { name: '槍',       type: 'weapon', atk: 9,  value: 35,  mat: { iron: 1, wood: 2 } },
  axe:        { name: '戦斧',     type: 'weapon', atk: 10, value: 45,  mat: { iron: 2, wood: 1 } },
  mace:       { name: 'メイス',   type: 'weapon', atk: 9,  value: 45,  mat: { iron: 2 } },
  bow:        { name: '弓',       type: 'weapon', atk: 7,  value: 35,  mat: { wood: 2, silk: 1 } },
  staff:      { name: '魔法の杖', type: 'weapon', atk: 9,  value: 60,  mat: { wood: 1, magicstone: 1 } },
  dragonblade:{ name: '竜鱗の剣', type: 'weapon', atk: 22, value: 400, mat: { iron: 3, scale: 2 } },
  holysword:  { name: '聖剣',     type: 'weapon', atk: 30, value: 0,   rare: true },
  // 防具（def：守備力）
  clothes:    { name: '布の服',   type: 'armor',  def: 1,  value: 6,   mat: { cloth: 1 } },
  leatherarmor:{ name: '革鎧',    type: 'armor',  def: 3,  value: 25,  mat: { leather: 2 } },
  chainmail:  { name: '鎖かたびら', type: 'armor', def: 6, value: 70,  mat: { iron: 3 } },
  platearmor: { name: '板金鎧',   type: 'armor',  def: 10, value: 150, mat: { iron: 6 } },
  robe:       { name: '魔導のローブ', type: 'armor', def: 3, value: 55, mat: { cloth: 2, silk: 1 } },
  scalearmor: { name: '竜鱗の鎧', type: 'armor',  def: 16, value: 450, mat: { scale: 3, leather: 2 } },
  shield:     { name: '木の盾',   type: 'shield', def: 2,  value: 15,  mat: { wood: 2 } },
  ironshield: { name: '鉄の盾',   type: 'shield', def: 4,  value: 45,  mat: { iron: 2 } },
  // 装身具
  ring:       { name: '銀の指輪', type: 'accessory', def: 1, value: 60, mat: { gem: 1 } },
  amulet:     { name: '護りの護符', type: 'accessory', def: 3, value: 90, mat: { magicstone: 1 } },
  // 道具（仕事の効率が上がる）
  hoe:        { name: '鍬',       type: 'tool', jobs: ['farmer', 'beekeeper'], value: 10, mat: { iron: 1, wood: 1 } },
  pickaxe:    { name: 'つるはし', type: 'tool', jobs: ['miner', 'mason'], value: 14, mat: { iron: 1, wood: 1 } },
  rod:        { name: '釣り竿',   type: 'tool', jobs: ['fisher', 'sailor', 'captain', 'diver'], value: 8, mat: { wood: 1 } },
  woodaxe:    { name: '木こり斧', type: 'tool', jobs: ['woodcutter', 'charcoal', 'carpenter', 'shipwright'], value: 12, mat: { iron: 1, wood: 1 } },
  hammer:     { name: '金槌',     type: 'tool', jobs: ['smith', 'jeweler'], value: 12, mat: { iron: 1 } },
  needle:     { name: '針と糸',   type: 'tool', jobs: ['tailor', 'weaver', 'cobbler'], value: 5, mat: { iron: 1 } },
  shears:     { name: '毛刈りばさみ', type: 'tool', jobs: ['shepherd', 'rancher'], value: 9, mat: { iron: 1 } },
  // 消耗品
  potion:     { name: '回復薬',   type: 'consumable', heal: 45, value: 12 },
  antidote:   { name: '解毒薬',   type: 'consumable', heal: 15, value: 8 },
  // 素材（魔物や動物から取れる・作れる）
  iron:       { name: '鉄のインゴット', type: 'material', value: 6 },
  leather:    { name: '革',       type: 'material', value: 5 },
  hide:       { name: '毛皮',     type: 'material', value: 6 },
  bone:       { name: '骨',       type: 'material', value: 2 },
  fang:       { name: '牙',       type: 'material', value: 5 },
  jelly:      { name: 'スライムのゼリー', type: 'material', value: 3 },
  silk:       { name: '蜘蛛の糸', type: 'material', value: 8 },
  bandage:    { name: '古い包帯', type: 'material', value: 4 },
  scale:      { name: '竜の鱗',   type: 'material', value: 60 },
  magicstone: { name: '魔石',     type: 'material', value: 30 },
  demoncore:  { name: '魔核',     type: 'material', value: 80 },
  horn:       { name: 'ユニコーンの角', type: 'material', value: 200 },
  feather:    { name: '羽根',     type: 'material', value: 2 },
  herb:       { name: '薬草',     type: 'material', value: 3 },
};
// 宝物（ダンジョンで見つかる）
export const TREASURE_ITEMS = ['古代の金貨', '竜の鱗の首飾り', '魔石の王冠', 'ファラオの黄金仮面', '聖銀の短剣', '星読みの水晶', '古文書', '人魚の涙', '精霊の羽根', '王家の紋章入り指輪'];

// 魔物・動物が落とす素材
export const DROPS = {
  goblin: ['fang', 'bone'], hobgoblin: ['fang', 'bone', 'iron'], goblinlord: ['fang', 'iron', 'magicstone'],
  orc: ['fang', 'hide'], orcking: ['fang', 'iron', 'magicstone'],
  skeleton: ['bone'], skelknight: ['bone', 'iron'], lich: ['bone', 'magicstone', 'magicstone'],
  mummy: ['bandage'], pharaoh: ['bandage', 'magicstone', 'gemx'],
  spider: ['silk'], arachne: ['silk', 'silk', 'magicstone'],
  slime: ['jelly'], bigslime: ['jelly', 'jelly'], kingslime: ['jelly', 'magicstone'],
  wyvern: ['scale', 'fang'], dragon: ['scale', 'scale', 'scale', 'magicstone'],
  imp: ['magicstone'], demonsoldier: ['iron', 'demoncore'], demongeneral: ['demoncore', 'demoncore'], demonlord: ['demoncore', 'demoncore', 'demoncore'],
  unicorn: ['horn'], golem: ['magicstone', 'iron'],
  wolf: ['hide', 'fang'], bear: ['hide', 'fang'], boar: ['hide'], deer: ['hide'], fox: ['hide'], tiger: ['hide', 'fang'], polarbear: ['hide', 'fang'],
  croc: ['hide', 'fang'], snake: ['hide'], rabbit: ['hide'], eagle: ['feather'], crow: ['feather'], owl: ['feather'], parrot: ['feather'],
};

export const QUALITY = (q) => (q < 0.8 ? '粗末な' : q < 1.1 ? '' : q < 1.3 ? '上等な' : q < 1.55 ? '名工の' : '伝説の');

export function makeItem(id, q = 1, extra = {}) {
  return { id, q: Math.round(q * 100) / 100, dur: 1, ...extra };
}
export function itemName(it) {
  if (it.custom) return it.custom;
  const d = ITEMS[it.id];
  if (!d) return it.id;
  return (['weapon', 'armor', 'shield', 'accessory', 'tool'].includes(d.type) ? QUALITY(it.q) : '') + d.name + (it.n > 1 ? `×${it.n}` : '');
}
export function itemValue(it) {
  const d = ITEMS[it.id];
  if (it.custom) return it.value || 100;
  return Math.round((d?.value || 1) * (it.q || 1) * (it.q > 1.5 ? 3 : 1) * (it.n || 1));
}

// 所持品を扱う
export function addItem(p, it) {
  p.inv = p.inv || [];
  const d = ITEMS[it.id];
  if (d && ['material', 'consumable'].includes(d.type)) {
    const same = p.inv.find((x) => x.id === it.id);
    if (same) { same.n = (same.n || 1) + (it.n || 1); return same; }
    it.n = it.n || 1;
  }
  p.inv.push(it);
  if (p.inv.length > 24) p.inv.splice(0, p.inv.length - 24);
  return it;
}
export function countItem(p, id) { return (p.inv || []).filter((x) => x.id === id).reduce((s, x) => s + (x.n || 1), 0); }
export function takeItem(p, id, n = 1) {
  for (const x of p.inv || []) {
    if (x.id !== id) continue;
    const have = x.n || 1;
    if (have > n) { x.n = have - n; return true; }
    p.inv.splice(p.inv.indexOf(x), 1);
    n -= have;
    if (n <= 0) return true;
  }
  return false;
}
// いちばん良い装備を身につける
export function autoEquip(p) {
  p.eq = p.eq || {};
  for (const slot of ['weapon', 'armor', 'shield', 'accessory']) {
    const cands = (p.inv || []).filter((x) => ITEMS[x.id]?.type === slot);
    const score = (x) => ((ITEMS[x.id].atk || 0) + (ITEMS[x.id].def || 0)) * x.q * (((x.dur ?? 1) >= 0.5) ? 1 : 0.6 + (x.dur ?? 1) * 0.8);
    const best = cands.sort((a, b) => score(b) - score(a))[0];
    if (best) p.eq[slot] = best;
  }
  const tool = (p.inv || []).find((x) => ITEMS[x.id]?.type === 'tool' && ITEMS[x.id].jobs.includes(p.job));
  p.eq.tool = tool || null;
}
const wearMul = (it) => { const d = it?.dur ?? 1; return d >= 0.5 ? 1 : 0.6 + d * 0.8; }; // 傷んだ品は性能が落ちる（gear.js と同じ式）
export function equipBonus(p) {
  let atk = 0, def = 0;
  const eq = p.eq || {};
  if (eq.weapon) atk += ITEMS[eq.weapon.id].atk * eq.weapon.q * wearMul(eq.weapon);
  for (const s of ['armor', 'shield', 'accessory']) if (eq[s]) def += (ITEMS[eq[s].id].def || 0) * eq[s].q * wearMul(eq[s]);
  return { atk: Math.round(atk), def: Math.round(def) };
}

// 職業に合わせた最初の持ち物
export function starterKit(p, rng) {
  const q = () => 0.8 + rng.next() * 0.4;
  const kit = {
    knight: ['longsword', 'chainmail', 'ironshield'], soldier: ['spear', 'leatherarmor', 'shield'], guard: ['spear', 'leatherarmor'], gatekeeper: ['spear', 'chainmail'],
    militia: ['spear', 'clothes'], watchman: ['mace', 'leatherarmor'], royalguard: ['longsword', 'platearmor', 'ironshield'], general: ['greatsword', 'platearmor'],
    jailer: ['mace', 'leatherarmor'], adventurer: ['sword', 'leatherarmor', 'potion'], warrior: ['axe', 'chainmail', 'potion'], archer: ['bow', 'leatherarmor', 'potion'],
    cleric: ['mace', 'robe', 'potion', 'potion'], sage: ['staff', 'robe', 'potion'], paladin: ['longsword', 'chainmail', 'ironshield'], guildmaster: ['longsword', 'chainmail'],
    wizard: ['staff', 'robe'], courtmage: ['staff', 'robe', 'amulet'], hunter: ['bow', 'leatherarmor'], thief: ['dagger', 'clothes'], banditchief: ['axe', 'leatherarmor'],
    pirate: ['sword', 'clothes'], king: ['longsword', 'ring', 'amulet'], royal: ['dagger', 'ring'], noble: ['dagger', 'ring'], doctor: ['potion', 'potion', 'antidote'],
  }[p.job] || [];
  for (const id of kit) addItem(p, makeItem(id, q()));
  const tool = Object.entries(ITEMS).find(([, d]) => d.type === 'tool' && d.jobs.includes(p.job));
  if (tool) addItem(p, makeItem(tool[0], q()));
  if (!kit.some((id) => ITEMS[id].type === 'armor')) addItem(p, makeItem('clothes', q()));
  autoEquip(p);
}
