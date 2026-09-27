// 造幣所の中と国庫の宝物庫・鉱石の荷車の見た目（3D）と、造幣の職人の動き（ドット絵）の差し込み（経済部）
//
// ■ 造幣所の中（mintInterior：据え付けの物）
//   炉（火と煙突・火の光）・足踏みのふいご・炉の上のるつぼ／鋳型の台（鋳型3つ・流したばかりの赤い延べ板）・冷ます水おけ／
//   金床と打ち型（大きい部屋は2台）・槌／鉱石の囲い（西の壁）・延べ板の棚（東の壁）・硬貨を数える台と天秤／国庫へ送る金箱の置き場
// ■ 在庫（mintAttach・mintTick：3秒ごとに数を見て作り直す）
//   鉱石の山（銀鉱石・金鉱石の数だけ石）・炉の中の溶けた銀（るつぼの湯の高さ）・延べ板の山（枚数ぶん・金は金色）・
//   硬貨の箱（打ち置きの硬貨40枚で1箱）・国庫へ送る金箱（取り分がたまると増える）・炉の煙（動く）
// ■ 職人の動き：造幣所の中で工程の場所に着いた職人は、歩行の絵の代わりに工程の動き（mintanim.js）を映す
// ■ 王城の宝物庫（castleint.js が K.vault に宝物庫の場所を入れる）：国庫の額に応じて、硬貨の袋・硬貨の箱・宝箱・硬貨の山を増やし減らす
// ■ 荷車（mintCartMesh）：鉱石の荷車（麻袋と鉱石の箱・石）と、硬貨の金箱をのせた手押し車
//
// 本体からの呼び方（interior.js・render.js。つなぎ方は scratchpad/mint/apply.py）
//   interior.js open …… if (type === 'mint') MG.mintInterior(K, ctx, F) / 最後に MG.mintAttach(this, b)
//   interior.js update … animate のあとに MG.mintTick(this, dt, now) / close の頭 … MG.mintDetach(this)
//   interior.js kindFor … if (t === 'mint') { const mk = MG.mintKindFor(e); if (mk) return mk; }
//   render.js updateConvoys … mintViews の荷車は MG.mintCartMesh(v) で作る
import * as THREE from 'three';
import { mintStock, mintKindFor, MINT_FALLBACK, MINT_HOOKS } from './mintflow.js';
import { drawPersonAnim, animFrameAt } from './anim_people.js';
import { STEP_ANIM } from './mintanim.js';

export { mintKindFor, MINT_FALLBACK };
export const MINT_INT_LABEL = { mint: '王立造幣所の作業場' };

// 国ごとの硬貨の見た目（別の社員の coinage.js があれば使う。なければ今の銅貨の色）
import('./coinage.js').then((m) => { if (typeof m.coinStyle === 'function') MINT_HOOKS.coinStyle = m.coinStyle; }).catch(() => {});
const COPPER = '#c8783a';
function coinColor(sim, kid) {
  try { const c = MINT_HOOKS.coinStyle && MINT_HOOKS.coinStyle(sim, kid); if (c?.color) return c.color; } catch { /* まだない */ }
  return COPPER;
}

