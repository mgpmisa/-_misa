// 普請場の見た目（開発部・グラフィック兼務）
//
// construct.js の普請場（S.cons）を、地図の上に段階ごとの姿で描く。
//   縄張り：四隅の杭と、張った縄
//   土台  ：掘った溝と、少しずつ厚くなる石の基礎
//   骨組み：柱が1本ずつ立ち、上に梁が渡る。棟が上がると、棟に若木を飾る（上棟）
//   壁    ：下から少しずつ積み上がる（木の家は板壁、石の建物は石壁、南の国は日干し煉瓦）
//   屋根  ：垂木が並び、端から葺いていく
//   足場  ：骨組みの途中から屋根まで、まわりに丸太の足場と板
//   資材置き場：運ばれた材木・板・石・瓦・藁・釘の樽の山。量に合わせて高くなる。木挽き台と梯子
//   柵    ：杭が1本ずつ増え、横木が渡る。次に打つ所には小さな杭と縄
//   石の塀：石が1マスずつ積み上がる
//   道    ：掘った土の跡 → 砂利 → 石を敷いた道（道になったマスは地面の描き方が受け持つ）
//   橋    ：川に橋脚が立ち、橋桁が渡る（橋になったマスは render.js の橋が受け持つ）
//   荷運び：荷車と、荷車に積んだ荷（毎フレーム、人の絵の位置に合わせる）。背負子で運ぶ姿は人のドット絵（constructanim.js）
//
// 重くしない工夫（技術部の perf.js・crowd.js の考え方）
//   ・普請場の形は、材質ごとに1つに束ねて描く（mergeGeometries）。作り直すのは、普請が進んだとき（S.cons.ver が変わったとき）だけで、
//     それも0.4秒に1回まで。
//   ・背の荷と荷車は InstancedMesh（1回で全員分）。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { W, H, T } from './world.js';
import { STAGES, ST, wallH, consRoadsAhead } from './construct.js';
import { KINGDOMS } from './data.js';

const GOOD_COL = { wood: '#8a5a32', stone: '#9c9a94', iron_nail: '#44444e', planks: '#c89a62', rooftile: '#b4523c', straw: '#d8c05a', slakedlime: '#ecebe4', clay: '#a8744c' };
const STONE_TYPES = new Set(['church', 'barracks', 'prison', 'granary', 'bank', 'mint', 'library', 'castle', 'mansion', 'bathhouse', 'theater', 'orphanage', 'guardpost', 'fort', 'lighthouse']);
const MAX_LOADS = 96;

