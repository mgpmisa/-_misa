// 立ち止まった生き物どうしの間あい（技術部）
// ・立ち止まっている人・生き物（働く・話す・待つ・外で眠る・休む・倒れている・亡骸）が、同じ点に重ならないように、
//   近くの空いている場所に「立ち位置」を割り当てる。歩いている間とすれ違いは重なってよい（割り当てない）。
// ・ずらすのは見た目（描画の位置）だけ。本当の位置 p.pos・c.pos は変えないので、道探し・到着の判定・会話・戦い・
//   セーブには一切影響しない（道で詰まって動けなくなることが起こりえない）。
// ・立ち位置は「立ち止まった時」に一度だけ決め、立ち去るまで使い回す。毎フレームの仕事は、状態の確認と表の引き当てだけ。
// ・決め方：
//     ふつう …… 行き先の点から近い順に、輪（半径0.72ずつ）の上の空いた場所。人が集まると輪になって囲む。立った人は輪の中心を向く
//     畑 …… 畝（1マスごとの列）に沿って、0.75マスおきに並ぶ
//     話している2人 …… 真ん中をはさんで0.8マス離れて向かい合う
//     亡骸 …… 倒れた場所の近くの空いた場所へ、ゆっくり寄せる
// ・置いてよい所：その生き物が今いる地面と同じ種類（人・獣は歩ける地面、魚は水、空を飛ぶものはどこでも）。
//   建物・水・柵・城壁の上には置かない（world.js の walkable）。行き先の点から立ち位置までの途中も確かめる。
// ・中心の間の広さ：人どうし0.7マス（子どもは0.56）。生き物は体の大きさ（SPECIES.size）に合わせる（竜は約2.2マス）。
//   空を飛ぶものは空の者どうしでだけ間あいを取る。
// three.js を使わないので、node のヘッドレス試験でもそのまま読み込める。
import { W, H, T, walkable } from './world.js';
import { SPECIES } from './data.js';

const CELL = 2;             // 立ち位置の升目（マス）
const RING = 0.72;          // 輪の間隔（マス）
const RINGS = 6;            // 輪の数（半径およそ4.3マスまで探す）
const PAIR_GAP = 0.4;       // 話す2人の、真ん中からの距離
const SWEEP = 300;
const MAX_SHIFT = 4.4;      // 行き先の点から立ち位置までの最大（マス）
const PAIR_MAX = 2.2;       // 話す2人の真ん中を、元の真ん中からずらす最大（輪の上の距離。×1.2）          // この回数ごとに、古い立ち位置を片づける

// ---------- 候補の並び（一度だけ作る） ----------
const RING_OFF = [];        // [dx, dz, 輪の番号]（角度の回転は立ち位置ごとに掛ける）
for (let k = 0; k <= RINGS; k++) {
  const r = k * RING, n = k === 0 ? 1 : Math.round((2 * Math.PI * r) / RING);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (k % 2 ? 0 : Math.PI / n); RING_OFF.push([Math.cos(a) * r, Math.sin(a) * r]); }
}
const ROW_OFF = [];         // 畑の畝：[dx, 列の差]
for (let dz = -3; dz <= 3; dz++) for (let i = -5; i <= 5; i++) ROW_OFF.push([i * 0.75, dz]);
ROW_OFF.sort((a, b) => (a[0] * a[0] + a[1] * a[1] * 1.2) - (b[0] * b[0] + b[1] * b[1] * 1.2));

const OUT = { x: 0, z: 0 };  // 歩いている者に返す入れ物（使い回す）

function st(sim) {
  let s = sim._spc;
  if (!s || s.S !== sim.S) s = sim._spc = { S: sim.S, frame: 0, byId: new Map(), grid: new Map(), rmax: 0.35, stats: { assign: 0, pair: 0, fail: 0 } };
  return s;
}
const ckey = (x, z) => ((Math.floor(x / CELL) + 1024) << 12) | (Math.floor(z / CELL) + 1024);
function hashStr(id) { let h = 2166136261; const t = String(id); for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return h >>> 0; }

