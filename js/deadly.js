// 竜など手に負えない相手の縄張り（品質管理部）
//
// 決まり：竜・魔王軍の将・名のある凶悪な魔物など「手に負えない相手」の縄張りには、
//         その相手の討伐依頼を受けた十分に強いパーティ（と、行軍・討伐の軍勢）以外は近づかない。
//   ・「手に負えない相手」の見分け方は、助けに駆けつける仕組み（rescue.js の tooStrong）と同じ。
//     強さ（攻め × √体力）が 420 を超える・親玉・竜・名のある敵意の魔物。
//   ・「十分に強い」は、rescue.js の駆けつけと同じく、仲間の力の合計が相手の 1.6 倍以上。
//   ・縄張り：巣（住処）から (見回りの範囲＋6) マス、今いる場所から 8 マス。
//
// 使い道：
//   deadlyAt(sim, x, z)          … その場所が手に負えない相手の縄張りなら、その相手を返す
//   mayEnter(sim, p, c)          … その人がその相手の縄張りに入ってよいか（討伐依頼を受けた強いパーティ・軍勢だけ）
//   unsafeFor(sim, p, x, z)      … その人にとって、その場所が縄張りで入ってはいけないか
//   crewUnsafe(sim, crew, x, z)  … パーティ（仲間の一覧）にとって入ってはいけないか
//   zoneAvoid(sim, base, p)      … 道探しの危険地図に縄張りを足したもの（入ってよい人には元の地図のまま）
//   zoneClusters(sim, p, CL, CW) … 遠くの道探し（pathfar.js）の粗い網で避ける区画の集まり
//   deadlyCands(sim, p, cands)   … 行動の候補のうち、縄張りの中へ行くものを外す（sim.js decide）
// お金は動かさない。
import { SPECIES } from './data.js';
import { W, H } from './world.js';
import { gearGuardMul } from './gear.js';

export const TOO_STRONG = 420;    // rescue.js と同じ
export const NEED = 1.6;          // rescue.js と同じ
const PAD_HOME = 6;               // 巣からの見回りの範囲に足す余白
const PAD_POS = 8;                // 今いる場所からの半径
const EXEMPT = new Set(['flee', 'march', 'crusade', 'defend', 'sickbed', 'jail']);

export const powerC = (c) => (c.atk || 5) * Math.sqrt(Math.max(1, c.hp || c.maxhp || 20));
export const humanPower = (p) => (p.atk || 5) * Math.sqrt(Math.max(1, p.hp || 1)) * gearGuardMul(p);
export function overwhelming(c) {
  if (!c || c.hp <= 0 || c.dormant || c.inDungeon || !c.hostile) return false;
  const def = SPECIES[c.sp] || {};
  return powerC(c) > TOO_STRONG || !!def.boss || c.sp === 'dragon' || !!c.named;
}

// 手に負えない相手の一覧（1時間ごとに作り直す。竜は数頭しかいないので軽い）
function zones(sim) {
  const S = sim.S, hr = Math.floor(S.t / 60);
  if (sim._dzH === hr && sim._dzC === S.creatures) return sim._dz;
  const out = [];
  for (const c of Object.values(S.creatures)) {
    if (!overwhelming(c)) continue;
    const z = { c, px: c.pos.x, pz: c.pos.z, pr: PAD_POS, hx: null, hz: null, hr: 0 };
    if (c.home && c.named) { z.hx = c.home.x; z.hz = c.home.z; z.hr = (c.range || 10) + PAD_HOME; }
    out.push(z);
  }
  sim._dzH = hr; sim._dzC = S.creatures; sim._dz = out; sim._dzMap = null;
  return out;
}
const inZone = (z, x, zz, pad = 0) => Math.hypot(x - z.px, zz - z.pz) <= z.pr + pad || (z.hx != null && Math.hypot(x - z.hx, zz - z.hz) <= z.hr + pad);

export function deadlyAt(sim, x, z, pad = 0) {
  if (x == null || z == null) return null;
  for (const d of zones(sim)) {
    if (d.c.hp <= 0 || sim.S.creatures[d.c.id] !== d.c) continue;
    if (inZone(d, x, z, pad)) return d.c;
  }
  return null;
}

const alive = (m) => !!m && m.deathYear == null && !!m.needs;
export function crewPower(crew) { let t = 0; for (const m of crew) if (alive(m)) t += humanPower(m); return t; }
export const strongEnough = (crew, c) => crewPower(crew) >= powerC(c) * NEED;