// ---------- 材質（一度だけ） ----------
const MATS = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  let m = MATS.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, ...o }); MATS.set(key, m); }
  return m;
}
const glow = (c, e, i = 1.4) => mat(c, { emissive: e, emissiveIntensity: i });
const hsh = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ================================================================ 造幣所の中（据え付け）
export function mintInterior(K, ctx, F) {
  const { M, W, D } = K;
  const south = ctx.b?.kingdom === 2;
  F.room(K, { floor: south ? M.sandFloor : M.plaza, wall: south ? M.sandstone : M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [], W: [2], E: [2], S: [1, W - 2] } });
  const iron = M.iron, clay = M.clay, wood = M.wood, dwood = M.darkWood;
  // --- 炉（北西）：石の炉・火・煙のフード・煙突
  K.box(0.3, 0, 0, 2.6, 0.95, 1.7, M.stone);
  K.box(0.6, 0.95, 0.3, 2.0, 0.12, 1.1, M.coal);
  K.box(0.8, 1.07, 0.5, 1.6, 0.08, 0.7, M.fire);
  K.box(0.5, 2.05, 0.1, 2.2, 0.2, 1.2, M.darkStone); K.box(0.9, 2.25, 0, 1.4, K.wallH - 2.25, 0.8, M.darkStone, { g: 'N' });   // 煙のフードと煙突
  for (const x of [0.55, 2.55]) K.box(x, 0.95, 1.2, 0.12, 1.1, 0.12, M.darkStone);   // フードを支える柱
  K.box(1.1, 0.35, 1.68, 1.0, 0.45, 0.06, M.fire);   // 焚き口の火
  K.solid(0.3, 0, 2.6, 1.8);
  K.light(1.6, 1.4, 1.3, '#ff6a20', 5, 8, 1.6);
  // るつぼ（炉の上）
  K.cyl(1.9, 1.07, 0.85, 0.24, 0.32, clay, { r2: 0.3, seg: 8 });
  K.cyl(1.9, 1.36, 0.85, 0.24, 0.03, M.fire2, { seg: 8 });
  // やっとこ（炉の脇に立てかけ）
  K.box(2.95, 0, 0.2, 0.05, 1.1, 0.05, iron, { rz: 0.15 }); K.box(3.05, 0, 0.2, 0.05, 1.1, 0.05, iron, { rz: 0.2 });
  // --- 足踏みのふいご（炉の前）：職人が乗って踏む
  K.box(1.4, 0, 1.95, 1.2, 0.12, 0.8, dwood);
  K.box(1.45, 0.12, 2.0, 1.1, 0.1, 0.7, M.brown);
  K.box(1.5, 0.22, 2.05, 1.0, 0.05, 0.6, dwood);
  K.box(1.85, 0.05, 1.7, 0.1, 0.1, 0.3, iron);      // 炉へ風を送る管
  K.slot('smelt', 2.0, 2.35, { face: [0, -1], y: 0.24 });
  // --- 鋳型の台（北東）と、冷ます水おけ
  const cx0 = Math.max(4.2, W - 4.3);
  F.table(K, cx0, 0.25, 3.2, 1.0, { h: 0.8, top: dwood });
  for (let i = 0; i < 3; i++) {
    const x = cx0 + 0.3 + i * 0.95;
    K.box(x, 0.8, 0.4, 0.75, 0.1, 0.7, iron);
    for (let g = 0; g < 2; g++) K.box(x + 0.1, 0.9, 0.5 + g * 0.3, 0.55, 0.02, 0.18, g === 0 && i === 0 ? M.fire2 : M.soot);
  }
  K.slot('cast', cx0 + 1.2, 1.8, { face: [0, -1] });
  const tx = W - 1.1, tz = 1.6;
  K.box(tx - 0.45, 0, tz, 0.9, 0.55, 1.3, wood); K.box(tx - 0.37, 0.48, tz + 0.08, 0.74, 0.05, 1.14, M.water);
  K.box(tx - 0.47, 0.15, tz - 0.02, 0.94, 0.06, 1.34, iron); K.solid(tx - 0.45, tz, 0.9, 1.3);
  // --- 金床と打ち型（まん中。広い部屋は2台）
  const anvils = W >= 10 ? [W / 2 + 0.9, W / 2 - 1.6] : [W / 2 + 0.3];
  const az = Math.max(3.4, D / 2);
  for (const ax of anvils) {
    K.box(ax - 0.28, 0, az - 0.25, 0.56, 0.48, 0.5, dwood);
    K.box(ax - 0.2, 0.48, az - 0.15, 0.4, 0.18, 0.3, iron); K.box(ax - 0.42, 0.66, az - 0.18, 0.84, 0.16, 0.36, iron); K.box(ax + 0.42, 0.7, az - 0.08, 0.22, 0.1, 0.16, iron);
    K.cyl(ax - 0.05, 0.82, az, 0.05, 0.22, M.steel, { seg: 6 });             // 打ち型（上の型）
    K.cyl(ax - 0.05, 0.82, az, 0.08, 0.02, glow('#e8c070', '#c89040', 0.3), { seg: 8 });   // 打つ前の円い板
    K.box(ax + 0.25, 0.82, az - 0.1, 0.08, 0.06, 0.34, dwood); K.box(ax + 0.2, 0.82, az + 0.2, 0.18, 0.12, 0.1, iron);   // 槌
    K.solid(ax - 0.45, az - 0.3, 0.9, 0.6);
    K.slot('strike', ax, az + 0.85, { face: [0, -1] });
  }
  // --- 鉱石の囲い（西の壁）
  const bz = Math.max(2.9, D / 2 - 1.2);
  K.box(0.15, 0, bz, 1.7, 0.45, 0.08, wood); K.box(0.15, 0, bz + 2.0, 1.7, 0.45, 0.08, wood); K.box(1.8, 0, bz, 0.08, 0.45, 2.08, wood);
  K.box(0.15, 0, bz, 1.7, 0.02, 2.0, M.dirt);
  K.solid(0.15, bz, 1.75, 2.1);
  F.wallPic(K, 'W', bz + 1.0, 1.2, 0.9, 0.5, M.notice);
  // --- 延べ板の棚（東の壁）
  const rz = Math.max(3.3, D / 2 - 0.7);
  K.box(W - 1.2, 0, rz, 1.0, 0.5, 1.6, dwood); K.box(W - 1.25, 0.5, rz - 0.05, 1.1, 0.06, 1.7, iron);
  K.solid(W - 1.2, rz, 1.0, 1.6);
  // --- 硬貨を数える台と天秤（南東）
  const kx = W - 3.6, kz = D - 2.5;
  F.table(K, kx, kz, 2.2, 0.9, { top: dwood });
  const bx = kx + 0.6, bzz = kz + 0.45;
  K.box(bx - 0.03, 0.72, bzz - 0.03, 0.06, 0.6, 0.06, M.brass); K.box(bx - 0.4, 1.3, bzz - 0.02, 0.8, 0.04, 0.04, M.brass);
  for (const s of [-1, 1]) { K.cyl(bx + s * 0.38, 1.02, bzz, 0.14, 0.03, M.brass, { seg: 8 }); K.box(bx + s * 0.38 - 0.01, 1.05, bzz - 0.01, 0.02, 0.25, 0.02, M.brass); }
  K.box(kx + 1.2, 0.72, kz + 0.2, 0.7, 0.04, 0.5, M.white);   // 帳面
  F.stool(K, kx + 1.0, kz + 1.35); K.slot('count', kx + 1.0, kz + 1.35, { face: [0, -1] });
  // --- 国庫へ送る金箱の置き場（南西）：石の台
  K.box(0.3, 0, D - 1.9, 1.6, 0.08, 1.4, M.darkStone);
  // 明かり
  F.torch(K, 'W', D - 2.5, 1.6); F.torch(K, 'E', D - 3.5, 1.6); F.torch(K, 'S', 1.6, 1.7);
  F.barrel(K, W - 0.6, D - 0.8, { h: 0.7 });
  K.mintRoom = { bz, rz, kx, kz, az, W, D };
}

