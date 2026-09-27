// 造幣の流れ：鉱石を掘る → 運ぶ → 造幣所に売る → 炉で溶かし、延べ板にし、打刻して硬貨にする → 国庫へ運ぶ（経済部）
//
// 社長の指示：「国のお金の生産は鉱石を集めて銅貨を生産しているのか。それも見える化してほしい」
// 以前（bank.js の mintDaily）は、1日1回、鉱夫の家計に地金の代金を直接足していた（鉱石も造幣所の仕事も見えなかった）。
// ここでは、その流れを物と人の動きにする。お金の規模（鉱夫の取り分・造幣益・手間賃の割合）は以前と同じ。
//
// ■ 流れ
//  1. 掘る（毎時）：鉱山の町の鉱夫が坑道で働くと、鉱脈から銀（まれに金）を掘り出し、銀鉱石・金鉱石（目録の silver_ore・gold_ore）を
//     持ち物として持つ。2個たまるか、仕事を切り上げるときに、坑口の「鉱石置き場」（S.mintflow.piles）へ置く。
//     置き場の鉱石は、掘った鉱夫のもの（持ち主の札つき）。まだお金は動かない。
//  2. 運ぶ（毎朝）：置き場に鉱石がたまると（10個以上か、2日たった）、村の手の空いた人を運び手に雇い、荷車で王都の造幣所へ運ぶ。
//     荷車は道を実際に進み（S.mintflow.runs）、運び手は荷車の脇を歩く。帰りは空の荷車で鉱山へ戻る。
//  3. 売る（造幣所に着いたとき）：造幣所が鉱石を買い上げる。
//     払う側：造幣所（打ち置きの新しい硬貨の箱）　受け取る側：鉱石の持ち主の鉱夫の家計（代金から運び賃を引いた分）と、運び手の家計（運び賃）
//     代金は、含まれる銀と金の値打ち ×（1 − 造幣益 − 手間賃）。造幣益は王の強欲さで5〜10%、手間賃は3%（以前と同じ）。
//  4. 打つ（造幣所の中）：造幣の職人（王都の宝石職人・鍛冶屋が兼ねる。いなければ手の空いた大人）が、
//     炉で鉱石を溶かす → 型に流して延べ板にする → 延べ板を打刻して硬貨にする。打った硬貨は造幣所の箱に入る。
//     硬貨の質（悪鋳の b.q）が低いほど、同じ銀から多くの硬貨ができる（その差は造幣益として国庫の取り分になる）。
//  5. 出す（午後）：国庫の取り分がたまると、硬貨の箱を職人が担ぎ、兵士が警護して、造幣所から王城へ運ぶ。着いたら国庫へ。
//     職人の手間賃（打った地金の値打ちの3%）は、給料日に造幣所の箱から払う。
//
// ■ お金の出どころと行き先（社長の決まり）
//   造幣所の箱の硬貨は「まだ世に出ていない硬貨」。帳簿（ledger.js）の世界のお金には数えない。
//   箱から出て人や国庫に渡った瞬間に「発行」（S.bank.led.issue と led.mint）として記録する。だから帳簿のずれは0のまま。
//     発行の行き先は3つだけ：鉱夫と運び手の家計（鉱石の代金）・職人の家計（給料日の手間賃）・国庫（造幣益。警護つきで運んで着いたとき）
//   箱の中身は、打った分だけ増え、払った分だけ減る。最初の打ち置き（FLOAT0）も、まだ世に出ていない硬貨。
//   箱が足りなければ、鉱夫には預かり証を渡し（K.owe）、次に打ち上がったときに払う（借りが消えることはない）。
//   職人のいない日が続いたときは、夜番が残りを打つ（手間賃は王都の蓄えへ。以前と同じ）。
//
// ■ 本体からの呼び方（つなぎ方は scratchpad/mint/apply.py）
//   mintDaily(sim)             … sim.newDay の bankDaily のすぐあと（1日の締め・給料日の手間賃・預かり証）。bank.js の以前の mintDaily の呼び出しは消す
//   mintHourly(sim)            … sim.newHourRest の carryHourly の前（掘る・置き場へ置く・荷車を出す・硬貨の箱を出す）
//   mintStep(sim, dt)          … sim.stepEnd の stepConvoys のあと（荷車と箱を進め、造幣所の中の仕事を進める）
//   mintDecide(sim, p, add)    … sim.decide の carryDecide のあと（造幣の職人が造幣所へ行く）
//   mintViews(sim)             … render.js の updateConvoys（荷車を映す）
//   mintBuildingHTML / mintPersonHTML / MINT_LABEL / MINT_GO … ui.js
// 状態：S.mintflow（古いセーブで欠けていても ensureMint で作る）。人：p.mfOre（造幣所行きの鉱石）・p.mfDig・p.mfLog・p.mintHand・p.mintStep
import { JOBS } from './data.js';
import { W, H, T } from './world.js';
import { findPath } from './path.js';
import { findPathFar } from './pathfar.js';
import { ITEMS, makeItem } from './items.js';
import { MAT } from './matter.js';
import { flow, income } from './ledger.js';
import { isPayday } from './payday.js';

// ---------- 数字 ----------
const MINE_AG = 2.4;      // 鉱夫1人・1日あたりに掘れる銀（銅貨にしていくら分）… 以前と同じ
const MINTAGE = 0.03;     // 造幣職人の手間賃（地金の値打ちに対して）… 以前と同じ
const WORK_H = 3;         // 1日の割り当てを掘り切る、坑道での仕事の時間（鉱夫の坑道での仕事はふつう3〜6時間）
const LUMP_AG = 1.2;      // 銀鉱石1個に含まれる銀（銅貨にしていくら分。痩せた鉱石）
const BAR_AG = 6;         // 銀の延べ板1枚の銀
const LOAD = 2;           // 鉱夫が持って歩く鉱石の数（これだけたまれば置き場へ）
const CART_MIN = 10;      // これだけたまれば荷車を出す
const CART_DAYS = 2;      // たまらなくても、この日数たてば出す
const FLOAT0 = 60;        // 造幣所の最初の打ち置き硬貨（まだ世に出ていない）
const CHEST_MIN = 6;      // 国庫へ運ぶ取り分がこれだけたまれば運ぶ
const CART_SPEED = 0.8;   // 荷車：1分あたり何マス（logistics.js と同じ）
const WALK_SPEED = 0.9;   // 箱を担いで歩く速さ
const SMELT_MIN = 6, CAST_MIN = 5, STRIKE_MIN = 12;   // 仕事の手間（分）：鉱石1個を溶かす・延べ板1枚を流す・延べ板1枚を打つ
const TILE_SLOW = { [T.FOREST]: 1.5, [T.DENSE]: 2, [T.JUNGLE]: 2, [T.DESERT]: 1.4, [T.SNOW]: 1.6, [T.ROCK]: 2.2, [T.SWAMP]: 2.2, [T.GRASS]: 1.25, [T.SAVANNA]: 1.25, [T.BEACH]: 1.3, [T.FIELD]: 1.3, [T.PASTURE]: 1.25, [T.WASTE]: 1.5 };
const HIRED = ['coachman', 'porter', 'peddler', 'roadworker', 'pioneer', 'charcoal', 'woodcutter', 'shepherd', 'rancher', 'beggar', 'gatherer', 'laundress', 'stablehand'];
const HANDS = ['jeweler', 'smith', 'changer', 'servant', 'laborer', 'potter', 'cobbler', 'weaver', 'tailor', 'carpenter', 'maid', 'stablehand', 'laundress', 'beggar'];
const GUARDS = ['royalguard', 'soldier', 'guard', 'knight'];
const ORE = ['silver_ore', 'gold_ore'];
const ORE_NAME = { silver_ore: '銀鉱石', gold_ore: '金鉱石' };
const STEP_NAME = { smelt: '炉で鉱石を溶かしている', cast: '溶けた銀を型に流して延べ板にしている', strike: '延べ板を打刻して硬貨にしている', count: '打ち上がった硬貨を数えている' };

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const r1 = (x) => Math.round(x);
const r10 = (x) => Math.round(x * 10) / 10;
const alive = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null ? q : null; };
const seignOf = (k) => 0.05 + (k.taxes?.greed ?? 0.5) * 0.05;
const capOf = (sim, k) => sim.town(k.capital);
const kOfSid = (sim, sid) => sim.town(sid)?.kingdom;
const nameOf = (sim, p) => (p ? `${p.job ? JOBS[p.job]?.name || '' : ''}${p.given}` : '誰か');

