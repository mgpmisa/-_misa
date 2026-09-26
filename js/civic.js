// 町の守り・国の普請・開拓・旅の稼業・学び舎（地図と町づくり担当）
// 本体（sim.js）からは次の関数を呼ぶだけで動く。状態は S.civic に遅延初期化するので古いセーブでも動く。
//   civicPlace(sim, p, kind)      … placeFor の頭で呼ぶ。新しい行き先（門・詰所・巡回路・練兵場・砦・学び舎・開拓地・普請場・渡し場など）
//   civicOptions(sim, p, add)     … decide の中で行動候補を足す（交代勤務・夜番・学び舎・行商・駅馬車・旅芸人の興行）
//   civicWork(sim, p, dt, eff)    … doWork の default で genericWork のあとに呼ぶ（新しい職業の仕事の中身）
//   civicArrive(sim, p, a)        … arrive の最後に呼ぶ（行商・駅馬車の到着）
//   civicDo(sim, p, dt)           … doAction の最後に呼ぶ（魔法学園・道場で学ぶ）
//   civicDaily(sim)               … newDay で1日1回（勤務の割り当て・砦の駐屯・普請の計画・旅芸人の巡業）
//   civicFirstJob(sim, p)         … 14歳の誕生日の職選び
//   musterOnAlarm(sim, q, s)      … 警鐘のとき、戦える者は逃げずに門と城壁を固める（true なら逃がさない）
import { T, W, H, walkable, isWater, MOVE_COST, MinHeap, tileAt } from './world.js';
import { JOBS, GOODS, KINGDOMS } from './data.js';
import { chooseYouthJob } from './history.js';

// ---------- ui.js に足すラベル ----------
export const CIVIC_LABEL = {
  academy: '魔法学園で学んでいる', dojo: '道場で稽古をつけてもらっている', peddle: '行商の荷を広げている', coach: '駅馬車を走らせている', sentry: '見張りに立っている',
};
export const CIVIC_GO = {
  academy: '魔法学園へ向かっている', dojo: '道場へ向かっている', peddle: '荷を背負って隣町へ向かっている', coach: '駅馬車で隣町へ向かっている', sentry: '持ち場へ向かっている',
};
export const CIVIC_PREF = { academy: '魔法の勉強', dojo: '剣の稽古', peddle: '行商', coach: '馬車の旅', sentry: '見張り' };

// 門・詰所・城壁で交代勤務をする職業
const SHIFT_JOBS = new Set(['soldier', 'guard', 'gatekeeper', 'militia', 'watchman', 'knight']);
const MAGIC_FAMILY = new Set(['wizard', 'courtmage', 'sage', 'alchemist', 'magister', 'scholar']);
const SWORD_FAMILY = new Set(['knight', 'soldier', 'general', 'royalguard', 'paladin', 'warrior', 'adventurer', 'swordmaster', 'guildmaster', 'gatekeeper']);
const TILE_WORK = 2.2;      // 道1マスを敷くのに要る働き（人夫1人でおよそ3時間）
const CLEAR_WORK = 1.2;     // 畑1マスを切り開くのに要る働き（開拓者1人でおよそ2〜3時間）

// ---------- 状態 ----------
export function ensureCivic(sim) {
  const S = sim.S;
  if (!S.civic) S.civic = { works: [], seq: 1, frontier: {}, done: { road: 0, bridge: 0, repair: 0, cleared: 0 }, troupeNext: 0 };
  return S.civic;
}
const hash01 = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0; return (x % 10007) / 10007; };
const CACHE = new WeakMap();   // world -> { patrol: Map, ferry: Map, net: Uint8Array|null, netRev }
const cache = (w) => { let c = CACHE.get(w); if (!c) CACHE.set(w, c = { patrol: new Map(), ferry: new Map(), net: null }); return c; };
const bld = (sim, id) => (id != null ? sim.building(id) : null);
const doorOf = (b, inside = true) => ({ x: b.door.x, z: b.door.z, bld: inside && !b.open && !b.yard ? b.id : null });

