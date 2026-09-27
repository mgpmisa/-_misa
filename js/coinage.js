// 国ごとの硬貨（経済部・グラフィック部）：名前・地金の色・表の紋章・裏の図柄と王の肖像・縁の刻み・鋳造の代（王ごと）・
// 両替の商い（国境を越えた旅人と荷車が、よその町で財布の硬貨を替える）・硬貨についての記憶と心の声・画面用の一覧。
//
// お金の出どころと行き先（社長の決まり「お金は取り引きでしか動かない」「お金には必ず出どころと行き先がある」）
//   両替の手数料 … 旅人の財布（p.purse）／荷車の箱（c.cash） → その町の両替商の家計（hh.money）
//                   町に両替商がいなければ、その国の両替商の館の金庫（S.bank.k[国].vault。館のもうけ b.profit にも記す）
//   それ以外のお金は動かさない。帳簿の上では、どの国の硬貨も同じ「銅貨の数」で数える（枚数を国ごとに分けて持たない）。
//   替えた硬貨の種類は、財布の「いま持っている硬貨の国」（p.cx）として覚えるだけ。額は手数料の分しか変わらない。
//
// 本体からの呼び方
//   ensureCoinage(sim)        … newWorld と load の最後（seedMarkets のあと）。国が増えたときも毎日これで作る
//   coinageDaily(sim)         … newDay の bankDaily のあと（王の代替わり・悪鋳の検出、鋳造の代の入れ替わり、噂）
//   coinageHourly(sim)        … newHourRest の diplomacyHourly のあと（よその町に着いた人・荷車の両替）
//   coinageThought(sim, p)    … 心の声（よその硬貨を持ち歩いている人だけ。ほかは null）
//   画面：coinageNationHTML / coinageBuildingHTML / coinagePersonHTML
//   造幣所の見た目：coinStyle(sim, kingdomId) → { name, color, emblem, reverse, edge, portrait, ... }
//
// 状態：S.coinage = { v, k:{ 国id: { name, short, metal, emblem, reverse, edge, issues:[...], cur, lastQ, log:[...], day, n, fee } }, stats, hist }
import { KINGDOMS, JOBS } from './data.js';
import { coinWorth, exchangeRate } from './bank.js';
import { flow, income } from './ledger.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r0 = (x) => Math.round(x);
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (x) => Math.round(x * 100);
const FEE_MIN = 0.02, FEE_MAX = 0.03;   // 両替の手数料（2〜3％）

// ---------- 自前の乱数（世界の乱数 sim.rng を使わない。使うと別の世界になってしまうため） ----------
const hashN = (...xs) => { let h = 2166136261 >>> 0; for (const x of xs) { const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 0x9e37; h = Math.imul(h, 2654435761) >>> 0; } h ^= h >>> 15; return h >>> 0; };
function rngOf(...seed) { let a = hashN(...seed) || 1; return { next() { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }, chance(p) { return this.next() < p; } }; }

// ---------- 意匠の辞書 ----------
// 表の紋章（硬貨の名前になる）
export const EMBLEMS = {
  lion:   { name: '獅子',   text: '後ろ足で立つ獅子',             sound: '獅子' },
  wolf:   { name: '狼',     text: '遠吠えする狼の横顔',           sound: '狼' },
  eagle:  { name: '鷲',     text: '翼を大きく広げた鷲',           sound: '鷲' },
  falcon: { name: '隼',     text: '獲物に向かって舞い降りる隼',   sound: '隼' },
  mooncrown: { name: '月冠', text: '三日月を戴いた王冠',          sound: '月冠' },
  lily:   { name: '百合',   text: '三つ葉の百合の花',             sound: '百合' },
  sun:    { name: '日輪',   text: '十六の光を放つ太陽',           sound: '日輪' },
  star:   { name: '星',     text: '八つの角を持つ星',             sound: '星' },
  tower:  { name: '塔',     text: '三つの窓を持つ城の塔',         sound: '塔' },
  palm:   { name: '棕櫚',   text: '実をつけた棕櫚の木',           sound: '棕櫚' },
  wave:   { name: '波',     text: '重なり合う三つの波',           sound: '波' },
};
// 裏の図柄（王の肖像を囲む、国の言い伝えにちなむ図柄）
export const MOTIFS = {
  sword:  { name: '剣',   text: '交差する二本の剣' },
  wheat:  { name: '麦穂', text: '輪になった麦の穂' },
  hammer: { name: '鉄槌', text: '金床に置かれた鉄槌' },
  snow:   { name: '雪花', text: 'ちりばめた六つの雪の花' },
  dune:   { name: '砂丘', text: '砂丘と三つの星' },
  gold:   { name: '金環', text: '重なった金の環' },
  vine:   { name: '葡萄', text: '葡萄の蔓の縁取り' },
  ship:   { name: '船',   text: '帆を張った船' },
};
// 縁の刻み
export const EDGES = {
  milled: { name: 'ギザ刻み', text: '縁に細かなギザが刻まれ、削り取りを防いでいる', clip: 0.2 },
  rope:   { name: '縄目',     text: '縁が縄をよったような斜めの刻み',               clip: 0.4 },
  beads:  { name: '粒の輪',   text: '縁の内側に小さな粒が輪になって並ぶ',           clip: 0.7 },
  plain:  { name: '無地',     text: '縁に刻みのない、昔ながらの打ち方（削られやすい）', clip: 1 },
};
// 国の色（色相）で紋章の候補を分ける。言い伝え（motto）の言葉で裏の図柄を選ぶ
const EMB_BY_HUE = { blue: ['mooncrown', 'lily', 'eagle', 'wave', 'star'], red: ['lion', 'wolf', 'tower', 'eagle'], gold: ['sun', 'falcon', 'palm', 'star'], other: ['tower', 'star', 'eagle', 'lion', 'sun'] };
const MOTIF_WORDS = [['剣', 'sword'], ['麦', 'wheat'], ['鉄', 'hammer'], ['雪', 'snow'], ['砂', 'dune'], ['黄金', 'gold'], ['金', 'gold'], ['海', 'ship'], ['港', 'ship'], ['葡萄', 'vine']];

