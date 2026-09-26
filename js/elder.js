// 老後の備え：組合の掛け金と給付・国の恩給と養老の下賜金・家族の扶養と隠居契約・救貧院と養老の契約・年寄りの役割・孤独死
// 調べた背景は docs/老後の備え.md。
// 本体（sim.js）からは次の関数を呼ぶだけで動く。状態はすべて遅延初期化なので古いセーブでも動く。
//   elderDaily(sim)                 … newDay で careerDaily の直後に呼ぶ（taxesDaily より前に呼ぶこと：前日の徴税記録を読むため）
//   elderThought(sim, p)            … 心の声（なければ null）
//   elderTopicWeight(sim, A, B)     … 会話の話題の重み
//   elderTopic(sim, A, B, v)        … 会話の話題（speech.js の話題と同じ形 { kind, text, sentiment }）
//   elderCard(sim, p)               … 人の詳細欄に出す行（[見出し, 本文] の配列）
//   elderBuildingRows(sim, b)       … 建物（教会）の詳細欄に出す行
//   elderReport(sim)                … 試験・画面用の集計
//
// お金の決まり：給付は必ず誰かの財布・家計・国庫・組合の箱・施し箱・町の蓄えから出る。どこからも湧かない。
//
// 人の状態 p.pen = {
//   g: 組合の箱のキー, paid: 払った掛け金の累計, svc: 国に勤めた日数, cj: 国の勤めの職, tax: 納めた税の累計（家の分を働き手で割った額）,
//   inj: 戦いの古傷で退いた, widow: { g, rate }（組合の遺族手当）, cw: 国の遺族恩給（1日の額）,
//   care: { k: 'kyo'|'taken'|'alms'|'corrody', by, day }（扶養のかたち）, got: 受け取った給付の累計, last: { day, parts }（最後の給付の内訳）
// }
// 世界の状態 S.elder = { v, funds: { key: { key, cat, sid, k, bal, in, out } }, alms: { sid: { hh, bal, cap, name, admitted } }, stats, today, graveIdx }
import { JOBS, KINGDOMS, DAYS_PER_YEAR } from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;
const alive = (sim, id) => { const q = id == null ? null : sim.S.people[id]; return q && q.deathYear == null ? q : null; };
const jobName = (j) => JOBS[j]?.name || j || '';
const isSouth = (sim, sid) => !!KINGDOMS[sim.town(sid)?.kingdom]?.south;

// ---------- 表 ----------
// 国に仕える勤め（国庫から恩給が出る）
const CROWN = new Set(['soldier', 'guard', 'jailer', 'knight', 'royalguard', 'general', 'gatekeeper', 'watchman', 'servant', 'butler', 'maid', 'cook', 'chancellor', 'treasurer', 'courtmage', 'scribe', 'messenger', 'overseer', 'keeper']);
const HIGH = new Set(['knight', 'royalguard', 'general', 'chancellor', 'treasurer', 'courtmage']);   // 恩給が厚い身分
// 職人組合（北）／同業組合の共同箱（南）
const CRAFT = new Set(['smith', 'carpenter', 'baker', 'tailor', 'cobbler', 'potter', 'weaver', 'jeweler', 'butcher', 'brewer', 'herbalist', 'shipwright', 'mason', 'miller', 'alchemist', 'barber', 'merchant', 'innkeeper', 'changer', 'peddler', 'painter', 'musician', 'doctor', 'midwife']);
// 船乗りの兄弟団
const SEA = new Set(['fisher', 'sailor', 'captain', 'diver', 'ferryman']);
// 村の互助講（村の働き手）
const LABOR = new Set(['farmer', 'rancher', 'shepherd', 'beekeeper', 'woodcutter', 'charcoal', 'gatherer', 'miner', 'laundress', 'stablehand', 'hunter', 'gardener', 'pioneer', 'roadworker', 'coachman', 'gravedigger', 'nanny']);
const CLERGY = new Set(['priest', 'nun']);
const NO_SUPPORT = new Set(['king', 'royal', 'noble']);   // 王族と貴族は自分の財で暮らす
// 掛け金（5日ごと）と、1日の給付の上限
const DUES = { craft: 2.5, sea: 1.5, adv: 3, vill: 1 };
const CAP = { craft: 4, sea: 3, adv: 5, vill: 2 };
const DUE_DAY = 1, REMIT_DAY = 3;   // today % 5 が この日に掛け金・仕送り
// 力仕事や戦いの職（古傷がひどいと続けられない）
const HEAVY = new Set(['smith', 'miner', 'woodcutter', 'mason', 'carpenter', 'shipwright', 'roadworker', 'pioneer', 'sailor', 'diver']);
const CARE_CAP = { capital: 10, port: 6, village: 4 };

// ---------- 状態 ----------
function E(sim) {
  const S = sim.S;
  if (!S.elder) initElder(sim);
  return S.elder;
}
function pen(p) { return p.pen || (p.pen = { paid: 0, svc: 0, tax: 0, got: 0 }); }
function blankDay() { return { dues: 0, guild: 0, crown: 0, dole: 0, widow: 0, clergy: 0, remit: 0, almsFood: 0, almsFund: 0, gifts: 0, funeral: 0, market: 0 }; }

function guildCat(sim, p, job = p.job) {
  if (!job || CROWN.has(job) || CLERGY.has(job) || JOBS[job]?.crook) return null;
  if (JOBS[job]?.rank === 'adventurer' || job === 'paladin') return 'adv';
  if (CRAFT.has(job)) return 'craft';
  if (SEA.has(job)) return 'sea';
  if (LABOR.has(job) && sim.town(p.s)?.type === 'village') return 'vill';
  return null;
}
function fundKey(sim, p, cat) { return cat === 'adv' ? `adv:k${sim.town(p.s).kingdom}` : `${cat}:${p.s}`; }
function fundOf(sim, key) {
  const st = E(sim);
  if (st.funds[key]) return st.funds[key];
  const [cat, rest] = key.split(':');
  const sid = cat === 'adv' ? null : +rest;
  const k = cat === 'adv' ? +rest.slice(1) : sim.town(sid)?.kingdom;
  return (st.funds[key] = { key, cat, sid, k, bal: 0, in: 0, out: 0 });
}
export function fundName(sim, f) {
  if (!f) return '';
  if (f.cat === 'adv') return `${sim.S.kingdoms[f.k]?.name || KINGDOMS[f.k]?.name || ''}の冒険者ギルドの互助金`;
  const s = sim.town(f.sid), south = !!KINGDOMS[s?.kingdom]?.south;
  const t = s?.name || '';
  if (f.cat === 'craft') return south ? `${t}の同業組合の共同箱` : `${t}の職人組合の箱`;
  if (f.cat === 'sea') return `${t}の船乗りの兄弟団`;
  return `${t}の互助講`;
}
const shortFund = (f) => (f ? { craft: '組合の箱', sea: '兄弟団', adv: 'ギルドの互助金', vill: '互助講' }[f.cat] : '');
const crownName = (sim, sid) => (isSouth(sim, sid) ? 'オトゥラク（老兵の恩給）' : '王の恩給');
const almsName = (sim, s) => (KINGDOMS[s.kingdom]?.south ? `${s.name}のワクフの養老院` : `${s.name}の救貧院`);