// 立ち止まっているか（歩いている・戦っている・建物の中の者は割り当てない）
function still(e, human) {
  if (!e || !e.pos) return false;
  if (human) {
    if (e.deathYear != null || e.inside != null || e.fight) return false;
    return !!e.talk || !e.action || e.action.phase !== 'walk';
  }
  if (e.dormant || e.inDungeon) return false;
  return e.hp <= 0 || (!e.goal && !e.fight);
}
function radiusOf(sim, e, human) {
  if (human) { const a = sim.ageOf ? sim.ageOf(e) : 20; return a < 5 ? 0.22 : a < 13 ? 0.28 : 0.35; }
  const sz = SPECIES[e.sp]?.size || 1;
  return Math.max(0.27, Math.min(1.2, sz * 0.45));
}
function layerOf(e, human) { return !human && SPECIES[e.sp]?.flies && e.hp > 0 ? 1 : 0; }

// ---------- 地面の確かめ ----------
function tile(sim, x, z) {
  x = Math.round(x); z = Math.round(z);
  if (x < 0 || z < 0 || x >= W || z >= H) return -1;
  return sim.S.world.tiles[z * W + x];
}
const WATER = (t) => t === T.SEA || t === T.DEEP;
function tileOk(anchorT, t, L) {
  if (t < 0) return false;
  if (L === 1) return true;                               // 空を飛ぶもの
  if (anchorT >= 0 && walkable(anchorT)) return walkable(t);
  if (WATER(anchorT)) return WATER(t);                    // 泳ぐもの
  return t === anchorT;                                   // そのほか（川のワニなど）は同じ地面だけ
}
function groundOk(sim, ax, az, x, z, anchorT, L) {
  if (!tileOk(anchorT, tile(sim, x, z), L)) return false;
  const d = Math.abs(x - ax) + Math.abs(z - az);
  if (L === 1 || d < 0.5) return true;
  // 行き先の点から立ち位置までの途中で、壁や柵や水をまたがない
  const n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) { const k = i / n; if (!tileOk(anchorT, tile(sim, ax + (x - ax) * k, az + (z - az) * k), L)) return false; }
  return true;
}

// ---------- 立ち位置の表 ----------
function valid(s, en) {
  if (s.byId.get(en.id) !== en) return false;
  if (en.corpse) return en.seen >= s.frame - 3;
  const e = en.e;
  return e.pos && e.pos.x === en.ax && e.pos.z === en.az && still(e, en.h);
}
function put(s, en) {
  en.cell = ckey(en.x, en.z);
  let a = s.grid.get(en.cell); if (!a) s.grid.set(en.cell, a = []); a.push(en);
  s.byId.set(en.id, en);
  if (en.r > s.rmax) s.rmax = en.r;
}
function unlink(s, en) {
  const a = s.grid.get(en.cell);
  if (a) { const i = a.indexOf(en); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) s.grid.delete(en.cell); }
  if (s.byId.get(en.id) === en) s.byId.delete(en.id);
}
function drop(s, id) { const en = s.byId.get(id); if (en) unlink(s, en); }

// (x,z) に半径 r で立てるか（self・other は数えない）
function fits(s, x, z, r, L, self, other) {
  const R = r + s.rmax;
  const x0 = Math.floor((x - R) / CELL), x1 = Math.floor((x + R) / CELL);
  const z0 = Math.floor((z - R) / CELL), z1 = Math.floor((z + R) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
    const a = s.grid.get(((cx + 1024) << 12) | (cz + 1024));
    if (!a) continue;
    for (let i = a.length - 1; i >= 0; i--) {
      const o = a[i];
      if (o.id === self || o.id === other || o.L !== L) continue;
      const m = r + o.r, dx = o.x - x, dz = o.z - z;
      if (dx * dx + dz * dz >= m * m - 1e-9) continue;
      if (!valid(s, o)) { unlink(s, o); continue; }       // もういない者の立ち位置は片づける
      return false;
    }
  }
  return true;
}

