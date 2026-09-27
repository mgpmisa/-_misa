// 保存食の工房と屋台・料理屋の見た目（グラフィック部）
//
// 社長の方針：人物の動作はドット絵、それ以外は3D。
// ■ 建物の外（render.js の buildingParts から）：看板（チーズ・ハム・樽・塩・串・椀の絵）、煙突の煙、
//   軒下に吊るした燻製、戸口のチーズ棚と乳の缶、塩蔵所の樽、塩田の平釜と塩の山、屋台の日よけと炭火、料理屋の外の卓。
// ■ 建物の中（interior.js の NEW_INTERIOR）：搾り機・乳を温める釜・熟成棚、燻しの炉と梁、漬け樽と作業台、
//   塩を煮る平釜、屋台の焼き台と長椅子、料理屋の台所と卓。人の居場所（work・eat）もここで決める。
// ■ 在庫の3D（shelfgfx.js の SHELF_EXT）：職場の蔵の量に合わせて、チーズの輪・バターの塊・吊るした燻製・樽・塩の袋・
//   料理の皿と鍋を増やしたり減らしたりする（0なら空、少し・半分・満杯の段で）。
// ■ 本体からの呼び方（apply.py）
//   render.js    buildingParts の BN.NEW_TYPES の行の前 … if (FG.FOOD_TYPES.has(b.type)) { FG.foodBldParts(this, b, add, M, W_, D_, face, door, {...}); return parts; }
//   interior.js  import するだけ（NEW_INTERIOR に足す）。食事の行動 dine は「eat」の居場所へ
//   shelfgfx.js  SHELF_EXT（棚の並べ方・品の形）に足す
import * as THREE from 'three';
import { canvasTex } from './textures.js';
import { NEW_INTERIOR } from './bldnew.js';
import { SHELF_EXT } from './shelfgfx.js';
import { W, H } from './world.js';
import { FS_TYPES } from './foodshop.js';
import './foodanim.js';   // 職人と客の動き（ドット絵）

export const FOOD_TYPES = FS_TYPES;
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const hsh = (a, b, s = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 982451653); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
const topY = (h) => 0.3 + h * 0.4;

