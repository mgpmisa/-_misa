// 国ごとの硬貨の見た目（グラフィック部・経済部）
//   1. 硬貨の小さな絵（画面の一覧用）：coinImgHTML(style, 'obv'|'rev', size) … 26×26 のドット絵を data URL の <img> にする
//   2. 両替のしぐさ（人のドット絵）：anim_people.js に仕事の動きを3つ足す
//        'xweigh'：手秤（てばかり）に硬貨を載せて量る　'xbite'：硬貨をかじって確かめる　'xcount'：硬貨を数えて渡す
//      アニメ名は 'work:xweigh:<国id>:<質の段>' の形（硬貨の色が国と質で変わるため）。coinage.js が p.fxAnim に入れる。
//   3. 両替商の館の中（3D）：カウンター・手秤（揺れる竿と皿）・国ごとの色の硬貨の山・開いた金庫・相場の掲示板・
//      両替商と客のドット絵（量る→数えて渡す→かじって確かめる をくり返す）。bldnew.js の NEW_INTERIOR に bank を足す。
//
// ■ 本体からの呼び方
//   ui.js の import の並びに … import './coinagegfx.js';（読み込むだけで、画面の絵・しぐさ・館の内装がつながる）
//   anim_people.js（apply.py）… 外から仕事の動きを足す口 addWorkResolver と、p.fxAnim を見る1行
import * as THREE from 'three';
import * as AP from './anim_people.js';
import * as BN from './bldnew.js';
import { canvasTex } from './textures.js';
import { setCoinGfx, coinStyle } from './coinage.js';
import { exchangeRate } from './bank.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const hex2 = (h) => { const s = String(h || '#b87333').replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
const toHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex2(a).map((v, i) => v + (hex2(b)[i] - v) * t));
const dk = (c, t) => mix(c, '#140a04', t), lt = (c, t) => mix(c, '#fff6e0', t);
const hashS = (s) => { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ================================================================ 1. 硬貨の絵
// 13×13 の図案（1 が浮き彫り）
const GLYPH = {
  lion: ['....11.......', '...1111......', '..11.111.....', '..1111111....', '...11111.1...', '....1111..1..', '....11111.1..', '...111111.1..', '..11.1111.1..', '..1...111....', '.11..11.11...', '.1...1...1...', '11..11..11...'],
  wolf: ['.........1...', '........11...', '.......111...', '.1....1111...', '.11..11111...', '.111111111...', '..11111111...', '...1111111...', '....1111111..', '.....1111.11.', '.....111.....', '....111......', '...111.......'],
  eagle: ['.....111.....', '.....1.1.....', '1....111....1', '11..11111..11', '111.11111.111', '.11111111111.', '..111111111..', '....11111....', '.....111.....', '....11111....', '...11.1.11...', '..1...1...1..', '.............'],
  falcon: ['1...........1', '11.........11', '.11.......11.', '..111...111..', '...1111111...', '....11111....', '.....111.....', '.....111.....', '.....111.....', '......1......', '.....1.1.....', '.............', '.............'],
  mooncrown: ['...1..1..1...', '...1.111.1...', '...1111111...', '...1111111...', '.............', '....11111....', '...11...11...', '..11.....1...', '..1..........', '..11.....1...', '...11...11...', '....11111....', '.............'],
  lily: ['......1......', '.....111.....', '.....111.....', '.1...111...1.', '11..11111..11', '11.1111111.11', '.111.111.111.', '..1..111..1..', '...1111111...', '.....111.....', '....1.1.1....', '...1..1..1...', '.............'],
  sun: ['......1......', '.1....1....1.', '..1..111..1..', '....11111....', '...1111111...', '..111111111..', '11111111111.1', '..111111111..', '...1111111...', '....11111....', '..1..111..1..', '.1....1....1.', '......1......'],
  star: ['......1......', '.....111.....', '.1...111...1.', '..111111111..', '...1111111...', '..111111111..', '1111111111111', '..111111111..', '...1111111...', '..111111111..', '.1...111...1.', '.....111.....', '......1......'],
  tower: ['..1.1.1.1.1..', '..111111111..', '...1111111...', '...1111111...', '...11.1.11...', '...1111111...', '...1111111...', '...11.1.11...', '...1111111...', '...111.111...', '...11...11...', '..111111111..', '.............'],
  palm: ['..111...111..', '.11..1.1..11.', '1....111....1', '....11111....', '...1..1..1...', '..1...1...1..', '......1......', '.....11......', '.....1.......', '.....1.......', '....11.......', '....1........', '..1111111....'],
  wave: ['.............', '...111.......', '..1...1..11..', '.1..1..11..1.', '.1.11......1.', '..1..111111..', '.............', '...111.......', '..1...1..11..', '.1..1..11..1.', '.1.11......1.', '..1..111111..', '.............'],
};
// 王の横顔（左向き）。冠は別に重ねる
const HEAD = ['.............', '.............', '.............', '....111111...', '...11111111..', '..111111111..', '.1111111111..', '..111111111..', '...11111111..', '....111111...', '.....1111....', '....111111...', '..1111111111.'];
const CROWN = { crown: ['....1.1.1....', '....11111....', '....11111....'], laurel: ['...1.1.1.1...', '....11111....', '.............'], tiara: ['.....1.1.....', '....11111....', '.............'] };
const HAIR_LONG = [[5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [7, 11], [8, 11], [9, 11]];
const BEARD = [[8, 3], [8, 4], [9, 4], [9, 5], [8, 2]];
// 裏の小さな図柄（7×3）
const MOTIF = {
  sword: ['1.....1', '.1.1.1.', '..1.1..'], wheat: ['1.1.1.1', '.11111.', '...1...'], hammer: ['111.111', '.1...1.', '.1...1.'],
  snow: ['1.1.1.1', '.1...1.', '1.1.1.1'], dune: ['...1...', '.11111.', '1111111'], gold: ['.1.1.1.', '1.1.1.1', '.1.1.1.'],
  vine: ['1.1.1.1', '.1.1.1.', '1.1.1.1'], ship: ['...1...', '1111111', '.11111.'],
};
const N = 26, C0 = 12.5, R = 12;
function drawCoin(g, st, face, seed) {
  const base = st.color, light = st.light || lt(base, 0.45), dark = st.dark || dk(base, 0.55);
  const worn = clamp((1 - (st.wear ?? 1)) * 6, 0, 0.6);
  const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  // 円盤：左上が明るく、右下が暗い
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - C0, dy = y - C0, d = Math.hypot(dx, dy);
    if (d > R + 0.3) continue;
    const sh = (-dx - dy) / (R * 2.8);
    let c = sh > 0 ? lt(base, sh * 0.6) : dk(base, -sh * 0.7);
    if (d > R - 1.2) c = dk(base, 0.38);                // 縁
    else if (d > R - 2.2) c = lt(base, 0.18);           // 縁の内側の盛り上がり
    px(x, y, c);
  }
  // 縁の刻み
  const e = st.edge?.id;
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2, x = Math.round(C0 + Math.cos(a) * (R - 0.4)), y = Math.round(C0 + Math.sin(a) * (R - 0.4));
    if (e === 'milled' && i % 2 === 0) px(x, y, dk(base, 0.6));
    if (e === 'rope' && i % 4 < 2) px(x, y, i % 4 ? lt(base, 0.35) : dk(base, 0.6));
  }
  if (e === 'beads') for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; px(Math.round(C0 + Math.cos(a) * (R - 3)), Math.round(C0 + Math.sin(a) * (R - 3)), lt(base, 0.4)); }
  // 浮き彫り：影（右下）→ 本体（明るい）。すり減った硬貨は所々が消える
  const rnd = (i) => (hashS(seed + ':' + i) % 1000) / 1000;
  const emboss = (rows, ox, oy, flip = false, col = light) => {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { if (row[flip ? row.length - 1 - i : i] !== '1') continue; if (worn && rnd(i * 31 + j + ox) < worn * 0.5) continue; px(ox + i + 1, oy + j + 1, dark); } });
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { if (row[flip ? row.length - 1 - i : i] !== '1') continue; if (worn && rnd(i * 17 + j * 7 + oy) < worn) continue; px(ox + i, oy + j, col); } });
  };
  if (face === 'obv') {
    emboss(GLYPH[st.emblem?.id] || GLYPH.star, 6, 6);
  } else {
    const P = st.portrait || {}, flip = P.face === 'R';
    emboss(HEAD, 6, 3, flip);
    emboss(CROWN[P.crown] || CROWN.crown, 6, 3, flip, lt(light, 0.25));
    const put = (arr) => { for (const [j, i] of arr) px(6 + (flip ? 12 - i : i), 3 + j, light); };
    if (P.hair || P.sex === 'f') put(HAIR_LONG);
    if (P.beard) for (const [j, i] of BEARD) px(6 + (flip ? 12 - i : i), 3 + j + 5, dk(light, 0.2));
    px(6 + (flip ? 12 - 3 : 3), 3 + 6, dark);           // 目
    emboss(MOTIF[st.reverse?.id] || MOTIF.wheat, 9, 17);
  }
}
const IMG = new Map();
function coinDataURL(st, face) {
  if (typeof document === 'undefined') return null;
  const key = `${st.kid}|${face}|${st.color}|${st.emblem?.id}|${st.reverse?.id}|${st.edge?.id}|${st.portrait?.rname}|${st.portrait?.face}|${Math.round((st.wear ?? 1) * 50)}`;
  let u = IMG.get(key);
  if (u) return u;
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  drawCoin(g, st, face, key);
  u = c.toDataURL();
  IMG.set(key, u); if (IMG.size > 80) IMG.delete(IMG.keys().next().value);
  return u;
}
export function coinCanvas(st, face = 'obv', scale = 4) {
  const c = document.createElement('canvas'); c.width = N * scale; c.height = N * scale;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const s = document.createElement('canvas'); s.width = N; s.height = N;
  drawCoin(s.getContext('2d'), st, face, st.name + face);
  g.drawImage(s, 0, 0, N * scale, N * scale);
  return c;
}
export function coinImgHTML(st, face = 'obv', size = 28) {
  if (st.kid != null) COIN_COL[st.kid] = st.color;   // しぐさの硬貨の色もそろえる
  const u = coinDataURL(st, face); if (!u) return null;
  const d = '';
  return `<img src="${u}" width="${size}" height="${size}" alt="${st.name}" title="${st.name}（${face === 'obv' ? '表' : '裏'}）${d}" style="image-rendering:pixelated;vertical-align:middle;margin-right:2px">`;
}
setCoinGfx({ coinImgHTML });

