// 町の暮らしを支える建物（開発部）
//
// 宿屋（酒場とは別の旅籠）・公衆浴場・図書館・劇場・仕立て屋・薬屋・よろず屋・穀物倉・孤児院・墓地。
// 調べた一覧と出典は docs/建物の一覧.md。
//
// ■ 本体からの呼び方（部長がつなぐ。くわしくは報告のコード片）
//   ensureBuildings(sim, fresh)      … newWorld の最後で ensureBuildings(this, true)、load の最後で ensureBuildings(this)
//                                       足りない建物を町に建て（世界ができたとき・古いセーブは無料で）、働き手を決める
//   buildingsPlace(sim, p, kind)     … placeFor の civicPlace のすぐあと。宿に泊まる人の寝床、新しい仕事場、墓地など
//   buildingsOptions(sim, p, add)    … decide の civicOptions のあと。湯に行く・本を読む・芝居を見る・服を買う・薬を買う・巡礼
//   buildingsArrive(sim, p, a)       … arrive の最後。宿代・入浴料・木戸銭・服や薬の代金を払う。宿の寝台の割り当て
//   buildingsDo(sim, p, dt)          … doAction の最後。湯・読書・芝居の効き目
//   buildingsWork(sim, p, dt, eff)   … doWork の default（civicWork のあと）。新しい仕事の中身と給金
//   buildingsDaily(sim)              … newDay で1日1回。服のすり切れ・汚れ、穀物倉、孤児院、働き手の補充、新しい町への普請
//   lodgingKeeper(sim, sid)          … property.js の宿住まいの宿代の受け取り手（宿の主。いなければ酒場の主）
//   BLD_LABEL / BLD_GO / BLD_PREF / BLD_TYPE_LABEL / buildingRows(sim, b) … ui.js 用
//
// ■ お金の流れ（どこからも湧かせない）
//   宿代・馬小屋代   客の財布／家計 → 宿の主の家計（いなければ町の蓄え）
//   入浴料          客 → 湯屋の主（入ったときに払う）
//   芝居の木戸銭     客 → その晩に舞台に立つ役者たちで山分け
//   服の代金        客 → 仕立て屋（仕立て屋は布を市場から買う：仕立て屋 → 市場の金庫）
//   薬の代金        客 → 薬師・錬金術師（薬は市場から仕入れる：薬師 → 市場の金庫）
//   図書館          使うのは無料。司書の給金は給料日（7日ごと）に町の蓄え（足りなければ国庫）から、働いた日数ぶん
//   穀物倉          町の蓄え → 市場の金庫（秋に小麦を買い入れる）。飢饉には 市場の金庫 → 町の蓄え（安く売り出す）。倉番の給金は給料日に町の蓄えから
//   孤児院          給料日と子を引き取った日に、教会の施し箱 → 孤児院の家計（足りなければ町の蓄え）。
//                   孤児院 → 市場（パンを買う）、孤児院 → 院母（給料日に給金）。巣立つ子には孤児院の家計から支度金
//   よろず屋・湯屋    日の終わりに精算：市場組合が預かった買い物の手数料 → よろず屋の主。湯屋の主 → 市場（その日に焚いた薪の代金）
//   働いている最中にお金が入る処理はない（社長の指示：お金は取り引きでしか動かない）
//   新しい町の普請   町の蓄え → 市場の金庫（材木・石材）と、町の大工・石工・人夫（手間賃）
import { JOBS, GOODS, KINGDOMS } from './data.js';
import { T, W, H, tryPlace, walkable } from './world.js';
import { spendable, pay, earn } from './property.js';
import { restDayFor } from './labor.js';
import { marketBuy, ownStock } from './market.js';
import { wsTake } from './workshop.js';
import { markTilesChanged } from './pathfar.js';
import { consBegin, consPending } from './construct.js'; // 工事の段階（開発部）

// 試験用のお金の見張り：sim._bAudit に総額を数える関数を入れると、この仕組みの中で増えた・減ったお金を sim._bLeak に記録する
const audited = (name, fn) => function (sim, ...a) {
  if (!sim._bAudit) return fn(sim, ...a);
  const m0 = sim._bAudit(); const r = fn(sim, ...a); const d = sim._bAudit() - m0;
  if (Math.abs(d) > 1e-6) { const L = sim._bLeak = sim._bLeak || {}; L[name] = (L[name] || 0) + d; }
  return r;
};

// ---------- 新しい仕事（data.js の JOBS に足す） ----------
export const BLD_JOBS = {
  hostkeeper: { name: '宿の主', place: 'inn', rank: 'citizen' },
  bathkeeper: { name: '湯屋の主', place: 'bathhouse', rank: 'commoner' },
  librarian: { name: '司書', place: 'library', rank: 'citizen', research: 0.3 },
  actor: { name: '役者', place: 'theater', rank: 'commoner' },
  shopkeeper: { name: 'よろず屋の主', place: 'genstore', rank: 'commoner' },
  granarian: { name: '倉番', place: 'granary', rank: 'commoner' },
  matron: { name: '孤児院の院母', place: 'orphanage', rank: 'commoner' },
};
for (const [k, v] of Object.entries(BLD_JOBS)) if (!JOBS[k]) JOBS[k] = v;

// ---------- ui.js 用のラベル ----------
export const BLD_LABEL = {
  bathe: '湯屋で湯に浸かっている', read: '図書館で本を読んでいる', watchplay: '劇場で芝居を見ている', act: '舞台で芝居をしている',
  buyclothes: '仕立て屋で服をあつらえている', buymed: '薬屋で薬を買っている', pilgrim: '巡礼の旅をしている', pilgrimback: '巡礼から帰る道中',
};
export const BLD_GO = {
  bathe: '湯屋へ向かっている', read: '図書館へ向かっている', watchplay: '芝居を見に劇場へ向かっている', act: '劇場の楽屋へ向かっている',
  buyclothes: '仕立て屋へ向かっている', buymed: '薬屋へ向かっている', pilgrim: '巡礼の旅に出ている', pilgrimback: '巡礼から家へ帰るところ',
};
export const BLD_PREF = { bathe: '湯屋', read: '読書', watchplay: '芝居見物', act: '芝居', buyclothes: '服の新調', buymed: '薬', pilgrim: '巡礼', pilgrimback: '巡礼' };
export const BLD_TYPE_LABEL = {
  inn: '宿屋（旅籠）', bathhouse: '公衆浴場', library: '図書館', theater: '劇場', tailorshop: '仕立て屋', apothecary: '薬屋',
  genstore: 'よろず屋', granary: '穀物倉', orphanage: '孤児院', cemetery: '墓地',
};
export const BLD_TYPES = new Set(Object.keys(BLD_TYPE_LABEL));

// 建物ごとの働き手（仕事の名前と人数）
const STAFF = {
  inn: { job: 'hostkeeper', n: 1 }, bathhouse: { job: 'bathkeeper', n: 1 }, library: { job: 'librarian', n: 1 }, theater: { job: 'actor', n: 2 },
  genstore: { job: 'shopkeeper', n: 1 }, granary: { job: 'granarian', n: 1 }, orphanage: { job: 'matron', n: 1 },
  tailorshop: { job: 'tailor', n: 1 }, apothecary: { job: 'herbalist', n: 1 }, cemetery: { job: 'gravedigger', n: 1 },
};
// ほかの仕事から回してよい人（町にこの人数より多くいるときだけ）
const SPARE = { gatherer: 3, hunter: 2, fisher: 3, farmer: 4, militia: 2, laundress: 1, roadworker: 2, innkeeper: 1, musician: 1, priest: 1, midwife: 1, peddler: 1, coachman: 1, sailor: 2, diver: 1, beggar: 0, wanderer: 0 };
const SPARE_FOR = { actor: ['troupe', 'bard', 'dancer', 'musician'], librarian: ['scribe', 'teacher', 'scholar'], matron: ['nun', 'nanny', 'midwife'], granarian: [] };   // 粉屋は倉番に引き抜かない（粉屋が0人になっていた）
const OK_RANK = new Set(['commoner', 'citizen', 'homeless', 'wanderer']);

// 料金（銅貨）。町の格で違う
const FEE = {
  inn: { capital: 4, port: 3, village: 2 }, stable: 1,
  bath: { capital: 2, port: 1, village: 1 },
  play: { capital: 3, port: 2, village: 2 },
};
const grade = (s) => (s.type === 'capital' ? 'capital' : s.type === 'port' || s.grade === 'town' ? 'port' : 'village');

