// 国どうしの外交と街道（開発部）
// ・街道工事：国庫にお金があり、相手国や独立した村と行き来する利点（交易品の差・人口・通行料の見込み）が大きいとき、
//   王は街道工事を命じる。人夫に日当を払い、何日もかけて1マスずつ道に変えていく。道すじに強い魔物がいれば、
//   先にギルドへ討伐依頼を出す（依頼主は王。報酬は報告のときに国庫から払われる：guild.js の reportQuest）。
// ・関所と通行料：街道が国境を越える所に関所、国が架けた橋に橋銭の番所を置く。料金は docs/通行料の歴史.md の
//   「9. エルデラントでの提案」に従う（荷車4・背負いの荷1・歩く旅人は関所では無料／橋は1、地元は半額、
//   よその国の荷には値打ちの3％の関税（欲張りな王は8％まで、気前のよい王は1〜2％）、1回の旅で値打ちの15％まで、
//   同じ日に同じ国の関所は2回目から無料、免除、条約、抜け道とわいろ、集めたお金の分け方）。
// ・国家間の取引：各国の余っている品と足りない品を毎日数え、国庫どうしで売り買いする。品物は隊商（荷車）で運ぶ。
//   値段は bank.js の exchangeRate（両替の相場）で相手の値段を自国の硬貨に直して決める。
// ・王の外交判断：王の性格で方針（平和好き／商売上手／野心家／臆病）が決まる。交易協定・街道の共同建設・同盟・援助・
//   国境争い（資源の要求）・和解の使節・宣戦。戦争は politics.js の declareWar を呼ぶ（export されていれば）。
//
// お金の出どころと行き先（どこからも湧かず、どこへも消えない）
//   通行料・関税 ……… 通る人の財布（足りなければ家計）／隊商の持ち主の家計・町の市場組合の蓄え／国の隊商なら買い手の国庫
//                       → 関所の箱 → 4割：街道の蓄え（S.diplo.fund[国]）、3割：関所の番兵の箱（gate.box）、3割：国庫
//   わいろ …………… 商人の家計 → 番兵の財布
//   罰金（関所破り）… 払う側 → 国庫
//   工事の日当 ……… 街道の蓄え（足りなければ国庫）→ 人夫の家計
//   橋の材木 ………… 国庫 → 町の市場の金庫（材木は市場の在庫から）
//   修理の給金 ……… 街道の蓄え → 道普請の人夫の家計
//   番兵の手当 ……… 関所の箱 → 番兵の家計（あふれた分は国庫へ）
//   国家間の取引 …… 売り手の国庫 → 売り手の町の市場の金庫（品物の仕入れ）／買い手の国庫 → 売り手の国庫（代金。半分は前払い、残りは着いた分だけ）
//                       着いた品は買い手の町の市場へ：市場の金庫 → 買い手の国庫（市場が買い取る）／御者の手間賃：売り手の国庫 → 御者の家計
//   援助・贈り物・貢ぎ物 … 国庫 → 国庫
//   独立した村との取引 …… 国庫 ⇔ 村の市場の金庫
//   硬貨は両替せずにそのまま動く（相手国の硬貨で払い、相手の国庫にはその硬貨が入る）。値段を決めるときだけ相場で換算する。
//
// 本体からの呼び方（くわしくは報告書のコード片）
//   diplomacyDaily(sim)   … newDay の expansionDaily のあと
//   diplomacyHourly(sim)  … newHour の expansionHourly のあと
//   diplomacyStep(sim, dt)… step の stepConvoys の直前（関所の前を通る人と荷車を見る。国の隊商の到着）
//   画面：diplomacyNationHTML / diplomacyWorldHTML / diplomacyRecords / gateViews / diplomacyThought
//
// 状態は S.diplo（古いセーブで欠けていても ensureDiplomacy が作る）。
import { T, W, H, MinHeap, walkable, MOVE_COST } from './world.js';
import { GOODS, JOBS, KINGDOMS } from './data.js';
import { exchangeRate } from './bank.js';
import { marketBuy, ownStock } from './market.js';
import { landRoute } from './logistics.js';
import { threatsNear } from './expansion.js';
import { consHalt } from './construct.js'; // 雨・嵐の時間は工事を休む（開発部）
import * as POL from './politics.js';

// ---------- 料金表（docs/通行料の歴史.md「9-2〜9-5」。数字はここにまとめ、あとで差し替えやすくする） ----------
export const TOLL = {
  border: { walk: 0, pack: 1, cart: 4, ship: 16 },   // 街道の関所（国境）の決まった料金
  bridge: { walk: 1, pack: 1, cart: 6, ship: 0 },    // 国が架けた橋の橋銭
  localMul: 0.5,                                      // 地元（その国の町の住民）は半額
  customs: { generous: 0.015, standard: 0.03, greedy: 0.08, min: 0.01, max: 0.08 },   // よその国の荷の値打ちにかける割合
  hostileMul: 1.5,                                    // 仲の悪い国（関係 −30 未満）
  warMul: 2,                                          // 戦争中の国
  capFrac: 0.15,                                      // 1回の旅で払う合計は荷の値打ちの15％まで
  evadeFrom: 0.05, evadeSlope: 4,                     // 値打ちの5％を超えたら抜け道：確率＝（割合−5％）×4
  evadeCaught: 0.12, fineMul: 3, fineAdd: 10,         // 抜け道が見つかったら：料金の3倍＋10銅貨
  bribeChance: 0.3, bribeFrac: 0.5, bribeCaught: 0.1, // わいろ：料金の半分を番兵へ
  split: { fund: 0.4, guard: 0.3, crown: 0.3 },       // 集めたお金の分け方：街道の蓄え・番兵・国庫
  fundCap: 500, boxCap: 150, guardDay: 9,             // 街道の蓄えの上限（超えた分は国庫へ）・番兵の箱の上限・番兵1人1日の手当
  bridgeRecovered: 0.5,                               // 橋を架けた費用を取り戻したら橋銭は半額
};
const EXEMPT_JOBS = new Set(['priest', 'nun', 'cleric', 'paladin', 'king', 'royal', 'messenger', 'herald']);
const DUTY = new Set(['march', 'defend', 'crusade', 'deliver', 'rescue', 'alert', 'roadbuild']);
// 工事
const WAGE_DAY = 5;               // 人夫1人1日の日当（道1マス2.5銅貨 ＝ 1人1日2マス）
const WORK_DAY = 2;               // 人夫1人1日の仕事量（草地1マス＝1）
const TILE_WORK = { [T.FOREST]: 1.6, [T.DENSE]: 2, [T.JUNGLE]: 2, [T.ROCK]: 3, [T.SWAMP]: 2.5, [T.SNOW]: 1.3, [T.DESERT]: 1.2, [T.RIVER]: 4 };
const BRIDGE_WOOD = 3;
const LS = Math.max(1, Math.min(W, H) / 160);
const BIG = W >= 320;
const CREW_REACH = Math.round(45 * LS);      // 現場まで歩いて通える町の距離
const NOROAD_MAX = 80;                       // 街道がないとき、国の隊商が野を越えて行ける距離（広い世界でも同じ。遠い国とは街道がないと商えない）
const MAX_CARAVANS = 3;
const ROADLIKE = (t) => t === T.ROAD || t === T.BRIDGE || t === T.PLAZA || t === T.DOCK;
const NOBUILD = new Set([T.SEA, T.DEEP, T.PEAK, T.BLD, T.LAVA, T.WALL, T.FENCE, T.FIELD, T.PASTURE]);
const LABOR = new Set(['roadworker', 'pioneer', 'woodcutter', 'charcoal', 'gatherer', 'laundress', 'stablehand', 'beggar', 'shepherd', 'miner', 'mason', 'farmer']);
const GUARDS = ['gatekeeper', 'guard', 'soldier', 'militia'];
const ARMY = new Set(['knight', 'soldier', 'general']);
export const POLICY_NAME = { peace: '平和好き', merchant: '商売上手', ambitious: '野心家', timid: '臆病' };
const POLICY_DESC = {
  peace: '争いを避け、困った国には手を差しのべる。関税は軽い',
  merchant: '自国の品を高く売れる相手を探し、街道と協定で交易を広げる',
  ambitious: '資源と土地を欲しがり、弱い相手には強く出る。関税は重い',
  timid: '国庫を固く守り、危ない工事や争いには手を出さない',
};
const PACT_NAME = { trade: '交易協定', jointroad: '街道の共同建設', alliance: '同盟', aid: '援助', tribute: '貢ぎ物' };
const RES_GROUP = { food: '食料', wood: '木材', stone: '石', ore: '鉄', monster: '魔物素材', other: 'その他' };
const FOOD = new Set(['wheat', 'bread', 'fish', 'meat', 'honey']);
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
const r0 = (v) => Math.round(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const alive = (p) => p && p.deathYear == null;
const title = (p) => (p?.sex === 'f' ? '女王' : '王');
const isKid = (k) => k != null && k >= 0;

function groupOf(g) {
  if (FOOD.has(g)) return 'food';
  if (g === 'wood') return 'wood';
  if (g === 'stone') return 'stone';
  if (g === 'ore') return 'ore';
  const G = GOODS[g];
  if (G?.cat === 'magic' || G?.src === 'monster') return 'monster';
  if (G?.cat === 'food' || G?.cat === 'delicacy') return 'food';
  return 'other';
}
const gname = (g) => GOODS[g]?.name || g;

// ---------- 状態 ----------
export function ensureDiplomacy(sim) {
  const S = sim.S;
  if (!S.diplo) {
    S.diplo = {
      v: 1, seq: 1, roads: [], gates: [], pacts: [], deals: [], log: [], policy: {}, bal: {}, fund: {}, seen: {}, warSeen: {}, cool: {},
      stats: { roadsOpened: 0, tilesLaid: 0, bridges: 0, tolls: 0, tollN: 0, customs: 0, fixed: 0, evaded: 0, bribes: 0, bribeAmt: 0, fines: 0, deals: 0, dealValue: 0, lost: 0,
        pacts: 0, trade: 0, joint: 0, alliance: 0, aid: 0, aidAmt: 0, tribute: 0, disputes: 0, envoys: 0, wars: 0, warsAll: 0, wagesPaid: 0, repairs: 0, refused: 0, purges: 0 },
      hist: [], init: false,
    };
  }
  const D = S.diplo;
  for (const k of S.kingdoms || []) if (D.fund[k.id] == null) D.fund[k.id] = 0;
  if (!D.init && S.kingdoms && S.world) { D.init = true; initAncient(sim); }
  return D;
}

function note(sim, txt, ks = [], opt = {}) {
  const D = sim.S.diplo;
  D.log.push({ d: sim.today, k: ks, txt, kind: opt.kind || 'info' });
  if (D.log.length > 160) D.log.splice(0, D.log.length - 160);
  if (opt.news) sim.news(txt, opt.news, opt.pos || null);
  else if (opt.log !== false) sim.pushLog(txt, 'event', opt.ids || [], opt.pos || null);
  if (opt.chron) sim.chron(txt, ks[0]);
}
const K = (sim, k) => sim.S.kingdoms[k];
const kname = (sim, k) => (isKid(k) ? K(sim, k)?.name || KINGDOMS[k]?.name || '' : '');
const kshort = (sim, k) => kname(sim, k).replace('王国', '');
function kingOf(sim, k) { const p = sim.S.people[K(sim, k)?.kingId]; return alive(p) ? p : null; }
function partyName(sim, party) { return typeof party === 'number' ? kname(sim, party) : sim.town(+String(party).slice(1))?.name || '村'; }
function towns(sim, k) { return sim.S.world.settlements.filter((s) => s.kingdom === k && !s.abandoned && !sim.S.towns[s.id]?.occupied); }
function kOfSid(sim, sid) { const k = sim.town(sid)?.kingdom; return isKid(k) ? k : null; }
function homeK(sim, p) { return kOfSid(sim, p.s); }
function addRel(sim, a, b, d) { const A = K(sim, a); if (A?.relations && A.relations[b] != null) A.relations[b] = clamp(A.relations[b] + d, -100, 100); }
function rel(sim, a, b) { return K(sim, a)?.relations?.[b] ?? 0; }
// 国庫へ入れるときは、税の収支の記録（k.fisc.dayIn）にも足す（taxes.js の「出」の計算がずれないように）
function toTreasury(k, amt) { if (!k || !(amt > 0)) return; k.treasury += amt; if (k.fisc) k.fisc.dayIn += amt; }
function fromTreasury(k, amt) { const x = Math.max(0, Math.min(amt, k.treasury)); k.treasury -= x; return x; }
function armySize(sim, k) { let n = 0; for (const p of sim.living()) if (ARMY.has(p.job) && p.jail == null && sim.town(p.s)?.kingdom === k) n += p.lv || 1; return n; }
function pactOf(sim, a, b, type) {
  const D = sim.S.diplo;
  const mine = D.pacts.find((p) => p.type === type && p.until > sim.today && ((p.a === a && p.b === b) || (p.a === b && p.b === a)));
  if (mine) return mine;
  const X = sim.S.expansion;
  if (X?.pacts && (type === 'alliance' || type === 'truce')) return X.pacts.find((p) => p.type === type && p.until > sim.today && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) || null;
  return null;
}
function atWar(sim, a, b) { return K(sim, a)?.war?.with === b || K(sim, b)?.war?.with === a; }

// ---------- 王の方針 ----------
function kingType(king) {
  if (!king) return 'timid';
  const P = king.pers || {}, V = king.values || {};
  const sc = {
    peace: (P.A ?? 0.5) * 1.2 + (1 - (V.ambition ?? 0.5)) * 0.7,
    merchant: (P.C ?? 0.5) * 0.7 + (P.O ?? 0.5) * 0.7 + (V.ambition ?? 0.5) * 0.3,
    ambitious: (V.ambition ?? 0.5) * 1.4 + (V.courage ?? 0.5) * 0.4 + (1 - (P.A ?? 0.5)) * 0.4,
    timid: (P.N ?? 0.5) * 0.9 + (1 - (V.courage ?? 0.5)) * 0.9,
  };
  return Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
}
export function kingPolicyOf(sim, k) {
  const D = ensureDiplomacy(sim);
  const kg = kingOf(sim, k);
  let P = D.policy[k];
  if (!P || P.kingId !== (kg?.id ?? null)) {
    const type = kingType(kg);
    const greed = K(sim, k)?.taxes?.greed ?? 0.5;
    const C = TOLL.customs;
    const customs = type === 'peace' ? C.generous : type === 'ambitious' ? clamp(0.05 + greed * 0.03, C.standard, C.greedy) : C.standard;
    const free = type === 'merchant' && (kg?.pers?.O ?? 0) > 0.82;   // 関所の関税をなくす王（信長型）
    P = D.policy[k] = { kingId: kg?.id ?? null, type, customs: free ? 0 : customs, free, since: sim.today, last: -99, note: null, stat: { pass: 0, evade: 0 } };
    if (kg && sim.today > 0) note(sim, `${kname(sim, k)}の${title(kg)}${kg.given}は「${POLICY_NAME[type]}」の方針をとる（${POLICY_DESC[type]}）`, [k], { log: true });
    if (free && kg) note(sim, `${kname(sim, k)}の${title(kg)}${kg.given}が、関所の関税をなくすと宣言した。商人たちは喜んでいる`, [k], { news: 2, pos: sim.town(K(sim, k).capital) });
  }
  return P;
}
function setNote(sim, k, txt) { const P = kingPolicyOf(sim, k); P.note = { d: sim.today, txt }; }

// ---------- 道の網（道・橋・広場・桟橋のつながり）と、町どうしのつながり ----------
function roadNet(sim, force = false) {
  const D = sim.S.diplo;
  if (!force && D._net && D._net.day === sim.today && !D._netDirty) return D._net;
  const w = sim.S.world, tiles = w.tiles, N = W * H;
  const lab = new Int32Array(N).fill(-1);
  let nl = 0;
  const q = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (lab[i] >= 0 || !ROADLIKE(tiles[i])) continue;
    let h = 0, t = 0; q[t++] = i; lab[i] = nl;
    while (h < t) {
      const j = q[h++], x = j % W, z = (j / W) | 0;
      if (x > 0 && lab[j - 1] < 0 && ROADLIKE(tiles[j - 1])) { lab[j - 1] = nl; q[t++] = j - 1; }
      if (x < W - 1 && lab[j + 1] < 0 && ROADLIKE(tiles[j + 1])) { lab[j + 1] = nl; q[t++] = j + 1; }
      if (z > 0 && lab[j - W] < 0 && ROADLIKE(tiles[j - W])) { lab[j - W] = nl; q[t++] = j - W; }
      if (z < H - 1 && lab[j + W] < 0 && ROADLIKE(tiles[j + W])) { lab[j + W] = nl; q[t++] = j + W; }
    }
    nl++;
  }
  // 町（城壁の内側は通り抜けられる）を結び目にして、道のかたまりをまとめる
  const S = w.settlements, par = S.map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const labOwner = new Int32Array(nl).fill(-1);
  for (const s of S) {
    if (s.abandoned) continue;
    const r = (s.r || 6) + 1;
    for (let z = s.z - r; z <= s.z + r; z++) for (let x = s.x - r; x <= s.x + r; x++) {
      if (!inb(x, z)) continue;
      const L = lab[z * W + x]; if (L < 0) continue;
      if (labOwner[L] < 0) labOwner[L] = s.id; else { const a = find(labOwner[L]), b = find(s.id); if (a !== b) par[a] = b; }
    }
  }
  const group = S.map((s) => find(s.id));
  const labGroup = new Int32Array(nl).fill(-1);
  for (let L = 0; L < nl; L++) if (labOwner[L] >= 0) labGroup[L] = group[labOwner[L]];
  D._net = { day: sim.today, lab, labGroup, group };
  D._netDirty = false;
  return D._net;
}
function linked(sim, a, b) { const n = roadNet(sim); return n.group[a] === n.group[b]; }
function kingdomsLinked(sim, a, b) {
  const n = roadNet(sim);
  const ga = new Set(towns(sim, a).map((s) => n.group[s.id]));
  return towns(sim, b).some((s) => ga.has(n.group[s.id]));
}

