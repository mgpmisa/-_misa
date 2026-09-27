// 裁きと公開処刑（開発部）
//
// 社長の指示：殺人などの重罪を犯した者は公開処刑にし、見た人々に「罪を犯した者の末路」を戒める。
// 今までは犯罪者に甘かった（裁きは underworld.js の簡単な表だけで、死刑は牢の中でひっそり行われていた）。
//
// ■ このファイルがすること
//   1. 裁き：牢に入った者を、罪の重さ・裁く人の性格・証人の数・身分・情けの事情で裁く。
//      重罪（殺人・放火・反乱・人さらいなど）は死刑になりうる。軽い罪は罰金・禁固・むち打ち・追放。
//   2. 公開処刑：死刑が決まると、その日のうちに触れが出て、夕方に噂が広がる。翌朝に広場へ処刑台を組み、
//      昼前に罪人を引き出し、罪状の読み上げ・最後の言葉・鐘ののちに刑を執り行う（残酷な描写はしない）。
//      見物に行くかどうかは一人ひとりの性格で決まる。見た人は恐れを覚え、繊細な人は心を痛める。
//   3. 犯罪の抑え：処刑や厳しい罰があった町では、しばらく罪に手を出しにくくなる。罰が甘い町では増える。
//      sim.decide の悪事の候補（盗み・追いはぎ・仇討ち・裏稼業）と、underworld.js の起きやすさ（rate）に掛ける。
//   4. 王の方針：王ごとに厳しさ（sev 0〜1）と、没収した財産の行き先（国庫か家族か）を持つ。
//      厳しすぎると民の不満が上がり、甘すぎると犯罪が増える。王は様子を見て方針を変える。
//   5. 濡れ衣：犯人の分からない殺人で、まれに無実の者が捕まる。のちに真犯人が分かると、町の信頼と王の評判が落ちる。
//   6. お金：罰金は家計から国庫へ。処刑人と役人の手当は、国庫から給料日に払う（payday.js の owe）。
//      罪人の財産は、王の方針で国庫へ没収するか家族に残す。濡れ衣の償い金は国庫から家族へ。どれも行き先がある。
//
// ■ 本体からの呼び方
//   lawDaily(sim)                … newDay の中、society.js の justiceDaily と underworldDaily のあいだ
//   lawHourly(sim)               … newHourRest の中、crimeHourly のあと
//   lawDecide(sim, p, cands, add) … decide の候補づくりの最後のほう（underworldDecide のあと）
//   lawCrimeMul(sim)             … underworld.js の rate に掛ける（町の恐れの平均）
//   LAW_LABEL / LAW_GO / LAW_PREF … ui.js の行動ラベル
//
// ■ 状態：S.justice（古いセーブで欠けていても、最初の呼び出しで作る）
//   { v, stats, cases[], execs[], lashes[], towns{sid:{fear,lax,trust}}, kings{kid:{king,sev,conf}}, framed[] }
//   人ごと：p.jsTried（裁き済み）、p.jsFear（見た処刑の恐れ 0〜1）、p.jsHold（今日は悪事を控える）、p.jsFramed、p.jsRecord（前科の数）
import { clamp } from './rng.js';
import { JOBS } from './data.js';
import { T, walkable, tileAt } from './world.js';
import { markWanted, arrest } from './society.js';
import { CRIMES } from './underworld.js';
import { owe } from './payday.js';
import { flow } from './ledger.js';

const LAWFUL = new Set(['guard', 'knight', 'soldier', 'jailer', 'watchman', 'royalguard', 'general', 'paladin']);
const ELITE = new Set(['king', 'royal', 'noble']);
// 重罪：死刑になりうる罪と、その重さ（死刑に傾く度合い）
const GRAVE = {
  '連続殺人': 1.0, '暗殺': 0.95, '反逆': 0.9, '謀反': 0.9, '反乱': 0.6, '殺人': 0.72, '暗殺未遂': 0.6, '暗殺の依頼': 0.55,
  '性的暴行': 0.5, '誘拐': 0.5, '放火': 0.45, '盗賊ギルドの頭目': 0.42,
};
// 軽い罪のうち、むち打ちに向く罪（体で償わせる）と、追放に向く罪（町から出す）
const LASHABLE = new Set(['盗み', 'スリ', '傷害', '追いはぎ', '密猟', '墓荒らし', '騒ぎ', '暴動', '脱走', 'つきまとい', '恐喝']);
const EXILABLE = new Set(['詐欺', '故買', '偽金づくり', '密輸', '薬の密売', 'いかさま賭博', '恐喝']);
// 悪事の行動（sim.decide の候補）
const DROPPABLE = new Set(['work', 'plaza', 'stroll', 'rest', 'home', 'tavern', 'visit', 'shop', 'play', 'pray', 'train', 'storytell', 'beg', 'guild', 'perform']);
const CRIME_ACTS = new Set(['steal', 'rob', 'revenge', 'uw_graverob', 'uw_poach', 'uw_deal', 'uw_stalk', 'uw_grow']);

export const LAW_LABEL = { execwatch: '処刑を見物している', execduty: '刑場の役目についている', scaffold: '処刑台に立たされている', pillory: '広場でむち打ちの刑を受けている' };
export const LAW_GO = { execwatch: '刑場の広場へ向かっている', execduty: '刑場へ向かっている', scaffold: '刑場へ引き立てられている', pillory: '広場へ引き立てられている' };
export const LAW_PREF = { execwatch: '処刑の見物', execduty: '刑場の役目' };

const alive = (p) => p && p.deathYear == null;
const mature = (sim) => sim.S.settings?.matureCrimes !== false;
const dist2 = (a, x, z) => Math.hypot(a.pos.x - x, a.pos.z - z);
const say = (sim, p, text) => { if (alive(p) && sim.isWatched?.(p)) sim.events.push({ type: 'say', id: p.id, text }); };
const title = (p) => (p.sex === 'f' ? '女王' : '王');

// ---------- 状態 ----------
export function ensureJustice(sim) {
  const S = sim.S;
  if (S.justice && S.justice.v) return S.justice;
  S.justice = { v: 1, stats: {}, cases: [], execs: [], lashes: [], towns: {}, kings: {}, framed: [], seq: 1 };
  // すでに牢にいる人（歴史の囚人・古いセーブで裁き済みの人）は、裁き直さない。
  // ただし、捕まったばかりでまだ誰にも裁かれていない人（捕まった記憶があり、underworld.js の裁きも済んでいない人）は裁く
  for (const p of sim.living()) {
    if (p.jail == null) continue;
    const fresh = !p.uwTried && (p.memories || []).some((m) => m.k === 'crime' && /に捕まり、.*牢獄に入れられた/.test(m.txt));
    if (!fresh) p.jsTried = true;
  }
  return S.justice;
}
function J(sim) { return sim.S.justice && sim.S.justice.v ? sim.S.justice : ensureJustice(sim); }
function stat(sim, k, n = 1) { const st = J(sim).stats; st[k] = (st[k] || 0) + n; }
function townJ(sim, sid) {
  const T0 = J(sim).towns;
  return T0[sid] || (T0[sid] = { fear: 0, lax: 0, trust: 0.8 });
}

// 王の方針（厳しさ sev と、没収した財産の行き先 conf）
export function kingPolicy(sim, kid) {
  const S = sim.S, j = J(sim), k = S.kingdoms[kid];
  if (!k) return { sev: 0.5, conf: 'family' };
  let rec = j.kings[kid];
  const king = S.people[k.kingId];
  if (!rec || rec.king !== k.kingId) {
    let sev = 0.5, conf = 'family';
    if (alive(king)) {
      const h = ((king.id * 2654435761) >>> 0) / 4294967296;   // 王ごとに決まった揺らぎ
      sev = clamp(0.5 + (0.5 - king.pers.A) * 0.9 + (king.pers.C - 0.5) * 0.3 + (king.pers.N - 0.5) * 0.2 - (king.values.faith - 0.5) * 0.3 + (h - 0.5) * 0.2, 0.05, 0.95);
      conf = sev > 0.6 || king.values.ambition > 0.7 ? 'crown' : 'family';
    }
    const first = !rec;
    rec = j.kings[kid] = { king: k.kingId, sev, conf, since: sim.today, crime0: null };
    if (!first && alive(king)) {
      const word = sev >= 0.7 ? '厳しい裁きで知られる' : sev <= 0.3 ? '慈悲深い裁きを好む' : '穏当な裁きをする';
      sim.chron(`${k.name}の新しい${title(king)}${king.given}は、${word}人物だった`, kid);
    }
  }
  return rec;
}
function sevWord(sev) { return sev >= 0.75 ? '厳しい' : sev >= 0.55 ? 'やや厳しい' : sev >= 0.35 ? '穏当な' : '慈悲深い'; }

