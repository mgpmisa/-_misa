// 歓楽の館の外観（開発部）― 地図の上の形だけ。中（内装）は作らない
//
// 大人向けの設定（S.settings.matureCrimes === true）のときだけ、町の外れの館を描く。
// 控えめな形：黒ずんだ木の壁、瓦屋根、戸口ののれん、軒先に赤い提灯を2つ。
// 設定を切ると、館は取り壊され（js/leisure.js）、ここで描いたものも消える。
// 館は render.js の建物のまとめ描き（buildBuildings）には入れず、ここで別に描く（あとから消せるように）。
//
// ■ 本体からの呼び方
//   render.js の buildingParts の頭 … if (LG.skipBuilding(b)) return parts;
//   render.js の update の頭       … LG.leisureGfxSync(this);
import * as THREE from 'three';
import { W, H } from './world.js';

const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
const topY = (h) => 0.3 + h * 0.4;
const HOUSE_TYPE = 'pleasurehouse';

// 館と取り壊した跡は、まとめ描きに入れない
export function skipBuilding(b) { return !!b && (b.type === HOUSE_TYPE || b.gone === true); }

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    wall: new THREE.MeshLambertMaterial({ color: '#5b3a2c' }),
    beam: new THREE.MeshLambertMaterial({ color: '#2e1d16' }),
    roof: new THREE.MeshLambertMaterial({ color: '#6e2a24' }),
    curtain: new THREE.MeshLambertMaterial({ color: '#8a2230', side: THREE.DoubleSide }),
    win: new THREE.MeshBasicMaterial({ color: '#e0a060' }),
    lantern: new THREE.MeshBasicMaterial({ color: '#ff5a3c' }),
    cap: new THREE.MeshLambertMaterial({ color: '#1e1410' }),
  };
  return MATS;
}

function gableGeo(L, D, Hr) {
  const hl = L / 2, hd = D / 2;
  const v = [-hl, 0, hd, hl, 0, hd, hl, Hr, 0, -hl, 0, hd, hl, Hr, 0, -hl, Hr, 0, hl, 0, -hd, -hl, 0, -hd, -hl, Hr, 0, hl, 0, -hd, -hl, Hr, 0, hl, Hr, 0, hl, 0, hd, hl, 0, -hd, hl, Hr, 0, -hl, 0, -hd, -hl, 0, hd, -hl, Hr, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function buildHouse(sim, b) {
  const M = mats(), w = sim.S.world;
  const g = new THREE.Group();
  const face = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
  const W_ = b.w - 0.25, D_ = b.d - 0.25, wh = 1.35;
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(W_, wh, D_), M.wall, 0, wh / 2, 0);
  // 柱と梁
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.1, wh, 0.1), M.beam, sx * W_ / 2, wh / 2, sz * D_ / 2);
  add(new THREE.BoxGeometry(W_ + 0.05, 0.08, D_ + 0.05), M.beam, 0, wh * 0.55, 0);
  // 屋根
  const along = W_ >= D_;
  add(gableGeo(along ? W_ + 0.4 : D_ + 0.4, along ? D_ + 0.45 : W_ + 0.45, 0.85), M.roof, 0, wh, 0, along ? 0 : Math.PI / 2);
  // 窓（ほのかな灯り）
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.24, 0.2, 0.04), M.win, -W_ * 0.25, wh * 0.72, s * (D_ / 2 + 0.01));
    add(new THREE.BoxGeometry(0.24, 0.2, 0.04), M.win, W_ * 0.25, wh * 0.72, s * (D_ / 2 + 0.01));
  }
  // 戸口とのれん
  const fx = face[0] * (W_ / 2 + 0.03), fz = face[1] * (D_ / 2 + 0.03);
  const ry = Math.atan2(face[0], face[1]);
  add(new THREE.BoxGeometry(face[0] ? 0.06 : 0.46, 0.66, face[1] ? 0.06 : 0.46), M.beam, fx, 0.33, fz);
  add(new THREE.PlaneGeometry(0.5, 0.26), M.curtain, fx + face[0] * 0.02, 0.62, fz + face[1] * 0.02, ry);
  // 赤い提灯（軒先に2つ）
  const lanterns = [];
  const side = [face[1], -face[0]];   // 戸口の左右
  for (const k of [-1, 1]) {
    const lx = fx + face[0] * 0.12 + side[0] * k * 0.42, lz = fz + face[1] * 0.12 + side[1] * k * 0.42;
    add(new THREE.BoxGeometry(0.03, 0.14, 0.03), M.cap, lx, wh + 0.02, lz);
    const l = add(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), M.lantern, lx, wh - 0.14, lz);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), M.cap, lx, wh - 0.02, lz);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8), M.cap, lx, wh - 0.26, lz);
    l.castShadow = false;
    lanterns.push(l);
  }
  const cx = wx(b.x) + (b.w - 1) / 2, cz = wz(b.z) + (b.d - 1) / 2;
  const y = topY(w.hgt[b.door.z * W + b.door.x] ?? b.h ?? 0);
  g.position.set(cx, y, cz);
  g.userData.lanterns = lanterns;
  return g;
}

// 毎コマ：館の数が変われば描き直す。提灯はゆらゆら明滅させる
export function leisureGfxSync(r) {
  const sim = r.sim, S = sim.S;
  r._lzT = (r._lzT || 0) + 1;
  if (r._lzT % 20 === 0 || r._lzKey == null) {
    const on = S.settings?.matureCrimes === true;
    const ids = on ? S.world.buildings.filter((b) => b.type === HOUSE_TYPE && !b.gone).map((b) => b.id) : [];
    const key = ids.join(',');
    if (key !== r._lzKey) {
      r._lzKey = key;
      if (r._lzGroup) {
        r.scene.remove(r._lzGroup);
        r._lzGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      r._lzGroup = new THREE.Group();
      for (const id of ids) r._lzGroup.add(buildHouse(sim, sim.building(id)));
      r.scene.add(r._lzGroup);
    }
  }
  if (MATS && r._lzGroup && r._lzGroup.children.length) {
    const t = performance.now() / 1000;
    const k = 0.85 + Math.sin(t * 3.1) * 0.08 + Math.sin(t * 7.3) * 0.05;
    MATS.lantern.color.setRGB(1 * k, 0.35 * k, 0.24 * k);
  }
}
