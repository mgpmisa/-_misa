// 湧き口（モンスタースポナー）とモンスター脅威度
//
// ダンジョン（洞窟・遺跡・ピラミッド・魔王城・未開の地の巣窟）の奥には「湧き口」がある。
// 湧き口は一定の間隔で魔物を生み、生まれた魔物はダンジョンの中と周りに住む。
// 放っておくと湧き口は育ち、周りの魔物が増えて「モンスター脅威度」が上がる。脅威度の段階は次のとおり。
//   0 平穏
//   1 魔物が街道筋までうろつき、旅人を襲う
//   2 群れになって近くの村の畑や家畜を荒らす
//   3 大群になって近くの村・町・城を攻める（群れがあれば monsters.js の大群の話し合いへ、なければここで大群を出す）
// 大群が来たら、今の仕組み（警鐘・衛兵・騎士・援軍：danger.js と politics.js）が迎え撃つ。ここでは冒険者の出陣を足す。
// 脅威度に応じて、王・町の人がギルドに討伐と「湧き口を封じる」依頼を出す。報酬は依頼主の家計か国庫・町の蓄えから、
// 冒険者がギルドに報告したときに guild.js の reportQuest が払う（ここではお金を動かさない）。
// 冒険者が湧き口を封じると、しばらく魔物が湧かなくなる。年月がたつとまた息を吹き返す。
// 湧き口がすべて封じられ、巣に魔物がいなくなれば、今の「巣を封じる」（b.sealed。expansion.js の reinfest で戻る）とつなぐ。
// ダンジョンの宝箱は今までどおり無限に戻る（sim.js の doQuest）。
//
// ■ 本体から呼ぶ関数
//   ensureSpawner(sim)                … newWorld と load の最後（遅延初期化なので呼ばなくても動く）
//   spawnerHourly(sim)                … newHourRest の monstersHourly(this) のあと
//   spawnerDanger(sim)                … newHourRest の computeDanger(this) のすぐあと（危険区域の地図に脅威を足す）
//   spawnerDaily(sim)                 … newDay の monstersDaily(this) の前（群れの大群の話し合いに間に合わせる）
//   spawnerExplored(sim, p, b, q)     … doQuest でダンジョン探索に勝ったとき
//   spawnerNationHTML(sim, k, esc)    … 国々の欄（国ごと）：魔物の脅威
//   spawnerWorldHTML(sim, esc)        … 国々の欄の下：湧き口と脅威の一覧
//   spawnerBuildingHTML(sim, b, esc)  … ダンジョンの詳細欄
//   threatOfKingdom(sim, kid)         … { value, stage, site } その国にいちばん迫っている脅威
//   spawnerReport(sim)                … 試験用の集計
//
// ■ 状態：S.spawner = { v, sites:{bid:site}, list:{spid:spawner}, seq, hordes:[], log:[], stats, base, pop0, lastHorde }
//   生き物に足す印：c.spawner（生まれた湧き口id）、c.spawnSite（ダンジョンの建物id）、c.prowl（うろつき・荒らし・大群の途中の記録）
//
// ■ お金：この仕組みはお金を動かさない。冒険者を志す人の持ち金だけは、実家の家計 → 新しい宿住まいの家計へ移す（どちらも帳簿の家計）。
import { SPECIES, JOBS } from './data.js';
import { makeCreature, killCreature, townMask } from './creatures.js';
import { T, W, walkable, tileAt } from './world.js';
import { CH, CW, CHH } from './danger.js';
import { isAdventurer, partyOf } from './guild.js';
import { advClassName } from './advclass.js';

// ---------- 湧き口の型 ----------
// every：何時間ごとに生むか（力が弱ると間があく）、cap：同時に生きていられる子の数、lv：生まれる魔物の強さ
const LEVELS = {
  cave: [
    { depth: 1, sp: ['goblin', 'goblin', 'spider'], every: 22, cap: 2, lv: [1, 2] },
    { depth: 2, sp: ['skeleton', 'spider', 'goblin'], every: 40, cap: 2, lv: [2, 3] },
    { depth: 3, sp: ['skeleton', 'orc'], every: 70, cap: 1, lv: [3, 5] },
  ],
  dragon: [
    { depth: 1, sp: ['spider', 'skeleton'], every: 26, cap: 2, lv: [2, 3] },
    { depth: 2, sp: ['wyvern'], every: 140, cap: 1, lv: [1, 2] },
  ],
  pyramid: [
    { depth: 1, sp: ['mummy', 'scorpion', 'mummy'], every: 26, cap: 2, lv: [1, 2] },
    { depth: 2, sp: ['mummy'], every: 56, cap: 1, lv: [3, 4] },
  ],
  ruins: [
    { depth: 1, sp: ['slime', 'goblin', 'slime'], every: 26, cap: 2, lv: [1, 2] },
    { depth: 2, sp: ['skeleton', 'golem'], every: 56, cap: 1, lv: [2, 3] },
  ],
  demoncastle: [
    { depth: 1, sp: ['imp'], every: 26, cap: 2, lv: [1, 2] },
    { depth: 2, sp: ['imp', 'demonsoldier'], every: 60, cap: 1, lv: [1, 2] },
  ],
};
// 国の中（開拓済み）のダンジョンは浅い層まで。未開の地の巣窟は深い層まであり、少し強い
const DEPTH_KINGDOM = { cave: 2, dragon: 1, pyramid: 2, ruins: 1, demoncastle: 2 };
const DEPTH_NAME = ['', '浅い層の湧き口', '中ほどの湧き口', '最奥の湧き口'];
const TYPES = new Set(['cave', 'pyramid', 'ruins', 'demoncastle']);
const STAGE_AT = [0, 30, 55, 80];     // 段階の境目（脅威度）
const STAGE_NAME = ['平穏', '魔物がうろつく', '群れが畑や家畜を荒らす', '大群が攻めてくる'];
const NEAR = 22;                      // ダンジョンのまわり（マス）
const REACH = 85;                     // この距離より遠い町は、そのダンジョンの魔物に襲われない
const GROW_MAX = 1;                   // 湧き口が育つ上限（同時に生きていられる子が最大で2倍）
const MAX_HORDE = 10;
const FARM = new Set(['cow', 'sheep', 'pig', 'chicken', 'goat', 'duck', 'donkey']);   // 荒らされる家畜（犬・猫・馬は外す）

const alive = (S, c) => !!c && c.hp > 0 && S.creatures[c.id] === c;
const pw = (c) => (c.atk || 5) * Math.sqrt(c.maxhp || 20) / 10 * (c.named ? 0.35 : 1);
const hostileKind = (c) => { const k = SPECIES[c.sp]?.kind; return k === 'hostile' || k === 'demon'; };
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const rankFor = (power) => Math.max(0, Math.min(6, Math.floor(power / 9)));

// ---------- 初期化（遅延） ----------
export function ensureSpawner(sim) {
  const S = sim.S;
  if (!S.spawner) S.spawner = { v: 1, sites: {}, list: {}, seq: 1, hordes: [], log: [], lastHorde: -99, stats: {} };
  const P = S.spawner;
  P.sites = P.sites || {}; P.list = P.list || {}; P.hordes = P.hordes || []; P.log = P.log || []; P.stats = P.stats || {};
  if (P.base == null) {
    const n = Object.values(S.creatures).filter((c) => c.hp > 0 && hostileKind(c)).length;
    if (n > 0) { P.base = n; P.pop0 = sim.living().length; }   // 生き物がまだいない（世界を作っている途中）なら、あとで数える
  }
  const w = S.world;
  for (const id of w.specials || []) {
    if (P.sites[id]) continue;
    const b = w.buildings[id];
    if (!b || !TYPES.has(b.type) || b.legend || b.tribe) continue;
    addSite(sim, b);
  }
  return P;
}

