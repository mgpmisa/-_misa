// A* 経路探索（道を好み、森や砂漠は歩きにくい）
import { W, H, walkable, MOVE_COST, MinHeap } from './world.js';

let BUF = null;

export function findPath(world, sx, sz, tx, tz, maxIter = 20000, avoid = null) {
  const tiles = world.tiles;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && walkable(tiles[z * W + x]);
  if (sx === tx && sz === tz) return [];
  if (!ok(tx, tz)) return null;
  const N = W * H;
  if (!BUF || BUF.n !== N) BUF = { n: N, g: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
  const gen = ++BUF.gen;
  const { g, came, stamp, closed } = BUF;
  // 遠い目的地ほど「目的地へ向かう」ことを強めに優先する（最短でなくても自然な道のりで、探索が大幅に減る）
  const dist = Math.abs(tx - sx) + Math.abs(tz - sz);
  const hw = dist > 60 ? 1.6 : dist > 25 ? 1.3 : 1.05;
  const G = (i) => (stamp[i] === gen ? g[i] : Infinity);
  const heap = new MinHeap();
  const s = sz * W + sx, t = tz * W + tx;
  stamp[s] = gen; g[s] = 0; came[s] = -1; heap.push(0, s);
  let iter = 0;
  while (heap.size && iter++ < maxIter) {
    const i = heap.pop();
    if (closed[i] === gen) continue;
    closed[i] = gen;
    if (i === t) break;
    const x = i % W, z = (i / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), nz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!ok(nx, nz)) continue;
      const j = nz * W + nx;
      const ng = g[i] + (MOVE_COST[tiles[j]] || 2) + (avoid ? Math.min(6, avoid[((nz >> 3) * (W >> 3)) + (nx >> 3)] || 0) * 1.5 : 0);
      if (ng < G(j)) { stamp[j] = gen; g[j] = ng; came[j] = i; heap.push(ng + (Math.abs(nx - tx) + Math.abs(nz - tz)) * hw, j); }
    }
  }
  if (stamp[t] !== gen) return null;
  const path = [];
  for (let c = t; c !== s; c = came[c]) path.push({ x: c % W, z: (c / W) | 0 });
  return path.reverse();
}
