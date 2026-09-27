// 裏社会と犯罪者
// 薬物（栽培・密売・依存と立ち直り）、性犯罪とつきまとい（抽象表現のみ・当事者は必ず18歳以上）、
// 猟奇的な連続殺人犯（ごく稀・世界に同時に1人まで）、放火、誘拐と身代金（大人のみ）、恐喝、
// 贈収賄と横領、偽金づくり、墓荒らし、密猟、故買屋（闇市）、密輸、暗殺者、盗賊ギルド。
// 捜査・裁き（罰金・禁固・死刑・追放）と出所後の更生・再犯。
//
// 重い犯罪（性犯罪・つきまとい・薬物・猟奇殺人）は S.settings.matureCrimes が false のとき起きない。
// 状態は S.uw と、人ごとの p.uwRole / p.addiction / p.uwTrauma / p.uwStalk / p.uwCaptive など。
// 古いセーブで欠けていても、最初の呼び出しで初期化する。
import { clamp } from './rng.js';
import { JOBS } from './data.js';
import { T } from './world.js';
import { markWanted, arrest, startFight } from './society.js';
import { pay, earn, spendable } from './property.js';
import { stash, ownStock } from './market.js';
import { moneyIn, moneyOut } from './ledger.js';
import { lawCrimeMul } from './justice.js';   // 処刑や厳しい罰のあった町ほど罪が起きにくい

const LAWFUL = new Set(['guard', 'knight', 'soldier', 'jailer', 'watchman', 'royalguard', 'general', 'paladin']);
const HEALERS = { nun: '修道女', priest: '司祭', herbalist: '薬師', doctor: '医者', cleric: '僧侶' };
const ELITE = new Set(['king', 'royal', 'noble']);
const CROOK_JOBS = new Set(['thief', 'pickpocket', 'swindler', 'smuggler', 'pirate', 'banditchief']);

// ---------- 禁制の薬 ----------
export const DRUGS = {
  dream: { name: '夢見草', price: 6, hook: 14 },
  lotus: { name: '黒蓮の粉', price: 10, hook: 20 },
  mana: { name: '魔薬', price: 16, hook: 28 },
};

// ---------- 罪の重さの表 ----------
// days：禁固の日数（1年は40日）、fine：罰金（銅貨）、death：死刑、exile：出所後に国外追放、dismiss：職を解かれる
// 既存の罪（盗み・スリ・傷害・追いはぎ・殺人・脱獄）も同じ表で罰金を決める。日数は society.js の手配と同じ。
export const CRIMES = {
  '盗み': { days: 8, fine: 10 },
  'スリ': { days: 6, fine: 8 },
  '傷害': { days: 6, fine: 12 },
  '追いはぎ': { days: 15, fine: 20 },
  '殺人': { days: 120, fine: 0, deathIfRepeat: true },
  '脱獄': { days: 20, fine: 0 },
  '騒ぎ': { days: 5, fine: 5 },
  '薬の密売': { days: 30, fine: 40, uw: true },
  '禁制の草の栽培': { days: 20, fine: 30, uw: true },
  '密輸': { days: 25, fine: 50, uw: true },
  '性的暴行': { days: 240, fine: 60, exile: true, uw: true, grave: true },
  'つきまとい': { days: 15, fine: 15, uw: true },
  '連続殺人': { days: 999, fine: 0, death: true, uw: true, grave: true },
  '放火': { days: 60, fine: 30, exile: 0.4, uw: true },
  '誘拐': { days: 90, fine: 40, uw: true, grave: true },
  '恐喝': { days: 20, fine: 20, uw: true },
  '収賄': { days: 20, fine: 40, dismiss: true, uw: true },
  '横領': { days: 40, fine: 60, dismiss: true, uw: true },
  '偽金づくり': { days: 80, fine: 50, uw: true },
  '墓荒らし': { days: 20, fine: 15, uw: true },
  '密猟': { days: 8, fine: 15, uw: true },
  '故買': { days: 25, fine: 30, uw: true },
  '暗殺': { days: 999, fine: 0, death: true, uw: true, grave: true },
  '暗殺未遂': { days: 160, fine: 0, exile: true, uw: true, grave: true },
  '暗殺の依頼': { days: 150, fine: 80, uw: true, grave: true },
  '盗賊ギルドの頭目': { days: 120, fine: 80, uw: true, grave: true },
};

const mature = (sim) => sim.S.settings?.matureCrimes !== false;
const adult = (sim, p) => p && p.deathYear == null && sim.ageOf(p) >= 18;
const alive = (p) => p && p.deathYear == null;
const free = (p) => alive(p) && p.jail == null && !p.uwCaptive;
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

// ---------- 初期化 ----------
export function initUnderworld(sim) {
  const S = sim.S;
  S.settings = S.settings || {};
  if (S.settings.matureCrimes == null) S.settings.matureCrimes = false;   // 公開版の初めの値は「切る」（社長の決定）
  if (S.uw && S.uw.v) return S.uw;
  const R = sim.rng;
  S.uw = {
    v: 1, rate: 1,
    stats: {}, arrests: {}, cases: [],
    stock: {}, heat: {}, fear: {}, fake: {},
    killer: null, nextKiller: sim.today + R.int(60, 160), killerCases: 0,
    nextAssassin: sim.today + R.int(15, 45), contract: null,
    guilds: {}, pending: [], lastSeed: -99, lastSex: -99, lastArson: -99,
  };
  seedRoles(sim);
  return S.uw;
}
function U(sim) {
  const S = sim.S;
  if (!S.settings) S.settings = {};
  if (S.settings.matureCrimes == null) S.settings.matureCrimes = false;   // 公開版の初めの値は「切る」（社長の決定）
  return S.uw && S.uw.v ? S.uw : initUnderworld(sim);
}

// 事件の記録（件数と当事者の年齢。性犯罪で18歳未満が関わっていないかの点検にも使う）
function record(sim, k, off, vic, extra = {}) {
  const uw = U(sim);
  uw.stats[k] = (uw.stats[k] || 0) + 1;
  uw.cases.push({ d: sim.today, k, off: off?.id ?? null, vic: vic?.id ?? null, offAge: off ? sim.ageOf(off) : null, vicAge: vic ? sim.ageOf(vic) : null, s: (off || vic)?.s, ...extra });
  if (uw.cases.length > 300) uw.cases.splice(0, uw.cases.length - 300);
  if (off && off.s != null && sim.S.towns[off.s]) sim.S.towns[off.s].crime = (sim.S.towns[off.s].crime || 0) + 1;
}
function wanted(sim, p, crime) {
  const c = CRIMES[crime];
  markWanted(sim, p, crime, c ? Math.min(c.days, 400) : 10);
  const uw = U(sim);
  uw.stats['手配:' + crime] = (uw.stats['手配:' + crime] || 0) + 1;
}
const townName = (sim, p) => sim.townOf(p)?.name || '';
const lawfulIn = (sim, sid) => sim.living().filter((q) => LAWFUL.has(q.job) && q.s === sid && q.jail == null && !q.fight);
function witnessesNear(sim, pos, r, ex = []) {
  return sim.living().filter((q) => !ex.includes(q) && q.jail == null && q.action?.type !== 'sleep' && !q.inside && Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) < r);
}
function crookScore(sim, p) {
  return (1 - p.pers.A) * 1.6 + (1 - p.pers.C) * 0.5 + p.values.ambition * 0.5 + (CROOK_JOBS.has(p.job) || JOBS[p.job]?.crook ? 0.8 : 0) + (sim.householdMoney(p) < 30 ? 0.3 : 0) + (p.uwRecid ? 0.5 : 0);
}
function eligibleCrook(sim, p) {
  const age = sim.ageOf(p);
  return age >= 18 && age <= 62 && free(p) && !p.uwRole && !ELITE.has(p.rank) && !LAWFUL.has(p.job) && !HEALERS[p.job] && !p.hero && !p.party && p.pers.A < 0.42 && !p.bandit;
}

// ---------- 役割（裏稼業）の割り当て ----------
function seedRoles(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw;
  uw.lastSeed = sim.today;
  const pool = sim.living().filter((p) => eligibleCrook(sim, p));
  const setl = S.world.settlements;
  const take = (cands, role, why) => {
    const c = cands.filter((p) => !p.uwRole);
    if (!c.length) return null;
    const p = R.weighted(c, (q) => Math.pow(crookScore(sim, q), 3));
    if (!p) return null;
    p.uwRole = role;
    sim.remember(p, why, { emo: 0.1, imp: 0.6, k: 'uwcrime' });
    return p;
  };
  const has = (role, pred) => sim.living().some((p) => p.uwRole === role && pred(p));
  for (let k = 0; k < S.kingdoms.length; k++) {
    const towns = setl.filter((s) => s.kingdom === k && !S.towns[s.id].occupied);
    const inK = pool.filter((p) => sim.townOf(p).kingdom === k);
    if (mature(sim)) {
      if (!has('grower', (p) => sim.townOf(p).kingdom === k)) {
        const vil = inK.filter((p) => sim.townOf(p).type === 'village');
        take(vil.length ? vil : inK, 'grower', '森の奥でこっそり禁制の草を育てはじめた');
      }
      for (const s of towns.filter((t) => t.type !== 'village')) {
        if (!has('dealer', (p) => p.s === s.id)) take(inK.filter((p) => p.s === s.id), 'dealer', '酒場の隅で、禁制の薬をさばく仕事を引き受けた');
      }
    }
    const cap = towns.find((s) => s.type === 'capital');
    if (cap && !has('fence', (p) => p.s === cap.id)) take(inK.filter((p) => p.s === cap.id), 'fence', '盗品を裏で買い取る故買屋を始めた');
    const skillJobs = (p) => ['smith', 'jeweler', 'changer', 'potter', 'scribe'].includes(p.job);
    if (!has('counterfeiter', (p) => sim.townOf(p).kingdom === k) && R.chance(0.6)) { const sk = inK.filter(skillJobs); take(sk.length ? sk : inK, 'counterfeiter', '工房の奥で、ひそかに偽の銅貨を鋳はじめた'); }
    if (!has('graverobber', (p) => sim.townOf(p).kingdom === k) && R.chance(0.5)) take(inK, 'graverobber', '墓に眠る副葬品に目をつけた');
    if (!has('poacher', (p) => sim.townOf(p).kingdom === k) && R.chance(0.6)) { const hu = inK.filter((p) => ['hunter', 'farmer', 'woodcutter', 'charcoal'].includes(p.job)); take(hu.length ? hu : inK, 'poacher', '王家の森の鹿を、許しなく狩ることにした'); }
    // 賄賂に弱い衛兵
    const guards = sim.living().filter((p) => ['guard', 'watchman', 'gatekeeper', 'jailer'].includes(p.job) && sim.townOf(p).kingdom === k && p.pers.A < 0.4 && p.values.ambition > 0.5 && !p.uwCorrupt);
    const nCorrupt = sim.living().filter((p) => p.uwCorrupt && sim.townOf(p).kingdom === k).length;
    if (nCorrupt < 2 && guards.length) { const g = R.pick(guards); g.uwCorrupt = true; }
  }
  // 暗殺者：世界に1人
  if (!sim.living().some((p) => p.uwRole === 'assassin')) {
    const c = pool.filter((p) => !p.uwRole && p.pers.A < 0.25 && p.pers.C > 0.45 && sim.ageOf(p) < 50);
    const a = c.length ? R.pick(c) : null;
    if (a) { a.uwRole = 'assassin'; a.lv = Math.max(a.lv || 1, 5); sim.remember(a, '金さえ積まれれば、人の命を奪う仕事も引き受けることにした', { emo: 0, imp: 0.9, k: 'uwcrime' }); }
  }
  refreshGuilds(sim);
}