// ================================================================ 看板の絵（16×12 のドット絵）
const ICONS = {
  cheese(g) { rect(g, 3, 4, 10, 5, '#e8c040'); rect(g, 3, 4, 10, 1, '#f8e070'); rect(g, 9, 3, 4, 2, '#f8e070'); px(g, 5, 6, '#c89820'); px(g, 8, 7, '#c89820'); px(g, 11, 6, '#c89820'); rect(g, 3, 9, 10, 1, '#a07818'); },
  ham(g) { rect(g, 7, 1, 1, 2, '#6a4222'); rect(g, 5, 3, 5, 6, '#8a3a24'); rect(g, 5, 3, 5, 1, '#b05a34'); rect(g, 6, 9, 3, 1, '#6a2a1a'); rect(g, 7, 10, 1, 1, '#e8e0c8'); px(g, 11, 4, '#c8c8d0'); px(g, 12, 2, '#d8d8e0'); px(g, 3, 5, '#c8c8d0'); },
  barrel(g) { rect(g, 4, 2, 8, 9, '#9a6a3a'); rect(g, 4, 2, 8, 1, '#c89a60'); rect(g, 4, 4, 8, 1, '#4a4a52'); rect(g, 4, 8, 8, 1, '#4a4a52'); rect(g, 6, 1, 4, 1, '#f8f8f8'); px(g, 7, 0, '#ffffff'); },
  salt(g) { rect(g, 3, 8, 10, 2, '#8a5a30'); rect(g, 4, 5, 8, 3, '#f8f8f8'); rect(g, 6, 3, 4, 2, '#ffffff'); px(g, 7, 2, '#ffffff'); px(g, 5, 6, '#d8e0ea'); px(g, 10, 6, '#d8e0ea'); },
  skewer(g) { for (let i = 0; i < 10; i++) px(g, 3 + i, 9 - Math.floor(i * 0.7), '#c8a870'); for (const [x, y] of [[5, 7], [8, 5], [11, 3]]) { rect(g, x - 1, y - 1, 3, 3, '#9a3a24'); px(g, x - 1, y - 1, '#c05a34'); } px(g, 12, 1, '#ffb040'); },
  bowl(g) { rect(g, 3, 6, 10, 3, '#8a5a3a'); rect(g, 4, 9, 8, 1, '#6a4028'); rect(g, 3, 5, 10, 1, '#c87a3a'); px(g, 6, 3, '#e8e8ec'); px(g, 7, 2, '#e8e8ec'); px(g, 10, 3, '#e8e8ec'); rect(g, 11, 1, 1, 5, '#b0b0b8'); },
};
function mats(R) {
  if (R._fsM) return R._fsM;
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const m = {
    cheese: L({ color: '#e8c040' }), cheeseRind: L({ color: '#c89830' }), butter: L({ color: '#f4e08a' }), milk: L({ color: '#c8ccd4' }),
    ham: L({ color: '#7a3220' }), fish: L({ color: '#b08a48' }), iron: L({ color: '#3a3a42' }), salt: L({ color: '#f4f6f8' }), brine: L({ color: '#a8c8d8' }),
    ember: L({ color: '#ff7a2a', emissive: '#ff5a10', emissiveIntensity: 0.9 }), board: L({ color: '#6a4222' }), soot: L({ color: '#2e2a26' }),
    awnR: L({ color: '#c04a3a' }), awnW: L({ color: '#f0e6d0' }), cloth: L({ color: '#d8b040' }), meat: L({ color: '#9a3a24' }), stick: L({ color: '#c8a870' }),
    sign: {},
  };
  for (const [k, fn] of Object.entries(ICONS)) {
    const t = canvasTex(16, 12, (g) => { rect(g, 0, 0, 16, 12, '#caa46a'); rect(g, 0, 0, 16, 1, '#6a4222'); rect(g, 0, 11, 16, 1, '#6a4222'); rect(g, 0, 0, 1, 12, '#6a4222'); rect(g, 15, 0, 1, 12, '#6a4222'); for (let i = 0; i < 6; i++) px(g, 1 + ((hsh(i, 3, 7) * 14) | 0), 1 + ((hsh(i, 9, 7) * 10) | 0), '#b8925a'); fn(g); });
    m.sign[k] = L({ map: t });
  }
  R._fsM = m;
  return m;
}
// 軒先の吊り看板（通りに直角な板。両面に絵）
function sign(R, add, face, W_, D_, y, icon, side = 1) {
  const m = mats(R), M = R.mats;
  const along = face[1] !== 0 ? [1, 0] : [0, 1];
  const off = 0.55 * side;
  const x0 = face[0] * (W_ / 2) + along[0] * off, z0 = face[1] * (D_ / 2) + along[1] * off;
  const out = 0.42;
  add(new THREE.BoxGeometry(face[0] ? out : 0.05, 0.05, face[1] ? out : 0.05), M.wood, x0 + face[0] * out / 2, y + 0.24, z0 + face[1] * out / 2);
  add(new THREE.BoxGeometry(face[0] ? 0.4 : 0.05, 0.3, face[1] ? 0.4 : 0.05), m.sign[icon], x0 + face[0] * (out - 0.15), y + 0.04, z0 + face[1] * (out - 0.15));
}
// 煙突の煙（bldgfx.js の煙の仕組みにのせる。kind：kitchen 朝から夜まで・forge 昼の濃い煙・ember 火の粉）
function smoke(R, b, lx, ly, lz, kind) {
  const w = R.sim.S.world;
  const cx = wx(b.x) + (b.w - 1) / 2, cz = wz(b.z) + (b.d - 1) / 2;
  const y = topY(w.hgt[b.door.z * W + b.door.x]);
  R.bgSmoke = R.bgSmoke || new Map();
  R.bgSmoke.set(b.id + ':fs' + kind, { x: cx + lx, y: y + ly, z: cz + lz, kind, seed: hsh(b.x, b.z, 11), hh: b.hh });
}
// 正面に沿った座標：u（横）・v（外向き）→ x, z
const P = (face, u, v) => [face[1] * u + face[0] * v, face[0] * u + face[1] * v];