// ---------- 色 ----------
const hex2 = (h) => { const s = String(h || '#b87333').replace('#', ''); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
const toHex = (c) => '#' + c.map((v) => clamp(r0(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex2(a).map((v, i) => v + (hex2(b)[i] - v) * t));
function hueOf(hex) {
  const [r, g, b] = hex2(hex).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.05) return 'other';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  if (h < 25 || h >= 330) return 'red';
  if (h < 70) return 'gold';
  if (h >= 180 && h < 270) return 'blue';
  return 'other';
}
const COPPER = '#b87333';
// 地金の色味の名前（見た目の説明）
function metalName(hex) {
  const [r, g, b] = hex2(hex), [cr, cg, cb] = hex2(COPPER);
  if (b - cb > 18) return '青みがかった赤銅色';
  if (g - cg > 14 && b - cb < 18) return '黄みの強い真鍮色';
  if (r - cr > -6 && g - cg < -8) return '赤みの濃い赤銅色';
  return '落ち着いた銅色';
}

// ---------- 状態 ----------
const alive = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null ? q : null; };
// 国に属さない村・民族の村（まだ併合されていない）は、どの国の硬貨でもない
const kOfSid = (sim, sid) => { const s = sim.town(sid); if (!s || (s.tribal || s.indep) && s.annexed == null) return null; const k = s.kingdom; return k != null && k >= 0 && sim.S.kingdoms[k] ? k : null; };
const kShort = (k) => (k?.name || '').replace(/王国$/, '');

function designFor(sim, k) {
  const S = sim.S, kd = KINGDOMS[k.id] || {};
  const R = rngOf('coin', S.seed ?? 1, k.id, k.name);
  const col = k.color || kd.color || '#888888';
  const hue = hueOf(col);
  // 他の国とかぶらない紋章を選ぶ
  const used = new Set(Object.values(S.coinage.k).map((c) => c.emblem?.id));
  let pool = (EMB_BY_HUE[hue] || EMB_BY_HUE.other).filter((e) => !used.has(e));
  if (!pool.length) pool = Object.keys(EMBLEMS).filter((e) => !used.has(e));
  if (!pool.length) pool = Object.keys(EMBLEMS);
  const emb = R.pick(pool);
  // 裏の図柄：言い伝えの言葉から
  const motto = kd.motto || k.motto || '';
  const ms = MOTIF_WORDS.filter(([w]) => motto.includes(w)).map(([, m]) => m);
  const mot = ms.length ? ms[Math.floor(R.next() * ms.length)] : R.pick(Object.keys(MOTIFS));
  const usedE = new Set(Object.values(S.coinage.k).map((c) => c.edge));
  let edges = ['milled', 'rope', 'beads', 'plain'].filter((e) => !usedE.has(e)); if (!edges.length) edges = Object.keys(EDGES);
  const edge = R.pick(edges);
  // 地金：銅に国の色を少し混ぜる（南の国は真鍮寄り）
  let metal = mix(COPPER, col, hue === 'blue' ? 0.16 + R.next() * 0.06 : 0.14 + R.next() * 0.08);
  if (hue === 'red') metal = mix(metal, '#a8401c', 0.3);
  if (kd.south || hue === 'gold') metal = mix(metal, '#dcb24c', 0.45);
  const name = `${EMBLEMS[emb].name}銅貨`;
  return { name, short: EMBLEMS[emb].name, metal, metalName: metalName(metal), emblem: emb, motif: mot, edge };
}
function portraitOf(sim, king, prevFace) {
  if (!king) return { ruler: null, rname: '先王たち', title: '王', face: prevFace === 'L' ? 'R' : 'L', crown: 'crown', beard: false, age: 40 };
  const age = sim.ageOf(king);
  // 昔からの習わし：新しい王の横顔は、先代と逆を向く
  const face = prevFace === 'L' ? 'R' : 'L';
  const R = rngOf('portrait', king.id);
  return { ruler: king.id, rname: king.given, full: sim.fullName(king), title: king.sex === 'f' ? '女王' : '王', sex: king.sex, face, age,
    crown: king.sex === 'f' ? 'tiara' : R.pick(['crown', 'crown', 'laurel']), beard: king.sex !== 'f' && age >= 28 && R.chance(0.75), hair: king.sex === 'f' || R.chance(0.5) };
}
function newIssue(sim, c, k, why) {
  const b = sim.S.bank?.k[k.id];
  const prev = c.issues[c.issues.length - 1];
  const king = alive(sim, k.kingId);
  const same = prev && prev.p.ruler === (king?.id ?? null);
  const p = same ? prev.p : portraitOf(sim, king, prev?.p.face);
  const is = { id: (c.seq = (c.seq || 0) + 1), p, since: sim.today, q: b ? b.q : 1, share: prev ? 0.02 : 1, why };
  c.issues.push(is);
  if (c.issues.length > 6) { const drop = c.issues.shift(); c.issues[0].share += drop.share; }
  return is;
}
export function ensureCoinage(sim) {
  const S = sim.S;
  S.coinage = S.coinage || { v: 1, k: {}, stats: { n: 0, fee: 0, toChanger: 0, toVault: 0, carts: 0 }, hist: [], day: { d: -1, n: 0, fee: 0 } };
  const C = S.coinage;
  C.k = C.k || {}; C.stats = C.stats || { n: 0, fee: 0, toChanger: 0, toVault: 0, carts: 0 }; C.hist = C.hist || []; C.day = C.day || { d: -1, n: 0, fee: 0 };
  for (const k of S.kingdoms || []) {
    if (C.k[k.id]) continue;
    const d = designFor(sim, k);
    const c = C.k[k.id] = { ...d, issues: [], seq: 0, lastQ: S.bank?.k[k.id]?.q ?? 1, lastKing: k.kingId ?? null, log: [], n: 0, fee: 0, since: sim.today };
    // 昔の王の代の硬貨も少し残っている（最初の世界）
    const monarchs = (k.monarchs || []).filter((id) => id !== k.kingId);
    const old = monarchs.length ? S.people[monarchs[monarchs.length - 1]] : null;
    if (old) { const p = portraitOf(sim, null, 'R'); p.rname = old.given; p.full = sim.fullName ? sim.fullName(old) : old.given; p.title = old.sex === 'f' ? '女王' : '王'; p.sex = old.sex; p.crown = old.sex === 'f' ? 'tiara' : 'crown'; p.beard = old.sex !== 'f'; c.issues.push({ id: ++c.seq, p, since: sim.today - 400, q: 1, share: 0.3, why: 'old' }); }
    const is = newIssue(sim, c, k, 'first'); is.since = sim.today - 60; is.share = old ? 0.7 : 1;
  }
  return C;
}

// ---------- 見た目（造幣所・画面・会話で使う） ----------
// 硬貨の値打ち（bank.js の質×摩耗）で、地金の色が変わる：悪鋳は赤黒く、すり減ると鈍く
function colorNow(c, q, wear) {
  let col = c.metal;
  col = mix(col, '#7a3a24', clamp((1 - q) * 0.9, 0, 0.6));
  col = mix(col, '#6e5f52', clamp((1 - wear) * 2.2, 0, 0.45));
  return col;
}
export function coinStyle(sim, kid) {
  const S = sim.S;
  if (!S.coinage?.k?.[kid] && S.kingdoms?.[kid]) ensureCoinage(sim);
  const c = S.coinage?.k?.[kid];
  if (!c) return { kid, name: '銅貨', short: '銅', color: COPPER, light: '#e0a070', dark: '#6a3e1c', emblem: { id: 'star', ...EMBLEMS.star }, reverse: { id: 'wheat', ...MOTIFS.wheat }, edge: { id: 'plain', ...EDGES.plain }, portrait: null, q: 1, wear: 1, worth: 1 };
  const b = S.bank?.k[kid];
  const q = b ? b.q : 1, wear = b ? b.wear : 1;
  const color = colorNow(c, q, wear);
  const cur = c.issues[c.issues.length - 1];
  return {
    kid, name: c.name, short: c.short, color, base: c.metal, metalName: c.metalName,
    light: mix(color, '#fff4d8', 0.45), dark: mix(color, '#1c0e06', 0.55), rim: mix(color, '#2a160a', 0.3),
    emblem: { id: c.emblem, ...EMBLEMS[c.emblem] }, reverse: { id: c.motif, ...MOTIFS[c.motif] }, edge: { id: c.edge, ...EDGES[c.edge] },
    portrait: cur ? { ...cur.p } : null, issue: cur ? { id: cur.id, since: cur.since, q: cur.q } : null,
    issues: c.issues.map((i) => ({ id: i.id, ruler: i.p.rname, title: i.p.title, share: i.share, q: i.q, face: i.p.face })),
    q, wear, worth: coinWorth(sim, kid), kingdom: S.kingdoms[kid]?.name || '',
  };
}
export const coinName = (sim, kid) => (kid != null && sim.S.coinage?.k?.[kid]?.name) || '銅貨';
// 見た目の説明文（一文ずつ）
export function coinDescribe(sim, kid) {
  const st = coinStyle(sim, kid);
  const P = st.portrait;
  return {
    obverse: `表：${st.emblem.text}`,
    reverse: `裏：${st.reverse.text}に囲まれた、${P ? `${P.title}${P.rname}の${P.face === 'L' ? '左' : '右'}向きの横顔${P.beard ? '（あごひげ）' : ''}${P.crown === 'laurel' ? '（月桂冠）' : P.crown === 'tiara' ? '（宝冠）' : ''}` : '王の横顔'}`,
    edge: `縁：${st.edge.text}`,
    metal: `地金：${st.metalName}${st.q < 0.85 ? '。銀が減らされて赤黒い' : ''}${st.wear < 0.93 ? '。すり減って鈍い色' : ''}`,
  };
}

// ---------- 毎日：王の代替わり・悪鋳と良貨・鋳造の代の入れ替わり ----------
export function coinageDaily(sim) {
  const S = sim.S, C = ensureCoinage(sim);
  // 終わったしぐさ（両替のアニメ）の印を消す
  for (const p of sim.living()) if (p.fxAnim && !(p.fxAnim.until > S.t)) delete p.fxAnim;
  for (const k of S.kingdoms) {
    const c = C.k[k.id]; if (!c) continue;
    const b = S.bank?.k[k.id];
    const cur = c.issues[c.issues.length - 1];
    const cap = sim.town(k.capital);
    const pos = cap ? { x: cap.x, z: cap.z } : null;
    // 王が代わった：新しい王の肖像の硬貨を打ち始める
    if ((k.kingId ?? null) !== (c.lastKing ?? null)) {
      c.lastKing = k.kingId ?? null;
      const king = alive(sim, k.kingId);
      if (king) {
        const prevName = cur?.p?.rname;
        const is = newIssue(sim, c, k, 'king');
        const face = is.p.face === 'L' ? '左' : '右';
        sim.news(`${k.name}の造幣所が、新しい${is.p.title}${king.given}の${face}向きの横顔を刻んだ${c.name}を打ち始めた${prevName ? `（${prevName}の銅貨もしばらくは出回る）` : ''}`, 1, pos);
        if (sim.chron) sim.chron(`${sim.fullName(king)}の横顔を刻んだ新しい${c.name}が打たれ始めた`, k.id);
      }
    }
    // 悪鋳・良貨への改鋳：銀の量が変わった硬貨は、新しい代として数える（古い良い銅貨は、しまい込まれて減りが早い）
    if (b && Math.abs(b.q - (c.lastQ ?? b.q)) > 0.005) {
      const worse = b.q < c.lastQ;
      newIssue(sim, c, k, worse ? 'debase' : 'restore');
      coinRumor(sim, k, c, worse, c.lastQ, b.q);
      c.lastQ = b.q;
    }
    // 新しい代の硬貨が出回っていく（造幣所が打った分・打ち直し）。古い代は少しずつ鋳つぶされ、しまい込まれる
    const now = c.issues[c.issues.length - 1];
    if (now && c.issues.length > 1) {
      const circ = b?.hist?.[b.hist.length - 1]?.M || 3000;
      const issued = b?.hist?.[b.hist.length - 1]?.iss || 0;
      let g = 0.012 + issued / Math.max(500, circ);
      if (b && b.wear > 0.999 && (c.lastWear ?? 1) < 0.95) g += 0.3;   // すり減った銅貨の打ち直し
      const olds = c.issues.slice(0, -1);
      const oldSum = olds.reduce((s, i) => s + i.share, 0);
      const take = Math.min(oldSum, g);
      for (const i of olds) { const hoard = now.why === 'debase' && i.q > now.q ? 1.6 : 1; i.share -= oldSum > 0 ? take * (i.share / oldSum) * hoard : 0; if (i.share < 0) i.share = 0; }
      now.share = 1 - c.issues.slice(0, -1).reduce((s, i) => s + i.share, 0);
      c.issues = c.issues.filter((i) => i === now || i.share >= 0.03);
      const s2 = c.issues.reduce((s, i) => s + i.share, 0); for (const i of c.issues) i.share /= s2;
      // 新しい硬貨を初めて手にした人（数人）
      if (now.share < 0.6 && now.why === 'king') firstTouch(sim, k, c, now);
    }
    c.lastWear = b ? b.wear : 1;
  }
  const D = C.day;
  C.hist.push({ d: sim.today, n: D.d === sim.today - 1 ? D.n : 0, fee: r1(D.d === sim.today - 1 ? D.fee : 0) });
  if (C.hist.length > 30) C.hist.shift();
}

// ---------- 記憶（会話の種）：人ごとに違う文にする ----------
const JOB_ANGLE = {
  merchant: ['秤にかけて', '帳面に書き留めて', '仕入れの払いに使う前に'],
  changer: ['試金石でこすって', '天秤で十枚ずつ量って', '歯で噛んで'],
  innkeeper: ['宿代の釣り銭を数えながら', '勘定台の上で'],
  jeweler: ['ルーペでのぞいて', '火にかざして'],
  adventurer: ['革袋の中で', '酒場の卓の上で'],
  smith: ['金床の上で', '指ではじいて'],
  farmer: ['市の帰りに'],
  soldier: ['給金の中で'],
  knight: ['給金の中で'],
  peddler: ['背負いの箱の中で'],
  wanderer: ['道ばたで'],
};
const feel = (R, p) => {
  const o = [];
  if (p.pers.C > 0.65) o.push('きっちり数え直した', '一枚ずつ確かめた');
  if (p.pers.N > 0.65) o.push('損をした気がしてならない', '偽物が混じっていないか気が気でない');
  if (p.pers.O > 0.65) o.push('見慣れない図柄に見とれた', '一枚だけ記念に取っておこう');
  if (p.pers.A < 0.35) o.push('両替商はいつも取りすぎだ', 'あこぎな商売だと思う');
  if (p.pers.E > 0.65) o.push('酒場でみんなに見せびらかしたい', '誰かに話したくなった');
  if (!o.length) o.push('まあこんなものだろう', '旅の決まりごとだ', '慣れたものだ');
  return R.pick(o);
};
const soundOf = (R, st) => {
  if (st.q < 0.8) return R.pick(['軽くて音が鈍い', '指ではじくと濁った音がする', '赤黒くて安っぽい', '重さが足りない気がする']);
  if (st.wear < 0.92) return R.pick(['すり減って模様がかすれている', '縁が削られて薄い', '手垢で黒ずんでいる']);
  if (st.q >= 0.98) return R.pick(['ずしりと重くて澄んだ音がする', '刻みがくっきりしていて気持ちがいい', '銀の光が混じってきれいだ']);
  return R.pick(['ごく普通の手ざわりだ', 'まあまあの出来だ', '可もなく不可もない']);
};
// 誰一人として同じことを言わない：最近だれかが覚えた文と同じなら、その人の暮らし・性格・町から一言を足して言い換える
const SAID = { list: [], set: new Set() };
function personal(sim, p, i) {
  const R = rngOf('ps', p.id, i);
  const town = sim.town(p.s)?.name || 'この町';
  const job = JOBS[p.job]?.name;
  const age = sim.ageOf(p);
  const o = [
    job ? `${job}をしていると、こういうことには敏感になる` : null,
    `${town}でも、そのうち噂になるだろう`,
    age >= 50 ? `${age}年も生きてきたが、こんなことは${R.pick(['初めてだ', '二度目だ', '珍しい'])}` : `${R.pick(['父', '母', '祖父', '祖母'])}に話したら何と言うだろう`,
    feel(R, p),
    (p.purse || 0) < 5 ? '財布が軽いのに、硬貨まで軽くなってはたまらない' : `財布の${Math.round(p.purse)}枚を見直したくなった`,
    job ? `${job}仲間にも教えておこう` : '誰かに教えておこう',
  ].filter(Boolean);
  return o[(i + hashN(p.id)) % o.length];
}
function memo(sim, p, txt, emo, imp = 0.4, about) {
  if (!p || p.deathYear != null) return;
  if (p._coinMem === sim.today) return;   // 硬貨の記憶は1人1日1つまで
  let t = txt;
  for (let i = 0; SAID.set.has(t) && i < 8; i++) t = `${txt}。${personal(sim, p, i)}`;
  if (SAID.set.has(t)) t = `${txt}。${sim.town(p.s)?.name || ''}の${p.given}はそう思う`;
  SAID.set.add(t); SAID.list.push(t);
  if (SAID.list.length > 600) SAID.set.delete(SAID.list.shift());
  p._coinMem = sim.today;
  sim.remember(p, t, { emo, imp, k: 'money', about });
}
// 両替した旅人・両替商の記憶
function exchangeMemo(sim, p, from, to, amt, fee, town, changer, extra) {
  const R = rngOf('xm', p.id, sim.today, sim.S.t);
  const sf = coinStyle(sim, from), stt = coinStyle(sim, to);
  const rate = exchangeRate(sim, from, to);
  const ang = JOB_ANGLE[p.job] ? R.pick(JOB_ANGLE[p.job]) : '';
  const who = changer ? `両替商の${changer.given}` : town.gate ? '番所の両替台' : '両替商の館';
  const parts = [];
  const st = R.next();
  if (st < 0.34) parts.push(`${town.name}の${who}で、${sf.name}${r0(amt)}枚を${stt.name}に替えた。手数料は${r1(fee)}枚`);
  else if (st < 0.67) parts.push(`${town.name}に着いて、財布の${sf.name}を${who}で${stt.name}に替えてもらった`);
  else parts.push(`${who}に${sf.name}を出したら、${stt.short}の刻まれた${stt.name}が返ってきた`);
  const c2 = R.next();
  if (c2 < 0.4) parts.push(`${ang ? ang + '見ると、' : ''}${stt.name}は${soundOf(R, stt)}`);
  else if (c2 < 0.7) parts.push(rate < 0.97 ? `${sf.short}1枚が${stt.short}${rate.toFixed(2)}枚にしかならない` : rate > 1.03 ? `${sf.short}1枚で${stt.short}${rate.toFixed(2)}枚になった。得した気分だ` : `${sf.short}と${stt.short}はほぼ一枚ずつだった`);
  else parts.push(`裏には${stt.reverse.name}に囲まれた${stt.portrait ? stt.portrait.title + stt.portrait.rname : '王'}の横顔。${feel(R, p)}`);
  if (extra) parts.push(extra);
  memo(sim, p, parts.join('。'), rate < 0.97 || sf.q < 0.85 ? -0.25 : 0.1, 0.4, changer ? [changer.id] : undefined);
  if (changer && R.chance(0.5)) {
    const R2 = rngOf('xc', changer.id, sim.today, p.id);
    const says = sf.q < 0.85
      ? R2.pick([`${sf.name}は銀が薄い。${p.given}のような旅人が持ち込むたび、打歩を上乗せしている`, `${sf.name}はもう市場で嫌われている。受け取ったらすぐ造幣所へ回したい`, `${p.given}が持ってきた${sf.name}は${soundOf(R2, sf)}。あれを喜ぶ者はいない`])
      : sf.q >= 0.97 ? R2.pick([`${sf.name}なら喜んで受け取る。${p.given}が替えに来た分は、すぐ金庫の奥にしまった`, `${p.given}の${sf.name}はいい地金だった。${sf.emblem.name}の刻みもくっきりしていた`])
      : R2.pick([`${p.given}が${sf.name}${r0(amt)}枚を替えに来た。手数料${r1(fee)}枚`, `今日は${sf.kingdom.replace(/王国$/, '')}から来た${JOBS[p.job]?.name || '旅人'}の${p.given}が両替に来た`]);
    memo(sim, changer, says, 0.15, 0.35, [p.id]);
  }
}
// 悪鋳・良貨の噂：国の内外の商人・両替商・宿屋が、よその硬貨の評判を話す
function coinRumor(sim, k, c, worse, oldQ, newQ) {
  const S = sim.S;
  const R = rngOf('rumor', k.id, sim.today);
  const TRADE = new Set(['merchant', 'changer', 'innkeeper', 'jeweler', 'peddler', 'captain', 'baker', 'butcher']);
  const listeners = sim.living().filter((p) => TRADE.has(p.job) && sim.isAdult(p) && p.jail == null);
  const pick = [];
  for (const p of listeners) if (R.chance(0.25)) pick.push(p);
  const best = S.kingdoms.filter((o) => o.id !== k.id).sort((a, b) => coinWorth(sim, b.id) - coinWorth(sim, a.id))[0];
  const bestName = best ? coinName(sim, best.id) : null;
  for (const p of pick.slice(0, 14)) {
    const R2 = rngOf('rm', p.id, sim.today, k.id);
    const home = kOfSid(sim, p.s) === k.id;
    const ang = JOB_ANGLE[p.job] ? R2.pick(JOB_ANGLE[p.job]) : '';
    let t;
    if (worse) {
      t = home
        ? R2.pick([`新しい${c.name}は${ang ? ang + '見ても' : ''}${R2.pick(['軽くて音が鈍い', '赤黒い', '銀の光がない'])}。銀を${pct(oldQ) - pct(newQ)}分も減らしたらしい。古い${c.short}はしまっておこう`,
          `${c.name}の銀が減らされた。よその商人は${c.short}を嫌がるようになるだろう`,
          `造幣所がまた${c.name}を軽くした。これで物の値が上がる`])
        : R2.pick([`${kShort(k)}の${c.name}は銀を減らしたそうだ。${bestName && best.id !== kOfSid(sim, p.s) ? `${bestName}なら喜んで受け取るが、` : ''}${c.short}は重さを量ってからだ`,
          `${kShort(k)}から来た客の${c.name}は${R2.pick(['軽くて音が鈍い', '指ではじくと濁った音がする', '色が悪い'])}らしい。市場で嫌われるぞ`,
          `${c.name}？あれは銀が薄くなった。受け取るなら一割は値引きさせる`]);
    } else {
      t = home
        ? R2.pick([`${c.name}が良い地金に戻った。${c.emblem ? EMBLEMS[c.emblem].name : ''}の刻みも澄んだ音も昔のとおりだ`, `王が悪い銅貨を鋳つぶして、${c.name}を良貨に戻した。これで値上がりも落ち着くだろう`])
        : R2.pick([`${kShort(k)}の${c.name}が良貨に戻ったそうだ。これなら喜んで受け取る`, `${c.name}の銀が戻ったらしい。${kShort(k)}との商いがまたやりやすくなる`]);
    }
    memo(sim, p, t, worse ? -0.3 : 0.25, 0.45);
  }
}
// 新しい王の硬貨を初めて手にした人
function firstTouch(sim, k, c, is) {
  const R = rngOf('ft', k.id, sim.today);
  const ppl = sim.living().filter((p) => kOfSid(sim, p.s) === k.id && sim.isAdult(p) && p.jail == null && !p._coinNew?.[is.id]);
  if (!ppl.length) return;
  const n = Math.min(3, ppl.length);
  const prev = c.issues[c.issues.length - 2];
  for (let i = 0; i < n; i++) {
    const p = ppl[Math.floor(R.next() * ppl.length)];
    p._coinNew = { [is.id]: 1 };
    const R2 = rngOf('ft2', p.id, is.id);
    const where = R2.pick(p.job === 'soldier' || p.job === 'knight' ? ['給金', '手当'] : ['釣り銭', '市の売り上げ', '家計の袋', '宿の勘定']);
    const t = R2.pick([
      `${where}の中に、${is.p.title}${is.p.rname}の横顔を刻んだ新しい${c.name}が混じっていた${prev ? `。${prev.p.rname}の${c.short}とは顔の向きが逆だ` : ''}`,
      `初めて新しい${c.name}を手にした。${is.p.title}${is.p.rname}の${is.p.beard ? 'あごひげまで' : '横顔が'}くっきり刻まれている`,
      `新しい${is.p.title}の${c.name}を見た。${prev ? `まだ${prev.p.rname}の銅貨のほうが多いけれど、` : ''}${feel(R2, p)}`,
    ]);
    memo(sim, p, t, 0.2, 0.35);
  }
}

// ---------- 毎時：両替の商い ----------
const EXEMPT = new Set(['king', 'royal']);
const DUTY = new Set(['march', 'defend', 'crusade', 'rescue', 'alert']);
function changerIn(sim, sid) {
  let best = null;
  for (const p of sim.living()) {
    if (p.job !== 'changer' || p.s !== sid || p.jail != null || !sim.hh(p)) continue;
    if (!best || p.pers.C > best.pers.C) best = p;
  }
  return best;
}
function feeRate(sim, from, to, changer) {
  // 2％が基本。持ち込む硬貨が相手の硬貨より悪ければ打歩を上乗せ（最大3％）。欲の深い両替商は少し高め
  const bad = clamp(1 - coinWorth(sim, from) / Math.max(0.05, coinWorth(sim, to)), 0, 0.5) * 2;
  const greed = changer ? clamp(0.5 - changer.pers.A, 0, 0.5) * 0.4 : 0;
  return clamp(FEE_MIN + (FEE_MAX - FEE_MIN) * (bad * 0.8 + greed), FEE_MIN, FEE_MAX);
}
// 手数料を受け取る先：町の両替商の家計／館の金庫。受け取れる所がなければ両替しない（null）
function payee(sim, sid, kid) {
  const ch = sid != null ? changerIn(sim, sid) : null;
  if (ch) return { ch, hh: sim.hh(ch) };
  const bk = sim.S.bank?.k[kid];
  if (bk && bk.state === 'open') { const banker = alive(sim, bk.banker); return { ch: banker && banker.job === 'changer' ? banker : null, vault: bk }; }
  return null;
}
function pay(sim, pe, fee) {
  const C = sim.S.coinage;
  if (pe.hh) { pe.hh.money += fee; C.stats.toChanger += fee; income(sim, 'changer', fee); flow(sim, '旅人の財布', '両替商', fee, '両替の手数料'); }
  else { pe.vault.vault += fee; pe.vault.profit = (pe.vault.profit || 0) + fee; C.stats.toVault += fee; flow(sim, '旅人の財布', '両替商の館の金庫', fee, '両替の手数料'); }
}
const qBand = (sim, k) => Math.round((sim.S.bank?.k?.[k]?.q ?? 1) * 20);
function note(sim, kid, e) {
  const c = sim.S.coinage.k[kid]; if (!c) return;
  c.log.push(e); if (c.log.length > 12) c.log.shift();
  c.n++; c.fee += e.fee;
  const D = sim.S.coinage.day;
  if (D.d !== sim.today) { D.d = sim.today; D.n = 0; D.fee = 0; }
  D.n++; D.fee += e.fee;
  sim.S.coinage.stats.n++; sim.S.coinage.stats.fee += e.fee;
}
// その場所にある、国に属する町（町の広さ＋1マス以内）
function townAtPos(sim, x, z, towns) {
  for (const s of towns) if (Math.abs(s.x - x) <= s.r + 1 && Math.abs(s.z - z) <= s.r + 1) return s;
  return null;
}
export function coinageHourly(sim) {
  const S = sim.S, C = ensureCoinage(sim);
  const towns = S.world.settlements.filter((s) => kOfSid(sim, s.id) != null && !S.towns[s.id]?.occupied);
  if (!towns.length) return;
  const gates = (S.diplo?.gates || []).filter((g) => g.kind === 'border');
  for (const p of sim.living()) {
    if (p.jail != null || p.pos == null || EXEMPT.has(p.rank)) continue;
    const home = kOfSid(sim, p.s);
    if (home == null) continue;                                  // 国に属さない村・民族の人は、両替せずに雑多な硬貨を使う
    const cur = p.cx ?? home;
    const hs = sim.town(p.s);
    // 自分の町の中にいて、自分の国の硬貨を持っているなら何もしない（ほとんどの人はここで終わり）
    if (cur === home && hs && Math.abs(hs.x - p.pos.x) <= hs.r + 1 && Math.abs(hs.z - p.pos.z) <= hs.r + 1) continue;
    let t = townAtPos(sim, p.pos.x, p.pos.z, towns), tk = t ? kOfSid(sim, t.id) : null;
    if (!t && gates.length) {   // 関所：国境の番所の両替台（手数料は、その国の両替商の館の金庫へ）
      const g = gates.find((g) => Math.abs(g.x - p.pos.x) <= 1.8 && Math.abs(g.z - p.pos.z) <= 1.8 && S.kingdoms[g.k]);
      if (g) { tk = g.k; t = { id: null, name: g.name || '関所', gate: true }; }
    }
    if (!t) continue;
    if (tk === cur) continue;
    if (sim.ageOf(p) < 14 || DUTY.has(p.action?.type) || DUTY.has(p.mission?.type) || sim.hh(p)?.bandits) { if (tk === home) delete p.cx; continue; }
    const purse = p.purse || 0;
    if (purse < 2) { if (tk === home) delete p.cx; else p.cx = tk; continue; }   // 財布がほぼ空なら替えるものがない
    const pe = payee(sim, t.id, tk);
    if (!pe) continue;                                           // 両替できる所がない：よその硬貨のまま
    const rate = feeRate(sim, cur, tk, pe.ch);
    const fee = purse * rate;
    p.purse = purse - fee;
    pay(sim, pe, fee);
    if (tk === home) delete p.cx; else p.cx = tk;
    note(sim, tk, { d: sim.today, who: p.id, name: p.given, from: cur, to: tk, amt: r1(purse), fee: r1(fee), rate: r1(rate * 1000) / 10, sid: t.id, cart: false });
    // しぐさ（ドット絵）：客は受け取った硬貨をかじって確かめ、両替商は持ち込まれた硬貨を手秤で量る／数えて渡す
    p.fxAnim = { anim: `work:xbite:${tk}:${qBand(sim, tk)}`, until: S.t + 30 };
    if (pe.ch) pe.ch.fxAnim = { anim: (pe.ch.id + sim.today) % 2 ? `work:xweigh:${cur}:${qBand(sim, cur)}` : `work:xcount:${tk}:${qBand(sim, tk)}`, until: S.t + 30 };
    const R = rngOf('xmc', p.id, sim.today);
    if (R.chance(tk === home ? 0.35 : 0.7)) exchangeMemo(sim, p, cur, tk, purse, fee, t, pe.ch, tk === home ? R.pick(['やっと見慣れた銅貨に戻った', '家に帰ってきた気がする', '']) : '');
  }
  // 荷車・船の現金の箱（隊商の仕入れのお金）
  for (const c of S.convoys || []) {
    if (!(c.cash > 2) || c.state === 'done' || !c.pos) continue;
    const home = kOfSid(sim, c.home ?? c.from); if (home == null) continue;
    const cur = c.cx ?? home;
    const t = townAtPos(sim, c.pos.x, c.pos.z, towns); if (!t) continue;
    const tk = kOfSid(sim, t.id); if (tk === cur) continue;
    const pe = payee(sim, t.id, tk); if (!pe) continue;
    const own = alive(sim, c.owner);
    const rate = feeRate(sim, cur, tk, pe.ch), fee = c.cash * rate;
    c.cash -= fee; pay(sim, pe, fee);
    if (tk === home) delete c.cx; else c.cx = tk;
    C.stats.carts++;
    note(sim, tk, { d: sim.today, who: own?.id ?? null, name: own ? own.given : '隊商', from: cur, to: tk, amt: r1(c.cash + fee), fee: r1(fee), rate: r1(rate * 1000) / 10, sid: t.id, cart: true });
    if (own) exchangeMemo(sim, own, cur, tk, c.cash + fee, fee, t, pe.ch, '荷車の箱の仕入れ金をまとめて替えた');
  }
}

// ---------- 心の声 ----------
export function coinageThought(sim, p) {
  if (p.cx == null || !sim.S.coinage) return null;
  const R = rngOf('th', p.id, sim.today, Math.floor(sim.hour ? sim.hour() : 0));
  if (!R.chance(0.3)) return null;
  const st = coinStyle(sim, p.cx), home = kOfSid(sim, p.s);
  const hs = home != null ? coinStyle(sim, home) : null;
  const o = [`財布の中はよその${st.name}ばかりだ`, `${st.name}の${st.emblem.name}、見慣れないな`, `帰ったら${hs ? hs.name : '銅貨'}に替え直さないと`, `この${st.short}、${soundOf(R, st)}`];
  if (hs && st.worth < hs.worth * 0.95) o.push(`${st.name}は${hs.name}より値打ちが低い。使うなら早いほうがいい`);
  if (hs && st.worth > hs.worth * 1.05) o.push(`${st.name}はいい硬貨だ。一枚くらい取っておこうか`);
  return R.pick(o);
}

// ---------- 画面用 ----------
// 硬貨の小さな絵：coinagegfx.js があれば canvas の絵、なければ色の丸
let GFX = null;
export function setCoinGfx(g) { GFX = g; }
function coinImg(sim, kid, face = 'obv', size = 28) {
  const st = coinStyle(sim, kid);
  if (GFX?.coinImgHTML) { const h = GFX.coinImgHTML(st, face, size); if (h) return h; }
  return `<span class="coin-dot" title="${st.name}" style="display:inline-block;width:${size * 0.6}px;height:${size * 0.6}px;border-radius:50%;background:${st.color};border:2px solid ${st.rim};vertical-align:middle"></span>`;
}
// 国の情報（renderNations の <dl> の中）
export function coinageNationHTML(sim, k, esc = (s) => s) {
  const C = sim.S.coinage; const c = C?.k?.[k.id]; if (!c) return '';
  const st = coinStyle(sim, k.id), d = coinDescribe(sim, k.id);
  const rates = sim.S.kingdoms.filter((o) => o !== k && C.k[o.id]).map((o) => `${coinImg(sim, o.id, 'obv', 16)}${esc(coinName(sim, o.id))} ${exchangeRate(sim, k.id, o.id).toFixed(2)}枚`).join('<br>');
  const iss = c.issues.slice().reverse().map((i) => `${esc(i.p.title + i.p.rname)}の代 ${pct(i.share)}%${i.why === 'debase' ? '（悪鋳）' : i.why === 'restore' ? '（良貨）' : ''}`).join('・');
  return `<dt>硬貨</dt><dd><span style="white-space:nowrap">${coinImg(sim, k.id, 'obv', 34)}${coinImg(sim, k.id, 'rev', 34)}</span> <b>${esc(st.name)}</b><br>
    <span class="sub">${esc(d.obverse)}／${esc(d.reverse)}<br>${esc(d.edge)}／${esc(d.metal)}</span><br>
    銀の含み <b class="${st.q < 0.8 ? 'up' : ''}">${pct(st.q)}%</b>・すり減り ${pct(1 - st.wear)}%・値打ち <b>${st.worth.toFixed(2)}</b><br>
    <span class="sub">1枚の両替の相場：<br>${rates}<br>出回る代：${iss}</span></dd>`;
}
// 建物の詳細（両替商の館・王立造幣所）
export function coinageBuildingHTML(sim, b, esc = (s) => s) {
  const S = sim.S, C = S.coinage; if (!C || !b || (b.type !== 'bank' && b.type !== 'mint')) return '';
  const kid = b.settlement != null ? kOfSid(sim, b.settlement) : null; if (kid == null || !C.k[kid]) return '';
  if (b.type === 'mint') {
    const st = coinStyle(sim, kid), d = coinDescribe(sim, kid);
    return `<div class="section"><h4>打っている硬貨</h4><div>${coinImg(sim, kid, 'obv', 44)}${coinImg(sim, kid, 'rev', 44)}</div><dl class="kv"><dt>名前</dt><dd>${esc(st.name)}</dd><dt>意匠</dt><dd>${esc(d.obverse)}<br>${esc(d.reverse)}<br>${esc(d.edge)}</dd><dt>地金</dt><dd>${esc(d.metal)}・銀${pct(st.q)}%</dd></dl></div>`;
  }
  const c = C.k[kid];
  const rows = S.kingdoms.filter((o) => C.k[o.id]).map((o) => {
    const st = coinStyle(sim, o.id);
    const r = o.id === kid ? '—' : `${exchangeRate(sim, o.id, kid).toFixed(2)}枚（手数料${r1(feeRate(sim, o.id, kid, changerIn(sim, b.settlement)) * 100)}%）`;
    return `<li><span>${coinImg(sim, o.id, 'obv', 22)} ${esc(st.name)}<br><span class="dead">銀${pct(st.q)}%・すり減り${pct(1 - st.wear)}%・値打ち${st.worth.toFixed(2)}</span></span><span class="dead">${r}</span></li>`;
  }).join('');
  const log = c.log.slice(-6).reverse().map((e) => `<li><span>${e.cart ? '荷車' : ''}${esc(e.name)}：${esc(coinName(sim, e.from))}${r0(e.amt)}枚→${esc(coinName(sim, e.to))}</span><span class="dead">手数料${e.fee}・${sim.today - e.d}日前</span></li>`).join('');
  return `<div class="section"><h4>両替の相場表（${esc(c.name)}に替えると1枚あたり）</h4><ul class="rels">${rows}</ul></div>
    <div class="section"><h4>最近の両替</h4><ul class="rels">${log || '<li>まだ両替に来た旅人はいない</li>'}</ul><div class="sub">通算 ${c.n}件・手数料 ${r1(c.fee)}銅貨（手数料は両替商の家計か館の金庫へ）</div></div>`;
}
// 人物の詳細：持っている硬貨（旅先の硬貨のときだけ）
export function coinagePersonHTML(sim, p, esc = (s) => s) {
  if (p.cx == null || !sim.S.coinage?.k?.[p.cx]) return '';
  return `<dt>財布の硬貨</dt><dd>${coinImg(sim, p.cx, 'obv', 18)}${esc(coinName(sim, p.cx))}（旅先で両替した）</dd>`;
}
