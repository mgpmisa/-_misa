// 病気・怪我・喪：寝込む／看病される／往診と薬／流行り病／戦いの後遺症／悲嘆と命日
// 状態：p.ail = { kind, sev(0〜100), day, contagious, carer, care, rest, work, visited, treated }
//       p.scars = [{ k, day, by }]、p.grief = { who, lv, day, anniv }、p.lost = [{ id, d }]、p.imm = { kind: 免疫の切れる日 }
//       S.health = { epi: [...], stats, graveIdx, mourned, lastEpi, sick: [id...] }
import { DEATH_CAUSES, DAYS_PER_YEAR } from './data.js';
import { countItem, takeItem } from './items.js';
import { pay, earn, spendable } from './property.js';

// 死因の追加（data.js を書き換えずに、表示名だけ足す）
for (const [k, v] of Object.entries({ illness: '病', fever: '熱病', wound: '傷の悪化' })) if (!DEATH_CAUSES[k]) DEATH_CAUSES[k] = v;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 病の種類
// s0:かかった時の重さ rise:悪くなる日数 up/down:一日の増減 spread:同じ家の人にうつる確率/日 lethal:0なら死なない
export const AILS = {
  cold:  { name: '風邪',       s0: [8, 20],  rise: [1, 2], up: [3, 8],  down: [6, 11], spread: 0.04, lethal: 1, cause: 'illness', imm: 12 },
  flu:   { name: '流行り病',   s0: [20, 34], rise: [3, 5], up: [8, 14], down: [5, 10], spread: 0.1, lethal: 1, cause: 'sick', imm: 200 },
  fever: { name: '熱病',       s0: [20, 34], rise: [2, 4], up: [6, 12], down: [5, 9],  spread: 0,    lethal: 1, cause: 'fever', imm: 30 },
  belly: { name: '腹下し',     s0: [12, 24], rise: [1, 2], up: [4, 9],  down: [8, 14], spread: 0.03, lethal: 1, cause: 'illness', imm: 6 },
  ache:  { name: '古傷の痛み', s0: [10, 22], rise: [1, 2], up: [2, 6],  down: [4, 8],  spread: 0,    lethal: 0, cause: null, imm: 3 },
  wound: { name: '傷の膿み',   s0: [24, 38], rise: [1, 3], up: [6, 12], down: [5, 10], spread: 0,    lethal: 1, cause: 'wound', imm: 0 },
};

// 戦いの後遺症
export const SCARS = {
  limp: { name: '足の古傷', desc: '足を引きずっている', mem: '足に深手を負い、それからずっと足を引きずっている' },
  eye:  { name: '片目',     desc: '片目を失っている',   mem: '片目を失った' },
  arm:  { name: '腕の古傷', desc: '腕に古傷がある',     mem: '腕に深い傷を負い、力仕事がつらくなった' },
  face: { name: '顔の傷跡', desc: '顔に大きな傷跡がある', mem: '顔に消えない傷跡が残った' },
};

const HEALERS = { doctor: 12, herbalist: 9, nun: 7, cleric: 7, priest: 4 };
// 悲嘆の深さ（続柄ごと）
const GRIEF_LV = { 夫: 90, 妻: 90, 息子: 95, 娘: 95, 父: 72, 母: 76, 兄: 55, 弟: 55, 姉: 55, 妹: 55, 祖父: 35, 祖母: 38, 孫: 45 };

function H(sim) {
  const S = sim.S;
  if (!S.health) S.health = {};
  const h = S.health;
  h.epi = h.epi || [];
  h.stats = h.stats || { sick: 0, cured: 0, died: 0, epi: 0, scars: 0, treat: 0 };
  h.mourned = h.mourned || {};
  if (h.graveIdx == null) h.graveIdx = S.graves.length; // 導入前の墓は数えない
  if (h.lastEpi == null) h.lastEpi = sim.today - 10; // 始まってすぐには流行らない
  h.sick = h.sick || [];
  return h;
}

const rr = (R, [a, b]) => a + R.next() * (b - a);
export const isBedridden = (p) => !!p.ail && p.ail.sev >= (p.ail.kind === 'ache' ? 55 : 35);
export const ailName = (p) => (p.ail ? AILS[p.ail.kind]?.name || '病' : null);

// ---------- 病にかかる ----------
export function fallIll(sim, p, kind, opt = {}) {
  if (p.deathYear != null || p.ail || !p.needs) return false;
  const d = AILS[kind], R = sim.rng;
  if (!d) return false;
  if ((p.imm?.[kind] || 0) > sim.today) return false;
  const h = H(sim);
  p.ail = { kind, sev: Math.round(rr(R, d.s0)), day: sim.today, contagious: d.spread > 0, rise: Math.round(rr(R, d.rise)), care: 0, rest: 0, work: 0, treated: 0 };
  h.stats.sick++;
  h.sick.push(p.id);
  const txt = { cold: '風邪をひいて寝込みそうだ', flu: '流行り病にかかってしまった', fever: '高い熱が出た', belly: 'お腹をこわした', ache: '古傷がうずきだした', wound: '傷口が膿んで熱を持ちはじめた' }[kind];
  sim.remember(p, opt.txt || txt, { emo: -0.5, imp: kind === 'flu' || kind === 'wound' ? 0.7 : 0.4, k: 'ill' });
  return true;
}