// ---------- 町の恐れ・甘さ ----------
// 町の抑えの強さ（正で罪を控え、負で罪が増える）
export function townDeter(sim, sid) {
  const t = J(sim).towns[sid];
  if (!t) return 0;
  return clamp(t.fear - t.lax - (1 - t.trust) * 0.3, -0.6, 1);
}
// underworld.js の起きやすさに掛ける（世界の平均。人の多い町ほど重く数える）
export function lawCrimeMul(sim) {
  const S = sim.S;
  if (!S.justice || !S.justice.v) return 1;
  const j = S.justice;
  if (j._mulDay === sim.today && j._mul != null) return j._mul;
  let sum = 0, n = 0;
  const count = {};
  for (const p of sim.living()) count[p.s] = (count[p.s] || 0) + 1;
  for (const [sid, c] of Object.entries(count)) { sum += townDeter(sim, +sid) * c; n += c; }
  const avg = n ? sum / n : 0;
  j._mul = clamp(1 - avg * 0.6, 0.45, 1.45);
  j._mulDay = sim.today;
  return j._mul;
}

// ---------- 裁く人 ----------
function prisonTown(sim, p) {
  const b = sim.building(p.jail);
  if (b) {
    sim._jsBldTown = sim._jsBldTown || new Map();
    if (!sim._jsBldTown.has(b.id)) sim._jsBldTown.set(b.id, sim.S.world.settlements.find((s) => s.buildings.includes(b.id)) || null);
    const s = sim._jsBldTown.get(b.id);
    if (s) return s;
  }
  return sim.capitalOf(p) || sim.townOf(p);
}
function pickJudge(sim, kid, grave, p, cap, L) {
  const S = sim.S, k = S.kingdoms[kid];
  const king = k && S.people[k.kingId];
  const free = (q) => alive(q) && q.jail == null && q !== p && sim.ageOf(q) >= 21;
  const inK = (q) => sim.townOf(q)?.kingdom === kid;
  const best = (arr) => arr.sort((a, b) => (b.lv || 1) - (a.lv || 1) || b.id - a.id)[0] || null;
  const byJob = (job, where) => best(L.filter((q) => free(q) && q.job === job && (where ? q.s === where : inK(q))));
  const nobleIn = best(L.filter((q) => free(q) && q.rank === 'noble' && q.s === cap.id));
  if (grave) {
    if (free(king)) return { q: king, t: title(king) };
    const c = byJob('chancellor');
    if (c) return { q: c, t: '宰相' };
    if (nobleIn) return { q: nobleIn, t: '領主' };
  } else {
    const home = sim.townOf(p);
    if (home && home.id !== cap.id && home.kingdom === kid) { const e = byJob('elder', home.id); if (e) return { q: e, t: '村長' }; }
    if (nobleIn) return { q: nobleIn, t: '領主' };
    const c = byJob('chancellor');
    if (c) return { q: c, t: '宰相' };
    if (free(king)) return { q: king, t: title(king) };
  }
  for (const [job, t] of [['general', '将軍'], ['royalguard', '近衛騎士の長'], ['knight', '騎士団長']]) { const q = byJob(job); if (q) return { q, t }; }
  return null;
}
function judgeSev(sim, jd, pol) {
  if (!jd) return pol.sev;
  if (jd.q.rank === 'king') return pol.sev;
  const q = jd.q;
  const own = clamp(0.5 + (0.5 - q.pers.A) * 0.8 + (q.pers.C - 0.5) * 0.3 - (q.values.faith - 0.5) * 0.2, 0.05, 0.95);
  return clamp(pol.sev * 0.55 + own * 0.45, 0.05, 0.95);
}

// ---------- 証人・被害者・情けの事情 ----------
function witnessCount(sim, p, L) {
  let n = 0;
  for (const q of L) {
    if (q === p || !q.memories) continue;
    for (let i = q.memories.length - 1; i >= 0; i--) {
      const m = q.memories[i];
      if (sim.today - m.t > 60) break;
      if ((m.k === 'crime' || m.k === 'assault' || m.k === 'robbed' || m.k === 'stalk') && m.about?.includes(p.id) && q.id !== p.id) { n++; break; }
    }
  }
  return n;
}
function victimOf(sim, p) {
  const S = sim.S;
  if (p.jsFramed) return S.people[p.jsFramed.victim] || null;
  const cs = S.uw?.cases;
  if (cs) for (let i = cs.length - 1; i >= 0; i--) if (cs[i].off === p.id && cs[i].vic != null && sim.today - cs[i].d < 90) return S.people[cs[i].vic] || null;
  for (let i = (p.memories || []).length - 1; i >= 0; i--) {
    const m = p.memories[i];
    if (m.k === 'crime' && m.about?.length && /手にかけ|刃を向け|殴りかかっ/.test(m.txt)) return S.people[m.about[0]] || null;
  }
  return null;
}
function mercyReasons(sim, p, L) {
  const out = [];
  const age = sim.ageOf(p);
  if (age < 21) out.push({ w: 0.35, why: '年若いこと' });
  if (!(p.jsRecord > 0) && !(p.uwRecid > 0)) out.push({ w: 0.22, why: '初めての罪であること' });
  const hh = sim.hh(p);
  const kids = (hh?.members || []).map((id) => sim.S.people[id]).filter((q) => alive(q) && q !== p && sim.ageOf(q) < 14);
  if (kids.length) out.push({ w: 0.18 + Math.min(0.12, kids.length * 0.04), why: '幼い子を抱えていること' });
  const patron = L.find((q) => q !== p && q.jail == null && (q.rank === 'noble' || q.rank === 'royal' || q.job === 'knight') && ((p.rel?.[q.id]?.a || 0) > 40 || (q.rel?.[p.id]?.a || 0) > 40));
  if (patron) out.push({ w: 0.4, why: `${patron.rank === 'noble' ? '貴族' : patron.rank === 'royal' ? '王族' : '騎士'}の${patron.given}の口添え`, patron: patron.id });
  if (p.pers.A > 0.5 || (p.memories || []).some((m) => /てしまった/.test(m.txt) && m.k === 'crime' && sim.today - m.t < 30)) out.push({ w: 0.15, why: '深く悔いていること' });
  if (ELITE.has(p.rank) || ELITE.has(p.rankBefore)) out.push({ w: 0.6, why: '身分' });
  return out;
}

