// 人のアニメーション（待機・会話・攻撃・被ダメージ・瀕死・死亡・仕事・生活）
//
// drawPersonAnim(p, {age, dead}, anim) → { canvas, frameW, frameH, frames, rows:4, fps, durs, loop, anchorY }
//   行（4）= 向き 0:下(正面) / 1:左 / 2:右 / 3:上(背中)（歩行シートと同じ VXAce 並び）、列 = コマ。
//   durs はコマごとの表示時間（ms）。loop=false のアニメ（被ダメージ・死亡）は最後のコマで止める。
//   anchorY = 0：コマの下端がそのまま足元（接地行）。歩行シートと同じく、横幅は体の中心線で左右対称。
//   1ピクセルの大きさは歩行シートと同じ（PIXEL_SCALE）。スプライトの大きさ = frameW×PIXEL_SCALE, frameH×PIXEL_SCALE。
// anim：'idle' 'talk' 'attack' 'hurt' 'dying' 'death' 'dead' 'work' 'eat' 'drink' 'sleep' 'sit' 'pray' 'cry'
//       'cheer' 'wave' 'play' 'flee' 'beg'、または 'work:hoe' のように仕事の動きを直接指定する。
// personAnimState(sim, p, moving) → いまの状態に合うアニメ名（'walk' は歩行シートを使うという意味）。
// JOB_MOTION：職業 → 仕事の動き。WORK_MOTIONS：仕事の動きの一覧。ANIM_NAMES：アニメの一覧。
//
// 見た目は js/sprites.js の drawPerson と同じ規則・同じ乱数で描く（同じ id なら同じ髪・服・色）。
// sprites.js は編集しないため、人の描画部分をこのファイルに写し、姿勢（pose）を受け取れるようにしてある。
// 姿勢が空のとき（legs 'w0'/'stand'/'w2'）は、drawPerson の歩行シートの各コマと 1 ピクセル単位で一致する（試験で確かめた）。
// 生成は遅延（必要になったアニメだけ）＋キャッシュ（LRU）。

import * as TG from './tribegfx.js'; // 奥地の民族の装い
import { constructMotions, constructProp } from './constructanim.js'; // 普請場の仕事の姿：杭打ち・掛矢・釘打ち・石積み・屋根葺き・背負子と荷車（開発部）
import * as AX from './anim_acts.js'; // 暮らしと仕事の動き（種まき・刈り入れ・売り買い・糸紡ぎ…）
const PIXEL_SCALE = 0.0432; // sprites.js と同じ値
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
function shadow(hex, k = 1) {
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
function highlight(hex, k = 1) { const [h, s, l] = toHsl(hex); return hsl(h, s - 0.02 * k, l + 0.07 * k); }

// ================================================================ ピクセル画布
// ox, oy は描画座標のずらし（設計座標で描いて、下書き画布の中に置くため）
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); this.ox = 0; this.oy = 0; }
  raw(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.d[y * this.w + x] : null; }
  px(x, y, c) { x = Math.round(x) + this.ox; y = Math.round(y) + this.oy; if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
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
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
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
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.raw(x, y)) continue;
      const n = this.raw(x, y + 1) || this.raw(x, y - 1) || this.raw(x - 1, y) || this.raw(x + 1, y);
      if (n) { const [h, s, l] = toHsl(n); out[y * this.w + x] = hsl(h, Math.min(0.5, s * 0.7), Math.min(l * 0.28, 0.12) + 0.02); }
    }
    this.d = out;
  }
  mapColors(fn) { for (let i = 0; i < this.d.length; i++) if (this.d[i]) this.d[i] = fn(this.d[i]); }
  flipX() { const o = new Array(this.d.length); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o[y * this.w + x] = this.d[y * this.w + this.w - 1 - x]; this.d = o; }
  bbox() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.d[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
  blit(src, sx, sy, w, h, dx, dy) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = src.raw(sx + x, sy + y);
      if (c && dx + x >= 0 && dx + x < this.w && dy + y >= 0 && dy + y < this.h) this.d[(dy + y) * this.w + dx + x] = c;
    }
  }
  toCanvas(extra = {}) {
    const data = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i]; if (!c) continue;
      const n = parseInt(c.slice(1, 7), 16);
      data[i * 4] = (n >> 16) & 255; data[i * 4 + 1] = (n >> 8) & 255; data[i * 4 + 2] = n & 255; data[i * 4 + 3] = 255;
    }
    let cv;
    if (typeof document !== 'undefined') {
      cv = document.createElement('canvas');
      cv.width = this.w; cv.height = this.h;
      const g = cv.getContext('2d');
      const img = g.createImageData(this.w, this.h);
      img.data.set(data);
      g.putImageData(img, 0, 0);
    } else cv = { width: this.w, height: this.h, data }; // node のヘッドレス試験用
    cv.userData = { w: this.w, h: this.h, scale: PIXEL_SCALE, ...extra };
    return cv;
  }
  shiftRows(y0, y1, dx) { // 行 y0〜y1（生座標）を横に dx ずらす（前かがみ・のけぞり）
    if (!dx) return;
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      const row = this.d.slice(y * this.w, (y + 1) * this.w);
      for (let x = 0; x < this.w; x++) { const sx = x - dx; this.d[y * this.w + x] = sx >= 0 && sx < this.w ? row[sx] : null; }
    }
  }
}

// 横倒し（死体）：時計回りに90度
function rotated(P) {
  const Q = new Pix(P.h, P.w);
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) Q.d[x * Q.w + (P.h - 1 - y)] = P.d[y * P.w + x];
  return Q;
}
function trimPix(P, pad = 0) {
  const b = P.bbox(); if (!b) return new Pix(2, 2);
  const Q = new Pix(b[2] - b[0] + 1 + pad * 2, b[3] - b[1] + 1 + pad * 2);
  Q.blit(P, b[0], b[1], b[2] - b[0] + 1, b[3] - b[1] + 1, pad, pad);
  return Q;
}

// ================================================================ 人
const EYES = ['#2a1e14', '#3a2616', '#2f4f7a', '#3a6a4a', '#5a4a2a', '#4a4a5a', '#6a3a2a', '#1a2a4a', '#4a6a8a'];
const HERALD = ['#b0282a', '#2a4ab0', '#2a8a4a', '#c9a23a', '#6a2a8a', '#1a1a1a', '#e8e8e8', '#c9602a'];
const CLOTH = ['#3b6fb6', '#b63b3b', '#3b8f5a', '#8f6a3b', '#6a3b8f', '#c9a23a', '#3b8f8f', '#7a7a7a', '#a0522d', '#d0d0c0', '#4a4a6a', '#8a3a5a', '#5a7a2a', '#2a5a7a'];
const GOLD = '#e8c040', GOLD_D = '#b08a20', STEEL = '#c8ccd4', STEEL_D = '#8a909a', STEEL_L = '#eef0f6';

const HAIR_M = { short: 5, crop: 3, sidepart: 4, spiky: 3, curly: 2, bald: 1.5, mohawk: 0.4, long: 0.8, ponytail: 0.6, bun: 0.3, messy: 2.5, wavy: 1 };
const HAIR_F = { long: 4, bob: 3, ponytail: 3, bun: 2, twintails: 1.5, curly: 1.5, braid: 2, sidepart: 1, short: 0.8, wavy: 2.5, messy: 0.8, pigtailbuns: 0.8 };

// 冒険者の職業（js/advclass.js の p.advClass）ごとの装い。戦士・弓使いは今ある装いを使う
const ADV_JOB_LOOK = new Set(['adventurer', 'warrior', 'archer', 'cleric', 'sage']);
const ADV_LOOK = { swordsman: 'adv_swordsman', hero: 'adv_hero', monk: 'adv_monk', squire: 'adv_squire', bandit: 'adv_bandit', thief: 'adv_thief', wizard: 'adv_wizard', sorcerer: 'adv_sorcerer', priest: 'adv_priest', fighter: 'warrior', archer: 'archer' };
function outfitOf(p, stage) {
  const rank = p.rank;
  if (rank === 'prisoner') return 'prisoner';
  if (TG.isTribalDress(p)) return stage === 'baby' ? 'kid' : 'tribal';
  if (stage === 'baby' || stage === 'child') {
    if (rank === 'king' || rank === 'royal') return 'royalkid';
    if (rank === 'noble') return 'noblekid';
    if (rank === 'homeless') return 'beggar';
    return 'kid';
  }
  if (rank === 'king' || p.job === 'king') return 'king';
  if (p.advClass && ADV_JOB_LOOK.has(p.job) && ADV_LOOK[p.advClass]) return ADV_LOOK[p.advClass];
  if (p.job) return p.job;
  switch (rank) {
    case 'royal': return 'royal';
    case 'noble': return 'noble';
    case 'knight': return 'knight';
    case 'adventurer': return 'adventurer';
    case 'wanderer': return 'wanderer';
    case 'homeless': return 'beggar';
    case 'outlaw': return 'thief';
    default: return 'plain';
  }
}