// ---------- はじめに（古いセーブ・新しい世界の両方） ----------
export function initElder(sim) {
  const S = sim.S, R = sim.rng;
  if (S.elder) return S.elder;
  S.elder = { v: 1, funds: {}, alms: {}, stats: { ...blankDay(), takenIn: 0, kyo: 0, admitted: 0, corrody: 0, doles: 0, lonely: 0, advice: 0, counsel: 0, funerals: 0, widows: 0, injured: 0, cuts: 0, neglect: 0 }, today: blankDay(), graveIdx: (S.graves || []).length, lastDay: -1 };
  // これまでの人生で積み上げた分（記録上の権利。お金ではない）
  for (const p of sim.living()) {
    const age = sim.ageOf(p);
    if (age < 16) continue;
    const e = pen(p);
    const job = p.job || p.formerJob;
    const yrs = clamp(Math.min(age, 67) - 18, 0, 50);
    if (CROWN.has(job)) { e.svc = Math.round(yrs * DAYS_PER_YEAR * R.range(0.4, 0.9)); e.cj = job; }
    const cat = guildCat(sim, p, job);
    if (cat) { e.g = fundKey(sim, p, cat); e.paid = r1(yrs * (DAYS_PER_YEAR / 5) * DUES[cat] * R.range(0.3, 0.8)); }
    const hh = sim.hh(p);
    if (hh && !hh.royal && !hh.bandits && !NO_SUPPORT.has(p.rank)) e.tax = r1(yrs * R.range(3, 9));
  }
  // 組合の箱の元手：いま働く組合員の家計から少しずつ（これまでの掛け金の残り）
  for (const p of sim.living()) {
    const cat = p.job && guildCat(sim, p);
    const hh = sim.hh(p);
    if (!cat || !hh || hh.money < 30) continue;
    const x = Math.min(10, hh.money * 0.05);
    hh.money -= x; fundOf(sim, fundKey(sim, p, cat)).bal += x;
  }
  // 救貧院の元手：教会の施し箱と町の蓄えから
  for (const s of S.world.settlements) {
    const t = S.towns[s.id];
    if (!t || t.occupied || !sim.townBuilding(s, 'church')) continue;
    const a = almsOf(sim, s.id);
    if (!a) continue;
    const x1 = (t.alms || 0) * 0.3, x2 = Math.max(0, t.fund || 0) * 0.08;
    t.alms = (t.alms || 0) - x1; t.fund -= x2; a.bal += x1 + x2;
  }
  return S.elder;
}

// ---------- 働けるか ----------
function frail(sim, p) {
  const age = sim.ageOf(p);
  const sc = p.scars || [];
  if (age >= 68) return 'old';
  if (sc.length >= 2 || (sc.some((s) => s.k === 'limp') && sc.some((s) => s.k === 'arm'))) return 'scar';
  if (!p.job && (p.retired || p.formerJob) && age >= 55) return 'retired';
  if (!p.job && age >= 60) return 'old';
  return null;
}
function needsCare(sim, p) {
  const age = sim.ageOf(p);
  return age >= 72 || (frail(sim, p) === 'scar' && !p.job) || (age >= 60 && (p.ail?.sev || 0) >= 50);
}
function elderlyOnly(sim, hh) {
  const mem = hh.members.map((id) => alive(sim, id)).filter(Boolean);
  return mem.length > 0 && mem.every((q) => sim.ageOf(q) >= 58 || (frail(sim, q) && !q.job));
}
function cashOf(sim, hh) { return (hh?.money || 0) + (hh?.members || []).reduce((t, id) => t + (sim.S.people[id]?.purse || 0), 0); }
function give(sim, p, amt, part) {
  const hh = sim.hh(p);
  if (hh) hh.money += amt; else p.purse = (p.purse || 0) + amt;
  const e = pen(p);
  e.got = r1((e.got || 0) + amt);
  if (!e.last || e.last.day !== sim.today) e.last = { day: sim.today, parts: {} };
  e.last.parts[part] = r1((e.last.parts[part] || 0) + amt);
}
// 子と孫（大人）
function kinOf(sim, p) {
  const kids = (p.children || []).map((id) => alive(sim, id)).filter((q) => q && sim.ageOf(q) >= 18);
  if (kids.length) return kids;
  const out = [];
  for (const c of p.children || []) { const ch = sim.S.people[c]; for (const g of ch?.children || []) { const q = alive(sim, g); if (q && sim.ageOf(q) >= 18) out.push(q); } }
  return out;
}
function canHost(sim, q, p) {
  const h = sim.hh(q);
  if (!h || h.id === p.hh || h.house == null || h.royal || h.bandits || h.street || h.inn || h.wander || h.almshouse) return null;
  if (q.jail != null || h.members.length > 7) return null;
  return h;
}

// ---------- 税の記録（前日の徴税の巡回を読む） ----------
function creditTaxes(sim) {
  const S = sim.S;
  for (const r of Object.values(S.tax?.rounds || {})) {
    if (r._eld) continue;
    r._eld = true;
    for (const [hid, e] of Object.entries(r.due || {})) {
      if (e.refuse) continue;
      const amt = (e.total || 0) * (1 - (e.hide || 0));
      const hh = S.households[hid];
      if (!hh || amt <= 0) continue;
      const mem = hh.members.map((id) => alive(sim, id)).filter((q) => q && sim.isAdult(q));
      const workers = mem.filter((q) => q.job);
      const who = workers.length ? workers : mem;
      for (const q of who) pen(q).tax = r1((pen(q).tax || 0) + amt / who.length);
    }
  }
}

// ---------- 掛け金（5日ごと） ----------
function collectDues(sim) {
  const st = E(sim), R = sim.rng;
  for (const p of sim.living()) {
    if (!p.job || p.jail != null || sim.ageOf(p) < 16) continue;
    const cat = guildCat(sim, p);
    if (!cat) continue;
    const e = pen(p), key = fundKey(sim, p, cat);
    if (e.g && e.g !== key && e.g.split(':')[0] !== cat) e.paid = r1((e.paid || 0) * 0.5);   // 業種を変えたら、前の組合での積み上げは半分だけ認める
    e.g = key;
    const f = fundOf(sim, key);
    const members = f._n || 10;
    if (f.bal > members * 60) continue;   // 箱が十分に満ちていれば、今期の掛け金は免除
    const due = DUES[cat];
    const hh = sim.hh(p);
    const fromPurse = Math.min(p.purse || 0, due);
    let paid = fromPurse;
    if (paid < due && hh && hh.money > 40) paid += Math.min(due - paid, hh.money - 40);
    if (paid < 0.3) { e.miss = (e.miss || 0) + 1; continue; }
    p.purse = (p.purse || 0) - fromPurse;
    if (paid > fromPurse) hh.money -= paid - fromPurse;
    f.bal += paid; f.in += paid;
    e.paid = r1((e.paid || 0) + paid);
    st.today.dues += paid;
    if (R.chance(0.05)) sim.remember(p, `${fundName(sim, f)}に掛け金を${r1(paid)}銅貨納めた。年をとったときの備えだ`, { emo: 0.05, imp: 0.2, k: 'pension' });
  }
  // 組合員の数（箱の満ち具合の目安）
  const cnt = {};
  for (const p of sim.living()) if (p.job && p.pen?.g) cnt[p.pen.g] = (cnt[p.pen.g] || 0) + 1;
  for (const f of Object.values(st.funds)) f._n = cnt[f.key] || 0;
}

