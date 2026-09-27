// 建物の見た目（グラフィック部）
// ・看板：店や施設ごとの絵看板（ジョッキ・ベッド・パン・金床など）。1枚の絵の束（アトラス）から切り出すので、
//   世界じゅうの看板が1つの材質になり、render.js の「材質ごとに結合」でまとめて1回で描かれる。
// ・建物の形：種類ごとの屋根・煙突・外に置く物（樽・炉・干し草・薬草の鉢・鐘・武器立て・鉄格子など）。
//   家は住んでいる世帯の暮らし向き（貧しい・ふつう・裕福）で見た目を変える。
// ・煙：鍛冶場・パン屋・造幣所はいつも、民家は食事どきに煙突から煙を出す（まとめて1回で描く）。
// ・説明の文：建物の種類の呼び名（民族の集会所や祠などを正しく）。
//
// ■ ほかのファイルから使う関数
//   drawSign(parts, b, kind, opt)  … 看板を parts（{g, mat} の配列。建物の中心が原点）に足す
//        kind : SIGN_KINDS の名前（'mug' 'bed' 'bread' 'anvil' 'guild' 'cross' 'holy' 'book' 'star' 'coin' 'tent' 'fish'
//               'saw' 'anchor' 'horseshoe' 'shield' 'helmet' 'swords' 'key' 'crown' 'moon' 'wheat' 'bell' 'axe'）
//        opt  : { mode:'hang'|'wall', y, side:-1|1, at, lamp:true|false }
//               hang … 軒先から腕木で吊るす（既定）／wall … 壁に掛ける
//               y … 看板の中心の高さ（既定は 0.95）、side … 扉の左右どちらに付けるか、at … 扉からの横のずれ
//   signKindOf(b)                  … 建物に合う看板の種類（なければ null）
//   styledParts(R, b, ctx)         … render.js の buildingParts から呼ぶ。この建物を描いたら true
//   bldFxUpdate(R, dayF, now, dt)  … render.js の update から毎フレーム呼ぶ（看板の夜の明るさと煙）
//   bldTypeLabel(b, base)          … ui.js の建物の説明で使う呼び名
import * as THREE from 'three';
import { W, H } from './world.js';
import { tribalLabel } from './tribehome.js';

const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
const topY = (h) => 0.3 + h * 0.4;
const hsh = (a, b, s = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 982451653); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ================================================================ 看板の絵（14×14 のドット絵。枠は自動で付ける）
const PAL = {
  k: '#2a1a10', w: '#f8f4ea', f: '#fffbe0', y: '#f0c030', Y: '#b07818', o: '#e07a2a', t: '#d09a50', T: '#9a6428', c: '#f4dcaa',
  b: '#8a5a2e', B: '#5a3818', r: '#d0382c', R: '#8a1e1a', g: '#38b048', G: '#1e7a2e', s: '#e4e8ee', S: '#8a929c', u: '#3a70d8', U: '#1f3f8a', p: '#a060e0', n: '#ff9ab0',
};
const PARCH = ['#ecdcb4', '#5a3818'];
const ICONS = {
  mug: [PARCH, [
    '..............', '...wffwfw.....', '..wffffffw....', '..kffffffk....', '..kyyyyyykkk..', '..kyYyyyyk.k..', '..kyYyyyyk.k..',
    '..kyYyyyyk.k..', '..kyYyyyykkk..', '..kyYyyyyk....', '..kyYyyyyk....', '..kyyyyyyk....', '...kkkkkk.....', '..............']],
  bed: [PARCH, [
    '..............', '..............', '..............', '.kk...........', '.kbk..........', '.kbk.kkkkkkkk.', '.kbkwwkuuuuuk.',
    '.kbkwwkuuuuuk.', '.kbkkkkUUUUUk.', '.kbbbbbbbbbbk.', '.kbBBBBBBBBbk.', '.kbk......kbk.', '.kkk......kkk.', '..............']],
  bread: [['#f4e4c0', '#6a3a18'], [
    '..............', '..............', '..............', '....kkkkkk....', '..kkttttttkk..', '.kttcTtcTtctk.', '.ktcTtcTtcTtk.',
    'kttttttttttttk', 'kTttttttttttTk', '.kTTttttttTTk.', '..kkTTTTTTkk..', '....kkkkkk....', '..............', '..............']],
  anvil: [PARCH, [
    '........kkkk..', '.......kSssk..', '.......kSssk..', '........kbkk..', '.......kbk....', '......kbk.....', '..............',
    'kkkkkkkkkkkk..', 'kSssssssssssk.', '.kkSssssssSkk.', '...kSssssSk...', '...kSSSSSSk...', '..kSSSSSSSSk..', '..kkkkkkkkkk..']],
  guild: [PARCH, [
    's............s', '.s..........s.', '..s........s..', '...kkkkkkkk...', '...kuuuyuuk...', '...kuuuyuuk...', '...kyyyyyyk...',
    '...kuuuyuuk...', '...kuuuyuuk...', '...kUuuyuUk...', '...bkUuyUkb...', '..b..kUUk..b..', '.b....kk....b.', '..............']],
  cross: [['#fbfbf6', '#1e7a2e'], [
    '..............', '....kkkkkk....', '....kggggk....', '....kggggk....', '.kkkkggggkkkk.', '.kggggggggggk.', '.kggggggggggk.',
    '.kggggggggggk.', '.kggggggggggk.', '.kkkkggggkkkk.', '....kggggk....', '....kggggk....', '....kkkkkk....', '..............']],
  holy: [['#2a3f8a', '#e0b84a'], [
    '......kk......', '.....kyyk.....', '.....kyyk.....', '..kkkkyykkkk..', '..kyyyyyyyyk..', '..kYYYyyYYYk..', '..kkkkyykkkk..',
    '.....kyyk.....', '.....kyyk.....', '.....kyyk.....', '.....kyyk.....', '.....kYYk.....', '......kk......', '..............']],
  book: [PARCH, [
    '..............', '..............', '.kkkkk..kkkkk.', 'kwwwwwkkwwwwwk', 'kwSSSwkkwSSSwk', 'kwwwwwkkwwwwwk', 'kwSSSwkkwSSSwk',
    'kwwwwwkkwwwwwk', 'kwSSSwkkwSSSwk', 'kwwwwwkkwwwwwk', 'krrrrrrrrrrrrk', '.kkkkkkkkkkkk.', '..............', '..............']],
  star: [['#3a1f5a', '#e0b84a'], [
    '......kk......', '.....kyyk.....', '.....kyyk.....', '....kyyyyk....', 'kkkkkyyyykkkkk', 'kyyyyyyyyyyyyk', '.kyyyyyyyyyyk.',
    '..kyyyyyyyyk..', '...kyyyyyyk...', '...kyyyyyyk...', '..kyyykkyyyk..', '..kyyk..kyyk..', '.kyk......kyk.', '.kk........kk.']],
  coin: [['#1f4a2e', '#e0b84a'], [
    '....kkkkkk....', '...kyyyyyyk...', '..kyYYYYYYyk..', '..kyYyyyyYyk..', '..kyYyYYyYyk..', '..kyYyyyyYyk..', '..kyYYYYYYyk..',
    '...kyyyyyyk...', '....kkkkkk....', 'kkkkkk..kkkkkk', 'kyyyyk..kyyyyk', 'kYYYYk..kYYYYk', 'kyyyyk..kyyyyk', 'kkkkkk..kkkkkk']],
  tent: [PARCH, [
    '.......kr.....', '.......krr....', '.......k......', '.......k......', '......krk.....', '.....krwrk....', '....krwrwrk...',
    '...krwrwrwrk..', '..krwrwrwrwrk.', '.kkkkkkkkkkkkk', '..kb......bk..', '..kb.kkkk.bk..', '..kb.kyyk.bk..', '..kkkkkkkkkk..']],
  fish: [['#d8eef6', '#1f3f8a'], [
    '..............', '..............', '..............', '...kkkkkk..kk.', '..kuuuuuukkuk.', '.kuwkuuuuuuuk.', 'kuuuuuuuuuuk..',
    'kssssssssssk..', '.kssssssssskk.', '..kkkkkkkkksk.', '...........kk.', '..............', '..............', '..............']],
  saw: [PARCH, [
    '..............', '..............', 'kkkk..........', 'kbbk..........', 'kbbkkkkkkkkkk.', 'kbbksssssssssk', 'kbbkssssssssk.',
    'kbbksssssssk..', 'kbbkSkSkSkk...', 'kbbk.k.k.k....', 'kkkk..........', '..............', '..............', '..............']],
  anchor: [['#d8eef6', '#1f3f8a'], [
    '.....kkkk.....', '.....kSSk.....', '.....kkkk.....', '...kkkSSkkk...', '...kSSSSSSk...', '...kkkSSkkk...', '......SS......',
    '......SS......', '.k....SS....k.', 'kSk...SS...kSk', '.kSk..SS..kSk.', '..kSSSSSSSSk..', '....kSSSSk....', '......kk......']],
  horseshoe: [PARCH, [
    '..............', '..kkkk..kkkk..', '..kSSk..kSSk..', '.kSssk..kssSk.', '.kSsk....ksSk.', '.kSsk....ksSk.', '.kSsk....ksSk.',
    '.kSssk..kssSk.', '..kSsskkssSk..', '...kSssssSk...', '....kkkkkk....', '..............', '..............', '..............']],
  shield: [PARCH, [
    '..kkkkkkkkkk..', '..krrrrrrrrk..', '..krwrrrrwrk..', '..krrwrrwrrk..', '..krrrwwrrrk..', '..krrrrrrrrk..', '..krrrrrrrrk..',
    '..kRrrrrrrRk..', '...kRrrrrRk...', '....kRrrRk....', '.....kRRk.....', '......kk......', '..............', '..............']],
  helmet: [PARCH, [
    '..............', '......kk......', '.....krrk.....', '....kkkkkk....', '...kssssssk...', '..kssssssssk..', '..ksssssssSk..',
    '..kkkkkkkkkk..', '..kSkkkkkkSk..', '..kssSkkSssk..', '..kssSkkSssk..', '...kkk..kkk...', '..............', '..............']],
  swords: [PARCH, [
    's............s', '.s..........s.', '..s........s..', '...s......s...', '....s....s....', '.....s..s.....', '......ss......',
    '.....s..s.....', '...yys..syy...', '....b....b....', '...b......b...', '..b........b..', '.k..........k.', '..............']],
  key: [['#3a3a42', '#9a9aa4'], [
    '..............', '..............', '..kkkk........', '.kyyyyk.......', 'kyykkyyk......', 'kyk..kykkkkkk.', 'kyk..kyyyyyyyk',
    'kyykkyykkykyk.', '.kyyyyk.kykyk.', '..kkkk...k.k..', '..............', '..............', '..............', '..............']],
  crown: [['#6a1a2a', '#e0b84a'], [
    '..............', '..............', '..............', '..y....y....y.', '.kyk..kyk..kyk', '.kyyk.kyk.kyyk', '.kyyykyyykyyyk',
    '.kyyyyyyyyyyyk', '.kyyryyuyyryyk', '.kyyyyyyyyyyyk', '.kYYYYYYYYYYYk', '.kkkkkkkkkkkkk', '..............', '..............']],
  moon: [['#1a2450', '#c8d8ff'], [
    '....kkkk......', '..kkyyyk......', '.kyyyk.....y..', '.kyyk.....yyy.', 'kyyk.......y..', 'kyyk..........', 'kyyk..........',
    'kyyk......y...', '.kyyk.........', '.kyyyk........', '..kkyyykkk....', '....kkkkk.....', '..............', '..............']],
  wheat: [PARCH, [
    '......y.......', '.....yGy......', '....y.G.y.....', '.....yGy......', '....y.G.y.....', '......G.......', '...kkkkkkk....',
    '..kcccccccck..', '.kcccbbbccck..', '.kccccccccck..', '.kccccccccck..', '..kkkkkkkkk...', '..............', '..............']],
  bell: [PARCH, [
    '......kk......', '.....kyyk.....', '....kyyyyk....', '...kyyyyyyk...', '...kyyyyyYk...', '...kyyyyyYk...', '..kyyyyyyyYk..',
    '..kyyyyyyyYk..', '.kyyyyyyyyyYk.', '.kkkkkkkkkkkk.', '......kYk.....', '.......k......', '..............', '..............']],
  axe: [PARCH, [
    '......kkk.....', '.....kssSk....', '....kssssk....', '...kbsssSk....', '....kbkkk.....', '.....kb.......', '......kb......',
    '.......kb.....', '........kb....', '.........kb...', '..........k...', '..............', '..............', '..............']],
};
export const SIGN_KINDS = Object.keys(ICONS);
const CELL = 16, COLS = 8;

