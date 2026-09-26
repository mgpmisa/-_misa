// 働くことと暮らしのお金（開発部）：7つの欲求への出費・王が決める休日・働きすぎと不満・ストライキ・働く理由
//
// 本体（sim.js）からは次の関数を呼ぶだけで動く。状態はすべて遅延初期化なので古いセーブでも動く。
//   laborDaily(sim)               … newDay の「いちばん最初」（p.workedToday を 0 に戻す前）に呼ぶ
//   restDayFor(sim, p)            … その人の休みの日か（国の休日・当番制・ストライキの勝ち取った休日）
//   laborRestDay(sim, sid)        … その町の休日か（isRestDay の置き換え）
//   laborWork(sim, p, rest)       … 今日働いてよいか。null なら働かない。{ end:終わりの時刻, max:分, bias:点数 }
//   laborWorkMul(p)               … 疲れと不満による仕事の効率（doWork の eff に掛ける）
//   laborCandidates(sim, p, add)  … decide の中で、欲求にお金を使う行動の候補を足す
//   laborArrive(sim, p)           … arrive の中で、買い物・もてなし・寄進などを実行する
//   laborDo(sim, p, dt)           … doAction の中で、行動中の欲求の満たされ方
//   laborThought(sim, p)          … 心の声（なければ null）
//   laborTopic(api, A, B)         … 会話の話題 { w, fn }（なければ null）
//   laborCard(sim, p)             … 詳細欄の行（[見出し, 本文] の配列）
//   laborNationHTML(sim, k, esc)  … 国々のタブに差し込む <dt><dd>
//   LABOR_LABEL / LABOR_GO / LABOR_PREF … ui.js の行動ラベル
//
// 状態：
//   S.labor = { v, strikes: [...], wage: {key:{...}}, rest: {key:{every,until}}, stats, flow: {欲求:銅貨}, income: {職:銅貨}, seq }
//   k.labor = { every, base, anchor, duty: [職], holiday: {day, why}, lastReview, kingId, log: [...] }
//   p.lab   = { style, vanity, streak, missed, gripe, bad, spent:{season, 欲求...}, total, nextSpend, plan, restY, restWork, strike, fired, bed, hobby, charm, cart, donated, engraved, guard }
//   p.fatigue（疲れ 0〜100）、p.workReason（働く理由のキー）
//   hh.labRes（その家が手をつけない取り置き）、hh.bedQ（寝台の良さ）、hh.labHelp（雇っている手伝い）
import { clamp } from './rng.js';
import { JOBS, JOB_QUOTA } from './data.js';
import { pay, earn, spendable, headOf } from './property.js';
import { ensureTaxes, kingdomUnrest } from './taxes.js';
import { debtsOf } from './finance.js';
import { fallIll, isBedridden } from './health.js';
import { markWanted, arrest, humanStats } from './society.js';
import { makeItem, addItem, autoEquip, countItem } from './items.js';

// ---------- 表 ----------
export const NEED_JP = { hunger: '食', sleep: '眠り', survival: '身の安全', lust: '恋', sloth: '楽', pleasure: '楽しみ', esteem: '見栄・名誉' };
export const STYLE_JP = { spender: '浪費家', normal: 'ふつう', thrifty: '倹約家', miser: 'けち' };
export const WORK_REASON = {
  family: '家族を養うため', dream: '夢のために貯めている', debt: '借金を返すため', fame: '名を上げたい',
  love: 'この仕事が好きだから', tax: '税を納めるため', survive: '食べていくため', duty: '務めだから', habit: '暮らしのため',
};
const STYLE_RATE = { spender: 0.3, normal: 0.15, thrifty: 0.07, miser: 0.03 };     // 使えるお金のうち、一度に使ってよい割合
const STYLE_WAIT = { spender: 9, normal: 20, thrifty: 40, miser: 90 };             // 使ったあと次に使うまでの時間
const STYLE_APP = { spender: 1.35, normal: 1, thrifty: 0.72, miser: 0.45 };        // 使いたい気持ちの強さ

// 国の休日にも休めない職（当番制で、自分の休みは別の日に回ってくる）
const ESSENTIAL = new Set(['innkeeper', 'guard', 'knight', 'soldier', 'jailer', 'king', 'servant', 'gatekeeper', 'militia', 'watchman', 'royalguard', 'doctor', 'midwife', 'keeper', 'cook', 'maid', 'butler', 'nanny', 'stablehand', 'general']);
// 戦のあいだは当番の休みもない職
const WAR_DUTY = new Set(['soldier', 'knight', 'general', 'royalguard', 'gatekeeper', 'militia', 'guard', 'watchman']);
// 厳しい王や戦のときに、休日も働けと命じられる職
const STRICT_DUTY = ['baker', 'miller', 'fisher'];
const WAR_EXTRA = ['smith', 'carpenter', 'miner'];
const DUTY_JOBS = new Set(['king', 'royal', 'noble', 'knight', 'soldier', 'general', 'royalguard', 'chancellor', 'treasurer', 'guard', 'priest', 'elder']);

// ストライキを起こしうる仲間（同じ町・同じ仕事の筋）
export const GROUP = {
  farm: ['farmer', 'rancher', 'shepherd', 'beekeeper', 'miller'],
  mine: ['miner', 'mason'],
  craft: ['smith', 'carpenter', 'tailor', 'cobbler', 'potter', 'weaver', 'baker', 'brewer', 'butcher', 'jeweler', 'shipwright'],
  labor: ['roadworker', 'woodcutter', 'charcoal', 'pioneer', 'laundress', 'stablehand', 'coachman', 'ferryman', 'gatherer'],
  sea: ['fisher', 'sailor', 'diver'],
};
const GROUP_NAME = { farm: '農夫たち', mine: '鉱夫たち', craft: '職人たち', labor: '人夫たち', sea: '漁師や船乗りたち' };
const GROUP_OF = {};
for (const [g, js] of Object.entries(GROUP)) for (const j of js) GROUP_OF[j] = g;
const DEMAND_JP = { wage: '賃上げ', rest: '休日', tax: '減税' };
// 働きづめで疲れやすい力仕事
const HEAVY = new Set(['farmer', 'miner', 'mason', 'woodcutter', 'charcoal', 'roadworker', 'pioneer', 'fisher', 'sailor', 'diver', 'smith', 'laundress', 'shipwright', 'stablehand', 'coachman', 'ferryman', 'peddler', 'merchant']);
// 危ない所へ出る仕事（身を守る品を買う）
const RISKY = new Set(['hunter', 'woodcutter', 'miner', 'messenger', 'pioneer', 'coachman', 'peddler', 'charcoal', 'gatherer', 'roadworker', 'merchant', 'wanderer']);
// 燃え尽きた人夫が移る先の、体の楽な仕事
const LIGHT = ['tailor', 'weaver', 'potter', 'cobbler', 'gatherer', 'shepherd', 'beekeeper', 'laundress', 'stablehand', 'peddler'];
const WOMEN = ['laundress', 'maid', 'nanny', 'midwife', 'nun', 'dancer'];
const PERFORMERS = ['musician', 'dancer', 'bard', 'troupe', 'jester', 'storyteller'];
const LAWFUL = new Set(['guard', 'watchman', 'militia', 'soldier', 'knight', 'royalguard', 'jailer', 'general', 'paladin']);

const alive = (p) => p && p.deathYear == null;
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const jobName = (j) => JOBS[j]?.name || j;
const title = (p) => (p?.sex === 'f' ? '女王' : '王');
const r0 = (v) => Math.round(v);

// ---------- 状態 ----------
export function ensureLabor(sim) {
  const S = sim.S;
  if (!S.labor) S.labor = { v: 1, strikes: [], wage: {}, rest: {}, seq: 1, flow: {}, income: {}, stats: { strikes: 0, won: 0, partial: 0, crushed: 0, fizzled: 0, riots: 0, restWork: 0, sick: 0, quit: 0, holidays: 0, decrees: 0, buys: 0 } };
  const L = S.labor;
  L.strikes = L.strikes || []; L.wage = L.wage || {}; L.rest = L.rest || {}; L.flow = L.flow || {}; L.income = L.income || {}; L.stats = L.stats || {};
  for (const k of S.kingdoms || []) kLabor(sim, k);
  return L;
}
function kingEvery(king) {
  if (!king) return 5;
  const A = king.pers?.A ?? 0.5, C = king.pers?.C ?? 0.5, amb = king.values?.ambition ?? 0.5;
  return clamp(Math.round(5 + (amb - 0.5) * 3 + (C - 0.5) * 1.6 - (A - 0.5) * 3.2), 3, 7);
}
function kingDuty(king) {
  if (!king) return [];
  const A = king.pers?.A ?? 0.5, C = king.pers?.C ?? 0.5;
  return A < 0.4 && C > 0.5 ? STRICT_DUTY.slice() : A < 0.3 ? ['baker'] : [];
}
export function kLabor(sim, k) {
  if (!k.labor) {
    const king = sim.S.people[k.kingId];
    const every = kingEvery(king);
    // これまでの「7日に1度」と同じ日取りから始める（最初の休みは今日以降）
    k.labor = { every, base: every, anchor: sim.today - (sim.today % every), duty: kingDuty(king), holiday: null, lastReview: sim.today, kingId: k.kingId, log: [] };
  }
  return k.labor;
}
export function lab(p) {
  if (!p.lab) {
    const C = p.pers?.C ?? 0.5, E = p.pers?.E ?? 0.5, A = p.pers?.A ?? 0.5, N = p.pers?.N ?? 0.5, amb = p.values?.ambition ?? 0.5;
    const vanity = clamp(E * 0.4 + amb * 0.35 + (1 - A) * 0.15 + hash(p.id * 7 + 3) * 0.3 - 0.1, 0, 1);
    const s = (0.5 - C) * 1.3 + (E - 0.5) * 0.8 + (vanity - 0.5) * 0.6 + (N - 0.5) * 0.3 + (hash(p.id * 13 + 1) - 0.5) * 0.5;
    const style = C > 0.62 && A < 0.42 && hash(p.id * 5 + 2) < 0.7 ? 'miser' : s > 0.32 ? 'spender' : s < -0.28 ? 'thrifty' : 'normal';
    p.lab = { style, vanity: Math.round(vanity * 100) / 100, streak: 0, missed: 0, gripe: 0, bad: 0, spent: { season: -1 }, total: 0, nextSpend: 0, plan: null, restY: false, restWork: -1, strike: null, fired: -1 };
  }
  if (p.fatigue == null) p.fatigue = 10;
  return p.lab;
}

// ---------- 休日 ----------
function restEvery(sim, k, sid, group) {
  const kl = kLabor(sim, k);
  let every = kl.every;
  const o = group ? sim.S.labor?.rest?.[`${sid}:${group}`] : null;
  if (o && o.until >= sim.today) every = Math.min(every, o.every);
  return every;
}
function onSchedule(sim, k, every) { const kl = kLabor(sim, k); const d = sim.today - kl.anchor; return ((d % every) + every) % every === every - 1; }
// その町が休日か（isRestDay の置き換え）。sid を省くと最初の町の国で見る
export function laborRestDay(sim, sid = 0, group = null) {
  const k = sim.S.kingdoms?.[sim.town(sid ?? 0)?.kingdom ?? 0];
  if (!k) return sim.today % 7 === 6;
  const kl = kLabor(sim, k);
  if (kl.holiday && kl.holiday.day === sim.today) return true;
  return onSchedule(sim, k, restEvery(sim, k, sid, group));
}
function dutyOf(sim, k) {
  const kl = kLabor(sim, k);
  const set = new Set(ESSENTIAL);
  for (const j of kl.duty || []) set.add(j);
  if (k.war) for (const j of WAR_EXTRA) set.add(j);
  return set;
}
// その人の休みの日か
export function restDayFor(sim, p) {
  const k = sim.kingdomOf(p);
  if (!k || !p.job) return laborRestDay(sim, p.s);
  const group = GROUP_OF[p.job];
  if (dutyOf(sim, k).has(p.job)) {
    if (k.war && WAR_DUTY.has(p.job)) return false;
    // 当番制：人ごとにずらした日に休む
    const every = restEvery(sim, k, p.s, group);
    return ((sim.today + p.id) % every) === every - 1;
  }
  return laborRestDay(sim, p.s, group);
}

