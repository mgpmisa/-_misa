// 薬草園と、薬草を摘む場所（経済部 素材の担当）
//
// 社長の指示：「街中で草を採るのはおかしい。全てに意味を持たせる」
//   ・野に自生する草・花・虫・小さな獣は、町の中では摘まない・拾わない（町の中で拾えるのは水・くず鉄・石ころ・ぼろ布などだけ）
//   ・薬草摘みは、町の外の森・草原・川辺・沼へ出かけて摘む
//   ・町には薬草園（薬草栽培所）があり、園丁が畝で薬草を育てて収穫する（冬はほとんど採れない）
//
// ■ 本体からの呼び方（部長がつなぐ）
//   ensureHerbGardens(sim)       … newWorld と load の ensureBuildings のあと（古いセーブにも園を作る）
//   herbPlace(sim, p, kind)      … placeFor の villagesPlace のあと。園丁の畝、薬草摘みの野山
//   herbWork(sim, p, dt, eff)    … doWork の default（buildingsWork のあと）。園丁が育てて収穫する
//   herbDaily(sim)               … newDay（buildingsDaily のあと）。園丁の補充、新しい町の園
//   urbanAt(sim, p)              … その人が町の中にいるか（matter.js の「摘む・拾う」と genericWork の薬草摘みが使う）
//
// ■ お金の流れ
//   ここではお金は動かない。収穫した薬草は園丁の家の蔵に入り、市場で売ったとき（market.js の sellHousehold）に
//   買い手（薬師・錬金術師・市場の金庫）から代金を受け取る。株は園で株分けして増やすので、苗は買わない。
import { JOBS, GOODS } from './data.js';
import { T, W, H, tryPlace, tileAt } from './world.js';
import { stash } from './market.js';
import { MAT, markSeen, MATTER_HOOK } from './matter.js';
import { markTilesChanged } from './pathfar.js';
import { tooDangerous } from './danger.js';

if (!JOBS.herbgrower) JOBS.herbgrower = { name: '薬草園の園丁', place: 'herbgarden', rank: 'commoner' };
export const HERB_LABEL = '薬草園';


// ---------- 状態 ----------
function HG(sim) {
  const S = sim.S;
  S.herbg = S.herbg || { v: 1, at: {}, stats: {} };
  const G = S.herbg; G.at = G.at || {}; G.stats = G.stats || {};
  return G;
}
const alive = (p) => p && p.deathYear == null && p.needs;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

// ---------- 町の中か ----------
const URBAN_T = new Set([T.ROAD, T.PLAZA, T.BLD, T.WALL, T.FENCE, T.DOCK, T.BRIDGE]);
const OPEN_BLD = new Set(['mine', 'cave', 'dungeon', 'ruins', 'pyramid', 'demoncastle', 'camp', 'lair', 'nest']);
export function urbanXZ(sim, x, z) {
  const w = sim.S.world;
  x = Math.round(x); z = Math.round(z);
  for (const s of w.settlements || []) {
    if (!s || s.gone) continue;
    if (cheb(x, z, s.x, s.z) <= (s.r || 4) + (s.extraR || 0)) return true;
  }
  let n = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
    if (URBAN_T.has(tileAt(w, xx, zz))) n++;
  }
  return n >= 4;
}
export function urbanAt(sim, p) {
  if (!p?.pos) return false;
  if (p.inside != null) { const b = sim.building(p.inside); if (b && !OPEN_BLD.has(b.type)) return true; if (b) return false; }
  return urbanXZ(sim, p.pos.x, p.pos.z);
}

MATTER_HOOK.urban = urbanAt;   // matter.js の「摘む・拾う」が町の中かを聞く

