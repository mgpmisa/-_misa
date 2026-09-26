// A* 経路探索（道を好んで歩く）
import { W, H, T, walkable } from './world.js';

export function findPath(world, sx, sz, tx, tz, maxIter = 6000) {
  const tiles = world.tiles;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < H && walkable(tiles[z * W + x]);
  if (sx === tx && sz === tz) return [];
  if (!ok(tx, tz)) return null;
  const N = W * H;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = [];
  const push = (f, i) => {
    heap.push([f, i]);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let c = 0;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
      }
    }
    return top;
  };
  const s = sz * W + sx, t = tz * W + tx;
  g[s] = 0; push(0, s);
  let iter = 0;
  while (heap.length && iter++ < maxIter) {
    const [, i] = pop();
    if (i === t) break;
    if (closed[i]) continue;
    closed[i] = 1;
    const x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!ok(nx, nz)) continue;
      const j = nz * W + nx;
      const tt = tiles[j];
      const cost = tt === T.ROAD || tt === T.PLAZA ? 1 : tt === T.FIELD ? 1.8 : 1.4;
      const ng = g[i] + cost;
      if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + Math.abs(nx - tx) + Math.abs(nz - tz), j); }
    }
  }
  if (came[t] === -1) return null;
  const path = [];
  for (let c = t; c !== s; c = came[c]) path.push({ x: c % W, z: (c / W) | 0 });
  return path.reverse();
}