// ---------- 働くかどうか ----------
function striking(sim, p) {
  const L = p.lab;
  if (!L || L.strike == null) return null;
  const st = sim.S.labor?.strikes?.find((x) => x.id === L.strike);
  if (!st || st.state !== 'on') { L.strike = null; return null; }
  return st;
}
export function laborWork(sim, p, rest) {
  const L = lab(p);
  if (striking(sim, p)) return null;
  if (L.fired >= sim.today) return null;
  const reason = p.workReason || 'habit';
  let end = 17, max = 9 * 60, bias = 0;
  switch (reason) {
    case 'debt': case 'tax': end = 19; max = 11 * 60; bias = 1.3; break;
    case 'survive': end = 18.5; max = 10.5 * 60; bias = 1.1; break;
    case 'dream': end = 18; max = 10 * 60; bias = 0.7; break;
    case 'love': end = 18; max = 10 * 60; bias = 0.9; break;
    case 'family': bias = 0.5; break;
    case 'fame': bias = 0.4; break;
    case 'duty': bias = 0.3; break;
  }
  const f = p.fatigue || 0;
  bias -= Math.max(0, f - 50) / 14;
  if (f > 85) max = Math.min(max, 6 * 60);
  if (L.gripe > 70 && reason !== 'love') bias -= 0.8;   // やる気が出ない
  if (!rest) return { end, max, bias };
  // 休みの日
  const k = sim.kingdomOf(p);
  if (k && dutyOf(sim, k).has(p.job) && !restDayFor(sim, p)) return { end, max, bias };   // 当番
  const press = L.press || 0;
  if (press >= 0.7 && f < 92) { L.restWork = sim.today; return { end: 16, max: 8 * 60, bias: bias - 0.4 + press }; }   // 税や借金のために休めない
  if (reason === 'love' && (p.pers?.C ?? 0.5) > 0.55) return { end: 13, max: 4 * 60, bias: bias - 1 };   // 好きだから少しだけ
  if (reason === 'dream' && (p.pers?.C ?? 0.5) > 0.7) return { end: 14, max: 5 * 60, bias: bias - 0.8 };
  return null;
}
export function laborWorkMul(p) {
  let m = 1;
  const f = p.fatigue || 0;
  if (f > 40) m *= 1 - (f - 40) / 150;
  if (p.lab?.gripe > 70 && p.workReason !== 'love') m *= 0.9;
  if (p.workReason === 'love') m *= 1.05;
  return Math.max(0.55, m);
}

// ---------- 働く理由 ----------
function taxDue(sim, hh) {
  const k = sim.S.kingdoms[sim.town(hh.s)?.kingdom];
  const pol = k?.taxes;
  if (!pol || hh.royal || hh.bandits || hh.street || hh.wander) return 0;
  const adults = hh.members.map((id) => sim.S.people[id]).filter((q) => alive(q) && sim.ageOf(q) >= 16 && q.jail == null).length;
  let due = pol.poll * pol.lv * adults + (hh.land || 0) * 20 * pol.land / 100 * pol.lv + Math.min(60, hh.taxDebt || 0);
  if (pol.warLevy) due *= 1.3;
  return due;
}
function reasonOf(sim, p, hh) {
  const job = p.job;
  if (['king', 'royal', 'noble', 'general', 'chancellor', 'treasurer', 'royalguard'].includes(job)) return 'duty';
  const owed = debtsOf(sim, p).reduce((s, l) => s + (l.owed || 0), 0);
  if (owed > 15) return 'debt';
  const k = sim.kingdomOf(p);
  const due = hh ? taxDue(sim, hh) : 0;
  const money = hh?.money ?? 0;
  if (k?.taxes && k.taxes.lv >= 1.25 && due > Math.max(8, money * 0.22)) return 'tax';
  if (money < 35) return 'survive';
  if (p.plan && p.plan.stage === 'saving') return 'dream';
  const skill = p.skill?.[job] || 0;
  const loves = skill > 0.55 && hash(p.id * 31 + 7) < 0.25 + (p.pers?.O ?? 0.5) * 0.3 + (p.pers?.C ?? 0.5) * 0.2;
  const kids = hh ? hh.members.some((id) => { const q = sim.S.people[id]; return alive(q) && q.id !== p.id && sim.ageOf(q) < 14; }) : false;
  if (loves && !kids) return 'love';
  if (kids && (p.values?.family ?? 0.5) > 0.35) return 'family';
  if ((p.values?.ambition ?? 0.5) > 0.66) return 'fame';
  if (loves) return 'love';
  if (DUTY_JOBS.has(job) || LAWFUL.has(job)) return 'duty';
  if (kids) return 'family';
  return 'habit';
}
const PRESS = { debt: 0.8, tax: 0.9, survive: 0.72, dream: 0.35, love: 0.3, family: 0.3, fame: 0.25, duty: 0.2, habit: 0.1 };

// ---------- 取り置き（手をつけないお金） ----------
function reserveOf(sim, p, hh) {
  if (!hh) return 0;
  if (hh.labRes != null) return hh.labRes;
  return 25 + hh.members.length * 12;
}
function disposable(sim, p) {
  const hh = sim.hh(p);
  const L = lab(p);
  let res = reserveOf(sim, p, hh);
  if (L.style === 'spender') res *= 0.6;
  else if (L.style === 'thrifty') res *= 1.25;
  else if (L.style === 'miser') res *= 1.8;
  if (p.plan && p.plan.stage === 'saving') res += Math.min(120, Math.max(0, (p.plan.need || 0) - (p.plan.saved || 0))) * (L.style === 'spender' ? 0.15 : 0.5);
  return spendable(sim, p) - res;
}

// ---------- 売り手の名簿（1時間に1度まとめる） ----------
function sellers(sim) {
  const key = Math.floor(sim.S.t / 60);
  if (sim._labSell?.key === key) return sim._labSell;
  const by = {}, poor = {};
  for (const q of sim.living()) {
    if (q.jail != null || !q.needs || sim.ageOf(q) < 14) continue;
    if (q.job) { const t = by[q.s] || (by[q.s] = {}); (t[q.job] || (t[q.job] = [])).push(q); }
    const hh = sim.hh(q);
    if (hh && !hh.royal && !hh.bandits && hh.money < 45 && sim.ageOf(q) >= 14 && sim.ageOf(q) < 66 && !isBedridden(q)) (poor[q.s] || (poor[q.s] = [])).push(q);
  }
  sim._labSell = { key, by, poor };
  return sim._labSell;
}
function findSeller(sim, sid, jobs, not) {
  const t = sellers(sim).by[sid];
  if (!t) return null;
  const list = [];
  for (const j of jobs) for (const q of t[j] || []) if (q !== not && q.hh !== not?.hh) list.push(q);
  return list.length ? sim.rng.pick(list) : null;
}
// お金を動かす（消さない）：買い手 → 売り手の家計、売り手がいなければ町の蓄え
function transfer(sim, p, amt, seller, cat) {
  amt = Math.max(0, Math.round(amt * 10) / 10);
  if (amt <= 0) return 0;
  pay(sim, p, amt);
  if (seller && sim.hh(seller)) { earn(sim, seller, amt, 0.4); sim.S.labor.income[seller.job] = (sim.S.labor.income[seller.job] || 0) + amt; }
  else sim.S.towns[p.s].fund += amt;
  const L = lab(p), si = sim.seasonIdx() + sim.year() * 4;
  if (L.spent.season !== si) L.spent = { season: si };
  L.spent[cat] = (L.spent[cat] || 0) + amt;
  L.total = (L.total || 0) + amt;
  sim.S.labor.flow[cat] = (sim.S.labor.flow[cat] || 0) + amt;
  sim.S.labor.stats.buys = (sim.S.labor.stats.buys || 0) + 1;
  return amt;
}
// 市場の品を買う：在庫があれば商人（いなければ作り手）から、なければ作り手に頼んで作ってもらう（1.25倍）
function goodDeal(sim, p, g, makers) {
  const m = sim.market(p.s);
  if (!m?.price?.[g]) return null;
  const price = m.price[g];
  if ((m.stock[g] || 0) >= 1) {
    const seller = findSeller(sim, p.s, ['merchant'], p) || findSeller(sim, p.s, makers, p);
    return { cost: price, seller, stock: g, margin: 0.15 };
  }
  const maker = findSeller(sim, p.s, makers, p);
  return maker ? { cost: price * 1.25, seller: maker, stock: null } : null;
}

// ---------- 恋の相手 ----------
function partnerOf(sim, p) {
  if (p.spouseId != null) { const sp = sim.S.people[p.spouseId]; if (alive(sp) && sp.s === p.s && sp.jail == null) return sp; }
  const c = sim.crushOf ? sim.crushOf(p) : null;
  return c && c.s === p.s ? c : null;
}
function friendsOf(sim, p, n) {
  return Object.entries(p.rel || {}).filter(([id, r]) => r.a > 30 && alive(sim.S.people[id]) && sim.S.people[id].s === p.s && sim.S.people[id].jail == null && sim.ageOf(sim.S.people[id]) >= 14)
    .sort((a, b) => b[1].a - a[1].a).slice(0, n).map(([id]) => sim.S.people[id]);
}

