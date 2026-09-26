// 国の開拓と領土争い（開発部）
// 国は税収がたまると、未開の地へ斥候を出し、開拓団を募り、木を伐って整地し、柵と見張り櫓を立て、
// 家・井戸・畑・礼拝堂を建てて村を興す。村は育つと町に格上げされ、道でつながる。
// 国どうしは資源（鉱脈・森・肥えた土地・塩田・良港など）と国境をめぐって、抗議・取引・同盟・土地の買い取り・
// 小競り合いをし、戦争では区画ごとに土地を奪い合う。
//
// 本体からの呼び方（くわしくは報告書のコード片）
//   expansionDaily(sim)              … newDay の politicsDaily のあとで1日1回
//   expansionHourly(sim)             … newHour の最後で1時間に1回（歩いた所が「知られた土地」になる）
//   expansionPlace(sim, p, kind)     … placeFor の頭で呼ぶ（開拓団員の寝床は開拓小屋、仕事場は開拓地）
//   expansionWarEnded(sim, w, l)     … politics.js の endWar の最後で呼ぶ（区画単位の講和）
//   expansionWarReason(sim, a, b)    … politics.js の declareWar で理由と前線を決める
//   expansionNationHTML(sim, k, esc) … 国々のタブ
//   drawTerritory(sim, g)            … ミニマップ（国境線・未踏の地・開拓地の印）
//
// 状態（古いセーブで欠けていても、最初の呼び出しで作り直す）
//   S.territory = { cs:8, cw, ch, owner:[区画→国id/-1], kind:[0なし/1もとからの領土/2開拓地/3砦], home:[区画→町id/-1], init:[国ごとの最初の区画数] }
//   S.explored  = [区画→ビット]。(1<<国id) がその国に知られている。128 は誰かが実際に歩いた。区画 i = cz*cw + cx（8×8マス）
//   S.expansion = { projects, res, tension, pacts, wars, stats, hist, ... }
import { T, W, H, walkable, isWater, tryPlace, MinHeap, MOVE_COST, TILE_NAME } from './world.js';
import { KINGDOMS, JOBS, GOODS, traitLabels } from './data.js';
import { createPersonFactory, SENIOR_JOBS } from './history.js';
import { houseValue, earn } from './property.js';
import { starterKit } from './items.js';
import { humanStats } from './society.js';
import { speechStyle } from './speech.js';

// ---------- 定数 ----------
export const EXP_CS = 8;                       // 区画の大きさ（danger.js の危険地図と同じ）
const CW = Math.ceil(W / EXP_CS), CHN = Math.ceil(H / EXP_CS), NC = CW * CHN;
const BIG = W >= 320;                          // 10倍の大陸では、もとの国の広さを丸ごと「開拓済み」にする
const INIT_PAD = 4;                            // 小さな大陸で、町の中心から（半径＋何マス）以内に区画の中心がある所を最初の領土にする
const FR = BIG ? 7 : 5;                        // 開拓村の柵の半径（チェビシェフ距離）。小さな大陸は土地が混んでいるので小さめ
const WALKED = 128;
const ARMY = new Set(['knight', 'soldier', 'general']);
const KEEP_JOBS = new Set(['carpenter', 'mason', 'woodcutter', 'hunter', 'smith', 'pioneer', 'charcoal', 'roadworker']);
const NO_SETTLER = new Set(['soldier', 'knight', 'general', 'guard', 'gatekeeper', 'militia', 'jailer', 'king', 'royal', 'noble', 'thief', 'banditchief', 'pirate', 'adventurer', 'warrior', 'archer', 'cleric', 'sage', 'paladin', 'beggar']);
const CLEARABLE = new Set([T.FOREST, T.DENSE, T.JUNGLE]);
const BUILDABLE = new Set([T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH]);
const ACTIVE = new Set(['scout', 'recruit', 'clear', 'fence', 'build', 'fortbuild', 'explore']);

export const RES_NAME = { timber: '良い森', stone: '石切り場', ore: '鉄の鉱脈', gem: '宝石の鉱脈', fertile: '肥えた土地', water: '豊かな水場', salt: '塩田', harbor: '良港' };
const RES_FORT = { timber: '森の砦', stone: '石切りの砦', ore: '鉄山の砦', gem: '玉石の砦', fertile: '麦野の砦', water: '水場の砦', salt: '塩浜の砦', harbor: '入り江の砦' };
export const STAGE_NAME = {
  scout: '斥候が下見中', recruit: '開拓団を募集中', clear: '木を伐って整地中', fence: '柵と見張り櫓を建設中', build: '家・井戸・畑を建設中',
  settle: '村として根づいた', fortbuild: '砦を建設中', explore: '未開の地を探索中', done: '完了', failed: '失敗',
};
const hash01 = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x = (x ^ (x >>> 13)) >>> 0; return (x % 10007) / 10007; };
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
export const chunkAt = (x, z) => Math.min(CHN - 1, Math.max(0, Math.floor(z / EXP_CS))) * CW + Math.min(CW - 1, Math.max(0, Math.floor(x / EXP_CS)));
const cCenter = (ci) => ({ x: (ci % CW) * EXP_CS + (EXP_CS >> 1), z: Math.floor(ci / CW) * EXP_CS + (EXP_CS >> 1) });
// 区画の呼び名（建物の上ではなく、歩ける所の名前で）
function spotName(sim, ci) { const c = cCenter(ci); const q = sim.randomNear(c.x, c.z, 4) || c; return sim.placeName(q.x, q.z); }
const nbrs4 = (ci) => { const cx = ci % CW, cz = Math.floor(ci / CW), o = []; if (cx > 0) o.push(ci - 1); if (cx < CW - 1) o.push(ci + 1); if (cz > 0) o.push(ci - CW); if (cz < CHN - 1) o.push(ci + CW); return o; };
const kname = (k) => KINGDOMS[k]?.name || '';
const kshort = (k) => kname(k).replace('王国', '');

// ---------- 状態の用意 ----------
export function ensureExpansion(sim) {
  const S = sim.S;
  if (S.expansion && S.territory && Array.isArray(S.explored) && S.territory.cw === CW && S.explored.length === NC) return S.expansion;
  initExpansion(sim);
  return S.expansion;
}

function initExpansion(sim) {
  const S = sim.S, w = S.world;
  const owner = new Array(NC).fill(-1), kind = new Array(NC).fill(0), home = new Array(NC).fill(-1);
  const land = landCounts(w);
  for (let ci = 0; ci < NC; ci++) {
    const cx = ci % CW, cz = Math.floor(ci / CW);
    const x0 = cx * EXP_CS, z0 = cz * EXP_CS, x1 = x0 + EXP_CS - 1, z1 = z0 + EXP_CS - 1;
    let best = null, bd = 1e9;
    for (const s of w.settlements) {
      if (s.kingdom == null || s.kingdom < 0) continue;
      // 区画の中で町の中心にいちばん近い点までの距離
      const dx = Math.max(x0 - s.x, 0, s.x - x1), dz = Math.max(z0 - s.z, 0, s.z - z1);
      const d = Math.max(dx, dz);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) continue;
    if (BIG) {
      // 大きな大陸：地図が決めた国の領分（kingdomOf）をそのまま開拓済みとする
      const cnt = {}; let n = 0;
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const k = w.kingdomOf[z * W + x]; if (k >= 0) { cnt[k] = (cnt[k] || 0) + 1; n++; } }
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
      if (top && n >= 16 && (land[ci] >= 8 || bd <= best.r)) { owner[ci] = +top[0]; kind[ci] = 1; home[ci] = best.kingdom === +top[0] ? best.id : -1; }
    } else {
      // 小さな大陸：町のすぐまわりだけが開拓済み。残りは未開の地
      const c = cCenter(ci);
      const near = w.settlements.filter((s) => s.kingdom >= 0 && Math.hypot(c.x - s.x, c.z - s.z) <= s.r + INIT_PAD).sort((a, b) => Math.hypot(c.x - a.x, c.z - a.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
      const holder = near || (bd === 0 ? best : null);
      if (holder && (land[ci] >= 8 || bd === 0)) { owner[ci] = holder.kingdom; kind[ci] = 1; home[ci] = holder.id; }
    }
  }
  // 砦・開拓小屋・鉱山など、国のものになっている特別な場所の区画
  for (const id of w.specials || []) {
    const b = w.buildings[id];
    if (!b || b.kingdom == null || b.kingdom < 0 || !['fort', 'camp', 'mine', 'observatory'].includes(b.type)) continue;
    const ci = chunkAt(b.x, b.z);
    if (owner[ci] === -1) { owner[ci] = b.kingdom; kind[ci] = 1; }
  }
  const init = KINGDOMS.map((_, k) => owner.filter((o) => o === k).length);
  const origOwner = owner.slice();
  S.territory = { cs: EXP_CS, cw: CW, ch: CHN, owner, kind, home, init };
  // 知られた土地：自国の領土と、そのまわり2区画（うわさで知っている）
  const ex = new Array(NC).fill(0);
  for (let ci = 0; ci < NC; ci++) {
    const k = owner[ci];
    if (k < 0) continue;
    ex[ci] |= (1 << k) | WALKED;
    const cx = ci % CW, cz = Math.floor(ci / CW);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < CW && nz < CHN) ex[nz * CW + nx] |= 1 << k;
    }
  }
  // 街道が通っている区画は、どの国の旅人も知っている
  for (let i = 0; i < W * H; i++) if (w.tiles[i] === T.ROAD || w.tiles[i] === T.BRIDGE) { const ci = chunkAt(i % W, (i / W) | 0); ex[ci] |= 7; }
  S.explored = ex;
  const prev = S.expansion;
  S.expansion = {
    v: 1, seq: prev?.seq || 1, projects: prev?.projects || [], res: scanResources(sim, land), tension: {}, pacts: [], wars: [],
    warSeen: {}, famePrev: {}, origOwner, lastFail: {}, lastPlan: {}, lastProtest: {}, sk: {},
    stats: { founded: 0, failed: 0, forts: 0, seized: 0, bought: 0, skirmish: 0, protests: 0, trades: 0, alliances: 0, towns: 0, explored: 0, attacks: 0, deaths: 0 },
    hist: [],
  };
  S.expansion.origK = {};
  for (const s of w.settlements) { S.expansion.sk[s.id] = s.kingdom; S.expansion.origK[s.id] = s.kingdom; }
  syncAll(sim);
  sim.events?.push({ type: 'borders' });
}

function landCounts(w) {
  const land = new Array(NC).fill(0);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = w.tiles[z * W + x];
    if (!isWater(t) && t !== T.WASTE && t !== T.LAVA && t !== T.PEAK) land[chunkAt(x, z)]++;
  }
  return land;
}

// 区画ごとの資源（地形から決める。鉱脈と宝石は、岩山の多い区画の一部だけ）
function scanResources(sim, land) {
  const w = sim.S.world, res = {};
  const seed = sim.S.seed || 1;
  for (let ci = 0; ci < NC; ci++) {
    if (land[ci] < 6) continue;
    const cx = ci % CW, cz = Math.floor(ci / CW);
    const c = {};
    for (let z = cz * EXP_CS; z < cz * EXP_CS + EXP_CS; z++) for (let x = cx * EXP_CS; x < cx * EXP_CS + EXP_CS; x++) {
      if (!inb(x, z)) continue;
      const t = w.tiles[z * W + x]; c[t] = (c[t] || 0) + 1;
    }
    const n = (t) => c[t] || 0;
    const r = [];
    const rock = n(T.ROCK) + n(T.PEAK);
    const wood = n(T.FOREST) + n(T.DENSE) + n(T.JUNGLE);
    const flat = n(T.GRASS) + n(T.SAVANNA);
    const sea = n(T.SEA) + n(T.DEEP);
    if (wood >= 30) r.push('timber');
    if (n(T.ROCK) >= 10) r.push('stone');
    if (rock >= 8 && hash01(ci * 31 + seed) < 0.4) r.push('ore');
    if (rock >= 16 && hash01(ci * 57 + seed * 3) < 0.14) r.push('gem');
    if (flat >= 26 && n(T.RIVER) + n(T.SWAMP) >= 1) r.push('fertile');
    else if (flat >= 40) r.push('fertile');
    if (n(T.RIVER) >= 3 || (n(T.DESERT) >= 20 && n(T.RIVER) + n(T.SWAMP) >= 1)) r.push('water');
    if (n(T.BEACH) >= 4 && sea >= 8 && (n(T.DESERT) + n(T.SAVANNA) + n(T.SWAMP) >= 4 || hash01(ci * 13 + seed) < 0.18)) r.push('salt');
    if (n(T.SEA) >= 10 && n(T.BEACH) + flat >= 12 && hash01(ci * 71 + seed * 7) < 0.3) r.push('harbor');
    if (r.length) res[ci] = r;
  }
  // 既存の鉱山の区画は鉄の鉱脈
  for (const b of w.buildings) if (b.type === 'mine') { const ci = chunkAt(b.x, b.z); res[ci] = [...new Set([...(res[ci] || []), 'ore', 'stone'])]; }
  return res;
}

// 区画の持ち主を変える（地図の kingdomOf もそろえる）
function setOwner(sim, ci, k, kind = 2, home = -1) {
  const S = sim.S, tr = S.territory, w = S.world;
  const old = tr.owner[ci];
  tr.owner[ci] = k; tr.kind[ci] = k < 0 ? 0 : kind; tr.home[ci] = home;
  syncChunk(w, ci, k);
  if (k >= 0) S.explored[ci] |= (1 << k) | WALKED;
  // 区画にある砦・小屋・鉱山は、新しい持ち主のものになる
  if (old !== k && k >= 0) for (const id of w.specials || []) {
    const b = w.buildings[id];
    if (!b || chunkAt(b.x, b.z) !== ci || !['fort', 'camp', 'mine', 'watchtower'].includes(b.type)) continue;
    b.kingdom = k;
    if (b.type === 'fort') { const cap = w.settlements.find((s) => s.type === 'capital' && s.kingdom === k); if (cap) b.capital = cap.id; }
  }
  S.expansion._borders = true;
  return old;
}
function syncChunk(w, ci, k) {
  const cx = ci % CW, cz = Math.floor(ci / CW);
  for (let z = cz * EXP_CS; z < cz * EXP_CS + EXP_CS; z++) for (let x = cx * EXP_CS; x < cx * EXP_CS + EXP_CS; x++) {
    if (!inb(x, z)) continue;
    const i = z * W + x, t = w.tiles[i];
    if (t === T.DEEP || t === T.WASTE || t === T.LAVA) continue;
    w.kingdomOf[i] = k;
  }
}
function syncAll(sim) { const tr = sim.S.territory; for (let ci = 0; ci < NC; ci++) syncChunk(sim.S.world, ci, tr.owner[ci]); }

// ---------- 参照 ----------
export function territoryOwner(sim, x, z) { const tr = sim.S.territory; return tr ? tr.owner[chunkAt(x, z)] : -1; }
export function isExplored(sim, x, z, k = null) {
  const e = sim.S.explored; if (!e) return true;
  const v = e[chunkAt(x, z)] || 0;
  return k == null ? v !== 0 : !!(v & (1 << k));
}
export function territorySize(sim, k) { const tr = sim.S.territory; return tr ? tr.owner.reduce((n, o) => n + (o === k ? 1 : 0), 0) : 0; }

