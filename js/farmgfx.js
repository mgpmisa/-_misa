// 畑の3Dの姿（開発部・グラフィック兼務）
// 区画ごとの作物と育ち具合（畝 → 芽 → 若い苗 → 育った姿 → 実った姿 → 刈ったあと）、休耕地と放牧中の畑、果樹園、氷室。
// 重さ対策：姿（作物の見た目×段階）ごとに1つの InstancedMesh にまとめて描く。魔法の作物の光る部分は、光る材質の別の束。
// 並べ直すのは、畑の記録（S.farm.ver）か季節が変わったときだけ。光る作物は毎コマ明るさだけ変える。
// render.js：constructor で new FarmGfx(this, { wx, wz, topY })、update で this.fgfx.update(now)、
//            地形の区画の古い麦の箱は描かない（FarmGfx.hideChunkCrops(this.chunks)）。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { W } from './world.js';

const hsh = (a, b, s = 0) => { let x = (a * 374761393 + b * 668265263 + s * 2246822519) >>> 0; x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
function colored(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.normal == null) g.computeVertexNormals();
  return g;
}
const merge = (parts) => (parts.length ? mergeGeometries(parts.map(([geo, col]) => colored(geo, col)), false) : null);
const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const Br = (w, h, d, x, y, z, ry) => new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z);   // その場で向きを変える
const ROWS = [-0.33, -0.11, 0.11, 0.33];

// ---------------------------------------------------------------- 部品
function furrows(out, col = '#6a4a2c', top = '#7e5a36') {
  for (const z of ROWS) { out.push([B(0.9, 0.05, 0.11, 0, 0, z), col]); out.push([B(0.9, 0.012, 0.05, 0, 0.05, z), top]); }
}
// 畝に沿って並べる：fn(x, z, i, j) が部品を足す
function alongRows(n, fn, salt = 0) {
  ROWS.forEach((z, j) => { for (let i = 0; i < n; i++) { const x = -0.4 + (i + 0.5) * (0.8 / n) + (hsh(i, j, salt) - 0.5) * 0.04; fn(x, z + (hsh(j, i, salt + 1) - 0.5) * 0.03, i, j); } });
}
function tufts(out, h, col, n = 5, w = 0.05) { alongRows(n, (x, z, i, j) => out.push([B(w, h * (0.8 + hsh(i, j, 3) * 0.4), w, x, 0.04, z), col])); }
function stalks(out, h, col, head, headCol, n = 7, opt = {}) {
  alongRows(n, (x, z, i, j) => {
    const hh = h * (0.85 + hsh(i, j, 5) * 0.3);
    out.push([B(0.035, hh, 0.035, x, 0.04, z), col]);
    out.push([B(0.035, hh * 0.9, 0.035, x + 0.045, 0.04, z + 0.03), col]);
    if (head) {
      const dx = opt.droop ? 0.04 : 0, dy = opt.droop ? -0.05 : 0;
      out.push([B(opt.hw || 0.055, head, opt.hw || 0.055, x + dx, 0.04 + hh + dy, z), headCol]);
      if (opt.awn) out.push([B(0.012, 0.08, 0.012, x, 0.04 + hh + head, z), opt.awn]);
    }
  });
}
function balls(out, r, col, n = 4, y = 0.04, leaf = null) {
  alongRows(n, (x, z, i, j) => {
    const rr = r * (0.85 + hsh(i, j, 7) * 0.3);
    out.push([new THREE.IcosahedronGeometry(rr, 0).translate(x, y + rr * 0.8, z), col]);
    if (leaf) out.push([B(rr * 2.6, 0.02, rr * 2.2, x, y, z), leaf]);
  });
}
function spikes(out, h, col, n = 6) { alongRows(n, (x, z, i, j) => { out.push([B(0.02, h, 0.02, x - 0.015, 0.04, z), col]); out.push([B(0.02, h * 0.85, 0.02, x + 0.02, 0.04, z + 0.01), col]); }); }
function tree(out, glow, o) {
  const pos = [[-0.22, -0.2], [0.22, 0.22]];
  for (const [x, z] of pos) {
    out.push([B(0.08, o.trunk || 0.4, 0.08, x, 0, z), o.trunkCol || '#6b4a2a']);
    if (o.palm) { for (let a = 0; a < 5; a++) out.push([Br(0.34, 0.03, 0.08, x + Math.cos(a * 1.26) * 0.14, (o.trunk || 0.4), z + Math.sin(a * 1.26) * 0.14, -a * 1.26), o.crown]); }
    else out.push([new THREE.IcosahedronGeometry(o.r || 0.24, 0).scale(1, 0.85, 1).translate(x, (o.trunk || 0.4) + (o.r || 0.24) * 0.6, z), o.crown]);
    if (o.fruit) for (let k = 0; k < 5; k++) out.push([B(0.05, 0.05, 0.05, x + (hsh(k, 1, 9) - 0.5) * 0.36, (o.trunk || 0.4) + 0.05 + hsh(k, 2, 9) * 0.3, z + (hsh(k, 3, 9) - 0.5) * 0.36), o.fruit]);
  }
  void glow;
}