// ---------- 品とサービスの一覧 ----------
// need：どの欲求か／type：行動の種類／place：行き先／deal(sim,p,ctx)：{cost, seller, stock, ...} を返す（null なら買えない）／fx：買ったときの効き目
const price = (sim, p, g) => sim.market(p.s)?.price?.[g] || 5;
export const SPEND = [
  // 食
  { id: 'feast', every: 2, need: 'hunger', name: 'ごちそう', type: 'dine', place: 'tavern', dur: 70,
    ok: (sim, p) => p.needs.hunger < 75,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['innkeeper', 'cook'], p); return s ? { cost: price(sim, p, 'meat') * 2 + price(sim, p, 'ale') * 2 + 2, seller: s } : null; },
    fx: (sim, p) => { bump(p, { hunger: 70, pleasure: 15, esteem: 5 }); }, txt: '酒場で肉料理のごちそうを平らげた' },
  { id: 'dineout', need: 'hunger', name: '酒場の料理', type: 'dine', place: 'tavern', dur: 45,
    ok: (sim, p) => p.needs.hunger < 70,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['innkeeper'], p); return s ? { cost: price(sim, p, 'bread') * 2 + price(sim, p, 'ale') + 1, seller: s } : null; },
    fx: (sim, p) => bump(p, { hunger: 55, pleasure: 8 }), txt: null },
  { id: 'honey', every: 2, need: 'hunger', name: 'はちみつ菓子', type: 'shopping', place: 'market', dur: 20,
    deal: (sim, p) => goodDeal(sim, p, 'honey', ['beekeeper']),
    fx: (sim, p) => bump(p, { hunger: 20, pleasure: 18 }), txt: 'はちみつ菓子を買って味わった' },
  // 眠り
  { id: 'featherbed', need: 'sleep', name: '羽毛布団', type: 'shopping', place: 'market', dur: 25,
    ok: (sim, p) => { const hh = sim.hh(p); return hh?.house != null && !hh.inn && (hh.bedQ || 0) < 1; },
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['weaver', 'tailor'], p); return s ? { cost: price(sim, p, 'cloth') * 2 + price(sim, p, 'wool') * 2, seller: s } : null; },
    fx: (sim, p) => { const hh = sim.hh(p); hh.bedQ = 1; hh.comfort = Math.min(10, (hh.comfort || 0) + 0.5); bump(p, { esteem: 5 }); }, txt: '羽毛布団をあつらえた。今夜からぐっすり眠れそうだ', gossip: '羽毛布団をあつらえた' },
  { id: 'goodbed', need: 'sleep', name: '良い寝台', type: 'shopping', place: 'market', dur: 25,
    ok: (sim, p) => { const hh = sim.hh(p); return hh?.house != null && !hh.inn && (hh.bedQ || 0) < 2 && hh.money > 220; },
    deal: (sim, p) => goodDeal(sim, p, 'furniture', ['carpenter', 'shipwright']),
    fx: (sim, p) => { const hh = sim.hh(p); hh.bedQ = 2; hh.comfort = Math.min(10, (hh.comfort || 0) + 1); bump(p, { esteem: 10 }); }, txt: '大工に立派な寝台を作ってもらった', gossip: '立派な寝台を買いそろえた' },
  { id: 'innroom', every: 3, need: 'sleep', name: '宿の上等な部屋', type: 'lodge', place: 'tavern', dur: 150,
    ok: (sim, p) => (p.fatigue || 0) > 55 && sim.hour() >= 12,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['innkeeper'], p); return s ? { cost: 8, seller: s } : null; },
    fx: (sim, p) => { p.fatigue = Math.max(0, (p.fatigue || 0) - 15); bump(p, { sleep: 25, sloth: 20 }); }, txt: '宿の上等な部屋を借りて、ひと息ついた' },
  // 身の安全
  { id: 'medicine', every: 4, need: 'survival', name: '薬', type: 'shopping', place: 'market', dur: 15,
    ok: (sim, p) => countItem(p, 'potion') < 1,
    deal: (sim, p) => goodDeal(sim, p, 'medicine', ['herbalist', 'alchemist']),
    fx: (sim, p) => { addItem(p, makeItem('potion')); bump(p, { survival: 15 }); }, txt: '万一に備えて薬を買っておいた' },
  { id: 'charm', every: 10, need: 'survival', name: 'お守り', type: 'donate', place: 'church', dur: 30,
    ok: (sim, p) => (p.lab.charm ?? -1) < sim.today,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['priest', 'nun', 'cleric', 'fortune'], p); return { cost: 4, seller: s, alms: !s }; },
    fx: (sim, p) => { p.lab.charm = sim.today + 10; bump(p, { survival: 25 }); }, txt: '教会でお守りを授かった' },
  { id: 'armor', need: 'survival', name: '革の胴着', type: 'shopping', place: 'smithy', dur: 20,
    ok: (sim, p) => RISKY.has(p.job) && !p.eq?.armor,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['smith', 'tailor', 'cobbler'], p); return s ? { cost: Math.round(22 * clamp(price(sim, p, 'cloth') / 8, 0.7, 1.6)), seller: s } : null; },
    fx: (sim, p) => { addItem(p, makeItem('leatherarmor', 0.9)); autoEquip(p); bump(p, { survival: 25 }); }, txt: '山や森に出る仕事だから、革の胴着を買った' },
  { id: 'repair', need: 'survival', name: '家の修繕', type: 'pamper', place: 'home', dur: 60,
    ok: (sim, p) => { const hh = sim.hh(p); const b = hh?.house != null ? sim.building(hh.house) : null; return !!(b && b.dmg && b.type === 'house'); },
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['carpenter', 'mason', 'roadworker'], p); return s ? { cost: 18, seller: s } : null; },
    fx: (sim, p) => { const b = sim.building(sim.hh(p).house); b.dmg = Math.max(0, (b.dmg || 0) - 0.35); b.repairFund = true; bump(p, { survival: 20 }); }, txt: '大工を呼んで、傷んだ家を直してもらった' },
  // 恋
  { id: 'gift', every: 8, need: 'lust', name: '贈り物', type: 'shopping', place: 'market', dur: 25, partner: true,
    ok: (sim, p, c) => !!c.partner,
    deal: (sim, p, c) => {
      const rich = spendable(sim, p) > 260;
      const opts = rich ? [['jewelry', ['jeweler'], '首飾り'], ['cloth', ['weaver', 'tailor'], '絹のリボン']] : [['honey', ['beekeeper'], 'はちみつの壺'], ['pottery', ['potter'], '小さな花瓶'], ['cloth', ['weaver', 'tailor'], '刺繍のハンカチ']];
      for (const [g, mk, nm] of sim.rng.shuffle(opts)) { const d = goodDeal(sim, p, g, mk); if (d) return { ...d, label: nm }; }
      return null;
    },
    fx: (sim, p, c, d) => {
      const q = c.partner;
      if (!alive(q)) return;
      sim.relMut(q, p).a = Math.min(100, sim.rel(q, p).a + 8);
      sim.relMut(p, q).a = Math.min(100, sim.rel(p, q).a + 3);
      bump(p, { lust: 15, esteem: 5 }); if (q.needs) bump(q, { esteem: 10, lust: 8 });
      sim.remember(q, `${p.given}から${d.label}を贈られた`, { emo: 0.7, imp: 0.55, about: [p.id], k: 'gift' });
    }, txt: (sim, p, c, d) => `${c.partner.given}に${d.label}を贈った` },
  { id: 'date', every: 5, need: 'lust', name: '逢い引きの食事', type: 'dine', place: 'tavern', dur: 80, partner: true,
    ok: (sim, p, c) => !!c.partner && sim.hour() >= 11,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['innkeeper'], p); return s ? { cost: (price(sim, p, 'bread') + price(sim, p, 'ale') * 2 + 2) * 2, seller: s } : null; },
    fx: (sim, p, c) => {
      const q = c.partner;
      bump(p, { lust: 25, hunger: 40, pleasure: 12 });
      if (alive(q) && q.needs) { bump(q, { lust: 20, hunger: 40, pleasure: 12 }); sim.relMut(q, p).a = Math.min(100, sim.rel(q, p).a + 5); sim.relMut(p, q).a = Math.min(100, sim.rel(p, q).a + 5); }
      gather(sim, p, 'dine', 'tavern', 80, [p.id, q.id]);
      if (alive(q)) sim.remember(q, `${p.given}に酒場で食事をごちそうになった`, { emo: 0.6, imp: 0.45, about: [p.id], k: 'date' });
    }, txt: (sim, p, c) => `${c.partner.given}と酒場で食事をした` },
  { id: 'matchmaker', every: 15, need: 'lust', name: '仲人への礼金', type: 'donate', place: 'church', dur: 40,
    ok: (sim, p, c) => !c.partner && p.spouseId == null && sim.ageOf(p) >= 20 && sim.ageOf(p) <= 45 && p.needs.lust < 50,
    deal: (sim, p) => {
      const mm = findSeller(sim, p.s, ['elder', 'priest', 'midwife', 'nun'], p);
      return mm ? { cost: 12, seller: mm } : null;
    },
    fx: (sim, p, c, d) => {
      // 仲人が釣り合う相手を見つけて引き合わせる
      const age = sim.ageOf(p);
      const cands = sim.living().filter((q) => q.s === p.s && q.sex !== p.sex && q.spouseId == null && q.jail == null && sim.ageOf(q) >= 18 && Math.abs(sim.ageOf(q) - age) <= 10 && !sim.isKin(p, q) && !sim.S.wanted[q.id]);
      if (!cands.length) { sim.remember(p, `仲人の${d.seller.given}に頼んだが、よい相手は見つからなかった`, { emo: -0.3, imp: 0.4, k: 'love' }); return; }
      const q = sim.rng.pick(cands);
      sim.relMut(p, q).a = Math.max(sim.rel(p, q).a, 42); sim.relMut(q, p).a = Math.max(sim.rel(q, p).a, 38);
      bump(p, { lust: 10, esteem: 5 });
      sim.remember(p, `仲人の${d.seller.given}の世話で、${q.given}と引き合わされた`, { emo: 0.6, imp: 0.6, about: [q.id, d.seller.id], k: 'love' });
      sim.remember(q, `仲人の${d.seller.given}の世話で、${p.given}と引き合わされた`, { emo: 0.4, imp: 0.5, about: [p.id, d.seller.id], k: 'love' });
      sim.pushLog(`${d.seller.given}の仲立ちで、${p.given}と${q.given}が引き合わされた。`, 'event', [p.id, q.id, d.seller.id], p.pos);
    }, txt: null },
  { id: 'weddingprep', need: 'lust', name: '婚礼の支度', type: 'shopping', place: 'market', dur: 40,
    ok: (sim, p) => (sim.S.pendingWeddings || []).some((w) => w.a === p.id || w.b === p.id) && !p.lab.wprep,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['tailor', 'weaver', 'innkeeper'], p); return s ? { cost: 25 + price(sim, p, 'cloth') * 2, seller: s } : null; },
    fx: (sim, p) => { p.lab.wprep = true; bump(p, { esteem: 20, lust: 10 }); }, txt: '婚礼の晴れ着と祝いの席を支度した', gossip: '婚礼の支度にお金をかけた' },
  // 楽
  { id: 'helper', every: 2, need: 'sloth', name: '手伝いを雇う', type: 'pamper', place: 'home', dur: 90,
    ok: (sim, p) => { const hh = sim.hh(p); return hh?.house != null && !hh.inn && (p.needs.sloth < 45 || (p.fatigue || 0) > 50); },
    deal: (sim, p) => {
      const pool = (sellers(sim).poor[p.s] || []).filter((q) => q.hh !== p.hh && q !== p && !q.fight && q.lab?.strike == null);
      return pool.length ? { cost: 6, seller: sim.rng.pick(pool), helper: true } : null;
    },
    fx: (sim, p, c, d) => {
      p.fatigue = Math.max(0, (p.fatigue || 0) - 12); bump(p, { sloth: 35 });
      const hh = sim.hh(p); hh.laundry = Math.max(0, (hh.laundry || 0) - 3); hh.water = Math.min(10, (hh.water ?? 5) + 3);
      sim.remember(d.seller, `${p.family}家の手伝いをして、${d.cost}銅貨もらった`, { emo: 0.3, imp: 0.3, about: [p.id], k: 'work' });
    }, txt: (sim, p, c, d) => `${d.seller.given}に家の手伝いを頼んで、のんびりした` },
  { id: 'outing', every: 3, need: 'sloth', name: '休日の遠出', type: 'outing', place: 'far', dur: 150, rest: true,
    ok: (sim, p, c) => c.rest && sim.hour() < 14,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['baker', 'innkeeper', 'cook'], p); return { cost: 3, seller: s }; },
    fx: (sim, p) => { bump(p, { pleasure: 10 }); }, txt: '休みの日に弁当を持って遠出した' },
  // 楽しみ
  { id: 'show', every: 1, need: 'pleasure', name: '芝居や見世物', type: 'show', place: 'plaza', dur: 70,
    deal: (sim, p) => { const s = findSeller(sim, p.s, PERFORMERS, p); return s ? { cost: 3, seller: s } : null; },
    fx: (sim, p, c, d) => { bump(p, { pleasure: 10 }); if (d.seller.needs) bump(d.seller, { esteem: 6 }); }, txt: (sim, p, c, d) => `広場で${jobName(d.seller.job)}の${d.seller.given}の芸を見て、銅貨を投げた` },
  { id: 'wine', every: 2, need: 'pleasure', name: '上等な酒', type: 'dine', place: 'tavern', dur: 70,
    ok: (sim, p) => sim.hour() >= 15 && sim.ageOf(p) >= 16,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['innkeeper', 'brewer'], p); return s ? { cost: price(sim, p, 'ale') * 4 + 2, seller: s } : null; },
    fx: (sim, p) => { bump(p, { pleasure: 25, esteem: 3 }); const m = sim.market(p.s); if (m.stock.ale >= 1) m.stock.ale -= 1; }, txt: null },
  { id: 'fortune', every: 4, need: 'pleasure', name: '占い', type: 'show', place: 'plaza', dur: 30,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['fortune'], p); return s ? { cost: 2, seller: s } : null; },
    fx: (sim, p) => bump(p, { pleasure: 12, survival: 5 }), txt: (sim, p) => sim.rng.pick(['占い師に「近いうちによいことがある」と言われた', '占い師に「水辺に気をつけよ」と言われた', '占い師に恋の行方を占ってもらった']) },
  { id: 'hobby', need: 'pleasure', name: '趣味の道具', type: 'shopping', place: 'market', dur: 30,
    ok: (sim, p) => !p.lab.hobby && sim.ageOf(p) >= 14,
    deal: (sim, p) => {
      const opts = [['竪琴', ['carpenter', 'shipwright']], ['笛', ['carpenter']], ['絵の具と画布', ['painter', 'weaver']], ['釣り道具', ['carpenter', 'fisher']], ['焼き物の道具', ['potter']], ['盤上遊戯の駒', ['carpenter', 'potter']]];
      for (const [nm, mk] of sim.rng.shuffle(opts)) { const s = findSeller(sim, p.s, mk, p); if (s) return { cost: 15, seller: s, label: nm }; }
      return null;
    },
    fx: (sim, p, c, d) => { p.lab.hobby = d.label; bump(p, { pleasure: 30 }); }, txt: (sim, p, c, d) => `${d.label}を買った。これで休みの日が楽しみだ` },
  // 見栄・名誉
  { id: 'fineclothes', need: 'esteem', name: 'よい服', type: 'shopping', place: 'market', dur: 35,
    ok: (sim, p) => (p.lab.fine ?? -99) < sim.today - 20,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['tailor', 'weaver'], p); return s ? { cost: price(sim, p, 'cloth') * 3 + 6, seller: s } : null; },
    fx: (sim, p) => { p.lab.fine = sim.today; addItem(p, makeItem('clothes', 1.4, { custom: '上等な晴れ着' })); bump(p, { esteem: 30 }); }, txt: '仕立て屋で上等な晴れ着をあつらえた', gossip: '上等な晴れ着をあつらえた' },
  { id: 'ring', need: 'esteem', name: '装身具', type: 'shopping', place: 'market', dur: 25,
    ok: (sim, p) => !p.eq?.accessory && spendable(sim, p) > 150,
    deal: (sim, p) => goodDeal(sim, p, 'jewelry', ['jeweler']),
    fx: (sim, p) => { addItem(p, makeItem('ring', 1)); autoEquip(p); bump(p, { esteem: 35 }); }, txt: '銀の指輪を買った', gossip: '銀の指輪を見せびらかしていた' },
  { id: 'donate', every: 7, need: 'esteem', name: '寄進', type: 'donate', place: 'church', dur: 40,
    deal: (sim, p) => { const s = findSeller(sim, p.s, ['priest', 'nun', 'elder'], p); return { cost: 0, seller: s, alms: true, flex: true }; },
    fx: (sim, p, c, d) => {
      const L = p.lab;
      L.donated = (L.donated || 0) + d.cost;
      bump(p, { esteem: 15 + Math.min(20, d.cost), survival: 5 });
      if (d.seller?.needs) bump(d.seller, { esteem: 4 });
      if (!L.engraved && L.donated >= 150) {
        L.engraved = sim.today;
        p.fame = (p.fame || 0) + 5;
        (p.deeds = p.deeds || []).push(`${sim.townOf(p).name}の教会に寄進を重ね、礼拝堂の石板に名が刻まれた`);
        sim.pushLog(`${sim.fullName(p)}の名が、寄進者として${sim.townOf(p).name}の教会の石板に刻まれた。`, 'event', [p.id], p.pos);
        sim.gossip(p, '教会に寄進して、石板に名を刻まれた', 0.5, sim.nearby ? sim.nearby(p, 8) : [], { silent: true });
      }
    }, txt: (sim, p, c, d) => `教会に${r0(d.cost)}銅貨を寄進した` },
  { id: 'banquet', need: 'esteem', name: '宴', type: 'banquet', place: 'tavern', dur: 150,
    ok: (sim, p) => sim.hour() >= 15 && sim.hour() < 19 && spendable(sim, p) > 150 && (p.lab.banq ?? -99) < sim.today - 8,
    deal: (sim, p) => {
      const s = findSeller(sim, p.s, ['innkeeper', 'cook'], p);
      if (!s) return null;
      const guests = friendsOf(sim, p, 6);
      return guests.length >= 2 ? { cost: 20 + guests.length * (price(sim, p, 'meat') + price(sim, p, 'ale') * 2), seller: s, guests } : null;
    },
    fx: (sim, p, c, d) => {
      p.lab.banq = sim.today;
      bump(p, { esteem: 40, pleasure: 15 });
      p.fame = (p.fame || 0) + 1;
      gather(sim, p, 'banquet', 'tavern', 150, [p.id, ...d.guests.map((q) => q.id)], '宴');
      for (const q of d.guests) { sim.relMut(q, p).a = Math.min(100, sim.rel(q, p).a + 6); sim.remember(q, `${p.given}の宴に招かれた`, { emo: 0.6, imp: 0.45, about: [p.id], k: 'feast' }); }
      // 肉屋にも取り分
      const bt = findSeller(sim, p.s, ['butcher', 'rancher', 'hunter'], p);
      if (bt && d.cost > 20) { const cut = Math.round(d.cost * 0.25); d.seller && sim.hh(d.seller) && (sim.hh(d.seller).money -= cut); earn(sim, bt, cut, 0.4); }
      sim.pushLog(`${sim.fullName(p)}が酒場で宴を開き、${d.guests.map((q) => q.given).join('・')}をもてなした。`, 'event', [p.id, ...d.guests.map((q) => q.id)], p.pos);
    }, txt: (sim, p, c, d) => `酒場で宴を開き、${d.guests.length}人をもてなした` },
  { id: 'houseshow', need: 'esteem', name: '家の見栄', type: 'shopping', place: 'market', dur: 30,
    ok: (sim, p) => { const hh = sim.hh(p); return hh?.house != null && !hh.inn && (hh.comfort || 0) < 6 && spendable(sim, p) > 120; },
    deal: (sim, p) => { const g = sim.rng.chance(0.5) ? 'pottery' : 'furniture'; const d = goodDeal(sim, p, g, g === 'pottery' ? ['potter'] : ['carpenter']); return d ? { ...d, label: g === 'pottery' ? '飾り皿' : '飾り棚' } : null; },
    fx: (sim, p) => { const hh = sim.hh(p); hh.comfort = Math.min(10, (hh.comfort || 0) + 1); bump(p, { esteem: 20 }); }, txt: (sim, p, c, d) => `家に${d.label}を買って飾った`, gossip: '家に立派な飾りを買いそろえた' },
];
const SPEND_BY = Object.fromEntries(SPEND.map((x) => [x.id, x]));
export const SPEND_TYPES = ['dine', 'shopping', 'donate', 'show', 'outing', 'banquet', 'pamper', 'lodge', 'strike'];