// ---------- 状態 ----------
function blankDay(d) { return { d, oreIn: { silver_ore: 0, gold_ore: 0 }, agIn: 0, auIn: 0, smelted: 0, bars: 0, struck: 0, face: 0, toMiners: 0, toHaulers: 0, toHands: 0, toCrown: 0, paid: [] }; }
export function ensureMint(sim) {
  const S = sim.S;
  const M = S.mintflow = S.mintflow || { v: 1, seq: 0, k: {}, piles: {}, runs: [], stats: { dug: 0, gold: 0, carts: 0, delivered: 0, struck: 0, chests: 0, auto: 0 }, seeded: false };
  M.k = M.k || {}; M.piles = M.piles || {}; M.runs = M.runs || []; M.stats = M.stats || {};
  for (const k of S.kingdoms) {
    if (!M.k[k.id]) M.k[k.id] = { yard: { silver_ore: 0, gold_ore: 0, ag: 0, au: 0, cost: 0 }, melt: { ag: 0, au: 0, cost: 0 }, bars: { n: 0, ag: 0, ng: 0, au: 0, cost: 0 },
      box: FLOAT0, crownDue: 0, owe: {}, wage: {}, work: 0, step: null, hands: [], today: blankDay(sim.today), yest: null, year: { y: sim.year(), oreIn: { silver_ore: 0, gold_ore: 0 }, ag: 0, au: 0, struck: 0, face: 0, toMiners: 0, toCrown: 0, toHands: 0 }, lastWork: sim.today, lastChest: sim.today, log: [] };
    const K = M.k[k.id];
    K.owe = K.owe || {}; K.wage = K.wage || {}; K.hands = K.hands || []; K.log = K.log || [];
    if (!K.today) K.today = blankDay(sim.today);
  }
  return M;
}
// 造幣所の建物（bank.js が置いたもの）
function mintOf(sim, k) {
  const b = sim.S.bank?.k?.[k.id];
  if (!b || b.mint == null || b.mint < 0) return null;
  return sim.building(b.mint) || null;
}
function working(sim, k) {
  const cap = capOf(sim, k);
  return !!(cap && !sim.S.towns[cap.id]?.occupied && mintOf(sim, k) && sim.S.bank?.init);
}
function note(sim, K, txt) { K.log.push({ d: sim.today, h: Math.floor(sim.hour()), txt }); if (K.log.length > 14) K.log.shift(); }
function plog(sim, p, txt) { if (!p) return; const L = p.mfLog || (p.mfLog = []); L.push({ d: sim.today, txt }); if (L.length > 6) L.shift(); }

// 鉱脈から取る（経済部の resources.js が鉱脈を持っていればそちらを優先。bank.js の takeFromVein と同じ）
function takeFromVein(sim, mineId, metal, want) {
  if (!(want > 0)) return 0;
  const R = sim.S.resources?.veins?.[mineId];
  if (R && typeof R[metal] === 'number') { const g = Math.min(want, Math.max(0, R[metal])); R[metal] -= g; return g; }
  const v = sim.S.bank?.veins?.[mineId]; if (!v) return 0;
  const g = Math.min(want, Math.max(0, v[metal] || 0)); v[metal] -= g; return g;
}

// ---------- 発行：造幣所の箱の硬貨が世に出る ----------
function issue(sim, k, amt) {
  if (!(amt > 0)) return 0;
  const B = sim.S.bank, b = B?.k?.[k.id];
  if (!b) return 0;
  B.led.issue += amt; B.led.mint += amt;
  b.issued += amt; b.issuedYear += amt; b.issuedToday += amt;
  return amt;
}
// 箱から人（の家計）へ払う。払えた額を返す
function payFromBox(sim, k, K, to, amt, why, job) {
  amt = Math.min(amt, Math.max(0, K.box));
  if (!(amt > 0)) return 0;
  K.box -= amt;
  issue(sim, k, amt);
  const p = typeof to === 'object' && to && to.given ? to : null;
  const hh = p ? sim.hh(p) : typeof to === 'number' ? sim.S.households[to] : null;
  if (hh) hh.money += amt;
  else if (p) p.purse = (p.purse || 0) + amt;
  else { const t = sim.S.towns[k.capital]; t.fund = (t.fund || 0) + amt; }
  flow(sim, '王立造幣所', job ? (JOBS[job]?.name || job) : '町の蓄え', amt, why);
  if (job) income(sim, job, amt);
  return amt;
}

// ---------- 持ち物の鉱石 ----------
// 目録（matter.js の MAT）の品を持ち物として持てるように登録する（carry.js の matterItem と同じ形。循環 import を避けて、ここに持つ）
function matterItem(id) {
  if (ITEMS[id]) return ITEMS[id];
  const e = MAT.get(id);
  if (!e) return null;
  ITEMS[id] = { name: e.name, type: 'material', value: e.v, w: e.w, stack: e.stack || 1, matter: true };
  return ITEMS[id];
}
function addLumps(sim, p, id, n) {
  if (n <= 0) return;
  matterItem(id);
  p.inv = p.inv || [];
  const it = p.inv.find((x) => x.id === id);
  if (it) it.n = (it.n || 1) + n; else p.inv.push(makeItem(id, 1, { n }));
  p._cd = true;
}
function takeLumps(p, id, n) {
  let left = n;
  for (const it of (p.inv || []).slice()) {
    if (left <= 0) break;
    if (it.id !== id) continue;
    const have = it.n || 1, t = Math.min(have, left);
    if (t >= have) p.inv.splice(p.inv.indexOf(it), 1); else it.n = have - t;
    left -= t;
  }
  p._cd = true;
  return n - left;
}
const carried = (p) => (p.mfOre ? (p.mfOre.silver_ore || 0) + (p.mfOre.gold_ore || 0) : 0);

// 坑口の鉱石置き場へ置く（置き場の鉱石は、置いた鉱夫のもの）
function dumpToPile(sim, p, s) {
  const o = p.mfOre; if (!o || carried(p) <= 0) { p.mfOre = null; return; }
  const mineId = s?.mine;
  const ns = takeLumps(p, 'silver_ore', o.silver_ore || 0), ng = takeLumps(p, 'gold_ore', o.gold_ore || 0);
  // 手元に見当たらない分（売った・落とした）は、その分の銀も置き場へ行かない
  const fs = (o.silver_ore || 0) ? ns / o.silver_ore : 0, fg = (o.gold_ore || 0) ? ng / o.gold_ore : 0;
  if (mineId == null || ns + ng <= 0) { p.mfOre = null; return; }
  const M = sim.S.mintflow;
  const P = M.piles[mineId] = M.piles[mineId] || { lots: [], s: s.id };
  let lot = P.lots.find((l) => l.o === p.id && l.d === sim.today);
  if (!lot) P.lots.push(lot = { o: p.id, hh: p.hh, d: sim.today, silver_ore: 0, gold_ore: 0, ag: 0, au: 0 });
  lot.silver_ore += ns; lot.gold_ore += ng; lot.ag += (o.ag || 0) * fs; lot.au += (o.au || 0) * fg;
  p.mfOre = null;
}

