// 地域の型と特産・氷室・狩りの許し（開発部）― docs/畑と地域の食料.md の 3章・5章・6-1（氷室）・7章 案G
//
// 1. 地域の型：町の中心から半径12マスの地形を数えて、町ごとに1回だけ決める（S.world.settlements[i].region）。
//    型ごとに、畑に植える作物の好み（farming.js が使う）、果樹・永年の作物（特産）、飼う家畜を変える。
// 2. 家畜：新しい世界を作るとき、牧畜の村の農家に羊3頭、山と雪の村の農家に山羊2頭を足す（古いセーブには足さない）。
//    餌代は今までどおり飼い主の家計 → 干し草の持ち主（fauna.js）。
// 3. 氷室：王都と雪の国の町に1つ。冬に氷を切り出してためておき、町の市場と農家の蔵の傷みやすい物が3倍長持ちする。
//    お金：預け賃 1日1銅貨　町でいちばん手元の厚い商人の家計 → 氷室番の家計（氷がある日だけ）。
// 4. 狩りの許し：鹿は「王の森」の獣。狩人の家は年に1度、国に許しを買う（20銅貨　狩人の家計 → 国庫）。
//    許しのない狩人は鹿を狩らない（兎・猪・鳥は誰でも狩ってよい）。季節の獲物（夏は雄鹿、秋は猪）を先に狙う。
// 5. 国どうしの食べ物の取り引き（diplomacy.js）に、日持ちする食べ物を足す（DIPLO_HOOK）。
//
// ■ 本体からの呼び方
//   ensureRegions(sim, fresh)        … newWorld（initFoodflow の後）と load
//   regionsDaily(sim)                … newDay
//   regionHuntOk(sim, p, c)          … 狩人が獲物を選ぶとき（sim.js doWork の hunter）
//   regionOf(sim, sid) / REGIONS     … farming.js・ui
//   matter.js の MATTER_HOOK.keepMul … 氷室のある町の傷み（ensureRegions が入れる）
import { T, W, H } from './world.js';
import { KINGDOMS } from './data.js';
import { makeCreature } from './creatures.js';
import { ensureAnimal } from './fauna.js';
import { MATTER_HOOK, matterGood } from './matter.js';
import { DIPLO_HOOK } from './diplomacy.js';
import { flow } from './ledger.js';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// ---------------------------------------------------------------- 型の表
// crops：畑の作物の選びやすさ（1が普通）。perennial：果樹・永年の作物（1軒に1区画まで）。note：特産の説明
export const REGIONS = {
  monastery: { name: '修道の里', note: '麦酒・葡萄酒・蜂蜜・薬草', crops: { barley: 2, spelt: 1.4, garlic: 1.6, onion: 1.3, cabbage: 1.3, pea: 1.2 }, perennial: ['hops', 'grape', 'apple'] },
  mountain: { name: '山と鉱山', note: '鉱石・蕎麦・栗・山羊の乳', crops: { buckwheat: 2.5, oat: 1.8, rye: 1.6, turnip: 1.3, wheat: 0.6, barley: 1.2 }, perennial: ['chestnut'], goats: 2 },
  fishing: { name: '漁村', note: '魚・塩・海藻', crops: { barley: 1.2, turnip: 1.3, cabbage: 1.3, onion: 1.2 }, perennial: [] },
  oasis: { name: 'オアシス', note: '棗・黍・オリーブ油・香辛料', crops: { millet: 2.5, sorghum: 2, chickpea: 2, lentil: 1.8, wheat: 0.8, barley: 1.3, onion: 1.2 }, perennial: ['date', 'olive'] },
  snow: { name: '雪と凍土', note: '黒麦・燕麦・蕪・霜苺・毛皮', crops: { rye: 2.5, oat: 2, turnip: 1.8, wcabbage: 1.6, leek: 1.4, wheat: 0.5, barley: 1.3 }, perennial: [], goats: 2 },
  jungle: { name: '密林', note: '玉蜀黍・米・砂糖黍・果物', crops: { maize: 2.5, rice: 2.2, millet: 1.3, wheat: 0.4, chickpea: 1.2 }, perennial: ['sugarcane'] },
  forest: { name: '森と狩り', note: '鹿肉・猪肉・木の実・きのこ・蜂蜜', crops: { rye: 1.6, spelt: 1.5, oat: 1.4, buckwheat: 1.3, turnip: 1.2 }, perennial: ['chestnut', 'apple'] },
  pastoral: { name: '牧畜', note: '乳・チーズ・羊毛・革・肉', crops: { oat: 2, barley: 1.5, turnip: 1.6, clover: 2, rye: 1.3 }, perennial: [], sheep: 3 },
  granary: { name: '穀倉', note: '小麦・大麦・豆・蕪・藁・麦酒', crops: { wheat: 1.6, barley: 1.4, pea: 1.3, fava: 1.3, turnip: 1.2, sugar_beet: 1.2, flax: 1.2 }, perennial: ['apple', 'hops'] },
  capital: { name: '王都（食べる町）', note: 'パン・菓子・酒・料理。食べ物のほとんどを周りから買う', crops: { cabbage: 1.6, onion: 1.6, carrot: 1.5, leek: 1.4, pea: 1.2, wheat: 1.2 }, perennial: ['apple', 'grape'] },
  frontier: { name: '開拓村', note: '切り開いたばかりの畑で麦', crops: { wheat: 1.3, rye: 1.3, oat: 1.2, spiritbean: 1.5 }, perennial: [] },
};