// ---------- 毎時：歩いた所が知られていく ----------
export function expansionHourly(sim) {
  const S = sim.S;
  if (!S.expansion) return;
  const ex = S.explored, w = S.world;
  for (const p of sim.living()) {
    if (p.inside != null || p.jail != null || !p.pos) continue;
    const ci = chunkAt(p.pos.x, p.pos.z);
    const k = w.settlements[p.s]?.kingdom;
    if (k == null || k < 0) continue;
    const bit = 1 << k;
    if ((ex[ci] & bit) && (ex[ci] & WALKED)) continue;
    const fresh = !(ex[ci] & bit);
    ex[ci] |= bit | WALKED;
    // まわりの区画も、見晴らしのぶんだけ知られる
    for (const n of nbrs4(ci)) ex[n] |= bit;
    if (fresh) { S.expansion.stats.explored++; discovery(sim, p, ci, k); }
  }
}
// はじめて足を踏み入れた区画に目立つ資源があれば、噂になる
function discovery(sim, p, ci, k) {
  const X = sim.S.expansion, r = X.res[ci];
  if (!r || sim.S.territory.owner[ci] >= 0) return;
  const rare = r.find((x) => x === 'gem' || x === 'ore' || x === 'salt' || x === 'harbor');
  if (!rare) return;
  const c = cCenter(ci);
  const where = sim.placeName(c.x, c.z);
  X.found = X.found || {};
  if (X.found[ci]) return;
  X.found[ci] = sim.today;
  sim.remember(p, `${where}で${RES_NAME[rare]}らしきものを見つけた`, { emo: 0.6, imp: 0.6, k: 'frontier' });
  sim.pushLog(`${sim.fullName(p)}が、${where}で${RES_NAME[rare]}を見つけたという。${kname(k)}の役人が耳をそばだてている。`, 'event', [p.id], c);
}

// ---------- 行き先（placeFor の頭で呼ぶ） ----------
export function expansionPlace(sim, p, kind) {
  if (p.expProj == null) return null;
  const X = sim.S.expansion;
  const pr = X?.projects.find((q) => q.id === p.expProj);
  if (!pr || !['clear', 'fence', 'build'].includes(pr.stage)) return null;
  const camp = pr.camp != null ? sim.building(pr.camp) : null;
  if (kind === 'home') {
    const hh = sim.hh(p);
    if (hh && hh.house != null && p.s === pr.sid) return null;     // もう新しい家に住んでいる
    return camp ? { x: camp.door.x, z: camp.door.z, bld: camp.id } : null;
  }
  const jp = JOBS[p.job]?.place;
  if (kind === 'frontier' || kind === jp || kind === 'field' || kind === 'forest') {
    const spot = sim.randomNear(pr.x, pr.z, FR, (t, x, z) => cheb(x, z, pr.x, pr.z) < FR);
    return spot || (camp ? { x: camp.door.x, z: camp.door.z } : null);
  }
  return null;
}

// ---------- 1日ごと ----------
export function expansionDaily(sim) {
  const S = sim.S, X = ensureExpansion(sim);
  if (!S.kingdoms) return;
  const pop = popBySid(sim);
  watchCessions(sim);
  watchWars(sim);
  uprisings(sim);
  for (const k of S.kingdoms) {
    upkeep(sim, k);
    if ((sim.today + k.id * 2) % 5 === 0) planKingdom(sim, k, pop);
  }
  for (const pr of X.projects.slice()) stepProject(sim, pr, pop);
  resourceYields(sim, pop);
  diplomacy(sim);
  warFronts(sim);
  // 終わった計画は、しばらくしたら記録だけ残して片づける
  X.projects = X.projects.filter((pr) => !(['failed', 'done'].includes(pr.stage) && sim.today - pr.sday > 60));
  if (sim.today % 5 === 0) {
    X.hist.push({ d: sim.today, t: S.kingdoms.map((k) => territorySize(sim, k.id)), g: S.kingdoms.map((k) => Math.round(k.treasury)) });
    if (X.hist.length > 300) X.hist.shift();
  }
  for (const k of S.kingdoms) X.famePrev[k.id] = k.fame;
  if (X._borders) { X._borders = false; sim.events.push({ type: 'borders' }); }
}

function popBySid(sim) {
  const m = {};
  for (const p of sim.living()) m[p.s] = (m[p.s] || 0) + 1;
  return m;
}
function kingdomPop(sim, k, pop) { let n = 0; for (const s of sim.S.world.settlements) if (s.kingdom === k) n += pop[s.id] || 0; return n; }
function armySize(sim, kid) { let n = 0; for (const p of sim.living()) if (ARMY.has(p.job) && sim.town(p.s)?.kingdom === kid && p.jail == null) n += p.lv || 1; return n; }

// 広げた土地の治めにかかるお金（広がりすぎを抑える）
function upkeep(sim, k) {
  const tr = sim.S.territory;
  const extra = Math.max(0, territorySize(sim, k.id) - (tr.init[k.id] || 0));
  if (extra > 0) k.treasury -= extra * 0.25;
}

// ---------- 王の判断 ----------
function kingOf(sim, k) { const p = sim.S.people[k.kingId]; return p && p.deathYear == null ? p : null; }
function needs(sim, k, pop) {
  const S = sim.S;
  const towns = S.world.settlements.filter((s) => s.kingdom === k.id && !s.abandoned);
  const avg = (g) => towns.reduce((a, s) => a + (S.towns[s.id]?.stock[g] || 0), 0) / Math.max(1, towns.length);
  const bread = towns.reduce((a, s) => a + (S.towns[s.id]?.price.bread || 3), 0) / Math.max(1, towns.length);
  const hhs = Object.values(S.households).filter((h) => sim.town(h.s)?.kingdom === k.id && !h.royal && !h.bandits);
  const crowded = hhs.filter((h) => h.street || h.inn || h.house == null).length / Math.max(1, hhs.length);
  const king = kingOf(sim, k);
  const amb = king ? king.values.ambition : 0.5;
  return {
    ore: avg('ore') < 12 ? 2 : 0.7, timber: avg('wood') < 18 ? 1.6 : 0.6, stone: avg('stone') < 12 ? 1.2 : 0.5,
    fertile: 1 + (bread > 4 ? 1.5 : 0) + crowded * 3, water: KINGDOMS[k.id]?.south ? 1.6 : 0.7, salt: 0.9, harbor: towns.filter((s) => s.type === 'port').length <= 1 ? 0.8 : 0.4,
    gem: 0.4 + amb * 1.4, crowded,
  };
}

function planKingdom(sim, k, pop) {
  const S = sim.S, X = S.expansion, R = sim.rng;
  const king = kingOf(sim, k);
  if (!king) return;
  const amb = king.values.ambition, caution = (king.pers.N + (1 - king.values.courage)) / 2;
  if (sim.today - (X.lastFail[k.id] ?? -99) < 15) return;
  if (k.war && amb < 0.75) { X.decision = X.decision || {}; X.decision[k.id] = { d: sim.today, txt: '戦のさなかで、開拓どころではない' }; return; }
  // 魔王が目覚めているあいだは、よほど勇敢な王でなければ控えめに
  const demon = !!S.demon?.active;
  if (demon && king.values.courage < 0.3) return;
  const mine = X.projects.filter((p) => p.k === k.id && ACTIVE.has(p.stage));
  const sizes = S.kingdoms.map((o) => territorySize(sim, o.id));
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const mySize = sizes[k.id];
  const need = needs(sim, k, pop);
  // 国庫の備え：慎重な王ほど多く残し、野心的な王ほど攻める。小さな国は追いつこうとし、大きな国は治めに追われる
  let reserve = 750 + caution * 500 - amb * 300 + mine.length * 450 + (demon ? 300 : 0);
  if (mySize < avgSize * 0.85) reserve -= 150;
  if (mySize > avgSize * 1.25) reserve += 300;
  const maxActive = 1 + (amb > 0.65 && k.treasury > 1800 ? 1 : 0);
  let chance = 0.25 + amb * 0.45 + need.crowded * 0.4 - caution * 0.2;
  if (mySize < avgSize * 0.85) chance += 0.15;
  if (demon) chance *= 0.5;
  chance += Math.max(0, Math.min(0.3, (k.treasury - reserve) / 3000));   // 国庫が潤っているほど乗り気
  X.lastPlan[k.id] = sim.today;
  const note = (txt) => { X.decision = X.decision || {}; X.decision[k.id] = { d: sim.today, txt }; };
  // 砦で資源を先に押さえる
  const forts = X.projects.filter((p) => p.k === k.id && p.kind === 'fort' && p.stage !== 'failed').length;
  if (!mine.some((p) => p.kind === 'fort') && forts < 1 + Math.floor(amb * 3) && k.treasury > reserve * 0.6 + 260 && R.chance(0.15 + amb * 0.35)) {
    const t = pickFortSite(sim, k, need);
    if (t) { startFort(sim, k, t); return; }
  }
  if (mine.filter((p) => p.kind !== 'fort').length >= maxActive) return note('いまの開拓が落ち着くまで、新しい開拓は控える');
  if (k.treasury < reserve) return note(`国庫が${Math.round(reserve)}銅貨に届くまで、開拓は見送る`);
  if (!R.chance(Math.min(0.9, chance))) return note('今季は開拓を見送った');
  const cands = candidates(sim, k, need);
  if (!cands.length) {
    if (!mine.some((p) => p.kind === 'explore')) startExplore(sim, k);
    return note('開けそうな土地が見つからず、斥候に未踏の地を探らせる');
  }
  for (const c of cands.slice(0, 16)) {
    const site = findSite(sim, c.ci);
    if (!site) { X.bad = X.bad || {}; X.bad[c.ci] = sim.today; continue; }
    startVillage(sim, k, c, site);
    return note('新しい土地の開拓を決めた');
  }
  note('目をつけた土地は、どれも村を開くには向かなかった');
}

// 区画ごとの自国からの距離（区画の歩数）
function distFromOwn(sim, k, maxD) {
  const tr = sim.S.territory, d = new Array(NC).fill(99), q = [];
  for (let ci = 0; ci < NC; ci++) if (tr.owner[ci] === k) { d[ci] = 0; q.push(ci); }
  for (let h = 0; h < q.length; h++) {
    const ci = q[h]; if (d[ci] >= maxD) continue;
    for (const n of nbrs4(ci)) if (d[n] > d[ci] + 1) { d[n] = d[ci] + 1; q.push(n); }
  }
  return d;
}
function nearOthers(sim, k, ci, r = 2) {
  const tr = sim.S.territory, cx = ci % CW, cz = Math.floor(ci / CW), o = new Set();
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= CW || nz >= CHN) continue;
    const ow = tr.owner[nz * CW + nx];
    if (ow >= 0 && ow !== k) o.add(ow);
  }
  return [...o];
}
function candidates(sim, k, need) {
  const S = sim.S, X = S.expansion, tr = S.territory, w = S.world, ex = S.explored;
  const maxD = BIG ? 4 : 3;
  const d = distFromOwn(sim, k.id, maxD);
  const dm = S.dangerMap || [];
  const out = [];
  for (let ci = 0; ci < NC; ci++) {
    if (tr.owner[ci] !== -1 || d[ci] < 1 || d[ci] > maxD) continue;
    if (!(ex[ci] & (1 << k.id))) continue;
    if (X.bad?.[ci] != null && sim.today - X.bad[ci] < 80) continue;
    if (X.projects.some((p) => p.ci === ci && p.stage !== 'failed' && p.stage !== 'done')) continue;
    const c = cCenter(ci);
    if (w.demon && Math.hypot(c.x - w.demon.x, c.z - w.demon.z) < (w.demonR || 20) + 14) continue;
    if (w.settlements.some((s) => cheb(s.x, s.z, c.x, c.z) < s.r + FR + 3)) continue;
    const danger = dm[ci] || 0;
    if (danger > 7) continue;
    let sc = 0;
    for (const r of X.res[ci] || []) sc += need[r] || 0.5;
    for (const n of nbrs4(ci)) for (const r of X.res[n] || []) sc += (need[r] || 0.5) * 0.3;
    sc += buildableFrac(w, ci) * 3 - danger * 0.45 - d[ci] * 0.9;
    const others = nearOthers(sim, k.id, ci);
    if (others.length) sc += (kingOf(sim, k)?.values.ambition || 0.5) * 1.2 - 0.3;   // 他国より先に押さえる
    out.push({ ci, sc: sc + sim.rng.next() * 0.6, others });
  }
  return out.sort((a, b) => b.sc - a.sc);
}
function buildableFrac(w, ci) {
  const cx = ci % CW, cz = Math.floor(ci / CW); let n = 0;
  for (let z = cz * EXP_CS; z < cz * EXP_CS + EXP_CS; z++) for (let x = cx * EXP_CS; x < cx * EXP_CS + EXP_CS; x++) { if (!inb(x, z)) continue; const t = w.tiles[z * W + x]; if (BUILDABLE.has(t) || CLEARABLE.has(t)) n++; }
  return n / (EXP_CS * EXP_CS);
}