// ---------- 場所 ----------
// 巡回路：町の外周に近い通りを、ぐるりと回る順に並べたもの
function patrolRoute(sim, s) {
  const c = cache(sim.S.world);
  if (c.patrol.has(s.id)) return c.patrol.get(s.id);
  const w = sim.S.world, R = s.r;
  const pts = [];
  for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) {
    const t = tileAt(w, x, z);
    if (t !== T.ROAD && t !== T.PLAZA && t !== T.BRIDGE) continue;
    const ch = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
    if (ch < R - 5) continue;
    pts.push({ x, z, a: Math.atan2(z - s.z, x - s.x) });
  }
  pts.sort((a, b) => a.a - b.a);
  const route = pts.filter((_, i) => i % 3 === 0);
  c.patrol.set(s.id, route);
  return route;
}
function nextPatrol(sim, p, s) {
  const r = patrolRoute(sim, s);
  if (!r.length) return null;
  p.patrolIdx = ((p.patrolIdx ?? Math.floor(hash01(p.id) * r.length)) + 1 + sim.rng.int(0, 1)) % r.length;
  const q = r[p.patrolIdx];
  return { x: q.x, z: q.z };
}
function gateFor(sim, p, s) {
  if (!s.gates?.length) return null;
  return s.gates[(p.id + Math.floor(sim.today / 3)) % s.gates.length];
}
function gateSpot(sim, p, s, outside = true) {
  const g = gateFor(sim, p, s);
  if (!g) return null;
  const o = outside ? { x: g.x + g.dx, z: g.z + g.dz } : { x: g.x - g.dx, z: g.z - g.dz };
  return walkable(tileAt(sim.S.world, o.x, o.z)) ? o : { x: g.x, z: g.z };
}
function guardpostFor(sim, p, s) {
  const g = gateFor(sim, p, s);
  if (g?.post != null) return bld(sim, g.post);
  const ids = s.guardposts || [];
  return ids.length ? bld(sim, ids[p.id % ids.length]) : null;
}
function yardSpot(sim, b) {
  for (let k = 0; k < 8; k++) {
    const x = b.x + sim.rng.int(0, b.w - 1), z = b.z + sim.rng.int(0, b.d - 1);
    if (walkable(tileAt(sim.S.world, x, z))) return { x, z };
  }
  return { x: b.door.x, z: b.door.z };
}
function campFor(sim, p) {
  const w = sim.S.world, s = sim.townOf(p);
  const camps = (w.camps || []).map((id) => sim.building(id)).filter(Boolean);
  if (!camps.length) return null;
  return camps.find((b) => b.home === p.s) || camps.filter((b) => b.kingdom === s.kingdom).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0] || null;
}
function ferrySpot(sim, s) {
  const c = cache(sim.S.world);
  if (c.ferry.has(s.id)) return c.ferry.get(s.id);
  const w = sim.S.world;
  let best = null, bd = 1e9;
  for (let z = s.z - s.r - 10; z <= s.z + s.r + 10; z++) for (let x = s.x - s.r - 10; x <= s.x + s.r + 10; x++) {
    const t = tileAt(w, x, z);
    if (!walkable(t) || t === T.BLD) continue;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => tileAt(w, x + a, z + b) === T.RIVER)) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  c.ferry.set(s.id, best);
  return best;
}
// 兵舎に住むのは、独り身の若い兵士と騎士
const livesInBarracks = (sim, p) => (p.job === 'soldier' || p.job === 'knight') && p.spouseId == null && sim.ageOf(p) < 45 && sim.townOf(p).type === 'capital';

export function civicPlace(sim, p, kind) {
  const s = sim.townOf(p);
  if (!s) return null;
  const R = sim.rng, w = sim.S.world;
  switch (kind) {
    case 'home': {
      if (p.post != null && (p.postUntil || 0) > sim.today) { const f = bld(sim, p.post); if (f) return doorOf(f); }
      if (livesInBarracks(sim, p)) { const b = sim.townBuilding(s, 'barracks'); if (b) return doorOf(b); }
      // 開拓者は、ふだんは開拓地の小屋に寝泊まりする（休みの日は家族のもとへ）
      if (p.job === 'pioneer' && !sim.isRestDay() && sim.isAdult(p)) { const c = campFor(sim, p); if (c) return doorOf(c); }
      return null;
    }
    case 'barracks': {
      if (p.post != null && (p.postUntil || 0) > sim.today) { const f = bld(sim, p.post); if (f) return doorOf(f); }
      return null;
    }
    case 'gate': {
      // 門番・自警団：昼は門の外に立ち、夜は詰所（村は見張り櫓）に詰める
      const night = sim.hour() >= 19 || sim.hour() < 7;
      if (night) {
        const gp = guardpostFor(sim, p, s);
        if (gp) return doorOf(gp);
        const tw = sim.townBuilding(s, 'watchtower');
        if (tw) return { x: tw.door.x, z: tw.door.z };
      }
      return gateSpot(sim, p, s, true) || nextPatrol(sim, p, s);
    }
    case 'guardpost': { const gp = guardpostFor(sim, p, s); return gp ? doorOf(gp) : civicPlace(sim, p, 'gate'); }
    case 'watchtower': { const tw = sim.townBuilding(s, 'watchtower'); return tw ? { x: tw.door.x, z: tw.door.z } : civicPlace(sim, p, 'gate'); }
    case 'patrol': return nextPatrol(sim, p, s);
    case 'wall': {
      // 城壁の内側の通りを見回る（王都）。城壁がなければ巡回路
      return nextPatrol(sim, p, s);
    }
    case 'drillyard': {
      const cap = sim.capitalOf(p);
      const y = cap?.drillyard != null ? bld(sim, cap.drillyard) : cap ? sim.townBuilding(cap, 'drillyard') : null;
      return y ? yardSpot(sim, y) : null;
    }
    case 'fort': { const f = bld(sim, p.post); return f ? doorOf(f) : null; }
    case 'academy': case 'dojo': {
      const b = sim.townBuilding(s, kind) || (sim.capitalOf(p) && sim.townBuilding(sim.capitalOf(p), kind));
      if (b) return doorOf(b);
      return kind === 'academy' ? sim.placeFor(p, 'magictower') : sim.placeFor(p, 'barracks');
    }
    case 'field': {
      const f = w.fields.filter((q) => q.s === p.s);
      if (f.length) return { ...R.pick(f) };
      // 自分の町に畑がなければ、同じ国のいちばん近い町の畑へ出作りに行く
      const near = w.settlements.filter((q) => q.id !== p.s && q.kingdom === s.kingdom && Math.hypot(q.x - s.x, q.z - s.z) < 40).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
      for (const q of near) { const f2 = w.fields.filter((x) => x.s === q.id); if (f2.length) return { ...R.pick(f2) }; }
      return null;
    }
    case 'frontier': {
      const c = campFor(sim, p);
      if (!c) return sim.placeFor(p, 'forest');
      const spot = sim.randomNear(c.door.x, c.door.z, 4, (t) => t === T.FOREST || t === T.DENSE || t === T.GRASS || t === T.FIELD || t === T.JUNGLE || t === T.SAVANNA);
      return spot || { x: c.door.x, z: c.door.z };
    }
    case 'roadwork': {
      const job = workFor(sim, p);
      if (job) { const i = job.tiles[job.next]; const x = i % W, z = (i / W) | 0; return standBeside(sim, x, z) || { x, z }; }
      // 普請がないときは、町の通りの手入れ
      return nextPatrol(sim, p, s);
    }
    case 'coach': {
      const st = s.buildings.map((id) => sim.building(id)).filter((b) => b.type === 'stable');
      const b = st.find((q) => /駅馬車/.test(q.name)) || st[0];
      if (b) return doorOf(b);
      return gateSpot(sim, p, s, false) || sim.placeFor(p, 'plaza');
    }
    case 'peddle': { const m = sim.townBuilding(s, 'market'); return m ? { x: m.door.x, z: m.door.z } : sim.placeFor(p, 'plaza'); }
    case 'ferry': return ferrySpot(sim, s) || sim.placeFor(p, 'shore');
  }
  return null;
}
function standBeside(sim, x, z) {
  const w = sim.S.world;
  for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = tileAt(w, x + a, z + b); if (walkable(t) && t !== T.BLD) return { x: x + a, z: z + b }; }
  return null;
}