// ---------- 大けがの後遺症で退く ----------
function injuredRetire(sim) {
  const st = E(sim), R = sim.rng;
  for (const p of sim.living()) {
    const job = p.job;
    if (!job || !(JOBS[job]?.combat || HEAVY.has(job)) || ['king', 'royal', 'noble', 'banditchief', 'thief', 'pirate', 'general'].includes(job) || JOBS[job]?.crook) continue;
    if (frail(sim, p) !== 'scar' || p.quest || p.party || p.mission || p.fight || p.jail != null || !R.chance(0.1)) continue;
    const e = pen(p);
    p.formerJob = job; p.job = null; p.retired = true; p.retiredYear = sim.year();
    e.inj = true;
    if (CROWN.has(job)) e.cj = job;
    st.stats.injured++;
    const what = CROWN.has(job) ? `${crownName(sim, p.s)}を受けることになった` : e.g ? `${fundName(sim, fundOf(sim, e.g))}に助けてもらうことになった` : 'この先の暮らしが心配だ';
    sim.remember(p, `古傷がひどく、${jobName(job)}の務めを続けられなくなって退いた。${what}`, { emo: -0.6, imp: 0.9, k: 'pension' });
    p.deeds?.push(`${sim.year()}年、古傷のため${jobName(job)}を退いた`);
    sim.pushLog(`${sim.fullName(p)}が、戦いや仕事の古傷のため${jobName(job)}の務めを退いた。`, 'event', [p.id], p.pos);
  }
}

// ---------- 給付（毎日） ----------
function benefits(sim) {
  const S = sim.S, st = E(sim), R = sim.rng;
  const gReq = {}, kReq = {};
  for (const p of sim.living()) {
    if (!p.pen || NO_SUPPORT.has(p.rank) || p.jail != null) continue;
    const e = p.pen, age = sim.ageOf(p);
    const why = frail(sim, p);
    const idle = !p.job && why;
    // 組合・兄弟団・互助講・ギルド
    if (e.g && (e.paid || 0) >= 5 && st.funds[e.g]) {
      const cat = st.funds[e.g].cat;
      const full = Math.min(CAP[cat], 0.5 + e.paid * 0.03);
      const sick = p.job && (p.ail?.sev || 0) >= 40 && age < 68;
      if (idle) (gReq[e.g] = gReq[e.g] || []).push({ p, amt: full, part: 'guild' });
      else if (sick) (gReq[e.g] = gReq[e.g] || []).push({ p, amt: full * 0.5, part: 'sick' });
    }
    if (e.widow && st.funds[e.widow.g] && !p.job) (gReq[e.widow.g] = gReq[e.widow.g] || []).push({ p, amt: e.widow.rate, part: 'widow' });
    // 国：恩給・戦傷手当・養老の下賜金・寡婦の恩給
    const k = sim.kingdomOf(p);
    if (!k) continue;
    const svcY = (e.svc || 0) / DAYS_PER_YEAR;
    let crown = 0, part = null;
    if (idle && e.cj && (svcY >= 3 || (e.inj && svcY >= 0.5))) { crown = Math.min(7, 1.2 + svcY * 0.15) * (HIGH.has(e.cj) ? 1.6 : 1) * (e.inj ? 1.3 : 1); part = 'crown'; }
    else if (!p.job && age >= 65 && (e.tax || 0) >= 60) { crown = Math.min(2.5, 0.4 + e.tax / 500); part = 'dole'; }
    if (e.cw && !p.job) { crown += e.cw; part = part || 'cwidow'; }
    if (crown > 0) (kReq[k.id] = kReq[k.id] || []).push({ p, amt: crown, part });
    // 年老いた聖職者は教会の扶持で暮らす
    if (!p.job && CLERGY.has(p.formerJob) && age >= 60) {
      const t = S.towns[p.s];
      if (t && (t.alms || 0) > 5) { const x = Math.min(2, t.alms * 0.05); t.alms -= x; give(sim, p, x, 'clergy'); st.today.clergy += x; }
    }
  }
  // 組合の箱から：足りなければ割り引く（箱の3割まで）
  for (const [key, list] of Object.entries(gReq)) {
    const f = st.funds[key];
    const want = list.reduce((t, x) => t + x.amt, 0);
    const f1 = want > 0 ? Math.min(1, (f.bal * 0.3) / want) : 0;
    for (const x of list) {
      const a = x.amt * f1;
      if (a < 0.05) continue;
      f.bal -= a; f.out += a;
      give(sim, x.p, a, x.part);
      if (x.part === 'widow') st.today.widow += a; else st.today.guild += a;
      if (R.chance(0.03)) sim.remember(x.p, x.part === 'widow' ? `亡き連れ合いの${shortFund(f)}から、遺族の手当を${r1(a)}銅貨受け取った` : x.part === 'sick' ? `病で休んだ分、${fundName(sim, f)}から${r1(a)}銅貨の見舞いが出た` : `${fundName(sim, f)}から${r1(a)}銅貨を受け取った。若いころ払っておいてよかった`, { emo: 0.4, imp: 0.3, k: 'pension' });
    }
    f.short = f1 < 0.7;
  }
  // 国庫から：国庫の4%（150銅貨を残す）を上限に割り引く
  for (const [kid, list] of Object.entries(kReq)) {
    const k = S.kingdoms[kid];
    const want = list.reduce((t, x) => t + x.amt, 0);
    const budget = Math.max(0, (k.treasury - 150) * 0.04);
    const f1 = want > 0 ? Math.min(1, budget / want) : 0;
    const wasCut = !!k.penCut;
    k.penCut = f1 < 0.6;
    if (k.penCut && !wasCut) {
      st.stats.cuts++;
      sim.news(`${k.name}の国庫が苦しく、年寄りへの恩給が減らされた`, 1, sim.town(k.capital));
      for (const x of list) if (R.chance(0.5)) sim.remember(x.p, '国庫が苦しいとかで、恩給が減らされた', { emo: -0.5, imp: 0.5, k: 'pension' });
      for (const s of S.world.settlements) if (s.kingdom === k.id && S.towns[s.id] && S.towns[s.id].unrest != null) S.towns[s.id].unrest = clamp(S.towns[s.id].unrest + 2, 0, 100);
    }
    for (const x of list) {
      const a = x.amt * f1;
      if (a < 0.05) continue;
      k.treasury -= a;
      give(sim, x.p, a, x.part);
      if (x.part === 'dole') st.today.dole += a; else st.today.crown += a;
      if (R.chance(0.03)) sim.remember(x.p, x.part === 'dole' ? `長年税を納めてきた分として、王から${r1(a)}銅貨の養老の下賜金が届いた` : `${crownName(sim, x.p.s)}を${r1(a)}銅貨受け取った。長年のお勤めの甲斐があった`, { emo: 0.4, imp: 0.3, k: 'pension' });
    }
  }
}