// ================================================================ 人の画家（drawPerson の準備部分を写したもの）
// 見た目の特徴を一度だけ決め、姿勢ごとに1コマを描く関数 frame(view, pose) を返す。
function makePainter(p, opts = {}) {
  const age = opts.age ?? 30;
  const R = rngFrom('person:' + p.id);
  const L = p.look || {};
  const f = p.sex === 'f';
  const stage = age < 5 ? 'baby' : age < 13 ? 'child' : age >= 64 ? 'elder' : 'adult';
  const kid = stage === 'baby' || stage === 'child';
  const outfit = outfitOf(p, stage);
  const south = !!p.south;

  // ---- 個体の特徴（引く順番は固定。年齢や職業が変わっても面影が残る）
  const skin = jit(L.skin || '#e8b98f', R, 0.012, 0.06, 0.045);
  let hair = jit(L.hair || '#6b4226', R, 0.025, 0.1, 0.07);
  const eye = R.pick(EYES);
  const hairStyle = R.wpick(f ? HAIR_F : HAIR_M);
  const hairStyleKid = R.wpick(f ? { long: 3, bob: 3, twintails: 3, ponytail: 2, pigtailbuns: 1.5, braid: 1 } : { short: 4, messy: 4, crop: 2, sidepart: 2, curly: 1 });
  const beardT = L.beard ? R.wpick({ stubble: 2, mustache: 2, full: 3, goatee: 1.5, chin: 1, long: 1, sideburns: 1 }) : (R.f() < (f ? 0 : 0.08) ? 'stubble' : null);
  const frecklesR = R.f(), moleR = R.f(), molePos = [R.pick([5, 6, 9, 10]), R.int(4, 5)];
  const scarR = R.f(), scarKind = R.pick(['eyeL', 'eyeR', 'cheekL', 'cheekR', 'nose']);
  const earringR = R.f(), earringC = R.pick([GOLD, '#dfe4ec', '#d0303a', '#3a7ad8', '#40c0c0']);
  const scarfR = R.f(), scarfC = jit(R.pick(CLOTH), R, 0.03, 0.1, 0.08);
  const casualR = R.f(), casualKind = R.pick(['cap', 'beret', 'knit', 'kerchief', 'wide']);
  const hatCol = jit(R.pick(CLOTH), R, 0.03, 0.1, 0.1);
  let build = R.wpick({ thin: 2, normal: 5, stout: 2 });
  const tall = R.wpick({ '-1': 2, '0': 5, '1': 2 }) | 0;
  const shirt = jit(L.shirt || '#3b6fb6', R, 0.03, 0.12, 0.08);
  const pants = jit(L.pants || '#5a4a3a', R, 0.03, 0.1, 0.07);
  const shoe = jit(R.pick(['#3a2a1e', '#2a1e14', '#5a3a22', '#1e1e24', '#6a4a2a']), R, 0.02, 0.05, 0.04);
  const belt = R.pick(['#5a3a22', '#3a2616', '#2a2a2a', '#8a6a3a']);
  const blushR = R.f(), browsR = R.f();
  const detail = R.wpick({ none: 3, vneck: 2, buttons: 2, vest: 2, stripeV: 1, sash: 1, patch: 1, collar: 2 });
  const vestCol = jit(R.pick(CLOTH), R, 0.03, 0.1, 0.1);
  let accent = jit(R.pick(HERALD), R, 0.03, 0.1, 0.08);
  const itemRoll = R.f(), eyepatchR = R.f(), glassesR = R.f(), skirtR = R.f(), caneR = R.f(), dirtR = R.f();
  const patchPos = [R.f(), R.f()], dirtPos = [R.f(), R.f(), R.f()];
  const sc2 = R.f();
  // 服装の個体差（ここから下は職業によって意味が変わる）
  const o1 = R.f(), o2 = R.f(), o3 = R.f(), o4 = R.f();
  const oc1 = R.f(), oc2 = R.f(), oc3 = R.f();
  const rp = [R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f(), R.f()];
  const pickBy = (arr, u) => arr[Math.floor(u * arr.length) % arr.length];
  const rich = (base, u = oc3) => adj(base, (u - 0.5) * 0.05, (oc2 - 0.5) * 0.14, (oc1 - 0.5) * 0.14);

  if (['smith', 'innkeeper', 'woodcutter', 'miner'].includes(outfit) && o4 < 0.5) build = 'stout';
  if (['beggar', 'prisoner', 'scholar'].includes(outfit) && build === 'stout' && o4 < 0.7) build = 'thin';
  const scarChance = { adventurer: 0.4, knight: 0.35, soldier: 0.35, guard: 0.25, thief: 0.4, sailor: 0.3, hunter: 0.25, smith: 0.15, prisoner: 0.35, beggar: 0.25 }[outfit] ?? 0.07;
  const scar = scarR < scarChance ? scarKind : null;
  const freckles = frecklesR < (f ? 0.22 : 0.16);
  const mole = moleR < 0.16 ? molePos : null;
  const earring = earringR < (f ? 0.28 : 0.1) ? earringC : null;
  let scarf = scarfR < 0.16 ? scarfC : null;
  const casualHat = casualR < 0.2 ? casualKind : null;
  const blush = blushR < (f ? 0.5 : 0.12);
  const brows = browsR < 0.3;
  let eyepatch = eyepatchR < (outfit === 'sailor' || outfit === 'thief' ? 0.2 : outfit === 'adventurer' ? 0.08 : 0);
  let glasses = outfit === 'scholar' || (glassesR < 0.06 && age > 30);
  const pantsJobs = ['knight', 'soldier', 'guard', 'thief', 'adventurer', 'hunter', 'sailor', 'fisher', 'miner', 'woodcutter', 'smith', 'prisoner', 'jailer', 'general', 'royalguard', 'warrior', 'archer', 'paladin', 'pirate', 'smuggler', 'banditchief', 'pickpocket', 'diver', 'charcoal', 'mason', 'stablehand', 'messenger', 'watchman', 'captain', 'shipwright'];
  let skirt = f && (!pantsJobs.includes(outfit) ? skirtR < 0.85 : skirtR < 0.15);
  let dirt = outfit === 'miner' || outfit === 'beggar' || (outfit === 'smith' && dirtR < 0.6);
  const cane = stage === 'elder' && caneR < 0.45;
  if (age >= 45) hair = mix(hair, o2 < 0.5 ? '#d8d8dc' : '#b8b8bc', Math.min(1, (age - 45) / 28));
  if (age >= 72) hair = mix(hair, '#eeeef0', 0.5);

  // ---- 服装の設定
  let top = shirt, bottom = pants, sleeve = null, hat = casualHat, hatC = hatCol, long = null, barefoot = false, item = null;
  let overlay = null, capeC = null, hood = null, helmet = null, mask = false, stripes = null, apron = null, shield = null, tabard = false, forcePatch = false, plumeGold = false;
  let accentOverride = null, forceGlasses = false, forceSkirt = false, dirtForce = false, scarfForce = null;
  const skinTop = () => skin;
  let handWrap = null;
  switch (outfit) {
    case 'king': top = rich('#b0282a'); long = top; capeC = rich('#8a1a22'); hat = 'crown'; item = itemRoll < 0.5 ? 'scepter' : null; overlay = 'ermine'; break;
    case 'royal': top = rich(pickBy(['#3a4ab0', '#2a7a5a', '#8a2a6a', '#b04a6a', '#d8d0e8'], o1)); long = f ? top : null; bottom = rich('#e8e0d0');
      capeC = o2 < 0.5 ? rich(pickBy(['#2a3a8a', '#6a2a8a', '#8a1a22'], o3)) : null; hat = f ? 'tiara' : 'circlet'; overlay = 'goldtrim'; break;
    case 'noble': top = rich(pickBy(['#5a2a8a', '#2a3a8a', '#3a2a6a', '#1a4a6a', '#6a1a3a'], o1)); long = f ? top : null; bottom = rich('#2a2a3a');
      hat = o2 < 0.55 ? 'feather' : null; overlay = o3 < 0.5 ? 'ruff' : 'goldbtn'; break;
    case 'knight': top = STEEL; bottom = '#9aa0aa'; helmet = o1 < 0.55 ? 'closed' : 'open'; overlay = 'plate'; item = 'sword'; hat = null; tabard = o2 < 0.6; shield = o3 < 0.5 ? accent : null; capeC = o4 < 0.4 ? rich(accent) : null; break;
    case 'soldier': top = rich('#7a5a3a'); bottom = rich('#4a3a2a'); helmet = 'kettle'; overlay = 'leather'; item = 'spear'; hat = null; break;
    case 'guard': top = '#8a8e96'; bottom = rich('#3a3a4a'); helmet = 'morion'; overlay = 'chain'; item = 'spear'; hat = null; break;
    case 'jailer': top = rich('#3a3a3e'); bottom = rich('#2a2a2e'); overlay = 'keys'; hat = o1 < 0.4 ? 'cap' : null; hatC = rich('#2a2a2e'); item = itemRoll < 0.5 ? 'club' : null; break;
    case 'farmer': hat = 'straw'; overlay = 'overalls'; bottom = rich('#4a5a8a'); item = itemRoll < 0.45 ? 'pitchfork' : itemRoll < 0.65 ? 'hoe' : null; break;
    case 'rancher': hat = 'cowboy'; hatC = rich('#6a4a2a'); overlay = 'vestopen'; item = itemRoll < 0.4 ? 'rope' : null; break;
    case 'hunter': top = rich(pickBy(['#3a6a3a', '#4a5a2a', '#5a4a2a'], o1)); hood = o2 < 0.5 ? rich('#2f5a2f') : null; hat = hood ? null : 'feathercap'; hatC = rich('#3a5a2a'); overlay = 'quiver'; item = 'bow'; break;
    case 'fisher': stripes = [pickBy(['#2a4a8a', '#b03a3a', '#2a6a8a'], o1), '#e8e8e0']; hat = o2 < 0.6 ? 'bandana' : 'wide'; hatC = rich(pickBy(['#c03a3a', '#3a6ab0', '#e0c040'], o3)); item = itemRoll < 0.4 ? 'rod' : null; break;
    case 'sailor': stripes = ['#2a3a8a', '#f0f0f0']; hat = o2 < 0.5 ? 'bandana' : 'sailorcap'; hatC = rich(pickBy(['#c03a3a', '#2a2a2a', '#3a6ab0'], o3)); break;
    case 'woodcutter': overlay = 'plaid'; top = rich(pickBy(['#b03a2a', '#3a7a3a', '#3a4a8a'], o1)); item = 'axe'; hat = o2 < 0.3 ? 'knit' : null; break;
    case 'miner': top = rich('#6a6258'); bottom = rich('#4a4238'); hat = 'minercap'; item = 'pick'; break;
    case 'baker': top = '#f0ece0'; hat = 'chef'; apron = '#ffffff'; item = itemRoll < 0.4 ? 'bread' : null; break;
    case 'smith': apron = rich('#5a3a22'); sleeve = 'bare'; item = 'hammer'; hat = o2 < 0.3 ? 'headband' : null; break;
    case 'carpenter': apron = rich('#b08a5a'); item = itemRoll < 0.6 ? 'hammer' : 'saw'; hat = o2 < 0.5 ? 'headband' : casualHat; break;
    case 'innkeeper': apron = o1 < 0.6 ? '#f0ece0' : rich('#8a6a4a'); item = 'mug'; break;
    case 'merchant': overlay = 'vest'; hat = o2 < 0.5 ? 'beret' : casualHat; item = 'purse'; break;
    case 'tailor': overlay = 'tape'; top = rich(pickBy(CLOTH, o1)); hat = o2 < 0.3 ? 'beret' : null; break;
    case 'servant': if (f) { top = rich('#2a2a34'); long = top; apron = '#f4f4f4'; hat = 'katyusha'; } else { top = '#f0f0f0'; overlay = 'butler'; bottom = '#2a2a30'; hat = null; } break;
    case 'priest': top = '#f4f2ea'; long = top; overlay = 'stole'; hat = o2 < 0.4 ? 'skullcap' : null; item = itemRoll < 0.35 ? 'holybook' : null; break;
    case 'elder': top = rich(pickBy(['#6a4a2a', '#4a5a3a', '#5a4a5a'], o1)); long = top; item = 'staffplain'; hat = null; break;
    case 'wizard': top = rich(pickBy(['#3a3a9a', '#6a2a8a', '#8a2a2a', '#2a6a6a', '#2a2a3a'], o1)); long = top; hat = 'wizard'; hatC = top; item = 'staff'; overlay = o2 < 0.5 ? 'stars' : null; break;
    case 'scholar': top = rich(pickBy(['#3a2a1a', '#2a2a3a', '#3a4a3a', '#4a2a2a'], o1)); long = top; item = 'book'; hat = o2 < 0.3 ? 'beret' : null; break;
    case 'adventurer': top = rich(pickBy(['#7a5a3a', '#5a4a3a', '#6a3a2a'], o1)); capeC = rich(pickBy(['#b03a2a', '#2a4a8a', '#3a6a3a', '#6a3a8a', '#8a6a2a'], o2)); overlay = 'leather'; item = itemRoll < 0.75 ? 'sword' : 'axe'; hat = o3 < 0.35 ? 'headband' : null; break;
    case 'thief': top = rich('#2a2a30'); bottom = rich('#1e1e24'); hood = rich(pickBy(['#2a2a30', '#3a2a2a', '#2a3a2a'], o1)); mask = true; item = 'dagger'; hat = null; break;
    case 'wanderer': capeC = rich(pickBy(['#6a5a3a', '#4a5a3a', '#5a4a3a'], o1)); hat = 'wide'; hatC = rich('#6a4a2a'); overlay = 'bag'; item = itemRoll < 0.5 ? 'staffplain' : null; break;
    case 'bard': top = rich(pickBy(['#c03a3a', '#3a8a3a', '#c09a2a', '#3a5ab0'], o1)); overlay = 'split'; hat = 'feathercap'; hatC = rich(pickBy(['#8a2a6a', '#2a6a8a', '#c06a2a'], o2)); item = 'lute'; break;
    case 'beggar': top = rich(pickBy(['#7a6a58', '#6a6258', '#5a5040'], o1)); bottom = rich('#5a5040'); overlay = 'rags'; barefoot = o2 < 0.6; hat = o3 < 0.3 ? 'kerchief' : null; hatC = rich('#6a5a48'); break;
    case 'prisoner': stripes = ['#2a2a2a', '#e8e4d8']; bottom = null; barefoot = o2 < 0.5; overlay = 'shackle'; hat = null; break;
    case 'royalkid': top = rich(pickBy(['#3a4ab0', '#8a2a6a', '#d8d0e8', '#2a7a5a'], o1)); hat = 'circlet'; overlay = 'goldtrim'; long = f ? top : null; break;
    case 'noblekid': top = rich(pickBy(['#5a2a8a', '#2a3a8a', '#1a4a6a'], o1)); overlay = 'goldbtn'; break;
    // ---- 宮廷
    case 'chancellor': top = rich('#2a2a4a'); long = top; overlay = 'goldtrim'; hat = 'beret'; hatC = rich('#1a1a2a'); item = 'scroll'; break;
    case 'treasurer': top = rich('#2a5a3a'); long = f ? top : null; bottom = rich('#2a2a2a'); overlay = 'goldbtn'; hat = o2 < 0.5 ? 'beret' : null; hatC = rich('#1a3a2a'); item = 'purse'; break;
    case 'general': top = STEEL; bottom = '#9aa0aa'; helmet = 'open'; overlay = 'plate'; tabard = true; capeC = rich('#a01a22'); item = 'sword'; plumeGold = true; hat = null; break;
    case 'royalguard': top = STEEL; bottom = '#9aa0aa'; helmet = 'closed'; overlay = 'plate'; tabard = true; accentOverride = rich('#2a3a9a'); capeC = rich('#2a3a8a'); item = 'spear'; hat = null; break;
    case 'courtmage': top = rich(pickBy(['#4a2a8a', '#2a3a8a', '#6a1a4a'], o1)); long = top; hat = 'wizard'; hatC = top; item = 'staff'; overlay = 'goldtrim'; break;
    case 'butler': top = '#f0f0f0'; overlay = 'butler'; bottom = '#2a2a30'; hat = null; if (f) { top = rich('#2a2a34'); long = top; apron = '#f4f4f4'; hat = 'katyusha'; overlay = null; } break;
    case 'maid': top = rich('#2a2a34'); long = f ? top : null; apron = '#f4f4f4'; hat = f ? 'katyusha' : null; break;
    case 'cook': top = '#f0ece0'; hat = 'chef'; apron = '#ffffff'; item = 'ladle'; break;
    case 'gardener': top = rich('#5a7a3a'); apron = rich('#6a8a4a'); hat = o2 < 0.5 ? 'straw' : 'cap'; hatC = rich('#4a6a2a'); item = 'shears'; break;
    case 'jester': top = rich('#d03030'); overlay = 'split'; hat = 'jester'; hatC = rich('#e8c030'); break;
    // ---- 町
    case 'doctor': top = '#f0f0ec'; long = top; bottom = rich('#2a2a3a'); overlay = 'coat'; item = 'bag'; hat = null; break;
    case 'herbalist': top = rich('#4a7a3a'); apron = rich('#8a6a3a'); item = 'herbs'; hat = o2 < 0.5 ? 'kerchief' : null; hatC = rich('#6a8a3a'); break;
    case 'midwife': top = rich('#8a6a5a'); apron = '#f4f4f0'; hat = 'kerchief'; hatC = '#f4f4f0'; break;
    case 'teacher': overlay = 'vest'; item = 'book'; break;
    case 'scribe': top = rich('#5a4a3a'); long = top; item = 'scroll'; hat = o2 < 0.4 ? 'beret' : null; break;
    case 'changer': overlay = 'vest'; hat = 'beret'; hatC = rich('#3a2a1a'); item = 'purse'; break;
    case 'butcher': top = rich('#d8d0c0'); apron = '#f4f0ec'; overlay = 'blood'; item = 'cleaver'; break;
    case 'brewer': apron = rich('#6a4a2a'); item = 'mug'; hat = o2 < 0.4 ? 'knit' : null; break;
    case 'cobbler': apron = rich('#4a3222'); item = 'hammer'; break;
    case 'potter': apron = rich('#a06a4a'); sleeve = 'bare'; item = 'pot'; overlay = 'clay'; break;
    case 'weaver': overlay = 'tape'; top = rich(pickBy(CLOTH, o1)); item = 'yarn'; hat = o2 < 0.4 ? 'kerchief' : null; break;
    case 'jeweler': overlay = 'vest'; item = 'gem'; hat = o2 < 0.5 ? 'beret' : null; break;
    case 'alchemist': top = rich(pickBy(['#3a5a3a', '#5a3a2a', '#3a3a5a'], o1)); long = top; apron = rich('#6a5a3a'); item = 'flask'; forceGlasses = true; break;
    case 'fortune': hood = rich(pickBy(['#6a2a8a', '#3a2a6a', '#8a2a4a'], o1)); top = rich(pickBy(['#4a1a6a', '#2a1a4a'], o2)); long = top; overlay = 'stars'; item = 'orb'; break;
    case 'painter': top = rich('#e8e0d0'); overlay = 'paint'; hat = 'beret'; hatC = rich(pickBy(['#8a2a2a', '#2a2a6a', '#1a1a1a'], o2)); item = 'brush'; break;
    case 'musician': top = rich(pickBy(['#3a5ab0', '#8a3a8a', '#c09a2a'], o1)); overlay = 'goldbtn'; hat = o2 < 0.5 ? 'feathercap' : null; hatC = rich('#3a2a4a'); item = 'lute'; break;
    case 'dancer': top = rich(pickBy(['#e04080', '#e0a020', '#20a0a0', '#c02040'], o1)); overlay = 'dancer'; hat = 'headband'; accentOverride = GOLD; forceSkirt = true; barefoot = o2 < 0.5; break;
    case 'stablehand': overlay = 'vestopen'; hat = 'cap'; hatC = rich('#6a4a2a'); item = 'pitchfork'; break;
    case 'messenger': top = rich(accent); overlay = 'bag'; hat = 'feathercap'; hatC = rich('#2a2a4a'); item = 'scroll'; break;
    case 'watchman': top = rich('#5a4a3a'); overlay = 'leather'; helmet = 'kettle'; item = 'lantern'; hat = null; break;
    case 'gravedigger': top = rich('#3a3a3a'); bottom = rich('#2a2a2a'); hat = o2 < 0.6 ? 'wide' : null; hatC = rich('#2a2a2a'); item = 'shovel'; break;
    case 'laundress': sleeve = 'bare'; apron = '#f0f0ec'; hat = 'kerchief'; item = 'basket'; break;
    case 'nanny': apron = '#f8f4f0'; hat = 'bonnet'; top = rich(pickBy(['#8a9ac8', '#c89aa8', '#9ac8a8'], o1)); break;
    case 'barber': apron = '#f4f4f4'; item = 'shears'; break;
    case 'storyteller': capeC = rich(pickBy(['#5a3a6a', '#3a4a5a', '#6a4a2a'], o1)); hat = 'wide'; hatC = rich('#4a3a2a'); item = 'staffplain'; break;
    case 'nun': top = '#1e1e28'; long = top; hat = 'nunveil'; item = o2 < 0.4 ? 'holybook' : null; overlay = 'nunbib'; break;
    // ---- 村
    case 'shepherd': capeC = rich(pickBy(['#8a7a5a', '#6a5a4a'], o1)); hat = o2 < 0.5 ? 'wide' : 'kerchief'; hatC = rich('#6a5a3a'); item = 'crook'; break;
    case 'beekeeper': top = '#e8e0c8'; bottom = rich('#d8d0b8'); hat = 'beekeeper'; item = o2 < 0.5 ? 'smoker' : null; break;
    case 'miller': top = rich('#e0d8c8'); apron = '#f0ece0'; hat = 'cap'; hatC = '#e8e4d8'; item = 'sack'; overlay = 'flour'; break;
    case 'charcoal': top = rich('#3a3430'); bottom = rich('#2a2420'); dirtForce = true; item = 'shovel'; hat = o2 < 0.4 ? 'kerchief' : null; hatC = rich('#3a3a3a'); break;
    case 'mason': top = rich('#9a948a'); apron = rich('#7a7468'); item = 'pick'; hat = 'headband'; break;
    case 'gatherer': top = rich('#6a7a4a'); hat = 'kerchief'; hatC = rich('#c8a060'); item = 'basket'; break;
    // ---- 港
    case 'captain': top = rich('#1e2a5a'); long = top; overlay = 'goldbtn'; hat = 'tricorne'; item = 'sword'; break;
    case 'shipwright': apron = rich('#8a6a4a'); hat = 'bandana'; hatC = rich(pickBy(['#3a5ab0', '#c03a3a'], o2)); item = 'saw'; break;
    case 'keeper': top = rich('#2a3a5a'); hat = 'cap'; hatC = rich('#1a2a4a'); item = 'lantern'; scarfForce = rich('#c03a3a'); break;
    case 'diver': sleeve = 'bare'; top = skinTop(); bottom = rich('#2a4a6a'); hat = 'headband'; accentOverride = '#f0f0f0'; item = 'pearl'; barefoot = true; break;
    case 'pirate': stripes = ['#b02a2a', '#f0e8e0']; hat = 'bandana'; hatC = rich('#b02a2a'); forcePatch = o2 < 0.6; item = 'sword'; break;
    case 'smuggler': top = rich('#3a3a2a'); hood = rich('#4a3a2a'); overlay = 'bag'; item = 'sack'; break;
    // ---- 冒険者
    case 'warrior': top = rich('#6a4a2a'); overlay = 'leather'; hat = 'headband'; item = 'bigaxe'; sleeve = o2 < 0.5 ? 'bare' : null; capeC = o3 < 0.3 ? rich('#6a2a1a') : null; break;
    case 'archer': top = rich(pickBy(['#3a6a3a', '#5a6a2a'], o1)); hood = o2 < 0.5 ? rich('#2f5a2f') : null; hat = hood ? null : 'feathercap'; hatC = rich('#3a5a2a'); overlay = 'quiver'; item = 'bow'; break;
    case 'cleric': top = '#f4f2ea'; long = top; overlay = 'stole'; hat = 'skullcap'; item = 'mace'; break;
    case 'sage': top = rich(pickBy(['#e8e8f0', '#3a6aa8', '#e0d8b8'], o1)); long = top; overlay = 'goldtrim'; hood = o2 < 0.4 ? rich('#d8d8e8') : null; item = 'staff'; break;
    case 'paladin': top = STEEL; bottom = '#9aa0aa'; helmet = o1 < 0.4 ? 'closed' : 'open'; overlay = 'plate'; tabard = true; accentOverride = '#f4f2ea'; shield = '#f4f2ea'; item = 'sword'; plumeGold = true; capeC = o3 < 0.5 ? '#f0ece0' : null; break;
    case 'guildmaster': top = rich('#5a3a2a'); overlay = 'leather'; capeC = rich('#3a2a4a'); hat = 'feather'; hatC = rich('#3a2a1a'); item = 'sword'; forcePatch = o2 < 0.4; break;
    // ---- 悪党
    case 'banditchief': top = rich('#3a2a22'); bottom = rich('#2a1e18'); hat = 'bandana'; hatC = rich('#8a1a1a'); capeC = rich('#4a1a1a'); item = 'bigaxe'; overlay = 'fur'; break;
    case 'pickpocket': top = rich('#4a4a3a'); hat = 'cap'; hatC = rich('#3a3a2a'); item = 'dagger'; break;
    case 'swindler': top = rich(pickBy(['#8a2a6a', '#2a6a5a', '#8a6a2a'], o1)); overlay = 'vest'; hat = 'tophat'; item = 'purse'; break;
    // ---- 冒険者の職業（advclass.js）。地図の上の小ささでも、かぶり物・色・持ち物で見分ける
    case 'adv_swordsman': top = rich(pickBy(['#2a5aa0', '#2a6a8a', '#3a4a9a'], o1)); bottom = rich('#3a3a4a'); overlay = 'leather'; hat = 'headband'; accentOverride = pickBy(['#f0f0ea', '#d0302a', '#2a2a30'], o2); item = 'greatsword'; capeC = null; break;
    case 'adv_hero': top = rich('#2a50c0'); bottom = rich('#e8e0c8'); capeC = rich('#c0282a'); hat = 'circlet'; overlay = 'goldtrim'; item = 'sword'; shield = '#3a62d8'; accentOverride = GOLD; plumeGold = true; break;
    case 'adv_monk': top = rich(pickBy(['#e8e2d0', '#e07a20', '#c83a2a'], o1)); bottom = rich(pickBy(['#e8e2d0', '#2a2a30', '#6a4a2a'], o2)); sleeve = 'bare'; overlay = 'gi'; hat = 'headband'; accentOverride = '#d02a2a'; barefoot = true; item = 'fists'; handWrap = '#f4f0e4'; skirt = false; capeC = null; break;
    case 'adv_squire': top = '#8a8e96'; bottom = rich('#4a3a2a'); helmet = 'kettle'; overlay = 'squire'; tabard = true; item = 'sword'; shield = rich(accent); hat = null; skirt = false; break;
    case 'adv_bandit': top = rich(pickBy(['#6a3a22', '#5a4a2a', '#4a2a22'], o1)); bottom = rich('#2a1e18'); sleeve = 'bare'; hat = 'bandana'; hatC = rich(pickBy(['#b01a1a', '#8a1a1a', '#c04a1a'], o2)); overlay = 'fur'; item = o3 < 0.55 ? 'axe' : 'dagger'; forcePatch = o4 < 0.3; skirt = false; if (build === 'thin') build = 'normal'; break;
    case 'adv_thief': top = rich(pickBy(['#3a2e26', '#2a2a30', '#3a3a2a'], o1)); bottom = rich('#1e1c20'); hood = rich(pickBy(['#6a2a2a', '#5a3a26', '#3e3a44'], o2)); mask = true; item = 'dagger'; overlay = 'thiefbelt'; skirt = false; build = 'thin'; hat = null; break;
    case 'adv_wizard': top = rich(pickBy(['#6a2a8a', '#3a3a9a', '#8a2a3a', '#2a5a6a'], o1)); long = top; hat = 'wizard'; hatC = dk(top, 0.1); item = 'staff'; overlay = 'stars'; break;
    case 'adv_sorcerer': top = rich(pickBy(['#1e2a5a', '#3a2a5a', '#1e4a4a', '#1e1e4a'], o1)); long = top; hood = rich(pickBy(['#2a3a7a', '#4a3a7a', '#2a5a5a', '#2a2a5a'], o1)); overlay = 'sorcerer'; item = 'tome'; hat = null; capeC = null; break;
    case 'adv_priest': top = '#f4f2ea'; long = top; overlay = 'stole'; hat = 'miter'; hatC = '#f4f2ea'; item = 'holystaff'; accentOverride = GOLD; break;
    case 'tribal': ({ top, bottom, long, sleeve, hat, hatC, item, overlay, capeC, hood, mask, barefoot, skirt, build, accent, scarf, stripes, apron, handWrap, hair } = TG.tribeDress({ p, age, skin, top, bottom, long, sleeve, hat, hatC, item, overlay, capeC, hood, mask, barefoot, skirt, build, accent, scarf, stripes, apron, handWrap, hair })); break; // 奥地の民族（js/tribegfx.js）
    case 'kid': hat = o1 < 0.12 ? (o2 < 0.5 ? 'cap' : 'knit') : null; break;
    default: break;
  }
  if (accentOverride) accent = accentOverride;
  if (forceGlasses) glasses = true;
  if (forceSkirt && f) skirt = true;
  if (dirtForce) dirt = true;
  if (scarfForce) scarf = scarfForce;
  if (forcePatch) eyepatch = true;
  if (stage === 'baby') { hat = outfit === 'royalkid' ? 'circlet' : (o1 < 0.3 ? 'bonnet' : null); item = null; capeC = null; }
  if (stage === 'elder' && cane && !item) item = 'cane';
  const southWrap = south && !helmet && !hood && !['crown', 'tiara', 'wizard', 'chef', 'circlet', 'katyusha'].includes(hat);
  if (southWrap) {
    hat = f ? 'veil' : 'turban';
    hatC = rich(pickBy(['#f0ead8', '#e8d8b0', '#3a4a8a', '#c0602a', '#e8e8e8', '#8a2a2a'], o4));
    if (!long && !['knight', 'soldier', 'guard', 'prisoner'].includes(outfit) && !stripes) long = mix(top, '#f0e8d0', 0.35);
    else if (long) long = mix(long, '#f0e8d0', 0.15);
  }
  if (long) long = sep(long, skin);
  if (long) top = long; else top = sep(top, skin, 0.1);
  hair = sep(hair, skin, 0.12);
  if (hood) hood = sep(hood, skin);
  const plume = [plumeGold ? GOLD : HERALD[Math.floor(rp[0] * 6)], plumeGold ? 1 : Math.floor(rp[1] * 3)];
  const orb = pickBy(['#60e0ff', '#ff6080', '#80ff80', '#c080ff', '#ffd040'], rp[2]);
  const tiaraGem = pickBy(['#d0303a', '#3a7ad8', '#e060c0'], rp[3]);
  const skirtC = outfit === 'plain' || outfit === 'kid' ? (sc2 < 0.5 ? pants : dk(top, 0.08)) : dk(top, 0.06);
  const hs = kid ? hairStyleKid : hairStyle;

  // ---- 体の寸法（設計座標：幅16・足元 y23、中心線 x8）
  const FEET = 23;
  let headH = 6, torsoH, legH;
  if (stage === 'baby') { headH = 5; torsoH = 3; legH = age < 2 ? 1 : 2; }
  else if (stage === 'child') { torsoH = age < 9 ? 5 : 6; legH = age < 9 ? 3 : 4; }
  else { torsoH = 7; legH = 6 + tall; }
  if (stage === 'elder') legH -= 1;
  let bx0 = 4, bx1 = 11;
  if (kid) { bx0 = 5; bx1 = 10; } else if (build === 'thin') { bx0 = 5; bx1 = 10; } else if (build === 'stout') { bx0 = 3; bx1 = 12; }
  const tw = bx1 - bx0 + 1;
  const sw = Math.max(4, tw - 2), sx0 = 8 - Math.ceil(sw / 2), sx1 = sx0 + sw - 1; // 横向きの胴（正面より細い）
  const hl = lt(hair, 0.1), hd = dk(hair, 0.08);

  // ---------------------------------------------------------------- 姿勢の部品（腕・表情・小道具・道具）
  // 腕の指定（q.T＝道具を持つ手、q.O＝もう一方の手）：
  //   {a, b, r} … 肩からの角度（度）。0=真下、90=前（横向き）／外側（正面・背中）、180=真上、負=後ろ／内側。
  //              a は上腕、b は前腕の角度（省略時は a）、r は長さの倍率。
  //   {at:'chest'|'belly'|'mouth'|'eye'|'brow'|'cheek'|'hip'|'lap'|'fwd'|'low'|'head'|'shoulder'|'lute'|'luteneck', dx, dy}
  //              … 体の目印の位置へ手を置く（dx は外側／前が正）。late:true で頭より手前に描く。
  //   {to:'tool', k} … T の手に持った道具の柄の上、k ピクセル先を握る（両手持ち）。
  const resolveArms = (q, G) => {
    const { F, S, B, tT, armBot } = G;
    const len = Math.max(1, armBot - tT), up = Math.ceil(len / 2);
    const ax = sx0 + Math.floor(sw / 2) - 1;
    const res = {};
    const tools = q.tools ? (Array.isArray(q.tools) ? q.tools : [q.tools]) : [];
    const tT0 = tools.find((x) => (x.h || 'T') === 'T');
    for (const w of ['T', 'O']) {
      const isT = w === 'T';
      const sh = S ? [isT ? ax : ax + 1, tT + 1] : (F === isT) ? [G.armR, tT + 1] : [G.armL, tT + 1];
      const sg = S ? -1 : (F === isT) ? 1 : -1;
      const cx = S ? sx0 - 1 : (F === isT) ? 8 : 7;
      const spec = q[w];
      let hand, el = null, def = false, skip = false;
      const anchor = (name) => {
        switch (name) {
          case 'chest': return [cx, G.nk + 2];
          case 'belly': return [cx, G.torsoBot - 1];
          case 'lap': return S ? [sx0 - 2, G.torsoBot] : [cx, G.torsoBot + 1];
          case 'mouth': return S ? [4, G.mouthY] : [cx, G.mouthY + 1];
          case 'cheek': return S ? [7, G.mouthY] : [F === isT ? 10 : 5, G.mouthY];
          case 'eye': return S ? [5, G.eyY] : [F === isT ? 9 : 6, G.eyY];
          case 'brow': return S ? [4, G.eyY - 1] : [F === isT ? 9 : 6, G.eyY - 1];
          case 'head': return S ? [7, G.t - 1] : [F === isT ? 10 : 5, G.t - 1];
          case 'shoulder': return S ? [7, G.tT - 1] : [F === isT ? 11 : 4, G.tT - 1];
          case 'hip': return S ? [sx1 + 1, G.torsoBot] : [F === isT ? bx1 : bx0, G.torsoBot];
          case 'fwd': return S ? [sx0 - 3, G.nk + 3] : [cx, G.nk + 3];
          case 'low': return S ? [sx0 - 3, FEET - 3] : [cx + sg, FEET - 3];
          case 'lute': return S ? [sx0 - 1, G.torsoBot - 2] : F ? [bx0 + 3, G.torsoBot - 2] : [bx1 - 3, G.torsoBot - 2];
          case 'luteneck': return S ? [sx0 - 4, G.nk] : F ? [bx1 + 1, G.nk] : [bx0 - 1, G.nk];
          default: return [cx, G.nk + 2];
        }
      };
      if (spec == null) {
        def = true; hand = [sh[0], armBot + 1];
        if (S && !isT) skip = true;
        if (G.lift && !S) { const side = sh[0] === G.armL ? 'L' : 'R'; if (G.lift === side) hand[0] += side === 'L' ? 1 : -1; }
        if (S && isT) hand[0] += G.fr === 0 ? 1 : G.fr === 2 ? -1 : 0;
      } else if (spec.a != null) {
        const r = spec.r ?? 1, a = spec.a * D2R, b = (spec.b ?? spec.a) * D2R;
        el = [sh[0] + Math.sin(a) * sg * up * r, sh[1] + Math.cos(a) * up * r];
        hand = [el[0] + Math.sin(b) * sg * (len - up) * r, el[1] + Math.cos(b) * (len - up) * r];
      } else if (spec.at) {
        const p0 = anchor(spec.at); hand = [p0[0] + (spec.dx || 0) * sg, p0[1] + (spec.dy || 0)];
      } else if (spec.to != null && res.T && tT0) {
        const a = tT0.a * D2R, k = spec.k ?? -2;
        hand = [res.T.hand[0] + Math.sin(a) * res.T.sg * k, res.T.hand[1] + Math.cos(a) * k];
      } else { def = true; hand = [sh[0], armBot + 1]; if (S && !isT) skip = true; }
      hand = [Math.round(hand[0]), Math.round(hand[1])];
      if (!el) {
        const mx = (sh[0] + hand[0]) / 2, my = (sh[1] + hand[1]) / 2, dist = Math.hypot(hand[0] - sh[0], hand[1] - sh[1]);
        const bend = Math.max(0, Math.min(2, (len - dist) / 2));
        el = S ? [mx + bend, my + bend * 0.7] : [mx + sg * bend, my + bend * 0.6];
      }
      el = [Math.round(el[0]), Math.round(el[1])];
      const behind = !def && ((S && !isT) || (B && (spec.at || spec.to != null || spec.behind || spec.a < 0 || (spec.b ?? 0) < 0)) || (F && spec.behind));
      res[w] = { sh, el, hand, def, skip, behind: !!behind, late: !!spec?.late, sg };
    }
    return res;
  };
  const drawArm = (P, A, G, dark) => {
    let sc = G.sleeveC, hc = G.handC;
    if (dark) { sc = dk(sc, 0.12); hc = dk(hc, 0.12); }
    const pts = linePts(A.sh, A.el).concat(linePts(A.el, A.hand).slice(1));
    for (let i = 0; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const st = stripes && (G.S ? (y & 1) === 1 : ((y - G.tT - 1) & 1) === 0);
      P.px(x, y, st ? stripes[0] : sc);
    }
    P.px(A.hand[0], A.hand[1], hc);
    if (outfit === 'knight' && !dark) { if (G.S) P.rect(A.sh[0], G.tT, 2, 2, STEEL_L); else P.rect(A.sh[0], G.tT, 1, 2, A.sh[0] === G.armL ? STEEL_L : '#dfe3ea'); }
    if (overlay === 'leather' && G.F) P.px(A.sh[0], G.tT + 1, '#b8bcc6');
  };
  // 表情 face：{e:'c'(目を閉じる), m:'o'(口を開ける)|'O'(大きく)|'s'(笑う)|'f'(への字), tear:1|2, blush:true}
  const faceFx = (P, fc, G, eyY, mouthY) => {
    if (!fc || G.B || helmet === 'closed') return;
    const shut = dk(skin, 0.3), red = '#8a3434', tearC = '#8ad8ff';
    if (G.F) {
      if (fc.blush) { P.px(5, eyY + 1, mix(skin, '#e06060', 0.45)); P.px(10, eyY + 1, mix(skin, '#e06060', 0.45)); }
      if (fc.e === 'c') { P.px(6, eyY, shut); P.px(9, eyY, shut); if (!(f && !kid)) { P.px(5, eyY, dk(skin, 0.12)); P.px(10, eyY, dk(skin, 0.12)); } }
      if (!mask) {
        if (fc.m === 'o') P.rect(7, mouthY, 2, 1, red);
        if (fc.m === 'O') { P.rect(7, mouthY, 2, 1, '#5a1a1a'); P.px(6, mouthY, dk(skin, 0.2)); P.px(9, mouthY, dk(skin, 0.2)); }
        if (fc.m === 's') { P.rect(7, mouthY, 2, 1, dk(skin, 0.28)); P.px(6, mouthY - 1, dk(skin, 0.2)); P.px(9, mouthY - 1, dk(skin, 0.2)); }
        if (fc.m === 'f') P.rect(6, mouthY, 4, 1, dk(skin, 0.3));
      }
      if (fc.tear) { P.px(6, eyY + 1, tearC); P.px(9, eyY + 1, tearC); if (fc.tear > 1) { P.px(6, eyY + 2, tearC); P.px(9, eyY + 2, tearC); } }
    } else {
      if (fc.blush) P.px(7, eyY + 1, mix(skin, '#e06060', 0.45));
      if (fc.e === 'c') P.px(6, eyY, shut);
      if (!mask) {
        if (fc.m === 'o' || fc.m === 'O') { P.px(5, mouthY, fc.m === 'O' ? '#5a1a1a' : red); if (fc.m === 'O') P.px(4, mouthY, dk(skin, 0.2)); }
        if (fc.m === 's') { P.px(5, mouthY, dk(skin, 0.28)); P.px(6, mouthY - 1, dk(skin, 0.2)); }
        if (fc.m === 'f') P.rect(4, mouthY, 2, 1, dk(skin, 0.3));
      }
      if (fc.tear) { P.px(6, eyY + 1, tearC); if (fc.tear > 1) P.px(7, eyY + 2, tearC); }
    }
  };
  // 小道具（地面に置く物）。横向きは体の前、正面は体の前（足元を隠す）、背中は体の後ろ（ほぼ隠れる）
  const drawProp = (P, kind, G, ph) => {
    const S = G.S;
    if (AX.PROPS[kind]) { AX.PROPS[kind](P, G, ph, { S, sx0, sx1, bx0, bx1, FEET }); return; } // 機・露店の台・献金箱など（anim_acts.js）
    const x0 = S ? sx0 - 8 : 3; // 左端
    const W = S ? 6 : 10;
    const wd = '#8a6a4a', wdD = '#6a4a2a', wdL = '#b08a5a';
    switch (kind) {
      case 'anvil': {
        const ax0 = S ? sx0 - 7 : 5, aw = S ? 5 : 6, y = FEET - 3;
        P.rect(ax0, y, aw, 1, '#6a6a74'); P.px(S ? ax0 - 1 : ax0 - 1, y, '#5a5a62'); P.rect(ax0 + 1, y + 1, aw - 2, 1, '#3a3a42'); P.rect(ax0, y + 2, aw, 2, '#4a4a52');
        P.rect(ax0 + 1, y, 2, 1, '#8a8a94');
        P.rect(ax0 + 1, y - 1, 2, 1, ph ? '#ffd060' : '#ff8030'); // 赤く焼けた鉄
        break;
      }
      case 'log': case 'block': {
        const bx = S ? sx0 - 7 : 5, bw = S ? 5 : 6, y = FEET - 2;
        P.rect(bx, y, bw, 3, wd); P.rect(bx, y, bw, 1, kind === 'block' ? '#c09070' : '#d0a870'); P.rect(bx + 1, y + 1, 1, 2, wdD);
        if (kind === 'block') P.rect(bx + 1, y - 1, 3, 1, '#c04a4a');
        else if (ph) P.rect(bx + 1, y - 1, 2, 1, '#c8a070');
        break;
      }
      case 'rock': {
        const cx = S ? sx0 - 5 : 8;
        for (let y = FEET - 3; y <= FEET; y++) { const w = y === FEET - 3 ? 3 : 5; P.rect(cx - Math.floor(w / 2), y, w, 1, y === FEET - 3 ? '#9a968e' : '#7a766e'); }
        P.px(cx - 1, FEET - 2, '#b0aca4'); if (ph) P.px(cx + 1, FEET - 2, '#c8e8ff');
        break;
      }
      case 'tub': {
        const bx = S ? sx0 - 8 : 4, bw = S ? 6 : 8, y = FEET - 2;
        P.rect(bx, y, bw, 3, wd); P.rect(bx, y + 1, bw, 1, wdD); P.rect(bx + 1, y, bw - 2, 1, ph ? '#8ac8f0' : '#6ab0e0');
        if (ph) P.px(bx + 2, y - 1, '#f0f0ec');
        break;
      }
      case 'table': case 'sawhorse': {
        const y = G.torsoBot + 1;
        if (S) { P.rect(x0 - 1, y, W + 2, 1, kind === 'table' ? wdL : '#c8a070'); P.rect(x0, y + 1, 1, FEET - y, wdD); P.rect(x0 + W - 1, y + 1, 1, FEET - y, wdD); if (kind === 'table') P.rect(x0 + 1, y - 1, 3 + ph, 1, '#f4e4c4'); }
        else { P.rect(x0 - 1, y, W + 2, 1, kind === 'table' ? wdL : '#c8a070'); P.rect(x0 - 1, y + 1, W + 2, 1, wdD); P.rect(x0, y + 2, 1, FEET - y - 1, wdD); P.rect(x0 + W - 1, y + 2, 1, FEET - y - 1, wdD); if (kind === 'table') P.rect(6 - ph, y - 1, 4 + ph, 1, '#f4e4c4'); }
        break;
      }
      case 'pot': {
        const bx = S ? sx0 - 8 : 4, bw = S ? 6 : 8, y = FEET - 4;
        P.rect(bx, y, bw, 1, '#5a5a62'); P.rect(bx, y + 1, bw, 3, '#2a2a30'); P.rect(bx + 1, y + 4, bw - 2, 1, '#2a2a30'); P.rect(bx + 1, y, bw - 2, 1, ph ? '#c8883a' : '#b07030');
        P.px(bx + 1, y + 2, '#4a4a52');
        break;
      }
      case 'wheel': {
        const cx = S ? sx0 - 5 : 8;
        P.rect(cx - 3, FEET - 1, 7, 2, wdD); P.rect(cx - 2, FEET - 4, 5, 3, '#b0603a'); P.rect(cx - 1, FEET - 5, 3, 1, '#c87a4a'); P.px(cx - 1 + ph, FEET - 3, '#d89a6a');
        break;
      }
      case 'easel': {
        if (S) { const ex = sx0 - 7; P.rect(ex, G.nk - 1, 4, 6, '#f4f0e0'); P.px(ex + 1, G.nk + 1, '#d04040'); P.px(ex + 2, G.nk + 2 + ph, '#3050c0'); P.line(ex + 1, G.nk + 5, ex, FEET, wdD); P.line(ex + 2, G.nk + 5, ex + 3, FEET, wdD); }
        else { const ex = G.F ? 1 : 14; P.rect(ex, G.nk - 1, 1, 7, '#e8e0d0'); P.rect(ex, G.nk + 6, 1, FEET - G.nk - 6 + 1, wdD); P.px(ex + (G.F ? -1 : 1), FEET, wdD); }
        break;
      }
      default: constructProp(P, kind, G, ph, sx0, FEET);   // 梁の材・杭・積みかけの石垣（constructanim.js）
    }
  };
  // 道具を手から角度 a の向きに描く。戻り値は先端の位置
  // 手に持つ小物（向きのない物）は手の位置に置く。
  const drawTool = (P, tl, hand, sg, G, hands) => {
    const k = tl.k;
    const [hx, hy] = hand;
    const obj = OBJ[k];
    if (obj) { obj(P, hx, hy, tl, G, hands, { accent, orb, skin }); return [hx, hy]; }
    if (k === 'bow') return drawBow(P, tl, hand, sg, hands);
    const T = TOOL[k]; if (!T) return null;
    const sc = (tl.s ?? 1) * (kid ? 0.72 : 1);
    const a = tl.a * D2R, d = [Math.sin(a) * sg, Math.cos(a)];
    const ae = (tl.a - 90) * D2R, e = [Math.sin(ae) * sg, Math.cos(ae)]; // 刃の向き（振り下ろす側）
    const len = Math.max(2, Math.round(T.len * sc)), back = Math.round((T.back || 0) * sc);
    const at = (j, w = 0) => [Math.round(hx + d[0] * j + e[0] * w), Math.round(hy + d[1] * j + e[1] * w)];
    const E = at(len);
    const put = (p, c) => P.px(p[0], p[1], c);
    const wood = '#7a5230', steel = '#dce0e8', steelD = '#9aa0aa';
    if (T.blade) {
      const bc = tl.c || T.blade;
      put(at(-1), '#5a3a22');
      for (let j = 1; j <= len; j++) { put(at(j), j === len ? lt(bc, 0.12) : bc); if (T.wide) put(at(j, -1), dk(bc, 0.12)); }
      put(at(1, 1), T.guard); put(at(1, -1 - (T.wide ? 1 : 0)), T.guard);
      return E;
    }
    for (let j = -back; j <= len; j++) put(at(j), T.shaft || wood);
    if (AX.HEADS[T.head]) return AX.HEADS[T.head](put, at, len, E, T); // 鎌・突き棒・じょうろ・紡錘（anim_acts.js）
    switch (T.head) {
      case 'tip': put(E, steel); put(at(len + 1), lt(steel, 0.08)); put(at(len - 1, 1), steelD); put(at(len - 1, -1), steelD); return at(len + 1);
      case 'fork': for (let w = -1; w <= 1; w++) put(at(len, w), steel); for (const w of [-1, 1]) { put(at(len + 1, w), steel); put(at(len + 2, w), steel); } return at(len + 2);
      case 'axe': for (let j = 0; j < T.size; j++) for (let w = 1; w <= T.size; w++) put(at(len - j, w), w === T.size ? lt(steel, 0.06) : steel); put(at(len, -1), steelD); return E;
      case 'hammer': for (let j = 0; j <= 1; j++) for (let w = -1; w <= 1; w++) put(at(len - j, w), j ? '#4a4a52' : '#6a6a74'); return E;
      case 'mallet': for (let w = -1; w <= 1; w++) put(at(len, w), '#a07a4a'); return E;
      case 'pick': for (let w = -2; w <= 2; w++) put(at(len - (Math.abs(w) === 2 ? 1 : 0), w), Math.abs(w) === 2 ? steel : steelD); return E;
      case 'hoe': put(at(len, 1), steel); put(at(len, 2), steel); put(at(len - 1, 2), steelD); return at(len, 2);
      case 'shovel': for (let j = 0; j <= 2; j++) for (let w = -1; w <= 1; w++) put(at(len + j, w), j === 2 ? steelD : '#b0b4bc'); return at(len + 2);
      case 'broom': for (let j = 0; j <= 2; j++) for (let w = -1 - (j === 2 ? 1 : 0); w <= 1 + (j === 2 ? 1 : 0); w++) put(at(len + j, w), (j + w) & 1 ? '#b89840' : '#d8b860'); return at(len + 2);
      case 'crook': put(at(len + 1), wood); put(at(len + 1, 1), wood); put(at(len, 2), wood); put(at(len - 1, 2), wood); return at(len + 1);
      case 'orb': { const c = orb; put(E, c); put(at(len + 1), c); put(at(len, 1), c); put(at(len + 1, 1), '#ffffff'); return at(len + 1); }
      case 'holy': put(E, GOLD); put(at(len + 1), GOLD); put(at(len + 2), '#fff4c0'); put(at(len + 1, 1), GOLD); put(at(len + 1, -1), GOLD); return at(len + 2);
      case 'knob': put(E, dk(wood, 0.1)); put(at(len + 1), dk(wood, 0.1)); return E;
      case 'ball': for (let j = -1; j <= 1; j++) for (let w = -1; w <= 1; w++) put(at(len + j, w), '#a8acb4'); put(at(len + 2), '#c8ccd4'); put(at(len, 2), '#c8ccd4'); put(at(len, -2), '#c8ccd4'); return at(len + 2);
      case 'club': put(E, '#5a3a22'); put(at(len, 1), '#5a3a22'); put(at(len - 1, 1), '#5a3a22'); put(at(len + 1), '#5a3a22'); return at(len + 1);
      case 'cup': put(at(len, 0), '#b8bcc4'); put(at(len, 1), '#b8bcc4'); put(at(len + 1, 0), '#9aa0aa'); put(at(len + 1, 1), '#9aa0aa'); return E;
      case 'paddle': for (let j = 0; j <= 2; j++) { put(at(len + j), '#b08a5a'); put(at(len + j, 1), '#a07a4a'); } return at(len + 2);
      case 'cleaver': for (let j = 1; j <= 3; j++) for (let w = 0; w <= 2; w++) put(at(j, w), w === 2 ? '#f0f2f6' : steel); return at(3);
      case 'saw': for (let j = 1; j <= len; j++) { put(at(j), '#c8ccd4'); if (j & 1) put(at(j, 1), '#8a8e96'); } put(at(0), wood); return E;
      case 'rod': put(E, '#c8b890'); return E;
      case 'paint': put(E, pickBy(['#d03030', '#3050c0', '#e0c030'], rp[9])); return E;
      case 'quill': put(E, '#f4f4f0'); put(at(len - 1, 1), '#e8e8e0'); return E;
      case 'scepter': put(E, '#d0303a'); put(at(len + 1), GOLD); return at(len + 1);
      case 'glass': put(E, '#c8d8f0'); return E;
      default: return E;
    }
  };
  const drawBow = (P, tl, hand, sg, hands) => {
    const a = tl.a * D2R, d = [Math.sin(a) * sg, Math.cos(a)], pp = [-d[1], d[0]];
    const L = kid ? 3 : 4, wood = '#7a5230';
    const pt = (k) => [Math.round(hand[0] + pp[0] * k - d[0] * ((k / L) ** 2) * 2), Math.round(hand[1] + pp[1] * k - d[1] * ((k / L) ** 2) * 2)];
    for (let k = -L; k <= L; k++) { const p = pt(k); P.px(p[0], p[1], Math.abs(k) === L ? dk(wood, 0.15) : wood); }
    const t1 = pt(-L), t2 = pt(L);
    const drawTo = tl.str ? hands[tl.str].hand : null;
    const sc = '#e8e8e0';
    if (drawTo) { P.line(t1[0], t1[1], drawTo[0], drawTo[1], sc); P.line(t2[0], t2[1], drawTo[0], drawTo[1], sc); }
    else P.line(t1[0], t1[1], t2[0], t2[1], sc);
    if (tl.arrow && drawTo) {
      const tip = [Math.round(hand[0] + d[0] * 3), Math.round(hand[1] + d[1] * 3)];
      P.line(drawTo[0], drawTo[1], tip[0], tip[1], '#c8a878'); P.px(tip[0] + Math.round(d[0]), tip[1] + Math.round(d[1]), '#dce0e8');
      return tip;
    }
    return [Math.round(hand[0] + d[0] * 2), Math.round(hand[1] + d[1] * 2)];
  };

  // ---------------------------------------------------------------- 1コマを描く
  // view：'F'(正面) 'S'(横・左向き) 'B'(背中)。q：姿勢（POSE の説明は下の「姿勢」の節）。
  // 戻り値：生座標の Pix（輪郭前）と、手の位置・効果（fx）の一覧。
  const frame = (view, q = {}) => {
    const P = new Pix(CW, CH); P.ox = OX; P.oy = OY - (q.jump || 0);
    const F = view === 'F', B = view === 'B', S = view === 'S';
    const mode = q.legs || 'stand';
    const fr = mode === 'w0' ? 0 : mode === 'w2' ? 2 : 1;
    const step = fr !== 1;
    const bob = step && stage !== 'baby' && legH > 2 ? 1 : 0; // 踏み出しのコマは頭が1px沈む（足元は動かさない）
    const lowOf = { kneel: Math.floor(legH / 2), kneel2: Math.ceil(legH / 2), squat: Math.ceil(legH / 2), sit: legH - 2 }[mode] || 0;
    const sink = Math.max(-1, Math.min(legH - 1, bob + lowOf + (q.dy || 0)));
    const legTop = FEET - legH + 1 + sink;
    const tT = legTop - torsoH;
    const headDy = q.headDy ?? ((q.lean || 0) > 0 && !S ? 1 : 0);
    const t = tT - headH + (stage === 'elder' ? 1 : 0) + headDy;
    const torsoBot = legTop - 1;
    const nk = tT;
    const armL = bx0 - 1, armR = bx1 + 1;
    const armBot = Math.min(tT + torsoH - 1 + (kid ? 0 : 1), FEET - 2 + Math.max(0, sink - bob)) - 1;
    // 正面の「左足前」は画面右の脚が前に出る＝画面左の脚を上げる。背中は逆
    const lift = !step || S ? null : ((fr === 0) === F ? 'L' : 'R');
    const X = (x) => (B ? 15 - x : x);
    const hid = helmet === 'closed' || hood;
    const tx0 = S ? sx0 : bx0, tx1 = S ? sx1 : bx1;
    const eyY0 = t + (stage === 'baby' ? 2 : 3), mouthY0 = Math.min(t + headH - 1, eyY0 + 2);
    const G = { F, S, B, t, tT, nk, legTop, torsoBot, armBot, armL, armR, eyY: eyY0, mouthY: mouthY0, lift, fr };
    const defArms = q.T === undefined && q.O === undefined;
    const hands = resolveArms(q, G);

    // ---------------- 後ろの層
    if (capeC && !B) {
      if (S) { for (let y = tT + 1; y <= FEET - 2; y++) P.rect(sx1 + 1, y, 2 + (y > FEET - 6 ? 1 : 0), 1, capeC); }
      else P.rect(Math.max(1, armL - 1), tT + 1, armR - armL + 3, FEET - 1 - (outfit === 'king' ? 0 : 2) - (tT + 1), capeC);
    }
    const longBack = !hid && ['long', 'wavy', 'braid'].includes(hs) && !['turban', 'veil'].includes(hat) && stage !== 'baby';
    if (longBack && F) P.rect(4, t + 2, 8, kid ? 6 : 8, dk(hair, 0.06));
    if (shield && S) P.rect(sx1, nk + 2, 2, 4, dk(shield, 0.2));
    if (B && q.prop) drawProp(P, q.prop, G, q.ph || 0);
    const sleeveC = sleeve === 'bare' ? skin : outfit === 'knight' ? '#b8bcc6' : (capeC && B ? capeC : top);
    const handC = outfit === 'knight' ? STEEL_D : (handWrap || skin);
    G.sleeveC = sleeveC; G.handC = handC;
    if (!defArms) for (const w of ['T', 'O']) { const A = hands[w]; if (A.behind && !A.late && !A.skip) drawArm(P, A, G, S); }

    // ---------------- 脚
    let legC = bottom || stripes?.[1] || pants;
    const footC = barefoot ? dk(skin, 0.05) : outfit === 'knight' ? STEEL_D : shoe;
    const walkLegs = mode === 'stand' || mode === 'w0' || mode === 'w2';
    const vleg = (x, y0, lh, c) => {
      P.rect(x, y0, 2, lh, c);
      if (stripes && !bottom) for (let y = y0; y < y0 + lh; y++) if ((y & 1) === 0) P.rect(x, y, 2, 1, stripes[0]);
      if (outfit === 'knight' && lh > 2) { P.rect(x, y0 + 1, 2, lh - 1, '#b8bcc6'); P.px(x, y0 + 2, STEEL_L); }
    };
    if (!S) {
      const tSide = F ? 'R' : 'L'; // 道具を持つ側（正面では画面右、背中では画面左）
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? 5 : 9, out = side === 'L' ? -1 : 1;
        if (walkLegs) {
          const up = lift === side ? 1 : 0;
          const lh = FEET - legTop + 1 - up;
          vleg(x, legTop, lh, legC);
          P.rect(side === 'L' ? 4 : 9, FEET - up, 3, 1, footC);
        } else if (mode === 'wide' || mode === 'squat') {
          const lh = FEET - legTop + 1, half = legTop + Math.floor(lh / 2);
          for (let y = legTop; y <= FEET; y++) {
            const off = mode === 'wide' ? (y >= half ? 1 : 0) : (y < half + 1 ? 1 : 0);
            P.rect(x + off * out, y, 2, 1, legC);
            if (stripes && !bottom && (y & 1) === 0) P.rect(x + off * out, y, 2, 1, stripes[0]);
          }
          const fo = mode === 'wide' ? 1 : 0;
          P.rect((side === 'L' ? 4 : 9) + fo * out, FEET, 3, 1, footC);
        } else { // kneel / kneel2 / sit
          const lh = FEET - legTop + 1;
          vleg(x, legTop, lh, legC);
          const kneeDown = mode === 'kneel2' || (mode === 'kneel' && side !== tSide);
          if (kneeDown) P.rect(x, FEET, 2, 1, dk(legC, 0.15));
          else P.rect(side === 'L' ? 4 : 9, FEET, 3, 1, footC);
        }
      }
    } else {
      if (!walkLegs && long) legC = dk(long, 0.04);
      const cd = dk(legC, 0.12), fcd = dk(footC, 0.1);
      const lh = legH - sink, h = FEET - legTop + 1;
      const leg = (off, c, fc, amp = Math.min(2, legH / 2.5)) => {
        for (let r = 0; r < lh; r++) { const o = Math.round(off * amp * (r + 1) / lh); P.rect(7 + o, legTop + r, 2, 1, c); }
        P.rect(6 + Math.round(off * amp), FEET, 3, 1, fc);
      };
      const th = Math.max(1, Math.floor(legH / 2));
      if (walkLegs) {
        // 横向き：手前の脚（左脚）はコマ0で前へ、コマ2で後ろへ
        const s = fr === 0 ? -1 : fr === 2 ? 1 : 0;
        leg(-s, cd, fcd); leg(s, legC, footC);
      } else if (mode === 'wide') {
        const amp = Math.min(3, legH / 2);
        leg(1, cd, fcd, amp); leg(-1, legC, footC, amp);
      } else if (mode === 'kneel') {
        P.rect(7, legTop, 2, h, cd); P.rect(8, FEET, th + 1, 1, cd); P.rect(9 + th, FEET - 1, 1, 2, fcd); // 奥：膝をつく
        P.rect(7 - th, legTop, th + 2, 2, legC); P.rect(7 - th, legTop, 2, h, legC); P.rect(6 - th, FEET, 3, 1, footC); // 手前：膝を立てる
      } else if (mode === 'kneel2') {
        P.rect(8, legTop, 2, h, cd); P.rect(9, FEET, th + 1, 1, cd); P.rect(10 + th, FEET - 1, 1, 2, fcd);
        P.rect(7, legTop, 2, h, legC); P.rect(8, FEET, th + 1, 1, legC); P.rect(9 + th, FEET - 1, 1, 2, footC);
      } else if (mode === 'squat') {
        P.rect(9 - th, legTop - 1, th + 2, 2, cd); P.rect(9 - th, legTop, 2, h, cd); P.rect(8 - th, FEET, 3, 1, fcd);
        P.rect(7 - th, legTop - 1, th + 2, 2, legC); P.rect(7 - th, legTop, 2, h, legC); P.rect(6 - th, FEET, 3, 1, footC);
      } else if (mode === 'sit') {
        const L = Math.max(2, legH - 1);
        P.rect(9 - L, FEET - 2, L, 2, cd); P.rect(8 - L, FEET - 4, 1, 3, fcd);
        P.rect(7 - L, FEET - 1, L + 2, 2, legC); P.rect(6 - L, FEET - 3, 1, 3, footC);
      }
    }
    if (skirt && !long) {
      const sl = Math.min(FEET - legTop + 1, Math.max(2, legH - (kid ? 1 : 2)));
      for (let y = 0; y < sl; y++) {
        const wide = y >= sl - 2 ? 1 : 0;
        if (S) P.rect(sx0 - wide, legTop + y, sw + wide * 2, 1, skirtC);
        else P.rect(bx0 - wide, legTop + y, tw + wide * 2, 1, skirtC);
      }
    }

    // ---------------- 胴
    if (long) {
      for (let y = tT; y <= FEET - 1; y++) {
        const w = y > torsoBot ? (stage === 'baby' ? 0 : 1) : 0;
        if (S) P.rect(sx0 - w, y, sw + w * 2, 1, long); else P.rect(bx0 - w, y, tw + w * 2, 1, long);
      }
    }
    P.rect(tx0, tT, tx1 - tx0 + 1, torsoH, top);
    if (S && build === 'stout' && !long) P.rect(sx0 - 1, tT + 2, 1, torsoH - 3, top); // お腹
    if (stripes) for (let y = tT; y <= (long ? FEET - 1 : torsoBot); y += 2) P.overRect(tx0 - 1, y, tx1 - tx0 + 3, 1, stripes[0]);
    if (!long && !skirt && outfit !== 'prisoner' && outfit !== 'knight' && !kid) P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, belt);
    if (!long && kid && !skirt) P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, dk(top, 0.08));

    // ---------------- 服の飾り
    if (!overlay && !apron && !stripes && !long) {
      if (detail === 'vneck' && !B) { if (S) P.px(sx0, nk, skin); else { P.px(7, nk, skin); P.px(8, nk, skin); } }
      else if (detail === 'buttons' && !B) P.rect(S ? sx0 : 8, nk + 1, 1, torsoH - 2, lt(top, 0.14));
      else if (detail === 'vest') { if (B) P.rect(bx0, nk, tw, torsoH - 1, vestCol); else if (S) P.rect(sx0 + 1, nk, sw - 1, torsoH - 1, vestCol); else { P.rect(bx0, nk, 2, torsoH - 1, vestCol); P.rect(bx1 - 1, nk, 2, torsoH - 1, vestCol); } }
      else if (detail === 'stripeV') for (let x = tx0 + 1; x <= tx1; x += 2) P.rect(x, nk + 1, 1, torsoH - 2, lt(top, 0.1));
      else if (detail === 'sash') for (let i = 0; i < torsoH; i++) P.over(S ? sx0 + Math.floor(i * sw / torsoH) : X(bx0 + i), nk + i, accent);
      else if (detail === 'patch') P.rect(S ? sx0 + 1 + Math.floor(patchPos[0] * (sw - 2)) : X(bx0 + Math.floor(patchPos[0] * (tw - 2))) - (B ? 1 : 0), nk + 1 + Math.floor(patchPos[1] * (torsoH - 3)), 2, 2, dk(top, 0.12));
      else if (detail === 'collar') P.rect(S ? sx0 : 6, nk, S ? 3 : 4, 1, lt(top, 0.18));
    }
    if (long && !overlay && outfit !== 'elder' && !B) P.rect(S ? sx0 : 7, nk + 1, S ? 1 : 2, FEET - nk - 2, south ? accent : dk(top, 0.07));
    if (south && long) P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, accent);

    switch (overlay) {
      case 'ermine':
        P.rect(S ? sx0 - 1 : armL, nk, S ? sw + 2 : armR - armL + 1, 2, '#f4f4f0');
        if (S) P.px(sx0 + 1, nk + 1, '#1a1a1a'); else { P.px(5, nk + 1, '#1a1a1a'); P.px(8, nk, '#1a1a1a'); P.px(11, nk + 1, '#1a1a1a'); }
        if (F) P.rect(7, nk + 2, 2, FEET - nk - 3, GOLD);
        if (S) P.rect(sx0, nk + 2, 1, FEET - nk - 3, GOLD);
        break;
      case 'goldtrim': P.rect(tx0, nk, tx1 - tx0 + 1, 1, GOLD); if (F) { P.rect(7, nk + 2, 2, 1, GOLD); P.rect(7, nk + 3, 2, 1, '#d0303a'); } if (S) P.px(sx0, nk + 2, GOLD); break;
      case 'ruff': P.rect(S ? sx0 - 1 : 4, nk, S ? sw + 1 : 8, 1, '#f4f4f0'); if (F) P.rect(7, nk + 2, 1, torsoH - 3, GOLD); break;
      case 'goldbtn': P.rect(tx0, nk, tx1 - tx0 + 1, 1, lt(top, 0.15)); if (!B) P.rect(S ? sx0 : 7, nk + 1, 1, torsoH - 2, GOLD); break;
      case 'plate':
        P.rect(tx0, nk, tx1 - tx0 + 1, torsoH, STEEL);
        P.rect(tx0, torsoBot - 1, tx1 - tx0 + 1, 1, STEEL_D); P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, '#6a6e78'); // 胸当ての下端は水平に切る
        if (!B) P.rect(tx0 + 1, nk + 1, 2, 2, STEEL_L);
        if (tabard && !B) P.rect(S ? sx0 : 7, nk + 1, 2, torsoH - 1, accent);
        break;
      case 'leather':
        P.rect(tx0, nk, tx1 - tx0 + 1, 2, dk(top, 0.08));
        for (let i = 0; i < torsoH - 1; i++) P.over(S ? sx0 + Math.floor(i * sw / torsoH) : X(bx1 - i), nk + i, '#3a2616');
        break;
      case 'chain': for (let y = nk; y < torsoBot; y++) for (let x = tx0; x <= tx1; x++) if ((x + y) & 1) P.px(x, y, '#6a6e76');
        if (S) P.rect(sx0, nk + 1, 2, torsoH - 1, accent); else P.rect(6, nk + 1, 4, torsoH - 1, accent);
        break;
      case 'keys': { const kx = S ? sx0 + 2 : X(armL + 1) - (B ? 1 : 0); P.rect(kx, torsoBot + 1, 2, 1, GOLD); P.px(kx, torsoBot + 2, '#c9a23a'); P.px(kx + 1, torsoBot + 2, GOLD_D); break; }
      case 'overalls':
        if (F) { P.rect(bx0 + 1, nk + 3, tw - 2, torsoH - 3, bottom); P.rect(bx0 + 1, nk, 1, 3, bottom); P.rect(bx1 - 1, nk, 1, 3, bottom); P.px(bx0 + 1, nk + 3, GOLD); P.px(bx1 - 1, nk + 3, GOLD); }
        if (B) { for (let i = 0; i < torsoH - 1; i++) { P.px(bx0 + 1 + Math.floor(i * (tw - 3) / (torsoH - 2)), nk + i, bottom); P.px(bx1 - 1 - Math.floor(i * (tw - 3) / (torsoH - 2)), nk + i, bottom); } P.rect(bx0, torsoBot - 1, tw, 2, bottom); }
        if (S) { P.rect(sx0, nk + 3, sw, torsoH - 3, bottom); P.rect(sx0 + 2, nk, 1, 3, bottom); }
        break;
      case 'vestopen': { const vc = rich('#6a4a2a'); if (B) P.rect(bx0, nk, tw, torsoH - 1, vc); else if (S) P.rect(sx0 + 1, nk, sw - 1, torsoH - 1, vc); else { P.rect(bx0, nk, 2, torsoH - 1, vc); P.rect(bx1 - 1, nk, 2, torsoH - 1, vc); } break; }
      case 'quiver':
        if (!S) for (let i = 0; i < torsoH; i++) P.over(X(bx0 + i), nk + i, '#5a3a22');
        if (F) { P.rect(bx1, t + 3, 2, 3, '#6a4a2a'); P.rect(bx1, t + 1, 2, 2, '#f0f0f0'); }
        if (B) { for (let i = 0; i < 6; i++) P.rect(X(bx1 - 1) - 1 + Math.floor(i / 2), nk - 2 + i, 2, 1, '#6a4a2a'); P.rect(X(bx1 - 1) - 1, nk - 4, 2, 2, '#f0f0f0'); P.px(X(bx1 - 1), nk - 4, '#c03a3a'); }
        if (S) { P.rect(sx1 + 1, nk - 2, 2, 6, '#6a4a2a'); P.rect(sx1 + 1, nk - 4, 2, 2, '#f0f0f0'); }
        break;
      case 'plaid': for (let y = nk; y <= torsoBot; y++) for (let x = tx0 - 1; x <= tx1 + 1; x++) if (x % 3 === 0 || y % 3 === 0) P.over(x, y, dk(top, 0.2)); break;
      case 'vest': if (B) P.rect(bx0, nk, tw, torsoH - 1, vestCol); else if (S) P.rect(sx0 + 1, nk, sw - 1, torsoH - 1, vestCol); else { P.rect(bx0, nk, tw, torsoH - 1, vestCol); P.rect(7, nk, 2, torsoH - 1, lt(top, 0.1)); P.rect(7, nk + 2, 1, 2, GOLD); } break;
      case 'tape': if (F) { P.rect(bx0 + 1, nk, 1, torsoH - 1, '#e8d040'); P.rect(bx1 - 1, nk, 1, torsoH - 1, '#e8d040'); } else if (S) P.rect(sx0 + 1, nk, 1, torsoH - 1, '#e8d040'); else P.rect(bx0, nk, tw, 1, '#e8d040'); break;
      case 'butler':
        if (F) { P.rect(bx0, nk, 3, torsoH, '#2a2a30'); P.rect(bx1 - 2, nk, 3, torsoH, '#2a2a30'); P.rect(7, nk, 2, 1, '#b03030'); }
        else if (B) { P.rect(bx0, nk, tw, torsoH, '#2a2a30'); P.rect(6, torsoBot + 1, 1, 2, '#2a2a30'); P.rect(9, torsoBot + 1, 1, 2, '#2a2a30'); }
        else { P.rect(sx0 + 1, nk, sw - 1, torsoH, '#2a2a30'); P.rect(sx1, torsoBot + 1, 1, 2, '#2a2a30'); }
        break;
      case 'stole': if (F) { P.rect(6, nk, 1, FEET - nk - 1, '#c9a23a'); P.rect(9, nk, 1, FEET - nk - 1, '#c9a23a'); P.rect(7, nk + 1, 2, 3, GOLD); P.rect(7, nk + 2, 2, 1, '#f4f2ea'); } if (S) P.rect(sx0, nk, 1, FEET - nk - 1, '#c9a23a'); if (B) P.rect(5, nk, 6, 1, '#c9a23a'); break;
      case 'stars': for (let i = 0; i < 3; i++) { const x = (S ? sx0 : bx0) + Math.floor(rp[4 + i] * ((S ? sw : tw) - 1)), y = nk + 1 + Math.floor(rp[7 + i] * (FEET - nk - 3)); const xx = B ? 14 - x : x; P.px(xx, y, '#f0e070'); P.px(xx + 1, y, '#c8b040'); } break;
      case 'bag':
        if (F) { for (let i = 0; i < torsoH; i++) P.over(bx0 + i, nk + i, '#5a3a22'); P.rect(bx1 - 1, torsoBot - 1, 3, 3, '#8a6a3a'); }
        if (B) { P.rect(bx0 + 1, nk, tw - 2, 4, '#8a6a3a'); P.rect(bx0, nk + 1, tw, 2, '#7a5a2a'); P.rect(bx0 + 2, nk + 4, tw - 4, 1, '#5a3a22'); }
        if (S) { P.rect(sx1, nk, 2, 5, '#8a6a3a'); P.px(sx0 + 1, nk, '#5a3a22'); }
        break;
      case 'split': if (S) P.rect(sx0, nk, sw, torsoH, hatC); else P.rect(B ? bx0 : 8, nk, B ? 8 - bx0 : bx1 - 7, torsoH, hatC); P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, GOLD); break;
      case 'coat':
        if (F) { P.rect(6, nk, 1, 4, dk(top, 0.12)); P.rect(9, nk, 1, 4, dk(top, 0.12)); P.rect(7, nk, 2, 2, '#6a8ab0'); P.rect(bx0 + 1, torsoBot - 1, 2, 1, dk(top, 0.1)); }
        if (S) { P.rect(sx0, nk, 1, 4, dk(top, 0.12)); P.rect(sx0 + 1, nk, 1, 1, '#6a8ab0'); }
        break;
      case 'blood': case 'clay': case 'paint': case 'flour': {
        const cs = overlay === 'blood' ? ['#a02020', '#801818'] : overlay === 'clay' ? ['#8a5a3a', '#a06a4a'] : overlay === 'flour' ? ['#fbfaf4', '#f0ece0'] : ['#d03030', '#3050c0', '#e0c030'];
        for (let i = 0; i < 3; i++) { const x = tx0 + 1 + Math.floor(rp[i] * (tx1 - tx0 - 2)), y = nk + 2 + Math.floor(rp[3 + i] * (torsoH + 1)); const xx = B ? 14 - x : x; P.over(xx, y, cs[i % cs.length]); P.over(xx + 1, y, cs[i % cs.length]); }
        break;
      }
      case 'dancer':
        P.rect(tx0, nk + 3, tx1 - tx0 + 1, torsoH - 4, skin); P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, GOLD); P.rect(tx0, nk + 2, tx1 - tx0 + 1, 1, GOLD);
        if (!B) for (let x = tx0; x <= tx1; x += 2) P.px(x, torsoBot + 1, GOLD);
        break;
      case 'nunbib': if (!B) P.rect(S ? sx0 : 5, nk, S ? 3 : 6, 2, '#f4f4f4'); break;
      case 'tribal': TG.tribeBody(P, { p, age, F, S, B, t, headH, tT, nk, torsoH, torsoBot, legTop, legH, FEET, bx0, bx1, tx0, tx1, sx0, sx1, sw, tw, armL, armR, skin, hair, long, hid, fr }); break;
      case 'gi': // 道着：胸元を V に開け、黒帯を締める
        if (F) { P.px(7, nk, skin); P.px(8, nk, skin); P.px(7, nk + 1, skin); P.px(8, nk + 1, dk(top, 0.12)); }
        if (S) P.px(sx0, nk, skin);
        P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, '#1a1a1e');
        if (F) { P.px(bx1 - 1, torsoBot + 1, '#1a1a1e'); P.px(bx1 - 2, torsoBot + 2, '#1a1a1e'); }
        if (S) P.px(sx1 + 1, torsoBot + 1, '#1a1a1e');
        break;
      case 'squire': // 鎖かたびらに、紋章色の前垂れ
        for (let y = nk; y < torsoBot; y++) for (let x = tx0; x <= tx1; x++) if ((x + y) & 1) P.px(x, y, '#6a6e76');
        if (!B) P.rect(S ? sx0 : 6, nk + 1, S ? 2 : 4, torsoH, accent);
        if (F) P.rect(7, nk + 2, 2, 2, lt(accent, 0.25));
        break;
      case 'thiefbelt': // 腰の道具袋と鍵束（鍵開け・罠外し）
        P.rect(tx0, torsoBot, tx1 - tx0 + 1, 1, '#4a3222');
        if (F) { P.rect(bx0, torsoBot, 2, 2, '#7a5230'); P.px(bx1 - 1, torsoBot + 1, GOLD); P.px(bx1, torsoBot + 1, '#c8ccd4'); }
        if (S) { P.rect(sx1, torsoBot, 2, 2, '#7a5230'); P.px(sx0, torsoBot + 1, GOLD); }
        if (B) P.rect(bx1 - 1, torsoBot, 2, 2, '#7a5230');
        P.rect(S ? sx0 : bx0, nk, S ? sw : tw, 1, dk(top, 0.1));
        break;
      case 'sorcerer': // 学者のローブ：金の縁取りと、胸の青く光る紋
        P.rect(tx0 - 1, FEET - 2, tx1 - tx0 + 3, 1, GOLD);
        if (!B) P.rect(S ? sx0 : 7, nk + 1, S ? 1 : 2, FEET - nk - 3, dk(top, 0.12));
        if (F) { P.rect(6, nk, 4, 1, GOLD); P.px(7, nk + 2, '#70e8ff'); P.px(8, nk + 2, '#70e8ff'); }
        if (S) P.px(sx0, nk + 2, '#70e8ff');
        if (B) P.rect(bx0, nk, tw, 1, GOLD);
        break;
      case 'fur': P.rect(S ? sx0 - 1 : armL, nk, S ? sw + 3 : armR - armL + 1, 2, '#8a6a4a'); P.rect(S ? sx0 : armL + 1, nk, 2, 1, '#a88a6a'); break;
      case 'rags':
        for (let i = 0; i < 3; i++) { const x = tx0 + Math.floor(rp[i] * (tx1 - tx0)), y = nk + 1 + Math.floor(rp[3 + i] * (torsoH - 1)); const xx = B ? 14 - x : x; const c = i & 1 ? dk(top, 0.14) : lt(top, 0.1); P.over(xx, y, c); P.over(xx + 1, y, c); }
        P.clr(tx0, torsoBot); P.clr(tx1 - Math.floor(rp[6] * 2), torsoBot);
        P.overRect(S ? sx0 + 1 : X(bx0 + 1 + Math.floor(rp[7] * (tw - 3))) - (B ? 1 : 0), nk + 2, 2, 2, mix(top, '#8a6a4a', 0.5));
        break;
    }
    if (apron) {
      const ab = long ? FEET - 2 : torsoBot + 2;
      if (F) { P.rect(bx0 + 1, nk + 2, tw - 2, ab - (nk + 2), apron); P.rect(bx0, torsoBot - 1, tw, 1, dk(apron, 0.1)); }
      if (S) { P.rect(sx0 - (long ? 1 : 0), nk + 2, 2, ab - (nk + 2), apron); P.rect(sx0, torsoBot - 1, sw, 1, dk(apron, 0.1)); }
      if (B) { P.rect(bx0, torsoBot - 1, tw, 1, dk(apron, 0.1)); P.rect(7, torsoBot - 2, 2, 1, apron); P.px(6, torsoBot, apron); P.px(9, torsoBot, apron); }
      if (outfit === 'carpenter' && F) P.rect(bx0 + 2, torsoBot, 2, 1, '#8a8a90');
      if (f && outfit === 'servant' && F) { P.px(bx0 + 1, nk + 1, apron); P.px(bx1 - 1, nk + 1, apron); }
    }
    if (scarf && !overlay && !helmet && !hood && !kid) {
      P.rect(S ? sx0 - 1 : 5, nk, S ? sw + 1 : 6, 1, scarf);
      if (F) P.rect(9, nk + 1, 1, 2, dk(scarf, 0.08));
      if (S) P.rect(sx1 + 1, nk, 2, 1, dk(scarf, 0.06));
    }
    if (capeC && B) { P.rect(armL - 1, tT, armR - armL + 3, FEET - 1 - (outfit === 'king' ? 0 : 2) - tT, capeC); P.rect(armL, tT, armR - armL + 1, 1, lt(capeC, 0.08)); if (overlay === 'ermine') P.rect(armL, nk, armR - armL + 1, 2, '#f4f4f0'); }
    if (shield && B) { P.rect(12, nk + 2, 3, 4, '#7a5a3a'); P.rect(13, nk + 3, 1, 2, '#5a3a22'); }

    // ---------------- 腕（16pxの腕は1px幅）
    if (!defArms) {
      for (const w of ['T', 'O']) { const A = hands[w]; if (!A.behind && !A.late && !A.skip) drawArm(P, A, G, false); }
    } else if (!S) {
      for (const side of ['L', 'R']) {
        const ax = side === 'L' ? armL : armR;
        const swing = lift === side; // 上げた脚の側の腕が前に出る：手を1px内側へ
        P.rect(ax, tT + 1, 1, armBot - tT, sleeveC);
        if (stripes) for (let y = tT + 1; y <= armBot; y += 2) P.px(ax, y, stripes[0]);
        if (outfit === 'knight') P.rect(ax, tT, 1, 2, side === 'L' ? STEEL_L : '#dfe3ea');
        if (overlay === 'leather' && !B) P.px(ax, tT + 1, '#b8bcc6');
        if (swing) { P.px(ax + (side === 'L' ? 1 : -1), armBot + 1, handC); P.px(ax, armBot + 1, sleeveC); }
        else P.px(ax, armBot + 1, handC);
      }
      if (overlay === 'shackle') { P.rect(armL + 1, armBot + 1, armR - armL - 1, 1, '#8a8a90'); P.px(armL, armBot, '#6a6a70'); P.px(armR, armBot, '#6a6a70'); }
    } else {
      const s = fr === 0 ? 1 : fr === 2 ? -1 : 0; // 手前の腕は手前の脚と逆に振る
      const ax = sx0 + Math.floor(sw / 2) - 1;
      if (s !== 0) P.px(s > 0 ? sx0 - 1 : sx1 + 1, armBot, dk(handC, 0.12)); // 奥の手
      for (let y = tT + 1; y <= armBot; y++) { const o = y > tT + 2 ? s : 0; P.px(ax + o, y, (stripes && (y & 1)) ? stripes[0] : sleeveC); }
      if (outfit === 'knight') P.rect(ax, tT, 2, 2, STEEL_L);
      P.px(ax + s, armBot + 1, handC);
      if (overlay === 'shackle') P.px(ax + s, armBot, '#8a8a90');
    }

    // ---------------- 頭（横顔でも頭の幅・高さは正面と同じ）
    P.rect(5, t, 6, headH, skin);
    const eyY = t + (stage === 'baby' ? 2 : 3);
    const mouthY = Math.min(t + headH - 1, eyY + 2);
    if (F || B) { P.px(5, t + headH - 1, dk(skin, 0.06)); P.px(10, t + headH - 1, dk(skin, 0.06)); }
    if (S) { P.clr(10, t + headH - 1); if (stage !== 'baby') P.px(4, eyY + 1, skin); if (stage === 'elder') P.px(4, eyY + 2, dk(skin, 0.04)); } // 鼻先は額より1px前
    P.shade(0.6, 0.8);
    const skinD = dk(skin, 0.14);
    if (F) {
      const eyeC = stage === 'baby' ? '#2a1e14' : eye;
      if (f && !kid) { P.px(6, eyY - 1, '#2a1e14'); P.px(9, eyY - 1, '#2a1e14'); }
      else if (!kid && brows) { P.px(6, eyY - 1, dk(hair, 0.15)); P.px(9, eyY - 1, dk(hair, 0.15)); }
      P.px(6, eyY, eyeC); P.px(9, eyY, eyeC);
      P.rect(7, mouthY, 2, 1, skinD);
      if (blush || stage === 'baby') { P.px(5, eyY + 1, mix(skin, '#e06060', 0.35)); P.px(10, eyY + 1, mix(skin, '#e06060', 0.35)); }
      if (freckles && stage !== 'baby') { P.rect(5, eyY + 1, 2, 1, dk(skin, 0.1)); P.rect(9, eyY + 1, 2, 1, dk(skin, 0.1)); }
      if (mole && !kid) P.px(mole[0], t + mole[1], dk(skin, 0.25));
      if (stage === 'elder') { P.rect(7, t + 1, 2, 1, dk(skin, 0.06)); P.px(5, eyY + 1, dk(skin, 0.08)); P.px(10, eyY + 1, dk(skin, 0.08)); }
      if (scar && !kid) {
        const sc = mix(skin, '#a03a3a', 0.45);
        if (scar === 'eyeL') { P.px(6, eyY - 1, sc); P.px(6, eyY + 1, sc); }
        else if (scar === 'eyeR') { P.px(9, eyY - 1, sc); P.px(9, eyY + 1, sc); }
        else if (scar === 'cheekL') { P.px(5, eyY + 1, sc); P.px(6, eyY + 2, sc); }
        else if (scar === 'cheekR') { P.px(10, eyY + 1, sc); P.px(9, eyY + 2, sc); }
        else { P.px(7, eyY, sc); P.px(8, eyY + 1, sc); }
      }
      if (dirt) P.rect(dirtPos[0] < 0.5 ? 5 : 9, eyY + 1, 2, 1, dk(skin, 0.2));
      if (earring && !kid) { P.px(4, eyY + 1, earring); P.px(11, eyY + 1, earring); }
    }
    if (S) {
      const eyeC = stage === 'baby' ? '#2a1e14' : eye;
      if (f && !kid) P.rect(5, eyY - 1, 2, 1, '#2a1e14');
      else if (brows && !kid && stage !== 'elder') P.px(6, eyY - 1, dk(hair, 0.15));
      P.px(6, eyY, eyeC);
      P.px(5, mouthY, skinD);
      P.rect(8, eyY, 1, 2, dk(skin, 0.1)); // 耳は奥行きの中央
      if (blush || stage === 'baby') P.px(7, eyY + 1, mix(skin, '#e06060', 0.35));
      if (freckles && stage !== 'baby') P.rect(6, eyY + 1, 2, 1, dk(skin, 0.1));
      if (mole && !kid && mole[0] >= 8) P.px(5 + Math.floor(Math.abs(mole[0] + 0.5 - 8)), t + mole[1], dk(skin, 0.25));
      if (scar && !kid && (scar === 'eyeR' || scar === 'cheekR' || scar === 'nose')) { const sc = mix(skin, '#a03a3a', 0.45); P.px(6, eyY + 1, sc); P.px(7, eyY + 2, sc); }
      if (dirt) P.rect(6, eyY + 1, 2, 1, dk(skin, 0.2));
      if (earring && !kid) P.px(8, eyY + 2, earring);
    }
    if (B) { P.px(4, eyY, skin); P.px(11, eyY, skin); if (earring && !kid) { P.px(4, eyY + 1, earring); P.px(11, eyY + 1, earring); } }

    // ---------------- 髪
    const H = (x, y, w = 1, h = 1) => P.rect(x, y, w, h, hair);
    if (!hid) {
      if (stage === 'baby' && hs !== 'bald') {
        if (F) { H(6, t - 1, 4); H(5, t, 6); P.px(8, t - 2, hair); if (f) { H(4, t + 1, 1, 2); H(11, t + 1, 1, 2); } }
        if (B) { H(6, t - 1, 4); H(5, t, 6, 2); P.px(8, t - 2, hair); }
        if (S) { H(6, t - 1, 4); H(5, t, 6); H(8, t + 1, 3, 1); P.px(8, t - 2, hair); }
      } else if (F) {
        if (hs === 'bald') { if (age > 25) { H(4, t + 2, 1, 2); H(11, t + 2, 1, 2); P.rect(6, t, 2, 1, lt(skin, 0.06)); } else { H(5, t - 1, 6); H(4, t, 8, 1); } }
        else if (hs === 'crop') { H(5, t - 1, 6); H(5, t, 6); P.px(4, t + 1, hair); P.px(11, t + 1, hair); }
        else if (hs === 'mohawk') { H(7, t - 3, 2, 4); H(4, t + 1, 1, 2); H(11, t + 1, 1, 2); P.px(7, t - 3, hl); }
        else if (hs === 'curly') {
          H(5, t - 2, 6); H(4, t - 1, 8); H(3, t, 10); H(3, t + 1, 2, 2); H(11, t + 1, 2, 2); H(5, t + 1, 1);
          for (let y = t - 2; y <= t + 1; y++) for (let x = 3; x <= 11; x += 3) if (P.get(x + (y & 1), y) === hair) P.rect(x + (y & 1), y, 1, 1, hl);
        } else {
          H(5, t - 1, 6); H(4, t, 8); H(4, t + 1, 1, 2); H(11, t + 1, 1, 2); P.rect(6, t - 1, 2, 1, hl);
          if (hs === 'sidepart') { H(5, t + 1, 3); P.px(8, t, hd); }
          if (hs === 'spiky') { P.px(5, t - 2, hair); P.px(7, t - 2, hair); P.px(9, t - 2, hair); P.px(8, t - 3, hair); H(5, t + 1, 1); H(9, t + 1, 2); }
          if (hs === 'messy') { P.px(6, t - 2, hair); P.px(9, t - 2, hair); H(6, t + 1, 1); H(8, t + 1, 1); P.px(3, t + 1, hair); }
          if (hs === 'long' || hs === 'wavy') { H(4, t + 1, 1, 7); H(11, t + 1, 1, 7); H(5, t + 1, 1); if (hs === 'wavy') { H(3, t + 4, 1, 2); H(12, t + 3, 1, 2); H(12, t + 6, 1, 1); } }
          if (hs === 'bob') { H(4, t + 1, 1, 4); H(11, t + 1, 1, 4); H(5, t + 1, 2); H(8, t + 1, 3); P.px(3, t + 4, hair); P.px(12, t + 4, hair); } // 前髪は束ごとに下端を変える
          if (hs === 'ponytail') { H(11, t, 2, 1); H(12, t + 1, 1, 5); P.px(12, t + 6, hd); P.px(11, t, accent); }
          if (hs === 'bun') { H(6, t - 3, 4, 2); P.rect(7, t - 3, 2, 1, hl); }
          if (hs === 'pigtailbuns') { H(3, t - 1, 2, 2); H(11, t - 1, 2, 2); }
          if (hs === 'twintails') { H(3, t + 1, 1, 6); H(12, t + 1, 1, 6); P.px(3, t + 1, accent); P.px(12, t + 1, accent); }
          if (hs === 'braid') { H(11, t + 2, 2, 1); for (let y = t + 3; y < t + 10; y++) P.px(12, y, (y & 1) ? hair : hd); P.px(12, t + 10, accent); H(5, t + 1, 2); }
          if (hs === 'short') H(9, t + 1, 1);
        }
      } else if (B) {
        const deep = { crop: 2, bob: 5, long: 5, wavy: 5, curly: 3 }[hs] ?? headH - 2;
        if (hs === 'bald' && age > 25) { H(4, t + 2, 8, 2); }
        else if (hs === 'mohawk') { H(7, t - 3, 2, headH + 2); }
        else {
          H(5, t - 1, 6); H(4, t, 8, 3); H(5, t + 3, 6, Math.max(0, deep - 2)); P.rect(6, t - 1, 2, 1, hl);
          if (hs === 'curly') { H(3, t - 1, 10, 4); H(5, t - 2, 6); }
          if (hs === 'spiky') { P.px(5, t - 2, hair); P.px(7, t - 2, hair); P.px(9, t - 2, hair); P.px(8, t - 3, hair); }
          if (hs === 'messy') { P.px(6, t - 2, hair); P.px(10, t - 2, hair); }
          if (hs === 'long' || hs === 'wavy') { H(4, t + 3, 8, kid ? 5 : 7); if (hs === 'wavy') { H(3, t + 5, 1, 2); H(12, t + 4, 1, 2); } P.rect(7, t + 4, 1, 4, hd); }
          if (hs === 'bob') H(4, t + 3, 8, 2);
          if (hs === 'ponytail') { H(7, t + 2, 2, 6); P.rect(7, t + 2, 2, 1, accent); P.px(7, t + 8, hd); }
          if (hs === 'bun') H(6, t - 3, 4, 2);
          if (hs === 'pigtailbuns') { H(3, t - 1, 2, 2); H(11, t - 1, 2, 2); }
          if (hs === 'twintails') { H(3, t + 1, 1, 6); H(12, t + 1, 1, 6); }
          if (hs === 'braid') { for (let y = t + 3; y < t + 11; y++) P.px(8, y, (y & 1) ? hair : hd); P.px(8, t + 11, accent); }
        }
      } else { // 横顔（左向き）：髪は後頭部を覆い、前髪は額に少し
        if (hs === 'bald') { if (age > 25) H(8, t + 2, 3, 2); else { H(5, t - 1, 6); H(5, t, 6); H(8, t + 1, 3, 1); } }
        else if (hs === 'mohawk') { H(6, t - 2, 5, 2); H(9, t + 1, 2, 2); }
        else {
          H(5, t - 1, 6); H(5, t, 7); H(9, t + 1, 3, 2); P.rect(6, t - 1, 2, 1, hl);
          const back = { crop: 0, short: 1, sidepart: 1, messy: 1, spiky: 1, bun: 1, ponytail: 1, twintails: 1, pigtailbuns: 1, braid: 1, curly: 2, bob: 3, long: 7, wavy: 7 }[hs] ?? 1;
          if (back) H(9, t + 3, 3, back);
          if (hs === 'curly') { H(5, t - 2, 6); H(4, t - 1, 1, 2); H(11, t - 1, 2, 5); H(9, t + 1, 3, 3); }
          if (hs === 'sidepart' || hs === 'bob' || hs === 'long' || hs === 'wavy') H(5, t + 1, 2, 1);
          if (hs === 'spiky') { P.px(6, t - 2, hair); P.px(8, t - 2, hair); P.px(10, t - 2, hair); P.px(9, t - 3, hair); P.px(11, t - 1, hair); }
          if (hs === 'messy') { P.px(7, t - 2, hair); P.px(10, t - 2, hair); P.px(12, t + 1, hair); }
          if (hs === 'long' || hs === 'wavy') { H(10, t + 3, 2, kid ? 5 : 7); if (hs === 'wavy') P.px(12, t + 6, hair); }
          if (hs === 'ponytail') { H(12, t + 1, 1, 2); H(13, t + 2, 1, 4); P.px(12, t + 1, accent); }
          if (hs === 'bun') H(9, t - 2, 3, 2);
          if (hs === 'pigtailbuns') H(10, t - 1, 2, 2);
          if (hs === 'twintails') { H(12, t + 1, 1, 6); P.px(12, t + 1, accent); }
          if (hs === 'braid') { for (let y = t + 3; y < t + 10; y++) P.px(11, y, (y & 1) ? hair : hd); P.px(11, t + 10, accent); }
          if (hs === 'short') P.px(5, t + 1, hair);
        }
      }
    }
    // 髭
    if (beardT && !kid && !mask && helmet !== 'closed' && !B) {
      const bc = dk(hair, 0.04);
      if (F) {
        if (beardT === 'stubble') { P.px(6, mouthY, mix(skin, hair, 0.35)); P.px(9, mouthY, mix(skin, hair, 0.35)); P.rect(7, mouthY, 2, 1, mix(skinD, hair, 0.3)); }
        if (beardT === 'mustache') P.rect(6, mouthY - 1, 4, 1, bc);
        if (beardT === 'full') { P.rect(5, mouthY - 1, 1, 2, bc); P.rect(10, mouthY - 1, 1, 2, bc); P.rect(6, mouthY, 4, 2, bc); P.rect(7, mouthY, 2, 1, dk(skin, 0.2)); }
        if (beardT === 'goatee') { P.rect(7, mouthY, 2, 2, bc); P.rect(6, mouthY - 1, 4, 1, bc); }
        if (beardT === 'chin') P.rect(6, mouthY + 1, 4, 1, bc);
        if (beardT === 'long') { P.rect(5, mouthY - 1, 6, 2, bc); P.rect(6, mouthY + 1, 4, 2, bc); P.rect(7, mouthY + 3, 2, 1, bc); P.rect(7, mouthY, 2, 1, dk(skin, 0.2)); P.rect(7, mouthY + 1, 2, 1, lt(bc, 0.06)); }
        if (beardT === 'sideburns') { P.rect(5, eyY, 1, 3, bc); P.rect(10, eyY, 1, 3, bc); }
      } else {
        if (beardT === 'stubble') P.rect(5, mouthY, 3, 1, mix(skin, hair, 0.35));
        if (beardT === 'mustache') P.rect(4, mouthY - 1, 2, 1, bc);
        if (beardT === 'full') { P.rect(5, mouthY - 1, 4, 3, bc); P.px(4, mouthY, bc); P.px(5, mouthY, skinD); }
        if (beardT === 'goatee') { P.rect(4, mouthY - 1, 2, 1, bc); P.rect(5, mouthY + 1, 2, 1, bc); }
        if (beardT === 'chin') P.rect(5, mouthY + 1, 3, 1, bc);
        if (beardT === 'long') { P.rect(4, mouthY - 1, 5, 2, bc); P.rect(4, mouthY + 1, 3, 2, bc); P.px(4, mouthY + 3, bc); P.px(5, mouthY, skinD); }
        if (beardT === 'sideburns') P.rect(8, eyY + 1, 1, 2, bc);
      }
    }
    if (glasses && !hid && !B) {
      if (F) { P.rect(5, eyY, 2, 1, '#9ad0f0'); P.rect(9, eyY, 2, 1, '#9ad0f0'); P.rect(7, eyY, 2, 1, '#4a3a2a'); P.px(6, eyY, eye); P.px(9, eyY, eye); }
      else { P.rect(5, eyY, 2, 1, '#9ad0f0'); P.px(6, eyY, eye); P.rect(7, eyY, 2, 1, '#4a3a2a'); }
    }
    if (eyepatch && !B) { if (F) { P.px(6, eyY, '#141414'); P.line(5, eyY - 1, 10, t, '#141414'); } else P.line(5, t + 1, 9, eyY, '#141414'); }

    // ---------------- 頭巾・兜・帽子
    if (hood) {
      if (F) { P.rect(4, t - 1, 8, 2, hood); P.rect(4, t, 1, headH + 1, hood); P.rect(11, t, 1, headH + 1, hood); P.rect(5, t - 2, 6, 1, hood); P.rect(bx0, tT, tw, 1, hood); P.rect(6, t - 1, 2, 1, lt(hood, 0.08)); }
      if (B) { P.rect(4, t - 1, 8, headH + 2, hood); P.rect(5, t - 2, 6, 1, hood); P.rect(bx0, tT, tw, 2, hood); P.rect(7, t + 1, 1, headH, dk(hood, 0.08)); }
      if (S) { P.rect(5, t - 2, 6, 1, hood); P.rect(4, t - 1, 8, 2, hood); P.rect(8, t + 1, 4, headH, hood); P.px(4, t + 1, hood); P.rect(sx0, tT, sw + 1, 1, hood); P.rect(12, t + 2, 1, 3, hood); }
      if (mask && !B) {
        if (F) P.rect(5, eyY + 1, 6, headH - (eyY + 1 - t), dk(hood, 0.05));
        else P.rect(4, eyY + 1, 4, headH - (eyY + 1 - t), dk(hood, 0.05));
      }
    }
    if (helmet === 'closed' || helmet === 'open') {
      const hc = STEEL;
      if (F || B) { P.rect(4, t - 1, 8, 2, hc); P.rect(4, t, 1, headH, hc); P.rect(11, t, 1, headH, hc); P.rect(5, t - 1, 2, 1, STEEL_L); }
      if (B) P.rect(5, t, 6, headH, hc);
      if (F && helmet === 'closed') { P.rect(5, t + 1, 6, headH - 1, hc); P.rect(6, eyY, 4, 1, '#1e1e24'); P.rect(7, eyY + 2, 2, 2, STEEL_D); } // スリット1本、目は描かない
      if (F && helmet === 'open') { P.rect(5, t + 1, 6, 1, hc); P.rect(7, t + 1, 2, 3, hc); }
      if (S) {
        P.rect(4, t - 1, 8, 2, hc); P.rect(8, t, 4, headH, hc); P.rect(5, t - 1, 2, 1, STEEL_L);
        if (helmet === 'closed') { P.rect(4, t + 1, 4, headH - 1, hc); P.rect(4, eyY, 3, 1, '#1e1e24'); } else P.rect(4, t + 1, 1, 3, hc);
      }
      const pc = plume[0];
      if (plume[1] === 0) { P.rect(7, t - 3, 2, 2, pc); if (S) P.rect(9, t - 2, 3, 1, pc); else P.px(9, t - 3, pc); }
      else if (plume[1] === 1) { P.rect(8, t - 4, 1, 3, pc); P.px(9, t - 4, pc); P.px(10, t - 3, pc); }
      else P.rect(7, t - 2, 2, 1, GOLD);
    }
    if (helmet === 'kettle') { P.rect(3, t, 10, 1, '#8a8e96'); P.rect(5, t - 2, 6, 2, '#a8acb4'); P.px(6, t - 2, '#d8dce4'); if (B) P.rect(5, t, 6, 2, '#a8acb4'); }
    if (helmet === 'morion') { P.rect(3, t, 10, 1, '#a8acb4'); P.rect(5, t - 2, 6, 2, '#b8bcc4'); P.rect(7, t - 3, 2, 1, '#b8bcc4'); P.px(2, t - 1, '#a8acb4'); P.px(13, t - 1, '#a8acb4'); if (B) P.rect(5, t, 6, 2, '#b8bcc4'); }

    const HT = (x, y, w, h, c = hatC) => P.rect(x, y, w, h, c);
    const brimShadow = () => { if (F) P.rect(5, t + 1, 6, 1, dk(skin, 0.1)); }; // つばの落ち影
    switch (hat) {
      case 'crown': HT(5, t - 2, 6, 2, GOLD); P.px(5, t - 3, GOLD); P.rect(7, t - 3, 2, 1, GOLD); P.px(10, t - 3, GOLD); P.rect(5, t - 1, 6, 1, GOLD_D);
        if (F) P.rect(7, t - 2, 2, 1, '#d0303a'); if (S) P.px(5, t - 2, '#d0303a'); P.px(6, t - 2, '#fff4a0'); break;
      case 'tiara': HT(5, t - 1, 6, 1, GOLD); if (!B) { P.rect(7, t - 2, 2, 1, GOLD); P.px(S ? 5 : 7, t - 2, tiaraGem); } break;
      case 'circlet': HT(5, t, 6, 1, GOLD); if (F) P.px(7, t, '#3a7ad8'); if (S) P.px(5, t, '#3a7ad8'); break;
      case 'feather': HT(4, t - 2, 7, 2); HT(3, t, 3, 1); HT(4, t, 8, 1, dk(hatC, 0.2)); P.rect(11, t - 4, 1, 3, '#f4f4f0'); P.px(12, t - 5, '#f4f4f0'); brimShadow(); break;
      case 'straw': HT(2, t, 12, 1, '#e8c860'); HT(5, t - 2, 6, 2, '#e8c860'); HT(5, t - 1, 6, 1, '#c03a3a'); HT(4, t, 8, 1, '#b89838'); brimShadow(); break;
      case 'cowboy': HT(2, t, 12, 1); HT(5, t - 2, 6, 2); P.rect(7, t - 2, 2, 1, dk(hatC, 0.1)); P.px(2, t - 1, hatC); P.px(13, t - 1, hatC); HT(5, t - 1, 6, 1, dk(hatC, 0.15)); HT(4, t, 8, 1, dk(hatC, 0.25)); brimShadow(); break;
      case 'feathercap': HT(4, t - 1, 8, 2); HT(5, t - 2, 5, 1); P.px(11, t - 2, hatC); P.rect(12, t - 4, 1, 2, '#e8e8e0'); P.px(13, t - 5, '#e8e8e0'); break;
      case 'bandana': HT(4, t - 1, 8, 2); P.rect(B ? 3 : 12, t + 1, 1, 2, dk(hatC, 0.1)); P.rect(6, t - 1, 2, 1, lt(hatC, 0.15)); break;
      case 'sailorcap': HT(5, t - 2, 6, 2, '#f4f4f4'); HT(4, t, 8, 1, '#2a3a8a'); break;
      case 'wide': HT(2, t, 12, 1); HT(5, t - 2, 6, 2); HT(5, t - 1, 6, 1, dk(hatC, 0.15)); HT(4, t, 8, 1, dk(hatC, 0.25)); brimShadow(); break;
      case 'minercap': HT(4, t - 1, 8, 2, '#8a7a5a'); HT(5, t - 2, 6, 1, '#8a7a5a'); if (F) P.rect(7, t - 1, 2, 1, '#f0e080'); if (S) P.rect(4, t - 1, 1, 2, '#f0e080'); break;
      case 'chef': HT(5, t - 4, 6, 4, '#ffffff'); HT(4, t - 4, 8, 2, '#ffffff'); HT(5, t, 6, 1, '#e8e8e0'); break;
      case 'headband': HT(4, t + 1, 8, 1, accent); P.rect(S ? 12 : B ? 8 : 12, t + 2, 1, 2, accent); break;
      case 'katyusha': HT(5, t - 1, 6, 1, '#ffffff'); P.px(4, t, '#ffffff'); P.px(11, t, '#ffffff'); P.px(6, t - 2, '#ffffff'); P.px(9, t - 2, '#ffffff'); break;
      case 'skullcap': HT(6, t - 1, 4, 1, '#f4f2ea'); HT(5, t, 6, 1, '#f4f2ea'); break;
      case 'wizard': HT(3, t, 10, 1); HT(5, t - 1, 6, 1); HT(6, t - 2, 4, 1); HT(7, t - 3, 2, 1); P.px(8, t - 4, hatC); P.px(9, t - 5, hatC); P.px(10, t - 5, dk(hatC, 0.1));
        HT(5, t - 1, 6, 1, pickBy([GOLD, lt(hatC, 0.2)], rp[11])); HT(4, t, 8, 1, dk(hatC, 0.2)); brimShadow(); break;
      case 'miter': HT(5, t - 1, 6, 2); HT(6, t - 3, 4, 2); P.rect(7, t - 4, 2, 1, hatC); HT(5, t, 6, 1, GOLD); if (!B) P.rect(7, t - 3, 2, 3, GOLD); break; // 僧侶の司教帽
      case 'beret': HT(4, t - 1, 7, 2); P.px(11, t, hatC); P.px(7, t - 2, hatC); break;
      case 'cap': HT(5, t - 2, 6, 2); if (F) HT(5, t, 6, 1, dk(hatC, 0.15)); if (S) HT(3, t, 3, 1, dk(hatC, 0.15)); if (B) HT(5, t, 6, 1, hatC); P.rect(6, t - 2, 2, 1, lt(hatC, 0.12)); break;
      case 'knit': HT(5, t - 2, 6, 3); HT(4, t, 8, 1, lt(hatC, 0.1)); P.px(8, t - 3, lt(hatC, 0.2)); break;
      case 'kerchief': HT(4, t - 1, 8, 2); if (!S) { P.px(4, t + 1, hatC); P.px(11, t + 1, hatC); } else P.rect(11, t + 1, 1, 2, hatC); if (B) P.rect(7, t + 1, 2, 2, hatC); break;
      case 'bonnet': HT(4, t - 1, 8, 2, '#f4f0f0'); if (S) HT(8, t + 1, 3, 3, '#f4f0f0'); else { HT(4, t + 1, 1, 3, '#f4f0f0'); HT(11, t + 1, 1, 3, '#f4f0f0'); } if (B) HT(5, t + 1, 6, 3, '#f4f0f0'); break;
      case 'turban': HT(4, t - 2, 8, 3); for (let x = 4; x < 12; x += 2) P.px(x, t - 1, dk(hatC, 0.12)); P.px(8, t - 3, hatC); if (rp[10] < 0.4 && F) P.px(7, t - 1, '#d0303a'); break;
      case 'jester': HT(4, t - 1, 8, 2); P.rect(3, t - 2, 2, 1, accent === hatC ? '#3050c0' : shirt); P.px(2, t - 3, shirt); P.rect(7, t - 3, 2, 2, hatC); P.px(8, t - 4, hatC); P.rect(11, t - 2, 2, 1, shirt); P.px(13, t - 3, shirt);
        P.px(1, t - 4, GOLD); P.px(8, t - 5, GOLD); P.px(14, t - 4, GOLD); break;
      case 'nunveil': HT(4, t - 1, 8, 2, '#1a1a22'); if (F) { HT(5, t, 6, 1, '#f4f4f4'); HT(4, t, 1, 8, '#1a1a22'); HT(11, t, 1, 8, '#1a1a22'); HT(3, t + 4, 1, 4, '#1a1a22'); HT(12, t + 4, 1, 4, '#1a1a22'); } if (S) { HT(5, t, 3, 1, '#f4f4f4'); HT(8, t, 4, 8, '#1a1a22'); HT(12, t + 3, 1, 5, '#1a1a22'); } if (B) { HT(4, t, 8, 8, '#1a1a22'); HT(3, t + 4, 10, 4, '#1a1a22'); } break;
      case 'beekeeper': HT(2, t - 1, 12, 1, '#e8e0c8'); HT(5, t - 3, 6, 2, '#e8e0c8'); if (!B) for (let y = t; y < t + headH; y++) for (let x = 4; x <= 11; x++) if ((x + y) & 1) P.px(x, y, '#6a6a6a'); if (B) HT(4, t, 8, headH, '#8a8a8a'); break;
      case 'tricorne': HT(3, t - 1, 10, 2, '#1a1a22'); HT(5, t - 2, 6, 1, '#1a1a22'); HT(3, t - 1, 10, 1, '#2a2a34'); P.px(3, t - 2, GOLD); P.px(12, t - 2, GOLD); if (F) P.px(8, t - 1, '#f0f0f0'); break;
      case 'tophat': HT(5, t - 5, 6, 5, '#1a1a1e'); HT(3, t, 10, 1, '#1a1a1e'); HT(5, t - 1, 6, 1, accent); break;
      case 'tribal': TG.tribeHead(P, { p, age, F, S, B, t, headH, eyY, mouthY, tT, nk, torsoH, torsoBot, legTop, legH, FEET, bx0, bx1, tx0, tx1, sx0, sx1, sw, tw, armL, armR, skin, hair, long, hid, fr }); break;
      case 'veil': HT(4, t - 1, 8, 2); if (F) { HT(4, t + 1, 1, 6); HT(11, t + 1, 1, 6); HT(3, t + 4, 1, 4); HT(12, t + 4, 1, 4); } if (S) { HT(8, t + 1, 4, 5); HT(10, t + 6, 3, 3); } if (B) { HT(4, t + 1, 8, 6); HT(3, t + 4, 10, 4); } P.rect(6, t - 1, 2, 1, lt(hatC, 0.12)); break;
    }

    // ---------------- 表情
    faceFx(P, q.face, G, eyY, mouthY);
    // ---------------- 口元・目元に当てる手（頭より手前）
    if (!defArms) for (const w of ['T', 'O']) { const A = hands[w]; if (A.late && !A.skip) drawArm(P, A, G, S && w === 'O'); }
    // ---------------- 前かがみ・のけぞり（横向き）：腰より上の行を前後にずらす
    const lean = S ? (q.lean || 0) : 0;
    const shearAt = (y) => (!lean || y >= legTop ? 0 : -Math.sign(lean) * (Math.abs(lean) >= 2 && y < legTop - 4 ? 2 : 1));
    if (lean) for (let y = -OY; y < legTop; y++) P.shiftRows(y + P.oy, y + P.oy, shearAt(y));
    for (const w of ['T', 'O']) { const h = hands[w].hand; h[0] += shearAt(h[1]); }
    G.shearAt = shearAt;
    if (!B && q.prop) drawProp(P, q.prop, G, q.ph || 0);

    // ---------------- 手に持つ物（左手。正面では画面右、背中では画面左、横では手前の手）
    const showItem = q.item === 'keep' || (q.item !== false && hands.T.def && !q.tools);
    const hy = hands.T.hand[1];
    const hx = F ? Math.min(hands.T.hand[0] + 1, 14) : hands.T.hand[0] - 1;
    const wood = '#7a5230', steel = '#dce0e8';
    const dir = B ? -1 : 1;
    switch (showItem ? item : null) {
      case 'sword': P.rect(hx, hy - 7, 1, 7, steel); P.px(hx, hy - 8, '#f4f6fa'); P.rect(hx - 1, hy - 1, 3, 1, '#c9a23a'); P.px(hx, hy, '#5a3a22'); break;
      case 'spear': P.rect(hx, 2, 1, FEET - 2, wood); P.rect(hx, 0, 1, 2, steel); P.px(hx - 1, 2, '#9aa0aa'); P.px(hx + 1, 2, '#9aa0aa'); break;
      case 'staff': P.rect(hx, t, 1, FEET - t, wood); P.rect(hx - (dir > 0 ? 1 : 0), t - 2, 2, 2, orb); break; // 魔法の玉は自ら光る
      case 'staffplain': P.rect(hx, t + 1, 1, FEET - t - 1, wood); P.rect(hx - (dir > 0 ? 1 : 0), t, 2, 1, dk(wood, 0.1)); break;
      case 'cane': P.rect(hx, hy, 1, FEET - hy + 1, wood); P.px(hx - dir, hy, wood); break;
      case 'scepter': P.rect(hx, hy - 5, 1, 6, GOLD); P.px(hx, hy - 6, '#d0303a'); break;
      case 'club': P.rect(hx, hy - 4, 1, 5, wood); P.px(hx, hy - 5, dk(wood, 0.1)); break;
      case 'pitchfork': P.rect(hx, 3, 1, FEET - 3, wood); P.rect(hx - 1, 2, 3, 1, steel); P.px(hx - 1, 0, steel); P.px(hx + 1, 0, steel); P.px(hx - 1, 1, steel); P.px(hx + 1, 1, steel); break;
      case 'hoe': P.rect(hx, 3, 1, FEET - 3, wood); P.rect(dir > 0 ? hx - 2 : hx, 2, 3, 1, steel); break;
      case 'rope': P.rect(hx - 1, hy - 1, 2, 2, '#c8a860'); P.px(hx, hy - 2, '#a88840'); break;
      case 'bow': P.line(hx, hy - 7, hx + dir, hy - 5, wood); P.rect(hx + dir, hy - 5, 1, 5, wood); P.line(hx + dir, hy, hx, hy + 2, wood); P.rect(hx, hy - 6, 1, 8, '#e8e8e0'); break;
      case 'rod': P.line(hx, hy, hx + dir, 1, wood); P.px(hx + dir, 2, '#e8e8e8'); break;
      case 'axe': P.rect(hx, hy - 6, 1, 7, wood); P.rect(hx + dir, hy - 6, 1, 3, steel); P.px(hx - dir, hy - 5, steel); break;
      case 'pick': P.rect(hx, hy - 5, 1, 6, wood); P.line(hx - 2 * dir, hy - 5, hx + dir, hy - 7, steel); break;
      case 'hammer': P.rect(hx, hy - 3, 1, 4, wood); P.rect(hx - 1, hy - 5, 3, 2, '#5a5a62'); break;
      case 'saw': P.rect(hx, hy - 5, 1, 5, '#c8ccd4'); P.px(hx, hy, wood); P.rect(hx + dir, hy - 4, 1, 3, '#8a8e96'); break;
      case 'mug': P.rect(hx - 1, hy - 1, 2, 2, '#b08a5a'); P.rect(hx - 1, hy - 2, 2, 1, '#f4f0e0'); break;
      case 'purse': P.rect(hx - 1, hy, 2, 2, '#8a5a2a'); P.px(hx, hy - 1, GOLD); break;
      case 'bread': P.rect(hx - 1, hy - 1, 3, 2, '#d8a050'); P.rect(hx - 1, hy - 1, 2, 1, '#f0c070'); break;
      case 'book': P.rect(hx - 1, hy - 1, 2, 3, B ? dk(accent, 0.2) : accent); if (!B) P.rect(hx - 1, hy - 1, 1, 3, '#f0e8d0'); break;
      case 'holybook': P.rect(hx - 1, hy - 1, 2, 3, '#3a2a6a'); if (!B) P.px(hx, hy, GOLD); break;
      case 'dagger': P.rect(hx, hy - 3, 1, 3, steel); P.px(hx, hy, '#2a2a2a'); break;
      case 'scroll': P.rect(hx - 1, hy - 1, 2, 3, '#f0e8d0'); P.px(hx - 1, hy - 2, '#c8b890'); P.px(hx, hy + 2, '#c8b890'); break;
      case 'ladle': P.rect(hx, hy - 5, 1, 6, wood); P.rect(hx - 1, hy - 7, 2, 2, '#b8bcc4'); break;
      case 'shears': P.line(hx - 1, hy - 4, hx, hy, '#c8ccd4'); P.line(hx + 1, hy - 4, hx, hy, '#a8acb4'); P.px(hx, hy + 1, '#3a3a3a'); break;
      case 'bag': P.rect(hx - 1, hy, 3, 2, '#2a2a2a'); P.px(hx, hy - 1, '#2a2a2a'); P.px(hx, hy, GOLD); break;
      case 'herbs': P.rect(hx - 1, hy - 1, 2, 3, '#4a9a3a'); P.px(hx - 1, hy - 2, '#e8e060'); P.px(hx, hy - 2, '#6ac050'); break;
      case 'cleaver': P.rect(hx - 1, hy - 3, 3, 3, steel); P.rect(hx - 1, hy - 3, 1, 3, '#f0f2f6'); P.px(hx, hy, '#3a2616'); break;
      case 'pot': P.rect(hx - 1, hy - 1, 3, 3, '#b0603a'); P.rect(hx - 1, hy - 1, 3, 1, '#c87a4a'); break;
      case 'yarn': P.rect(hx - 1, hy - 1, 2, 2, pickBy(['#d03050', '#3050d0', '#e0c030'], rp[9])); break;
      case 'gem': P.rect(hx - 1, hy - 1, 2, 2, pickBy(['#40c0f0', '#e03050', '#40e080'], rp[9])); P.px(hx - 1, hy - 1, '#ffffff'); break;
      case 'flask': P.px(hx, hy - 3, '#c8d8e0'); P.rect(hx - 1, hy - 2, 2, 3, pickBy(['#60e080', '#e060c0', '#60a0ff', '#f0a030'], rp[9])); break;
      case 'orb': P.rect(hx - 1, hy - 2, 3, 3, '#a8e0ff'); P.px(hx - 1, hy - 2, '#ffffff'); P.rect(hx - 1, hy + 1, 3, 1, '#6a4a2a'); break;
      case 'brush': P.line(hx, hy, hx + dir, hy - 5, wood); P.px(hx + dir, hy - 6, pickBy(['#d03030', '#3050c0', '#e0c030'], rp[9])); break;
      case 'lantern': P.px(hx, hy - 1, '#3a3a3a'); P.rect(hx - 1, hy, 2, 3, '#ffe070'); P.rect(hx - 1, hy, 2, 1, '#5a4a3a'); break;
      case 'shovel': P.rect(hx, t + 2, 1, FEET - t - 5, wood); P.rect(hx - 1, FEET - 3, 3, 3, '#9aa0aa'); break;
      case 'basket': P.rect(hx - 1, hy, 3, 2, '#c8a060'); P.px(hx, hy - 1, '#a88040'); P.px(hx - 1, hy - 1, '#e04040'); break;
      case 'crook': P.rect(hx, t, 1, FEET - t, wood); P.px(hx + dir, t - 1, wood); P.px(hx + 2 * dir, t, wood); P.px(hx + 2 * dir, t + 1, wood); break;
      case 'sack': P.rect(hx - 1, hy - 1, 3, 3, '#e8dcc0'); P.px(hx, hy - 2, '#c8b890'); break;
      case 'pearl': P.px(hx, hy, '#fbfbff'); P.px(hx - 1, hy, '#d8d0e0'); break;
      case 'mace': P.rect(hx, hy - 4, 1, 5, wood); P.rect(hx - 1, hy - 6, 3, 2, '#a8acb4'); P.px(hx, hy - 7, '#a8acb4'); break;
      case 'bigaxe': P.rect(hx, hy - 8, 1, 10, wood); P.rect(dir > 0 ? hx + 1 : hx - 3, hy - 8, 3, 4, steel); P.rect(dir > 0 ? hx - 1 : hx + 1, hy - 7, 1, 2, steel); break;
      case 'smoker': P.rect(hx - 1, hy - 1, 2, 3, '#8a8a8a'); P.px(hx, hy - 3, '#d8d8d8'); P.px(hx + 1, hy - 4, '#e8e8e8'); break;
      case 'greatsword': { const bx = dir > 0 ? hx : hx - 1; P.rect(bx, hy - 11, 2, 10, '#d0d4dc'); P.rect(dir > 0 ? bx : bx + 1, hy - 11, 1, 10, '#f4f6fa'); P.px(dir > 0 ? bx + 1 : bx, hy - 12, '#d0d4dc'); P.rect(hx - 1, hy - 1, 4, 1, '#8a6a3a'); P.px(hx, hy, '#5a3a22'); break; }
      case 'tome': P.rect(hx - 1, hy - 2, 3, 3, B ? '#3a1e5a' : '#4a2a7a'); P.px(hx - 1, hy - 2, GOLD); if (!B) { P.px(hx, hy - 1, '#70e8ff'); P.rect(hx - 1, hy, 1, 1, '#f0e8d0'); } break;
      case 'holystaff': P.rect(hx, t, 1, FEET - t, '#d8c890'); P.rect(hx, t - 4, 1, 4, GOLD); P.rect(hx - 1, t - 3, 3, 1, GOLD); P.px(hx, t - 5, '#fff4c0'); break;
      case 'fists': break; // 武闘家：拳の布は手の色で描く
      case 'lute':
        if (F) { P.rect(bx0 + 1, torsoBot - 3, 3, 3, '#c08a40'); P.px(bx0 + 2, torsoBot - 2, '#3a2616'); P.line(bx0 + 3, torsoBot - 3, bx1 + 1, nk, '#8a5a2a'); }
        if (B) { P.rect(bx0 + 2, nk + 1, 4, 5, '#a8763a'); P.line(bx0 + 4, nk + 1, bx1, t + 2, '#8a5a2a'); }
        if (S) { P.rect(sx0 - 2, torsoBot - 3, 3, 3, '#c08a40'); P.line(sx0 - 1, torsoBot - 3, sx0 - 4, nk - 1, '#8a5a2a'); }
        break;
    }
    if (shield && F) { P.rect(1, nk + 2, 3, 4, shield); P.rect(2, nk + 3, 1, 2, lt(shield, 0.25)); }
    // ---------------- 道具（姿勢で持つ物）。背中側に隠れる物は別の層に描いて下に敷く
    const fx = (q.fx || []).slice();
    const tools = q.tools ? (Array.isArray(q.tools) ? q.tools : [q.tools]) : [];
    let behindP = null;
    for (const tl of tools) {
      const A = hands[tl.h || 'T'];
      const layer = tl.behind ? (behindP ||= Object.assign(new Pix(CW, CH), { ox: P.ox, oy: P.oy })) : P;
      const tip = drawTool(layer, tl, A.hand, A.sg, G, hands);
      if (tip && (tl.h || 'T') === 'T' && !G.tip) G.tip = tip;
      if (tip && tl.h === 'O') G.tipO = tip;
    }
    if (behindP) for (let i = 0; i < P.d.length; i++) if (!P.d[i] && behindP.d[i]) P.d[i] = behindP.d[i];
    return { P, hands, fx, G };
  };

  return { frame, stage, kid, outfit, item, legH, f, south, headH, orb, accent };
}

