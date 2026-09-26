// 物流：荷車と船の隊商（案H）
// 商人の交易は、品物が瞬間移動するのではなく、荷車が道を実際に進み、港どうしは船が海を渡る。
// 着いて初めて行き先の町の在庫と物価に反映される。道中では盗賊・魔物・嵐に遭うことがある。
// 状態は S.convoys（隊商の一覧）と S.logi（通算の数字）。古いセーブで欠けていても ensureLogistics で作る。
import { W, H, T, MinHeap, walkable, MOVE_COST } from './world.js';
import { GOODS, JOBS } from './data.js';
import { dangerAt } from './danger.js';
import { around } from './creatures.js';
import { startFight, markWanted } from './society.js';
import { isAdventurer, advRank, RANKS_ADV, QUEST_TYPE_NAME } from './guild.js';

export const MAX_CONVOYS = 14;          // 同時に走る隊商の上限
const CHECK_EVERY = 10;                 // 道中の判定の間隔（分）
const CART_SPEED = 0.8;                 // 荷車：道の上で1分あたり何マス進むか
const SHIP_SPEED = 1.1;                 // 船：1分あたり何マス
const SHIP_CAP = 30;                    // 船の積み荷の上限（個）
const TILE_SLOW = { [T.FOREST]: 1.5, [T.DENSE]: 2, [T.JUNGLE]: 2, [T.DESERT]: 1.4, [T.SNOW]: 1.6, [T.ROCK]: 2.2, [T.SWAMP]: 2.2, [T.GRASS]: 1.25, [T.SAVANNA]: 1.25, [T.BEACH]: 1.3, [T.FIELD]: 1.3, [T.PASTURE]: 1.25, [T.WASTE]: 1.5 };
const RIDE = new Set(['trade', 'escort', 'sail']);
const SELLSWORD = new Set(['warrior', 'archer', 'hunter', 'militia']);   // 冒険者のほか、腕に覚えのある者も護衛を請け負う
QUEST_TYPE_NAME.escort = QUEST_TYPE_NAME.escort || '護衛';   // ギルドの一覧で「護衛」と出るように

// ---------- 状態 ----------
export function ensureLogistics(sim) {
  const S = sim.S;
  S.convoys = S.convoys || [];
  S.convoySeq = S.convoySeq || 0;
  S.logi = S.logi || { departed: 0, arrived: 0, robbed: 0, repelled: 0, monster: 0, storm: 0, escorts: 0, ships: 0, lostValue: 0 };
  return S.convoys;
}
const goodsValue = (goods) => Object.entries(goods).reduce((s, [g, n]) => s + n * (GOODS[g]?.base || 1), 0);
const goodsText = (goods) => Object.entries(goods).filter(([, n]) => n > 0).map(([g, n]) => `${GOODS[g].name}${n}`).join('・') || '空荷';
const who = (p) => (p.job === 'merchant' ? '商人' : p.job ? JOBS[p.job]?.name || '' : '荷運びの') + p.given;

// ---------- 海の経路（水の上の A*、港の組ごとにキャッシュ） ----------
const SEA_CACHE = new WeakMap();   // world -> Map(key -> path|null)
function seaOk(t) { return t === T.SEA || t === T.DEEP || t === T.DOCK; }
export function seaRoute(sim, a, b) {
  const w = sim.S.world;
  let m = SEA_CACHE.get(w); if (!m) SEA_CACHE.set(w, m = new Map());
  const key = a < b ? `${a}>${b}` : `${b}>${a}`;
  if (!m.has(key)) {
    const A = sim.town(Math.min(a, b)), B = sim.town(Math.max(a, b));
    m.set(key, A.dockEnd && B.dockEnd ? seaAStar(w, A.dockEnd, B.dockEnd) : null);
  }
  const p = m.get(key);
  if (!p) return null;
  return a < b ? p : [...p].reverse();
}
function seaAStar(w, s, t) {
  const tiles = w.tiles;
  return gridAStar(s, t, (j) => seaOk(tiles[j]), (j, diag) => (diag ? 1.414 : 1) * (tiles[j] === T.DEEP ? 1 : 1.15), true);   // 岸すれすれより沖を好む
}
// 汎用の A*（閉じた集合つき・倍精度。path.js の findPath とは別に持つ）
function gridAStar(s, t, ok, cost, diag, maxIter = 120000) {
  const N = W * H;
  const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const si = s.z * W + s.x, ti = t.z * W + t.x;
  if (!ok(ti)) return null;
  const heap = new MinHeap();
  g[si] = 0; heap.push(0, si);
  let iter = 0;
  while (heap.size && iter++ < maxIter) {
    const i = heap.pop();
    if (i === ti) break;
    if (closed[i]) continue;
    closed[i] = 1;
    const x = i % W, z = (i / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || (!diag && dx && dz)) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const j = nz * W + nx;
      if (closed[j] || !ok(j)) continue;
      if (dx && dz && (!ok(z * W + nx) || !ok(nz * W + x))) continue; // 角を斜めにすり抜けない
      const ng = g[i] + cost(j, dx && dz);
      if (ng < g[j]) { g[j] = ng; came[j] = i; heap.push(ng + (diag ? Math.hypot(nx - t.x, nz - t.z) : Math.abs(nx - t.x) + Math.abs(nz - t.z)), j); }
    }
  }
  if (g[ti] === Infinity) return null;
  const path = [];
  for (let c = ti; c !== si && c >= 0; c = came[c]) path.push({ x: c % W, z: (c / W) | 0 });
  path.push({ x: s.x, z: s.z });
  return path.reverse();
}