// ---------- 行動の候補 ----------
export function civicOptions(sim, p, add) {
  const R = sim.rng, h = sim.hour(), age = sim.ageOf(p), job = p.job, n = p.needs;
  const s = sim.townOf(p);
  if (!s || p.jail != null) return;
  const rest = sim.isRestDay();
  const occupied = sim.S.towns[p.s]?.occupied;
  // 交代勤務：昼番（7〜19時）と夜番（19〜7時）
  if (SHIFT_JOBS.has(job) && sim.isAdult(p) && !occupied) {
    const night = p.shift === 'night' || job === 'watchman';
    const onDuty = night ? (h >= 19 || h < 7) : (h >= 7 && h < 19);
    if (onDuty && !(rest && !night && (p.id + sim.today) % 3 === 0)) {
      const d = dutyPlace(sim, p, s, night);
      // 夜番は眠気に負けないよう強めに（そのぶん昼に眠る）
      if (d) add(night ? 10.5 + p.pers.C : 7 + p.pers.C * 1.5, d.type, d.place, R.int(60, 120));
    } else if (night && h >= 8 && h < 16 && n.sleep < 85) {
      add(6 + (100 - n.sleep) / 18, 'sleep', sim.placeFor(p, 'home'), R.int(150, 300));
    }
  }
  // 学び舎
  if (!rest && h >= 9 && h < 15 && age >= 10 && age < 18 && canAcademy(sim, p) && s.type === 'capital' && sim.townBuilding(s, 'academy')) {
    add(6 + p.pers.O * 2 + p.pers.C, 'academy', civicPlace(sim, p, 'academy'), R.int(120, 200));
  }
  if (age >= 12 && age < 21 && ((h >= 15 && h < 18) || (rest && h >= 9 && h < 12)) && canDojo(sim, p) && sim.townBuilding(sim.capitalOf(p) || s, 'dojo')) {
    add(3.5 + p.values.courage * 3 + p.values.ambition, 'dojo', civicPlace(sim, p, 'dojo'), R.int(60, 120));
  }
  // 村や港の日曜学校：休みの日の朝、教会で読み書きを教わる
  if (rest && s.type !== 'capital' && age >= 6 && age < 14 && h >= 9 && h < 11.5) add(5.5 + p.pers.C, 'school', sim.placeFor(p, 'church'), R.int(60, 100));
  // 行商：荷を背負って、それが高く売れる町へ
  if (job === 'peddler' && p.pack && sim.isAdult(p) && h >= 6 && h < 12 && !rest) {
    const dest = peddleDest(sim, p);
    if (dest) add(6 + p.values.ambition, 'peddle', { x: dest.x + R.int(-1, 1), z: dest.z + R.int(-1, 1) }, 60, { dest: dest.id });
  }
  // 駅馬車：朝に隣町へ客を乗せて出る
  if (job === 'coachman' && sim.isAdult(p) && h >= 7 && h < 10 && !rest && (p.coachDay || -1) !== sim.today && R.chance(0.5)) {
    const dest = R.pick(sim.S.world.settlements.filter((q) => q.id !== p.s && !sim.S.towns[q.id]?.occupied && Math.hypot(q.x - s.x, q.z - s.z) < 50));
    if (dest) add(6.5, 'coach', { x: dest.x, z: dest.z }, 45, { dest: dest.id });
  }
  // 旅芸人：昼と夕方に広場で興行
  if (job === 'troupe' && ((h >= 11 && h < 13) || (h >= 17 && h < 21))) add(6.5 + p.pers.E, 'work', sim.placeFor(p, 'plaza'), R.int(60, 100));
}
function dutyPlace(sim, p, s, night) {
  const job = p.job;
  const posted = p.post != null && (p.postUntil || 0) > sim.today;
  if (posted) { const f = bld(sim, p.post); if (f) return { type: 'work', place: night && sim.rng.chance(0.5) ? doorOf(f) : standBeside(sim, f.door.x, f.door.z) || doorOf(f) }; }
  switch (job) {
    case 'gatekeeper': case 'militia': return { type: 'work', place: civicPlace(sim, p, 'gate') };
    case 'guard': case 'watchman': return { type: 'work', place: nextPatrol(sim, p, s) || sim.placeFor(p, 'plaza') };
    case 'soldier':
      if (!night && sim.rng.chance(0.5)) { const y = civicPlace(sim, p, 'drillyard'); if (y) return { type: 'train', place: y }; }
      return { type: 'work', place: sim.rng.chance(0.5) ? civicPlace(sim, p, 'gate') : nextPatrol(sim, p, s) };
    case 'knight': {
      const y = civicPlace(sim, p, 'drillyard');
      return y && sim.rng.chance(0.6) ? { type: 'train', place: y } : { type: 'work', place: sim.placeFor(p, 'barracks') };
    }
  }
  return null;
}
function canAcademy(sim, p) {
  const par = [sim.person(p.fatherId), sim.person(p.motherId)].filter(Boolean);
  if (par.some((q) => MAGIC_FAMILY.has(q.job || q.formerJob))) return true;
  if (p.rank === 'noble' || p.rank === 'royal') return true;
  return hash01(p.id * 7 + 3) < 0.12 + p.pers.O * 0.1;   // 素質のある子
}
function canDojo(sim, p) {
  const par = [sim.person(p.fatherId), sim.person(p.motherId)].filter(Boolean);
  if (par.some((q) => SWORD_FAMILY.has(q.job || q.formerJob))) return true;
  if (['noble', 'royal', 'knight'].includes(p.rank) || ['soldier', 'knight', 'adventurer', 'warrior', 'militia'].includes(p.job)) return true;
  return p.values.courage > 0.62;
}
function peddleDest(sim, p) {
  const s = sim.townOf(p), g = p.pack?.g;
  if (!g) return null;
  const cands = sim.S.world.settlements.filter((q) => q.id !== p.s && !sim.S.towns[q.id]?.occupied && Math.hypot(q.x - s.x, q.z - s.z) < 48);
  if (!cands.length) return null;
  return cands.sort((a, b) => sim.market(b.id).price[g] - sim.market(a.id).price[g])[0];
}