// ================================================================ 材質（一度だけ作って使い回す）
let MAT = null, BOUND = null;
// 小物の色見本（1列に並べた色。形の UV をその色のマスの真ん中に向ける）
const PAL_COLORS = { iron: '#2c2a2e', hay: '#d8b84a', plaster: '#f1ede2', herb: '#3f9a3a', herb2: '#6fbf4a', pot: '#a8583a', bread: '#c98a3e', flower: '#e0508a', flower2: '#f0d040', water: '#3a78b8', paper: '#f0e6c8', soil: '#5e4128', bloom: '#a070d0' };
const PAL_NAMES = Object.keys(PAL_COLORS);
function palTex() {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 1;
  const g = cv.getContext('2d');
  PAL_NAMES.forEach((k, i) => { g.fillStyle = PAL_COLORS[k]; g.fillRect(i, 0, 1, 1); });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 色見本の色なら、形の UV をその色に向けて、本物の材質（1枚の色見本）を返す
function realMat(geo, mat) {
  if (!mat || !mat.isPal) return mat;
  const uv = geo.attributes.uv, u = (mat.idx + 0.5) / 16;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, u, 0.5);
  return mats().pal;
}
function atlas() {
  const rows = Math.ceil(SIGN_KINDS.length / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * CELL; cv.height = rows * CELL;
  const g = cv.getContext('2d');
  SIGN_KINDS.forEach((k, i) => {
    const [[bg, bd], rowsA] = ICONS[k];
    const ox = (i % COLS) * CELL, oy = Math.floor(i / COLS) * CELL;
    g.fillStyle = bd; g.fillRect(ox, oy, CELL, CELL);
    g.fillStyle = bg; g.fillRect(ox + 1, oy + 1, CELL - 2, CELL - 2);
    rowsA.forEach((row, y) => { for (let x = 0; x < 14; x++) { const c = PAL[row[x]]; if (c) { g.fillStyle = c; g.fillRect(ox + 1 + x, oy + 1 + y, 1, 1); } } });
  });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, rows };
}
function mats() {
  if (MAT) return MAT;
  const L = (o) => new THREE.MeshLambertMaterial(o);
  const A = atlas();
  const M = BOUND?.mats || {};
  MAT = {
    atlas: A,
    sign: L({ map: A.tex, emissiveMap: A.tex, emissive: '#ffffff', emissiveIntensity: 0 }),
    pal: L({ map: palTex() }),   // 小物の単色はすべてこの1枚の色見本から取る（描く回数を増やさない）
    forge: L({ color: '#3a1a0a', emissive: '#ff6a1a', emissiveIntensity: 1.2 }),
    wood: M.wood || L({ color: '#7a5030' }),
    lamp: M.lamp || L({ color: '#40362c', emissive: '#ffd27a', emissiveIntensity: 0 }),
  };
  PAL_NAMES.forEach((k, i) => { MAT[k] = { isPal: true, idx: i }; });
  if (!BOUND) MAT.ownLamp = true;
  return MAT;
}
function bind(R) { if (BOUND !== R) { BOUND = R; MAT = null; } return mats(); }