// ================================================================ 在庫（動く物）
function addBox(g, x, y, z, w, h, d, m, o = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x + w / 2, y + h / 2, z + d / 2);
  if (o.ry) mesh.rotation.y = o.ry;
  g.add(mesh); return mesh;
}
function addCyl(g, x, y, z, r, h, m, o = {}) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 8), m);
  mesh.position.set(x, y + h / 2, z); g.add(mesh); return mesh;
}
function coinBox(g, x, z, cc, full = 1) {   // 硬貨の箱：板の箱に硬貨がつまっている
  addBox(g, x, 0, z, 0.5, 0.26, 0.38, mat('#7a4a26'));
  addBox(g, x + 0.04, 0.26, z + 0.04, 0.42, 0.001 + 0.06 * full, 0.3, mat(cc));
  addBox(g, x + 0.02, 0.1, z - 0.01, 0.46, 0.04, 0.4, mat('#4a4a52'));
  for (let i = 0; i < 3; i++) addCyl(g, x + 0.12 + i * 0.13, 0.3 + 0.06 * full, z + 0.12 + (i & 1) * 0.12, 0.05, 0.015, mat(cc), { seg: 6 });
}
function strongbox(g, x, z, s = 1, open = false, fill = null) {   // 鉄の帯の金箱（宝箱）
  const w = 0.8 * s, d = 0.55 * s;
  addBox(g, x, 0, z, w, 0.4 * s, d, mat('#6a3a1c'));
  addBox(g, x - 0.02, 0.4 * s, z - 0.02, w + 0.04, 0.16 * s, d + 0.04, mat('#6a3a1c'));
  addBox(g, x + 0.1 * s, 0, z - 0.03, 0.08 * s, 0.56 * s, d + 0.06, mat('#4a4a52'));
  addBox(g, x + w - 0.18 * s, 0, z - 0.03, 0.08 * s, 0.56 * s, d + 0.06, mat('#4a4a52'));
  addBox(g, x + w / 2 - 0.06, 0.28 * s, z + d, 0.12, 0.14, 0.04, mat('#e0b84a'));
  if (open && fill) addBox(g, x + 0.05, 0.4 * s, z + 0.05, w - 0.1, 0.12 * s, d - 0.1, glow(fill, fill, 0.15));
}
function sack(g, x, z, cc, s = 1) {   // 硬貨の袋
  addCyl(g, x, 0, z, 0.2 * s, 0.34 * s, mat('#c8b890'), { r2: 0.15 * s, seg: 7 });
  addCyl(g, x, 0.34 * s, z, 0.06 * s, 0.08 * s, mat('#a89870'), { seg: 5 });
  addCyl(g, x, 0.4 * s, z, 0.09 * s, 0.02, mat('#8a3030'), { seg: 6 });   // ひも
  addCyl(g, x + 0.16 * s, 0, z + 0.1 * s, 0.05, 0.015, mat(cc), { seg: 6 });   // こぼれた硬貨
}
function coinPile(g, x, z, r, cc) {   // 硬貨の山
  addCyl(g, x, 0, z, r, r * 0.5, glow(cc, cc, 0.12), { r2: r * 0.15, seg: 12 });
  for (let i = 0; i < 9; i++) { const a = i * 0.7, rr = r * (0.7 + (i % 3) * 0.18); addCyl(g, x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr, 0.07, 0.02, mat(cc), { seg: 6 }); }
}