// ---------- 掘る（毎時） ----------
function digHour(sim, k, s, p) {
  const S = sim.S, R = sim.rng;
  const d = p.mfDig && p.mfDig.d === sim.today ? p.mfDig : (p.mfDig = { d: sim.today, quota: MINE_AG * (0.6 + (p.skill?.miner ?? 0.3)) * R.range(0.5, 1.3), got: 0, gold: R.chance(0.04) ? R.int(10, 30) : 0, frac: p.mfDig?.frac || 0 });
  const a = p.action;
  const mineB = s.mine != null ? sim.building(s.mine) : null;
  const atMine = a && a.type === 'work' && a.phase === 'do' && (mineB ? p.inside === mineB.id : true);
  if (atMine) {
    S.mintflow.stats.hours = (S.mintflow.stats.hours || 0) + 1;
    const want = Math.min(d.quota / WORK_H, d.quota - d.got);
    const g = takeFromVein(sim, s.mine, 'ag', want);
    d.got += g; d.frac += g;
    const o = p.mfOre || (p.mfOre = { silver_ore: 0, gold_ore: 0, ag: 0, au: 0 });
    let n = 0;
    while (d.frac >= LUMP_AG) { d.frac -= LUMP_AG; n++; }
    if (n) { addLumps(sim, p, 'silver_ore', n); o.silver_ore += n; o.ag += n * LUMP_AG; S.mintflow.stats.dug += n; }
    if (d.gold > 0) {
      const au = takeFromVein(sim, s.mine, 'au', d.gold); d.gold = 0;
      if (au > 0) {
        addLumps(sim, p, 'gold_ore', 1); o.gold_ore += 1; o.au += au; S.mintflow.stats.gold++;
        sim.remember(p, '坑道の奥で、金の粒がきらめく石を掘り当てた。造幣所へ持っていけば高く買ってもらえる', { emo: 0.7, imp: 0.6, k: 'money' });
      }
    }
    // 2個たまったら、仕事を切り上げるときは、坑口の置き場へ
    const ending = a.until != null && a.until - S.t <= 60;
    if (carried(p) >= LOAD || (ending && carried(p) > 0)) dumpToPile(sim, p, s);
  } else if (carried(p) > 0) dumpToPile(sim, p, s);   // 坑道を出た：持っていた鉱石は坑口の置き場に置いてきた
}

// ---------- 造幣の職人を決める ----------
function pickHands(sim, k, K) {
  const cap = capOf(sim, k); if (!cap) return;
  K.hands = K.hands.filter((id) => { const q = alive(sim, id); return q && q.s === cap.id && q.mintHand === k.id && sim.ageOf(q) < 70 && q.jail == null; });
  if (K.hands.length >= 2) return;
  const pool = sim.living().filter((q) => q.s === cap.id && sim.isAdult(q) && sim.ageOf(q) < 62 && q.jail == null && !q.bandit && q.mintHand == null);
  for (const j of HANDS) {
    if (K.hands.length >= 2) break;
    const q = pool.find((x) => x.job === j && !K.hands.includes(x.id));
    if (q) { q.mintHand = k.id; K.hands.push(q.id); sim.remember(q, `王立造幣所に呼ばれ、硬貨を打つ仕事を兼ねることになった（手間賃は打った地金の${MINTAGE * 100}%）`, { emo: 0.4, imp: 0.55, k: 'work' }); }
  }
  if (K.hands.length < 1) { const q = pool.find((x) => !x.job) || pool.find((x) => ['commoner', 'citizen'].includes(x.rank) && !GUARDS.includes(x.job)); if (q) { q.mintHand = k.id; K.hands.push(q.id); sim.remember(q, '王立造幣所の人手が足りず、硬貨を打つ仕事を手伝うことになった', { emo: 0.3, imp: 0.5, k: 'work' }); } }
}

// ---------- 荷車の道 ----------
const PATHS = new WeakMap();
function routeBetween(sim, a, b, key) {
  const w = sim.S.world;
  let m = PATHS.get(w); if (!m) PATHS.set(w, m = new Map());
  if (!m.has(key)) {
    let p = W > 200 ? findPathFar(w, a.x, a.z, b.x, b.z, { maxIter: 60000 }) : findPath(w, a.x, a.z, b.x, b.z, 60000);
    if (!p) p = findPath(w, a.x, a.z, b.x, b.z, 120000);
    m.set(key, p && p.length ? p : null);
    if (m.size > 60) m.delete(m.keys().next().value);
  }
  const p = m.get(key);
  return p ? p.slice() : null;
}
function freeFor(sim, q) {
  const a = q.action?.type;
  return q.jail == null && !q.fight && !q.bandit && !q.talk && q.mission == null && q.hp > q.maxhp * 0.6 && a !== 'sleep' && a !== 'orehaul' && a !== 'coinrun' && a !== 'coinguard'
    && a !== 'trade' && a !== 'escort' && a !== 'sail' && a !== 'quest' && a !== 'march' && a !== 'defend' && a !== 'flee' && q.porterFor == null;
}
function board(sim, p, run, type) {
  if (p.inside != null) { const b = sim.building(p.inside); if (b) p.pos = { x: b.door.x, z: b.door.z }; p.inside = null; }
  p.talk = null;
  p.action = { type, mfRun: run.id, dur: 0, until: sim.S.t + 1e7, bld: null, phase: 'do', startNeeds: { ...p.needs }, startMood: p.mood };
  p.path = [];
  p._spot = 1e9;   // 荷のそばを離れない（魔物を見ても一人で逃げ出さない）
}
function unboard(sim, p, run) {
  if (!p) return;
  if (p._spot > 1e6) p._spot = 0;
  if (p.action?.mfRun === run.id) { p.action.until = sim.S.t; p.action.mfRun = null; }
}

// 荷車を出す（朝）
function launchCart(sim, k, s, P) {
  const S = sim.S, R = sim.rng, M = S.mintflow;
  const mineB = sim.building(s.mine), mintB = mintOf(sim, k);
  if (!mineB || !mintB) return false;
  const lots = P.lots.filter((l) => l.silver_ore + l.gold_ore > 0);
  if (!lots.length) return false;
  const load = { silver_ore: 0, gold_ore: 0, ag: 0, au: 0 };
  for (const l of lots) { load.silver_ore += l.silver_ore; load.gold_ore += l.gold_ore; load.ag += l.ag; load.au += l.au; }
  // 運び手：村の手の空いた人を雇う。いなければ、いちばん多く置いた鉱夫が自分で引く
  const pool = sim.living().filter((q) => q.s === s.id && sim.isAdult(q) && sim.ageOf(q) < 62 && freeFor(sim, q));
  let drv = null;
  for (const j of HIRED) { drv = pool.find((q) => q.job === j); if (drv) break; }
  if (!drv) { const top = [...lots].sort((a, b) => (b.ag + b.au) - (a.ag + a.au)).map((l) => alive(sim, l.o)).find((q) => q && q.s === s.id && freeFor(sim, q)); drv = top || pool.find((q) => q.job === 'miner') || null; }
  const path = routeBetween(sim, mineB.door, mintB.door, `m${mineB.id}>${mintB.id}`);
  const run = { id: ++M.seq, type: 'ore', k: k.id, mine: mineB.id, sid: s.id, mint: mintB.id, path, i: 0, pos: { x: mineB.door.x, z: mineB.door.z }, dir: { x: 1, z: 0 }, state: 'go', load, lots, riders: [], driver: drv?.id ?? null, t0: S.t };
  P.lots = [];
  P.lastCart = sim.today;
  M.stats.carts++;
  if (!path || !drv) { deliverOre(sim, run); return true; }   // 道がない・引き手がいない：村の衆が担いで届けた（すぐに売る）
  M.runs.push(run);
  run.riders.push(drv.id); board(sim, drv, run, 'orehaul');
  const txt = `${ORE_NAME.silver_ore}${load.silver_ore}個${load.gold_ore ? `と${ORE_NAME.gold_ore}${load.gold_ore}個` : ''}`;
  plog(sim, drv, `${mineB.name}から${txt}を荷車に積み、${capOf(sim, k).name}の王立造幣所へ向かった`);
  for (const l of lots) { const q = alive(sim, l.o); if (q && q !== drv) plog(sim, q, `掘った${ORE_NAME.silver_ore}${l.silver_ore}個${l.gold_ore ? `・${ORE_NAME.gold_ore}${l.gold_ore}個` : ''}を、${drv.given}の荷車に託して造幣所へ送った`); }
  sim.pushLog(`${mineB.name}から、${txt}を積んだ荷車が王立造幣所へ向かった（引き手：${drv.given}）。`, 'event', [drv.id], run.pos);
  return true;
}