function bump(p, d) { if (!p.needs) return; for (const [k, v] of Object.entries(d)) p.needs[k] = clamp((p.needs[k] || 0) + v, 0, 100); }
function gather(sim, p, type, place, mins, ids, label) {
  const from = sim.S.t;
  sim.S.gatherings.push({ type, place, from, to: from + mins, s: p.s, ids, label: label || '' });
}

// ---------- 欲求ごとの「使いたい気持ち」 ----------
function desires(sim, p, ctx) {
  const n = p.needs, L = p.lab, E = p.pers?.E ?? 0.5, O = p.pers?.O ?? 0.5;
  const def = (k) => (100 - (n[k] ?? 100)) / 100;
  const w = {
    hunger: def('hunger') * 0.9 + (ctx.rest ? 0.15 : 0),
    sleep: (p.fatigue || 0) / 120 + ((sim.hh(p)?.bedQ || 0) < 1 ? 0.1 : 0),
    survival: def('survival') * 1.3 + (RISKY.has(p.job) ? 0.15 : 0) + (p.ail ? 0.3 : 0),
    lust: sim.ageOf(p) >= 17 ? def('lust') * (ctx.partner ? 1.1 : 0.7) : 0,
    sloth: def('sloth') * 0.8 + (p.fatigue || 0) / 250,
    pleasure: def('pleasure') * 1.0 + E * 0.25 + O * 0.1 + (ctx.rest ? 0.2 : 0),
    esteem: def('esteem') * (0.5 + L.vanity) + (p.workReason === 'fame' ? 0.2 : 0) + (p.values?.faith ?? 0.3) * 0.1,
  };
  if (L.style === 'miser') { w.esteem *= 0.4; w.pleasure *= 0.5; }
  return w;
}
function makePlan(sim, p, ctx) {
  const L = p.lab;
  const disp = disposable(sim, p);
  if (disp < 3) return null;
  const budget = Math.max(3, disp * STYLE_RATE[L.style] * (1 + (p.pers?.N ?? 0.5) * 0.3));
  ctx.partner = partnerOf(sim, p);
  const w = desires(sim, p, ctx);
  const cats = Object.keys(w).filter((k) => w[k] > 0.12);
  if (!cats.length) return null;
  const R = sim.rng;
  for (let tries = 0; tries < 2 && cats.length; tries++) {
    const cat = R.weighted(cats, (k) => w[k] * w[k]);
    cats.splice(cats.indexOf(cat), 1);
    const items = R.shuffle(SPEND.filter((x) => x.need === cat && (!x.rest || ctx.rest) && (!x.every || (L.last?.[x.id] ?? -99) <= sim.today - x.every) && (!x.ok || x.ok(sim, p, ctx))));
    for (const it of items) {
      const d = it.deal(sim, p, ctx);
      if (!d) continue;
      if (d.flex) d.cost = Math.max(3, Math.min(40, Math.round(Math.min(budget, disp * 0.2) * (0.5 + (p.values?.faith ?? 0.3) * 0.6))));
      if (d.cost > budget) continue;
      const score = 2 + w[cat] * 4.2 * STYLE_APP[L.style];
      return { id: it.id, cat, type: it.type, place: it.place, dur: it.dur, cost: d.cost, score, friend: ctx.partner?.id ?? null, exp: sim.S.t + 120 };
    }
  }
  return null;
}

// ---------- decide から ----------
export function laborCandidates(sim, p, add) {
  const age = sim.ageOf(p), hh = sim.hh(p);
  if (age < 16 || p.jail != null || !hh || hh.bandits || p.mission || p.fight) return;
  const h = sim.hour();
  if (h < 8.5 || h >= 21) return;
  const L = lab(p);
  if (striking(sim, p)) return;
  if (sim.S.t < (L.nextSpend || 0)) return;
  let plan = L.plan && L.plan.exp > sim.S.t ? L.plan : null;
  const rest = restDayFor(sim, p);
  if (!plan) {
    ensureLabor(sim);
    plan = makePlan(sim, p, { rest }) || { none: true, exp: sim.S.t + 150 };
    L.plan = plan;
  }
  if (plan.none) return;
  const workday = !rest && h >= 7 && h < 17 && p.job && p.workedToday < 6 * 60;
  const score = plan.score + (rest ? 1.2 : 0) + (h >= 17 ? 0.6 : 0) - (workday ? 1.5 : 0);
  let place;
  if (plan.place === 'far') place = sim.strollSpot(p);
  else place = sim.placeFor(p, plan.place);
  add(score, plan.type, place, plan.dur, { friend: plan.friend });
}

// ---------- arrive から ----------
export function laborArrive(sim, p) {
  const a = p.action;
  if (!a || !SPEND_TYPES.includes(a.type) || a.type === 'strike') return;
  const L = lab(p);
  const plan = L.plan;
  if (!plan || plan.none || plan.type !== a.type) return;   // 宴や逢い引きに招かれた側（自分の計画ではない）
  L.plan = null;
  ensureLabor(sim);
  const it = SPEND_BY[plan.id];
  if (!it) return;
  const ctx = { rest: restDayFor(sim, p), partner: plan.friend != null ? sim.S.people[plan.friend] : null };
  if (it.partner && !alive(ctx.partner)) return;
  const d = it.deal(sim, p, ctx);
  const disp = disposable(sim, p);
  if (!d) { L.nextSpend = sim.S.t + 120; return; }
  if (d.flex) d.cost = plan.cost;
  if (d.cost > disp + 2) {
    L.nextSpend = sim.S.t + 240;
    if (sim.rng.chance(0.3)) sim.remember(p, `${it.name}に手が出なかった。懐がさびしい`, { emo: -0.3, imp: 0.25, k: 'spend' });
    return;
  }
  if (d.stock) { const m = sim.market(p.s); m.stock[d.stock] = Math.max(0, (m.stock[d.stock] || 0) - 1); }
  if (d.alms) { pay(sim, p, d.cost); sim.S.towns[p.s].alms = (sim.S.towns[p.s].alms || 0) + d.cost; recordSpend(sim, p, d.cost, it.need); }
  else if (d.margin != null) {
    // 市場の在庫から買う：商人の取り分だけが商人に、残りは市場の仕入れ（作り手に払われた分）として町の蓄えへ戻す
    transfer(sim, p, d.cost, null, it.need);
    const cut = Math.round(d.cost * d.margin * 10) / 10;
    sim.S.towns[p.s].fund -= cut;
    if (d.seller && sim.hh(d.seller)) { earn(sim, d.seller, cut, 0.4); sim.S.labor.income[d.seller.job] = (sim.S.labor.income[d.seller.job] || 0) + cut; } else sim.S.towns[p.s].fund += cut;
  } else transfer(sim, p, d.cost, d.seller, it.need);
  it.fx(sim, p, ctx, d);
  (L.last || (L.last = {}))[it.id] = sim.today;
  const txt = typeof it.txt === 'function' ? it.txt(sim, p, ctx, d) : it.txt;
  const big = d.cost >= 25;
  if (txt && (big || sim.rng.chance(0.5))) sim.remember(p, txt, { emo: 0.4 + (big ? 0.1 : 0), imp: big ? 0.45 : 0.3, k: 'spend', about: d.seller ? [d.seller.id] : [] });
  if (it.gossip && sim.nearby) sim.gossip(p, it.gossip, 0.25, sim.nearby(p, 8), { silent: true });
  if (big && sim.rng.chance(0.5)) sim.pushLog(`${sim.fullName(p)}が${it.name}に${r0(d.cost)}銅貨を使った${d.seller ? `（${jobName(d.seller.job)}の${d.seller.given}へ）` : ''}。`, 'event', [p.id, ...(d.seller ? [d.seller.id] : [])], p.pos);
  L.nextSpend = sim.S.t + STYLE_WAIT[L.style] * 60 * (0.7 + sim.rng.next() * 0.6);
}
function recordSpend(sim, p, amt, cat) {
  const L = lab(p), si = sim.seasonIdx() + sim.year() * 4;
  if (L.spent.season !== si) L.spent = { season: si };
  L.spent[cat] = (L.spent[cat] || 0) + amt;
  L.total = (L.total || 0) + amt;
  sim.S.labor.flow[cat] = (sim.S.labor.flow[cat] || 0) + amt;
}