function buildMintStock(view, st) {
  const K = view.K, R = K.mintRoom, sim = view.sim;
  const g = new THREE.Group();
  g.position.set(-K.W / 2, 0, -K.D / 2);
  if (!R) return g;
  const cc = coinColor(sim, st.k);
  // 鉱石の山（囲いの中）：数だけ石を積む（最大48）
  const n = Math.min(48, st.ore), ng = Math.min(8, st.gold);
  for (let i = 0; i < n + ng; i++) {
    const gold = i >= n;
    const row = Math.floor(i / 12), col = i % 12;
    const x = 0.3 + (col % 4) * 0.36 + hsh(i, 1) * 0.12, z = R.bz + 0.25 + Math.floor(col / 4) * 0.55 + hsh(i, 2) * 0.15 + (row & 1) * 0.1;
    const s = 0.2 + hsh(i, 3) * 0.1;
    const m = addBox(g, x, row * 0.16, z, s, s * 0.8, s, mat(gold ? '#b8a468' : '#6e6a64'), { ry: hsh(i, 4) * 3 });
    void m;
    addBox(g, x + s * 0.3, row * 0.16 + s * 0.8, z + s * 0.3, s * 0.25, 0.02, s * 0.25, gold ? glow('#f0c840', '#c89020', 0.4) : mat('#dfe4ec'));
  }
  // 炉の中の溶けた銀：るつぼの湯の高さ（在庫があれば明るく）
  if (st.melt > 0) addCyl(g, 1.9, 1.37, 0.85, 0.22, 0.02, glow('#fff0b0', '#ffc060', 1.8), { seg: 8 });
  // 延べ板の山（東の棚の上）：1段4枚、交互に向きを変えて積む（最大32）
  const nb = Math.min(32, st.bars), ngb = Math.min(6, st.gbars);
  for (let i = 0; i < nb + ngb; i++) {
    const gold = i >= nb;
    const layer = Math.floor(i / 4), j = i % 4;
    const alt = layer & 1;
    const y = 0.56 + layer * 0.07;
    if (!alt) addBox(g, K.W - 1.15 + j * 0.24, y, R.rz + 0.35, 0.2, 0.07, 0.6, gold ? glow('#f0c840', '#b08820', 0.25) : mat('#d8dee8'));
    else addBox(g, K.W - 1.15, y, R.rz + 0.2 + j * 0.24, 0.9, 0.07, 0.2, gold ? glow('#f0c840', '#b08820', 0.25) : mat('#c8d0dc'));
  }
  // 硬貨の箱（打ち置き40枚で1箱・最大10）：数える台の脇
  const boxes = Math.min(10, Math.ceil(Math.max(0, st.box) / 40));
  for (let i = 0; i < boxes; i++) {
    const x = R.kx + 2.3 + (i % 2) * 0.55, z = R.kz - 1.2 + Math.floor(i / 2) * 0.45;
    if (x + 0.5 > K.W - 0.1) continue;
    coinBox(g, Math.min(x, K.W - 0.6), z, cc, i === boxes - 1 ? Math.min(1, ((st.box - 1) % 40 + 1) / 40) : 1);
  }
  // 台の上の硬貨（数えている分）
  if (st.box > 0) for (let i = 0; i < Math.min(8, Math.ceil(st.box / 10)); i++) addCyl(g, R.kx + 1.2 + (i % 4) * 0.12, 0.72 + Math.floor(i / 4) * 0.02, R.kz + 0.25 + (i & 1) * 0.1, 0.05, 0.02, mat(cc), { seg: 6 });
  // 国庫へ送る金箱（取り分がたまると増える）
  const chests = st.crown > 0.5 ? (st.crown >= 20 ? 2 : 1) : 0;
  for (let i = 0; i < chests; i++) strongbox(g, 0.45 + i * 0.75, K.D - 1.75, 0.8, i === 0, cc);
  return g;
}