// ---------- 陸の経路（町の組ごとにキャッシュ。王都の城門は荷車が通れるものとする） ----------
const LAND_CACHE = new WeakMap();
function gateWalls(w) {
  const set = new Set();
  for (const s of w.settlements) for (const g of s.gates || []) for (let k = 1; k <= 3; k++) {
    const x = g.x + g.dx * k, z = g.z + g.dz * k;
    if (x < 0 || z < 0 || x >= W || z >= H) break;
    if (w.tiles[z * W + x] === T.WALL) set.add(z * W + x);
  }
  return set;
}
export function landRoute(sim, a, b) {
  const w = sim.S.world;
  let m = LAND_CACHE.get(w); if (!m) LAND_CACHE.set(w, m = { paths: new Map(), gates: gateWalls(w) });
  const key = a < b ? `${a}>${b}` : `${b}>${a}`;
  if (!m.paths.has(key)) {
    const A = landSpot(w, sim.town(Math.min(a, b))), B = landSpot(w, sim.town(Math.max(a, b)));
    const tiles = w.tiles, gates = m.gates;
    m.paths.set(key, A && B ? gridAStar(A, B, (j) => walkable(tiles[j]) || gates.has(j), (j) => (gates.has(j) ? 1 : MOVE_COST[tiles[j]] || 2), false) : null);
  }
  const p = m.paths.get(key);
  if (!p) return null;
  return a < b ? p : [...p].reverse();
}
export function seaPorts(sim) { return sim.S.world.settlements.filter((s) => s.type === 'port' && s.dockEnd && !sim.S.towns[s.id].occupied); }

// ---------- 道の危なさ ----------
const HIDE_CACHE = new WeakMap();
function hideouts(sim) {
  const w = sim.S.world;
  let h = HIDE_CACHE.get(w); if (!h) HIDE_CACHE.set(w, h = w.buildings.filter((b) => b.type === 'hideout'));
  return h;
}
function freeBandits(sim, b) {
  return sim.living().filter((p) => p.bandit && p.hideout === b.id && p.jail == null && !p.fight && p.hp > p.maxhp * 0.5 && p.lastRob !== sim.today);
}
// 経路の危険度：危険地図の最大値 ＋ 盗賊のアジトのそばを通るなら4
export function routeRisk(sim, path) {
  let maxD = 0, bandit = false;
  const hs = hideouts(sim).filter((b) => sim.living().some((p) => p.bandit && p.hideout === b.id && p.jail == null));
  for (let i = 0; i < path.length; i += 4) {
    const q = path[i];
    maxD = Math.max(maxD, dangerAt(sim, q.x, q.z));
    if (!bandit && hs.some((b) => Math.abs(b.x - q.x) < 13 && Math.abs(b.z - q.z) < 13)) bandit = true;
  }
  return { danger: maxD, bandit, risk: maxD + (bandit ? 4 : 0) };
}

// ---------- 商人が交易に出られるか（findTrade の頭で呼ぶ） ----------
export function canTrade(sim, p) {
  const C = ensureLogistics(sim);
  if (C.length >= MAX_CONVOYS) return false;
  if ((p._tradeCd || 0) > sim.S.t) return false;
  return !C.some((c) => c.owner === p.id);
}

// 港町の商人は、遠くの港へ船で商いに行くことも考える（findTrade で見つからないとき）
export function findSeaTrade(sim, p) {
  const here = sim.townOf(p);
  if (here.type !== 'port' || !here.dockEnd) return null;
  const m = sim.market(p.s);
  let best = null, bv = 1.3;
  for (const s of seaPorts(sim)) {
    if (s.id === p.s || !seaRoute(sim, p.s, s.id)) continue;
    const there = sim.market(s.id);
    for (const g of Object.keys(GOODS)) {
      if (m.stock[g] < 4) continue;
      const r = there.price[g] / m.price[g];
      if (r > bv) { bv = r; best = { good: g, dest: s.id, place: { x: s.x, z: s.z }, sea: true }; }
    }
  }
  return best;
}

// ---------- 出発 ----------
function newConvoy(sim, o) {
  const S = sim.S;
  ensureLogistics(sim);
  const c = { id: ++S.convoySeq, kind: o.kind, goods: o.goods, cost: o.cost || 0, from: o.from, to: o.to, home: o.from, path: o.path, i: 0,
    pos: { x: o.path[0]?.x ?? o.start.x, z: o.path[0]?.z ?? o.start.z }, dir: { x: 1, z: 0 }, owner: o.owner, hh: o.hh, guards: o.guards || [], crew: o.crew || [],
    eta: 0, state: 'moving', next: S.t + CHECK_EVERY, met: {}, leg: 1, roundTrip: !!o.roundTrip, liner: !!o.liner, quest: o.quest ?? null, t0: S.t, attackers: [], risk: o.risk || 0 };
  c.eta = S.t + Math.round(o.path.length / (o.kind === 'ship' ? SHIP_SPEED : CART_SPEED * 0.85));
  S.convoys.push(c);
  S.logi.departed++;
  if (o.kind === 'ship') S.logi.ships++;
  return c;
}
function board(sim, p, c, type) {
  if (p.inside != null) { const b = sim.building(p.inside); if (b) p.pos = { x: b.door.x, z: b.door.z }; p.inside = null; }
  p.talk = null;
  p.action = { type, convoy: c.id, dur: 0, until: sim.S.t + 1e7, bld: null, phase: 'do', startNeeds: { ...p.needs }, startMood: p.mood };
  p.path = [];
  p._spot = 1e9;   // 乗っている間は、魔物を見ても一人で逃げ出さない（隊商ごと判定する）
}
function unboard(sim, p, c) {
  if (!p) return;
  if (p._spot > 1e6) p._spot = 0;
  if (p.action?.convoy === c.id) { p.action.until = sim.S.t; p.action.convoy = null; }
}
const riders = (c) => [c.owner, ...c.guards, ...c.crew].filter((id) => id != null);

