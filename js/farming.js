// 畑の作り直し（開発部）― docs/畑と地域の食料.md の 1章・2章（優先順位4と7の魔法の作物）
//
// 畑1マス＝1区画。区画ごとに「何を植えるか」を決め、季節どおりに 耕す → 種まき → 育つ → 実る → 刈り入れ と進める。
//   - 作物は表（CROPS）から選ぶ。国ごとの輪作の型（三圃制・二圃制・研究で四圃輪作・水田）の順番で、次の作物の組を決める。
//   - 地力（0〜120）は区画ごと。収穫で減り、休耕（+1/日）・家畜の放牧（さらに+0.6/日）・肥やし（1荷+4、1作3荷まで）・豆（地力が増える）で戻る。
//   - 連作の害：前と同じ作物を植えると、表の割合だけ収量が減る。
//   - 冬（1年の30〜39日目）に実るのは冬の作物（韮葱・冬の甘藍・霜苺）だけ。麦は冬に刈らない。
//   - 収量 ＝ 作物の収量 × 地力の効き(0.3〜1.4) × 連作の害 × 土地の向き不向き × 天気（harvestMul）× 世話 × YIELD_SCALE
// 農夫の1年：区画の段階を見て、刈り入れ ＞ 種まき ＞ 耕す（牛・馬がいれば速い）＞ 肥やしをまく ＞ 草取り・水やり の順に働く。
//   冬は脱穀と道具の手入れ（蔵の麦を少しずつ出して売る）。
// 収穫した物は、畑の持ち主の家の「納屋」（S.farm.barn）へ入り、毎日少しずつ家の蔵へ出す（家族が食べ、余りは今までどおり市場で売る）。
//   家の蔵に入りきらない野菜などは、その日に町の市場の商人に売る（marketDeliver：商人の家計 → 農家の家計）。
//   お金は、売ったときにだけ動く。この仕組みの中でお金が湧くことはない。
//   肥やし：自分の家畜のふん（無料）と、matter.js が週に1度市場で買う肥やし（農家の家計 → 肥やしの持ち主）を畑にまく。
//   小作（畑を持たない家）の小麦は、今までどおり fieldShare で3割を地主へ納める。
//
// ■ 本体からの呼び方
//   ensureFarming(sim, fresh)          … newWorld（ensureRegions の後）と load
//   farmingDaily(sim)                  … newDay
//   farmWork(sim, p, dt, eff, hh)      … doWork の case 'farmer' の頭。true を返したら今までの麦の処理はしない
//   sim._farm.place(sim, p)            … civic.js の placeFor 'field'：その人の家の、いま手のかかる区画へ
//   sim._farm.tileHtml(sim, x, z, esc) … ui.js の tileHtml（畑をクリックしたとき）
//   MATTER_HOOK.gatherFilter           … matter.js：農夫が畑で拾う物を、植えている作物に合わせる
import { GOODS } from './data.js';
import { T, W, H } from './world.js';
import { stash, marketDeliver } from './market.js';
import { MATTER_HOOK, matterGood } from './matter.js';
import { harvestMul } from './weather.js';
import { fieldShare } from './property.js';
import { millToll } from './shops.js';
import { meal } from './ledger.js';
import { REGIONS, climateOf } from './regions.js';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gd = (g) => GOODS[g] || matterGood(g);
const YEAR = 40;
export const YIELD_SCALE = 1.0;   // 全体の倍率（指示書の表のまま）。今の世界の農夫の麦（20日で約8千袋）を大きく上回る。多すぎれば下げる
// その場かぎりの控え（セーブには入れない）
const CACHE = new WeakMap();
function cache(sim) { const F = sim.S.farm; let c = CACHE.get(F); if (!c) { c = { by: null, byVer: -1, day: -1, stock: new Map(), pop: new Map(), dr: null }; CACHE.set(F, c); } if (c.day !== sim.dayIndex) { c.day = sim.dayIndex; c.stock.clear(); c.pop.clear(); c.dr = null; } return c; }
// 穀物と豆（市場の品の一覧では1つが1食分より小さい）は、1袋＝1食分になるように数を換える
export function unitMul(c) { const G = gd(c.good); return !GOODS[c.good] && !c.magic && (c.kind === 'grain' || c.kind === 'legume') && G?.meals >= 0.2 ? 1 / G.meals : 1; }
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

