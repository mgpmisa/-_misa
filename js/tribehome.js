// 奥地の民族の家と里（グラフィック部）
//
// 地図の上の建物（render.js の buildingParts から）と、建物の中（interior.js の InteriorView.open から）を描く。
// 民族の村の建物は b.tribe（民族）と b.style（家の形）を持つ（js/tribes.js が置く）。
//   b.type: house（家）・shrine（祠。landmark:true）・tavern（集会所。hall:true）・shrine（守り神のすみかの目印。style:'lair'）
//   b.style: roundhut 丸小屋 / tent 円錐の天幕 / stilt 高床 / platform 石の基壇 / yurt 白い天幕 / adobe 砂岩の平屋根
//            stonehut 石の家 / pithouse 半地下 / whitestone 白い石の家と塔 / lair すみかの目印
//
// 本体からの呼び方（小さな差し込みだけ）
//   render.js   buildingParts の switch の前 … if (b.tribe && b.style && TH.tribalParts(this, b, add, M, W_, D_, face, door)) return parts;
//               コンストラクタの buildBuildings のあと … TH.tribalExtras(this, wx, wz, topY);   （柵の杭・焚き火・守り柱・干し棚）
//   interior.js open の内装づくり … if (!(b.tribe && b.style && TH.tribalInterior(K, ctx, F))) (BUILD[type] || BUILD.house)(K, ctx);
//               題名 … let sub = (b.tribe && b.style && TH.tribalLabel(b)) || LABEL[type] || type;
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { canvasTex } from './textures.js';
import { W, H, T } from './world.js';

const hsh = (a, b, s = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 982451653); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };

// ================================================================ 材質（民族の里だけで使うもの。描画ごとに1回だけ作る）
function noise(base, dark, light, seed, extra) {
  return canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = hsh(x, y, seed); px(g, x, y, r < 0.2 ? dark : r > 0.84 ? light : base); }
    extra && extra(g);
  }, true);
}
function tribeMats(R) {
  if (R._tribeM) return R._tribeM;
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const m = {
    moss: L({ map: noise('#4f7a34', '#3a5a26', '#79a24a', 101, (g) => { for (let i = 0; i < 6; i++) px(g, (hsh(i, 3, 102) * 16) | 0, (hsh(i, 4, 102) * 16) | 0, '#8a6a3a'); }), side: THREE.DoubleSide }),
    bark: L({ map: canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 4 === 0 ? '#3e2a1a' : hsh(x, y, 103) > 0.8 ? '#7a5a3a' : '#5e4128'); }, true) }),
    hide: L({ map: noise('#b8966a', '#9a7a52', '#d2b488', 104, (g) => { g.fillStyle = '#8a6a44'; for (let x = 0; x < 16; x += 5) g.fillRect(x, 0, 1, 16); }), side: THREE.DoubleSide }),
    felt: L({ map: noise('#eee8da', '#d8d0c0', '#faf6ee', 105), side: THREE.DoubleSide }),
    palm: L({ map: canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, (x + y * 2) % 5 === 0 ? '#8a7a3a' : hsh(x, y, 106) > 0.75 ? '#d8c07a' : '#b8a054'); }, true), side: THREE.DoubleSide }),
    reed: L({ map: canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 3 === 0 ? '#6a6a3a' : hsh(x, y, 107) > 0.7 ? '#a8a060' : '#8a8a4a'); }, true), side: THREE.DoubleSide }),
    grassRoof: L({ map: noise('#5a8a3a', '#46702c', '#7aa84e', 108), side: THREE.DoubleSide }),
    lavaStone: L({ map: noise('#2e2a2c', '#1e1a1c', '#4a4244', 109, (g) => { for (let i = 0; i < 4; i++) px(g, (hsh(i, 5, 110) * 16) | 0, (hsh(i, 6, 110) * 16) | 0, '#6a2a1a'); }) }),
    whiteStone: L({ map: noise('#ecebe4', '#d4d2ca', '#fbfaf6', 111, (g) => { g.fillStyle = '#c8c6be'; g.fillRect(0, 7, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(7, 0, 1, 7); g.fillRect(3, 8, 1, 7); g.fillRect(12, 8, 1, 7); }) }),
    plaster: L({ map: noise('#e8e0cc', '#d4cab2', '#f4eee0', 112) }),
    fieldStone: L({ map: canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const e = y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 3) % 6 === 0; px(g, x, y, e ? '#5a564e' : hsh(x, y, 113) > 0.8 ? '#9a948a' : '#827c72'); } }, true) }),
    leaf: L({ color: '#3f7a2e', flatShading: true }), leaf2: L({ color: '#5a9a3a', flatShading: true }), palmLeaf: L({ color: '#5aa03a', flatShading: true, side: THREE.DoubleSide }),
    bone: L({ color: '#e8e0c8' }), indigo: L({ color: '#2a4a8a' }), blue: L({ color: '#3a6ab0', side: THREE.DoubleSide }), teal: L({ color: '#3ab0c8' }), green: L({ color: '#3a9a6a' }),
    yellow: L({ color: '#e8c83a', side: THREE.DoubleSide }), red: L({ color: '#c9463a', side: THREE.DoubleSide }), rust: L({ color: '#c2542d' }), jade: L({ color: '#3ab07a' }), soot: L({ color: '#2a2622' }),
    clay: L({ color: '#b86a40' }), rope: L({ color: '#c8a860' }), fish: L({ color: '#9ab0c0' }), iron: L({ color: '#5a5a62' }), silver: L({ color: '#d8dce4' }), obsidian: L({ color: '#1a141c' }),
    water: L({ color: '#4a8ab8', transparent: true, opacity: 0.85 }), steam: L({ color: '#f4f4f4', transparent: true, opacity: 0.45, depthWrite: false }),
    blueGlow: L({ color: '#3a6ab0', emissive: '#4a9aff', emissiveIntensity: 1.2 }), jadeGlow: L({ color: '#3ab07a', emissive: '#40e0a0', emissiveIntensity: 0.6 }),
    ice: L({ color: '#cfe8ff', emissive: '#8ac8ff', emissiveIntensity: 0.35 }), ember: L({ color: '#ff6a2a', emissive: '#ff4a10', emissiveIntensity: 1.4 }),
  };
  R._tribeM = m;
  return m;
}

// 部品の形（R の box・cyl・cone・prism は render.js のもの）
const tilt = (g, rx = 0, rz = 0) => { if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); return g; };
function ringOfStones(R, add, mat, n, rad, h, y = 0, cx = 0, cz = 0, s = 0.14) {
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; add(R.box(s, h, s), mat, cx + Math.cos(a) * rad, y + h / 2, cz + Math.sin(a) * rad, a); }
}
function firePit(R, add, M, TM, x, z, r = 0.3) {
  ringOfStones(R, add, M.stone, 7, r, 0.1, 0, x, z, 0.12);
  add(R.cone(r * 0.55, 0.32, 5), M.fire, x, 0.17, z);
  add(R.box(r * 1.2, 0.05, 0.06), TM.bark, x, 0.04, z, 0.6); add(R.box(r * 1.2, 0.05, 0.06), TM.bark, x, 0.04, z, -0.7);
}
function totem(R, add, M, TM, x, z, h, cols) {
  add(R.cyl(0.09, 0.11, h, 6), TM.bark, x, h / 2, z);
  cols.forEach((c, i) => add(R.cyl(0.115, 0.115, 0.1, 6), c, x, h * (0.35 + i * 0.18), z));
  add(R.box(0.36, 0.06, 0.08), cols[0], x, h * 0.86, z);
}
function dryRack(R, add, M, TM, x, z, ry, fish = true) {
  for (const s of [-1, 1]) add(R.box(0.05, 0.6, 0.05), TM.bark, x + Math.cos(ry) * s * 0.3, 0.3, z - Math.sin(ry) * s * 0.3);
  add(R.box(0.7, 0.04, 0.04), TM.bark, x, 0.58, z, ry);
  if (fish) for (let i = -1; i <= 1; i++) add(R.box(0.05, 0.2, 0.09), TM.fish, x + Math.cos(ry) * i * 0.18, 0.44, z - Math.sin(ry) * i * 0.18, ry);
  else for (let i = -1; i <= 1; i++) add(R.box(0.12, 0.26, 0.03), TM.hide, x + Math.cos(ry) * i * 0.2, 0.43, z - Math.sin(ry) * i * 0.2, ry);
}