// ================================================================ 小さな形（render.js と同じ UV の付け方）
function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) { const i = f * 6 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
  return g;
}
function cyl(rt, rb, h, seg = 8) { const g = new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rb * 4, uv.getY(i) * h); return g; }
function iconPlane(kind, size, back) {
  const A = mats().atlas, i = Math.max(0, SIGN_KINDS.indexOf(kind));
  const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS;
  const v1 = 1 - Math.floor(i / COLS) / A.rows, v0 = v1 - 1 / A.rows;
  const g = new THREE.PlaneGeometry(size, size).toNonIndexed();
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) { let u = uv.getX(k); if (back) u = 1 - u; uv.setXY(k, u0 + u * (u1 - u0), v0 + uv.getY(k) * (v1 - v0)); }
  if (back) g.rotateY(Math.PI);
  return g;
}
// 建物の正面の向きと、正面に沿った座標（u：横、v：外向き）
function frame(b) {
  const f = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
  const Wd = b.w - 0.25, Dd = b.d - 0.25;
  const fx = f[0], fz = f[1];
  const half = fx ? Wd / 2 : Dd / 2;      // 正面までの距離
  const side = fx ? Dd / 2 : Wd / 2;      // 横の半分の長さ
  const ry = Math.atan2(fx, fz);          // 正面を向く回転
  const P = (u, v) => [fz * u + fx * v, fx * u + fz * v]; // (横, 外向き) → (x, z)
  return { fx, fz, half, side, ry, P, Wd, Dd };
}
function push(parts, geo, mat, x, y, z, ry = 0) { const g = geo.index ? geo.toNonIndexed() : geo; if (ry) g.rotateY(ry); g.translate(x, y, z); parts.push({ g, mat: realMat(g, mat) }); }

// ================================================================ 看板
export function signKindOf(b) {
  if (!b || b.tribe) return null;
  const n = b.name || '';
  switch (b.type) {
    case 'tavern': return b.hall ? 'bell' : 'mug';
    case 'inn': return 'bed';
    case 'bakery': return 'bread';
    case 'smithy': return 'anvil';
    case 'guild': return 'guild';
    case 'clinic': return 'cross';
    case 'church': return 'holy';
    case 'school': return 'book';
    case 'magictower': return 'star';
    case 'academy': return 'moon';
    case 'bank': case 'mint': return 'coin';
    case 'market': return /魚/.test(n) ? 'fish' : 'tent';
    case 'workshop': return /造船/.test(n) ? 'anchor' : 'saw';
    case 'stable': return 'horseshoe';
    case 'barracks': return 'shield';
    case 'guardpost': return 'helmet';
    case 'dojo': return 'swords';
    case 'prison': return 'key';
    case 'mansion': return 'crown';
    case 'mill': return 'wheat';
    case 'camp': return 'axe';
    default: return null;
  }
}
// 看板を parts に足す。座標は建物の中心が原点（render.js の buildingParts と同じ）
export function drawSign(parts, b, kind, opt = {}) {
  const M = mats(), F = frame(b);
  if (!kind || !ICONS[kind]) return parts;
  const mode = opt.mode || 'hang';
  const y = opt.y ?? 0.95;
  const sd = opt.side ?? 1;
  const at = opt.at ?? Math.min(F.side - 0.3, 0.62);
  const S = opt.size ?? 0.56;
  if (mode === 'wall') {
    // 壁に掛ける板：正面に平らに付ける
    const [x, z] = F.P(sd * at, F.half + 0.035);
    push(parts, box(S + 0.08, S + 0.08, 0.05), M.wood, x, y, z, F.ry);
    const [x2, z2] = F.P(sd * at, F.half + 0.065);
    push(parts, iconPlane(kind, S, false), M.sign, x2, y, z2, F.ry);
  } else {
    // 軒先から吊るす：壁から突き出た腕木に、正面と直角に下げる（左右どちらから見ても読める）
    const out = S / 2 + 0.12;
    const [ax, az] = F.P(sd * at, F.half + out / 2 + 0.02);
    push(parts, box(0.05, 0.05, out + 0.06), M.iron, ax, y + S / 2 + 0.1, az, F.ry);                 // 腕木
    const [bx, bz] = F.P(sd * at, F.half + 0.04);
    push(parts, box(0.05, 0.28, 0.05), M.iron, bx, y + S / 2 - 0.02, bz, F.ry);                      // 支え
    const [cx, cz] = F.P(sd * at, F.half + out);
    for (const e of [-1, 1]) { const [qx, qz] = F.P(sd * at, F.half + out + e * S * 0.36); push(parts, box(0.02, 0.1, 0.02), M.iron, qx, y + S / 2 + 0.04, qz, F.ry); } // 吊り金具
    const ry = F.ry + Math.PI / 2;
    push(parts, box(0.04, S + 0.06, S + 0.06), M.wood, cx, y, cz, F.ry);                              // 板
    push(parts, iconPlane(kind, S, false), M.sign, cx + Math.sin(ry) * 0.026, y, cz + Math.cos(ry) * 0.026, ry);
    push(parts, iconPlane(kind, S, true), M.sign, cx - Math.sin(ry) * 0.026, y, cz - Math.cos(ry) * 0.026, ry);
  }
  if (opt.lamp !== false) {
    // 看板の横の角灯（夜に灯る）
    const [lx, lz] = F.P(sd * (at + (mode === 'wall' ? S / 2 + 0.16 : -0.3)), F.half + 0.1);
    push(parts, box(0.04, 0.12, 0.12), M.iron, lx, y + 0.28, lz, F.ry);
    push(parts, box(0.13, 0.16, 0.13), M.lamp, lx, y + 0.14, lz, F.ry);
    push(parts, box(0.16, 0.04, 0.16), M.iron, lx, y + 0.24, lz, F.ry);
  }
  return parts;
}

// ================================================================ 屋根看板（上から見ても、引いた地図でも分かるように屋根の両側に載せる）
// render.js の gable と同じ寸法の切妻屋根
function gableDims(w, d) { const along = w >= d; return { along, D: (along ? d : w) + 0.4, Hr: Math.min(1.1, 0.55 + Math.min(w, d) * 0.22) }; }
function roofY(w, d, wh, x, z) { const g = gableDims(w, d); const off = Math.abs(g.along ? z : x); return wh + g.Hr * Math.max(0, 1 - off / (g.D / 2)); }
// roofSign(parts, b, kind, {wh, w, d, flat, shift, size, kind2})
//   wh … 壁の高さ（屋根の付け根）、w・d … 壁の幅と奥行き（既定は b.w-0.25, b.d-0.25）
//   flat … 平屋根の上に寝かせて置く、shift … 棟に沿ってずらす、kind2 … 反対側の屋根に別の絵（宿屋のベッドなど）
export function roofSign(parts, b, kind, opt = {}) {
  const M = mats();
  if (!ICONS[kind]) return parts;
  const w = opt.w ?? b.w - 0.25, d = opt.d ?? b.d - 0.25, wh = opt.wh ?? 1.2;
  const S = opt.size ?? 0.62, sh = opt.shift ?? 0;
  if (opt.flat) {
    const F = frame(b);
    const [x, z] = F.P(sh, 0);
    push(parts, box(S + 0.08, 0.04, S + 0.08), M.wood, x, wh + 0.17, z, F.ry);
    const p = iconPlane(kind, S, false); p.rotateX(-Math.PI / 2); push(parts, p, M.sign, x, wh + 0.195, z, F.ry);
    return parts;
  }
  const g = gableDims(w, d);
  const th = Math.atan2(g.Hr, g.D / 2);
  for (const sd of [1, -1]) {
    const k = sd > 0 ? kind : (opt.kind2 || kind);
    const rz = sd * g.D / 4, y = wh + g.Hr / 2;
    const ny = Math.cos(th), nz = Math.sin(th) * sd;
    const mk = (geo, lift) => { geo.rotateX(-(Math.PI / 2 - th)); if (sd < 0) geo.rotateY(Math.PI); geo.translate(sh, y + ny * lift, rz + nz * lift); if (!g.along) geo.rotateY(Math.PI / 2); return geo; };
    push(parts, mk(box(S + 0.08, S + 0.08, 0.04), 0.035), M.wood, 0, 0, 0);
    push(parts, mk(iconPlane(k, S, false), 0.06), M.sign, 0, 0, 0);
  }
  return parts;
}