// ---------- 経路探し（道を敷く・古い街道をなぞる） ----------
// sources: タイル番号の配列。goal(i) が true になる所まで。cost(i, from) が null なら通れない。
function search(sources, goal, cost, hx, hz, hw = 0.3, cap = W * H) {
  const N = W * H;
  const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hp = new MinHeap();
  for (const i of sources) { g[i] = 0; hp.push(0, i); }
  let it = 0, end = -1;
  while (hp.size && it++ < cap) {
    const i = hp.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (goal(i)) { end = i; break; }
    const x = i % W, z = (i / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), nz = z + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (!inb(nx, nz)) continue;
      const j = nz * W + nx;
      if (done[j]) continue;
      const c = cost(j, i);
      if (c == null) continue;
      const ng = g[i] + c;
      if (ng < g[j]) { g[j] = ng; came[j] = i; hp.push(ng + Math.hypot(nx - hx, nz - hz) * hw, j); }
    }
  }
  if (end < 0) return null;
  const path = [];
  for (let c = end; c !== -1; c = came[c]) path.push(c);
  return path.reverse();
}
function dangerIdx(x, z) { const cw = Math.ceil(W / 8), ch = Math.ceil(H / 8); return Math.min(ch - 1, (z / 8) | 0) * cw + Math.min(cw - 1, (x / 8) | 0); }
function townMask(sim, keep) {
  const m = new Uint8Array(W * H);
  for (const s of sim.S.world.settlements) {
    if (s.abandoned || keep.has(s.id)) continue;
    const r = (s.r || 6) + 1;
    for (let z = Math.max(0, s.z - r); z <= Math.min(H - 1, s.z + r); z++) for (let x = Math.max(0, s.x - r); x <= Math.min(W - 1, s.x + r); x++) m[z * W + x] = 1;
  }
  return m;
}
// 新しい街道の道すじ：自国の道の網（なければ町の門）から、相手の町の道の網（または町）まで
function planPath(sim, k, fromSid, toSid, avoid = null) {
  const S = sim.S, w = S.world, tiles = w.tiles, hgt = w.hgt, ko = w.kingdomOf;
  const net = roadNet(sim);
  const gF = net.group[fromSid], gT = net.group[toSid];
  const to = sim.town(toSid), from = sim.town(fromSid);
  const tk = to.kingdom;
  const keep = new Set([fromSid, toSid]);
  const mask = townMask(sim, keep);
  const sources = [];
  for (let i = 0; i < W * H; i++) { const L = net.lab[i]; if (L >= 0 && net.labGroup[L] === gF && (ko[i] === k || cheb(i % W, (i / W) | 0, from.x, from.z) <= from.r + 2)) sources.push(i); }
  if (!sources.length) for (const g of from.gates || []) if (inb(g.x, g.z)) sources.push(g.z * W + g.x);
  if (!sources.length) sources.push(from.z * W + from.x);
  const dm = S.dangerMap || [];
  const goal = (i) => { const L = net.lab[i]; if (L >= 0 && net.labGroup[L] === gT) return true; return tiles[i] !== T.RIVER && cheb(i % W, (i / W) | 0, to.x, to.z) <= Math.max(2, (to.r || 5) - 1); };   // 川の上で終わる街道（途切れた橋）にしない
  const cost = (j, i) => {
    const t = tiles[j];
    if (ROADLIKE(t)) return 0.3;
    if (NOBUILD.has(t)) return null;
    if (mask[j]) return null;
    const x = j % W, z = (j / W) | 0;
    let c = t === T.RIVER ? 9 + (tiles[i] === T.RIVER || tiles[i] === T.BRIDGE ? 10 : 0) : (MOVE_COST[t] || 2) + Math.abs((hgt[j] || 0) - (hgt[i] || 0)) * 2;
    if (t === T.WASTE) c += 6;
    c += (dm[dangerIdx(x, z)] || 0) * 0.5;
    const o = ko[j];
    if (isKid(o) && o !== k && o !== tk) c += 1.5;       // よその国の土地はなるべく通らない
    if (avoid && avoid.has(dangerIdx(x, z))) c += 25;
    return c;
  };
  return search(sources, goal, cost, to.x, to.z, 0.3);
}
// 古い街道：道の上だけをたどって2つの町を結ぶ
function tracePath(sim, a, b) {
  const w = sim.S.world, tiles = w.tiles, A = sim.town(a), B = sim.town(b);
  const src = [];
  for (let z = A.z - A.r - 1; z <= A.z + A.r + 1; z++) for (let x = A.x - A.r - 1; x <= A.x + A.r + 1; x++) if (inb(x, z) && ROADLIKE(tiles[z * W + x])) src.push(z * W + x);
  if (!src.length) src.push(A.z * W + A.x);
  return search(src, (i) => cheb(i % W, (i / W) | 0, B.x, B.z) <= B.r, (j) => (ROADLIKE(tiles[j]) ? 1 : null), B.x, B.z, 1);
}

// ---------- 関所の置き場所 ----------
function placeGates(sim, road) {
  const D = sim.S.diplo, w = sim.S.world, ko = w.kingdomOf;
  const path = road.path;
  if (!path || path.length < 3) return;
  const nearTown = (x, z) => w.settlements.some((s) => !s.abandoned && cheb(s.x, s.z, x, z) <= (s.r || 6) + 2);
  const add = (k, idx, dir) => {
    if (!isKid(k) || !K(sim, k)) return;
    // 国境から自国の側へ2マス入った所（町の中なら置かない）
    let j = idx;
    for (let s = 0; s < 2; s++) { const n = j - dir; if (n < 0 || n >= path.length || ko[path[n]] !== k) break; j = n; }
    const x = path[j] % W, z = (path[j] / W) | 0;
    if (nearTown(x, z)) return;
    const old = D.gates.find((g) => g.kind === 'border' && g.k === k && cheb(g.x, g.z, x, z) <= 5);
    if (old) { if (!old.roads.includes(road.id)) old.roads.push(road.id); return; }
    const g = { id: D.seq++, kind: 'border', k, x, z, roads: [road.id], name: `${sim.placeName(x, z)}の関所`, built: sim.today, builder: road.ancient ? null : (k === road.k || k === road.partner),
      collected: 0, passes: 0, evaded: 0, bribes: 0, box: 0, guards: [], today: { n: 0, amt: 0 }, last: null };
    D.gates.push(g);
    road.gates = road.gates || []; road.gates.push(g.id);
    if (sim.today > 0) note(sim, `${kname(sim, k)}が${road.name}の国境に「${g.name}」を置いた`, [k], { pos: { x, z } });
  };
  for (let i = 0; i + 1 < path.length; i++) {
    const a = ko[path[i]], b = ko[path[i + 1]];
    if (a === b) continue;
    add(a, i, 1);          // a の側：i から道の先へ出ていく
    add(b, i + 1, -1);     // b の側：i+1 から入ってくる
  }
}
function placeBridgeTolls(sim, road) {
  const D = sim.S.diplo, w = sim.S.world;
  const runs = [];
  let cur = [];
  for (const i of road.path) { if ((road.bridged || []).includes(i)) cur.push(i); else if (cur.length) { runs.push(cur); cur = []; } }
  if (cur.length) runs.push(cur);
  for (const run of runs) {
    const m = run[run.length >> 1], x = m % W, z = (m / W) | 0;
    const o = w.kingdomOf[m];
    const k = isKid(o) && K(sim, o) ? o : road.k;
    const g = { id: D.seq++, kind: 'bridge', k, x, z, roads: [road.id], name: `${sim.placeName(x, z)}の橋の番所`, built: sim.today, builder: true, costLeft: run.length * 10 + BRIDGE_WOOD * run.length * 2,
      collected: 0, passes: 0, evaded: 0, bribes: 0, box: 0, guards: [], today: { n: 0, amt: 0 }, last: null };
    D.gates.push(g);
    road.gates = road.gates || []; road.gates.push(g.id);
  }
}

