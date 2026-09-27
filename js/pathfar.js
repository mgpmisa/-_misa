// 遠くまでの道探し（二段構え）
//   1段目：大陸を 16×16 マスの「区画」に分け、区画の境目の出入口（道が境目をまたぐ所は必ず出入口にする）を
//          結んだ粗い網の上で、おおまかな道のりを A* で探す。道は歩きやすいので、網の上でも自然に道を選ぶ。
//   2段目：網の出入口どうしのあいだを、いつもの短い A*（path.js の findPath）でつなぐ。
// 区画ごとの中身は、はじめて通るときに作る（遅延）。地形が変わったら markTilesChanged で、その区画だけ作り直す。
// 返す形は path.js の findPath と同じ（{x,z} の配列。出発点は含まず、目的地を含む。たどり着けなければ null）。
import { W, H, T, walkable, MOVE_COST, MinHeap } from './world.js';
import { findPath } from './path.js';

export const CL = 16;                 // 区画の大きさ（マス）
const CW = Math.ceil(W / CL), CH = Math.ceil(H / CL);
const NEAR = 40;                      // これより近い（マンハッタン距離）ならふつうの A* だけで探す
const ROADLIKE = (t) => t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK;
const cost = (t) => MOVE_COST[t] || 2;   // path.js と同じ歩きにくさ

const GRAPHS = new WeakMap();
function graphOf(world) {
  let g = GRAPHS.get(world);
  if (!g) GRAPHS.set(world, g = { borders: new Map(), intra: new Map(), comp: null, stats: { borders: 0, intra: 0 } });
  return g;
}

// ---------- 区画と境目 ----------
const clOf = (x, z) => ((z / CL) | 0) * CW + ((x / CL) | 0);
// 境目の鍵：東の境目は 'e'+区画、南の境目は 's'+区画
function borderPairs(world, g, key) {
  let b = g.borders.get(key);
  if (b) return b;
  const tiles = world.tiles;
  const east = key.charCodeAt(0) === 101; // 'e'
  const c = +key.slice(1), cx = c % CW, cz = (c / CW) | 0;
  const pairs = [];
  // a は西（または北）の区画のマス、b は東（または南）の区画のマス
  const at = (i) => (east
    ? [(cz * CL + i) * W + (cx + 1) * CL - 1, (cz * CL + i) * W + (cx + 1) * CL]
    : [((cz + 1) * CL - 1) * W + cx * CL + i, ((cz + 1) * CL) * W + cx * CL + i]);
  const len = east ? Math.min(CL, H - cz * CL) : Math.min(CL, W - cx * CL);
  const valid = east ? (cx + 1) * CL < W : (cz + 1) * CL < H;
  if (valid) {
    const open = [], road = [];
    for (let i = 0; i < len; i++) { const [a, bb] = at(i); open[i] = walkable(tiles[a]) && walkable(tiles[bb]); road[i] = open[i] && (ROADLIKE(tiles[a]) || ROADLIKE(tiles[bb])); }
    const pick = new Set();
    for (let i = 0; i < len;) {
      if (!open[i]) { i++; continue; }
      let j = i; while (j + 1 < len && open[j + 1]) j++;
      const n = j - i + 1;
      if (n < 6) pick.add((i + j) >> 1); else { pick.add(i + 1); pick.add(j - 1); if (n > 12) pick.add((i + j) >> 1); }
      // 道が境目をまたぐ所は必ず出入口にする（道の網）
      for (let k = i; k <= j;) { if (!road[k]) { k++; continue; } let m = k; while (m + 1 <= j && road[m + 1]) m++; pick.add((k + m) >> 1); k = m + 1; }
      i = j + 1;
    }
    for (const i of pick) pairs.push(at(i));
  }
  b = { pairs, a2b: new Map(pairs.map(([a, bb]) => [a, bb])), b2a: new Map(pairs.map(([a, bb]) => [bb, a])) };
  g.borders.set(key, b); g.stats.borders++;
  return b;
}