// ================================================================ 煙
function smokeSrc(R, b, lx, ly, lz, kind) {
  const w = R.sim.S.world;
  const cx = wx(b.x) + (b.w - 1) / 2, cz = wz(b.z) + (b.d - 1) / 2;
  const y = topY(w.hgt[b.door.z * W + b.door.x]);
  R.bgSmoke = R.bgSmoke || new Map();
  R.bgSmoke.set(b.id + ':' + kind, { x: cx + lx, y: y + ly, z: cz + lz, kind, seed: hsh(b.x, b.z, 3), hh: b.hh });
}

// ================================================================ 暮らし向き（家の見た目を分ける）
function wealthOf(R, b) {
  const hh = b.hh != null ? R.sim.S.households?.[b.hh] : null;
  if (!hh) return b.hh == null ? 'empty' : 'mid';
  // 目安は内装の「裕福・質素」と同じ（260・45銅貨）。ただし町並みに差が出るよう、下から4分の1は貧しい家、上から7分の1は裕福な家として描く
  if (!R._bgWealth) {
    const L = Object.values(R.sim.S.households || {}).filter((q) => q && q.house != null).map((q) => q.money || 0).sort((a, c) => a - c);
    const pct = (f) => L.length ? L[Math.min(L.length - 1, Math.floor(L.length * f))] : 0;
    R._bgWealth = { lo: Math.max(45, pct(0.25)), hi: Math.min(260, Math.max(120, pct(0.86))) };
  }
  const m = hh.money || 0, T = R._bgWealth;
  return m > T.hi ? 'rich' : m < T.lo ? 'poor' : 'mid';
}