// ---------- 裁き ----------
function trial(sim, p, L) {
  const S = sim.S, R = sim.rng, j = J(sim);
  const crime = p.crime || '騒ぎ';
  const cap = prisonTown(sim, p);
  const kid = cap.kingdom, k = S.kingdoms[kid];
  const pol = kingPolicy(sim, kid);
  const base = GRAVE[crime] || 0;
  const grave = base > 0;
  const jd = pickJudge(sim, kid, grave, p, cap, L);
  const sev = judgeSev(sim, jd, pol);
  const witn = p.jsFramed ? 0 : witnessCount(sim, p, L);
  const vic = victimOf(sim, p);
  const mercy = mercyReasons(sim, p, L);
  const c = CRIMES[crime] || { days: p.prisonDays || 5, fine: 5 };
  const judgeName = jd ? `${jd.t}${jd.q.given}` : '役人';
  const hh = sim.hh(p);
  const prior = p.jsRecord || 0;
  p.jsTried = true; p.uwTried = true;   // underworld.js の裁きとは二重にしない（出所後の更生・追放は underworld.js が続けて扱う）
  p.jsRecord = prior + 1;
  if (S.uw) { S.uw.arrests = S.uw.arrests || {}; S.uw.arrests[crime] = (S.uw.arrests[crime] || 0) + 1; }
  if (crime === '殺人') p.uwKills = (p.uwKills || 0) + 1;
  stat(sim, 'trials');
  let verdict, sentence, death = false;
  const applied = [];
  if (grave) {
    // 死刑に傾く度合い：罪の重さ × 裁く人の厳しさ × 証人 × 情け
    let pD = base * (0.55 + sev * 0.9) * (witn >= 2 ? 1.1 : witn === 1 ? 0.85 : 0.6);
    if ((p.uwKills || 0) >= 2 || p.uwKilledRoyal) pD += 0.35;
    for (const m of mercy) {
      const eff = m.w * (1.25 - sev);
      if (R.chance(clamp(0.35 + (1 - sev) * 0.6, 0, 0.95))) { pD *= 1 - clamp(eff, 0, 0.8); applied.push(m); }
    }
    if (p.rank === 'king') pD = 0;
    death = R.chance(clamp(pD, 0, 0.97));
    if (death) {
      verdict = 'death'; sentence = '死刑';
      p.prisonDays = 99; p.uwExecDay = null;
      scheduleExecution(sim, p, cap, jd, crime, vic, sev);
    } else {
      verdict = 'mercy';
      const days = Math.round(Math.min(c.days || 60, 400) * (0.7 + sev * 0.6));
      p.prisonDays = Math.max(p.prisonDays || 0, days);
      sentence = `禁固${p.prisonDays}日`;
      if (c.exile === true || sev > 0.6 && R.chance(0.35)) { p.uwExile = true; sentence += '・刑期のあと国外追放'; }
      stat(sim, 'mercy');
      townJ(sim, p.s).lax = clamp(townJ(sim, p.s).lax + 0.06 + (1 - sev) * 0.06, 0, 1);
    }
  } else {
    // 軽い罪：罰金・禁固・むち打ち・追放
    for (const m of mercy) if (m.w >= 0.18 && R.chance(clamp(0.25 + (1 - sev) * 0.5, 0, 0.9))) applied.push(m);
    const heavy = sev + prior * 0.18 + (witn >= 2 ? 0.08 : 0) - applied.length * 0.08;
    const fineAmt = Math.round((c.fine || 5) * (0.8 + sev * 0.7) * (1 + prior * 0.3));
    let fine = 0;
    if (hh && fineAmt > 0) {
      fine = Math.max(0, Math.min(fineAmt, Math.floor(hh.money || 0)));
      if (fine > 0 && k) { hh.money -= fine; k.treasury += fine; flow(sim, hh.id, 'k' + kid, fine, '罰金'); stat(sim, 'fineSum', fine); }
    }
    if (EXILABLE.has(crime) && prior >= 1 && heavy > 0.7 && R.chance(0.5) || prior >= 3 && heavy > 0.8) {
      verdict = 'exile'; p.uwExile = true;
      p.prisonDays = Math.max(2, Math.round((p.prisonDays || 5) * 0.6));
      sentence = `禁固${p.prisonDays}日ののち国外追放`;
      stat(sim, 'exile');
    } else if (LASHABLE.has(crime) && heavy > 0.55 && R.chance(clamp(heavy - 0.3, 0.1, 0.8))) {
      verdict = 'lash';
      p.prisonDays = R.int(1, 2);
      sentence = 'むち打ちの刑';
      j.lashes.push({ id: p.id, sid: cap.id, day: sim.today, crime });
      stat(sim, 'lash');
    } else if (prior === 0 && heavy < 0.55 && fine > 0) {
      verdict = 'fine';
      p.prisonDays = Math.min(p.prisonDays || 2, R.int(1, 2));
      sentence = '罰金';
      stat(sim, 'fine');
      townJ(sim, p.s).lax = clamp(townJ(sim, p.s).lax + 0.01, 0, 1);
    } else {
      verdict = 'prison';
      p.prisonDays = Math.max(1, Math.round((p.prisonDays || 5) * (0.6 + sev * 0.8) * (1 + prior * 0.25)));
      sentence = `禁固${p.prisonDays}日`;
      stat(sim, 'prison');
    }
    if (fine > 0 && verdict !== 'fine') sentence += `（罰金${fine}銅貨）`; else if (fine > 0) sentence = `罰金${fine}銅貨`;
    if (verdict === 'lash' || verdict === 'exile') townJ(sim, p.s).fear = clamp(townJ(sim, p.s).fear + 0.04, 0, 1);
    if (c.dismiss && p.job) { p.formerJob = p.job; p.job = null; sentence += '・職を解かれる'; }
  }
  const why = applied.length ? `（${applied.map((m) => m.why).join('と、')}${death ? 'も酌まれたが、罪は重すぎた' : 'が酌まれた'}）` : '';
  const line = `${judgeName}の裁き：${sim.fullName(p)}に${crime}の罪で${sentence}${why}`;
  j.cases.push({ d: sim.today, id: p.id, name: sim.fullName(p), crime, verdict, sentence, judge: judgeName, witn, mercy: applied.map((m) => m.why), sev: Math.round(sev * 100) / 100, s: p.s });
  if (j.cases.length > 200) j.cases.splice(0, j.cases.length - 200);
  if (grave) {
    sim.news(death ? `${line}。刑は明日の昼、${cap.name}の広場で執り行われる` : line, death ? 3 : 2, sim.building(p.jail)?.door);
    sim.chron(`${sim.fullName(p)}が${crime}の罪で裁かれ、${sentence}となった${why}`, kid);
  } else sim.pushLog(line + '。', 'event', [p.id], p.pos);
  // 本人・裁いた人・被害者の身内の記憶
  sim.remember(p, `裁きの場で、${judgeName}から${crime}の罪により${sentence.replace(/（.*）/, '')}を言い渡された`, { emo: death ? -1 : -0.7, imp: death ? 1 : 0.85, about: jd ? [jd.q.id] : [], k: 'uwcrime' });
  if (jd) sim.remember(jd.q, `${p.given}に${crime}の罪で${death ? '死罪を申し付けた' : applied.length ? '情けをかけ、' + sentence.replace(/（.*）/, '') + 'とした' : sentence.replace(/（.*）/, '') + 'を言い渡した'}`, { emo: death ? -0.2 : 0.1, imp: grave ? 0.8 : 0.4, about: [p.id], k: 'justice' });
  if (vic) {
    const fam = [vic, ...(sim.hh(vic)?.members || []).map((id) => S.people[id])].filter((q, i, a) => alive(q) && a.indexOf(q) === i && q !== p && sim.ageOf(q) >= 12);
    for (const q of fam) {
      if (death) sim.remember(q, q === vic ? `${p.given}に死罪の裁きが下った。これで少しは報われた` : `${vic.given}を苦しめた${p.given}に死罪の裁きが下った`, { emo: 0.3, imp: 0.8, about: [p.id], k: 'justice' });
      else if (grave || verdict === 'fine') sim.remember(q, `${p.given}の裁きは${sentence.replace(/（.*）/, '')}で済んだ。納得がいかなかった`, { emo: -0.5, imp: 0.7, about: [p.id], k: 'grudge' });
    }
  }
  if (applied.find((m) => m.patron != null)) { const pt = S.people[applied.find((m) => m.patron != null).patron]; if (pt) sim.remember(pt, `${p.given}のために裁きの場で口添えをした`, { emo: 0.3, imp: 0.6, about: [p.id], k: 'justice' }); }
  // 家族：恥と、禁固・追放への嘆き
  for (const id of hh?.members || []) {
    const q = S.people[id];
    if (!alive(q) || q === p || sim.ageOf(q) < 10) continue;
    if (death) sim.remember(q, `身内の${p.given}に死罪の裁きが下った。目の前が真っ暗になった`, { emo: -1, imp: 1, about: [p.id], k: 'family' });
    else if (grave && sim.rng.chance(0.6)) sim.remember(q, `${p.given}が長い刑を言い渡された。帰りを待つしかなかった`, { emo: -0.7, imp: 0.8, about: [p.id], k: 'family' });
  }
  return verdict;
}

