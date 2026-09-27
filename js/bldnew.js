// 町の暮らしを支える建物の見た目（開発部）
//
// 地図の上の形（render.js の buildingParts から）と、建物の中（interior.js の InteriorView から）を描く。
// 建物の種類：inn 宿屋（旅籠）・bathhouse 公衆浴場・library 図書館・theater 劇場・tailorshop 仕立て屋・apothecary 薬屋・
//            genstore よろず屋・granary 穀物倉・orphanage 孤児院・cemetery 墓地
// 看板：グラフィック部の drawSign（js/bldgfx.js）を使う（寝台 bed・本 book・麦 wheat）。まだ絵がない印（湯桶 bath・仮面 masks・はさみ scissors・
//       薬瓶 bottle・袋 sack・子ども child）は、このファイルの板で代わりに描く。bldgfx.js の SIGN_KINDS に同じ名前が足されれば自動でそちらに切り替わる。
//
// 本体からの呼び方（小さな差し込みだけ）
//   render.js   buildingParts の民族の家の行のあと … if (BN.NEW_TYPES.has(b.type)) { BN.newBldParts(this, b, add, M, W_, D_, face, door, { houseLike, gable, windows, banner, flat, south, kcol }); return parts; }
//   interior.js sizeOf の頭 … const nz = BN.bldInteriorSize(b); if (nz) return nz;
//               内装づくり … (BUILD[type] || BN.NEW_INTERIOR[type] || BUILD.house)(K, ctx, F)   （新しい建物には F を渡す）
//               kindFor の行動の分かれ目の前 … const nk = BN.newKindFor(this.b.type, e); if (nk) return nk;
//               クラスのあと … Object.assign(InteriorView.FALLBACK, BN.NEW_FALLBACK); Object.assign(LABEL, BN.NEW_LABEL);
import * as THREE from 'three';
import { canvasTex } from './textures.js';
import * as BG from './bldgfx.js'; // グラフィック部の看板（あればこちらを使う）
import { KINGDOMS } from './data.js';
import { innPlan, bldInteriorSize, cemeteryGraves, orphanCount } from './buildings.js';
export { bldInteriorSize };

export const NEW_TYPES = new Set(['inn', 'bathhouse', 'library', 'theater', 'tailorshop', 'apothecary', 'genstore', 'granary', 'orphanage', 'cemetery']);
export const NEW_LABEL = {
  inn: '宿屋の客室', bathhouse: '公衆浴場の湯殿', library: '図書館の閲覧室', theater: '劇場の客席と舞台', tailorshop: '仕立て屋の店先', apothecary: '薬屋の店先',
  genstore: 'よろず屋の店先', granary: '穀物倉の中', orphanage: '孤児院の大部屋', cemetery: '墓地',
};
const hsh = (a, b, s = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 982451653); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ================================================================ 看板の印（16×12 のドット絵）
const ICONS = {
  bed(g) { rect(g, 3, 5, 10, 3, '#f2eee4'); rect(g, 3, 4, 3, 2, '#ffffff'); rect(g, 6, 4, 7, 2, '#b8323a'); rect(g, 2, 3, 1, 6, '#6a4222'); rect(g, 13, 5, 1, 4, '#6a4222'); px(g, 12, 1, '#ffe070'); px(g, 11, 2, '#ffe070'); px(g, 12, 2, '#ffe070'); },
  bath(g) { rect(g, 3, 6, 10, 4, '#8a5a32'); rect(g, 3, 6, 10, 1, '#5aa8e0'); rect(g, 4, 9, 1, 1, '#5a3a22'); rect(g, 11, 9, 1, 1, '#5a3a22'); for (const x of [5, 8, 11]) { px(g, x, 4, '#e8f0f8'); px(g, x - 1, 3, '#e8f0f8'); px(g, x, 2, '#e8f0f8'); } },
  book(g) { rect(g, 2, 3, 6, 7, '#f2eee4'); rect(g, 8, 3, 6, 7, '#f2eee4'); rect(g, 7, 3, 2, 8, '#6a2a2a'); for (let y = 5; y < 9; y += 2) { rect(g, 3, y, 4, 1, '#8a7a6a'); rect(g, 9, y, 4, 1, '#8a7a6a'); } rect(g, 2, 10, 12, 1, '#6a2a2a'); },
  masks(g) { rect(g, 2, 2, 6, 7, '#f2e6a0'); px(g, 3, 4, '#222'); px(g, 6, 4, '#222'); rect(g, 3, 6, 4, 1, '#222'); px(g, 3, 5, '#222'); px(g, 6, 5, '#222'); rect(g, 8, 4, 6, 7, '#8ab0e8'); px(g, 9, 6, '#222'); px(g, 12, 6, '#222'); rect(g, 10, 9, 2, 1, '#222'); px(g, 9, 10, '#222'); px(g, 12, 10, '#222'); },
  scissors(g) { rect(g, 3, 2, 2, 2, '#c0c8d0'); rect(g, 11, 2, 2, 2, '#c0c8d0'); for (let i = 0; i < 6; i++) { px(g, 4 + i, 3 + i, '#d8e0e8'); px(g, 11 - i, 3 + i, '#d8e0e8'); } rect(g, 2, 9, 3, 3, '#b8323a'); rect(g, 11, 9, 3, 3, '#b8323a'); px(g, 3, 10, '#6a4222'); px(g, 12, 10, '#6a4222'); },
  bottle(g) { rect(g, 7, 1, 2, 2, '#8a5a32'); rect(g, 6, 3, 4, 1, '#c8e8d0'); rect(g, 4, 4, 8, 7, '#c8e8d0'); rect(g, 5, 6, 6, 4, '#3aa85a'); px(g, 5, 5, '#ffffff'); rect(g, 4, 11, 8, 1, '#6a8a70'); },
  sack(g) { rect(g, 3, 4, 7, 7, '#c8a870'); rect(g, 4, 2, 5, 2, '#b89860'); rect(g, 5, 3, 3, 1, '#6a4222'); rect(g, 10, 6, 4, 5, '#8a5a32'); rect(g, 10, 7, 4, 1, '#4a4a52'); rect(g, 10, 9, 4, 1, '#4a4a52'); },
  wheat(g) { for (let i = 0; i < 3; i++) { const x = 5 + i * 3; rect(g, x, 6, 1, 6, '#b89830'); for (let k = 0; k < 3; k++) { px(g, x - 1, 1 + k * 2, '#e8c040'); px(g, x + 1, 2 + k * 2, '#e8c040'); px(g, x, 1 + k * 2, '#f0d060'); } } rect(g, 4, 8, 9, 1, '#8a5a32'); },
  child(g) { rect(g, 6, 1, 4, 4, '#e8c0a0'); rect(g, 6, 1, 4, 1, '#6a4222'); rect(g, 5, 5, 6, 4, '#3a6ab8'); rect(g, 4, 6, 1, 2, '#e8c0a0'); rect(g, 11, 6, 1, 2, '#e8c0a0'); rect(g, 6, 9, 1, 3, '#5a3a22'); rect(g, 9, 9, 1, 3, '#5a3a22'); px(g, 13, 2, '#e04a6a'); px(g, 14, 2, '#e04a6a'); px(g, 12, 2, '#e04a6a'); px(g, 13, 3, '#e04a6a'); },
};
function mats(R) {
  if (R._bldNewM) return R._bldNewM;
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const m = {
    grass: L({ color: '#4f8a3a' }), mound: L({ color: '#6a5238' }), grave: L({ color: '#9a9aa0' }), yew: L({ color: '#23502c' }),
    plaster: L({ color: '#e8dcc0' }), steam: L({ color: '#f4f6f8', transparent: true, opacity: 0.75 }), water: L({ color: '#4a98d8' }),
    green: L({ color: '#3a7a4a' }), blue: L({ color: '#3a5ab0' }), board: L({ color: '#6a4222' }), iron: L({ color: '#3a3a42' }), clothR: L({ color: '#c04a3a' }), clothB: L({ color: '#3a6ab8' }), clothY: L({ color: '#d8b040' }),
    hay: L({ color: '#d8c070' }), stoneFoot: L({ color: '#8a8580' }), pinkRoof: L({ color: '#b86a5a', side: THREE.DoubleSide }),
    sign: {},
  };
  for (const [k, fn] of Object.entries(ICONS)) {
    const t = canvasTex(16, 12, (g) => { rect(g, 0, 0, 16, 12, '#caa46a'); rect(g, 0, 0, 16, 1, '#6a4222'); rect(g, 0, 11, 16, 1, '#6a4222'); rect(g, 0, 0, 1, 12, '#6a4222'); rect(g, 15, 0, 1, 12, '#6a4222'); for (let i = 0; i < 6; i++) px(g, 1 + ((hsh(i, 3, 7) * 14) | 0), 1 + ((hsh(i, 9, 7) * 10) | 0), '#b8925a'); fn(g); });
    m.sign[k] = L({ map: t });
  }
  R._bldNewM = m;
  return m;
}
// 看板（グラフィック部の看板に絵がないときの代わり）：扉の脇の壁から腕木を出し、板を吊るす。板は通りと直角（通りの両側から読める）
export function drawSign(R, add, face, W_, D_, y, icon, side = 1) {
  const m = mats(R), M = R.mats;
  const along = face[1] !== 0 ? [1, 0] : [0, 1];              // 壁に沿う向き
  const off = 0.55 * side;
  const wx = face[0] * (W_ / 2) + along[0] * off, wz = face[1] * (D_ / 2) + along[1] * off;
  const out = 0.42;
  // 腕木
  add(new THREE.BoxGeometry(face[0] ? out : 0.05, 0.05, face[1] ? out : 0.05), M.wood, wx + face[0] * out / 2, y + 0.24, wz + face[1] * out / 2);
  // 板（通りに直角な面に印）
  const g = new THREE.BoxGeometry(face[0] ? 0.4 : 0.05, 0.3, face[1] ? 0.4 : 0.05);
  add(g, m.sign[icon] || m.board, wx + face[0] * (out - 0.15), y + 0.04, wz + face[1] * (out - 0.15));
}