// ---------- 状態 ----------
function B_(sim) {
  const S = sim.S;
  if (!S.bld) S.bld = { v: 1, at: {}, nights: {}, gran: {}, orph: {}, show: {}, next: {}, stats: { lodge: 0, lodgeStable: 0, lodgeRough: 0, bathe: 0, read: 0, watch: 0, clothes: 0, med: 0, pilgrim: 0, orphan: 0, fostered: 0, built: 0, graRelease: 0, graBuy: 0 }, day: {} };
  const B = S.bld;
  B.at = B.at || {}; B.nights = B.nights || {}; B.gran = B.gran || {}; B.orph = B.orph || {}; B.show = B.show || {}; B.next = B.next || {}; B.stats = B.stats || {}; B.day = B.day || {};
  return B;
}
const alive = (p) => p && p.deathYear == null && p.needs;
const doorOf = (b) => ({ x: b.door.x, z: b.door.z, bld: b.open || b.yard ? null : b.id });
const bOf = (sim, sid, type) => { const id = sim.S.bld?.at?.[sid]?.[type]; return id != null ? sim.building(id) : null; };
const nightKey = (sim) => Math.floor((sim.S.t - 720) / 1440);
const eligible = (sim, s) => s && !s.tribe && !s.tribal && sim.S.towns?.[s.id];

// ================================================================ 宿屋の部屋と寝台（内装とシミュレーションで同じものを使う）
// 部屋は3マス幅。two：寝台2台、dbl：夫婦用の大きな寝台、one：寝台1台と机、common：大部屋（二段寝台3台＝6人）
export function innPlan(Wd, Dd) {
  const rows = Dd >= 12 ? 2 : 1;
  const cells = Math.floor(Wd / 3);
  const pat = Wd >= 17 ? [['common', 'two', 'dbl', 'two', 'dbl'], ['two', 'dbl', 'two', 'one', 'two', 'dbl']]
    : Wd >= 14 ? [['two', 'dbl', 'two', 'one', 'dbl'], ['two', 'dbl', 'one', 'two', 'one']]
      : [['two', 'dbl', 'one', 'two'], []];
  const rooms = [], beds = [];
  for (let r = 0; r < rows; r++) {
    let x = 0;
    const z0 = r === 0 ? 0 : 6;          // 北の列は z=0..2、南の列は z=6..8（z=3 と z=5 は部屋の壁、z=4 は廊下）
    for (const kind of pat[r]) {
      const w = kind === 'common' ? 6 : 3;
      if (x + w > cells * 3) break;
      const room = { i: rooms.length, kind, x, z: z0, w, d: 3, row: r, door: x + 1 };
      rooms.push(room);
      const bz = r === 0 ? z0 : z0 + 1;  // 南の列は廊下側を空ける
      if (kind === 'common') for (const dx of [0, 2, 4]) { beds.push({ x: x + dx + 0.05, z: bz, room: room.i, bunk: 0 }); beds.push({ x: x + dx + 0.05, z: bz, room: room.i, bunk: 1 }); }
      else if (kind === 'two') { beds.push({ x: x + 0.05, z: bz, room: room.i }); beds.push({ x: x + 1.95, z: bz, room: room.i }); }
      else if (kind === 'dbl') beds.push({ x: x + 0.7, z: bz, room: room.i, double: true });
      else beds.push({ x: x + 0.05, z: bz, room: room.i });
      x += w;
    }
  }
  const hallZ = rows === 2 ? 9 : 4;
  return { rooms, beds, rows, hallZ };
}
// 建物の中の広さ（interior.js の sizeOf が先に聞く）
export function bldInteriorSize(b) {
  switch (b.type) {
    case 'inn': { const a = b.w * b.d; return a >= 20 ? [18, 14] : a >= 12 ? [15, 12] : [12, 10]; }
    case 'bathhouse': return [14, 11];
    case 'library': return [15, 12];
    case 'theater': return [16, 14];
    case 'tailorshop': return [10, 9];
    case 'apothecary': return [10, 9];
    case 'genstore': return [11, 9];
    case 'granary': return [12, 10];
    case 'orphanage': return [15, 12];
    case 'cemetery': return [14, 12];
  }
  return null;
}
const planCache = new Map();
function innBeds(b) {
  const [Wd, Dd] = bldInteriorSize(b);
  const k = Wd * 100 + Dd;
  if (!planCache.has(k)) planCache.set(k, innPlan(Wd, Dd).beds);
  return planCache.get(k);
}

// ================================================================ どの町に何を建てるか
const NAMES = {
  inn: { capital: ['旅籠「銀の鐘亭」', '旅籠「白鳥亭」', '旅籠「王冠亭」'], port: ['旅籠「錨亭」', '旅籠「海鳥亭」'], village: ['旅籠「麦わら亭」', '旅籠「樫の木亭」', '旅籠「宿り木亭」'], south: ['キャラバンサライ', '隊商宿「砂の星」'] },
  bathhouse: { any: ['公衆浴場', '湯屋'], south: ['ハンマーム（蒸し風呂）'] },
  library: { any: ['王立図書館'], south: ['知恵の館（図書館）'] },
  theater: { any: ['劇場「月の舞台」', '芝居小屋'], south: ['劇場「千夜の舞台」'] },
  tailorshop: { any: ['仕立て屋'] }, apothecary: { any: ['薬屋'], south: ['薬種商の店'] },
  genstore: { any: ['よろず屋'] }, granary: { any: ['穀物倉'] }, orphanage: { any: ['孤児院「幼子の家」'], south: ['孤児の家（ワクフ）'] },
  cemetery: { any: ['墓地'] },
};
function nameFor(sim, s, type) {
  const N = NAMES[type], south = KINGDOMS[s.kingdom]?.south || s.kingdom === 2;
  const list = (south && N.south) || N[grade(s)] || N.any;
  return sim.rng.pick(list);
}
// [type, 幅, 奥行き, 条件]
const SIZE = { inn: { capital: [5, 4], port: [4, 3], village: [3, 3] }, bathhouse: [4, 3], library: [4, 3], theater: [5, 4], tailorshop: [2, 2], apothecary: [2, 2], genstore: [3, 2], granary: [3, 2], orphanage: [4, 3], cemetery: [4, 3] };
function wants(sim, s, pop) {
  const g = grade(s), out = [];
  const cap = s.type === 'capital', port = s.type === 'port', town = s.grade === 'town', hamlet = s.frontier && s.grade !== 'town';
  const hasMarket = s.buildings.some((id) => sim.building(id)?.type === 'market');
  const add = (type) => out.push(type);
  // 大事な順
  if (cap || port || town || (!hamlet && pop >= 10) || pop >= 25) add('inn');
  if (pop >= 8) add('cemetery');
  if (!hasMarket && pop >= 10) add('genstore');
  if (cap || (!port && !hamlet && pop >= 10) || pop >= 20) add('granary');
  if (cap || ((port || town) && pop >= 18) || pop >= 30) add('bathhouse');
  if (cap || ((port || town) && pop >= 25)) add('apothecary');
  if (cap || pop >= 35) add('tailorshop');
  if (cap) { add('orphanage'); add('library'); add('theater'); }
  return out;
}
function sizeOf(s, type) { const z = SIZE[type]; return Array.isArray(z) ? z : z[grade(s)]; }