// 行き先の点 (ax,az) の近くで空いている立ち位置を探す
// 見つからなければ、少し詰めて（間あいを7割にして）もう一度探す。狭い囲いや人ごみでも、なるべく重ならない
function findSlot(sim, s, id, ax, az, r, L, field) {
  return findSlot1(sim, s, id, ax, az, r, L, field) || findSlot1(sim, s, id, ax, az, r * 0.7, L, field);
}
function findSlot1(sim, s, id, ax, az, r, L, field) {
  const anchorT = tile(sim, ax, az);
  if (field) {
    const rz = Math.round(az);
    for (const [dx, dr] of ROW_OFF) {
      const x = ax + dx, z = rz + dr;
      if (tile(sim, x, z) !== T.FIELD && dr !== 0) continue;   // 畑の外の列には出ない
      if (groundOk(sim, ax, az, x, z, anchorT, L) && fits(s, x, z, r, L, id)) return { x, z };
    }
  }
  const rot = (hashStr(Math.round(ax) * 7919 + Math.round(az)) % 360) * Math.PI / 180, c = Math.cos(rot), sn = Math.sin(rot);
  const step = Math.max(1, r / 0.36);                     // 大きな生き物は輪の間隔も広げる
  for (const [ox, oz] of RING_OFF) {
    if ((ox * ox + oz * oz) * step * step > MAX_SHIFT * MAX_SHIFT) continue;   // 行き先から離れすぎない
    const x = ax + (ox * c - oz * sn) * step, z = az + (ox * sn + oz * c) * step;
    if (groundOk(sim, ax, az, x, z, anchorT, L) && fits(s, x, z, r, L, id)) return { x, z };
  }
  return null;
}

function assign(sim, s, e, human) {
  drop(s, e.id);
  const r = radiusOf(sim, e, human), L = layerOf(e, human);
  const ax = e.pos.x, az = e.pos.z;
  const field = human && tile(sim, ax, az) === T.FIELD;
  const at = findSlot(sim, s, e.id, ax, az, r, L, field);
  s.stats.assign++;
  if (!at) s.stats.fail++;
  const en = { id: e.id, e, h: human, ax, az, x: at ? at.x : ax, z: at ? at.z : az, r, L, seen: s.frame, corpse: false, face: null, faceId: null };
  // 輪で囲むときは、集まりの中心（行き先の点）を向く。畑では向きを変えない
  if (human && !field && at && Math.hypot(at.x - ax, at.z - az) > 0.2) en.face = { x: ax, z: az };
  put(s, en);
  return en;
}

// 話している2人：真ん中をはさんで向かい合う
function assignPair(sim, s, a, b) {
  const ra = radiusOf(sim, a, true), rb = radiusOf(sim, b, true);
  let ux = b.pos.x - a.pos.x, uz = b.pos.z - a.pos.z, d = Math.hypot(ux, uz);
  if (d < 0.05) { const ang = ((hashStr(a.id) ^ hashStr(b.id)) % 4) * Math.PI / 2; ux = Math.cos(ang); uz = Math.sin(ang); } else { ux /= d; uz /= d; }
  const mx = (a.pos.x + b.pos.x) / 2, mz = (a.pos.z + b.pos.z) / 2;
  const gap = Math.max(PAIR_GAP, (ra + rb) / 2 + 0.02);
  const tA = tile(sim, a.pos.x, a.pos.z), tB = tile(sim, b.pos.x, b.pos.z);
  const rot = (hashStr(Math.round(mx) * 7919 + Math.round(mz)) % 360) * Math.PI / 180, c = Math.cos(rot), sn = Math.sin(rot);
  for (const [ox, oz] of RING_OFF) {
    if (ox * ox + oz * oz > PAIR_MAX * PAIR_MAX) break;   // 近くに空きがなければ、ひとりずつ立つ
    const cx = mx + (ox * c - oz * sn) * 1.2, cz = mz + (ox * sn + oz * c) * 1.2;
    const xa = cx - ux * gap, za = cz - uz * gap, xb = cx + ux * gap, zb = cz + uz * gap;
    if (!groundOk(sim, a.pos.x, a.pos.z, xa, za, tA, 0) || !groundOk(sim, b.pos.x, b.pos.z, xb, zb, tB, 0)) continue;
    if (!fits(s, xa, za, ra, 0, a.id, b.id) || !fits(s, xb, zb, rb, 0, a.id, b.id)) continue;
    const ea = { id: a.id, e: a, h: true, ax: a.pos.x, az: a.pos.z, x: xa, z: za, r: ra, L: 0, seen: s.frame, corpse: false, face: null, faceId: b.id, pair: b.id, tk: a.talk };
    const eb = { id: b.id, e: b, h: true, ax: b.pos.x, az: b.pos.z, x: xb, z: zb, r: rb, L: 0, seen: s.frame, corpse: false, face: null, faceId: a.id, pair: a.id, tk: b.talk };
    drop(s, a.id); drop(s, b.id);
    put(s, ea); put(s, eb);
    s.stats.pair++;
    return ea;
  }
  return null;
}

