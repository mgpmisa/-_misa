// 税（案K）：人頭税・地代・売上税・関税・十分の一税、徴税役人の巡回、免税と減免、脱税と密輸、不満と陳情・暴動・反乱
// これまでの politics.js の「一律の税」を置き換える前提の仕組み。
// 状態：S.tax（徴税の巡回・通算の数字・反乱）、k.taxes（国ごとの税の方針）、k.fisc（国庫の収支）、
//       S.towns[sid].unrest（町の不満度 0〜100）、S.towns[sid].alms（教会の施し箱）、hh.taxMark / hh.taxDebt（家ごとの控え）。
// どれも ensureTaxes で遅延初期化するので、古いセーブでも動く。
import { clamp } from './rng.js';
import { JOBS, GOODS } from './data.js';
import { markWanted, arrest, startFight, humanStats } from './society.js';
import { houseValue, headOf } from './property.js';

export const TAX_NAME = { poll: '人頭税', land: '地代', sales: '売上税', toll: '関税', war: '戦費税', fine: '罰金', crown: '王領', tithe: '十分の一税' };
export const PERIOD = 5;                         // 徴税日の間隔（日）。1季（10日）に2回
const COLLECTORS = ['scribe', 'guard', 'watchman', 'militia', 'soldier', 'knight'];   // 徴税役人になれる職（先頭ほど優先）
const LAWFUL = new Set(['guard', 'watchman', 'militia', 'soldier', 'knight', 'royalguard', 'jailer', 'general', 'paladin']);
const CLERGY = new Set(['priest', 'nun', 'cleric', 'paladin']);
const FARM = new Set(['farmer', 'rancher', 'shepherd', 'beekeeper', 'miller', 'elder']);
const TRADE = new Set(['merchant', 'innkeeper', 'smith', 'baker', 'carpenter', 'tailor', 'changer', 'captain', 'smuggler']);
const PRIVILEGED = new Set(['king', 'royal', 'noble', 'knight']);
const isTrade = (j) => !!j && !FARM.has(j) && (TRADE.has(j) || !!JOBS[j]?.goods);
const r1 = (v) => Math.round(v * 10) / 10;
const title = (p) => (p?.sex === 'f' ? '女王' : '王');
const alive = (p) => p && p.deathYear == null;

// ---------- 状態 ----------
const blank = () => ({ poll: 0, land: 0, sales: 0, toll: 0, war: 0, fine: 0, crown: 0, tithe: 0 });
export function ensureTaxes(sim) {
  const S = sim.S;
  if (!S.tax) S.tax = { v: 1, rounds: {}, stats: { visits: 0, paid: 0, short: 0, exempt: 0, hid: 0, caught: 0, jailed: 0, refused: 0, attacked: 0, tolls: 0, smuggle: 0, smuggleCaught: 0, petitions: 0, granted: 0, riots: 0, rebellions: 0, alms: 0, cuts: 0, hikes: 0 }, rebellion: null, lastRebellion: -999 };
  S.tax.rounds = S.tax.rounds || {};
  for (const k of S.kingdoms || []) {
    if (!k.taxes) k.taxes = policyFor(sim, k);
    if (!k.fisc) k.fisc = { cur: blank(), last: null, hist: [], dayIn: 0, prevT: k.treasury };
  }
  for (const t of Object.values(S.towns)) { if (t.unrest == null) t.unrest = 0; if (t.alms == null) t.alms = 0; }
  return S.tax;
}

// 王の性格から税の方針を決める（国ごとに違う）
function policyFor(sim, k, prev = null) {
  const king = sim.S.people[k.kingId];
  const A = king?.pers.A ?? 0.5, amb = king?.values.ambition ?? 0.5;
  const greed = clamp(0.5 + (amb - 0.5) * 0.6 - (A - 0.5) * 0.8, 0, 1);    // 取り立ての強さ
  const cap = sim.S.world.settlements[k.capital];
  const ports = sim.S.world.settlements.filter((s) => s.kingdom === k.id && s.type === 'port').length;
  // 国柄：畑の多い国は地代、港の多い国は関税に頼る
  const land = sim.S.world.settlements.filter((s) => s.kingdom === k.id && s.type === 'village').length;
  return {
    kingId: k.kingId,
    lv: prev ? prev.lv : r1(0.8 + greed * 0.6),     // 税の重さの水準（1.0 が標準）
    greed,
    poll: 3 + (k.id % 2 ? 0.5 : 0),                  // 成人一人あたり（銅貨・徴税日ごと）
    land: 0.8 + land * 0.15,                         // 家と畑の値打ちの %（徴税日ごと）
    sales: 0.07 + (cap?.type === 'capital' ? 0.01 : 0), // 職人・商人のもうけの割合
    toll: 0.06 + ports * 0.03,                       // 他国から入る荷の値打ちの割合
    tithe: 0.1,                                      // 収穫（農家のもうけ）の十分の一は教会へ
    warLevy: prev ? prev.warLevy : false,
    relief: prev ? prev.relief : {},                 // sid -> 減免が続く日（陳情・災害）
    lastChange: prev ? prev.lastChange : -99,
    lock: prev ? prev.lock : false,                  // true なら水準を王が動かさない（試験・勅令用）
  };
}
function rateOf(k) { return k.taxes.lv; }
function syncLegacy(k) { k.tax = Math.round(0.05 * k.taxes.lv * 100) / 100; }   // 旧表示（税率%）との互換

// ---------- 家ごとの査定 ----------
function isTaxDay(sim, k) { return (sim.today + k.id * 2) % PERIOD === PERIOD - 1; }
export function nextTaxDay(sim, k) { let d = sim.today; while ((d + k.id * 2) % PERIOD !== PERIOD - 1) d++; return d; }

function inRelief(sim, k, sid) {
  const S = sim.S;
  if (S.towns[sid]?.occupied) return '占領下で徴税できない';
  if ((k.taxes.relief[sid] ?? -1) >= sim.today) return '減免中';
  if (S.disasters?.some((d) => d.sids?.includes(sid) && sim.today - (d.day ?? -99) <= 8)) return '災害のため免除';
  return null;
}

