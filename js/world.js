// 土地（マップ）と建物の生成
export const W = 48, H = 48;
export const T = { GRASS: 0, ROAD: 1, PLAZA: 2, WATER: 3, FIELD: 4, TREE: 5, BLD: 6, SAND: 7, FENCE: 8 };

export function walkable(t) {
  return t === T.GRASS || t === T.ROAD || t === T.PLAZA || t === T.FIELD || t === T.SAND;
}

export function generateWorld(rng, houseCount) {
  const tiles = new Uint8Array(W * H);
  const idx = (x, z) => z * W + x;
  const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
  const get = (x, z) => (inb(x, z) ? tiles[idx(x, z)] : T.TREE);
  const set = (x, z, t) => { if (inb(x, z)) tiles[idx(x, z)] = t; };
  const rect = (x0, z0, x1, z1, t) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, z, t); };
  const buildings = [];
  let bid = 1;

  // 道
  for (let i = 0; i < W; i++) { set(i, 24, T.ROAD); set(24, i, T.ROAD); }
  for (let i = 12; i <= 36; i++) { set(i, 12, T.ROAD); set(i, 36, T.ROAD); set(12, i, T.ROAD); set(36, i, T.ROAD); }
  // 広場
  rect(21, 21, 27, 27, T.PLAZA);

  // 湖
  const pond = { cx: 8.5, cz: 38.5, rx: 5.2, rz: 4.2 };
  for (let z = 30; z < 46; z++) for (let x = 1; x < 17; x++) {
    const d = ((x - pond.cx) / pond.rx) ** 2 + ((z - pond.cz) / pond.rz) ** 2;
    if (d < 1) set(x, z, T.WATER);
    else if (d < 1.45 && get(x, z) === T.GRASS) set(x, z, T.SAND);
  }

  function addBuilding(type, name, x, z, w, d, door, extra = {}) {
    rect(x, z, x + w - 1, z + d - 1, T.BLD);
    const b = { id: bid++, type, name, x, z, w, d, door, ...extra };
    buildings.push(b);
    return b;
  }
  const hall = addBuilding('hall', '村役場と鐘楼', 26, 14, 6, 6, { x: 28, z: 20 }, { face: 'S' });
  addBuilding('chapel', '礼拝堂', 16, 15, 4, 5, { x: 17, z: 20 }, { face: 'S' });
  addBuilding('bakery', 'パン屋', 17, 21, 3, 3, { x: 20, z: 22 }, { face: 'E' });
  addBuilding('tavern', '酒場「銀のジョッキ」', 15, 27, 5, 4, { x: 17, z: 26 }, { face: 'N' });
  addBuilding('smithy', '鍛冶場', 38, 20, 3, 3, { x: 39, z: 23 }, { face: 'S' });
  addBuilding('workshop', '大工の作業場', 7, 25, 3, 3, { x: 8, z: 24 }, { face: 'N' });
  addBuilding('market', '市場', 30, 26, 4, 2, { x: 31, z: 25 }, { face: 'N', open: true });
  addBuilding('well', '井戸', 22, 22, 1, 1, { x: 23, z: 22 }, { face: 'E', open: true });
  addBuilding('linden', 'リンデンの大樹', 26, 26, 1, 1, { x: 25, z: 26 }, { face: 'W', open: true });
  // 役場の柵
  const fences = [];
  for (let x = 25; x <= 32; x++) { fences.push({ x, z: 13 }); }
  for (let z = 13; z <= 20; z++) { fences.push({ x: 25, z }); fences.push({ x: 32, z }); }

  // 畑（柵で囲む）
  const fields = [];
  function fieldArea(x0, z0, x1, z1, gate) {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (get(x, z) === T.ROAD) continue;
      if (edge) { if (!(x === gate.x && z === gate.z)) { set(x, z, T.FENCE); } else set(x, z, T.GRASS); }
      else { set(x, z, T.FIELD); fields.push({ x, z, crop: (Math.floor((x - x0 - 1) / 3) + Math.floor((z - z0 - 1) / 3)) % 2 }); }
    }
  }
  fieldArea(27, 28, 34, 34, { x: 27, z: 30 });
  fieldArea(38, 28, 45, 43, { x: 38, z: 30 });
  fieldArea(26, 38, 34, 44, { x: 29, z: 38 });

  // 家
  const houses = [];
  const roadTiles = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (get(x, z) === T.ROAD) roadTiles.push({ x, z });
  rng.shuffle(roadTiles);
  const free = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (get(x, z) !== T.GRASS || x < 2 || z < 2 || x > W - 3 || z > H - 3) return false;
    return true;
  };
  const dirs = [{ dx: 0, dz: -1, f: 'S' }, { dx: 0, dz: 1, f: 'N' }, { dx: -1, dz: 0, f: 'E' }, { dx: 1, dz: 0, f: 'W' }];
  for (const r of roadTiles) {
    if (houses.length >= houseCount) break;
    for (const dir of rng.shuffle(dirs.slice())) {
      const w = rng.chance(0.4) ? 3 : 2, d = 2;
      // ドアの位置（道の隣のマス）
      const doorX = r.x + dir.dx, doorZ = r.z + dir.dz;
      let x0, z0, fw = w, fd = d;
      if (dir.dx !== 0) { fw = d; fd = w; }
      if (dir.f === 'S') { x0 = doorX - Math.floor(fw / 2); z0 = doorZ - fd; }
      else if (dir.f === 'N') { x0 = doorX - Math.floor(fw / 2); z0 = doorZ + 1; }
      else if (dir.f === 'E') { x0 = doorX - fw; z0 = doorZ - Math.floor(fd / 2); }
      else { x0 = doorX + 1; z0 = doorZ - Math.floor(fd / 2); }
      if (get(doorX, doorZ) !== T.GRASS) continue;
      if (!free(x0 - 1, z0 - 1, x0 + fw, z0 + fd)) continue;
      const b = addBuilding('house', '家', x0, z0, fw, fd, { x: doorX, z: doorZ }, { face: dir.f, roof: rng.pick(['thatch', 'thatch', 'tile']) });
      houses.push(b);
      break;
    }
  }

  // 森
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (get(x, z) !== T.GRASS) continue;
    const dx = x - 24, dz = z - 24;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const n = Math.sin(x * 0.7) * 1.8 + Math.cos(z * 0.55) * 1.8 + Math.sin((x + z) * 0.31) * 2;
    const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => get(x + a, z + b) === T.ROAD);
    if (nearRoad) continue;
    const nearBld = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => get(x + a, z + b) === T.BLD);
    if (nearBld) continue;
    if (dist > 19 + n && rng.chance(0.62)) set(x, z, T.TREE);
    else if (rng.chance(0.025)) set(x, z, T.TREE);
  }
  // 牧草地の羊の範囲
  const pasture = { x0: 3, z0: 3, x1: 10, z1: 9 };
  rect(pasture.x0, pasture.z0, pasture.x1, pasture.z1, T.GRASS);

  // 仕事場所
  const spots = { field: fields.map((f) => ({ x: f.x, z: f.z })), forest: [], pond: [], plaza: [] };
  for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) {
    const t = get(x, z);
    if (!walkable(t)) continue;
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => get(x + a, z + b));
    if (n4.includes(T.TREE) && Math.hypot(x - 24, z - 24) > 14) spots.forest.push({ x, z });
    if (n4.includes(T.WATER)) spots.pond.push({ x, z });
    if (t === T.PLAZA) spots.plaza.push({ x, z });
  }
  // 街灯
  const lamps = [];
  for (const [x, z] of [[20, 20], [28, 20], [20, 28], [28, 28], [24, 11], [11, 24], [37, 24], [24, 37], [13, 13], [35, 13], [13, 35], [35, 35]]) {
    if (get(x, z) === T.GRASS) lamps.push({ x, z });
  }

  return { W, H, tiles: Array.from(tiles), buildings, houses: houses.map((h) => h.id), fences, spots, lamps, pond, pasture, hall: hall.id };
}

export function tileAt(world, x, z) {
  if (x < 0 || z < 0 || x >= W || z >= H) return T.TREE;
  return world.tiles[z * W + x];
}