// 盗賊ギルド（王都ごと）：頭目・構成員・上納金・縄張り（王都と同じ国の港町）
function refreshGuilds(sim) {
  const S = sim.S, uw = S.uw, R = sim.rng;
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    const turf = S.world.settlements.filter((s) => s.kingdom === cap.kingdom && s.type !== 'village').map((s) => s.id);
    const g = uw.guilds[cap.id] || (uw.guilds[cap.id] = { name: `${cap.name.replace('王都', '')}の影`, boss: null, members: [], dues: 0, turf, since: sim.today });
    g.turf = turf;
    const isCrook = (p) => free(p) && sim.ageOf(p) >= 18 && turf.includes(p.s) && (CROOK_JOBS.has(p.job) && !p.bandit || ['dealer', 'fence', 'counterfeiter', 'graverobber'].includes(p.uwRole));
    g.members = g.members.filter((id) => { const q = S.people[id]; return q && isCrook(q); });
    for (const p of sim.living()) if (isCrook(p) && !g.members.includes(p.id) && g.members.length < 9) g.members.push(p.id);
    const boss = S.people[g.boss];
    if (!boss || !free(boss) || !g.members.includes(boss.id)) {
      const cands = g.members.map((id) => S.people[id]).filter((p) => p.s === cap.id);
      const nb = cands.sort((a, b) => crookScore(sim, b) + b.pers.E - crookScore(sim, a) - a.pers.E)[0];
      const old = g.boss;
      g.boss = nb ? nb.id : null;
      if (nb && old !== nb.id) {
        nb.uwBoss = cap.id;
        sim.remember(nb, `王都の裏社会「${g.name}」の頭目になった`, { emo: 0.6, imp: 0.95, k: 'uwcrime' });
        if (old != null) sim.chron(`${cap.name}の盗賊ギルド「${g.name}」の頭目が代わったと噂された`, cap.kingdom);
      }
    }
    void R;
  }
}

// ---------- 毎日の処理 ----------
export function underworldDaily(sim) {
  const S = sim.S, R = sim.rng, uw = U(sim), today = sim.today;
  if (today - uw.lastSeed >= 10) seedRoles(sim);
  trialsAndRelease(sim);
  if (mature(sim)) {
    drugsDaily(sim);
    sexCrimeDaily(sim);
    stalkingDaily(sim);
    killerDaily(sim);
  }
  traumaDaily(sim);
  arsonDaily(sim);
  kidnapDaily(sim);
  blackmailDaily(sim);
  corruptionDaily(sim);
  counterfeitDaily(sim);
  fenceDaily(sim);
  smuggleDaily(sim);
  assassinDaily(sim);
  guildDaily(sim);
  investigateDaily(sim);
  for (const k of Object.keys(uw.fear)) { uw.fear[k] = Math.max(0, uw.fear[k] - 0.04); if (uw.fear[k] <= 0) delete uw.fear[k]; }
  for (const k of Object.keys(uw.fake)) { uw.fake[k] *= 0.9; if (uw.fake[k] < 0.3) delete uw.fake[k]; }
  for (const k of Object.keys(uw.heat)) uw.heat[k] *= 0.93;
  void R;
}

// ---------- 毎時の処理 ----------
export function underworldHourly(sim) {
  U(sim);
  if (mature(sim)) {
    dealHourly(sim);
    withdrawalHourly(sim);
    killerHourly(sim);
  }
  kidnapHourly(sim);
  bribeHourly(sim);
}

// ================= 裁き・出所・更生 =================
function trialsAndRelease(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw;
  for (const p of sim.living()) {
    // 死刑の執行
    if (p.jail != null && p.uwExecDay != null && sim.today >= p.uwExecDay) {
      const crime = p.crime, n = p.uwVictims || 0;
      const jail = sim.building(p.jail);
      p.uwExecDay = null;
      record(sim, '処刑', p, null, { crime });
      sim.news(`${sim.fullName(p)}が${crime}の罪で処刑された`, 3, jail?.door);
      sim.chron(`${sim.fullName(p)}が${crime}の罪で処刑された${n > 1 ? `（犠牲者${n}人）` : ''}`, sim.townOf(p).kingdom);
      sim.die(p, 'execution');
      continue;
    }
    if (p.jail != null) {
      if (p.uwTried) continue;
      p.uwTried = true;
      const crime = p.crime || '騒ぎ';
      const c = CRIMES[crime] || { days: p.prisonDays || 5, fine: 5 };
      uw.arrests[crime] = (uw.arrests[crime] || 0) + 1;
      // 罰金は家計から。国庫（王都の蓄え）に入る
      const hh = sim.hh(p);
      const fine = Math.round(Math.min(c.fine || 0, Math.max(0, hh?.money || 0)));
      if (fine > 0) { hh.money -= fine; const cap = sim.capitalOf(p); if (cap) S.towns[cap.id].fund += fine; }
      let sentence = `禁固${p.prisonDays}日`;
      const death = c.death || (c.deathIfRepeat && ((p.uwKills || 0) >= 1 || p.uwKilledRoyal));
      if (death) { p.uwExecDay = sim.today + 2; p.prisonDays = 99; sentence = '死刑'; }
      if (c.exile === true || (typeof c.exile === 'number' && R.chance(c.exile))) { p.uwExile = true; sentence += '・刑期後に国外追放'; }
      if (c.dismiss && p.job) { p.formerJob = p.job; p.job = null; sentence += '・職を解かれる'; }
      if (crime === '殺人') p.uwKills = (p.uwKills || 0) + 1;
      if (c.uw || death || c.grave) {
        const line = `${sim.fullName(p)}に${crime}の罪で${sentence}${fine ? `（罰金${fine}銅貨）` : ''}の裁きが下った`;
        if (death || c.grave) sim.news(line, 2, sim.building(p.jail)?.door); else sim.pushLog(line + '。', 'event', [p.id], p.pos);
      }
      sim.remember(p, `裁きの場で、${crime}の罪により${sentence}を言い渡された`, { emo: -0.8, imp: 0.95, k: 'uwcrime' });
      // 役割の後始末
      if (p.uwStalk) p.uwStalk = null;
      if (S.uw.killer?.id === p.id && crime === '連続殺人') { S.uw.killer.caught = true; }
      continue;
    }
    if (p.uwTried) {
      // 牢を出た（刑期満了か脱獄）
      p.uwTried = false;
      if (S.wanted[p.id]) continue; // 脱獄して逃げている
      released(sim, p);
    }
  }
}

function released(sim, p) {
  const S = sim.S, R = sim.rng, uw = S.uw;
  if (p.uwExile) {
    p.uwExile = false;
    exile(sim, p);
    return;
  }
  const reform = R.chance(clamp(0.3 + p.pers.C * 0.35 + p.pers.A * 0.2 - (p.uwRecid || 0) * 0.15, 0.05, 0.9));
  if (reform) {
    uw.stats['更生'] = (uw.stats['更生'] || 0) + 1;
    if (p.uwRole) { p.uwRole = null; }
    const job = p.job || p.formerJob;
    if (!p.job && job && !CROOK_JOBS.has(job)) p.job = job;
    if (!p.job || CROOK_JOBS.has(p.job)) { p.job = sim.townOf(p).type === 'port' ? 'fisher' : 'farmer'; }
    if (p.job !== 'thief') p.rank = JOBS[p.job]?.rank || 'commoner';
    sim.remember(p, `牢を出て、${JOBS[p.job]?.name || '昔'}の仕事に戻った。もう裏の稼業には戻らない`, { emo: 0.5, imp: 0.85 });
  } else {
    p.uwRecid = (p.uwRecid || 0) + 1;
    uw.stats['再犯の道'] = (uw.stats['再犯の道'] || 0) + 1;
    sim.remember(p, '牢を出ても、まっとうな仕事は見つからない。また裏の稼業に戻るしかない', { emo: -0.4, imp: 0.8, k: 'uwcrime' });
  }
}

// 国外追放：よその国の町の宿に移る
function exile(sim, p) {
  const S = sim.S, R = sim.rng;
  const k = sim.townOf(p).kingdom;
  const dest = R.pick(S.world.settlements.filter((s) => s.kingdom !== k && !S.towns[s.id].occupied && sim.townBuilding(s, 'tavern')));
  if (!dest) return;
  const inn = sim.townBuilding(dest, 'tavern');
  const hhId = S.nextHh++;
  S.households[hhId] = { id: hhId, members: [], house: inn.id, inn: true, s: dest.id, money: 0, food: 0, comfort: 0, name: `${p.family}（宿住まい）` };
  { const oh = sim.hh(p); const x = oh ? Math.max(0, Math.min(5, oh.money)) : 0; if (oh) oh.money -= x; S.households[hhId].money = x; }
  const from = sim.townOf(p).name;
  sim.moveTo(p, S.households[hhId]);
  p.s = dest.id; p.pos = { ...inn.door }; p.inside = null; p.action = null; p.path = [];
  p.job = 'wanderer'; p.rank = 'wanderer'; p.uwRole = null;
  if (p.spouseId != null) { const sp = S.people[p.spouseId]; if (sp) { sp.exSpouses.push(p.id); p.exSpouses.push(sp.id); sp.spouseId = null; p.spouseId = null; sim.remember(sp, `${p.given}とは縁を切った`, { emo: -0.4, imp: 0.8, about: [p.id] }); } }
  sim.remember(p, `刑期を終え、${from}から国外へ追放された。${dest.name}で一からやり直すしかない`, { emo: -0.7, imp: 1, k: 'uwcrime' });
  sim.pushLog(`${sim.fullName(p)}が国外追放となり、${dest.name}へ流れていった。`, 'event', [p.id], p.pos);
  record(sim, '国外追放', p, null);
  sim.dirty();
}

// 手配中の者を、衛兵が聞き込みで探し出す（裏社会の罪のみ。既存の罪は society.js の見回りに任せる）
function investigateDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const [id, w] of Object.entries(S.wanted)) {
    const p = S.people[id];
    if (!p || !free(p) || !CRIMES[w.crime]?.uw) continue;
    const guards = lawfulIn(sim, p.s);
    const pool = guards.length ? guards : lawfulIn(sim, sim.capitalOf(p)?.id);
    if (!pool.length) continue;
    const g = R.pick(pool);
    const chance = (CRIMES[w.crime].grave ? 0.35 : 0.22) * (g.uwCorrupt ? 0.4 : 1) * (p.uwBoss != null ? 0.5 : 1);
    if (R.chance(chance)) {
      p.inside = null; p.fight = null;
      arrest(sim, g, p);
      if (p.jail == null) continue;
      sim.pushLog(`衛兵の${g.given}が聞き込みの末に${sim.fullName(p)}を捕らえた。`, 'event', [g.id, p.id], p.pos);
    }
  }
}