// ================================================================ 種類ごとの形
// ctx は render.js の buildingParts の中身（add, M, W_, D_, face, south, kcol, door, windows, gable, flat, banner）
export function styledParts(R, b, ctx) {
  if (b.tribe) return false;
  const G = bind(R);
  const { M, W_, D_, south, kcol, door, windows, gable, flat, banner } = ctx;
  const add = (geo, mat, ...r) => ctx.add(geo, realMat(geo, mat), ...r);
  const F = frame(b);
  const parts = { push: (o) => add(o.g, o.mat, 0, 0, 0) };  // drawSign を add 経由で足すための受け口
  const sign = (kind, opt) => { const tmp = []; drawSign(tmp, b, kind, opt); for (const o of tmp) parts.push(o); };
  const at = (u, v, geo, mat, y, ry = 0) => { const [x, z] = F.P(u, v); add(geo, mat, x, y, z, F.ry + ry); };
  const doorSide = (hsh(b.x, b.z, 11) < 0.5 ? -1 : 1);
  // 家の形（煙突は位置と太さを選べる）
  const body = (wh, wall, roof, o = {}) => {
    add(R.box(W_, wh, D_), south ? (o.southWall || M.adobe) : wall, 0, wh / 2, 0);
    const flatTop = south && !o.gableSouth && b.roof !== 'tile';
    if (flatTop) flat(W_, D_, wh); else gable(W_, D_, wh, south ? M.tileRoofS : roof);
    // 南の国の民家は外で煮炊きするので煙突を付けない（もとの作りのとおり）
    if (o.chimney !== false && !(south && (!o.chimney || !o.chimney.smoke || o.chimney.smoke === 'home'))) {
      const c = o.chimney || {};
      const s = c.s || 0.28, h = c.h || 0.7, cxz = c.at || [W_ * 0.25, D_ * 0.18];
      const cy = (flatTop ? wh + 0.1 : roofY(W_, D_, wh, cxz[0], cxz[1]) - 0.15) + h / 2; // 屋根に埋もれない高さ
      add(R.box(s, h, s), c.mat || M.darkStone, cxz[0], cy, cxz[1]);
      if (c.smoke) smokeSrc(R, b, cxz[0], cy + h / 2, cxz[1], c.smoke);
    }
    if (o.windows !== false) windows(W_, D_, wh * 0.6, o.winMat);
    door(W_, D_, o.doorH);
    return { flatTop, wh };
  };
  const rsign = (kind, r, o = {}) => { const tmp = []; roofSign(tmp, b, kind, { wh: r.wh, flat: r.flatTop, ...o }); for (const q of tmp) parts.push(q); };
  const barrel = (u, v, s = 1) => { at(u, v, R.cyl(0.14 * s, 0.14 * s, 0.34 * s, 8), M.planks, 0.17 * s); at(u, v, R.cyl(0.145 * s, 0.145 * s, 0.03, 8), G.iron, 0.25 * s); at(u, v, R.cyl(0.145 * s, 0.145 * s, 0.03, 8), G.iron, 0.08 * s); };
  const potPlant = (u, v, big) => { at(u, v, R.cyl(0.1, 0.08, 0.16, 6), G.pot, 0.08); at(u, v, new THREE.DodecahedronGeometry(big ? 0.17 : 0.13, 0), big ? G.herb : G.herb2, 0.26); };
  const flowerBoxes = (wh) => {
    const n = Math.max(1, Math.floor(F.side * 2 / 1.0));
    for (let i = 0; i < n; i++) { const u = -F.side + (i + 0.5) * (F.side * 2 / n); if (Math.abs(u) < 0.35) continue; at(u, F.half + 0.07, R.box(0.3, 0.08, 0.1), M.wood, wh * 0.6 - 0.16); at(u, F.half + 0.08, R.box(0.26, 0.08, 0.08), i % 2 ? G.flower : G.flower2, wh * 0.6 - 0.08); }
  };
  switch (b.type) {
    case 'house': {
      const wl = wealthOf(R, b);
      if ((b.floors || 1) >= 2) {
        // 二階建てに建て増した家（housing.js）：高い壁、一階と二階の境の帯、二段の窓、太い煙突
        const rich = wl === 'rich', poor = wl === 'poor' || wl === 'empty';
        const wh = rich ? 2.3 : poor ? 1.9 : 2.1;
        if (rich) add(R.box(W_ + 0.08, 0.28, D_ + 0.08), south ? M.sandstone : M.stone, 0, 0.14, 0);
        body(wh, poor ? M.planks : M.timber, rich || b.roof === 'tile' ? M.tileRoof : M.thatch, { gableSouth: rich, windows: false, chimney: { s: 0.3, h: 0.8, mat: poor ? M.wood : M.stone, smoke: wl === 'empty' ? null : 'home' } });
        add(R.box(W_ + 0.06, 0.08, D_ + 0.06), M.wood, 0, wh * 0.5, 0);
        windows(W_, D_, wh * 0.36); windows(W_, D_, wh * 0.74);
        if (rich) flowerBoxes(wh * 0.74 / 0.6);
        return true;
      }
      if (wl === 'poor' || wl === 'empty') {
        // 貧しい家：低い壁、藁屋根、細い煙突、薪と桶。空き家は戸口に板を打ち付ける
        body(0.95, M.planks, M.thatch, { southWall: M.adobe, chimney: { s: 0.2, h: 0.5, mat: M.wood, smoke: wl === 'empty' ? null : 'home' } });
        at(doorSide * 0.45, F.half + 0.02, R.box(0.3, 0.22, 0.03), M.wood, 0.62, 0.15); // 継ぎ当ての板
        for (let i = 0; i < 3; i++) at(-doorSide * (F.side - 0.3), F.half + 0.12, R.box(0.45, 0.09, 0.09), M.wood, 0.05 + i * 0.09, 0);
        at(doorSide * (F.side - 0.25), F.half + 0.14, R.cyl(0.11, 0.09, 0.16, 6), M.planks, 0.08);
        if (wl === 'empty') { at(0, F.half + 0.05, R.box(0.5, 0.07, 0.04), M.planks, 0.42, 0.5); at(0, F.half + 0.05, R.box(0.5, 0.07, 0.04), M.planks, 0.3, -0.5); }
      } else if (wl === 'rich') {
        // 裕福な家：石の土台、高い壁、瓦屋根、太い石の煙突、花の窓箱、門灯
        add(R.box(W_ + 0.08, 0.28, D_ + 0.08), south ? M.sandstone : M.stone, 0, 0.14, 0);
        body(1.4, M.timber, M.tileRoof, { gableSouth: true, chimney: { s: 0.34, h: 0.85, mat: M.stone, smoke: 'home' } });
        flowerBoxes(1.4);
        at(-0.42, F.half + 0.1, R.box(0.12, 0.14, 0.12), G.lamp, 0.95); at(-0.42, F.half + 0.06, R.box(0.04, 0.2, 0.04), G.iron, 1.1);
      } else {
        body(1.15, M.timber, b.roof === 'tile' ? M.tileRoof : M.thatch, { chimney: { smoke: 'home' } });
        if (hsh(b.x, b.z, 5) < 0.5) potPlant(doorSide * (F.side - 0.25), F.half + 0.14, false);
      }
      return true;
    }
    case 'tavern': {
      if (b.hall) {
        // 独立村の寄り合い所：大きめの藁屋根、掲示板、鐘の看板
        rsign('bell', body(1.35, M.timber2, M.thatch, { chimney: { smoke: 'home' } }));
        at(-doorSide * (F.side - 0.45), F.half + 0.12, R.box(0.6, 0.45, 0.05), M.planks, 0.75);
        for (let i = 0; i < 3; i++) at(-doorSide * (F.side - 0.45) - 0.18 + i * 0.18, F.half + 0.15, R.box(0.12, 0.14, 0.01), G.paper, 0.8 + (i % 2) * 0.1);
        sign('bell', { y: 1.0, side: doorSide });
        return true;
      }
      const inn = /宿/.test(b.name || '');
      // 酒場：大きな瓦屋根、煙突2本、戸口の樽と外の席、ジョッキの看板（宿屋ならベッドの看板も）
      const r = body(1.5, M.timber, M.tileRoof, { gableSouth: true, chimney: { s: 0.3, h: 0.8, smoke: 'kitchen', at: [-W_ * 0.3, -D_ * 0.12] } });
      add(R.box(0.26, 0.6, 0.26), M.darkStone, W_ * 0.3, roofY(W_, D_, 1.5, W_ * 0.3, D_ * 0.12) + 0.15, D_ * 0.12);
      rsign('mug', r, { kind2: inn ? 'bed' : 'mug' });
      barrel(-doorSide * (F.side - 0.2), F.half + 0.2); barrel(-doorSide * (F.side - 0.5), F.half + 0.18, 0.9);
      at(-doorSide * (F.side - 0.35), F.half + 0.2, R.cyl(0.13, 0.13, 0.3, 8), M.planks, 0.5);
      // 外の席（樽のテーブルと腰掛け）
      const tu = doorSide * (F.side - 0.35);
      at(tu, F.half + 0.35, R.box(0.4, 0.05, 0.3), M.planks, 0.34); at(tu, F.half + 0.35, R.box(0.08, 0.32, 0.08), M.wood, 0.16);
      for (const e of [-1, 1]) at(tu + e * 0.32, F.half + 0.35, R.box(0.12, 0.18, 0.26), M.wood, 0.09);
      at(tu - 0.08, F.half + 0.35, R.cyl(0.035, 0.035, 0.08, 6), G.bread, 0.4);
      sign('mug', { y: 1.05, side: doorSide, at: 0.55 });
      if (inn) sign('bed', { y: 1.05, side: -doorSide, at: 0.55, lamp: false });
      return true;
    }
    case 'bakery': {
      // パン屋：藁屋根、太い窯の煙突、外の石窯と、パンを並べた棚
      rsign('bread', body(1.2, M.timber, M.thatch, { chimney: { s: 0.34, h: 0.8, mat: M.stone, smoke: 'bake', at: [W_ * 0.3, D_ * 0.18] } }), { shift: -0.3 });
      const ou = -doorSide * (F.side - 0.35);
      at(ou, F.half + 0.35, R.box(0.55, 0.3, 0.5), M.stone, 0.15);
      at(ou, F.half + 0.35, new THREE.SphereGeometry(0.27, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.adobe, 0.3);
      at(ou, F.half + 0.6, R.box(0.16, 0.12, 0.02), G.forge, 0.4);
      const su = doorSide * (F.side - 0.35);
      at(su, F.half + 0.18, R.box(0.5, 0.05, 0.22), M.planks, 0.45); at(su, F.half + 0.18, R.box(0.5, 0.05, 0.22), M.planks, 0.22);
      for (const e of [-1, 1]) at(su + e * 0.23, F.half + 0.18, R.box(0.04, 0.5, 0.2), M.wood, 0.25);
      for (let i = 0; i < 3; i++) { at(su - 0.15 + i * 0.15, F.half + 0.18, R.cyl(0.06, 0.07, 0.12, 6), G.bread, 0.53, Math.PI / 2 * (i % 2)); at(su - 0.15 + i * 0.15, F.half + 0.18, R.box(0.12, 0.06, 0.08), G.bread, 0.28); }
      sign('bread', { y: 1.0, side: doorSide, at: 0.5 });
      return true;
    }
    case 'smithy': {
      // 鍛冶場：灰色の屋根、煙を吐く太い石の煙突、外の炉と金床、水桶、立て掛けた武器
      rsign('anvil', body(1.15, M.timber2, M.greyRoof, { chimney: { s: 0.5, h: 1.3, mat: M.stone, smoke: 'forge', at: [-W_ * 0.3, -D_ * 0.12] } }), { shift: 0.3 });
      const fu = -doorSide * (F.side - 0.35);
      at(fu, F.half + 0.38, R.box(0.55, 0.42, 0.5), M.darkStone, 0.21);
      at(fu, F.half + 0.38, R.box(0.4, 0.04, 0.36), G.forge, 0.43);
      smokeSrc(R, b, ...(() => { const [x, z] = F.P(fu, F.half + 0.38); return [x, 0.5, z]; })(), 'ember');
      const au = doorSide * (F.side - 0.3);
      at(au, F.half + 0.4, R.box(0.14, 0.22, 0.12), M.darkStone, 0.11);
      at(au, F.half + 0.4, R.box(0.32, 0.08, 0.14), G.iron, 0.26);
      at(au + 0.2, F.half + 0.18, R.cyl(0.12, 0.12, 0.2, 8), M.planks, 0.1); at(au + 0.2, F.half + 0.18, R.cyl(0.1, 0.1, 0.01, 8), G.water, 0.2);
      for (let i = 0; i < 3; i++) at(au - 0.3 + i * 0.1, F.half + 0.08, R.box(0.03, 0.55, 0.03), i === 1 ? G.iron : M.gold, 0.3, 0);
      sign('anvil', { y: 0.95, side: doorSide, at: 0.5 });
      return true;
    }
    case 'workshop': {
      const ship = /造船/.test(b.name || '');
      rsign(ship ? 'anchor' : 'saw', body(1.2, M.timber2, M.thatch, { chimney: { s: 0.22, h: 0.55, at: [W_ * 0.3, D_ * 0.18] } }), { shift: -0.3 });
      // 材木の山と木挽き台（造船所は作りかけの舟）
      const lu = -doorSide * (F.side - 0.35);
      for (let i = 0; i < 3; i++) at(lu, F.half + 0.25, R.box(0.12, 0.1, 0.7), M.wood, 0.05 + i * 0.1, Math.PI / 2 + (i % 2) * 0.1);
      if (ship) { at(doorSide * (F.side - 0.6), F.half + 0.45, R.box(0.9, 0.18, 0.32), M.hull, 0.12, Math.PI / 2); for (let i = 0; i < 3; i++) at(doorSide * (F.side - 0.6) - 0.3 + i * 0.3, F.half + 0.45, R.box(0.04, 0.32, 0.36), M.wood, 0.3, Math.PI / 2); }
      else { const su = doorSide * (F.side - 0.3); at(su, F.half + 0.3, R.box(0.5, 0.05, 0.12), M.wood, 0.3); for (const e of [-1, 1]) at(su + e * 0.2, F.half + 0.3, R.box(0.04, 0.3, 0.2), M.wood, 0.15); }
      sign(ship ? 'anchor' : 'saw', { y: 1.0, side: doorSide, at: 0.5 });
      return true;
    }
    case 'guild': {
      rsign('guild', body(1.4, M.timber2, M.slate, { chimney: { s: 0.28, h: 0.7, at: [W_ * 0.3, D_ * 0.18] } }), { shift: -0.3 });
      banner(W_ / 2 - 0.2, D_ / 2 - 0.2, 1.4, kcol);
      // 依頼の掲示板
      const nu = -doorSide * (F.side - 0.5);
      at(nu, F.half + 0.1, R.box(0.7, 0.5, 0.05), M.planks, 0.75);
      for (let i = 0; i < 4; i++) at(nu - 0.24 + i * 0.16, F.half + 0.13, R.box(0.12, 0.15, 0.01), G.paper, 0.7 + (i % 2) * 0.14);
      for (const e of [-1, 1]) at(nu + e * 0.33, F.half + 0.1, R.box(0.05, 1.0, 0.05), M.wood, 0.5);
      sign('guild', { y: 1.1, side: doorSide, at: 0.55 });
      return true;
    }
    case 'charkiln': {
      // 炭焼き窯：土を盛った丸い窯（焚き口と煙出し）、割った薪の山、雨よけの小屋根、炭俵
      add(R.box(W_ + 0.2, 0.05, D_ + 0.2), G.soil, 0, 0.025, 0);
      const s = F.side, h = F.half;
      at(-s * 0.3, -h * 0.1, new THREE.SphereGeometry(0.62, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), G.pot, 0.04);
      at(-s * 0.3, -h * 0.1 + 0.6, R.box(0.26, 0.22, 0.1), G.iron, 0.12);   // 焚き口
      at(-s * 0.3 + 0.25, -h * 0.1 - 0.2, R.cyl(0.07, 0.08, 0.3, 6), M.darkStone, 0.72);   // 煙出し
      { const [x, z] = F.P(-s * 0.3 + 0.25, -h * 0.1 - 0.2); smokeSrc(R, b, x, 0.9, z, 'ember'); }
      // 薪の山
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) at(s * 0.55 - 0.25 + j * 0.2 + i * 0.1, h * 0.35, R.cyl(0.08, 0.08, 0.7, 6), M.wood, 0.09 + i * 0.15, Math.PI / 2);
      // 雨よけの小屋根と炭俵
      for (const [u, v] of [[s * 0.25, -h + 0.25], [s - 0.15, -h + 0.25], [s * 0.25, -h * 0.1], [s - 0.15, -h * 0.1]]) at(u, v, R.box(0.06, 0.7, 0.06), M.planks, 0.35);
      at(s * 0.62, -h * 0.55, R.box(s * 0.85, 0.06, h * 0.9), M.thatch, 0.72);
      for (let i = 0; i < 3; i++) at(s * 0.4 + i * 0.22, -h * 0.55, R.cyl(0.1, 0.1, 0.26, 6), G.hay, 0.13);
      return true;
    }
    case 'herbgarden': {
      // 薬草園：低い木の柵で囲んだ畑。畝に薬草が並び、ところどころ紫や黄の花。奥に道具小屋と水桶
      add(R.box(W_ + 0.2, 0.06, D_ + 0.2), G.soil, 0, 0.03, 0);
      const s = F.side, h = F.half;
      // 柵（正面の真ん中は入口）
      const rail = (u0, u1, v) => { const L = u1 - u0; at((u0 + u1) / 2, v, R.box(L, 0.05, 0.05), M.wood, 0.32); at((u0 + u1) / 2, v, R.box(L, 0.05, 0.05), M.wood, 0.16); for (let u = u0; u <= u1 + 1e-6; u += 0.5) at(u, v, R.box(0.07, 0.42, 0.07), M.planks, 0.21); };
      const railV = (u, v0, v1) => { const L = v1 - v0; at(u, (v0 + v1) / 2, R.box(0.05, 0.05, L), M.wood, 0.32); at(u, (v0 + v1) / 2, R.box(0.05, 0.05, L), M.wood, 0.16); for (let v = v0; v <= v1 + 1e-6; v += 0.5) at(u, v, R.box(0.07, 0.42, 0.07), M.planks, 0.21); };
      rail(-s, -0.35, h); rail(0.35, s, h); rail(-s, s, -h); railV(-s, -h, h); railV(s, -h, h);
      // 畝と薬草
      let k = 0;
      for (let v = -h + 0.9; v <= h - 0.45; v += 0.55) {
        at(0, v, R.box(s * 2 - 0.5, 0.1, 0.3), G.soil, 0.1);
        for (let u = -s + 0.4; u <= s - 0.35; u += 0.32) {
          const r = hsh(b.x + k, b.z, 21);
          const mat = r < 0.12 ? G.bloom : r < 0.2 ? G.flower2 : (k % 2 ? G.herb : G.herb2);
          at(u, v, new THREE.DodecahedronGeometry(0.1 + r * 0.05, 0), mat, 0.22);
          k++;
        }
      }
      // 道具小屋と水桶（奥の隅）
      at(-s + 0.45, -h + 0.4, R.box(0.6, 0.55, 0.5), M.planks, 0.28);
      at(-s + 0.45, -h + 0.4, R.box(0.72, 0.08, 0.62), M.thatch, 0.6);
      barrel(s - 0.35, -h + 0.35, 0.9);
      potPlant(0.55, h + 0.12, true); potPlant(-0.55, h + 0.12, false);
      return true;
    }
    case 'clinic': {
      // 診療所：白い壁、瓦屋根、戸口の薬草の鉢、緑の十字の看板
      add(R.box(W_, 1.2, D_), south ? M.adobe : G.plaster, 0, 0.6, 0);
      if (south) flat(W_, D_, 1.2); else gable(W_, D_, 1.2, M.tileRoof);
      add(R.box(0.24, 0.55, 0.24), M.stone, W_ * 0.3, (south ? 1.3 : roofY(W_, D_, 1.2, W_ * 0.3, D_ * 0.18) - 0.15) + 0.27, D_ * 0.18);
      rsign('cross', { wh: 1.2, flatTop: south }, { shift: -0.3 });
      windows(W_, D_, 0.72); door(W_, D_);
      for (let i = 0; i < 3; i++) potPlant(-doorSide * (F.side - 0.2 - i * 0.3), F.half + 0.14, i === 1);
      potPlant(doorSide * (F.side - 0.2), F.half + 0.14, true);
      sign('cross', { y: 0.95, side: doorSide, at: 0.5 });
      return true;
    }
    case 'school': {
      // 学校：石盤の屋根、屋根の上の鐘楼（鐘が見える）、本の看板
      const rs = body(1.4, M.timber2, M.slate, { chimney: false });
      rsign('book', rs, { shift: (W_ >= D_ ? W_ : D_) * 0.28 + 0.1, size: 0.56 });
      const hy = rs.flatTop ? 1.55 : roofY(W_, D_, 1.4, 0, 0) - 0.05;
      for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) add(R.box(0.06, 0.55, 0.06), M.wood, x, hy + 0.27, z);
      add(R.cone(0.42, 0.4, 4), M.slate, 0, hy + 0.75, 0, Math.PI / 4);
      add(cyl(0.08, 0.16, 0.22, 8), M.gold, 0, hy + 0.35, 0);
      add(R.box(0.52, 0.06, 0.52), M.wood, 0, hy, 0);
      sign('book', { mode: 'wall', y: 1.05, side: doorSide, at: 0.6 });
      return true;
    }
    case 'stable': {
      // 厩舎：板壁と藁屋根、大きな戸口、前の柵、干し草の山と水桶
      add(R.box(W_, 1.0, D_), M.planks, 0, 0.5, 0); add(R.prism(W_ + 0.3, D_ + 0.4, 0.6), M.thatch, 0, 1.0, 0);
      const [dx, dz] = F.P(0, F.half + 0.02); add(R.box(F.fx ? 0.05 : W_ * 0.6, 0.8, F.fx ? D_ * 0.6 : 0.05), M.black, dx, 0.4, dz);
      for (const e of [-1, 1]) {
        const u = e * (F.side - 0.25);
        at(u, F.half + 0.3, R.box(0.36, 0.28, 0.28), G.hay, 0.14); at(u, F.half + 0.3, R.box(0.3, 0.2, 0.24), G.hay, 0.38, 0.3);
      }
      at(0, F.half + 0.45, R.box(0.6, 0.14, 0.2), M.planks, 0.07); at(0, F.half + 0.45, R.box(0.54, 0.02, 0.14), G.water, 0.14);
      at(0, F.half + 0.03, R.box(F.side * 1.3, 0.06, 0.05), M.wood, 0.84);
      sign('horseshoe', { y: 0.72, side: doorSide, at: Math.min(F.side - 0.25, 0.9), size: 0.46 });
      return true;
    }
    case 'barracks': {
      add(R.box(W_, 1.3, D_), south ? M.sandstone : M.stone, 0, 0.65, 0);
      for (let i = 0; i < Math.floor(W_); i++) add(R.box(0.3, 0.25, 0.3), south ? M.sandstone : M.stone, -W_ / 2 + 0.3 + i, 1.42, D_ / 2 - 0.15);
      windows(W_, D_, 0.8); door(W_, D_); banner(0, 0, 1.3, kcol);
      // 四隅の旗と、戸口の武器立て（槍）
      banner(-W_ / 2 + 0.15, -D_ / 2 + 0.15, 1.3, kcol); banner(W_ / 2 - 0.15, -D_ / 2 + 0.15, 1.3, kcol);
      const ru = -doorSide * (F.side - 0.4);
      at(ru, F.half + 0.2, R.box(0.6, 0.06, 0.1), M.wood, 0.55); at(ru, F.half + 0.2, R.box(0.6, 0.06, 0.1), M.wood, 0.15);
      for (let i = 0; i < 4; i++) { at(ru - 0.22 + i * 0.15, F.half + 0.22, R.box(0.03, 0.95, 0.03), M.wood, 0.48); at(ru - 0.22 + i * 0.15, F.half + 0.22, R.box(0.05, 0.12, 0.05), G.iron, 1.0); }
      sign('shield', { mode: 'wall', y: 0.95, side: doorSide, at: 0.65 });
      rsign('shield', { wh: 1.3, flatTop: true }, { shift: 0.6 });
      return true;
    }
    case 'prison': {
      // 牢獄：暗い石、鉄格子の窓、壁の上の忍び返し、鍵の札
      add(R.box(W_, 1.5, D_), M.darkStone, 0, 0.75, 0); door(W_, D_, 0.8);
      add(R.box(W_ + 0.1, 0.1, D_ + 0.1), M.darkStone, 0, 1.55, 0);
      for (const s of [-1, 1]) {
        const n = Math.max(1, Math.floor(W_));
        for (let i = 0; i < n; i++) { const x = -W_ / 2 + (i + 0.5) * (W_ / n); add(R.box(0.28, 0.26, 0.04), M.black, x, 1.0, s * (D_ / 2 + 0.01)); for (let k = -1; k <= 1; k++) add(R.box(0.03, 0.3, 0.03), G.iron, x + k * 0.08, 1.0, s * (D_ / 2 + 0.04)); }
        add(R.box(0.04, 0.26, 0.28), M.black, s * (W_ / 2 + 0.01), 1.0, 0); for (let k = -1; k <= 1; k++) add(R.box(0.03, 0.3, 0.03), G.iron, s * (W_ / 2 + 0.04), 1.0, k * 0.08);
      }
      for (let i = 0; i < Math.floor(W_ * 3); i++) for (const s of [-1, 1]) add(R.cone(0.04, 0.16, 4), G.iron, -W_ / 2 + 0.15 + i / 3, 1.68, s * (D_ / 2));
      sign('key', { mode: 'wall', y: 1.2, side: doorSide, at: 0.55, size: 0.4 });
      return true;
    }
    case 'mansion': {
      add(R.box(W_ + 0.08, 0.3, D_ + 0.08), south ? M.sandstone : M.stone, 0, 0.15, 0);
      body(2.1, M.timber2, M.slate, { gableSouth: true, chimney: { s: 0.34, h: 0.8, mat: M.stone, smoke: 'home' } });
      windows(W_, D_, 0.6); add(R.box(0.28, 0.8, 0.28), M.darkStone, -W_ * 0.3, 2.9, 0);
      flowerBoxes(2.1);
      // 門柱と灯り、植え込み
      for (const e of [-1, 1]) { at(e * 0.45, F.half + 0.22, R.box(0.16, 0.7, 0.16), M.stone, 0.35); at(e * 0.45, F.half + 0.22, R.box(0.14, 0.14, 0.14), G.lamp, 0.78); }
      for (const e of [-1, 1]) at(e * (F.side - 0.35), F.half + 0.2, R.box(0.55, 0.3, 0.22), G.herb, 0.15);
      sign('crown', { mode: 'wall', y: 1.55, side: 1, at: 0, size: 0.46, lamp: false });
      return true;
    }
    case 'market': {
      // 市場：いまの屋台に加え、端に旗竿と看板
      for (let i = 0; i < Math.floor(W_ / 1.3); i++) {
        const x = -W_ / 2 + 0.6 + i * 1.3;
        add(R.box(1.0, 0.5, 0.6), M.planks, x, 0.25, 0.1);
        add(R.box(1.15, 0.05, 0.9), i % 2 ? M.awning2 : M.awning, x, 1.15, 0);
        for (const px of [-0.5, 0.5]) add(R.box(0.06, 1.2, 0.06), M.wood, x + px, 0.6, -0.35);
        add(R.box(0.18, 0.12, 0.18), M.gold, x - 0.25, 0.56, 0.1); add(R.box(0.18, 0.12, 0.18), M.red, x, 0.56, 0.1);
        if (i % 2) add(R.box(0.16, 0.1, 0.16), G.herb2, x + 0.28, 0.56, 0.1); else add(R.box(0.2, 0.1, 0.14), G.bread, x + 0.28, 0.56, 0.1);
      }
      const px = W_ / 2 - 0.1, pz = -D_ / 2 + 0.15;
      add(R.box(0.07, 2.0, 0.07), M.wood, px, 1.0, pz);
      add(new THREE.PlaneGeometry(0.45, 0.28), M.red, px + 0.25, 1.85, pz);
      add(new THREE.PlaneGeometry(0.3, 0.2), M.white, px + 0.2, 1.55, pz);
      const k = signKindOf(b), S = 0.56;
      add(R.box(0.04, S + 0.06, S + 0.06), M.wood, px, 1.05, pz + 0.36, 0);
      add(R.box(0.04, 0.04, 0.36), G.iron, px, 1.38, pz + 0.18);
      add(iconPlane(k, S, false), G.sign, px + 0.026, 1.05, pz + 0.36, Math.PI / 2);
      add(iconPlane(k, S, true), G.sign, px - 0.026, 1.05, pz + 0.36, Math.PI / 2);
      return true;
    }
    case 'mill': {
      add(R.cyl(0.7, 0.9, 2.2, 8), south ? M.adobe : M.stone, 0, 1.1, 0); add(R.cone(0.95, 0.9, 8), M.thatch, 0, 2.65, 0);
      door(1.6, 1.6, 0.6);
      // 粉袋
      for (let i = 0; i < 3; i++) at(-0.45 + (i % 2) * 0.2, F.half + 0.25, R.box(0.22, 0.26, 0.18), G.paper, 0.13 + (i === 2 ? 0.24 : 0), 0.2 * i);
      sign('wheat', { mode: 'wall', y: 0.95, side: 1, at: 0.42, size: 0.36, lamp: false });
      return true;
    }
    case 'bank': case 'mint': {
      // 両替商の館・造幣所：石造り、正面の白い柱、金の縁取り、硬貨の看板（造幣所は炉の煙）
      const wall = south ? M.sandstone : M.stone;
      add(R.box(W_, 1.5, D_), wall, 0, 0.75, 0);
      if (south) flat(W_, D_, 1.5); else gable(W_, D_, 1.5, M.slate);
      rsign('coin', { wh: 1.5, flatTop: south }, { shift: 0.3 });
      add(R.box(W_ + 0.06, 0.08, D_ + 0.06), M.gold, 0, 1.5, 0);
      windows(W_, D_, 0.95); door(W_, D_, 0.75);
      const n = Math.max(2, Math.floor(F.side * 2 / 0.55));
      for (let i = 0; i < n; i++) { const u = -F.side + 0.2 + i * ((F.side * 2 - 0.4) / (n - 1)); if (Math.abs(u) < 0.3) continue; at(u, F.half + 0.12, R.cyl(0.07, 0.08, 1.4, 6), M.white, 0.7); }
      if (b.type === 'mint') { const cy = (south ? 1.6 : roofY(W_, D_, 1.5, -W_ * 0.3, -D_ * 0.15) - 0.15); add(R.box(0.46, 1.1, 0.46), M.darkStone, -W_ * 0.3, cy + 0.55, -D_ * 0.15); smokeSrc(R, b, -W_ * 0.3, cy + 1.1, -D_ * 0.15, 'forge'); }
      sign('coin', { mode: 'wall', y: 1.15, side: doorSide, at: 0.62, size: 0.46 });
      return true;
    }
    case 'dojo': {
      add(R.box(W_, 1.2, D_), south ? M.adobe : M.planks, 0, 0.6, 0);
      add(R.box(W_ + 0.4, 0.1, D_ + 0.4), M.darkStone, 0, 1.25, 0);
      gable(W_, D_, 1.3, south ? M.tileRoofS : M.greyRoof);
      rsign('swords', { wh: 1.3, flatTop: false });
      windows(W_, D_, 0.8); door(W_, D_, 0.75);
      for (let i = 0; i < 2; i++) at(-0.6 + i * 1.2, F.half + 0.35, R.box(0.06, 0.8, 0.06), M.wood, 0.4);
      // 木刀の掛け台
      const ru = -doorSide * (F.side - 0.35);
      at(ru, F.half + 0.12, R.box(0.5, 0.05, 0.08), M.wood, 0.7); for (let i = 0; i < 3; i++) at(ru - 0.15 + i * 0.15, F.half + 0.15, R.box(0.03, 0.6, 0.03), M.planks, 0.4);
      sign('swords', { mode: 'wall', y: 1.0, side: doorSide, at: 0.55, size: 0.44 });
      return true;
    }
    default: return false;
  }
}