// ---------------------------------------------------------------- 作物の表
// sow：種まきの窓（1年の何日目から何日目まで）。g：育つ日数（hv があれば、その日に実る）。y：1回の収量。rep：連作の害。fd：地力の増減
// cl：よく育つ気候（mild 穏やか・cool 涼しい・cold 寒い・hot 暑い）。no：植えない気候。look：畑の見た目。slot：輪作の組
// W 秋まき麦／S 春まき・夏まき／T 蕪（四圃）／C 牧草（四圃）／R 水田／P 果樹・永年
export const CROPS = {
  wheat: { name: '小麦', good: 'wheat', slot: 'W', sow: [23, 27], g: 31, y: 300, rep: 0.25, fd: -12, cl: ['mild', 'cool'], no: [], look: 'wheat', kind: 'grain', straw: 0.08 },
  rye: { name: '黒麦', good: 'rye', slot: 'W', sow: [20, 24], g: 33, y: 260, rep: 0.10, fd: -8, cl: ['cold', 'cool'], no: ['hot'], look: 'rye', kind: 'grain', straw: 0.08 },
  spelt: { name: '古麦', good: 'spelt', slot: 'W', sow: [23, 27], g: 31, y: 200, rep: 0.10, fd: -6, cl: ['cool', 'cold', 'mild'], no: ['hot'], look: 'spelt', kind: 'grain', straw: 0.06 },
  garlic: { name: '大蒜', good: 'garlic', slot: 'W', sow: [23, 27], g: 26, y: 120, rep: 0.20, fd: -6, cl: ['mild', 'hot'], no: [], look: 'onion', kind: 'root', w: 0.25 },
  barley: { name: '大麦', good: 'barley', slot: 'S', sow: [0, 6], g: 11, y: 270, rep: 0.15, fd: -10, cl: ['mild', 'cool', 'cold', 'hot'], no: [], look: 'barley', kind: 'grain', straw: 0.06 },
  oat: { name: '燕麦', good: 'oat', slot: 'S', sow: [3, 7], g: 12, y: 240, rep: 0.10, fd: -8, cl: ['cool', 'cold'], no: ['hot'], look: 'oat', kind: 'grain', straw: 0.06 },
  buckwheat: { name: '蕎麦', good: 'buckwheat', slot: 'S', sow: [10, 13], g: 9, y: 150, rep: 0.05, fd: -4, cl: ['cool', 'cold'], no: ['hot'], look: 'buckwheat', kind: 'grain', w: 0.5 },
  millet: { name: '粟', good: 'millet', slot: 'S', sow: [7, 10], g: 11, y: 180, rep: 0.10, fd: -8, cl: ['hot'], no: ['cold'], look: 'millet', kind: 'grain' },
  sorghum: { name: '高黍', good: 'sorghum', slot: 'S', sow: [7, 10], g: 11, y: 180, rep: 0.10, fd: -8, cl: ['hot'], no: ['cold', 'cool'], look: 'sorghum', kind: 'grain' },
  maize: { name: '玉蜀黍', good: 'maize', slot: 'S', sow: [7, 10], g: 13, y: 320, rep: 0.20, fd: -14, cl: ['hot'], no: ['cold', 'cool'], look: 'maize', kind: 'grain' },
  pea: { name: '豌豆', good: 'pea', slot: 'S', sow: [0, 3], g: 11, y: 180, rep: 0.30, fd: 8, cl: ['mild', 'cool', 'cold'], no: [], look: 'bean', kind: 'legume' },
  fava: { name: '空豆', good: 'fava_bean', slot: 'S', sow: [0, 3], g: 11, y: 180, rep: 0.30, fd: 8, cl: ['mild', 'cool', 'hot'], no: [], look: 'bean', kind: 'legume' },
  lentil: { name: '扁豆', good: 'lentil', slot: 'S', sow: [3, 7], g: 11, y: 150, rep: 0.30, fd: 6, cl: ['hot', 'mild'], no: ['cold'], look: 'bean', kind: 'legume' },
  chickpea: { name: '雛豆', good: 'chickpea', slot: 'S', sow: [3, 7], g: 11, y: 150, rep: 0.30, fd: 6, cl: ['hot'], no: ['cold'], look: 'bean', kind: 'legume' },
  cabbage: { name: '甘藍', good: 'cabbage', slot: 'S', sow: [3, 7], g: 14, y: 280, rep: 0.30, fd: -10, cl: ['cool', 'mild', 'cold'], no: ['hot'], look: 'cabbage', kind: 'leafy', w: 0.5 },
  onion: { name: '玉葱', good: 'onion', slot: 'S', sow: [0, 3], g: 13, y: 250, rep: 0.20, fd: -8, cl: ['mild', 'hot', 'cool'], no: [], look: 'onion', kind: 'root', w: 0.5 },
  carrot: { name: '人参', good: 'carrot', slot: 'S', sow: [3, 7], g: 12, y: 260, rep: 0.15, fd: -8, cl: ['mild', 'cool'], no: [], look: 'carrot', kind: 'root', w: 0.5 },
  sugar_beet: { name: '甜菜', good: 'sugar_beet', slot: 'S', sow: [3, 7], g: 19, y: 400, rep: 0.25, fd: -14, cl: ['cool', 'cold'], no: ['hot'], look: 'beet', kind: 'root', w: 0.3 },
  flax: { name: '亜麻', good: 'flax', slot: 'S', sow: [3, 7], g: 11, y: 80, rep: 0.40, fd: -16, cl: ['cool', 'mild'], no: ['hot'], look: 'flax', kind: 'fiber', w: 0.4 },
  hemp: { name: '麻', good: 'hemp', slot: 'S', sow: [7, 10], g: 11, y: 90, rep: 0.10, fd: -12, cl: ['mild', 'cool'], no: [], look: 'hemp', kind: 'fiber', w: 0.4 },
  turnip: { name: '蕪', good: 'turnip', slot: 'S', sow: [14, 20], g: 8, y: 350, rep: 0.20, fd: -6, cl: ['mild', 'cool', 'cold'], no: ['hot'], look: 'turnip', kind: 'root', w: 0.6 },
  leek: { name: '韮葱（冬）', good: 'leek', slot: 'S', sow: [18, 24], g: 14, y: 250, rep: 0.20, fd: -8, cl: ['mild', 'cool', 'cold'], no: ['hot'], look: 'leek', kind: 'root', w: 0.8, winter: true },
  wcabbage: { name: '冬の甘藍', good: 'cabbage', slot: 'S', sow: [16, 22], g: 16, y: 260, rep: 0.30, fd: -10, cl: ['cool', 'cold', 'mild'], no: ['hot'], look: 'cabbage', kind: 'leafy', w: 0.8, winter: true },
  turnipT: { name: '蕪（四圃）', good: 'turnip', slot: 'T', sow: [14, 20], g: 8, y: 350, rep: 0.20, fd: -6, cl: ['mild', 'cool', 'cold'], no: [], look: 'turnip', kind: 'root' },
  clover: { name: '牧草（白詰草）', good: 'hay', slot: 'C', sow: [0, 20], hv: 23, y: 120, rep: 0, fd: 10, cl: ['mild', 'cool', 'cold', 'hot'], no: [], look: 'clover', kind: 'fodder' },
  rice: { name: '稲', good: 'rice_paddy', slot: 'R', sow: [7, 10], g: 16, y: 330, rep: 0, fd: -2, cl: ['hot', 'mild'], no: ['cold'], look: 'rice', kind: 'grain' },
  // 魔法の作物（1軒に1区画まで。育つ場所の決まりあり：magic）
  moonwheat: { name: '月光麦', good: 'moonwheat', slot: 'W', sow: [23, 27], hv: 32, y: 40, rep: 0.60, fd: -30, cl: ['mild', 'cool', 'cold', 'hot'], no: [], look: 'moonwheat', kind: 'grain', magic: 'ley', glow: '#a8c8ff' },
  frostberry: { name: '霜苺', good: 'frostberry', slot: 'S', sow: [30, 33], g: 7, y: 60, rep: 0.10, fd: -4, cl: ['cold', 'cool'], no: ['hot'], look: 'frostberry', kind: 'fruit', magic: 'snow', glow: '#ff6a7a', winter: true },
  dragonchili: { name: '竜舌唐辛子', good: 'dragonchili', slot: 'S', sow: [10, 13], g: 7, y: 70, rep: 0.15, fd: -6, cl: ['hot', 'mild', 'cool', 'cold'], no: [], look: 'dragonchili', kind: 'fruit', magic: 'fire', glow: '#ff5020' },
  spiritbean: { name: '精霊豆', good: 'spiritbean', slot: 'S', sow: [0, 3], g: 10, y: 120, rep: 0.20, fd: 15, cl: ['mild', 'cool', 'cold', 'hot'], no: [], look: 'spiritbean', kind: 'legume', magic: 'forest', glow: '#7affc8' },
  screamroot: { name: '叫び根', good: 'screamroot', slot: 'S', sow: [3, 7], g: 19, y: 10, rep: 0.50, fd: -10, cl: ['mild', 'cool', 'cold', 'hot'], no: [], look: 'screamroot', kind: 'root', magic: 'grave', glow: '#c070ff' },
  // 果樹・永年の作物（植えたまま。1年に1度実る。地域の特産）
  apple: { name: '林檎', good: 'apple', slot: 'P', hv: 22, y: 150, rep: 0, fd: -3, cl: ['mild', 'cool'], no: ['hot'], look: 'orchard', kind: 'tree' },
  grape: { name: '葡萄', good: 'grape', slot: 'P', hv: 23, y: 150, rep: 0, fd: -3, cl: ['mild', 'hot'], no: ['cold'], look: 'vine', kind: 'tree' },
  olive: { name: 'オリーブ', good: 'olive', slot: 'P', hv: 29, y: 100, rep: 0, fd: -2, cl: ['hot'], no: ['cold', 'cool'], look: 'olive', kind: 'tree' },
  date: { name: '棗椰子', good: 'date', slot: 'P', hv: 21, y: 120, rep: 0, fd: -2, cl: ['hot'], no: ['cold', 'cool', 'mild'], look: 'palm', kind: 'tree' },
  chestnut: { name: '栗', good: 'chestnut', slot: 'P', hv: 24, y: 80, rep: 0, fd: -2, cl: ['mild', 'cool'], no: ['hot'], look: 'orchard', kind: 'tree' },
  hops: { name: 'ホップ', good: 'hops', slot: 'P', hv: 21, y: 30, rep: 0, fd: -4, cl: ['mild', 'cool'], no: ['hot'], look: 'hops', kind: 'tree' },
  sugarcane: { name: '砂糖黍', good: 'sugarcane', slot: 'P', hv: 31, y: 350, rep: 0, fd: -8, cl: ['hot'], no: ['cold', 'cool', 'mild'], look: 'cane', kind: 'tree' },
};
for (const [id, c] of Object.entries(CROPS)) c.id = id;
const SLOT_CROPS = {};
for (const c of Object.values(CROPS)) (SLOT_CROPS[c.slot] = SLOT_CROPS[c.slot] || []).push(c);
export const ROTATIONS = {
  three: { name: '三圃制', seq: ['W', 'S', 'F'] },
  two: { name: '二圃制', seq: ['W', 'F'] },
  four: { name: '四圃輪作', seq: ['W', 'T', 'S', 'C'] },
  paddy: { name: '水田', seq: ['R'] },
  infield: { name: '王都の近郊の輪作（町の肥やしで休耕なし）', seq: ['W', 'S'] },
  orchard: { name: '果樹園', seq: ['P'] },
};
const SLOT_JP = { W: '秋まきの麦', S: '春まき・夏まき', T: '蕪', C: '牧草', F: '休耕', R: '稲', P: '果樹' };
const STAGE_JP = { rest: '次の作付けを待つ', fallow: '休ませている', plow: '耕す前', plowed: '耕して種まきを待つ', grow: '育っている', ripe: '実って刈り入れを待つ', stub: '刈ったあと' };
const MAGIC_JP = { ley: '遺跡や魔石の鉱脈・魔法の塔のそば', snow: '雪原の縁', fire: '荒れ地・溶岩・砂漠の縁', forest: '森を切り開いた畑', grave: '墓地や暗い森の縁' };
// 手間（仕事の量。eff×時間）
const WORK_PLOW = 1.4, WORK_SOW = 0.5, WORK_REAP = 2.2, WORK_SPREAD = 0.3;