// ================================================================ 地図の上の形
export function foodBldParts(R, b, add, M, W_, D_, face, door, Hx) {
  const m = mats(R), south = Hx.south;
  const box = (w, h, d) => R.box(w, h, d);
  const cyl = (rt, rb, h, seg = 8) => R.cyl(rt, rb, h, seg);
  const half = face[0] ? W_ / 2 : D_ / 2, side = face[0] ? D_ / 2 : W_ / 2;
  const at = (u, v, y, geo, mat) => { const [x, z] = P(face, u, half + v); add(geo, mat, x, y, z); };
  switch (b.type) {
    case 'dairy': {
      // 白い漆喰の乳酪小屋：藁屋根、戸口の脇に乳の缶と、軒下のチーズ棚
      Hx.houseLike(1.1, south ? M.adobe : M.timber, south ? M.tileRoofS : M.thatch);
      for (const [u, h] of [[-side + 0.3, 0.34], [-side + 0.62, 0.28]]) { at(u, 0.25, h / 2, cyl(0.13, 0.15, h, 8), m.milk); at(u, 0.25, h + 0.02, cyl(0.07, 0.07, 0.05, 6), m.iron); }
      at(side - 0.45, 0.22, 0.28, box(face[0] ? 0.3 : 0.7, 0.05, face[1] ? 0.3 : 0.7), M.wood);
      at(side - 0.45, 0.22, 0.05, box(face[0] ? 0.3 : 0.7, 0.05, face[1] ? 0.3 : 0.7), M.wood);
      for (let i = 0; i < 3; i++) { at(side - 0.7 + i * 0.25, 0.22, 0.35, cyl(0.1, 0.1, 0.09, 10), m.cheese); at(side - 0.6 + i * 0.25, 0.22, 0.12, cyl(0.09, 0.09, 0.08, 10), m.cheeseRind); }
      sign(R, add, face, W_, D_, 0.95, 'cheese', -1);
      smoke(R, b, W_ * 0.25, 1.8, D_ * 0.18, 'kitchen');
      break;
    }
    case 'smokehouse': {
      // すすけた板壁の燻製小屋：高い石の煙突、軒下に吊るした肉と魚、薪の山
      add(box(W_, 1.0, D_), M.planks, 0, 0.5, 0);
      add(box(W_ + 0.1, 0.18, D_ + 0.1), m.soot, 0, 0.92, 0);
      Hx.gable(W_, D_, 1.0, M.slate || M.greyRoof);
      add(box(0.36, 1.6, 0.36), M.darkStone, -W_ * 0.28, 1.2, -D_ * 0.2);
      door(W_, D_);
      // 軒下の吊り棒と燻製
      at(0, 0.28, 0.92, box(face[0] ? 0.04 : W_ * 0.8, 0.04, face[1] ? 0.04 : W_ * 0.8), M.wood);
      for (let i = 0; i < 5; i++) { const u = -W_ * 0.35 + i * W_ * 0.175; if (Math.abs(u) < 0.3) continue; at(u, 0.28, 0.76, box(0.1, 0.22, 0.1), i % 2 ? m.fish : m.ham); }
      for (let k = 0; k < 6; k++) at(-side - 0.25, -0.2 - (k % 3) * 0.2, 0.08 + Math.floor(k / 3) * 0.14, cyl(0.07, 0.07, 0.5, 6).rotateX(Math.PI / 2), M.wood);
      sign(R, add, face, W_, D_, 0.8, 'ham', 1);
      smoke(R, b, -W_ * 0.28, 2.0, -D_ * 0.2, 'forge');
      break;
    }
    case 'saltery': {
      // 石の塩蔵所：戸口の脇に漬け樽の山と塩の袋
      Hx.houseLike(1.1, M.stone, south ? M.tileRoofS : M.tileRoof);
      for (let i = 0; i < 3; i++) at(-side + 0.3 + i * 0.36, 0.25, 0.22, cyl(0.16, 0.16, 0.44, 8), M.wood);
      at(-side + 0.48, 0.25, 0.58, cyl(0.15, 0.15, 0.3, 8), M.wood);
      for (let i = 0; i < 2; i++) at(side - 0.3 - i * 0.3, 0.22, 0.16, cyl(0.13, 0.1, 0.32, 7), m.salt);
      sign(R, add, face, W_, D_, 0.95, 'barrel', 1);
      break;
    }
    case 'saltworks': {
      // 浜の塩焼き小屋：低い小屋と、外の平釜（煮える塩水）、白い塩の山
      add(box(W_ * 0.55, 0.8, D_), M.planks, -W_ * 0.22, 0.4, 0);
      Hx.gable(W_ * 0.55, D_, 0.8, M.thatch);
      for (let i = 0; i < 2; i++) {
        const x = W_ * 0.2 + i * W_ * 0.22;
        add(box(0.6, 0.25, 0.6), M.darkStone, x, 0.12, -D_ * 0.2); add(box(0.62, 0.06, 0.62), m.iron, x, 0.28, -D_ * 0.2); add(box(0.52, 0.02, 0.52), m.brine, x, 0.31, -D_ * 0.2);
        add(box(0.2, 0.1, 0.05), m.ember, x, 0.08, -D_ * 0.2 + 0.31);
        add(new THREE.ConeGeometry(0.22, 0.3, 7), m.salt, x, 0.15, D_ * 0.25);
      }
      door(W_ * 0.55, D_);
      sign(R, add, face, W_, D_, 0.7, 'salt', -1);
      smoke(R, b, W_ * 0.2, 0.45, -D_ * 0.2, 'kitchen');
      break;
    }
    case 'foodstall': {
      // 屋台：4本の柱と縞の日よけ、売り台、炭火の焼き台に並ぶ串
      const w = W_, d = D_;
      for (const [x, z] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) add(box(0.07, 1.25, 0.07), M.wood, x, 0.62, z);
      const n = Math.max(2, Math.round((face[0] ? d : w) / 0.25));
      for (let i = 0; i < n; i++) { const u = -((face[0] ? d : w) / 2) + (i + 0.5) * ((face[0] ? d : w) / n); const [x, z] = P(face, u, 0); add(box(face[0] ? d + 0.2 : (face[0] ? d : w) / n, 0.05, face[1] ? d + 0.2 : (face[0] ? d : w) / n), i % 2 ? m.awnW : m.awnR, face[0] ? 0 : x, 1.27, face[1] ? 0 : z); }
      at(0, -0.15, 0.4, box(face[0] ? 0.35 : w * 0.9, 0.8, face[1] ? 0.35 : w * 0.9), M.planks);
      at(-side * 0.45, -0.15, 0.82, box(0.5, 0.06, 0.28), m.iron);
      at(-side * 0.45, -0.15, 0.86, box(0.42, 0.03, 0.2), m.ember);
      for (let i = 0; i < 4; i++) { at(-side * 0.45 - 0.15 + i * 0.1, -0.15, 0.9, box(0.02, 0.02, 0.3), m.stick); at(-side * 0.45 - 0.15 + i * 0.1, -0.15, 0.91, box(0.05, 0.05, 0.1), m.meat); }
      at(side * 0.35, -0.15, 0.86, cyl(0.1, 0.1, 0.06, 8), M.bread || M.wood);
      at(side * 0.35 + 0.18, -0.15, 0.84, box(0.14, 0.03, 0.1), M.wood);
      sign(R, add, face, W_, D_, 1.05, 'skewer', 1);
      smoke(R, b, ...P(face, -side * 0.45, half - 0.15).map((v, i) => v), 0, 'ember');
      { const [x, z] = P(face, -side * 0.45, half - 0.15); smoke(R, b, x, 1.0, z, 'kitchen'); R.bgSmoke.delete(b.id + ':fsember'); smoke(R, b, x, 0.9, z, 'ember'); }
      break;
    }
    case 'eatery': {
      // 料理屋：二階の張り出した木組みの家、戸口の外に卓と腰掛け、台所の煙突
      Hx.houseLike(1.5, south ? M.adobe : M.timber2, south ? M.tileRoofS : M.tileRoof);
      Hx.windows(W_, D_, 1.1);
      for (const u of [-side + 0.45, side - 0.45]) {
        at(u, 0.45, 0.35, box(0.5, 0.05, 0.4), M.wood); at(u, 0.45, 0.17, box(0.06, 0.34, 0.06), M.wood);
        at(u - 0.3, 0.45, 0.12, box(0.12, 0.24, 0.12), M.wood); at(u + 0.3, 0.45, 0.12, box(0.12, 0.24, 0.12), M.wood);
        at(u, 0.45, 0.4, cyl(0.06, 0.05, 0.05, 7), m.board);
      }
      sign(R, add, face, W_, D_, 1.1, 'bowl', 1);
      smoke(R, b, W_ * 0.25, 2.2, D_ * 0.18, 'kitchen');
      break;
    }
  }
}