// 国庫へ硬貨の箱を運ぶ（午後）
function launchChest(sim, k, K) {
  const S = sim.S, M = S.mintflow;
  const mintB = mintOf(sim, k), cap = capOf(sim, k);
  const castle = cap && sim.townBuilding(cap, 'castle');
  const amt = Math.min(K.crownDue, K.box);
  if (!(amt > 0.5)) return false;
  K.box -= amt; K.crownDue -= amt;
  const run = { id: ++M.seq, type: 'chest', k: k.id, mint: mintB?.id, to: castle?.id, path: null, i: 0, pos: mintB ? { x: mintB.door.x, z: mintB.door.z } : { x: cap.x, z: cap.z }, dir: { x: 1, z: 0 }, state: 'go', amt, riders: [], guards: [], t0: S.t };
  K.lastChest = sim.today;
  M.stats.chests++;
  const pool = sim.living().filter((q) => q.s === cap.id && sim.isAdult(q) && freeFor(sim, q));
  const bearer = K.hands.map((id) => alive(sim, id)).find((q) => q && pool.includes(q)) || pool.find((q) => HANDS.includes(q.job));
  const guards = pool.filter((q) => GUARDS.includes(q.job) && q !== bearer && q.action?.type === 'work').slice(0, 2);
  run.path = mintB && castle ? routeBetween(sim, mintB.door, castle.door, `c${mintB.id}>${castle.id}`) : null;
  if (!run.path || !bearer) { chestArrive(sim, run); return true; }
  M.runs.push(run);
  run.riders.push(bearer.id); board(sim, bearer, run, 'coinrun');
  for (const g of guards) { run.riders.push(g.id); run.guards.push(g.id); board(sim, g, run, 'coinguard'); }
  plog(sim, bearer, `造幣所で打った硬貨${r1(amt)}枚の箱を担ぎ、王城の国庫へ運んだ${guards.length ? `（${guards.map((g) => g.given).join('と')}が警護）` : ''}`);
  for (const g of guards) plog(sim, g, `造幣所から王城へ運ばれる硬貨${r1(amt)}枚の箱を警護した`);
  return true;
}

// ---------- 着いたとき ----------
function deliverOre(sim, run) {
  const S = sim.S, k = S.kingdoms[run.k], K = S.mintflow.k[run.k];
  if (!k || !K) return;
  const L = run.load, seign = seignOf(k), rate = 1 - seign - MINTAGE;
  const drv = alive(sim, run.driver);
  const mineB = sim.building(run.mine);
  // 造幣所の庭に入る（代金の分は「仕入れ」として地金に付いてまわる）
  let cost = 0, hauler = 0;
  const T0 = K.today;
  const total = L.ag + L.au;
  const fee = drv ? Math.min(total * rate * 0.5, Math.max(1, total * rate * 0.06)) : 0;   // 運び賃は鉱石の持ち主が代金から出す
  let feeLeft = fee;
  const owners = run.lots.filter((l) => !(drv && l.o === drv.id));
  const ownerVal = owners.reduce((s, l) => s + l.ag + l.au, 0);
  for (const l of run.lots) {
    const v = l.ag + l.au; if (v <= 0) continue;
    const price = v * rate;
    const myFee = drv && l.o !== drv.id && ownerVal > 0 ? fee * (v / ownerVal) : 0;
    feeLeft -= myFee;
    const q = alive(sim, l.o);
    const to = q || (S.households[l.hh] ? l.hh : null);
    const want = price - myFee;
    const got = payFromBox(sim, k, K, to, want, '鉱石の代金', 'miner');
    if (got < want - 1e-9 && q) K.owe[q.id] = (K.owe[q.id] || 0) + (want - got);   // 箱が足りない：預かり証
    else if (got < want - 1e-9) K.owe['h' + l.hh] = (K.owe['h' + l.hh] || 0) + (want - got);
    cost += price;
    T0.toMiners += got; K.year.toMiners += got;
    T0.paid.push({ pid: q?.id ?? null, hh: l.hh, amt: r10(want), why: `${ORE_NAME.silver_ore}${l.silver_ore}個${l.gold_ore ? `・${ORE_NAME.gold_ore}${l.gold_ore}個` : ''}の代金${myFee > 0 ? `（運び賃${r10(myFee)}を引いた）` : ''}` });
    if (q) {
      plog(sim, q, `${ORE_NAME.silver_ore}${l.silver_ore}個${l.gold_ore ? `・${ORE_NAME.gold_ore}${l.gold_ore}個` : ''}が王立造幣所に売れ、${r10(want)}銅貨を受け取った`);
      if (l.gold_ore) sim.remember(q, `金の粒の入った石を王立造幣所に${r1(want)}銅貨で買い上げてもらった`, { emo: 0.7, imp: 0.6, k: 'money' });
    }
  }
  if (drv && fee - Math.max(0, feeLeft) > 0) {
    const f = fee - Math.max(0, feeLeft);
    const got = payFromBox(sim, k, K, drv, f, '鉱石の運び賃', drv.job || 'porter');
    hauler += got; T0.toHaulers += got;
    T0.paid.push({ pid: drv.id, amt: r10(f), why: '荷車の運び賃（鉱夫たちの代金から）' });
    plog(sim, drv, `王立造幣所に鉱石を届け、運び賃${r10(f)}銅貨を受け取った`);
  }
  K.yard.silver_ore += L.silver_ore; K.yard.gold_ore += L.gold_ore; K.yard.ag += L.ag; K.yard.au += L.au; K.yard.cost += cost;
  T0.oreIn.silver_ore += L.silver_ore; T0.oreIn.gold_ore += L.gold_ore; T0.agIn += L.ag; T0.auIn += L.au;
  K.year.oreIn.silver_ore += L.silver_ore; K.year.oreIn.gold_ore += L.gold_ore; K.year.ag += L.ag; K.year.au += L.au;
  S.mintflow.stats.delivered += L.silver_ore + L.gold_ore;
  const txt = `${ORE_NAME.silver_ore}${L.silver_ore}個${L.gold_ore ? `・${ORE_NAME.gold_ore}${L.gold_ore}個` : ''}`;
  note(sim, K, `${mineB?.name || '鉱山'}から${txt}が届き、代金${r1(T0.toMiners)}銅貨を払った`);
  const mintB = sim.building(run.mint);
  sim.pushLog(`${mineB?.name || '鉱山'}の荷車が王立造幣所に着いた（${txt}）。造幣所が買い上げ、鉱夫たちに代金を払った。`, 'event', run.riders, mintB ? { x: mintB.door.x, z: mintB.door.z } : run.pos);
}
function chestArrive(sim, run) {
  const S = sim.S, k = S.kingdoms[run.k], K = S.mintflow.k[run.k];
  if (!k || !K || !(run.amt > 0)) return;
  const amt = run.amt; run.amt = 0;
  issue(sim, k, amt);
  k.treasury += amt;
  if (k.fisc) { k.fisc.dayIn = (k.fisc.dayIn || 0) + amt; if (k.fisc.cur) k.fisc.cur.mint = (k.fisc.cur.mint || 0) + amt; }
  flow(sim, '王立造幣所', '国庫', amt, '造幣益（打った硬貨の王の取り分）');
  K.today.toCrown += amt; K.year.toCrown += amt;
  K.today.paid.push({ crown: true, amt: r10(amt), why: '造幣益（警護つきで王城へ運んだ）' });
  note(sim, K, `打った硬貨${r1(amt)}枚の箱を、王城の国庫へ運び入れた`);
  const castle = run.to != null ? sim.building(run.to) : null;
  if (run.riders.length) sim.pushLog(`王立造幣所から、硬貨${r1(amt)}枚の箱が警護つきで王城の国庫へ運び込まれた。`, 'event', run.riders, castle ? { x: castle.door.x, z: castle.door.z } : run.pos);
}