export function assess(sim, k, hh, owns = null) {
  const S = sim.S, pol = k.taxes, lv = rateOf(k);
  const out = { poll: 0, land: 0, sales: 0, war: 0, tithe: 0, debt: 0, total: 0, why: null };
  if (hh.royal) { out.why = '王家は免税'; return out; }
  if (hh.bandits) { out.why = '盗賊の一味には届かない'; return out; }
  { const ts = sim.town(hh.s); if (ts?.tribal && ts.annexed == null) { out.why = '民族の村には王国の税が届かない'; return out; } }
  if (hh.street || hh.wander) { out.why = '宿なしで取り立てられない'; return out; }
  const relief = inRelief(sim, k, hh.s);
  if (relief === '占領下で徴税できない') { out.why = relief; return out; }
  const house = hh.house != null ? sim.building(hh.house) : null;
  if (house && S.wx?.damaged?.includes(house.id)) { out.why = '家が災害で傷み免除'; return out; }
  const mem = hh.members.map((id) => S.people[id]).filter(alive);
  if (!mem.length) { out.why = '誰もいない'; return out; }
  const head = headOf(sim, hh);
  if (head && CLERGY.has(head.job)) { out.why = '聖職者の家は免税'; return out; }
  const noble = mem.some((p) => ['noble', 'king', 'royal'].includes(p.rank) || p.job === 'noble');
  const adults = mem.filter((p) => sim.ageOf(p) >= 16 && p.jail == null && !PRIVILEGED.has(p.rank) && !CLERGY.has(p.job));
  out.poll = pol.poll * lv * adults.length;
  let estate = (hh.land || 0) * 20;
  if (!owns) owns = sim.town(hh.s).buildings.filter((id) => sim.building(id)?.owner === hh.id);
  for (const id of owns) { const b = sim.building(id); if (b && b.owner === hh.id) estate += b.value || houseValue(sim, b); }
  out.land = estate * pol.land / 100 * lv * (noble ? 0.5 : 1);
  const gain = Math.max(0, hh.money - (hh.taxMark ?? hh.money));
  if (mem.some((p) => isTrade(p.job))) out.sales = gain * pol.sales * lv * (noble ? 0.5 : 1);
  if ((hh.land || 0) > 0 || mem.some((p) => FARM.has(p.job))) {
    const alms = S.towns[hh.s]?.alms || 0;
    out.tithe = gain * pol.tithe * (alms > 300 ? 0.3 : 1);   // 施し箱が満ちていれば教会は取り立てを軽くする
  }
  if (pol.warLevy) out.war = (out.poll + out.land) * 0.3;
  out.debt = Math.min(60, hh.taxDebt || 0);
  // 減免：貧しい家・宿住まい・陳情や災害の後
  let mul = 1;
  if (hh.money < 30) { mul = 0; out.why = '貧しいので免除'; }
  else if (hh.money < 60) { mul = 0.5; out.why = '暮らし向きを見て半分に'; }
  if (hh.inn) mul *= 0.5;
  if (house && house.owner != null && house.owner !== hh.id && (house.arrears || 0) > 0) { mul *= 0.5; out.why = out.why || '家賃を滞納しているので半分に'; }   // 追い出しを税で早めない
  if (relief) { mul *= 0.5; out.why = out.why || relief; }
  for (const key of ['poll', 'land', 'sales', 'war', 'tithe']) out[key] *= mul;
  if (mul === 0) { out.debt = 0; hh.taxDebt = 0; }   // 貧しい家の滞納は帳消し
  // 一度に家計の3分の1より多くは取らない
  const sum = out.poll + out.land + out.sales + out.war + out.tithe + out.debt;
  const capAmt = Math.max(0, hh.money) / 3;
  if (sum > capAmt && sum > 0) { const f = capAmt / sum; for (const key of ['poll', 'land', 'sales', 'war', 'tithe', 'debt']) out[key] *= f; }
  out.total = out.poll + out.land + out.sales + out.war + out.tithe + out.debt;
  return out;
}

// ---------- 徴税の巡回（徴税日ごと・町ごと） ----------
function pickCollectors(sim, sid, n) {
  const L = sim.living().filter((p) => p.s === sid && p.jail == null && !p.mission && !p.fight && sim.isAdult(p) && sim.ageOf(p) < 68 && COLLECTORS.includes(p.job));
  L.sort((a, b) => COLLECTORS.indexOf(a.job) - COLLECTORS.indexOf(b.job) || b.pers.C - a.pers.C);
  return L.slice(0, n);
}

function openRound(sim, k, s) {
  const S = sim.S, R = sim.rng, town = S.towns[s.id];
  const hhs = Object.values(S.households).filter((h) => h.s === s.id);
  // 持ち家の一覧（査定用）
  const owns = {};
  for (const id of s.buildings) { const b = sim.building(id); if (b && b.owner != null && (b.type === 'house' || b.type === 'mansion')) (owns[b.owner] = owns[b.owner] || []).push(id); }
  const riot = town.unrest >= 65 || S.tax.rebellion?.k === k.id;
  const round = { day: sim.today, k: k.id, sid: s.id, due: {}, order: [], col: {}, assign: {}, got: 0, dueSum: 0, moneySum: 0, riot, visited: 0 };
  for (const hh of hhs) {
    const a = assess(sim, k, hh, owns[hh.id] || []);
    if (a.total <= 0.2) { if (a.why) S.tax.stats.exempt++; if (!hh.royal && !hh.bandits) hh.taxMark = hh.money; continue; }
    const head = headOf(sim, hh);
    const e = { ...a, hide: 0, refuse: false, done: false };
    // 脱税：良心の薄い裕福な家は財産を隠す
    if (head && hh.money > 180) {
      const conscience = head.pers.C * 0.7 + head.values.faith * 0.3;
      if (conscience < 0.4 && R.chance((0.4 - conscience) * 1.6 + town.unrest / 300)) e.hide = R.range(0.3, 0.7);
    }
    // 暴動の町では、払わない家が出る
    if (riot && R.chance(clamp((town.unrest - 45) / 60, 0.1, 0.8))) e.refuse = true;
    round.due[hh.id] = e; round.order.push(hh.id);
    round.dueSum += a.total; round.moneySum += Math.max(0, hh.money);
  }
  const n = s.type === 'capital' ? 3 : 2;
  for (const c of pickCollectors(sim, s.id, n)) round.col[c.id] = 1;
  S.tax.rounds[s.id] = round;
  return round;
}

// 徴税役人の行動候補（sim.decide から呼ぶ。add は decide の add と同じ形）
export function taxCandidates(sim, p, add) {
  const S = sim.S;
  const r = S.tax?.rounds?.[p.s];
  if (!r || r.day !== sim.today || !r.col[p.id]) return;
  const h = sim.hour();
  if (h < 8 || h >= 17 || p.jail != null || p.fight) return;
  const here = p.inside != null ? sim.building(p.inside).door : p.pos;
  let best = null, bd = 1e9;
  const taken = new Set(Object.values(r.assign));
  for (const id of r.order) {
    const e = r.due[id];
    if (e.done || (taken.has(id) && r.assign[p.id] !== id)) continue;
    const hh = S.households[id];
    const b = hh && hh.house != null ? sim.building(hh.house) : null;
    if (!b) continue;
    const d = Math.abs(b.door.x - here.x) + Math.abs(b.door.z - here.z);
    if (d < bd) { bd = d; best = { hh, b }; }
  }
  if (!best) return;
  r.assign[p.id] = best.hh.id;
  const head = headOf(sim, best.hh);
  add(8.5 + p.pers.C * 1.5, 'levy', { x: best.b.door.x, z: best.b.door.z, bld: best.b.id }, 15, { friend: head?.id });
}

// 到着時（sim.arrive の switch から呼ぶ）：'levy'（徴税）と 'petition'（陳情）
export function taxArrive(sim, p) {
  const a = p.action;
  if (!a) return;
  ensureTaxes(sim);
  if (a.type === 'levy') {
    const r = sim.S.tax.rounds[p.s];
    const id = r?.assign[p.id];
    if (r && id != null) { collectFrom(sim, r, id, p); delete r.assign[p.id]; }
    a.until = sim.S.t + 15;
  } else if (a.type === 'petition') {
    const t = sim.S.towns[p.petitionFor ?? p.s];
    if (t?.petition && t.petition.pid === p.id && !t.petition.done) resolvePetition(sim, p.petitionFor ?? p.s, p);
    p.mission = null;
    a.until = sim.S.t + 40;
  }
}