// ---------------------------------------------------------------- 状態
function FS(sim) {
  const S = sim.S;
  if (!S.farm) S.farm = { v: 1, plots: {}, barn: {}, man: {}, ver: 0, stats: {} };
  const F = S.farm;
  F.plots = F.plots || {}; F.barn = F.barn || {}; F.man = F.man || {};
  F.stats = F.stats || {};
  const st = F.stats;
  st.harvest = st.harvest || {}; st.hs = st.hs || [{}, {}, {}, {}]; st.bySeason = st.bySeason || [0, 0, 0, 0]; st.mealsBySeason = st.mealsBySeason || [0, 0, 0, 0];
  for (const k of ['sown', 'plowed', 'reaped', 'lost', 'spread', 'released', 'soldDirect', 'soldGot', 'fed', 'magic', 'spoiled', 'faint']) st[k] = st[k] || 0;
  return F;
}
const now = (sim) => sim.S.t / 1440;
const doyOf = (d) => ((d % YEAR) + YEAR) % YEAR;
// いまから見た、次の（または開いている）窓の始まりと終わり（通しの日）
function windowAt(d, a, b) {
  const base = d - doyOf(d);
  for (const off of [-YEAR, 0, YEAR]) {
    const s = base + off + a, e = base + off + (b >= a ? b : b + YEAR) + 1;
    if (e > d) return { s, e };
  }
  return { s: base + YEAR + a, e: base + YEAR + b + 1 };
}
function harvestDay(c, sd) {
  if (c.hv != null) { let h = sd - doyOf(sd) + c.hv; while (h <= sd + 2) h += YEAR; return h; }
  return sd + c.g;
}

// ---------------------------------------------------------------- 土地を見る
function tileAt(w, x, z) { return x < 0 || z < 0 || x >= W || z >= H ? -1 : w.tiles[z * W + x]; }
function originOf(w, x, z) {
  let forest = 0, river = 0, snow = 0, desert = 0, sav = 0, swamp = 0, rock = 0;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const t = tileAt(w, x + dx, z + dz), d = Math.max(Math.abs(dx), Math.abs(dz));
    if (t === T.FOREST || t === T.DENSE || t === T.JUNGLE) { if (d <= 2) forest++; }
    else if (t === T.RIVER || t === T.BRIDGE) river++;
    else if (t === T.SWAMP) { swamp++; river++; }
    else if (t === T.SNOW) snow++;
    else if (t === T.DESERT) desert++;
    else if (t === T.SAVANNA) sav++;
    else if (t === T.ROCK || t === T.PEAK) rock++;
  }
  if (desert >= 8) return 'desert';
  if (snow >= 6 || rock >= 10) return 'edge';
  if (swamp >= 2) return 'wet';
  if (forest >= 5) return 'forest';
  if (river >= 1) return 'river';
  if (sav >= 8) return 'savanna';
  return 'grass';
}
const F0 = { river: 90, wet: 90, grass: 70, forest: 80, savanna: 55, edge: 45, desert: 30 };
const ORIGIN_JP = { river: '川のそばの草原', wet: '沼・川べり', grass: '草原', forest: '森を切り開いた畑', savanna: 'サバンナ', edge: '雪の縁・丘の斜面', desert: '砂漠の縁' };
// 魔法の作物が育つ場所か
function magicOk(sim, pl, kind) {
  if (pl.x == null) return false;
  const w = sim.S.world;
  const near = (types, r) => w.buildings.some((b) => b && types.includes(b.type) && Math.abs(b.x - pl.x) <= r && Math.abs(b.z - pl.z) <= r);
  const tiles = (set, r) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (set.has(tileAt(w, pl.x + dx, pl.z + dz))) return true; return false; };
  switch (kind) {
    case 'ley': return near(['ruins', 'mine', 'magictower', 'observatory', 'academy'], 8);
    case 'snow': return tiles(new Set([T.SNOW]), 8);
    case 'fire': return tiles(new Set([T.WASTE, T.LAVA, T.DESERT]), 8);
    case 'forest': return pl.org === 'forest';
    case 'grave': return near(['cemetery'], 6) || tiles(new Set([T.DENSE]), 3);
  }
  return false;
}
function suit(sim, pl, c) {
  const cl = climateOf(sim, pl.s);
  if (c.no.includes(cl)) return 0;
  if (pl.org === 'desert' && c.kind !== 'tree' && !['millet', 'sorghum', 'chickpea', 'lentil', 'onion', 'garlic', 'dragonchili', 'barley'].includes(c.id)) return 0;
  if (c.id === 'rice' && pl.org !== 'wet' && pl.org !== 'river') return 0;
  let m = c.cl.includes(cl) ? 1 : 0.6;
  if (c.id === 'rye' && (pl.org === 'edge' || pl.org === 'savanna')) m = Math.max(m, 1);
  if (c.id === 'spelt' && pl.org === 'edge') m = Math.max(m, 1);
  if (c.id === 'wheat' && (pl.org === 'edge' || pl.org === 'desert')) m *= 0.8;
  return m;
}
// 王都の近郊（城壁の内外の畑と、城壁の外の農家）：町の馬小屋・家畜市場のふんと下肥が集まり、休ませずに作り続けられる
export function isSuburb(sim, pl) { return sim.town(pl.s)?.type === 'capital'; }
function rotationOf(sim, pl) {
  if (pl.rot === 'orchard') return 'orchard';
  const s = sim.town(pl.s);
  const K = s && !s.indep && s.kingdom != null && s.kingdom >= 0 ? sim.S.kingdoms[s.kingdom] : null;
  if (pl.org === 'wet' && climateOf(sim, pl.s) === 'hot') return 'paddy';
  if (K?.techs?.includes('rotation')) return 'four';
  if (s?.type === 'capital') return 'infield';
  if (s && s.kingdom === 2 && !s.indep) return 'two';
  return 'three';
}