// ---------- 家族の扶養 ----------
function family(sim) {
  const S = sim.S, st = E(sim), R = sim.rng;
  const seen = new Set();
  for (const p of sim.living()) {
    const hh = sim.hh(p);
    if (!hh || seen.has(hh.id) || hh.royal || hh.bandits || hh.almshouse || NO_SUPPORT.has(p.rank)) continue;
    const age = sim.ageOf(p);
    if (age < 58 && !(frail(sim, p) && !p.job)) continue;
    // 同じ家に大人の子がいる：家督を譲って養ってもらう（隠居契約）
    if (!elderlyOnly(sim, hh)) {
      const e = pen(p);
      if (!e.care && (p.retired || !p.job) && age >= 60) {
        const kid = (p.children || []).map((id) => alive(sim, id)).find((q) => q && q.hh === hh.id && sim.ageOf(q) >= 18);
        const owns = (hh.land || 0) > 0 || S.world.buildings.some((b) => b.owner === hh.id && b.type === 'house');
        if (kid && owns) {
          e.care = { k: 'kyo', by: kid.id, day: sim.today };
          st.stats.kyo++;
          sim.remember(p, `家と畑を${kid.given}に任せ、そのかわり死ぬまで面倒を見てもらう約束（隠居契約）を交わした`, { emo: 0.4, imp: 0.8, about: [kid.id], k: 'pension' });
          sim.remember(kid, `${sim.kinTerm(kid, p) || p.given}から家督を譲られた。これからは${sim.kinTerm(kid, p) || p.given}を養っていく`, { emo: 0.3, imp: 0.8, about: [p.id], k: 'pension' });
        } else if (kid) e.care = { k: 'taken', by: kid.id, day: sim.today, home: true };
      }
      // 約束を守らない子：村長が隠居分を払わせる
      if (e.care?.k === 'kyo' && p.needs && p.needs.hunger < 20 && hh.food < 1 && hh.money > 60 && R.chance(0.2)) {
        const kid = alive(sim, e.care.by);
        if (kid && kid.hh === hh.id) {
          const x = Math.min(10, hh.money * 0.1);
          hh.money -= x; p.purse = (p.purse || 0) + x;
          st.stats.neglect++;
          sim.remember(p, `${kid.given}が約束の食い扶持をよこさないので、村の寄合に訴えた。${r1(x)}銅貨の隠居分を渡すよう言い渡された`, { emo: -0.5, imp: 0.7, about: [kid.id], k: 'pension' });
          sim.remember(kid, `${sim.kinTerm(kid, p) || p.given}の世話をおろそかにして、寄合で叱られた`, { emo: -0.6, imp: 0.6, about: [p.id], k: 'pension' });
          sim.relMut(p, kid).a -= 8;
          sim.gossip(kid, '年寄りの親を飢えさせて、寄合で叱られたらしい', -0.5, sim.living().filter((q) => q.s === p.s && q.hh !== hh.id).slice(0, 10), { silent: true });
        }
      }
      continue;
    }
    seen.add(hh.id);
    const mem = hh.members.map((id) => alive(sim, id)).filter(Boolean);
    const poor = cashOf(sim, hh) < 30 || hh.street || hh.inn;
    const needy = mem.some((q) => needsCare(sim, q)) || poor;
    // 子や孫が引き取る
    if (needy && !hh.wander) {
      const able = mem.some((q) => sim.ageOf(q) < 72 && !needsCare(sim, q));
      if (!(able && !poor)) {
        const kin = [...new Map(mem.flatMap((q) => kinOf(sim, q).map((k) => [k.id, [k, q]]))).values()]
          .map(([k, q]) => ({ k, q, h: canHost(sim, k, q) })).filter((x) => x.h && sim.rel(x.k, x.q).a > -30);
        kin.sort((a, b) => (b.k.s === b.q.s ? 30 : 0) + sim.rel(b.k, b.q).a + b.k.values.family * 30 + b.h.money / 10 - ((a.k.s === a.q.s ? 30 : 0) + sim.rel(a.k, a.q).a + a.k.values.family * 30 + a.h.money / 10));
        const best = kin[0];
        if (best && R.chance(0.25 * (0.4 + best.k.values.family) * (0.5 + best.k.pers.A))) {
          const owns = (hh.land || 0) > 0 || S.world.buildings.some((b) => b.owner === hh.id && (b.type === 'house' || b.type === 'mansion'));
          const k = best.k, host = best.h;
          const names = mem.map((q) => q.given).join('と');
          for (const q of mem) {
            const moved = q.s !== k.s;
            sim.moveTo(q, host);
            if (moved) q.s = k.s;
            q.action = null;
            pen(q).care = { k: owns ? 'kyo' : 'taken', by: k.id, day: sim.today };
            sim.remember(q, owns ? `家と畑を${k.given}の家に譲り、そのかわり${k.given}の家に引き取られて養ってもらうことになった（隠居契約）` : `ひとりで暮らすのが難しくなり、${k.given}の家に引き取られた`, { emo: 0.3, imp: 0.85, about: [k.id], k: 'pension' });
            sim.relMut(q, k).a += 5;
          }
          st.stats.takenIn += mem.length;
          if (owns) st.stats.kyo++;
          sim.remember(k, `${sim.kinTerm(k, best.q) || best.q.given}（${names}）を家に引き取った${owns ? '。家督も受け継いだ' : ''}`, { emo: 0.3, imp: 0.8, about: mem.map((q) => q.id), k: 'pension' });
          sim.gossip(k, `年老いた${sim.kinTerm(k, best.q) || '親'}を家に引き取ったらしい`, 0.4, sim.living().filter((q) => q.s === k.s && q.hh !== host.id).slice(0, 12), { silent: true, congrat: '親御さんを引き取ったんだってね。えらいね' });
          sim.pushLog(`${sim.fullName(k)}が、年老いた${names}を家に引き取った${owns ? '（隠居契約）' : ''}。`, 'event', [k.id, ...mem.map((q) => q.id)], k.pos);
          continue;
        }
      }
    }
    // 離れて暮らす子からの仕送り（5日ごと）
    if (sim.today % 5 === REMIT_DAY && cashOf(sim, hh) < 45 && !hh.street) {
      const done = new Set();
      for (const q of mem) for (const k of kinOf(sim, q)) {
        const kh = sim.hh(k);
        if (!kh || kh.id === hh.id || done.has(kh.id) || kh.money < 90 || sim.rel(k, q).a < -20) continue;
        done.add(kh.id);
        const x = Math.min(8, (kh.money - 90) * 0.08) * (0.4 + k.values.family);
        if (x < 0.5) continue;
        kh.money -= x; hh.money += x;
        st.today.remit += x;
        pen(q).last = pen(q).last?.day === sim.today ? pen(q).last : { day: sim.today, parts: {} };
        pen(q).last.parts.remit = r1((pen(q).last.parts.remit || 0) + x);
        if (R.chance(0.25)) {
          sim.remember(q, `${sim.kinTerm(q, k) || k.given}の${k.given}から${r1(x)}銅貨の仕送りが届いた`, { emo: 0.5, imp: 0.4, about: [k.id], k: 'pension' });
          sim.remember(k, `${sim.kinTerm(k, q) || q.given}に${r1(x)}銅貨を仕送りした`, { emo: 0.2, imp: 0.3, about: [q.id], k: 'pension' });
        }
      }
    }
  }
}

