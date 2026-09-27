// 工事の仕組み（開発部）：縄張りから完成まで、目に見える段階を追って建てる
//
// ■ ねらい（社長の許可）
//   今までの工事（開拓・家の建て増し・新しい建物・柵と塀）は、日数がたつと完成した建物が急に現れた。
//   ここでは、どの工事も同じ「普請場（site）」として扱い、次の段階を順に進める。
//     建物：縄張り → 資材集め → 土台 → 骨組み → 壁 → 屋根 → 仕上げ → 完成
//     柵・塀（線の工事）：端から1マスずつ、杭（石）を立てていく
//   ・段階ごとに要る資材（js/catalog の id：wood・stone・iron_nail・planks・rooftile・straw・slakedlime・clay）と手間（人×時間）を決める。
//     大きな建物ほど資材も手間も多い。
//   ・資材は施主が市場で「持ち主から」買う（marketBuy）。買った品は、人夫が背負子・荷車・荷獣で現場の資材置き場まで実際に運ぶ。
//     持てる重さは carry.js の力と入れ物（carryState）で決める。荷が重い人には、現場の手押し車を貸す。
//   ・大工・石工・人夫が現場に通い、朝7時から夕方5時まで働く（昼は、おなかのすいた人から食べに行く）。雨・嵐の日と夜は休む。
//     その段階の資材が現場にそろっていなければ、止まって待つ。職人が町にいなければ、近くの町から呼ぶ。
//   ・建物は、完成するまで種類が「工事現場（site）」になり、住むことも使うこともできない。
//     完成したとき、もとの種類（民家・井戸・礼拝堂・宿屋など）に戻り、地図の上に本物の建物が描かれる。
//   ・二階の建て増し（housing.js）は、住んだまま足場を組んで上に建て増す（建物は使える）。
//
// ■ お金の出どころと行き先（どこからも湧かせない）
//   資材  ：施主（国庫・町の蓄え・世帯の家計）→ 市場の品の持ち主（商人・職人・町）……marketBuy
//           どこの市場にも無い木材・石材は、国庫か町の蓄えが「遠くから取り寄せる」（世界の外へ出る：moneyOut）
//   日当  ：国庫・町の蓄えが施主のときは、働いた時間ぶんを payday.js の owe で「貸し」に積み、給料日に払い手が払う。
//           世帯が施主のとき（二階の建て増し）は、この仕組みが給料日に 施主の家計 → 職人（earn）と払う（flow で帳簿に残す）。
//   開拓団が自分たちの村を建てるとき（開拓の手当は expansion.js が毎日払っている）は、日当は出ない。
//   お金をしまう新しい置き場所は作らない（貸しは人の p.wages か、普請場の site.owe に「額」として持つだけ）。
//
// ■ 本体からの呼び方（部長がつなぐ。くわしくは報告のつなぎ込みスクリプト）
//   constructOptions(sim, p, add) … decide の buildingsOptions のあと（現場へ通う・資材を運ぶ）
//   constructDo(sim, p, dt)        … doAction の buildingsDo のあと（手間を積む・荷を積む／下ろす）
//   constructHourly(sim)           … newHour（段階を進める・雨と夜の休み・止まった理由）
//   constructDaily(sim)            … newDay（資材の買い付け・人集め・給料日・焼け跡の建て直し）
//   各工事の仕組みからは consBegin・consLine・consFence・consExpBuild・consExpHome・consHousing・consPending・consHalt を呼ぶ。
//   画面：constructBuildingHTML・constructTileHTML（詳細欄）、CONS_LABEL など（行動のことば）、見た目は constructgfx.js
//
// ■ 状態（遅延初期化。古いセーブで欠けていても動く）
//   S.cons = { v, seq, ver, sites:{id: 普請場}, haul:[荷を担いで歩いている人], built:{f:[柵のマス], w:[塀のマス]}, frozen:[放り出された建てかけ], debts:[], stats }
//   p.consSite（通っている普請場）・p.consHaul（運んでいる荷）・p.consAnim（仕事の姿）
//   b.type = 'site'（工事現場）、b.futureType（完成したときの種類）、b.uc（普請場の番号）、b.realName（完成したときの名前）
import { T, W, H, walkable, tileAt } from './world.js';
import { JOBS, GOODS, KINGDOMS } from './data.js';
import { marketBuy, acct } from './market.js';
import { owe, isPayday } from './payday.js';
import { flow, income, moneyOut, whoLabel } from './ledger.js';
import { carryState, goodWeight } from './carry.js';
import { matterGood, matterWant } from './matter.js';
import { weatherAt } from './weather.js';
import { restDayFor } from './labor.js';
import { tooDangerous } from './danger.js';
import { earn, houseValue } from './property.js';

// ---------- 段階 ----------
export const STAGES = [
  { k: 'stake', jp: '縄張り', w: 0.05 },
  { k: 'gather', jp: '資材集め', w: 0 },
  { k: 'found', jp: '土台', w: 0.17 },
  { k: 'frame', jp: '骨組み', w: 0.24 },
  { k: 'wall', jp: '壁', w: 0.24 },
  { k: 'roof', jp: '屋根', w: 0.2 },
  { k: 'finish', jp: '仕上げ', w: 0.1 },
  { k: 'done', jp: '完成', w: 0 },
];
export const ST = Object.fromEntries(STAGES.map((s, i) => [s.k, i]));
const DONE = ST.done;
const LINE_JP = { fence: '杭打ち', wall: '石積み' };
const LINE_UNIT = { fence: '本', wall: 'マス' };

// ---------- ui.js に足すことば ----------
export const CONS_LABEL = { construct: '普請場で働いている', haul: '普請の資材を運んでいる' };
export const CONS_GO = { construct: '普請場へ向かっている', haul: '普請の資材を運んでいる' };
export const CONS_PREF = { construct: '普請の仕事', haul: '資材運び' };

// ---------- 数字 ----------
const WORK_H = (h) => h >= 7 && h < 17;          // 朝7時〜夕5時（昼は、おなかがすいた人から食べに行く）
const HALT_WX = new Set(['rain', 'squall', 'storm', 'blizzard', 'sandstorm']);
const SLOW_WX = { snow: 0.7, hot: 0.85, fog: 0.9 };
const WX_JP = { rain: '雨', squall: 'スコール', storm: '嵐', blizzard: '吹雪', sandstorm: '砂嵐' };
const CARP = new Set(['carpenter', 'shipwright']);
const MASON = new Set(['mason', 'miner']);
const LABOR = new Set(['roadworker', 'pioneer', 'woodcutter', 'farmer', 'stablehand', 'charcoal', 'gatherer', 'shepherd', 'porter', 'laborer', 'fisher', 'hunter']);
const CARP_ALT = new Set(['woodcutter', 'charcoal']);        // 大工がいなければ、木を扱い慣れた者が代わる（腕は落ちる）
const MASON_ALT = new Set(['roadworker', 'gravedigger']);               // 石工がいなければ、道普請の人夫や墓掘りが代わる
const NOT_LABOR = new Set(['elder', 'midwife', 'nun', 'nanny', 'keeper', 'militia', 'fortune', 'bard', 'troupe', 'storyteller', 'dancer']);
// 人夫になれる人：力仕事の職、仕事のない大人、身分の低い暮らしの人（日銭の稼ぎになる）
const laborOK = (p) => LABOR.has(p.job) || !p.job || (['commoner', 'homeless', 'wanderer'].includes(JOBS[p.job]?.rank) && !NOT_LABOR.has(p.job) && !(JOBS[p.job]?.combat));
const RATE = { carp: 1.4, mason: 1.3, labor: 1.0 };                         // 1時間の日当（ふつうの日給は約9銅貨）
const ROLE_JP = { carp: '大工', mason: '石工', labor: '人夫' };
const STONE_TYPES = new Set(['church', 'barracks', 'prison', 'granary', 'bank', 'mint', 'library', 'castle', 'mansion', 'bathhouse', 'theater', 'orphanage', 'guardpost', 'fort', 'lighthouse']);
const BIG_TYPES = new Set(['church', 'tavern', 'inn', 'bathhouse', 'library', 'theater', 'granary', 'orphanage', 'genstore', 'tailor', 'apothecary', 'cemetery', 'mansion', 'barracks']);
const BUILDABLE = new Set([T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH]);
const CLEARABLE = new Set([T.FOREST, T.DENSE, T.JUNGLE]);
// 手に入らない資材の代わり（何日待ったら、何で、どれだけ）
const SUB = {
  planks: { to: 'wood', k: 0.5, days: 2, txt: '板材が手に入らず、材木を現場で板に挽いた' },
  rooftile: { to: 'straw', k: 1.3, days: 3, txt: '瓦が手に入らず、藁で葺いた' },
  straw: { to: 'wood', k: 0.4, days: 2, txt: '藁が手に入らず、板で葺いた' },
  clay: { to: 'stone', k: 0.6, days: 2, txt: '粘土が手に入らず、石で積んだ' },
  slakedlime: { to: null, k: 0, days: 3, txt: '漆喰の石灰が手に入らず、漆喰なしで仕上げた' },
  iron_nail: { to: null, k: 0, days: 4, txt: '釘が手に入らず、木の栓で組んだ' },
};
const IMPORT_DAYS = 5;          // 木材・石材がどこにも無いとき、国庫・町の蓄えが遠くから取り寄せるまで待つ日数
const MAT_JP = { wood: '材木', stone: '石材', iron_nail: '釘', planks: '板材', rooftile: '瓦', straw: '藁', slakedlime: '石灰', clay: '粘土' };
const matName = (g) => MAT_JP[g] || GOODS[g]?.name || matterGood(g)?.name || g;
const r1 = (v) => Math.round(v * 10) / 10;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
const alive = (p) => !!p && p.deathYear == null;
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;

// ---------- 状態 ----------
export function ensureCons(sim) {
  const S = sim.S;
  if (!S.cons) S.cons = { v: 1, seq: 1, ver: 0, sites: {}, haul: [], built: { f: [], w: [] }, frozen: [], debts: [], stats: blankStats() };
  const C = S.cons;
  C.sites = C.sites || {}; C.haul = C.haul || []; C.built = C.built || { f: [], w: [] }; C.frozen = C.frozen || []; C.debts = C.debts || [];
  C.stats = { ...blankStats(), ...(C.stats || {}) };
  return C;
}
function blankStats() {
  return { started: 0, done: 0, cancel: 0, byTag: {}, doneTag: {}, daysSum: 0, hauls: 0, kg: 0, byHow: {}, convoy: 0, stallH: {}, wagesOwed: 0, wagesPaid: 0, matCost: 0, imports: 0, importCost: 0, subs: 0, topped: 0, called: 0, tiles: 0 };
}
const bump = (sim) => { sim.S.cons.ver = (sim.S.cons.ver || 0) + 1; };
export function consStats(sim) { return ensureCons(sim).stats; }