// ---------------------------------------------------------------- 姿の表：look → 段階（0芽 1若い 2育った 3実った）ごとの部品
const GRAIN = {
  wheat: { g: '#5fae3e', g2: '#4f9632', ripe: '#e0b84a', head: '#f0cc5a', h: 0.46 },
  rye: { g: '#6aa84a', g2: '#588e3a', ripe: '#c8b070', head: '#a89868', h: 0.55, awn: '#d8c890' },
  spelt: { g: '#5fa23e', g2: '#4f8a32', ripe: '#c89850', head: '#b07838', h: 0.44 },
  barley: { g: '#7ab84e', g2: '#62a03c', ripe: '#e8d890', head: '#f0e0a0', h: 0.38, awn: '#f4ecc0' },
  oat: { g: '#6ab04a', g2: '#58983c', ripe: '#d8d0a0', head: '#e8e0b8', h: 0.42, droop: true },
  millet: { g: '#7aa83e', g2: '#6a9432', ripe: '#c8a060', head: '#d8b070', h: 0.42, droop: true },
  sorghum: { g: '#6a9a38', g2: '#5a8430', ripe: '#a86038', head: '#b04a2a', h: 0.6, hw: 0.08 },
  buckwheat: { g: '#7ab85a', g2: '#b04a4a', ripe: '#6a4a3a', head: '#f0e0e8', h: 0.3, flower: true },
  moonwheat: { g: '#8ab0c8', g2: '#a8c8e0', ripe: '#c8d8f0', head: '#e8f0ff', h: 0.48, glow: true },
};
function shape(look, st) {
  const base = [], glow = [];
  const G = GRAIN[look];
  if (G) {
    if (st === 0) { furrows(base); tufts(base, 0.06, G.g, 6, 0.03); }
    else if (st === 1) { furrows(base); stalks(base, G.h * 0.45, G.g, 0, null, 6); }
    else if (st === 2) { furrows(base); stalks(base, G.h * 0.9, G.g2, G.flower ? 0.05 : 0.04, G.flower ? G.head : G.g2, 7); }
    else { furrows(base, '#7a5a34'); stalks(base, G.h, G.ripe, 0.08, G.head, 7, { awn: G.awn, droop: G.droop, hw: G.hw }); }
    if (G.glow && st >= 2) alongRows(4, (x, z) => glow.push([B(0.04, 0.04, 0.04, x, 0.04 + G.h + 0.07, z), '#dfe8ff']), 4);
    if (G.glow && st === 3) alongRows(7, (x, z) => glow.push([B(0.06, 0.09, 0.06, x, 0.04 + G.h * 0.95, z), '#b8d0ff']), 5);
    return { base, glow };
  }
  switch (look) {
    case 'maize':
      furrows(base);
      if (st === 0) tufts(base, 0.08, '#6ab04a', 4, 0.05);
      else alongRows(4, (x, z, i, j) => {
        const h = [0, 0.35, 0.8, 0.85][st];
        base.push([B(0.05, h, 0.05, x, 0.04, z), st === 3 ? '#c8a860' : '#4f9a32']);
        base.push([Br(0.22, 0.02, 0.05, x + 0.06, 0.04 + h * 0.5, z, 0.5 * (hsh(i, j) - 0.5)), st === 3 ? '#b89850' : '#5aa83a']);
        if (st === 3) base.push([B(0.06, 0.14, 0.06, x + 0.05, 0.04 + h * 0.55, z + 0.02), '#f0c840']);
        else if (st === 2) base.push([B(0.04, 0.06, 0.04, x, 0.04 + h, z), '#d8c070']);
      });
      break;
    case 'rice':
      base.push([B(0.92, 0.015, 0.92, 0, 0, 0), '#5a88b0']);   // 水を張った田
      base.push([B(0.96, 0.05, 0.03, 0, 0, 0.47), '#6a4a2c'], [B(0.96, 0.05, 0.03, 0, 0, -0.47), '#6a4a2c']);
      if (st === 0) tufts(base, 0.07, '#7ac04e', 6, 0.03);
      else stalks(base, [0, 0.2, 0.36, 0.38][st], st === 3 ? '#d8b850' : '#5aa83a', st === 3 ? 0.06 : 0, '#e8c860', 6, { droop: true });
      break;
    case 'bean': case 'spiritbean': {
      const sp = look === 'spiritbean';
      furrows(base);
      if (st === 0) tufts(base, 0.05, sp ? '#6ad0a0' : '#6ab04a', 5, 0.04);
      else balls(base, [0, 0.07, 0.1, 0.1][st], st === 3 ? (sp ? '#9ad8a0' : '#a8b050') : (sp ? '#3aa878' : '#4a8a3a'), 5);
      if (st === 2) alongRows(5, (x, z) => (sp ? glow : base).push([B(0.04, 0.03, 0.04, x, 0.2, z), sp ? '#b0ffe0' : '#f4f0f0']), 2);
      if (st === 3) alongRows(5, (x, z) => (sp ? glow : base).push([B(0.03, 0.08, 0.03, x + 0.06, 0.1, z), sp ? '#7affc8' : '#c8d070']), 3);
      break;
    }
    case 'cabbage':
      furrows(base);
      if (st === 0) tufts(base, 0.04, '#7ac04e', 4, 0.05);
      else balls(base, [0, 0.06, 0.1, 0.12][st], st === 3 ? '#9acc70' : '#7ab860', 4, 0.04, '#4f8a3a');
      break;
    case 'onion':
      furrows(base);
      if (st <= 2) spikes(base, [0.08, 0.18, 0.26][st], '#5aa048');
      else { balls(base, 0.06, '#e8c878', 6); spikes(base, 0.1, '#a89860', 6); }
      break;
    case 'leek':
      furrows(base);
      spikes(base, [0.08, 0.2, 0.32, 0.36][st], st >= 2 ? '#7ab8a0' : '#6ab04a', 5);
      if (st >= 2) alongRows(5, (x, z) => base.push([B(0.05, 0.12, 0.05, x, 0.04, z), '#e8f0d8']), 6);
      break;
    case 'carrot':
      furrows(base);
      tufts(base, [0.05, 0.1, 0.15, 0.15][st], '#6ac04a', 6, 0.07);
      if (st === 3) alongRows(6, (x, z) => base.push([B(0.05, 0.04, 0.05, x, 0.04, z), '#f08a2a']), 7);
      break;
    case 'turnip': case 'beet': {
      furrows(base);
      balls(base, [0.04, 0.06, 0.08, 0.08][st], look === 'beet' ? '#5a8a3a' : '#6ab04a', 5, 0.08);
      if (st >= 2) balls(base, 0.06, look === 'beet' ? '#8a1a3a' : '#e8e0f0', 5, 0.02);
      if (st >= 2 && look === 'turnip') alongRows(5, (x, z) => base.push([B(0.08, 0.02, 0.08, x, 0.1, z), '#9a5aa8']), 8);
      break;
    }
    case 'flax':
      furrows(base);
      if (st === 0) tufts(base, 0.06, '#7ac050', 7, 0.02);
      else stalks(base, [0, 0.22, 0.4, 0.42][st], st === 3 ? '#c8b080' : '#6aa850', st >= 2 ? 0.04 : 0, st === 3 ? '#a88a58' : '#6a8ae8', 8, { hw: 0.05 });
      break;
    case 'hemp':
      furrows(base);
      if (st === 0) tufts(base, 0.07, '#5a9a3a', 5, 0.04);
      else stalks(base, [0, 0.35, 0.75, 0.8][st], st === 3 ? '#8a9a4a' : '#3a7a2a', 0.1, st === 3 ? '#9aa058' : '#4a8a32', 5, { hw: 0.09 });
      break;
    case 'clover':
      base.push([B(0.9, 0.04, 0.9, 0, 0, 0), '#5aa84a']);
      alongRows(6, (x, z) => base.push([B(0.03, 0.03, 0.03, x, 0.04, z), st >= 2 ? '#f8f8f0' : '#6ab85a']), 9);
      break;
    case 'frostberry':
      furrows(base, '#8a8a98', '#b8c0d0');
      balls(base, [0.05, 0.07, 0.09, 0.09][st], '#dce8f0', 5, 0.04, '#9ab0b8');
      if (st >= 2) alongRows(5, (x, z) => glow.push([B(0.04, 0.04, 0.04, x + 0.05, 0.13, z), st === 3 ? '#ff4a5a' : '#ff9aa8']), 10);
      break;
    case 'dragonchili':
      furrows(base, '#5a3a24');
      balls(base, [0.04, 0.07, 0.09, 0.09][st], '#3a7a2a', 5, 0.04);
      if (st >= 2) alongRows(5, (x, z, i, j) => glow.push([B(0.03, 0.08, 0.03, x + (i % 2 ? 0.05 : -0.05), 0.08, z + (j % 2 ? 0.03 : -0.03)), st === 3 ? '#ff3a10' : '#ff8a30']), 11);
      break;
    case 'screamroot':
      furrows(base, '#3a2a24', '#4a3a30');
      alongRows(4, (x, z, i, j) => { const r = [0.04, 0.08, 0.12, 0.12][st]; base.push([Br(r * 2.2, 0.025, r, x, 0.05, z, hsh(i, j, 12) * 3), '#4a2a5a']); base.push([B(r, 0.025, r * 2.2, x, 0.07, z), '#5a3a6a']); });
      if (st >= 2) alongRows(4, (x, z) => glow.push([B(0.05, 0.06, 0.05, x, 0.06, z), '#c070ff']), 13);
      break;
    case 'orchard': tree(base, glow, { crown: '#4d8a3c', fruit: st === 3 ? '#d8402a' : null }); break;
    case 'olive': tree(base, glow, { crown: '#8a9a6a', trunkCol: '#7a6a5a', fruit: st === 3 ? '#3a4a2a' : null, r: 0.22 }); break;
    case 'palm': tree(base, glow, { crown: '#4f9a2a', trunk: 0.7, trunkCol: '#8a6a3a', palm: true, fruit: st === 3 ? '#c8781a' : null }); break;
    case 'vine': case 'hops': {
      const hop = look === 'hops';
      for (const z of [-0.25, 0.25]) {
        for (const x of [-0.4, 0, 0.4]) base.push([B(0.04, hop ? 0.9 : 0.4, 0.04, x, 0, z), '#7a5a3a']);
        base.push([B(0.84, 0.015, 0.015, 0, hop ? 0.88 : 0.38, z), '#5a4a3a']);
        for (let i = 0; i < 5; i++) base.push([B(0.12, hop ? 0.7 : 0.2, 0.08, -0.36 + i * 0.18, hop ? 0.12 : 0.18, z), hop ? '#5aa840' : '#4a8a32']);
        if (st === 3) for (let i = 0; i < 4; i++) base.push([B(0.06, 0.08, 0.06, -0.27 + i * 0.18, hop ? 0.5 : 0.22, z + 0.05), hop ? '#c8e080' : '#5a2a6a']);
      }
      break;
    }
    case 'cane':
      furrows(base);
      alongRows(4, (x, z) => { base.push([B(0.05, 0.9, 0.05, x, 0.04, z), '#8ab04a']); base.push([B(0.2, 0.02, 0.04, x + 0.08, 0.8, z), '#5a9a3a']); });
      break;
    case 'furrow': furrows(base); break;
    case 'seeded':
      furrows(base);
      alongRows(8, (x, z) => base.push([B(0.02, 0.012, 0.02, x, 0.062, z), '#e8d8a0']), 14);
      break;
    case 'stubble':
      alongRows(8, (x, z) => base.push([B(0.03, 0.05, 0.03, x, 0, z), '#c8a860']), 15);
      if (st === 1) for (const [x, z] of [[-0.22, -0.18], [0.2, 0.2], [0.24, -0.26]]) { base.push([new THREE.ConeGeometry(0.1, 0.26, 5).translate(x, 0.13, z), '#e0bc58']); base.push([B(0.12, 0.02, 0.12, x, 0.12, z), '#a88830']); }
      break;
    case 'fallow': case 'fallowW': case 'graze': {
      const w = look === 'fallowW';
      base.push([B(0.94, 0.014, 0.94, 0, 0, 0), w ? '#dfe4e8' : look === 'graze' ? '#7f9a4c' : '#6f9e45']);   // 草が生えた休耕地（冬は雪）
      for (let k = 0; k < 9; k++) {
        const x = (hsh(k, 1, 16) - 0.5) * 0.8, z = (hsh(k, 2, 16) - 0.5) * 0.8, h = 0.04 + hsh(k, 3, 16) * 0.08;
        base.push([B(0.1, h, 0.08, x, 0, z), w ? '#c8ccc0' : k % 3 ? '#6a9a3a' : '#8a8a4a']);
      }
      if (look === 'graze') {
        for (const [x, z, rx] of [[0, -0.46, 1], [0, 0.46, 1], [-0.46, 0, 0], [0.46, 0, 0]]) {
          base.push([B(rx ? 0.9 : 0.03, 0.12, rx ? 0.03 : 0.9, x, 0.04, z), '#8a6a3a']);
          for (const t of [-0.4, 0, 0.4]) base.push([B(0.04, 0.2, 0.04, rx ? t : x, 0, rx ? z : t), '#6a4a2a']);
        }
        for (let k = 0; k < 4; k++) base.push([B(0.05, 0.02, 0.05, (hsh(k, 5, 17) - 0.5) * 0.7, 0, (hsh(k, 6, 17) - 0.5) * 0.7), '#5a3a1e']);
      }
      break;
    }
    case 'icehouse':
      base.push([new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), '#8a8478']);
      base.push([B(0.22, 0.28, 0.06, 0, 0, 0.47), '#5a3a22']);
      base.push([B(0.3, 0.05, 0.12, 0, 0.28, 0.46), '#6a6458']);
      base.push([new THREE.SphereGeometry(0.5, 8, 2, 0, Math.PI * 2, 0, Math.PI / 5).scale(1.02, 0.72, 1.02), '#5a8a3a']);   // 屋根の芝
      glow.push([B(0.1, 0.08, 0.1, 0.34, 0, 0.36), '#c8f0ff'], [B(0.08, 0.06, 0.08, 0.42, 0, 0.22), '#a8e0ff']);   // 切り出した氷の塊
      break;
  }
  return { base, glow };
}