// 看板だけを足したい建物（形は render.js のまま）
export function extraSignParts(R, b, add) {
  bind(R);
  const k = signKindOf(b);
  if (!k || !['church', 'magictower', 'academy', 'guardpost', 'camp'].includes(b.type)) return;
  const tmp = [];
  if (b.type === 'church') drawSign(tmp, b, k, { mode: 'wall', y: 1.25, side: 1, at: 0.7, size: 0.44 });
  else if (b.type === 'magictower') {
    // 丸い塔なので、戸口の前に立て看板
    const F = frame(b), M = mats();
    const [x, z] = F.P(0.55, 1.05);
    push(tmp, box(0.05, 0.9, 0.05), M.wood, x, 0.45, z, F.ry);
    push(tmp, box(0.48, 0.48, 0.04), M.wood, x, 0.85, z, F.ry);
    const [x2, z2] = F.P(0.55, 1.075); push(tmp, iconPlane(k, 0.42, false), M.sign, x2, 0.85, z2, F.ry);
  } else if (b.type === 'academy') drawSign(tmp, b, k, { mode: 'wall', y: 1.0, side: -1, at: 0.8, size: 0.44 });
  else if (b.type === 'guardpost') drawSign(tmp, b, k, { mode: 'wall', y: 0.75, side: -1, at: 0.45, size: 0.34, lamp: true });
  else if (b.type === 'camp') drawSign(tmp, b, k, { mode: 'hang', y: 0.62, side: 1, at: 0.3, size: 0.32, lamp: false });
  for (const o of tmp) add(o.g, o.mat, 0, 0, 0);
}

