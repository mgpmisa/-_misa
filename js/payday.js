// 給料日（経済部）
//
// 社長の決まり：雇われて働く人は、雇い主から「決まった日に」まとめて受け取る。働いている最中には受け取らない。
//   兵士・騎士・衛兵・役人・宮廷の者・学者 …… 国庫から
//   自警団・医者・産婆・教師・墓守・灯台守・村長 など町の勤め …… 町の蓄えから
//   司祭・修道女 …… 教会（施し箱）から。足りなければ国庫が助ける
// 働いた時間ぶんの給金は p.wages = { 払い手: 額 } に「貸し」として積もり（accrueWage）、
// 給料日（国ごとに5日に1度）に払い手が払う。払えなければ未払いのまま残り、不満がたまる。
//   未払いが続くと：やる気（labor.js の gripe）と士気（gear.js の morale）が下がり、兵は脱走し、職人たちはストライキに加わる。
// 自営業（漁師・農家・職人・商人）は給料を受け取らない。品物を売ったときだけ収入がある（market.js）。
//
// 本体からの呼び方
//   accrueWage(sim, p, hr)    … doWork の中（働いた時間ぶん、貸しを積む）
//   owe(sim, p, payer, amt, why) … 危険手当など、日ごとに決まる給金の貸し（gear.js）
//   paydayDaily(sim)          … newDay の中（給料日の国だけ払う）
//   nextPayday(sim, kid)      … 画面用：次の給料日まで何日か
import { JOBS } from './data.js';
import { earn } from './property.js';
import { acct } from './market.js';
import { flow, income, econState } from './ledger.js';

export const PAY_EVERY = 5;
// 1時間あたりの給金（JOBS の pay がない職）
const RATE = { knight: 1.4, soldier: 1, guard: 1, jailer: 0.9, servant: 0.8, priest: 1, elder: 0.7, scholar: 2.5, wizard: 2.5 };
// 町が雇う職（それ以外の pay は国が雇う）
const TOWN = new Set(['militia', 'doctor', 'midwife', 'teacher', 'gravedigger', 'keeper', 'nanny', 'elder', 'watchman', 'swordmaster', 'stablehand']);
const CHURCH = new Set(['priest', 'nun']);
const SOLDIERLY = new Set(['knight', 'soldier', 'guard', 'royalguard', 'general', 'gatekeeper', 'militia', 'watchman', 'jailer']);
const r1 = (v) => Math.round(v * 10) / 10;

export function payerOf(sim, p) {
  const s = sim.townOf(p);
  if (CHURCH.has(p.job)) return 'a' + p.s;
  if (TOWN.has(p.job)) return 't' + p.s;
  return 'k' + (s?.kingdom ?? 0);
}
export function wageRate(p) { return RATE[p.job] ?? JOBS[p.job]?.pay ?? 0; }

export function owe(sim, p, payer, amt, why) {
  if (!(amt > 0) || !p) return;
  const w = p.wages || (p.wages = {});
  w[payer] = (w[payer] || 0) + amt;
  if (why) { const n = p.wageWhy || (p.wageWhy = {}); n[why] = (n[why] || 0) + amt; }
}
export function accrueWage(sim, p, hr) {
  const r = wageRate(p);
  if (r > 0) owe(sim, p, payerOf(sim, p), r * hr, null);
}
export function nextPayday(sim, kid) { let d = sim.today; while ((d + kid) % PAY_EVERY !== 0) d++; return d - sim.today; }
export function isPayday(sim, kid) { return (sim.today + kid) % PAY_EVERY === 0; }