// ---------------------------------------------------------------- 描く
export class FarmGfx {
  static hideChunkCrops(chunks) { if (chunks) chunks.cropHeight = () => 0; }
  constructor(r, { wx, wz, topY }) {
    this.r = r; this.wx = wx; this.wz = wz; this.topY = topY;
    this.ver = null; this.meshes = {}; this.geos = {};
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.group = new THREE.Group(); this.group.name = 'farms';
    r.scene.add(this.group);
  }
  geo(key) {
    if (this.geos[key] !== undefined) return this.geos[key];
    const [look, st] = key.split(':');
    const s = shape(look, +st || 0);
    this.geos[key] = { base: merge(s.base), glow: merge(s.glow) };
    return this.geos[key];
  }
  mesh(key, n) {
    let m = this.meshes[key];
    if (m && m.cap >= n) return m;
    if (m) { for (const x of [m.base, m.glow]) if (x) { this.group.remove(x); x.dispose(); } }
    const g = this.geo(key), cap = Math.max(16, 1 << Math.ceil(Math.log2(n + 1)));
    m = { cap, base: null, glow: null };
    if (g.base) { m.base = new THREE.InstancedMesh(g.base, this.mat, cap); m.base.frustumCulled = false; m.base.receiveShadow = true; m.base.castShadow = false; this.group.add(m.base); }
    if (g.glow) { m.glow = new THREE.InstancedMesh(g.glow, this.glowMat, cap); m.glow.frustumCulled = false; this.group.add(m.glow); }
    this.meshes[key] = m;
    return m;
  }
  update(now = 0) {
    const sim = this.r.sim, S = sim?.S;
    if (!S?.farm || !sim._farm) return;
    const si = sim.seasonIdx();
    const v = S.farm.ver + ':' + si + ':' + Object.keys(S.regions?.ice || {}).length;
    // 光る作物は、ゆっくり明るくなったり暗くなったりする
    const k = 0.75 + 0.25 * Math.sin(now * 2.2);
    this.glowMat.color.setRGB(k, k, k);
    if (v === this.ver) return;
    this.ver = v;
    const w = S.world, lists = {};
    for (const pl of Object.values(S.farm.plots)) {
      if (pl.x == null) continue;
      let { look, stage, rp } = sim._farm.stage(sim, pl);
      if (stage === 3 && rp > 0.6) { look = 'stubble'; stage = 1; }
      if ((look === 'fallow' || look === 'graze') && si === 3) look = 'fallowW';   // 冬は雪（家畜は小屋の中）
      if (look === 'fallow' || look === 'fallowW' || look === 'graze' || look === 'furrow' || look === 'seeded') stage = 0;
      const key = look + ':' + stage;
      (lists[key] = lists[key] || []).push(pl);
    }
    for (const I of Object.values(S.regions?.ice || {})) (lists['icehouse:0'] = lists['icehouse:0'] || []).push({ x: I.x, z: I.z, ice: true });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const key of Object.keys(this.meshes)) if (!lists[key]) { const m = this.meshes[key]; if (m.base) m.base.count = 0; if (m.glow) m.glow.count = 0; }
    for (const [key, list] of Object.entries(lists)) {
      const m = this.mesh(key, list.length);
      list.forEach((pl, i) => {
        q.setFromAxisAngle(up, pl.ice ? ((pl.x * 7 + pl.z) % 4) * Math.PI / 2 : 0);
        pos.set(this.wx(pl.x), this.topY(w.hgt[pl.z * W + pl.x] || 0), this.wz(pl.z));
        m4.compose(pos, q, one);
        if (m.base) m.base.setMatrixAt(i, m4);
        if (m.glow) m.glow.setMatrixAt(i, m4);
      });
      for (const x of [m.base, m.glow]) if (x) { x.count = list.length; x.instanceMatrix.needsUpdate = true; }
    }
  }
}