// ---------- 各工事の仕組みからの手渡し（expansion.js・housing.js が登録する） ----------
// 登録先は関数に持たせる（モジュールの読み込み順が入れ替わっても、読み込みの途中で呼ばれても使えるように）
export function registerConsAdapter(tag, api) { adapt()[tag] = api; }
function adapt() { return registerConsAdapter._m || (registerConsAdapter._m = {}); }

// ---------- 雨・嵐 ----------
export function consHalt(sim, x, z) {
  let w;
  try { w = weatherAt(sim, x, z); } catch (e) { w = sim.S.weather; }
  return HALT_WX.has(w) ? w : null;
}

// ---------- 資材の見積もり（段階ごと） ----------
function billOf(sim, b, sid) {
  const type = b.futureType || b.type;
  const A = Math.max(1, b.w * b.d) * (b.floors || 1);
  const s = sim.town(b.settlement ?? sid);
  const south = !!KINGDOMS[b.kingdom ?? s?.kingdom]?.south;
  const stoneT = STONE_TYPES.has(type);
  const citied = !!s && (s.type === 'capital' || s.type === 'port' || s.grade === 'town');
  const roofG = south ? 'clay' : (citied || b.roof === 'tile' || stoneT) ? 'rooftile' : 'straw';
  const c = Math.ceil;
  if (type === 'well') return [{}, {}, {}, { wood: 1 }, { stone: 3 }, { wood: 1 }, {}];
  if (type === 'cemetery') return [{}, {}, { stone: c(A * 0.3) }, { wood: c(A * 0.3) }, { stone: c(A * 0.4) }, {}, {}];
  return [
    {},
    {},
    { stone: c(A * 0.8) },
    { wood: c(A * 1.2), iron_nail: c(A / 6) },
    stoneT ? { stone: c(A * 1.0), slakedlime: c(A * 0.2) } : south ? { clay: c(A * 1.2) } : { planks: c(A * 1.0) },
    { wood: c(A * 0.4), [roofG]: c(A * (roofG === 'straw' ? 2 : 1.5)) },
    { planks: c(A * 0.3) },
  ];
}
// 手間（人×時間）：大きな建物ほど多い
function laborOf(b) {
  const type = b.futureType || b.type;
  const A = Math.max(1, b.w * b.d);
  if (type === 'well') return 14;
  const mul = type === 'church' ? 1.8 : STONE_TYPES.has(type) ? 1.5 : BIG_TYPES.has(type) ? 1.25 : type === 'cemetery' ? 0.5 : 1;
  return Math.round(10 * Math.pow(A, 0.9) * mul * (b.floors || 1));
}
function sumBom(bom) { const n = {}; for (const st of bom) for (const [g, q] of Object.entries(st)) n[g] = (n[g] || 0) + q; return n; }
const WALL_H = { house: 1.15, well: 0.5, church: 1.6, tavern: 1.5, mansion: 2.1, barracks: 1.3, prison: 1.5, inn: 1.5 };
export function wallH(type) { return WALL_H[type] ?? 1.3; }

// ---------- 普請場の場所：資材置き場と、働く人の立ち位置 ----------
function ringOf(sim, b) {
  const w = sim.S.world, out = [];
  for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++) {
    if (x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d) continue;
    if (!inb(x, z)) continue;
    const t = w.tiles[z * W + x];
    if (!walkable(t) || t === T.BLD) continue;
    out.push({ x, z, road: t === T.ROAD || t === T.PLAZA, door: x === b.door.x && z === b.door.z });
  }
  return out;
}
function pickYard(sim, b) {
  const ring = ringOf(sim, b);
  const c = ring.filter((q) => !q.door && !q.road)[0] || ring.filter((q) => !q.door)[0] || ring[0];
  if (c) return { x: c.x, z: c.z };
  return { x: b.door.x, z: b.door.z };
}
function standBeside(sim, x, z) {
  const w = sim.S.world;
  for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 2], [2, 0]]) {
    const t = tileAt(w, x + a, z + b);
    if (walkable(t) && t !== T.BLD && t !== T.FENCE && t !== T.WALL) return { x: x + a, z: z + b };
  }
  return { x, z };
}
function headXZ(site) {
  if (site.form === 'line') { const i = site.tiles[Math.min(site.ti, site.tiles.length - 1)]; return { x: i % W, z: (i / W) | 0 }; }
  return { x: site.x + (site.w - 1) / 2, z: site.z + (site.d - 1) / 2 };
}
function workSpot(sim, site, p) {
  if (site.form === 'line') {
    const h = headXZ(site);
    return standBeside(sim, h.x, h.z);
  }
  const b = sim.building(site.b);
  const ring = b ? ringOf(sim, b) : [];
  if (!ring.length) return site.yard;
  const k = site.crew.findIndex((c) => c.id === p.id);
  return ring[((k < 0 ? p.id : k) * 3 + 1) % ring.length];
}
function yardSpot(sim, site) {
  if (site.form === 'line') { const h = headXZ(site); return standBeside(sim, h.x, h.z); }
  return site.yard;
}
function atSite(site, p) {
  const h = headXZ(site);
  const r = site.form === 'line' ? 4 : Math.max(site.w, site.d) / 2 + 3;
  return Math.abs(p.pos.x - h.x) <= r && Math.abs(p.pos.z - h.z) <= r;
}
// 資材を受け取る市場の立ち位置
function pickSpot(sim, sid) {
  const s = sim.town(sid);
  if (!s) return null;
  const m = sim.townBuilding(s, 'market');
  if (m) return { x: m.door.x, z: m.door.z };
  return standBeside(sim, s.x, s.z);
}
// 資材を買う市場：地元 → 同じ国の近い町（遠すぎる町は荷車の隊で届ける）
function marketsFor(sim, site) {
  const w = sim.S.world, s = sim.town(site.sid);
  const out = s && sim.S.towns[s.id] ? [s.id] : [];
  if (!s) return out;
  const h = headXZ(site);
  const near = w.settlements.filter((q) => q.id !== s.id && !q.abandoned && sim.S.towns[q.id] && (q.kingdom === s.kingdom || q.kingdom == null && s.kingdom == null) && !q.tribal)
    .map((q) => ({ q, d: Math.hypot(q.x - h.x, q.z - h.z) })).filter((o) => o.d < 90).sort((a, b) => a.d - b.d).slice(0, 4);
  for (const o of near) out.push(o.q.id);
  return out;
}

// ---------- 施主の財布 ----------
function payerWallet(sim, site) {
  const py = site.payer;
  if (py && typeof py === 'object' && py.hh != null) {
    const hh = sim.S.households[py.hh];
    if (!hh) return null;
    return { get money() { return Math.max(0, hh.money - 20); }, set money(v) { hh.money = v + 20; } };
  }
  const a = acct(sim, py);
  if (!a) return null;
  const floor = String(py)[0] === 'k' ? 30 : 0;
  return { get money() { return Math.max(0, a.money - floor); }, set money(v) { a.money = v + floor; } };
}
function payerLabel(sim, site) {
  const py = site.payer;
  if (py && typeof py === 'object') { const hh = sim.S.households[py.hh]; return hh ? hh.name : '施主'; }
  const s = String(py);
  if (s[0] === 'k') return `${KINGDOMS[+s.slice(1)]?.name || '国'}の国庫`;
  if (s[0] === 't') return `${sim.town(+s.slice(1))?.name || '町'}の蓄え`;
  return '施主';
}
const payerCode = (site) => (site.payer && typeof site.payer === 'object' ? null : site.payer);

// ---------- 普請場を作る ----------
function newSite(sim, o) {
  const C = ensureCons(sim);
  const id = C.seq++;
  const site = {
    id, form: o.form || 'bld', tag: o.tag || 'bld', name: o.name || '普請', sid: o.sid ?? null, k: o.k ?? null, payer: o.payer,
    b: o.b ?? null, x: o.x ?? 0, z: o.z ?? 0, w: o.w ?? 1, d: o.d ?? 1, yard: o.yard || null,
    tiles: o.tiles || null, ti: 0, tp: 0, lk: o.lk || null, tileWork: o.tileWork || 2, tileMat: o.tileMat || null, tileOk: false,
    st: 0, sp: 0, ok: false, acc: 0, work: o.work || 30,
    bom: o.bom || null, need: {}, bought: {}, onsite: {}, used: {}, transit: {}, pend: {}, wait: {}, subs: [], conv: [],
    crew: [], fixed: !!o.fixed, wage: o.wage === 0 ? 0 : (o.wage || RATE), wh: {}, owe: {}, late: {}, paid: 0,
    day0: sim.today, t0: sim.S.t, hours: 0, hauls: 0, kg: 0, stall: null, stallDays: 0, stallH: {}, spent: 0,
    data: o.data || {}, big: !!o.big, called: [],
  };
  if (site.bom) site.need = sumBom(site.bom);
  else if (site.tileMat) { for (const [g, q] of Object.entries(site.tileMat)) site.need[g] = q * site.tiles.length; }
  for (const g of Object.keys(site.need)) { site.bought[g] = 0; site.onsite[g] = 0; site.used[g] = 0; site.transit[g] = 0; }
  C.sites[id] = site;
  C.stats.started++; C.stats.byTag[site.tag] = (C.stats.byTag[site.tag] || 0) + 1;
  bump(sim);
  return site;
}

// 建物の普請を始める：建物はすでに置いてある（土地を押さえてある）。完成までは「工事現場」
//   opt: { tag, sid, k, payer, name?, crew?:[{id,role,pay}], fixed?, wage?, big?, data? }
export function consBegin(sim, b, opt = {}) {
  if (!b || b.uc != null) return null;
  const S = sim.S;
  const sid = opt.sid ?? b.settlement ?? null;
  const real = b.name;
  b.futureType = b.type; b.type = 'site'; b.realName = real; b.name = `${real}（普請中）`;
  const bom = billOf(sim, b, sid);
  const site = newSite(sim, {
    form: 'bld', tag: opt.tag || 'bld', name: real, sid, k: opt.k ?? b.kingdom ?? sim.town(sid)?.kingdom ?? null, payer: opt.payer,
    b: b.id, x: b.x, z: b.z, w: b.w, d: b.d, yard: pickYard(sim, b), bom, work: laborOf(b), fixed: !!opt.fixed, wage: opt.wage, big: opt.big ?? BIG_TYPES.has(b.futureType), data: opt.data || {},
  });
  b.uc = site.id;
  // buildings.js の町ごとの建物の表からは、完成まで外しておく（中に入ったり働き手を雇ったりしない）
  if (S.bld?.at?.[sid] && S.bld.at[sid][b.futureType] === b.id) delete S.bld.at[sid][b.futureType];
  if (opt.crew) setCrew(sim, site, opt.crew);
  else staff(sim, site);
  buyMaterials(sim, site);
  announceStart(sim, site);
  return site;
}
// 線の工事（柵・塀）：opt { lk:'fence'|'wall', tiles, sid, k, payer, name, tag, crew?, fixed?, wage? }
export function consLine(sim, opt) {
  const tiles = (opt.tiles || []).slice();
  if (!tiles.length) return null;
  const lk = opt.lk || 'fence';
  const i0 = tiles[0];
  const site = newSite(sim, {
    form: 'line', tag: opt.tag || lk, lk, name: opt.name || (lk === 'wall' ? '石の塀' : '柵'), sid: opt.sid, k: opt.k, payer: opt.payer, tiles,
    x: i0 % W, z: (i0 / W) | 0, tileWork: lk === 'wall' ? 4 : 1.5, tileMat: lk === 'wall' ? { stone: 2 } : { wood: 1 }, fixed: !!opt.fixed, wage: opt.wage, big: lk === 'wall', data: opt.data || {},
  });
  if (opt.crew) setCrew(sim, site, opt.crew); else staff(sim, site);
  buyMaterials(sim, site);
  announceStart(sim, site);
  return site;
}
// その町で、この種類の建物を普請しているか（二重に建てないため）
export function consPending(sim, sid, type) {
  const C = sim.S.cons;
  if (!C) return false;
  for (const s of Object.values(C.sites)) { if (s.sid !== sid || s.b == null) continue; const b = sim.building(s.b); if (b && b.futureType === type) return true; }
  return false;
}
// その世帯のための家を普請しているか
export function consWaiting(sim, hhId) {
  const C = sim.S.cons;
  if (!C) return false;
  for (const s of Object.values(C.sites)) if (s.data?.hh === hhId) return true;
  return false;
}
export function consSiteOf(sim, b) { const C = sim.S.cons; return C && b?.uc != null ? C.sites[b.uc] || null : null; }

