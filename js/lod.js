// 詳しさの段階（LOD）と、未開拓地（霧）の状態
// ・広い世界では、人から遠い荒野の生き物を毎歩は動かさず、数歩に1回、まとめた時間で動かす。
//   人・町・カメラの近くは今までどおり毎歩動かすので、見ている所と人との関わりは変わらない。
// ・未開拓地：S.explored に 8×8 マスの区画ごとに「どの国が知っているか」を持つ（ビット k が国 k）。
// three.js を使わないので、node のヘッドレス試験でもそのまま読み込める。
import { W, H, T } from './world.js';

// ---------------------------------------------------------------
// 詳しさの段階（LOD）
// ---------------------------------------------------------------
export const LOD_CELL = 16;                       // 注意の地図の区画（マス）
const GW = Math.ceil(W / LOD_CELL), GH = Math.ceil(H / LOD_CELL);
export const LOD_PERIOD = [1, 3, 10];             // 段階ごとに、何歩に1回動かすか（0：近い、1：中くらい、2：遠い荒野）
const REFRESH = 20;                               // 注意の地図を作り直す間隔（歩。20歩＝10分）

// 既定では広い世界（W>200）だけで使う。今の 160 の世界は今までとまったく同じ動きになる。
// S.settings.lod を true/false にすると、明示的に切り替えられる。
function lodOn(sim) {
  const s = sim.S.settings?.lod;
  return s == null ? W > 200 : !!s;
}

// sim.step() の最初（または stepCreatures の最初）で毎歩呼ぶ
export function lodBegin(sim) {
  const L = sim._lod || (sim._lod = { n: 0, grid: new Uint8Array(GW * GH).fill(2), next: 0, on: false, hsh: new Map() });
  L.n++;
  L.on = lodOn(sim);
  if (!L.on || L.n < L.next) return L;
  L.next = L.n + REFRESH;
  // 注意の源：外にいる人、町、カメラの見ている所
  const src = new Uint8Array(GW * GH);
  const mark = (x0, z0, x1, z1) => {
    const a = Math.max(0, Math.floor(x0 / LOD_CELL)), b = Math.min(GW - 1, Math.floor(x1 / LOD_CELL));
    const c = Math.max(0, Math.floor(z0 / LOD_CELL)), d = Math.min(GH - 1, Math.floor(z1 / LOD_CELL));
    for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) src[z * GW + x] = 1;
  };
  for (const p of sim.living()) if (p.inside == null && p.pos) mark(p.pos.x, p.pos.z, p.pos.x, p.pos.z);
  for (const s of sim.S.world.settlements) mark(s.x - s.r - 4, s.z - s.r - 4, s.x + s.r + 4, s.z + s.r + 4);
  const f = sim.focus;
  if (f) mark(f.x - f.r - 4, f.z - f.r - 4, f.x + f.r + 4, f.z + f.r + 4);
  // 源から1区画（16〜32マス）以内は段階0、3区画（48〜64マス）以内は段階1、それより遠い所は段階2
  const g = L.grid;
  for (let z = 0; z < GH; z++) for (let x = 0; x < GW; x++) {
    let best = 9;
    for (let dz = -3; dz <= 3 && best > 0; dz++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= GW || zz >= GH || !src[zz * GW + xx]) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (d < best) best = d;
    }
    g[z * GW + x] = best <= 1 ? 0 : best <= 3 ? 1 : 2;
  }
  return L;
}

function idHash(L, id) {
  let h = L.hsh.get(id);
  if (h == null) {
    h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    h = Math.abs(h);
    if (L.hsh.size > 50000) L.hsh.clear();
    L.hsh.set(id, h);
  }
  return h;
}

export function lodTier(sim, x, z) {
  const L = sim._lod;
  if (!L || !L.on) return 0;
  const cx = Math.min(GW - 1, Math.max(0, Math.floor(x / LOD_CELL))), cz = Math.min(GH - 1, Math.max(0, Math.floor(z / LOD_CELL)));
  return L.grid[cz * GW + cx];
}

