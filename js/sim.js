// 世界のシミュレーション本体：時間・7つの欲求・目的・学習・行動・経済・人生
import { makeRng, clamp } from './rng.js';
import { JOBS, GOODS, DAYS_PER_YEAR, DAYS_PER_SEASON, SEASONS, DEATH_CAUSES, ERA, WORLD_NAME, KINGDOMS, RANKS, SPECIES, traitLabels } from './data.js';
import { generateHistory, createPersonFactory } from './history.js';
import { generateWorld, openGates, makeHousePlacer, T, W, H, walkable, tileAt, heightAt, TILE_NAME } from './world.js';
import { findPath } from './path.js';
import { ancestors, kinTerm, isCloseKin, siblings } from './kin.js';
import { composeConversation, innerThought, speechStyle } from './speech.js';
import { spawnInitialCreatures, stepCreatures, creatureDaily } from './creatures.js';
import { stepCombat, startFight, humanStats, crimeHourly, justiceDaily, tryCrime, crimeArrive, markWanted } from './society.js';
import { initPolitics, politicsDaily, politicsHourly, demonHourly, addSaying } from './politics.js';
import { saveWorld, loadWorld, clearWorld } from './store.js';
import { computeDanger, tooDangerous, defendTowns, spotThreats, dangerAt } from './danger.js';
import { around } from './creatures.js';
import { ITEMS, makeItem, addItem, autoEquip, starterKit, countItem, takeItem, itemName, itemValue, TREASURE_ITEMS } from './items.js';
import { initProperty, propertyDaily, inherit, transferEstate, spendable, pay, earn, fieldShare, houseValue, weeklyRent } from './property.js';
import { partiesDaily } from './guild.js';
import { rumorBirth, rumorRelay, rumorHeardText, rumorCorrect } from './rumor.js';
import { calendarDaily, calendarHalfDay } from './calendar.js';
import { weatherDaily, weatherHourly, weatherMood, weatherBias, weatherWorkMul, harvestMul, roadsClosed, weatherMoodDelta, legacyWeatherAt } from './weather.js';
import { financeDaily, financeHourly, financeCandidates, financeArrive } from './finance.js';
import { careerDaily, careerOptions, careerDo, careerWorkPlace } from './career.js';
import { faunaDaily, faunaHourly } from './fauna.js';
import { initUnderworld, underworldDaily, underworldHourly, underworldDecide, underworldArrive, underworldWorkMul } from './underworld.js';
import { growthHourly, growthDaily, growthTalk, growthLevelCheck, moveMul, workMul, healMul, tradeMul } from './growth.js';
import { healthDaily, healthHourly, healthArrive, sickAction, healthDecide, healthSpeedMul, healthWorkMul, onDeath } from './health.js';
import { choreOptions, sleepPlan, choreArrive, choreDo, choreHourly, choreDaily, apprenticeSkill } from './chores.js';
import { guildDaily, takeQuest, questPlace, reportQuest, completeQuest, questOf, huntBounty, isAdventurer, sellMaterials } from './guild.js';

const MORT_Y = [[0, 0.04], [4, 0.008], [14, 0.002], [39, 0.003], [54, 0.007], [64, 0.02], [74, 0.05], [84, 0.12], [999, 0.28]];
const mortY = (a) => { for (const [x, p] of MORT_Y) if (a <= x) return p; return 0.3; };
const CHILD_PLAY = ['大きな木に登って叱られた', '川で泳いで溺れかけた', '収穫祭の夜にこっそり抜け出して星を見た', '城壁の上にこっそり登った', '森で迷子になって一晩過ごした', '司祭さまのりんごを盗んで食べた', '雪合戦で窓を割った', '水辺に秘密の基地を作った'];
const CHILD_FIGHT = ['取っ組み合いのけんかをした', '収穫祭の力比べで本気でやり合った'];
export const NEED_KEYS = ['survival', 'sleep', 'hunger', 'lust', 'sloth', 'pleasure', 'esteem'];
const MEM_CAP = 45;

export class Sim {
  constructor() {
    this.events = [];
    this._anc = new Map();
    this._kin = new Map();
    this._living = null;
    this.pathBudget = 0;
    this.focus = null; // カメラが見ている場所（会話文の生成を近場に絞る）
  }

  // ---------- 初期化 ----------
  newWorld(seed = (Math.random() * 1e9) | 0, progress = () => {}) {
    const rng = this.rng = makeRng(seed);
    progress('大陸を形づくっています……');
    const world = generateWorld(rng, seed);
    progress('二百八十年の歴史を紡いでいます……');
    const hist = generateHistory(rng, world);
    const S = this.S = {
      version: 2, seed, t: 6 * 60, startYear: hist.currentYear, people: hist.people, nextId: hist.nextId,
      creatures: {}, nextCid: 1, world, chronicle: hist.chronicle, households: {}, nextHh: 1,
      towns: {}, weather: 'sunny', harvest: 1, gatherings: [], log: [], news: [], graves: [], gossipSeq: 1,
      pendingWeddings: [], stats: { births: 0, deaths: 0, weddings: 0 }, culture: {}, parties: [], wanted: {},
      speciesMemory: {}, gatesOpened: true,
    };
    this.placeHouse = makeHousePlacer(world, rng);
    progress('人々の暮らしを整えています……');
    this.formHouseholds();
    this.initTowns();
    this.initLiving();
    initPolitics(this, hist);
    progress('生き物たちを放っています……');
    spawnInitialCreatures(this);
    initProperty(this);
    initUnderworld(this);
    for (let i = 0; i < 4; i++) partiesDaily(this);
    this.slimDead();
    computeDanger(this);
    this.pushLog(`${ERA}${this.year()}年 春。${WORLD_NAME}大陸の一日が始まる。`, 'event');
    return this;
  }

  async load() {
    const data = await loadWorld();
    if (!data || data.version !== 2) return false;
    this.S = data;
    this.rng = makeRng(data.seed);
    this.rng.state = data.rngState;
    this.placeHouse = makeHousePlacer(data.world, this.rng);
    for (const p of this.living()) { p.talk = null; p.fight = null; p.path = p.path || []; }
    for (const c of Object.values(data.creatures)) c.fight = null;
    if (!data.property) initProperty(this);
    if (!data.uw) initUnderworld(this);
    if (!data.gatesOpened) { openGates(data.world); data.gatesOpened = true; }
    computeDanger(this);
    return true;
  }
  async save() {
    this.S.rngState = this.rng.state;
    return saveWorld(this.S);
  }
  static clearSave() { return clearWorld(); }

