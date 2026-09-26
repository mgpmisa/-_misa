// 広大な世界の生成：大陸・海・川・山・気候帯・国・町・城・特別な場所
import { makeNoise } from './noise.js';
import { KINGDOMS, DEMON_REALM } from './data.js';

export const W = 160, H = 160;
export const T = {
  DEEP: 0, SEA: 1, BEACH: 2, GRASS: 3, FOREST: 4, DENSE: 5, JUNGLE: 6, DESERT: 7, SNOW: 8, ROCK: 9, PEAK: 10,
  RIVER: 11, ROAD: 12, FIELD: 13, PLAZA: 14, BLD: 15, WASTE: 16, BRIDGE: 17, FENCE: 18, SAVANNA: 19, DOCK: 20,
  LAVA: 21, PASTURE: 22, WALL: 23, SWAMP: 24,
};
export const TILE_NAME = {
  0: '深い海', 1: '海', 2: '砂浜', 3: '草原', 4: '森', 5: '森林', 6: 'ジャングル', 7: '砂漠', 8: '雪原', 9: '岩山', 10: '高峰',
  11: '川', 12: '道', 13: '畑', 14: '石畳', 15: '建物', 16: '魔界の荒野', 17: '橋', 18: '柵', 19: 'サバンナ', 20: '桟橋',
  21: '溶岩', 22: '牧草地', 23: '城壁', 24: '沼地',
};
const BLOCK = new Set([T.DEEP, T.SEA, T.RIVER, T.PEAK, T.BLD, T.FENCE, T.LAVA, T.WALL]);
export const walkable = (t) => !BLOCK.has(t);
export const isWater = (t) => t === T.DEEP || t === T.SEA || t === T.RIVER;
export const MOVE_COST = {
  [T.ROAD]: 1, [T.BRIDGE]: 1, [T.PLAZA]: 1, [T.DOCK]: 1, [T.GRASS]: 1.6, [T.SAVANNA]: 1.6, [T.BEACH]: 1.7, [T.FIELD]: 1.8,
  [T.PASTURE]: 1.6, [T.FOREST]: 2.4, [T.DENSE]: 3.2, [T.JUNGLE]: 3.4, [T.DESERT]: 2.4, [T.SNOW]: 2.8, [T.ROCK]: 4, [T.WASTE]: 2.2, [T.SWAMP]: 3.5,
};

export class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let c = k.length; k.push(key); v.push(val);
    while (c > 0) { const p = (c - 1) >> 1; if (k[p] <= key) break; k[c] = k[p]; v[c] = v[p]; c = p; }
    k[c] = key; v[c] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let c = 0; const n = k.length;
      for (;;) {
        const l = c * 2 + 1, r = l + 1; let m = c, mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; }
        if (m === c) break;
        k[c] = k[m]; v[c] = v[m]; c = m;
      }
      k[c] = lk; v[c] = lv;
    }
    return top;
  }
}

