// 動物・魔物のアニメーション（待機・鳴く・攻撃・被ダメージ・瀕死・死亡・食べる・眠る・仕事 など）
//
// drawCreatureAnim(c, def, anim) → { canvas, frameW, frameH, frames, rows:4, fps, loop, durs, anchorY, airborne }
//   行（4）= 向き 0:下(正面) / 1:左 / 2:右 / 3:上(背中)、列 = コマ。
//   durs はコマごとの表示時間（ms）。loop=false のアニメは最後のコマで止める（死亡など）。
//   anchorY：コマの下端から「足元（飛ぶ種は飛行の基準線）」までのピクセル数。sprite.center.y = anchorY / frameH。
//   airborne：true のときだけ、飛ぶ種を空中に浮かせる（地上で眠る・ついばむ時は false）。
// creatureAnimState(sim, c, ctx) → いまの状態に合うアニメ名。
// ANIM_NAMES：用意しているアニメの一覧。
//
// 見た目は js/sprites.js の drawCreature と同じ規則・同じ乱数で描く（同じ id なら同じ色・模様・大きさ）。
// sprites.js は編集しないため、生き物の描画部分をこのファイルに写し、姿勢（Q）を受け取れるようにしてある。
// 姿勢 Q が空のときの 'walk' は、drawCreature の歩行シートと 1 ピクセル単位で一致する（試験で確かめる）。
// 光は画面の左上から。自発光（炎・魔法・光る目）は陰影をつけない。

import { SPECIES } from './data.js';

const PIXEL_SCALE = 0.0432; // 大人の人（足元〜髪の上 約22px）≒ 0.95

// ================================================================ 乱数
function strHash(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
function rngFrom(key) {
  let s = strHash(key);
  const f = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    f,
    range: (a, b) => a + (b - a) * f(),
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    chance: (p) => f() < p,
    pick: (arr) => arr[Math.floor(f() * arr.length)],
    sgn: () => (f() < 0.5 ? -1 : 1),
    wpick: (obj) => {
      let tot = 0; for (const k in obj) tot += obj[k];
      let x = f() * tot;
      for (const k in obj) { x -= obj[k]; if (x <= 0) return k; }
      return Object.keys(obj)[0];
    },
  };
}

// ================================================================ 色
const _hslCache = new Map();
function toHsl(hex) {
  let v = _hslCache.get(hex);
  if (v) return v;
  const n = parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  v = [h, s, l];
  _hslCache.set(hex, v);
  return v;
}
function hsl(h, s, l) {
  h = ((h % 1) + 1) % 1; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const conv = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return '#' + to(conv(h + 1 / 3)) + to(conv(h)) + to(conv(h - 1 / 3));
}
const adj = (hex, dh = 0, ds = 0, dl = 0) => { const [h, s, l] = toHsl(hex); return hsl(h + dh, s + ds, l + dl); };
const lt = (hex, d) => adj(hex, 0, 0, d);
const dk = (hex, d) => adj(hex, 0, 0, -d);
function mix(a, b, t) {
  const A = parseInt(a.slice(1, 7), 16), B = parseInt(b.slice(1, 7), 16);
  const c = (sh) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t).toString(16).padStart(2, '0');
  return '#' + c(16) + c(8) + c(0);
}
const jit = (hex, R, dh, ds, dl) => adj(hex, (R.f() * 2 - 1) * dh, (R.f() * 2 - 1) * ds, (R.f() * 2 - 1) * dl);
const gray = (hex) => { const [, , l] = toHsl(hex); return hsl(0, 0, l); };
// 影色：明度を下げ、彩度を少し上げ、色相を青紫へ寄せる（金・肌色系は暖色のまま）
const _shCache = new Map();
function shadow(hex, k = 1) {
  const key = hex + k; let v = _shCache.get(key); if (v) return v;
  v = shadow0(hex, k); _shCache.set(key, v); return v;
}
function shadow0(hex, k) {
  const [h, s, l] = toHsl(hex);
  const warm = h > 0.03 && h < 0.17 && s > 0.3;
  const toward = warm ? 0.03 : 0.7;
  let dh = (toward - h); if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
  return hsl(h + dh * 0.06 * k, s + 0.05 * k, l - 0.085 * k);
}
// 近い色どうしを見分けられるように明度を離す（肌と服・髪が同化しないように）
function sep(c, ref, min = 0.13) {
  const a = toHsl(c), b = toHsl(ref);
  let dh = Math.abs(a[0] - b[0]); if (dh > 0.5) dh = 1 - dh;
  const close = dh < 0.09 || a[1] < 0.18 || b[1] < 0.18;
  if (!close || Math.abs(a[2] - b[2]) >= min) return c;
  let l = a[2] >= b[2] ? b[2] + min + 0.02 : b[2] - min - 0.02;
  if (l > 0.9 || l < 0.08) l = a[2] >= b[2] ? b[2] - min - 0.02 : b[2] + min + 0.02;
  return hsl(a[0], a[1], l);
}
const _hiCache = new Map();
function highlight(hex, k = 1) { const key = hex + k; let v = _hiCache.get(key); if (v) return v; const [h, s, l] = toHsl(hex); v = hsl(h, s - 0.02 * k, l + 0.07 * k); _hiCache.set(key, v); return v; }
const _olCache = new Map();
function olColor(n) { let v = _olCache.get(n); if (v) return v; const [h, s, l] = toHsl(n); v = hsl(h, Math.min(0.5, s * 0.7), Math.min(l * 0.28, 0.12) + 0.02); _olCache.set(n, v); return v; }

// ================================================================ ピクセル画布
// ox, oy は描画座標のずらし（設計座標で描いて、下書き画布の中に置くため）
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); this.ox = 0; this.oy = 0; this.x0 = w; this.y0 = h; this.x1 = -1; this.y1 = -1; }
  // 描いた範囲（陰影・輪郭の処理をこの範囲に絞って速くする。結果は全体を回すのと同じ）
  grow(x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; }
  fit() { const b = this.bbox(); if (b) { [this.x0, this.y0, this.x1, this.y1] = b; } else { this.x0 = this.w; this.y0 = this.h; this.x1 = -1; this.y1 = -1; } }
  raw(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null; }
  px(x, y, c) { x = Math.round(x) + this.ox; y = Math.round(y) + this.oy; if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) { this.d[y * this.w + x] = c; if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; } }
  get(x, y) { return this.raw(Math.round(x) + this.ox, Math.round(y) + this.oy); }
  clr(x, y) { x = Math.round(x) + this.ox; y = Math.round(y) + this.oy; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = null; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  clrRect(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.clr(x + i, y + j); }
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  over(x, y, c) { if (this.get(x, y)) this.px(x, y, c); }
  overRect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.over(x + i, y + j, c); }
  // 左上からの光：上の縁を明るく、右と下の縁を影色に、右下の角はさらに一段
  shade(hi = 1, lo = 1) {
    const out = this.d.slice();
    if (this.x1 < 0) return;
    for (let y = this.y0; y <= this.y1; y++) for (let x = this.x0; x <= this.x1; x++) {
      const c = this.raw(x, y); if (!c) continue;
      const b = !this.raw(x, y + 1), r = !this.raw(x + 1, y), t = !this.raw(x, y - 1);
      if (b && r) out[y * this.w + x] = shadow(c, 2 * lo);
      else if (b || r) out[y * this.w + x] = shadow(c, lo);
      else if (t) out[y * this.w + x] = highlight(c, hi);
    }
    this.d = out;
  }
  // 1ピクセルの輪郭（接している色をぐっと暗くした色。純黒は使わない）
  outline() {
    const out = this.d.slice();
    if (this.x1 < 0) return;
    const X0 = Math.max(0, this.x0 - 1), X1 = Math.min(this.w - 1, this.x1 + 1), Y0 = Math.max(0, this.y0 - 1), Y1 = Math.min(this.h - 1, this.y1 + 1);
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      if (this.raw(x, y)) continue;
      const n = this.raw(x, y + 1) || this.raw(x, y - 1) || this.raw(x - 1, y) || this.raw(x + 1, y);
      if (n) out[y * this.w + x] = olColor(n);
    }
    this.d = out;
    this.x0 = X0; this.x1 = X1; this.y0 = Y0; this.y1 = Y1;
  }
  mapColors(fn) { for (let i = 0; i < this.d.length; i++) if (this.d[i]) this.d[i] = fn(this.d[i]); }
  flipX() { const o = new Array(this.d.length); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o[y * this.w + x] = this.d[y * this.w + this.w - 1 - x]; this.d = o; const a = this.x0; this.x0 = this.w - 1 - this.x1; this.x1 = this.w - 1 - a; }
  clone() { const Q2 = new Pix(this.w, this.h); Q2.d = this.d.slice(); Q2.x0 = this.x0; Q2.y0 = this.y0; Q2.x1 = this.x1; Q2.y1 = this.y1; return Q2; }
  bbox() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    if (this.x1 < 0) return null;
    for (let y = this.y0; y <= this.y1; y++) for (let x = this.x0; x <= this.x1; x++) if (this.d[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
  blit(src, sx, sy, w, h, dx, dy) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src.raw(sx + x, sy + y);
      if (c && dx + x >= 0 && dx + x < this.w && dy + y >= 0 && dy + y < this.h) { this.d[(dy + y) * this.w + dx + x] = c; this.grow(dx + x, dy + y); }
    }
  }
  toCanvas(extra = {}) {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const g = cv.getContext('2d');
    const img = g.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i]; if (!c) continue;
      const n = parseInt(c.slice(1, 7), 16);
      img.data[i * 4] = (n >> 16) & 255; img.data[i * 4 + 1] = (n >> 8) & 255; img.data[i * 4 + 2] = n & 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    cv.userData = { w: this.w, h: this.h, scale: PIXEL_SCALE, ...extra };
    return cv;
  }
}

// 横倒し（死体）：時計回りに90度
function rotated(P) {
  const Q = new Pix(P.h, P.w);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) Q.d[x * Q.w + (P.h - 1 - y)] = P.d[y * P.w + x];
  Q.x0 = 0; Q.y0 = 0; Q.x1 = Q.w - 1; Q.y1 = Q.h - 1; Q.fit();
  return Q;
}
function trimPix(P, pad = 0) {
  const b = P.bbox(); if (!b) return new Pix(2, 2);
  const Q = new Pix(b[2] - b[0] + 1 + pad * 2, b[3] - b[1] + 1 + pad * 2);
  Q.blit(P, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1, pad, pad);
  return Q;
}

// ================================================================ 歩行シートの組み立て
// frame(view, f) は下書き画布（Pix）を返す。view は 'F'(正面) 'B'(背中) 'S'(横)。
// 横は opt.side の向き（'left' か 'right'）で描き、反対の向きは左右反転で作る。
// 下書き画布の横中央が体の中心線。全コマを同じ枠で切るので、向きを変えても足元の位置がずれない。
function buildSheet(frame, opt) {
  const views = ['F', 'S', 'S', 'B'];
  const frames = [[], [], [], []];
  for (const dir of [0, 1, 3]) for (let f = 0; f < 3; f++) { const P = frame(views[dir], f); P.outline(); frames[dir].push(P); }
  for (let f = 0; f < 3; f++) { const P = frames[1][f].clone(); P.flipX(); frames[2].push(P); }
  if (opt.side === 'right') { const t = frames[1]; frames[1] = frames[2]; frames[2] = t; }
  const W = frames[0][0].w, H = frames[0][0].h, mid = W / 2;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (const row of frames) for (const P of row) { const b = P.bbox(); if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  const half = Math.ceil(Math.max(mid - x0, x1 + 1 - mid));
  const fx = Math.floor(mid - half), fw = half * 2;
  const fy = y0;
  const fh = opt.grounded ? opt.ground - fy + 1 : y1 - y0 + 1; // 接地行より下（足裏の輪郭）は切り捨てる
  const kindInfo = { kind: opt.kind };
  if (opt.dead) {
    // 倒れた姿：正面の直立を横倒しにして全コマに置く
    const src = new Pix(fw, fh); src.blit(frames[0][1], fx, fy, fw, fh, 0, 0);
    src.mapColors((c) => mix(gray(c), '#6a6a78', 0.3));
    const D = trimPix(rotated(src));
    const DS = new Pix(D.w * 3, D.h * 4);
    for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 3; f++) DS.blit(D, 0, 0, D.w, D.h, f * D.w, dir * D.h);
    return DS.toCanvas({ frameW: D.w, frameH: D.h, cols: 3, rows: 4, worldH: D.h * PIXEL_SCALE, worldW: D.w * PIXEL_SCALE, anchor: 'bottom', grounded: true, dead: true, ...kindInfo });
  }
  const S = new Pix(fw * 3, fh * 4);
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 3; f++) S.blit(frames[dir][f], fx, fy, fw, fh, f * fw, dir * fh);
  return S.toCanvas({ frameW: fw, frameH: fh, cols: 3, rows: 4, worldH: fh * PIXEL_SCALE, worldW: fw * PIXEL_SCALE, anchor: 'bottom', grounded: !!opt.grounded, flying: !!opt.flying, ...kindInfo });
}
const GOLD = '#e8c040', GOLD_D = '#b08a20';

// ================================================================ 生き物
// Q：いま描いているコマの姿勢（空なら歩行シートと同じ絵）。A：描きながら記録する目印（口・頭・手・胴など、下書き座標）
let Q = {};
let A = {};
// 下書き画布：幅120・高さ100、中心線 x=60、接地行 y=94
const SW = 120, SH = 100, CX = 60, GROUND = 94;

function rrect(P, x, y, w, h, r, c) {
  const ins = [[], [1], [2, 1], [3, 1, 1], [4, 2, 1, 1]][Math.max(0, Math.min(r, 4))];
  for (let j = 0; j < h; j++) {
    let i = 0;
    if (j < ins.length) i = ins[j];
    if (h - 1 - j < ins.length) i = Math.max(i, ins[h - 1 - j]);
    P.rect(x + i, y + j, w - i * 2, 1, c);
  }
}
function thick(P, x0, y0, x1, y1, r, c) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i++) { const t = i / n; P.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, c); }
}
function blotch(P, cx, cy, rx, ry, from, to) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1 && P.get(x, y) === from) P.px(x, y, to);
  }
}
// 傷あと（体の上に2〜3pxの明るい斜線。位置は正規化座標で渡す）
function scarsAt(P, list, box) {
  for (const [u, v, dir] of list) {
    const x = Math.round(box[0] + u * (box[2] - box[0] - 3)), y = Math.round(box[1] + v * (box[3] - box[1] - 3));
    for (let i = 0; i < 3; i++) { const yy = y + (dir > 0 ? i : 2 - i); const c = P.get(x + i, yy); if (c) P.px(x + i, yy, mix(c, '#f4d0c8', 0.55)); }
  }
}
const EYE_ANIMAL = ['#1a1410', '#2a1e14', '#3a2616'];

// ---------------------------------------------------------------- 四つ足
// o: 寸法と色。feat: 個体の特徴（向きごとに描き分ける）
// 横は右向き。正面・背中は体を前後から見た形
function quad(P, o, view, fr) {
  const G = GROUND;
  if (!o.role && CUR_ROLE) o = { ...o, role: CUR_ROLE };
  if (o.role === 'young') { o = { ...o, L: Math.max(4, o.L - 3), BH: Math.max(3, o.BH - 1), legH: Math.max(1, o.legH - 1), neckUp: Math.max(0, (o.neckUp || 0) - 1) }; }
  if (o.role === 'leader') { o = { ...o, L: o.L + 2, BH: o.BH + 1 }; }
  const L = o.L, BH = o.BH, legH0 = o.legH, lw = o.legW || 1;
  // 姿勢：lie=1 伏せ（脚をたたむ）、lie=2 横倒し（脚を投げ出す）。fold は脚を曲げて胴を下げる割合
  const lie = Q.lie || 0;
  const legH = lie ? 0 : Q.fold ? Math.max(1, Math.round(legH0 * (1 - Q.fold))) : legH0;
  const yb = G - legH, bt = yb - BH + 1;
  const col = o.col, legCol = o.legCol || col, hoof = o.hoof || dk(legCol, 0.25);
  const farC = shadow(legCol, 1.4);
  const hw = o.headW, hh = o.headH;
  const g = { view, G, yb, bt, BH, L, lw, legH };
  const step = Q.step ?? (fr === 0 ? 1 : fr === 2 ? -1 : 0);
  const nodY = Q.nod ?? (fr !== 1 && o.nod ? 1 : 0);
  const jaw = o.snoutCol || o.headCol || col, mouthC = '#3a1418';
  // 頭を地面へ下ろす（草を食む・水を飲む・倒れる）。hg=0..1
  const headAt = (hy0, hhh) => { let hy = hy0 + (Q.hdy || 0); if (Q.hg) hy = Math.round(hy + (G - hhh + 1 - (lie ? 0 : 0) - hy) * Q.hg); return hy; };
  if (view === 'S') {
    const x0 = CX - Math.floor(L / 2);
    const backX = x0 + (o.backIn ?? 1), frontX = x0 + L - lw - (o.frontIn ?? 1) - lw;
    const leg = (x, c, near, off, hind) => {
      const rows = G - yb + 1;
      for (let r = 0; r < rows; r++) {
        const sh = Math.round(off * (r + 1) / rows);
        let kink = 0;
        if (legH >= 5 && r === Math.floor(rows * 0.55)) kink = hind ? -1 : 0; // 飛節（後ろ向きの頂点）
        P.rect(x + sh + kink, yb - 1 + r, lw, 1, c);
      }
      const fx = x + off;
      if (o.hoofRows !== 0) P.rect(fx, G, lw, 1, near ? hoof : dk(hoof, 0.08));
      if (o.socks && near && o.socks.includes(hind ? 0 : 1)) P.rect(fx, G - Math.max(1, Math.floor(legH / 2)) + 1, lw, Math.max(1, Math.floor(legH / 2)), o.sockCol || '#f4f2ea');
    };
    // 伏せ・横倒しの脚（地面に沿って前後へ）
    const lieLeg = (near) => {
      const c = near ? legCol : farC, y = near ? G : G - 1, dx = near ? 0 : 1, len = Math.max(2, legH0 - (lie === 1 ? 1 : 0));
      if (lie === 1) { P.rect(x0 + L - 3 + dx, y, Math.max(2, Math.ceil(len * 0.6)), 1, c); P.rect(x0 - 1 + dx, y, 3, 1, c); if (o.hoofRows !== 0 && near) P.px(x0 + L - 3 + Math.max(2, Math.ceil(len * 0.6)), y, hoof); return; }
      P.rect(x0 + L - 2 + dx, y, len, 1, c); P.rect(x0 + 2 - len + dx, y, len, 1, c);
      if (o.hoofRows !== 0) { P.px(x0 + L - 2 + len + dx, y, near ? hoof : dk(hoof, 0.08)); P.px(x0 + 1 - len + dx, y, near ? hoof : dk(hoof, 0.08)); }
    };
    const sa = Math.min(2, Math.max(1, Math.floor(legH / 3))) * (Q.stride || 1);
    const lg = Q.legs || [step * sa, -step * sa, -step * sa, step * sa]; // 手前の前・手前の後ろ・奥の前・奥の後ろ
    if (lie) lieLeg(false);
    else { leg(backX + lw, farC, false, lg[3], true); leg(frontX + lw, farC, false, lg[2], false); }
    const tx = x0, ty = bt + 1, tc = o.tailCol || col, tl = o.tailLen || 0;
    const sw = Q.tail ?? (fr === 1 ? 0 : fr === 0 ? 1 : -1); // 尾の揺れ
    const flatTail = lie && !['short', 'up', 'cotton', 'curly', 'squirrel'].includes(o.tail);
    if (flatTail) { P.line(tx - 1, ty + 1, tx - 4 - tl, G, tc); P.line(tx - 4 - tl, G, tx - 6 - tl - (o.tail === 'horse' || o.tail === 'long' ? 2 : 0), G, tc); } // 寝そべると尾は地面へ
    else switch (o.tail) {
      case 'thin': P.line(tx, ty, tx - 2, ty + 3 + sw, tc); break;
      case 'short': P.rect(tx - 1, ty - 1, 1, 2, tc); break;
      case 'up': P.rect(tx - 1, ty - 2, 1, 2, tc); break;
      case 'tuft': { const ey = lie ? Math.max(ty + 1, G - 4 + tl) : G - 4 + tl; P.line(tx - 1, ty, tx - 1 - (sw > 0 ? 1 : 0), ey, tc); P.rect(tx - 2 - (sw > 0 ? 1 : 0), ey, 2, 2, o.tuftCol || dk(tc, 0.3)); break; }
      case 'horse': thick(P, tx - 1, ty, tx - 3 - (sw > 0 ? 1 : 0), ty + 5 + tl, 1.1, tc); P.px(tx - 2, ty - 1, tc); break;
      case 'bushy': thick(P, tx - 1, ty + 1, tx - 4 - tl, ty + 1 + sw, 1.3, tc); if (o.tailTip) P.ell(tx - 4.5 - tl, ty + 1.5 + sw, 1.3, 1.3, o.tailTip); break; // 狼の尾は水平
      case 'curly': P.px(tx - 1, ty, tc); P.px(tx - 2, ty - 1, tc); P.px(tx - 3, ty, tc); P.px(tx - 2, ty + 1, tc); break;
      case 'cotton': P.ell(tx - 0.5, ty + 1, 1.6, 1.6, o.tailCol || '#f8f8f8'); break;
      case 'cat': P.line(tx - 1, ty, tx - 3, ty - 2, tc); P.line(tx - 3, ty - 2, tx - 3 + sw, ty - 5, tc); break;
      case 'rat': P.line(tx - 1, ty + 1, tx - 5, ty + 2, tc); P.line(tx - 5, ty + 2, tx - 7, ty + 1 + sw, tc); break;
      case 'long': P.line(tx - 1, ty, tx - 4, ty + 3, tc); P.line(tx - 4, ty + 3, tx - 6 - tl, ty - 1 + sw, tc); P.line(tx - 1, ty + 1, tx - 4, ty + 4, tc); break;
      case 'squirrel': thick(P, tx - 2, ty + 2, tx - 3 - (sw > 0 ? 1 : 0), ty - 4 - tl, 2, tc); P.ell(tx - 1.5 - (sw > 0 ? 1 : 0), ty - 5 - tl, 2, 1.6, tc); break;
    }
    rrect(P, x0, bt, L, BH, o.round ?? 2, col);
    if (o.hump) for (const hx of o.hump) P.ell(x0 + hx, bt - 1, 2.5, 2.5, col);
    if (o.shoulder) P.ell(x0 + L - 5, bt + 1, 4, 3, col);
    if (o.belly) { for (let x = x0 + 2; x < x0 + L - 2; x++) P.over(x, yb, o.belly); if (BH > 5) for (let x = x0 + 3; x < x0 + L - 3; x++) P.over(x, yb - 1, o.belly); }
    const hx = x0 + L - (o.headBack ?? 2) + (o.neckFwd || 0) + (Q.hdx || 0) + (Q.hg ? Math.round(Q.hg * (lie ? 3 : 2)) : 0);
    const hy0 = bt - (o.neckUp || 0) - hh + 1 + (o.headDrop || 0) + nodY;
    const hy = headAt(hy0, hh + (o.snoutDrop || 0));
    if (o.neckUp > 0 || o.neck) { const nw = (o.neckW || 3) / 2; thick(P, x0 + L - nw - 1.5, bt + nw, hx + nw + 0.2, hy + hh - nw - 0.3, nw, o.neckCol || col); }
    else if (hy - hy0 > 1 || hx - (x0 + L - (o.headBack ?? 2)) > 1) thick(P, x0 + L - 2, bt + 1.5, hx + 1, hy + 1.5, Math.min(1.5, (hh - 1) / 2), col); // 首の無い種は胴から頭へつなぐ
    rrect(P, hx, hy, hw, hh, o.headRound ?? 1, o.headCol || col);
    const sl = o.snoutL || 0, sh = o.snoutH || 2, sy = hy + hh - sh + (o.snoutDrop || 0);
    if (sl) { P.rect(hx + hw, sy, sl, sh, o.snoutCol || o.headCol || col); if (sh > 1 && !o.squareSnout) P.clr(hx + hw + sl - 1, sy + sh - 1); }
    if (Q.mouth) { if (sl) { P.rect(hx + hw, sy + sh - 1, sl, 1, mouthC); P.rect(hx + hw, sy + sh, Math.max(1, sl - 1), 1, jaw); } else { P.px(hx + hw - 1, hy + hh - 1, mouthC); P.px(hx + hw - 1, hy + hh, jaw); } }
    const ec = o.earCol || o.headCol || col, ex = hx + (o.earX ?? 1), torn = o.tornEar;
    if (!Q.earsBack) switch (o.ear) {
      case 'point': P.rect(ex, hy - 1, 2, 1, ec); if (!torn) P.px(ex, hy - 2, ec); if (o.bigEar) { P.px(ex, hy - 3, ec); P.px(ex + 1, hy - 2, ec); } if (o.earIn) P.px(ex + 1, hy - 1, o.earIn); break;
      case 'round': P.rect(ex, hy - 1, 2, 1, ec); if (!torn) P.px(ex, hy - 2, ec); break;
      case 'side': P.px(hx - 1, hy + 1, ec); if (!torn) P.px(hx - 2, hy + 1, ec); break;
      case 'floppy': P.px(ex, hy - 1, ec); P.px(ex - 1, hy, ec); if (!torn) P.px(ex - 1, hy + 1, ec); break;
      case 'long': { const el = o.earLen || 4, fl = o.earFlop ? 2 : 0; P.rect(ex, hy - el, 1, el, ec); P.rect(ex + 1, hy - el + fl, 1, el - fl, ec); if (o.earIn) P.rect(ex + 1, hy - el + 1 + fl, 1, Math.max(1, el - 2 - fl), o.earIn); if (fl) { P.px(ex - 1, hy - el + 1, ec); P.px(ex - 2, hy - el + 2, ec); } break; }
      case 'tuft': P.rect(ex, hy - 2, 1, 2, ec); P.px(ex, hy - 3, dk(ec, 0.3)); break;
    }
    else { P.rect(hx - 1, hy, 2, 1, ec); } // 耳を伏せる（威嚇・横倒し）
    Object.assign(g, { x0, hx, hy, hw, hh, sl, sh, sy, box: [x0, bt, x0 + L - 1, yb], bodyBox: [x0, bt, L, BH],
      near: () => { if (lie) lieLeg(true); else { leg(backX, legCol, true, lg[1], true); leg(frontX, legCol, true, lg[0], false); } } });
    A.mouth = [hx + hw + sl - 1, sy + sh - 1]; A.head = [hx, hy, hw, hh]; A.body = [x0, bt, L, BH]; A.top = hy - 2; A.tail = [x0 - 1, bt + 1]; A.front = hx + hw + sl; A.back = x0;
    return g;
  }
  // 正面・背中
  const B = view === 'B';
  const Wg = o.girth || Math.max(6, Math.round(BH * 1.25) + (lw > 1 ? 3 : 2)) + (o.girthAdd || 0);
  const x0 = CX - Math.floor(Wg / 2);
  const hwF = Math.min(Math.max(hw, hh + 1) + (o.headWAdd || 0), Wg + 4), hhF = hh + (o.snoutL > 1 && !B ? 1 : 0);
  const hx = CX - Math.floor(hwF / 2) + (Q.hdx || 0);
  const hy = headAt(bt - (o.neckUp || 0) - hh + 1 + (o.headDrop || 0) + nodY, hhF);
  const legsAt = (xs, c, liftIdx) => xs.forEach((x, i) => {
    const up = liftIdx === i ? 1 : 0;
    P.rect(x, yb - 1, lw, G - yb + 1 - up, c);
    if (o.hoofRows !== 0) P.rect(x, G - up, lw, 1, i < 2 ? hoof : dk(hoof, 0.1));
    if (o.socks && o.socks.includes(B ? 0 : 1)) P.rect(x, G - Math.max(1, Math.floor(legH / 2)) + 1 - up, lw, Math.max(1, Math.floor(legH / 2)), o.sockCol || '#f4f2ea');
  });
  const outer = [x0 + (o.legIn ?? 1), x0 + Wg - lw - (o.legIn ?? 1)];
  const inner = [CX - lw - 1, CX + 1];
  const liftOuter = step === 0 ? -1 : step === 1 ? 0 : 1;
  const splay = (c) => { if (lie !== 2) return; const len = Math.max(2, legH0); P.rect(x0 - len + 1, G - 1, len, 1, c); P.rect(x0 + Wg - 1, G - 1, len, 1, c); };
  const legsIn = (c, li) => { if (!lie) legsAt(inner, c, li); };
  const legsOut = (c, li) => { if (!lie) legsAt(outer, c, li); else splay(c); };
  const ec = o.earCol || o.headCol || col, torn = o.tornEar;
  const ears = () => {
    const L0 = hx, R0 = hx + hwF - 1;
    if (Q.earsBack) { P.px(L0 - 1, hy + 1, ec); P.px(R0 + 1, hy + 1, ec); return; }
    switch (o.ear) {
      case 'point': for (const [x, s] of [[L0, 1], [R0, -1]]) { P.px(x, hy - 1, ec); P.px(x + s, hy - 1, ec); if (!(torn && s < 0)) P.px(x, hy - 2, ec); if (o.bigEar) P.px(x, hy - 3, ec); if (o.earIn && !B) P.px(x + s, hy - 1, o.earIn); } break;
      case 'round': P.rect(L0, hy - 1, 2, 1, ec); P.rect(R0 - 1, hy - 1, 2, 1, ec); P.px(L0, hy - 2, ec); if (!torn) P.px(R0, hy - 2, ec); break;
      case 'side': P.rect(L0 - 2, hy + 1, 2, 1, ec); P.rect(R0 + 1, hy + 1, torn ? 1 : 2, 1, ec); break;
      case 'floppy': P.rect(L0 - 1, hy, 1, 2, ec); P.rect(R0 + 1, hy, 1, 2, ec); P.px(L0 - 1, hy + 2, ec); if (!torn) P.px(R0 + 1, hy + 2, ec); break;
      case 'long': { const el = o.earLen || 4; P.rect(L0 + 1, hy - el, 1, el, ec); P.rect(L0, hy - el + 1, 1, el - 1, ec); P.rect(R0 - 1, hy - el + (o.earFlop ? 2 : 0), 1, el - (o.earFlop ? 2 : 0), ec); P.rect(R0, hy - el + 1 + (o.earFlop ? 2 : 0), 1, el - 1 - (o.earFlop ? 2 : 0), ec); if (o.earFlop) P.rect(R0 + 1, hy - el + 2, 2, 1, ec); if (o.earIn && !B) { P.rect(L0 + 1, hy - el + 1, 1, el - 2, o.earIn); } break; }
      case 'tuft': P.rect(L0, hy - 2, 1, 2, ec); P.rect(R0, hy - 2, 1, 2, ec); P.px(L0, hy - 3, dk(ec, 0.3)); P.px(R0, hy - 3, dk(ec, 0.3)); break;
    }
  };
  const tail = () => {
    const tc = o.tailCol || col, ty = bt + 1, tl = o.tailLen || 0, sw = Q.tail ?? (fr === 1 ? 0 : fr === 0 ? 1 : -1);
    if (lie && !['short', 'up', 'cotton', 'curly', 'squirrel'].includes(o.tail)) { P.line(CX, ty, CX + 3, G, tc); P.px(CX + 4, G, tc); return; }
    switch (o.tail) {
      case 'thin': P.line(CX, ty, CX + sw, ty + 4, tc); break;
      case 'short': case 'up': P.rect(CX - 1, bt - 1, 2, 2, tc); break;
      case 'tuft': P.rect(CX, ty, 1, lie ? Math.max(1, G - 4 + tl - ty) : G - 4 + tl - ty, tc); P.rect(CX - 1 + sw, lie ? Math.max(ty + 1, G - 4 + tl) : G - 4 + tl, 2, 2, o.tuftCol || dk(tc, 0.3)); break;
      case 'horse': thick(P, CX - 0.5, ty, CX - 0.5 + sw, ty + 6 + tl, 1.2, tc); break;
      case 'bushy': thick(P, CX - 0.5, ty, CX - 0.5 + sw, ty + 3, 1.6, tc); if (o.tailTip) P.ell(CX - 0.5 + sw, ty + 4, 1.4, 1.2, o.tailTip); break;
      case 'curly': P.rect(CX - 1, ty, 2, 1, tc); P.px(CX, ty - 1, tc); break;
      case 'cotton': P.ell(CX, ty + 1, 1.8, 1.6, o.tailCol || '#f8f8f8'); break;
      case 'cat': P.rect(CX, bt - 4, 1, 5, tc); P.px(CX + 1 + sw, bt - 5, tc); break;
      case 'rat': P.line(CX, ty + 2, CX + 2 * sw, G, tc); break;
      case 'long': P.line(CX, ty, CX + 2 * sw, ty + 5, tc); P.line(CX + 2 * sw, ty + 5, CX + 3 * sw + 1, ty + 1, tc); break;
      case 'squirrel': thick(P, CX - 0.5, ty + 1, CX - 0.5 + sw, ty - 5 - tl, 2, tc); break;
    }
  };
  if (!B) {
    if (o.tail === 'squirrel') { const tc = o.tailCol || col; P.ell(CX + 2, bt - 2 - (o.tailLen || 0), 3, 4, tc); } // 大きな尾が後ろから覗く
    legsIn(farC, liftOuter === 0 ? 1 : liftOuter === 1 ? 0 : -1);
    rrect(P, x0, bt, Wg, BH, o.round ?? 2, col);
    if (o.hump) P.ell(CX, bt - 1, 2.5, 2.5, col);
    if (o.belly) for (let y = bt + Math.floor(BH / 2); y <= yb; y++) P.overRect(CX - 2, y, 4, 1, o.belly);
    legsOut(legCol, liftOuter);
    if (o.neckUp > 0 || o.neck) P.rect(CX - Math.ceil((o.neckW || 3) / 2) + (Q.hdx || 0), hy + hh - 1, o.neckW || 3, bt - hy - hh + 3, o.neckCol || col);
    rrect(P, hx, hy, hwF, hhF, o.headRound ?? 1, o.headCol || col);
    ears();
    const sl = o.snoutL || 0;
    if (sl) { const mw = Math.min(hwF - 2, o.muzzleW || (sl >= 2 ? 4 : 2)); P.rect(CX - mw / 2 + (Q.hdx || 0), hy + hhF - (o.snoutH || 2), mw, o.snoutH || 2, o.snoutCol || o.headCol || col); }
    if (Q.mouth) { P.rect(CX - 1 + (Q.hdx || 0), hy + hhF - 1, 2, 1, mouthC); P.rect(CX - 1 + (Q.hdx || 0), hy + hhF, 2, 1, jaw); }
  } else {
    rrect(P, hx, hy, hwF, hh, o.headRound ?? 1, dk(o.headCol || col, 0.04)); ears();
    if (o.neckUp > 0 || o.neck) P.rect(CX - Math.ceil((o.neckW || 3) / 2) + (Q.hdx || 0), hy + hh - 1, o.neckW || 3, bt - hy - hh + 3, o.neckCol || col);
    legsIn(farC, liftOuter === 0 ? 1 : liftOuter === 1 ? 0 : -1);
    rrect(P, x0, bt, Wg, BH, o.round ?? 2, col);
    if (o.hump) P.ell(CX, bt - 1, 2.5, 2.5, col);
    legsOut(legCol, liftOuter);
    tail();
  }
  Object.assign(g, { x0, Wg, hx, hy, hw: hwF, hh: hhF, box: [x0, bt, x0 + Wg - 1, yb], bodyBox: [x0, bt, Wg, BH], near: () => {} });
  A.mouth = [CX + (Q.hdx || 0), hy + hhF - 1]; A.head = [hx, hy, hwF, hhF]; A.body = [x0, bt, Wg, BH]; A.top = hy - 2; A.tail = [CX, bt + 1]; A.front = CX; A.back = CX;
  return g;
}
// 角・枝角などの左右対称な飾りを、向きに合わせて描く。pts は [外向き, 上向き] のずれ
function headPair(P, g, pts, c, opt = {}) {
  if (g.view === 'S') { const rx = g.hx + (opt.sx ?? 1), ry = g.hy - 1; for (const [o, u] of pts) P.px(rx - o, ry - u, c); return; }
  const lx = g.hx + (opt.fin ?? 0), rx = g.hx + g.hw - 1 - (opt.fin ?? 0), ry = g.hy - 1;
  for (const [o, u] of pts) { P.px(lx - o, ry - u, c); P.px(rx + o, ry - u, c); }
}
// 正規化座標の模様を体に置く
function bodyBlotch(P, g, spots, from, to) {
  const [bx, by, bw, bh] = g.bodyBox;
  const flip = g.view === 'B';
  for (const [u, v, ru, rv] of spots) blotch(P, bx + (flip ? 1 - u : u) * bw, by + v * bh, Math.max(1.2, ru * bw), Math.max(1, rv * bh), from, to);
}

function paintQuad(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.08) => jit(hex, R, dh, ds, dl);
  let col = T(def.col), col2 = T(def.col2);
  const dL = R.int(-1, 1), dB = R.int(0, 1), dLeg = R.int(-1, 0);
  const tornEar = R.chance(0.14 + lv * 0.01);
  const eyeC = R.pick(EYE_ANIMAL);
  const nScar = (R.chance(0.2) ? 1 : 0) + Math.floor(lv / 6);
  const scarList = []; for (let i = 0; i < 3; i++) scarList.push([R.f(), R.f(), R.sgn()]);
  const spots = []; for (let i = 0; i < 6; i++) spots.push([R.range(0.05, 0.95), R.range(0.1, 0.9), R.range(0.1, 0.25), R.range(0.2, 0.45)]);
  const u = []; for (let i = 0; i < 10; i++) u.push(R.f());
  const S = view === 'S', F = view === 'F', B = view === 'B';
  let o;
  const after = [];
  const eyes = (g, c, dy = 1, white) => {
    if (Q.eyes) { // 閉じた目（眠る・倒れる）は頭の色を暗くした横線
      const hc = P.get(S ? g.hx + 1 : g.hx + 1, g.hy + dy + 1) || P.get(g.hx + 1, g.hy + 1) || '#5a4a3a', cc = Q.eyes === 'x' ? '#1a1010' : dk(hc, 0.28);
      if (S) { P.px(g.hx + g.hw - 2, g.hy + dy, cc); P.px(g.hx + g.hw - 3, g.hy + dy, cc); }
      else if (F) { const inset = g.hw >= 6 ? 1 : 0; P.px(g.hx + inset, g.hy + dy, cc); P.px(g.hx + g.hw - 1 - inset, g.hy + dy, cc); }
      return;
    }
    if (S) { if (white) P.px(g.hx + g.hw - 3, g.hy + dy, white); P.px(g.hx + g.hw - 2, g.hy + dy, c); }
    else if (F) { const inset = g.hw >= 6 ? 1 : 0; P.px(g.hx + inset, g.hy + dy, c); P.px(g.hx + g.hw - 1 - inset, g.hy + dy, c); }
  };
  const nose = (g, c) => { if (S) P.px(g.hx + g.hw + g.sl - 1, g.sy, c); else if (F) P.rect(CX - 1, g.hy + g.hh - (o.snoutH || 2), 2, 1, c); };
  let g;
  switch (sp) {
    case 'cow': {
      const base = u[0] < 0.2 ? T(pickU(['#8a5a3a', '#5a3a2a', '#d8c8a8'], u[1])) : col;
      o = { L: 17 + dL, BH: 8 + dB, legH: 5, legW: 2, col: base, neck: 1, neckW: 5, headW: 5, headH: 5, headBack: 3, neckFwd: 1, headDrop: 3, snoutL: 2, snoutH: 3, snoutCol: T('#e8b0a8'), ear: 'side', tail: 'tuft', tuftCol: col2, legCol: base, hoof: '#3a2e28', round: 2, nod: true };
      g = quad(P, o, view, fr);
      bodyBlotch(P, g, spots.slice(0, 2 + Math.floor(u[2] * 3)), base, col2);
      if (u[3] < 0.6 && !B) { const hb = S ? [g.hx + u[4] * 4, g.hy + 1] : [g.hx + 1 + u[4] * (g.hw - 2), g.hy + 1]; blotch(P, hb[0], hb[1], 1.6, 1.6, base, col2); }
      if (u[5] < 0.7) headPair(P, g, [[0, 0], [1, 1]], '#e8e0c8', { sx: 1 });
      if (u[6] < 0.5 && S) P.rect(g.x0 + g.L - 7, g.yb + 1, 3, 1, T('#f0a8a8'));
      if (u[7] < 0.35 && !B) { const bc = pickU(['#e8c040', '#c9602a', '#8a8a90'], u[8]); if (S) { P.rect(g.hx - 1, g.hy + g.hh, 3, 1, '#8a3a2a'); P.px(g.hx, g.hy + g.hh + 1, bc); } else { P.rect(CX - 2, g.hy + g.hh, 4, 1, '#8a3a2a'); P.rect(CX - 1, g.hy + g.hh + 1, 2, 1, bc); } }
      nose(g, '#6a3a3a');
      after.push(() => eyes(g, eyeC, 1));
      break;
    }
    case 'sheep': {
      const wool = T('#f4f1ea', 0.02, 0.05, 0.05);
      const face = u[0] < 0.55 ? 'dark' : u[0] < 0.78 ? 'white' : 'brown';
      const fc = face === 'dark' ? col2 : face === 'white' ? T('#e8e0d0') : T('#6a4a30');
      o = { L: 12 + dL, BH: 7 + dB, legH: 3, legW: 1, col: wool, legCol: fc, neck: 0, headW: 3, headH: 4, headBack: 1, headDrop: 1, snoutL: 1, snoutH: 2, headCol: fc, ear: 'side', earCol: fc, tail: 'short', tailCol: wool, round: 3, girthAdd: 2 };
      g = quad(P, o, view, fr);
      // もこもこの縁（2px単位の房）
      const [bx, by, bw, bh] = g.bodyBox;
      for (let x = bx + 1; x < bx + bw - 1; x += 3) { P.rect(x, by - 1, 2, 1, wool); P.rect(x + 1, by + bh, 2, 1, wool); }
      for (let i = 0; i < 4; i++) { const x = bx + Math.floor(u[i + 1] * (bw - 2)), y = by + 1 + Math.floor(u[i + 5] * (bh - 2)); P.over(x, y, dk(wool, 0.07)); P.over(x + 1, y, dk(wool, 0.07)); }
      if (!B) P.rect(g.hx, g.hy - 1, S ? 2 : g.hw, 1, wool);
      if (u[9] < 0.3) { const mark = pickU(['#c03a3a', '#3a6ab0', '#3a9a4a'], u[3]); P.overRect(bx + 2, by + 2, 2, 1, mark); }
      if (u[2] < 0.25) headPair(P, g, [[0, 0], [1, 0], [1, -1]], '#c8b890', { sx: 0 });
      after.push(() => eyes(g, face === 'dark' ? '#e8e0c0' : eyeC, 1));
      break;
    }
    case 'pig': {
      o = { L: 13 + dL, BH: 7 + dB, legH: 2, legW: 2, col, neck: 0, headW: 4, headH: 5, headBack: 2, headDrop: 2, snoutL: 2, snoutH: 3, snoutCol: lt(col, 0.05), squareSnout: true, muzzleW: 4, ear: 'floppy', earX: 2, tail: 'curly', round: 3, hoof: dk(col2, 0.1) };
      g = quad(P, o, view, fr);
      const pat = u[0] < 0.36 ? 'none' : u[0] < 0.64 ? 'spots' : u[0] < 0.82 ? 'saddle' : 'dirty';
      const sc = pickU(['#3a2a28', '#8a5a4a', '#2a2020'], u[1]);
      if (pat === 'spots') bodyBlotch(P, g, spots.slice(0, 2 + Math.floor(u[2] * 3)), col, sc);
      if (pat === 'saddle') { const [bx, by, bw, bh] = g.bodyBox; for (let x = bx + Math.floor(bw * 0.35); x < bx + Math.floor(bw * 0.65); x++) for (let y = by; y < by + bh; y++) if (P.get(x, y) === col) P.px(x, y, sc); }
      if (pat === 'dirty') { const [bx, by, bw, bh] = g.bodyBox; for (let i = 0; i < 3; i++) { const x = bx + Math.floor(u[3 + i] * (bw - 2)); P.over(x, by + bh - 1, '#6a4a2a'); P.over(x + 1, by + bh - 1, '#6a4a2a'); } }
      if (S) { P.px(g.hx + g.hw + 1, g.sy + 1, col2); P.px(g.hx + g.hw + 1, g.sy + 2, col2); }
      if (F) { P.px(CX - 1, g.hy + g.hh - 2, col2); P.px(CX, g.hy + g.hh - 2, col2); }
      after.push(() => eyes(g, eyeC, 1));
      break;
    }
    case 'horse': case 'unicorn': {
      const uni = sp === 'unicorn';
      if (!uni) col = T(pickU(['#8a5a34', '#6a3a1a', '#3a2a22', '#c8a060', '#a8a8a8', '#e8e4dc', '#b06a30', '#5a4a40'], u[0]), 0.02, 0.08, 0.06);
      const mane = uni ? (u[1] < 0.35 ? 'rainbow' : col2) : (u[1] < 0.7 ? dk(col, 0.22) : T(pickU(['#f0e8d0', '#1a1410', '#8a6a4a'], u[2])));
      o = { L: 16 + dL, BH: 7, legH: 9 + dLeg, legW: 2, col, neckUp: 5, neckW: 3, neckFwd: 1, headW: 3, headH: 3, headBack: 1, snoutL: 3, snoutH: 2, snoutDrop: 1, ear: 'point', tail: 'horse', tailCol: mane === 'rainbow' ? '#e8a8f0' : mane, tailLen: Math.floor(u[3] * 3), hoof: uni ? GOLD : '#2a2018', round: 2, socks: u[4] < 0.4 ? pickU([[0], [1], [0, 1]], u[5]) : null, girth: 10, headWAdd: 1 };
      g = quad(P, o, view, fr);
      const mc = (i) => mane === 'rainbow' ? ['#f08080', '#f0c060', '#f0f080', '#80e0a0', '#80b0f0', '#c090f0'][i % 6] : mane;
      if (S) { let k = 0; for (let y = g.hy; y <= g.bt + 1; y++) { let xl = -1; for (let x = g.x0 + g.L - 8; x <= g.hx + g.hw; x++) if (P.get(x, y)) { xl = x; break; } if (xl >= 0) { P.px(xl, y, mc(k)); P.px(xl - 1, y, mc(k)); k++; } } P.px(g.hx + 2, g.hy, mc(0)); }
      else { for (let y = g.hy - 1; y <= g.bt + (B ? 1 : -1); y++) P.rect(CX - 1, y, 2, 1, mc(y)); }
      if (!uni) {
        const faceM = u[6] < 0.43 ? 'none' : u[6] < 0.71 ? 'blaze' : 'star';
        if (faceM === 'blaze' && S) P.rect(g.hx + g.hw, g.hy + 1, 3, 1, '#f4f2ea');
        if (faceM === 'blaze' && F) P.rect(CX - 1, g.hy + 1, 2, g.hh - 1, '#f4f2ea');
        if (faceM === 'star' && !B) P.rect(S ? g.hx + 2 : CX - 1, g.hy + 1, S ? 1 : 2, 1, '#f4f2ea');
        if (u[7] < 0.25) bodyBlotch(P, g, spots.slice(0, 3), col, lt(col, 0.18));
        if (u[8] < 0.3) { const sd = T(pickU(['#8a2a2a', '#2a4a8a', '#6a4a2a'], u[9])); const [bx, by, bw] = g.bodyBox; const sx = S ? bx + 6 : bx; const sw2 = S ? 5 : bw; P.rect(sx, by - 1, sw2, 3, sd); P.rect(sx + 1, by - 1, sw2 - 2, 1, '#4a2a1a'); }
      } else {
        const hc = u[6] < 0.33 ? GOLD : u[6] < 0.66 ? '#f4e8ff' : '#c0e8ff';
        if (S) { P.line(g.hx + g.hw, g.hy - 1, g.hx + g.hw + 2, g.hy - 4 - Math.floor(u[7] * 2), hc); }
        else if (F) { P.rect(CX - 1, g.hy - 4, 1, 4, hc); P.px(CX, g.hy - 3, lt(hc, 0.1)); P.px(CX - 1, g.hy - 5, hc); }
        else P.rect(CX - 1, g.hy - 3, 1, 2, hc);
      }
      after.push(() => eyes(g, uni ? '#6a3a9a' : eyeC, 1));
      break;
    }
    case 'goat': {
      const pat = u[0] < 0.43 ? 'plain' : u[0] < 0.86 ? 'two' : 'dark';
      if (pat === 'dark') col = T('#4a3a30');
      o = { L: 11 + dL, BH: 6, legH: 5 + dLeg, legW: 1, col, neckUp: 3, neckW: 2, neckFwd: 1, headW: 3, headH: 3, headBack: 1, snoutL: 2, snoutH: 2, snoutDrop: 1, ear: 'side', tail: 'up', round: 2, nod: true };
      g = quad(P, o, view, fr);
      if (pat === 'two') bodyBlotch(P, g, spots.slice(0, 1 + Math.floor(u[1] * 3)), col, col2);
      if (S) { P.rect(g.hx + g.hw + 1, g.hy + g.hh + 1, 1, 2, col2); }
      if (F) P.rect(CX - 1, g.hy + g.hh, 2, 2, col2);
      const hc = T('#b8a888'), hl = 2 + Math.floor(u[2] * 3);
      const pts = [[0, 0]]; for (let i = 0; i < hl; i++) pts.push([i, 1 + (i < 2 ? 0 : -1) + (i === 0 ? 0 : 0)]);
      headPair(P, g, pts, hc, { sx: 1 });
      if (u[3] < 0.3 && !B) P.px(S ? g.hx + 1 : CX, g.hy + g.hh + (S ? 0 : 2), '#c8a040');
      after.push(() => eyes(g, u[4] < 0.5 ? '#c8a040' : '#8a6a2a', 1));
      break;
    }
    case 'deer': case 'reindeer': {
      const rd = sp === 'reindeer';
      o = { L: (rd ? 15 : 13) + dL, BH: rd ? 7 : 6, legH: (rd ? 8 : 9) + dLeg, legW: 1, col, neckUp: rd ? 3 : 5, neckW: rd ? 4 : 2, neckFwd: 1, headW: 3, headH: 3, headBack: 1, snoutL: 2, snoutH: 2, snoutDrop: 1, ear: 'point', earX: 0, tail: rd ? 'short' : 'up', tailCol: col2, belly: col2, round: 2, hoof: '#2a2018' };
      g = quad(P, o, view, fr);
      if (rd && S) for (let y = g.hy + g.hh; y <= g.bt + 2; y++) { P.over(g.x0 + g.L - 1, y, col2); P.over(g.x0 + g.L, y, col2); }
      if (rd && F) P.rect(CX - 2, g.hy + g.hh, 4, 3, col2);
      if (!rd && u[0] < 0.3 && !F) { const [bx, by, bw] = g.bodyBox; for (let i = 0; i < 3; i++) { const x = bx + 2 + Math.floor(u[1 + i] * (bw - 5)); P.over(x, by + 1 + (i & 1), '#f4ead8'); P.over(x + 1, by + 1 + (i & 1), '#f4ead8'); } }
      if (rd || u[4] < 0.6) {
        const ac = T(rd ? '#c8b08a' : '#d8c09a', 0.02, 0.05, 0.05);
        const h = rd ? 6 + Math.floor(u[5] * 3) : 4 + Math.floor(u[5] * 4), tines = 1 + Math.floor(u[6] * (rd ? 4 : 3));
        const pts = [];
        for (let i = 0; i < h; i++) pts.push([Math.floor(i / 2.5), i]);
        for (let t = 0; t < tines; t++) { const yy = 1 + Math.floor((t + 1) * h / (tines + 1)); const xx = Math.floor(yy / 2.5); pts.push([xx - 1, yy], [xx - 2, yy + 1]); }
        if (rd) pts.push([-1, 0], [-2, 1]);
        const broken = u[7] < 0.2;
        headPair(P, g, broken ? pts.filter(([, y]) => y < h - 1) : pts, ac, { sx: 1 });
      }
      if (rd && u[8] < 0.1 && !B) { if (S) P.px(g.hx + g.hw + 1, g.sy, '#e03030'); else P.rect(CX - 1, g.hy + g.hh - 2, 2, 1, '#e03030'); }
      after.push(() => eyes(g, eyeC, 1));
      break;
    }
    case 'boar': {
      o = { L: 14 + dL, BH: 7 + dB, legH: 3, legW: 2, col, neck: 0, headW: 5, headH: 5, headBack: 2, headDrop: 1, snoutL: 2, snoutH: 2, snoutCol: dk(col, 0.05), squareSnout: true, muzzleW: 4, ear: 'point', tail: 'thin', round: 2, shoulder: true };
      g = quad(P, o, view, fr);
      const br = dk(col, 0.14);
      if (S) for (let x = g.x0 + 2; x < g.x0 + g.L; x += 2) { let y = g.bt - 4; while (!P.get(x, y) && y < g.yb) y++; P.rect(x, y - 1, 2, 1, br); }
      else P.rect(CX - 1, g.bt - 1, 2, 1, br);
      const tk = T('#f0ead8', 0.01, 0.02, 0.04), tl = 1 + Math.floor(u[0] * 3), broken = u[1] < 0.2;
      if (S) for (let i = 0; i < tl; i++) if (!(broken && i === tl - 1)) P.px(g.hx + g.hw + 1 + (i > 0 ? 1 : 0), g.sy - i + 1, tk);
      if (F) for (let i = 0; i < tl; i++) { P.px(CX - 3 - (i > 0 ? 1 : 0), g.hy + g.hh - 1 - i, tk); if (!(broken && i === tl - 1)) P.px(CX + 2 + (i > 0 ? 1 : 0), g.hy + g.hh - 1 - i, tk); }
      if (u[2] < 0.35 && S) for (let x = g.x0 + 3; x < g.x0 + g.L - 3; x += 3) { P.over(x, g.bt + 3, lt(col, 0.1)); P.over(x + 1, g.bt + 3, lt(col, 0.1)); }
      nose(g, '#2a1a14');
      after.push(() => eyes(g, u[3] < 0.5 ? '#c03020' : '#1a1410', 1));
      break;
    }
    case 'wolf': case 'fox': {
      const fx = sp === 'fox';
      if (!fx && u[0] < 0.5) col = T(pickU(['#4a4a50', '#a8a8b0', '#8a7a68', '#d8d8dc', '#2a2a30', '#6a5a4a', '#b8a890'], u[1]), 0.02, 0.08, 0.1);
      if (fx && u[0] < 0.15) col = T(pickU(['#c8c8c8', '#8a4a2a', '#e8e0d0'], u[1]));
      o = fx
        ? { L: 10 + dL, BH: 4, legH: 4, legW: 1, col, legCol: u[2] < 0.7 ? '#2a2020' : col, neckUp: 1, neckW: 2, headW: 3, headH: 3, headBack: 1, snoutL: 2 + Math.floor(u[3] * 2), snoutH: 1, muzzleW: 2, ear: 'point', bigEar: true, earIn: '#2a2020', tail: 'bushy', tailLen: 1 + Math.floor(u[4] * 2), tailTip: '#f8f8f8', belly: col2, round: 1, girth: 6 }
        : { L: 13 + dL, BH: 5 + dB, legH: 6 + dLeg, legW: 1, col, neckUp: 2, neckW: 3, headW: 4, headH: 4, headBack: 1, snoutL: 3, snoutH: 2, muzzleW: 2, ear: 'point', bigEar: u[3] < 0.5, tornEar, tail: 'bushy', tailLen: Math.floor(u[4] * 3), tailTip: u[5] < 0.3 ? col2 : u[5] < 0.5 ? '#2a2a2a' : null, belly: col2, round: 2 };
      g = quad(P, o, view, fr);
      if (S) { P.over(g.hx + g.hw, g.hy + g.hh - 1, col2); P.over(g.hx + g.hw + 1, g.hy + g.hh - 1, col2); P.over(g.x0 + g.L - 1, g.bt + 2, col2); P.over(g.x0 + g.L - 1, g.bt + 3, col2); }
      if (F) { P.overRect(CX - 1, g.hy + g.hh - 1, 2, 1, col2); P.overRect(CX - 1, g.bt + 1, 2, g.BH - 1, col2); }
      if (!fx) {
        if (u[6] < 0.6 && !F) { const [bx, by, bw] = g.bodyBox; for (let x = bx + 1; x < bx + bw - 1; x++) P.over(x, by, dk(col, 0.18)); }
        const wp = u[7] < 0.27 ? 'none' : u[7] < 0.45 ? 'chest' : u[7] < 0.63 ? 'sock' : u[7] < 0.82 ? 'face' : 'flank';
        if (wp === 'face' && !B) P.rect(S ? g.hx + 1 : g.hx + 1, g.hy + 1, 2, 1, col2);
        if (wp === 'flank' && !F) bodyBlotch(P, g, [[0.3 + u[8] * 0.4, 0.5, 0.12, 0.3]], col, col2);
        if (wp === 'sock') after.push(() => { if (S) P.rect(g.x0 + g.L - 3, g.G - 1, 1, 2, col2); else P.rect(g.box[2] - 1, g.G - 1, 1, 2, col2); });
        if (wp === 'chest' && S) for (let y = g.bt + 1; y < g.yb; y++) P.over(g.x0 + g.L - 2, y, col2);
      }
      nose(g, '#141414');
      const ey = fx ? '#c89020' : pickU(['#e8c040', '#d8a030', '#80b0e0', '#c86a20', '#a0d060'], u[9]);
      after.push(() => eyes(g, ey, 1));
      break;
    }
    case 'bear': case 'polarbear': {
      const pb = sp === 'polarbear';
      if (!pb && u[0] < 0.3) col = T(pickU(['#2a1e16', '#6a4a30', '#8a6a48'], u[1]));
      o = { L: (pb ? 18 : 16) + dL, BH: 9 + dB, legH: 4, legW: 3, col, neckUp: pb ? 1 : 0, neck: 1, neckW: 5, neckFwd: pb ? 2 : 0, headW: 5, headH: 5, headBack: 3, headDrop: pb ? 1 : 0, snoutL: 2, snoutH: 2, snoutCol: pb ? col : T(mix(col, '#c8a070', 0.45)), ear: 'round', round: 3, shoulder: !pb, tail: 'short', hoof: dk(col, 0.2), girthAdd: 2 };
      g = quad(P, o, view, fr);
      nose(g, '#141414');
      if (!pb && u[2] < 0.35 && F) P.rect(CX - 2, g.bt + 2, 4, 1, '#e8dcc0'); // 月の輪
      if (!pb && u[2] < 0.35 && S) P.rect(g.x0 + g.L - 3, g.bt + 3, 3, 1, '#e8dcc0');
      if (pb) { const [bx, by, bw, bh] = g.bodyBox; for (let i = 0; i < 3; i++) { const x = bx + Math.floor(u[3 + i] * (bw - 2)), y = by + 1 + Math.floor(u[6 + i] * (bh - 2)); P.over(x, y, dk(col, 0.06)); P.over(x + 1, y, dk(col, 0.06)); } }
      after.push(() => eyes(g, '#141414', 1));
      break;
    }
    case 'rabbit': {
      if (u[0] < 0.35) col = T(pickU(['#8a6a4a', '#f4f4f0', '#5a4a40', '#d8c8a8'], u[1]));
      o = { L: 7 + Math.floor(u[2] * 2), BH: 5, legH: 1, legW: 2, col, neck: 0, headW: 4, headH: 4, headBack: 2, headDrop: -1, snoutL: 0, ear: 'long', earLen: 4 + Math.floor(u[3] * 2), earFlop: u[4] < 0.3, earIn: '#f0b0b0', tail: 'cotton', round: 2, girth: 6 };
      g = quad(P, o, view, fr);
      if (S) P.px(g.hx + g.hw - 1, g.hy + 2, '#e08080'); if (F) P.px(CX, g.hy + 2, '#e08080');
      if (u[5] < 0.35) bodyBlotch(P, g, [[0.3 + u[6] * 0.4, 0.4, 0.2, 0.3]], col, T(pickU(['#f8f8f4', '#4a3a30'], u[7])));
      after.push(() => eyes(g, u[8] < 0.15 ? '#c02030' : '#141414', 1));
      break;
    }
    case 'squirrel': {
      if (u[0] < 0.25) col = T(pickU(['#6a6a70', '#5a3a22', '#c87a3a'], u[1]));
      o = { L: 5, BH: 5, legH: 1, legW: 2, col, neck: 0, headW: 4, headH: 4, headBack: 2, headDrop: -2, snoutL: 1, snoutH: 1, ear: 'tuft', tail: 'squirrel', tailLen: Math.floor(u[2] * 3), belly: col2, round: 2, girth: 5 };
      g = quad(P, o, view, fr);
      if (u[3] < 0.4 && !B) { const ax = S ? g.hx + g.hw : CX - 1, ay = S ? g.hy + g.hh : g.hy + g.hh; P.px(ax, ay, '#8a5a2a'); P.px(ax, ay + 1, '#c89050'); }
      if (F) P.rect(CX - 1, g.bt + 1, 2, 3, col2);
      if (F) { // 正面では大きな尾が後ろから覗く
        after.push(() => {});
      }
      after.push(() => eyes(g, '#141414', 1));
      break;
    }
    case 'camel': {
      const two = u[0] < 0.3;
      o = { L: 15 + dL, BH: 6, legH: 11 + dLeg, legW: 1, col, neckUp: 4, neckW: 3, neckFwd: 4, headW: 3, headH: 3, headBack: 0, snoutL: 2, snoutH: 2, ear: 'side', tail: 'thin', round: 2, hump: two ? [4, 10] : [7], hoof: dk(col, 0.25), girth: 10, nod: true };
      g = quad(P, o, view, fr);
      if (!two && S) P.ell(g.x0 + 7, g.bt - 2, 2, 1.6, col);
      if (!S) { P.ell(CX, g.bt - 2, 3, 2.2, col); if (two && B) P.ell(CX, g.bt - 1, 3, 1.5, dk(col, 0.05)); }
      if (u[1] < 0.45) { const bl = T(pickU(['#c03a3a', '#3a5ab0', '#e0a030', '#8a3a8a'], u[2])); const [bx, by, bw] = g.bodyBox; P.rect(bx + (S ? 3 : 0), by + 1, S ? bw - 6 : bw, 2, bl); for (let x = bx + (S ? 3 : 0); x < bx + (S ? bw - 3 : bw); x += 2) P.px(x, by + 3, GOLD); }
      if (u[3] < 0.3 && S) P.line(g.hx + 1, g.hy + 2, g.hx + g.hw + 1, g.hy + 2, '#8a2a2a');
      after.push(() => eyes(g, eyeC, 1));
      break;
    }
    case 'tiger': {
      if (u[0] < 0.08) col = T('#e8e4dc'); // 白虎
      o = { L: 16 + dL, BH: 6 + dB, legH: 5, legW: 2, col, neckUp: 1, neckW: 4, headW: 5, headH: 5, headBack: 2, snoutL: 1, snoutH: 2, snoutCol: '#f4f0e8', muzzleW: 3, ear: 'round', earCol: col, tail: 'long', tailLen: Math.floor(u[1] * 3), belly: '#f4f0e8', round: 2, tornEar, girthAdd: 1 };
      g = quad(P, o, view, fr);
      const n = 5 + Math.floor(u[2] * 4), off = Math.floor(u[3] * 3);
      const [bx, by, bw, bh] = g.bodyBox;
      if (S) for (let i = 0; i < n; i++) { const x = bx + off + Math.round(i * (bw - 2) / n); const len = 3 + Math.floor(u[(4 + i) % 10] * 3); for (let j = 0; j < len; j++) P.over(x + (j > 2 ? 1 : 0), by + j, col2); }
      else for (let y = by + 1; y < by + bh; y += 2) { P.over(bx, y, col2); P.over(bx + 1, y, col2); P.over(bx + bw - 1, y, col2); P.over(bx + bw - 2, y, col2); }
      if (!B) for (let i = 0; i < 3; i++) P.over(S ? g.hx + 1 + i : CX - 2 + i + (i > 0 ? 0 : 0), g.hy + (i & 1), col2);
      if (B) for (let y = g.hy; y < g.hy + g.hh; y += 2) P.over(CX - 1, y, col2);
      if (S) for (let i = 0; i < 3; i++) P.over(g.x0 - 2 - i * 2, g.bt + 2 + (i === 0 ? 1 : 0), col2);
      nose(g, '#c06a6a');
      after.push(() => eyes(g, pickU(['#e0c030', '#a0c040', '#6090d0'], u[8]), 2));
      break;
    }
    case 'dog': {
      col = T(pickU(['#a8783a', '#6a4a2a', '#e8dcc8', '#2a2420', '#c89050', '#8a8a8a', '#d8b070'], u[0]));
      const earT = u[1] < 0.5 ? 'floppy' : 'point';
      o = { L: 11 + dL, BH: 5, legH: 4 + (u[2] < 0.3 ? -1 : 0), legW: 1, col, neckUp: 2, neckW: 3, headW: 4, headH: 4, headBack: 1, snoutL: 2, snoutH: 2, muzzleW: 2, ear: earT, tail: 'up', tailCol: col, belly: col2, round: 2, tornEar };
      g = quad(P, o, view, fr);
      if (S) P.line(g.x0, g.bt + 1, g.x0 - 2, g.bt - 2 - (fr === 1 ? 0 : 1), col); // 犬の尾は上向き
      if (u[3] < 0.5) bodyBlotch(P, g, spots.slice(0, 1 + Math.floor(u[4] * 2)), col, pickU([col2, '#2a2420', '#f4f0e8'], u[5]));
      if (u[6] < 0.4 && !B) { if (S) P.rect(g.hx + 1, g.hy + 1, 2, 1, col2); else P.rect(CX - 1, g.hy + 1, 2, g.hh - 1, col2); }
      nose(g, '#141414');
      after.push(() => eyes(g, '#2a1a10', 1));
      break;
    }
    case 'cat': {
      col = T(pickU(['#e0a060', '#3a3a3a', '#f4f0e8', '#8a8a90', '#c87a3a', '#6a5040'], u[0]));
      const tabby = u[1] < 0.45, calico = u[2] < 0.2;
      o = { L: 8 + (dL > 0 ? 1 : 0), BH: 4, legH: 3, legW: 1, col, neckUp: 1, neckW: 2, headW: 4, headH: 4, headBack: 1, snoutL: 0, ear: 'point', bigEar: false, tail: 'cat', tailLen: 1, belly: u[3] < 0.5 ? col2 : null, round: 2, girth: 6, tornEar };
      g = quad(P, o, view, fr);
      if (tabby) { const [bx, by, bw] = g.bodyBox; for (let x = bx + 1; x < bx + bw - 1; x += 2) P.overRect(x, by, 1, 2, dk(col, 0.15)); P.overRect(g.hx + 1, g.hy, 2, 1, dk(col, 0.15)); }
      if (calico) { bodyBlotch(P, g, spots.slice(0, 2), col, '#e08a3a'); bodyBlotch(P, g, spots.slice(2, 3), col, '#2a2a2a'); }
      if (F) P.px(CX - 1, g.hy + 2, '#e08080');
      const ey = pickU(['#e8c040', '#60c060', '#60a0e0', '#e08a2a'], u[4]);
      after.push(() => eyes(g, ey, 1));
      break;
    }
    case 'donkey': {
      o = { L: 14 + dL, BH: 7, legH: 7 + dLeg, legW: 2, col, neckUp: 4, neckW: 3, neckFwd: 1, headW: 3, headH: 4, headBack: 1, snoutL: 3, snoutH: 2, snoutDrop: 1, snoutCol: col2, ear: 'long', earLen: 4, tail: 'tuft', tailLen: -1, tuftCol: dk(col, 0.3), round: 2, girth: 10, belly: col2 };
      g = quad(P, o, view, fr);
      if (S) { for (let y = g.hy + 1; y < g.bt; y++) P.over(g.hx - 1, y, dk(col, 0.25)); P.rect(g.x0 + 5, g.bt, 7, 1, dk(col, 0.15)); } // たてがみと背の線
      else P.rect(CX - 1, g.bt, 2, g.BH - 2, dk(col, 0.15));
      after.push(() => eyes(g, '#1a1410', 1));
      break;
    }
    case 'rat': {
      o = { L: 5, BH: 3, legH: 1, legW: 1, col, neck: 0, headW: 3, headH: 3, headBack: 1, headDrop: 0, snoutL: 2, snoutH: 1, snoutCol: col, muzzleW: 2, ear: 'round', earCol: col2, tail: 'rat', tailCol: col2, tailLen: 1, round: 1, girth: 4 };
      g = quad(P, o, view, fr);
      if (u[1] < 0.3) bodyBlotch(P, g, spots.slice(0, 1), col, lt(col, 0.2));
      nose(g, '#e08080');
      after.push(() => eyes(g, '#141010', 1));
      break;
    }
    default: {
      o = { L: 12, BH: 6, legH: 4, legW: 1, col, neckUp: 2, neckW: 2, headW: 3, headH: 3, snoutL: 2, ear: 'point', tail: 'thin', belly: col2 };
      g = quad(P, o, view, fr);
      after.push(() => eyes(g, eyeC, 1));
    }
  }
  roleQuad(P, g, R.role, view);
  scarsAt(P, scarList.slice(0, nScar), g.box);
  P.shade();
  g.near();
  after.forEach((fn) => fn());
  return g;
}
let CUR_ROLE = null;
// 役割による見分け（群れの長は大きく傷あり、乗用・荷運びは鞍や荷、番犬などは首輪）
function roleQuad(P, g, role, view) {
  if (!role || !g) return;
  const [bx, by, bw] = g.bodyBox;
  const S = view === 'S';
  if (role === 'mount' || role === 'plow') { const sx = S ? bx + Math.floor(bw * 0.35) : bx, sw = S ? Math.max(4, Math.floor(bw * 0.35)) : bw; P.rect(sx, by - 1, sw, 3, role === 'mount' ? '#8a2a2a' : '#6a4a2a'); P.rect(sx + 1, by - 1, sw - 2, 1, '#4a2a1a'); }
  if (role === 'pack') { const sx = S ? bx + Math.floor(bw * 0.25) : bx - 1, sw = S ? Math.floor(bw * 0.5) : bw + 2; P.rect(sx, by - 2, sw, 4, '#b08a5a'); P.rect(sx, by, sw, 1, '#7a5a3a'); }
  if (['herder', 'watchdog', 'mouser', 'dairy'].includes(role) && view !== 'B') {
    const cc = role === 'dairy' ? '#8a3a2a' : '#c03030';
    if (S) { P.rect(g.hx - 1, g.hy + g.hh, 2, 1, cc); if (role === 'dairy') P.px(g.hx, g.hy + g.hh + 1, GOLD); }
    else { P.rect(CX - 2, g.hy + g.hh, 4, 1, cc); P.rect(CX - 1, g.hy + g.hh + 1, 2, 1, role === 'dairy' ? GOLD : '#e8c040'); }
  }
  if (role === 'leader') { const x = S ? bx + 2 : bx + 1; P.over(x, by + 1, mix(P.get(x, by + 1) || '#ffffff', '#f4d0c8', 0.6)); P.over(x + 1, by + 2, mix(P.get(x + 1, by + 2) || '#ffffff', '#f4d0c8', 0.6)); P.over(x + 2, by + 3, mix(P.get(x + 2, by + 3) || '#ffffff', '#f4d0c8', 0.6)); }
}
function pickU(arr, u) { return arr[Math.floor(u * arr.length) % arr.length]; }

// ---------------------------------------------------------------- 鳥
function paintBird(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.08) => jit(hex, R, dh, ds, dl);
  const G = GROUND;
  const S = view === 'S', F = view === 'F', B = view === 'B';
  let col = T(def.col), col2 = T(def.col2);
  const u = []; for (let i = 0; i < 10; i++) u.push(R.f());
  if (sp === 'chicken') {
    const rooster = u[0] < 0.35;
    const scheme = pickU(['white', 'white', 'white', 'brown', 'brown', 'black', 'speckled', 'gold', 'gold'], u[1]);
    col = T({ white: '#f8f6f0', brown: '#a0602a', black: '#2a2a30', speckled: '#e8e0d0', gold: '#e0a040' }[scheme], 0.02, 0.08, 0.05);
    const tailC = rooster ? T(pickU(['#1a3a2a', '#2a2a30', '#6a2a1a'], u[2])) : dk(col, 0.08);
    const comb = T('#d9463a', 0.02, 0.05, 0.05), cs = rooster ? 3 + Math.floor(u[3] * 2) : 1 + Math.floor(u[3] * 3);
    const bob = Q.bob ?? (fr === 1 ? 0 : 1);
    const cy = G - 5 + (Q.sit ? 3 : 0);
    const lc = '#e8a030';
    // 頭のずれ（ついばむ：hg=1 で地面へ）
    const hg = Q.hg || 0;
    if (S) {
      const cx = CX;
      const hdx = (Q.hdx || 0) + Math.round(hg * 3), hdy = (Q.hdy || 0) + Math.round(hg * (G - 2 - (cy - 4 + bob)));
      if (rooster) { thick(P, cx - 3, cy - 1, cx - 6, cy - 6 + (Q.tailDn || 0), 1, tailC); P.line(cx - 6, cy - 6 + (Q.tailDn || 0), cx - 7, cy - 3, tailC); P.line(cx - 5, cy - 7 + (Q.tailDn || 0), cx - 7, cy - 7 + (Q.tailDn || 0), tailC); }
      else { P.rect(cx - 5, cy - 3, 2, 3, tailC); P.px(cx - 5, cy - 4, tailC); }
      P.ell(cx, cy, 4.2, 3.4, col);
      if (hdx || hdy) thick(P, cx + 2, cy - 2, cx + 3 + hdx, cy - 3 + bob + hdy, 1.2, col);
      P.ell(cx + 3 + hdx, cy - 4 + bob + hdy, 2, 2.2, col); if (!(hdx || hdy)) P.rect(cx + 2, cy - 3, 2, 2, col);
      if (scheme === 'speckled') for (let i = 0; i < 3; i++) P.overRect(cx - 3 + Math.floor(u[4 + i] * 5), cy - 2 + Math.floor(u[7 + i] * 4), 2, 1, '#3a3a3a');
      P.ell(cx - 0.5, cy + 0.2, 2.4, 1.6, dk(col, 0.1));
      if (Q.wing) { const wy = Q.wing > 0 ? -5 : -1; P.line(cx - 2, cy - 1, cx - 4, cy + wy, dk(col, 0.1)); P.line(cx - 1, cy - 1, cx - 3, cy + wy, dk(col, 0.1)); P.line(cx, cy - 1, cx - 2, cy + wy + 1, dk(col, 0.1)); }
      if (rooster) P.rect(cx + 2, cy - 3, 1, 3, T('#e08a2a'));
      P.shade();
      const X = cx + hdx, Y = cy + hdy;
      for (let i = 0; i < cs; i++) P.rect(X + 2 + i - (cs > 2 ? 1 : 0), Y - 7 + bob + (i & 1), 1, 2 - (i & 1), comb);
      P.rect(X + 5, Y - 3 + bob, 1, rooster ? 2 : 1, comb);
      P.rect(X + 5, Y - 4 + bob, 2, 1, '#f0c040');
      if (Q.mouth) { P.px(X + 6, Y - 3 + bob, '#f0c040'); P.px(X + 7, Y - 4 + bob, '#3a1418'); }
      P.px(X + 4, Y - 5 + bob, Q.eyes ? dk(col, 0.3) : '#1a1410');
      const s = Q.step ?? (fr === 0 ? 1 : fr === 2 ? -1 : 0);
      if (!Q.sit) {
        P.rect(cx - 1, cy + 3, 1, G - cy - 3, dk(lc, 0.1)); P.px(cx - 1 - s, G, dk(lc, 0.1));
        P.rect(cx + 1, cy + 3, 1, G - cy - 3, lc); P.rect(cx + 1 + s, G, 2, 1, lc);
      }
      A.mouth = [X + 6, Y - 4 + bob]; A.head = [X + 1, Y - 6 + bob, 4, 4]; A.body = [cx - 4, cy - 3, 9, 7]; A.top = Y - 8 + bob; A.front = X + 7; A.back = cx - 6;
    } else {
      const cx = CX;
      const hdy = (Q.hdy || 0) + Math.round(hg * 5);
      if (B) { if (rooster) { P.rect(cx - 2, cy - 9, 4, 6, tailC); P.rect(cx - 1, cy - 11, 2, 2, tailC); } else P.rect(cx - 2, cy - 7, 4, 4, tailC); }
      P.ell(cx, cy, 3.6, 3.4, col);
      if (!(B && hg > 0.5)) P.ell(cx + (Q.hdx || 0), cy - 5 + bob + hdy, 2.2, 2.2, col);
      if (!B) { if (Q.wing) { const wy = Q.wing > 0 ? -3 : 0; P.line(cx - 4, cy - 1, cx - 6, cy - 1 + wy, dk(col, 0.1)); P.line(cx + 3, cy - 1, cx + 5, cy - 1 + wy, dk(col, 0.1)); P.rect(cx - 4, cy - 1, 1, 3, dk(col, 0.1)); P.rect(cx + 3, cy - 1, 1, 3, dk(col, 0.1)); } else { P.rect(cx - 4, cy - 1, 1, 3, dk(col, 0.1)); P.rect(cx + 3, cy - 1, 1, 3, dk(col, 0.1)); } }
      else if (Q.wing) { const wy = Q.wing > 0 ? -3 : 0; P.line(cx - 3, cy - 1, cx - 6, cy - 1 + wy, dk(col, 0.1)); P.line(cx + 2, cy - 1, cx + 5, cy - 1 + wy, dk(col, 0.1)); }
      if (scheme === 'speckled') for (let i = 0; i < 3; i++) P.overRect(cx - 3 + Math.floor(u[4 + i] * 5), cy - 1 + Math.floor(u[7 + i] * 3), 2, 1, '#3a3a3a');
      P.shade();
      const X = cx + (Q.hdx || 0), Y = cy + hdy;
      if (!(B && hg > 0.5)) for (let i = 0; i < cs; i++) P.px(X - 1 + (i % 2), Y - 8 + bob - Math.floor(i / 2), comb);
      if (F) { P.rect(X - 1, Y - 5 + bob, 2, 1, '#f0c040'); if (Q.mouth) P.rect(X - 1, Y - 4 + bob, 2, 1, '#3a1418'); P.rect(X - 1, Y - 4 + bob + (Q.mouth ? 1 : 0), 2, rooster ? 2 : 1, comb); P.px(X - 2, Y - 6 + bob, Q.eyes ? dk(col, 0.3) : '#1a1410'); P.px(X + 1, Y - 6 + bob, Q.eyes ? dk(col, 0.3) : '#1a1410'); }
      const up = Q.step != null ? (Q.step === 1 ? 0 : Q.step === -1 ? 1 : -1) : fr === 0 ? 0 : fr === 2 ? 1 : -1;
      if (!Q.sit) {
        P.rect(cx - 2, cy + 3, 1, G - cy - 3 - (up === 0 ? 1 : 0), lc); P.rect(cx + 1, cy + 3, 1, G - cy - 3 - (up === 1 ? 1 : 0), lc);
        P.rect(cx - 3, G - (up === 0 ? 1 : 0), 2, 1, lc); P.rect(cx + 1, G - (up === 1 ? 1 : 0), 2, 1, lc);
      }
      A.mouth = [X, Y - 5 + bob]; A.head = [X - 2, Y - 7 + bob, 4, 4]; A.body = [cx - 4, cy - 3, 8, 7]; A.top = Y - 9 + bob; A.front = cx; A.back = cx;
    }
    return { grounded: true };
  }
  if (sp === 'duck') {
    const mallard = u[0] < 0.4, brown = !mallard && u[0] < 0.6;
    col = mallard ? T('#b8b0a0') : brown ? T('#8a6a48') : T('#f8f6f0', 0.01, 0.03, 0.03);
    const headC = mallard ? T('#2a7a4a') : col, bill = T('#f0a030', 0.02, 0.05, 0.05);
    const cy = G - 4 + (Q.sit ? 2 : 0), bob = Q.bob ?? (fr === 1 ? 0 : 1), lc = '#f09030';
    const hg = Q.hg || 0;
    if (S) {
      const hdx = (Q.hdx || 0) + Math.round(hg * 3), hdy = (Q.hdy || 0) + Math.round(hg * (G - 2 - (cy - 4 + bob)));
      P.rect(CX - 6, cy - 3, 2, 2, dk(col, 0.1));
      P.ell(CX, cy, 5, 3, col);
      if (hdx || hdy) thick(P, CX + 3, cy - 2, CX + 4 + hdx, cy - 3 + bob + hdy, 1.1, mallard ? headC : col);
      P.ell(CX + 4 + hdx, cy - 4 + bob + hdy, 2, 2, headC); if (!(hdx || hdy)) P.rect(CX + 3, cy - 3, 2, 2, mallard ? '#f0f0f0' : col);
      P.ell(CX - 0.5, cy - 0.5, 3, 1.5, dk(col, 0.1));
      if (Q.wing) { const wy = Q.wing > 0 ? -5 : -1; P.line(CX - 2, cy - 1, CX - 5, cy + wy, dk(col, 0.1)); P.line(CX - 1, cy - 1, CX - 4, cy + wy, dk(col, 0.1)); P.line(CX, cy - 1, CX - 2, cy + wy + 1, dk(col, 0.1)); }
      if (mallard) P.overRect(CX - 2, cy - 1, 2, 1, '#3a5ab0');
      P.shade();
      const X = CX + hdx, Y = cy + hdy;
      P.rect(X + 6, Y - 4 + bob, 2, 1, bill); P.px(X + 7, Y - 3 + bob + (Q.mouth ? 1 : 0), dk(bill, 0.1)); if (Q.mouth) P.px(X + 7, Y - 3 + bob, '#3a1418');
      P.px(X + 5, Y - 5 + bob, Q.eyes ? dk(headC, 0.3) : '#141414');
      const st = Q.step ?? (fr === 0 ? 1 : fr === 2 ? -1 : 0);
      if (!Q.sit) {
        P.rect(CX - 1, cy + 3, 1, G - cy - 3, dk(lc, 0.1)); P.rect(CX - 2 - st, G, 2, 1, dk(lc, 0.1));
        P.rect(CX + 1, cy + 3, 1, G - cy - 3, lc); P.rect(CX + 1 + st, G, 2, 1, lc);
      }
      A.mouth = [X + 7, Y - 4 + bob]; A.head = [X + 2, Y - 6 + bob, 4, 4]; A.body = [CX - 5, cy - 3, 11, 6]; A.top = Y - 7 + bob; A.front = X + 8; A.back = CX - 6;
    } else {
      const hdy = (Q.hdy || 0) + Math.round(hg * 5), X = CX + (Q.hdx || 0);
      if (S === false && view === 'B') P.rect(CX - 1, cy - 4, 2, 2, dk(col, 0.1));
      P.ell(CX, cy, 4, 3, col);
      if (Q.wing) { const wy = Q.wing > 0 ? -3 : 0; P.line(CX - 4, cy - 1, CX - 7, cy - 1 + wy, dk(col, 0.1)); P.line(CX + 3, cy - 1, CX + 6, cy - 1 + wy, dk(col, 0.1)); }
      if (!(B && hg > 0.5)) P.ell(X, cy - 5 + bob + hdy, 2, 2, headC);
      if (mallard && !(B && hg > 0.5)) P.rect(X - 2, cy - 3 + bob + hdy, 4, 1, '#f0f0f0');
      P.shade();
      if (view === 'F') { P.rect(X - 1, cy - 4 + bob + hdy, 2, 2, bill); if (Q.mouth) P.rect(X - 1, cy - 3 + bob + hdy, 2, 1, '#3a1418'); P.px(X - 2, cy - 6 + bob + hdy, Q.eyes ? dk(headC, 0.3) : '#141414'); P.px(X + 1, cy - 6 + bob + hdy, Q.eyes ? dk(headC, 0.3) : '#141414'); }
      const f0 = Q.step != null ? (Q.step === 1 ? 0 : Q.step === -1 ? 2 : 1) : fr;
      if (!Q.sit) {
        P.rect(CX - 3, G - (f0 === 0 ? 1 : 0), 2, 1, lc); P.rect(CX + 1, G - (f0 === 2 ? 1 : 0), 2, 1, lc);
        P.rect(CX - 2, cy + 3, 1, G - cy - 3 - (f0 === 0 ? 1 : 0), lc); P.rect(CX + 1, cy + 3, 1, G - cy - 3 - (f0 === 2 ? 1 : 0), lc);
      }
      A.mouth = [X, cy - 4 + bob + hdy]; A.head = [X - 2, cy - 7 + bob + hdy, 4, 4]; A.body = [CX - 4, cy - 3, 8, 6]; A.top = cy - 8 + bob + hdy; A.front = CX; A.back = CX;
    }
    return { grounded: true };
  }
  // 空を飛ぶ鳥：羽ばたきを歩行コマの代わりにする（0:上 1:水平 2:下）
  const cfg = { parrot: { bl: 4, bh: 2.4, wing: 7, tail: 7 }, seagull: { bl: 4.5, bh: 2.2, wing: 9, tail: 3 }, eagle: { bl: 5.5, bh: 2.8, wing: 12, tail: 4 }, crow: { bl: 4, bh: 2.3, wing: 8, tail: 3 }, owl: { bl: 3.5, bh: 3.4, wing: 8, tail: 2 }, bat: { bl: 2.2, bh: 2.2, wing: 8, tail: 0 } }[sp] || { bl: 4, bh: 2.2, wing: 7, tail: 3 };
  let body = col, wingC = col2, head = col, tailC = col, beak = '#f0c040';
  if (sp === 'parrot') {
    const sch = u[0] < 0.4 ? 'scarlet' : u[0] < 0.7 ? 'blue' : 'green';
    if (sch === 'scarlet') { body = T('#d9363a'); head = body; wingC = T('#2a6ad0'); tailC = body; }
    if (sch === 'blue') { body = T('#3a8ae0'); head = T('#3a9a4a'); wingC = T('#2a5ab0'); tailC = body; }
    if (sch === 'green') { body = T('#4ab040'); head = T('#e8d040'); wingC = T('#2a7a3a'); tailC = T('#3a9ae0'); }
    beak = u[1] < 0.6 ? '#e8e0d0' : '#2a2a2a';
  }
  if (sp === 'seagull') { body = T('#f8f8f8', 0, 0.02, 0.03); head = body; wingC = T('#9aa0aa', 0.02, 0.05, 0.1); tailC = body; }
  if (sp === 'eagle') { body = T('#5a3a22'); head = u[1] < 0.3 ? T('#8a6a3a') : T('#f4f2ea', 0.01, 0.03, 0.03); wingC = dk(body, 0.05); tailC = head; beak = '#f0c030'; }
  if (sp === 'crow') { body = T('#1a1a24', 0.02, 0.05, 0.04); head = body; wingC = T('#24243a', 0.02, 0.05, 0.04); tailC = body; beak = '#2a2a30'; }
  if (sp === 'owl') { body = T(def.col); head = body; wingC = dk(body, 0.06); tailC = body; beak = '#d8c070'; }
  if (sp === 'bat') { body = T(def.col); head = body; wingC = T(def.col2); tailC = body; beak = body; }
  const mark = u[2] < 0.33 ? 'none' : u[2] < 0.55 ? 'bar' : u[2] < 0.77 ? 'spot' : 'tip';
  const tipC = sp === 'seagull' ? '#1e1e24' : sp === 'eagle' ? dk(wingC, 0.15) : sp === 'parrot' ? T('#f0d040') : dk(wingC, 0.2);
  if (Q.perch) { perchBird(P, { sp, view, body, head, wingC, tailC, beak, col2, cfg, mark }); return { grounded: true }; }
  const cy = 50 + (Q.cyd || 0);
  const ang = Q.ang ?? (fr === 0 ? -0.9 : fr === 1 ? -0.15 : 0.55); // 翼の角度
  const wingLine = (sx, sy, dir, len, c, tipc) => {
    for (let i = 0; i < len; i++) {
      const x = sx + dir * i, y = sy + Math.round(Math.sin(ang) * i * 0.9 + (ang < 0 ? 0 : 0));
      const w = i < len * 0.4 ? 2 : 1;
      P.rect(x, y, 1, w + (i < 2 ? 1 : 0), i >= len - 2 ? tipc : c);
      if (sp === 'bat') { const d = Math.max(0, Math.round((len - i) * 0.5) - (i % 3 === 2 ? 1 : 0)); P.rect(x, y + 1, 1, d, dk(c, 0.12)); } // 翼の下縁はギザギザ
      if (mark === 'bar' && i > 1 && i < len - 2 && i % 2 === 0) P.px(x, y + 1, lt(c, 0.12));
    }
  };
  if (S) {
    const cx = CX;
    const up = Math.round(Math.sin(ang) * cfg.wing * 0.8);
    // 奥の翼
    for (let i = 0; i < cfg.wing; i++) { const t = i / cfg.wing; P.rect(cx - 1 - Math.round(t * 2) + 1, cy - 1 + Math.round(t * up) - (ang < 0 ? 0 : 0), 2, 1, dk(wingC, 0.18)); }
    P.ell(cx - cfg.bl - cfg.tail / 2 + 1, cy + 0.5, cfg.tail / 2 + 0.5, 1.2, tailC);
    if (sp === 'parrot') P.line(cx - cfg.bl, cy + 1, cx - cfg.bl - cfg.tail, cy + 3, tailC);
    P.ell(cx, cy, cfg.bl, cfg.bh, body);
    P.ell(cx + cfg.bl - 0.5, cy - 1.5, 1.8, 1.8, head);
    if (mark === 'spot') P.overRect(cx - 1, cy, 2, 1, dk(body, 0.2));
    if (mark === 'tip') P.overRect(cx - cfg.bl - cfg.tail + 1, cy + 1, 2, 1, dk(tailC, 0.25));
    P.shade();
    // 手前の翼：付け根から上下に振る
    for (let i = 0; i < cfg.wing; i++) {
      const t = i / cfg.wing;
      const x = cx - Math.round(t * 3), y = cy - 1 + Math.round(t * up);
      const w = Math.max(1, Math.round(3 - t * 2));
      P.rect(x - w + 1, y, w + 1, 1, i >= cfg.wing - 2 ? tipC : wingC);
    }
    const hx = cx + cfg.bl - 0.5;
    P.px(hx + 2, cy - 2, beak); P.px(hx + 3, cy - 1, sp === 'seagull' ? '#d03030' : dk(beak, 0.15));
    if (sp !== 'seagull') P.px(hx + 2, cy - 1, dk(beak, 0.1)); else P.px(hx + 3, cy - 2, beak);
    P.px(Math.round(hx) + 1, cy - 3, sp === 'eagle' ? '#e8a020' : sp === 'owl' ? '#f0a020' : sp === 'bat' ? '#e03030' : '#141414');
    if (sp === 'owl') { P.px(Math.round(hx), cy - 4, dk(body, 0.2)); P.px(Math.round(hx) + 1, cy - 2, col2); }
    if (sp === 'bat') { P.rect(Math.round(hx), cy - 5, 1, 2, body); P.px(Math.round(hx) + 2, cy - 1, '#f0f0f0'); }
    if (sp !== 'bat') P.rect(cx - 1, cy + 3, 2, 1, sp === 'seagull' ? '#e8902a' : '#e8c040');
    if (Q.talon) { P.rect(cx + 1, cy + 3, 1, 2, '#e8c040'); P.rect(cx + 2, cy + 5, 2, 1, '#e8c040'); P.px(cx + 4, cy + 4, '#e8c040'); }
    if (Q.mouth) { P.px(Math.round(hx) + 3, cy, sp === 'bat' ? '#f0f0f0' : dk(beak, 0.15)); P.px(Math.round(hx) + 3, cy - 1, '#3a1418'); }
    if (Q.eyes) P.px(Math.round(hx) + 1, cy - 3, dk(head, 0.3));
    A.mouth = [Math.round(hx) + 3, cy - 1]; A.head = [Math.round(hx) - 1, cy - 4, 4, 4]; A.body = [cx - cfg.bl, cy - cfg.bh, cfg.bl * 2, cfg.bh * 2]; A.top = cy - 5; A.front = Math.round(hx) + 4; A.back = cx - cfg.bl - cfg.tail;
  } else {
    const cx = CX;
    if (B) { P.rect(cx - 1, cy + 2, 2, cfg.tail, tailC); if (sp === 'eagle' || sp === 'parrot') P.rect(cx - 2, cy + 3, 4, cfg.tail - 1, tailC); }
    P.ell(cx, cy, 2.2, cfg.bh + 1, body);
    P.shade();
    wingLine(cx - 2, cy - 1, -1, cfg.wing, wingC, tipC);
    wingLine(cx + 1, cy - 1, 1, cfg.wing, wingC, tipC);
    P.ell(cx, cy - cfg.bh - 1.5, 1.8, 1.8, head);
    if (sp === 'owl' && !B) { P.rect(cx - 2, cy - cfg.bh - 2, 4, 2, col2); P.px(cx - 2, cy - cfg.bh - 4, dk(body, 0.2)); P.px(cx + 1, cy - cfg.bh - 4, dk(body, 0.2)); }
    if (sp === 'owl' && B) { P.px(cx - 2, cy - cfg.bh - 4, dk(body, 0.2)); P.px(cx + 1, cy - cfg.bh - 4, dk(body, 0.2)); }
    if (sp === 'bat') { P.px(cx - 2, cy - cfg.bh - 4, body); P.px(cx + 1, cy - cfg.bh - 4, body); if (F) { P.px(cx - 1, cy - cfg.bh - 2, '#e03030'); P.px(cx, cy - cfg.bh - 2, '#e03030'); P.px(cx, cy - cfg.bh - 0, '#f0f0f0'); } }
    else if (sp === 'owl' && F) { P.px(cx - 2, cy - cfg.bh - 2, '#f0a020'); P.px(cx + 1, cy - cfg.bh - 2, '#f0a020'); P.px(cx, cy - cfg.bh - 1, beak); }
    else if (F) { P.px(cx - 1, cy - cfg.bh - 1, sp === 'eagle' ? '#e8a020' : '#141414'); P.px(cx + 1, cy - cfg.bh - 1, sp === 'eagle' ? '#e8a020' : '#141414'); P.rect(cx, cy - cfg.bh, 1, 2, beak); if (sp === 'parrot' || sp === 'eagle') P.px(cx - 1, cy - cfg.bh, beak); }
    if (F && mark === 'spot') P.rect(cx - 1, cy, 2, 1, dk(body, 0.2));
    if (F) P.rect(cx - 1, cy + cfg.bh + 1, 2, 1, sp === 'seagull' ? '#e8902a' : '#e8c040');
    if (F && Q.mouth) P.px(cx, cy - cfg.bh + 2, sp === 'bat' ? '#f0f0f0' : '#3a1418');
    if (F && Q.talon) { P.rect(cx - 2, cy + cfg.bh + 1, 1, 3, '#e8c040'); P.rect(cx + 1, cy + cfg.bh + 1, 1, 3, '#e8c040'); }
    A.mouth = [cx, cy - cfg.bh]; A.head = [cx - 2, Math.round(cy - cfg.bh - 3), 4, 4]; A.body = [cx - 3, Math.round(cy - cfg.bh), 6, Math.round(cfg.bh * 2)]; A.top = Math.round(cy - cfg.bh - 4); A.front = cx; A.back = cx;
  }
  return { grounded: false };
}

// 地上にとまった鳥（翼をたたむ）。ついばむ・水を飲む・眠る・休むときに使う。コウモリは翼で体を包む
function perchBird(P, o) {
  const { sp, view, body, head, wingC, tailC, beak, col2, cfg, mark } = o;
  const G = GROUND, S = view === 'S', F = view === 'F', B = view === 'B';
  const owl = sp === 'owl', bat = sp === 'bat', eagle = sp === 'eagle';
  const legL = bat ? 0 : owl ? 1 : 2;
  const rx = bat ? 2.2 : Math.max(2.4, cfg.bl * 0.72), ry = bat ? 3.2 : cfg.bh + (owl ? 1.6 : 1);
  const cy = G - legL - ry + 0.5 + (Q.sit ? legL : 0);
  const hg = Q.hg || 0;
  const eyeC = eagle ? '#e8a020' : owl ? '#f0a020' : bat ? '#e03030' : '#141414';
  if (S) {
    const cx = CX;
    const hx0 = cx + rx * 0.45, hy0 = cy - ry - (owl ? 0 : 0.6);
    const hx = hx0 + Math.round(hg * 3) + (Q.hdx || 0), hy = hy0 + Math.round(hg * (G - 2 - hy0)) + (Q.hdy || 0);
    // 尾（下向きに後ろへ）
    if (cfg.tail > 0) { P.line(cx - rx + 1, cy + 1, cx - rx - Math.round(cfg.tail * 0.5), cy + Math.round(ry) + 1, tailC); P.line(cx - rx + 2, cy + 1, cx - rx - Math.round(cfg.tail * 0.5) + 1, cy + Math.round(ry) + 1, tailC); }
    if (Q.wing) { const up = Q.wing > 0 ? -1 : 0.3; for (let i = 0; i < cfg.wing; i++) P.rect(cx - 1 - Math.round(i * 0.5), cy - 1 + Math.round(up * i * 0.9), 2, 1, dk(wingC, 0.18)); }
    P.ell(cx, cy, rx, ry, body);
    if (hg > 0.2) thick(P, cx + rx * 0.3, cy - ry * 0.4, hx, hy + 0.5, 1.2, head);
    P.ell(hx, hy, bat ? 1.6 : 1.9, bat ? 1.6 : 1.9, head);
    if (owl) P.rect(Math.round(hx) - 1, Math.round(hy) - 3, 1, 2, dk(body, 0.2));
    if (bat) { P.rect(Math.round(hx) - 1, Math.round(hy) - 3, 1, 2, body); }
    // たたんだ翼
    P.ell(cx - 0.6, cy + 0.2, rx * 0.85, ry * 0.72, wingC);
    P.line(cx - rx, cy + Math.round(ry * 0.5), cx - rx - 1, cy + Math.round(ry * 0.5) + 1, wingC);
    if (mark === 'bar') P.overRect(cx - 1, cy, 2, 1, lt(wingC, 0.12));
    if (owl) P.rect(Math.round(hx), Math.round(hy), 2, 2, col2);
    P.shade();
    if (Q.wing) { const up = Q.wing > 0 ? -1.1 : 0.2; for (let i = 0; i < cfg.wing; i++) { const x = cx - Math.round(i * 0.6), y = cy - 1 + Math.round(up * i * 0.9); P.rect(x, y, 2, 1, i >= cfg.wing - 2 ? dk(wingC, 0.15) : wingC); } }
    const X = Math.round(hx), Y = Math.round(hy);
    if (!bat) { P.px(X + 2, Y, beak); if (Q.mouth) { P.px(X + 3, Y - 1, beak); P.px(X + 3, Y + 1, dk(beak, 0.15)); } else P.px(X + (sp === 'seagull' || eagle || sp === 'parrot' ? 3 : 2), Y + 1, dk(beak, 0.12)); }
    else if (Q.mouth) P.px(X + 2, Y + 1, '#f0f0f0');
    P.px(X + 1, Y - 1, Q.eyes ? dk(head, 0.3) : eyeC);
    if (!Q.sit && legL) { const lc = bat ? body : '#e8c040'; P.rect(cx - 1, G - legL + 1, 1, legL - 1, dk(lc, 0.12)); P.rect(cx + 1, G - legL + 1, 1, legL - 1, lc); P.rect(cx - 2, G, 2, 1, dk(lc, 0.12)); P.rect(cx + 1, G, 2, 1, lc); }
    A.mouth = [X + 3, Y]; A.head = [X - 2, Y - 2, 4, 4]; A.body = [Math.round(cx - rx), Math.round(cy - ry), Math.round(rx * 2), Math.round(ry * 2)]; A.top = Y - 3; A.front = X + 3; A.back = Math.round(cx - rx - 1);
    return;
  }
  const cx = CX;
  const hy0 = cy - ry - 1.2, hy = hy0 + Math.round(hg * 4) + (Q.hdy || 0), hx = cx + (Q.hdx || 0);
  if (B && cfg.tail > 0) P.rect(cx - 1, cy + Math.round(ry) - 1, 2, Math.min(3, cfg.tail), tailC);
  if (Q.wing) { const up = Q.wing > 0 ? -0.9 : 0.4; for (const sg of [-1, 1]) for (let i = 0; i < cfg.wing; i++) P.rect(cx + sg * (Math.round(rx) + i) - (sg < 0 ? 1 : 0), cy - 2 + Math.round(up * i), 1, i < 2 ? 3 : 2, i >= cfg.wing - 2 ? dk(wingC, 0.15) : wingC); }
  P.ell(cx, cy, rx + (owl ? 0.8 : 0.3), ry, body);
  if (F && !bat) P.ell(cx, cy + 0.8, rx * 0.55, ry * 0.65, owl ? col2 : lt(body, 0.1));
  // 体の横にたたんだ翼
  if (!Q.wing) { P.rect(Math.round(cx - rx - 0.3), Math.round(cy - ry * 0.4), 1, Math.round(ry * 1.3), wingC); P.rect(Math.round(cx + rx - 0.7), Math.round(cy - ry * 0.4), 1, Math.round(ry * 1.3), wingC); }
  if (B) P.ell(cx, cy + 0.4, rx * 0.8, ry * 0.8, wingC);
  if (!(B && hg > 0.5)) P.ell(hx, hy, bat ? 1.6 : owl ? 2.2 : 1.8, bat ? 1.6 : owl ? 2 : 1.8, head);
  P.shade();
  const X = Math.round(hx), Y = Math.round(hy);
  if (owl || bat) { P.px(X - 2, Y - 2, bat ? body : dk(body, 0.2)); P.px(X + 1, Y - 2, bat ? body : dk(body, 0.2)); }
  if (F) {
    if (owl) { P.rect(X - 2, Y - 1, 4, 2, col2); }
    const ec = Q.eyes ? dk(head, 0.3) : eyeC;
    P.px(X - 1, Y - 1 + (owl ? 1 : 0), ec); P.px(X + (owl ? 1 : 1), Y - 1 + (owl ? 1 : 0), ec);
    if (!bat) { P.px(X, Y + (owl ? 1 : 0), beak); if (!owl) P.px(X, Y + 1, dk(beak, 0.1)); if (Q.mouth) P.px(X, Y + 2, '#3a1418'); }
    else if (Q.mouth) P.px(X, Y + 1, '#f0f0f0');
  }
  if (!Q.sit && legL && !B) { const lc = '#e8c040'; P.rect(cx - 1, G - legL + 1, 1, legL, lc); P.rect(cx + 1, G - legL + 1, 1, legL, lc); P.rect(cx - 2, G, 2, 1, lc); P.rect(cx + 1, G, 2, 1, lc); }
  A.mouth = [X, Y + 1]; A.head = [X - 2, Y - 2, 4, 4]; A.body = [Math.round(cx - rx), Math.round(cy - ry), Math.round(rx * 2), Math.round(ry * 2)]; A.top = Y - 3; A.front = cx; A.back = cx;
}

// ---------------------------------------------------------------- 海の生き物
function paintFish(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.02, ds = 0.08, dl = 0.07) => jit(hex, R, dh, ds, dl);
  const col = T(def.col), col2 = T(def.col2);
  const whale = sp === 'whale';
  const L = whale ? 44 + R.int(-2, 3) : 22 + R.int(-1, 1), H = whale ? 13 + R.int(0, 1) : 7;
  const u = []; for (let i = 0; i < 16; i++) u.push(R.f());
  const flick = Q.flick ?? (fr === 0 ? -1 : fr === 2 ? 1 : 0);
  const cy = 50;
  if (view === 'S') {
    const x0 = CX - Math.floor(L / 2);
    const fl = whale ? 6 : 4, tx = x0;
    for (let i = 0; i < fl; i++) { P.rect(tx - i - 2, cy - 1 - i + flick, 2, 1, col); P.rect(tx - i - 2, cy + i + flick, 2, 1, dk(col, 0.05)); } // 尾びれはV字
    P.rect(tx - 2, cy - 1, 4, 2, col);
    for (let x = 0; x < L; x++) {
      const t = x / L;
      const hh = whale ? H / 2 * Math.min(1, Math.pow(t * 1.6, 0.6)) * (t > 0.85 ? 1 - (t - 0.85) * 1.2 : 1) : H / 2 * Math.sin(Math.PI * Math.pow(t, 0.8)) + 0.4;
      const top = Math.round(cy - hh), bot = Math.round(cy + hh * (whale ? 0.9 : 0.8));
      P.rect(x0 + x, top, 1, bot - top + 1, col);
      for (let y = Math.round(cy + (whale ? 0 : 0.5)); y <= bot; y++) P.px(x0 + x, y, col2);
    }
    const fx = x0 + Math.round(L * (whale ? 0.35 : 0.45));
    let ftop = cy; for (let y = cy - H; y < cy; y++) if (P.get(fx, y)) { ftop = y; break; }
    if (whale) P.rect(fx, ftop - 1, 2, 1, col);
    else { const fh = 3 + Math.floor(u[0] * 2); for (let i = 0; i < fh; i++) P.rect(fx - Math.floor(i / 2), ftop - 1 - i, Math.max(1, 3 - i), 1, col); }
    if (whale) { P.line(x0 + Math.round(L * 0.62), cy + 3, x0 + Math.round(L * 0.5), cy + 8 + Math.floor(u[1] * 3), dk(col, 0.05)); P.line(x0 + Math.round(L * 0.63), cy + 4, x0 + Math.round(L * 0.52), cy + 8, dk(col, 0.05)); }
    else P.line(x0 + Math.round(L * 0.65), cy + 2, x0 + Math.round(L * 0.58), cy + 4, dk(col, 0.05));
    if (!whale) { P.rect(x0 + L, cy, 2, 1, col2); P.px(x0 + L, cy - 1, col); }
    P.shade();
    const nsc = Math.floor(u[2] * (whale ? 3 : 4));
    for (let i = 0; i < nsc; i++) { const x = x0 + 4 + Math.floor(u[3 + i] * (L - 10)), y = cy - Math.floor(H / 2) + 1 + Math.floor(u[7 + i] * (H / 2 - 1)); P.over(x, y, lt(col, 0.25)); P.over(x + 1, y + 1, lt(col, 0.25)); P.over(x + 2, y + 1, lt(col, 0.22)); }
    if (whale) {
      for (let x = x0 + Math.round(L * 0.55); x < x0 + L - 2; x += 2) for (let y = cy + 2; y < cy + H / 2; y++) P.over(x, y, dk(col2, 0.12));
      const nb = 1 + Math.floor(u[11] * 4);
      for (let i = 0; i < nb; i++) { const x = x0 + L - 12 + Math.floor(u[12 + (i % 4)] * 9), y = cy - Math.floor(H / 2) + 1 + (i % 3); P.over(x, y, '#c8c4b8'); P.over(x + 1, y, '#a8a498'); }
      P.line(x0 + L - 8, cy + 1, x0 + L - 1, cy + 1, dk(col, 0.25));
      if (Q.mouth) { P.line(x0 + L - 8, cy + 2, x0 + L - 1, cy + 2, '#5a2a30'); P.line(x0 + L - 8, cy + 3, x0 + L - 2, cy + 3, dk(col2, 0.1)); }
      P.px(x0 + L - 9, cy - 1, Q.eyes ? dk(col, 0.2) : '#141414');
      if (Q.spout || (u[13] < 0.35 && fr === 1 && !Q.anim)) { const sx = x0 + L - 10, sy = cy - Math.ceil(H / 2); P.rect(sx, sy - 2, 1, 2, '#d8f0ff'); P.px(sx - 1, sy - 3, '#d8f0ff'); P.px(sx + 1, sy - 3, '#d8f0ff'); P.px(sx, sy - 4, '#ffffff'); }
    } else {
      if (u[14] < 0.35) for (let i = 0; i < 2; i++) P.overRect(x0 + 4 + Math.floor(u[3 + i] * (L - 8)), cy - 2 + i, 2, 1, dk(col, 0.12));
      P.px(x0 + L - 3, cy - 1, Q.eyes ? dk(col, 0.2) : '#141414');
      P.px(x0 + L - 2, cy, dk(col2, 0.2));
      if (Q.mouth) { P.rect(x0 + L - 1, cy + 1, 3, 1, col2); P.px(x0 + L, cy, '#5a2a30'); P.px(x0 + L + 1, cy, '#5a2a30'); }
    }
    A.mouth = [x0 + L + 1, cy]; A.head = [x0 + L - 6, cy - 3, 6, 6]; A.body = [x0, cy - Math.ceil(H / 2), L, H]; A.top = cy - H; A.front = x0 + L + 2; A.back = x0 - 6; A.cy = cy;
    return { grounded: false };
  }
  // 正面・背中：丸い断面、胸びれ、背びれ。背中は水平の尾びれが見える
  const Wd = whale ? 16 : 7, Hd = whale ? 13 : 7;
  if (view === 'B') { const fw = whale ? 10 : 5; P.rect(CX - fw, cy + Hd / 2 + flick, fw * 2, 2, col); P.rect(CX - 1, cy + Hd / 2 - 1, 2, 2 + flick, col); }
  P.ell(CX, cy, Wd / 2, Hd / 2, col);
  for (let y = Math.round(cy); y <= cy + Hd / 2; y++) P.overRect(CX - Wd / 2, y, Wd, 1, col2);
  if (!whale) P.rect(CX - 1, cy - Hd / 2 - 3, 2, 3, col); else P.rect(CX - 1, cy - Hd / 2 - 1, 2, 1, col);
  P.line(CX - Wd / 2, cy + 1, CX - Wd / 2 - (whale ? 5 : 3), cy + 3 + flick, dk(col, 0.05));
  P.line(CX + Wd / 2 - 1, cy + 1, CX + Wd / 2 + (whale ? 4 : 2), cy + 3 - flick, dk(col, 0.05));
  P.shade();
  if (view === 'F') {
    const ec = Q.eyes ? dk(col, 0.2) : '#141414';
    P.px(CX - Wd / 2 + 1, cy - 1, ec); P.px(CX + Wd / 2 - 2, cy - 1, ec);
    if (!whale) { P.rect(CX - 1, cy + 1, 2, 2, col2); if (Q.mouth) P.rect(CX - 1, cy + 1, 2, 1, '#5a2a30'); } else { P.rect(CX - 5, cy + 2, 10, 1, dk(col, 0.25)); if (Q.mouth) P.rect(CX - 4, cy + 3, 8, 1, '#5a2a30'); }
  }
  A.mouth = [CX, cy + 1]; A.head = [CX - Wd / 2, cy - Hd / 2, Wd, Hd]; A.body = [CX - Wd / 2, cy - Hd / 2, Wd, Hd]; A.top = cy - Hd / 2 - 3; A.front = CX; A.back = CX; A.cy = cy;
  if (view === 'B' && whale && (Q.spout || (u[13] < 0.35 && fr === 1 && !Q.anim))) { P.rect(CX - 1, cy - Hd / 2 - 3, 2, 2, '#d8f0ff'); P.px(CX - 2, cy - Hd / 2 - 4, '#ffffff'); P.px(CX + 1, cy - Hd / 2 - 4, '#ffffff'); }
  return { grounded: false };
}

// ---------------------------------------------------------------- スライム
function paintBlob(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.03, ds = 0.1, dl = 0.07) => jit(hex, R, dh, ds, dl);
  const col = T(def.col), col2 = T(def.col2);
  const G = GROUND;
  const W0 = sp === 'kingslime' ? 30 : sp === 'bigslime' ? 20 : 13;
  const squish = R.range(-0.08, 0.1);
  const u = []; for (let i = 0; i < 14; i++) u.push(R.f());
  const eyes0 = pickU(['dot', 'dot', 'tall', 'tall', 'happy', 'sleepy', 'angry', 'big', 'big'], u[0]);
  const eyes = Q.eyes ? ({ closed: 'sleepy' }[Q.eyes] || Q.eyes) : eyes0;
  const mouth0 = pickU(['none', 'smile', 'smile', 'smile', 'open', 'tongue', sp === 'slime' ? 'smile' : 'fang', 'fang'], u[1]);
  const mouth = Q.mouth ? (typeof Q.mouth === 'string' ? Q.mouth : 'open') : mouth0;
  const deco = u[2] < 0.6 ? 'none' : pickU(['leaf', 'sprout', sp === 'slime' ? 'bow' : 'horn', 'horn'], u[3]);
  const inside = u[4] < 0.55 ? 'none' : pickU(['bone', 'coin', 'leaf', 'fish'], u[5]);
  // コマで伸び縮み（0:つぶれ 1:ふつう 2:のび）
  const W = Math.max(3, W0 + (Q.bw ?? (fr === 0 ? 2 : fr === 2 ? -1 : 0)));
  const Hh = Math.max(2, Math.round(W0 * (0.7 + squish)) + (Q.bh ?? (fr === 0 ? -2 : fr === 2 ? 1 : 0)));
  const cx = CX;
  for (let y = 0; y < Hh; y++) {
    const t = y / (Hh - 1);
    const hw = W / 2 * Math.sqrt(1 - Math.pow(1 - t, 2.2));
    const w = Math.max(2, Math.round(hw * 2));
    P.rect(cx - Math.floor(w / 2), G - Hh + 1 + y, w, 1, col);
  }
  const top = G - Hh + 1;
  for (let y = G - Math.floor(Hh * 0.35); y <= G; y++) for (let x = cx - W; x < cx + W; x++) if (P.get(x, y)) P.px(x, y, mix(col, col2, 0.35));
  for (let i = 0; i < 2; i++) { const x = cx - Math.floor(W / 3) + Math.floor(u[6 + i] * (W * 2 / 3)), y = top + Math.floor(Hh / 2) + Math.floor(u[8 + i] * (Hh / 2 - 2)); P.over(x, y, lt(col, 0.2)); P.over(x + 1, y, lt(col, 0.12)); }
  const ix = cx - 2 + Math.floor(u[10] * 4), iy = G - 3;
  const ins = { bone: ['#e8e4d8', '#e8e4d8', '#d8d4c8'], coin: ['#f0c840', '#d0a830'], leaf: ['#5ab040', '#4a9a30'], fish: ['#a8b8c8', '#a8b8c8'] }[inside];
  if (ins && view !== 'B') ins.forEach((c, i) => P.over(ix + i, iy, c));
  P.shade(1, 1.2);
  const hl = lt(col, 0.3);
  const hx = cx - Math.floor(W / 4) - (view === 'S' ? 1 : 0);
  P.over(hx - 1, top + 2, hl); P.over(hx, top + 1, hl); if (W > 16) { P.over(hx - 2, top + 3, hl); P.over(hx + 1, top + 1, '#ffffff'); P.over(hx - 1, top + 5, lt(col, 0.2)); }
  // 顔：正面は中央、横は前寄り、背中は無し
  if (view !== 'B') {
    const eyeY = top + Math.round(Hh * 0.42);
    const sep2 = W0 > 16 ? Math.round(W0 / 5) : 2;
    const ec = '#141420';
    const shift = (view === 'S' ? Math.round(W / 4) : 0) + (Q.hdx || 0);
    const exs = view === 'S' ? [cx + shift - 1, cx + shift + sep2] : [cx - sep2 - 1, cx + sep2];
    for (const x of exs) {
      if (eyes === 'dot') P.rect(x, eyeY, 1, 2, ec);
      if (eyes === 'tall') { P.rect(x, eyeY - 1, 1, 3, ec); P.px(x, eyeY - 1, '#ffffff'); }
      if (eyes === 'happy') { P.px(x - 1, eyeY + 1, ec); P.px(x, eyeY, ec); P.px(x + 1, eyeY + 1, ec); }
      if (eyes === 'sleepy') P.rect(x - 1, eyeY + 1, 2, 1, ec);
      if (eyes === 'angry') { P.rect(x, eyeY, 1, 2, ec); P.px(x === exs[0] ? x - 1 : x + 1, eyeY - 1, ec); }
      if (eyes === 'big') { P.rect(x, eyeY - 1, 2, 3, '#ffffff'); P.rect(x + (x === exs[0] && view !== 'S' ? 1 : view === 'S' ? 1 : 0), eyeY, 1, 2, ec); }
      if (eyes === 'x') { P.px(x - 1, eyeY - 1, ec); P.px(x + 1, eyeY - 1, ec); P.px(x, eyeY, ec); P.px(x - 1, eyeY + 1, ec); P.px(x + 1, eyeY + 1, ec); }
      if (eyes === 'wide') { P.rect(x, eyeY - 1, 2, 3, '#ffffff'); P.px(x + (view === 'S' ? 1 : 0), eyeY, ec); }
    }
    const my = eyeY + (W0 > 16 ? 4 : 3), mx = view === 'S' ? cx + shift + 1 : cx + (Q.hdx || 0);
    A.mouth = [mx, my];
    if (mouth === 'smile') { P.rect(mx - 1, my, 2, 1, ec); P.px(mx - 2, my - 1, ec); P.px(mx + 1, my - 1, ec); }
    if (mouth === 'open') P.rect(mx - 1, my - 1, 2, 2, '#3a1a2a');
    if (mouth === 'tongue') { P.rect(mx - 1, my - 1, 2, 1, ec); P.px(mx, my, '#e06080'); }
    if (mouth === 'fang') { P.rect(mx - 2, my - 1, 4, 1, ec); P.px(mx - 2, my, '#ffffff'); P.px(mx + 1, my, '#ffffff'); }
    if (mouth === 'big') { P.rect(mx - 2, my - 1, 4, 3, '#3a1a2a'); P.px(mx - 1, my + 1, '#e06080'); P.px(mx, my + 1, '#e06080'); }
  }
  A.col = col; A.top = top; A.body = [cx - Math.floor(W / 2), top, W, Hh]; A.head = [cx - Math.floor(W / 2), top, W, Hh]; A.front = cx + Math.ceil(W / 2); A.back = cx - Math.ceil(W / 2); if (!A.mouth) A.mouth = [cx, top + Math.round(Hh * 0.6)];
  if (sp === 'kingslime') {
    const cw = 10;
    P.rect(cx - cw / 2, top - 3, cw, 3, GOLD); for (let i = 0; i < 4; i++) P.rect(cx - cw / 2 + i * 3, top - 5, 1, 2, GOLD);
    P.rect(cx - cw / 2, top - 1, cw, 1, GOLD_D); P.rect(cx - 1, top - 2, 2, 1, '#d0303a'); P.px(cx - 4, top - 2, '#3a7ad8'); P.px(cx + 3, top - 2, '#3ab05a'); P.px(cx - cw / 2 + 1, top - 3, '#fff4a0');
  } else if (deco === 'leaf') { P.px(cx, top - 1, '#4a9a30'); P.rect(cx + 1, top - 2, 2, 1, '#5ab040'); }
  else if (deco === 'sprout') { P.rect(cx, top - 2, 1, 2, '#4a9a30'); P.px(cx - 1, top - 3, '#6ac050'); P.px(cx + 1, top - 3, '#6ac050'); }
  else if (deco === 'bow') { P.rect(cx + 2, top, 3, 1, '#e04070'); P.px(cx + 2, top - 1, '#e04070'); P.px(cx + 4, top - 1, '#e04070'); }
  else if (deco === 'horn') P.rect(cx, top - 2, 1, 2, lt(col2, 0.15));
  return { grounded: true };
}

// ---------------------------------------------------------------- 二足（人型の魔物）
// 正面・背中は左右対称、横は左向き。sym(k,…) は中心からk px外側の左右対称な飾りを、向きに合わせて置く
function rig(P, o, view, fr) {
  const S = view === 'S', B = view === 'B', F = view === 'F';
  const cx = CX, G = GROUND;
  const legH0 = o.legH;
  if (Q.sit || Q.crouch) o = { ...o, legH: Q.sit ? Math.min(o.legH, 1) : Math.max(1, o.legH - Q.crouch) };
  const s = Q.step ?? (fr === 0 ? -1 : fr === 2 ? 1 : 0);
  const step = Q.step != null ? Q.step !== 0 : fr !== 1;
  const bob = Q.bob ?? (step && o.legH > 2 && !o.float ? 1 : 0);
  const legTop = G - o.legH + 1 + bob;
  const tT = legTop - o.torsoH;
  const hT = tT - o.headH + (o.headSink || 0);
  const W = o.headW, tw = o.torsoW, aw = o.armW || 1;
  const sw = Math.max(3, Math.round(tw * 0.65)), sL = cx - Math.ceil(sw / 2);
  const hL = cx - W / 2;
  const lift = !step || S ? null : ((s === -1) === F ? 'L' : 'R');
  const legC = o.legCol || o.skin, footC = o.footCol, lw = o.legW;
  const gap = (o.legGap ?? 1) + (Q.wide || 0);
  const armC = o.armCol || o.skin, handC = o.handCol || o.skin;
  const armY = tT + (o.armDrop ?? 1);
  const arm = Q.arm || null, arms2 = Q.arms2 || null; // 武器を持つ腕の構え／両腕の構え
  const wSide = F ? 'R' : 'L';
  if (o.legH > 0) {
    if (!S) {
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? cx - gap - lw : cx + gap, up = lift === side ? 1 : 0;
        P.rect(x, legTop, lw, o.legH - bob - up, legC);
        if (footC) P.rect(side === 'L' ? x - (o.footOut || 0) : x, G - up, lw + (o.footOut || 0), 1, footC);
      }
      if (Q.sit) for (const side of [-1, 1]) { const x = side < 0 ? cx - gap - lw - 1 : cx + gap + 1; P.rect(x, G - 1, lw, 2, legC); if (footC) P.rect(x, G, lw, 1, footC); }
    } else if (Q.sit) {
      // 座る：腿を前へ投げ出す（横向きの前は画面左）
      const len = Math.max(2, legH0 - 1), th = Math.max(1, lw - 1);
      P.rect(cx - Math.ceil(lw / 2) - len, G - th + 1, len + lw, th, shadow(legC, 1.4));
      P.rect(cx - Math.ceil(lw / 2) - len + 1, G - th, len + lw, th, legC);
      if (footC) P.rect(cx - Math.ceil(lw / 2) - len, G - th - 1, 1, th + 1, footC);
    } else {
      const rows = o.legH - bob, stride = Math.min(3, Math.max(1, Math.floor(o.legH / 2)));
      const leg = (off, c, fc) => {
        for (let r = 0; r < rows; r++) P.rect(cx - Math.ceil(lw / 2) + Math.round(off * stride * (r + 1) / rows), legTop + r, lw, 1, c);
        if (fc) P.rect(cx - Math.ceil(lw / 2) + off * stride - 1, G, lw + 1, 1, fc);
      };
      leg(-s, shadow(legC, 1.4), footC && shadow(footC, 1));
      leg(s, legC, footC);
    }
  }
  // 腕を上げる（正面・背中）：肩から真上へ
  const upArm = (side) => { const ax = side === 'L' ? cx - tw / 2 - aw : cx + tw / 2; P.rect(ax, armY - o.armLen, aw, o.armLen + 1, armC); P.rect(ax, armY - o.armLen - 1, aw, 1, handC); return [ax, armY - o.armLen - 1]; };
  let hand = null;
  if (!S) {
    for (const side of ['L', 'R']) {
      const posed = (arms2 === 'up') || (side === wSide && (arm === 'up' || arm === 'back'));
      const late = (arms2 === 'fwd') || (side === wSide && (arm === 'across' || arm === 'fwd' || arm === 'down' || arm === 'mouth'));
      if (posed) { const h = upArm(side); if (side === wSide) hand = h; continue; }
      if (late) continue;
      const ax = side === 'L' ? cx - tw / 2 - aw : cx + tw / 2;
      P.rect(ax, armY, aw, o.armLen, armC);
      const sw2 = lift === side ? (side === 'L' ? 1 : -1) : 0;
      P.rect(ax + sw2, armY + o.armLen, aw, 1, handC);
    }
    P.rect(cx - tw / 2, tT, tw, o.torsoH, o.torsoCol || o.skin);
    // 胴の前を横切る腕（あとから描く）
    for (const side of ['L', 'R']) {
      const sg = side === 'L' ? -1 : 1, ax = side === 'L' ? cx - tw / 2 - aw : cx + tw / 2;
      if (arms2 === 'fwd') { const hx = side === 'L' ? cx - tw / 2 : cx + tw / 2 - aw; P.rect(ax, armY, aw, 2, armC); P.rect(hx, armY + 2, aw, 2, armC); P.rect(hx, armY + 4, aw, 1, handC); continue; }
      if (side !== wSide) continue;
      if (arm === 'across' || arm === 'fwd') { const half = Math.ceil(o.armLen / 2); P.rect(ax, armY, aw, half, armC); const x1 = cx - sg * 1; const xa = Math.min(ax, x1), xb = Math.max(ax + aw - 1, x1); P.rect(xa, armY + half, xb - xa + 1, aw, armC); P.rect(x1, armY + half, 1, aw, handC); hand = [x1, armY + half]; }
      if (arm === 'down') { P.rect(ax, armY, aw, o.armLen + 2, armC); P.rect(ax, armY + o.armLen + 2, aw, 1, handC); hand = [ax, armY + o.armLen + 2]; }
      if (arm === 'mouth') { const hx = cx + sg * 1 - (sg < 0 ? aw - 1 : 0), hy = hT + o.headH; thick(P, ax + (aw - 1) / 2, armY + 1, hx + (aw - 1) / 2, hy, (aw - 1) / 2 + 0.3, armC); P.rect(hx, hy, aw, 1, handC); hand = [hx, hy]; }
    }
  } else {
    if (arms2 === 'fwd') P.rect(cx - o.armLen - 1, armY, o.armLen + 1, aw, shadow(armC, 1.4)); // 奥の腕も前へ
    else if (arms2 === 'up') P.rect(cx, armY - o.armLen, aw, o.armLen, shadow(armC, 1.4));
    else P.px(s < 0 ? sL + sw : sL - 1, armY + o.armLen - 1, shadow(handC, 1.4)); // 奥の手
    P.rect(sL, tT, sw, o.torsoH, o.torsoCol || o.skin);
  }
  P.rect(hL, hT, W, o.headH, o.headCol || o.skin);
  if (o.headRound !== false) { P.clr(hL, hT); P.clr(hL + W - 1, hT); }
  const g = {
    view, S, B, F, cx, G, W, tw, sw, sL, hL, hR: hL + W - 1, hT, tT, legTop, armY, aw, bob,
    handY: armY + o.armLen,
    box: [cx - tw / 2, hT, cx + tw / 2, G],
    sym(k, y, w, h, c, reg = 'h', tag) {
      if (!c) return;
      if ((tag === 'face' || tag === 'noback') && B) return; if (tag === 'front' && !F) return; if (tag === 'back' && !B) return; if (tag === 'noside' && S) return; if (tag === 'side' && !S) return;
      if (!S) { P.rect(cx + k, y, w, h, c); P.rect(cx - k - w, y, w, h, c); return; }
      if (reg === 'h') P.rect(hL + k, y, w, h, c);
      else { const x = sL + Math.round(k * (sw - 1) / Math.max(1, tw / 2 - 1)); P.rect(x, y, Math.max(1, Math.round(w * sw / tw)), h, c); }
    },
    // 横向きの手前の腕は最後に描く
    finish() {
      if (!S) return;
      const ax = cx - Math.ceil(aw / 2) - 1;
      const pose = arms2 || arm;
      if (pose === 'up') { P.rect(ax, armY - o.armLen + 1, aw, o.armLen, armC); P.rect(ax, armY - o.armLen, aw, 1, handC); return; }
      if (pose === 'fwd' || pose === 'across') { P.rect(ax - o.armLen + 1, armY + 1, o.armLen + aw - 1, aw, armC); P.rect(ax - o.armLen, armY + 1, 1, aw, handC); return; }
      if (pose === 'back') { const k = Math.round(o.armLen * 0.7); thick(P, ax + (aw - 1) / 2, armY, ax + (aw - 1) / 2 + k, armY - k, (aw - 1) / 2 + 0.3, armC); P.rect(ax + k + 1, armY - k - 1, aw, 1, handC); return; }
      if (pose === 'mouth') { thick(P, ax + (aw - 1) / 2, armY, hL + 1 + (aw - 1) / 2, hT + o.headH - 1, (aw - 1) / 2 + 0.3, armC); P.rect(hL, hT + o.headH - 1, aw, 1, handC); return; }
      if (pose === 'down') { const k = Math.round(o.armLen * 0.6); thick(P, ax + (aw - 1) / 2, armY, ax - k + (aw - 1) / 2, armY + o.armLen, (aw - 1) / 2 + 0.3, armC); P.rect(ax - k - 1, armY + o.armLen + 1, aw, 1, handC); return; }
      for (let y = armY; y < armY + o.armLen; y++) P.rect(ax + (y > armY + 1 ? -s : 0), y, aw, 1, armC);
      P.rect(ax - s, armY + o.armLen, aw, 1, handC);
    },
  };
  // 武器を持つ手（正面は画面右、背中は画面左、横は手前）
  g.wx = F ? cx + tw / 2 + aw : B ? cx - tw / 2 - aw - 1 : cx - Math.ceil(aw / 2) - 2 - s;
  g.wdir = B ? -1 : 1;
  g.shieldX = F ? cx - tw / 2 - aw - 4 : B ? cx + tw / 2 + aw : null;
  if (S && (arm || arms2)) {
    const ax = cx - Math.ceil(aw / 2) - 1, pose = arms2 || arm, k7 = Math.round(o.armLen * 0.7), k6 = Math.round(o.armLen * 0.6);
    const hp = pose === 'mouth' ? [hL, hT + o.headH - 1] : pose === 'up' ? [ax, armY - o.armLen] : pose === 'fwd' || pose === 'across' ? [ax - o.armLen, armY + 1] : pose === 'back' ? [ax + k7 + 1, armY - k7 - 1] : pose === 'down' ? [ax - k6 - 1, armY + o.armLen + 1] : null;
    if (hp) { g.wx = hp[0] - 1; g.handY = hp[1]; }
  } else if (hand) { g.wx = F ? hand[0] + (arm === 'up' || arm === 'back' || arms2 === 'up' ? aw : 0) : hand[0] - 1; g.handY = hand[1]; }
  A.head = [hL, hT, W, o.headH]; A.neckY = tT; A.mouth = [S ? hL : cx, hT + Math.round(o.headH * 0.72)]; A.body = [cx - tw / 2, tT, tw, o.torsoH]; A.top = hT - 2;
  A.front = S ? hL - 1 : cx; A.back = S ? sL + sw : cx; A.hand = [g.wx, g.handY];
  return g;
}

// 武器を構えの角度（Q.wrot：時計回りの度）に回して描く。握りの位置 (x, y) が回転の中心
const WLEN = { club: 7, dagger: 3, spear: 14, sword: 7, rusty: 6, axe: 9, cleaver: 12, halberd: 18, trident: 12, greatsword: 18, sling: 4, skullstaff: 21, ankh: 15, darkstaff: 28, banana: 3 };
function weaponR(P, kind, x, y, big = 1, dir = 1, col2) {
  const len = (WLEN[kind] || 8) * (big > 1 && ['club', 'sword', 'axe'].includes(kind) ? big : 1);
  const rot = Q.wrot || 0;
  if (!rot) { weapon(P, kind, x, y, big, dir, col2); A.tip = [x, y - len]; A.grip = [x, y]; return; }
  const T0 = new Pix(P.w, P.h); weapon(T0, kind, x, y, big, dir, col2);
  const a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const b = T0.bbox(); if (!b) return;
  const R2 = Math.ceil(Math.hypot(Math.max(Math.abs(b[0] - x), Math.abs(b[2] - x)), Math.max(Math.abs(b[1] - y), Math.abs(b[3] - y)))) + 1;
  for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
    // 逆回転で元の画素を拾う（穴があかない）
    const sx = Math.round(x + dx * ca + dy * sa), sy = Math.round(y - dx * sa + dy * ca);
    const c = T0.raw(sx, sy); if (c) P.px(x + dx, y + dy, c);
  }
  A.tip = [Math.round(x + len * sa), Math.round(y - len * ca)]; A.grip = [x, y];
}

function weapon(P, kind, x, y, big = 1, dir = 1, col2 = '#c03030') {
  const wood = '#7a5230', steel = '#d8dce4';
  const b1 = big > 1 ? 1 : 0;
  switch (kind) {
    case 'club': P.rect(x, y - 5 * big, 1 + b1, 6 * big, wood); P.rect(x - 1, y - 6 * big, 2 + big, 2 + big, dk(wood, 0.1)); break;
    case 'dagger': P.rect(x, y - 3, 1, 3, steel); P.px(x, y, '#3a2616'); break;
    case 'spear': P.rect(x, y - 12, 1, 14, wood); P.rect(x, y - 14, 1, 2, steel); P.px(x - 1, y - 12, steel); P.px(x + 1, y - 12, steel); break;
    case 'sword': P.rect(x, y - 7 * big, 1 + b1, 7 * big, steel); P.rect(x - 1, y, 3 + b1, 1, '#c9a23a'); P.px(x, y + 1, '#3a2616'); break;
    case 'rusty': P.rect(x, y - 6, 1, 6, '#a8907a'); P.px(x, y - 4, '#8a5a3a'); P.rect(x - 1, y, 3, 1, '#5a4a3a'); break;
    case 'axe': P.rect(x, y - 8 * big, 1 + b1, 10 * big, wood); P.rect(dir > 0 ? x + 1 + b1 : x - 2 - big, y - 8 * big, 2 + big, 3 + big * 2, steel); break;
    case 'cleaver': P.rect(x, y - 2, 1, 4, wood); P.rect(x - 1, y - 12, 4, 10, '#b8bcc4'); P.rect(x - 1, y - 12, 1, 10, '#e8ecf4'); P.rect(x + 2, y - 9, 1, 2, '#8a3030'); break;
    case 'halberd': P.rect(x, y - 16, 1, 18, '#3a2a2a'); P.rect(dir > 0 ? x + 1 : x - 2, y - 14, 2, 4, '#9aa0b0'); P.px(x - dir, y - 13, '#9aa0b0'); P.rect(x, y - 18, 1, 2, '#c8ccd8'); break;
    case 'trident': P.rect(x, y - 9, 1, 11, '#3a2a2a'); P.rect(x - 1, y - 10, 3, 1, '#c8c8d0'); P.px(x - 1, y - 11, '#c8c8d0'); P.px(x + 1, y - 11, '#c8c8d0'); P.px(x, y - 12, '#c8c8d0'); break;
    case 'greatsword': P.rect(x, y - 18, 2, 18, '#c8ccd8'); P.rect(x, y - 18, 1, 18, '#eef0f8'); P.rect(x - 2, y, 6, 1, GOLD); P.rect(x, y + 1, 2, 2, '#3a2616'); P.rect(x, y - 10, 2, 1, '#d0303a'); break;
    case 'sling': P.line(x, y, x, y - 3, '#8a6a3a'); P.px(x - 1, y - 4, '#8a6a3a'); P.px(x + 1, y - 4, '#8a6a3a'); break;
    case 'skullstaff': P.rect(x, y - 16, 1, 19, '#5a4a3a'); P.rect(x - 1, y - 19, 3, 3, '#e8e4d8'); P.px(x - 1, y - 18, '#1a1a1a'); P.px(x + 1, y - 18, '#1a1a1a'); P.rect(x - 1, y - 21, 3, 2, col2); break;
    case 'ankh': P.rect(x, y - 10, 1, 12, GOLD); P.rect(x - 1, y - 11, 3, 1, GOLD); P.rect(x - 1, y - 14, 1, 3, GOLD); P.rect(x + 1, y - 14, 1, 3, GOLD); P.px(x, y - 15, GOLD); break;
    case 'darkstaff': P.rect(x, y - 24, 2, 28, '#2a1a2a'); P.rect(x - 2, y - 28, 6, 4, '#d9263a'); P.rect(x - 1, y - 27, 2, 2, '#ff8a8a'); P.px(x - 3, y - 29, '#5a2a5a'); P.px(x + 4, y - 29, '#5a2a5a'); break;
    case 'banana': P.rect(x - 1, y - 2, 2, 2, '#f0d040'); P.px(x, y - 3, '#6a8a2a'); break;
  }
}
function shieldAt(P, g, face, back = '#6a4a2a') {
  if (g.shieldX == null) return;
  if (g.F) { P.rect(g.shieldX, g.tT + 2, 4, 5, back); P.rect(g.shieldX + 1, g.tT + 3, 2, 3, face); P.px(g.shieldX + 1, g.tT + 3, lt(face, 0.2)); }
  else { P.rect(g.shieldX, g.tT + 2, 4, 5, dk(back, 0.1)); P.rect(g.shieldX + 1, g.tT + 4, 2, 1, dk(back, 0.25)); }
}
// 背中のマント（正面では肩の外に少し、横では背中側、背中では全面）
function capeOf(P, g, c, widen = 3, phase = 'before') {
  const top = g.tT, bot = g.G - 1;
  if (phase === 'before' && !g.B) {
    if (g.S) { for (let y = top; y <= bot; y++) P.rect(g.sL + g.sw, y, 2 + Math.floor((y - top) / 4), 1, c); }
    else for (let y = top; y <= bot; y++) { const w = g.tw / 2 + 1 + Math.floor((y - top) / widen); P.rect(g.cx - w - 1, y, 3, 1, c); P.rect(g.cx + w - 2, y, 3, 1, c); }
  }
  if (phase === 'after' && g.B) for (let y = top; y <= bot; y++) { const w = g.tw / 2 + 1 + Math.floor((y - top) / widen); P.rect(g.cx - w - 1, y, w * 2 + 2, 1, c); }
}
// コウモリの翼（歩行コマ＝羽ばたき）
function batWings(P, g, c, span, wh, fr, phase) {
  const flap = fr === 0 ? -2 : fr === 2 ? 2 : 0;
  const draw = (sgn, xs) => {
    for (let i = 0; i < span; i++) {
      const x = xs + sgn * i;
      const yt = g.tT - Math.round(Math.sin((i / span) * Math.PI * 0.8) * wh * 0.6) - Math.round(i * 0.3) + Math.round(flap * i / span);
      const yb2 = g.tT + Math.round(wh * 0.55) - (i % 4 === 0 ? 0 : 2) - Math.round(i * 0.25) + Math.round(flap * i / span);
      if (yb2 > yt) P.rect(x, yt, 1, yb2 - yt, c);
    }
    for (let i = 0; i < span; i += 4) P.over(xs + sgn * i, g.tT - 1 - Math.round(i * 0.3) + Math.round(flap * i / span), dk(c, 0.15));
  };
  if (g.S) { if (phase === 'before') draw(1, g.sL + g.sw - 1); return; }
  if ((phase === 'before' && g.F) || (phase === 'after' && g.B)) { draw(-1, g.cx - g.tw / 2 + 1); draw(1, g.cx + g.tw / 2 - 2); }
}
// 矢じりの尾
function arrowTail(P, g, c, tip, len, phase) {
  const ty = g.legTop;
  if (g.S && phase === 'before') { P.line(g.sL + g.sw, ty, g.sL + g.sw + len, ty + 2, c); P.line(g.sL + g.sw + len, ty + 2, g.sL + g.sw + len + 2, ty - 1, c); P.rect(g.sL + g.sw + len + 2, ty - 3, 2, 2, tip); return; }
  if (g.F && phase === 'before') { P.line(g.cx + 2, ty, g.cx + len, ty + 2, c); P.line(g.cx + len, ty + 2, g.cx + len + 2, ty - 1, c); P.rect(g.cx + len + 2, ty - 3, 2, 2, tip); }
  if (g.B && phase === 'after') { P.line(g.cx, ty - 1, g.cx + 1, ty + 3, c); P.line(g.cx + 1, ty + 3, g.cx + len, ty + 1, c); P.rect(g.cx + len, ty - 1, 2, 2, tip); }
}

function paintBiped(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.08) => jit(hex, R, dh, ds, dl);
  let col = T(def.col), col2 = T(def.col2);
  const u = []; for (let i = 0; i < 16; i++) u.push(R.f());
  const scarList = []; for (let i = 0; i < 3; i++) scarList.push([R.f(), R.f(), R.sgn()]);
  const scarN = Math.min(3, Math.floor(lv / 5) + (u[15] < 0.25 ? 1 : 0));
  let g;
  const S = view === 'S', F = view === 'F', B = view === 'B';
  switch (sp) {
    case 'goblin': case 'hobgoblin': case 'goblinlord': {
      const tier = sp === 'goblin' ? 0 : sp === 'hobgoblin' ? 1 : 2;
      const skin = col;
      const dims = [
        { headW: 8, headH: 7, torsoW: 6, torsoH: 5, legH: 3, legW: 2, armLen: 5 },
        { headW: 8, headH: 7, torsoW: 8, torsoH: 7, legH: 6, legW: 2, armLen: 7, armW: 2 },
        { headW: 10, headH: 8, torsoW: 12, torsoH: 9, legH: 7, legW: 3, armLen: 8, armW: 2 },
      ][tier];
      const leather = T('#6a4a2a');
      const cloth = T(tier === 2 ? '#8a1a22' : def.col2);
      const earL = 2 + Math.floor(u[0] * 3) + tier, torn = u[1] < 0.3;
      const eyeC = pickU(['#f0e040', '#f06020', '#e03030', '#80f040'], u[2]);
      const teeth = pickU(['both', 'left', 'right', 'many'], u[3]);
      const hair = pickU(['none', 'none', 'tuft', 'mohawk', tier === 0 ? 'band' : 'none'], u[4]);
      const paint = u[5] < 0.4 ? pickU(['#e03030', '#f0f0f0', '#3a6ae0'], u[6]) : null;
      const bones = u[7] < 0.35, helm = tier === 1 && u[8] < 0.5;
      const wk = tier === 0 ? pickU(['club', 'dagger', 'spear', 'sling'], u[9]) : tier === 1 ? pickU(['sword', 'spear', 'club', 'axe'], u[9]) : pickU(['axe', 'sword'], u[9]);
      if (tier === 2) capeOf(P, { ...rigPre(dims, view, fr) }, cloth, 3, 'before');
      g = rig(P, { ...dims, skin, torsoCol: tier === 0 ? skin : leather, footCol: tier ? '#3a2a1e' : dk(skin, 0.1), headSink: 1 }, view, fr);
      if (tier === 2) capeOf(P, g, cloth, 3, 'after');
      g.sym(0, g.legTop - 1, dims.torsoW / 2, 2, cloth, 't');
      if (!S) P.rect(g.cx - 1, g.legTop + 1, 2, 1, cloth);
      if (tier >= 1) { g.sym(dims.torsoW / 2 - 1, g.tT, 2, 2, tier === 2 ? GOLD : '#8a8e96', 't'); g.sym(0, g.tT + 1, 1, dims.torsoH - 2, tier === 2 ? '#c9a23a' : dk(leather, 0.1), 't', 'front'); }
      if (tier === 2) g.sym(0, g.tT + 2, 4, 3, '#d8b040', 't', 'front');
      if (tier === 2 && !B) g.sym(0, g.tT - 1, 5, 2, '#f0ece0', 't');
      const ey = g.hT + 3; A.eyeY = ey; A.mouth = [S ? g.hL : g.cx, ey + 3];
      // 耳は真横へ（横向きでは後ろへ）
      for (let i = 0; i < earL; i++) { if (torn && i === earL - 1) continue; g.sym(dims.headW / 2 + i, ey + (i >= earL - 1 ? 1 : 0), 1, 1, skin); }
      g.sym(dims.headW / 2, ey - 1, 1, 1, skin);
      if (S) P.rect(g.hL - 1, ey + 1, 1, 2, skin); // 突き出た鼻
      P.shade();
      g.sym(1 + (tier === 2 ? 1 : 0), ey, 1, 1, '#1a1a10', 'h', 'face'); g.sym(2 + (tier === 2 ? 1 : 0), ey, 1, 1, eyeC, 'h', 'face');
      g.sym(0, ey + 1, 1, 2, dk(skin, 0.12), 'h', 'face');
      const my = ey + 3;
      g.sym(0, my, 2, 1, '#2a1a1a', 'h', 'face');
      if (!B) { if (teeth !== 'right') P.px(S ? g.hL + 1 : g.cx - 2, my, '#f0ead0'); if (teeth !== 'left' && !S) P.px(g.cx + 1, my, '#f0ead0'); if (teeth === 'many' && !S) P.px(g.cx - 1, my, '#f0ead0'); }
      if (hair === 'tuft') { P.px(g.cx - 1, g.hT - 1, '#2a2a1a'); P.px(g.cx, g.hT - 2, '#2a2a1a'); P.px(g.cx + 1, g.hT - 1, '#2a2a1a'); }
      if (hair === 'mohawk') P.rect(g.cx - 1, g.hT - 2, 2, 3, '#2a1a1a');
      if (hair === 'band') { const bc = T(pickU(['#c03a3a', '#3a5ab0', '#e0c040'], u[10])); P.rect(g.hL, g.hT + 1, dims.headW, 1, bc); }
      if (paint) g.sym(2, ey + 1, 1, 2, paint, 'h', 'face');
      if (bones) g.sym(1, g.tT + 1, 1, 1, '#e8e4d0', 't', 'front');
      if (helm) { P.rect(g.hL, g.hT - 1, dims.headW, 2, '#7a7e86'); P.rect(g.cx - 1, g.hT - 2, 2, 1, '#7a7e86'); }
      if (tier === 2) { P.rect(g.cx - 4, g.hT - 3, 8, 2, GOLD); for (let i = 0; i < 4; i++) P.px(g.cx - 4 + i * 2 + (i > 1 ? 1 : 0), g.hT - 4, GOLD); if (!B) P.rect(g.cx - 1, g.hT - 2, 2, 1, '#d0303a'); }
      g.finish();
      weaponR(P, wk, g.wx + (dims.armW || 1) - 1, g.handY, tier === 2 ? 2 : 1, g.wdir);
      if (tier === 1 && u[11] < 0.4) shieldAt(P, g, cloth);
      break;
    }
    case 'orc': case 'orcking': {
      const king = sp === 'orcking';
      const skin = col;
      const dims = king ? { headW: 12, headH: 9, torsoW: 16, torsoH: 10, legH: 7, legW: 4, armLen: 9, armW: 3 } : { headW: 10, headH: 8, torsoW: 12, torsoH: 8, legH: 6, legW: 3, armLen: 7, armW: 3 };
      const leather = T(king ? '#4a3a3a' : def.col2);
      const metal = king ? '#d8b040' : '#8a8e96';
      const onePad = !king && u[0] < 0.5;
      const tl = king ? 3 : 1 + Math.floor(u[1] * 2), brokenTusk = u[2] < 0.15;
      const hair = pickU(['topknot', 'mohawk', 'bald', 'braids'], u[3]);
      const hc = T(pickU(['#1a1410', '#3a2a1a', '#5a4a3a'], u[4]));
      const eyeC = pickU(['#f0c020', '#e03020', '#f06020'], u[5]);
      const ring = u[6] < 0.3, paint = u[7] < 0.35;
      const wk = king ? 'cleaver' : pickU(['axe', 'club', 'cleaver'], u[8]);
      if (king) capeOf(P, rigPre(dims, view, fr), T('#6a1a1a'), 3, 'before');
      g = rig(P, { ...dims, skin, torsoCol: leather, legCol: dk(leather, 0.1), footCol: '#2a2020', headSink: 2 }, view, fr);
      if (king) capeOf(P, g, T('#6a1a1a'), 3, 'after');
      if (!S) { P.rect(g.cx + dims.torsoW / 2 - 1, g.tT - 1, dims.armW + 2, 3, metal); if (!onePad) P.rect(g.cx - dims.torsoW / 2 - dims.armW - 1, g.tT - 1, dims.armW + 2, 3, metal); }
      if (king) { g.sym(0, g.tT + 2, 5, 5, '#b8bcc4', 't', 'noback'); g.sym(0, g.tT + 2, 5, 1, GOLD, 't', 'noback'); g.sym(0, g.tT + 6, 5, 1, GOLD, 't', 'noback'); }
      g.sym(0, g.legTop - 1, dims.torsoW / 2, 1, '#2a1a10', 't');
      const ey = g.hT + 3; A.eyeY = ey; A.mouth = [S ? g.hL : g.cx, ey + 4];
      g.sym(dims.headW / 2, ey + 1, 1, 3, skin, 'h', 'noside'); // 横に張った顎
      if (S) { P.rect(g.hL - 1, ey + 1, 1, 3, skin); }
      P.shade();
      g.sym(2, ey, 1, 1, '#1a1010', 'h', 'face'); g.sym(3, ey, 1, 1, eyeC, 'h', 'face');
      g.sym(0, ey - 1, 3, 1, dk(skin, 0.18), 'h', 'face');
      g.sym(0, ey + 1, 1, 2, dk(skin, 0.1), 'h', 'face'); g.sym(0, ey + 2, 1, 1, '#2a1a10', 'h', 'face');
      const my = ey + 4;
      g.sym(0, my, 3, 1, '#2a1010', 'h', 'face');
      for (let i = 0; i < tl; i++) { if (!B) { if (S) P.px(g.hL, my - i, '#f0ead0'); else { P.px(g.cx - 3, my - i, '#f0ead0'); if (!(brokenTusk && i > 0)) P.px(g.cx + 2, my - i, '#f0ead0'); } } } // 下顎から上向きの牙
      if (hair === 'topknot') { P.rect(g.cx - 1, g.hT - 2, 2, 2, hc); P.px(g.cx, g.hT - 3, hc); }
      if (hair === 'mohawk') P.rect(g.cx - 1, g.hT - 2, 2, B ? dims.headH : 4, hc);
      if (hair === 'braids') g.sym(dims.headW / 2, ey, 1, 5, hc);
      if (ring) g.sym(dims.headW / 2 - 1, ey + 1, 1, 1, GOLD, 'h', 'face');
      if (paint) g.sym(1, ey - 2, 2, 1, T('#d03030'), 'h', 'face');
      if (king) { P.rect(g.cx - 5, g.hT - 3, 10, 3, GOLD); for (let i = 0; i < 5; i++) P.rect(g.cx - 5 + i * 2 + (i > 2 ? 1 : 0), g.hT - 5 + (i & 1), 1, 2 - (i & 1), GOLD); if (!B) P.rect(g.cx - 1, g.hT - 2, 2, 1, '#d0303a'); }
      if (S) { P.rect(g.cx - 1, g.tT - 1, dims.armW + 1, 3, metal); }
      g.finish();
      weaponR(P, wk, g.wx + dims.armW - 1, g.handY, king ? 2 : 1, g.wdir);
      break;
    }
    case 'skeleton': case 'skelknight': case 'lich': {
      const lich = sp === 'lich', knight = sp === 'skelknight';
      const bone = T(lich ? '#e8e4d8' : def.col, 0.01, 0.04, 0.05);
      const dark = '#1a1418';
      const eyeGlow = lich ? pickU(['#60f080', '#80e0ff', '#f06040'], u[0]) : knight ? pickU(['#60a0ff', '#40e0ff', '#a060ff'], u[0]) : u[1] < 0.4 ? pickU(['#f04040', '#60a0ff', '#f0c040'], u[0]) : null;
      const helmStyle = u[2] < 0.5, rustHelm = !lich && !knight && u[3] < 0.25, crack = u[4] < 0.3, crackSide = u[5] < 0.5;
      const noArm = !lich && !knight && u[6] < 0.12;
      const wk = knight ? 'sword' : pickU(['rusty', 'rusty', 'spear', 'club'], u[7]);
      const shield = !lich && (knight || u[8] < 0.25);
      if (lich) {
        const robe = col;
        const top = GROUND - 20, bobY = Q.bob ?? (fr === 1 ? 0 : 1); // 浮遊して上下する
        const up = Q.arm === 'up' || Q.arm === 'back' || Q.arms2 === 'up', fwd = Q.arm === 'fwd' || Q.arm === 'across' || Q.arms2 === 'fwd';
        const t0 = top + bobY;
        const L0 = { cx: CX, tT: t0, tw: 8, sL: CX - 3, sw: 6, G: GROUND - 1 + bobY, S, F, B };
        for (let y = t0; y <= GROUND - 1; y++) { const w = 4 + Math.floor((y - t0) / 3); if (S) P.rect(CX - 3 - Math.floor(w / 3), y, 6 + Math.floor(w / 2), 1, robe); else P.rect(CX - w, y, w * 2, 1, robe); }
        for (let x = CX - 12; x < CX + 12; x++) if (((x + 20 + fr) % 4) < 2) P.clr(x, GROUND - 1); // 波打つ裾
        if (!B) P.rect(S ? CX - 3 : CX - 1, t0 + 2, S ? 1 : 2, 16, dk(robe, 0.1));
        if (!S) { P.rect(CX - 6, t0 - 1, 3, 4, dk(robe, 0.05)); P.rect(CX + 3, t0 - 1, 3, 4, dk(robe, 0.05)); } else P.rect(CX + 1, t0 - 1, 3, 4, dk(robe, 0.05)); // 高い襟
        const hT = t0 - 7;
        g = { S, F, B, cx: CX, hT, hL: CX - 4, W: 8, tT: t0, handY: t0 + 10, box: [CX - 8, t0, CX + 8, GROUND] };
        if (!S) {
          const both = Q.arms2 === 'up';
          if (up && (F || both)) { P.rect(CX + 7, t0 - 3, 1, 7, robe); P.px(CX + 7, t0 - 4, bone); } else if (!(B && up)) { P.rect(CX + 7, t0 + 4, 1, 6, robe); P.px(CX + 7, t0 + 10, bone); }
          if (up && (B || both)) { P.rect(CX - 8, t0 - 3, 1, 7, robe); P.px(CX - 8, t0 - 4, bone); } else { P.rect(CX - 8, t0 + 4, 1, 6, robe); P.px(CX - 8, t0 + 10, bone); }
          if (B && up && !both) { P.rect(CX + 7, t0 + 4, 1, 6, robe); P.px(CX + 7, t0 + 10, bone); }
        }
        else if (up) { P.rect(CX - 5, t0 - 3, 2, 7, dk(robe, 0.06)); P.px(CX - 6, t0 - 4, bone); }
        else if (fwd) { P.rect(CX - 10, t0 + 3, 7, 2, dk(robe, 0.06)); P.px(CX - 11, t0 + 3, bone); }
        else { P.rect(CX - 4, t0 + 3, 2, 6, dk(robe, 0.06)); P.px(CX - 5, t0 + 9, bone); }
        g.wx = F ? CX + 8 : B ? CX - 9 : up ? CX - 7 : fwd ? CX - 12 : CX - 6; g.wdir = B ? -1 : 1;
        if (up) g.handY = t0 - 4; if (fwd && S) g.handY = t0 + 3;
        A.head = [CX - 4, hT, 8, 7]; A.neckY = t0; A.mouth = [S ? CX - 4 : CX, hT + 5]; A.body = [CX - 6, t0, 12, 18]; A.top = hT - 5; A.front = CX - 6; A.back = CX + 4; A.eyeY = hT + 2;
      } else {
        g = rig(P, { headW: 8, headH: 6, torsoW: 6, torsoH: 7, legH: 7, legW: 1, legGap: 1, armW: 1, armLen: 7, skin: bone, torsoCol: bone, footCol: bone, footOut: 1 }, view, fr);
        // 胴を肋骨に（背骨＋1px間隔の肋骨）
        const cxx = g.cx;
        if (!S) { P.clrRect(cxx - 3, g.tT, 6, 7); P.rect(cxx - 1, g.tT, 2, 7, bone); for (let y = g.tT + 1; y < g.tT + 5; y += 2) { P.rect(cxx - 3, y, 2, 1, bone); P.rect(cxx + 1, y, 2, 1, bone); } P.rect(cxx - 3, g.tT + 6, 6, 1, bone); P.rect(cxx - 4, g.tT, 1, 1, bone); P.rect(cxx + 3, g.tT, 1, 1, bone); }
        else { P.clrRect(g.sL, g.tT, g.sw, 7); P.rect(g.sL + g.sw - 1, g.tT, 1, 7, bone); for (let y = g.tT + 1; y < g.tT + 5; y += 2) P.rect(g.sL, y, g.sw - 1, 1, bone); P.rect(g.sL, g.tT + 6, g.sw, 1, bone); }
        if (!S) { P.clr(cxx - 2, g.legTop + 3); P.clr(cxx + 1, g.legTop + 3); } // 関節の隙間
        if (noArm && !S) P.clrRect(g.cx - 4, g.handY - 3, 1, 4);
      }
      const hT = g.hT, cx = g.cx;
      // 頭蓋骨：上が広く下が狭い
      P.clrRect(cx - 4, hT, 8, 6);
      if (!S) { P.rect(cx - 4, hT, 8, 4, bone); P.rect(cx - 3, hT + 4, 6, 2, bone); P.clr(cx - 4, hT); P.clr(cx + 3, hT); }
      else { P.rect(cx - 4, hT, 8, 4, bone); P.rect(cx - 4, hT + 4, 5, 2, bone); P.clr(cx - 4, hT); P.clr(cx + 3, hT); }
      if (knight) {
        const ac = col2;
        if (!S) { P.rect(cx - 4, hT - 1, 8, 3, ac); P.rect(cx - 5, hT, 1, 4, ac); P.rect(cx + 4, hT, 1, 4, ac); if (F) P.rect(cx - 1, hT + 2, 2, 3, ac); else P.rect(cx - 4, hT + 2, 8, 3, ac); }
        else { P.rect(cx - 4, hT - 1, 9, 3, ac); P.rect(cx, hT, 5, 5, ac); }
        if (helmStyle) { g.sym ? g.sym(5, hT - 2, 1, 1, lt(bone, 0.05)) : 0; if (!S) { P.px(cx - 6, hT - 2, lt(bone, 0.05)); P.px(cx + 5, hT - 2, lt(bone, 0.05)); P.px(cx - 7, hT - 3, lt(bone, 0.05)); P.px(cx + 6, hT - 3, lt(bone, 0.05)); } else { P.px(cx + 2, hT - 2, lt(bone, 0.05)); P.px(cx + 3, hT - 3, lt(bone, 0.05)); } }
        else P.rect(cx - 1, hT - 4, 2, 3, T('#b03030'));
        if (!S) { P.rect(cx - 3, g.tT, 6, 5, ac); P.rect(cx - 3, g.tT, 1, 5, lt(ac, 0.1)); P.rect(cx - 3, g.tT + 4, 6, 1, dk(ac, 0.2)); P.rect(cx - 5, g.tT - 1, 2, 3, lt(ac, 0.05)); P.rect(cx + 3, g.tT - 1, 2, 3, lt(ac, 0.05)); }
        else { P.rect(g.sL, g.tT, g.sw, 5, ac); P.rect(g.sL, g.tT + 4, g.sw, 1, dk(ac, 0.2)); }
      }
      if (rustHelm) P.rect(cx - 4, hT - 1, 8, 2, '#8a6a4a');
      P.shade(1, 1.2);
      // 眼窩は2x2の穴、光る目は自発光なので陰影なし
      if (!B) {
        if (!S) { P.rect(cx - 3, hT + 2, 2, 2, dark); P.rect(cx + 1, hT + 2, 2, 2, dark); if (eyeGlow) { P.px(cx - 2, hT + 2, eyeGlow); P.px(cx + 1, hT + 2, eyeGlow); } P.rect(cx - 1, hT + 4, 2, 1, dark); for (let x = cx - 2; x < cx + 2; x += 2) P.px(x, hT + 5, dark); }
        else { P.rect(cx - 3, hT + 2, 2, 2, dark); if (eyeGlow) P.px(cx - 3, hT + 2, eyeGlow); P.px(cx - 4, hT + 4, dark); P.px(cx - 3, hT + 5, dark); P.px(cx - 1, hT + 5, dark); }
        if (crack && !knight) { const sx = crackSide ? cx - 3 : cx + 1; P.px(sx, hT + 1, dark); P.px(sx + 1, hT, dark); }
      } else if (crack) P.rect(cx, hT + 1, 1, 2, dark);
      if (lich) {
        P.rect(cx - 4, hT - 3, 8, 2, GOLD); for (let i = 0; i < 3; i++) P.px(cx - 4 + i * 3 + (i > 1 ? 1 : 0), hT - 4, GOLD); if (!B) P.rect(cx - 1, hT - 2, 2, 1, eyeGlow);
        weaponR(P, 'skullstaff', g.wx, g.handY, 1, g.wdir, eyeGlow);
        for (let i = 0; i < 3; i++) { const x = CX - 9 + Math.floor(u[9 + i] * 18), y = GROUND - 2 - Math.floor(u[12 + i] * 14) - fr; P.rect(x, y, 1, 2, eyeGlow); } // 漂う魂
      } else {
        g.finish && g.finish();
        weaponR(P, wk, g.wx, g.handY, 1, g.wdir);
        if (shield) shieldAt(P, g, knight ? T('#3a3a5a') : '#8a6a4a', knight ? '#4a4a5a' : '#6a4a2a');
      }
      break;
    }
    case 'mummy': case 'pharaoh': {
      const ph = sp === 'pharaoh';
      const eg = pickU(ph ? ['#60e0ff', '#f0f080', '#ff6040'] : ['#f04030', '#f0c030', '#60e0ff'], u[0]);
      if (ph) {
        // ファラオの亡霊：ネメス頭巾・金の仮面・胸飾り・消えていく裾（接地しない）
        const bobY = Q.bob ?? (fr === 1 ? 0 : fr === 0 ? -1 : 1);
        const top = GROUND - 18 + bobY;
        const up = Q.arm === 'up' || Q.arm === 'back' || Q.arms2 === 'up';
        const body = T('#e8e0c8', 0.01, 0.03, 0.04);
        for (let y = top; y <= GROUND - 1; y++) { const t = (y - top) / 18; const w = Math.round((S ? 4 : 6) - t * 3); P.rect(CX - w, y, w * 2, 1, t > 0.6 ? mix(body, '#a0c8e8', Math.min(1, (t - 0.6) * 2)) : body); }
        for (let x = CX - 4; x < CX + 4; x++) if ((x + fr) & 1) P.clr(x, GROUND - 1);
        if (!B) { if (S) P.rect(CX - 4, top, 6, 3, GOLD); else { P.rect(CX - 6, top, 12, 3, GOLD); for (let x = CX - 6; x < CX + 6; x += 2) P.px(x, top + 1, col); } }
        else P.rect(CX - 6, top, 12, 1, GOLD);
        if (!S) { P.rect(CX - 7, top + 1 - (up && B ? 8 : 0), 1, 6, body); P.rect(CX + 6, top + 1 - (up && !B ? 8 : 0), 1, 6, body); } else P.rect(CX - 1 - (up ? 3 : 0), top + 1 - (up ? 7 : 0), 1, 6, body);
        const hT = top - 9;
        if (!S) { P.rect(CX - 5, hT, 10, 9, col); P.rect(CX - 6, hT + 3, 1, 7, col); P.rect(CX + 5, hT + 3, 1, 7, col); P.rect(CX - 7, hT + 5, 1, 5, col); P.rect(CX + 6, hT + 5, 1, 5, col); for (let y = hT + 1; y < hT + 10; y += 2) { P.rect(CX - 7, y, 4, 1, GOLD); P.rect(CX + 3, y, 4, 1, GOLD); } }
        else { P.rect(CX - 4, hT, 9, 9, col); P.rect(CX + 2, hT + 3, 3, 8, col); for (let y = hT + 1; y < hT + 11; y += 2) P.rect(CX + 1, y, 4, 1, GOLD); }
        if (B) { for (let y = hT + 1; y < hT + 9; y += 2) P.rect(CX - 5, y, 10, 1, GOLD); P.rect(CX - 1, hT + 9, 2, 3, col); }
        if (F) { P.rect(CX - 3, hT + 2, 6, 6, GOLD); P.rect(CX - 1, hT + 8, 2, 2, '#3a5a9a'); }
        if (S) { P.rect(CX - 4, hT + 2, 4, 6, GOLD); P.px(CX - 5, hT + 5, GOLD); P.rect(CX - 4, hT + 8, 2, 2, '#3a5a9a'); }
        if (!B) { P.rect(CX - 1, hT - 1, 2, 1, GOLD); P.px(S ? CX - 2 : CX - 1, hT - 2, '#3aa060'); }
        P.shade();
        if (F) { P.rect(CX - 3, hT + 4, 2, 1, '#1a1a2a'); P.rect(CX + 1, hT + 4, 2, 1, '#1a1a2a'); P.px(CX - 2, hT + 4, eg); P.px(CX + 1, hT + 4, eg); }
        if (S) { P.rect(CX - 4, hT + 4, 2, 1, '#1a1a2a'); P.px(CX - 4, hT + 4, eg); }
        weaponR(P, 'ankh', F ? CX + 8 : B ? CX - 9 : CX - 6, top + 7 - (up ? 9 : 0), 1, B ? -1 : 1);
        g = { box: [CX - 5, top, CX + 5, GROUND - 3] };
        A.head = [CX - 5, hT, 10, 9]; A.neckY = top; A.mouth = [S ? CX - 4 : CX, hT + 7]; A.body = [CX - 6, top, 12, 18]; A.top = hT - 3; A.front = CX - 6; A.back = CX + 4; A.eyeY = hT + 4;
        break;
      }
      const wrap = T(def.col, 0.01, 0.05, 0.05);
      const hang = u[1] < 0.5 ? -1 : 1, headBand = u[2] < 0.5, one = u[3] < 0.5, mouthHole = u[4] < 0.3;
      g = rig(P, { headW: 7, headH: 7, torsoW: 8, torsoH: 7, legH: 6, legW: 2, armW: 1, armLen: 6, skin: wrap, footCol: dk(wrap, 0.1), armDrop: 0 }, view, fr);
      // 包帯の段（2行ごと、ところどころ途切れる）
      for (let y = g.hT; y <= GROUND; y += 2) for (let x = CX - 8; x < CX + 8; x++) if (((x + y) % 5) !== 0) P.over(x, y, dk(wrap, 0.1));
      if (!S) { const hx = hang > 0 ? CX + 4 : CX - 5; P.rect(hx, g.handY + 1, 1, 3, wrap); P.px(hx + hang, g.handY + 3 + (fr === 1 ? 0 : 1), wrap); }
      else P.rect(g.sL + g.sw, g.tT + 2, 1 + (fr === 1 ? 0 : 1), 1, wrap);
      if (headBand && !S) { P.rect(CX + 3, g.hT + 2, 1, 4, wrap); P.px(CX + 4, g.hT + 5, wrap); }
      P.shade();
      const ey = g.hT + 3; A.eyeY = ey;
      if (F) { P.rect(CX - 3, ey, 2, 1, '#1a1410'); P.rect(CX + 1, ey, 2, 1, one ? dk(wrap, 0.1) : '#1a1410'); P.px(CX - 2, ey, eg); if (!one) P.px(CX + 1, ey, eg); if (mouthHole) P.rect(CX - 1, ey + 2, 2, 1, '#1a1410'); }
      if (S) { P.rect(g.hL, ey, 2, 1, '#1a1410'); P.px(g.hL + 1, ey, eg); }
      g.finish();
      break;
    }
    case 'imp': case 'demonsoldier': case 'demongeneral': case 'demonlord': {
      const tier = { imp: 0, demonsoldier: 1, demongeneral: 2, demonlord: 3 }[sp];
      const skin = tier === 0 ? col : T(tier === 3 ? '#6a3a6a' : '#8a5a7a');
      const armor = col, accent = col2;
      const dims = [
        { headW: 8, headH: 7, torsoW: 6, torsoH: 5, legH: 3, legW: 2, armLen: 4 },
        { headW: 8, headH: 7, torsoW: 10, torsoH: 8, legH: 7, legW: 3, armLen: 7, armW: 2 },
        { headW: 10, headH: 8, torsoW: 14, torsoH: 10, legH: 8, legW: 4, armLen: 9, armW: 3 },
        { headW: 12, headH: 10, torsoW: 20, torsoH: 16, legH: 10, legW: 5, armLen: 13, armW: 4 },
      ][tier];
      const hornC = T(tier === 3 ? '#2a2020' : tier >= 1 ? '#d8d0c0' : '#3a2020', 0.01, 0.05, 0.05);
      const hl = [2, 3, 5, 9][tier] + Math.floor(u[0] * 2);
      const hornStyle = tier === 3 ? 'ram' : pickU(['out', 'up', 'curl'], u[1]);
      const eg = tier === 3 ? '#ff3040' : pickU(['#ff4030', '#f0d020', '#ff8020', '#c040ff'], u[2]);
      const wk1 = pickU(['halberd', 'sword', 'axe'], u[3]);
      const pre = rigPre(dims, view, fr);
      const wingC = tier === 3 ? T('#2a1030') : dk(skin, 0.15);
      const capeC = T(tier === 3 ? '#8a1020' : '#7a1a2a');
      if (tier === 0 || tier === 3) batWings(P, pre, wingC, tier === 3 ? 22 : 7, tier === 3 ? 18 : 6, fr, 'before');
      if (tier >= 2) capeOf(P, pre, capeC, 3, 'before');
      if (tier <= 1 || tier === 3) arrowTail(P, pre, skin, accent, 6 + tier, 'before');
      g = rig(P, { ...dims, skin, torsoCol: tier === 0 ? skin : armor, legCol: tier === 0 ? skin : dk(armor, 0.08), armCol: tier === 0 ? skin : armor, handCol: skin, footCol: tier === 0 ? dk(skin, 0.2) : '#1a1018' }, view, fr);
      if (tier >= 2) capeOf(P, g, capeC, 3, 'after');
      if (tier === 0 || tier === 3) batWings(P, g, wingC, tier === 3 ? 22 : 7, tier === 3 ? 18 : 6, fr, 'after');
      if (tier <= 1 || tier === 3) arrowTail(P, g, skin, accent, 6 + tier, 'after');
      if (tier >= 1) {
        const trim = tier >= 2 ? GOLD : accent;
        if (!S) { P.rect(g.cx - dims.torsoW / 2 - dims.armW, g.tT - 1, dims.armW + 2, 3, lt(armor, 0.08)); P.rect(g.cx + dims.torsoW / 2 - 2, g.tT - 1, dims.armW + 2, 3, lt(armor, 0.08)); }
        g.sym(dims.torsoW / 2 + dims.armW - 1, g.tT - 2, 1, 1, trim, 't', 'noside');
        if (tier >= 2) g.sym(dims.torsoW / 2 + dims.armW, g.tT - 3, 1, 1, trim, 't', 'noside');
        g.sym(0, g.tT + 1, 1, dims.torsoH - 2, trim, 't', 'front');
        g.sym(0, g.legTop - 1, dims.torsoW / 2, 1, trim, 't');
        if (tier >= 2) { g.sym(0, g.tT + 3, 2, 3, accent, 't', 'front'); }
        if (S) P.rect(g.sL - 1, g.tT - 1, dims.armW + 2, 3, lt(armor, 0.08));
      }
      P.shade();
      const hT = g.hT;
      if (!S) { P.clr(g.hL, hT + dims.headH - 1); P.clr(g.hR, hT + dims.headH - 1); P.clr(g.hL + 1, hT + dims.headH - 1); P.clr(g.hR - 1, hT + dims.headH - 1); } // 尖った顎
      else P.clr(g.hR, hT + dims.headH - 1);
      if (tier >= 1 && tier <= 2) { P.rect(g.hL, hT, dims.headW, 3, armor); if (!S) { P.rect(g.hL, hT + 3, 1, 3, armor); P.rect(g.hR, hT + 3, 1, 3, armor); } else P.rect(g.hL + 3, hT + 3, dims.headW - 3, 3, armor); if (B) P.rect(g.hL, hT, dims.headW, dims.headH - 1, armor); }
      // 角：頭頂の左右から外向きに
      for (let i = 0; i < hl; i++) {
        let dx, dy;
        if (hornStyle === 'out') { dx = i; dy = -Math.floor(i * 0.6); }
        else if (hornStyle === 'up') { dx = Math.floor(i * 0.4); dy = -i; }
        else if (hornStyle === 'curl') { dx = Math.round(Math.sin(i / hl * 2.4) * hl * 0.5); dy = -Math.round((1 - Math.cos(i / hl * 2.4)) * hl * 0.35) - Math.floor(i / 2); }
        else { dx = Math.round(Math.sin(i / hl * 3.2) * hl * 0.45) + Math.floor(i * 0.2); dy = -Math.round(Math.sin(i / hl * 2.2) * hl * 0.55); }
        const w = i < hl / 2 && tier >= 2 ? 2 : 1;
        g.sym(dims.headW / 2 - 2 + dx, hT - 1 + dy, w, 1 + (i < 2 && tier >= 2 ? 1 : 0), i === hl - 1 ? lt(hornC, 0.2) : hornC);
      }
      const ey = hT + Math.round(dims.headH * 0.45); A.eyeY = ey; A.mouth = [S ? g.hL : g.cx, ey + (tier === 3 ? 3 : 2)];
      g.sym(1 + (tier >= 2 ? 1 : 0), ey, tier >= 2 ? 2 : 1, 1, eg, 'h', 'face');
      if (tier === 3) { g.sym(1, ey - 1, 4, 1, '#1a0a10', 'h', 'face'); }
      const my = ey + (tier === 3 ? 3 : 2);
      g.sym(0, my, 1 + (tier >= 2 ? 1 : 0), 1, '#1a0a10', 'h', 'face');
      if (tier === 0 || tier === 3) g.sym(tier === 3 ? 1 : 0, my, 1, 1, '#f0f0f0', 'h', 'face');
      if (tier === 3) {
        P.rect(g.cx - 5, hT - 3, 10, 2, GOLD); for (let i = 0; i < 5; i++) P.rect(g.cx - 5 + i * 2 + (i > 2 ? 1 : 0), hT - 5 + (i === 2 ? -1 : 0), 1, 2 + (i === 2 ? 1 : 0), GOLD);
        if (!B) P.rect(g.cx - 1, hT - 2, 2, 1, '#ff2030');
        for (let i = 0; i < 10; i++) { const a = u[i % 16] * Math.PI * 2 + i * 0.63, r = 20 + (u[(i + 5) % 16]) * 5; const x = CX + Math.cos(a) * r, y = GROUND - 24 + Math.sin(a) * r * 0.9 - fr; P.rect(x, y - 1, 1, 2, i & 1 ? '#c02040' : '#801030'); } // 闇のオーラ
      }
      g.finish();
      if (tier === 0) weaponR(P, 'trident', g.wx, g.handY, 1, g.wdir);
      if (tier === 1) weaponR(P, wk1, g.wx + dims.armW - 1, g.handY, 1, g.wdir);
      if (tier === 2) weaponR(P, 'greatsword', g.wx + dims.armW - 1, g.handY, 1, g.wdir);
      if (tier === 3) weaponR(P, 'darkstaff', g.wx + dims.armW - 1, g.handY - 2, 1, g.wdir);
      break;
    }
    case 'golem': {
      // 直線と直角だけで組む。首は無く、脚は短い
      const stone = col, rune = col2;
      const dims = { headW: 8, headH: 6, torsoW: 16, torsoH: 11, legH: 6, legW: 5, armLen: 12, armW: 5, legGap: 2 };
      const cracks = []; for (let i = 0; i < 4; i++) cracks.push([u[i], u[i + 4]]);
      const moss = u[8] < 0.5, mossX = u[9];
      const rs = pickU(['bar', 'cross', 'diamond'], u[10]);
      g = rig(P, { ...dims, skin: stone, headSink: 2, footCol: dk(stone, 0.08), headRound: false }, view, fr);
      if (!S) { const fy = Q.arms2 === 'up' ? g.armY - dims.armLen - 2 : g.handY - 2; P.rect(g.cx - 9 - dims.armW + 3, g.tT - 1, dims.armW + 2, 4, lt(stone, 0.05)); P.rect(g.cx + 7, g.tT - 1, dims.armW + 2, 4, lt(stone, 0.05)); P.rect(g.cx - 8 - dims.armW + 2, fy, dims.armW + 1, 3, dk(stone, 0.05)); P.rect(g.cx + 8, Q.arm === 'up' ? g.handY - 2 : fy, dims.armW + 1, 3, dk(stone, 0.05)); }
      for (const [a, b] of cracks) { const x = g.cx - 7 + Math.floor(a * 13), y = g.tT + 1 + Math.floor(b * 14); P.over(x, y, dk(stone, 0.2)); P.over(x, y + 1, dk(stone, 0.2)); P.over(x + 1, y + 1, dk(stone, 0.18)); }
      if (moss) { const mx = g.cx - 8 + Math.floor(mossX * 12); P.overRect(mx, g.tT, 3, 1, '#5a8a3a'); P.overRect(mx + 1, g.tT + 1, 2, 1, '#4a7a2a'); P.overRect(g.hL + 1, g.hT, 3, 1, '#5a8a3a'); }
      P.shade(1, 1.4);
      g.sym(1, g.hT + 2, 2, 1, rune, 'h', 'face');
      if (!B) {
        const rx = S ? g.sL : g.cx - 1;
        if (rs === 'bar') P.rect(rx, g.tT + 3, 2, 4, rune);
        if (rs === 'cross') { P.rect(rx, g.tT + 2, 2, 5, rune); if (!S) P.rect(g.cx - 3, g.tT + 4, 6, 1, rune); }
        if (rs === 'diamond') { P.rect(rx, g.tT + 2, 2, 1, rune); P.rect(S ? rx : rx - 1, g.tT + 3, S ? 2 : 4, 2, rune); P.rect(rx, g.tT + 5, 2, 1, rune); }
      } else P.rect(g.cx - 3, g.tT + 3, 6, 1, dk(stone, 0.15));
      A.eyeY = g.hT + 2;
      if (S) { g.finish(); P.rect(Q.arm || Q.arms2 ? g.wx - 1 : g.cx - 4 + (fr === 0 ? 1 : fr === 2 ? -1 : 0), Q.arm || Q.arms2 ? g.handY - 1 : g.handY - 2, dims.armW + 1, 3, dk(stone, 0.05)); }
      break;
    }
    case 'monkey': {
      const face = col2;
      const banana = u[0] < 0.4, tuft = u[1] < 0.25, tailUp = u[2] < 0.5;
      const pre = rigPre({ headW: 8, headH: 7, torsoW: 6, torsoH: 5, legH: 3 }, view, fr);
      const tailDraw = () => { const bx = S ? pre.sL + pre.sw : CX + 3, by = GROUND - 2; const sw = fr === 1 ? 0 : fr === 0 ? 1 : -1; P.line(bx, by, bx + 4, by - 1, col); P.line(bx + 4, by - 1, bx + 5, by - 6 + sw, col); P.line(bx + 5, by - 6 + sw, bx + 3, by - 8 - (tailUp ? 1 : 0) + sw, col); };
      if (!B) tailDraw();
      g = rig(P, { headW: 8, headH: 7, torsoW: 6, torsoH: 5, legH: 3, legW: 2, armW: 1, armLen: 6, skin: col, handCol: face, footCol: face }, view, fr);
      if (B) tailDraw();
      g.sym(4, g.hT + 3, 1, 2, col, 'h', 'noside'); g.sym(5, g.hT + 3, 1, 1, face, 'h', 'noside');
      if (S) P.rect(g.hL + 5, g.hT + 3, 1, 2, face);
      if (!B) { if (!S) { P.rect(g.cx - 3, g.hT + 2, 6, 4, face); P.px(g.cx - 2, g.hT + 1, face); P.px(g.cx + 1, g.hT + 1, face); P.rect(g.cx - 2, g.tT + 1, 4, 3, lt(face, 0.02)); } else { P.rect(g.hL - 1, g.hT + 2, 4, 4, face); P.rect(g.sL, g.tT + 1, 2, 3, face); } }
      P.shade();
      A.eyeY = g.hT + 3; A.mouth = [S ? g.hL - 1 : g.cx, g.hT + 5];
      if (F) { P.px(g.cx - 2, g.hT + 3, '#1a1410'); P.px(g.cx + 1, g.hT + 3, '#1a1410'); P.rect(g.cx - 1, g.hT + 5, 2, 1, dk(face, 0.2)); }
      if (S) { P.px(g.hL, g.hT + 3, '#1a1410'); P.px(g.hL - 1, g.hT + 5, dk(face, 0.2)); }
      if (tuft) P.rect(g.cx - 3, g.hT - 1, 6, 1, dk(col, 0.2));
      g.finish();
      if (banana) weaponR(P, 'banana', g.wx, g.handY, 1, g.wdir);
      break;
    }
    case 'penguin': {
      const back = col, belly = col2;
      const H = 15 + Math.floor(u[0] * 2), emp = u[1] < 0.4, smudge = u[2] < 0.3;
      const top = GROUND - H + 1;
      const wob = Q.step ?? (fr === 0 ? -1 : fr === 2 ? 1 : 0); // よちよち左右に揺れる
      const cx = CX + (S ? 0 : wob);
      for (let y = top; y <= GROUND - 1; y++) { const t = (y - top) / H; const w = Math.round(3 + Math.sin(t * Math.PI * 0.9) * 3); if (S) P.rect(cx - w + 1, y, w * 2 - 2, 1, back); else P.rect(cx - w, y, w * 2, 1, back); }
      if (F) { for (let y = top + 5; y <= GROUND - 2; y++) { const t = (y - top) / H; const w = Math.round(1 + Math.sin(t * Math.PI * 0.85) * 3); P.rect(cx - w, y, w * 2, 1, belly); } P.rect(cx - 3, top + 3, 2, 2, belly); P.rect(cx + 1, top + 3, 2, 2, belly); }
      if (S) { for (let y = top + 5; y <= GROUND - 2; y++) P.rect(cx - 4, y, 3, 1, belly); P.rect(cx - 3, top + 3, 2, 2, belly); }
      const flp = Q.arms2 === 'up' || Q.arm === 'up' ? 1 : Q.arms2 === 'fwd' || Q.arm === 'fwd' || Q.arm === 'across' ? 2 : 0; // ひれを広げる・前へ
      if (!S) { if (flp === 1) { P.line(cx - 6, top + 6, cx - 9, top + 2, dk(back, 0.05)); P.line(cx - 5, top + 6, cx - 8, top + 2, dk(back, 0.05)); P.line(cx + 5, top + 6, cx + 8, top + 2, dk(back, 0.05)); P.line(cx + 4, top + 6, cx + 7, top + 2, dk(back, 0.05)); } else { P.rect(cx - 7, top + 6, 2, 6, dk(back, 0.05)); P.rect(cx + 5, top + 6, 2, 6, dk(back, 0.05)); } }
      else if (flp === 1) { P.line(cx + 1, top + 6, cx + 4, top + 2, dk(back, 0.05)); P.line(cx, top + 6, cx + 3, top + 2, dk(back, 0.05)); }
      else if (flp === 2) P.rect(cx - 7, top + 7, 7, 2, dk(back, 0.05));
      else P.rect(cx, top + 6, 2, 6, dk(back, 0.05));
      P.shade();
      if (emp && !B) { if (F) { P.rect(cx - 4, top + 4, 1, 2, T('#f0b030')); P.rect(cx + 3, top + 4, 1, 2, T('#f0b030')); } else P.rect(cx - 1, top + 4, 1, 2, T('#f0b030')); }
      const pe = Q.eyes ? dk(back, 0.0) : '#141414';
      if (F) { P.px(cx - 2, top + 3, Q.eyes ? dk(belly, 0.3) : '#141414'); P.px(cx + 1, top + 3, Q.eyes ? dk(belly, 0.3) : '#141414'); P.rect(cx - 1, top + 5, 2, 1, '#e8803a'); if (Q.mouth) P.rect(cx - 1, top + 6, 2, 1, '#c8602a'); }
      if (S) { P.px(cx - 3, top + 3, Q.eyes ? dk(belly, 0.3) : pe); P.rect(cx - 6, top + 4, 2, 1, '#e8803a'); if (Q.mouth) P.px(cx - 6, top + 5, '#c8602a'); }
      A.head = [cx - 4, top, 8, 6]; A.neckY = top + 6; A.mouth = [S ? cx - 6 : cx, top + 5]; A.body = [cx - 5, top, 10, H]; A.top = top - 2; A.front = cx - 6; A.back = cx + 4; A.eyeY = top + 3;
      if (smudge && F) P.overRect(cx - 1, top + 10, 2, 1, dk(belly, 0.1));
      const up = fr === 0 ? 0 : fr === 2 ? 1 : -1;
      if (!S) { P.rect(cx - 3, GROUND - (up === 0 ? 1 : 0), 2, 1, '#e8803a'); P.rect(cx + 1, GROUND - (up === 1 ? 1 : 0), 2, 1, '#e8803a'); }
      else { P.rect(cx - 3 + (fr === 0 ? -1 : 0), GROUND, 3, 1, '#e8803a'); }
      g = { box: [cx - 5, top, cx + 5, GROUND] };
      break;
    }
    default: {
      g = rig(P, { headW: 8, headH: 7, torsoW: 8, torsoH: 7, legH: 6, legW: 2, armLen: 6, skin: col, torsoCol: col2 }, view, fr);
      P.shade();
      g.sym(1, g.hT + 3, 1, 1, '#141414', 'h', 'face');
      g.finish();
    }
  }
  if (g && g.box && scarN && !B) scarsAt(P, scarList.slice(0, scarN), g.box);
  const role = R.role;
  if (g && g.sym && g.tT != null && role) {
    // 魔王の側近：金の襟と赤い飾り帯／群れの長：牙の首飾り／番兵・宝の番人：肩の金具
    if (role === 'aide') { g.sym(0, g.tT, (g.tw || 8) / 2, 1, GOLD, 't'); g.sym(0, g.tT + 2, 1, 3, '#c02030', 't', 'front'); }
    if (role === 'leader') { g.sym(1, g.tT + 1, 1, 1, '#f0ead0', 't', 'noside'); g.sym(3, g.tT, 1, 1, '#f0ead0', 't', 'noside'); }
    if (role === 'castleguard' || role === 'treasure') g.sym((g.tw || 8) / 2 - 1, g.tT, 2, 1, '#b8bcc4', 't');
  }
  return { grounded: true };
}
// 描く前に寸法だけ知りたいとき（マント・翼を体より先に描くため）
function rigPre(o, view, fr) {
  const S = view === 'S', B = view === 'B', F = view === 'F';
  const legH = Q.sit ? Math.min(o.legH, 1) : Q.crouch ? Math.max(1, o.legH - Q.crouch) : o.legH;
  const step = Q.step != null ? Q.step !== 0 : fr !== 1;
  const bob = Q.bob ?? (step && legH > 2 ? 1 : 0);
  const legTop = GROUND - legH + 1 + bob, tT = legTop - o.torsoH;
  const tw = o.torsoW, sw = Math.max(3, Math.round(tw * 0.65));
  return { S, B, F, cx: CX, G: GROUND, tT, legTop, tw, sw, sL: CX - Math.ceil(sw / 2) };
}

// ---------------------------------------------------------------- 大蜘蛛・アラクネ
function paintSpider(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.08) => jit(hex, R, dh, ds, dl);
  const G = GROUND;
  const ar = sp === 'arachne';
  const col = T(def.col), col2 = T(def.col2);
  const s = ar ? 1.3 : 1;
  const u = []; for (let i = 0; i < 16; i++) u.push(R.f());
  const abR = 6 * s + (u[0] - 0.4) * 1, pat = pickU(['stripes', 'stripes', 'dots', 'dots', 'hourglass', 'skull', 'band', 'band'], u[1]);
  const ec = pickU(['#ff3030', '#ff8020', '#f0f040', '#40ff80'], u[2]);
  const hair = T(pickU(['#1a1020', '#e8e8f0', '#4a1a3a', '#6a2a1a'], u[3]));
  const crown = u[4] < 0.5;
  const legC = lt(col, 0.1), farC = shadow(col, 0.6);
  const wave = (i) => ((i + fr) % 2 === 0 ? -1 : 0) * (fr === 1 ? 0 : 1); // 後ろから前へ流れる脚の波
  const rear = Q.rear || 0, curl = Q.curl || 0; // 前脚を振り上げる／脚を縮める（死）
  const patternAt = (cx, cy, r, flip) => {
    const m = (x) => (flip ? 2 * cx - x : x);
    if (pat === 'stripes') for (let i = -2; i <= 2; i++) for (let y = cy - r; y < cy + r; y++) P.over(m(cx + i * 2.4 * s), y, col2);
    if (pat === 'dots') for (let i = 0; i < 4; i++) P.overRect(m(cx + (u[5 + i] - 0.5) * r * 1.4), cy + (u[9 + i] - 0.6) * r, 2, 1, col2);
    if (pat === 'hourglass') { P.overRect(cx - 1, cy - 2, 2, 1, col2); P.over(cx, cy - 1, col2); P.over(cx, cy, col2); P.overRect(cx - 1, cy + 1, 3, 1, col2); }
    if (pat === 'skull') { P.overRect(cx - 1, cy - 3, 3, 2, col2); P.over(cx - 1, cy - 1, col2); P.over(cx + 1, cy - 1, col2); P.over(cx, cy, col2); }
    if (pat === 'band') P.overRect(cx - r, cy - 1, r * 2, 2, col2);
  };
  if (view === 'S') {
    const cx = CX - 3, abY = G - 8 * s - Math.round(rear * 2), thX = cx + 6 * s, thY = G - 6 * s - Math.round(rear * 3);
    const leg = (i, far, c) => {
      const bx = thX - 2 + i * 1.3 * s, by = thY;
      let kx = bx + (i - 1.5) * 4 * s + (far ? 1.5 : 0), ky = by - (6 + (i === 1 || i === 2 ? 1 : 0)) * s - (far ? 1 : 0) + wave(i + (far ? 1 : 0));
      let fx = bx + (i - 1.5) * 7 * s + (far ? 2 : 0) + (fr === 1 ? 0 : wave(i + (far ? 1 : 0))), fy = G;
      if (rear && i >= 2) { const k = i === 3 ? 1 : 0.5; kx += 2 * s * k * rear; ky -= 3 * s * k * rear; fx = kx + 3 * s; fy = Math.round(ky + (1 - k * rear) * 4 * s); }
      if (curl) { kx = bx + (kx - bx) * (1 - 0.5 * curl); ky = by + (ky - by) * (1 - 0.3 * curl); fx = kx + (fx - kx) * (1 - 0.7 * curl); fy = Math.round(ky + (fy - ky) * (1 - 0.6 * curl)); }
      P.line(bx, by, kx, ky, c); P.line(kx, ky, fx, fy, c);
      if (s > 1) P.line(bx, by + 1, kx, ky + 1, c);
    };
    for (let i = 0; i < 4; i++) leg(i, true, farC);
    P.ell(cx - 1, abY, abR * 1.15, abR * 0.9, col);
    P.ell(thX, thY, 3.2 * s, 2.6 * s, col);
    patternAt(cx - 1, abY, abR, false);
    P.shade();
    for (let i = 0; i < 4; i++) leg(i, false, legC);
    if (!ar) { P.rect(thX + 1 * s, thY - 1, 2, 1, Q.eyes ? dk(col, 0.1) : ec); if (!Q.eyes) P.px(thX + 2 * s, thY - 2, lt(ec, 0.2)); P.rect(thX + 3 * s, thY, 1, 2, '#e8e0d0'); if (Q.mouth) { P.px(thX + 3 * s + 1, thY + 2, '#e8e0d0'); P.px(thX + 3 * s, thY + 2, '#3a1418'); } }
    A.mouth = [Math.round(thX + 3 * s + 1), Math.round(thY + 1)]; A.head = [Math.round(thX - 2), Math.round(thY - 3), 6, 6]; A.body = [Math.round(cx - 1 - abR * 1.15), Math.round(abY - abR), Math.round(abR * 2.3 + 9), Math.round(abR * 2)]; A.top = Math.round(abY - abR - 1); A.front = Math.round(thX + 4 * s); A.back = Math.round(cx - 1 - abR * 1.15); A.tail = [Math.round(cx - 1 - abR * 1.15), Math.round(abY)];
    if (ar) {
      const skin = col2, bx = thX + 2, by = thY - 3;
      P.rect(bx - 2, by - 8, 5, 9, skin); P.rect(bx - 2, by - 4, 5, 3, col);
      P.rect(bx - 2, by - 15, 5, 6, skin); P.rect(bx - 3, by - 16, 7, 3, hair); P.rect(bx, by - 13, 3, 8, hair); P.rect(bx + 3, by - 10, 1, 6, hair);
      P.rect(bx - 3, by - 7, 1, 6, skin); P.rect(bx - 4, by - 2, 1, 1, skin);
      P.px(bx - 2, by - 12, ec); P.px(bx - 3, by - 10, dk(skin, 0.2));
      if (crown) { P.px(bx - 2, by - 17, GOLD); P.px(bx, by - 17, GOLD); P.px(bx + 2, by - 17, GOLD); }
      if (Q.arm === 'fwd' || Q.arm === 'across') P.line(bx - 3, by - 6, bx + 10, by - 6, '#d8d8e0'); else if (Q.arm === 'up' || Q.arm === 'back') P.line(bx - 6, by - 16, bx - 3, by - 3, '#d8d8e0'); else P.line(bx - 5, by - 9, bx - 5, by + 3, '#d8d8e0');
      A.mouth = [bx + 2, by - 10]; A.head = [bx - 3, by - 16, 7, 7]; A.top = by - 18; A.neckY = by - 9; A.hand = [Q.arm === 'fwd' ? bx + 10 : bx - 5, by - 6]; A.eyeY = by - 12; A.front = bx + 4;
    }
    return { grounded: true };
  }
  // 正面・背中：脚を左右に4本ずつ広げ、脚の間に隙間を残す
  const cx = CX;
  const thY = G - 4 * s, abY = view === 'F' ? G - 9 * s : G - 6 * s;
  const legs = (c) => { for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) {
    const bx = cx + sg * 3 * s, by = thY - (view === 'B' ? 1 : 0);
    let kx = cx + sg * (5 + i * 2.2) * s, ky = G - (9 + (i === 1 || i === 2 ? 1 : 0)) * s + wave(i + (sg > 0 ? 1 : 0)) - Math.round(rear * 2);
    let fx = cx + sg * (7 + i * 3.2) * s, fy = G - (i === 0 || i === 3 ? 0 : 1);
    if (rear && i === 0 && view === 'F') { ky -= 3 * s * rear; fx = kx + sg * 1; fy = Math.round(ky - 3 * s * rear); }
    if (curl) { kx = bx + (kx - bx) * (1 - 0.5 * curl); ky = by + (ky - by) * (1 - 0.3 * curl); fx = kx + (fx - kx) * (1 - 0.7 * curl); fy = Math.round(ky + (fy - ky) * (1 - 0.6 * curl)); }
    P.line(bx, by, kx, ky, c); P.line(kx, ky, fx, fy, c);
  } };
  if (view === 'F') {
    legs(farC);
    P.ell(cx, abY, abR * 1.1, abR * 0.8, col);
    P.ell(cx, thY, 3.4 * s, 2.8 * s, col);
    P.shade();
    const ec2 = Q.eyes ? dk(col, 0.1) : ec;
    if (!ar) { P.rect(cx - 2, thY - 1, 1, 1, ec2); P.rect(cx + 1, thY - 1, 1, 1, ec2); P.rect(cx - 1, thY - 2, 2, 1, ec2); P.px(cx - 1 - (Q.mouth ? 1 : 0), thY + 2, '#e8e0d0'); P.px(cx + (Q.mouth ? 1 : 0), thY + 2, '#e8e0d0'); if (Q.mouth) P.rect(cx - 1, thY + 2, 2, 1, '#3a1418'); }
  } else {
    legs(farC);
    P.ell(cx, thY - 3 * s, 3, 2.4, col);
    P.ell(cx, abY, abR * 1.2, abR * 1.0, col);
    patternAt(cx, abY, abR, true);
    P.shade();
  }
  if (ar) {
    const skin = col2, by = thY - 3;
    const B = view === 'B';
    P.rect(cx - 3, by - 8, 6, 9, skin); if (!B) P.rect(cx - 3, by - 4, 6, 3, col);
    P.rect(cx - 3, by - 15, 6, 6, skin); P.rect(cx - 4, by - 16, 8, 3, hair); P.rect(cx - 4, by - 13, 1, 8, hair); P.rect(cx + 3, by - 13, 1, 8, hair);
    if (B) P.rect(cx - 3, by - 14, 6, 9, hair);
    P.rect(cx - 4, by - 7, 1, 6, skin); P.rect(cx + 3, by - 7, 1, 6, skin);
    if (!B) { P.px(cx - 2, by - 12, ec); P.px(cx + 1, by - 12, ec); P.rect(cx - 1, by - 10, 2, 1, dk(skin, 0.2)); }
    if (crown) { P.px(cx - 3, by - 17, GOLD); P.px(cx, by - 17, GOLD); P.px(cx + 2, by - 17, GOLD); }
    const sx = B ? cx - 5 : cx + 5;
    if (Q.arm === 'up' || Q.arm === 'back') P.line(sx, by - 18, sx, by - 6, '#d8d8e0'); else if (Q.arm === 'fwd' || Q.arm === 'across') P.line(sx, by - 6, sx - (B ? -2 : 2), by + 6, '#d8d8e0'); else P.line(sx, by - 9, sx, by + 3, '#d8d8e0');
    A.head = [cx - 4, by - 16, 8, 7]; A.mouth = [cx, by - 10]; A.top = by - 18; A.neckY = by - 9; A.eyeY = by - 12; A.hand = [sx, by - 6];
  }
  if (!A.head) { A.head = [cx - 4, Math.round(thY - 3), 8, 6]; A.mouth = [cx, Math.round(thY + 2)]; A.top = Math.round(Math.min(thY, abY) - abR - 1); }
  A.body = [Math.round(cx - abR * 1.2), Math.round(abY - abR), Math.round(abR * 2.4), Math.round(abR * 2)]; A.front = cx; A.back = cx;
  return { grounded: true };
}

// ---------------------------------------------------------------- ワイバーン・ドラゴン
function paintDragon(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.07) => jit(hex, R, dh, ds, dl);
  const G = GROUND;
  const big = sp === 'dragon';
  const col = T(def.col), col2 = T(def.col2);
  const s = big ? 1.55 : 1;
  const u = []; for (let i = 0; i < 12; i++) u.push(R.f());
  const L = Math.round(14 * s), BH = Math.round(7 * s), legH = Q.fold ? Math.max(1, Math.round(5 * s * (1 - Q.fold))) : Math.round(5 * s);
  const wk = Q.wingK ?? 1, tph = Q.tph ?? fr; // 翼の広げ具合、尾の位相
  const yb = G - legH, bt = yb - BH + 1;
  const wingC = dk(mix(col, col2, 0.15), 0.08), memb = T(big ? mix(col, '#3a1010', 0.3) : lt(col2, -0.05));
  const spineC = T(big ? '#e8c83a' : lt(col2, 0.05));
  const hornC = T(big ? '#e8e0c8' : '#d8d0e0', 0.01, 0.03, 0.05);
  const hs = pickU(['back', 'up', 'curve'], u[0]), hl = Math.round((2 + Math.floor(u[1] * 3)) * s);
  const ec = pickU(['#f0e040', '#ff6020', '#40f0a0', '#f04040', '#80c0ff'], u[2]);
  const fire = big && u[3] < 0.5;
  const tailLen = Math.round(16 * s) + Math.floor(u[4] * 4) - 1;
  const flapUp = Q.flap ?? [1, 0.35, -0.25][fr]; // 羽ばたき
  const step = Q.step ?? (fr === 0 ? 1 : fr === 2 ? -1 : 0);
  if (view === 'S') {
    const x0 = CX - Math.floor(L / 2) - 4;
    const wing = (dx, c, m) => {
      const sx = x0 + L * 0.55 + dx, sy = bt + 1;
      const span = Math.round(14 * s * wk), up = Math.round(15 * s * flapUp * (0.4 + 0.6 * wk));
      const wx = sx + 3 * s, wy = sy - up * 0.6;
      const tipX = sx - span * 0.35, tipY = sy - up;
      const fingers = [[tipX, tipY], [sx - span * 0.6, sy - up * 0.55], [sx - span * 0.75, sy - up * 0.2 + (up < 0 ? 2 : 0)], [sx - span * 0.55, sy + 1]];
      for (let k = 0; k < fingers.length - 1; k++) {
        const [ax, ay] = fingers[k], [bx, by] = fingers[k + 1];
        for (let t = 0; t <= 1; t += 0.04) { const ex = ax + (bx - ax) * t, ey = ay + (by - ay) * t + Math.sin(t * Math.PI) * 1.5; P.line(wx, wy, ex, ey, m); P.line(sx, sy, ex, ey, m); }
      }
      P.line(sx, sy, wx, wy, c);
      for (const [fx, fy] of fingers) P.line(wx, wy, fx, fy, c);
      P.px(wx + 1, wy - 1, lt(c, 0.2));
    };
    wing(-3 * s, dk(wingC, 0.15), dk(memb, 0.18));
    for (let i = 0; i < tailLen; i++) {
      const t = i / tailLen;
      const x = x0 - i, y = bt + 2 + Math.round(Math.sin(t * Math.PI * 0.9 + tph * 0.3) * 4 * s) - Math.round(t * t * 3) + (Q.tailDn ? Math.round(t * Q.tailDn) : 0);
      const r = Math.max(0.6, (1 - t) * BH * 0.35);
      P.ell(x, y, 0.8, r, col);
      if (i % 3 === 0 && i < tailLen - 2) P.px(x, y - Math.ceil(r) - 1, spineC);
    }
    const tipX = x0 - tailLen, tipY = bt + 2 + Math.round(Math.sin(0.9 * Math.PI + tph * 0.3) * 4 * s) - 3 + (Q.tailDn || 0);
    if (big) { P.rect(tipX - 2, tipY - 2, 3, 2, spineC); P.px(tipX - 3, tipY - 3, spineC); } else { P.rect(tipX - 2, tipY - 1, 2, 3, col2); P.px(tipX - 3, tipY, col2); }
    const legW = Math.max(2, Math.round(2 * s));
    const hind = x0 + 2, front = x0 + L - legW - 2;
    const legDraw = (x, c, off) => { P.rect(x, yb - 1, legW, 2, c); for (let r = 1; r <= legH; r++) P.rect(x + Math.round(off * r / legH), yb + r - 1, legW, 1, c); P.rect(x - 1 + off, yb + 1, 1, 2, c); P.px(x + legW + off, G, '#e8e0d0'); };
    legDraw(hind + legW, dk(col, 0.15), step); if (big) legDraw(front + legW, dk(col, 0.15), -step);
    rrect(P, x0, bt, L, BH, 2, col);
    for (let x = x0 + 2; x < x0 + L - 1; x++) { P.over(x, yb, col2); P.over(x, yb - 1, col2); if (big) P.over(x, yb - 2, col2); }
    for (let x = x0 + 2; x < x0 + L - 2; x += 2) P.over(x, yb - 1, dk(col2, 0.1));
    const nl = Math.round(9 * s);
    const hx0 = x0 + L + Math.round(3 * s) + (Q.hdx || 0), hy0 = bt - nl + (Q.nod ?? (fr === 1 ? 0 : 1)) + (Q.hdy || 0);
    const hx = hx0 + Math.round((Q.hg || 0) * 3 * s), hy = Math.round(hy0 + (G - Math.round(4 * s) + 1 - hy0) * (Q.hg || 0));
    thick(P, x0 + L - 2, bt + 2, hx, hy + 3, 1.6 * s, col);
    for (let i = 0; i < nl; i += 2) { const t = i / nl; P.over(Math.round(x0 + L - 1 + (hx - x0 - L + 1) * t + 1.5 * s), Math.round(bt + 2 + (hy + 3 - bt - 2) * t), col2); }
    const hw = Math.round(5 * s), hh = Math.round(4 * s);
    rrect(P, hx - 1, hy, hw, hh, 1, col);
    P.rect(hx + hw - 1, hy + Math.round(1.5 * s), Math.round(4 * s), hh - Math.round(1.5 * s), col);
    P.rect(hx + hw - 1, hy + hh - 1, Math.round(4 * s), 1, dk(col, 0.1));
    if (Q.mouth) { P.rect(hx + hw - 1, hy + hh - 1, Math.round(4 * s), Math.round(s), '#5a1418'); P.rect(hx + hw - 2, hy + hh - 1 + Math.round(s), Math.round(4 * s), Math.max(1, Math.round(s)), dk(col, 0.1)); }
    for (let x = x0 + 1; x < x0 + L - 1; x += big ? 2 : 3) { let y = bt - 3; while (!P.get(x, y) && y < yb) y++; P.px(x, y - 1, spineC); if (big) P.px(x, y - 2, spineC); }
    for (let i = 0; i < 6 * s; i++) { const x = x0 + 1 + Math.floor(u[(i + 5) % 12] * (L - 3)), y = bt + 1 + Math.floor(u[(i + 7) % 12] * (BH - 3)); if (P.get(x, y) === col) { P.px(x, y, dk(col, 0.08)); P.over(x + 1, y, dk(col, 0.08)); } }
    P.shade();
    legDraw(hind, col, -step); if (big) legDraw(front, col, step);
    wing(0, wingC, memb);
    for (let k = 0; k < (big ? 2 : 1); k++) for (let i = 0; i < hl; i++) {
      const bx = hx + k * 2, by = hy - 1;
      if (hs === 'back') P.px(bx - i, by - Math.floor(i / 2), hornC);
      if (hs === 'up') P.px(bx - Math.floor(i / 3), by - i, hornC);
      if (hs === 'curve') P.px(bx - i + Math.floor(i * i / 6), by - Math.floor(i * 0.8), hornC);
    }
    P.px(hx + hw - 2, hy + 1, Q.eyes ? dk(col, 0.25) : ec); if (big) P.px(hx + hw - 3, hy + 1, Q.eyes ? dk(col, 0.25) : ec);
    P.px(hx + hw - 2, hy, dk(col, 0.25));
    P.px(hx + hw + Math.round(4 * s) - 2, hy + Math.round(1.5 * s), '#1a1010');
    for (let x = hx + hw; x < hx + hw + Math.round(4 * s) - 1; x += 2) P.px(x, hy + hh, '#f0ead8');
    if (fire && fr === 1 && !Q.anim) { P.px(hx + hw + Math.round(4 * s), hy + hh - 1, '#ff9020'); P.px(hx + hw + Math.round(4 * s) + 1, hy + hh - 2, '#ffd040'); }
    A.mouth = [hx + hw + Math.round(4 * s) - 1, hy + hh - 1 + (Q.mouth ? Math.round(s) : 0)]; A.head = [hx - 1, hy, hw + Math.round(4 * s), hh]; A.body = [x0, bt, L, BH]; A.top = hy - hl - 1; A.front = hx + hw + Math.round(4 * s); A.back = x0 - tailLen; A.tail = [tipX, tipY]; A.neckY = bt;
    return { grounded: true };
  }
  // 正面・背中：翼を左右に広げる
  const B = view === 'B';
  const cx = CX;
  const Wb = Math.round(10 * s);
  const wings = (c, m) => {
    const span = Math.round(18 * s * wk), up = Math.round(14 * s * flapUp * (0.4 + 0.6 * wk));
    for (const sg of [-1, 1]) {
      const sx = cx + sg * Math.round(3 * s), sy = bt + 1;
      const wx = cx + sg * Math.round(8 * s), wy = sy - Math.round(up * 0.7) - 2;
      const tips = [[cx + sg * span, sy - up], [cx + sg * Math.round(span * 0.8), sy - Math.round(up * 0.3) + 3], [cx + sg * Math.round(span * 0.5), sy + 4], [cx + sg * Math.round(4 * s), sy + Math.round(4 * s)]];
      for (let k = 0; k < tips.length - 1; k++) { const [ax, ay] = tips[k], [bx, by] = tips[k + 1]; for (let t = 0; t <= 1; t += 0.05) { const ex = ax + (bx - ax) * t, ey = ay + (by - ay) * t - Math.sin(t * Math.PI) * 1.5; P.line(wx, wy, ex, ey, m); P.line(sx, sy, ex, ey, m); } }
      P.line(sx, sy, wx, wy, c); for (const [tx, ty] of tips) P.line(wx, wy, tx, ty, c);
      P.px(wx, wy - 1, lt(c, 0.2));
    }
  };
  const legW = Math.max(2, Math.round(2 * s));
  const legs = (c) => { const up0 = fr === 0 ? 1 : 0, up1 = fr === 2 ? 1 : 0; P.rect(cx - Math.round(Wb / 2), yb, legW, legH + 1 - up0, c); P.rect(cx + Math.round(Wb / 2) - legW, yb, legW, legH + 1 - up1, c); P.px(cx - Math.round(Wb / 2) - 1, G - up0, '#e8e0d0'); P.px(cx + Math.round(Wb / 2), G - up1, '#e8e0d0'); };
  const nl = Math.round(7 * s), hw = Math.round(6 * s), hh = Math.round(5 * s);
  const hy0 = bt - nl - hh + 2 + (Q.nod ?? (fr === 1 ? 0 : 1)) + (Q.hdy || 0);
  const hy = Math.round(hy0 + (G - hh + 1 - hy0) * (Q.hg || 0));
  const head = () => {
    P.rect(cx - Math.round(1.5 * s), hy + hh - 1, Math.round(3 * s), nl + 2, col);
    rrect(P, cx - Math.floor(hw / 2), hy, hw, hh, 1, col);
    for (let k = 0; k < (big ? 2 : 1); k++) for (let i = 0; i < hl; i++) { const o = hs === 'back' ? Math.floor(i / 2) : hs === 'up' ? 0 : Math.floor(i * 0.6); for (const sg of [-1, 1]) P.px(cx + sg * (Math.floor(hw / 2) - 1 - k * 2 + o) - (sg < 0 ? 1 : 0), hy - 1 - i, hornC); }
  };
  if (!B) {
    wings(dk(wingC, 0.05), memb);
    // 尾の先が横から覗く
    P.line(cx + Wb / 2, yb - 1, cx + Wb / 2 + 5 * s, yb - 3 + (tph - 1), col); P.rect(cx + Wb / 2 + 5 * s, yb - 5 + (tph - 1), 2, 2, big ? spineC : col2);
    legs(dk(col, 0.1));
    rrect(P, cx - Math.round(Wb / 2), bt, Wb, BH + 1, 2, col);
    for (let y = bt + 1; y <= yb; y++) P.overRect(cx - Math.round(Wb / 4), y, Math.round(Wb / 2), 1, (y & 1) ? col2 : dk(col2, 0.08));
    head();
    P.shade();
    const mw = Math.round(3 * s);
    P.rect(cx - Math.floor(mw / 2), hy + hh - 2, mw, 2, dk(col, 0.08));
    P.px(cx - Math.floor(mw / 2), hy + hh - 2, '#1a1010'); P.px(cx + Math.floor(mw / 2) - (mw % 2 ? 0 : 1), hy + hh - 2, '#1a1010');
    const ecF = Q.eyes ? dk(col, 0.25) : ec;
    P.rect(cx - Math.floor(hw / 2) + 1, hy + 1, big ? 2 : 1, 1, ecF); P.rect(cx + Math.floor(hw / 2) - 1 - (big ? 2 : 1) + (hw % 2 ? 1 : 0), hy + 1, big ? 2 : 1, 1, ecF);
    if (Q.mouth) { P.rect(cx - Math.floor(mw / 2), hy + hh - 1, mw, Math.round(2 * s), '#5a1418'); P.rect(cx - Math.floor(mw / 2), hy + hh - 1 + Math.round(2 * s), mw, 1, dk(col, 0.08)); }
    for (let x = cx - Math.floor(mw / 2); x < cx + Math.ceil(mw / 2); x += 2) P.px(x, hy + hh, '#f0ead8');
    if (fire && fr === 1 && !Q.anim) { P.rect(cx - 1, hy + hh + 1, 2, 1, '#ff9020'); P.px(cx, hy + hh + 2, '#ffd040'); }
  } else {
    head();
    legs(dk(col, 0.1));
    rrect(P, cx - Math.round(Wb / 2), bt, Wb, BH + 1, 2, col);
    // 尾：体の下から地面へ伸びて横へ曲がる
    for (let i = 0; i < tailLen; i++) { const t = i / tailLen; const x = cx + Math.round(Math.sin(t * 2.2 + tph * 0.3) * 5 * s * t), y = yb + Math.min(legH, i); const r = Math.max(0.6, (1 - t) * 2.5 * s); P.ell(x, y, r, 0.9, col); }
    for (let y = bt; y < yb; y += 2) P.rect(cx - 1, y - 1, 2, 1, spineC);
    P.shade();
    wings(wingC, dk(memb, 0.1));
  }
  A.mouth = [cx, hy + hh + (Q.mouth ? Math.round(2 * s) : 0)]; A.head = [cx - Math.floor(hw / 2), hy, hw, hh]; A.body = [cx - Math.round(Wb / 2), bt, Wb, BH]; A.top = hy - hl - 1; A.front = cx; A.back = cx; A.neckY = bt; A.tail = [cx + Math.round(Wb / 2 + 5 * s), yb - 4];
  return { grounded: true };
}

// ---------------------------------------------------------------- サソリ
function paintBug(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.08) => jit(hex, R, dh, ds, dl);
  const G = GROUND;
  let col = T(def.col), col2 = T(def.col2);
  const u = []; for (let i = 0; i < 6; i++) u.push(R.f());
  if (u[0] < 0.25) col = T('#a8702a'); else if (u[0] < 0.5) col = T('#c8a060');
  const L = 9 + Math.floor(u[1] * 3), seg = 6 + Math.floor(u[2] * 2), cl = Math.floor(u[3] * 2);
  const by = G - 3;
  const sway = Q.sway ?? (fr === 1 ? 0 : fr === 0 ? -1 : 1);
  const sting = Q.sting || 0, clawOpen = Q.mouth ? 1 : 0;
  if (view === 'S') {
    const x0 = CX - Math.floor(L / 2);
    for (let i = 0; i < 4; i++) { const x = x0 + 1 + i * 2, o = ((i + fr) & 1) && fr !== 1 ? 1 : 0; P.line(x, by, x - 1 + o, G, dk(col, 0.15)); P.line(x + 1, by, x + 2 - o, G, dk(col, 0.2)); }
    for (let i = 0; i < L; i++) P.rect(x0 + i, by - 2, 1, 3 - (i === 0 ? 1 : 0), col);
    for (let i = 1; i < L; i += 2) P.over(x0 + i, by - 2, lt(col, 0.1));
    const pts = [];
    for (let i = 0; i < seg; i++) { const a = Math.PI * (0.05 + i / seg * (1.05 + sting * 0.45)); pts.push([x0 - 1 - Math.sin(a) * 4 + i * (0.6 + sting * 0.9), by - 1 - (1 - Math.cos(a)) * 4.2 - i * 0.3 + (i > seg / 2 ? sway : 0) + (i > seg / 2 ? sting * (i - seg / 2) * 0.6 : 0)]); }
    pts.forEach(([x, y], i) => P.rect(x, y, 2, 2, i & 1 ? col : lt(col, 0.05)));
    const [sx, sy] = pts[pts.length - 1];
    P.px(sx + 2, sy + 1, col2); P.px(sx + 3, sy + 2, col2); P.px(sx + 2, sy + 2, dk(col2, 0.1));
    P.line(x0 + L, by - 1, x0 + L + 2, by - 3, col); P.rect(x0 + L + 2, by - 5 - cl, 3, 3 + cl, col); P.px(x0 + L + 5, by - 5 - cl - clawOpen, col); P.px(x0 + L + 5, by - 3 + clawOpen, col); P.clr(x0 + L + 4, by - 4); if (clawOpen) { P.clr(x0 + L + 4, by - 5); P.clr(x0 + L + 4, by - 3); }
    P.shade();
    P.px(x0 + L - 1, by - 2, Q.eyes ? dk(col, 0.2) : '#f04030');
    A.mouth = [x0 + L + 5, by - 4]; A.head = [x0 + L - 2, by - 3, 4, 3]; A.body = [x0, by - 2, L, 3]; A.top = Math.round(Math.min(...pts.map((p) => p[1]))) - 1; A.front = x0 + L + 6; A.back = x0 - 4; A.tail = [Math.round(sx + 2), Math.round(sy + 1)];
    return { grounded: true };
  }
  const B = view === 'B', cx = CX;
  for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { const o = ((i + fr + (sg > 0 ? 1 : 0)) & 1) && fr !== 1 ? 1 : 0; P.line(cx + sg * 2, by - 1 + i % 2, cx + sg * (5 + i), G - o, dk(col, 0.18)); }
  // 尾は背中の上を越えて前へ
  const tail = () => { for (let i = 0; i < seg; i++) P.rect(cx - 1 + (i > seg - 3 ? sway : 0), by - 3 - i * 1.3 + (B ? -1 : 1) * sting * Math.max(0, i - seg / 2) * 1.2, 2, 2, i & 1 ? col : lt(col, 0.05)); };
  if (B) { P.ell(cx, by - 1, 3.5, 2.5, col); tail(); }
  else { tail(); P.ell(cx, by - 1, 3.5, 2.5, col); }
  // はさみ
  for (const sg of [-1, 1]) { P.line(cx + sg * 3, by - 1, cx + sg * 5, by - 3, col); P.rect(cx + sg * 6 - (sg < 0 ? 2 : 0), by - 5 - cl, 3, 3 + cl, col); if (clawOpen) P.clr(cx + sg * 7 - (sg < 0 ? 2 : 0), by - 4 - cl); }
  P.shade();
  const tipY = by - 3 - (seg - 1) * 1.3 + (B ? -1 : 1) * sting * (seg / 2) * 1.2;
  P.px(cx + sway, tipY + (B ? -1 : 2), col2); P.px(cx - 1 + sway, tipY + (B ? -1 : 2), dk(col2, 0.1));
  if (!B) { P.px(cx - 1, by - 2, Q.eyes ? dk(col, 0.2) : '#f04030'); P.px(cx, by - 2, Q.eyes ? dk(col, 0.2) : '#f04030'); }
  A.mouth = [cx, by - 2]; A.head = [cx - 3, by - 4, 6, 4]; A.body = [cx - 4, by - 4, 8, 5]; A.top = Math.round(by - 3 - (seg - 1) * 1.3) - 1; A.front = cx; A.back = cx; A.tail = [cx + sway, Math.round(tipY)];
  return { grounded: true };
}

// ---------------------------------------------------------------- 地を這うもの（ワニ・カエル・ヘビ・カメ）
function paintLizard(P, R, sp, def, lv, view, fr) {
  const T = (hex, dh = 0.025, ds = 0.1, dl = 0.07) => jit(hex, R, dh, ds, dl);
  const G = GROUND;
  const col = T(def.col), col2 = T(def.col2);
  const u = []; for (let i = 0; i < 12; i++) u.push(R.f());
  const S = view === 'S', B = view === 'B';
  const step = fr === 0 ? 1 : fr === 2 ? -1 : 0;
  if (sp === 'frog') {
    const spots = u[0] < 0.5, sc = T(pickU(['#2a5a2a', '#6a4a2a', '#c8a030'], u[1]));
    const hop = Q.hop ?? (fr === 2 ? 2 : 0), crouch = Q.crouch ?? (fr === 0 ? 1 : 0);
    const by = G - 2 - hop;
    if (S) {
      const x0 = CX - 4;
      P.ell(x0 + 4, by - 1 + crouch, 4.5, 2.6 - crouch * 0.4, col);
      P.ell(x0 + 1, by, 2.4, 1.8, dk(col, 0.05)); // 後ろ脚
      P.rect(x0 - 1, G - (hop ? 1 : 0), 3, 1, dk(col, 0.1)); P.rect(x0 + 6, by + 1, 1, G - by - 1 - (hop ? 1 : 0) + 1, col);
      for (let x = x0 + 2; x < x0 + 8; x++) P.over(x, by + 1, col2);
      if (spots) { P.overRect(x0 + 2, by - 2, 2, 1, sc); P.overRect(x0 + 5, by - 1, 2, 1, sc); }
      P.shade();
      if (Q.sac) P.ell(x0 + 7, by + 0.5, 1.8 * Q.sac, 1.5 * Q.sac, lt(col2, 0.08));
      P.rect(x0 + 6, by - 4 + crouch, 2, 2, col); P.px(x0 + 7, by - 4 + crouch, Q.eyes ? dk(col, 0.25) : '#141410'); P.px(x0 + 6, by - 4 + crouch, Q.eyes ? col : '#f0e080');
      P.rect(x0 + 7, by, 2, 1, dk(col, 0.25));
      if (Q.tongue) { P.rect(x0 + 9, by, Q.tongue, 1, '#e05060'); P.rect(x0 + 8 + Q.tongue, by - 1, 2, 2, '#f07080'); }
      A.mouth = [x0 + 9, by]; A.head = [x0 + 5, by - 4, 4, 5]; A.body = [x0, by - 3, 9, 5]; A.top = by - 5 + crouch; A.front = x0 + 9; A.back = x0 - 1;
    } else {
      P.ell(CX, by - 1 + crouch, 4.5, 3 - crouch * 0.5, col);
      P.rect(CX - 6, by, 3, 2, dk(col, 0.05)); P.rect(CX + 3, by, 3, 2, dk(col, 0.05)); P.rect(CX - 6, G - (hop ? 1 : 0), 3, 1, dk(col, 0.1)); P.rect(CX + 3, G - (hop ? 1 : 0), 3, 1, dk(col, 0.1));
      if (!B) for (let x = CX - 2; x < CX + 2; x++) P.over(x, by + 1, col2);
      if (spots && B) { P.overRect(CX - 2, by - 2, 2, 1, sc); P.overRect(CX + 1, by, 2, 1, sc); }
      P.shade();
      P.rect(CX - 4, by - 4 + crouch, 2, 2, col); P.rect(CX + 2, by - 4 + crouch, 2, 2, col);
      if (!B) { const e2 = Q.eyes ? dk(col, 0.25) : '#141410'; P.px(CX - 4, by - 4 + crouch, e2); P.px(CX + 3, by - 4 + crouch, e2); if (Q.sac) P.ell(CX, by + 1.5, 2.2 * Q.sac, 1.6 * Q.sac, lt(col2, 0.08)); P.rect(CX - 2, by + 1 - crouch, 4, 1, dk(col, 0.25)); if (Q.tongue) { P.rect(CX, by + 1, 1, Q.tongue, '#e05060'); P.rect(CX - 1, by + Q.tongue, 2, 2, '#f07080'); } }
      A.mouth = [CX, by + 1]; A.head = [CX - 4, by - 4, 8, 5]; A.body = [CX - 5, by - 4, 10, 6]; A.top = by - 5 + crouch; A.front = CX; A.back = CX;
    }
    return { grounded: true };
  }
  if (sp === 'snake') {
    const band = u[0] < 0.5, bc = T(pickU(['#2a2a1a', '#c8b84a', '#a03a2a'], u[1])), tongue = Q.tongue ?? (fr === 1);
    const len = 20 + Math.floor(u[2] * 6);
    const strike = Q.strike || 0, ph = Q.tph ?? fr;
    if (S && !Q.coil) {
      // S字にうねる（コマで波の位相が進む）
      const x0 = CX - Math.floor(len / 2);
      for (let i = 0; i < len; i++) { const y = G - 1 + Math.round(Math.sin(i / 3.2 + ph * 1.2) * 1.2 * (1 - strike * 0.5)); const w = i < 3 ? 1 : 2; P.rect(x0 + i - Math.round(strike * 3 * (i / len)), y - w + 1, 1, w, col); if (band && i % 4 === 0) P.over(x0 + i, y, bc); P.over(x0 + i, y, (i & 1) ? col : col2); }
      const hx = x0 + len + Math.round(strike * 2), hy = G - 5 - Math.round(strike * 3);
      if (strike) thick(P, x0 + len - 3, G - 2, hx, hy + 2, 1, col); else P.rect(x0 + len - 1, G - 4, 2, 3, col);
      P.rect(hx, hy, 3, 2, col);
      if (Q.mouth) { P.rect(hx + 1, hy + 2, 3, 1, col); P.rect(hx + 1, hy + 1, 3, 1, '#5a1418'); }
      P.shade();
      P.px(hx + 1, hy, Q.eyes ? dk(col, 0.25) : '#f0d020');
      if (Q.mouth) { P.px(hx + 2, hy + 1, '#f0f0e0'); }
      if (tongue && !Q.mouth) { P.px(hx + 3, hy + 1, '#e03040'); P.px(hx + 4, hy, '#e03040'); }
      A.mouth = [hx + 3, hy + 1]; A.head = [hx, hy, 3, 2]; A.body = [x0, G - 3, len, 3]; A.top = hy - 1; A.front = hx + 4; A.back = x0; A.tail = [x0, G - 1];
    } else {
      // とぐろを巻いて頭を上げる
      P.ell(CX, G - 2, 6, 2.2, col); P.ell(CX, G - 4, 4.2, 1.8, dk(col, 0.03));
      if (band) for (let x = CX - 6; x < CX + 6; x += 3) P.overRect(x, G - 3, 1, 2, bc);
      const up = Q.low ? -4 : Math.round(strike * 2), fw = Math.round(strike * 2) * (B ? -1 : 1);
      if (!Q.low) P.rect(CX - 1, G - 9 - up + Math.max(0, fw), 2, 6 + up - Math.max(0, fw), col); else P.rect(CX - 1, G - 5, 2, 2, col);
      if (B) P.line(CX + 4, G - 1, CX + 7, G - 2 + (ph - 1), col);
      if (S) P.line(CX - 5, G - 1, CX - 8, G - 2 + (ph - 1), col);
      P.shade();
      const hy = G - 11 - up + Math.max(0, fw) + (Q.low ? 4 : 0);
      P.rect(CX - 2, hy, 4, 2 + (Q.mouth ? 1 : 0), col);
      if (!B) { const e2 = Q.eyes ? dk(col, 0.25) : '#f0d020'; P.px(CX - 2, hy, e2); P.px(CX + 1, hy, e2); if (Q.mouth) { P.rect(CX - 1, hy + 1, 2, 1, '#5a1418'); P.px(CX - 1, hy + 2, '#f0f0e0'); P.px(CX, hy + 2, '#f0f0e0'); } else if (tongue) P.rect(CX - 1, hy + 2, 1, 2, '#e03040'); if (!Q.low) P.rect(CX - 1, hy + 4, 2, 3, col2); }
      A.mouth = [CX, hy + 2]; A.head = [CX - 2, hy, 4, 2]; A.body = [CX - 6, G - 5, 12, 5]; A.top = hy - 1; A.front = CX; A.back = CX; A.tail = [CX + 6, G - 1];
    }
    return { grounded: true };
  }
  if (sp === 'turtle') {
    const shellC = col2, hexC = dk(col2, 0.18), algae = u[0] < 0.3;
    const hide = Q.hide || 0, st = Q.step ?? step;
    if (S) {
      const x0 = CX - 5;
      P.rect(x0 + 1, G - 1, 2, 2, dk(col, 0.1)); P.rect(x0 + 7, G - 1, 2, 2, dk(col, 0.1));
      P.ell(x0 + 5, G - 3, 5.5, 3.2, shellC);
      for (let x = x0 + 1; x < x0 + 10; x += 3) { P.overRect(x, G - 5, 1, 2, hexC); }
      P.overRect(x0, G - 2, 11, 1, dk(shellC, 0.1));
      if (algae) P.overRect(x0 + 3, G - 6, 3, 1, '#4a8a3a');
      P.shade();
      if (!hide) { P.rect(x0 + 1 + st, G - 1, 2, 2, col); P.rect(x0 + 7 - st, G - 1, 2, 2, col); }
      const hx = x0 + 10 - hide * 2 + (Q.hdx || 0), hy = G - 3 + (Q.hdy || 0);
      P.rect(hx, hy, 3 - hide, 2, col); if (!hide) P.px(hx + 2, hy, Q.eyes ? dk(col, 0.25) : '#141410');
      if (Q.mouth && !hide) { P.px(hx + 2, hy + 1, '#5a1418'); P.px(hx + 3, hy + 2, col); }
      if (!hide) P.px(x0 - 1, G - 2, col);
      A.mouth = [hx + 3, hy + 1]; A.head = [hx, hy, 3, 2]; A.body = [x0, G - 6, 11, 6]; A.top = G - 7; A.front = hx + 3; A.back = x0 - 1;
    } else {
      P.ell(CX, G - 3, 5.5, 3.2, shellC);
      if (!hide) { P.rect(CX - 6, G - 1 - (st === 1 ? 1 : 0), 2, 2, col); P.rect(CX + 4, G - 1 - (st === -1 ? 1 : 0), 2, 2, col); }
      if (B) { for (let x = CX - 4; x < CX + 4; x += 3) P.overRect(x, G - 5, 1, 3, hexC); if (algae) P.overRect(CX - 1, G - 6, 3, 1, '#4a8a3a'); P.px(CX, G, col); }
      P.shade();
      if (!B && !hide) { const e2 = Q.eyes ? dk(col, 0.25) : '#141410'; P.rect(CX - 1, G - 3 + (Q.hdy || 0), 2, 3, col); P.px(CX - 1, G - 3 + (Q.hdy || 0), e2); P.px(CX, G - 3 + (Q.hdy || 0), e2); if (Q.mouth) P.rect(CX - 1, G - 1 + (Q.hdy || 0), 2, 1, '#5a1418'); }
      A.mouth = [CX, G - 1]; A.head = [CX - 1, G - 3, 2, 3]; A.body = [CX - 6, G - 6, 12, 6]; A.top = G - 7; A.front = CX; A.back = CX;
    }
    return { grounded: true };
  }
  // ワニ
  const pat = pickU(['none', 'band', 'spots'], u[0]);
  const eyeC = pickU(['#e8c030', '#c8d040', '#e08020'], u[1]);
  const L = 16 + Math.floor(u[2] * 4) - 1, bh = 4, tl = 16 + Math.floor(u[3] * 4);
  const yb = G - 2 + (Q.lie ? 1 : 0), bt = yb - bh + 1;
  const jaw = Q.mouth ? (Q.mouth === true ? 2 : Q.mouth) : 0, ph = Q.tph ?? fr, st = Q.step ?? step;
  if (S) {
    const x0 = CX - Math.round((L + 10 - tl) / 2);
    const leg = (x, c, o) => { P.rect(x, yb, 2, 2, c); P.px(x + 2 + o, G, c); P.px(x - 1 + o, G, c); };
    leg(x0 + 3, dk(col, 0.15), -st); leg(x0 + L - 4, dk(col, 0.15), st);
    for (let i = 0; i < tl; i++) { const t = i / tl; const h = Math.max(1, Math.round((1 - t) * 3.5)); const y = bt + 1 + Math.round(Math.sin(t * 3 + ph * 0.5) * 1.2) - (Q.tailUp ? Math.round(t * t * Q.tailUp) : 0); P.rect(x0 - i, y, 1, h, col); if (i % 2 === 0) P.px(x0 - i, y - 1, dk(col, 0.1)); }
    rrect(P, x0, bt, L, bh, 1, col);
    P.rect(x0 + L, bt + 1, 5, 3, col); P.px(x0 + L + 1, bt, col); P.px(x0 + L + 2, bt, col);
    if (jaw) { for (let i = 0; i < 5; i++) P.px(x0 + L + 5 + i, bt + 2 - Math.round(jaw * (i + 1) / 5), col); for (let i = 0; i < 5; i++) P.px(x0 + L + 5 + i, bt + 1 - Math.round(jaw * (i + 1) / 5), col); P.rect(x0 + L + 5, bt + 3, 5, 1, col); P.rect(x0 + L + 4, bt + 2, 1, 1, '#5a1418'); for (let i = 1; i < 5; i++) for (let y = bt + 3 - Math.round(jaw * (i + 1) / 5); y < bt + 3; y++) P.px(x0 + L + 5 + i, y, '#8a2a30'); }
    else P.rect(x0 + L + 5, bt + 2, 5, 2, col);
    for (let x = x0 + 1; x < x0 + L + 9; x++) P.over(x, yb, col2);
    for (let x = x0 + 1; x < x0 + L; x += 2) P.px(x, bt - 1, dk(col, 0.12));
    if (pat === 'band') for (let x = x0 + 2; x < x0 + L; x += 4) P.overRect(x, bt, 1, 2, dk(col, 0.15));
    if (pat === 'spots') for (let i = 0; i < 3; i++) P.overRect(x0 + 1 + Math.floor(u[4 + i] * (L - 3)), bt + 1, 2, 1, lt(col, 0.1));
    P.shade();
    leg(x0 + 4, col, st); leg(x0 + L - 3, col, -st);
    for (let x = x0 + L + 1; x < x0 + L + 10; x += 2) if (u[7] > 0.15 || x !== x0 + L + 5) P.px(x, bt + 3 - (jaw && x > x0 + L + 4 ? 1 : 0), '#f0ead8');
    P.px(x0 + L + 1, bt, Q.eyes ? dk(col, 0.2) : eyeC); P.px(x0 + L + 2, bt, Q.eyes ? dk(col, 0.2) : '#1a1a10');
    if (!jaw) P.px(x0 + L + 9, bt + 2, '#1a1a10');
    A.mouth = [x0 + L + 9, bt + 2]; A.head = [x0 + L, bt, 10, 4]; A.body = [x0, bt, L, bh]; A.top = bt - 2 - jaw; A.front = x0 + L + 10; A.back = x0 - tl; A.tail = [x0 - tl + 1, bt + 1];
    return { grounded: true };
  }
  // 正面：平たい鼻先と目のこぶ、脚は左右へ張り出す／背中：背のうろこと長い尾
  const W = 10;
  const legs = (c) => { P.rect(CX - W / 2 - 3, yb, 3, 2 - (fr === 0 ? 1 : 0), c); P.rect(CX + W / 2, yb, 3, 2 - (fr === 2 ? 1 : 0), c); P.px(CX - W / 2 - 4, G - (fr === 0 ? 1 : 0), c); P.px(CX + W / 2 + 3, G - (fr === 2 ? 1 : 0), c); };
  if (!B) {
    rrect(P, CX - W / 2, bt - 1, W, bh + 1, 1, dk(col, 0.05));
    legs(col);
    P.rect(CX - 4, yb - 1, 8, 3, col); P.rect(CX - 3, yb + 1, 6, 1, col2);
    P.shade();
    for (let x = CX - 3; x < CX + 3; x += 2) P.px(x, yb + 1, '#f0ead8');
    if (jaw) { P.rect(CX - 4, yb - 1 - jaw, 8, jaw + 1, '#8a2a30'); P.rect(CX - 4, yb - 3 - jaw, 8, 2, col); for (let x = CX - 3; x < CX + 3; x += 2) P.px(x, yb - 1 - jaw, '#f0ead8'); }
    P.rect(CX - 4, bt - 2 - jaw, 2, 2, col); P.rect(CX + 2, bt - 2 - jaw, 2, 2, col); P.px(CX - 3, bt - 2 - jaw, Q.eyes ? dk(col, 0.2) : eyeC); P.px(CX + 2, bt - 2 - jaw, Q.eyes ? dk(col, 0.2) : eyeC);
    P.px(CX - 2, yb - 1 - jaw, '#1a1a10'); P.px(CX + 1, yb - 1 - jaw, '#1a1a10');
  } else {
    for (let i = 0; i < 8; i++) { const t = i / 8; P.rect(CX - Math.round((1 - t) * 3) + Math.round(Math.sin(t * 3 + fr) * 2 * t), yb + 1 - Math.floor(i / 4), Math.max(1, Math.round((1 - t) * 6)), 1, col); }
    rrect(P, CX - W / 2, bt - 1, W, bh + 2, 1, col);
    legs(col);
    for (let y = bt - 1; y < yb; y += 2) { P.px(CX - 2, y, dk(col, 0.15)); P.px(CX + 1, y, dk(col, 0.15)); }
    P.shade();
  }
  A.mouth = [CX, yb]; A.head = [CX - 5, bt - 3, 10, 5]; A.body = [CX - 5, bt - 1, 10, bh + 2]; A.top = bt - 4 - jaw; A.front = CX; A.back = CX;
  return { grounded: true };
}

// ---------------------------------------------------------------- 入口
const PAINTERS = { quad: paintQuad, bird: paintBird, fish: paintFish, blob: paintBlob, biped: paintBiped, spider: paintSpider, dragon: paintDragon, bug: paintBug, lizard: paintLizard };
function drawCreatureWalk(c, def) {
  def = def || {};
  const painter = PAINTERS[def.shape] || paintQuad;
  const side = def.shape === 'biped' ? 'left' : 'right';
  let info = { grounded: true };
  const frame = (view, fr) => {
    const R = rngFrom('creature:' + c.id);
    R.role = c.role || null;
    CUR_ROLE = c.role || null;
    const P = new Pix(SW, SH);
    info = painter(P, R, c.sp, def, c.lv || 1, view, fr) || info;
    CUR_ROLE = null;
    return P;
  };
  // 一度描いて接地するかを確かめる
  frame('F', 1);
  const grounded = info.grounded !== false;
  return buildSheet(frame, { grounded, ground: GROUND, side, dead: c.dead, flying: !grounded, kind: 'creature' });
}
// 試験用：drawCreature と同じ歩行シート（1ピクセル単位で一致することを確かめるため）
export { drawCreatureWalk as __walkSheet };

// ================================================================ アニメーションの仕組み
// コマの指定：{ fr, q, pre, fx, under, post, d }
//   fr    …… 絵描き関数に渡す歩行コマ（0/1/2）。姿勢 Q と組み合わせる
//   q     …… 姿勢（Q）。種の骨組みごとに読む（lie・hg・mouth・arm・wrot・flap など）
//   pre   …… 輪郭を付ける前の変形 [['fwd',n], ['lift',n], ['rot',度,支点], ['shear',k], ['breathe',n], ['head',dx], ['squash',sy,sx], ['crumble',t], ['settle'], ['shake',n]]
//   under …… 体の後ろに描くもの（宝の山・玉座・巣・荷車・蜘蛛の巣・水たまり など）
//   fx    …… 体の上に描くもの（Zzz・声・炎・魔法・斬撃・土ぼこり・星 など）。左右反転の後に描くので文字は裏返らない
//   post  …… 仕上げ ['gray',t] ['fade',t] ['tint',色,t] ['light',t]
//   d     …… 表示時間（ms）
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function hash01(a, b = 0) { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15; return (h >>> 0) / 4294967296; }

// ---- 目印（A）の移動：変形に合わせて口・手・尾の位置も動かす
function mapAnchors(An, fn) {
  const pt = (k) => { if (An[k]) { const [x, y] = fn(An[k][0], An[k][1]); An[k] = [x, y]; } };
  for (const k of ['mouth', 'tip', 'hand', 'tail', 'grip']) pt(k);
  for (const k of ['head', 'body']) if (An[k]) { const [x, y] = fn(An[k][0], An[k][1]); An[k] = [x, y, An[k][2], An[k][3]]; }
  if (An.top != null) { const [, y] = fn(An.front ?? CX, An.top); An.top = y; }
  if (An.front != null) { const [x] = fn(An.front, GROUND - 2); An.front = x; }
  if (An.back != null) { const [x] = fn(An.back, GROUND - 2); An.back = x; }
  if (An.eyeY != null) { const [, y] = fn(CX, An.eyeY); An.eyeY = y; }
  if (An.neckY != null) { const [, y] = fn(CX, An.neckY); An.neckY = y; }
}
// 逆写像で描き直す（穴があかない）。fn(x, y) は「行き先 → 元」の座標
function remap(P, fn, pad = 24) {
  const b = P.bbox(); if (!b) return;
  const out = new Array(P.w * P.h).fill(null);
  const X0 = Math.max(0, b[0] - pad), X1 = Math.min(P.w - 1, b[2] + pad), Y0 = Math.max(0, b[1] - pad), Y1 = Math.min(P.h - 1, b[3] + pad);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const [sx, sy] = fn(x, y); const c = P.raw(sx, sy); if (c) out[y * P.w + x] = c; }
  P.d = out; P.x0 = X0; P.y0 = Y0; P.x1 = X1; P.y1 = Y1; P.fit();
}
function shiftPix(P, dx, dy) {
  if (!dx && !dy) return;
  const out = new Array(P.w * P.h).fill(null);
  for (let y = P.y0; y <= P.y1; y++) for (let x = P.x0; x <= P.x1; x++) { const c = P.d[y * P.w + x]; if (!c) continue; const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < P.w && ny < P.h) out[ny * P.w + nx] = c; }
  P.d = out; P.x0 += dx; P.x1 += dx; P.y0 += dy; P.y1 += dy; P.x0 = Math.max(0, P.x0); P.y0 = Math.max(0, P.y0); P.x1 = Math.min(P.w - 1, P.x1); P.y1 = Math.min(P.h - 1, P.y1);
}
function pivotOf(P, An, pv, face) {
  const b = P.bbox() || [CX, GROUND, CX, GROUND];
  if (Array.isArray(pv)) return pv;
  switch (pv) {
    case 'fb': return [face > 0 ? Math.min(b[2], (An.body ? An.body[0] + An.body[2] - 2 : b[2])) : Math.max(b[0], (An.body ? An.body[0] + 1 : b[0])), GROUND]; // 前足
    case 'bb': return [face > 0 ? (An.body ? An.body[0] + 1 : b[0]) : (An.body ? An.body[0] + An.body[2] - 2 : b[2]), GROUND]; // 後ろ足
    case 'c': return [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)];
    case 'b': default: return [CX, GROUND];
  }
}
// 変形を1つ当てる。view に合わない変形は飛ばす
function applyPre(P, An, t, view, face) {
  const [op, a, b2, c2] = t;
  const only = typeof t[t.length - 1] === 'string' && /^[SFB]+$/.test(t[t.length - 1]) ? t[t.length - 1] : null;
  if (only && !only.includes(view)) return;
  switch (op) {
    case 'fwd': { // 顔の向きへ進む（正面は下へ、背中は上へ）
      const dx = view === 'S' ? Math.round(a * face) : 0, dy = view === 'F' ? Math.round(a / 2) : view === 'B' ? -Math.round(a / 2) : 0;
      shiftPix(P, dx, dy); mapAnchors(An, (x, y) => [x + dx, y + dy]); break;
    }
    case 'lift': shiftPix(P, 0, -Math.round(a)); mapAnchors(An, (x, y) => [x, y - Math.round(a)]); break;
    case 'shift': shiftPix(P, Math.round(a), Math.round(b2 || 0)); mapAnchors(An, (x, y) => [x + Math.round(a), y + Math.round(b2 || 0)]); break;
    case 'shake': { const dx = Math.round(a); shiftPix(P, dx, 0); mapAnchors(An, (x, y) => [x + dx, y]); break; }
    case 'shear': { // 前へ傾く（足元は動かない）
      const k = a * (view === 'S' ? face : 0); if (!k) break;
      remap(P, (x, y) => [x - Math.round(k * (GROUND - y)), y]); mapAnchors(An, (x, y) => [x + Math.round(k * (GROUND - y)), y]); break;
    }
    case 'rot': { // 時計回りの度。横向きでは「前へのめる」向きを正とする
      const deg = view === 'S' ? a * face : (c2 === 'mirror' ? -a : a);
      const [px, py] = pivotOf(P, An, b2 || 'b', face);
      const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
      const ex = (v) => Math.abs(v) < 1e-9 ? 0 : v;
      const C = ex(cs), Sn = ex(sn);
      remap(P, (x, y) => { const dx = x - px, dy = y - py; return [Math.round(px + dx * C + dy * Sn), Math.round(py - dx * Sn + dy * C)]; }, 40);
      mapAnchors(An, (x, y) => { const dx = x - px, dy = y - py; return [Math.round(px + dx * C - dy * Sn), Math.round(py + dx * Sn + dy * C)]; });
      break;
    }
    case 'squash': { // 足元を基準に縦 a 倍・横 b2 倍
      const sy = a, sx = b2 ?? 1;
      remap(P, (x, y) => [Math.round(CX + (x - CX) / sx), Math.round(GROUND - (GROUND - y) / sy)]); mapAnchors(An, (x, y) => [Math.round(CX + (x - CX) * sx), Math.round(GROUND - (GROUND - y) * sy)]); break;
    }
    case 'breathe': { // 胸の高さより上を a px 持ち上げる（息を吸う）
      const n = Math.round(a); if (!n) break;
      const yc = b2 ?? (An.body ? An.body[1] + Math.floor(An.body[3] / 2) : GROUND - 6);
      for (let y = Math.max(0, P.y0 - n); y < yc && y < P.h; y++) for (let x = P.x0; x <= P.x1; x++) P.d[y * P.w + x] = y + n < yc ? P.d[(y + n) * P.w + x] : P.d[yc * P.w + x];
      P.y0 = Math.max(0, P.y0 - n);
      mapAnchors(An, (x, y) => [x, y < yc ? y - n : y]); break;
    }
    case 'head': { // 首より上だけ横へずらす（見回す）
      const ny = An.neckY; if (ny == null) break; const dx = Math.round(a), dy = Math.round(b2 || 0);
      const out = P.d.slice();
      for (let y = P.y0; y < ny; y++) for (let x = P.x0; x <= P.x1; x++) out[y * P.w + x] = null;
      for (let y = P.y0; y < ny; y++) for (let x = P.x0; x <= P.x1; x++) { const c = P.d[y * P.w + x]; if (!c) continue; const nx = x + dx, yy = Math.min(ny - 1 + Math.max(0, dy), y + dy); if (nx >= 0 && nx < P.w && yy >= 0) out[yy * P.w + nx] = c; }
      P.d = out; P.x0 = Math.max(0, P.x0 - Math.abs(dx)); P.x1 = Math.min(P.w - 1, P.x1 + Math.abs(dx));
      if (An.mouth && An.mouth[1] < ny) An.mouth = [An.mouth[0] + dx, An.mouth[1] + dy]; if (An.head) An.head = [An.head[0] + dx, An.head[1] + dy, An.head[2], An.head[3]]; if (An.eyeY != null) An.eyeY += dy;
      break;
    }
    case 'settle': { const bb = P.bbox(); if (bb) { const dy = GROUND - bb[3]; shiftPix(P, 0, dy); mapAnchors(An, (x, y) => [x, y + dy]); } break; }
    case 'crumble': crumble(P, a, b2 || 3, An); break;
    case 'closeEyes': closeEyes(P, An, view); break;
    case 'mouth': { // 口を開ける（叫ぶ・食べる）
      if (view === 'B' || !An.mouth) break; const [mx, my] = An.mouth;
      if (view === 'S') { P.px(mx, my, '#2a1016'); P.px(mx + face, my, '#2a1016'); P.px(mx, my + 1, '#5a1a22'); }
      else { P.rect(mx - 1, my, 2, 2, '#2a1016'); P.px(mx - 1, my + 1, '#7a2a32'); }
      break;
    }
  }
}
// 崩れる：3px のかけらに分け、下から順に地面へ積もる（骨の山・瓦礫の山）
function crumble(P, t, bs, An) {
  const b = P.bbox(); if (!b || t <= 0) return;
  const blocks = [];
  for (let by = b[1]; by <= b[3]; by += bs) for (let bx = b[0]; bx <= b[2]; bx += bs) {
    const px = []; for (let j = 0; j < bs; j++) for (let i = 0; i < bs; i++) { const c = P.raw(bx + i, by + j); if (c) px.push([i, j, c]); }
    if (px.length) blocks.push({ bx, by, px });
  }
  blocks.sort((p, q) => q.by - p.by || Math.abs(p.bx - CX) - Math.abs(q.bx - CX));
  const top = new Array(P.w).fill(GROUND + 1);
  const e = t * t * (3 - 2 * t);
  const out = new Array(P.w * P.h).fill(null);
  for (const k of blocks) {
    const jit = Math.round((hash01(k.bx, k.by) - 0.5) * 8);
    const nx = Math.max(1, Math.min(P.w - bs - 1, k.bx + Math.round((k.bx + bs / 2 - CX) * 1.2) + jit));
    const low = new Array(bs).fill(-1), high = new Array(bs).fill(99);
    for (const [i, j] of k.px) { if (j > low[i]) low[i] = j; if (j < high[i]) high[i] = j; }
    let ny = 999; for (let i = 0; i < bs; i++) if (low[i] >= 0) ny = Math.min(ny, top[nx + i] - 1 - low[i]);
    ny = Math.min(ny, GROUND - Math.max(...low));
    for (let i = 0; i < bs; i++) if (low[i] >= 0) top[nx + i] = Math.min(top[nx + i], ny + high[i]);
    const cx2 = Math.round(k.bx + (nx - k.bx) * e), cy2 = Math.round(k.by + (ny - k.by) * e);
    for (const [i, j, c] of k.px) { const x = cx2 + i, y = cy2 + j; if (x >= 0 && y >= 0 && x < P.w && y < P.h) out[y * P.w + x] = c; }
  }
  P.d = out; P.x0 = 0; P.y0 = 0; P.x1 = P.w - 1; P.y1 = P.h - 1; P.fit();
  if (An.top != null) An.top = Math.round(An.top + (GROUND - 6 - An.top) * e);
}
// 閉じた目：目の行の、肌と違う色を肌の暗い色で塗る
function closeEyes(P, An, view) {
  if (view === 'B' || An.eyeY == null || !An.head) return;
  const y = An.eyeY, x0 = Math.round(An.head[0]), x1 = Math.round(An.head[0] + An.head[2] - 1);
  const skin = P.get(x0 + 1, y + 1) || P.get(x0 + 1, y - 1) || P.get(Math.round((x0 + x1) / 2), y - 2);
  if (!skin) return;
  for (let x = x0; x <= x1; x++) { const c = P.get(x, y); if (c && c !== skin) P.px(x, y, dk(skin, 0.22)); }
}
function applyPost(P, t) {
  const [op, a, b] = t;
  if (op === 'gray') P.mapColors((c) => mix(c, mix(gray(c), '#6a6a78', 0.3), a));
  else if (op === 'tint') P.mapColors((c) => mix(c, a, b));
  else if (op === 'fade') { for (let y = P.y0; y <= P.y1; y++) for (let x = P.x0; x <= P.x1; x++) if (P.d[y * P.w + x] && bayer(x, y) < a) P.d[y * P.w + x] = null; }
  else if (op === 'light') { // 光に溶ける：明るくしながら下から消える
    const b0 = P.bbox(); if (!b0) return; const h = b0[3] - b0[1] + 1;
    for (let y = P.y0; y <= P.y1; y++) for (let x = P.x0; x <= P.x1; x++) { const c = P.d[y * P.w + x]; if (!c) continue; const up = (b0[3] - y) / h; const k = a * 1.4 - up * 0.6; if (bayer(x, y) < k) P.d[y * P.w + x] = null; else P.d[y * P.w + x] = mix(c, '#fff4c8', Math.min(0.85, a)); }
  }
}

// ---- 上に描く効果（fx）と、後ろに描くもの（under）
// どれも (P, An, view, face, k, ...) を受け取る。k はコマ番号（動きの段階）
const OUT = '#1c1622';
function glyph(P, rows, x, y, c, oc = OUT) {
  const on = (i, j) => rows[j] && rows[j][i] === '#';
  for (let j = -1; j <= rows.length; j++) for (let i = -1; i <= rows[0].length; i++) if (!on(i, j) && (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1))) P.px(x + i, y + j, oc);
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[0].length; i++) if (on(i, j)) P.px(x + i, y + j, c);
}
const G_Z = ['####', '..#.', '.#..', '####'], G_ZZ = ['#####', '...#.', '..#..', '.#...', '#####'], G_BANG = ['#', '#', '#', '.', '#'];
const G_STAR = ['.#.', '###', '.#.'], G_NOTE = ['.##', '.#.', '##.'];
function headTop(An) { return [An.head ? Math.round(An.head[0] + An.head[2] / 2) : CX, An.top != null ? An.top : GROUND - 20]; }
function star(P, x, y, r, c1 = '#ffffff', c2 = '#ffe070') {
  P.px(x, y, c1);
  for (let i = 1; i <= r; i++) { const c = i === 1 ? c1 : c2; P.px(x + i, y, c); P.px(x - i, y, c); P.px(x, y + i, c); P.px(x, y - i, c); }
  if (r >= 2) { P.px(x + 1, y + 1, c2); P.px(x - 1, y - 1, c2); P.px(x + 1, y - 1, c2); P.px(x - 1, y + 1, c2); }
}
const FX = {
  zzz(P, An, view, face, k) {
    const [hx, ty] = headTop(An); const x = hx + (view === 'S' ? face * 3 : 3);
    glyph(P, G_Z, x, ty - 3 - (k % 3), '#e8ecff');
    if (k % 3 >= 1) glyph(P, G_ZZ, x + (view === 'S' ? face * 4 : 4) - (face < 0 && view === 'S' ? 1 : 0), ty - 9 - (k % 3), '#ffffff');
  },
  sound(P, An, view, face, k) { // 鳴き声：口の前に弧
    const [mx, my] = An.mouth || headTop(An);
    const c = '#fff6d8';
    const arc = (x, y, r, s) => { for (let j = -r; j <= r; j++) P.px(x + s * (r - Math.round(Math.sqrt(Math.max(0, r * r - j * j)) * 0.6)), y + j, c); };
    if (view === 'S') { arc(mx + face * 2, my, 1 + (k & 1), face); arc(mx + face * 4, my, 2 + (k & 1), face); }
    else { const [hx, ty] = headTop(An); arc(hx - 5, ty + 2, 1 + (k & 1), -1); arc(hx + 5, ty + 2, 1 + (k & 1), 1); if (k & 1) { arc(hx - 7, ty + 2, 2, -1); arc(hx + 7, ty + 2, 2, 1); } }
  },
  note(P, An, view, face, k) { const [hx, ty] = headTop(An); glyph(P, G_NOTE, hx + (view === 'S' ? face * 4 : 4), ty - 2 - (k & 1), '#fff0a0'); },
  bang(P, An, view, face, k) { const [hx, ty] = headTop(An); glyph(P, G_BANG, hx, ty - 7 - (k & 1), '#ffe040'); },
  roar(P, An, view, face, k) { // 咆哮の衝撃線
    const [mx, my] = An.mouth || headTop(An); const c = '#fff8e0', L2 = 3 + (k & 1) * 2;
    if (view === 'S') { for (const dy of [-3, 0, 3]) P.line(mx + face * 2, my + dy, mx + face * (2 + L2), my + dy * 2, c); }
    else if (view === 'F') { for (const dx of [-5, 0, 5]) P.line(mx + dx, my + 2, mx + dx * 2, my + 2 + L2, c); }
    else { const [hx, ty] = headTop(An); for (const dx of [-6, 6]) P.line(hx + dx, ty, hx + dx * 1.6, ty - L2, c); }
  },
  angry(P, An, view, face, k) { const [hx, ty] = headTop(An); const x = hx + (view === 'S' ? face * 3 : 4), y = ty - 3; const c = '#ff3040'; P.px(x - 1, y - 1, c); P.px(x + 1, y - 1, c); P.px(x - 1, y + 1, c); P.px(x + 1, y + 1, c); if (k & 1) { P.px(x - 2, y - 2, c); P.px(x + 2, y + 2, c); } },
  grass(P, An, view, face, k) { // 口元の草（食べるほど減る）
    const [mx] = An.mouth || [CX, 0]; const x = view === 'S' ? mx + face : mx; const n = Math.max(1, 4 - (k % 4));
    const gc = ['#4a9a30', '#5ab040', '#3a8a28', '#6ac050'];
    for (let i = 0; i < n; i++) { const xx = x + (i - 1) * (view === 'S' ? face : 1) + (i === 3 ? 1 : 0); const h = 2 + ((i + k) % 2); P.rect(xx, GROUND - h + 1, 1, h, gc[i]); }
  },
  seeds(P, An, view, face, k) { const [mx] = An.mouth || [CX, 0]; const x = view === 'S' ? mx + face : mx; for (let i = 0; i < 4 - (k % 2); i++) P.px(x - 2 + i * 2 + (k & 1), GROUND, i & 1 ? '#d8c070' : '#b89850'); },
  meat(P, An, view, face, k) { // 獲物の肉（骨つき）
    const [mx] = An.mouth || [CX, 0]; const x = view === 'S' ? mx + face * 1 : mx, y = GROUND - 1;
    P.ell(x, y, 2.6 - (k % 3) * 0.3, 1.6, '#a83232'); P.px(x - 1, y - 1, '#d86a5a'); P.px(x, y - 1, '#d86a5a');
    P.rect(x + (view === 'S' ? face * 2 : 2), y - 1, 2, 1, '#f0ead8'); P.px(x + (view === 'S' ? face * 3 : 3), y - 2, '#f0ead8');
    if (k & 1) P.px(x - (view === 'S' ? face : 1) * 3, y + 1, '#8a2020');
  },
  water(P, An, view, face, k) { // 水たまりと波紋
    const [mx] = An.mouth || [CX, 0]; const x = view === 'S' ? mx : mx;
    P.ell(x, GROUND, 4.5, 1.1, '#3a78c8'); P.rect(x - 2, GROUND, 3, 1, '#5a98e0'); P.px(x - 3 + (k % 3), GROUND - 1 + 0, (k & 1) ? '#bfe4ff' : '#8ac8f8');
    if (k % 2) { P.px(x - 5, GROUND, '#8ac8f8'); P.px(x + 5, GROUND, '#8ac8f8'); }
  },
  slash(P, An, view, face, k) { // 爪・刃の斬撃
    const [mx, my] = An.mouth || headTop(An); const x0 = view === 'S' ? (An.front ?? mx) + face * 1 : mx - 3, y0 = (view === 'S' ? my - 4 : my - 1);
    for (let i = 0; i < 3; i++) { const x = x0 + (view === 'S' ? face * i * 2 : i * 3), y = y0 + i; P.line(x, y, x + (view === 'S' ? face * 3 : 2), y + 5, i === 1 ? '#ffffff' : '#d8ecff'); }
  },
  swing(P, An, view, face, k) { // 武器の軌跡（弧）
    const [gx, gy] = An.grip || An.hand || [CX, GROUND - 12]; const r = 9;
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.45 + i * (Math.PI * 0.62 / 8); const x = view === 'S' ? gx + face * Math.round(Math.sin(a) * r) : gx + (view === 'F' ? -1 : 1) * Math.round(Math.sin(a) * r), y = gy - Math.round(Math.cos(a) * r); P.px(x, y, i > 5 ? '#ffffff' : '#c8dcff'); if (i > 3) P.px(x, y + 1, '#e8f0ff'); }
  },
  bite(P, An, view, face, k) { const [mx, my] = An.mouth || headTop(An); const x = view === 'S' ? mx + face * 2 : mx, y = view === 'S' ? my : my + 2; P.px(x, y - 2, '#ffffff'); P.px(x + (view === 'S' ? face : 1), y - 1, '#ffffff'); P.px(x, y + 2, '#ffffff'); P.px(x + (view === 'S' ? face : 1), y + 1, '#ffffff'); },
  impact(P, An, view, face, k, at) {
    let x, y; if (at === 'back' && view === 'S') { x = (An.back ?? CX) - face * 2; y = GROUND - 5; }
    else if (at === 'tip' && (An.tip || An.tail)) { [x, y] = An.tip || An.tail; }
    else { const m = An.mouth || headTop(An); x = view === 'S' ? (An.front ?? m[0]) + face * 2 : m[0]; y = view === 'S' ? m[1] : view === 'F' ? m[1] + 4 : m[1] - 4; }
    star(P, x, y, 2 + (k & 1));
  },
  fire(P, An, view, face, k) { // 竜の息（炎）
    const [mx, my] = An.mouth || headTop(An); const len = [10, 18, 24, 16][k % 4];
    const col = (d, off) => { const v = (off / (1 + d * 0.35)); return v < 0.35 ? '#fff4b0' : v < 0.7 ? '#ffb030' : '#e84020'; };
    if (view === 'S') { for (let d = 1; d <= len; d++) { const h = 1 + d * 0.33; for (let j = -Math.ceil(h); j <= Math.ceil(h); j++) { if (hash01(d * 7 + k, j + 20) < 0.18 && Math.abs(j) > h * 0.6) continue; P.px(mx + face * d, my + j + Math.round(d * 0.15), col(d, Math.abs(j))); } } }
    else if (view === 'F') { for (let d = 1; d <= len * 0.6; d++) { const h = 1 + d * 0.45; for (let j = -Math.ceil(h); j <= Math.ceil(h); j++) { if (hash01(d * 5 + k, j + 9) < 0.15 && Math.abs(j) > h * 0.6) continue; P.px(mx + j, my + d, col(d, Math.abs(j))); } } }
    else { const [hx, ty] = headTop(An); for (let j = -3; j <= 3; j++) P.px(hx + j, ty - 1 - (Math.abs(j) < 2 ? 2 : 1), col(3, Math.abs(j))); }
  },
  smoke(P, An, view, face, k) { const [mx, my] = An.mouth || headTop(An); const x = view === 'S' ? mx : mx; for (let i = 0; i < 2; i++) P.ell(x + (view === 'S' ? face * i : i - 1), my - 2 - i * 2 - (k % 3), 1 + i * 0.4, 1, i ? '#a8a0a8' : '#c8c0c8'); },
  magic(P, An, view, face, k, color = '#60f080') { // 杖の先の光
    const [x, y] = An.tip || An.hand || headTop(An); const r = 2 + (k & 1);
    for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4 + k * 0.4; P.px(x + Math.round(Math.cos(t) * (r + 1)), y + Math.round(Math.sin(t) * (r + 1)), a & 1 ? color : lt(color, 0.2)); }
    P.ell(x, y, 1.5, 1.5, lt(color, 0.3)); P.px(x, y, '#ffffff');
  },
  bolt(P, An, view, face, k, color = '#60f080') { // 飛んでいく魔法の弾
    const [x0, y0] = An.tip || An.hand || An.mouth || headTop(An); const d = 5 + k * 6;
    const x = view === 'S' ? x0 + face * d : x0, y = view === 'S' ? y0 + 2 : view === 'F' ? y0 + d * 0.6 : y0 - d * 0.5;
    P.ell(x, y, 2.2, 2.2, color); P.ell(x, y, 1.2, 1.2, lt(color, 0.3)); P.px(x, y, '#ffffff');
    for (let i = 1; i <= 3; i++) P.px(view === 'S' ? x - face * (2 + i * 2) : x, view === 'S' ? y + (i & 1) : view === 'F' ? y - 2 - i * 2 : y + 2 + i * 2, lt(color, 0.1));
  },
  burst(P, An, view, face, k, color = '#c02040') { // 魔王の闇の波動（二重の輪）
    const [hx, ty] = headTop(An); const cy = ty + 16, r = 6 + (k % 4) * 5;
    for (const [rr, c] of [[r, color], [r - 2, '#ff9ab0'], [r - 4, '#5a1030']]) { if (rr < 2) continue; for (let a = 0; a < 56; a++) { const t = a * Math.PI / 28; P.px(hx + Math.round(Math.cos(t) * rr), cy + Math.round(Math.sin(t) * rr * 0.6), c); } }
  },
  circle(P, An, view, face, k, color = '#80f0a0') { // 地面の魔法陣（体の上にも少しかかる）
    for (let a = 0; a < 32; a++) { const t = a * Math.PI / 16 + k * 0.2; const x = CX + Math.round(Math.cos(t) * 12), y = GROUND - 1 + Math.round(Math.sin(t) * 2.5); if (Math.sin(t) > 0) P.px(x, y, a % 4 === 0 ? '#ffffff' : color); }
  },
  poison(P, An, view, face, k) { const [x, y] = An.tail || An.mouth || headTop(An); P.px(x, y + 2 + (k % 3), '#80e040'); P.px(x + 1, y + 4 + (k % 3), '#60c030'); P.px(x - 1, y + 1, '#a0f060'); },
  web(P, An, view, face, k) { const [x, y] = An.mouth || headTop(An); const d = 4 + k * 5; const px = view === 'S' ? x + face * d : x, py = view === 'S' ? y : view === 'F' ? y + d / 2 : y - d / 2; P.line(x, y, px, py, '#e8e8f0'); star(P, Math.round(px), Math.round(py), 2, '#ffffff', '#d8d8e8'); },
  dust(P, An, view, face, k) { // 足元の土ぼこり
    const b = An.body || [CX - 6, 0, 12, 0]; const L2 = b[0] - 1, R2 = b[0] + b[2]; const s = 1 + (k % 2) * 0.6;
    P.ell(L2 - k, GROUND - 1, 1.6 * s, 1.2 * s, '#c8b89a'); P.ell(R2 + k, GROUND - 1, 1.6 * s, 1.2 * s, '#d8ccb0'); if (k) { P.ell(L2 - 3 - k, GROUND - 2, 1, 1, '#e0d8c4'); P.ell(R2 + 3 + k, GROUND - 2, 1, 1, '#e0d8c4'); }
  },
  dirt(P, An, view, face, k) { const x = view === 'S' ? (An.front ?? CX) - face * 2 : CX; for (let i = 0; i < 3; i++) P.px(x - (view === 'S' ? face : 1) * (2 + i * 2 + k), GROUND - 2 - ((i + k) % 3) * 2, i & 1 ? '#8a6a40' : '#6a4a2a'); },
  hit(P, An, view, face, k, kind = 'blood') { // 当たった所の火花としぶき
    const b = An.body || [CX - 4, GROUND - 10, 8, 8]; const x = Math.round(b[0] + b[2] * (view === 'S' ? (face > 0 ? 0.7 : 0.3) : 0.5)), y = Math.round(b[1] + b[3] * 0.4);
    star(P, x, y, 2);
    const c = kind === 'bone' ? '#e8e4d8' : kind === 'stone' ? '#a8a498' : kind === 'slime' ? '#a0e8ff' : kind === 'dark' ? '#8a40c0' : '#c02030';
    P.px(x - 3, y - 2, c); P.px(x + 3, y - 1, c); P.px(x + 2, y + 3, c); if (k) P.px(x - 2, y + 3, c);
  },
  dizzy(P, An, view, face, k) { const [hx, ty] = headTop(An); for (let i = 0; i < 3; i++) { const t = (i / 3 + k * 0.12) * Math.PI * 2; const x = hx + Math.round(Math.cos(t) * 5), y = ty - 2 + Math.round(Math.sin(t) * 1.5); if (Math.sin(t) > -0.3 || i === 0) glyph(P, G_STAR, x - 1, y - 1, '#ffe040', '#3a2a10'); } },
  sweat(P, An, view, face, k) { const [hx, ty] = headTop(An); const x = hx + (view === 'S' ? -face * 3 : 4), y = ty + 3 + (k % 2); P.px(x, y, '#a8d8ff'); P.px(x, y + 1, '#6ab0f0'); P.px(x - 1, y + 1, '#8ac8f8'); },
  soul(P, An, view, face, k) { const [hx, ty] = headTop(An); const y = ty - 2 - k * 4; const x = hx + Math.round(Math.sin(k * 1.3) * 2); P.ell(x, y, 2, 2.4, '#d8f0ff'); P.px(x - 1, y - 1, '#ffffff'); P.px(x, y + 3, '#a8d0f0'); P.px(x + 1, y + 4, '#a8d0f0'); },
  beam(P, An, view, face, k) { // 天へ昇る光の柱（魔王の消滅）
    const w = Math.max(1, 7 - k); const b = An.body || [CX - 8, GROUND - 30, 16, 20];
    for (let y = 0; y <= GROUND; y++) for (let x = CX - w; x <= CX + w; x++) if (((x + y) & 1) === 0 || Math.abs(x - CX) < w / 2) P.px(x, y, Math.abs(x - CX) < w / 2 ? '#fffbe8' : '#ffe8a0');
    for (let i = 0; i < 6; i++) { const x = CX + Math.round((hash01(i, k) - 0.5) * 30), y = b[1] + Math.round(hash01(k, i) * (GROUND - b[1])); glyph(P, G_STAR, x, y, '#fff4c0', '#c09020'); }
  },
  smokeDark(P, An, view, face, k) { const b = An.body || [CX - 6, GROUND - 16, 12, 12]; for (let i = 0; i < 5; i++) { const x = b[0] + Math.round(hash01(i, 3) * b[2]), y = b[1] + Math.round(hash01(i, 7) * b[3]) - k * 3; P.ell(x, y, 1.5, 1.3, i & 1 ? '#5a2a6a' : '#3a1a4a'); } },
  splash(P, An, view, face, k) { const y = (An.cy ?? 50) + 4, x = CX; for (let i = -3; i <= 3; i++) P.px(x + i * 2, y - Math.abs(i) % 2 - (k & 1), i & 1 ? '#d8f4ff' : '#a8dcff'); P.px(x - 1, y - 3, '#ffffff'); P.px(x + 1, y - 4, '#ffffff'); },
  bubbles(P, An, view, face, k) { const [mx, my] = An.mouth || [CX, 50]; for (let i = 0; i < 2; i++) { const x = mx + (view === 'S' ? face * (1 + i) : i * 2 - 1), y = my - 3 - i * 3 - (k % 3); P.px(x, y, '#d8f0ff'); P.px(x + 1, y - 1, '#a8d8f8'); } },
  fishy(P, An, view, face, k) { const [mx, my] = An.mouth || [CX, 50]; const d = 8 - (k % 3) * 3; const x = view === 'S' ? mx + face * d : mx + 3, y = my + (k & 1); P.rect(x, y, 3, 1, '#c8d8e8'); P.px(x + (face > 0 ? 3 : -1), y - 1, '#a8b8c8'); P.px(x + (face > 0 ? 3 : -1), y + 1, '#a8b8c8'); },
  crack(P, An, view, face, k) { const c = '#3a3028'; for (const s2 of [-1, 1]) { P.line(CX + s2 * 3, GROUND, CX + s2 * (8 + k * 2), GROUND - 1, c); P.px(CX + s2 * (6 + k), GROUND - 3 - k, '#8a847a'); P.px(CX + s2 * (9 + k), GROUND - 4 - k, '#a8a498'); } },
  crumbs(P, An, view, face, k) { const [mx, my] = An.mouth || [CX, GROUND - 2]; const x = view === 'S' ? mx + face : mx; P.rect(x, GROUND - 1, 2, 2, '#e8c860'); P.px(x + 1, GROUND - 1, '#f8e090'); if (k & 1) { P.px(x - 2, GROUND, '#d8b850'); P.px(x + 3, GROUND, '#d8b850'); } },
  nut(P, An, view, face, k) { const [mx, my] = An.mouth || [CX, GROUND - 2]; const x = view === 'S' ? mx + face : mx; P.ell(x, my + 1, 1.2, 1.4, '#8a5a2a'); P.px(x, my, '#6a3a1a'); },
  food(P, An, view, face, k) { const [x, y] = An.hand || An.mouth || headTop(An); P.ell(x, y - 1, 1.8 - (k % 2) * 0.4, 1.3, '#a83232'); P.px(x - 1, y - 2, '#d86a5a'); P.px(x + 2, y - 1, '#f0ead8'); P.px(x + 3, y - 1, '#f0ead8'); },
  banana(P, An, view, face, k) { const [x, y] = An.hand || An.mouth || headTop(An); P.rect(x - 1, y - 2, 2, 3 - (k % 2), '#f0d040'); P.px(x, y - 3, '#6a8a2a'); },
  leaves(P, An, view, face, k) { const [mx, my] = An.mouth || headTop(An); const x = view === 'S' ? mx + face * 2 : mx; const y = my - 3; P.ell(x, y, 3, 2, '#4a9a30'); P.px(x - 1, y - 1, '#6ac050'); P.px(x + 1, y + 1, '#3a7a28'); if (k & 1) P.px(x + (view === 'S' ? face : 1) * 3, y + 2, '#6ac050'); },
  fly(P, An, view, face, k) { const [mx, my] = An.mouth || headTop(An); const d = 10 - (k % 3) * 3; const x = view === 'S' ? mx + face * d : mx + 2, y = my - 3 - (k & 1); P.px(x, y, '#1a1a1a'); P.px(x - 1, y - 1, '#d8e8f0'); P.px(x + 1, y - 1, '#d8e8f0'); },
  cocoon(P, An, view, face, k) { const [mx] = An.mouth || [CX, 0]; const x = view === 'S' ? mx + face * 2 : mx; P.ell(x, GROUND - 2, 1.8, 2.4, '#e8e8f0'); P.px(x, GROUND - 3, '#c8c8d8'); P.px(x, GROUND - 1, '#c8c8d8'); },
  wool(P, An, view, face, k) { // 刈られた毛の房と鋏
    const b = An.body || [CX - 6, GROUND - 10, 12, 7];
    for (let i = 0; i < 4; i++) { const x = b[0] + Math.round(hash01(i, 11) * b[2]), y = Math.min(GROUND - 1, b[1] + b[3] + ((i * 3 + k * 2) % 6)); P.rect(x, y, 2, 2, i & 1 ? '#f4f1ea' : '#e8e4da'); }
    const sx = view === 'S' ? b[0] + Math.round(b[2] * (face > 0 ? 0.3 : 0.7)) : b[0] + b[2] + 1, sy = b[1] - 2;
    P.line(sx, sy, sx + 3, sy + 3 - (k & 1), '#b8bcc4'); P.line(sx + 3, sy, sx, sy + 3, '#d8dce4'); P.px(sx - 1, sy - 1, '#8a3a2a');
  },
  bucket(P, An, view, face, k) { const b = An.body || [CX - 6, GROUND - 10, 12, 7]; const x = view === 'S' ? b[0] + Math.round(b[2] * (face > 0 ? 0.45 : 0.55)) - 2 : CX + 3; P.rect(x, GROUND - 3, 5, 4, '#8a6a40'); P.rect(x, GROUND - 2, 5, 1, '#5a4a3a'); P.rect(x + 1, GROUND - 3, 3, 1, '#f8f8f0'); },
  milk(P, An, view, face, k) { const b = An.body || [CX - 6, GROUND - 10, 12, 7]; const x = view === 'S' ? b[0] + Math.round(b[2] * (face > 0 ? 0.45 : 0.55)) : CX + 4; const y = b[1] + b[3]; P.px(x, y + 1 + (k % 3), '#ffffff'); if (k % 3 === 1) P.px(x, y + 3, '#f0f0f0'); },
  letter(P, An, view, face, k) { const [x, y] = An.hand || headTop(An); P.rect(x - 1, y - 3, 4, 3, '#f0e8d0'); P.px(x, y - 2, '#c02030'); },
  rock(P, An, view, face, k) { const [hx, ty] = headTop(An); P.ell(hx, ty - 3, 5, 3.5, '#8a847a'); P.ell(hx - 1, ty - 4, 3, 2, '#a8a498'); P.px(hx + 2, ty - 2, '#6a645a'); },
  sparkle(P, An, view, face, k, color = '#fff4c0') { const b = An.body || [CX - 6, GROUND - 16, 12, 12]; for (let i = 0; i < 3; i++) { const x = b[0] + Math.round(hash01(i, k + 3) * b[2]), y = b[1] - 2 + Math.round(hash01(k + 5, i) * (b[3] + 4)); P.px(x, y, '#ffffff'); P.px(x + 1, y, color); P.px(x - 1, y, color); P.px(x, y + 1, color); P.px(x, y - 1, color); } },
  yawn(P, An, view, face, k) {},
};
// 体の後ろ・下に描くもの（先に描いて、体をその上に重ねる）
const UNDER = {
  treasure(U, An, view, face, k) { // 宝の山
    const w = Math.max(8, Math.round((An.body ? An.body[2] : 12) * 0.75) + 4);
    for (let y = 0; y < 5; y++) { const hw = Math.round(w * Math.sqrt(1 - (y / 5) ** 2)); U.rect(CX - hw, GROUND - y, hw * 2, 1, y > 2 ? '#f0d060' : '#e0b840'); }
    for (let i = 0; i < 7; i++) { const x = CX - w + 1 + Math.round(hash01(i, 5) * (w * 2 - 2)), y = GROUND - Math.round(hash01(5, i) * 3); U.px(x, y, i % 3 === 0 ? '#fff6b0' : '#b08a20'); }
    U.px(CX - 3, GROUND - 3, '#d0303a'); U.px(CX + 4, GROUND - 2, '#3a7ad8'); U.px(CX + 1, GROUND - 4, '#fff8d0');
    U.rect(CX + w - 4, GROUND - 5, 5, 4, '#7a4a20'); U.rect(CX + w - 4, GROUND - 5, 5, 1, '#c9a23a'); U.px(CX + w - 2, GROUND - 3, '#e8c040'); // 宝箱
  },
  throne(U, An, view, face, k) { // 魔王の玉座（背もたれは体の後ろ）
    const top = (An.top ?? GROUND - 40) - 4, x0 = CX - 13, w = 26;
    if (view === 'B') { U.rect(x0, top, w, GROUND - top + 1, '#3a1a2a'); U.rect(x0 + 2, top + 2, w - 4, GROUND - top - 6, '#4a2238'); U.rect(x0, top, w, 1, GOLD); return; }
    U.rect(x0, top, w, GROUND - top + 1, '#2a1220'); U.rect(x0 + 2, top + 2, w - 4, GROUND - top - 8, '#8a1020'); U.rect(x0 + 3, top + 3, w - 6, GROUND - top - 10, '#a81828');
    U.rect(x0, top, w, 1, GOLD); U.rect(x0, top, 1, GROUND - top, GOLD_D); U.rect(x0 + w - 1, top, 1, GROUND - top, GOLD_D);
    for (const s2 of [-1, 1]) { U.line(CX + s2 * 11, top, CX + s2 * 15, top - 6, '#e8e0c8'); U.line(CX + s2 * 12, top, CX + s2 * 16, top - 5, '#c8c0a8'); }
    U.rect(x0 - 3, GROUND - 12, 4, 13, '#2a1220'); U.rect(x0 + w - 1, GROUND - 12, 4, 13, '#2a1220'); U.rect(x0 - 3, GROUND - 12, 4, 1, GOLD); U.rect(x0 + w - 1, GROUND - 12, 4, 1, GOLD);
    U.px(CX, top + 1, '#ff2030');
  },
  nest(U, An, view, face, k) { U.ell(CX, GROUND - 1, 7, 2.5, '#a8804a'); for (let x = CX - 6; x <= CX + 6; x += 2) U.px(x, GROUND - 2 - ((x >> 1) & 1), '#c8a060'); U.ell(CX - 5, GROUND - 2, 1.4, 1.6, '#f8f0e0'); U.ell(CX + 5, GROUND - 2, 1.4, 1.6, '#f4e8d0'); },
  plow(U, An, view, face, k) { // すき（牛の後ろ）
    if (view !== 'S') { const b = An.body || [CX - 6, GROUND - 10, 12, 7]; U.rect(b[0] - 3, b[1] - 1, b[2] + 6, 2, '#7a5230'); return; }
    const b = An.body; const bx = face > 0 ? b[0] : b[0] + b[2] - 1, by = b[1] + Math.round(b[3] / 2);
    const px = bx - face * 9; U.line(bx, by, px, GROUND - 3, '#7a5230'); U.line(px, GROUND - 3, px - face * 2, GROUND - 7, '#7a5230');
    U.rect(Math.min(px, px + face * 2), GROUND - 2, 3, 3, '#9aa0aa'); U.px(px - face * 3, GROUND - 1 - (k & 1), '#6a4a2a'); U.px(px - face * 5, GROUND - (k & 1), '#8a6a40');
  },
  cart(U, An, view, face, k) { // 荷車（馬・ロバの後ろ）
    const b = An.body || [CX - 6, GROUND - 10, 12, 7];
    if (view !== 'S') { const y = b[1] + 2; U.line(b[0] - 1, y, b[0] - 2, GROUND - 2, '#7a5230'); U.line(b[0] + b[2], y, b[0] + b[2] + 1, GROUND - 2, '#7a5230'); if (view === 'B') { U.rect(b[0] - 3, b[1] - 6, b[2] + 6, 8, '#8a6a40'); U.rect(b[0] - 3, b[1] - 6, b[2] + 6, 1, '#b08a5a'); } return; }
    const bx = face > 0 ? b[0] : b[0] + b[2] - 1, wx = bx - face * 8, wy = GROUND - 4;
    U.line(bx + face * 4, b[1] + 3, wx + face * 2, b[1] + 3, '#7a5230');
    U.rect(Math.min(wx - face * 8, wx + face * 3), b[1] - 4, 12, 6, '#8a6a40'); U.rect(Math.min(wx - face * 8, wx + face * 3), b[1] - 4, 12, 1, '#b08a5a');
    U.ell(wx, wy, 4, 4, '#5a3a20'); U.ell(wx, wy, 2.6, 2.6, '#8a6a40'); const a = k * 0.8; for (let i = 0; i < 2; i++) U.line(wx - Math.round(Math.cos(a + i * 1.57) * 3), wy - Math.round(Math.sin(a + i * 1.57) * 3), wx + Math.round(Math.cos(a + i * 1.57) * 3), wy + Math.round(Math.sin(a + i * 1.57) * 3), '#5a3a20'); U.px(wx, wy, '#3a2a1a');
  },
  web(U, An, view, face, k) { const cx = CX, cy = GROUND - 16, r = 5 + Math.min(k, 3) * 3; for (let a = 0; a < 8; a++) { const t = a * Math.PI / 4; U.line(cx, cy, cx + Math.round(Math.cos(t) * r * 1.3), cy + Math.round(Math.sin(t) * r), '#d8d8e4'); } for (let ring = 3; ring <= r; ring += 3) for (let a = 0; a < 8; a++) { const t1 = a * Math.PI / 4, t2 = (a + 1) * Math.PI / 4; U.line(cx + Math.round(Math.cos(t1) * ring * 1.3), cy + Math.round(Math.sin(t1) * ring), cx + Math.round(Math.cos(t2) * ring * 1.3), cy + Math.round(Math.sin(t2) * ring), '#c8c8d8'); } },
  puddle(U, An, view, face, k, col = '#4fc3e8') { const w = 8 + k * 3; U.ell(CX, GROUND, w, 1.6, col); U.rect(CX - Math.round(w / 2), GROUND - 1, 2, 1, lt(col, 0.2)); },
  circle(U, An, view, face, k, color = '#80f0a0') { for (let a = 0; a < 40; a++) { const t = a * Math.PI / 20 + k * 0.2; const x = CX + Math.round(Math.cos(t) * 12), y = GROUND - 1 + Math.round(Math.sin(t) * 2.5); U.px(x, y, a % 5 === 0 ? '#ffffff' : color); } for (let a = 0; a < 5; a++) { const t = a * Math.PI * 2 / 5 + k * 0.2; U.px(CX + Math.round(Math.cos(t) * 7), GROUND - 1 + Math.round(Math.sin(t) * 1.4), '#ffffff'); } },
  branch(U, An, view, face, k) { const bb = An.bb || [CX - 4, 40, CX + 4, 50]; const hx = Math.round((bb[0] + bb[2]) / 2), y = bb[1] - 2; U.rect(hx - 8, y, 16, 2, '#6a4a2a'); U.px(hx + 6, y - 1, '#4a8a3a'); U.px(hx - 7, y - 1, '#4a8a3a'); },
  mud(U, An, view, face, k) { U.ell(CX, GROUND, 9, 1.4, '#6a4a2a'); U.px(CX - 4, GROUND - 1, '#8a6a40'); },
  sled(U, An, view, face, k) { if (view !== 'S') return; const b = An.body; const bx = face > 0 ? b[0] : b[0] + b[2] - 1; const sx = bx - face * 7; U.line(bx, b[1] + 3, sx, GROUND - 3, '#7a5230'); U.rect(Math.min(sx, sx - face * 9), GROUND - 5, 10, 4, '#a0342a'); U.rect(Math.min(sx, sx - face * 9) - 1, GROUND, 12, 1, '#c8a040'); U.px(face > 0 ? sx - 10 : sx + 10, GROUND - 1, '#c8a040'); },
};

// ================================================================ 種ごとのアニメーション表
// 骨組み（四つ足・地上の鳥・飛ぶ鳥・海の生き物・スライム・二足・蜘蛛・竜・サソリ・カエル/ヘビ/カメ/ワニ）で共有し、
// 種の違い（攻撃の型・仕事・鳴き方）は下の表で切り替える。
export const ANIM_NAMES = ['walk', 'run', 'idle', 'call', 'attack', 'hurt', 'dying', 'dead', 'graze', 'eat', 'drink', 'sleep', 'rest', 'groom', 'work', 'guard', 'fly', 'play'];
const f = (fr, q = {}, o = {}) => ({ fr, q, d: 300, ...o });
const V = (S, F, B) => ({ S, F, B }); // 向きごとに値を変える
const HOLD = 1e9;
const QUAD_ATK = { cow: 'charge', sheep: 'charge', pig: 'charge', goat: 'charge', deer: 'charge', reindeer: 'charge', boar: 'charge', unicorn: 'horn', horse: 'kick', donkey: 'kick', camel: 'kick', rabbit: 'kick', wolf: 'bite', fox: 'bite', dog: 'bite', rat: 'bite', squirrel: 'bite', bear: 'claw', polarbear: 'claw', tiger: 'claw', cat: 'claw' };
const QUAD_WORK = { cow: 'milk', sheep: 'shear', pig: 'root', horse: 'cart', goat: 'milk', deer: 'browse', reindeer: 'sled', boar: 'root', wolf: 'dig', fox: 'dig', bear: 'dig', rabbit: 'dig', squirrel: 'nut', camel: 'load', tiger: 'stalk', dog: 'herd', cat: 'stretch', donkey: 'cart', rat: 'gnaw', unicorn: 'heal' };
const HIT_KIND = (def, sp) => sp === 'golem' ? 'stone' : ['skeleton', 'skelknight', 'lich'].includes(sp) ? 'bone' : def.shape === 'blob' ? 'slime' : def.kind === 'demon' ? 'dark' : 'blood';
const walkSpec = (d = 150) => ({ loop: true, frames: [f(0, {}, { d }), f(1, {}, { d }), f(2, {}, { d }), f(1, {}, { d })], plain: true });
const hurtSpec = (q1 = {}, q2 = {}, hk = 'blood', extra = []) => ({ loop: false, frames: [
  f(1, { eyes: 'closed', ...q1 }, { pre: [['fwd', -2], ...extra], fx: [['hit', hk]], post: [['tint', '#ffffff', 0.55]], d: 90 }),
  f(1, { ...q2 }, { pre: [['fwd', -1], ['shear', -0.08], ...extra], fx: [['hit', hk]], d: 220 })] });

// ---------------------------------------------------------------- 四つ足
function specQuad(anim, x) {
  const { sp, def, role } = x;
  const grazer = def.diet !== 'meat', young = role === 'young', leader = role === 'leader';
  const atk = QUAD_ATK[sp] || (grazer ? 'charge' : 'bite');
  const hd = leader ? -1 : 0;
  const B1 = { earsBack: true };
  switch (anim) {
    case 'walk': return walkSpec(leader ? 170 : young ? 110 : 150);
    case 'idle':
      if (young) return { loop: true, frames: [f(1, { tail: 1 }, { d: 200 }), f(1, { legs: [-1, 1, -1, 1], tail: -1 }, { pre: [['lift', 2]], d: 130 }), f(1, { tail: 1 }, { pre: [['lift', 1]], d: 120 }), f(1, { tail: 0, eyes: 'closed' }, { d: 150 }), f(1, { tail: -1 }, { d: 260 })] };
      if (sp === 'dog') return { loop: true, frames: [f(1, { tail: 1, hdy: hd }, { d: 150 }), f(1, { tail: -1, hdy: hd }, { pre: [['breathe', 1]], d: 150 }), f(1, { tail: 1, hdy: hd, mouth: true }, { pre: [['breathe', 1]], d: 150 }), f(1, { tail: -1, hdy: hd, mouth: true }, { d: 150 })] };
      return { loop: true, frames: [f(1, { hdy: hd, tail: 0 }, { d: 480 }), f(1, { hdy: hd, tail: 1 }, { pre: [['breathe', 1]], d: 480 }), f(1, { hdy: hd, tail: 1, eyes: 'closed' }, { pre: [['breathe', 1]], d: 130 }), f(1, { hdy: hd, tail: -1 }, { d: 480 })] };
    case 'call': {
      if (sp === 'wolf' || sp === 'fox') return { loop: true, frames: [f(1, { hdy: -1 }, { d: 200 }), f(1, { hdy: -3, mouth: true }, { fx: [['sound']], d: 320 }), f(1, { hdy: -3, mouth: true }, { fx: [['sound']], d: 320 }), f(1, { hdy: -3, mouth: true }, { fx: [['sound']], d: 320 }), f(1, { hdy: -1 }, { d: 240 })] };
      if (sp === 'dog') return { loop: true, frames: [f(1, { mouth: true, tail: 1 }, { pre: [['fwd', 1]], fx: [['sound'], ...(role === 'watchdog' ? [['bang']] : [])], d: 130 }), f(1, { tail: -1 }, { d: 120 }), f(1, { mouth: true, tail: 1 }, { pre: [['fwd', 1]], fx: [['sound']], d: 130 }), f(1, { tail: -1 }, { d: 260 })] };
      if (['bear', 'polarbear', 'tiger', 'cat', 'boar', 'rat'].includes(sp)) return { loop: true, frames: [f(1, { ...B1, hdy: 1 }, { d: 200 }), f(1, { ...B1, hdy: 1, mouth: true }, { pre: [['fwd', 1]], fx: [['roar']], d: 260 }), f(1, { ...B1, hdy: 1, mouth: true }, { pre: [['fwd', 1]], fx: [['roar'], ['angry']], d: 260 }), f(1, { ...B1 }, { d: 200 })] };
      const rear = sp === 'horse' || sp === 'unicorn' || sp === 'donkey' ? [['rot', -10, 'bb', 'S'], ['lift', 1, 'FB']] : [];
      return { loop: true, frames: [f(1, { hdy: -1 }, { d: 200 }), f(1, { hdy: -2, mouth: true }, { pre: rear, fx: [['sound']], d: 300 }), f(1, { hdy: -2, mouth: true, tail: 1 }, { pre: rear, fx: [['sound']], d: 300 }), f(1, { hdy: -1, tail: -1 }, { d: 260 })] };
    }
    case 'attack':
      if (atk === 'bite') return { loop: true, frames: [
        f(1, { ...B1, fold: 0.3, hdy: 1, mouth: true }, { pre: [['fwd', -1]], d: 200 }),
        f(1, { ...B1, mouth: true, legs: [2, -2, 2, -2], step: 1 }, { pre: [['fwd', 4], ['lift', 1]], fx: [['bite']], d: 70 }),
        f(1, { ...B1, legs: [1, -1, 1, -1] }, { pre: [['fwd', 4]], fx: [['impact']], d: 170 }),
        f(1, { ...B1 }, { pre: [['fwd', 1]], d: 140 })] };
      if (atk === 'claw') return { loop: true, frames: [
        f(1, { ...B1, mouth: true, legs: [2, 0, 2, 0] }, { pre: [['rot', -22, 'bb', 'S'], ['lift', 2, 'FB']], d: 220 }),
        f(1, { ...B1, mouth: true, legs: [2, -1, 2, -1] }, { pre: [['rot', -6, 'bb', 'S'], ['fwd', 3]], fx: [['slash']], d: 70 }),
        f(1, { ...B1, legs: [1, -1, 1, -1] }, { pre: [['fwd', 3]], fx: [['impact']], d: 170 }),
        f(1, { ...B1 }, { pre: [['fwd', 1]], d: 140 })] };
      if (atk === 'kick') return { loop: true, frames: [
        f(1, { ...B1, hdy: 2, legs: [0, 1, 0, 1] }, { pre: [['fwd', -1]], d: 220 }),
        f(1, { ...B1, hdy: 3, legs: [0, -3, 0, -3], mouth: true }, { pre: [['rot', 12, 'fb', 'S'], ['lift', 1, 'FB']], fx: [['impact', 'back']], d: 90 }),
        f(1, { ...B1, hdy: 2, legs: [0, -2, 0, -2] }, { pre: [['rot', 8, 'fb', 'S']], fx: [['impact', 'back'], ['dust']], d: 160 }),
        f(1, { ...B1 }, { d: 160 })] };
      return { loop: true, frames: [ // 角・頭突きの突進
        f(1, { ...B1, hdy: 2, fold: 0.15 }, { pre: [['fwd', -1]], d: 240 }),
        f(1, { ...B1, hdy: 2, legs: [2, -2, 2, -2] }, { pre: [['fwd', 5]], fx: atk === 'horn' ? [['sparkle']] : [], d: 80 }),
        f(1, { ...B1, hdy: 1 }, { pre: [['fwd', 5]], fx: [['impact'], ['dust']], d: 170 }),
        f(1, { ...B1 }, { pre: [['fwd', 2]], d: 150 })] };
    case 'hurt': return hurtSpec(B1, B1, HIT_KIND(def, sp));
    case 'dying': return { loop: true, frames: [
      f(1, { ...B1, fold: 0.25, hdy: 2, tail: 0 }, { pre: [['shear', 0.06]], fx: [['dizzy']], d: 320 }),
      f(1, { ...B1, fold: 0.35, hdy: 3, tail: 0, eyes: 'closed' }, { pre: [['shear', -0.04]], fx: [['dizzy']], d: 320 }),
      f(1, { ...B1, fold: 0.3, hdy: 2, tail: 0 }, { pre: [['shear', 0.03]], fx: [['dizzy'], ['sweat']], d: 320 }),
      f(1, { ...B1, fold: 0.4, hdy: 3, tail: 0 }, { fx: [['dizzy']], d: 320 })] };
    case 'dead': return { loop: false, frames: [
      f(1, { ...B1, eyes: 'closed', fold: 0.2, hdy: 2 }, { pre: [['fwd', -1]], post: [['tint', '#ffffff', 0.4]], d: 120 }),
      f(1, { ...B1, fold: 0.6, hg: 0.5, eyes: 'closed' }, { pre: [['rot', 10, 'fb', 'S']], d: 150 }),
      f(1, { ...B1, lie: 2, hg: 1, eyes: 'x', tail: 0 }, { fx: [['dust']], d: 170 }),
      f(1, { ...B1, lie: 2, hg: 1, eyes: 'x', tail: 0 }, { post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat':
      if (anim === 'eat' && !grazer) return { loop: true, frames: [
        f(1, { hg: 0.9, fold: 0.15, mouth: true }, { fx: [['meat']], d: 220 }), f(1, { hg: 1, fold: 0.2 }, { fx: [['meat']], d: 180 }),
        f(1, { hg: 0.7, fold: 0.15, mouth: true }, { pre: [['fwd', -1]], fx: [['meat']], d: 240 }), f(1, { hg: 1, fold: 0.2, tail: 1 }, { fx: [['meat']], d: 180 })] };
      if (!grazer) return { loop: true, frames: [f(1, { hg: 0.8, tail: 0 }, { d: 300 }), f(1, { hg: 0.9, tail: 1 }, { d: 200 }), f(1, { hg: 0.85, tail: -1 }, { pre: [['fwd', 1]], d: 300 })] };
      return { loop: true, frames: [f(1, { hg: 0.9 }, { fx: [['grass']], d: 340 }), f(1, { hg: 1, mouth: true }, { fx: [['grass']], d: 220 }), f(1, { hg: 0.95 }, { fx: [['grass']], d: 300 }), f(1, { hg: 0.85, tail: 1 }, { fx: [['grass']], d: 340 })] };
    case 'drink': return { loop: true, frames: [f(1, { hg: 1, fold: 0.15 }, { fx: [['water']], d: 320 }), f(1, { hg: 1, fold: 0.15, mouth: true }, { fx: [['water']], d: 200 }), f(1, { hg: 1, fold: 0.15, tail: 1 }, { fx: [['water']], d: 320 })] };
    case 'sleep': { const q = { lie: 1, hg: 1, eyes: 'closed', tail: 0, earsBack: true }; return { loop: true, frames: [f(1, q, { fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1]], fx: [['zzz']], d: 700 }), f(1, q, { fx: [['zzz']], d: 700 })] }; }
    case 'rest': return { loop: true, frames: [f(1, { lie: 1, tail: 0, hdy: hd }, { d: 600 }), f(1, { lie: 1, tail: 1, hdy: hd }, { pre: [['breathe', 1]], d: 600 }), f(1, { lie: 1, tail: 0, eyes: 'closed', hdy: hd }, { d: 160 }), f(1, { lie: 1, tail: -1, hdy: hd }, { d: 600 })] };
    case 'groom': return { loop: true, frames: [f(1, { fold: 0.3, hdx: V(-4, 2, 2), hdy: 3, mouth: true }, { d: 260 }), f(1, { fold: 0.3, hdx: V(-4, 2, 2), hdy: 2 }, { d: 200 }), f(1, { fold: 0.3, hdx: V(-5, 2, 2), hdy: 3, mouth: true }, { d: 260 }), f(1, { fold: 0.3, hdx: V(-3, 1, 1), hdy: 2, tail: 1 }, { d: 300 })] };
    case 'work': return quadWork(x);
    case 'guard':
      if (role === 'treasure') return { loop: true, frames: [f(1, { lie: 1, hdy: -1 }, { under: [['treasure']], d: 700 }), f(1, { lie: 1, hdy: -1, hdx: V(0, 1, 1) }, { under: [['treasure']], pre: [['breathe', 1]], d: 600 }), f(1, { lie: 1, hdy: -1, hdx: V(0, -1, -1) }, { under: [['treasure']], d: 600 })] };
      return { loop: true, frames: [f(1, { hdy: -1, tail: 0 }, { d: 600 }), f(1, { hdy: -2, hdx: V(1, 1, 1), tail: 0 }, { d: 500 }), f(1, { hdy: -2, tail: 0 }, { pre: [['breathe', 1]], d: 400 }), f(1, { hdy: -1, hdx: V(0, -1, -1), tail: 1 }, { d: 500 })] };
    case 'run': case 'fly': return { loop: true, frames: [
      f(1, { legs: [2, -2, 2, -2], step: 1, tail: -1 }, { pre: [['lift', 1]], d: 90 }), f(1, { legs: [1, 0, 1, 0], step: 0, tail: 0 }, { d: 80 }),
      f(1, { legs: [-2, 2, -2, 2], step: -1, tail: 1 }, { pre: [['lift', 1]], d: 90 }), f(1, { legs: [0, -1, 0, -1], step: 0, tail: 0 }, { d: 80 })] };
    case 'play': return { loop: true, frames: [
      f(1, { legs: [-1, 1, -1, 1], tail: 1 }, { d: 120 }), f(1, { legs: [1, -1, 1, -1], tail: -1, mouth: true }, { pre: [['lift', 3]], d: 150 }),
      f(1, { legs: [1, -1, 1, -1], tail: 1 }, { pre: [['lift', 2]], d: 120 }), f(1, { tail: -1, hdy: 1 }, { pre: [['rot', 12, 'bb', 'S'], ['settle']], d: 260 })] };
  }
  return null;
}
function quadWork(x) {
  const { sp, role } = x;
  let w = QUAD_WORK[sp] || 'dig';
  if (sp === 'cow') w = role === 'plow' ? 'plow' : role === 'meat' ? 'graze' : 'milk';
  if ((sp === 'horse' || sp === 'donkey') && role === 'mount') w = 'saddle';
  const walk = (under, fx = [], d = 220, q = {}) => ({ loop: true, frames: [f(0, q, { under, fx, d }), f(1, q, { under, fx, d }), f(2, q, { under, fx, d }), f(1, q, { under, fx, d })] });
  switch (w) {
    case 'plow': return walk([['plow']], [['dirt']], 260, { hdy: 1 });
    case 'cart': return walk([['cart']], [], 200, { hdy: 1 });
    case 'sled': return walk([['sled']], [], 200);
    case 'saddle': return walk([], [], 130, { hdy: -1 });
    case 'load': return walk([], [['sparkle', '#e8d8b0']], 240, { hdy: 1 });
    case 'milk': return { loop: true, frames: [f(1, { tail: 1 }, { fx: [['bucket'], ['milk']], d: 260 }), f(1, { tail: 0 }, { fx: [['bucket'], ['milk']], d: 260 }), f(1, { tail: -1 }, { fx: [['bucket'], ['milk']], d: 260 }), f(1, { tail: 0, eyes: 'closed' }, { fx: [['bucket']], d: 200 })] };
    case 'shear': return { loop: true, frames: [f(1, { hdy: 1 }, { fx: [['wool']], d: 260 }), f(1, { hdy: 1, eyes: 'closed' }, { fx: [['wool']], d: 260 }), f(1, { hdy: 1 }, { fx: [['wool']], d: 260 })] };
    case 'root': return { loop: true, frames: [f(1, { hg: 1, mouth: true }, { under: [['mud']], fx: [['dirt']], d: 200 }), f(1, { hg: 0.9, tail: 1 }, { under: [['mud']], d: 200 }), f(1, { hg: 1, mouth: true }, { under: [['mud']], fx: [['dirt']], pre: [['fwd', 1]], d: 200 }), f(1, { hg: 0.9, tail: -1 }, { under: [['mud']], d: 200 })] };
    case 'browse': return { loop: true, frames: [f(1, { hdy: -3, mouth: true }, { fx: [['leaves']], d: 300 }), f(1, { hdy: -4 }, { fx: [['leaves']], d: 260 }), f(1, { hdy: -3, mouth: true, tail: 1 }, { fx: [['leaves']], d: 300 })] };
    case 'dig': return { loop: true, frames: [f(0, { hg: 0.5, fold: 0.2 }, { fx: [['dirt']], d: 150 }), f(2, { hg: 0.5, fold: 0.2 }, { fx: [['dirt']], d: 150 }), f(0, { hg: 0.55, fold: 0.2, tail: 1 }, { fx: [['dirt']], d: 150 }), f(2, { hg: 0.5, fold: 0.2, tail: -1 }, { d: 150 })] };
    case 'nut': return { loop: true, frames: [f(1, { fold: 0.3, mouth: true, hdy: -1 }, { fx: [['nut']], d: 140 }), f(1, { fold: 0.3, hdy: -1 }, { fx: [['nut']], d: 140 }), f(1, { fold: 0.3, mouth: true, hdy: -1, tail: 1 }, { fx: [['nut']], d: 140 }), f(1, { fold: 0.3, hdy: -1 }, { fx: [['nut']], d: 300 })] };
    case 'stalk': return walk([], [], 280, { fold: 0.45, hdy: 2, earsBack: true, tail: 0 });
    case 'herd': return { loop: true, frames: [f(1, { legs: [2, -2, 2, -2], step: 1, mouth: true }, { pre: [['lift', 1]], fx: [['sound'], ['bang']], d: 100 }), f(1, { legs: [1, 0, 1, 0], step: 0 }, { d: 90 }), f(1, { legs: [-2, 2, -2, 2], step: -1, mouth: true }, { pre: [['lift', 1]], fx: [['sound']], d: 100 }), f(1, { legs: [0, -1, 0, -1], step: 0 }, { d: 90 })] };
    case 'stretch': return { loop: true, frames: [f(1, {}, { d: 300 }), f(1, { hdy: 2, mouth: true, tail: 1 }, { pre: [['rot', 14, 'bb', 'S'], ['settle'], ['squash', 0.85, 1.1, 'FB']], d: 520 }), f(1, { hdy: 2, tail: 1 }, { pre: [['rot', 14, 'bb', 'S'], ['settle'], ['squash', 0.85, 1.1, 'FB']], d: 400 }), f(1, { hdy: -1 }, { pre: [['rot', -8, 'bb', 'S']], d: 360 })] };
    case 'gnaw': return { loop: true, frames: [f(1, { fold: 0.4, hg: 0.6, mouth: true }, { fx: [['crumbs']], d: 110 }), f(1, { fold: 0.4, hg: 0.7 }, { fx: [['crumbs']], d: 110 }), f(1, { fold: 0.4, hg: 0.6, mouth: true, tail: 1 }, { fx: [['crumbs']], d: 110 }), f(1, { fold: 0.4, hg: 0.5, hdy: -1 }, { fx: [['crumbs']], d: 260 })] };
    case 'heal': return { loop: true, frames: [f(1, { hdy: -1 }, { fx: [['sparkle']], d: 260 }), f(1, { hdy: -2 }, { fx: [['sparkle']], d: 260 }), f(1, { hdy: -1, eyes: 'closed' }, { fx: [['sparkle']], d: 260 })] };
    case 'graze': return specQuad('graze', x);
  }
  return specQuad('graze', x);
}

// ---------------------------------------------------------------- 地上の鳥（鶏・アヒル）
function specBirdG(anim, x) {
  const { sp, role } = x;
  const rooster = false;
  switch (anim) {
    case 'walk': return walkSpec(140);
    case 'idle': return { loop: true, frames: [f(1, { bob: 0 }, { d: 320 }), f(1, { bob: 1 }, { d: 280 }), f(1, { bob: 0, eyes: 'closed' }, { d: 120 }), f(1, { bob: 0, hdx: 1 }, { d: 320 })] };
    case 'call': return { loop: true, frames: [f(1, { hdy: -1 }, { d: 180 }), f(1, { hdy: -2, mouth: true, wing: 1 }, { fx: [['sound']], d: 260 }), f(1, { hdy: -2, mouth: true, wing: -1 }, { fx: [['sound']], d: 260 }), f(1, {}, { d: 220 })] };
    case 'attack': return { loop: true, frames: [f(1, { hdy: -1, wing: 1 }, { pre: [['fwd', -1]], d: 170 }), f(1, { hg: 0.4, hdx: 2, mouth: true, wing: -1 }, { pre: [['fwd', 3]], fx: [['bite']], d: 70 }), f(1, { hg: 0.4, hdx: 2 }, { pre: [['fwd', 3]], fx: [['impact']], d: 150 }), f(1, {}, { pre: [['fwd', 1]], d: 120 })] };
    case 'hurt': return hurtSpec({ wing: 1 }, { wing: -1 });
    case 'dying': return { loop: true, frames: [f(1, { sit: true, hdy: 1 }, { fx: [['dizzy']], d: 320 }), f(1, { sit: true, hdy: 2, eyes: 'closed' }, { fx: [['dizzy']], d: 320 }), f(1, { sit: true, hdy: 1, wing: -1 }, { fx: [['dizzy'], ['sweat']], d: 320 })] };
    case 'dead': return { loop: false, frames: [f(1, { wing: 1, eyes: 'closed' }, { pre: [['lift', 1]], post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { sit: true, eyes: 'closed', hdy: 2 }, { d: 150 }),
      f(1, { eyes: 'closed', wing: -1 }, { pre: [['rot', -90, 'c', 'S'], ['squash', 0.5, 1.2, 'FB'], ['settle']], fx: [['dust']], d: 170 }), f(1, { eyes: 'closed', wing: -1 }, { pre: [['rot', -90, 'c', 'S'], ['squash', 0.5, 1.2, 'FB'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat': return { loop: true, frames: [f(1, { hg: 0 }, { fx: [['seeds']], d: 240 }), f(1, { hg: 1, mouth: true }, { fx: [['seeds']], d: 110 }), f(1, { hg: 0.8 }, { fx: [['seeds']], d: 160 }), f(1, { hg: 0, hdy: -1 }, { fx: [['seeds']], d: 260 })] };
    case 'drink': return { loop: true, frames: [f(1, { hg: 1 }, { fx: [['water']], d: 260 }), f(1, { hdy: -2, mouth: true }, { fx: [['water']], d: 300 }), f(1, { hdy: -1 }, { fx: [['water']], d: 200 })] };
    case 'sleep': { const q = { sit: true, hdx: -2, hdy: 2, eyes: 'closed' }; return { loop: true, frames: [f(1, q, { fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1]], fx: [['zzz']], d: 700 }), f(1, q, { fx: [['zzz']], d: 700 })] }; }
    case 'rest': return { loop: true, frames: [f(1, { sit: true }, { d: 600 }), f(1, { sit: true }, { pre: [['breathe', 1]], d: 600 }), f(1, { sit: true, eyes: 'closed' }, { d: 160 })] };
    case 'groom': return { loop: true, frames: [f(1, { hdx: -3, hdy: 2, wing: 1 }, { d: 240 }), f(1, { hdx: -2, hdy: 3 }, { d: 200 }), f(1, { hdx: -3, hdy: 2, mouth: true }, { d: 240 }), f(1, {}, { d: 300 })] };
    case 'work':
      if (sp === 'chicken') return { loop: true, frames: [f(1, { sit: true }, { under: [['nest']], d: 700 }), f(1, { sit: true }, { under: [['nest']], pre: [['breathe', 1]], d: 700 }), f(1, { sit: true, eyes: 'closed' }, { under: [['nest']], d: 200 }), f(1, { sit: true, hdx: 1 }, { under: [['nest']], d: 600 })] };
      return { loop: true, frames: [f(1, { hg: 1, mouth: true }, { fx: [['water']], d: 160 }), f(1, { hg: 0.8 }, { fx: [['water']], d: 160 }), f(1, { hg: 1, mouth: true }, { fx: [['water']], d: 160 }), f(1, { hdy: -1 }, { fx: [['water']], d: 300 })] };
    case 'guard': return { loop: true, frames: [f(1, { hdy: -1 }, { d: 500 }), f(1, { hdy: -1, hdx: 1 }, { d: 500 }), f(1, { hdy: -1, hdx: -1 }, { d: 500 })] };
    case 'fly': return { loop: true, frames: [f(1, { wing: 1 }, { pre: [['lift', 2]], d: 90 }), f(1, { wing: -1 }, { pre: [['lift', 4]], d: 90 }), f(1, { wing: 1 }, { pre: [['lift', 3]], d: 90 }), f(1, { wing: -1 }, { pre: [['lift', 1]], d: 90 })] };
    case 'run': return { loop: true, frames: [f(0, { wing: -1 }, { d: 80 }), f(1, { wing: -1 }, { d: 70 }), f(2, { wing: -1 }, { d: 80 }), f(1, { wing: -1 }, { d: 70 })] };
    case 'play': return { loop: true, frames: [f(1, {}, { d: 140 }), f(1, { wing: 1 }, { pre: [['lift', 3]], d: 150 }), f(1, { wing: -1 }, { pre: [['lift', 2]], d: 120 }), f(1, {}, { d: 200 })] };
  }
  return null;
}

// ---------------------------------------------------------------- 飛ぶ鳥・コウモリ（飛んでいる間は空中、地上の仕事はとまって行う）
function specFlyer(anim, x) {
  const { sp } = x;
  const bat = sp === 'bat', raptor = sp === 'eagle' || sp === 'owl';
  const air = { air: true, loop: true };
  const P1 = { perch: true };
  switch (anim) {
    case 'walk': return { ...walkSpec(110), air: true };
    case 'run': return { ...walkSpec(80), air: true, plain: false };
    case 'idle': return { ...air, frames: [f(1, { ang: -0.9 }, { d: 130 }), f(1, { ang: -0.4 }, { d: 110 }), f(1, { ang: 0.2 }, { d: 110 }), f(1, { ang: 0.55 }, { pre: [['lift', 1]], d: 130 }), f(1, { ang: 0.1 }, { pre: [['lift', 1]], d: 110 }), f(1, { ang: -0.4 }, { d: 110 })] };
    case 'call': return { ...air, frames: [f(0, { mouth: true }, { fx: [['sound']], d: 140 }), f(1, {}, { d: 120 }), f(2, { mouth: true }, { fx: [['sound']], d: 140 }), f(1, {}, { d: 160 })] };
    case 'attack': return { ...air, frames: [
      f(1, { ang: -0.9 }, { pre: [['fwd', -2], ['lift', 2]], d: 190 }),
      f(1, { ang: 0.55, talon: !bat, mouth: true }, { pre: [['rot', 25, 'c', 'S'], ['fwd', 4], ['lift', -3]], fx: [[bat ? 'bite' : 'slash']], d: 80 }),
      f(1, { ang: 0.3, talon: !bat }, { pre: [['rot', 15, 'c', 'S'], ['fwd', 4], ['lift', -3]], fx: [['impact']], d: 160 }),
      f(1, { ang: -0.4 }, { pre: [['fwd', 1]], d: 140 })] };
    case 'hurt': return { air: true, loop: false, frames: [f(1, { ang: -0.9, eyes: 'closed' }, { pre: [['fwd', -2], ['rot', -15, 'c', 'S']], fx: [['hit']], post: [['tint', '#ffffff', 0.55]], d: 90 }), f(1, { ang: 0.3 }, { pre: [['fwd', -1]], fx: [['hit']], d: 220 })] };
    case 'dying': return { ...air, frames: [f(1, { ang: 0.3 }, { pre: [['lift', -4], ['rot', 10, 'c', 'S']], fx: [['dizzy']], d: 260 }), f(1, { ang: -0.2, eyes: 'closed' }, { pre: [['lift', -6]], fx: [['dizzy'], ['sweat']], d: 260 }), f(1, { ang: 0.55 }, { pre: [['lift', -5], ['rot', 15, 'c', 'S']], fx: [['dizzy']], d: 260 }), f(1, { ang: -0.6 }, { pre: [['lift', -3]], fx: [['dizzy']], d: 260 })] };
    case 'dead': return { ground: true, air: false, loop: false, frames: [
      f(1, { ang: -0.9, eyes: 'closed' }, { pre: [['settle'], ['lift', 22]], post: [['tint', '#ffffff', 0.4]], d: 110 }),
      f(1, { ang: 0.55, eyes: 'closed' }, { pre: [['rot', 60, 'c', 'S'], ['settle'], ['lift', 11]], d: 110 }),
      f(1, { ang: 0.3, eyes: 'closed' }, { pre: [['rot', 180, 'c', 'S'], ['settle']], fx: [['dust']], d: 170 }),
      f(1, { ang: 0.3, eyes: 'closed' }, { pre: [['rot', 180, 'c', 'S'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'work': case 'eat':
      if (anim === 'eat' && (raptor || sp === 'crow' || sp === 'seagull')) return { loop: true, frames: [f(1, { ...P1, hg: 0.9, mouth: true }, { fx: [['meat']], d: 200 }), f(1, { ...P1, hg: 1 }, { fx: [['meat']], d: 180 }), f(1, { ...P1, hg: 0.5, mouth: true }, { fx: [['meat']], d: 240 })] };
      if (anim === 'work' && raptor) return specFlyer('guard', x);
      if (bat && anim !== 'graze') return { ...air, frames: [f(0, { mouth: true }, { fx: [['fly']], d: 110 }), f(1, {}, { fx: [['fly']], d: 110 }), f(2, { mouth: true }, { fx: [['fly']], d: 110 }), f(1, {}, { d: 110 })] };
      return { loop: true, frames: [f(1, { ...P1 }, { fx: [['seeds']], d: 220 }), f(1, { ...P1, hg: 1, mouth: true }, { fx: [['seeds']], d: 110 }), f(1, { ...P1, hg: 0.8 }, { fx: [['seeds']], d: 150 }), f(1, { ...P1, hdy: -1 }, { fx: [['seeds']], d: 260 })] };
    case 'drink': return { loop: true, frames: [f(1, { ...P1, hg: 1 }, { fx: [['water']], d: 260 }), f(1, { ...P1, hdy: -1, mouth: true }, { fx: [['water']], d: 300 }), f(1, { ...P1 }, { fx: [['water']], d: 200 })] };
    case 'sleep':
      if (bat) { const q = { ...P1, eyes: 'closed' }; return { air: true, loop: true, frames: [f(1, q, { pre: [['rot', 180, 'c']], under: [['branch']], fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1], ['rot', 180, 'c']], under: [['branch']], fx: [['zzz']], d: 700 })] }; }
      { const q = { ...P1, sit: true, eyes: 'closed', hdy: 1 }; return { loop: true, frames: [f(1, q, { fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1]], fx: [['zzz']], d: 700 }), f(1, q, { fx: [['zzz']], d: 700 })] }; }
    case 'rest': return { loop: true, frames: [f(1, { ...P1 }, { d: 600 }), f(1, { ...P1 }, { pre: [['breathe', 1]], d: 600 }), f(1, { ...P1, eyes: 'closed' }, { d: 150 })] };
    case 'groom': return { loop: true, frames: [f(1, { ...P1, hdx: -2, hdy: 2 }, { d: 240 }), f(1, { ...P1, wing: 1 }, { d: 200 }), f(1, { ...P1, hdx: -2, hdy: 3, mouth: true }, { d: 240 }), f(1, { ...P1 }, { d: 300 })] };
    case 'guard': return { loop: true, frames: [f(1, { ...P1, hdy: -1 }, { d: 600 }), f(1, { ...P1, hdx: 1 }, { d: 400 }), f(1, { ...P1, hdy: -1, eyes: sp === 'owl' ? 'closed' : undefined }, { d: 200 }), f(1, { ...P1, hdx: -1 }, { d: 500 })] };
    case 'fly': return { ...air, frames: [f(1, { ang: -0.15 }, { d: 220 }), f(1, { ang: -0.1 }, { pre: [['lift', 1]], d: 220 }), f(1, { ang: -0.22 }, { pre: [['lift', 1]], d: 220 }), f(1, { ang: -0.15 }, { d: 220 })] };
    case 'play': return { ...air, frames: [f(0, {}, { pre: [['rot', -20, 'c', 'S']], d: 110 }), f(1, {}, { pre: [['lift', 2]], d: 110 }), f(2, {}, { pre: [['rot', 20, 'c', 'S'], ['lift', 1]], d: 110 }), f(1, {}, { d: 110 })] };
  }
  return null;
}

// ---------------------------------------------------------------- 海の生き物（イルカ・クジラ）
function specFish(anim, x) {
  const { sp } = x;
  const whale = sp === 'whale';
  switch (anim) {
    case 'walk': return walkSpec(whale ? 260 : 180);
    case 'run': case 'fly': return { ...walkSpec(whale ? 160 : 100), plain: false };
    case 'idle': return { loop: true, frames: [f(0, {}, { d: 340 }), f(1, {}, { d: 300 }), f(2, {}, { d: 340 }), f(1, {}, { fx: [['bubbles']], d: 300 })] };
    case 'call': return whale
      ? { loop: true, frames: [f(1, { spout: true }, { fx: [['sound']], d: 400 }), f(1, { spout: true }, { d: 300 }), f(1, {}, { fx: [['sound']], d: 400 })] }
      : { loop: true, frames: [f(1, { mouth: true }, { pre: [['rot', -12, 'c', 'S'], ['lift', 1]], fx: [['sound']], d: 180 }), f(1, {}, { d: 140 }), f(1, { mouth: true }, { pre: [['rot', -12, 'c', 'S'], ['lift', 1]], fx: [['sound']], d: 180 }), f(1, {}, { d: 200 })] };
    case 'attack': return { loop: true, frames: [f(1, {}, { pre: [['fwd', -2]], d: 200 }), f(0, { mouth: true }, { pre: [['fwd', 4]], fx: [['bite']], d: 80 }), f(2, {}, { pre: [['fwd', 4]], fx: [['impact']], d: 170 }), f(1, {}, { pre: [['fwd', 1]], d: 140 })] };
    case 'hurt': return hurtSpec({}, {}, 'blood', [['rot', -10, 'c', 'S']]);
    case 'dying': return { loop: true, frames: [f(1, { eyes: 'closed' }, { pre: [['rot', 20, 'c']], fx: [['bubbles']], d: 360 }), f(0, {}, { pre: [['rot', 15, 'c']], d: 360 }), f(1, { eyes: 'closed' }, { pre: [['rot', 25, 'c']], fx: [['sweat']], d: 360 })] };
    case 'dead': return { loop: false, frames: [f(1, { eyes: 'closed' }, { pre: [['fwd', -1]], post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { eyes: 'closed' }, { pre: [['rot', 90, 'c']], d: 200 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c']], d: 250 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c']], post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat': return { loop: true, frames: [f(0, { mouth: true }, { fx: [['fishy']], d: 200 }), f(1, {}, { pre: [['fwd', 1]], fx: [['fishy']], d: 160 }), f(2, { mouth: true }, { pre: [['fwd', 2]], fx: [['fishy']], d: 200 }), f(1, {}, { d: 240 })] };
    case 'drink': case 'guard': return specFish('idle', x);
    case 'sleep': return { loop: true, frames: [f(1, { eyes: 'closed', flick: 0 }, { fx: [['bubbles']], d: 800 }), f(1, { eyes: 'closed', flick: 0 }, { pre: [['lift', 1]], d: 800 })] };
    case 'rest': return { loop: true, frames: [f(1, { flick: 0 }, { d: 700 }), f(1, { flick: 1 }, { pre: [['lift', 1]], d: 700 })] };
    case 'groom': return { loop: true, frames: [f(1, {}, { pre: [['rot', 30, 'c', 'S']], d: 260 }), f(1, {}, { d: 200 }), f(1, {}, { pre: [['rot', -30, 'c', 'S']], d: 260 }), f(1, {}, { d: 200 })] };
    case 'work': case 'play': return whale
      ? { loop: true, frames: [f(1, { spout: true }, { d: 400 }), f(0, {}, { pre: [['rot', -15, 'c', 'S'], ['lift', 3]], fx: [['splash']], d: 300 }), f(2, {}, { pre: [['rot', 15, 'c', 'S']], fx: [['splash']], d: 300 }), f(1, {}, { d: 300 })] }
      : { loop: true, frames: [f(1, {}, { fx: [['splash']], d: 160 }), f(0, {}, { pre: [['rot', -35, 'c', 'S'], ['lift', 7]], fx: [['splash']], d: 140 }), f(1, {}, { pre: [['lift', 12]], d: 160 }), f(2, {}, { pre: [['rot', 35, 'c', 'S'], ['lift', 7]], d: 140 }), f(1, {}, { fx: [['splash']], d: 200 })] };
  }
  return null;
}

// ---------------------------------------------------------------- スライム
function specBlob(anim, x) {
  const { sp } = x;
  const king = sp === 'kingslime';
  switch (anim) {
    case 'walk': return walkSpec(king ? 200 : 160);
    case 'run': case 'fly': return { loop: true, frames: [f(1, { bw: 3, bh: -3 }, { d: 90 }), f(1, { bw: -2, bh: 3 }, { pre: [['lift', 4]], d: 110 }), f(1, { bw: -1, bh: 1 }, { pre: [['lift', 2]], d: 90 }), f(1, { bw: 2, bh: -2 }, { d: 90 })] };
    case 'idle': return { loop: true, frames: [f(1, { bw: 1, bh: -1 }, { d: 320 }), f(1, { bw: 0, bh: 0 }, { d: 280 }), f(1, { bw: -1, bh: 1 }, { d: 320 }), f(1, { bw: 0, bh: 0, eyes: 'closed' }, { d: 140 })] };
    case 'call': return { loop: true, frames: [f(1, { bw: 2, bh: -2 }, { d: 160 }), f(1, { bw: -2, bh: 3, mouth: 'big' }, { fx: [['sound']], d: 260 }), f(1, { bw: -1, bh: 2, mouth: 'big' }, { fx: [['sound']], d: 220 }), f(1, {}, { d: 200 })] };
    case 'attack': return king
      ? { loop: true, frames: [f(1, { bw: 3, bh: -3, eyes: 'angry' }, { d: 220 }), f(1, { bw: -2, bh: 3, eyes: 'angry' }, { pre: [['lift', 6]], d: 160 }), f(1, { bw: 6, bh: -6, mouth: 'big', eyes: 'angry' }, { pre: [['shake', 1]], fx: [['crack'], ['dust']], d: 110 }), f(1, { bw: 3, bh: -3, eyes: 'angry' }, { pre: [['shake', -1]], fx: [['dust']], d: 180 }), f(1, {}, { d: 160 })] }
      : { loop: true, frames: [f(1, { bw: 3, bh: -3, eyes: 'angry' }, { pre: [['fwd', -1]], d: 220 }), f(1, { bw: -3, bh: 3, eyes: 'angry', mouth: 'big' }, { pre: [['fwd', 3], ['lift', 3]], d: 80 }), f(1, { bw: 3, bh: -2, eyes: 'angry' }, { pre: [['fwd', 5]], fx: [['impact']], d: 160 }), f(1, { bw: 1, bh: -1 }, { pre: [['fwd', 2]], d: 140 })] };
    case 'hurt': return { loop: false, frames: [f(1, { bw: 4, bh: -4, eyes: 'x' }, { pre: [['fwd', -2]], fx: [['hit', 'slime']], post: [['tint', '#ffffff', 0.55]], d: 90 }), f(1, { bw: -2, bh: 2, eyes: 'closed' }, { pre: [['fwd', -1]], fx: [['hit', 'slime']], d: 220 })] };
    case 'dying': return { loop: true, frames: [f(1, { bw: 3, bh: -3, eyes: 'closed' }, { fx: [['sweat']], d: 360 }), f(1, { bw: 2, bh: -2, eyes: 'closed' }, { d: 360 }), f(1, { bw: 4, bh: -4, eyes: 'x' }, { fx: [['sweat']], d: 360 })] };
    case 'dead': return { loop: false, frames: [
      f(1, { bw: 3, bh: -3, eyes: 'x' }, { post: [['tint', '#ffffff', 0.4]], d: 120 }),
      f(1, { bw: 6, bh: -6, eyes: 'x' }, { under: [['puddle']], d: 150 }),
      f(1, { bw: 9, bh: -10, eyes: 'x' }, { under: [['puddle']], post: [['fade', 0.35]], d: 170 }),
      f(1, { bw: 11, bh: -30 }, { under: [['puddle']], post: [['fade', 0.75]], d: 200 }),
      f(1, { bw: 11, bh: -30 }, { under: [['puddle']], post: [['fade', 1]], d: HOLD })] };
    case 'graze': case 'eat': case 'work': return { loop: true, frames: [f(1, { bw: 2, bh: -2, mouth: 'big' }, { fx: [[anim === 'eat' && x.def.diet === 'meat' ? 'meat' : 'grass']], d: 220 }), f(1, { bw: -1, bh: 1 }, { fx: [[anim === 'eat' && x.def.diet === 'meat' ? 'meat' : 'grass']], d: 200 }), f(1, { bw: 1, bh: 0, mouth: 'big' }, { d: 220 }), f(1, { bw: 0, bh: 0, eyes: 'happy' }, { d: 300 })] };
    case 'drink': return { loop: true, frames: [f(1, { bw: 3, bh: -2, mouth: 'big' }, { fx: [['water']], d: 260 }), f(1, { bw: 1, bh: 0 }, { fx: [['water']], d: 260 })] };
    case 'sleep': return { loop: true, frames: [f(1, { bw: 3, bh: -3, eyes: 'closed' }, { fx: [['zzz']], d: 700 }), f(1, { bw: 2, bh: -2, eyes: 'closed' }, { fx: [['zzz']], d: 700 }), f(1, { bw: 3, bh: -3, eyes: 'closed' }, { fx: [['zzz']], d: 700 })] };
    case 'rest': return { loop: true, frames: [f(1, { bw: 2, bh: -2 }, { d: 600 }), f(1, { bw: 1, bh: -1 }, { d: 600 }), f(1, { bw: 2, bh: -2, eyes: 'closed' }, { d: 160 })] };
    case 'groom': return { loop: true, frames: [f(1, { bw: 2, bh: -1 }, { d: 110 }), f(1, { bw: -1, bh: 1 }, { d: 110 }), f(1, { bw: 1, bh: -1, eyes: 'happy' }, { d: 110 }), f(1, { bw: 0, bh: 0 }, { d: 300 })] };
    case 'guard': return { loop: true, frames: [f(1, {}, { d: 500 }), f(1, { hdx: 2 }, { d: 500 }), f(1, {}, { d: 300 }), f(1, { hdx: -2 }, { d: 500 })] };
    case 'play': return { loop: true, frames: [f(1, { bw: 3, bh: -3, eyes: 'happy' }, { d: 120 }), f(1, { bw: -2, bh: 3, eyes: 'happy', mouth: 'open' }, { pre: [['lift', 6]], d: 160 }), f(1, { bw: -1, bh: 2, eyes: 'happy' }, { pre: [['lift', 3]], d: 120 }), f(1, { bw: 3, bh: -3 }, { d: 140 })] };
  }
  return null;
}

// ---------------------------------------------------------------- 二足（人型の魔物・サル・ペンギン）
const WEAPON_SP = new Set(['goblin', 'hobgoblin', 'goblinlord', 'orc', 'orcking', 'skeleton', 'skelknight', 'demonsoldier', 'demongeneral']);
const CASTER = { lich: '#60f080', imp: '#ff8030', demonlord: '#ff3050', pharaoh: '#60e0ff' };
function specBiped(anim, x) {
  const { sp, def, role } = x;
  const undead = !!def.undead, golem = sp === 'golem', demon = def.kind === 'demon';
  const floaty = sp === 'lich' || sp === 'pharaoh', winged = sp === 'imp' || sp === 'demonlord';
  const bony = sp === 'skeleton' || sp === 'skelknight';
  const living = !undead && !golem;
  const hk = HIT_KIND(def, sp);
  const S0 = { step: 0 };
  const swingW = { back: { arm: 'back', wrot: V(60, 25, -25), crouch: 1, step: 0 }, hit: { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, down: { arm: 'down', wrot: V(-150, 180, 180), step: 0 } };
  switch (anim) {
    case 'walk': return walkSpec(sp === 'mummy' ? 220 : bony ? 170 : golem ? 240 : 150);
    case 'run': case 'fly':
      if (winged) return { loop: true, frames: [f(0, S0, { pre: [['lift', 3]], d: 120 }), f(1, S0, { pre: [['lift', 4]], d: 120 }), f(2, S0, { pre: [['lift', 3]], d: 120 }), f(1, S0, { pre: [['lift', 2]], d: 120 })] };
      return { loop: true, frames: [f(0, {}, { pre: [['shear', 0.08]], d: 90 }), f(1, {}, { pre: [['shear', 0.08]], d: 80 }), f(2, {}, { pre: [['shear', 0.08]], d: 90 }), f(1, {}, { pre: [['shear', 0.08]], d: 80 })] };
    case 'idle': {
      if (bony) return { loop: true, frames: [f(1, S0, { d: 220 }), f(1, S0, { pre: [['shake', 1]], d: 180 }), f(1, S0, { d: 220 }), f(1, S0, { pre: [['shake', -1]], d: 180 })] };
      if (floaty) return { loop: true, frames: [f(1, { bob: -1 }, { d: 320 }), f(1, { bob: 0 }, { d: 280 }), f(1, { bob: 1 }, { d: 320 }), f(1, { bob: 0 }, { d: 280 })] };
      if (sp === 'penguin') return { loop: true, frames: [f(1, { step: -1 }, { d: 380 }), f(1, { step: 0 }, { d: 300 }), f(1, { step: 1 }, { d: 380 }), f(1, { step: 0, eyes: 'closed' }, { d: 140 })] };
      if (role === 'young') return { loop: true, frames: [f(1, S0, { d: 200 }), f(1, S0, { pre: [['lift', 2]], d: 140 }), f(1, S0, { pre: [['lift', 1]], d: 120 }), f(1, S0, { d: 260 })] };
      const w = winged ? [0, 1, 2, 1] : [1, 1, 1, 1], d0 = golem ? 700 : 440;
      return { loop: true, frames: [f(w[0], S0, { d: d0 }), f(w[1], S0, { pre: [['breathe', 1]], d: d0 }), f(w[2], living ? { ...S0, eyes: 'closed' } : S0, { pre: [['breathe', 1]], d: living ? 130 : d0 }), f(w[3], S0, { d: d0 })] };
    }
    case 'call': {
      if (sp === 'penguin' || sp === 'monkey') return { loop: true, frames: [f(1, { arms2: 'up', mouth: true, step: 0 }, { pre: [['mouth']], fx: [['sound']], d: 200 }), f(1, S0, { d: 140 }), f(1, { arms2: 'up', mouth: true, step: 0 }, { pre: [['mouth'], ['lift', 1]], fx: [['sound']], d: 200 }), f(1, S0, { d: 200 })] };
      if (bony) return { loop: true, frames: [f(1, S0, { pre: [['mouth']], fx: [['sound']], d: 150 }), f(1, S0, { pre: [['shake', 1]], d: 120 }), f(1, S0, { pre: [['mouth']], fx: [['sound']], d: 150 }), f(1, S0, { pre: [['shake', -1]], d: 200 })] };
      if (golem) return { loop: true, frames: [f(1, S0, { pre: [['shake', 1]], fx: [['sparkle', '#80e0ff']], d: 200 }), f(1, S0, { pre: [['shake', -1]], fx: [['sound']], d: 200 }), f(1, S0, { d: 300 })] };
      if (floaty) return { loop: true, frames: [f(1, { arm: 'up', bob: -1 }, { fx: [['sound']], d: 260 }), f(1, { arm: 'up', bob: 0 }, { fx: [['magic', CASTER[sp]]], d: 260 }), f(1, { bob: 0 }, { d: 260 })] };
      if (sp.startsWith('goblin') || sp === 'hobgoblin') return { loop: true, frames: [f(1, { arm: 'up', wrot: V(30, 20, -20), step: 0 }, { pre: [['mouth']], fx: [['sound']], d: 180 }), f(1, { arm: 'up', wrot: 0, step: 0 }, { pre: [['lift', 1]], d: 160 }), f(1, { arm: 'up', wrot: V(30, 20, -20), step: 0 }, { pre: [['mouth']], fx: [['sound']], d: 180 }), f(1, S0, { d: 220 })] };
      return { loop: true, frames: [f(1, { arms2: 'up', step: 0 }, { pre: [['breathe', 1]], d: 200 }), f(1, { arms2: 'up', step: 0 }, { pre: [['mouth']], fx: [['roar'], ['angry']], d: 280 }), f(1, { arms2: 'up', step: 0 }, { pre: [['mouth']], fx: [['roar']], d: 240 }), f(1, S0, { d: 200 })] };
    }
    case 'attack': {
      if (CASTER[sp]) {
        const c = CASTER[sp];
        if (sp === 'demonlord') return { loop: true, frames: [f(1, { arms2: 'up', step: 0 }, { fx: [['magic', c]], d: 260 }), f(1, { arms2: 'up', step: 0 }, { pre: [['lift', 1]], fx: [['magic', c], ['sparkle', '#ff6080']], d: 220 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { pre: [['fwd', 1]], fx: [['burst', c]], d: 110 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { fx: [['burst', c]], d: 170 }), f(1, S0, { d: 200 })] };
        return { loop: true, frames: [f(1, { arm: 'up', step: 0 }, { fx: [['magic', c]], d: 240 }), f(1, { arm: 'up', step: 0 }, { fx: [['magic', c]], d: 180 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { pre: [['fwd', 1]], fx: [['bolt', c]], d: 90 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { fx: [['bolt', c]], d: 150 }), f(1, S0, { d: 160 })] };
      }
      if (sp === 'mummy') return { loop: true, frames: [f(1, { arms2: 'fwd', step: 0 }, { pre: [['fwd', -1]], d: 240 }), f(1, { arms2: 'fwd', step: 0 }, { pre: [['fwd', 3], ['shear', 0.1]], fx: [['slash']], d: 90 }), f(1, { arms2: 'fwd', step: 0 }, { pre: [['fwd', 3]], fx: [['impact']], d: 170 }), f(1, { arms2: 'fwd', step: 0 }, { pre: [['fwd', 1]], d: 150 })] };
      if (golem) return { loop: true, frames: [f(1, { arms2: 'up', step: 0 }, { pre: [['lift', 1]], d: 300 }), f(1, { arms2: 'up', step: 0 }, { pre: [['lift', 2]], d: 180 }), f(1, { crouch: 2, step: 0 }, { pre: [['shake', 1]], fx: [['crack'], ['dust']], d: 90 }), f(1, { crouch: 2, step: 0 }, { pre: [['shake', -1]], fx: [['crack'], ['dust']], d: 220 }), f(1, S0, { d: 200 })] };
      if (sp === 'monkey') return { loop: true, frames: [f(1, { arm: 'up', step: 0 }, { pre: [['mouth']], d: 160 }), f(1, { arm: 'fwd', step: 0 }, { pre: [['fwd', 2]], fx: [['slash']], d: 70 }), f(1, { arm: 'fwd', step: 0 }, { pre: [['fwd', 2]], fx: [['impact']], d: 150 }), f(1, S0, { d: 130 })] };
      if (sp === 'penguin') return { loop: true, frames: [f(1, { arms2: 'up', step: 0 }, { pre: [['fwd', -1]], d: 180 }), f(1, { mouth: true, step: 0 }, { pre: [['fwd', 3], ['shear', 0.15]], fx: [['bite']], d: 80 }), f(1, S0, { pre: [['fwd', 3]], fx: [['impact']], d: 150 }), f(1, S0, { d: 140 })] };
      return { loop: true, frames: [f(1, swingW.back, { pre: [['fwd', -1]], d: bony ? 180 : 210 }), f(1, swingW.hit, { pre: [['fwd', 2], ['shear', 0.08]], fx: [['swing']], d: 70 }), f(1, swingW.hit, { pre: [['fwd', 2]], fx: [['impact', 'tip']], d: 160 }), f(1, swingW.down, { pre: [['fwd', 1]], d: 140 })] };
    }
    case 'hurt': return hurtSpec({ step: 0 }, { step: 0 }, hk);
    case 'dying': return { loop: true, frames: [
      f(1, { crouch: 2, step: 0 }, { pre: [['shear', 0.06]], fx: [['dizzy']], d: 320 }), f(1, { crouch: 3, step: -1 }, { pre: [['shear', -0.04]], fx: [['dizzy']], d: 320 }),
      f(1, { crouch: 2, step: 0, eyes: living ? 'closed' : undefined }, { pre: [['shear', 0.02]], fx: [['dizzy'], ...(living ? [['sweat']] : [])], d: 320 }), f(1, { crouch: 3, step: 1 }, { fx: [['dizzy']], d: 320 })] };
    case 'dead': {
      const flash = f(1, { eyes: 'closed', step: 0 }, { pre: [['fwd', -1]], post: [['tint', '#ffffff', 0.45]], d: 120 });
      if (bony || golem) { const bs = golem ? 4 : 3; return { loop: false, frames: [flash, f(1, S0, { pre: [['crumble', 0.35, bs]], d: 120 }), f(1, S0, { pre: [['crumble', 0.7, bs]], fx: golem ? [['dust']] : [], d: 130 }), f(1, S0, { pre: [['crumble', 1, bs]], fx: [['dust']], d: 180 }), f(1, S0, { pre: [['crumble', 1, bs]], post: [['gray', golem ? 0.4 : 0.15]], d: HOLD })] }; }
      if (sp === 'demonlord') return { loop: false, frames: [flash, f(1, { crouch: 4, step: 0 }, { post: [['light', 0.15]], fx: [['beam']], d: 220 }), f(1, { crouch: 4, step: 0 }, { post: [['light', 0.4]], fx: [['beam']], d: 220 }), f(1, { crouch: 4, step: 0 }, { post: [['light', 0.7]], fx: [['beam']], d: 220 }), f(1, { crouch: 4, step: 0 }, { post: [['light', 1]], fx: [['beam']], d: 260 }), f(1, S0, { post: [['fade', 1]], fx: [['sparkle']], d: HOLD })] };
      if (floaty) return { loop: false, frames: [flash, f(1, { bob: 1 }, { post: [['fade', 0.3]], fx: [['soul']], d: 180 }), f(1, { bob: 2 }, { post: [['fade', 0.6]], fx: [['soul']], d: 180 }), f(1, { bob: 3 }, { post: [['fade', 0.85]], fx: [['soul']], d: 200 }), f(1, { bob: 3 }, { post: [['fade', 1]], d: HOLD })] };
      const fall = [flash, f(1, { crouch: 3, step: 0, eyes: 'closed' }, { pre: [['rot', -30, 'b']], d: 130 }), f(1, { step: 0, eyes: 'closed' }, { pre: [['rot', -90, 'b'], ['settle']], fx: [['dust']], d: 170 })];
      if (demon) return { loop: false, frames: [...fall, f(1, { step: 0, eyes: 'closed' }, { pre: [['rot', -90, 'b'], ['settle']], post: [['fade', 0.4]], fx: [['smokeDark']], d: 200 }), f(1, { step: 0, eyes: 'closed' }, { pre: [['rot', -90, 'b'], ['settle']], post: [['fade', 0.8]], fx: [['smokeDark']], d: 200 }), f(1, S0, { post: [['fade', 1]], d: HOLD })] };
      if (sp === 'mummy') return { loop: false, frames: [...fall, f(1, { step: 0 }, { pre: [['rot', -90, 'b'], ['settle']], post: [['gray', 0.3]], fx: [['soul']], d: 240 }), f(1, { step: 0 }, { pre: [['rot', -90, 'b'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
      return { loop: false, frames: [...fall, f(1, { step: 0, eyes: 'closed' }, { pre: [['rot', -90, 'b'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
    }
    case 'graze': case 'eat': {
      if (!living || sp === 'imp' || sp === 'demonsoldier' || sp === 'demongeneral' || sp === 'demonlord') return specBiped('rest', x);
      const food = sp === 'monkey' ? 'banana' : sp === 'penguin' ? 'fishy' : 'food';
      return { loop: true, frames: [f(1, { sit: true, arm: 'mouth' }, { pre: [['mouth']], fx: [[food]], d: 220 }), f(1, { sit: true, arm: 'mouth' }, { fx: [[food]], d: 200 }), f(1, { sit: true, arm: 'mouth' }, { pre: [['mouth']], fx: [[food]], d: 220 }), f(1, { sit: true }, { fx: [[food]], d: 300 })] };
    }
    case 'drink':
      if (!living) return specBiped('guard', x);
      return { loop: true, frames: [f(1, { crouch: 3, arm: 'down', step: 0 }, { fx: [['water']], d: 300 }), f(1, { crouch: 2, arm: 'mouth', step: 0 }, { pre: [['mouth']], fx: [['water']], d: 360 }), f(1, { crouch: 2, arm: 'mouth', step: 0 }, { fx: [['water']], d: 300 })] };
    case 'sleep': {
      if (!living || floaty) return specBiped('rest', x);
      const q = { sit: true, eyes: 'closed' };
      return { loop: true, frames: [f(1, q, { pre: [['head', 0, 1]], fx: [['zzz']], d: 700 }), f(1, q, { pre: [['head', 0, 1], ['breathe', 1]], fx: [['zzz']], d: 700 }), f(1, q, { pre: [['head', 0, 1]], fx: [['zzz']], d: 700 })] };
    }
    case 'rest':
      if (floaty) return { loop: true, frames: [f(1, { bob: 1 }, { d: 600 }), f(1, { bob: 2 }, { d: 600 })] };
      if (role === 'overlord') return specBiped('guard', x);
      return { loop: true, frames: [f(1, { sit: true }, { d: 600 }), f(1, { sit: true }, { pre: [['breathe', 1]], d: 600 }), f(1, { sit: true, eyes: living ? 'closed' : undefined }, { d: living ? 150 : 600 })] };
    case 'groom':
      if (bony) return specBiped('idle', x);
      if (golem || floaty) return specBiped('guard', x);
      return { loop: true, frames: [f(1, { sit: true, arm: 'up', wrot: 0 }, { d: 200 }), f(1, { sit: true, arm: 'up', wrot: 0 }, { pre: [['head', 1, 0]], d: 160 }), f(1, { sit: true, arm: 'up', wrot: 0 }, { d: 200 }), f(1, { sit: true }, { d: 300 })] };
    case 'work': {
      if (WEAPON_SP.has(sp) && sp !== 'demongeneral') return { loop: true, frames: [f(1, { arm: 'up', wrot: V(40, 0, 0), step: 0 }, { d: 260 }), f(1, { arm: 'down', wrot: V(-150, 180, 180), crouch: 1, step: 0 }, { fx: [['dirt'], ['dust']], d: 90 }), f(1, { arm: 'down', wrot: V(-150, 180, 180), crouch: 1, step: 0 }, { d: 200 }), f(1, S0, { d: 200 })] };
      if (sp === 'demongeneral') return { loop: true, frames: [f(1, S0, { d: 300 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { pre: [['mouth']], fx: [['bang'], ['sound']], d: 400 }), f(1, { arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90), step: 0 }, { fx: [['sound']], d: 300 }), f(1, S0, { d: 300 })] };
      if (sp === 'lich' || sp === 'pharaoh') return { loop: true, frames: [f(1, { arm: 'up', bob: -1 }, { under: [['circle', CASTER[sp]]], fx: [['magic', CASTER[sp]]], d: 260 }), f(1, { arm: 'up', bob: 0 }, { under: [['circle', CASTER[sp]]], fx: [['magic', CASTER[sp]], ['sparkle', CASTER[sp]]], d: 260 }), f(1, { arm: 'up', bob: 1 }, { under: [['circle', CASTER[sp]]], fx: [['magic', CASTER[sp]]], d: 260 })] };
      if (sp === 'imp') return { loop: true, frames: [f(0, { arm: 'up', wrot: 0, step: 0 }, { pre: [['lift', 3]], fx: [['letter']], d: 140 }), f(1, { arm: 'up', wrot: 0, step: 0 }, { pre: [['lift', 4]], fx: [['letter']], d: 140 }), f(2, { arm: 'up', wrot: 0, step: 0 }, { pre: [['lift', 3]], fx: [['letter']], d: 140 }), f(1, { arm: 'up', wrot: 0, step: 0 }, { pre: [['lift', 2]], fx: [['letter']], d: 140 })] };
      if (sp === 'demonlord') return specBiped('guard', { ...x, role: 'overlord' });
      if (golem) return { loop: true, frames: [f(1, { crouch: 2, step: 0 }, { d: 400 }), f(1, { arms2: 'up', step: 0 }, { fx: [['rock']], d: 600 }), f(1, { arms2: 'up', step: 0 }, { pre: [['shake', 1]], fx: [['rock']], d: 300 }), f(1, { arms2: 'up', step: 0 }, { fx: [['rock']], d: 600 })] };
      if (sp === 'mummy') return { loop: true, frames: [f(0, { arms2: 'fwd' }, { d: 260 }), f(1, { arms2: 'fwd' }, { d: 260 }), f(2, { arms2: 'fwd' }, { d: 260 }), f(1, { arms2: 'fwd' }, { d: 260 })] };
      if (sp === 'monkey') return { loop: true, frames: [f(1, { arm: 'mouth', step: 0 }, { pre: [['mouth']], fx: [['banana']], d: 200 }), f(1, { arm: 'mouth', step: 0 }, { fx: [['banana']], d: 200 }), f(1, S0, { fx: [['banana']], d: 300 })] };
      if (sp === 'penguin') return { loop: true, frames: [f(1, { arms2: 'fwd' }, { pre: [['rot', 90, 'c', 'S'], ['squash', 0.6, 1.1, 'FB'], ['settle']], fx: [['dust']], d: 160 }), f(1, { arms2: 'fwd' }, { pre: [['rot', 90, 'c', 'S'], ['squash', 0.6, 1.1, 'FB'], ['settle'], ['fwd', 2]], d: 160 }), f(1, { arms2: 'fwd' }, { pre: [['rot', 90, 'c', 'S'], ['squash', 0.6, 1.1, 'FB'], ['settle'], ['fwd', 4]], fx: [['dust']], d: 160 })] };
      return specBiped('idle', x);
    }
    case 'guard': {
      if (role === 'overlord') return { loop: true, frames: [f(1, { sit: true }, { under: [['throne']], d: 800 }), f(1, { sit: true }, { under: [['throne']], pre: [['breathe', 1]], d: 700 }), f(1, { sit: true, arm: V('fwd', 'across', 'across'), wrot: V(-90, -90, 90) }, { under: [['throne']], fx: [['magic', CASTER.demonlord]], d: 700 }), f(1, { sit: true, arm: 'mouth' }, { under: [['throne']], d: 900 })] };
      if (role === 'treasure') return { loop: true, frames: [f(1, { sit: true }, { under: [['treasure']], d: 700 }), f(1, { sit: true }, { under: [['treasure']], pre: [['head', 1, 0, 'FB']], d: 600 }), f(1, { sit: true }, { under: [['treasure']], pre: [['breathe', 1]], d: 600 }), f(1, { sit: true }, { under: [['treasure']], pre: [['head', -1, 0, 'FB']], d: 600 })] };
      const bob = floaty ? { bob: 0 } : S0;
      return { loop: true, frames: [f(1, bob, { d: 700 }), f(1, bob, { pre: [['head', 1, 0, 'FB']], d: 600 }), f(1, bob, { pre: [['breathe', 1]], d: 500 }), f(1, bob, { pre: [['head', -1, 0, 'FB']], d: 600 })] };
    }
    case 'play': return { loop: true, frames: [f(1, { crouch: 2, step: 0 }, { d: 160 }), f(1, { arms2: 'up', step: 0 }, { pre: [['lift', 4]], d: 180 }), f(1, { arms2: 'up', step: 0 }, { pre: [['lift', 2]], d: 140 }), f(1, { crouch: 1, step: 0 }, { d: 200 })] };
  }
  return null;
}

// ---------------------------------------------------------------- 大蜘蛛・アラクネ
function specSpider(anim, x) {
  const { sp } = x;
  const ar = sp === 'arachne';
  switch (anim) {
    case 'walk': return walkSpec(120);
    case 'run': case 'fly': return { ...walkSpec(70), plain: false };
    case 'idle': return { loop: true, frames: [f(1, {}, { d: 420 }), f(1, { curl: 0.1 }, { pre: [['breathe', 1]], d: 420 }), f(1, {}, { d: 300 }), f(1, { mouth: true }, { d: 160 })] };
    case 'call': return ar
      ? { loop: true, frames: [f(1, { arm: 'up' }, { fx: [['sound']], d: 240 }), f(1, { arm: 'up', rear: 0.3 }, { fx: [['sound']], d: 240 }), f(1, {}, { d: 240 })] }
      : { loop: true, frames: [f(1, { rear: 0.5, mouth: true }, { fx: [['sound']], d: 240 }), f(1, { rear: 0.8, mouth: true }, { fx: [['sound']], d: 240 }), f(1, { rear: 0.5 }, { d: 200 }), f(1, {}, { d: 200 })] };
    case 'attack': return ar
      ? { loop: true, frames: [f(1, { arm: 'up', rear: 0.3 }, { pre: [['fwd', -1]], d: 200 }), f(1, { arm: 'fwd' }, { pre: [['fwd', 3]], fx: [['slash']], d: 70 }), f(1, { arm: 'fwd' }, { pre: [['fwd', 3]], fx: [['impact']], d: 160 }), f(1, {}, { pre: [['fwd', 1]], fx: [['web']], d: 140 })] }
      : { loop: true, frames: [f(1, { rear: 0.8, mouth: true }, { pre: [['fwd', -1]], d: 210 }), f(1, { rear: 0.3, mouth: true }, { pre: [['fwd', 4]], fx: [['bite']], d: 70 }), f(1, { rear: 0.2 }, { pre: [['fwd', 4]], fx: [['impact'], ['poison']], d: 170 }), f(1, {}, { pre: [['fwd', 1]], d: 140 })] };
    case 'hurt': return hurtSpec({ curl: 0.3 }, { curl: 0.2 }, 'blood');
    case 'dying': return { loop: true, frames: [f(1, { curl: 0.3 }, { pre: [['shake', 1]], fx: [['dizzy']], d: 280 }), f(1, { curl: 0.4, eyes: 'closed' }, { fx: [['dizzy']], d: 280 }), f(1, { curl: 0.3 }, { pre: [['shake', -1]], fx: [['dizzy']], d: 280 })] };
    case 'dead': return ar
      ? { loop: false, frames: [f(1, { curl: 0.3, eyes: 'closed' }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { curl: 0.6, eyes: 'closed' }, { pre: [['rot', 30, 'b']], d: 150 }), f(1, { curl: 1, eyes: 'closed' }, { pre: [['rot', 90, 'b'], ['settle']], fx: [['dust']], d: 170 }), f(1, { curl: 1, eyes: 'closed' }, { pre: [['rot', 90, 'b'], ['settle']], post: [['gray', 0.35]], d: HOLD })] }
      : { loop: false, frames: [f(1, { curl: 0.3, eyes: 'closed' }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { curl: 0.7, eyes: 'closed' }, { pre: [['lift', 3]], d: 140 }), f(1, { curl: 1, eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], fx: [['dust']], d: 170 }), f(1, { curl: 1, eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat': return { loop: true, frames: [f(1, { mouth: true, rear: 0.2 }, { fx: [['cocoon']], d: 240 }), f(1, { rear: 0.1 }, { fx: [['cocoon']], d: 200 }), f(1, { mouth: true, rear: 0.2 }, { fx: [['cocoon']], d: 240 })] };
    case 'drink': return { loop: true, frames: [f(1, { mouth: true }, { pre: [['lift', -1]], fx: [['water']], d: 300 }), f(1, {}, { pre: [['lift', -1]], fx: [['water']], d: 300 })] };
    case 'sleep': return { loop: true, frames: [f(1, { curl: 0.25, eyes: 'closed' }, { fx: [['zzz']], d: 700 }), f(1, { curl: 0.25, eyes: 'closed' }, { pre: [['breathe', 1]], fx: [['zzz']], d: 700 })] };
    case 'rest': return { loop: true, frames: [f(1, { curl: 0.2 }, { d: 600 }), f(1, { curl: 0.2 }, { pre: [['breathe', 1]], d: 600 })] };
    case 'groom': return { loop: true, frames: [f(1, { rear: 0.3, mouth: true }, { d: 200 }), f(1, { rear: 0.1 }, { d: 200 }), f(1, { rear: 0.3 }, { d: 200 }), f(1, {}, { d: 300 })] };
    case 'work': return { loop: true, frames: [0, 1, 2, 3].map((k) => f(k % 2 ? 0 : 2, {}, { under: [['web']], d: 260 })) };
    case 'guard': return ar
      ? { loop: true, frames: [f(1, {}, { d: 600 }), f(1, {}, { pre: [['head', 1, 0, 'FB']], d: 500 }), f(1, { rear: 0.2 }, { d: 400 }), f(1, {}, { pre: [['head', -1, 0, 'FB']], d: 500 })] }
      : { loop: true, frames: [f(1, { rear: 0.2 }, { d: 600 }), f(1, { rear: 0.3 }, { d: 400 }), f(1, { rear: 0.2, mouth: true }, { d: 300 })] };
    case 'play': return { loop: true, frames: [f(1, { curl: 0.2 }, { d: 140 }), f(1, {}, { pre: [['lift', 3]], d: 160 }), f(1, {}, { pre: [['lift', 1]], d: 120 }), f(1, {}, { d: 200 })] };
  }
  return null;
}

// ---------------------------------------------------------------- ワイバーン・ドラゴン
function specDragon(anim, x) {
  const { sp } = x;
  const big = sp === 'dragon';
  const W0 = { flap: 0.35, wingK: 0.55 };
  switch (anim) {
    case 'walk': return walkSpec(big ? 190 : 160);
    case 'run': return { loop: true, frames: [f(0, { flap: 0.6, wingK: 0.8 }, { d: 110 }), f(1, { flap: 0.35, wingK: 0.8 }, { d: 100 }), f(2, { flap: 0.6, wingK: 0.8 }, { d: 110 }), f(1, { flap: 0.35, wingK: 0.8 }, { d: 100 })] };
    case 'fly': return { air: true, loop: true, frames: [f(1, { flap: 1, fold: 0.6, wingK: 1, step: 0 }, { pre: [['lift', 4]], d: 140 }), f(1, { flap: 0.35, fold: 0.6, wingK: 1, step: 0 }, { pre: [['lift', 5]], d: 120 }), f(1, { flap: -0.25, fold: 0.6, wingK: 1, step: 0 }, { pre: [['lift', 6]], d: 140 }), f(1, { flap: 0.35, fold: 0.6, wingK: 1, step: 0 }, { pre: [['lift', 5]], d: 120 })] };
    case 'idle': return { loop: true, frames: [f(1, { ...W0, tph: 0 }, { d: 520 }), f(1, { ...W0, tph: 1 }, { pre: [['breathe', 1]], d: 520 }), f(1, { ...W0, tph: 2 }, { pre: [['breathe', 1]], fx: big ? [['smoke']] : [], d: 520 }), f(1, { ...W0, tph: 1, eyes: 'closed' }, { d: 150 })] };
    case 'call': return { loop: true, frames: [f(1, { hdy: -2, flap: 1, wingK: 1 }, { d: 220 }), f(1, { hdy: -3, mouth: true, flap: 1, wingK: 1 }, { fx: [['roar']], d: 320 }), f(1, { hdy: -3, mouth: true, flap: 0.6, wingK: 1 }, { fx: [['roar']], d: 320 }), f(1, { hdy: -1, flap: 0.35, wingK: 0.7 }, { d: 220 })] };
    case 'attack': return big
      ? { loop: true, frames: [f(1, { hdy: -2, flap: 0.8, wingK: 1 }, { pre: [['fwd', -1], ['breathe', 1]], d: 280 }), f(1, { hdy: 1, mouth: true, flap: 0.3, wingK: 1 }, { fx: [['fire']], d: 110 }), f(1, { hdy: 1, mouth: true, flap: 0.3, wingK: 1 }, { fx: [['fire']], d: 110 }), f(1, { hdy: 1, mouth: true, flap: 0.3, wingK: 1 }, { fx: [['fire']], d: 110 }), f(1, { hdy: 1, mouth: true, flap: 0.3, wingK: 1 }, { fx: [['fire'], ['smoke']], d: 110 }), f(1, { flap: 0.35, wingK: 0.7 }, { fx: [['smoke']], d: 220 })] }
      : { loop: true, frames: [f(1, { hdy: -2, flap: 1, wingK: 1 }, { pre: [['fwd', -2]], d: 210 }), f(1, { hdy: 1, mouth: true, flap: -0.25, wingK: 1 }, { pre: [['fwd', 4]], fx: [['bite']], d: 80 }), f(1, { hdy: 1, flap: -0.25, wingK: 1, tailDn: -4 }, { pre: [['fwd', 4]], fx: [['impact'], ['poison']], d: 170 }), f(1, { flap: 0.35 }, { pre: [['fwd', 1]], d: 150 })] };
    case 'hurt': return hurtSpec({ flap: 1, wingK: 1 }, { flap: 0.6, wingK: 1 }, 'blood');
    case 'dying': return { loop: true, frames: [f(1, { fold: 0.3, hg: 0.3, flap: -0.25, wingK: 0.8 }, { fx: [['dizzy']], d: 340 }), f(1, { fold: 0.35, hg: 0.4, flap: -0.25, wingK: 0.8, eyes: 'closed' }, { fx: [['dizzy']], d: 340 }), f(1, { fold: 0.3, hg: 0.3, flap: 0, wingK: 0.8 }, { fx: [['dizzy'], ['sweat']], d: 340 })] };
    case 'dead': return { loop: false, frames: [f(1, { flap: 1, wingK: 1, eyes: 'closed' }, { pre: [['fwd', -1]], post: [['tint', '#ffffff', 0.4]], d: 130 }), f(1, { fold: 0.6, hg: 0.6, flap: -0.25, wingK: 1, eyes: 'closed' }, { d: 170 }), f(1, { fold: 1, hg: 1, flap: -0.5, wingK: 1, eyes: 'closed' }, { pre: big ? [['shake', 1]] : [], fx: [['dust']], d: 200 }), f(1, { fold: 1, hg: 1, flap: -0.5, wingK: 1, eyes: 'closed' }, { post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat': return { loop: true, frames: [f(1, { ...W0, hg: 0.9, mouth: true }, { fx: [['meat']], d: 240 }), f(1, { ...W0, hg: 1 }, { fx: [['meat']], d: 200 }), f(1, { ...W0, hg: 0.6, mouth: true }, { fx: [['meat']], d: 260 })] };
    case 'drink': return { loop: true, frames: [f(1, { ...W0, hg: 1, fold: 0.2 }, { fx: [['water']], d: 320 }), f(1, { ...W0, hg: 1, fold: 0.2, mouth: true }, { fx: [['water']], d: 220 })] };
    case 'sleep': { const q = { fold: 1, hg: 0.9, wingK: 0.5, flap: 0.2, eyes: 'closed', tph: 0 }; return { loop: true, frames: [f(1, q, { fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1]], fx: [['zzz'], ...(big ? [['smoke']] : [])], d: 700 }), f(1, q, { fx: [['zzz']], d: 700 })] }; }
    case 'rest': return { loop: true, frames: [f(1, { fold: 1, hg: 0.3, wingK: 0.5, flap: 0.2 }, { d: 600 }), f(1, { fold: 1, hg: 0.3, wingK: 0.5, flap: 0.2, tph: 1 }, { pre: [['breathe', 1]], d: 600 })] };
    case 'groom': return { loop: true, frames: [f(1, { hdx: -6, hdy: 3, mouth: true, wingK: 1, flap: 0.6 }, { d: 260 }), f(1, { hdx: -6, hdy: 4, wingK: 1, flap: 0.6 }, { d: 220 }), f(1, { hdx: -5, hdy: 3, mouth: true, wingK: 1, flap: 0.5 }, { d: 260 }), f(1, { ...W0 }, { d: 300 })] };
    case 'work': return { loop: true, frames: [f(1, { fold: 0.6, hdy: -1, ...W0 }, { under: [['treasure']], fx: [['smoke']], d: 600 }), f(1, { fold: 0.6, hdy: -1, hdx: 1, ...W0 }, { under: [['treasure']], d: 500 }), f(1, { fold: 0.6, hdy: -1, ...W0 }, { under: [['treasure']], pre: [['breathe', 1]], d: 500 })] };
    case 'guard': return { loop: true, frames: [f(1, { hdy: -2, ...W0 }, { fx: big ? [['smoke']] : [], d: 600 }), f(1, { hdy: -2, hdx: V(1, 1, 1), ...W0 }, { d: 500 }), f(1, { hdy: -2, ...W0 }, { pre: [['breathe', 1]], d: 400 }), f(1, { hdy: -2, hdx: V(-1, -1, -1), ...W0 }, { d: 500 })] };
    case 'play': return { loop: true, frames: [f(1, { flap: 1, wingK: 1 }, { d: 140 }), f(1, { flap: -0.25, wingK: 1 }, { pre: [['lift', 4]], d: 160 }), f(1, { flap: 1, wingK: 1 }, { pre: [['lift', 2]], d: 140 }), f(1, W0, { d: 200 })] };
  }
  return null;
}

// ---------------------------------------------------------------- サソリ
function specBug(anim, x) {
  switch (anim) {
    case 'walk': return walkSpec(110);
    case 'run': case 'fly': return { ...walkSpec(70), plain: false };
    case 'idle': return { loop: true, frames: [f(1, { sway: 0 }, { d: 380 }), f(1, { sway: 1, mouth: true }, { d: 260 }), f(1, { sway: 0 }, { d: 380 }), f(1, { sway: -1 }, { d: 300 })] };
    case 'call': return { loop: true, frames: [f(1, { sting: 0.3, mouth: true }, { fx: [['sound']], d: 220 }), f(1, { sting: 0.4 }, { fx: [['sound']], d: 220 }), f(1, { sting: 0.3, mouth: true }, { d: 220 })] };
    case 'attack': return { loop: true, frames: [f(1, { mouth: true }, { pre: [['fwd', -1]], d: 200 }), f(1, { sting: 0.6, mouth: true }, { pre: [['fwd', 1]], d: 80 }), f(1, { sting: 1 }, { pre: [['fwd', 2]], fx: [['impact', 'tip'], ['poison']], d: 170 }), f(1, { sting: 0.3 }, { pre: [['fwd', 1]], d: 140 })] };
    case 'hurt': return hurtSpec({}, {}, 'blood');
    case 'dying': return { loop: true, frames: [f(1, { sway: 1 }, { pre: [['shake', 1]], fx: [['dizzy']], d: 280 }), f(1, { sway: -1, eyes: 'closed' }, { fx: [['dizzy']], d: 280 }), f(1, { sway: 0 }, { pre: [['shake', -1]], fx: [['dizzy']], d: 280 })] };
    case 'dead': return { loop: false, frames: [f(1, { eyes: 'closed' }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { eyes: 'closed' }, { pre: [['lift', 3]], d: 140 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], fx: [['dust']], d: 170 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
    case 'graze': case 'eat': return { loop: true, frames: [f(1, { mouth: true }, { fx: [['meat']], d: 220 }), f(1, {}, { fx: [['meat']], d: 200 })] };
    case 'drink': return { loop: true, frames: [f(1, {}, { fx: [['water']], d: 300 }), f(1, { mouth: true }, { fx: [['water']], d: 300 })] };
    case 'sleep': return { loop: true, frames: [f(1, { eyes: 'closed', sway: 0 }, { fx: [['zzz']], d: 700 }), f(1, { eyes: 'closed', sway: 0 }, { fx: [['zzz']], d: 700 })] };
    case 'rest': return { loop: true, frames: [f(1, { sway: 0 }, { d: 600 }), f(1, { sway: 1 }, { d: 600 })] };
    case 'groom': return { loop: true, frames: [f(1, { mouth: true }, { d: 160 }), f(1, {}, { d: 160 }), f(1, { mouth: true, sway: 1 }, { d: 160 }), f(1, {}, { d: 300 })] };
    case 'work': return { loop: true, frames: [f(0, {}, { fx: [['dirt']], d: 140 }), f(2, {}, { fx: [['dirt']], d: 140 })] };
    case 'guard': return { loop: true, frames: [f(1, { sting: 0.2, mouth: true }, { d: 600 }), f(1, { sting: 0.3 }, { d: 400 })] };
    case 'play': return { loop: true, frames: [f(1, {}, { d: 140 }), f(1, {}, { pre: [['lift', 2]], d: 140 })] };
  }
  return null;
}

// ---------------------------------------------------------------- カエル・ヘビ・カメ・ワニ
function specLizard(anim, x) {
  const { sp } = x;
  const flip = (hold = true) => ({ loop: false, frames: [f(1, { eyes: 'closed' }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { eyes: 'closed' }, { pre: [['lift', 2]], d: 140 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], fx: [['dust']], d: 170 }), f(1, { eyes: 'closed' }, { pre: [['rot', 180, 'c'], ['settle']], post: [['gray', 0.35]], d: HOLD })] });
  const dizzy = (q = {}) => ({ loop: true, frames: [f(1, q, { pre: [['shake', 1]], fx: [['dizzy']], d: 300 }), f(1, { ...q, eyes: 'closed' }, { fx: [['dizzy']], d: 300 }), f(1, q, { pre: [['shake', -1]], fx: [['dizzy']], d: 300 })] });
  const zz = (q) => ({ loop: true, frames: [f(1, q, { fx: [['zzz']], d: 700 }), f(1, q, { pre: [['breathe', 1]], fx: [['zzz']], d: 700 })] });
  if (sp === 'frog') {
    const Z = { hop: 0, crouch: 0 };
    switch (anim) {
      case 'walk': return walkSpec(130);
      case 'run': case 'fly': case 'play': return { loop: true, frames: [f(1, { hop: 0, crouch: 1 }, { d: 120 }), f(1, { hop: 3, crouch: 0 }, { d: 140 }), f(1, { hop: 1, crouch: 0 }, { d: 100 }), f(1, Z, { d: 140 })] };
      case 'idle': return { loop: true, frames: [f(1, Z, { d: 420 }), f(1, { ...Z, sac: 0.7 }, { d: 260 }), f(1, Z, { d: 420 }), f(1, { ...Z, eyes: 'closed' }, { d: 140 })] };
      case 'call': return { loop: true, frames: [f(1, { ...Z, sac: 0.8 }, { d: 200 }), f(1, { ...Z, sac: 1.3 }, { fx: [['sound']], d: 300 }), f(1, { ...Z, sac: 0.6 }, { d: 200 })] };
      case 'attack': case 'eat': case 'work': return { loop: true, frames: [f(1, { hop: 0, crouch: 1 }, { fx: anim !== 'attack' ? [['fly']] : [], d: 220 }), f(1, { ...Z, tongue: 4 }, { d: 60 }), f(1, { ...Z, tongue: 8 }, { fx: [anim === 'attack' ? ['impact'] : ['fly']], d: 140 }), f(1, { ...Z, tongue: 2 }, { d: 90 }), f(1, Z, { d: 260 })] };
      case 'hurt': return hurtSpec(Z, Z, 'blood');
      case 'dying': return dizzy({ hop: 0, crouch: 1 });
      case 'dead': return flip();
      case 'graze': return specLizard('eat', x);
      case 'drink': return { loop: true, frames: [f(1, { hop: 0, crouch: 1 }, { fx: [['water']], d: 400 }), f(1, Z, { fx: [['water']], d: 400 })] };
      case 'sleep': return zz({ hop: 0, crouch: 1, eyes: 'closed' });
      case 'rest': case 'groom': case 'guard': return { loop: true, frames: [f(1, { hop: 0, crouch: 1 }, { d: 600 }), f(1, { hop: 0, crouch: 1, sac: 0.5 }, { d: 400 })] };
    }
  }
  if (sp === 'snake') {
    switch (anim) {
      case 'walk': return walkSpec(160);
      case 'run': case 'fly': return { ...walkSpec(90), plain: false };
      case 'idle': return { loop: true, frames: [f(1, { tph: 0, tongue: false }, { d: 360 }), f(1, { tph: 1, tongue: true }, { d: 200 }), f(1, { tph: 2, tongue: false }, { d: 360 }), f(1, { tph: 1, tongue: true }, { d: 200 })] };
      case 'call': return { loop: true, frames: [f(1, { coil: true, strike: 0.3, mouth: true }, { fx: [['sound']], d: 260 }), f(1, { coil: true, strike: 0.5, tongue: true }, { fx: [['sound']], d: 260 }), f(1, { coil: true, strike: 0.3 }, { d: 200 })] };
      case 'attack': return { loop: true, frames: [f(1, { strike: 0, tongue: false }, { pre: [['fwd', -1]], d: 200 }), f(1, { strike: 1, mouth: true }, { fx: [['bite']], d: 70 }), f(1, { strike: 1 }, { fx: [['impact']], d: 170 }), f(1, { strike: 0.3 }, { d: 160 })] };
      case 'hurt': return hurtSpec({ tongue: false }, { tongue: false }, 'blood');
      case 'dying': return dizzy({ tongue: false, low: true });
      case 'dead': return { loop: false, frames: [f(1, { eyes: 'closed', tongue: false }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { eyes: 'closed', tph: 0, tongue: false, low: true }, { d: 160 }), f(1, { eyes: 'closed', tph: 0, tongue: false, low: true }, { pre: [['rot', 180, 'c', 'S'], ['settle']], d: 170 }), f(1, { eyes: 'closed', tph: 0, tongue: false, low: true }, { pre: [['rot', 180, 'c', 'S'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
      case 'graze': case 'eat': return { loop: true, frames: [f(1, { mouth: true, strike: 0.3 }, { fx: [['meat']], d: 300 }), f(1, { strike: 0.2, tongue: false }, { fx: [['meat']], d: 300 })] };
      case 'drink': return { loop: true, frames: [f(1, { low: true, tongue: true }, { fx: [['water']], d: 300 }), f(1, { low: true, tongue: false }, { fx: [['water']], d: 300 })] };
      case 'sleep': return zz({ coil: true, eyes: 'closed', tongue: false });
      case 'rest': case 'groom': return { loop: true, frames: [f(1, { coil: true, tongue: false }, { d: 600 }), f(1, { coil: true, tongue: true }, { d: 200 })] };
      case 'work': return { loop: true, frames: [0, 1, 2, 3].map((k) => f(1, { tph: k, tongue: k & 1 }, { d: 130 })) };
      case 'guard': return { loop: true, frames: [f(1, { coil: true, strike: 0.2, tongue: false }, { d: 500 }), f(1, { coil: true, strike: 0.3, tongue: true }, { d: 200 })] };
      case 'play': return { loop: true, frames: [f(1, { coil: true, strike: 0.2 }, { d: 300 }), f(1, { coil: true, strike: 0.5 }, { d: 300 })] };
    }
  }
  if (sp === 'turtle') {
    switch (anim) {
      case 'walk': return walkSpec(260);
      case 'run': case 'fly': return { ...walkSpec(180), plain: false };
      case 'idle': return { loop: true, frames: [f(1, { hdx: 0 }, { d: 520 }), f(1, { hdx: -1 }, { d: 400 }), f(1, { hdx: 0 }, { d: 520 }), f(1, { eyes: 'closed' }, { d: 160 })] };
      case 'call': return { loop: true, frames: [f(1, { hdy: -1, mouth: true }, { fx: [['sound']], d: 300 }), f(1, { hdy: -1 }, { d: 300 })] };
      case 'attack': return { loop: true, frames: [f(1, { hdx: -1 }, { d: 240 }), f(1, { hdx: 1, mouth: true }, { pre: [['fwd', 2]], fx: [['bite']], d: 80 }), f(1, { hdx: 1 }, { pre: [['fwd', 2]], fx: [['impact']], d: 170 }), f(1, {}, { d: 160 })] };
      case 'hurt': return { loop: false, frames: [f(1, { hide: 1 }, { pre: [['fwd', -1]], fx: [['hit', 'blood']], post: [['tint', '#ffffff', 0.55]], d: 90 }), f(1, { hide: 1 }, { d: 240 })] };
      case 'dying': return dizzy({ hide: 0.5 });
      case 'dead': return { loop: false, frames: [f(1, { hide: 1 }, { post: [['tint', '#ffffff', 0.4]], d: 120 }), f(1, { hide: 1 }, { pre: [['lift', 2]], d: 140 }), f(1, { hide: 1 }, { pre: [['rot', 180, 'c'], ['settle']], fx: [['dust']], d: 170 }), f(1, { hide: 1 }, { pre: [['rot', 180, 'c'], ['settle']], post: [['gray', 0.35]], d: HOLD })] };
      case 'graze': case 'eat': return { loop: true, frames: [f(1, { hdy: 1, mouth: true }, { fx: [['grass']], d: 300 }), f(1, { hdy: 1 }, { fx: [['grass']], d: 300 })] };
      case 'drink': return { loop: true, frames: [f(1, { hdy: 1 }, { fx: [['water']], d: 360 }), f(1, { hdy: 1, mouth: true }, { fx: [['water']], d: 300 })] };
      case 'sleep': return zz({ hide: 1 });
      case 'rest': case 'groom': return { loop: true, frames: [f(1, { eyes: 'closed' }, { d: 700 }), f(1, {}, { d: 500 })] };
      case 'work': return { loop: true, frames: [f(1, { hdy: -1, eyes: 'closed' }, { fx: [['sparkle', '#fff0a0']], d: 600 }), f(1, { hdy: -1, eyes: 'closed' }, { d: 600 })] };
      case 'guard': return { loop: true, frames: [f(1, { hide: 1 }, { d: 700 }), f(1, { hide: 0.5 }, { d: 500 })] };
      case 'play': return specLizard('idle', x);
    }
  }
  // ワニ
  switch (anim) {
    case 'walk': return walkSpec(170);
    case 'run': case 'fly': return { ...walkSpec(90), plain: false };
    case 'idle': return { loop: true, frames: [f(1, { tph: 0 }, { d: 520 }), f(1, { tph: 1 }, { pre: [['breathe', 1]], d: 520 }), f(1, { tph: 2 }, { d: 520 }), f(1, { tph: 1, eyes: 'closed' }, { d: 160 })] };
    case 'call': return { loop: true, frames: [f(1, { mouth: 2 }, { fx: [['sound']], d: 300 }), f(1, { mouth: 3 }, { fx: [['roar']], d: 300 }), f(1, { mouth: 1 }, { d: 200 })] };
    case 'attack': return { loop: true, frames: [f(1, { mouth: 3 }, { pre: [['fwd', -1]], d: 220 }), f(1, { mouth: 1 }, { pre: [['fwd', 4]], fx: [['bite']], d: 70 }), f(1, { mouth: 0 }, { pre: [['fwd', 4]], fx: [['impact']], d: 170 }), f(1, {}, { pre: [['fwd', 1]], d: 150 })] };
    case 'hurt': return hurtSpec({}, {}, 'blood');
    case 'dying': return dizzy({ lie: true });
    case 'dead': return flip();
    case 'graze': case 'eat': return { loop: true, frames: [f(1, { mouth: 3 }, { fx: [['meat']], d: 260 }), f(1, { mouth: 0 }, { fx: [['meat']], d: 200 }), f(1, { mouth: 2, tph: 1 }, { pre: [['lift', 1]], fx: [['meat']], d: 260 })] };
    case 'drink': return { loop: true, frames: [f(1, { lie: true }, { fx: [['water']], d: 360 }), f(1, { lie: true, mouth: 1 }, { fx: [['water']], d: 300 })] };
    case 'sleep': return zz({ lie: true, eyes: 'closed' });
    case 'rest': case 'groom': case 'work': return { loop: true, frames: [f(1, { lie: true, mouth: 2 }, { d: 800 }), f(1, { lie: true, mouth: 2, tph: 1 }, { pre: [['breathe', 1]], d: 800 })] };
    case 'guard': return { loop: true, frames: [f(1, { lie: true }, { d: 700 }), f(1, { lie: true, tph: 1 }, { d: 600 })] };
    case 'play': return { loop: true, frames: [f(1, { tailUp: 3, tph: 0 }, { d: 200 }), f(1, { tph: 2 }, { fx: [['dust']], d: 200 })] };
  }
  return null;
}

// ================================================================ 組み立て
const SPECS = { quad: specQuad, bird: null, fish: specFish, blob: specBlob, biped: specBiped, spider: specSpider, dragon: specDragon, bug: specBug, lizard: specLizard };
function specOf(c, def, anim) {
  const shape = def.shape || 'quad';
  const x = { sp: c.sp, def, role: c.role || null, lv: c.lv || 1 };
  let fn = SPECS[shape] || specQuad;
  if (shape === 'bird') fn = c.sp === 'chicken' || c.sp === 'duck' ? specBirdG : specFlyer;
  return fn(anim, x) || fn('idle', x);
}
const resolveQ = (q, view, plain) => {
  const o = plain ? {} : { anim: true };
  for (const k in q) { const v = q[k]; o[k] = v && typeof v === 'object' && !Array.isArray(v) && ('S' in v || 'F' in v || 'B' in v) ? v[view] : v; }
  return o;
};
function mirrorAnchors(An) {
  const M = { ...An }, mx = (x) => SW - 1 - x;
  for (const k of ['mouth', 'tip', 'hand', 'tail', 'grip']) if (An[k]) M[k] = [mx(An[k][0]), An[k][1]];
  for (const k of ['head', 'body']) if (An[k]) M[k] = [SW - An[k][0] - An[k][2], An[k][1], An[k][2], An[k][3]];
  if (An.front != null) M.front = mx(An.front); if (An.back != null) M.back = mx(An.back);
  return M;
}
// 1コマを1つの向きで描く（輪郭・仕上げまで）。S は顔の向き（右＝+1）で描き、反対向きは呼び出し側で反転する
function paintFrame(c, def, view, fr, spec, frame) {
  const painter = PAINTERS[def.shape] || paintQuad;
  const R = rngFrom('creature:' + c.id);
  R.role = c.role || null; CUR_ROLE = c.role || null;
  Q = resolveQ(frame.q || {}, view, spec.plain); A = {};
  const P = new Pix(SW, SH);
  let info;
  try { info = painter(P, R, c.sp, def, c.lv || 1, view, fr) || { grounded: true }; }
  finally { CUR_ROLE = null; }
  const An = A, q = Q; Q = {}; A = {};
  const face = def.shape === 'biped' ? -1 : 1;
  const pre = [...(frame.pre || [])];
  if (def.shape === 'biped' && q.eyes && !def.undead && c.sp !== 'golem') pre.push(['closeEyes']);
  for (const t of pre) applyPre(P, An, t, view, face);
  P.outline();
  for (const t of frame.post || []) applyPost(P, t);
  return { P, An, info, face };
}
function drawLayer(list, tbl, P0, An, view, face, k) {
  if (!list || !list.length) return P0;
  for (const [name, ...args] of list) { const fn = tbl[name]; if (fn) fn(P0, An, view, face, k, ...args); }
  return P0;
}
function compose(base, An, view, face, k, frame) {
  let out = base;
  An.bb = base.bbox();
  if (frame.under && frame.under.length) {
    const U = new Pix(SW, SH);
    for (const [name, ...args] of frame.under) { const fn = UNDER[name]; if (fn) fn(U, An, view, face, k, ...(name === 'puddle' && !args.length ? [An.col] : args)); }
    U.outline();
    U.blit(base, 0, 0, SW, SH, 0, 0);
    out = U;
  }
  drawLayer(frame.fx, FX, out, An, view, face, k);
  return out;
}
const _refCache = new Map();
// 飛ぶ種・泳ぐ種の基準線（歩行シートの下端）。歩行シートと上下の位置を合わせる
function refLineOf(c, def) {
  const key = c.sp + '|' + c.id;
  if (_refCache.has(key)) return _refCache.get(key);
  let y1 = -1;
  for (const v of ['F', 'S', 'B']) for (let fr = 0; fr < 3; fr++) { const { P } = paintFrame(c, def, v, fr, { plain: true }, { q: {} }); const b = P.bbox(); if (b) y1 = Math.max(y1, b[3]); }
  if (_refCache.size > 800) _refCache.clear();
  _refCache.set(key, y1);
  return y1;
}
function buildAnim(c, def, anim) {
  const spec = specOf(c, def, anim);
  const rows = [[], [], [], []];
  let grounded = true, An0 = null;
  spec.frames.forEach((frame, k) => {
    for (const view of ['F', 'S', 'B']) {
      const { P, An, info, face } = paintFrame(c, def, view, frame.fr ?? 1, spec, frame);
      if (view === 'F' && k === 0) { grounded = spec.ground ?? info.grounded !== false; An0 = An; }
      if (view === 'S') {
        const nat = face > 0 ? 2 : 1, oth = 3 - nat;
        const M = P.clone(); M.flipX();
        rows[nat].push(compose(P, An, 'S', face, k, frame));
        rows[oth].push(compose(M, mirrorAnchors(An), 'S', -face, k, frame));
      } else rows[view === 'F' ? 0 : 3].push(compose(P, An, view, face, k, frame));
    }
  });
  // 全コマを同じ枠で切る（横は中心線 x=60 で左右対称、縦は足元をそろえる）
  const mid = SW / 2;
  let x0 = SW, y0 = SH, x1 = -1, y1 = -1;
  for (const row of rows) for (const P of row) { const b = P.bbox(); if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
  if (x1 < 0) { x0 = mid - 1; x1 = mid; y0 = GROUND - 1; y1 = GROUND; }
  const air = spec.air ?? (!!def.flies && !grounded);
  const ref = grounded ? GROUND : refLineOf(c, def);
  const bottom = grounded ? GROUND : Math.max(y1, ref);
  y0 = Math.min(y0, bottom);
  const half = Math.ceil(Math.max(mid - x0, x1 + 1 - mid, 1));
  const fx0 = Math.floor(mid - half), fw = half * 2, fh = bottom - y0 + 1;
  const n = spec.frames.length;
  const S = new Pix(fw * n, fh * 4);
  for (let r = 0; r < 4; r++) for (let k = 0; k < n; k++) S.blit(rows[r][k], fx0, y0, fw, fh, k * fw, r * fh);
  const durs = spec.frames.map((fm) => fm.d ?? 300);
  const fin = durs.filter((d) => d < HOLD);
  const avg = fin.length ? fin.reduce((a, b) => a + b, 0) / fin.length : 300;
  const meta = { frameW: fw, frameH: fh, cols: n, rows: 4, frames: n, fps: Math.max(1, Math.round(1000 / avg)), loop: spec.loop !== false, durs, anchorY: bottom - ref, airborne: !!air, grounded, anim, worldH: fh * PIXEL_SCALE, worldW: fw * PIXEL_SCALE, scale: PIXEL_SCALE, kind: 'creature' };
  const canvas = S.toCanvas(meta);
  return { canvas, ...meta };
}

// ---- キャッシュ（遅延生成）。同じ個体・同じ種・同じレベル・同じ役割・同じアニメなら使い回す
const _cache = new Map();
let CACHE_MAX = 1200;
export function drawCreatureAnim(c, def, anim = 'idle') {
  if (!ANIM_NAMES.includes(anim)) anim = 'idle';
  def = def || {};
  const key = `${c.id}|${c.sp}|${c.lv || 1}|${c.role || ''}|${anim}`;
  const hit = _cache.get(key);
  if (hit) { _cache.delete(key); _cache.set(key, hit); return hit; }
  const res = buildAnim(c, def, anim);
  _cache.set(key, res);
  while (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
  return res;
}
// 個体が消えたとき・進化したときに呼ぶ（呼ばなくても古いものから自然に捨てられる）
export function forgetCreatureAnim(id) { for (const k of [..._cache.keys()]) if (k.startsWith(id + '|')) _cache.delete(k); }
export function setCreatureAnimCacheSize(n) { CACHE_MAX = Math.max(50, n | 0); }
// 経過時間（ms）から何コマ目かを返す。loop=false のアニメは最後のコマで止まる
export function animFrameAt(a, ms) {
  const durs = a.durs; let total = 0; for (const d of durs) total += Math.min(d, HOLD);
  if (a.loop) { let t = ms % total; for (let i = 0; i < durs.length; i++) { if (t < durs[i]) return i; t -= durs[i]; } return durs.length - 1; }
  let t = ms; for (let i = 0; i < durs.length; i++) { if (t < durs[i]) return i; t -= durs[i]; } return durs.length - 1;
}

// ================================================================ 状態 → アニメ
const NOCTURNAL = new Set(['owl', 'bat', 'rat', 'cat', 'fox', 'wolf', 'tiger', 'croc', 'frog', 'spider', 'arachne', 'scorpion', 'snake']);
const NO_SLEEP = new Set(['skeleton', 'skelknight', 'lich', 'mummy', 'pharaoh', 'golem', 'demonlord', 'demongeneral', 'demonsoldier', 'slime', 'bigslime', 'kingslime']);
const GRAZE_SP = new Set(['cow', 'sheep', 'pig', 'horse', 'goat', 'deer', 'reindeer', 'boar', 'rabbit', 'camel', 'donkey', 'unicorn', 'turtle']);
function pickW(h, table) { let tot = 0; for (const k in table) tot += table[k]; let x = h * tot; for (const k in table) { x -= table[k]; if (x <= 0) return k; } return Object.keys(table)[0]; }
// ctx（描画側が知っていること）：{ moving, running, hurt, dead }
//   moving …… この画面更新で位置が動いたか   hurt …… 直前に攻撃を受けたか（0.3秒ほど）
export function creatureAnimState(sim, c, ctx = {}) {
  const def = SPECIES_OF(c);
  if (ctx.dead || c.hp <= 0) return 'dead';
  if (ctx.hurt) return 'hurt';
  const S = sim.S;
  if (c.fight) {
    const t = sim.entity ? sim.entity(c.fight.target) : null;
    const d = t ? Math.hypot(t.pos.x - c.pos.x, t.pos.z - c.pos.z) : 99;
    if (d <= 1.5) return 'attack';
    return def.flies && (def.shape === 'bird' || def.shape === 'dragon') ? 'fly' : 'run';
  }
  const frac = c.maxhp ? c.hp / c.maxhp : 1;
  if (ctx.moving) {
    if (def.shape === 'dragon') return 'fly';
    if (c.role === 'herder' && c.sp === 'dog') return 'work';
    if (c.role === 'plow' && c.sp === 'cow' && c.goal && !c.goal.run) return 'work';
    if (c.fleeUntil && S.t < c.fleeUntil) return def.flies && def.shape === 'bird' ? 'fly' : 'run';
    if (frac < 0.25) return 'walk';
    return c.goal?.run || ctx.running ? (def.shape === 'bird' && def.flies ? 'fly' : 'run') : 'walk';
  }
  if (frac < 0.25) return 'dying';
  const hour = sim.hour ? sim.hour() : 12;
  const night = hour >= 21 || hour < 5, day = hour >= 8 && hour < 17;
  const role = c.role;
  if (role === 'overlord') return 'guard';
  if (role === 'treasure' || (c.named && Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) < 2)) return def.shape === 'dragon' ? 'work' : 'guard';
  if (c.barking != null && S.t - c.barking < 4) return 'call';
  const slot = Math.floor((S.t || 0) / 12);
  const h = strHash(c.id + ':' + slot) / 4294967296;
  const asleep = !NO_SLEEP.has(c.sp) && def.kind !== 'demon' && (NOCTURNAL.has(c.sp) ? day : night);
  if (asleep) return h < 0.85 ? 'sleep' : 'rest';
  if (role === 'plow' && hour >= 8 && hour < 16) return 'work';
  if (role === 'dairy' && (hour === 6 || hour === 17)) return 'work';
  if (role === 'layer' && hour >= 9 && hour < 12) return 'work';
  if (role === 'wool' && hour === 10 && (sim.seasonIdx ? sim.seasonIdx() === 1 : false)) return 'work';
  if (role === 'pest') return h < 0.5 ? 'work' : 'idle';
  if (role === 'sentry' || role === 'scout' || role === 'castleguard' || role === 'guardian') return h < 0.55 ? 'guard' : h < 0.75 ? 'idle' : h < 0.88 ? 'call' : 'rest';
  if (role === 'young') return h < 0.35 ? 'play' : h < 0.6 ? 'idle' : h < 0.8 ? (GRAZE_SP.has(c.sp) ? 'graze' : 'rest') : 'rest';
  const hungry = (c.hunger ?? 60) < 45;
  const grazer = GRAZE_SP.has(c.sp) || def.diet === 'grass' && def.shape !== 'biped';
  let table;
  if (def.kind === 'demon' || def.undead || c.sp === 'golem') table = { guard: 4, idle: 4, call: 1, work: 2, rest: 1 };
  else if (def.shape === 'blob') table = { idle: 5, graze: 2, rest: 2, play: 1, groom: 1, call: 1 };
  else if (grazer) table = { graze: hungry ? 8 : 5, idle: 3, rest: 2, drink: 1, groom: 1, call: 1, ...(role === 'leader' ? { guard: 2 } : {}) };
  else if (def.diet === 'meat') table = { idle: 4, rest: 3, groom: 2, eat: hungry ? 3 : 1, drink: 1, call: role === 'leader' ? 2 : 1, guard: 1, ...(night && c.sp === 'wolf' ? { call: 3 } : {}) };
  else table = { idle: 4, eat: 2, rest: 2, groom: 1, drink: 1, call: 1, work: 1 };
  if (c.hostile && c.lair != null) table.guard = (table.guard || 0) + 3;
  if (def.shape === 'biped' && !def.undead && def.kind !== 'demon' && c.sp !== 'golem') table.work = (table.work || 0) + 1;
  return pickW(h, table);
}
function SPECIES_OF(c) { return SPECIES[c.sp] || {}; }