// ================================================================ 共通の定数と部品
const D2R = Math.PI / 180;
// 下書き画布：幅48・高さ44。設計座標(0,0) → 生座標(16,16)。接地行は生座標 39（設計 FEET=23）
const CW = 48, CH = 44, OX = 16, OY = 16, FEET = 23, GROUND = OY + FEET;
const pickBy = (arr, u) => arr[Math.floor(u * arr.length) % arr.length];
function linePts(a, b) {
  let [x0, y0] = a.map(Math.round), [x1, y1] = b.map(Math.round);
  const out = [];
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 200; n++) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
  return out;
}

// 道具（手から伸びる物）。len：手から先の長さ、back：手より後ろ（柄尻）の長さ
const TOOL = {
  sword: { len: 7, blade: '#dce0e8', guard: '#c9a23a' },
  longsword: { len: 8, blade: '#dce0e8', guard: '#c9a23a' },
  greatsword: { len: 10, blade: '#d0d4dc', guard: '#8a6a3a', wide: true },
  dagger: { len: 3, blade: '#dce0e8', guard: '#8a8a90' },
  holy: { len: 8, blade: '#f6faff', guard: '#e8c040' },
  dragon: { len: 8, blade: '#6ac89a', guard: '#c9a23a' },
  spear: { len: 12, back: 4, head: 'tip' },
  pitchfork: { len: 10, back: 3, head: 'fork' },
  axe: { len: 6, back: 1, head: 'axe', size: 2 },
  woodaxe: { len: 6, back: 1, head: 'axe', size: 2 },
  bigaxe: { len: 9, back: 1, head: 'axe', size: 3 },
  mace: { len: 5, back: 1, head: 'ball' },
  club: { len: 4, back: 1, head: 'club' },
  hammer: { len: 4, back: 1, head: 'hammer' },
  mallet: { len: 3, back: 0, head: 'mallet' },
  pick: { len: 6, back: 1, head: 'pick' },
  hoe: { len: 10, back: 2, head: 'hoe' },
  shovel: { len: 8, back: 2, head: 'shovel' },
  broom: { len: 8, back: 1, head: 'broom' },
  crook: { len: 12, back: 3, head: 'crook' },
  staff: { len: 11, back: 4, head: 'orb' },
  staffplain: { len: 11, back: 4, head: 'knob' },
  holystaff: { len: 11, back: 4, head: 'holy', shaft: '#d8c890' },
  rod: { len: 11, back: 2, head: 'rod', shaft: '#8a6a3a' },
  saw: { len: 5, back: 0, head: 'saw' },
  ladle: { len: 5, back: 1, head: 'cup' },
  paddle: { len: 7, back: 2, head: 'paddle' },
  cleaver: { len: 3, back: 1, head: 'cleaver', shaft: '#3a2616' },
  brush: { len: 4, back: 0, head: 'paint' },
  quill: { len: 3, back: 0, head: 'quill', shaft: '#e8e8e0' },
  scepter: { len: 5, back: 1, head: 'scepter', shaft: GOLD },
  spyglass: { len: 4, back: 0, head: 'glass', shaft: '#c9a23a' },
  pestle: { len: 3, back: 0, head: 'knob', shaft: '#b0a890' },
};