function addSite(sim, b) {
  const S = sim.S, P = S.spawner, R = sim.rng;
  const kind = b.dragon || b.name === '竜の巣穴' ? 'dragon' : b.type;
  const levels = LEVELS[kind];
  const wild = !!b.wild;
  const depth = wild ? levels.length : Math.min(levels.length, DEPTH_KINGDOM[kind]);
  const site = { bid: b.id, name: b.name, kind, wild, depth, threat: 0, stage: 0, hist: [], lastHorde: -99, lastRavage: -99, lastProwl: -99, lastQuest: -99, spawners: [], sealed: !!b.sealed };
  for (let i = 0; i < depth; i++) {
    const L = levels[i];
    const id = 'sp' + P.seq++;
    P.list[id] = {
      id, bld: b.id, depth: L.depth, name: DEPTH_NAME[L.depth], sp: L.sp.slice(), every: L.every, cap: L.cap,
      lv: [L.lv[0] + (wild ? 1 : 0), L.lv[1] + (wild ? 1 : 0)], power: 1, grow: 0, born: 0, alive: 0, prev: 0,
      next: S.t + R.range(0.2, 1) * L.every * 60, sealedUntil: null, sealedBy: null,
    };
    site.spawners.push(id);
  }
  P.sites[b.id] = site;
}

function stat(sim, k, n = 1) { const st = sim.S.spawner.stats; st[k] = (st[k] || 0) + n; }
function note(sim, text) {
  const P = sim.S.spawner;
  P.log.unshift({ d: sim.today, text });
  if (P.log.length > 14) P.log.length = 14;
}
const isSealed = (sim, sp) => (sp.sealedUntil != null && sim.today < sp.sealedUntil) || !!sim.building(sp.bld)?.sealed;
const siteCap = (sim, site) => site.spawners.reduce((a, id) => a + capOf(sim.S.spawner.list[id]), 0);
const capOf = (sp) => Math.max(1, Math.round(sp.cap * (1 + Math.min(GROW_MAX, sp.grow)) * Math.max(0.34, sp.power)));

// ---------- 町の見つけ方 ----------
function townsNear(sim, x, z, max = REACH) {
  const S = sim.S;
  return S.world.settlements
    .filter((s) => S.towns[s.id] && !S.towns[s.id].occupied && !s.tribal && dist(s.x, s.z, x, z) <= max)
    .sort((a, b) => dist(a.x, a.z, x, z) - dist(b.x, b.z, x, z));
}
// 依頼を貼り出すギルド：その国の王都。国の外のダンジョンは、いちばん近い王都
function guildCap(sim, b) {
  const caps = sim.S.world.settlements.filter((s) => s.type === 'capital' && !sim.S.towns[s.id].occupied);
  if (!caps.length) return null;
  const own = caps.find((s) => s.kingdom === b.kingdom);
  if (own) return own;
  const near = townsNear(sim, b.door.x, b.door.z, 9999).find((s) => !(s.indep && s.annexed == null));
  const k = near ? near.kingdom : null;
  return caps.find((s) => s.kingdom === k) || caps.slice().sort((a, c) => dist(a.x, a.z, b.door.x, b.door.z) - dist(c.x, c.z, b.door.x, b.door.z))[0];
}
// 町の外で、町とダンジョンを結ぶ線の上の立てる場所
function pointToward(sim, from, s, rd) {
  const a = Math.atan2(from.z - s.z, from.x - s.x);
  const x = Math.round(s.x + Math.cos(a) * rd), z = Math.round(s.z + Math.sin(a) * rd);
  const mask = townMask(sim);
  for (let r = 2; r <= 8; r += 2) {
    const p = sim.randomNear(x, z, r, (t) => walkable(t) && t !== T.BLD && t !== T.RIVER);
    if (p && !mask[Math.round(p.z) * W + Math.round(p.x)]) return { x: Math.round(p.x), z: Math.round(p.z) };
  }
  return null;
}

// ---------- 魔物を生む ----------
function spawnOne(sim, sp, b) {
  const R = sim.rng;
  const kind = R.pick(sp.sp);
  if (!SPECIES[kind]) return null;
  const p = sim.randomNear(b.door.x, b.door.z, 4, (t) => walkable(t) && t !== T.BLD && t !== T.RIVER);
  if (!p) return null;
  const deep = sp.depth >= 2 && b.type !== 'demoncastle';
  const extra = { lair: b.id, hx: b.door.x, hz: b.door.z, range: 7, lv: R.int(sp.lv[0], sp.lv[1]), age: 30 };
  if (deep) extra.role = 'guardian';   // 深い層で生まれた者は、ダンジョンの奥を守る（中にいる）
  const c = makeCreature(sim, kind, p.x, p.z, extra);
  if (!c || c.hp <= 0) return null;
  c.spawner = sp.id; c.spawnSite = b.id; c.spawnDay = sim.today;
  sp.born++;
  stat(sim, 'born'); stat(sim, 'born_' + kind);
  return c;
}

// ---------- 毎時 ----------
export function spawnerHourly(sim) {
  const S = sim.S, R = sim.rng;
  const P = ensureSpawner(sim);
  // 湧き口ごとの生きている子と、うろつき・荒らしの見回り
  const count = {}, siteN = {};
  let hostileN = 0;
  for (const c of Object.values(S.creatures)) {
    if (c.hp <= 0) continue;
    if (hostileKind(c)) hostileN++;
    if (c.spawner) count[c.spawner] = (count[c.spawner] || 0) + 1;
    const home = c.spawnSite ?? c.lair;
    if (home != null && hostileKind(c) && !c.dormant) siteN[home] = (siteN[home] || 0) + 1;
    if (c.prowl) prowlStep(sim, c);
  }
  // 世界が魔物であふれそうなとき・人が大きく減ったときは、湧き口は静まる（安全弁）
  const crowded = hostileN > (P.base || 100) * 1.6;
  const hurt = sim.living().length < (P.pop0 || 1) * 0.85;
  for (const sp of Object.values(P.list)) {
    sp.alive = count[sp.id] || 0;
    const b = sim.building(sp.bld);
    if (!b || isSealed(sim, sp)) continue;
    if (S.t < sp.next) continue;
    let slow = 1 / Math.max(0.25, sp.power);
    if (b.type === 'demoncastle' && !S.demon?.active) slow *= 2;   // 魔王が眠っているあいだは魔王城の湧き口も弱い
    if (hurt) slow *= 3;
    sp.next = S.t + sp.every * 60 * slow * R.range(0.8, 1.2);
    if (crowded) { stat(sim, 'pausedCrowded'); continue; }
    if (sp.alive >= capOf(sp)) continue;
    // ダンジョン全体の住人（もとから棲む魔物も含む）が多すぎるときも生まない
    const site = P.sites[sp.bld];
    if (site && (siteN[sp.bld] || 0) >= siteCap(sim, site) + 2) continue;
    if (spawnOne(sim, sp, b)) { sp.alive++; siteN[sp.bld] = (siteN[sp.bld] || 0) + 1; }
  }
  for (const h of P.hordes.slice()) hordeStep(sim, h);
  departures(sim);
}