// ================= 薬物 =================
function drugsDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  // 栽培：森の畑から禁制の草が採れる（栽培人が森へ出かけた日は多め）
  for (const p of sim.living()) {
    if (p.uwRole !== 'grower' || !free(p)) continue;
    const k = sim.townOf(p).kingdom;
    const got = 1 + (p.uwGrewToday === sim.today - 1 || p.uwGrewToday === sim.today ? 3 : 0);
    uw.stock[k] = Math.min(40, (uw.stock[k] || 0) + got);
    { const dl = sim.living().find((q) => q.uwRole === 'dealer' && q !== p && sim.townOf(q).kingdom === k && free(q) && spendable(sim, q) > got * 2 + 5); if (dl) { pay(sim, dl, got * 2); earn(sim, p, got * 2, 0.5); } }   // 売人が買い取る
    // 見回りに見つかる
    if (R.chance(0.012 * rate)) {
      wanted(sim, p, '禁制の草の栽培');
      record(sim, '禁制の草の栽培', p, null);
      sim.pushLog(`森の奥で禁制の草の畑が見つかった。${sim.fullName(p)}が手配された。`, 'event', [p.id], p.pos);
    }
  }
  // 依存している人
  for (const p of sim.living()) {
    if (!p.addiction) continue;
    if (!adult(sim, p)) { p.addiction = 0; continue; }
    const used = p.uwLastUse >= sim.today - 1;
    p.addiction = clamp(p.addiction - (p.uwRehab ? 7 : 2), 0, 100);
    if (!used && p.addiction > 25) {
      p.uwWithdraw = Math.round(p.addiction);
      p.hp = Math.max(1, p.hp - p.addiction / 12);
      p.needs.pleasure = Math.max(0, p.needs.pleasure - 15);
      if (R.chance(0.3)) sim.remember(p, R.pick([`${DRUGS[p.uwDrug]?.name || '薬'}が切れて、手の震えが止まらない`, '薬のことばかり考えてしまう', '体がだるくて、何も手につかない']), { emo: -0.6, imp: 0.5, k: 'drug' });
    } else if (used) p.uwWithdraw = 0;
    // 家族との仲が悪くなる
    if (p.addiction > 40 && R.chance(0.3)) {
      const hh = sim.hh(p);
      if (hh && hh.members.length > 1) {
        const took = Math.min(10, Math.max(0, hh.money * 0.08));
        hh.money -= took; p.purse = (p.purse || 0) + took;
        for (const id of hh.members) {
          const q = S.people[id];
          if (!q || q === p || sim.ageOf(q) < 12) continue;
          sim.relMut(q, p).a -= 5;
          if (R.chance(0.35)) sim.remember(q, `${p.given}が家のお金を薬につぎ込んでいる`, { emo: -0.7, imp: 0.6, about: [p.id], k: 'family' });
        }
      }
    }
    // 立ち直りのきっかけ
    if (!p.uwRehab && p.addiction >= 25) {
      const healers = sim.living().filter((q) => HEALERS[q.job] && q.s === p.s && q.jail == null && q !== p);
      const fam = (sim.hh(p)?.members || []).map((id) => S.people[id]).filter((q) => q && q !== p && sim.rel(q, p).a > 10);
      const ch = 0.025 + (healers.length ? 0.035 : 0) + (fam.length ? 0.02 : 0) + p.pers.C * 0.03 + p.values.faith * 0.02;
      if (R.chance(ch)) {
        const h = healers.length ? R.pick(healers) : null;
        p.uwRehab = { by: h?.id ?? null, day: sim.today };
        const who = h ? `${HEALERS[h.job]}の${h.given}` : fam.length ? `家族の${fam[0].given}` : '自分';
        sim.remember(p, `${who}に支えられて、薬を断つ決心をした`, { emo: 0.5, imp: 0.9, about: h ? [h.id] : [], k: 'drug' });
        if (h) { sim.remember(h, `薬に溺れた${p.given}の立ち直りを支えることにした`, { emo: 0.3, imp: 0.6, about: [p.id] }); sim.relMut(p, h).a += 15; }
        sim.pushLog(`${sim.fullName(p)}は${who === '自分' ? '自ら' : who + 'の支えで'}薬を断つ決心をした。`, 'event', [p.id], p.pos);
      }
    } else if (p.uwRehab) {
      // ぶり返し
      const dealer = sim.living().some((q) => q.uwRole === 'dealer' && q.s === p.s && free(q));
      if (dealer && R.chance(0.03 + p.pers.N * 0.03)) {
        p.uwRehab = null;
        sim.remember(p, '断っていた薬に、また手を出してしまった', { emo: -0.8, imp: 0.8, k: 'drug' });
        record(sim, '薬のぶり返し', null, p);
      } else if (p.addiction <= 0) {
        const by0 = S.people[p.uwRehab.by]; const by = by0 && by0.deathYear == null && by0.needs ? by0 : null;
        p.uwRehab = null; p.addiction = 0; p.uwWithdraw = 0;
        sim.remember(p, 'ついに薬を断ち切った。もう二度と手を出さない', { emo: 0.9, imp: 0.95, about: by ? [by.id] : [], k: 'drug' });
        for (const id of sim.hh(p)?.members || []) { const q = S.people[id]; if (q && q !== p) { sim.relMut(q, p).a += 10; sim.remember(q, `${p.given}が薬を断ち切った`, { emo: 0.7, imp: 0.6, about: [p.id] }); } }
        if (by) { by.needs.esteem = Math.min(100, by.needs.esteem + 25); sim.remember(by, `${p.given}が薬を断ち切った。支えてきた甲斐があった`, { emo: 0.8, imp: 0.7, about: [p.id] }); }
        sim.pushLog(`${sim.fullName(p)}が薬を断ち切り、立ち直った。`, 'event', [p.id], p.pos);
        record(sim, '薬からの立ち直り', null, p);
      }
    }
    if (p.addiction <= 0) { p.addiction = 0; p.uwWithdraw = 0; }
  }
  // 取り締まり：売れば売るほど国の目が厳しくなる
  for (const p of sim.living()) {
    if (p.uwRole !== 'dealer' || !free(p) || S.wanted[p.id]) continue;
    const k = sim.townOf(p).kingdom;
    if (R.chance(Math.min(0.2, (uw.heat[k] || 0) * 0.01) * rate)) {
      wanted(sim, p, '薬の密売');
      record(sim, '薬の密売（摘発）', p, null);
      sim.news(`${townName(sim, p)}で禁制の薬の売人として${sim.fullName(p)}が手配された`, 1, p.pos);
      uw.heat[k] *= 0.5;
    }
  }
}

// 酒場で売人が薬をさばく
function dealHourly(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  for (const d of sim.living()) {
    if (d.uwRole !== 'dealer' || !free(d) || d.action?.type !== 'uw_deal' || d.action.phase !== 'do') continue;
    const k = sim.townOf(d).kingdom;
    const buyers = sim.living().filter((q) => q !== d && q.jail == null && (d.inside != null ? q.inside === d.inside : !q.inside && dist(q, d) < 4) && adult(sim, q) && !LAWFUL.has(q.job) && !ELITE.has(q.rank));
    for (const q of buyers) {
      if ((uw.stock[k] || 0) < 1) break;
      const addicted = (q.addiction || 0) >= 8;
      if (addicted && q.uwRehab && R.chance(0.8)) continue;
      const curious = !addicted && R.chance(0.025 * rate * clamp((100 - q.mood) / 50 + q.pers.N + q.pers.O - q.pers.C - q.values.faith * 0.5, 0, 2));
      if (!addicted && !curious) continue;
      if (addicted && q.uwLastUse === sim.today) continue;
      sellDrug(sim, d, q);
    }
    // 衛兵に見られる
    const cops = sim.living().filter((q) => LAWFUL.has(q.job) && q.action?.type !== 'sleep' && (d.inside != null ? q.inside === d.inside : !q.inside && dist(q, d) < 6));
    if (cops.length && R.chance(0.06)) {
      const g = cops[0];
      if (g.uwCorrupt && spendable(sim, d) > 10) { const b = Math.min(20, spendable(sim, d)); pay(sim, d, b); earn(sim, g, b, 0.8); g.uwBribes = (g.uwBribes || 0) + 1; record(sim, '贈賄', d, g); sim.remember(g, `売人の${d.given}から口止め料を受け取った`, { emo: 0.1, imp: 0.5, about: [d.id], k: 'uwcrime' }); continue; }
      wanted(sim, d, '薬の密売');
      record(sim, '薬の密売（現行犯）', d, null);
      sim.pushLog(`衛兵の${g.given}が、酒場で薬をさばいていた${sim.fullName(d)}を見とがめた。`, 'event', [g.id, d.id], d.pos);
      d.inside = null; arrest(sim, g, d);
    }
  }
}
function sellDrug(sim, d, q, forced) {
  const S = sim.S, R = sim.rng, uw = S.uw;
  if (!adult(sim, q)) return false;
  const k = sim.townOf(d).kingdom;
  const kind = q.uwDrug || R.weighted(Object.keys(DRUGS), (x) => ({ dream: 5, lotus: 3, mana: 1 }[x]));
  const price = DRUGS[kind].price;
  if (spendable(sim, q) < price) return false;
  pay(sim, q, price); earn(sim, d, price, 0.6);
  uw.stock[k] = Math.max(0, (uw.stock[k] || 0) - 1);
  uw.heat[k] = (uw.heat[k] || 0) + 1;
  const first = !q.addiction && !q.uwEverUsed;
  q.uwDrug = kind; q.uwEverUsed = true;
  q.addiction = clamp((q.addiction || 0) + DRUGS[kind].hook * (1.2 - q.pers.C * 0.5), 0, 100);
  q.uwLastUse = sim.today; q.uwWithdraw = 0;
  q.needs.pleasure = 100; q.mood = Math.min(100, q.mood + 15);
  record(sim, first ? '薬の初使用' : '薬の売買', d, q, { drug: kind });
  if (first) {
    sim.remember(q, `${d.given}にすすめられて、${DRUGS[kind].name}を試した`, { emo: 0.4, imp: 0.7, about: [d.id], k: 'drug' });
    if (sim.isWatched(q) || R.chance(0.3)) sim.pushLog(`${sim.fullName(q)}が酒場の隅で${DRUGS[kind].name}を買った。`, 'event', [q.id, d.id], q.pos);
  }
  void forced;
  return true;
}
function withdrawalHourly(sim) {
  for (const p of sim.living()) {
    if (!p.uwWithdraw) continue;
    p.mood = Math.max(0, p.mood - p.uwWithdraw / 12);
    p.needs.pleasure = Math.max(0, p.needs.pleasure - 2);
    p.needs.sleep = Math.max(0, p.needs.sleep - 1);
  }
}

