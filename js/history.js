// 大陸の280年の歴史を生成する。
// 王朝・戦争・歴代の魔王と勇者・町ごとの家系。住人たちは本物の過去を持つ。
import { clamp } from './rng.js';
import {
  MALE_NAMES, FEMALE_NAMES, SOUTH_MALE, SOUTH_FEMALE, FAMILY_NAMES, SOUTH_FAMILIES, ORIGINS, JOBS, JOB_QUOTA,
  SAYINGS, DREAMS, HISTORY_YEARS, DAYS_PER_YEAR, KINGDOMS,
} from './data.js';
import { kinTerm } from './kin.js';

const HAIR = ['#e8c872', '#b07a3a', '#6b4226', '#2e1f16', '#c2542d', '#8a5a2b'];
const HAIR_S = ['#2e1f16', '#1a1410', '#4a3020', '#6b4226'];
const SKIN = ['#f3d2b3', '#e8b98f', '#d9a077'];
const SKIN_S = ['#c98e5e', '#b97e55', '#9a6440', '#d9a077'];
const SHIRT = ['#3b6fb6', '#b63b3b', '#3b8f5a', '#8f6a3b', '#6a3b8f', '#c9a23a', '#3b8f8f', '#7a7a7a', '#a0522d', '#d0d0c0'];
const PANTS = ['#4a3a2a', '#3a3a4a', '#5a4a3a', '#2a3a2a', '#6a5a4a'];
const MORT = [[0, 0.06], [4, 0.012], [14, 0.004], [39, 0.005], [54, 0.011], [64, 0.026], [74, 0.065], [84, 0.15], [999, 0.32]];
const mortality = (age) => { for (const [a, p] of MORT) if (age <= a) return p; return 0.3; };
const TARGET = { capital: 52, village: 17, port: 19 };
const DEMON_NAMES = ['ザルヴァーン', 'ネクロディア', 'ヴォルグラム', 'アスタロート', 'ベルゼリオン'];

const EVENTS = [
  { kind: 'famine', p: 0.025, mort: 1.8, text: (k) => `${k}で凶作。麦がほとんど実らなかった`, child: '凶作の年、薄い麦がゆばかり食べていた', adult: '凶作の年、倉が空になって眠れない夜が続いた' },
  { kind: 'plague', p: 0.015, mort: 2.6, text: (k) => `${k}を流行り病が襲った`, child: '流行り病の年、家から出してもらえなかった', adult: '流行り病の年、たくさんの弔いに立ち会った' },
  { kind: 'winter', p: 0.035, mort: 1.4, text: (k) => `${k}に川が凍るほどの厳しい冬が来た`, child: '川が凍った冬、氷の上をすべって遊んだ', adult: '厳しい冬、薪が足りなくなって森へ通い続けた' },
  { kind: 'harvest', p: 0.05, birth: 1.3, text: (k) => `${k}は大豊作。収穫祭は三日三晩続いた`, child: '大豊作の収穫祭で、はじめて夜更かしを許された', adult: '大豊作の年、収穫祭で朝まで踊った' },
  { kind: 'wolves', p: 0.02, mort: 1.1, text: (k) => `${k}で狼の群れが村の近くまで下りてきた`, child: '狼の遠吠えが怖くて、毎晩ふとんをかぶって寝た', adult: '狼の出た冬、夜番に立って松明を振った' },
  { kind: 'comet', p: 0.01, text: () => '尾の長いほうき星が大陸の夜空に現れた', child: 'ほうき星を見て、世界が終わるのかと思った', adult: 'ほうき星の夜、みんなで広場に集まって空を見上げた', global: true },
  { kind: 'troupe', p: 0.03, text: (k) => `旅の一座が${k}を巡業した`, child: '旅の一座の芝居を見て、役者になりたいと思った', adult: '旅の一座の芝居を見て、腹をかかえて笑った' },
  { kind: 'drought', p: 0.02, mort: 1.2, text: (k) => `${k}で日照りが続き、井戸が枯れかけた`, child: '日照りの夏、干上がった川の底を歩いた', adult: '日照りの夏、井戸の水を分け合って暮らした' },
  { kind: 'dragon', p: 0.006, mort: 1.3, text: (k) => `${k}の空にドラゴンが現れ、村をひとつ焼いた`, child: 'ドラゴンが空を横切るのを見て、声も出なかった', adult: 'ドラゴンの襲来で、焼け出された人たちを家に泊めた' },
];
const HERO_DEEDS = [
  '嵐の夜に溺れかけた子どもを川から助けた', '村に初めてりんごの木を植えた', '冬の森で迷った旅人を連れ帰った',
  '狼を棒一本で追い払った', '王都の祭りで歌を披露して褒美をもらった', '三日三晩かけて崩れた橋を架け直した',
  '村の井戸を掘りあてた', '収穫祭の力比べで七年続けて勝った', '流行り病の家に毎日パンを届け続けた', '洞窟のゴブリンの群れを退治した',
];

