// 世界のシミュレーション：時間・欲求・行動・経済・人生の出来事・会話
import { makeRng, clamp } from './rng.js';
import { JOBS, GOODS, DAYS_PER_YEAR, DAYS_PER_SEASON, SEASONS, DEATH_CAUSES, ERA, VILLAGE, traitLabels } from './data.js';
import { generateHistory, createPersonFactory } from './history.js';
import { generateWorld, T, tileAt } from './world.js';
import { findPath } from './path.js';
import { ancestors, kinTerm, isCloseKin, siblings } from './kin.js';
import { composeConversation, innerThought, speechStyle } from './speech.js';

const SAVE_KEY = 'lindenberg-save-v1';
const MORT_Y = [[0, 0.04], [4, 0.008], [14, 0.002], [39, 0.003], [54, 0.007], [64, 0.02], [74, 0.05], [84, 0.12], [999, 0.28]];
const mortY = (a) => { for (const [x, p] of MORT_Y) if (a <= x) return p; return 0.3; };
const CHILD_PLAY = ['リンデンの木に登って叱られた', '湖で泳いで溺れかけた', '収穫祭の夜にこっそり抜け出して星を見た', '鐘楼にこっそり忍び込んだ', '森で迷子になって一晩過ごした', '司祭さまのりんごを盗んで食べた', '雪合戦で役場の窓を割った', '湖のほとりで秘密の基地を作った'];
const CHILD_FIGHT = ['取っ組み合いのけんかをした', '収穫祭の力比べで本気でやり合った'];

export class Sim {
  constructor() {
    this.events = [];
    this._anc = new Map();
    this._kin = new Map();
  }