// ================= 性犯罪（抽象表現のみ。当事者は必ず18歳以上） =================
function sexCrimeDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  // 遅れて届く訴え
  for (const pe of uw.pending.slice()) {
    if (pe.day > sim.today) continue;
    uw.pending.splice(uw.pending.indexOf(pe), 1);
    const off = S.people[pe.off], vic = S.people[pe.vic];
    if (!alive(off) || !adult(sim, off) || !adult(sim, vic) || off.jail != null) continue;
    reportAssault(sim, off, vic);
  }
  if (sim.today - uw.lastSex < 8 || !R.chance(0.03 * rate)) return;
  const offs = sim.living().filter((p) => sim.ageOf(p) >= 20 && sim.ageOf(p) <= 60 && free(p) && p.pers.A < 0.2 && p.pers.C < 0.45 && !S.wanted[p.id] && !ELITE.has(p.rank) && !p.hero);
  const off = R.weighted(offs, (p) => (0.25 - p.pers.A) * 10 * (p.sex === 'm' ? 4 : 1));
  if (!off || !adult(sim, off)) return;
  const vics = sim.living().filter((q) => q !== off && q.s === off.s && adult(sim, q) && free(q) && q.hh !== off.hh && q.spouseId !== off.id && !sim.isKin(off, q) && q.jail == null && !q.uwTrauma);
  const vic = vics.length ? R.pick(vics) : null;
  if (!vic || !adult(sim, vic) || !adult(sim, off)) return;
  uw.lastSex = sim.today;
  record(sim, '性的暴行', off, vic);
  sim.remember(vic, `${off.given}に乱暴を働かれた`, { emo: -1, imp: 1, about: [off.id], k: 'assault' });
  sim.remember(off, `${vic.given}に乱暴を働いた`, { emo: -0.1, imp: 0.9, about: [vic.id], k: 'uwcrime' });
  sim.relMut(vic, off).a = -100;
  vic.uwTrauma = { lv: 100, by: off.id, day: sim.today, k: 'assault' };
  vic.action = null;
  // 訴え出るか（すぐ、または数日後）
  const ch = clamp(0.45 + vic.values.courage * 0.3 + ((sim.hh(vic)?.members.length || 1) > 1 ? 0.1 : 0), 0, 0.95);
  if (R.chance(ch)) uw.pending.push({ off: off.id, vic: vic.id, day: sim.today + R.int(0, 3) });
  else vic.uwTrauma.silent = true;
}
function reportAssault(sim, off, vic) {
  const S = sim.S;
  if (!adult(sim, off) || !adult(sim, vic)) return;
  if (vic.uwTrauma) vic.uwTrauma.silent = false;
  wanted(sim, off, '性的暴行');
  sim.remember(vic, `勇気を出して、${off.given}のしたことを衛兵に訴え出た`, { emo: 0.1, imp: 0.9, about: [off.id], k: 'assault' });
  sim.news(`${townName(sim, off)}で性的暴行事件。${sim.fullName(off)}が手配された`, 2, off.pos);
  // 町の怒りと、加害者の孤立
  const locals = sim.living().filter((q) => q.s === off.s && q !== off && q !== vic && sim.ageOf(q) >= 16);
  for (const q of locals) sim.relMut(q, off).a = Math.min(sim.rel(q, off).a, -40);
  sim.gossip(off, '乱暴を働いた罪で手配されたらしい', -1, locals.filter(() => sim.rng.chance(0.5)), { silent: true });
  for (const id of sim.hh(off)?.members || []) { const q = S.people[id]; if (q && q !== off && sim.ageOf(q) >= 14) sim.remember(q, `身内の${off.given}が罪を犯して手配された。町を歩くのがつらい`, { emo: -0.8, imp: 0.8, about: [off.id], k: 'family' }); }
}

// つきまとい：想いを寄せた相手に拒まれ、執着して付け回す。段階的に悪化し、訴えられて捕まる
const STALK_STEPS = ['', 'のあとを付け回すようになった', 'の家の前で待ち伏せするようになった', 'に何通も執拗な手紙を送りつけた', 'を脅すような言葉を口にした'];
function stalkingDaily(sim) {
  const S = sim.S, R = sim.rng, rate = (S.uw.rate || 1) * lawCrimeMul(sim);
  for (const p of sim.living()) {
    if (p.uwStalk) {
      const v = S.people[p.uwStalk.who];
      if (!adult(sim, v) || !adult(sim, p) || p.jail != null || v.jail != null) { p.uwStalk = null; continue; }
      const st = p.uwStalk;
      // 諦める
      if (R.chance(0.02 + p.pers.C * 0.04) || v.spouseId != null && R.chance(0.2)) {
        p.uwStalk = null;
        sim.remember(p, `${v.given}のことは、もう諦めることにした`, { emo: -0.4, imp: 0.6, about: [v.id] });
        continue;
      }
      if (st.lv < 4 && R.chance(0.3)) {
        st.lv++;
        record(sim, 'つきまとい', p, v, { lv: st.lv });
        sim.remember(v, `${p.given}${STALK_STEPS[st.lv]}`, { emo: -0.4 - st.lv * 0.12, imp: 0.5 + st.lv * 0.1, about: [p.id], k: 'stalk' });
        sim.relMut(v, p).a -= 10;
        v.uwTrauma = { lv: Math.max(v.uwTrauma?.lv || 0, 15 + st.lv * 10), by: p.id, day: sim.today, k: 'stalk' };
        // 家族や友人が気づいて守る
        for (const id of sim.hh(v)?.members || []) { const q = S.people[id]; if (q && q !== v && sim.ageOf(q) >= 16 && R.chance(0.4)) { sim.relMut(q, p).a -= 20; sim.remember(q, `${v.given}が${p.given}に付きまとわれている。守ってやらないと`, { emo: -0.6, imp: 0.6, about: [p.id, v.id], k: 'family' }); } }
      }
      // 衛兵に訴える
      if (st.lv >= 2 && !S.wanted[p.id] && R.chance(0.15 + v.values.courage * 0.25 + st.lv * 0.05)) {
        wanted(sim, p, 'つきまとい');
        sim.remember(v, `${p.given}のつきまといを衛兵に訴え出た`, { emo: 0.2, imp: 0.8, about: [p.id], k: 'stalk' });
        sim.pushLog(`${sim.fullName(v)}が、${sim.fullName(p)}のつきまといを衛兵に訴え出た。`, 'event', [v.id, p.id], v.pos);
        sim.gossip(p, 'ある人に付きまとって訴えられたらしい', -0.7, sim.living().filter((q) => q.s === p.s && R.chance(0.3)), { silent: true });
      }
      continue;
    }
  }
  if (!R.chance(0.08 * rate)) return;
  const cands = sim.living().filter((p) => adult(sim, p) && free(p) && p.spouseId == null && p.pers.A < 0.3 && p.pers.N > 0.55 && !S.wanted[p.id]);
  for (const p of R.shuffle(cands).slice(0, 25)) {
    const c = sim.crushOf(p);
    if (!c || !adult(sim, c) || sim.rel(c, p).a > 10) continue;
    p.uwStalk = { who: c.id, lv: 1, since: sim.today };
    record(sim, 'つきまとい', p, c, { lv: 1 });
    sim.remember(c, `${p.given}の想いを断ったのに、あとを付け回されるようになった`, { emo: -0.5, imp: 0.6, about: [p.id], k: 'stalk' });
    sim.remember(p, `${c.given}に拒まれた。それでも諦めきれない`, { emo: -0.5, imp: 0.8, about: [c.id], k: 'uwcrime' });
    sim.relMut(c, p).a -= 15;
    break;
  }
}

// 心の傷：外出を避け、家族・友人・修道女が支える
function traumaDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const v of sim.living()) {
    const t = v.uwTrauma;
    if (!t) continue;
    const sup = [];
    for (const id of sim.hh(v)?.members || []) { const q = S.people[id]; if (q && q !== v && sim.ageOf(q) >= 14 && q.jail == null && q.id !== t.by) sup.push(q); }
    for (const [id, r] of Object.entries(v.rel)) { const q = S.people[id]; if (r.a > 40 && alive(q) && q.s === v.s && q.jail == null && !sup.includes(q) && q.id !== t.by && sim.ageOf(q) >= 16) sup.push(q); }
    const nun = sim.living().find((q) => (q.job === 'nun' || q.job === 'priest') && q.s === v.s && q !== v && q.jail == null);
    if (nun && !sup.includes(nun) && (t.k === 'assault' || R.chance(0.3))) sup.push(nun);
    const helpers = sup.slice(0, 3);
    if (helpers.length && R.chance(0.45)) {
      const h = R.pick(helpers);
      if (!t.silent || sim.hh(h)?.id === v.hh || h === nun) {
        sim.remember(v, `${h.given}がそばにいて、支えてくれた`, { emo: 0.5, imp: 0.6, about: [h.id], k: 'help' });
        sim.remember(h, `つらい思いをした${v.given}のそばにいて、支えた`, { emo: 0.2, imp: 0.5, about: [v.id] });
        sim.relMut(v, h).a += 6; sim.relMut(h, v).a += 4;
      }
    }
    t.lv -= 1.5 + helpers.length * 1.5 + v.pers.E;
    // 支えられて、黙っていたことを打ち明ける
    if (t.silent && t.k === 'assault' && helpers.length && R.chance(0.04)) {
      const off = S.people[t.by];
      if (adult(sim, off) && off.jail == null && adult(sim, v)) reportAssault(sim, off, v);
      t.silent = false;
    }
    if (t.lv <= 0) {
      v.uwTrauma = null;
      sim.remember(v, '少しずつ、また外を歩けるようになった', { emo: 0.5, imp: 0.7, k: 'help' });
    }
  }
}

// ================= 猟奇的な連続殺人犯（ごく稀・同時に1人まで） =================
function killerDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw;
  const K = uw.killer;
  if (K) {
    const k = S.people[K.id];
    if (!alive(k)) {
      // 死んだ（処刑・討伐・寿命など）
      if (!K.identified) sim.chron(`「${K.name}」事件は、犯人がわからないまま終わった（犠牲者${K.victims.length}人）`, K.kingdom);
      else if (!K.caught) sim.chron(`「${K.name}」事件の犯人${K.fullName}は、捕まる前に命を落とした`, K.kingdom);
      if (S.uw.fear[K.s]) S.uw.fear[K.s] *= 0.3;
      uw.killer = null; uw.nextKiller = sim.today + R.int(120, 240) / (uw.rate || 1);
      return;
    }
    // 別の罪で牢にいる間に正体が割れたら、改めて裁く
    if (k.jail != null && K.identified && !K.caught && k.crime !== '連続殺人') { k.crime = '連続殺人'; k.uwTried = false; delete S.wanted[k.id]; }
    if (k.jail != null && !K.caught) { if (K.identified) return; }
    if (K.caught) {
      if (!K.caughtLogged) {
        K.caughtLogged = true; K.caught = true;
        k.uwVictims = K.victims.length;
        sim.chron(`「${K.name}」事件の犯人${sim.fullName(k)}が捕らえられた（犠牲者${K.victims.length}人）`, K.kingdom);
        uw.fear[K.s] = (uw.fear[K.s] || 0) * 0.3;
        for (const id of K.victims) { const v = S.people[id]; if (v) v.killedBy = k.id; }
        // 捜査した者の手柄
        for (const g of sim.living().filter((q) => LAWFUL.has(q.job) && q.s === K.s).slice(0, 4)) { g.fame += 3; sim.remember(g, `「${K.name}」事件の犯人がついに捕まった`, { emo: 0.7, imp: 0.8, about: [k.id], k: 'justice' }); }
      }
      return;
    }
    // 捜査：衛兵と冒険者が手がかりを集める
    if (K.victims.length) {
      const inv = sim.living().filter((q) => (LAWFUL.has(q.job) || ['adventurer', 'warrior', 'archer', 'sage'].includes(q.job)) && q.s === K.s && q.jail == null);
      K.clues += Math.min(4, inv.length) * 0.12 * (uw.rate > 1 ? 2 : 1);
      if (!K.identified && K.clues >= 6) {
        K.identified = true; K.fullName = sim.fullName(k);
        wanted(sim, k, '連続殺人');
        if (S.wanted[k.id]) S.wanted[k.id].bounty = 300;
        sim.news(`「${K.name}」事件の犯人は${sim.fullName(k)}と判明。300銅貨の懸賞金がかけられた`, 3, k.pos);
        sim.gossip(k, '夜の連続殺人の犯人だったらしい', -1, sim.living().filter((q) => q.s === k.s), { silent: true });
        for (const q of sim.living().filter((q) => q.s === k.s && q !== k)) sim.relMut(q, k).a = -100;
      }
    }
    return;
  }
  if (sim.today < uw.nextKiller) return;
  // 新たに現れる：共感を著しく欠いた、ごく一部の人物
  const cands = sim.living().filter((p) => sim.ageOf(p) >= 20 && sim.ageOf(p) <= 55 && free(p) && p.pers.A < 0.12 && !LAWFUL.has(p.job) && !ELITE.has(p.rank) && !p.hero && !p.party && !S.wanted[p.id] && !p.uwRole);
  if (!cands.length) { uw.nextKiller = sim.today + 20; return; }
  const k = R.pick(cands);
  const s = sim.townOf(k);
  k.dark = true;
  uw.killerCases++;
  uw.killer = { id: k.id, s: k.s, kingdom: s.kingdom, since: sim.today, next: sim.today + R.int(3, 8), victims: [], clues: 0, identified: false, name: `${s.name.replace(/^王都|村$/, '')}の夜の影` };
  sim.remember(k, '人の痛みが、どうしても自分のことのように感じられない', { emo: 0, imp: 0.5, k: 'uwcrime' });
}
function killerHourly(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, K = uw.killer;
  if (!K || K.caught) return;
  const k = S.people[K.id];
  if (!free(k) || k.fight) return;
  const h = sim.hour();
  if (!(h >= 22 || h < 3) || sim.today < K.next) return;
  // 夜道にひとりでいる大人を狙う
  const town = sim.townOf(k);
  const vics = sim.living().filter((q) => q !== k && q.s === k.s && adult(sim, q) && !q.inside && q.jail == null && !q.fight && q.action?.type !== 'sleep' && !((JOBS[q.job]?.combat || 0) >= 2) && Math.hypot(q.pos.x - town.x, q.pos.z - town.z) < town.r + 6);
  const alone = vics.filter((q) => !sim.living().some((o) => o !== q && o !== k && !o.inside && o.deathYear == null && dist(o, q) < 7));
  if (!alone.length) return;
  const v = R.pick(alone);
  K.next = sim.today + R.int(6, 12);
  K.victims.push(v.id);
  K.clues += 1;
  record(sim, '連続殺人', k, v, { n: K.victims.length });
  // 遠くから人影を見た者がいれば、手がかりが増える
  const far = sim.living().filter((o) => o !== v && o !== k && o.action?.type !== 'sleep' && !o.inside && dist(o, v) < 14);
  if (far.length && R.chance(0.5)) { K.clues += 2; sim.remember(far[0], '夜道で、誰かが走り去る人影を見た', { emo: -0.8, imp: 0.8, k: 'crime' }); }
  const pos = { ...v.pos };
  v.uwKilledBy = k.id;
  sim.die(v, 'murder', null);
  uw.fear[K.s] = Math.min(1, (uw.fear[K.s] || 0) + 0.5);
  const n = K.victims.length;
  sim.news(n === 1 ? `${town.name}の夜道で${sim.fullName(v)}が何者かに殺された` : `${town.name}でまた夜道の殺人。「${K.name}」事件の犠牲者は${n}人になった`, n >= 2 ? 3 : 2, pos);
  sim.gossip(v, '夜道で何者かに殺されたらしい', -1, sim.living().filter((q) => q.s === K.s && R.chance(0.6)), { silent: true });
  for (const q of sim.living()) if (q.s === K.s && q !== k && R.chance(0.3)) sim.remember(q, '夜道の殺人が怖くて、日が暮れたら出歩きたくない', { emo: -0.6, imp: 0.5, k: 'fear' });
  sim.remember(k, `夜道で${v.given}の命を奪った`, { emo: 0, imp: 0.7, about: [v.id], k: 'uwcrime' });
  S.unsolved = S.unsolved || [];
  S.unsolved.push({ victim: v.id, killer: k.id, day: sim.today });
}