// ================================================================ 地図の上の形
export function newBldParts(R, b, add, M, W_, D_, face, door, H) {
  const m = mats(R), south = H.south;
  // 看板：グラフィック部の看板（js/bldgfx.js）にその絵があればそれを、なければこのファイルの絵を使う
  const sign = (kind, y, side = 1, w = W_, d = D_) => {
    if (BG.SIGN_KINDS?.includes(kind)) { const tmp = []; BG.drawSign(tmp, b, kind, { y, side }); for (const o of tmp) add(o.g, o.mat, 0, 0, 0); }
    else drawSign(R, add, face, w, d, y, kind, side);
  };
  const box = (w, h, d) => R.box(w, h, d);
  switch (b.type) {
    case 'inn': {
      if (south) {
        // 隊商宿（キャラバンサライ）：中庭を囲む砂岩の壁、アーチの門、四隅の小塔
        const hw = W_ / 2, hd = D_ / 2;
        add(box(W_, 1.3, 0.35), M.sandstone, 0, 0.65, -hd + 0.17); add(box(W_, 1.3, 0.35), M.sandstone, 0, 0.65, hd - 0.17);
        add(box(0.35, 1.3, D_), M.sandstone, -hw + 0.17, 0.65, 0); add(box(0.35, 1.3, D_), M.sandstone, hw - 0.17, 0.65, 0);
        add(box(W_ - 0.7, 0.9, D_ * 0.35), M.adobe, 0, 0.45, -hd + D_ * 0.2);
        add(box(W_ - 0.6, 0.1, D_ * 0.4), M.flatRoof, 0, 0.95, -hd + D_ * 0.2);
        for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) { add(R.cyl(0.3, 0.34, 1.8, 8), M.sandstone, x + Math.sign(-x) * 0.2, 0.9, z + Math.sign(-z) * 0.2); add(R.cone(0.36, 0.4, 8), M.tileRoofS, x + Math.sign(-x) * 0.2, 2.0, z + Math.sign(-z) * 0.2); }
        add(box(face[0] ? 0.12 : 0.9, 1.0, face[1] ? 0.12 : 0.9), M.black, face[0] * (hw + 0.01), 0.5, face[1] * (hd + 0.01));
        add(box(0.5, 0.25, 0.5), M.fire, 0.4, 0.12, 0.2);   // 中庭の炊き火
        sign('bed', 1.15);
      } else {
        // 二階建ての旅籠：木組みの壁、張り出した二階、脇に馬小屋
        H.houseLike(1.9, M.timber, M.tileRoof);
        add(box(W_ + 0.16, 0.12, D_ + 0.16), M.wood, 0, 1.0, 0);
        H.windows(W_, D_, 1.45);
        const sx = face[1] !== 0 ? 1 : 0, sz = face[0] !== 0 ? 1 : 0;
        const lx = sx * (W_ / 2 + 0.45), lz = sz * (D_ / 2 + 0.45);
        add(box(sx ? 0.8 : W_ * 0.6, 0.75, sz ? 0.8 : D_ * 0.6), M.planks, lx, 0.37, lz);
        add(box(sx ? 0.95 : W_ * 0.65, 0.08, sz ? 0.95 : D_ * 0.65), M.thatch, lx, 0.8, lz);
        add(box(sx ? 0.4 : 0.5, 0.25, sz ? 0.4 : 0.5), m.hay, lx + face[0] * 0.2, 0.12, lz + face[1] * 0.2);
        add(box(0.12, 0.2, 0.12), M.lamp, face[0] * (W_ / 2 + 0.1) - (face[1] ? 0.5 : 0), 0.85, face[1] * (D_ / 2 + 0.1) - (face[0] ? 0.5 : 0));
        sign('bed', 1.25);
      }
      break;
    }
    case 'bathhouse': {
      if (south) {
        add(box(W_, 1.2, D_), M.sandstone, 0, 0.6, 0);
        add(box(W_ + 0.1, 0.1, D_ + 0.1), M.flatRoof, 0, 1.25, 0);
        add(new THREE.SphereGeometry(Math.min(W_, D_) * 0.38, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.dome, 0, 1.3, 0);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; add(box(0.1, 0.06, 0.1), M.win, Math.cos(a) * 0.5, 1.62, Math.sin(a) * 0.5); }
      } else {
        H.houseLike(1.3, M.stone, M.tileRoof);
      }
      add(box(0.3, 0.9, 0.3), M.darkStone, -W_ * 0.3, 1.9, -D_ * 0.2);
      for (let i = 0; i < 3; i++) add(box(0.22 + i * 0.06, 0.16, 0.22 + i * 0.06), m.steam, -W_ * 0.3 + i * 0.07, 2.45 + i * 0.22, -D_ * 0.2 - i * 0.05);
      sign('bath', 0.95);
      break;
    }
    case 'library': {
      const wall = south ? M.sandstone : M.stone;
      add(box(W_, 1.9, D_), wall, 0, 0.95, 0);
      H.gable(W_, D_, 1.9, south ? M.tileRoofS : M.slate);
      for (const s of [-1, 1]) for (let i = 0; i < Math.floor(W_); i++) add(box(0.2, 0.6, 0.05), M.win, -W_ / 2 + 0.5 + i, 1.1, s * (D_ / 2 + 0.01));
      door(W_, D_, 0.8);
      add(box(face[0] ? 0.08 : W_ * 0.5, 0.12, face[1] ? 0.08 : D_ * 0.5), M.gold, face[0] * (W_ / 2 + 0.03), 1.6, face[1] * (D_ / 2 + 0.03));
      sign('book', 1.05);
      break;
    }
    case 'theater': {
      // 丸い芝居小屋：八角形の木組みの壁、円錐の屋根、旗
      const r = Math.min(W_, D_) / 2;
      add(R.cyl(r, r, 1.6, 8), south ? M.adobe : M.timber, 0, 0.8, 0);
      add(R.cone(r + 0.3, 1.3, 8), south ? M.tileRoofS : M.thatch, 0, 2.25, 0);
      add(box(0.06, 1.0, 0.06), M.wood, 0, 3.3, 0);
      add(new THREE.PlaneGeometry(0.55, 0.35), m.clothR, 0.3, 3.6, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; add(box(0.3, 0.2, 0.05), M.win, Math.sin(a) * (r + 0.01), 1.2, Math.cos(a) * (r + 0.01), a); }
      door(r * 2, r * 2, 0.8);
      sign('masks', 1.1, 1, r * 2, r * 2);
      break;
    }
    case 'tailorshop': {
      H.houseLike(1.15, M.timber2, M.thatch);
      add(box(face[0] ? 0.5 : W_ * 0.8, 0.05, face[1] ? 0.5 : D_ * 0.8), M.awning2, face[0] * (W_ / 2 + 0.25), 0.95, face[1] * (D_ / 2 + 0.25));
      for (let i = 0; i < 3; i++) add(R.cyl(0.07, 0.07, 0.4, 6), [m.clothR, m.clothB, m.clothY][i], face[0] * (W_ / 2 + 0.15) + (face[1] ? -0.5 + i * 0.2 : 0), 0.3, face[1] * (D_ / 2 + 0.15) + (face[0] ? -0.5 + i * 0.2 : 0));
      sign('scissors', 0.95, -1);
      break;
    }
    case 'apothecary': {
      H.houseLike(1.15, M.timber, south ? M.tileRoofS : M.slate);
      add(box(face[0] ? 0.5 : W_ * 0.8, 0.05, face[1] ? 0.5 : D_ * 0.8), m.green, face[0] * (W_ / 2 + 0.25), 0.95, face[1] * (D_ / 2 + 0.25));
      for (let i = 0; i < 4; i++) add(box(0.08, 0.2, 0.08), i % 2 ? m.green : M.gold, face[0] * (W_ / 2 + 0.05) + (face[1] ? -0.55 + i * 0.12 : 0), 0.85, face[1] * (D_ / 2 + 0.05) + (face[0] ? -0.55 + i * 0.12 : 0));
      sign('bottle', 0.95, -1);
      break;
    }
    case 'genstore': {
      H.houseLike(1.15, M.timber, M.thatch);
      const fx = face[0] * (W_ / 2 + 0.3), fz = face[1] * (D_ / 2 + 0.3), ax = face[1] ? 1 : 0, az = face[0] ? 1 : 0;
      add(R.cyl(0.18, 0.18, 0.4, 8), M.wood, fx + ax * 0.9, 0.2, fz + az * 0.9);
      add(box(0.32, 0.32, 0.32), M.planks, fx - ax * 0.9, 0.16, fz - az * 0.9);
      add(box(0.3, 0.3, 0.25), m.hay, fx + ax * 0.5, 0.15, fz + az * 0.5);
      sign('sack', 0.95, -1);
      break;
    }
    case 'granary': {
      // 石の足の上に建つ倉（ねずみ除け）
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { add(R.cyl(0.1, 0.14, 0.35, 6), m.stoneFoot, x * (W_ / 2 - 0.25), 0.17, z * (D_ / 2 - 0.25)); add(R.cyl(0.2, 0.2, 0.06, 8), m.stoneFoot, x * (W_ / 2 - 0.25), 0.37, z * (D_ / 2 - 0.25)); }
      add(box(W_, 0.95, D_), south ? M.adobe : M.planks, 0, 0.88, 0);
      H.gable(W_, D_, 1.35, south ? M.tileRoofS : M.thatch);
      add(box(face[0] ? 0.08 : 0.5, 0.55, face[1] ? 0.08 : 0.5), M.door, face[0] * (W_ / 2 + 0.02), 0.75, face[1] * (D_ / 2 + 0.02));
      add(box(face[0] ? 0.5 : 0.4, 0.06, face[1] ? 0.5 : 0.4), M.wood, face[0] * (W_ / 2 + 0.25), 0.3, face[1] * (D_ / 2 + 0.25));   // はしご段
      sign('wheat', 1.0);
      break;
    }
    case 'orphanage': {
      H.houseLike(1.8, south ? M.adobe : M.timber2, south ? M.tileRoofS : M.tileRoof);
      H.windows(W_, D_, 1.35);
      add(box(0.3, 0.35, 0.3), M.wood, W_ * 0.3, 2.75, 0); add(R.cyl(0.1, 0.14, 0.18, 8), M.gold, W_ * 0.3, 2.62, 0);   // 小さな鐘楼
      // 前庭の低い柵
      const fx = face[0] * (W_ / 2 + 0.6), fz = face[1] * (D_ / 2 + 0.6);
      add(box(face[0] ? 0.05 : W_ * 0.4, 0.3, face[1] ? 0.05 : D_ * 0.4), M.wood, fx + (face[1] ? -W_ * 0.28 : 0), 0.15, fz + (face[0] ? -D_ * 0.28 : 0));
      sign('child', 1.1);
      break;
    }
    case 'cemetery': {
      // 低い石垣に囲まれた墓地。墓石と十字、奥に納骨堂、いちいの木
      const hw = b.w / 2 - 0.1, hd = b.d / 2 - 0.1;
      add(box(b.w - 0.3, 0.03, b.d - 0.3), m.grass, 0, 0.015, 0);
      const gate = face;
      const seg = (x, z, w, d) => add(box(w, 0.35, d), M.stone, x, 0.17, z);
      if (gate[1] !== 1) seg(0, hd, b.w - 0.2, 0.15); else { seg(-hw / 2 - 0.35, hd, hw - 0.5, 0.15); seg(hw / 2 + 0.35, hd, hw - 0.5, 0.15); }
      if (gate[1] !== -1) seg(0, -hd, b.w - 0.2, 0.15); else { seg(-hw / 2 - 0.35, -hd, hw - 0.5, 0.15); seg(hw / 2 + 0.35, -hd, hw - 0.5, 0.15); }
      if (gate[0] !== 1) seg(hw, 0, 0.15, b.d - 0.2); else { seg(hw, -hd / 2 - 0.35, 0.15, hd - 0.5); seg(hw, hd / 2 + 0.35, 0.15, hd - 0.5); }
      if (gate[0] !== -1) seg(-hw, 0, 0.15, b.d - 0.2); else { seg(-hw, -hd / 2 - 0.35, 0.15, hd - 0.5); seg(-hw, hd / 2 + 0.35, 0.15, hd - 0.5); }
      let k = 0;
      for (let z = -hd + 0.6; z < hd - 0.4; z += 0.7) for (let x = -hw + 0.8; x < hw - 0.3; x += 0.6) {
        if (hsh(b.id, k++, 5) < 0.25) continue;
        if (hsh(b.id, k, 6) < 0.3) { add(box(0.06, 0.4, 0.06), m.grave, x, 0.2, z); add(box(0.22, 0.06, 0.06), m.grave, x, 0.3, z); }
        else add(box(0.2, 0.3, 0.07), m.grave, x, 0.15, z);
        add(box(0.22, 0.05, 0.4), m.mound, x, 0.03, z + 0.2);
      }
      // 納骨堂と十字
      add(box(0.9, 0.8, 0.7), M.stone, -hw + 0.6, 0.4, -hd + 0.5); add(R.prism(1.1, 0.9, 0.45), M.greyRoof, -hw + 0.6, 0.8, -hd + 0.5);
      add(box(0.06, 0.35, 0.06), M.gold, -hw + 0.6, 1.5, -hd + 0.5);
      add(box(0.06, 0.8, 0.06), M.wood, hw - 0.5, 0.4, -hd + 0.5); add(R.cone(0.35, 1.1, 6), m.yew, hw - 0.5, 1.2, -hd + 0.5);
      break;
    }
  }
}