// 町の中心に近い、荷車が止まれる地面（広場・道を優先）
function landSpot(w, s) {
  let best = null, bd = 1e9;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const x = s.x + dx, z = s.z + dz;
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    const t = w.tiles[z * W + x];
    if (!walkable(t)) continue;
    const d = Math.abs(dx) + Math.abs(dz) + (t === T.PLAZA || t === T.ROAD ? 0 : 3);
    if (d < bd) { bd = d; best = { x, z }; }
  }
  return best;
}

// 商人の交易を始める（startAction の頭で呼ぶ）。true なら隊商を出したので、元の処理はしない。
export function startTradeConvoy(sim, p, tr) {
  const S = sim.S, R = sim.rng;
  ensureLogistics(sim);
  if (!tr || !canTrade(sim, p)) { p._tradeCd = S.t + 240; return false; }
  const from = sim.market(p.s), to = sim.market(tr.dest), hh = sim.hh(p);
  if (!hh || S.towns[tr.dest]?.occupied) return false;
  const here = sim.townOf(p), dest = sim.town(tr.dest);
  // 船で行くか（港どうしで、海路があり、陸路より近いか陸路がない）
  let kind = 'cart', path = null;
  const sea = here.type === 'port' && dest.type === 'port' ? seaRoute(sim, p.s, tr.dest) : null;
  const sailors = sea ? sim.living().filter((q) => q.s === p.s && (q.job === 'sailor' || q.job === 'captain') && q.jail == null && !q.fight && !RIDE.has(q.action?.type) && sim.isAdult(q)).slice(0, 2) : [];
  if (sea && sailors.length && (tr.sea || R.chance(0.6))) { kind = 'ship'; path = sea; }
  else {
    if (tr.sea) { p._tradeCd = S.t + 360; return false; }
    path = landRoute(sim, p.s, tr.dest);
    if (!path || path.length < 4) { p._tradeCd = S.t + 600; return false; }
  }
  const g = tr.good;
  const qty = Math.min(kind === 'ship' ? 20 : 10, Math.floor(from.stock[g] / 2), Math.floor(hh.money / Math.max(0.1, from.price[g])));
  if (qty <= 0) { p._tradeCd = S.t + 240; return false; }
  const cost = qty * from.price[g];
  from.stock[g] -= qty; hh.money -= cost;
  const risk = kind === 'cart' ? routeRisk(sim, path) : { risk: 0, danger: 0, bandit: false };
  const c = newConvoy(sim, { kind, goods: { [g]: qty }, cost, from: p.s, to: tr.dest, path, owner: p.id, hh: p.hh, risk: risk.risk, roundTrip: kind === 'ship' });
  board(sim, p, c, 'trade');
  if (kind === 'ship') {
    // 船頭と水夫を雇う（往復）
    for (const q of sailors) { board(sim, q, c, 'sail'); c.crew.push(q.id); }
    sim.remember(p, `${dest.name}へ向けて、${GOODS[g].name}${qty}を船に積んで港を出た`, { emo: 0.3, imp: 0.4, k: 'trade' });
    sim.pushLog(`${who(p)}の船が${GOODS[g].name}${qty}を積んで${here.name}の港を出た（行き先は${dest.name}）。`, 'event', [p.id, ...c.crew], c.pos);
  } else {
    if (risk.risk >= 3.5) hireEscort(sim, p, c, risk);
    sim.remember(p, `${dest.name}へ向けて、${GOODS[g].name}${qty}を荷車に積んで出発した${c.guards.length ? '（護衛つき）' : ''}`, { emo: 0.2, imp: 0.35, k: 'trade' });
    if (R.chance(0.35) || c.guards.length) sim.pushLog(`${who(p)}の荷車が${GOODS[g].name}${qty}を積んで${here.name}を出た（${dest.name}行き${c.guards.length ? '・護衛' + c.guards.map((id) => S.people[id].given).join('と') : ''}）。`, 'event', [p.id, ...c.guards], c.pos);
  }
  return true;
}

// ---------- 護衛依頼（guild.js の post と同じ形の依頼オブジェクト） ----------
export function makeEscortQuest(sim, o) {
  const S = sim.S;
  S.quests = S.quests || [];
  S.nextQuest = (S.nextQuest || 0) + 1;
  const q = { id: S.nextQuest, state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 3, type: 'escort', s: o.s, from: o.s, target: o.dest, convoy: o.convoy, rank: o.rank, reward: o.reward, giver: o.giver, title: o.title };
  S.quests.push(q);
  return q;
}
function hireEscort(sim, p, c, risk) {
  const S = sim.S, hh = sim.hh(p);
  const want = risk.risk >= 7 ? 2 : 1;
  const reward = Math.round(8 + risk.risk * 3) * want;
  if (!hh || hh.money < reward + 10) return;
  const dest = sim.town(c.to);
  const rank = Math.min(4, Math.floor(risk.risk / 3));
  const cands = sim.living().filter((q) => (isAdventurer(q) || SELLSWORD.has(q.job)) && q.s === p.s && !q.quest && q.jail == null && !q.fight && q.hp > q.maxhp * 0.6 && sim.isAdult(q) && q.action?.type !== 'sleep' && !RIDE.has(q.action?.type) && advRank(q) + 1 >= rank)
    .sort((a, b) => (b.lv || 1) - (a.lv || 1) + (sim.rel(p, b).a - sim.rel(p, a).a) / 50);
  const q = makeEscortQuest(sim, { s: p.s, dest: c.to, convoy: c.id, rank, reward, giver: p.id, title: `${dest.name}まで荷車を護衛してほしい（${who(p)}）` });
  const g = sim.townBuilding(sim.townOf(p), 'guild');
  sim.pushLog(`【依頼】${q.title}（報酬${reward}銅貨・${RANKS_ADV[rank]}ランク以上）`, 'event', [p.id], g ? g.door : c.pos);
  const hired = cands.slice(0, want);
  if (!hired.length) {
    q.state = 'failed'; q.closed = sim.today;
    sim.remember(p, `護衛を頼もうとしたが引き受け手がおらず、ひとりで${dest.name}へ向かった`, { emo: -0.3, imp: 0.45, k: 'trade' });
    return;
  }
  q.state = 'taken'; q.taken = sim.today; q.takenBy = hired.map((m) => m.id);
  c.quest = q.id;
  S.logi.escorts++;
  for (const m of hired) {
    board(sim, m, c, 'escort'); c.guards.push(m.id);
    sim.remember(m, `${who(p)}の荷車の護衛を引き受け、${dest.name}へ向かった`, { emo: 0.3, imp: 0.45, about: [p.id], k: 'quest' });
  }
}