// ---------- doAction から ----------
export function laborDo(sim, p, dt) {
  const a = p.action;
  if (!a) return;
  const hr = dt / 60, n = p.needs;
  switch (a.type) {
    case 'dine': n.pleasure += 6 * hr; n.esteem += 1 * hr; break;
    case 'shopping': n.pleasure += 5 * hr; break;
    case 'donate': n.pleasure += 3 * hr; n.survival += 4 * hr; break;
    case 'show': n.pleasure += 22 * hr; break;
    case 'outing': n.pleasure += 14 * hr; n.sloth += 10 * hr; p.fatigue = Math.max(0, (p.fatigue || 0) - 3 * hr); break;
    case 'banquet': n.pleasure += 20 * hr; n.esteem += 5 * hr; n.hunger += 30 * hr; break;
    case 'pamper': n.sloth += 12 * hr; break;
    case 'lodge': n.sloth += 10 * hr; n.sleep += 10 * hr; break;
    case 'strike': n.esteem += 2 * hr; n.sloth += 3 * hr; break;
  }
}

// ---------- 毎日（newDay の最初。p.workedToday は前の日の分） ----------
export function laborDaily(sim) {
  const S = sim.S, R = sim.rng;
  const LS = ensureLabor(sim);
  ensureTaxes(sim);
  // 家ごとの取り置き（食べ物代・税・借金）
  for (const hh of Object.values(S.households)) {
    const due = taxDue(sim, hh);
    hh.labRes = Math.round(25 + hh.members.length * 12 + due * 1.2);
  }
  for (const k of S.kingdoms) kingRestPolicy(sim, k);
  const people = sim.living();
  const wd = { n: 0, h3: 0, h9: 0, sum: 0 };
  for (const p of people) if (p.job && p.jail == null && sim.ageOf(p) >= 16 && sim.ageOf(p) < 68) { const w = p.workedToday || 0; wd.n++; wd.sum += w; if (w >= 180) wd.h3++; if (w >= 540) wd.h9++; }
  LS.worked = { day: sim.today - 1, avgH: Math.round(wd.sum / Math.max(1, wd.n) / 6) / 10, over3h: wd.h3, over9h: wd.h9, n: wd.n };
  for (const p of people) {
    if (!p.needs) continue;
    const age = sim.ageOf(p);
    if (age < 14) continue;
    const L = lab(p);
    const hh = sim.hh(p);
    const worked = p.workedToday || 0;
    const wasRest = !!L.restY;
    if (p.job && age < 68 && p.jail == null) {
      if (worked >= 180) L.streak++; else L.streak = 0;
      if (wasRest && worked >= 180) { L.missed++; if (L.restWork === sim.today - 1) LS.stats.restWork++; }
      else if (wasRest) L.missed = Math.max(0, L.missed - 2);
      const k = sim.kingdomOf(p);
      const every = k ? restEvery(sim, k, p.s, GROUP_OF[p.job]) : 5;
      // 疲れ：働いた時間でたまり、休むと抜ける
      const heavy = HEAVY.has(p.job) ? 1.2 : 1;
      const cart = L.cart === sim.today - 1 ? 0.6 : 1;
      const loveM = p.workReason === 'love' ? 0.8 : 1;
      const old = age >= 55 ? 1.25 : 1;
      const bed = [0, 3, 6][sim.hh(p)?.bedQ || 0] || 0;
      let f = (p.fatigue || 0) + (worked / 60) * 4.6 * heavy * cart * loveM * old - 24 - bed - (wasRest && worked < 60 ? 16 : 0) - (L.hobby && worked < 300 ? 3 : 0);
      if (p.ail) f += 4;
      p.fatigue = clamp(f, 0, 100);
      // 不満：休めない・働きづめ・重い税・貧しさ
      const kl = k ? kLabor(sim, k) : null;
      const taxLv = k?.taxes?.lv || 1;
      const taxPain = hh ? clamp(taxDue(sim, hh) / Math.max(20, hh.money), 0, 1.5) * Math.max(0, taxLv - 0.9) : 0;
      let g = L.gripe * 0.93
        + Math.max(0, L.streak - every) * 2.4
        + Math.max(0, p.fatigue - 55) / 6
        + (wasRest && worked >= 180 && L.restWork === sim.today - 1 ? 6 : 0)
        + taxPain * 8 + Math.max(0, taxLv - 1.3) * 2.5
        + (hh && hh.money < 20 ? 1.5 : 0)
        + (kl && kl.every >= 7 ? 0.6 : 0)
        - (wasRest && worked < 60 ? 6 : 0)
        - (p.mood > 70 ? 1.5 : 0);
      if (p.workReason === 'love') g *= 0.75;
      if (p.workReason === 'duty') g *= 0.85;
      L.gripe = clamp(g, 0, 100);
      L.bad = L.gripe >= 70 ? (L.bad || 0) + 1 : 0;
      // 働きづめで体をこわす
      if (p.fatigue > 70 && !p.ail && R.chance((p.fatigue - 62) / 900)) {
        if (fallIll(sim, p, R.chance(0.7) ? 'cold' : 'fever', { txt: '働きづめで、とうとう体をこわした' })) LS.stats.sick = (LS.stats.sick || 0) + 1;
      }
      if (p.fatigue > 85 && R.chance(0.15)) sim.remember(p, '体が鉛のように重い。休みがほしい', { emo: -0.5, imp: 0.35, k: 'labor' });
    }
    // 働く理由
    p.workReason = p.job && age < 68 ? reasonOf(sim, p, hh) : null;
    L.press = p.workReason ? PRESS[p.workReason] + (p.workReason === 'tax' && (sim.kingdomOf(p)?.taxes?.lv || 1) > 1.6 ? 0.1 : 0) : 0;
    L.restY = restDayFor(sim, p);
    if (L.wprep && !(S.pendingWeddings || []).some((w) => w.a === p.id || w.b === p.id)) L.wprep = false;
  }
  passiveSpending(sim);
  wagesDaily(sim);
  strikesDaily(sim);
  quitDaily(sim);
  // 古い取り決めの掃除
  for (const [key, o] of Object.entries(LS.rest)) if (o.until < sim.today) delete LS.rest[key];
  for (const [key, o] of Object.entries(LS.wage)) if (o.until < sim.today) delete LS.wage[key];
  LS.strikes = LS.strikes.filter((st) => st.state === 'on' || st.state === 'talk' || sim.today - st.day < 30);
}

// 家で決まって払うもの：荷車やロバを借りる・裕福な家の手伝い・用心棒
function passiveSpending(sim) {
  const S = sim.S, R = sim.rng;
  const today = sim.today;
  for (const p of sim.living()) {
    if (!p.lab || !p.job || p.jail != null || sim.ageOf(p) < 16) continue;
    const L = p.lab;
    // 力仕事の人：疲れていたら荷車やロバを借りる
    if (HEAVY.has(p.job) && (p.fatigue || 0) > 40 && !L.restY && L.style !== 'miser' && disposable(sim, p) > 10 && R.chance(0.35)) {
      const s = findSeller(sim, p.s, ['stablehand', 'coachman', 'rancher', 'shepherd'], p);
      if (s) { transfer(sim, p, 3, s, 'sloth'); L.cart = today; if (R.chance(0.2)) sim.remember(p, `${s.given}からロバを借りて、荷運びを楽にした`, { emo: 0.2, imp: 0.2, about: [s.id], k: 'spend' }); }
    }
    // 盗みや襲撃にあった裕福な人は、用心棒を雇う
    if ((L.guard?.until ?? -1) < today && disposable(sim, p) > 60 && p.memories?.some((m) => ['theft', 'robbed'].includes(m.k) && today - m.t < 6)) {
      const g = findSeller(sim, p.s, ['militia', 'adventurer', 'warrior', 'watchman'], p);
      if (g) { transfer(sim, p, 10, g, 'survival'); L.guard = { id: g.id, until: today + 3 }; bump(p, { survival: 30 }); sim.remember(p, `物騒なので、${jobName(g.job)}の${g.given}を用心棒に雇った`, { emo: 0.2, imp: 0.4, about: [g.id], k: 'spend' }); }
    }
  }
  // 裕福な家は手伝いを雇う（週ごとの約束で、毎日給金を払う）
  for (const hh of Object.values(S.households)) {
    if (hh.bandits || hh.house == null || hh.inn) continue;
    const head = headOf(sim, hh);
    if (!head || !head.needs) continue;
    const h = hh.labHelp;
    if (h) {
      const q = S.people[h.pid];
      if (!alive(q) || h.until < today || hh.money < 120 || q.jail != null) {
        if (alive(q) && h.until >= today) sim.remember(q, `${hh.name}の手伝いの口がなくなった`, { emo: -0.3, imp: 0.3, k: 'work' });
        delete hh.labHelp;
      } else {
        const wage = 4;
        hh.money -= wage; const qh = sim.hh(q); if (qh) qh.money += wage; else q.purse = (q.purse || 0) + wage;
        recordSpend(sim, head, wage, 'sloth');
        for (const id of hh.members) { const m = S.people[id]; if (alive(m) && m.needs) { m.needs.sloth = Math.min(100, m.needs.sloth + 8); m.fatigue = Math.max(0, (m.fatigue || 0) - 3); } }
        hh.laundry = 0; hh.water = Math.max(hh.water ?? 5, 8);
        continue;
      }
    }
    const style = lab(head).style;
    const need = style === 'spender' ? 350 : style === 'miser' ? 1e9 : style === 'thrifty' ? 700 : 480;
    if (hh.money < need || hh.royal) continue;
    const pool = (sellers(sim).poor[hh.s] || []).filter((q) => q.hh !== hh.id && !hh.members.includes(q.id) && sim.ageOf(q) >= 14 && !Object.values(S.households).some((o) => o.labHelp?.pid === q.id));
    if (!pool.length) continue;
    const q = R.pick(pool);
    hh.labHelp = { pid: q.id, until: today + 7 };
    sim.remember(head, `${q.given}を家の手伝いに雇った`, { emo: 0.3, imp: 0.35, about: [q.id], k: 'spend' });
    sim.remember(q, `${hh.name}に手伝いとして雇われた。日に4銅貨になる`, { emo: 0.5, imp: 0.45, about: [head.id], k: 'work' });
  }
}