// ---------------------------------------------------------------- 作物を選ぶ（農夫の頭の中）
function townStock(sim, sid, g) {
  const C = cache(sim), key = sid + '|' + g;
  if (C.stock.has(key)) return C.stock.get(key);
  const F = FS(sim);
  let n = num(sim.S.towns[sid]?.stock?.[g]);
  for (const pl of Object.values(F.plots)) if (pl.s === sid && pl.c && CROPS[pl.c]?.good === g && (pl.st === 'grow' || pl.st === 'ripe' || pl.st === 'plowed' || pl.st === 'plow' || pl.st === 'rest')) n += CROPS[pl.c].y * YIELD_SCALE * 0.8 * unitMul(CROPS[pl.c]);
  for (const [hid, b] of Object.entries(F.barn)) if (b[g] && sim.S.households[hid]?.s === sid) n += b[g] * 0.5;
  C.stock.set(key, n);
  return n;
}
function townPop(sim, sid) {
  const C = cache(sim);
  if (!C.pop.size) for (const p of sim.living()) C.pop.set(p.s, (C.pop.get(p.s) || 0) + 1);
  return C.pop.get(sid) || 0;
}
function chooseCrop(sim, pl, slot, salt = 0, maxWait = 1e9) {
  const d = now(sim), F = FS(sim);
  const s = sim.town(pl.s), rg = s ? REGIONS[s.region] : null, m = sim.S.towns[pl.s];
  const hhPlots = pl.o != null ? plotsOf(sim, pl.o) : [];
  const hasMagic = hhPlots.some((q) => q !== pl && q.c && CROPS[q.c]?.magic);
  const pop = Math.max(10, townPop(sim, pl.s));
  let best = null, bs = 0;
  for (const c of SLOT_CROPS[slot] || []) {
    const su = suit(sim, pl, c); if (su <= 0) continue;
    if (c.magic && (hasMagic || !magicOk(sim, pl, c.magic))) continue;
    const G = gd(c.good); if (!G) continue;
    let sc = c.y * su * (c.w ?? 1) * (rg?.crops?.[c.id] ?? 1);
    if (c.magic) sc = 180;   // 育つ場所なら、1軒に1区画は植えてみる
    // 値段：高い作物を少し多めに
    const pr = num(m?.price?.[c.good]) || G.base;
    sc *= clamp(pr / Math.max(0.05, G.base), 0.6, 1.8);
    // 作りすぎない：町の在庫と育てている分が多い作物は選ばない
    // （小麦は主食なので、よほど余っていなければ選ぶ。ほかの穀物と豆は食べる量で、野菜は市場の目安で比べる）
    const have = townStock(sim, pl.s, c.good);
    if (c.good === 'wheat') { if (have > pop * 80 + 600) continue; sc *= 1.6; }
    else if (unitMul(c) > 1) { if (have * G.meals > pop * 10 + 150) continue; }
    else if (have > Math.max(G.target * 1.5, 30) + c.y * YIELD_SCALE * 1.2) continue;
    // 連作の害
    if (pl.last === c.id) sc *= 1 - c.rep * Math.min(2, (pl.rep || 0) + 1);
    // 待つ日数が長い作物は少し下げる
    if (c.sow) { const wdw = windowAt(d, c.sow[0], c.sow[1]); if (wdw.s - d > maxWait) continue; sc *= 1 - clamp((wdw.s - d) / 70, 0, 0.6); }
    sc *= 0.8 + 0.4 * hash((pl.k | 0) * 31 + Math.floor(d) * 7 + salt + c.y);
    if (sc > bs) { bs = sc; best = c; }
  }
  // 決めた分を、今日の町の見込みに足しておく（同じ日にほかの区画が同じ作物ばかり選ばないように）
  if (best) { const C = cache(sim), key = pl.s + '|' + best.good; if (C.stock.has(key)) C.stock.set(key, C.stock.get(key) + best.y * YIELD_SCALE * 0.8 * unitMul(best)); }
  return best;
}

// ---------------------------------------------------------------- 区画を作る・持ち主を決める
function mkPlot(sim, k, x, z, sid) {
  const w = sim.S.world;
  const org = x != null ? originOf(w, x, z) : 'grass';
  return { k, x, z, s: sid, o: null, f: F0[org] ?? 70, org, c: null, st: 'rest', sd: 0, hd: 0, care: 0, pw: 0, sw: 0, rp: 0, fe: 0, last: null, rep: 0, rs: 0, rot: null, cl: org === 'forest' ? now(sim) : null, hist: [] };
}
export function plotsOf(sim, hid) {
  const F = FS(sim), C = cache(sim);
  if (!C.by || C.byVer !== F.ver) {
    C.by = {}; C.byVer = F.ver;
    for (const pl of Object.values(F.plots)) if (pl.o != null) (C.by[pl.o] = C.by[pl.o] || []).push(pl);
  }
  return C.by[hid] || [];
}
function farmerHhs(sim) {
  const S = sim.S, by = {};
  for (const p of sim.living()) {
    if (p.job !== 'farmer' || sim.ageOf(p) < 14) continue;
    const hh = sim.hh(p); if (!hh || hh.bandits) continue;
    const s = sim.town(hh.s); if (!s || s.tribal) continue;
    (by[hh.s] = by[hh.s] || new Set()).add(hh.id);
  }
  void S;
  return by;
}
function syncPlots(sim, fresh) {
  const S = sim.S, F = FS(sim), w = S.world;
  let changed = false;
  // 畑のマス → 区画
  const seen = new Set();
  for (const f of w.fields || []) {
    const k = f.z * W + f.x;
    if (w.tiles[k] !== T.FIELD) continue;
    seen.add(String(k));
    if (!F.plots[k]) { F.plots[k] = mkPlot(sim, k, f.x, f.z, f.s); F.plots[k].fresh = fresh ? 1 : 0; if (f.farm != null) F.plots[k].farm = f.farm; changed = true; }
  }
  for (const k of Object.keys(F.plots)) if (!k.startsWith('v') && !seen.has(k)) { delete F.plots[k]; changed = true; }   // 家や道になった
  // 持ち主：町の農夫の家に、区画の少ない家から順に割り当てる
  const by = farmerHhs(sim);
  const count = {};
  for (const pl of Object.values(F.plots)) if (pl.o != null) count[pl.o] = (count[pl.o] || 0) + 1;
  for (const pl of Object.values(F.plots)) {
    const set = by[pl.s];
    if (pl.o != null && set?.has(pl.o)) continue;
    if (pl.k && String(pl.k).startsWith('v')) { if (pl.o != null && !set?.has(pl.o)) { delete F.plots[pl.k]; changed = true; } continue; }
    const prev = pl.o;
    if (prev != null) count[prev] = (count[prev] || 1) - 1;
    pl.o = null;
    if (set && set.size && pl.farm != null && set.has(pl.farm)) { pl.o = pl.farm; count[pl.o] = (count[pl.o] || 0) + 1; if (pl.o !== prev) changed = true; continue; }   // 城壁の外の農家の畑は、その家のもの
    if (set && set.size) {
      let bh = null, bn = 1e9;
      for (const hid of set) { const n = count[hid] || 0; if (n < bn || (n === bn && hid < bh)) { bn = n; bh = hid; } }
      pl.o = bh; count[bh] = (count[bh] || 0) + 1;
    }
    if (pl.o !== prev) changed = true;
  }
  // 畑のマスが1つもない農夫の家：家の裏の畑（見えない区画）を4つ
  for (const [sidS, set] of Object.entries(by)) for (const hid of set) {
    if ((count[hid] || 0) > 0) continue;
    for (let i = 0; i < 4; i++) { const k = `v${hid}_${i}`; F.plots[k] = mkPlot(sim, k, null, null, +sidS); F.plots[k].o = hid; F.plots[k].fresh = fresh ? 1 : 0; }
    count[hid] = 4; changed = true;
  }
  // 果樹園：特産のある地域では、1軒に1区画だけ果樹・永年の作物にする（新しく作った区画だけ）
  for (const pl of Object.values(F.plots)) {
    if (!pl.fresh) continue;
    delete pl.fresh;
    const s = sim.town(pl.s), rg = s ? REGIONS[s.region] : null;
    if (pl.o != null && rg?.perennial?.length && pl.x != null && !plotsOf2(F, pl.o).some((q) => q.rot === 'orchard')) {
      const opts = rg.perennial.map((id) => CROPS[id]).filter((c) => c && suit(sim, pl, c) > 0);
      if (opts.length && hash(pl.k * 13 + 5) < 0.55) {
        const c = opts[Math.floor(hash(pl.k * 17 + 3) * opts.length)];
        pl.rot = 'orchard'; pl.c = c.id; pl.st = 'grow'; pl.sd = now(sim) - 200; pl.hd = harvestDay(c, now(sim) - 1); pl.care = 9;
        continue;
      }
    }
    initPlot(sim, pl);
  }
  if (changed) F.ver++;
}
function plotsOf2(F, hid) { const out = []; for (const pl of Object.values(F.plots)) if (pl.o === hid) out.push(pl); return out; }
// はじめの状態：輪作のどこにいるかを区画ごとにずらし、今日の日付に合わせて「いま育っている／待っている」を決める
function initPlot(sim, pl) {
  const d = now(sim);
  const rot = ROTATIONS[rotationOf(sim, pl)];
  pl.rs = Math.floor(hash((typeof pl.k === 'number' ? pl.k : pl.k.length * 977 + (pl.o || 0)) * 7 + 11) * rot.seq.length);
  const slot = rot.seq[pl.rs];
  if (slot === 'F') { pl.st = 'fallow'; pl.fs = d - 5; pl.c = null; return; }
  const c = chooseCrop(sim, pl, slot, 1);
  if (!c) { pl.st = 'fallow'; pl.fs = d - 5; return; }
  pl.c = c.id;
  // 去年の窓でまいていたら、今も育っているか
  const w0 = windowAt(d - YEAR, c.sow ? c.sow[0] : 0, c.sow ? c.sow[1] : 0);
  const sd = w0.s + (w0.e - w0.s) * 0.5;
  const hd = harvestDay(c, sd);
  if (sd <= d && hd > d) { pl.st = 'grow'; pl.sd = sd; pl.hd = hd; pl.care = (d - sd) * 0.12; pl.pw = 1; pl.sw = 1; }
  else { pl.st = 'rest'; pl.pw = 0; pl.sw = 0; }
}