// 町に建物を置く。まず町の中、足りなければ縁を広げる（王都は城壁の外の街道ぞい）
const LAND = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH];
const LAND_WIDE = [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH, T.DENSE, T.JUNGLE];
function placeInTown(sim, s, type, runtime) {
  const w = sim.S.world, R = sim.rng;
  const [bw, bd] = sizeOf(s, type);
  const name = nameFor(sim, s, type);
  const far = type === 'cemetery' || type === 'granary';
  const extra = type === 'cemetery' ? { bldNew: true } : { bldNew: true };
  const streetsIn = (r0, r1) => {
    const out = [];
    for (let z = s.z - r1; z <= s.z + r1; z++) for (let x = s.x - r1; x <= s.x + r1; x++) {
      if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
      const t = w.tiles[z * W + x];
      if (t !== T.ROAD && t !== T.PLAZA) continue;
      const ch = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
      if (ch < r0 || ch > r1) continue;
      const d = Math.abs(x - s.x) + Math.abs(z - s.z);
      out.push({ x, z, d: (far ? -d : d) + R.next() * 2 });
    }
    return out.sort((a, b) => a.d - b.d);
  };
  let b = null;
  const RR = s.type === 'capital' ? s.r + 1 : s.r + (s.extraR || 0);
  // 決めた大きさで置けなければ、ひと回り小さくして探す
  for (const [ww, dd] of [[bw, bd], [bw, Math.max(2, bd - 1)], [Math.max(2, bw - 1), Math.max(2, bd - 1)]]) {
    if (b) break;
    if (s.type === 'capital') {
      b = tryPlace(w, { x: s.x, z: s.z, r: s.r, id: s.id, kingdom: s.kingdom }, streetsIn(0, s.r), type, name, ww, dd, { extra }, R);
      for (let k = 1; !b && k <= 6; k++) b = tryPlace(w, { x: s.x, z: s.z, r: RR + k * 4, id: s.id, kingdom: s.kingdom }, streetsIn(RR + 1, RR + k * 4), type, name, ww, dd, { extra, land: LAND_WIDE }, R, RR);
    } else {
      b = tryPlace(w, { x: s.x, z: s.z, r: RR, id: s.id, kingdom: s.kingdom }, streetsIn(0, RR), type, name, ww, dd, { extra }, R);
      for (let k = 1; !b && k <= 5; k++) b = tryPlace(w, { x: s.x, z: s.z, r: RR + k * 3, id: s.id, kingdom: s.kingdom }, streetsIn(0, RR + k * 3), type, name, ww, dd, { extra, land: LAND_WIDE }, R);
    }
  }
  if (!b) return null;
  if (s.kingdom == null) b.kingdom = null;
  // 墓地は中を歩ける庭（墓石のあいだを歩く）
  if (type === 'cemetery') { for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) w.tiles[z * W + x] = T.PLAZA; b.yard = true; }
  s.buildings.push(b.id);
  const B = B_(sim);
  (B.at[s.id] = B.at[s.id] || {})[type] = b.id;
  if (type === 'granary') B.gran[s.id] = B.gran[s.id] || { wheat: 0 };
  if (runtime) {
    const list = [];
    for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++) list.push(z * W + x);
    try { markTilesChanged(w, list); } catch (e) { /* 道探しの区画がまだないときは何もしない */ }
    sim.events.push({ type: 'building', id: b.id });
  }
  B.stats.built = (B.stats.built || 0) + 1;
  return b;
}

// 町ごとの建物の表（id）を作り直す
function indexTown(sim, s) {
  const B = B_(sim), m = {};
  for (const id of s.buildings) { const b = sim.building(id); if (b && BLD_TYPES.has(b.type) && m[b.type] == null) m[b.type] = id; }
  B.at[s.id] = m;
  return m;
}
const popOf = (sim) => { const c = {}; for (const p of sim.living()) c[p.s] = (c[p.s] || 0) + 1; return c; };

// ================================================================ 状態の用意（世界ができたとき・古いセーブ）
export function ensureBuildings(sim, fresh = false) {
  const S = sim.S, B = B_(sim);
  const pop = popOf(sim);
  for (const s of S.world.settlements) {
    if (!eligible(sim, s)) continue;
    const m = indexTown(sim, s);
    for (const type of wants(sim, s, pop[s.id] || 0)) if (m[type] == null) placeInTown(sim, s, type, false);
  }
  if (fresh) adoptHistoricOrphans(sim);
  for (const s of S.world.settlements) if (eligible(sim, s)) staffTown(sim, s, 99);
  moveLodgers(sim);
  return B;
}

// ================================================================ 働き手
function staffTown(sim, s, maxHire = 1) {
  const S = sim.S, B = B_(sim), m = B.at[s.id] || {};
  let hired = 0;
  const locals = sim.living().filter((p) => p.s === s.id);
  const count = {};
  for (const p of locals) count[p.job] = (count[p.job] || 0) + 1;
  for (const [type, id] of Object.entries(m)) {
    const st = STAFF[type];
    if (!st || id == null) continue;
    while ((count[st.job] || 0) < st.n && hired < maxHire) {
      const pref = SPARE_FOR[st.job] || [];
      const cands = locals.filter((p) => {
        const a = sim.ageOf(p);
        // 院母・司書・倉番・墓守は、隠居した年寄りにも頼める
        const gentle = ['matron', 'librarian', 'granarian', 'gravedigger'].includes(st.job) && !p.job && a <= 72;
        if (a < 18 || (a > 60 && !gentle) || p.jail != null || S.wanted?.[p.id] || !OK_RANK.has(p.rank) || p.mission || p.party != null) return false;
        const h = sim.hh(p); if (!h || h.bandits || h.royal) return false;
        if (pref.includes(p.job)) return true;
        const keep = SPARE[p.job];
        return !p.job || (keep != null && (count[p.job] || 0) > keep);
      });
      if (!cands.length) break;
      cands.sort((a, b) => (pref.includes(b.job) ? 1 : 0) - (pref.includes(a.job) ? 1 : 0) || (count[b.job] || 0) - (count[a.job] || 0));
      const p = cands[0];
      const old = p.job;
      count[old] = (count[old] || 1) - 1;
      p.job = st.job; count[st.job] = (count[st.job] || 0) + 1;
      if (OK_RANK.has(p.rank) && (p.rank === 'homeless' || p.rank === 'wanderer' || JOBS[st.job].rank === 'citizen')) p.rank = JOBS[st.job].rank;
      p.skill = p.skill || {}; p.skill[st.job] = Math.max(p.skill[st.job] || 0, 0.3);
      if (p.memories) sim.remember(p, `${JOBS[old]?.name || '無職'}をやめて、${sim.building(id).name}の${JOBS[st.job].name}になった`, { emo: 0.5, imp: 0.7, k: 'job' });
      hired++;
      if (p.action && p.action.type === 'work') p.action = null;
    }
  }
  return hired;
}
// 町でその仕事をしている人（いなければ null）。同じ建物の中にいる人を先に
function workerOf(sim, sid, job, bid = null) {
  let best = null;
  for (const q of sim.living()) {
    if (q.s !== sid || q.job !== job || !q.needs || q.jail != null) continue;
    if (bid != null && q.inside === bid) return q;
    if (!best) best = q;
  }
  return best;
}
// 宿住まい（property.js）の宿代の受け取り手
export function lodgingKeeper(sim, sid) {
  return workerOf(sim, sid, 'hostkeeper') || workerOf(sim, sid, 'innkeeper');
}
// 受け取り手の家計へ（いなければ町の蓄えへ）
function payTo(sim, p, amt, keeper, sid) {
  if (amt <= 0) return 0;
  pay(sim, p, amt);
  if (keeper && sim.hh(keeper)) earn(sim, keeper, amt, 0.3);
  else sim.S.towns[sid].fund = (sim.S.towns[sid].fund || 0) + amt;
  return amt;
}

