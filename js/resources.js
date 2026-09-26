// 資源とお金の流れ（経済部）
//
// ■ 第1段階：お金の導線（このファイルの前半）
//   世界のお金は、次の「置き場所」のどこかに必ずある。どこにも無いところから湧いたり、
//   だれにも渡らずに消えたりしてはいけない。
//     家計 hh.money ／ 財布 p.purse ／ へそくり p.nestEgg ／ 夢の貯金 p.plan.saved
//     町の蓄え town.fund ／ 教会の施し箱 town.alms ／ 商人の手数料 town.commission
//     市場の金庫 town.cash（市場組合のお金。品物を買い取るときはここから払い、売るときはここに入る）
//     国庫 k.treasury
//   外の世界との出入りだけは、帳簿（S.econ.ledger）に理由つきで記録して認める。
//     入る：宝（ダンジョン・魔王城の宝箱、竜の宝）、移住者の持参金、偽金、古いセーブの市場の開業資金、造幣（第2段階）
//     出る：輸入（よその国からの仕入れ代）、焼失（放火）、偽金の没収
//   毎日、世界のお金の総額を数え、「前日の総額＋入った分−出た分」との差（ずれ）を S.econ.hist に残す。
//   ずれが0から離れたら、どこかに相手のいない増減がある。
//
// ■ 本体からの呼び方（くわしくは報告のコード片）
//   ensureEcon(sim, fresh)   … newWorld の最後で ensureEcon(this, true)、load の最後で ensureEcon(this)
//   econDaily(sim)           … newDay の最後（save の前）で1日1回：市場の金庫の過不足をならし、総額を記録する
//   marketPays / marketGets  … 市場が品物を買い取る・売る（sim.sell / sim.buy など）
//   townPays / treasuryPays / customersPay … 町の蓄え・国庫・町の客が払う
//   moneyIn / moneyOut      … 外の世界との正当な出入り（帳簿に残る）
//   importGoods              … よその国から品物を仕入れる（代金は市場の金庫から外へ出る）
//   econHTML(sim, esc)       … 「暮らし」タブなどに出せる、お金の流れの表
import { GOODS } from './data.js';

// 市場の金庫の元手（新しい世界の最初の状態。町の格で違う）
export const MARKET_SEED = { capital: 600, port: 400, town: 300, village: 220 };
const SEED_DEFAULT = 200;
const HIST_DAYS = 120;
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// ---------- 状態 ----------
// fresh=true は newWorld の最後。世界ができあがった時点の総額を出発点にする
export function ensureEcon(sim, fresh = false) {
  const S = sim.S;
  const E = E_(sim);
  for (const [sid, t] of Object.entries(S.towns || {})) {
    if (!fresh && t.cashSeeded) continue;
    const seed = MARKET_SEED[sim.town(+sid)?.type] ?? SEED_DEFAULT;
    // 新しい世界ではもとからある元手。古いセーブでは、外から持ち込まれた元手として帳簿に残す
    if (fresh) t.cash = (t.cash || 0) + seed;
    else if (t.cash == null) t.cash = moneyIn(sim, seed, '古いセーブの市場の元手');
    t.cashSeeded = true;
  }
  if (fresh) { E.ledger = { in: {}, out: {} }; E.day = { in: 0, out: 0 }; E.hist = []; delete E.bankLed; }
  if (!E.bankLed && S.bank?.led) E.bankLed = { issue: num(S.bank.led.issue), recall: num(S.bank.led.recall), ancient: num(S.bank.led.ancient) };
  if (fresh || !E.last) E.last = { d: sim.today, total: moneyTotal(sim).total };
  return E;
}
function E_(sim) {
  const S = sim.S;
  if (!S.econ) S.econ = { v: 1, ledger: { in: {}, out: {} }, day: { in: 0, out: 0 }, hist: [], last: null };
  const E = S.econ;
  if (!E.ledger) E.ledger = { in: {}, out: {} };
  if (!E.day) E.day = { in: 0, out: 0 };
  if (!E.hist) E.hist = [];
  return E;
}
function town_(sim, sid) {
  const t = sim.S.towns?.[sid];
  if (t && t.cash == null) { t.cash = 0; t.cashSeeded = true; }   // 開拓で新しくできた町の市場は、元手0から始まる
  return t;
}

// ---------- 外の世界との出入り（帳簿） ----------
export function moneyIn(sim, amt, why) {
  amt = num(amt); if (amt <= 0) return 0;
  const E = E_(sim);
  E.ledger.in[why] = (E.ledger.in[why] || 0) + amt;
  E.day.in += amt;
  return amt;
}
export function moneyOut(sim, amt, why) {
  amt = num(amt); if (amt <= 0) return 0;
  const E = E_(sim);
  E.ledger.out[why] = (E.ledger.out[why] || 0) + amt;
  E.day.out += amt;
  return amt;
}