// うろつき・荒らし・大群の集結：住処を一時的に移し、終わったら戻す
function prowlStep(sim, c) {
  const S = sim.S, pr = c.prowl;
  if (pr.kind === 'horde') return;   // 大群は hordeStep が面倒を見る
  if (S.t > pr.until) { endProwl(sim, c); return; }
  if (pr.kind !== 'ravage' || pr.done) return;
  const s = sim.town(pr.sid);
  if (!s || dist(c.pos.x, c.pos.z, s.x, s.z) > s.r + 9) return;
  // 町はずれに着いた：畑を踏み荒らし、家畜を襲う（群れで1回）
  const grp = Object.values(S.creatures).filter((o) => o.prowl?.gid === pr.gid);
  for (const o of grp) o.prowl.done = true;
  ravage(sim, c, s, grp.length);
}
function endProwl(sim, c) {
  const pr = c.prowl;
  c.prowl = null;
  if (!pr) return;
  c.home = pr.home0 || c.home; c.range = pr.range0 ?? c.range; c.lair = pr.lair0 ?? c.lair;
  if (c.role === 'scout' && pr.role0 && pr.role0 !== 'leader') c.role = pr.role0;
  c.goal = { x: c.home.x, z: c.home.z, path: true }; c.path = null;
}
function startProwl(sim, c, kind, home, until, extra = {}) {
  if (c.inDungeon) { c.inDungeon = false; c.resting = false; const b = c.lair != null ? sim.building(c.lair) : null; if (b) c.pos = { x: b.door.x, z: b.door.z }; }
  c.prowl = { kind, until, home0: { ...c.home }, range0: c.range, role0: c.role, lair0: c.lair, ...extra };
  c.home = { x: home.x, z: home.z }; c.range = kind === 'horde' ? 3 : 5; c.role = 'scout'; c.lair = null;
  c.goal = { x: home.x, z: home.z, path: true, run: kind !== 'prowl' }; c.path = null;
}

function ravage(sim, c, s, n) {
  const S = sim.S, R = sim.rng, town = S.towns[s.id];
  const bits = [];
  // 家畜（その町の飼い主のいる動物）を1頭襲う
  const stock = Object.values(S.creatures).filter((o) => o.hp > 0 && o.owner === s.id && FARM.has(o.sp));
  if (stock.length && R.chance(0.6)) {
    const v = R.pick(stock);
    bits.push(`${v.name}が襲われた`);
    killCreature(sim, v, c);
    stat(sim, 'livestockLost');
  }
  // 畑を踏み荒らす：町の蔵の麦が少し減る（品物が減るだけで、お金は動かない）
  if (town.stock && (town.stock.wheat || 0) > 0) {
    const x = Math.min(town.stock.wheat, 2 + n * 2);
    town.stock.wheat -= x;
    bits.push('畑が踏み荒らされた');
  }
  const site = S.spawner.sites[c.prowl?.site ?? c.spawnSite];
  const from = site ? site.name : sim.placeName(c.pos.x, c.pos.z);
  const text = `${from}から来た${c.name}たちの群れが${s.name}の町はずれを荒らした${bits.length ? `（${bits.join('・')}）` : ''}`;
  sim.news(text, 2, s);
  note(sim, text);
  stat(sim, 'ravages');
  town.ravagedAt = S.t;
  const farmers = sim.living().filter((q) => q.s === s.id && ['farmer', 'herder', 'rancher', 'shepherd'].includes(q.job));
  for (const q of farmers.slice(0, 6)) sim.remember(q, `${c.name}の群れに畑と家畜を荒らされた。ギルドに退治を頼みたい`, { emo: -0.7, imp: 0.65, k: 'monster' });
}

// ---------- 大群 ----------
function hordeStep(sim, h) {
  const S = sim.S, P = S.spawner, R = sim.rng;
  const s = sim.town(h.target), tw = S.towns[h.target];
  const members = h.ids.map((id) => S.creatures[id]).filter((c) => alive(S, c));
  if (h.stage === 'gather') {
    if (!members.length || !tw || tw.occupied) return endHorde(sim, h, 'cancel', members);
    const nightOk = !h.night || (sim.hour() >= 21 || sim.hour() < 4);
    if (S.t < h.launchT || !nightOk) return;
    h.stage = 'march'; h.marchT = S.t; h.start = members.length;
    h.pop0 = sim.living().filter((p) => p.s === s.id).length;
    const until = S.t + 60 * 10;
    for (const c of members) { c.raid = s.id; c.raidUntil = until; c.path = null; c.inDungeon = false; c.calm = null; }
    if (tw.threat && S.t < tw.threat.until) { tw.threat.by.push(...members.map((c) => c.id)); tw.threat.until = Math.max(tw.threat.until, S.t + 60 * 12); }
    else tw.threat = { until: S.t + 60 * 12, since: S.t, by: members.map((c) => c.id) };
    const kinds = [...new Set(members.map((c) => c.name))].slice(0, 3).join('・');
    const text = `${h.siteName}からあふれ出た魔物の大群（${kinds}など${members.length}体）が${h.night ? '夜陰に乗じて' : ''}${s.name}に迫っている！`;
    sim.news(text, 3, s);
    note(sim, text);
    sim.chron(`${h.siteName}の魔物があふれ、大群となって${s.name}に押し寄せた`, s.kingdom);
    for (const p of sim.living()) if (p.s === s.id && sim.isAdult(p) && R.chance(0.5)) sim.remember(p, `${h.siteName}からあふれた魔物の大群が町に迫ってきた`, { emo: -0.9, imp: 0.85, k: 'monster' });
    callAdventurers(sim, s, h);
    stat(sim, 'hordeMarch');
    return;
  }
  // 攻めている最中：全員が倒れるか引き上げるか、14時間たったら決着
  const busy = members.filter((c) => c.raid === s.id || c.fight);
  if (busy.length && S.t < h.marchT + 60 * 14) return;
  const lost = h.start - members.length;
  const killed = Math.max(0, h.pop0 - sim.living().filter((p) => p.s === s.id).length);
  const outcome = killed >= 2 && lost < h.start / 2 ? 'win' : lost >= h.start / 2 ? 'defeat' : 'draw';
  endHorde(sim, h, outcome, members, { lost, killed });
}
function endHorde(sim, h, outcome, members, r = {}) {
  const S = sim.S, P = S.spawner;
  P.hordes.splice(P.hordes.indexOf(h), 1);
  for (const c of members) { if (c.raid === h.target) c.raid = null; endProwl(sim, c); }
  if (outcome === 'cancel') { stat(sim, 'hordeCancel'); return; }
  const s = sim.town(h.target);
  const rec = { day: sim.today, site: h.siteName, town: s.name, size: h.start, outcome, lost: r.lost, killed: r.killed, adv: h.adv || 0 };
  P.hordeLog = P.hordeLog || []; P.hordeLog.unshift(rec); if (P.hordeLog.length > 20) P.hordeLog.length = 20;
  stat(sim, 'horde_' + outcome);
  let text;
  if (outcome === 'win') text = `${h.siteName}の大群は${s.name}を荒らして引き上げた（町の死者${r.killed}人・魔物${r.lost}体が倒れた）`;
  else if (outcome === 'defeat') text = `${s.name}は${h.siteName}の大群を退けた（魔物${r.lost}体を討ち取った${r.killed ? `・町の死者${r.killed}人` : ''}）`;
  else text = `${h.siteName}の大群は${s.name}の守りを破れず、散り散りに引き上げた（魔物${r.lost}体を討ち取った${r.killed ? `・町の死者${r.killed}人` : ''}）`;
  sim.news(text, 3, s);
  note(sim, text);
  if (outcome !== 'win') {
    sim.chron(`${s.name}の人々が${h.siteName}からあふれた魔物の大群を退けた`, s.kingdom);
    for (const id of h.advIds || []) { const p = S.people[id]; if (p && p.deathYear == null) { p.fame = (p.fame || 0) + 6; sim.remember(p, `${s.name}の守りに駆けつけ、魔物の大群を退けた`, { emo: 0.8, imp: 0.8, k: 'monster' }); } }
  }
}
// 大群が町に迫ったら、その国の王都の冒険者が守りに駆けつける（パーティーを先に）
function callAdventurers(sim, s, h) {
  const S = sim.S;
  const cap = S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === s.kingdom && !S.towns[q.id].occupied);
  if (!cap) return;
  const cands = sim.living().filter((p) => isAdventurer(p) && p.job !== 'guildmaster' && p.s === cap.id && p.jail == null && !p.fight && p.hp > p.maxhp * 0.5 && sim.ageOf(p) >= 16)
    .sort((a, b) => (partyOf(sim, b) ? 1 : 0) - (partyOf(sim, a) ? 1 : 0) || (b.lv || 1) - (a.lv || 1));
  const go = cands.slice(0, Math.min(8, 2 + Math.ceil(h.start / 2)));
  if (!go.length) return;
  for (const p of go) {
    if (p.quest) continue;   // 引き受けた依頼の途中の者は動かさない
    p.mission = { type: 'defend', x: s.x, z: s.z, until: S.t + 60 * 16 }; p.action = null;
    sim.remember(p, `${s.name}に魔物の大群が迫っていると聞き、守りに駆けつけた`, { emo: 0.2, imp: 0.7, k: 'monster' });
  }
  const sent = go.filter((p) => p.mission?.type === 'defend');
  h.adv = sent.length; h.advIds = sent.map((p) => p.id);
  if (!sent.length) return;
  const pts = [...new Set(sent.map((p) => partyOf(sim, p)).filter(Boolean))];
  const who = pts.length ? pts.map((pt) => `〈${pt.name}〉`).join('・') + (sent.some((p) => !partyOf(sim, p)) ? 'と冒険者たち' : '') : '冒険者たち';
  const text = `${cap.name}の冒険者ギルドから${who}（${sent.length}人）が、${s.name}の守りに出陣した`;
  sim.news(text, 2, s);
  note(sim, text);
  stat(sim, 'advCalled', sent.length);
}