function onsetDaily(sim, p, age, si, crowd, epiTown) {
  const R = sim.rng;
  if (p.ail || p.jail != null) return;
  let base = 0.0028;
  if (age < 5 || age >= 65) base *= 1.8;
  if (p.needs.hunger < 30) base *= 2;
  if (sim.hh(p)?.house == null) base *= 1.5;
  if (sim.hasTech(p, 'medicine')) base *= 0.75;
  // 流行り病の町
  if (epiTown && R.chance(epiTown.rate * (age < 5 || age >= 60 ? 1.4 : 1))) { fallIll(sim, p, 'flu', { txt: '町に広がる流行り病にかかってしまった' }); return; }
  // 同じ家に病人がいる（密集）
  for (const [kind, n] of crowd) {
    if (R.chance(1 - Math.pow(1 - AILS[kind].spread, n))) { fallIll(sim, p, kind, { txt: `家族から${AILS[kind].name}をうつされた` }); return; }
  }
  // 古傷は雨や雪の日にうずく
  if (p.scars?.length && (sim.S.weather === 'rain' || sim.S.weather === 'snow') && R.chance(0.06)) { fallIll(sim, p, 'ache'); return; }
  if (!R.chance(base * (si === 3 ? 1.8 : 1))) return;
  const w = si === 3 ? { cold: 6, belly: 1, fever: 0.4 } : si === 1 ? { cold: 1, belly: 3, fever: 2.5 } : { cold: 3, belly: 2, fever: 1 };
  fallIll(sim, p, R.weighted(Object.keys(w), (k) => w[k]));
}

// ---------- 一日の経過 ----------
function progressDaily(sim, p, age, si) {
  const a = p.ail, d = AILS[a.kind], R = sim.rng, h = H(sim);
  const days = sim.today - a.day;
  let risk = 0;
  if (age < 5) risk += 3; else if (age >= 80) risk += 6; else if (age >= 70) risk += 4; else if (age >= 60) risk += 2;
  if (p.needs.hunger < 30) risk += 3;
  if (si === 3) risk += 1.5;
  const hh = sim.hh(p);
  if (!hh || hh.house == null) risk += 2;
  if (isBedridden(p) && !a.carer && a.care < 1) risk += 2;
  if (a.work >= 2) risk += 2;
  risk -= Math.min(4, a.care * 0.8) + Math.min(2, a.rest * 0.15);
  if (sim.hasTech(p, 'medicine')) risk -= 2;
  if (a.kind === 'wound' && sim.hasTech(p, 'healing')) risk -= 2;
  // 自分の回復薬を飲む
  if (a.sev >= 45 && countItem(p, 'potion') > 0 && R.chance(0.6)) { takeItem(p, 'potion', 1); a.sev -= 8; }
  if (days < a.rise) a.sev += rr(R, d.up) + risk;
  else a.sev -= rr(R, d.down) - risk * 0.8;
  a.sev = clamp(a.sev + R.gauss(0, 3), 0, d.lethal ? 100 : 70);
  a.care = 0; a.rest = 0; a.work = 0;
  // 峠：重いまま持ちこたえられるかどうか（年寄りと幼子は弱い）
  const frail = age >= 70 || age < 3 ? 1.6 : age >= 60 || age < 6 ? 1.2 : 0.7;
  const crisis = d.lethal && a.sev >= 65 && R.chance(Math.pow((a.sev - 60) / 40, 2) * 0.5 * frail);
  if (a.sev >= 100 || crisis) {
    h.stats.died++;
    const cause = d.cause || 'illness';
    const town = sim.townOf(p);
    for (const e of h.epi) if (e.sid === p.s && a.kind === 'flu') e.dead++;
    p.ail = null;
    sim.die(p, cause);
    if (cause === 'sick' && town) sim.pushLog(`${town.name}で、流行り病に倒れた${p.given}が息を引き取った。`, 'death', [p.id], p.pos);
    return;
  }
  if (a.sev <= 0 || (days > 25 && a.sev < 15)) {
    h.stats.cured++;
    if (d.imm) p.imm = Object.assign(p.imm || {}, { [a.kind]: sim.today + d.imm });
    const carer = a.carer != null && sim.person(a.carer);
    if (days >= 3 || a.kind === 'flu' || a.kind === 'wound') {
      sim.remember(p, `${d.name}が治って、また起き上がれるようになった`, { emo: 0.6, imp: 0.5, k: 'ill' });
      if (carer && carer.deathYear == null) {
        sim.remember(p, `寝込んでいる間、${carer.given}がずっと看病してくれた`, { emo: 0.8, imp: 0.65, about: [carer.id], k: 'help' });
        sim.relMut(p, carer).a = Math.min(100, sim.rel(p, carer).a + 8);
      }
    }
    p.ail = null;
  }
}