// ================================================================ 地図の上の建物
// 返り値 true … 描いた（本体の switch は飛ばす）。false … 知らない形なので本体に任せる
export function tribalParts(R, b, add, M, W_, D_, face, door) {
  const TM = tribeMats(R);
  const tr = b.tribe, st = b.style;
  const hall = !!b.hall, shrine = b.type === 'shrine' && st !== 'lair';
  const v = hsh(b.x, b.z, 7); // 家ごとのちがい
  const r = Math.min(W_, D_) / 2;
  const fx = face[0], fz = face[1];
  const faceRy = Math.atan2(fx, fz);
  if (st === 'lair') { lairMark(R, b, add, M, TM); return true; }
  if (shrine) { shrinePart(R, b, add, M, TM, W_, D_, face); return true; }
  const k = hall ? 1.0 : 1;
  switch (st) {
    case 'roundhut': { // フィアナ：苔と樹皮の丸い小屋。ときどき大木の上に建つ
      const tree = !hall && v < 0.34;
      if (tree) {
        add(R.cyl(0.26, 0.4, 2.2, 8), TM.bark, -0.15, 1.1, -0.15);
        add(R.cyl(r * 0.95, r * 0.95, 0.1, 10), M.planks, 0, 1.05, 0);
        add(R.cyl(r * 0.62, r * 0.66, 0.55, 10), TM.bark, 0, 1.38, 0);
        add(R.cone(r * 0.82, 0.6, 10), TM.moss, 0, 1.95, 0);
        add(new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.7, 1), TM.leaf, -0.3, 2.55, -0.35);
        add(new THREE.DodecahedronGeometry(0.55, 0).scale(1, 0.7, 1), TM.leaf2, 0.35, 2.35, -0.5);
        // 縄ばしご
        const lx = fx * r * 0.9, lz = fz * r * 0.9;
        for (const s of [-1, 1]) add(R.box(0.03, 1.05, 0.03), TM.rope, lx + (fz ? s * 0.12 : 0), 0.52, lz + (fx ? s * 0.12 : 0));
        for (let i = 1; i < 5; i++) add(R.box(fz ? 0.26 : 0.03, 0.03, fx ? 0.26 : 0.03), TM.bark, lx, i * 0.21, lz);
        add(R.box(fz ? 0.3 : 0.06, 0.4, fx ? 0.3 : 0.06), M.door, fx * r * 0.66, 1.3, fz * r * 0.66);
      } else {
        const rr = hall ? r * 1.1 : r * 0.88;
        add(R.cyl(rr, rr * 1.04, 0.75, 12), TM.bark, 0, 0.375, 0);
        add(R.cone(rr * 1.28, hall ? 1.1 : 0.9, 12), TM.moss, 0, 0.75 + (hall ? 0.55 : 0.45), 0);
        add(R.cyl(0.08, 0.1, 0.3, 6), TM.bark, 0, 0.75 + (hall ? 1.15 : 0.95), 0);
        if (hall) { add(R.cyl(r * 0.7, r * 0.72, 0.6, 10), TM.bark, (W_ > D_ ? 1 : 0) * r * 1.1, 0.3, (W_ > D_ ? 0 : 1) * r * 1.1); add(R.cone(r * 0.9, 0.7, 10), TM.moss, (W_ > D_ ? 1 : 0) * r * 1.1, 0.95, (W_ > D_ ? 0 : 1) * r * 1.1); }
        door(rr * 2, rr * 2, 0.55);
        // 鹿角の飾り（戸口の上）
        if (hall || v > 0.7) { const dx = fx * (rr + 0.05), dz = fz * (rr + 0.05); add(R.box(fz ? 0.5 : 0.04, 0.05, fx ? 0.5 : 0.04), TM.bone, dx, 0.72, dz); for (const s of [-1, 1]) add(R.box(0.04, 0.2, 0.04), TM.bone, dx + (fz ? s * 0.22 : 0), 0.84, dz + (fx ? s * 0.22 : 0)); }
      }
      if (v > 0.55) add(R.box(0.5, 0.18, 0.18), TM.bark, -fx * 0.2 + (fz ? 0.55 : 0), 0.09, -fz * 0.2 + (fx ? 0.55 : 0), faceRy); // 薪
      break;
    }
    case 'tent': { // ヤルヴィ：円錐形の皮の天幕、赤と黄の帯、上に突き出た棒
      const rr = hall ? r * 1.25 : r * 0.95, h = hall ? 2.1 : 1.7;
      add(R.cone(rr, h, 9), TM.hide, 0, h / 2, 0);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + v; const g = tilt(R.cyl(0.025, 0.025, 0.7, 4), 0, 0.35); g.rotateY(a); add(g, TM.bark, Math.cos(a) * 0.08, h - 0.05, Math.sin(a) * 0.08); }
      const band = (y, c) => { const rad = rr * (1 - y / h) + 0.015; add(R.cyl(rad, rad + 0.02, 0.07, 9), c, 0, y, 0); };
      band(0.32, TM.red); band(0.42, TM.yellow); band(h * 0.62, TM.indigo);
      add(R.box(fz ? 0.36 : 0.05, 0.62, fx ? 0.36 : 0.05), TM.soot, fx * rr * 0.72, 0.31, fz * rr * 0.72);
      if (!hall && v > 0.5) dryRack(R, add, M, TM, -fz * 0.9, fx * 0.9, faceRy, false);
      if (hall) { add(R.box(0.12, 0.9, 0.12), TM.bark, rr + 0.3, 0.45, 0); add(new THREE.BoxGeometry(0.06, 0.34, 0.5), TM.hide, rr + 0.3, 0.95, 0.2); }
      break;
    }
    case 'stilt': { // マヒナ（ヤシの葉の急な屋根）・ボロタ（葦ぶき・板の橋）：高床の小屋
      const sw = tr === 'bolota', roofM = sw ? TM.reed : TM.palm, wallM = sw ? TM.bark : TM.palm;
      const ww = W_ * 0.86, dd = D_ * 0.86, fh = sw ? 0.7 : 0.55;
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(R.box(0.1, fh, 0.1), TM.bark, x * (ww / 2 - 0.05), fh / 2, z * (dd / 2 - 0.05));
      if (hall) for (const x of [-1, 1]) add(R.box(0.1, fh, 0.1), TM.bark, 0, fh / 2, x * (dd / 2 - 0.05));
      add(R.box(ww + 0.1, 0.08, dd + 0.1), M.planks, 0, fh, 0);
      add(R.box(ww * 0.9, 0.55, dd * 0.9), wallM, 0, fh + 0.3, 0);
      const along = ww >= dd;
      const g = R.prism(along ? ww + 0.45 : dd + 0.45, along ? dd + 0.5 : ww + 0.5, sw ? 0.75 : 1.05);
      add(g, roofM, 0, fh + 0.56, 0, along ? 0 : Math.PI / 2);
      // 戸口と、下へのはしご（または板の橋）
      add(R.box(fz ? 0.3 : 0.05, 0.42, fx ? 0.3 : 0.05), M.door, fx * ww * 0.45, fh + 0.26, fz * dd * 0.45);
      const lx = fx * (ww / 2 + 0.25), lz = fz * (dd / 2 + 0.25);
      if (sw) { const pl = tilt(R.box(fz ? 0.32 : 0.6, 0.05, fx ? 0.32 : 0.6), fx ? 0 : -fz * 0.75, fx ? fx * 0.75 : 0); add(pl, M.planks, lx, fh / 2, lz); }
      else for (let i = 1; i <= 3; i++) add(R.box(fz ? 0.28 : 0.04, 0.03, fx ? 0.28 : 0.04), TM.bark, lx - fx * 0.06 * i, i * fh / 4, lz - fz * 0.06 * i);
      if (!sw) { // 柱の彫り物と、赤と青の帯
        add(R.box(0.12, 0.08, 0.12), TM.red, -(ww / 2 - 0.05), fh * 0.6, dd / 2 - 0.05); add(R.box(0.12, 0.08, 0.12), TM.teal, ww / 2 - 0.05, fh * 0.6, dd / 2 - 0.05);
        if (v > 0.6) dryRack(R, add, M, TM, -fz * 1.0 + fx * 0.4, fx * 1.0 + fz * 0.4, faceRy, true);
      } else { add(R.box(0.12, 0.12, 0.12), TM.blueGlow, fx * (ww / 2 + 0.05), fh + 0.62, fz * (dd / 2 + 0.05)); if (v > 0.5) dryRack(R, add, M, TM, -fz * 1.0, fx * 1.0, faceRy, true); }
      break;
    }
    case 'platform': { // ミクトラ：石の基壇の上の白い壁と急な草ぶき
      const bh = 0.32;
      add(R.box(W_ + 0.1, bh, D_ + 0.1), M.stone, 0, bh / 2, 0);
      for (let i = 0; i < 2; i++) add(R.box(fz ? 0.5 : 0.14, bh * (2 - i) / 2, fx ? 0.5 : 0.14), M.stone, fx * (W_ / 2 + 0.1 + i * 0.14), bh * (2 - i) / 4, fz * (D_ / 2 + 0.1 + i * 0.14));
      const ww = W_ * 0.78, dd = D_ * 0.78;
      add(R.box(ww, 0.72, dd), TM.plaster, 0, bh + 0.36, 0);
      add(R.box(ww + 0.02, 0.08, dd + 0.02), TM.green, 0, bh + 0.58, 0); add(R.box(ww + 0.02, 0.05, dd + 0.02), TM.red, 0, bh + 0.5, 0);
      const rr = Math.max(ww, dd) * 0.82;
      if (hall && W_ !== D_) { const g = R.prism(Math.max(ww, dd) + 0.35, Math.min(ww, dd) + 0.45, 1.1); add(g, M.thatch, 0, bh + 0.72, 0, W_ >= D_ ? 0 : Math.PI / 2); }
      else add(R.cone(rr, 1.15, 4), M.thatch, 0, bh + 0.72 + 0.575, 0, Math.PI / 4);
      door(ww, dd, 0.5);
      if (v > 0.6) add(R.cyl(0.12, 0.09, 0.3, 6), TM.clay, -fx * 0.2 + (fz ? ww / 2 + 0.2 : 0), bh + 0.15, -fz * 0.2 + (fx ? dd / 2 + 0.2 : 0));
      break;
    }
    case 'yurt': { // ドルグ：白いフェルトの丸い天幕、青い帯、赤い戸、頂の輪
      const rr = hall ? r * 1.2 : r * 0.92, wh = hall ? 0.75 : 0.62;
      add(R.cyl(rr, rr, wh, 16), TM.felt, 0, wh / 2, 0);
      add(R.cyl(rr + 0.012, rr + 0.012, 0.07, 16), TM.blue, 0, wh * 0.55, 0);
      add(R.cone(rr * 1.04, 0.42, 16), TM.felt, 0, wh + 0.21, 0);
      add(R.cyl(rr * 0.25, rr * 0.25, 0.06, 10), TM.bark, 0, wh + 0.36, 0);
      add(R.cyl(rr * 1.045, rr * 1.045, 0.05, 16), TM.blue, 0, wh + 0.02, 0);
      add(R.box(fz ? 0.36 : 0.06, 0.5, fx ? 0.36 : 0.06), TM.red, fx * rr, 0.25, fz * rr);
      add(R.box(fz ? 0.44 : 0.07, 0.06, fx ? 0.44 : 0.07), TM.yellow, fx * rr, 0.52, fz * rr);
      if (hall) { add(R.box(0.07, 2.0, 0.07), TM.bark, -fx * (rr + 0.35), 1.0, -fz * (rr + 0.35)); add(new THREE.BoxGeometry(0.04, 0.35, 0.55), TM.blue, -fx * (rr + 0.35), 1.8, -fz * (rr + 0.35) + 0.28); }
      if (v > 0.55) { // 馬つなぎの綱
        const ox = fz ? rr + 0.45 : 0, oz = fx ? rr + 0.45 : 0;
        add(R.box(0.06, 0.55, 0.06), TM.bark, ox - fz * 0.0 + (fx ? 0.45 : 0), 0.27, oz + (fz ? 0.45 : 0)); add(R.box(0.06, 0.55, 0.06), TM.bark, ox - (fx ? 0.45 : 0), 0.27, oz - (fz ? 0.45 : 0));
        add(R.box(fz ? 0.03 : 0.9, 0.02, fx ? 0.03 : 0.9), TM.rope, ox, 0.5, oz);
      }
      break;
    }
    case 'adobe': { // ネフェル：砂岩の平屋根、壁の青い帯、屋上の低い縁
      const wh = hall ? 1.2 : 0.95;
      add(R.box(W_, wh, D_), M.sandstone, 0, wh / 2, 0);
      add(R.box(W_ + 0.02, 0.1, D_ + 0.02), TM.blue, 0, wh * 0.72, 0);
      add(R.box(W_ + 0.08, 0.08, D_ + 0.08), M.flatRoof, 0, wh + 0.04, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(R.box(0.14, 0.18, 0.14), M.sandstone, x * W_ / 2, wh + 0.14, z * D_ / 2);
      if (hall) { add(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.dome, 0, wh + 0.06, 0); }
      for (const s of [-1, 1]) add(R.box(fz ? 0.14 : 0.05, 0.14, fx ? 0.14 : 0.05), M.black, fx * (W_ / 2 + 0.01) + (fz ? s * W_ * 0.3 : 0), wh * 0.5, fz * (D_ / 2 + 0.01) + (fx ? s * D_ * 0.3 : 0));
      door(W_, D_, 0.6);
      add(R.cyl(0.1, 0.08, 0.3, 6), TM.clay, fx * (W_ / 2 + 0.15) + (fz ? 0.45 : 0), 0.15, fz * (D_ / 2 + 0.15) + (fx ? 0.45 : 0));
      if (v > 0.5) { // ナツメヤシ
        const px_ = -fx * (W_ / 2 + 0.3) + (fz ? -W_ / 2 : 0), pz = -fz * (D_ / 2 + 0.3) + (fx ? -D_ / 2 : 0);
        add(R.cyl(0.06, 0.09, 1.7, 6), TM.bark, px_, 0.85, pz);
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const g = new THREE.BoxGeometry(0.7, 0.03, 0.16); g.rotateZ(-0.35); g.translate(0.32, 0, 0); g.rotateY(a); add(g, TM.palmLeaf, px_, 1.72, pz); }
      }
      break;
    }
    case 'stonehut': { // ガライ（石積みに灰色の屋根と鍛冶の煙突）・ホリン（石の腰壁に木の上屋と草ぶき）
      if (tr === 'garai') {
        const wh = hall ? 1.25 : 1.0;
        add(R.box(W_, wh, D_), TM.fieldStone, 0, wh / 2, 0);
        const along = W_ >= D_; add(R.prism(along ? W_ + 0.3 : D_ + 0.3, along ? D_ + 0.35 : W_ + 0.35, 0.55), M.greyRoof, 0, wh, 0, along ? 0 : Math.PI / 2);
        add(R.box(0.26, 0.8, 0.26), TM.fieldStone, -W_ * 0.28, wh + 0.4, -D_ * 0.2);
        add(new THREE.DodecahedronGeometry(0.14, 0), TM.steam, -W_ * 0.28, wh + 0.95, -D_ * 0.2);
        add(R.box(fz ? 0.5 : 0.06, 0.06, fx ? 0.5 : 0.06), TM.iron, fx * (W_ / 2 + 0.03), 0.72, fz * (D_ / 2 + 0.03));
        door(W_, D_, 0.62);
        if (hall || v > 0.6) { const ax = fx * (W_ / 2 + 0.35) + (fz ? 0.5 : 0), az = fz * (D_ / 2 + 0.35) + (fx ? 0.5 : 0); add(R.box(0.2, 0.22, 0.12), TM.iron, ax, 0.2, az); add(R.box(0.14, 0.12, 0.14), TM.bark, ax, 0.05, az); }
      } else {
        add(R.box(W_, 0.5, D_), TM.fieldStone, 0, 0.25, 0);
        add(R.box(W_ * 0.96, 0.5, D_ * 0.96), M.timber, 0, 0.75, 0);
        const along = W_ >= D_; add(R.prism(along ? W_ + 0.35 : D_ + 0.35, along ? D_ + 0.4 : W_ + 0.4, 0.85), M.thatch, 0, 1.0, 0, along ? 0 : Math.PI / 2);
        door(W_, D_, 0.62);
        if (v > 0.45) { // 蜂の巣箱
          const bx = -fx * (W_ / 2 + 0.3) + (fz ? W_ / 2 - 0.2 : 0), bz = -fz * (D_ / 2 + 0.3) + (fx ? D_ / 2 - 0.2 : 0);
          add(R.box(0.22, 0.12, 0.22), TM.bark, bx, 0.06, bz); add(R.cyl(0.1, 0.13, 0.28, 8), M.thatch, bx, 0.26, bz);
        }
        add(R.box(fz ? W_ + 0.6 : 0.16, 0.24, fx ? D_ + 0.6 : 0.16), TM.fieldStone, -fx * (W_ / 2 + 0.45), 0.12, -fz * (D_ / 2 + 0.45)); // 石垣
      }
      break;
    }
    case 'pithouse': { // ハルン：黒い溶岩石の半地下、草の屋根、湯気と石灯籠
      add(R.box(W_, 0.42, D_), TM.lavaStone, 0, 0.21, 0);
      const along = W_ >= D_;
      add(R.prism(along ? W_ + 0.25 : D_ + 0.25, along ? D_ + 0.3 : W_ + 0.3, 0.55), TM.grassRoof, 0, 0.42, 0, along ? 0 : Math.PI / 2);
      add(R.box(fz ? 0.36 : 0.08, 0.3, fx ? 0.36 : 0.08), M.black, fx * (W_ / 2 + 0.02), 0.15, fz * (D_ / 2 + 0.02));
      for (let i = 1; i <= 2; i++) add(R.box(fz ? 0.36 : 0.12, 0.04, fx ? 0.36 : 0.12), TM.lavaStone, fx * (W_ / 2 + 0.1 * i), 0.02, fz * (D_ / 2 + 0.1 * i));
      // 石灯籠
      const lx = fx * (W_ / 2 + 0.3) + (fz ? W_ / 2 : 0), lz = fz * (D_ / 2 + 0.3) + (fx ? D_ / 2 : 0);
      add(R.box(0.1, 0.4, 0.1), TM.lavaStone, lx, 0.2, lz); add(R.box(0.18, 0.14, 0.18), M.lamp, lx, 0.47, lz); add(R.cone(0.17, 0.12, 4), TM.lavaStone, lx, 0.6, lz, Math.PI / 4);
      if (v > 0.4) { add(new THREE.DodecahedronGeometry(0.16, 0), TM.steam, -W_ * 0.3, 0.95, -D_ * 0.3); add(new THREE.DodecahedronGeometry(0.11, 0), TM.steam, -W_ * 0.25, 1.2, -D_ * 0.35); }
      if (hall) add(R.box(0.55, 0.06, 0.8), TM.red, -fx * 0.1 + (fz ? -W_ * 0.3 : 0), 0.62, 0); // 染めた布を屋根に干す
      break;
    }
    case 'whitestone': { // エルダ：崖の白い石の家、細い灯の塔、蔦
      const wh = hall ? 1.3 : 1.05;
      add(R.box(W_, wh, D_), TM.whiteStone, 0, wh / 2, 0);
      add(R.box(W_ + 0.08, 0.08, D_ + 0.08), TM.whiteStone, 0, wh + 0.04, 0);
      const tx = W_ / 2 - 0.18, tz = -D_ / 2 + 0.18, th = hall ? 2.8 : 2.1;
      add(R.cyl(0.12, 0.15, th, 8), TM.whiteStone, tx, th / 2, tz);
      add(R.box(0.16, 0.16, 0.16), M.lamp, tx, th + 0.08, tz);
      add(R.cone(0.16, 0.3, 8), TM.indigo, tx, th + 0.31, tz);
      for (let i = 0; i < 3; i++) add(R.box(0.04, 0.24 + hsh(b.x, i, 9) * 0.4, 0.22), TM.leaf, -W_ / 2 - 0.01, 0.12 + i * 0.28, -D_ / 2 + 0.3 + i * 0.4);
      for (const s of [-1, 1]) add(R.box(fz ? 0.14 : 0.05, 0.26, fx ? 0.14 : 0.05), M.win, fx * (W_ / 2 + 0.01) + (fz ? s * W_ * 0.3 : 0), wh * 0.6, fz * (D_ / 2 + 0.01) + (fx ? s * D_ * 0.3 : 0));
      door(W_, D_, 0.62);
      break;
    }
    default: return false;
  }
  // 集会所：戸口の前の焚き火と守り柱
  if (hall) {
    const d = Math.max(W_, D_) / 2 + 0.7;
    firePit(R, add, M, TM, fx * (Math.abs(fx) ? d : 0) + (fz ? 0.3 : 0), fz * (Math.abs(fz) ? d : 0) + (fx ? 0.3 : 0), 0.28);
    const c = TOTEM_COL[tr](TM);
    totem(R, add, M, TM, fx * (W_ / 2 + 0.3) + (fz ? -W_ / 2 : 0), fz * (D_ / 2 + 0.3) + (fx ? -D_ / 2 : 0), 1.5, c);
  }
  return true;
}
const TOTEM_COL = {
  fianna: (m) => [m.green, m.bone, m.rust], yarvi: (m) => [m.red, m.yellow, m.indigo], mahina: (m) => [m.red, m.teal, m.yellow], mictla: (m) => [m.green, m.red, m.yellow],
  dorgu: (m) => [m.blue, m.yellow, m.red], nefer: (m) => [m.blue, m.yellow, m.bone], garai: (m) => [m.rust, m.silver, m.iron], bolota: (m) => [m.red, m.rope, m.blue],
  harn: (m) => [m.red, m.yellow, m.obsidian], elda: (m) => [m.indigo, m.silver, m.yellow], hollin: (m) => [m.bone, m.blue, m.rope],
};