// ---------- 毎日 ----------
export function spawnerDaily(sim) {
  const S = sim.S, R = sim.rng;
  const P = ensureSpawner(sim);
  // 湧き口の力・育ち・封印
  for (const sp of Object.values(P.list)) {
    const b = sim.building(sp.bld);
    if (!b) continue;
    if (sp.sealedUntil != null && sim.today >= sp.sealedUntil) {
      sp.sealedUntil = null; sp.power = Math.max(sp.power, 0.4);
      const text = `${b.name}の${sp.name}の封印が弱まり、ふたたび魔物が湧きはじめた`;
      sim.pushLog(text + '。', 'event', [], b.door); note(sim, text);
    }
    if (isSealed(sim, sp)) { sp.grow = 0; sp.prev = 0; continue; }
    sp.power = Math.min(1, sp.power + 0.03);   // 傷ついた湧き口も、年月とともに力を取り戻す
    // 生きている子が減った（討たれた）なら育ちが戻り、満ちたままなら湧き口が育つ
    if (sp.alive < sp.prev) sp.grow = Math.max(0, sp.grow - 0.2 * (sp.prev - sp.alive));
    else if (sp.alive >= capOf(sp)) sp.grow = Math.min(GROW_MAX, sp.grow + 0.08);
    sp.prev = sp.alive;
  }
  // 封じられた巣（expansion.js など）の見張り：封印が解けたら湧き口も息を吹き返す
  for (const site of Object.values(P.sites)) {
    const b = sim.building(site.bid);
    if (!b) continue;
    if (site.sealed && !b.sealed) {
      for (const id of site.spawners) { const sp = P.list[id]; sp.power = Math.min(sp.power, 0.4); sp.grow = 0; }
      const text = `封じられていた${b.name}の湧き口が、ふたたび息を吹き返した`;
      sim.pushLog(text + '。', 'event', [], b.door); note(sim, text);
    }
    site.sealed = !!b.sealed;
  }
  computeThreat(sim);
  const hurt = sim.living().length < (P.pop0 || 1) * 0.85;
  for (const site of Object.values(P.sites)) {
    if (site.sealed) continue;
    if (site.stage >= 1) prowl(sim, site);
    if (site.stage >= 2) ravageOrder(sim, site);
    if (site.stage >= 3 && !hurt) horde(sim, site);
  }
  postQuests(sim);
  recruit(sim);
}

// ---------- 脅威度 ----------
function computeThreat(sim) {
  const S = sim.S, P = S.spawner;
  const sites = Object.values(P.sites).map((site) => ({ site, b: sim.building(site.bid), sum: 0, n: 0 })).filter((x) => x.b);
  for (const c of Object.values(S.creatures)) {
    if (c.hp <= 0 || c.dormant || !hostileKind(c) || c.sp === 'demonlord' || c.occupier != null || c.general) continue;
    const demonArmy = SPECIES[c.sp].kind === 'demon' && !c.spawner;   // 魔王軍の兵は魔王の采配で動く（politics.js・monsters.js）。ここでは数えない
    for (const x of sites) {
      if (demonArmy) continue;
      const own = c.spawnSite === x.b.id || c.lair === x.b.id;
      if (!own && dist(c.pos.x, c.pos.z, x.b.door.x, x.b.door.z) > NEAR) continue;
      x.sum += c.named ? 4 : pw(c); x.n++;   // 名のある主（竜など）は巣を守るだけなので、群れの脅威としては軽く見る
    }
  }
  for (const { site, b, sum, n } of sites) {
    let press = 0;
    for (const id of site.spawners) { const sp = P.list[id]; if (!isSealed(sim, sp)) press += sp.power * (1 + sp.grow * 2); }
    const raw = Math.min(100, sum + press * 1.5);
    site.threat = Math.round((site.threat * 0.5 + raw * 0.5) * 10) / 10;
    site.count = n;
    const stage = site.sealed ? 0 : STAGE_AT.reduce((st, v, i) => (site.threat >= v ? i : st), 0);
    if (stage > site.stage && stage >= 2 && !(site.newsStage >= stage && sim.today - (site.newsDay ?? -99) < 6)) {
      site.newsStage = stage; site.newsDay = sim.today;
      const near = townsNear(sim, b.door.x, b.door.z)[0];
      const text = stage === 3 ? `${b.name}の魔物の脅威が限界に達した。${near ? `${near.name}の人々は大群を恐れている` : '大群があふれ出すかもしれない'}` : `${b.name}の魔物が増え、${near ? `${near.name}のあたりで` : ''}群れが人里を荒らしはじめた`;
      sim.news(text, 2, b.door); note(sim, text);
    }
    site.stage = stage;
    site.hist.push(Math.round(site.threat)); if (site.hist.length > 30) site.hist.shift();
  }
}

// 生まれた場所（ダンジョンのまわり）の外に出られる魔物
function roamers(sim, site, b, max) {
  const S = sim.S;
  return Object.values(S.creatures).filter((c) => alive(S, c) && hostileKind(c) && !c.named && !c.dormant && !c.fight && !c.raid && !c.prowl && !c.warParty && !c.general && c.occupier == null
    && c.sp !== 'demonlord' && !(SPECIES[c.sp].kind === 'demon' && !c.spawner) && c.role !== 'young' && c.role !== 'leader' && c.role !== 'treasure' && !(c.band && S.bands?.[c.band]?.leader === c.id)
    && (c.spawnSite === b.id || c.lair === b.id || dist(c.home.x, c.home.z, b.door.x, b.door.z) < 14) && c.hp > c.maxhp * 0.6)
    .sort((a, c2) => (a.inDungeon ? 1 : 0) - (c2.inDungeon ? 1 : 0)).slice(0, max);
}

