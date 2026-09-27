// 暮らしと仕事の跡（3D）― グラフィック部（人の担当）
//
// 社長の指示「人物動作はドット絵、それ以外は3D」に合わせ、仕事や暮らしで地面に残る物・そばに置く物を3Dで描く。
//   畝（うね）       … 畑を耕した・種をまいたマス（4日で消える）
//   刈り束（麦の束） … 秋に刈り入れたマス（5日）
//   切り株と薪の山   … 木こり・開拓者が木を切ったそば（8日）
//   盛り土           … 墓掘り・炭焼き・開拓で掘ったそば（3日）
//   砂利の山         … 道普請で突き固めたそば（2日）
//   干した洗濯物     … 洗濯をした川辺・水場のそば（10時間。風で揺れる）
//   焚き火           … 町の外で野宿・野営の食事をしている人のそば（いる間と、そのあと1時間の燠火。炎が揺れる）
//   浮き             … 釣りをしている人のいちばん近い水面（いる間だけ。上下に揺れる）
//   露店の台         … 市の日に店を出している人の前（いる間だけ）
//   藁人形           … 外で鍛錬している人のそば（いる間だけ）
//   手おけ           … 水くみの人の足もと（いる間だけ）
//
// 世界の状態（sim.S）には何も書かない（見た目だけ。セーブにも帳簿にも関わらない）。
// 重さ：種類ごとに InstancedMesh を1つずつ（描く回数は種類の数だけ）。人の見回りは0.5秒に1回、
//       映す物の組み直しも0.5秒に1回で、揺れる物（炎・浮き・洗濯物）だけを毎フレーム動かす。
//       画面の近く（人の絵と同じ範囲）だけを映し、引いた眺めでは何も映さない。
//
// ■ 本体からの呼び方（render.js に2行。scratchpad/acts/apply.py）
//   import { actGfxFrame } from './actgfx.js';
//   update() の this.updateEntities(realDt, now); の直後 … actGfxFrame(this, realDt, now);
import * as THREE from 'three';
import { W, H, T } from './world.js';