// ================================================================ 王城の宝物庫（国庫の額で増減）
function vaultKingdom(sim, b) {
  const k = sim.S.kingdoms?.[b.kingdom];
  return k && k.capital === b.settlement ? k : sim.S.kingdoms?.find((x) => x.capital === b.settlement) || null;
}
export function vaultPieces(t) {   // 額 → 置く物の数（試験でも使う）
  t = Math.max(0, t || 0);
  return { sacks: t >= 1 ? Math.max(1, Math.min(8, Math.floor(t / 120))) : 0, boxes: Math.min(6, Math.floor(t / 400)), chests: Math.min(3, Math.floor(t / 1200)), pile: t > 1500 ? Math.min(0.75, 0.25 + Math.sqrt((t - 1500) / 8000)) : 0, empty: t < 30 };
}
function buildVault(view, k) {
  const K = view.K, V = K.vault, sim = view.sim;
  const g = new THREE.Group();
  g.position.set(-K.W / 2, 0, -K.D / 2);
  const cc = coinColor(sim, k.id);
  const P = vaultPieces(k.treasury);
  const x0 = V.x + 0.15, z0 = V.z + 0.15, w = V.w - 0.3;
  // 奥の壁ぞい：宝箱 → 硬貨の箱
  let x = x0, z = z0;
  for (let i = 0; i < P.chests; i++) { strongbox(g, x, z, 0.85, i === 0, cc); x += 0.8; if (x + 0.7 > x0 + w) { x = x0; z += 0.6; } }
  if (P.empty) strongbox(g, x0 + 0.2, z0, 0.85, true, '#2a2020');   // 空っぽの金箱
  for (let i = 0; i < P.boxes; i++) { coinBox(g, x, z, cc); x += 0.58; if (x + 0.5 > x0 + w) { x = x0; z += 0.48; } }
  // 手前：硬貨の袋を並べる
  z = Math.max(z + 0.6, z0 + 1.3); x = x0 + 0.2;
  for (let i = 0; i < P.sacks; i++) { sack(g, x, z, cc, 0.9 + (i % 3) * 0.1); x += 0.48; if (x > x0 + w - 0.2) { x = x0 + 0.2; z += 0.5; } }
  // 硬貨の山（国庫が豊かなとき）
  if (P.pile > 0) coinPile(g, x0 + w * 0.45, Math.min(V.z + V.d - 1.3, z + 0.8), P.pile, cc);
  g.userData.count = P.sacks + P.boxes + P.chests + (P.pile ? 1 : 0);
  return g;
}