// ---------- 仕事の中身 ----------
export function civicWork(sim, p, dt, eff) {
  const J = JOBS[p.job];
  if (!J) return;
  const hr = dt / 60, R = sim.rng, S = sim.S;
  switch (J.svc) {
    case 'works': break; // 普請奉行：計画は civicDaily。王城で帳面をつけている
    case 'roads': {
      const job = workFor(sim, p);
      if (!job) return;
      const i = job.tiles[job.next], x = i % W, z = (i / W) | 0;
      if (Math.abs(p.pos.x - x) + Math.abs(p.pos.z - z) > 3) return; // 現場にいないと進まない
      job.prog += eff * (0.8 + (p.skill[p.job] || 0.3));
      if (job.prog >= TILE_WORK) { job.prog -= TILE_WORK; layTile(sim, job, p); }
      break;
    }
    case 'clear': {
      const c = campFor(sim, p);
      if (!c) return;
      const civ = ensureCivic(sim);
      const f = civ.frontier[c.id] = civ.frontier[c.id] || { prog: 0, cleared: 0 };
      f.prog += eff;
      if (f.prog >= CLEAR_WORK) { f.prog -= CLEAR_WORK; clearTile(sim, c, f, p); }
      break;
    }
    case 'peddle': {
      // 店で荷を仕入れる（安くて余っている品）
      if (p.pack || !sim.isAdult(p)) return;
      const m = sim.market(p.s), hh = sim.hh(p);
      const g = Object.keys(GOODS).filter((k) => GOODS[k].meals === 0 || k === 'honey').sort((a, b) => m.stock[b] / GOODS[b].target - m.stock[a] / GOODS[a].target)[0];
      const n = Math.min(6, Math.floor(m.stock[g] / 3), Math.floor((hh?.money || 0) * 0.3 / Math.max(0.5, m.price[g])));
      if (n >= 2 && m.stock[g] > GOODS[g].target * 0.8) {
        m.stock[g] -= n; hh.money -= n * m.price[g];
        p.pack = { g, n, cost: n * m.price[g] };
      }
      break;
    }
    case 'ferry': {
      const near = sim.nearby ? sim.nearby(p, 4) : [];
      if (near.length && R.chance(0.15 * hr * near.length)) { const q = R.pick(near); const hh = sim.hh(q); if (hh && hh.money > 15) { hh.money -= 1; sim.hh(p).money += 1; } }
      break;
    }
    case 'drill': {
      // 剣の師範：道場に来ている若者と兵に稽古をつける（腕前の伸びは growth.js）
      const pupils = sim.living().filter((q) => q !== p && q.inside === p.inside && p.inside != null && q.action?.type === 'dojo');
      for (const q of pupils) { q.lessons = q.lessons || {}; q.lessons.dojoMaster = p.id; }
      p.needs.esteem = Math.min(100, p.needs.esteem + pupils.length * 2 * hr);
      break;
    }
    case 'coach': break; // 駅馬車の運行は civicOptions と civicArrive
  }
}
// 普請の仕事を1マス進める
function layTile(sim, job, p) {
  const w = sim.S.world, i = job.tiles[job.next];
  const t = w.tiles[i];
  const k = sim.S.kingdoms[job.k];
  const mat = t === T.RIVER ? 'wood' : 'stone';
  const m = sim.market(job.s);
  const need = t === T.RIVER ? 3 : 1;
  if (m.stock[mat] >= need) { m.stock[mat] -= need; if (k) k.treasury -= need * m.price[mat]; }
  else if (k) k.treasury -= need * GOODS[mat].base * 1.5;   // 足りない材料は国庫で遠くから取り寄せる
  if (t === T.RIVER) w.tiles[i] = T.BRIDGE;
  else if (t !== T.BLD && t !== T.WALL && t !== T.FENCE && !isWater(t)) w.tiles[i] = T.ROAD;
  const c = cache(w); c.net = null;
  sim.events?.push({ type: 'tiles', list: [i] });
  job.next++;
  if (job.next >= job.tiles.length) finishWork(sim, job, p);
}
function finishWork(sim, job, p) {
  const civ = ensureCivic(sim);
  civ.works = civ.works.filter((q) => q !== job);
  civ.done[job.kind] = (civ.done[job.kind] || 0) + 1;
  const K = KINGDOMS[job.k];
  const text = job.kind === 'bridge' ? `${job.name}が架かった` : `${job.name}が開通した`;
  sim.pushLog(`${text}。国の普請で、道普請の人夫たちが${job.tiles.length}マスを仕上げた。`, 'event', [p.id], { x: job.tiles[0] % W, z: (job.tiles[0] / W) | 0 });
  sim.news?.(`${K.name}：${text}`, 1, { x: job.tiles[0] % W, z: (job.tiles[0] / W) | 0 });
  sim.chron?.(`${K.name}の普請で、${text}`, job.k);
  for (const q of sim.living()) if (q.job === 'roadworker' && sim.townOf(q).kingdom === job.k) sim.remember(q, `みんなで造った${job.name}がついに仕上がった`, { emo: 0.7, imp: 0.6, k: 'works' });
}
// 開拓：小屋のまわりの森や草地を、1マスずつ畑にする
function clearTile(sim, camp, f, p) {
  const w = sim.S.world, R = sim.rng;
  const ok = (t) => t === T.FOREST || t === T.DENSE || t === T.GRASS || t === T.SAVANNA || t === T.JUNGLE;
  let best = null, bd = 1e9;
  for (let z = camp.z - 5; z <= camp.z + 6; z++) for (let x = camp.x - 5; x <= camp.x + 7; x++) {
    if (!ok(tileAt(w, x, z))) continue;
    const nextToField = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => tileAt(w, x + a, z + b) === T.FIELD);
    const d = Math.hypot(x - (camp.x + 3), z - camp.z) - (nextToField ? 2 : 0) + R.next();
    if (d < bd) { bd = d; best = { x, z }; }
  }
  if (!best) return;
  const i = best.z * W + best.x;
  const was = w.tiles[i];
  w.tiles[i] = T.FIELD;
  w.fields.push({ x: best.x, z: best.z, s: camp.home ?? p.s, camp: camp.id });
  sim.events?.push({ type: 'tiles', list: [i] });
  f.cleared++;
  ensureCivic(sim).done.cleared++;
  if (was === T.FOREST || was === T.DENSE || was === T.JUNGLE) sim.sell(p, 'wood', 2);   // 切った木は材木に
  if (f.cleared === 6 || f.cleared === 20 || f.cleared % 40 === 0) {
    const txt = f.cleared === 6 ? `${camp.name}のまわりに、新しい畑が広がり始めた` : `${camp.name}の畑が${f.cleared}枚になり、開拓地らしくなってきた`;
    sim.pushLog(txt + '。', 'event', [p.id], best);
    sim.chron?.(txt, camp.kingdom);
    sim.remember(p, txt, { emo: 0.7, imp: 0.7, k: 'works' });
  }
}