  slimDead() {
    for (const p of Object.values(this.S.people)) {
      delete p.notes; delete p.anc2;
      if (p.deathYear != null) { delete p.dream; delete p.sleepType; }
    }
  }

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
  weather(p) { return p?.pos ? legacyWeatherAt(this, p.pos.x, p.pos.z) : this.S.weather; }
  chronicle() { return this.S.chronicle; }
  dateLabel() {
    const h = Math.floor(this.hour()), m = Math.floor(this.S.t % 60);
    return { era: `${ERA}${this.year()}年`, season: this.season(), day: (this.dayOfYear() % DAYS_PER_SEASON) + 1, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
  }

  // ---------- 参照 ----------
  person(id) { return this.S.people[id]; }
  creature(id) { return this.S.creatures[id]; }
  speciesKind(c) { return SPECIES[c.sp]?.kind; }
  entity(id) { return typeof id === 'string' ? this.S.creatures[id] : this.S.people[id]; }
  living() {
    if (!this._living) this._living = Object.values(this.S.people).filter((p) => p.deathYear == null);
    return this._living;
  }
  dirty() { this._living = null; }
  ageOf(p) {
    if (p.deathYear != null) return p.deathYear - p.birthYear;
    const d = this.dayIndex;
    if (p._ad === d) return p._age;
    p._ad = d;
    return (p._age = this.year() - p.birthYear - (this.dayOfYear() < p.birthDay ? 1 : 0));
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
  building(id) { return this.S.world.buildings[id]; }
  town(sid) { return this.S.world.settlements[sid]; }
  townOf(p) { return this.town(p.s); }
  kingdomOf(p) { return this.S.kingdoms[this.townOf(p).kingdom]; }
  rankLv(p) { return RANKS[p.rank]?.lv ?? 4; }
  rel(a, b) { return a.rel[b.id] || { a: 0, f: 0 }; }
  relMut(a, b) { return a.rel[b.id] || (a.rel[b.id] = { a: 0, f: 5 }); }
  isAdult(p) { return this.ageOf(p) >= 16; }
  townBuilding(s, type) {
    const t = typeof s === 'number' ? this.town(s) : s;
    for (const id of t.buildings) { const b = this.building(id); if (b.type === type) return b; }
    return null;
  }
  // その場所の呼び名
  placeName(x, z) {
    const w = this.S.world;
    let best = null, bd = 1e9;
    for (const s of w.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    if (bd <= best.r + 2) return best.name;
    for (const id of w.specials) { const b = this.building(id); if (Math.hypot(b.x - x, b.z - z) < 7) return b.name; }
    const t = tileAt(w, x, z);
    const dx = x - best.x, dz = z - best.z;
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? '東' : '西') : (dz > 0 ? '南' : '北');
    return `${best.name.replace(/^(王都|港町)/, '').replace(/村$/, '')}の${dir}の${TILE_NAME[t] || '野原'}`;
  }

  // ---------- 世帯 ----------
  formHouseholds() {
    const S = this.S, P = S.people, Y = S.startYear, R = this.rng;
    const alive = this.living();
    const assigned = new Map();
    const newHh = (members, s) => {
      const id = S.nextHh++;
      S.households[id] = { id, members: [], house: null, s, money: 0, food: 0, comfort: 0, name: '' };
      for (const m of members) join(m, id);
      return id;
    };
    const join = (p, id) => { S.households[id].members.push(p.id); assigned.set(p.id, id); p.hh = id; };
    // 王家
    for (const k of KINGDOMS.keys()) {
      const king = alive.find((p) => p.rank === 'king' && this.town(p.s).kingdom === k);
      if (!king) continue;
      const royals = alive.filter((p) => p.rank === 'royal' && p.s === king.s);
      const id = newHh([king, ...royals], king.s);
      S.households[id].royal = true;
    }
    // 盗賊団
    const hideouts = {};
    for (const p of alive.filter((q) => q.bandit)) {
      if (!hideouts[p.hideout]) { hideouts[p.hideout] = newHh([p], p.s); S.households[hideouts[p.hideout]].bandits = true; S.households[hideouts[p.hideout]].house = p.hideout; }
      else join(p, hideouts[p.hideout]);
    }
    // 旅人・吟遊詩人
    for (const p of alive.filter((q) => q.homeless && !assigned.has(q.id))) { const id = newHh([p], p.s); S.households[id].wander = true; }
    // 夫婦と未婚の子
    for (const p of alive) {
      if (assigned.has(p.id) || p.sex !== 'm' || p.spouseId == null) continue;
      const w = P[p.spouseId];
      if (!w || w.deathYear != null || assigned.has(w.id)) continue;
      const id = newHh([p, w], p.s);
      for (const cid of new Set([...p.children, ...w.children])) {
        const c = P[cid];
        if (c && c.deathYear == null && c.spouseId == null && !assigned.has(c.id) && c.s === p.s) join(c, id);
      }
    }
    const rest = alive.filter((p) => !assigned.has(p.id)).sort((a, b) => a.birthYear - b.birthYear);
    for (const p of rest) {
      if (assigned.has(p.id)) continue;
      const age = Y - p.birthYear;
      if (p.job === 'beggar') { const id = newHh([p], p.s); S.households[id].street = true; continue; }
      const par = [P[p.fatherId], P[p.motherId]].find((q) => q && assigned.has(q.id) && q.s === p.s && !S.households[assigned.get(q.id)].bandits && !S.households[assigned.get(q.id)].wander);
      if (par && p.spouseId == null) { join(p, assigned.get(par.id)); continue; }
      const kid = p.children.map((c) => P[c]).find((c) => c && c.deathYear == null && assigned.has(c.id) && c.s === p.s);
      if (age >= 60 && kid && !S.households[assigned.get(kid.id)].royal) { join(p, assigned.get(kid.id)); continue; }
      if (age < 16) {
        const kin = [...ancestors(P, p, 3).keys()].map((id) => P[id]).find((q) => q && assigned.has(q.id) && q.s === p.s)
          || siblings(P, p).find((q) => q.deathYear == null && assigned.has(q.id) && q.s === p.s);
        if (kin) { join(p, assigned.get(kin.id)); continue; }
      }
      const id = newHh([p], p.s);
      for (const cid of p.children) { const c = P[cid]; if (c && c.deathYear == null && c.spouseId == null && !assigned.has(c.id) && c.s === p.s) join(c, id); }
    }
    // 子どもだけの世帯は吸収
    for (const hh of Object.values(S.households)) {
      if (hh.members.every((id) => Y - P[id].birthYear < 16) && !hh.royal) {
        const target = Object.values(S.households).find((h) => h !== hh && h.s === hh.s && h.members.length && !h.bandits && !h.wander && !h.street && !h.royal);
        if (!target) continue;
        for (const id of hh.members) join(P[id], target.id);
        delete S.households[hh.id];
      }
    }
    // 名前・家
    const mansions = {};
    for (const s of S.world.settlements) mansions[s.id] = s.buildings.map((id) => this.building(id)).filter((b) => b.type === 'mansion');
    for (const hh of Object.values(S.households)) {
      const mem = hh.members.map((id) => P[id]);
      const head = mem.slice().sort((a, b) => (a.sex === 'm' ? -1 : 1) - (b.sex === 'm' ? -1 : 1) || a.birthYear - b.birthYear)[0];
      hh.name = hh.royal ? `${head.family}王家` : hh.bandits ? '盗賊団' : `${head.family}家`;
      const rich = mem.some((q) => q.rank === 'noble') ? 400 : hh.royal ? 0 : 0;
      hh.money = Math.round(R.range(50, 160) + rich + (head.job === 'merchant' ? 150 : 0) - (hh.street ? 140 : 0));
      if (hh.money < 3) hh.money = R.int(1, 8);
      hh.food = hh.street ? 1 : mem.length * 4;
      const s = this.town(hh.s);
      if (hh.royal) { hh.house = s.castle ?? null; if (hh.house != null) this.building(hh.house).hh = hh.id; continue; }
      if (hh.bandits || hh.wander || hh.street) continue;
      if (mem.some((q) => q.rank === 'noble') && mansions[s.id].length) {
        const b = mansions[s.id].shift();
        hh.house = b.id; b.hh = hh.id; b.name = `${head.family}家の屋敷`;
        continue;
      }
      const b = this.placeHouse(s) || (s.extraR = (s.extraR || 0) + 3, this.placeHouse(s));
      if (b) { hh.house = b.id; b.hh = hh.id; b.name = hh.name; }
    }
    // 家がない世帯は同じ町の別の世帯に同居
    for (const hh of Object.values(S.households)) {
      if (hh.house != null || hh.bandits || hh.wander || hh.street) continue;
      const host = Object.values(S.households).find((h) => h.s === hh.s && h.house != null && !h.royal && !h.bandits);
      if (!host) { hh.street = true; continue; }
      for (const id of hh.members) { host.members.push(id); P[id].hh = host.id; }
      host.money += hh.money; host.food += hh.food;
      delete S.households[hh.id];
    }
  }

  initTowns() {
    for (const s of this.S.world.settlements) {
      const stock = {}, price = {};
      for (const [k, g] of Object.entries(GOODS)) {
        const mul = s.type === 'capital' ? 1.3 : s.type === 'port' ? (k === 'fish' ? 1.8 : 0.9) : (k === 'wheat' ? 1.4 : 0.7);
        stock[k] = g.target * mul; price[k] = g.base;
      }
      this.S.towns[s.id] = { stock, price, commission: 0, fund: 200, history: [], occupied: false, damage: 0 };
    }
  }

  initLiving() {
    const S = this.S, R = this.rng, Y = S.startYear;
    const alive = this.living();
    for (const p of alive) {
      p.needs = { survival: 90, sleep: R.range(60, 95), hunger: R.range(55, 90), lust: R.range(50, 95), sloth: R.range(50, 90), pleasure: R.range(40, 90), esteem: R.range(40, 90) };
      p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = [];
      p.tool = R.range(0.3, 1); p.workedToday = 0; p.pregnant = p.sex === 'f' && p.spouseId != null && Y - p.birthYear >= 18 && Y - p.birthYear <= 40 && R.chance(0.12) ? R.int(1, 10) : 0; p.cooldown = 0; p.q = {}; p.skill = {}; p.danger = {};
      p.fame = p.deeds.length * 5 + (p.hero ? 40 : 0);
      p.style = speechStyle(p, this.ageOf(p));
      p.traits = traitLabels(p);
      p.lv = 1 + Math.floor(clamp((JOBS[p.job]?.combat || 0) * 2 + R.range(0, 3) + (this.ageOf(p) > 30 ? 1 : 0), 0, 9));
      if (p.job) p.skill[p.job] = clamp(0.2 + Math.min(this.ageOf(p) - 14, 30) / 40 + R.range(-0.1, 0.1), 0.05, 0.95);
      p.inv = []; p.eq = {};
      if (this.ageOf(p) >= 14) starterKit(p, R);
      Object.assign(p, humanStats(this, p));
      p.hp = p.maxhp;
      if (this.ageOf(p) >= 68 && p.job && !['king', 'royal', 'noble'].includes(p.job)) { p.formerJob = p.job; p.job = null; }
      const hh = this.hh(p);
      const home = hh.house != null ? this.building(hh.house) : null;
      const s = this.townOf(p);
      p.pos = home ? { x: home.door.x, z: home.door.z } : { x: s.x + R.int(-1, 1), z: s.z + R.int(-1, 1) };
      p.inside = home && !home.open ? home.id : null; p.path = []; p.action = null;
      if (p.prisonDays) { const pr = this.townBuilding(this.capitalOf(p), 'prison'); if (pr) { p.inside = pr.id; p.pos = { ...pr.door }; p.jail = pr.id; } }
      for (const n of p.notes) {
        const t = Math.min(-1, (n.y - Y) * DAYS_PER_YEAR - R.int(1, DAYS_PER_YEAR - 1));
        p.memories.push({ t, txt: n.txt, emo: n.emo, imp: n.imp, about: n.about, k: n.k, src: 'self', ageAt: n.y - p.birthYear });
      }
      for (const [id, d] of this.ancestors(p)) {
        const a = S.people[id];
        if (d < 2 || d > 5 || !a.deeds.length || !R.chance(0.5)) continue;
        const term = this.kinTerm(p, a) || 'ご先祖';
        p.memories.push({ t: -(this.ageOf(p) - R.int(4, 10)) * DAYS_PER_YEAR, txt: `${term}の${a.given}は${R.pick(a.deeds)}と聞かされて育った`, emo: 0.3, imp: 0.45, about: [a.id], k: 'story', src: 'story', ageAt: R.int(4, 10) });
      }
    }
    // 人間関係（同じ町・親族・同じ身分の上層）
    const byTown = {};
    for (const p of alive) (byTown[p.s] = byTown[p.s] || []).push(p);
    const link = (a, b) => {
      if (a.rel[b.id]) return;
      const compat = 1 - (Math.abs(a.pers.E - b.pers.E) + Math.abs(a.pers.A - b.pers.A) + Math.abs(a.pers.O - b.pers.O) + Math.abs(a.values.faith - b.values.faith)) / 4;
      const base = (compat - 0.55) * 60 + (a.pers.A + b.pers.A - 1) * 15;
      let fa = a.s === b.s ? 20 : 5, aa = base + R.gauss(0, 10), ab = base + R.gauss(0, 10);
      if (a.hh === b.hh) fa = 95;
      const kin = this.kinTerm(a, b);
      if (kin) {
        fa = Math.max(fa, 65);
        const bonus = ['夫', '妻'].includes(kin) ? R.gauss(55, 25) : ['父', '母', '息子', '娘'].includes(kin) ? R.gauss(45, 20) : ['兄', '弟', '姉', '妹'].includes(kin) ? R.gauss(30, 25) : R.gauss(20, 12);
        aa += bonus; ab += bonus;
      }
      // 身分差
      const dl = this.rankLv(a) - this.rankLv(b);
      if (Math.abs(dl) >= 3) { aa -= dl > 0 ? 5 : -5; ab += dl > 0 ? 3 : -8; }
      const ageA = this.ageOf(a), ageB = this.ageOf(b);
      const grew = !a.origin && !b.origin && a.s === b.s && Math.abs(ageA - ageB) <= 3 && Math.min(ageA, ageB) >= 7 && !kin;
      if (grew && R.chance(0.09)) {
        const sh = R.pick(CHILD_PLAY), ageAt = R.int(6, Math.min(12, Math.min(ageA, ageB)));
        aa += 40; ab += 40; fa = Math.max(fa, 75);
        this.sharedMemory(a, b, sh, ageAt, 0.6, 0.6);
      } else if (grew && R.chance(0.035)) {
        const sh = R.pick(CHILD_FIGHT), ageAt = R.int(8, Math.min(13, Math.min(ageA, ageB)));
        aa -= 35; ab -= 35; fa = Math.max(fa, 60);
        this.sharedMemory(a, b, sh, ageAt, -0.4, 0.55);
      }
      a.rel[b.id] = { a: clamp(aa, -100, 100), f: fa };
      b.rel[a.id] = { a: clamp(ab, -100, 100), f: fa };
    };
    for (const list of Object.values(byTown)) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) link(list[i], list[j]);
    for (const p of alive) {
      for (const id of [p.fatherId, p.motherId, p.spouseId, ...p.children]) { const q = S.people[id]; if (q && q.deathYear == null) link(p, q); }
      if (['king', 'royal', 'noble'].includes(p.rank)) for (const q of alive) if (['king', 'royal', 'noble'].includes(q.rank) && q !== p && R.chance(0.3)) link(p, q);
    }
    for (const p of alive) { this.trimMemories(p); }
  }

  sharedMemory(a, b, sh, ageAt, emo, imp) {
    for (const [x, y] of [[a, b], [b, a]]) x.memories.push({ t: -(this.ageOf(x) - ageAt) * DAYS_PER_YEAR - this.rng.int(1, 30), txt: `${y.given}と${sh}`, sh, emo, imp, about: [y.id], k: 'friend', src: 'self', ageAt });
  }

  trimMemories(p) {
    const today = this.today;
    if (p.memories.length > MEM_CAP) {
      const score = (m) => m.imp * (m.t < 0 ? 0.85 : 1) + (m.t > today - 5 ? 1 : 0) - (today - m.t) * 0.002;
      p.memories.sort((x, y) => score(y) - score(x));
      p.memories.length = MEM_CAP;
    }
    p.memories.sort((x, y) => x.t - y.t || (x.min || 0) - (y.min || 0));
  }

  remember(p, txt, opt = {}) {
    if (!p.memories) return;
    p.memories.push({ t: opt.t ?? this.today, min: this.S.t, txt, emo: opt.emo ?? 0, imp: opt.imp ?? 0.3, about: opt.about || [], k: opt.k || 'life', src: opt.src || 'self', g: opt.g, ageAt: this.ageOf(p), where: opt.where });
    if (p.memories.length > MEM_CAP + 15) this.trimMemories(p);
  }

  gossip(subj, pred, emo, witnesses, opt = {}) {
    const key = 'g' + this.S.gossipSeq++;
    const g = { key, subj: subj.id, pred, emo, congrat: opt.congrat || null };
    rumorBirth(this, g, subj, witnesses);
    if (subj.gk) subj.gk[key] = 1;
    for (const w of witnesses) {
      if (w.id === subj.id || w.deathYear != null || !w.gk) continue;
      const aff = this.rel(w, subj).a;
      this.remember(w, `${subj.given}が${pred}`, { t: opt.t, emo: emo * (aff > 0 ? 1 : -0.3), imp: opt.imp ?? 0.55, about: [subj.id], k: 'news', g });
      w.gk[key] = 1;
    }
    if (!opt.silent) this.pushLog(`${this.fullName(subj)}が${pred}。`, opt.kind || 'event', [subj.id], subj.pos);
    return g;
  }

  pushLog(text, kind = 'talk', ids = [], pos = null) {
    const e = { t: this.S.t, text, kind, ids, x: pos?.x, z: pos?.z };
    this.S.log.push(e);
    if (this.S.log.length > 400) this.S.log.splice(0, this.S.log.length - 400);
    this.events.push({ type: 'log', entry: e });
  }
  // 大きな出来事（ニュース速報・注目カメラ用）
  news(text, imp = 1, pos = null) {
    const n = { t: this.S.t, text, imp, x: pos?.x, z: pos?.z };
    this.S.news.push(n);
    if (this.S.news.length > 80) this.S.news.shift();
    this.events.push({ type: 'news', entry: n });
    this.pushLog(text, 'news', [], pos);
  }
  chron(text, k) { this.S.chronicle.push({ y: this.year(), k, text }); }

  // ---------- 経済 ----------
  market(sid) { return this.S.towns[sid]; }
  price(g, sid = 0) { return Math.max(1, Math.round(this.S.towns[sid].price[g])); }
  priceRatio(g, sid = 0) { return this.S.towns[sid].price[g] / GOODS[g].base; }
  updatePrices() {
    for (const m of Object.values(this.S.towns)) for (const [k, g] of Object.entries(GOODS)) {
      const target = g.base * clamp(Math.pow(g.target / (m.stock[k] + g.target * 0.25), 0.55), 0.45, 3.5);
      m.price[k] += (target - m.price[k]) * 0.25;
    }
  }
  sell(p, good, qty) {
    const m = this.market(p.s), hh = this.hh(p);
    const earn = qty * m.price[good] * 0.85 * tradeMul(p);
    m.stock[good] += qty; hh.money += earn;
    return earn;
  }
  buy(p, good, qty) {
    const m = this.market(p.s), hh = this.hh(p);
    qty = Math.min(qty, Math.floor(m.stock[good]), Math.floor(hh.money / m.price[good]));
    if (qty <= 0) return 0;
    const cost = qty * m.price[good];
    m.stock[good] -= qty; hh.money -= cost; m.commission += cost * 0.06;
    return qty;
  }
  hasTech(p, tech) { const k = this.kingdomOf(p); return k && k.techs.includes(tech); }

  // ---------- 行動の場所 ----------
  homeOf(p) { const hh = this.hh(p); return hh && hh.house != null ? this.building(hh.house) : null; }
  randomNear(x, z, r, pred) {
    for (let i = 0; i < 30; i++) {
      const nx = Math.round(x + this.rng.range(-r, r)), nz = Math.round(z + this.rng.range(-r, r));
      const t = tileAt(this.S.world, nx, nz);
      if (walkable(t) && t !== T.BLD && (!pred || pred(t, nx, nz))) return { x: nx, z: nz };
    }
    return null;
  }
  placeFor(p, kind) {
    const R = this.rng, s = this.townOf(p), w = this.S.world;
    switch (kind) {
      case 'home': {
        const b = this.homeOf(p);
        if (b) return { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id };
        const inn = this.townBuilding(s, 'tavern');
        if (inn && this.householdMoney(p) >= 3) return { x: inn.door.x, z: inn.door.z, bld: inn.id, inn: true };
        return this.randomNear(s.x, s.z, 2) || { x: s.x, z: s.z };
      }
      case 'field': {
        const f = w.fields.filter((q) => q.s === p.s);
        return f.length ? { ...R.pick(f) } : this.placeFor(p, 'plaza');
      }
      case 'ranch': return s.ranch ? { x: R.int(s.ranch.x0, s.ranch.x1), z: R.int(s.ranch.z0, s.ranch.z1) } : this.placeFor(p, 'field');
      case 'forest': return this.randomNear(s.x, s.z, s.r + 12, (t, x, z) => (t === T.FOREST || t === T.DENSE || t === T.JUNGLE) && !tooDangerous(this, p, x, z)) || this.placeFor(p, 'field');
      case 'wild': return this.randomNear(s.x, s.z, s.r + 16, (t, x, z) => !tooDangerous(this, p, x, z) && (t === T.FOREST || t === T.GRASS || t === T.DENSE || t === T.SAVANNA)) || this.placeFor(p, 'field');
      case 'gate': {
        if (s.gates?.length) { const g = s.gates[(p.id + Math.floor(this.today / 3)) % s.gates.length]; return { x: g.x - g.dx, z: g.z - g.dz }; }
        return this.placeFor(p, 'patrol');
      }
      case 'shore': {
        if (s.dock) return { ...R.pick(s.dock) };
        return this.randomNear(s.x, s.z, s.r + 10, (t, x, z) => !tooDangerous(this, p, x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const tt = tileAt(w, x + a, z + b); return tt === T.RIVER || tt === T.SEA; })) || this.placeFor(p, 'field');
      }
      case 'dock': return s.dock ? { ...R.pick(s.dock) } : this.placeFor(p, 'shore');
      case 'mine': {
        const m = s.mine != null ? this.building(s.mine) : null;
        return m ? { x: m.door.x, z: m.door.z, bld: m.id } : this.placeFor(p, 'field');
      }
      case 'plaza': return this.randomNear(s.x, s.z, (s.plaza?.r || 1) + 1) || { x: s.x, z: s.z };
      case 'patrol': return this.randomNear(s.x, s.z, s.r) || { x: s.x, z: s.z };
      case 'road': case 'hideout': {
        if (p.hideout != null) { const b = this.building(p.hideout); return { x: b.door.x, z: b.door.z, bld: b.id }; }
        return this.placeFor(p, 'plaza');
      }
      default: {
        let b = this.townBuilding(s, kind);
        if (!b && kind === 'observatory') b = this.building(w.specials.map((id) => this.building(id)).find((x) => x.type === 'observatory')?.id);
        if (!b && kind === 'magictower') b = this.townBuilding(this.capitalOf(p), 'magictower');
        if (!b && ['barracks', 'castle', 'mansion', 'guild', 'prison'].includes(kind)) b = this.townBuilding(this.capitalOf(p), kind);
        if (!b && kind === 'church') b = this.townBuilding(s, 'church');
        if (!b && (kind === 'clinic' || kind === 'school')) b = this.townBuilding(s, 'church');
        if (!b && kind === 'mill') return this.placeFor(p, 'field');
        if (!b && kind === 'stable') return this.placeFor(p, 'ranch');
        if (!b) return this.placeFor(p, 'plaza');
        return { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id };
      }
    }
  }
  capitalOf(p) { const k = this.townOf(p).kingdom; return this.S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === k); }
  chunkKey(x, z) { return (Math.floor(x / 8)) * 100 + Math.floor(z / 8); }
  dangerous(p, x, z) { return (p.danger?.[this.chunkKey(x, z)] || 0) > 1.5; }
  learnDanger(p, x, z, v) {
    if (!p.danger) return;
    const k = this.chunkKey(x, z);
    p.danger[k] = Math.min(10, (p.danger[k] || 0) + v);
  }

  // ---------- 意思決定 ----------
  decide(p) {
    const R = this.rng, h = this.hour(), age = this.ageOf(p), hh = this.hh(p), n = p.needs;
    const rest = this.isRestDay() || calendarHalfDay(this, p.s);
    const cands = [];
    const wm = weatherMood(this, p);
    const add = (score, type, place, dur, extra = {}) => { if (score > -50) cands.push({ score: score + R.range(0, 1.2) + (p.q[type] || 0) * 1.5 + weatherBias(wm, type), type, place, dur, ...extra }); };
    const s = this.townOf(p);
    const job = p.job;

    // 囚人
    if (p.jail != null) {
      const b = this.building(p.jail);
      // 牢では一日二度、粗末な食事が配られる
      if (n.hunger < 45 && (h >= 7 && h < 8 || h >= 17 && h < 18)) n.hunger = Math.min(100, n.hunger + 50);
      this.startAction(p, { type: h >= 21 || h < 6 ? 'sleep' : 'jail', place: { x: b.door.x, z: b.door.z, bld: b.id }, dur: 120 });
      return;
    }
    const sick = sickAction(this, p);
    if (sick) { this.startAction(p, sick); return; }
    // 特別な任務（行軍・討伐・逃走）
    if (p.mission) {
      const m = p.mission;
      if (m.until && this.S.t > m.until) { p.mission = null; }
      else { this.startAction(p, { type: m.type, place: { x: m.x, z: m.z, bld: m.bld ?? null }, dur: m.dur || 60 }); return; }
    }
    // ギャザリング
    for (const g of this.S.gatherings) {
      if (this.S.t >= g.from && this.S.t < g.to && (!g.ids || g.ids.includes(p.id)) && (g.s == null || g.s === p.s)) {
        add(9, g.type, g.place === 'plaza' ? this.placeFor(p, 'plaza') : this.placeFor(p, g.place), Math.max(20, (g.to - this.S.t) / 1.2));
      }
    }
    // 生存欲：危険なら逃げる
    if (n.survival < 35) {
      const home = this.placeFor(p, s.occupied ? 'castle' : 'home');
      add(10 + (35 - n.survival) / 5, 'flee', home, 60);
    }
    const sp = sleepPlan(this, p, h, age);
    const bedtime = sp.bedtime;
    if (bedtime) add(6 + (100 - n.sleep) / 20 - (job === 'thief' ? 4 : 0) + sp.bias, 'sleep', this.placeFor(p, 'home'), 0, { untilHour: sp.untilHour });
    else if (n.sleep < 15) add(4.5, 'sleep', this.placeFor(p, 'home'), 120);

    const mealTime = (h >= 6 && h < 8.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20);
    // 小さな子は自分で食べ物を探さない。家の蓄えから食べさせてもらう
    if (age < 6 && n.hunger < 55 && hh.food >= 0.5) { hh.food -= 0.5; n.hunger = Math.min(100, n.hunger + 50); }
    if (n.hunger < 60 && !bedtime && age >= 6) {
      const sc = (100 - n.hunger) / 14 + (mealTime ? 2.5 : 0);
      const innMeal = this.price('bread', p.s) * 2 + 1;
      if (hh.food >= 1 && hh.house != null) add(sc, 'eat', this.placeFor(p, 'home'), 30);
      else if (hh.money >= this.price('bread', p.s) && h >= 6 && h < 21) add(sc + 0.5, 'shop', this.placeFor(p, 'market'), 20, { food: true });
      else if (spendable(this, p) >= innMeal && this.townBuilding(this.town(p.s), 'tavern')) add(sc + 0.3, 'eat', this.placeFor(p, 'tavern'), 30, { food: 'inn' });
      else if (n.hunger < 35) add(sc + (job === 'beggar' ? 2 : 0), 'beg', this.placeFor(p, 'plaza'), 60);
    }
    const workAge = age >= 14 && age <= 67 && job;
    const workHours = h >= 7 && h < 17;
    if (workAge && job !== 'thief' && job !== 'beggar' && workHours && (!rest || ['innkeeper', 'guard', 'knight', 'soldier', 'jailer', 'king', 'servant'].includes(job)) && p.workedToday < 9 * 60 && n.sleep > 15) {
      const skill = p.skill[job] || 0.3;
      const wp = careerWorkPlace(this, p) || this.placeFor(p, JOBS[job].place);
      const unsafe = wp && !JOBS[job].combat && tooDangerous(this, p, wp.x, wp.z);
      add(3 + p.pers.C * 3 + p.values.ambition + skill - (100 - n.sloth) / 30 - (unsafe ? 8 : 0), 'work', unsafe ? this.placeFor(p, 'plaza') : wp, R.int(60, 150));
    }
    if (job === 'innkeeper' && h >= 17 && h < 23) add(5, 'work', this.placeFor(p, 'tavern'), 90);
    if ((job === 'guard' || job === 'knight') && (h >= 20 || h < 2) && R.chance(0.3)) add(4, 'work', this.placeFor(p, 'patrol'), 60);
    if (job === 'bard' && h >= 17 && h < 23) add(5 + (100 - n.esteem) / 25, 'perform', this.placeFor(p, 'tavern'), 80);
    // 仕事の種類ごとの目的
    if (isAdventurer(p) && workAge && h >= 7 && h < 19 && p.hp > p.maxhp * 0.5) {
      const qp = questPlace(this, p);
      if (qp) add(7 + p.values.courage * 2 + p.values.ambition * 2, qp.type, qp.place, qp.type === 'gather' ? 60 : 90, { quest: qp.quest, friend: qp.target });
      else if ((this.S.quests || []).some((q) => q.state === 'open' && q.s === p.s)) add(4 + p.values.ambition * 2 + (100 - n.esteem) / 30, 'guild', this.placeFor(p, 'guild'), 20);
      else { const quest = this.findQuest(p); if (quest) add(2 + p.values.courage * 2, 'quest', quest, 120, { quest }); }
    } else if (['knight', 'wizard', 'courtmage'].includes(job) && workAge && h >= 7 && h < 18 && p.hp > p.maxhp * 0.6) {
      const quest = this.findQuest(p);
      if (quest) add(2 + p.values.courage * 3 + p.values.ambition, 'quest', quest, 120, { quest });
    }
    // 装備を買いそろえる（戦う職業）・道具を買う（働く職業）
    if (age >= 14 && h >= 8 && h < 18 && this.wantsGear(p)) add(4, 'buygear', this.placeFor(p, 'smithy'), 15);
    if ((job === 'merchant') && workAge && h >= 6 && h < 12 && R.chance(0.25)) {
      const trade = this.findTrade(p);
      if (trade) add(5 + p.values.ambition * 2, 'trade', trade.place, 60, { trade });
    }
    if ((job === 'wanderer' || job === 'bard') && h >= 7 && h < 15 && R.chance(0.35)) {
      const dest = R.pick(this.S.world.settlements.filter((q) => q.id !== p.s && Math.hypot(q.x - s.x, q.z - s.z) < 55));
      if (dest) add(4 + p.pers.O * 2, 'travel', { x: dest.x, z: dest.z, dest: dest.id }, 60, { dest: dest.id });
    }
    // 悪事
    const crime = tryCrime(this, p);
    if (crime) add(crime.score, crime.type, crime.place, crime.dur, crime);
    // 生活
    if (age >= 14 && h >= 7 && h < 20 && ((hh.food < hh.members.length * 4 && hh.money > this.price('bread', p.s) * 2 && hh.house != null) )) add(3 + (hh.food < hh.members.length ? 2 : 0), 'shop', this.placeFor(p, 'market'), 25);
    if (age >= 16 && h >= 17 && h < 23 && hh.money > 25) add(-(hh.money < 70 ? 1.5 : 0) + (100 - n.pleasure) / 22 + p.pers.E * 1.4 + (rest ? 0.5 : 0), 'tavern', this.placeFor(p, 'tavern'), R.int(50, 120));
    if (h >= 8 && h < 20) add((100 - n.pleasure) / 40 + (100 - n.esteem) / 45 + p.pers.E * 1.2 + (rest ? 1.2 : 0), 'plaza', this.placeFor(p, 'plaza'), R.int(30, 80));
    if (h >= 9 && h < 20) {
      const friends = Object.entries(p.rel).filter(([id, r]) => r.a > 35 && this.S.people[id]?.deathYear == null && this.S.people[id].hh !== p.hh && this.S.people[id].s === p.s);
      if (friends.length) {
        const [fid] = R.pick(friends);
        const f = this.S.people[fid];
        add((100 - n.esteem) / 40 + p.pers.A * 0.8 + (rest ? 1 : 0), 'visit', this.placeFor(f, 'home'), R.int(30, 70), { friend: f.id });
      }
    }
    // 性欲（恋慕・親密）
    if (age >= 17 && n.lust < 55) {
      if (p.spouseId != null && h >= 19 && h < 23) add((100 - n.lust) / 18, 'home', this.placeFor(p, 'home'), R.int(40, 90), { intimacy: true });
      else if (p.spouseId == null && h >= 9 && h < 21) {
        const crush = this.crushOf(p);
        if (crush) add((100 - n.lust) / 20 + p.pers.E, 'court', this.placeFor(crush, crush.inside ? 'home' : 'plaza'), 40, { friend: crush.id });
      }
    }
    if (h >= 7 && h < 19.5) add((100 - n.pleasure) / 32 + p.pers.O * 1.1 + (100 - n.sloth) / 60, 'stroll', this.strollSpot(p), R.int(20, 60));
    const recentGrief = p.memories.some((m) => m.k === 'death' && this.today - m.t < 10);
    if (h >= 7 && h < 19) add(p.values.faith * 2 + (rest && h < 12 ? 3 : 0) + (recentGrief ? 2 : 0) + (job === 'priest' ? 1 : 0) + (n.survival < 60 ? 1.5 : 0), 'pray', this.placeFor(p, 'church'), R.int(20, 50));
    if (age >= 6 && age < 14 && h >= 8 && h < 12 && !rest && !bedtime) add(5 + p.pers.C * 2, 'school', this.placeFor(p, 'school'), R.int(90, 180));
    if (age >= 68 && h >= 9 && h < 17) add(2.5 + p.pers.E * 2, 'storytell', this.placeFor(p, 'plaza'), R.int(40, 90));
    if (age < 13 && h >= 7.5 && h < 19) add(3.5 + (100 - n.pleasure) / 25, 'play', R.chance(0.6) ? this.placeFor(p, 'plaza') : this.randomNear(s.x, s.z, s.r, (t) => t !== T.BLD) || this.placeFor(p, 'plaza'), R.int(30, 90));
    if (['soldier', 'knight', 'adventurer'].includes(job) && h >= 7 && h < 18 && workAge) add(2 + p.values.ambition * 2 + (100 - n.esteem) / 40, 'train', this.placeFor(p, job === 'adventurer' ? 'guild' : 'barracks'), R.int(60, 120));
    add(1.2 + (1 - p.pers.E) + (100 - n.sloth) / 18 + (p.hp < p.maxhp * 0.7 ? 2 : 0), 'rest', this.placeFor(p, 'home'), R.int(30, 80));

    choreOptions(this, p, add);
    careerOptions(this, p, add);
    financeCandidates(this, p, add);
    underworldDecide(this, p, cands, add);
    healthDecide(this, p, cands, add);
    cands.sort((a, b) => b.score - a.score);
    let c = cands[0];
    if (c.type === 'beg') {
      const helper = this.findHelper(p);
      if (helper && (job !== 'beggar' || R.chance(0.4))) c = { ...c, type: 'askfood', place: this.placeFor(helper, 'home'), helper: helper.id };
    }
    this.startAction(p, c);
  }

  strollSpot(p) {
    const s = this.townOf(p);
    const r = s.r + 3 + p.pers.O * 6 * p.values.courage;
    return this.randomNear(s.x, s.z, r, (t, x, z) => t !== T.BLD && !tooDangerous(this, p, x, z)) || this.placeFor(p, 'plaza');
  }

  crushOf(p) {
    let best = null, bs = 30;
    for (const [id, r] of Object.entries(p.rel)) {
      const q = this.S.people[id];
      if (!q || q.deathYear != null || q.sex === p.sex || q.spouseId != null || q.jail != null || this.S.wanted[q.id]) continue;
      const qa = this.ageOf(q);
      if (qa < 17 || Math.abs(qa - this.ageOf(p)) > 14 || q.s !== p.s) continue;
      const sc = r.a + (r.f / 5);
      if (sc > bs && !this.isKin(p, q)) { bs = sc; best = q; }
    }
    return best;
  }

  findHelper(p) {
    let best = null, ba = -1e9;
    for (const [id, r] of Object.entries(p.rel)) {
      const q = this.S.people[id];
      if (!q || q.deathYear != null || q.hh === p.hh || q.s !== p.s) continue;
      const hh = this.hh(q);
      if (!hh || hh.food <= hh.members.length * 2 || hh.house == null) continue;
      const sc = r.a + (this.kinTerm(p, q) ? 40 : 0) + q.pers.A * 30;
      if (sc > ba && sc > 10) { ba = sc; best = q; }
    }
    return best;
  }

  findQuest(p) {
    // 冒険者の目的：懸賞金のかかった魔物・ダンジョン・盗賊のアジト
    const w = this.S.world, s = this.townOf(p);
    const opts = [];
    for (const c of Object.values(this.S.creatures)) {
      if (!c.hostile || c.hp <= 0) continue;
      const d = Math.hypot(c.pos.x - s.x, c.pos.z - s.z);
      if (d > 40) continue;
      const risk = c.lv * 3 + c.atk + c.maxhp / 10 - p.lv * 4 - p.atk - p.maxhp / 10;
      if (risk > 10 + p.values.courage * 10) continue;
      opts.push({ w: 50 / (d + 5) + (c.bounty || 0) / 20 - Math.max(0, risk) * 0.2 * (1 - p.values.courage), x: Math.round(c.pos.x), z: Math.round(c.pos.z), target: c.id, label: c.name });
    }
    for (const id of w.specials) {
      const b = this.building(id);
      if (!['cave', 'pyramid', 'ruins', 'hideout'].includes(b.type)) continue;
      const d = Math.hypot(b.x - s.x, b.z - s.z);
      if (d > 60) continue;
      opts.push({ w: 30 / (d + 10) + (b.bounty || 0) / 15 + p.pers.O, x: b.door.x, z: b.door.z, target: 'b' + b.id, label: b.name });
    }
    if (!opts.length) return null;
    return this.rng.weighted(opts, (o) => Math.max(0.05, o.w));
  }

  findTrade(p) {
    const here = this.market(p.s);
    let best = null, bv = 1.25;
    for (const s of this.S.world.settlements) {
      if (s.id === p.s || this.S.towns[s.id].occupied) continue;
      const d = Math.hypot(s.x - this.townOf(p).x, s.z - this.townOf(p).z);
      if (d > 60) continue;
      const there = this.market(s.id);
      for (const g of Object.keys(GOODS)) {
        if (here.stock[g] < 4) continue;
        const ratio = there.price[g] / here.price[g];
        if (ratio > bv) { bv = ratio; best = { good: g, dest: s.id, place: { x: s.x, z: s.z } }; }
      }
    }
    return best;
  }

  startAction(p, c) {
    if (p.inside && c.place && c.place.bld === p.inside) {
      // 同じ建物の中で次の行動に移る（出入口でちらつかない）
      p.action = { type: c.type, dur: c.dur, bld: p.inside, phase: 'walk', untilHour: c.untilHour, friend: c.friend, helper: c.helper, food: c.food, quest: c.quest, trade: c.trade, dest: c.dest, intimacy: c.intimacy, crimeTarget: c.crimeTarget, startNeeds: { ...p.needs }, startMood: p.mood };
      p.path = [];
      this.arrive(p);
      p.thought = null;
      return;
    }
    if (p.inside) { const b = this.building(p.inside); p.pos = { x: b.door.x, z: b.door.z }; p.inside = null; }
    p.action = { type: c.type, dur: c.dur, until: null, bld: c.place?.bld ?? null, phase: 'walk', untilHour: c.untilHour, friend: c.friend, helper: c.helper, food: c.food, quest: c.quest, trade: c.trade, dest: c.dest, intimacy: c.intimacy, crimeTarget: c.crimeTarget, inn: c.place?.inn, startNeeds: { ...p.needs }, startMood: p.mood };
    const tgt = c.place || { x: Math.round(p.pos.x), z: Math.round(p.pos.z) };
    p.action.tx = tgt.x; p.action.tz = tgt.z;
    p.path = null; // 経路は順番待ちで計算する
    p.thought = null;
  }

  computePath(p) {
    const a = p.action;
    const sx = Math.round(p.pos.x), sz = Math.round(p.pos.z);
    const brave = (JOBS[p.job]?.combat || 0) >= 2 || ['quest', 'crusade', 'march', 'defend'].includes(a.type);
    // たどり着けないと分かった目的地は、しばらく探し直さない（探索の空回りを防ぐ）
    this._noPath = this._noPath || new Map();
    const key = a.tx * 1000 + a.tz;
    const bad = this._noPath.get(key);
    const path = bad && bad > this.S.t ? null : findPath(this.S.world, sx, sz, a.tx, a.tz, 26000, brave ? null : this.S.dangerMap);
    if (!path && !(bad > this.S.t)) { this._noPath.set(key, this.S.t + 120); if (this._noPath.size > 500) this._noPath.clear(); }
    if (!path) {
      // たどり着けない：近くの歩ける場所へ
      const alt = this.randomNear(a.tx, a.tz, 2);
      const p2 = alt && findPath(this.S.world, sx, sz, alt.x, alt.z, 12000);
      p.path = p2 || [];
      if (!p2) { a.bld = null; }
    } else p.path = path;
  }

  arrive(p) {
    const a = p.action;
    a.phase = 'do';
    if (a.bld != null) p.inside = a.bld;
    if (a.untilHour != null) {
      let add = (a.untilHour - this.hour()) * 60;
      if (add < 0) add += 24 * 60;
      a.until = this.S.t + Math.max(30, add);
    } else a.until = this.S.t + (a.dur || 30);
    const hh = this.hh(p);
    switch (a.type) {
      case 'shop': this.doShop(p); break;
      case 'eat':
        if (a.food === 'inn') { const cost = this.price('bread', p.s) * 2 + 1; if (spendable(this, p) >= cost) { pay(this, p, cost); p.needs.hunger = Math.min(100, p.needs.hunger + 65); const keeper = this.living().find((q) => q.job === 'innkeeper' && q.s === p.s); if (keeper && this.hh(keeper)) this.hh(keeper).money += cost * 0.8; } }
        else if (hh.food >= 1) { hh.food -= 1; p.needs.hunger = Math.min(100, p.needs.hunger + 60); }
        break;
      case 'askfood': {
        const helper = this.S.people[a.helper];
        const hh2 = helper && helper.deathYear == null && this.hh(helper);
        if (hh2 && hh2.food >= 2) {
          hh2.food -= 1; p.needs.hunger = Math.min(100, p.needs.hunger + 55);
          this.remember(p, `${helper.given}の家で食べ物を分けてもらった`, { emo: 0.6, imp: 0.6, about: [helper.id], k: 'help' });
          this.relMut(p, helper).a += 10;
          this.remember(helper, `困っていた${p.given}に食べ物を分けてあげた`, { emo: 0.4, imp: 0.4, about: [p.id] });
          helper.needs.esteem = Math.min(100, helper.needs.esteem + 15);
          this.pushLog(`${p.given}は${helper.given}の家で食べ物を分けてもらった。`, 'event', [p.id, helper.id], p.pos);
        } else this.hungry(p);
        a.until = this.S.t + 15;
        break;
      }
      case 'beg': break;
      case 'tavern': {
        const qty = this.rng.int(1, 2) + (p.pers.N > 0.7 && this.rng.chance(0.3) ? 1 : 0);
        const m = this.market(p.s);
        const cost = qty * m.price.ale;
        if (spendable(this, p) > cost) {
          pay(this, p, cost);
          const keeper = this.living().find((q) => q.job === 'innkeeper' && q.s === p.s);
          if (keeper) this.hh(keeper).money += cost * 0.9;
          m.stock.ale = Math.max(0, m.stock.ale - qty);
          if (qty >= 3 && this.rng.chance(0.2 + p.pers.E * 0.2)) {
            const pred = this.rng.pick(['酒場で飲みすぎて大声で歌い出した', '酒場で酔っぱらってテーブルの上で踊った', '酒場で飲みすぎて椅子から転げ落ちた']);
            this.gossip(p, pred, -0.1, this.living().filter((q) => q.inside === p.inside && q.id !== p.id), { silent: true });
          }
        }
        break;
      }
      case 'sleep':
        if (a.inn) { const cost = 3; if (spendable(this, p) >= cost) pay(this, p, cost); }
        break;
      case 'travel': {
        if (a.dest != null) {
          const from = this.townOf(p);
          p.s = a.dest;
          const to = this.townOf(p);
          this.remember(p, `${from.name}から${to.name}へ旅をした`, { emo: 0.3, imp: 0.35, k: 'travel' });
          p.needs.pleasure = Math.min(100, p.needs.pleasure + 25);
          for (const q of this.living()) if (q.s === p.s && q !== p && !p.rel[q.id] && this.rng.chance(0.3)) { p.rel[q.id] = { a: 5, f: 10 }; q.rel[p.id] = { a: 5, f: 10 }; }
        }
        break;
      }
      case 'trade': this.doTrade(p); break;
      case 'deliver': {
        const locals = this.living().filter((q) => q.s === p.mission?.dest && q !== p);
        const news = p.memories.filter((m) => m.g && this.today - m.t < 10).slice(-3);
        for (const q of this.rng.shuffle(locals).slice(0, 6)) for (const m of news) {
          if (q.gk[m.g.key]) continue;
          q.gk[m.g.key] = 1;
          const g2 = rumorRelay(this, p, q, m.g);
          const s2 = this.S.people[g2.subj];
          if (s2) this.remember(q, `伝令の${p.given}から、${s2.given}が${g2.pred}と聞いた`, { emo: g2.emo * 0.6, imp: 0.45, about: [s2.id], k: 'news', src: 'heard', g: g2 });
        }
        p.mission = null;
        break;
      }
      case 'quest': break;
      case 'steal': case 'rob': case 'revenge': crimeArrive(this, p); break;
      case 'guild': takeQuest(this, p); a.until = this.S.t + 5; break;
      case 'report': reportQuest(this, p); a.until = this.S.t + 10; break;
      case 'buygear': this.buyGear(p); a.until = this.S.t + 10; break;
      case 'hunt': huntBounty(this, p, this.S.people[a.friend]); a.until = this.S.t + 5; break;
      case 'collect': financeArrive(this, p); break;
      case 'housecall': case 'grave': healthArrive(this, p); break;
    }
    underworldArrive(this, p);
    choreArrive(this, p, a);
  }

  doShop(p) {
    const hh = this.hh(p), m = this.market(p.s);
    const want = hh.members.length * 4;
    let guard = 20;
    while (hh.food < want && guard-- > 0 && hh.house != null) {
      const opts = ['bread', 'fish', 'wheat', 'meat'].filter((g) => m.stock[g] >= 1 && hh.money >= m.price[g]);
      if (!opts.length) break;
      const g = opts.sort((a, b) => m.price[a] / GOODS[a].meals - m.price[b] / GOODS[b].meals)[0];
      if (!this.buy(p, g, 1)) break;
      hh.food += GOODS[g].meals;
      if (g === 'meat') p.needs.pleasure = Math.min(100, p.needs.pleasure + 8);
    }
    if (hh.house == null && p.needs.hunger < 60) {
      const g = ['bread', 'fish', 'wheat'].find((x) => m.stock[x] >= 1 && hh.money >= m.price[x]);
      if (g && this.buy(p, g, 1)) p.needs.hunger = Math.min(100, p.needs.hunger + 30 * GOODS[g].meals);
    }
    if (isAdventurer(p) || JOBS[p.job]?.combat) {
      while (countItem(p, 'potion') < 2 && m.stock.medicine >= 1 && hh.money > m.price.medicine + 15 && this.buy(p, 'medicine', 1)) addItem(p, makeItem('potion'));
    }
    if (hh.money > 380 && m.stock.furniture >= 1 && this.rng.chance(0.12) && this.buy(p, 'furniture', 1)) {
      hh.comfort += 1;
      this.remember(p, '新しい家具を買った', { emo: 0.6, imp: 0.4 });
      p.needs.esteem = Math.min(100, p.needs.esteem + 20);
      this.gossip(p, '新しい家具を買った', 0.3, this.nearby(p, 8), { silent: true });
    }
  }

  doTrade(p) {
    const tr = p.action.trade;
    if (!tr) return;
    const hh = this.hh(p);
    const from = this.market(p.s), to = this.market(tr.dest);
    // 出発地で仕入れ済みとみなし、到着地で売る
    const qty = Math.min(10, Math.floor(from.stock[tr.good] / 2), Math.floor(hh.money / from.price[tr.good]));
    if (qty <= 0) return;
    from.stock[tr.good] -= qty; hh.money -= qty * from.price[tr.good];
    const earn = qty * to.price[tr.good] * 0.92;
    to.stock[tr.good] += qty; hh.money += earn;
    const profit = earn - qty * from.price[tr.good];
    this.remember(p, `${this.town(tr.dest).name}で${GOODS[tr.good].name}を売って${Math.round(profit)}銅貨もうけた`, { emo: profit > 0 ? 0.5 : -0.4, imp: 0.45, k: 'trade' });
    p.needs.esteem = Math.min(100, p.needs.esteem + (profit > 0 ? 15 : -5));
    // 帰りは家へ
    p.mission = null;
  }

  doWork(p, dt) {
    const hh = this.hh(p), m = this.market(p.s), hr = dt / 60;
    const skill = p.skill[p.job] ?? 0.3;
    p.skill[p.job] = Math.min(1, skill + 0.0008 * hr * (1 - skill) * (0.5 + p.pers.O));
    if (skill < 0.9 && p.skill[p.job] >= 0.9) {
      this.remember(p, `${JOBS[p.job].name}として一人前以上の腕になったと感じた`, { emo: 0.7, imp: 0.8 });
      p.deeds.push(`名の知れた${JOBS[p.job].name}だった`);
      this.gossip(p, `${JOBS[p.job].name}の名人と呼ばれるようになった`, 0.5, this.living().filter((q) => q.s === p.s), { congrat: '名人と呼ばれてるんだってね' });
      p.fame += 10;
    }
    const tool = p.eq?.tool;
    const toolMul = tool ? 0.7 + 0.35 * tool.q : 0.6;
    if (tool) { tool.dur -= 0.004 * hr; if (tool.dur <= 0) { p.inv.splice(p.inv.indexOf(tool), 1); p.eq.tool = null; this.remember(p, `長年使った${itemName(tool)}がとうとう壊れた`, { emo: -0.3, imp: 0.3 }); } }
    const si = this.seasonIdx();
    const sm = [0.5, 0.9, 2.4, 0.08][si] * (this.hasTech(p, 'rotation') ? 1.25 : 1) * harvestMul(this, p.s);
    const eff = (0.6 + p.pers.C * 0.3 + skill * 0.6) * toolMul * hr * weatherWorkMul(this, p) * workMul(p) * underworldWorkMul(p) * healthWorkMul(p);
    const occupied = this.S.towns[p.s].occupied;
    if (occupied) return;
    switch (p.job) {
      case 'farmer': {
        const q = fieldShare(this, p, 1.1 * sm * this.S.harvest * eff);
        if (hh.food < hh.members.length * 3) hh.food += q; else this.sell(p, 'wheat', q);
        break;
      }
      case 'rancher': this.sell(p, 'meat', 0.35 * eff); break;
      case 'hunter': {
        if (!p.fight && this.rng.chance(0.05 * dt)) {
          let prey = null, bd = 9;
          for (const c of Object.values(this.S.creatures)) {
            if (c.kind !== 'wild' || c.hp <= 0 || c.atk > p.atk * 1.5) continue;
            const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
            if (d < bd) { bd = d; prey = c; }
          }
          if (prey) startFight(this, p, prey);
        }
        break;
      }
      case 'fisher': case 'sailor': this.sell(p, 'fish', 0.75 * (si === 3 ? 0.5 : 1) * (this.hasTech(p, 'navigation') ? 1.3 : 1) * eff); break;
      case 'woodcutter': this.sell(p, 'wood', 1.6 * eff); break;
      case 'miner': {
        this.sell(p, 'ore', 0.9 * eff);
        if (this.rng.chance(0.0015 * dt)) {
          this.sell(p, 'gem', 1);
          this.remember(p, '鉱山の奥で宝石を掘り当てた', { emo: 0.9, imp: 0.8 });
          this.gossip(p, '鉱山で宝石を掘り当てた', 0.6, this.living().filter((q) => q.s === p.s), { congrat: '宝石を掘り当てたんだってね' });
          p.needs.esteem = 100;
        }
        break;
      }
      case 'baker': {
        const need = 1 * eff;
        if (m.stock.wheat >= need && m.stock.bread < GOODS.bread.target * 1.6) { m.stock.wheat -= need; hh.money -= need * m.price.wheat * 0.9; this.sell(p, 'bread', need * 1.8); }
        break;
      }
      case 'smith': { this.forge(p, dt, eff); break; }
      case 'carpenter': {
        const need = 1 * eff;
        if (m.stock.wood >= need && m.stock.furniture < GOODS.furniture.target * 2) { m.stock.wood -= need; hh.money -= need * m.price.wood * 0.9; this.sell(p, 'furniture', need * 0.1); }
        hh.money += 1.5 * hr;
        break;
      }
      case 'tailor': this.sell(p, 'cloth', 0.25 * eff); break;
      case 'innkeeper': {
        const need = 0.8 * eff;
        if (m.stock.wheat >= need && m.stock.ale < GOODS.ale.target * 1.5) { m.stock.wheat -= need; hh.money -= need * m.price.wheat * 0.9; m.stock.ale += need * 3; }
        break;
      }
      case 'merchant': {
        hh.money += m.commission; m.commission = 0;
        for (const [k, g] of Object.entries(GOODS)) if (m.stock[k] < g.target * 0.2) m.stock[k] += g.target * 0.1 * hr;
        break;
      }
      case 'priest': case 'elder': case 'jailer': case 'servant': case 'guard': case 'soldier': case 'knight': {
        const k = this.kingdomOf(p);
        const pay = ({ knight: 1.4, soldier: 1, guard: 1, jailer: 0.9, servant: 0.8, priest: 1, elder: 0.7 }[p.job]) * hr;
        if (k && k.treasury > pay) { k.treasury -= pay; hh.money += pay; } else hh.money += pay * 0.3;
        if (['soldier', 'knight'].includes(p.job)) { p.xp = (p.xp || 0) + 0.3 * hr; this.levelCheck(p); }
        break;
      }
      case 'scholar': case 'wizard': {
        const k = this.kingdomOf(p);
        const pts = 0.3 * (JOBS[p.job].research || 1) * (0.5 + skill) * (this.hasTech(p, 'printing') ? 1.4 : 1) * hr;
        if (k) { k.research += pts; k.contrib[p.id] = (k.contrib[p.id] || 0) + pts; }
        hh.money += 2.5 * hr;
        break;
      }
      case 'king': case 'royal': case 'noble': {
        // 統治・社交（政治は politics.js）
        hh.money += (p.job === 'noble' ? 4 : 0) * hr;
        break;
      }
      default: this.genericWork(p, dt, eff);
    }
  }

  // 追加の職業：生産・給金・奉仕
  genericWork(p, dt, eff) {
    const J = JOBS[p.job], hh = this.hh(p), m = this.market(p.s), hr = dt / 60, R = this.rng, S = this.S;
    if (!J) return;
    const k = this.kingdomOf(p);
    if (J.pay) { const pay = J.pay * hr; if (k && k.treasury > pay) { k.treasury -= pay; hh.money += pay; } else hh.money += pay * 0.3; }
    if (J.research && k) { const pts = 0.3 * J.research * (0.5 + (p.skill[p.job] || 0.3)) * hr; k.research += pts; k.contrib[p.id] = (k.contrib[p.id] || 0) + pts; }
    if (J.combat && !J.pay) { p.xp = (p.xp || 0) + 0.2 * hr; this.levelCheck(p); }
    if (J.goods) {
      const rate = { medicine: 0.12, jewelry: 0.03, gem: 0.02, shoes: 0.15, pottery: 0.3, cloth: 0.25, wool: 0.4, honey: 0.35, herbs: 0.6, stone: 0.8, meat: 0.3, ale: 0.8, wood: 1.2, fish: 0.6, furniture: 0.08 }[J.goods] ?? 0.3;
      if (J.goods === 'medicine' && m.stock.herbs >= 1) m.stock.herbs -= 0.5 * eff;
      if (J.goods === 'jewelry' && m.stock.gem >= 0.1) m.stock.gem -= 0.03 * eff;
      if (J.goods === 'cloth' && m.stock.wool >= 0.5) m.stock.wool -= 0.3 * eff;
      if (m.stock[J.goods] < (GOODS[J.goods]?.target || 10) * 2) this.sell(p, J.goods, rate * eff);
    }
    const near = (r) => this.living().filter((q) => q !== p && (p.inside != null ? q.inside === p.inside : !q.inside && Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.z - p.pos.z) < r));
    switch (J.svc) {
      case 'finance': if (k) k.treasury += 4 * hr * (0.5 + p.pers.C); break;
      case 'advise': if (k) k.advisor = p.id; break;
      case 'command': if (k) k.general = p.id; p.xp = (p.xp || 0) + 0.4 * hr; this.levelCheck(p); break;
      case 'feed': { const royal = Object.values(S.households).find((h) => h.royal && h.s === p.s); if (royal) royal.food += 1.5 * hr; break; }
      case 'entertain': case 'service': {
        const aud = near(4);
        for (const q of aud) {
          q.needs.pleasure = Math.min(100, q.needs.pleasure + 10 * hr);
          if (R.chance(0.1 * hr) && this.householdMoney(q) > 20) { const tip = R.int(1, 3); this.hh(q).money -= tip; hh.money += tip; }
        }
        p.needs.esteem = Math.min(100, p.needs.esteem + aud.length * 3 * hr);
        break;
      }
      case 'heal': {
        for (const q of near(3)) if (q.hp < q.maxhp) { q.hp = Math.min(q.maxhp, q.hp + 12 * hr * (0.5 + (p.skill[p.job] || 0.3)) * healMul(p)); if (R.chance(0.05)) { this.remember(q, `${p.given}に傷を手当てしてもらった`, { emo: 0.5, imp: 0.4, about: [p.id] }); this.relMut(q, p).a += 4; } }
        S.towns[p.s].healer = this.today;
        break;
      }
      case 'birth': S.towns[p.s].midwife = this.today; break;
      case 'teach': {
        const kids = near(4).filter((q) => this.ageOf(q) >= 6 && this.ageOf(q) < 14);
        for (const q of kids) { q.skill.study = Math.min(1, (q.skill.study || 0) + 0.004 * hr); q.pers.O = Math.min(0.97, q.pers.O + 0.0005 * hr); }
        p.needs.esteem = Math.min(100, p.needs.esteem + kids.length * 2 * hr);
        break;
      }
      case 'bank': { const fee = Math.min(2 * hr, S.towns[p.s].fund * 0.001); S.towns[p.s].fund -= fee; hh.money += fee + 1 * hr; break; }
      case 'mill': if (m.stock.wheat > 4) { m.stock.wheat -= 1.2 * hr; m.stock.bread += 1.5 * hr; hh.money += 1.5 * hr; } break;
      case 'childcare': for (const q of this.living()) if (q.hh === p.hh && this.ageOf(q) < 10) q.needs.pleasure = Math.min(100, q.needs.pleasure + 8 * hr); break;
      case 'trade': for (const g of ['cloth', 'jewelry', 'pottery', 'honey']) if (m.stock[g] < GOODS[g].target * 0.5) m.stock[g] += 0.1 * hr; hh.money += 2 * hr; break;
      case 'quests': {
        if (R.chance(0.02 * dt)) {
          const s = this.townOf(p);
          const c = Object.values(S.creatures).find((x) => x.hostile && !x.dormant && Math.hypot(x.pos.x - s.x, x.pos.z - s.z) < 30 && !x.bounty);
          if (c) { c.bounty = 20 + c.lv * 10; this.pushLog(`冒険者ギルドが${c.name}に${c.bounty}銅貨の賞金をかけた。`, 'event', [p.id], p.pos); }
        }
        break;
      }
      case 'story': this.tellStories(p, near(5)); break;
      case 'news': break;
    }
    // 仕える・世話をする仕事の中身
    switch (p.job) {
      case 'gardener': case 'butler': case 'maid': {
        // 仕える家（王家・貴族）の暮らしが整う
        const lord = Object.values(S.households).find((h) => h.s === p.s && (h.royal || h.members.some((id) => S.people[id]?.rank === 'noble')) && h.id !== p.hh);
        if (lord) { lord.comfort = Math.min(10, (lord.comfort || 0) + 0.05 * hr); lord.laundry = Math.max(0, (lord.laundry || 0) - 0.5 * hr); lord.water = Math.min(10, (lord.water ?? 5) + 0.5 * hr); }
        if (p.job === 'gardener' && R.chance(0.02 * hr)) m.stock.herbs = (m.stock.herbs || 0) + 0.5;
        break;
      }
      case 'gravedigger': {
        // 墓の手入れと弔いの手伝い。町の蓄えから手間賃
        const recent = S.graves.slice(-20).map((id) => S.people[id]).filter((d) => d && d.s === p.s && this.today - (d.deathDay || 0) <= 1).length;
        if (recent && S.towns[p.s].fund > 5) { const fee = Math.min(4, S.towns[p.s].fund * 0.02) * hr; S.towns[p.s].fund -= fee; hh.money += fee; }
        for (const q of near(4)) if (q.action?.type === 'funeral' || q.action?.type === 'grave') q.mood = Math.min(100, (q.mood || 50) + 2 * hr);
        break;
      }
      case 'keeper': S.towns[p.s].lighthouse = S.t; break; // 灯台の火が船を守る（嵐の被害が減る）
      case 'stablehand': {
        for (const c of Object.values(S.creatures)) if (c.sp === 'horse' && c.owner === p.s && Math.abs(c.pos.x - p.pos.x) + Math.abs(c.pos.z - p.pos.z) < 6) { c.hunger = 100; c.hp = Math.min(c.maxhp, c.hp + 2 * hr); }
        break;
      }
      case 'watchman': case 'guard': {
        // 見回り：盗みや追いはぎの現場を見つけたら取り押さえる
        const culprit = near(7).find((q) => ['steal', 'rob'].includes(q.action?.type) && q.action.phase === 'do');
        if (culprit && R.chance(0.5)) { markWanted(this, culprit, culprit.action.type === 'steal' ? '盗み' : '追いはぎ', 10); this.pushLog(`${JOBS[p.job].name}の${p.given}が、${culprit.given}の悪事を見つけて笛を吹いた。`, 'event', [p.id, culprit.id], p.pos); }
        break;
      }
      case 'royalguard': {
        const king = k && S.people[k.kingId];
        if (king && king.hp < king.maxhp) king.hp = Math.min(king.maxhp, king.hp + 1 * hr);
        break;
      }
    }
    // 悪党の仕事
    if (p.job === 'pickpocket' && R.chance(0.03 * dt)) {
      const v = near(2).find((q) => (q.purse || 0) > 8 && q.hh !== p.hh);
      if (v) {
        const loot = Math.min(20, v.purse * 0.6);
        v.purse -= loot; p.purse = (p.purse || 0) + loot;
        if (R.chance(0.25 + v.pers.C * 0.3)) {
          this.remember(v, `人ごみで${p.given}に財布をすられかけた`, { emo: -0.6, imp: 0.6, about: [p.id], k: 'theft' });
          markWanted(this, p, 'スリ', 6);
        } else this.remember(v, 'いつの間にか財布の銅貨が減っていた', { emo: -0.5, imp: 0.4, k: 'theft' });
      }
    }
    if (p.job === 'swindler' && R.chance(0.02 * dt)) {
      const v = near(2).find((q) => this.householdMoney(q) > 40 && q.pers.O > 0.5 && q.hh !== p.hh);
      if (v) {
        const loot = Math.min(25, spendable(this, v) * 0.15);
        pay(this, v, loot); earn(this, p, loot, 0.6);
        this.remember(v, `${p.given}から「幸運のお守り」を${Math.round(loot)}銅貨で買った`, { emo: 0.2, imp: 0.4, about: [p.id] });
        if (R.chance(0.3)) { this.remember(v, `${p.given}に騙されていたと気づいた`, { emo: -0.8, imp: 0.7, about: [p.id], k: 'theft' }); this.relMut(v, p).a -= 30; }
      }
    }
    if (p.job === 'messenger' && R.chance(0.004 * dt)) {
      const dest = R.pick(this.S.world.settlements.filter((q) => q.id !== p.s && q.kingdom === this.townOf(p).kingdom && !S.towns[q.id].occupied));
      if (dest) { p.mission = { type: 'deliver', x: dest.x, z: dest.z, until: S.t + 60 * 20, dest: dest.id }; p.action = null; }
    }
  }

  // 語り部：子どもたちに昔話を聞かせる
  tellStories(p, audience) {
    const kids = audience.filter((q) => this.ageOf(q) < 16);
    if (!kids.length || !this.rng.chance(0.05)) return;
    const R = this.rng;
    const ev = R.pick(this.S.chronicle.filter((c) => c.y > 0 && c.y < this.year() - 10 && !/人が生まれ/.test(c.text)));
    if (!ev) return;
    for (const q of kids) this.remember(q, `${p.given}から「${ev.text}」という昔話を聞いた`, { emo: 0.3, imp: 0.5, about: [p.id], k: 'story', src: 'heard' });
    p.needs.esteem = Math.min(100, p.needs.esteem + 15);
    if (this.isWatched(p)) this.events.push({ type: 'say', id: p.id, text: `昔むかし、${ev.y}年のこと……${ev.text}。` });
  }

  // 鍛冶：鉱石から鉄を作り、素材から品物を打って店に並べる
  forge(p, dt, eff) {
    const hh = this.hh(p), m = this.market(p.s), R = this.rng, town = this.S.towns[p.s];
    town.mats = town.mats || {}; town.shop = town.shop || [];
    if (m.stock.ore >= 1 && (town.mats.iron || 0) < 12) { m.stock.ore -= 0.8 * eff; hh.money -= 0.8 * eff * m.price.ore * 0.9; town.mats.iron = (town.mats.iron || 0) + 0.4 * eff; }
    p.forgeT = (p.forgeT || 0) + dt;
    if (p.forgeT < 90 || town.shop.length >= 14) { hh.money += 1 * dt / 60; return; }
    p.forgeT = 0;
    const skill = p.skill.smith || 0.3;
    const wantTools = town.shop.filter((x) => ITEMS[x.id].type === 'tool').length < 4;
    const recipes = Object.entries(ITEMS).filter(([id, d]) => d.mat && ['weapon', 'armor', 'shield', 'tool'].includes(d.type) && !d.rare && Object.entries(d.mat).every(([k, n]) => k === 'wood' ? m.stock.wood >= n : k === 'cloth' ? m.stock.cloth >= n : (town.mats[k] || 0) >= n) && (wantTools ? d.type === 'tool' : true) && (d.value < 120 || skill > 0.6));
    if (!recipes.length) return;
    const [id, d] = R.pick(recipes);
    for (const [k, n] of Object.entries(d.mat)) { if (k === 'wood') m.stock.wood -= n; else if (k === 'cloth') m.stock.cloth -= n; else town.mats[k] -= n; }
    // 名工でも普段は上等どまり。伝説級は、腕の立つ者にごくまれに訪れる会心の一打
    let q = Math.max(0.5, Math.min(1.5, 0.55 + skill * 0.7 + R.gauss(0, 0.1) + (this.hasTech(p, 'steel') ? 0.08 : 0)));
    if (d.type !== 'tool' && skill > 0.7 && R.chance(0.004 * skill)) q = R.range(1.56, 1.8);
    const it = makeItem(id, q, { maker: p.id });
    town.shop.push(it);
    p.skill.smith = Math.min(1, skill + 0.01);
    if (q >= 1.55) {
      p.deeds.push(`伝説の${d.name}を打ち上げた`); p.fame += 20; p.needs.esteem = 100;
      this.remember(p, `生涯最高の${d.name}を打ち上げた`, { emo: 1, imp: 1, k: 'craft' });
      this.news(`${this.townOf(p).name}の鍛冶屋${p.given}が伝説級の${d.name}を打ち上げた`, 2, p.pos);
    }
  }

  wantsGear(p) {
    const town = this.S.towns[p.s];
    const hh = this.hh(p);
    if (!town?.shop?.length || !hh) return false;
    const J = JOBS[p.job];
    if (J && J.combat) return town.shop.some((it) => this.isUpgrade(p, it) && itemValue(it) * 1.2 < spendable(this, p) - 20);
    const toolFor = Object.keys(ITEMS).find((k) => ITEMS[k].type === 'tool' && ITEMS[k].jobs.includes(p.job));
    return toolFor && !p.eq?.tool && town.shop.some((it) => it.id === toolFor) && hh.money > 25;
  }
  isUpgrade(p, it) {
    const d = ITEMS[it.id];
    if (!['weapon', 'armor', 'shield', 'accessory'].includes(d.type)) return false;
    const cur = p.eq?.[d.type];
    const sc = (x) => ((ITEMS[x.id].atk || 0) + (ITEMS[x.id].def || 0)) * x.q;
    return !cur || sc(it) > sc(cur) * 1.2;
  }
  buyGear(p) {
    const town = this.S.towns[p.s], hh = this.hh(p);
    if (!town.shop) return;
    const J = JOBS[p.job];
    let cands = J?.combat ? town.shop.filter((it) => this.isUpgrade(p, it)) : town.shop.filter((it) => ITEMS[it.id].type === 'tool' && ITEMS[it.id].jobs.includes(p.job));
    cands = cands.filter((it) => itemValue(it) * 1.2 <= spendable(this, p) - 10).sort((a, b) => itemValue(b) - itemValue(a));
    const it = cands[0];
    if (!it) return;
    const price = Math.round(itemValue(it) * 1.2);
    pay(this, p, price);
    town.shop.splice(town.shop.indexOf(it), 1);
    const smith = this.S.people[it.maker];
    if (smith && smith.deathYear == null && this.hh(smith)) this.hh(smith).money += price;
    // 古い装備は下取りに出す
    const old = p.eq?.[ITEMS[it.id].type];
    addItem(p, it); autoEquip(p);
    if (old && old !== p.eq[ITEMS[it.id].type]) { p.inv.splice(p.inv.indexOf(old), 1); p.purse = (p.purse || 0) + Math.round(itemValue(old) * 0.4); }
    Object.assign(p, humanStats(this, p));
    this.remember(p, `鍛冶場で${itemName(it)}を${price}銅貨で買った`, { emo: 0.5, imp: 0.4, k: 'gear' });
    p.needs.esteem = Math.min(100, p.needs.esteem + 10);
  }

  levelCheck(p) { growthLevelCheck(this, p); }

  // ---------- 1ステップ ----------
  step(dt) {
    const S = this.S;
    const prevDay = this.dayIndex, prevHour = Math.floor(this.hour());
    S.t += dt;
    if (this.dayIndex !== prevDay) this.newDay();
    if (Math.floor(this.hour()) !== prevHour) this.newHour();
    const people = this.living();
    const hr = dt / 60;
    this.pathBudget = 8;
    const heal = S.kingdoms.map((k) => (k.techs.includes('healing') ? 3 : 1.5));
    const setl = S.world.settlements;
    for (const p of people) {
      if (p.deathYear != null) continue;
      const a = p.action, n = p.needs;
      const sleeping = a && a.type === 'sleep' && a.phase === 'do';
      const age = this.ageOf(p);
      const sleepRate = p.sleepType === 'short' ? 4.2 : p.sleepType === 'long' ? 6.8 : 5.4;
      const regen = p.sleepType === 'short' ? 22 : p.sleepType === 'long' ? 11 : 15;
      n.hunger = clamp(n.hunger - (sleeping ? 2 : 5.2) * hr, 0, 100);
      n.sleep = clamp(n.sleep + (sleeping ? regen : -sleepRate) * hr, 0, 100);
      n.sloth = clamp(n.sloth + (a?.type === 'work' || a?.type === 'train' ? -8 * (1.4 - p.pers.C) : sleeping || a?.type === 'rest' ? 10 : -1) * hr, 0, 100);
      n.pleasure = clamp(n.pleasure - (sleeping ? 0.3 : 2.4) * hr, 0, 100);
      n.esteem = clamp(n.esteem - (0.6 + p.values.ambition * 1.4) * hr, 0, 100);
      if (age >= 16) n.lust = clamp(n.lust - (age > 60 ? 0.4 : 1.4) * hr, 0, 100); else n.lust = 100;
      n.survival = clamp(n.survival + (p.hp < p.maxhp * 0.5 ? -8 : 6) * hr, 0, 100);
      if (!sleeping && p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + (heal[setl[p.s].kingdom] || 1.5) * hr);
      if (sleeping) p.hp = Math.min(p.maxhp, p.hp + 4 * hr);
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.fight) continue; // 戦闘中は society.js が処理
      p._spot = (p._spot || 0) - dt;
      if (p._spot <= 0 && this._cgrid) { p._spot = 1; if (spotThreats(this, p, this._cgrid, around)) continue; }
      if (p.talk) { this.stepTalk(p); continue; }
      if (!a) { this.decide(p); continue; }
      if (a.phase === 'walk') {
        if (!p.path) { if (this.pathBudget-- > 0) this.computePath(p); else continue; }
        this.walk(p, dt);
      } else {
        this.doAction(p, dt);
      }
    }
    stepCreatures(this, dt);
    this._defend = (this._defend || 0) - dt;
    if (this._defend <= 0) { this._defend = 5; defendTowns(this); }
    stepCombat(this, dt);
    this.checkEncounters(people, dt);
  }

  doAction(p, dt) {
    const a = p.action, n = p.needs, hr = dt / 60, S = this.S;
    careerDo(this, p, dt);
    if (!p.action) return;
    switch (a.type) {
      case 'work': this.doWork(p, dt); p.workedToday += dt; break;
      case 'tavern': n.pleasure += 18 * hr; n.esteem += 3 * hr; break;
      case 'plaza': n.pleasure += 4 * hr; n.esteem += 2 * hr; break;
      case 'stroll': n.pleasure += 14 * hr; n.sloth += 6 * hr; break;
      case 'play': n.pleasure += 26 * hr; break;
      case 'pray': n.pleasure += 4 * hr; n.survival += 10 * hr; break;
      case 'festival': n.pleasure += 30 * hr; n.esteem += 6 * hr; break;
      case 'wedding': n.pleasure += 15 * hr; break;
      case 'home': n.sloth += 6 * hr; if (a.intimacy) { const sp = S.people[p.spouseId]; if (sp && sp.inside === p.inside) { n.lust += 40 * hr; sp.needs.lust = Math.min(100, sp.needs.lust + 30 * hr); this.relMut(p, sp).a = Math.min(100, this.rel(p, sp).a + 1 * hr); } } break;
      case 'rest': n.sloth += 12 * hr; break;
      case 'perform': {
        n.esteem += 20 * hr;
        for (const q of this.living()) if (q.inside === p.inside && q !== p) q.needs.pleasure = Math.min(100, q.needs.pleasure + 15 * hr);
        break;
      }
      case 'beg': {
        if (this.rng.chance(0.08 * dt)) {
          const giver = this.nearby(p, 4).find((q) => q.pers.A > 0.55 && this.householdMoney(q) > 20);
          if (giver) {
            const coin = this.rng.int(1, 3);
            this.hh(giver).money -= coin; this.hh(p).money += coin;
            giver.needs.esteem = Math.min(100, giver.needs.esteem + 6);
            if (this.rng.chance(0.3)) this.remember(p, `${giver.given}が銅貨を${coin}枚恵んでくれた`, { emo: 0.4, imp: 0.3, about: [giver.id] });
          }
        }
        break;
      }
      case 'train': p.xp = (p.xp || 0) + 1.2 * hr * (0.5 + p.pers.C); n.esteem += 2 * hr; this.levelCheck(p); break;
      case 'quest': this.doQuest(p); break;
      case 'jail': n.pleasure -= 2 * hr; break;
      case 'gather': {
        if (this.rng.chance(0.05 * dt)) {
          const q = questOf(this, p);
          const item = q?.type === 'gather' && q.item === 'herb' ? 'herb' : 'herb';
          addItem(p, makeItem(item));
          if (this.rng.chance(0.03)) addItem(p, makeItem('magicstone'));
        }
        break;
      }
      case 'school': {
        p.skill.study = Math.min(1, (p.skill.study || 0) + 0.002 * hr);
        n.sloth -= 4 * hr;
        if (this.rng.chance(0.004 * dt)) this.remember(p, this.rng.pick(['学校で文字の読み書きを習った', '学校で大陸の歴史を教わった', '学校で算術を習って頭が痛くなった', '学校で友だちと先生にいたずらをした']), { emo: 0.3, imp: 0.3, k: 'school' });
        break;
      }
      case 'storytell': this.tellStories(p, this.nearby(p, 5)); n.esteem += 3 * hr; break;
    }
    if (!p.action) return;
    choreDo(this, p, dt);
    for (const k of NEED_KEYS) n[k] = clamp(n[k], 0, 100);
    const wakeEarly = a.type === 'sleep' && n.sleep >= 99 && this.hour() > 4 && this.hour() < 12;
    if (S.t >= a.until || wakeEarly) {
      this.finishAction(p);
    } else if (['stroll', 'play', 'plaza', 'festival', 'beg', 'quest'].includes(a.type) && !p.inside) {
      if (this.rng.chance(0.02 * dt)) {
        const nx = Math.round(p.pos.x) + this.rng.int(-2, 2), nz = Math.round(p.pos.z) + this.rng.int(-2, 2);
        const path = findPath(S.world, Math.round(p.pos.x), Math.round(p.pos.z), nx, nz, 200);
        if (path && path.length < 6) { p.path = path; a.phase = 'walk'; a.wander = true; }
      }
    }
  }

  // 行動の結果から学ぶ（その行動の「好み」を更新する）
  finishAction(p) {
    const a = p.action;
    if (a.type === 'sleep') this.onWake(p);
    if (a.startNeeds) {
      let reward = 0;
      for (const k of NEED_KEYS) reward += (p.needs[k] - a.startNeeds[k]) * (k === 'survival' ? 2 : 1);
      reward = reward / 100 + (p.mood - a.startMood) / 50 + (p.hp < p.maxhp * 0.5 ? -0.5 : 0);
      const q = p.q[a.type] || 0;
      p.q[a.type] = clamp(q + 0.08 * (clamp(reward, -1.5, 1.5) - q), -1.5, 1.5);
    }
    if (a.type === 'quest' && a.quest) p.mission = null;
    p.action = null;
  }

  doQuest(p) {
    const a = p.action, q = a.quest;
    if (!q) return;
    if (typeof q.target === 'string' && q.target.startsWith('c')) {
      const c = this.S.creatures[q.target];
      if (!c || c.hp <= 0) { a.until = this.S.t; return; }
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 1.5) startFight(this, p, c);
      else if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 12 && this.pathBudget-- > 0) {
        const path = findPath(this.S.world, Math.round(p.pos.x), Math.round(p.pos.z), Math.round(c.pos.x), Math.round(c.pos.z), 3000);
        if (path) { p.path = path; a.phase = 'walk'; a.wander = true; }
      }
    } else if (typeof q.target === 'string' && q.target.startsWith('b')) {
      // ダンジョン探索：中の魔物と戦い、宝を見つける
      const b = this.building(+q.target.slice(1));
      if (b.type !== 'hideout' && !p.inside && Math.hypot(p.pos.x - b.door.x, p.pos.z - b.door.z) < 2) { p.inside = b.id; }
      const guards = Object.values(this.S.creatures).filter((c) => c.lair === b.id && c.inDungeon && c.hp > 0);
      if (guards.length && !a.explored) {
        if (!p.fight) startFight(this, p, guards.sort((x, y) => x.maxhp - y.maxhp)[0]);
        a.until = Math.max(a.until, this.S.t + 10);
        if (p.hp < p.maxhp * 0.3) { p.inside = null; p.pos = { ...b.door }; p.fight = null; this.remember(p, `${b.name}の奥で深手を負い、引き返した`, { emo: -0.6, imp: 0.6, k: 'quest' }); this.learnDanger(p, b.x, b.z, 2); a.until = this.S.t; a.explored = true; }
        return;
      }
      if (!a.explored && this.S.t > a.until - 20) {
        a.explored = true;
        const danger = { cave: 14, pyramid: 20, ruins: 10, hideout: 12 }[b.type] || 10;
        const power = p.atk + p.lv * 3 + p.hp / 5;
        const R = this.rng;
        const win = R.chance(clamp(power / (power + danger * (1 + this.dayIndex / 400)), 0.1, 0.92));
        if (win) {
          p.xp = (p.xp || 0) + danger * 3; this.levelCheck(p);
          const gold = R.int(5, 25) * (b.type === 'pyramid' ? 3 : 1);
          this.hh(p).money += gold;
          p.needs.esteem = Math.min(100, p.needs.esteem + 30);
          let txt = `${b.name}を探索して${gold}銅貨ぶんの戦利品を持ち帰った`;
          if (b.type !== 'hideout') { for (let i = 0; i < R.int(0, 2); i++) addItem(p, makeItem(R.pick(['magicstone', 'bone', 'iron', 'silk']))); if (R.chance(0.3)) addItem(p, makeItem(R.pick(['sword', 'axe', 'shield', 'ring', 'amulet', 'chainmail']), R.range(0.7, 1.4))); autoEquip(p); Object.assign(p, humanStats(this, p)); }
          if (b.type !== 'hideout' && R.chance(0.06 + (b.type === 'pyramid' ? 0.08 : 0))) {
            const item = R.pick(TREASURE_ITEMS);
            (p.treasures = p.treasures || []).push(item);
            txt = `${b.name}の奥で「${item}」を見つけた`;
            p.fame += 15;
            this.gossip(p, `${b.name}で「${item}」を見つけた`, 0.6, this.living().filter((x) => x.s === p.s), { congrat: 'すごいお宝を見つけたんだってね' });
            this.news(`冒険者${p.given}が${b.name}で「${item}」を発見`, 2, b.door);
            if (item === 'ファラオの黄金仮面') p.curse = 'pharaoh';
          }
          if (b.type === 'hideout') {
            b.bounty = 0;
            for (const bandit of this.living().filter((x) => x.hideout === b.id && x.jail == null)) { if (R.chance(0.5)) startFight(this, p, bandit); }
          }
          this.remember(p, txt, { emo: 0.7, imp: 0.6, k: 'quest', where: { x: b.door.x, z: b.door.z } });
          if (b.bounty) { this.hh(p).money += b.bounty; b.bounty = 0; }
          const qq = questOf(this, p);
          if (qq && qq.target === 'b' + b.id) completeQuest(this, qq);
          p.inside = null; p.pos = { ...b.door };
        } else {
          p.hp = Math.max(1, p.hp - R.int(10, 30));
          this.learnDanger(p, b.x, b.z, 3);
          p.needs.survival = Math.max(0, p.needs.survival - 40);
          this.remember(p, `${b.name}で魔物に追い返され、命からがら逃げ帰った`, { emo: -0.7, imp: 0.7, k: 'quest', where: { x: b.door.x, z: b.door.z } });
          if (p.hp < 5 && R.chance(0.15)) { this.die(p, 'monster'); return; }
        }
      }
    }
  }

  walk(p, dt) {
    const age = this.ageOf(p);
    let speed = (age < 13 ? 1.1 : age > 65 ? 0.6 : 0.95) * dt * (p.mission?.type === 'march' || p.action.type === 'flee' ? 1.2 : 1) * moveMul(p) * healthSpeedMul(p);
    const w = this.S.world;
    while (speed > 0 && p.path.length) {
      const t = p.path[0];
      const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      const cost = { [T.FOREST]: 1.4, [T.DENSE]: 1.8, [T.JUNGLE]: 1.9, [T.DESERT]: 1.3, [T.SNOW]: 1.5, [T.ROCK]: 2, [T.SWAMP]: 2 }[tileAt(w, t.x, t.z)] || 1;
      const step = speed / cost;
      if (d <= step) { p.pos.x = t.x; p.pos.z = t.z; p.path.shift(); speed -= d * cost; }
      else { p.pos.x += (dx / d) * step; p.pos.z += (dz / d) * step; speed = 0; }
    }
    if (!p.path.length) {
      if (p.action.wander) { p.action.phase = 'do'; p.action.wander = false; }
      else this.arrive(p);
    }
  }

  onWake(p) {
    if (this.hour() > 4 && this.hour() < 10 && this.rng.chance(0.05)) {
      const dreams = ['亡くなった祖母が台所でパンを焼いている夢を見た', '空を飛んで城の塔の上まで行く夢を見た', '誰かに遠くからじっと見られている夢を見た', '子どものころの家で迷子になる夢を見た', '湖の底に知らない町がある夢を見た', '赤い空の下で、角のある影がこちらを見ている夢を見た'];
      this.remember(p, this.rng.pick(dreams), { emo: 0.1, imp: 0.3, k: 'dream' });
    }
  }

  hungry(p) {
    if (!p.memories.some((m) => m.k === 'hunger' && this.today - m.t < 2)) this.remember(p, 'お腹をすかせたまま一日を過ごした', { emo: -0.6, imp: 0.5, k: 'hunger' });
  }

  nearby(p, r) {
    const out = [];
    for (const q of this.living()) if (q !== p && !q.inside && Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.z - p.pos.z) < r) out.push(q);
    return out;
  }

  // ---------- 会話 ----------
  checkEncounters(people, dt) {
    const R = this.rng;
    const grid = new Map();
    for (const p of people) {
      if (p.talk || p.fight || p.cooldown > 0 || !p.action || (p.action.type === 'sleep' && p.action.phase === 'do') || p.deathYear != null) continue;
      const key = p.inside != null ? 'b' + p.inside : Math.floor(p.pos.x / 2) + ',' + Math.floor(p.pos.z / 2);
      let arr = grid.get(key);
      if (!arr) grid.set(key, arr = []);
      arr.push(p);
    }
    for (const arr of grid.values()) {
      if (arr.length < 2) continue;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (a.talk || this.ageOf(a) < 3) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          if (b.talk || this.ageOf(b) < 3) continue;
          const rel = this.rel(a, b);
          const place = ['tavern', 'plaza', 'festival', 'wedding', 'water', 'laundry'].includes(a.action.type) ? 2.6 : a.action.phase === 'walk' ? 0.7 : a.action.type === 'work' ? 0.35 : 1;
          const visit = (a.action.friend === b.id || b.action.friend === a.id) ? 6 : 1;
          let pr = 0.035 * dt * (0.35 + a.pers.E + b.pers.E * 0.5) * (1 + (100 - a.needs.esteem) / 80) * (0.3 + rel.f / 100) * place * visit;
          if (a.talkedToday[b.id]) pr *= 0.25;
          if (R.chance(pr)) { this.startTalk(a, b); break; }
        }
      }
    }
  }

  // カメラの近くか・選ばれている人か（文章を作るかどうか）
  isWatched(p) {
    const f = this.focus;
    if (!f) return true;
    if (f.ids && f.ids.has(p.id)) return true;
    return Math.abs(p.pos.x - f.x) < f.r && Math.abs(p.pos.z - f.z) < f.r;
  }

  startTalk(a, b) {
    const watched = this.isWatched(a) || this.isWatched(b);
    const convo = composeConversation(this, a, b, !watched);
    const talk = { a: a.id, b: b.id, lines: convo.lines, i: 0, next: this.S.t, effects: convo.effects, owner: a.id, quiet: !watched };
    a.talk = talk; b.talk = talk;
    for (const p of [a, b]) if (p.action && p.action.until) p.action.until += convo.lines.length * 1.6;
  }

  stepTalk(p) {
    const talk = p.talk;
    if (talk.owner !== p.id) { if (!this.S.people[talk.owner]?.talk) p.talk = null; return; }
    const S = this.S;
    while (talk.i < talk.lines.length && S.t >= talk.next) {
      const line = talk.lines[talk.i++];
      const sp = S.people[line.id];
      if (!talk.quiet && sp) {
        this.events.push({ type: 'say', id: line.id, text: line.text });
        this.pushLog(`${sp.given}「${line.text}」`, 'talk', [talk.a, talk.b], sp.pos);
      }
      talk.next = S.t + 1.6;
    }
    if (talk.i >= talk.lines.length && S.t >= talk.next) this.endTalk(talk);
  }

  endTalk(talk) {
    const a = this.S.people[talk.a], b = this.S.people[talk.b];
    if (!a || !b) return;
    const e = talk.effects;
    a.talk = null; b.talk = null;
    // 会話の記録（誰と、いつ、何を話したか）
    const rec = { t: this.S.t, lines: talk.lines.map((l) => [l.id, l.text]), topics: e.topics?.slice(0, 4) || [], mood: e.argument ? -1 : e.romance ? 2 : (e.daA + e.daB) > 4 ? 1 : 0 };
    for (const [p, o] of [[a, b], [b, a]]) { p.talkLog = p.talkLog || []; p.talkLog.push({ ...rec, with: o.id }); if (p.talkLog.length > 20) p.talkLog.splice(0, p.talkLog.length - 20); }
    if (a.deathYear != null || b.deathYear != null) return;
    a.cooldown = this.rng.range(40, 120); b.cooldown = this.rng.range(40, 120);
    a.talkedToday[b.id] = 1; b.talkedToday[a.id] = 1;
    growthTalk(this, a, b, e);
    const ra = this.relMut(a, b), rb = this.relMut(b, a);
    ra.a = clamp(ra.a + e.daA, -100, 100); rb.a = clamp(rb.a + e.daB, -100, 100);
    ra.f = Math.min(100, ra.f + 2); rb.f = Math.min(100, rb.f + 2);
    a.needs.esteem = clamp(a.needs.esteem + 8 + (e.praiseA || 0), 0, 100); b.needs.esteem = clamp(b.needs.esteem + 8 + (e.praiseB || 0), 0, 100);
    a.needs.pleasure = Math.min(100, a.needs.pleasure + 6); b.needs.pleasure = Math.min(100, b.needs.pleasure + 6);
    for (const s of e.shared) {
      const from = this.S.people[s.from], to = this.S.people[s.to];
      if (!to || !from || to.gk[s.mem.g.key]) continue;
      to.gk[s.mem.g.key] = 1;
      const g2 = rumorRelay(this, from, to, s.mem.g);
      const subj2 = this.S.people[g2.subj]; if (!subj2) continue;
      this.remember(to, rumorHeardText(this, from, g2), { emo: g2.emo * 0.7, imp: (s.mem.imp || 0.5) * 0.8, about: [subj2.id, from.id], k: 'news', src: 'heard', g: g2 });
    }
    const fixed = rumorCorrect(this, a, b);
    if (fixed.length && !talk.quiet) { const f = fixed[0]; this.pushLog(`${this.S.people[f.who].given}は${this.S.people[f.by].given}と話して、噂が大げさだったと知った`, 'talk', [f.who, f.by]); }
    // 危険な場所の知識が伝わる
    for (const w of e.warnings || []) {
      const to = this.S.people[w.to];
      if (to) this.learnDanger(to, w.x, w.z, w.v * 0.5);
    }
    // ことわざ・口ぐせが伝わる（文化の進化）
    if (e.saying) {
      const listener = this.S.people[e.saying.to];
      if (listener && this.rel(listener, this.S.people[e.saying.from]).a > 30 && this.rng.chance(0.25)) {
        listener.saying = e.saying.text;
        addSaying(this, listener.s, e.saying.text, 0.5);
      } else addSaying(this, a.s, e.saying.text, 0.2);
    }
    if (e.argument) {
      this.remember(a, `${b.given}と口論になった`, { emo: -0.7, imp: 0.65, about: [b.id], k: 'quarrel' });
      this.remember(b, `${a.given}と口論になった`, { emo: -0.7, imp: 0.65, about: [a.id], k: 'quarrel' });
      const witnesses = this.living().filter((q) => q !== a && q !== b && ((a.inside && q.inside === a.inside) || (!a.inside && !q.inside && Math.abs(q.pos.x - a.pos.x) + Math.abs(q.pos.z - a.pos.z) < 5)));
      if (witnesses.length) { const g = this.gossip(a, `${b.given}と大声で言い争っていた`, -0.4, witnesses, { silent: talk.quiet }); b.gk[g.key] = 1; }
      if (ra.a < -80 && a.pers.A < 0.25 && a.pers.N > 0.65) a.revenge = b.id;
    }
    if (e.romance) {
      this.remember(a, `${b.given}と話していて胸が高鳴った`, { emo: 0.8, imp: 0.7, about: [b.id], k: 'romance' });
      this.remember(b, `${a.given}に想いを打ち明けられた気がする`, { emo: 0.7, imp: 0.7, about: [a.id], k: 'romance' });
      ra.a = clamp(ra.a + 8, -100, 100); rb.a = clamp(rb.a + 8, -100, 100);
      a.needs.lust = Math.min(100, a.needs.lust + 20); b.needs.lust = Math.min(100, b.needs.lust + 15);
      this.maybeEngage(a, b);
    }
  }

  maybeEngage(a, b) {
    const ra = this.rel(a, b), rb = this.rel(b, a);
    if (ra.a < 72 || rb.a < 68 || a.spouseId != null || b.spouseId != null || this.S.wanted[a.id] || this.S.wanted[b.id]) return;
    if (this.S.pendingWeddings.some((w) => [w.a, w.b].includes(a.id) || [w.a, w.b].includes(b.id))) return;
    // 身分違い
    const gap = Math.abs(this.rankLv(a) - this.rankLv(b));
    if (gap >= 3) {
      const higher = this.rankLv(a) > this.rankLv(b) ? a : b;
      const fam = this.living().filter((q) => q.hh === higher.hh && q !== higher && this.isAdult(q));
      if (fam.some((q) => q.pers.A < 0.5)) {
        for (const x of [a, b]) this.remember(x, `${(x === a ? b : a).given}との結婚を、身分の違いを理由に反対された`, { emo: -0.8, imp: 0.9, k: 'romance' });
        this.gossip(a, `${b.given}との身分違いの恋を反対されたらしい`, -0.3, this.living().filter((q) => q.s === a.s && this.rng.chance(0.3)));
        if (a.pers.O > 0.6 && b.pers.O > 0.6 && this.rng.chance(0.4)) this.elope(a, b);
        return;
      }
    }
    const day = this.dayIndex + 3;
    const from = day * 1440 + 14 * 60;
    const guests = this.living().filter((q) => q.hh === a.hh || q.hh === b.hh || (this.rel(q, a).a > 30 && q.s === a.s) || (q.job === 'priest' && q.s === a.s)).map((q) => q.id);
    this.S.pendingWeddings.push({ a: a.id, b: b.id, at: from + 90 });
    this.S.gatherings.push({ type: 'wedding', place: 'church', from, to: from + 120, ids: guests, s: a.s, label: `${a.given}と${b.given}の婚礼` });
    this.remember(a, `${b.given}と結婚の約束をした`, { emo: 0.95, imp: 0.95, about: [b.id], k: 'engage' });
    this.remember(b, `${a.given}と結婚の約束をした`, { emo: 0.95, imp: 0.95, about: [a.id], k: 'engage' });
    this.gossip(a, `${b.given}と婚約した`, 0.8, this.living().filter((q) => q.hh === a.hh || q.hh === b.hh), { congrat: '婚約したんだってね' });
  }

  elope(a, b) {
    const R = this.rng;
    const dest = R.pick(this.S.world.settlements.filter((s) => s.id !== a.s && this.town(s.id).kingdom !== this.townOf(a).kingdom)) || R.pick(this.S.world.settlements);
    this.news(`${this.fullName(a)}と${this.fullName(b)}が駆け落ちし、${dest.name}へ向かった`, 2, a.pos);
    this.chron(`${this.fullName(a)}と${b.given}が身分違いの恋の末に駆け落ちした`, this.townOf(a).kingdom);
    for (const x of [a, b]) {
      x.mission = { type: 'travel', x: dest.x, z: dest.z, until: this.S.t + 1440 * 2 };
      this.remember(x, `すべてを捨てて、${(x === a ? b : a).given}と${dest.name}へ逃げた`, { emo: 0.6, imp: 1, k: 'elope' });
    }
    const hhA = this.hh(a), hhB = this.hh(b);
    const id = this.S.nextHh++;
    this.S.households[id] = { id, members: [], house: null, s: dest.id, money: Math.min(40, hhA.money * 0.2) + Math.min(40, hhB.money * 0.2), food: 2, comfort: 0, name: `${a.family}家`, wander: true };
    for (const x of [a, b]) this.moveTo(x, this.S.households[id]);
    a.s = b.s = dest.id;
    this.marry(a, b, true);
  }

  // ---------- 時間の節目 ----------
  newHour() {
    this.updatePrices();
    for (const p of this.living()) {
      const n = p.needs;
      const needAvg = (n.hunger * 1.3 + n.sleep + n.survival * 1.3 + n.lust * 0.5 + n.sloth * 0.7 + n.pleasure + n.esteem) / 6.8;
      const money = this.householdMoney(p);
      const moneyF = money < 15 ? -12 : money < 50 ? -4 : money > 250 ? 6 : 0;
      let memF = 0;
      for (const m of p.memories) { const age = this.today - m.t; if (age >= 0 && age < 6) memF += m.emo * m.imp * 12 * (1 - age / 6); }
      memF = clamp(memF, -30, 30) * (0.7 + p.pers.N * 0.6);
      let mood = needAvg * 0.65 + 25 + moneyF + memF + (this.hh(p)?.comfort || 0) * 1.5 + (p.jail != null ? -15 : 0) + weatherMoodDelta(this, p);
      if (mood < 50) mood -= (p.pers.N - 0.5) * 20;
      p.mood = clamp(p.mood * 0.6 + mood * 0.4, 0, 100);
      if (!p.talk && this.isWatched(p) && this.rng.chance(0.35)) p.thought = innerThought(this, p);
      // 危険の記憶は少しずつ薄れる
      if (p.danger) for (const k of Object.keys(p.danger)) { p.danger[k] *= 0.985; if (p.danger[k] < 0.2) delete p.danger[k]; }
    }
    for (const w of this.S.pendingWeddings.slice()) {
      if (this.S.t >= w.at) {
        this.S.pendingWeddings.splice(this.S.pendingWeddings.indexOf(w), 1);
        const a = this.S.people[w.a], b = this.S.people[w.b];
        if (a && b && a.deathYear == null && b.deathYear == null && a.spouseId == null && b.spouseId == null) this.marry(a, b);
      }
    }
    this.S.gatherings = this.S.gatherings.filter((g) => g.to > this.S.t);
    computeDanger(this);
    crimeHourly(this);
    underworldHourly(this);
    politicsHourly(this);
    demonHourly(this);
    weatherHourly(this);
    choreHourly(this);
    growthHourly(this);
    healthHourly(this);
    faunaHourly(this);
    financeHourly(this);
  }

  newDay() {
    const S = this.S, R = this.rng;
    const doy = this.dayOfYear();
    for (const p of this.living()) { p.talkedToday = {}; p.workedToday = 0; }
    const si = this.seasonIdx();
    weatherDaily(this);
    growthDaily(this);
    healthDaily(this);
    if (doy === 0) this.newYear();
    // 町の蓄え：裕福な家から集め、困っている家に施す
    for (const hh of Object.values(S.households)) {
      hh.food = Math.max(0, hh.food);
      const town = S.towns[hh.s];
      if (hh.money > 250 && this.dayIndex % 7 === 0) { const tax = (hh.money - 250) * 0.05; hh.money -= tax; town.fund += tax; }
      if (hh.money < 12 && town.fund > 20 && !hh.bandits) {
        const gift = Math.min(20, town.fund * 0.2);
        hh.money += gift; town.fund -= gift;
        for (const id of hh.members) { const q = S.people[id]; if (q && this.ageOf(q) >= 14 && R.chance(0.4)) this.remember(q, '町の蓄えから施しを受けた', { emo: -0.1, imp: 0.4, k: 'relief' }); }
      }
    }
    // 町の蓄えが貯まりすぎたら、道や井戸の普請に町の人を雇って給金を払う（お金を町に戻す）
    for (const s of S.world.settlements) {
      const town = S.towns[s.id];
      if (town.occupied || town.fund < 400) continue;
      const pool = (town.fund - 300) * 0.25;
      const workers = this.living().filter((q) => q.s === s.id && this.isAdult(q) && q.jail == null && !['king', 'royal', 'noble'].includes(q.rank));
      if (!workers.length) continue;
      const poor = workers.sort((a, b) => (this.hh(a)?.money || 0) - (this.hh(b)?.money || 0)).slice(0, Math.max(3, Math.floor(workers.length / 3)));
      const each = pool / poor.length;
      for (const q of poor) earn(this, q, each, 0.4);
      town.fund -= pool;
      if (R.chance(0.15)) this.pushLog(`${s.name}で町の普請（道の補修や井戸さらい）があり、${poor.length}人が給金を受け取った。`, 'event', [], s);
    }
    // 豊かな町から、同じ国の貧しい村へ援助
    for (const k of S.kingdoms) {
      const ts = S.world.settlements.filter((s) => s.kingdom === k.id && !S.towns[s.id].occupied);
      const rich = ts.slice().sort((a, b) => S.towns[b.id].fund - S.towns[a.id].fund)[0], poor = ts.slice().sort((a, b) => S.towns[a.id].fund - S.towns[b.id].fund)[0];
      if (rich && poor && rich !== poor && S.towns[rich.id].fund > 600 && S.towns[poor.id].fund < 80) { const x = 120; S.towns[rich.id].fund -= x; S.towns[poor.id].fund += x; }
    }
    if (this.isFestival()) {
      const from = this.dayIndex * 1440 + 16 * 60;
      for (const s of S.world.settlements) if (!S.towns[s.id].occupied) S.gatherings.push({ type: 'festival', place: 'plaza', from, to: from + 7 * 60, s: s.id, label: '収穫祭' });
      this.news('今日は収穫祭。夕方から各地の広場でかがり火が焚かれる', 1);
    }
    calendarDaily(this);
    // 誕生日・仕事・引退
    for (const p of this.living()) {
      if (p.birthDay !== doy) continue;
      const age = this.ageOf(p);
      if (age < 14) this.remember(p, `${age}歳の誕生日を家族に祝ってもらった`, { emo: 0.7, imp: 0.45 });
      if (age === 14 && !p.job) {
        const par = [this.person(p.fatherId), this.person(p.motherId)].find((q) => q && q.job && JOBS[q.job].goods);
        p.job = par ? par.job : this.townOf(p).type === 'port' ? 'fisher' : 'farmer';
        p.skill[p.job] = apprenticeSkill(p);
        p.rank = p.rank === 'royal' || p.rank === 'noble' ? p.rank : JOBS[p.job].rank;
        this.remember(p, `14歳になり、${JOBS[p.job].name}の見習いを始めた`, { emo: 0.5, imp: 0.8 });
        if (!p.inv) p.inv = [];
        p.eq = p.eq || {}; starterKit(p, R);
        this.gossip(p, `${JOBS[p.job].name}の見習いを始めた`, 0.4, this.living().filter((q) => this.rel(q, p).f > 50), { congrat: '見習いを始めたんだってね', silent: true });
      }
      if (age === 68 && p.job && !['king', 'royal', 'noble'].includes(p.job)) {
        this.remember(p, `長年続けた${JOBS[p.job].name}の仕事から退いた`, { emo: 0.1, imp: 0.8 });
        p.formerJob = p.job; p.job = null;
      }
      p.style = speechStyle(p, age);
      p.traits = traitLabels(p);
      Object.assign(p, humanStats(this, p));
    }
    // 寿命・病
    for (const p of this.living()) {
      const age = this.ageOf(p);
      const hungerMul = p.needs.hunger < 5 ? 4 : 1;
      const med = this.hasTech(p, 'medicine') ? 0.7 : 1;
      if (R.chance(mortY(age) / DAYS_PER_YEAR * hungerMul * med)) this.die(p, p.needs.hunger < 5 ? 'hunger' : age >= 70 ? 'old' : R.pick(['accident', 'winter', 'sick']));
    }
    // 妊娠・誕生
    const pop = this.living().length;
    for (const w of this.living()) {
      if (w.sex !== 'f') continue;
      if (w.pregnant > 0) { w.pregnant++; if (w.pregnant > 10) this.birth(w); continue; }
      const h = w.spouseId != null && this.person(w.spouseId);
      const age = this.ageOf(w);
      if (!h || h.deathYear != null || age < 18 || age > 42 || h.hh !== w.hh) continue;
      const love = (this.rel(w, h).a + 100) / 200;
      if (R.chance(0.035 * love * clamp(1.9 - pop / 330, 0.1, 1.6))) {
        w.pregnant = 1;
        this.remember(w, 'お腹に子どもがいるとわかった', { emo: 0.9, imp: 0.9, k: 'preg' });
        this.remember(h, `${w.given}のお腹に子どもがいるとわかった`, { emo: 0.9, imp: 0.9, about: [w.id], k: 'preg' });
        this.gossip(w, 'おめでたらしい', 0.7, this.living().filter((q) => q.hh !== w.hh && q.s === w.s && this.rel(q, w).a > 25), { congrat: 'おめでただってね', silent: true });
      }
    }
    for (const [sid, m] of Object.entries(S.towns)) {
      m.history.push({ d: this.dayIndex, bread: m.price.bread, wheat: m.price.wheat });
      if (m.history.length > 60) m.history.shift();
    }
    this.immigration();
    guildDaily(this);
    partiesDaily(this);
    propertyDaily(this);
    choreDaily(this);
    careerDaily(this);
    financeDaily(this);
    creatureDaily(this);
    faunaDaily(this);
    justiceDaily(this);
    underworldDaily(this);
    politicsDaily(this);
    for (const p of this.living()) this.trimMemories(p);
    this.save();
  }

  // 人が減った町には、よそから人が移り住んでくる
  immigration() {
    const S = this.S, R = this.rng;
    if (!S.initPop) { S.initPop = {}; for (const p of this.living()) S.initPop[p.s] = (S.initPop[p.s] || 0) + 1; }
    for (const s of S.world.settlements) {
      if (S.towns[s.id].occupied) continue;
      const pop = this.living().filter((p) => p.s === s.id).length;
      if (pop >= (S.initPop[s.id] || 10) * 0.85 || !R.chance(0.3)) continue;
      const ctx = { rng: R, people: S.people, nextId: () => S.nextId++ };
      const make = createPersonFactory(ctx);
      const south = s.kingdom === 2;
      const origin = R.pick(['東の山向こう', '南の砂漠の町', '北の雪国', '西の港町', '遠い異国', '峠の宿場', '海の向こうの島']);
      const fam = R.pick(south ? ['アル＝ハーディ', 'イブン＝サリム', 'アル＝ラフマ'] : ['ヴァルト', 'ブルーメ', 'ベーア', 'フックス', 'クライン', 'ロート', 'グリューン']);
      const a = make({ family: fam, birthYear: this.year() - R.int(19, 34), s: s.id, south });
      const members = [a];
      if (R.chance(0.5)) { const b = make({ sex: a.sex === 'm' ? 'f' : 'm', family: fam, birthYear: this.year() - R.int(19, 34), s: s.id, south }); a.spouseId = b.id; b.spouseId = a.id; members.push(b); }
      const hhId = S.nextHh++;
      const house = this.placeHouse(s) || s.buildings.map((id) => this.building(id)).find((b) => b.type === 'house' && !b.hh);
      S.households[hhId] = { id: hhId, members: [], house: house ? house.id : null, s: s.id, money: R.int(40, 120), food: 6, comfort: 0, name: `${fam}家`, street: !house };
      if (house) {
        house.hh = hhId; house.name = `${fam}家`; house.value = house.value || houseValue(this, house);
        if (house.owner != null && S.households[house.owner]) { house.rent = weeklyRent(this, house); house.arrears = 0; } else house.owner = hhId;
        this.events.push({ type: 'building', id: house.id });
      }
      for (const p of members) {
        delete p.notes; delete p.anc2;
        p.origin = origin; p.job = s.type === 'port' ? 'fisher' : s.type === 'capital' ? R.pick(['baker', 'smith', 'merchant', 'soldier', 'tailor', 'carpenter']) : 'farmer';
        p.rank = JOBS[p.job].rank; p.hh = hhId; S.households[hhId].members.push(p.id);
        p.needs = { survival: 80, sleep: 80, hunger: 70, lust: 70, sloth: 70, pleasure: 70, esteem: 60 };
        p.mood = 55; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = 0.8; p.workedToday = 0; p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = { [p.job]: 0.4 }; p.danger = {}; p.fame = 0; p.lv = 1 + R.int(0, 2);
        p.style = speechStyle(p, this.ageOf(p)); p.traits = traitLabels(p);
        p.inv = []; p.eq = {}; starterKit(p, R); p.purse = R.int(5, 30);
        Object.assign(p, humanStats(this, p)); p.hp = p.maxhp;
        p.pos = house ? { ...house.door } : { x: s.x, z: s.z }; p.inside = null; p.path = []; p.action = null;
        this.remember(p, `${origin}から${s.name}に移り住んできた`, { emo: 0.4, imp: 0.95, k: 'arrival' });
        p.deeds.push(`${origin}から${s.name}にやってきた`);
      }
      this.dirty();
      this.gossip(a, `${origin}から越してきたらしい`, 0.2, this.living().filter((q) => q.s === s.id && R.chance(0.4)), { silent: true });
      this.pushLog(`${this.fullName(a)}${members.length > 1 ? 'の夫婦' : ''}が${origin}から${s.name}に移り住んできた。`, 'event', [a.id], a.pos);
    }
  }

  // 流れの冒険者：名を上げようと遠くから王都へやって来て、宿屋に泊まりながら依頼をこなす
  adventurerArrives(s) {
    const S = this.S, R = this.rng;
    const inn = this.townBuilding(s, 'tavern');
    if (!inn) return null;
    const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
    const south = s.kingdom === 2;
    const origin = R.pick(['東の山向こう', '南の砂漠の町', '北の雪国', '西の港町', '遠い異国', '峠の宿場', '海の向こうの島', '辺境の開拓村']);
    const fam = R.pick(south ? ['アル＝ハーディ', 'イブン＝サリム', 'アル＝ラフマ', 'バヌー＝カマル'] : ['ヴァルト', 'ブルーメ', 'ベーア', 'フックス', 'クライン', 'ロート', 'グリューン', 'シュタイン', 'ヴォルフ']);
    const p = make({ family: fam, birthYear: this.year() - R.int(17, 32), s: s.id, south });
    const hhId = S.nextHh++;
    S.households[hhId] = { id: hhId, members: [p.id], house: inn.id, inn: true, s: s.id, money: R.int(10, 40), food: 0, comfort: 0, name: `${fam}（宿住まい）` };
    delete p.notes; delete p.anc2;
    p.origin = origin; p.job = R.weighted(['adventurer', 'warrior', 'archer', 'cleric', 'sage'], (j) => ({ adventurer: 3, warrior: 2, archer: 2, cleric: 1.5, sage: 0.7 }[j]));
    p.rank = JOBS[p.job].rank; p.hh = hhId;
    p.needs = { survival: 80, sleep: 80, hunger: 70, lust: 70, sloth: 70, pleasure: 70, esteem: 50 };
    p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = 0.8; p.workedToday = 0; p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = { [p.job]: 0.3 + R.next() * 0.3 }; p.danger = {}; p.fame = 0; p.lv = 1 + R.int(0, 4);
    p.style = speechStyle(p, this.ageOf(p)); p.traits = traitLabels(p);
    p.inv = []; p.eq = {}; starterKit(p, R); p.purse = R.int(15, 60);
    Object.assign(p, humanStats(this, p)); p.hp = p.maxhp;
    p.pos = { ...inn.door }; p.inside = null; p.path = []; p.action = null;
    this.remember(p, `名を上げようと、${origin}から${s.name}の冒険者ギルドへやって来た`, { emo: 0.6, imp: 0.95, k: 'arrival' });
    p.deeds.push(`${origin}から冒険者として${s.name}にやってきた`);
    this.dirty();
    this.pushLog(`${origin}から、${JOBS[p.job].name}の${this.fullName(p)}が${s.name}にやって来た。宿屋に部屋を取ったらしい。`, 'event', [p.id], p.pos);
    return p;
  }

  newYear() {
    const S = this.S;
    this.chron(`この年、大陸では${S.stats.births}人が生まれ、${S.stats.deaths}人が亡くなり、${S.stats.weddings}組が結婚した`);
    S.stats = { births: 0, deaths: 0, weddings: 0 };
    S.harvest = clamp(this.rng.gauss(1, 0.2), 0.5, 1.4);
    this.news(`新しい年、${ERA}${this.year()}年が明けた`, 1);
  }

  // ---------- 人生の節目 ----------
  die(p, cause, killer = null) {
    if (p.deathYear != null) return;
    onDeath(this, p, cause, killer);
    const S = this.S, age = this.ageOf(p);
    p.deathYear = this.year(); p.deathCause = cause; p.deathDay = this.today;
    p.lastWords = p.thought;
    p.killedBy = killer ? (killer.given ? killer.id : killer.name) : null;
    p.diedWhile = p.action?.type || null;
    if (p.job && age > 20 && JOBS[p.job]?.goods) p.deeds.unshift(`腕のいい${JOBS[p.job].name}だった`);
    if (p.formerJob && JOBS[p.formerJob]?.goods) p.deeds.unshift(`腕のいい${JOBS[p.formerJob].name}だった`);
    if (p.talk) { const o = S.people[p.talk.a === p.id ? p.talk.b : p.talk.a]; if (o) o.talk = null; }
    const hh = this.hh(p);
    if (hh) hh.members = hh.members.filter((id) => id !== p.id);
    const heir = inherit(this, p);
    if (p.spouseId != null) { const sp = S.people[p.spouseId]; if (sp) { sp.exSpouses.push(p.id); sp.spouseId = null; } }
    S.stats.deaths++;
    S.graves.push(p.id);
    const causeTxt = DEATH_CAUSES[cause] || cause;
    // 目撃者のいない殺人では、犯人の名前は世間に出ない
    const killerName = killer && !(cause === 'murder' && killer.given && !S.wanted[killer.id]) ? (killer.given || killer.name) : null;
    this.dirty();
    for (const q of this.living()) {
      if (!q.rel) continue;
      const term = this.kinTerm(q, p);
      const aff = this.rel(q, p).a;
      const how = cause === 'murder' && killer && q.gk ? `${causeTxt}に倒れて` : `${causeTxt}で`;
      if (term) {
        this.remember(q, `${term}の${p.given}が${how}亡くなった`.replace('でで', 'で'), { emo: -0.9, imp: 0.95, about: [p.id], k: 'death' });
        if ((cause === 'murder' || cause === 'monster' || cause === 'demon' || cause === 'war') && killer && q.values.courage > 0.5 && this.ageOf(q) >= 16) {
          if (killer.given) q.revenge = killer.id; else q.vendetta = killer.sp || 'demon';
        }
      } else if (aff > 20 && q.s === p.s) this.remember(q, `${p.given}が${how}亡くなった`.replace('でで', 'で'), { emo: -0.5 - aff / 200, imp: 0.7, about: [p.id], k: 'death' });
      else if (q.s === p.s && this.rng.chance(0.5)) this.remember(q, `${p.given}が亡くなったと聞いた`, { emo: -0.2, imp: 0.35, about: [p.id], k: 'death2' });
      delete q.rel[p.id];
    }
    const town = this.townOf(p);
    const from = (this.dayIndex + 1) * 1440 + 10 * 60;
    const mourners = this.living().filter((q) => q.s === p.s && (this.kinTerm(q, p) || q.hh === p.hh || q.job === 'priest')).map((q) => q.id);
    if (!S.towns[p.s].occupied) S.gatherings.push({ type: 'funeral', place: 'church', from, to: from + 90, ids: mourners, s: p.s, label: `${p.given}の弔い` });
    const important = ['king', 'royal', 'noble'].includes(p.rank) || p.hero || p.fame > 40;
    const line = `${this.fullName(p)}が${age}歳で亡くなった（${causeTxt}${killerName ? `・${killerName}の手にかかって` : ''}）`;
    this.chron(line, town.kingdom);
    if (important) this.news(line, p.rank === 'king' ? 3 : 2, p.pos);
    else this.pushLog(line, 'death', [p.id], p.pos);
    if (p.talkLog) p.talkLog = p.talkLog.slice(-5);
    for (const k of ['needs', 'memories', 'rel', 'gk', 'talkedToday', 'action', 'path', 'talk', 'inside', 'q', 'danger', 'recent', 'fight', 'mission']) delete p[k];
    if (hh && hh.members.length === 0) {
      const b = hh.house != null ? this.building(hh.house) : null;
      if (b && b.type === 'house') { b.hh = null; b.name = '空き家'; b.rent = 0; b.arrears = 0; }
      transferEstate(this, hh, heir && heir.hh !== hh.id ? heir.hh : null);
      delete S.households[hh.id];
    }
    this.events.push({ type: 'died', id: p.id });
    if (p.rank === 'king') politicsDaily(this, { succession: true });
  }

  marry(a, b, quiet) {
    const S = this.S;
    const [m, w] = a.sex === 'm' ? [a, b] : [b, a];
    m.spouseId = w.id; w.spouseId = m.id;
    w.family = m.family;
    S.stats.weddings++;
    this._kin.clear();
    if (!quiet) {
      const oldW = this.hh(w), oldM = this.hh(m);
      const empty = this.townOf(m).buildings.map((id) => this.building(id)).find((bd) => bd.type === 'house' && !bd.hh);
      let target;
      if ((empty || oldM.members.length > 3) && !oldM.royal) {
        const house = empty || this.placeHouse(this.townOf(m));
        if (house) {
          const id = S.nextHh++;
          target = S.households[id] = { id, members: [], house: house.id, s: m.s, money: 0, food: 4, comfort: 0, name: `${m.family}家` };
          house.hh = id; house.name = `${m.family}家（新居）`;
          house.value = house.value || houseValue(this, house);
          if (house.owner != null && this.S.households[house.owner]) { house.rent = weeklyRent(this, house); house.arrears = 0; } else house.owner = id;
          const gift = Math.min(60, oldM.money * 0.3); oldM.money -= gift; target.money += gift;
          for (const p of [m, w]) this.moveTo(p, target);
          this.events.push({ type: 'building', id: house.id });
        }
      }
      if (!target) { target = oldM; this.moveTo(w, target); }
      w.s = m.s;
      for (const p of [m, w]) this.remember(p, `${(p === m ? w : m).given}と結婚した`, { emo: 0.95, imp: 1, about: [(p === m ? w : m).id], k: 'marriage' });
      const g = this.gossip(m, `${w.given}と結婚した`, 0.8, this.living().filter((q) => q !== w && q.s === m.s), { congrat: '結婚おめでとう' });
      w.gk[g.key] = 1;
    }
    if (['king', 'royal'].includes(m.rank) || ['king', 'royal'].includes(w.rank)) {
      for (const x of [m, w]) if (x.rank !== 'king' && x.rank !== 'royal') x.rank = 'royal';
      this.news(`${this.fullName(m)}と${w.given}の婚礼が盛大に行われた`, 2, m.pos);
    }
    this.chron(`${this.fullName(m)}と${w.given}が結婚した`, this.townOf(m).kingdom);
  }

  moveTo(p, hh) {
    const old = this.hh(p);
    if (old === hh) return;
    if (old) old.members = old.members.filter((id) => id !== p.id);
    hh.members.push(p.id); p.hh = hh.id;
    if (old && old.members.length === 0) {
      transferEstate(this, old, hh.id); hh.food += old.food;
      const b = old.house != null ? this.building(old.house) : null;
      if (b && b.type === 'house') { b.hh = null; b.name = '空き家'; }
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
    const c = make({ sex, family: w.family, birthYear: this.year(), birthDay: this.dayOfYear(), father: h, mother: w, given: namesake?.given, s: w.s });
    delete c.notes; delete c.anc2;
    c.needs = { survival: 90, sleep: 80, hunger: 80, lust: 100, sloth: 80, pleasure: 80, esteem: 80 };
    c.mood = 70; c.memories = []; c.rel = {}; c.gk = {}; c.talkedToday = {}; c.recent = []; c.tool = 0; c.workedToday = 0; c.pregnant = 0; c.cooldown = 0; c.q = {}; c.skill = {}; c.danger = {}; c.fame = 0; c.lv = 1;
    c.style = 'child'; c.traits = traitLabels(c); c.inv = []; c.eq = {};
    c.rank = ['king', 'royal'].includes(w.rank) || (h && ['king', 'royal'].includes(h.rank)) ? 'royal' : w.rank === 'noble' ? 'noble' : ['homeless', 'prisoner', 'outlaw'].includes(w.rank) ? 'commoner' : w.rank || 'commoner';
    Object.assign(c, humanStats(this, c)); c.hp = c.maxhp;
    c.hh = w.hh; this.hh(w).members.push(c.id);
    c.pos = { x: w.pos.x, z: w.pos.z }; c.inside = w.inside; c.path = []; c.action = null;
    this._kin.clear(); this.dirty();
    for (const q of this.living()) {
      if (q === c || !q.rel) continue;
      const kin = this.kinTerm(q, c);
      if (!kin && q.s !== c.s) continue;
      q.rel[c.id] = { a: kin ? 60 : 10, f: q.hh === c.hh ? 95 : kin ? 60 : 15 };
      c.rel[q.id] = { a: kin ? 50 : 10, f: q.hh === c.hh ? 95 : kin ? 50 : 10 };
    }
    for (const par of [w, h]) if (par && par.deathYear == null) this.remember(par, `${sex === 'm' ? '息子' : '娘'}の${c.given}が生まれた`, { emo: 1, imp: 1, about: [c.id], k: 'child' });
    if (namesake) this.remember(w, `生まれた子に、亡き${this.kinTerm(w, namesake) || '身内'}の名前「${namesake.given}」をつけた`, { emo: 0.6, imp: 0.6, about: [namesake.id] });
    S.stats.births++;
    this.gossip(w, `${c.given}という${sex === 'm' ? '男の子' : '女の子'}を産んだ`, 0.8, this.living().filter((q) => q.hh !== w.hh && q.s === w.s && this.rel(q, w).f > 40), { congrat: '赤ちゃんが生まれたんだってね', silent: c.rank !== 'royal' });
    if (c.rank === 'royal') this.news(`王家に${c.given}という${sex === 'm' ? '王子' : '王女'}が誕生した`, 2, w.pos);
    this.chron(`${this.fullName(c)}が生まれた`, this.townOf(c).kingdom);
    this.events.push({ type: 'born', id: c.id });
  }
}