// ---------- 造幣所の中の仕事 ----------
// 1分ごとの手間 m（職人の腕で少し変わる）ぶん進める。返り値はいまの工程
function mintWork(sim, k, K, m, who) {
  const b = sim.S.bank.k[k.id];
  K.work = Math.min(K.work + m, m > 1e5 ? m : 40);   // 手の空いた時間はためない
  let step = null;
  const lim = m > 1e5 ? 5000 : 50;
  for (let guard = 0; guard < lim; guard++) {
    // 1. 溶かす：鉱石を1個ずつ炉へ
    const lumps = K.yard.silver_ore + K.yard.gold_ore;
    const canCast = K.melt.ag >= BAR_AG || (K.melt.ag > 0 && lumps === 0) || K.melt.au > 0;
    if (K.bars.n + K.bars.ng > 0 && (!lumps || K.bars.n + K.bars.ng >= 3) && !canCast) step = 'strike';
    else if (canCast && (K.melt.ag >= BAR_AG || lumps === 0 || K.melt.au > 0)) step = 'cast';
    else if (lumps > 0) step = 'smelt';
    else if (K.bars.n + K.bars.ng > 0) step = 'strike';
    else { step = null; K.work = 0; break; }
    const need = step === 'smelt' ? SMELT_MIN : step === 'cast' ? CAST_MIN : STRIKE_MIN;
    if (K.work < need) break;
    K.work -= need;
    if (step === 'smelt') {
      const id = K.yard.gold_ore > 0 ? 'gold_ore' : 'silver_ore';
      const n = K.yard[id], f = 1 / (K.yard.silver_ore + K.yard.gold_ore);
      const ag = id === 'silver_ore' ? K.yard.ag / Math.max(1, K.yard.silver_ore) : 0;
      const au = id === 'gold_ore' ? K.yard.au / Math.max(1, K.yard.gold_ore) : 0;
      const c = K.yard.cost * ((ag + au) / Math.max(1e-9, K.yard.ag + K.yard.au));
      K.yard[id] = n - 1; K.yard.ag -= ag; K.yard.au -= au; K.yard.cost -= c;
      if (K.yard.silver_ore + K.yard.gold_ore <= 0) { K.yard.ag = 0; K.yard.au = 0; K.yard.cost = 0; }
      K.melt.ag += ag; K.melt.au += au; K.melt.cost += c;
      K.today.smelted++;
      void f;
    } else if (step === 'cast') {
      if (K.melt.au > 0) { const c = K.melt.cost * (K.melt.au / Math.max(1e-9, K.melt.ag + K.melt.au)); K.bars.ng++; K.bars.au += K.melt.au; K.bars.cost += c; K.melt.cost -= c; K.melt.au = 0; }
      else { const ag = Math.min(BAR_AG, K.melt.ag); const c = K.melt.cost * (ag / Math.max(1e-9, K.melt.ag)); K.bars.n++; K.bars.ag += ag; K.bars.cost += c; K.melt.cost -= c; K.melt.ag -= ag; if (K.melt.ag < 1e-6) { K.melt.ag = 0; K.melt.cost = 0; } }
      K.today.bars++;
    } else {
      // 打つ：延べ板1枚（金があれば金から）を硬貨に
      let v, c;
      if (K.bars.ng > 0) { v = K.bars.au / K.bars.ng; c = K.bars.cost * (v / Math.max(1e-9, K.bars.ag + K.bars.au)); K.bars.ng--; K.bars.au -= v; b.bullion.au += v; }
      else { v = K.bars.ag / Math.max(1, K.bars.n); c = K.bars.cost * (v / Math.max(1e-9, K.bars.ag + K.bars.au)); K.bars.n--; K.bars.ag -= v; b.bullion.ag += v; }
      K.bars.cost -= c;
      if (K.bars.n + K.bars.ng <= 0) { K.bars.ag = 0; K.bars.au = 0; K.bars.cost = 0; }
      const face = v / Math.max(0.3, b.q);   // 質を落としていれば、同じ地金から多くの硬貨ができる
      const brass = v * MINTAGE;
      K.box += face;
      K.crownDue += Math.max(0, face - c - brass);   // 造幣益（悪鋳していれば、その差益もここに入る）
      if (who) K.wage[who.id] = (K.wage[who.id] || 0) + brass; else K.wage.fund = (K.wage.fund || 0) + brass;
      K.today.struck += Math.round(face); K.today.face += face; K.year.struck += Math.round(face); K.year.face += face;
      sim.S.mintflow.stats.struck += Math.round(face);
      payOwed(sim, k, K);
    }
  }
  return step;
}
// 預かり証の分を払う（打ち上がったとき）
function payOwed(sim, k, K) {
  for (const [key, amt] of Object.entries(K.owe)) {
    if (K.box <= 0) break;
    const q = key[0] === 'h' ? null : alive(sim, +key);
    const to = q || (key[0] === 'h' ? +key.slice(1) : sim.S.people[+key]?.hh);
    const got = payFromBox(sim, k, K, to ?? null, amt, '鉱石の代金（預かり証の分）', 'miner');
    K.today.toMiners += got; K.year.toMiners += got;
    if (amt - got < 0.01) delete K.owe[key]; else K.owe[key] = amt - got;
  }
}
// 手間賃（給料日）
function payWages(sim, k, K) {
  for (const [key, amt] of Object.entries(K.wage)) {
    if (!(amt > 0.01)) { delete K.wage[key]; continue; }
    if (key === 'fund') {
      const got = payFromBox(sim, k, K, null, amt, '造幣の手間賃（夜番）', null);
      K.today.toHands += got; K.year.toHands += got;
      if (amt - got < 0.01) delete K.wage[key]; else K.wage[key] = amt - got;
      continue;
    }
    const q = sim.S.people[+key];
    const to = q && q.deathYear == null ? q : q ? q.hh : null;
    const got = payFromBox(sim, k, K, to, amt, '造幣の手間賃', q?.job || 'jeweler');
    K.today.toHands += got; K.year.toHands += got;
    if (q) { K.today.paid.push({ pid: q.id, amt: r10(got), why: '造幣の手間賃（給料日）' }); if (q.deathYear == null) plog(sim, q, `給料日。造幣所で打った地金の手間賃${r10(got)}銅貨を受け取った`); }
    if (amt - got < 0.01) delete K.wage[key]; else K.wage[key] = amt - got;
  }
}