// ---------- 人集め ----------
let poolCache = { t: -1, S: null, by: null };
function poolOf(sim, sid) {
  if (poolCache.t !== sim.today || poolCache.S !== sim.S) {
    const by = {};
    for (const p of sim.living()) {
      if (!p.needs || p.jail != null || p.mission || p.quest || p.party != null || p.expProj != null || p.consSite != null) continue;
      const a = sim.ageOf(p);
      if (a < 16 || a > 64 || !sim.hh(p)) continue;
      if (['king', 'royal', 'noble', 'knight'].includes(p.rank)) continue;
      (by[p.s] || (by[p.s] = [])).push(p);
    }
    poolCache = { t: sim.today, S: sim.S, by };
  }
  return (poolCache.by[sid] || []).filter((p) => p.consSite == null && alive(p));
}
const roleOfJob = (job) => (CARP.has(job) ? 'carp' : MASON.has(job) ? 'mason' : LABOR.has(job) || !job ? 'labor' : null);
function crewTarget(site) {
  if (site.form === 'line') return site.lk === 'wall' ? { carp: 0, mason: 2, labor: 2 } : { carp: 0, mason: 0, labor: 3 };
  const A = site.w * site.d;
  if (site.tag === 'expand2f') return { carp: 1, mason: 1, labor: 0 };
  if (A <= 2) return { carp: 1, mason: 0, labor: 1 };
  if (A <= 4) return { carp: 1, mason: 1, labor: 1 };
  if (A <= 9) return { carp: 1, mason: 1, labor: 2 };
  return { carp: 2, mason: 2, labor: 2 };
}
function setCrew(sim, site, list, steal = false) {
  const S = sim.S;
  const keep = new Set(list.map((c) => c.id));
  for (const c of site.crew) if (!keep.has(c.id)) { const p = S.people[c.id]; if (p && p.consSite === site.id) p.consSite = null; }
  site.crew = [];
  for (const c of list) {
    const p = S.people[c.id];
    if (!alive(p)) continue;
    const other = p.consSite != null && p.consSite !== site.id ? S.cons.sites[p.consSite] : null;
    if (other) { if (!steal) continue; other.crew = other.crew.filter((x) => x.id !== p.id); }
    p.consSite = site.id;
    site.crew.push({ id: p.id, role: c.role || roleOfJob(p.job) || 'labor', pay: c.pay !== false && site.wage !== 0 });
  }
}
// 住まいから現場までの道のり（毎日通える人を雇う）
function homeDist(sim, p, h) { const b = sim.building(sim.hh(p)?.house); const q = b ? b.door : p.pos; return Math.hypot(q.x - h.x, q.z - h.z); }
function validCrew(sim, site, p) { return alive(p) && p.jail == null && !p.mission && p.expedition == null && sim.isAdult(p) && (site.fixed || p.expProj == null); }
// 足りない職人を、町から（いなければ近くの町から）雇う
function staff(sim, site) {
  if (site.fixed) return;
  const S = sim.S;
  const hc = headXZ(site);
  site.crew = site.crew.filter((c) => { const p = S.people[c.id]; const ok = validCrew(sim, site, p) && p.consSite === site.id && Math.hypot(p.pos.x - hc.x, p.pos.z - hc.z) < 70; if (!ok && p && p.consSite === site.id) { p.consSite = null; if (p.consHaul?.s === site.id) dropHaul(sim, p, false); } return ok; });
  const tgt = crewTarget(site);
  const have = { carp: 0, mason: 0, labor: 0 };
  for (const c of site.crew) have[c.role]++;
  const s = sim.town(site.sid);
  if (!s) return;
  const towns = [s.id];
  const h = headXZ(site);
  for (const q of S.world.settlements) if (q.id !== s.id && !q.abandoned && q.kingdom === s.kingdom && q.kingdom != null && Math.hypot(q.x - h.x, q.z - h.z) < 36) towns.push(q.id);
  const fill = (role, jobs) => {
    for (const tid of towns) {
      if (have[role] >= tgt[role]) return;
      const cands = poolOf(sim, tid).filter((p) => jobs(p) && p.job !== 'pioneer' && homeDist(sim, p, h) < 40).sort((a, b) => (b.skill?.[b.job] || 0) - (a.skill?.[a.job] || 0));
      for (const p of cands) {
        if (have[role] >= tgt[role]) break;
        p.consSite = site.id; site.crew.push({ id: p.id, role, pay: site.wage !== 0 }); have[role]++;
        const from = tid !== s.id ? sim.town(tid) : null;
        sim.remember(p, from ? `${s.name}の${site.name}の普請に、${ROLE_JP[role]}として呼ばれた` : `${site.name}の普請に、${ROLE_JP[role]}として雇われた`, { emo: 0.3, imp: 0.35, k: 'work' });
        if (from) { site.called.push(p.id); S.cons.stats.called++; }
      }
    }
  };
  fill('carp', (p) => CARP.has(p.job));
  fill('mason', (p) => MASON.has(p.job));
  fill('carp', (p) => CARP_ALT.has(p.job));
  fill('mason', (p) => MASON_ALT.has(p.job));
  // 大工・石工がいなければ、人夫がその分も手伝う（腕は落ちる）
  const extra = Math.max(0, tgt.carp - have.carp) + Math.max(0, tgt.mason - have.mason);
  tgt.labor += site.form === 'line' ? 0 : Math.min(2, extra);
  fill('labor', (p) => laborOK(p));
}

// ---------- 資材の買い付け（毎日と、始めたとき） ----------
function buyMaterials(sim, site) {
  const C = sim.S.cons;
  const wal = payerWallet(sim, site);
  const mks = marketsFor(sim, site);
  const h = headXZ(site);
  site.short = {};
  for (const g of Object.keys(site.need)) {
    const want = site.need[g] - site.bought[g];
    if (want < 0.05) { site.wait[g] = 0; continue; }
    let got = 0, sawStock = false;
    for (const sid of mks) {
      const m = sim.S.towns[sid];
      if (!m || !(m.stock?.[g] > 0.05) || m.price?.[g] == null) continue;
      sawStock = true;
      if (!wal) break;
      const before = wal.money;
      const q = marketBuy(sim, sid, g, Math.min(want - got, m.stock[g]), wal, { who: typeof site.payer === 'object' ? whoLabel(sim, site.payer.hh) : whoLabel(sim, site.payer) });
      if (q <= 0) continue;
      const cost = before - wal.money;
      site.spent += cost; C.stats.matCost += cost;
      const hook = site.data.onSpend && adapt()[site.data.onSpend]; if (hook?.spent) hook.spent(sim, site, cost);
      got += q; site.bought[g] += q;
      const s2 = sim.town(sid);
      const far = s2 ? Math.hypot(s2.x - h.x, s2.z - h.z) : 0;
      if (far > 45) {
        // 遠い町から買った品は、荷車の隊が運んでくる（道のりに合わせて何時間か後に着く）
        site.conv.push({ g, n: q, at: sim.S.t + Math.round(60 * far / 12), from: sid });
        site.transit[g] += q;
      } else site.pend[sid + ':' + g] = (site.pend[sid + ':' + g] || 0) + q;
      if (got >= want - 0.05) break;
    }
    if (got >= want - 0.05) { site.wait[g] = 0; continue; }
    site.short[g] = sawStock ? 'money' : 'none';
    if (!sawStock) matterWant(sim, site.sid, g, want - got);   // 市場に無い品は、職人に注文する（釘・瓦・板材など）
    if (got < 0.05) site.wait[g] = (site.wait[g] || 0) + 1;
    // 何日待っても手に入らない資材：代わりの品にする／遠くから取り寄せる
    const sub = SUB[g];
    if (sub && site.wait[g] >= sub.days && !sawStock) substitute(sim, site, g, sub);
    else if ((g === 'wood' || g === 'stone') && !sawStock && site.wait[g] >= IMPORT_DAYS) importMat(sim, site, g, want - got);
  }
}
function substitute(sim, site, g, sub) {
  const short = site.need[g] - site.bought[g];
  if (short < 0.05) return;
  site.need[g] -= short;
  if (sub.to) { site.need[sub.to] = (site.need[sub.to] || 0) + short * sub.k; for (const k of ['bought', 'onsite', 'used', 'transit']) site[k][sub.to] = site[k][sub.to] || 0; }
  // まだ使っていない段階の分から、後ろの段階ほど先に置きかえる
  if (site.bom) {
    let left = short;
    for (let i = site.bom.length - 1; i >= 0 && left > 1e-6; i--) {
      if (i < site.st || (i === site.st && site.ok)) break;
      const q = site.bom[i][g] || 0; if (!q) continue;
      const x = Math.min(q, left);
      site.bom[i][g] = q - x; if (site.bom[i][g] < 1e-6) delete site.bom[i][g];
      if (sub.to) site.bom[i][sub.to] = (site.bom[i][sub.to] || 0) + x * sub.k;
      left -= x;
    }
  } else if (site.tileMat) {
    const n = Math.max(1, site.tiles.length - site.ti);
    site.tileMat[g] = Math.max(0, (site.tileMat[g] || 0) - short / n);
    if (sub.to) site.tileMat[sub.to] = (site.tileMat[sub.to] || 0) + short * sub.k / n;
  }
  if (!site.subs.includes(sub.txt)) site.subs.push(sub.txt);
  site.wait[g] = 0;
  sim.S.cons.stats.subs++;
  bump(sim);
}
// どこの市場にも無い木材・石材：国庫か町の蓄えが、遠くから取り寄せる（お金は世界の外へ出ていく）。世帯は待つだけ
function importMat(sim, site, g, n) {
  const code = payerCode(site);
  if (!code) return;
  const a = acct(sim, code);
  const cost = n * (GOODS[g]?.base || 2) * 1.6;
  if (!a || a.money < cost + (code[0] === 'k' ? 60 : 20)) { site.short[g] = 'money'; return; }
  a.money -= cost; moneyOut(sim, cost, '遠くから普請の資材を取り寄せた');
  site.spent += cost;
  site.bought[g] += n; site.transit[g] += n;
  site.conv.push({ g, n, at: sim.S.t + 1440, from: null });
  site.wait[g] = 0;
  const C = sim.S.cons; C.stats.imports++; C.stats.importCost += cost;
  sim.pushLog(`${site.name}の普請：${matName(g)}がどこの市場にも無く、${payerLabel(sim, site)}が遠くから${Math.round(n)}荷を取り寄せた（${Math.round(cost)}銅貨）。`, 'event', [], headXZ(site));
}

