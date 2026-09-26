// 通貨と銀行：造幣所・硬貨の質（悪鋳と摩耗）・物価の水準・両替商の館（預金・貸付・為替手形・取り付け騒ぎ）・退蔵（壺に埋めた銅貨）
//
// お金の出どころと行き先（社長の決まり「お金には必ず出どころと行き先がある」）
//   ・発行（issue）……造幣所が鉱山の銀と金を買い上げて打ち出した新しい硬貨。鉱夫の家計（地金の代金）・国庫（造幣益）・王都の蓄え（造幣職人の手間賃）へ。
//                      悪鋳のときの改鋳益（国庫へ）も発行。
//   ・回収（recall）……良貨に戻す改鋳で鋳つぶした硬貨。国庫から出て地金に戻る（お金が減る）。
//   ・埋蔵（bury）……けちな人が家計の硬貨を壺に入れて埋める。家計→埋蔵（S.bank.hoards）。
//   ・掘り出し（unbury）……埋めた本人か、場所を知る家族が掘り出す。埋蔵→家計。
//   ・掘り当て（unearth）……持ち主の分からない壺（昔の人・死んだけち）を、畑仕事や開拓で見つける。埋蔵→見つけた人の家計（正直者は半分を国庫へ届ける）。
//   ・銀行の出し入れ（預金・引き出し・貸付・返済・手形・手数料）は、家計・国庫・金庫（S.bank.k[国].vault）のあいだを動くだけ。
//     預金は「金庫への貸し」という証文（acct）であってお金そのものではない。破綻で消えるのは証文で、硬貨は消えない。
// 状態は S.bank（古いセーブで欠けていても ensureBank で作る）。
import { DAYS_PER_YEAR, JOBS } from './data.js';
import { T, W, H, tryPlace } from './world.js';
import { headOf } from './property.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x);
const MONEY_JOBS = new Set(['merchant', 'noble', 'royal', 'king', 'changer', 'jeweler']);
const MINE_AG = 2.4;      // 鉱夫1人・1日あたりに取れる銀（銅貨にしていくら分）
const MINTAGE = 0.03;     // 造幣職人の手間賃（地金の値打ちに対して）
const BILL_FEE = 0.02;    // 為替手形の手数料

// ---------- 状態 ----------
export function ensureBank(sim) {
  const S = sim.S;
  if (!S.bank) S.bank = { v: 1, seq: 1, k: {}, veins: {}, hoards: [], bills: [], init: false, distrust: {},
    led: { issue: 0, mint: 0, debase: 0, recall: 0, bury: 0, unbury: 0, unearth: 0, ancient: 0, fee: 0 },
    stats: { deposits: 0, withdraws: 0, loans: 0, repaid: 0, defaults: 0, runs: 0, fails: 0, bills: 0, cashed: 0, buried: 0, found: 0, debased: 0, restored: 0, recoin: 0, kingLoans: 0 } };
  const B = S.bank;
  for (const k of S.kingdoms) {
    if (!B.k[k.id]) B.k[k.id] = { mint: null, bank: null, q: 1, wear: 1, credit: 70, bullion: { ag: 0, au: 0 }, issued: 0, issuedYear: 0, issuedToday: 0, recalled: 0,
      L: 1, m0: null, g0: null, hist: [], years: [], vault: 0, acct: {}, loans: [], state: 'open', failDay: null, lost: {}, profit: 0, owes: {}, lastDebase: -99, lastRestore: -99, lastRun: -99, banker: null };
    if (B.distrust[k.id] == null) B.distrust[k.id] = 0;
  }
  return B;
}

// ---------- 小道具 ----------
const alive = (sim, id) => { const q = sim.S.people[id]; return q && q.deathYear == null ? q : null; };
const kOfSid = (sim, sid) => sim.town(sid)?.kingdom;
const capital = (sim, k) => sim.town(k.capital);
const hhOfHead = (sim, p) => sim.hh(p);
function remember(sim, p, txt, emo, imp, k = 'money', about) { if (p && p.deathYear == null) sim.remember(p, txt, { emo, imp, k, about }); }
function kingdomTowns(sim, kid) { return sim.S.world.settlements.filter((s) => s.kingdom === kid); }

// 国ごとの硬貨の量（流通しているお金）：家計・財布・町の蓄え・施し箱・国庫。金庫と埋蔵は別に数える
export function moneyByKingdom(sim) {
  const S = sim.S, out = {};
  const slot = (kid) => (out[kid] = out[kid] || { hh: 0, purse: 0, fund: 0, alms: 0, treasury: 0, vault: 0, hoard: 0, pop: 0 });
  for (const hh of Object.values(S.households)) { const kid = kOfSid(sim, hh.s); if (kid == null) continue; slot(kid).hh += hh.money || 0; }
  for (const p of sim.living()) { const kid = kOfSid(sim, p.s); if (kid == null) continue; const o = slot(kid); o.purse += p.purse || 0; o.pop++; }
  for (const s of S.world.settlements) { const t = S.towns[s.id]; if (!t || s.kingdom == null) continue; const o = slot(s.kingdom); o.fund += t.fund || 0; o.alms += t.alms || 0; }
  for (const k of S.kingdoms) { const o = slot(k.id); o.treasury += k.treasury || 0; o.vault += S.bank?.k[k.id]?.vault || 0; }
  for (const h of S.bank?.hoards || []) if (!h.gone) { const kid = h.k ?? kOfSid(sim, h.s); if (kid != null) slot(kid).hoard += h.amt; }
  for (const o of Object.values(out)) o.circ = o.hh + o.purse + o.fund + o.alms + o.treasury;
  return out;
}
// 経済部（資源とお金の流れ）の監査に足すための、この仕組みが持つお金の置き場所
export function bankMoneyPools(sim) {
  const B = sim.S.bank; if (!B) return { vaults: 0, hoards: 0, hoardsLost: 0 };
  let vaults = 0; for (const b of Object.values(B.k)) vaults += b.vault;
  let hoards = 0, hoardsLost = 0; for (const h of B.hoards) if (!h.gone) { hoards += h.amt; if (h.lost) hoardsLost += h.amt; }
  return { vaults, hoards, hoardsLost };
}
export function bankLedger(sim) { return sim.S.bank?.led || null; }

// 物価の水準（updatePrices に掛ける）
export function priceLevel(sim, sid) {
  const kid = kOfSid(sim, sid);
  const b = kid != null ? sim.S.bank?.k[kid] : null;
  return b ? b.L : 1;
}
// 硬貨の値打ち（質×摩耗）と両替の相場（A国の銅貨1枚が B国の銅貨何枚ぶんか）
export const coinWorth = (sim, kid) => { const b = sim.S.bank?.k[kid]; return b ? b.q * b.wear : 1; };
export const exchangeRate = (sim, a, b) => coinWorth(sim, a) / Math.max(0.05, coinWorth(sim, b));
export function depositOf(sim, p) { let s = 0; for (const b of Object.values(sim.S.bank?.k || {})) s += b.acct[p.id] || 0; return s; }
// 世帯の預金（家長の口座の合計）
export function hhDeposit(sim, hh) { const h = hh && headOf(sim, hh); return h ? depositOf(sim, h) : 0; }