// 生き物をこの歩で動かすか。0 なら今回は動かさない。k なら dt×k の時間でまとめて動かす。
// 戦い・襲撃・飼われている生き物・人の近くにいる生き物は、いつも毎歩（1）。
export function lodMul(sim, c) {
  const L = sim._lod;
  if (!L || !L.on) return 1;
  if (c.fight || c.raid != null || c.occupier != null || c.owner != null) return 1;
  const tier = lodTier(sim, c.pos.x, c.pos.z);
  if (tier === 0) return 1;
  const per = LOD_PERIOD[tier];
  return (L.n + idHash(L, c.id)) % per === 0 ? per : 0;
}

// この歩で動かす生き物の一覧を [生き物, 倍率, 生き物, 倍率, ...] の形で返す（LOD が切れていれば null）。
// 注意の地図を作り直すとき（10分ごと）に、段階ごと・順番ごとの組に分けておき、毎歩はその組だけを回す。
// 全員を毎歩なめる手間が、近い生き物＋遠い生き物の 1/3・1/10 ですむ。
// 組分けのあとに生まれた生き物は、次の組分け（10分以内）から動き出す。
export function lodDue(sim, all) {
  const L = sim._lod;
  if (!L || !L.on) return null;
  if (L.bucketAt !== L.next) {
    L.bucketAt = L.next;
    L.b0 = []; L.b1 = Array.from({ length: LOD_PERIOD[1] }, () => []); L.b2 = Array.from({ length: LOD_PERIOD[2] }, () => []);
    for (const c of all) {
      if (c.dormant || c.hp <= 0) continue;
      const always = c.fight || c.raid != null || c.occupier != null || c.owner != null;
      const tier = always ? 0 : lodTier(sim, c.pos.x, c.pos.z);
      if (tier === 0) L.b0.push(c);
      else (tier === 1 ? L.b1 : L.b2)[idHash(L, c.id) % LOD_PERIOD[tier]].push(c);
    }
  }
  const out = L.due || (L.due = []);
  out.length = 0;
  for (const c of L.b0) out.push(c, 1);
  const p1 = LOD_PERIOD[1], p2 = LOD_PERIOD[2];
  for (const c of L.b1[L.n % p1]) out.push(c, c.fight || c.raid != null ? 1 : p1);
  for (const c of L.b2[L.n % p2]) out.push(c, c.fight || c.raid != null ? 1 : p2);
  return out;
}

// 人の歩き（遠い荒野をひとりで旅している人だけ間引く）。人の注意の地図とは別に、カメラと町だけを見る。
export function lodWalkMul(sim, p) {
  const L = sim._lod;
  if (!L || !L.on || p.fight || p.talk) return 1;
  const f = sim.focus;
  if (f && Math.abs(p.pos.x - f.x) < f.r + 24 && Math.abs(p.pos.z - f.z) < f.r + 24) return 1;
  for (const s of sim.S.world.settlements) if (Math.abs(p.pos.x - s.x) < s.r + 16 && Math.abs(p.pos.z - s.z) < s.r + 16) return 1;
  return (L.n + p.id) % 4 === 0 ? 4 : 0;
}

// 段階ごとの数（画面の表示や試験用）
export function lodStats(sim) {
  const L = sim._lod, out = { on: !!L?.on, tiers: [0, 0, 0] };
  if (!L?.on) return out;
  for (const c of Object.values(sim.S.creatures)) if (!c.dormant && c.hp > 0) out.tiers[lodTier(sim, c.pos.x, c.pos.z)]++;
  return out;
}

// ---------------------------------------------------------------
// 未開拓地（霧）の状態
// ---------------------------------------------------------------
export const FOG_CELL = 8;                          // 危険地図と同じ 8×8 マス
export const FW = Math.ceil(W / FOG_CELL), FH = Math.ceil(H / FOG_CELL);
export const ALL_KNOWN = 0xff;