// ================= 放火 =================
function arsonDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  if (sim.today - uw.lastArson < 6 || !R.chance(0.03 * rate)) return;
  const cands = [];
  for (const p of sim.living()) {
    if (sim.ageOf(p) < 16 || !free(p) || p.pers.A > 0.3) continue;
    let tgt = p.revenge != null ? S.people[p.revenge] : null;
    if (!alive(tgt)) { tgt = null; for (const [id, r] of Object.entries(p.rel)) if (r.a < -60) { const q = S.people[id]; if (alive(q) && q.s === p.s && q.hh !== p.hh) { tgt = q; break; } } }
    if (tgt && sim.homeOf(tgt) && sim.homeOf(tgt).type === 'house' && tgt.hh !== p.hh) cands.push([p, tgt]);
  }
  if (!cands.length) return;
  const [p, tgt] = R.pick(cands);
  const b = sim.homeOf(tgt), hh = sim.hh(tgt);
  uw.lastArson = sim.today;
  record(sim, '放火', p, tgt);
  const lost = Math.round(Math.max(0, hh.money) * 0.3);
  hh.money -= lost; hh.food = 0; moneyOut(sim, lost, '火事で焼けた銅貨');
  if (b.value) b.value = Math.round(b.value * 0.7);
  b.burnt = sim.today;
  for (const id of hh.members) { const q = S.people[id]; if (q && sim.ageOf(q) >= 6) sim.remember(q, `夜中に家が燃えた。蓄えの多くを失ったが、家族は無事だった`, { emo: -0.9, imp: 0.95, k: 'fire' }); }
  sim.remember(p, `恨みのある${tgt.given}の家に火をつけた`, { emo: 0.1, imp: 0.9, about: [tgt.id], k: 'uwcrime' });
  const seen = R.chance(0.45);
  sim.news(`${townName(sim, tgt)}で${hh.name}の家から火が出た。${seen ? `${sim.fullName(p)}が火をつけるのを見た者がいる` : '放火の疑いがある'}`, 2, b.door);
  if (seen) { wanted(sim, p, '放火'); for (const id of hh.members) { const q = S.people[id]; if (q && sim.ageOf(q) >= 14) sim.relMut(q, p).a = -100; } }
  else S.unsolvedFires = (S.unsolvedFires || 0) + 1;
  // 近所の人が消火と片付けを手伝う
  const help = sim.living().filter((q) => q.s === tgt.s && q.hh !== hh.id && q.pers.A > 0.6 && sim.ageOf(q) >= 16 && q.jail == null).slice(0, 3);
  for (const q of help) { sim.remember(q, `燃えた${hh.name}の片付けを手伝った`, { emo: 0.2, imp: 0.4, about: [tgt.id] }); sim.relMut(tgt, q).a += 8; }
}

// ================= 誘拐と身代金（大人のみ） =================
function kidnapHourly(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  const h = sim.hour();
  if (h < 9 || h >= 18 || !R.chance(0.04 * rate)) return;
  for (const hide of S.world.buildings.filter((b) => b.type === 'hideout')) {
    if (sim.today - (hide.lastKidnap ?? -99) < 12) continue;
    const band = sim.living().filter((p) => p.bandit && p.hideout === hide.id && free(p) && !p.fight);
    if (!band.length) continue;
    const prey = sim.living().find((q) => !q.bandit && adult(sim, q) && free(q) && !q.inside && !q.fight && !(JOBS[q.job]?.combat >= 2) && Math.hypot(q.pos.x - hide.x, q.pos.z - hide.z) < 22 && sim.householdMoney(q) > 60 && Math.hypot(q.pos.x - sim.townOf(q).x, q.pos.z - sim.townOf(q).z) > sim.townOf(q).r + 2);
    if (!prey || !adult(sim, prey)) continue;
    const b = band[0];
    hide.lastKidnap = sim.today;
    const ransom = Math.round(clamp(sim.householdMoney(prey) * 0.5, 30, 200));
    prey.uwCaptive = { by: b.id, hide: hide.id, ransom, day: sim.today };
    prey.fight = null; prey.path = []; prey.talk = null;
    prey.mission = { type: 'captive', x: hide.door.x, z: hide.door.z, bld: hide.id, until: S.t + 6 * 1440, dur: 240 };
    prey.action = null;
    prey.pos = { ...hide.door }; prey.inside = hide.id;
    record(sim, '誘拐', b, prey, { ransom });
    wanted(sim, b, '誘拐');
    hide.bounty = Math.min(300, (hide.bounty || 0) + 60);
    sim.remember(prey, `街道で${b.given}ら盗賊にさらわれ、${hide.name}に閉じ込められた`, { emo: -1, imp: 1, about: [b.id], k: 'robbed' });
    sim.news(`${sim.fullName(prey)}が盗賊にさらわれた。家族に身代金${ransom}銅貨が求められている`, 2, hide.door);
    for (const id of sim.hh(prey)?.members || []) { const q = S.people[id]; if (q && q !== prey && sim.ageOf(q) >= 10) sim.remember(q, `${prey.given}が盗賊にさらわれた`, { emo: -0.95, imp: 0.95, about: [prey.id], k: 'robbed' }); }
    return;
  }
}
function kidnapDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const p of sim.living()) {
    const c = p.uwCaptive;
    if (!c) continue;
    const hide = sim.building(c.hide);
    const band = sim.living().filter((q) => q.bandit && q.hideout === c.hide && q.jail == null);
    const hh = sim.hh(p);
    let how = null;
    if (!band.length) how = 'rescued';
    else if (hh && hh.money >= c.ransom && R.chance(0.6)) {
      hh.money -= c.ransom;
      const boss = band.find((q) => q.job === 'banditchief') || band[0];
      if (sim.hh(boss)) sim.hh(boss).money += c.ransom;
      how = 'paid';
    } else if (sim.today - c.day >= 5) how = 'freed';
    else if (R.chance(0.12)) how = 'escaped';
    if (!how) continue;
    p.uwCaptive = null; p.mission = null; p.action = null; p.inside = null; p.pos = { ...hide.door };
    const txt = { paid: `家族が身代金${c.ransom}銅貨を払い、盗賊から解放された`, rescued: '盗賊が捕まり、ようやく解放された', freed: '身代金が払われないまま、盗賊に放り出された', escaped: '見張りの隙をついて、盗賊のアジトから逃げ出した' }[how];
    sim.remember(p, txt, { emo: 0.5, imp: 0.95, k: 'robbed' });
    p.uwTrauma = { lv: 35, by: c.by, day: sim.today, k: 'kidnap' };
    const logTxt = { paid: `${sim.fullName(p)}の家族が身代金${c.ransom}銅貨を払い、${sim.fullName(p)}が解放された。`, rescued: `盗賊が捕まり、さらわれていた${sim.fullName(p)}が解放された。`, freed: `${sim.fullName(p)}が身代金を払われないまま、盗賊に放り出された。`, escaped: `${sim.fullName(p)}が盗賊のアジトから逃げ出した。` }[how];
    sim.pushLog(logTxt, 'event', [p.id], p.pos);
    record(sim, '誘拐からの解放', null, p, { how });
  }
}