// ---------------------------------------------------------------- はじめに
export function ensureFarming(sim, fresh = false) {
  const S = sim.S;
  const first = !S.farm;
  const F = FS(sim);
  syncPlots(sim, true);
  if (first) seedBarns(sim);   // 去年の蓄え（新しい世界・この仕組みの前の古いセーブ）
  MATTER_HOOK.gatherFilter = gatherFilter;
  sim._farm = { place: farmPlace, tileHtml: farmTileHtml, plotAt, CROPS, stage: plotLook, ver: () => F.ver };
  void fresh;
}
// 去年の秋までにとれた麦の残り：次の麦の刈り入れまで食べつなげるだけ
function seedBarns(sim) {
  const F = FS(sim), d = now(sim);
  const remain = ((15 - doyOf(d)) + YEAR) % YEAR / YEAR;
  for (const [hid, list] of Object.entries(groupByOwner(F))) {
    const b = F.barn[hid] = F.barn[hid] || {};
    const n = list.length;
    const sub = list.some((pl) => isSuburb(sim, pl)) ? 1.6 : 1;   // 王都の近郊は休耕なしで肥えている（去年の実りも多い）
    b.wheat = num(b.wheat) + n * 150 * YIELD_SCALE * remain * sub;
    const sp = {};
    for (const pl of list) { const c = CROPS[pl.c]; if (c && c.kind === 'grain' && c.good !== 'wheat' && !c.magic) sp[c.good] = (sp[c.good] || 0) + 1; }
    for (const [g, k] of Object.entries(sp)) b[g] = num(b[g]) + k * 60 * remain;
  }
}
function groupByOwner(F) { const by = {}; for (const pl of Object.values(F.plots)) if (pl.o != null) (by[pl.o] = by[pl.o] || []).push(pl); return by; }
export function plotAt(sim, x, z) { return sim.S.farm?.plots?.[z * W + x] || null; }

// ---------------------------------------------------------------- 毎日：育つ・実る・次の作付けを決める・地力・納屋から出す
export function farmingDaily(sim) {
  const S = sim.S, F = FS(sim), d = now(sim);
  syncPlots(sim, false);
  const grazers = grazersByHh(sim);
  let changed = false;
  for (const pl of Object.values(F.plots)) {
    pl.sub = isSuburb(sim, pl) ? 1 : 0;
    // 持ち主のいない畑（農夫のいない港町など）は、町の共有地として休ませ、草を生やしておく
    if (pl.o == null && pl.st !== 'fallow' && pl.st !== 'ripe') { pl.st = 'fallow'; pl.c = null; pl.fs = d; }
    const c = pl.c ? CROPS[pl.c] : null;
    // 地力が戻る
    // （やせた土ほど早く戻り、肥えた土はそれ以上あまり肥えない）
    const room = clamp(1 - pl.f / 115, 0, 1);
    if (pl.st === 'fallow') pl.f += (1 + (grazers[pl.o] ? 0.6 : 0)) * room * 1.4;
    else if (pl.st === 'rest' || pl.st === 'stub' || pl.st === 'plow') pl.f += 0.5 * room;
    pl.f = clamp(pl.f, 0, 120);
    pl.gz = pl.st === 'fallow' && !!grazers[pl.o];
    if (pl.st === 'stub' && d - (pl.ht || 0) > 2) { advanceSlot(sim, pl); changed = true; continue; }
    if (pl.st === 'grow' && c && d >= pl.hd) { pl.st = 'ripe'; pl.rd = d; pl.rp = 0; changed = true; continue; }
    if (pl.st === 'ripe') {
      // 冬は麦を刈らない：冬の作物でないのに冬まで残った実りは、雪で倒れてだめになる
      if (sim.seasonIdx() === 3 && c && !c.winter && !c.magic && c.kind !== 'tree') { finishHarvest(sim, pl, null); changed = true; continue; }
      // 刈り入れが遅れると、鳥や雨で実りが減る
      const late = d - (pl.rd || d);
      if (late > 6) { pl.loss = Math.min(1, (pl.loss || 0) + 0.12); if (late > 12 || pl.o == null) { finishHarvest(sim, pl, null); changed = true; } }
      continue;
    }
    if (pl.st === 'fallow') {
      const rot = ROTATIONS[rotationOf(sim, pl)];
      const next = rot.seq[(pl.rs + 1) % rot.seq.length];
      const nc = chooseCrop(sim, pl, next);
      if (nc && nc.sow) { const wdw = windowAt(d, nc.sow[0], nc.sow[1]); if (wdw.s - d <= 4 && d - (pl.fs || 0) >= 12) { pl.rs = (pl.rs + 1) % rot.seq.length; pl.c = nc.id; pl.st = 'plow'; pl.pw = 0; pl.sw = 0; pl.fe = 0; changed = true; } }
      continue;
    }
    if ((pl.st === 'rest' || pl.st === 'plow' || pl.st === 'plowed') && c) {
      if (!c.sow) continue;
      const wdw = windowAt(d, c.sow[0], c.sow[1]);
      if (pl.st === 'rest' && wdw.s - d <= 4) { pl.st = 'plow'; pl.pw = 0; changed = true; }
      // 窓が閉じてもまけなかった：この組はあきらめて休ませる
      if ((pl.st === 'plow' || pl.st === 'plowed') && wdw.s > d + 8) {
        // まき時に間に合わなかった：同じ組で、これからまける作物（夏まきの蕎麦・蕪など）に替える。なければ休ませる
        F.stats.missed = num(F.stats.missed) + 1;
        const slot = ROTATIONS[rotationOf(sim, pl)].seq[pl.rs || 0];
        const alt = slot && slot !== 'F' && slot !== 'P' ? chooseCrop(sim, pl, slot, 7, 16) : null;
        if (alt && alt.id !== pl.c) { pl.c = alt.id; pl.st = 'rest'; pl.pw = 0; pl.sw = 0; } else advanceSlot(sim, pl);
        changed = true;
      }
      continue;
    }
    if (pl.st === 'rest' && !c) { advanceSlot(sim, pl); changed = true; }
  }
  // 肥やし：家畜のふん（冬は小屋に集まる）と、買った肥やし（matter.js の fertUntil）
  for (const [hid, n] of Object.entries(grazers)) {
    const si = sim.seasonIdx();
    F.man[hid] = clamp(num(F.man[hid]) + n.load * (si === 3 ? 1 : 0.4), 0, 30);
  }
  const byOwner = groupByOwner(F);
  for (const [hid, list] of Object.entries(byOwner)) {
    const hh = S.households[hid]; if (!hh) continue;
    // 王都の近郊の農家は、町の馬小屋・家畜市場のふんと下肥を荷車で運んでくる（品物の出どころは町の家畜。お金は動かない）
    const sub = list.filter((pl) => isSuburb(sim, pl)).length;
    if (sub) { const add = Math.min(30 - num(F.man[hid]), sub * 0.35); if (add > 0) { F.man[hid] = num(F.man[hid]) + add; F.stats.townManure = num(F.stats.townManure) + add; } }
    if ((hh.fertUntil ?? -1) >= sim.today && hh._fertUsed !== hh.fertUntil) { hh._fertUsed = hh.fertUntil; F.man[hid] = clamp(num(F.man[hid]) + 1.5, 0, 30); }
  }
  releaseBarns(sim);
  // 地力の平均などの記録
  let fs = 0, fn = 0; for (const pl of Object.values(F.plots)) if (pl.x != null) { fs += pl.f; fn++; }
  F.stats.fertAvg = fn ? fs / fn : 0;
  F.ver++;   // 育ち具合の見た目は毎日少し変わる（描き直しの合図）
  void changed;
}
function grazersByHh(sim) {
  const out = {};
  const LOAD = { cow: 0.5, horse: 0.5, ox: 0.5, pig: 0.25, sheep: 0.1, goat: 0.1, chicken: 0.03, duck: 0.03, camel: 0.3, donkey: 0.3, reindeer: 0.2 };
  for (const c of Object.values(sim.S.creatures)) {
    if (c.keeper == null || !(c.hp > 0) || !LOAD[c.sp]) continue;
    const o = out[c.keeper] = out[c.keeper] || { load: 0, graze: 0, draft: 0 };
    o.load += LOAD[c.sp];
    if (['cow', 'sheep', 'goat', 'horse', 'ox', 'camel', 'donkey'].includes(c.sp)) o.graze++;
    if (['cow', 'horse', 'ox', 'donkey', 'camel'].includes(c.sp) && !c.juv) o.draft++;
  }
  for (const k of Object.keys(out)) if (!out[k].graze) { const l = out[k].load; delete out[k]; out[k] = { load: l, graze: 0, draft: 0, none: true }; }
  return out;
}
function hasDraft(sim, hid) {
  const C = cache(sim);
  if (!C.dr) { const g = grazersByHh(sim); C.dr = {}; for (const [k, v] of Object.entries(g)) if (v.draft) C.dr[k] = 1; }
  return !!C.dr[hid];
}
// 次の組へ進む
function advanceSlot(sim, pl) {
  const d = now(sim);
  if (pl.rot === 'orchard') { const c = CROPS[pl.c]; pl.st = 'grow'; pl.sd = d; pl.hd = harvestDay(c, d); pl.care = 0; pl.loss = 0; return; }
  const rot = ROTATIONS[rotationOf(sim, pl)];
  pl.rs = ((pl.rs || 0) + 1) % rot.seq.length;
  const slot = rot.seq[pl.rs];
  pl.pw = 0; pl.sw = 0; pl.rp = 0; pl.care = 0; pl.fe = 0; pl.loss = 0;
  if (slot === 'F') { pl.st = 'fallow'; pl.fs = d; pl.c = null; return; }
  const c = chooseCrop(sim, pl, slot);
  if (!c) { pl.st = 'fallow'; pl.fs = d; pl.c = null; return; }
  pl.c = c.id; pl.st = 'rest';
}