// 地形を数える：町の縁の外（半径 r+1〜r+14）の、町の建物や道でない自然のマスだけ
const TOWNISH = new Set([T.ROAD, T.PLAZA, T.BLD, T.WALL, T.FENCE, T.DOCK]);
function census(w, cx, cz, r0) {
  const c = { n: 0, rock: 0, sea: 0, desert: 0, snow: 0, jungle: 0, forest: 0, grass: 0, river: 0, hill: 0 };
  const R = r0 + 14, h0 = w.hgt[cz * W + cx] || 0;
  for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    const dd = (x - cx) ** 2 + (z - cz) ** 2;
    if (dd > R * R || dd <= (r0 + 1) ** 2) continue;
    const t = w.tiles[z * W + x];
    if (TOWNISH.has(t)) continue;
    c.n++;
    if (t === T.ROCK || t === T.PEAK) c.rock++;
    else if (t === T.SEA || t === T.DEEP) c.sea++;
    else if (t === T.DESERT) c.desert++;
    else if (t === T.SNOW) c.snow++;
    else if (t === T.JUNGLE || t === T.SWAMP) c.jungle++;
    else if (t === T.FOREST || t === T.DENSE) c.forest++;
    else if (t === T.GRASS || t === T.SAVANNA || t === T.FIELD || t === T.PASTURE) c.grass++;
    else if (t === T.RIVER || t === T.BRIDGE) c.river++;
    if ((w.hgt[z * W + x] || 0) >= h0 + 2) c.hill++;
  }
  const f = {}; for (const k of Object.keys(c)) if (k !== 'n') f[k] = c[k] / Math.max(1, c.n);
  return f;
}
function hasBldNear(sim, s, types, r) {
  for (const b of sim.S.world.buildings) if (b && types.includes(b.type) && Math.hypot(b.x - s.x, b.z - s.z) <= r) return true;
  return false;
}
export function detectRegion(sim, s) {
  const w = sim.S.world;
  const f = census(w, Math.round(s.x), Math.round(s.z), s.r || 6);
  s.terr = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 100) / 100]));   // 数えた結果（画面で見せる）
  if (/修道/.test(s.name)) return 'monastery';
  if (s.type === 'capital') return 'capital';
  if (/オアシス/.test(s.name)) return 'oasis';
  if (f.rock >= 0.35 || /坑道|鉱/.test(s.name) || hasBldNear(sim, s, ['mine'], (s.r || 6) + 4)) return 'mountain';
  if (s.type === 'port' || f.sea >= 0.3) return 'fishing';
  if (f.desert >= 0.4) return 'oasis';
  if (f.snow >= 0.35) return 'snow';
  if (f.jungle >= 0.35) return 'jungle';
  if (s.frontier || s.founded != null) return 'frontier';
  if (f.forest >= 0.45) return 'forest';
  if (f.grass >= 0.4 && (f.river < 0.01 || f.hill > 0.3)) return 'pastoral';
  if (f.grass >= 0.35 && f.river >= 0.01) return 'granary';
  // どれにも当てはまらないとき：いちばん多い地形から
  if (f.snow > 0.2) return 'snow';
  if (f.desert > 0.2) return 'oasis';
  if (f.forest > f.grass) return 'forest';
  return f.river >= 0.01 ? 'granary' : 'pastoral';
}
// 気候：寒い（北の国・雪）・暑い（南の国・砂漠・密林）・穏やか
export function climateOf(sim, sid) {
  const s = sim.town(sid); if (!s) return 'mild';
  const rg = s.region;
  if (rg === 'snow') return 'cold';
  if (rg === 'oasis' || rg === 'jungle' || KINGDOMS[s.kingdom]?.south) return 'hot';
  if (s.kingdom === 1) return 'cool';
  return 'mild';
}
export function regionOf(sim, sid) { const s = sim.town(sid); return s?.region ? REGIONS[s.region] : null; }