export function createPersonFactory(ctx) {
  const { rng, people } = ctx;
  const blend = (a, b, sd = 0.17) => clamp(((a + b) / 2) + rng.gauss(0, sd), 0.03, 0.97);
  const rnd = () => clamp(rng.gauss(0.5, 0.2), 0.03, 0.97);
  return function makePerson({ sex, family, birthYear, birthDay, father, mother, given, s, south }) {
    const id = ctx.nextId();
    sex = sex || (rng.chance(0.5) ? 'm' : 'f');
    const both = father && mother;
    const pers = both
      ? { O: blend(father.pers.O, mother.pers.O), C: blend(father.pers.C, mother.pers.C), E: blend(father.pers.E, mother.pers.E), A: blend(father.pers.A, mother.pers.A), N: blend(father.pers.N, mother.pers.N) }
      : { O: rnd(), C: rnd(), E: rnd(), A: rnd(), N: rnd() };
    const values = both
      ? { faith: blend(father.values.faith, mother.values.faith), ambition: rnd(), family: blend(father.values.family, mother.values.family, 0.2), courage: blend(father.values.courage, mother.values.courage, 0.22) }
      : { faith: rnd(), ambition: rnd(), family: rnd(), courage: rnd() };
    const isSouth = south ?? (both ? father.south : false);
    const pool = sex === 'm' ? (isSouth ? SOUTH_MALE : MALE_NAMES) : (isSouth ? SOUTH_FEMALE : FEMALE_NAMES);
    if (!given) {
      const taken = new Set();
      if (father) for (const c of father.children) { const q = people[c]; if (q && q.deathYear == null) taken.add(q.given); }
      let tries = 0;
      do { given = rng.pick(pool); } while (taken.has(given) && tries++ < 20);
    }
    const p = {
      id, given, family, birthFamily: family, sex, birthYear, birthDay: birthDay ?? rng.int(0, DAYS_PER_YEAR - 1),
      deathYear: null, deathCause: null, s: s ?? (father ? father.s : mother ? mother.s : 0), south: isSouth,
      fatherId: father ? father.id : null, motherId: mother ? mother.id : null,
      spouseId: null, exSpouses: [], children: [], pers, values, job: null, rank: null,
      dream: rng.pick(DREAMS), saying: rng.chance(0.45) ? rng.pick(SAYINGS) : null,
      sleepType: rng.chance(0.12) ? 'short' : rng.chance(0.14) ? 'long' : 'normal',
      deeds: [], notes: [], origin: null,
      anc2: [father?.id, mother?.id, father?.fatherId, father?.motherId, mother?.fatherId, mother?.motherId].filter((x) => x != null),
      look: {
        hair: both ? rng.pick([father.look.hair, mother.look.hair]) : rng.pick(isSouth ? HAIR_S : HAIR),
        skin: both ? rng.pick([father.look.skin, mother.look.skin]) : rng.pick(isSouth ? SKIN_S : SKIN),
        shirt: rng.pick(SHIRT), pants: rng.pick(PANTS), hairStyle: rng.int(0, 2), beard: sex === 'm' && rng.chance(0.3),
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

const kinClose = (a, b) => a.id === b.id || a.anc2.includes(b.id) || b.anc2.includes(a.id) || a.anc2.some((x) => b.anc2.includes(x));

export function generateHistory(rng, world) {
  const people = {};
  let nid = 1;
  const ctx = { rng, people, nextId: () => nid++ };
  const makePerson = createPersonFactory(ctx);
  const chronicle = [];
  const S = world.settlements;
  const age = (p, y) => y - p.birthYear;
  let alive = [];
  const refresh = () => { alive = Object.values(people).filter((p) => p.deathYear == null); };
  const kingdoms = KINGDOMS.map((k, i) => ({ id: i, name: k.name, monarchs: [], dynasty: null, nobles: [] }));
  const demonLords = [];

  // --- 建国 ---
  const usedFam = new Set();
  const famFor = (south) => {
    const pool = south ? SOUTH_FAMILIES : FAMILY_NAMES;
    const free = pool.filter((f) => !usedFam.has(f));
    const f = rng.pick(free.length ? free : pool);
    usedFam.add(f);
    return f;
  };
  for (const s of S) {
    const south = KINGDOMS[s.kingdom].south;
    const couples = s.type === 'capital' ? 7 : 3;
    for (let c = 0; c < couples; c++) {
      const fam = famFor(south);
      const h = makePerson({ sex: 'm', family: fam, birthYear: -rng.int(20, 32), s: s.id, south });
      const w = makePerson({ sex: 'f', family: fam, birthYear: -rng.int(18, 28), s: s.id, south });
      w.birthFamily = famFor(south);
      h.spouseId = w.id; w.spouseId = h.id;
      h.job = s.type === 'port' ? 'fisher' : 'farmer'; w.job = h.job;
      h.deeds.push(`${s.name}を開いた開拓者のひとりだった`); w.deeds.push(`夫とともに${s.name}を切り開いた`);
      for (let i = 0; i < rng.int(0, 2); i++) makePerson({ family: fam, birthYear: -rng.int(1, 6), father: h, mother: w });
      if (s.type === 'capital' && c === 0) {
        const k = kingdoms[s.kingdom];
        k.dynasty = fam; k.monarchs.push(h.id); h.monarchOf = s.kingdom; h.reignFrom = 0;
        h.deeds.unshift(`${k.name}を建てた初代国王だった`);
        chronicle.push({ y: 0, k: s.kingdom, text: `${h.given}・${fam}が${k.name}を建国し、初代国王となった` });
      }
      if (s.type === 'capital' && (c === 1 || c === 2)) kingdoms[s.kingdom].nobles.push(fam);
    }
  }
  chronicle.push({ y: 0, text: '大陸暦が始まる。人々はエルデラントの各地に町を開いた' });
  refresh();

  const inKingdom = (p) => S[p.s].kingdom;
  let activeDemon = null;
  let war = null;

  for (let y = 1; y <= HISTORY_YEARS; y++) {
    const mortMul = {}; const birthMul = {};
    for (const k of kingdoms) { mortMul[k.id] = 1; birthMul[k.id] = 1; }

    // 王国ごとの出来事
    for (const k of kingdoms) {
      for (const ev of EVENTS) {
        if (!rng.chance(ev.p / (ev.global ? 3 : 1))) continue;
        mortMul[k.id] *= ev.mort || 1; birthMul[k.id] *= ev.birth || 1;
        chronicle.push({ y, k: k.id, text: ev.text(k.name) });
        for (const p of alive) {
          if (!ev.global && inKingdom(p) !== k.id) continue;
          const a = age(p, y);
          if (a < 3) continue;
          const neg = !['harvest', 'comet', 'troupe'].includes(ev.kind);
          note(p, y, a < 15 ? ev.child : ev.adult, { emo: neg ? -0.5 : 0.6, imp: 0.5, k: 'event' });
        }
        if (ev.kind === 'famine' && rng.chance(0.5)) {
          const hero = rng.pick(alive.filter((p) => inKingdom(p) === k.id && age(p, y) > 30 && age(p, y) < 65));
          if (hero) { hero.deeds.push('凶作の年に自分の倉を開いて人々に麦を分けた'); note(hero, y, '凶作の年、倉を開いてみんなに麦を分けた', { emo: 0.5, imp: 0.8 }); }
        }
        break;
      }
    }

    // 戦争
    if (!war && y > 15 && rng.chance(0.018)) {
      const a = rng.int(0, 2); let b = rng.int(0, 2); if (b === a) b = (a + 1) % 3;
      const reason = rng.pick(['国境の鉱山をめぐって', '王族の婚姻のもつれから', '交易路の通行税をめぐって', '凶作で食糧を奪い合い', '国境の森の領有をめぐって']);
      war = { a, b, from: y, until: y + rng.int(1, 5), name: `${kingdoms[a].name.replace('王国', '')}・${kingdoms[b].name.replace('王国', '')}戦争` };
      chronicle.push({ y, k: a, text: `${reason}、${kingdoms[a].name}と${kingdoms[b].name}の間で「${war.name}」が始まった` });
    }
    if (war) {
      for (const kid of [war.a, war.b]) {
        const young = alive.filter((p) => inKingdom(p) === kid && p.sex === 'm' && age(p, y) >= 17 && age(p, y) <= 35);
        for (const p of rng.shuffle(young).slice(0, rng.int(2, 5))) {
          if (rng.chance(0.4)) die(p, y, 'war');
          else if (!p.notes.some((n) => n.txt.includes(war.name))) {
            note(p, y, `${war.name}に従軍し、なんとか生きて帰った`, { emo: -0.7, imp: 0.9, k: 'war' });
            if (rng.chance(0.2)) p.deeds.push(`${war.name}で武勲を立てた`);
          }
        }
        for (const p of alive) if (inKingdom(p) === kid && age(p, y) >= 5 && age(p, y) < 16 && rng.chance(0.4)) note(p, y, `${war.name}のとき、戦に行く大人たちを見送った`, { emo: -0.5, imp: 0.55, k: 'war' });
      }
      if (y >= war.until) {
        const winner = rng.chance(0.5) ? war.a : war.b;
        chronicle.push({ y, k: winner, text: `「${war.name}」が終わり、${kingdoms[winner].name}が有利な和平を結んだ` });
        war = null;
      }
    }

    // 魔王
    if (!activeDemon && (y === 64 || y === 181 || (y > 90 && y < 250 && rng.chance(0.004) && demonLords.length < 2))) {
      const gen = demonLords.length + 1;
      activeDemon = { name: `魔王${DEMON_NAMES[gen - 1]}`, gen, from: y, until: y + rng.int(4, 11) };
      demonLords.push(activeDemon);
      chronicle.push({ y, text: `第${gen}代${activeDemon.name}が魔界ネクロスに現れ、大陸に魔物があふれ出した` });
    }
    if (activeDemon) {
      for (const k of kingdoms) mortMul[k.id] *= 1.25;
      for (const p of alive) if (age(p, y) >= 4 && rng.chance(0.15) && !p.notes.some((n) => n.txt.includes(activeDemon.name))) note(p, y, `${activeDemon.name}の軍勢が近くの村を襲ったと聞いて震えた`, { emo: -0.7, imp: 0.6, k: 'demon' });
      if (rng.chance(0.25)) {
        const village = rng.pick(S.filter((s) => s.type !== 'capital'));
        chronicle.push({ y, k: village.kingdom, text: `魔王軍が${village.name}を襲った` });
        for (const p of alive.filter((q) => q.s === village.id)) {
          if (rng.chance(0.08)) die(p, y, 'demon');
          else if (age(p, y) >= 3) note(p, y, `魔王軍が${village.name}を襲った夜、納屋に隠れて生き延びた`, { emo: -0.9, imp: 0.9, k: 'demon' });
        }
      }
      if (y >= activeDemon.until) {
        const cands = alive.filter((p) => age(p, y) >= 18 && age(p, y) <= 40 && p.values.courage > 0.55);
        const hero = rng.weighted(cands, (p) => p.values.courage);
        if (hero) {
          hero.deeds.unshift(`${activeDemon.name}を討ち果たした勇者だった`);
          hero.hero = activeDemon.name;
          note(hero, y, `仲間とともに魔界へ乗り込み、${activeDemon.name}を討ち果たした`, { emo: 0.9, imp: 1, k: 'hero' });
          chronicle.push({ y, k: inKingdom(hero), text: `勇者${hero.given}・${hero.family}が${activeDemon.name}を討ち果たした` });
          activeDemon.slayer = hero.id;
          for (const p of alive) if (p !== hero && age(p, y) >= 4) note(p, y, `勇者${hero.given}が${activeDemon.name}を討ったという知らせに、みんなで泣いて喜んだ`, { emo: 0.9, imp: 0.7, k: 'hero' });
        }
        activeDemon = null;
      }
    }

    // 死
    for (const p of alive) {
      if (p.deathYear != null) continue;
      const a = age(p, y), k = inKingdom(p);
      if (rng.chance(mortality(a) * (a < 5 || a > 60 ? mortMul[k] : 1 + (mortMul[k] - 1) * 0.5))) {
        let cause = a >= 72 ? 'old' : a < 2 ? 'infant' : rng.pick(['sick', 'sick', 'winter', 'accident', 'lake', 'beast']);
        if (mortMul[k] > 2) cause = 'sick';
        die(p, y, cause);
      }
    }
    refresh();

    // 仕事
    for (const p of alive) {
      if (p.job || age(p, y) < 14) continue;
      const father = people[p.fatherId], mother = people[p.motherId];
      const st = S[p.s].type;
      const quota = JOB_QUOTA[st];
      const cnt = {};
      for (const q of alive) if (q.s === p.s && q.job) cnt[q.job] = (cnt[q.job] || 0) + 1;
      const lacking = Object.keys(quota).filter((j) => (cnt[j] || 0) < quota[j] && !['king', 'noble', 'thief', 'beggar'].includes(j));
      if (father && father.job && !['king', 'royal'].includes(father.job) && rng.chance(0.55)) p.job = father.job;
      else if (lacking.length && rng.chance(0.6)) p.job = rng.pick(lacking);
      else p.job = st === 'port' ? rng.pick(['fisher', 'sailor', 'farmer']) : 'farmer';
      const par = father && father.job === p.job ? father : mother && mother.job === p.job ? mother : null;
      note(p, y, par ? `14歳で${kinTerm(people, p, par)}のもとで${JOBS[p.job].name}の修業を始めた` : `14歳で${JOBS[p.job].name}の見習いになった`, { imp: 0.45, emo: 0.2 });
    }

    // 偉業
    for (const p of alive) {
      const a = age(p, y);
      if (a > 22 && a < 60 && rng.chance(0.003)) {
        const d = rng.pick(HERO_DEEDS);
        if (!p.deeds.includes(d)) { p.deeds.push(d); note(p, y, d, { emo: 0.6, imp: 0.85 }); }
      }
    }

    // 結婚
    const singles = alive.filter((p) => p.spouseId == null && age(p, y) >= 17 && age(p, y) <= 40);
    const women = rng.shuffle(singles.filter((p) => p.sex === 'f'));
    const men = singles.filter((p) => p.sex === 'm');
    for (const w of women) {
      if (!rng.chance(0.3)) continue;
      const sameTown = rng.chance(0.82);
      const cands = men.filter((m) => m.spouseId == null && (sameTown ? m.s === w.s : S[m.s].kingdom === S[w.s].kingdom) && Math.abs(age(m, y) - age(w, y)) <= 10 && !kinClose(m, w));
      if (!cands.length) continue;
      const m = rng.weighted(cands, (c) => 1 + (1 - Math.abs(c.pers.E - w.pers.E)) + (1 - Math.abs(c.pers.O - w.pers.O)));
      marry(m, w, y);
    }

    // 誕生
    const popBy = {};
    for (const p of alive) popBy[p.s] = (popBy[p.s] || 0) + 1;
    for (const w of alive) {
      if (w.sex !== 'f' || w.spouseId == null) continue;
      const h = people[w.spouseId];
      if (!h || h.deathYear != null) continue;
      const a = age(w, y);
      if (a < 18 || a > 42 || w.children.length >= 7) continue;
      const tgt = TARGET[S[w.s].type];
      const popF = clamp(1.7 - (popBy[w.s] || 0) / tgt, 0.06, 1.5);
      if (rng.chance(0.3 * popF * birthMul[S[w.s].kingdom])) birth(h, w, y);
    }

    // 移住者
    for (const s of S) {
      const pop = popBy[s.id] || 0;
      if ((pop < TARGET[s.type] * 0.6 && rng.chance(0.5)) || rng.chance(0.02)) {
        const south = KINGDOMS[s.kingdom].south;
        const fam = famFor(south);
        const origin = rng.pick(ORIGINS);
        const a = makePerson({ family: fam, birthYear: y - rng.int(18, 30), s: s.id, south });
        a.origin = origin; a.job = s.type === 'port' ? 'sailor' : 'farmer';
        note(a, y, `${origin}から${s.name}に移り住んだ`, { emo: 0.3, imp: 0.85, k: 'arrival' });
        a.deeds.push(`${origin}から${s.name}にやってきた`);
        if (rng.chance(0.45)) {
          const b = makePerson({ sex: a.sex === 'm' ? 'f' : 'm', family: fam, birthYear: y - rng.int(18, 30), s: s.id, south });
          b.origin = origin; b.job = a.job;
          if (a.sex === 'm') marry(a, b, y - rng.int(0, 3), true); else marry(b, a, y - rng.int(0, 3), true);
          note(b, y, `連れ合いと一緒に${origin}から${s.name}に移り住んだ`, { emo: 0.3, imp: 0.85, k: 'arrival' });
        }
      }
    }
    refresh();

    // 王位の継承
    for (const k of kingdoms) {
      const cur = people[k.monarchs[k.monarchs.length - 1]];
      if (cur && cur.deathYear == null) continue;
      let heir = null;
      if (cur) {
        const kids = cur.children.map((id) => people[id]).filter((c) => c.deathYear == null && age(c, y) >= 14).sort((a, b) => a.birthYear - b.birthYear || (a.sex === 'm' ? -1 : 1));
        heir = kids[0];
        if (!heir) {
          const sp = people[cur.spouseId] || people[cur.exSpouses[cur.exSpouses.length - 1]];
          if (sp && sp.deathYear == null && k.monarchs.length && !sp.monarchOf) heir = null;
          const sib = cur.fatherId != null ? people[cur.fatherId].children.map((id) => people[id]).filter((c) => c.deathYear == null && age(c, y) >= 16) : [];
          heir = sib[0] || alive.find((p) => p.family === k.dynasty && p.s === S.find((s) => s.type === 'capital' && s.kingdom === k.id).id && age(p, y) >= 16);
        }
      }
      if (!heir) {
        const cap = S.find((s) => s.type === 'capital' && s.kingdom === k.id);
        heir = rng.weighted(alive.filter((p) => p.s === cap.id && age(p, y) >= 25 && age(p, y) <= 60), (p) => (k.nobles.includes(p.family) ? 5 : 1) + p.values.ambition);
        if (heir) {
          chronicle.push({ y, k: k.id, text: `${k.dynasty}王家の血が絶え、${heir.family}家の${heir.given}が王位について新たな王朝を開いた` });
          if (k.dynasty) k.nobles.push(k.dynasty);
          k.dynasty = heir.family;
          k.nobles = k.nobles.filter((f) => f !== heir.family);
        }
      }
      if (heir) {
        k.monarchs.push(heir.id); heir.monarchOf = k.id; heir.reignFrom = y;
        const n = k.monarchs.length;
        const title = heir.sex === 'f' ? '女王' : '国王';
        if (k.dynasty !== heir.family) { k.nobles = k.nobles.filter((f) => f !== heir.family); k.dynasty = heir.family; }
        heir.deeds.unshift(`${k.name}の第${n}代${title}だった`);
        note(heir, y, `${k.name}の第${n}代${title}に即位した`, { emo: 0.6, imp: 1, k: 'crown' });
        chronicle.push({ y, k: k.id, text: `${heir.given}・${heir.family}が${k.name}の第${n}代${title}に即位した` });
        for (const p of alive) if (inKingdom(p) === k.id && age(p, y) >= 6 && rng.chance(0.3)) note(p, y, `新しい${title}${heir.given}さまの戴冠式の話でもちきりだった`, { emo: 0.4, imp: 0.4, k: 'crown' });
      }
    }
  }

  function die(p, y, cause) {
    p.deathYear = y; p.deathCause = cause;
    const a = age(p, y);
    if (p.job && a > 20 && JOBS[p.job] && !['king', 'royal', 'noble', 'thief', 'beggar'].includes(p.job)) p.deeds.unshift(`腕のいい${JOBS[p.job].name}だった`);
    if (p.children.length >= 4) p.deeds.push(`${p.children.length}人の子を育てた`);
    if (cause === 'war') p.deeds.push('戦で命を落とした');
    const closeT = ['父', '母', '夫', '妻', '息子', '娘', '兄', '弟', '姉', '妹', '祖父', '祖母'];
    for (const q of alive) {
      if (q.deathYear != null || age(q, y) < 3) continue;
      if (!(q.anc2.includes(p.id) || p.anc2.includes(q.id) || q.spouseId === p.id || (q.fatherId != null && q.fatherId === p.fatherId))) continue;
      const term = kinTerm(people, q, p);
      if (!term || !closeT.includes(term)) continue;
      note(q, y, `${term}の${p.given}が${({ old: '老衰', sick: '流行り病', winter: '冬の寒さ', accident: '事故', lake: '水の事故', infant: '幼い病', war: '戦', demon: '魔王軍の襲撃', beast: '獣に襲われて', birth: 'お産' })[cause] || '病'}で亡くなった`.replace('獣に襲われてで', '獣に襲われて'), { emo: -0.85, imp: term === '祖父' || term === '祖母' ? 0.6 : 0.9, about: [p.id], k: 'death' });
    }
    if (p.spouseId != null) { const sp = people[p.spouseId]; if (sp) { sp.exSpouses.push(p.id); sp.spouseId = null; } }
  }
  function marry(m, w, y, quiet) {
    m.spouseId = w.id; w.spouseId = m.id;
    w.family = m.family;
    if (w.s !== m.s) { note(w, y, `${S[m.s].name}へ嫁いだ`, { emo: 0.4, imp: 0.7 }); w.s = m.s; }
    if (!quiet) {
      note(m, y, `${w.given}と結婚した`, { emo: 0.85, imp: 0.95, about: [w.id], k: 'marriage' });
      note(w, y, `${m.given}と結婚した`, { emo: 0.85, imp: 0.95, about: [m.id], k: 'marriage' });
    }
  }
  function birth(h, w, y) {
    const sex = rng.chance(0.5) ? 'm' : 'f';
    let given = null, namesake = null;
    const grand = [h.fatherId, h.motherId, w.fatherId, w.motherId].map((id) => people[id]).filter((g) => g && g.deathYear != null && g.sex === sex);
    if (grand.length && rng.chance(0.28)) { namesake = rng.pick(grand); given = namesake.given; }
    const c = makePerson({ sex, family: h.family, birthYear: y, father: h, mother: w, given, s: h.s });
    if (namesake) note(c, y, `亡くなった${kinTerm(people, c, namesake)}の${namesake.given}の名前をもらって生まれた`, { imp: 0.5, emo: 0.3, about: [namesake.id], k: 'birth' });
    for (const par of [h, w]) note(par, y, `${sex === 'm' ? '息子' : '娘'}の${c.given}が生まれた`, { emo: 0.9, imp: 0.9, about: [c.id], k: 'child' });
    if (rng.chance(0.012)) die(w, y, 'birth');
  }

  // --- 現在の身分と職業 ---
  refresh();
  const Y = HISTORY_YEARS;
  for (const p of alive) if (p.birthYear >= Y) p.birthDay = 0;
  for (const k of kingdoms) {
    const king = people[k.monarchs[k.monarchs.length - 1]];
    const capId = S.find((s) => s.type === 'capital' && s.kingdom === k.id).id;
    if (king && king.deathYear == null) {
      king.job = 'king'; king.rank = 'king'; king.s = capId;
      const sibs = king.fatherId != null ? people[king.fatherId].children.filter((id) => people[id].spouseId == null) : [];
      const royals = new Set([king.spouseId, ...king.children, ...sibs]);
      for (const c of king.children) for (const g of people[c].children) royals.add(g);
      for (const id of royals) {
        const q = people[id];
        if (!q || q.deathYear != null || q.id === king.id) continue;
        q.rank = 'royal'; q.job = 'royal'; q.s = capId;
      }
    }
    // 貴族は各家の本家筋だけ（最大8人）
    // 貴族の家が絶えていたら、有力な家に爵位を与える
    const capPeople = alive.filter((p) => p.s === capId && !p.rank && p.family !== k.dynasty);
    const aliveNobleFams = new Set(capPeople.filter((p) => k.nobles.includes(p.family)).map((p) => p.family));
    if (aliveNobleFams.size < 2) {
      const famCount = {};
      for (const p of capPeople) famCount[p.family] = (famCount[p.family] || 0) + 1;
      const top = Object.entries(famCount).filter(([f]) => !aliveNobleFams.has(f)).sort((a, b) => b[1] - a[1]).slice(0, 2 - aliveNobleFams.size);
      for (const [f] of top) {
        k.nobles.push(f);
        const y0 = Y - rng.int(20, 90);
        chronicle.push({ y: y0, k: k.id, text: `${f}家が王家への長年の奉仕により爵位を授けられた` });
      }
    }
    const nobleCands = alive.filter((p) => p.s === capId && k.nobles.includes(p.family) && !p.rank).sort((a, b) => a.birthYear - b.birthYear);
    const nobleHouses = new Set();
    let nCount = 0;
    for (const p of nobleCands) {
      if (nCount >= 8) break;
      const head = !nobleHouses.has(p.family);
      const kin = nobleCands.some((q) => q.rank === 'noble' && (q.spouseId === p.id || q.children.includes(p.id)));
      if (!head && !kin) continue;
      nobleHouses.add(p.family);
      p.rank = 'noble'; nCount++;
      if (age(p, Y) >= 16) p.job = 'noble';
    }
  }
  // 町ごとの職業の割り当て
  for (const s of S) {
    const quota = JOB_QUOTA[s.type];
    const residents = alive.filter((p) => p.s === s.id);
    const adults = residents.filter((p) => age(p, Y) >= 16 && age(p, Y) <= 66 && !p.rank);
    const cnt = {};
    for (const p of adults) if (p.job) cnt[p.job] = (cnt[p.job] || 0) + 1;
    for (const [job, n] of Object.entries(quota)) {
      if (job === 'king' || job === 'noble') continue;
      while ((cnt[job] || 0) < n) {
        let pool = adults.filter((p) => p.job !== job && (!p.job || p.job === 'farmer' || p.job === 'fisher' || p.job === 'sailor') && (cnt[p.job] || 0) > (quota[p.job] || 0) - (p.job === 'farmer' ? 0 : 0));
        if (job === 'thief' || job === 'beggar') pool = pool.filter((p) => p.pers.A < 0.5 || p.pers.C < 0.4);
        if (!pool.length) pool = adults.filter((p) => p.job !== job && !['king', 'royal', 'noble'].includes(p.job) && (!p.job || (cnt[p.job] || 0) > (quota[p.job] || 0)));
        if (!pool.length) break;
        const p = rng.weighted(pool, (q) => ({
          priest: q.values.faith, wizard: q.pers.O, scholar: q.pers.O + q.pers.C, knight: q.values.courage * 2, soldier: q.values.courage,
          adventurer: q.values.courage + q.pers.O, thief: 1 - q.pers.A, beggar: 1 - q.pers.C, elder: age(q, Y) / 40,
          doctor: q.pers.C + q.pers.A, teacher: q.pers.A + q.pers.O, jester: q.pers.E * 2, musician: q.pers.E + q.pers.O, dancer: q.pers.E * 2, fortune: q.pers.O * 2,
          painter: q.pers.O * 2, general: q.values.courage * 3 + age(q, Y) / 40, royalguard: q.values.courage * 2, pickpocket: 1 - q.pers.A, swindler: (1 - q.pers.A) + q.pers.E,
          pirate: (1 - q.pers.A) + q.values.courage, storyteller: age(q, Y) / 20, chancellor: q.pers.C + q.pers.O + age(q, Y) / 50, treasurer: q.pers.C * 2, paladin: q.values.faith + q.values.courage,
          cleric: q.values.faith * 2, nun: q.values.faith * 2, midwife: q.sex === 'f' ? 2 : 0.05, maid: q.sex === 'f' ? 2 : 0.1, nanny: q.sex === 'f' ? 2 : 0.1, laundress: q.sex === 'f' ? 2 : 0.2,
        }[job] ?? 1) + 0.05);
        if (p.job) cnt[p.job]--;
        p.job = job; cnt[job] = (cnt[job] || 0) + 1;
        const flavor = {
          thief: '食うに困って、人の物に手を出すようになった', beggar: '仕事も家も失い、路上で暮らすようになった', knight: '騎士に叙任された',
          adventurer: '冒険者ギルドに登録した', wizard: '魔法の塔の門をたたいた', scholar: '学術院で学者として認められた', elder: '寄り合いで村長に選ばれた',
        }[job] || `${JOBS[job].name}の仕事についた`;
        note(p, Y - rng.int(1, 8), flavor, { imp: 0.75, emo: job === 'thief' || job === 'beggar' ? -0.6 : 0.5 });
      }
    }
    for (const p of residents) {
      if (!p.job && age(p, Y) >= 14) p.job = s.type === 'port' ? 'fisher' : 'farmer';
      if (!p.rank) p.rank = p.job ? JOBS[p.job].rank : null;
    }
  }
  // 子どもの身分は親に合わせる
  for (const p of alive) {
    if (p.rank) continue;
    const par = [people[p.fatherId], people[p.motherId]].filter(Boolean);
    const r = par.map((q) => q.rank).find((x) => x) || (S[p.s].type === 'capital' ? 'citizen' : 'commoner');
    p.rank = ['thief', 'beggar'].includes(par[0]?.job) ? 'commoner' : r === 'king' ? 'royal' : r === 'outlaw' || r === 'homeless' ? 'commoner' : r;
  }
  for (const p of alive) if (p.job === 'beggar') p.rank = 'homeless';
  for (const p of alive) if (p.job === 'thief') p.rank = 'citizen';

  // 放浪者・吟遊詩人（町に属さない）
  for (let i = 0; i < 5; i++) {
    const south = rng.chance(0.3);
    const w = makePerson({ family: famFor(south), birthYear: Y - rng.int(20, 55), s: rng.int(0, S.length - 1), south });
    w.job = i < 2 ? 'bard' : 'wanderer'; w.rank = 'wanderer'; w.origin = rng.pick(ORIGINS); w.homeless = true;
    note(w, Y - rng.int(2, 15), `${w.origin}を出て、あてのない旅を始めた`, { emo: 0.3, imp: 0.9 });
  }
  // 盗賊団（アジトに住む）
  const hideouts = world.buildings.filter((b) => b.type === 'hideout');
  for (const h of hideouts) {
    const n = rng.int(3, 4);
    for (let i = 0; i < n; i++) {
      const b = makePerson({ sex: rng.chance(0.8) ? 'm' : 'f', family: famFor(false), birthYear: Y - rng.int(19, 45), s: S.reduce((best, s) => (Math.hypot(s.x - h.x, s.z - h.z) < Math.hypot(best.x - h.x, best.z - h.z) ? s : best), S[0]).id });
      b.pers.A = Math.min(b.pers.A, 0.3); b.values.courage = Math.max(b.values.courage, 0.6);
      b.job = i === 0 ? 'banditchief' : 'thief'; b.rank = 'outlaw'; b.hideout = h.id; b.bandit = true; b.origin = rng.pick(ORIGINS);
      if (i === 0) { b.values.courage = 0.85; b.pers.E = Math.max(b.pers.E, 0.6); }
      note(b, Y - rng.int(1, 10), rng.pick(['故郷で罪を犯し、森の盗賊団に加わった', '借金取りから逃げて、盗賊の仲間になった', '兵隊くずれで、仲間と街道を荒らすようになった']), { emo: -0.3, imp: 0.9 });
    }
  }
  // 囚人
  for (const k of kingdoms) {
    const cap = S.find((s) => s.type === 'capital' && s.kingdom === k.id);
    const cands = alive.filter((p) => p.s === cap.id && age(p, Y) > 18 && p.pers.A < 0.45 && !['king', 'royal', 'noble'].includes(p.rank));
    for (const p of rng.shuffle(cands).slice(0, 2)) {
      p.prisonDays = rng.int(8, 40); p.rank = 'prisoner'; p.crime = rng.pick(['盗み', '酒場での乱闘', '密輸', '詐欺']);
      note(p, Y, `${p.crime}の罪で捕まり、牢獄に入れられた`, { emo: -0.9, imp: 0.95, k: 'crime' });
    }
  }

  // 今の魔王（復活の兆し）
  const lastSlain = demonLords.filter((d) => d.slayer);
  const currentDemon = { name: `魔王${DEMON_NAMES[demonLords.length]}`, gen: demonLords.length + 1 };
  chronicle.push({ y: Y - 1, text: '魔界ネクロスの空が赤く染まり、新たな魔王の目覚めを告げる噂が広まった' });

  return { people, chronicle, nextId: nid, currentYear: Y, kingdoms, demonLords, currentDemon, lastSlain };
}