// ---------- 建物 ----------
function placeIn(sim, s, type, name, bw, bd) {
  const w = sim.S.world;
  const streets = [];
  for (let z = s.z - s.r; z <= s.z + s.r; z++) for (let x = s.x - s.r; x <= s.x + s.r; x++) {
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    const t = w.tiles[z * W + x]; if (t === T.ROAD || t === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + sim.rng.next() * 3 });
  }
  streets.sort((a, b) => a.d - b.d);
  let b = null;
  for (const [x, y] of [[bw, bd], [3, 2], [2, 2]]) { b = tryPlace(w, s, streets, type, name, x, y, { land: [T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH, T.FOREST, T.DENSE, T.JUNGLE] }, sim.rng); if (b) break; }
  if (b) { s.buildings.push(b.id); sim.events.push({ type: 'building', id: b.id }); return b; }
  // 城壁の中に空き地がなければ、持ち主のいない空き家を町が買い上げて使う（お金は動かない：持ち主がいないため）
  const empty = s.buildings.map((id) => sim.building(id)).filter((x) => x && x.type === 'house' && x.hh == null && x.owner == null).sort((a, c) => c.w * c.d - a.w * a.d)[0];
  if (empty) { empty.type = type; empty.name = name; empty.value = 0; empty.rent = 0; sim.events.push({ type: 'building', id: empty.id }); return empty; }
  return null;
}
function setupBuildings(sim) {
  const S = sim.S, B = S.bank;
  for (const k of S.kingdoms) {
    const b = B.k[k.id], cap = capital(sim, k);
    if (!cap) continue;
    if (b.mint == null) {
      const ex = cap.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'mint');
      const m = ex || placeIn(sim, cap, 'mint', '王立造幣所', 3, 3);
      // 置けなければ城の中の造幣所（ロンドン塔の造幣所のように）
      b.mint = m ? m.id : cap.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'castle')?.id ?? -1;
    }
    if (b.bank == null) {
      const ex = cap.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'bank');
      const m = ex || placeIn(sim, cap, 'bank', '両替商の館', 3, 3);
      b.bank = m ? m.id : cap.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'market')?.id ?? -1;
    }
  }
  // 鉱山ごとの銀と金の鉱脈（有限）
  for (const s of S.world.settlements) if (s.mine != null && !B.veins[s.mine]) B.veins[s.mine] = { ag: sim.rng.int(3000, 7000), au: sim.rng.int(250, 700), s: s.id };
}

// 鉱脈から取る（経済部の resources.js が鉱脈を持っていればそちらを優先して使う）
function takeFromVein(sim, mineId, metal, want) {
  const R = sim.S.resources?.veins?.[mineId];
  if (R && typeof R[metal] === 'number') { const g = Math.min(want, Math.max(0, R[metal])); R[metal] -= g; return g; }
  const v = sim.S.bank.veins[mineId]; if (!v) return 0;
  const g = Math.min(want, Math.max(0, v[metal])); v[metal] -= g; return g;
}

// 昔の人が埋めて、そのまま忘れられた壺（歴史の名残り）。最初から「埋蔵」に入っている
function ancientHoards(sim) {
  const S = sim.S, R = sim.rng, B = S.bank;
  for (const s of S.world.settlements) {
    if (s.kingdom == null) continue;
    const n = s.type === 'capital' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (!R.chance(0.7)) continue;
      const amt = R.int(40, 180);
      const x = clamp(Math.round(s.x + R.range(-s.r - 5, s.r + 5)), 0, W - 1), z = clamp(Math.round(s.z + R.range(-s.r - 5, s.r + 5)), 0, H - 1);
      B.hoards.push({ id: B.seq++, x, z, s: s.id, k: s.kingdom, amt, owner: null, knows: [], day: -R.int(2000, 9000), lost: true, old: true, yearsAgo: R.int(40, 250) });
      B.led.ancient += amt;
    }
  }
}

// ---------- 造幣 ----------
function mintDaily(sim, k, b) {
  const S = sim.S, R = sim.rng, B = S.bank;
  const cap = capital(sim, k); if (!cap || S.towns[cap.id]?.occupied) return;
  const king = alive(sim, k.kingId);
  const mines = kingdomTowns(sim, k.id).filter((s) => s.mine != null && !S.towns[s.id]?.occupied);
  let ag = 0, au = 0;
  const paid = [];
  for (const s of mines) {
    const miners = sim.living().filter((p) => p.job === 'miner' && p.s === s.id && p.jail == null && sim.ageOf(p) >= 14);
    for (const p of miners) {
      const skill = p.skill?.miner ?? 0.3;
      let g = takeFromVein(sim, s.mine, 'ag', MINE_AG * (0.6 + skill) * R.range(0.5, 1.3));
      let gold = R.chance(0.04) ? takeFromVein(sim, s.mine, 'au', R.int(10, 30)) : 0;
      if (g + gold <= 0) continue;
      ag += g; au += gold;
      paid.push({ p, v: g + gold, gold });
    }
  }
  if (!paid.length) { b.issuedToday = 0; return; }
  // 造幣益：強欲な王ほど高く取る（5〜10%）
  const greed = k.taxes?.greed ?? 0.5;
  const seign = 0.05 + greed * 0.05;
  const value = ag + au;                 // 地金の値打ち（良貨で数えた銅貨）
  const face = value / Math.max(0.3, b.q); // 質を落としていれば、同じ地金から多くの硬貨ができる
  let toMiners = 0;
  for (const { p, v, gold } of paid) {
    const pay = v * (1 - seign - MINTAGE);
    const hh = sim.hh(p); if (hh) hh.money += pay; else p.purse = (p.purse || 0) + pay;
    toMiners += pay;
    if (gold > 0) { remember(sim, p, `坑道の奥で金の粒を見つけ、王立造幣所に${r1(gold * (1 - seign - MINTAGE))}銅貨で買い上げてもらった`, 0.7, 0.6); }
  }
  const toFund = value * MINTAGE;
  const toCrown = face - toMiners - toFund;   // 造幣益（悪鋳していれば、その差益もここに入る）
  S.towns[cap.id].fund += toFund;
  k.treasury += toCrown;
  if (k.fisc) { k.fisc.dayIn = (k.fisc.dayIn || 0) + toCrown; if (k.fisc.cur) k.fisc.cur.mint = (k.fisc.cur.mint || 0) + toCrown; }
  b.bullion.ag += ag; b.bullion.au += au;
  b.issued += face; b.issuedYear += face; b.issuedToday = face;
  B.led.issue += face; B.led.mint += face;
}