// 村の敷地：柵の内側に建物・畑・城壁がなく、6割以上が（伐れば）建てられる土地。広場になる真ん中の3×3は必ず平地
const HARD = new Set([T.BLD, T.WALL, T.FENCE, T.FIELD, T.PASTURE, T.PLAZA, T.DOCK, T.LAVA, T.WASTE]);
function findSite(sim, ci) {
  const w = sim.S.world, c = cCenter(ci);
  const area = (2 * FR + 1) * (2 * FR + 1);
  let best = null, bs = -1e9;
  for (let z = c.z - 8; z <= c.z + 8; z++) for (let x = c.x - 8; x <= c.x + 8; x++) {
    if (x - FR - 3 < 1 || z - FR - 3 < 1 || x + FR + 3 >= W - 1 || z + FR + 3 >= H - 1) continue;
    let core = true;
    for (let dz = -1; dz <= 1 && core; dz++) for (let dx = -1; dx <= 1; dx++) { const t = w.tiles[(z + dz) * W + x + dx]; if (!(BUILDABLE.has(t) || CLEARABLE.has(t) || t === T.ROAD)) { core = false; break; } }
    if (!core) continue;
    let ok = 0, soft = 0, hard = 0, forest = 0, river = 0, road = 0;
    for (let dz = -FR; dz <= FR && !hard; dz++) for (let dx = -FR; dx <= FR; dx++) {
      const t = w.tiles[(z + dz) * W + x + dx];
      if (HARD.has(t)) { hard++; break; }
      if (BUILDABLE.has(t)) ok++;
      else if (CLEARABLE.has(t)) { ok++; forest++; }
      else if (t === T.ROAD || t === T.BRIDGE) { ok++; road++; }
      else soft++;
    }
    if (hard || soft > area * 0.4) continue;
    for (let dz = -FR - 4; dz <= FR + 4; dz += 2) for (let dx = -FR - 4; dx <= FR + 4; dx += 2) if (inb(x + dx, z + dz) && w.tiles[(z + dz) * W + x + dx] === T.RIVER) river++;
    if ((w.specials || []).some((id) => { const b = w.buildings[id]; return b && cheb(b.x, b.z, x, z) < FR + 3; })) continue;
    if (w.settlements.some((s) => cheb(s.x, s.z, x, z) < s.r + FR + 3)) continue;
    const sc = ok - soft * 2 - forest * 0.15 + Math.min(river, 4) * 3 + Math.min(road, 6) * 0.5 - Math.hypot(x - c.x, z - c.z) * 0.3;
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best;
}

function pickFortSite(sim, k, need) {
  const S = sim.S, X = S.expansion, tr = S.territory, w = S.world;
  const d = distFromOwn(sim, k.id, 3);
  let best = null, bs = 0;
  for (const [cis, list] of Object.entries(X.res)) {
    const ci = +cis;
    if (tr.owner[ci] !== -1 || d[ci] < 1 || d[ci] > 3 || !(S.explored[ci] & (1 << k.id))) continue;
    if (!list.some((r) => ['ore', 'gem', 'salt', 'harbor', 'fertile', 'water'].includes(r))) continue;
    const others = nearOthers(sim, k.id, ci, 3);
    if (!others.length) continue;   // 争いのない所に砦はいらない
    if (X.projects.some((p) => p.ci === ci && !['failed', 'done'].includes(p.stage))) continue;
    if (X.bad?.[ci] != null && sim.today - X.bad[ci] < 80) continue;
    if (buildableFrac(w, ci) < 0.15) continue;
    const c = cCenter(ci);
    if (w.settlements.some((s) => cheb(s.x, s.z, c.x, c.z) < s.r + 6)) continue;
    const sc = list.reduce((a, r) => a + (need[r] || 0.5), 0) + others.length - d[ci] * 0.5 + sim.rng.next();
    if (sc > bs) { bs = sc; best = { ci, others, res: list }; }
  }
  return best;
}

// ---------- 計画の開始 ----------
function newProject(sim, k, kind, ci, extra = {}) {
  const X = sim.S.expansion;
  const pr = { id: X.seq++, kind, k: k.id, ci, stage: kind === 'explore' ? 'explore' : kind === 'fort' ? 'fortbuild' : 'scout', day0: sim.today, sday: sim.today, members: [], units: [], morale: 1, spent: 0, attacks: 0, deaths: 0, name: null, ...extra };
  X.projects.push(pr);
  return pr;
}
function spend(sim, k, pr, amt) { k.treasury -= amt; if (pr) pr.spent += amt; }
function dirWord(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const a = Math.atan2(dz, dx) * 180 / Math.PI;
  const dirs = ['東', '南東', '南', '南西', '西', '北西', '北', '北東'];
  return dirs[((Math.round(a / 45) % 8) + 8) % 8];
}
function featureOf(w, x, z) {
  const c = {};
  for (let dz = -FR - 3; dz <= FR + 3; dz++) for (let dx = -FR - 3; dx <= FR + 3; dx++) { if (!inb(x + dx, z + dz)) continue; const t = w.tiles[(z + dz) * W + x + dx]; c[t] = (c[t] || 0) + 1; }
  const n = (t) => c[t] || 0;
  if (n(T.RIVER) >= 4) return 'river';
  if (n(T.SEA) + n(T.BEACH) >= 20) return 'coast';
  if (n(T.SWAMP) >= 12) return 'swamp';
  if (n(T.ROCK) + n(T.PEAK) >= 25) return 'rock';
  if (n(T.SNOW) >= 60) return 'snow';
  if (n(T.DESERT) >= 60) return 'desert';
  if (n(T.JUNGLE) >= 40) return 'jungle';
  if (n(T.FOREST) + n(T.DENSE) >= 60) return 'forest';
  return 'grass';
}
const FEATURE_WORD = { river: '川辺', coast: '浜辺', swamp: '沼地', rock: '岩山のふもと', snow: '雪原', desert: '砂地', jungle: '密林', forest: '森', grass: '野原' };

function startExplore(sim, k) {
  const S = sim.S, tr = S.territory, ex = S.explored;
  const d = distFromOwn(sim, k.id, 6);
  const opts = [];
  for (let ci = 0; ci < NC; ci++) if (d[ci] >= 2 && d[ci] <= 5 && !(ex[ci] & (1 << k.id)) && tr.owner[ci] === -1) opts.push(ci);
  if (!opts.length) return;
  const ci = sim.rng.pick(opts);
  const scout = pickScout(sim, k, cCenter(ci));
  if (!scout) return;
  const pr = newProject(sim, k, 'explore', ci, { scout: scout.id, from: scout.s });
  spend(sim, k, pr, 25);
  const c = cCenter(ci);
  scout.mission = { type: 'travel', x: c.x, z: c.z, until: S.t + 14 * 60 };
  scout.action = null;
  earn(sim, scout, 15, 0.6);
  sim.remember(scout, `${kname(k.id)}から、未開の${dirWord(sim.town(scout.s), c)}の地を探る役目を仰せつかった`, { emo: 0.4, imp: 0.6, k: 'frontier' });
  sim.pushLog(`${kname(k.id)}が、${sim.fullName(scout)}を斥候として${dirWord(sim.town(scout.s), c)}の未踏の地へ送り出した。`, 'event', [scout.id], scout.pos);
}
function pickScout(sim, k, near) {
  const L = sim.living().filter((p) => sim.town(p.s)?.kingdom === k.id && sim.isAdult(p) && sim.ageOf(p) < 55 && p.jail == null && !p.mission && p.expProj == null && !p.quest
    && ['hunter', 'adventurer', 'archer', 'warrior', 'soldier', 'militia', 'woodcutter', 'pioneer', 'gatherer'].includes(p.job));
  if (!L.length) return null;
  return L.sort((a, b) => Math.hypot(sim.town(a.s).x - near.x, sim.town(a.s).z - near.z) - Math.hypot(sim.town(b.s).x - near.x, sim.town(b.s).z - near.z) - (b.values.courage - a.values.courage) * 20)[0];
}

function startVillage(sim, k, c, site) {
  const S = sim.S, w = S.world;
  const from = w.settlements.filter((s) => s.kingdom === k.id && !s.abandoned).sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
  if (!from) return;
  const pr = newProject(sim, k, 'village', c.ci, { x: site.x, z: site.z, from: from.id, res: S.expansion.res[c.ci] || [], others: c.others, feature: featureOf(w, site.x, site.z) });
  pr.dir = dirWord(sim.town(k.capital), site);
  const scout = pickScout(sim, k, site);
  if (scout) {
    pr.scout = scout.id;
    scout.mission = { type: 'travel', x: site.x, z: site.z, until: S.t + 12 * 60 };
    scout.action = null;
    earn(sim, scout, 10, 0.6);
    sim.remember(scout, `${pr.dir}の${FEATURE_WORD[pr.feature]}に村を開けるか、下見を命じられた`, { emo: 0.3, imp: 0.5, k: 'frontier' });
  }
  spend(sim, k, pr, 20);
  const king = kingOf(sim, k);
  sim.pushLog(`${kname(k.id)}の${king?.sex === 'f' ? '女王' : '王'}${king?.given || ''}が、${pr.dir}の${FEATURE_WORD[pr.feature]}を開拓する計画を立てた。まずは斥候が下見に向かう。`, 'event', scout ? [scout.id] : [], site);
}

function startFort(sim, k, t) {
  const S = sim.S;
  const c = cCenter(t.ci);
  const pr = newProject(sim, k, 'fort', t.ci, { x: c.x, z: c.z, res: t.res, others: t.others });
  spend(sim, k, pr, 180);
  const r = t.res.find((x) => ['ore', 'gem', 'salt', 'harbor'].includes(x)) || t.res[0];
  pr.dir = dirWord(sim.town(k.capital), c);
  pr.name = `${kshort(k.id)}の${pr.dir}方${RES_FORT[r]}`;
  pr.resName = RES_NAME[r];
  sim.news(`${kname(k.id)}が、${pr.dir}の国境の${RES_NAME[r]}を押さえるため砦を築き始めた`, 2, c);
  for (const o of t.others) protest(sim, o, k.id, t.ci, `${RES_NAME[r]}に砦を築く`);
}

// ---------- 計画を1日進める ----------
function stepProject(sim, pr, pop) {
  const S = sim.S, k = S.kingdoms[pr.k];
  if (!k || pr.stage === 'failed' || pr.stage === 'done') return;
  switch (pr.stage) {
    case 'explore': return stepExplore(sim, pr, k);
    case 'fortbuild': return stepFort(sim, pr, k);
    case 'scout': return stepScout(sim, pr, k);
    case 'recruit': return stepRecruit(sim, pr, k);
    case 'clear': case 'fence': case 'build': return stepWork(sim, pr, k, pop);
    case 'settle': return stepSettle(sim, pr, k, pop);
  }
}
function setStage(sim, pr, st) { pr.stage = st; pr.sday = sim.today; pr.morale = Math.min(1.2, pr.morale + 0.1); }

function reveal(sim, k, ci, r, walked = false) {
  const ex = sim.S.explored, cx = ci % CW, cz = Math.floor(ci / CW);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= CW || nz >= CHN) continue;
    ex[nz * CW + nx] |= (1 << k) | (walked && Math.abs(dx) + Math.abs(dz) <= 1 ? WALKED : 0);
  }
}

function stepExplore(sim, pr, k) {
  if (sim.today - pr.sday < 2) return;
  const scout = sim.S.people[pr.scout];
  const c = cCenter(pr.ci);
  const from = sim.town(pr.from);
  // 出発地から目的地までの道すじの区画も知られる
  for (let t = 0; t <= 1; t += 0.1) reveal(sim, pr.k, chunkAt(from.x + (c.x - from.x) * t, from.z + (c.z - from.z) * t), 1);
  reveal(sim, pr.k, pr.ci, 2, true);
  if (scout && scout.deathYear == null) {
    const found = [];
    const cx = pr.ci % CW, cz = Math.floor(pr.ci / CW);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const n = (cz + dz) * CW + cx + dx; if (n >= 0 && n < NC) for (const r of sim.S.expansion.res[n] || []) found.push(RES_NAME[r]); }
    const uniq = [...new Set(found)].slice(0, 3);
    sim.remember(scout, `未開の${sim.placeName(c.x, c.z)}を歩き回り、${uniq.length ? uniq.join('・') + 'を見つけて' : '地図を描いて'}戻った`, { emo: 0.5, imp: 0.65, k: 'frontier' });
    scout.fame = (scout.fame || 0) + 3;
    sim.pushLog(`斥候の${sim.fullName(scout)}が未開の地から戻り、${kname(pr.k)}の地図が少し広がった${uniq.length ? `（${uniq.join('・')}）` : ''}。`, 'event', [scout.id], scout.pos);
  }
  pr.stage = 'done'; pr.sday = sim.today;
}

function stepScout(sim, pr, k) {
  if (sim.today - pr.sday < 2) return;
  const S = sim.S, R = sim.rng;
  reveal(sim, pr.k, pr.ci, 1, true);
  const scout = S.people[pr.scout];
  const danger = S.dangerMap?.[pr.ci] || 0;
  if (scout && scout.deathYear == null && danger > 3 && R.chance(0.25)) {
    if (danger > 6 && R.chance(0.3)) {
      sim.die(scout, 'monster');
      sim.news(`${kname(pr.k)}の斥候${scout.given}が、${pr.dir}の未開の地から戻らなかった`, 2, { x: pr.x, z: pr.z });
      return fail(sim, pr, '斥候が魔物に襲われ、計画は見送られた', true);
    }
    scout.hp = Math.max(1, Math.round(scout.hp * 0.5));
    sim.remember(scout, `${pr.dir}の未開の地の下見で魔物に襲われ、命からがら逃げ帰った`, { emo: -0.7, imp: 0.7, k: 'frontier' });
  }
  if (danger > 5.5 && (kingOf(sim, k)?.pers.N || 0.5) > 0.5) return fail(sim, pr, '魔物の多い土地だとわかり、王が計画を取りやめた', true);
  if (scout && scout.deathYear == null) sim.remember(scout, `${pr.dir}の${FEATURE_WORD[pr.feature]}を下見して、村を開けそうだと報告した`, { emo: 0.4, imp: 0.5, k: 'frontier' });
  setStage(sim, pr, 'recruit');
  const shikaku = 25;
  pr.grant = shikaku;
  const town = sim.town(pr.from);
  sim.news(`${kname(pr.k)}が${pr.dir}の${FEATURE_WORD[pr.feature]}を切り開く開拓団を募っている（支度金${shikaku}銅貨）`, 1, town);
  for (const p of sim.living()) if (sim.town(p.s)?.kingdom === pr.k && sim.isAdult(p) && R.chance(0.25)) sim.remember(p, `${pr.dir}の開拓団の募集の触れ書きを見た`, { emo: 0.1, imp: 0.3, k: 'frontier' });
}

// 開拓団の募集：貧しい家・次男三男・宿なし・移民が応じる
function stepRecruit(sim, pr, k) {
  if (sim.today - pr.sday < 2) return;
  const S = sim.S, R = sim.rng;
  const L = sim.living();
  const king = kingOf(sim, k);
  const target = 4 + Math.round((king?.values.ambition || 0.5) * 3);
  const olderBrother = (p) => {
    const f = S.people[p.fatherId]; if (!f) return false;
    return f.children.some((id) => { const q = S.people[id]; return q && q !== p && q.deathYear == null && q.sex === 'm' && q.birthYear < p.birthYear; });
  };
  const scored = [];
  for (const p of L) {
    const s = sim.town(p.s);
    if (!s || s.kingdom !== pr.k || s.abandoned || !sim.isAdult(p) || sim.ageOf(p) > 45 || p.jail != null || p.mission || p.expProj != null || p.quest || p.crusade) continue;
    if (NO_SETTLER.has(p.job) || SENIOR_JOBS.has(p.job) || ['king', 'royal', 'noble', 'knight', 'prisoner', 'outlaw'].includes(p.rank)) continue;
    const hh = sim.hh(p);
    if (!hh || hh.royal || hh.bandits || hh.wander || hh.expProj != null) continue;
    let sc = p.values.courage * 1.6 + p.pers.O + p.values.ambition * 0.8 - p.values.family * 0.6;
    if (hh.money < 60) sc += 1.5;
    if (hh.street || hh.inn || hh.house == null || p.rank === 'homeless') sc += 2.5;
    if (p.sex === 'm' && p.spouseId == null && sim.ageOf(p) <= 32 && olderBrother(p)) sc += 2;
    if (['farmer', 'pioneer', 'woodcutter', 'carpenter', 'mason', 'hunter', 'charcoal', 'gatherer'].includes(p.job)) sc += 0.8;
    if (p.origin) sc += 0.7;
    if (hh.members.length >= 6) sc += 0.6;
    if (s.id === pr.from) sc += 0.5;
    sc += R.next() * 1.2;
    if (sc > 3.3) scored.push({ p, sc });
  }
  scored.sort((a, b) => b.sc - a.sc);
  let adults = 0;
  const units = [];
  const taken = new Set();
  for (const { p } of scored) {
    if (adults >= target) break;
    if (taken.has(p.id)) continue;
    const hh = sim.hh(p);
    const spouse = p.spouseId != null ? S.people[p.spouseId] : null;
    // 夫婦者は家族ごと（ただし親の家に同居している夫婦は、夫婦と子だけで出る）
    if (spouse && spouse.deathYear == null && spouse.hh === p.hh) {
      const fam = hh.members.map((id) => S.people[id]).filter((q) => q && q.deathYear == null && (q === p || q === spouse || ((q.fatherId === p.id || q.motherId === p.id || q.fatherId === spouse.id || q.motherId === spouse.id) && q.spouseId == null)));
      if (fam.some((q) => taken.has(q.id))) continue;
      const whole = fam.length === hh.members.length;
      units.push({ type: whole ? 'hh' : 'split', hh: hh.id, ids: fam.map((q) => q.id) });
      for (const q of fam) { taken.add(q.id); if (sim.isAdult(q)) adults++; }
    } else {
      units.push({ type: hh.members.length === 1 ? 'hh' : 'single', hh: hh.id, ids: [p.id] });
      taken.add(p.id); adults++;
    }
  }
  if (adults < 2 || (adults < 3 && (king?.values.ambition || 0) < 0.6)) {
    return fail(sim, pr, `開拓団の募集に人が集まらず（${adults}人）、計画は見送られた`, true);
  }
  pr.units = units;
  pr.members = [...taken];
  // 団長：勇気と野心と年の功
  const adultsL = pr.members.map((id) => S.people[id]).filter((q) => sim.isAdult(q));
  const leader = adultsL.sort((a, b) => (b.values.courage + b.values.ambition + Math.min(sim.ageOf(b), 45) / 45 + (b.job === 'pioneer' ? 0.5 : 0)) - (a.values.courage + a.values.ambition + Math.min(sim.ageOf(a), 45) / 45 + (a.job === 'pioneer' ? 0.5 : 0)))[0];
  pr.leader = leader.id;
  pr.name = villageName(sim, pr, leader);
  for (const u of units) {
    const hh = S.households[u.hh];
    if (u.type === 'hh') hh.expProj = pr.id;
    const adultsN = u.ids.filter((id) => sim.isAdult(S.people[id])).length;
    const g = pr.grant * adultsN;
    spend(sim, k, pr, g);
    hh.money += g;
  }
  for (const id of pr.members) {
    const p = S.people[id];
    p.expProj = pr.id;
    p.action = null;
    if (sim.isAdult(p) && p.job && !KEEP_JOBS.has(p.job)) { p.expPrevJob = p.job; p.job = 'pioneer'; p.skill[p.job] = p.skill[p.job] || 0.3; }
    else if (sim.isAdult(p) && !p.job) { p.job = 'pioneer'; p.skill.pioneer = 0.3; }
    if (sim.isAdult(p)) {
      const why = p.rank === 'homeless' || sim.hh(p)?.street ? '家のない暮らしから抜け出したくて' : sim.hh(p)?.money < 60 ? '貧しさから抜け出したくて' : p.sex === 'm' && p.spouseId == null ? '家を継げない身で、自分の土地がほしくて' : '新しい土地で一からやり直したくて';
      sim.remember(p, `${why}、${pr.name}を開く開拓団に加わった`, { emo: 0.6, imp: 0.9, k: 'frontier' });
      p.deeds.push(`${pr.name}を切り開いた開拓団のひとりだった`);
    }
  }
  leader.deeds[leader.deeds.length - 1] = `${pr.name}を切り開いた開拓団の団長だった`;
  leader.fame = (leader.fame || 0) + 10;
  sim.remember(leader, `${pr.name}を開く開拓団の団長に選ばれた`, { emo: 0.8, imp: 1, k: 'frontier' });
  sim.gossip(leader, `${pr.dir}の開拓団の団長になった`, 0.5, L.filter((q) => q.s === leader.s && R.chance(0.5)), { silent: true });
  sim.news(`${kname(pr.k)}の開拓団（${adults}人・団長${sim.fullName(leader)}）が、${pr.dir}の${FEATURE_WORD[pr.feature]}へ出発した`, 2, { x: pr.x, z: pr.z });
  setStage(sim, pr, 'clear');
  beginClear(sim, pr, k);
}