// 手に持つ小物（向きのない物）。(P, 手のx, 手のy, 指定, G, 両手, 色) で描く
const mid2 = (hands) => [Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2)];
const OBJ = {
  tome: (P, x, y, tl) => { P.rect(x - 1, y - 2, 3, 3, '#4a2a7a'); P.px(x - 1, y - 2, GOLD); P.px(x, y - 1, tl.ph ? '#c0ffff' : '#70e8ff'); P.px(x - 1, y, '#f0e8d0'); },
  mug: (P, x, y, tl) => { const o = tl.tilt ? -1 : 0; P.rect(x - 1, y - 1 + o, 2, 2, '#b08a5a'); P.rect(x - 1, y - 2 + o, 2, 1, '#f4f0e0'); P.px(x - 1, y + o, '#8a6a3a'); },
  bread: (P, x, y) => { P.rect(x - 1, y - 1, 3, 2, '#d8a050'); P.rect(x - 1, y - 1, 2, 1, '#f0c070'); },
  bowl: (P, x, y) => { P.rect(x - 1, y - 1, 3, 1, '#f0e0b0'); P.rect(x - 1, y, 3, 1, '#8a5a3a'); },
  coin: (P, x, y) => { P.px(x, y - 1, GOLD); },
  sack: (P, x, y) => { P.rect(x - 1, y - 1, 3, 3, '#e8dcc0'); P.px(x, y - 2, '#c8b890'); P.px(x + 1, y + 1, '#c8bca0'); },
  basket: (P, x, y) => { P.rect(x - 1, y, 3, 2, '#c8a060'); P.px(x, y - 1, '#a88040'); P.px(x - 1, y - 1, '#e04040'); P.px(x + 1, y - 1, '#6ac050'); },
  cloth: (P, x, y) => { P.rect(x - 1, y, 2, 2, '#f0f0ec'); },
  baby: (P, x, y, tl, G, hands, ex) => { const [mx, my] = mid2(hands); P.rect(mx - 1, my - 2, 3, 2, '#f4f0f0'); P.px(mx - 1, my - 2, ex.skin); P.px(mx + 1, my - 1, '#e8d8e8'); },
  openbook: (P, x, y, tl, G, hands, ex) => { const [mx, my] = mid2(hands); P.rect(mx - 1, my - 1, 3, 2, '#f4ecd8'); P.px(mx, my - 1, '#c8b890'); P.rect(mx - 1, my + 1, 3, 1, dk(ex.accent, 0.1)); if (tl.ph) P.px(mx + 1, my - 2, '#f4ecd8'); },
  openscroll: (P, x, y, tl, G, hands) => { const [mx, my] = mid2(hands); P.rect(mx - 1, my - 1, 3, 2, '#f0e8d0'); P.px(mx - 2, my - 1, '#c8b890'); P.px(mx + 2, my - 1, '#c8b890'); P.px(mx, my, '#6a5a4a'); },
  mortar: (P, x, y) => { P.rect(x - 1, y, 3, 2, '#8a8a90'); P.px(x, y, '#5a7a3a'); },
  shoe: (P, x, y) => { P.rect(x - 1, y - 1, 3, 1, '#5a3a22'); P.px(x + 1, y - 2, '#5a3a22'); },
  flask: (P, x, y, tl, G, hands, ex) => { P.px(x, y - 3, '#c8d8e0'); P.rect(x - 1, y - 2, 2, 3, pickBy(['#60e080', '#e060c0', '#60a0ff', '#f0a030'], (ex.orb.charCodeAt(2) % 7) / 7)); },
  palette: (P, x, y) => { P.rect(x - 1, y, 3, 1, '#c8a070'); P.px(x - 1, y - 1, '#d03030'); P.px(x + 1, y - 1, '#3050c0'); },
  lantern: (P, x, y) => { P.px(x, y + 1, '#3a3a3a'); P.rect(x - 1, y + 2, 2, 2, '#ffe070'); P.rect(x - 1, y + 2, 2, 1, '#5a4a3a'); P.px(x, y + 3, '#fff8c0'); },
  smoker: (P, x, y) => { P.rect(x - 1, y - 1, 2, 3, '#8a8a8a'); P.px(x - 1, y - 2, '#6a6a6a'); },
  shears: (P, x, y, tl, G) => { const s = G.S ? -1 : 1; if (tl.ph) { P.line(x, y, x + s * 3, y - 2, '#c8ccd4'); P.line(x, y, x + s * 3, y, '#a8acb4'); } else P.line(x, y, x + s * 3, y - 1, '#c8ccd4'); P.px(x, y, '#3a3a3a'); },
  needle: (P, x, y) => { P.px(x, y - 1, '#e8e8f0'); },
  gem: (P, x, y) => { P.rect(x - 1, y - 1, 2, 2, '#40c0f0'); P.px(x - 1, y - 1, '#ffffff'); },
  herbs: (P, x, y) => { P.rect(x - 1, y - 1, 2, 2, '#4a9a3a'); P.px(x, y - 2, '#e8e060'); },
  bucket: (P, x, y) => { P.rect(x - 1, y + 1, 3, 3, '#8a6a4a'); P.rect(x - 1, y + 1, 3, 1, '#6ab0e0'); P.px(x, y, '#5a5a5a'); },
};