// ---------- 毎時 ----------
export function mintHourly(sim) {
  const S = sim.S;
  if (!S.bank?.init) return;
  const M = ensureMint(sim);
  const h = Math.floor(sim.hour());
  for (const k of S.kingdoms) {
    const K = M.k[k.id];
    const on = working(sim, k);
    if (!on) continue;
    if (h === 5 || !K.hands.length) pickHands(sim, k, K);
    // 掘る・置き場へ置く
    for (const s of S.world.settlements) {
      if (s.kingdom !== k.id || s.mine == null || S.towns[s.id]?.occupied) continue;
      for (const p of sim.living()) {
        if (p.s !== s.id) continue;
        if (p.job === 'miner' && p.jail == null && sim.ageOf(p) >= 14) digHour(sim, k, s, p);
        else if (carried(p) > 0) dumpToPile(sim, p, s);
      }
      // 荷車を出す（朝7〜10時。鉱山ごとに1台）
      const P = M.piles[s.mine];
      if (P && h >= 7 && h < 11 && !M.runs.some((r) => r.type === 'ore' && r.mine === s.mine)) {
        const n = P.lots.reduce((a, l) => a + l.silver_ore + l.gold_ore, 0);
        const oldest = P.lots.reduce((a, l) => Math.min(a, l.d), sim.today);
        if (n > 0 && (n >= CART_MIN || sim.today - oldest >= CART_DAYS || P.lots.some((l) => l.gold_ore > 0))) launchCart(sim, k, s, P);
      }
    }
    // 国庫へ（午後2〜4時）
    if (h >= 14 && h < 17 && !M.runs.some((r) => r.type === 'chest' && r.k === k.id) && K.box > 0 && (K.crownDue >= CHEST_MIN || (K.crownDue > 0.5 && sim.today - K.lastChest >= 3))) launchChest(sim, k, K);
  }
  // 鉱山のない町へ移った元鉱夫の鉱石は、ふつうの持ち物に戻す（造幣所行きの札を外す）
  if (h === 3) for (const p of sim.living()) if (p.mfOre && sim.town(p.s)?.mine == null) p.mfOre = null;
}

// ---------- 毎歩：荷車と箱を進める・造幣所の中の仕事 ----------
export function mintStep(sim, dt) {
  const S = sim.S, M = S.mintflow;
  if (!M) return;
  const w = S.world;
  for (let j = M.runs.length - 1; j >= 0; j--) {
    const run = M.runs[j];
    // 乗り手を確かめる（ほかの用事に呼ばれた人は離れた）
    let fighting = false;
    for (let i = run.riders.length - 1; i >= 0; i--) {
      const p = S.people[run.riders[i]];
      if (p && p.fight) { fighting = true; continue; }
      if (!p || p.deathYear != null || p.action?.mfRun !== run.id) { if (p && p._spot > 1e6) p._spot = 0; run.riders.splice(i, 1); }
    }
    const timeUp = S.t - run.t0 > 1440;
    if (!run.riders.length || timeUp || !run.path) { endRun(sim, run, true); M.runs.splice(j, 1); continue; }
    if (!fighting) {
      let sp = (run.type === 'ore' ? CART_SPEED : WALK_SPEED) * dt;
      while (sp > 0 && run.i < run.path.length) {
        const t = run.path[run.i];
        const dx = t.x - run.pos.x, dz = t.z - run.pos.z, d = Math.hypot(dx, dz);
        const slow = TILE_SLOW[w.tiles[t.z * W + t.x]] || 1;
        const step = sp / slow;
        if (d > 0.001) { run.dir.x = dx / d; run.dir.z = dz / d; }
        if (d <= step) { run.pos.x = t.x; run.pos.z = t.z; run.i++; sp -= d * slow; }
        else { run.pos.x += (dx / d) * step; run.pos.z += (dz / d) * step; sp = 0; }
      }
      if (run.i >= run.path.length) {
        if (run.type === 'ore' && run.state === 'go') {
          deliverOre(sim, run); run.delivered = true;
          run.state = 'back'; run.path = run.path.slice().reverse(); run.path.push({ x: w.buildings[run.mine]?.door.x ?? run.pos.x, z: w.buildings[run.mine]?.door.z ?? run.pos.z }); run.i = 0;
          run.load = { silver_ore: 0, gold_ore: 0, ag: 0, au: 0 }; run.lots = [];
        } else { endRun(sim, run, false); M.runs.splice(j, 1); continue; }
      }
    }
    // 乗り手を荷の位置へ（荷車の脇を歩く）
    for (let i = 0; i < run.riders.length; i++) {
      const p = S.people[run.riders[i]];
      if (!p || p.fight) continue;
      const off = i === 0 ? 0 : (i % 2 ? 0.7 : -0.7), back = run.type === 'ore' ? (i ? 0.5 : -0.55) : (i ? 0.6 : 0);
      p.pos.x = run.pos.x - run.dir.z * off - run.dir.x * back; p.pos.z = run.pos.z + run.dir.x * off - run.dir.z * back;
    }
  }
  // 造幣所の中の職人
  if (!S.bank?.init) return;
  for (const k of S.kingdoms) {
    const K = M.k[k.id]; if (!K || !K.hands.length) continue;
    const mintB = mintOf(sim, k); if (!mintB) continue;
    for (const id of K.hands) {
      const p = alive(sim, id);
      if (!p || p.action?.type !== 'mintwork' || p.action.phase !== 'do' || p.inside !== mintB.id) { if (p) p.mintStep = null; continue; }
      const skill = 0.8 + Math.min(0.6, (p.skill?.[p.job] ?? 0.3) * 0.6);
      const st = mintWork(sim, k, K, dt * skill, p);
      p.mintStep = st || 'count';
      K.step = st; K.lastWork = sim.today;
      if (!st && p.action.until - S.t > 10) p.action.until = S.t + 10;   // 仕事がなくなった：片づけて帰る
    }
  }
}
function endRun(sim, run, early) {
  const S = sim.S;
  if (run.type === 'ore' && !run.delivered) deliverOre(sim, run);   // 間に合わなかった荷も、村の衆が担いで届けた
  if (run.type === 'chest') chestArrive(sim, run);
  for (const id of run.riders) unboard(sim, S.people[id], run);
  if (early && run.type === 'ore' && !run.delivered) { /* 届けた扱い */ }
}

// ---------- 造幣の職人の行動（decide） ----------
export function mintDecide(sim, p, add) {
  if (p.mintHand == null || p.jail != null || p.fight) return;
  const S = sim.S, k = S.kingdoms[p.mintHand], K = S.mintflow?.k?.[p.mintHand];
  if (!k || !K || !working(sim, k)) return;
  const cap = capOf(sim, k);
  if (p.s !== cap.id) return;
  const h = sim.hour();
  if (h < 8 || h >= 18 || p.needs.sleep < 20 || p.needs.hunger < 25) return;
  const lumps = K.yard.silver_ore + K.yard.gold_ore, bars = K.bars.n + K.bars.ng;
  if (lumps + bars <= 0 && K.melt.ag + K.melt.au <= 0) return;
  const b = mintOf(sim, k);
  add(5.5 + Math.min(3, (lumps + bars * 2) / 6) + p.pers.C, 'mintwork', { x: b.door.x, z: b.door.z, bld: b.id }, sim.rng.int(60, 120));
}