// 一軒ぶんの徴収。collector が null なら役場への持参（自動精算）
function collectFrom(sim, r, hhId, collector) {
  const S = sim.S, R = sim.rng, st = S.tax.stats;
  const e = r.due[hhId];
  if (!e || e.done) return;
  e.done = true; r.visited++;
  const hh = S.households[hhId];
  const k = S.kingdoms[r.k];
  if (!hh || !k) return;
  const town = S.towns[r.sid];
  const head = headOf(sim, hh);
  const whoC = collector ? `徴税役人の${collector.given}` : '役人';
  if (collector) st.visits++;
  const tell = (txt, emo, imp = 0.45) => { for (const id of hh.members) { const q = S.people[id]; if (q && alive(q) && sim.ageOf(q) >= 14) sim.remember(q, txt, { emo, imp, k: 'tax', about: collector ? [collector.id] : [] }); } };
  // 払わない（暴動の町）
  if (e.refuse) {
    st.refused++;
    hh.taxDebt = Math.min(80, (hh.taxDebt || 0) + e.total * 0.5);
    tell(collector ? `${whoC}を追い返し、税を払わなかった` : '町のみんなと示し合わせて税を納めなかった', 0.1, 0.6);
    if (collector) {
      sim.remember(collector, `${hh.name || '家'}で税の支払いを拒まれた`, { emo: -0.5, imp: 0.5, k: 'tax' });
      const hot = hh.members.map((id) => S.people[id]).filter((q) => alive(q) && sim.isAdult(q) && q.jail == null && !q.fight && q.values.courage > 0.5 && q.pers.A < 0.5)[0];
      if (hot && R.chance(0.35)) {
        st.attacked++;
        if (hot.inside != null) { const b = sim.building(hot.inside); hot.pos = { x: b.door.x, z: b.door.z }; }
        startFight(sim, hot, collector, false);
        sim.remember(hot, `税を取り立てに来た${collector.given}に殴りかかった`, { emo: 0.1, imp: 0.8, about: [collector.id], k: 'tax' });
        sim.remember(collector, `徴税に回っていて${hot.given}に殴りかかられた`, { emo: -0.8, imp: 0.8, about: [hot.id], k: 'tax' });
        sim.relMut(collector, hot).a -= 20;
        sim.pushLog(`${sim.town(r.sid).name}で、徴税役人の${collector.given}が${sim.fullName(hot)}に襲われた。`, 'event', [collector.id, hot.id], collector.pos);
      } else sim.pushLog(`${sim.fullName(head || collector)}の家は、徴税役人${collector.given}に「一枚も払わん」と言い放った。`, 'event', [collector.id], collector.pos);
    }
    hh.taxMark = hh.money;
    return;
  }
  const evaded = e.total * e.hide;
  const want = e.total - evaded;
  const avail = Math.max(0, hh.money - 10);
  const paid = Math.min(want, avail);
  const short = want - paid;
  hh.money -= paid;
  // 内訳の比で国と教会に分ける
  const f = e.total > 0 ? paid / e.total : 0;
  const toChurch = e.tithe * f, toCrown = paid - toChurch;
  k.treasury += toCrown; k.fisc.dayIn += toCrown;
  for (const key of ['poll', 'land', 'sales', 'war']) k.fisc.cur[key] += e[key] * f;
  k.fisc.cur.poll += e.debt * f;   // 滞納分は人頭税として数える
  k.fisc.cur.tithe += toChurch;
  if (toChurch > 0) {
    const priest = sim.living().find((q) => q.job === 'priest' && q.s === r.sid);
    const ph = priest && sim.hh(priest);
    if (ph) { ph.money += toChurch * 0.1; town.alms += toChurch * 0.9; } else town.alms += toChurch;
  }
  r.got += paid;
  hh.taxDebt = Math.max(0, (hh.taxDebt || 0) - e.debt * f);
  if (short > 0.5) { hh.taxDebt = Math.min(80, (hh.taxDebt || 0) + short * 0.5); st.short++; }
  else st.paid++;
  // 隠し財産の発覚
  let caught = false;
  if (e.hide > 0) {
    st.hid++;
    const eye = collector ? 0.2 + collector.pers.C * 0.3 + (collector.job === 'scribe' ? 0.15 : 0) + (collector.skill?.[collector.job] || 0.3) * 0.1 : 0.08;
    if (R.chance(eye)) {
      caught = true; st.caught++;
      const fine = Math.min(Math.max(0, hh.money - 5), evaded * 2 + 10);
      hh.money -= fine; k.treasury += fine; k.fisc.dayIn += fine; k.fisc.cur.fine += fine;
      hh.taxEvasions = (hh.taxEvasions || 0) + 1;
      const locals = sim.living().filter((q) => q.s === r.sid && q.hh !== hh.id && sim.isAdult(q));
      if (head) {
        sim.remember(head, `財産を隠していたのが${whoC}に見つかり、${Math.round(fine)}銅貨の罰金を取られた`, { emo: -0.8, imp: 0.8, k: 'tax', about: collector ? [collector.id] : [] });
        sim.gossip(head, '財産を隠して税をごまかしていたのが見つかったらしい', -0.5, R.shuffle(locals).slice(0, 8), { silent: true });
      }
      if (collector) { sim.remember(collector, `${head ? head.given : '住人'}の家で隠し財産を見つけた`, { emo: 0.5, imp: 0.6, k: 'tax' }); collector.needs.esteem = Math.min(100, collector.needs.esteem + 15); }
      // くり返しや大口の脱税は牢へ
      const arrester = !collector ? null : LAWFUL.has(collector.job) ? collector : sim.living().find((q) => q.s === r.sid && LAWFUL.has(q.job) && q.jail == null && !q.fight);
      const arrestable = head && arrester && head.jail == null && !head.talk && !head.fight && head.rank !== 'king' && head.rank !== 'royal';
      if (arrestable && (hh.taxEvasions >= 2 || evaded > 15)) {
        markWanted(sim, head, '脱税', 5 + Math.min(5, Math.round(evaded / 10)));
        arrest(sim, arrester, head);
        st.jailed++;
        town.unrest = clamp(town.unrest + 2, 0, 100);
      } else sim.pushLog(`${sim.town(r.sid).name}の${head ? sim.fullName(head) : '家'}が財産を隠していたのが見つかり、${Math.round(fine)}銅貨の罰金を科された。`, 'event', head ? [head.id] : [], collector?.pos || null);
    } else if (head) sim.remember(head, `銅貨をかめに隠して、税をいくらかごまかした`, { emo: 0.2, imp: 0.4, k: 'tax' });
  }
  if (!caught) {
    if (short > 0.5) {
      tell(`${whoC}に税を払いきれず、${Math.round(short)}銅貨を次まで待ってもらった`, -0.55, 0.55);
      if (collector && R.chance(0.3)) sim.pushLog(`${sim.fullName(head || collector)}の家は税を払いきれず、${collector.given}に頭を下げた。`, 'event', [collector.id], collector.pos);
    } else if (paid > 0.5) {
      const parts = ['poll', 'land', 'sales', 'war', 'tithe'].filter((key) => e[key] >= 0.5).map((key) => TAX_NAME[key]).join('と');
      if (head) sim.remember(head, `${whoC}に${parts || '税'}を${Math.round(paid)}銅貨納めた${e.why ? `（${e.why}）` : ''}`, { emo: -0.15 - Math.min(0.4, paid / Math.max(20, hh.money + paid)), imp: 0.35, k: 'tax', about: collector ? [collector.id] : [] });
      if (collector && R.chance(0.08)) sim.pushLog(`徴税役人の${collector.given}が${head ? sim.fullName(head) : ''}の家から${parts || '税'}${Math.round(paid)}銅貨を受け取った。`, 'event', [collector.id], collector.pos);
    }
  }
  if (collector && head) sim.relMut(head, collector).a -= short > 0.5 || caught ? 3 : 1;
  hh.taxMark = hh.money;
}

function closeRound(sim, r) {
  const S = sim.S, k = S.kingdoms[r.k];
  for (const id of r.order) if (!r.due[id].done) collectFrom(sim, r, id, null);
  const town = S.towns[r.sid];
  // 取り立ての重さで不満が動く（家計に対して何割取られたか）
  const burden = r.moneySum > 0 ? r.got / r.moneySum : 0;
  r.burden = burden;
  town.lastBurden = burden;
  town.unrest = clamp(town.unrest + clamp((burden - 0.07) * 150, -6, 14), 0, 100);
  if (r.got > 0) sim.pushLog(`${sim.town(r.sid).name}の徴税が終わった（${Math.round(r.got)}銅貨・${r.visited}軒）。`, 'event', [], sim.town(r.sid));
  delete S.tax.rounds[r.sid];
  return burden;
}