// ---------- 園を置く ----------
const LAND = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH];
const LAND_WIDE = [...LAND, T.DENSE, T.JUNGLE];
const eligible = (sim, s) => s && !s.tribe && !s.tribal && !s.gone && sim.S.towns?.[s.id];
function popOf(sim) { const c = {}; for (const p of sim.living()) c[p.s] = (c[p.s] || 0) + 1; return c; }
function placeGarden(sim, s, runtime) {
  const w = sim.S.world, R = sim.rng;
  const streetsIn = (r0, r1) => {
    const out = [];
    for (let z = s.z - r1; z <= s.z + r1; z++) for (let x = s.x - r1; x <= s.x + r1; x++) {
      if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
      const t = w.tiles[z * W + x];
      if (t !== T.ROAD && t !== T.PLAZA) continue;
      const ch = cheb(x, z, s.x, s.z);
      if (ch < r0 || ch > r1) continue;
      out.push({ x, z, d: -(Math.abs(x - s.x) + Math.abs(z - s.z)) + R.next() * 2 });   // 町の縁から探す（畑は日当たりのよい外まわりに）
    }
    return out.sort((a, b) => a.d - b.d);
  };
  const name = `${s.name || ''}の薬草園`;
  const extra = { herbGarden: true };
  const RR = s.type === 'capital' ? s.r + 1 : s.r + (s.extraR || 0);
  let b = null;
  for (const [ww, dd] of [[4, 3], [3, 3], [3, 2]]) {
    if (b) break;
    b = tryPlace(w, { x: s.x, z: s.z, r: RR, id: s.id, kingdom: s.kingdom }, streetsIn(0, RR), 'herbgarden', name, ww, dd, { extra }, R);
    for (let k = 1; !b && k <= 4; k++) b = tryPlace(w, { x: s.x, z: s.z, r: RR + k * 3, id: s.id, kingdom: s.kingdom }, streetsIn(0, RR + k * 3), 'herbgarden', name, ww, dd, { extra, land: LAND_WIDE }, R);
  }
  if (!b) return null;
  if (s.kingdom == null) b.kingdom = null;
  // 中を歩ける庭（墓地と同じ）。畝のあいだを園丁が歩く
  for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) w.tiles[z * W + x] = T.PLAZA;
  b.yard = true;
  s.buildings = s.buildings || [];
  s.buildings.push(b.id);
  HG(sim).at[s.id] = b.id;
  if (runtime) {
    const list = [];
    for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++) list.push(z * W + x);
    try { markTilesChanged(w, list); } catch (e) { /* 道探しの区画がまだないとき */ }
    sim.events.push({ type: 'building', id: b.id });
  }
  return b;
}
export function gardenOf(sim, sid) {
  const id = HG(sim).at[sid];
  const b = id != null ? sim.building(id) : null;
  return b && b.type === 'herbgarden' ? b : null;
}
export function ensureHerbGardens(sim, runtime = false) {
  const G = HG(sim), pop = popOf(sim);
  for (const s of sim.S.world.settlements) {
    // 王都と、人が20人以上の町・港・村に1つ（小さな村は薬草摘みが野山で摘む分で足りる）
    if (!eligible(sim, s) || (s.type !== 'capital' && (pop[s.id] || 0) < 20)) continue;
    if (gardenOf(sim, s.id)) continue;
    // 古いセーブで、すでに園があれば拾い直す
    const old = (s.buildings || []).map((id) => sim.building(id)).find((b) => b?.type === 'herbgarden');
    if (old) { G.at[s.id] = old.id; continue; }
    if (placeGarden(sim, s, runtime)) G.stats.built = (G.stats.built || 0) + 1;
  }
  for (const s of sim.S.world.settlements) if (gardenOf(sim, s.id)) staff(sim, s, pop);
  return G;
}

// ---------- 園丁 ----------
const SPARE = { gatherer: 0, hunter: 1, fisher: 2, sailor: 1, farmer: 4, militia: 1, laundress: 0, roadworker: 1, peddler: 0, bard: 0, musician: 1, beggar: 0, wanderer: 0 };
const OK_RANK = new Set(['commoner', 'citizen', 'homeless', 'wanderer']);
function staff(sim, s) {
  const S = sim.S;
  const locals = sim.living().filter((p) => p.s === s.id);
  if (locals.some((p) => p.job === 'herbgrower')) return;
  const count = {};
  for (const p of locals) count[p.job] = (count[p.job] || 0) + 1;
  const cands = locals.filter((p) => {
    const a = sim.ageOf(p);
    if (a < 18 || a > 62 || p.jail != null || S.wanted?.[p.id] || !OK_RANK.has(p.rank) || p.mission || p.party != null || p.expProj != null) return false;
    const h = sim.hh(p); if (!h || h.bandits || h.royal) return false;
    const keep = SPARE[p.job];
    return !p.job || (keep != null && (count[p.job] || 0) > keep);
  });
  if (!cands.length) return;
  // 薬草にくわしい薬草摘みを先に。次に仕事のない人
  cands.sort((a, b) => (b.job === 'gatherer' ? 2 : !b.job ? 1 : 0) - (a.job === 'gatherer' ? 2 : !a.job ? 1 : 0));
  const p = cands[0];
  p.job = 'herbgrower';
  p.skill = p.skill || {};
  p.skill.herbgrower = Math.max(p.skill.herbgrower || 0, p.skill.gatherer || 0.2);
  HG(sim).stats.hired = (HG(sim).stats.hired || 0) + 1;
  if (sim.remember) sim.remember(p, `${s.name || '町'}の薬草園をまかされた`, { emo: 0.4, imp: 0.5 });
}