// ---- 祠（村の聖地。民族ごとに形がちがう）
function shrinePart(R, b, add, M, TM, W_, D_, face) {
  const tr = b.tribe, fx = face[0], fz = face[1];
  switch (tr) {
    case 'fianna': // 角の王の祠：大きな鹿の角を飾った石、まわりに土に刺した矢
      ringOfStones(R, add, M.stone, 8, 0.75, 0.12);
      add(R.box(0.55, 0.5, 0.45), M.stone, 0, 0.25, 0);
      add(R.box(0.1, 0.35, 0.1), TM.bone, 0, 0.65, 0);
      for (const s of [-1, 1]) {
        add(tilt(R.box(0.06, 0.5, 0.06), 0, -s * 0.6), TM.bone, s * 0.18, 0.88, 0);
        add(tilt(R.box(0.05, 0.3, 0.05), 0, -s * 0.2), TM.bone, s * 0.38, 1.18, 0);
        add(tilt(R.box(0.05, 0.25, 0.05), 0, s * 0.5), TM.bone, s * 0.22, 1.15, 0);
        add(tilt(R.box(0.04, 0.2, 0.04), 0, -s * 1.0), TM.bone, s * 0.5, 1.0, 0);
      }
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; add(tilt(R.box(0.025, 0.4, 0.025), 0.2, 0), TM.bark, Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55); add(R.box(0.06, 0.06, 0.02), TM.bone, Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55 + 0.04); }
      add(new THREE.DodecahedronGeometry(0.2, 0), TM.moss, 0.35, 0.1, -0.3);
      break;
    case 'yarvi': // 九つの石の火床
      ringOfStones(R, add, M.stone, 9, 0.62, 0.22, 0, 0, 0, 0.2);
      add(R.cone(0.24, 0.45, 6), M.fire, 0, 0.23, 0);
      for (let i = 0; i < 3; i++) { const g = tilt(R.cyl(0.025, 0.025, 1.2, 4), 0, 0.3); g.rotateY(i * 2.1); add(g, TM.bark, 0, 0.55, 0); }
      add(R.box(0.3, 0.5, 0.3), TM.fieldStone, -0.75, 0.25, -0.7);
      break;
    case 'mahina': // 潮見の柱：彫り物の柱に赤と青の帯、根元に花の輪
      add(R.cyl(0.13, 0.17, 2.6, 8), TM.bark, 0, 1.3, 0);
      for (let i = 0; i < 4; i++) add(R.cyl(0.18, 0.18, 0.1, 8), i % 2 ? TM.teal : TM.red, 0, 0.5 + i * 0.5, 0);
      add(R.box(0.3, 0.3, 0.3), TM.bark, 0, 2.6, 0); add(R.box(0.08, 0.06, 0.02), TM.shell || TM.bone, fx * 0.16 + (fz ? -0.07 : 0), 2.65, fz * 0.16); add(R.box(0.08, 0.06, 0.02), TM.bone, fx * 0.16 + (fz ? 0.07 : 0), 2.65, fz * 0.16 + (fx ? 0.07 : 0));
      add(R.box(0.7, 0.06, 0.06), TM.bark, 0, 2.3, 0, Math.atan2(fx, fz) + Math.PI / 2);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; add(R.box(0.1, 0.07, 0.1), i % 3 === 0 ? TM.yellow : TM.red, Math.cos(a) * 0.45, 0.04, Math.sin(a) * 0.45); }
      add(R.box(0.8, 0.12, 0.25), TM.bark, -0.5, 0.06, 0.55, 0.4); // 丸木舟
      break;
    case 'mictla': // 階段状の石の祠と蛇の頭の石像
      add(R.box(1.7, 0.35, 1.7), M.stone, 0, 0.175, 0); add(R.box(1.25, 0.35, 1.25), M.stone, 0, 0.525, 0); add(R.box(0.85, 0.35, 0.85), M.stone, 0, 0.875, 0);
      add(R.box(0.55, 0.45, 0.55), TM.plaster, 0, 1.275, 0); add(R.box(0.6, 0.08, 0.6), TM.green, 0, 1.4, 0);
      add(R.cone(0.5, 0.45, 4), TM.red, 0, 1.72, 0, Math.PI / 4);
      for (let i = 0; i < 3; i++) add(R.box(fz ? 0.4 : 0.2, 0.35 * (i + 1), fx ? 0.4 : 0.2), M.stone, fx * (0.95 - i * 0.2), 0.175 * (i + 1), fz * (0.95 - i * 0.2));
      for (const s of [-1, 1]) add(R.box(0.2, 0.22, 0.28), TM.jade, fx * 0.95 + (fz ? s * 0.35 : 0), 0.46, fz * 0.95 + (fx ? s * 0.35 : 0));
      break;
    case 'dorgu': // 石積みの祖霊塚と雷鳥の旗ざお（青い布）
      add(R.cone(0.7, 0.8, 7), TM.fieldStone, 0, 0.4, 0);
      add(R.box(0.07, 2.6, 0.07), TM.bark, 0, 1.3, 0);
      add(new THREE.BoxGeometry(0.03, 0.45, 0.7), TM.blue, 0, 2.3, 0.36); add(new THREE.BoxGeometry(0.035, 0.14, 0.35), TM.yellow, 0, 2.36, 0.3);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const g = tilt(new THREE.BoxGeometry(0.02, 0.02, 0.95), 0.6, 0); g.rotateY(a); add(g, i % 2 ? TM.blue : TM.yellow, Math.sin(a) * 0.35, 1.1, Math.cos(a) * 0.35); }
      break;
    case 'nefer': // 泉の祠：石の縁の泉、4本の柱と青い円屋根
      add(R.box(1.6, 0.14, 1.6), M.sandstone, 0, 0.07, 0); add(R.box(1.3, 0.05, 1.3), TM.water, 0, 0.13, 0);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(R.box(0.14, 1.0, 0.14), M.sandstone, x * 0.72, 0.6, z * 0.72);
      add(R.box(1.7, 0.1, 1.7), M.sandstone, 0, 1.12, 0);
      add(new THREE.SphereGeometry(0.62, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), TM.blue, 0, 1.16, 0);
      add(R.box(0.05, 0.25, 0.05), M.gold, 0, 1.9, 0);
      break;
    case 'garai': // 竜の洞への石段と、大きな共同の炉
      for (let i = 0; i < 4; i++) add(R.box(0.6, 0.2 * (i + 1), 0.3), TM.fieldStone, -0.45, 0.1 * (i + 1), 0.55 - i * 0.3);
      add(R.box(0.9, 0.7, 0.8), TM.fieldStone, 0.4, 0.35, -0.2); add(R.box(0.5, 0.3, 0.1), M.fire, 0.4, 0.25, 0.21);
      add(R.box(0.3, 0.9, 0.3), TM.fieldStone, 0.55, 1.1, -0.35); add(new THREE.DodecahedronGeometry(0.18, 0), TM.steam, 0.55, 1.7, -0.35);
      add(R.box(0.28, 0.2, 0.14), TM.iron, 0.5, 0.2, 0.6); add(R.box(0.18, 0.16, 0.18), TM.bark, 0.5, 0.08, 0.6);
      break;
    case 'bolota': // 主の浮島の祠（青い灯り）
      add(R.box(1.6, 0.08, 1.6), TM.water, 0, 0.04, 0);
      add(R.box(1.0, 0.12, 1.0), M.planks, 0, 0.12, 0);
      add(R.box(0.45, 0.45, 0.45), TM.bark, 0, 0.4, 0); add(R.prism(0.6, 0.6, 0.35), TM.reed, 0, 0.62, 0);
      add(R.box(0.14, 0.14, 0.14), TM.blueGlow, fx * 0.3, 0.3, fz * 0.3);
      for (const s of [-1, 1]) add(R.box(0.05, 1.2, 0.05), TM.bark, s * 0.45, 0.6, -0.45);
      add(R.box(0.12, 0.12, 0.12), TM.blueGlow, 0.45, 1.25, -0.45);
      break;
    case 'harn': // 火口への灯籠の道と、魔界を向いた祖霊の石
      for (let i = 0; i < 4; i++) { const x = -0.7 + i * 0.47, z = (i % 2 ? 0.25 : -0.25); add(R.box(0.1, 0.45, 0.1), TM.lavaStone, x, 0.22, z); add(R.box(0.18, 0.14, 0.18), TM.ember, x, 0.52, z); add(R.cone(0.16, 0.12, 4), TM.lavaStone, x, 0.65, z, Math.PI / 4); }
      add(R.box(0.35, 1.0, 0.25), TM.obsidian, 0.1, 0.5, -0.7);
      break;
    case 'elda': // 七つの灯の塔（小さな7本）と星見の石の輪
      ringOfStones(R, add, TM.whiteStone, 10, 0.78, 0.12);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, h = 1.2 + (i === 0 ? 0.8 : hsh(b.x, i, 3) * 0.5), x = Math.cos(a) * 0.45, z = Math.sin(a) * 0.45; add(R.cyl(0.06, 0.08, h, 6), TM.whiteStone, x, h / 2, z); add(R.box(0.1, 0.1, 0.1), M.lamp, x, h + 0.05, z); }
      add(R.box(0.2, 0.5, 0.2), TM.whiteStone, 0, 0.25, 0); add(new THREE.OctahedronGeometry(0.12, 0), TM.ice, 0, 0.62, 0);
      break;
    case 'hollin': // 麦袋の聖者の小さな祠と、白い糸の幕
      add(R.box(0.5, 0.5, 0.4), TM.fieldStone, 0, 0.25, 0); add(R.box(0.4, 0.4, 0.3), M.timber, 0, 0.7, 0); add(R.prism(0.6, 0.5, 0.3), M.thatch, 0, 0.9, 0);
      add(R.cyl(0.08, 0.1, 0.22, 6), M.thatch, fx * 0.28, 0.61, fz * 0.28);
      for (const s of [-1, 1]) add(R.box(0.05, 1.4, 0.05), TM.bark, s * 0.75, 0.7, -0.6);
      for (let i = 0; i < 5; i++) add(R.box(1.5, 0.012, 0.012), TM.felt, 0, 0.35 + i * 0.22, -0.6);
      break;
    default:
      ringOfStones(R, add, M.stone, 8, 0.7, 0.2); add(R.box(0.3, 0.8, 0.3), M.stone, 0, 0.4, 0);
  }
}