// ---------- 定期船（港どうし。船長の家の資金で荷を積み、往復する） ----------
function pickCargo(sim, fromSid, toSid, budget) {
  const a = sim.market(fromSid), b = sim.market(toSid);
  const opts = Object.keys(GOODS).map((g) => ({ g, r: b.price[g] / a.price[g] })).filter((o) => o.r > 1.08 && a.stock[o.g] > GOODS[o.g].target * 0.45).sort((x, y) => y.r - x.r);
  const goods = {}; let n = 0, cost = 0;
  for (const { g } of opts) {
    const q = Math.min(12, SHIP_CAP - n, Math.floor(a.stock[g] - GOODS[g].target * 0.35), Math.floor((budget - cost) / a.price[g]));
    if (q <= 0) continue;
    goods[g] = q; n += q; cost += q * a.price[g]; a.stock[g] -= q;
    if (n >= SHIP_CAP) break;
  }
  return { goods, cost };
}
function launchLiner(sim, port) {
  const S = sim.S, R = sim.rng;
  const dests = seaPorts(sim).filter((s) => s.id !== port.id && seaRoute(sim, port.id, s.id));
  if (!dests.length) return;
  const crewAll = sim.living().filter((q) => q.s === port.id && (q.job === 'captain' || q.job === 'sailor') && q.jail == null && !q.fight && !RIDE.has(q.action?.type) && sim.isAdult(q) && q.hp > q.maxhp * 0.5);
  const cap = crewAll.find((q) => q.job === 'captain');
  if (!cap) return;
  const dest = R.pick(dests);
  const hh = sim.hh(cap);
  const { goods, cost } = pickCargo(sim, port.id, dest.id, Math.max(0, Math.min(300, (hh?.money || 0) * 0.6)));
  if (hh) hh.money -= cost;
  const c = newConvoy(sim, { kind: 'ship', goods, cost, from: port.id, to: dest.id, path: seaRoute(sim, port.id, dest.id), owner: cap.id, hh: cap.hh, roundTrip: true, liner: true });
  board(sim, cap, c, 'sail');
  for (const q of crewAll.filter((x) => x !== cap).slice(0, 2)) { board(sim, q, c, 'sail'); c.crew.push(q.id); }
  sim.remember(cap, `定期船の船長として${dest.name}へ舵を取った`, { emo: 0.3, imp: 0.35, k: 'trade' });
  sim.pushLog(`${port.name}の港から${dest.name}行きの定期船が出た（船長${cap.given}、積み荷：${Object.keys(goods).length ? goodsText(goods) : '旅人と手紙だけ'}）。`, 'event', [cap.id, ...c.crew], c.pos);
}

// ---------- 毎歩：位置を進めるだけ ----------
export function stepConvoys(sim, dt) {
  const S = sim.S;
  if (!S.convoys || !S.convoys.length) return;
  const w = S.world;
  for (let k = S.convoys.length - 1; k >= 0; k--) {
    const c = S.convoys[k];
    // 乗っている人を確かめる（行動が変わった人は降りた）
    let fighting = false;
    for (const list of [c.guards, c.crew]) for (let j = list.length - 1; j >= 0; j--) {
      const p = S.people[list[j]];
      if (p && p.fight) { fighting = true; continue; }
      if (!p || p.deathYear != null || p.action?.convoy !== c.id) { if (p && p._spot > 1e6) p._spot = 0; list.splice(j, 1); }
    }
    const own = c.owner != null ? S.people[c.owner] : null;
    if (own && own.fight) fighting = true;
    else if (c.owner != null && (!own || own.deathYear != null || own.action?.convoy !== c.id)) { if (own && own._spot > 1e6) own._spot = 0; c.ownerLeft = c.owner; c.owner = null; }
    if (S.t >= c.next) { c.next = S.t + CHECK_EVERY; checkConvoy(sim, c, fighting); if (c.done) { S.convoys.splice(k, 1); continue; } }
    if (c.state === 'moving' && !fighting) {
      let sp = (c.kind === 'ship' ? SHIP_SPEED : CART_SPEED) * dt;
      while (sp > 0 && c.i < c.path.length) {
        const t = c.path[c.i];
        const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz);
        const slow = c.kind === 'ship' ? 1 : (TILE_SLOW[w.tiles[t.z * W + t.x]] || 1);
        const step = sp / slow;
        if (d > 0.001) { c.dir.x = dx / d; c.dir.z = dz / d; }
        if (d <= step) { c.pos.x = t.x; c.pos.z = t.z; c.i++; sp -= d * slow; }
        else { c.pos.x += (dx / d) * step; c.pos.z += (dz / d) * step; sp = 0; }
      }
      if (c.i >= c.path.length) { arriveConvoy(sim, c); if (c.done) { S.convoys.splice(k, 1); continue; } }
    }
    // 乗り手を隊商の位置へ（荷車の脇を歩く／船に乗る）
    const rs = riders(c);
    for (let j = 0; j < rs.length; j++) {
      const p = S.people[rs[j]];
      if (!p || p.fight) continue;
      if (c.kind === 'ship') { p.pos.x = c.pos.x; p.pos.z = c.pos.z; }
      else { const off = j === 0 ? 0 : (j % 2 ? 0.7 : -0.7); p.pos.x = c.pos.x - c.dir.z * off - c.dir.x * (j ? 0.5 : 0); p.pos.z = c.pos.z + c.dir.x * off - c.dir.z * (j ? 0.5 : 0); }
    }
  }
}