// ================= 恐喝・ゆすり =================
function blackmailDaily(sim) {
  const S = sim.S, R = sim.rng, rate = (S.uw.rate || 1) * lawCrimeMul(sim);
  // 続いているゆすり
  for (const b of sim.living()) {
    const bm = b.uwBlackmail;
    if (!bm) continue;
    const v = S.people[bm.who];
    if (!free(b) || !alive(v) || v.jail != null) { b.uwBlackmail = null; continue; }
    if ((sim.today - bm.since) % 7 !== 6) continue;
    if (R.chance(0.2 + v.values.courage * 0.25) || spendable(sim, v) < 8) {
      wanted(sim, b, '恐喝');
      sim.remember(v, `${b.given}のゆすりに耐えかねて、衛兵に訴え出た`, { emo: 0.2, imp: 0.8, about: [b.id], k: 'crime' });
      sim.pushLog(`${sim.fullName(v)}が${sim.fullName(b)}のゆすりを衛兵に訴え出た。`, 'event', [v.id, b.id], v.pos);
      b.uwBlackmail = null;
      continue;
    }
    const amt = Math.round(Math.min(25, spendable(sim, v) * 0.2));
    pay(sim, v, amt); earn(sim, b, amt, 0.7);
    record(sim, '恐喝', b, v, { amt });
    sim.remember(v, `また${b.given}に口止め料として${amt}銅貨を払わされた`, { emo: -0.7, imp: 0.6, about: [b.id], k: 'crime' });
    sim.relMut(v, b).a -= 10;
  }
  if (!R.chance(0.12 * rate)) return;
  // 他人の秘密（見かけた罪、薬のこと）を握る
  const cands = sim.living().filter((p) => adult(sim, p) && free(p) && p.pers.A < 0.3 && !p.uwBlackmail && !S.wanted[p.id]);
  for (const b of R.shuffle(cands).slice(0, 20)) {
    let v = null, secret = '';
    const m = b.memories.find((x) => x.k === 'crime' && x.about?.length && sim.today - x.t < 30);
    if (m) { const q = S.people[m.about[0]]; if (alive(q) && q !== b && q.jail == null && !S.wanted[q.id] && adult(sim, q)) { v = q; secret = '昔の悪事'; } }
    if (!v) { const q = sim.living().find((x) => x.s === b.s && x !== b && (x.addiction || 0) > 30 && adult(sim, x) && x.jail == null); if (q) { v = q; secret = '薬のこと'; } }
    if (!v || spendable(sim, v) < 15) continue;
    b.uwBlackmail = { who: v.id, since: sim.today, secret };
    const amt = Math.round(Math.min(25, spendable(sim, v) * 0.2));
    pay(sim, v, amt); earn(sim, b, amt, 0.7);
    record(sim, '恐喝', b, v, { amt });
    sim.remember(v, `${b.given}に${secret}をばらすと脅され、${amt}銅貨を払った`, { emo: -0.8, imp: 0.8, about: [b.id], k: 'crime' });
    sim.remember(b, `${v.given}の${secret}をネタに銅貨を巻き上げた`, { emo: 0.3, imp: 0.6, about: [v.id], k: 'uwcrime' });
    sim.relMut(v, b).a -= 30;
    break;
  }
}

// ================= 贈収賄・横領 =================
function bribeHourly(sim) {
  const S = sim.S, R = sim.rng;
  const cops = sim.living().filter((g) => g.uwCorrupt && g.jail == null && !g.inside && g.action?.type !== 'sleep');
  if (!cops.length) return;
  for (const [id, w] of Object.entries(S.wanted)) {
    const p = S.people[id];
    if (!free(p) || p.uwBribed === sim.today || CRIMES[w.crime]?.grave || w.crime === '殺人') continue;
    const g = cops.find((c) => c.s === p.s && dist(c, p) < 12);
    if (!g || !R.chance(0.35)) continue;
    const bribe = Math.round(10 + Math.min(40, w.days));
    p.uwBribed = sim.today;
    if (spendable(sim, p) < bribe) continue;
    pay(sim, p, bribe); earn(sim, g, bribe, 0.8);
    delete S.wanted[p.id];
    if (p.rank === 'outlaw') { p.rank = p.rankBefore && !['outlaw', 'prisoner'].includes(p.rankBefore) ? p.rankBefore : (JOBS[p.job]?.rank || 'commoner'); delete p.rankBefore; }
    if (p.rank === 'outlaw') p.rank = 'wanderer';
    g.uwBribes = (g.uwBribes || 0) + 1;
    record(sim, '贈賄', p, g, { amt: bribe, crime: w.crime });
    sim.remember(g, `お尋ね者の${p.given}から${bribe}銅貨を受け取り、見逃した`, { emo: 0.2, imp: 0.6, about: [p.id], k: 'uwcrime' });
    sim.remember(p, `衛兵の${g.given}に${bribe}銅貨を握らせて、見逃してもらった`, { emo: 0.4, imp: 0.7, about: [g.id], k: 'uwcrime' });
    if (sim.isWatched(g) || sim.isWatched(p)) sim.pushLog(`衛兵の${g.given}が${sim.fullName(p)}から賄賂を受け取り、見逃した。`, 'event', [g.id, p.id], g.pos);
  }
}
function corruptionDaily(sim) {
  const S = sim.S, R = sim.rng, rate = (S.uw.rate || 1) * lawCrimeMul(sim);
  for (const g of sim.living()) {
    if (!g.uwCorrupt || !g.uwBribes || !free(g)) continue;
    if (!R.chance(Math.min(0.25, 0.015 * g.uwBribes * rate))) continue;
    g.uwCorrupt = false;
    wanted(sim, g, '収賄');
    record(sim, '収賄の発覚', g, null, { n: g.uwBribes });
    sim.news(`${townName(sim, g)}の${JOBS[g.job]?.name || '役人'}${sim.fullName(g)}が賄賂を受け取っていたことが発覚した`, 2, g.pos);
    sim.gossip(g, '賄賂をもらってお尋ね者を見逃していたらしい', -0.8, sim.living().filter((q) => q.s === g.s && R.chance(0.4)), { silent: true });
    g.uwBribes = 0;
  }
  // 財務大臣などの横領
  for (const p of sim.living()) {
    if (!['treasurer', 'chancellor', 'scribe', 'elder'].includes(p.job) || !free(p) || p.pers.A > 0.45 || p.values.ambition < 0.5) continue;
    const town = S.towns[p.s];
    if (!town || town.fund < 50 || !R.chance(0.08)) continue;
    const amt = Math.round(Math.min(30, town.fund * 0.02));
    town.fund -= amt; earn(sim, p, amt, 0.4);
    p.uwEmbezzled = (p.uwEmbezzled || 0) + amt;
    record(sim, '横領', p, null, { amt });
    if (p.uwEmbezzled > 60 && R.chance(0.04 * rate)) {
      wanted(sim, p, '横領');
      const back = Math.min(p.uwEmbezzled, Math.max(0, sim.householdMoney(p)));
      sim.hh(p).money -= back; town.fund += back;
      sim.news(`${townName(sim, p)}の${JOBS[p.job].name}${sim.fullName(p)}が公金${p.uwEmbezzled}銅貨を横領していたことが発覚した`, 2, p.pos);
      sim.chron(`${JOBS[p.job].name}${sim.fullName(p)}の横領が発覚した`, sim.townOf(p).kingdom);
      p.uwEmbezzled = 0;
    }
  }
}

// ================= 偽金づくり =================
function counterfeitDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  for (const p of sim.living()) {
    if (p.uwRole !== 'counterfeiter' || !free(p) || S.wanted[p.id]) continue;
    if (!R.chance(0.5)) continue;
    const made = R.int(6, 14);
    earn(sim, p, made, 0.5); moneyIn(sim, made, '偽金');
    uw.fake[p.s] = (uw.fake[p.s] || 0) + 1;
    record(sim, '偽金づくり', p, null, { amt: made });
    // 偽金をつかまされた商人が損をする
    const vic = sim.living().find((q) => ['merchant', 'baker', 'innkeeper', 'butcher'].includes(q.job) && q.s === p.s && sim.householdMoney(q) > 10 && R.chance(0.3));
    if (vic) { sim.hh(vic).money -= made * 0.5; moneyOut(sim, made * 0.5, 'つかまされた偽金（使えなくなった）'); if (R.chance(0.3)) sim.remember(vic, '売り上げの中に偽の銅貨が混じっていた', { emo: -0.6, imp: 0.5, k: 'theft' }); }
    // 両替商が見抜く
    const changer = sim.living().find((q) => q.job === 'changer' && q.s === p.s && q.jail == null);
    const ch = (changer ? 0.03 : 0.012) * (uw.fake[p.s] || 0) * rate;
    if (R.chance(Math.min(0.3, ch))) {
      wanted(sim, p, '偽金づくり');
      sim.news(`${townName(sim, p)}で偽の銅貨が見つかった。${changer ? `両替商の${changer.given}が見抜き、` : ''}${sim.fullName(p)}が手配された`, 2, p.pos);
      if (changer) { changer.fame += 2; sim.remember(changer, `偽金を見抜き、${p.given}の悪事を暴いた`, { emo: 0.6, imp: 0.7, about: [p.id], k: 'justice' }); }
      uw.fake[p.s] = 0;
    }
  }
}

// ================= 闇市（故買屋） =================
function fenceDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  for (const f of sim.living()) {
    if (f.uwRole !== 'fence' || !free(f) || S.wanted[f.id]) continue;
    const sellers = sim.living().filter((q) => q !== f && q.s === f.s && free(q) && q.memories?.some((m) => (m.k === 'crime' || m.k === 'uwcrime') && m.t >= sim.today - 1 && /盗ん|巻き上げ|墓/.test(m.txt)));
    for (const q of sellers.slice(0, 3)) {
      const amt = Math.min(R.int(4, 12), Math.max(0, spendable(sim, f) - 5));
      if (amt <= 0) continue;
      pay(sim, f, amt); earn(sim, q, amt, 0.8);   // 故買屋が盗品を買い叩く
      record(sim, '故買', f, q, { amt });
      if (R.chance(0.4)) sim.remember(q, `故買屋の${f.given}に盗品を買い叩かれた`, { emo: 0, imp: 0.3, about: [f.id], k: 'uwcrime' });
    }
    // 闇市：安い盗品を目当てに客が来る
    if (R.chance(0.3)) { const buyer = R.pick(sim.living().filter((q) => q.s === f.s && q !== f && free(q) && spendable(sim, q) > 30).slice(0, 40)); const x = R.int(3, 8) * 1.6; if (buyer) { pay(sim, buyer, x); earn(sim, f, x, 0.5); } uw.stats['闇市の商い'] = (uw.stats['闇市の商い'] || 0) + 1; }
    if (R.chance(0.006 * rate * (1 + sellers.length))) {
      wanted(sim, f, '故買');
      sim.pushLog(`衛兵が闇市の故買屋${sim.fullName(f)}の店を突き止めた。`, 'event', [f.id], f.pos);
    }
  }
}

// ================= 密輸（既存の密輸人と連携） =================
function smuggleDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  for (const p of sim.living()) {
    if (p.job !== 'smuggler' || !free(p) || S.wanted[p.id] || sim.ageOf(p) < 16 || !R.chance(0.35)) continue;
    const k = sim.townOf(p).kingdom;
    const gain = R.int(8, 20);
    const m = sim.market(p.s);
    if (m) for (const g of ['jewelry', 'cloth']) ownStock(sim, p.s, g, p.hh, 0.5);   // 抜け荷は密輸人の品として店先へ
    if (mature(sim)) uw.stock[k] = Math.min(40, (uw.stock[k] || 0) + 2);
    record(sim, '密輸', p, null, { amt: gain });
    if (R.chance(0.05 * rate)) {
      const g = lawfulIn(sim, p.s)[0] || sim.living().find((q) => q.job === 'gatekeeper' && q.s === p.s);
      if (g?.uwCorrupt && spendable(sim, p) > 15) { pay(sim, p, 15); earn(sim, g, 15, 0.8); g.uwBribes = (g.uwBribes || 0) + 1; record(sim, '贈賄', p, g, { amt: 15 }); sim.remember(g, `密輸人の${p.given}の荷を見逃す代わりに銅貨を受け取った`, { emo: 0.1, imp: 0.5, about: [p.id], k: 'uwcrime' }); }
      else if (g) { wanted(sim, p, '密輸'); sim.pushLog(`港で${sim.fullName(p)}の荷から禁制品が見つかった。`, 'event', [p.id], p.pos); }
    }
  }
}