// ================================================================ 差し込み口
export function mintAttach(view, b) {
  mintDetach(view);
  const st = b.type === 'mint' ? mintStock(view.sim, b.id) : null;
  const vk = b.type === 'castle' && view.K?.vault ? vaultKingdom(view.sim, b) : null;
  if (!st && !vk && b.type !== 'mint') return;
  view._mint = { b, t: 0, key: '', group: null, smoke: [], tex: new Map(), over: new Set(), vk };
  refresh(view);
  if (b.type === 'mint' && view.K.mintRoom) {   // 炉の煙（フードから煙突へ上っていく）
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshLambertMaterial({ color: '#7a7470', transparent: true, opacity: 0.5, depthWrite: false }));
      m.userData.ph = i / 6; view.scene.add(m); view._mint.smoke.push(m);
    }
  }
}
function stockKey(view) {
  const X = view._mint, sim = view.sim;
  if (X.b.type === 'mint') { const st = mintStock(sim, X.b.id); return st ? `${st.ore}|${st.gold}|${st.melt > 0}|${st.bars}|${st.gbars}|${Math.ceil(st.box / 40)}|${Math.ceil(st.box / 10)}|${st.crown > 0.5}|${st.crown >= 20}` : 'none'; }
  if (X.vk) { const P = vaultPieces(X.vk.treasury); return JSON.stringify(P); }
  return '';
}
function refresh(view) {
  const X = view._mint; if (!X || !view.scene) return;
  const key = stockKey(view);
  if (key === X.key && X.group) return;
  X.key = key;
  if (X.group) { view.scene.remove(X.group); X.group.traverse((o) => o.geometry?.dispose()); X.group = null; }
  if (X.b.type === 'mint') { const st = mintStock(view.sim, X.b.id); if (st) X.group = buildMintStock(view, st); }
  else if (X.vk) X.group = buildVault(view, X.vk);
  if (X.group) view.scene.add(X.group);
}
export function mintTick(view, dt, now) {
  const X = view._mint; if (!X || !view.scene) return;
  X.t += dt;
  if (X.t >= 3) { X.t = 0; refresh(view); }
  // 煙
  const K = view.K;
  for (const m of X.smoke) {
    const ph = ((now || 0) * 0.25 + m.userData.ph) % 1;
    m.position.set(1.6 - K.W / 2 + Math.sin(ph * 6 + m.userData.ph * 9) * 0.25, 1.3 + ph * 1.2, 0.8 - K.D / 2 - ph * 0.5);
    m.scale.setScalar(0.6 + ph * 1.4);
    m.material.opacity = 0.45 * (1 - ph);
  }
  // 職人の動き：工程の場所に着いた職人は、工程のドット絵を映す
  if (X.b.type !== 'mint') return;
  const seen = new Set();
  for (const r of view.ents.values()) {
    const e = r.e;
    if (!r.human || !e || r.path.length || !r.slot || e.action?.type !== 'mintwork') continue;
    const anim = STEP_ANIM[e.mintStep] || STEP_ANIM[r.slot.k] || 'work:coins';
    let sh;
    try { sh = drawPersonAnim(e, { age: view.sim.ageOf(e) }, anim); } catch { continue; }
    if (!sh?.canvas) continue;
    const tk = e.id + '|' + anim;
    let tex = X.tex.get(tk);
    if (!tex) {
      tex = new THREE.CanvasTexture(sh.canvas);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / sh.cols, 1 / sh.rows);
      X.tex.set(tk, tex);
    }
    if (!r._mfOrig) r._mfOrig = { w: r.sprite.scale.x, h: r.sprite.scale.y };
    if (r.sprite.material.map !== tex) { r.sprite.material.map = tex; r.sprite.material.needsUpdate = true; }
    const fr = animFrameAt(sh, (now || 0) + (r.phase || 0));
    tex.offset.set(fr / sh.cols, 1 - 1 / sh.rows);   // 工程の絵は正面（行0）で見せる：足もとの金床・水おけ・炉の火も一緒に描かれている
    r.sprite.scale.set(sh.worldW, sh.worldH, 1);
    seen.add(r);
  }
  for (const r of view.ents.values()) if (r._mfOrig && !seen.has(r)) {   // 歩き出した・工程が終わった：歩行の絵に戻す
    r.sprite.material.map = r.sheet.tex; r.sprite.material.needsUpdate = true;
    r.sprite.scale.set(r._mfOrig.w, r._mfOrig.h, 1); r._mfOrig = null;
  }
}
export function mintDetach(view) {
  const X = view._mint; if (!X) return;
  if (view.scene) {
    if (X.group) { view.scene.remove(X.group); X.group.traverse((o) => o.geometry?.dispose()); }
    for (const m of X.smoke) { view.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
  for (const t of X.tex.values()) t.dispose();
  view._mint = null;
}
// 試験用：いま映している在庫の物の数
export function mintShown(view) { let n = 0; view._mint?.group?.traverse((o) => { if (o.isMesh) n++; }); return n; }

// ================================================================ 荷車（地図の上）
function cartBase(g) {
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.58), mat('#8a6a42')); bed.position.y = 0.32; g.add(bed);
  for (const s of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.05), mat('#6a4a2a')); side.position.set(0, 0.46, s * 0.28); g.add(side); }
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), mat('#6a4a2a')); pole.position.set(0.72, 0.3, 0.12); g.add(pole);
  const pole2 = pole.clone(); pole2.position.z = -0.12; g.add(pole2);
  for (const [x, z] of [[-0.18, 0.32], [-0.18, -0.32]]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), mat('#5a3a20')); wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.2, z); g.add(wh);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), mat('#4a4a52')); hub.rotation.x = Math.PI / 2; hub.position.set(x, 0.2, z); g.add(hub);
  }
}
export function mintCartMesh(v) {
  const g = new THREE.Group();
  cartBase(g);
  const load = new THREE.Group(); load.name = 'load'; g.add(load);
  if (v.kind === 'chestcart') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.4), mat('#6a3a1c')); box.position.set(-0.05, 0.54, 0); load.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.43), mat('#6a3a1c')); lid.position.set(-0.05, 0.74, 0); load.add(lid);
    for (const x of [-0.22, 0.12]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.45), mat('#4a4a52')); band.position.set(x, 0.6, 0); load.add(band); }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.1), mat('#e0b84a')); lock.position.set(0.24, 0.6, 0); load.add(lock);
  } else {
    // 鉱石の麻袋2つ・鉱石の木箱1つ・こぼれた石
    for (const [x, z] of [[-0.22, 0.12], [-0.22, -0.13]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 7), mat('#9a8a60')); s.rotation.z = Math.PI / 2; s.position.set(x, 0.53, z); load.add(s); }
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.42), mat('#7a5a32')); crate.position.set(0.18, 0.51, 0); load.add(crate);
    for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), mat(i === 4 && v.gold ? '#c8a848' : '#6e6a64')); r.position.set(0.1 + (i % 3) * 0.08, 0.66, -0.12 + Math.floor(i / 3) * 0.14 + (i % 2) * 0.05); r.rotation.y = i; load.add(r); }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