// ---------- 到着 ----------
export function civicArrive(sim, p, a) {
  const R = sim.rng;
  if (a.type === 'peddle' && p.pack && a.dest != null) {
    const m = sim.market(a.dest), g = p.pack.g, n = p.pack.n;
    const got = n * m.price[g] * 0.92;
    m.stock[g] += n;
    const hh = sim.hh(p); if (hh) hh.money += got;
    const dest = sim.town(a.dest);
    sim.remember(p, `${dest.name}で${GOODS[g].name}${n}を売り歩き、${Math.round(got - p.pack.cost)}銅貨の${got >= p.pack.cost ? 'もうけ' : '損'}が出た`, { emo: got >= p.pack.cost ? 0.4 : -0.3, imp: 0.3, k: 'trade' });
    p.pack = null;
    a.until = sim.S.t + 40;
  }
  if (a.type === 'coach' && a.dest != null) {
    const dest = sim.town(a.dest);
    p.coachDay = sim.today;
    const fare = R.int(3, 9);
    const hh = sim.hh(p); if (hh) hh.money += fare;
    if (R.chance(0.3)) sim.remember(p, `駅馬車で${dest.name}まで客を運び、${fare}銅貨の運賃を受け取った`, { emo: 0.2, imp: 0.25, k: 'work' });
    a.until = sim.S.t + 30;
  }
}