// ---------------------------------------------------------------- 農夫の仕事
function taskOf(sim, pl, d) {
  const c = pl.c ? CROPS[pl.c] : null;
  if (pl.st === 'ripe') return 'reap';
  if (pl.st === 'plowed' && c?.sow) { const wdw = windowAt(d, c.sow[0], c.sow[1]); if (wdw.s <= d) return 'sow'; }
  if (pl.st === 'plow') return 'plow';
  if ((pl.st === 'plow' || pl.st === 'plowed') && (pl.fe || 0) < 3) return 'spread';
  if (pl.st === 'grow' && c && pl.care < need(pl, c)) return 'tend';
  return null;
}
const need = (pl, c) => (c.g || 12) * 0.12 * (pl.sub ? 2 : 1);   // 王都の近郊は菜園のように手をかける（世話の目安が2倍）
const PRI = { reap: 5, sow: 4, plow: 3, spread: 2, tend: 1 };
function pickTask(sim, hid, d, man) {
  let best = null, bp = 0;
  for (const pl of plotsOf(sim, hid)) {
    let t = taskOf(sim, pl, d);
    if (t === 'spread' && man < 1) t = null;
    if (!t) continue;
    let pr = PRI[t] + (pl.x != null ? 0.1 : 0) - (typeof pl.k === 'number' ? (pl.k % 97) / 1e4 : 0);
    if (t === 'plow' && pl.c) { const c = CROPS[pl.c]; if (c?.sow) { const wdw = windowAt(d, c.sow[0], c.sow[1]); pr += wdw.s <= d ? 0.5 : 0; } }
    if (pr > bp) { bp = pr; best = { pl, t }; }
  }
  return best;
}
export function farmWork(sim, p, dt, eff, hh) {
  const S = sim.S, F = S.farm;
  if (!F || !hh) return false;
  const list = plotsOf(sim, hh.id);
  if (!list.length) return false;
  // 家の食べ物が足りなければ、蔵の麦を食べる（今までどおり。水車でひく16分の1は粉屋へ）
  if (hh.food < hh.members.length * 3) {
    const b = F.barn[hh.id] || {};
    const want = hh.members.length * 3 - hh.food;
    const from = num(b.wheat) >= 1 ? b : null;
    if (from) { const q = Math.min(want, from.wheat, 6); from.wheat -= q; const q2 = millToll(sim, p.s, q, hh); hh.food += q2; meal(sim, 'self', q2); F.stats.fed += q2; }
  }
  if (p.fwStun && S.t < p.fwStun) return true;   // 叫び根の叫びで気を失っている
  p.fwAcc = num(p.fwAcc) + eff;
  if (p.fwAcc < 0.25) return true;
  let work = p.fwAcc; p.fwAcc = 0;
  const d = now(sim);
  // いま立っている区画が自分の家のものなら、そこを先に
  let tk = null;
  const here = F.plots[Math.round(p.pos.z) * W + Math.round(p.pos.x)];
  if (here && here.o === hh.id) { const t = taskOf(sim, here, d); if (t && (t !== 'spread' || num(F.man[hh.id]) >= 1)) tk = { pl: here, t }; }
  const other = pickTask(sim, hh.id, d, num(F.man[hh.id]));
  if (!tk || (other && PRI[other.t] > PRI[tk.t] + 1)) tk = other;
  if (!tk) {
    // 手の空いた日：冬は脱穀と道具の手入れ、ほかは見回り（見た目だけ）
    p.farmTask = sim.seasonIdx() === 3 ? (hash(p.id * 7 + Math.floor(d * 3)) < 0.6 ? 'thresh' : 'haulman') : 'weed';
    p.farmTaskT = S.t; p.farmPlot = null;
    return true;
  }
  const { pl, t } = tk;
  const c = pl.c ? CROPS[pl.c] : null;
  p.farmPlot = pl.k; p.farmTaskT = S.t;
  switch (t) {
    case 'plow': {
      const sp = hasDraft(sim, hh.id) ? 2 : 1;   // 牛か馬がいると2倍速い
      pl.pw += work * sp / WORK_PLOW;
      p.farmTask = sp > 1 ? 'plowox' : 'plow';
      if (pl.pw >= 1) { pl.pw = 1; pl.st = 'plowed'; F.stats.plowed++; F.ver++; }
      break;
    }
    case 'sow': {
      pl.sw += work / WORK_SOW; p.farmTask = 'sow';
      if (pl.sw >= 1) { pl.sw = 1; pl.st = 'grow'; pl.sd = d; pl.hd = harvestDay(c, d); pl.care = 0; F.stats.sown++; F.ver++; pl.seeder = p.id; }
      break;
    }
    case 'spread': {
      const loads = Math.min(num(F.man[hh.id]), Math.max(1, Math.round(work / WORK_SPREAD)), 3 - (pl.fe || 0));
      if (loads >= 1) { F.man[hh.id] -= loads; pl.fe = (pl.fe || 0) + loads; pl.f = clamp(pl.f + 4 * loads * clamp(1.6 - pl.f / 80, 0.25, 1), 0, 120); F.stats.spread += loads; }   // 1荷＋4（肥えた土では効きが小さい）
      p.farmTask = 'spread';
      break;
    }
    case 'tend': {
      pl.care += work;
      p.farmTask = sim.seasonIdx() === 1 && hash(p.id + Math.floor(d * 4)) < 0.45 ? 'water' : 'weed';
      break;
    }
    case 'reap': {
      const part = Math.min(1 - pl.rp, work / WORK_REAP);
      p.farmTask = (pl.rp % 0.34) > 0.22 ? 'haul' : 'reap';
      pl.rp += part;
      reapPart(sim, p, hh, pl, part);
      if (pl.rp >= 0.999) finishHarvest(sim, pl, p);
      break;
    }
  }
  return true;
}
// 収量（1回の刈り入れ全体）
export function expectedYield(sim, pl) {
  const c = pl.c ? CROPS[pl.c] : null; if (!c) return 0;
  const fe = clamp(0.3 + 0.7 * (pl.f / 70), 0.3, 1.4);
  const repM = pl.last === c.id ? Math.max(0.2, 1 - c.rep * Math.min(2, (pl.rep || 0) + 1)) : 1;
  const su = Math.max(0.6, suit(sim, pl, c) || 0.6);
  const careM = c.kind === 'tree' ? 1 : 0.8 + (pl.sub ? 0.45 : 0.2) * Math.min(1, pl.care / need(pl, c));   // 近郊は手をかけた分だけ最大1.25倍
  const stump = pl.org === 'forest' && pl.cl != null && now(sim) - pl.cl < 80 ? 0.8 : 1;   // 切り株が残る最初の2年
  const wx = harvestMul(sim, pl.s) * num(sim.S.harvest || 1);
  return c.y * YIELD_SCALE * fe * repM * su * careM * stump * wx * (1 - (pl.loss || 0));
}
function reapPart(sim, p, hh, pl, part) {
  const F = FS(sim), c = CROPS[pl.c]; if (!c) return;
  if (pl.yTot == null) pl.yTot = expectedYield(sim, pl);
  const um = unitMul(c);
  let q = pl.yTot * part * um;
  if (!(q > 0)) return;
  const owner = sim.S.households[pl.o] || hh;
  // 小作の小麦は3割を地主へ（property.js）
  if (c.good === 'wheat' && owner === hh) q = fieldShare(sim, p, q);
  const b = F.barn[owner.id] = F.barn[owner.id] || {};
  b[c.good] = num(b[c.good]) + q;
  if (c.straw) b.straw = num(b.straw) + pl.yTot * part * c.straw;
  const st = F.stats;
  st.harvest[c.good] = num(st.harvest[c.good]) + q;
  const si = sim.seasonIdx();
  st.bySeason[si] += q / um; st.mealsBySeason[si] += q * (gd(c.good)?.meals || 0);
  st.hs[si][c.good] = num(st.hs[si][c.good]) + q;   // 季節ごと・作物ごと
  st.bySid = st.bySid || {}; st.bySid[pl.s] = num(st.bySid[pl.s]) + q * (gd(c.good)?.meals || 0);   // 町ごとの収穫（食数）
  if (c.magic) st.magic += q;
  // 叫び根：抜く人は耳栓がないと気を失う
  if (c.id === 'screamroot' && sim.rng.chance(0.35) && !(hh.stock?.earplug > 0)) {
    p.fwStun = sim.S.t + 90; st.faint++;
    sim.remember(p, '叫び根を引き抜いたら、耳をつんざく叫び声で気を失った', { emo: -0.5, imp: 0.6, k: 'work' });
  }
}
function finishHarvest(sim, pl, p) {
  const F = FS(sim), c = CROPS[pl.c], d = now(sim);
  if (!c) { advanceSlot(sim, pl); return; }
  const got = (pl.yTot || 0) * (pl.rp || 0);
  if (pl.rp < 1 && pl.yTot) F.stats.lost += pl.yTot * (1 - pl.rp);
  // 地力と連作
  pl.f = clamp(pl.f + c.fd * (pl.rp > 0 ? 1 : 0.5), 0, 120);
  if (pl.last === c.id) pl.rep = (pl.rep || 0) + 1; else pl.rep = 0;
  pl.last = c.id;
  pl.hist = [{ c: c.id, d: Math.floor(d), y: Math.round(got) }, ...(pl.hist || [])].slice(0, 4);
  pl.ht = d; pl.yTot = null; pl.rp = 0; pl.loss = 0;
  F.stats.reaped++;
  if (p && got > 0) {
    const s = sim.town(pl.s);
    if (sim.rng.chance(0.5)) sim.remember(p, `${s?.name || ''}の畑で${c.name}を刈り入れた（${Math.round(got)}${c.kind === 'tree' ? '' : '袋'}）${c.magic ? '。ほのかに光っていた' : ''}`, { emo: 0.45, imp: c.magic ? 0.6 : 0.3, k: 'work' });
  }
  if (pl.rot === 'orchard') { advanceSlot(sim, pl); pl.st = 'grow'; F.ver++; return; }
  pl.st = 'stub';
  F.ver++;
}