// ---------- 判定（10分ごと） ----------
function checkConvoy(sim, c, fighting) {
  const S = sim.S, R = sim.rng;
  // 長すぎる旅は打ち切る（行き詰まり防止）
  if (S.t - c.t0 > 1440 * 4) { abandon(sim, c, '道に迷い、荷を捨てて引き返した'); return; }
  if (c.state === 'docked') { if (S.t >= c.until) departReturn(sim, c); return; }
  if (c.state === 'storm') { if (S.t >= c.until) c.state = 'moving'; return; }
  if (c.state === 'fight') { if (!fighting) resolveFight(sim, c); return; }
  if (c.state !== 'moving') return;
  if (c.kind === 'ship') { stormCheck(sim, c); return; }
  // 町の中は安全
  const near = S.world.settlements.find((s) => Math.abs(s.x - c.pos.x) < s.r && Math.abs(s.z - c.pos.z) < s.r);
  if (near && !S.towns[near.id].occupied) return;
  // 盗賊：アジトのそばを通ると、待ち伏せされることがある（アジトごとに一度だけ判定）
  for (const b of hideouts(sim)) {
    if (c.met['b' + b.id] || Math.abs(b.x - c.pos.x) > 12 || Math.abs(b.z - c.pos.z) > 12) continue;
    c.met['b' + b.id] = 1;
    const band = freeBandits(sim, b);
    if (!band.length) continue;
    const lure = Math.min(1, goodsValue(c.goods) / 60);
    if (!R.chance((0.25 + 0.3 * lure) * (c.guards.length ? 0.45 : 1))) continue;
    banditAmbush(sim, c, b, band.slice(0, Math.min(3, 1 + c.guards.length)));
    return;
  }
  // 魔物：近くにいる敵意のある魔物に気づかれることがある（危険な区画ほど気づかれやすい）
  if (!sim._cgrid) return;
  const dz = dangerAt(sim, c.pos.x, c.pos.z);
  for (const m of around(sim._cgrid, c.pos.x, c.pos.z, 6)) {
    if (!m.hostile || m.dormant || m.hp <= 0 || m.fight || m.inDungeon || c.met[m.id]) continue;
    if (Math.hypot(m.pos.x - c.pos.x, m.pos.z - c.pos.z) > 6) continue;
    c.met[m.id] = 1;
    if (!R.chance(Math.min(0.8, 0.3 + dz * 0.06))) continue;
    monsterAttack(sim, c, m);
    return;
  }
}

function placeName(sim, c) { return sim.placeName ? sim.placeName(Math.round(c.pos.x), Math.round(c.pos.z)) : '街道'; }

function banditAmbush(sim, c, hide, band) {
  const S = sim.S, R = sim.rng;
  const own = S.people[c.owner];
  const where = placeName(sim, c);
  // 盗賊は街道脇の茂みから飛び出してくる
  band.forEach((b, j) => {
    if (b.inside != null) b.inside = null;
    b.pos = { x: c.pos.x + (j - 1) * 0.8 + c.dir.z * 1.2, z: c.pos.z - c.dir.x * 1.2 + (j - 1) * 0.3 };
    b.action = null; b.path = []; b.lastRob = sim.today; b.talk = null;
  });
  if (c.guards.length) {
    c.state = 'fight'; c.attackers = band.map((b) => b.id); c.foe = 'bandit'; c.hide = hide.id;
    band.forEach((b, j) => startFight(sim, b, S.people[c.guards[j % c.guards.length]]));
    sim.pushLog(`${where}で、${sim.town(c.to).name}へ向かう荷車を${hide.name}の盗賊${band.map((b) => b.given).join('・')}が襲った。護衛が剣を抜いた！`, 'event', [...c.guards, ...c.attackers], c.pos);
    return;
  }
  robbed(sim, c, band, hide, where);
}