function villageName(sim, pr, leader) {
  const w = sim.S.world, R = sim.rng;
  const south = KINGDOMS[pr.k]?.south;
  const taken = new Set(w.settlements.map((s) => s.name.replace(/(村|町)(（廃村）)?$/, '')));
  const N = { forest: ['ヴァルト', 'ホルツ', 'ブッシュ'], river: ['バッハ', 'ブルック', 'フルト'], grass: ['フェルト', 'アウ', 'ヴィーゼ'], rock: ['ベルク', 'シュタイン', 'ヒューゲル'], snow: ['シュネー', 'アイスフェルト'], coast: ['シュトラント', 'ハーフェン'], swamp: ['モーア', 'ブルーフ'], desert: ['ザント'], jungle: ['ヴァルト'] };
  const SO = { forest: 'ガーバ', river: 'ワディ', grass: 'マルジュ', rock: 'ジャバル', desert: 'ラムル', coast: 'サーヒル', swamp: 'バトハ', snow: 'サルジュ', jungle: 'ガーバ' };
  for (let i = 0; i < 12; i++) {
    let base;
    if (south) base = R.chance(0.7) ? `${SO[pr.feature] || 'アイン'}・${leader.given}` : `アイン・${R.pick(['ヌール', 'サファ', 'ラハ', leader.given])}`;
    else base = R.chance(0.65) ? `${leader.given}${R.pick(N[pr.feature] || N.grass)}` : `ノイ${R.pick(N[pr.feature] || N.grass).replace(/^./, (c) => c)}`;
    if (!taken.has(base)) return `${base}村`;
  }
  return `${leader.given}${pr.id}村`;
}

// 伐採：柵の内側と、そのまわり1マスの森を伐る。開拓小屋を建てる
function beginClear(sim, pr, k) {
  const S = sim.S, w = S.world;
  const camp = placeBox(sim, 'camp', `${pr.name.replace(/村$/, '')}開拓団の小屋`, pr.x - FR + 1, pr.z - FR + 1, 2, 2, { kingdom: pr.k, home: pr.from, camp: true, special: true, exp: pr.id });
  if (camp) {
    pr.camp = camp.id;
    (w.specials = w.specials || []).push(camp.id);
    (w.camps = w.camps || []).push(camp.id);
  }
  claimAround(sim, pr, FR + 3, -1);
  pr.clear = [];
  for (let dz = -FR - 1; dz <= FR + 1; dz++) for (let dx = -FR - 1; dx <= FR + 1; dx++) {
    const x = pr.x + dx, z = pr.z + dz;
    if (inb(x, z) && CLEARABLE.has(w.tiles[z * W + x])) pr.clear.push(z * W + x);
  }
  pr.clear.sort((a, b) => cheb(a % W, (a / W) | 0, pr.x, pr.z) - cheb(b % W, (b / W) | 0, pr.x, pr.z));
  pr.cleared = 0;
}

// 開拓地のまわりの区画を自国の領土にする（ほかの国に近ければ抗議される）
function claimAround(sim, pr, rad, home) {
  const tr = sim.S.territory;
  const got = [];
  for (const [dx, dz] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad], [0, 0]]) {
    const ci = chunkAt(pr.x + dx, pr.z + dz);
    if (tr.owner[ci] === -1 && !got.includes(ci)) { setOwner(sim, ci, pr.k, 2, home); got.push(ci); }
    else if (tr.owner[ci] === pr.k && home >= 0 && tr.kind[ci] === 2) tr.home[ci] = home;
  }
  const others = new Set();
  for (const ci of got) for (const o of nearOthers(sim, pr.k, ci, 1)) others.add(o);
  for (const o of others) protest(sim, o, pr.k, got[0], `${pr.name || '開拓地'}を開く`);
  return got;
}

// 抗議：国境の近くを勝手に押さえられた国が抗議する
function protest(sim, by, against, ci, what) {
  const S = sim.S, X = S.expansion;
  const key = `${Math.min(by, against)}-${Math.max(by, against)}`;
  X.tension[key] = (X.tension[key] || 0) + 2;
  const a = S.kingdoms[by], b = S.kingdoms[against];
  if (!a || !b) return;
  a.relations[b.id] = Math.max(-100, a.relations[b.id] - 6);
  b.relations[a.id] = Math.max(-100, b.relations[a.id] - 2);
  if (sim.today - (X.lastProtest[key] || -99) < 6) return;
  X.lastProtest[key] = sim.today;
  X.stats.protests++;
  const c = cCenter(ci);
  sim.news(`${a.name}が、${b.name}が国境近くで${what}ことに抗議した`, 1, c);
  const king = kingOf(sim, a);
  if (king) sim.remember(king, `${b.name}が国境の近くで${what}のを、黙って見てはいられない`, { emo: -0.5, imp: 0.6, k: 'politics' });
}

// 労働の力：団員の大人が1日にこなす量（伐採のマス数）
function laborOf(sim, pr) {
  const S = sim.S;
  let n = 0;
  for (const id of pr.members) {
    const p = S.people[id];
    if (!p || p.deathYear != null || !sim.isAdult(p) || p.jail != null) continue;
    const base = ['woodcutter', 'pioneer', 'charcoal'].includes(p.job) ? 7 : ['carpenter', 'mason'].includes(p.job) ? 6 : 5;
    n += base * (p.hp < (p.maxhp || 1) * 0.5 ? 0.3 : 1) * (0.7 + (p.pers?.C || 0.5) * 0.6);
  }
  const season = sim.seasonIdx();
  const mul = season === 3 ? 0.55 : season === 0 ? 1 : 1.05;
  return n * mul * Math.max(0.3, Math.min(1.2, pr.morale));
}
function aliveMembers(sim, pr) { return pr.members.map((id) => sim.S.people[id]).filter((p) => p && p.deathYear == null); }

function stepWork(sim, pr, k, pop) {
  const S = sim.S, w = S.world, R = sim.rng;
  const alive = aliveMembers(sim, pr);
  const adults = alive.filter((p) => sim.isAdult(p));
  if (adults.length < 2 && pr.stage !== 'build') return fail(sim, pr, '働き手が足りなくなり、開拓団は解散した');
  if (!adults.length) return fail(sim, pr, '開拓団の大人がひとりもいなくなった');
  // 国庫が尽きると、手当も資材も止まる
  if (k.treasury < 40) { pr.morale -= 0.05; if (R.chance(0.3)) for (const p of adults) sim.remember(p, '国からの手当が止まり、開拓地の暮らしが苦しくなった', { emo: -0.5, imp: 0.4, k: 'frontier' }); if (pr.morale <= 0) return fail(sim, pr, '国の手当が尽き、開拓団は散り散りになった'); return; }
  for (const p of adults) { earn(sim, p, 2, 0.5); spend(sim, k, pr, 2); }
  if (attackCheck(sim, pr, k)) return;
  let labor = laborOf(sim, pr);
  const changed = [];
  if (pr.stage === 'clear') {
    const m = sim.market(pr.from);
    while (labor >= 1 && pr.clear.length) {
      const i = pr.clear.shift();
      if (!CLEARABLE.has(w.tiles[i])) continue;
      w.tiles[i] = T.GRASS; changed.push(i); labor -= 1; pr.cleared++;
      if (m) m.stock.wood += 1.2;
      k.treasury += 0.8;   // 伐った木を売った代金の一部は国のもの
    }
    if (R.chance(0.15)) toil(sim, pr, adults, 'clear');
    if (!pr.clear.length) {
      sim.pushLog(`${pr.name}の開拓団が、${pr.cleared}マスの木を伐り倒して土地をならした。`, 'event', [pr.leader], { x: pr.x, z: pr.z });
      setStage(sim, pr, 'fence');
      beginFence(sim, pr);
    }
  } else if (pr.stage === 'fence') {
    const m = sim.market(pr.from);
    while (labor >= 1 && pr.fence.length) {
      const i = pr.fence.shift();
      const t = w.tiles[i];
      if (!(BUILDABLE.has(t) || CLEARABLE.has(t) || t === T.ROCK || t === T.SWAMP)) continue;
      if (m && m.stock.wood >= 1) { m.stock.wood -= 1; spend(sim, k, pr, m.price.wood * 0.5); } else spend(sim, k, pr, GOODS.wood.base * 1.6);
      w.tiles[i] = T.FENCE; changed.push(i); labor -= 1.5;
    }
    if (R.chance(0.12)) toil(sim, pr, adults, 'fence');
    if (!pr.fence.length) {
      // 見張り櫓（柵の内側の角）
      const tw = placeBox(sim, 'watchtower', '見張り櫓', pr.x + FR - 2, pr.z - FR + 1, 1, 1, { open: true, kingdom: pr.k });
      if (tw) { pr.tower = tw.id; spend(sim, k, pr, 40); }
      for (const p of adults) sim.remember(p, `${pr.name}の柵が一周つながり、みんなで歓声を上げた`, { emo: 0.8, imp: 0.7, k: 'frontier' });
      sim.pushLog(`${pr.name}のまわりに柵と見張り櫓ができた。これで夜も少しは安心して眠れる。`, 'event', [pr.leader], { x: pr.x, z: pr.z });
      setStage(sim, pr, 'build');
      found(sim, pr, k);
    }
  } else if (pr.stage === 'build') {
    buildQueue(sim, pr, k, labor, changed);
  }
  if (changed.length) { sim.events.push({ type: 'tiles', list: changed }); S.expansion._borders = true; }
}

const TOIL = {
  clear: ['一日じゅう斧を振るって、手のひらが豆だらけになった', '切り株を掘り起こすのに、三人がかりで半日かかった', '雨漏りする小屋で、みんなで身を寄せ合って眠った', '倒した大木の下敷きになりかけて、肝を冷やした', '森を伐り開くたびに、空が広くなっていくのがうれしかった'],
  fence: ['夜、柵の外で獣の遠吠えが聞こえて眠れなかった', '杭を打ち込む音が、日暮れまで森に響いていた', '柵の杭が足りず、また木を伐りに戻った'],
  build: ['自分たちの手で建てた家に、はじめて火を入れた', '井戸を掘り当てて、冷たい水をみんなで回し飲みした', '開拓地の畑に、はじめて芽が出た', '故郷の家族に、新しい村の様子を書き送った'],
};
function toil(sim, pr, adults, kind) {
  const p = sim.rng.pick(adults);
  const txt = sim.rng.pick(TOIL[kind]);
  sim.remember(p, txt, { emo: /うれし|はじめて|歓声|回し飲み/.test(txt) ? 0.6 : -0.3, imp: 0.5, k: 'frontier' });
}

// 魔物の襲撃（柵ができると、ぐっと減る）
function attackCheck(sim, pr, k) {
  const S = sim.S, R = sim.rng;
  const danger = S.dangerMap?.[chunkAt(pr.x, pr.z)] || 0;
  let hostile = 0;
  for (const c of Object.values(S.creatures)) if (c.hostile && !c.dormant && c.hp > 0 && Math.abs(c.pos.x - pr.x) < 16 && Math.abs(c.pos.z - pr.z) < 16) hostile++;
  const fenced = pr.stage === 'build' || pr.stage === 'settle';
  let p = Math.min(0.3, danger * 0.02 + hostile * 0.03 + 0.008) * (fenced ? 0.35 : 1) * (pr.tower != null ? 0.8 : 1);
  if (!R.chance(p)) return false;
  S.expansion.stats.attacks++;
  pr.attacks++;
  const alive = aliveMembers(sim, pr).filter((q) => sim.isAdult(q));
  if (!alive.length) return false;
  const v = R.pick(alive);
  const strong = (JOBS[v.job]?.combat || 0) >= 2 || (v.lv || 1) >= 5;
  const where = pr.name || '開拓地';
  if (strong && R.chance(0.6)) {
    sim.remember(v, `${where}に出た魔物を、みんなで追い払った`, { emo: 0.4, imp: 0.6, k: 'frontier' });
    pr.morale -= 0.03;
    return false;
  }
  if ((danger > 3 || hostile > 2) && R.chance(0.18)) {
    sim.die(v, 'monster');
    pr.deaths++; S.expansion.stats.deaths++;
    pr.morale -= 0.3;
    sim.news(`${where}が魔物に襲われ、開拓者の${sim.fullName(v)}が命を落とした`, 2, { x: pr.x, z: pr.z });
    for (const q of alive) if (q !== v) sim.remember(q, `${where}で仲間の${v.given}が魔物に殺された`, { emo: -0.9, imp: 0.9, k: 'frontier', about: [v.id] });
  } else {
    v.hp = Math.max(1, Math.round((v.hp || 20) * 0.55));
    pr.morale -= 0.12;
    sim.pushLog(`${where}に魔物が出て、${sim.fullName(v)}がけがをした。`, 'event', [v.id], { x: pr.x, z: pr.z });
    sim.remember(v, `${where}で魔物に襲われ、けがをした`, { emo: -0.7, imp: 0.7, k: 'frontier' });
  }
  if (pr.morale <= 0) { fail(sim, pr, '度重なる魔物の襲撃に耐えきれなかった'); return true; }
  return false;
}