// 給料日の支払い
export function paydayDaily(sim) {
  const S = sim.S, R = sim.rng, E = econState(sim);
  const byTownLate = {};
  for (const p of Object.values(S.people)) {
    if (!p.wages) continue;
    if (p.deathYear != null) {
      // 亡くなった人の未払い分は、家族が受け取る（払い手に余裕があれば）
      const hh = S.households[p.hh];
      if (hh) for (const [payer, amt] of Object.entries(p.wages)) { const a = acct(sim, payer); const x = a ? Math.max(0, Math.min(amt, a.money)) : 0; if (x > 0) { a.money -= x; hh.money += x; flow(sim, payerName(payer), '遺族', x, '亡くなった人の給金'); } }
      delete p.wages; delete p.wageWhy; continue;
    }
    const kid = sim.town(p.s)?.kingdom ?? 0;
    if (!isPayday(sim, kid)) continue;
    let paid = 0, owed = 0;
    for (const [payer, amtRaw] of Object.entries(p.wages)) {
      const amt = r1(amtRaw);
      if (amt < 0.05) { delete p.wages[payer]; continue; }
      let a = acct(sim, payer);
      let from = payer;
      // 教会が払えなければ、国庫が司祭を助ける
      if (payer[0] === 'a' && a && a.money < amt) { const k = acct(sim, 'k' + kid); if (k && k.money > amt + 100) { a = k; from = 'k' + kid; } }
      const floor = from[0] === 'k' ? 20 : 0;
      const x = a ? Math.max(0, Math.min(amt, a.money - floor)) : 0;
      if (x > 0) { a.money -= x; earn(sim, p, x, 0.5); flow(sim, payerName(from), JOBS[p.job]?.name || '勤め人', x, '給料日の給金'); income(sim, p.job || p.formerJob, x); }
      paid += x;
      const rest = amt - x;
      if (rest > 0.05) { p.wages[payer] = rest; owed += rest; } else delete p.wages[payer];
    }
    delete p.wageWhy;
    E.day.wages.paid += paid; E.day.wages.owed += owed;
    if (paid > 0 && R.chance(0.15)) sim.remember(p, `給料日。${Math.round(paid)}銅貨の給金を受け取った`, { emo: 0.4, imp: 0.25, k: 'work' });
    if (owed > 0.5) {
      p.payLate = (p.payLate || 0) + 1;
      (byTownLate[p.s] = byTownLate[p.s] || []).push(p);
      if (p.lab) p.lab.gripe = Math.min(100, (p.lab.gripe || 0) + 10 + p.payLate * 5);
      if (SOLDIERLY.has(p.job)) p.morale = Math.max(0, (p.morale ?? 55) - 8 - p.payLate * 4);
      if (R.chance(0.6)) sim.remember(p, `給料日なのに、${Math.round(owed)}銅貨の給金が払われなかった${p.payLate >= 2 ? `（${p.payLate}回続けて）` : ''}`, { emo: -0.6, imp: 0.55, k: 'labor' });
    } else p.payLate = 0;
  }
  for (const [sid, list] of Object.entries(byTownLate)) {
    const s = sim.town(+sid);
    sim.pushLog(`${s.name}で、給料日に${list.length}人の給金が払われなかった（${[...new Set(list.map((q) => JOBS[q.job]?.name || '勤め人'))].slice(0, 4).join('・')}）。`, 'event', list.slice(0, 5).map((q) => q.id), s);
  }
  // 組合費と許可状：商人は町の商人組合（町の蓄え）へ、行商人は国へ、給料日ごとに納める
  for (const p of sim.living()) {
    if (p.job !== 'merchant' && p.job !== 'peddler') continue;
    const kid = sim.town(p.s)?.kingdom ?? 0;
    if (!isPayday(sim, kid)) continue;
    const hh = sim.hh(p); if (!hh || hh.money < 40) continue;
    const fee = p.job === 'merchant' ? 3 : 2, to = p.job === 'merchant' ? 't' + p.s : 'k' + kid;
    const a = acct(sim, to); if (!a) continue;
    hh.money -= fee; a.money += fee;
    flow(sim, JOBS[p.job].name, payerName(to), fee, p.job === 'merchant' ? '商人組合の組合費' : '行商の許可状');
  }
}
function payerName(code) { return code[0] === 'k' ? '国庫' : code[0] === 't' ? '町の蓄え' : code[0] === 'a' ? '教会（施し箱）' : '雇い主'; }

// 詳細欄
export function wageText(sim, p) {
  const w = p.wages; if (!w) return '';
  const tot = Object.values(w).reduce((a, b) => a + b, 0);
  if (tot < 0.5) return '';
  const kid = sim.town(p.s)?.kingdom ?? 0;
  const d = nextPayday(sim, kid);
  return `未払いの給金 ${Math.round(tot)}銅貨（${d === 0 ? '今日が給料日' : `次の給料日まで${d}日`}${p.payLate ? `・${p.payLate}回払われていない` : ''}）`;
}