// ---------- 関税と密輸 ----------
// 商人が他国の町へ荷を運んだときに呼ぶ。行き先の国が value（売値）の一部を取る。払った額を返す。
// sim.doTrade では earn を計算した直後に tariff(this, p, p.s, tr.dest, earn)、
// logistics.js の arriveConvoy では sellGoods の直後に tariffConvoy(sim, c, earn)。
export function tariff(sim, p, fromSid, toSid, value, hhId = null) {
  const S = sim.S, R = sim.rng;
  ensureTaxes(sim);
  const a = sim.town(fromSid), b = sim.town(toSid);
  if (!a || !b || a.kingdom === b.kingdom || !(value > 0)) return 0;
  const k = S.kingdoms[b.kingdom];
  if (!k || S.towns[toSid]?.occupied) return 0;
  const hh = hhId != null ? S.households[hhId] : p && sim.hh(p);
  if (!hh) return 0;
  let rate = k.taxes.toll * Math.sqrt(rateOf(k));
  if ((k.relations[a.kingdom] ?? 0) < -30) rate *= 1.5;
  if (k.war && k.war.with === a.kingdom) rate *= 2;
  const toll = value * rate;
  // 密輸：密輸人や、良心の薄い商人は関所を避ける
  const sly = p && (p.job === 'smuggler' || (p.pers.C < 0.3 && R.chance(0.5)));
  if (sly) {
    S.tax.stats.smuggle++;
    const guards = sim.living().filter((q) => q.s === toSid && LAWFUL.has(q.job) && q.jail == null).length;
    if (R.chance(0.12 + Math.min(0.15, guards * 0.03))) {
      const fine = Math.min(Math.max(0, hh.money), toll * 3 + 10);
      hh.money -= fine; k.treasury += fine; k.fisc.dayIn += fine; k.fisc.cur.fine += fine;
      S.tax.stats.smuggleCaught++;
      if (p) {
        markWanted(sim, p, '密輸', 4);
        sim.remember(p, `${b.name}の関所で荷を調べられ、密輸がばれて${Math.round(fine)}銅貨を取り上げられた`, { emo: -0.8, imp: 0.8, k: 'tax' });
        sim.pushLog(`${b.name}の関所で、${sim.fullName(p)}の密輸が見つかった（没収${Math.round(fine)}銅貨）。`, 'event', [p.id], b);
      }
      return fine;
    }
    if (p) sim.remember(p, `${b.name}へ抜け道を通って荷を運び、関税を払わずに済んだ`, { emo: 0.4, imp: 0.4, k: 'tax' });
    return 0;
  }
  const paid = Math.min(toll, Math.max(0, hh.money));
  hh.money -= paid; k.treasury += paid; k.fisc.dayIn += paid; k.fisc.cur.toll += paid;
  S.tax.stats.tolls++;
  if (p && paid >= 1) sim.remember(p, `${b.name}の関所で${Math.round(paid)}銅貨の関税を払った`, { emo: -0.2, imp: 0.3, k: 'tax' });
  return paid;
}
// 隊商（logistics.js）用：c.goods の値打ちに関税をかける。earn を渡さなければ行き先の相場で見積もる
export function tariffConvoy(sim, c, earn = null) {
  if (!c) return 0;
  const m = sim.market(c.to);
  const value = earn ?? Object.entries(c.goods || {}).reduce((s, [g, n]) => s + n * (m?.price[g] ?? GOODS[g]?.base ?? 1), 0);
  return tariff(sim, sim.S.people[c.owner], c.from, c.to, value, c.hh);
}

// 港の密輸人：ときどき抜け荷で稼ぐ（関税の抜け道）
function smugglersDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const p of sim.living()) {
    if (p.job !== 'smuggler' || !sim.isAdult(p) || p.jail != null || S.wanted[p.id] || !R.chance(0.3)) continue;
    const hh = sim.hh(p); if (!hh) continue;
    const s = sim.townOf(p);
    const profit = R.int(6, 18);
    S.tax.stats.smuggle++;
    const guards = sim.living().filter((q) => q.s === p.s && LAWFUL.has(q.job) && q.jail == null).length;
    if (R.chance(0.08 + Math.min(0.12, guards * 0.03))) {
      S.tax.stats.smuggleCaught++;
      const k = S.kingdoms[s.kingdom];
      const fine = Math.min(Math.max(0, hh.money - 5), profit * 2);
      hh.money -= fine; if (k) { k.treasury += fine; k.fisc.dayIn += fine; k.fisc.cur.fine += fine; }
      markWanted(sim, p, '密輸', 5);
      sim.remember(p, '夜の桟橋で抜け荷を降ろしているところを見つかった', { emo: -0.8, imp: 0.8, k: 'tax' });
      sim.pushLog(`${s.name}の桟橋で、密輸人${sim.fullName(p)}の抜け荷が見つかった。衛兵が行方を追っている。`, 'event', [p.id], p.pos);
    } else {
      hh.money += profit;
      if (R.chance(0.3)) sim.remember(p, `夜の入り江で抜け荷をさばき、関税も払わず${profit}銅貨もうけた`, { emo: 0.4, imp: 0.3, k: 'tax' });
    }
  }
}

// ---------- 王の方針 ----------
function announce(sim, k, txt, imp = 1) { sim.news(txt, imp, sim.town(k.capital)); }
function kingdomAdults(sim, k) { return sim.living().filter((p) => sim.town(p.s).kingdom === k.id && sim.isAdult(p)); }
function changeLevel(sim, k, d, why) {
  const pol = k.taxes, king = sim.S.people[k.kingId];
  const maxLv = 1.5 + pol.greed * 0.8;
  const nv = r1(clamp(pol.lv + d, 0.4, maxLv));
  if (nv === pol.lv) return false;
  pol.lv = nv; pol.lastChange = sim.today; syncLegacy(k);
  const up = d > 0;
  sim.S.tax.stats[up ? 'hikes' : 'cuts']++;
  announce(sim, k, `${k.name}の${title(king)}${king?.given || ''}が${up ? '税を引き上げた' : '減税を発表した'}（${why}・水準×${nv.toFixed(1)}）`, 1);
  const R = sim.rng;
  for (const p of kingdomAdults(sim, k)) {
    if (!R.chance(0.35)) continue;
    sim.remember(p, up ? `${title(king)}さまがまた税を上げた（${why}）` : `${title(king)}さまが税を軽くしてくださった`, { emo: up ? -0.5 : 0.5, imp: 0.5, k: 'tax' });
    if (king) sim.relMut(p, king).a += up ? -3 : 3;
  }
  for (const s of sim.S.world.settlements) if (s.kingdom === k.id) { const t = sim.S.towns[s.id]; t.unrest = clamp(t.unrest + (up ? 4 : -10), 0, 100); }
  return true;
}

function kingPolicy(sim, k) {
  const S = sim.S, pol = k.taxes, R = sim.rng;
  const king = S.people[k.kingId];
  if (!king) return;
  // 王が代わったら方針を見直す
  if (pol.kingId !== k.kingId) {
    k.taxes = policyFor(sim, k, pol);
    k.taxes.kingId = k.kingId;
    const np = k.taxes, want = r1(0.8 + np.greed * 0.6);
    if (!np.lock && Math.abs(want - np.lv) >= 0.2) changeLevel(sim, k, want - np.lv, '新しい王の方針');
  }
  // 戦費税
  if (k.war && !pol.warLevy) { pol.warLevy = true; announce(sim, k, `${k.name}が「${k.war.name}」のため戦費税を課すと布告した`, 2); for (const s of S.world.settlements) if (s.kingdom === k.id) S.towns[s.id].unrest += 3; }
  if (!k.war && pol.warLevy) { pol.warLevy = false; announce(sim, k, `戦が終わり、${k.name}の戦費税が廃止された`, 1); for (const s of S.world.settlements) if (s.kingdom === k.id) S.towns[s.id].unrest = Math.max(0, S.towns[s.id].unrest - 6); }
  if (pol.lock || S.tax.rebellion?.k === k.id) return;
  // 国庫を見て税の重さを決める（徴税日の翌日に判断）
  if ((sim.today + k.id * 2) % PERIOD !== 0 || sim.today - pol.lastChange < PERIOD) return;
  const A = king.pers.A, amb = king.values.ambition;
  const avgUnrest = kingdomUnrest(sim, k);
  const high = 1500 + A * 1000, low = 250 + amb * 200;
  if (k.treasury < low && !(A > 0.55 && avgUnrest > 45)) changeLevel(sim, k, k.war ? 0.2 : 0.1, k.war ? '戦のため' : '国庫が乏しいため');
  else if (k.treasury > high) changeLevel(sim, k, -0.1, '国庫にゆとりがあるため');
  else if (avgUnrest > 50 - A * 20 && R.chance(0.3 + A * 0.6)) changeLevel(sim, k, -0.15, '民の声を聞いて');
}