// 段階1：街道筋までうろつき、旅人を襲う
function prowl(sim, site) {
  const S = sim.S, R = sim.rng, b = sim.building(site.bid);
  if (sim.today - site.lastProwl < 2 || !R.chance(0.5)) return;
  const s = townsNear(sim, b.door.x, b.door.z)[0];
  if (!s) return;
  const d = dist(s.x, s.z, b.door.x, b.door.z);
  const rd = Math.max(s.r + 14, d * R.range(0.35, 0.6));
  if (rd >= d - 4) return;
  const at = pointToward(sim, b.door, s, rd);
  if (!at) return;
  const grp = roamers(sim, site, b, R.int(1, 2));
  if (!grp.length) return;
  site.lastProwl = sim.today;
  for (const c of grp) startProwl(sim, c, 'prowl', at, S.t + 60 * R.int(20, 40), { site: b.id });
  stat(sim, 'prowls');
  sim.pushLog(`${b.name}の${grp[0].name}が${sim.placeName(at.x, at.z)}の街道筋にまで出没している。旅人は用心したほうがよい。`, 'event', [], at);
}
// 段階2：群れで町はずれの畑と家畜を荒らしに行く
function ravageOrder(sim, site) {
  const S = sim.S, R = sim.rng, b = sim.building(site.bid);
  if (sim.today - site.lastRavage < 3 || !R.chance(0.5)) return;
  const s = townsNear(sim, b.door.x, b.door.z).find((t) => !S.towns[t.id].ravagedAt || S.t - S.towns[t.id].ravagedAt > 1440 * 3);
  if (!s) return;
  const at = pointToward(sim, b.door, s, s.r + 5);
  if (!at) return;
  const grp = roamers(sim, site, b, R.int(2, 4));
  if (grp.length < 2) return;
  site.lastRavage = sim.today;
  const gid = 'g' + (S.spawner.seq++);
  for (const c of grp) startProwl(sim, c, 'ravage', at, S.t + 60 * R.int(20, 30), { site: b.id, sid: s.id, gid });
  stat(sim, 'ravageOrders');
  sim.pushLog(`${b.name}の${grp[0].name}たち${grp.length}体が群れをなし、${s.name}の方へ向かっていった。`, 'event', [], b.door);
}
// 段階3：大群。ダンジョンに群れ（monsters.js）がいれば、その群れの話し合いに任せる。いなければ湧き口からあふれ出す
function horde(sim, site) {
  const S = sim.S, P = S.spawner, R = sim.rng, b = sim.building(site.bid);
  if (sim.today - site.lastHorde < 12 || sim.today - P.lastHorde < 4 || P.hordes.length) return;
  const band = Object.values(S.bands || {}).find((x) => x.lair === b.id && !x.war && !x.rebel && x.members.length >= 4);
  const M = S.monsterWar;
  if (band && (!M || sim.today - M.last >= 20) && sim.today - (band.lastBigWar ?? -99) >= 30) {
    band.rage = Math.max(band.rage || 0, 3);   // 巣が手狭になり、群れが人里を襲う相談を始める（monsters.js の grudgeDaily）
    site.lastHorde = sim.today; P.lastHorde = sim.today;
    for (const id of site.spawners) P.list[id].grow = 0;
    stat(sim, 'hordeBand');
    note(sim, `${b.name}の「${band.name}」が、増えすぎた仲間を抱えて人里を襲う相談を始めた`);
    return;
  }
  if (b.type === 'demoncastle') return;   // 魔王城からの大群は魔王軍（politics.js の侵攻・monsters.js の魔将）に任せる
  const s = townsNear(sim, b.door.x, b.door.z)[0];
  if (!s) return;
  const grp = roamers(sim, site, b, MAX_HORDE);
  if (grp.length < 4) return;
  const at = pointToward(sim, b.door, s, s.r + 18) || pointToward(sim, b.door, s, s.r + 12);
  if (!at) return;
  site.lastHorde = sim.today; P.lastHorde = sim.today;
  for (const id of site.spawners) { const sp = P.list[id]; sp.grow = 0; sp.power = Math.max(0.3, sp.power * 0.7); }
  const h = { id: 'h' + P.seq++, site: b.id, siteName: b.name, target: s.id, ids: grp.map((c) => c.id), stage: 'gather', launchT: S.t + 60 * R.int(10, 20), night: R.chance(0.5), start: grp.length };
  for (const c of grp) startProwl(sim, c, 'horde', at, S.t + 60 * 72, { site: b.id, hid: h.id });
  P.hordes.push(h);
  stat(sim, 'hordes');
  const text = `${b.name}から魔物があふれ出し、${s.name}の近くに集まりはじめた（${grp.length}体）。大群の前兆だ`;
  sim.news(text, 2, at);
  note(sim, text);
  const res = sim.living().filter((p) => p.s === s.id && sim.isAdult(p));
  for (let i = 0; i < 6 && res.length; i++) sim.remember(R.pick(res), `${b.name}の魔物があふれ出したと聞いた。大群が来るかもしれない`, { emo: -0.7, imp: 0.7, k: 'monster' });
}

