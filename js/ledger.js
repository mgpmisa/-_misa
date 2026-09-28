// お金の帳簿と毎日の点検（経済部）
//
// 社長の決まり：お金は取り引きでしか動かない。どこからともなく湧いたり消えたりしない。
// 例外（外から入る・外へ出るお金）は、ここの帳簿に理由つきで記録する。
//   入る：造幣所が打った硬貨（銀行の帳簿）・ダンジョンと魔王の屋敷の宝箱・竜の宝・黄金の鉱脈・昔の壺・
//         よその土地から移り住んだ人の持ち金
//   出る：よその国からの取り寄せ（資材・家畜）・改鋳で鋳つぶした硬貨
//
// ■ 本体からの呼び方
//   ensureLedger(sim)        … newWorld と load の最後
//   ledgerDaily(sim)         … newDay のいちばん最後（save の前）。世界じゅうのお金を数え、ずれを記録する
//   moneyIn / moneyOut       … 外との出入り（帳簿に残る）
//   flow(sim, from, to, amt, why) … 誰から誰へ動いたか（「暮らし」欄の要約に使う）
//   income(sim, job, amt)    … 職業ごとの収入の集計
//   econFlowHTML(sim, esc)   … 「暮らし」欄に出す、お金の流れの要約
//
// 状態：S.econ = { ledger:{in,out}, day:{in,out,flow,inc,meals}, last:{d,total}, hist:[], alerts:[], prev }
//   divine.js は S.econ.ledger.in と S.econ.day.in に直接書き込む（黄金の鉱脈）。形はそれと同じにしてある。
import { JOBS } from './data.js';

const HIST = 60;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const r1 = (v) => Math.round(v * 10) / 10;

function blankDay() { return { in: 0, out: 0, flow: {}, inc: {}, meals: { self: 0, bought: 0, inn: 0 }, merchant: 0, wages: { paid: 0, owed: 0 } }; }

export function econState(sim) {
  const S = sim.S;
  if (!S.econ) S.econ = { v: 2, ledger: { in: {}, out: {} }, day: blankDay(), hist: [], alerts: [], last: null };
  const E = S.econ;
  if (!E.ledger) E.ledger = { in: {}, out: {} };
  if (!E.day) E.day = blankDay();
  for (const [k, v] of Object.entries(blankDay())) if (E.day[k] == null) E.day[k] = v;
  if (!E.hist) E.hist = [];
  if (!E.alerts) E.alerts = [];
  return E;
}

// 世界じゅうのお金の置き場所をすべて数える
export function moneyTotal(sim) {
  const S = sim.S;
  const P = { 家計: 0, 財布: 0, 貯え: 0, 町の蓄え: 0, 施し箱: 0, 市場の金庫: 0, 国庫: 0, 銀行の金庫: 0, 埋めた壺: 0, 組合と救貧院: 0, 街道と関所: 0, 荷車の箱: 0 };
  for (const h of Object.values(S.households || {})) P.家計 += num(h.money);
  for (const p of Object.values(S.people || {})) { P.財布 += num(p.purse); P.貯え += num(p.nestEgg) + num(p.plan?.saved); }
  for (const t of Object.values(S.towns || {})) { P.町の蓄え += num(t.fund); P.施し箱 += num(t.alms); P.市場の金庫 += num(t.cash) + num(t.commission); P.組合と救貧院 += num(t.guild?.box); }
  for (const k of S.kingdoms || []) P.国庫 += num(k.treasury);
  if (S.bank) {
    for (const b of Object.values(S.bank.k || {})) P.銀行の金庫 += num(b.vault);
    for (const h of S.bank.hoards || []) if (!h.gone) P.埋めた壺 += num(h.amt);
  }
  if (S.elder) {
    for (const f of Object.values(S.elder.funds || {})) P.組合と救貧院 += num(f.bal);
    for (const a of Object.values(S.elder.alms || {})) P.組合と救貧院 += num(a.bal);
  }
  if (S.diplo) {
    for (const r of S.diplo.roads || []) P.街道と関所 += num(r.fund);
    for (const v of Object.values(S.diplo.fund || {})) P.街道と関所 += num(v);   // 国ごとの街道の蓄え（diplomacy.js の collect が通行料の4割を入れる）
    for (const g of S.diplo.gates || []) P.街道と関所 += num(g.box);
  }
  for (const c of S.convoys || []) P.荷車の箱 += num(c.cash);
  let total = 0;
  for (const v of Object.values(P)) total += v;
  return { total, parts: P };
}