function beginFence(sim, pr) {
  const w = sim.S.world;
  pr.fence = [];
  pr.gates = [];
  for (let dz = -FR; dz <= FR; dz++) for (let dx = -FR; dx <= FR; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== FR) continue;
    const x = pr.x + dx, z = pr.z + dz, i = z * W + x;
    const gate = (dx === 0 || dz === 0);
    const t = w.tiles[i];
    if (gate || t === T.ROAD || t === T.BRIDGE) {
      if (BUILDABLE.has(t) || CLEARABLE.has(t)) w.tiles[i] = T.ROAD;
      pr.gates.push(Math.abs(dx) === FR ? { x, z, dx: Math.sign(dx), dz: 0 } : { x, z, dx: 0, dz: Math.sign(dz) });
      continue;
    }
    pr.fence.push(i);
  }
}

// 村を興す：町の一覧に加え、広場と十字の通りを敷き、家・井戸・畑を建てる順番を決める
function found(sim, pr, k) {
  const S = sim.S, w = S.world;
  const sid = w.settlements.length;
  const s = { id: sid, name: pr.name, type: 'village', kingdom: pr.k, x: pr.x, z: pr.z, r: FR, h: w.hgt[pr.z * W + pr.x], buildings: [], plaza: { x: pr.x, z: pr.z, r: 1 }, gates: pr.gates || [], guardposts: [], walls: [], frontier: true, grade: 'hamlet', founded: sim.today, foundedYear: sim.year(), leader: pr.leader, projId: pr.id };
  w.settlements.push(s);
  pr.sid = sid;
  S.expansion.sk[sid] = pr.k;
  (S.expansion.origK = S.expansion.origK || {})[sid] = pr.k;
  const stock = {}, price = {};
  for (const [g, G] of Object.entries(GOODS)) { stock[g] = G.target * (g === 'wheat' ? 0.5 : g === 'wood' ? 0.8 : 0.15); price[g] = G.base; }
  S.towns[sid] = { stock, price, commission: 0, fund: 40, history: [], occupied: false, damage: 0 };
  S.culture = S.culture || {}; S.culture[sid] = [];
  if (S.initPop) S.initPop[sid] = 0;
  // 広場と十字の通り
  const changed = [];
  for (let dz = -FR + 1; dz <= FR - 1; dz++) for (let dx = -FR + 1; dx <= FR - 1; dx++) {
    const x = pr.x + dx, z = pr.z + dz, i = z * W + x, t = w.tiles[i];
    const plaza = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
    if (!(plaza || dx === 0 || dz === 0)) continue;
    if (!(BUILDABLE.has(t) || CLEARABLE.has(t) || t === T.ROAD)) continue;
    w.tiles[i] = plaza ? T.PLAZA : T.ROAD; changed.push(i);
  }
  if (changed.length) sim.events.push({ type: 'tiles', list: changed });
  // 開拓小屋と櫓も、この村のものに
  for (const id of [pr.camp, pr.tower]) if (id != null) { const b = sim.building(id); if (b) { b.settlement = sid; if (!s.buildings.includes(id)) s.buildings.push(id); } }
  claimAround(sim, pr, FR + 3, sid);
  // 移民の一家が加わることもある
  if (sim.rng.chance(0.5)) addMigrants(sim, pr, s);
  // 建てる順番：井戸 → 家（世帯ごと） → 畑
  pr.queue = [{ t: 'well', need: 4 }];
  pr.units.forEach((u, idx) => pr.queue.push({ t: 'house', unit: idx, need: 6 }));
  pr.queue.push({ t: 'fields', need: 3 });
  S.expansion.stats.founded++;
}

function addMigrants(sim, pr, s) {
  const S = sim.S, R = sim.rng;
  const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
  const south = KINGDOMS[pr.k]?.south;
  const origin = R.pick(['東の山向こう', '北の雪国', '西の港町', '遠い異国', '峠の宿場', '海の向こうの島', '戦で焼かれた村']);
  const fam = R.pick(south ? ['アル＝ハーディ', 'イブン＝サリム', 'アル＝ラフマ', 'バヌー＝カマル'] : ['ヴァルト', 'ブルーメ', 'ベーア', 'フックス', 'クライン', 'ロート', 'グリューン', 'ミュラー', 'ハルト']);
  const a = make({ family: fam, birthYear: sim.year() - R.int(20, 36), s: s.id, south });
  const members = [a];
  if (R.chance(0.6)) { const b = make({ sex: a.sex === 'm' ? 'f' : 'm', family: fam, birthYear: sim.year() - R.int(19, 34), s: s.id, south }); a.spouseId = b.id; b.spouseId = a.id; members.push(b); }
  const hhId = S.nextHh++;
  S.households[hhId] = { id: hhId, members: [], house: null, s: s.id, money: R.int(20, 60), food: 6, comfort: 0, name: `${fam}家`, expProj: pr.id };
  const camp = pr.camp != null ? sim.building(pr.camp) : null;
  for (const p of members) {
    initNewcomer(sim, p, 'pioneer', camp ? camp.door : { x: s.x, z: s.z });
    p.origin = origin; p.hh = hhId; p.expProj = pr.id; S.households[hhId].members.push(p.id);
    sim.remember(p, `${origin}から流れてきて、${s.name}の開拓団に加わった`, { emo: 0.5, imp: 0.95, k: 'arrival' });
    p.deeds.push(`${origin}から${s.name}の開拓に加わった`);
  }
  pr.units.push({ type: 'hh', hh: hhId, ids: members.map((p) => p.id), migrant: true });
  pr.members.push(...members.map((p) => p.id));
  sim.dirty();
  sim.pushLog(`${origin}から来た${sim.fullName(a)}${members.length > 1 ? 'の夫婦' : ''}が、${s.name}の開拓団に加わった。`, 'event', [a.id], a.pos);
}
function initNewcomer(sim, p, job, pos) {
  const R = sim.rng;
  delete p.notes; delete p.anc2;
  p.job = job; p.rank = JOBS[job].rank;
  p.needs = { survival: 80, sleep: 80, hunger: 70, lust: 70, sloth: 70, pleasure: 70, esteem: 60 };
  p.mood = 55; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = 0.8; p.workedToday = 0; p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = { [job]: 0.4 }; p.danger = {}; p.fame = 0; p.lv = 1 + R.int(0, 2);
  p.style = speechStyle(p, sim.ageOf(p)); p.traits = traitLabels(p);
  p.inv = []; p.eq = {}; starterKit(p, R); p.purse = R.int(5, 25);
  Object.assign(p, humanStats(sim, p)); p.hp = p.maxhp;
  p.pos = { x: pos.x, z: pos.z }; p.inside = null; p.path = []; p.action = null;
}

// 建てる仕事を1日ぶん進める
function buildQueue(sim, pr, k, labor, changed) {
  const S = sim.S, w = S.world, s = w.settlements[pr.sid], R = sim.rng;
  let work = labor / 5;   // 1日の働き（大人1人でおよそ1）
  while (work > 0 && pr.queue.length) {
    const it = pr.queue[0];
    const use = Math.min(work, it.need); it.need -= use; work -= use;
    if (it.need > 0.001) break;
    pr.queue.shift();
    if (it.t === 'well') {
      const b = placeIn(sim, s, 'well', '井戸', 1, 1, { open: true });
      if (b) spend(sim, k, pr, materials(sim, pr, k, 0, 3));
    } else if (it.t === 'house') {
      const u = pr.units[it.unit];
      const hh = settleUnit(sim, pr, s, u);
      spend(sim, k, pr, materials(sim, pr, k, 6, 2));
      if (hh) for (const id of hh.members) { const p = S.people[id]; if (p && sim.isAdult(p) && R.chance(0.6)) sim.remember(p, `${s.name}に自分たちの手で家を建て、はじめてかまどに火を入れた`, { emo: 0.9, imp: 0.85, k: 'frontier' }); }
    } else if (it.t === 'fields') {
      const n = makeFields(sim, s, pr.units.length * 4, changed);
      if (n) sim.pushLog(`${s.name}の外に、${n}枚の畑が拓かれた。`, 'event', [pr.leader], s);
    }
  }
  if (R.chance(0.12)) toil(sim, pr, aliveMembers(sim, pr).filter((p) => sim.isAdult(p)), 'build');
  if (!pr.queue.length) completeVillage(sim, pr, k);
}
// 資材：市場にあれば買い、なければ遠くから取り寄せる（国庫払い）。戻り値は国が払った額
function materials(sim, pr, k, wood, stone) {
  const m = sim.market(pr.from);
  let cost = 0;
  for (const [g, n] of [['wood', wood], ['stone', stone]]) {
    if (!n) continue;
    if (m && m.stock[g] >= n) { m.stock[g] -= n; cost += n * m.price[g]; } else cost += n * GOODS[g].base * 1.6;
  }
  return cost;
}
function placeIn(sim, s, type, name, bw, bd, extra = {}) {
  const w = sim.S.world;
  const streets = [];
  for (let z = s.z - s.r; z <= s.z + s.r; z++) for (let x = s.x - s.r; x <= s.x + s.r; x++) { const t = w.tiles[z * W + x]; if (t === T.ROAD || t === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + sim.rng.next() * 3 }); }
  streets.sort((a, b) => a.d - b.d);
  const b = tryPlace(w, s, streets, type, name, bw, bd, { land: [T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH, T.FOREST, T.DENSE, T.JUNGLE], extra }, sim.rng);
  if (b) { s.buildings.push(b.id); sim.events.push({ type: 'building', id: b.id }); }
  return b;
}
// 開拓団の一組を、新しい家に住まわせる
function settleUnit(sim, pr, s, u) {
  const S = sim.S;
  const ids = u.ids.filter((id) => S.people[id] && S.people[id].deathYear == null);
  if (!ids.length) return null;
  const first = S.people[ids[0]];
  let hh;
  if (u.type === 'hh' && S.households[u.hh]) {
    hh = S.households[u.hh];
    const old = hh.house != null ? sim.building(hh.house) : null;
    if (old && old.type === 'house' && old.hh === hh.id) { old.hh = null; old.name = '空き家'; }
    hh.house = null; hh.street = false; hh.inn = false;
  } else {
    const id = S.nextHh++;
    hh = S.households[id] = { id, members: [], house: null, s: s.id, money: 0, food: 4, comfort: 0, name: `${first.family}家` };
    const oldHh = S.households[u.hh];
    // 実家から少しの持たせ金
    if (oldHh && oldHh.money > 40) { const g = Math.min(40, oldHh.money * 0.2); oldHh.money -= g; hh.money += g; }
    for (const pid of ids) sim.moveTo(S.people[pid], hh);
  }
  hh.s = s.id; hh.expProj = null;
  const b = houseFor(sim, s, hh.name);
  if (b) { hh.house = b.id; b.hh = hh.id; b.owner = hh.id; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0; }
  else hh.street = true;
  for (const pid of hh.members) { const p = S.people[pid]; if (p) { p.s = s.id; p.action = null; } }
  return hh;
}
// 家を建てる：柵の内側に場所がなければ、柵の外の道ぞいに（町が柵の外へ広がる）
function houseFor(sim, s, name) {
  let b = placeIn(sim, s, 'house', name, sim.rng.chance(0.4) ? 3 : 2, 2);
  for (let tries = 0; !b && tries < 3; tries++) {
    if ((s.extraR || 0) < 10) s.extraR = (s.extraR || 0) + 2;
    b = sim.placeHouse ? sim.placeHouse(s) : null;
    if (b) { b.name = name; sim.events.push({ type: 'building', id: b.id }); }
  }
  return b;
}
function makeFields(sim, s, n, changed) {
  const w = sim.S.world;
  let made = 0;
  for (let ring = FR + 1; ring <= FR + 4 && made < n; ring++) {
    for (let dz = -ring; dz <= ring && made < n; dz++) for (let dx = -ring; dx <= ring && made < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring || dx === 0 || dz === 0 || Math.abs(dx) === 1 || Math.abs(dz) === 1) continue;
      const x = s.x + dx, z = s.z + dz;
      if (!inb(x, z)) continue;
      const i = z * W + x, t = w.tiles[i];
      if (!(t === T.GRASS || t === T.SAVANNA || t === T.FOREST)) continue;
      w.tiles[i] = T.FIELD; changed.push(i); made++;
      w.fields.push({ x, z, s: s.id, frontier: true });
    }
  }
  return made;
}

function completeVillage(sim, pr, k) {
  const S = sim.S, w = S.world, s = w.settlements[pr.sid];
  const alive = aliveMembers(sim, pr);
  const leader = S.people[pr.leader];
  // 仕事：開拓者の多くは農夫になり、団長は村長に。ひとりは開拓者のまま畑を広げ続ける
  let keptPioneer = false;
  for (const p of alive) {
    p.expProj = null;
    if (!sim.isAdult(p)) continue;
    if (p === leader && sim.ageOf(p) >= 21) { p.job = 'elder'; p.rank = JOBS.elder.rank; continue; }
    if (p.job === 'pioneer') {
      if (!keptPioneer && p.values.courage > 0.4) { keptPioneer = true; continue; }
      p.job = 'farmer'; p.skill.farmer = Math.max(p.skill.farmer || 0, 0.35);
    }
    p.rank = ['king', 'royal', 'noble'].includes(p.rank) ? p.rank : JOBS[p.job]?.rank || 'commoner';
  }
  for (const u of pr.units) { const hh = S.households[u.hh]; if (hh && hh.expProj === pr.id) hh.expProj = null; }
  if (S.initPop) S.initPop[s.id] = alive.filter((p) => p.s === s.id).length;
  setStage(sim, pr, 'settle');
  pr.settledDay = sim.today;
  const where = `${pr.dir}の${FEATURE_WORD[pr.feature]}`;
  sim.news(`${kname(pr.k)}が${where}を切り開き、${s.name}ができた（${alive.length}人）`, 3, s);
  sim.chron(`${kname(pr.k)}が${where}を切り開き、${s.name}を建てた（開拓団長 ${leader ? sim.fullName(leader) : '不明'}）`, pr.k);
  const king = kingOf(sim, k);
  if (king) sim.remember(king, `${s.name}が新たに我が国に加わった`, { emo: 0.6, imp: 0.6, k: 'politics' });
  k.fame = (k.fame || 50) + 4;
  for (const p of alive) if (sim.isAdult(p)) sim.remember(p, `みんなで切り開いた${s.name}が、ついに村になった`, { emo: 0.9, imp: 0.95, k: 'frontier' });
  // 村への道（国の普請）
  pr.road = roadPath(sim, s);
}