// ---------- 払う・受け取る（すべて、実際に払えた分だけを返す） ----------
// 市場組合が払う（品物の買い取り、粉ひき賃、仕入れ代など）
export function marketPays(sim, sid, amt) {
  const t = town_(sim, sid); amt = num(amt);
  if (!t || amt <= 0) return 0;
  const x = Math.min(amt, Math.max(0, t.cash));
  t.cash -= x;
  return x;
}
// 市場組合が受け取る（品物の売り上げ）。町が無ければ、そのお金は外へ出たものとして帳簿に残す
export function marketGets(sim, sid, amt) {
  amt = num(amt); if (amt <= 0) return 0;
  const t = town_(sim, sid);
  if (t) t.cash += amt; else moneyOut(sim, amt, '行き先のない代金');
  return amt;
}
export function townPays(sim, sid, amt) {
  const t = sim.S.towns?.[sid]; amt = num(amt);
  if (!t || amt <= 0) return 0;
  const x = Math.min(amt, Math.max(0, t.fund || 0));
  t.fund -= x;
  return x;
}
export function townGets(sim, sid, amt) {
  amt = num(amt); if (amt <= 0) return 0;
  const t = sim.S.towns?.[sid];
  if (t) t.fund = (t.fund || 0) + amt; else moneyOut(sim, amt, '行き先のない代金');
  return amt;
}
// 国庫が払う。floor より下には減らさない（給金の未払いは、払えなかった分として返す）
export function treasuryPays(sim, k, amt, floor = 0) {
  if (typeof k === 'number') k = sim.S.kingdoms[k];
  amt = num(amt);
  if (!k || amt <= 0) return 0;
  const x = Math.min(amt, Math.max(0, k.treasury - floor));
  k.treasury -= x;
  return x;
}
// 町の客（暮らしにゆとりのある家）が払う。手間賃・運賃・修繕代など
export function customersPay(sim, sid, amt, notHh = null) {
  amt = num(amt); if (amt <= 0) return 0;
  const S = sim.S, R = sim.rng;
  const hour = Math.floor(S.t / 60);
  if (!sim._econCust || sim._econCust.hour !== hour) sim._econCust = { hour, by: {} };
  let list = sim._econCust.by[sid];
  if (!list) {
    list = sim._econCust.by[sid] = Object.values(S.households).filter((h) => h.s === sid && !h.bandits && !h.street && h.money > 40);
  }
  let paid = 0;
  for (let tries = 0; tries < 4 && paid < amt - 1e-9 && list.length; tries++) {
    const h = list[Math.floor(R.next() * list.length)];
    if (!h || h.id === notHh || !S.households[h.id]) continue;
    const x = Math.min(amt - paid, Math.max(0, h.money - 30));
    if (x <= 0) continue;
    h.money -= x; paid += x;
  }
  return paid;
}
// よその国から品物を仕入れる。代金は市場の金庫から外へ出る。払えた分だけ入荷する
export function importGoods(sim, sid, good, qty, mul = 1.3) {
  const t = town_(sim, sid), g = GOODS[good];
  if (!t || !g || qty <= 0) return 0;
  const cost = qty * g.base * mul;
  const paid = marketPays(sim, sid, cost);
  if (paid <= 0) return 0;
  moneyOut(sim, paid, '輸入（よその国からの仕入れ）');
  const got = qty * paid / cost;
  t.stock[good] = (t.stock[good] || 0) + got;
  return got;
}

// あふれた品物を、よその国へ売り渡す。代金は外から市場の金庫へ入る（帳簿に残る）
export function exportGoods(sim, sid, good, qty, mul = 0.6) {
  const t = town_(sim, sid), g = GOODS[good];
  if (!t || !g || qty <= 0) return 0;
  qty = Math.min(qty, Math.max(0, (t.stock[good] || 0) - g.target * 2));
  if (qty <= 0) return 0;
  t.stock[good] -= qty;
  const got = moneyIn(sim, qty * g.base * mul, '輸出（よその国への売り渡し）');
  t.cash += got;
  return got;
}
// 商人の品ぞろえ（sim.js の merchant から1歩ごとに呼ぶ）：もうかる品だけ仕入れ、だぶついた品は外へ売る
export function merchantStock(sim, sid, hr) {
  const m = sim.S.towns[sid]; if (!m) return;
  for (const [k, g] of Object.entries(GOODS)) {
    const st = m.stock[k] || 0;
    if (st < g.target * 0.2 && m.price[k] > g.base * 1.4) importGoods(sim, sid, k, g.target * 0.1 * hr);
    else if (st > g.target * 3 && m.price[k] < g.base * 0.7) exportGoods(sim, sid, k, g.target * 0.1 * hr);
  }
}