// ---------- 救貧院（教会が営む） ----------
function almsOf(sim, sid) {
  const S = sim.S, st = S.elder;
  if (st.alms[sid]) return st.alms[sid];
  const s = sim.town(sid);
  if (!s || !sim.townBuilding(s, 'church')) return null;
  return (st.alms[sid] = { hh: null, bal: 0, cap: CARE_CAP[s.type] || 4, name: almsName(sim, s), admitted: 0, fed: 0 });
}
function almsHh(sim, sid) {
  const S = sim.S, a = almsOf(sim, sid);
  if (!a) return null;
  if (a.hh != null && S.households[a.hh]) return S.households[a.hh];
  const church = sim.townBuilding(sim.town(sid), 'church');
  if (!church) return null;
  const id = S.nextHh++;
  S.households[id] = { id, members: [], house: church.id, s: sid, money: 0, food: 0, comfort: 0, name: a.name, almshouse: true };
  a.hh = id;
  return S.households[id];
}
function seller(sim, sid) {
  const L = sim.living();
  return L.find((q) => q.s === sid && q.job === 'baker' && sim.hh(q)) || L.find((q) => q.s === sid && q.job === 'merchant' && sim.hh(q)) || null;
}
// 救貧院がパンを買う（お金は町のパン屋・商人へ）
function buyBread(sim, a, sid, qty) {
  const st = E(sim), price = sim.price('bread', sid), m = sim.market(sid);
  const pay = Math.min(a.bal, qty * price);
  if (pay <= 0) return 0;
  const got = pay / price;
  a.bal -= pay;
  const sl = seller(sim, sid);
  if (sl) sim.hh(sl).money += pay; else st.today.market += pay;
  if (m?.stock?.bread != null) m.stock.bread = Math.max(0, m.stock.bread - got);
  st.today.almsFood += pay;
  return got;
}
// 寄進された家と畑を手放す（最後の入居者が亡くなったときに、身内へ流れないように）
function liquidate(sim, hh, a) {
  const S = sim.S;
  for (const b of S.world.buildings) {
    if (b.owner !== hh.id || (b.type !== 'house' && b.type !== 'mansion')) continue;
    const val = b.value || 200;
    const buyer = Object.values(S.households).filter((h) => h.s === hh.s && h.id !== hh.id && !h.almshouse && !h.bandits && h.money > val * 0.7 + 60).sort((x, y) => y.money - x.money)[0];
    if (buyer) { const price = val * 0.6; buyer.money -= price; a.bal += price; b.owner = buyer.id; if (b.hh === buyer.id) { b.rent = 0; b.arrears = 0; } }
    else { b.owner = null; b.rent = 0; b.arrears = 0; }
  }
  if (hh.land > 0) {
    const buyer = Object.values(S.households).filter((h) => h.s === hh.s && h.id !== hh.id && !h.almshouse && (h.land || 0) > 0 && h.money > hh.land * 40 + 60).sort((x, y) => y.land - x.land)[0];
    if (buyer) { const price = hh.land * 40; buyer.money -= price; a.bal += price; buyer.land += hh.land; }
    else { const lord = Object.values(S.households).filter((h) => h.s === hh.s && h.id !== hh.id && !h.almshouse && (h.land || 0) >= 4).sort((x, y) => y.land - x.land)[0]; if (lord) lord.land += hh.land; }
    hh.land = 0;
  }
  // 家畜は院で飼う（c.keeper はそのまま。手放すと野生扱いになり、住処のない獣になってしまう）
}

function almshouses(sim) {
  const S = sim.S, st = E(sim), R = sim.rng;
  const L = sim.living();
  for (const s of S.world.settlements) {
    const t = S.towns[s.id];
    if (!t || t.occupied) continue;
    const a = almsOf(sim, s.id);
    if (!a) continue;
    const south = !!KINGDOMS[s.kingdom]?.south;
    const carers = L.filter((q) => q.s === s.id && (q.job === 'priest' || q.job === 'nun') && q.jail == null);
    // --- 入居 ---
    const hh0 = a.hh != null ? S.households[a.hh] : null;
    let room = a.cap - (hh0 ? hh0.members.filter((id) => alive(sim, id)).length : 0);
    if (room > 0) {
      const cands = [];
      const seen = new Set();
      for (const p of L) {
        if (p.s !== s.id || seen.has(p.hh) || NO_SUPPORT.has(p.rank) || p.jail != null || p.party) continue;
        const hh = sim.hh(p);
        if (!hh || hh.almshouse || hh.royal || hh.bandits || hh.wander) continue;
        const age = sim.ageOf(p);
        const beggarOld = p.job === 'beggar' && age >= 60;
        if (!beggarOld && (p.job || !(age >= 65 || frail(sim, p) === 'scar'))) continue;
        if (!elderlyOnly(sim, hh)) continue;
        const mem = hh.members.map((id) => alive(sim, id)).filter(Boolean);
        if (mem.some((q) => kinOf(sim, q).some((k) => canHost(sim, k, q)))) continue;   // 引き取れる子や孫がいる
        seen.add(hh.id);
        const cash = cashOf(sim, hh);
        const owns = S.world.buildings.some((b) => b.owner === hh.id && (b.type === 'house' || b.type === 'mansion'));
        const childless = mem.every((q) => !(q.children || []).some((id) => alive(sim, id)));
        const poor = cash < 35 || hh.street || hh.inn || beggarOld;
        const corrody = !poor && childless && age >= 70 && (owns || cash > 120) && R.chance(0.08 + (needsCare(sim, p) ? 0.2 : 0));
        if (poor && (needsCare(sim, p) || hh.street || beggarOld || R.chance(0.15))) cands.push({ hh, mem, corrody: false, pri: (hh.street ? 3 : 0) + (needsCare(sim, p) ? 2 : 0) - cash / 20 });
        else if (corrody) cands.push({ hh, mem, corrody: true, pri: 1 });
      }
      cands.sort((x, y) => y.pri - x.pri);
      for (const c of cands) {
        if (c.mem.length > room) continue;
        if (!c.corrody && a.bal < 8 * c.mem.length) continue;   // 養う余裕がない
        const home = almsHh(sim, s.id);
        if (!home) break;
        const oldName = c.hh.name;
        for (const q of c.mem) {
          if (q.job === 'beggar') { q.formerJob = 'beggar'; q.job = null; }
          if (q.rank === 'homeless') q.rank = 'commoner';
          if (q.inside != null) { q.inside = null; }
          q.action = null;
          sim.moveTo(q, home);
          pen(q).care = { k: c.corrody ? 'corrody' : 'alms', day: sim.today };
        }
        // 古い家が空になると、家・畑・家計は救貧院へ寄進される（moveTo → transferEstate）
        if (S.households[c.hh.id]) { // まだ残っている（ありえないが念のため）
          for (const q of c.hh.members.slice()) { const pq = alive(sim, q); if (pq) sim.moveTo(pq, home); }
        }
        liquidate(sim, home, a);
        room -= c.mem.length;
        a.admitted += c.mem.length;
        st.stats.admitted += c.mem.length;
        if (c.corrody) st.stats.corrody += c.mem.length;
        const names = c.mem.map((q) => q.given).join('と');
        const carer = carers[0];
        for (const q of c.mem) {
          sim.remember(q, c.corrody
            ? (south ? `家と蓄えをワクフとして寄進し、${a.name}で死ぬまで食と住を受けることになった` : `家と蓄えを教会に寄進し、${a.name}で死ぬまで食と住を受ける養老の契約を結んだ`)
            : `身寄りも蓄えもなく、${a.name}に入れてもらった${carer ? `。${carer.given}さまが迎えてくれた` : ''}`, { emo: c.corrody ? 0.3 : 0.1, imp: 0.85, about: carer ? [carer.id] : [], k: 'pension' });
        }
        if (carer) sim.remember(carer, `${names}を${a.name}に迎えた`, { emo: 0.3, imp: 0.4, about: c.mem.map((q) => q.id), k: 'pension' });
        sim.pushLog(`${oldName ? oldName + 'の' : ''}${names}が${c.corrody ? '財産を寄進して' : ''}${a.name}に入った。`, 'event', c.mem.map((q) => q.id), sim.building(home.house)?.door || null);
        if (room <= 0) break;
      }
    }
    // --- 運営 ---
    const home = a.hh != null ? S.households[a.hh] : null;
    const res = home ? home.members.map((id) => alive(sim, id)).filter(Boolean) : [];
    if (home && home.money > 10) { a.bal += home.money - 10; home.money = 10; }   // 入居者の恩給・寄進は院の蓄えへ
    const target = res.length * 15 + 20;
    if (a.bal < target) {
      const x1 = Math.min((t.alms || 0) * 0.3, target - a.bal);
      if (x1 > 0) { t.alms -= x1; a.bal += x1; st.today.almsFund += x1; }
      const x2 = t.fund > 60 ? Math.min(t.fund * 0.08, target - a.bal) : 0;
      if (x2 > 0) { t.fund -= x2; a.bal += x2; st.today.almsFund += x2; }
    }
    // 寄進（週に1度）：信心深い豊かな家
    if (sim.today % 7 === 2) {
      for (const h of Object.values(S.households)) {
        if (h.s !== s.id || h.almshouse || h.royal || h.bandits || h.money < 300) continue;
        const head = h.members.map((id) => alive(sim, id)).filter(Boolean).sort((x, y) => sim.ageOf(y) - sim.ageOf(x))[0];
        if (!head || head.values.faith < 0.6 || !R.chance(0.5)) continue;
        const x = Math.min(30, (h.money - 300) * 0.05);
        h.money -= x; a.bal += x; st.today.gifts += x;
        if (R.chance(0.5)) sim.remember(head, south ? `${a.name}にワクフとして${r1(x)}銅貨を寄進した` : `${a.name}に${r1(x)}銅貨を寄進した`, { emo: 0.4, imp: 0.4, k: 'pension' });
        head.needs && (head.needs.esteem = Math.min(100, head.needs.esteem + 6));
      }
    }
    if (home && res.length) {
      // 食べ物：1人3食分を切らさない
      const need = res.length * 3.2 - home.food;
      if (need > 0) home.food += buyBread(sim, a, s.id, need);
      // 世話：司祭・修道女が病を看る
      if (carers.length) {
        for (const q of res) if (q.ail) q.ail.sev = Math.max(0, (q.ail.sev || 0) - 4);
        const c = R.pick(carers);
        if (c.needs) c.needs.esteem = Math.min(100, c.needs.esteem + 3);
        if (R.chance(0.15)) {
          const q = R.pick(res);
          sim.remember(q, R.pick([`${c.given}さまが温かい粥を運んでくれた`, `${c.given}さまに背中をさすってもらった`, `${c.given}さまと一緒に祈りをささげた`]), { emo: 0.5, imp: 0.3, about: [c.id], k: 'pension' });
          sim.relMut(q, c).a += 2;
        }
      }
      for (const q of res) if (q.needs) q.needs.survival = Math.min(100, q.needs.survival + 5);
    } else if (home && !res.length) {
      // 誰もいなくなった院は、残った物を片づける
      if (home.money > 0) { a.bal += home.money; home.money = 0; }
    }
    // 門前の施し：飢えた年寄りにパンを
    let doles = 0;
    for (const p of L) {
      if (doles >= 4) break;
      if (p.s !== s.id || !p.needs || p.needs.hunger > 30 || sim.ageOf(p) < 60 || p.hh === a.hh) continue;
      const hh = sim.hh(p);
      if (hh && cashOf(sim, hh) >= 8 && hh.food >= 1) continue;
      if (a.bal < sim.price('bread', s.id) * 2) break;
      const got = buyBread(sim, a, s.id, 1);
      if (got <= 0) break;
      p.needs.hunger = Math.min(100, p.needs.hunger + 45 * got);
      doles++; a.fed++; st.stats.doles++;
      if (R.chance(0.4)) sim.remember(p, `${a.name}の門前で、施しのパンをもらった`, { emo: 0.3, imp: 0.4, k: 'relief' });
    }
    // 蓄えが余れば施し箱へ戻す
    if (a.bal > 400) { t.alms = (t.alms || 0) + (a.bal - 400); a.bal = 400; }
  }
}