// ================================================================ 宿屋に泊まる人
// 宿住まい（hh.inn）・家のない旅の人・よその町に来ている人（巡礼・行商・旅芸人など）
function lodgerKind(sim, p, hh) {
  if (!hh || hh.bandits || hh.royal || hh.orphanage || p.jail != null) return null;
  if (hh.inn) return hh.s === p.s ? 'resident' : 'guest';
  if (hh.house == null) return hh.street ? 'poor' : 'guest';
  if (hh.s !== p.s) {
    const home = sim.town(hh.s), here = sim.townOf(p);
    if (home && here && Math.hypot(home.x - here.x, home.z - here.z) > 14) return 'guest';
  }
  return null;
}
export function buildingsPlace(sim, p, kind) {
  const B = sim.S.bld;
  if (!B) return null;
  const at = B.at[p.s];
  if (!at) return null;
  switch (kind) {
    case 'home': {
      if (at.inn == null) return null;
      const hh = sim.hh(p);
      const k = lodgerKind(sim, p, hh);
      if (!k) return null;
      const inn = sim.building(at.inn);
      const s = sim.townOf(p);
      const fee = FEE.inn[grade(s)];
      if (k === 'resident' || spendable(sim, p) >= fee + 2) return doorOf(inn);
      if (k === 'poor' && spendable(sim, p) >= FEE.stable) return doorOf(inn);   // 馬小屋の隅を借りる
      return null;
    }
    case 'inn': case 'bathhouse': case 'library': case 'theater': case 'tailorshop': case 'apothecary': case 'genstore': case 'granary': case 'orphanage': {
      const id = at[kind];
      if (id != null) return doorOf(sim.building(id));
      const fb = { inn: 'tavern', tailorshop: 'workshop', apothecary: 'clinic', genstore: 'market', orphanage: 'church', library: 'school' }[kind];
      return fb ? sim.placeFor(p, fb) : sim.placeFor(p, 'plaza');
    }
    case 'cemetery': {
      if (at.cemetery != null) { const b = sim.building(at.cemetery); return yardSpot(sim, b); }
      return sim.placeFor(p, 'church');
    }
    case 'church': if (p.job === 'gravedigger' && at.cemetery != null) return yardSpot(sim, sim.building(at.cemetery)); return null;
    case 'workshop': if (p.job === 'tailor' && at.tailorshop != null) return doorOf(sim.building(at.tailorshop)); return null;
    case 'clinic': if ((p.job === 'herbalist') && at.apothecary != null) return doorOf(sim.building(at.apothecary)); return null;
    case 'magictower': if (p.job === 'alchemist' && at.apothecary != null && (p.id + sim.today) % 2 === 0) return doorOf(sim.building(at.apothecary)); return null;
    case 'observatory': if (p.job === 'scholar' && at.library != null && (p.id + sim.today) % 3 !== 0) return doorOf(sim.building(at.library)); return null;
    case 'market': {
      if (at.genstore == null) return null;
      const s = sim.townOf(p);
      if (s.buildings.some((id) => sim.building(id)?.type === 'market')) return null;
      return doorOf(sim.building(at.genstore));
    }
  }
  return null;
}
function yardSpot(sim, b) {
  for (let k = 0; k < 6; k++) {
    const x = b.x + sim.rng.int(0, b.w - 1), z = b.z + sim.rng.int(0, b.d - 1);
    if (walkable(sim.S.world.tiles[z * W + x])) return { x, z };
  }
  return { x: b.door.x, z: b.door.z };
}

// 寝台を割り当てる。空きがなければ馬小屋、それもなければ野宿
function lodge(sim, p, b) {
  const B = B_(sim), S = sim.S;
  const nk = nightKey(sim);
  let rec = B.nights[b.id];
  if (!rec || rec.n !== nk) rec = B.nights[b.id] = { n: nk, g: {}, st: 0 };
  if (rec.g[p.id] != null) return;   // 今夜はもう寝台がある
  const hh = sim.hh(p), s = sim.townOf(p);
  const kind = lodgerKind(sim, p, hh);
  const beds = innBeds(b);
  const used = new Map();
  for (const [pid, i] of Object.entries(rec.g)) if (i >= 0) used.set(i, [...(used.get(i) || []), +pid]);
  let bed = -1;
  // 連れ合いが夫婦用の寝台にいれば、そこへ
  if (p.spouseId != null && rec.g[p.spouseId] != null && rec.g[p.spouseId] >= 0) { const i = rec.g[p.spouseId]; if (beds[i]?.double && (used.get(i) || []).length < 2) bed = i; }
  if (bed < 0) {
    const spouseHere = p.spouseId != null && S.people[p.spouseId]?.s === p.s && sim.hh(S.people[p.spouseId]) === hh;
    const free = beds.map((x, i) => i).filter((i) => !used.has(i));
    const pref = spouseHere ? free.filter((i) => beds[i].double) : free.filter((i) => !beds[i].double);
    bed = (pref.length ? pref : free)[0] ?? -1;
  }
  const fee = FEE.inn[grade(s)];
  const keeper = workerOf(sim, p.s, 'hostkeeper', b.id) || lodgingKeeper(sim, p.s);
  if (bed >= 0 && (kind === 'resident' || (kind !== 'poor' && spendable(sim, p) >= fee))) {
    rec.g[p.id] = bed;
    if (kind !== 'resident') payTo(sim, p, fee, keeper, p.s);
    B.stats.lodge++;
    if (p.memories && sim.rng.chance(0.08)) sim.remember(p, `${b.name}に泊まった。${beds[bed].double ? '夫婦用の広い寝台だった' : beds[bed].bunk != null ? '大部屋の二段寝台で、いびきがうるさかった' : 'こぢんまりした部屋だった'}`, { emo: 0.2, imp: 0.25, k: 'lodge' });
    return;
  }
  // 満室か、宿代が足りない：馬小屋か野宿
  rec.g[p.id] = -1;
  const stable = s.buildings.map((id) => sim.building(id)).find((x) => x && x.type === 'stable' && Math.hypot(x.x - b.x, x.z - b.z) < 16);
  if (spendable(sim, p) >= FEE.stable) {
    payTo(sim, p, FEE.stable, keeper, p.s);
    rec.st++;
    B.stats.lodgeStable++;
    if (stable) { p.inside = stable.id; p.pos = { x: stable.door.x, z: stable.door.z }; if (p.action) p.action.bld = stable.id; }
    else { p.inside = null; if (p.action) p.action.bld = null; p.pos = { x: b.door.x + (sim.rng.chance(0.5) ? 1 : -1), z: b.door.z }; }
    if (p.memories && sim.rng.chance(0.3)) sim.remember(p, bed < 0 ? `${b.name}は満室で、馬小屋のわらの上で寝た` : `宿代が足りず、${b.name}の馬小屋の隅を借りて寝た`, { emo: -0.3, imp: 0.35, k: 'lodge' });
    return;
  }
  B.stats.lodgeRough++;
  p.inside = null; if (p.action) p.action.bld = null;
  const spot = sim.randomNear(b.door.x, b.door.z, 3, (t) => t !== T.BLD);
  if (spot) p.pos = spot;
  if (p.memories && sim.rng.chance(0.3)) sim.remember(p, `${b.name}に泊まれず、軒下で夜を明かした`, { emo: -0.5, imp: 0.4, k: 'lodge' });
}