// 古い街道（世界ができたときからある、国と国・国と村を結ぶ道）を記録し、昔からの関所を置く
function initAncient(sim) {
  const S = sim.S, D = S.diplo, w = S.world;
  const net = roadNet(sim, true);
  const parties = [];
  for (const k of S.kingdoms) parties.push({ key: k.id, list: towns(sim, k.id) });
  for (const s of w.settlements) if (!isKid(s.kingdom) && !s.abandoned) parties.push({ key: 'v' + s.id, list: [s] });
  for (let i = 0; i < parties.length; i++) for (let j = i + 1; j < parties.length; j++) {
    const A = parties[i], B = parties[j];
    if (typeof A.key !== 'number' && typeof B.key !== 'number') continue;
    let best = null, bd = 1e9;
    for (const a of A.list) for (const b of B.list) { if (net.group[a.id] !== net.group[b.id]) continue; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < bd) { bd = d; best = [a, b]; } }
    if (!best) continue;
    const path = tracePath(sim, best[0].id, best[1].id);
    if (!path) continue;
    const road = { id: D.seq++, ancient: true, k: typeof A.key === 'number' ? A.key : null, partner: typeof B.key === 'number' ? B.key : null, from: best[0].id, to: best[1].id,
      name: `${best[0].name.replace(/^(王都|港町)/, '')}・${best[1].name.replace(/^(王都|港町)/, '')}の古街道`, path, todo: [], lo: 0, hi: -1, stage: 'open', day0: 0, openDay: 0, spent: {}, crew: [], gates: [], wear: 0 };
    D.roads.push(road);
    placeGates(sim, road);
  }
}

// ---------- 国ごとの余りと不足（毎日） ----------
function balances(sim) {
  const S = sim.S, D = S.diplo;
  for (const k of S.kingdoms) {
    const ts = towns(sim, k.id);
    const out = {};
    if (!ts.length) { D.bal[k.id] = out; continue; }
    for (const g of Object.keys(GOODS)) {
      let st = 0, tg = 0, pr = 0, n = 0;
      for (const s of ts) { const m = S.towns[s.id]; if (!m || m.stock?.[g] == null) continue; st += m.stock[g]; tg += GOODS[g].target || 1; pr += m.price[g]; n++; }
      if (!n) continue;
      const r = st / Math.max(1, tg);
      out[g] = { r: Math.round(r * 100) / 100, sur: Math.max(0, st - tg * 1.3), def: Math.max(0, tg * 0.7 - st), price: pr / n };
    }
    D.bal[k.id] = out;
  }
}
function famine(sim, k) {
  const b = sim.S.diplo.bal[k]; if (!b) return false;
  const bread = b.bread, wheat = b.wheat;
  return (bread && bread.price > (GOODS.bread.base || 3) * 1.8) || (wheat && wheat.r < 0.3 && (!bread || bread.r < 0.5));
}
function surplusOf(sim, k) { const b = sim.S.diplo.bal[k] || {}; return Object.keys(b).filter((g) => b[g].r > 1.4); }
function deficitOf(sim, k) { const b = sim.S.diplo.bal[k] || {}; return Object.keys(b).filter((g) => b[g].r < 0.6); }
function complementary(sim, a, b) {
  const sa = new Set(surplusOf(sim, a)), sb = new Set(surplusOf(sim, b));
  return deficitOf(sim, b).filter((g) => sa.has(g)).length + deficitOf(sim, a).filter((g) => sb.has(g)).length;
}
// 町の市場どうしの値の開き（相場で換算）から、1年（40日）で見込める交易の利
function tradeGain(sim, kA, sidA, sidB) {
  const S = sim.S, mA = S.towns[sidA], mB = S.towns[sidB];
  if (!mA || !mB) return 0;
  const kB = kOfSid(sim, sidB);
  const rate = exchangeRate(sim, kB, kA);
  let gain = 0;
  for (const g of Object.keys(GOODS)) {
    if (mA.stock?.[g] == null || mB.stock?.[g] == null) continue;
    const pa = mA.price[g], pb = mB.price[g] * rate, tg = GOODS[g].target || 1;
    if (pb > pa * 1.25 && mA.stock[g] > tg) gain += Math.min(10, mA.stock[g] - tg) * (pb - pa) * 0.5;
    if (pa > pb * 1.25 && mB.stock[g] > tg) gain += Math.min(10, mB.stock[g] - tg) * (pa - pb) * 0.5;
  }
  return gain * 4;   // 1年に4回くらい隊商が行き来する見込み
}
function popOf(sim, pred) { let n = 0; for (const p of sim.living()) if (pred(p)) n++; return n; }