// ---------- 年寄りの役割（相談役・長老の知恵） ----------
function roles(sim) {
  const S = sim.S, st = E(sim), R = sim.rng;
  const L = sim.living();
  for (const s of S.world.settlements) {
    if (S.towns[s.id]?.occupied) continue;
    const olds = L.filter((p) => p.s === s.id && !p.job && p.formerJob && sim.ageOf(p) >= 58 && p.jail == null && (p.ail?.sev || 0) < 50 && p.needs);
    let n = 0;
    for (const o of R.shuffle(olds)) {
      if (n >= 3) break;
      const job = o.formerJob, es = o.skill?.[job] || 0;
      if (es < 0.5 || !R.chance(0.2)) continue;
      const young = L.filter((q) => q.s === s.id && q.job === job && q.id !== o.id && sim.ageOf(q) < 35 && (q.skill?.[job] || 0) < es);
      if (!young.length) continue;
      const q = R.pick(young);
      q.skill[job] = Math.min(1, (q.skill[job] || 0) + 0.01 * (es - (q.skill[job] || 0)) + 0.002);
      o.needs.esteem = Math.min(100, o.needs.esteem + 12);
      sim.relMut(o, q).a += 3; sim.relMut(q, o).a += 3;
      sim.remember(o, `若い${jobName(job)}の${q.given}に、昔の知恵を教えてやった`, { emo: 0.5, imp: 0.35, about: [q.id], k: 'elderrole' });
      sim.remember(q, `元${jobName(job)}の${o.given}さんに、仕事のコツを教わった`, { emo: 0.4, imp: 0.35, about: [o.id], k: 'elderrole' });
      st.stats.advice++; n++;
    }
    // 長老の知恵：村長や町の役人が、年寄りに相談しに来る
    const chief = L.find((q) => q.s === s.id && ['elder', 'noble', 'chancellor', 'overseer'].includes(q.job) && sim.ageOf(q) < 70);
    const sages = L.filter((p) => p.s === s.id && sim.ageOf(p) >= 65 && !p.job && p.needs && p.id !== chief?.id && (p.pers.O + p.pers.C) > 1);
    if (chief && sages.length && R.chance(0.12)) {
      const o = sages.sort((a, b) => (b.pers.O + b.pers.C + sim.ageOf(b) / 50) - (a.pers.O + a.pers.C + sim.ageOf(a) / 50))[0];
      const what = R.pick(['畑の境目をめぐる争い', '井戸の割り当て', '祭りのしきたり', '日照りの年の備え', '若者どうしのけんか']);
      o.needs.esteem = Math.min(100, o.needs.esteem + 15);
      sim.relMut(chief, o).a += 3;
      sim.remember(o, `${jobName(chief.job)}の${chief.given}が、${what}のことで知恵を借りに来た`, { emo: 0.6, imp: 0.45, about: [chief.id], k: 'elderrole' });
      sim.remember(chief, `${what}のことで、長老の${o.given}さんに知恵を借りた`, { emo: 0.3, imp: 0.35, about: [o.id], k: 'elderrole' });
      if (S.towns[s.id].unrest != null) S.towns[s.id].unrest = Math.max(0, S.towns[s.id].unrest - 0.3);
      st.stats.counsel++;
    }
  }
}