// 勝ち取った賃上げ：雇い主（親方・町・国）が毎日上乗せ分を払う
function wagesDaily(sim) {
  const S = sim.S, LS = S.labor;
  for (const [key, o] of Object.entries(LS.wage)) {
    if (o.until < sim.today) continue;
    const [sid, group] = key.split(':');
    const members = sim.living().filter((q) => q.s === +sid && GROUP_OF[q.job] === group && (q.workedToday || 0) >= 240 && q.hh !== o.masterHh);
    if (!members.length) continue;
    const bonus = Math.round((o.mul - 1) * 16 * 10) / 10;
    const total = bonus * members.length;
    let ok = true;
    if (o.payer === 'crown') { const k = S.kingdoms[sim.town(+sid).kingdom]; if (k.treasury < total + 100) ok = false; else k.treasury -= total; }
    else if (o.payer === 'town') { const t = S.towns[+sid]; if (t.fund < total) ok = false; else t.fund -= total; }
    else { const mh = S.households[o.masterHh]; if (!mh || mh.money < total + 40) ok = false; else mh.money -= total; }
    if (!ok) {
      delete LS.wage[key];
      for (const q of members) { q.lab && (q.lab.gripe = clamp(q.lab.gripe + 12, 0, 100)); if (sim.rng.chance(0.4)) sim.remember(q, '約束の上乗せが払われなくなった', { emo: -0.6, imp: 0.5, k: 'labor' }); }
      sim.pushLog(`${sim.town(+sid).name}で、${GROUP_NAME[group]}への上乗せの給金が払えなくなった。`, 'event', [], sim.town(+sid));
      continue;
    }
    for (const q of members) earn(sim, q, bonus, 0.5);
  }
}

// ---------- 王が決める休日 ----------
function announce(sim, k, txt, imp = 1) { sim.news(txt, imp, sim.town(k.capital)); }
function setEvery(sim, k, every, why) {
  const kl = kLabor(sim, k), king = sim.S.people[k.kingId];
  every = clamp(Math.round(every), 3, 7);
  if (every === kl.every) return false;
  const more = every < kl.every;
  kl.every = every; kl.anchor = sim.today + 1; kl.lastReview = sim.today;
  kl.log.push({ d: sim.today, every, why }); if (kl.log.length > 8) kl.log.shift();
  sim.S.labor.stats.decrees = (sim.S.labor.stats.decrees || 0) + 1;
  announce(sim, k, `${k.name}の${title(king)}${king?.given || ''}が「休日は${every}日に1度」と定めた（${why}）`, 1);
  const R = sim.rng;
  for (const p of sim.living()) {
    if (sim.town(p.s).kingdom !== k.id || !sim.isAdult(p) || !R.chance(0.3)) continue;
    sim.remember(p, more ? `${title(king)}さまのお触れで、休みの日が増えた` : `${title(king)}さまのお触れで、休みの日が減らされた（${why}）`, { emo: more ? 0.5 : -0.5, imp: 0.45, k: 'labor' });
    if (p.lab) p.lab.gripe = clamp(p.lab.gripe + (more ? -6 : 6), 0, 100);
  }
  for (const s of sim.S.world.settlements) if (s.kingdom === k.id && sim.S.towns[s.id].unrest != null) sim.S.towns[s.id].unrest = clamp(sim.S.towns[s.id].unrest + (more ? -4 : 3), 0, 100);
  return true;
}
function kingRestPolicy(sim, k) {
  const S = sim.S, kl = kLabor(sim, k), king = S.people[k.kingId], R = sim.rng;
  // 王が代わったら、新しい王の考えで決め直す
  if (kl.kingId !== k.kingId) {
    kl.kingId = k.kingId; kl.base = kingEvery(king); kl.duty = kingDuty(king);
    setEvery(sim, k, kl.base, '新しい王の方針');
  }
  // 臨時の休日：王の祝宴・戦の終わり
  const warNow = !!k.war;
  if (kl._war && !warNow) { kl.holiday = { day: sim.today + 1, why: '戦の終わりを祝って' }; }
  else if (k.lastFeast != null && k.lastFeast === sim.today - 1 && kl._feast !== k.lastFeast) { kl._feast = k.lastFeast; kl.holiday = { day: sim.today + 1, why: '王の祝宴を祝って' }; }
  if (kl.holiday && kl.holiday.day === sim.today + 1 && !kl.holiday.told) {
    kl.holiday.told = true; S.labor.stats.holidays = (S.labor.stats.holidays || 0) + 1;
    announce(sim, k, `${k.name}で、明日は臨時の休日と布告された（${kl.holiday.why}）`, 1);
  }
  kl._war = warNow;
  if (!king) return;
  // 5日ごとに見直す（休日の当日は変えない）
  if (sim.today - kl.lastReview < 5 || laborRestDay(sim, k.capital)) return;
  kl.lastReview = sim.today;
  const A = king.pers?.A ?? 0.5;
  const unrest = kingdomUnrest(sim, k);
  const strikes = S.labor.strikes.filter((st) => st.state === 'on' && sim.town(st.sid).kingdom === k.id).length;
  let target = kl.base, why = 'いつもの決まりに戻す';
  if (warNow) { target = kl.base + 2; why = '戦のため'; }
  else if (k.treasury < 300) { target = kl.base + 1; why = '国庫が乏しいため'; }
  if (!warNow && unrest + strikes * 12 > 45 - A * 15 && A > 0.3) { target = Math.min(target, kl.base) - 1; why = '民の疲れを聞いて'; }
  else if (!warNow && k.treasury > 1800 && A > 0.55 && R.chance(0.3)) { target = kl.base - 1; why = '国が豊かなので'; }
  // 戦のときは軍需の職にも休日の当番を命じる
  setEvery(sim, k, target, why);
}