// ---------- 村として育つ ----------
function stepSettle(sim, pr, k, pop) {
  const S = sim.S, w = S.world, R = sim.rng, s = w.settlements[pr.sid];
  if (!s || s.abandoned) { pr.stage = 'done'; return; }
  const n = pop[s.id] || 0;
  const age = sim.today - (pr.settledDay ?? pr.sday);
  if (n === 0) return abandon(sim, pr, `${s.name}には誰もいなくなった`);
  if (age < 20 && attackCheck(sim, pr, k)) return;
  // 道普請：国庫から1日に数マスずつ
  if (pr.road && pr.road.length && k.treasury > 150) {
    const changed = [];
    for (let j = 0; j < 5 && pr.road.length; j++) {
      const i = pr.road.shift(), t = w.tiles[i];
      if (t === T.RIVER) { w.tiles[i] = T.BRIDGE; spend(sim, k, pr, 10); }
      else if (!(t === T.BLD || t === T.WALL || t === T.FENCE || isWater(t) || t === T.ROAD || t === T.PLAZA || t === T.BRIDGE)) { w.tiles[i] = T.ROAD; spend(sim, k, pr, 2.5); }
      else continue;
      changed.push(i);
    }
    if (changed.length) sim.events.push({ type: 'tiles', list: changed });
    if (!pr.road.length) {
      sim.pushLog(`${s.name}へ続く道が開通した。国の普請で、人夫たちが道を敷いた。`, 'event', [], s);
      sim.chron(`${s.name}への道が開通した`, pr.k);
    }
  }
  // 畑を少しずつ広げる（開拓者がいれば）
  const pioneers = sim.living().filter((p) => p.s === s.id && p.job === 'pioneer').length;
  if (pioneers && R.chance(0.4)) {
    const changed = [];
    const hhN = Object.values(S.households).filter((h) => h.s === s.id).length;
    const have = w.fields.filter((f) => f.s === s.id).length;
    if (have < hhN * 6) makeFields(sim, s, 1 + pioneers, changed);
    if (changed.length) sim.events.push({ type: 'tiles', list: changed });
  }
  // 人が集まる：同じ国の宿なし・貧しい家や、よその土地からの移民
  const safety = S.dangerMap?.[chunkAt(s.x, s.z)] || 0;
  const homeless = Object.values(S.households).filter((h) => h.s === s.id && (h.street || h.house == null) && !h.wander && !h.bandits);
  if (homeless.length) {
    const h = homeless[0], b = houseFor(sim, s, h.name);
    if (b) { h.house = b.id; h.street = false; b.hh = h.id; b.owner = h.id; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0; spend(sim, k, pr, materials(sim, pr, k, 4, 1)); }
  } else {
    const attract = 0.022 + (w.fields.filter((f) => f.s === s.id).length > n ? 0.012 : 0) - safety * 0.006 + (pr.road && !pr.road.length ? 0.01 : 0);
    if (n < 60 && R.chance(Math.max(0.004, attract))) newcomers(sim, pr, s);
  }
  // 礼拝堂
  if (n >= 10 && !s.buildings.some((id) => sim.building(id)?.type === 'church') && k.treasury > 500 && R.chance(0.2)) {
    const b = placeIn(sim, s, 'church', '礼拝堂', 3, 3);
    if (b) { spend(sim, k, pr, 120 + materials(sim, pr, k, 10, 8)); sim.pushLog(`${s.name}に礼拝堂が建った。これで婚礼も弔いも村でできる。`, 'event', [], s); }
  }
  // 領土が村のまわりに広がる
  if (n >= 8 && sim.today % 12 === pr.id % 12) growTerritory(sim, pr, s);
  // 町に格上げ（人口と年月）
  const houses = s.buildings.filter((id) => sim.building(id)?.type === 'house').length;
  if (s.grade !== 'town' && n >= 30 && houses >= 10 && age >= 80 && k.treasury > 600) upgradeTown(sim, pr, k, s);
  if (S.initPop && n > (S.initPop[s.id] || 0)) S.initPop[s.id] = n;
}

function newcomers(sim, pr, s) {
  const S = sim.S, R = sim.rng;
  // まず自国の宿なし・貧しい家から
  const cands = Object.values(S.households).filter((h) => h.s !== s.id && sim.town(h.s)?.kingdom === pr.k && !h.royal && !h.bandits && !h.wander && h.expProj == null && (h.street || h.inn || h.house == null || h.money < 25) && h.members.length && h.members.every((id) => S.people[id] && !['king', 'royal', 'noble'].includes(S.people[id].rank) && S.people[id].jail == null && !NO_SETTLER.has(S.people[id].job)));
  const hh = cands.length ? R.pick(cands) : null;
  if (hh) {
    const from = sim.town(hh.s);
    const u = { type: 'hh', hh: hh.id, ids: hh.members.slice() };
    const got = settleUnit(sim, pr, s, u);
    if (!got) return;
    for (const id of got.members) { const p = S.people[id]; if (p && sim.isAdult(p)) { if (!p.job || NO_SETTLER.has(p.job)) p.job = 'farmer'; sim.remember(p, `${from.name}での暮らしに見切りをつけ、開拓村の${s.name}へ移り住んだ`, { emo: 0.5, imp: 0.8, k: 'frontier' }); } }
    sim.pushLog(`${got.name}が${from.name}から${s.name}へ移り住んだ。開拓村に新しい煙が上がる。`, 'event', got.members.slice(0, 1), s);
    return;
  }
  // よその土地からの移民（ときどき）
  if (!R.chance(0.35)) return;
  const before = pr.units.length;
  addMigrants(sim, pr, s);
  const u = pr.units[before];
  if (!u) return;
  const got = settleUnit(sim, pr, s, u);
  if (got) for (const id of got.members) { const p = S.people[id]; if (p) { p.expProj = null; p.job = 'farmer'; p.rank = JOBS.farmer.rank; } }
  if (got) got.expProj = null;
}

function growTerritory(sim, pr, s) {
  const S = sim.S, tr = S.territory;
  const c0 = chunkAt(s.x, s.z);
  const cx = c0 % CW, cz = Math.floor(c0 / CW);
  let best = null, bs = -1e9;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= CW || nz >= CHN) continue;
    const ci = nz * CW + nx;
    if (tr.owner[ci] !== -1 || !nbrs4(ci).some((n) => tr.owner[n] === pr.k)) continue;
    const sc = buildableFrac(S.world, ci) * 2 + (S.expansion.res[ci]?.length || 0) - Math.hypot(dx, dz) * 0.5 + sim.rng.next();
    if (sc > bs) { bs = sc; best = ci; }
  }
  if (best == null) return;
  setOwner(sim, best, pr.k, 2, s.id);
  const others = nearOthers(sim, pr.k, best, 1);
  for (const o of others) protest(sim, o, pr.k, best, `${s.name}の土地を広げた`);
}

function upgradeTown(sim, pr, k, s) {
  const S = sim.S, w = S.world;
  const old = s.name;
  s.grade = 'town';
  s.name = s.name.replace(/村$/, '町');
  // 柵を石の塀に
  const changed = [];
  for (let dz = -FR; dz <= FR; dz++) for (let dx = -FR; dx <= FR; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== FR) continue;
    const i = (s.z + dz) * W + s.x + dx;
    if (w.tiles[i] === T.FENCE) { w.tiles[i] = T.WALL; changed.push(i); s.walls.push({ x: s.x + dx, z: s.z + dz }); }
  }
  if (changed.length) sim.events.push({ type: 'tiles', list: changed });
  spend(sim, k, pr, 150 + materials(sim, pr, k, 4, changed.length * 0.5));
  if (!s.buildings.some((id) => sim.building(id)?.type === 'tavern')) placeIn(sim, s, 'tavern', `${s.name.replace(/町$/, '')}の宿`, 3, 3);
  s.extraR = (s.extraR || 0) + 3;
  S.expansion.stats.towns++;
  sim.news(`開拓村だった${old}が大きくなり、${s.name}に格上げされた。柵は石の塀に建て替えられた`, 3, s);
  sim.chron(`${old}が${s.name}に格上げされた`, pr.k);
  for (const p of sim.living()) if (p.s === s.id && sim.isAdult(p) && sim.rng.chance(0.6)) sim.remember(p, `${old}が町になった。開拓のころを思うと夢のようだ`, { emo: 0.8, imp: 0.8, k: 'frontier' });
}

// 村から、いちばん近い道の網までの道すじ
function roadPath(sim, s) {
  const w = sim.S.world, tiles = w.tiles, N = W * H;
  const g = (s.gates || []).map((q) => ({ x: q.x + q.dx, z: q.z + q.dz })).filter((q) => inb(q.x, q.z) && walkable(tiles[q.z * W + q.x]));
  if (!g.length) return [];
  const cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hp = new MinHeap();
  for (const q of g) { const i = q.z * W + q.x; cost[i] = 0; hp.push(0, i); }
  let goal = -1, it = 0;
  const lim = BIG ? 250000 : 60000;
  while (hp.size && it++ < lim) {
    const i = hp.pop(); if (done[i]) continue; done[i] = 1;
    const x = i % W, z = (i / W) | 0;
    const t = tiles[i];
    if ((t === T.ROAD || t === T.BRIDGE || t === T.PLAZA) && cheb(x, z, s.x, s.z) > FR + 2 && cost[i] > 0) { goal = i; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (!inb(nx, nz)) continue;
      const j = nz * W + nx, tt = tiles[j];
      if (cheb(nx, nz, s.x, s.z) <= FR) continue;
      let c;
      if (tt === T.ROAD || tt === T.BRIDGE || tt === T.PLAZA) c = 0.5;
      else if (tt === T.RIVER) c = 9;
      else if (tt === T.SEA || tt === T.DEEP || tt === T.PEAK || tt === T.BLD || tt === T.LAVA || tt === T.WALL || tt === T.FENCE || tt === T.FIELD || tt === T.PASTURE || tt === T.DOCK) continue;
      else c = (MOVE_COST[tt] || 2);
      if (cost[i] + c < cost[j]) { cost[j] = cost[i] + c; came[j] = i; hp.push(cost[j], j); }
    }
  }
  if (goal < 0) return [];
  const path = [];
  for (let c = came[goal]; c !== -1; c = came[c]) path.push(c);
  path.reverse();
  if (path.length > (BIG ? 220 : 90)) return [];
  return path.filter((i) => { const t = tiles[i]; return t !== T.ROAD && t !== T.BRIDGE && t !== T.PLAZA; });
}

// ---------- 失敗と廃村 ----------
function fail(sim, pr, why, quiet = false) {
  const S = sim.S, X = S.expansion;
  if (pr.sid != null && S.world.settlements[pr.sid]) return abandon(sim, pr, why);
  const k = S.kingdoms[pr.k];
  pr.stage = 'failed'; pr.sday = sim.today; pr.why = why;
  X.lastFail[pr.k] = sim.today;
  if (!quiet) X.stats.failed++;
  const alive = aliveMembers(sim, pr);
  for (const p of alive) returnHome(sim, pr, p);
  for (const u of pr.units) { const hh = S.households[u.hh]; if (hh && hh.expProj === pr.id) hh.expProj = null; }
  // 切りかけの開拓地は、国の手を離れる
  if (pr.kind === 'village' && pr.stage === 'failed' && !quiet) releaseClaims(sim, pr);
  const camp = pr.camp != null ? sim.building(pr.camp) : null;
  if (camp) camp.name = '打ち捨てられた開拓小屋';
  const where = pr.name || `${pr.dir || ''}の開拓地`;
  if (quiet) sim.pushLog(`${kname(pr.k)}：${where}の計画は見送られた（${why}）。`, 'event', [], pr.x != null ? { x: pr.x, z: pr.z } : null);
  else {
    sim.news(`${kname(pr.k)}の${where}の開拓は失敗に終わった。${why}`, 2, { x: pr.x, z: pr.z });
    sim.chron(`${where}の開拓は失敗に終わった（${why}）`, pr.k);
    for (const p of alive) if (sim.isAdult(p)) sim.remember(p, `${where}の開拓に失敗し、肩を落として故郷へ戻った`, { emo: -0.8, imp: 0.9, k: 'frontier' });
    if (k) k.fame -= 3;
  }
}
function releaseClaims(sim, pr) {
  const tr = sim.S.territory;
  for (let ci = 0; ci < NC; ci++) if (tr.owner[ci] === pr.k && tr.kind[ci] === 2 && cheb(cCenter(ci).x, cCenter(ci).z, pr.x, pr.z) <= FR + 8 && (tr.home[ci] === -1 || tr.home[ci] === pr.sid)) setOwner(sim, ci, -1, 0, -1);
}
function returnHome(sim, pr, p) {
  const S = sim.S;
  p.expProj = null;
  if (p.expPrevJob) { p.job = p.expPrevJob; p.expPrevJob = null; }
  const hh = sim.hh(p);
  if (!hh) return;
  if (hh.s === pr.sid && pr.sid != null) {
    // 住んでいた村を捨てて、出てきた町へ戻る
    const from = sim.town(pr.from) || sim.town(S.kingdoms[pr.k]?.capital ?? 0);
    const b = hh.house != null ? sim.building(hh.house) : null;
    if (b && b.hh === hh.id) { b.hh = null; b.name = '廃屋'; }
    hh.s = from.id; hh.house = null;
    const nb = sim.placeHouse(from) || from.buildings.map((id) => sim.building(id)).find((q) => q.type === 'house' && q.hh == null);
    if (nb) { hh.house = nb.id; nb.hh = hh.id; nb.name = hh.name; nb.owner = nb.owner ?? hh.id; nb.value = nb.value || houseValue(sim, nb); sim.events.push({ type: 'building', id: nb.id }); } else hh.street = true;
    for (const id of hh.members) { const q = S.people[id]; if (q) { q.s = from.id; q.action = null; } }
  }
  p.action = null;
}
function abandon(sim, pr, why) {
  const S = sim.S, w = S.world, s = w.settlements[pr.sid], X = S.expansion;
  if (!s || s.abandoned) { pr.stage = 'failed'; return; }
  for (const p of sim.living().filter((q) => q.s === s.id)) {
    sim.remember(p, `${s.name}を捨てて、故郷へ引き揚げることになった`, { emo: -0.9, imp: 0.95, k: 'frontier' });
    returnHome(sim, pr, p);
  }
  for (const p of aliveMembers(sim, pr)) if (p.expProj === pr.id) returnHome(sim, pr, p);
  s.abandoned = true;
  const oldName = s.name;
  s.name = `${s.name}（廃村）`;
  if (S.initPop) S.initPop[s.id] = 0;
  for (const id of s.buildings) { const b = sim.building(id); if (b && b.type === 'house') { b.hh = null; b.name = '廃屋'; } }
  const camp = pr.camp != null ? sim.building(pr.camp) : null;
  if (camp) camp.name = '打ち捨てられた開拓小屋';
  pr.stage = 'failed'; pr.sday = sim.today; pr.why = why;
  X.lastFail[pr.k] = sim.today;
  X.stats.failed++;
  releaseClaims(sim, pr);
  sim.news(`${oldName}は捨てられ、廃村となった。${why}`, 3, s);
  sim.chron(`${oldName}は${why}ため、廃村となった`, pr.k);
  const k = S.kingdoms[pr.k]; if (k) k.fame -= 4;
}