// ================================================================ 2. 両替のしぐさ（人のドット絵）
// 色：'work:xweigh:<国>:<質の段>' の <国> から、いまの硬貨の色を引く（画面を開くたびに coinStyle で更新）
const COIN_COL = {};
export function setCoinColor(kid, color) { COIN_COL[kid] = color; }
const colOf = (kid) => COIN_COL[kid] || '#c8883a';
const BRASS = '#c8a040', BRASS_D = '#8a6a28';
function addObjs(OBJ) {
  if (!OBJ || OBJ.xcoin) return;
  OBJ.xcoin = (P, x, y, tl) => { const c = tl.c || '#c8883a'; P.px(x, y - 1, c); P.px(x + 1, y - 1, dk(c, 0.3)); P.px(x, y - 2, lt(c, 0.5)); };
  OBJ.xstack = (P, x, y, tl) => { const c = tl.c || '#c8883a', n = tl.n ?? 3; for (let i = 0; i < n; i++) P.rect(x - 1, y - i, 3, 1, i % 2 ? c : dk(c, 0.25)); P.px(x, y - n, lt(c, 0.5)); };
  // 手秤：手で竿の真ん中をつまみ、両端に皿を下げる。ph 0 = 水平・1 = 右（硬貨の皿）が下がる・2 = つり合う寸前
  OBJ.xbalance = (P, x, y, tl, G) => {
    const t = tl.ph === 1 ? 1 : 0, s = G.S ? 3 : 4, c = tl.c || '#c8883a';
    P.px(x, y + 1, BRASS_D);
    for (let i = -s; i <= s; i++) P.px(x + i, y + 2 + (i < 0 ? -t : i > 0 ? t : 0) * (Math.abs(i) >= s - 1 ? 1 : 0), BRASS);
    for (const sd of [-1, 1]) {
      const ex = x + sd * s, ey = y + 2 + sd * t;
      P.px(ex, ey + 1, '#e8e0c8'); P.px(ex, ey + 2, '#e8e0c8');
      P.rect(ex - 1, ey + 3, 3, 1, BRASS_D); P.px(ex, ey + 3, BRASS);
      if (sd > 0 && tl.ph >= 1) P.px(ex, ey + 2, c);           // 量っている硬貨
      if (sd < 0 && tl.ph >= 1) P.px(ex, ey + 2, '#9aa0aa');   // 分銅
    }
  };
}
function motions(K, kid) {
  const { hands4, A, AT, TL, MO } = K;
  const c = colOf(kid);
  return {
    xweigh: hands4((v, k) => {
      const bal = (ph) => TL('xbalance', 0, { h: 'O', c, ph });
      return [
        { O: AT('chest', -1, -1), T: AT('belly', 1, 0), tools: [bal(0), TL('xcoin', 0, { c })], face: { m: 's' } },
        { O: AT('chest', -1, -1), T: AT('chest', 1, -1), tools: [bal(0), TL('xcoin', 0, { c })], headDy: 1 },
        { O: AT('chest', -1, -1), T: AT('chest', 1, 0), tools: [bal(1)], face: MO, headDy: 1 },
        { O: AT('chest', -1, -1), T: AT('belly'), tools: [bal(2)], face: { e: 'c' } },
      ][k];
    }, [320, 300, 460, 420]),
    xbite: hands4((v, k) => [
      { T: AT('chest', 0, 1), O: AT('belly'), tools: TL('xcoin', 0, { c }) },
      { T: AT('mouth', 0, 1, { late: true }), O: AT('belly'), tools: TL('xcoin', 0, { c }), face: MO },
      { T: AT('mouth', 0, 0, { late: true }), O: AT('belly'), tools: TL('xcoin', 0, { c }), face: { e: 'c', m: 's' } },
      { T: AT('chest', 0, 0), O: AT('chest', 0, 1), tools: TL('xcoin', 0, { c }), face: { m: 's' }, fx: [['spark', 'T', 0, -3, '#fff4a0']] },
    ][k], [360, 300, 480, 380]),
    xcount: hands4((v, k) => [
      { O: AT('belly'), T: AT('belly', 0, -1), tools: TL('xstack', 0, { h: 'O', c, n: 4 }), headDy: 1 },
      { O: AT('belly'), T: AT('fwd', 0, 1), tools: [TL('xstack', 0, { h: 'O', c, n: 3 }), TL('xcoin', 0, { c })], headDy: 1, face: MO },
      { O: AT('belly'), T: AT('belly', 0, -1), tools: TL('xstack', 0, { h: 'O', c, n: 3 }), headDy: 1 },
      { O: AT('belly'), T: A(60, 90), tools: [TL('xstack', 0, { h: 'O', c, n: 2 }), TL('xcoin', 0, { c })], face: { m: 's' }, fx: [['coin', 'T', 1, -1]] },
    ][k], [240, 240, 240, 520]),
  };
}
let HOOKED = false;
function hookAnim() {
  if (HOOKED || typeof AP.addWorkResolver !== 'function') return;
  HOOKED = true;
  const K = AP.POSE_KIT; addObjs(K.OBJ);
  const cache = new Map();
  AP.addWorkResolver((m) => {
    const r = /^(xweigh|xbite|xcount)(?::(\d+))?/.exec(m); if (!r) return null;
    const kid = r[2] != null ? +r[2] : -1;
    const key = `${kid}|${colOf(kid)}`;
    let set = cache.get(key); if (!set) { set = motions(K, kid); cache.set(key, set); }
    return set[r[1]];
  });
}
hookAnim();
// 一覧の国の硬貨の色を、しぐさの色に写す（コインの絵を描くときについでに）
function syncColors(sim) { for (const k of sim.S.kingdoms || []) { const st = coinStyle(sim, k.id); COIN_COL[k.id] = st.color; } }