// ---------- 荷運び ----------
function capacityFor(sim, p) {
  let st = null;
  try { st = carryState(sim, p, true); } catch (e) { st = null; }
  const free = st ? Math.max(0, st.personCap + st.beast - st.carried) : 15;
  const eq = p.eq || {};
  const how = st && st.beast > 0 ? (eq.cart ? 'cart' : 'beast') : eq.back ? 'back' : 'hands';
  return { kg: free, how };
}
// この人に運ばせる荷（なければ null）。運ぶ分は「運搬中」にしておく
function nextHaul(sim, site, p, role) {
  const keys = Object.keys(site.pend).filter((k) => site.pend[k] > 0.05);
  if (!keys.length) return null;
  const carrying = site.crew.filter((c) => sim.S.people[c.id]?.consHaul).length;
  const gatherTime = site.form === 'line' ? !site.tileOk : site.st <= ST.gather || !site.ok;
  if (!(role === 'labor' || gatherTime) || carrying >= Math.max(2, Math.ceil(site.crew.length * 0.7))) return null;
  // いま要る資材から運ぶ
  const needNow = site.form !== 'line' ? (site.bom[site.st] || {}) : (site.tileMat || {});
  keys.sort((a, b) => ((needNow[b.split(':')[1]] || 0) > 0) - ((needNow[a.split(':')[1]] || 0) > 0));
  const key = keys[0];
  const [src, g] = [+key.split(':')[0], key.split(':')[1]];
  const w = Math.max(0.2, goodWeight(g));
  let { kg, how } = capacityFor(sim, p);
  if (kg < w * 2) { kg = 80; how = 'cart'; }   // 現場の手押し車を借りる
  const n = Math.min(site.pend[key], Math.max(1, Math.floor(kg / w)));
  site.pend[key] -= n; if (site.pend[key] < 0.05) delete site.pend[key];
  site.transit[g] += n;
  return { s: site.id, src, g, n, leg: 'pick', how, kg: r1(n * w), t: sim.S.t };
}
function dropHaul(sim, p, delivered) {
  const hl = p.consHaul;
  if (!hl) return;
  const C = sim.S.cons, site = C.sites[hl.s];
  p.consHaul = null;
  const i = C.haul.indexOf(p.id); if (i >= 0) C.haul.splice(i, 1);
  if (!site) return;
  site.transit[hl.g] = Math.max(0, site.transit[hl.g] - hl.n);
  if (delivered) {
    site.onsite[hl.g] = (site.onsite[hl.g] || 0) + hl.n;
    site.hauls++; site.kg += hl.kg;
    C.stats.hauls++; C.stats.kg += hl.kg; C.stats.byHow[hl.how] = (C.stats.byHow[hl.how] || 0) + 1;
    bump(sim);
  } else {
    // 運べなかった荷は、市場の買い置きに戻す（あとで別の人が運ぶ）
    site.pend[hl.src + ':' + hl.g] = (site.pend[hl.src + ':' + hl.g] || 0) + hl.n;
  }
}

// ---------- 住人の行動（decide） ----------
export function constructOptions(sim, p, add) {
  if (p.consSite == null && !p.consHaul) return;
  const C = sim.S.cons;
  if (!C) { p.consSite = null; p.consHaul = null; return; }
  const h = sim.hour();
  if (p.consHaul) {
    const hl = p.consHaul, site = C.sites[hl.s];
    if (!site) { dropHaul(sim, p, false); return; }
    if (h < 6 || h >= 20) return;
    const place = hl.leg === 'pick' ? pickSpot(sim, hl.src) : yardSpot(sim, site);
    if (!place) { dropHaul(sim, p, false); return; }
    add(10.5 + p.pers.C, 'haul', place, 3);
    return;
  }
  const site = C.sites[p.consSite];
  if (!site) { p.consSite = null; return; }
  if (!WORK_H(h) || site.halt || !sim.isAdult(p) || p.jail != null || p.mission || p.fight) return;
  if (p.needs && (p.needs.sleep < 20 || p.needs.hunger < 35)) return;
  if (restDayFor(sim, p)) return;
  const me = site.crew.find((c) => c.id === p.id);
  if (!me) { p.consSite = null; return; }
  const hc = headXZ(site);
  if (tooDangerous(sim, p, Math.round(hc.x), Math.round(hc.z))) return;
  const job = nextHaul(sim, site, p, me.role);
  if (job) {
    p.consHaul = job;
    const place = pickSpot(sim, job.src);
    if (place) { add(10.5 + p.pers.C, 'haul', place, 3); return; }
    dropHaul(sim, p, false);
  }
  if (!workable(site)) return;
  add(10 + p.pers.C, 'construct', workSpot(sim, site, p), 120);
}
// いま手を動かせる段階か（資材がそろっているか）
function workable(site) {
  if (site.st >= DONE) return false;
  if (site.form === 'line') return site.tileOk || tileMatReady(site);
  if (STAGES[site.st].k === 'gather') return false;
  return site.ok || stageMatReady(site, site.st);
}
function stageMatReady(site, st) { for (const [g, q] of Object.entries(site.bom[st] || {})) if ((site.onsite[g] || 0) + 1e-6 < q) return false; return true; }
function tileMatReady(site) { for (const [g, q] of Object.entries(site.tileMat || {})) if ((site.onsite[g] || 0) + 1e-6 < q) return false; return true; }
function takeStageMat(site, st) { for (const [g, q] of Object.entries(site.bom[st] || {})) { site.onsite[g] = Math.max(0, site.onsite[g] - q); if (site.onsite[g] < 1e-9) site.onsite[g] = 0; site.used[g] = (site.used[g] || 0) + q; } }
function takeTileMat(site) { for (const [g, q] of Object.entries(site.tileMat || {})) { site.onsite[g] = Math.max(0, site.onsite[g] - q); site.used[g] = (site.used[g] || 0) + q; } }

// 仕事の姿（anim_people.js の仕事の動き）：段階と役目で選び、ときどき持ちかえる
function animFor(site, role, t, pid) {
  const alt = ((Math.floor(t / 20) + pid) & 1) === 0;
  if (site.form === 'line') return site.lk === 'wall' ? (role === 'mason' && alt ? 'work:pick' : 'work:c_stone') : (alt ? 'work:c_stake' : 'work:dig');
  const k = STAGES[site.st].k;
  switch (k) {
    case 'stake': return alt ? 'work:c_stake' : 'work:rope';                                                   // 杭を打ち、縄を張る
    case 'found': return role === 'mason' ? (alt ? 'work:c_stone' : 'work:pick') : alt ? 'work:dig' : 'work:c_stone'; // 溝を掘り、石を据える
    case 'frame': return role === 'carp' ? (alt ? 'work:saw' : 'work:c_hammer') : alt ? 'work:lift' : 'work:c_hammer'; // のこぎりを引き、掛矢で組む
    case 'wall': return role === 'mason' ? 'work:c_stone' : role === 'carp' ? (alt ? 'work:saw' : 'work:c_nail') : alt ? 'work:c_stone' : 'work:lift';
    case 'roof': return role === 'carp' ? (alt ? 'work:c_nail' : 'work:saw') : 'work:c_roofup';               // 屋根板を打ち、藁束を差し上げる
    case 'finish': return alt ? 'work:sweep' : 'work:c_nail';
  }
  return 'work:lift';
}
const EFF = { stake: { carp: 1, mason: 1, labor: 1 }, found: { carp: 0.8, mason: 1.3, labor: 0.8 }, frame: { carp: 1.3, mason: 0.7, labor: 0.6 }, wall: { carp: 1, mason: 1.2, labor: 0.7 }, roof: { carp: 1.3, mason: 0.7, labor: 0.6 }, finish: { carp: 1.1, mason: 1, labor: 0.8 } };
function effOf(sim, site, p, role) {
  const k = site.form === 'line' ? (site.lk === 'wall' ? 'wall' : 'stake') : STAGES[site.st].k;
  const e = (EFF[k]?.[role] ?? 0.8) * ((role === 'carp' && !CARP.has(p.job)) || (role === 'mason' && !MASON.has(p.job)) ? 0.75 : 1);
  const sk = 0.85 + Math.min(0.3, (p.skill?.[p.job] || 0.3) * 0.3);
  const hurt = p.maxhp && p.hp < p.maxhp * 0.5 ? 0.5 : 1;
  const age = sim.ageOf(p), old = age >= 58 ? 0.75 : 1;
  const hc = headXZ(site);
  let wx = 'sunny'; try { wx = weatherAt(sim, Math.round(hc.x), Math.round(hc.z)); } catch (e2) { /* 天気がまだない */ }
  return e * sk * hurt * old * (SLOW_WX[wx] || 1);
}