// ---------- 公開処刑の段取り ----------
function scaffoldSpot(sim, cap) {
  const w = sim.S.world;
  for (let r = 1; r <= 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = Math.round(cap.x) + dx, z = Math.round(cap.z) + dz;
    const t = tileAt(w, x, z);
    if (!walkable(t) || t === T.BLD) continue;
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => { const u = tileAt(w, x + a, z + b); return walkable(u) && u !== T.BLD; }).length >= 3;
    if (ok) return { x, z };
  }
  return { x: Math.round(cap.x), z: Math.round(cap.z) };
}
function scheduleExecution(sim, p, cap, jd, crime, vic, sev) {
  const j = J(sim);
  const spot = scaffoldSpot(sim, cap);
  // 同じ日に同じ町の刑場で重ならないよう、1日ずつ後ろへずらす
  let day = sim.today + 1;
  while (j.execs.some((e) => e.sid === cap.id && e.day === day && e.stage !== 'cancel')) day++;
  const e = {
    id: j.seq++, pid: p.id, name: sim.fullName(p), given: p.given, crime, sid: cap.id, kid: cap.kingdom, x: spot.x, z: spot.z,
    verdictDay: sim.today, day, judge: jd?.q.id ?? null, judgeT: jd ? `${jd.t}${jd.q.given}` : '役人', vic: vic?.id ?? null, sev,
    framed: !!p.jsFramed, stage: 'sched', crowd: [], spots: {}, roles: {}, from: 0, to: 0,
  };
  j.execs.push(e);
  if (j.execs.length > 40) j.execs.splice(0, j.execs.length - 40);
  return e;
}
function ringSpot(sim, e, i) {
  const w = sim.S.world;
  for (let tries = 0; tries < 6; tries++) {
    const a = (i + tries * 7) * 2.39996, r = 2.6 + ((i + tries) % 4) * 0.8;
    const x = Math.round(e.x + Math.cos(a) * r), z = Math.round(e.z + Math.sin(a) * r);
    const t = tileAt(w, x, z);
    if (walkable(t) && t !== T.BLD) return { x, z };
  }
  return sim.randomNear(e.x, e.z, 5) || { x: e.x, z: e.z + 3 };
}
// 前の晩：触れ役が町を回り、噂が広がる
function spreadNotice(sim, e) {
  const S = sim.S, R = sim.rng, p = S.people[e.pid];
  e.rumor = true;
  if (!alive(p)) return;
  const cap = sim.town(e.sid);
  const locals = sim.living().filter((q) => q.s === e.sid && q !== p && q.jail == null && sim.ageOf(q) >= 10);
  const hear = locals.filter(() => R.chance(0.45));
  if (hear.length) sim.gossip(p, `明日の昼、${cap.name}の広場で${e.crime}の罪により処刑されるらしい`, -0.6, hear, { silent: true, imp: 0.6 });
  const far = sim.living().filter((q) => q.s !== e.sid && sim.town(q.s)?.kingdom === e.kid && q.jail == null && sim.ageOf(q) >= 14 && R.chance(0.08));
  if (far.length) sim.gossip(p, `${e.crime}の罪で、明日処刑されるらしい`, -0.5, far, { silent: true, imp: 0.45 });
  sim.pushLog(`${cap.name}の辻々で、触れ役が「明日の昼、広場にて${e.name}の刑を執り行う」と触れ回った。`, 'event', [p.id], { x: e.x, z: e.z });
}
function buildScaffold(sim, e) {
  const S = sim.S, cap = sim.town(e.sid);
  e.stage = 'built';
  sim.pushLog(`${cap.name}の広場に、夜明けとともに処刑台が組まれた。`, 'event', [], { x: e.x, z: e.z });
  // 組んだ大工には、国庫から給料日に手間賃を払う
  const carp = sim.living().find((q) => q.job === 'carpenter' && q.s === e.sid && q.jail == null);
  if (carp) { owe(sim, carp, 'k' + e.kid, 6, '処刑台の普請'); sim.remember(carp, '役所の言いつけで、広場に処刑台を組んだ。気の進まない仕事だった', { emo: -0.3, imp: 0.45, k: 'work' }); }
  void S;
}
// 罪人を牢から引き出し、見物人と役人を集める
function leadOut(sim, e) {
  const S = sim.S, R = sim.rng, p = S.people[e.pid];
  if (!alive(p) || p.jail == null) { cancelExec(sim, e, alive(p) ? '牢を破って逃げた' : '牢で息を引き取った'); return; }
  if (e.stage === 'sched') buildScaffold(sim, e);
  e.stage = 'led';
  const dayStart = sim.today * 1440;
  e.from = dayStart + 10 * 60; e.to = dayStart + 12 * 60 + 20;
  p.fight = null; p.talk = null; p.path = []; p.inside = null;
  p.pos = { x: e.x, z: e.z };
  p.action = { type: 'scaffold', dur: 200, until: S.t + 200, bld: null, phase: 'do', tx: e.x, tz: e.z, startNeeds: { ...p.needs }, startMood: p.mood };
  // 役人：処刑人（看守）・読み上げ役（書記か宰相か騎士）・裁いた人（厳しい王は自ら臨む）
  const L = sim.living();
  const free = (q) => q.jail == null && !q.fight && q !== p && q.s === e.sid && sim.ageOf(q) >= 18;
  const execu = L.find((q) => free(q) && q.job === 'jailer') || L.find((q) => free(q) && (q.job === 'guard' || q.job === 'soldier'));
  const herald = L.find((q) => free(q) && q.job === 'scribe') || L.find((q) => free(q) && q.job === 'chancellor') || L.find((q) => free(q) && (q.job === 'knight' || q.job === 'royalguard') && q !== execu);
  if (execu) { e.roles[execu.id] = 'exec'; e.spots[execu.id] = { x: e.x + 1, z: e.z }; }
  if (herald && herald !== execu) { e.roles[herald.id] = 'herald'; e.spots[herald.id] = { x: e.x - 1, z: e.z }; }
  const judge = S.people[e.judge];
  if (alive(judge) && free(judge) && e.sev >= 0.5 && !e.roles[judge.id]) { e.roles[judge.id] = 'judge'; e.spots[judge.id] = ringSpot(sim, e, 0); }
  const guards = L.filter((q) => free(q) && LAWFUL.has(q.job) && !e.roles[q.id] && dist2(q, e.x, e.z) < 30).slice(0, 3);
  for (const g of guards) { e.roles[g.id] = 'guard'; }
  // 見物人：好奇心の強い人は行き、繊細な人は行かない
  const vicFam = new Set();
  const vic = S.people[e.vic];
  if (vic) { vicFam.add(vic.id); for (const id of sim.hh(vic)?.members || []) vicFam.add(id); }
  const ownFam = new Set(sim.hh(p)?.members || []);
  const cap = sim.town(e.sid);
  let i = 1;
  const stay = [];
  for (const q of L) {
    if (!free(q) && !(q.s === e.sid && q.jail == null && q !== p && sim.ageOf(q) >= 13 && sim.ageOf(q) < 18 && !q.fight)) continue;
    if (e.roles[q.id] && e.roles[q.id] !== 'guard') continue;
    if (q.uwCaptive || q.mission || dist2(q, cap.x, cap.z) > cap.r + 14) continue;
    const sensitive = q.pers.N > 0.62 && q.pers.A > 0.5;
    let pr = 0.1 + q.pers.O * 0.3 + q.pers.E * 0.2 + (1 - q.pers.A) * 0.15 + (0.5 - q.pers.N) * 0.3 + q.values.courage * 0.1;
    if (sensitive) pr *= 0.2;
    if (vicFam.has(q.id)) pr = 0.75 + q.values.courage * 0.2;
    if (ownFam.has(q.id)) pr = 0.3 * (1 - q.pers.N) + q.values.family * 0.2;
    if (sim.ageOf(q) < 16) pr *= 0.35;
    if (!mature(sim)) pr *= 0.8;
    if (e.roles[q.id] === 'guard') pr = 1;
    if (R.chance(clamp(pr, 0.01, 0.92))) { e.crowd.push(q.id); if (!e.spots[q.id]) e.spots[q.id] = ringSpot(sim, e, i++); }
    else if (sensitive && R.chance(0.35)) stay.push(q);
  }
  // 見物に行く人・役目の人は、手の空く用事ならすぐに切り上げて広場へ向かう
  for (const id of [...e.crowd, ...Object.keys(e.roles)]) {
    const q = S.people[id];
    if (alive(q) && !q.fight && !q.talk && q.jail == null && (!q.action || DROPPABLE.has(q.action.type))) { q.action = null; q.path = null; }
  }
  for (const q of stay.slice(0, 12)) sim.remember(q, R.pick([
    `${e.given}の処刑の日は、家にこもって窓を閉めていた`,
    `広場から人の声が聞こえてきたが、${e.given}の処刑を見に行く気にはなれなかった`,
    '処刑の見物に誘われたが、断った。人が死ぬところなど見たくなかった',
  ]), { emo: -0.4, imp: 0.5, about: [p.id], k: 'execution' });
  // 読み上げ役が罪状を読み上げる
  const herald2 = S.people[Object.keys(e.roles).find((id) => e.roles[id] === 'herald')];
  const reading = `${e.name}、${e.crime}の罪により、${e.judgeT}の裁きをもって刑に処する`;
  if (herald2) say(sim, herald2, `静まれ！ ${reading}！`);
  sim.pushLog(`${cap.name}の広場に${e.name}が引き出された。罪状が読み上げられる——「${reading}」`, 'event', [p.id], { x: e.x, z: e.z });
  sim.remember(p, `牢から引き出され、${cap.name}の広場の処刑台に立たされた`, { emo: -1, imp: 1, k: 'uwcrime' });
  e.watchN = e.crowd.length;
}
function lastWords(sim, p, e) {
  const S = sim.S, R = sim.rng;
  const vic = S.people[e.vic];
  const kid = (sim.hh(p)?.members || []).map((id) => S.people[id]).find((q) => alive(q) && q !== p && sim.ageOf(q) < 20);
  const opts = [];
  if (p.jsFramed) opts.push('わたしはやっていない……天がすべて見ている', '本当の下手人は、今もどこかで笑っている');
  if (p.pers.A > 0.45 || p.pers.C > 0.6) opts.push(vic ? `${vic.given}と、その家族に……心からおわびする` : '犯した罪を、心からおわびする');
  if (p.pers.A < 0.25) opts.push('裁きだと？ 勝った者の理屈にすぎん', '好きにしろ。誰も覚えちゃいないさ');
  if (kid) opts.push(`${kid.given}、おまえは……まっとうに生きてくれ`);
  if (p.values.faith > 0.6) opts.push('神よ、この魂をお許しください');
  if (p.pers.N > 0.65) opts.push('……こわい。こわいよ');
  if (!opts.length || R.chance(0.15)) return null;
  return R.pick(opts);
}
// 見た人の記憶の文を組み立てる（最初の文は「〜た」で終える。会話の話題に使われる）
const LEADS = [[(q) => q.pers.E, '連れと一緒に'], [(q) => q.pers.O, '最前列で'], [(q) => q.pers.C, '仕事の手を止めて'], [(q) => 1 - q.pers.E, '人垣の後ろから'], [(q) => 0.5, '人に押されながら'], [(q) => 0.4, '背伸びをして'], [(q) => 1 - q.pers.O, '通りがかりに']];
function lead(R, q) { return R.chance(0.35) ? '' : R.weighted(LEADS, ([f]) => 0.1 + f(q))[1] + '、'; }
function feelOf(R, q, e, kind) {
  const f = [];
  if (kind === 'lash') {
    f.push('ああはなりたくないと思った', 'むちの音が耳に残った', '見ていて背中が痛くなった', '人だかりの熱気に気分が悪くなった');
    if (q.pers.A < 0.35) f.push('いい見せしめだと思った', '自業自得だと思った');
    if (q.pers.A > 0.6) f.push('見ていて気の毒になった', 'あそこまでしなくてもと思った');
    if (q.jsRecord > 0 || q.job === 'thief' || q.uwRole) f.push('明日は我が身だと思った', '当分は大人しくしていようと思った');
    return R.pick(f);
  }
  f.push('罪を犯せばああなるのだと思った', '人の命のあっけなさに言葉を失った', '裁きの厳しさが身にしみた', '鐘の音がいつまでも耳に残った', '家に帰ってから、しばらく口がきけなかった', 'あれが報いというものなのだろう', `${e.judgeT}の裁きは厳しいと思った`);
  if (q.pers.A < 0.35) f.push('いい見せしめだと思った', '自業自得だと思った');
  if (q.values.faith > 0.6) f.push('あの者の魂のために祈った', '神の裁きは別にあると思った');
  if (q.pers.O > 0.65) f.push('群衆の顔つきのほうが、よほど恐ろしく見えた', 'なぜ人はこれを見に集まるのだろうと考えた');
  if (q.values.family > 0.65) f.push('家族のことが頭に浮かんだ', '子どもには見せられないと思った');
  if (LAWFUL.has(q.job)) f.push('人垣を押さえるのが精いっぱいだった', '役目とはいえ、気の重い一日だった');
  return R.pick(f);
}
function watchLine(sim, q, e, kind, cap) {
  const R = sim.rng, ld = lead(R, q);
  const cores = kind === 'lash'
    ? [`${ld}広場で${e.given}がむち打たれるのを見た`, `${ld}${e.crime}の罪で${e.given}がむち打たれるのを見た`, `${ld}広場の人だかりをのぞくと、${e.given}がむち打たれていた`]
    : [`${ld}${cap.name}の広場で${e.given}の処刑を見た`, `${ld}${e.crime}の罪で${e.given}が処刑されるのを見届けた`, `${ld}${e.given}が処刑台に引き出されるのを見た`, `${ld}広場で${e.given}の最期を見た`];
  return `${R.pick(cores)}。${feelOf(R, q, e, kind)}`;
}

