// 恋と楽しみの場（開発部）― 社長の決定「案2」
//
// 1. 健全な娯楽（いつでも動く）
//    ・酒場の夜の踊り …… 吟遊詩人・楽師・踊り子が酒場で奏でている晩は、若者が踊りに集まり、組になって踊る
//    ・吟遊詩人の恋歌 …… 酒場で吟遊詩人が恋歌を歌うと、聞いた人の心がときめく（聞き手は心づけを渡す）
//    ・祭りの踊り     …… 暦の祭り（calendar.js）の広場で、独り身の若者が踊りの輪で手を取り合う
//    ・逢い引き       …… 想い合う独り身どうしが、夕方の広場で待ち合わせる。仲が深まれば婚約へ（sim.maybeEngage）
//    ・仲人の縁組     …… 週に一度、町の仲人（長老・産婆・司祭など）が年ごろの独り身を引き合わせ、縁組をまとめる
//    ・湯屋           …… いまの公衆浴場（buildings.js の bathe）でくつろぐと、楽しみと人恋しさが少し満たされる
//
// 2. 大人向け（S.settings.matureCrimes が true のときだけ）
//    町が許しを出した「歓楽の館」を、町の外れに1軒置く。画面に出すのは、建物（外観だけ・中は開けない）と
//    「〇〇は歓楽の館を訪れた」という文だけ。露骨な言葉は使わない。客も働き手も18歳以上だけ（訪れるたびに年齢を点検）。
//    設定を切ると、館・働き手・病・噂・罪を跡形もなく消す（purgeAdult）。
//
//    館の決まり（docs/中世の性と娼館.md 第10章）
//      許可：町が許しを出し、館の主は誓約する。信心深い王の国と、厳しい司祭の町には置かない
//      休み：聖なる日・祭りの日・休日は閉める（欲の深い主はこっそり開けることがあり、見つかれば罰金）
//      客：結婚している人と聖職者は客になれない。見つかれば罰金。信心深い人・誠実な人はほとんど行かない
//      働き手：住み込みにしない（自分の家から通う）。いつでも辞められる。病気の人は休ませる。医者か修道女が見回る
//    お金（訪れたときの取り引きでだけ動く）
//      代金          客の財布（足りなければ家計） → 館の主の家計
//      働き手の取り分  館の主の家計 → 働き手（その国の給料日にまとめて）
//      借り賃と税      館の主の家計 → 町の蓄え（7日ごと。上がりの2割）
//      罰金          違反した人 → 半分は告げた人、半分は施し箱
//      足を洗う支度金  施し箱 → 本人（被害に遭った人の保護も同じ）
//      仕入れ         館の主の家計 → 市場の品の持ち主（酒と布。market.js の marketBuy）
//    病と教会：訪れるとごく低い確率で「長わずらい」（health.js の病）。見回りのある館ほど低い。
//              町で3人以上かかると、王か町長が館を閉じる（30日）。閉じているあいだは、裏にもぐりの商売が生まれやすい
//    犯罪（underworld.js の罪の表に足し、society.js の手配・justice.js の裁きにつなぐ）
//      借金の縛り（主の解任・借りの帳消し）、人身売買（重罪・被害者の保護と支度金）、もぐりの館（罰金と取り壊し）、
//      館での乱暴（客を重く罰する）。事件はすべて年齢つきで記録し、18歳未満が関わっていないか点検する
//
// ■ 本体からの呼び方（部長がつなぐ。くわしくは報告のコード片）
//   ensureLeisure(sim, fresh)        … newWorld の ensureBuildings のあと・load の ensureBuildings のあと
//   leisureDecide(sim, p, add)       … decide の laborCandidates のあと
//   leisureArrive(sim, p, a)         … arrive の最後（matterArrive のあと）
//   leisureDo(sim, p, dt)            … doAction の buildingsDo のあと
//   leisureHourly(sim)               … newHour（healthHourly のあと）
//   leisureDaily(sim)                … newDay（buildingsDaily のあと）
//   leisureToggle(sim)               … ui.js の matureChk を切り替えたとき（館を建てる／跡形もなく消す）
//   LEISURE_LABEL / LEISURE_GO / LEISURE_PREF / LEISURE_TYPE_LABEL / leisureBuildingRows / isLeisureHouse … ui.js 用
//   館の外観は js/leisuregfx.js（render.js から）
import { clamp } from './rng.js';
import { T, W, H, tryPlace } from './world.js';
import { pay, earn, spendable } from './property.js';
import { marketBuy } from './market.js';
import { laborRestDay } from './labor.js';
import { calendarToday } from './calendar.js';
import { AILS, fallIll } from './health.js';
import { CRIMES } from './underworld.js';
import { markWanted } from './society.js';
import { isPayday } from './payday.js';
import { markTilesChanged } from './pathfar.js';

// ---------- 表と定数 ----------
export const HOUSE_TYPE = 'pleasurehouse';
export const LEISURE_TYPE_LABEL = { [HOUSE_TYPE]: '歓楽の館（町の許しを得た館）' };
export const LEISURE_LABEL = { ldance: '酒場で踊っている', ltryst: '好きな人と逢い引きしている', lvisit: '夜の町に出ている' };
export const LEISURE_GO = { ldance: '踊りに酒場へ向かっている', ltryst: '逢い引きの待ち合わせへ向かっている', lvisit: '夜の町へ出かけるところ' };
export const LEISURE_PREF = { ldance: '酒場の踊り', ltryst: '逢い引き', lvisit: '夜の外出' };

// 大人向けの病（health.js の病の表に足す。命にはかかわらない。名前は控えめに）
if (!AILS.lhill) AILS.lhill = { name: '長わずらい', s0: [10, 20], rise: [2, 4], up: [2, 5], down: [3, 6], spread: 0, lethal: 0, cause: null, imm: 60 };
// 大人向けの罪（underworld.js の罪の表に足す。手配・裁きはいまの仕組みがそのまま扱う）
const ADULT_CRIMES_DEF = {
  '人身売買': { days: 200, fine: 80, exile: true, uw: true, grave: true },
  '館での乱暴': { days: 60, fine: 40, uw: true, grave: true },
  '借金の縛り': { days: 40, fine: 60, dismiss: true, uw: true },
  'もぐりの館': { days: 20, fine: 30, uw: true },
};
for (const [k, v] of Object.entries(ADULT_CRIMES_DEF)) if (!CRIMES[k]) CRIMES[k] = v;
const ADULT_CRIMES = new Set(Object.keys(ADULT_CRIMES_DEF));
// 設定を切ったときに消す文の目印
const ADULT_RX = /歓楽の館|夜遊び|人身売買|館での乱暴|借金の縛り|もぐりの館|長わずらい/;

const HOUSE_NAMES = ['歓楽の館「赤い灯」', '歓楽の館「宵の灯」', '歓楽の館「月見亭」', '歓楽の館「柳の家」'];
const CLERGY = new Set(['priest', 'nun', 'cleric', 'paladin', 'bishop', 'archbishop', 'monk', 'abbot', 'shaman']);
const PERFORMERS = new Set(['bard', 'musician', 'dancer', 'troupe', 'jester']);
const SINGERS = new Set(['bard', 'musician']);
const LAWFUL = ['watchman', 'guard', 'militia', 'jailer', 'knight', 'soldier'];
const HEALERS = ['doctor', 'nun', 'herbalist', 'cleric', 'midwife'];
const MATCHERS = ['elder', 'midwife', 'priest', 'nun', 'storyteller'];
const EASY_JOBS = new Set(['soldier', 'sailor', 'adventurer', 'warrior', 'archer', 'miner', 'woodcutter', 'fisher', 'smith', 'mason', 'carpenter', 'peddler', 'merchant', 'coachman', 'hunter']);
const FEE = { capital: 10, port: 8, town: 7 };

const alive = (p) => p && p.deathYear == null && p.needs;
const r1 = (v) => Math.round(v * 10) / 10;
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const bump = (p, d) => { if (!p.needs) return; for (const [k, v] of Object.entries(d)) p.needs[k] = clamp((p.needs[k] || 0) + v, 0, 100); };
const relUp = (sim, a, b, n) => { const r = sim.relMut(a, b); r.a = clamp(r.a + n, -100, 100); };
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
// 試験用のお金の見張り：sim._lzAudit に総額を数える関数を入れると、この仕組みの中で増えた・減ったお金を sim._lzLeak に記録する
function audited(name, fn) {
  return function (sim, ...args) {
    if (!sim._lzAudit) return fn(sim, ...args);
    const m0 = sim._lzAudit(); const r = fn(sim, ...args); const d = sim._lzAudit() - m0;
    if (Math.abs(d) > 1e-6) { const L = sim._lzLeak = sim._lzLeak || {}; L[name] = (L[name] || 0) + d; }
    return r;
  };
}