// ---------- 世界のお金の総額 ----------
export function moneyTotal(sim) {
  const S = sim.S;
  const P = {
    家計: 0, 財布: 0, 貯金: 0, 町の蓄え: 0, 施し箱: 0, 手数料: 0, 市場の金庫: 0, 国庫: 0,
  };
  for (const h of Object.values(S.households || {})) P.家計 += num(h.money);
  for (const p of Object.values(S.people || {})) { P.財布 += num(p.purse); P.貯金 += num(p.nestEgg) + num(p.plan?.saved); }
  for (const t of Object.values(S.towns || {})) { P.町の蓄え += num(t.fund); P.施し箱 += num(t.alms); P.手数料 += num(t.commission); P.市場の金庫 += num(t.cash); }
  for (const k of S.kingdoms || []) P.国庫 += num(k.treasury);
  // 銀行（bank.js）がつながっていれば、金庫と埋められた壺のお金も数える
  if (S.bank) {
    P.銀行の金庫 = 0; P.埋めた壺 = 0;
    for (const b of Object.values(S.bank.k || {})) P.銀行の金庫 += num(b.vault);
    for (const h of S.bank.hoards || []) if (!h.gone) P.埋めた壺 += num(h.amt);
  }
  const total = Object.values(P).reduce((a, b) => a + b, 0);
  return { total, parts: P };
}
// 銀行の帳簿（造幣・改鋳での回収・昔の壺）の増えた分を、外との出入りとして写す
function syncBankLedger(sim) {
  const B = sim.S.bank, E = E_(sim);
  if (!B?.led) return;
  const prev = E.bankLed || { issue: B.led.issue || 0, recall: B.led.recall || 0, ancient: B.led.ancient || 0 };
  moneyIn(sim, num(B.led.issue) - num(prev.issue), '造幣（銀行）');
  moneyIn(sim, num(B.led.ancient) - num(prev.ancient), '昔の壺（銀行）');
  moneyOut(sim, num(B.led.recall) - num(prev.recall), '改鋳で鋳つぶした硬貨（銀行）');
  E.bankLed = { issue: num(B.led.issue), recall: num(B.led.recall), ancient: num(B.led.ancient) };
}

// ---------- 毎日 ----------
// 市場の金庫の過不足をならす：あふれた分は組合の商人に配当し（いなければ町の蓄えへ）、
// 底をつきかけたら町の蓄えから少し貸す（町の人が品物を売れなくならないように）
function settleMarkets(sim) {
  const S = sim.S;
  const merchants = {};
  for (const p of sim.living()) if ((p.job === 'merchant' || p.job === 'changer') && sim.hh(p)) (merchants[p.s] = merchants[p.s] || []).push(p);
  for (const [sid, t] of Object.entries(S.towns)) {
    if (t.cash == null) t.cash = 0;
    const seed = MARKET_SEED[sim.town(+sid)?.type] ?? SEED_DEFAULT;
    if (t.cash > seed * 1.5) {
      const x = (t.cash - seed * 1.5) * 0.5;
      t.cash -= x;
      const ms = merchants[sid] || [];
      if (ms.length) for (const p of ms) sim.hh(p).money += x / ms.length;
      else t.fund = (t.fund || 0) + x;
    } else if (t.cash < seed * 0.25 && (t.fund || 0) > 150) {
      const x = Math.min(80, t.fund - 150);
      t.fund -= x; t.cash += x;
    }
  }
}

export function econDaily(sim) {
  const S = sim.S, E = ensureEcon(sim);
  settleMarkets(sim);
  syncBankLedger(sim);
  const { total, parts } = moneyTotal(sim);
  const last = E.last || { total, d: sim.today };
  const drift = total - (last.total + E.day.in - E.day.out);
  E.hist.push({ d: sim.today, total: Math.round(total), in: Math.round(E.day.in), out: Math.round(E.day.out), drift: Math.round(drift * 10) / 10, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])) });
  if (E.hist.length > HIST_DAYS) E.hist.splice(0, E.hist.length - HIST_DAYS);
  E.last = { d: sim.today, total };
  E.day = { in: 0, out: 0 };
  return drift;
}

// ---------- 表示 ----------
export function econHTML(sim, esc = (s) => s) {
  const E = sim.S.econ;
  if (!E) return '';
  const h = E.hist[E.hist.length - 1];
  const r = (x) => Math.round(x).toLocaleString('ja-JP');
  const rows = h ? Object.entries(h.parts).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${r(v)}</td></tr>`).join('') : '';
  const led = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${r(v)}`).join('、') || 'なし';
  return `<h4>世界のお金</h4>${h ? `<p>総額 ${r(h.total)}銅貨（前日から ${h.total - (E.hist[E.hist.length - 2]?.total ?? h.total) >= 0 ? '+' : ''}${r(h.total - (E.hist[E.hist.length - 2]?.total ?? h.total))}）</p>` : ''}
<table>${rows}</table>
<p>外から入ったお金：${led(E.ledger.in)}</p><p>外へ出たお金：${led(E.ledger.out)}</p>`;
}
