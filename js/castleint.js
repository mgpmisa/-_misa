// 城の中（グラフィック部・内装の担当）
//
// 王城を、低い仕切り壁で分けたいくつもの部屋にする。まん中の列は奥が玉座の間、手前が大広間（宴の長机）。
// 西の棟：王と王妃の寝室／王子・王女の部屋／客間／礼拝堂／近衛の詰所（牢への階段）
// 東の棟：王妃の居間／重臣の執務室／書庫と宝物庫／厨房／使用人部屋
// 部屋の広さは、その城に住む人（王家の世帯）と城勤めの人数で決める。
//
// 寝台は身分の順ではなく「その人専用の寝台」で決める：
//   王と王妃 → 王の寝室の天蓋つきの夫婦の寝台（ほかの誰も使わない）
//   王家の世帯の者 → 王族の部屋（夫婦は夫婦の寝台）／重臣 → 執務室の寝台／近衛 → 詰所／使用人 → 使用人部屋の二段寝台／そのほか → 客間
//
// interior.js からの呼び方（小さな差し込みだけ）
//   open() の大きさ … type === 'castle' ? CI.castleSize(b, sim) : sizeOf(b)
//   BUILD.castle の頭 … if (CI.buildCastle(K, ctx, F)) return;
//   takeSlot の寝台 … if (k === 'bed' && this.K.bedPick) { const own = this.K.bedPick(空いている寝台, e); if (own) list = own; }
//   kindFor … if (t === 'castle') { const ck = CI.castleKindFor(e, this.K); if (ck) return ck; }
//   retarget … this.K.nav があれば部屋と廊下をたどる道にする
//   明かりの数 … K.lightCap
import { KINGDOMS } from './data.js';

const STAFF = new Set(['maid', 'butler', 'servant', 'cook', 'gardener', 'jester']);
const GUARDS = new Set(['royalguard', 'guard', 'knight', 'soldier', 'gatekeeper', 'general']);
const MINISTERS = new Set(['chancellor', 'treasurer', 'overseer', 'courtmage']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const CASTLE_FALLBACK = {
  queenseat: ['queenseat', 'royal', 'wander'], office: ['office', 'work', 'wander'], kitchen: ['kitchen', 'work', 'wander'],
  serve: ['serve', 'wander'], jest: ['jest', 'wander'], count: ['count', 'office', 'wander'], sentry: ['sentry', 'guard', 'wander'],
};

// ---------------------------------------------------------------- 住む人と間取り
function residents(b, sim) {
  const S = sim.S;
  const alive = (p) => p && p.deathYear == null;
  const hh = b.hh != null ? S.households[b.hh] : null;
  const k = S.kingdoms?.[b.kingdom];
  let king = k && k.capital === b.settlement ? S.people[k.kingId] : null;
  const fam = hh ? hh.members.map((id) => S.people[id]).filter(alive) : [];
  if (!alive(king)) king = fam.find((p) => p.job === 'king' || p.rank === 'king') || null;
  const queen = king && king.spouseId != null && alive(S.people[king.spouseId]) ? S.people[king.spouseId] : null;
  const others = fam.filter((p) => p !== king && p !== queen);
  // 王家の者の寝台：夫婦は夫婦の寝台、幼子はゆりかご、ほかは1人の寝台
  const beds = [];
  const done = new Set();
  for (const p of others) {
    if (done.has(p.id)) continue;
    const mate = p.spouseId != null ? others.find((q) => q.id === p.spouseId) : null;
    if (mate) { beds.push({ t: 'double', pid: [p.id, mate.id] }); done.add(mate.id); }
    else beds.push({ t: sim.ageOf(p) < 3 ? 'crib' : 'single', pid: [p.id] });
    done.add(p.id);
  }
  // 城勤めの人（その町に住む者）
  const town = b.settlement;
  let nS = 0, nG = 0, nM = 0;
  for (const p of sim.living()) {
    if (p.s !== town) continue;
    if (STAFF.has(p.job)) nS++;
    else if (p.job === 'royalguard') nG++;
    else if (MINISTERS.has(p.job)) nM++;
  }
  return { king, queen, beds, nS: clamp(nS, 4, 12), nG: clamp(nG, 2, 6), nM: clamp(nM, 2, 5) };
}

const UNIT = { single: 1.3, crib: 1.1, double: 1.9 };
// 寝台を壁ぞいの列に詰める（列の長さ L）
function packRows(list, L) {
  const rows = [[]];
  let used = 0;
  for (const it of list) {
    const u = UNIT[it.t] || 1.3;
    if (used + u > L && rows[rows.length - 1].length) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(it); used += u;
  }
  return rows;
}

export function castlePlan(b, sim) {
  const R = residents(b, sim);
  const a = 9;                   // 東西の棟の幅
  const c = 13;                  // まん中の列の幅（奇数：まん中のマスがある）
  const t = 9;                   // 玉座の間の奥行き
  const W = a * 2 + c + 2;
  const L = a - 0.4;
  // 王族の部屋（2列まで入る部屋を、必要なだけ）
  const royalBeds = R.beds.length ? R.beds : [{ t: 'single', pid: [] }, { t: 'single', pid: [] }];
  const rows = packRows(royalBeds, L);
  const royalRooms = [];
  for (let i = 0; i < rows.length; i += 2) royalRooms.push(rows.slice(i, i + 2));
  const west = [{ k: 'master', d: 7 }];
  royalRooms.forEach((rr, i) => west.push({ k: 'royal', d: rr.length > 1 ? 5 : 4, rows: rr, idx: i }));
  west.push({ k: 'guest', d: 4 }, { k: 'chapel', d: 4 });
  west.push({ k: 'guard', d: 5 });   // 近衛は6人まで：寝台は北の壁ぞいの1列に入る
  const east = [{ k: 'parlor', d: 6 }, { k: 'office', d: 6 }, { k: 'libtreasury', d: 5 }, { k: 'kitchen', d: 5 }, { k: 'servants', d: 4 }]; // 使用人は12人まで：二段寝台6台が1列
  const need = (list) => list.reduce((s, r) => s + r.d, 0) + list.length - 1;
  const D = Math.max(need(west), need(east), t + 12);
  // 余りは一番手前の部屋に足す
  west[west.length - 1].d += D - need(west);
  east[east.length - 1].d += D - need(east);
  const place = (list, x0, w, doorX) => {
    let z = 0;
    for (const r of list) { Object.assign(r, { x: x0, z, w, doorX }); z += r.d + 1; }
  };
  place(west, 0, a, a);
  place(east, a + c + 2, a, a + c + 1);
  return { W, D, a, c, t, west, east, R, X0: a + 1, X1: a + 1 + c, cx: a + 1 + c / 2 };
}

export function castleSize(b, sim) {
  try { const P = castlePlan(b, sim); return [P.W, P.D]; } catch (err) { return [20, 16]; }
}

// ---------------------------------------------------------------- 道探し（部屋と戸口をたどる）
function navPath(K, x0, z0, x1, z1) {
  const W = K.W, D = K.D, B = K.blocked;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < D && !B[z * W + x];
  let sx = clamp(Math.floor(x0), 0, W - 1), sz = clamp(Math.floor(z0), 0, D - 1);
  const out = [];
  if (!ok(sx, sz)) { // 家具の上（寝台など）からは、まず一番近い床へ降りる
    let best = null, bd = 1e9;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (!ok(sx + dx, sz + dz)) continue;
      const d = Math.hypot(sx + dx + 0.5 - x0, sz + dz + 0.5 - z0);
      if (d < bd) { bd = d; best = [sx + dx, sz + dz]; }
    }
    if (!best) return [[x1, z1]];
    [sx, sz] = best; out.push([sx + 0.5, sz + 0.5]);
  }
  const tx = clamp(Math.floor(x1), 0, W - 1), tz = clamp(Math.floor(z1), 0, D - 1);
  const prev = new Int32Array(W * D).fill(-2);
  const q = [sz * W + sx]; prev[q[0]] = -1;
  let goal = -1, gd = 1e9;
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i / W) | 0;
    const d = Math.hypot(x + 0.5 - x1, z + 0.5 - z1);
    if (d < gd - 1e-6) { gd = d; goal = i; }
    if (x === tx && z === tz) { goal = i; break; }
    for (const [dx, dz] of N8) {
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz)) continue;
      if (dx && dz && (!ok(x + dx, z) || !ok(x, z + dz))) continue;
      const j = nz * W + nx;
      if (prev[j] !== -2) continue;
      prev[j] = i; q.push(j);
    }
  }
  const cells = [];
  for (let i = goal; i >= 0 && prev[i] !== -1; i = prev[i]) cells.push([(i % W) + 0.5, ((i / W) | 0) + 0.5]);
  cells.reverse();
  // 見通せる所は、まっすぐ歩く（糸を引く）
  const clear = (a, b) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 3);
    for (let k = 1; k < n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n;
      if (!ok(Math.floor(x), Math.floor(z))) return false;
      // 角をかすめない
      for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) if (!ok(Math.floor(x + ox), Math.floor(z + oz))) return false;
    }
    return true;
  };
  let cur = out.length ? out[out.length - 1] : [x0, z0];
  let i = 0;
  while (i < cells.length) {
    let j = cells.length - 1;
    while (j > i && !clear(cur, cells[j])) j--;
    out.push(cells[j]); cur = cells[j]; i = j + 1;
  }
  out.push([x1, z1]);
  return out;
}