// ---------- 描画から呼ぶ ----------
// 1フレームの最初に1回
export function spacingBegin(sim) {
  const s = st(sim);
  s.frame++;
  if (s.frame % SWEEP === 0) {
    for (const en of [...s.byId.values()]) if (!valid(s, en)) unlink(s, en);
    let m = 0.35; for (const en of s.byId.values()) if (en.r > m) m = en.r; s.rmax = m;
  }
}

// 見た目の位置 {x, z}。歩いている者は本当の位置そのまま。返した入れ物は次の呼び出しまでに使うこと
// S.settings.spacing を false にすると切れる（前と後を見比べるため）
export function spacedPos(sim, e, human) {
  const s = st(sim);
  if (!still(e, human) || sim.S.settings?.spacing === false) { if (s.byId.has(e.id)) drop(s, e.id); OUT.x = e.pos.x; OUT.z = e.pos.z; return OUT; }
  let en = s.byId.get(e.id);
  if (en && !en.corpse && en.ax === e.pos.x && en.az === e.pos.z) {
    en.seen = s.frame;
    const tk = human ? e.talk || null : null;
    if ((en.tk || null) === tk) return en;
    if (!tk) { en.tk = null; en.pair = null; en.faceId = null; return en; }   // 話し終えた：その場に残る
    // 立ち止まったまま話し始めた：向かい合う位置を取り直す
  }
  if (human && e.talk) {
    const oid = e.talk.a === e.id ? e.talk.b : e.talk.a;
    const o = sim.S.people[oid];
    if (o && still(o, true) && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 1.6) {
      const pa = assignPair(sim, s, e, o);
      if (pa) return pa;
    }
    en = assign(sim, s, e, human);
    en.tk = e.talk;
    if (o) { en.faceId = oid; en.face = null; }
    return en;
  }
  return assign(sim, s, e, human);
}

// 立ち止まっているときに向く先 {x, z}（なければ null）
export function spacingFace(sim, e) {
  const s = sim._spc; if (!s || sim.S.settings?.spacing === false) return null;
  const en = s.byId.get(e.id);
  if (!en || en.corpse) return null;
  if (en.faceId != null) {
    const o = s.byId.get(en.faceId);
    if (o) return o;
    const p = sim.S.people[en.faceId];
    return p && p.pos ? p.pos : null;
  }
  return en.face;
}

// 亡骸（描画だけに残っているもの）：(x,z) は倒れた所。立ち位置を返す
export function spacingCorpse(sim, id, x, z, r = 0.35) {
  const s = st(sim);
  let en = s.byId.get(id);
  if (en && en.corpse) { en.seen = s.frame; return en; }
  if (en) unlink(s, en);
  const at = findSlot(sim, s, id, x, z, r, 0, false);
  en = { id, e: null, h: false, ax: x, az: z, x: at ? at.x : x, z: at ? at.z : z, r, L: 0, seen: s.frame, corpse: true };
  put(s, en);
  return en;
}

// 試験・点検用：割り当ての数など
export function spacingStats(sim) { const s = st(sim); return { entries: s.byId.size, ...s.stats }; }

// 描画から：亡骸の絵を、重ならない場所へゆっくり寄せる。r は render.js の描画の入れ物（sx, sz, sprite, shadow）。
// e は生き物の亡骸のとき（体の大きさを使う）。人は null
export function spacingSlideCorpse(sim, id, r, dt, e = null) {
  if (r.sx == null || !r.sprite || sim.S.settings?.spacing === false) return;
  if (r.cax == null) { r.cax = r.sx; r.caz = r.sz; }
  const en = spacingCorpse(sim, id, r.cax, r.caz, e ? radiusOf(sim, e, false) : 0.35);
  const k = Math.min(1, (dt || 0.016) * 4), mx = (en.x - r.sx) * k, mz = (en.z - r.sz) * k;
  if (Math.abs(mx) + Math.abs(mz) < 1e-5) return;
  r.sx += mx; r.sz += mz;
  r.sprite.position.x += mx; r.sprite.position.z += mz;
  if (r.shadow && r.shadow.position) { r.shadow.position.x += mx; r.shadow.position.z += mz; }
}