// ---------- 悪鋳・良貨への改鋳・摩耗 ----------
function coinPolicy(sim, k, b, M) {
  const S = sim.S, R = sim.rng, B = S.bank;
  const king = alive(sim, k.kingId); if (!king) return;
  const towns = kingdomTowns(sim, k.id);
  const people = sim.living().filter((p) => kOfSid(sim, p.s) === k.id && sim.isAdult(p));
  const title = king.sex === 'f' ? '女王' : '王';
  // 摩耗：硬貨はすり減り、削り取られる（年に約1.5%）
  b.wear = Math.max(0.8, b.wear - 0.015 / DAYS_PER_YEAR);
  if (sim.today % 5 !== k.id) return;   // 判断は5日に1度
  const circ = M.circ || 0;
  const low = 250 + (k.war ? 400 : 0);
  // 悪鋳：国庫が苦しく、良心の薄い王（性格しだい）
  if (k.treasury < low && b.q > 0.45 && sim.today - b.lastDebase >= 20) {
    const lean = (1 - king.pers.C) * 0.5 + (king.values?.ambition ?? 0.5) * 0.3 + (k.war ? 0.3 : 0) - king.pers.A * 0.25;
    if (R.chance(clamp(lean * 0.35, 0, 0.5))) {
      const oldQ = b.q; b.q = Math.max(0.4, r1(b.q * 0.85 * 100) / 100);
      // 改鋳益：出回っている硬貨の一部を呼び集め、銀を減らして打ち直す
      const gain = Math.min(700, circ * 0.15 * (1 - b.q / oldQ));
      k.treasury += gain; b.issued += gain; b.issuedYear += gain; b.issuedToday += gain;
      B.led.issue += gain; B.led.debase += gain;
      b.lastDebase = sim.today; b.credit = clamp(b.credit - 15, 0, 100); S.bank.stats.debased++;
      for (const s of towns) if (S.towns[s.id]) S.towns[s.id].unrest = clamp((S.towns[s.id].unrest || 0) + 5, 0, 100);
      sim.news(`${k.name}の造幣所が、銀を減らした新しい銅貨を打ち始めたらしい（質${r1(oldQ * 100)}→${r1(b.q * 100)}）`, 2, cap(sim, k));
      sim.chron(`${sim.fullName(king)}が国庫の不足を補うため、硬貨の銀を減らした（悪鋳）`, k.id);
      for (const p of R.shuffle(people).slice(0, 8)) {
        remember(sim, p, p.job === 'changer' || p.job === 'merchant' ? '新しい銅貨は軽くて音が鈍い。これでは物の値が上がる' : '銅貨の銀が減らされたと噂になっている。暮らしがまた苦しくなる', -0.5, 0.55);
        if (sim.relMut) sim.relMut(p, king).a -= 5;
      }
      if (sim.gossip) sim.gossip(king, '硬貨の銀を減らした', -0.5, R.shuffle(people).slice(0, 6), { silent: true });
      remember(sim, king, '国庫を救うため、硬貨の銀を減らすよう造幣所に命じた', -0.1, 0.8, 'crown');
      return;
    }
  }
  // 良貨に戻す：豊かで誠実な王。鋳つぶす分だけ国庫が負担する（お金の回収）
  if (b.q < 0.95 && k.treasury > 1800 && king.pers.C > 0.55 && sim.today - b.lastRestore >= 15) {
    const cost = Math.min(500, circ * 0.05, k.treasury - 1200);
    if (cost > 30) {
      k.treasury -= cost; b.recalled += cost; B.led.recall += cost;
      b.bullion.ag += cost * b.q;   // 鋳つぶした硬貨は地金に戻る
      b.q = Math.min(1, r1((b.q + 0.1) * 100) / 100); b.lastRestore = sim.today; b.credit = clamp(b.credit + 10, 0, 100);
      S.bank.stats.restored++;
      sim.news(`${k.name}が悪い銅貨を鋳つぶし、銀の多い良貨に戻し始めた（質${r1(b.q * 100)}）`, 2, cap(sim, k));
      sim.chron(`${sim.fullName(king)}が国庫を開いて悪貨を鋳つぶし、良貨に戻した`, k.id);
      for (const s of towns) if (S.towns[s.id]) S.towns[s.id].unrest = Math.max(0, (S.towns[s.id].unrest || 0) - 3);
      return;
    }
  }
  // すり減った硬貨の打ち直し
  if (b.wear < 0.94) {
    const greedy = (k.taxes?.greed ?? 0.5) > 0.6 && king.pers.A < 0.5;
    if (greedy) {
      // 定期改鋳（renovatio monetae）：古い銅貨を新しい銅貨に替えさせ、1割を手数料として取る（家計→国庫）
      let got = 0;
      for (const hh of Object.values(S.households)) {
        if (kOfSid(sim, hh.s) !== k.id || hh.royal || hh.bandits || (hh.money || 0) <= 20) continue;
        const f = (hh.money - 20) * 0.1; hh.money -= f; got += f;
      }
      k.treasury += got; if (k.fisc) k.fisc.dayIn = (k.fisc.dayIn || 0) + got;
      for (const s of towns) if (S.towns[s.id]) S.towns[s.id].unrest = clamp((S.towns[s.id].unrest || 0) + 4, 0, 100);
      sim.news(`${k.name}で古い銅貨の打ち直し。10枚につき1枚を手数料に取られ、民は不満顔（国庫へ${r1(got)}銅貨）`, 2, cap(sim, k));
    } else {
      // 国庫が造幣職人の手間賃を払って打ち直す（国庫→王都の蓄え）
      const cost = Math.min(k.treasury * 0.3, circ * 0.02);
      k.treasury -= cost; S.towns[k.capital].fund += cost;
      sim.news(`${k.name}の造幣所が、すり減った銅貨を新しく打ち直した`, 1, cap(sim, k));
    }
    b.wear = 1; b.credit = clamp(b.credit + 3, 0, 100); S.bank.stats.recoin++;
  }
}
const cap = (sim, k) => { const c = capital(sim, k); return c ? { x: c.x, z: c.z } : null; };

// ---------- 物価の水準 ----------
function goodsIndex(sim, kid, GOODS) {
  let s = 0, n = 0;
  for (const t of kingdomTowns(sim, kid)) { const m = sim.S.towns[t.id]; if (!m?.stock) continue; for (const [g, d] of Object.entries(GOODS)) { if (!d.target) continue; s += clamp(m.stock[g] / d.target, 0, 2); n++; } }
  return n ? s / n : 1;
}
function levelDaily(sim, k, b, M, GOODS) {
  const pop = Math.max(1, M.pop || 1);
  const m = (M.circ + (b.vault || 0) * 0.5) / pop;      // 1人あたりの硬貨（預けた分も半分は「使えるお金」として数える）
  const g = goodsIndex(sim, k.id, GOODS);
  if (b.m0 == null) { b.m0 = m; b.g0 = g; }
  const eff = b.q * b.wear;
  const target = clamp(Math.pow(m / Math.max(1, b.m0), 0.45) * Math.pow(b.g0 / Math.max(0.2, g), 0.2) * Math.pow(eff, -0.5) * (b.credit < 35 ? 1.03 : 1), 0.75, 1.4);
  b.L += (target - b.L) * 0.08;
  b.credit = clamp(b.credit + 0.15, 0, 100);
}