// ---------- 外との出入り ----------
export function moneyIn(sim, amt, why) {
  amt = num(amt); if (amt <= 0) return 0;
  const E = econState(sim);
  E.ledger.in[why] = (E.ledger.in[why] || 0) + amt;
  E.day.in += amt;
  flow(sim, '外の世界', why, amt, '外から入った');
  return amt;
}
export function moneyOut(sim, amt, why) {
  amt = num(amt); if (amt <= 0) return 0;
  const E = econState(sim);
  E.ledger.out[why] = (E.ledger.out[why] || 0) + amt;
  E.day.out += amt;
  flow(sim, why, '外の世界', amt, '外へ出た');
  return amt;
}
// よそから来た人の持ち金（家計と財布）を「外から入った」として記録する
export function newcomerMoney(sim, hh, people, why = 'よそから移り住んだ人の持ち金') {
  let x = num(hh?.money);
  for (const p of people || []) x += num(p.purse);
  return moneyIn(sim, x, why);
}

// ---------- 誰から誰へ ----------
export function flow(sim, from, to, amt, why = '') {
  amt = num(amt); if (amt <= 0) return;
  const E = econState(sim);
  const key = `${from}→${to}${why ? '：' + why : ''}`;
  E.day.flow[key] = (E.day.flow[key] || 0) + amt;
}
export function income(sim, job, amt) {
  amt = num(amt); if (amt <= 0 || !job) return;
  const E = econState(sim);
  E.day.inc[job] = (E.day.inc[job] || 0) + amt;
}
export function meal(sim, kind, n = 1) {
  const E = econState(sim);
  E.day.meals[kind] = (E.day.meals[kind] || 0) + n;
}
// 人・世帯・国・町の呼び名（流れの要約用）
export function whoLabel(sim, code) {
  const S = sim.S;
  if (code == null) return '誰か';
  if (typeof code === 'object') { const p = code; return p.job ? (JOBS[p.job]?.name || p.job) : (sim.ageOf?.(p) < 14 ? '子ども' : '暮らしの人'); }
  if (typeof code === 'number') {
    const hh = S.households[code];
    if (!hh) return '町の蓄え';
    if (hh.royal) return '王家';
    const jobs = hh.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null && p.job).map((p) => p.job);
    const pick = jobs.find((j) => JOBS[j]?.goods || j === 'merchant' || j === 'innkeeper') || jobs[0];
    return pick ? JOBS[pick]?.name || pick : '暮らしの人';
  }
  const s = String(code);
  if (s[0] === 'k') return '国庫';
  if (s[0] === 't') return '町の蓄え';
  if (s[0] === 'a') return '教会（施し箱）';
  return s;
}

// ---------- 起動 ----------
export function ensureLedger(sim) {
  const E = econState(sim);
  const B = sim.S.bank?.led;
  if (!E.bankLed) E.bankLed = { issue: num(B?.issue), recall: num(B?.recall), ancient: num(B?.ancient), divine: num(B?.divineGold) };
  // 世界ができたとき（または古いセーブで初めて帳簿を作るとき）の総額を出発点にする。
  // それまでに記録された「外から入った」分は出発点に含まれているので、今日の分からは外す
  if (!E.last) { E.last = { d: sim.today, total: moneyTotal(sim).total }; E.day.in = 0; E.day.out = 0; E.day.flow = {}; }
  return E;
}