// 国庫があふれたら施しと町の普請にまわす（国庫が無限に膨らまない）
function royalBounty(sim, k) {
  const S = sim.S, king = S.people[k.kingId];
  if (k.treasury <= 2600) return;
  const spend = (k.treasury - 2200) * 0.5;
  k.treasury -= spend;
  const towns = S.world.settlements.filter((s) => s.kingdom === k.id && !S.towns[s.id].occupied);
  const poor = Object.values(S.households).filter((h) => sim.town(h.s).kingdom === k.id && !h.royal && !h.bandits && h.money < 60);
  const gift = poor.length ? Math.min(25, spend * 0.5 / poor.length) : 0;
  for (const h of poor) {
    h.money += gift;
    const head = headOf(sim, h);
    if (head) sim.remember(head, `${title(king)}さまからの施しで${Math.round(gift)}銅貨をいただいた`, { emo: 0.6, imp: 0.5, k: 'tax' });
    if (head && king) sim.relMut(head, king).a += 4;
  }
  const rest = spend - gift * poor.length;
  for (const s of towns) { S.towns[s.id].fund += rest / towns.length; S.towns[s.id].unrest = Math.max(0, S.towns[s.id].unrest - 6); }
  S.tax.stats.alms++;
  announce(sim, k, `${title(king)}${king?.given || ''}が国庫を開き、貧しい家々に施しを行った`, 1);
}

// ---------- 不満：ぼやき → 陳情 → 暴動 → 反乱 ----------
export function kingdomUnrest(sim, k) {
  const ts = sim.S.world.settlements.filter((s) => s.kingdom === k.id && !sim.S.towns[s.id].occupied);
  return ts.length ? ts.reduce((a, s) => a + sim.S.towns[s.id].unrest, 0) / ts.length : 0;
}

function unrestDaily(sim, k) {
  const S = sim.S, R = sim.rng, king = S.people[k.kingId];
  // 王の祝宴（politics.js が k.lastFeast を今日にした）で不満が和らぐ
  const feastNow = k.lastFeast >= sim.today - 1 && k._feastSeen !== k.lastFeast;
  if (feastNow) k._feastSeen = k.lastFeast;
  for (const s of S.world.settlements) {
    if (s.kingdom !== k.id) continue;
    const t = S.towns[s.id];
    if (t.occupied) continue;
    // ゆっくり静まる。飢え・高いパンで増える。祝宴で和らぐ
    const hhs = Object.values(S.households).filter((h) => h.s === s.id && !h.bandits);
    const poor = hhs.length ? hhs.filter((h) => h.money < 15).length / hhs.length : 0;
    // 重すぎる税（水準1.5超）が続くと、それだけで毎日じわじわ不満がたまる
    let u = t.unrest * 0.975 + poor * 1 + (t.price.bread > 5 ? 0.5 : 0) + Math.max(0, k.taxes.lv - 1.5) * 1.5 * (inRelief(sim, k, s.id) ? 0.5 : 1);
    if (feastNow) u -= s.id === k.capital ? 12 : 6;
    t.unrest = clamp(u, 0, 100);
    t.hot = t.unrest >= 85 ? (t.hot || 0) + 1 : 0;
    const locals = () => sim.living().filter((p) => p.s === s.id && sim.isAdult(p) && p.jail == null && !p.royal);
    // ぼやき
    if (t.unrest >= 20 && R.chance(t.unrest / 100)) {
      const L = locals();
      for (const p of R.shuffle(L).slice(0, 1 + Math.floor(t.unrest / 30))) {
        if (PRIVILEGED.has(p.rank)) continue;
        sim.remember(p, R.pick(['税が重くて、暮らしが苦しい', 'また徴税日が来る。今度は何を売ればいいのか', '王さまは城の外のことを何もご存じない', '税を払ったら、子どもに肉を食べさせてやれなくなった']), { emo: -0.4, imp: 0.4, k: 'tax' });
        if (king) sim.relMut(p, king).a -= 1;
      }
      if (king && t.unrest >= 30 && R.chance(0.3)) sim.gossip(king, '重い税で民を苦しめている', -0.4, R.shuffle(L).slice(0, 5), { silent: true });
    }
    // 陳情：村長（なければ町の顔役）が王都へ
    if (t.unrest >= 40 && !t.petition && sim.today - (t.petDay ?? -99) >= 8 && R.chance(0.5)) startPetition(sim, k, s);
    if (t.petition && !t.petition.done && sim.today - t.petition.day >= 2) resolvePetition(sim, s.id, S.people[t.petition.pid], true);
    // 暴動
    if (t.unrest >= 65 && sim.today - (t.riotDay ?? -99) >= 10 && R.chance((t.unrest - 55) / 60)) startRiot(sim, k, s);
  }
  // 反乱（滅多に起きない）
  if (!S.tax.rebellion && sim.today - S.tax.lastRebellion >= 40) {
    const hot = S.world.settlements.filter((s) => s.kingdom === k.id && (S.towns[s.id].hot || 0) >= 3).sort((a, b) => S.towns[b.id].unrest - S.towns[a.id].unrest)[0];
    if (hot && kingdomUnrest(sim, k) >= 55 && R.chance(0.25)) startRebellion(sim, k, hot);
  }
}

function startPetition(sim, k, s) {
  const S = sim.S, t = S.towns[s.id];
  const L = sim.living().filter((p) => p.s === s.id && sim.isAdult(p) && p.jail == null && !p.mission && !p.fight && !PRIVILEGED.has(p.rank) && !LAWFUL.has(p.job) && !COLLECTORS.includes(p.job) && sim.ageOf(p) >= 30 && sim.ageOf(p) < 75);
  const pet = L.find((p) => p.job === 'elder') || L.sort((a, b) => (b.fame || 0) + sim.ageOf(b) / 3 + b.pers.E * 10 - ((a.fame || 0) + sim.ageOf(a) / 3 + a.pers.E * 10))[0];
  if (!pet) return;
  const cap = sim.town(k.capital), castle = sim.townBuilding(cap, 'castle');
  if (!castle) return;
  t.petition = { pid: pet.id, day: sim.today, done: false }; t.petDay = sim.today;
  pet.petitionFor = s.id;
  pet.mission = { type: 'petition', x: castle.door.x, z: castle.door.z, bld: castle.id, until: S.t + 1440 * 2, dur: 60 };
  if (pet.action) pet.action = null;
  S.tax.stats.petitions++;
  sim.remember(pet, `${s.name}のみんなの頼みで、税を軽くしてもらうよう${cap.name}の${title(S.people[k.kingId])}さまに陳情に行くことになった`, { emo: -0.1, imp: 0.8, k: 'tax' });
  sim.news(`${s.name}の${JOBS[pet.job]?.name || '住人'}${pet.given}が、重い税の陳情のため${cap.name}へ向かった`, 1, pet.pos);
}