// ---------- 砦 ----------
function stepFort(sim, pr, k) {
  const S = sim.S, w = S.world;
  if (sim.today - pr.sday < 4) return;
  const c = cCenter(pr.ci);
  let b = null;
  for (let r = 0; r <= 5 && !b; r++) for (let dz = -r; dz <= r && !b; dz++) for (let dx = -r; dx <= r && !b; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    b = placeBox(sim, 'fort', pr.name, c.x - 1 + dx, c.z - 1 + dz, 3, 3, { kingdom: pr.k, special: true, fort: true, faces: pr.others.map(kshort).join('・'), capital: k.capital, exp: pr.id }, true);
  }
  if (!b) { S.expansion.bad = S.expansion.bad || {}; S.expansion.bad[pr.ci] = sim.today; k.treasury += 120; return fail(sim, pr, '砦を建てる場所が見つからなかった', true); }
  (w.specials = w.specials || []).push(b.id);
  (w.forts = w.forts || []).push(b.id);
  spend(sim, k, pr, materials(sim, pr, k, 10, 16));
  pr.fort = b.id;
  const tr = S.territory;
  const cx = pr.ci % CW, cz = Math.floor(pr.ci / CW);
  const got = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= CW || nz >= CHN) continue;
    const ci = nz * CW + nx;
    if (tr.owner[ci] === -1 && (ci === pr.ci || buildableFrac(w, ci) > 0.3)) { setOwner(sim, ci, pr.k, 3, -1); got.push(ci); }
  }
  S.expansion.stats.forts++;
  pr.stage = 'done'; pr.sday = sim.today;
  sim.news(`${pr.name}が完成し、${kname(pr.k)}の兵が詰め始めた`, 2, b.door);
  sim.chron(`${kname(pr.k)}が${pr.dir}の国境に${pr.name}を築き、${pr.resName}を押さえた`, pr.k);
  for (const o of pr.others) {
    const key = `${Math.min(o, pr.k)}-${Math.max(o, pr.k)}`;
    S.expansion.tension[key] = (S.expansion.tension[key] || 0) + 3;
    S.kingdoms[o].relations[pr.k] = Math.max(-100, S.kingdoms[o].relations[pr.k] - 5);
  }
}

// 建物を1つ置く（開拓小屋・櫓・砦）。扉は南
function placeBox(sim, type, name, x0, z0, bw, bd, extra = {}, rocky = false) {
  const w = sim.S.world;
  const doorX = x0 + Math.floor(bw / 2), doorZ = z0 + bd;
  if (!inb(x0, z0) || !inb(x0 + bw - 1, doorZ)) return null;
  const ok = (t) => BUILDABLE.has(t) || CLEARABLE.has(t) || (rocky && t === T.ROCK);
  for (let z = z0; z < z0 + bd; z++) for (let x = x0; x < x0 + bw; x++) if (!ok(w.tiles[z * W + x])) return null;
  const dt = w.tiles[doorZ * W + doorX];
  if (!(ok(dt) || dt === T.ROAD)) return null;
  const id = w.buildings.length;
  const h = w.hgt[doorZ * W + doorX];
  const changed = [];
  for (let z = z0; z < z0 + bd; z++) for (let x = x0; x < x0 + bw; x++) { const i = z * W + x; w.tiles[i] = T.BLD; if (w.bldAt) w.bldAt[i] = id; w.hgt[i] = h; changed.push(i); }
  if (dt !== T.ROAD) { w.tiles[doorZ * W + doorX] = T.ROAD; changed.push(doorZ * W + doorX); }
  const b = { id, type, name, x: x0, z: z0, w: bw, d: bd, door: { x: doorX, z: doorZ }, h, face: 'S', roof: KINGDOMS[extra.kingdom]?.south ? 'flat' : 'thatch', ...extra };
  w.buildings.push(b);
  sim.events.push({ type: 'tiles', list: changed });
  sim.events.push({ type: 'building', id });
  return b;
}

// ---------- 資源の実り（開拓した土地だけ。もとからの土地は、すでに職業の働きで表している） ----------
function resourceYields(sim, pop) {
  const S = sim.S, tr = S.territory, X = S.expansion, w = S.world;
  const sets = w.settlements.filter((s) => !s.abandoned);
  for (const [cis, list] of Object.entries(X.res)) {
    const ci = +cis;
    const k = tr.owner[ci];
    if (k < 0 || tr.kind[ci] < 2) continue;
    const c = cCenter(ci);
    let best = null, bd = 1e9;
    for (const s of sets) { if (s.kingdom !== k) continue; const d = cheb(s.x, s.z, c.x, c.z); if (d < bd) { bd = d; best = s; } }
    if (!best || bd > 22) continue;
    const m = S.towns[best.id]; if (!m) continue;
    const hands = Math.min(1, (pop[best.id] || 0) / 12);
    if (hands <= 0) continue;
    for (const r of list) {
      switch (r) {
        case 'timber': m.stock.wood += 0.6 * hands; break;
        case 'stone': m.stock.stone += 0.4 * hands; break;
        case 'ore': m.stock.ore += 0.4 * hands; break;
        case 'gem': if (sim.rng.chance(0.03 * hands)) m.stock.gem += 1; break;
        case 'fertile': m.stock.wheat += 1.0 * hands; break;
        case 'harbor': m.stock.fish += 0.5 * hands; break;
        case 'salt': S.kingdoms[k].treasury += 1.2 * hands; break;    // 塩の専売
        case 'water': break;
      }
    }
  }
}

// ---------- 国どうしの駆け引き ----------
function contacts(sim) {
  const tr = sim.S.territory, m = {};
  for (let ci = 0; ci < NC; ci++) {
    const a = tr.owner[ci]; if (a < 0) continue;
    for (const n of [ci + 1, ci + CW]) {
      if (n >= NC || (n === ci + 1 && (ci % CW) === CW - 1)) continue;
      const b = tr.owner[n]; if (b < 0 || b === a) continue;
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      (m[key] = m[key] || []).push(a < b ? [ci, n] : [n, ci]);
    }
  }
  return m;
}
const pactOf = (X, a, b, type) => X.pacts.find((p) => p.type === type && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));

function diplomacy(sim) {
  const S = sim.S, X = S.expansion, R = sim.rng, K = S.kingdoms;
  X.pacts = X.pacts.filter((p) => p.until > sim.today);
  let cmap = null;
  for (let a = 0; a < K.length; a++) for (let b = a + 1; b < K.length; b++) {
    if ((sim.today + a + b) % 7 !== 0) continue;
    const A = K[a], B = K[b], key = `${a}-${b}`;
    if (A.war?.with === b) continue;
    cmap = cmap || contacts(sim);
    const border = cmap[key] || [];
    X.tension[key] = (X.tension[key] || 0) * 0.9;
    const ten = X.tension[key];
    // 緊張は関係を冷やす
    if (ten > 0.5) { const d = Math.min(4, ten * 0.4); A.relations[b] = Math.max(-100, A.relations[b] - d); B.relations[a] = Math.max(-100, B.relations[a] - d); }
    const truce = pactOf(X, a, b, 'truce');
    // 小競り合い
    if (!truce && border.length && Math.min(A.relations[b], B.relations[a]) < -25 && R.chance(0.3)) skirmish(sim, A, B, R.pick(border));
    // 取引：足りない物を、余っている国から買う
    else if (Math.min(A.relations[b], B.relations[a]) > -10 && R.chance(0.35)) trade(sim, A, B) || trade(sim, B, A);
    // 土地の買い取り
    if (border.length && R.chance(0.25)) buyLand(sim, A, B, border) || buyLand(sim, B, A, border);
    // 同盟：共通の敵がいる仲の良い国どうし
    if (!pactOf(X, a, b, 'alliance') && A.relations[b] > 40 && B.relations[a] > 40) {
      const foe = K.find((c) => c !== A && c !== B && A.relations[c.id] < -30 && B.relations[c.id] < -30);
      if (foe && R.chance(0.4)) {
        X.pacts.push({ type: 'alliance', a, b, since: sim.today, until: sim.today + 120, against: foe.id });
        X.stats.alliances++;
        sim.news(`${A.name}と${B.name}が、${foe.name}に備えて同盟を結んだ`, 3, sim.town(A.capital));
        sim.chron(`${A.name}と${B.name}が同盟を結んだ（${foe.name}に備えて）`, a);
        foe.relations[a] = Math.max(-100, foe.relations[a] - 8); foe.relations[b] = Math.max(-100, foe.relations[b] - 8);
      }
    }
  }
}
function skirmish(sim, A, B, pair) {
  const S = sim.S, R = sim.rng, X = S.expansion;
  const ci = pair[R.int(0, 1)];
  const c = cCenter(ci);
  const pick = (k) => sim.living().filter((p) => sim.town(p.s)?.kingdom === k.id && ['soldier', 'militia', 'gatekeeper', 'knight', 'guard'].includes(p.job) && p.jail == null && sim.isAdult(p) && !p.mission)
    .sort((p, q) => Math.hypot(sim.town(p.s).x - c.x, sim.town(p.s).z - c.z) - Math.hypot(sim.town(q.s).x - c.x, sim.town(q.s).z - c.z)).slice(0, 4)[R.int(0, 3)] || null;
  const a = pick(A), b = pick(B);
  X.stats.skirmish++;
  const key = `${Math.min(A.id, B.id)}-${Math.max(A.id, B.id)}`;
  X.tension[key] = (X.tension[key] || 0) + 1.5;
  A.relations[B.id] = Math.max(-100, A.relations[B.id] - 7); B.relations[A.id] = Math.max(-100, B.relations[A.id] - 7);
  const where = spotName(sim, ci);
  let txt = `国境の${where}で、${A.name}と${B.name}の兵が小競り合いを起こした`;
  if (a && b) {
    const aw = (a.lv || 1) * (0.7 + R.next() * 0.6) > (b.lv || 1) * (0.7 + R.next() * 0.6);
    const win = aw ? a : b, lose = aw ? b : a;
    if (R.chance(0.06)) { sim.die(lose, 'war'); txt += `。${sim.fullName(lose)}が討たれた`; }
    else { lose.hp = Math.max(1, Math.round((lose.hp || 20) * 0.6)); txt += `。${sim.fullName(lose)}が手傷を負った`; }
    sim.remember(win, `国境の${where}で${sim.town(lose.s)?.name || 'よそ'}の兵とやり合い、追い返した`, { emo: 0.3, imp: 0.6, k: 'war' });
    if (lose.deathYear == null) sim.remember(lose, `国境の${where}で${sim.town(win.s)?.name || 'よそ'}の兵に斬りつけられた`, { emo: -0.7, imp: 0.7, k: 'war' });
    // 勝った側が、その区画を実力で押さえることもある
    const winK = aw ? A : B, loseK = aw ? B : A;
    const target = pair.find((q) => S.territory.owner[q] === loseK.id);
    if (target != null && winK.relations[loseK.id] < -40 && armySize(sim, winK.id) > armySize(sim, loseK.id) * 1.3 && R.chance(0.3) && seizable(sim, target, loseK.id)) {
      transferChunk(sim, target, winK.id);
      X.stats.seized++;
      txt += `。${winK.name}が${where}を実力で押さえた`;
      sim.chron(`国境の${where}を、${winK.name}が${loseK.name}から実力で奪った`, winK.id);
    }
  }
  sim.news(txt, 2, c);
}
function trade(sim, A, B) {
  const S = sim.S, X = S.expansion;
  const capA = S.towns[A.capital], capB = S.towns[B.capital];
  if (!capA || !capB) return false;
  for (const g of ['ore', 'wood', 'stone', 'wheat', 'fish']) {
    const G = GOODS[g];
    if (capA.stock[g] < G.target * 0.4 && capB.stock[g] > G.target * 1.6) {
      const n = Math.round(Math.min(G.target * 0.5, capB.stock[g] - G.target));
      const price = n * G.base * 1.15;
      if (A.treasury < price + 300) return false;
      capB.stock[g] -= n; capA.stock[g] += n;
      A.treasury -= price; B.treasury += price;
      A.relations[B.id] = Math.min(100, A.relations[B.id] + 3); B.relations[A.id] = Math.min(100, B.relations[A.id] + 3);
      X.stats.trades++;
      sim.news(`${A.name}が${B.name}から${G.name}${n}を買い入れた（${Math.round(price)}銅貨）`, 1, sim.town(A.capital));
      return true;
    }
  }
  return false;
}
function buyLand(sim, A, B, border) {
  const S = sim.S, X = S.expansion, tr = S.territory;
  if (A.treasury < 1800 || B.treasury > 300 || A.relations[B.id] < -15 || B.relations[A.id] < -15) return false;
  const cand = border.map((p) => p.find((ci) => tr.owner[ci] === B.id)).filter((ci) => ci != null && seizable(sim, ci, B.id, true));
  if (!cand.length) return false;
  const ci = cand[0];
  const price = Math.round(180 + (X.res[ci]?.length || 0) * 70);
  A.treasury -= price; B.treasury += price;
  transferChunk(sim, ci, A.id);
  X.stats.bought++;
  const c = cCenter(ci);
  const where = spotName(sim, ci);
  sim.news(`金に困った${B.name}が、国境の${where}を${A.name}に${price}銅貨で売り渡した`, 2, c);
  sim.chron(`${B.name}が国境の${where}を${A.name}に売り渡した（${price}銅貨）`, A.id);
  return true;
}
// 取ってよい区画か：王都・港町・もとからの村の土台の区画は、戦争の講和でしか動かない
function seizable(sim, ci, from, peaceful = false) {
  const S = sim.S, tr = S.territory, w = S.world;
  if (tr.owner[ci] !== from) return false;
  const c = cCenter(ci);
  for (const s of w.settlements) {
    if (s.abandoned) continue;
    const inside = cheb(s.x, s.z, c.x, c.z) <= s.r + 4;
    if (!inside) continue;
    if (!s.frontier) return false;
    if (peaceful) return false;
  }
  return true;
}
// 区画を移す（中に開拓村があれば、村ごと）
function transferChunk(sim, ci, to) {
  const S = sim.S, w = S.world, tr = S.territory;
  const from = tr.owner[ci];
  const c = cCenter(ci);
  setOwner(sim, ci, to, tr.kind[ci] === 1 ? 2 : tr.kind[ci], tr.home[ci]);
  for (const s of w.settlements) {
    if (!s.frontier || s.abandoned || s.kingdom !== from || cheb(s.x, s.z, c.x, c.z) > s.r + 4) continue;
    s.kingdom = to;
    S.expansion.sk[s.id] = to;
    for (const id of s.buildings) { const b = sim.building(id); if (b) b.kingdom = to; }
    for (let n = 0; n < NC; n++) if (tr.home[n] === s.id && tr.owner[n] === from) setOwner(sim, n, to, 2, s.id);
    for (const pr of S.expansion.projects) if (pr.sid === s.id) pr.k = to;
    for (const p of sim.living()) if (p.s === s.id && sim.isAdult(p)) sim.remember(p, `${s.name}は${kname(to)}のものになった`, { emo: -0.4, imp: 0.85, k: 'war' });
    sim.news(`${s.name}は${kname(to)}の支配下に入った`, 3, s);
  }
}