// ---------- 街道工事 ----------
function planRoads(sim) {
  const S = sim.S, D = S.diplo;
  for (const k of S.kingdoms) {
    if ((sim.today + k.id * 3) % 6 !== 0) continue;
    const king = kingOf(sim, k.id); if (!king) continue;
    if (k.war) { setNote(sim, k.id, '戦のさなかで、街道の普請どころではない'); continue; }
    const P = kingPolicyOf(sim, k.id);
    const mine = D.roads.filter((r) => !r.ancient && (r.k === k.id || r.partner === k.id) && ['purge', 'build'].includes(r.stage));
    if (mine.length >= (P.type === 'merchant' && k.treasury > 1500 ? 2 : 1)) continue;
    const reserve = { peace: 300, merchant: 250, ambitious: 350, timid: 550 }[P.type] + (S.demon?.active ? 250 : 0);
    if (k.treasury < reserve + 100) { setNote(sim, k.id, `国庫が心もとないので、街道の普請は見送る（${r0(k.treasury)}銅貨）`); continue; }
    const cands = roadTargets(sim, k.id);
    let started = false;
    for (const c of cands.slice(0, 2)) {
      if (D.cool[`road:${k.id}:${c.to}`] > sim.today || D.cool[`refuse:${k.id}:${sim.town(c.to).kingdom}`] > sim.today) continue;
      const path = planPath(sim, k.id, c.from, c.to);
      if (!path) { D.cool[`road:${k.id}:${c.to}`] = sim.today + 40; continue; }
      const todo = path.filter((i) => !ROADLIKE(S.world.tiles[i]));
      if (todo.length < 2) continue;
      if (todo.length > (BIG ? 420 : 140)) { D.cool[`road:${k.id}:${c.to}`] = sim.today + 60; continue; }
      const bridges = todo.filter((i) => S.world.tiles[i] === T.RIVER).length;
      const work = todo.reduce((s, i) => s + (TILE_WORK[S.world.tiles[i]] || 1), 0);
      const cost = work / WORK_DAY * WAGE_DAY + bridges * BRIDGE_WOOD * 2;
      // 街道は何十年も使える。王が「何年で元が取れればよい」と考えるか（1年＝40日）
      const horizon = { merchant: 4, peace: 3, ambitious: 2.5, timid: 1.5 }[P.type];
      const benefit = c.gain * horizon;
      if (benefit < cost || k.treasury - Math.min(cost * 0.3, 300) < reserve) { D.cool[`road:${k.id}:${c.to}`] = sim.today + 20; setNote(sim, k.id, `${sim.town(c.to).name}への街道は、費用（約${r0(cost)}銅貨）に見合わないと見送った`); continue; }
      if (startRoad(sim, k.id, c, path, todo, cost)) { started = true; break; }
    }
    if (!started && !P.note) setNote(sim, k.id, '今は新しい街道を急ぐ理由がない');
  }
}
// 道でつながっていない相手の町（よその国の町・独立した村）
function roadTargets(sim, k) {
  const S = sim.S, net = roadNet(sim);
  const mine = towns(sim, k);
  if (!mine.length) return [];
  const myGroups = new Set(mine.map((s) => net.group[s.id]));
  const out = [];
  for (const s of S.world.settlements) {
    if (s.abandoned || s.kingdom === k || S.towns[s.id]?.occupied || myGroups.has(net.group[s.id])) continue;
    if (!S.towns[s.id]) continue;
    const ok = s.kingdom;
    if (isKid(ok) && (atWar(sim, k, ok) || rel(sim, k, ok) < -40)) continue;
    if (s.tribal && s.annexed == null && rel(sim, k, ok) < 0 && S.tribes) { /* 民族の村：交わりを嫌う村もある */ }
    const from = mine.slice().sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    const d = Math.hypot(from.x - s.x, from.z - s.z);
    if (d > (BIG ? 260 : 120)) continue;
    let gain = tradeGain(sim, k, from.id, s.id);
    const pop = isKid(ok) ? popOf(sim, (p) => sim.town(p.s)?.kingdom === ok) : popOf(sim, (p) => p.s === s.id);
    gain += pop * 1.2;                 // 通行料の見込み（人と荷の行き来）
    if (s.type === 'capital') gain *= 1.2;
    out.push({ from: from.id, to: s.id, gain, d, sc: gain / Math.max(10, d) });
  }
  return out.sort((a, b) => b.sc - a.sc);
}
function startRoad(sim, k, c, path, todo, cost) {
  const S = sim.S, D = S.diplo;
  const to = sim.town(c.to), from = sim.town(c.from);
  const tk = isKid(to.kingdom) ? to.kingdom : null;
  const king = kingOf(sim, k);
  // 相手の国の土地を通るなら、相手の同意が要る。仲がよく、相手にも利があれば共同で造る
  let partner = null;
  if (tk != null) {
    const crosses = todo.some((i) => S.world.kingdomOf[i] === tk);
    const PT = kingPolicyOf(sim, tk);
    const their = tradeGain(sim, tk, c.to, c.from) + popOf(sim, (p) => sim.town(p.s)?.kingdom === k) * 1.2;
    const theyLike = rel(sim, tk, k) > 10 && PT.type !== 'timid' && K(sim, tk).treasury > 500 && their * ({ merchant: 4, peace: 3, ambitious: 2.5, timid: 1.5 }[PT.type]) > cost * 0.5;
    if (theyLike && kingOf(sim, tk)) partner = tk;
    else if (crosses && (rel(sim, tk, k) < -20 || (PT.type === 'ambitious' && rel(sim, tk, k) < -5))) {
      D.stats.refused++; D.cool[`road:${k}:${c.to}`] = sim.today + 30; D.cool[`refuse:${k}:${tk}`] = sim.today + 30;
      addRel(sim, k, tk, -3);
      note(sim, `${kname(sim, tk)}は、${kname(sim, k)}の街道が自国の土地を通ることを拒んだ`, [k, tk], { pos: to });
      return false;
    }
  }
  const name = `${from.name.replace(/^(王都|港町)/, '').replace(/村$/, '')}・${to.name.replace(/^(王都|港町)/, '').replace(/村$/, '')}街道`;
  const road = { id: D.seq++, ancient: false, k, partner, from: c.from, to: c.to, name, path, todo, lo: 0, hi: todo.length - 1, stage: 'build', day0: sim.today, openDay: null,
    spent: { [k]: 0, ...(partner != null ? { [partner]: 0 } : {}) }, crew: [], pcrew: [], gates: [], bridged: [], wear: 0, est: r0(cost), threat: null, purgeDay: null, rerouted: false, quests: [] };
  D.roads.push(road);
  const who = `${title(king)}${king?.given || ''}`;
  if (partner != null) {
    D.pacts.push({ id: D.seq++, type: 'jointroad', a: k, b: partner, since: sim.today, until: sim.today + 400, road: road.id });
    D.stats.pacts++; D.stats.joint++;
    addRel(sim, k, partner, 6); addRel(sim, partner, k, 6);
    note(sim, `${kname(sim, k)}と${kname(sim, partner)}が、${name}（約${todo.length}マス）を共同で造る約束を結んだ`, [k, partner], { news: 2, pos: from, chron: true });
  } else note(sim, `${kname(sim, k)}の${who}が、${to.name}へ向かう${name}（約${todo.length}マス・見積り${r0(cost)}銅貨）の普請を命じた`, [k], { news: 2, pos: from, chron: true });
  setNote(sim, k, `${to.name}への街道を造らせている`);
  checkThreats(sim, road);
  return true;
}
// 道すじの強い魔物：先に討伐（ギルドへ王の布告の依頼。報酬は報告のとき国庫から）
function checkThreats(sim, road) {
  const S = sim.S, D = S.diplo, w = S.world;
  const pts = [];
  for (let j = road.lo; j <= road.hi; j += 8) pts.push(j);
  // 道すじの場所ごとに、まわりの魔物の強さを見る。弱い獣や小物がばらばらにいるだけなら、人夫と護衛で追い払える
  const ids = new Set(); let power = 0, named = null;
  let bLo = Infinity, bHi = -Infinity;
  for (const j of pts) {
    const i = road.todo[j], x = i % W, z = (i / W) | 0;
    if (w.settlements.some((s) => cheb(s.x, s.z, x, z) <= (s.r || 6) + 3)) continue;
    const th = threatsNear(sim, x, z, 5);
    let local = 0;
    for (const id of th.ids) { const c = S.creatures[id]; if (c) local += (c.atk || 5) * Math.sqrt(c.maxhp || 20); }
    if (local < 160 && th.named == null) continue;
    for (const id of th.ids) ids.add(id);
    power = Math.max(power, local);
    bLo = Math.min(bLo, j - 8); bHi = Math.max(bHi, j + 8);
    if (th.named != null) named = th.named;
  }
  road.block = ids.size ? { lo: bLo, hi: bHi } : null;   // 魔物の縄張りにかかる区間（そこまでは造り進められる）
  if (!ids.size) { if (road.stage === 'purge') { road.stage = 'build'; note(sim, `${road.name}の道すじの魔物がいなくなり、普請が再開された`, [road.k], { pos: sim.town(road.from) }); } return false; }
  if (road.stage !== 'purge') {
    road.stage = 'purge'; road.purgeDay = sim.today; D.stats.purges++;
    note(sim, `${road.name}の道すじに強い魔物がいる。${kname(sim, road.k)}はギルドに討伐を頼み、魔物の縄張りの手前まで普請を進める`, [road.k], { news: 1, pos: sim.town(road.from) });
  }
  const k = K(sim, road.k);
  S.quests = S.quests || [];
  const list = [...ids].map((id) => S.creatures[id]).filter((c) => c && c.hp > 0 && !c.inDungeon && !c.quested).sort((a, b) => (b.atk || 0) * (b.maxhp || 0) - (a.atk || 0) * (a.maxhp || 0)).slice(0, 3);
  for (const c of list) {
    const pw = (c.atk || 5) + (c.maxhp || 20) / 8;
    const q = { id: (S.nextQuest = (S.nextQuest || 0) + 1), state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 16, type: 'hunt', s: k.capital, from: k.capital, target: c.id,
      rank: Math.min(6, Math.floor(pw / 9)), reward: Math.round((15 + pw * 3) * (c.named ? 3 : 1.4)), giver: k.kingId, title: `${sim.placeName(c.pos.x, c.pos.z)}の${c.name}を討て（${kshort(sim, road.k)}王の布告・街道普請のため）`, road: road.id };
    c.quested = true;
    S.quests.push(q); road.quests.push(q.id);
    sim.pushLog(`【依頼】${q.title}（報酬${q.reward}銅貨）`, 'event', [], sim.town(k.capital));
  }
  return true;
}
function stepRoad(sim, road) {
  const S = sim.S, D = S.diplo, w = S.world;
  const k = K(sim, road.k);
  if (!k) { road.stage = 'failed'; return; }
  if (road.stage === 'purge') {
    if ((sim.today - road.purgeDay) % 2 === 0 && !checkThreats(sim, road)) { /* 再開した */ }
    else if (sim.today - road.purgeDay > 24) {
      if (!road.rerouted) {
        // 魔物の縄張りを避けて道すじを引き直す
        const avoid = new Set();
        for (const i of road.todo.slice(road.lo)) { const x = i % W, z = (i / W) | 0; if (threatsNear(sim, x, z, 5).power > 60) avoid.add(dangerIdx(x, z)); }
        const path = planPath(sim, road.k, road.from, road.to, avoid);
        road.rerouted = true;
        if (path) { road.path = path; road.todo = path.filter((i) => !ROADLIKE(w.tiles[i])); road.lo = 0; road.hi = road.todo.length - 1; road.purgeDay = sim.today; note(sim, `${road.name}は、魔物の縄張りを避けて道すじを引き直した`, [road.k], { pos: sim.town(road.from) }); checkThreats(sim, road); return; }
      }
      failRoad(sim, road, '道すじの魔物を退けられず、普請を諦めた');
      return;
    }
  }
  if (road.stage !== 'build' && road.stage !== 'purge') return;
  const blk = road.stage === 'purge' ? road.block : null;
  const canGo = (dir) => (road.lo <= road.hi) && (!blk || (dir > 0 ? road.lo < blk.lo : road.hi > blk.hi));
  if (k.war) return;
  // 両端から工事（共同なら相手国は向こうの端から）
  const sides = [{ kid: road.k, dir: 1, crewKey: 'crew' }];
  if (road.partner != null && K(sim, road.partner) && !atWar(sim, road.k, road.partner)) sides.push({ kid: road.partner, dir: -1, crewKey: 'pcrew' });
  for (const sd of sides) {
    if (!canGo(sd.dir)) continue;
    const KK = K(sim, sd.kid);
    const head = road.todo[sd.dir > 0 ? road.lo : road.hi];
    const hx = head % W, hz = (head / W) | 0;
    // 魔物が出ていれば今日は休む
    const dm = S.dangerMap?.[dangerIdx(hx, hz)] || 0;
    if (dm > 12) { if (sim.rng.chance(0.3)) note(sim, `${road.name}の普請場に魔物が出て、今日の工事は止まった`, [sd.kid], { pos: { x: hx, z: hz } }); if (sim.rng.chance(0.3)) checkThreats(sim, road); continue; }
    const want = clamp(Math.floor((KK.treasury + (D.fund[sd.kid] || 0)) / 250) + 2, 2, BIG ? 10 : 7);
    const crew = hireCrew(sim, sd.kid, hx, hz, want, road);
    road[sd.crewKey] = crew.map((p) => p.id);
    if (!crew.length) continue;
    // 日当：街道の蓄え → 足りなければ国庫 → 人夫の家計
    let paid = 0;
    const workers = [];
    for (const p of crew) {
      let x = Math.min(WAGE_DAY, D.fund[sd.kid] || 0); D.fund[sd.kid] -= x;
      if (x < WAGE_DAY) x += fromTreasury(KK, Math.min(WAGE_DAY - x, Math.max(0, KK.treasury - 60)));
      if (x <= 0) break;
      const hh = sim.hh(p); if (hh) hh.money += x; else p.purse = (p.purse || 0) + x;
      paid += x; workers.push(p);
      if (sim.rng.chance(0.25)) sim.remember(p, `${road.name}の普請で一日働き、${Math.round(x)}銅貨の日当をもらった`, { emo: 0.2, imp: 0.3, k: 'works' });
    }
    road.spent[sd.kid] = (road.spent[sd.kid] || 0) + paid; D.stats.wagesPaid += paid;
    if (!workers.length) { if (sim.rng.chance(0.2)) note(sim, `${kname(sim, sd.kid)}の国庫が乏しく、${road.name}の普請が止まっている`, [sd.kid], { pos: { x: hx, z: hz } }); continue; }
    const work = workers.reduce((s, p) => s + WORK_DAY * (0.8 + (p.skill?.[p.job] || 0.3) * (p.job === 'roadworker' ? 0.6 : 0.2)), 0);
    // その日の働きは、朝7時から夕方5時までの1時間ごとに少しずつ使い、端から1マスずつ延ばす（roadHour）。雨の時間の分は使えずに終わる
    const bank = road.bank || (road.bank = {});
    bank[sd.dir > 0 ? 'w1' : 'w2'] = work; bank[sd.dir > 0 ? 'k1' : 'k2'] = sd.kid;
  }
  if (road.lo > road.hi) openRoad(sim, road);
}
// 街道の普請を1時間ぶん進める（diplomacyHourly から、朝7時〜夕5時）
function roadHour(sim, road) {
  const S = sim.S, D = S.diplo, w = S.world, bank = road.bank;
  if (!bank) return;
  const blk = road.stage === 'purge' ? road.block : null;
  const canGo = (dir) => (road.lo <= road.hi) && (!blk || (dir > 0 ? road.lo < blk.lo : road.hi > blk.hi));
  const left = Math.max(1, 17 - Math.floor(sim.hour()));
  const changed = [];
  for (const dir of [1, -1]) {
    const wk = dir > 0 ? 'w1' : 'w2', rk = dir > 0 ? 'r1' : 'r2', pk = dir > 0 ? 'part1' : 'part2';
    if (!(bank[wk] > 0) || !canGo(dir)) continue;
    const i0 = road.todo[dir > 0 ? road.lo : road.hi];
    if (consHalt(sim, i0 % W, (i0 / W) | 0)) continue;
    const use = bank[wk] / left;
    bank[wk] -= use;
    let work = use + (bank[rk] || 0);
    bank[rk] = 0; bank[pk] = 0;
    while (work > 0 && canGo(dir)) {
      const i = road.todo[dir > 0 ? road.lo : road.hi];
      const t = w.tiles[i];
      const need = TILE_WORK[t] || 1;
      if (work < need) { bank[rk] = work; bank[pk] = work / need; break; }
      work -= need;
      layTile(sim, road, bank[dir > 0 ? 'k1' : 'k2'] ?? road.k, i, t, changed);
      if (dir > 0) road.lo++; else road.hi--;
    }
  }
  if (changed.length) { sim.events.push({ type: 'tiles', list: changed }); D._netDirty = true; }
  if (road.lo > road.hi) openRoad(sim, road);
}
function layTile(sim, road, kid, i, t, changed) {
  const S = sim.S, D = S.diplo, w = S.world;
  const x = i % W, z = (i / W) | 0;
  const near = nearestTown(sim, kid, x, z);
  const m = near ? S.towns[near.id] : null;
  if (t === T.RIVER) {
    // 橋：材木を市場から買う（国庫 → 市場の金庫）。在庫がなければ細い橋で済ませる
    if (m && m.stock.wood >= BRIDGE_WOOD) {
      const KK = K(sim, kid);
      const cost = BRIDGE_WOOD * m.price.wood;
      if (KK.treasury > cost) { marketBuy(sim, near.id, 'wood', BRIDGE_WOOD, 'k' + kid, { force: true }); road.spent[kid] = (road.spent[kid] || 0) + cost; }   // 材木は持ち主（木こり・商人）から国庫で買う
    }
    w.tiles[i] = T.BRIDGE; road.bridged.push(i); D.stats.bridges++;
  } else {
    // 伐った木と割った石は、近くの町の市場に出す（開拓で出た木材と土石も使い道がある）
    if (m && (t === T.FOREST || t === T.DENSE || t === T.JUNGLE)) m.stock.wood += 1;
    if (m && t === T.ROCK) m.stock.stone += 1;
    w.tiles[i] = T.ROAD;
  }
  changed.push(i); D.stats.tilesLaid++;
}
function nearestTown(sim, k, x, z) {
  let best = null, bd = 1e9;
  for (const s of towns(sim, k)) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function hireCrew(sim, k, x, z, n, road) {
  const S = sim.S;
  const near = towns(sim, k).filter((s) => Math.hypot(s.x - x, s.z - z) <= CREW_REACH + (s.r || 0));
  const pool = (near.length ? near : [nearestTown(sim, k, x, z)].filter(Boolean)).map((s) => s.id);
  const ok = (p) => pool.includes(p.s) && p.jail == null && !p.fight && (!p.mission || p.mission.type === 'roadbuild') && !p.quest && p.expedition == null && p.expProj == null && !p.bandit
    && sim.ageOf(p) >= 16 && sim.ageOf(p) <= 58 && (p.hp || 1) > (p.maxhp || 1) * 0.6 && !['king', 'royal', 'noble', 'knight'].includes(p.rank) && !ARMY.has(p.job) && !p.action?.convoy;
  const cands = sim.living().filter(ok);
  const score = (p) => (p.job === 'roadworker' ? 10 : p.job === 'pioneer' ? 7 : LABOR.has(p.job) ? 3 : !p.job ? 4 : 0) + ((sim.hh(p)?.money || 0) < 60 ? 3 : 0) + ((road.crew || []).includes(p.id) || (road.pcrew || []).includes(p.id) ? 2 : 0);
  return cands.filter((p) => score(p) >= 3).sort((a, b) => score(b) - score(a)).slice(0, n);
}
function openRoad(sim, road) {
  const S = sim.S, D = S.diplo;
  road.stage = 'open'; road.openDay = sim.today;
  D.stats.roadsOpened++;
  D._netDirty = true;
  placeGates(sim, road);
  placeBridgeTolls(sim, road);
  const to = sim.town(road.to);
  const days = sim.today - road.day0;
  const spent = Object.entries(road.spent).map(([k, v]) => `${kshort(sim, +k)}${r0(v)}`).join('・');
  const txt = road.partner != null
    ? `${kname(sim, road.k)}と${kname(sim, road.partner)}が、共同で造った${road.name}を開通させた（${days}日・費用 ${spent}銅貨）`
    : `${kname(sim, road.k)}が${to.name}への${road.name}を開通させた（${days}日・費用${r0(road.spent[road.k] || 0)}銅貨）`;
  note(sim, txt, [road.k, ...(road.partner != null ? [road.partner] : [])], { news: 3, pos: to, chron: true });
  for (const id of [...(road.crew || []), ...(road.pcrew || [])]) { const p = S.people[id]; if (alive(p)) sim.remember(p, `みんなで造った${road.name}がついに開通した`, { emo: 0.8, imp: 0.7, k: 'works' }); }
  if (isKid(to.kingdom)) { addRel(sim, road.k, to.kingdom, 4); addRel(sim, to.kingdom, road.k, 4); }
  const pact = D.pacts.find((p) => p.type === 'jointroad' && p.road === road.id); if (pact) pact.until = sim.today + 120;
  for (const id of [...(road.crew || []), ...(road.pcrew || [])]) { const p = S.people[id]; if (p?.mission?.type === 'roadbuild') p.mission = null; }
}
function failRoad(sim, road, why) {
  road.stage = 'failed'; road.failDay = sim.today;
  note(sim, `${kname(sim, road.k)}の${road.name}：${why}（${road.todo.length - Math.max(0, road.hi - road.lo + 1)}マスまで造った）`, [road.k], { news: 1, pos: sim.town(road.from) });
  sim.S.diplo.cool[`road:${road.k}:${road.to}`] = sim.today + 80;
  for (const id of [...(road.crew || []), ...(road.pcrew || [])]) { const p = sim.S.people[id]; if (p?.mission?.type === 'roadbuild') p.mission = null; }
}
// 開いた街道の傷みと修理（街道の蓄え → 道普請の人夫の家計）
function repairRoads(sim) {
  const S = sim.S, D = S.diplo;
  for (const road of D.roads) {
    if (road.stage !== 'open' || !(road.wear > 5)) continue;
    const ks = [road.k, road.partner].filter((k) => isKid(k) && K(sim, k));
    for (const k of ks) {
      const amt = Math.min(D.fund[k] || 0, road.wear * 2.5 / ks.length);
      if (amt < 3) continue;
      const men = sim.living().filter((p) => p.job === 'roadworker' && sim.town(p.s)?.kingdom === k && p.jail == null).slice(0, 3);
      if (!men.length) continue;
      D.fund[k] -= amt;
      for (const p of men) { const hh = sim.hh(p); if (hh) hh.money += amt / men.length; else p.purse = (p.purse || 0) + amt / men.length; }
      road.wear = Math.max(0, road.wear - amt / 2.5 * ks.length);
      D.stats.repairs += amt; D.stats.wagesPaid += amt;
    }
  }
}

// ---------- 関所：通る人と荷車を見る（毎歩。2分おき） ----------
export function diplomacyStep(sim, dt) {
  const S = sim.S;
  const D = S.diplo; if (!D) return;
  caravanArrivals(sim);
  if (S.t < (D._scan || 0)) return;
  D._scan = S.t + 2;
  const G = D.gates; if (!G.length) return;
  // 荷車・船（logistics.js の隊商と、この仕組みの国の隊商）
  for (const c of S.convoys || []) {
    if (c.kind !== 'cart' || c.state === 'done') continue;
    for (const g of G) {
      if (Math.abs(c.pos.x - g.x) > 1.8 || Math.abs(c.pos.z - g.z) > 1.8) continue;
      c.gates = c.gates || {};
      if (c.gates[g.id]) continue;
      c.gates[g.id] = 1;
      tollConvoy(sim, g, c);
    }
  }
  // 歩く人（背負いの荷の行商人、橋を渡る旅人）
  for (const p of sim.living()) {
    if (p.inside != null || p.jail != null || p.action?.convoy != null) continue;
    const x = p.pos.x, z = p.pos.z;
    for (const g of G) {
      if (Math.abs(x - g.x) > (g.kind === 'bridge' ? 1.2 : 1.8) || Math.abs(z - g.z) > (g.kind === 'bridge' ? 1.2 : 1.8)) continue;
      const key = `${p.id}:${g.id}`;
      if ((D.seen[key] || -1e9) > S.t - 720) continue;       // 半日のうちに同じ所で二度は取らない（行き来する番兵や近所の人）
      D.seen[key] = S.t;
      tollWalker(sim, g, p);
    }
  }
}
function treaty(sim, gk, pk) {
  if (!isKid(pk) || pk === gk) return null;
  if (pactOf(sim, gk, pk, 'alliance')) return 'alliance';
  if (pactOf(sim, gk, pk, 'trade') || pactOf(sim, gk, pk, 'jointroad')) return 'trade';
  return null;
}
// 料金の計算（fixed：決まった料金、customs：関税）
function feeFor(sim, g, kind, value, payerK) {
  const tab = TOLL[g.kind] || TOLL.border;
  const local = payerK === g.k;
  const tr = treaty(sim, g.k, payerK);
  let fixed = tab[kind] || 0;
  if (local || tr === 'alliance') fixed *= TOLL.localMul;
  if (g.kind === 'bridge' && g.costLeft != null && g.costLeft <= 0) fixed *= TOLL.bridgeRecovered;
  let customs = 0;
  if (g.kind === 'border' && !local && value > 0) {
    const P = kingPolicyOf(sim, g.k);
    let rate = P.customs;
    if (isKid(payerK)) {
      if (rel(sim, g.k, payerK) < -30) rate *= TOLL.hostileMul;
      if (atWar(sim, g.k, payerK)) rate *= TOLL.warMul;
    }
    if (tr === 'alliance') rate = 0;
    else if (tr === 'trade') rate *= P.type === 'merchant' ? 0 : 0.5;   // 条約はおたがいに同じ扱い
    customs = value * rate;
  }
  return { fixed, customs, local, tr };
}
// 関所の箱に入ったお金を分ける：街道の蓄え4割・番兵の箱3割・国庫3割
function collect(sim, g, amt) {
  const D = sim.S.diplo, k = K(sim, g.k);
  if (!(amt > 0) || !k) return;
  D.fund[g.k] = (D.fund[g.k] || 0) + amt * TOLL.split.fund;
  g.box += amt * TOLL.split.guard;
  toTreasury(k, amt * TOLL.split.crown);
  g.collected += amt; g.today.amt += amt; g.today.n++;
  if (g.costLeft != null) g.costLeft -= amt;
  D.stats.tolls += amt; D.stats.tollN++;
}
function guardOf(sim, g) {
  const S = sim.S;
  let p = g.guards.map((id) => S.people[id]).find(alive);
  if (!p) {
    const s = nearestTown(sim, g.k, g.x, g.z);
    if (s) p = sim.living().find((q) => q.s === s.id && GUARDS.includes(q.job) && q.jail == null);
  }
  return p || null;
}
// 払う：取れるだけ取る（足りなければ持っている分だけ）
function take(acct, amt) { const x = Math.max(0, Math.min(amt, acct.money)); acct.money -= x; return x; }
function personAcct(sim, p) {
  const hh = sim.hh(p);
  return { get money() { return (p.purse || 0) + Math.max(0, (hh?.money || 0) - 20); }, set money(v) { const cur = (p.purse || 0) + Math.max(0, (hh?.money || 0) - 20); let d = cur - v; const a = Math.min(d, p.purse || 0); p.purse = (p.purse || 0) - a; d -= a; if (d > 0 && hh) hh.money -= d; } };
}
function convoyAcct(sim, c) {
  if (c.diplo) { const dl = sim.S.diplo.deals.find((d) => d.id === c.diplo); const k = dl && typeof dl.buyer === 'number' ? K(sim, dl.buyer) : null; if (k) return { get money() { return k.treasury; }, set money(v) { k.treasury = v; } }; const m = dl ? sim.S.towns[+String(dl.buyer).slice(1)] : null; return m ? { get money() { return m.fund || 0; }, set money(v) { m.fund = v; } } : null; }
  if (c.fund != null) { const t = sim.S.towns[c.fund]; return t ? { get money() { return t.fund || 0; }, set money(v) { t.fund = v; } } : null; }
  return sim.S.households[c.hh] || null;
}
function convoyHomeK(sim, c) { if (c.diplo) { const dl = sim.S.diplo.deals.find((d) => d.id === c.diplo); if (dl) return typeof dl.buyer === 'number' ? dl.buyer : null; } return kOfSid(sim, c.home ?? c.from); }
function cargoValue(goods) { let v = 0; for (const [g, n] of Object.entries(goods || {})) v += (n || 0) * (GOODS[g]?.base || 1); return v; }

function tollConvoy(sim, g, c) {
  const S = sim.S, D = S.diplo, R = sim.rng;
  if (!K(sim, g.k) || c.relief) return;
  const pk = convoyHomeK(sim, c);
  const value = cargoValue(c.goods);
  // 同じ日に同じ国の関所は2回目から無料（手形）
  c.tolls = c.tolls || { paid: 0, k: {} };
  if (c.tolls.k[g.k] === sim.today) return;
  const f = feeFor(sim, g, 'cart', value, pk);
  let due = f.fixed + f.customs;
  const capLeft = value > 0 ? Math.max(0, value * TOLL.capFrac - c.tolls.paid) : due;
  due = Math.min(due, Math.max(f.fixed * (value > 0 ? 0 : 1), capLeft));
  const mark = () => { if (!f.local && g.kind === 'border') { c.gateK = c.gateK || {}; c.gateK[g.k] = 1; } };
  if (due <= 0.01) { c.tolls.k[g.k] = sim.today; mark(); return; }
  const acct = convoyAcct(sim, c);
  if (!acct) return;
  const own = S.people[c.owner];
  const P = kingPolicyOf(sim, g.k);
  P.stat.pass++;
  // 高すぎる：抜け道（国の隊商は抜け道を使わない）
  const frac = value > 0 ? due / value : 0;
  if (!c.diplo && frac > TOLL.evadeFrom && R.chance(Math.min(0.9, (frac - TOLL.evadeFrom) * TOLL.evadeSlope))) {
    g.evaded++; D.stats.evaded++; P.stat.evade++;
    c.tolls.k[g.k] = sim.today;
    if (R.chance(TOLL.evadeCaught)) {
      const fine = take(acct, due * TOLL.fineMul + TOLL.fineAdd);
      toTreasury(K(sim, g.k), fine); D.stats.fines += fine;
      if (own) sim.remember(own, `${g.name}を避けて抜け道を通ろうとして見つかり、${r0(fine)}銅貨の罰金を取られた`, { emo: -0.7, imp: 0.6, k: 'tax' });
      note(sim, `${g.name}の番兵が、抜け道を通ろうとした荷車を見つけて罰金${r0(fine)}銅貨を取った`, [g.k], { pos: g, ids: own ? [own.id] : [] });
    } else if (own) sim.remember(own, `${g.name}の通行料が高すぎるので、抜け道を通った`, { emo: 0.1, imp: 0.35, k: 'tax' });
    return;
  }
  // わいろ：まじめさの低い商人は、番兵に料金の半分を握らせる
  if (!c.diplo && own && (own.pers?.C ?? 0.5) < 0.35 && R.chance(TOLL.bribeChance)) {
    const guard = guardOf(sim, g);
    if (guard) {
      const b = take(acct, due * TOLL.bribeFrac);
      guard.purse = (guard.purse || 0) + b;
      g.bribes++; D.stats.bribes++; D.stats.bribeAmt += b;
      c.tolls.k[g.k] = sim.today; mark();
      sim.remember(own, `${g.name}の番兵に${r0(b)}銅貨を握らせて通してもらった`, { emo: 0.2, imp: 0.4, k: 'tax' });
      if (R.chance(TOLL.bribeCaught)) { sim.remember(guard, `${g.name}でわいろを受け取ったのが上役にばれて、きつく叱られた`, { emo: -0.7, imp: 0.6, k: 'duty' }); guard.needs && (guard.needs.esteem = Math.max(0, guard.needs.esteem - 20)); }
      else sim.remember(guard, `${g.name}で商人から袖の下を受け取った`, { emo: 0.2, imp: 0.3, k: 'duty' });
      return;
    }
  }
  const paid = take(acct, due);
  collect(sim, g, paid);
  c.tolls.paid += paid; c.tolls.k[g.k] = sim.today;
  if (f.customs > 0) D.stats.customs += Math.min(paid, f.customs);
  mark();
  D.stats.fixed += Math.max(0, paid - f.customs);
  if (c.diplo) { const dl = D.deals.find((d) => d.id === c.diplo); if (dl) dl.toll = (dl.toll || 0) + paid; }
  g.last = { d: sim.today, amt: paid, who: own ? sim.fullName(own) : '国の隊商' };
  if (own) sim.remember(own, `${g.name}で通行料${Math.round(paid * 10) / 10}銅貨を払った${frac > 0.08 ? '。高すぎる' : ''}`, { emo: frac > 0.08 ? -0.4 : -0.1, imp: 0.25, k: 'tax' });
  if (R.chance(0.5) || paid >= 8) note(sim, `${g.name}で、${own ? `${sim.fullName(own)}の` : '国の'}荷車から通行料${Math.round(paid * 10) / 10}銅貨を取った${f.customs > 0 ? `（関税${Math.round(f.customs * 10) / 10}を含む）` : ''}`, [g.k], { pos: g, ids: own ? [own.id] : [] });
}
function exemptWalker(sim, p) {
  if (sim.ageOf(p) < 14) return '子ども';
  if (EXEMPT_JOBS.has(p.job) || ['king', 'royal'].includes(p.rank)) return '聖職者・王家・使者';
  if (DUTY.has(p.mission?.type) || DUTY.has(p.action?.type)) return '公務';
  if (p.quest != null) return '依頼中の冒険者';
  if (p.expProj != null || p.expedition != null) return '開拓民';
  return null;
}
function tollWalker(sim, g, p) {
  const S = sim.S, D = S.diplo;
  if (!K(sim, g.k)) return;
  const kind = p.pack ? 'pack' : 'walk';
  const pk = homeK(sim, p);
  if (kind === 'walk' && (TOLL[g.kind]?.walk || 0) <= 0) return;   // 関所は、荷のない旅人は無料
  if (exemptWalker(sim, p)) return;
  // 同じ日に同じ国の関所は2回目から無料
  p._toll = p._toll || {};
  if (p._toll[g.k] === sim.today) return;
  const value = p.pack ? (p.pack.n || 0) * (GOODS[p.pack.g]?.base || 1) : 0;
  const f = feeFor(sim, g, kind, value, pk);
  let due = f.fixed + f.customs;
  if (value > 0) due = Math.min(due, Math.max(f.fixed, value * TOLL.capFrac));
  const acct = personAcct(sim, p);
  if (acct.money < 3) return;                                          // 文なしからは取らない
  p._toll[g.k] = sim.today;
  const paid = take(acct, due);
  if (paid <= 0) return;
  collect(sim, g, paid);
  if (f.customs > 0) D.stats.customs += Math.min(paid, f.customs);
  D.stats.fixed += Math.max(0, paid - f.customs);
  g.passes++;
  g.last = { d: sim.today, amt: paid, who: sim.fullName(p) };
  if (sim.rng.chance(0.4)) sim.remember(p, `${g.name}で${g.kind === 'bridge' ? '橋銭' : '通行料'}${Math.round(paid * 10) / 10}銅貨を払った`, { emo: -0.05, imp: 0.2, k: 'tax' });
}

// ---------- 国の隊商（国家間の取引） ----------
function makeCaravan(sim, dl, path, driver) {
  const S = sim.S;
  S.convoys = S.convoys || []; S.convoySeq = S.convoySeq || 0;
  S.logi = S.logi || { departed: 0, arrived: 0, robbed: 0, repelled: 0, monster: 0, storm: 0, escorts: 0, ships: 0, lostValue: 0 };
  const pts = path.map((i) => (typeof i === 'number' ? { x: i % W, z: (i / W) | 0 } : i));
  // hh は存在しない番号にして、logistics.js の関税・売り上げが誰の家計にも入らないようにする（到着は diplomacyStep が先に受け持つ）
  const c = { id: ++S.convoySeq, kind: 'cart', goods: { [dl.good]: dl.qty }, cost: 0, from: dl.from, to: dl.to, home: dl.from, path: pts, i: 0, pos: { x: pts[0].x, z: pts[0].z }, dir: { x: 1, z: 0 },
    owner: driver ? driver.id : null, hh: -1, guards: [], crew: [], eta: S.t + Math.round(pts.length / 0.7), state: 'moving', next: S.t + 10, met: {}, leg: 1, roundTrip: false, liner: false, quest: null, t0: S.t, attackers: [], risk: 0, diplo: dl.id };
  S.convoys.push(c);
  if (driver) {
    if (driver.inside != null) { const b = sim.building(driver.inside); if (b) driver.pos = { x: b.door.x, z: b.door.z }; driver.inside = null; }
    driver.talk = null; driver.path = [];
    driver.action = { type: 'trade', convoy: c.id, dur: 0, until: S.t + 1e7, bld: null, phase: 'do', startNeeds: { ...driver.needs }, startMood: driver.mood };
    driver._spot = 1e9;
  }
  return c;
}
function caravanArrivals(sim) {
  const S = sim.S, D = S.diplo;
  const live = new Set();
  for (let j = (S.convoys || []).length - 1; j >= 0; j--) {
    const c = S.convoys[j];
    if (!c.diplo) continue;
    live.add(c.diplo);
    if (c.state !== 'moving' || c.i < c.path.length - 1) continue;
    S.convoys.splice(j, 1);
    live.delete(c.diplo);
    const own = S.people[c.owner];
    if (own && own.action?.convoy === c.id) { own.action.until = S.t; own.action.convoy = null; if (own._spot > 1e6) own._spot = 0; }
    deliver(sim, D.deals.find((d) => d.id === c.diplo), c);
  }
  // 隊商が道中で消えた（襲われて荷を失った・道に迷って引き返した）
  if (sim.S.t < (D._scan || 0)) return;
  for (const dl of D.deals) if (dl.state === 'shipping' && !live.has(dl.id)) { dl.state = 'lost'; D.stats.lost++; note(sim, `${partyName(sim, dl.seller)}から${partyName(sim, dl.buyer)}へ向かった国の隊商（${gname(dl.good)}${dl.qty}）は、道中で荷を失った`, [dl.seller, dl.buyer].filter((x) => typeof x === 'number'), { pos: sim.town(dl.to) }); }
}
function acctOfParty(sim, party) {
  if (typeof party === 'number') { const k = K(sim, party); return k ? { get money() { return k.treasury; }, set money(v) { const d = v - k.treasury; k.treasury = v; if (d > 0 && k.fisc) k.fisc.dayIn += d; } } : null; }
  // 村の取り引きは、村の蓄え（町の蓄え）で払い、受け取る
  const sid = +String(party).slice(1); const m = sim.S.towns[sid];
  return m ? { get money() { return m.fund || 0; }, set money(v) { m.fund = v; } } : null;
}
function deliver(sim, dl, c) {
  const S = sim.S, D = S.diplo;
  if (!dl) return;
  const got = c.goods[dl.good] || 0;
  const m = S.towns[dl.to];
  if (m && got > 0) ownStock(sim, dl.to, dl.good, typeof dl.buyer === 'number' ? 'k' + dl.buyer : 't' + dl.to, got);   // 届いた品は買い手（国・村）の品として市場に並び、売れたときに代金が買い手へ
  // 残りの代金は、着いた分だけ（買い手 → 売り手）
  const buyer = acctOfParty(sim, dl.buyer), seller = acctOfParty(sim, dl.seller);
  const rest = Math.max(0, dl.pay * (got / dl.qty) - dl.paid);
  const x = buyer ? take(buyer, rest) : 0;
  if (seller) seller.money += x;
  dl.paid += x;
  dl.resold = 0;
  dl.state = got < dl.qty ? 'partial' : 'done'; dl.arrived = sim.today; dl.got = got;
  D.stats.deals++; D.stats.dealValue += dl.paid;
  const ks = [dl.seller, dl.buyer].filter((x2) => typeof x2 === 'number');
  note(sim, `${partyName(sim, dl.seller)}の${gname(dl.good)}${got}が、国の隊商で${sim.town(dl.to).name}に届いた（代金${r0(dl.paid)}銅貨${dl.toll ? `・通行料${r0(dl.toll)}` : ''}）`, ks, { pos: sim.town(dl.to) });
  if (ks.length === 2) { addRel(sim, ks[0], ks[1], 1.5); addRel(sim, ks[1], ks[0], 1.5); }
}
// 毎日：売り手と買い手を探す
function tradeDaily(sim) {
  const S = sim.S, D = S.diplo;
  const active = D.deals.filter((d) => d.state === 'shipping').length;
  if (active >= MAX_CARAVANS || (S.convoys || []).length >= 12) return;
  const parties = S.kingdoms.filter((k) => kingOf(sim, k.id)).map((k) => k.id);
  for (const s of S.world.settlements) if (!isKid(s.kingdom) && !s.abandoned && S.towns[s.id] && (s.tribal ? s.annexed == null && linkedToAny(sim, s.id) : true)) parties.push('v' + s.id);
  const offers = [];
  for (const seller of parties) for (const buyer of parties) {
    if (seller === buyer || (typeof seller !== 'number' && typeof buyer !== 'number')) continue;
    const sk = typeof seller === 'number' ? seller : null, bk = typeof buyer === 'number' ? buyer : null;
    if (sk != null && bk != null && (atWar(sim, sk, bk) || rel(sim, sk, bk) < -25 || rel(sim, bk, sk) < -25)) continue;
    const key = `deal:${seller}>${buyer}`;
    const pact = sk != null && bk != null ? pactOf(sim, sk, bk, 'trade') : null;
    if ((D.cool[key] || -99) > sim.today) continue;
    const o = bestOffer(sim, seller, buyer, !!pact);
    if (o) { o.key = key; o.pact = !!pact; offers.push(o); }
  }
  offers.sort((a, b) => b.gain - a.gain);
  let n = active;
  for (const o of offers) { if (n >= MAX_CARAVANS) break; if (startDeal(sim, o)) n++; }
}
function linkedToAny(sim, sid) { return sim.S.kingdoms.some((k) => towns(sim, k.id).some((s) => linked(sim, s.id, sid))); }
function sellerTowns(sim, party) { return typeof party === 'number' ? towns(sim, party) : [sim.town(+String(party).slice(1))]; }
function bestOffer(sim, seller, buyer, pact) {
  const S = sim.S;
  const sk = typeof seller === 'number' ? seller : null, bk = typeof buyer === 'number' ? buyer : null;
  const SP = sk != null ? kingPolicyOf(sim, sk) : null, BP = bk != null ? kingPolicyOf(sim, bk) : null;
  const eager = SP?.type === 'merchant';
  if (!eager && !pact && (sim.today + (sk ?? 0) + (bk ?? 0)) % 3 !== 0) return null;     // 商売上手な王は毎日、ほかは3日に1度
  const rate = exchangeRate(sim, bk, sk);   // 買い手の硬貨1枚が、売り手の硬貨何枚ぶんか
  let best = null;
  for (const st of sellerTowns(sim, seller)) {
    const ms = S.towns[st.id]; if (!ms) continue;
    for (const bt of sellerTowns(sim, buyer)) {
      const mb = S.towns[bt.id]; if (!mb) continue;
      const dist = Math.hypot(st.x - bt.x, st.z - bt.z);
      const road = linked(sim, st.id, bt.id);
      if (!road && dist > NOROAD_MAX) continue;
      for (const g of Object.keys(GOODS)) {
        if (ms.stock?.[g] == null || mb.stock?.[g] == null) continue;
        const tg = GOODS[g].target || 1;
        const spare = ms.stock[g] - tg * (eager ? 0.9 : 1.1);
        const want = tg * (eager ? 1.4 : 1.1) - mb.stock[g];
        if (spare < 3 || want < 3) continue;
        const pS = ms.price[g], pB = mb.price[g] * rate;           // どちらも売り手の硬貨で
        const need = road ? 1.2 : 1.45;                            // 街道がないと運ぶ手間と危なさが大きい
        if (pB * 0.9 < pS * need) continue;
        const qty = Math.floor(Math.min(12, spare, want));
        const gain = (pB * 0.9 - pS) * qty - (road ? 4 : 4 + dist * 0.05);
        if (gain <= 3) continue;
        if (!best || gain > best.gain) best = { seller, buyer, sk, bk, good: g, from: st.id, to: bt.id, qty, pS, pB, rate, gain, road, dist };
      }
    }
  }
  if (!best) return null;
  // 値決め：売り手の値と、買い手の値の真ん中（商売上手な王は自分の側へ寄せる）
  let share = 0.5;
  if (SP?.type === 'merchant') share += 0.1;
  if (BP?.type === 'merchant') share -= 0.1;
  const unit = best.pS + (best.pB * 0.9 - best.pS) * share;        // 売り手の硬貨で1つあたり
  best.unit = unit;
  best.pay = unit * best.qty / Math.max(0.05, best.rate);           // 買い手が払う硬貨の枚数
  return best;
}
function startDeal(sim, o) {
  const S = sim.S, D = S.diplo;
  const buyer = acctOfParty(sim, o.buyer), seller = acctOfParty(sim, o.seller);
  if (!buyer || !seller) return false;
  const reserveB = typeof o.buyer === 'number' ? 250 : 200;
  if (buyer.money - o.pay < reserveB) return false;
  const ms = S.towns[o.from];
  if (!ms || ms.stock[o.good] < o.qty) return false;
  // 道すじ（自前の経路探しでは遠すぎるときは、logistics.js の landRoute）
  let path = landRoute(sim, o.from, o.to);
  if (!path) { const tt = sim.town(o.to); const pp = search([...(sim.town(o.from).gates || [])].map((g) => g.z * W + g.x).filter((i) => i >= 0), (i) => cheb(i % W, (i / W) | 0, tt.x, tt.z) <= 2, (j) => (walkable(S.world.tiles[j]) ? (MOVE_COST[S.world.tiles[j]] || 2) : null), tt.x, tt.z, 1); path = pp; }
  if (!path || path.length < 4) { D.cool[o.key] = sim.today + 10; return false; }
  // 見込みの通行料（通り道の関所：買い手の国以外）
  const pts = path.map((q) => (typeof q === 'number' ? { x: q % W, z: (q / W) | 0 } : q));
  const bk = o.bk;
  let tolls = 0;
  for (const g of D.gates) {
    if (g.k === bk) continue;
    if (!pts.some((q) => Math.abs(q.x - g.x) <= 1.8 && Math.abs(q.z - g.z) <= 1.8)) continue;
    const f = feeFor(sim, g, 'cart', o.qty * (GOODS[o.good].base || 1), bk);
    tolls += f.fixed + f.customs;
  }
  if (o.gain - tolls * (1 / Math.max(0.05, o.rate)) <= 2) { D.cool[o.key] = sim.today + 5; return false; }   // 通行料が高すぎると交易をやめる
  // 御者：売り手の町の商人・行商人・御者、いなければ手の空いた大人（売り手が手間賃を払う）
  const st = sim.town(o.from);
  const driver = sim.living().find((q) => q.s === o.from && ['merchant', 'peddler', 'coachman'].includes(q.job) && q.jail == null && !q.fight && !q.mission && q.action?.convoy == null && sim.isAdult(q) && q.action?.type !== 'sleep')
    || sim.living().find((q) => q.s === o.from && (!q.job || ['beggar', 'stablehand', 'woodcutter'].includes(q.job)) && q.jail == null && !q.fight && !q.mission && q.action?.convoy == null && sim.isAdult(q) && sim.ageOf(q) < 60);
  // 仕入れ：売り手の国庫 → 売り手の町の市場の金庫（村なら市場の品をそのまま出す）
  const buyCost = o.pS * o.qty;
  // 売り手（国・村）は、出す品を市場の持ち主から買い集める（代金は商人・作り手へ）
  { const payer = typeof o.seller === 'number' ? 'k' + o.seller : 't' + o.from;
    if (typeof o.seller === 'number' && K(sim, o.seller).treasury < buyCost + 150) return false;
    if (marketBuy(sim, o.from, o.good, o.qty, payer, { price: o.pS }) < o.qty - 1e-6) return false; }
  const dl = { id: D.seq++, d: sim.today, seller: o.seller, buyer: o.buyer, good: o.good, qty: o.qty, unit: o.unit, pay: o.pay, paid: 0, from: o.from, to: o.to, state: 'shipping', road: o.road, pact: o.pact, toll: 0, driver: driver?.id ?? null };
  D.deals.push(dl);
  if (D.deals.length > 120) D.deals.splice(0, D.deals.length - 120);
  // 前払い：代金の半分（買い手 → 売り手）
  const half = take(buyer, o.pay * 0.5);
  seller.money += half; dl.paid = half;
  // 御者の手間賃（売り手 → 御者の家計）
  if (driver) {
    const wage = 4 + pts.length * 0.03;
    const w2 = take(seller, wage);
    const hh = sim.hh(driver); if (hh) hh.money += w2; else driver.purse = (driver.purse || 0) + w2;
    sim.remember(driver, `国の荷（${gname(o.good)}${o.qty}）を${sim.town(o.to).name}まで運ぶ御者に雇われた`, { emo: 0.3, imp: 0.4, k: 'trade' });
  }
  makeCaravan(sim, dl, path, driver);
  D.cool[o.key] = sim.today + (o.pact ? 2 : 5);
  const ks = [o.seller, o.buyer].filter((x) => typeof x === 'number');
  note(sim, `${partyName(sim, o.seller)}が${partyName(sim, o.buyer)}に${gname(o.good)}${o.qty}を売った（${r0(o.pay)}銅貨・${o.road ? '街道' : '野越え'}の隊商で${st.name}から${sim.town(o.to).name}へ）`, ks, { pos: st });
  return true;
}

// ---------- 王の外交判断（3日ごと・国の組ごと） ----------
function diplomacyTurns(sim) {
  const S = sim.S, D = S.diplo, R = sim.rng, KS = S.kingdoms;
  for (let a = 0; a < KS.length; a++) for (let b = a + 1; b < KS.length; b++) {
    if ((sim.today + a + b) % 3 !== 0) continue;
    const A = KS[a], B = KS[b];
    if (!kingOf(sim, a) || !kingOf(sim, b)) continue;
    if (atWar(sim, a, b)) continue;
    const PA = kingPolicyOf(sim, a), PB = kingPolicyOf(sim, b);
    const rab = rel(sim, a, b), rba = rel(sim, b, a);
    // 交易協定
    const ca = sim.town(A.capital), cb = sim.town(B.capital);
    // 協定を結ぶ意味があるのは、道でつながっているか、街道を造っている相手。品の過不足が合うか、すでに取引があるか、値の開きが大きいとき
    const reach = kingdomsLinked(sim, a, b) || D.roads.some((r) => ['build', 'purge'].includes(r.stage) && ((r.k === a && kOfSid(sim, r.to) === b) || (r.k === b && kOfSid(sim, r.to) === a)));
    const dealt = D.deals.some((d) => sim.today - d.d < 20 && ((d.seller === a && d.buyer === b) || (d.seller === b && d.buyer === a)));
    const comp = complementary(sim, a, b) + (dealt ? 1 : 0) + (ca && cb && tradeGain(sim, a, ca.id, cb.id) > 40 ? 1 : 0);
    if (reach && !pactOf(sim, a, b, 'trade') && Math.min(rab, rba) > -10 && comp > 0) {
      const want = (P) => ({ merchant: 0.8, peace: 0.55, timid: 0.3, ambitious: 0.35 }[P.type]);
      if (R.chance(want(PA) * want(PB) + 0.1)) {
        D.pacts.push({ id: D.seq++, type: 'trade', a, b, since: sim.today, until: sim.today + 60 });
        D.stats.pacts++; D.stats.trade++;
        addRel(sim, a, b, 5); addRel(sim, b, a, 5);
        note(sim, `${A.name}と${B.name}が交易協定を結んだ（60日。関所の関税を${PA.type === 'merchant' || PB.type === 'merchant' ? 'なくす' : '半分にする'}約束）`, [a, b], { news: 2, pos: sim.town(A.capital), chron: true });
      }
    }
    // 同盟：仲がよく、共通の脅威（魔王・第三の国）がある
    if (!pactOf(sim, a, b, 'alliance') && rab > 40 && rba > 40) {
      const foe = KS.find((c) => c !== A && c !== B && rel(sim, a, c.id) < -25 && rel(sim, b, c.id) < -25);
      const demon = !!S.demon?.active;
      if ((foe || demon) && R.chance(PA.type === 'timid' || PB.type === 'timid' ? 0.45 : 0.3)) {
        const until = sim.today + 120;
        D.pacts.push({ id: D.seq++, type: 'alliance', a, b, since: sim.today, until, against: foe ? foe.id : 'demon' });
        if (S.expansion?.pacts && !S.expansion.pacts.some((p) => p.type === 'alliance' && ((p.a === a && p.b === b) || (p.a === b && p.b === a)))) S.expansion.pacts.push({ type: 'alliance', a, b, since: sim.today, until, against: foe ? foe.id : null });
        if (S.expansion?.stats) S.expansion.stats.alliances = (S.expansion.stats.alliances || 0) + 1;
        D.stats.pacts++; D.stats.alliance++;
        if (foe) { addRel(sim, foe.id, a, -6); addRel(sim, foe.id, b, -6); }
        note(sim, `${A.name}と${B.name}が同盟を結んだ（${foe ? `${foe.name}に備えて` : '魔王に備えて'}）`, [a, b], { news: 3, pos: sim.town(A.capital), chron: true });
      }
    }
    for (const [x, y] of [[a, b], [b, a]]) {
      const X = K(sim, x), Y = K(sim, y), PX = kingPolicyOf(sim, x), PY = kingPolicyOf(sim, y);
      const rxy = rel(sim, x, y);
      // 援助：飢えている相手へ（平和好き・商売上手の王、または仲のよい国）
      if (famine(sim, y) && !famine(sim, x) && rxy > 15 && X.treasury > 700 && (PX.type === 'peace' || PX.type === 'merchant' || rxy > 40) && (D.cool[`aid:${x}>${y}`] || -99) <= sim.today) {
        const amt = Math.min(180, X.treasury * 0.12);
        X.treasury -= amt; toTreasury(Y, amt);
        D.cool[`aid:${x}>${y}`] = sim.today + 15;
        D.pacts.push({ id: D.seq++, type: 'aid', a: x, b: y, since: sim.today, until: sim.today + 15, amt: r0(amt) });
        D.stats.aid++; D.stats.aidAmt += amt;
        addRel(sim, y, x, 10); addRel(sim, x, y, 3);
        note(sim, `飢えに苦しむ${Y.name}へ、${X.name}が${r0(amt)}銅貨の援助を送った`, [x, y], { news: 2, pos: sim.town(Y.capital), chron: true });
        continue;
      }
      // 和解の使節：争いを好まない王は、仲がこじれたら贈り物を持たせて使者を送る
      if (rxy < -30 && ['peace', 'merchant', 'timid'].includes(PX.type) && X.treasury > 400 && (D.cool[`envoy:${x}>${y}`] || -99) <= sim.today) {
        const gift = Math.min(110, X.treasury * 0.06);
        X.treasury -= gift; toTreasury(Y, gift);
        D.cool[`envoy:${x}>${y}`] = sim.today + 10;
        D.stats.envoys++;
        addRel(sim, y, x, 8); addRel(sim, x, y, 4);
        note(sim, `${X.name}が${Y.name}へ和解の使者を送り、${r0(gift)}銅貨の贈り物を届けた`, [x, y], { news: 1, pos: sim.town(Y.capital) });
        setNote(sim, x, `${Y.name}との仲を取り持とうとしている`);
        continue;
      }
      // 国境争い（資源の要求）：野心家か、飢えた国が、足りない資源を持つ相手に求める
      if ((PX.type === 'ambitious' || famine(sim, x)) && rxy < 10 && (D.cool[`dispute:${x}>${y}`] || -99) <= sim.today) {
        const lack = deficitOf(sim, x).filter((g) => surplusOf(sim, y).includes(g));
        if (!lack.length || !R.chance(PX.type === 'ambitious' ? 0.5 : 0.3)) continue;
        const g = lack[0];
        D.cool[`dispute:${x}>${y}`] = sim.today + 12;
        D.stats.disputes++;
        const mx = armySize(sim, x), my = armySize(sim, y);
        if (PY.type === 'timid' || my < mx * 0.7) {
          const amt = Math.min(150, Y.treasury * 0.1);
          if (amt >= 20) {
            Y.treasury -= amt; toTreasury(X, amt);
            D.stats.tribute++;
            D.pacts.push({ id: D.seq++, type: 'tribute', a: y, b: x, since: sim.today, until: sim.today + 20, amt: r0(amt) });
            addRel(sim, y, x, -6);
            note(sim, `${X.name}が国境の${RES_GROUP[groupOf(g)]}をめぐって${Y.name}に迫り、${Y.name}は争いを避けて${r0(amt)}銅貨の貢ぎ物を差し出した`, [x, y], { news: 2, pos: sim.town(Y.capital), chron: true });
            continue;
          }
        }
        addRel(sim, x, y, -8); addRel(sim, y, x, -8);
        const key = `${Math.min(x, y)}-${Math.max(x, y)}`;
        if (S.expansion?.tension) S.expansion.tension[key] = (S.expansion.tension[key] || 0) + 1.2;
        note(sim, `${X.name}が${gname(g)}の産地をめぐって国境の線引きを求めたが、${Y.name}ははねつけた`, [x, y], { news: 2, pos: sim.town(Y.capital) });
        // 宣戦：互いに損が大きいので、めったにない。野心家の王が強いとき、または飢えで追い詰められたとき
        maybeWar(sim, x, y);
      }
    }
  }
}
function maybeWar(sim, x, y) {
  const S = sim.S, D = S.diplo, R = sim.rng;
  const X = K(sim, x), Y = K(sim, y), PX = kingPolicyOf(sim, x), king = kingOf(sim, x);
  if (X.war || Y.war || !king || pactOf(sim, x, y, 'truce') || pactOf(sim, x, y, 'alliance')) return;
  if (S.demon?.active && (king.values?.ambition ?? 0) < 0.85) return;
  const mx = armySize(sim, x), my = armySize(sim, y);
  let p = 0, why = '';
  if (PX.type === 'ambitious' && (king.values?.ambition ?? 0) > 0.65 && rel(sim, x, y) < -35 && mx >= my * 1.25 && X.treasury > 300) { p = 0.12; why = '資源を力ずくで得ようと'; }
  if (famine(sim, x) && X.treasury < 250 && rel(sim, x, y) < -10 && mx >= my * 0.9 && surplusOf(sim, y).some((g) => FOOD.has(g))) { p = Math.max(p, 0.08); why = '飢えに追い詰められて'; }
  if (!p || !R.chance(p)) { if (p) setNote(sim, x, `${Y.name}との戦も考えたが、損が大きいと思いとどまった`); return; }
  if (typeof POL.declareWar !== 'function') { setNote(sim, x, `${Y.name}への宣戦を口にしたが、重臣たちに止められた`); D.stats.warBlocked = (D.stats.warBlocked || 0) + 1; return; }
  D.stats.wars++;
  note(sim, `${kname(sim, x)}の${title(king)}${king.given}は、${why}${Y.name}との戦を決めた`, [x, y], { log: true });
  POL.declareWar(sim, X, Y);
}
function watchWars(sim) {
  const S = sim.S, D = S.diplo;
  for (const k of S.kingdoms) {
    if (!k.war) continue;
    const key = `${Math.min(k.id, k.war.with)}-${Math.max(k.id, k.war.with)}@${k.war.since}`;
    if (!D.warSeen[key]) { D.warSeen[key] = sim.today; D.stats.warsAll++; }
  }
  // 戦になった国どうしの協定は破られる
  for (const p of D.pacts) if ((p.type === 'trade' || p.type === 'jointroad' || p.type === 'alliance') && p.until > sim.today && atWar(sim, p.a, p.b)) { p.until = sim.today; p.broken = true; note(sim, `${kname(sim, p.a)}と${kname(sim, p.b)}の${PACT_NAME[p.type]}は、戦で破れた`, [p.a, p.b], { log: true }); }
}
// 関所の方針の見直し（10日ごと）：商売上手な王は抜け道が多ければ下げ、少なければ少し上げる
function reviewTolls(sim) {
  const S = sim.S, D = S.diplo;
  for (const k of S.kingdoms) {
    const P = kingPolicyOf(sim, k.id);
    if (sim.today - P.last < 10 || P.free) continue;
    P.last = sim.today;
    const n = P.stat.pass || 0, ev = P.stat.evade || 0;
    const C = TOLL.customs;
    if (P.type === 'merchant' && n >= 3) { if (ev / n > 0.2) P.customs = Math.max(C.min, P.customs - 0.005); else if (ev / n < 0.05 && k.treasury < 700) P.customs = Math.min(0.05, P.customs + 0.005); }
    if (P.type === 'ambitious' && k.treasury < 300) P.customs = Math.min(C.max, P.customs + 0.005);
    if (P.type === 'timid') P.customs = k.treasury < 300 ? 0.04 : C.standard;
    P.stat = { pass: 0, evade: 0 };
  }
}
// 関所の番兵の手当（関所の箱 → 番兵の家計）と、関所の持ち主の見直し
function gatesDaily(sim) {
  const S = sim.S, D = S.diplo, w = S.world;
  for (const g of D.gates) {
    const o = w.kingdomOf[g.z * W + g.x];
    if (isKid(o) && o !== g.k && K(sim, o)) { note(sim, `「${g.name}」は、土地とともに${kname(sim, o)}のものになった`, [o, g.k], { log: true }); g.k = o; g.guards = []; }
    if (!g.guards.length || sim.today % 7 === 0) {
      const s = nearestTown(sim, g.k, g.x, g.z);
      g.guards = s ? sim.living().filter((q) => q.s === s.id && GUARDS.includes(q.job) && q.jail == null && sim.isAdult(q)).slice(0, 2).map((q) => q.id) : [];
    }
    const guards = g.guards.map((id) => S.people[id]).filter(alive);
    for (const p of guards) { const x = Math.min(TOLL.guardDay, g.box); if (x <= 0) break; g.box -= x; const hh = sim.hh(p); if (hh) hh.money += x; else p.purse = (p.purse || 0) + x; }
    if (g.box > TOLL.boxCap) { toTreasury(K(sim, g.k), g.box - TOLL.boxCap); g.box = TOLL.boxCap; }
    if (g.today.n > 0 && sim.rng.chance(0.6)) note(sim, `${g.name}：今日は${g.today.n}件から通行料${Math.round(g.today.amt * 10) / 10}銅貨を取った`, [g.k], { pos: g });
    for (const id of g.roads) { const r = D.roads.find((q) => q.id === id); if (r && !r.ancient) r.wear = (r.wear || 0) + g.today.n * 0.3 + 0.1; }
    g.today = { n: 0, amt: 0 };
  }
  for (const k of S.kingdoms) if ((D.fund[k.id] || 0) > TOLL.fundCap) { toTreasury(k, D.fund[k.id] - TOLL.fundCap); D.fund[k.id] = TOLL.fundCap; }
  // 古い印の掃除
  if (sim.today % 3 === 0) for (const [key, t] of Object.entries(D.seen)) if (t < S.t - 1440) delete D.seen[key];
}

// ---------- 毎日・毎時 ----------
export function diplomacyDaily(sim) {
  const S = sim.S;
  if (!S.kingdoms) return;
  const D = ensureDiplomacy(sim);
  for (const k of S.kingdoms) { const P = kingPolicyOf(sim, k.id); if (P.note && sim.today - P.note.d > 12) P.note = null; }
  roadNet(sim);
  balances(sim);
  watchWars(sim);
  planRoads(sim);
  for (const road of D.roads) if (['purge', 'build'].includes(road.stage)) stepRoad(sim, road);
  repairRoads(sim);
  gatesDaily(sim);
  tradeDaily(sim);
  diplomacyTurns(sim);
  reviewTolls(sim);
  D.pacts = D.pacts.filter((p) => p.until > sim.today - 30);
  for (const [key, d] of Object.entries(D.cool)) if (d < sim.today - 5) delete D.cool[key];
  if (sim.today % 5 === 0) { D.hist.push({ d: sim.today, tolls: r0(D.stats.tolls), deals: D.stats.deals, roads: D.stats.roadsOpened }); if (D.hist.length > 120) D.hist.shift(); }
}
export function diplomacyHourly(sim) {
  const S = sim.S, D = S.diplo; if (!D) return;
  const h = Math.floor(sim.hour());
  if (h >= 7 && h < 17) for (const road of D.roads) if (road.stage === 'build' || road.stage === 'purge') roadHour(sim, road);   // 街道は1時間ごとに少しずつ延びる
  // 朝7時：普請場の近くに住む人夫を現場へ（遠い町の人夫は泊まり込みとみなす）
  if (h === 7) for (const road of D.roads) {
    if (road.stage !== 'build' && road.stage !== 'purge') continue;
    for (const [key, dir] of [['crew', 1], ['pcrew', -1]]) {
      if (road.lo > road.hi) break;
      const i = road.todo[dir > 0 ? road.lo : road.hi], x = i % W, z = (i / W) | 0;
      for (const id of road[key] || []) {
        const p = S.people[id];
        if (!alive(p) || p.mission || p.jail != null || p.fight || p.action?.convoy != null) continue;
        const s = sim.town(p.s);
        if (!s || Math.hypot(s.x - x, s.z - z) > CREW_REACH) continue;
        const spot = sim.randomNear(x, z, 2) || { x, z };
        p.mission = { type: 'roadbuild', x: spot.x, z: spot.z, until: S.t + 9 * 60, dur: 120 };
        if (p.action && p.action.type !== 'sleep') p.action = null;
      }
    }
  }
}

// ---------- 画面 ----------
function pactText(sim, p, k) {
  const o = p.a === k ? p.b : p.a;
  const left = p.until - sim.today;
  if (p.type === 'aid') return `${p.a === k ? '援助を送った' : '援助を受けた'}：${kshort(sim, o)}（${p.amt}銅貨）`;
  if (p.type === 'tribute') return `${p.a === k ? '貢ぎ物を出した' : '貢ぎ物を受けた'}：${kshort(sim, o)}（${p.amt}銅貨）`;
  return `${PACT_NAME[p.type]}：${kshort(sim, o)}（あと${left}日）`;
}
export function diplomacyNationHTML(sim, k, esc = (s) => s) {
  const S = sim.S, D = S.diplo;
  if (!D) return '';
  const kid = typeof k === 'number' ? k : k.id;
  const P = kingPolicyOf(sim, kid);
  const roads = D.roads.filter((r) => r.k === kid || r.partner === kid);
  const roadTxt = roads.filter((r) => r.stage !== 'failed' || sim.today - (r.failDay || 0) < 30).map((r) => {
    const done = r.todo.length ? Math.round((r.todo.length - Math.max(0, r.hi - r.lo + 1)) / r.todo.length * 100) : 100;
    const st = r.ancient ? '古くからの道' : r.stage === 'open' ? `開通（${sim.today - r.openDay}日前）` : r.stage === 'build' ? `普請中 ${done}%・人夫${(r.crew || []).length + (r.pcrew || []).length}人` : r.stage === 'purge' ? '魔物の討伐待ち' : '断念';
    const i = r.path[r.path.length >> 1];
    return `<span class="link" data-goto="${i % W},${(i / W) | 0}">${esc(r.name)}</span>（${st}${r.partner != null && !r.ancient ? '・共同' : ''}）`;
  }).join('<br>') || 'なし';
  const gates = D.gates.filter((g) => g.k === kid);
  const gateTxt = gates.map((g) => `<span class="link" data-goto="${g.x},${g.z}">${esc(g.name)}</span>（通算${r0(g.collected)}銅貨・抜け道${g.evaded}）`).join('<br>') || 'なし';
  const pacts = D.pacts.filter((p) => (p.a === kid || p.b === kid) && p.until > sim.today && !p.broken).map((p) => esc(pactText(sim, p, kid))).join('<br>') || 'なし';
  const deals = D.deals.filter((d) => d.seller === kid || d.buyer === kid).slice(-4).reverse().map((d) => {
    const sell = d.seller === kid;
    const st = { shipping: '運送中', done: '届いた', partial: '一部届いた', lost: '道中で失った' }[d.state];
    return `${sell ? '売' : '買'}：${esc(gname(d.good))}${d.qty}（${sell ? '→' : '←'}${esc(partyName(sim, sell ? d.buyer : d.seller).replace('王国', ''))}・${r0(d.pay)}銅貨・${st}）`;
  }).join('<br>') || 'まだない';
  const b = D.bal[kid] || {};
  const sur = Object.keys(b).filter((g) => b[g].r > 1.4).sort((x, y) => b[y].r - b[x].r).slice(0, 4).map(gname).join('・') || 'なし';
  const def = Object.keys(b).filter((g) => b[g].r < 0.6).sort((x, y) => b[x].r - b[y].r).slice(0, 4).map(gname).join('・') || 'なし';
  return `<dt>王の方針</dt><dd>${POLICY_NAME[P.type]}<br><span class="sub">${esc(POLICY_DESC[P.type])}・関税${P.free ? 'なし' : `${Math.round(P.customs * 1000) / 10}%`}${P.note ? `<br>${esc(P.note.txt)}（${sim.today - P.note.d}日前）` : ''}</span></dd>
    <dt>余り／不足</dt><dd>余り：${esc(sur)}<br>不足：${esc(def)}</dd>
    <dt>街道</dt><dd>${roadTxt}</dd>
    <dt>関所</dt><dd>${gateTxt}<br><span class="sub">街道の蓄え ${r0(D.fund[kid] || 0)}銅貨</span></dd>
    <dt>協定</dt><dd>${pacts}</dd>
    <dt>取引</dt><dd>${deals}</dd>`;
}
// 外交の出来事の記録（新しい順）
export function diplomacyRecords(sim, k = null, n = 12) {
  const D = sim.S.diplo; if (!D) return [];
  return D.log.filter((e) => k == null || e.k.includes(k)).slice(-n).reverse().map((e) => ({ day: e.d, text: e.txt }));
}
export function diplomacyWorldHTML(sim, esc = (s) => s) {
  const D = sim.S.diplo; if (!D) return '';
  const st = D.stats;
  const rec = diplomacyRecords(sim, null, 10).map((e) => `<li>${sim.today - e.day === 0 ? '今日' : `${sim.today - e.day}日前`}：${esc(e.text)}</li>`).join('');
  return `<p>街道の開通 ${st.roadsOpened}本（普請中 ${D.roads.filter((r) => r.stage === 'build' || r.stage === 'purge').length}本）・関所 ${D.gates.length}か所・通行料の通算 ${r0(st.tolls)}銅貨（抜け道${st.evaded}・わいろ${st.bribes}）<br>
    国どうしの取引 ${st.deals}件（${r0(st.dealValue)}銅貨）・交易協定 ${st.trade}・共同の街道 ${st.joint}・同盟 ${st.alliance}・援助 ${st.aid}・国境争い ${st.disputes}・戦争 ${st.warsAll}</p><ul>${rec}</ul>`;
}
// 関所の印（描画・ミニマップ用）
export function gateViews(sim) {
  const D = sim.S.diplo; if (!D) return [];
  return D.gates.map((g) => ({ id: 'g' + g.id, kind: g.kind, x: g.x, z: g.z, k: g.k, name: g.name, color: K(sim, g.k)?.color || KINGDOMS[g.k]?.color }));
}
export function drawGates(sim, g, sc = 1) {
  for (const v of gateViews(sim)) { g.fillStyle = v.color || '#fff'; g.fillRect(v.x * sc - 2, v.z * sc - 2, 4, 4); g.strokeStyle = '#000'; g.strokeRect(v.x * sc - 2, v.z * sc - 2, 4, 4); }
}
// 関所を通った荷車は、行き先の町の関税（taxes.js の tariffConvoy）を取らない（二重取りを防ぐ）
// （行き先の国の国境の関所を通って、関税を払った・条約で免除された荷だけ）
export function paidAtGate(sim, c) { const k = c ? kOfSid(sim, c.to) : null; return !!(c && k != null && c.gateK?.[k]); }
// お金の置き場所（監査用）：街道の蓄えと、関所の番兵の箱
export function diplomacyMoneyPools(sim) {
  const D = sim.S.diplo; if (!D) return { fund: 0, box: 0, total: 0 };
  const fund = Object.values(D.fund).reduce((s, x) => s + (x || 0), 0), box = D.gates.reduce((s, g) => s + (g.box || 0), 0);
  return { fund, box, total: fund + box };
}
// 住人のつぶやき
export function diplomacyThought(sim, p) {
  const D = sim.S.diplo; if (!D || !sim.isAdult(p)) return null;
  if (p.mission?.type === 'roadbuild') { const r = D.roads.find((q) => (q.crew || []).includes(p.id) || (q.pcrew || []).includes(p.id)); if (r) return `${r.name}ができれば、この辺りも人が通るようになる`; }
  const k = homeK(sim, p);
  if (['merchant', 'peddler', 'coachman'].includes(p.job)) {
    const hi = D.gates.filter((g) => g.k !== k && kingPolicyOf(sim, g.k).customs >= 0.05)[0];
    if (hi) return `${hi.name}の関税は高すぎる。抜け道を探すか……`;
    if (k != null && D.pacts.some((q) => q.type === 'trade' && (q.a === k || q.b === k) && q.until > sim.today)) return '協定のおかげで、よその国の関所が安くなった';
  }
  if (k != null && D.roads.some((r) => r.stage === 'open' && !r.ancient && (r.k === k || r.partner === k) && sim.today - r.openDay < 10)) return '新しい街道が開いた。よその国の品がもっと入ってくるだろう';
  return null;
}