function robbed(sim, c, band, hide, where) {
  const S = sim.S, R = sim.rng;
  const own = S.people[c.owner] || S.people[c.ownerLeft];
  const frac = R.range(0.5, 1);
  const lost = {};
  for (const [g, n] of Object.entries(c.goods)) { const q = Math.ceil(n * frac); lost[g] = q; c.goods[g] = n - q; }
  const val = goodsValue(lost);
  S.logi.robbed++; S.logi.lostValue += val;
  const bhh = band[0] && sim.hh(band[0]);
  if (bhh) bhh.money += val * 0.4;          // 奪った荷は闇で売りさばく
  if (band[0]) markWanted(sim, band[0], '追いはぎ', 15);
  if (hide) hide.robberies = (hide.robberies || 0) + 1;
  for (const b of band) sim.remember(b, `街道で商人の荷車を襲い、${goodsText(lost)}を奪った`, { emo: 0.3, imp: 0.5, k: 'crime' });
  if (own && own.deathYear == null) {
    sim.remember(own, `${where}で盗賊に荷車を襲われ、${goodsText(lost)}を奪われた`, { emo: -0.85, imp: 0.85, about: band.map((b) => b.id), k: 'robbed', where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) } });
    sim.learnDanger?.(own, c.pos.x, c.pos.z, 3);
    own.needs.survival = Math.max(0, own.needs.survival - 30);
    const ears = sim.living().filter((q) => (q.s === own.s || q.s === c.to) && q !== own && sim.isAdult(q));
    sim.gossip(own, `${where}で盗賊に荷を奪われたらしい`, -0.6, R.shuffle(ears).slice(0, 10), { silent: true });
    for (const q of R.shuffle(ears).slice(0, 12)) sim.learnDanger?.(q, c.pos.x, c.pos.z, 1.5);
  }
  sim.news(`${where}で、${own ? who(own) + 'の' : ''}荷車が盗賊に襲われ、${goodsText(lost)}が奪われた`, 1, c.pos);
  if (!Object.values(c.goods).some((n) => n > 0)) abandon(sim, c, null);
}

function monsterAttack(sim, c, m) {
  const S = sim.S, R = sim.rng;
  const where = placeName(sim, c);
  S.logi.monster++;
  if (c.guards.length) {
    c.state = 'fight'; c.attackers = [m.id]; c.foe = 'monster';
    for (const id of c.guards) startFight(sim, S.people[id], m);
    sim.pushLog(`${where}で荷車に${m.name}が襲いかかった。護衛の${c.guards.map((id) => S.people[id].given).join('と')}が迎え撃つ！`, 'event', [...c.guards], c.pos);
    return;
  }
  // 護衛なし：荷車がひっくり返り、荷の一部を失う。商人はけがをして逃げ延びる
  const frac = R.range(0.2, 0.45), lost = {};
  for (const [g, n] of Object.entries(c.goods)) { const q = Math.ceil(n * frac); lost[g] = q; c.goods[g] = n - q; }
  S.logi.lostValue += goodsValue(lost);
  m.calm = S.t + 60;
  const own = S.people[c.owner];
  if (own) {
    own.hp = Math.max(1, own.hp - own.maxhp * R.range(0.1, 0.3));
    sim.remember(own, `${where}で${m.name}に荷車を襲われ、${goodsText(lost)}を失った`, { emo: -0.75, imp: 0.75, k: 'fight', where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) } });
    sim.learnDanger?.(own, c.pos.x, c.pos.z, 3);
  }
  sim.pushLog(`${where}で${own ? who(own) + 'の' : ''}荷車が${m.name}に襲われ、${goodsText(lost)}を失った。`, 'event', own ? [own.id] : [], c.pos);
  if (!Object.values(c.goods).some((n) => n > 0)) abandon(sim, c, null);
}

function resolveFight(sim, c) {
  const S = sim.S;
  const where = placeName(sim, c);
  const foes = c.attackers.map((id) => sim.entity ? sim.entity(id) : (S.people[id] || S.creatures[id])).filter((e) => e && e.hp > 0 && e.deathYear == null && e.jail == null && Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z) < 6 && !(e.fleeUntil > S.t));
  const guards = c.guards.map((id) => S.people[id]).filter((g) => g && g.deathYear == null && g.hp > g.maxhp * 0.2);
  c.state = 'moving';
  c.attackers = [];
  if (foes.length && !guards.length) {
    if (c.foe === 'bandit') robbed(sim, c, foes, sim.building(c.hide), where);
    else { const m = foes[0]; c.guards.length = 0; monsterAttack(sim, c, m); S.logi.monster--; }
    return;
  }
  // 撃退した
  S.logi.repelled++;
  for (const f of foes) if (typeof f.id === 'number') { f.action = null; }
  for (const g of guards) {
    g.fame = (g.fame || 0) + 2; g.needs.esteem = Math.min(100, g.needs.esteem + 20);
    sim.remember(g, `${where}で荷車を狙った${c.foe === 'bandit' ? '盗賊' : '魔物'}を追い払った`, { emo: 0.6, imp: 0.6, k: 'quest' });
  }
  const own = S.people[c.owner];
  if (own) {
    sim.remember(own, `${where}で${c.foe === 'bandit' ? '盗賊' : '魔物'}に襲われたが、護衛の${guards.map((g) => g.given).join('と')}が守ってくれた`, { emo: 0.4, imp: 0.7, about: guards.map((g) => g.id), k: 'trade' });
    for (const g of guards) sim.relMut(own, g).a += 12;
  }
  if (guards.length) sim.news(`${where}で、冒険者${guards.map((g) => g.given).join('・')}が荷車を襲った${c.foe === 'bandit' ? '盗賊' : '魔物'}を撃退した`, 1, c.pos);
}

function stormCheck(sim, c) {
  const S = sim.S, R = sim.rng;
  const wx = sim.weatherAt ? sim.weatherAt(c.pos.x, c.pos.z) : S.weather;
  const p = wx === 'storm' || wx === 'squall' ? 0.3 : wx === 'rain' ? 0.02 : 0;
  if (!p || c.stormed || !R.chance(p)) return;
  c.stormed = true;
  c.state = 'storm'; c.until = S.t + R.int(60, 240);
  S.logi.storm++;
  const lost = {};
  if (R.chance(0.4)) for (const [g, n] of Object.entries(c.goods)) { const q = Math.floor(n * R.range(0.2, 0.5)); if (q) { lost[g] = q; c.goods[g] = n - q; } }
  const lostTxt = Object.keys(lost).length ? `、船を軽くするため${goodsText(lost)}を海に捨てた` : '';
  S.logi.lostValue += goodsValue(lost);
  for (const id of riders(c)) { const q = S.people[id]; if (q) { q.needs.survival = Math.max(0, q.needs.survival - 35); sim.remember(q, `${sim.town(c.to).name}へ向かう船の上で嵐に遭い、生きた心地がしなかった`, { emo: -0.7, imp: 0.7, k: 'storm' }); } }
  sim.news(`${sim.town(c.to).name}へ向かう船が海の上で嵐に遭い、足止めされている${lostTxt}`, 1, c.pos);
}