// ---------------------------------------------------------------- 寝台を選ぶ
function classOf(e, P, sim) {
  if (P.R.king && (e.id === P.R.king.id || e.id === P.R.king.spouseId)) return 'master';
  if (e.job === 'king' || e.rank === 'king') return 'master';
  if (P.famIds.has(e.id) || e.rank === 'royal' || e.job === 'royal') return 'royal';
  if (MINISTERS.has(e.job) || e.rank === 'noble') return 'minister';
  if (GUARDS.has(e.job) || e.rank === 'knight') return 'guard';
  if (STAFF.has(e.job)) return 'servant';
  return 'guest';
}
const CLS_ORDER = {
  master: ['royal', 'guest'], royal: ['royal', 'guest', 'minister'], minister: ['minister', 'guest'],
  guard: ['guard', 'guest', 'servant'], servant: ['servant', 'guard', 'guest'], guest: ['guest', 'servant', 'minister', 'guard'],
};
function bedPick(K, free, e, sim) {
  const P = K.castle;
  // その人専用の寝台（連れ合いと一緒の夫婦の寝台も）
  const own = free.filter((s) => s.pid && s.pid.includes(e.id));
  if (own.length) return own;
  const cls = classOf(e, P, sim);
  if (cls === 'master') { const m = free.filter((s) => s.cls === 'master'); if (m.length) return m; }
  const mate = e.spouseId;
  const usable = free.filter((s) => s.cls !== 'master' && (s.n === 0 || (s.double && s.occ?.includes(mate))));
  const shared = usable.find((s) => s.double && s.n > 0);
  if (shared) return [shared];
  const matePresent = mate != null && sim.S.people[mate]?.inside === K.castle.bid;
  const pick = (l) => {
    if (!l.length) return null;
    const unres = l.filter((s) => !s.pid || !s.pid.length);
    const base = unres.length ? unres : l;
    const pref = base.filter((s) => !!s.double === !!matePresent);
    return pref.length ? pref : base;
  };
  for (const c of CLS_ORDER[cls] || CLS_ORDER.guest) {
    const got = pick(usable.filter((s) => s.cls === c));
    if (got) return got;
  }
  return pick(usable) || [];
}

// ---------------------------------------------------------------- 昼の居場所
export function castleKindFor(e, K) {
  const P = K?.castle;
  if (!P) return null;
  const a = e.action?.type;
  if (a !== 'work') return null;
  const j = e.job;
  if (j === 'king') return 'throne';
  if (P.R.king && e.id === P.R.king.spouseId) return 'queenseat';
  if (j === 'royal') return 'royal';
  if (j === 'treasurer') return 'count';
  if (j === 'chancellor' || j === 'overseer') return 'office';
  if (j === 'courtmage') return 'read';
  if (j === 'royalguard' || j === 'general' || j === 'knight') return 'sentry';
  if (j === 'guard' || j === 'soldier' || j === 'gatekeeper') return 'guard';
  if (j === 'cook') return 'kitchen';
  if (j === 'butler') return 'serve';
  if (j === 'jester') return 'jest';
  if (j === 'maid' || j === 'servant' || j === 'gardener') return 'wander';
  return null;
}