// 古いセーブで欠けていても動くように、なければ作る。
//  ・地図の担当が world.settled（{x0,z0,x1,z1}：開拓済みの四角）を置いていれば、その内側と、国の領土と、道・町のある区画を既知にする。
//  ・world.settled がなければ（今の 160 の世界や古いセーブ）、全部を既知にする。→ 見た目は今までと同じ。
export function ensureExplored(sim) {
  const S = sim.S, w = S.world;
  if (Array.isArray(S.explored) && S.explored.length === FW * FH) return S.explored;
  const ex = S.explored = new Array(FW * FH).fill(0);
  S.exploredRev = (S.exploredRev || 0) + 1;
  const r = w.settled;
  if (!r) { ex.fill(ALL_KNOWN); return ex; }
  for (let cz = 0; cz < FH; cz++) for (let cx = 0; cx < FW; cx++) {
    const x0 = cx * FOG_CELL, z0 = cz * FOG_CELL;
    let bits = 0;
    if (x0 + FOG_CELL > r.x0 && x0 < r.x1 && z0 + FOG_CELL > r.z0 && z0 < r.z1) bits = ALL_KNOWN;
    else {
      for (let z = z0; z < Math.min(H, z0 + FOG_CELL) && bits !== ALL_KNOWN; z++) for (let x = x0; x < Math.min(W, x0 + FOG_CELL); x++) {
        const i = z * W + x, k = w.kingdomOf?.[i] ?? -1, t = w.tiles[i];
        if (k >= 0) bits |= 1 << k;
        if (t === T.ROAD || t === T.PLAZA || t === T.BLD || t === T.FIELD || t === T.BRIDGE) bits = ALL_KNOWN;
      }
    }
    ex[cz * FW + cx] = bits;
  }
  return ex;
}

export function knownAt(S, x, z, kingdom = -1) {
  const ex = S.explored;
  if (!ex) return true;
  const v = ex[Math.floor(z / FOG_CELL) * FW + Math.floor(x / FOG_CELL)] || 0;
  return kingdom < 0 ? v !== 0 : (v & (1 << kingdom)) !== 0;
}

// (x,z) のまわり r マスを、国 kingdom（-1 ならどの国でもなく「知られた」印だけ）が知った。
// 新しく知られた区画の数を返す。描画とミニマップは sim._fogDirty（区画番号の Set）を見て、そこだけ描き直す。
export function markExplored(sim, x, z, r, kingdom = -1) {
  const S = sim.S, ex = ensureExplored(sim);
  const bit = kingdom >= 0 ? 1 << kingdom : 0x80;
  const a = Math.max(0, Math.floor((x - r) / FOG_CELL)), b = Math.min(FW - 1, Math.floor((x + r) / FOG_CELL));
  const c = Math.max(0, Math.floor((z - r) / FOG_CELL)), d = Math.min(FH - 1, Math.floor((z + r) / FOG_CELL));
  let fresh = 0;
  for (let cz = c; cz <= d; cz++) for (let cx = a; cx <= b; cx++) {
    const i = cz * FW + cx, old = ex[i] || 0;
    if (old & bit) continue;
    ex[i] = old | bit;
    if (!old) { fresh++; (sim._fogDirty || (sim._fogDirty = new Set())).add(i); }
  }
  if (fresh) S.exploredRev = (S.exploredRev || 0) + 1;
  return fresh;
}

// 描画用：区画の霧の濃さ（0＝既知、1＝未知）。区画の中心どうしを線形につなぎ、境目をなめらかにする。
export function fogAt(S, x, z) {
  const ex = S.explored;
  if (!ex) return 0;
  const fx = x / FOG_CELL - 0.5, fz = z / FOG_CELL - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const v = (cx, cz) => { cx = Math.min(FW - 1, Math.max(0, cx)); cz = Math.min(FH - 1, Math.max(0, cz)); return ex[cz * FW + cx] ? 0 : 1; };
  return (v(x0, z0) * (1 - tx) + v(x0 + 1, z0) * tx) * (1 - tz) + (v(x0, z0 + 1) * (1 - tx) + v(x0 + 1, z0 + 1) * tx) * tz;
}

// 生き物の一覧（毎歩 Object.values(S.creatures) を作り直さない）。
// 新しい生き物が生まれたとき（S.nextCid が変わったとき）と、注意の地図の作り直し（10分ごと）で作り直す。
// 消えた生き物がしばらく残ることがあるので、使う側で c.hp > 0 を確かめること。
export function creatureArray(sim) {
  const S = sim.S, L = sim._lod || lodBegin(sim);
  if (!L.all || L.allCid !== S.nextCid || L.allAt !== L.next || L.allS !== S.creatures) {
    L.all = Object.values(S.creatures); L.allCid = S.nextCid; L.allAt = L.next; L.allS = S.creatures;
  }
  return L.all;
}