// ---------- 銀行 ----------
function bankerOf(sim, k) {
  const cap = capital(sim, k);
  return sim.living().filter((p) => p.job === 'changer' && p.s === cap?.id && p.jail == null).sort((a, b) => b.pers.C - a.pers.C)[0] || null;
}
const deposits = (b) => Object.values(b.acct).reduce((s, x) => s + x, 0);
const loansOut = (b) => b.loans.reduce((s, l) => s + l.owed, 0);
function customer(sim, k, hh, head) {
  if (!hh || !head || hh.bandits || hh.street) return false;
  if (kOfSid(sim, hh.s) !== k.id || sim.S.towns[hh.s]?.occupied) return false;
  return hh.s === k.capital || MONEY_JOBS.has(head.job);
}
const isMiser = (p) => p.pers.A < 0.35 && p.pers.C > 0.5;

function bankDailyOne(sim, k, b) {
  const S = sim.S, R = sim.rng, B = S.bank;
  const banker = bankerOf(sim, k);
  b.banker = banker?.id ?? null;
  if (b.state === 'failed') { failedDaily(sim, k, b); return; }
  const dist = B.distrust[k.id] || 0;
  // 亡くなった人の口座は相続人へ（いなければ銀行のものになる＝証文が消えるだけ）
  for (const [pid, amt] of Object.entries(b.acct)) {
    const p = S.people[pid];
    if (p && p.deathYear == null) continue;
    delete b.acct[pid];
    const heir = p && (alive(sim, p.estate?.to) || alive(sim, p.spouseId) || (p.children || []).map((id) => alive(sim, id)).find((c) => c && sim.ageOf(c) >= 16));
    if (heir) { b.acct[heir.id] = (b.acct[heir.id] || 0) + amt; remember(sim, heir, `亡き${sim.kinTerm?.(heir, p) || p.given}が両替商の館に預けていた${r1(amt)}銅貨を受け継いだ`, 0.3, 0.55); }
  }
  // 預ける・引き出す
  for (const hh of Object.values(S.households)) {
    const head = headOf(sim, hh);
    if (!customer(sim, k, hh, head)) continue;
    const acct = b.acct[head.id] || 0;
    const keep = 220 + hh.members.length * 10;
    if (hh.money < 45 && acct > 0) {
      const want = Math.min(acct, 100 - hh.money);
      const got = Math.min(want, b.vault);
      if (got > 0) { b.vault -= got; hh.money += got; b.acct[head.id] = acct - got; if (b.acct[head.id] < 0.5) delete b.acct[head.id]; B.stats.withdraws++; }
      if (got < want * 0.99) b.short = (b.short || 0) + 1;   // 払い戻しが滞った（噂の種）
      continue;
    }
    if (hh.money > keep + 60) {
      const robbed = (head.memories || []).some((m) => m.k === 'theft' && sim.today - m.t < 20);
      const ch = 0.04 + head.pers.C * 0.12 + (robbed ? 0.35 : 0) + (MONEY_JOBS.has(head.job) ? 0.1 : 0) - dist * 0.8 - (isMiser(head) ? 0.3 : 0);
      if (!R.chance(clamp(ch, 0, 0.8))) continue;
      const a = (hh.money - keep) * 0.5;
      hh.money -= a; b.vault += a; b.acct[head.id] = acct + a; B.stats.deposits++;
      if (!acct) remember(sim, head, `${robbed ? '泥棒が怖くなり、' : ''}家の銅貨${r1(a)}枚を王都の両替商の館に預けた。証文があれば盗まれない`, 0.3, 0.5, 'money', banker ? [banker.id] : undefined);
    }
  }
  // 返済と延滞
  for (const l of b.loans.slice()) {
    if (sim.today < l.due) continue;
    if (l.king) { kingLoanDue(sim, k, b, l); continue; }
    const p = alive(sim, l.to), hh = p && sim.hh(p);
    if (hh && hh.money >= l.owed + 10) {
      hh.money -= l.owed; b.vault += l.owed; b.profit += l.owed - l.amt; b.loans.splice(b.loans.indexOf(l), 1); B.stats.repaid++;
      remember(sim, p, `両替商の館からの借り入れ${r1(l.owed)}銅貨を返し終えた`, 0.4, 0.4);
      continue;
    }
    l.late++; l.due = sim.today + 5;
    if (hh && hh.money > 25) { const part = Math.min(l.owed, hh.money - 25); hh.money -= part; b.vault += part; l.owed -= part; if (l.owed < 0.5) { b.loans.splice(b.loans.indexOf(l), 1); continue; } }
    if (!p || l.late >= 4) {
      b.loans.splice(b.loans.indexOf(l), 1); B.stats.defaults++;
      b.loss = (b.loss || 0) + l.owed;
      if (p) { remember(sim, p, `両替商の館への借金${r1(l.owed)}銅貨を返せず、踏み倒すことになった`, -0.7, 0.75); p.badDebt = true; }
      if (banker && p) remember(sim, banker, `${p.given}に貸した${r1(l.owed)}銅貨が焦げついた`, -0.6, 0.6, 'loan', [p.id]);
    }
  }
  // 貸付：商人・貴族の元手（利子は「為替の差益」の形で取る。教会の利子の禁止をかわす昔の工夫）
  const dep = deposits(b);
  const reserve = 0.2 + (banker ? banker.pers.C * 0.3 : 0.2) - (banker && banker.values?.ambition > 0.7 ? 0.1 : 0);
  let room = b.vault - dep * reserve;
  if (room > 60) for (const hh of R.shuffle(Object.values(S.households).filter((h) => h.money < 110))) {
    const head = headOf(sim, hh);
    if (!customer(sim, k, hh, head) || !(['merchant', 'noble', 'jeweler'].includes(head.job) || JOBS[head.job]?.goods || JOBS[head.job]?.svc) || head.badDebt) continue;
    if (b.loans.some((l) => l.to === head.id) || !R.chance(0.02 + (head.values?.ambition ?? 0.5) * 0.04 + (head.job === 'merchant' ? 0.05 : 0))) continue;
    const amt = Math.min(room, R.int(80, 200));
    if (amt < 40) break;
    b.vault -= amt; hh.money += amt; room -= amt;
    b.loans.push({ id: B.seq++, to: head.id, amt, owed: r1(amt * 1.06), day: sim.today, due: sim.today + 10, late: 0 });
    B.stats.loans++;
    remember(sim, head, `両替商の館から商売の元手${r1(amt)}銅貨を借りた。十日後に為替の差益をつけて返す約束だ`, -0.1, 0.5, 'money', banker ? [banker.id] : undefined);
    if (sim.pushLog) sim.pushLog(`${sim.fullName(head)}が両替商の館から${r1(amt)}銅貨を借りた。`, 'event', [head.id], head.pos);
  }
  // 王への貸付：国庫が底をつくと、王は両替商から借りる（エドワード3世とバルディ家のように）
  if (k.treasury < 200 && !b.loans.some((l) => l.king) && b.vault > 300) {
    const amt = Math.min(600, b.vault * 0.5);
    const yes = !banker || banker.values?.ambition > 0.4 || R.chance(0.5);   // 王の頼みは断りにくい
    if (yes) {
      b.vault -= amt; k.treasury += amt; if (k.fisc) k.fisc.dayIn = (k.fisc.dayIn || 0) + amt;
      b.loans.push({ id: B.seq++, king: true, to: k.kingId, amt, owed: r1(amt * 1.05), day: sim.today, due: sim.today + 10, late: 0 });
      B.stats.kingLoans++;
      if (banker) remember(sim, banker, `${k.name}の国庫に${r1(amt)}銅貨を用立てた。王の借金は断れない`, -0.1, 0.7, 'loan');
      sim.news(`${k.name}の国庫が乏しく、王が両替商の館から${r1(amt)}銅貨を借りたらしい`, 1, cap(sim, k));
    }
  }
  // 預金者への「お礼」（利子ではなく、両替商の気持ちとして。メディチ銀行の discrezione）と、両替商の取り分
  if (sim.today % 7 === k.id && b.profit > 5) {
    const pool = b.profit * 0.4, dsum = deposits(b);
    if (dsum > 0) for (const pid of Object.keys(b.acct)) b.acct[pid] += pool * b.acct[pid] / dsum;
    const cut = Math.min(b.vault * 0.1, b.profit * 0.3);
    if (banker && cut > 0) { const bh = sim.hh(banker); if (bh) { b.vault -= cut; bh.money += cut; B.led.fee += cut; } }
    b.profit = 0;
  }
  runCheck(sim, k, b, banker);
}