// ================================================================ 3. 両替商の館の中（3D）
const MAT = new Map();
const lam = (color) => { let m = MAT.get(color); if (!m) { m = new THREE.MeshLambertMaterial({ color }); MAT.set(color, m); } return m; };
function faceMat(st, face) {
  const key = `face|${st.kid}|${face}|${st.color}|${st.portrait?.rname}`;
  let m = MAT.get(key);
  if (!m) {
    const t = canvasTex(N, N, (g) => { g.fillStyle = dk(st.color, 0.38); g.fillRect(0, 0, N, N); drawCoin(g, st, face, key); });
    m = new THREE.MeshLambertMaterial({ map: t }); MAT.set(key, m);
  }
  return m;
}
// 相場の掲示板（壁に掛ける板）：国ごとの硬貨の絵と、この国の硬貨に替えたときの枚数
function boardTex(sim, kid) {
  const S = sim.S, ks = S.kingdoms.filter((k) => S.coinage?.k?.[k.id]);
  return canvasTex(96, 48, (g) => {
    g.fillStyle = '#3a2a1c'; g.fillRect(0, 0, 96, 48);
    g.fillStyle = '#5a4028'; g.fillRect(2, 2, 92, 44);
    g.fillStyle = '#e8dcc0'; g.font = '8px sans-serif'; g.textBaseline = 'top';
    ks.forEach((k, i) => {
      const st = coinStyle(sim, k.id), y = 4 + i * 14;
      const s = document.createElement('canvas'); s.width = N; s.height = N; drawCoin(s.getContext('2d'), st, 'obv', 'bd' + k.id);
      g.imageSmoothingEnabled = false; g.drawImage(s, 4, y, 12, 12);
      g.fillStyle = k.id === kid ? '#ffe8a0' : '#e8dcc0';
      g.fillText(`${st.short}  ${k.id === kid ? '—' : exchangeRate(sim, k.id, kid).toFixed(2)}`, 20, y + 2);
    });
  });
}
// 館の中で両替をしてみせる二人（ドット絵）。本物の人の見た目（drawPersonAnim）で、しぐさを順にくり返す
const PIX = 0.0432 * 1.05;
function actor(K, p, sim, x, z, faceDir, plan, spot) {
  const tex = new Map();
  const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.5 });
  const sp = new THREE.Sprite(mat);
  sp.center.set(0.5, 0);
  sp.position.set(x - K.W / 2, 0.01, z - K.D / 2);
  const age = sim.ageOf(p);
  const cam = new THREE.Vector3();
  sp.onBeforeRender = (renderer, scene, camera) => {
    // 本人がこの館の中にいて歩いている間は、二重に見えないように隠す
    const t = performance.now() / 1000;
    const step = plan(t);
    let a = tex.get(step);
    if (!a) {
      let s; try { s = AP.drawPersonAnim(p, { age }, step); } catch { return; }
      const tx = new THREE.CanvasTexture(s.canvas); tx.magFilter = tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; tx.colorSpace = THREE.SRGBColorSpace;
      tx.repeat.set(1 / s.frames, 1 / 4);
      a = { s, tx, t0: t }; tex.set(step, a);
    }
    if (mat.map !== a.tx) { mat.map = a.tx; mat.needsUpdate = true; sp.scale.set(a.s.frameW * PIX, a.s.frameH * PIX, 1); a.t0 = t; }
    // 向き：カメラから見た向きで行を選ぶ（0 正面・1 左・2 右・3 背中）
    camera.getWorldDirection(cam);
    const fx = cam.x, fz = cam.z, l = Math.hypot(fx, fz) || 1;
    const sx = (faceDir[0] * -fz / l + faceDir[1] * fx / l), sf = faceDir[0] * fx / l + faceDir[1] * fz / l;
    const row = Math.abs(sx) > Math.abs(sf) ? (sx > 0 ? 2 : 1) : (sf > 0 ? 3 : 0);
    const f = AP.animFrameAt(a.s, t - a.t0);
    a.tx.offset.set(f / a.s.frames, 1 - (row + 1) / 4);
    if (spot) sp.visible = !(p.inside === spot && p.action?.phase !== 'do');
  };
  K.groups.main.add(sp);
  return sp;
}
function bankInterior(K, ctx, F) {
  const { M, W, D } = K, sim = ctx.sim, b = ctx.b;
  const kid = b.settlement != null ? sim.town(b.settlement)?.kingdom : null;
  const south = kid === 2;
  F.room(K, { floor: south ? M.sandFloor : M.parquet, wall: south ? M.sandstone : M.plaster, trim: M.darkWood, beams: !south, door: Math.floor(W / 2), win: { N: [2, W - 3], W: [3, D - 4], E: [3, D - 4] } });
  if (sim?.S?.coinage) syncColors(sim);
  const cx = W / 2, cz = 3.4;                        // カウンターの前の縁
  // カウンター（前板つき・真鍮の縁）
  K.box(cx - 2.6, 0, cz - 0.9, 5.2, 0.86, 0.9, M.darkWood);
  K.box(cx - 2.7, 0.86, cz - 0.95, 5.4, 0.08, 1.0, M.wood);
  K.box(cx - 2.7, 0.3, cz + 0.02, 5.4, 0.05, 0.03, M.brass);
  K.box(cx - 2.7, 0.7, cz + 0.02, 5.4, 0.05, 0.03, M.brass);
  K.solid(cx - 2.6, cz - 0.9, 5.2, 0.9);
  const top = 0.94;
  // 緑の羅紗（硬貨を数える布）
  K.box(cx - 1.4, top, cz - 0.75, 1.3, 0.01, 0.6, M.carpetGreen);
  // 手秤（台に立てた天秤）：竿と皿は揺れる
  const bx = cx + 0.9, bz = cz - 0.45;
  K.box(bx - 0.14, top, bz - 0.1, 0.28, 0.05, 0.2, M.darkWood);
  K.cyl(bx, top + 0.05, bz, 0.025, 0.46, M.brass, { seg: 6 });
  K.cyl(bx, top + 0.5, bz, 0.04, 0.04, M.gold, { seg: 6 });
  const beam = K.add(new THREE.BoxGeometry(0.64, 0.025, 0.03), M.brass, bx, top + 0.48, bz, { dyn: true });
  const pans = [-1, 1].map((sd) => {
    const g = new THREE.Group();
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.03, 10), M.brass); pan.position.y = -0.2; g.add(pan);
    for (const [ox, oz] of [[-0.06, 0], [0.06, 0], [0, 0.06]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.008), M.white); s.position.set(ox * 0.8, -0.1, oz * 0.8); g.add(s); }
    g.position.set(bx - K.W / 2 + sd * 0.3, top + 0.48, bz - K.D / 2);
    K.groups.main.add(g);
    return { g, sd };
  });
  // 皿に載った硬貨（右）と分銅（左）
  const kc = kid != null ? coinStyle(sim, kid) : null;
  const inPan = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), lam(kc ? kc.color : '#c8883a')); inPan.position.y = -0.17; pans[1].g.add(inPan);
  const wt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.06, 6), M.iron); wt.position.y = -0.16; pans[0].g.add(wt);
  beam.onBeforeRender = () => {
    const t = performance.now() / 1000, cyc = t % 6;
    const a = cyc < 1 ? 0 : 0.22 * Math.exp(-(cyc - 1) * 0.8) * Math.cos((cyc - 1) * 3.2);   // 硬貨を載せると揺れて、やがてつり合う
    beam.rotation.z = -a;
    for (const p of pans) { p.g.position.x = bx - K.W / 2 + p.sd * 0.3 * Math.cos(a); p.g.position.y = top + 0.48 - p.sd * 0.3 * Math.sin(a); }
  };
  // 国ごとの硬貨の山（カウンターの上：国の数だけ、両替の多い硬貨ほど高く積む）
  const ks = (sim.S.kingdoms || []).filter((k) => sim.S.coinage?.k?.[k.id]);
  ks.forEach((k, i) => {
    const st = coinStyle(sim, k.id), c = sim.S.coinage.k[k.id];
    const used = (sim.S.coinage.k[kid]?.log || []).filter((e) => e.from === k.id || e.to === k.id).length;
    const n = 4 + Math.min(10, used + (k.id === kid ? 4 : 0));
    const sx = cx - 2.3 + i * 0.28, sz = cz - 0.3;
    for (let s = 0; s < 2; s++) {                 // 2本ずつ積む
      const h = (n - s * 3) * 0.014; if (h <= 0) continue;
      const side = lam(dk(st.color, 0.15));
      K.add(new THREE.CylinderGeometry(0.075, 0.075, h, 10), [side, faceMat(st, 'obv'), side], sx + s * 0.02, top + h / 2, sz - s * 0.17, { dyn: true });
    }
    void c;
  });
  // 背中の棚：国ごとの硬貨を入れた木の升（色つきの山）と帳簿
  F.shelf(K, 1, 0, 3, 'N', M.books);
  ks.forEach((k, i) => {
    const st = coinStyle(sim, k.id), x = W - 1.2 - i * 0.9, z = 0.55;
    K.box(x - 0.35, 0, z - 0.3, 0.7, 0.35, 0.6, M.wood);
    K.cyl(x, 0.35, z, 0.3, 0.2, lam(st.color), { r2: 0.05, seg: 9 });
    for (let j = 0; j < 4; j++) { const a = j * 1.7 + i; K.cyl(x + Math.cos(a) * 0.36, 0, z + 0.35 + Math.sin(a) * 0.1, 0.06, 0.02, lam(lt(st.color, 0.1)), { seg: 7 }); }
    K.solid(x - 0.35, z - 0.3, 0.7, 0.6);
  });
  // 開いた金庫
  F.chest(K, 1.2, cz - 1.9, { open: true, mat: M.darkWood });
  // 相場の掲示板（北の壁）
  if (typeof document !== 'undefined' && kid != null) {
    const g = new THREE.PlaneGeometry(1.6, 0.8);
    K.add(g, new THREE.MeshLambertMaterial({ map: boardTex(sim, kid) }), cx - 0.2, 1.7, 0.04, { dyn: true, g: 'N' });
  }
  // ろうそくと明かり
  F.candle(K, cx - 1.8, cz - 0.6, top);
  K.light(cx, 2.1, cz - 0.4, '#ffd8a0', 2.4, 7);
  // 待つ客の長椅子
  F.bench(K, 1, D - 3, 2.5); K.slot('seat', 1.6, D - 2.4, { face: [0, -1] }); K.slot('seat', 2.6, D - 2.4, { face: [0, -1] });
  K.slot('wait', cx - 1.4, cz + 1.2, { face: [0, -1] }); K.slot('wait', W - 2, D - 3, { face: [0, -1] });
  K.slot('work', cx - 1.2, cz - 1.5, { face: [0, 1] });
  // 両替をしてみせる二人
  if (!sim?.S?.coinage || kid == null || typeof document === 'undefined') return;
  const B = sim.S.bank?.k?.[kid];
  const alive = (id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null ? q : null; };
  // 館の両替商。両替商がまだいない国では、館を預かる番頭（国の出納役・商人）が台に立つ
  const local = sim.living().filter((q) => q.s === b.settlement && sim.isAdult(q) && q.jail == null).sort((x, y) => x.id - y.id);
  const banker = alive(B?.banker) || local.find((q) => q.job === 'changer') || local.find((q) => q.job === 'treasurer') || local.find((q) => q.job === 'merchant') || local.find((q) => q.job === 'scribe');
  const log = sim.S.coinage.k[kid].log || [];
  const last = log.slice().reverse().find((e) => e.who != null && alive(e.who) && !e.cart);
  const cust = last ? alive(last.who) : sim.living().find((q) => q.s !== b.settlement && sim.isAdult(q) && sim.town(q.s)?.kingdom !== kid && sim.town(q.s)?.kingdom != null);
  const fromK = last ? last.from : cust ? sim.town(cust.s)?.kingdom : kid;
  const qb = (k) => Math.round((sim.S.bank?.k?.[k]?.q ?? 1) * 20);
  // 12秒でひと巡り：量る（客は話す）→ 数えて渡す → 客がかじって確かめる
  const ph = (t) => Math.floor((t % 12) / 4);
  if (banker) actor(K, banker, sim, cx - 0.3, cz - 1.35, [0, 1], (t) => [`work:xweigh:${fromK}:${qb(fromK)}`, `work:xcount:${kid}:${qb(kid)}`, 'talk'][ph(t)], b.id);
  if (cust) actor(K, cust, sim, cx + 0.2, cz + 0.55, [0, -1], (t) => ['talk', 'idle', `work:xbite:${kid}:${qb(kid)}`][ph(t)], null);
}
if (BN.NEW_INTERIOR && !BN.NEW_INTERIOR.bank) BN.NEW_INTERIOR.bank = bankInterior;
export { bankInterior, drawCoin };