// ---------- 亡くなった人：組合の弔い・寡婦の手当・孤独死 ----------
function deaths(sim) {
  const S = sim.S, st = E(sim), R = sim.rng;
  const graves = S.graves || [];
  if (st.graveIdx > graves.length) st.graveIdx = graves.length;
  for (let i = st.graveIdx; i < graves.length; i++) {
    const p = S.people[graves[i]];
    if (!p || p.deathYear == null) continue;
    const e = p.pen || {};
    const age = sim.ageOf(p);
    const heir = alive(sim, p.estate?.to) || alive(sim, p.spouseId);
    const f = e.g && st.funds[e.g];
    // 組合の弔いの費用
    if (f && (e.paid || 0) >= 5 && heir && sim.hh(heir) && f.bal > 3) {
      const x = Math.min(10, f.bal * 0.3);
      f.bal -= x; f.out += x; sim.hh(heir).money += x;
      st.today.funeral += x; st.stats.funerals++;
      sim.remember(heir, `${fundName(sim, f)}が、${p.given}の弔いの費用を${r1(x)}銅貨出してくれた`, { emo: 0.3, imp: 0.5, about: [p.id], k: 'pension' });
    }
    // 残された連れ合い
    const sp = alive(sim, p.spouseId);
    if (sp && (sim.ageOf(sp) >= 50 || (sp.children || []).some((id) => { const c = alive(sim, id); return c && sim.ageOf(c) < 14; }))) {
      const se = pen(sp);
      if (f && (e.paid || 0) >= 5) { se.widow = { g: f.key, rate: r1(Math.min(CAP[f.cat], 0.5 + e.paid * 0.03) * 0.5) }; st.stats.widows++; }
      if (e.cj && (e.svc || 0) >= DAYS_PER_YEAR * 3) { se.cw = r1(Math.min(3, 0.6 + e.svc / DAYS_PER_YEAR * 0.07)); st.stats.widows++; }
      if (se.widow || se.cw) sim.remember(sp, `${p.given}に先立たれた。${se.cw ? '国から遺族の恩給が出ることになった' : `${fundName(sim, f)}から遺族の手当が出ることになった`}`, { emo: -0.2, imp: 0.6, about: [p.id], k: 'pension' });
    }
    // 孤独死：ひとり暮らしの年寄りが、誰にも看取られずに
    if (age >= 60 && !['alms', 'corrody'].includes(e.care?.k) && ['old', 'hunger', 'sick', 'illness', 'winter', 'fever'].includes(p.deathCause)) {
      const hh = S.households[p.hh];
      const alone = !hh || !hh.members.some((id) => alive(sim, id));
      const kinNear = (p.children || []).some((id) => { const c = alive(sim, id); return c && c.s === p.s; });
      if (alone && !kinNear) {
        st.stats.lonely++;
        const t = S.towns[p.s], a = almsOf(sim, p.s);
        sim.pushLog(`${sim.fullName(p)}（${age}歳）が、ひとり暮らしの家で誰にも看取られずに亡くなっているのが見つかった。`, 'death', [p.id], p.pos);
        for (const q of sim.living().filter((q) => q.s === p.s && sim.isAdult(q)).slice(0, 40)) {
          if (R.chance(0.25)) sim.remember(q, `${p.given}さんがひとりで亡くなっていたと聞いた。もっと気にかけてあげればよかった`, { emo: -0.5, imp: 0.5, about: [p.id], k: 'lonely' });
        }
        // 町の人々が救貧院に寄進する
        if (a && t && t.fund > 40) { const x = Math.min(20, t.fund * 0.1); t.fund -= x; a.bal += x; st.today.gifts += x; }
      }
    }
  }
  st.graveIdx = graves.length;
}

// ---------- 毎日（sim.newDay で careerDaily の直後、taxesDaily より前） ----------
export function elderDaily(sim) {
  const st = E(sim);
  if (st.lastDay === sim.today) return;
  st.lastDay = sim.today;
  for (const [k, v] of Object.entries(st.today)) st.stats[k] = (st.stats[k] || 0) + v;
  st.today = blankDay();
  creditTaxes(sim);
  // 国の勤めの日数
  for (const p of sim.living()) if (p.job && CROWN.has(p.job) && p.jail == null) { const e = pen(p); e.svc = (e.svc || 0) + 1; e.cj = p.job; }
  if (sim.today % 5 === DUE_DAY) collectDues(sim);
  injuredRetire(sim);
  benefits(sim);
  family(sim);
  almshouses(sim);
  roles(sim);
  deaths(sim);
}

// ---------- 支えの一覧（詳細欄・心の声・会話で共通） ----------
function supportsOf(sim, p) {
  const st = sim.S.elder;
  if (!st || !p.pen) return [];
  const e = p.pen, out = [];
  const lp = e.last && sim.today - e.last.day <= 1 ? e.last.parts : {};
  if (lp.crown) out.push({ k: 'crown', txt: `${crownName(sim, p.s)} 1日${r1(lp.crown)}銅貨` });
  if (lp.dole) out.push({ k: 'dole', txt: `王の養老下賜金 1日${r1(lp.dole)}銅貨` });
  if (lp.cwidow) out.push({ k: 'cwidow', txt: `国の遺族恩給 1日${r1(lp.cwidow)}銅貨` });
  if (lp.guild) out.push({ k: 'guild', txt: `${fundName(sim, st.funds[e.g])} 1日${r1(lp.guild)}銅貨` });
  if (lp.sick) out.push({ k: 'sick', txt: `${shortFund(st.funds[e.g])}の病気見舞い 1日${r1(lp.sick)}銅貨` });
  if (lp.widow) out.push({ k: 'widow', txt: `${shortFund(st.funds[e.widow?.g])}の遺族手当 1日${r1(lp.widow)}銅貨` });
  if (lp.clergy) out.push({ k: 'clergy', txt: `教会の扶持 1日${r1(lp.clergy)}銅貨` });
  if (e.last && sim.today - e.last.day <= 5 && e.last.parts.remit) out.push({ k: 'remit', txt: `子や孫の仕送り ${r1(e.last.parts.remit)}銅貨` });
  const c = e.care;
  if (c) {
    const by = alive(sim, c.by);
    const a = sim.hh(p)?.almshouse ? Object.values(st.alms).find((x) => x.hh === p.hh) : null;
    if (c.k === 'kyo' && by) out.push({ k: 'kyo', txt: `${by.given}の家で暮らす（隠居契約）` });
    else if (c.k === 'taken' && by && by.hh === p.hh) out.push({ k: 'taken', txt: `${by.given}の家に引き取られている` });
    else if ((c.k === 'alms' || c.k === 'corrody') && a) out.push({ k: c.k, txt: c.k === 'corrody' ? `${a.name}（財産を寄進した養老の契約）` : a.name });
  }
  return out;
}
function destitute(sim, p) {
  if (sim.ageOf(p) < 60 || p.job && p.job !== 'beggar') return false;
  const hh = sim.hh(p);
  if (hh?.almshouse) return false;
  if (hh && hh.members.some((id) => { const q = alive(sim, id); return q && q.job && sim.ageOf(q) < 60; })) return false;
  return cashOf(sim, hh) < 8 && !supportsOf(sim, p).length;
}

// ---------- 心の声 ----------
export function elderThought(sim, p) {
  const st = sim.S.elder;
  if (!st || !p.pen || sim.ageOf(p) < 16) return null;
  const R = sim.rng, e = p.pen, age = sim.ageOf(p), south = isSouth(sim, p.s);
  const sup = supportsOf(sim, p), has = (k) => sup.some((x) => x.k === k);
  const opts = [];
  if (has('guild')) {
    const f = st.funds[e.g];
    opts.push(f?.cat === 'craft' ? (south ? '同業組合の箱に払い続けた甲斐があった。' : '若いころ組合に払っておいてよかった。') : `若いころ${shortFund(f)}に払っておいてよかった。`, '働けなくなっても、仲間が支えてくれる。');
  }
  if (has('sick')) opts.push('病で休んでも、組合の見舞いがあるから助かる。');
  if (has('crown')) opts.push('長年のお勤めの恩給が、今日も届いた。ありがたい。', e.inj ? 'この古傷は、国のために負ったものだ。' : '若いころの務めが、いまの暮らしを支えている。');
  if (has('dole')) opts.push('税を納め続けた分、王さまが面倒を見てくださる。', '払った税が、こうして戻ってくるとはな。');
  if (has('widow') || has('cwidow')) opts.push('あの人が遺してくれた手当で、なんとか暮らしていける。');
  if (has('remit')) opts.push('子どもからの仕送りが届いた。無理をしていなければいいが。');
  if (has('kyo')) opts.push('家督を譲った以上、口出しは控えよう。', '約束どおり、ちゃんと食べさせてもらっている。');
  if (has('taken')) { const by = alive(sim, e.care?.by); if (by) opts.push(`${by.given}の家に厄介になって、肩身は狭いが食べるには困らない。`, `${by.given}の子らの相手をするのが、いまの楽しみだ。`); }
  if (has('alms')) opts.push(south ? 'ワクフの養老院の粥は温かい。' : '修道女さまのおかげで、屋根の下で眠れる。', 'ここの仲間と昔話をするのも悪くない。');
  if (has('corrody')) opts.push('家を寄進したから、死ぬまで食べる心配はない。');
  if (!sup.length && destitute(sim, p)) opts.push('身寄りも蓄えもない……明日の食べ物はどうしよう。', '若いころに、少しでも備えておけばよかった。');
  if (p.job && e.g && age >= 25 && age < 58 && R.chance(0.3)) opts.push('組合の掛け金は痛いが、年をとったときの備えだ。');
  if (p.job && !e.g && !CROWN.has(p.job) && age >= 50 && age < 60 && !kinOf(sim, p).length) opts.push('このまま年をとったら、誰が面倒を見てくれるのだろう。');
  if (p.memories?.some((m) => m.k === 'elderrole' && sim.today - m.t < 3)) opts.push('年寄りの知恵も、まだまだ捨てたもんじゃない。');
  if (!opts.length) return null;
  return R.pick(opts);
}

