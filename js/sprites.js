// 生き物のドット絵（人・動物・魔物）を canvas で描く
//
// drawPerson(p, opts) / drawCreature(c, def) は、どちらも「歩行シート」1枚の canvas を返す。
// 並びは RPGツクールVXAce の歩行チップと同じ：
//   列（3）= 歩行コマ   0:左足前 / 1:直立 / 2:右足前
//   行（4）= 向き       0:下(正面) / 1:左 / 2:右 / 3:上(背中)
// canvas.userData = { frameW, frameH, cols:3, rows:4, worldH, worldW, scale, anchor:'bottom', grounded }
//   worldH はワールドでの推奨の高さ（人間の大人 ≒ 0.95）。scale は 1ピクセルあたりのワールド単位。
//
// すべての個体は id から決まるシード乱数で特徴を組み合わせる（同じ個体は毎回同じ見た目）。
// 光は画面の左上から。輪郭は本体色を暗くした1ピクセル、接地面の輪郭は描かない。

export const PIXEL_SCALE = 0.0432; // 大人の人（足元〜髪の上 約22px）≒ 0.95

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
  for (let f = 0; f < 3; f++) { const src = frames[1][f]; const P = new Pix(src.w, src.h); P.d = src.d.slice(); P.flipX(); frames[2].push(P); }
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

// ================================================================ 人
const EYES = ['#2a1e14', '#3a2616', '#2f4f7a', '#3a6a4a', '#5a4a2a', '#4a4a5a', '#6a3a2a', '#1a2a4a', '#4a6a8a'];
const HERALD = ['#b0282a', '#2a4ab0', '#2a8a4a', '#c9a23a', '#6a2a8a', '#1a1a1a', '#e8e8e8', '#c9602a'];
const CLOTH = ['#3b6fb6', '#b63b3b', '#3b8f5a', '#8f6a3b', '#6a3b8f', '#c9a23a', '#3b8f8f', '#7a7a7a', '#a0522d', '#d0d0c0', '#4a4a6a', '#8a3a5a', '#5a7a2a', '#2a5a7a'];
const GOLD = '#e8c040', GOLD_D = '#b08a20', STEEL = '#c8ccd4', STEEL_D = '#8a909a', STEEL_L = '#eef0f6';

const HAIR_M = { short: 5, crop: 3, sidepart: 4, spiky: 3, curly: 2, bald: 1.5, mohawk: 0.4, long: 0.8, ponytail: 0.6, bun: 0.3, messy: 2.5, wavy: 1 };
const HAIR_F = { long: 4, bob: 3, ponytail: 3, bun: 2, twintails: 1.5, curly: 1.5, braid: 2, sidepart: 1, short: 0.8, wavy: 2.5, messy: 0.8, pigtailbuns: 0.8 };