// ================================================================ 行動の候補（decide から）
export function buildingsOptions(sim, p, add) {
  const B = sim.S.bld;
  if (!B || p.jail != null || p.mission || !p.needs) return;
  const at = B.at[p.s];
  const h = sim.hour(), age = sim.ageOf(p), n = p.needs, R = sim.rng, today = sim.today;
  const s = sim.townOf(p);
  const hh = sim.hh(p);
  if (!hh || hh.bandits) return;
  const rest = restDayFor(sim, p);
  // 巡礼から帰る
  if (p.pilgrim) {
    if (p.s !== p.pilgrim.dest) p.pilgrim = null;
    else if (today >= p.pilgrim.until && h >= 6 && h < 15) { const home = sim.town(p.pilgrim.home); if (home) add(8, 'pilgrimback', { x: home.x, z: home.z }, 30); }
  }
  if (!at) { pilgrimOption(sim, p, add, age, h, rest); return; }
  // 役者：夕方から舞台
  if ((p.job === 'actor' || (p.job === 'troupe' && s.type === 'capital')) && at.theater != null && h >= 17 && h < 21.5 && age >= 14) add(7 + (100 - n.esteem) / 30, 'act', doorOf(sim.building(at.theater)), 150);
  // 湯屋
  if (at.bathhouse != null && age >= 6 && h >= 9 && h < 21) {
    const last = p.bldBath ?? -9, due = today - last;
    if (due >= 2) {
      const fee = FEE.bath[grade(s)];
      if (spendable(sim, p) >= fee) add(1.2 + (p.fatigue || 0) / 30 + (p.grime || 0) / 30 + (100 - n.pleasure) / 70 + (rest ? 1 : 0) + Math.min(1.5, due / 4) + (sim.seasonIdx() === 3 ? 0.4 : 0), 'bathe', doorOf(sim.building(at.bathhouse)), R.int(40, 75));
    }
  }
  // 図書館（無料）
  if (at.library != null && age >= 8 && h >= 9 && h < 19 && (p.bldRead ?? -9) < today) {
    const O = p.pers?.O ?? 0.5;
    const study = age < 14 ? (h >= 12 ? 1.4 : 0) : (O - 0.45) * 3 + (['scribe', 'teacher', 'scholar', 'magister', 'sage', 'priest', 'wizard'].includes(p.job) ? 1.2 : 0);
    if (study > 0) add(1.6 + study + (rest ? 0.8 : 0) + (100 - n.pleasure) / 90, 'read', doorOf(sim.building(at.library)), R.int(40, 90));
  }
  // 劇場：役者が舞台に立っている晩だけ
  if (at.theater != null && h >= 17.5 && h < 21.5 && age >= 10 && (p.bldPlay ?? -9) <= today - 2 && p.job !== 'actor') {
    const sh = B.show[p.s];
    if (sh && sh.until > sim.S.t && sh.n > 0) {
      const fee = FEE.play[grade(s)] * (age < 14 ? 0.5 : 1);
      if (spendable(sim, p) >= fee + 3) add(1.8 + (100 - n.pleasure) / 25 + (p.pers?.E ?? 0.5) * 1.2 + (rest ? 1 : 0), 'watchplay', doorOf(sim.building(at.theater)), R.int(60, 100));
    }
  }
  // 仕立て屋：服がすり切れた
  if (age >= 14 && h >= 9 && h < 18 && (p.clothWear || 0) >= 60) {
    const where = at.tailorshop != null ? doorOf(sim.building(at.tailorshop)) : null;
    if (where) {
      const cost = clothesPrice(sim, p.s);
      if (spendable(sim, p) >= cost + 5) add(1.5 + ((p.clothWear || 0) - 60) / 12 + (p.lab?.vanity || 0) * 1.5, 'buyclothes', where, 30);
    }
  }
  // 薬屋：具合が悪い・けがをしている
  if (at.apothecary != null && age >= 10 && h >= 8 && h < 19 && (p.bldMed ?? -9) < today) {
    const sick = p.ail && p.ail.sev < 35, hurt = p.hp < (p.maxhp || 1) * 0.6;
    if (sick || hurt) { const cost = medPrice(sim, p.s); if (spendable(sim, p) >= cost + 2) add(3 + (sick ? p.ail.sev / 15 : 0) + (hurt ? 1.5 : 0), 'buymed', doorOf(sim.building(at.apothecary)), 20); }
  }
  pilgrimOption(sim, p, add, age, h, rest);
}
// 巡礼：信心深い人が、休みの日に王都の大聖堂へ詣でる（よその町では宿に泊まる）
function pilgrimOption(sim, p, add, age, h, rest) {
  if (p.pilgrim || age < 18 || age > 70 || !rest || h < 7 || h >= 10) return;
  const faith = p.values?.faith ?? 0;
  if (faith < 0.72 || (p.bldPil ?? -99) > sim.today - 40 || spendable(sim, p) < 25) return;
  const s = sim.townOf(p);
  if (s.kingdom == null) return;
  const cap = sim.S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === s.kingdom);
  if (!cap || cap.id === p.s || Math.hypot(cap.x - s.x, cap.z - s.z) > 70) return;
  const hh = sim.hh(p);
  if (!hh || hh.s !== p.s) return;
  add(2 + faith * 3, 'pilgrim', { x: cap.x, z: cap.z }, 30, { dest: cap.id });
}
const clothesPrice = (sim, sid) => Math.round((sim.S.towns[sid]?.price?.cloth || 8) * 1.3 + 5);
const medPrice = (sim, sid) => Math.round((sim.S.towns[sid]?.price?.medicine || 10) * 1.2 + 2);

// ================================================================ 着いたとき
export const buildingsArrive = audited('buildingsArrive', arriveImpl);
function arriveImpl(sim, p, a) {
  const B = sim.S.bld;
  if (!B || !a) return;
  const S = sim.S, s = sim.townOf(p), R = sim.rng;
  switch (a.type) {
    case 'sleep': {
      const b = a.bld != null ? sim.building(a.bld) : null;
      if (b && b.type === 'inn') lodge(sim, p, b);
      break;
    }
    case 'bathe': {
      const b = a.bld != null ? sim.building(a.bld) : null;
      if (!b || b.type !== 'bathhouse') break;
      const fee = FEE.bath[grade(s)];
      if (spendable(sim, p) < fee) { a.until = S.t + 5; break; }
      payTo(sim, p, fee, workerOf(sim, p.s, 'bathkeeper', b.id), p.s);
      p.bldBath = sim.today; p.grime = 0;
      B.stats.bathe++;
      (B.day[p.s] = B.day[p.s] || {}).bath = (B.day[p.s].bath || 0) + 1;
      if (p.memories && R.chance(0.06)) sim.remember(p, R.pick([`${b.name}の湯に浸かって、疲れが抜けた`, `${b.name}で近所の人と長話をした`, `${b.name}の蒸し風呂で汗を流した`]), { emo: 0.4, imp: 0.25, k: 'bath' });
      break;
    }
    case 'read': {
      p.bldRead = sim.today; B.stats.read++;
      if (p.memories && R.chance(0.08)) sim.remember(p, `図書館で『${R.pick(BOOKS)}』を読んだ`, { emo: 0.35, imp: 0.3, k: 'read' });
      break;
    }
    case 'act': {
      const sh = B.show[p.s] && B.show[p.s].until > S.t ? B.show[p.s] : (B.show[p.s] = { until: S.t + 150, n: 0, ids: [], play: R.pick(PLAYS), box: 0 });
      if (!sh.ids.includes(p.id)) { sh.ids.push(p.id); sh.n = sh.ids.length; }
      sh.until = Math.max(sh.until, a.until || S.t + 150);
      break;
    }
    case 'watchplay': {
      const sh = B.show[p.s];
      const actors = sh && sh.until > S.t ? sh.ids.map((id) => S.people[id]).filter((q) => alive(q) && q.action?.type === 'act' && q.inside === a.bld) : [];
      if (!actors.length) { a.until = S.t + 5; break; }
      const fee = FEE.play[grade(s)] * (sim.ageOf(p) < 14 ? 0.5 : 1);
      if (spendable(sim, p) < fee) { a.until = S.t + 5; break; }
      pay(sim, p, fee);
      for (const q of actors) earn(sim, q, fee / actors.length, 0.5);
      p.bldPlay = sim.today; B.stats.watch++;
      if (p.memories && R.chance(0.12)) sim.remember(p, `劇場で「${sh.play}」を見た。${R.pick(['涙が止まらなかった', '腹を抱えて笑った', '役者の声に聞きほれた', '筋がよく分からなかった'])}`, { emo: 0.5, imp: 0.35, k: 'play', about: actors.map((q) => q.id).slice(0, 2) });
      break;
    }
    case 'buyclothes': {
      const b = a.bld != null ? sim.building(a.bld) : null;
      const tailor = workerOf(sim, p.s, 'tailor', b?.id) || workerOf(sim, p.s, 'weaver');
      const m = S.towns[p.s];
      a.until = S.t + 25;
      if (!tailor || !sim.hh(tailor) || ((m.stock.cloth || 0) < 1 && (sim.hh(tailor).stock?.cloth || 0) < 1)) { if (p.memories && R.chance(0.3)) sim.remember(p, '仕立て屋に行ったが、布が切れていて服を作ってもらえなかった', { emo: -0.2, imp: 0.2 }); p.clothWear = Math.max(0, (p.clothWear || 0) - 10); break; }
      const cost = clothesPrice(sim, p.s);
      if (spendable(sim, p) < cost) break;
      payTo(sim, p, cost, tailor, p.s);
      // 仕立て屋は布を市場から買う
      const cp = m.price.cloth || GOODS.cloth.base;
      const th = sim.hh(tailor);
      void cp;
      if ((th.stock?.cloth || 0) >= 1) th.stock.cloth -= 1; else marketBuy(sim, p.s, 'cloth', 1, th, { force: true });   // 布の代金は布の持ち主（機織り・商人）へ
      p.clothWear = 0; p.needs.esteem = Math.min(100, p.needs.esteem + 18);
      B.stats.clothes++;
      if (p.memories) sim.remember(p, `${tailor.given}の仕立て屋で、新しい服をあつらえた（${cost}銅貨）`, { emo: 0.5, imp: 0.35, about: [tailor.id], k: 'shop' });
      break;
    }
    case 'buymed': {
      const b = a.bld != null ? sim.building(a.bld) : null;
      const seller = workerOf(sim, p.s, 'herbalist', b?.id) || workerOf(sim, p.s, 'alchemist', b?.id);
      const m = S.towns[p.s];
      a.until = S.t + 15;
      p.bldMed = sim.today;
      if (!seller || !sim.hh(seller)) break;
      const sh = sim.hh(seller);
      let good = (m.stock.medicine || 0) >= 1 ? 'medicine' : (m.stock.herbs || 0) >= 1 ? 'herbs' : null;
      if (!good) { if (p.memories && R.chance(0.3)) sim.remember(p, '薬屋に行ったが、薬が切れていた', { emo: -0.3, imp: 0.3 }); break; }
      const cost = medPrice(sim, p.s);
      if (spendable(sim, p) < cost) break;
      payTo(sim, p, cost, seller, p.s);
      const cp = Math.min(m.price[good] || 5, Math.max(0, sh.money));
      void cp;
      if (wsTake(sim, sh, good, 1, '薬屋の客', cost) < 1) marketBuy(sim, p.s, good, 1, sh, { force: true });   // 薬屋の蔵の薬か、市場で仕入れる（代金は薬の持ち主へ）
      if (p.ail) { p.ail.sev = Math.max(0, p.ail.sev - (good === 'medicine' ? 14 : 8)); p.ail.treated = (p.ail.treated || 0) + 1; }
      p.hp = Math.min(p.maxhp, p.hp + p.maxhp * (good === 'medicine' ? 0.25 : 0.12));
      p.needs.survival = Math.min(100, p.needs.survival + 10);
      B.stats.med++;
      if (p.memories && R.chance(0.4)) sim.remember(p, `${seller.given}の薬屋で${good === 'medicine' ? '煎じ薬' : '薬草'}を買った`, { emo: 0.3, imp: 0.3, about: [seller.id] });
      break;
    }
    case 'pilgrim': {
      const dest = a.dest != null ? sim.town(a.dest) : null;
      if (!dest) break;
      const from = p.s;
      p.s = dest.id;
      p.pilgrim = { home: from, dest: dest.id, until: sim.today + 2 };
      p.bldPil = sim.today;
      p.needs.survival = Math.min(100, p.needs.survival + 20); p.needs.esteem = Math.min(100, p.needs.esteem + 15);
      B.stats.pilgrim++;
      if (p.memories) sim.remember(p, `巡礼の旅で${dest.name}の大聖堂に詣でた`, { emo: 0.7, imp: 0.6, k: 'travel' });
      sim.pushLog(`${sim.fullName(p)}が巡礼の旅で${dest.name}に着いた。`, 'event', [p.id], p.pos);
      break;
    }
    case 'pilgrimback': {
      if (p.pilgrim) { p.s = p.pilgrim.home; p.pilgrim = null; if (p.memories) sim.remember(p, '巡礼の旅から無事に帰ってきた', { emo: 0.5, imp: 0.4, k: 'travel' }); }
      break;
    }
  }
}
const BOOKS = ['大陸の歴史', '薬草の図鑑', '竜と騎士の物語', '星の運行について', '算術の手引き', '王家の系譜', '魔物の見分け方', '農事暦', '遠い国の旅行記', '聖人伝', '古代語の文法', '航海の心得'];
const PLAYS = ['竜殺しの騎士', '王妃の涙', '粉屋と三人の娘', '魔王の最期', '取り違えられた双子', '勇者の旅立ち', '砂漠の姫君', '欲ばり商人の失敗'];