// ---------- 討伐の依頼 ----------
function postQuests(sim) {
  const S = sim.S, P = S.spawner, R = sim.rng;
  S.quests = S.quests || [];
  const live = (q) => q.state === 'open' || q.state === 'taken';
  const deadly = (x, z) => (S.deadly || []).some((d) => d.until > sim.today && dist(d.x, d.z, x, z) < 14);
  const sites = Object.values(P.sites).filter((x) => x.stage >= 1 && !x.sealed).sort((a, b) => b.threat - a.threat);
  for (const site of sites) {
    const b = sim.building(site.bid);
    const cap = guildCap(sim, b);
    if (!cap) continue;
    const near = townsNear(sim, b.door.x, b.door.z)[0];
    if (!near && site.stage < 3) continue;   // 人里から遠い巣は、あふれそうになるまで誰も困らない
    const openHere = S.quests.filter((q) => q.s === cap.id && q.state === 'open').length;
    const ours = S.quests.filter((q) => q.s === cap.id && live(q) && q.spawnSite != null).length;
    if (openHere >= 11 || ours >= 6) continue;   // 掲示板があふれないように
    // 名のある主（竜など）が棲む巣のそばには、湧き口の依頼を出さない（主の討伐は名のある魔物の依頼に任せる）
    const lord = Object.values(S.creatures).find((c) => alive(S, c) && c.named && dist(c.pos.x, c.pos.z, b.door.x, b.door.z) < 16);
    if (lord) continue;
    const mine = S.quests.filter((q) => live(q) && q.spawnSite === b.id);
    const k = S.kingdoms[cap.kingdom];
    const town = S.towns[cap.id];
    const canPay = (x) => Math.max(0, (k?.treasury || 0) - 100) + Math.max(0, town.fund || 0) >= x;
    // 討伐：段階が上がるほど多く
    const hunts = mine.filter((q) => q.type === 'hunt').length;
    if (hunts < site.stage && !deadly(b.door.x, b.door.z)) {
      const taken = new Set(S.quests.filter(live).map((q) => q.target));
      const cs = Object.values(S.creatures).filter((c) => alive(S, c) && hostileKind(c) && !c.named && !c.inDungeon && !c.quested && !taken.has(c.id) && c.sp !== 'demonlord'
        && dist(c.pos.x, c.pos.z, b.door.x, b.door.z) < NEAR + 10 && !Object.values(S.creatures).some((o) => o.named && o.hp > 0 && dist(o.pos.x, o.pos.z, c.pos.x, c.pos.z) < 14));
      for (let i = hunts; i < site.stage && cs.length; i++) {
        const c = cs.splice(R.int(0, cs.length - 1), 1)[0];
        const power = c.atk + c.maxhp / 8;
        const reward = Math.round(15 + power * 3 + site.threat * 0.4);
        if (!canPay(reward)) break;
        const king = site.stage >= 2 && k && k.treasury - 100 >= reward;
        const giver = king ? S.people[k.kingId] : near ? R.pick(sim.living().filter((p) => p.s === near.id && sim.isAdult(p) && p.rank !== 'king')) : null;
        c.quested = true;
        // 難しさ：その魔物と、まわりにいるいちばん強い仲間の強さの大きいほう（群れのそばは一段むずかしい）
        const pack = Object.values(S.creatures).filter((o) => alive(S, o) && hostileKind(o) && !o.inDungeon && dist(o.pos.x, o.pos.z, c.pos.x, c.pos.z) < 10);
        const rank = Math.min(6, rankFor(Math.max(power, ...pack.map((o) => o.atk + o.maxhp / 8))) + (pack.length >= 4 ? 1 : 0));
        post(sim, { type: 'hunt', s: cap.id, from: near?.id ?? cap.id, target: c.id, spawnSite: b.id, rank, where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, reward, giver: giver?.id,
          title: `${b.name}のあたりに湧いた${c.name}を討伐してほしい（${king ? '王の布告・' : ''}魔物の脅威${Math.round(site.threat)}）` });
      }
    }
    // 湧き口を封じる：段階2から。王の布告（国庫から）
    if (site.stage >= 2 && !mine.some((q) => q.seal) && !S.quests.some((q) => live(q) && q.target === 'b' + b.id) && !deadly(b.door.x, b.door.z)) {
      const sp = site.spawners.map((id) => P.list[id]).filter((x) => !isSealed(sim, x)).sort((a, c) => (c.power * (1 + c.grow)) - (a.power * (1 + a.grow)))[0];
      if (sp) {
        const inside = Object.values(S.creatures).filter((c) => alive(S, c) && (c.lair === b.id || c.spawnSite === b.id)).reduce((m, c) => Math.max(m, c.atk + c.maxhp / 8), 0);
        const reward = Math.round(50 + 35 * sp.depth + site.threat * 0.8);
        if (canPay(reward)) {
          post(sim, { type: 'explore', s: cap.id, target: 'b' + b.id, seal: sp.id, spawnSite: b.id, where: { x: b.door.x, z: b.door.z }, rank: Math.max(2, Math.min(6, rankFor(inside))), reward, giver: k?.kingId,
            title: `${b.name}の${sp.name}を封じよ（王の布告・魔物の脅威${Math.round(site.threat)}）` });
        }
      }
    }
  }
}
function post(sim, q) {
  const S = sim.S;
  S.nextQuest = (S.nextQuest || 0) + 1;
  const quest = { id: S.nextQuest, state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 14, ...q };
  S.quests.push(quest);
  const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
  const g = sim.townBuilding(sim.town(quest.s), 'guild');
  sim.pushLog(`【依頼】${quest.title}（報酬${quest.reward}銅貨・${RANKS[quest.rank]}ランク以上）`, 'event', quest.giver != null ? [quest.giver] : [], g ? g.door : sim.town(quest.s));
  stat(sim, quest.seal ? 'questSeal' : 'questHunt');
  return quest;
}

// ---------- 討伐に向かうパーティーのお知らせ ----------
// パーティーは partylife.js のとおり、リーダーが行き先を決め、仲間はそれに合わせて動く。
// そこで「リーダーがその依頼の行き先へ歩き出したとき」に出発とみなし、行き先もリーダーの行動の目的地（action.tx/tz）から書く。
function departures(sim) {
  const S = sim.S, P = S.spawner;
  for (const q of S.quests || []) {
    if (q.state !== 'taken' || q.departNote) continue;
    if (!['hunt', 'explore'].includes(q.type)) continue;
    const onQuest = q.takenBy.map((id) => S.people[id]).filter((m) => m && m.deathYear == null && m.quest === q.id);
    if (!onQuest.length) continue;
    const pt = q.party != null ? S.advParties?.[q.party] : null;
    // 先頭に立つ人：パーティーならリーダー（リーダーが依頼に加わっていなければ、依頼の仲間でいちばん先に動いた人）
    let lead = pt ? S.people[pt.leader] : null;
    if (!lead || lead.quest !== q.id || lead.deathYear != null) lead = onQuest.find((m) => m.action?.type === 'quest') || null;
    if (!lead || lead.action?.type !== 'quest' || lead.action.quest?.target == null && lead.action.tx == null) continue;
    // 一緒に出発する仲間：リーダーに合わせて動いている人（partylife の pfollow）か、同じ依頼を受けてそばにいる人
    const crew = [lead, ...onQuest.filter((m) => m !== lead && (m.action?.pfollow === lead.id || m.action?.type === 'quest' || Math.hypot(m.pos.x - lead.pos.x, m.pos.z - lead.pos.z) < 10))];
    q.departNote = sim.today;
    const tx = lead.action.tx ?? q.where?.x, tz = lead.action.tz ?? q.where?.z;
    // 行き先の呼び名：湧き口のダンジョンのそばならその名、そうでなければ土地の名
    let placeName = tx != null ? sim.placeName(tx, tz) : 'どこか';
    const near = Object.values(P.sites).map((x) => sim.building(x.bid)).find((b) => b && tx != null && Math.hypot(b.door.x - tx, b.door.z - tz) < NEAR);
    if (q.spawnSite != null && sim.building(q.spawnSite)) placeName = sim.building(q.spawnSite).name;
    else if (near) placeName = near.name;
    let what;
    if (q.type === 'hunt') {
      const c = S.creatures[q.target];
      what = `${placeName}の${c ? c.name : '魔物'}討伐`;
    } else {
      const b = sim.building(+String(q.target).slice(1));
      if (!b || b.type === 'hideout') continue;
      what = q.seal ? `${b.name}の湧き口を封じる戦い` : P.sites[b.id] ? `${b.name}の魔物討伐と探索` : `${b.name}の探索`;
    }
    const names = crew.map((m) => `${advClassName(m) || JOBS[m.job]?.name || ''}${m.given}`).join('・');
    const pos = lead.pos;
    if (crew.length >= 2) {
      const text = pt ? `〈${pt.name}〉（${names}）が、${what}に出発した` : `冒険者の一行（${names}）が、${what}に出発した`;
      sim.news(text, q.seal ? 3 : 2, pos);
      if (q.spawnSite != null) note(sim, text);
      stat(sim, 'noticeParty');
    } else {
      sim.pushLog(`${names}がひとりで${what}に出発した。`, 'event', crew.map((m) => m.id), pos);
      stat(sim, 'noticeSolo');
    }
  }
}