// ---------- 行動中（学び舎） ----------
export function civicDo(sim, p, dt) {
  const a = p.action, n = p.needs, hr = dt / 60;
  if (!a || a.phase !== 'do') return;
  if (a.type === 'academy') {
    p.lessons = p.lessons || {}; p.lessons.academy = (p.lessons.academy || 0) + hr;   // 腕前の伸びは growth.js がこれを見て決める
    n.sloth -= 4 * hr; n.esteem += 1 * hr;
    if (sim.rng.chance(0.003 * dt)) sim.remember(p, sim.rng.pick(['魔法学園で、はじめて指先に小さな火をともせた', '魔法学園で呪文の綴りを間違えて、導師に笑われた', '魔法学園の書庫で、古い魔導書をこっそり読んだ', '魔法学園の実習で、水の球を浮かべることができた']), { emo: 0.5, imp: 0.45, k: 'school' });
  } else if (a.type === 'dojo') {
    p.lessons = p.lessons || {}; p.lessons.dojo = (p.lessons.dojo || 0) + hr;
    p.xp = (p.xp || 0) + 0.5 * hr * (0.5 + p.pers.C);
    n.sloth -= 6 * hr; n.esteem += 2 * hr;
    if (sim.rng.chance(0.003 * dt)) sim.remember(p, sim.rng.pick(['道場で師範に一本取られて、悔しくて眠れなかった', '道場で素振りを千回やらされた', '道場の稽古で、はじめて師範にほめられた', '道場で兄弟子と木剣で打ち合った']), { emo: 0.4, imp: 0.45, k: 'school' });
  }
}