function kingLoanDue(sim, k, b, l) {
  const S = sim.S, R = sim.rng;
  const king = alive(sim, k.kingId);
  if (k.treasury > l.owed + 600) {
    k.treasury -= l.owed; b.vault += l.owed; b.profit += l.owed - l.amt; b.loans.splice(b.loans.indexOf(l), 1); S.bank.stats.repaid++;
    return;
  }
  l.late++; l.due = sim.today + 7;
  // 返す気のない王（冷たく、戦をしている）は踏み倒す
  const bad = king ? (1 - king.pers.A) * 0.5 + (k.war ? 0.3 : 0) - king.pers.C * 0.3 : 0.3;
  if (l.late >= 3 && R.chance(clamp(bad, 0.02, 0.6))) {
    b.loans.splice(b.loans.indexOf(l), 1); S.bank.stats.defaults++;
    b.loss = (b.loss || 0) + l.owed; b.credit = clamp(b.credit - 20, 0, 100);
    sim.news(`${k.name}の王が両替商の館への借金${r1(l.owed)}銅貨を踏み倒した！館の金庫が危ないと噂が走る`, 3, cap(sim, k));
    sim.chron(`${king ? sim.fullName(king) : '王'}が両替商への借金を踏み倒した`, k.id);
    b.rumor = 3;   // 取り付け騒ぎの火種
  }
}

// 取り付け騒ぎ：損が出た・払い戻しが滞ったという噂で、預金者が一斉に引き出しに来る
function runCheck(sim, k, b, banker) {
  const S = sim.S, R = sim.rng, B = S.bank;
  const dep = deposits(b);
  if (dep < 50) { b.short = 0; return; }
  const liq = b.vault / dep;
  let heat = (b.rumor || 0) + (b.short || 0) * 0.5 + (b.loss > dep * 0.2 ? 1 : 0) + (liq < 0.15 ? 0.5 : 0);
  b.rumor = Math.max(0, (b.rumor || 0) - 1); b.short = 0; b.loss = Math.max(0, (b.loss || 0) * 0.9);
  if (heat < 1 || sim.today - b.lastRun < 30 || !R.chance(clamp(heat * 0.25, 0, 0.8))) return;
  b.lastRun = sim.today; B.stats.runs++;
  // 列に並んだ順に払う
  const order = R.shuffle(Object.keys(b.acct));
  let unpaid = 0; const lost = [];
  for (const pid of order) {
    const p = alive(sim, +pid); const want = b.acct[pid];
    if (!p || !R.chance(0.85)) continue;
    const got = Math.min(want, b.vault);
    const hh = sim.hh(p);
    if (got > 0) { b.vault -= got; if (hh) hh.money += got; else p.purse = (p.purse || 0) + got; }
    b.acct[pid] = want - got;
    if (b.acct[pid] < 0.5) delete b.acct[pid];
    if (want - got > 0.5) { unpaid += want - got; lost.push({ p, amt: want - got }); }
  }
  const capPos = cap(sim, k);
  if (unpaid <= 0) {
    B.distrust[k.id] = clamp((B.distrust[k.id] || 0) + 0.3, 0, 1);
    sim.news(`${k.name}の両替商の館に、預金を引き出そうとする人が押し寄せた。館はなんとか全額を払い戻した`, 2, capPos);
    return;
  }
  // 破綻：払えなかった証文は「破産の配当」を待つだけになる
  b.state = 'failed'; b.failDay = sim.today; B.stats.fails++;
  B.distrust[k.id] = 1;
  for (const { p, amt } of lost) {
    b.lost[p.id] = (b.lost[p.id] || 0) + amt; delete b.acct[p.id];
    remember(sim, p, `両替商の館が潰れ、預けていた${r1(amt)}銅貨が戻らなくなった。もう銀行は信じない`, -0.9, 0.9, 'money', banker ? [banker.id] : undefined);
    if (banker && sim.relMut) sim.relMut(p, banker).a -= 40;
    p.bankScar = sim.today;
  }
  if (banker) { remember(sim, banker, `館の金庫が空になり、預かったお金を返せなくなった。${k.name}じゅうの恨みを買った`, -1, 1, 'money'); banker.fame = (banker.fame || 0) - 10; }
  sim.news(`${k.name}の両替商の館が取り付け騒ぎで潰れた！${lost.length}人の預金${r1(unpaid)}銅貨が戻らない`, 4, capPos);
  sim.chron(`${k.name}の両替商の館が取り付け騒ぎで破綻し、預金者${lost.length}人が財産を失った`, k.id);
  for (const s of kingdomTowns(sim, k.id)) if (S.towns[s.id]) S.towns[s.id].unrest = clamp((S.towns[s.id].unrest || 0) + 4, 0, 100);
}
// 潰れた館：残った貸付を取り立て、入った分を失った人に配る（破産の配当）。20日で店を開き直す
function failedDaily(sim, k, b) {
  const S = sim.S;
  for (const l of b.loans.slice()) {
    if (l.king) continue;
    const p = alive(sim, l.to), hh = p && sim.hh(p);
    if (hh && hh.money > 60) { const part = Math.min(l.owed, hh.money - 60); hh.money -= part; b.vault += part; l.owed -= part; if (l.owed < 0.5) b.loans.splice(b.loans.indexOf(l), 1); }
  }
  const lostSum = Object.values(b.lost).reduce((s, x) => s + x, 0);
  if (b.vault > 1 && lostSum > 0) {
    const pay = Math.min(b.vault, lostSum);
    for (const [pid, amt] of Object.entries(b.lost)) {
      const share = pay * amt / lostSum; const p = alive(sim, +pid); const hh = p && sim.hh(p);
      if (!hh) continue;
      hh.money += share; b.vault -= share; b.lost[pid] -= share;
      if (share >= 5) remember(sim, p, `潰れた両替商の館から、破産の配当として${r1(share)}銅貨だけ戻ってきた`, 0.1, 0.4);
    }
  }
  if (sim.today - b.failDay >= 20) {
    b.state = 'open'; b.lost = {}; b.credit = clamp(b.credit + 5, 0, 100);
    sim.news(`${k.name}の両替商の館が、新しい帳簿で店を開き直した`, 1, cap(sim, k));
  }
}