// ---------------------------------------------------------------- 状態
function RG(sim) {
  const S = sim.S;
  if (!S.regions) S.regions = { v: 1, ice: {}, permits: {}, stats: { permits: 0, permitPaid: 0, iceFee: 0, iceDays: 0, deerSkip: 0 } };
  const G = S.regions;
  G.ice = G.ice || {}; G.permits = G.permits || {}; G.stats = G.stats || {};
  return G;
}

// ---------------------------------------------------------------- はじめに
export function ensureRegions(sim, fresh = false) {
  const S = sim.S, G = RG(sim);
  for (const s of S.world.settlements) if (!s.region && !s.tribal) s.region = detectRegion(sim, s);
  if (fresh && !G.stocked) { G.stocked = 1; stockAnimals(sim); }
  ensureIce(sim);
  MATTER_HOOK.keepMul = (sim2, sid) => iceMul(sim2, sid);
  DIPLO_HOOK.goods = DIPLO_FOODS;
  DIPLO_HOOK.gd = (g) => matterGood(g);
  sim._rg = { huntOk: regionHuntOk, preyMul, iceMul, regionOf, REGIONS, iceTile: iceTileHtml, ice: () => sim.S.regions?.ice || {} };
}

// 牧畜の村の羊・山と雪の村の山羊（新しい世界だけ）
function stockAnimals(sim) {
  const S = sim.S, R = sim.rng;
  for (const hh of Object.values(S.households)) {
    const s = sim.town(hh.s); if (!s || s.tribal) continue;
    const rg = REGIONS[s.region]; if (!rg || (!rg.sheep && !rg.goats)) continue;
    if (!hh.members?.some((id) => { const q = S.people[id]; return q && q.deathYear == null && q.job === 'farmer'; })) continue;
    const b = sim.building(hh.house); if (!b?.door) continue;
    const want = [];
    for (let i = 0; i < (rg.sheep || 0); i++) want.push(['sheep', R.int(2, 6) * 40]);
    for (let i = 0; i < (rg.goats || 0); i++) want.push(['goat', R.int(2, 6) * 40]);
    for (const [sp, age] of want) {
      const c = makeCreature(sim, sp, b.door.x, b.door.z, { owner: hh.s, range: 2, hx: b.door.x, hz: b.door.z, role: sp === 'goat' ? 'dairy' : 'wool', age });
      if (!S.creatures[c.id] || !(c.hp > 0)) { delete S.creatures[c.id]; continue; }
      c.keeper = hh.id; c.sex = 'f'; c.farm = hh.id;
      ensureAnimal(sim, c);
      c.role = sp === 'goat' ? 'dairy' : 'wool';
    }
  }
}