// ---------- 1日ごと ----------
export function civicDaily(sim) {
  const civ = ensureCivic(sim), S = sim.S, R = sim.rng;
  const L = sim.living();
  const week = Math.floor(sim.today / 7);
  // 交代勤務の割り当て：町ごとに、守りの者（兵士・門番・衛兵・自警団）の3人に1人が夜番。どの町も最低1人は夜番（週ごとに入れ替わる）
  const groups = new Map();
  for (const p of L) if (SHIFT_JOBS.has(p.job) && p.job !== 'watchman' && p.job !== 'knight' && !(p.post != null && (p.postUntil || 0) > sim.today)) { if (!groups.has(p.s)) groups.set(p.s, []); groups.get(p.s).push(p); }
  for (const list of groups.values()) {
    list.sort((a, b) => a.id - b.id);
    const n = list.length, nNight = Math.max(1, Math.round(n / 3));
    list.forEach((p, i) => { p.shift = ((i - week * nNight) % n + n) % n < nNight ? 'night' : 'day'; });
  }
  // 砦の駐屯：その国の王都の兵士から、1週間交代で砦に詰める
  for (const id of S.world.forts || []) {
    const f = sim.building(id);
    if (!f) continue;
    const here = L.filter((p) => p.post === id && (p.postUntil || 0) > sim.today);
    if (here.length >= 2) continue;
    const cands = L.filter((p) => p.job === 'soldier' && p.s === f.capital && (p.post == null || (p.postUntil || 0) <= sim.today) && !p.mission && p.jail == null).sort((a, b) => (a.spouseId == null ? 0 : 1) - (b.spouseId == null ? 0 : 1) || hash01(a.id + week) - hash01(b.id + week));
    for (const p of cands.slice(0, 2 - here.length)) {
      p.post = id; p.postUntil = sim.today + 7;
      sim.remember(p, `${f.name}への駐屯を命じられた`, { emo: -0.05, imp: 0.4, k: 'duty' });
    }
  }
  // 国の普請：国庫に余裕があり、道普請の人夫がいる国は、新しい普請を計画する
  for (let k = 0; k < KINGDOMS.length; k++) {
    const K = S.kingdoms?.[k];
    if (!K || K.treasury < 120) continue;
    if (civ.works.filter((q) => q.k === k).length >= 2) continue;
    if (!L.some((p) => p.job === 'roadworker' && sim.townOf(p).kingdom === k)) continue;
    const job = planWork(sim, k);
    if (job) {
      civ.works.push(job);
      const over = L.find((p) => p.job === 'overseer' && sim.townOf(p).kingdom === k);
      sim.pushLog(`${KINGDOMS[k].name}の${over ? `普請奉行${over.given}` : '王城'}が、国庫から費用を出して「${job.name}」の普請を始めた。`, 'event', over ? [over.id] : [], { x: job.tiles[0] % W, z: (job.tiles[0] / W) | 0 });
      if (over) sim.remember(over, `「${job.name}」の普請を立てた`, { emo: 0.3, imp: 0.5, k: 'works' });
    }
  }
  // 災害で傷んだ建物の修繕を、道普請の人夫が手伝う（weather.js の b.dmg を早く減らす）
  for (const b of S.world.buildings) if (b.dmg > 0) {
    const s = b.settlement != null ? sim.town(b.settlement) : null;
    if (!s) continue;
    const crew = L.filter((p) => p.job === 'roadworker' && sim.townOf(p).kingdom === s.kingdom).length;
    if (crew) b.dmg = Math.max(0, b.dmg - 0.02 * Math.min(3, crew));
  }
  // 旅芸人の一座：3日ごとに次の町へ
  if (sim.today >= (civ.troupeNext || 0)) {
    const troupe = L.filter((p) => p.job === 'troupe');
    const lead = troupe.find((p) => p.troupeLead) || troupe[0];
    if (lead) {
      const here = sim.townOf(lead);
      const dest = R.pick(S.world.settlements.filter((q) => q.id !== lead.s && !S.towns[q.id]?.occupied && Math.hypot(q.x - here.x, q.z - here.z) < 55));
      if (dest) {
        for (const p of troupe) { p.s = dest.id; p.action = null; }
        sim.pushLog(`旅芸人の一座が${here.name}での興行を終え、${dest.name}へ向かった。`, 'event', troupe.map((p) => p.id), here);
        for (const q of L) if (q.s === dest.id && sim.ageOf(q) < 14 && R.chance(0.2)) sim.remember(q, `旅芸人の一座が${dest.name}にやって来るという噂を聞いた`, { emo: 0.6, imp: 0.3, k: 'news', src: 'heard' });
      }
    }
    civ.troupeNext = sim.today + 3;
  }
}

