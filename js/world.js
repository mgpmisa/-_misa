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

  // --- 国と町の場所 ---
  const settlements = [];
  const farFromAll = (x, z, r) => settlements.every((s) => Math.hypot(s.x - x, s.z - z) >= s.r + r + 5) && Math.hypot(demon.x - x, demon.z - z) > demonR + r + 6;
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
  function roadPath(a, b) {
    const cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1);
    const hp = new MinHeap();
    hp.push(0, idx(a.x, a.z));
    cost[idx(a.x, a.z)] = 0;
    const goal = idx(b.x, b.z);
    let it = 0;
    while (hp.size && it++ < 80000) {
      const i = hp.pop();
      if (i === goal) break;
      const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inb(nx, nz)) continue;
        const j = idx(nx, nz), t = tiles[j];
        let c;
        if (t === T.ROAD || t === T.BRIDGE) c = 0.5;
        else if (t === T.RIVER) c = 9;
        else if (t === T.SEA || t === T.DEEP || t === T.PEAK || t === T.BLD || t === T.LAVA) continue;
        else c = (MOVE_COST[t] || 2) + Math.abs(hgt[j] - hgt[i]) * 2;
        const nc = cost[i] + c;
        if (nc < cost[j]) { cost[j] = nc; came[j] = i; hp.push(nc + (Math.abs(nx - b.x) + Math.abs(nz - b.z)) * 0.5, j); }
      }
    }
    const path = [];
    for (let c = goal; c !== -1 && c !== idx(a.x, a.z); c = came[c]) path.push(c);
    return came[goal] === -1 ? [] : path;
  }
  const roadLinks = [];
  for (const s of settlements) if (s.type !== 'capital') roadLinks.push([settlements[s.kingdom], s]);
  roadLinks.push([settlements[0], settlements[1]], [settlements[1], settlements[2]], [settlements[0], settlements[2]]);
  for (const [a, b] of roadLinks) {
    for (const i of roadPath(a, b)) {
      const t = tiles[i];
      if (t === T.RIVER) tiles[i] = T.BRIDGE;
      else if (t !== T.BLD && t !== T.BRIDGE) tiles[i] = T.ROAD;
    }
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
    const place = (type, name, w, d, opt = {}) => {
      const b = placeOnStreet(s, type, name, w, d, opt);
      if (b) s.buildings.push(b.id);
      return b;
    };
    if (s.type === 'capital') {
      place('church', '大聖堂', 4, 4);
      place('market', '市場', 5, 2, { extra: { open: true } });
      place('tavern', '宿屋「黄金の獅子」', 4, 4);
      place('guild', '冒険者ギルド', 4, 4);
      place('barracks', '兵舎', 5, 3);
      place('prison', '牢獄', 4, 4, { far: true });
      place('magictower', s.kingdom === 1 ? '魔法の塔' : '学術院', 3, 3, { far: true });
      place('mansion', '貴族の屋敷', 5, 4, { far: true });
      place('mansion', '貴族の屋敷', 5, 4, { far: true });
      place('bakery', 'パン屋', 3, 3);
      place('smithy', '鍛冶場', 3, 3);
      place('workshop', '職人の工房', 3, 3);
      place('clinic', '診療所', 3, 3);
      place('school', '学校', 4, 3);
      place('stable', '厩舎', 4, 2, { far: true });
      s.walls = [];
      for (let i = -R - 1; i <= R + 1; i++) for (const [x, z] of [[s.x + i, s.z - R - 1], [s.x + i, s.z + R + 1], [s.x - R - 1, s.z + i], [s.x + R + 1, s.z + i]]) {
        const t = get(x, z);
        if (t === T.ROAD || t === T.BRIDGE || isWater(t) || t === T.BLD) continue;
        set(x, z, T.WALL); s.walls.push({ x, z });
      }
    } else if (s.type === 'village') {
      place('church', '礼拝堂', 3, 4);
      place('tavern', `${s.name.replace('村', '')}の宿`, 4, 3);
      place('smithy', '鍛冶場', 3, 3);
      place('well', '井戸', 1, 1, { extra: { open: true } });
      place('mill', '風車小屋', 2, 2, { far: true });
    } else {
      place('market', '魚市場', 4, 2, { extra: { open: true } });
      place('tavern', '船乗りの酒場', 4, 3);
      place('church', '海の礼拝堂', 3, 3);
      place('workshop', '造船所', 4, 3);
      place('bakery', 'パン屋', 3, 3);
    }
  }
  function placeOnStreet(s, type, name, w, d, opt = {}) {
    const R = s.r + (s.extraR || 0);
    const streets = [];
    for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) if (get(x, z) === T.ROAD || get(x, z) === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + (opt.jitter ? rng.next() * opt.jitter : rng.next()) });
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

  // 畑・牧場（村の外側）
  const fields = [], pastures = [];
  for (const s of settlements) {
    const nField = s.type === 'village' ? 4 : s.type === 'capital' ? 3 : 1;
    let made = 0;
    for (let tries = 0; tries < 300 && made < nField; tries++) {
      const a = rng.next() * Math.PI * 2, d = s.r + rng.range(3, 9);
      const x0 = Math.round(s.x + Math.cos(a) * d), z0 = Math.round(s.z + Math.sin(a) * d);
      const w = rng.int(5, 8), dd = rng.int(4, 6);
      if (!free(x0 - 1, z0 - 1, x0 + w, z0 + dd, [T.GRASS, T.SAVANNA, T.FOREST])) continue;
      const pasture = s.type === 'village' && made === 0;
      for (let z = z0; z < z0 + dd; z++) for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || z === z0 || x === x0 + w - 1 || z === z0 + dd - 1;
        const i = idx(x, z);
        hgt[i] = hgt[idx(x0, z0)];
        if (edge) set(x, z, (x === x0 + 1 && z === z0) ? T.GRASS : T.FENCE);
        else if (pasture) { set(x, z, T.PASTURE); pastures.push({ x, z, s: s.id }); }
        else { set(x, z, T.FIELD); fields.push({ x, z, s: s.id }); }
      }
      if (pasture) {
        s.ranch = { x0: x0 + 1, z0: z0 + 1, x1: x0 + w - 2, z1: z0 + dd - 2 };
      }
      made++;
    }
  }

  // --- 特別な場所 ---
  const specials = [];
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
    if (!walkable(get(door.x, door.z)) || get(door.x, door.z) === T.BLD) return null;
    const b = addBuilding(type, name, site.x, site.z, w, d, door, { face: 'S', special: true, kingdom: kingdomOf[idx(site.x, site.z)], ...extra });
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
      return rocky * 3 + elev[idx(x, z)] * 10;
    });
    addSpecial('cave', ['古の洞窟', '竜の巣穴', '嘆きの迷宮'][k], site, 3, 2);
  }
  // ピラミッド
  {
    const site = findSite((x, z) => {
      if (!okBox(x, z, 7, 7, [T.DESERT, T.SAVANNA, T.GRASS])) return null;
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

  return {
    W, H, tiles: Array.from(tiles), hgt: Array.from(hgt), kingdomOf: Array.from(kingdomOf), bldAt: Array.from(bldAt),
    buildings, settlements, specials, demon, demonR, fields, pastures, rivers: rivers.length,
    placeHouse: null,
  };
}

// 通りに面した場所に建物を置く（扉の前は小道にして、ほかの建物がふさがないようにする）
export function tryPlace(w, s, streets, type, name, bw, bd, opt, rng) {
  const { tiles, hgt, bldAt, buildings } = w;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const get = (x, z) => (inb(x, z) ? tiles[z * W + x] : T.DEEP);
  const land = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH];
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
      let ok = true;
      for (let z = z0; z < z0 + fd && ok; z++) for (let x = x0; x < x0 + fw; x++) if (!land.includes(get(x, z))) { ok = false; break; }
      if (!ok) continue;
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