// ================================================================ 効果（輪郭の外に描く：音符・火花・Zzz など）
const GLYPH = {
  z: ['111', '.1.', '111'],
  Z: ['1111', '..1.', '.1..', '1111'],
  note: ['.11', '.1.', '.1.', '11.', '11.'],
  heart: ['1.1', '111', '.1.'],
  plus: ['.1.', '111', '.1.'],
  star: ['..1..', '..1..', '11111', '..1..', '..1..'],
  burst: ['1...1', '.1.1.', '..1..', '.1.1.', '1...1'],
};
function glyph(P, g, x, y, c, c2) {
  const rows = GLYPH[g];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] === '1') { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < P.w && Y < P.h && !P.d[Y * P.w + X]) P.d[Y * P.w + X] = c; }
  if (c2) { const cx = x + (rows[0].length >> 1), cy = y + (rows.length >> 1); if (cx >= 0 && cy >= 0 && cx < P.w && cy < P.h) P.d[cy * P.w + cx] = c2; }
}
function dot(P, x, y, c, over = false) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < P.w && y < P.h && (over || !P.d[y * P.w + x])) P.d[y * P.w + x] = c; }

// fx：[種類, 目印, dx, dy, 追加]。目印は 'T' 'O'（手）、'tip' 'tipO'（道具の先）、'head' 'face' 'chest' 'feet' 'fwdfeet'
function fxAnchor(r, name) {
  const G = r.G, h = r.hands;
  const sh = (p) => [p[0] + (G.shearAt ? G.shearAt(p[1]) : 0), p[1]];
  switch (name) {
    case 'T': return h.T.hand.slice();
    case 'O': return h.O.hand.slice();
    case 'tip': return (G.tip || h.T.hand).slice();
    case 'tipO': return (G.tipO || h.O.hand).slice();
    case 'head': return sh(G.S ? [7, G.t - 2] : [8, G.t - 2]);
    case 'face': return sh(G.S ? [4, G.eyY] : [8, G.eyY]);
    case 'chest': return sh(G.S ? [4, G.nk + 2] : [8, G.nk + 2]);
    case 'feet': return [8, FEET];
    case 'fwdfeet': return G.S ? [-2, FEET] : [8, FEET];
    default: return [8, G.nk];
  }
}
function drawFx(P, r, flip) {
  const G = r.G;
  const sg = G.S ? -1 : G.F ? 1 : -1;
  const toRaw = (p) => { let x = p[0] + OX, y = p[1] + (OY - (r.jump || 0)); if (flip) x = CW - 1 - x; return [x, y]; };
  const fs = flip ? -1 : 1;
  for (const fx of r.fx) {
    const [kind, an, dx = 0, dy = 0, ex] = fx;
    const base = fxAnchor(r, an);
    const [x, y] = toRaw([base[0] + dx * sg, base[1] + dy]);
    if (AX.FX[kind]) { AX.FX[kind]({ P, dot: (qx, qy, c, o) => dot(P, qx, qy, c, o), x, y, ex, fs, sg }); continue; } // しずく・呼び声・種まきの粒など（anim_acts.js）
    switch (kind) {
      case 'spark': glyph(P, 'plus', x - 1, y - 1, ex || '#fff4a0', '#ffffff'); break;
      case 'burst': glyph(P, 'star', x - 2, y - 2, ex || '#a0e0ff', '#ffffff'); glyph(P, 'burst', x - 2, y - 2, lt(ex || '#a0e0ff', 0.1)); break;
      case 'glow': for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) dot(P, x + i, y + j, ex || '#c0f0ff'); break;
      case 'dots': { const cs = ex || ['#8a6a4a', '#6a5040']; const pts = [[-2, -1], [1, -2], [2, 0], [-1, -3]]; pts.forEach(([i, j], n) => dot(P, x + i * fs * sg, y + j, cs[n % cs.length])); break; }
      case 'sweat': { const hx = G.S ? 11 : 12; const [sx, sy] = toRaw([hx + (G.shearAt ? G.shearAt(G.t) : 0), G.t + 2]); dot(P, sx, sy, '#bfe8ff'); dot(P, sx, sy + 1, '#8ad0ff'); break; }
      case 'z': { const n = ex || 1; const [zx, zy] = [x, y]; if (n >= 1) glyph(P, 'z', zx, zy, '#e8f0ff'); if (n >= 2) glyph(P, 'Z', zx + 3 * fs, zy - 5, '#e8f0ff'); if (n >= 3) glyph(P, 'Z', zx + 1 * fs, zy - 10, '#e8f0ff'); break; }
      case 'note': glyph(P, 'note', x - 1, y - 2, ex || '#3a2a4a'); break;
      case 'heart': glyph(P, 'heart', x - 1, y - 1, ex || '#ff6a8a'); break;
      case 'coin': dot(P, x, y, GOLD); dot(P, x + 1, y, GOLD_D); dot(P, x, y - 1, '#fff4a0'); break;
      case 'puff': { const c = ex || '#d8d8dc'; dot(P, x, y, c); dot(P, x + 1, y, c); dot(P, x, y - 1, lt(c, 0.06)); dot(P, x + 1, y - 1, c); break; }
      case 'cross': glyph(P, 'plus', x - 1, y - 1, ex || '#60e070', '#e0ffe0'); break;
      case 'line': { const [a2, dx2 = 0, dy2 = 0, c] = ex; const b = fxAnchor(r, a2); const [x2, y2] = toRaw([b[0] + dx2 * sg, b[1] + dy2]); for (const [i, j] of linePts([x, y], [x2, y2])) dot(P, i, j, c || '#e8e8e0'); break; }
      case 'arc': { // 残像：前のコマの角度 a0 から今の角度 a1 まで、武器の先の通り道（武器の後ろ側だけ）
        const [a0, a1, R] = ex; const n = Math.max(3, Math.round(Math.abs(a1 - a0) / 10));
        for (let i = 0; i < n; i++) { const a = (a0 + (a1 - a0) * i / n) * D2R; for (const rr of [R, R - 1]) { const px = base[0] + Math.sin(a) * sg * rr, py = base[1] + Math.cos(a) * rr; const [qx, qy] = toRaw([px, py]); dot(P, qx, qy, rr === R ? '#e8f0ff' : '#c8d8f0'); } }
        break;
      }
      case 'ring': { const ph = ex || 0; for (let i = 0; i < 16; i++) { if ((i + ph) % 3 === 0) continue; const a = i / 16 * Math.PI * 2; const [qx, qy] = toRaw([8 + Math.cos(a) * 7.5, FEET + Math.sin(a) * 1.6]); dot(P, qx, qy, '#b890ff'); } break; }
      case 'arrow': { for (let i = 0; i < 4; i++) dot(P, x + i * fs * sg, y, '#c8a878'); dot(P, x + 4 * fs * sg, y, '#dce0e8'); dot(P, x - fs * sg, y - 1, '#f0f0f0'); break; }
      case 'balls': { const ph = ex || 0; const cs = ['#e04040', '#40a0e0', '#f0d040']; for (let i = 0; i < 3; i++) { const a = ((i / 3) + ph / 4) * Math.PI * 2; dot(P, x + Math.round(Math.cos(a) * 3), y - 4 + Math.round(Math.sin(a) * 2), cs[i]); } break; }
      case 'orbshot': { const c = ex || '#80f0ff'; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if (i * j === 0) dot(P, x + i, y + j, c, true); dot(P, x, y, '#ffffff', true); dot(P, x - 2 * fs * sg, y, lt(c, 0.1)); dot(P, x - 3 * fs * sg, y, c); break; } // 魔法の光の玉（尾を引く）
      case 'rays': { const c = ex || '#fff4b0'; for (const ox of [-6, 6]) for (let j = 0; j < 8; j += 2) dot(P, x + ox, y + 4 + j, c); dot(P, x, y - 3, c); dot(P, x - 1, y - 2, c); dot(P, x + 1, y - 2, c); break; } // 祈りの光の柱
      case 'loop': { const ph = ex || 0; for (let i = 0; i < 12; i++) { if ((i + ph) % 4 === 0) continue; const a = i / 12 * Math.PI * 2; dot(P, x + Math.round(Math.cos(a) * 4), y - 3 + Math.round(Math.sin(a) * 1.5), '#c8a860'); } break; }
    }
  }
}