// ---------------------------------------------------------------- 組み立て
export function buildCastle(K, ctx, F) {
  const { b, sim } = ctx;
  if (!sim) return false;
  const P = castlePlan(b, sim);
  if (P.W !== K.W || P.D !== K.D) return false; // 大きさが合わないときは昔の玉座の間
  const { M } = K;
  const kd = KINGDOMS[b.kingdom] || {};
  const col = kd.color || '#c93a32', col2 = kd.banner || '#8e2c24';
  const { W, D, a, c, t, X0, X1, cx } = P;
  P.bid = b.id;
  P.famIds = new Set([...(P.R.beds.flatMap((x) => x.pid)), P.R.king?.id, P.R.queen?.id].filter((x) => x != null));
  K.castle = P;
  K.bedPick = (free, e) => bedPick(K, free, e, sim);
  K.nav = (x0, z0, x1, z1) => navPath(K, x0, z0, x1, z1);
  K.lightCap = 16;
  const velvet = M.banner(col), velvet2 = M.tinted(col2);
  const doorCol = Math.floor(cx);

  // ---- 外の壁（南の扉・窓）
  const winW = [], winE = [];
  for (const r of P.west) if (r.k !== 'chapel' && r.k !== 'master') winW.push(r.z + Math.floor(r.d / 2));
  winW.push(1);
  for (const r of P.east) if (r.k !== 'kitchen') winE.push(r.z + Math.floor(r.d / 2));
  F.room(K, { floor: M.mosaic, wall: M.stone, h: 3.6, trim: M.darkStone, door: doorCol, win: { N: [X0 + 1, X1 - 2, W - 3], W: winW, E: winE, S: [2, 5, W - 3, W - 6] }, winTop: 2.8 });

  // ---- 仕切りの壁（低い石の壁と金の縁取り。戸口には柱と横木）
  const WH = 1.35, TH = 0.5;
  const isDoor = new Set();
  const post = (x, z) => { K.box(x - 0.14, 0, z - 0.14, 0.28, 2.1, 0.28, M.darkStone); K.box(x - 0.18, 2.1, z - 0.18, 0.36, 0.1, 0.36, M.gold); };
  const vWall = (x, z0, z1, doors) => { // x の列の z0..z1-1 のマス
    for (const dz of doors) isDoor.add(dz * W + x);
    let s = z0;
    const seg = (za, zb) => { if (zb <= za) return; K.box(x + 0.5 - TH / 2, 0, za, TH, WH, zb - za, M.stone); K.box(x + 0.5 - TH / 2 - 0.04, WH, za, TH + 0.08, 0.08, zb - za, M.darkStone); K.box(x + 0.5 - 0.05, WH + 0.08, za, 0.1, 0.04, zb - za, M.gold); };
    for (let z = z0; z < z1; z++) {
      if (doors.includes(z)) { seg(s, z); s = z + 1; post(x + 0.5, z); post(x + 0.5, z + 1); K.box(x + 0.5 - 0.12, 2.0, z, 0.24, 0.16, 1, M.darkStone); K.box(x + 0.5 - 0.06, 2.16, z + 0.3, 0.12, 0.2, 0.4, M.gold); }
      else K.solid(x + 0.2, z + 0.2, 0.6, 0.6);
    }
    seg(s, z1);
  };
  const hWall = (z, x0, x1, doors) => {
    for (const dx of doors) isDoor.add(z * W + dx);
    let s = x0;
    const seg = (xa, xb) => { if (xb <= xa) return; K.box(xa, 0, z + 0.5 - TH / 2, xb - xa, WH, TH, M.stone); K.box(xa, WH, z + 0.5 - TH / 2 - 0.04, xb - xa, 0.08, TH + 0.08, M.darkStone); K.box(xa, WH + 0.08, z + 0.5 - 0.05, xb - xa, 0.04, 0.1, M.gold); };
    for (let x = x0; x < x1; x++) {
      if (doors.includes(x)) { seg(s, x); s = x + 1; post(x, z + 0.5); post(x + 1, z + 0.5); K.box(x, 2.0, z + 0.5 - 0.12, 1, 0.16, 0.24, M.darkStone); }
      else K.solid(x + 0.2, z + 0.2, 0.6, 0.6);
    }
    seg(s, x1);
  };
  // 戸口の行（寝台の列の前の通路）。玉座の間と大広間の間の壁の行に当たるときは、ひとつ南の通路へずらす
  const wingDoor = (r) => { const z = r.k === 'master' ? 5 : r.k === 'parlor' ? r.z + 3 : r.z + 2; return z === t ? r.z + 4 : z; };
  vWall(a, 0, D, P.west.map(wingDoor));
  vWall(X1, 0, D, P.east.map(wingDoor));
  for (const r of P.west.slice(0, -1)) hWall(r.z + r.d, 0, a, []);
  for (const r of P.east.slice(0, -1)) hWall(r.z + r.d, X1 + 1, W, []);
  hWall(t, X0, X1, [doorCol - 1, doorCol, doorCol + 1]);

  // 部屋の床（寝室などは寄せ木、厨房は白いタイル）
  const floorOf = { master: M.parquet, royal: M.parquet, guest: M.parquet, parlor: M.parquet, office: M.parquet, libtreasury: M.parquet, kitchen: M.whiteTile, servants: M.planks, guard: M.stone, chapel: M.mosaic };
  for (const r of [...P.west, ...P.east]) if (floorOf[r.k] && floorOf[r.k] !== M.mosaic) K.box(r.x, 0, r.z, r.w, 0.012, r.d, floorOf[r.k]);

  // 部屋の中の座標：u は「戸口から遠い側」から測る
  const room = (r) => {
    const farW = r.doorX > r.x; // 西の棟：遠い側は西
    return {
      ...r,
      X: (u, w = 0) => (farW ? r.x + u : r.x + r.w - u - w),
      C: (u) => (farW ? r.x + u : r.x + r.w - u),
      far: farW ? 'W' : 'E', inward: farW ? [1, 0] : [-1, 0], outward: farW ? [-1, 0] : [1, 0],
    };
  };
  const blankets = [M.red, M.blue, M.green, M.purple, M.pink, M.orange];
  const tagBeds = (n0, cls, pid) => { const ss = K.slots.slice(n0).filter((s) => s.k === 'bed'); for (const s of ss) { s.cls = cls; if (pid) s.pid = pid; } return ss; };
  // 寝台の列（北の壁ぞいと南の壁ぞい）
  const bedRows = (r, rows, cls, o = {}) => {
    rows.forEach((row, ri) => {
      const z = ri === 0 ? r.z + 0.05 : r.z + r.d - 2.05;
      let u = 0.2;
      row.forEach((it, i) => {
        const wid = it.t === 'double' ? 1.6 : it.t === 'crib' ? 0.8 : 1;
        const x = r.X(u, wid);
        const n0 = K.slots.length;
        if (it.t === 'crib') crib(x, z + 0.4);
        else F.bed(K, x, z, { double: it.t === 'double', upper: !!o.bunk, canopy: o.canopy ? (it.t === 'double' ? velvet : velvet2) : null, frame: o.frame || M.darkWood, blanket: o.blanket || blankets[(i + ri * 3 + (o.shift || 0)) % blankets.length], blanket2: o.blanket2 });
        tagBeds(n0, cls, it.pid && it.pid.length ? it.pid : null);
        u += UNIT[it.t] || 1.3;
      });
    });
  };
  const crib = (x, z) => { // ゆりかご
    K.box(x, 0, z, 0.8, 0.3, 1.2, M.darkWood);
    K.box(x + 0.06, 0.3, z + 0.06, 0.68, 0.1, 1.08, M.white);
    K.box(x + 0.08, 0.36, z + 0.5, 0.64, 0.06, 0.6, M.pink);
    for (let i = 0; i <= 4; i++) { K.box(x + i * 0.19, 0.3, z, 0.04, 0.35, 0.04, M.darkWood); K.box(x + i * 0.19, 0.3, z + 1.16, 0.04, 0.35, 0.04, M.darkWood); }
    K.box(x, 0.63, z, 0.8, 0.04, 0.04, M.gold); K.box(x, 0.63, z + 1.16, 0.8, 0.04, 0.04, M.gold);
    K.solid(x, z, 0.8, 1.2);
    K.slot('bed', x + 0.4, z + 0.6, { y: 0.42, lie: true, face: [0, 1] });
  };
  const candleStand = (x, z, o = {}) => F.candle(K, x, z, 0, { h: 1.3, arms: 3, li: 1.4, ld: 4, ...o });
  const bannerStand = (x, z) => { // 床に立てる旗
    K.box(x - 0.2, 0, z - 0.2, 0.4, 0.1, 0.4, M.darkStone);
    K.box(x - 0.03, 0, z - 0.03, 0.06, 2.6, 0.06, M.brass);
    K.box(x - 0.35, 2.5, z - 0.03, 0.7, 0.05, 0.06, M.gold);
    K.box(x - 0.3, 1.3, z - 0.01, 0.6, 1.2, 0.02, velvet);
    K.box(x - 0.1, 1.75, z - 0.02, 0.2, 0.3, 0.04, M.gold);
    K.sphere(x, 2.66, z, 0.07, M.gold, { seg: 6, seg2: 4 });
    K.solid(x - 0.3, z - 0.3, 0.6, 0.6);
  };

  // ================= 玉座の間
  {
    K.box(cx - 4, 0, 0, 8, 0.25, 3.4, M.stone); K.box(cx - 3, 0.25, 0, 6, 0.2, 2.6, M.stone);
    K.box(cx - 4, 0.25, 3.36, 8, 0.02, 0.05, M.gold);
    F.rug(K, cx - 2.6, 0.45, 5.2, 2.0, M.carpet);
    K.solid(cx - 4, 0, 8, 3.4);
    const ty = 0.47;
    K.box(cx - 0.6, ty, 0.5, 1.2, 0.5, 0.9, M.gold); K.box(cx - 0.45, ty + 0.5, 0.6, 0.9, 0.08, 0.7, velvet2);
    K.box(cx - 0.6, ty, 0.3, 1.2, 1.9, 0.25, M.gold); K.box(cx - 0.45, ty + 0.55, 0.52, 0.9, 1.2, 0.05, velvet2);
    K.box(cx - 0.75, ty, 0.5, 0.18, 0.85, 0.9, M.gold); K.box(cx + 0.57, ty, 0.5, 0.18, 0.85, 0.9, M.gold);
    K.box(cx - 0.18, ty + 1.9, 0.33, 0.36, 0.3, 0.2, M.gold); K.box(cx - 0.08, ty + 2.0, 0.3, 0.16, 0.16, 0.05, M.redCrystal);
    K.slot('throne', cx, 1.1, { y: ty + 0.1, face: [0, 1] });
    for (const s of [-1, 1]) {
      const x = cx + s * 1.8;
      K.box(x - 0.4, ty, 0.6, 0.8, 0.45, 0.7, M.gold); K.box(x - 0.4, ty, 0.45, 0.8, 1.3, 0.18, M.gold); K.box(x - 0.3, ty + 0.45, 0.62, 0.6, 0.06, 0.6, velvet2);
      K.slot('royal', x, 1.1, { y: ty + 0.05, face: [0, 1] });
    }
    // 玉座の後ろの垂れ幕（国の色）と紋章
    K.box(cx - 1.6, 0.45, 0.02, 3.2, 3.0, 0.04, velvet, { g: 'N' });
    K.box(cx - 1.7, 3.45, 0.0, 3.4, 0.12, 0.1, M.gold, { g: 'N' });
    F.wallPic(K, 'N', cx, 2.35, 1.1, 0.9, M.shield);
    F.rug(K, cx - 1.1, 3.4, 2.2, t - 3.4, M.carpet);
    for (const z of [5, 7.6]) for (const s of [-1, 1]) F.pillar(K, cx + s * 3.8, z, 3.6, M.stone, { r: 0.35, cap: M.darkStone });
    for (const s of [-1, 1]) { F.candle(K, cx + s * 3.2, 1.2, 0.25, { h: 1.4, arms: 3, li: 2.4 }); K.slot('sentry', cx + s * 2.2, 4.3, { face: [-s, 0] }); }
    K.slot('sentry', X0 + 0.5, 6.6, { face: [0, -1] });       // 王の寝室の戸口
    K.slot('guard', cx + 2.2, t - 0.6, { face: [0, -1] }); K.slot('guard', cx - 2.2, t - 0.6, { face: [0, -1] });
    K.slot('jest', cx + 1.3, 4.0, { face: [0, -1] });
    for (const x of [cx - 5.5, cx - 3, cx + 3, cx + 5.5]) F.banner(K, 'N', x, col, 1.0, 2.0);
    F.chandelier(K, cx, 5.5, 3.0, { r: 0.9, li: 3.5, ld: 11 });
  }

  // ================= 大広間（宴の長机）
  {
    const z0 = t + 1, z1 = D;
    F.rug(K, cx - 1.1, z0, 2.2, z1 - z0, M.carpet);
    const tz0 = z0 + 2, tz1 = Math.min(z1 - 3, tz0 + 11);
    const len = Math.max(3, tz1 - tz0);
    for (const s of [-1, 1]) {
      const tx = s < 0 ? X0 + 2 : X1 - 3.2;
      F.table(K, tx, tz0, 1.2, len, { cloth: M.white, top: M.darkWood });
      K.box(tx + 0.1, 0.73, tz0 + 0.1, 1.0, 0.02, len - 0.2, velvet);
      for (let z = tz0 + 0.5; z < tz0 + len - 0.2; z += 1) {
        for (const side of [-1, 1]) {
          const chx = side < 0 ? tx - 0.45 : tx + 1.65;
          F.chair(K, chx, z, [-side, 0], { mat: M.darkWood, cushion: velvet2 });
          K.slot('eat', chx, z, { face: [-side, 0] });
        }
        // 皿と杯
        K.cyl(tx + 0.35, 0.73, z, 0.14, 0.03, M.white, { seg: 8 }); K.cyl(tx + 0.85, 0.73, z, 0.14, 0.03, M.white, { seg: 8 });
        if ((z | 0) % 2) K.cyl(tx + 0.6, 0.73, z, 0.05, 0.16, M.gold, { seg: 6 });
      }
      // 料理と燭台
      K.box(tx + 0.4, 0.74, tz0 + len / 2 - 0.3, 0.4, 0.14, 0.6, M.meat); K.box(tx + 0.4, 0.74, tz0 + 1.5, 0.35, 0.12, 0.35, M.bread);
      K.cyl(tx + 0.6, 0.74, tz0 + len - 1.4, 0.2, 0.12, M.apple, { seg: 8 });
      F.candle(K, tx + 0.6, tz0 + len / 3, 0.74, { noStand: true, arms: 3, light: false });
      F.candle(K, tx + 0.6, tz0 + (len * 2) / 3, 0.74, { noStand: true, arms: 3, light: false });
      K.slot('serve', tx + 0.6, tz0 - 0.6, { face: [0, 1] });
      bannerStand(cx + s * 2.3, z0 + 0.6);
      candleStand(s < 0 ? cx - 1.9 : cx + 1.9, z1 - 2.2);
    }
    F.chandelier(K, cx, z0 + len / 3 + 1.5, 3.0, { r: 1.0, li: 3.2, ld: 10 });
    F.chandelier(K, cx, z0 + (len * 2) / 3 + 2.5, 3.0, { r: 1.0, li: 3.2, ld: 10 });
    F.armor(K, cx - 3.0, z1 - 0.7); F.armor(K, cx + 3.0, z1 - 0.7);
    K.slot('guard', cx - 1.8, z1 - 1.0, { face: [0, -1] }); K.slot('guard', cx + 1.8, z1 - 1.0, { face: [0, -1] });
  }

  // ================= 西の棟・東の棟
  const R = P.R;
  for (const r0 of [...P.west, ...P.east]) {
    const r = room(r0);
    switch (r.k) {
      case 'master': { // 王と王妃の寝室
        F.hearth(K, 0.6, 2.2, { li: 3 });
        F.rug(K, 3.2, 0.3, 4.4, 4.6, M.carpetPurple);
        // 天蓋つきの大きな夫婦の寝台
        const bx = 4.1, bz = 0.15, bw = 2.4, bd = 2.6;
        K.box(bx, 0, bz, bw, 0.36, bd, M.darkWood);
        K.box(bx - 0.02, 0.3, bz - 0.02, bw + 0.04, 0.05, bd + 0.04, M.gold);
        K.box(bx + 0.1, 0.36, bz + 0.1, bw - 0.2, 0.16, bd - 0.2, M.white);
        K.box(bx + 0.06, 0.46, bz + 0.85, bw - 0.12, 0.1, bd - 0.95, velvet);
        K.box(bx + 0.06, 0.5, bz + bd - 0.3, bw - 0.12, 0.06, 0.2, M.gold);
        for (const px of [bx + 0.3, bx + bw / 2 + 0.1]) K.box(px, 0.52, bz + 0.25, 0.8, 0.12, 0.4, M.white);
        K.box(bx, 0, bz, bw, 1.2, 0.14, M.darkWood); K.box(bx + 0.3, 0.9, bz + 0.1, bw - 0.6, 0.35, 0.05, velvet2);
        K.box(bx + bw / 2 - 0.15, 1.05, bz + 0.12, 0.3, 0.25, 0.04, M.gold);
        for (const [qx, qz] of [[bx, bz], [bx + bw - 0.14, bz], [bx, bz + bd - 0.14], [bx + bw - 0.14, bz + bd - 0.14]]) { K.box(qx, 0, qz, 0.14, 2.5, 0.14, M.darkWood); K.sphere(qx + 0.07, 2.62, qz + 0.07, 0.08, M.gold, { seg: 6, seg2: 4 }); }
        // 天蓋：枕の側だけ布を張り、足もとは金の枠（寝ている二人が上から見える）
        K.box(bx - 0.05, 2.5, bz - 0.05, bw + 0.1, 0.14, 0.95, velvet);
        K.box(bx - 0.05, 2.36, bz + 0.85, bw + 0.1, 0.16, 0.05, velvet);
        K.box(bx - 0.08, 2.46, bz - 0.08, bw + 0.16, 0.06, 0.08, M.gold); K.box(bx - 0.08, 2.46, bz + bd, bw + 0.16, 0.06, 0.08, M.gold);
        K.box(bx - 0.08, 2.46, bz - 0.08, 0.08, 0.06, bd + 0.16, M.gold); K.box(bx + bw, 2.46, bz - 0.08, 0.08, 0.06, bd + 0.16, M.gold);
        for (const s of [0, 1]) { const qx = s ? bx + bw - 0.1 : bx - 0.02; K.box(qx, 0.6, bz + 0.1, 0.12, 1.9, 0.55, velvet); K.box(qx - (s ? -0.02 : 0.02), 0.5, bz + bd - 0.35, 0.1, 2.0, 0.22, velvet2); }
        K.solid(bx, bz, bw, bd);
        const ms = K.slot('bed', bx + bw / 2, bz + bd / 2 + 0.1, { y: 0.56, lie: true, face: [0, 1], cap: 2 });
        Object.assign(ms, { double: true, spots: [[-0.5, 0], [0.5, 0]], occ: [], cls: 'master', pid: [R.king?.id, R.queen?.id].filter((x) => x != null) });
        // 枕元の小卓と燭台
        for (const x of [bx - 0.55, bx + bw + 0.05]) { K.box(x, 0, 0.3, 0.5, 0.55, 0.5, M.darkWood); K.box(x + 0.05, 0.55, 0.35, 0.4, 0.03, 0.4, M.gold); F.candle(K, x + 0.25, 0.55, 0.58, { noStand: true, arms: 1, li: 1.0, ld: 3 }); K.solid(x, 0.3, 0.5, 0.5); }
        // 衣装箪笥（西の壁）
        K.box(0.05, 0, 2.6, 0.7, 2.2, 1.8, M.darkWood); K.box(0.75, 0.1, 2.65, 0.03, 2.0, 0.85, M.wood); K.box(0.75, 0.1, 3.5, 0.03, 2.0, 0.85, M.wood);
        K.box(0.77, 1.0, 3.35, 0.04, 0.2, 0.05, M.gold); K.box(0.77, 1.0, 3.6, 0.04, 0.2, 0.05, M.gold); K.box(0.02, 2.2, 2.55, 0.8, 0.12, 1.9, M.gold);
        K.solid(0.05, 2.6, 0.7, 1.8);
        // 鏡台
        const vx = 7.2;
        K.box(vx, 0, 0.1, 1.3, 0.75, 0.55, M.darkWood); K.box(vx - 0.02, 0.75, 0.08, 1.34, 0.04, 0.59, M.gold);
        K.box(vx + 0.3, 0.79, 0.12, 0.7, 0.95, 0.06, M.gold); K.box(vx + 0.36, 0.85, 0.16, 0.58, 0.83, 0.04, M.steel, {});
        K.box(vx + 0.2, 0.79, 0.35, 0.14, 0.12, 0.14, M.pink); K.box(vx + 1.0, 0.79, 0.3, 0.1, 0.18, 0.1, M.purple);
        K.solid(vx, 0.1, 1.3, 0.55);
        F.chair(K, vx + 0.65, 1.05, [0, -1], { stool: true, cushion: velvet2 });
        // 長椅子と宝石箱、隅の燭台と鉢植え
        F.chest(K, 4.9, 3.05, { mat: M.darkWood });
        candleStand(0.5, 6.4); F.plant(K, 8.4, 6.4);
        F.wallPic(K, 'W', 5.2, 1.0, 0.9, 1.1, M.portrait);
        break;
      }
      case 'parlor': { // 王妃の居間
        F.rug(K, r.X(1.2, 5), r.z + 1.0, 5, 3.6, M.carpetBlue);
        // 長椅子（遠い壁ぞい）
        const sx = r.X(0.2, 0.7);
        K.box(sx, 0, r.z + 1.2, 0.7, 0.42, 2.6, velvet2); K.box(r.X(0.1, 0.25), 0, r.z + 1.2, 0.25, 0.95, 2.6, velvet2);
        K.box(sx, 0, r.z + 1.1, 0.7, 0.7, 0.14, M.gold); K.box(sx, 0, r.z + 3.8, 0.7, 0.7, 0.14, M.gold);
        K.solid(sx, r.z + 1.2, 0.7, 2.6);
        K.slot('royal', r.C(0.55), r.z + 1.9, { face: r.inward, y: 0.3 });
        K.slot('royal', r.C(0.55), r.z + 3.1, { face: r.inward, y: 0.3 });
        // 茶卓
        F.roundTable(K, r.C(2.2), r.z + 2.5, 0.55, { top: M.darkWood });
        K.cyl(r.C(2.2), 0.72, r.z + 2.4, 0.08, 0.14, M.white, { seg: 6 }); K.cyl(r.C(2.1), 0.72, r.z + 2.7, 0.07, 0.06, M.white, { seg: 6 }); K.cyl(r.C(2.4), 0.72, r.z + 2.3, 0.07, 0.06, M.white, { seg: 6 });
        // 王妃の椅子
        F.chair(K, r.C(3.4), r.z + 2.5, r.outward, { mat: M.gold, cushion: velvet });
        K.slot('queenseat', r.C(3.4), r.z + 2.5, { face: r.outward });
        // 竪琴と飾り棚
        const hx = r.C(4.8), hz = r.z + 0.9;
        K.box(hx - 0.25, 0, hz - 0.15, 0.5, 0.1, 0.3, M.gold); K.box(hx - 0.2, 0.1, hz - 0.04, 0.08, 1.3, 0.08, M.gold); K.box(hx - 0.2, 1.3, hz - 0.04, 0.5, 0.08, 0.08, M.gold);
        for (let i = 0; i < 5; i++) K.box(hx - 0.1 + i * 0.07, 0.2, hz - 0.01, 0.015, 1.05 - i * 0.12, 0.02, M.white);
        K.solid(hx - 0.3, hz - 0.3, 0.6, 0.6);
        F.shelf(K, r.X(5.6, 2), 0, 2, 'N', M.bottles, { h: 1.6 });
        F.plant(K, r.C(0.5), r.z + 0.5); F.plant(K, r.C(0.5), r.z + r.d - 0.5);
        F.wallPic(K, r.far, r.z + 2.5, 1.3, 1.0, 1.1, M.portrait);
        candleStand(r.C(3.4), r.z + r.d - 0.6);
        F.chandelier(K, r.C(2.8), r.z + 2.6, 2.8, { r: 0.6, li: 2.2, ld: 6 });
        break;
      }
      case 'royal': { // 王子・王女の部屋
        bedRows(r, r0.rows, 'royal', { canopy: true, shift: r0.idx * 2 });
        if (r.d >= 5) F.rug(K, r.X(0.6, r.w - 1.4), r.z + 2.15, r.w - 1.4, 0.7, M.carpetGreen);
        else { F.rug(K, r.X(0.6, r.w - 2), r.z + 2.2, r.w - 2, 1.5, M.carpetGreen); F.chest(K, r.X(0.2, 0.8), r.z + r.d - 0.7, { mat: M.brown }); }
        F.torch(K, r.far, r.z + 2.5, 1.5, { li: 1.4, ld: 5 });
        break;
      }
      case 'guest': { // 客間
        bedRows(r, [[{ t: 'double' }, { t: 'single' }, { t: 'single' }]], 'guest', { canopy: false, blanket: M.blue });
        F.table(K, r.X(4.5, 1.4), r.z + 3.1, 1.4, 0.8, { cloth: M.white });
        F.chair(K, r.C(4.2), r.z + 3.5, r.inward); F.chair(K, r.C(6.2), r.z + 3.5, r.outward);
        K.slot('seat', r.C(4.2), r.z + 3.5, { face: r.inward }); K.slot('seat', r.C(6.2), r.z + 3.5, { face: r.outward });
        F.chest(K, r.X(0.2, 0.8), r.z + 3.3, { mat: M.darkWood });
        candleStand(r.C(7.8), r.z + 0.5, { h: 1.1, arms: 1 });
        break;
      }
      case 'chapel': { // 礼拝堂
        const az = r.z + r.d / 2;
        K.box(r.X(0.15, 0.9), 0, az - 1.0, 0.9, 0.95, 2.0, M.white); K.box(r.X(0.1, 1.0), 0.95, az - 1.05, 1.0, 0.06, 2.1, velvet);
        K.box(r.X(0.4, 0.1), 1.0, az - 0.03, 0.1, 0.6, 0.06, M.gold); K.box(r.X(0.4, 0.1), 1.35, az - 0.2, 0.1, 0.08, 0.4, M.gold);
        K.solid(r.X(0.15, 0.9), az - 1.0, 0.9, 2.0);
        F.candle(K, r.C(0.55), az - 0.8, 1.0, { noStand: true, arms: 1, li: 1.4, ld: 4 }); F.candle(K, r.C(0.55), az + 0.8, 1.0, { noStand: true, arms: 1, light: false });
        F.wallPic(K, r.far, az, 0.9, 1.4, 1.8, M.stained);
        F.wallPic(K, r.far, az - 1.6, 1.0, 0.6, 1.4, M.stained); F.wallPic(K, r.far, az + 1.6, 1.0, 0.6, 1.4, M.stained);
        // 祈りの長椅子（遠い壁＝祭壇に向く）
        for (const u of [2.4, 4.0, 5.6]) {
          const x = r.X(u, 0.5);
          K.box(x, 0.36, r.z + 0.5, 0.5, 0.08, r.d - 1.6, M.darkWood); K.box(r.X(u + 0.45, 0.08), 0.36, r.z + 0.5, 0.08, 0.6, r.d - 1.6, M.darkWood);
          K.box(x, 0, r.z + 0.6, 0.5, 0.36, 0.08, M.darkWood); K.box(x, 0, r.z + r.d - 1.2, 0.5, 0.36, 0.08, M.darkWood);
          K.solid(x, r.z + 0.5, 0.5, r.d - 1.6);
          for (let z = r.z + 1.0; z < r.z + r.d - 1.2; z += 0.9) K.slot('pew', r.C(u + 0.25), z, { face: r.outward, y: 0.44 });
        }
        break;
      }
      case 'guard': { // 近衛騎士の詰所（寝台・武器掛け・牢への階段）
        bedRows(r, [Array.from({ length: R.nG }, () => ({ t: 'single' }))], 'guard', { blanket: velvet2, frame: M.wood });
        const zs = r.z + 3.05;
        // 牢への階段（遠い側の南の角。下へ降りる暗い穴）
        const sx = r.X(0.2, 1.6), sz = r.z + r.d - 2.3;
        K.box(sx - 0.1, 0, sz - 0.1, 1.8, 0.1, 2.2, M.darkStone);
        for (let i = 0; i < 5; i++) K.box(sx, 0.1 - 0.001 * i, sz + i * 0.4, 1.6, 0.012, 0.4, i < 1 ? M.stone : i < 3 ? M.darkStone : M.black);
        F.bars(K, r.X(1.8, 0) , sz - 0.05, r.X(1.8, 0), sz + 2.05, 0.9);
        F.bars(K, sx, sz - 0.05, sx + 1.6, sz - 0.05, 0.9);
        K.solid(sx - 0.1, sz - 0.1, 1.8, 2.2);
        F.torch(K, r.far, sz + 1, 1.6);
        // 武器掛けと鎧、机
        F.weaponRack(K, r.X(2.4, 3), r.z + r.d - 0.55, 3, 'N');
        F.table(K, r.X(2.8, 1.6), zs, 1.6, 0.7, { top: M.planks });
        F.stool(K, r.C(2.45), zs + 0.35); F.stool(K, r.C(4.75), zs + 0.35);
        K.box(r.C(3.5) - 0.1, 0.72, zs + 0.25, 0.2, 0.18, 0.2, M.clay);
        F.armor(K, r.C(r.w - 1.1), r.z + r.d - 0.6);
        candleStand(r.C(6.2), zs + 0.4, { h: 1.1, arms: 1 });
        break;
      }
      case 'office': { // 重臣の執務室（寝台は北の壁ぞい）
        const rows = packRows(Array.from({ length: R.nM }, () => ({ t: 'single' })), r.w - 0.4);
        bedRows(r, [rows[0]], 'minister', { blanket: M.blue, frame: M.darkWood });
        const n = clamp(R.nM, 2, 3);
        for (let i = 0; i < n; i++) {
          const u = 0.8 + i * 2.5;
          F.table(K, r.X(u, 1.5), r.z + 3.1, 1.5, 0.8, { cloth: velvet2, top: M.darkWood });
          K.box(r.X(u + 0.3, 0.5), 0.72, r.z + 3.3, 0.5, 0.04, 0.4, M.white); K.box(r.X(u + 1.0, 0.2), 0.72, r.z + 3.25, 0.1, 0.2, 0.1, M.black);
          F.chair(K, r.C(u + 0.75), r.z + 4.45, [0, -1], { cushion: velvet2 });
          K.slot('office', r.C(u + 0.75), r.z + 4.45, { face: [0, -1] });
        }
        K.slot('work', r.C(r.w - 1.2), r.z + 4.4, { face: [0, -1] });
        F.wallPic(K, r.far, r.z + 3.8, 1.1, 1.4, 1.0, M.mapTex);
        candleStand(r.C(r.w - 0.5), r.z + r.d - 0.5, { h: 1.1, arms: 1 });
        break;
      }
      case 'libtreasury': { // 書庫（戸口の側）と宝物庫（奥）
        const tw = 3; // 宝物庫の幅
        const wx = r.doorX > r.x ? r.x + tw : r.x + r.w - tw - 1; // 間の壁の列
        vWall(wx, r.z, r.z + r.d, [r.z + 2]);
        // 宝物庫
        const tx0 = r.doorX > r.x ? r.x : wx + 1;
        K.box(tx0, 0, r.z, tw, 0.012, r.d, M.darkStone);
        K.vault = { x: tx0, z: r.z, w: tw, d: r.d }; // 国庫の硬貨は mintgfx.js が額に合わせて置く（硬貨の袋・硬貨の箱・宝箱・硬貨の山）
        // 冠の台
        const kx = tx0 + 2.2, kz = r.z + r.d - 1.0;
        K.box(kx - 0.3, 0, kz - 0.3, 0.6, 0.8, 0.6, M.white); K.box(kx - 0.32, 0.8, kz - 0.32, 0.64, 0.05, 0.64, velvet);
        K.cyl(kx, 0.85, kz, 0.18, 0.14, M.gold, { seg: 8, openEnded: true }); K.box(kx - 0.04, 0.95, kz - 0.2, 0.08, 0.08, 0.05, M.redCrystal);
        K.solid(kx - 0.3, kz - 0.3, 0.6, 0.6);
        K.slot('count', tx0 + 1.5, r.z + 1.6, { face: [0, -1] });
        K.light(tx0 + 1.5, 1.8, r.z + 2.5, '#ffd070', 1.4, 4, 0.3);
        // 書庫
        const lx0 = r.doorX > r.x ? wx + 1 : r.x, lw = r.w - tw - 1;
        F.shelf(K, lx0 + 0.2, r.z, lw - 0.4, 'N', M.books, { h: 2.0 });
        F.table(K, lx0 + 1.2, r.z + 3.05, lw - 2.4, 0.7, { top: M.darkWood });
        K.box(lx0 + 1.5, 0.72, r.z + 3.2, 0.5, 0.06, 0.4, M.white); K.box(lx0 + 2.4, 0.72, r.z + 3.2, 0.3, 0.2, 0.4, M.red);
        for (let i = 0; i < 2; i++) { const x = lx0 + 1.6 + i * 1.4; F.chair(K, x, r.z + 4.2, [0, -1]); K.slot('read', x, r.z + 4.2, { face: [0, -1] }); }
        // 地球儀
        const gx = lx0 + lw - 0.7, gz = r.z + r.d - 0.7;
        K.cyl(gx, 0, gz, 0.06, 0.6, M.brass, { seg: 5 }); K.sphere(gx, 0.85, gz, 0.26, M.blue, { seg: 8, seg2: 6 }); K.torus(gx, 0.85, gz, 0.3, 0.02, M.brass, { seg: 12 });
        K.solid(gx - 0.3, gz - 0.3, 0.6, 0.6);
        F.candle(K, lx0 + lw / 2, r.z + 3.4, 0.72, { noStand: true, arms: 3, li: 1.4, ld: 4 });
        break;
      }
      case 'kitchen': { // 厨房
        // かまど（遠い壁）
        const ox = r.X(0, 1.1), oz = r.z + 0.6;
        K.box(ox, 0, oz, 1.1, 1.0, 2.6, M.stone); K.box(r.X(0, 0.6), 1.0, oz + 0.4, 0.6, 2.6, 1.8, M.stone);
        K.box(r.X(0.7, 0.42), 0.12, oz + 0.5, 0.42, 0.55, 1.6, M.soot); K.box(r.X(0.75, 0.3), 0.15, oz + 0.7, 0.3, 0.3, 1.2, M.fire);
        K.cyl(r.C(0.6), 1.0, oz + 0.8, 0.3, 0.35, M.iron, { seg: 8 }); K.cyl(r.C(0.6), 1.0, oz + 1.9, 0.24, 0.3, M.iron, { seg: 8 });
        K.solid(ox, oz, 1.1, 2.6);
        K.light(r.C(1.4), 0.9, oz + 1.3, '#ff9a40', 3.2, 7, 1.4);
        K.slot('kitchen', r.C(1.6), oz + 1.3, { face: r.outward });
        // 調理台と食材
        F.table(K, r.X(2.6, 2.6), r.z + 1.6, 2.6, 1.0, { top: M.planks });
        K.box(r.X(2.8, 0.5), 0.72, r.z + 1.8, 0.5, 0.14, 0.4, M.meat); K.box(r.X(3.5, 0.4), 0.72, r.z + 1.8, 0.4, 0.14, 0.4, M.bread);
        K.sphere(r.C(4.4), 0.82, r.z + 2.1, 0.13, M.cabbage, { seg: 6, seg2: 4 }); K.cyl(r.C(4.8), 0.72, r.z + 1.9, 0.12, 0.08, M.fish, { seg: 6 });
        K.slot('kitchen', r.C(3.9), r.z + 3.0, { face: [0, -1] }); K.slot('kitchen', r.C(3.0), r.z + 3.0, { face: [0, -1] });
        // 棚・たる・袋
        F.openShelf(K, r.X(5.6, 2.6), r.z, 2.6, 'N', [M.bread, M.apple, M.cabbage, M.orange, M.clay]);
        F.barrel(K, r.C(r.w - 1.3), r.z + r.d - 0.6); F.barrel(K, r.C(r.w - 2.1), r.z + r.d - 0.6, { h: 0.6 });
        F.sack(K, r.C(1.8), r.z + r.d - 0.5); F.sack(K, r.C(2.4), r.z + r.d - 0.45);
        // 吊るした肉
        for (let i = 0; i < 3; i++) { K.box(r.C(3.0 + i * 0.6) - 0.02, 1.9, r.z + 1.9, 0.04, 0.5, 0.04, M.brown); K.box(r.C(3.0 + i * 0.6) - 0.1, 1.55, r.z + 1.82, 0.2, 0.35, 0.16, i % 2 ? M.meat : M.bread); }
        break;
      }
      case 'servants': { // 使用人部屋（二段寝台）
        const nb = Math.ceil(R.nS / 2);
        bedRows(r, [Array.from({ length: nb }, () => ({ t: 'single' }))], 'servant', { bunk: true, frame: M.wood, blanket: M.beige, blanket2: M.brown });
        F.chest(K, r.X(0.2, 0.8), r.z + r.d - 0.8, { mat: M.brown, w: 0.8, d: 0.55 });
        if (r.d >= 5) {
          F.table(K, r.X(2.4, 1.4), r.z + r.d - 1.6, 1.4, 0.8, { top: M.planks });
          F.stool(K, r.C(2.2), r.z + r.d - 1.2); F.stool(K, r.C(4.0), r.z + r.d - 1.2);
          K.slot('seat', r.C(2.2), r.z + r.d - 1.2, { face: r.inward });
        }
        candleStand(r.C(r.w - 0.5), r.z + r.d - 0.5, { h: 1.0, arms: 1, li: 1.0 });
        break;
      }
    }
  }
  K.roomCount = 2 + P.west.length + P.east.length + 1; // 玉座の間・大広間・宝物庫を含む
  return true;
}