// 区画の出入口（その区画の側のマス）
function clusterNodes(world, g, c) {
  const cx = c % CW, cz = (c / CW) | 0, out = [];
  if (cx + 1 < CW) for (const [a] of borderPairs(world, g, 'e' + c).pairs) out.push(a);
  if (cx > 0) for (const [, b] of borderPairs(world, g, 'e' + (c - 1)).pairs) out.push(b);
  if (cz + 1 < CH) for (const [a] of borderPairs(world, g, 's' + c).pairs) out.push(a);
  if (cz > 0) for (const [, b] of borderPairs(world, g, 's' + (c - CW)).pairs) out.push(b);
  return [...new Set(out)];
}

// 区画の中だけで、あるマスから（または、あるマスへ）の歩きにくさの合計を求める
const LOC = new Float64Array(CL * CL), LSTAMP = new Uint32Array(CL * CL), LDONE = new Uint32Array(CL * CL);
let lgen = 0;
function clusterDijkstra(world, c, src, targets, reverse = false) {
  const tiles = world.tiles, cx = c % CW, cz = (c / CW) | 0;
  const x0 = cx * CL, z0 = cz * CL, x1 = Math.min(W, x0 + CL), z1 = Math.min(H, z0 + CL);
  const gen = ++lgen;
  const li = (i) => (((i / W) | 0) - z0) * CL + (i % W - x0);
  const want = new Map(); for (const t of targets) want.set(t, Infinity);
  let left = want.size;
  const heap = new MinHeap();
  const s = li(src); LSTAMP[s] = gen; LOC[s] = 0; heap.push(0, src);
  while (heap.size && left > 0) {
    const i = heap.pop(), l = li(i);
    if (LDONE[l] === gen) continue; LDONE[l] = gen;
    const d = LOC[l];
    if (want.has(i) && want.get(i) === Infinity) { want.set(i, d); left--; }
    const x = i % W, z = (i / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < x0 || nz < z0 || nx >= x1 || nz >= z1) continue;
      const j = nz * W + nx;
      if (!walkable(tiles[j])) continue;
      const nd = d + (reverse ? cost(tiles[i]) : cost(tiles[j]));
      const lj = li(j);
      if (LSTAMP[lj] !== gen || nd < LOC[lj]) { LSTAMP[lj] = gen; LOC[lj] = nd; heap.push(nd, j); }
    }
  }
  return want;
}

// 区画の中の出入口どうしの近道（はじめて使うときに作る）
function intraEdges(world, g, c) {
  let m = g.intra.get(c);
  if (m) return m;
  m = new Map();
  const nodes = clusterNodes(world, g, c);
  for (const a of nodes) {
    const d = clusterDijkstra(world, c, a, nodes);
    const list = [];
    for (const [b, v] of d) if (b !== a && v < Infinity) list.push(b, v);
    m.set(a, list);
  }
  g.intra.set(c, m); g.stats.intra++;
  return m;
}

// 境目をまたぐ隣（出入口の相手）
function interEdges(world, g, i, out) {
  const x = i % W, z = (i / W) | 0, c = clOf(x, z), tiles = world.tiles;
  if (x % CL === CL - 1 && x + 1 < W) { const bb = borderPairs(world, g, 'e' + c).a2b.get(i); if (bb != null) out.push(bb, cost(tiles[bb])); }
  if (x % CL === 0 && x > 0) { const a = borderPairs(world, g, 'e' + (c - 1)).b2a.get(i); if (a != null) out.push(a, cost(tiles[a])); }
  if (z % CL === CL - 1 && z + 1 < H) { const bb = borderPairs(world, g, 's' + c).a2b.get(i); if (bb != null) out.push(bb, cost(tiles[bb])); }
  if (z % CL === 0 && z > 0) { const a = borderPairs(world, g, 's' + (c - CW)).b2a.get(i); if (a != null) out.push(a, cost(tiles[a])); }
}