// ---------- 到着 ----------
function sellGoods(sim, c, sid) {
  const m = sim.market(sid);
  let earn = 0;
  for (const [g, n] of Object.entries(c.goods)) { if (n <= 0) continue; earn += n * m.price[g] * 0.92; m.stock[g] += n; }
  const hh = sim.S.households[c.hh];
  if (hh) hh.money += earn;
  return earn;
}
function arriveConvoy(sim, c) {
  const S = sim.S, R = sim.rng;
  const to = sim.town(c.to);
  const txt = goodsText(c.goods);
  const earn = sellGoods(sim, c, c.to);
  const profit = earn - c.cost;
  S.logi.arrived++;
  const own = S.people[c.owner];
  if (own) {
    sim.remember(own, `${to.name}で${txt}を売って${Math.round(profit)}銅貨${profit >= 0 ? 'もうけた' : '損をした'}`, { emo: profit > 0 ? 0.5 : -0.4, imp: 0.45, k: 'trade' });
    own.needs.esteem = Math.min(100, own.needs.esteem + (profit > 0 ? 15 : -5));
  }
  // 町の人は、荷が届いたことに気づく
  const locals = sim.living().filter((q) => q.s === c.to && sim.isAdult(q));
  const empty = !Object.values(c.goods).some((n) => n > 0);
  const newsTxt = `${sim.town(c.from).name}から${c.kind === 'ship' ? '船' : '荷車'}が着き、` + (empty ? (c.kind === 'ship' ? '旅人と手紙を降ろした' : '空の荷台で入ってきた') : `${txt}が市場に並んだ`);
  if (!empty) for (const q of R.shuffle(locals).slice(0, 3)) sim.remember(q, newsTxt, { emo: 0.15, imp: 0.25, k: 'market' });
  sim.pushLog(`${to.name}：${newsTxt}${own ? `（${c.liner ? '船長' + own.given : who(own)}）` : ''}。`, 'event', own ? [own.id] : [], c.pos);
  payEscort(sim, c);
  if (c.kind === 'ship' && c.roundTrip && c.leg === 1) {
    // 港でひと休みし、帰りの荷を積んで戻る
    c.state = 'docked'; c.until = S.t + R.int(180, 360); c.goods = {}; c.cost = 0; c.leg = 2;
    const rs = riders(c);
    for (const id of rs) { const q = S.people[id]; if (q) { sim.remember(q, `船で${to.name}の港に着いた`, { emo: 0.35, imp: 0.35, k: 'travel' }); q.needs.pleasure = Math.min(100, q.needs.pleasure + 15); } }
    return;
  }
  // 船乗りの手間賃（船主の家計から）
  if (c.kind === 'ship') {
    const hh = S.households[c.hh];
    for (const id of c.crew) { const q = S.people[id]; const qh = q && sim.hh(q); if (qh && hh && qh !== hh) { hh.money -= 8; qh.money += 8; } }
  }
  finish(sim, c);
}
function departReturn(sim, c) {
  const S = sim.S;
  const hh = S.households[c.hh];
  const { goods, cost } = pickCargo(sim, c.to, c.from, Math.max(0, Math.min(300, (hh?.money || 0) * 0.6)));
  if (hh) hh.money -= cost;
  c.goods = goods; c.cost = cost;
  const back = seaRoute(sim, c.to, c.from);
  if (!back) { abandon(sim, c, null); return; }
  [c.from, c.to] = [c.to, c.from];
  c.path = back; c.i = 0; c.state = 'moving'; c.t0 = S.t; c.stormed = false; c.met = {};
  c.eta = S.t + Math.round(back.length / SHIP_SPEED);
  sim.pushLog(`${sim.town(c.from).name}の港から、${sim.town(c.to).name}へ帰る船が出た（積み荷：${goodsText(goods)}）。`, 'event', riders(c), c.pos);
}
function payEscort(sim, c) {
  const S = sim.S;
  if (c.quest == null) return;
  const q = (S.quests || []).find((x) => x.id === c.quest);
  c.quest = null;
  if (!q || q.state !== 'taken') return;
  const guards = c.guards.map((id) => S.people[id]).filter((g) => g && g.deathYear == null);
  const hh = S.households[c.hh];
  q.state = 'done'; q.closed = sim.today;
  if (!guards.length) return;
  q.doneBy = guards.map((g) => g.given).join('・');
  const share = Math.round(q.reward / guards.length);
  if (hh) hh.money -= q.reward;
  for (const g of guards) {
    g.purse = (g.purse || 0) + share * 0.7; const gh = sim.hh(g); if (gh) gh.money += share * 0.3;
    g.qp = (g.qp || 0) + 1 + q.rank;
    const before = g.advRank || 0; g.advRank = advRank(g);
    g.fame = (g.fame || 0) + 1 + q.rank;
    sim.remember(g, `「${q.title}」をやり遂げ、${share}銅貨の報酬を受け取った`, { emo: 0.6, imp: 0.5, k: 'quest' });
    if (g.advRank > before) sim.remember(g, `冒険者ランクが${RANKS_ADV[g.advRank]}に上がった`, { emo: 0.9, imp: 0.85, k: 'quest' });
  }
  sim.pushLog(`冒険者${q.doneBy}が「${q.title}」を達成した。`, 'event', guards.map((g) => g.id), c.pos);
}
function finish(sim, c) {
  const S = sim.S;
  for (const id of riders(c)) unboard(sim, S.people[id], c);
  if (c.quest != null) { const q = (S.quests || []).find((x) => x.id === c.quest); if (q && q.state === 'taken') { q.state = 'failed'; q.closed = sim.today; } }
  c.done = true; c.state = 'done';
}
function abandon(sim, c, why) {
  const S = sim.S;
  const own = S.people[c.owner];
  if (why && own) sim.remember(own, why, { emo: -0.5, imp: 0.5, k: 'trade' });
  // 残った荷は近くの町（行き先）へ戻したものとする：荷は失われる
  S.logi.lostValue += goodsValue(c.goods);
  finish(sim, c);
}