// ---------- 湧き口を封じる・傷つける（sim.js の doQuest：ダンジョン探索に勝ったとき） ----------
export function spawnerExplored(sim, p, b, q) {
  const S = sim.S, R = sim.rng;
  if (!b || !S.spawner) return;
  const P = S.spawner, site = P.sites[b.id];
  if (!site) return;
  const open = site.spawners.map((id) => P.list[id]).filter((sp) => !isSealed(sim, sp));
  if (!open.length) return;
  const pt = partyOf(sim, p);
  const who = pt ? `〈${pt.name}〉` : `冒険者${p.given}`;
  const target = q && q.seal ? P.list[q.seal] : null;
  if (target && !isSealed(sim, target)) {
    target.sealedUntil = sim.today + R.int(45, 75); target.sealedBy = p.id; target.power = 0.3; target.grow = 0;
    stat(sim, 'sealed');
    const text = `${who}が${b.name}の${target.name}を封じた。しばらく魔物は湧かないだろう`;
    sim.news(text, 3, b.door); note(sim, text);
    sim.chron(`${who}が${b.name}の${target.name}を封じた`, sim.town(q.s)?.kingdom);
    const crew = q.takenBy.map((id) => S.people[id]).filter((m) => m && m.deathYear == null);
    for (const m of crew) { m.fame = (m.fame || 0) + 12; sim.remember(m, `${b.name}の奥で魔物の湧き口を封じた`, { emo: 0.9, imp: 0.9, k: 'quest' }); }
  } else {
    // 依頼でない探索でも、奥で暴れれば湧き口は傷つく
    const sp = open.sort((a, c) => c.power - a.power)[0];
    sp.power = Math.max(0.2, sp.power - 0.25); sp.grow = Math.max(0, sp.grow - 0.3);
    stat(sim, 'damaged');
    sim.pushLog(`${who}が${b.name}の${sp.name}を打ち壊し、魔物の湧きが弱まった。`, 'event', [p.id], b.door);
  }
  // 湧き口がすべて封じられ、巣に魔物が残っていなければ、巣そのものを封じる（expansion.js の封印とつなぐ）
  const allSealed = site.spawners.every((id) => isSealed(sim, P.list[id]));
  const livesThere = Object.values(S.creatures).some((c) => c.hp > 0 && c.lair === b.id && c.hostile);
  if (allSealed && !livesThere && !b.sealed) {
    b.sealed = true; b.sealedYear = sim.year(); b.sealedUntil = sim.today + 90; b.sealedBy = sim.town(p.s)?.kingdom ?? null;
    site.sealed = true;
    const text = `${b.name}の湧き口がすべて封じられ、入口が閉ざされた`;
    sim.news(text, 3, b.door); note(sim, text);
    stat(sim, 'siteSealed');
  }
}

// ---------- 冒険者を志す人 ----------
function recruit(sim) {
  const S = sim.S, P = S.spawner, R = sim.rng;
  for (const k of S.kingdoms || []) {
    const cap = S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === k.id && !S.towns[s.id].occupied);
    if (!cap) continue;
    const tw = S.world.settlements.filter((s) => s.kingdom === k.id && !S.towns[s.id].occupied && !((s.tribal || s.indep) && s.annexed == null));
    const tids = new Set(tw.map((s) => s.id));
    const people = sim.living().filter((p) => tids.has(p.s));
    const adults = people.filter((p) => sim.isAdult(p)).length;
    const advs = people.filter((p) => isAdventurer(p)).length;
    const t = threatOfKingdom(sim, k.id);
    // 上限：大人の4％＋脅威の段階ごとに2％（町の働き手が足りなくならないように）
    const cap_ = Math.max(6, Math.round(adults * (0.04 + 0.02 * t.stage)));
    if (advs >= cap_ || !R.chance(0.3 + 0.2 * t.stage)) continue;
    // 同じ町で同じ仕事の人が3人以上いる者だけ（抜けても困らない）
    const byJob = {};
    for (const p of people) if (p.job) byJob[p.s + ':' + p.job] = (byJob[p.s + ':' + p.job] || 0) + 1;
    let best = null, bestSc = 0, why = '';
    for (const p of people) {
      const age = sim.ageOf(p);
      if (age < 16 || age > 42 || p.spouseId != null || p.jail != null || p.quest || p.pregnant > 0) continue;
      if (['king', 'royal', 'noble'].includes(p.rank) || isAdventurer(p) || p.job === 'guildmaster' || JOBS[p.job]?.guardTown) continue;
      if (p.job && (byJob[p.s + ':' + p.job] || 0) < 3) continue;
      if ((p.values?.courage ?? 0.5) < 0.35) continue;
      const hh = sim.hh(p);
      const reasons = [];
      let sc = 0;
      if (p.vendetta) { sc += 2.5; reasons.push(['家族の仇の魔物を討つ', 2.5]); }
      if (!hh || hh.money < 25) { sc += 2; reasons.push(['貧しい暮らしから抜け出す', 2]); }
      if ((p.lv || 1) >= 4 || (JOBS[p.job]?.combat || 0) >= 1 || (p.atk || 0) >= 12) { sc += 1.5; reasons.push(['腕っぷしを生かす', 1.5]); }
      if ((p.values?.ambition ?? 0) > 0.6 || (p.needs?.esteem ?? 60) < 35) { sc += 1.5; reasons.push(['名を上げる', 1.5]); }
      if (age <= 24 && (p.values?.courage ?? 0) > 0.6) { sc += 1; reasons.push(['冒険に憧れて旅立つ', 1]); }
      if (!p.job) sc += 1;
      sc *= R.range(0.6, 1.4);
      if (sc > bestSc && sc >= 1.5) { bestSc = sc; best = p; why = reasons.sort((a, b) => b[1] - a[1])[0]?.[0] || '冒険者になる'; }
    }
    if (!best) continue;
    becomeAdventurer(sim, best, cap, why, t);
    if (t.stage >= 2 && advs + 1 < cap_ && R.chance(0.5)) {   // 脅威が高いときは、あとに続く者も出る
      let b2 = null, s2 = 0, w2 = '';
      for (const p of people) {
        if (p === best || p.s === cap.id && isAdventurer(p) || isAdventurer(p) || p.spouseId != null || p.jail != null || p.quest || ['king', 'royal', 'noble'].includes(p.rank) || JOBS[p.job]?.guardTown || p.job === 'guildmaster') continue;
        const age = sim.ageOf(p);
        if (age < 16 || age > 35 || (p.values?.courage ?? 0) < 0.55 || (p.job && (byJob[p.s + ':' + p.job] || 0) < 3)) continue;
        const sc = (p.values?.ambition ?? 0.5) + (p.values?.courage ?? 0.5) + sim.rng.next();
        if (sc > s2) { s2 = sc; b2 = p; w2 = sim.hh(p) && sim.hh(p).money < 25 ? '貧しい暮らしから抜け出す' : '名を上げる'; }
      }
      if (b2) becomeAdventurer(sim, b2, cap, w2, t);
    }
  }
}
function becomeAdventurer(sim, y, cap, why, t) {
  const S = sim.S, R = sim.rng;
  const from = sim.town(y.s);
  const strong = (y.lv || 1) >= 4 || (y.atk || 0) >= 12;
  y.formerJob = y.job;
  y.job = strong ? R.pick(['warrior', 'warrior', 'adventurer']) : R.pick(['adventurer', 'archer', 'warrior']);
  y.rank = 'adventurer'; y.skill = y.skill || {}; y.skill[y.job] = Math.max(y.skill[y.job] || 0, 0.15);
  y.advClass = null;
  if (y.s !== cap.id) {
    const inn = sim.townBuilding(cap, 'tavern');
    const id = S.nextHh++;
    S.households[id] = { id, members: [], house: inn ? inn.id : null, inn: true, s: cap.id, money: 0, food: 0, comfort: 0, name: `${y.family}（宿住まい）` };
    { const oh = sim.hh(y); const x = oh ? Math.max(0, Math.min(10, oh.money)) : 0; if (oh) oh.money -= x; S.households[id].money = x; }   // 持たせ金は実家の家計から
    sim.moveTo(y, S.households[id]); y.s = cap.id;
  }
  sim.remember(y, `${why}ため、${from.name}を出て冒険者になった`, { emo: 0.7, imp: 1, k: 'career' });
  (y.deeds = y.deeds || []).push(`${sim.year()}年、${why}ため冒険者を志した`);
  sim.pushLog(`${from.name}の${y.given}（${sim.ageOf(y)}歳・${y.formerJob ? JOBS[y.formerJob]?.name || '' : '無職'}）が、${why}ため冒険者になった${t.stage >= 2 ? '（魔物の脅威が高まり、ギルドは人手を求めている）' : ''}。`, 'event', [y.id], y.pos);
  for (const pid of [y.fatherId, y.motherId]) { const par = S.people[pid]; if (par && par.deathYear == null) sim.remember(par, `${y.given}が冒険者になると言って出ていった。無事でいてくれればいいが`, { emo: -0.4, imp: 0.8, about: [y.id], k: 'family' }); }
  stat(sim, 'recruits');
  stat(sim, 'recruit_' + why);
}