// ---------- 毎日（sim.newDay の bankDaily のすぐあと） ----------
export function mintDaily(sim) {
  const S = sim.S;
  if (!S.bank?.init) return;
  for (const k of S.kingdoms) { const b = S.bank.k[k.id]; if (b) mintFlowDaily(sim, k, b); }
}
function mintFlowDaily(sim, k, b) {
  const S = sim.S, M = ensureMint(sim), K = M.k[k.id];
  // 1日の記録を締める
  if (K.today.d !== sim.today) { K.yest = K.today; K.today = blankDay(sim.today); }
  if (K.year.y !== sim.year()) K.year = { y: sim.year(), oreIn: { silver_ore: 0, gold_ore: 0 }, ag: 0, au: 0, struck: 0, face: 0, toMiners: 0, toCrown: 0, toHands: 0 };
  if (!working(sim, k)) return;
  if (!M.seeded) seedPiles(sim);
  pickHands(sim, k, K);
  // 職人が2日来なければ、夜番が残りを打つ（流れが止まらないように。手間賃は王都の蓄えへ）
  if (sim.today - K.lastWork >= 2 && K.yard.silver_ore + K.yard.gold_ore + K.bars.n + K.bars.ng + K.melt.ag + K.melt.au > 0) {
    mintWork(sim, k, K, 1e6, null); K.work = 0; K.lastWork = sim.today; M.stats.auto++;
    note(sim, K, '職人が来ないので、夜番が残りの地金を打った');
  }
  if (isPayday(sim, k.id)) payWages(sim, k, K);
  payOwed(sim, k, K);
  // 年の初めに、たまった硬貨の箱が大きすぎれば（悪鋳の差益など）、国庫の取り分に回す
  void b;
}
// 新しい世界（と古いセーブ）：鉱夫が前の日までに掘って置き場に置いた鉱石
function seedPiles(sim) {
  const S = sim.S, R = sim.rng, M = S.mintflow;
  M.seeded = true;
  for (const s of S.world.settlements) {
    const k = s.kingdom != null ? S.kingdoms[s.kingdom] : null;
    if (!k || s.mine == null || S.towns[s.id]?.occupied) continue;
    const P = M.piles[s.mine] = M.piles[s.mine] || { lots: [], s: s.id };
    for (const p of sim.living()) {
      if (p.s !== s.id || p.job !== 'miner' || p.jail != null || sim.ageOf(p) < 14) continue;
      const ag = takeFromVein(sim, s.mine, 'ag', MINE_AG * (0.6 + (p.skill?.miner ?? 0.3)) * R.range(1.2, 1.8));
      const n = Math.floor(ag / LUMP_AG); if (n <= 0) continue;
      const back = n * LUMP_AG; if (ag > back) { const v = S.resources?.veins?.[s.mine]; if (v && typeof v.ag === 'number') v.ag += ag - back; else if (S.bank.veins[s.mine]) S.bank.veins[s.mine].ag += ag - back; }
      P.lots.push({ o: p.id, hh: p.hh, d: sim.today - 1, silver_ore: n, gold_ore: 0, ag: back, au: 0 });
    }
  }
}

// ---------- 描画向け：荷車（render.js の updateConvoys で convoyViews と一緒に映す） ----------
export function mintViews(sim) {
  return (sim.S.mintflow?.runs || []).map((r) => ({ id: 'mf' + r.id, mf: true, kind: r.type === 'chest' ? 'chestcart' : 'orecart', gold: (r.load?.gold_ore || 0) > 0, home: null, x: r.pos.x, z: r.pos.z, dir: r.dir, angle: Math.atan2(r.dir.z, r.dir.x), state: 'moving', load: r.type === 'chest' ? 1 : (r.load?.silver_ore || 0) + (r.load?.gold_ore || 0) }));
}
// 造幣所の中の在庫（mintgfx.js が物として描く）
export function mintStock(sim, bid) {
  const S = sim.S, M = S.mintflow;
  if (!M) return null;
  for (const k of S.kingdoms) {
    const b = S.bank?.k?.[k.id];
    if (!b || b.mint !== bid) continue;
    const K = M.k[k.id]; if (!K) return null;
    return { k: k.id, ore: K.yard.silver_ore, gold: K.yard.gold_ore, melt: K.melt.ag + K.melt.au, bars: K.bars.n, gbars: K.bars.ng, box: K.box, crown: K.crownDue, q: b.q, step: K.step };
  }
  return null;
}

// ---------- 画面 ----------
export const MINT_LABEL = { orehaul: '鉱石の荷車を引いている', coinrun: '打った硬貨の箱を国庫へ運んでいる', coinguard: '国庫へ運ぶ硬貨の箱を警護している', mintwork: '王立造幣所で硬貨を打っている' };
export const MINT_GO = { mintwork: '王立造幣所へ向かっている' };
export const MINT_PREF = { mintwork: '造幣の仕事', orehaul: '鉱石運び' };
export const MINT_FALLBACK = { smelt: ['smelt', 'work', 'wander'], cast: ['cast', 'work', 'wander'], strike: ['strike', 'work', 'wander'], count: ['count', 'work', 'wander'] };
// 建物の中での立ち位置（interior.js の kindFor から）
export function mintKindFor(e) {
  if (e.action?.type === 'mintwork') return e.mintStep || 'count';
  return null;
}
const oreTxt = (o) => `${ORE_NAME.silver_ore}${o.silver_ore || 0}個${o.gold_ore ? `・${ORE_NAME.gold_ore}${o.gold_ore}個` : ''}`;
const coinName = (sim, kid) => { const f = MINT_HOOKS.coinStyle; try { const c = f && f(sim, kid); if (c?.name) return c.name; } catch { /* 硬貨の見た目の仕組みがまだない */ } return '銅貨'; };
export const MINT_HOOKS = { coinStyle: null };   // coinage.js があれば、mintgfx.js が coinStyle をここに入れる