// ---------- 会話 ----------
export function elderTopicWeight(sim, A, B) {
  if (!sim.S.elder || !A.pen) return 0;
  const age = sim.ageOf(A);
  if (age >= 58 && supportsOf(sim, A).length) return 0.8;
  if (destitute(sim, A)) return 1.2;
  if (A.job && A.pen.g && age >= 30 && age < 58) return 0.2;
  return 0;
}
export function elderTopic(sim, A, B, v) {
  const R = sim.rng, sup = supportsOf(sim, A), has = (k) => sup.some((x) => x.k === k);
  if (has('guild')) return { kind: 'boast', text: v.s(R.pick(['若いころ組合に払っておいたおかげで、いまも食うに困らない', '組合の仲間が、ちゃんと年寄りの面倒を見てくれる']), 'v'), sentiment: 0.4 };
  if (has('crown')) return { kind: 'boast', text: v.s(R.pick(['長年お勤めした分、恩給が出ている', '国のために働いた甲斐があった']), 'v'), sentiment: 0.4 };
  if (has('dole')) return { kind: 'boast', text: v.s('長年税を納めてきたから、王さまから養老の下賜金が出る', 'v'), sentiment: 0.3 };
  if (has('alms') || has('corrody')) return { kind: 'weather', text: v.s(R.pick(['いまは教会の世話になって暮らしている', '救貧院の暮らしも、慣れれば悪くない']), 'v'), sentiment: 0.1 };
  if (has('kyo') || has('taken')) return { kind: 'weather', text: v.s(R.pick(['家のことはもう子どもに任せた', '子どもの家で、孫の相手をしながら暮らしている']), 'v'), sentiment: 0.2 };
  if (has('remit')) return { kind: 'boast', text: v.s('子どもが仕送りをしてくれる。ありがたい', 'v'), sentiment: 0.3 };
  if (destitute(sim, A)) return { kind: 'complain', text: v.s(R.pick(['身寄りも蓄えもなくて、この先が心細い', '年をとって働けなくなると、つらい']), 'v'), sentiment: -0.5 };
  if (A.pen?.g) return { kind: 'weather', text: v.s('組合の掛け金は痛いけど、老後の備えだと思って払っている', 'v'), sentiment: 0 };
  return { kind: 'weather', text: v.s('年をとったときのことを、ときどき考える', 'v'), sentiment: 0 };
}

// ---------- 詳細欄 ----------
export function elderCard(sim, p) {
  const st = sim.S.elder;
  if (!st || !p.pen || p.deathYear != null || sim.ageOf(p) < 16) return [];
  const e = p.pen, rows = [];
  const sup = supportsOf(sim, p);
  if (sup.length) rows.push(['老後の支え', sup.map((x) => x.txt).join('・')]);
  else if (destitute(sim, p)) rows.push(['老後の支え', 'なし（身寄りも蓄えもない）']);
  const f = e.g && st.funds[e.g];
  if (f && (e.paid || 0) > 0) rows.push([p.job ? '掛け金' : 'かつての掛け金', `${fundName(sim, f)}に${Math.round(e.paid)}銅貨${f.short ? '（箱が乏しい）' : ''}`]);
  if ((e.svc || 0) >= DAYS_PER_YEAR) rows.push(['国の勤め', `${Math.floor(e.svc / DAYS_PER_YEAR)}年${e.inj ? '（戦傷で退役）' : ''}`]);
  if ((e.tax || 0) >= 1) rows.push(['納めた税', `およそ${Math.round(e.tax)}銅貨`]);
  if ((e.got || 0) >= 1) rows.push(['受けた給付', `これまでに${Math.round(e.got)}銅貨`]);
  return rows;
}
// 教会の詳細欄に出す行
export function elderBuildingRows(sim, b) {
  const st = sim.S.elder;
  if (!st || !b || b.type !== 'church') return [];
  const s = sim.S.world.settlements.find((t) => t.buildings.includes(b.id));
  const a = s && st.alms[s.id];
  if (!a) return [];
  const hh = a.hh != null ? sim.S.households[a.hh] : null;
  const res = hh ? hh.members.map((id) => alive(sim, id)).filter(Boolean) : [];
  return [[a.name, `入居 ${res.length}／${a.cap}人・蓄え${Math.round(a.bal)}銅貨・門前の施し ${a.fed}回`], ...(res.length ? [['入居者', res.map((q) => `${q.given}（${sim.ageOf(q)}）`).join('、')]] : [])];
}

// ---------- 集計（試験・画面用） ----------
export function elderReport(sim) {
  const st = sim.S.elder;
  if (!st) return null;
  const L = sim.living();
  const olds = L.filter((p) => sim.ageOf(p) >= 60);
  const cnt = { crown: 0, dole: 0, guild: 0, widow: 0, remit: 0, kyo: 0, taken: 0, alms: 0, corrody: 0, clergy: 0, destitute: 0, none: 0, working: 0 };
  for (const p of olds) {
    if (p.job && p.job !== 'beggar') { cnt.working++; continue; }
    const sup = supportsOf(sim, p);
    for (const k of new Set(sup.map((x) => (x.k === 'cwidow' ? 'widow' : x.k === 'sick' ? 'guild' : x.k)))) cnt[k]++;
    const inFamily = sim.hh(p)?.members.some((id) => { const q = alive(sim, id); return q && q.job && sim.ageOf(q) < 60; });
    if (!sup.length) { if (destitute(sim, p)) cnt.destitute++; else if (!inFamily) cnt.none++; }
  }
  const funds = Object.values(st.funds).map((f) => ({ name: fundName(sim, f), bal: Math.round(f.bal), in: Math.round(f.in), out: Math.round(f.out), n: f._n || 0 }));
  const alms = Object.entries(st.alms).map(([sid, a]) => { const hh = a.hh != null ? sim.S.households[a.hh] : null; return { name: a.name, res: hh ? hh.members.filter((id) => alive(sim, id)).length : 0, cap: a.cap, bal: Math.round(a.bal), fed: a.fed }; });
  return { olds: olds.length, cnt, stats: Object.fromEntries(Object.entries(st.stats).map(([k, v]) => [k, Math.round(v)])), funds, alms };
}