// 大人向けが有効か（公開版の初めの値は「切る」。はっきり true のときだけ動く）
export const adultOn = (sim) => sim.S.settings?.matureCrimes === true;
// 18歳以上か（客・働き手・噂の聞き手はすべてここで点検する）
const adult18 = (sim, p) => alive(p) && sim.ageOf(p) >= 18;

// ---------- 状態 ----------
function L_(sim) {
  const S = sim.S;
  if (!S.leisure) S.leisure = { v: 1, stats: {}, match: {}, gv: 0 };
  const L = S.leisure;
  L.stats = L.stats || {};
  for (const k of ['dance', 'festDance', 'song', 'songHeard', 'tryst', 'match', 'bath', 'danceNight']) if (L.stats[k] == null) L.stats[k] = 0;
  L.match = L.match || {};
  return L;
}
function A_(sim) {
  const L = L_(sim);
  if (!L.adult) L.adult = {
    v: 1, houses: {}, ppl: {}, cases: [], visitLog: [], sick: [], illicit: {},
    stats: { visits: 0, refused: 0, fines: 0, sick: 0, closures: 0, exits: 0, illicit: 0, bind: 0, traffic: 0, violence: 0, built: 0, recruits: 0 },
    audit: { checked: 0, under: 0, minCust: 999, minWork: 999 },
  };
  return L.adult;
}
const P_ = (A, id) => A.ppl[id] || (A.ppl[id] = {});
// 一時的な覚え書き（保存しない）
function tmp(sim) { if (!sim._lz) sim._lz = { hour: -1, perf: {}, fest: {} }; return sim._lz; }

// 記録（ログ）。大人向けの文には印を付け、設定を切ったら消す
function alog(sim, text, ids = [], pos = null) {
  sim.pushLog(text, 'event', ids, pos);
  const e = sim.S.log[sim.S.log.length - 1];
  if (e && e.text === text) e.lh = 1;
}
function amem(sim, p, txt, opt = {}) { if (adult18(sim, p)) sim.remember(p, txt, { ...opt, k: 'lhx' }); }
function acase(sim, k, off, vic, extra = {}) {
  const A = A_(sim);
  A.cases.push({ d: sim.today, k, off: off?.id ?? null, vic: vic?.id ?? null, offAge: off ? sim.ageOf(off) : null, vicAge: vic ? sim.ageOf(vic) : null, s: (off || vic)?.s, ...extra });
  if (A.cases.length > 200) A.cases.splice(0, A.cases.length - 200);
  if (off && off.s != null && sim.S.towns[off.s]) sim.S.towns[off.s].crime = (sim.S.towns[off.s].crime || 0) + 1;
}

// ================================================================ 起動・設定の切り替え
function ensureLeisure_(sim, fresh = false) {
  L_(sim);
  return leisureToggle_(sim);
}
// 設定に合わせて、館を建てる／跡形もなく消す
function leisureToggle_(sim) {
  const L = L_(sim);
  if (adultOn(sim)) { const n = buildHouses(sim); return { built: n, purged: false }; }
  if (L.adult || sim.S.world.buildings.some((b) => b.type === HOUSE_TYPE)) { purgeAdult(sim); return { built: 0, purged: true }; }
  return { built: 0, purged: false };
}

// ================================================================ 館を置く町・方針
const popOf = (sim) => { const c = {}; for (const p of sim.living()) c[p.s] = (c[p.s] || 0) + 1; return c; };
function gradeOf(s) { return s.type === 'capital' ? 'capital' : s.type === 'port' ? 'port' : 'town'; }
function eligible(sim, s, pop) {
  if (!s || s.tribe || s.tribal || s.kingdom == null) return false;
  const t = sim.S.towns?.[s.id];
  if (!t || t.occupied) return false;
  const big = s.type === 'capital' || s.type === 'port' || s.grade === 'town';
  return big ? pop >= 30 : pop >= 70;
}
function townPeople(sim, sid) { return sim.living().filter((q) => q.s === sid); }
function priestOf(sim, sid) { return sim.living().find((q) => q.s === sid && q.job === 'priest' && q.needs) || null; }
// 王と司祭の方針
function policy(sim, s) {
  const k = sim.S.kingdoms?.[s.kingdom];
  const king = k && k.kingId != null ? sim.S.people[k.kingId] : null;
  if (king && king.deathYear == null && (king.values?.faith ?? 0.3) >= 0.6) return { ok: false, why: 'king', who: king };
  const pr = priestOf(sim, s.id);
  if (pr && (pr.values?.faith ?? 0.5) > 0.85 && (pr.pers?.A ?? 0.5) < 0.35) return { ok: false, why: 'priest', who: pr };
  return { ok: true };
}

function buildHouses(sim) {
  const A = A_(sim), pop = popOf(sim);
  let n = 0;
  for (const s of sim.S.world.settlements) {
    if (A.houses[s.id]) continue;
    if (!eligible(sim, s, pop[s.id] || 0) || !policy(sim, s).ok) continue;
    const b = placeHouse(sim, s);
    if (!b) continue;
    const keeper = pickKeeper(sim, s.id);
    A.houses[s.id] = { bid: b.id, keeper: keeper?.id ?? null, workers: [], owed: {}, take: 0, closed: null, inspected: false, bind: null, day: sim.today, served: {} };
    if (keeper) { P_(A, keeper.id).k = s.id; amem(sim, keeper, `町と誓約を交わし、${b.name}の主になった`, { emo: 0.3, imp: 0.5 }); }
    A.stats.built++;
    n++;
  }
  if (n) L_(sim).gv++;
  return n;
}

// 町の外れ（教会・学校・城から離れた通りぞい。浴場の近くを好む）に置く
function placeHouse(sim, s) {
  const w = sim.S.world, R = sim.rng;
  const RR = s.r + (s.extraR || 0);
  const avoid = [];
  const bath = [];
  for (const id of s.buildings) {
    const b = sim.building(id);
    if (!b) continue;
    if (['church', 'school', 'castle', 'academy', 'orphanage', 'shrine'].includes(b.type)) avoid.push(b.door);
    if (b.type === 'bathhouse') bath.push(b.door);
  }
  const streets = [];
  const r0 = Math.max(3, Math.floor(RR * 0.45));
  for (let z = s.z - RR - 6; z <= s.z + RR + 6; z++) for (let x = s.x - RR - 6; x <= s.x + RR + 6; x++) {
    if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2) continue;
    const t = w.tiles[z * W + x];
    if (t !== T.ROAD && t !== T.PLAZA) continue;
    const ch = Math.max(Math.abs(x - s.x), Math.abs(z - s.z));
    if (ch < r0 || ch > RR + 6) continue;
    if (avoid.some((d) => Math.hypot(d.x - x, d.z - z) < 7)) continue;
    const nearBath = bath.some((d) => Math.hypot(d.x - x, d.z - z) < 6);
    streets.push({ x, z, d: -ch - (nearBath ? 4 : 0) + R.next() * 2 });
  }
  streets.sort((a, b) => a.d - b.d);
  if (!streets.length) return null;
  const snapT = w.tiles.slice(), snapH = w.hgt.slice();
  const name = R.pick(HOUSE_NAMES);
  let b = null;
  for (const [ww, dd] of [[3, 3], [3, 2], [2, 2]]) {
    if (b) break;
    b = tryPlace(w, { x: s.x, z: s.z, r: RR + 6, id: s.id, kingdom: s.kingdom }, streets.slice(0, 160), HOUSE_TYPE, name, ww, dd, { extra: { lzHouse: true }, land: [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH, T.DENSE, T.JUNGLE] }, R);
  }
  if (!b) return null;
  // 元の地面を覚えておく（設定を切ったら、跡形もなく元へ戻す）
  const prev = [];
  for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) { const i = z * W + x; prev.push([i, snapT[i], snapH[i]]); }
  const di = b.door.z * W + b.door.x;
  prev.push([di, snapT[di], snapH[di]]);
  b.lzPrev = prev;
  s.buildings.push(b.id);
  const list = [];
  for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++) list.push(z * W + x);
  try { markTilesChanged(w, list); } catch (e) { /* 道探しの区画がまだないとき */ }
  sim.events.push({ type: 'building', id: b.id });
  return b;
}