// ---------- 陸続きかどうか（島・閉じた谷へは探さない） ----------
function components(world, g) {
  if (g.comp) return g.comp;
  const tiles = world.tiles, N = W * H, comp = new Int32Array(N).fill(-1), st = new Int32Array(N);
  let id = 0;
  for (let s = 0; s < N; s++) {
    if (comp[s] >= 0 || !walkable(tiles[s])) continue;
    let top = 0; st[top++] = s; comp[s] = id;
    while (top) {
      const i = st[--top], x = i % W;
      if (x + 1 < W && comp[i + 1] < 0 && walkable(tiles[i + 1])) { comp[i + 1] = id; st[top++] = i + 1; }
      if (x > 0 && comp[i - 1] < 0 && walkable(tiles[i - 1])) { comp[i - 1] = id; st[top++] = i - 1; }
      if (i + W < N && comp[i + W] < 0 && walkable(tiles[i + W])) { comp[i + W] = id; st[top++] = i + W; }
      if (i - W >= 0 && comp[i - W] < 0 && walkable(tiles[i - W])) { comp[i - W] = id; st[top++] = i - W; }
    }
    id++;
  }
  return (g.comp = comp);
}
export function sameLand(world, sx, sz, tx, tz) {
  const comp = components(world, graphOf(world));
  const a = comp[sz * W + sx], b = comp[tz * W + tx];
  return a >= 0 && a === b;
}

// ---------- 地形が変わったとき ----------
// 道普請・開拓・野火などでマスが変わったら呼ぶ（その区画と隣の境目だけ作り直す）
export function markTilesChanged(world, list) {
  const g = GRAPHS.get(world);
  if (!g) return;
  const tiles = world.tiles;
  for (const i of list) {
    const x = i % W, z = (i / W) | 0, c = clOf(x, z);
    g.intra.delete(c);
    const near = [[c, 'e' + c, c + 1, x % CL === CL - 1], [c - 1, 'e' + (c - 1), c - 1, x % CL === 0], [c, 's' + c, c + CW, z % CL === CL - 1], [c - CW, 's' + (c - CW), c - CW, z % CL === 0]];
    for (const [, key, nb, onEdge] of near) { if (!onEdge) continue; g.borders.delete(key); g.intra.delete(nb); }
    // 通れる・通れないが変わったら陸続きの情報も作り直す
    // （橋が架かって別々の陸がつながった場合も、川→橋で「通れない→通れる」に変わるのでここで分かる）
    if (g.comp && ((g.comp[i] >= 0) !== walkable(tiles[i]))) g.comp = null;
  }
}
export function resetPathFar(world) { GRAPHS.delete(world); }
// 前もって全部作っておく（読み込み直後など、ひまなときに。作らなくても使うときに少しずつ作る）
export function prepPathFar(world) {
  const g = graphOf(world);
  components(world, g);
  for (let c = 0; c < CW * CH; c++) intraEdges(world, g, c);
  return pathFarStats(world);
}
export function pathFarStats(world) { const g = GRAPHS.get(world); return g ? { ...g.stats, borders: g.borders.size, clusters: g.intra.size } : null; }