// ---- 守り神のすみかの目印（1マス。石の輪と、民族ごとの柱）
function lairMark(R, b, add, M, TM) {
  const tr = b.tribe;
  const ring = { yarvi: TM.ice, elda: TM.whiteStone, harn: TM.lavaStone, nefer: M.sandstone }[tr] || M.stone;
  ringOfStones(R, add, ring, 7, 0.46, 0.34, 0, 0, 0, 0.13);
  switch (tr) {
    case 'fianna': add(R.box(0.2, 0.6, 0.2), M.stone, 0, 0.3, 0); for (const s of [-1, 1]) { add(tilt(R.box(0.04, 0.35, 0.04), 0, -s * 0.6), TM.bone, s * 0.1, 0.72, 0); add(tilt(R.box(0.03, 0.2, 0.03), 0, s * 0.4), TM.bone, s * 0.2, 0.86, 0); } break;
    case 'yarvi': add(new THREE.OctahedronGeometry(0.28, 0).scale(0.6, 1.8, 0.6), TM.ice, 0, 0.5, 0); break;
    case 'mahina': add(R.cyl(0.08, 0.1, 1.0, 6), TM.bark, 0, 0.5, 0); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(R.box(0.06, 0.05, 0.06), i % 2 ? TM.yellow : TM.red, Math.cos(a) * 0.14, 0.9, Math.sin(a) * 0.14); } break;
    case 'dorgu': add(R.cone(0.3, 0.5, 6), TM.fieldStone, 0, 0.25, 0); add(R.box(0.04, 1.2, 0.04), TM.bark, 0, 0.6, 0); add(new THREE.BoxGeometry(0.02, 0.2, 0.3), TM.blue, 0, 1.05, 0.15); break;
    case 'mictla': add(R.box(0.3, 0.3, 0.3), TM.jade, 0, 0.15, 0); add(R.box(0.2, 0.2, 0.28), TM.jadeGlow, 0, 0.4, 0.04); break;
    default: add(R.box(0.2, 0.9, 0.2), M.darkStone, 0, 0.45, 0); add(R.box(0.22, 0.08, 0.22), TM.red, 0, 0.6, 0);
  }
  add(R.cyl(0.08, 0.06, 0.08, 6), TM.clay, 0.25, 0.04, 0.2); // 供え物の鉢
}