// 看病役を決める（同じ家の、元気な年長者）
function pickCarer(sim, p) {
  const hh = sim.hh(p);
  if (!hh) return null;
  let best = null, bs = -1e9;
  for (const id of hh.members) {
    if (id === p.id) continue;
    const q = sim.person(id);
    if (!q || (q.ail && isBedridden(q))) continue;
    if (q.deathYear != null || q.jail != null || q.mission || sim.ageOf(q) < 10) continue;
    const term = sim.kinTerm(q, p);
    const sc = (term === '夫' || term === '妻' ? 30 : term === '母' ? 26 : term === '父' ? 18 : term === '娘' ? 20 : term ? 12 : 0) + q.pers.A * 15 + (q.job ? 0 : 6);
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}

// ---------- 流行り病 ----------
export function startEpidemic(sim, s, quiet) {
  const h = H(sim), R = sim.rng;
  if (!s || h.epi.some((e) => e.sid === s.id)) return null;
  const e = { sid: s.id, from: sim.today, until: sim.today + R.int(10, 16), rate: R.range(0.02, 0.032), dead: 0, sick0: h.stats.sick };
  h.epi.push(e);
  h.lastEpi = sim.today;
  h.stats.epi++;
  const pop = sim.living().filter((p) => p.s === s.id);
  for (const p of R.shuffle(pop.slice()).slice(0, Math.max(1, Math.round(pop.length * 0.04)))) fallIll(sim, p, 'flu', { txt: '咳が止まらず、ひどい熱が出た。流行り病らしい' });
  if (!quiet) {
    sim.news(`${s.name}で流行り病が広がりはじめた。咳と高い熱に、人々は戸を閉ざしている`, 2, { x: s.x, z: s.z });
    sim.chron(`${s.name}で流行り病が起こった`, s.kingdom);
    for (const q of pop) if (q.memories && R.chance(0.5)) sim.remember(q, `${s.name}で流行り病が広がりはじめた`, { emo: -0.5, imp: 0.6, k: 'epidemic' });
  }
  return e;
}

function epidemicDaily(sim) {
  const h = H(sim), R = sim.rng, S = sim.S;
  // 始まり：おおよそ年に1回（冬は起こりやすい）、前の流行から最低20日あける
  const since = sim.today - (h.lastEpi ?? -999);
  if (!h.epi.length && since > 20 && R.chance((sim.seasonIdx() === 3 ? 2 : 0.8) / DAYS_PER_YEAR)) {
    const towns = S.world.settlements.filter((s) => !S.towns[s.id]?.occupied);
    const s = R.weighted(towns, (t) => (t.type === 'capital' ? 3 : t.type === 'port' ? 2.5 : 1));
    startEpidemic(sim, s);
  }
  for (const e of h.epi.slice()) {
    const s = sim.town(e.sid);
    // 隣の町へ飛び火する（旅人・商人が運ぶ）
    if (R.chance(0.04) && sim.today - e.from < 8) {
      const near = S.world.settlements.filter((q) => q.id !== s.id && !S.towns[q.id]?.occupied && Math.hypot(q.x - s.x, q.z - s.z) < 45 && !h.epi.some((x) => x.sid === q.id));
      if (near.length) { const q = R.pick(near); const e2 = startEpidemic(sim, q, true); if (e2) { e2.until = sim.today + R.int(7, 11); e2.rate *= 0.7; sim.news(`流行り病が${s.name}から${q.name}にも広がった`, 2, { x: q.x, z: q.z }); } }
    }
    // 決めた日を過ぎ、町に重い流行り病の人がいなくなったらおさまる（最長10日延びる）
    const still = sim.today < e.until + 10 && sim.living().some((q) => q.s === e.sid && q.ail?.kind === 'flu' && q.ail.sev >= 35);
    if (sim.today >= e.until && !still) {
      h.epi.splice(h.epi.indexOf(e), 1);
      const line = e.dead ? `${s.name}の流行り病がようやくおさまった。${e.dead}人が命を落とした` : `${s.name}の流行り病がおさまった。幸い、亡くなった人はいなかった`;
      sim.news(line, 2, { x: s.x, z: s.z });
      sim.chron(line, s.kingdom);
      for (const q of sim.living()) if (q.s === s.id && q.memories && !q.ail && R.chance(0.3)) sim.remember(q, `${s.name}の流行り病を生きのびた`, { emo: 0.4, imp: 0.55, k: 'epidemic' });
    }
  }
}

// ---------- 喪と悲嘆 ----------
function closeTerm(sim, q, d) {
  if (q.spouseId === d.id || (q.spouseId == null && q.exSpouses?.[q.exSpouses.length - 1] === d.id)) return d.sex === 'm' ? '夫' : '妻';
  return sim.kinTerm(q, d);
}

// 死の直後に呼ぶ（die の中、または日ごとの墓の見回りから）
export function onDeath(sim, dead, cause, killer) {
  const h = H(sim), R = sim.rng;
  if (h.mourned[dead.id]) return;
  h.mourned[dead.id] = 1;
  const unsolved = (sim.S.unsolved || []).some((u) => u.victim === dead.id);
  // 続柄を調べるのは、血のつながりか婚姻のつながりがありうる人だけ（全員の続柄を毎回計算しない）
  const deadAnc = sim.ancestors(dead);
  const maybeKin = (q) => {
    if (q.spouseId === dead.id || q.exSpouses?.[q.exSpouses.length - 1] === dead.id || deadAnc.has(q.id)) return true;
    if (q.spouseId != null) { const sp = sim.S.people[q.spouseId]; if (sp && (sp.fatherId === dead.id || sp.motherId === dead.id)) return true; }
    const qa = sim.ancestors(q);
    if (qa.has(dead.id)) return true;
    if (deadAnc.size < qa.size) { for (const id of deadAnc.keys()) if (qa.has(id)) return true; }
    else for (const id of qa.keys()) if (deadAnc.has(id)) return true;
    return false;
  };
  for (const q of sim.living()) {
    if (q === dead || !q.memories) continue;
    const term = maybeKin(q) ? closeTerm(sim, q, dead) : null;
    let lv = term ? GRIEF_LV[term] || 0 : 0;
    const aff = q.rel?.[dead.id]?.a;
    if (!lv && q.hh === dead.hh) lv = 45;
    if (!lv && aff > 60 && q.s === dead.s) lv = 30;
    if (!lv) continue;
    if (aff != null) lv += clamp(aff, -50, 100) * 0.1;
    lv = clamp(lv * (0.8 + q.pers.N * 0.4), 0, 100);
    if (lv < 30) continue; // 遠い親戚は記憶に残るだけ（die の remember で足りる）
    if (term === '父' || term === '母') { if (sim.ageOf(q) < 20) lv = Math.min(100, lv + 12); }
    if (!q.grief || q.grief.lv < lv) q.grief = { who: dead.id, lv: Math.round(lv), day: sim.today };
    else q.grief.lv = Math.min(100, q.grief.lv + lv * 0.3);
    if (lv >= 40) { q.lost = q.lost || []; q.lost.push({ id: dead.id, d: sim.today }); if (q.lost.length > 6) q.lost.shift(); }
    // 殺された：一部は恨みになる
    if (cause === 'murder' && killer?.given && !unsolved && killer.deathYear == null && lv >= 45 && q.revenge !== killer.id && R.chance(0.5)) {
      q.grudge = { who: killer.id, day: sim.today };
      const r = sim.relMut(q, killer); r.a = Math.min(r.a, -70);
      sim.remember(q, `${dead.given}を殺した${killer.given}のことは、一生許さない`, { emo: -0.9, imp: 0.9, about: [killer.id, dead.id], k: 'hatred' });
    }
  }
}

function griefDaily(sim) {
  const h = H(sim), S = sim.S, R = sim.rng;
  // die に直接つながっていなくても、新しい墓を見回って悲嘆をつける
  for (; h.graveIdx < S.graves.length; h.graveIdx++) {
    const d = S.people[S.graves[h.graveIdx]];
    if (d && !h.mourned[d.id]) onDeath(sim, d, d.deathCause, null);
  }
  if (Object.keys(h.mourned).length > 200) h.mourned = {};
  for (const p of sim.living()) {
    const g = p.grief;
    if (g) {
      const hh = sim.hh(p);
      const support = hh ? hh.members.length - 1 : 0;
      g.lv -= 2.5 + p.values.faith * 2 + Math.min(2, support * 0.5) + (sim.today - g.day > 8 ? 1.5 : 0);
      if (g.lv < 5) delete p.grief;
    }
    // 命日
    if (p.lost?.length) for (const l of p.lost) {
      if (sim.today > l.d && (sim.today - l.d) % DAYS_PER_YEAR === 0) {
        const d = S.people[l.id];
        if (!d) continue;
        const term = closeTerm(sim, p, d) || '';
        const yrs = (sim.today - l.d) / DAYS_PER_YEAR;
        sim.remember(p, `今日は${term}${term ? 'の' : ''}${d.given}の命日だ。あれから${yrs}年になる`, { emo: -0.5, imp: 0.6, about: [d.id], k: 'anniv' });
        if (!p.grief || p.grief.lv < 30) p.grief = { who: d.id, lv: 30, day: sim.today };
        p.grief.anniv = sim.today;
      }
    }
    if (p.grudge && sim.today - p.grudge.day > DAYS_PER_YEAR * 2 && R.chance(0.02)) delete p.grudge;
  }
}

// ---------- 怪我と後遺症 ----------
function woundCheck(sim, p) {
  if (p.hp == null || !p.maxhp) return;
  if (p.hp > p.maxhp * 0.6) { p._hurt = false; return; }
  if (p._hurt || p.hp >= p.maxhp * 0.2) return;
  p._hurt = true;
  const R = sim.rng, h = H(sim);
  const fm = p.memories?.slice().reverse().find((m) => m.k === 'fight' && sim.today - m.t <= 1);
  const foe = p.fight ? sim.entity(p.fight.target) : fm?.about?.[0] != null ? sim.person(fm.about[0]) : null;
  const by = foe ? (foe.given || foe.name) : null;
  if (R.chance(0.3)) {
    p.scars = p.scars || [];
    const opts = Object.keys(SCARS).filter((k) => !p.scars.some((s) => s.k === k));
    if (opts.length) {
      const k = R.weighted(opts, (x) => ({ limp: 3, arm: 3, face: 2, eye: 1 }[x]));
      p.scars.push({ k, day: sim.today, by });
      h.stats.scars++;
      sim.remember(p, `${by ? `${by}との戦いで` : '戦いで'}${SCARS[k].mem}`, { emo: -0.7, imp: 0.9, k: 'scar', about: foe?.given ? [foe.id] : [] });
      if (k === 'eye' && p.deeds) p.deeds.push('戦いで片目を失った');
      sim.gossip(p, `戦いで${SCARS[k].desc.replace('ている', 'た').replace('がある', 'を負った')}らしい`, -0.4, sim.living().filter((q) => q.s === p.s && q.rel && (q.rel[p.id]?.f || 0) > 40), { silent: true });
    }
  }
  if (!p.ail && R.chance(0.2)) fallIll(sim, p, 'wound');
}

// ---------- 往診・治療 ----------
export function treat(sim, doc, pat) {
  const a = pat.ail, h = H(sim), R = sim.rng;
  if (!a || a.visited === sim.today || doc.deathYear != null || pat.deathYear != null) return false;
  const job = doc.job, skill = doc.skill?.[job] || 0.4;
  let eff = (HEALERS[job] || 4) * (0.6 + skill * 0.8);
  const m = sim.market(pat.s);
  let fee = job === 'doctor' ? 6 : job === 'herbalist' ? 3 : 0, med = false;
  if ((job === 'doctor' || job === 'herbalist') && m.stock.medicine >= 1) { m.stock.medicine -= 1; eff += 6; fee += Math.round(m.price.medicine); med = true; }
  else if (countItem(doc, 'potion') > 0 && job !== 'priest') { takeItem(doc, 'potion', 1); eff += 5; med = true; }
  if (sim.hasTech(doc, 'medicine')) eff *= 1.25;
  if (a.kind === 'wound' && sim.hasTech(doc, 'healing')) eff *= 1.3;
  a.sev = Math.max(0, a.sev - eff);
  a.visited = sim.today; a.treated++;
  h.stats.treat++;
  const what = job === 'priest' ? '枕元で祈りを捧げてくれた' : med ? '薬を処方してくれた' : '手当てをしてくれた';
  if (fee > 0) {
    const can = spendable(sim, pat);
    if (can < fee && doc.pers.A > 0.5) {
      sim.remember(pat, `${doc.given}先生が往診に来て${what}。お代はいらないと言ってくれた`, { emo: 0.9, imp: 0.75, about: [doc.id], k: 'help' });
      sim.remember(doc, `貧しい${pat.given}をただで診てやった`, { emo: 0.4, imp: 0.45, about: [pat.id] });
      sim.relMut(pat, doc).a += 12;
      fee = 0;
    } else {
      fee = Math.min(fee, Math.max(0, can));
      pay(sim, pat, fee); earn(sim, doc, fee);
    }
  }
  if (fee > 0 || job === 'priest' || job === 'nun' || job === 'cleric') {
    sim.remember(pat, `${doc.given}が往診に来て${what}${fee ? `（${Math.round(fee)}銅貨）` : ''}`, { emo: 0.5, imp: 0.5, about: [doc.id], k: 'help' });
    sim.relMut(pat, doc).a += 5;
  }
  if (R.chance(0.3)) sim.remember(doc, `${a.sev > 50 ? '重い' : ''}${AILS[a.kind].name}の${pat.given}を診た`, { emo: 0.1, imp: 0.3, about: [pat.id] });
  if (sim.isWatched?.(pat) || a.sev > 60) sim.pushLog(`${JOBS_NAME[job] || ''}${doc.given}が${pat.given}の家を訪ね、${what}。`, 'event', [doc.id, pat.id], pat.pos);
  return true;
}
const JOBS_NAME = { doctor: '医者の', herbalist: '薬師の', nun: '修道女の', cleric: '僧侶の', priest: '司祭の' };

// 家族が市場で薬を買ってきて飲ませる
function familyMedicine(sim, p) {
  const a = p.ail;
  if (!a || a.sev < 40 || a.visited === sim.today) return;
  const hh = sim.hh(p), m = sim.market(p.s);
  if (!hh || m.stock.medicine < 1) return;
  const price = m.price.medicine;
  if (hh.money < price + 20 || !sim.rng.chance(0.5)) return;
  hh.money -= price; m.stock.medicine -= 1;
  a.sev = Math.max(0, a.sev - 7);
  const carer = a.carer != null ? sim.person(a.carer) : null;
  if (carer && carer.memories && sim.rng.chance(0.5)) sim.remember(carer, `寝込んでいる${p.given}のために市場で薬を買ってきた`, { emo: 0.1, imp: 0.4, about: [p.id] });
}

// ---------- 毎日 ----------
export function healthDaily(sim) {
  const h = H(sim), S = sim.S;
  const si = sim.seasonIdx();
  epidemicDaily(sim);
  const epiBy = {};
  for (const e of h.epi) epiBy[e.sid] = e;
  // 家ごとの病人（うつる病）
  const crowdBy = {};
  for (const id of h.sick) {
    const q = S.people[id];
    if (!q || q.deathYear != null || !q.ail || !q.ail.contagious) continue;
    const c = crowdBy[q.hh] || (crowdBy[q.hh] = {});
    c[q.ail.kind] = (c[q.ail.kind] || 0) + 1;
  }
  const people = sim.living().slice();
  for (const p of people) {
    if (p.deathYear != null || !p.needs) continue;
    const age = sim.ageOf(p);
    if (p.ail) {
      if (!AILS[p.ail.kind]) { delete p.ail; continue; }
      progressDaily(sim, p, age, si);
      if (p.deathYear != null || !p.ail) continue;
      familyMedicine(sim, p);
      if (isBedridden(p)) { const c = pickCarer(sim, p); p.ail.carer = c ? c.id : null; } else p.ail.carer = null;
    } else {
      const crowd = crowdBy[p.hh] ? Object.entries(crowdBy[p.hh]) : [];
      onsetDaily(sim, p, age, si, crowd, epiBy[p.s]);
    }
    if (p.imm) for (const k of Object.keys(p.imm)) if (p.imm[k] <= sim.today) delete p.imm[k];
  }
  h.sick = sim.living().filter((p) => p.ail).map((p) => p.id);
  griefDaily(sim);
}

// ---------- 毎時 ----------
export function healthHourly(sim) {
  const S = sim.S;
  for (const p of sim.living()) {
    woundCheck(sim, p);
    const a = p.action;
    if (p.ail) {
      const doing = a && a.phase === 'do';
      if (doing && (a.type === 'sickbed' || a.type === 'sleep' || a.type === 'rest')) p.ail.rest++;
      if (doing && a.type === 'work') p.ail.work++;
      p.mood = clamp(p.mood - p.ail.sev * 0.04, 0, 100);
    }
    if (p.grief) p.mood = clamp(p.mood - p.grief.lv * 0.06, 0, 100);
    if (!a || a.phase !== 'do') continue;
    if (a.type === 'nurse') {
      const q = S.people[a.friend];
      if (q && q.ail && q.inside != null && q.inside === p.inside) {
        q.ail.care++;
        q.needs.pleasure = Math.min(100, q.needs.pleasure + 4);
        if (!a.noted && sim.rng.chance(0.25)) { a.noted = true; sim.remember(p, `寝込んでいる${q.given}を看病した`, { emo: 0.1, imp: 0.35, about: [q.id], k: 'nurse' }); }
      }
    } else if (!a.hdone && (a.type === 'housecall' || a.type === 'grave')) healthArrive(sim, p); // arrive につながっていない時の予備
  }
}

// ---------- 到着したとき（sim.arrive の switch から） ----------
export function healthArrive(sim, p) {
  const a = p.action;
  if (!a || a.hdone) return;
  if (a.type === 'housecall') {
    a.hdone = true;
    const q = sim.person(a.friend);
    if (q && q.ail) treat(sim, p, q);
    else a.until = sim.S.t + 5;
  } else if (a.type === 'grave') {
    a.hdone = true;
    const d = sim.person(a.friend);
    if (!d) return;
    const term = closeTerm(sim, p, d);
    sim.remember(p, `${term ? term + 'の' : ''}${d.given}の墓に花を手向けた`, { emo: -0.1, imp: 0.4, about: [d.id], k: 'grave' });
    if (p.grief) p.grief.lv = Math.max(0, p.grief.lv - 6);
    p.needs.survival = Math.min(100, p.needs.survival + 5);
  }
}

// ---------- 行動の選び方（decide から） ----------
// 寝込んでいる人の行動。返り値があれば decide はそれだけを行う
export function sickAction(sim, p) {
  if (!p.ail || !isBedridden(p) || p.jail != null) return null;
  const hh = sim.hh(p), h = sim.hour();
  const home = sim.placeFor(p, 'home');
  if (p.needs.hunger < 45) {
    if (hh && hh.food >= 1 && hh.house != null) return { type: 'eat', place: home, dur: 30 };
    return null; // 食べ物がない：ふだんの判断（買い物・物乞い）に任せる
  }
  if (h >= 21 || h < 7) return { type: 'sleep', place: home, dur: 0, untilHour: 7 };
  return { type: 'sickbed', place: home, dur: 90 };
}

// 候補の点数を直し、看病・往診・墓参りを足す（decide で cands.sort の直前に呼ぶ）
export function healthDecide(sim, p, cands, add) {
  const h = sim.hour(), S = sim.S;
  const age = sim.ageOf(p);
  // 軽い病：仕事や遊びがおっくうになる
  if (p.ail) {
    const s = p.ail.sev;
    for (const c of cands) {
      if (c.type === 'work' || c.type === 'train' || c.type === 'quest') c.score -= s / 15;
      else if (['tavern', 'stroll', 'play', 'plaza', 'court', 'visit'].includes(c.type)) c.score -= s / 18;
      else if (c.type === 'rest') c.score += s / 10;
    }
  }
  // 悲嘆：気力がなく、祈りと墓参りが増える
  const g = p.grief;
  if (g && g.lv > 10) {
    for (const c of cands) {
      if (c.type === 'work') c.score -= g.lv / 60;
      else if (['tavern', 'play', 'plaza', 'court', 'festival'].includes(c.type)) c.score -= g.lv / 28;
      else if (c.type === 'pray') c.score += g.lv / 40;
    }
    const anniv = g.anniv === sim.today;
    if (h >= 8 && h < 18 && (anniv || sim.rng.chance(0.25))) add((anniv ? 7 : 1.5 + g.lv / 25) + p.values.faith, 'grave', sim.placeFor(p, 'cemetery'), sim.rng.int(20, 45), { friend: g.who });
  }
  // 看病：同じ家の寝込んでいる人
  if (h >= 7 && h < 21 && age >= 10 && p.needs.hunger > 25) {
    const hh = sim.hh(p);
    if (hh) for (const id of hh.members) {
      const q = S.people[id];
      if (q && q !== p && q.ail && q.ail.carer === p.id && isBedridden(q)) { add(6.5 + p.pers.A * 2 + q.ail.sev / 25, 'nurse', sim.placeFor(p, 'home'), 90, { friend: q.id }); break; }
    }
  }
  // 往診：医者・薬師・修道女・僧侶・司祭
  if (HEALERS[p.job] && h >= 8 && h < 18 && age >= 16 && !p.ail) {
    const hs = S.health;
    let best = null, bs = p.job === 'priest' ? 60 : 30;
    if (hs?.sick) for (const id of hs.sick) {
      const q = S.people[id];
      if (!q || q === p || q.deathYear != null || !q.ail || q.s !== p.s || !isBedridden(q)) continue;
      if (q.ail.visited === sim.today || (q.ail.docDay === sim.today && q.ail.docBy !== p.id)) continue;
      if (q.ail.sev > bs) { bs = q.ail.sev; best = q; }
    }
    if (best) {
      best.ail.docDay = sim.today; best.ail.docBy = p.id;
      const pl = sim.placeFor(best, 'home');
      add(8 + (p.job === 'doctor' ? 1 : 0) + best.ail.sev / 30, 'housecall', pl, 50, { friend: best.id });
    }
  }
}

// ---------- ほかの仕組みから使う倍率 ----------
// 歩く速さ（足の古傷・病）
export function healthSpeedMul(p) {
  let m = 1;
  if (p.scars?.some((s) => s.k === 'limp')) m *= 0.8;
  if (p.ail && p.ail.sev > 25) m *= 0.85;
  return m;
}
// 仕事の効率（病・悲嘆・腕の古傷）
export function healthWorkMul(p) {
  let m = 1;
  if (p.ail) m *= 1 - p.ail.sev / 150;
  if (p.grief) m *= 1 - p.grief.lv / 400;
  if (p.scars?.some((s) => s.k === 'arm')) m *= 0.9;
  return Math.max(0.3, m);
}

// ---------- 心の声 ----------
export function healthThoughts(api, p) {
  const out = [];
  const a = p.ail, R = api.rng;
  if (a) {
    const T = {
      cold: ['くしゅん！　……鼻がむずむずする。', '喉がいがいがする。温かいものが飲みたい。'],
      flu: ['熱が下がらない……', '咳をするたびに胸が痛む。', '町じゅうがこの病に……どうなってしまうんだ。'],
      fever: ['頭が割れるように痛い……', '熱が下がらない……天井がぐるぐる回る。'],
      belly: ['お腹が……また厠へ……。', '昨日のあれがいけなかったのかな。'],
      ache: ['古傷がうずく。雨になるな。', 'この傷、寒い日はこたえる。'],
      wound: ['傷口が熱い……膿んできたのか。', '包帯の下がずきずきする。'],
    }[a.kind] || [];
    out.push(...T);
    if (a.sev >= 70) out.push('このまま目が覚めなかったら……。', '家族の顔が見たい。');
    const c = a.carer != null ? api.person(a.carer) : null;
    if (c && isBedridden(p)) out.push(`${c.given}がずっとそばにいてくれる。ありがたい。`);
    if (a.visited === api.today) out.push('先生に診てもらって、少し楽になった。');
    if (p.action?.type === 'work') out.push('休めば治るのはわかってる。でも休めない。');
  }
  if (p.action?.type === 'nurse') {
    const q = api.person(p.action.friend);
    if (q) out.push(`${q.given}、早く良くなって……。`, `${q.given}の熱、今夜こそ下がるといい。`);
  }
  if (p.action?.type === 'housecall') {
    const q = api.person(p.action.friend);
    if (q) out.push(`${q.given}の容体が気になる。急がないと。`);
  }
  const g = p.grief;
  if (g && g.lv > 15) {
    const d = api.person(g.who);
    if (d) {
      const term = closeTerm(api, p, d);
      const nm = term ? `${term.replace('父', '父さん').replace('母', '母さん')}` : d.given;
      out.push(`${nm}……どうして。`, `ふとした時に、${d.given}の声が聞こえる気がする。`);
      if (g.anniv === api.today) out.push(`今日は${d.given}の命日。あの日のことは忘れられない。`);
      if (p.action?.type === 'grave') out.push(`${d.given}、会いに来たよ。`);
      if (g.lv > 60) out.push('何も手につかない。');
    }
  }
  if (p.grudge) { const k = api.person(p.grudge.who); if (k && k.deathYear == null) out.push(`${k.given}……あいつだけは許さない。`); }
  if (p.scars?.length && R.chance(0.4)) {
    const s = R.pick(p.scars);
    out.push({ limp: 'この足さえ動けば……。', eye: '片目の暮らしにも、ずいぶん慣れた。', arm: '腕が思うように上がらない。', face: '子どもに傷跡を怖がられた。' }[s.k]);
  }
  const hs = api.S.health;
  if (hs?.epi?.some((e) => e.sid === p.s) && !a) out.push('流行り病がうつらないといいけど……。', '井戸の水、ちゃんと沸かして飲まないと。');
  return out;
}

// ---------- 会話の話題 ----------
// speech.js の topics() で使う：const ht = healthTopic(api, A, B); if (ht) add(ht.w, ht.fn);
export function healthTopic(api, A, B) {
  const hs = api.S.health;
  if (A.ail && A.ail.sev >= 10) return { w: 1.6 + A.ail.sev / 40, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s(api2.rng.pick({
    cold: ['風邪をひいたみたいで、喉が痛い', '鼻が詰まって何の匂いもしない'],
    flu: ['熱が下がらなくて、まだふらふらする', '咳が止まらない'],
    fever: ['熱が下がらない', 'ひどい熱で、ゆうべはうなされた'],
    belly: ['お腹をこわして、何も食べられない'],
    ache: ['古傷がうずいて、よく眠れない'],
    wound: ['傷が膿んで、ずきずきする'],
  }[A.ail.kind] || ['どうも具合が悪い']), 'v'), sentiment: -0.4 }) };
  if (B.ail && B.ail.sev >= 20 && (A.rel?.[B.id]?.a || 0) > 0) return { w: 2, fn: (api2, A2, B2, v) => ({ kind: 'good', text: v.s(`${ailNameOf(B2)}だって聞いた。お大事に`, 'raw') + '。', sentiment: 0.5, about: [B2.id] }) };
  if (hs?.epi?.some((e) => e.sid === A.s)) return { w: 2.2, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s(api2.rng.pick(['流行り病で、隣の家も寝込んでいる', 'このところ、弔いの鐘ばかり聞こえる', '流行り病がおさまるまで、人の多いところは避けたい']), 'v'), sentiment: -0.6 }) };
  if (A.scars?.length && (A.rel?.[B.id]?.f || 0) > 40) return { w: 0.4, fn: (api2, A2, B2, v) => {
    const s = api2.rng.pick(A2.scars);
    return { kind: 'memory', text: v.s(`この${SCARS[s.k].name}は${s.by ? `${s.by}にやられた` : '戦いで負った'}もの`, 'n'), sentiment: -0.2 };
  } };
  if (A.grudge) { const k = api.person(A.grudge.who); if (k && k.deathYear == null && B.id !== k.id) return { w: 0.8, fn: (api2, A2, B2, v) => ({ kind: 'opinion', text: v.s(`${k.given}のことは、死んでも許さない`, 'n'), sentiment: -0.8, about: [k.id] }) }; }
  return null;
}
const ailNameOf = (p) => (p.ail ? AILS[p.ail.kind].name : '病気');

// 詳細欄向けの短い説明（ui.js で使う）
export function healthLabel(p) {
  const out = [];
  if (p.ail) out.push(`${AILS[p.ail.kind]?.name || '病'}（${p.ail.sev >= 70 ? '重い' : p.ail.sev >= 35 ? '寝込んでいる' : '軽い'}）`);
  if (p.scars?.length) out.push(p.scars.map((s) => SCARS[s.k]?.desc).join('・'));
  if (p.grief && p.grief.lv > 10) out.push(`喪に服している`);
  return out.join('／');
}