// 銀行の帳簿（造幣・悪鋳・昔の壺・改鋳での回収）の増えた分を、外との出入りとして写す
function syncBank(sim) {
  const E = econState(sim), B = sim.S.bank?.led;
  if (!B) return;
  const prev = E.bankLed || { issue: 0, recall: 0, ancient: 0, divine: 0 };
  const dIssue = num(B.issue) - prev.issue, dDiv = num(B.divineGold) - (prev.divine || 0);
  // 神の黄金の鉱脈は divine.js が自分で帳簿（S.econ.ledger.in）に書くので、造幣からは除く
  moneyIn(sim, dIssue - dDiv, '造幣所が打った硬貨');
  moneyIn(sim, num(B.ancient) - prev.ancient, '昔の人が埋めた壺');
  moneyOut(sim, num(B.recall) - prev.recall, '改鋳で鋳つぶした硬貨');
  E.bankLed = { issue: num(B.issue), recall: num(B.recall), ancient: num(B.ancient), divine: num(B.divineGold) };
}

// ---------- 毎日の点検 ----------
export function ledgerDaily(sim) {
  const E = ensureLedger(sim);
  syncBank(sim);
  const now = moneyTotal(sim);
  const expect = E.last.total + E.day.in - E.day.out;
  const drift = now.total - expect;
  const row = { d: sim.today, total: Math.round(now.total), in: r1(E.day.in), out: r1(E.day.out), drift: r1(drift) };
  E.hist.push(row);
  if (E.hist.length > HIST) E.hist.shift();
  if (Math.abs(drift) >= 1) {
    E.alerts.push({ d: sim.today, drift: r1(drift), total: Math.round(now.total) });
    if (E.alerts.length > 30) E.alerts.shift();
  }
  E.prev = { ...E.day, d: sim.today - 1, total: now.total, parts: now.parts, drift };
  E.day = blankDay();
  E.last = { d: sim.today, total: now.total };
  return row;
}

// ---------- 画面用：お金の流れの要約 ----------
export function econFlowRows(sim, n = 14) {
  const E = econState(sim), d = E.prev || E.day;
  return Object.entries(d.flow || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v: Math.round(v) }));
}
export function econFlowHTML(sim, esc = (s) => String(s)) {
  const E = econState(sim), d = E.prev || E.day;
  const rows = econFlowRows(sim, 14).map((r) => `<tr><td>${esc(r.k)}</td><td style="text-align:right">${r.v}</td></tr>`).join('');
  const inc = Object.entries(d.inc || {}).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([j, v]) => `${esc(JOBS[j]?.name || j)} ${Math.round(v)}`).join('・');
  const m = d.meals || {}, allM = (m.self || 0) + (m.bought || 0) + (m.inn || 0);
  const pct = (x) => (allM > 0 ? Math.round((x || 0) / allM * 100) : 0);
  const last = E.hist[E.hist.length - 1];
  const bad = E.hist.filter((h) => Math.abs(h.drift) >= 1).length;
  const led = (o) => Object.entries(o || {}).filter(([, v]) => v >= 0.5).map(([k, v]) => `${esc(k)} ${Math.round(v)}`).join('・') || 'なし';
  return `<h4>お金の流れ（${d === E.prev ? '昨日' : '今日'}）</h4>
<table class="flow">${rows || '<tr><td>まだ記録がない</td></tr>'}</table>
<p>職業ごとの収入：${inc || 'まだない'}</p>
<p>食べ物の手に入れ方：自分で作った ${pct(m.self)}%・市場で買った ${pct(m.bought)}%・宿や酒場で食べた ${pct(m.inn)}%</p>
<p>市場の商人のもうけ：${Math.round(d.merchant || 0)}銅貨　給料日の支払い：${Math.round(d.wages?.paid || 0)}（未払い ${Math.round(d.wages?.owed || 0)}）</p>
<p>世界のお金の総額：${last ? last.total : '—'}銅貨　帳簿のずれ：${last ? last.drift : 0}（ずれた日 ${bad}/${E.hist.length}）</p>
<p>外から入ったお金：${led(E.ledger.in)}</p><p>外へ出たお金：${led(E.ledger.out)}</p>`;
}