// 依頼を一緒に受けた、そばにいる仲間
function questCrew(sim, p, q) {
  const S = sim.S, out = [];
  for (const id of q.takenBy || []) {
    const m = S.people[id];
    if (alive(m) && m.jail == null && m.quest === q.id && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < 20) out.push(m);
  }
  if (!out.includes(p)) out.push(p);
  return out;
}
// 依頼がその相手（または、その相手の縄張りの中の場所）を目指すものか
function questAims(sim, q, c) {
  if (!q || q.state !== 'taken') return false;
  if (q.target === c.id) return true;
  const w = q.where || (typeof q.target === 'string' && q.target[0] === 'b' ? sim.building(+q.target.slice(1))?.door : null);
  return !!w && deadlyAt(sim, w.x, w.z) === c;
}
export function mayEnter(sim, p, c) {
  if (!c) return true;
  if (p.mission && (p.mission.type === 'crusade' || p.mission.type === 'march')) return true;   // 王の軍勢・討伐隊
  if (p.quest == null) return false;
  const q = (sim.S.quests || []).find((x) => x.id === p.quest);
  if (!questAims(sim, q, c)) return false;
  return strongEnough(questCrew(sim, p, q), c);
}
export function unsafeFor(sim, p, x, z) {
  const c = deadlyAt(sim, x, z);
  return !!c && !mayEnter(sim, p, c);
}
// パーティで向かう場合：誰か一人でも入ってよい（討伐依頼を受けた強いパーティ）なら入ってよい
export function crewUnsafe(sim, crew, x, z) {
  const c = deadlyAt(sim, x, z);
  if (!c) return null;
  return crew.some((m) => alive(m) && mayEnter(sim, m, c)) ? null : c;
}

// 道探し：縄張りの区画を「いちばん危ない」扱いにした危険地図（path.js は 6 で頭打ちなので 6 を入れる）
export function zoneAvoid(sim, base, p) {
  const zs = zones(sim);
  if (!zs.length) return base;
  if (zs.some((d) => mayEnter(sim, p, d.c))) return base;   // 討伐に向かう人は、縄張りを避けない
  const CW8 = W >> 3, CH8 = H >> 3;
  if (!sim._dzMap || sim._dzMap.zs !== zs) sim._dzMap = { zs, maps: new Map() };
  let m = sim._dzMap.maps.get(base);
  if (!m) {
    if (sim._dzMap.maps.size > 4) sim._dzMap.maps.clear();
    m = base ? Array.from(base) : new Array(CW8 * CH8).fill(0);
    for (let cz = 0; cz < CH8; cz++) for (let cx = 0; cx < CW8; cx++) {
      const x = cx * 8 + 4, z = cz * 8 + 4;
      for (const d of zs) if (inZone(d, x, z, 4)) { const i = cz * CW8 + cx; if (!(m[i] >= 6)) m[i] = 6; break; }
    }
    sim._dzMap.maps.set(base, m);
  }
  return m;
}
// 遠くの道探しの粗い網で避ける区画（区画の大きさ CL、横の数 CW）
export function zoneClusters(sim, p, CL, CWn) {
  const zs = zones(sim);
  if (!zs.length || zs.some((d) => mayEnter(sim, p, d.c))) return null;
  const key = CL * 100000 + CWn;
  if (sim._dzCl && sim._dzCl.zs === zs && sim._dzCl.key === key) return sim._dzCl.set;
  const set = new Set();
  const CHn = Math.ceil(H / CL);
  for (let cz = 0; cz < CHn; cz++) for (let cx = 0; cx < CWn; cx++) {
    const x = cx * CL + CL / 2, z = cz * CL + CL / 2;
    if (zs.some((d) => inZone(d, x, z, CL * 0.35))) set.add(cz * CWn + cx);
  }
  sim._dzCl = { zs, key, set };
  return set;
}

// 行動の候補：縄張りの中へ行くものは選ばない（逃げる・行軍・討伐・町の守りは除く）
export function deadlyCands(sim, p, cands) {
  if (!zones(sim).length) return;
  for (const c of cands) {
    if (c.score <= -99 || EXEMPT.has(c.type) || !c.place || c.place.x == null) continue;
    if (p.pos && Math.abs(c.place.x - p.pos.x) <= 2 && Math.abs(c.place.z - p.pos.z) <= 2) continue;   // いまいる場所でする行動（家の中で食べる・眠る）は止めない
    if (unsafeFor(sim, p, c.place.x, c.place.z)) { c.score = -99; c.deadly = true; }
  }
}

export function deadlySummary(sim) { return zones(sim).map((d) => ({ id: d.c.id, name: d.c.title || d.c.name, x: Math.round(d.px), z: Math.round(d.pz), home: d.hx != null ? { x: d.hx, z: d.hz, r: d.hr } : null })); }