// ================================================================ 姿勢の定義
// pose(v, k, c)：v は 'F' 'S' 'B'、k はコマ番号、c は人の情報（stage, kid, elder, outfit, item, wk…）
// 姿勢 q のキー：legs('stand'|'w0'|'w2'|'wide'|'kneel'|'kneel2'|'squat'|'sit')、dy(胴の沈み)、jump、lean(横向きの前傾・正面ではうなずき)、
//   headDy、T、O（腕）、tools（道具）、item（'keep'|false）、face、fx、prop、ph、lie、white、gray、view（'F'|'L'|'B'|'R'）
const A = (a, b, r) => ({ a, b: b ?? a, r: r ?? 1 });
const AT = (at, dx = 0, dy = 0, o) => ({ at, dx, dy, ...o });
const TO = (k) => ({ to: 'tool', k });
const TL = (k, a, o) => ({ k, a, ...o });
const FB = (v) => v !== 'S';

// ---- 攻撃（武器の種類ごと）
const ATTACK = {
  slash: {
    durs: [180, 60, 200, 120],
    pose(v, k, c) {
      const w = c.wk.tool;
      if (v === 'S') return [
        { legs: 'wide', lean: -1, T: A(200, 215), O: A(40, 70), tools: TL(w, 225) },
        { legs: 'wide', T: A(140, 120), O: A(20, 40), tools: TL(w, 130), fx: [['arc', 'T', 0, 0, [225, 130, len(w, c)]]] },
        { legs: 'wide', lean: 1, dy: 1, T: A(85, 70), O: A(-30, -10), tools: TL(w, 60), fx: [['arc', 'T', 0, 0, [130, 60, len(w, c)]], ...(w === 'holy' ? [['spark', 'tip']] : [])] },
        { legs: 'stand', T: A(40, 70), tools: TL(w, 120) },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: A(150, 170), O: A(20), tools: TL(w, 200) },
        { legs: 'wide', T: AT('chest', 1, 0), O: A(20), tools: TL(w, 270, { behind: bh }), fx: [['arc', 'T', 0, 0, [200, 270, len(w, c)]]] },
        { legs: 'wide', dy: 1, T: AT('belly', -1, 1), O: A(30), tools: TL(w, 315, { behind: bh }), fx: [['arc', 'T', 0, 0, [270, 315, len(w, c)]]] },
        { legs: 'stand', T: A(30, 0), tools: TL(w, 150) },
      ][k];
    },
  },
  heavy: {
    durs: [260, 80, 280, 160],
    pose(v, k, c) {
      const w = c.wk.tool;
      if (v === 'S') return [
        { legs: 'wide', lean: -1, T: A(190, 200), O: TO(-2), tools: TL(w, 210) },
        { legs: 'wide', T: A(170, 150), O: TO(-2), tools: TL(w, 150), fx: [['arc', 'T', 0, 0, [210, 150, len(w, c)]]] },
        { legs: 'wide', lean: 2, dy: 1, T: A(80, 60), O: TO(-2), tools: TL(w, 45), fx: [['arc', 'T', 0, 0, [150, 45, len(w, c)]], ['dots', 'tip', 0, 0, ['#b8a888', '#8a7a60']]] },
        { legs: 'wide', dy: 1, T: A(50, 70), O: TO(-2), tools: TL(w, 80) },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: A(160, 180), O: TO(-2), tools: TL(w, 185) },
        { legs: 'wide', T: A(170, 190), O: TO(-2), tools: TL(w, 180) },
        { legs: 'wide', dy: 1, T: AT('belly', 0, 1), O: TO(-2), tools: TL(w, 40, { behind: bh }), fx: [['dots', 'tip', 0, 0, ['#b8a888', '#8a7a60']]] },
        { legs: 'wide', T: AT('belly'), O: TO(-2), tools: TL(w, 60, { behind: bh }) },
      ][k];
    },
  },
  thrust: {
    durs: [200, 70, 200, 150],
    pose(v, k, c) {
      const w = c.wk.tool;
      if (v === 'S') return [
        { legs: 'wide', lean: -1, T: A(-10, 60), O: TO(4), tools: TL(w, 95) },
        { legs: 'wide', lean: 2, T: A(70, 90), O: TO(4), tools: TL(w, 92), fx: [['spark', 'tip', 1, 0]] },
        { legs: 'wide', lean: 2, T: A(70, 90), O: TO(4), tools: TL(w, 92) },
        { legs: 'stand', T: A(10, 50), O: TO(4), tools: TL(w, 130) },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: AT('belly', 2, 0), O: TO(3), tools: TL(w, 170, { s: 0.8 }) },
        { legs: 'wide', dy: 1, T: AT('chest', 1, 1), O: TO(-3), tools: TL(w, 20, { s: 0.55, behind: bh }), fx: bh ? [] : [['spark', 'tip']] },
        { legs: 'wide', dy: 1, T: AT('chest', 1, 1), O: TO(-3), tools: TL(w, 20, { s: 0.55, behind: bh }) },
        { legs: 'stand', T: A(10), tools: TL(w, 178) },
      ][k];
    },
  },
  stab: {
    durs: [90, 140, 90, 140],
    pose(v, k, c) {
      const w = c.wk.tool;
      if (v === 'S') return [
        { legs: 'wide', T: A(20, 80), tools: TL(w, 90) },
        { legs: 'wide', lean: 1, T: A(80, 90), tools: TL(w, 90), fx: [['spark', 'tip', 1, 0]] },
        { legs: 'wide', T: A(10, 60), O: A(60, 90), tools: TL(w, 100) },
        { legs: 'wide', lean: 1, T: A(85, 95), tools: TL(w, 95), fx: [['spark', 'tip', 1, 0]] },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: A(40, 20), tools: TL(w, 160) },
        { legs: 'wide', dy: 1, T: AT('chest', 0, 1), tools: TL(w, 30, { s: 0.7, behind: bh }), fx: bh ? [] : [['spark', 'tip']] },
        { legs: 'wide', T: A(40, 20), O: A(30, 0), tools: TL(w, 160) },
        { legs: 'wide', dy: 1, T: AT('chest', 1, 1), tools: TL(w, 20, { s: 0.7, behind: bh }), fx: bh ? [] : [['spark', 'tip']] },
      ][k];
    },
  },
  punch: {
    durs: [120, 150, 100, 150],
    pose(v, k) {
      if (v === 'S') return [
        { legs: 'wide', T: A(40, 150), O: A(50, 150) },
        { legs: 'wide', lean: 1, T: A(90, 90), O: A(40, 150), fx: [['spark', 'T', 2, 0]] },
        { legs: 'wide', T: A(40, 150), O: A(50, 150) },
        { legs: 'wide', lean: 1, T: A(40, 150), O: A(90, 90), fx: [['spark', 'O', 2, 0]] },
      ][k];
      return [
        { legs: 'wide', T: AT('chest', 1, -1), O: AT('chest', 1, -1) },
        { legs: 'wide', dy: 1, T: AT('chest', -1, 1), O: AT('chest', 1, -1), fx: v === 'F' ? [['spark', 'T', 0, 1]] : [] },
        { legs: 'wide', T: AT('chest', 1, -1), O: AT('chest', 1, -1) },
        { legs: 'wide', dy: 1, T: AT('chest', 1, -1), O: AT('chest', -1, 1), fx: v === 'F' ? [['spark', 'O', 0, 1]] : [] },
      ][k];
    },
  },
  shoot: {
    durs: [180, 300, 100, 180],
    pose(v, k) {
      if (v === 'S') return [
        { O: A(80, 90), T: A(60, 90), tools: TL('bow', 90, { h: 'O', str: 'T' }) },
        { legs: 'wide', O: A(88, 90), T: AT('cheek'), tools: TL('bow', 90, { h: 'O', str: 'T', arrow: true }) },
        { legs: 'wide', O: A(88, 90), T: A(-40, -80), tools: TL('bow', 90, { h: 'O' }), fx: [['arrow', 'tipO', 3, 0]] },
        { O: A(40, 60), T: A(10), tools: TL('bow', 60, { h: 'O' }) },
      ][k];
      return [
        { O: AT('chest', 2, 0), T: AT('chest', 0, 1), tools: TL('bow', 90, { h: 'O', str: 'T' }) },
        { legs: 'wide', O: AT('chest', 3, 0), T: AT('cheek'), tools: TL('bow', 90, { h: 'O', str: 'T', arrow: true }) },
        { legs: 'wide', O: AT('chest', 3, 0), T: A(40, 60), tools: TL('bow', 90, { h: 'O' }), fx: [['arrow', 'tipO', 2, 0]] },
        { O: A(20, 0), T: A(10), tools: TL('bow', 20, { h: 'O' }) },
      ][k];
    },
  },
  cast: {
    durs: [220, 120, 240, 160],
    pose(v, k, c) {
      const w = c.wk.tool || 'staff';
      if (v === 'S') return [
        { T: A(150, 175), tools: TL(w, 180), fx: [['spark', 'tip', 0, -1, c.orb]] },
        { T: A(110, 100), O: A(70, 90), tools: TL(w, 115), fx: [['glow', 'tip', 0, 0, c.orb]] },
        { lean: 1, T: A(100, 95), O: A(80, 95), tools: TL(w, 100), fx: [['burst', 'tip', 3, 0, c.orb]] },
        { T: A(30, 40), tools: TL(w, 170) },
      ][k];
      return [
        { T: A(150, 175), tools: TL(w, 180), fx: [['spark', 'tip', 0, -1, c.orb]] },
        { T: A(120, 160), O: A(120, 160), tools: TL(w, 180), fx: [['glow', 'tip', 0, 0, c.orb]] },
        { dy: 1, T: A(110, 150), O: A(100, 130), tools: TL(w, 175), fx: [['burst', 'tip', 0, -2, c.orb], ['ring', 'feet', 0, 0, 0]] },
        { T: A(20, 10), tools: TL(w, 178) },
      ][k];
    },
  },
};
// ---- 冒険者の職業ごとの攻撃（advclass.js）：魔法使いは光の玉、魔導士は魔導書、僧侶は祈りの光
ATTACK.spell = {
  durs: [200, 120, 160, 220],
  pose(v, k, c) {
    const q = ATTACK.cast.pose(v, k, c);
    const fx = (q.fx || []).slice();
    if (k === 2) fx.push(['orbshot', 'tip', v === 'S' ? 4 : 0, v === 'S' ? 0 : -4, c.orb]);
    if (k === 3) fx.push(['orbshot', 'tip', v === 'S' ? 8 : 0, v === 'S' ? 0 : -8, c.orb]);
    return { ...q, fx };
  },
};
ATTACK.tome = {
  durs: [240, 120, 200, 220],
  pose(v, k) {
    const book = TL('tome', 0, { h: 'O', ph: k & 1 });
    if (v === 'S') return [
      { O: AT('fwd', -1, 1), T: A(60, 90), tools: book, fx: [['glow', 'T', 0, 0, '#80f0ff']] },
      { O: AT('fwd', -1, 1), T: A(90, 90), tools: book, fx: [['spark', 'T', 1, 0, '#80f0ff']] },
      { lean: 1, O: AT('fwd', -1, 1), T: A(95, 95), tools: book, fx: [['orbshot', 'T', 4, 0, '#80f0ff']] },
      { O: AT('fwd', -1, 1), T: A(40, 60), tools: book, fx: [['orbshot', 'T', 8, 0, '#80f0ff'], ['glow', 'O', 0, -1, '#c0a0ff']] },
    ][k];
    return [
      { O: AT('chest', 1, 1), T: A(120, 150), tools: book, fx: [['glow', 'T', 0, 0, '#80f0ff']] },
      { O: AT('chest', 1, 1), T: A(150, 175), tools: book, fx: [['spark', 'T', 0, -1, '#80f0ff']] },
      { dy: 1, O: AT('chest', 1, 1), T: A(140, 170), tools: book, fx: [['orbshot', 'T', 0, -3, '#80f0ff'], ['ring', 'feet', 0, 0, 1]] },
      { O: AT('chest', 1, 1), T: A(30, 10), tools: book, fx: [['orbshot', 'T', 0, -8, '#80f0ff']] },
    ][k];
  },
};
ATTACK.bless = {
  durs: [260, 160, 260, 220],
  pose(v, k) {
    const w = 'holystaff';
    if (v === 'S') return [
      { T: A(150, 175), O: AT('chest'), tools: TL(w, 180), fx: [['glow', 'tip', 0, 0, '#fff4b0']] },
      { T: A(160, 178), O: AT('chest'), tools: TL(w, 180), face: { e: 'c' }, fx: [['cross', 'tip', 0, -2, '#fff080'], ['glow', 'tip', 0, 0, '#fff4b0']] },
      { T: A(160, 178), O: A(100, 120), tools: TL(w, 180), fx: [['rays', 'head', 0, 0, '#fff4b0'], ['cross', 'tip', 0, -2, '#fff080']] },
      { T: A(30, 40), tools: TL(w, 170) },
    ][k];
    return [
      { T: A(150, 175), O: AT('chest', 1, 0), tools: TL(w, 180), fx: [['glow', 'tip', 0, 0, '#fff4b0']] },
      { T: A(165, 178), O: AT('chest', 1, 0), tools: TL(w, 180), face: { e: 'c' }, fx: [['cross', 'tip', 0, -2, '#fff080'], ['glow', 'tip', 0, 0, '#fff4b0']] },
      { T: A(165, 178), O: A(120, 150), tools: TL(w, 180), fx: [['rays', 'head', 0, 0, '#fff4b0'], ['cross', 'tip', 0, -2, '#fff080'], ['ring', 'feet', 0, 0, 2]] },
      { T: A(20, 10), tools: TL(w, 178) },
    ][k];
  },
};
const ADV_WK = { adv_swordsman: ['heavy', 'greatsword'], adv_squire: ['slash', 'sword'], adv_monk: ['punch', null], adv_wizard: ['spell', 'staff'], adv_sorcerer: ['tome', 'tome'], adv_priest: ['bless', 'holystaff'], adv_thief: ['stab', 'dagger'] };
function advWeapon(p, pt) {
  if (pt.outfit === 'adv_hero') return p?.eq?.weapon?.id === 'holysword' ? { motion: 'slash', tool: 'holy' } : { motion: 'slash', tool: 'sword' };
  if (pt.outfit === 'adv_bandit') { const r = ITEM_MOTION[pt.item] || ['slash', 'axe']; return { motion: r[0], tool: r[1] }; }
  const r = ADV_WK[pt.outfit];
  return r ? { motion: r[0], tool: r[1] } : null;
}
function len(w, c) { const T = TOOL[w]; return Math.round((T ? T.len : 5) * (c.kid ? 0.72 : 1)); }
// 装備 → 攻撃の動き。装備がなければ職業の持ち物、それもなければ素手
const WEAPON_MOTION = { dagger: ['stab', 'dagger'], sword: ['slash', 'sword'], longsword: ['slash', 'longsword'], greatsword: ['heavy', 'greatsword'], spear: ['thrust', 'spear'], axe: ['slash', 'axe'], mace: ['slash', 'mace'], bow: ['shoot', 'bow'], staff: ['cast', 'staff'], dragonblade: ['slash', 'dragon'], holysword: ['slash', 'holy'] };
const ITEM_MOTION = { sword: ['slash', 'sword'], spear: ['thrust', 'spear'], bow: ['shoot', 'bow'], axe: ['slash', 'axe'], bigaxe: ['heavy', 'bigaxe'], dagger: ['stab', 'dagger'], mace: ['slash', 'mace'], staff: ['cast', 'staff'], club: ['slash', 'club'], cleaver: ['stab', 'cleaver'], pitchfork: ['thrust', 'pitchfork'] };
export function weaponOf(p, item) {
  const r = WEAPON_MOTION[p?.eq?.weapon?.id] || ITEM_MOTION[item] || ['punch', null];
  return { motion: r[0], tool: r[1] };
}