export function generateWorld(rng, seed) {
  const N = W * H;
  const tiles = new Uint8Array(N), hgt = new Uint8Array(N), elev = new Float32Array(N), temp = new Float32Array(N), moist = new Float32Array(N);
  const kingdomOf = new Int8Array(N).fill(-1);
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const get = (x, z) => (inb(x, z) ? tiles[idx(x, z)] : T.DEEP);
  const set = (x, z, t) => { if (inb(x, z)) tiles[idx(x, z)] = t; };
  const nE = makeNoise(seed), nT = makeNoise(seed + 11), nM = makeNoise(seed + 23);

  // --- 標高・気温・湿度 ---
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const nx = x / W - 0.5, nz = z / H - 0.5;
    const d = Math.sqrt(nx * nx + nz * nz) * 2;
    let e = nE(x / 38, z / 38, 5);
    e = e * 1.2 - Math.pow(d, 3.2) * 0.5 + 0.07;
    const ridge = 1 - Math.abs(nE(x / 22 + 40, z / 22 + 40, 3) - 0.5) * 2;
    e += Math.pow(ridge, 8) * 0.16 * (d < 0.85 ? 1 : 0);
    elev[idx(x, z)] = e;
    temp[idx(x, z)] = z / H * 0.9 + (nT(x / 30, z / 30, 3) - 0.5) * 0.35 - Math.max(0, e - 0.6) * 0.8;
    moist[idx(x, z)] = nM(x / 26, z / 26, 4);
  }
  const SEA_LEVEL = 0.42;
  for (let i = 0; i < N; i++) {
    const e = elev[i], t = temp[i], m = moist[i];
    let ty;
    if (e < SEA_LEVEL - 0.08) ty = T.DEEP;
    else if (e < SEA_LEVEL) ty = T.SEA;
    else if (e < SEA_LEVEL + 0.022) ty = t < 0.22 ? T.SNOW : T.BEACH;
    else if (e > 0.9) ty = T.PEAK;
    else if (e > 0.79) ty = T.ROCK;
    else if (t < 0.2) ty = m > 0.55 ? T.DENSE : T.SNOW;
    else if (t < 0.33) ty = m > 0.58 ? T.DENSE : m > 0.44 ? T.FOREST : T.GRASS;
    else if (t < 0.66) ty = m > 0.64 ? T.DENSE : m > 0.5 ? T.FOREST : m < 0.3 ? T.SAVANNA : T.GRASS;
    else ty = m > 0.6 ? T.JUNGLE : m > 0.55 ? T.SWAMP : m < 0.48 ? T.DESERT : T.SAVANNA;
    tiles[i] = ty;
    hgt[i] = e < SEA_LEVEL ? 0 : Math.min(9, Math.floor((e - SEA_LEVEL) / 0.055));
  }

  // --- 川：山から海へ ---
  const rivers = [];
  const sources = [];
  for (let i = 0; i < 400 && sources.length < 8; i++) {
    const x = rng.int(8, W - 9), z = rng.int(8, H - 9);
    const t = get(x, z);
    if ((t === T.ROCK || elev[idx(x, z)] > 0.68) && t !== T.PEAK && sources.every((s) => Math.abs(s.x - x) + Math.abs(s.z - z) > 26)) sources.push({ x, z });
  }
  for (const s of sources) {
    let x = s.x, z = s.z;
    const path = [];
    const seen = new Set();
    for (let step = 0; step < 260; step++) {
      path.push({ x, z }); seen.add(idx(x, z));
      const t = get(x, z);
      if (t === T.SEA || t === T.DEEP) break;
      let best = null, bestE = Infinity;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inb(nx, nz) || seen.has(idx(nx, nz))) continue;
        const e2 = elev[idx(nx, nz)] + rng.next() * 0.012;
        if (e2 < bestE) { bestE = e2; best = [nx, nz]; }
      }
      if (!best) break;
      [x, z] = best;
    }
    const last = path[path.length - 1];
    if (path.length > 12 && (get(last.x, last.z) === T.SEA || get(last.x, last.z) === T.DEEP)) {
      let prevH = 99;
      for (const p of path) {
        const i = idx(p.x, p.z);
        if (tiles[i] === T.SEA || tiles[i] === T.DEEP) break;
        tiles[i] = T.RIVER;
        hgt[i] = Math.min(prevH, Math.max(0, hgt[i] - 1));
        prevH = hgt[i];
      }
      rivers.push(path);
    }
  }

  const landScore = (x, z) => {
    const t = get(x, z);
    if (!walkable(t) || t === T.ROCK || t === T.SWAMP) return -1;
    let flat = 0, water = 0, river = 0;
    const h0 = hgt[idx(x, z)];
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const tt = get(x + dx, z + dz);
      if (isWater(tt) && tt !== T.RIVER) water++;
      if (tt === T.RIVER) river++;
      if (inb(x + dx, z + dz) && Math.abs(hgt[idx(x + dx, z + dz)] - h0) <= 1) flat++;
    }
    return flat - water * 3 + Math.min(river, 4) * 2;
  };

  // --- 魔界 ---
  let demon = null, bestD = -Infinity;
  for (let z = 10; z < H * 0.42; z++) for (let x = Math.floor(W * 0.55); x < W - 10; x++) {
    const t = get(x, z);
    if (!walkable(t) || t === T.ROCK) continue;
    const sc = (x - z) * 0.6 + landScore(x, z);
    if (sc > bestD) { bestD = sc; demon = { x, z }; }
  }
  if (!demon) demon = { x: Math.floor(W * 0.78), z: Math.floor(H * 0.22) };
  const demonR = 20;
  for (let z = demon.z - demonR - 4; z <= demon.z + demonR + 4; z++) for (let x = demon.x - demonR - 4; x <= demon.x + demonR + 4; x++) {
    if (!inb(x, z)) continue;
    const d = Math.hypot(x - demon.x, z - demon.z) + (nM(x / 6, z / 6, 2) - 0.5) * 8;
    if (d > demonR) continue;
    const t = get(x, z);
    if (t === T.SEA || t === T.DEEP) continue;
    if (t === T.RIVER) { if (rng.chance(0.7)) set(x, z, T.LAVA); continue; }
    if (t === T.PEAK || t === T.ROCK) continue;
    set(x, z, rng.chance(0.03) ? T.LAVA : T.WASTE);
  }

  // --- 陸続きの塊（川は橋を架ければ渡れるので同じ塊に数える。島の町を作らないため） ---
  const landComp = new Int32Array(N).fill(-1);
  let mainComp = -1;
  {
    const landOk = (t) => t !== T.DEEP && t !== T.SEA && t !== T.PEAK && t !== T.LAVA;
    let nc = 0, best = 0;
    for (let i0 = 0; i0 < N; i0++) {
      if (landComp[i0] >= 0 || !landOk(tiles[i0])) continue;
      const st = [i0]; landComp[i0] = nc; let n = 0;
      while (st.length) {
        const i = st.pop(); n++;
        const x = i % W, z = (i / W) | 0;
        if (x > 0 && landComp[i - 1] < 0 && landOk(tiles[i - 1])) { landComp[i - 1] = nc; st.push(i - 1); }
        if (x < W - 1 && landComp[i + 1] < 0 && landOk(tiles[i + 1])) { landComp[i + 1] = nc; st.push(i + 1); }
        if (z > 0 && landComp[i - W] < 0 && landOk(tiles[i - W])) { landComp[i - W] = nc; st.push(i - W); }
        if (z < H - 1 && landComp[i + W] < 0 && landOk(tiles[i + W])) { landComp[i + W] = nc; st.push(i + W); }
      }
      if (n > best) { best = n; mainComp = nc; }
      nc++;
    }
  }
  const onMain = (x, z) => inb(x, z) && landComp[idx(x, z)] === mainComp;

  // --- 国と町の場所 ---
  const settlements = [];
  const farFromAll = (x, z, r) => onMain(x, z) && settlements.every((s) => Math.hypot(s.x - x, s.z - z) >= s.r + r + 5) && Math.hypot(demon.x - x, demon.z - z) > demonR + r + 6;
  const targets = [{ x: W * 0.3, z: H * 0.34 }, { x: W * 0.7, z: H * 0.62 }, { x: W * 0.34, z: H * 0.76 }];
  KINGDOMS.forEach((k, ki) => {
    const tg = targets[ki];
    let best = null, bs = -Infinity;
    for (let z = Math.floor(tg.z - 22); z <= tg.z + 22; z++) for (let x = Math.floor(tg.x - 22); x <= tg.x + 22; x++) {
      if (x < 16 || z < 16 || x > W - 17 || z > H - 17) continue;
      const t = get(x, z);
      if (t === T.WASTE || t === T.LAVA) continue;
      const sc = landScore(x, z) - Math.hypot(x - tg.x, z - tg.z) * 0.6 + (k.south ? (t === T.DESERT || t === T.SAVANNA ? 6 : 0) : 0);
      if (sc > bs && farFromAll(x, z, 15)) { bs = sc; best = { x, z }; }
    }
    if (!best) best = { x: Math.floor(tg.x), z: Math.floor(tg.z) };
    settlements.push({ id: settlements.length, name: k.capital, type: 'capital', kingdom: ki, x: best.x, z: best.z, r: 15 });
  });
  KINGDOMS.forEach((k, ki) => {
    const cap = settlements[ki];
    for (const vname of k.villages) {
      let best = null, bs = -Infinity;
      for (let i = 0; i < 1400; i++) {
        const a = rng.next() * Math.PI * 2, d = rng.range(28, 44);
        const x = Math.round(cap.x + Math.cos(a) * d), z = Math.round(cap.z + Math.sin(a) * d);
        if (x < 10 || z < 10 || x > W - 11 || z > H - 11) continue;
        const sc = landScore(x, z);
        if (sc > bs && farFromAll(x, z, 9)) { bs = sc; best = { x, z }; }
      }
      if (best) settlements.push({ id: settlements.length, name: vname, type: 'village', kingdom: ki, x: best.x, z: best.z, r: 9 });
    }
    // 港町
    let best = null, bs = Infinity;
    for (let z = 6; z < H - 6; z++) for (let x = 6; x < W - 6; x++) {
      const t = get(x, z);
      if (!walkable(t) || t === T.ROCK || t === T.WASTE) continue;
      const coast = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => get(x + dx * 2, z + dz * 2) === T.SEA || get(x + dx * 2, z + dz * 2) === T.DEEP);
      if (!coast) continue;
      const d = Math.hypot(x - cap.x, z - cap.z);
      if (d < 26 || d > 60) continue;
      const sc = d - landScore(x, z) * 0.3;
      if (sc < bs && farFromAll(x, z, 10)) { bs = sc; best = { x, z }; }
    }
    if (best) settlements.push({ id: settlements.length, name: k.port, type: 'port', kingdom: ki, x: best.x, z: best.z, r: 10 });
  });

  // 国の領土（最も近い町の国）
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = get(x, z);
    if (t === T.DEEP || t === T.WASTE || t === T.LAVA) continue;
    let best = -1, bd = 1e9;
    for (const s of settlements) {
      const d = Math.hypot(s.x - x, s.z - z) * (s.type === 'capital' ? 0.8 : 1);
      if (d < bd) { bd = d; best = s.kingdom; }
    }
    if (bd < 55) kingdomOf[idx(x, z)] = best;
  }

  // 町の土地をならす
  for (const s of settlements) {
    const h0 = Math.max(1, hgt[idx(s.x, s.z)]);
    s.h = h0;
    for (let z = s.z - s.r - 1; z <= s.z + s.r + 1; z++) for (let x = s.x - s.r - 1; x <= s.x + s.r + 1; x++) {
      if (!inb(x, z)) continue;
      const i = idx(x, z), t = tiles[i];
      const edge = Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) > s.r;
      if (s.type === 'port' && (t === T.SEA || t === T.DEEP)) continue;
      if (edge) { if (walkable(t)) hgt[i] = Math.round((hgt[i] + h0) / 2); continue; }
      hgt[i] = h0;
      if (t !== T.RIVER) tiles[i] = s.kingdom === 2 && t === T.DESERT ? T.DESERT : T.GRASS;
      if (tiles[i] === T.DESERT) tiles[i] = T.SAVANNA;
    }
  }

  const buildings = [];
  const bldAt = new Int16Array(N).fill(-1);
  function addBuilding(type, name, x, z, w, d, door, extra = {}) {
    const bid = buildings.length;
    for (let zz = z; zz < z + d; zz++) for (let xx = x; xx < x + w; xx++) { set(xx, zz, T.BLD); bldAt[idx(xx, zz)] = bid; }
    const b = { id: bid, type, name, x, z, w, d, door, h: hgt[idx(door.x, door.z)], ...extra };
    buildings.push(b);
    return b;
  }
  const free = (x0, z0, x1, z1, ok = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH]) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!inb(x, z) || !ok.includes(get(x, z))) return false;
    return true;
  };

  // --- 道（町と町を結ぶ） ---
  // goal は1点か、「ここに着いたら終わり」を返す関数（既存の道網につなぐとき）
  function roadPath(a, b, goalFn = null, blockFn = null) {
    const cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    const start = idx(a.x, a.z);
    hp.push(0, start);
    cost[start] = 0;
    let goal = goalFn ? -1 : idx(b.x, b.z);
    const done = new Uint8Array(N);
    let it = 0;
    while (hp.size && it++ < 200000) {
      const i = hp.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (goalFn ? (i !== start && goalFn(i)) : i === goal) { goal = i; break; }
      const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inb(nx, nz)) continue;
        const j = idx(nx, nz), t = tiles[j];
        if (blockFn && blockFn(j)) continue;
        let c;
        if (t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK) c = 0.5;
        else if (t === T.RIVER) c = 9;
        else if (t === T.SEA || t === T.DEEP || t === T.PEAK || t === T.BLD || t === T.LAVA || t === T.WALL || t === T.FENCE || t === T.FIELD || t === T.PASTURE) continue;
        else c = (MOVE_COST[t] || 2) + Math.abs(hgt[j] - hgt[i]) * 2;
        const nc = cost[i] + c;
        if (nc < cost[j]) { cost[j] = nc; came[j] = i; hp.push(nc + (goalFn ? 0 : (Math.abs(nx - b.x) + Math.abs(nz - b.z)) * 0.5), j); }
      }
    }
    if (goal < 0 || came[goal] === -1) return [];
    const path = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) path.push(c);
    if (goalFn) path.push(start);
    return path;
  }
  // 道を敷く（川には橋。広場・桟橋・建物はそのまま）
  function layRoad(path) {
    for (const i of path) {
      const t = tiles[i];
      if (t === T.RIVER) tiles[i] = T.BRIDGE;
      else if (t !== T.BLD && t !== T.BRIDGE && t !== T.PLAZA && t !== T.DOCK && t !== T.WALL && t !== T.FENCE && t !== T.FIELD && t !== T.PASTURE && !isWater(t) && t !== T.PEAK && t !== T.LAVA) tiles[i] = T.ROAD;
    }
  }
  const roadLinks = [];
  const linked = new Set();
  const link = (a, b) => { const k = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`; if (linked.has(k)) return; linked.add(k); roadLinks.push([a, b]); };
  for (const s of settlements) if (s.type !== 'capital') link(settlements[s.kingdom], s);
  const capLinks = [[settlements[0], settlements[1]], [settlements[1], settlements[2]], [settlements[0], settlements[2]]];
  for (const [a, b] of capLinks) link(a, b);
  // 村や港は、いちばん近いほかの町とも結ぶ（隣村へ抜ける街道）
  for (const s of settlements) {
    if (s.type === 'capital') continue;
    const near = settlements.filter((q) => q !== s && q.kingdom === s.kingdom ? q.type !== 'capital' : q !== s).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (near && Math.hypot(near.x - s.x, near.z - s.z) < 48) link(s, near);
  }
  const capPaths = [];
  for (const [a, b] of roadLinks) {
    const path = roadPath(a, b);
    layRoad(path);
    if (a.type === 'capital' && b.type === 'capital') capPaths.push({ a, b, path: path.slice().reverse() });
  }

  // --- 町の中 ---
  const world0 = () => ({ tiles, hgt, bldAt, buildings });
  for (const s of settlements) layoutTown(s);
  function setRoad(x, z) {
    const t = get(x, z);
    if (t === T.RIVER) set(x, z, T.BRIDGE);
    else if (t === T.GRASS || t === T.SAVANNA || t === T.FOREST || t === T.DESERT || t === T.SNOW || t === T.BEACH || t === T.DENSE || t === T.JUNGLE) set(x, z, T.ROAD);
  }
  function layoutTown(s) {
    s.buildings = [];
    const R = s.r;
    const K = KINGDOMS[s.kingdom];
    // 城は北側に専用の区画をとる
    if (s.type === 'capital') {
      const cw = 9, cd = 7, x0 = s.x - 4, z0 = s.z - R + 2;
      for (let z = z0 - 1; z <= z0 + cd; z++) for (let x = x0 - 1; x <= x0 + cw; x++) if (get(x, z) !== T.RIVER) set(x, z, T.GRASS);
      const c = addBuilding('castle', `${K.name.replace('王国', '')}城`, x0, z0, cw, cd, { x: s.x, z: z0 + cd }, { face: 'S', settlement: s.id, kingdom: s.kingdom });
      s.buildings.push(c.id); s.castle = c.id;
    }
    // 碁盤の目の通り（6マスおき）
    const step = 6;
    for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) {
      if (get(x, z) === T.BLD) continue;
      if ((x - s.x) % step === 0 || (z - s.z) % step === 0) setRoad(x, z);
    }
    const pr = s.type === 'capital' ? 2 : 1;
    for (let z = s.z - pr; z <= s.z + pr; z++) for (let x = s.x - pr; x <= s.x + pr; x++) if (!isWater(get(x, z)) && get(x, z) !== T.BLD) set(x, z, T.PLAZA);
    s.plaza = { x: s.x, z: s.z, r: pr };
    const failed = [];
    const place = (type, name, w, d, opt = {}) => {
      const b = placeOnStreet(s, type, name, w, d, opt);
      if (b) { s.buildings.push(b.id); if (opt.yard) makeYard(b); }
      else if (opt.retry) failed.push([type, name, w, d, opt]);
      else if (s.type !== 'capital' && !opt.noWiden) {
        // 村や港で場所がなければ、町はずれまで広げて探す
        s.extraR = (s.extraR || 0) + 3;
        const b2 = placeOnStreet(s, type, name, w, d, opt);
        s.extraR -= 3;
        if (b2) { s.buildings.push(b2.id); return b2; }
      }
      return b;
    };
    if (s.type === 'capital') {
      place('church', '大聖堂', 4, 4);
      place('market', '市場', 5, 2, { extra: { open: true } });
      place('tavern', '宿屋「黄金の獅子」', 4, 4);
      place('guild', '冒険者ギルド', 4, 4);
      const bar = place('barracks', '兵舎', 5, 3, { retry: true });
      place('prison', '牢獄', 4, 4, { far: true, retry: true });
      place('magictower', s.kingdom === 1 ? '魔法の塔' : '学術院', 3, 3, { far: true, retry: true });
      place('mansion', '貴族の屋敷', 5, 4, { far: true, retry: true });
      place('mansion', '貴族の屋敷', 5, 4, { far: true, retry: true });
      if (bar) { const y = place('drillyard', '練兵場', 4, 3, { near: bar.door, extra: { open: true }, yard: true, retry: true }); if (y) s.drillyard = y.id; }
      place('school', '学校', 4, 3, { retry: true });
      place('bakery', 'パン屋', 3, 3, { retry: true });
      place('smithy', '鍛冶場', 3, 3, { retry: true });
      place('clinic', '診療所', 3, 3, { retry: true });
      place('workshop', '職人の工房', 3, 3, { retry: true });
      place('academy', s.kingdom === 2 ? '星詠みの魔法学園' : '王立魔法学園', 5, 4, { far: true, retry: true });
      place('dojo', '剣術道場', 4, 3, { retry: true });
      place('stable', '厩舎', 4, 2, { far: true, retry: true });
      s.walls = [];
      for (let i = -R - 1; i <= R + 1; i++) for (const [x, z] of [[s.x + i, s.z - R - 1], [s.x + i, s.z + R + 1], [s.x - R - 1, s.z + i], [s.x + R + 1, s.z + i]]) {
        const t = get(x, z);
        if (t === T.ROAD || t === T.BRIDGE || isWater(t) || t === T.BLD) continue;
        set(x, z, T.WALL); s.walls.push({ x, z });
      }
      // 街道がどうしても通らなくても、東西南北の真ん中には必ず門を開ける
      for (const [gx, gz, dx, dz] of [[s.x, s.z - R - 1, 0, -1], [s.x, s.z + R + 1, 0, 1], [s.x - R - 1, s.z, -1, 0], [s.x + R + 1, s.z, 1, 0]]) {
        if (get(gx, gz) !== T.WALL) continue;
        set(gx, gz, T.ROAD); s.walls = s.walls.filter((w) => w.x !== gx || w.z !== gz);
        for (let k = 1; k <= 2; k++) { const t = get(gx + dx * k, gz + dz * k); if (t === T.GRASS || t === T.SAVANNA || t === T.FOREST || t === T.DESERT || t === T.SNOW || t === T.BEACH || t === T.WALL || t === T.DENSE || t === T.JUNGLE || t === T.SWAMP || t === T.ROCK) set(gx + dx * k, gz + dz * k, T.ROAD); }
        for (let k = 1; k <= R; k++) { const t = get(gx - dx * k, gz - dz * k); if (t === T.ROAD || t === T.PLAZA || t === T.BLD) break; if (t === T.GRASS || t === T.SAVANNA || t === T.FOREST || t === T.DESERT || t === T.SNOW || t === T.BEACH) set(gx - dx * k, gz - dz * k, T.ROAD); }
      }
    } else if (s.type === 'village') {
      place('church', '礼拝堂', 3, 4);
      place('tavern', `${s.name.replace('村', '')}の宿`, 4, 3);
      place('smithy', '鍛冶場', 3, 3);
      place('well', '井戸', 1, 1, { extra: { open: true } });
      place('mill', '風車小屋', 2, 2, { far: true });
      place('watchtower', '見張り櫓', 1, 1, { far: true, extra: { open: true } });
    } else {
      place('market', '魚市場', 4, 2, { extra: { open: true } });
      place('tavern', '船乗りの酒場', 4, 3);
      place('church', '海の礼拝堂', 3, 3);
      place('workshop', '造船所', 4, 3);
      place('bakery', 'パン屋', 3, 3);
      place('watchtower', '見張り櫓', 1, 1, { far: true, extra: { open: true } });
    }
    // 町の出入口（門）：町の外周で、外へ道が続いているところ。王都では城壁の切れ目がすべて門になる
    s.gates = findGates(s);
    // 門の詰所（王都はすべての門、港町は一番大きな門）。門番と自警団の待機場所
    s.guardposts = [];
    for (const g of s.type === 'capital' ? s.gates.slice(0, 4) : s.type === 'port' ? s.gates.slice(0, 1) : []) {
      const b = placeNear(s, g, 'guardpost', '門の詰所', 2, 2, { inside: true }) || placeNear(s, g, 'guardpost', '門の詰所', 2, 2, { inside: false });
      if (b) { g.post = b.id; s.guardposts.push(b.id); }
    }
    // 城下町：王都の門の外、街道ぞいに宿場と門前市を開く。城壁の中に入りきらなかった店もここへ
    if (s.type === 'capital') {
      const main = s.gates.slice(0, 4);
      const outside = [...failed, ['tavern', '門前の宿場', 3, 3, {}], ['market', '門前市', 4, 2, { extra: { open: true } }], ['stable', '駅馬車の厩', 3, 2, {}]];
      let gi = 0;
      for (const [type, name, w, d, opt] of outside) {
        let b = null;
        for (let k = 0; k < main.length && !b; k++) b = placeNear(s, main[(gi + k) % main.length], type, name, w, d, { ...opt, inside: false, reach: 10 });
        if (!b && opt.retry) for (const g of s.gates) { b = placeNear(s, g, type, name, w, d, { ...opt, inside: false, reach: 14 }); if (b) break; }
        if (b) { if (opt.yard) makeYard(b); if (type === 'drillyard') s.drillyard = b.id; }
        else if (opt.retry) s.missing = [...(s.missing || []), type];
        gi++;
      }
    }
  }
  // 練兵場のような「中を歩ける広場」の建物：床は石畳で歩ける
  function makeYard(b) {
    for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) set(x, z, T.PLAZA);
    b.yard = true;
  }
  function findGates(s) {
    const RR = s.type === 'capital' ? s.r + 1 : s.r;
    const out = [];
    for (let i = -RR; i <= RR; i++) for (const [x, z, dx, dz] of [[s.x + i, s.z - RR, 0, -1], [s.x + i, s.z + RR, 0, 1], [s.x - RR, s.z + i, -1, 0], [s.x + RR, s.z + i, 1, 0]]) {
      const t = get(x, z), t2 = get(x + dx, z + dz);
      if (t !== T.ROAD && t !== T.BRIDGE) continue;
      if (s.type !== 'capital' && t2 !== T.ROAD && t2 !== T.BRIDGE) continue;
      if (s.type === 'capital' && !walkable(t2)) continue;
      if (out.some((g) => Math.abs(g.x - x) + Math.abs(g.z - z) <= 2)) continue;
      out.push({ x, z, dx, dz });
    }
    // 東西南北の真ん中の門を先に
    out.sort((a, b) => (a.x === s.x || a.z === s.z ? 0 : 1) - (b.x === s.x || b.z === s.z ? 0 : 1));
    return out;
  }
  // 門のそば（inside：城壁の内側 / 外側）の道に面して建物を置く
  function placeNear(s, g, type, name, w, d, opt = {}) {
    const RR = s.type === 'capital' ? s.r + 1 : s.r;
    const reach = opt.reach || 5;
    const streets = [];
    for (let z = g.z - reach; z <= g.z + reach; z++) for (let x = g.x - reach; x <= g.x + reach; x++) {
      const t = get(x, z);
      if (t !== T.ROAD && t !== T.PLAZA && t !== T.BRIDGE) continue;
      const cheb = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      if (opt.inside ? cheb >= RR : cheb <= RR) continue;
      streets.push({ x, z, d: Math.abs(x - g.x) + Math.abs(z - g.z) + rng.next() });
    }
    streets.sort((a, b) => a.d - b.d);
    const proxy = { x: s.x, z: s.z, r: opt.inside ? RR - 1 : RR + reach + 2, id: s.id, kingdom: s.kingdom };
    const b = tryPlace(world0(), proxy, streets, type, name, w, d, opt, rng, opt.inside ? null : RR);
    if (b) s.buildings.push(b.id);
    return b;
  }
  function placeOnStreet(s, type, name, w, d, opt = {}) {
    const R = s.r + (s.extraR || 0);
    const streets = [];
    for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) if (get(x, z) === T.ROAD || get(x, z) === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + (opt.jitter ? rng.next() * opt.jitter : rng.next()) });
    if (opt.near) for (const q of streets) q.d = Math.abs(q.x - opt.near.x) + Math.abs(q.z - opt.near.z) + rng.next();
    streets.sort((a, b) => (opt.far ? b.d - a.d : a.d - b.d));
    return tryPlace(world0(), s, streets, type, name, w, d, opt, rng);
  }
  // 港：桟橋
  for (const s of settlements.filter((q) => q.type === 'port')) {
    let best = null, bd = 1e9;
    for (let z = s.z - s.r - 6; z <= s.z + s.r + 6; z++) for (let x = s.x - s.r - 6; x <= s.x + s.r + 6; x++) {
      if (!walkable(get(x, z)) || get(x, z) === T.BLD) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (get(x + dx, z + dz) !== T.SEA && get(x + dx, z + dz) !== T.DEEP) continue;
        const d = Math.hypot(x - s.x, z - s.z);
        if (d < bd) { bd = d; best = { x, z, dx, dz }; }
      }
    }
    if (best) {
      s.dock = [];
      for (let k = 1; k <= 5; k++) { const x = best.x + best.dx * k, z = best.z + best.dz * k; if (!inb(x, z)) break; set(x, z, T.DOCK); hgt[idx(x, z)] = 1; s.dock.push({ x, z }); }
      const b = addBuilding('lighthouse', '灯台', best.x + best.dz * 2, best.z + best.dx * 2, 1, 1, { x: best.x, z: best.z }, { settlement: s.id, kingdom: s.kingdom, open: true });
      if (b) s.buildings.push(b.id);
      s.dockEnd = s.dock[s.dock.length - 1];
    }
  }

  // 畑・牧場（町の外側）。森を切り開いて畑にすることもある。広い土地がなければ小さな畑を
  const fields = [], pastures = [];
  const FIELD_LAND = [T.GRASS, T.SAVANNA, T.FOREST, T.DENSE];
  const makePlot = (s, x0, z0, w, dd, pasture, fence = true) => {
    for (let z = z0; z < z0 + dd; z++) for (let x = x0; x < x0 + w; x++) {
      const edge = fence && (x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + dd - 1);
      const i = idx(x, z);
      hgt[i] = hgt[idx(x0, z0)];
      if (edge) set(x, z, (x === x0 + 1 && z === z0) ? T.GRASS : T.FENCE);
      else if (pasture) { set(x, z, T.PASTURE); pastures.push({ x, z, s: s.id }); }
      else { set(x, z, T.FIELD); fields.push({ x, z, s: s.id }); }
    }
    if (pasture) s.ranch = { x0: x0 + 1, z0: z0 + 1, x1: x0 + w - 2, z1: z0 + dd - 2 };
  };
  for (const s of settlements) {
    const nField = s.type === 'village' ? 4 : s.type === 'capital' ? 3 : 1;
    const RR = s.type === 'capital' ? s.r + 1 : s.r;
    let made = 0;
    for (let tries = 0; tries < 500 && made < nField; tries++) {
      const small = tries >= 250;
      const a = rng.next() * Math.PI * 2, d = RR + rng.range(2, small ? 13 : 10);
      const x0 = Math.round(s.x + Math.cos(a) * d), z0 = Math.round(s.z + Math.sin(a) * d);
      const w = small ? rng.int(4, 5) : rng.int(5, 8), dd = small ? rng.int(3, 4) : rng.int(4, 6);
      if (!free(x0 - 1, z0 - 1, x0 + w, z0 + dd, FIELD_LAND)) continue;
      // 城壁や家並みに食い込まない
      if (Math.max(Math.abs(x0 - 1 - s.x), Math.abs(z0 - 1 - s.z)) <= RR && Math.max(Math.abs(x0 + w - s.x), Math.abs(z0 + dd - s.z)) <= RR) continue;
      if (!(x0 - 1 > s.x + RR || x0 + w < s.x - RR || z0 - 1 > s.z + RR || z0 + dd < s.z - RR)) continue;
      makePlot(s, x0, z0, w, dd, s.type === 'village' && made === 0 && !s.ranch);
      made++;
    }
    // 外に土地がない村・港は、町はずれの空き地を畑にする（柵なし）
    if (made === 0 && s.type !== 'capital') {
      const cands = [];
      for (let z0 = s.z - s.r; z0 <= s.z + s.r - 2; z0++) for (let x0 = s.x - s.r; x0 <= s.x + s.r - 2; x0++) {
        if (!free(x0, z0, x0 + 2, z0 + 2, [T.GRASS, T.SAVANNA])) continue;
        cands.push({ x0, z0, d: Math.max(Math.abs(x0 + 1 - s.x), Math.abs(z0 + 1 - s.z)) + rng.next() });
      }
      cands.sort((a, b) => b.d - a.d);
      for (const c of cands) {
        if (made >= 2) break;
        if (!free(c.x0, c.z0, c.x0 + 2, c.z0 + 2, [T.GRASS, T.SAVANNA])) continue;
        makePlot(s, c.x0, c.z0, 3, 3, false, false);
        made++;
      }
    }
  }

  // 国境の砦：王都どうしを結ぶ街道が国境を越えるあたりに、それぞれの国が砦を置く
  const forts = [];
  const specials = [];
  // 国境を越える街道のそば（自国側）を探す
  const nearOther = (x, z, other, r = 3) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, z + dz) && kingdomOf[idx(x + dx, z + dz)] === other) return true; return false; };
  for (let ka = 0; ka < KINGDOMS.length; ka++) for (let kb = 0; kb < KINGDOMS.length; kb++) {
    if (ka === kb) continue;
    const A = settlements[ka], B = settlements[kb];
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const streets = [];
    for (const rr of [3, 7, 11]) {
      for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
        const i = idx(x, z);
        if (tiles[i] !== T.ROAD || kingdomOf[i] !== ka) continue;
        if (settlements.some((q) => Math.max(Math.abs(q.x - x), Math.abs(q.z - z)) <= q.r + 3)) continue;
        if (!nearOther(x, z, kb, rr)) continue;
        streets.push({ x, z, d: Math.hypot(x - mx, z - mz) + Math.hypot(x - A.x, z - A.z) * 0.3 });
      }
      if (streets.length >= 3) break;
    }
    if (!streets.length) continue;
    streets.sort((p, q) => p.d - q.d);
    const mid = streets[0];
    const proxy = { x: mid.x, z: mid.z, r: 40, id: undefined, kingdom: ka };
    const other = KINGDOMS[kb].name.replace('王国', '');
    const f = tryPlace(world0(), proxy, streets.slice(0, 20), 'fort', `${KINGDOMS[ka].name.replace('王国', '')}の${other}国境砦`, 3, 3, { land: [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH, T.DENSE, T.JUNGLE, T.ROCK], extra: { special: true, fort: true, faces: other, capital: A.id } }, rng);
    if (f) { forts.push(f.id); specials.push(f.id); }
  }

  // --- 特別な場所 ---
  const farFromTowns = (x, z, d) => settlements.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + d);
  function findSite(pred, n = 3000) {
    let best = null, bs = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = rng.int(6, W - 7), z = rng.int(6, H - 7);
      const sc = pred(x, z);
      if (sc != null && sc > bs) { bs = sc; best = { x, z }; }
    }
    return best;
  }
  const addSpecial = (type, name, site, w, d, extra = {}) => {
    if (!site) return null;
    const door = { x: site.x + Math.floor(w / 2), z: site.z + d };
    if (!walkable(get(door.x, door.z)) || get(door.x, door.z) === T.BLD || !onMain(door.x, door.z)) return null;
    const b = addBuilding(type, name, site.x, site.z, w, d, door, { face: 'S', special: true, kingdom: kingdomOf[idx(site.x, site.z)], ...extra });
    if (!isWater(get(door.x, door.z))) set(door.x, door.z, T.ROAD); // 扉の前はふさがせない
    specials.push(b.id);
    return b;
  };
  const okBox = (x, z, w, d, ok) => free(x, z, x + w - 1, z + d, ok);
  // 魔王城
  {
    const w = 7, d = 7, x = demon.x - 3, z = demon.z - 3;
    for (let zz = z - 1; zz <= z + d + 1; zz++) for (let xx = x - 1; xx <= x + w; xx++) if (inb(xx, zz)) { set(xx, zz, T.WASTE); hgt[idx(xx, zz)] = hgt[idx(demon.x, demon.z)]; }
    const b = addBuilding('demoncastle', DEMON_REALM.castle, x, z, w, d, { x: x + 3, z: z + d }, { face: 'S', special: true, kingdom: -2 });
    specials.push(b.id);
  }
  // ダンジョン（洞窟）
  for (let k = 0; k < 3; k++) {
    const site = findSite((x, z) => {
      if (!okBox(x, z, 3, 2, [T.GRASS, T.FOREST, T.DENSE, T.SNOW, T.SAVANNA, T.ROCK])) return null;
      const rocky = [[0, -1], [1, -1], [2, -1], [-1, 0], [3, 0]].filter(([dx, dz]) => get(x + dx, z + dz) === T.ROCK || get(x + dx, z + dz) === T.PEAK).length;
      if (!farFromTowns(x, z, 10) || specials.some((id) => Math.hypot(buildings[id].x - x, buildings[id].z - z) < 25)) return null;
      // 竜の巣は人里から十分に離す（村のそばに居座って毎日警鐘が鳴らないように）
      const townD = Math.min(...settlements.map((s) => Math.hypot(s.x - x, s.z - z) - s.r));
      if (k === 1 && townD < 16) return null;
      return rocky * 3 + elev[idx(x, z)] * 10 + (k === 1 ? Math.min(townD, 30) * 0.8 : 0);
    });
    addSpecial('cave', ['古の洞窟', '竜の巣穴', '嘆きの迷宮'][k], site, 3, 2);
  }
  // ピラミッド
  {
    const site = findSite((x, z) => {
      if (!okBox(x - 1, z - 1, 9, 8, [T.DESERT, T.SAVANNA, T.GRASS, T.BEACH])) return null;
      if (!farFromTowns(x, z, 8)) return null;
      let desert = 0;
      for (let dz = 0; dz < 7; dz++) for (let dx = 0; dx < 7; dx++) if (get(x + dx, z + dz) === T.DESERT) desert++;
      return desert + temp[idx(x, z)] * 20;
    }, 8000);
    if (site) for (let dz = 0; dz < 8; dz++) for (let dx = 0; dx < 7; dx++) hgt[idx(site.x + dx, site.z + dz)] = hgt[idx(site.x, site.z)];
    addSpecial('pyramid', '砂のピラミッド', site, 7, 7);
  }
  // 展望台
  {
    const cap = settlements[0];
    const site = findSite((x, z) => {
      if (!okBox(x, z, 2, 2, [T.GRASS, T.FOREST, T.SNOW, T.SAVANNA])) return null;
      const d = Math.hypot(x - cap.x, z - cap.z);
      if (d > 40 || !farFromTowns(x, z, 4)) return null;
      return elev[idx(x, z)] * 20 - d * 0.05;
    });
    addSpecial('observatory', '星見の展望台', site, 2, 2);
  }
  // 盗賊のアジト
  for (let k = 0; k < 2; k++) {
    const site = findSite((x, z) => {
      if (!okBox(x, z, 3, 3, [T.FOREST, T.DENSE, T.JUNGLE])) return null;
      if (!farFromTowns(x, z, 8) || specials.some((id) => Math.hypot(buildings[id].x - x, buildings[id].z - z) < 16)) return null;
      let road = 0;
      for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) if (get(x + dx, z + dz) === T.ROAD) road++;
      return Math.min(road, 6) + rng.next();
    });
    addSpecial('hideout', '盗賊のアジト', site, 3, 3);
  }
  // 鉱山
  for (const s of settlements.filter((q) => q.type === 'village')) {
    let best = null, bd = 1e9;
    for (let z = s.z - 30; z <= s.z + 30; z++) for (let x = s.x - 30; x <= s.x + 30; x++) {
      if (!okBox(x, z, 2, 1, [T.GRASS, T.FOREST, T.SNOW, T.SAVANNA, T.DESERT])) continue;
      if (get(x, z - 1) !== T.ROCK && get(x + 1, z - 1) !== T.ROCK) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < bd && d > s.r + 3) { bd = d; best = { x, z }; }
    }
    const b = addSpecial('mine', `${s.name.replace(/村$/, '')}鉱山`, best, 2, 1);
    if (b) s.mine = b.id;
  }
  // 遺跡
  for (let k = 0; k < 2; k++) {
    const site = findSite((x, z) => (okBox(x, z, 3, 3, [T.GRASS, T.JUNGLE, T.FOREST, T.SAVANNA, T.DENSE]) && farFromTowns(x, z, 12) && specials.every((id) => Math.hypot(buildings[id].x - x, buildings[id].z - z) > 18) ? rng.next() : null));
    addSpecial('ruins', ['古代都市の遺跡', '忘れられた神殿'][k], site, 3, 3);
  }

  // 開拓地：それぞれの国で、村から少し離れた手つかずの土地に開拓者の小屋と小さな畑を置く（道はまだない）
  const camps = [];
  KINGDOMS.forEach((K, ki) => {
    const vills = settlements.filter((q) => q.kingdom === ki && q.type !== 'capital');
    if (!vills.length) return;
    const site = findSite((x, z) => {
      if ((kingdomOf[idx(x, z)] !== ki && kingdomOf[idx(x, z)] !== -1) || !onMain(x, z)) return null;
      if (!okBox(x - 1, z - 1, 4, 3, [T.GRASS, T.FOREST, T.SAVANNA, T.DENSE, T.JUNGLE, T.SNOW])) return null;
      if (!farFromTowns(x, z, 6) || specials.some((id) => Math.hypot(buildings[id].x - x, buildings[id].z - z) < 10)) return null;
      const room = okBox(x + 2, z - 1, 5, 3, [T.GRASS, T.FOREST, T.SAVANNA, T.DENSE]) ? 4 : 0;
      const dv = Math.min(...vills.map((v) => Math.hypot(v.x - x, v.z - z)));
      if (dv > 46) return null;
      let river = 0, road = 0;
      for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const t = get(x + dx, z + dz); if (t === T.RIVER) river++; if (t === T.ROAD) road++; }
      return room + Math.min(river, 3) * 2 - Math.abs(dv - 22) * 0.2 - Math.min(road, 5) + rng.next();
    }, 3000);
    if (!site) return;
    const home = vills.slice().sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
    const b = addSpecial('camp', `${home.name.replace(/村$/, '')}開拓地の小屋`, site, 2, 2, { kingdom: ki, home: home.id, camp: true });
    if (!b) return;
    camps.push(b.id);
    // 切り開いたばかりの小さな畑（小屋の東）
    const fx = site.x + 3, fz = site.z;
    if (free(fx, fz, fx + 2, fz + 1, [T.GRASS, T.FOREST, T.SAVANNA, T.DENSE])) for (let z = fz; z < fz + 2; z++) for (let x = fx; x < fx + 3; x++) { set(x, z, T.FIELD); hgt[idx(x, z)] = hgt[idx(site.x, site.z)]; fields.push({ x, z, s: home.id, camp: b.id }); }
  });

  // --- 道の網を仕上げる：町・特別な場所・砦を、すべて王都から道でたどれるようにする ---
  const roadNet = new Uint8Array(N);
  const ROADISH = (t) => t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK;
  const growNet = (i0) => {
    if (roadNet[i0] || !ROADISH(tiles[i0])) return;
    const st = [i0]; roadNet[i0] = 1;
    while (st.length) {
      const i = st.pop(); const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (!inb(nx, nz)) continue; const j = idx(nx, nz); if (!roadNet[j] && ROADISH(tiles[j])) { roadNet[j] = 1; st.push(j); } }
    }
  };
  growNet(idx(settlements[0].x, settlements[0].z));
  const connect = (x, z) => {
    if (roadNet[idx(x, z)]) return true;
    const path = roadPath({ x, z }, null, (i) => roadNet[i] === 1);
    if (!path.length) return false;
    layRoad(path);
    for (const i of path) growNet(i);
    growNet(idx(x, z));
    return true;
  };
  for (const s of settlements) if (!roadNet[idx(s.x, s.z)]) { connect(s.x, s.z); growNet(idx(s.x, s.z)); }
  for (const s of settlements) for (const g of s.gates || []) if (!roadNet[idx(g.x, g.z)]) connect(g.x, g.z);
  // 王都の門は、城壁の外で街道まで道を延ばす（行き止まりの門をなくす）
  for (const s of settlements.filter((q) => q.type === 'capital')) {
    const RR = s.r + 1;
    const cheb = (i) => Math.max(Math.abs((i % W) - s.x), Math.abs(((i / W) | 0) - s.z));
    for (const g of s.gates) {
      const ox = g.x + g.dx, oz = g.z + g.dz;
      if (!inb(ox, oz) || !walkable(get(ox, oz)) && get(ox, oz) !== T.RIVER) continue;
      const path = roadPath({ x: ox, z: oz }, null, (i) => roadNet[i] === 1 && cheb(i) > RR + 3, (j) => cheb(j) <= RR);
      if (path.length && path.length < 40) { layRoad(path); for (const i of path) growNet(i); }
    }
  }
  // 町の中：門と建物の扉が、すべて道の網につながっているか（城の裏の行き止まりなど）
  for (const s of settlements) {
    for (const g of s.gates || []) if (!roadNet[idx(g.x, g.z)]) connect(g.x, g.z);
    for (const id of s.buildings) { const b = buildings[id]; if (!roadNet[idx(b.door.x, b.door.z)]) connect(b.door.x, b.door.z); }
    if (s.type !== 'capital') {
      const before = s.gates || [];
      s.gates = findGates(s);
      for (const g of s.gates) { const old = before.find((q) => q.x === g.x && q.z === g.z); if (old?.post != null) g.post = old.post; }
    }
  }
  const unlinked = [];
  for (const id of specials) {
    const b = buildings[id];
    if (b.camp) continue; // 開拓地への道は、これから道普請が造る
    if (!connect(b.door.x, b.door.z)) unlinked.push(b.name);
  }

  return {
    W, H, tiles: Array.from(tiles), hgt: Array.from(hgt), kingdomOf: Array.from(kingdomOf), bldAt: Array.from(bldAt),
    buildings, settlements, specials, demon, demonR, fields, pastures, rivers: rivers.length, forts, camps, unlinked,
    placeHouse: null,
  };
}

// 通りに面した場所に建物を置く（扉の前は小道にして、ほかの建物がふさがないようにする）
export function tryPlace(w, s, streets, type, name, bw, bd, opt, rng, minOut = null) {
  const { tiles, hgt, bldAt, buildings } = w;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const get = (x, z) => (inb(x, z) ? tiles[z * W + x] : T.DEEP);
  const land = opt.land || [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH];
  const R = s.r + (s.extraR || 0);
  const dirs = [{ dx: 0, dz: -1, f: 'S' }, { dx: 0, dz: 1, f: 'N' }, { dx: -1, dz: 0, f: 'E' }, { dx: 1, dz: 0, f: 'W' }];
  for (const r of streets) {
    for (const dir of rng.shuffle(dirs.slice())) {
      const doorX = r.x + dir.dx, doorZ = r.z + dir.dz;
      let fw = bw, fd = bd;
      if (dir.dx !== 0) { fw = bd; fd = bw; }
      let x0, z0;
      if (dir.f === 'S') { x0 = doorX - Math.floor(fw / 2); z0 = doorZ - fd; }
      else if (dir.f === 'N') { x0 = doorX - Math.floor(fw / 2); z0 = doorZ + 1; }
      else if (dir.f === 'E') { x0 = doorX - fw; z0 = doorZ - Math.floor(fd / 2); }
      else { x0 = doorX + 1; z0 = doorZ - Math.floor(fd / 2); }
      if (!land.includes(get(doorX, doorZ))) continue;
      if (Math.max(Math.abs(x0 - s.x), Math.abs(z0 - s.z), Math.abs(x0 + fw - 1 - s.x), Math.abs(z0 + fd - 1 - s.z)) > R) continue;
      if (minOut != null && !(x0 > s.x + minOut || x0 + fw - 1 < s.x - minOut || z0 > s.z + minOut || z0 + fd - 1 < s.z - minOut)) continue;
      let ok = true;
      for (let z = z0; z < z0 + fd && ok; z++) for (let x = x0; x < x0 + fw; x++) if (!land.includes(get(x, z))) { ok = false; break; }
      if (!ok) continue;
      if (!keepsConnected(tiles, x0, z0, fw, fd, doorX, doorZ)) continue;
      const id = buildings.length;
      for (let z = z0; z < z0 + fd; z++) for (let x = x0; x < x0 + fw; x++) { tiles[z * W + x] = T.BLD; bldAt[z * W + x] = id; hgt[z * W + x] = hgt[doorZ * W + doorX]; }
      tiles[doorZ * W + doorX] = T.ROAD;
      const b = { id, type, name, x: x0, z: z0, w: fw, d: fd, door: { x: doorX, z: doorZ }, h: hgt[doorZ * W + doorX], face: dir.f, settlement: s.id, kingdom: s.kingdom, roof: rng.pick(s.kingdom === 2 ? ['flat', 'flat', 'tile'] : ['thatch', 'thatch', 'tile']), ...(opt.extra || {}) };
      buildings.push(b);
      return b;
    }
  }
  return null;
}

// 建物を置いても、まわりの歩ける場所どうしが（近くで）つながったままか。細い通り道をふさがないため
const SOLID = new Set([T.DEEP, T.SEA, T.RIVER, T.PEAK, T.BLD, T.FENCE, T.LAVA, T.WALL]);
function keepsConnected(tiles, x0, z0, fw, fd, doorX, doorZ) {
  const M = 4, bx0 = x0 - M, bz0 = z0 - M, bw = fw + M * 2, bd = fd + M * 2;
  const inFoot = (x, z) => x >= x0 && x < x0 + fw && z >= z0 && z < z0 + fd;
  const okT = (x, z) => x >= 0 && z >= 0 && x < W && z < H && !inFoot(x, z) && !SOLID.has(tiles[z * W + x]);
  const ring = [];
  for (let x = x0 - 1; x <= x0 + fw; x++) for (const z of [z0 - 1, z0 + fd]) if (okT(x, z)) ring.push([x, z]);
  for (let z = z0; z < z0 + fd; z++) for (const x of [x0 - 1, x0 + fw]) if (okT(x, z)) ring.push([x, z]);
  if (ring.length <= 1) return true;
  const seen = new Uint8Array(bw * bd);
  const key = (x, z) => (z - bz0) * bw + (x - bx0);
  const st = [[doorX, doorZ]]; seen[key(doorX, doorZ)] = 1;
  while (st.length) {
    const [x, z] = st.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < bx0 || nz < bz0 || nx >= bx0 + bw || nz >= bz0 + bd || !okT(nx, nz)) continue;
      const k = key(nx, nz); if (seen[k]) continue; seen[k] = 1; st.push([nx, nz]);
    }
  }
  return ring.every(([x, z]) => seen[key(x, z)]);
}

// 町に家を追加で建てる（世帯数に合わせて）
export function makeHousePlacer(world, rng) {
  const get = (x, z) => (x >= 0 && z >= 0 && x < W && z < H ? world.tiles[z * W + x] : T.DEEP);
  return function placeHouse(s) {
    const R = s.r + (s.extraR || 0);
    const streets = [];
    for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) if (get(x, z) === T.ROAD || get(x, z) === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + rng.next() * 6 });
    streets.sort((a, b) => a.d - b.d);
    const b = tryPlace(world, s, streets, 'house', '家', rng.chance(0.4) ? 3 : 2, 2, {}, rng);
    if (b) s.buildings.push(b.id);
    return b;
  };
}

export function tileAt(world, x, z) {
  x = Math.round(x); z = Math.round(z);
  if (x < 0 || z < 0 || x >= W || z >= H) return T.DEEP;
  return world.tiles[z * W + x];
}
export function heightAt(world, x, z) {
  x = Math.round(x); z = Math.round(z);
  if (x < 0 || z < 0 || x >= W || z >= H) return 0;
  return world.hgt[z * W + x];
}
// 生息地の分類
export function biomeOf(t) {
  switch (t) {
    case T.GRASS: case T.PASTURE: case T.FIELD: return 'grass';
    case T.SAVANNA: return 'grass';
    case T.FOREST: return 'forest';
    case T.DENSE: return 'dense';
    case T.JUNGLE: case T.SWAMP: return 'jungle';
    case T.DESERT: return 'desert';
    case T.SNOW: return 'snow';
    case T.ROCK: return 'mountain';
    case T.BEACH: return 'beach';
    case T.SEA: return 'sea';
    case T.DEEP: return 'deepsea';
    case T.WASTE: return 'waste';
    case T.RIVER: return 'river';
    default: return 'town';
  }
}

// 古いセーブ用：王都の城壁の東西南北に門を開ける
export function openGates(world) {
  const get = (x, z) => (x >= 0 && z >= 0 && x < W && z < H ? world.tiles[z * W + x] : T.DEEP);
  const set = (x, z, t) => { if (x >= 0 && z >= 0 && x < W && z < H) world.tiles[z * W + x] = t; };
  const open = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH];
  let n = 0;
  for (const s of world.settlements) {
    if (!s.walls || !s.walls.length) continue;
    const R = Math.max(...s.walls.map((w) => Math.max(Math.abs(w.x - s.x), Math.abs(w.z - s.z)))) - 1;
    for (const [gx, gz, dx, dz] of [[s.x, s.z - R - 1, 0, -1], [s.x, s.z + R + 1, 0, 1], [s.x - R - 1, s.z, -1, 0], [s.x + R + 1, s.z, 1, 0]]) {
      if (get(gx, gz) !== T.WALL) continue;
      set(gx, gz, T.ROAD); n++;
      s.walls = s.walls.filter((w) => w.x !== gx || w.z !== gz);
      for (let k = 1; k <= 2; k++) { const t = get(gx + dx * k, gz + dz * k); if (open.includes(t) || t === T.WALL) set(gx + dx * k, gz + dz * k, T.ROAD); }
      for (let k = 1; k <= R; k++) { const t = get(gx - dx * k, gz - dz * k); if (t === T.ROAD || t === T.PLAZA || t === T.BLD) break; if (open.includes(t)) set(gx - dx * k, gz - dz * k, T.ROAD); }
      s.gates = s.gates || [];
      s.gates.push({ x: gx, z: gz, dx, dz });
    }
  }
  return n;
}