function outfitOf(p, stage) {
  const rank = p.rank;
  if (rank === 'prisoner') return 'prisoner';
  if (stage === 'baby' || stage === 'child') {
    if (rank === 'king' || rank === 'royal') return 'royalkid';
    if (rank === 'noble') return 'noblekid';
    if (rank === 'homeless') return 'beggar';
    return 'kid';
  }
  if (rank === 'king' || p.job === 'king') return 'king';
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

export function drawPerson(p, opts = {}) {
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
  const accent = jit(R.pick(HERALD), R, 0.03, 0.1, 0.08);
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
  const scarf = scarfR < 0.16 ? scarfC : null;
  const casualHat = casualR < 0.2 ? casualKind : null;
  const blush = blushR < (f ? 0.5 : 0.12);
  const brows = browsR < 0.3;
  const eyepatch = eyepatchR < (outfit === 'sailor' || outfit === 'thief' ? 0.2 : outfit === 'adventurer' ? 0.08 : 0);
  const glasses = outfit === 'scholar' || (glassesR < 0.06 && age > 30);
  const pantsJobs = ['knight', 'soldier', 'guard', 'thief', 'adventurer', 'hunter', 'sailor', 'fisher', 'miner', 'woodcutter', 'smith', 'prisoner', 'jailer'];
  const skirt = f && (!pantsJobs.includes(outfit) ? skirtR < 0.85 : skirtR < 0.15);
  const dirt = outfit === 'miner' || outfit === 'beggar' || (outfit === 'smith' && dirtR < 0.6);
  const cane = stage === 'elder' && caneR < 0.45;
  if (age >= 45) hair = mix(hair, o2 < 0.5 ? '#d8d8dc' : '#b8b8bc', Math.min(1, (age - 45) / 28));
  if (age >= 72) hair = mix(hair, '#eeeef0', 0.5);

  // ---- 服装の設定
  let top = shirt, bottom = pants, sleeve = null, hat = casualHat, hatC = hatCol, long = null, barefoot = false, item = null;
  let overlay = null, capeC = null, hood = null, helmet = null, mask = false, stripes = null, apron = null, shield = null, tabard = false;
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
    case 'kid': hat = o1 < 0.12 ? (o2 < 0.5 ? 'cap' : 'knit') : null; break;
    default: break;
  }
  if (stage === 'baby') { hat = outfit === 'royalkid' ? 'circlet' : (o1 < 0.3 ? 'bonnet' : null); item = null; capeC = null; }
  if (stage === 'elder' && cane && !item) item = 'cane';
  const southWrap = south && !helmet && !hood && !['crown', 'tiara', 'wizard', 'chef', 'circlet', 'katyusha'].includes(hat);
  if (southWrap) {
    hat = f ? 'veil' : 'turban';
    hatC = rich(pickBy(['#f0ead8', '#e8d8b0', '#3a4a8a', '#c0602a', '#e8e8e8', '#8a2a2a'], o4));
    if (!long && !['knight', 'soldier', 'guard', 'prisoner'].includes(outfit) && !stripes) long = mix(top, '#f0e8d0', 0.35);
    else if (long) long = mix(long, '#f0e8d0', 0.15);
  }
  if (long) top = long;
  const plume = [HERALD[Math.floor(rp[0] * 6)], Math.floor(rp[1] * 3)];
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

  const frame = (view, fr) => {
    const P = new Pix(28, 32); P.ox = 6; P.oy = 7;
    const F = view === 'F', B = view === 'B', S = view === 'S';
    const step = fr !== 1;
    const bob = step && stage !== 'baby' && legH > 2 ? 1 : 0; // 踏み出しのコマは頭が1px沈む（足元は動かさない）
    const legTop = FEET - legH + 1 + bob;
    const tT = legTop - torsoH;
    const t = tT - headH + (stage === 'elder' ? 1 : 0);
    const torsoBot = legTop - 1;
    const nk = tT;
    const armL = bx0 - 1, armR = bx1 + 1;
    const armBot = Math.min(tT + torsoH - 1 + (kid ? 0 : 1), FEET - 2) - 1;
    // 正面の「左足前」は画面右の脚が前に出る＝画面左の脚を上げる。背中は逆
    const lift = !step || S ? null : ((fr === 0) === F ? 'L' : 'R');
    const X = (x) => (B ? 15 - x : x);
    const hid = helmet === 'closed' || hood;
    const tx0 = S ? sx0 : bx0, tx1 = S ? sx1 : bx1;

    // ---------------- 後ろの層
    if (capeC && !B) {
      if (S) { for (let y = tT + 1; y <= FEET - 2; y++) P.rect(sx1 + 1, y, 2 + (y > FEET - 6 ? 1 : 0), 1, capeC); }
      else P.rect(Math.max(1, armL - 1), tT + 1, armR - armL + 3, FEET - 1 - (outfit === 'king' ? 0 : 2) - (tT + 1), capeC);
    }
    const longBack = !hid && ['long', 'wavy', 'braid'].includes(hs) && !['turban', 'veil'].includes(hat) && stage !== 'baby';
    if (longBack && F) P.rect(4, t + 2, 8, kid ? 6 : 8, dk(hair, 0.06));
    if (shield && S) P.rect(sx1, nk + 2, 2, 4, dk(shield, 0.2));

    // ---------------- 脚
    const legC = bottom || stripes?.[1] || pants;
    const footC = barefoot ? dk(skin, 0.05) : outfit === 'knight' ? STEEL_D : shoe;
    if (!S) {
      for (const side of ['L', 'R']) {
        const x = side === 'L' ? 5 : 9;
        const up = lift === side ? 1 : 0;
        const lh = legH - bob - up;
        P.rect(x, legTop, 2, lh, legC);
        if (stripes && !bottom) for (let y = legTop; y < legTop + lh; y++) if ((y & 1) === 0) P.rect(x, y, 2, 1, stripes[0]);
        if (outfit === 'knight' && lh > 2) { P.rect(x, legTop + 1, 2, lh - 1, '#b8bcc6'); P.px(x, legTop + 2, STEEL_L); }
        P.rect(side === 'L' ? 4 : 9, FEET - up, 3, 1, footC);
      }
    } else {
      // 横向き：手前の脚（左脚）はコマ0で前へ、コマ2で後ろへ
      const s = fr === 0 ? -1 : fr === 2 ? 1 : 0;
      const lh = legH - bob;
      const leg = (off, c, fc) => {
        for (let r = 0; r < lh; r++) { const o = Math.round(off * Math.min(2, legH / 2.5) * (r + 1) / lh); P.rect(7 + o, legTop + r, 2, 1, c); }
        P.rect(6 + Math.round(off * Math.min(2, legH / 2.5)), FEET, 3, 1, fc);
      };
      leg(-s, dk(legC, 0.12), dk(footC, 0.1));
      leg(s, legC, footC);
    }
    if (skirt && !long) {
      const sl = Math.max(2, legH - (kid ? 1 : 2));
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
    const sleeveC = sleeve === 'bare' ? skin : outfit === 'knight' ? '#b8bcc6' : (capeC && B ? capeC : top);
    const handC = outfit === 'knight' ? STEEL_D : skin;
    if (!S) {
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
      case 'beret': HT(4, t - 1, 7, 2); P.px(11, t, hatC); P.px(7, t - 2, hatC); break;
      case 'cap': HT(5, t - 2, 6, 2); if (F) HT(5, t, 6, 1, dk(hatC, 0.15)); if (S) HT(3, t, 3, 1, dk(hatC, 0.15)); if (B) HT(5, t, 6, 1, hatC); P.rect(6, t - 2, 2, 1, lt(hatC, 0.12)); break;
      case 'knit': HT(5, t - 2, 6, 3); HT(4, t, 8, 1, lt(hatC, 0.1)); P.px(8, t - 3, lt(hatC, 0.2)); break;
      case 'kerchief': HT(4, t - 1, 8, 2); if (!S) { P.px(4, t + 1, hatC); P.px(11, t + 1, hatC); } else P.rect(11, t + 1, 1, 2, hatC); if (B) P.rect(7, t + 1, 2, 2, hatC); break;
      case 'bonnet': HT(4, t - 1, 8, 2, '#f4f0f0'); if (S) HT(8, t + 1, 3, 3, '#f4f0f0'); else { HT(4, t + 1, 1, 3, '#f4f0f0'); HT(11, t + 1, 1, 3, '#f4f0f0'); } if (B) HT(5, t + 1, 6, 3, '#f4f0f0'); break;
      case 'turban': HT(4, t - 2, 8, 3); for (let x = 4; x < 12; x += 2) P.px(x, t - 1, dk(hatC, 0.12)); P.px(8, t - 3, hatC); if (rp[10] < 0.4 && F) P.px(7, t - 1, '#d0303a'); break;
      case 'veil': HT(4, t - 1, 8, 2); if (F) { HT(4, t + 1, 1, 6); HT(11, t + 1, 1, 6); HT(3, t + 4, 1, 4); HT(12, t + 4, 1, 4); } if (S) { HT(8, t + 1, 4, 5); HT(10, t + 6, 3, 3); } if (B) { HT(4, t + 1, 8, 6); HT(3, t + 4, 10, 4); } P.rect(6, t - 1, 2, 1, lt(hatC, 0.12)); break;
    }

    // ---------------- 手に持つ物（左手。正面では画面右、背中では画面左、横では手前の手）
    const hy = armBot + 1;
    let hx;
    if (F) hx = Math.min(armR + 1, 14) - (lift === 'R' ? 1 : 0);
    else if (B) hx = 15 - Math.min(armR + 1, 14) + (lift === 'L' ? 1 : 0);
    else hx = sx0 + Math.floor(sw / 2) - 2 + (fr === 0 ? 1 : fr === 2 ? -1 : 0);
    const wood = '#7a5230', steel = '#dce0e8';
    const dir = B ? -1 : 1;
    switch (item) {
      case 'sword': P.rect(hx, hy - 7, 1, 7, steel); P.px(hx, hy - 8, '#f4f6fa'); P.rect(hx - 1, hy - 1, 3, 1, '#c9a23a'); P.px(hx, hy, '#5a3a22'); break;
      case 'spear': P.rect(hx, 2, 1, FEET - 2, wood); P.rect(hx, 0, 1, 2, steel); P.px(hx - 1, 2, '#9aa0aa'); P.px(hx + 1, 2, '#9aa0aa'); break;
      case 'staff': P.rect(hx, t, 1, FEET - t, wood); P.rect(hx - (dir > 0 ? 1 : 0), t - 2, 2, 2, orb); break; // 魔法の玉は自ら光る
      case 'staffplain': P.rect(hx, t + 1, 1, FEET - t - 1, wood); P.rect(hx - (dir > 0 ? 1 : 0), t, 2, 1, dk(wood, 0.1)); break;
      case 'cane': P.rect(hx, hy, 1, FEET - hy + 1, wood); P.px(hx - dir, hy, wood); break;
      case 'scepter': P.rect(hx, hy - 5, 1, 6, GOLD); P.px(hx, hy - 6, '#d0303a'); break;
      case 'club': P.rect(hx, hy - 4, 1, 5, wood); P.px(hx, hy - 5, dk(wood, 0.1)); break;
      case 'pitchfork': P.rect(hx, 3, 1, FEET - 3, wood); P.rect(hx - 1, 1, 3, 2, steel); P.px(hx - 1, 0, steel); P.px(hx + 1, 0, steel); P.px(hx, 0, steel); P.px(hx, 1, null); break;
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
      case 'lute':
        if (F) { P.rect(bx0 + 1, torsoBot - 3, 3, 3, '#c08a40'); P.px(bx0 + 2, torsoBot - 2, '#3a2616'); P.line(bx0 + 3, torsoBot - 3, bx1 + 1, nk, '#8a5a2a'); }
        if (B) { P.rect(bx0 + 2, nk + 1, 4, 5, '#a8763a'); P.line(bx0 + 4, nk + 1, bx1, t + 2, '#8a5a2a'); }
        if (S) { P.rect(sx0 - 2, torsoBot - 3, 3, 3, '#c08a40'); P.line(sx0 - 1, torsoBot - 3, sx0 - 4, nk - 1, '#8a5a2a'); }
        break;
    }
    if (shield && F) { P.rect(1, nk + 2, 3, 4, shield); P.rect(2, nk + 3, 1, 2, lt(shield, 0.25)); }
    return P;
  };

  return buildSheet(frame, { grounded: true, ground: 7 + FEET, side: 'left', dead: opts.dead, kind: 'person' });
}