// ================================================================ しているあいだの効き目
export function buildingsDo(sim, p, dt) {
  const a = p.action;
  if (!a || !p.needs) return;
  const n = p.needs, hr = dt / 60;
  switch (a.type) {
    case 'bathe':
      p.fatigue = Math.max(0, (p.fatigue || 0) - 30 * hr);
      n.pleasure += 16 * hr; n.sloth += 12 * hr; n.esteem += 2 * hr;
      if (p.hp < p.maxhp) p.hp = Math.min(p.maxhp, p.hp + 3 * hr);
      break;
    case 'read': {
      const kid = sim.ageOf(p) < 14;
      p.skill.study = Math.min(1, (p.skill.study || 0) + (kid ? 0.004 : 0.003) * hr);
      n.pleasure += 8 * (p.pers?.O ?? 0.5) * hr; n.esteem += 1 * hr; n.sloth += 3 * hr;
      const k = sim.kingdomOf(p);
      if (k && k.research != null && !kid) k.research += 0.03 * hr;
      break;
    }
    case 'watchplay': n.pleasure += 30 * hr; n.esteem += 2 * hr; break;
    case 'act': n.esteem += 12 * hr; break;
  }
}

// ================================================================ 仕事の中身（doWork の default）
// 働いている最中にはお金を動かさない（社長の指示：お金は取り引きでしか動かない）。
// ここでは「今日働いた」という記録と、腕前・世話の効き目だけを残す。給金は給料日（7日ごと）に buildingsDaily で払う。
const WAGE = { librarian: 6, granarian: 4, matron: 4 };   // 1日働いた分の給金（銅貨）
export const buildingsWork = workImpl;   // 働いている最中はお金を動かさないので見張らない
function workImpl(sim, p, dt, eff) {
  const S = sim.S, hr = dt / 60;
  if (!BLD_JOBS[p.job]) return;
  if (p.bldWorked !== sim.today) { p.bldWorked = sim.today; if (WAGE[p.job]) p.bldDays = (p.bldDays || 0) + 1; }
  switch (p.job) {
    case 'hostkeeper': p.needs.esteem = Math.min(100, p.needs.esteem + 1 * hr); break;   // 部屋の掃除と洗い物（収入は泊まり客の宿代）
    case 'granarian': { const G = S.bld?.gran?.[p.s]; if (G) G.kept = sim.today; break; }  // 倉の見回り：ねずみと湿気を防ぐ
    case 'matron': {
      const B = S.bld, oh = B?.orph?.[p.s] != null ? S.households[B.orph[p.s]] : null;
      if (oh) for (const id of oh.members) { const k = S.people[id]; if (alive(k) && k.inside === p.inside) k.needs.pleasure = Math.min(100, k.needs.pleasure + 6 * hr); }
      break;
    }
    case 'actor': p.skill.actor = Math.min(1, (p.skill.actor || 0.3) + 0.0005 * hr); break;   // 昼は稽古
  }
}

// 給料日（7日ごと）：公の仕事は町の蓄え（足りなければ国庫）から、院母は孤児院の家計から、働いた日数ぶん
function payday(sim) {
  const S = sim.S;
  for (const p of sim.living()) {
    const days = p.bldDays || 0;
    if (!days || !WAGE[p.job] || !sim.hh(p)) continue;
    const want = WAGE[p.job] * days;
    let paid = 0;
    if (p.job === 'matron') {
      const oh = S.bld?.orph?.[p.s] != null ? S.households[S.bld.orph[p.s]] : null;
      if (oh) { paid = Math.min(want, Math.max(0, oh.money)); oh.money -= paid; }
    } else {
      const m = S.towns[p.s];
      paid = Math.min(want, Math.max(0, (m.fund || 0) - 30)); m.fund -= paid;
      if (paid < want) { const k = sim.kingdomOf(p); if (k && k.treasury > 200) { const x = Math.min(want - paid, k.treasury - 200); k.treasury -= x; paid += x; } }
    }
    earn(sim, p, paid, 0.3);
    p.bldDays = 0;
    if (paid < want * 0.5 && p.memories) sim.remember(p, '給料日なのに、給金が満足に払われなかった', { emo: -0.5, imp: 0.4, k: 'work' });
  }
}
// よろず屋：その日の買い物客が払った手数料（市場組合が預かった分）を、日の終わりに受け取る
// 湯屋：その日に沸かした湯の分の薪を、日の終わりに市場から買う
function shopSettle(sim) {
  const S = sim.S, B = B_(sim);
  for (const s of S.world.settlements) {
    const at = B.at[s.id]; if (!at) continue;
    const m = S.towns[s.id];
    const baths = B.day[s.id]?.bath || 0;
    if (at.bathhouse != null && baths) {
      const bk = workerOf(sim, s.id, 'bathkeeper');
      const q = Math.min(m.stock.wood || 0, baths * 0.15);
      if (bk && sim.hh(bk) && q > 0) marketBuy(sim, s.id, 'wood', q, sim.hh(bk));   // 薪の代金は材木の持ち主（木こり・商人）へ
    }
  }
  B.day = {};
}