// ---------- 為替手形（隊商・旅の支払い） ----------
// 出発地の館に現金を預けて手形をもらい、行き先の館で受け取る。道中は紙きれ一枚なので盗賊に奪われない
export function bankOpen(sim, kid) { const b = sim.S.bank?.k[kid]; return !!(b && b.state === 'open'); }
export function drawBill(sim, p, amt, toSid) {
  ensureBank(sim);
  const B = sim.S.bank, fromK = kOfSid(sim, p.s), toK = kOfSid(sim, toSid);
  if (fromK == null || toK == null || !bankOpen(sim, fromK) || !bankOpen(sim, toK)) return null;
  if ((B.distrust[fromK] || 0) > 0.6) return null;
  const hh = sim.hh(p); if (!hh) return null;
  const fee = amt * BILL_FEE;
  if (hh.money < amt + fee) return null;
  const bf = B.k[fromK];
  hh.money -= amt + fee; bf.vault += amt + fee; bf.profit += fee;
  const bill = { id: B.seq++, owner: p.id, amt, fromK, toK, toSid, day: sim.today };
  B.bills.push(bill); B.stats.bills++;
  return bill;
}
// 受け取り：行き先の館の金庫から払い、館どうしの貸し借りを帳簿に付ける（週に一度、早馬で精算）
export function cashBill(sim, billId, p = null) {
  const B = sim.S.bank; if (!B) return 0;
  const i = B.bills.findIndex((x) => x.id === billId); if (i < 0) return 0;
  const bill = B.bills[i];
  const owner = p || alive(sim, bill.owner); const hh = owner && sim.hh(owner);
  const bt = B.k[bill.toK];
  if (!hh || !bt || bt.state !== 'open') return 0;
  // 国が違えば両替。相場の差の一部を両替商が手数料（打歩）として取る
  const agio = bill.fromK !== bill.toK ? bill.amt * (0.01 + Math.abs(1 - exchangeRate(sim, bill.fromK, bill.toK)) * 0.5) : 0;
  const pay = bill.amt - agio;
  if (pay <= 0 || bt.vault < pay) { bt.short = (bt.short || 0) + 1; return 0; }   // 金庫が足りなければ後日
  if (bill.fromK === bill.toK) { B.k[bill.fromK].vault -= pay; }
  else { bt.vault -= pay; B.k[bill.fromK].owes[bill.toK] = (B.k[bill.fromK].owes[bill.toK] || 0) + pay; }
  hh.money += pay;
  // 打歩は出発地の金庫に残る（預けた額 − 払った額）
  if (bill.fromK !== bill.toK) B.k[bill.fromK].profit += agio;
  B.bills.splice(i, 1); B.stats.cashed++;
  return pay;
}
function settleInterbank(sim) {
  const B = sim.S.bank;
  if (sim.today % 7 !== 3) return;
  for (const [a, b] of Object.entries(B.k)) for (const [to, amt] of Object.entries(b.owes)) {
    const x = Math.min(amt, b.vault); if (x <= 0) continue;
    b.vault -= x; B.k[to].vault += x; b.owes[to] -= x;
    if (b.owes[to] < 0.5) delete b.owes[to];
  }
}
// logistics.js 用：隊商が出るとき、帰りの仕入れのお金を「現金で持つ」か「手形にする」か
export function bankConvoyDepart(sim, c, p, amt) {
  ensureBank(sim);
  const hh = p && sim.hh(p); if (!hh || amt < 20) return;
  amt = Math.min(amt, Math.max(0, hh.money - 20));
  if (amt < 20) return;
  const bill = sim.rng.chance(0.3 + p.pers.C * 0.5) ? drawBill(sim, p, amt, c.to) : null;
  if (bill) { c.bill = bill.id; return; }
  hh.money -= amt; c.cash = (c.cash || 0) + amt;   // 現金を荷車の箱に入れて運ぶ
}
// 盗賊に襲われたとき：現金は奪われる（盗賊の家計へ）。手形は本人でなければ換金できないので奪われない
export function bankConvoyRobbed(sim, c, bandHH) {
  if (!c.cash) return 0;
  const took = c.cash * sim.rng.range(0.6, 1);
  c.cash -= took;
  if (bandHH) bandHH.money += took; else sim.S.towns[c.from].fund += took;
  return took;
}
// 着いたとき：現金を家計に戻す／手形を受け取る
export function bankConvoyArrive(sim, c, p) {
  const hh = p && sim.hh(p);
  let got = 0;
  if (c.cash) { if (hh) hh.money += c.cash; else sim.S.towns[c.to].fund += c.cash; got += c.cash; c.cash = 0; }
  if (c.bill != null) { got += cashBill(sim, c.bill, p); c.bill = null; }
  return got;
}
// 期限切れの手形（持ち主が死んだ等）は、相続人がいなければ出発地の館のものになる（証文が消えるだけ）
function billsDaily(sim) {
  const B = sim.S.bank;
  // 受け取り損ねた手形は、持ち主が生きていれば館が家へ届ける（3日後から）。持ち主も相続人もいなければ40日で館のもの
  for (const b of B.bills.slice()) if (sim.today - b.day >= 3 && alive(sim, b.owner)) cashBill(sim, b.id);
  B.bills = B.bills.filter((b) => { if (sim.today - b.day < 40) return true; const bk = B.k[b.fromK]; if (bk) bk.profit += b.amt; return false; });
}

