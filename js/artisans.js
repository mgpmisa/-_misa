// 物の出どころ 第2段（経済部 素材の担当）
//
// 社長の許可した案：
//   1. 世界に1人もいなかった職人を町に置く：宝石職人・錬金術師・書記・画家（王都）、炭焼き（森のそばの町と村）。
//      炭焼きには町はずれの「炭焼き窯」（3D は bldgfx.js の charkiln）。仕事の動きは既存（coins・flask・write・paint・dig）。
//      細かい作り手（香づくり・付与術師・杖職人・紙すき・製本など）は、今いる近い職が代わりに作る（matter.js の MAKER）。
//   2. 家畜：王国の馬は馬丁（いなければ御者・牧場主）の家が世話をする。砂地の町や里はらくだ、寒い土地はとなかいを飼う。
//   3. 墓守は墓地で墓の苔を、猫を飼う家は抜けたひげを拾う（それ以外の魔王城・遺跡の物は matter.js で宝箱の中身に）。
//
// ■ 本体からの呼び方（部長がつなぐ）
//   ensureArtisans(sim)          … newWorld と load の ensureHerbGardens のあと
//   artisanPlace(sim, p, kind)   … placeFor の herbPlace のあと（炭焼きは窯か町の外の森）
//   artisanWork(sim, p, dt, eff) … doWork の default（herbWork のあと）
//   artisanDaily(sim)            … newDay（herbDaily のあと）
//
// ■ お金の流れ
//   ここではお金は動かない。職人の給金・売り上げは今までの仕組み（書記は給料日に国庫から、ほかは作った物を市場で売って）。
//   はじめに置く家畜（らくだ・となかい）は世界ができたときの持ち物で、買い物ではない。拾った苔やひげは家の蔵へ入り、売ったときにお金になる。
import { JOBS, SPECIES } from './data.js';
import { T, W, H, tryPlace, tileAt } from './world.js';
import { stash } from './market.js';
import { markSeen, MAT } from './matter.js';
import { makeCreature, townMask } from './creatures.js';
import { markTilesChanged } from './pathfar.js';
import { tooDangerous } from './danger.js';
import { urbanXZ } from './herbgarden.js';

function AR(sim) {
  const S = sim.S;
  S.artisans = S.artisans || { v: 1, kiln: {}, herd: {}, stats: {} };
  const A = S.artisans; A.kiln = A.kiln || {}; A.herd = A.herd || {}; A.stats = A.stats || {};
  return A;
}
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
const kingdomTown = (sim, s) => s && !s.tribe && !s.tribal && !s.gone && sim.S.towns?.[s.id];
function popOf(sim) { const c = {}; for (const p of sim.living()) c[p.s] = (c[p.s] || 0) + 1; return c; }
function tilesNear(sim, s, r, set) {
  const w = sim.S.world; let n = 0;
  for (let z = s.z - r; z <= s.z + r; z += 2) for (let x = s.x - r; x <= s.x + r; x += 2) {
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    if (set.has(tileAt(w, x, z))) n++;
  }
  return n;
}
const FOREST = new Set([T.FOREST, T.DENSE, T.JUNGLE]);

// ================================================================ 1. 職人を置く
// 農夫・漁師は回さない（町の食べ物を減らさない）
// 王都に1人ずつ：仕事場は 宝石職人＝職人の工房、錬金術師＝研究の塔、書記＝王城、画家＝広場（画架を立てて描く）
const CAPITAL_JOBS = ['jeweler', 'alchemist', 'scribe', 'painter'];
const SPARE = { gatherer: 1, hunter: 1, sailor: 1, militia: 1, laundress: 0, roadworker: 1, peddler: 0, bard: 0, musician: 1, beggar: 0, wanderer: 0, hermit: 0, woodcutter: 2 };
const PREF = { jeweler: ['smith', 'potter'], alchemist: ['herbalist', 'wizard'], scribe: ['librarian', 'scholar', 'teacher'], painter: ['potter', 'weaver', 'bard'], charcoal: ['woodcutter'] };
const OK_RANK = new Set(['commoner', 'citizen', 'homeless', 'wanderer']);
function hire(sim, s, job, locals, count) {
  const S = sim.S, pref = PREF[job] || [];
  const cands = locals.filter((p) => {
    const a = sim.ageOf(p);
    if (a < 18 || a > 60 || p.jail != null || S.wanted?.[p.id] || !OK_RANK.has(p.rank) || p.mission || p.party != null || p.expProj != null) return false;
    const h = sim.hh(p); if (!h || h.bandits || h.royal) return false;
    if (pref.includes(p.job) && (count[p.job] || 0) > 1) return true;
    const keep = SPARE[p.job];
    return !p.job || (keep != null && (count[p.job] || 0) > keep);
  });
  if (!cands.length) return null;
  const sc = (p) => (pref.includes(p.job) ? 3 : 0) + (!p.job ? 1 : 0) + (p.pers?.O || 0);
  cands.sort((a, b) => sc(b) - sc(a));
  const p = cands[0];
  count[p.job] = (count[p.job] || 1) - 1; count[job] = (count[job] || 0) + 1;
  p.job = job;
  p.skill = p.skill || {}; p.skill[job] = Math.max(p.skill[job] || 0, 0.3);
  AR(sim).stats.hired = (AR(sim).stats.hired || 0) + 1;
  if (sim.remember) sim.remember(p, `${JOBS[job]?.name || job}として${s.name || '町'}で働きはじめた`, { emo: 0.4, imp: 0.5 });
  return p;
}
function staffTown(sim, s, pop) {
  const locals = sim.living().filter((p) => p.s === s.id);
  const count = {}; for (const p of locals) count[p.job] = (count[p.job] || 0) + 1;
  if (s.type === 'capital') for (const j of CAPITAL_JOBS) if (!count[j]) hire(sim, s, j, locals, count);
  if (kilnOf(sim, s.id) && !count.charcoal && (pop[s.id] || 0) >= 20) hire(sim, s, 'charcoal', locals, count);
}