// ================= 暗殺者 =================
function assassinDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  const a = sim.living().find((p) => p.uwRole === 'assassin');
  if (uw.contract) {
    const c = uw.contract, t = S.people[c.target];
    if (!a || !free(a) || !alive(t) || sim.today - c.day > 8) {
      if (a && alive(t) && c.tries < 2 && free(a)) { c.tries++; c.day = sim.today; setHunt(sim, a, t); return; }
      uw.contract = null; if (a) a.mission = null;
    } else if (!a.mission) setHunt(sim, a, t);
    return;
  }
  if (!a || !free(a) || S.wanted[a.id] || sim.today < uw.nextAssassin || !R.chance(0.25 * rate)) return;
  // 依頼人を探す：強い恨みと金を持つ者（王族を狙う依頼はごく稀）
  const clients = [];
  for (const p of sim.living()) {
    if (!adult(sim, p) || !free(p) || p === a || p.pers.A > 0.4 || sim.householdMoney(p) < 80) continue;
    let t = p.revenge != null ? S.people[p.revenge] : null;
    if (!alive(t)) { t = null; for (const [id, r] of Object.entries(p.rel)) if (r.a < -70) { const q = S.people[id]; if (alive(q) && q !== a) { t = q; break; } } }
    if (!t && p.rank === 'noble' && p.values.ambition > 0.8 && R.chance(0.05)) { const king = sim.living().find((q) => q.rank === 'king' && sim.townOf(q).kingdom === sim.townOf(p).kingdom); if (king) t = king; }
    if (t && t !== a && t.jail == null && adult(sim, t)) clients.push([p, t]);
  }
  if (!clients.length) return;
  const [cl, t] = R.pick(clients);
  const fee = Math.round(Math.min(sim.householdMoney(cl) * 0.6, ELITE.has(t.rank) ? 250 : 120));
  pay(sim, cl, fee); earn(sim, a, fee, 0.5);
  uw.contract = { client: cl.id, target: t.id, fee, day: sim.today, tries: 0 };
  uw.nextAssassin = sim.today + R.int(40, 90) / rate;
  record(sim, '暗殺の依頼', cl, t, { fee });
  sim.remember(cl, `ひそかに暗殺者へ${fee}銅貨を渡し、${t.given}の命を狙わせた`, { emo: -0.2, imp: 0.95, about: [t.id], k: 'uwcrime' });
  sim.remember(a, `${fee}銅貨で${t.given}を始末する仕事を請けた`, { emo: 0.1, imp: 0.7, about: [t.id], k: 'uwcrime' });
  setHunt(sim, a, t);
}
function setHunt(sim, a, t) {
  const home = sim.homeOf(t);
  const pl = home ? home.door : { x: Math.round(t.pos.x), z: Math.round(t.pos.z) };
  a.mission = { type: 'uw_hunt', x: pl.x, z: pl.z, until: sim.S.t + 3 * 1440, dur: 30 };
  a.action = null;
}
function assassinStrike(sim, a) {
  const S = sim.S, R = sim.rng, uw = S.uw, c = uw.contract;
  a.mission = null;
  if (!c) return;
  const t = S.people[c.target];
  if (!alive(t) || t.jail != null) { uw.contract = null; return; }
  if (dist(a, t) > 9) { a.action.until = S.t + 5; return; } // 留守：出直す
  const royal = ELITE.has(t.rank);
  const guards = sim.living().filter((q) => ['royalguard', 'knight', 'guard'].includes(q.job) && dist(q, t) < 8 && q.action?.type !== 'sleep');
  const ok = R.chance(clamp(0.65 - guards.length * 0.15 - (royal ? 0.3 : 0) + (a.lv || 1) * 0.02, 0.05, 0.85));
  const seen = R.chance(royal ? 0.6 : 0.3) || guards.length > 0;
  const cl = S.people[c.client];
  uw.contract = null;
  if (ok) {
    record(sim, '暗殺', a, t, { royal });
    const pos = { ...t.pos };
    t.uwKilledBy = a.id;
    if (royal) a.uwKilledRoyal = true;
    sim.die(t, 'murder', null);
    sim.news(`${sim.fullName(t)}が何者かに暗殺された`, royal ? 3 : 2, pos);
    sim.chron(`${sim.fullName(t)}が暗殺された${seen ? `。${sim.fullName(a)}が手配された` : '（犯人不明）'}`, sim.townOf(a).kingdom);
    sim.remember(a, `請け負った仕事を果たした`, { emo: 0, imp: 0.7, k: 'uwcrime' });
    if (seen) wanted(sim, a, '暗殺');
  } else {
    record(sim, '暗殺未遂', a, t, { royal });
    sim.remember(t, '何者かに命を狙われたが、危うく難を逃れた', { emo: -0.9, imp: 0.95, k: 'crime' });
    sim.pushLog(`${sim.fullName(t)}が何者かに命を狙われたが、難を逃れた。`, 'event', [t.id], t.pos);
    if (seen) { wanted(sim, a, '暗殺未遂'); if (guards[0]) startFight(sim, guards[0], a); }
  }
  // 依頼人が割れる
  if (alive(cl) && cl.jail == null && R.chance(seen ? 0.5 : 0.15)) {
    wanted(sim, cl, '暗殺の依頼');
    sim.news(`${sim.fullName(t)}を狙った暗殺の依頼人は${sim.fullName(cl)}だったと判明した`, 2, cl.pos);
  }
}

// ================= 墓荒らし・密猟（行動として出かける） =================
function graveRob(sim, p) {
  const S = sim.S, R = sim.rng;
  p.uwLastJob = sim.today;
  const graves = S.graves.map((id) => S.people[id]).filter((d) => d && d.s === p.s && d.id !== p.id);
  const d = graves.length ? R.pick(graves.slice(-30)) : null;
  const tw = S.towns[p.s];
  const loot = Math.max(0, Math.min(R.int(8, 30), tw?.alms || 0));
  if (loot > 0) { tw.alms -= loot; earn(sim, p, loot, 0.7); }   // 墓前の供え物と献金箱から盗む
  record(sim, '墓荒らし', p, d, { amt: loot });
  sim.remember(p, `夜の墓地で${d ? `${d.given}の` : ''}墓を暴き、副葬品を盗んだ`, { emo: 0.1, imp: 0.6, k: 'uwcrime' });
  const wit = sim.living().filter((q) => q !== p && q.action?.type !== 'sleep' && dist(q, p) < 6 && (q.inside == null || q.inside === p.inside));
  const keeper = wit.find((q) => ['gravedigger', 'priest', 'nun', 'watchman', 'guard'].includes(q.job));
  if (keeper || (wit.length && R.chance(0.5))) {
    const w = keeper || wit[0];
    wanted(sim, p, '墓荒らし');
    sim.remember(w, `${p.given}が夜の墓地で墓を荒らしているのを見た`, { emo: -0.8, imp: 0.8, about: [p.id], k: 'crime' });
    sim.pushLog(`${sim.fullName(p)}が墓を荒らしているところを${w.given}に見られた。`, 'event', [p.id, w.id], p.pos);
    if (LAWFUL.has(w.job)) startFight(sim, w, p);
  } else if (d && R.chance(0.5)) {
    for (const q of sim.living()) if (q.s === p.s && sim.kinTerm(q, d)) sim.remember(q, `${d.given}の墓が何者かに荒らされていた`, { emo: -0.8, imp: 0.7, about: [d.id], k: 'crime' });
    sim.pushLog(`${sim.townOf(p).name}の墓地で、${sim.fullName(d)}の墓が荒らされていた。`, 'event', [], p.pos);
  }
}
function poach(sim, p) {
  const R = sim.rng;
  p.uwLastJob = sim.today;
  const gain = R.int(8, 20);
  stash(sim, p, 'meat', 2);   // 鹿の肉は蔵へ（市場で売ったときにお金）
  record(sim, '密猟', p, null, { amt: gain });
  sim.remember(p, '王家の森で鹿を仕留め、こっそり肉を売りさばいた', { emo: 0.3, imp: 0.4, k: 'uwcrime' });
  const wit = sim.living().filter((q) => q !== p && LAWFUL.has(q.job) && dist(q, p) < 10 && q.action?.type !== 'sleep');
  if (wit.length || R.chance(0.08 * (sim.S.uw.rate || 1))) {
    wanted(sim, p, '密猟');
    sim.pushLog(`${sim.fullName(p)}が王家の森で密猟しているのが見つかった。`, 'event', [p.id], p.pos);
  }
}

// ================= 盗賊ギルド =================
function guildDaily(sim) {
  const S = sim.S, R = sim.rng, uw = S.uw, rate = (uw.rate || 1) * lawCrimeMul(sim);
  if (sim.today % 5 === 0) refreshGuilds(sim);
  for (const [sid, g] of Object.entries(uw.guilds)) {
    const boss = S.people[g.boss];
    if (!free(boss)) continue;
    // 上納金（7日ごと）
    if (sim.today % 7 === 3) {
      let total = 0;
      for (const id of g.members) {
        const q = S.people[id];
        if (!free(q) || q === boss) continue;
        const d = Math.round(Math.min(Math.max(0, spendable(sim, q)) * 0.1, 15));
        if (d <= 0) continue;
        pay(sim, q, d); total += d;
        if (R.chance(0.3)) sim.remember(q, `「${g.name}」の頭目${boss.given}に上納金${d}銅貨を納めた`, { emo: -0.2, imp: 0.3, about: [boss.id], k: 'uwcrime' });
      }
      if (total) { earn(sim, boss, total, 0.3); g.dues += total; record(sim, '上納金', boss, null, { amt: total }); }
    }
    // 縄張り：よそ者の悪党を締め出す
    const outsiders = sim.living().filter((q) => g.turf.includes(q.s) && free(q) && CROOK_JOBS.has(q.job) && !q.bandit && !g.members.includes(q.id) && sim.ageOf(q) >= 18);
    if (outsiders.length && R.chance(0.2)) {
      const o = R.pick(outsiders);
      if (g.members.length < 9 && R.chance(0.6)) { g.members.push(o.id); sim.remember(o, `「${g.name}」に縄張りを荒らすなと脅され、仲間に加わった`, { emo: -0.3, imp: 0.6, about: [boss.id], k: 'uwcrime' }); }
      else { o.hp = Math.max(1, o.hp - 15); sim.remember(o, `「${g.name}」の者に、縄張りを荒らすなと痛めつけられた`, { emo: -0.8, imp: 0.7, about: [boss.id], k: 'fight' }); record(sim, '縄張り争い', boss, o); }
    }
    // 誘い込み：暮らしに困った若者がスリの道に入る
    if (g.members.length < 7 && R.chance(0.03 * rate)) {
      const y = sim.living().find((q) => g.turf.includes(q.s) && free(q) && sim.ageOf(q) >= 18 && sim.ageOf(q) <= 30 && q.pers.A < 0.4 && sim.householdMoney(q) < 25 && !CROOK_JOBS.has(q.job) && !LAWFUL.has(q.job) && !ELITE.has(q.rank) && !q.uwRole && !JOBS[q.job]?.combat);
      if (y) {
        y.formerJob = y.job; y.job = 'pickpocket'; y.rank = 'citizen';
        g.members.push(y.id);
        sim.remember(y, `暮らしに困り、「${g.name}」に誘われてスリの道に入った`, { emo: -0.3, imp: 0.9, about: [boss.id], k: 'uwcrime' });
        record(sim, 'ギルドへの誘い込み', boss, y);
      }
    }
    // 衛兵の手入れ（ごく稀）
    const heat = g.members.filter((id) => S.wanted[id]).length;
    if (R.chance((0.003 + heat * 0.003) * rate) && !S.wanted[boss.id]) {
      wanted(sim, boss, '盗賊ギルドの頭目');
      sim.news(`${sim.town(+sid).name}の衛兵が裏社会「${g.name}」に手入れ。頭目の${sim.fullName(boss)}が手配された`, 2, boss.pos);
    }
  }
}