// ---------- 毎時 ----------
export function logisticsHourly(sim) {
  const S = sim.S;
  ensureLogistics(sim);
  const h = Math.floor(sim.hour());
  // 行き先を失った乗り手を降ろす（念のため）
  const ids = new Set(S.convoys.map((c) => c.id));
  for (const p of sim.living()) if (p.action?.convoy != null && !ids.has(p.action.convoy)) { p.action.until = S.t; p.action.convoy = null; if (p._spot > 1e6) p._spot = 0; }
  // 定期船：朝7時、港ごとに2日に1便（港の番号で日をずらす）
  if (h === 7 && S.convoys.length < MAX_CONVOYS) {
    for (const port of seaPorts(sim)) {
      if ((sim.today + port.id) % 2) continue;
      if (S.convoys.some((c) => c.liner && c.home === port.id)) continue;
      launchLiner(sim, port);
    }
  }
  // 町の荷車：朝から昼まで、値の開いた品を近くの町へ運ぶ。町の商人が出すが、いなければ荷運びを請け負う人が出す
  if (h >= 6 && h < 13) {
    S.logi.lastDep = S.logi.lastDep || {};
    for (const s of S.world.settlements) {
      if (S.convoys.length >= MAX_CONVOYS - 2) break;           // 定期船の分を空けておく
      if (S.towns[s.id].occupied || S.t - (S.logi.lastDep[s.id] ?? -1e9) < 6 * 60 || !sim.rng.chance(0.35)) continue;
      const tr = bestLandTrade(sim, s);
      if (!tr) { S.logi.why = S.logi.why || {}; S.logi.why[s.id + ':noTrade'] = (S.logi.why[s.id + ':noTrade'] || 0) + 1; continue; }
      const drv = pickCarter(sim, s);
      if (!drv) { S.logi.why = S.logi.why || {}; S.logi.why[s.id + ':noDriver'] = (S.logi.why[s.id + ':noDriver'] || 0) + 1; continue; }
      if (startTradeConvoy(sim, drv, tr)) S.logi.lastDep[s.id] = S.t;
    }
  }
}

// その町から近くの町へ、いちばん値が開いている品
function bestLandTrade(sim, s) {
  const here = sim.market(s.id);
  let best = null, bv = 1.2;
  for (const d of sim.S.world.settlements) {
    if (d.id === s.id || sim.S.towns[d.id].occupied || Math.hypot(d.x - s.x, d.z - s.z) > 60) continue;
    const there = sim.market(d.id);
    for (const g of Object.keys(GOODS)) {
      if (here.stock[g] < Math.max(4, GOODS[g].target * 0.4)) continue;
      const r = there.price[g] / here.price[g];
      if (r > bv) { bv = r; best = { good: g, dest: d.id, place: { x: d.x, z: d.z } }; }
    }
  }
  return best;
}
// 荷車を出す人：町の商人 → 両替商・密輸人 → 仕事のない大人（荷運びの仕事を請け負う）
const CARTERS = ['merchant', 'changer', 'smuggler', 'peddler'];
function pickCarter(sim, s) {
  const C = sim.S.convoys;
  const ok = (q) => q.s === s.id && q.jail == null && !q.fight && !q.bandit && sim.isAdult(q) && sim.ageOf(q) < 62 && q.hp > q.maxhp * 0.6
    && !RIDE.has(q.action?.type) && q.action?.type !== 'sleep' && !C.some((c) => c.owner === q.id) && (sim.hh(q)?.money || 0) >= 25 && !((q._tradeCd || 0) > sim.S.t);
  const pool = sim.living().filter(ok);
  for (const j of CARTERS) { const q = pool.find((x) => x.job === j); if (q) return q; }
  const idle = pool.filter((q) => !q.job && !q.quest);
  return idle.length ? sim.rng.pick(idle) : null;
}

// ---------- 描画向け：隊商の見た目の情報 ----------
export function convoyViews(sim) {
  return (sim.S.convoys || []).map((c) => ({ id: 'v' + c.id, kind: c.kind, home: c.home, x: c.pos.x, z: c.pos.z, dir: c.dir, angle: Math.atan2(c.dir.z, c.dir.x), state: c.state, load: Object.values(c.goods).reduce((s, n) => s + n, 0) }));
}

// ---------- 詳細欄向け：人がいま何の隊商に乗っているか ----------
export function convoyOf(sim, p) {
  const id = p.action?.convoy;
  return id != null ? (sim.S.convoys || []).find((c) => c.id === id) : null;
}
export function convoyLabel(sim, c) {
  if (!c) return '';
  const st = { moving: c.kind === 'ship' ? '航海中' : '移動中', fight: '襲撃を受けている', storm: '嵐で足止め', docked: '港で停泊中' }[c.state] || '';
  return `${c.kind === 'ship' ? '船' : '荷車'}：${sim.town(c.from).name}→${sim.town(c.to).name}（${goodsText(c.goods)}・${st}）`;
}