// ================================================================ 里の飾り（柵の杭・広場の焚き火・守り柱・干し棚）。描画の最初に1回
export function tribalExtras(R, wx, wz, topY) {
  const S = R.sim.S, w = S.world, M = R.mats, TM = tribeMats(R);
  const villages = w.settlements.filter((s) => s.tribal);
  if (!villages.length) return;
  const byMat = new Map();
  const put = (geo, mat, x, y, z, ry = 0) => { const g = geo.index ? geo.toNonIndexed() : geo; if (ry) g.rotateY(ry); g.translate(x, y, z); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); };
  const Y = (x, z) => topY(w.hgt[z * W + x]);
  for (const s of villages) {
    const tr = s.tribe, R0 = s.r + 1;
    const stoneWall = ['garai', 'hollin', 'nefer', 'elda'].includes(tr);
    const wallM = { garai: TM.fieldStone, hollin: TM.fieldStone, nefer: M.sandstone, elda: TM.whiteStone }[tr];
    const stakeM = tr === 'bolota' ? TM.reed : TM.bark;
    for (let z = s.z - R0 - 1; z <= s.z + R0 + 1; z++) for (let x = s.x - R0 - 1; x <= s.x + R0 + 1; x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (w.tiles[z * W + x] !== T.FENCE) continue;
      const cx = wx(x), cz = wz(z), y = Y(x, z);
      if (stoneWall) put(new THREE.BoxGeometry(0.9, 0.5, 0.9), wallM, cx, y + 0.25, cz);
      else for (let k = 0; k < 3; k++) { const ox = (hsh(x, z, k) - 0.5) * 0.7, oz = (hsh(x, z, k + 5) - 0.5) * 0.7, h = 0.75 + hsh(x, z, k + 9) * 0.3; put(R.cyl(0.07, 0.08, h, 5), stakeM, cx + ox, y + h / 2, cz + oz); put(R.cone(0.075, 0.18, 5), stakeM, cx + ox, y + h + 0.09, cz + oz); }
    }
    // 広場の焚き火と守り柱
    const px_ = wx(s.x), pz = wz(s.z), py = Y(s.x, s.z);
    const add = (geo, mat, x, y, z, ry = 0) => put(geo, mat, px_ + x, py + y, pz + z, ry);
    // 広場のまん中は人が集まるので、焚き火と守り柱は斜めの角のマスに置く（建物のマスはさける）
    const okAt = (dx, dz) => { const t = w.tiles[(s.z + dz) * W + s.x + dx]; return t !== T.BLD && t !== T.FENCE && t !== T.WALL; };
    const diag = [[1, 1], [-1, -1], [1, -1], [-1, 1]].filter(([dx, dz]) => okAt(dx, dz));
    const [fdx, fdz] = diag[0] || [0, 0], [tdx, tdz] = diag.find(([dx, dz]) => dx === -fdx && dz === -fdz) || diag[1] || [0.75, -0.75];
    firePit(R, add, M, TM, fdx, fdz, 0.32);
    totem(R, add, M, TM, tdx, tdz, 2.0, TOTEM_COL[tr] ? TOTEM_COL[tr](TM) : [TM.red, TM.yellow, TM.blue]);
    // 民族ごとの小さな飾り（家の近くの空き地に）
    const spots = [];
    for (let z = s.z - s.r; z <= s.z + s.r; z++) for (let x = s.x - s.r; x <= s.x + s.r; x++) { const t = w.tiles[z * W + x]; if ((t === T.GRASS || t === T.FOREST || t === T.DENSE || t === T.SAND || t === T.BEACH || t === T.SNOW || t === T.JUNGLE || t === T.SAVANNA || t === T.SWAMP || t === T.DESERT) && hsh(x, z, 31) < 0.12) spots.push([x, z]); }
    for (const [x, z] of spots.slice(0, 10)) {
      const a = (hsh(x, z, 3) * 4 | 0) * Math.PI / 2, gx = wx(x), gz = wz(z), gy = Y(x, z);
      const ad = (geo, mat, xx, yy, zz, ry = 0) => put(geo, mat, gx + xx, gy + yy, gz + zz, ry);
      if (tr === 'mahina' || tr === 'bolota' || tr === 'yarvi') dryRack(R, ad, M, TM, 0, 0, a, tr !== 'yarvi' || hsh(x, z, 4) < 0.5);
      else if (tr === 'dorgu') { ad(R.box(0.5, 0.12, 0.3), TM.felt, 0, 0.06, 0, a); ad(R.cyl(0.12, 0.12, 0.3, 6), TM.bark, 0.4, 0.15, 0.2); }
      else if (tr === 'fianna' || tr === 'mictla') { ad(R.cyl(0.12, 0.14, 0.26, 6), TM.clay, 0, 0.13, 0); ad(R.box(0.3, 0.08, 0.3), TM.rope, 0.3, 0.04, -0.2, a); }
      else ad(R.box(0.35, 0.3, 0.35), TM.bark, 0, 0.15, 0, a);
    }
  }
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    R.scene.add(mesh);
  }
}