// ================= 住人の行動（sim.decide から） =================
// decide の cands.sort の直前に：underworldDecide(this, p, cands, add);
export function underworldDecide(sim, p, cands, add) {
  const S = sim.S, uw = U(sim), h = sim.hour(), R = sim.rng;
  if (p.jail != null || p.uwCaptive) return;
  const age = sim.ageOf(p);
  const night = h >= 19 || h < 5;
  // 町に広がる恐怖：日が暮れたら外に出ない
  const fear = uw.fear[p.s] || 0;
  if (fear > 0 && night) for (const c of cands) {
    if (['tavern', 'stroll', 'plaza', 'visit', 'court', 'play'].includes(c.type)) c.score -= fear * 3;
    else if (c.type === 'rest' || c.type === 'home') c.score += fear;
  }
  // 心の傷：外出を避け、家で過ごし、祈る
  if (p.uwTrauma) {
    const lv = p.uwTrauma.lv;
    for (const c of cands) {
      if (['tavern', 'stroll', 'plaza', 'court', 'festival', 'visit', 'work', 'trade', 'travel'].includes(c.type)) c.score -= lv / (c.type === 'work' ? 40 : 22);
      else if (c.type === 'rest' || c.type === 'home') c.score += lv / 35;
      else if (c.type === 'pray') c.score += lv / 50;
    }
  }
  // 禁断症状：仕事に身が入らない
  if (p.uwWithdraw) for (const c of cands) if (c.type === 'work' || c.type === 'train' || c.type === 'school') c.score -= p.uwWithdraw / 25;
  if (age < 18) return;
  const m = mature(sim);
  // 薬が欲しい
  if (m && (p.addiction || 0) >= 10 && p.uwLastUse !== sim.today && !(p.uwRehab && R.chance(0.8))) {
    const dealer = sim.living().find((q) => q.uwRole === 'dealer' && q.s === p.s && free(q));
    const price = DRUGS[p.uwDrug || 'dream'].price;
    if (dealer && h >= 18 && h < 23.5 && spendable(sim, p) >= price) add(3 + p.addiction / 18, 'uw_buy', sim.placeFor(p, 'tavern'), 40, { friend: dealer.id });
    else if (spendable(sim, p) < price && (h >= 22 || h < 4) && p.pers.A < 0.6) {
      const s = sim.townOf(p);
      const tg = s.buildings.map((id) => sim.building(id)).filter((b) => (b.type === 'house' || b.type === 'market') && b.hh !== p.hh && (b.type === 'market' || (S.households[b.hh]?.money || 0) > 30));
      if (tg.length) { const b = R.pick(tg); add(2 + p.addiction / 25 + (1 - p.pers.A) * 2, 'steal', { x: b.door.x, z: b.door.z }, 15, { crimeTarget: b.id }); }
    }
  }
  // 裏稼業
  switch (p.uwRole) {
    case 'dealer': if (m && h >= 18 && h < 23.5 && !S.wanted[p.id]) add(6, 'uw_deal', sim.placeFor(p, 'tavern'), 120); break;
    case 'grower': if (m && h >= 5 && h < 9 && p.uwGrewToday !== sim.today) add(5, 'uw_grow', sim.placeFor(p, 'forest'), 90); break;
    case 'graverobber': if ((h >= 0.5 && h < 3.5) && sim.today - (p.uwLastJob ?? -99) >= 5 && !S.wanted[p.id]) add(12, 'uw_graverob', sim.placeFor(p, 'church'), 20); break;
    case 'poacher': if (h >= 5 && h < 8 && sim.today - (p.uwLastJob ?? -99) >= 3 && !S.wanted[p.id]) { const pl = royalForest(sim, p); if (pl) add(6, 'uw_poach', pl, 60); } break;
  }
  // つきまとい
  if (m && p.uwStalk && h >= 17 && h < 22) {
    const v = S.people[p.uwStalk.who];
    if (adult(sim, v) && v.s === p.s) add(3 + p.uwStalk.lv, 'uw_stalk', sim.placeFor(v, 'home'), 40, { friend: v.id });
  }
  // 立ち直り：教会に通う
  if (p.uwRehab && h >= 8 && h < 18) add(3.5, 'pray', sim.placeFor(p, 'church'), 50);
}
function royalForest(sim, p) {
  const cap = sim.capitalOf(p);
  if (!cap) return null;
  return sim.randomNear(cap.x, cap.z, cap.r + 12, (t, x, z) => (t === T.FOREST || t === T.DENSE) && Math.hypot(x - cap.x, z - cap.z) > cap.r + 2);
}

// 行動の場所に着いたとき（sim.arrive の switch で呼ぶ。処理したら true）
export function underworldArrive(sim, p) {
  const a = p.action;
  if (!a) return false;
  switch (a.type) {
    case 'uw_deal': return true;
    case 'uw_grow': p.uwGrewToday = sim.today; return true;
    case 'uw_buy': {
      const d = sim.S.people[a.friend];
      if (d && free(d) && d.uwRole === 'dealer' && (d.inside === p.inside || dist(d, p) < 5) && mature(sim)) sellDrug(sim, d, p);
      a.until = sim.S.t + 20;
      return true;
    }
    case 'uw_graverob': graveRob(sim, p); a.until = sim.S.t + 10; return true;
    case 'uw_poach': poach(sim, p); return true;
    case 'uw_stalk': {
      const v = sim.S.people[a.friend];
      if (mature(sim) && p.uwStalk && adult(sim, v) && adult(sim, p) && (v.inside === p.inside || dist(v, p) < 8 || v.inside === sim.homeOf(v)?.id)) {
        if (sim.rng.chance(0.3)) sim.remember(v, `また${p.given}が家の近くをうろついていた`, { emo: -0.6, imp: 0.5, about: [p.id], k: 'stalk' });
        const fam = (sim.hh(v)?.members || []).map((id) => sim.S.people[id]).find((q) => q && q !== v && sim.ageOf(q) >= 18 && q.values.courage > 0.6 && q.inside === v.inside);
        if (fam && sim.rng.chance(0.2)) { sim.remember(p, `${v.given}の家族の${fam.given}に追い払われた`, { emo: -0.5, imp: 0.5, about: [fam.id] }); sim.remember(fam, `${v.given}に付きまとう${p.given}を追い払った`, { emo: 0.2, imp: 0.6, about: [p.id, v.id] }); }
      }
      if (p.inside) { p.inside = null; }
      a.until = sim.S.t + 20;
      return true;
    }
    case 'uw_hunt': assassinStrike(sim, p); return true;
    case 'captive': return true;
  }
  return false;
}

// 仕事の効率（禁断症状・心の傷）。doWork の eff に掛ける
export function underworldWorkMul(p) {
  let m = 1;
  if (p.uwWithdraw) m *= 1 - p.uwWithdraw / 180;
  if (p.uwTrauma) m *= 1 - p.uwTrauma.lv / 300;
  return Math.max(0.4, m);
}

// ---------- 画面と会話向け ----------
export const UW_ACTION_LABEL = { uw_deal: '酒場の隅で誰かを待っている', uw_grow: '森の奥で畑仕事をしている', uw_buy: '酒場で誰かを探している', uw_graverob: '夜の墓地にいる', uw_poach: '森で獲物を追っている', uw_stalk: 'ある家の前にたたずんでいる', uw_hunt: '誰かを探している', captive: '盗賊のアジトに閉じ込められている' };
export const UW_ACTION_GO = { uw_deal: '酒場へ向かっている', uw_grow: '森へ向かっている', uw_buy: '酒場へ向かっている', uw_graverob: '夜道を歩いている', uw_poach: '森へ向かっている', uw_stalk: '誰かの家へ向かっている', uw_hunt: '遠くの町へ向かっている', captive: '盗賊に連れて行かれている' };

// 詳細欄の短い説明（見えてよいものだけ）
export function underworldLabel(sim, p) {
  const out = [];
  if (p.addiction >= 40) out.push(p.uwRehab ? '薬を断とうとしている' : '薬に溺れている');
  else if (p.uwRehab) out.push('薬を断とうとしている');
  if (p.uwTrauma && p.uwTrauma.lv > 20) out.push('心に深い傷を負っている');
  if (p.uwCaptive) out.push('盗賊にさらわれている');
  const K = sim.S.uw?.killer;
  if (K && K.identified && K.id === p.id) out.push(`「${K.name}」事件の犯人`);
  return out;
}

// 心の声（speech.js の innerThought に足す）
export function underworldThoughts(sim, p) {
  const out = [];
  const uw = sim.S.uw;
  if (!uw) return out;
  if (p.uwWithdraw > 30) out.push('薬……少しだけでいいから……。', '手の震えが止まらない。');
  if (p.uwRehab) out.push('今日も一日、薬に手を出さずにいられた。');
  if (p.uwTrauma && p.uwTrauma.lv > 30) out.push('家から出るのが怖い。', '誰にも会いたくない……。');
  if (uw.fear[p.s] > 0.3 && (sim.hour() >= 18 || sim.hour() < 5)) out.push('暗くなる前に家へ帰らないと。', '夜道のあの事件、まだ犯人は捕まっていないらしい。');
  if (p.uwCaptive) out.push('家族は、身代金を払ってくれるだろうか……。');
  if (p.uwCorrupt && p.uwBribes) out.push('少しくらい目をつぶっても、誰も困りはしない。');
  return out;
}

// 会話の話題（speech.js の topics() で：const ut = underworldTopic(api, A, B); if (ut) add(ut.w, ut.fn);）
export function underworldTopic(api, A, B) {
  const uw = api.S.uw;
  if (!uw) return null;
  if ((uw.fear[A.s] || 0) > 0.2) return { w: 2 + uw.fear[A.s] * 2, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s(api2.rng.pick(['夜道の殺人、犯人はまだ見つかっていない', '暗くなったら、もう外には出ないことにしている', '衛兵が夜の見回りを増やしたらしい']), 'v'), sentiment: -0.6 }) };
  if (A.uwWithdraw > 30 && (A.rel?.[B.id]?.a || 0) > 20) return { w: 1.2, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s('……少しでいい、銅貨を貸してくれないか', 'n'), sentiment: -0.5 }) };
  if (A.uwRehab && (A.rel?.[B.id]?.f || 0) > 40) return { w: 0.8, fn: (api2, A2, B2, v) => ({ kind: 'good', text: v.s('教会に通うようになって、少しずつ楽になってきた', 'v'), sentiment: 0.4 }) };
  if (Object.values(uw.fake || {}).some((x) => x > 1) && ['merchant', 'baker', 'innkeeper', 'changer'].includes(A.job)) return { w: 0.8, fn: (api2, A2, B2, v) => ({ kind: 'complain', text: v.s('近ごろ、偽の銅貨が出回っている', 'v'), sentiment: -0.4 }) };
  return null;
}

// 裏社会のまとめ（国々のタブなどで使える）
export function underworldSummary(sim) {
  const S = sim.S, uw = U(sim);
  const L = sim.living();
  return {
    addicts: L.filter((p) => p.addiction >= 30).length,
    recovering: L.filter((p) => p.uwRehab).length,
    roles: L.filter((p) => p.uwRole).reduce((o, p) => ((o[p.uwRole] = (o[p.uwRole] || 0) + 1), o), {}),
    guilds: Object.values(uw.guilds).map((g) => ({ name: g.name, boss: S.people[g.boss] ? sim.fullName(S.people[g.boss]) : null, members: g.members.length, dues: Math.round(g.dues) })),
    killer: uw.killer ? { name: uw.killer.name, victims: uw.killer.victims.length, identified: uw.killer.identified } : null,
    stats: { ...uw.stats }, arrests: { ...uw.arrests },
  };
}