// 館を取り壊し、地面を元に戻す（建物の番号はずらさないので、配列には「空き地」として残る）
function razeHouse(sim, bid) {
  const w = sim.S.world, b = sim.building(bid);
  if (!b || b.type !== HOUSE_TYPE) return;
  // 中にいる人を外へ
  for (const p of sim.living()) {
    if (p.inside === bid) { p.inside = null; p.pos = { x: b.door.x, z: b.door.z }; p.action = null; p.path = []; }
    else if (p.action && (p.action.bld === bid || p.action.place?.bld === bid)) { p.action = null; p.path = []; }
  }
  const list = [];
  for (const [i, t, h] of b.lzPrev || []) { w.tiles[i] = t; w.hgt[i] = h; list.push(i); }
  for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) { const i = z * W + x; if (w.bldAt[i] === bid) w.bldAt[i] = -1; if (w.tiles[i] === T.BLD) { w.tiles[i] = T.GRASS; list.push(i); } }
  const s = sim.town(b.settlement);
  if (s) { const k = s.buildings.indexOf(bid); if (k >= 0) s.buildings.splice(k, 1); }
  b.type = 'razed'; b.gone = true; b.name = '空き地'; delete b.lzPrev; delete b.lzHouse;
  try { markTilesChanged(w, list); } catch (e) { /* 道探しの区画がまだないとき */ }
  sim.events.push({ type: 'tiles', list });
  L_(sim).gv++;
}