// ---------- ストライキ ----------
function employerOf(sim, st) {
  const S = sim.S, s = sim.town(st.sid), k = S.kingdoms[s.kingdom];
  // 始まったときに決めた相手と、最後まで交渉する
  if (st.empKind) {
    const who = S.people[st.empId];
    if (st.empKind === 'crown') return { kind: 'crown', who: S.people[k.kingId], name: title(S.people[k.kingId]), wealth: k.treasury / 1500, k };
    if (st.empKind === 'master' && alive(who) && S.households[st.empHh]) return { kind: 'master', who, hh: S.households[st.empHh], name: st.emp, wealth: S.households[st.empHh].money / 400, k };
    if (st.empKind === 'town') return { kind: 'town', who: alive(who) ? who : null, name: st.emp, wealth: S.towns[st.sid].fund / 400, k };
  }
  if (st.demand === 'tax' || st.group === 'mine') return { kind: 'crown', who: S.people[k.kingId], name: `${title(S.people[k.kingId])}`, wealth: k.treasury / 1500, k };
  if (st.group === 'labor') {
    const boss = sim.living().find((q) => q.s === st.sid && ['overseer', 'elder'].includes(q.job)) || sim.living().find((q) => q.s === s.id && q.rank === 'noble');
    return { kind: 'town', who: boss, name: boss ? `${jobName(boss.job)}の${boss.given}` : '町の役人', wealth: S.towns[st.sid].fund / 400, k };
  }
  // 親方・地主・船主：同じ筋でいちばん裕福な家（ストライキに加わっていない家）
  const pool = Object.values(S.households).filter((h) => h.s === st.sid && !h.bandits && !h.royal && h.money > 150 && !st.ids.some((id) => S.people[id]?.hh === h.id)
    && (st.group === 'farm' ? (h.land || 0) > 0 : h.members.some((id) => GROUP_OF[S.people[id]?.job] === st.group || S.people[id]?.job === 'merchant' || S.people[id]?.job === 'captain')));
  pool.sort((a, b) => b.money - a.money);
  const mh = pool[0];
  const head = mh ? headOf(sim, mh) : null;
  if (mh && head) return { kind: 'master', who: head, hh: mh, name: `${st.group === 'farm' ? '地主' : st.group === 'sea' ? '船主' : '親方'}の${head.given}`, wealth: mh.money / 400, k };
  const boss = sim.living().find((q) => q.s === st.sid && q.job === 'elder');
  return { kind: 'town', who: boss, name: boss ? `村長の${boss.given}` : '町の役人', wealth: S.towns[st.sid].fund / 400, k };
}
function strikesDaily(sim) {
  const S = sim.S, LS = S.labor, R = sim.rng;
  // 進行中のストライキ
  for (const st of LS.strikes) {
    if (st.state === 'talk') {
      st.state = 'on'; st.onDay = sim.today;
      for (const id of st.ids) { const q = S.people[id]; if (alive(q) && q.lab) q.lab.strike = st.id; }
      const lead = S.people[st.leader];
      const s = sim.town(st.sid);
      const emp = employerOf(sim, st);
      st.emp = emp.name; st.empKind = emp.kind; st.empId = emp.who?.id ?? null; st.empHh = emp.hh?.id ?? null;
      sim.news(`${s.name}の${GROUP_NAME[st.group]}がストライキに入った！${lead ? sim.fullName(lead) + 'らが' : ''}${emp.name}に${DEMAND_JP[st.demand]}を求めている`, 2, s);
      LS.stats.strikes = (LS.stats.strikes || 0) + 1;
      for (const id of st.ids) { const q = S.people[id]; if (alive(q)) sim.remember(q, `仲間と仕事を止めて、${emp.name}に${DEMAND_JP[st.demand]}を求めた`, { emo: 0.1, imp: 0.75, k: 'strike', about: lead ? [lead.id] : [] }); }
      if (S.towns[st.sid].unrest != null) S.towns[st.sid].unrest = clamp(S.towns[st.sid].unrest + 3, 0, 100);
    }
    if (st.state !== 'on') continue;
    const s = sim.town(st.sid);
    st.ids = st.ids.filter((id) => { const q = S.people[id]; return alive(q) && q.jail == null && q.lab?.strike === st.id; });
    // 蓄えの尽きた者から、しかたなく仕事に戻る
    for (const id of st.ids.slice()) {
      const q = S.people[id], hh = sim.hh(q);
      if (hh && hh.money < 12 && R.chance(0.5)) { q.lab.strike = null; st.ids.splice(st.ids.indexOf(id), 1); sim.remember(q, '蓄えが尽きて、ストライキから抜けて仕事に戻った', { emo: -0.4, imp: 0.5, k: 'strike' }); }
    }
    const days = sim.today - st.onDay;
    if (st.ids.length < 2) { endStrike(sim, st, 'fizzled'); continue; }
    // 広場に集まる（9〜15時）
    const from = sim.dayIndex * 1440 + 9 * 60;
    S.gatherings.push({ type: 'strike', place: 'plaza', from, to: from + 6 * 60, s: st.sid, ids: st.ids.slice(), label: 'ストライキ' });
    if (S.towns[st.sid].unrest != null) S.towns[st.sid].unrest = clamp(S.towns[st.sid].unrest + 1, 0, 100);
    if (days >= 1 && (R.chance(0.55) || days >= 4)) resolveStrike(sim, st);
  }
  // 新しいストライキ：同じ町・同じ筋の仲間の不満が高い
  const groups = {};
  for (const p of sim.living()) {
    const g = GROUP_OF[p.job];
    if (!g || !p.lab || p.jail != null || sim.ageOf(p) < 16 || sim.ageOf(p) >= 65 || p.lab.strike != null || p.mission) continue;
    const key = `${p.s}:${g}`;
    (groups[key] || (groups[key] = [])).push(p);
  }
  for (const [key, list] of Object.entries(groups)) {
    if (list.length < 3) continue;
    const [sid, group] = key.split(':');
    if (S.towns[+sid].occupied) continue;
    if (LS.strikes.some((st) => st.sid === +sid && st.group === group && (st.state === 'on' || st.state === 'talk' || sim.today - st.day < 12))) continue;
    const avg = list.reduce((a, q) => a + q.lab.gripe, 0) / list.length;
    const hot = list.filter((q) => q.lab.gripe >= 60);
    if (avg < 48 || hot.length < Math.max(2, list.length * 0.4)) continue;
    // 話し合い：勇気と不満のある者が音頭をとる
    const leader = hot.slice().sort((a, b) => (b.values.courage + b.lab.gripe / 100 + b.values.ambition * 0.5) - (a.values.courage + a.lab.gripe / 100 + a.values.ambition * 0.5))[0];
    if (leader.values.courage < 0.3 && !R.chance(0.3)) continue;
    const join = list.filter((q) => q.lab.gripe >= 45 || (q.rel?.[leader.id]?.a || 0) > 40 || R.chance(0.2));
    if (join.length < 3) continue;
    const k = S.kingdoms[sim.town(+sid).kingdom];
    const taxShare = join.filter((q) => q.workReason === 'tax').length / join.length;
    const restScore = join.reduce((a, q) => a + q.lab.missed + Math.max(0, q.lab.streak - kLabor(sim, k).every), 0) / join.length / 4;
    const poorShare = join.filter((q) => (sim.hh(q)?.money || 0) < 40).length / join.length;
    const sc = { tax: (k.taxes?.lv || 1) >= 1.2 ? taxShare * 1.3 : 0, rest: restScore, wage: poorShare + 0.2 };
    const demand = Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
    const st = { id: LS.seq++, sid: +sid, group, ids: join.map((q) => q.id), leader: leader.id, demand, day: sim.today, state: 'talk' };
    LS.strikes.push(st);
    const s = sim.town(+sid);
    const eve = sim.dayIndex * 1440 + 19 * 60;
    S.gatherings.push({ type: 'tavern', place: 'tavern', from: eve, to: eve + 120, s: +sid, ids: st.ids.slice(), label: '寄り合い' });
    for (const q of join) sim.remember(q, `${leader.given}の呼びかけで仲間と酒場に集まり、明日から仕事を止めると決めた（${DEMAND_JP[demand]}を求めて）`, { emo: 0, imp: 0.6, k: 'strike', about: [leader.id] });
    sim.pushLog(`${s.name}の${GROUP_NAME[group]}が、${leader.given}を中心に仕事を止める相談をしている。`, 'event', [leader.id], s);
  }
}
function resolveStrike(sim, st) {
  const S = sim.S, R = sim.rng, LS = S.labor;
  const emp = employerOf(sim, st), boss = emp.who, s = sim.town(st.sid), t = S.towns[st.sid];
  const A = boss?.pers?.A ?? 0.5;
  const share = st.ids.length / Math.max(1, sim.living().filter((q) => q.s === st.sid && GROUP_OF[q.job] === st.group).length);
  const accept = A * 0.7 + clamp(emp.wealth, 0, 1.2) * 0.35 - (emp.k.war ? 0.25 : 0) + share * 0.2 + (st.demand === 'tax' ? -0.1 : 0) + R.range(-0.15, 0.15);
  const harsh = (1 - A) * 0.8 + (emp.kind === 'crown' ? 0.15 : 0) - clamp(emp.wealth, 0, 1) * 0.1 + R.range(-0.1, 0.1);
  const lawful = sim.living().filter((q) => (q.s === st.sid || q.s === emp.k.capital) && LAWFUL.has(q.job) && q.jail == null && !q.fight && !q.mission);
  const days = sim.today - st.onDay;
  if (accept > 0.72) grant(sim, st, emp, true);
  else if (accept > 0.45) grant(sim, st, emp, false);
  else if (harsh > 0.55 && (emp.kind !== 'master' ? lawful.length : 1) > 0) crush(sim, st, emp, lawful);
  else if (days >= 4) endStrike(sim, st, 'fizzled', emp);
  else if (R.chance(0.5)) sim.pushLog(`${s.name}の${GROUP_NAME[st.group]}のストライキは${days + 1}日目。${emp.name}は首を縦に振らない。`, 'event', [st.leader], s);
}
function grant(sim, st, emp, full) {
  const S = sim.S, LS = S.labor, s = sim.town(st.sid), t = S.towns[st.sid], k = emp.k;
  const key = `${st.sid}:${st.group}`;
  let what = '';
  if (st.demand === 'wage') {
    LS.wage[key] = { mul: full ? 1.25 : 1.12, payer: emp.kind, masterHh: emp.hh?.id ?? null, until: sim.today + 20 };
    what = full ? '給金の上乗せ' : '少しばかりの上乗せ';
  } else if (st.demand === 'rest') {
    const every = Math.max(3, kLabor(sim, k).every - (full ? 2 : 1));
    LS.rest[key] = { every, until: sim.today + 20 };
    what = `${every}日に1度の休み`;
  } else {
    k.taxes = k.taxes || {};
    k.taxes.relief = k.taxes.relief || {};
    k.taxes.relief[st.sid] = sim.today + (full ? 15 : 8);
    what = full ? `${s.name}の税の減免` : `${s.name}の税の一時的な減免`;
  }
  for (const id of st.ids) { const q = S.people[id]; if (!alive(q)) continue; q.lab.gripe = clamp(q.lab.gripe - (full ? 30 : 15), 0, 100); sim.remember(q, `ストライキで${what}を勝ち取った`, { emo: full ? 0.8 : 0.4, imp: 0.7, k: 'strike' }); if (emp.who) sim.relMut(q, emp.who).a += full ? 4 : 1; }
  if (t.unrest != null) t.unrest = clamp(t.unrest - (full ? 8 : 4), 0, 100);
  if (emp.who) sim.remember(emp.who, `${s.name}の${GROUP_NAME[st.group]}の求めに応じ、${what}を認めた`, { emo: full ? 0.1 : -0.1, imp: 0.5, k: 'strike' });
  sim.news(`${s.name}のストライキが終わった。${emp.name}が${what}を${full ? '認めた' : 'しぶしぶ認めた'}`, 2, s);
  if (full) sim.chron(`${s.name}の${GROUP_NAME[st.group]}がストライキで${what}を勝ち取った`, k.id);
  LS.stats[full ? 'won' : 'partial'] = (LS.stats[full ? 'won' : 'partial'] || 0) + 1;
  endStrike(sim, st, full ? 'won' : 'partial', emp, true);
}
function crush(sim, st, emp, lawful) {
  const S = sim.S, LS = S.labor, R = sim.rng, s = sim.town(st.sid), t = S.towns[st.sid];
  const lead = S.people[st.leader];
  let jailed = false;
  if (emp.kind === 'master') {
    // 親方は兵を動かせない：首謀者を辞めさせる（しばらく働けない）
    if (alive(lead)) { lead.lab.fired = sim.today + 6; sim.remember(lead, `${emp.name}に「二度と来るな」と追い出された`, { emo: -0.8, imp: 0.8, k: 'strike', about: emp.who ? [emp.who.id] : [] }); if (emp.who) sim.relMut(lead, emp.who).a -= 25; }
    sim.news(`${s.name}で、${emp.name}がストライキの音頭をとった${lead ? lead.given : '者'}を辞めさせた`, 2, s);
  } else {
    const g = lawful[0];
    if (alive(lead) && lead.jail == null && g) { markWanted(sim, lead, 'ストライキの扇動', 5); arrest(sim, g, lead); jailed = true; }
    sim.news(`${s.name}のストライキは力ずくで解散させられた${jailed ? `。首謀者の${lead.given}は牢へ送られた` : ''}`, 3, s);
    sim.chron(`${s.name}の${GROUP_NAME[st.group]}のストライキが${emp.name}によって弾圧された`, emp.k.id);
  }
  for (const id of st.ids) { const q = S.people[id]; if (!alive(q)) continue; q.lab.gripe = clamp(q.lab.gripe + 15, 0, 100); sim.remember(q, jailed ? `仲間の${lead.given}が捕まった。こんなことが許されるのか` : 'ストライキは押しつぶされた', { emo: -0.8, imp: 0.75, k: 'strike' }); if (emp.who) sim.relMut(q, emp.who).a -= 10; }
  if (t.unrest != null) t.unrest = clamp(t.unrest + (jailed ? 15 : 8), 0, 100);
  LS.stats.crushed = (LS.stats.crushed || 0) + 1;
  // 弾圧が火種になって暴動へ（taxes.js の暴動の流れに乗せる）
  if (t.unrest != null && t.unrest >= 50 && sim.today - (t.riotDay ?? -99) >= 6 && R.chance(0.35 + (t.unrest - 50) / 80)) strikeRiot(sim, st, s, t);
  endStrike(sim, st, 'crushed', emp, true);
}
function strikeRiot(sim, st, s, t) {
  const S = sim.S, R = sim.rng;
  const mob = st.ids.map((id) => S.people[id]).filter((q) => alive(q) && q.jail == null);
  for (const q of R.shuffle(sim.living().filter((q) => q.s === s.id && sim.isAdult(q) && q.jail == null && !LAWFUL.has(q.job) && (q.lab?.gripe || 0) > 45 && !mob.includes(q))).slice(0, 8)) mob.push(q);
  if (mob.length < 3) return;
  const leader = mob.slice().sort((a, b) => b.values.courage - a.values.courage)[0];
  const day = sim.today + 1;
  t.riotDay = day; t.riotLeader = leader.id;   // taxes.js の taxesHourly が、この日の15時と17時に衛兵とのもみ合いと首謀者の捕縛を行う
  const from = day * 1440 + 13 * 60;
  S.gatherings.push({ type: 'riot', place: 'plaza', from, to: from + 4 * 60, s: s.id, ids: mob.map((q) => q.id), label: '暴動' });
  if (S.tax?.stats) S.tax.stats.riots++;
  S.labor.stats.riots = (S.labor.stats.riots || 0) + 1;
  sim.news(`${s.name}では弾圧に怒った人々が、明日広場へ押しかけると息巻いている`, 3, s);
  for (const q of mob) sim.remember(q, 'ストライキの弾圧に怒って、明日みんなで広場へ押しかけると決めた', { emo: -0.2, imp: 0.8, k: 'strike' });
}
function endStrike(sim, st, how, emp, quiet) {
  const S = sim.S, LS = S.labor, s = sim.town(st.sid);
  st.state = how; st.end = sim.today;
  for (const id of st.ids) { const q = S.people[id]; if (q?.lab && q.lab.strike === st.id) q.lab.strike = null; }
  // 今日の分の集まりを消す
  S.gatherings = S.gatherings.filter((g) => !(g.type === 'strike' && g.s === st.sid && g.from >= sim.dayIndex * 1440));
  if (how === 'fizzled') {
    LS.stats.fizzled = (LS.stats.fizzled || 0) + 1;
    for (const id of st.ids) { const q = S.people[id]; if (alive(q)) { q.lab.gripe = clamp(q.lab.gripe + 8, 0, 100); sim.remember(q, '何も得られないまま、ストライキは立ち消えになった', { emo: -0.5, imp: 0.55, k: 'strike' }); } }
    if (S.towns[st.sid].unrest != null) S.towns[st.sid].unrest = clamp(S.towns[st.sid].unrest + 5, 0, 100);
    if (!quiet) sim.pushLog(`${s.name}の${GROUP_NAME[st.group]}のストライキは、何も得られずに立ち消えた。`, 'event', [st.leader], s);
  }
}

// 燃え尽きた力仕事の人が、体の楽な仕事へ移る
function quitDaily(sim) {
  const S = sim.S, R = sim.rng, LS = S.labor;
  const cnt = {};
  for (const q of sim.living()) if (q.job) { const c = cnt[q.s] || (cnt[q.s] = {}); c[q.job] = (c[q.job] || 0) + 1; }
  const moved = new Set();
  for (const p of sim.living()) {
    const L = p.lab;
    if (!L || (L.bad || 0) < 5 || !HEAVY.has(p.job) || !GROUP_OF[p.job] || moved.has(p.s) || p.workReason === 'love' || p.shop != null || p.appr) continue;
    const age = sim.ageOf(p);
    if (age < 18 || age > 50 || p.jail != null || L.strike != null || !R.chance(0.12)) continue;
    const type = sim.town(p.s).type;
    const quota = JOB_QUOTA[type] || {};
    const c = cnt[p.s] || {};
    if ((c[p.job] || 0) - 1 < (quota[p.job] || 0)) continue;   // 抜けると町が困る
    const opts = LIGHT.filter((j) => j !== p.job && JOBS[j] && (p.sex === 'f' || !WOMEN.includes(j)) && (c[j] || 0) < Math.max(1, quota[j] || 0));
    if (!opts.length) continue;
    const job = R.pick(opts);
    const old = p.job;
    p.formerJob = old; p.job = job;
    p.skill = p.skill || {}; p.skill[job] = Math.max(p.skill[job] || 0, 0.2);
    if (!['royal', 'noble', 'knight'].includes(p.rank) && JOBS[job].rank) p.rank = JOBS[job].rank;
    Object.assign(p, humanStats(sim, p));
    c[old]--; c[job] = (c[job] || 0) + 1;
    L.bad = 0; L.gripe = clamp(L.gripe - 25, 0, 100); p.fatigue = Math.max(0, p.fatigue - 20);
    moved.add(p.s);
    LS.stats.quit = (LS.stats.quit || 0) + 1;
    sim.remember(p, `${jobName(old)}の仕事に疲れ果て、${jobName(job)}に転じた`, { emo: 0.2, imp: 0.8, k: 'career' });
    sim.pushLog(`${sim.fullName(p)}は${jobName(old)}の働きづめに耐えかね、${jobName(job)}になった。`, 'event', [p.id], p.pos);
  }
}