// ================================================================ 建物の中
// K は interior.js の Kit、F は家具の道具箱。座標はマス（x:東、z:南）。北(z=0)と西(x=0)が奥の壁
function partition(K, x0, z0, x1, z1, mat, h = 1.6) {
  const w = Math.max(0.1, x1 - x0), d = Math.max(0.1, z1 - z0);
  K.box(x0, 0, z0, w, h, d, mat);
}
export const NEW_INTERIOR = {
  // 宿屋：北（と南）に並ぶ客室、廊下、手前は帳場と食堂
  inn(K, ctx, F) {
    const { M, R, W, D } = K;
    const south = ctx.b.kingdom === 2;
    const plan = innPlan(W, D);
    F.room(K, { floor: south ? M.sandFloor : M.planks, wall: south ? M.sandstone : M.timber2, beams: !south, door: Math.floor(W / 2), win: { N: plan.rooms.filter((r) => r.row === 0).map((r) => r.x + 1), W: [plan.hallZ + 1], E: [plan.hallZ + 1], S: [1, W - 2] } });
    const wallM = south ? M.sandstone : M.plaster;
    const blankets = [M.red, M.blue, M.green, M.purple, M.orange];
    // 部屋の壁と戸口
    for (const r of plan.rooms) {
      const fz = r.row === 0 ? 3 : 5;       // 廊下側の壁の列
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x === r.door) { K.box(x, 1.7, fz + 0.44, 1, 0.3, 0.12, M.darkWood); continue; }
        K.box(x, 0, fz + 0.44, 1, 1.6, 0.12, wallM); K.solid(x, fz, 1, 1);
      }
      if (r.x > 0) partition(K, r.x - 0.06, r.z, r.x + 0.06, r.z + 3, wallM);
      // 戸口の上の部屋の札
      K.box(r.door + 0.3, 1.25, fz + (r.row === 0 ? 0.57 : 0.37), 0.4, 0.2, 0.04, M.brass);
    }
    for (const r of plan.rooms) {
      const beds = plan.beds.filter((b) => b.room === r.i);
      for (const b of beds) {
        if (b.bunk === 1) continue;
        F.bed(K, b.x, b.z, { dir: 'z', double: !!b.double, upper: b.bunk === 0, blanket: blankets[(r.i + (b.x | 0)) % blankets.length], blanket2: blankets[(r.i + 2) % blankets.length], frame: r.kind === 'dbl' ? M.darkWood : M.wood });
      }
      if (r.kind === 'one') { F.table(K, r.x + 1.95, r.z + (r.row === 0 ? 0.2 : 1.3), 0.9, 0.7, { h: 0.6 }); F.candle(K, r.x + 2.35, r.z + (r.row === 0 ? 0.5 : 1.6), 0.6, { noStand: true, light: false }); }
      if (r.kind === 'dbl') { F.chest(K, r.x + 0.2, r.z + (r.row === 0 ? 2.2 : 0.1), { mat: M.darkWood }); }
    }
    // 廊下の明かり
    for (let x = 2; x < W - 1; x += 5) F.candle(K, x + 0.5, 4.5, 1.7, { noStand: true, li: 1.2, ld: 4 });
    // 帳場（西）と食堂
    const hz = plan.hallZ;
    const cz = hz + 0.4;
    K.box(0.3, 0, cz, 3.2, 1.0, 0.6, M.wood); K.box(0.2, 1.0, cz - 0.05, 3.4, 0.08, 0.7, M.darkWood); K.solid(0.3, cz, 3.2, 0.6);
    K.box(0.6, 1.08, cz + 0.1, 0.5, 0.05, 0.35, M.white);   // 宿帳
    K.box(1.6, 1.08, cz + 0.2, 0.18, 0.2, 0.18, M.brass);    // 呼び鈴
    F.wallPic(K, 'W', cz - 0.9, 1.3, 1.2, 0.7, M.notice);
    for (let i = 0; i < 4; i++) K.box(0.03, 1.1 + (i % 2) * 0.2, cz - 1.3 + i * 0.25, 0.04, 0.08, 0.08, M.brass);   // 鍵掛け
    K.slot('work', 1.8, cz + 1.3, { face: [0, -1] });
    const tables = [];
    for (let x = 5; x + 1.5 < W - 1; x += 3.5) tables.push([x, Math.min(D - 2.2, hz + 1.8)]);
    for (const [x, z] of tables) {
      F.table(K, x, z, 1.6, 0.9);
      K.box(x + 0.3, 0.72, z + 0.3, 0.25, 0.12, 0.25, M.bread); K.cyl(x + 1.2, 0.72, z + 0.45, 0.08, 0.16, M.brass, { seg: 6 });
      for (const [dx, dz, f] of [[0.4, -0.45, [0, 1]], [1.2, -0.45, [0, 1]], [0.4, 1.35, [0, -1]], [1.2, 1.35, [0, -1]]]) { F.stool(K, x + dx, z + dz); K.slot('eat', x + dx, z + dz, { face: f }); }
    }
    F.barrel(K, W - 0.7, D - 1.2, { h: 0.9 }); F.barrel(K, W - 1.5, D - 0.7, { h: 0.7 });
    F.torch(K, 'E', hz + 1.5, 1.6); F.torch(K, 'W', D - 1.5, 1.6);
    F.plant(K, W / 2 + 1.5, D - 0.6);
  },

  // 公衆浴場：大きな湯船と木の湯桶、湯を沸かす釜、腰掛け
  bathhouse(K, ctx, F) {
    const { M, W, D } = K;
    const south = ctx.b.kingdom === 2;
    F.room(K, { floor: M.whiteTile, wall: south ? M.sandstone : M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [3, W - 4], W: [], E: [], S: [] }, winTop: 2.1 });
    // 湯船（中央）
    const px0 = 3, pz0 = 2.2, pw = W - 7, pd = 4;
    K.box(px0, 0, pz0, pw, 0.45, 0.25, M.stone); K.box(px0, 0, pz0 + pd - 0.25, pw, 0.45, 0.25, M.stone);
    K.box(px0, 0, pz0, 0.25, 0.45, pd, M.stone); K.box(px0 + pw - 0.25, 0, pz0, 0.25, 0.45, pd, M.stone);
    K.box(px0 + 0.25, 0.3, pz0 + 0.25, pw - 0.5, 0.05, pd - 0.5, M.water);
    K.solid(px0, pz0, pw, pd);
    for (let x = px0 + 0.9; x < px0 + pw - 0.5; x += 1.2) for (const z of [pz0 + 1.1, pz0 + pd - 1.1]) K.slot('bath', x, z, { y: -0.1, face: [0, z < pz0 + pd / 2 ? 1 : -1] });
    // 木の湯桶（東の壁ぞい）
    for (let i = 0; i < 3; i++) {
      const z = 1.4 + i * 1.8;
      if (z > D - 3) break;
      K.cyl(W - 1.3, 0, z, 0.62, 0.62, M.wood, { seg: 10, openEnded: true }); K.cyl(W - 1.3, 0, z, 0.58, 0.06, M.wood, { seg: 10 }); K.cyl(W - 1.3, 0.5, z, 0.58, 0.04, M.water, { seg: 10 });
      K.cyl(W - 1.3, 0.2, z, 0.64, 0.05, M.iron, { seg: 10 });
      K.solid(W - 2, z - 0.7, 1.4, 1.4);
      K.slot('bath', W - 1.3, z, { y: 0.15, face: [-1, 0] });
    }
    // 湯を沸かす釜（北西）
    K.box(0.3, 0, 0.2, 1.8, 1.1, 1.2, M.darkStone); K.box(0.7, 0.2, 1.35, 1.0, 0.5, 0.1, M.fire); K.cyl(1.2, 1.1, 0.8, 0.5, 0.4, M.iron, { seg: 8 });
    K.solid(0.3, 0.2, 1.8, 1.2); K.light(1.2, 0.8, 1.8, '#ff9a40', 3, 7, 1.3);
    K.slot('work', 1.2, 2.1, { face: [0, -1] });
    for (let i = 0; i < 6; i++) F.crate(K, 0.2, 3 + i * 0.35, 0.3, 0, M.wood);   // 薪
    // 腰掛けと手ぬぐい掛け（南）
    F.bench(K, 1, D - 1.8, 4); for (let i = 0; i < 4; i++) K.slot('seat', 1.5 + i, D - 1.45, { face: [0, -1] });
    F.bench(K, W - 5.5, D - 1.8, 3.5); for (let i = 0; i < 3; i++) K.slot('seat', W - 5 + i, D - 1.45, { face: [0, -1] });
    for (let i = 0; i < 5; i++) K.box(0.03, 1.2, 6.8 + i * 0.4, 0.05, 0.4, 0.28, i % 2 ? M.white : M.beige);
    // 湯気
    for (let i = 0; i < 6; i++) K.box(px0 + 1 + i * (pw - 2) / 6, 0.9 + (i % 3) * 0.3, pz0 + 1.2 + (i % 2) * 1.4, 0.4, 0.2, 0.4, M.beam);
    F.torch(K, 'W', 5.5, 1.7, { color: '#ffd080' });
  },

  // 図書館：壁いっぱいの本棚、鎖でつないだ本の書見台、閲覧机
  library(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.parquet, wall: M.stone, h: 3.0, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [2, W - 3] }, winTop: 2.4 });
    F.shelf(K, 0.2, 0, W - 0.4, 'N', M.books, { h: 2.6 });
    F.shelf(K, 0, 1.2, D - 4, 'W', M.books, { h: 2.4 });
    F.shelf(K, W, 1.2, D - 4, 'E', M.books, { h: 2.4 });
    // 鎖の書見台（斜めの机に本、鉄の鎖）
    for (let x = 2.5; x < W - 2.5; x += 2.4) {
      K.box(x, 0, 2.0, 1.4, 0.95, 0.5, M.darkWood, { rx: 0 }); K.box(x + 0.1, 0.95, 2.0, 1.2, 0.05, 0.5, M.wood, { rx: -0.25 });
      K.box(x + 0.3, 1.02, 2.1, 0.35, 0.05, 0.28, M.white); K.box(x + 0.75, 1.02, 2.1, 0.35, 0.05, 0.28, M.beige);
      for (let i = 0; i < 4; i++) K.box(x + 0.45 + i * 0.12, 0.7 - i * 0.08, 2.46, 0.08, 0.04, 0.04, M.iron);
      K.solid(x, 2.0, 1.4, 0.5);
      K.slot('read', x + 0.7, 2.85, { face: [0, -1] });
    }
    // 閲覧机
    for (let z = 4.5; z < D - 3; z += 2.6) {
      for (const x of [2.5, W - 6]) {
        F.table(K, x, z, 3.5, 1.0, { top: M.darkWood });
        K.box(x + 0.5, 0.72, z + 0.3, 0.4, 0.06, 0.3, M.books); K.box(x + 2.4, 0.72, z + 0.3, 0.45, 0.04, 0.35, M.white);
        F.candle(K, x + 1.75, z + 0.5, 0.72, { noStand: true, li: 1.4, ld: 4 });
        for (let i = 0; i < 3; i++) { F.chair(K, x + 0.6 + i * 1.15, z - 0.45, [0, 1]); K.slot('read', x + 0.6 + i * 1.15, z - 0.45, { face: [0, 1] }); F.chair(K, x + 0.6 + i * 1.15, z + 1.45, [0, -1]); K.slot('read', x + 0.6 + i * 1.15, z + 1.45, { face: [0, -1] }); }
      }
    }
    // 司書の机（入口のそば）
    F.table(K, W / 2 + 1.5, D - 2.4, 1.6, 0.8, { cloth: M.carpetGreen }); K.box(W / 2 + 1.8, 0.72, D - 2.2, 0.5, 0.08, 0.4, M.books);
    F.chair(K, W / 2 + 2.3, D - 2.9, [0, 1]); K.slot('work', W / 2 + 2.3, D - 2.9, { face: [0, 1] });
    K.cyl(W / 2 - 2.5, 0, D - 2, 0.25, 0.6, M.wood); K.sphere(W / 2 - 2.5, 0.9, D - 2, 0.3, M.blue, { seg: 8 });   // 地球儀
    F.rug(K, W / 2 - 1.5, 3.2, 3, D - 5.5, M.carpetBlue);
    F.chandelier(K, W / 2, D / 2, 2.6, { r: 0.8, li: 2.6, ld: 9 });
  },

  // 劇場：北に幕のかかった舞台、客席の長椅子
  theater(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber2, h: 3.2, trim: M.darkWood, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [] } });
    const sd = 4.2;
    K.box(1, 0, 0, W - 2, 0.7, sd, M.wood); K.box(0.9, 0.7, sd - 0.1, W - 1.8, 0.06, 0.1, M.darkWood); K.solid(1, 0, W - 2, sd);
    // 幕と飾り
    K.box(1, 0.7, 0.1, 1.2, 2.4, 0.2, M.red); K.box(W - 2.2, 0.7, 0.1, 1.2, 2.4, 0.2, M.red); K.box(1, 2.8, 0.1, W - 2, 0.4, 0.3, M.red);
    for (let x = 1.5; x < W - 1; x += 1.2) K.box(x, 2.75, 0.4, 0.5, 0.1, 0.05, M.gold);
    F.wallPic(K, 'N', W / 2, 1.1, W - 5, 1.5, M.starchart);
    // 書き割りの木と城
    K.cyl(3.4, 0.7, 1.2, 0.12, 1.2, M.wood); K.sphere(3.4, 2.1, 1.2, 0.5, M.leaf, { seg: 7 });
    K.box(W - 4.4, 0.7, 0.8, 1.2, 1.4, 0.3, M.stone); K.box(W - 4.2, 2.1, 0.8, 0.3, 0.3, 0.3, M.stone); K.box(W - 3.5, 2.1, 0.8, 0.3, 0.3, 0.3, M.stone);
    for (let x = 3; x <= W - 3; x += (W - 6) / 3) K.slot('stage', x, 2.3, { y: 0.7, face: [0, 1] });
    // 舞台の前の灯り
    for (let x = 2; x < W - 1; x += 2.5) F.candle(K, x, sd + 0.15, 0.7, { noStand: true, li: 1.6, ld: 4 });
    // 客席
    for (let z = sd + 1.5; z < D - 1.8; z += 1.4) {
      for (const [x0, w] of [[1.2, W / 2 - 2.2], [W / 2 + 1, W / 2 - 2.2]]) {
        F.bench(K, x0, z, w); K.solid(x0, z + 0.1, w, 0.7);
        for (let i = 0; i < Math.floor(w); i++) K.slot('aud', x0 + 0.5 + i, z + 0.35, { face: [0, -1], y: 0.05 });
      }
    }
    // 木戸番の台
    K.box(W - 2.2, 0, D - 1.6, 1.4, 0.9, 0.6, M.wood); K.solid(W - 2.2, D - 1.6, 1.4, 0.6); K.slot('work', W - 1.5, D - 0.7, { face: [0, -1] });
    F.chandelier(K, W / 2, D / 2 + 1.5, 2.8, { r: 0.9, li: 3, ld: 10 });
    F.torch(K, 'W', D - 3, 1.8); F.torch(K, 'E', D - 3, 1.8);
  },

  // 仕立て屋：布の棚、裁ち台、人台、姿見
  tailorshop(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { W: [3], E: [3], N: [], S: [1] } });
    F.openShelf(K, 0.3, 0.05, W - 0.6, 'N', [M.red, M.blue, M.green, M.beige, M.purple, M.white, M.orange]);
    F.table(K, 1.5, 2.6, 3, 1.2, { top: M.wood }); K.box(1.8, 0.72, 2.8, 1.6, 0.03, 0.8, M.blue); K.box(3.6, 0.72, 3.0, 0.4, 0.04, 0.15, M.steel);
    K.slot('work', 3, 4.3, { face: [0, -1] }); K.slot('work', 1.1, 3.2, { face: [1, 0] });
    for (const [x, c] of [[W - 2.2, M.red], [W - 1.2, M.green]]) {
      K.box(x - 0.2, 0, 2.3, 0.4, 0.06, 0.4, M.darkWood); K.box(x - 0.03, 0.06, 2.47, 0.06, 0.6, 0.06, M.darkWood);
      K.box(x - 0.22, 0.66, 2.35, 0.44, 0.6, 0.3, c); K.sphere(x, 1.35, 2.5, 0.1, M.beige, { seg: 6 }); K.solid(x - 0.3, 2.2, 0.6, 0.6);
    }
    K.box(0.02, 0.3, D - 3.2, 0.06, 1.5, 0.8, M.steel);   // 姿見
    F.chair(K, W - 1.5, D - 2, [-1, 0]); K.slot('wait', W - 1.5, D - 2, { face: [-1, 0] });
    K.slot('wait', 2, D - 2, { face: [0, -1] });
    F.sack(K, 0.5, D - 0.8); F.candle(K, W / 2, 3.2, 0.72, { noStand: true });
    F.torch(K, 'E', D - 3.5, 1.6);
  },

  // 薬屋：薬瓶の棚、吊るした薬草、薬研と釜、帳場
  apothecary(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.stone, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { W: [3], E: [], N: [], S: [W - 2] } });
    F.shelf(K, 0.3, 0, W - 0.6, 'N', M.bottles, { h: 2.1 });
    F.openShelf(K, W, 1.2, 3, 'E', [M.green, M.red, M.blue, M.white, M.purple]);
    K.box(1, 0, 3.2, W - 3, 1.0, 0.6, M.wood); K.box(0.9, 1.0, 3.15, W - 2.8, 0.08, 0.7, M.darkWood); K.solid(1, 3.2, W - 3, 0.6);
    K.cyl(2, 1.08, 3.5, 0.16, 0.14, M.stone, { seg: 7 }); K.box(3.2, 1.08, 3.3, 0.5, 0.2, 0.3, M.brass);
    for (let i = 0; i < 6; i++) { K.box(1.5 + i * 0.9, 1.7, 1.8, 0.25, 0.45, 0.2, i % 2 ? M.leaf : M.green); K.box(1.6 + i * 0.9, 2.15, 1.85, 0.04, 0.3, 0.04, M.brown); }
    K.slot('work', 2.8, 2.4, { face: [0, 1] }); K.slot('work', 1.2, 1.6, { face: [0, -1] });
    F.cauldron(K, W - 2, 1.2, M.greenGlow);
    K.slot('wait', 3, 4.5, { face: [0, -1] }); K.slot('wait', 4.5, 4.6, { face: [0, -1] });
    F.sack(K, 0.5, D - 0.8); F.sack(K, 1.1, D - 0.6); F.chair(K, W - 1.2, D - 1.6, [-1, 0]); K.slot('wait', W - 1.2, D - 1.6, { face: [-1, 0] });
    F.candle(K, 4.5, 3.5, 1.08, { noStand: true }); F.torch(K, 'W', D - 2, 1.6);
  },

  // よろず屋：何でも並ぶ棚、たる、袋、帳場
  genstore(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { W: [3], E: [3], N: [], S: [1] } });
    F.openShelf(K, 0.3, 0.05, W - 0.6, 'N', [M.bread, M.apple, M.clay, M.cabbage, M.brass, M.white, M.orange, M.fish]);
    F.openShelf(K, 0, 1.4, 3.5, 'W', [M.clay, M.sack, M.iron, M.beige]);
    K.box(3, 0, 3.4, 4, 1.0, 0.6, M.wood); K.box(2.9, 1.0, 3.35, 4.2, 0.08, 0.7, M.darkWood); K.solid(3, 3.4, 4, 0.6);
    K.box(3.4, 1.08, 3.5, 0.6, 0.12, 0.3, M.brass); K.cyl(5.8, 1.08, 3.7, 0.18, 0.25, M.clay, { seg: 7 });
    K.slot('work', 5, 2.6, { face: [0, 1] });
    for (let i = 0; i < 3; i++) F.barrel(K, W - 0.8, 2.2 + i * 0.8, { h: 0.8 });
    for (let i = 0; i < 4; i++) F.sack(K, 1.2 + i * 0.5, D - 0.7);
    F.crate(K, W - 2.2, D - 1.2); F.crate(K, W - 2.2, D - 1.2, 0.6, 0.6);
    K.slot('wait', 5, 4.7, { face: [0, -1] }); K.slot('wait', 3.6, 4.8, { face: [0, -1] });
    F.torch(K, 'W', 5.5, 1.6); F.candle(K, 4.4, 3.6, 1.08, { noStand: true });
  },

  // 穀物倉：麦袋の山、ばら積みの小麦、枡と秤
  granary(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.planks, trim: M.darkWood, beams: true, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [] }, sunbeams: false });
    const sim = ctx.sim, s = ctx.b.settlement, wheat = sim?.S?.bld?.gran?.[s]?.wheat || 0;
    const fill = Math.max(0.15, Math.min(1, wheat / 80));
    // ばら積みの小麦（仕切りの中）
    for (const x0 of [0.3, W - 4.3]) {
      K.box(x0, 0, 0.3, 4, 0.9, 0.1, M.darkWood); K.box(x0, 0, 3.2, 4, 0.9, 0.1, M.darkWood); K.box(x0 + (x0 < 1 ? 4 : 0), 0, 0.3, 0.1, 0.9, 3, M.darkWood);
      K.box(x0 + 0.1, 0, 0.4, 3.8, 0.85 * fill, 2.8, M.hay); K.solid(x0, 0.3, 4, 3);
    }
    // 麦袋の山
    const n = Math.round(6 + fill * 14);
    for (let i = 0; i < n; i++) F.sack(K, 1 + (i % 7) * 0.55, 4.6 + Math.floor(i / 7) * 0.6);
    K.solid(0.7, 4.3, 4, 1.8);
    // 秤と枡
    K.box(W - 2.5, 0, D - 3, 0.1, 1.4, 0.1, M.darkWood); K.box(W - 3.1, 1.4, D - 3, 1.3, 0.06, 0.06, M.iron);
    K.cyl(W - 3.0, 0.9, D - 3, 0.25, 0.08, M.brass, { seg: 8 }); K.cyl(W - 2.0, 0.9, D - 3, 0.25, 0.08, M.brass, { seg: 8 });
    K.cyl(W - 1.3, 0, D - 1.8, 0.3, 0.4, M.wood, { seg: 8 });
    K.slot('work', W - 2.5, D - 2.2, { face: [0, -1] }); K.slot('work', W / 2, 4, { face: [0, -1] });
    for (let i = 0; i < 3; i++) F.crate(K, W - 1, 4 + i * 0.7, 0.6);
    F.torch(K, 'W', D - 2, 1.5, { color: '#ffc070' });
  },

  // 孤児院：二段寝台の並ぶ大部屋、長い食卓、おもちゃ、院母の椅子
  orphanage(K, ctx, F) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.plaster, beams: true, door: Math.floor(W / 2), win: { N: F.winAt(3, W), W: [], E: [], S: [2, W - 3] } });
    const kids = ctx.sim ? orphanCount(ctx.sim, ctx.b) : 0;
    const nb = Math.max(4, Math.min(8, Math.ceil(kids / 2) + 2));
    const bl = [M.red, M.blue, M.green, M.orange, M.pink, M.purple];
    for (let i = 0; i < nb; i++) {
      const west = i % 2 === 0, k = Math.floor(i / 2);
      const z = 0.3 + k * 2.3;
      if (z + 2 > D - 3) break;
      F.bed(K, west ? 0.15 : W - 1.15, z, { dir: 'z', upper: true, blanket: bl[i % 6], blanket2: bl[(i + 3) % 6] });
    }
    // 食卓
    const tx = 3, tw = W - 6, tz = 4;
    F.table(K, tx, tz, tw, 1.1, { top: M.wood });
    for (let i = 0; i < tw - 0.5; i += 1.1) { F.bench(K, tx + i, tz - 0.9, 1); K.slot('eat', tx + i + 0.5, tz - 0.5, { face: [0, 1] }); K.slot('eat', tx + i + 0.5, tz + 1.55, { face: [0, -1] }); }
    for (let i = 0; i < 4; i++) K.box(tx + 0.5 + i * 1.6, 0.72, tz + 0.4, 0.22, 0.1, 0.22, i % 2 ? M.bread : M.clay);
    // 遊び場のじゅうたんとおもちゃ
    F.rug(K, 3, D - 3.6, 5, 2.4, M.carpetGreen, M.brown);
    for (let i = 0; i < 5; i++) K.box(3.5 + i * 0.8, 0.02, D - 3 + (i % 2) * 0.8, 0.22, 0.22, 0.22, bl[i]);
    K.sphere(6.8, 0.15, D - 2.2, 0.15, M.red, { seg: 6 });
    for (let i = 0; i < 4; i++) K.slot('seat', 3.8 + i * 1.1, D - 2.4, { face: [0, -1] });
    // 院母の椅子と糸車
    F.chair(K, W - 3, D - 2.2, [-1, 0], { cushion: M.red }); K.slot('work', W - 3, D - 2.2, { face: [-1, 0] });
    K.cyl(W - 2.2, 0.5, D - 1.2, 0.35, 0.06, M.wood, { rx: Math.PI / 2, seg: 10 }); K.box(W - 2.3, 0, D - 1.3, 0.2, 0.5, 0.2, M.darkWood);
    F.hearth(K, W / 2 - 1.2, 2.4);
    F.wallPic(K, 'E', D / 2 + 1, 1.2, 0.8, 0.6, M.portrait);
  },

  // 墓地：石垣に囲まれた芝地に墓石が並ぶ。奥に納骨堂と礼拝の小堂、いちいの木
  cemetery(K, ctx, F) {
    const { M, W, D } = K;
    K.open = true;
    K.box(-0.5, -0.3, -0.5, W + 1, 0.3, D + 1, M.grass);
    for (const [x, z, w, d] of [[0, 0, W, 0.3], [0, 0, 0.3, D], [W - 0.3, 0, 0.3, D], [0, D - 0.3, W / 2 - 1, 0.3], [W / 2 + 1, D - 0.3, W / 2 - 1, 0.3]]) { K.box(x, 0, z, w, 0.6, d, M.stone); K.solid(x, z, w, d); }
    // 納骨堂（北西）
    K.box(0.6, 0, 0.6, 3, 2.0, 2.2, M.stone); K.box(0.4, 2.0, 0.4, 3.4, 0.2, 2.6, M.darkStone); K.box(1.9, 2.2, 1.5, 0.12, 0.7, 0.12, M.gold); K.box(1.7, 2.6, 1.5, 0.52, 0.12, 0.12, M.gold);
    K.box(1.6, 0, 2.8, 0.8, 1.3, 0.05, M.black); K.solid(0.6, 0.6, 3, 2.2);
    K.slot('pew', 2, 3.5, { face: [0, -1] });
    // いちいの木（北東）
    K.cyl(W - 2, 0, 1.8, 0.2, 1.2, M.brown); K.sphere(W - 2, 1.9, 1.8, 1.1, M.leaf, { seg: 7 }); K.solid(W - 2.5, 1.3, 1, 1);
    // 墓石（眠る人の数だけ。多すぎれば古い墓はまとめて納骨堂へ）
    const n = Math.max(6, Math.min(30, ctx.sim ? cemeteryGraves(ctx.sim, ctx.b) : 8));
    let k = 0;
    for (let z = 4.2; z < D - 2 && k < n; z += 1.6) for (let x = 1.2; x < W - 1 && k < n; x += 1.4) {
      if (Math.abs(x - W / 2) < 0.8) continue;   // 真ん中の通路
      const cross = hsh(ctx.b.id, k, 3) < 0.35;
      if (cross) { K.box(x - 0.05, 0, z, 0.1, 0.8, 0.1, M.stone); K.box(x - 0.25, 0.5, z, 0.5, 0.1, 0.1, M.stone); }
      else { K.box(x - 0.25, 0, z, 0.5, 0.6, 0.12, M.stone); K.box(x - 0.2, 0.6, z, 0.4, 0.08, 0.12, M.stone); }
      K.box(x - 0.3, 0, z + 0.15, 0.6, 0.08, 1.0, M.dirt);
      if (hsh(ctx.b.id, k, 4) < 0.4) K.sphere(x + 0.15, 0.1, z + 0.4, 0.08, hsh(ctx.b.id, k, 5) < 0.5 ? M.pink : M.white, { seg: 5, seg2: 4 });
      K.solid(x - 0.3, z, 0.6, 0.3);
      if (k % 3 === 0) K.slot('pew', x, z + 1.2, { face: [0, -1] });
      k++;
    }
    // 墓守の道具
    K.box(W - 1.2, 0, D - 2.2, 0.06, 1.1, 0.06, M.darkWood); K.box(W - 1.3, 0, D - 2.25, 0.25, 0.2, 0.06, M.iron);
    K.slot('work', W - 1.8, D - 2, { face: [-1, 0] });
    F.brazier(K, W / 2 - 1.8, D - 1.2, M.fire, { li: 1.5 });
    K.door = { x: W / 2, z: D - 0.5 };
  },
};

// 行動から、建物の中の居場所の種類
export function newKindFor(t, e) {
  const a = e.action?.type;
  switch (a) {
    case 'bathe': return 'bath';
    case 'read': return 'read';
    case 'watchplay': return 'aud';
    case 'act': return 'stage';
    case 'buyclothes': case 'buymed': return 'wait';
    case 'grave': return t === 'cemetery' ? 'pew' : null;
    case 'funeral': return t === 'cemetery' ? 'pew' : null;
  }
  return null;
}
export const NEW_FALLBACK = { bath: ['bath', 'seat', 'wander'], read: ['read', 'desk', 'seat', 'wander'], aud: ['aud', 'pew', 'seat', 'wander'] };