// ---------- 行動の中身（doAction） ----------
export function constructDo(sim, p, dt) {
  const a = p.action;
  if (!a || a.phase !== 'do') return;
  if (a.type === 'haul') { haulDo(sim, p, a); return; }
  if (a.type !== 'construct') return;
  const C = sim.S.cons, site = C?.sites[p.consSite];
  if (!site || site.halt || !WORK_H(sim.hour())) { a.until = sim.S.t; return; }
  if (!atSite(site, p)) { a.until = sim.S.t; return; }
  if (!workable(site)) { p.consAnim = 'idle'; if (!p._consWaitNote && sim.rng.chance(0.2)) { p._consWaitNote = true; sim.remember(p, `${site.name}の普請場で、資材が届くのを待った`, { emo: -0.1, imp: 0.2, k: 'work' }); } a.until = Math.min(a.until || sim.S.t, sim.S.t + 20); return; }
  const me = site.crew.find((c) => c.id === p.id);
  const role = me?.role || 'labor';
  site.acc += (dt / 60) * effOf(sim, site, p, role);
  site.wh[p.id] = (site.wh[p.id] || 0) + dt / 60;
  p.workedToday = (p.workedToday || 0) + dt;
  p.consAnim = animFor(site, role, sim.S.t, p.id);
  if (p.needs) { p.needs.sloth = Math.max(0, p.needs.sloth - 5 * dt / 60); p.needs.esteem = Math.min(100, p.needs.esteem + 1.5 * dt / 60); }
  if (p.job) p.skill[p.job] = Math.min(1, (p.skill[p.job] || 0.3) + 0.0004 * dt / 60);
}
function haulDo(sim, p, a) {
  const hl = p.consHaul, C = sim.S.cons;
  if (!hl) { a.until = sim.S.t; return; }
  const site = C?.sites[hl.s];
  if (!site) { dropHaul(sim, p, false); a.until = sim.S.t; return; }
  if (hl.leg === 'pick') {
    const at = pickSpot(sim, hl.src);
    if (!at || Math.abs(p.pos.x - at.x) + Math.abs(p.pos.z - at.z) > 7) { hl.fail = (hl.fail || 0) + 1; if (hl.fail >= 2) dropHaul(sim, p, false); a.until = sim.S.t; return; }
    hl.leg = 'drop'; hl.t = sim.S.t;
    if (!C.haul.includes(p.id)) C.haul.push(p.id);
    p._cd = true;
    const y = yardSpot(sim, site);
    sim.startAction(p, { type: 'haul', place: y, dur: 3 });
    return;
  }
  const y = yardSpot(sim, site);
  const ok = Math.abs(p.pos.x - y.x) + Math.abs(p.pos.z - y.z) <= 8;
  dropHaul(sim, p, ok);
  if (ok && sim.rng.chance(0.08)) sim.remember(p, hl.how === 'cart' ? `${site.name}の普請場へ、荷車で${matName(hl.g)}を運んだ` : `${site.name}の普請場へ、${matName(hl.g)}を担いで運んだ`, { emo: 0.1, imp: 0.2, k: 'work' });
  a.until = sim.S.t;
}

// ---------- 1時間ごと ----------
export function constructHourly(sim) {
  const C = sim.S.cons;
  if (!C) return;
  const h = Math.floor(sim.hour());
  const prevWork = WORK_H(((h + 23) % 24) + 0.5);   // いま終わった1時間は、働く時間だったか
  const work = WORK_H(h + 0.5);                      // これからの1時間
  for (const site of Object.values(C.sites)) {
    // 荷車の隊・取り寄せが着く
    if (site.conv.length) {
      const now = sim.S.t;
      site.conv = site.conv.filter((c) => { if (c.at > now) return true; site.transit[c.g] = Math.max(0, site.transit[c.g] - c.n); site.onsite[c.g] = (site.onsite[c.g] || 0) + c.n; site.hauls++; C.stats.convoy++; C.stats.hauls++; bump(sim); return false; });
    }
    const hc = headXZ(site);
    // 1) いま終わった1時間の働きを、段階に積む
    const wasHalt = site.halt;
    if (prevWork && !wasHalt && site.fixed) {
      // 遠くに住む開拓団などは、泊まり込みで働いているとみなす（道探しで来られない者のため）
      for (const c of site.crew) {
        const p = sim.S.people[c.id];
        if (!alive(p) || p.jail != null || p.fight || p.mission) continue;
        if (Math.hypot(p.pos.x - hc.x, p.pos.z - hc.z) > 40 && workable(site)) site.acc += 0.5;
      }
    }
    const before = site.st * 10 + site.sp + site.ti * 7 + site.tp;
    const acc = site.acc;
    site.acc = 0;
    if (site.form === 'line') advanceLine(sim, site, acc); else advanceBld(sim, site, acc);
    wagesHour(sim, site);
    if (!C.sites[site.id]) continue;   // 完成した
    const moved = site.st * 10 + site.sp + site.ti * 7 + site.tp !== before;
    if (moved) { site.hours++; site.stall = null; bump(sim); }
    else if (prevWork && !wasHalt) addStall(sim, site, stallReason(sim, site));
    else if (prevWork && wasHalt && wasHalt !== 'night' && wasHalt !== 'lunch') addStall(sim, site, 'wx:' + wasHalt);
    // 2) これからの1時間：雨・嵐・夜・昼休み
    const wx = consHalt(sim, Math.round(hc.x), Math.round(hc.z));
    site.halt = wx || (work ? null : h >= 17 || h < 7 ? 'night' : 'lunch');
    if (site.halt) for (const c of site.crew) { const p = sim.S.people[c.id]; if (p?.action?.type === 'construct') p.action.until = sim.S.t; }
  }
}
function addStall(sim, site, why) {
  site.stall = why;
  site.stallH[why] = (site.stallH[why] || 0) + 1;
  const st = sim.S.cons.stats.stallH; st[why] = (st[why] || 0) + 1;
}
function stallReason(sim, site) {
  if (!site.crew.length) return 'crew';
  if (site.form !== 'line' && STAGES[site.st].k === 'gather' || !workable(site)) {
    const need = site.form !== 'line' ? (STAGES[site.st].k === 'gather' ? { ...site.bom[ST.frame], ...site.bom[ST.found] } : site.bom[site.st]) : site.tileMat;
    const lack = Object.entries(need || {}).filter(([g, q]) => (site.onsite[g] || 0) + 1e-6 < q).map(([g]) => g);
    if (lack.some((g) => site.short?.[g] === 'money')) return 'money';
    if (lack.some((g) => (site.transit[g] || 0) > 0.05 || Object.keys(site.pend).some((k) => k.endsWith(':' + g)))) return 'haul';
    return 'mat';
  }
  if (!site.crew.length) return 'crew';
  return 'nobody';
}
export const STALL_JP = { money: '施主のお金が足りず、資材を買えない', haul: '資材を運んでいるところ', mat: '資材が市場に無く、入荷を待っている', crew: '職人が見つからない', nobody: '職人がまだ現場に来ていない', night: '夜は休み', lunch: '昼休み' };
export function stallText(site) {
  const s = site.stall || site.halt;
  if (!s) return '';
  if (s.startsWith('wx:')) return `${WX_JP[s.slice(3)] || '悪い天気'}で工事を休んでいる`;
  if (WX_JP[s]) return `${WX_JP[s]}で工事を休んでいる`;
  if (s === 'mat' || s === 'money' || s === 'haul') {
    const need = site.form !== 'line' ? (STAGES[site.st].k === 'gather' ? { ...site.bom[ST.frame], ...site.bom[ST.found] } : site.bom[site.st]) : site.tileMat;
    const lack = Object.entries(need || {}).filter(([g, q]) => (site.onsite[g] || 0) + 1e-6 < q).map(([g]) => matName(g));
    return `${STALL_JP[s]}${lack.length ? `（${lack.join('・')}）` : ''}`;
  }
  return STALL_JP[s] || '';
}

// 建物：段階を進める
function advanceBld(sim, site, acc) {
  let guard = 0;
  while (site.st < DONE && guard++ < 12) {
    const k = STAGES[site.st].k;
    if (k === 'gather') {
      // 土台と骨組みの資材が現場にそろうか、買ったものが全部届いたら、次へ
      // 土台の資材がそろい、骨組みの資材もそろうか、今は運べる骨組みの資材がもう無ければ、土台にかかる
      const frameG = Object.keys(site.bom[ST.frame] || {});
      const noMore = frameG.every((g) => (site.onsite[g] || 0) + 1e-6 >= (site.bom[ST.frame][g] || 0) || (!(site.transit[g] > 0.05) && !Object.keys(site.pend).some((k2) => k2.endsWith(':' + g) && site.pend[k2] > 0.05)));
      if (stageMatReady(site, ST.found) && noMore) { nextStage(sim, site); continue; }
      break;
    }
    if (!site.ok) {
      if (!stageMatReady(site, site.st)) break;
      takeStageMat(site, site.st); site.ok = true;
    }
    const need = Math.max(0.5, site.work * STAGES[site.st].w);
    const left = (1 - site.sp) * need;
    if (need <= 0.5 && STAGES[site.st].w === 0) { nextStage(sim, site); continue; }
    if (acc <= 1e-9) break;
    if (acc >= left) { acc -= left; nextStage(sim, site); }
    else { site.sp += acc / need; acc = 0; break; }
  }
}
function nextStage(sim, site) {
  const was = STAGES[site.st].k;
  site.st++; site.sp = 0; site.ok = false;
  bump(sim);
  if (was === 'frame') topOut(sim, site);
  if (site.st < DONE && (site.skip || []).includes(STAGES[site.st].k)) { nextStage(sim, site); return; }
  if (site.st >= DONE) finish(sim, site);
}
// 線の工事：1マスずつ
function advanceLine(sim, site, acc) {
  let guard = 0;
  while (site.ti < site.tiles.length && guard++ < 40) {
    if (!site.tileOk) {
      // このマスがまだ建てられるか（ふさがっていれば飛ばす。資材は使わない）
      if (!tileBuildable(sim, site, site.tiles[site.ti])) { site.ti++; site.tp = 0; continue; }
      if (!tileMatReady(site)) break;
      takeTileMat(site); site.tileOk = true;
    }
    if (acc <= 1e-9) break;
    const left = (1 - site.tp) * site.tileWork;
    if (acc >= left) { acc -= left; applyTile(sim, site, site.tiles[site.ti]); site.ti++; site.tp = 0; site.tileOk = false; }
    else { site.tp += acc / site.tileWork; acc = 0; }
  }
  if (site.ti >= site.tiles.length) finish(sim, site);
}
function tileBuildable(sim, site, i) {
  const t = sim.S.world.tiles[i];
  if (site.lk === 'wall') return t === T.FENCE || BUILDABLE.has(t) || CLEARABLE.has(t);
  return BUILDABLE.has(t) || CLEARABLE.has(t) || t === T.ROCK || t === T.SWAMP;
}
function applyTile(sim, site, i) {
  const w = sim.S.world, C = sim.S.cons;
  if (!tileBuildable(sim, site, i)) return;
  if (site.lk === 'wall') {
    w.tiles[i] = T.WALL; C.built.w.push(i);
    const s = sim.town(site.sid); if (s) (s.walls = s.walls || []).push({ x: i % W, z: (i / W) | 0 });
  } else { w.tiles[i] = T.FENCE; C.built.f.push(i); }
  if (C.built.f.length > 6000) C.built.f.splice(0, 1000);
  if (C.built.w.length > 6000) C.built.w.splice(0, 1000);
  C.stats.tiles++;
  sim.events.push({ type: 'tiles', list: [i] });
  bump(sim);
}

