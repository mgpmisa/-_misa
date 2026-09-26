// 村の300年の歴史を生成する。
// 住人たちは「昨日生まれた」のではなく、祖先から続く本物の過去を持つ。
import { clamp } from './rng.js';
import {
  MALE_NAMES, FEMALE_NAMES, FOUNDER_FAMILIES, IMMIGRANT_FAMILIES, ORIGINS, JOBS, JOB_QUOTA,
  SAYINGS, DREAMS, DEATH_CAUSES, HISTORY_YEARS, DAYS_PER_YEAR, VILLAGE,
} from './data.js';
import { ancestors, isCloseKin, kinTerm, siblings } from './kin.js';

const HAIR = ['#e8c872', '#b07a3a', '#6b4226', '#2e1f16', '#c2542d', '#8a5a2b'];
const SKIN = ['#f3d2b3', '#e8b98f', '#d9a077', '#b97e55'];
const SHIRT = ['#3b6fb6', '#b63b3b', '#3b8f5a', '#8f6a3b', '#6a3b8f', '#c9a23a', '#3b8f8f', '#7a7a7a', '#a0522d', '#d0d0c0'];
const PANTS = ['#4a3a2a', '#3a3a4a', '#5a4a3a', '#2a3a2a', '#6a5a4a'];

// 固定の歴史的出来事
const FIXED_EVENTS = {
  0: { kind: 'found', text: '開拓者の六家族がリンデンの大樹のもとに村を開いた' },
  23: { kind: 'build', text: '村に最初のパン窯が築かれた' },
  58: { kind: 'build', text: '村人総出で小さな礼拝堂を建てた' },
  131: { kind: 'build', text: '村役場とともに青い屋根の鐘楼が完成した', child: '鐘楼が完成した日、はじめて鐘の音を聞いた', adult: '鐘楼の完成を祝って、夜通し踊った' },
  204: { kind: 'flood', text: '長雨で湖があふれ、南の畑が水に沈んだ', mort: 1.4, child: '大洪水の年、家の床まで水が来て怖かった', adult: '大洪水で畑をなくし、一から耕し直した' },
  266: { kind: 'fire', text: '大火で村の北側の家々が焼けた', mort: 1.3, child: '大火の夜、燃える空を見て泣いた', adult: '大火のあと、焼けた家の建て直しを手伝った' },
  297: { kind: 'famine', text: '冷夏による大凶作。村は冬を越すのがやっとだった', mort: 1.8, child: '大凶作の年、毎日お腹をすかせていた', adult: '大凶作の年、家族を食べさせるのに必死だった' },
};
const RANDOM_EVENTS = [
  { kind: 'famine', p: 0.03, mort: 1.8, text: '凶作の年。麦がほとんど実らなかった', child: '凶作の年、薄い麦がゆばかり食べていた', adult: '凶作の年、倉が空になって眠れない夜が続いた' },
  { kind: 'plague', p: 0.018, mort: 2.6, text: '流行り病が村を襲った', child: '流行り病の年、家から出してもらえなかった', adult: '流行り病の年、たくさんの弔いに立ち会った' },
  { kind: 'winter', p: 0.04, mort: 1.4, text: '湖が底まで凍るほどの厳しい冬だった', child: '湖が凍った冬、氷の上をすべって遊んだ', adult: '厳しい冬、薪が足りなくなって森へ通い続けた' },
  { kind: 'harvest', p: 0.06, birth: 1.3, text: '大豊作。収穫祭は三日三晩続いた', child: '大豊作の収穫祭で、はじめて夜更かしを許された', adult: '大豊作の年、収穫祭で朝まで踊った' },
  { kind: 'wolves', p: 0.02, mort: 1.1, text: '冬に狼の群れが村の近くまで下りてきた', child: '狼の遠吠えが怖くて、毎晩ふとんをかぶって寝た', adult: '狼の出た冬、夜番に立って松明を振った' },
  { kind: 'war', p: 0.012, text: '王の徴兵で村の若者が遠い戦に送られた', child: '若い兄さんたちが戦に行く日、道の端で見送った', adult: '徴兵の年、知り合いの若者たちを見送った' },
  { kind: 'comet', p: 0.012, text: '尾の長いほうき星が夜空に現れた', child: 'ほうき星を見て、世界が終わるのかと思った', adult: 'ほうき星の夜、みんなで鐘楼の下に集まって空を見上げた' },
  { kind: 'troupe', p: 0.03, text: '旅の一座が村に来て芝居を打った', child: '旅の一座の芝居を見て、役者になりたいと思った', adult: '旅の一座の芝居を見て、腹をかかえて笑った' },
  { kind: 'drought', p: 0.02, mort: 1.2, text: '日照りで湖の水位が大きく下がった', child: '日照りの夏、干上がった湖の底を歩いた', adult: '日照りの夏、井戸の水を分け合って暮らした' },
];
const HERO_DEEDS = [
  '嵐の夜に溺れかけた子どもを湖から助けた', '村に初めてりんごの木を植えた', '冬の森で迷った旅人を連れ帰った',
  '狼を棒一本で追い払った', '王都の祭りで歌を披露して褒美をもらった', '三日三晩かけて崩れた橋を架け直した',
  '村の井戸を掘りあてた', '収穫祭の力比べで七年続けて勝った', '流行り病の家に毎日パンを届け続けた',
];
const MORT = [[0, 0.06], [4, 0.012], [14, 0.004], [39, 0.005], [54, 0.011], [64, 0.026], [74, 0.065], [84, 0.15], [999, 0.32]];
const mortality = (age) => { for (const [a, p] of MORT) if (age <= a) return p; return 0.3; };
const TARGET_POP = 60;