function resolvePetition(sim, sid, pet, byLetter = false) {
  const S = sim.S, R = sim.rng, t = S.towns[sid], s = sim.town(sid), k = S.kingdoms[s.kingdom];
  if (!t.petition || t.petition.done) return;
  t.petition.done = true;
  const king = S.people[k.kingId];
  if (pet) { if (pet.mission?.type === 'petition') pet.mission = null; delete pet.petitionFor; }
  const how = byLetter ? '書状で' : '';
  const A = king?.pers.A ?? 0.5;
  const yes = R.chance(clamp(0.15 + A * 0.7 + (k.treasury > 900 ? 0.15 : 0) - (k.taxes.greed - 0.5) * 0.3, 0.05, 0.95));
  const L = sim.living().filter((p) => p.s === sid && sim.isAdult(p));
  if (yes) {
    S.tax.stats.granted++;
    k.taxes.relief[sid] = sim.today + 10;
    t.unrest = clamp(t.unrest - 20, 0, 100);
    sim.news(`${title(king)}${king?.given || ''}が${s.name}の陳情を${how}聞き入れ、しばらく税を半分にすると約束した`, 2, s);
    sim.chron(`${s.name}の陳情を受け、${title(king)}${king ? sim.fullName(king) : ''}が税を減じた`, k.id);
    for (const p of L) if (R.chance(0.5)) { sim.remember(p, `陳情が通って、しばらく税が半分になった`, { emo: 0.6, imp: 0.6, k: 'tax' }); if (king) sim.relMut(p, king).a += 5; }
    if (pet) { sim.remember(pet, `${title(king)}さまが陳情を聞き入れてくださった`, { emo: 0.8, imp: 0.9, k: 'tax', about: king ? [king.id] : [] }); pet.fame = (pet.fame || 0) + 5; }
  } else {
    t.unrest = clamp(t.unrest + 8, 0, 100);
    const harsh = king && A < 0.2 && pet && !byLetter && pet.jail == null && R.chance(0.3);
    sim.news(`${title(king)}${king?.given || ''}は${s.name}の陳情を${how}退けた${harsh ? '。陳情に来た者は不敬として捕らえられた' : ''}`, harsh ? 2 : 1, s);
    for (const p of L) if (R.chance(0.4)) { sim.remember(p, harsh ? `陳情に行った${pet.given}が牢に入れられた` : '陳情は聞き入れられなかった', { emo: -0.6, imp: 0.6, k: 'tax' }); if (king) sim.relMut(p, king).a -= 4; }
    if (harsh) {
      const cap = sim.town(k.capital);
      const g = sim.living().find((q) => q.s === cap.id && LAWFUL.has(q.job) && q.jail == null && !q.fight);
      if (g) { markWanted(sim, pet, '不敬', 4); arrest(sim, g, pet); t.unrest = clamp(t.unrest + 10, 0, 100); }
    } else if (pet) sim.remember(pet, '陳情は門前払いだった', { emo: -0.7, imp: 0.8, k: 'tax' });
  }
}

function startRiot(sim, k, s) {
  const S = sim.S, R = sim.rng, t = S.towns[s.id];
  const L = sim.living().filter((p) => p.s === s.id && sim.isAdult(p) && p.jail == null && !PRIVILEGED.has(p.rank) && !LAWFUL.has(p.job) && !p.mission && sim.ageOf(p) < 65);
  const angry = L.filter((p) => p.values.courage + (1 - p.pers.A) * 0.6 + (S.people[k.kingId] ? -sim.rel(p, S.people[k.kingId]).a / 100 : 0) > 0.9);
  if (angry.length < 3) return;
  const mob = R.shuffle(angry).slice(0, Math.min(14, 3 + Math.floor(angry.length * 0.5)));
  const leader = mob.slice().sort((a, b) => b.values.courage + b.values.ambition - a.values.courage - a.values.ambition)[0];
  t.riotDay = sim.today; t.riotLeader = leader.id;
  const from = sim.dayIndex * 1440 + 13 * 60;
  S.gatherings.push({ type: 'riot', place: 'plaza', from, to: from + 4 * 60, s: s.id, ids: mob.map((p) => p.id), label: '暴動' });
  S.tax.stats.riots++;
  // 市場が荒らされる
  const m = S.towns[s.id];
  for (const g of ['bread', 'ale', 'meat']) if (m.stock[g] != null) m.stock[g] *= 0.8;
  sim.news(`${s.name}で重税に怒った民が暴動を起こした！${sim.fullName(leader)}らが広場に押し寄せている`, 3, s);
  sim.chron(`${s.name}で重税に抗う暴動が起き、${sim.fullName(leader)}が先頭に立った`, k.id);
  for (const p of mob) sim.remember(p, `税に怒ったみんなと広場へ押しかけた`, { emo: 0.1, imp: 0.8, k: 'tax' });
  for (const p of L) if (!mob.includes(p) && R.chance(0.4)) sim.remember(p, `${s.name}で暴動が起きた`, { emo: -0.5, imp: 0.7, k: 'tax' });
  t.unrest = clamp(t.unrest - 12, 0, 100);   // 怒りを吐き出して少し静まる
  // 王の対応：情け深い王は減税、厳しい王は兵を出す
  const king = S.people[k.kingId];
  if (king && king.pers.A > 0.5 && !k.taxes.lock) { k.taxes.relief[s.id] = sim.today + 10; changeLevel(sim, k, -0.2, `${s.name}の暴動を受けて`); }
}

// 暴動の日の衛兵と民の衝突（毎時）
export function taxesHourly(sim) {
  const S = sim.S;
  if (!S.tax) return;
  const h = Math.floor(sim.hour());
  if (h !== 15 && h !== 17) return;
  for (const s of S.world.settlements) {
    const t = S.towns[s.id];
    if (t.riotDay !== sim.today) continue;
    const lawful = sim.living().filter((q) => q.s === s.id && LAWFUL.has(q.job) && q.jail == null && !q.fight && q.action?.type !== 'sleep');
    if (h === 15) {
      const mob = sim.living().filter((p) => p.s === s.id && p.action?.type === 'riot' && !p.fight);
      let n = 0;
      for (const g of lawful) {
        const gp = g.inside != null ? sim.building(g.inside).door : g.pos;
        const r = mob.find((p) => !p.fight && Math.hypot(p.pos.x - gp.x, p.pos.z - gp.z) < 14);
        if (!r) continue;
        if (g.inside != null) { g.pos = { ...gp }; g.inside = null; }
        startFight(sim, r, g, false);
        sim.remember(g, `暴動を鎮めに出て、${r.given}ともみ合った`, { emo: -0.5, imp: 0.7, about: [r.id], k: 'tax' });
        if (++n >= 3) break;
      }
      if (n) sim.pushLog(`${s.name}の広場で、暴徒と衛兵がもみ合いになった。`, 'event', [], s);
    } else {
      const leader = S.people[t.riotLeader];
      const g = lawful[0];
      if (leader && alive(leader) && leader.jail == null && g) {
        markWanted(sim, leader, '暴動', 6);
        arrest(sim, g, leader);
        t.unrest = clamp(t.unrest + 3, 0, 100);
      }
      t.riotLeader = null;
    }
  }
}

function armyOf(sim, k) {
  let n = 0;
  for (const p of sim.living()) if (['knight', 'soldier', 'general', 'royalguard', 'guard'].includes(p.job) && sim.town(p.s).kingdom === k.id && p.jail == null) n += p.lv || 1;
  return n;
}

function startRebellion(sim, k, s) {
  const S = sim.S, R = sim.rng;
  const L = sim.living().filter((p) => sim.town(p.s).kingdom === k.id && sim.ageOf(p) >= 22 && sim.ageOf(p) <= 60 && p.jail == null && !['king', 'royal'].includes(p.rank) && !LAWFUL.has(p.job));
  const local = L.filter((p) => p.s === s.id);
  const pool = local.length ? local : L;
  const leader = pool.sort((a, b) => (b.values.ambition + b.values.courage + (1 - b.pers.A) * 0.5 + (b.rank === 'noble' ? 0.4 : 0)) - (a.values.ambition + a.values.courage + (1 - a.pers.A) * 0.5 + (a.rank === 'noble' ? 0.4 : 0)))[0];
  if (!leader) return;
  const king = S.people[k.kingId];
  S.tax.rebellion = { k: k.id, sid: s.id, leader: leader.id, day: sim.today, days: R.int(3, 5), kingId: k.kingId };
  S.tax.lastRebellion = sim.today;
  S.tax.stats.rebellions++;
  leader.deeds = leader.deeds || [];
  leader.deeds.push(`${s.name}で重税に抗う反乱を率いた`);
  sim.remember(leader, `もう我慢ならない。${s.name}の民を率いて、${title(king)}に反旗をひるがえした`, { emo: 0.2, imp: 1, k: 'tax' });
  sim.news(`${s.name}で${sim.fullName(leader)}が重税に抗う反乱を起こした！${k.name}は揺れている`, 4, s);
  sim.chron(`重税に耐えかねた${s.name}の民が${sim.fullName(leader)}を担いで反乱を起こした`, k.id);
  for (const p of kingdomAdults(sim, k)) if (R.chance(0.5)) sim.remember(p, `${s.name}で反乱が起きた`, { emo: -0.6, imp: 0.8, k: 'tax' });
}