function cancelExec(sim, e, why) {
  e.stage = 'cancel';
  e.crowd = []; e.spots = {}; e.roles = {};
  sim.news(`${e.name}の刑は執り行われなかった（${why}）`, 2, { x: e.x, z: e.z });
  stat(sim, 'cancelled');
}
// 刑を執り行う
function execute(sim, e) {
  const S = sim.S, R = sim.rng, p = S.people[e.pid];
  if (!alive(p) || p.jail == null) { cancelExec(sim, e, alive(p) ? '牢を破って逃げた' : '牢で息を引き取った'); return; }
  const cap = sim.town(e.sid), k = S.kingdoms[e.kid], pol = kingPolicy(sim, e.kid);
  p.pos = { x: e.x, z: e.z }; p.inside = null; p.fight = null;
  const words = lastWords(sim, p, e);
  if (words) { say(sim, p, words); p.thought = words; }
  const m = mature(sim);
  sim.pushLog(words ? `${e.name}は最後に「${words}」と言い残した。` : `${e.name}は最後まで何も言わなかった。`, 'event', [p.id], { x: e.x, z: e.z });
  sim.pushLog(`${cap.name}の鐘が三度鳴り、${m ? '刑が執り行われた' : '刑が執行された'}。`, 'event', [p.id], { x: e.x, z: e.z });
  // 罪人の財産：王の方針で国庫へ没収するか、家族に残す
  const hh = sim.hh(p);
  let own = (p.purse || 0) + (p.nestEgg || 0) + (p.plan?.saved || 0);
  const solo = hh && hh.members.length <= 1;
  if (pol.conf === 'crown' && k) {
    let taken = own;
    k.treasury += own; p.purse = 0; p.nestEgg = 0; if (p.plan) p.plan.saved = 0;
    if (solo && hh.money > 0) { taken += hh.money; k.treasury += hh.money; hh.money = 0; }
    if (taken > 0) { flow(sim, hh?.id ?? '罪人', 'k' + e.kid, taken, '罪人の財産の没収'); stat(sim, 'confiscated', Math.round(taken)); }
    e.conf = Math.round(taken);
  } else e.conf = 0;
  // 処刑人と役人の手当（国庫から給料日に）
  for (const [id, role] of Object.entries(e.roles)) {
    const q = S.people[id];
    if (!alive(q)) continue;
    if (role === 'exec') { owe(sim, q, 'k' + e.kid, 12, '処刑人の手当'); sim.remember(q, `${e.given}の刑を執り行う役目を務めた。重い務めだった`, { emo: -0.4, imp: 0.8, about: [p.id], k: 'justice' }); }
    else if (role === 'herald') { owe(sim, q, 'k' + e.kid, 5, '刑場の役人の手当'); sim.remember(q, `刑場で${e.given}の罪状を読み上げた`, { emo: -0.2, imp: 0.6, about: [p.id], k: 'justice' }); }
    else if (role === 'guard') owe(sim, q, 'k' + e.kid, 3, '刑場の警固の手当');
  }
  sim.die(p, 'execution');
  e.stage = 'done'; e.doneDay = sim.today;
  stat(sim, 'executions');
  if (S.uw) { S.uw.stats = S.uw.stats || {}; S.uw.stats['処刑'] = (S.uw.stats['処刑'] || 0) + 1; }
  const L = sim.living();
  // 見物人の反応と記憶
  const watchers = e.crowd.map((id) => S.people[id]).filter((q) => alive(q) && !q.inside && dist2(q, e.x, e.z) < 10);
  const vicFam = new Set(); const vic = S.people[e.vic];
  if (vic) { vicFam.add(vic.id); for (const id of sim.hh(vic)?.members || []) vicFam.add(id); }
  const ownFam = new Set(hh?.members || []);
  const judge = S.people[e.judge];
  let spoke = 0, shocked = 0, frowned = 0;
  for (const q of watchers) {
    const sens = q.pers.N > 0.6 && q.pers.A > 0.5;
    const frown = !sens && q.pers.A > 0.6 && q.pers.O > 0.55;
    const plotting = !!(q.uwRole || (S.wanted[q.id]) || (q.jsRecord > 0) || q.job === 'thief' || q.revenge != null);
    let line, emo = -0.5;
    if (ownFam.has(q.id)) { line = R.pick([`身内の${e.given}の最期を、群衆の後ろから見届けた`, `${e.given}が処刑台に立つのを見た。声をかけることもできなかった`]); emo = -1; }
    else if (vicFam.has(q.id)) { line = R.pick([`${vic?.given || '家族'}の仇、${e.given}の最期を見届けた`, `${e.given}の処刑を見た。これで${vic?.given || 'あの人'}も浮かばれると思った`]); emo = 0.2; }
    else if (sens) { line = R.pick([`${lead(R, q)}${e.given}の処刑を見に行ったが、途中で目を背けた`, `広場で${e.given}が処刑されるのを見てしまった`, `処刑台の鐘の音を聞いて、たまらず広場を離れた`]) + '。' + R.pick(['夜になっても震えが止まらなかった', '胸が苦しくて、食事がのどを通らなかった', 'あんなものを見に行くのではなかった', '目を閉じても、あの台が浮かんできた']); emo = -0.9; shocked++; }
    else if (frown) { line = R.pick([`${lead(R, q)}${e.given}の処刑を見た`, `処刑の広場で、はしゃぐ見物人に眉をひそめた`, `${e.given}の処刑に集まった人の多さに驚いた`]) + '。' + R.pick(['あれを見世物にするのは、どうかと思った', '人の死を楽しむようになったら、この町もおしまいだ', 'ほかに償わせる道はなかったのだろうか']); emo = -0.5; frowned++; }
    else if (plotting) { line = R.pick([`${lead(R, q)}${e.given}の最期を見た`, `処刑台の${e.given}を見て、背筋が冷えた`, `${lead(R, q)}${e.crime}の罪で${e.given}が処刑されるのを見た`]) + '。' + R.pick(['罪を重ねれば、次は自分があそこに立つのだと思い知った', '悪い稼業から手を引こうかと思った', '当分は大人しくしていようと思った', 'あれは明日の自分かもしれない']); emo = -0.7; }
    else line = watchLine(sim, q, e, 'exec', cap);
    if (words && R.chance(0.35)) line += `。${e.given}は最後に「${words}」と言った`;
    sim.remember(q, line, { emo, imp: 0.85, about: [p.id], k: 'execution' });
    // 恐れ：性格で強さが変わり、日がたつと薄れる（lawDaily）
    const f = clamp(0.35 + q.pers.N * 0.35 + (1 - q.values.courage) * 0.2 + (plotting ? 0.2 : 0), 0.1, 1);
    q.jsFear = Math.max(q.jsFear || 0, f); q.jsFearDay = sim.today;
    if (sens) { q.needs.pleasure = Math.max(0, q.needs.pleasure - 25); q.needs.sleep = Math.max(0, q.needs.sleep - 10); q.mood = Math.max(0, (q.mood ?? 50) - 10); }
    if (frown && alive(judge)) sim.relMut(q, judge).a -= 4;
    if (spoke < 4 && !ownFam.has(q.id) && R.chance(0.5)) {
      spoke++;
      const t = ownFam.has(q.id) ? '……' : vicFam.has(q.id) ? R.pick(['見届けたよ……', 'これで終わった']) : sens ? R.pick(['……見ていられない', 'もう帰りたい']) : frown ? R.pick(['こんなもの、見世物じゃない', '子どもには見せられない']) : m ? R.pick(['罪を犯せば、ああなる', '自業自得だ', 'なんまいだ……', '鐘が鳴った……']) : R.pick(['……終わった', '鐘が鳴った']);
      say(sim, q, t);
    }
  }
  stat(sim, 'spectators', watchers.length);
  e.watchN = watchers.length;
  // 家族の悲しみと恥、裁いた者への恨み
  for (const id of hh?.members || []) {
    const q = S.people[id];
    if (!alive(q) || sim.ageOf(q) < 10) continue;
    sim.remember(q, `${e.given}が処刑された。町の人の目が冷たく感じられた`, { emo: -0.9, imp: 0.95, about: [p.id], k: 'shame' });
    q.needs.esteem = Math.max(0, q.needs.esteem - 30);
    if (alive(judge) && judge !== q) {
      sim.relMut(q, judge).a -= 35;
      if (!e.framed && q.pers.A < 0.3 && q.values.courage > 0.55 && sim.ageOf(q) >= 16 && q.revenge == null && R.chance(0.35)) {
        q.revenge = judge.id;
        sim.remember(q, `${e.given}を処刑させた${judge.given}を、決して許さないと誓った`, { emo: -1, imp: 1, about: [judge.id], k: 'grudge' });
      }
    }
  }
  if (hh) hh.jsShame = sim.today;
  // 町の恐れ（見た町は強く、同じ国のほかの町にも噂で届く）と、民の不満
  const tj = townJ(sim, e.sid);
  tj.fear = clamp(tj.fear + 0.45, 0, 1);
  for (const s of S.world.settlements) {
    if (s.id === e.sid || s.kingdom !== e.kid) continue;
    const t2 = townJ(sim, s.id); t2.fear = clamp(t2.fear + 0.15, 0, 1);
    const tt = S.towns[s.id]; if (tt && tt.unrest != null) tt.unrest = clamp(tt.unrest + (e.sev > 0.7 ? 1.5 : 0.4), 0, 100);
  }
  { const tt = S.towns[e.sid]; if (tt && tt.unrest != null) tt.unrest = clamp(tt.unrest + (e.sev > 0.7 ? 3 : 0.8) + shocked * 0.2 + frowned * 0.2, 0, 100); }
  // 見ていない町の人にも、処刑があったことが伝わる
  for (const q of L) if (q.s === e.sid && !e.crowd.includes(q.id) && q.jail == null && sim.ageOf(q) >= 12 && R.chance(0.35)) {
    sim.remember(q, `広場で${e.given}が${e.crime}の罪で処刑されたと聞いた`, { emo: -0.3, imp: 0.45, about: [p.id], k: 'execution' });
    q.jsFear = Math.max(q.jsFear || 0, 0.2 + q.pers.N * 0.2); q.jsFearDay = sim.today;
  }
  sim.news(`${e.name}の${m ? '処刑' : '刑'}が${cap.name}の広場で執り行われた（${e.crime}の罪）。見物人はおよそ${watchers.length}人`, 3, { x: e.x, z: e.z });
  sim.chron(`${e.name}が${e.crime}の罪で、${cap.name}の広場にて公開処刑された${e.conf ? `。財産${e.conf}銅貨は国庫に没収された` : ''}`, e.kid);
  e.crowd = []; e.spots = {};
}