// ---------------------------------------------------------------- 氷室
// 王都と雪の型の町。町はずれの草地に置く（3Dの姿は farmgfx.js。クリックで様子が見える）
function ensureIce(sim) {
  const S = sim.S, G = RG(sim), w = S.world;
  for (const s of w.settlements) {
    if (s.tribal || G.ice[s.id]) continue;
    if (s.type !== 'capital' && s.region !== 'snow') continue;
    // 置き場：町の縁の外、草地のマス
    let spot = null;
    const R0 = (s.r || 5) + 2;
    for (let d = R0; d <= R0 + 5 && !spot; d++) {
      for (let a = 0; a < 16 && !spot; a++) {
        const x = Math.round(s.x + Math.cos(a / 16 * Math.PI * 2 + 0.4) * d), z = Math.round(s.z + Math.sin(a / 16 * Math.PI * 2 + 0.4) * d);
        if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
        const t = w.tiles[z * W + x];
        if ((t === T.GRASS || t === T.SNOW || t === T.SAVANNA) && w.bldAt[z * W + x] < 0) spot = { x, z };
      }
    }
    if (!spot) continue;
    // 氷を切り出せる所（湖・川・雪）が近いか
    let src = 0;
    for (let z = spot.z - 25; z <= spot.z + 25; z += 2) for (let x = spot.x - 25; x <= spot.x + 25; x += 2) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const t = w.tiles[z * W + x];
      if (t === T.SNOW) src = 2; else if ((t === T.RIVER) && src < 1) src = 1;
    }
    G.ice[s.id] = { x: spot.x, z: spot.z, lvl: s.region === 'snow' ? 80 : 40, src, keeper: null };
  }
}
function iceKeeper(sim, s, I) {
  const S = sim.S;
  if (I.keeper != null && S.households[I.keeper]?.members?.length) return S.households[I.keeper];
  // 氷室番：町の倉番の家、いなければ町の農家・漁師の家
  const cand = Object.values(S.households).filter((h) => h.s === s.id && h.members?.length && h.members.some((id) => { const q = S.people[id]; return q && q.deathYear == null && ['granarian', 'farmer', 'fisher', 'woodcutter'].includes(q.job); }));
  cand.sort((a, b) => (b.members.some((id) => S.people[id]?.job === 'granarian') ? 1 : 0) - (a.members.some((id) => S.people[id]?.job === 'granarian') ? 1 : 0) || a.id - b.id);
  I.keeper = cand[0]?.id ?? null;
  return cand[0] || null;
}
export function iceMul(sim, sid) {
  const I = sim.S.regions?.ice?.[sid];
  return I && I.lvl > 0 ? 3 : 1;
}
function iceDaily(sim) {
  const S = sim.S, G = RG(sim), si = sim.seasonIdx();
  for (const [sidS, I] of Object.entries(G.ice)) {
    const s = sim.town(+sidS); if (!s) continue;
    // 冬に氷を切り出してためる。暖かい季節は少しずつ解ける
    if (si === 3) I.lvl = Math.min(100, I.lvl + (I.src >= 2 ? 25 : I.src ? 15 : 5));
    else I.lvl = Math.max(0, I.lvl - (s.region === 'snow' ? 1 : [2, 4, 2][si]));
    if (I.lvl <= 0) continue;
    // 預け賃：町の商人 → 氷室番（1日1銅貨）
    const kh = iceKeeper(sim, s, I); if (!kh) continue;
    const mh = Object.values(S.households).filter((h) => h.s === s.id && h !== kh && h.members?.some((id) => S.people[id]?.job === 'merchant') && h.money > 40).sort((a, b) => b.money - a.money)[0];
    if (!mh) continue;
    mh.money -= 1; kh.money += 1;
    flow(sim, '市場の商人', '氷室番', 1, '氷室の預け賃');
    G.stats.iceFee = num(G.stats.iceFee) + 1; G.stats.iceDays = num(G.stats.iceDays) + 1;
  }
}
export function iceTileHtml(sim, x, z, esc) {
  const G = sim.S.regions; if (!G?.ice) return '';
  for (const [sidS, I] of Object.entries(G.ice)) {
    if (Math.abs(I.x - x) > 0 || Math.abs(I.z - z) > 0) continue;
    const s = sim.town(+sidS); const kh = I.keeper != null ? sim.S.households[I.keeper] : null;
    return `<div class="section"><h4>氷室（${esc(s?.name || '')}）</h4><dl class="kv"><dt>氷の量</dt><dd>${Math.round(I.lvl)}／100</dd><dt>効き目</dt><dd>${I.lvl > 0 ? '町の市場と農家の蔵の、傷みやすい食べ物が3倍長持ちする' : '氷が尽きている（冬に切り出す）'}</dd><dt>氷を切り出す所</dt><dd>${I.src >= 2 ? '近くの雪原' : I.src ? '近くの川' : '遠い（冬に少しだけ）'}</dd><dt>氷室番</dt><dd>${esc(kh?.name || 'まだいない')}</dd><dt>預け賃</dt><dd>1日1銅貨（町の商人 → 氷室番）</dd></dl></div>`;
  }
  return '';
}