// ---------- 退蔵：壺に入れて埋める・掘り出す・掘り当てる ----------
function hoardDaily(sim) {
  const S = sim.S, R = sim.rng, B = S.bank;
  // 埋める
  for (const hh of Object.values(S.households)) {
    if (hh.bandits || hh.street || hh.inn || hh.royal || (hh.money || 0) < 170) continue;
    const head = headOf(sim, hh); if (!head || sim.ageOf(head) < 25) continue;
    const kid = kOfSid(sim, hh.s); if (kid == null) continue;
    const bk = B.k[kid];
    const gresham = bk ? Math.max(0, 0.9 - bk.q * bk.wear) * 0.15 : 0;   // 悪貨が出回ると、良い銅貨をしまい込む
    const scar = head.bankScar != null ? 0.03 : 0;
    const ch = (isMiser(head) ? 0.012 : 0.001) + gresham + (B.distrust[kid] || 0) * 0.02 + scar;
    if (!R.chance(ch)) continue;
    const amt = r1((hh.money - 100) * R.range(0.3, 0.6));
    if (amt < 20) continue;
    const home = hh.house != null ? sim.building(hh.house) : null;
    const base = home ? home.door : sim.town(hh.s);
    const x = clamp(Math.round(base.x + R.range(-3, 3)), 0, W - 1), z = clamp(Math.round(base.z + R.range(-3, 3)), 0, H - 1);
    hh.money -= amt;
    const sp = alive(sim, head.spouseId);
    const knows = sp && R.chance(0.5) ? [sp.id] : [];
    B.hoards.push({ id: B.seq++, x, z, s: hh.s, k: kid, amt, owner: head.id, knows, day: sim.today, lost: false });
    B.led.bury += amt; B.stats.buried++;
    remember(sim, head, `銅貨${amt}枚を壺に詰め、${home ? '家の裏' : '町はずれ'}にこっそり埋めた。${gresham > 0.01 ? '良い銅貨は手放さない' : '誰にも言わない'}`, 0.2, 0.7, 'hoard');
  }
  for (const h of B.hoards) {
    if (h.gone) continue;
    if (!h.lost) {
      const owner = alive(sim, h.owner);
      if (owner) {
        const hh = sim.hh(owner);
        if (hh && hh.money < 25 && R.chance(0.5)) {
          hh.money += h.amt; B.led.unbury += h.amt; h.gone = true;
          remember(sim, owner, `暮らしに詰まり、埋めておいた壺を掘り出した（${h.amt}銅貨）`, 0.3, 0.6, 'hoard');
        }
        continue;
      }
      // 本人が死んだ：場所を知る家族が掘り出す。誰も知らなければ、埋まったまま忘れられる
      const heir = (h.knows || []).map((id) => alive(sim, id)).find(Boolean);
      if (heir && sim.hh(heir)) {
        sim.hh(heir).money += h.amt; B.led.unbury += h.amt; h.gone = true;
        const dead = sim.S.people[h.owner];
        remember(sim, heir, `亡き${dead ? (sim.kinTerm?.(heir, dead) || dead.given) : '家の者'}が埋めた壺を掘り出した。${h.amt}銅貨も入っていた`, 0.4, 0.75, 'hoard');
      } else h.lost = true;
      continue;
    }
    // 持ち主の分からない壺を、畑仕事や開拓・道普請で掘り当てる
    const t = sim.S.world.tiles[h.z * W + h.x];
    const ch = (t === T.FIELD ? 0.012 : 0.004) * (h.old ? 0.6 : 1);
    if (!R.chance(ch)) continue;
    const diggers = sim.living().filter((p) => p.s === h.s && sim.isAdult(p) && p.jail == null && ['farmer', 'pioneer', 'roadworker', 'mason', 'gatherer', 'woodcutter', 'carpenter', 'gravedigger'].includes(p.job));
    const f = diggers.length ? R.pick(diggers) : null;
    if (!f || !sim.hh(f)) continue;
    const k = sim.S.kingdoms[h.k];
    const honest = f.pers.A > 0.55 && f.pers.C > 0.4;
    const toCrown = honest && k ? r1(h.amt * 0.5) : 0;   // 埋蔵物は王のもの。正直者は半分を届け出る
    sim.hh(f).money += h.amt - toCrown; if (toCrown) { k.treasury += toCrown; if (k.fisc) k.fisc.dayIn = (k.fisc.dayIn || 0) + toCrown; }
    B.led.unearth += h.amt; B.stats.found++; h.gone = true; h.finder = f.id;
    const what = h.old ? `${h.yearsAgo}年ほど前の古い銅貨` : '銅貨';
    remember(sim, f, `${JOBS[f.job]?.name || ''}の仕事の途中で、土の中から壺を掘り当てた。${what}が${h.amt}枚も入っていた${toCrown ? '。半分はお上に届け出た' : ''}`, 0.9, 0.9, 'hoard');
    f.needs && (f.needs.esteem = Math.min(100, (f.needs.esteem || 0) + 25));
    if (sim.gossip) sim.gossip(f, `土の中から銅貨の詰まった壺を掘り当てた`, 0.5, sim.living().filter((q) => q.s === f.s).slice(0, 20), { congrat: '壺を掘り当てたんだってね' });
    sim.news(`${sim.town(f.s).name}の${f.given}が、土の中から${what}${h.amt}枚入りの壺を掘り当てた${toCrown ? '（半分は国庫へ届け出た）' : ''}`, h.amt >= 100 ? 2 : 1, { x: h.x, z: h.z });
    const dead = h.owner != null ? sim.S.people[h.owner] : null;
    if (dead) sim.chron(`亡き${sim.fullName(dead)}がひそかに埋めた壺が、${f.given}の手で掘り出された`, h.k);
  }
  if (B.hoards.length > 120) B.hoards = B.hoards.filter((h) => !h.gone || sim.today - h.day < 20);
}

// ---------- 記録 ----------
function record(sim, k, b, M) {
  const dep = deposits(b);
  b.hist.push({ d: sim.today, M: r1(M.circ), V: r1(b.vault), D: r1(dep), Lo: r1(loansOut(b)), H: r1(M.hoard), L: Math.round(b.L * 1000) / 1000, iss: r1(b.issuedToday), q: b.q, w: Math.round(b.wear * 1000) / 1000 });
  if (b.hist.length > 60) b.hist.shift();
  b.issuedToday = 0;
}
function yearEnd(sim) {
  const B = sim.S.bank;
  for (const k of sim.S.kingdoms) {
    const b = B.k[k.id]; const last = b.hist[b.hist.length - 1];
    b.years.push({ y: sim.year() - 1, issued: r1(b.issuedYear), M: last?.M ?? 0, L: last?.L ?? 1, q: b.q });
    if (b.years.length > 50) b.years.shift();
    if (b.issuedYear > 0) sim.chron(`この年、${k.name}の王立造幣所は${r1(b.issuedYear)}銅貨ぶんの硬貨を打ち出した（物価の水準${Math.round(b.L * 100)}）`, k.id);
    b.issuedYear = 0;
  }
}