// むち打ち：朝のうちに広場へ引き出し、人前で罰を与える（命にはかかわらない）
function doLash(sim, l) {
  const S = sim.S, R = sim.rng, p = S.people[l.id];
  l.done = true;
  if (!alive(p) || p.jail == null) return;
  const cap = sim.town(l.sid);
  const spot = scaffoldSpot(sim, cap);
  p.inside = null; p.fight = null; p.path = [];
  p.pos = { x: spot.x, z: spot.z };
  p.action = { type: 'pillory', dur: 60, until: S.t + 60, bld: null, phase: 'do', tx: spot.x, tz: spot.z, startNeeds: { ...p.needs }, startMood: p.mood };
  p.hp = Math.max(1, p.hp - p.maxhp * 0.25);
  p.needs.esteem = Math.max(0, p.needs.esteem - 40);
  sim.remember(p, `${cap.name}の広場で、人々の前でむち打ちの刑を受けた`, { emo: -0.9, imp: 0.95, k: 'uwcrime' });
  say(sim, p, R.pick(['くっ……', 'もうしません……', '……']));
  sim.pushLog(`${cap.name}の広場で、${sim.fullName(p)}が${l.crime}の罪でむち打ちの刑を受けた。`, 'event', [p.id], spot);
  const near = sim.living().filter((q) => q !== p && q.jail == null && !q.inside && dist2(q, spot.x, spot.z) < 9);
  for (const q of near.slice(0, 20)) {
    sim.remember(q, watchLine(sim, q, { given: p.given, crime: l.crime, judgeT: '' }, 'lash', cap), { emo: -0.4, imp: 0.5, about: [p.id], k: 'execution' });
    q.jsFear = Math.max(q.jsFear || 0, 0.15 + q.pers.N * 0.2); q.jsFearDay = sim.today;
  }
  const tj = townJ(sim, l.sid); tj.fear = clamp(tj.fear + 0.08, 0, 1);
  const pt = townJ(sim, p.s); pt.fear = clamp(pt.fear + 0.05, 0, 1);
  stat(sim, 'lashWatch', near.length);
}