const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
const topY = (h) => 0.3 + h * 0.4;
const SEA_Y = 0.12;
const hsh = (a, b = 0) => { let x = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0; x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

// 跡の種類：残る時間（分）
const LIFE = { furrow: 4 * 1440, sheaf: 5 * 1440, stump: 8 * 1440, mound: 3 * 1440, gravel: 2 * 1440, laundry: 600, fire: 60 };
const MAX_MARKS = 4000;

// ---------------------------------------------------------------- 部品（形・色・上限）
function parts() {
  const L = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (rt, rb, h, n = 7) => new THREE.CylinderGeometry(rt, rb, h, n);
  const soilRidge = B(0.86, 0.05, 0.09);
  const flame = new THREE.ConeGeometry(0.09, 0.26, 6); flame.translate(0, 0.13, 0);
  const cloth = new THREE.PlaneGeometry(0.2, 0.26); cloth.translate(0, -0.13, 0);
  const awning = B(0.95, 0.03, 0.5);
  const logG = C(0.05, 0.05, 0.5, 6); logG.rotateZ(Math.PI / 2);
  const ring = new THREE.RingGeometry(0.07, 0.1, 12); ring.rotateX(-Math.PI / 2);
  const moundG = new THREE.SphereGeometry(0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); moundG.scale(1, 0.45, 0.8);
  const P = {
    ridge: [soilRidge, L('#5a4028'), 600],
    sheafStalk: [C(0.07, 0.1, 0.3), L('#d8b050'), 400],
    sheafTop: [new THREE.ConeGeometry(0.1, 0.12, 6), L('#e8c868'), 400],
    stump: [C(0.13, 0.16, 0.14, 8), L('#8a6a44'), 300],
    stumpTop: [C(0.12, 0.12, 0.01, 8), L('#d8b888'), 300],
    log: [logG, L('#7a5634'), 600],
    mound: [moundG, L('#6a4a2e'), 200],
    pebble: [new THREE.DodecahedronGeometry(0.06), L('#9a968e'), 400],
    post: [B(0.04, 0.55, 0.04), L('#6a4a2a'), 300],
    line: [B(0.9, 0.012, 0.012), L('#c8b890'), 150],
    cloth: [cloth, L('#ffffff', { side: THREE.DoubleSide }), 450],
    firewood: [B(0.34, 0.05, 0.05), L('#5a3a22'), 200],
    stone: [B(0.08, 0.06, 0.08), L('#7a766e'), 400],
    flame: [flame, new THREE.MeshBasicMaterial({ color: '#ffffff' }), 200],
    float: [new THREE.SphereGeometry(0.045, 8, 6), L('#e04030', { emissive: '#401008' }), 100],
    ripple: [ring, new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.55, depthWrite: false }), 100],
    table: [B(0.9, 0.05, 0.42), L('#a0784a'), 80],
    tableCloth: [B(0.92, 0.26, 0.02), L('#ffffff'), 80],
    awning: [awning, L('#ffffff'), 80],
    good: [B(0.14, 0.1, 0.14), L('#ffffff'), 300],
    dummyPost: [B(0.05, 0.7, 0.05), L('#6a4a2a'), 60],
    dummyBody: [C(0.12, 0.1, 0.3, 7), L('#d8c070'), 60],
    dummyHead: [new THREE.SphereGeometry(0.09, 7, 5), L('#e0cc80'), 60],
    dummyArm: [B(0.4, 0.05, 0.05), L('#c8b060'), 60],
    pail: [C(0.08, 0.065, 0.12, 8), L('#8a6a4a'), 120],
    pailWater: [C(0.07, 0.07, 0.01, 8), L('#6ab0e0'), 120],
  };
  const out = {};
  for (const [k, [g, m, n]] of Object.entries(P)) {
    const mesh = new THREE.InstancedMesh(g, m, n);
    mesh.count = 0; mesh.visible = false; mesh.frustumCulled = false; mesh.castShadow = k !== 'ripple' && k !== 'flame'; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (['cloth', 'awning', 'good', 'tableCloth', 'flame'].includes(k)) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.userData.max = n;
    out[k] = mesh;
  }
  return out;
}

const CLOTH_C = ['#f4f4f0', '#b8d0e8', '#e8d0c0', '#d8e8c8', '#e8e0a8', '#c8b8e0'].map((c) => new THREE.Color(c));
const AWN_C = ['#c84a3a', '#3a6ab0', '#d8a030', '#3a8a5a', '#8a3a8a'].map((c) => new THREE.Color(c));
const GOOD_C = ['#e8c060', '#6ac050', '#c03040', '#d8a050', '#a0a0b0', '#f0e8d0'].map((c) => new THREE.Color(c));
const FLAME_C = [new THREE.Color('#ffb030'), new THREE.Color('#ff6a20'), new THREE.Color('#ffe080')];

// ---------------------------------------------------------------- 状態（描画側だけ）
function state(r) {
  if (r._act) return r._act;
  const g = new THREE.Group(); g.name = 'actgfx';
  const P = parts();
  for (const m of Object.values(P)) g.add(m);
  r.scene.add(g);
  r._act = { g, P, marks: new Map(), live: [], scanT: -1, buildT: -1, anim: { flame: [], float: [], cloth: [] }, sim: r.sim };
  return r._act;
}