  // ---------- 初期化 ----------
  newWorld(seed = (Math.random() * 1e9) | 0) {
    const rng = makeRng(seed);
    this.rng = rng;
    const hist = generateHistory(rng);
    const S = {
      version: 1, seed, t: 6 * 60, startYear: hist.currentYear, people: hist.people, nextId: hist.nextId,
      chronicle: hist.chronicle, households: {}, nextHh: 1, market: null, weather: 'sunny', harvest: 1,
      gatherings: [], log: [], gossipSeq: 1, fund: 300, pendingWeddings: [], stats: { births: 0, deaths: 0, weddings: 0 },
    };
    this.S = S;
    this.formHouseholds();
    S.world = generateWorld(rng, Object.keys(S.households).length + 4);
    this.assignHouses();
    this.initMarket();
    this.initLiving();
    this.pushLog(`${ERA}${this.year()}年 春。${VILLAGE}村の一日が始まる。`, 'event');
    return this;
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 1) return false;
      this.S = data;
      this.rng = makeRng(data.seed);
      this.rng.state = data.rngState;
      for (const p of this.living()) { p.talk = null; if (p.action) p.action.phase = p.action.phase === 'walk' ? 'walk' : 'do'; }
      return true;
    } catch (e) { return false; }
  }
  save() {
    try {
      this.S.rngState = this.rng.state;
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.S));
      return true;
    } catch (e) { return false; }
  }
  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 保存できない環境 */ } }

  // ---------- 時間 ----------
  get dayIndex() { return Math.floor(this.S.t / 1440); }
  get today() { return this.dayIndex; }
  year() { return this.S.startYear + Math.floor(this.dayIndex / DAYS_PER_YEAR); }
  dayOfYear() { return this.dayIndex % DAYS_PER_YEAR; }
  seasonIdx() { return Math.floor(this.dayOfYear() / DAYS_PER_SEASON); }
  season() { return SEASONS[this.seasonIdx()]; }
  hour() { return (this.S.t % 1440) / 60; }
  isRestDay() { return this.dayIndex % 7 === 6; }
  isFestival() { return this.dayOfYear() === DAYS_PER_SEASON * 3 - 1; }
  dateLabel() {
    const h = Math.floor(this.hour()), m = Math.floor(this.S.t % 60);
    return { era: `${ERA}${this.year()}年`, season: this.season(), day: (this.dayOfYear() % DAYS_PER_SEASON) + 1, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }

  // ---------- 人 ----------
  person(id) { return this.S.people[id]; }
  weather() { return this.S.weather; }
  chronicle() { return this.S.chronicle; }
  living() { return Object.values(this.S.people).filter((p) => p.deathYear == null); }
  ageOf(p) {
    if (p.deathYear != null) return p.deathYear - p.birthYear;
    return this.year() - p.birthYear - (this.dayOfYear() < p.birthDay ? 1 : 0);
  }
  ancestors(p) {
    let a = this._anc.get(p.id);
    if (!a) { a = ancestors(this.S.people, p, 8); this._anc.set(p.id, a); }
    return a;
  }
  kinTerm(a, b) {
    const k = a.id + ':' + b.id;
    if (!this._kin.has(k)) this._kin.set(k, kinTerm(this.S.people, a, b));
    return this._kin.get(k);
  }
  isKin(a, b) { return isCloseKin(this.S.people, a, b); }
  hh(p) { return this.S.households[p.hh]; }
  householdMoney(p) { return this.hh(p)?.money ?? 0; }
  fullName(p) { return `${p.given}・${p.family}`; }

  // ---------- 世帯 ----------
  formHouseholds() {
    const S = this.S, P = S.people, Y = S.startYear;
    const alive = this.living();
    const assigned = new Map();
    const newHh = (members) => {
      const id = S.nextHh++;
      S.households[id] = { id, members: [], house: null, money: 0, food: 0, comfort: 0, name: '' };
      for (const m of members) { S.households[id].members.push(m.id); assigned.set(m.id, id); m.hh = id; }
      return id;
    };
    const join = (p, id) => { S.households[id].members.push(p.id); assigned.set(p.id, id); p.hh = id; };
    // 夫婦と未婚の子
    for (const p of alive) {
      if (assigned.has(p.id) || p.sex !== 'm' || p.spouseId == null) continue;
      const w = P[p.spouseId];
      if (!w || w.deathYear != null) continue;
      const id = newHh([p, w]);
      for (const cid of new Set([...p.children, ...w.children])) {
        const c = P[cid];
        if (c && c.deathYear == null && c.spouseId == null && !assigned.has(c.id)) join(c, id);
      }
    }
    // 残り
    const rest = alive.filter((p) => !assigned.has(p.id)).sort((a, b) => a.birthYear - b.birthYear);
    for (const p of rest) {
      if (assigned.has(p.id)) continue;
      const age = Y - p.birthYear;
      const par = [P[p.fatherId], P[p.motherId]].find((q) => q && assigned.has(q.id));
      if (par && p.spouseId == null) { join(p, assigned.get(par.id)); continue; }
      const kid = p.children.map((c) => P[c]).find((c) => c && c.deathYear == null && assigned.has(c.id));
      if (age >= 60 && kid) { join(p, assigned.get(kid.id)); continue; }
      if (age < 16) {
        const kin = [...ancestors(P, p, 3).keys()].map((id) => P[id]).find((q) => q && assigned.has(q.id))
          || siblings(P, p).find((q) => q.deathYear == null && assigned.has(q.id));
        if (kin) { join(p, assigned.get(kin.id)); continue; }
      }
      const id = newHh([p]);
      // その人の未婚の子どもも一緒に
      for (const cid of p.children) { const c = P[cid]; if (c && c.deathYear == null && c.spouseId == null && !assigned.has(c.id)) join(c, id); }
    }
    // 子どもだけの世帯は他の世帯に吸収
    for (const hh of Object.values(S.households)) {
      if (hh.members.every((id) => Y - P[id].birthYear < 16)) {
        const target = Object.values(S.households).find((h) => h !== hh && h.members.length);
        for (const id of hh.members) join(P[id], target.id);
        delete S.households[hh.id];
      }
    }
    for (const hh of Object.values(S.households)) {
      const head = hh.members.map((id) => P[id]).sort((a, b) => (a.sex === 'm' ? -1 : 1) - (b.sex === 'm' ? -1 : 1) || a.birthYear - b.birthYear)[0];
      hh.name = `${head.family}家`;
      hh.money = Math.round(this.rng.range(60, 180) + (head.job === 'merchant' ? 150 : 0));
      hh.food = hh.members.length * 4;
    }
  }

  assignHouses() {
    const S = this.S;
    const houses = S.world.houses.slice();
    const hhs = Object.values(S.households);
    hhs.forEach((hh, i) => {
      const bid = houses[i];
      if (bid == null) return;
      hh.house = bid;
      const b = this.building(bid);
      b.hh = hh.id; b.name = hh.name;
    });
    // 家が足りない世帯は他の世帯に同居
    for (const hh of hhs) if (hh.house == null) {
      const host = hhs.find((h) => h.house != null);
      for (const id of hh.members) { host.members.push(id); S.people[id].hh = host.id; }
      host.money += hh.money; host.food += hh.food;
      delete S.households[hh.id];
    }
  }
  building(id) { return this.S.world.buildings.find((b) => b.id === id); }
  buildingOfType(type) { return this.S.world.buildings.find((b) => b.type === type); }

  initMarket() {
    const stock = {}, price = {};
    for (const [k, g] of Object.entries(GOODS)) { stock[k] = g.target; price[k] = g.base; }
    this.S.market = { stock, price, commission: 0, history: [] };
  }

  initLiving() {
    const S = this.S, R = this.rng, Y = S.startYear;
    const alive = this.living();
    for (const p of alive) {
      p.needs = { hunger: R.range(55, 90), energy: R.range(60, 95), social: R.range(40, 90), fun: R.range(40, 90) };
      p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {};
      p.tool = R.range(0.3, 1); p.workedToday = 0; p.pregnant = 0; p.cooldown = 0;
      p.style = speechStyle(p, this.ageOf(p));
      p.traits = traitLabels(p);
      if (this.ageOf(p) >= 68 && p.job) { p.formerJob = p.job; p.job = null; }
      const home = this.building(this.hh(p).house);
      p.pos = { x: home.door.x, z: home.door.z }; p.inside = home.id; p.path = []; p.action = null;
      // 歴史のメモを記憶に
      for (const n of p.notes) {
        const t = Math.min(-1, (n.y - Y) * DAYS_PER_YEAR - R.int(1, DAYS_PER_YEAR - 1));
        p.memories.push({ t, txt: n.txt, emo: n.emo, imp: n.imp, about: n.about, k: n.k, src: 'self', ageAt: n.y - p.birthYear });
      }
      // 祖先の話
      for (const [id, d] of this.ancestors(p)) {
        const a = S.people[id];
        if (d < 2 || d > 4 || !a.deeds.length || !R.chance(0.5)) continue;
        const term = this.kinTerm(p, a) || 'ご先祖';
        p.memories.push({ t: -(this.ageOf(p) - R.int(4, 10)) * DAYS_PER_YEAR, txt: `${term}の${a.given}は${R.pick(a.deeds)}と聞かされて育った`, emo: 0.3, imp: 0.4, about: [a.id], k: 'story', src: 'story', ageAt: R.int(4, 10) });
      }
    }
    // 人間関係
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const compat = 1 - (Math.abs(a.pers.E - b.pers.E) + Math.abs(a.pers.A - b.pers.A) + Math.abs(a.pers.O - b.pers.O) + Math.abs(a.values.faith - b.values.faith)) / 4;
      const base = (compat - 0.55) * 60 + (a.pers.A + b.pers.A - 1) * 15;
      let fa = 20, aa = base + R.gauss(0, 10), ab = base + R.gauss(0, 10);
      if (a.hh === b.hh) fa = 95;
      const kin = this.kinTerm(a, b);
      if (kin) {
        fa = Math.max(fa, 65);
        const bonus = ['夫', '妻'].includes(kin) ? R.gauss(55, 25) : ['父', '母', '息子', '娘'].includes(kin) ? R.gauss(45, 20) : ['兄', '弟', '姉', '妹'].includes(kin) ? R.gauss(30, 25) : R.gauss(20, 12);
        aa += bonus; ab += bonus;
      }
      const ageA = this.ageOf(a), ageB = this.ageOf(b);
      // 幼なじみ
      const bothGrewUp = !a.origin && !b.origin && Math.abs(ageA - ageB) <= 3 && Math.min(ageA, ageB) >= 7 && !kin;
      if (bothGrewUp && R.chance(0.09)) {
        const sh = R.pick(CHILD_PLAY), ageAt = R.int(6, Math.min(12, Math.min(ageA, ageB)));
        aa += 40; ab += 40; fa = Math.max(fa, 75);
        this.sharedMemory(a, b, sh, ageAt, 0.6, 0.6);
      } else if (bothGrewUp && R.chance(0.035)) {
        const sh = R.pick(CHILD_FIGHT), ageAt = R.int(8, Math.min(13, Math.min(ageA, ageB)));
        aa -= 35; ab -= 35; fa = Math.max(fa, 60);
        this.sharedMemory(a, b, sh, ageAt, -0.4, 0.55);
      }
      a.rel[b.id] = { a: clamp(aa, -100, 100), f: fa };
      b.rel[a.id] = { a: clamp(ab, -100, 100), f: fa };
    }
    // ご近所
    for (const p of alive) {
      const h = this.building(this.hh(p).house);
      for (const q of alive) {
        if (q.hh === p.hh) continue;
        const h2 = this.building(this.hh(q).house);
        if (Math.abs(h.x - h2.x) + Math.abs(h.z - h2.z) < 8) { p.rel[q.id].f = Math.max(p.rel[q.id].f, 55); p.rel[q.id].a += 6; }
      }
    }
    // 今年の出来事を噂の種に
    for (const p of alive) {
      const recent = p.memories.filter((m) => m.t > -DAYS_PER_YEAR && ['child', 'marriage', 'death'].includes(m.k));
      for (const m of recent) {
        const pred = m.k === 'child' ? m.txt.replace(/^.*の(.+)が生まれた$/, '$1という子を授かった') : m.k === 'marriage' ? m.txt.replace('と礼拝堂で結婚した', 'と結婚した') : m.txt.replace(/^.+?の/, '身内の');
        if (m.k === 'death') continue;
        this.gossip(p, pred, m.emo, alive.filter((q) => q.hh !== p.hh && R.chance(0.35)), { t: this.today - R.int(1, 8), congrat: m.k === 'child' ? '赤ちゃんが生まれたんだってね' : '結婚したんだってね', silent: true });
      }
    }
    for (const p of alive) { this.trimMemories(p); delete p.notes; }
    for (const p of Object.values(S.people)) if (p.deathYear != null) delete p.notes;
  }

  sharedMemory(a, b, sh, ageAt, emo, imp) {
    for (const [x, y] of [[a, b], [b, a]]) {
      x.memories.push({ t: -(this.ageOf(x) - ageAt) * DAYS_PER_YEAR - this.rng.int(1, 30), txt: `${y.given}と${sh}`, sh, emo, imp, about: [y.id], k: 'friend', src: 'self', ageAt });
    }
  }

  trimMemories(p) {
    const today = this.today;
    if (p.memories.length <= 70) { p.memories.sort((x, y) => x.t - y.t); return; }
    const score = (m) => m.imp * (m.t < 0 ? 0.8 : 1) + (m.t > today - 5 ? 1 : 0) - (today - m.t) * 0.002;
    p.memories.sort((x, y) => score(y) - score(x));
    p.memories.length = 70;
    p.memories.sort((x, y) => x.t - y.t);
  }

  remember(p, txt, opt = {}) {
    p.memories.push({ t: opt.t ?? this.today, min: this.S.t, txt, emo: opt.emo ?? 0, imp: opt.imp ?? 0.3, about: opt.about || [], k: opt.k || 'life', src: opt.src || 'self', g: opt.g, ageAt: this.ageOf(p) });
    if (p.memories.length > 90) this.trimMemories(p);
  }

  // 出来事を噂として広める（目撃者・関係者の記憶に入る）
  gossip(subj, pred, emo, witnesses, opt = {}) {
    const key = 'g' + this.S.gossipSeq++;
    const g = { key, subj: subj.id, pred, emo, congrat: opt.congrat || null };
    subj.gk[key] = 1;
    for (const w of witnesses) {
      if (w.id === subj.id || w.deathYear != null) continue;
      const aff = w.rel[subj.id]?.a ?? 0;
      this.remember(w, `${subj.given}が${pred}`, { t: opt.t, emo: emo * (aff > 0 ? 1 : -0.3), imp: opt.imp ?? 0.55, about: [subj.id], k: 'news', g });
      w.gk[key] = 1;
    }
    if (!opt.silent) this.pushLog(`${this.fullName(subj)}が${pred}。`, 'event');
    return g;
  }

  pushLog(text, kind = 'talk', ids = []) {
    const e = { t: this.S.t, text, kind, ids };
    this.S.log.push(e);
    if (this.S.log.length > 300) this.S.log.splice(0, this.S.log.length - 300);
    this.events.push({ type: 'log', entry: e });
  }

  // ---------- 経済 ----------
  price(g) { return Math.max(1, Math.round(this.S.market.price[g])); }
  priceRatio(g) { return this.S.market.price[g] / GOODS[g].base; }
  updatePrices() {
    const m = this.S.market;
    for (const [k, g] of Object.entries(GOODS)) {
      const target = g.base * clamp(Math.pow(g.target / (m.stock[k] + g.target * 0.25), 0.55), 0.45, 3.2);
      m.price[k] += (target - m.price[k]) * 0.25;
    }
  }
  sell(p, good, qty) {
    const m = this.S.market, hh = this.hh(p);
    const earn = qty * m.price[good] * 0.85;
    m.stock[good] += qty; hh.money += earn;
    return earn;
  }
  buy(p, good, qty) {
    const m = this.S.market, hh = this.hh(p);
    qty = Math.min(qty, Math.floor(m.stock[good]), Math.floor(hh.money / m.price[good]));
    if (qty <= 0) return 0;
    const cost = qty * m.price[good];
    m.stock[good] -= qty; hh.money -= cost; m.commission += cost * 0.08;
    return qty;
  }
  importGoods() {
    // 商人が働いていれば村の外から足りない品を仕入れる
    const m = this.S.market;
    for (const [k, g] of Object.entries(GOODS)) {
      if (m.stock[k] < g.target * 0.2) m.stock[k] += g.target * 0.15;
    }
  }

  // ---------- 行動の決定 ----------
  homeOf(p) { return this.building(this.hh(p).house); }
  placeFor(p, kind) {
    const R = this.rng, sp = this.S.world.spots;
    switch (kind) {
      case 'home': { const b = this.homeOf(p); return { x: b.door.x, z: b.door.z, bld: b.id }; }
      case 'field': return { ...R.pick(sp.field) };
      case 'forest': return { ...R.pick(sp.forest) };
      case 'pond': return { ...R.pick(sp.pond) };
      case 'plaza': return { ...R.pick(sp.plaza) };
      case 'market': { const b = this.buildingOfType('market'); return { x: b.door.x + R.int(-1, 2), z: b.door.z }; }
      default: {
        const b = this.buildingOfType(kind);
        if (!b) return this.placeFor(p, 'plaza');
        return { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id };
      }
    }
  }

  decide(p) {
    const R = this.rng, h = this.hour(), age = this.ageOf(p), hh = this.hh(p), n = p.needs;
    const rest = this.isRestDay();
    const cands = [];
    const add = (score, type, place, dur, extra = {}) => cands.push({ score: score + R.range(0, 1.3), type, place, dur, ...extra });
    const night = h >= 21.5 || h < 5.5;
    const bedtime = age < 13 ? h >= 20 || h < 6.5 : night;

    // ギャザリング（祭り・婚礼・弔い）
    for (const g of this.S.gatherings) {
      if (this.S.t >= g.from && this.S.t < g.to && (!g.ids || g.ids.includes(p.id))) {
        add(9, g.type, g.place === 'plaza' ? this.placeFor(p, 'plaza') : this.placeFor(p, g.place), Math.max(20, (g.to - this.S.t) / 1.2), { gathering: g });
      }
    }
    if (bedtime) add(6 + (100 - n.energy) / 20, 'sleep', this.placeFor(p, 'home'), 0, { untilHour: age < 13 ? 6.5 : 5.8 + (1 - p.pers.C) * 1.5 });
    else if (n.energy < 12) add(4, 'sleep', this.placeFor(p, 'home'), 120);

    const mealTime = (h >= 6 && h < 8.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20);
    if (n.hunger < 60 && !bedtime) {
      const sc = (100 - n.hunger) / 14 + (mealTime ? 2.5 : 0);
      if (hh.food >= 1) add(sc, 'eat', this.placeFor(p, 'home'), 30);
      else if (age >= 12 && hh.money >= this.price('bread') && h >= 6 && h < 20) add(sc + 0.5, 'shop', this.placeFor(p, 'market'), 20, { food: true });
      else if (n.hunger < 35) add(sc, 'askfood', null, 20);
    }
    const workAge = age >= 14 && age <= 67 && p.job;
    if (workAge && h >= 7 && h < 17 && (!rest || p.job === 'innkeeper') && p.workedToday < 9 * 60 && n.energy > 15) {
      add(3 + p.pers.C * 3 + p.values.ambition - (100 - n.energy) / 40, 'work', this.placeFor(p, JOBS[p.job].place), R.int(60, 150));
    }
    if (p.job === 'innkeeper' && h >= 17 && h < 23) add(5, 'work', this.placeFor(p, 'tavern'), 90);
    if (age >= 14 && h >= 8 && h < 19 && ((hh.food < hh.members.length * 2 && hh.money > this.price('bread') * 2) || (p.tool < 0.12 && workAge && hh.money > this.price('tools') + 10))) {
      add(3, 'shop', this.placeFor(p, 'market'), 25);
    }
    if (age >= 16 && h >= 17 && h < 22.5 && hh.money > 30) add(-(hh.money < 80 ? 1.5 : 0) + (100 - n.social) / 30 + (100 - n.fun) / 35 + p.pers.E * 1.6 + (rest ? 0.5 : 0), 'tavern', this.placeFor(p, 'tavern'), R.int(50, 120));
    if (h >= 8 && h < 20) add((100 - n.social) / 28 + p.pers.E * 1.2 + (rest ? 1.2 : 0), 'plaza', this.placeFor(p, 'plaza'), R.int(30, 80));
    if (h >= 9 && h < 20) {
      const friends = Object.entries(p.rel).filter(([id, r]) => r.a > 35 && this.S.people[id]?.deathYear == null && this.S.people[id].hh !== p.hh);
      if (friends.length) {
        const [fid] = R.pick(friends);
        const f = this.S.people[fid];
        add((100 - n.social) / 32 + p.pers.A * 0.8 + (rest ? 1 : 0), 'visit', this.placeFor(f, 'home'), R.int(30, 70), { friend: f.id });
      }
    }
    if (h >= 7 && h < 19.5) {
      const where = R.pick(['pond', 'forest', 'field', 'plaza']);
      add((100 - n.fun) / 30 + p.pers.O * 1.1, 'stroll', this.placeFor(p, where), R.int(20, 60));
    }
    const recentGrief = p.memories.some((m) => m.k === 'death' && this.today - m.t < 10);
    if (h >= 7 && h < 19) add(p.values.faith * 2 + (rest && h < 12 ? 3 : 0) + (recentGrief ? 2 : 0) + (p.job === 'priest' ? 1 : 0), 'pray', this.placeFor(p, 'chapel'), R.int(20, 50));
    if (age < 13 && h >= 7.5 && h < 19) add(3.5 + (100 - n.fun) / 25, 'play', this.placeFor(p, R.chance(0.6) ? 'plaza' : R.pick(['pond', 'field'])), R.int(30, 90));
    add(1.2 + (1 - p.pers.E), 'home', this.placeFor(p, 'home'), R.int(30, 80));

    cands.sort((a, b) => b.score - a.score);
    let c = cands[0];
    if (c.type === 'askfood') {
      const helper = this.findHelper(p);
      if (helper) c = { type: 'askfood', place: this.placeFor(helper, 'home'), dur: 20, helper: helper.id };
      else { c = cands.find((x) => x.type !== 'askfood'); this.hungry(p); }
    }
    this.startAction(p, c);
  }

  findHelper(p) {
    const cands = Object.entries(p.rel).map(([id, r]) => ({ q: this.S.people[id], r }))
      .filter(({ q, r }) => q && q.deathYear == null && q.hh !== p.hh && this.hh(q).food > this.hh(q).members.length * 2 && (r.a > 20 || this.kinTerm(p, q)));
    if (!cands.length) return null;
    return cands.sort((a, b) => b.r.a - a.r.a)[0].q;
  }
  hungry(p) {
    if (!p.memories.some((m) => m.k === 'hunger' && this.today - m.t < 2)) this.remember(p, 'お腹をすかせたまま一日を過ごした', { emo: -0.6, imp: 0.5, k: 'hunger' });
  }

  startAction(p, c) {
    const S = this.S;
    if (p.inside) { const b = this.building(p.inside); p.pos = { x: b.door.x, z: b.door.z }; p.inside = null; }
    p.action = { type: c.type, dur: c.dur, until: null, bld: c.place?.bld ?? null, phase: 'walk', untilHour: c.untilHour, friend: c.friend, helper: c.helper, food: c.food, gathering: c.gathering ? true : false };
    const sx = Math.round(p.pos.x), sz = Math.round(p.pos.z);
    const tgt = c.place || { x: sx, z: sz };
    const path = findPath(S.world, sx, sz, tgt.x, tgt.z);
    if (!path) { p.pos = { x: tgt.x, z: tgt.z }; p.path = []; }
    else p.path = path;
    p.thought = innerThought(this, p);
  }

  arrive(p) {
    const a = p.action;
    a.phase = 'do';
    if (a.bld) p.inside = a.bld;
    if (a.untilHour != null) {
      const h = this.hour();
      let add = (a.untilHour - h) * 60;
      if (add < 0) add += 24 * 60;
      a.until = this.S.t + Math.max(30, add);
    } else a.until = this.S.t + a.dur;
    const hh = this.hh(p);
    if (a.type === 'shop') this.doShop(p);
    if (a.type === 'eat' && hh.food >= 1) { hh.food -= 1; p.needs.hunger = Math.min(100, p.needs.hunger + 60); }
    if (a.type === 'askfood') {
      const helper = this.S.people[a.helper];
      const hh2 = helper && this.hh(helper);
      if (hh2 && hh2.food >= 2) {
        hh2.food -= 1; p.needs.hunger = Math.min(100, p.needs.hunger + 55);
        this.remember(p, `${helper.given}の家で食べ物を分けてもらった`, { emo: 0.6, imp: 0.6, about: [helper.id], k: 'help' });
        const gg = this.gossip(p, `${helper.given}の家で食べ物を分けてもらっていた`, -0.2, this.nearby(p, 6), { silent: true });
        for (const q of hh2.members.map((id) => this.S.people[id])) { q.rel[p.id] && (q.rel[p.id].a += 2); q.gk[gg.key] = 1; }
        p.rel[helper.id] && (p.rel[helper.id].a += 10);
        this.pushLog(`${p.given}は${helper.given}の家で食べ物を分けてもらった。`, 'event', [p.id, helper.id]);
      } else this.hungry(p);
      a.until = this.S.t + 15;
    }
    if (a.type === 'tavern') {
      const qty = this.rng.int(1, 2) + (p.pers.N > 0.7 && this.rng.chance(0.3) ? 1 : 0);
      const cost = qty * this.S.market.price.ale;
      if (hh.money > cost) {
        hh.money -= cost;
        const keeper = this.living().find((q) => q.job === 'innkeeper');
        if (keeper) this.hh(keeper).money += cost * 0.9;
        this.S.market.stock.ale = Math.max(0, this.S.market.stock.ale - qty);
        if (qty >= 3 && this.rng.chance(0.2 + p.pers.E * 0.2)) {
          const pred = this.rng.pick(['酒場で飲みすぎて大声で歌い出した', '酒場で酔っぱらってテーブルの上で踊った', '酒場で飲みすぎて椅子から転げ落ちた']);
          this.gossip(p, pred, -0.1, this.living().filter((q) => q.inside === p.inside && q.id !== p.id));
        }
      }
    }
  }

  doShop(p) {
    const hh = this.hh(p);
    const want = hh.members.length * 4;
    let guard = 20;
    while (hh.food < want && guard-- > 0) {
      const opts = ['bread', 'fish', 'wheat'].filter((g) => this.S.market.stock[g] >= 1 && hh.money >= this.S.market.price[g]);
      if (!opts.length) break;
      const g = opts.sort((a, b) => this.S.market.price[a] / GOODS[a].meals - this.S.market.price[b] / GOODS[b].meals)[0];
      if (!this.buy(p, g, 1)) break;
      hh.food += GOODS[g].meals;
    }
    if (p.tool < 0.12 && p.job && hh.money > this.price('tools') + 10 && this.buy(p, 'tools', 1)) {
      p.tool = 1;
      this.remember(p, '市場で新しい道具を買った', { emo: 0.3, imp: 0.25 });
    }
    if (hh.money > 380 && this.S.market.stock.furniture >= 1 && this.rng.chance(0.12) && this.buy(p, 'furniture', 1)) {
      hh.comfort += 1;
      this.remember(p, '新しい家具を買った', { emo: 0.6, imp: 0.4 });
      this.gossip(p, '新しい家具を買った', 0.3, this.nearby(p, 8));
    }
  }

  // 仕事の成果（1分あたり）
  doWork(p, dt) {
    const hh = this.hh(p), m = this.S.market, hr = dt / 60;
    const toolMul = p.tool > 0.05 ? 1 : 0.6;
    p.tool = Math.max(0, p.tool - 0.0035 * hr);
    const sm = [0.5, 0.9, 2.4, 0.08][this.seasonIdx()];
    const wm = this.S.weather === 'rain' ? 0.85 : 1;
    const eff = (0.7 + p.pers.C * 0.5) * toolMul * hr;
    switch (p.job) {
      case 'farmer': {
        const q = 1.1 * sm * wm * this.S.harvest * eff;
        if (hh.food < hh.members.length * 3) hh.food += q; else this.sell(p, 'wheat', q);
        break;
      }
      case 'fisher': this.sell(p, 'fish', 0.75 * (this.seasonIdx() === 3 ? 0.4 : 1) * eff); break;
      case 'woodcutter': this.sell(p, 'wood', 1.6 * eff * (this.seasonIdx() === 3 ? 1.3 : 1)); break;
      case 'baker': {
        const need = 1 * eff;
        if (m.stock.wheat >= need && m.stock.bread < GOODS.bread.target * 1.6) {
          m.stock.wheat -= need; hh.money -= need * m.price.wheat * 0.9;
          this.sell(p, 'bread', need * 1.8);
        }
        break;
      }
      case 'smith': {
        const need = 0.6 * eff;
        if (m.stock.wood >= need && m.stock.tools < GOODS.tools.target * 2) { m.stock.wood -= need; hh.money -= need * m.price.wood * 0.9; this.sell(p, 'tools', need * 0.22); }
        else hh.money += 2 * hr; // 修理の仕事
        break;
      }
      case 'carpenter': {
        const need = 1 * eff;
        if (m.stock.wood >= need && m.stock.furniture < GOODS.furniture.target * 2) { m.stock.wood -= need; hh.money -= need * m.price.wood * 0.9; this.sell(p, 'furniture', need * 0.1); }
        hh.money += 1.5 * hr;
        break;
      }
      case 'innkeeper': {
        const need = 0.8 * eff;
        if (m.stock.wheat >= need && m.stock.ale < GOODS.ale.target * 1.5) { m.stock.wheat -= need; hh.money -= need * m.price.wheat * 0.9; m.stock.ale += need * 3; }
        break;
      }
      case 'merchant': {
        hh.money += m.commission; m.commission = 0;
        this.importGoods();
        break;
      }
      case 'priest': case 'mayor': {
        const pay = 3.2 * hr;
        this.S.fund -= pay; hh.money += pay;
        break;
      }
    }
  }

  // ---------- 1ステップ ----------
  step(dt) {
    const S = this.S;
    const prevDay = this.dayIndex, prevHour = Math.floor(this.hour());
    S.t += dt;
    if (this.dayIndex !== prevDay) this.newDay();
    if (Math.floor(this.hour()) !== prevHour) this.newHour();
    const people = this.living();
    const hr = dt / 60;
    for (const p of people) {
      const a = p.action;
      const n = p.needs;
      const sleeping = a && a.type === 'sleep' && a.phase === 'do';
      n.hunger = clamp(n.hunger - (sleeping ? 2 : 5.2) * hr, 0, 100);
      n.energy = clamp(n.energy + (sleeping ? 14 : a?.type === 'work' ? -7 : -4.5) * hr, 0, 100);
      n.social = clamp(n.social - (sleeping ? 0.5 : 3.2) * hr, 0, 100);
      n.fun = clamp(n.fun - (sleeping ? 0.3 : 2.4) * hr, 0, 100);
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.talk) { this.stepTalk(p); continue; }
      if (!a) { this.decide(p); continue; }
      if (a.phase === 'walk') this.walk(p, dt);
      else {
        switch (a.type) {
          case 'work': this.doWork(p, dt); p.workedToday += dt; break;
          case 'tavern': n.fun += 18 * hr; n.social += 10 * hr; break;
          case 'plaza': n.social += 4 * hr; n.fun += 4 * hr; break;
          case 'stroll': n.fun += 14 * hr; break;
          case 'play': n.fun += 26 * hr; n.energy -= 3 * hr; break;
          case 'pray': n.fun += 4 * hr; p.mood += 3 * hr; break;
          case 'festival': n.fun += 30 * hr; n.social += 12 * hr; break;
          case 'wedding': n.fun += 15 * hr; n.social += 10 * hr; break;
          case 'home': n.fun += 2 * hr; break;
        }
        n.fun = Math.min(100, n.fun); n.social = Math.min(100, n.social);
        const wakeEarly = a.type === 'sleep' && n.energy >= 99 && this.hour() > 5 && this.hour() < 12;
        if (S.t >= a.until || wakeEarly) {
          if (a.type === 'sleep') this.onWake(p);
          p.action = null;
        } else if (a.type === 'stroll' || a.type === 'play' || a.type === 'plaza' || a.type === 'festival') {
          // その場でうろうろ
          if (this.rng.chance(0.02 * dt)) {
            const nx = Math.round(p.pos.x) + this.rng.int(-2, 2), nz = Math.round(p.pos.z) + this.rng.int(-2, 2);
            const path = findPath(S.world, Math.round(p.pos.x), Math.round(p.pos.z), nx, nz, 300);
            if (path && path.length < 6) { p.path = path; a.phase = 'walk'; a.wander = true; }
          }
        }
      }
    }
    this.checkEncounters(people, dt);
  }

  walk(p, dt) {
    const age = this.ageOf(p);
    let speed = (age < 13 ? 1.1 : age > 65 ? 0.6 : 0.9) * dt;
    while (speed > 0 && p.path.length) {
      const t = p.path[0];
      const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= speed) { p.pos.x = t.x; p.pos.z = t.z; p.path.shift(); speed -= d; }
      else { p.pos.x += (dx / d) * speed; p.pos.z += (dz / d) * speed; speed = 0; }
    }
    if (!p.path.length) {
      if (p.action.wander) { p.action.phase = 'do'; p.action.wander = false; }
      else this.arrive(p);
    }
  }

  onWake(p) {
    // 夢
    if (this.hour() > 4 && this.hour() < 10 && this.rng.chance(0.05)) {
      const dreams = ['死んだ祖母が台所でパンを焼いている夢を見た', '空を飛んで鐘楼の上まで行く夢を見た', '誰かに遠くからじっと見られている夢を見た', '子どものころの家で迷子になる夢を見た', '湖の底に知らない町がある夢を見た'];
      this.remember(p, this.rng.pick(dreams), { emo: 0.1, imp: 0.3, k: 'dream' });
    }
  }

  nearby(p, r) {
    return this.living().filter((q) => q.id !== p.id && !q.inside && Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.z - p.pos.z) < r);
  }

  // ---------- 会話 ----------
  checkEncounters(people, dt) {
    const R = this.rng;
    const avail = people.filter((p) => !p.talk && p.cooldown <= 0 && p.action && !(p.action.type === 'sleep' && p.action.phase === 'do') && this.ageOf(p) >= 3);
    for (let i = 0; i < avail.length; i++) {
      const a = avail[i];
      if (a.talk) continue;
      for (let j = i + 1; j < avail.length; j++) {
        const b = avail[j];
        if (b.talk) continue;
        const same = a.inside && a.inside === b.inside;
        const close = !a.inside && !b.inside && Math.abs(a.pos.x - b.pos.x) < 1.6 && Math.abs(a.pos.z - b.pos.z) < 1.6;
        if (!same && !close) continue;
        const rel = a.rel[b.id] || { a: 0, f: 10 };
        const place = a.action.type === 'tavern' || a.action.type === 'plaza' || a.action.type === 'festival' || a.action.type === 'wedding' ? 2.6 : a.action.phase === 'walk' ? 0.7 : a.action.type === 'work' ? 0.35 : 1;
        const visit = (a.action.friend === b.id || b.action.friend === a.id) ? 6 : 1;
        let pr = 0.035 * dt * (0.35 + a.pers.E + b.pers.E * 0.5) * (1 + (100 - a.needs.social) / 60) * (0.3 + rel.f / 100) * place * visit;
        if (a.talkedToday[b.id]) pr *= 0.25;
        if (R.chance(pr)) { this.startTalk(a, b); break; }
      }
    }
  }

  startTalk(a, b) {
    const convo = composeConversation(this, a, b);
    const t = this.S.t;
    const talk = { a: a.id, b: b.id, lines: convo.lines, i: 0, next: t, effects: convo.effects, owner: a.id };
    a.talk = talk; b.talk = talk;
    for (const p of [a, b]) if (p.action && p.action.until) p.action.until += convo.lines.length * 1.6;
  }

  stepTalk(p) {
    const talk = p.talk;
    if (talk.owner !== p.id) return;
    const S = this.S;
    while (talk.i < talk.lines.length && S.t >= talk.next) {
      const line = talk.lines[talk.i++];
      const sp = S.people[line.id];
      this.events.push({ type: 'say', id: line.id, text: line.text });
      this.pushLog(`${sp.given}「${line.text}」`, 'talk', [talk.a, talk.b]);
      talk.next = S.t + 1.6;
    }
    if (talk.i >= talk.lines.length && S.t >= talk.next) this.endTalk(talk);
  }

  endTalk(talk) {
    const a = this.S.people[talk.a], b = this.S.people[talk.b];
    const e = talk.effects;
    a.talk = null; b.talk = null;
    a.cooldown = this.rng.range(40, 120); b.cooldown = this.rng.range(40, 120);
    a.talkedToday[b.id] = 1; b.talkedToday[a.id] = 1;
    const ra = a.rel[b.id] || (a.rel[b.id] = { a: 0, f: 10 });
    const rb = b.rel[a.id] || (b.rel[a.id] = { a: 0, f: 10 });
    ra.a = clamp(ra.a + e.daA, -100, 100); rb.a = clamp(rb.a + e.daB, -100, 100);
    ra.f = Math.min(100, ra.f + 2); rb.f = Math.min(100, rb.f + 2);
    a.needs.social = Math.min(100, a.needs.social + 22); b.needs.social = Math.min(100, b.needs.social + 22);
    for (const s of e.shared) {
      const from = this.S.people[s.from], to = this.S.people[s.to];
      if (to.gk[s.mem.g.key]) continue;
      to.gk[s.mem.g.key] = 1;
      const subj = this.S.people[s.mem.g.subj];
      if (!subj) continue;
      this.remember(to, `${from.given}から、${subj.given}が${s.mem.g.pred}と聞いた`, { emo: s.mem.g.emo * 0.7, imp: s.mem.imp * 0.8, about: [subj.id, from.id], k: 'news', src: 'heard', g: s.mem.g });
    }
    if (e.argument) {
      this.remember(a, `${b.given}と口論になった`, { emo: -0.7, imp: 0.65, about: [b.id], k: 'quarrel' });
      this.remember(b, `${a.given}と口論になった`, { emo: -0.7, imp: 0.65, about: [a.id], k: 'quarrel' });
      const witnesses = this.living().filter((q) => q !== a && q !== b && ((a.inside && q.inside === a.inside) || (!a.inside && !q.inside && Math.abs(q.pos.x - a.pos.x) + Math.abs(q.pos.z - a.pos.z) < 5)));
      if (witnesses.length) this.gossip(a, `${b.given}と大声で言い争っていた`, -0.4, witnesses);
      b.gk[Object.keys(a.gk).pop()] = 1;
    }
    if (e.romance) {
      this.remember(a, `${b.given}と話していて胸が高鳴った`, { emo: 0.8, imp: 0.7, about: [b.id], k: 'romance' });
      this.remember(b, `${a.given}に想いを打ち明けられた気がする`, { emo: 0.7, imp: 0.7, about: [a.id], k: 'romance' });
      ra.a = clamp(ra.a + 8, -100, 100); rb.a = clamp(rb.a + 8, -100, 100);
      this.maybeEngage(a, b);
    }
  }

  maybeEngage(a, b) {
    const ra = a.rel[b.id], rb = b.rel[a.id];
    if (ra.a < 72 || rb.a < 68 || a.spouseId != null || b.spouseId != null) return;
    if (this.S.pendingWeddings.some((w) => w.a === a.id || w.b === a.id || w.a === b.id || w.b === b.id)) return;
    const day = this.dayIndex + 3;
    const from = day * 1440 + 14 * 60;
    const guests = this.living().filter((q) => q.hh === a.hh || q.hh === b.hh || (q.rel[a.id]?.a ?? 0) > 30 || (q.rel[b.id]?.a ?? 0) > 30 || q.job === 'priest').map((q) => q.id);
    this.S.pendingWeddings.push({ a: a.id, b: b.id, at: from + 90 });
    this.S.gatherings.push({ type: 'wedding', place: 'chapel', from, to: from + 120, ids: guests, label: `${a.given}と${b.given}の婚礼` });
    this.remember(a, `${b.given}と結婚の約束をした`, { emo: 0.95, imp: 0.95, about: [b.id], k: 'engage' });
    this.remember(b, `${a.given}と結婚の約束をした`, { emo: 0.95, imp: 0.95, about: [a.id], k: 'engage' });
    this.gossip(a, `${b.given}と婚約した`, 0.8, this.living().filter((q) => q.hh === a.hh || q.hh === b.hh), { congrat: '婚約したんだってね' });
  }

  // ---------- 時間の節目 ----------
  newHour() {
    this.updatePrices();
    const h = Math.floor(this.hour());
    for (const p of this.living()) {
      // 気分：欲求・お金・最近の記憶・性格
      const n = p.needs;
      const needAvg = (n.hunger * 1.3 + n.energy + n.social + n.fun) / 4.3;
      const money = this.householdMoney(p);
      const moneyF = money < 15 ? -12 : money < 50 ? -4 : money > 250 ? 6 : 0;
      let memF = 0;
      for (const m of p.memories) { const age = this.today - m.t; if (age >= 0 && age < 6) memF += m.emo * m.imp * 12 * (1 - age / 6); }
      memF = clamp(memF, -30, 30) * (m1(p) );
      let mood = needAvg * 0.65 + 25 + moneyF + memF + this.hh(p).comfort * 1.5;
      if (mood < 50) mood -= (p.pers.N - 0.5) * 20;
      p.mood = clamp(p.mood * 0.6 + mood * 0.4, 0, 100);
      if (!p.talk && this.rng.chance(0.4)) p.thought = innerThought(this, p);
    }
    // 結婚式の実施
    for (const w of this.S.pendingWeddings.slice()) {
      if (this.S.t >= w.at) {
        this.S.pendingWeddings.splice(this.S.pendingWeddings.indexOf(w), 1);
        const a = this.S.people[w.a], b = this.S.people[w.b];
        if (a && b && a.deathYear == null && b.deathYear == null) this.marry(a, b);
      }
    }
    this.S.gatherings = this.S.gatherings.filter((g) => g.to > this.S.t);
  }

  newDay() {
    const S = this.S, R = this.rng;
    const doy = this.dayOfYear();
    for (const p of this.living()) { p.talkedToday = {}; p.workedToday = 0; }
    // 天気
    const si = this.seasonIdx();
    const w = R.next();
    S.weather = si === 3 ? (w < 0.35 ? 'snow' : w < 0.6 ? 'cloudy' : 'sunny') : (w < [0.3, 0.2, 0.28, 0][si] ? 'rain' : w < 0.5 ? 'cloudy' : 'sunny');
    if (doy === 0) this.newYear();
    // 村の蓄え：裕福な家から少し集め、困っている家に施す
    S.fund = S.fund ?? 300;
    for (const hh of Object.values(S.households)) {
      hh.food = Math.max(0, hh.food);
      if (hh.money > 200) { const tax = (hh.money - 200) * 0.06; hh.money -= tax; S.fund += tax; }
    }
    for (const hh of Object.values(S.households)) {
      if (hh.money < 15 && S.fund > 20) {
        const gift = Math.min(25, S.fund * 0.2);
        hh.money += gift; S.fund -= gift;
        for (const id of hh.members) { const q = S.people[id]; if (this.ageOf(q) >= 14 && R.chance(0.5)) this.remember(q, '村の蓄えから施しを受けた', { emo: -0.1, imp: 0.4, k: 'relief' }); }
      }
    }
    // 収穫祭
    if (this.isFestival()) {
      const from = this.dayIndex * 1440 + 16 * 60;
      S.gatherings.push({ type: 'festival', place: 'plaza', from, to: from + 7 * 60, label: '収穫祭' });
      this.pushLog('今日は収穫祭。夕方から広場でかがり火が焚かれる。', 'event');
    }
    // 誕生日・仕事・引退
    for (const p of this.living()) {
      if (p.birthDay !== doy) continue;
      const age = this.ageOf(p);
      if (age < 14) this.remember(p, `${age}歳の誕生日を家族に祝ってもらった`, { emo: 0.7, imp: 0.45 });
      if (age === 14 && !p.job) {
        const par = [this.person(p.fatherId), this.person(p.motherId)].find((q) => q && q.job && q.job !== 'mayor' && q.job !== 'priest');
        p.job = par ? par.job : 'farmer';
        this.remember(p, `14歳になり、${JOBS[p.job].name}の見習いを始めた`, { emo: 0.5, imp: 0.8 });
        this.gossip(p, `${JOBS[p.job].name}の見習いを始めた`, 0.4, this.living().filter((q) => (q.rel[p.id]?.f ?? 0) > 50), { congrat: '見習いを始めたんだってね' });
      }
      if (age === 68 && p.job) {
        this.remember(p, `長年続けた${JOBS[p.job].name}の仕事から退いた`, { emo: 0.1, imp: 0.8 });
        p.formerJob = p.job; p.job = null;
      }
      p.style = speechStyle(p, age);
      p.traits = traitLabels(p);
    }
    // 死
    for (const p of this.living()) {
      const age = this.ageOf(p);
      const hungerMul = p.needs.hunger < 5 ? 3 : 1;
      if (R.chance(mortY(age) / DAYS_PER_YEAR * hungerMul)) this.die(p, age >= 70 ? 'old' : R.pick(['sick', 'sick', 'accident', 'winter']));
    }
    // 妊娠・誕生
    const pop = this.living().length;
    for (const w of this.living()) {
      if (w.sex !== 'f') continue;
      if (w.pregnant > 0) { w.pregnant++; if (w.pregnant > 14) this.birth(w); continue; }
      const h = w.spouseId != null && this.person(w.spouseId);
      const age = this.ageOf(w);
      if (!h || h.deathYear != null || age < 18 || age > 42) continue;
      const love = ((w.rel[h.id]?.a ?? 0) + 100) / 200;
      if (R.chance(0.02 * love * clamp(1.8 - pop / 65, 0.1, 1.5))) {
        w.pregnant = 1;
        this.remember(w, 'お腹に子どもがいるとわかった', { emo: 0.9, imp: 0.9, k: 'preg' });
        this.remember(h, `${w.given}のお腹に子どもがいるとわかった`, { emo: 0.9, imp: 0.9, about: [w.id], k: 'preg' });
        this.gossip(w, 'おめでたらしい', 0.7, this.living().filter((q) => q.hh !== w.hh && (q.rel[w.id]?.a ?? 0) > 25), { congrat: 'おめでただってね' });
      }
    }
    // ささやかな出来事
    if (R.chance(0.05)) this.villageEvent();
    // 毎日の相場の記録
    S.market.history.push({ d: this.dayIndex, bread: this.S.market.price.bread, wheat: this.S.market.price.wheat });
    if (S.market.history.length > 80) S.market.history.shift();
    for (const p of this.living()) this.trimMemories(p);
    this.save();
  }

  newYear() {
    const S = this.S, R = this.rng;
    const y = this.year() - 1;
    S.chronicle.push({ y, text: `この年、${S.stats.births}人が生まれ、${S.stats.deaths}人が亡くなり、${S.stats.weddings}組が結婚した` });
    S.stats = { births: 0, deaths: 0, weddings: 0 };
    S.harvest = clamp(R.gauss(1, 0.2), 0.5, 1.4);
    this.pushLog(`新しい年、${ERA}${this.year()}年が明けた。`, 'event');
  }

  villageEvent() {
    const R = this.rng, S = this.S;
    const ev = R.pick([
      { text: '旅の行商人が珍しい品を持ってやって来た', emo: 0.4, fx: () => { for (const k of Object.keys(GOODS)) S.market.stock[k] += GOODS[k].target * 0.2; } },
      { text: '夜のうちに嵐が来て、畑の柵が倒れた', emo: -0.4, fx: () => { S.harvest *= 0.95; } },
      { text: '森の近くで狼の足跡が見つかった', emo: -0.5 },
      { text: '夜空に大きな流れ星が走った', emo: 0.3 },
      { text: '湖で季節外れの大漁があった', emo: 0.5, fx: () => { S.market.stock.fish += 12; } },
      { text: '鐘楼の鐘がひとりでに鳴ったという噂が広まった', emo: -0.1 },
    ]);
    ev.fx && ev.fx();
    S.chronicle.push({ y: this.year(), text: ev.text });
    for (const p of this.living()) this.remember(p, ev.text, { emo: ev.emo, imp: 0.45, k: 'village' });
    this.pushLog(ev.text + '。', 'event');
  }

  // ---------- 人生の節目 ----------
  die(p, cause) {
    const S = this.S, age = this.ageOf(p);
    p.deathYear = this.year(); p.deathCause = cause;
    if (p.job && age > 20) p.deeds.unshift(`腕のいい${JOBS[p.job].name}だった`);
    if (p.formerJob) p.deeds.unshift(`腕のいい${JOBS[p.formerJob].name}だった`);
    if (p.talk) { const o = S.people[p.talk.a === p.id ? p.talk.b : p.talk.a]; if (o) o.talk = null; p.talk = null; }
    const hh = this.hh(p);
    hh.members = hh.members.filter((id) => id !== p.id);
    if (p.spouseId != null) { const sp = S.people[p.spouseId]; if (sp) { sp.exSpouses.push(p.id); sp.spouseId = null; } }
    S.stats.deaths++;
    const cause_ = DEATH_CAUSES[cause];
    for (const q of this.living()) {
      const term = this.kinTerm(q, p);
      const aff = q.rel[p.id]?.a ?? 0;
      if (term) this.remember(q, `${term}の${p.given}が${cause_}で亡くなった`, { emo: -0.9, imp: 0.95, about: [p.id], k: 'death' });
      else if (aff > 20) this.remember(q, `${p.given}が${cause_}で亡くなった`, { emo: -0.5 - aff / 200, imp: 0.7, about: [p.id], k: 'death' });
      else this.remember(q, `${p.given}が亡くなったと聞いた`, { emo: -0.2, imp: 0.4, about: [p.id], k: 'death2' });
      delete q.rel[p.id];
    }
    const from = (this.dayIndex + 1) * 1440 + 10 * 60;
    const mourners = this.living().filter((q) => this.kinTerm(q, p) || q.hh === p.hh || q.job === 'priest' || (q.rel[p.id]?.a ?? 0) > 25).map((q) => q.id);
    S.gatherings.push({ type: 'funeral', place: 'chapel', from, to: from + 90, ids: mourners, label: `${p.given}の弔い` });
    S.chronicle.push({ y: this.year(), text: `${this.fullName(p)}が${age}歳で亡くなった（${cause_}）` });
    this.pushLog(`${this.fullName(p)}が${age}歳で亡くなった。${cause_}だった。`, 'death', [p.id]);
    // 生きている人だけが持つデータを片付ける
    for (const k of ['needs', 'memories', 'rel', 'gk', 'talkedToday', 'action', 'path', 'pos', 'talk', 'inside', 'thought']) delete p[k];
    if (hh.members.length === 0) {
      const b = this.building(hh.house); if (b) { b.hh = null; b.name = '空き家'; }
      delete S.households[hh.id];
    }
    this.events.push({ type: 'died', id: p.id });
  }

  marry(a, b) {
    const S = this.S;
    const [m, w] = a.sex === 'm' ? [a, b] : [b, a];
    m.spouseId = w.id; w.spouseId = m.id;
    w.family = m.family;
    S.stats.weddings++;
    this._kin.clear();
    // 住まい：空き家があれば新居へ、なければ夫の家へ
    const oldW = this.hh(w), oldM = this.hh(m);
    const empty = S.world.houses.map((id) => this.building(id)).find((bd) => !bd.hh);
    let target;
    if (empty && oldM.members.length > 3) {
      const id = S.nextHh++;
      target = S.households[id] = { id, members: [], house: empty.id, money: 0, food: 4, comfort: 0, name: `${m.family}家` };
      empty.hh = id; empty.name = `${m.family}家（新居）`;
      const gift = Math.min(60, oldM.money * 0.3); oldM.money -= gift; target.money += gift;
      for (const p of [m, w]) this.moveTo(p, target);
    } else { target = oldM; this.moveTo(w, target); }
    const gift = Math.min(40, oldW.money * 0.2); if (oldW.members.length) { oldW.money -= gift; target.money += gift; }
    for (const p of [m, w]) this.remember(p, `${(p === m ? w : m).given}と礼拝堂で結婚した`, { emo: 0.95, imp: 1, about: [(p === m ? w : m).id], k: 'marriage' });
    this.gossip(m, `${w.given}と結婚した`, 0.8, this.living().filter((q) => q !== w), { congrat: '結婚おめでとう' });
    w.gk[Object.keys(m.gk).pop()] = 1;
    S.chronicle.push({ y: this.year(), text: `${this.fullName(m)}と${w.given}が結婚した` });
  }

  moveTo(p, hh) {
    const old = this.hh(p);
    if (old === hh) return;
    old.members = old.members.filter((id) => id !== p.id);
    hh.members.push(p.id); p.hh = hh.id;
    if (old.members.length === 0) {
      hh.money += old.money; hh.food += old.food;
      const b = this.building(old.house); if (b) { b.hh = null; b.name = '空き家'; }
      delete this.S.households[old.id];
    }
  }

  birth(w) {
    const S = this.S, R = this.rng;
    w.pregnant = 0;
    const h = S.people[w.spouseId] || S.people[w.exSpouses[w.exSpouses.length - 1]];
    const ctx = { rng: R, people: S.people, nextId: () => S.nextId++ };
    const make = createPersonFactory(ctx);
    const sex = R.chance(0.5) ? 'm' : 'f';
    const grand = [h?.fatherId, h?.motherId, w.fatherId, w.motherId].map((id) => S.people[id]).filter((g) => g && g.deathYear != null && g.sex === sex);
    const namesake = grand.length && R.chance(0.35) ? R.pick(grand) : null;
    const c = make({ sex, family: w.family, birthYear: this.year(), birthDay: this.dayOfYear(), father: h, mother: w, given: namesake?.given });
    delete c.notes;
    c.needs = { hunger: 80, energy: 80, social: 80, fun: 80 };
    c.mood = 70; c.memories = []; c.rel = {}; c.gk = {}; c.talkedToday = {}; c.tool = 0; c.workedToday = 0; c.pregnant = 0; c.cooldown = 0;
    c.style = 'child'; c.traits = traitLabels(c);
    c.hh = w.hh; this.hh(w).members.push(c.id);
    const home = this.homeOf(w);
    c.pos = { x: home.door.x, z: home.door.z }; c.inside = home.id; c.path = []; c.action = null;
    this._kin.clear();
    for (const q of this.living()) {
      if (q === c) continue;
      const kin = this.kinTerm(q, c);
      q.rel[c.id] = { a: kin ? 60 : 10, f: q.hh === c.hh ? 95 : kin ? 60 : 15 };
      c.rel[q.id] = { a: kin ? 50 : 10, f: q.hh === c.hh ? 95 : kin ? 50 : 10 };
    }
    for (const par of [w, h]) if (par && par.deathYear == null) this.remember(par, `${sex === 'm' ? '息子' : '娘'}の${c.given}が生まれた`, { emo: 1, imp: 1, about: [c.id], k: 'child' });
    if (namesake) this.remember(w, `生まれた子に、亡き${this.kinTerm(w, namesake) || '身内'}の名前「${namesake.given}」をつけた`, { emo: 0.6, imp: 0.6, about: [namesake.id] });
    S.stats.births++;
    this.gossip(w, `${c.given}という${sex === 'm' ? '男の子' : '女の子'}を産んだ`, 0.8, this.living().filter((q) => q.hh !== w.hh && (q.rel[w.id]?.f ?? 0) > 40), { congrat: '赤ちゃんが生まれたんだってね' });
    S.chronicle.push({ y: this.year(), text: `${this.fullName(c)}が生まれた` });
    this.events.push({ type: 'born', id: c.id });
  }
}

function m1(p) { return 0.7 + p.pers.N * 0.6; }