// ================================================================ 毎フレーム：看板の夜の明るさと煙
const SMOKE_MAX = 480, PUFFS = { forge: 6, bake: 5, kitchen: 4, home: 3, ember: 2 };
let smokeMesh = null, dummy = null, visList = [], visT = -1;
function smokeActive(kind, h, e, sim) {
  switch (kind) {
    case 'forge': return h >= 6 && h < 20;
    case 'ember': return h >= 6 && h < 20;
    case 'bake': return h >= 3 && h < 14;
    case 'kitchen': return h >= 6 && h < 23;
    case 'home': {
      if (e.hh == null || !sim.S.households?.[e.hh]) return false;
      const meal = (h >= 6 && h < 8) || (h >= 11.5 && h < 13) || (h >= 17.5 && h < 20) || ((sim.seasonIdx?.() === 3) && (h >= 5 && h < 22));
      return meal && e.seed < 0.7;
    }
  }
  return false;
}
export function bldFxUpdate(R, dayF, now, dt) {
  const G = mats();
  G.sign.emissiveIntensity = (1 - dayF) * 0.45;
  if (G.ownLamp) G.lamp.emissiveIntensity = (1 - dayF) * 1.6;
  if (!R.bgSmoke || !R.bgSmoke.size) return;
  if (!smokeMesh) {
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.62, depthWrite: false });
    smokeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, SMOKE_MAX);
    smokeMesh.frustumCulled = false; smokeMesh.count = 0; smokeMesh.renderOrder = 2;
    smokeMesh.setColorAt(0, new THREE.Color('#fff'));
    R.scene.add(smokeMesh); dummy = new THREE.Object3D();
  }
  if (smokeMesh.parent !== R.scene) R.scene.add(smokeMesh);
  const sim = R.sim, h = sim.hour();
  const zoom = R.camera.zoom;
  // 見えている範囲の煙突だけを、0.5秒ごとに選び直す
  if (now - visT > 0.5 || now < visT) {
    visT = now; visList = [];
    const t = R.controls.target, r = 18 / zoom + 6;
    if (zoom >= 0.9) for (const e of R.bgSmoke.values()) if (Math.abs(e.x - t.x) < r * 1.4 && Math.abs(e.z - t.z) < r * 1.4 && smokeActive(e.kind, h, e, sim)) visList.push(e);
  }
  const rain = sim.S.weather === 'rain';
  let n = 0;
  const c = new THREE.Color();
  for (const e of visList) {
    const P = PUFFS[e.kind] || 3;
    for (let k = 0; k < P && n < SMOKE_MAX; k++) {
      const life = e.kind === 'ember' ? 1.2 : 3.2;
      const ph = ((now / life) + k / P + e.seed) % 1;
      const rise = e.kind === 'ember' ? 0.5 : e.kind === 'forge' ? 1.9 : 1.5;
      const drift = (rain ? 0.15 : 0.45) * ph * ph;
      const wob = Math.sin(now * 1.7 + k * 2.1 + e.seed * 9) * 0.06 * ph;
      const s = e.kind === 'ember' ? 0.05 * (1 - ph) + 0.01 : (e.kind === 'forge' ? 0.16 : 0.12) + ph * 0.34 - Math.max(0, ph - 0.8) * 1.4;
      dummy.position.set(e.x + drift + wob, e.y + 0.1 + ph * rise, e.z - drift * 0.4 + wob * 0.5);
      dummy.scale.setScalar(Math.max(0.01, s));
      dummy.rotation.set(0, ph * 1.3 + e.seed * 6, 0);
      dummy.updateMatrix();
      smokeMesh.setMatrixAt(n, dummy.matrix);
      if (e.kind === 'ember') c.set(ph < 0.5 ? '#ffb040' : '#ff5a20');
      else if (e.kind === 'forge') c.setRGB(0.42 + ph * 0.3, 0.42 + ph * 0.3, 0.45 + ph * 0.3);
      else c.setRGB(0.82 + ph * 0.12, 0.82 + ph * 0.12, 0.84 + ph * 0.12);
      smokeMesh.setColorAt(n, c);
      n++;
    }
  }
  smokeMesh.count = n;
  smokeMesh.instanceMatrix.needsUpdate = true;
  if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;
}

// ================================================================ 建物の呼び名（ui.js の説明欄）
export function bldTypeLabel(b, base) {
  if (!b) return base;
  if (b.tribe && b.style) return tribalLabel(b);
  if (b.type === 'shrine') return '祠';
  if (b.type === 'herbgarden') return '薬草園';
  if (b.type === 'charkiln') return '炭焼き窯';
  if (b.hall) return b.type === 'church' ? '修道院（村の中心）' : '寄り合い所（村の集会所）';
  if (b.type === 'tavern') return /宿/.test(b.name || '') ? '宿屋・酒場' : '酒場';
  if (b.type === 'house' && (b.floors || 1) >= 2) return `${base}（二階建て）`;
  return base;
}