// ---------------------------------------------------------------- 狩りの許し
const PERMIT_FEE = 20;
const DEER = new Set(['deer', 'stag', 'elk', 'reindeer']);
// 国に属さない村（villages.js の indep）には王の森がないので、許しは要らない
function kingdomOfHh(sim, hh) { const s = sim.town(hh.s); return s && !s.indep && !s.tribal && s.kingdom != null && s.kingdom >= 0 ? sim.S.kingdoms[s.kingdom] : null; }
function permitDaily(sim) {
  const S = sim.S, G = RG(sim), year = sim.year();
  for (const p of sim.living()) {
    if (p.job !== 'hunter') continue;
    const hh = sim.hh(p); if (!hh) continue;
    if (G.permits[hh.id] === year) continue;
    const K = kingdomOfHh(sim, hh); if (!K) continue;
    if (hh.money < PERMIT_FEE + 30) continue;
    hh.money -= PERMIT_FEE; K.treasury = num(K.treasury) + PERMIT_FEE;
    if (K.fisc?.cur) { K.fisc.cur.crown = (K.fisc.cur.crown || 0) + PERMIT_FEE; K.fisc.dayIn = (K.fisc.dayIn || 0) + PERMIT_FEE; }
    flow(sim, '狩人', '国庫', PERMIT_FEE, '狩りの許し');
    G.permits[hh.id] = year;
    G.stats.permits = num(G.stats.permits) + 1; G.stats.permitPaid = num(G.stats.permitPaid) + PERMIT_FEE;
    sim.remember(p, `${K.name}から今年の狩りの許しを${PERMIT_FEE}銅貨で買った。王の森の鹿も狩れる`, { emo: 0.2, imp: 0.3, k: 'work' });
  }
}
// 狩人が獲物を選ぶとき：鹿は許しがある人だけ。季節の獲物は先に狙う（距離の比べ方で有利にする）
export function regionHuntOk(sim, p, c) {
  if (!DEER.has(c.sp)) return true;
  const hh = sim.hh(p);
  if (hh && !kingdomOfHh(sim, hh)) return true;
  const ok = hh && sim.S.regions?.permits?.[hh.id] === sim.year();
  if (!ok) { const G = RG(sim); G.stats.deerSkip = num(G.stats.deerSkip) + 1; }
  return !!ok;
}
// 季節の獲物：夏は雄鹿（脂がのる）、秋は猪（団栗で太る）、冬は毛皮の獣を先に狙う（距離を短く見る）
const PREY = [{}, { deer: 0.6, stag: 0.6 }, { boar: 0.6, deer: 0.8 }, { fox: 0.7, rabbit: 0.7, reindeer: 0.6, wolf: 0.8 }];
export function preyMul(sim, c) { return PREY[sim.seasonIdx()]?.[c.sp] ?? 1; }
export function hasHuntPermit(sim, hh) { return !!hh && sim.S.regions?.permits?.[hh.id] === sim.year(); }

// ---------------------------------------------------------------- 国どうしの取り引きに足す食べ物（日持ち20日以上）
export const DIPLO_FOODS = ['barley', 'rye', 'oat', 'spelt', 'millet', 'maize', 'rice_paddy', 'buckwheat', 'fava_bean', 'pea', 'lentil', 'chickpea', 'onion', 'garlic', 'cheese', 'olive_oil', 'date', 'dragonchili', 'moonwheat'];

// ---------------------------------------------------------------- 毎日
export function regionsDaily(sim) {
  const S = sim.S;
  RG(sim);
  for (const s of S.world.settlements) if (!s.region && !s.tribal) s.region = detectRegion(sim, s);   // 新しくできた村
  if (sim.dayIndex % 10 === 0) ensureIce(sim);
  iceDaily(sim);
  permitDaily(sim);
}

// 町の情報（ui の畑のクリックなどで使う）
export function regionHtml(sim, sid, esc) {
  const s = sim.town(sid); const rg = s && REGIONS[s.region]; if (!rg) return '';
  return `<dt>地域の型</dt><dd>${esc(rg.name)}（特産：${esc(rg.note)}）</dd>`;
}