export function createPersonFactory(ctx) {
  // ctx: { rng, people, nextId() }
  const { rng, people } = ctx;
  const blend = (a, b, sd = 0.17) => clamp(((a + b) / 2) + rng.gauss(0, sd), 0.03, 0.97);
  const rnd = () => clamp(rng.gauss(0.5, 0.2), 0.03, 0.97);

  return function makePerson({ sex, family, birthYear, birthDay, father, mother, given }) {
    const id = ctx.nextId();
    sex = sex || (rng.chance(0.5) ? 'm' : 'f');
    const pers = father && mother
      ? { O: blend(father.pers.O, mother.pers.O), C: blend(father.pers.C, mother.pers.C), E: blend(father.pers.E, mother.pers.E), A: blend(father.pers.A, mother.pers.A), N: blend(father.pers.N, mother.pers.N) }
      : { O: rnd(), C: rnd(), E: rnd(), A: rnd(), N: rnd() };
    const values = father && mother
      ? { faith: blend(father.values.faith, mother.values.faith), ambition: rnd(), family: blend(father.values.family, mother.values.family, 0.2) }
      : { faith: rnd(), ambition: rnd(), family: rnd() };
    const pool = sex === 'm' ? MALE_NAMES : FEMALE_NAMES;
    if (!given) {
      const taken = new Set();
      if (father) for (const c of father.children) { const s = people[c]; if (s && s.deathYear == null) taken.add(s.given); }
      let tries = 0;
      do { given = rng.pick(pool); } while (taken.has(given) && tries++ < 20);
    }
    const hair = father && mother ? (rng.chance(0.5) ? father.look.hair : mother.look.hair) : rng.pick(HAIR);
    const skin = father && mother ? (rng.chance(0.5) ? father.look.skin : mother.look.skin) : rng.pick(SKIN);
    const p = {
      id, given, family, birthFamily: family, sex, birthYear, birthDay: birthDay ?? rng.int(0, DAYS_PER_YEAR - 1),
      deathYear: null, deathCause: null,
      fatherId: father ? father.id : null, motherId: mother ? mother.id : null,
      spouseId: null, exSpouses: [], children: [],
      pers, values, job: null,
      dream: rng.pick(DREAMS),
      saying: rng.chance(0.45) ? rng.pick(SAYINGS) : null,
      deeds: [], notes: [], origin: null,
      look: {
        hair, skin, shirt: rng.pick(SHIRT), pants: rng.pick(PANTS),
        hairStyle: rng.int(0, 2), beard: sex === 'm' && rng.chance(0.3),
      },
    };
    people[id] = p;
    if (father) father.children.push(id);
    if (mother) mother.children.push(id);
    return p;
  };
}

export function note(p, y, txt, opt = {}) {
  p.notes.push({ y, txt, emo: opt.emo ?? 0, imp: opt.imp ?? 0.4, about: opt.about || [], k: opt.k || 'life' });
}