// ---------- 普請の計画 ----------
// 道の網（王都から道・橋・広場・桟橋でたどれる所）
function roadNet(sim) {
  const w = sim.S.world, c = cache(w);
  if (c.net) return c.net;
  const net = new Uint8Array(W * H);
  const ok = (t) => t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK;
  const cap = w.settlements.find((s) => s.type === 'capital');
  const st = [cap.z * W + cap.x]; net[st[0]] = 1;
  while (st.length) {
    const i = st.pop(), x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const j = nz * W + nx; if (!net[j] && ok(w.tiles[j])) { net[j] = 1; st.push(j); } }
  }
  c.net = net;
  return net;
}
// 道の網まで、道を敷く経路（街道づくりと同じ費用）
function pathToNet(sim, sx, sz, net, maxLen = 60) {
  const w = sim.S.world, tiles = w.tiles, hgt = w.hgt, N = W * H;
  const cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hp = new MinHeap(); const s0 = sz * W + sx;
  cost[s0] = 0; hp.push(0, s0);
  let goal = -1, it = 0;
  while (hp.size && it++ < 60000) {
    const i = hp.pop(); if (done[i]) continue; done[i] = 1;
    if (i !== s0 && net[i]) { goal = i; break; }
    const x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx, t = tiles[j];
      let c;
      if (t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK) c = 0.5;
      else if (t === T.RIVER) c = 9;
      else if (t === T.SEA || t === T.DEEP || t === T.PEAK || t === T.BLD || t === T.LAVA || t === T.WALL || t === T.FENCE || t === T.FIELD || t === T.PASTURE) continue;
      else c = (MOVE_COST[t] || 2) + Math.abs(hgt[j] - hgt[i]) * 2;
      if (cost[i] + c < cost[j]) { cost[j] = cost[i] + c; came[j] = i; hp.push(cost[j], j); }
    }
  }
  if (goal < 0) return null;
  const path = [];
  for (let c = came[goal]; c !== -1; c = came[c]) path.push(c);
  if (path.length > maxLen) return null;
  return path.reverse().filter((i) => { const t = tiles[i]; return t !== T.ROAD && t !== T.BRIDGE && t !== T.PLAZA && t !== T.DOCK; });
}
function planWork(sim, k) {
  const civ = ensureCivic(sim), w = sim.S.world, R = sim.rng;
  const net = roadNet(sim);
  const busy = new Set(civ.works.flatMap((q) => q.tiles));
  const base = w.settlements.find((s) => s.type === 'capital' && s.kingdom === k);
  const mk = (kind, name, tiles, s) => (tiles && tiles.length && !tiles.some((i) => busy.has(i)) ? { id: civ.seq++, k, kind, name, tiles, next: 0, prog: 0, s: s.id, started: sim.today } : null);
  // 1) 開拓地へ道を通す
  for (const id of w.camps || []) {
    const c = sim.building(id);
    if (!c || c.kingdom !== k || net[c.door.z * W + c.door.x]) continue;
    const civF = civ.frontier[id];
    if ((civF?.cleared || 0) < 4 && R.chance(0.5)) continue;   // 開拓が少し進んでから
    const tiles = pathToNet(sim, c.door.x, c.door.z, net);
    const home = sim.town(c.home ?? base.id);
    const job = mk('road', `${c.name.replace('の小屋', '')}への道`, tiles, home);
    if (job) return job;
  }
  // 2) 町の近くの川に橋を架ける（両岸が歩けて、近くに橋がない所）
  for (const s of w.settlements.filter((q) => q.kingdom === k)) {
    let best = null;
    for (let z = s.z - s.r - 8; z <= s.z + s.r + 8; z++) for (let x = s.x - s.r - 8; x <= s.x + s.r + 8; x++) {
      if (tileAt(w, x, z) !== T.RIVER) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        // 幅1〜2マスの川で、両岸が歩ける
        let len = 1; while (len <= 2 && tileAt(w, x + dx * len, z + dz * len) === T.RIVER) len++;
        if (len > 2) continue;
        const a = tileAt(w, x - dx, z - dz), b = tileAt(w, x + dx * len, z + dz * len);
        if (!walkable(a) || !walkable(b) || a === T.BLD || b === T.BLD) continue;
        let bridged = false;
        for (let r = -7; r <= 7 && !bridged; r++) for (let q = -7; q <= 7; q++) if (tileAt(w, x + r, z + q) === T.BRIDGE) { bridged = true; break; }
        if (bridged) continue;
        const d = Math.hypot(x - s.x, z - s.z);
        if (!best || d < best.d) best = { x, z, dx, dz, len, d };
      }
    }
    if (best) {
      const tiles = [];
      for (let j = 0; j < best.len; j++) tiles.push((best.z + best.dz * j) * W + best.x + best.dx * j);
      // 橋のたもとから道の網までもつなぐ
      const ends = [[best.x - best.dx, best.z - best.dz], [best.x + best.dx * best.len, best.z + best.dz * best.len]];
      for (const [ex, ez] of ends) { const p2 = pathToNet(sim, ex, ez, net, 8); if (p2) { const t0 = tileAt(w, ex, ez); if (t0 !== T.ROAD) tiles.push(ez * W + ex); tiles.push(...p2); } }
      if (tiles.length > 16) continue;   // 大がかりすぎる橋は後回し
      const job = mk('bridge', `${s.name.replace(/^(王都|港町)/, '')}の${best.dx ? '東西' : '南北'}の渡しの橋`, [...new Set(tiles)], s);
      if (job) return job;
    }
  }
  // 3) 町の外れの道の切れ目をつなぐ（道の網から外れた門）
  for (const s of w.settlements.filter((q) => q.kingdom === k)) for (const g of s.gates || []) {
    const i = (g.z + g.dz) * W + (g.x + g.dx);
    if (net[i] || !walkable(w.tiles[i])) continue;
    const tiles = pathToNet(sim, g.x + g.dx, g.z + g.dz, net, 40);
    const job = mk('road', `${s.name}の門から延びる道`, tiles && [i, ...tiles], s);
    if (job) return job;
  }
  return null;
}
function workFor(sim, p) {
  const civ = ensureCivic(sim);
  const k = sim.townOf(p).kingdom;
  const list = civ.works.filter((q) => q.k === k && q.next < q.tiles.length);
  if (!list.length) return null;
  return list[p.id % list.length];
}

// ---------- 14歳の職選び ----------
export function civicFirstJob(sim, p) {
  const s = sim.townOf(p);
  const counts = {};
  for (const q of sim.living()) if (q.s === p.s && q.job && sim.ageOf(q) >= 14) counts[q.job] = (counts[q.job] || 0) + 1;
  return chooseYouthJob(sim.rng, p, s.type, counts, [sim.person(p.fatherId), sim.person(p.motherId)], sim.ageOf(p));
}

// ---------- 警鐘のとき ----------
// 戦える者（騎士・兵士・衛兵・門番・自警団）は家に逃げず、門と城壁を固める
export function musterOnAlarm(sim, q, s) {
  if (!SHIFT_JOBS.has(q.job) && !(JOBS[q.job]?.combat >= 3 && q.rank === 'knight')) return false;
  if (q.hp < q.maxhp * 0.4 || q.jail != null) return false;
  const spot = gateSpot(sim, q, s, false) || nextPatrol(sim, q, s);
  if (!spot) return false;
  q.mission = { type: 'defend', x: spot.x, z: spot.z, until: sim.S.t + 90 };
  q.action = null;
  return true;
}