// 建物の詳細欄（造幣所・鉱山）
export function mintBuildingHTML(sim, b, esc = (s) => String(s), pLink = (p) => esc(p?.given || '')) {
  const S = sim.S, M = S.mintflow;
  if (!M) return '';
  if (b.type === 'mine') {
    const P = M.piles[b.id];
    const lots = P?.lots || [];
    const run = M.runs.find((r) => r.type === 'ore' && r.mine === b.id);
    const tot = lots.reduce((a, l) => ({ silver_ore: a.silver_ore + l.silver_ore, gold_ore: a.gold_ore + l.gold_ore }), { silver_ore: 0, gold_ore: 0 });
    const s = sim.town(b.settlement ?? P?.s ?? sim.S.world.settlements.find((x) => x.mine === b.id)?.id);
    if (!lots.length && !run && !(s && s.kingdom != null)) return '';
    const who = lots.map((l) => { const q = S.people[l.o]; return `${q ? pLink(q) : '亡き鉱夫'}（${oreTxt(l)}）`; }).join('、');
    return `<div class="section"><h4>坑口の鉱石置き場（造幣所行き）</h4><dl class="kv"><dt>置いてある鉱石</dt><dd>${lots.length ? `${oreTxt(tot)}<br><span class="sub">持ち主：${who}</span>` : 'いまは空'}</dd>
      <dt>荷車</dt><dd>${run ? `${run.state === 'go' ? '王立造幣所へ向かっている' : '空の荷車で帰ってくるところ'}${run.riders[0] != null ? `（引き手：${pLink(S.people[run.riders[0]])}）` : ''}` : `鉱石が${CART_MIN}個たまるか、${CART_DAYS}日たった朝に出す${P?.lastCart != null ? `<br><span class="sub">前に出したのは${sim.today - P.lastCart}日前</span>` : ''}`}</dd>
      <dt>お金</dt><dd><span class="sub">置き場の鉱石はまだ鉱夫のもの。造幣所に着いて買い上げられたとき、造幣所が新しい硬貨で代金を払う（運び賃は代金から）</span></dd></dl></div>`;
  }
  const k = S.kingdoms.find((x) => S.bank?.k?.[x.id]?.mint === b.id);
  if (!k) return '';
  const K = M.k[k.id], bk = S.bank.k[k.id];
  if (!K) return '';
  const T0 = K.today, Y = K.yest, YR = K.year;
  const cn = coinName(sim, k.id);
  const ag = (x) => `${r10(x)}`;
  const runs = M.runs.filter((r) => r.k === k.id);
  const carts = runs.filter((r) => r.type === 'ore').map((r) => `${esc(sim.building(r.mine)?.name || '鉱山')}の荷車（${r.state === 'go' ? `${oreTxt(r.load)}を積んで向かっている` : '帰り道'}）${r.riders[0] != null ? `・引き手 ${pLink(S.people[r.riders[0]])}` : ''}`);
  const chest = runs.find((r) => r.type === 'chest');
  const hands = K.hands.map((id) => S.people[id]).filter(Boolean);
  const payRows = (d) => (d?.paid || []).slice(-8).reverse().map((x) => `<li><span>${x.crown ? '国庫' : x.pid != null && S.people[x.pid] ? pLink(S.people[x.pid], `${S.people[x.pid].given}（${JOBS[S.people[x.pid].job]?.name || '元' + (JOBS[S.people[x.pid].formerJob]?.name || '')}）`) : '亡き人の家族'}</span><span class="dead">${x.amt}${esc(cn)}・${esc(x.why)}</span></li>`).join('');
  const owed = Object.values(K.owe).reduce((a, v) => a + v, 0);
  const qTxt = bk.q < 0.999 ? `<b class="up">銀${r1(bk.q * 100)}%（悪鋳）</b><br><span class="sub">同じ銀から${(1 / bk.q).toFixed(2)}倍の硬貨を打っている。ふえた分は造幣益として国庫へ</span>` : `銀${r1(bk.q * 100)}%（良貨）`;
  return `<div class="section"><h4>造幣の流れ（${esc(k.name)}の${esc(cn)}）</h4><dl class="kv">
    <dt>今日の入荷</dt><dd>${oreTxt(T0.oreIn)}（銀${ag(T0.agIn)}・金${ag(T0.auIn)}銅貨ぶん）${Y ? `<br><span class="sub">昨日：${oreTxt(Y.oreIn)}</span>` : ''}</dd>
    <dt>今年の入荷</dt><dd>${oreTxt(YR.oreIn)}（銀${ag(YR.ag)}・金${ag(YR.au)}銅貨ぶん）</dd>
    <dt>鉱石の山</dt><dd>${oreTxt(K.yard)}（炉に入れる前）</dd>
    <dt>炉の中</dt><dd>溶けた銀 ${ag(K.melt.ag)}${K.melt.au ? `・金 ${ag(K.melt.au)}` : ''}銅貨ぶん</dd>
    <dt>地金の在庫</dt><dd>銀の延べ板 ${K.bars.n}枚（${ag(K.bars.ag)}銅貨ぶん）${K.bars.ng ? `・金の延べ板 ${K.bars.ng}枚（${ag(K.bars.au)}）` : ''}</dd>
    <dt>打った枚数</dt><dd>今日 ${T0.struck}枚・昨日 ${Y?.struck ?? 0}枚・今年 ${YR.struck}枚<br><span class="sub">今日の工程：溶かした鉱石 ${T0.smelted}個・流した延べ板 ${T0.bars}枚</span></dd>
    <dt>硬貨の箱</dt><dd>${r1(K.box)}枚（まだ世に出ていない硬貨）<br><span class="sub">うち国庫の取り分 ${r1(K.crownDue)}枚${chest ? '・いま警護つきで王城へ運んでいる' : `・${CHEST_MIN}枚たまった午後に王城へ運ぶ`}</span>${owed > 0.5 ? `<br><span class="sub">鉱夫への預かり証 ${r1(owed)}（打ち上がりしだい払う）</span>` : ''}</dd>
    <dt>硬貨の質</dt><dd>${qTxt}・すり減り${r1((1 - bk.wear) * 100)}%</dd>
    <dt>職人</dt><dd>${hands.length ? hands.map((q) => `${pLink(q)}（${esc(JOBS[q.job]?.name || '')}${q.action?.type === 'mintwork' && q.inside === b.id ? `・${esc(STEP_NAME[q.mintStep] || '作業中')}` : ''}）`).join('、') : 'いない（夜番が打つ）'}</dd>
    ${carts.length ? `<dt>道中の荷車</dt><dd>${carts.join('<br>')}</dd>` : ''}
    <dt>今日の払い</dt><dd>鉱夫へ ${r10(T0.toMiners)}・運び手へ ${r10(T0.toHaulers)}・職人へ ${r10(T0.toHands)}・国庫へ ${r10(T0.toCrown)}<br><span class="sub">今年：鉱夫へ ${r1(YR.toMiners)}・職人へ ${r1(YR.toHands)}・国庫へ ${r1(YR.toCrown)}（すべて新しく打った硬貨＝発行）</span></dd>
    </dl>${(T0.paid.length || Y?.paid?.length) ? `<h4 style="margin-top:6px">誰に払ったか</h4><ul class="rels">${payRows(T0)}${T0.paid.length < 4 ? payRows(Y) : ''}</ul>` : ''}
    ${K.log.length ? `<h4 style="margin-top:6px">造幣所の記録</h4><ul class="rels">${K.log.slice(-5).reverse().map((x) => `<li><span>${esc(x.txt)}</span><span class="dead">${sim.today - x.d ? `${sim.today - x.d}日前` : `今日${x.h}時`}</span></li>`).join('')}</ul>` : ''}</div>`;
}
// 人の詳細欄：造幣所への荷・運んだ記録・造幣の仕事
export function mintPersonHTML(sim, p, esc = (s) => String(s)) {
  const S = sim.S, M = S.mintflow;
  if (!M || p.deathYear != null) return '';
  const rows = [];
  if (carried(p) > 0) rows.push(['造幣所行きの鉱石', `${oreTxt(p.mfOre)}を持っている（坑口の置き場へ置きに行く）`]);
  if (p.job === 'miner' && p.mfDig?.d === sim.today) rows.push(['今日掘った銀', `${r10(p.mfDig.got)}銅貨ぶん（割り当て ${r10(p.mfDig.quota)}）`]);
  const run = p.action?.mfRun != null ? M.runs.find((r) => r.id === p.action.mfRun) : null;
  if (run) rows.push(['いま運んでいる物', run.type === 'ore' ? (run.state === 'go' ? `${oreTxt(run.load)}を荷車で${esc(sim.building(run.mint)?.name || '造幣所')}へ` : '空の荷車で鉱山へ帰るところ') : `打った硬貨${r1(run.amt)}枚の箱を王城の国庫へ`]);
  if (p.mintHand != null) rows.push(['造幣所の仕事', `${esc(S.kingdoms[p.mintHand]?.name || '')}の王立造幣所で硬貨を打つ（兼業）${p.action?.type === 'mintwork' && p.mintStep ? `<br><span class="sub">いま：${esc(STEP_NAME[p.mintStep] || '')}</span>` : ''}${S.mintflow.k[p.mintHand]?.wage?.[p.id] ? `<br><span class="sub">次の給料日に受け取る手間賃 ${r10(S.mintflow.k[p.mintHand].wage[p.id])}銅貨</span>` : ''}`]);
  if (p.mfLog?.length) rows.push(['運んだ・売った記録', p.mfLog.slice(-4).reverse().map((x) => `${esc(x.txt)}<span class="sub">（${sim.today - x.d ? `${sim.today - x.d}日前` : '今日'}）</span>`).join('<br>')]);
  if (!rows.length) return '';
  return `<div class="section"><h4>鉱石と造幣所</h4><dl class="kv">${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></div>`;
}
// 試験・帳簿向け：まだ世に出ていない硬貨（造幣所の箱と運んでいる箱）
export function mintUnissued(sim) {
  const M = sim.S.mintflow; if (!M) return 0;
  let s = 0; for (const K of Object.values(M.k)) s += num(K.box);
  for (const r of M.runs) if (r.type === 'chest') s += num(r.amt);
  return s;
}
void H;