// ---------- 日当（1時間ごとに、働いた時間ぶん） ----------
function wagesHour(sim, site) {
  const S = sim.S;
  const hrs = site.wh; site.wh = {};
  if (site.wage === 0) return;
  const code = payerCode(site);
  for (const [pid, h] of Object.entries(hrs)) {
    const c = site.crew.find((x) => x.id === +pid);
    if (!c || !c.pay) continue;
    const p = S.people[pid];
    if (!alive(p)) continue;
    const amt = (site.wage[c.role] ?? RATE[c.role] ?? 1) * h;
    if (amt <= 0) continue;
    S.cons.stats.wagesOwed += amt;
    if (code) owe(sim, p, code, amt, '普請の日当');           // 給料日に国庫・町の蓄えが払う（payday.js）
    else site.owe[pid] = (site.owe[pid] || 0) + amt;          // 世帯の施主は、この仕組みが給料日に払う
  }
}
// 世帯が施主の普請の給料日：施主の家計 → 職人（払えなければ貸しのまま。2回続くと職人は手を引く）
function householdPayday(sim) {
  const S = sim.S, C = S.cons;
  const pay = (payerId, pid, amt, why, site) => {
    const p = S.people[pid], hh = S.households[payerId];
    if (!alive(p) || !hh) return amt;
    const kid = sim.town(p.s)?.kingdom ?? 0;
    if (!isPayday(sim, kid)) return amt;
    const x = Math.max(0, Math.min(amt, hh.money - 5));
    if (x > 0) {
      hh.money -= x; earn(sim, p, x, 0.5);
      flow(sim, whoLabel(sim, payerId), JOBS[p.job]?.name || '職人', x, why);
      income(sim, p.job, x); C.stats.wagesPaid += x;
      if (site) { site.paid += x; const hook = site.data.onSpend && adapt()[site.data.onSpend]; if (hook?.spent) hook.spent(sim, site, x); }
    }
    const rest = amt - x;
    if (rest > 0.05) {
      if (site) site.late[pid] = (site.late[pid] || 0) + 1;
      sim.remember(p, `給料日なのに、${hh.name}から普請の日当${Math.round(rest)}銅貨を払ってもらえなかった`, { emo: -0.5, imp: 0.45, k: 'labor' });
    } else if (site) site.late[pid] = 0;
    return rest;
  };
  for (const site of Object.values(C.sites)) {
    if (!(site.payer && typeof site.payer === 'object')) continue;
    for (const [pid, amt] of Object.entries(site.owe)) {
      const rest = pay(site.payer.hh, +pid, amt, '家の普請の日当', site);
      if (rest > 0.05) site.owe[pid] = rest; else delete site.owe[pid];
      // 2回続けて払われなければ、職人は手を引く
      if ((site.late[pid] || 0) >= 2) {
        site.crew = site.crew.filter((c) => c.id !== +pid);
        const p = S.people[pid]; if (p && p.consSite === site.id) p.consSite = null;
        if (p) sim.remember(p, `${site.name}の普請は、日当が払われないので手を引いた`, { emo: -0.5, imp: 0.5, k: 'labor' });
      }
    }
  }
  C.debts = C.debts.filter((d) => {
    const rest = pay(d.hh, d.pid, d.amt, '家の普請の日当（後払い）', null);
    d.amt = rest;
    if (rest <= 0.05) return false;
    if (sim.today - d.day > 40) { const p = S.people[d.pid]; if (alive(p)) sim.remember(p, `${d.name}の普請の日当は、とうとう払ってもらえなかった`, { emo: -0.6, imp: 0.5, k: 'labor' }); return false; }
    return true;
  });
}

// ---------- 着工・上棟・完成 ----------
function where(sim, site) { const s = sim.town(site.sid); return s ? s.name : sim.placeName(Math.round(headXZ(site).x), Math.round(headXZ(site).z)); }
function announceStart(sim, site) {
  const ids = site.crew.slice(0, 4).map((c) => c.id);
  const pos = headXZ(site);
  const txt = site.form === 'line'
    ? `${where(sim, site)}で「${site.name}」の普請が始まった。${site.tiles.length}${LINE_UNIT[site.lk]}の${site.lk === 'wall' ? '石の塀' : '柵'}を、端から${site.lk === 'wall' ? '積んで' : '杭を打って'}いく。`
    : site.tag === 'expand2f' ? `${site.name}が始まった。まず足場を組む。`
    : `${where(sim, site)}で「${site.name}」の普請が始まった。まず縄を張って場所を決め、資材を集める。`;
  sim.pushLog(txt, 'event', ids, { x: Math.round(pos.x), z: Math.round(pos.z) });
  if (site.big) sim.news(`${where(sim, site)}：${site.name}の普請が始まった（施主：${payerLabel(sim, site)}）`, 1, { x: Math.round(pos.x), z: Math.round(pos.z) });
}
function topOut(sim, site) {
  const C = sim.S.cons;
  C.stats.topped++;
  const b = sim.building(site.b);
  const pos = b ? b.door : headXZ(site);
  const crew = site.crew.map((c) => sim.S.people[c.id]).filter(alive);
  sim.pushLog(`${site.name}の骨組みが組み上がった。棟木に若木を飾り、職人たちが上棟を祝った。`, 'event', crew.slice(0, 4).map((p) => p.id), pos);
  if (site.big) sim.news(`${where(sim, site)}の${site.name}が上棟した`, 1, pos);
  for (const p of crew) if (sim.rng.chance(0.7)) sim.remember(p, `${site.name}の棟が上がった。みんなで若木を飾って祝った`, { emo: 0.6, imp: 0.5, k: 'work' });
}
function finish(sim, site) {
  const S = sim.S, C = S.cons;
  if (!C.sites[site.id]) return;
  delete C.sites[site.id];
  site.st = DONE;
  const days = sim.today - site.day0;
  C.stats.done++; C.stats.daysSum += days; C.stats.doneTag[site.tag] = (C.stats.doneTag[site.tag] || 0) + 1;
  (C.recent = C.recent || []).push({ tag: site.tag, name: site.name, days, hauls: site.hauls, d: sim.today });
  if (C.recent.length > 40) C.recent.shift();
  releaseCrew(sim, site);
  // 世帯の施主の未払いは、あとの給料日に払う
  if (site.payer && typeof site.payer === 'object') for (const [pid, amt] of Object.entries(site.owe)) if (amt > 0.05) C.debts.push({ hh: site.payer.hh, pid: +pid, amt, day: sim.today, name: site.name });
  let b = null;
  if (site.b != null) {
    b = sim.building(site.b);
    if (b) {
      const wasSite = b.type === 'site';
      if (wasSite) { b.type = b.futureType || 'house'; b.name = b.realName || b.name; }
      delete b.futureType; delete b.realName; delete b.uc;
      if (wasSite) sim.events.push({ type: 'building', id: b.id });   // 建て増し（住んだままの工事）は、施主の仕組みが描き直しを知らせる
    }
  }
  bump(sim);
  const crew = site.crew.map((c) => sim.S.people[c.id]).filter(alive);
  for (const p of crew) if (sim.rng.chance(0.6)) sim.remember(p, `${site.name}の普請を仕上げた（${days}日かかった）`, { emo: 0.6, imp: 0.5, k: 'work' });
  const tag = site.tag.split(':')[0];
  const hand = adapt()[site.tag] || adapt()[tag];
  let said = false;
  try { said = !!hand?.done?.(sim, site, b); } catch (e) { console.error('construct: 完成の処理で', e); }
  if (!said) {
    const pos = b ? b.door : headXZ(site);
    const how = site.subs.length ? `（${site.subs.join('。')}）` : '';
    sim.pushLog(`${where(sim, site)}の「${site.name}」が完成した。着工から${days}日、資材の運搬は${site.hauls}回${how}。`, 'event', crew.slice(0, 3).map((p) => p.id), { x: Math.round(pos.x), z: Math.round(pos.z) });
    if (site.big) {
      sim.news(`${where(sim, site)}に${site.name}ができた`, 2, pos);
      const k = site.k ?? sim.town(site.sid)?.kingdom;
      if (k != null) sim.chron(`${where(sim, site)}に${site.name}が建てられた`, k);
    }
  }
}
function releaseCrew(sim, site) {
  const S = sim.S;
  for (const c of site.crew) {
    const p = S.people[c.id];
    if (!p) continue;
    if (p.consSite === site.id) p.consSite = null;
    if (p.consHaul?.s === site.id) dropHaul(sim, p, false);
    if (p.action && (p.action.type === 'construct' || p.action.type === 'haul')) p.action.until = S.t;
  }
}
// 普請を取りやめる（施主が払えない・開拓団が解散した など）。建てかけの建物は、そのまま残る
export function consCancel(sim, site, why) {
  const S = sim.S, C = S.cons;
  if (!C.sites[site.id]) return;
  delete C.sites[site.id];
  C.stats.cancel++;
  releaseCrew(sim, site);
  const b = site.b != null ? sim.building(site.b) : null;
  if (b) {
    delete b.uc;
    if (b.type === 'site') { b.name = `建てかけの${b.realName || '建物'}`; C.frozen.push({ b: b.id, st: site.st, sp: site.sp, tag: site.tag }); if (C.frozen.length > 60) C.frozen.shift(); }
    else { delete b.futureType; delete b.realName; }
  }
  if (site.payer && typeof site.payer === 'object') for (const [pid, amt] of Object.entries(site.owe)) if (amt > 0.05) C.debts.push({ hh: site.payer.hh, pid: +pid, amt, day: sim.today, name: site.name });
  const pos = b ? b.door : headXZ(site);
  sim.pushLog(`${where(sim, site)}の「${site.name}」の普請は取りやめになった（${why}）。`, 'event', [], { x: Math.round(pos.x), z: Math.round(pos.z) });
  const hand = adapt()[site.tag] || adapt()[site.tag.split(':')[0]];
  try { hand?.cancel?.(sim, site, b); } catch (e) { console.error('construct: 取りやめの処理で', e); }
  bump(sim);
}

// ---------- 1日ごと ----------
export function constructDaily(sim) {
  const S = sim.S;
  const C = S.cons;
  if (!C) { rebuildRuins(sim); return; }
  for (const site of Object.values(C.sites)) {
    // 施主や土台がなくなった普請
    if (site.b != null && !sim.building(site.b)) { consCancel(sim, site, '建物がなくなった'); continue; }
    const hand = adapt()[site.tag] || adapt()[site.tag.split(':')[0]];
    const why = hand?.check?.(sim, site);
    if (why) { consCancel(sim, site, why); continue; }
    if (site.payer && typeof site.payer === 'object' && !S.households[site.payer.hh]) { consCancel(sim, site, '施主の家がなくなった'); continue; }
    // 運んでいる途中で消えた荷（運び手が亡くなった・一日たっても着かない）
    for (const c of site.crew) { const p = S.people[c.id]; if (p?.consHaul && S.t - p.consHaul.t > 1440) dropHaul(sim, p, false); }
    if (hand?.crew) setCrew(sim, site, hand.crew(sim, site) || []);
    else staff(sim, site);
    buyMaterials(sim, site);
    // 止まっている日数（世帯の施主は、20日止まったら諦める）
    const movedToday = (site._lastHours ?? -1) !== site.hours;
    site._lastHours = site.hours;
    site.stallDays = movedToday ? 0 : site.stallDays + 1;
    if (site.payer && typeof site.payer === 'object' && site.stallDays >= 20) { consCancel(sim, site, 'お金と資材が続かなかった'); continue; }
  }
  for (const id of C.haul.slice()) { const p = S.people[id]; if (!alive(p) || !p.consHaul || p.consHaul.leg !== 'drop') { if (p && p.consHaul && !alive(p)) dropHaul(sim, p, false); const i = C.haul.indexOf(id); if (i >= 0 && (!p || !p.consHaul || p.consHaul.leg !== 'drop')) C.haul.splice(i, 1); } }
  householdPayday(sim);
  rebuildRuins(sim);
  // 放り出された建てかけ（開拓団の解散など）は、30日たつと取り壊して空き地に戻す……のではなく、そのまま残す（廃墟になる）
  C.frozen = C.frozen.filter((f) => sim.building(f.b)?.type === 'site');
}