// ---------- 戦争 ----------
// 町の持ち主が変わった（politics.js の村の割譲など）→ その町の区画も移す
function watchCessions(sim) {
  const S = sim.S, X = S.expansion, tr = S.territory;
  for (const s of S.world.settlements) {
    const was = X.sk[s.id];
    if (was === undefined) { X.sk[s.id] = s.kingdom; continue; }
    if (was === s.kingdom) continue;
    X.sk[s.id] = s.kingdom;
    for (let ci = 0; ci < NC; ci++) {
      const c = cCenter(ci);
      if (tr.home[ci] === s.id || (tr.owner[ci] === was && cheb(c.x, c.z, s.x, s.z) <= s.r + 6)) setOwner(sim, ci, s.kingdom, tr.kind[ci] || 1, s.id);
    }
    const war = X.wars.find((q) => !q.ended && ((q.a === was && q.b === s.kingdom) || (q.b === was && q.a === s.kingdom)));
    if (war) war.ceded = s.id;
  }
}
function watchWars(sim) {
  const S = sim.S, X = S.expansion;
  for (const k of S.kingdoms) {
    const cur = k.war, prev = X.warSeen[k.id];
    if (cur && !prev) {
      const key = `${cur.name}@${cur.since}`;
      if (!X.wars.some((q) => q.key === key)) {
        X.wars.push({ key, a: k.id, b: cur.with, since: cur.since, name: cur.name, seized: [], ended: false });
        // 同盟国は、攻められた側に援助を送る
        for (const pact of X.pacts.filter((p) => p.type === 'alliance')) {
          for (const [x, y] of [[k.id, cur.with], [cur.with, k.id]]) {
            const ally = pact.a === x ? pact.b : pact.b === x ? pact.a : null;
            if (ally == null || ally === y) continue;
            const Al = S.kingdoms[ally], Fr = S.kingdoms[x];
            const gift = Math.min(150, Al.treasury * 0.15);
            if (gift < 30) continue;
            Al.treasury -= gift; Fr.treasury += gift;
            Al.relations[y] = Math.max(-100, Al.relations[y] - 15);
            sim.news(`${Al.name}が、同盟国${Fr.name}に戦費${Math.round(gift)}銅貨を送った`, 2, sim.town(Al.capital));
          }
        }
      }
    }
    if (!cur && prev) {
      const rec = X.wars.find((q) => q.key === prev.key);
      if (rec && !rec.ended) {
        // どちらが勝ったか：名声の増え方で見分ける（endWar で勝者+20、敗者−20）
        const o = S.kingdoms[prev.with];
        const dk = k.fame - (X.famePrev[k.id] ?? k.fame), dO = o ? o.fame - (X.famePrev[o.id] ?? o.fame) : 0;
        const winner = dk >= dO ? k : o, loser = winner === k ? o : k;
        if (winner && loser) settlePeace(sim, rec, winner, loser);
      }
    }
    X.warSeen[k.id] = cur ? { with: cur.with, key: `${cur.name}@${cur.since}` } : null;
  }
}
// 戦のあいだ：優勢な側が、国境の区画を少しずつ奪う
function warFronts(sim) {
  const S = sim.S, X = S.expansion, R = sim.rng;
  for (const rec of X.wars) {
    if (rec.ended) continue;
    const A = S.kingdoms[rec.a], B = S.kingdoms[rec.b];
    if (!A?.war || A.war.with !== B.id) continue;
    if (rec.seized.length >= 6 || !R.chance(0.3)) continue;
    const ma = armySize(sim, A.id), mb = armySize(sim, B.id);
    const [win, lose] = ma >= mb * 1.15 ? [A, B] : mb >= ma * 1.15 ? [B, A] : [null, null];
    if (!win) continue;
    const cmap = contacts(sim);
    const border = cmap[`${Math.min(A.id, B.id)}-${Math.max(A.id, B.id)}`] || [];
    const cand = border.map((p) => p.find((ci) => S.territory.owner[ci] === lose.id)).filter((ci) => ci != null && seizable(sim, ci, lose.id));
    if (!cand.length) continue;
    const ci = cand.sort((a, b) => (X.res[b]?.length || 0) - (X.res[a]?.length || 0))[0];
    transferChunk(sim, ci, win.id);
    rec.seized.push({ ci, from: lose.id, to: win.id });
    X.stats.seized++;
    const c = cCenter(ci);
    sim.news(`${rec.name}：${win.name}の軍が国境の${spotName(sim, ci)}を${X.origOwner?.[ci] === win.id ? '奪い返した' : '占領した'}`, 2, c);
  }
}
function settlePeace(sim, rec, winner, loser) {
  const S = sim.S, X = S.expansion;
  rec.ended = true; rec.winner = winner.id; rec.endDay = sim.today;
  // 負けた側が戦のあいだに奪った区画は返す。勝った側の奪った区画はそのまま
  let back = 0;
  for (const q of rec.seized) if (q.to === loser.id && S.territory.owner[q.ci] === loser.id) { transferChunk(sim, q.ci, winner.id); back++; }
  // 講和の条件として、国境の区画をさらに2つまで
  const cmap = contacts(sim);
  const border = cmap[`${Math.min(winner.id, loser.id)}-${Math.max(winner.id, loser.id)}`] || [];
  const cand = [...new Set(border.map((p) => p.find((ci) => S.territory.owner[ci] === loser.id)).filter((ci) => ci != null && seizable(sim, ci, loser.id)))];
  // 勝った国がすでに大きすぎるときは、欲張らない（一国だけが勝ちすぎないように）
  const ws = territorySize(sim, winner.id), ls = territorySize(sim, loser.id);
  const take = ws > ls * 1.8 ? 0 : ws > ls * 1.3 ? 1 : 2;
  const extra = cand.sort((a, b) => (X.res[b]?.length || 0) - (X.res[a]?.length || 0)).slice(0, take);
  for (const ci of extra) transferChunk(sim, ci, winner.id);
  const kept = rec.seized.filter((q) => q.to === winner.id).length;
  const n = kept + back + extra.length;
  X.pacts.push({ type: 'truce', a: winner.id, b: loser.id, since: sim.today, until: sim.today + 30 });
  const key = `${Math.min(winner.id, loser.id)}-${Math.max(winner.id, loser.id)}`;
  X.tension[key] = 0;
  if (n > 0) {
    sim.chron(`「${rec.name}」の講和で、${winner.name}は国境の${n}区画（約${n * EXP_CS * EXP_CS}マス）を得た`, winner.id);
    sim.news(`「${rec.name}」の講和で、${winner.name}が国境の土地（${n}区画）を得た。30日の休戦が結ばれた`, 3, sim.town(winner.capital));
  }
}

// 奪われた町の人々が蜂起して、もとの国へ戻ることがある（大きくなりすぎた国ほど治めきれない）
function uprisings(sim) {
  const S = sim.S, X = S.expansion, R = sim.rng;
  if (!X.origK) return;
  for (const s of S.world.settlements) {
    const orig = X.origK[s.id];
    if (orig == null || orig === s.kingdom || s.type === 'capital' || s.abandoned || S.towns[s.id]?.occupied) continue;
    const O = S.kingdoms[orig], N = S.kingdoms[s.kingdom];
    if (!O || !N || !kingOf(sim, O)) continue;
    if (pactOf(X, orig, s.kingdom, 'truce')) continue;
    const ratio = Math.max(0.5, Math.min(3, territorySize(sim, N.id) / Math.max(1, territorySize(sim, O.id))));
    let p = 0.004 * ratio * (O.war?.with === N.id ? 3 : 1) * (O.treasury > 800 ? 1.4 : 1);
    if (!R.chance(p)) continue;
    const from = N.name;
    s.kingdom = orig;
    for (const id of s.buildings) { const b = sim.building(id); if (b) b.kingdom = orig; }
    O.relations[N.id] = Math.max(-100, O.relations[N.id] - 5); N.relations[O.id] = Math.max(-100, N.relations[O.id] - 12);
    sim.news(`${s.name}の人々が${from}の支配に反発して蜂起し、ふたたび${O.name}に戻った`, 3, s);
    sim.chron(`${s.name}の人々が蜂起し、${from}の支配を脱して${O.name}に戻った`, orig);
    for (const p2 of sim.living()) if (p2.s === s.id && sim.isAdult(p2)) sim.remember(p2, `みんなで立ち上がり、${s.name}は${O.name}に戻った`, { emo: 0.7, imp: 0.9, k: 'war' });
    X.stats.uprisings = (X.stats.uprisings || 0) + 1;
  }
  watchCessions(sim);
}

// politics.js の endWar から呼ぶ（呼ばれなくても、次の日に自分で気づいて同じことをする）
export function expansionWarEnded(sim, winner, loser) {
  const X = ensureExpansion(sim);
  watchCessions(sim);
  let rec = X.wars.find((q) => !q.ended && ((q.a === winner.id && q.b === loser.id) || (q.a === loser.id && q.b === winner.id)));
  if (!rec) { rec = { key: `peace@${sim.today}`, a: winner.id, b: loser.id, since: sim.today, name: '戦', seized: [], ended: false }; X.wars.push(rec); }
  settlePeace(sim, rec, winner, loser);
  if (X._borders) { X._borders = false; sim.events.push({ type: 'borders' }); }
}

// politics.js の declareWar から呼ぶ：本当の争いの種と、前線の場所
export function expansionWarReason(sim, a, b) {
  const S = sim.S, X = S.expansion;
  if (!X) return null;
  const cmap = contacts(sim);
  const border = cmap[`${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`] || [];
  // 相手の開拓村・砦が国境の近くにある
  const fr = S.world.settlements.find((s) => s.frontier && !s.abandoned && s.kingdom === b.id && border.some((p) => p.some((ci) => cheb(cCenter(ci).x, cCenter(ci).z, s.x, s.z) <= 16)));
  if (fr) return { reason: `開拓地${fr.name}の帰属をめぐって`, front: { x: fr.x + FR + 2, z: fr.z }, kind: 'frontier' };
  // 資源のある国境の区画
  const rich = border.flat().filter((ci) => X.res[ci]?.some((r) => ['ore', 'gem', 'salt', 'harbor', 'fertile'].includes(r)));
  if (rich.length) {
    const ci = rich[0], c = cCenter(ci);
    const r = X.res[ci].find((x) => ['ore', 'gem', 'salt', 'harbor', 'fertile'].includes(x));
    return { reason: `国境の${RES_NAME[r]}をめぐって`, front: sim.randomNear(c.x, c.z, 4) || c, kind: 'resource' };
  }
  if (border.length) { const c = cCenter(border[0][0]); return { reason: '国境の線引きをめぐって', front: sim.randomNear(c.x, c.z, 4) || c, kind: 'border' }; }
  return null;
}

// ---------- 画面 ----------
export function expansionNationHTML(sim, k, esc = (s) => s) {
  const S = sim.S, X = S.expansion, tr = S.territory;
  if (!X || !tr) return '';
  const size = territorySize(sim, k.id);
  const init = tr.init[k.id] || 0;
  const diff = size - init;
  const res = {};
  for (let ci = 0; ci < NC; ci++) if (tr.owner[ci] === k.id) for (const r of X.res[ci] || []) res[r] = (res[r] || 0) + 1;
  const resTxt = Object.entries(res).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${RES_NAME[r]}${n}`).join('、') || 'なし';
  const projs = X.projects.filter((p) => p.k === k.id && (ACTIVE.has(p.stage) || (p.stage === 'settle' && sim.today - (p.settledDay ?? p.sday) < 40)));
  const pTxt = projs.map((p) => {
    const s = p.sid != null ? S.world.settlements[p.sid] : null;
    const nm = s ? s.name : p.name || `${p.dir || ''}の${p.kind === 'explore' ? '未踏の地' : '開拓地'}`;
    const n = p.kind === 'village' ? `・${aliveMembers(sim, p).length}人` : '';
    const at = p.x != null ? p.x : cCenter(p.ci).x, az = p.z != null ? p.z : cCenter(p.ci).z;
    return `<span class="link" data-goto="${at},${az}">${esc(nm)}</span>（${STAGE_NAME[p.stage]}${n}）`;
  }).join('<br>') || 'なし';
  const fr = S.world.settlements.filter((s) => s.frontier && s.kingdom === k.id && !s.abandoned).map((s) => esc(s.name)).join('、');
  const pacts = X.pacts.filter((p) => p.a === k.id || p.b === k.id).map((p) => `${p.type === 'alliance' ? '同盟' : '休戦'}：${esc(kshort(p.a === k.id ? p.b : p.a))}（あと${p.until - sim.today}日）`).join('、');
  return `<dt>領土</dt><dd>${size}区画（約${size * EXP_CS * EXP_CS}マス）<b class="${diff > 0 ? 'down' : diff < 0 ? 'up' : ''}">${diff >= 0 ? '+' : ''}${diff}</b></dd>
    <dt>開拓</dt><dd>${pTxt}</dd>
    ${fr ? `<dt>開拓村</dt><dd>${fr}</dd>` : ''}
    <dt>資源</dt><dd>${resTxt}</dd>
    ${pacts ? `<dt>約束</dt><dd>${pacts}</dd>` : ''}`;
}

// ミニマップ：国境線・知られていない土地の霧・開拓地の印（ミニマップは1マス=1点）
export function drawTerritory(sim, g, opt = {}) {
  const S = sim.S, tr = S.territory, ex = S.explored;
  if (!tr) return;
  const sc = opt.scale || 1;
  const cs = EXP_CS * sc;
  // 霧：どの国にも知られていない区画
  if (ex && opt.fog !== false) {
    g.fillStyle = 'rgba(12,14,24,0.55)';
    for (let ci = 0; ci < NC; ci++) if (!ex[ci]) g.fillRect((ci % CW) * cs, Math.floor(ci / CW) * cs, cs, cs);
  }
  // 国境線
  g.lineWidth = Math.max(1, sc);
  for (let ci = 0; ci < NC; ci++) {
    const o = tr.owner[ci]; if (o < 0) continue;
    const x0 = (ci % CW) * cs, z0 = Math.floor(ci / CW) * cs;
    g.strokeStyle = KINGDOMS[o]?.color || '#fff';
    const cx = ci % CW, cz = Math.floor(ci / CW);
    g.beginPath();
    if (cx === CW - 1 || tr.owner[ci + 1] !== o) { g.moveTo(x0 + cs - 0.5, z0); g.lineTo(x0 + cs - 0.5, z0 + cs); }
    if (cx === 0 || tr.owner[ci - 1] !== o) { g.moveTo(x0 + 0.5, z0); g.lineTo(x0 + 0.5, z0 + cs); }
    if (cz === CHN - 1 || tr.owner[ci + CW] !== o) { g.moveTo(x0, z0 + cs - 0.5); g.lineTo(x0 + cs, z0 + cs - 0.5); }
    if (cz === 0 || tr.owner[ci - CW] !== o) { g.moveTo(x0, z0 + 0.5); g.lineTo(x0 + cs, z0 + 0.5); }
    g.stroke();
  }
  // 開拓中の土地
  const blink = (Math.floor(Date.now() / 500) % 2) === 0;
  for (const p of S.expansion?.projects || []) {
    if (!ACTIVE.has(p.stage)) continue;
    const x = p.x != null ? p.x : cCenter(p.ci).x, z = p.z != null ? p.z : cCenter(p.ci).z;
    g.fillStyle = blink ? '#ffe070' : (KINGDOMS[p.k]?.color || '#fff');
    g.fillRect(x * sc - 1.5 * sc, z * sc - 1.5 * sc, 3 * sc, 3 * sc);
  }
}

// 会話・心の声に使える一言（speech.js から使う場合）
export function expansionThought(sim, p) {
  if (p.expProj == null) return null;
  const pr = sim.S.expansion?.projects.find((q) => q.id === p.expProj);
  if (!pr) return null;
  const t = {
    clear: ['この森を切り開けば、自分の畑が持てる', '腕が棒のようだ……でも、あと少し'],
    fence: ['柵ができるまでは、夜が怖い', '杭をあと何本打てばいいんだ'],
    build: ['自分の家が建つなんて、夢みたいだ', '春には、この畑に麦が揺れるはずだ'],
  }[pr.stage];
  return t ? sim.rng.pick(t) : null;
}

// 試験・画面用のまとめ
export function expansionSummary(sim) {
  const S = sim.S, X = S.expansion;
  if (!X) return null;
  return {
    size: S.kingdoms.map((k) => territorySize(sim, k.id)),
    init: S.territory.init.slice(),
    explored: S.explored.filter((v) => v).length,
    projects: X.projects.map((p) => `${kshort(p.k)}:${p.kind}:${p.name || '-'}:${p.stage}`),
    frontier: S.world.settlements.filter((s) => s.frontier).map((s) => `${s.name}(${kshort(s.kingdom)})`),
    stats: { ...X.stats },
  };
}