// ---------------------------------------------------------------- 見回り：人の行動から跡を記録し、いまだけの物を集める
function landY(w, x, z) { const i = z * W + x; return topY(w.hgt[i] || 0); }
function nearWater(w, x, z) {
  let best = null, bd = 1e9;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= W || Z >= H) continue;
    const t = w.tiles[Z * W + X]; if (t !== T.SEA && t !== T.RIVER && t !== T.DEEP) continue;
    const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { x: X, z: Z, t }; }
  }
  return best;
}
function inTown(sim, p) {
  let q = null; try { q = sim.townOf(p); } catch { q = null; }
  if (!q || q.x == null) return false;
  return Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < (q.r || 6) + 2;
}
function mark(st, kind, x, z, t) {
  const key = (z * W + x) * 8 + ['furrow', 'sheaf', 'stump', 'mound', 'gravel', 'laundry', 'fire'].indexOf(kind);
  const m = st.marks.get(key);
  if (m) { m.until = t + LIFE[kind]; return; }
  if (st.marks.size >= MAX_MARKS) { const k0 = st.marks.keys().next().value; st.marks.delete(k0); }
  st.marks.set(key, { kind, x, z, until: t + LIFE[kind], seed: hsh(x * 31 + z, key) });
}
function scan(st, sim) {
  const S = sim.S, t = S.t, w = S.world, si = sim.seasonIdx ? sim.seasonIdx() : 0;
  const live = [];
  for (const p of sim.living()) {
    const a = p.action;
    if (!a || a.phase !== 'do' || p.inside != null || p.dormant) continue;
    const x = Math.round(p.pos.x), z = Math.round(p.pos.z);
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    const tile = w.tiles[z * W + x];
    const ty = a.type, job = p.job;
    if (ty === 'work' || ty === 'garden' || ty === 'uw_grow') {
      if ((job === 'farmer' || ty === 'garden' || ty === 'uw_grow') && tile === T.FIELD) mark(st, si === 2 ? 'sheaf' : 'furrow', x, z, t);
      else if (job === 'woodcutter' || job === 'pioneer') mark(st, 'stump', x, z, t);
      else if (job === 'gravedigger' || job === 'charcoal') mark(st, 'mound', x, z, t);
      else if (job === 'roadworker') mark(st, 'gravel', x, z, t);
      else if (job === 'laundress') mark(st, 'laundry', x, z, t);
      else if (job === 'fisher') live.push({ k: 'float', p, x, z });
    }
    if (ty === 'laundry') mark(st, 'laundry', x, z, t);
    if (ty === 'fishing') live.push({ k: 'float', p, x, z });
    if (ty === 'stall') live.push({ k: 'stall', p, x, z });
    if (ty === 'train' || ty === 'dojo' || ty === 'lesson') live.push({ k: 'dummy', p, x, z });
    if (ty === 'water') live.push({ k: 'pail', p, x, z });
    if ((ty === 'sleep' || ty === 'wayeat' || ty === 'eat' || ty === 'rest' || ty === 'camp') && !inTown(sim, p)) mark(st, 'fire', x, z, t);
  }
  st.live = live;
  for (const [k, m] of st.marks) if (m.until < t) st.marks.delete(k);
}