// ---------- 遠くまでの道探し ----------
// opts: { avoid（危険地図。短い A* に渡す）, near（これより近ければふつうの A*）, maxIter（近いときの上限）, maxNodes, blockCl（避ける区画の集まり、または (CL, CW) => 集まり）}
export function findPathFar(world, sx, sz, tx, tz, opts = {}) {
  const tiles = world.tiles;
  if (sx === tx && sz === tz) return [];
  if (tx < 0 || tz < 0 || tx >= W || tz >= H || !walkable(tiles[tz * W + tx])) return null;
  const near = opts.near ?? NEAR;
  const dist = Math.abs(tx - sx) + Math.abs(tz - sz);
  if (dist <= near) return findPath(world, sx, sz, tx, tz, opts.maxIter || 26000, opts.avoid || null);
  if (sx < 0 || sz < 0 || sx >= W || sz >= H) return null;
  // 出発点が歩けないマス（建物の扉の上など）でも findPath と同じく出発できるようにする
  const g = graphOf(world);
  if (walkable(tiles[sz * W + sx]) && !sameLand(world, sx, sz, tx, tz)) return null;
  const s = sz * W + sx, t = tz * W + tx;
  const cs = clOf(sx, sz), ct = clOf(tx, tz);
  // 同じ区画、または隣の区画なら、ふつうの A* で足りる
  if (Math.abs((cs % CW) - (ct % CW)) <= 1 && Math.abs(((cs / CW) | 0) - ((ct / CW) | 0)) <= 1) {
    const p = findPath(world, sx, sz, tx, tz, opts.maxIter || 26000, opts.avoid || null);
    if (p) return p;
  }
  // 出発点と目的地を、それぞれの区画の出入口につなぐ
  const startLinks = clusterDijkstra(world, cs, s, clusterNodes(world, g, cs), false);
  const goalLinks = clusterDijkstra(world, ct, t, clusterNodes(world, g, ct), true);
  const goalIn = new Map(); for (const [n, v] of goalLinks) if (v < Infinity) goalIn.set(n, v);
  if (!goalIn.size) return null;
  // 粗い網の上の A*
  const gs = new Map(), came = new Map(), closed = new Set();
  const heap = new MinHeap();
  const h = (i) => (Math.abs((i % W) - tx) + Math.abs(((i / W) | 0) - tz)) * 1.15;
  const GOAL = -2;
  for (const [n, v] of startLinks) if (v < Infinity) { gs.set(n, v); came.set(n, -1); heap.push(v + h(n), n); }
  let best = Infinity, bestLast = -1, iter = 0;
  const maxNodes = opts.maxNodes || 60000;
  // 竜の縄張りのように避けたい区画（deadly.js）。出発と目的の区画は除く。入るたびに重く数える
  let block = typeof opts.blockCl === 'function' ? opts.blockCl(CL, CW) : opts.blockCl || null;
  if (block && (block.has(cs) || block.has(ct))) { block = new Set(block); block.delete(cs); block.delete(ct); }
  if (block && !block.size) block = null;
  const nb = [];
  while (heap.size && iter++ < maxNodes) {
    const i = heap.pop();
    if (closed.has(i)) continue;
    closed.add(i);
    const gi = gs.get(i);
    if (gi + h(i) >= best) break;
    const gl = goalIn.get(i);
    if (gl != null && gi + gl < best) { best = gi + gl; bestLast = i; }
    nb.length = 0;
    const m = intraEdges(world, g, clOf(i % W, (i / W) | 0)).get(i);
    if (m) for (let k = 0; k < m.length; k++) nb.push(m[k]);
    interEdges(world, g, i, nb);
    for (let k = 0; k < nb.length; k += 2) {
      const j = nb[k], ng = gi + nb[k + 1] + (block && block.has(clOf(j % W, (j / W) | 0)) ? 300 : 0);
      if (closed.has(j)) continue;
      const old = gs.get(j);
      if (old == null || ng < old) { gs.set(j, ng); came.set(j, i); heap.push(ng + h(j), j); }
    }
  }
  if (bestLast < 0) return null;
  // 粗い道のりを出入口の並びに戻す
  const way = [];
  for (let c = bestLast; c !== -1; c = came.get(c)) way.push(c);
  way.reverse();
  way.push(t);
  // 出入口どうしのあいだを短い A* でつなぐ
  const out = [];
  let cx = sx, cz = sz;
  for (const n of way) {
    const nx = n % W, nz = (n / W) | 0;
    if (nx === cx && nz === cz) continue;
    if (Math.abs(nx - cx) + Math.abs(nz - cz) === 1) { out.push({ x: nx, z: nz }); cx = nx; cz = nz; continue; }
    const seg = findPath(world, cx, cz, nx, nz, 6000, opts.avoid || null);
    if (!seg) { markTilesChanged(world, [cz * W + cx, n]); return null; }   // 地形が変わっていた：作り直して、次の機会に探し直す
    for (const p of seg) out.push(p);
    cx = nx; cz = nz;
  }
  return out;
}