// ---------- 毎日 ----------
export function bankDaily(sim, GOODS) {
  const S = sim.S, B = ensureBank(sim);
  if (!B.init) { setupBuildings(sim); ancientHoards(sim); B.init = true; }
  else setupBuildings(sim);
  if (sim.dayOfYear() === 0 && sim.today > 0) yearEnd(sim);
  const Ms = moneyByKingdom(sim);
  for (const k of S.kingdoms) {
    const b = B.k[k.id], M = Ms[k.id] || { circ: 0, pop: 1, hoard: 0 };
    mintDaily(sim, k, b);
    coinPolicy(sim, k, b, M);
    bankDailyOne(sim, k, b);
    if (GOODS) levelDaily(sim, k, b, M, GOODS);
    B.distrust[k.id] = Math.max(0, (B.distrust[k.id] || 0) - 0.01);
  }
  settleInterbank(sim);
  billsDaily(sim);
  hoardDaily(sim);
  const Ms2 = moneyByKingdom(sim);
  for (const k of S.kingdoms) record(sim, k, B.k[k.id], Ms2[k.id] || { circ: 0, hoard: 0 });
}

// ---------- 画面用 ----------
// ui.js の renderNations の <dl> の中に差し込む HTML
export function bankNationHTML(sim, k, esc) {
  const B = sim.S.bank; if (!B?.k[k.id]) return '';
  const b = B.k[k.id], last = b.hist[b.hist.length - 1] || {};
  const prev = b.hist[Math.max(0, b.hist.length - 11)] || last;
  const dL = last.L && prev.L ? Math.round((last.L / prev.L - 1) * 1000) / 10 : 0;
  const rates = sim.S.kingdoms.filter((o) => o !== k).map((o) => `${esc(o.name.replace('王国', ''))}${exchangeRate(sim, k.id, o.id).toFixed(2)}`).join('・');
  const vein = Object.values(B.veins).filter((v) => sim.town(v.s)?.kingdom === k.id).reduce((s, v) => s + v.ag, 0);
  const qCls = b.q < 0.8 ? 'up' : '';
  return `<dt>造幣所</dt><dd>今年の発行 ${r1(b.issuedYear)}銅貨（通算${r1(b.issued)}）<br><span class="sub">銀の鉱脈の残り 約${r1(vein)}・王の信用 ${r1(b.credit)}</span></dd>
    <dt>硬貨の質</dt><dd><b class="${qCls}">銀${r1(b.q * 100)}%</b>・すり減り${r1((1 - b.wear) * 100)}%<br><span class="sub">両替の相場（1枚あたり）：${rates}</span></dd>
    <dt>物価の水準</dt><dd><b class="${b.L > 1.1 ? 'up' : b.L < 0.92 ? 'down' : ''}">${Math.round(b.L * 100)}</b>（10日で${dL >= 0 ? '+' : ''}${dL}%）・出回る硬貨 ${r1(last.M || 0)}銅貨</dd>
    <dt>両替商の館</dt><dd>${b.state === 'failed' ? '<b class="up">破綻して閉まっている</b>' : `預金 ${r1(last.D || 0)}・金庫 ${r1(b.vault)}・貸付 ${r1(loansOut(b))}${b.loans.some((l) => l.king) ? '<br><span class="sub">王に貸し付け中</span>' : ''}`}</dd>`;
}
// 暮らしのタブ（renderEcon）の末尾に足す HTML
export function bankEconHTML(sim, sid, esc) {
  const B = sim.S.bank; if (!B) return '';
  const kid = kOfSid(sim, sid); const b = kid != null ? B.k[kid] : null;
  const S = sim.S;
  const hhs = Object.values(S.households).filter((h) => h.s === sid);
  const dep = hhs.reduce((s, h) => s + hhDeposit(sim, h), 0);
  const savers = hhs.filter((h) => hhDeposit(sim, h) > 0).length;
  const pools = bankMoneyPools(sim);
  const all = moneyByKingdom(sim); let world = 0; for (const o of Object.values(all)) world += o.circ + o.vault;
  return `<p>物価の水準 ${b ? Math.round(b.L * 100) : 100}（${esc(S.kingdoms[kid]?.name || '')}の銅貨・銀${b ? r1(b.q * 100) : 100}%）<br>
    この町の預金 ${r1(dep)}銅貨（${savers}世帯）　大陸に出回る硬貨 ${r1(world)}銅貨<br>
    造幣の通算 ${r1(B.led.issue)}　土の中に眠る壺 ${B.hoards.filter((h) => !h.gone).length}個（見つかった壺 ${B.stats.found}）</p>`;
}
// 人物の詳細：所持金の行の後ろに足す
export function bankPersonHTML(sim, p, esc) {
  const d = depositOf(sim, p);
  const hid = (sim.S.bank?.hoards || []).filter((h) => !h.gone && h.owner === p.id).reduce((s, h) => s + h.amt, 0);
  const lost = Object.values(sim.S.bank?.k || {}).reduce((s, b) => s + (b.lost[p.id] || 0), 0);
  const debt = Object.values(sim.S.bank?.k || {}).flatMap((b) => b.loans).filter((l) => l.to === p.id && !l.king).reduce((s, l) => s + l.owed, 0);
  if (!d && !hid && !lost && !debt) return '';
  return `<dt>預金</dt><dd>${r1(d)}銅貨${debt ? `（館への借り ${r1(debt)}）` : ''}${lost ? `<br><span class="sub">潰れた館に取られたまま ${r1(lost)}</span>` : ''}${hid ? `<br><span class="sub">ひそかに埋めた壺 ${r1(hid)}銅貨</span>` : ''}</dd>`;
}
// 住人のつぶやき
export function bankThought(sim, p) {
  const B = sim.S.bank; if (!B || !sim.isAdult(p)) return null;
  const kid = kOfSid(sim, p.s); const b = B.k[kid]; if (!b) return null;
  if (p.bankScar != null && sim.today - p.bankScar < 30) return '館に預けた金は戻らなかった。二度と銀行なんて信じない';
  if (B.hoards.some((h) => !h.gone && h.owner === p.id)) return 'あの壺のことは、誰にも言っていない';
  if (b.q < 0.8) return '最近の銅貨は軽い。昔の銅貨はしまっておこう';
  if (b.L > 1.2) return '何もかも値上がりした。銅貨の値打ちが落ちたんだ';
  if (depositOf(sim, p) > 0 && (sim.S.bank.distrust[kid] || 0) > 0.3) return '館は大丈夫だろうか……引き出しておくべきか';
  return null;
}