// ================================================================ 建物の中
export function tribalLabel(b) {
  if (b.style === 'lair') return '守り神のすみか';
  if (b.type === 'shrine') return '民の祠';
  if (b.hall) return '集会所';
  return { roundhut: '丸小屋', tent: '皮の天幕', stilt: '高床の家', platform: '基壇の家', yurt: '白い天幕', adobe: '砂岩の家', stonehut: '石の家', pithouse: '半地下の家', whitestone: '白い石の家' }[b.style] || '民の家';
}
// 民族ごとの部屋の材質と色
function roomStyle(M, tr, st) {
  const T_ = (c) => M.tinted(c);
  switch (st) {
    case 'roundhut': return { floor: M.dirt, wall: M.wood, trim: M.darkWood, h: 2.1, rug: T_('#6a8a4a'), fur: T_('#8a6a4a'), accent: T_('#3f7a2e') };
    case 'tent': return { floor: M.dirt, wall: T_('#b8966a'), trim: M.darkWood, h: 2.4, rug: T_('#c9463a'), fur: T_('#e8e0d0'), accent: T_('#2a4a8a') };
    case 'stilt': return tr === 'bolota' ? { floor: M.planks, wall: T_('#8a8a4a'), trim: M.darkWood, h: 2.0, rug: T_('#8a3a3a'), fur: T_('#6a7a4a'), accent: T_('#3a6ab0') }
      : { floor: M.planks, wall: T_('#c8b068'), trim: M.darkWood, h: 2.2, rug: T_('#e8d8a8'), fur: T_('#d9463a'), accent: T_('#3ab0c8') };
    case 'platform': return { floor: M.stone, wall: M.plaster, trim: T_('#3a9a6a'), h: 2.3, rug: T_('#f0e8d0'), fur: T_('#3a9a6a'), accent: T_('#d9463a') };
    case 'yurt': return { floor: M.carpet, wall: T_('#eee8da'), trim: T_('#c83a2a'), h: 2.2, rug: M.carpetBlue, fur: T_('#8a6a4a'), accent: T_('#e8c83a') };
    case 'adobe': return { floor: M.sandFloor, wall: M.sandstone, trim: T_('#2a5aa8'), h: 2.3, rug: M.carpetBlue, fur: T_('#f0e8d0'), accent: T_('#2a5aa8') };
    case 'stonehut': return tr === 'garai' ? { floor: M.stone, wall: M.stone, trim: M.darkWood, h: 2.2, rug: T_('#c2542d'), fur: T_('#6a6a70'), accent: T_('#c9a23a') }
      : { floor: M.planks, wall: M.plaster, trim: M.darkWood, h: 2.3, rug: T_('#5a7a9a'), fur: T_('#c8c0b0'), accent: T_('#5a7a9a') };
    case 'pithouse': return { floor: M.dirt, wall: M.darkStone, trim: M.soot, h: 1.9, rug: T_('#d9463a'), fur: T_('#4a3a3a'), accent: T_('#e8883a') };
    case 'whitestone': return { floor: M.whiteTile, wall: M.plaster, trim: T_('#3a3a6a'), h: 2.6, rug: M.carpetPurple, fur: T_('#c8c0e8'), accent: T_('#3a3a6a') };
    default: return { floor: M.dirt, wall: M.wood, trim: M.darkWood, h: 2.2, rug: T_('#8a6a4a'), fur: T_('#8a6a4a'), accent: T_('#c9463a') };
  }
}
// 炉：床のまん中の石囲いの火（天井の煙穴の光）
function centerHearth(K, F, x, z, o = {}) {
  const M = K.M;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; K.box(x + Math.cos(a) * 0.5 - 0.12, 0, z + Math.sin(a) * 0.5 - 0.12, 0.24, 0.18, 0.24, o.stone || M.stone); }
  K.box(x - 0.3, 0.02, z - 0.08, 0.6, 0.1, 0.16, M.darkWood, { ry: 0.6 }); K.box(x - 0.3, 0.02, z - 0.08, 0.6, 0.1, 0.16, M.darkWood, { ry: -0.7 });
  K.box(x - 0.2, 0.05, z - 0.2, 0.4, 0.08, 0.4, M.coal);
  K.cyl(x, 0.1, z, 0.2, 0.35, M.fire, { r2: 0.04, seg: 6 }); K.cyl(x, 0.12, z, 0.1, 0.45, M.fire2, { r2: 0.02, seg: 5 });
  if (o.pot) { K.box(x - 0.45, 0, z - 0.03, 0.06, 1.0, 0.06, M.darkWood); K.box(x + 0.39, 0, z - 0.03, 0.06, 1.0, 0.06, M.darkWood); K.box(x - 0.45, 0.95, z - 0.03, 0.9, 0.05, 0.06, M.darkWood); K.cyl(x, 0.55, z, 0.2, 0.26, M.iron, { r2: 0.24, seg: 8 }); }
  K.solid(x - 0.6, z - 0.6, 1.2, 1.2);
  K.light(x, 0.9, z, '#ff9a40', o.li || 3.4, o.ld || 7, 1.4);
  if (o.beam !== false) K.box(x - 0.3, 0.01, z - 0.3, 0.6, 0.01, 0.6, M.beam);
}
// 床の寝床（毛皮を重ねた低い寝台）
function furBed(K, F, x, z, o) {
  const M = K.M, w = o.dir === 'x' ? 2 : 1, d = o.dir === 'x' ? 1 : 2;
  K.box(x + 0.05, 0, z + 0.05, w - 0.1, 0.1, d - 0.1, o.base || M.straw);
  K.box(x + 0.1, 0.1, z + 0.1, w - 0.2, 0.08, d - 0.2, o.fur);
  if (o.dir === 'x') K.box(x + 0.12, 0.18, z + 0.2, 0.4, 0.08, d - 0.4, o.pillow || M.sack); else K.box(x + 0.2, 0.18, z + 0.12, w - 0.4, 0.08, 0.4, o.pillow || M.sack);
  K.box(o.dir === 'x' ? x + 0.8 : x + 0.08, 0.17, o.dir === 'x' ? z + 0.08 : z + 0.8, o.dir === 'x' ? w - 0.9 : w - 0.16, 0.05, o.dir === 'x' ? d - 0.16 : d - 0.9, o.blanket || o.fur);
  K.solid(x, z, w, d);
  K.slot('bed', x + w / 2, z + d / 2, { y: 0.24, lie: true, face: o.dir === 'x' ? [1, 0] : [0, 1] });
}
// 敷物に座って食べる席
function mats(K, x, z, n, mat, face) { for (let i = 0; i < n; i++) { K.box(x + i * 0.9 - 0.3, 0, z - 0.3, 0.6, 0.04, 0.6, mat); K.slot('eat', x + i * 0.9, z, { face }); } }
// 天井から下げた干し物（干し魚・薬草・肉）
function hang(K, x0, z, n, y, mats) {
  const M = K.M;
  K.box(x0 - 0.1, y + 0.3, z - 0.02, n * 0.35 + 0.2, 0.04, 0.04, M.darkWood);
  for (let i = 0; i < n; i++) { const m = mats[i % mats.length]; K.box(x0 + i * 0.35, y - 0.05, z - 0.05, 0.12, 0.32, 0.1, m); K.box(x0 + i * 0.35 + 0.05, y + 0.27, z - 0.01, 0.02, 0.05, 0.02, M.darkWood); }
}
// 祭壇（民族ごとの守り神の像・供え物・灯り）
function altar(K, F, tr, x, z, side = 'N') {
  const M = K.M, T_ = (c) => M.tinted(c);
  K.box(x - 0.6, 0, z, 1.2, 0.55, 0.5, tr === 'nefer' ? M.sandstone : tr === 'elda' || tr === 'mictla' ? M.stone : M.darkWood);
  K.box(x - 0.65, 0.55, z - 0.02, 1.3, 0.06, 0.55, T_({ fianna: '#3f7a2e', yarvi: '#c9463a', mahina: '#e8d8a8', mictla: '#3a9a6a', dorgu: '#3a6ab0', nefer: '#2a5aa8', garai: '#c2542d', bolota: '#8a3a3a', harn: '#d9463a', elda: '#3a3a6a', hollin: '#f0ece0' }[tr] || '#c9463a'));
  switch (tr) {
    case 'fianna': for (const s of [-1, 1]) { K.box(x + s * 0.12 - 0.03, 0.61, z + 0.2, 0.06, 0.45, 0.06, M.bone); K.box(x + s * 0.28 - 0.03, 0.9, z + 0.2, 0.06, 0.3, 0.06, M.bone); } break;
    case 'yarvi': K.box(x - 0.15, 0.61, z + 0.12, 0.3, 0.5, 0.25, M.stone); K.box(x - 0.1, 1.11, z + 0.15, 0.2, 0.12, 0.2, M.stone); break;
    case 'mahina': K.box(x - 0.1, 0.61, z + 0.15, 0.2, 0.6, 0.2, M.wood); for (let i = 0; i < 6; i++) K.box(x - 0.45 + i * 0.18, 0.61, z + 0.35, 0.1, 0.08, 0.1, i % 2 ? M.orange : M.red); break;
    case 'mictla': K.box(x - 0.2, 0.61, z + 0.1, 0.4, 0.3, 0.3, T_('#3ab07a')); K.box(x - 0.12, 0.91, z + 0.14, 0.24, 0.2, 0.22, T_('#3ab07a')); K.box(x + 0.3, 0.61, z + 0.25, 0.14, 0.1, 0.14, M.brown); break;
    case 'dorgu': K.box(x - 0.18, 0.61, z + 0.1, 0.36, 0.08, 0.3, M.gold); K.box(x - 0.02, 0.69, z + 0.2, 0.04, 0.7, 0.04, M.darkWood); K.box(x + 0.02, 1.05, z + 0.2, 0.03, 0.3, 0.3, M.blue); break;
    case 'nefer': K.box(x - 0.14, 0.61, z + 0.1, 0.28, 0.5, 0.25, M.gold); K.box(x - 0.1, 1.11, z + 0.12, 0.2, 0.14, 0.2, M.blue); break;
    case 'garai': K.box(x - 0.2, 0.61, z + 0.1, 0.4, 0.25, 0.3, M.iron); K.box(x - 0.08, 0.86, z + 0.18, 0.16, 0.14, 0.14, M.red); break;
    case 'bolota': K.box(x - 0.08, 0.61, z + 0.15, 0.16, 0.16, 0.16, M.clay); K.box(x - 0.05, 0.9, z + 0.18, 0.1, 0.1, 0.1, T_('#4a9aff')); K.light(x, 1.2, z + 0.5, '#6ab0ff', 1.4, 3.5, 0.5); break;
    case 'harn': K.box(x - 0.12, 0.61, z + 0.12, 0.24, 0.5, 0.2, M.black); K.box(x - 0.08, 0.7, z + 0.33, 0.16, 0.1, 0.02, M.coal); break;
    case 'elda': K.box(x - 0.08, 0.61, z + 0.15, 0.16, 0.3, 0.16, M.crystal); K.light(x, 1.2, z + 0.5, '#80d0ff', 1.6, 4, 0.3); break;
    default: K.box(x - 0.12, 0.61, z + 0.15, 0.24, 0.35, 0.2, M.sack); K.cyl(x, 0.96, z + 0.25, 0.08, 0.12, M.hay, { seg: 6 });
  }
  F.candle(K, x - 0.45, z + 0.25, 0.61, { noStand: true, li: 1.2 }); F.candle(K, x + 0.45, z + 0.25, 0.61, { noStand: true, light: false });
  K.solid(x - 0.6, z, 1.2, 0.6);
  K.slot('pew', x, z + 1.1, { face: [0, -1] });
  K.slot('pew', x - 0.8, z + 1.2, { face: [0, -1] });
}
// 民族ごとの品（壁ぎわに並べる）
function tribalGoods(K, F, tr, W, D) {
  const M = K.M, T_ = (c) => M.tinted(c), R = K.R;
  switch (tr) {
    case 'fianna': // 弓と矢筒、薬草の束、木の実のかご
      for (let i = 0; i < 2; i++) { K.box(W - 0.12, 0.8 + i * 0.1, 1.2 + i * 0.6, 0.04, 1.1, 0.06, M.wood, { g: 'E' }); }
      hang(K, 1.2, 0.6, 4, 1.7, [M.leaf, M.cabbage, T_('#8a6a3a')]);
      F.sack(K, 0.5, D - 0.6); K.cyl(1.2, 0, D - 0.6, 0.25, 0.25, M.straw, { r2: 0.3 }); K.box(1.0, 0.25, D - 0.8, 0.4, 0.08, 0.4, T_('#8a4a2a'));
      break;
    case 'yarvi': // トナカイの角、干した肉、橇
      hang(K, 1.2, 0.6, 4, 1.8, [M.meat, T_('#8a3a2a')]);
      F.wallPic(K, 'N', W / 2, 1.6, 0.9, 0.08, M.bone); for (const s of [-1, 1]) F.wallPic(K, 'N', W / 2 + s * 0.35, 1.7, 0.08, 0.35, M.bone);
      K.box(W - 1.6, 0, D - 1.0, 1.3, 0.2, 0.5, M.wood); K.box(W - 1.6, 0.2, D - 1.0, 1.3, 0.05, 0.05, M.darkWood); K.solid(W - 1.6, D - 1.0, 1.3, 0.5);
      break;
    case 'mahina': // 櫂と網、干し魚、貝の簾
      hang(K, 1.2, 0.6, 5, 1.6, [M.fish, M.fish, T_('#c8a060')]);
      K.box(W - 0.15, 0.2, 1.0, 0.06, 1.6, 0.18, M.wood, { g: 'E' }); K.box(W - 0.16, 0.2, 1.0, 0.07, 0.4, 0.3, M.wood, { g: 'E' });
      F.wallPic(K, 'W', D / 2, 0.8, 1.4, 1.0, T_('#b8a060'), {}); for (let i = 0; i < 5; i++) K.box(0.05, 0.9 + i * 0.18, D / 2 - 0.6 + (i % 3) * 0.4, 0.03, 0.06, 0.06, M.white, { g: 'W' });
      break;
    case 'mictla': // 機織り機、吹き矢、カカオの壺、つり床
      K.box(1.0, 0, D - 1.1, 1.2, 0.8, 0.12, M.wood); K.box(1.1, 0.3, D - 1.08, 1.0, 0.45, 0.02, T_('#d9463a')); K.slot('work', 1.6, D - 0.6, { face: [0, -1] }); K.solid(1.0, D - 1.1, 1.2, 0.3);
      for (let i = 0; i < 3; i++) K.cyl(W - 0.5, 0, 1.2 + i * 0.55, 0.18, 0.4, M.clay, { r2: 0.12, seg: 7 });
      break;
    case 'dorgu': // 色の箪笥、馬具、乳の桶
      K.box(W - 1.9, 0, 0.1, 1.6, 0.8, 0.5, T_('#c83a2a')); K.box(W - 1.8, 0.2, 0.61, 0.6, 0.3, 0.02, M.gold); K.box(W - 1.05, 0.2, 0.61, 0.6, 0.3, 0.02, M.gold); K.solid(W - 1.9, 0.1, 1.6, 0.6);
      K.cyl(0.5, 0, D - 0.6, 0.22, 0.4, M.wood, { seg: 8 }); K.cyl(0.5, 0.4, D - 0.6, 0.2, 0.02, M.white, { seg: 8 });
      K.box(0.1, 1.2, 1.4, 0.06, 0.4, 0.5, T_('#6a4a2a'), { g: 'W' });
      break;
    case 'nefer': // 水がめ、星読みの板、ナツメヤシの籠
      for (let i = 0; i < 3; i++) K.cyl(W - 0.5, 0, 1.0 + i * 0.6, 0.2, 0.55, M.clay, { r2: 0.12, seg: 8 });
      F.wallPic(K, 'N', 1.6, 1.2, 0.9, 0.7, M.starchart); K.box(0.9, 0, D - 0.9, 0.5, 0.25, 0.5, M.straw); K.box(1.0, 0.25, D - 0.8, 0.3, 0.06, 0.3, M.brown);
      break;
    case 'garai': // 金床と小さな炉、鉱石の箱、つるはし
      K.box(W - 1.7, 0, 0.1, 1.2, 0.8, 0.7, M.stone); K.box(W - 1.5, 0.1, 0.75, 0.8, 0.4, 0.06, M.coal); K.light(W - 1.1, 0.7, 1.2, '#ff7a30', 2.4, 5, 1.2); K.solid(W - 1.7, 0.1, 1.2, 0.8);
      K.box(W - 1.6, 0, 1.5, 0.4, 0.4, 0.3, M.darkWood); K.box(W - 1.65, 0.4, 1.47, 0.5, 0.14, 0.36, M.iron); K.slot('work', W - 1.4, 2.3, { face: [0, -1] }); K.solid(W - 1.6, 1.5, 0.4, 0.3);
      K.box(0.4, 0, D - 0.9, 0.6, 0.3, 0.5, M.wood); for (let i = 0; i < 4; i++) K.box(0.5 + (i % 2) * 0.2, 0.3, D - 0.85 + (i >> 1) * 0.2, 0.15, 0.1, 0.15, M.ore);
      break;
    case 'bolota': // ウナギの筌、葦の敷物、青い灯り
      for (let i = 0; i < 3; i++) K.cyl(W - 0.5, 0, 1.2 + i * 0.6, 0.18, 0.5, M.straw, { r2: 0.08, seg: 7 });
      hang(K, 1.2, 0.6, 4, 1.5, [M.fish, T_('#6a5a3a')]);
      K.box(W / 2 - 0.1, 1.7, D / 2 - 0.1, 0.2, 0.2, 0.2, T_('#4a9aff')); K.light(W / 2, 1.5, D / 2, '#6ab0ff', 1.6, 5, 0.6);
      break;
    case 'harn': // 黒曜の刃、硫黄の護符、染めた布
      F.wallPic(K, 'W', D / 2, 0.6, 1.4, 1.2, T_('#d9463a')); F.wallPic(K, 'W', D / 2 + 0.2, 0.9, 0.5, 0.8, T_('#e8883a'));
      K.box(W - 0.8, 0, 1.0, 0.6, 0.5, 0.5, M.darkWood); for (let i = 0; i < 3; i++) K.box(W - 0.75 + i * 0.18, 0.5, 1.15, 0.08, 0.02, 0.25, M.black);
      K.box(W - 0.7, 0.5, 1.3, 0.14, 0.14, 0.14, T_('#e8d040'));
      break;
    case 'elda': // 古文書の棚、星図、灯の角灯
      F.shelf(K, 1, 0, 2, 'N', M.books, { h: 1.9 }); F.wallPic(K, 'W', D / 2, 1.1, 1.0, 0.9, M.starchart);
      K.box(W - 0.9, 0, 1.0, 0.6, 0.7, 0.6, M.darkWood); K.box(W - 0.75, 0.7, 1.15, 0.3, 0.3, 0.3, M.lamp); K.light(W - 0.6, 1.2, 1.3, '#ffe0a0', 1.8, 5, 0.3); K.solid(W - 0.9, 1.0, 0.6, 0.6);
      break;
    case 'hollin': // 機織り機、蜂蜜の壺、鎌
      K.box(1.0, 0, D - 1.1, 1.2, 0.9, 0.12, M.wood); K.box(1.1, 0.3, D - 1.08, 1.0, 0.5, 0.02, T_('#c8c0b0')); K.slot('work', 1.6, D - 0.6, { face: [0, -1] }); K.solid(1.0, D - 1.1, 1.2, 0.3);
      for (let i = 0; i < 3; i++) K.cyl(W - 0.5, 0, 1.2 + i * 0.5, 0.14, 0.3, T_('#e8b040'), { r2: 0.12, seg: 7 });
      K.box(W - 0.12, 0.9, 2.8, 0.04, 0.8, 0.05, M.wood, { g: 'E' }); K.box(W - 0.13, 1.6, 2.6, 0.05, 0.05, 0.4, M.steel, { g: 'E' });
      break;
  }
}