export class ConstructGfx {
  constructor(R, h) {
    this.R = R; this.sim = R.sim; this.h = h;
    this.group = new THREE.Group();
    R.scene.add(this.group);
    this.sig = ''; this.next = 0;
    const L = (o) => new THREE.MeshLambertMaterial(o);
    this.M = {
      rope: L({ color: '#e0d2a0' }), dirt: L({ color: '#7a5634' }), green: L({ color: '#3f8f3a' }), straw: L({ color: '#d8c05a' }),
      keg: L({ color: '#5a3a22' }), tile: L({ color: '#b4523c' }), lime: L({ color: '#ecebe4' }), gravel: L({ color: '#a8a49a' }), iron: L({ color: '#44444e' }),
    };
    // 最初から描かれている柵と塀（render.js の buildStructures）：ここでは描かない
    const w = this.sim.S.world;
    this.staticF = new Set(); this.staticW = new Set();
    for (let i = 0; i < W * H; i++) { const t = w.tiles[i]; if (t === T.FENCE) this.staticF.add(i); else if (t === T.WALL) this.staticW.add(i); }
    // 背の荷（色は品ごと）と荷車
    this.loads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.22, 0.2), new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX_LOADS);
    this.loads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LOADS * 3), 3);
    this.frames = new THREE.InstancedMesh(this.frameGeo(), R.mats.wood, MAX_LOADS);
    this.carts = new THREE.InstancedMesh(this.cartGeo(), R.mats.wood, MAX_LOADS);
    for (const m of [this.loads, this.frames, this.carts]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; this.R.scene.add(m); }
    this.lastPos = new Map();
    this.col = new THREE.Color(); this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }
  // 背負子（木の枠）
  frameGeo() {
    const R = this.R, g = [];
    for (const x of [-0.1, 0.1]) { const b = R.box(0.03, 0.42, 0.03); b.translate(x, 0, 0); g.push(b); }
    for (const y of [-0.12, 0.12]) { const b = R.box(0.24, 0.03, 0.03); b.translate(0, y, 0); g.push(b); }
    return mergeGeometries(g);
  }
  // 手押しの荷車（荷台・車輪2つ・引き手）
  cartGeo() {
    const R = this.R, g = [];
    const bed = R.box(0.52, 0.06, 0.36); bed.translate(0, 0.2, 0); g.push(bed);
    for (const z of [-0.18, 0.18]) { const side = R.box(0.52, 0.1, 0.03); side.translate(0, 0.27, z); g.push(side); }
    for (const z of [-0.21, 0.21]) { const wh = R.cyl(0.13, 0.13, 0.04, 10); wh.rotateX(Math.PI / 2); wh.translate(0, 0.13, z); g.push(wh); }
    for (const z of [-0.12, 0.12]) { const hd = R.box(0.42, 0.03, 0.03); hd.translate(0.45, 0.24, z); g.push(hd); }
    return mergeGeometries(g);
  }

  update(now) {
    if (now >= this.next) {
      this.next = now + 0.4;
      const sig = this.signature();
      if (sig !== this.sig) { this.sig = sig; try { this.rebuild(); } catch (e) { console.error('constructgfx: 描き直しで', e); } }
    }
    try { this.updateLoads(); } catch (e) { console.error('constructgfx: 荷の絵で', e); }
  }
  signature() {
    const C = this.sim.S.cons;
    let s = `${C?.ver ?? -1}|${C?.frozen?.length ?? 0}`;
    for (const o of consRoadsAhead(this.sim)) if (o.a === 0) s += `|${o.i}:${Math.round(o.p * 4)}`; else s += `|${o.i}`;
    return s;
  }

  // ---------- 普請場の形を作り直す ----------
  rebuild() {
    for (const m of this.group.children.slice()) { this.group.remove(m); m.geometry.dispose(); }
    const sim = this.sim, S = sim.S, C = S.cons;
    const byMat = new Map();
    const put = (mat, g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); };
    if (C) {
      for (const site of Object.values(C.sites)) {
        if (site.form === 'line') this.drawLine(site, put);
        else this.drawBld(site, site.st, site.sp, put, true);
      }
      for (const f of C.frozen || []) { const b = sim.building(f.b); if (b && b.type === 'site') this.drawBld({ b: f.b, tag: f.tag, st: f.st, sp: f.sp, frozen: true }, f.st, f.sp, put, false); }
      this.drawBuilt(C, put);
    }
    for (const o of consRoadsAhead(sim)) this.drawRoad(o, put);
    for (const [mat, geos] of byMat) {
      const g = mergeGeometries(geos, false);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // ---------- 建物の普請 ----------
  drawBld(site, st, sp, put, live) {
    const sim = this.sim, R = this.R, M = R.mats, X = this.M, w = sim.S.world;
    const { wx, wz, topY } = this.h;
    const b = sim.building(site.b);
    if (!b) return;
    const type = b.futureType || b.type;
    const up = site.tag === 'expand2f';
    const y0 = topY(w.hgt[b.door.z * W + b.door.x]);
    const cx = wx(b.x) + (b.w - 1) / 2, cz = wz(b.z) + (b.d - 1) / 2;
    const W_ = Math.max(0.6, b.w - 0.25), D_ = Math.max(0.6, b.d - 0.25);
    const south = !!KINGDOMS[b.kingdom]?.south;
    const stoneT = STONE_TYPES.has(type);
    const base = up ? 1.15 : 0;
    const WH = up ? 2.1 - 1.15 : wallH(type);
    const wallMat = stoneT ? (south ? M.sandstone : M.stone) : south ? M.adobe : type === 'well' ? M.stone : M.timber;
    const box = (x, y, z, sx, sy, sz, mat, ry = 0) => put(mat, R.box(sx, sy, sz), x, y, z, ry);
    const ropeY = y0 + 0.28;
    // 縄張り：四隅の杭と縄（土台ができるまで）
    if (!up && st <= ST.found) {
      const ex = W_ / 2 + 0.14, ez = D_ / 2 + 0.14;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(cx + sx * ex, y0 + 0.19, cz + sz * ez, 0.06, 0.38, 0.06, M.wood);
      if (st < ST.found || sp < 0.5) {
        box(cx, ropeY, cz - ez, ex * 2, 0.02, 0.02, X.rope); box(cx, ropeY, cz + ez, ex * 2, 0.02, 0.02, X.rope);
        box(cx - ex, ropeY, cz, 0.02, 0.02, ez * 2, X.rope); box(cx + ex, ropeY, cz, 0.02, 0.02, ez * 2, X.rope);
      }
      if (st === ST.stake) { const k = Math.min(1, sp * 1.3); box(cx - W_ / 4, y0 + 0.012, cz, W_ * 0.5 * k + 0.05, 0.02, 0.08, X.dirt); }   // 地面に引いた線
    }
    // 土台：掘った溝と石の基礎
    let slab = 0;
    if (!up && st >= ST.found) {
      slab = st === ST.found ? 0.04 + 0.18 * sp : 0.22;
      if (st === ST.found) for (const [sx, sz, lx, lz] of [[0, -1, W_ + 0.5, 0.18], [0, 1, W_ + 0.5, 0.18], [-1, 0, 0.18, D_ + 0.5], [1, 0, 0.18, D_ + 0.5]]) box(cx + sx * (W_ / 2 + 0.16), y0 + 0.01, cz + sz * (D_ / 2 + 0.16), lx, 0.02, lz, X.dirt);
      box(cx, y0 + slab / 2, cz, W_ + 0.1, slab, D_ + 0.1, south ? M.sandstone : M.stone);
    }
    const fy = y0 + base + slab;
    const Hp = Math.max(0.2, (base + WH) - (base + slab));
    const top = y0 + base + WH;
    // 骨組み：柱が1本ずつ、そのあと梁
    const posts = [];
    const nx = Math.max(1, Math.ceil(W_ / 0.9)), nz = Math.max(1, Math.ceil(D_ / 0.9));
    for (let i = 0; i <= nx; i++) for (const s of [-1, 1]) posts.push([-W_ / 2 + (W_ * i) / nx, s * D_ / 2]);
    for (let j = 1; j < nz; j++) for (const s of [-1, 1]) posts.push([s * W_ / 2, -D_ / 2 + (D_ * j) / nz]);
    if (st >= ST.frame) {
      const n = st === ST.frame ? Math.ceil(posts.length * Math.min(1, (sp + 0.05) / 0.6)) : posts.length;
      for (let i = 0; i < n; i++) box(cx + posts[i][0], fy + Hp / 2, cz + posts[i][1], 0.1, Hp, 0.1, M.wood);
      const bk = st === ST.frame ? Math.max(0, Math.min(1, (sp - 0.6) / 0.35)) : 1;
      if (bk > 0) {
        box(cx - W_ / 2 + (W_ * bk) / 2, top - 0.05, cz - D_ / 2, W_ * bk, 0.1, 0.1, M.wood);
        box(cx - W_ / 2 + (W_ * bk) / 2, top - 0.05, cz + D_ / 2, W_ * bk, 0.1, 0.1, M.wood);
        box(cx - W_ / 2, top - 0.05, cz - D_ / 2 + (D_ * bk) / 2, 0.1, 0.1, D_ * bk, M.wood);
        box(cx + W_ / 2, top - 0.05, cz - D_ / 2 + (D_ * bk) / 2, 0.1, 0.1, D_ * bk, M.wood);
        if (bk >= 1 && !stoneT) { box(cx, fy + Hp * 0.5, cz - D_ / 2, W_, 0.06, 0.06, M.wood); box(cx, fy + Hp * 0.5, cz + D_ / 2, W_, 0.06, 0.06, M.wood); }
      }
    }
    // 壁：下から積み上がる
    if (st >= ST.wall) {
      const hw = st === ST.wall ? Math.max(0.05, Hp * sp) : Hp;
      const t = 0.09;
      box(cx, fy + hw / 2, cz - D_ / 2, W_, hw, t, wallMat); box(cx, fy + hw / 2, cz + D_ / 2, W_, hw, t, wallMat);
      box(cx - W_ / 2, fy + hw / 2, cz, t, hw, D_, wallMat); box(cx + W_ / 2, fy + hw / 2, cz, t, hw, D_, wallMat);
    }
    // 屋根：垂木が並び、端から葺いていく
    const along = W_ >= D_;
    const L = (along ? W_ : D_) + 0.35, Dp = (along ? D_ : W_) + 0.4, Hr = type === 'well' ? 0.35 : Math.min(1.1, 0.55 + Math.min(W_, D_) * 0.22);
    const ry = along ? 0 : Math.PI / 2;
    if (st >= ST.roof) {
      const cover = st === ST.roof ? sp : 1;
      const nr = st === ST.roof ? Math.max(2, Math.ceil(L / 0.45)) : -1;   // 垂木は葺いている間だけ見える
      const slope = Math.hypot(Dp / 2, Hr), ang = Math.atan2(Hr, Dp / 2);
      for (let i = 0; i <= nr; i++) {
        const u = -L / 2 + (L * i) / nr;
        for (const s of [-1, 1]) {
          const g = R.box(0.06, 0.06, slope); g.rotateX(s * ang); g.translate(0, Hr / 2, -s * Dp / 4);
          if (ry) g.rotateY(ry);
          const ux = along ? u : 0, uz = along ? 0 : u;
          put(M.wood, g, cx + ux, top, cz + uz);
        }
      }
      box(cx, top + Hr, cz, along ? L : 0.08, 0.08, along ? 0.08 : L, M.wood);   // 棟木
      if (cover > 0.02) {
        const rm = south ? M.tileRoofS : (stoneT || b.roof === 'tile' || type === 'tavern') ? (stoneT ? M.greyRoof : M.tileRoof) : M.thatch;
        const g = R.prism(L * cover, Dp, Hr);
        g.translate(-L / 2 + (L * cover) / 2, 0, 0);
        put(rm, g, cx, top + 0.02, cz, ry);
      }
    } else if (st > ST.frame) box(cx, top + 0.05, cz, along ? W_ : 0.08, 0.08, along ? 0.08 : D_, M.wood);
    // 上棟の若木（骨組みができてから、屋根ができあがるまで）
    if (st > ST.frame && st <= ST.roof && live) {
      const ty = st >= ST.roof ? top + Hr + 0.05 : top + 0.1;
      put(X.green, R.cone(0.16, 0.42, 6), cx, ty + 0.21, cz);
      put(M.wood, R.box(0.04, 0.2, 0.04), cx, ty, cz);
    }
    // 足場：骨組みの途中から屋根まで
    if (live && ((st === ST.frame && sp > 0.35) || st === ST.wall || st === ST.roof)) {
      const ox = W_ / 2 + 0.3, oz = D_ / 2 + 0.3, ph = top - y0 + 0.35;
      const nsx = Math.max(1, Math.ceil((ox * 2) / 1.2)), nsz = Math.max(1, Math.ceil((oz * 2) / 1.2));
      for (let i = 0; i <= nsx; i++) for (const s of [-1, 1]) box(cx - ox + (ox * 2 * i) / nsx, y0 + ph / 2, cz + s * oz, 0.05, ph, 0.05, M.wood);
      for (let j = 1; j < nsz; j++) for (const s of [-1, 1]) box(cx + s * ox, y0 + ph / 2, cz - oz + (oz * 2 * j) / nsz, 0.05, ph, 0.05, M.wood);
      const levels = up ? [base + 0.05, base + WH * 0.6] : [0.55, Math.max(0.9, WH - 0.15)];
      for (const lv of levels) {
        const y = y0 + lv;
        box(cx, y, cz - oz, ox * 2, 0.035, 0.22, M.planks); box(cx, y, cz + oz, ox * 2, 0.035, 0.22, M.planks);
        box(cx - ox, y, cz, 0.22, 0.035, oz * 2, M.planks); box(cx + ox, y, cz, 0.22, 0.035, oz * 2, M.planks);
      }
      // 梯子
      const lx = cx + ox + 0.14, lz = cz + oz * 0.4, lh = Math.min(1.6, ph);
      for (const s of [-0.09, 0.09]) { const g = R.box(0.03, lh, 0.03); g.rotateZ(-0.18); put(M.wood, g, lx, y0 + lh / 2, lz + s); }
      for (let k = 1; k < 5; k++) { const g = R.box(0.03, 0.03, 0.2); put(M.wood, g, lx - (lh * k / 5 - lh / 2) * Math.sin(0.18), y0 + (lh * k) / 5, lz); }
    }
    // 仕上げ：戸口の枠
    if (st >= ST.finish) {
      const face = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
      box(cx + face[0] * (W_ / 2 + 0.03), fy + 0.31, cz + face[1] * (D_ / 2 + 0.03), face[0] ? 0.06 : 0.44, 0.62, face[1] ? 0.06 : 0.44, M.door);
    }
    if (!live) return;
    // 資材置き場
    if (site.yard) this.drawPile(site, site.yard.x, site.yard.z, put);
    // 木挽き台（骨組みから屋根まで）
    if (st >= ST.frame && st <= ST.roof && site.yard) {
      const hx = wx(site.yard.x) + 0.25, hz = wz(site.yard.z) - 0.28, hy = topY(w.hgt[site.yard.z * W + site.yard.x]);
      for (const s of [-0.2, 0.2]) { const g = R.box(0.04, 0.32, 0.04); g.rotateZ(0.3); put(M.wood, g, hx + s, hy + 0.15, hz - 0.06); const g2 = R.box(0.04, 0.32, 0.04); g2.rotateZ(-0.3); put(M.wood, g2, hx + s, hy + 0.15, hz + 0.06); }
      box(hx, hy + 0.3, hz, 0.7, 0.07, 0.08, M.planks);
    }
  }

  // 資材の山：量に合わせて高くなる
  drawPile(site, tx, tz, put) {
    const sim = this.sim, R = this.R, M = R.mats, X = this.M, w = sim.S.world;
    const { wx, wz, topY } = this.h;
    if (!(tx >= 0 && tz >= 0 && tx < W && tz < H)) return;
    const y = topY(w.hgt[tz * W + tx]);
    const x0 = wx(tx), z0 = wz(tz);
    const on = site.onsite || {};
    const n = (g, cap) => Math.min(cap, Math.ceil((on[g] || 0) - 1e-6));
    // 材木：3本ずつ井桁に積む
    const nw = n('wood', 12);
    for (let i = 0; i < nw; i++) {
      const l = Math.floor(i / 3), k = i % 3;
      const g = R.cyl(0.05, 0.05, 0.62, 6); g.rotateZ(Math.PI / 2);
      if (l & 1) g.rotateY(Math.PI / 2);
      put(M.wood, g, x0 - 0.18 + (l & 1 ? (k - 1) * 0.12 : 0), y + 0.05 + l * 0.095, z0 - 0.18 + (l & 1 ? 0 : (k - 1) * 0.12));
    }
    // 板材：平らに重ねる
    const np = n('planks', 10);
    for (let i = 0; i < np; i++) put(M.planks, R.box(0.55, 0.03, 0.15), x0 - 0.15, y + 0.02 + i * 0.032, z0 + 0.24);
    // 石材：四角い石をピラミッドに
    const ns = n('stone', 14);
    const lay = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
    for (let i = 0; i < ns; i++) {
      const lv = i < 9 ? 0 : 1, j = lv ? i - 9 : i;
      const [a, c] = lay[j] || [0, 0];
      put(M.stone, R.box(0.14, 0.12, 0.14), x0 + 0.08 + a * 0.15 + lv * 0.07, y + 0.06 + lv * 0.12, z0 - 0.3 + c * 0.15 + lv * 0.07);
    }
    // 瓦・藁・石灰・粘土・釘
    const nt = Math.min(8, Math.ceil((on.rooftile || 0) / 2 - 1e-6));
    for (let i = 0; i < nt; i++) put(X.tile, R.box(0.28, 0.035, 0.2), x0 + 0.26, y + 0.02 + i * 0.037, z0 + 0.26);
    const nst = Math.min(6, Math.ceil((on.straw || 0) / 2 - 1e-6));
    for (let i = 0; i < nst; i++) { const g = R.cyl(0.08, 0.08, 0.4, 6); g.rotateX(Math.PI / 2); put(X.straw, g, x0 + 0.28 - (i % 3) * 0.16, y + 0.08 + Math.floor(i / 3) * 0.14, z0 + 0.05); }
    const nl = n('slakedlime', 4) + n('clay', 4);
    for (let i = 0; i < nl; i++) put(i < n('slakedlime', 4) ? X.lime : X.dirt, R.box(0.16, 0.12, 0.12), x0 - 0.36, y + 0.06 + Math.floor(i / 2) * 0.12, z0 + 0.05 + (i % 2) * 0.13);
    if ((on.iron_nail || 0) > 0.05) { put(X.keg, R.cyl(0.08, 0.08, 0.16, 8), x0 - 0.36, y + 0.08, z0 - 0.3); put(X.iron, R.cyl(0.085, 0.085, 0.02, 8), x0 - 0.36, y + 0.14, z0 - 0.3); }
  }

  // ---------- 柵・石の塀（線の普請） ----------
  drawLine(site, put) {
    const sim = this.sim, R = this.R, M = R.mats, X = this.M, w = sim.S.world;
    const { wx, wz, topY } = this.h;
    const tiles = site.tiles;
    const pos = (i) => ({ x: wx(i % W), z: wz((i / W) | 0), y: topY(w.hgt[i]) });
    for (let k = 0; k < 5 && site.ti + k < tiles.length; k++) {
      const i = tiles[site.ti + k], p = pos(i);
      if (k === 0) {
        if (site.lk === 'wall') {
          const hh = 1.4 * Math.max(0.06, site.tp);
          put(M.stone, R.box(0.96, hh, 0.96), p.x, p.y + hh / 2, p.z);
          for (const [a, c] of [[-0.55, -0.55], [0.55, 0.55]]) put(M.wood, R.box(0.05, 1.7, 0.05), p.x + a, p.y + 0.85, p.z + c);
          put(M.planks, R.box(1.2, 0.035, 0.2), p.x, p.y + 0.8, p.z + 0.55);
        } else {
          const ph = 0.45 * Math.min(1, 0.25 + site.tp * 1.6);
          put(M.wood, R.box(0.1, ph, 0.1), p.x, p.y + ph / 2, p.z);
          if (site.tp > 0.55 && site.ti > 0) {
            const q = pos(tiles[site.ti - 1]);
            if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) <= 1.01) {
              const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, alongX = Math.abs(q.x - p.x) > 0.5;
              for (let r = 0; r < (site.tp > 0.85 ? 2 : 1); r++) put(M.wood, R.box(alongX ? 1 : 0.05, 0.06, alongX ? 0.05 : 1), mx, p.y + 0.16 + r * 0.17, mz);
            }
          }
        }
      } else {
        // 次に打つ所：小さな杭と縄
        put(M.wood, R.box(0.05, 0.2, 0.05), p.x, p.y + 0.1, p.z);
        const i2 = tiles[site.ti + k - 1], q = pos(i2);
        if (Math.abs(q.x - p.x) + Math.abs(q.z - p.z) <= 1.01) put(X.rope, R.box(Math.abs(q.x - p.x) > 0.5 ? 1 : 0.02, 0.02, Math.abs(q.z - p.z) > 0.5 ? 1 : 0.02), (p.x + q.x) / 2, p.y + 0.17, (p.z + q.z) / 2);
      }
    }
    // 資材置き場は、今の頭のそば
    const i = tiles[Math.min(site.ti, tiles.length - 1)], tx = i % W, tz = (i / W) | 0;
    let best = null;
    for (const [a, c] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1]]) { const t = w.tiles[(tz + c) * W + tx + a]; if (t === T.GRASS || t === T.SAVANNA || t === T.DESERT || t === T.SNOW || t === T.ROAD || t === T.PLAZA || t === T.FOREST) { best = [tx + a, tz + c]; break; } }
    if (best) this.drawPile(site, best[0], best[1], put);
  }
  // あとから建った柵と塀（最初からある分は render.js が描いている）
  drawBuilt(C, put) {
    const sim = this.sim, R = this.R, M = R.mats, w = sim.S.world;
    const { wx, wz, topY } = this.h;
    const isF = (i) => i >= 0 && i < W * H && w.tiles[i] === T.FENCE;
    for (const i of C.built.f) {
      if (this.staticF.has(i) || w.tiles[i] !== T.FENCE) continue;
      const x = i % W, z = (i / W) | 0, y = topY(w.hgt[i]);
      put(M.wood, R.box(0.1, 0.45, 0.1), wx(x), y + 0.225, wz(z));
      for (const [dx, dz, j] of [[1, 0, i + 1], [0, 1, i + W], [-1, 0, i - 1], [0, -1, i - W]]) {
        if (!isF(j)) continue;
        if ((dx < 0 || dz < 0) && !this.staticF.has(j)) continue;   // 向こうも新しい柵なら、向こうが描く
        for (let r = 0; r < 2; r++) put(M.wood, R.box(dx ? 1 : 0.05, 0.06, dz ? 1 : 0.05), wx(x) + dx * 0.5, y + 0.16 + r * 0.17, wz(z) + dz * 0.5);
      }
    }
    for (const i of C.built.w) {
      if (this.staticW.has(i) || w.tiles[i] !== T.WALL) continue;
      const x = i % W, z = (i / W) | 0, y = topY(w.hgt[i]);
      put(M.stone, R.box(1, 1.4, 1), wx(x), y + 0.7, wz(z));
      put(M.stone, R.box(0.35, 0.3, 0.35), wx(x) + ((x + z) % 2 ? 0.25 : -0.25), y + 1.55, wz(z));
    }
  }
  // ---------- 道・橋の普請の頭 ----------
  drawRoad(o, put) {
    const sim = this.sim, R = this.R, M = R.mats, X = this.M, w = sim.S.world;
    const { wx, wz, topY } = this.h;
    const t = w.tiles[o.i];
    if (t === T.ROAD || t === T.BRIDGE || t === T.PLAZA) return;
    const x = wx(o.i % W), z = wz((o.i / W) | 0), y = topY(w.hgt[o.i]);
    if (o.kind === 'bridge') {
      if (o.a > 1) return;
      const hy = y - 0.1;
      for (const [a, c] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) put(M.wood, R.box(0.1, 0.8, 0.1), x + a, hy - 0.2, z + c);
      if (o.a === 0 && o.p > 0.3) for (const c of [-0.4, 0.4]) put(M.wood, R.box(1, 0.08, 0.1), x, hy + 0.2, z + c);
      if (o.a === 0 && o.p > 0.7) for (const c of [-0.4, 0.4]) put(M.wood, R.box(0.1, 0.08, 1), x + c, hy + 0.2, z);
      return;
    }
    if (o.a === 0) {
      put(X.dirt, R.box(0.94, 0.03, 0.94), x, y + 0.015, z);
      if (o.p > 0.35) for (const [a, c] of [[-0.25, -0.2], [0.2, -0.28], [0.05, 0.1], [-0.2, 0.25], [0.28, 0.22], [0.3, -0.02]]) put(X.gravel, R.box(0.16, 0.05, 0.14), x + a, y + 0.04, z + c);
      put(M.stone, R.box(0.16, 0.12, 0.16), x + 0.55, y + 0.06, z + 0.3); put(M.stone, R.box(0.14, 0.1, 0.14), x + 0.58, y + 0.17, z + 0.3);
    } else if (o.a <= 2) {
      put(M.wood, R.box(0.04, 0.2, 0.04), x - 0.42, y + 0.1, z - 0.42); put(M.wood, R.box(0.04, 0.2, 0.04), x + 0.42, y + 0.1, z + 0.42);
      put(X.rope, R.box(0.02, 0.02, 1.2), x, y + 0.17, z, Math.PI / 4);
    }
  }

  // ---------- 荷を担いで歩く人：背の荷と荷車 ----------
  updateLoads() {
    const sim = this.sim, C = sim.S.cons, R = this.R;
    let nl = 0, nf = 0, nc = 0;
    const ids = C?.haul || [];
    for (const id of ids) {
      if (nl >= MAX_LOADS) break;
      const p = sim.S.people[id];
      const hl = p?.consHaul;
      if (!hl || hl.leg !== 'drop') continue;
      const r = R.ents.get(id);
      if (!r || !r.sprite.visible) continue;
      const sp = r.sprite.position;
      this.col.set(GOOD_COL[hl.g] || '#8a6a4a');
      let dx = r.tx - r.fx, dz = r.tz - r.fz;
      const d = Math.hypot(dx, dz);
      const last = this.lastPos.get(id);
      if (d > 0.01) { dx /= d; dz /= d; this.lastPos.set(id, [dx, dz]); } else if (last) { [dx, dz] = last; } else { dx = 1; dz = 0; }
      if (hl.how === 'cart' || hl.how === 'beast') {
        // 手押しの荷車：人の前を押していく
        const ang = Math.atan2(-dz, dx);
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), ang + Math.PI);
        this.m4.compose(this.v.set(sp.x + dx * 0.5, sp.y, sp.z + dz * 0.5), this.q, this.s.set(1, 1, 1));
        this.carts.setMatrixAt(nc++, this.m4);
        const k = Math.min(3, Math.max(1, Math.round(hl.kg / 25)));
        for (let j = 0; j < k && nl < MAX_LOADS; j++) {
          this.m4.compose(this.v.set(sp.x + dx * (0.42 + (j - 1) * 0.14), sp.y + 0.36 + (j === 1 ? 0.1 : 0), sp.z + dz * (0.42 + (j - 1) * 0.14)), this.q, this.s.set(0.9, 0.7, 1.1));
          this.loads.setMatrixAt(nl, this.m4); this.loads.setColorAt(nl++, this.col);
        }
      }
      // 背負子の荷は、人のドット絵（constructanim.js の c_carry）が受け持つ
    }
    this.loads.count = nl; this.frames.count = nf; this.carts.count = nc;
    this.loads.instanceMatrix.needsUpdate = true; this.frames.instanceMatrix.needsUpdate = true; this.carts.instanceMatrix.needsUpdate = true;
    if (this.loads.instanceColor) this.loads.instanceColor.needsUpdate = true;
  }
}
void STAGES;