export function generateHistory(rng) {
  const people = {};
  let nid = 1;
  const ctx = { rng, people, nextId: () => nid++ };
  const makePerson = createPersonFactory(ctx);
  const chronicle = [];
  const alive = () => Object.values(people).filter((p) => p.deathYear == null);
  const age = (p, y) => y - p.birthYear;

  // --- 開拓者たち ---
  for (const fam of FOUNDER_FAMILIES) {
    const h = makePerson({ sex: 'm', family: fam, birthYear: -rng.int(20, 32) });
    const w = makePerson({ sex: 'f', family: rng.pick(IMMIGRANT_FAMILIES), birthYear: -rng.int(18, 28) });
    w.family = fam;
    h.spouseId = w.id; w.spouseId = h.id;
    h.origin = w.origin = rng.pick(ORIGINS);
    h.job = rng.pick(['farmer', 'farmer', 'woodcutter', 'smith', 'fisher', 'baker']);
    w.job = rng.chance(0.5) ? h.job : 'farmer';
    h.deeds.push('この村を開いた開拓者のひとりだった');
    w.deeds.push('夫とともにこの村を切り開いた');
    for (let i = 0; i < rng.int(0, 2); i++) {
      const c = makePerson({ family: fam, birthYear: -rng.int(1, 6), father: h, mother: w });
      c.origin = h.origin;
    }
  }
  chronicle.push({ y: 0, text: FIXED_EVENTS[0].text });

  const withinQuota = () => {
    const cnt = {};
    for (const p of alive()) if (p.job) cnt[p.job] = (cnt[p.job] || 0) + 1;
    return cnt;
  };

  for (let y = 1; y <= HISTORY_YEARS; y++) {
    const living = alive();
    let mortMul = 1, birthMul = 1;
    const events = [];
    if (FIXED_EVENTS[y]) events.push(FIXED_EVENTS[y]);
    for (const ev of RANDOM_EVENTS) if (rng.chance(ev.p)) { events.push(ev); break; }
    for (const ev of events) {
      mortMul *= ev.mort || 1; birthMul *= ev.birth || 1;
      chronicle.push({ y, text: ev.text });
      if (ev.child) for (const p of living) {
        const a = age(p, y);
        if (a < 3) continue;
        const neg = ['famine', 'plague', 'flood', 'fire', 'wolves', 'war', 'drought', 'winter'].includes(ev.kind);
        note(p, y, a < 15 ? ev.child : ev.adult, { emo: neg ? -0.5 : 0.6, imp: 0.55, k: 'event' });
      }
      if (ev.kind === 'war') {
        const young = living.filter((p) => p.sex === 'm' && age(p, y) >= 17 && age(p, y) <= 26 && p.deathYear == null);
        rng.shuffle(young).slice(0, rng.int(1, 3)).forEach((p) => {
          if (rng.chance(0.55)) die(p, y, 'war');
          else { note(p, y, '王の徴兵で遠い戦に行き、なんとか生きて帰った', { emo: -0.7, imp: 0.9 }); p.deeds.push('遠い戦から生きて帰ってきた'); }
        });
      }
      if (ev.kind === 'famine' && rng.chance(0.5)) {
        const hero = rng.pick(living.filter((p) => age(p, y) > 30 && age(p, y) < 65));
        if (hero) { hero.deeds.push('凶作の年に自分の倉を開いて村に麦を分けた'); note(hero, y, '凶作の年、倉を開いて村のみんなに麦を分けた', { emo: 0.5, imp: 0.8 }); }
      }
      if (y === 131) {
        const smith = living.find((p) => p.job === 'smith');
        if (smith) { smith.deeds.push('鐘楼の鐘を鋳造した'); note(smith, y, '鐘楼の鐘を自分の手で鋳造した', { emo: 0.8, imp: 0.95 }); }
      }
    }

    // --- 死 ---
    for (const p of living) {
      if (p.deathYear != null) continue;
      const a = age(p, y);
      const pr = mortality(a) * (a < 5 || a > 60 ? mortMul : 1 + (mortMul - 1) * 0.5);
      if (rng.chance(pr)) {
        let cause = a >= 72 ? 'old' : a < 2 ? 'infant' : rng.pick(['sick', 'sick', 'winter', 'accident', 'lake']);
        if (mortMul > 2) cause = 'sick';
        die(p, y, cause);
      }
    }

    // --- 仕事につく ---
    for (const p of alive()) {
      if (p.job || age(p, y) < 14) continue;
      const cnt = withinQuota();
      const lacking = Object.keys(JOB_QUOTA).filter((j) => (cnt[j] || 0) < JOB_QUOTA[j]);
      const father = people[p.fatherId], mother = people[p.motherId];
      if (lacking.length && rng.chance(0.5)) p.job = rng.pick(lacking);
      else if (father && father.job && rng.chance(0.65)) p.job = father.job;
      else if (mother && mother.job && rng.chance(0.4)) p.job = mother.job;
      else p.job = rng.chance(0.7) ? 'farmer' : rng.pick(Object.keys(JOBS));
      const par = father && father.job === p.job ? father : mother && mother.job === p.job ? mother : null;
      note(p, y, par ? `14歳で${kinTerm(people, p, par)}のもとで${JOBS[p.job].name}の修業を始めた` : `14歳で${JOBS[p.job].name}の見習いになった`, { imp: 0.45, emo: 0.2 });
    }

    // --- 偉業 ---
    for (const p of alive()) {
      const a = age(p, y);
      if (a > 22 && a < 60 && rng.chance(0.004)) {
        const d = rng.pick(HERO_DEEDS);
        if (!p.deeds.includes(d)) { p.deeds.push(d); note(p, y, d, { emo: 0.6, imp: 0.85 }); }
      }
    }

    // --- 結婚 ---
    const singles = alive().filter((p) => p.spouseId == null && age(p, y) >= 17 && age(p, y) <= 40);
    const women = rng.shuffle(singles.filter((p) => p.sex === 'f'));
    const men = singles.filter((p) => p.sex === 'm');
    for (const w of women) {
      if (!rng.chance(0.28)) continue;
      const cands = men.filter((m) => m.spouseId == null && Math.abs(age(m, y) - age(w, y)) <= 10 && !isCloseKin(people, m, w));
      if (!cands.length) continue;
      const m = rng.weighted(cands, (c) => 1 + (1 - Math.abs(c.pers.E - w.pers.E)) + (1 - Math.abs(c.pers.O - w.pers.O)));
      marry(m, w, y);
    }

    // --- 誕生 ---
    const pop = alive().length;
    const popF = clamp(1.7 - pop / TARGET_POP, 0.08, 1.5);
    for (const w of alive()) {
      if (w.sex !== 'f' || w.spouseId == null) continue;
      const h = people[w.spouseId];
      if (!h || h.deathYear != null) continue;
      const a = age(w, y);
      if (a < 18 || a > 42 || w.children.length >= 7) continue;
      if (rng.chance(0.3 * popF * birthMul)) birth(h, w, y);
    }

    // --- 移住者 ---
    const pop2 = alive().length;
    if ((pop2 < 40 && rng.chance(0.5)) || rng.chance(0.045)) {
      const fam = rng.pick(IMMIGRANT_FAMILIES);
      const origin = rng.pick(ORIGINS);
      const a = makePerson({ family: fam, birthYear: y - rng.int(18, 30) });
      a.origin = origin; a.job = rng.chance(0.6) ? 'farmer' : rng.pick(Object.keys(JOBS));
      note(a, y, `${origin}からこの村に移り住んだ`, { emo: 0.3, imp: 0.85, k: 'arrival' });
      a.deeds.push(`${origin}からこの村にやってきた`);
      if (rng.chance(0.45)) {
        const b = makePerson({ sex: a.sex === 'm' ? 'f' : 'm', family: fam, birthYear: y - rng.int(18, 30) });
        b.origin = origin; b.job = 'farmer';
        if (a.sex === 'm') marry(a, b, y - rng.int(0, 3), true); else marry(b, a, y - rng.int(0, 3), true);
        note(b, y, `連れ合いと一緒に${origin}からこの村に移り住んだ`, { emo: 0.3, imp: 0.85, k: 'arrival' });
      }
    }
  }

  function die(p, y, cause) {
    p.deathYear = y; p.deathCause = cause;
    const a = age(p, y);
    if (p.job && a > 20) p.deeds.unshift(`腕のいい${JOBS[p.job].name}だった`);
    if (p.children.length >= 4) p.deeds.push(`${p.children.length}人の子を育てた`);
    for (const q of alive()) {
      if (age(q, y) < 3) continue;
      const term = kinTerm(people, q, p);
      if (!term) continue;
      const close = ['父', '母', '夫', '妻', '息子', '娘', '兄', '弟', '姉', '妹', '祖父', '祖母'].includes(term);
      if (!close) continue;
      note(q, y, `${term}の${p.given}が${DEATH_CAUSES[cause]}で亡くなった`, { emo: -0.85, imp: term === '祖父' || term === '祖母' ? 0.6 : 0.9, about: [p.id], k: 'death' });
    }
    if (p.spouseId != null) {
      const sp = people[p.spouseId];
      if (sp) { sp.exSpouses.push(p.id); sp.spouseId = null; }
    }
  }

  function marry(m, w, y, quiet) {
    m.spouseId = w.id; w.spouseId = m.id;
    w.family = m.family;
    if (!quiet) {
      note(m, y, `${w.given}と礼拝堂で結婚した`, { emo: 0.85, imp: 0.95, about: [w.id], k: 'marriage' });
      note(w, y, `${m.given}と礼拝堂で結婚した`, { emo: 0.85, imp: 0.95, about: [m.id], k: 'marriage' });
    }
  }

  function birth(h, w, y) {
    const sex = rng.chance(0.5) ? 'm' : 'f';
    let given = null;
    // 亡くなった祖父母の名前をもらう
    const grand = [h.fatherId, h.motherId, w.fatherId, w.motherId].map((id) => people[id]).filter((g) => g && g.deathYear != null && g.sex === sex);
    let namesake = null;
    if (grand.length && rng.chance(0.3)) { namesake = rng.pick(grand); given = namesake.given; if (siblings(people, { fatherId: h.id, motherId: w.id, id: -1 }).some((s) => s.given === given && s.deathYear == null)) given = null; }
    const c = makePerson({ sex, family: h.family, birthYear: y, father: h, mother: w, given });
    c.origin = null;
    if (namesake && given) note(c, y, `亡くなった${kinTerm(people, c, namesake)}の${namesake.given}の名前をもらって生まれた`, { imp: 0.5, emo: 0.3, about: [namesake.id], k: 'birth' });
    for (const par of [h, w]) note(par, y, `${sex === 'm' ? '息子' : '娘'}の${c.given}が生まれた`, { emo: 0.9, imp: 0.9, about: [c.id], k: 'child' });
    for (const s of siblings(people, c)) {
      if (s.deathYear == null && age(s, y) >= 3) note(s, y, `${sex === 'm' ? '弟' : '妹'}の${c.given}が生まれた`, { emo: 0.5, imp: 0.55, about: [c.id], k: 'sibling' });
    }
    if (rng.chance(0.012)) die(w, y, 'birth');
  }

  // 職業の空きを埋める（今生きている大人）
  const adults = alive().filter((p) => age(p, HISTORY_YEARS) >= 16 && age(p, HISTORY_YEARS) <= 66);
  const cnt = {};
  for (const p of adults) if (p.job) cnt[p.job] = (cnt[p.job] || 0) + 1;
  for (const job of Object.keys(JOB_QUOTA)) {
    while ((cnt[job] || 0) < JOB_QUOTA[job]) {
      const pool = adults.filter((p) => (p.job === 'farmer' || !p.job) && (job !== 'mayor' || age(p, HISTORY_YEARS) > 35));
      if (!pool.length) break;
      const p = rng.weighted(pool, (q) => (job === 'priest' ? q.values.faith : job === 'mayor' ? q.pers.C + age(q, HISTORY_YEARS) / 60 : 1));
      if (p.job) cnt[p.job]--;
      p.job = job; cnt[job] = (cnt[job] || 0) + 1;
      note(p, HISTORY_YEARS - rng.int(1, 8), job === 'mayor' ? '村の寄り合いで村長に選ばれた' : `${JOBS[job].name}の仕事を継いだ`, { imp: 0.7, emo: 0.5 });
    }
  }
  for (const p of adults) if (!p.job) p.job = 'farmer';
  // 珍しい職業が多すぎないように
  const CAP = { mayor: 1, priest: 1, merchant: 1, innkeeper: 2, baker: 2, smith: 2, carpenter: 2, fisher: 3, woodcutter: 3 };
  for (const [job, cap] of Object.entries(CAP)) {
    const elig = (p) => (age(p, HISTORY_YEARS) >= 16 && age(p, HISTORY_YEARS) <= 66 ? 0 : 1);
    const holders = alive().filter((p) => p.job === job).sort((a, b) => elig(a) - elig(b) || a.birthYear - b.birthYear);
    for (const extra of holders.slice(cap)) extra.job = age(extra, HISTORY_YEARS) >= 14 ? 'farmer' : null;
  }
  for (const p of alive()) if (p.birthYear >= HISTORY_YEARS) p.birthDay = 0;

  return { people, chronicle, nextId: nid, currentYear: HISTORY_YEARS, villageName: VILLAGE, ancestorsOf: (p) => ancestors(people, p) };
}