// ---------------------------------------------------------------- 組み立て：画面の近くの物だけを部品に並べる
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function build(st, r) {
  const P = st.P, sim = r.sim, w = sim.S.world, t = sim.S.t;
  const cnt = {}; for (const k of Object.keys(P)) cnt[k] = 0;
  const anim = { flame: [], float: [], cloth: [] };
  const put = (k, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, col = null, rx = 0, rz = 0) => {
    const m = P[k]; const i = cnt[k]; if (i >= m.userData.max) return -1;
    _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)); m.setMatrixAt(i, _m);
    if (col && m.instanceColor) m.setColorAt(i, col);
    cnt[k] = i + 1; return i;
  };
  const far = r.camera.zoom < 0.55;
  const c = r.controls.target, cx = c.x + W / 2, cz = c.z + H / 2;
  const R = (22 / r.camera.zoom + 8) * 1.6;
  const near = (x, z) => Math.abs(x - cx) < R && Math.abs(z - cz) < R;
  if (!far) {
    for (const m of st.marks.values()) {
      if (!near(m.x, m.z)) continue;
      const X = wx(m.x), Z = wz(m.z), Y = landY(w, m.x, m.z), s = m.seed;
      switch (m.kind) {
        case 'furrow': for (let j = -1; j <= 1; j++) put('ridge', X, Y + 0.025, Z + j * 0.28, 0); break;
        case 'sheaf': for (let j = 0; j < 2; j++) { const ox = (j ? 0.25 : -0.22) + (s - 0.5) * 0.1, oz = (j ? -0.2 : 0.18); put('sheafStalk', X + ox, Y + 0.15, Z + oz, s * 6); put('sheafTop', X + ox, Y + 0.36, Z + oz, s * 6); } break;
        case 'stump': {
          const ox = (s < 0.5 ? 0.38 : -0.38), oz = (s * 7 % 1 - 0.5) * 0.5;
          put('stump', X + ox, Y + 0.07, Z + oz); put('stumpTop', X + ox, Y + 0.145, Z + oz);
          const lx = X - ox * 0.6, lz = Z - oz * 0.5 + 0.2, ry = s * 3;
          put('log', lx, Y + 0.05, lz, ry); put('log', lx + Math.sin(ry) * 0.0, Y + 0.05, lz + 0.1, ry); put('log', lx, Y + 0.14, lz + 0.05, ry);
          break;
        }
        case 'mound': put('mound', X + (s - 0.5) * 0.4, Y, Z + 0.3, s * 6); break;
        case 'gravel': for (let j = 0; j < 4; j++) put('pebble', X + 0.3 + (hsh(j, m.x) - 0.5) * 0.18, Y + 0.04 + (j === 3 ? 0.06 : 0), Z + 0.25 + (hsh(m.z, j) - 0.5) * 0.18, j); break;
        case 'laundry': {
          const ox = 0.55 * (s < 0.5 ? 1 : -1), ry = s < 0.25 || s > 0.75 ? 0 : Math.PI / 2;
          const dx = Math.cos(ry) * 0.45, dz = -Math.sin(ry) * 0.45, bx = X + ox, bz = Z + 0.1;
          put('post', bx - dx, Y + 0.275, bz - dz); put('post', bx + dx, Y + 0.275, bz + dz);
          put('line', bx, Y + 0.53, bz, ry);
          for (let j = 0; j < 3; j++) { const f = (j - 1) * 0.28; const i = put('cloth', bx + dx * f / 0.45, Y + 0.53, bz + dz * f / 0.45, ry, 1, 1, 1, CLOTH_C[Math.floor(hsh(j, m.x + m.z) * CLOTH_C.length)]); if (i >= 0) anim.cloth.push({ i, x: bx + dx * f / 0.45, y: Y + 0.53, z: bz + dz * f / 0.45, ry, ph: s * 6 + j }); }
          break;
        }
        case 'fire': {
          const fx = X + 0.45, fz = Z + 0.3;
          for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; put('stone', fx + Math.cos(a) * 0.17, Y + 0.03, fz + Math.sin(a) * 0.17, a); }
          put('firewood', fx, Y + 0.04, fz, 0.6); put('firewood', fx, Y + 0.07, fz, -0.6);
          const hot = m.until - t > 40; // 野宿の人がいるあいだは炎、去ったあとは燠火
          for (let j = 0; j < (hot ? 2 : 1); j++) { const i = put('flame', fx + (j ? 0.05 : -0.04), Y + 0.06, fz, 0, hot ? 1 : 0.5, hot ? 1 : 0.4, hot ? 1 : 0.5, FLAME_C[j]); if (i >= 0) anim.flame.push({ i, x: fx + (j ? 0.05 : -0.04), y: Y + 0.06, z: fz, s: hot ? 1 : 0.45, ph: s * 9 + j * 2 }); }
          break;
        }
      }
    }
    for (const L of st.live) {
      const { p, x, z } = L;
      if (!near(x, z)) continue;
      const X = wx(p.pos.x), Z = wz(p.pos.z), Y = landY(w, x, z), s = hsh(p.id);
      switch (L.k) {
        case 'float': {
          const q = nearWater(w, x, z); if (!q) break;
          const fy = q.t === T.RIVER ? topY(w.hgt[q.z * W + q.x] || 0) - 0.095 : SEA_Y;
          const fx = wx(q.x) + (X - wx(q.x)) * 0.25, fz = wz(q.z) + (Z - wz(q.z)) * 0.25;
          const i = put('float', fx, fy + 0.03, fz); put('ripple', fx, fy + 0.005, fz);
          if (i >= 0) anim.float.push({ i, x: fx, y: fy + 0.03, z: fz, ph: s * 7 });
          break;
        }
        case 'stall': {
          const tx = X, tz = Z + 0.42;
          put('table', tx, Y + 0.34, tz); put('tableCloth', tx, Y + 0.2, tz + 0.21, 0, 1, 1, 1, AWN_C[Math.floor(s * AWN_C.length)]);
          put('post', tx - 0.44, Y + 0.45, tz - 0.2, 0, 1, 1.6, 1); put('post', tx + 0.44, Y + 0.45, tz - 0.2, 0, 1, 1.6, 1);
          put('awning', tx, Y + 0.9, tz - 0.02, 0, 1, 1, 1, AWN_C[Math.floor(s * AWN_C.length)], 0.28);
          for (let j = 0; j < 4; j++) put('good', tx - 0.33 + j * 0.22, Y + 0.42, tz + (j & 1 ? 0.06 : -0.05), j, 1, 1, 1, GOOD_C[Math.floor(hsh(p.id, j) * GOOD_C.length)]);
          break;
        }
        case 'dummy': {
          const dx = X + (s < 0.5 ? 0.6 : -0.6), dz = Z - 0.15;
          put('dummyPost', dx, Y + 0.35, dz); put('dummyBody', dx, Y + 0.52, dz); put('dummyHead', dx, Y + 0.76, dz); put('dummyArm', dx, Y + 0.6, dz);
          break;
        }
        case 'pail': put('pail', X + 0.28, Y + 0.06, Z + 0.12); put('pailWater', X + 0.28, Y + 0.115, Z + 0.12); break;
      }
    }
  }
  for (const [k, m] of Object.entries(P)) {
    m.count = cnt[k]; m.visible = cnt[k] > 0;
    if (cnt[k]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  st.anim = anim;
}

// ---------------------------------------------------------------- 揺れ（毎フレーム、揺れる物だけ）
function sway(st, now) {
  const P = st.P, A = st.anim;
  if (A.flame.length) {
    for (const f of A.flame) { const k = 1 + Math.sin(now * 11 + f.ph) * 0.18 + Math.sin(now * 17 + f.ph * 2) * 0.1; _q.setFromEuler(_e.set(Math.sin(now * 5 + f.ph) * 0.12, 0, 0)); _m.compose(_v.set(f.x, f.y, f.z), _q, _s.set(f.s * (2 - k) * 0.9, f.s * k, f.s * (2 - k) * 0.9)); P.flame.setMatrixAt(f.i, _m); }
    P.flame.instanceMatrix.needsUpdate = true;
  }
  if (A.float.length) {
    for (const f of A.float) { _q.identity(); _m.compose(_v.set(f.x, f.y + Math.sin(now * 2.2 + f.ph) * 0.02 - (Math.sin(now * 0.7 + f.ph) > 0.93 ? 0.04 : 0), f.z), _q, _s.set(1, 1, 1)); P.float.setMatrixAt(f.i, _m); }
    P.float.instanceMatrix.needsUpdate = true;
  }
  if (A.cloth.length) {
    for (const f of A.cloth) { _q.setFromEuler(_e.set(Math.sin(now * 1.6 + f.ph) * 0.35, f.ry, 0, 'YXZ')); _m.compose(_v.set(f.x, f.y, f.z), _q, _s.set(1, 1, 1)); P.cloth.setMatrixAt(f.i, _m); }
    P.cloth.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 毎フレーム（render.js の update から）
export function actGfxFrame(r, realDt, now) {
  if (!r?.scene || !r.sim?.S) return;
  const st = state(r);
  if (st.sim !== r.sim) { st.sim = r.sim; st.marks.clear(); st.live = []; }   // 新しい世界・読み込み
  if (now - st.scanT > 0.5 || now < st.scanT) { st.scanT = now; scan(st, r.sim); build(st, r); }
  sway(st, now);
}
// 試験用：いまの跡の数
export function actGfxStats(r) { const st = r?._act; if (!st) return null; const c = {}; for (const m of st.marks.values()) c[m.kind] = (c[m.kind] || 0) + 1; const v = {}; for (const [k, m] of Object.entries(st.P)) if (m.count) v[k] = m.count; return { marks: c, live: st.live.length, shown: v }; }