// ================================================================ 1日に1回
export const buildingsDaily = audited('buildingsDaily', dailyImpl);
function dailyImpl(sim) {
  const S = sim.S, B = B_(sim), R = sim.rng, today = sim.today;
  // 服のすり切れと体の汚れ
  const heavy = new Set(['farmer', 'miner', 'smith', 'woodcutter', 'hunter', 'fisher', 'sailor', 'mason', 'roadworker', 'pioneer', 'soldier', 'charcoal', 'gatherer', 'rancher', 'shepherd']);
  for (const p of sim.living()) {
    if (!p.needs) continue;
    const age = sim.ageOf(p);
    if (age >= 14) p.clothWear = Math.min(100, (p.clothWear ?? R.int(0, 75)) + (heavy.has(p.job) ? 1.6 : 0.9));
    p.grime = Math.min(100, (p.grime || 0) + (heavy.has(p.job) ? 14 : 7));
    if ((p.clothWear || 0) > 90) p.needs.esteem = Math.max(0, p.needs.esteem - 3);
    if (p.pilgrim && today > p.pilgrim.until + 6) p.pilgrim = null;   // 帰りそびれたら、旅は終わったことにする
  }
  const pop = popOf(sim);
  for (const s of S.world.settlements) {
    if (!eligible(sim, s)) continue;
    granaryDaily(sim, s);
    // 3日に1回：働き手の補充と、足りない建物の普請
    if ((today + s.id) % 3 !== 0) continue;
    indexTown(sim, s);
    staffTown(sim, s, 1);
    buildMissing(sim, s, pop[s.id] || 0);
  }
  orphanageDaily(sim);
  shopSettle(sim);
  if (today % 7 === 0) payday(sim);
  moveLodgers(sim);
  // 古い夜の記録を消す
  const nk = nightKey(sim);
  for (const [id, rec] of Object.entries(B.nights)) if (rec.n < nk - 1) delete B.nights[id];
  for (const [sid, sh] of Object.entries(B.show)) if (sh.until < S.t - 1440) delete B.show[sid];
}

// 宿住まいの世帯の住まいを、酒場から宿屋へ移す
function moveLodgers(sim) {
  const S = sim.S, B = B_(sim);
  for (const hh of Object.values(S.households)) {
    if (!hh.inn) continue;
    const id = B.at[hh.s]?.inn;
    if (id == null || hh.house === id) continue;
    const old = hh.house != null ? sim.building(hh.house) : null;
    if (!old || old.type === 'tavern') hh.house = id;
  }
}

// 新しくできた町・大きくなった町に建てる（町の蓄えで普請する）
function buildMissing(sim, s, pop) {
  const S = sim.S, m = S.towns[s.id], B = B_(sim);
  const have = B.at[s.id] || {};
  const need = wants(sim, s, pop).filter((t) => have[t] == null && !consPending(sim, s.id, t));   // 普請中の建物は二重に建てない
  if (!need.length) return;
  const type = need[0];
  const [bw, bd] = sizeOf(s, type);
  const wood = bw * bd * 2, stone = bw * bd;
  const mat = Math.min(m.stock.wood || 0, wood) * (m.price.wood || 2) + Math.min(m.stock.stone || 0, stone) * (m.price.stone || 3);
  const labor = bw * bd * 6;
  if ((m.fund || 0) < mat + labor + 60) return;
  const b = placeInTown(sim, s, type, true);
  if (!b) return;
  // 縄張りから段階を追って建てる（construct.js）：資材は町の蓄えで市場から買い、日当は給料日に町の蓄えから
  if (consBegin(sim, b, { tag: 'town', sid: s.id, k: s.kingdom, payer: 't' + s.id, big: true })) return;
  // 材料は市場から、手間賃は町の大工・石工・人夫へ
  void mat;
  marketBuy(sim, s.id, 'wood', Math.min(m.stock.wood || 0, wood), 't' + s.id, { force: true });   // 材料の代金は材木・石材の持ち主へ
  marketBuy(sim, s.id, 'stone', Math.min(m.stock.stone || 0, stone), 't' + s.id, { force: true });
  const builders = sim.living().filter((q) => q.s === s.id && ['carpenter', 'mason', 'roadworker', 'pioneer', 'shipwright'].includes(q.job) && sim.hh(q));
  if (builders.length) { m.fund -= labor; for (const q of builders) earn(sim, q, labor / builders.length, 0.4); }
  sim.news(`${s.name}に${b.name}が建った`, 1, { x: b.door.x, z: b.door.z });
  if (s.kingdom != null) sim.chron(`${s.name}に${b.name}が建てられた`, s.kingdom);
}

// ---------- 穀物倉：秋に買い入れ、飢饉に売り出す ----------
function granaryDaily(sim, s) {
  const S = sim.S, B = B_(sim);
  const id = B.at[s.id]?.granary;
  if (id == null) return;
  const G = B.gran[s.id] = B.gran[s.id] || { wheat: 0 };
  const m = S.towns[s.id];
  const cap = s.type === 'capital' ? 120 : 60;
  const base = GOODS.wheat.base, target = GOODS.wheat.target;
  // ねずみと湿気（倉番がいれば減りにくい）
  G.wheat *= (G.kept != null && sim.today - G.kept <= 1) ? 0.998 : 0.992;
  const price = m.price.wheat || base;
  const scarce = (m.stock.wheat || 0) + (m.stock.bread || 0) * 2 < target * 0.35 || price > base * 1.8;
  if (scarce && G.wheat >= 1) {
    // 飢饉：蓄えを安く（元の値段で）市場へ出す。代金は市場の金庫から町の蓄えへ
    const q = Math.min(G.wheat, 20);
    G.wheat -= q; ownStock(sim, s.id, 'wheat', 't' + s.id, q);   // 町の麦として店先に並べる（売れた代金は町の蓄えへ）
    B.stats.graRelease += q;
    if (!G.warned || sim.today - G.warned > 5) { G.warned = sim.today; sim.news(`${s.name}の穀物倉が開かれ、蓄えの小麦が市場に出された`, 1, { x: s.x, z: s.z }); }
    return;
  }
  // 実りの秋、または小麦が安いとき：町の蓄えで買い入れる
  const cheap = sim.seasonIdx() === 2 || price < base * 0.9;
  if (cheap && G.wheat < cap && (m.stock.wheat || 0) > target * 0.6) {
    const q = Math.min(cap - G.wheat, (m.stock.wheat || 0) - target * 0.6, 12, Math.max(0, (m.fund || 0) - 120) / price);
    if (q >= 1) { const got = marketBuy(sim, s.id, 'wheat', q, 't' + s.id); G.wheat += got; B.stats.graBuy += got; }   // 代金は麦の持ち主（農夫・商人）へ
  }
}