// ---------- 焼け跡の建て直し（独立村）：村の蓄えで、焼けた家を建て直す ----------
function rebuildRuins(sim) {
  const S = sim.S;
  if ((sim.today + 1) % 3 !== 0) return;
  for (const s of S.world.settlements) {
    if (!s.indep || s.abandoned || s.ruined) continue;
    const t = S.towns[s.id];
    if (!t) continue;
    const C = ensureCons(sim);
    if (Object.values(C.sites).some((x) => x.sid === s.id && x.tag === 'rebuild')) continue;
    const ruins = s.buildings.map((id) => sim.building(id)).filter((b) => b && b.type === 'house' && b.ruin && b.uc == null);
    if (!ruins.length) continue;
    const pop = sim.living().filter((p) => p.s === s.id).length;
    if (pop < 4) continue;
    const homeless = Object.values(S.households).some((h) => h.s === s.id && (h.street || h.inn || h.house == null) && h.members.length);
    const empty = s.buildings.some((id) => { const b = sim.building(id); return b && b.type === 'house' && !b.ruin && b.hh == null; });
    if (!homeless && empty) continue;
    const b = ruins[0];
    const est = 60;
    if ((t.fund || 0) < est + 40) continue;
    b.name = `${s.name.replace(/^.*の/, '')}の家`;
    consBegin(sim, b, { tag: 'rebuild', sid: s.id, k: s.kingdom ?? null, payer: 't' + s.id });
  }
}
registerConsAdapter('rebuild', {
  done(sim, site, b) {
    if (!b) return false;
    delete b.ruin; delete b.burnt;
    b.name = '空き家'; b.hh = null; b.owner = null; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0;
    const s = sim.town(site.sid);
    sim.pushLog(`${s?.name || ''}で、焼け跡になっていた家が建て直された（村の蓄えで、着工から${sim.today - site.day0}日）。`, 'event', site.crew.slice(0, 3).map((c) => c.id), b.door);
    return true;
  },
});

// ================================================================ 各工事の仕組みとのつなぎ
// ---------- 開拓：柵 ----------
export function consFence(sim, pr, k, adults) {
  const C = ensureCons(sim);
  if (pr.fenceSite == null) {
    const site = consLine(sim, { lk: 'fence', tag: 'exp:fence', tiles: pr.fence, sid: pr.from, k: k.id, payer: 'k' + k.id, name: `${pr.name || '開拓地'}の柵`, fixed: true, wage: 0, crew: adults.map((p) => ({ id: p.id, role: 'labor', pay: false })), data: { proj: pr.id } });
    if (!site) { pr.fence = []; return; }
    pr.fenceSite = site.id;
    return;
  }
  const site = C.sites[pr.fenceSite];
  if (!site) { pr.fence = []; delete pr.fenceSite; return; }
  setCrew(sim, site, adults.map((p) => ({ id: p.id, role: 'labor', pay: false })), true);
}
registerConsAdapter('exp:fence', { done: () => true, check: (sim, site) => expGone(sim, site) });
function expGone(sim, site) {
  const pr = sim.S.expansion?.projects?.find((q) => q.id === site.data.proj);
  if (!pr || pr.stage === 'failed' || pr.stage === 'done') return '開拓団が解散した';
  return null;
}
function expAdults(sim, pr) { return (pr.members || []).map((id) => sim.S.people[id]).filter((p) => alive(p) && sim.isAdult(p) && p.jail == null); }
// ---------- 開拓：井戸と家（建てる順番の頭から、2つずつ並べて建てる） ----------
export function consExpBuild(sim, pr, k, changed) {
  const api = adapt().expApi;
  if (!api) return false;
  const S = sim.S, C = ensureCons(sim), s = S.world.settlements[pr.sid];
  if (!s) return false;
  while (pr.queue.length && pr.queue[0].done) pr.queue.shift();
  let active = 0;
  for (const it of pr.queue) {
    if (it.t !== 'well' && it.t !== 'house') break;
    if (it.done) continue;
    if (it.site != null) { if (C.sites[it.site]) active++; else it.done = true; continue; }
    if (active >= 2) break;
    let b = null, tag = null;
    if (it.t === 'well') { b = api.placeIn(sim, s, 'well', '井戸', 1, 1, { open: true }); tag = 'exp:well'; }
    else {
      const u = pr.units[it.unit];
      const ids = (u?.ids || []).filter((id) => alive(S.people[id]));
      if (!u || !ids.length) { it.done = true; continue; }
      const name = u.type === 'hh' && S.households[u.hh] ? S.households[u.hh].name : `${S.people[ids[0]].family}家`;
      b = api.houseFor(sim, s, name); tag = 'exp:house';
    }
    if (!b) { it.done = true; if (it.t === 'house') { api.settleUnit(sim, pr, s, pr.units[it.unit]); } continue; }
    const site = consBegin(sim, b, { tag, sid: s.id, k: pr.k, payer: 'k' + k.id, fixed: true, wage: 0, crew: [], data: { proj: pr.id, unit: it.unit ?? null } });
    if (!site) { it.done = true; continue; }
    it.site = site.id; active++;
  }
  // 団員を、進んでいる普請に振り分ける
  const sites = pr.queue.filter((it) => it.site != null && C.sites[it.site]).map((it) => C.sites[it.site]);
  const ad = expAdults(sim, pr);
  sites.forEach((site, j) => setCrew(sim, site, ad.filter((_, i) => i % sites.length === j).map((p) => ({ id: p.id, role: roleOfJob(p.job) === 'carp' || roleOfJob(p.job) === 'mason' ? roleOfJob(p.job) : 'labor', pay: false })), true));
  while (pr.queue.length && pr.queue[0].done) pr.queue.shift();
  if (!pr.queue.length || pr.queue[0].t === 'fields') return false;   // 畑と村の完成は、今までの仕組みで
  void changed;
  return true;
}
registerConsAdapter('exp', {
  check: (sim, site) => expGone(sim, site),
  crew(sim, site) {
    const pr = sim.S.expansion?.projects?.find((q) => q.id === site.data.proj);
    if (!pr) return [];
    return site.crew.filter((c) => { const p = sim.S.people[c.id]; return alive(p) && sim.isAdult(p); });
  },
  done(sim, site, b) {
    const api = adapt().expApi, S = sim.S;
    const pr = S.expansion?.projects?.find((q) => q.id === site.data.proj);
    const it = pr?.queue?.find((q) => q.site === site.id);
    if (it) it.done = true;
    if (!b || !pr) return false;
    const s = S.world.settlements[pr.sid];
    if (site.tag === 'exp:house' && s) {
      const u = pr.units[site.data.unit];
      if (u) {
        s._preHouse = b.id;
        const hh = api.settleUnit(sim, pr, s, u);
        s._preHouse = null;
        if (hh) for (const id of hh.members) { const p = S.people[id]; if (p && sim.isAdult(p) && sim.rng.chance(0.6)) sim.remember(p, `${s.name}に自分たちの手で家を建て、はじめてかまどに火を入れた`, { emo: 0.9, imp: 0.85, k: 'frontier' }); }
        sim.pushLog(`${s.name}に、開拓団の手で${b.name}が建った（着工から${sim.today - site.day0}日）。`, 'event', hh ? hh.members.slice(0, 2) : [], b.door);
        return true;
      }
      b.name = '空き家';
    }
    if (site.tag === 'exp:well' && s) { sim.pushLog(`${s.name}に井戸が掘り上がった。冷たい水をみんなで回し飲みした。`, 'event', [], b.door); return true; }
    return false;
  },
  cancel(sim, site, b) { if (b && site.tag === 'exp:house') b.hh = null; },
});
// ---------- 開拓村：宿なしの家族の家 ----------
export function consExpHome(sim, b, h, s, k, pr) {
  if (!b || !h) return false;
  const site = consBegin(sim, b, { tag: 'exp:home', sid: s.id, k: pr?.k ?? s.kingdom, payer: 'k' + k.id, data: { hh: h.id } });
  if (!site) return false;
  // 住む家族も手伝う（日当なし）
  const helpers = h.members.map((id) => sim.S.people[id]).filter((p) => alive(p) && sim.isAdult(p) && p.consSite == null);
  for (const p of helpers.slice(0, 2)) { p.consSite = site.id; site.crew.push({ id: p.id, role: 'labor', pay: false }); }
  return true;
}
registerConsAdapter('exp:home', {
  done(sim, site, b) {
    const h = sim.S.households[site.data.hh];
    if (!b) return false;
    if (h && (h.street || h.house == null || h.inn) && h.s === site.sid) {
      h.house = b.id; h.street = false; h.inn = false; b.hh = h.id; b.owner = h.id; b.name = h.name; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0;
      for (const id of h.members) { const p = sim.S.people[id]; if (alive(p) && sim.ageOf(p) >= 8) sim.remember(p, `開拓村に自分たちの家ができた。もう野宿しなくていい`, { emo: 0.85, imp: 0.8, k: 'house' }); }
      sim.pushLog(`${sim.town(site.sid)?.name || ''}に、宿なしだった${h.name}の家が建った（着工から${sim.today - site.day0}日）。`, 'event', h.members.slice(0, 2), b.door);
      return true;
    }
    b.name = '空き家'; b.hh = null;
    return false;
  },
});
// ---------- 家の建て増し（二階建て） ----------
export function consHousing(sim, b, hh, payer, j, MATS, WAGE) {
  const C = ensureCons(sim);
  if (j.site != null) {
    if (C.sites[j.site]) return true;
    const fin = j.consFin; delete j.site;
    return fin ? 'done' : false;
  }
  const got = {};
  for (const [g, n] of Object.entries(MATS)) { const q = Math.max(0, n - (j.need?.[g] || 0)); if (q > 0.01) got[g] = q; }
  const f = (g, x) => (got[g] ? got[g] * x : 0);
  const bom = [{}, {}, {}, { wood: f('wood', 0.55), iron_nail: f('iron_nail', 0.5) }, { stone: f('stone', 1), wood: f('wood', 0.2) }, { wood: f('wood', 0.25), iron_nail: f('iron_nail', 0.5) }, {}];
  for (const st of bom) for (const g of Object.keys(st)) if (!(st[g] > 0.001)) delete st[g];
  const crew = [];
  for (const [role, pid] of [['carp', j.carp], ['mason', j.mason]]) { const p = pid != null ? sim.S.people[pid] : null; if (alive(p) && (p.consSite == null || !C.sites[p.consSite])) crew.push({ id: p.id, role: CARP.has(p.job) ? 'carp' : MASON.has(p.job) ? 'mason' : role === 'carp' ? 'carp' : 'labor', pay: true }); }
  if (!crew.length) return false;
  const name = `${/家$/.test(hh.name || '') ? hh.name : `${hh.name}の家`}の二階の建て増し`;
  const site = newSite(sim, {
    form: 'up', tag: 'expand2f', name, sid: hh.s, k: sim.town(hh.s)?.kingdom ?? null, payer: { hh: payer.id }, b: b.id, x: b.x, z: b.z, w: b.w, d: b.d, yard: pickYard(sim, b),
    bom, work: Math.round(9 * b.w * b.d), fixed: false, wage: { carp: (WAGE?.carp || 12) / 9, mason: (WAGE?.mason || 10) / 9, labor: 1 }, data: { onSpend: 'housing' },
  });
  // 材料は施主がもう市場で買ってある（housing.js）。あとは運ぶだけ
  for (const [g, q] of Object.entries(got)) { site.bought[g] = q; site.pend[hh.s + ':' + g] = q; }
  for (const g of Object.keys(site.need)) { site.onsite[g] = site.onsite[g] || 0; site.used[g] = site.used[g] || 0; site.transit[g] = site.transit[g] || 0; site.bought[g] = site.bought[g] || 0; }
  if (j.makeshift) site.subs.push(j.makeshift);
  site.skip = ['found'];
  b.uc = site.id;
  setCrew(sim, site, crew);
  j.site = site.id;
  announceStart(sim, site);
  return true;
}
registerConsAdapter('expand2f', {
  check(sim, site) { const j = sim.S.housing?.jobs?.[site.b]; return j ? null : '建て増しの話がなくなった'; },
  done(sim, site, b) {
    const j = sim.S.housing?.jobs?.[site.b];
    if (j) j.consFin = true;
    const h = adapt().housingApi;
    if (h?.finish && b) { h.finish(sim, b.id); return true; }
    return false;
  },
});
registerConsAdapter('housing', { spent(sim, site, x) { const j = sim.S.housing?.jobs?.[site.b]; if (j) j.spent = (j.spent || 0) + x; } });
// ---------- 町の新しい建物（buildings.js） ----------
registerConsAdapter('town', {
  done(sim, site, b) {
    if (!b) return false;
    const S = sim.S, s = sim.town(site.sid);
    if (S.bld && s) { (S.bld.at[s.id] = S.bld.at[s.id] || {})[b.type] = b.id; }
    sim.news(`${s?.name || ''}に${b.name}が建った（着工から${sim.today - site.day0}日）`, 1, { x: b.door.x, z: b.door.z });
    if (s && s.kingdom != null) sim.chron(`${s.name}に${b.name}が建てられた`, s.kingdom);
    return true;
  },
});