// ================================================================ 建物の中
// K は interior.js の Kit、F は家具の道具箱。座標はマス（x:東、z:南）。北(z=0)と西(x=0)が奥の壁。戸口は南の中央
const INTERIOR = {
  // 乳酪小屋：北の壁の熟成棚（チーズは shelfgfx が量に合わせて並べる）、西のチーズ搾り機、東の乳を温める釜と攪乳器
  dairy(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.plaster, beams: true, door: Math.floor(W / 2), win: { N: [], W: [Math.floor(D / 2)], E: [], S: [1, W - 2] } });
    F.openShelf(K, 0.6, 0, Math.min(W - 3.2, 6), 'N', []);                         // 熟成棚
    // 搾り機：台の上の木枠とねじ
    K.box(0.3, 0, 2.6, 1.3, 0.8, 1.0, M.wood); K.box(0.35, 0.8, 2.7, 0.12, 0.9, 0.12, M.darkWood); K.box(1.35, 0.8, 2.7, 0.12, 0.9, 0.12, M.darkWood);
    K.box(0.35, 1.62, 2.7, 1.12, 0.12, 0.12, M.darkWood); K.box(0.85, 1.1, 2.9, 0.1, 0.55, 0.1, M.iron); K.cyl(0.95, 0.8, 3.1, 0.3, 0.2, M.wood, { seg: 10 });
    K.solid(0.3, 2.6, 1.3, 1.0);
    K.slot('work', 2.0, 3.1, { face: [-1, 0] });
    // 乳を温める銅の釜（北東）と火
    K.box(W - 2.2, 0, 0.3, 1.8, 0.5, 1.4, M.stone); K.cyl(W - 1.3, 0.5, 1.0, 0.6, 0.5, M.brass, { seg: 12 }); K.cyl(W - 1.3, 0.95, 1.0, 0.55, 0.04, M.white, { seg: 12 });
    K.box(W - 1.7, 0.1, 1.72, 0.8, 0.3, 0.05, M.fire); K.solid(W - 2.2, 0.3, 1.8, 1.4); K.light(W - 1.3, 0.8, 1.9, '#ff9a40', 2.4, 6, 1.2);
    K.slot('work', W - 1.3, 2.4, { face: [0, -1] });
    // 攪乳器（バターを作る縦長の桶と棒）
    K.cyl(W - 0.8, 0, D - 2.6, 0.28, 0.9, M.wood, { seg: 8 }); K.box(W - 0.83, 0.9, D - 2.63, 0.06, 0.6, 0.06, M.darkWood);
    K.solid(W - 1.1, D - 2.9, 0.6, 0.6);
    F.table(K, 2.8, D - 2.6, 1.8, 0.9);
    K.slot('work', 3.7, D - 1.3, { face: [0, -1] });
    F.torch(K, 'W', 1.5, 1.6);
  },
  // 燻製小屋：中央奥の燻しの炉、天井の梁（吊るした肉と魚は shelfgfx）、作業台、薪の山
  smokehouse(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.dirt, wall: M.darkBrick, h: 2.8, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [] } });
    const cx = W / 2;
    K.box(cx - 0.9, 0, 0.2, 1.8, 0.35, 1.2, M.darkStone); K.box(cx - 0.6, 0.35, 0.4, 1.2, 0.08, 0.8, M.fire); K.box(cx - 0.5, 0.42, 0.5, 1.0, 0.05, 0.6, M.coal || M.fire);
    K.solid(cx - 0.9, 0.2, 1.8, 1.2); K.light(cx, 0.8, 1.0, '#ff7a30', 2.6, 6, 1.4);
    for (let i = 0; i < 4; i++) K.box(cx - 0.8 + i * 0.5, 1.2 + (i % 2) * 0.3, 0.8, 0.35, 0.25, 0.35, M.beam);   // 煙のもや
    for (let z = 1.6; z < D - 1.5; z += 1.3) K.box(0.2, 2.2, z, W - 0.4, 0.1, 0.1, M.darkWood);                   // 梁
    F.table(K, 0.4, D - 3.0, 1.6, 0.9);
    K.slot('work', 1.2, D - 1.8, { face: [0, -1] });
    K.slot('work', cx, 2.2, { face: [0, -1] });
    F.torch(K, 'E', D - 2, 1.5);
  },
  // 塩蔵所：石の床、壁ぎわに漬け樽（数は shelfgfx）、中央の作業台（肉と魚に塩をすり込む）
  saltery(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.stone, wall: M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [Math.floor(W / 2)], W: [], E: [], S: [] } });
    F.table(K, W / 2 - 1.2, 2.6, 2.4, 1.0, { top: M.wood });
    K.box(W / 2 - 1.0, 0.72, 2.8, 0.5, 0.06, 0.4, M.white);   // まいた塩
    K.slot('work', W / 2, 4.1, { face: [0, -1] });
    K.slot('work', W / 2 - 1.6, 3.1, { face: [1, 0] });
    F.torch(K, 'W', 2, 1.6); F.torch(K, 'E', 2, 1.6);
  },
  // 塩焼き小屋：大きな平釜が2つ（煮える塩水）、焚き口、できた塩の置き場
  saltworks(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.sandFloor || M.dirt, wall: M.planks, beams: true, door: Math.floor(W / 2), win: { N: [2, W - 3], W: [], E: [], S: [] } });
    for (let i = 0; i < 2; i++) {
      const x = 1.0 + i * (W / 2), z = 0.6, w = Math.min(2.6, W / 2 - 1.2);
      K.box(x, 0, z, w, 0.45, 1.8, M.darkStone); K.box(x - 0.05, 0.45, z - 0.05, w + 0.1, 0.1, 1.9, M.iron); K.box(x + 0.1, 0.52, z + 0.1, w - 0.2, 0.03, 1.6, M.water);
      K.box(x + w / 2 - 0.4, 0.08, z + 1.82, 0.8, 0.28, 0.05, M.fire); K.solid(x, z, w, 1.8); K.light(x + w / 2, 0.6, z + 2.0, '#ff9a40', 2, 5, 1.3);
      for (let k = 0; k < 3; k++) K.box(x + 0.3 + k * 0.6, 0.9 + (k % 2) * 0.25, z + 0.8, 0.4, 0.2, 0.4, M.beam);   // 湯気
      K.slot('work', x + w / 2, z + 2.6, { face: [0, -1] });
    }
    F.torch(K, 'W', D - 2, 1.5);
  },
  // 屋台：奥に焼き台（炭火）と材料の台、手前に売り台、客の長椅子（eat）
  foodstall(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.plaza || M.stone, wall: M.planks, h: 2.0, door: Math.floor(W / 2), win: { N: [], W: [2, D - 3], E: [2, D - 3], S: [1, W - 2] } });
    // 縞の日よけ（奥の壁から張り出した布。焼き台の上だけ）
    for (let i = 0; i < W; i++) K.box(i, 1.75, 0, 1, 0.05, 0.7, i % 2 ? M.white : M.red, { g: 'N' });
    // 焼き台（炭火）
    K.box(0.6, 0, 0.3, 2.4, 0.8, 0.8, M.darkStone); K.box(0.7, 0.8, 0.4, 2.2, 0.05, 0.6, M.coal || M.fire); K.box(0.7, 0.86, 0.4, 2.2, 0.02, 0.6, M.iron);
    K.solid(0.6, 0.3, 2.4, 0.8); K.light(1.8, 1.0, 1.0, '#ff8a30', 2.2, 5, 1.5);
    K.slot('work', 1.8, 1.7, { face: [0, -1] });
    // 材料の台
    F.table(K, W - 2.6, 0.3, 2.2, 0.8);
    // 売り台（東西に長い）
    K.box(1.0, 0, 2.8, W - 2.0, 0.9, 0.5, M.planks); K.box(0.9, 0.9, 2.75, W - 1.8, 0.06, 0.6, M.wood); K.solid(1.0, 2.8, W - 2.0, 0.5);
    K.slot('work', W / 2, 2.2, { face: [0, 1] });
    // 客の長椅子
    for (let z = 4.2; z < D - 1; z += 1.6) { F.bench(K, 1.0, z, W - 2.0); for (let x = 1.5; x < W - 1; x += 1.0) K.slot('eat', x, z + 0.35, { face: [0, -1] }); }
    F.barrel(K, 0.5, D - 1.0, { h: 0.8 });
  },
  // 料理屋：北に台所（かまど・大鍋・食器棚）、手前に卓と腰掛け（eat）、配膳台
  eatery(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { N: [], W: [Math.floor(D / 2) + 1], E: [Math.floor(D / 2) + 1], S: [1, W - 2] } });
    // かまどと大鍋
    K.box(0.3, 0, 0, 2.4, 0.8, 1.0, M.stone); K.box(0.8, 0.8, 0, 1.4, K.wallH - 0.8, 0.5, M.stone, { g: 'N' });
    K.box(0.8, 0.12, 0.95, 1.2, 0.4, 0.06, M.fire); K.cyl(1.5, 0.8, 0.55, 0.42, 0.45, M.iron, { seg: 10 }); K.cyl(1.5, 1.2, 0.55, 0.38, 0.03, M.bread, { seg: 10 });
    K.solid(0.3, 0, 2.4, 1.0); K.light(1.5, 1.0, 1.4, '#ff9a40', 2.6, 7, 1.2);
    K.slot('work', 1.5, 1.8, { face: [0, -1] });
    // 食器棚（北）と配膳台
    F.shelf(K, 3.2, 0, Math.min(3, W - 4.5), 'N', M.bottles, { h: 1.8 });
    K.box(3.0, 0, 2.0, Math.min(3.6, W - 4.2), 0.95, 0.55, M.wood); K.solid(3.0, 2.0, Math.min(3.6, W - 4.2), 0.55);
    K.slot('work', 4.2, 2.9, { face: [0, -1] });
    // 客の卓
    for (let x = 1; x + 1.6 < W - 0.5; x += 3.2) for (let z = 4.2; z + 1 < D - 1.2; z += 2.6) {
      F.table(K, x, z, 1.6, 0.9);
      for (const [dx, dz, f] of [[0.4, -0.45, [0, 1]], [1.2, -0.45, [0, 1]], [0.4, 1.35, [0, -1]], [1.2, 1.35, [0, -1]]]) { F.stool(K, x + dx, z + dz); K.slot('eat', x + dx, z + dz, { face: f }); }
    }
    F.torch(K, 'W', 3, 1.6); F.torch(K, 'E', 3, 1.6);
  },
};
Object.assign(NEW_INTERIOR, INTERIOR);