// ---------- 孤児院 ----------
function orphanHh(sim, cap) {
  const S = sim.S, B = B_(sim);
  const bid = B.at[cap.id]?.orphanage;
  if (bid == null) return null;
  let hh = B.orph[cap.id] != null ? S.households[B.orph[cap.id]] : null;
  if (!hh) {
    const id = S.nextHh++;
    const b = sim.building(bid);
    hh = S.households[id] = { id, members: [], house: bid, s: cap.id, money: 0, food: 0, comfort: 2, name: b.name, orphanage: true };
    b.hh = id;
    B.orph[cap.id] = id;
  }
  return hh;
}
const isOrphan = (sim, p, hh) => {
  const S = sim.S;
  if (sim.ageOf(p) >= 14 || p.rank === 'royal' || p.rank === 'noble') return false;
  const par = [S.people[p.fatherId], S.people[p.motherId]];
  if (par.some((q) => q && q.deathYear == null)) return false;
  // 同じ家に大人の身内がいれば孤児ではない
  return !hh.members.some((id) => { const q = S.people[id]; return q && q !== p && q.deathYear == null && sim.ageOf(q) >= 16 && sim.isKin(p, q); });
};
// 世界ができたとき：歴史の中で親を亡くし、他人の家に預けられていた子を孤児院へ
function adoptHistoricOrphans(sim) {
  const S = sim.S;
  for (const s of S.world.settlements) {
    if (s.type !== 'capital' || !eligible(sim, s)) continue;
    const oh = orphanHh(sim, s);
    if (!oh) continue;
    for (const p of sim.living()) {
      const hh = sim.hh(p), home = sim.townOf(p);
      if (!hh || hh === oh || hh.royal || hh.bandits || home.kingdom !== s.kingdom || !isOrphan(sim, p, hh)) continue;
      takeIn(sim, p, oh, s, false);
    }
  }
}
function takeIn(sim, p, oh, cap, log = true) {
  const old = sim.hh(p);
  if (old === oh) return;
  // 子どもだけの家なら、家計と家財はそのまま孤児院が預かる（moveTo が引き継ぐ）
  if (old && old.members.length === 1) sim.moveTo(p, oh);
  else { if (old) old.members = old.members.filter((id) => id !== p.id); oh.members.push(p.id); p.hh = oh.id; }
  p.s = cap.id; p.action = null; p.path = []; p.inside = null;
  const b = sim.building(oh.house); if (b) p.pos = { x: b.door.x, z: b.door.z };
  sim.S.bld.stats.orphan++;
  oh.newKid = sim.today;
  if (p.memories) sim.remember(p, `親を亡くし、${oh.name}に引き取られた`, { emo: -0.4, imp: 0.9, k: 'orphan' });
  if (log) sim.pushLog(`親を亡くした${p.given}が${oh.name}に引き取られた。`, 'event', [p.id], p.pos);
}
function orphanageDaily(sim) {
  const S = sim.S, B = B_(sim);
  for (const cap of S.world.settlements) {
    if (cap.type !== 'capital' || !eligible(sim, cap)) continue;
    const oh = orphanHh(sim, cap);
    if (!oh) continue;
    // 親を亡くした子：まず同じ町の身内が引き取る。いなければ孤児院へ
    for (const hh of Object.values(S.households)) {
      if (hh === oh || hh.royal || hh.bandits || hh.orphanage || !hh.members.length) continue;
      const home = sim.town(hh.s);
      if (!home || home.kingdom !== cap.kingdom) continue;
      if (hh.members.some((id) => { const q = S.people[id]; return q && q.deathYear == null && sim.ageOf(q) >= 16; })) continue;
      for (const id of hh.members.slice()) {
        const p = S.people[id];
        if (!alive(p) || sim.ageOf(p) >= 14) continue;
        const kin = sim.living().find((q) => q.s === p.s && sim.ageOf(q) >= 18 && sim.hh(q) && sim.hh(q) !== hh && !sim.hh(q).bandits && sim.hh(q).house != null && sim.isKin(p, q));
        if (kin) {
          const to = sim.hh(kin);
          if (hh.members.length === 1) sim.moveTo(p, to); else { hh.members = hh.members.filter((x) => x !== p.id); to.members.push(p.id); p.hh = to.id; }
          B.stats.fostered++;
          if (p.memories) sim.remember(p, `親を亡くし、${sim.kinTerm(p, kin) || '身内'}の${kin.given}に引き取られた`, { emo: -0.3, imp: 0.9, about: [kin.id], k: 'orphan' });
          if (kin.memories) sim.remember(kin, `親を亡くした${p.given}を引き取った`, { emo: 0.2, imp: 0.7, about: [p.id], k: 'orphan' });
        } else takeIn(sim, p, oh, cap);
      }
    }
    const kids = oh.members.map((id) => S.people[id]).filter(alive);
    // 巣立ち：16歳になった子は、支度金を持って独り立ちする（宿住まいから）
    for (const p of kids) {
      if (sim.ageOf(p) < 16) continue;
      const id = S.nextHh++;
      const inn = B.at[cap.id]?.inn;
      const gift = Math.min(25, Math.max(0, oh.money * 0.2));
      oh.money -= gift;
      S.households[id] = { id, members: [p.id], house: inn ?? null, inn: inn != null, street: inn == null, s: cap.id, money: gift, food: 2, comfort: 0, name: `${p.family}（宿住まい）` };
      oh.members = oh.members.filter((x) => x !== p.id); p.hh = id;
      if (p.memories) sim.remember(p, `${oh.name}を巣立って、独り立ちした`, { emo: 0.5, imp: 0.85, k: 'orphan' });
      sim.pushLog(`${oh.name}で育った${p.given}が独り立ちした。`, 'event', [p.id], p.pos);
    }
    const n = oh.members.length;
    if (!n) continue;
    // 養う費用：給料日（7日ごと）と、新しい子を引き取った日に、教会の施し箱から（足りなければ町の蓄えから）1週間分を渡す
    const m = S.towns[cap.id];
    const want = n * 28 + 30;
    if ((sim.today % 7 === 0 || oh.newKid === sim.today) && oh.money < want) {
      let need = want - oh.money;
      const a = Math.min(need, Math.max(0, m.alms || 0)); m.alms -= a; oh.money += a; need -= a;
      const f = Math.min(need, Math.max(0, (m.fund || 0) - 50)); m.fund -= f; oh.money += f;
    }
    // パンを買う（孤児院 → 市場）
    let guard = 30;
    while (oh.food < n * 3 && guard-- > 0) {
      const g = ['bread', 'wheat', 'fish'].find((x) => (m.stock[x] || 0) >= 1 && oh.money >= m.price[x]);
      if (!g) break;
      if (marketBuy(sim, cap.id, g, 1, oh, { whole: true }) < 1) break;
      oh.food += GOODS[g].meals;
    }
  }
}

// ================================================================ ui.js 用：建物の詳しい欄
export function buildingRows(sim, b) {
  const S = sim.S, B = S.bld;
  if (!B || !BLD_TYPES.has(b.type)) return [];
  const s = b.settlement != null ? sim.town(b.settlement) : null;
  const rows = [];
  const keeper = (job) => { const q = s ? workerOf(sim, s.id, job) : null; return q ? `${q.given}・${q.family}` : 'いない'; };
  switch (b.type) {
    case 'inn': {
      const beds = innBeds(b), rec = B.nights[b.id];
      const rooms = new Set(beds.map((x) => x.room)).size;
      const guests = rec && rec.n >= nightKey(sim) - 0 ? Object.values(rec.g).filter((i) => i >= 0).length : 0;
      rows.push(['宿の主', keeper('hostkeeper')], ['部屋', `${rooms}部屋・寝台${beds.length}台（夫婦用${beds.filter((x) => x.double).length}台）`], ['宿代', `1晩${FEE.inn[grade(s)]}銅貨（馬小屋は${FEE.stable}銅貨）`], ['今夜の泊まり客', `${guests}人${rec?.st ? `・馬小屋に${rec.st}人` : ''}`]);
      const res = Object.values(S.households).filter((h) => h.inn && h.house === b.id).reduce((t, h) => t + h.members.length, 0);
      if (res) rows.push(['長逗留の客', `${res}人`]);
      break;
    }
    case 'bathhouse': rows.push(['湯屋の主', keeper('bathkeeper')], ['入浴料', `${FEE.bath[grade(s)]}銅貨`]); break;
    case 'library': rows.push(['司書', keeper('librarian')], ['蔵書', `${160 + (b.id % 7) * 20}冊（貴重な本は鎖でつながれている）`], ['使い賃', '無料（町の蓄えで営む）']); break;
    case 'theater': {
      const sh = B.show[s.id];
      rows.push(['役者', sim.living().filter((q) => q.s === s.id && q.job === 'actor').map((q) => q.given).join('・') || 'いない'], ['木戸銭', `${FEE.play[grade(s)]}銅貨（子どもは半分）`], ['今夜の演目', sh && sh.until > S.t ? `「${sh.play}」` : 'なし']);
      break;
    }
    case 'tailorshop': rows.push(['仕立て屋', keeper('tailor')], ['服の値段', `${clothesPrice(sim, s.id)}銅貨`], ['市場の布', `${Math.floor(S.towns[s.id].stock.cloth || 0)}反`]); break;
    case 'apothecary': rows.push(['薬師', keeper('herbalist')], ['薬の値段', `${medPrice(sim, s.id)}銅貨`], ['市場の薬', `${Math.floor(S.towns[s.id].stock.medicine || 0)}包`]); break;
    case 'genstore': rows.push(['よろず屋の主', keeper('shopkeeper')]); break;
    case 'granary': rows.push(['倉番', keeper('granarian')], ['蓄えの小麦', `${Math.floor(B.gran[s.id]?.wheat || 0)}袋`]); break;
    case 'orphanage': {
      const oh = B.orph[s.id] != null ? S.households[B.orph[s.id]] : null;
      rows.push(['院母', keeper('matron')], ['子どもたち', `${oh ? oh.members.length : 0}人`], ['院の蓄え', `${Math.round(oh?.money || 0)}銅貨（教会の施し箱と町の蓄えから）`]);
      break;
    }
    case 'cemetery': rows.push(['墓守', keeper('gravedigger')], ['眠る人', `${(S.graves || []).filter((id) => S.people[id]?.s === s.id).length}人（この世界が始まってから）`]); break;
  }
  return rows;
}
// 内装用：いまこの建物の墓の数など
export function cemeteryGraves(sim, b) { const S = sim.S; return (S.graves || []).filter((id) => S.people[id]?.s === b.settlement).length; }
export function orphanCount(sim, b) { const B = sim.S.bld; const oh = B?.orph?.[b.settlement] != null ? sim.S.households[B.orph[b.settlement]] : null; return oh ? oh.members.length : 0; }