// ---------- 道・街道・橋：今の普請の頭（見た目と詳細欄のため） ----------
// civic.js（国の普請）、diplomacy.js（街道）、expansion.js（開拓村への道）の「次に敷くマス」を読む。書きかえはしない
export function consRoadsAhead(sim) {
  const S = sim.S, out = [];
  for (const job of S.civic?.works || []) {
    if (!(job.next < job.tiles.length)) continue;
    const kind = job.kind === 'bridge' ? 'bridge' : 'road';
    for (let j = 0; j < 4 && job.next + j < job.tiles.length; j++) out.push({ i: job.tiles[job.next + j], p: j === 0 ? Math.min(1, (job.prog || 0) / 2.2) : 0, a: j, kind, src: 'civic', name: job.name });
  }
  for (const r of S.diplo?.roads || []) {
    if (r.stage !== 'build' && r.stage !== 'purge') continue;
    if (!(r.lo <= r.hi)) continue;
    const bank = r.bank || {};
    for (let j = 0; j < 4 && r.lo + j <= r.hi; j++) out.push({ i: r.todo[r.lo + j], p: j === 0 ? Math.min(0.9, (bank.part1 || 0)) : 0, a: j, kind: 'road', src: 'diplo', name: r.name });
    if (r.partner != null) for (let j = 0; j < 4 && r.hi - j >= r.lo; j++) out.push({ i: r.todo[r.hi - j], p: j === 0 ? Math.min(0.9, (bank.part2 || 0)) : 0, a: j, kind: 'road', src: 'diplo', name: r.name });
  }
  for (const pr of S.expansion?.projects || []) {
    if (!pr.road || !pr.road.length || pr.stage !== 'settle') continue;
    for (let j = 0; j < 4 && j < pr.road.length; j++) out.push({ i: pr.road[j], p: 0, a: j, kind: 'road', src: 'exp', name: `${pr.name || '開拓村'}への道` });
  }
  const w = S.world;
  for (const o of out) if (w.tiles[o.i] === T.RIVER) o.kind = 'bridge';
  return out;
}

// ================================================================ 画面（詳細欄）
function siteHTML(sim, site, esc, link) {
  const S = sim.S;
  let stage;
  if (site.form === 'line') {
    const n = site.tiles.length;
    stage = `${LINE_JP[site.lk] || '普請'} ${site.ti}/${n}${LINE_UNIT[site.lk] || ''}（${Math.round(100 * (site.ti + site.tp) / n)}%）`;
  } else {
    const chain = STAGES.slice(0, DONE).map((s2, i) => {
      if (site.tag === 'expand2f' && s2.k === 'found') return null;
      if (i < site.st) return `<span class="dead">${s2.jp}✓</span>`;
      if (i === site.st) return `<b>${s2.jp} ${s2.k === 'gather' ? `${gatherPct(site)}%` : `${Math.round(site.sp * 100)}%`}</b>`;
      return `<span class="dead">${s2.jp}</span>`;
    }).filter(Boolean).join(' → ');
    stage = chain;
  }
  const mats = Object.keys(site.need).filter((g) => site.need[g] > 0.05).map((g) => {
    const here = (site.onsite[g] || 0) + (site.used[g] || 0);
    const extra = [];
    const atMk = Object.entries(site.pend).filter(([k]) => k.endsWith(':' + g)).reduce((a, [, v]) => a + v, 0);
    if (site.transit[g] > 0.05) extra.push(`運搬中${Math.round(site.transit[g])}`);
    if (atMk > 0.05) extra.push(`市場に買い置き${Math.round(atMk)}`);
    return `${esc(matName(g))} ${Math.round(here)}/${Math.round(site.need[g])}${extra.length ? `<span class="dead">（${extra.join('・')}）</span>` : ''}`;
  }).join('・') || 'なし';
  const crew = site.crew.map((c) => { const p = S.people[c.id]; if (!alive(p)) return ''; const on = p.action?.type === 'construct' && p.action.phase === 'do' ? '●' : p.consHaul ? '⇢' : ''; return `${on}${link(p, p.given)}<span class="dead">（${ROLE_JP[c.role]}）</span>`; }).filter(Boolean).join('、') || 'まだいない';
  const why = stallText(site);
  const days = sim.today - site.day0;
  return `<div class="section"><h4>普請（${esc(site.name)}）</h4><dl class="kv">
    <dt>段階</dt><dd>${stage}</dd>
    <dt>資材</dt><dd>${mats}</dd>
    <dt>働く人</dt><dd>${crew}<br><span class="dead">●＝いま現場で働いている　⇢＝資材を運んでいる</span></dd>
    ${why ? `<dt>止まっている理由</dt><dd><b class="down">${esc(why)}</b></dd>` : ''}
    <dt>施主</dt><dd>${esc(payerLabel(sim, site))}${site.wage === 0 ? '（自分たちの手で建てている）' : ''}</dd>
    <dt>着工</dt><dd>${days ? `${days}日前` : '今日'}・資材の運搬${site.hauls}回・資材代${Math.round(site.spent)}銅貨</dd>
    ${site.subs.length ? `<dt>間に合わせ</dt><dd>${esc(site.subs.join('。'))}</dd>` : ''}
  </dl></div>`;
}
function gatherPct(site) {
  let need = 0, have = 0;
  for (const g of Object.keys(site.need)) { need += site.need[g]; have += Math.min(site.need[g], (site.onsite[g] || 0) + (site.used[g] || 0)); }
  return need > 0 ? Math.round((have / need) * 100) : 100;
}
export function constructBuildingHTML(sim, b, esc = (s) => String(s), link = (p) => esc(p?.given || '')) {
  const C = sim.S.cons;
  if (!C || !b) return '';
  const site = b.uc != null ? C.sites[b.uc] : null;
  if (site) return siteHTML(sim, site, esc, link);
  if (b.type === 'site') return `<div class="section"><h4>普請</h4><dl class="kv"><dt>段階</dt><dd>建てかけのまま、普請が止まっている</dd></dl></div>`;
  return '';
}
export function constructTileHTML(sim, x, z, esc = (s) => String(s), link = (p) => esc(p?.given || '')) {
  const C = sim.S.cons;
  if (!C) return '';
  let h = '';
  for (const site of Object.values(C.sites)) {
    const hc = headXZ(site), y = site.yard;
    const near = cheb(x, z, Math.round(hc.x), Math.round(hc.z)) <= (site.form === 'line' ? 2 : Math.max(site.w, site.d)) || (y && cheb(x, z, y.x, y.z) <= 1);
    if (near) h += siteHTML(sim, site, esc, link);
  }
  for (const o of consRoadsAhead(sim)) {
    if (o.a !== 0 || cheb(x, z, o.i % W, (o.i / W) | 0) > 1) continue;
    const rain = consHalt(sim, x, z);
    h += `<div class="section"><h4>${esc(o.name)}</h4><dl class="kv"><dt>いまの普請</dt><dd>${o.kind === 'bridge' ? '橋桁を立てて板を渡している' : '土を掘り、石を敷いている'}${rain ? `<br><b class="down">${WX_JP[rain] || '悪い天気'}で工事を休んでいる</b>` : ''}</dd></dl></div>`;
    break;
  }
  return h;
}
// 試験・画面用のまとめ
export function constructSummary(sim) {
  const C = ensureCons(sim);
  const st = C.stats;
  return {
    active: Object.keys(C.sites).length, started: st.started, done: st.done, cancel: st.cancel, avgDays: st.done ? r1(st.daysSum / st.done) : null,
    hauls: st.hauls, convoy: st.convoy, kg: Math.round(st.kg), byHow: st.byHow, stallH: st.stallH, byTag: st.byTag, doneTag: st.doneTag,
    wagesOwed: Math.round(st.wagesOwed), wagesPaid: Math.round(st.wagesPaid), matCost: Math.round(st.matCost), imports: st.imports, subs: st.subs, topped: st.topped, called: st.called, tiles: st.tiles,
    sites: Object.values(C.sites).map((s) => `${s.tag}:${s.name}:${s.form === 'line' ? `${s.ti}/${s.tiles.length}` : STAGES[s.st].jp + Math.round(s.sp * 100) + '%'}:${s.stall || ''}`),
  };
}