// ---------- 居場所 ----------
const WILD_T = new Set([T.FOREST, T.DENSE, T.JUNGLE, T.GRASS, T.SAVANNA, T.SWAMP]);
function nearWater(w, x, z) { for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = tileAt(w, x + a, z + b); if (t === T.RIVER) return true; } return false; }
export function herbPlace(sim, p, kind) {
  if (p.job === 'herbgrower' && kind === 'herbgarden') {
    const b = gardenOf(sim, p.s);
    if (!b) return sim.placeFor(p, 'field');
    const R = sim.rng;
    return { x: b.x + R.int(0, b.w - 1), z: b.z + R.int(0, b.d - 1) };
  }
  if (p.job === 'gatherer' && (kind === 'forest' || kind === 'wild')) {
    // 薬草は野に自生する：町の外の森・草原・川辺・沼へ。町の中や畑には行かない
    const s = sim.townOf(p), w = sim.S.world, R = sim.rng;
    if (!s) return null;   // 民族の里の薬草摘みも、里の外の森・草原へ出かける
    const r0 = (s.r || 4) + (s.extraR || 0) + 2;
    let best = null, bs = -1;
    for (let i = 0; i < 40; i++) {
      const ang = R.next() * Math.PI * 2, d = r0 + R.next() * 14;
      const x = Math.round(s.x + Math.cos(ang) * d), z = Math.round(s.z + Math.sin(ang) * d);
      if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
      const t = tileAt(w, x, z);
      if (!WILD_T.has(t) || urbanXZ(sim, x, z) || tooDangerous(sim, p, x, z)) continue;
      const sc = (t === T.FOREST || t === T.DENSE || t === T.JUNGLE ? 2 : 1) + (nearWater(w, x, z) || t === T.SWAMP ? 1 : 0) + R.next();
      if (sc > bs) { bs = sc; best = { x, z }; }
      if (bs >= 3) break;
    }
    return best;
  }
  return null;
}
function inPlot(b, pos) { return pos && pos.x >= b.x - 1.5 && pos.x <= b.x + b.w + 0.5 && pos.z >= b.z - 1.5 && pos.z <= b.z + b.d + 0.5; }

// ---------- 育てて収穫する ----------
let GARDEN_IDS = null;
function gardenIds() {
  if (GARDEN_IDS?.length) return GARDEN_IDS;
  GARDEN_IDS = [];
  for (const it of MAT.values()) {
    if (it.cat !== 'plant' || (it.rare || 0) > 1) continue;
    if (!it.use?.some((u) => u.k === 'medicine')) continue;
    if (!it.src?.some((s) => s.how === 'harvest' && (s.on || []).some((o) => o === 'farm' || o === 'field' || o === 'town'))) continue;
    GARDEN_IDS.push(it.id);
  }
  return GARDEN_IDS;
}
const SEASON = [1.0, 1.2, 0.9, 0.15];   // 春・夏・秋・冬（冬は温床の分だけ）
export function herbWork(sim, p, dt, eff) {
  if (p.job !== 'herbgrower') return false;
  const b = gardenOf(sim, p.s);
  if (!b || !inPlot(b, p.pos)) return true;
  const hh = sim.hh(p); if (!hh) return true;
  const G = HG(sim), R = sim.rng, hr = dt / 60;
  const sm = SEASON[sim.seasonIdx ? sim.seasonIdx() : 0] ?? 1;
  const m = sim.S.towns[p.s], tgt = GOODS.herbs?.target || 12;
  // 作りすぎない：市場にも家にも余っていれば、手入れだけ（株分け・草取り）
  if ((m?.stock?.herbs || 0) >= tgt * 2 && (hh.stock?.herbs || 0) >= tgt) { G.stats.idle = (G.stats.idle || 0) + hr; return true; }
  const q = 0.6 * eff * sm;
  if (q > 0) { stash(sim, p, 'herbs', q); G.stats.herbs = (G.stats.herbs || 0) + q; }
  // 園で育てる薬草（物の一覧の、畑で育つ薬）もときどき
  const ids = gardenIds();
  if (ids.length && R.chance(Math.min(0.9, 0.2 * hr * sm))) {
    const id = R.pick(ids);
    if ((hh.stock?.[id] || 0) < 20) { stash(sim, p, id, 1); markSeen(sim, id, { hh: hh.id, s: p.s, how: 'harvest', p: p.id }); G.stats.extra = (G.stats.extra || 0) + 1; }
  }
  if (p.needs) p.needs.esteem = Math.min(100, (p.needs.esteem || 0) + 0.3 * hr);
  return true;
}

// ---------- 1日ごと ----------
export function herbDaily(sim) {
  const G = HG(sim);
  if ((sim.today || 0) % 7 === 0 || !G.ready) { ensureHerbGardens(sim, true); G.ready = true; return; }
  const pop = popOf(sim);
  for (const s of sim.S.world.settlements) if (gardenOf(sim, s.id) && (pop[s.id] || 0) >= 3) staff(sim, s);
}
export function herbRows(sim, b) {
  const g = sim.living().find((p) => p.job === 'herbgrower' && p.s === b.settlement);
  return [['園丁', g ? `${g.given || g.name || ''}` : 'いない'], ['育てている物', '薬草（冬はほとんど採れない）']];
}