function rebellionDaily(sim) {
  const S = sim.S, R = sim.rng, rb = S.tax.rebellion;
  if (!rb) return;
  const k = S.kingdoms[rb.k], s = sim.town(rb.sid), t = S.towns[rb.sid];
  const leader = S.people[rb.leader];
  const king = S.people[k.kingId];
  if (!leader || !alive(leader) || leader.jail != null || !king || k.kingId !== rb.kingId) {
    S.tax.rebellion = null;
    sim.news(`${s.name}の反乱は、旗頭を失って散り散りになった`, 2, s);
    for (const x of S.world.settlements) if (x.kingdom === k.id) S.towns[x.id].unrest *= 0.7;
    return;
  }
  if (sim.today - rb.day < rb.days) return;
  // 決着：王の人柄・兵の数・民の怒りで決まる（誰も死なない）
  const rebels = kingdomUnrest(sim, k) / 10 + t.unrest / 10 + (leader.lv || 1) * 2 + (leader.rank === 'noble' ? 6 : 0);
  const loyal = armyOf(sim, k) * (0.6 + king.values.courage * 0.4);
  const A = king.pers.A;
  const L = kingdomAdults(sim, k);
  const towns = S.world.settlements.filter((x) => x.kingdom === k.id);
  S.tax.rebellion = null;
  if (A > 0.5 || (loyal < rebels && A > 0.3)) {
    // 減税で収める
    k.taxes.lv = r1(Math.max(0.5, k.taxes.lv - 0.6)); k.taxes.lock = false; syncLegacy(k);
    for (const x of towns) { k.taxes.relief[x.id] = sim.today + 15; S.towns[x.id].unrest *= 0.4; }
    sim.news(`${title(king)}${king.given}が${sim.fullName(leader)}らの訴えを聞き入れ、大幅な減税を約束した。反乱は収まった`, 4, s);
    sim.chron(`${title(king)}${sim.fullName(king)}は反乱に応えて減税を約束し、国は落ち着きを取り戻した`, k.id);
    sim.remember(leader, `${title(king)}さまが減税を約束し、みんなで武器を置いた`, { emo: 0.8, imp: 1, k: 'tax' });
    leader.fame = (leader.fame || 0) + 20;
    for (const p of L) if (R.chance(0.5)) { sim.remember(p, '反乱が収まり、税が軽くなった', { emo: 0.6, imp: 0.7, k: 'tax' }); sim.relMut(p, king).a += 4; }
  } else if (loyal >= rebels) {
    // 鎮圧
    const g = sim.living().find((q) => sim.town(q.s).kingdom === k.id && LAWFUL.has(q.job) && q.jail == null && !q.fight);
    if (g) { markWanted(sim, leader, '反乱', 25); arrest(sim, g, leader); }
    for (const x of towns) S.towns[x.id].unrest *= 0.6;
    if (!k.taxes.lock) changeLevel(sim, k, -0.2, '反乱の後始末に');
    sim.news(`${k.name}の兵が${s.name}の反乱を鎮めた。${sim.fullName(leader)}は捕らえられた`, 4, s);
    sim.chron(`${s.name}の反乱は鎮圧され、${sim.fullName(leader)}は牢に入れられた`, k.id);
    for (const p of L) if (p.s === rb.sid && R.chance(0.6)) { sim.remember(p, `反乱は鎮められ、${leader.given}が捕まった`, { emo: -0.6, imp: 0.8, k: 'tax', about: [leader.id] }); sim.relMut(p, king).a -= 5; }
  } else {
    // 王の退位
    abdicate(sim, k, leader);
    for (const x of towns) S.towns[x.id].unrest *= 0.3;
  }
}

function abdicate(sim, k, leader) {
  const S = sim.S, old = S.people[k.kingId];
  const royals = sim.living().filter((p) => ['royal', 'king'].includes(p.rank) && sim.town(p.s).kingdom === k.id && p !== old);
  let heir = old.children.map((id) => S.people[id]).filter((c) => alive(c) && sim.ageOf(c) >= 14).sort((a, b) => a.birthYear - b.birthYear)[0];
  if (!heir) { const sp = S.people[old.spouseId]; if (alive(sp)) heir = sp; }
  if (!heir) heir = royals.filter((p) => sim.ageOf(p) >= 14).sort((a, b) => a.birthYear - b.birthYear)[0];
  if (!heir) heir = sim.living().filter((p) => p.rank === 'noble' && sim.town(p.s).kingdom === k.id && sim.ageOf(p) >= 20).sort((a, b) => b.pers.A - a.pers.A)[0];
  if (!heir) { k.taxes.lv = 0.6; syncLegacy(k); return; }
  old.job = 'royal'; old.rank = 'royal';
  old.deeds = old.deeds || []; old.deeds.push('重税への反乱を受けて王位を退いた');
  sim.remember(old, '民の怒りに押され、王位を退いた', { emo: -0.9, imp: 1, k: 'crown' });
  k.kingId = heir.id; heir.rank = 'king'; heir.job = 'king'; k.monarchs.push(heir.id);
  Object.assign(heir, humanStats(sim, heir));
  const n = k.monarchs.length;
  heir.deeds = heir.deeds || []; heir.deeds.unshift(`${k.name}の第${n}代${title(heir)}だった`);
  const cap = sim.town(k.capital);
  const royalHh = Object.values(S.households).find((h) => h.royal && h.s === cap.id);
  if (royalHh && heir.hh !== royalHh.id) sim.moveTo(heir, royalHh);
  heir.s = cap.id;
  k.taxes = policyFor(sim, k, k.taxes); k.taxes.kingId = heir.id; k.taxes.lock = false;
  k.taxes.lv = r1(Math.min(k.taxes.lv, 0.7)); syncLegacy(k);
  sim.remember(heir, `${k.name}の第${n}代${title(heir)}に即位した。まずは税を軽くすると民に誓った`, { emo: 0.5, imp: 1, k: 'crown' });
  sim.news(`反乱に押され${title(old)}${old.given}が退位。${sim.fullName(heir)}が第${n}代${title(heir)}となり、減税を誓った`, 4, cap);
  sim.chron(`${sim.fullName(leader)}の反乱により${title(old)}${sim.fullName(old)}が退位し、${sim.fullName(heir)}が即位した`, k.id);
  for (const p of kingdomAdults(sim, k)) if (sim.rng.chance(0.4)) sim.remember(p, `${title(old)}さまが退位し、新しい${title(heir)}${heir.given}さまが立った`, { emo: 0.3, imp: 0.7, k: 'crown' });
}

// ---------- 教会の施し ----------
function churchAlms(sim) {
  const S = sim.S, R = sim.rng;
  for (const s of S.world.settlements) {
    const t = S.towns[s.id];
    if (t.occupied || t.alms < 6) continue;
    const poor = Object.values(S.households).filter((h) => h.s === s.id && !h.bandits && !h.royal && h.money < 25).sort((a, b) => a.money - b.money).slice(0, 3);
    if (!poor.length) { if (t.alms > 400) { const x = t.alms - 400; t.alms = 400; t.fund += x; } continue; }
    const priest = sim.living().find((q) => q.job === 'priest' && q.s === s.id);
    for (const h of poor) {
      const gift = Math.min(12, t.alms * 0.25);
      if (gift < 2) break;
      h.money += gift; t.alms -= gift;
      const head = headOf(sim, h);
      if (head && R.chance(0.6)) sim.remember(head, `教会${priest ? `の${priest.given}さま` : ''}から${Math.round(gift)}銅貨の施しを受けた`, { emo: 0.4, imp: 0.4, k: 'relief', about: priest ? [priest.id] : [] });
      if (head && priest) sim.relMut(head, priest).a += 3;
    }
    if (priest) priest.needs.esteem = Math.min(100, priest.needs.esteem + 5);
    t.unrest = Math.max(0, t.unrest - 0.5);
  }
}