// ---- 会話の所作（身分・職業で変える）
function talkStyle(p, c) {
  if (c.kid) return 'kid';
  const o = c.outfit;
  if (o === 'king' || o === 'royal' || p.rank === 'king' || p.rank === 'royal') return 'king';
  if (['noble', 'chancellor', 'courtmage', 'treasurer'].includes(o) || p.rank === 'noble') return 'noble';
  if (['merchant', 'changer', 'swindler', 'jeweler', 'innkeeper', 'brewer'].includes(o)) return 'merchant';
  if (['knight', 'soldier', 'guard', 'royalguard', 'general', 'paladin', 'watchman', 'gatekeeper', 'militia', 'jailer'].includes(o)) return 'soldier';
  if (['scholar', 'priest', 'wizard', 'sage', 'adv_priest', 'adv_wizard', 'adv_sorcerer', 'teacher', 'elder', 'scribe', 'nun', 'cleric', 'doctor', 'alchemist', 'fortune'].includes(o)) return 'scholar';
  if (o === 'beggar' || o === 'prisoner') return 'beggar';
  return 'plain';
}
const MO = { m: 'o' };

// ---- 生活・状態のアニメ
// ほかのファイル（anim_justice.js など）から足す動きと、行動→動きの判定
const EXTRA_LIFE = {};
export function registerPersonAnims(make) { Object.assign(EXTRA_LIFE, make({ A, AT, TL, TO, MO })); }
export const ANIM_STATE_HOOKS = [];
const LIFE = {
  idle: {
    durs: [520, 380, 520, 140],
    pose: (v, k) => [{}, { dy: 1 }, {}, { face: { e: 'c' } }][k],
  },
  talk: {
    durs: [200, 200, 200, 200],
    pose(v, k, c) {
      const open = k & 1 ? MO : null, S = v === 'S';
      switch (c.talk) {
        case 'king': return [
          { lean: S ? -1 : 0, O: AT('hip') },
          { lean: S ? -1 : 0, O: A(110, 95), face: MO },
          { lean: S ? -1 : 0, O: AT('hip') },
          { lean: S ? -1 : 0, O: A(100, 80), face: MO },
        ][k];
        case 'noble': return [{ O: AT('chest', -1, 0) }, { O: A(70, 110), face: MO }, { O: AT('chest', -1, 0) }, { O: A(60, 90), face: MO }][k];
        case 'merchant': return { lean: S ? 1 : 0, headDy: 0, T: AT('belly', 0, k & 1 ? -1 : 0), O: AT('belly', 0, k & 1 ? 0 : -1), face: { m: open ? 'o' : 's' } };
        case 'soldier': return [{}, { face: MO }, { headDy: 1 }, { face: MO }][k];
        case 'scholar': return [{ O: A(40, 100) }, { O: A(150, 178, 0.95), face: MO }, { O: A(40, 100) }, { O: A(150, 178, 0.95), face: MO }][k];
        case 'kid': return [{ O: A(90, 140) }, { jump: 1, O: A(120, 160), face: MO }, { O: A(90, 140) }, { face: MO }][k];
        case 'beggar': return { lean: 1, headDy: 1, T: AT('fwd', 0, 1), O: AT('fwd', 0, 1), face: open };
        default: return [{ O: A(30, 80) }, { O: A(40, 110), face: MO }, { O: A(10, 30) }, { O: A(30, 90), face: MO }][k];
      }
    },
  },
  hurt: {
    durs: [110, 240], loop: false,
    pose(v, k, c) {
      const keep = c.wk.motion !== 'punch' ? { tools: TL(c.wk.tool === 'bow' ? 'bow' : c.wk.tool, 150, c.wk.tool === 'bow' ? { h: 'O' } : {}) } : {};
      if (!c.fighter) Object.assign(keep, { item: 'keep' });
      if (v === 'S') return [
        { lean: -1, T: A(-30, -20), O: A(-30, -20), white: 0.55, face: { e: 'c', m: 'O' }, fx: [['spark', 'chest', 2, 0, '#ffffff']], ...keep },
        { lean: -1, T: A(-15), O: A(-15), face: { e: 'c', m: 'o' }, ...keep },
      ][k];
      return [
        { T: A(40, 30), O: A(40, 30), white: 0.55, face: { e: 'c', m: 'O' }, fx: v === 'F' ? [['spark', 'chest', 0, 1, '#ffffff']] : [], ...keep },
        { dy: 1, T: A(20), O: A(20), face: { e: 'c', m: 'o' }, ...keep },
      ][k];
    },
  },
  dying: {
    durs: [420, 300, 420, 300],
    pose(v, k) {
      const base = { legs: 'kneel', T: AT('chest'), O: v === 'S' ? A(45, 0) : A(20), face: { e: k === 2 ? 'c' : undefined, m: 'o' }, fx: k === 0 ? [['sweat', 'head']] : [] };
      if (v === 'S') return { ...base, lean: k === 2 ? 2 : 1, dy: k & 1 };
      return { ...base, headDy: 1, dy: k & 1 };
    },
  },
  death: {
    durs: [150, 320, 320, 1400], loop: false,
    pose(v, k) {
      if (k === 0) return v === 'S' ? { lean: -1, T: A(-30, -20), O: A(-30, -20), white: 0.55, face: { e: 'c', m: 'O' } } : { T: A(40, 30), O: A(40, 30), white: 0.55, face: { e: 'c', m: 'O' } };
      if (k === 1) return { legs: 'kneel', lean: v === 'S' ? -1 : 0, T: A(-15), O: A(-15), face: { e: 'c', m: 'o' } };
      if (k === 2) return { legs: 'kneel2', lean: 2, T: A(30), O: A(30), face: { e: 'c' } };
      return { lie: true, face: { e: 'c' }, gray: 0.35 };
    },
  },
  dead: { durs: [1000], loop: false, pose: () => ({ lie: true, face: { e: 'c' }, gray: 0.5 }) },
  eat: {
    durs: [320, 260, 300, 260],
    pose(v, k) {
      const tools = [TL('bowl', 0, { h: 'O' }), TL('bread', 0, { h: 'T' })];
      return [
        { T: AT('chest'), O: AT('chest', 0, 1), tools },
        { T: AT('mouth', 0, 0, { late: true }), O: AT('chest', 0, 1), tools, face: MO },
        { T: AT('chest'), O: AT('chest', 0, 1), tools },
        { dy: 1, T: AT('chest'), O: AT('chest', 0, 1), tools, face: { m: 'f' } },
      ][k];
    },
  },
  drink: {
    durs: [400, 250, 520, 320],
    pose(v, k) {
      return [
        { T: AT('chest'), tools: TL('mug', 0) },
        { T: AT('mouth', 0, 1, { late: true }), tools: TL('mug', 0) },
        { lean: v === 'S' ? -1 : 0, T: AT('mouth', 0, 0, { late: true }), tools: TL('mug', 0, { tilt: 1 }), face: { e: 'c', blush: true } },
        { T: AT('chest'), tools: TL('mug', 0), face: { m: 'O', blush: true } },
      ][k];
    },
  },
  sleep: { durs: [700, 700, 700], pose: (v, k) => ({ lie: true, dy: k === 1 ? 1 : 0, face: { e: 'c' }, zzz: k + 1 }) },
  sit: {
    durs: [620, 420, 620, 140],
    pose: (v, k) => ({ legs: 'sit', T: AT('lap'), O: AT('lap', 1, 0), dy: k === 1 ? 1 : 0, face: k === 3 ? { e: 'c' } : null, item: false }),
  },
  pray: {
    durs: [700, 600, 700],
    pose: (v, k) => ({ legs: 'kneel2', lean: 1, headDy: 1, T: AT('chest', 0, -1), O: AT('chest', 0, -1), dy: k === 1 ? 1 : 0, face: { e: 'c' }, fx: k === 2 ? [['spark', 'head', 0, -1, '#fff0a0']] : [] }),
  },
  cry: {
    durs: [260, 260, 260, 260],
    pose(v, k) {
      if (k < 2) return { lean: 1, headDy: 1, dy: k, T: AT('eye', 0, 0, { late: true }), O: AT('eye', 0, 0, { late: true }), face: { e: 'c', tear: k + 1 } };
      return { lean: 1, headDy: 1, dy: k - 2, T: AT('eye', 0, 0, { late: true }), O: A(10), face: { e: 'c', m: 'f', tear: 2 } };
    },
  },
  cheer: {
    durs: [140, 160, 240, 160],
    pose: (v, k) => [
      { dy: 1, T: A(20), O: A(20), face: { m: 's' } },
      { jump: 2, T: A(160, 175), O: A(160, 175), face: { e: 'c', m: 'O' } },
      { jump: 3, T: A(170, 180), O: A(170, 180), face: { e: 'c', m: 'O' }, fx: [['heart', 'head', 3, -2]] },
      { jump: 1, T: A(140, 160), O: A(140, 160), face: { m: 's' } },
    ][k],
  },
  wave: {
    durs: [220, 220, 220, 220],
    pose: (v, k) => ({ O: k & 1 ? A(150, 140) : A(150, 175), face: { m: 's' } }),
  },
  play: {
    durs: [120, 120, 120, 120],
    pose: (v, k) => [
      { legs: 'w0', jump: 1, T: A(40, 70), O: A(-30, -10), face: { m: 's' } },
      { legs: 'stand', jump: 2, T: A(120, 150), O: A(120, 150), face: { m: 'O' } },
      { legs: 'w2', jump: 1, O: A(40, 70), T: A(-30, -10), face: { m: 's' } },
      { legs: 'stand', dy: 1, T: A(20), O: A(20), face: { m: 's' } },
    ][k],
  },
  flee: {
    durs: [90, 90, 90, 90],
    pose: (v, k) => [
      { legs: 'w0', lean: 1, T: A(150, 190), O: A(140, 170), face: { m: 'O' }, fx: [['sweat', 'head']] },
      { legs: 'stand', lean: 1, jump: 1, T: A(170, 160), O: A(160, 190), face: { m: 'O' } },
      { legs: 'w2', lean: 1, T: A(140, 170), O: A(150, 190), face: { m: 'O' }, fx: [['sweat', 'head']] },
      { legs: 'stand', lean: 1, jump: 1, T: A(160, 190), O: A(170, 160), face: { m: 'O' } },
    ][k],
  },
  beg: {
    durs: [800, 500, 800],
    pose: (v, k) => ({ legs: 'kneel2', lean: k === 2 ? 2 : 1, headDy: 1, dy: k === 1 ? 1 : 0, T: AT('fwd', k === 2 ? 1 : 0, 1), O: AT('fwd', k === 2 ? 1 : 0, 1), tools: TL('bowl', 0) }),
  },
};

// ---- 仕事の動き
// 振り下ろす仕事（鍬・斧・つるはし・金槌・包丁）
function swing(tool, o = {}) {
  const two = o.two !== false, prop = o.prop, hit = o.hit ?? 45, fxc = o.fx || ['#8a6a4a', '#6a5040'];
  return {
    durs: [260, 100, 220, 180],
    pose(v, k) {
      const O = two ? TO(-2) : (o.hold ? AT('fwd', 0, 2) : A(20));
      if (v === 'S') return [
        { legs: 'wide', lean: -1, T: A(175, 190), O, tools: TL(tool, 205), prop, ph: 0 },
        { legs: 'wide', T: A(130, 120), O, tools: TL(tool, 140), prop, ph: 0 },
        { legs: 'wide', lean: 1, dy: 1, T: o.T2 || A(70, 50), O, tools: TL(tool, hit), prop, ph: 1, fx: [['dots', 'tip', 0, -1, fxc]] },
        { legs: 'wide', T: A(90, 100), O, tools: TL(tool, 110), prop, ph: 1 },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: A(160, 175), O, tools: TL(tool, 185), prop, ph: 0 },
        { legs: 'wide', T: A(120, 130), O, tools: TL(tool, 160), prop, ph: 0 },
        { legs: 'wide', dy: 1, T: AT('belly', -1, 0), O, tools: TL(tool, o.hitF ?? 20, { behind: bh }), prop, ph: 1, fx: bh ? [] : [['dots', 'tip', 0, -1, fxc]] },
        { legs: 'wide', T: AT('chest', 1, 0), O, tools: TL(tool, 120), prop, ph: 1 },
      ][k];
    },
  };
}
// 前で手を動かす仕事（こねる・縫う・読む・書く…）：frames は [T, O, 追加] の4組
function hands4(fn, durs = [300, 300, 300, 300]) { return { durs, pose: fn }; }

const WORK = {
  hoe: swing('hoe', { fx: ['#8a6a4a', '#5a7a3a'] }),
  chop: swing('woodaxe', { prop: 'log', hit: 60, fx: ['#d0a870', '#b08a5a'], hitF: 30 }),
  pick: swing('pick', { prop: 'rock', hit: 55, fx: ['#c8c4bc', '#fff4a0'], hitF: 25 }),
  smith: swing('hammer', { two: false, hold: true, prop: 'anvil', hit: 60, T2: A(60, 30), fx: ['#ffd040', '#ff8030'], hitF: 30 }),
  butcher: swing('cleaver', { two: false, hold: true, prop: 'block', hit: 70, T2: A(60, 40), fx: ['#c04a4a', '#e8d8c8'], hitF: 30 }),
  dig: {
    durs: [240, 200, 260, 220],
    pose(v, k) {
      const t = 'shovel', fx = ['#7a5a3a', '#5a4430'];
      if (v === 'S') return [
        { legs: 'wide', lean: 1, T: A(40, 20), O: TO(-3), tools: TL(t, 20) },
        { legs: 'wide', lean: 1, dy: 1, T: A(30, 10), O: TO(-3), tools: TL(t, 40) },
        { legs: 'wide', T: A(80, 110), O: TO(-3), tools: TL(t, 110), fx: [['dots', 'tip', 0, 0, fx]] },
        { legs: 'wide', lean: -1, T: A(140, 160), O: TO(-3), tools: TL(t, 160), fx: [['dots', 'tip', -1, -3, fx]] },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: AT('belly', 1, 1), O: TO(-3), tools: TL(t, 10, { behind: bh }) },
        { legs: 'wide', dy: 1, T: AT('belly', 1, 2), O: TO(-3), tools: TL(t, 15, { behind: bh }) },
        { legs: 'wide', T: AT('chest', 1, 0), O: TO(-3), tools: TL(t, 150), fx: [['dots', 'tip', 0, 0, fx]] },
        { legs: 'wide', T: A(150, 170), O: TO(-3), tools: TL(t, 170), fx: [['dots', 'tip', 0, -3, fx]] },
      ][k];
    },
  },
  pitch: null, // 下で dig から作る（干し草）
  sweep: {
    durs: [220, 200, 220, 200],
    pose(v, k) {
      const a = [30, 15, 0, 15][k];
      if (v === 'S') return { T: A(30 + k % 2 * 10, 20), O: TO(-4), tools: TL('broom', a), fx: k === 0 ? [['puff', 'tip', 2, -1, '#d8d0c0']] : [] };
      const af = [25, 5, -15, 5][k];
      return { T: AT('belly', k === 2 ? -1 : 1, 0), O: TO(-4), tools: TL('broom', af, { behind: v === 'B' }), fx: k === 0 && v === 'F' ? [['puff', 'tip', 2, 0, '#d8d0c0']] : [] };
    },
  },
  saw: hands4((v, k) => {
    const fw = k & 1;
    if (v === 'S') return { legs: 'wide', lean: fw, T: fw ? A(70, 95) : A(50, 80), O: A(60, 90), tools: TL('saw', 100), prop: 'sawhorse', fx: fw ? [['dots', 'tip', -1, 1, ['#e8c890', '#c8a070']]] : [] };
    return { legs: 'wide', T: AT('belly', 1, fw ? 1 : -1), O: AT('belly', -2, 1), tools: TL('saw', 15, { behind: v === 'B' }), prop: 'sawhorse', fx: fw && v === 'F' ? [['dots', 'tip', 0, 0, ['#e8c890', '#c8a070']]] : [] };
  }, [180, 180, 180, 180]),
  knead: hands4((v, k) => {
    const p = k & 1;
    if (v === 'S') return { lean: p, T: AT('fwd', p, 2 + p), O: AT('fwd', p - 1, 2 + p), prop: 'table', ph: p };
    return { T: AT('belly', 1 - p, 1 + p), O: AT('belly', 1 - p, 1 + p), prop: 'table', ph: p, headDy: 1 };
  }, [260, 300, 260, 300]),
  wash: hands4((v, k) => {
    const p = k & 1;
    return { legs: 'squat', lean: 1, T: AT('low', p, -p), O: AT('low', 1 - p, p - 1), tools: TL('cloth', 0), prop: 'tub', ph: p, fx: p ? [['dots', 'T', 0, -2, ['#bfe8ff', '#8ad0ff']]] : [] };
  }, [220, 220, 220, 220]),
  sew: hands4((v, k) => {
    const up = k & 1;
    return { O: AT('chest', 0, 1), T: up ? A(60, 130) : AT('chest', 0, 1), tools: [TL('cloth', 0, { h: 'O' }), TL('needle', 0)], dy: k === 3 ? 1 : 0, headDy: 1, fx: up ? [['line', 'T', 0, 0, ['O', 0, 0, '#e8e0d0']]] : [] };
  }, [300, 260, 300, 260]),
  read: hands4((v, k) => ({ headDy: 1, T: AT('chest', 0, k === 2 ? 0 : 1), O: AT('chest', 0, 1), tools: TL('openbook', 0, { ph: k === 2 ? 1 : 0 }), face: k === 1 ? { e: 'c' } : null }), [700, 160, 260, 600]),
  scroll: hands4((v, k) => ({ T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('openscroll', 0), face: k & 1 ? MO : null, lean: v === 'S' ? -1 : 0 }), [260, 260, 260, 260]),
  write: hands4((v, k) => ({ headDy: 1, O: AT('chest', 0, 1), T: AT('chest', [0, -1, 0, 1][k], [0, 1, 1, 0][k]), tools: [TL('openscroll', 0, { h: 'O' }), TL('quill', 170)] }), [220, 220, 220, 300]),
  coins: hands4((v, k) => [
    { T: AT('belly'), O: AT('belly'), face: { m: 's' } },
    { T: AT('belly', 0, -1), O: AT('belly', 0, 1), face: { m: 's' } },
    { T: A(60, 140), O: AT('belly'), face: MO, fx: [['coin', 'T', 0, -4]] },
    { T: A(60, 120), O: AT('belly'), face: { m: 's' }, fx: [['coin', 'T', 0, -2]] },
  ][k], [220, 220, 260, 200]),
  pray: hands4((v, k) => [
    { headDy: 1, T: AT('chest', 0, -1), O: AT('chest', 0, -1), face: { e: 'c' } },
    { headDy: 1, dy: 1, T: AT('chest', 0, -1), O: AT('chest', 0, -1), face: { e: 'c' } },
    { T: A(120, 150), O: A(120, 150), face: { e: 'c' }, fx: [['spark', 'head', 0, -2, '#fff0a0']] },
    { T: A(100, 140), O: A(100, 140), face: { e: 'c' }, fx: [['glow', 'head', 0, -2, '#fff0a0']] },
  ][k], [700, 500, 600, 400]),
  cradle: hands4((v, k) => ({ T: AT('chest', [1, 0, -1, 0][k], 1), O: AT('chest', [-1, 0, 1, 0][k], 1), tools: TL('baby', 0), face: { m: 's', e: k === 2 ? 'c' : undefined } }), [400, 400, 400, 400]),
  grind: hands4((v, k) => ({ O: AT('belly'), T: AT('belly', [0, 1, 0, -1][k], -2 + (k & 1)), tools: [TL('mortar', 0, { h: 'O' }), TL('pestle', 180)], headDy: 1, fx: k === 1 ? [['dots', 'O', 0, -1, ['#6ac050', '#4a9a3a']]] : [] }), [220, 220, 220, 220]),
  heal: hands4((v, k) => ({ legs: 'kneel', lean: 1, T: AT('low', k & 1, 0), O: AT('low', 1, -1), tools: TL('cloth', 0), fx: k === 2 ? [['cross', 'T', 0, -3]] : [] }), [400, 400, 400, 400]),
  potter: hands4((v, k) => ({ legs: 'squat', lean: 1, T: AT('low', 0, -1), O: AT('low', 1, -1), prop: 'wheel', ph: k & 1 }), [200, 200, 200, 200]),
  stir: hands4((v, k) => ({ T: AT('fwd', [0, 1, 0, -1][k], 1), O: A(10), tools: TL('ladle', 10), prop: 'pot', ph: k & 1, fx: [['puff', 'tip', 0, -4 - (k & 1), '#e8e8ec']] }), [240, 240, 240, 240]),
  flask: hands4((v, k) => ({ T: A(100, 160 + (k & 1) * 10), O: A(20), tools: TL('flask', 0), face: { m: k === 2 ? 'o' : undefined }, fx: [['glow', 'T', 0, -4 - (k & 1), '#a0ffc0']] }), [200, 200, 200, 200]),
  paint: hands4((v, k) => ({ O: AT('chest', 0, 1), T: k & 1 ? A(100, 110) : A(90, 130), tools: [TL('palette', 0, { h: 'O' }), TL('brush', 150)], prop: 'easel', ph: k >> 1 }), [320, 320, 320, 320]),
  juggle: hands4((v, k) => ({ T: k & 1 ? A(60, 120) : A(40, 90), O: k & 1 ? A(40, 90) : A(60, 120), face: { m: 's' }, fx: [['balls', 'head', 0, 1, k]] }), [150, 150, 150, 150]),
  strum: hands4((v, k) => {
    if (v === 'B') return { item: 'keep', dy: k & 1, fx: [['note', 'head', 3, -2 - (k & 1)]] };
    return { item: 'keep', T: AT(v === 'S' ? 'lute' : 'luteneck', 0, v === 'S' ? (k & 1) - 1 : 0, { late: true }), O: AT(v === 'S' ? 'luteneck' : 'lute', 0, v === 'S' ? 0 : (k & 1) - 1, { late: true }), fx: [['note', 'head', 4, -1 - k % 2 * 2, ['#3a2a4a', '#8a2a6a'][k >> 1]]] };
  }, [180, 180, 180, 180]),
  dance: hands4((v, k) => ({ view: 'spin', jump: k & 1, T: k & 1 ? A(90, 90) : A(150, 170), O: k & 1 ? A(90, 90) : A(150, 170), face: { m: 's' } }), [150, 150, 150, 150]),
  guard: hands4((v, k, c) => {
    const base = [{}, { dy: 1 }, {}, { face: { e: 'c' } }][k];
    if (['spear', 'club', 'lantern', 'staff', 'pitchfork'].includes(c.item)) return { legs: 'wide', item: 'keep', ...base };
    if (['sword', 'bigaxe', 'axe', 'mace'].includes(c.item)) return { legs: 'wide', T: AT('belly'), O: AT('belly'), tools: TL(c.item === 'sword' ? 'sword' : c.item, 0, { behind: v === 'B' }), ...base };
    return { legs: 'wide', T: A(0), tools: TL('spear', 180), ...base };
  }, [640, 460, 640, 140]),
  crook: hands4((v, k) => ({ T: k === 2 ? A(60, 90) : A(20, 60), tools: TL('crook', k === 2 ? 140 : 178), lean: v === 'S' && k === 2 ? 1 : 0 }), [600, 400, 500, 400]),
  lasso: hands4((v, k) => ({ T: A(160, 175), tools: [], fx: [['loop', 'T', 0, -1, k], ['line', 'T', 0, 0, ['T', 1, -3, '#c8a860']]], face: { m: 's' } }), [140, 140, 140, 140]),
  smoke: hands4((v, k) => ({ T: A(60, 90), tools: TL('smoker', 0), fx: k & 1 ? [['puff', 'T', 3, -2], ['puff', 'T', 5, -4, '#e8e8ec']] : [['puff', 'T', 2, -2]] }), [300, 300, 300, 300]),
  snip: hands4((v, k, c) => ({ T: A(70, 90), O: A(50, 90), tools: TL('shears', 0, { ph: k & 1 }), fx: k & 1 ? [['dots', 'T', 3, 1, c.outfit === 'gardener' ? ['#5a9a3a', '#3a7a2a'] : ['#6b4226', '#8a6a4a']]] : [] }), [200, 200, 200, 200]),
  gather: hands4((v, k) => [
    { legs: 'squat', lean: 1, T: AT('low', 1, 1), O: AT('belly'), tools: TL('basket', 0, { h: 'O' }) },
    { legs: 'squat', lean: 1, T: AT('low', 0, 0), O: AT('belly'), tools: [TL('basket', 0, { h: 'O' }), TL('herbs', 0)] },
    { T: AT('belly', 0, -1), O: AT('belly'), tools: [TL('basket', 0, { h: 'O' }), TL('herbs', 0)] },
    { O: AT('belly'), tools: TL('basket', 0, { h: 'O' }) },
  ][k], [320, 260, 260, 400]),
  lift: hands4((v, k) => [
    { legs: 'squat', lean: 1, T: AT('low'), O: AT('low', 1), tools: TL('sack', 0) },
    { dy: 1, T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('sack', 0), face: { e: 'c' } },
    { T: AT('shoulder'), O: AT('chest', 0, -1), tools: TL('sack', 0) },
    { dy: 1, T: AT('shoulder'), O: AT('chest', 0, -1), tools: TL('sack', 0), fx: [['sweat', 'head']] },
  ][k], [320, 300, 400, 500]),
  rope: hands4((v, k) => {
    const p = k & 1;
    return { legs: 'wide', lean: -1 - p, T: p ? A(90, 80) : A(120, 110), O: p ? A(120, 110) : A(90, 80), fx: [['line', 'O', 0, 0, ['O', 7, -7, '#c8a860']]] };
  }, [260, 260, 260, 260]),
  lookout: hands4((v, k) => ({ O: AT('brow', 0, 0, { late: true }), lean: v === 'S' && k === 1 ? 1 : 0, face: k === 3 ? { e: 'c' } : null }), [600, 600, 500, 150]),
  spyglass: hands4((v, k) => ({ T: AT('eye', 0, 0, { late: true }), O: AT('eye', 1, 1, { late: true }), tools: TL('spyglass', v === 'S' ? 95 : 160), lean: v === 'S' ? k & 1 : 0 }), [700, 600, 700, 600]),
  lantern: hands4((v, k) => ({ T: A(100, 150 + (k & 1) * 12), tools: TL('lantern', 0), fx: [['glow', 'T', 0, 3, '#fff0a0']] }), [500, 500, 500, 500]),
  orb: hands4((v, k) => ({ item: 'keep', O: AT('chest', 0, [-1, -2, -1, 0][k]), fx: [['glow', 'T', 1, -1, '#c0f0ff']] }), [300, 300, 300, 300]),
  rule: hands4((v, k) => [
    { T: A(150, 170), item: 'keep', O: A(20), face: MO },
    { T: A(140, 160), item: 'keep', O: A(90, 100) },
    { T: A(20), item: 'keep', O: A(60, 90), face: MO },
    { lean: v === 'S' ? -1 : 0, O: A(10) },
  ][k], [400, 300, 400, 400]),
  lecture: hands4((v, k) => [
    { O: A(150, 178, 0.95), face: MO },
    { O: A(80, 100) },
    { O: A(150, 178, 0.95), face: MO },
    {},
  ][k], [320, 320, 320, 320]),
  tell: hands4((v, k) => [
    { T: A(100, 130), O: A(100, 130), face: { m: 'O' } },
    { T: A(60, 100), O: A(60, 100), face: MO },
    { T: A(130, 160), O: A(40), face: { m: 'O' } },
    { T: A(40), O: A(130, 160), face: MO },
  ][k], [300, 300, 300, 300]),
  sneak: hands4((v, k) => ({ legs: 'squat', lean: 1, item: 'keep', T: A(40, 60), O: A(40, 80), dy: k & 1, face: k === 2 ? { e: 'c' } : null }), [300, 300, 300, 300]),
  serve: hands4((v, k) => ({ O: AT('chest', 0, 1), T: AT('chest', [1, 0, -1, 0][k], [0, 1, 0, -1][k]), tools: [TL('mug', 0, { h: 'O' }), TL('cloth', 0)], face: { m: 's' } }), [200, 200, 200, 200]),
  tap: hands4((v, k) => ({ legs: 'sit', O: AT('lap'), T: k & 1 ? AT('lap', 0, -1) : A(60, 140), tools: [TL('shoe', 0, { h: 'O' }), TL('mallet', k & 1 ? 100 : 160)], fx: k & 1 ? [['spark', 'tip', 0, 0, '#fff4a0']] : [] }), [220, 160, 220, 160]),
  fish: hands4((v, k) => {
    const a = [120, 125, 150, 100][k];
    return { T: AT('fwd', 0, 1), O: AT('fwd', -1, 2), tools: TL('rod', a), lean: v === 'S' && k === 2 ? -1 : 0, fx: [['line', 'tip', 0, 0, ['fwdfeet', 0, 0, '#e8e8f0']]] };
  }, [500, 500, 300, 400]),
  train: null, // 攻撃の動きをゆっくり
  shoot: null,
  cast: null,
  handwork: hands4((v, k) => ({ T: AT('chest', 0, 1 + (k & 1)), O: AT('chest', 0, 2 - (k & 1)), headDy: 1 }), [300, 300, 300, 300]),
  beg: LIFE.beg,
  idle: LIFE.idle,
};
WORK.pitch = { ...WORK.dig, pose(v, k) { const q = WORK.dig.pose(v, k); for (const t of [].concat(q.tools || [])) t.k = 'pitchfork'; for (const f of q.fx || []) f[4] = ['#e8d060', '#c8a840']; return q; } };
const slow = (d, m) => ({ ...d, durs: d.durs.map((x) => Math.round(x * m)) });
Object.assign(WORK, constructMotions({ A, AT, TO, TL, swing, hands4, OBJ, TOOL }));   // 普請場の仕事の姿（constructanim.js）
WORK.train = { attack: true, mult: 1.6 };
WORK.shoot = { attack: 'shoot', mult: 1.5 };
WORK.cast = {
  durs: [300, 300, 300, 300],
  pose(v, k, c) {
    const staff = ['staff', 'staffplain'].includes(c.item) || c.wk.tool === 'staff';
    const t = staff ? { tools: TL(c.item === 'staffplain' ? 'staffplain' : 'staff', 178) } : {};
    return { T: A(150, 175), O: A(90, 100), ...t, fx: [staff ? ['glow', 'tip', 0, 0, c.orb] : ['glow', 'T', 0, -1, c.orb], ['spark', 'O', 2, 0, c.orb], ['ring', 'feet', 0, 0, k]], face: k & 1 ? MO : null };
  },
};