// ---------------------------------------------------------------- 納屋 → 家の蔵・市場
function releaseBarns(sim) {
  const S = sim.S, F = FS(sim), d = now(sim);
  for (const [hid, b] of Object.entries(F.barn)) {
    const hh = S.households[hid];
    if (!hh || !hh.members?.length) { if (!hh) delete F.barn[hid]; continue; }
    const iceM = sim._rg?.iceMul ? sim._rg.iceMul(sim, hh.s) : 1;
    const st = hh.stock || (hh.stock = {});
    for (const g of Object.keys(b)) {
      let n = num(b[g]); if (n < 0.01) { delete b[g]; continue; }
      const G = gd(g); if (!G) { delete b[g]; continue; }
      const keep = G.keep || 365;
      // 納屋でも少しずつ傷む（氷室のある町はゆっくり）
      const sp = n / (keep * 2 * iceM);
      n -= sp; F.stats.spoiled += sp;
      // 出す量：日持ちする物は次の刈り入れまで食べつなぐ。傷みやすい物は早めに
      let D;
      if (keep >= 120) { let nx = 25; for (const pl of plotsOf(sim, +hid)) if (pl.c && CROPS[pl.c]?.good === g && (pl.st === 'grow' || pl.st === 'ripe')) nx = Math.min(nx, Math.max(0, pl.hd - d)); D = clamp(nx + 4, 5, 40); }
      else D = clamp(keep / 5, 2, 8);
      let out = n <= 1 ? n : n / D;
      const capHome = GOODS[g] ? 80 : 20;
      const room = Math.max(0, capHome - num(st[g]));
      const toHome = Math.min(out, room);
      if (toHome > 0) { stash(sim, hh, g, toHome); n -= toHome; out -= toHome; F.stats.released += toHome; }
      // 家に入りきらない分は、その日のうちに町の商人へ売る（商人の家計 → この家の家計）
      if (out > 0.5 && hh.s != null) {
        const r = marketDeliver(sim, hh.s, g, out, hh);
        const sold = out - r.left;
        if (sold > 0) { n -= sold; F.stats.soldDirect += sold; F.stats.soldGot += r.got; }
      }
      b[g] = n;
      if (b[g] < 0.01) delete b[g];
    }
  }
}

// ---------------------------------------------------------------- 行き先（civic.js の 'field'）
function farmPlace(sim, p) {
  const F = sim.S.farm; if (!F) return null;
  const hh = sim.hh(p); if (!hh) return null;
  const tk = pickTask(sim, hh.id, now(sim), num(F.man[hh.id]));
  let pl = tk?.pl;
  if (!pl || pl.x == null) { const list = plotsOf(sim, hh.id).filter((q) => q.x != null); if (!list.length) return null; pl = list[Math.floor(sim.rng.next() * list.length)]; }
  return { x: pl.x, z: pl.z };
}