// ---------- 毎日（sim.newDay で politicsDaily の直後に呼ぶ） ----------
export function taxesDaily(sim) {
  const S = sim.S;
  ensureTaxes(sim);
  // 前の日の巡回を締める（回りきれなかった家は役場に持参したことにする）
  for (const r of Object.values(S.tax.rounds)) if (r.day < sim.today) closeRound(sim, r);
  for (const k of S.kingdoms) {
    const king = S.people[k.kingId];
    // 王領（直轄地）からの上がり：旧 politics の基本収入 30＋町×10 をここに移した
    const towns = S.world.settlements.filter((s) => s.kingdom === k.id);
    // 王の直轄の畑・森・牧場の産物を町の市場に卸し、その代金を市場の金庫から受け取る（お金は湧かない）
    let crown = 0;
    for (const s of towns) {
      if (S.towns[s.id].occupied || (s.tribal && s.annexed == null)) continue;
      const want = s.id === k.capital ? 30 : 10, mc = sim.mcash(s.id), m = sim.market(s.id);
      const g = s.type === 'port' ? 'fish' : s.type === 'village' ? 'wheat' : 'wood';
      const price = Math.max(0.5, m.price[g] || 2);
      const amt = Math.max(0, Math.min(want, mc.cash * 0.05));
      if (amt < 0.5) continue;
      mc.cash -= amt; m.stock[g] = (m.stock[g] || 0) + amt / price; crown += amt;
    }
    k.treasury += crown; k.fisc.dayIn += crown; k.fisc.cur.crown += crown;
    kingPolicy(sim, k);
    royalBounty(sim, k);
    unrestDaily(sim, k);
    // 徴税日：町ごとに巡回を始める
    if (isTaxDay(sim, k) && king && S.tax.rebellion?.k !== k.id) {
      k.fisc.last = { ...k.fisc.cur, day: sim.today };
      k.fisc.cur = blank();
      for (const s of towns) if (!S.towns[s.id].occupied && !(s.tribal && s.annexed == null)) openRound(sim, k, s);
      for (const p of sim.living()) if (sim.town(p.s).kingdom === k.id && p.job === 'treasurer') sim.remember(p, '今日は徴税日。役人たちに帳簿を持たせて町へ送り出した', { emo: 0.1, imp: 0.2, k: 'tax' });
    } else if (isTaxDay(sim, k) && S.tax.rebellion?.k === k.id) {
      k.fisc.last = { ...k.fisc.cur, day: sim.today }; k.fisc.cur = blank();
    }
    // 収支の記録
    const out = k.fisc.prevT + k.fisc.dayIn - k.treasury;
    k.fisc.hist.push({ d: sim.today, t: Math.round(k.treasury), in: Math.round(k.fisc.dayIn), out: Math.round(out) });
    if (k.fisc.hist.length > 30) k.fisc.hist.shift();
    k.fisc.prevT = k.treasury; k.fisc.dayIn = 0;
    syncLegacy(k);
  }
  rebellionDaily(sim);
  if (!S.uw) smugglersDaily(sim);   // underworld.js（闇の稼業）が動いていれば、密輸人の抜け荷はそちらに任せる
  churchAlms(sim);
  // 古い減免の掃除
  for (const k of S.kingdoms) for (const [sid, d] of Object.entries(k.taxes.relief)) if (d < sim.today) delete k.taxes.relief[sid];
}

// ---------- 画面用 ----------
export function taxSummary(sim, k) {
  ensureTaxes(sim);
  const pol = k.taxes, lv = pol.lv;
  const hist = k.fisc.hist.slice(-PERIOD);
  const inc = hist.reduce((a, h) => a + h.in, 0) / Math.max(1, hist.length);
  const out = hist.reduce((a, h) => a + h.out, 0) / Math.max(1, hist.length);
  const towns = sim.S.world.settlements.filter((s) => s.kingdom === k.id).map((s) => ({ id: s.id, name: s.name, unrest: Math.round(sim.S.towns[s.id].unrest), relief: (pol.relief[s.id] ?? -1) >= sim.today, alms: Math.round(sim.S.towns[s.id].alms || 0) }));
  return {
    lv, warLevy: pol.warLevy,
    rates: { poll: r1(pol.poll * lv), land: r1(pol.land * lv), sales: Math.round(pol.sales * lv * 100), toll: Math.round(pol.toll * Math.sqrt(lv) * 100), tithe: Math.round(pol.tithe * 100) },
    last: k.fisc.last, inPerDay: Math.round(inc), outPerDay: Math.round(out), nextDay: nextTaxDay(sim, k), towns, unrest: Math.round(kingdomUnrest(sim, k)),
    rebellion: sim.S.tax.rebellion?.k === k.id ? sim.S.tax.rebellion : null,
  };
}
// ui.js の renderNations の <dl> の中に差し込む HTML（esc は ui.js の esc を渡す）
export function taxNationHTML(sim, k, esc) {
  const t = taxSummary(sim, k);
  const col = (u) => (u >= 65 ? 'up' : u >= 40 ? '' : 'down');
  const last = t.last ? ['poll', 'land', 'sales', 'toll', 'war', 'fine', 'crown'].filter((x) => t.last[x] >= 1).map((x) => `${TAX_NAME[x]}${Math.round(t.last[x])}`).join('・') : 'まだ集計なし';
  const d = t.nextDay - sim.today;
  return `<dt>税</dt><dd>水準×${t.lv.toFixed(1)}${t.warLevy ? '・<b class="up">戦費税</b>' : ''}<br><span class="sub">人頭${t.rates.poll}・地代${t.rates.land}%・売上${t.rates.sales}%・関税${t.rates.toll}%・十分の一${t.rates.tithe}%</span></dd>
    <dt>前回の税収</dt><dd>${esc(last)}<br><span class="sub">次の徴税日：${d === 0 ? '今日' : d + '日後'}${t.last?.tithe >= 1 ? `・教会へ${Math.round(t.last.tithe)}` : ''}</span></dd>
    <dt>収支</dt><dd>1日あたり 入${t.inPerDay}・出${t.outPerDay}（${t.inPerDay - t.outPerDay >= 0 ? '+' : ''}${t.inPerDay - t.outPerDay}）</dd>
    <dt>民の不満</dt><dd>${t.towns.map((x) => `${esc(x.name.replace(/^(王都|港町|オアシスの村)/, ''))}<b class="${col(x.unrest)}">${x.unrest}</b>${x.relief ? '（減免）' : ''}`).join('　')}${t.rebellion ? '<br><b class="up">反乱のさなか</b>' : ''}</dd>`;
}

// 住人のつぶやき（innerThought などから任意で使う）
export function taxThought(sim, p) {
  const S = sim.S;
  if (!S.tax || !sim.isAdult(p)) return null;
  const k = sim.kingdomOf(p), t = S.towns[p.s];
  if (!k?.taxes) return null;
  if (S.tax.rounds[p.s]?.col[p.id]) return '今日は徴税日。嫌われ役だが、これも務めだ';
  const d = nextTaxDay(sim, k) - sim.today;
  const hh = sim.hh(p);
  if (d === 0 && hh && hh.money < 60 && !hh.royal) return '今日は徴税日……払えるだろうか';
  if (d === 1 && hh && !hh.royal) return '明日は徴税日だ。銅貨を数えておかないと';
  if (t.unrest >= 65) return 'このままじゃ、みんな黙っていないぞ';
  if (t.unrest >= 35) return '税がまた重くなった気がする';
  return null;
}