// 職業 → 仕事の動き（JOBS の全職業に当てる。知らない職業は handwork）
export const JOB_MOTION = {
  king: 'rule', royal: 'rule', noble: 'rule', knight: 'guard', soldier: 'guard', guard: 'guard', jailer: 'guard',
  farmer: 'hoe', rancher: 'lasso', hunter: 'shoot', fisher: 'fish', woodcutter: 'chop', miner: 'pick', baker: 'knead',
  smith: 'smith', carpenter: 'saw', innkeeper: 'serve', merchant: 'coins', tailor: 'sew', servant: 'sweep', priest: 'pray',
  elder: 'lecture', wizard: 'cast', scholar: 'read', adventurer: 'train', sailor: 'rope', thief: 'sneak', wanderer: 'lookout',
  beggar: 'beg', bard: 'strum',
  chancellor: 'write', treasurer: 'coins', general: 'rule', royalguard: 'guard', courtmage: 'cast', butler: 'serve', maid: 'sweep',
  cook: 'stir', gardener: 'snip', jester: 'juggle', gatekeeper: 'guard', militia: 'guard',
  doctor: 'heal', herbalist: 'grind', midwife: 'cradle', teacher: 'lecture', scribe: 'write', changer: 'coins', butcher: 'butcher',
  brewer: 'stir', cobbler: 'tap', potter: 'potter', weaver: 'sew', jeweler: 'coins', alchemist: 'flask', fortune: 'orb',
  painter: 'paint', musician: 'strum', dancer: 'dance', stablehand: 'pitch', messenger: 'scroll', watchman: 'lantern',
  gravedigger: 'dig', laundress: 'wash', nanny: 'cradle', barber: 'snip', storyteller: 'tell', nun: 'pray',
  shepherd: 'crook', beekeeper: 'smoke', miller: 'lift', charcoal: 'dig', mason: 'pick', gatherer: 'gather',
  captain: 'spyglass', shipwright: 'saw', keeper: 'lantern', diver: 'gather', pirate: 'train', smuggler: 'lift',
  warrior: 'train', archer: 'shoot', cleric: 'pray', sage: 'cast', paladin: 'guard', guildmaster: 'train',
  banditchief: 'train', pickpocket: 'sneak', swindler: 'coins',
  roadworker: 'dig', pioneer: 'chop', // 道普請の人夫は土を掘り、開拓者は木を伐る
};
Object.assign(JOB_MOTION, TG.TRIBE_MOTION); // 長老は語り、巫女は祈る
AX.installActs({ WORK, LIFE, TOOL, OBJ, A, AT, TL, TO, MO, hands4, swing, GOLD, dk, lt, JOB_MOTION }); // 暮らしと仕事の動きを登録
Object.assign(JOB_MOTION, AX.ACT_JOB_MOTION); // 動きの決まっていなかった職業（普請・行商・渡し守・機織り…）
export const WORK_MOTIONS = Object.keys(WORK);
export const ANIM_NAMES = ['idle', 'talk', 'attack', 'hurt', 'dying', 'death', 'dead', 'work', 'eat', 'drink', 'sleep', 'sit', 'pray', 'cry', 'cheer', 'wave', 'play', 'flee', 'beg'];
// ほかのファイルから仕事の動きと「行動 → 動き」の決め方を足す入口（js/anim_leisure.js：歌う・手をたたく・賭け事・湯に入る・逢い引き）
export function addWorkMotions(defs) { for (const [k, v] of Object.entries(defs)) if (!WORK[k]) WORK[k] = v; }
const STATE_HOOKS = [];
export function addAnimStateHook(fn) { if (!STATE_HOOKS.includes(fn)) STATE_HOOKS.push(fn); }
export const POSE_KIT = { A, AT, TL, TO, MO, hands4 };

// ================================================================ シートの組み立て
function ctxOf(p, pt) {
  const wk = advWeapon(p, pt) || weaponOf(p, pt.item);
  const c = { stage: pt.stage, kid: pt.kid, baby: pt.stage === 'baby', elder: pt.stage === 'elder', f: pt.f, outfit: pt.outfit, item: pt.item, wk, orb: pt.orb };
  c.fighter = wk.motion !== 'punch';
  c.talk = talkStyle(p, c);
  c.motion = JOB_MOTION[p.job] || JOB_MOTION[pt.outfit] || 'handwork';
  return c;
}
// アニメ名 → 定義（durs, loop, pose）
function resolveDef(anim, c) {
  let name = anim, sub = null;
  if (anim.startsWith('work:')) { name = 'work'; sub = anim.slice(5); }
  if (name === 'attack') return { ...ATTACK[c.wk.motion], loop: true, motion: c.wk.motion };
  if (name === 'work') {
    const m = sub || (c.kid ? 'play' : c.motion);
    if (!sub && c.kid) return { ...LIFE.play, motion: 'play' };
    let d = WORK[m] || LIFE[m] || extraWork(m) || WORK.handwork;
    if (d.attack) {
      const am = d.attack === true ? (c.wk.motion === 'punch' ? 'punch' : c.wk.motion) : d.attack;
      const cc = am === 'shoot' ? c : c;
      d = { ...slow(ATTACK[am], d.mult), motion: am, ctx: cc };
    }
    return { ...d, loop: true, motion: m };
  }
  return LIFE[name] || EXTRA_LIFE[name] || LIFE.idle;
}
function tint(P, spec) {
  if (spec.white) P.mapColors((col) => mix(col, '#ffffff', spec.white));
  if (spec.gray) P.mapColors((col) => mix(gray(col), '#6a6a78', spec.gray));
}
// 1コマ：{P（輪郭済み・fx 前）, r（fx の情報）}
function renderCell(pt, spec, view, c) {
  if (spec.lie) return renderLie(pt, spec);
  if (c.elder && view === 'S' && spec.lean == null) spec = { ...spec, lean: 1 };
  const r = pt.frame(view, spec);
  r.jump = spec.jump || 0;
  tint(r.P, spec);
  r.P.outline();
  return { P: r.P, r };
}
function renderLie(pt, spec) {
  const r = pt.frame('F', { dy: spec.dy, face: spec.face, item: false });
  tint(r.P, spec);
  r.P.outline();
  const Q = rotated(r.P); const b = Q.bbox();
  const w = b[2] - b[0] + 1, h = b[3] - b[1] + 1;
  const P = new Pix(CW, CH);
  const dx = Math.round(CW / 2 - w / 2), dy = GROUND - h + 1;
  P.blit(Q, b[0], b[1], w, h, dx, dy);
  return { P, lie: { x0: dx, x1: dx + w - 1, top: dy, zzz: spec.zzz || 0 } };
}
function finishCell(cell, flip) {
  const P = new Pix(cell.P.w, cell.P.h); P.d = cell.P.d.slice();
  if (flip) P.flipX();
  if (cell.lie) {
    const L = cell.lie;
    if (L.zzz) { // 頭の側（右端、反転したら左端）の上に Zzz
      const hx = flip ? CW - 1 - L.x1 + 1 : L.x1 - 4;
      const base = { G: {}, hands: {}, fx: [] };
      const zx = hx, zy = L.top - 4;
      if (L.zzz >= 1) glyph(P, 'z', zx, zy, '#e8f0ff');
      if (L.zzz >= 2) glyph(P, 'Z', zx + (flip ? -4 : 3), zy - 5, '#e8f0ff');
      if (L.zzz >= 3) glyph(P, 'Z', zx + (flip ? -2 : 1), zy - 10, '#e8f0ff');
      void base;
    }
  } else if (cell.r) drawFx(P, cell.r, flip);
  return P;
}
const SPIN = ['F', 'L', 'B', 'R'], SPIN_START = { 0: 0, 1: 1, 3: 2, 2: 3 };
function buildAnim(pt, def, c) {
  const n = def.durs.length;
  const mult = ['hurt', 'death', 'dead'].includes(def.name) ? 1 : c.elder ? 1.35 : c.kid ? 0.85 : 1;
  const cc = def.ctx || c;
  const cells = [[], [], [], []];
  const VIEW = ['F', 'S', 'S', 'B'];
  for (const dir of [0, 1, 3, 2]) {
    for (let k = 0; k < n; k++) {
      let spec = { ...(def.pose(VIEW[dir], k, cc) || {}) };
      let view = VIEW[dir], flip = dir === 2;
      if (spec.view === 'spin') {
        const s = SPIN[(SPIN_START[dir] + k) % 4];
        view = s === 'F' ? 'F' : s === 'B' ? 'B' : 'S'; flip = s === 'R';
        if (view !== VIEW[dir]) spec = { ...(def.pose(view, k, cc) || {}) };
        delete spec.view;
        cells[dir][k] = finishCell(renderCell(pt, spec, view, cc), flip);
        continue;
      }
      if (spec.lie) flip = dir === 0 || dir === 1;
      if (dir === 2 && !spec.lie) { cells[2][k] = finishCell(cells[1][k]._cell, true); continue; }
      const cell = renderCell(pt, spec, view, cc);
      const P = finishCell(cell, flip); P._cell = cell;
      cells[dir][k] = P;
    }
  }
  // 全コマ共通の枠：体の中心線で左右対称、下端は接地行
  const mid = CW / 2;
  let x0 = CW, y0 = CH, x1 = -1;
  for (const row of cells) for (const P of row) { const b = P.bbox(); if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); }
  const half = Math.ceil(Math.max(mid - x0, x1 + 1 - mid));
  const fx = Math.floor(mid - half), fw = half * 2, fh = GROUND - y0 + 1;
  const Sh = new Pix(fw * n, fh * 4);
  for (let dir = 0; dir < 4; dir++) for (let k = 0; k < n; k++) Sh.blit(cells[dir][k], fx, y0, fw, fh, k * fw, dir * fh);
  const durs = def.durs.map((d) => Math.round(d * mult));
  const loop = def.loop !== false;
  const meta = { frameW: fw, frameH: fh, cols: n, rows: 4, frames: n, durs, loop, fps: Math.round(10000 / (durs.reduce((a, b) => a + b, 0) / n)) / 10, anchorY: 0, worldH: fh * PIXEL_SCALE, worldW: fw * PIXEL_SCALE, anchor: 'bottom', grounded: true, kind: 'person' };
  const canvas = Sh.toCanvas(meta);
  return { canvas, ...meta };
}

// ================================================================ 公開の関数とキャッシュ
const MAX_SHEETS = 360, MAX_PAINTERS = 160;
const sheetCache = new Map(), painterCache = new Map();
let genCount = 0, genMs = 0;
function lru(map, key, make, max) {
  let v = map.get(key);
  if (v) { map.delete(key); map.set(key, v); return v; }
  v = make();
  map.set(key, v);
  if (map.size > max) map.delete(map.keys().next().value);
  return v;
}
function lookKey(p, opts) { return `${p.id}|${Math.floor(opts.age ?? 30)}|${p.job}|${p.rank}|${p.jail != null}|${p.south ? 1 : 0}|${p.sex}|${p.advClass || ''}`; }
function painterOf(p, opts) { return lru(painterCache, lookKey(p, opts), () => makePainter(p, opts), MAX_PAINTERS); }

// 人のアニメーションシートを返す（遅延生成＋キャッシュ）
export function drawPersonAnim(p, opts = {}, anim = 'idle') {
  const pt = painterOf(p, opts);
  const c = ctxOf(p, pt);
  const key = `${lookKey(p, opts)}|${anim}|${c.wk.tool}`;
  return lru(sheetCache, key, () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const def = { ...resolveDef(anim, c), name: anim };
    const out = buildAnim(pt, def, c);
    out.anim = anim; out.motion = def.motion || null;
    genCount++; genMs += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return out;
  }, MAX_SHEETS);
}
// コマ番号：経過時間 t（秒）から。loop=false は最後のコマで止まる
export function animFrameAt(sheet, t) {
  let ms = Math.max(0, t * 1000);
  const tot = sheet.durs.reduce((a, b) => a + b, 0);
  if (sheet.loop) ms %= tot; else if (ms >= tot) return sheet.frames - 1;
  for (let i = 0; i < sheet.durs.length; i++) { if (ms < sheet.durs[i]) return i; ms -= sheet.durs[i]; }
  return sheet.frames - 1;
}
export function animDuration(sheet) { return sheet.durs.reduce((a, b) => a + b, 0) / 1000; }
export function personAnimCacheStats() {
  let px = 0; for (const s of sheetCache.values()) px += s.canvas.width * s.canvas.height;
  return { sheets: sheetCache.size, painters: painterCache.size, pixels: px, bytes: px * 4, generated: genCount, msTotal: Math.round(genMs), msAvg: genCount ? +(genMs / genCount).toFixed(2) : 0 };
}
export function clearPersonAnimCache() { sheetCache.clear(); painterCache.clear(); }
export function forgetPersonAnim(id) { for (const k of [...sheetCache.keys()]) if (k.startsWith(id + '|')) sheetCache.delete(k); for (const k of [...painterCache.keys()]) if (k.startsWith(id + '|')) painterCache.delete(k); }

// ================================================================ 住人の状態 → アニメ
// moving：いま歩いているか（描画側で位置の変化から判定）。'walk' は歩行シート（sprites.js）を使うという意味。
export function personAnimState(sim, p, moving = false) {
  if (p.deathYear != null) return 'dead';
  for (const hook of ANIM_STATE_HOOKS) { const r = hook(sim, p, moving); if (r) return r; }
  if (p.cb) {   // 戦いの状態（combat.js）：瀕死・眠り・麻痺と気絶・潰走
    const c = p.cb, t = sim?.S?.t ?? 0;
    if (c.down) return 'dying';
    if ((c.ss?.sleep || 0) > t) return 'sleep';
    if ((c.ss?.para || 0) > t || (c.ss?.stun || 0) > t) return 'hurt';
    if ((c.rout || 0) > t) return 'flee';
  }
  for (const f of ANIM_EXT.STATE) { const r = f(sim, p, moving); if (r) return r; }   // 足した仕組みの動き（mintanim.js など）
  const age = sim?.ageOf ? sim.ageOf(p) : 30;
  const kid = age < 13;
  const a = p.action;
  if (p.fight) return moving ? 'walk' : (p.guardT != null && sim?.S && sim.S.t - p.guardT < 2 ? 'work:guard' : 'attack');   // 盾を構える（tactics.js の挑発・かばう）
  if (moving) {
    if (a?.type === 'haul' && p.consHaul?.leg === 'drop') return p.consHaul.how === 'cart' || p.consHaul.how === 'beast' ? 'work:c_cart' : p.consHaul.g === 'stone' ? 'work:c_carrystone' : 'work:c_carry';   // 資材を背負って・荷車を押して歩く（construct.js）
    if (a?.type === 'flee' || (p.needs && p.needs.survival < 8)) return 'flee';
    if (kid && a && ['play', 'festival'].includes(a.type)) return 'play';
    return 'walk';
  }
  if (p.maxhp && p.hp < p.maxhp * 0.2) return 'dying';
  if (p.fxAnim && sim?.S && p.fxAnim.until > sim.S.t) return p.fxAnim.anim;   // ほかの仕組みが決めた、いまのしぐさ（両替など）
  if (p.talk) return 'talk';
  if (p.jail != null) return (p.mood ?? 50) < 25 ? 'cry' : 'sit';
  { const ax = AX.actAnimState(sim, p, a, age, kid); if (ax) return ax; } // 季節の畑仕事・売り買い・休み方など（anim_acts.js）
  if (!a || a.phase !== 'do') return 'idle';
  for (const f of STATE_HOOKS) { const r = f(sim, p, a, kid); if (r) return r; }   // 娯楽の動き（js/anim_leisure.js）
  switch (a.type) {
    case 'sleep': case 'nap': case 'sickbed': return 'sleep';
    case 'eat': case 'askfood': return 'eat';
    case 'tavern': return kid ? 'idle' : 'drink';
    case 'pray': case 'grave': return 'pray';
    case 'funeral': return p.id % 3 === 0 ? 'cry' : 'pray';
    case 'wedding': case 'festival': return p.job === 'dancer' ? 'work:dance' : kid ? 'play' : 'cheer';
    case 'play': return 'play';
    case 'beg': return 'beg';
    case 'flee': return 'flee';
    case 'perform': return 'work:strum';
    case 'storytell': case 'grandkids': return 'work:tell';
    case 'work': return kid && !p.job ? 'play' : 'work';
    case 'train': return 'work:train';
    case 'school': return kid ? 'work:read' : 'work:lecture';
    case 'rest': case 'home': return age >= 50 ? 'sit' : 'idle';
    case 'plaza': return age >= 60 ? 'sit' : 'idle';
    case 'gather': case 'collect': return 'work:gather';
    case 'fishing': return 'work:fish';
    case 'garden': return 'work:hoe';
    case 'laundry': return 'work:wash';
    case 'water': case 'help': return 'work:lift';
    case 'cook': return 'work:stir';
    case 'preserve': return 'work:knead';
    case 'nurse': case 'housecall': return 'work:heal';
    case 'childcare': return 'work:cradle';
    case 'patrol': case 'defend': return 'work:guard';
    case 'court': return 'wave';
    case 'steal': case 'rob': return 'work:sneak';
    case 'jail': return 'sit';
    case 'construct': return p.consAnim || 'work:lift';   // 普請場：槌を振る・石を積む・木を運ぶ（construct.js が段階と役目で選ぶ）
    case 'roadbuild': return 'work:dig';                  // 街道の普請
  }
  if ((p.mood ?? 50) < 12) return 'cry';
  return 'idle';
}

// ================================================================ 試験用：姿勢なしのコマで歩行シートを組む（drawPerson と一致するか確かめる）
// ================================================================ 外から仕事の動きを足す（coinagegfx.js の両替のしぐさなど）
// fn(名前) → hands4 の定義か null。名前は 'work:' のあとの部分（'xweigh:0:20' など）
const EXTRA_WORK = [];
function extraWork(m) { for (const fn of EXTRA_WORK) { const d = fn(m); if (d) return d; } return null; }
export function addWorkResolver(fn) { EXTRA_WORK.push(fn); }
export const POSE_KIT = { hands4, A, AT, TO, TL, MO, OBJ };

export function __walkSheet(p, opts = {}) {
  const pt = makePainter(p, opts);
  const frame = (view, f) => pt.frame(view, { legs: ['w0', 'stand', 'w2'][f] }).P;
  const views = ['F', 'S', 'S', 'B'];
  const frames = [[], [], [], []];
  for (const dir of [0, 1, 3]) for (let f = 0; f < 3; f++) { const P = frame(views[dir], f); P.outline(); frames[dir].push(P); }
  for (let f = 0; f < 3; f++) { const src = frames[1][f]; const P = new Pix(src.w, src.h); P.d = src.d.slice(); P.flipX(); frames[2].push(P); }
  const W = frames[0][0].w, mid = W / 2;
  let x0 = W, y0 = CH, x1 = -1;
  for (const row of frames) for (const P of row) { const b = P.bbox(); if (!b) continue; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); }
  const half = Math.ceil(Math.max(mid - x0, x1 + 1 - mid));
  const fx = Math.floor(mid - half), fw = half * 2, fh = GROUND - y0 + 1;
  const S = new Pix(fw * 3, fh * 4);
  for (let dir = 0; dir < 4; dir++) for (let f = 0; f < 3; f++) S.blit(frames[dir][f], fx, y0, fw, fh, f * fw, dir * fh);
  return S.toCanvas({ frameW: fw, frameH: fh, cols: 3, rows: 4 });
}

// ================================================================ 足す口：ほかのファイルが仕事の動き・手に持つ小物・状態を足す（mintanim.js）
export const ANIM_EXT = { WORK, TOOL, OBJ, STATE: [] };