// ---------- 濡れ衣と真犯人 ----------
function frameDaily(sim, L) {
  const S = sim.S, R = sim.rng, j = J(sim);
  for (const u of S.unsolved || []) {
    if (u.jsAccused != null || sim.today - u.day > 30) continue;
    const vic = S.people[u.victim];
    if (!vic) continue;
    const kid = sim.town(vic.s)?.kingdom;
    const pol = kingPolicy(sim, kid);
    if (!R.chance(0.02 + pol.sev * 0.03)) continue;
    const cands = L.filter((q) => q.id !== u.killer && q.id !== vic.id && q.s === vic.s && q.jail == null && !S.wanted[q.id] && sim.ageOf(q) >= 18 && !ELITE.has(q.rank) && !LAWFUL.has(q.job) && !q.uwCaptive && !q.party);
    if (!cands.length) continue;
    const q = R.weighted(cands, (x) => 0.05 + Math.max(0, -(x.rel?.[vic.id]?.a || 0)) / 40 + (['beggar', 'wanderer', 'thief'].includes(x.job) ? 1 : 0) + (x.jsRecord > 0 ? 1 : 0) + (1 - x.pers.A) * 0.3);
    const g = L.find((x) => LAWFUL.has(x.job) && x.s === vic.s && x.jail == null && !x.fight) || L.find((x) => LAWFUL.has(x.job) && sim.town(x.s)?.kingdom === kid && x.jail == null && !x.fight);
    if (!q || !g) continue;
    u.jsAccused = q.id;
    markWanted(sim, q, '殺人', 120);
    q.inside = null; q.fight = null;
    arrest(sim, g, q);
    if (q.jail == null) { delete S.wanted[q.id]; if (q.rankBefore) { q.rank = q.rankBefore; delete q.rankBefore; } continue; }
    q.jsFramed = { victim: vic.id, killer: u.killer, day: sim.today };
    j.framed.push({ id: q.id, victim: vic.id, killer: u.killer, day: sim.today, sid: vic.s, kid, done: false });
    stat(sim, 'framed');
    sim.remember(q, `${vic.given}殺しの疑いをかけられた。まったく身に覚えがなかった`, { emo: -1, imp: 1, about: [vic.id], k: 'uwcrime' });
    sim.pushLog(`${sim.town(vic.s).name}で、${vic.given}殺しの疑いで${sim.fullName(q)}が捕らえられた。`, 'event', [q.id], q.pos);
  }
  // 真犯人が分かる：別の罪で捕まる・証拠が出る・死の床で打ち明ける
  for (const f of j.framed) {
    if (f.done) continue;
    const killer = S.people[f.killer], inn = S.people[f.id];
    const found = (killer && killer.jail != null) || R.chance(0.012) || (killer && killer.deathYear != null && R.chance(0.05));
    if (!found || !inn) continue;
    f.done = true;
    stat(sim, 'revealed');
    const k = S.kingdoms[f.kid], town = sim.town(f.sid);
    const executed = inn.deathYear != null && inn.deathCause === 'execution';
    const tj = townJ(sim, f.sid);
    tj.trust = clamp(tj.trust - (executed ? 0.35 : 0.12), 0, 1);
    if (k) k.fame = (k.fame || 50) - (executed ? 12 : 4);
    for (const s of S.world.settlements) if (s.kingdom === f.kid && S.towns[s.id]?.unrest != null) S.towns[s.id].unrest = clamp(S.towns[s.id].unrest + (executed ? 8 : 3), 0, 100);
    if (alive(killer) && killer.jail == null && !S.wanted[killer.id]) markWanted(sim, killer, '殺人', 120);
    const kname = killer ? sim.fullName(killer) : '別の者';
    // 償い金は国庫から、濡れ衣を着せられた人の家族へ
    const hh = S.households[inn.hh] || null;
    const pay = k && hh ? Math.round(Math.min(executed ? 80 : 40, Math.max(0, k.treasury * 0.05))) : 0;
    if (pay > 0) { k.treasury -= pay; hh.money += pay; flow(sim, 'k' + f.kid, hh.id, pay, '濡れ衣の償い金'); }
    if (executed) {
      sim.news(`${town.name}の${sim.fullName(inn)}は無実だった。${S.people[f.victim]?.given || ''}殺しの真犯人は${kname}と分かり、人々は王の裁きを疑いはじめた`, 3, town);
      sim.chron(`${sim.fullName(inn)}の処刑は濡れ衣だったと分かった（真犯人は${kname}）。${k?.name || ''}の裁きへの信頼は地に落ちた`, f.kid);
      for (const q of sim.living()) if (q.s === f.sid && sim.ageOf(q) >= 12 && R.chance(0.5)) sim.remember(q, `処刑された${inn.given}は無実だったと聞いた。もう裁きを信じられないと思った`, { emo: -0.8, imp: 0.85, about: [inn.id], k: 'execution' });
      for (const id of hh?.members || []) { const q = S.people[id]; if (alive(q)) sim.remember(q, `${inn.given}は無実だったと、ようやく認められた。${pay ? `償い金${pay}銅貨が届いたが、` : ''}あの人は帰ってこない`, { emo: -0.8, imp: 1, about: [inn.id], k: 'grudge' }); }
    } else {
      if (alive(inn) && inn.jail != null) {
        const jail = sim.building(inn.jail);
        inn.jail = null; inn.inside = null; inn.pos = jail ? { ...jail.door } : inn.pos; inn.action = null; inn.prisonDays = 0;
        inn.rank = inn.rankBefore && !['outlaw', 'prisoner'].includes(inn.rankBefore) ? inn.rankBefore : (JOBS[inn.job]?.rank || 'commoner');
        delete inn.rankBefore;
        for (const e of J(sim).execs) if (e.pid === inn.id && (e.stage === 'sched' || e.stage === 'built' || e.stage === 'led')) { e.stage = 'cancel'; e.crowd = []; e.spots = {}; e.roles = {}; }
      }
      inn.jsFramed = null;
      if (alive(inn)) sim.remember(inn, `濡れ衣が晴れて、牢から出された。${pay ? `償い金${pay}銅貨が家に届いた` : 'だが失った日々は戻らなかった'}`, { emo: 0.4, imp: 1, k: 'justice' });
      sim.news(`${sim.fullName(inn)}の疑いが晴れた。${S.people[f.victim]?.given || ''}殺しの真犯人は${kname}だった`, 2, town);
    }
  }
  if (j.framed.length > 40) j.framed.splice(0, j.framed.length - 40);
}