// ---------- 危険区域の地図に足す（毎時、computeDanger のあと） ----------
export function spawnerDanger(sim) {
  const S = sim.S, P = S.spawner, m = S.dangerMap;
  if (!P || !m) return;
  const towns = new Set(S.world.settlements.map((s) => Math.floor(s.z / CH) * CW + Math.floor(s.x / CH)));
  for (const site of Object.values(P.sites)) {
    if (site.sealed || site.threat < 10) continue;
    const b = sim.building(site.bid);
    if (!b) continue;
    const cx = Math.floor(b.door.x / CH), cz = Math.floor(b.door.z / CH);
    const v = site.threat / 12, r = site.stage >= 2 ? 2 : 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= CW || z >= CHH) continue;
      const i = z * CW + x;
      if (towns.has(i)) continue;
      m[i] = Math.round((m[i] + v / (1 + Math.max(Math.abs(dx), Math.abs(dz)))) * 10) / 10;
    }
  }
}

// ---------- 画面に出す ----------
export function threatOfKingdom(sim, kid) {
  const S = sim.S, P = S.spawner;
  let best = { value: 0, stage: 0, site: null, town: null };
  if (!P) return best;
  const ts = S.world.settlements.filter((s) => s.kingdom === kid && S.towns[s.id] && !S.towns[s.id].occupied);
  for (const site of Object.values(P.sites)) {
    const b = sim.building(site.bid);
    if (!b || site.sealed) continue;
    const t = ts.filter((s) => dist(s.x, s.z, b.door.x, b.door.z) <= REACH).sort((a, c) => dist(a.x, a.z, b.door.x, b.door.z) - dist(c.x, c.z, b.door.x, b.door.z))[0];
    if (!t) continue;
    if (site.threat > best.value) best = { value: site.threat, stage: site.stage, site, town: t };
  }
  return best;
}
function trend(site) {
  const h = site.hist || [];
  if (h.length < 3) return '';
  const d = h[h.length - 1] - h[h.length - 3];
  return d >= 4 ? '↑' : d <= -4 ? '↓' : '→';
}
const stageCls = (st) => (st >= 3 ? 'up' : st >= 2 ? 'up' : '');

export function spawnerNationHTML(sim, k, esc) {
  const S = sim.S, P = S.spawner;
  if (!P) return '';
  const ts = S.world.settlements.filter((s) => s.kingdom === k.id);
  const rows = Object.values(P.sites).map((site) => {
    const b = sim.building(site.bid);
    const t = b && ts.filter((s) => dist(s.x, s.z, b.door.x, b.door.z) <= REACH)[0];
    return t ? { site, b } : null;
  }).filter(Boolean).sort((a, c) => c.site.threat - a.site.threat).slice(0, 3);
  if (!rows.length) return '<dt>魔物の脅威</dt><dd>近くに湧き口はない</dd>';
  return `<dt>魔物の脅威</dt><dd>${rows.map(({ site, b }) => `<span class="link" data-goto="${b.door.x},${b.door.z}">${esc(b.name)}</span> <b class="${stageCls(site.stage)}">${Math.round(site.threat)}${trend(site)}</b>（${site.sealed ? '封印中' : STAGE_NAME[site.stage]}）`).join('<br>')}</dd>`;
}

export function spawnerWorldHTML(sim, esc) {
  const S = sim.S, P = S.spawner;
  if (!P) return '';
  const sites = Object.values(P.sites).map((site) => ({ site, b: sim.building(site.bid) })).filter((x) => x.b).sort((a, c) => c.site.threat - a.site.threat);
  const st = P.stats;
  let h = `<div class="nation"><div class="nname">魔物の湧き口と脅威</div><dl class="kv">`;
  h += `<dt>湧いた魔物</dt><dd>これまでに${st.born || 0}体・封じた湧き口${st.sealed || 0}・大群${(st.hordes || 0) + (st.hordeBand || 0)}回</dd>`;
  for (const { site, b } of sites.slice(0, 10)) {
    const sps = site.spawners.map((id) => P.list[id]);
    const alive_ = sps.reduce((a, sp) => a + (sp.alive || 0), 0);
    const sealedN = sps.filter((sp) => isSealed(sim, sp)).length;
    h += `<dt><span class="link" data-goto="${b.door.x},${b.door.z}">${esc(b.name)}</span></dt><dd><b class="${stageCls(site.stage)}">${Math.round(site.threat)}${trend(site)}</b> ${site.sealed ? '封印中' : esc(STAGE_NAME[site.stage])}・湧き口${sps.length}（封印${sealedN}）・湧いた魔物${alive_}体${site.wild ? '・未開の地' : ''}</dd>`;
  }
  h += '</dl>';
  if (P.log.length) h += `<div class="sub" style="margin-top:4px">${P.log.slice(0, 5).map((e) => `${e.d}日目　${esc(e.text)}`).join('<br>')}</div>`;
  h += '</div>';
  return h;
}

export function spawnerBuildingHTML(sim, b, esc) {
  const P = sim.S.spawner;
  const site = P?.sites[b.id];
  if (!site) return '';
  const rows = site.spawners.map((id) => P.list[id]).map((sp) => {
    const state = isSealed(sim, sp) ? (sp.sealedUntil != null ? `封印中（あと${Math.max(0, sp.sealedUntil - sim.today)}日）` : '巣ごと封印中') : `力${Math.round(sp.power * 100)}％${sp.grow > 0.3 ? '・育っている' : ''}`;
    const kinds = [...new Set(sp.sp.map((x) => SPECIES[x]?.name || x))].join('・');
    return `<dt>${esc(sp.name)}</dt><dd>${esc(kinds)}／いま${sp.alive || 0}体（上限${capOf(sp)}）／${esc(state)}</dd>`;
  }).join('');
  return `<div class="section"><h4>魔物の湧き口</h4><dl class="kv"><dt>脅威度</dt><dd><b class="${stageCls(site.stage)}">${Math.round(site.threat)}${trend(site)}</b>（${site.sealed ? '封印中' : esc(STAGE_NAME[site.stage])}）</dd>${rows}</dl></div>`;
}

// ---------- 試験用 ----------
export function spawnerReport(sim) {
  const S = sim.S, P = S.spawner;
  if (!P) return null;
  return {
    stats: { ...P.stats },
    sites: Object.values(P.sites).map((s) => ({ name: s.name, threat: Math.round(s.threat), stage: s.stage, hist: s.hist.join(','), sealed: s.sealed, n: s.count })),
    hordes: (P.hordeLog || []).slice(),
    active: P.hordes.length,
    spawned: Object.values(S.creatures).filter((c) => c.spawner && c.hp > 0).length,
  };
}