// 内装を組む。返り値 true … 民族の内装を作った
export function tribalInterior(K, ctx, F) {
  const b = ctx.b, tr = b.tribe, st = b.style, { M, R, W, D } = K;
  const rs = roomStyle(M, tr, st);
  const hh = ctx.hh, members = hh ? hh.members.length : 0;
  if (st === 'lair') { lairInterior(K, F, tr); return true; }
  if (b.type === 'shrine') { shrineInterior(K, F, tr, rs); return true; }
  const door = Math.floor(W / 2);
  const winN = st === 'tent' || st === 'yurt' || st === 'pithouse' || st === 'roundhut' ? [] : F.winAt(1, W, R).map((x) => Math.min(x, W - 3));
  F.room(K, { floor: rs.floor, wall: rs.wall, trim: rs.trim, h: rs.h, beams: st === 'roundhut' || st === 'stilt' || st === 'yurt' || st === 'tent', door, win: { N: winN, W: st === 'adobe' || st === 'whitestone' || st === 'stonehut' ? [2] : [], E: [], S: [] }, sunbeams: winN.length > 0 });
  // 天幕の壁ぎわの骨組み（格子と柱。天井は見えるよう開けておく）
  if (st === 'yurt' || st === 'tent') {
    for (let x = 1; x < W; x += 1.5) K.box(x - 0.04, 0, 0.02, 0.08, rs.h, 0.06, M.darkWood, { g: 'N' });
    for (let z = 1; z < D; z += 1.5) K.box(0.02, 0, z - 0.04, 0.06, rs.h, 0.08, M.darkWood, { g: 'W' });
  }
  if (b.hall) { hallInterior(K, F, tr, rs); return true; }
  // ---- 家：まん中に炉、壁ぎわに毛皮の寝床、奥に祭壇、民族の品
  const hx = W / 2, hz = D / 2 + 0.2;
  centerHearth(K, F, hx, hz, { pot: tr !== 'nefer', stone: st === 'pithouse' ? M.darkStone : M.stone });
  F.rug(K, hx - 1.6, hz - 1.4, 3.2, 2.8, rs.rug, rs.accent);
  // 食べる席：炉を囲む敷物
  const seats = Math.max(2, Math.min(6, members || 2));
  const ring = [[0, -1.1, [0, 1]], [0, 1.1, [0, -1]], [-1.2, 0, [1, 0]], [1.2, 0, [-1, 0]], [-1.0, -0.9, [1, 1]], [1.0, 0.9, [-1, -1]]];
  for (let i = 0; i < seats; i++) { const [dx, dz, f] = ring[i]; K.box(hx + dx - 0.28, 0.03, hz + dz - 0.28, 0.56, 0.05, 0.56, rs.fur); K.slot('eat', hx + dx, hz + dz, { face: [Math.sign(f[0]), Math.sign(f[1])] }); }
  // 毛皮の寝床（西と東の壁ぞい）
  const nb = Math.max(1, Math.min(5, members || 1));
  const beds = [];
  for (let z = 1.2; z + 2 <= D - 1 && beds.length < nb; z += 2.1) beds.push([0.15, z]);
  for (let z = 1.2; z + 2 <= D - 1 && beds.length < nb; z += 2.1) beds.push([W - 1.15, z]);
  const furs = [rs.fur, M.tinted('#8a6a4a'), M.tinted('#e8e0d0'), M.tinted('#5a4a3a'), rs.accent];
  beds.forEach(([x, z], i) => furBed(K, F, x, z, { fur: furs[i % furs.length], blanket: i % 2 ? rs.rug : null }));
  // 祭壇（北の壁の左寄り）と、民族の品
  altar(K, F, tr, 1.6, 0.1);
  tribalGoods(K, F, tr, W, D);
  K.slot('work', hx + 1.4, hz + 1.5, { face: [-1, -1] });
  return true;
}
function hallInterior(K, F, tr, rs) {
  const { M, W, D } = K;
  const hx = W / 2, hz = D / 2 + 0.3;
  centerHearth(K, F, hx, hz, { li: 4.5, ld: 9 });
  // 長老の座（北の壁のまん中）と、両脇の太鼓
  K.box(hx - 0.8, 0, 0.2, 1.6, 0.35, 0.9, rs.fur); K.box(hx - 0.8, 0.35, 0.1, 1.6, 0.7, 0.2, rs.accent);
  K.slot('work', hx, 0.8, { face: [0, 1] });
  for (const s of [-1, 1]) { K.cyl(hx + s * 1.5, 0, 0.7, 0.28, 0.5, M.wood, { seg: 10 }); K.cyl(hx + s * 1.5, 0.5, 0.7, 0.29, 0.03, M.tinted('#e8dcc0'), { seg: 10 }); K.solid(hx + s * 1.5 - 0.3, 0.4, 0.6, 0.6); }
  // 炉を囲む丸太の腰かけ
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2, x = hx + Math.cos(a) * 2.0, z = hz + Math.sin(a) * 1.7; if (z < 1.4) continue; K.cyl(x, 0, z, 0.2, 0.36, M.wood, { seg: 7 }); K.slot('seat', x, z, { y: 0.1, face: [Math.round(-Math.cos(a)), Math.round(-Math.sin(a))] }); }
  F.banner(K, 'W', D / 2, rs.accent.color ? '#' + rs.accent.color.getHexString() : '#c9463a');
  F.torch(K, 'E', D / 2, 1.5);
  altar(K, F, tr, W - 2.0, 0.1);
  hang(K, 1.0, 0.6, 5, 1.8, [M.meat, M.fish, M.leaf]);
  for (let i = 0; i < 3; i++) F.barrel(K, 0.5, D - 0.6 - i * 0.7, { h: 0.6, r: 0.25 });
  F.rug(K, hx - 2.6, hz - 2.0, 5.2, 4.0, rs.rug, rs.accent);
}
function shrineInterior(K, F, tr, rs) {
  // 祠は外の聖地：地面に石の輪、奥に祭壇、まん中に民族の目印、祈りの敷物
  const { M, R, W, D } = K;
  K.open = true;
  const ground = { yarvi: M.tinted('#e8f0f4'), nefer: M.sandFloor, harn: M.darkStone, mictla: M.stone, elda: M.plaza, garai: M.rock, bolota: M.tinted('#5a6a4a') }[tr] || M.grass;
  K.box(-0.5, -0.3, -0.5, W + 1, 0.3, D + 1, ground);
  const cx = W / 2, cz = D / 2 - 0.4;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = cx + Math.cos(a) * (W / 2 - 0.8), z = cz + Math.sin(a) * (D / 2 - 0.9); if (z > D - 1.6 && Math.abs(x - cx) < 1.2) continue; const h = R.range(0.4, 0.9); K.box(x - 0.22, 0, z - 0.2, 0.44, h, 0.4, tr === 'elda' ? M.white : tr === 'harn' ? M.darkStone : M.stone, { ry: a }); K.solid(x - 0.3, z - 0.3, 0.6, 0.6); }
  const T_ = (c) => M.tinted(c);
  switch (tr) {
    case 'fianna': K.box(cx - 0.5, 0, cz - 0.4, 1.0, 0.9, 0.8, M.stone); for (const s of [-1, 1]) { K.box(cx + s * 0.25 - 0.05, 0.9, cz - 0.05, 0.1, 0.8, 0.1, M.bone, { rz: -s * 0.5 }); K.box(cx + s * 0.6 - 0.04, 1.4, cz - 0.04, 0.08, 0.5, 0.08, M.bone, { rz: s * 0.3 }); K.box(cx + s * 0.35 - 0.04, 1.5, cz - 0.04, 0.08, 0.4, 0.08, M.bone, { rz: -s * 0.3 }); } break;
    case 'yarvi': for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; K.box(cx + Math.cos(a) * 0.9 - 0.2, 0, cz + Math.sin(a) * 0.9 - 0.2, 0.4, 0.35, 0.4, M.stone); } K.cyl(cx, 0, cz, 0.35, 0.6, M.fire, { r2: 0.05, seg: 6 }); K.light(cx, 1, cz, '#ff9a40', 3.5, 7, 1.4); break;
    case 'mahina': case 'dorgu': case 'hollin': { const cols = tr === 'mahina' ? [M.red, T_('#3ab0c8')] : tr === 'dorgu' ? [M.blue, T_('#e8c83a')] : [M.white, T_('#5a7a9a')]; K.cyl(cx, 0, cz, 0.2, 3.2, M.wood, { r2: 0.16, seg: 8 }); for (let i = 0; i < 5; i++) K.cyl(cx, 0.6 + i * 0.5, cz, 0.24, 0.12, cols[i % 2], { seg: 8 }); if (tr === 'dorgu') K.box(cx, 2.6, cz - 0.02, 0.9, 0.6, 0.04, M.blue); if (tr === 'mahina') K.box(cx - 0.25, 3.1, cz - 0.25, 0.5, 0.5, 0.5, M.wood); break; }
    case 'mictla': for (let i = 0; i < 3; i++) K.box(cx - 1.2 + i * 0.4, i * 0.4, cz - 1.2 + i * 0.4, 2.4 - i * 0.8, 0.4, 2.4 - i * 0.8, M.stone); K.box(cx - 0.3, 1.2, cz - 0.3, 0.6, 0.5, 0.6, T_('#3ab07a')); break;
    case 'nefer': K.box(cx - 1, 0, cz - 1, 2, 0.2, 2, M.sandstone); K.box(cx - 0.8, 0.05, cz - 0.8, 1.6, 0.2, 1.6, M.water); break;
    case 'garai': K.box(cx - 0.8, 0, cz - 0.5, 1.6, 1.0, 1.0, M.stone); K.box(cx - 0.4, 0.2, cz + 0.45, 0.8, 0.4, 0.1, M.coal); K.light(cx, 0.8, cz + 1, '#ff7a30', 3, 6, 1.2); break;
    case 'bolota': K.box(cx - 1.2, 0, cz - 1.2, 2.4, 0.08, 2.4, M.water); K.box(cx - 0.6, 0.08, cz - 0.6, 1.2, 0.12, 1.2, M.planks); K.box(cx - 0.15, 0.2, cz - 0.15, 0.3, 0.3, 0.3, T_('#4a9aff')); K.light(cx, 1, cz, '#6ab0ff', 2.5, 6, 0.5); break;
    case 'harn': for (let i = 0; i < 4; i++) { const x = cx - 1.5 + i; K.box(x - 0.1, 0, cz - 0.1, 0.2, 0.7, 0.2, M.darkStone); K.box(x - 0.16, 0.7, cz - 0.16, 0.32, 0.22, 0.32, M.coal); } K.light(cx, 1.2, cz, '#ff6a30', 3, 7, 1.2); break;
    case 'elda': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, x = cx + Math.cos(a) * 0.9, z = cz + Math.sin(a) * 0.9; K.cyl(x, 0, z, 0.1, 2.0 + (i === 0 ? 0.8 : 0), M.white, { seg: 6 }); K.box(x - 0.08, 2.0 + (i === 0 ? 0.8 : 0), z - 0.08, 0.16, 0.16, 0.16, M.lamp); } K.light(cx, 2.4, cz, '#ffe0a0', 2.5, 7, 0.3); break;
    default: K.box(cx - 0.3, 0, cz - 0.3, 0.6, 1.4, 0.6, M.stone);
  }
  K.solid(cx - 1.2, cz - 1.2, 2.4, 2.4);
  altar(K, F, tr, cx, 0.2);
  for (const s of [-1, 1]) F.brazier(K, cx + s * 2.2, 1.0, M.fire, { li: 2.2 });
  for (let z = cz + 1.8; z < D - 1.2; z += 1.1) for (let x = cx - 2.2; x <= cx + 2.2; x += 1.1) { K.box(x - 0.3, 0.01, z - 0.3, 0.6, 0.03, 0.6, rs.rug); K.slot('pew', x, z, { face: [0, -1] }); }
  K.slot('work', cx + 1.2, 1.2, { face: [0, 1] });
  K.door = { x: W / 2, z: D - 0.5 };
}
function lairInterior(K, F, tr) {
  const { M, R, W, D } = K;
  K.open = true;
  K.box(-0.5, -0.3, -0.5, W + 1, 0.3, D + 1, tr === 'yarvi' ? M.tinted('#e8f0f4') : tr === 'nefer' ? M.sandFloor : tr === 'harn' ? M.darkStone : M.grass);
  const cx = W / 2, cz = D / 2;
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, x = cx + Math.cos(a) * 2.6, z = cz + Math.sin(a) * 2.4; const h = R.range(0.8, 1.6); K.box(x - 0.3, 0, z - 0.25, 0.6, h, 0.5, M.stone, { ry: a }); K.solid(x - 0.3, z - 0.3, 0.6, 0.6); }
  K.box(cx - 0.4, 0, cz - 0.4, 0.8, 0.5, 0.8, M.darkStone); K.solid(cx - 0.5, cz - 0.5, 1, 1);
  K.cyl(cx, 0.5, cz, 0.25, 0.1, M.clay, { seg: 8 }); K.box(cx - 0.1, 0.6, cz - 0.1, 0.2, 0.08, 0.2, tr === 'mahina' ? M.red : M.bread);
  for (let i = 0; i < 5; i++) F.bones(K, R.range(1, W - 1), R.range(1, D - 1));
  F.brazier(K, cx - 1.2, cz + 1.4, M.fire, { li: 2 }); F.brazier(K, cx + 1.2, cz + 1.4, M.fire, { li: 2 });
  K.slot('pew', cx, cz + 1.3, { face: [0, -1] });
  K.door = { x: W / 2, z: D - 0.5 };
}