// ---------- 王の方針の見直し ----------
function policyDaily(sim) {
  const S = sim.S, R = sim.rng, j = J(sim);
  for (const k of S.kingdoms) {
    const pol = kingPolicy(sim, k.id);
    const king = S.people[k.kingId];
    const towns = S.world.settlements.filter((s) => s.kingdom === k.id && S.towns[s.id]);
    // 厳しすぎる王の国では、民の不満が少しずつたまる
    if (pol.sev > 0.78) for (const s of towns) { const t = S.towns[s.id]; if (t.unrest != null) t.unrest = clamp(t.unrest + (pol.sev - 0.78) * 2, 0, 100); }
    // 甘い王の国では、罪を軽く見る風潮（甘さ）が残る
    for (const s of towns) { const tj = townJ(sim, s.id); const floor = Math.max(0, 0.38 - pol.sev) * 0.6; if (tj.lax < floor) tj.lax = floor; }
    if ((sim.today + k.id) % 7 !== 0 || !alive(king)) continue;
    const crimeNow = towns.reduce((a, s) => a + (S.towns[s.id].crime || 0), 0);
    const rise = pol.crime0 == null ? 0 : crimeNow - pol.crime0;
    pol.crime0 = crimeNow;
    const unrest = towns.length ? towns.reduce((a, s) => a + (S.towns[s.id].unrest || 0), 0) / towns.length : 0;
    if (rise >= 6 && pol.sev < 0.85 && R.chance(0.4 + king.pers.C * 0.4)) {
      pol.sev = clamp(pol.sev + 0.06, 0.05, 0.95);
      sim.news(`${k.name}の${title(king)}${king.given}が、罪人への取り締まりを強めると布告した`, 2);
      sim.chron(`${k.name}で罪が増え、${title(king)}${king.given}は裁きを厳しくした`, k.id);
    } else if (unrest > 55 && pol.sev > 0.5 && R.chance(0.3 + king.pers.A * 0.5)) {
      pol.sev = clamp(pol.sev - 0.06, 0.05, 0.95);
      sim.news(`民の不満を受け、${k.name}の${title(king)}${king.given}が裁きを和らげると布告した`, 2);
    }
  }
  void j;
}

// ---------- 毎日 ----------
export function lawDaily(sim) {
  const S = sim.S, j = J(sim), L = sim.living();
  // 裁き：まだ裁かれていない囚人
  for (const p of L) {
    if (p.jail == null) { if (p.jsTried) p.jsTried = false; continue; }
    // underworld.js が昔決めた死刑（牢の中での処刑）は、公開処刑に切り替える
    if (p.uwExecDay != null) {
      p.uwExecDay = null;
      if (!j.execs.some((e) => e.pid === p.id && e.stage !== 'cancel' && e.stage !== 'done')) { const cap = prisonTown(sim, p); const pol = kingPolicy(sim, cap.kingdom); scheduleExecution(sim, p, cap, null, p.crime || '重罪', victimOf(sim, p), pol.sev); }
      p.jsTried = true;
      continue;
    }
    if (p.jsTried) continue;
    trial(sim, p, L);
  }
  frameDaily(sim, L);
  policyDaily(sim);
  // 恐れは性格と日数で薄れる（臆病な人ほど長く残り、図太い人・好奇心の強い人は早く忘れる）
  for (const p of L) {
    if (!p.jsFear) continue;
    p.jsFear = Math.max(0, p.jsFear - (0.015 + (1 - p.pers.N) * 0.035 + p.values.courage * 0.02 + p.pers.O * 0.01));
    if (p.jsFear <= 0.01) { delete p.jsFear; delete p.jsFearDay; }
  }
  for (const t of Object.values(j.towns)) {
    t.fear = Math.max(0, t.fear * 0.93 - 0.01);
    t.lax = Math.max(0, t.lax * 0.95 - 0.004);
    t.trust = Math.min(0.9, t.trust + 0.004);
  }
  // 片づけ
  j.execs = j.execs.filter((e) => !((e.stage === 'done' || e.stage === 'cancel') && sim.today - (e.doneDay ?? e.day) > 6));
  j.lashes = j.lashes.filter((l) => !l.done && sim.today - l.day < 3);
  j._mulDay = -1;
}

// ---------- 毎時 ----------
export function lawHourly(sim) {
  const S = sim.S;
  if (!S.justice || !S.justice.v) { ensureJustice(sim); return; }
  const j = S.justice, h = Math.floor(sim.hour()), today = sim.today;
  for (const e of j.execs) {
    if (e.stage === 'done' || e.stage === 'cancel') continue;
    if (!e.rumor && ((today === e.day - 1 && h >= 18) || today >= e.day)) spreadNotice(sim, e);
    if (e.stage === 'sched' && ((today === e.day && h >= 6) || today > e.day)) buildScaffold(sim, e);
    if ((e.stage === 'sched' || e.stage === 'built') && ((today === e.day && h >= 10) || today > e.day)) leadOut(sim, e);
    else if (e.stage === 'led' && ((today === e.day && h >= 11) || today > e.day)) execute(sim, e);
  }
  if (h >= 9) for (const l of j.lashes) if (!l.done && today >= l.day) doLash(sim, l);
}

// ---------- 行動の候補（sim.decide から） ----------
export function lawDecide(sim, p, cands, add) {
  const S = sim.S, j = S.justice;
  if (!j || !j.v) return;
  // 刑場へ：役人と見物人
  if (j.execs.length) for (const e of j.execs) {
    if (e.stage !== 'led' || S.t < e.from || S.t >= e.to) continue;
    const role = e.roles[p.id];
    const inCrowd = e.crowd.includes(p.id);
    if (!role && !inCrowd) continue;
    const spot = e.spots[p.id] || ringSpot(sim, e, (p.id % 11) + 1);
    const dur = Math.max(15, e.to - S.t);
    if (role && role !== 'guard') add(30, 'execduty', { x: spot.x, z: spot.z }, dur);
    else add(role === 'guard' ? 12 : 9.5, 'execwatch', { x: spot.x, z: spot.z }, dur);
    break;
  }
  // 犯罪の抑え：悪事の候補がある人だけ
  let has = false;
  for (const c of cands) if (CRIME_ACTS.has(c.type)) { has = true; break; }
  if (!has) return;
  const tj = j.towns[p.s];
  const town = tj ? clamp(tj.fear - tj.lax - (1 - tj.trust) * 0.3, -0.6, 1) : 0;
  let d = (p.jsFear || 0) * 0.75 + town * 0.5;
  d *= 1.15 - p.values.courage * 0.3;
  if (p.needs.hunger < 15) d *= 0.5;   // 背に腹は代えられない
  if (p.bandit) d *= 0.6;
  d = clamp(d, -0.5, 0.85);
  if (d > 0) {
    if (!p.jsHold || p.jsHold.d !== sim.today) {
      p.jsHold = { d: sim.today, hold: sim.rng.chance(d) };
      if (p.jsHold.hold) {
        stat(sim, 'deterred');
        if (sim.rng.chance(0.3)) sim.remember(p, p.jsFear > 0.3 ? '広場で見た処刑を思い出して、悪事に手を出すのはやめておいた' : 'このごろは裁きが厳しいと聞いて、悪事は控えておいた', { emo: -0.1, imp: 0.4, k: 'execution' });
      }
    }
    if (p.jsHold.hold) { for (const c of cands) if (CRIME_ACTS.has(c.type)) c.score = -99; }
  } else if (d < 0) {
    for (const c of cands) if (CRIME_ACTS.has(c.type)) c.score += -d * 2.5;   // 罰が甘い町では、悪事に気が向きやすい
  }
}

// ---------- 画面用のまとめ ----------
export function lawSummary(sim) {
  const S = sim.S, j = S.justice;
  if (!j) return null;
  return {
    stats: { ...j.stats },
    kings: S.kingdoms.map((k) => { const pol = j.kings[k.id]; return pol ? { name: k.name, sev: Math.round(pol.sev * 100) / 100, word: sevWord(pol.sev), conf: pol.conf } : null; }).filter(Boolean),
    recent: j.cases.slice(-8).reverse(),
    next: j.execs.filter((e) => e.stage !== 'done' && e.stage !== 'cancel').map((e) => ({ name: e.name, crime: e.crime, day: e.day, town: sim.town(e.sid)?.name })),
  };
}