// ================================================================ 館の主と働き手
function pickKeeper(sim, sid, exclude = null) {
  const A = A_(sim), R = sim.rng;
  let best = null, bs = -1e9;
  for (const q of townPeople(sim, sid)) {
    if (!adult18(sim, q) || q === exclude) continue;
    const a = sim.ageOf(q);
    if (a < 28 || a > 62 || CLERGY.has(q.job) || ['king', 'royal', 'noble', 'outlaw', 'prisoner'].includes(q.rank) || q.jail != null || sim.S.wanted?.[q.id]) continue;
    const hh = sim.hh(q);
    if (!hh || hh.bandits || hh.royal || hh.money < 40) continue;
    const pp = A.ppl[q.id];
    if (pp && (pp.w != null || pp.ex != null || pp.k != null || pp.fired)) continue;
    if ((q.values?.faith ?? 0.5) > 0.5) continue;
    const sc = (1 - (q.values?.faith ?? 0.5)) + (['innkeeper', 'bathkeeper', 'merchant', 'hostkeeper'].includes(q.job) ? 0.6 : 0) + Math.min(1, hh.money / 400) + R.next() * 0.3;
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}
function canWork(sim, q, A, pend) {
  if (!adult18(sim, q)) return false;
  const a = sim.ageOf(q);
  if (a > 40 || q.spouseId != null || CLERGY.has(q.job) || q.jail != null || sim.S.wanted?.[q.id]) return false;
  if (!['commoner', 'homeless', 'wanderer', 'citizen'].includes(q.rank)) return false;
  const hh = sim.hh(q);
  if (!hh || hh.bandits || hh.royal) return false;
  const pp = A.ppl[q.id];
  if (pp && (pp.w != null || pp.k != null || pp.ex != null || pp.victim)) return false;
  if ((q.values?.faith ?? 0.5) >= 0.45) return false;
  if (pend && pend.has(q.id)) return false;
  return true;
}
const S_pending = (sim) => new Set((sim.S.pendingWeddings || []).flatMap((w) => [w.a, w.b]));
// 自分から働きたいと申し出る人（貧しさと性格で決まる。無理に連れてくることはしない）
function recruit(sim, sid, h) {
  const A = A_(sim), R = sim.rng;
  const cands = [], pend = S_pending(sim);
  for (const q of townPeople(sim, sid)) {
    if (!canWork(sim, q, A, pend)) continue;
    const hh = sim.hh(q);
    const poor = hh.money / Math.max(1, hh.members.length) < 35 || !q.job || q.job === 'beggar';
    const will = hash(q.id * 31 + 7) * 0.7 + (poor ? -0.3 : 0) + (q.values?.faith ?? 0.3) * 0.5 + ((q.pers?.C ?? 0.5) - 0.5) * 0.2;
    if (will < 0.3) cands.push(q);
  }
  if (!cands.length) return null;
  const q = R.pick(cands);
  const pp = P_(A, q.id);
  pp.w = sid; pp.since = sim.today; pp.stig = Math.max(pp.stig || 0, 0.6);
  h.workers.push(q.id);
  A.stats.recruits++;
  amem(sim, q, `暮らしのために、町の許しを得た${sim.building(h.bid)?.name || '歓楽の館'}で働くことにした`, { emo: -0.1, imp: 0.5 });
  return q;
}

// ================================================================ 開いているか
function holyDay(sim, sid) { return laborRestDay(sim, sid) || calendarToday(sim, sid).length > 0; }
function openState(sim, sid, h) {
  if (!h || h.closed) return { open: false };
  const hr = sim.hour();
  if (!(hr >= 18 || hr < 1)) return { open: false };
  if (holyDay(sim, sid)) {
    // 欲の深い主は、聖なる日にもこっそり開けることがある（見つかれば罰金）
    const k = sim.S.people[h.keeper];
    if (k && (k.pers?.A ?? 0.5) < 0.3 && hash(h.keeper * 17 + sim.today) < 0.3) return { open: true, sly: true };
    return { open: false };
  }
  return { open: true };
}

// ================================================================ decide から
export function leisureDecide(sim, p, add) {
  if (!p.needs || p.jail != null || p.fight || p.mission || p.party != null && p.quest) return;
  const h = sim.hour();
  if (h < 16.5 && h >= 1) return;
  const age = sim.ageOf(p);
  if (age < 16) return;
  const hh = sim.hh(p);
  if (!hh || hh.bandits) return;
  const n = p.needs, E = p.pers?.E ?? 0.5, R = sim.rng;
  const Z = tmp(sim);
  const single = p.spouseId == null;
  // 酒場の夜の踊り（奏でる人がいる晩だけ）
  const pf = Z.perf[p.s];
  if (pf && h >= 18 && h < 23.5 && age <= 50) {
    const b = sim.building(pf.bid);
    if (b) add(0.8 + (100 - n.pleasure) / 32 + (single && age >= 17 ? (100 - n.lust) / 38 : 0) + E * 1.4 - (age > 35 ? 1 : 0), 'ldance', { x: b.door.x, z: b.door.z, bld: b.id }, R.int(60, 100));
  }
  // 逢い引き（想い合う独り身どうし）
  if (single && age >= 17 && h >= 16.5 && h < 20.5 && n.lust < 70) {
    const lz = p.lz || (p.lz = {});
    if (lz.tryst !== sim.today && R.chance(0.35)) {
      const q = sim.crushOf(p);
      if (q && alive(q) && sim.ageOf(q) >= 17 && sim.rel(q, p).a >= 35 && q.jail == null) {
        add(1.5 + (100 - n.lust) / 20 + E, 'ltryst', sim.placeFor(p, 'plaza'), 80, { friend: q.id });
      }
    }
  }
  // 大人向け：歓楽の館
  if (!adultOn(sim) || age < 18 || h < 18 && h >= 1) return;
  const A = sim.S.leisure?.adult;
  const house = A?.houses?.[p.s];
  if (!house || house.closed) return;
  if (n.lust > 45 || age > 65) return;
  if (['king', 'royal'].includes(p.rank) || hh.royal) return;
  const pp = A.ppl[p.id];
  if (pp && (pp.w != null || pp.k != null)) return;
  if (pp?.last != null && sim.today - pp.last < 3 + (p.id % 4)) return;
  if (!openState(sim, p.s, house).open) return;
  // 行くかどうかは性格で分かれる
  const faith = p.values?.faith ?? 0.5, C = p.pers?.C ?? 0.5;
  let w = Math.pow(1 - faith, 2) * (1.25 - C);
  if (!single) w *= 0.08;
  if (CLERGY.has(p.job)) w *= 0.05;
  if (EASY_JOBS.has(p.job) && single && age < 40) w *= 1.5;
  if (w < 0.05 || !R.chance(Math.min(0.6, w))) return;
  const fee = feeOf(sim, p.s, house);
  if (spendable(sim, p) < fee + 5) return;
  const b = sim.building(house.bid);
  if (!b) return;
  add(1 + (100 - n.lust) / 14 * Math.min(1, w + 0.2), 'lvisit', { x: b.door.x, z: b.door.z, bld: b.id }, R.int(50, 80), { lzs: p.s });
}
function feeOf(sim, sid, h) {
  const s = sim.town(sid);
  const base = FEE[gradeOf(s)] || 7;
  const busy = Object.values(h.served || {}).reduce((x, y) => x + y, 0);
  const avail = Math.max(1, h.workers.length);
  return Math.round(base * (1 + Math.min(0.5, busy / (avail * 6))));
}

// ================================================================ arrive から
function leisureArrive_(sim, p, a) {
  if (!a) return;
  switch (a.type) {
    case 'lvisit': visitArrive(sim, p, a); break;
    case 'ltryst': trystArrive(sim, p, a); break;
    case 'bathe': L_(sim).stats.bath++; break;
    case 'ldance': {
      // 奏でる人へ心づけ（客の財布 → 奏でる人）
      const pf = tmp(sim).perf[p.s];
      const m = pf && sim.S.people[pf.pid];
      if (alive(m) && m !== p && spendable(sim, p) >= 3 && sim.hh(m) && sim.rng.chance(0.5)) { pay(sim, p, 1); earn(sim, m, 1, 0.6); }
      break;
    }
  }
}

function trystArrive(sim, p, a) {
  const q = sim.S.people[a.friend];
  const lz = p.lz || (p.lz = {});
  lz.tryst = sim.today;
  if (!alive(q) || q.jail != null) return;
  // 相手を呼ぶ（相手の心に「今夕、広場で」と約束が入る）
  sim.S.gatherings.push({ type: 'ltryst', place: 'plaza', from: sim.S.t, to: sim.S.t + 80, s: p.s, ids: [q.id], label: '逢い引き' });
}

function visitArrive(sim, p, a) {
  const A = A_(sim), R = sim.rng;
  const sid = a.lzs ?? p.s;
  const h = A.houses[sid];
  const done = () => { a.until = sim.S.t + 5; };
  if (!adultOn(sim) || !h) { done(); return; }
  // 年齢の点検（客）
  A.audit.checked++;
  if (!adult18(sim, p)) { A.audit.under++; done(); p.inside = null; return; }
  const st = openState(sim, sid, h);
  if (!st.open) { done(); return; }
  const keeper = sim.S.people[h.keeper];
  const kh = keeper && alive(keeper) ? sim.hh(keeper) : null;
  if (!kh || kh === sim.hh(p)) { done(); return; }
  const married = p.spouseId != null, clergy = CLERGY.has(p.job);
  // 誠実な主は、結婚している人と聖職者を門前で断る
  if ((married || clergy) && R.chance(0.3 + (keeper.pers?.A ?? 0.5) * 0.4)) { A.stats.refused++; done(); return; }
  const w = pickServer(sim, h);
  if (!w) { A.stats.refused++; done(); return; }
  A.audit.checked++;
  if (!adult18(sim, w)) { A.audit.under++; removeWorker(sim, sid, h, w, false); done(); return; }
  const fee = feeOf(sim, sid, h);
  if (spendable(sim, p) < fee) { done(); return; }
  // 代金：客 → 館の主の家計
  pay(sim, p, fee);
  kh.money += fee;
  h.take = r1((h.take || 0) + fee);
  h.owed[w.id] = r1((h.owed[w.id] || 0) + fee * 0.5);
  h.served[w.id] = (h.served[w.id] || 0) + 1;
  bump(p, { lust: 45, pleasure: 8 });
  A.stats.visits++;
  const ca = sim.ageOf(p), wa = sim.ageOf(w);
  A.audit.minCust = Math.min(A.audit.minCust, ca); A.audit.minWork = Math.min(A.audit.minWork, wa);
  A.visitLog.push({ d: sim.today, c: p.id, ca, w: w.id, wa, s: sid });
  if (A.visitLog.length > 300) A.visitLog.splice(0, A.visitLog.length - 300);
  const pp = P_(A, p.id);
  pp.last = sim.today; pp.n = (pp.n || 0) + 1;
  const b = sim.building(h.bid);
  if (R.chance(0.5)) alog(sim, `${p.given}は歓楽の館を訪れた。`, [p.id], b ? b.door : p.pos);
  // 病（見回りのある館ほど少ない）
  const risk = 0.004 * (h.inspected ? 0.4 : 1);
  if (R.chance(risk)) catchIll(sim, p, sid);
  if (R.chance(risk * 0.7)) catchIll(sim, w, sid);
  // 乱暴をはたらく客（重く罰する）
  if ((p.pers?.A ?? 0.5) < 0.2 && (p.pers?.N ?? 0.5) > 0.65 && R.chance(0.04)) {
    markWanted(sim, p, '館での乱暴', 60);
    A.stats.violence++;
    acase(sim, '館での乱暴', p, w);
    amem(sim, w, `館での乱暴に遭い、館の主が役人に訴えた`, { emo: -0.7, imp: 0.6, about: [p.id] });
    alog(sim, `${sim.fullName(p)}が館での乱暴の罪で手配された。`, [p.id], b ? b.door : p.pos);
  }
  // 人に見られると噂になり、名誉が下がる（噂を知るのは18歳以上だけ）
  const nearby = sim.nearby ? sim.nearby(p, 7).filter((q) => q !== p && adult18(sim, q)) : [];
  const seen = nearby.length && R.chance(Math.min(0.6, 0.12 * nearby.length));
  if (seen) {
    pp.rep = (pp.rep || 0) + 1;
    p.needs.esteem = clamp(p.needs.esteem - 12, 0, 100);
    const wit = R.pick(nearby);
    amem(sim, wit, `${p.given}が歓楽の館を訪れるのを見かけた`, { emo: -0.2, imp: 0.35, about: [p.id] });
    relUp(sim, wit, p, -3);
  }
  // 結婚している人：夫婦仲が大きく下がる。聖職者・既婚者は見つかれば罰金
  if (married) {
    const sp = sim.S.people[p.spouseId];
    if (alive(sp) && (seen || R.chance(0.25))) {
      relUp(sim, sp, p, -35); relUp(sim, p, sp, -8);
      amem(sim, sp, `${p.given}の夜遊びを知り、ひどい言い争いになった`, { emo: -0.8, imp: 0.8, about: [p.id] });
      amem(sim, p, `夜遊びが${sp.given}に知れて、ひどい言い争いになった`, { emo: -0.7, imp: 0.7, about: [sp.id] });
    }
  }
  if ((married || clergy) && (seen || R.chance(0.2))) fine(sim, p, clergy ? 20 : 12, seen ? R.pick(nearby) : lawOf(sim, sid), '禁じられた客');
  // 聖なる日にこっそり開けていた主
  if (st.sly && R.chance(0.2)) fine(sim, keeper, 20, lawOf(sim, sid), '聖なる日の営み', kh);
}
// 今夜あいている働き手（病気の人・今夜もう3回の人は休ませる）
function pickServer(sim, h) {
  const R = sim.rng;
  const ok = h.workers.map((id) => sim.S.people[id]).filter((q) => alive(q) && !q.ail && q.jail == null && (h.served[q.id] || 0) < 3 && adult18(sim, q));
  return ok.length ? R.pick(ok) : null;
}
function lawOf(sim, sid) { return sim.living().find((q) => q.s === sid && LAWFUL.includes(q.job) && q.jail == null && adult18(sim, q)) || null; }
// 罰金：違反した人 → 半分は告げた人、半分は施し箱
function fine(sim, p, amt, informer, why, hhOverride = null) {
  const A = A_(sim);
  if (!alive(p)) return 0;
  let x;
  if (hhOverride) { x = Math.max(0, Math.min(amt, hhOverride.money)); hhOverride.money -= x; }
  else { x = Math.max(0, Math.min(amt, spendable(sim, p))); pay(sim, p, x); }
  if (x <= 0) return 0;
  const t = sim.S.towns[p.s];
  const half = informer && alive(informer) && informer !== p && sim.hh(informer) ? r1(x / 2) : 0;
  if (half > 0) earn(sim, informer, half, 0.5);
  t.alms = (t.alms || 0) + (x - half);
  A.stats.fines++;
  acase(sim, why, p, null, { fine: x });
  amem(sim, p, `歓楽の館の決まりを破り、${x}銅貨の罰金を払わされた`, { emo: -0.6, imp: 0.5 });
  return x;
}
function catchIll(sim, p, sid) {
  if (!adult18(sim, p) || p.ail) return;
  if (!fallIll(sim, p, 'lhill', { txt: '体の具合がすぐれない。長わずらいになりそうだ' })) return;
  const m = p.memories?.[p.memories.length - 1];
  if (m && m.k === 'ill') m.k = 'lhx';
  const A = A_(sim);
  A.stats.sick++;
  A.sick.push({ d: sim.today, s: sid, id: p.id });
  if (A.sick.length > 100) A.sick.shift();
}

// ================================================================ doAction から
export function leisureDo(sim, p, dt) {
  const a = p.action;
  if (!a || !p.needs) return;
  const hr = dt / 60, n = p.needs;
  const age = sim.ageOf(p);
  switch (a.type) {
    case 'ldance':
      n.pleasure += 20 * hr; n.esteem += 3 * hr; n.sloth -= 3 * hr;
      if (age >= 17) n.lust += 12 * hr;
      break;
    case 'ltryst': {
      n.pleasure += 8 * hr;
      const q = a.friend != null ? sim.S.people[a.friend] : null;
      if (q && alive(q) && q.action?.type === 'ltryst' && dist(p, q) < 7) {
        n.lust += 25 * hr; relUp(sim, p, q, 3 * hr);
        if (q.needs) { q.needs.lust = clamp(q.needs.lust + 20 * hr, 0, 100); relUp(sim, q, p, 3 * hr); }
        if (!a.met) {
          a.met = true;
          const L = L_(sim);
          L.stats.tryst++;
          sim.remember(p, `夕暮れの広場で${q.given}と待ち合わせ、ふたりで歩いた`, { emo: 0.8, imp: 0.55, about: [q.id], k: 'love' });
          sim.remember(q, `${p.given}に誘われて、夕暮れの広場をふたりで歩いた`, { emo: 0.75, imp: 0.55, about: [p.id], k: 'love' });
          if (sim.rng.chance(0.4)) sim.pushLog(`${p.given}と${q.given}が夕暮れの広場で逢い引きした。`, 'event', [p.id, q.id], p.pos);
          if (sim.ageOf(p) >= 18 && sim.ageOf(q) >= 18) sim.maybeEngage(p, q);
        }
      } else if (a.friend == null) n.lust += 6 * hr;   // 呼ばれて来た側（相手が来るのを待っている）
      break;
    }
    case 'bathe':
      n.pleasure += 3 * hr;
      if (age >= 17) n.lust += 5 * hr;
      break;
    case 'lvisit':
      if (!adultOn(sim)) a.until = sim.S.t;   // 設定が切られた：すぐ帰る
      break;
  }
}

// ================================================================ 毎時
function leisureHourly_(sim) {
  const Z = tmp(sim), S = sim.S, R = sim.rng, L = L_(sim);
  const h = Math.floor(sim.hour());
  Z.perf = {}; Z.fest = {};
  // 町ごとの酒場と、奏でている人
  const tavOf = {};
  for (const s of S.world.settlements) { const b = !s.tribe && !s.tribal ? sim.townBuilding(s, 'tavern') : null; if (b) tavOf[s.id] = b.id; }
  const inTav = {};   // 酒場の番号 → 中にいる人
  const fest = {};    // 町 → 祭りに出ている人
  const festOn = new Set((S.gatherings || []).filter((g) => g.type === 'festival' && S.t >= g.from && S.t < g.to && g.s != null).map((g) => g.s));
  for (const p of sim.living()) {
    if (!p.needs || p.jail != null) continue;
    const a = p.action;
    if (p.inside != null && tavOf[p.s] === p.inside) (inTav[p.inside] || (inTav[p.inside] = [])).push(p);
    if (a && a.type === 'festival' && festOn.has(p.s) && a.phase === 'do') (fest[p.s] || (fest[p.s] = [])).push(p);
  }
  for (const [sid, bid] of Object.entries(tavOf)) {
    const here = inTav[bid] || [];
    let pf = here.find((q) => (q.action?.type === 'perform' || (q.action?.type === 'work' && PERFORMERS.has(q.job))) && sim.ageOf(q) >= 14);
    // 奏でる人がいない晩でも、客が集まれば、笛や手拍子の得意な客が一曲やる
    let amateur = false;
    if (!pf && (h >= 18 || h < 1) && here.length >= 4) {
      pf = here.filter((q) => sim.ageOf(q) >= 16 && (q.pers?.O ?? 0.5) + (q.pers?.E ?? 0.5) > 1.2).sort((a, b) => hash(b.id + sim.today) - hash(a.id + sim.today))[0];
      amateur = !!pf;
    }
    if (!pf) continue;
    Z.perf[sid] = { bid, pid: pf.id };
    if (h < 18 && h >= 1) continue;
    const b = sim.building(bid);
    // 吟遊詩人の恋歌
    if (!amateur && SINGERS.has(pf.job) && here.length > 1 && R.chance(0.6)) {
      L.stats.song++;
      let heard = null;
      for (const q of here) {
        if (q === pf || sim.ageOf(q) < 16) continue;
        bump(q, { pleasure: 6, lust: sim.ageOf(q) >= 17 ? 10 : 0 });
        L.stats.songHeard++;
        // 心づけ：聞き手の財布 → 奏でる人
        if (sim.hh(pf) && spendable(sim, q) >= 3 && R.chance(0.3)) { pay(sim, q, 1); earn(sim, pf, 1, 0.6); }
        if (!heard && q.spouseId == null) heard = q;
      }
      if (pf.needs) bump(pf, { esteem: 4 });
      if (heard && R.chance(0.5)) {
        sim.pushLog(`${heard.given}は${pf.job === 'bard' ? '吟遊詩人' : '楽師'}の${pf.given}の恋歌に聞きほれた。`, 'event', [heard.id, pf.id], b ? b.door : null);
        if (R.chance(0.4)) sim.remember(heard, `酒場で${pf.given}の恋歌を聞いて、胸がいっぱいになった`, { emo: 0.6, imp: 0.35, about: [pf.id], k: 'song' });
      }
    }
    // 酒場の夜の踊り
    const dancers = here.filter((q) => q !== pf && sim.ageOf(q) >= 16 && (q.action?.type === 'ldance' || q.action?.type === 'tavern'));
    if (dancers.length >= 2) {
      const pairs = pairUp(sim, dancers, 4);
      if (pairs.length) L.stats.danceNight++;
      for (const [x, y] of pairs) {
        L.stats.dance++;
        danceTogether(sim, x, y, 'tavern');
      }
      if (pairs.length && R.chance(0.45)) {
        const [x, y] = pairs[0];
        sim.pushLog(amateur ? `${pf.given}の笛に合わせて、${x.given}と${y.given}が酒場で踊った。` : `${x.given}と${y.given}が、${pf.given}の奏でる調べに合わせて酒場で踊った。`, 'event', [x.id, y.id, pf.id], b ? b.door : null);
      }
    }
  }
  // 祭りの踊りの輪
  for (const [sid, ppl] of Object.entries(fest)) {
    const cand = ppl.filter((q) => sim.ageOf(q) >= 16);
    if (cand.length < 2) continue;
    Z.fest[sid] = true;
    const pairs = pairUp(sim, cand, 6);
    for (const [x, y] of pairs) { L.stats.festDance++; danceTogether(sim, x, y, 'festival'); }
    if (pairs.length && R.chance(0.5)) {
      const [x, y] = pairs[0];
      sim.pushLog(`祭りの踊りの輪で、${x.given}と${y.given}が手を取り合った。`, 'event', [x.id, y.id], x.pos);
    }
  }
  if (adultOn(sim) && L.adult) adultHourly(sim, h);
}
// 踊りの組を作る：独り身の男女を、年の近い順に（身内どうしは組まない）。独り身が足りなければ、友だちどうしで
function pairUp(sim, list, max) {
  const R = sim.rng;
  const pool = R.shuffle(list.slice());
  const used = new Set(), out = [];
  for (const a of pool) {
    if (used.has(a.id) || out.length >= max) continue;
    let best = null, bs = -1e9;
    for (const b of pool) {
      if (b === a || used.has(b.id) || b.sex === a.sex) continue;
      const aa = sim.ageOf(a), ab = sim.ageOf(b);
      if (Math.abs(aa - ab) > 12 || (aa < 18) !== (ab < 18) && Math.abs(aa - ab) > 3) continue;
      if (sim.isKin(a, b)) continue;
      const sc = (a.spouseId == null && b.spouseId == null ? 20 : 0) + (a.spouseId === b.id ? 30 : 0) + sim.rel(a, b).a * 0.2 - Math.abs(aa - ab) + R.next() * 5;
      if (a.spouseId != null && a.spouseId !== b.id) continue;
      if (b.spouseId != null && b.spouseId !== a.id) continue;
      if (sc > bs) { bs = sc; best = b; }
    }
    if (best) { used.add(a.id); used.add(best.id); out.push([a, best]); }
  }
  return out;
}
function danceTogether(sim, a, b, where) {
  const R = sim.rng;
  for (const [x, y] of [[a, b], [b, a]]) {
    relUp(sim, x, y, 4 + (x.pers?.E ?? 0.5) * 2);
    bump(x, { pleasure: 8, lust: sim.ageOf(x) >= 17 ? 8 : 0 });
  }
  if (R.chance(0.3)) {
    const txt = where === 'festival' ? '祭りの踊りの輪で、' : '酒場の踊りで、';
    sim.remember(a, `${txt}${b.given}と手を取り合って踊った`, { emo: 0.6, imp: 0.4, about: [b.id], k: 'dance' });
    sim.remember(b, `${txt}${a.given}と手を取り合って踊った`, { emo: 0.6, imp: 0.4, about: [a.id], k: 'dance' });
  }
  if (a.spouseId == null && b.spouseId == null && sim.ageOf(a) >= 18 && sim.ageOf(b) >= 18) sim.maybeEngage(a, b);
}

// ================================================================ 毎日
function leisureDaily_(sim) {
  const L = L_(sim);
  // 設定と館の食い違いを直す（古いセーブ・ほかの場所で設定が変わったとき）
  if (adultOn(sim)) buildHouses(sim);
  else if (L.adult || sim.S.world.buildings.some((b) => b.type === HOUSE_TYPE)) purgeAdult(sim);
  matchmakers(sim);
  if (adultOn(sim) && L.adult) adultDaily(sim);
}

// 仲人の縁組：週に一度、町ごとに1組まで
function matchmakers(sim) {
  const L = L_(sim), R = sim.rng, S = sim.S;
  const A = adultOn(sim) ? L.adult : null;
  const byTown = {};
  for (const p of sim.living()) (byTown[p.s] || (byTown[p.s] = [])).push(p);
  const pend = S_pending(sim);
  for (const s of S.world.settlements) {
    if ((sim.today + s.id) % 7 !== 0) continue;
    const ppl = byTown[s.id] || [];
    const mm = ppl.filter((q) => q.needs && q.jail == null && sim.ageOf(q) >= 40 && (MATCHERS.includes(q.job) || (sim.ageOf(q) >= 55 && (q.pers?.A ?? 0.5) > 0.65)));
    if (!mm.length) continue;
    const singles = ppl.filter((q) => q.needs && q.spouseId == null && q.jail == null && !S.wanted?.[q.id] && !pend.has(q.id) && sim.ageOf(q) >= 20 && sim.ageOf(q) <= 42 && !['king', 'royal'].includes(q.rank)
      && !(A && (A.ppl[q.id]?.w != null || (A.ppl[q.id]?.stig || 0) >= 0.5)));
    // 年ごろで、人恋しさの強い人から
    const seekers = singles.filter((q) => sim.ageOf(q) >= 24 && (q.needs.lust < 60 || sim.ageOf(q) >= 28)).sort((a, b) => a.needs.lust - b.needs.lust);
    let made = false;
    for (const a of seekers.slice(0, 6)) {
      if (made) break;
      let best = null, bs = -1e9;
      for (const b of singles) {
        if (b === a || b.sex === a.sex || sim.isKin(a, b)) continue;
        const gap = Math.abs(sim.ageOf(a) - sim.ageOf(b));
        if (gap > 8 || Math.abs(sim.rankLv(a) - sim.rankLv(b)) >= 3) continue;
        const r = sim.rel(a, b).a, r2 = sim.rel(b, a).a;
        if (r < -10 || r2 < -10) continue;
        const sc = r + r2 - gap * 3 + ((a.pers?.A ?? 0.5) + (b.pers?.A ?? 0.5)) * 10 + R.next() * 10;
        if (sc > bs) { bs = sc; best = b; }
      }
      if (!best) continue;
      const m = R.pick(mm.filter((q) => q !== a && q !== best && q.given !== a.given && q.given !== best.given && q.hh !== a.hh && q.hh !== best.hh)) || null;
      if (!m) continue;
      // 仲人への礼金：両家の家計 → 仲人
      for (const x of [a, best]) { const fee = Math.min(5, Math.max(0, spendable(sim, x))); if (fee > 0 && sim.hh(m)) { pay(sim, x, fee); earn(sim, m, fee, 0.5); } }
      relUp(sim, a, best, Math.max(0, 74 - sim.rel(a, best).a));
      relUp(sim, best, a, Math.max(0, 70 - sim.rel(best, a).a));
      const before = S.pendingWeddings.length;
      sim.maybeEngage(a, best);
      const ok = S.pendingWeddings.length > before;
      sim.remember(a, `仲人の${m.given}の取り持ちで、${best.given}との縁談が${ok ? 'まとまった' : '持ち上がった'}`, { emo: 0.7, imp: 0.7, about: [best.id, m.id], k: 'love' });
      sim.remember(best, `仲人の${m.given}の取り持ちで、${a.given}との縁談が${ok ? 'まとまった' : '持ち上がった'}`, { emo: 0.6, imp: 0.7, about: [a.id, m.id], k: 'love' });
      if (m.needs) bump(m, { esteem: 12 });
      if (ok) { L.stats.match++; sim.pushLog(`仲人の${m.given}の取り持ちで、${a.given}と${best.given}の縁組がまとまった。`, 'event', [a.id, best.id, m.id], a.pos); }
      made = true;
    }
  }
}

// ================================================================ 大人向け：毎時・毎日
function adultHourly(sim, h) {
  const A = A_(sim);
  // 真夜中に「今夜の回数」を戻す
  if (h === 12) for (const hs of Object.values(A.houses)) hs.served = {};
}

function adultDaily(sim) {
  const A = A_(sim), R = sim.rng, S = sim.S;
  // 18歳未満がどこにも関わっていないかの点検（念のため毎日）
  for (const [id, pp] of Object.entries(A.ppl)) {
    const q = S.people[id];
    if (!q || q.deathYear != null) { if (pp.w == null && pp.k == null) delete A.ppl[id]; continue; }
    if (sim.ageOf(q) < 18) { A.audit.under++; delete A.ppl[id]; }
  }
  for (const [sidS, h] of Object.entries(A.houses)) {
    const sid = +sidS, s = sim.town(sid);
    const b = sim.building(h.bid);
    if (!b || b.type !== HOUSE_TYPE) { delete A.houses[sidS]; continue; }
    // 方針（週に一度）：信心深い王が立った・厳しい司祭が来た → 取り壊し
    if ((sim.today + sid) % 7 === 3) {
      const pol = policy(sim, s);
      if (!pol.ok) { closeForGood(sim, sid, h, pol); continue; }
    }
    // 館の主（亡くなった・町を出た → 新しい主を町が選ぶ）
    let keeper = S.people[h.keeper];
    if (!alive(keeper) || keeper.s !== sid || keeper.jail != null || !sim.hh(keeper)) {
      settleOwed(sim, h, keeper);
      if (keeper) { const pk = A.ppl[keeper.id]; if (pk) delete pk.k; }
      keeper = pickKeeper(sim, sid);
      h.keeper = keeper?.id ?? null; h.bind = null;
      if (keeper) { P_(A, keeper.id).k = sid; amem(sim, keeper, `町と誓約を交わし、${b.name}の主になった`, { emo: 0.3, imp: 0.5 }); }
    }
    const kh = keeper ? sim.hh(keeper) : null;
    // 働き手：辞めた人・結婚した人・亡くなった人を外す
    const pend = S_pending(sim);
    for (const id of h.workers.slice()) {
      const w = S.people[id];
      if (!alive(w) || w.s !== sid || w.jail != null) { removeWorker(sim, sid, h, w, false); continue; }
      if (w.spouseId != null || pend.has(w.id)) { removeWorker(sim, sid, h, w, true); continue; }
      // 低く見られることのつらさ
      bump(w, { esteem: -3 });
      // 足を洗う（いつでも辞められる。借金で縛られているあいだは辞められない＝罪）
      if (!h.bind) {
        const age = sim.ageOf(w);
        const pq = 0.012 + (w.needs.esteem < 30 ? 0.012 : 0) + (age > 33 ? 0.015 : 0) + (w.values?.faith ?? 0.3) * 0.02 + ((sim.hh(w)?.money || 0) > 150 ? 0.01 : 0);
        if (R.chance(pq)) removeWorker(sim, sid, h, w, true);
      }
    }
    // 人手が足りなければ、自分から申し出る人を受け入れる（1日1人まで）
    const cap = Math.min(4, 1 + Math.floor(townPeople(sim, sid).length / 90));
    if (h.workers.length < cap && keeper) recruit(sim, sid, h);
    // 見回り：町に医者か修道女がいれば見回ってもらえる
    h.inspected = sim.living().some((q) => q.s === sid && HEALERS.includes(q.job) && q.jail == null);
    // 給料日：館の主 → 働き手
    const kid = s.kingdom ?? 0;
    if (kh && isPayday(sim, kid)) settleOwed(sim, h, keeper);
    // 借り賃と税（7日ごと）：館の主 → 町の蓄え
    if (kh && (sim.today + sid) % 7 === 0 && h.take > 0) {
      const tax = Math.max(0, Math.min(r1(h.take * 0.2), kh.money));
      kh.money -= tax; S.towns[sid].fund = (S.towns[sid].fund || 0) + tax;
      h.take = 0;
    }
    // 仕入れ（酒と布）：館の主 → 市場の品の持ち主
    if (kh && (sim.today + sid) % 3 === 0 && h.take > 0 && kh.money > 30) {
      marketBuy(sim, sid, 'ale', 1, kh, { whole: true });
      if ((sim.today + sid) % 6 === 0) marketBuy(sim, sid, 'cloth', 1, kh, { whole: true });
    }
    // 病が広がったら、王か町長が館を閉じる
    if (!h.closed) {
      const recent = A.sick.filter((x) => x.s === sid && sim.today - x.d <= 20).length;
      if (recent >= 3) {
        h.closed = { until: sim.today + 30, why: 'ill' };
        A.stats.closures++;
        const by = S.kingdoms?.[kid] ? (S.people[S.kingdoms[kid].kingId]?.sex === 'f' ? '女王' : '王') : '町長';
        alog(sim, `${s.name}で病が広がり、${by}の命で歓楽の館が閉じられた。`, [], b.door);
      }
    } else if (h.closed.until <= sim.today) {
      h.closed = null;
      alog(sim, `${s.name}の歓楽の館が、見回りの約束をして再び開いた。`, [], b.door);
    }
    // 館が閉じているあいだは、裏にもぐりの商売が生まれやすい
    illicitDaily(sim, sid, h);
    // 借金の縛り（欲の深い主）と、その発覚
    bindDaily(sim, sid, h, keeper);
    // 人身売買（ごくまれ。必ず見張りの目にかかる）
    traffickDaily(sim, sid, h, keeper);
  }
  // 足を洗った人は、年月とともに評判が戻る（結婚もできるようになる）
  for (const [id, pp] of Object.entries(A.ppl)) {
    if (pp.w != null || !pp.stig) continue;
    pp.stig = Math.max(0, pp.stig - 0.02);
    if (pp.stig <= 0) delete pp.stig;
    if (pp.ex != null && pp.stig == null && sim.today - pp.ex > 60) delete pp.ex;
  }
}

function settleOwed(sim, h, keeper) {
  const kh = keeper && keeper.deathYear == null ? sim.hh(keeper) : (keeper ? sim.S.households[keeper.hh] : null);
  for (const [id, amt] of Object.entries(h.owed)) {
    const w = sim.S.people[id];
    const x = kh ? Math.max(0, Math.min(amt, kh.money - 5)) : 0;
    if (x > 0) {
      kh.money -= x;
      if (alive(w) && sim.hh(w)) earn(sim, w, x, 0.5);
      else if (w && sim.S.households[w.hh]) sim.S.households[w.hh].money += x;
      else kh.money += x;   // 受け取る人がいない：主の手元に残る
    }
    const rest = r1(amt - x);
    if (rest > 0.05 && alive(w) && kh) h.owed[id] = rest; else delete h.owed[id];
  }
}

// 働き手をやめる。quit=true なら自分から足を洗う（施し箱から支度金）
function removeWorker(sim, sid, h, w, quit) {
  const A = A_(sim);
  h.workers = h.workers.filter((id) => id !== w?.id);
  if (!w) return;
  const pp = P_(A, w.id);
  delete pp.w;
  if (!alive(w)) return;
  pp.ex = sim.today; pp.stig = Math.max(pp.stig || 0, 0.5);
  if (quit) {
    A.stats.exits++;
    const t = sim.S.towns[sid];
    const grant = Math.max(0, Math.min(15, t.alms || 0));
    if (grant > 0 && sim.hh(w)) { t.alms -= grant; earn(sim, w, grant, 0.5); }
    amem(sim, w, `歓楽の館の勤めをやめた。${grant > 0 ? `教会の支度金${grant}銅貨で、` : ''}新しい暮らしを始める`, { emo: 0.6, imp: 0.7 });
    alog(sim, `${w.given}は歓楽の館の勤めをやめ、${grant > 0 ? '教会の支度金を受けて' : ''}新しい暮らしを始めた。`, [w.id], w.pos);
  }
}

function closeForGood(sim, sid, h, pol) {
  const A = A_(sim), s = sim.town(sid);
  const keeper = sim.S.people[h.keeper];
  settleOwed(sim, h, keeper);
  for (const id of h.workers.slice()) removeWorker(sim, sid, h, sim.S.people[id], false);
  if (keeper) { const pk = A.ppl[keeper.id]; if (pk) delete pk.k; }
  const b = sim.building(h.bid);
  const by = pol.why === 'king' ? `信心深い${pol.who?.sex === 'f' ? '女王' : '王'}${pol.who?.given || ''}` : `司祭${pol.who?.given || ''}`;
  if (b) alog(sim, `${by}の意向で、${s.name}の歓楽の館は許しを取り消され、取り壊された。`, [], b.door);
  razeHouse(sim, h.bid);
  delete A.houses[sid];
  A.stats.closures++;
}

function illicitDaily(sim, sid, h) {
  const A = A_(sim), R = sim.rng, S = sim.S;
  const cur = A.illicit[sid];
  if (!cur && h.closed && R.chance(0.05)) {
    const boss = sim.living().find((q) => q.s === sid && adult18(sim, q) && (q.job === 'thief' || q.uwBoss != null || q.uwRole) && q.jail == null);
    if (boss) { A.illicit[sid] = { boss: boss.id, since: sim.today }; }
  }
  const il = A.illicit[sid];
  if (!il) return;
  const boss = S.people[il.boss];
  if (!alive(boss) || boss.jail != null) { delete A.illicit[sid]; return; }
  S.towns[sid].crime = (S.towns[sid].crime || 0) + 0.2;   // 見張れないので治安が少し悪くなる
  if (R.chance(0.1)) {
    const law = lawOf(sim, sid);
    fine(sim, boss, 30, law, 'もぐりの館');
    A.stats.illicit++;
    alog(sim, `${sim.town(sid).name}の役人が許しのないもぐりの館を見つけ、罰金を取って取り壊させた。`, [boss.id], boss.pos);
    delete A.illicit[sid];
  }
}

function bindDaily(sim, sid, h, keeper) {
  const A = A_(sim), R = sim.rng;
  if (!keeper || !alive(keeper)) return;
  if (!h.bind && (keeper.pers?.A ?? 0.5) < 0.3 && (keeper.pers?.C ?? 0.5) < 0.45 && h.workers.length && R.chance(0.012)) h.bind = { since: sim.today };
  if (!h.bind || (sim.today + sid) % 7 !== 5) return;
  // 週に一度の役人の見回り
  const law = lawOf(sim, sid);
  if (!law || !R.chance(0.35)) return;
  A.stats.bind++;
  acase(sim, '借金の縛り', keeper, null, { workers: h.workers.map((id) => ({ id, age: sim.ageOf(sim.S.people[id]) })) });
  h.bind = null;
  for (const id of h.workers) amem(sim, sim.S.people[id], `館の主の借金の縛りが役人に見つかり、借りは帳消しになった`, { emo: 0.6, imp: 0.6 });
  amem(sim, keeper, `借金の縛りが役人に見つかり、歓楽の館の主を解かれた`, { emo: -0.8, imp: 0.8, about: [law.id] });
  settleOwed(sim, h, keeper);
  const pk = P_(A, keeper.id); delete pk.k; pk.fired = true;
  const b = sim.building(h.bid);
  alog(sim, `${sim.fullName(keeper)}は働き手を借金で縛っていたことが見つかり、歓楽の館の主を解かれた。`, [keeper.id, law.id], b ? b.door : keeper.pos);
  const nk = pickKeeper(sim, sid, keeper);
  h.keeper = nk?.id ?? null;
  if (nk) { P_(A, nk.id).k = sid; amem(sim, nk, `町と誓約を交わし、${b?.name || '歓楽の館'}の主になった`, { emo: 0.3, imp: 0.5 }); }
}

function traffickDaily(sim, sid, h, keeper) {
  const A = A_(sim), R = sim.rng, S = sim.S;
  if (!R.chance(0.004)) return;
  const perp = sim.living().find((q) => adult18(sim, q) && q.jail == null && !S.wanted?.[q.id] && (q.job === 'thief' || q.job === 'smuggler' || q.job === 'pirate' || q.uwBoss != null) && Math.hypot(sim.townOf(q).x - sim.town(sid).x, sim.townOf(q).z - sim.town(sid).z) < 90);
  if (!perp) return;
  const victims = sim.living().filter((q) => q.s !== sid && adult18(sim, q) && sim.ageOf(q) <= 35 && q.spouseId == null && q.jail == null && ['commoner', 'homeless', 'wanderer'].includes(q.rank) && sim.hh(q) && !sim.hh(q).royal);
  if (!victims.length) return;
  const v = R.pick(victims);
  // 必ず見つかる：誠実な主はその場で役人に告げ、そうでなければ見回りの役人が見つける
  const honest = keeper && (keeper.pers?.A ?? 0.5) >= 0.4;
  markWanted(sim, perp, '人身売買', 200);
  A.stats.traffic++;
  acase(sim, '人身売買', perp, v, { keeperHonest: !!honest });
  // 被害者の保護と支度金：施し箱 → 本人
  const t = S.towns[v.s] || S.towns[sid];
  const grant = Math.max(0, Math.min(25, t.alms || 0));
  if (grant > 0) { t.alms -= grant; earn(sim, v, grant, 0.6); }
  P_(A, v.id).victim = sim.today;
  amem(sim, v, `悪い者にだまされ、歓楽の館へ売られそうになったが、役人に助けられた`, { emo: -0.7, imp: 0.9, about: [perp.id] });
  const b = sim.building(h.bid);
  alog(sim, `${sim.fullName(perp)}が人身売買の罪で手配された。${v.given}は保護され、施し箱から支度金を受け取った。`, [perp.id, v.id], b ? b.door : perp.pos);
  if (!honest && keeper) {
    // 見て見ぬふりをした主は解かれる
    const pk = P_(A, keeper.id); delete pk.k; pk.fired = true;
    settleOwed(sim, h, keeper);
    const nk = pickKeeper(sim, sid, keeper);
    h.keeper = nk?.id ?? null;
    if (nk) P_(A, nk.id).k = sid;
  }
}

// ================================================================ 設定を切った：跡形もなく消す
export function purgeAdult(sim) {
  const S = sim.S, L = L_(sim), A = L.adult;
  // 1) 未払いの取り分は、主から働き手へ払ってから消す（お金は消さない）
  if (A) for (const h of Object.values(A.houses)) settleOwedAll(sim, h);
  // 2) 館を取り壊す
  for (const b of S.world.buildings) if (b.type === HOUSE_TYPE) razeHouse(sim, b.id);
  // 3) 人：行動・病・記憶・会話の記録・好み
  const sickN = A?.stats?.sick || 0;
  for (const p of Object.values(S.people)) {
    if (p.action?.type === 'lvisit') { p.action = null; p.path = []; }
    if (p.q && p.q.lvisit != null) delete p.q.lvisit;
    if (p.ail?.kind === 'lhill') { p.ail = null; }
    if (p.imm?.lhill != null) delete p.imm.lhill;
    if (p.memories?.length) p.memories = p.memories.filter((m) => m.k !== 'lhx' && !ADULT_RX.test(m.txt || ''));
    if (p.talkLog?.length) p.talkLog = p.talkLog.filter((t) => !ADULT_RX.test(JSON.stringify(t)));
    if (p.saying && ADULT_RX.test(p.saying)) p.saying = null;
    // 大人向けの罪で牢にいる人は放つ（罪そのものが無かったことになる）
    if (p.jail != null && ADULT_CRIMES.has(p.crime)) { p.jail = null; p.inside = null; p.crime = null; p.prisonDays = 0; p.action = null; if (p.rank === 'prisoner' || p.rank === 'outlaw') p.rank = p.rankBefore || 'commoner'; delete p.rankBefore; }
  }
  if (S.health) {
    S.health.sick = (S.health.sick || []).filter((id) => S.people[id]?.ail);
    if (S.health.stats) S.health.stats.sick = Math.max(0, (S.health.stats.sick || 0) - sickN);
  }
  // 4) 手配書・事件の記録・ログ・速報・年代記
  for (const [id, w] of Object.entries(S.wanted || {})) if (ADULT_CRIMES.has(w.crime)) { delete S.wanted[id]; const p = S.people[id]; if (p && p.rank === 'outlaw') { p.rank = p.rankBefore || 'commoner'; delete p.rankBefore; } }
  if (S.justice?.cases) S.justice.cases = S.justice.cases.filter((c) => !ADULT_CRIMES.has(c.crime) && !ADULT_CRIMES.has(c.k) && !ADULT_RX.test(JSON.stringify(c)));
  if (S.uw?.cases) S.uw.cases = S.uw.cases.filter((c) => !ADULT_CRIMES.has(c.k));
  scrubArr(S.log, (e) => e.lh || ADULT_RX.test(e.text || ''));
  scrubArr(S.news, (e) => ADULT_RX.test(e.text || ''));
  scrubArr(S.chronicle, (e) => ADULT_RX.test(e.text || ''));
  for (const t of Object.values(S.towns || {})) if (Array.isArray(t.sayings)) scrubArr(t.sayings, (x) => ADULT_RX.test(typeof x === 'string' ? x : (x?.text || '')));
  scrubArr(S.gatherings || [], (g) => g.type === 'lvisit');
  // 会話の覚え（p.recent・p.tm など）や、ほかの仕組みの記録に写った文も、印のある所だけ取り除く
  const seen = new Set();
  for (const [k, v] of Object.entries(S)) if (k !== 'world' && k !== 'leisure') deepScrub(v, seen, 0);
  // 5) 大人向けの記録そのもの
  delete L.adult;
  L.gv++;
}
function settleOwedAll(sim, h) {
  const keeper = sim.S.people[h.keeper];
  settleOwed(sim, h, keeper);
  // 主の家計が足りずに残った分は、ただの「貸し」なので消してよい（お金は動いていない）
  h.owed = {};
}
const isBad = (v) => typeof v === 'string' && (v === 'lhx' || ADULT_RX.test(v));
const directBad = (o) => { for (const v of Object.values(o)) if (isBad(v)) return true; return false; };
// 配列：印のある文、または印のある文を直に持つ入れ物（記憶・会話・ログの1件）を取り除く。そのほかは中へ進む
// 入れ物：印のある文の欄だけを消し、中へ進む
function deepScrub(o, seen, depth) {
  if (!o || typeof o !== 'object' || seen.has(o) || depth > 9) return;
  seen.add(o);
  if (Array.isArray(o)) {
    if (o.length && typeof o[0] === 'number') return;
    scrubArr(o, (x) => isBad(x) || (x && typeof x === 'object' && !Array.isArray(x) && directBad(x)));
    for (const x of o) deepScrub(x, seen, depth + 1);
    return;
  }
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (isBad(v)) delete o[k];
    else if (v && typeof v === 'object') deepScrub(v, seen, depth + 1);
  }
}
function scrubArr(arr, bad) { if (!Array.isArray(arr)) return; let j = 0; for (let i = 0; i < arr.length; i++) if (!bad(arr[i])) arr[j++] = arr[i]; arr.length = j; }