// ---------------------------------------------------------------- 農夫が畑で拾う物（matter.js）：植えている作物に合わせる
const BYP = {
  wheat: ['straw', 'ergot'], rye: ['rye_straw', 'ergot'], spelt: ['straw'], barley: ['straw'], oat: ['oat_straw'], rice: ['rice_straw'],
  pea: ['bean_stalks'], fava: ['bean_stalks'], lentil: ['bean_stalks'], chickpea: ['bean_stalks'], turnip: ['turnip_greens'], turnipT: ['turnip_greens'],
  cabbage: ['cabbage_leaves_outer'], wcabbage: ['cabbage_leaves_outer'], onion: ['onion_skin'], maize: ['corn_husk'], clover: ['clover', 'clover_seed', 'clover4'],
  flax: ['flax_seed'], hemp: ['hemp_seed'],
};
function gatherFilter(sim, p, list) {
  if (p.job !== 'farmer' || !sim.S.farm) return list;
  const hh = sim.hh(p); if (!hh) return list;
  const pls = plotsOf(sim, hh.id);
  if (!pls.length) return list;
  const ok = new Set();
  for (const pl of pls) {
    if (!pl.c) continue;
    if (pl.st === 'ripe' || pl.st === 'stub') for (const id of BYP[pl.c] || []) ok.add(id);
    if (pl.st === 'fallow') { ok.add('clover'); ok.add('fodder_grass'); }
  }
  return list.filter((x) => ok.has(x.id));
}

// ---------------------------------------------------------------- 見た目の段階（farmgfx.js が使う）
export function plotLook(sim, pl) {
  const d = now(sim);
  const c = pl.c ? CROPS[pl.c] : null;
  switch (pl.st) {
    case 'fallow': return { look: pl.gz ? 'graze' : 'fallow', stage: 0 };
    case 'rest': return { look: pl.ht && d - pl.ht < 12 ? 'stubble' : 'fallow', stage: 0 };
    case 'stub': return { look: 'stubble', stage: d - (pl.ht || d) < 3 ? 1 : 0 };
    case 'plow': return { look: pl.pw > 0.5 ? 'furrow' : 'fallow', stage: 0 };
    case 'plowed': return { look: pl.sw > 0.3 ? 'seeded' : 'furrow', stage: 0 };
    case 'grow': {
      if (!c) return { look: 'furrow', stage: 0 };
      if (pl.rot === 'orchard') return { look: c.look, stage: 2 };
      const fr = clamp((d - pl.sd) / Math.max(1, pl.hd - pl.sd), 0, 1);
      return { look: c.look, stage: fr < 0.12 ? 0 : fr < 0.55 ? 1 : 2 };
    }
    case 'ripe': return { look: c ? c.look : 'stubble', stage: 3, rp: pl.rp };
  }
  return { look: 'fallow', stage: 0 };
}

// ---------------------------------------------------------------- 畑をクリックしたとき（ui.js）
function farmTileHtml(sim, x, z, esc) {
  const ice = sim._rg?.iceTile ? sim._rg.iceTile(sim, x, z, esc) : '';
  const pl = plotAt(sim, x, z); if (!pl) return ice;
  const S = sim.S, d = now(sim);
  const c = pl.c ? CROPS[pl.c] : null;
  const owner = pl.o != null ? S.households[pl.o] : null;
  const rot = ROTATIONS[rotationOf(sim, pl)];
  const s = sim.town(pl.s);
  let grow = '';
  if (pl.st === 'grow' && c) {
    const fr = clamp((d - pl.sd) / Math.max(1, pl.hd - pl.sd), 0, 1);
    const days = Math.max(0, pl.hd - d);
    grow = `<dt>育ち具合</dt><dd><div class="bar" style="display:inline-block;width:90px;vertical-align:middle"><i style="width:${Math.round(fr * 100)}%"></i></div> ${Math.round(fr * 100)}%（${pl.rot === 'orchard' ? '実るまで' : '刈り入れまで'}あと${days.toFixed(1)}日）</dd><dt>世話</dt><dd>${c.kind === 'tree' ? '—' : Math.round(Math.min(1, pl.care / need(pl, c)) * 100) + '%'}</dd>`;
  }
  if (pl.st === 'ripe') grow = `<dt>刈り入れ</dt><dd>${Math.round((pl.rp || 0) * 100)}%済み${pl.loss ? `（遅れて${Math.round(pl.loss * 100)}%傷んだ）` : ''}</dd>`;
  if ((pl.st === 'plow' || pl.st === 'plowed') && c?.sow) {
    const wdw = windowAt(d, c.sow[0], c.sow[1]);
    grow = `<dt>耕し</dt><dd>${Math.round(pl.pw * 100)}%</dd><dt>種まき</dt><dd>${wdw.s <= d ? 'いまがまき時' : `あと${(wdw.s - d).toFixed(1)}日でまき時`}${pl.sw > 0 ? `（${Math.round(pl.sw * 100)}%）` : ''}</dd><dt>肥やし</dt><dd>${pl.fe || 0}荷／3荷</dd>`;
  }
  const exp = c && (pl.st === 'grow' || pl.st === 'ripe' || pl.st === 'plowed' || pl.st === 'plow' || pl.st === 'rest') ? expectedYield(sim, pl) : 0;
  const G = c ? gd(c.good) : null;
  const price = c ? num(S.towns[pl.s]?.price?.[c.good]) || G?.base || 0 : 0;
  const fe = clamp(0.3 + 0.7 * (pl.f / 70), 0.3, 1.4);
  const hist = (pl.hist || []).map((h) => `${esc(CROPS[h.c]?.name || h.c)} ${h.y}`).join('、');
  const magic = c?.magic ? `<dt>魔法の作物</dt><dd>${esc(MAGIC_JP[c.magic])}でだけ育つ。夜はほのかに光る</dd>` : '';
  return `<div class="section"><h4>畑の区画</h4><dl class="kv">
    <dt>植えている物</dt><dd>${c ? esc(c.name) : 'なし'}（${esc(STAGE_JP[pl.st] || pl.st)}${pl.gz ? '・家畜を放している' : ''}）</dd>${magic}${grow}
    <dt>地力</dt><dd><div class="bar" style="display:inline-block;width:90px;vertical-align:middle"><i class="${pl.f < 35 ? 'low' : pl.f < 55 ? 'mid' : ''}" style="width:${Math.round(pl.f / 1.2)}%"></i></div> ${Math.round(pl.f)}（実りの効き×${fe.toFixed(2)}）</dd>
    ${exp > 0 ? `<dt>収穫の見込み</dt><dd>${Math.round(exp)}${c.kind === 'tree' ? '' : '袋'}（今の${esc(s?.name || '')}の相場で約${Math.round(exp * price)}銅貨）</dd>` : ''}
    <dt>輪作の型</dt><dd>${esc(rot.name)}：${rot.seq.map((x, i) => (i === (pl.rs || 0) % rot.seq.length ? `<b>${SLOT_JP[x]}</b>` : SLOT_JP[x])).join(' → ')}</dd>
    <dt>前の作物</dt><dd>${pl.last ? esc(CROPS[pl.last]?.name || pl.last) + (pl.rep ? `（${pl.rep + 1}回続けた：連作の害）` : '') : 'まだない'}</dd>
    <dt>土地</dt><dd>${esc(ORIGIN_JP[pl.org] || pl.org)}${pl.sub ? '（王都の近郊：町の肥やしで休ませず、手をかけて育てる）' : ''}</dd>
    ${sim._rg && s ? `<dt>地域の型</dt><dd>${esc(sim._rg.REGIONS[s.region]?.name || '')}（特産：${esc(sim._rg.REGIONS[s.region]?.note || '')}）</dd>` : ''}
    <dt>持ち主</dt><dd>${owner ? esc(owner.name) + (owner.land > 0 ? '（自作農）' : '（小作）') : '町の共有地（休ませている）'}</dd>
    ${hist ? `<dt>これまでの収穫</dt><dd>${hist}</dd>` : ''}
  </dl></div>` + ice;
}