// 炭焼き窯（町はずれ、森の近く）
export function kilnOf(sim, sid) { const id = AR(sim).kiln[sid]; const b = id != null ? sim.building(id) : null; return b && b.type === 'charkiln' ? b : null; }
function placeKiln(sim, s, runtime) {
  const w = sim.S.world, R = sim.rng;
  const RR = (s.type === 'capital' ? s.r + 1 : s.r + (s.extraR || 0));
  const streets = [];
  for (let z = s.z - RR - 6; z <= s.z + RR + 6; z++) for (let x = s.x - RR - 6; x <= s.x + RR + 6; x++) {
    if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
    const t = w.tiles[z * W + x];
    if (t !== T.ROAD && t !== T.PLAZA) continue;
    let f = 0; for (let dz = -4; dz <= 4; dz += 2) for (let dx = -4; dx <= 4; dx += 2) if (FOREST.has(tileAt(w, x + dx, z + dz))) f++;
    streets.push({ x, z, d: -cheb(x, z, s.x, s.z) - f * 2 + R.next() * 2 });   // 町の外れで、森に近い道ばた
  }
  streets.sort((a, b) => a.d - b.d);
  const land = [T.GRASS, T.SAVANNA, T.FOREST, T.DENSE, T.JUNGLE, T.SNOW, T.DESERT];
  let b = null;
  for (const [ww, dd] of [[3, 2], [2, 2]]) { if (b) break; b = tryPlace(w, { x: s.x, z: s.z, r: RR + 6, id: s.id, kingdom: s.kingdom }, streets, 'charkiln', `${s.name || ''}の炭焼き窯`, ww, dd, { extra: { charKiln: true }, land }, R); }
  if (!b) return null;
  if (s.kingdom == null) b.kingdom = null;
  for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) w.tiles[z * W + x] = T.PLAZA;   // 窯のまわりを歩ける土場
  b.yard = true;
  (s.buildings = s.buildings || []).push(b.id);
  AR(sim).kiln[s.id] = b.id;
  if (runtime) {
    const list = [];
    for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++) list.push(z * W + x);
    try { markTilesChanged(w, list); } catch (e) { /* 道探しの区画がまだないとき */ }
    sim.events.push({ type: 'building', id: b.id });
  }
  return b;
}

// ================================================================ 2. 家畜
function herdKeeper(sim, s, jobs) {
  const S = sim.S;
  const hhs = Object.values(S.households).filter((h) => h.s === s.id && !h.royal && !h.bandits && h.members.some((id) => S.people[id]?.deathYear == null));
  for (const j of jobs) { const h = hhs.find((x) => x.members.some((id) => S.people[id]?.job === j && S.people[id]?.deathYear == null)); if (h) return h; }
  return null;
}
function ensureHerds(sim) {
  const S = sim.S, A = AR(sim), R = sim.rng;
  const all = Object.values(S.creatures);
  // 馬：町の馬（持ち主が町）に世話をする家を決める
  for (const c of all) {
    if (c.sp !== 'horse' || c.owner == null || (c.keeper != null && S.households[c.keeper]) || c.hp <= 0) continue;
    const s = sim.town(c.owner); if (!s) continue;
    const h = herdKeeper(sim, s, ['stablehand', 'coachman', 'rancher', 'shepherd', 'farmer']);
    if (h) { c.keeper = h.id; A.stats.horse = (A.stats.horse || 0) + 1; }
  }
  // らくだ（砂地）・となかい（寒い土地）：ふさわしい町と里に2頭ずつ
  for (const s of S.world.settlements) {
    if (!s || s.gone || A.herd[s.id]) continue;
    const desert = tilesNear(sim, s, (s.r || 4) + 12, new Set([T.DESERT]));
    const snow = tilesNear(sim, s, (s.r || 4) + 12, new Set([T.SNOW]));
    const sp = desert >= 25 && desert >= snow && SPECIES.camel ? 'camel' : snow >= 25 && SPECIES.reindeer ? 'reindeer' : null;
    A.herd[s.id] = sp || '-';
    if (!sp) continue;
    const h = herdKeeper(sim, s, ['rancher', 'shepherd', 'hunter', 'farmer', 'gatherer', 'stablehand', 'coachman']);
    if (!h) { A.herd[s.id] = null; continue; }
    for (let i = 0; i < 2; i++) {
      const at = s.ranch ? { x: R.int(s.ranch.x0, s.ranch.x1), z: R.int(s.ranch.z0, s.ranch.z1) } : sim.randomNear(s.x, s.z, (s.r || 4) + 8, (t, x, z) => !townMask(sim)[z * W + x] && (t === T.GRASS || t === T.SAVANNA || t === T.DESERT || t === T.SNOW || t === T.PASTURE));
      if (!at) continue;
      const c = makeCreature(sim, sp, at.x, at.z, { owner: s.id, range: 0, age: R.int(30, 150) });
      if (!c || !S.creatures[c.id] || c.hp <= 0) continue;
      c.keeper = h.id; c.sex = i === 0 ? 'f' : 'm';
      A.stats[sp] = (A.stats[sp] || 0) + 1;
    }
  }
}