// ================================================================ 画面用
export function isLeisureHouse(b) { return !!b && b.type === HOUSE_TYPE; }
export function leisureBuildingRows(sim, b) {
  if (!b || b.type !== HOUSE_TYPE || !adultOn(sim)) return [];
  const A = sim.S.leisure?.adult;
  const h = A && Object.values(A.houses).find((x) => x.bid === b.id);
  if (!h) return [];
  const k = sim.S.people[h.keeper];
  const st = openState(sim, b.settlement, h);
  const why = h.closed ? (h.closed.why === 'ill' ? `病のため閉じている（あと${h.closed.until - sim.today}日）` : '閉じている') : holyDay(sim, b.settlement) ? '聖なる日・休日のため休み' : st.open ? '開いている' : '日暮れから開く';
  return [
    ['許し', '町の許しを得て、主が誓約した館'],
    ['館の主', k && alive(k) ? sim.fullName(k) : '（いない）'],
    ['働き手', `${h.workers.length}人（全員18歳以上・通い）`],
    ['見回り', h.inspected ? '医者か修道女が見回っている' : '見回りなし'],
    ['いま', why],
    ['決まり', '聖なる日・祭り・休日は休み／結婚している人と聖職者は入れない'],
  ];
}
// 数え（試験と「暮らし」欄用）
export function leisureSummary(sim) {
  const L = sim.S.leisure;
  if (!L) return null;
  const out = { ...L.stats };
  if (adultOn(sim) && L.adult) {
    const A = L.adult;
    out.adult = { houses: Object.keys(A.houses).length, workers: Object.values(A.houses).reduce((s, h) => s + h.workers.length, 0), ...A.stats, audit: { ...A.audit } };
  }
  return out;
}

// 本体から呼ぶ入口（試験のときはお金の見張り付き）
export const ensureLeisure = audited('ensure', ensureLeisure_);
export const leisureToggle = audited('toggle', leisureToggle_);
export const leisureArrive = audited('arrive', leisureArrive_);
export const leisureHourly = audited('hourly', leisureHourly_);
export const leisureDaily = audited('daily', leisureDaily_);