// ---------- 心の声・会話 ----------
const REASON_THOUGHT = {
  family: ['子どもたちに腹いっぱい食べさせてやりたい。', '家族のためなら、もうひと踏ん張りだ。'],
  dream: ['夢のためだ。銅貨一枚でも多く貯めないと。', 'あと少し貯まれば……。'],
  debt: ['借金さえなければ、休めるのに。', '今月の返済分は、なんとか稼がないと。'],
  fame: ['いつか町じゅうに名を知られてみせる。', '誰よりもいい仕事をして、見返してやる。'],
  love: ['やっぱり、この仕事が好きだ。', '手を動かしていると、嫌なことを忘れられる。'],
  tax: ['稼いでも稼いでも、税に消えていく。', '徴税日までに、なんとか揃えないと。'],
  survive: ['今日食べる分くらいは、稼がないと。', '休んだら、明日のパンがない。'],
  duty: ['務めは務めだ。', '皆が頼りにしている。'],
  habit: ['さて、今日も働くか。'],
};
export function laborThought(sim, p) {
  const L = p.lab;
  if (!L || sim.ageOf(p) < 14) return null;
  const R = sim.rng;
  const opts = [];
  const st = striking(sim, p);
  if (st) opts.push(st.demand === 'tax' ? '税を下げてもらうまで、仕事には戻らない。' : st.demand === 'rest' ? '人間らしく休める日を、勝ち取るんだ。' : 'まっとうな給金をもらえるまで、槌は握らない。', '仲間がいる。ひとりじゃない。');
  if (L.fired >= sim.today) opts.push('追い出された。明日からどうしよう……。');
  if ((p.fatigue || 0) > 75) opts.push('体が鉛みたいに重い。休みがほしい……。', 'もう何日、休んでいないだろう。');
  if (L.restWork === sim.today) opts.push(p.workReason === 'tax' ? '休みの日だってのに、税を払うには働くしかない。' : '休みの日だけど、働かないと暮らしが回らない。');
  else if (L.restY && p.action?.type !== 'work') opts.push('やっと休みだ。今日は何をしよう。', '休みの日は、体が軽い。');
  if (L.gripe > 65 && !st) opts.push('こんな働き方、いつまでも続けられるものか。', 'みんなで声を上げれば、何か変わるだろうか。');
  if (p.workReason && p.action?.type === 'work' && R.chance(0.5)) opts.push(R.pick(REASON_THOUGHT[p.workReason] || REASON_THOUGHT.habit));
  if (L.style === 'miser' && R.chance(0.3)) opts.push('銅貨一枚だって無駄にはできん。');
  if (L.style === 'spender' && (L.total || 0) > 30 && R.chance(0.3)) opts.push('ちょっと使いすぎたかな……まあ、いいか。');
  if (L.hobby && L.restY) opts.push(`今日は${L.hobby}で遊ぼう。`);
  if (L.engraved && R.chance(0.2)) opts.push('教会の石板に、自分の名が刻まれている。悪くない気分だ。');
  return opts.length ? R.pick(opts) : null;
}
export function laborTopic(api, A, B) {
  const L = A.lab;
  if (!L || api.ageOf(A) < 14) return null;
  const st = striking(api, A);
  if (st) return { w: 3, fn: (api2, A2, B2, v) => ({ kind: 'opinion', text: v.s(st.demand === 'tax' ? '税が下がるまで、みんなで仕事を止めている' : st.demand === 'rest' ? '休みの日をよこせって、みんなで仕事を止めている' : '給金を上げろって、みんなで仕事を止めている', 'v'), sentiment: 0.1 }) };
  const hot = api.S.labor?.strikes?.find((x) => x.state === 'on' && x.sid === A.s);
  if (hot) return { w: 0.9, fn: (api2, A2, B2, v) => ({ kind: 'news', text: v.s(`${GROUP_NAME[hot.group]}が仕事を止めているらしい`, 'raw') + '。', sentiment: -0.1 }) };
  if ((A.fatigue || 0) > 70) return { w: 1.8, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s(api2.rng.pick(['もう何日も休んでいない', 'このところ働きづめで、体がきしむ', '休みの日も働かないと、税が払えない']), 'v'), sentiment: -0.5 }) };
  if (L.restY && api.ageOf(A) >= 16) return { w: 1, fn: (api2, A2, B2, v) => ({ kind: 'happy', text: v.s(api2.rng.pick(['今日は休みの日だから、のんびりする', '休みの日くらい、家族と過ごしたい', '休みだし、広場で見世物でも見に行こうと思う']), 'v'), sentiment: 0.4 }) };
  const recent = A.memories?.filter((m) => m.k === 'spend' && api.today - m.t < 3 && m.emo > 0 && m.imp >= 0.45);
  if (recent?.length && (L.vanity > 0.55 || L.style === 'spender')) { const m = api.rng.pick(recent); return { w: 0.5 + L.vanity * 0.6, fn: (api2, A2, B2, v) => ({ kind: 'boast', text: v.s(`この前、${m.txt.replace(/。.*$/, '')}`, 'v'), sentiment: 0.3 }) }; }
  if (L.style === 'miser' && api.rng.chance(0.3)) return { w: 0.6, fn: (api2, A2, B2, v) => ({ kind: 'opinion', text: v.s('無駄づかいする奴の気が知れない', 'v'), sentiment: -0.1 }) };
  if (A.workReason && ['family', 'dream', 'debt', 'love', 'tax'].includes(A.workReason)) {
    const lines = { family: '家族のために働いている', dream: '夢のために、少しずつ貯めている', debt: '借金を返し終わるまでは、休めない', love: 'この仕事が好きで続けている', tax: '稼ぎのほとんどが税に消える' };
    return { w: 0.7, fn: (api2, A2, B2, v) => ({ kind: 'work', text: v.s(lines[A2.workReason], 'v'), sentiment: A2.workReason === 'love' ? 0.4 : -0.1 }) };
  }
  return null;
}

// ---------- 画面用 ----------
export const LABOR_LABEL = { dine: '酒場で食事を楽しんでいる', shopping: '買い物をしている', donate: '教会で寄進や頼みごとをしている', show: '見世物を楽しんでいる', outing: '休日の遠出を楽しんでいる', banquet: '宴に加わっている', pamper: '家でくつろいでいる', lodge: '宿の上等な部屋で休んでいる', strike: 'ストライキに加わっている' };
export const LABOR_GO = { dine: '酒場へ食べに行くところ', shopping: '買い物に出かけるところ', donate: '教会へ向かっている', show: '見世物を見に行くところ', outing: '遠出に出かけるところ', banquet: '宴の席へ向かっている', pamper: '家へ帰るところ', lodge: '宿屋へ向かっている', strike: '広場の集まりへ向かっている' };
export const LABOR_PREF = { dine: '外食', shopping: '買い物', donate: '寄進', show: '見世物', outing: '遠出', banquet: '宴', pamper: '人を雇ってくつろぐ', lodge: '宿でくつろぐ', strike: 'ストライキ' };

export function laborCard(sim, p) {
  const L = p.lab;
  if (!L || sim.ageOf(p) < 14 || p.deathYear != null) return [];
  const rows = [];
  if (p.workReason) rows.push(['働く理由', WORK_REASON[p.workReason] || p.workReason]);
  if (p.job) {
    const f = Math.round(p.fatigue || 0);
    rows.push(['疲れ', `${f}${f > 75 ? '（へとへと）' : f > 50 ? '（疲れがたまっている）' : f < 20 ? '（元気）' : ''}・${L.streak}日続けて働いている${L.missed ? `・休めなかった日${L.missed}` : ''}`]);
    rows.push(['仕事への不満', `${Math.round(L.gripe)}${L.gripe >= 70 ? '（我慢の限界）' : L.gripe >= 45 ? '（くすぶっている）' : ''}`]);
    const st = striking(sim, p);
    if (st) rows.push(['ストライキ', `${GROUP_NAME[st.group]}と${DEMAND_JP[st.demand]}を求めている（${st.emp || '雇い主'}へ）`]);
    if (L.fired >= sim.today) rows.push(['仕事', `追い出されている（あと${L.fired - sim.today + 1}日）`]);
    rows.push(['休みの日', restDayFor(sim, p) ? '今日は休み' : `${sim.kingdomOf(p) && dutyOf(sim, sim.kingdomOf(p)).has(p.job) ? '当番制' : '国の休日に休む'}`]);
  }
  rows.push(['お金の使い方', `${STYLE_JP[L.style]}${L.vanity > 0.65 ? '・見栄っ張り' : ''}`]);
  const si = sim.seasonIdx() + sim.year() * 4;
  const sp = L.spent.season === si ? Object.entries(L.spent).filter(([k, v]) => k !== 'season' && v >= 0.5).sort((a, b) => b[1] - a[1]) : [];
  rows.push([`この${sim.season()}の出費`, sp.length ? sp.map(([k, v]) => `${NEED_JP[k]}${Math.round(v)}`).join('・') + '銅貨' : 'まだない']);
  const extras = [];
  if (L.hobby) extras.push(`趣味：${L.hobby}`);
  if (sim.hh(p)?.bedQ) extras.push(sim.hh(p).bedQ >= 2 ? '立派な寝台' : '羽毛布団');
  if (L.engraved) extras.push('教会の石板に名が刻まれている');
  if (sim.hh(p)?.labHelp) { const q = sim.S.people[sim.hh(p).labHelp.pid]; if (q) extras.push(`${q.given}を手伝いに雇っている`); }
  if (extras.length) rows.push(['暮らしのぜいたく', extras.join('・')]);
  return rows;
}
export function laborNationHTML(sim, k, esc) {
  ensureLabor(sim);
  const kl = kLabor(sim, k);
  const duty = [...dutyOf(sim, k)].filter((j) => JOBS[j]).map((j) => JOBS[j].name);
  const next = (() => { for (let d = 0; d < 10; d++) { const t0 = sim.today + d; const dd = t0 - kl.anchor; if (((dd % kl.every) + kl.every) % kl.every === kl.every - 1 || kl.holiday?.day === t0) return d; } return null; })();
  const strikes = sim.S.labor.strikes.filter((st) => st.state === 'on' && sim.town(st.sid).kingdom === k.id);
  const talks = sim.S.labor.strikes.filter((st) => st.state === 'talk' && sim.town(st.sid).kingdom === k.id);
  const deals = Object.entries(sim.S.labor.wage).filter(([key]) => sim.town(+key.split(':')[0]).kingdom === k.id).length + Object.entries(sim.S.labor.rest).filter(([key]) => sim.town(+key.split(':')[0]).kingdom === k.id).length;
  return `<dt>休日</dt><dd>${kl.every}日に1度${next === 0 ? '（今日は休日）' : next != null ? `（次は${next}日後）` : ''}${kl.holiday && kl.holiday.day >= sim.today ? `<br><b class="down">臨時の休日：${esc(kl.holiday.why)}</b>` : ''}${k.war ? '<br><span class="sub">戦のため兵は休みなし</span>' : ''}<br><span class="sub">休日も当番で働く職：${esc(duty.slice(0, 10).join('・'))}${duty.length > 10 ? 'ほか' : ''}</span></dd>
    <dt>ストライキ</dt><dd>${strikes.length ? strikes.map((st) => `${esc(sim.town(st.sid).name)}の${esc(GROUP_NAME[st.group])}（${esc(DEMAND_JP[st.demand])}を要求・${sim.today - st.onDay + 1}日目）`).join('<br>') : 'なし'}${talks.length ? `<br><span class="sub">相談中：${talks.map((st) => esc(sim.town(st.sid).name)).join('・')}</span>` : ''}${deals ? `<br><span class="sub">勝ち取った取り決め ${deals}件</span>` : ''}</dd>`;
}