// ================================================================ 在庫の3D（shelfgfx.js の SHELF_EXT）
// 品の形：[形, 材質, dx, dy, dz, rx, rz]（dy は底からの高さ）
const HALF = Math.PI / 2;
const SHAPES = {
  cheeseWheel: (L) => [[L.cyl(0.17, 0.12, 0.17, 12), L.M.tint('#e8c040'), 0, 0.06, 0], [L.cyl(0.172, 0.02, 0.172, 12), L.M.tint('#c89830'), 0, 0.11, 0]],
  butterBlock: (L) => [[L.box(0.2, 0.1, 0.13), L.M.tint('#f4e08a'), 0, 0.05, 0], [L.box(0.22, 0.02, 0.15), L.M.tint('#c8b890'), 0, 0.005, 0]],
  hamHang: (L) => [[L.box(0.02, 0.2, 0.02), L.M.rope, 0, 0.1, 0], [L.box(0.15, 0.26, 0.13), L.M.tint('#7a3220'), 0, -0.13, 0], [L.box(0.03, 0.08, 0.03), L.M.bone, 0, -0.3, 0]],
  fishHang2: (L) => [[L.box(0.02, 0.16, 0.02), L.M.rope, 0, 0.08, 0], [L.box(0.05, 0.3, 0.11), L.M.tint('#b08a48'), 0, -0.15, 0], [L.box(0.05, 0.06, 0.15), L.M.tint('#8a6a30'), 0, -0.33, 0]],
  pickleBarrel: (L) => [[L.cyl(0.26, 0.62, 0.26, 8), L.M.wood, 0, 0.31, 0], [L.cyl(0.27, 0.04, 0.27, 8), L.M.iron, 0, 0.12, 0], [L.cyl(0.27, 0.04, 0.27, 8), L.M.iron, 0, 0.5, 0], [L.cyl(0.22, 0.02, 0.22, 8), L.M.tint('#f4f6f8'), 0, 0.62, 0]],
  saltSack: (L) => [[L.cyl(0.2, 0.4, 0.16, 7), L.M.tint('#e8e4d8'), 0, 0.2, 0], [L.cyl(0.06, 0.06, 0.06, 5), L.M.rope, 0, 0.43, 0]],
  saltHeap: (L) => [[L.cyl(0.3, 0.28, 0.02, 8), L.M.tint('#f6f8fa'), 0, 0.14, 0]],
  milkPail: (L) => [[L.cyl(0.14, 0.3, 0.12, 8), L.M.tint('#b8bcc4'), 0, 0.15, 0], [L.cyl(0.12, 0.01, 0.12, 8), L.M.white, 0, 0.3, 0]],
  rawMeat: (L) => [[L.box(0.24, 0.1, 0.15), L.M.tint('#b8504a'), 0, 0.05, 0]],
  rawFish: (L) => [[L.box(0.3, 0.05, 0.09), L.M.tint('#9ab0c0'), 0, 0.025, 0], [L.box(0.06, 0.05, 0.12), L.M.tint('#9ab0c0'), 0.17, 0.025, 0]],
  skewerDish: (L, c) => [[L.box(0.3, 0.02, 0.02), L.M.tint('#c8a870'), 0, 0.03, 0], [L.box(0.06, 0.06, 0.06), L.M.tint(c || '#9a3a24'), -0.07, 0.04, 0], [L.box(0.06, 0.06, 0.06), L.M.tint(c || '#9a3a24'), 0.03, 0.04, 0]],
  pieDish: (L) => [[L.cyl(0.14, 0.07, 0.14, 10), L.M.tint('#d8a050'), 0, 0.035, 0], [L.cyl(0.1, 0.01, 0.1, 10), L.M.tint('#c08040'), 0, 0.075, 0]],
  stewPot: (L, c) => [[L.cyl(0.16, 0.16, 0.13, 9), L.M.tint('#3a3a42'), 0, 0.08, 0], [L.cyl(0.15, 0.01, 0.15, 9), L.M.tint(c || '#a0502a'), 0, 0.16, 0]],
  bowlDish: (L, c) => [[L.cyl(0.05, 0.06, 0.08, 8), L.M.tint('#8a5a3a'), 0, 0.03, 0], [L.cyl(0.075, 0.01, 0.075, 8), L.M.tint(c || '#c8a060'), 0, 0.06, 0]],
};
Object.assign(SHELF_EXT.shape, SHAPES);
Object.assign(SHELF_EXT.kind, {
  cheese: ['cheeseWheel'], butter: ['butterBlock'], meat_smoked: ['hamHang'], smokedfish_fish: ['fishHang2'], meat_salted: ['pickleBarrel'], saltfish_fish: ['pickleBarrel'],
  salt: ['saltSack'], milk: ['milkPail'], meat_skewer: ['skewerDish'], grilled_fish: ['skewerDish', '#b89a60'], pie_meat: ['pieDish'],
  stew_meat: ['stewPot'], fishstew_fish: ['stewPot', '#c8b890'], porridge_wheat: ['bowlDish'],
});
// 量 → 見える数（0なら空、1〜5は1つずつ、6〜20は半分、21以上は満杯）
const shown = (q, cap) => (q < 0.3 ? 0 : q < 6 ? Math.min(cap, Math.ceil(q)) : q < 21 ? Math.min(cap, Math.ceil(cap * 0.6)) : cap);
function row(list, kind, color, n, x0, z0, dx, dz, y = 0, ry = 0) { for (let i = 0; i < n; i++) list.push({ kind, color, x: x0 + dx * i, y, z: z0 + dz * i, ry }); }
Object.assign(SHELF_EXT.layout, {
  dairy(K, d, list, H) {
    const { W, D } = K;
    // 熟成棚（北）：チーズとバター
    const goods = H.sortGoods(d.out, (g) => g === 'cheese' || g === 'butter');
    H.fillShelf(list, { x: 0.6, z: 0.02, len: Math.min(W - 3.2, 6), side: 'N' }, goods);
    // 乳の缶（材料の乳の量）と塩の袋
    row(list, 'milkPail', null, shown(d.mats.milk || 0, 6), W - 2.4, D - 1.0, 0.36, 0);
    row(list, 'saltSack', null, shown((d.mats.salt || 0) * 10, 2), 0.6, D - 0.8, 0.5, 0);
    // 搾り機の横の台：できたての輪
    row(list, 'cheeseWheel', null, Math.min(3, Math.floor((d.out.cheese || 0) / 4)), 2.95, D - 2.3, 0.4, 0, 0.72);
  },
  smokehouse(K, d, list) {
    const { W, D } = K;
    // 梁に吊るす（梁は z=1.6 から 1.3 おき、高さ 2.2）
    const beams = []; for (let z = 1.6; z < D - 1.5; z += 1.3) beams.push(z);
    const per = Math.floor((W - 0.8) / 0.35);
    let slot = 0;
    const hang = (kind, n) => { for (let i = 0; i < n && slot < per * beams.length; i++, slot++) { const bz = beams[slot % beams.length], k = Math.floor(slot / beams.length); list.push({ kind, x: 0.5 + k * 0.35, y: 2.2, z: bz + 0.05, ry: 0 }); } };
    hang('hamHang', shown(d.out.meat_smoked || 0, 14));
    hang('fishHang2', shown(d.out.smokedfish_fish || 0, 14));
    // 作業台の生の肉と魚
    row(list, 'rawMeat', null, shown(d.mats.meat || 0, 3), 0.7, D - 2.7, 0.4, 0, 0.72);
    row(list, 'rawFish', null, shown(d.mats.fish || 0, 3), 0.8, D - 2.4, 0.4, 0, 0.72);
    // 薪の山（東の壁ぞい）
    const wood = d.mats.wood || 0;
    for (let i = 0; i < Math.min(12, Math.ceil(wood * 4)); i++) list.push({ kind: 'log', x: W - 0.5, y: Math.floor(i / 4) * 0.12, z: 1.2 + (i % 4) * 0.14, ry: HALF, sx: 1 });
  },
  saltery(K, d, list) {
    const { W, D } = K;
    // 漬け樽：西と東の壁ぞい（塩漬けの肉・魚の量）
    const nm = shown(d.out.meat_salted || 0, 6), nf = shown(d.out.saltfish_fish || 0, 6);
    row(list, 'pickleBarrel', null, nm, 0.45, 1.0, 0, 0.6);
    row(list, 'pickleBarrel', null, nf, W - 0.45, 1.0, 0, 0.6);
    // 塩の袋（材料の塩）
    row(list, 'saltSack', null, shown((d.mats.salt || 0) * 2, 5), W / 2 - 1.0, D - 0.7, 0.45, 0);
    // 作業台の肉と魚
    row(list, 'rawMeat', null, shown(d.mats.meat || 0, 2), W / 2 - 0.2, 2.9, 0.35, 0, 0.72);
    row(list, 'rawFish', null, shown(d.mats.fish || 0, 2), W / 2 + 0.5, 2.9, 0.3, 0, 0.72);
  },
  saltworks(K, d, list) {
    const { W, D } = K;
    // できた塩：南の壁ぞいに山と袋
    const q = d.out.salt || 0;
    row(list, 'saltHeap', null, shown(q, 4), 0.8, D - 1.3, 0.8, 0);
    row(list, 'saltSack', null, Math.max(0, shown(q, 8) - 4), W - 0.6, D - 3.5, 0, 0.5);
    for (let i = 0; i < Math.min(10, Math.ceil((d.mats.wood || 0) * 4)); i++) list.push({ kind: 'log', x: W - 0.5, y: Math.floor(i / 5) * 0.12, z: 3.0 + (i % 5) * 0.14, ry: HALF, sx: 1 });
  },
  foodstall(K, d, list) {
    const { W } = K;
    // 焼き台の串（できている料理の数）と、売り台に並べた皿
    const sk = (d.out.meat_skewer || 0) + (d.out.grilled_fish || 0);
    row(list, 'skewerDish', null, shown(d.out.meat_skewer || 0, 6), 0.9, 0.55, 0.3, 0, 0.88, HALF);
    row(list, 'skewerDish', '#b89a60', shown(d.out.grilled_fish || 0, 5), 0.95, 0.9, 0.3, 0, 0.88, HALF);
    row(list, 'pieDish', null, shown(d.out.pie_meat || 0, 5), 1.4, 3.05, 0.4, 0, 0.96);
    row(list, 'skewerDish', null, Math.min(4, Math.floor(sk / 2)), W / 2, 3.05, 0.35, 0, 0.96);
    // 材料の台：肉・魚・パン
    row(list, 'rawMeat', null, shown(d.mats.meat || 0, 2), W - 2.4, 0.55, 0.35, 0, 0.72);
    row(list, 'rawFish', null, shown(d.mats.fish || 0, 2), W - 1.6, 0.55, 0.35, 0, 0.72);
    row(list, 'bun', null, shown(d.mats.bread || 0, 3), W - 2.2, 0.85, 0.3, 0, 0.72);
  },
  eatery(K, d, list) {
    const { W } = K;
    // 配膳台：鍋（煮込み）と椀（麦粥）
    row(list, 'stewPot', null, shown(d.out.stew_meat || 0, 3), 3.3, 2.25, 0.45, 0, 0.95);
    row(list, 'stewPot', '#c8b890', shown(d.out.fishstew_fish || 0, 3), 3.3 + 1.4, 2.25, 0.45, 0, 0.95);
    row(list, 'bowlDish', null, shown(d.out.porridge_wheat || 0, 6), 3.2, 2.45, 0.25, 0, 0.95);
    // 台所の材料
    row(list, 'sackT', null, shown((d.mats.wheat || 0) / 2, 3), 0.5, 1.9, 0, 0.55);
    row(list, 'rawMeat', null, shown(d.mats.meat || 0, 2), Math.min(W - 1, 6.2), 2.25, 0.3, 0, 0.95);
    row(list, 'rawFish', null, shown(d.mats.fish || 0, 2), Math.min(W - 1, 6.2), 2.45, 0.3, 0, 0.95);
  },
});