// ================================================================ 呼び口
export function ensureArtisans(sim, runtime = false) {
  const A = AR(sim), pop = popOf(sim);
  for (const s of sim.S.world.settlements) {
    if (!kingdomTown(sim, s) || kilnOf(sim, s.id)) continue;
    if ((pop[s.id] || 0) < 20 || tilesNear(sim, s, (s.r || 4) + 10, FOREST) < 12) continue;
    const old = (s.buildings || []).map((id) => sim.building(id)).find((b) => b?.type === 'charkiln');
    if (old) A.kiln[s.id] = old.id; else placeKiln(sim, s, runtime);
  }
  for (const s of sim.S.world.settlements) if (kingdomTown(sim, s)) staffTown(sim, s, pop);
  ensureHerds(sim);
  return A;
}
export function artisanPlace(sim, p, kind) {
  if (p.job !== 'charcoal' || (kind !== 'forest' && kind !== 'wild')) return null;
  const s = sim.townOf(p); if (!s) return null;
  const k = kilnOf(sim, p.s), R = sim.rng;
  // 半分は窯の番（火の加減・炭出し）、半分は町の外の森で薪を切る
  if (k && R.chance(0.5)) return { x: k.x + R.int(0, k.w - 1), z: k.z + R.int(0, k.d - 1) };
  const w = sim.S.world, r0 = (s.r || 4) + (s.extraR || 0) + 2;
  for (let i = 0; i < 30; i++) {
    const ang = R.next() * Math.PI * 2, d = r0 + R.next() * 12;
    const x = Math.round(s.x + Math.cos(ang) * d), z = Math.round(s.z + Math.sin(ang) * d);
    if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
    if (FOREST.has(tileAt(w, x, z)) && !urbanXZ(sim, x, z) && !tooDangerous(sim, p, x, z)) return { x, z };
  }
  return k ? { x: k.door.x, z: k.door.z } : null;
}
function give(sim, p, hh, id, how) {
  if (!MAT.has(id) || (hh.stock?.[id] || 0) >= 20) return false;
  stash(sim, hh, id, 1); markSeen(sim, id, { hh: hh.id, s: p?.s ?? hh.s, how, p: p?.id });
  return true;
}
export function artisanWork(sim, p, dt, eff) {
  // 墓守は墓地の手入れのついでに、墓石の苔と墓の土を集める
  if (p.job !== 'gravedigger') return;
  const b = sim.S.world.buildings.find((x) => x.type === 'cemetery' && x.settlement === p.s);
  if (!b || !p.pos || p.pos.x < b.x - 1.5 || p.pos.x > b.x + b.w + 0.5 || p.pos.z < b.z - 1.5 || p.pos.z > b.z + b.d + 0.5) return;
  const hh = sim.hh(p); if (!hh) return;
  if (sim.rng.chance(Math.min(0.9, 0.08 * (dt / 60)))) { if (give(sim, p, hh, 'grave_moss', 'gather')) AR(sim).stats.moss = (AR(sim).stats.moss || 0) + 1; }
}
export function artisanDaily(sim) {
  const A = AR(sim), S = sim.S, R = sim.rng;
  if ((sim.today || 0) % 7 === 0 || !A.ready) { ensureArtisans(sim, true); A.ready = true; }
  // 猫を飼う家は、抜けたひげをときどき拾ってしまっておく（お守り・筆の材料）
  for (const c of Object.values(S.creatures)) {
    if (c.sp !== 'cat' || c.keeper == null || c.hp <= 0 || !R.chance(0.05)) continue;
    const hh = S.households[c.keeper]; if (!hh) continue;
    if (give(sim, null, hh, 'b_cat_whisker', 'gather')) A.stats.whisker = (A.stats.whisker || 0) + 1;
  }
}
