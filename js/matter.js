// 世界の物（5599種類）を、採る・作る・使う・売り買いする仕組み（経済部）
//
// 物の一覧は js/catalog/*.js（素材管理部）。決まりは docs/素材の決まり.md。
// ■ つなぎ方
//   今ある品（data.js の GOODS 20種・items.js の ITEMS 44種）は、今の仕組みのまま動く（農夫の麦・鍛冶屋の剣など）。
//   それ以外の物は、市場の在庫 m.stock・値段 m.price に「その町にある物だけ」入る（まばらに持つ）。
//   市場の売り買いは market.js の marketBuy / marketDeliver をそのまま使う（お金は取り引きでしか動かない）。
//   身につける物（武器・防具・盾・装身具・道具・頭・手・足）は、items.js の ITEMS に登録するので、
//   今の装備の仕組み（autoEquip・耐久・humanStats）がそのまま使える。袋や籠（bag）は持ち物の仕組み（carry.js）が扱う。
// ■ 採る（matterWork：仕事の1時間ごと）
//   仕事場の地形（森・川・岩山など）と職業の手に入れ方（chop・fish・mine・dig・gather・forage・harvest）から、
//   一覧の src に合う物を1つ選び、rate（1回あたりの平均の数）だけ手に入れて家の蔵へ（stash）。
//   狩り（hunt）は倒した獣・魔物の種族から部位ごとに（matterHunt）。家畜（milk）は飼い主の家に毎日（milkDaily）。
//   ダンジョン・遺跡・魔王城・ピラミッド（loot）は冒険者が探索に勝ったときに（matterLoot）。
//   遠い国の品（trade）は、港と王都の商人が外から仕入れる（代金は世界の外へ出る：帳簿に記録）。
//   有限度：vein（鉱脈）とgrove（林）は町のまわりごとに残りの量を持ち、採れば減り、少しずつ戻る。
//            relic（遺物）は世界に数えるほど。herd（群れ）は今いる生き物を狩ったときだけ。none は尽きない。
// ■ 作る（matterWork）
//   make.by の職業（新しい職業名は近い職業にまとめる：MAKER）が、材料を蔵か市場（持ち主から買う）から集めて作る。
//   ひとりが覚える作り方は数種類だけ（その町でよく売れる物を選び直す）。家の暮らしの品（household・cook）は家で作る。
// ■ 使う（2段階で選ぶ：まず種類、次にその町にある品の中から）
//   food：食べる（市場の買い物と自炊）／drink・luxury・hobby・collect：持つ・味わうと楽しみと名声／medicine：病とけが
//   wear・tool：装備する／build：家を直す／fuel：冬に燃やす／gift：贈ると好かれる／ritual：供えて祈る
//   feed：家畜の餌／fertilize：畑の肥やし／magic：学者と魔法使いの研究
// ■ 値段（matterPrices：毎日、町にある物だけ）
//   目安の値打ち v × 物価の水準 ×（在庫と需要）×（めずらしさで幅が広がる）× 季節 × 有限な物の残り
// ■ 図鑑：S.matter.seen に、世界で初めて手に入れた日を記録する
import { GOODS, JOBS, SPECIES, DAYS_PER_SEASON } from './data.js';
import { ITEMS, makeItem, addItem, autoEquip, carryHooks } from './items.js';
import { T, W, H, tileAt } from './world.js';
import { marketBuy, marketDeliver, ownStock, stash, personPayer, merchantsOf } from './market.js';
import { moneyOut, flow, meal } from './ledger.js';
import { spendable } from './property.js';
import { humanStats } from './society.js';
import { priceLevel } from './bank.js';
import C1 from './catalog/core.js';
import C2 from './catalog/earth.js';
import C3 from './catalog/plant.js';
import C4 from './catalog/plant2.js';
import C5 from './catalog/plant3.js';
import C6 from './catalog/plant4.js';
import C7 from './catalog/beast.js';
import C8 from './catalog/beast2.js';
import C9 from './catalog/food.js';
import C10 from './catalog/food2.js';
import C11 from './catalog/gear.js';
import C12 from './catalog/gear2.js';
import C13 from './catalog/gear3.js';
import C14 from './catalog/gear4.js';
import C15 from './catalog/gear5.js';
import C16 from './catalog/arcane.js';
import C17 from './catalog/arcane2.js';
import C18 from './catalog/arcane3.js';

// ---------- 一覧を読み込む（読み込んだとき一度だけ） ----------
export const MAT = new Map();
for (const list of [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18]) for (const it of list) if (!MAT.has(it.id)) MAT.set(it.id, it);
const LEGACY = new Set([...Object.keys(GOODS), ...Object.keys(ITEMS)]);   // 今の仕組みが作る品（ここでは作らない）
export const CAT_JP = { earth: '大地・鉱物', plant: '植物', beast: '動物・魔物', food: '食べ物・飲み物', gear: '道具・装備', arcane: '魔法・宝・趣味' };
export const HOW_JP = { dig: '掘る', mine: '採掘', chop: '木を切る', gather: '摘む・拾う', harvest: '畑で収穫', fish: '釣り・漁', hunt: '狩る', milk: '家畜から', craft: '作る', cook: '料理', brew: '醸す', loot: '宝箱・遺跡', trade: '遠い国の商人', forage: '野で探す' };
export const USE_JP = { craft: '材料', build: '建材', food: '食べる', drink: '飲む', fuel: '燃やす', medicine: '薬', magic: '魔法', trade: '売り物', luxury: 'ぜいたく品', hobby: '趣味', collect: '収集', ritual: '祈り・供え物', tool: '道具', wear: '装備', feed: '家畜の餌', fertilize: '肥やし', dye: '染め物', gift: '贈り物', quest: '依頼の品' };
export const ON_JP = { grass: '草原', forest: '森', dense: '深い森', jungle: 'ジャングル', savanna: 'サバンナ', desert: '砂漠', snow: '雪原', tundra: '凍土', swamp: '沼', beach: '浜', river: '川', lake: '湖', sea: '海', deep: '深い海', hill: '丘', mountain: '山', rock: '岩場', cave: '洞窟', volcano: '火山', field: '野', farm: '畑', town: '町', dungeon: 'ダンジョン', ruins: '遺跡', demoncastle: '魔王城', pyramid: 'ピラミッド', mine: '鉱山' };

// 新しい職業名は、今いる近い職業にまとめる（町の職人の数は、今の職業の割り当てのまま）
export const MAKER = {
  armorer: ['smith'], swordsmith: ['smith'], dwarf_smith: ['smith'], minter: ['smith'],
  wheelwright: ['carpenter'], cooper: ['carpenter'], luthier: ['carpenter'], toymaker: ['carpenter'], bowyer: ['carpenter'], fletcher: ['carpenter'],
  sculptor: ['mason'], lacquerer: ['jeweler'], hatter: ['tailor'], feltmaker: ['weaver'], elven_weaver: ['weaver'], basketweaver: ['weaver'], roper: ['weaver'],
  witch: ['alchemist'], enchanter: ['alchemist'], wandmaker: ['alchemist'], incense_maker: ['alchemist'], lich: ['alchemist'],
  courtmage: ['wizard', 'courtmage'], magister: ['wizard', 'magister'],
  leafcurer: ['herbalist'], doctor: ['herbalist', 'doctor'], midwife: ['herbalist', 'midwife'], nun: ['herbalist', 'nun'],
  leatherworker: ['cobbler'], tanner: ['cobbler'], saddler: ['cobbler'], furrier: ['cobbler', 'tailor'],
  cartographer: ['scribe'], papermaker: ['scribe'], bookbinder: ['scribe'], scholar: ['scribe', 'scholar'], teacher: ['scribe', 'teacher'],
  cook: ['cook', 'innkeeper'], confectioner: ['baker', 'cook'], cheesemaker: ['rancher', 'cook'],
  distiller: ['brewer', 'innkeeper'], vintner: ['brewer', 'innkeeper'], elf_brewer: ['brewer'], dwarf_distiller: ['brewer'],
  tribal_crafter: ['weaver', 'potter'], tribal_artisan: ['weaver', 'potter'], tribe_elder: ['shaman'],
  glassmaker: ['potter'], glassblower: ['potter'], chandler: ['priest', 'nun'], saltmaker: ['fisher'], dyer: ['tailor', 'weaver'],
};
function makersOf(by) { return MAKER[by] || (JOBS[by] ? [by] : []); }

// ---------- 索引（読み込んだとき一度だけ） ----------
const RARW = [1, 0.45, 0.15, 0.04, 0.008];                 // めずらしさごとの出やすさ
const SRC = new Map();                                     // 'how:on' → [{id, rate, w}]
const USE = new Map();                                     // use の k → [id]
const USESET = new Map();                                  // id → Set(k)
const RECIPES = new Map();                                 // 職業 → [id]
const HOUSE_RECIPES = [];                                  // 家で作る物（household・cook）
const TRADE_IDS = [];                                      // 遠い国から来る物
for (const it of MAT.values()) {
  const ks = new Set(it.use.map((u) => u.k));
  USESET.set(it.id, ks);
  for (const k of ks) (USE.get(k) || USE.set(k, []).get(k)).push(it.id);
  if (LEGACY.has(it.id)) continue;
  for (const s of it.src) {
    if (s.how === 'trade') { TRADE_IDS.push(it.id); continue; }
    for (const on of s.on || []) {
      const key = s.how + ':' + on;
      (SRC.get(key) || SRC.set(key, []).get(key)).push({ id: it.id, rate: s.rate || 0.1, w: (s.rate || 0.1) * RARW[it.rare || 0] });
    }
  }
  if (it.make && (it.make.by === 'household' || it.make.by === 'cook')) HOUSE_RECIPES.push(it.id);
}
// 職業ごとの作り方は、ほかのモジュールが職業を足し終えてから（はじめて使うとき）まとめる
let recipesReady = false;
function recipes() {
  if (recipesReady) return RECIPES;
  recipesReady = true;
  for (const it of MAT.values()) if (it.make && !LEGACY.has(it.id)) for (const j of makersOf(it.make.by)) (RECIPES.get(j) || RECIPES.set(j, []).get(j)).push(it.id);
  return RECIPES;
}
export const matter = (id) => MAT.get(id);
export const hasUse = (id, k) => !!USESET.get(id)?.has(k);

// ---------- 身につける物を ITEMS に登録する（今の装備の仕組みで使えるように） ----------
const SLOT_TYPE = { weapon: 'weapon', armor: 'armor', shield: 'shield', accessory: 'accessory', head: 'accessory', hands: 'accessory', feet: 'accessory', tool: 'tool' };
for (const it of MAT.values()) {
  if (!it.eq || ITEMS[it.id] || !SLOT_TYPE[it.eq.slot]) continue;
  const jobs = [];
  for (const j of it.eq.jobs || []) for (const x of makersOf(j)) if (!jobs.includes(x)) jobs.push(x);
  ITEMS[it.id] = { name: it.name, type: SLOT_TYPE[it.eq.slot], atk: it.eq.atk || 0, def: it.eq.def || (it.eq.slot === 'accessory' ? 0 : 0), value: it.v, jobs, w: it.w, matter: true, rare: it.rare >= 3 };
}

// ---------- 市場から見た品の決まり（market.js の gd から呼ばれる） ----------
const TGT = [1.5, 4, 10, 24];
const GD = new Map();
export function matterGood(id) {
  let g = GD.get(id);
  if (g) return g;
  const it = MAT.get(id);
  if (!it) return null;
  g = { name: it.name, base: Math.max(0.05, it.v), target: TGT[it.demand ?? 1] * (it.rare >= 2 ? 0.4 : 1), meals: (it.food || 0) / 30, keep: it.keep || 0, demand: it.demand ?? 1, rare: it.rare || 0, matter: true };
  GD.set(id, g);
  return g;
}

// ---------- 状態 ----------
function MS(sim) {
  const S = sim.S;
  if (!S.matter) S.matter = { v: 1, res: {}, relic: {}, seen: {}, stats: { got: 0, made: 0, used: 0, bought: 0, imported: 0, loot: 0, hunt: 0 }, byHow: {} };
  return S.matter;
}
export function markSeen(sim, id, ctx) {
  const M = MS(sim);
  if (M.seen[id] == null) { M.seen[id] = sim.today; if (M.init && sim.onDiscover) sim.onDiscover(id, ctx || {}); }   // 新発見のお知らせ（discovery.js）
}
export function ensureMatter(sim) {
  const M = MS(sim);
  if (!M.init) {
    M.init = true;
    // 世界ができたときに市場にある品・人が持っている品は、もう知られている
    for (const t of Object.values(sim.S.towns)) for (const [g, n] of Object.entries(t.stock || {})) if (n > 0 && MAT.has(g)) markSeen(sim, g);
    for (const p of sim.living()) for (const it of p.inv || []) if (MAT.has(it.id)) markSeen(sim, it.id);
  }
  return M;
}

// ---------- 有限度 ----------
const RES_MAX = { vein: [60, 30, 12, 5, 2], grove: [120, 60, 25, 10, 4] };
const RELIC_MAX = [12, 8, 5, 3, 1];
function resOk(sim, sid, it, qty) {
  const M = MS(sim);
  if (it.limit === 'relic') { const r = M.relic[it.id] ?? RELIC_MAX[it.rare || 0]; return r >= 1 ? Math.min(qty, r) : 0; }
  if (it.limit !== 'vein' && it.limit !== 'grove') return qty;
  const key = sid + '|' + it.id;
  const mx = RES_MAX[it.limit][it.rare || 0];
  const r = M.res[key] ?? mx;
  return Math.max(0, Math.min(qty, r));
}
function resTake(sim, sid, it, qty) {
  const M = MS(sim);
  if (it.limit === 'relic') { M.relic[it.id] = (M.relic[it.id] ?? RELIC_MAX[it.rare || 0]) - qty; return; }
  if (it.limit !== 'vein' && it.limit !== 'grove') return;
  const key = sid + '|' + it.id;
  M.res[key] = (M.res[key] ?? RES_MAX[it.limit][it.rare || 0]) - qty;
}
// 残りの割合（値段に使う）
function resFrac(sim, sid, it) {
  const M = MS(sim);
  if (it.limit === 'relic') return Math.max(0, (M.relic[it.id] ?? RELIC_MAX[it.rare || 0]) / RELIC_MAX[it.rare || 0]);
  if (it.limit !== 'vein' && it.limit !== 'grove') return 1;
  const mx = RES_MAX[it.limit][it.rare || 0];
  return Math.max(0, (M.res[sid + '|' + it.id] ?? mx) / mx);
}

// ---------- 土地の呼び名 ----------
const TILE_ON = {
  [T.DEEP]: ['deep', 'sea'], [T.SEA]: ['sea'], [T.BEACH]: ['beach'], [T.GRASS]: ['grass', 'field'], [T.FOREST]: ['forest'], [T.DENSE]: ['dense', 'forest'],
  [T.JUNGLE]: ['jungle'], [T.DESERT]: ['desert'], [T.SNOW]: ['snow', 'tundra'], [T.ROCK]: ['rock', 'hill', 'mountain'], [T.PEAK]: ['mountain'],
  [T.RIVER]: ['river', 'lake'], [T.ROAD]: ['town'], [T.FIELD]: ['farm', 'field'], [T.PLAZA]: ['town'], [T.BLD]: ['town'], [T.WASTE]: ['volcano', 'rock'],
  [T.BRIDGE]: ['river'], [T.SAVANNA]: ['savanna', 'grass'], [T.DOCK]: ['sea', 'beach'], [T.LAVA]: ['volcano'], [T.PASTURE]: ['grass', 'farm'], [T.SWAMP]: ['swamp'],
};
function onKeysAt(sim, x, z, r = 2) {
  const w = sim.S.world, set = new Set();
  x = Math.round(x); z = Math.round(z);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
    for (const k of TILE_ON[tileAt(w, xx, zz)] || []) set.add(k);
  }
  return set;
}
// 職業ごとの手に入れ方
const GATHER = {
  farmer: ['harvest'], beekeeper: ['harvest', 'gather'], gardener: ['harvest', 'gather'], rancher: ['gather'], shepherd: ['gather'],
  woodcutter: ['chop', 'gather'], charcoal: ['chop'], pioneer: ['chop', 'dig'], roadworker: ['dig'],
  miner: ['mine', 'dig'], mason: ['mine', 'dig'],
  fisher: ['fish', 'gather'], sailor: ['fish'], captain: ['fish'], diver: ['fish', 'gather'],
  gatherer: ['gather', 'forage'], herbalist: ['gather'], shaman: ['gather', 'forage'], hunter: ['forage'], laundress: ['gather'],
};
const candCache = new Map();
function candidates(hows, ons) {
  const key = hows.join(',') + '|' + [...ons].sort().join(',');
  let c = candCache.get(key);
  if (c) return c;
  c = [];
  const seen = new Set();
  for (const h of hows) for (const on of ons) for (const x of SRC.get(h + ':' + on) || []) if (!seen.has(x.id)) { seen.add(x.id); c.push(x); }
  if (candCache.size > 3000) candCache.clear();
  candCache.set(key, c);
  return c;
}
function pickWeighted(R, list, ok) {
  let tot = 0;
  for (const x of list) if (!ok || ok(x)) tot += x.w;
  if (tot <= 0) return null;
  let r = R.next() * tot;
  for (const x of list) { if (ok && !ok(x)) continue; r -= x.w; if (r <= 0) return x; }
  return null;
}
const sround = (R, q) => { const f = Math.floor(q); return f + (R.next() < q - f ? 1 : 0); };
function give(sim, hh, sid, id, q, how, p = null, ctx = null) {
  if (!hh || q <= 0) return 0;
  const home = p && carryHooks.carry ? carryHooks.carry(sim, p, id, q, how) : q;   // 持ち物に入れる。家の中なら家の蔵へ（carry.js）
  if (home > 0) stash(sim, hh, id, home);
  markSeen(sim, id, { hh: hh.id, s: sid, how, p: p?.id, ...(ctx || {}) });   // ctx は新発見のお知らせ用（discovery.js）
  const M = MS(sim); M.stats.got += q; M.byHow[how] = (M.byHow[how] || 0) + q;
  return q;
}

// ---------- 仕事の1時間ごと：採る・作る ----------
export function matterWork(sim, p, dt, eff) {
  p.mw = (p.mw || 0) + dt / 60;
  if (p.mw < 1) return;
  p.mw -= 1;
  const hh = sim.hh(p); if (!hh) return;
  const R = sim.rng;
  // 採る
  const hows = GATHER[p.job];
  if (hows && R.chance(0.55)) {
    const ons = onKeysAt(sim, p.pos.x, p.pos.z, p.job === 'fisher' || p.job === 'sailor' || p.job === 'diver' ? 3 : 2);
    if (p.inside != null) { const b = sim.building(p.inside); if (b?.type === 'mine') { ons.add('mine'); ons.add('cave'); ons.add('mountain'); } }
    const list = candidates(hows, ons);
    const x = pickWeighted(R, list, (c) => (hh.stock?.[c.id] || 0) < 30);
    if (x) {
      const it = MAT.get(x.id);
      let q = sround(R, x.rate * Math.min(1.5, Math.max(0.4, eff * 1.6)));
      q = Math.min(q, 8);
      q = Math.floor(resOk(sim, p.s, it, q));
      if (q > 0) { resTake(sim, p.s, it, q); give(sim, hh, p.s, x.id, q, 'work', p); }
    }
  }
  // 作る
  if (recipes().has(p.job)) craftHour(sim, p, hh, 0.6 + (p.skill?.[p.job] || 0.3));
}

// 作り方を選び直す：その町でよく売れて、材料の手に入る物
function inputsAvail(sim, sid, hh, it, mult = 1) {
  const m = sim.S.towns[sid];
  for (const [k, n] of Object.entries(it.make.from || {})) {
    const need = n * mult - (hh.stock?.[k] || 0);
    if (need > 1e-6 && (m?.stock?.[k] || 0) < need) return false;
  }
  return true;
}
function inputCost(sim, sid, it) {
  const m = sim.S.towns[sid];
  let c = 0;
  for (const [k, n] of Object.entries(it.make.from || {})) c += n * (m?.price?.[k] ?? MAT.get(k)?.v ?? GOODS[k]?.base ?? 1);
  return c;
}
function chooseRepertoire(sim, sid, pool, skill, R) {
  const m = sim.S.towns[sid];
  const sample = [];
  const n = Math.min(pool.length, 40);
  for (let i = 0; i < n; i++) sample.push(pool[Math.floor(R.next() * pool.length)]);
  const scored = [];
  for (const id of new Set(sample)) {
    const it = MAT.get(id);
    if (!it?.make || (it.rare >= 3 && skill < 0.8) || (it.rare >= 2 && skill < 0.5)) continue;
    const out = (it.make.n || 1) * (m?.price?.[id] ?? it.v);
    const gain = out - inputCost(sim, sid, it);
    scored.push([id, gain * (0.5 + (it.demand ?? 1)) / Math.max(1, it.make.t || 1) + R.next()]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, 6).map((x) => x[0]);
}
// 暮らしによく要る品（その職の人は、町に足りなければ先に作る）
const STAPLES = { smith: ['iron_nail', 'hinge', 'rivet', 'iron_sheet'] };
// 注文：建て増しなどで町に足りない品を知らせる（housing.js などから）。5日で忘れる
export function matterWant(sim, sid, id, q) {
  if (!MAT.get(id)?.make || !(q > 0)) return;
  const W = MS(sim).want || (MS(sim).want = {});
  const w = W[sid] || (W[sid] = {});
  w[id] = { q: Math.max(q, w[id]?.q || 0), day: sim.today };
}
function wantedFor(sim, sid, job) {
  const w = MS(sim).want?.[sid];
  if (!w) return [];
  const mine = recipes().get(job) || [];
  const out = [];
  for (const [id, x] of Object.entries(w)) {
    if (x.q <= 0.05 || sim.today - x.day > 5) { delete w[id]; continue; }
    if (mine.includes(id)) out.push(id);
  }
  return out;
}
function craftHour(sim, p, hh, speed) {
  const R = sim.rng, sid = p.s;
  if (!p.mrep || (p.mrepDay ?? -99) < sim.today - 7) { p.mrep = chooseRepertoire(sim, sid, recipes().get(p.job), p.skill?.[p.job] || 0.3, R); p.mrepDay = sim.today; }
  if (!p.mk) {
    const m = sim.S.towns[sid];
    const room = (x) => (hh.stock?.[x] || 0) < 6 && inputsAvail(sim, sid, hh, MAT.get(x));
    // 1. 注文のある品 → 2. 町に足りない、よく要る品 → 3. いつもの品
    const id = wantedFor(sim, sid, p.job).find(room)
      || (STAPLES[p.job] || []).find((x) => MAT.has(x) && (m?.stock?.[x] || 0) < matterGood(x).target && room(x))
      || p.mrep.find((x) => { const g = matterGood(x); return (m?.stock?.[x] || 0) < g.target * 1.5 && room(x); });
    if (!id) return;
    p.mk = { id, prog: 0 };
  }
  p.mk.prog += speed;
  const it = MAT.get(p.mk.id);
  if (p.mk.prog < (it.make.t || 1)) return;
  const id = p.mk.id; p.mk = null;
  if (makeOne(sim, sid, hh, it)) {
    const n = it.make.n || 1;
    give(sim, hh, sid, id, n, 'craft', null, { p: p.id }); MS(sim).stats.made += n;
    const w = MS(sim).want?.[sid]?.[id];
    if (w) {
      // 注文の品は、できたらすぐ市場へ出す（商人が買い取る。お金は商人から作り手へ）
      w.q -= n;
      const st = hh.stock || {};
      const q = Math.min(n, st[id] || 0);
      if (q > 0) {
        const r = marketDeliver(sim, sid, id, q, hh);
        const sold = q - r.left;
        if (sold > 0) { st[id] -= sold; if (st[id] < 1e-4) delete st[id]; }
      }
    }
  }
}
// 材料を蔵から使い、足りない分は市場で持ち主から買う
function makeOne(sim, sid, hh, it) {
  if (!inputsAvail(sim, sid, hh, it)) return false;
  const st = hh.stock || (hh.stock = {});
  for (const [k, n] of Object.entries(it.make.from || {})) {
    const own = Math.min(n, st[k] || 0);
    if (own > 0) { st[k] -= own; if (st[k] < 1e-4) delete st[k]; }
    const need = n - own;
    if (need > 1e-6) {
      const got = marketBuy(sim, sid, k, need, hh);
      if (got < need - 1e-6) { if (got > 0) st[k] = (st[k] || 0) + got; if (own > 0) st[k] = (st[k] || 0) + own; return false; }
    }
  }
  return true;
}

// ---------- 狩り・家畜・宝 ----------
export function matterHunt(sim, hh, sp, sid, who = null) {
  if (!hh) return;
  const R = sim.rng;
  for (const x of SRC.get('hunt:' + sp) || []) {
    const it = MAT.get(x.id);
    let q = sround(R, x.rate * (it.rare ? RARW[it.rare] * 2 : 1));
    if (q <= 0) continue;
    q = Math.floor(resOk(sim, sid, it, q)); if (q <= 0) continue;
    resTake(sim, sid, it, q);
    give(sim, hh, sid, x.id, q, 'hunt', who, { sp });
    MS(sim).stats.hunt += q;
  }
}
export function matterLoot(sim, p, place) {
  const hh = sim.hh(p); if (!hh) return [];
  const R = sim.rng, got = [];
  const list = SRC.get('loot:' + place) || [];
  const n = 1 + (R.chance(0.5) ? 1 : 0) + (R.chance(0.15) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const x = pickWeighted(R, list, (c) => { const it = MAT.get(c.id); return resOk(sim, p.s, it, 1) >= 1; });
    if (!x) break;
    const it = MAT.get(x.id);
    resTake(sim, p.s, it, 1);
    give(sim, hh, p.s, x.id, 1, 'loot', p, { place });
    MS(sim).stats.loot++;
    got.push(it.name);
  }
  if (got.length && p.memories) sim.remember(p, `${got.join('と')}を持ち帰った`, { emo: 0.5, imp: 0.4, k: 'quest' });
  return got;
}
function milkDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const c of Object.values(S.creatures)) {
    if (c.keeper == null || c.juv || c.hp <= 0) continue;
    const hh = S.households[c.keeper]; if (!hh) continue;
    for (const x of SRC.get('milk:' + c.sp) || []) {
      const it = MAT.get(x.id);
      const q = sround(R, x.rate * 0.5 * (it.rare ? RARW[it.rare] : 1) * (c.hunger > 40 ? 1 : 0.4));
      if (q > 0 && (hh.stock?.[x.id] || 0) < 20) give(sim, hh, hh.s, x.id, q, 'milk', null, { sp: c.sp });
    }
  }
}

// ---------- 遠い国の品：港と王都の商人が外から仕入れる（代金は世界の外へ） ----------
function tradeImports(sim) {
  const S = sim.S, R = sim.rng;
  if (!TRADE_IDS.length) return;
  for (const s of S.world.settlements) {
    if (s.type !== 'port' && s.type !== 'capital') continue;
    if ((sim.today + s.id) % 4 !== 0) continue;
    const mh = merchantsOf(sim, s.id).filter((h) => h.money > 120).sort((a, b) => b.money - a.money)[0];
    if (!mh) continue;
    for (let i = 0; i < 1; i++) {
      const id = TRADE_IDS[Math.floor(R.next() * TRADE_IDS.length)];
      const it = MAT.get(id);
      if ((it.demand ?? 1) < 2 && R.chance(0.6)) continue;   // よく要る物を選んで仕入れる
      const q = Math.max(1, Math.round((it.v < 5 ? 6 : it.v < 40 ? 3 : 1) * (1 - (it.rare || 0) * 0.2)));
      const cost = q * it.v * 0.7;
      if (mh.money - cost < 80) continue;
      mh.money -= cost; moneyOut(sim, cost, '遠い国から品を仕入れた');
      ownStock(sim, s.id, id, mh.id, q);
      markSeen(sim, id, { hh: mh.id, s: s.id, how: 'trade' });
      MS(sim).stats.imported += q;
    }
  }
}

// ---------- 家で作る物（料理・暮らしの品）：手の空いた大人が1日に1つ ----------
function householdCraft(sim) {
  const S = sim.S, R = sim.rng;
  for (const hh of Object.values(S.households)) {
    if (hh.bandits || hh.house == null || !R.chance(0.35)) continue;
    const maker = hh.members.map((id) => S.people[id]).find((q) => q && q.deathYear == null && q.needs && sim.ageOf(q) >= 16 && sim.ageOf(q) < 75 && q.jail == null && (!q.job || ['nanny', 'laundress', 'farmer', 'shepherd'].includes(q.job)));
    if (!maker) continue;
    if (!hh.mrep || (hh.mrepDay ?? -99) < sim.today - 10) { hh.mrep = chooseRepertoire(sim, hh.s, HOUSE_RECIPES, 0.4, R); hh.mrepDay = sim.today; }
    const m = S.towns[hh.s];
    const id = hh.mrep.find((x) => { const it = MAT.get(x); return (hh.stock?.[x] || 0) < 4 && (m?.stock?.[x] || 0) < matterGood(x).target * 1.5 && inputsAvail(sim, hh.s, hh, it); });
    if (!id) continue;
    const it = MAT.get(id);
    if (hh.money < inputCost(sim, hh.s, it) + 20) continue;
    if (makeOne(sim, hh.s, hh, it)) { give(sim, hh, hh.s, id, it.make.n || 1, 'home', null, { p: maker.id }); MS(sim).stats.made += it.make.n || 1; }
  }
}

// ---------- 暮らしで使う（毎日：燃料・家畜の餌・畑の肥やし・持ち物の楽しみ） ----------
function pickFromStock(st, k) { for (const g of Object.keys(st || {})) if (st[g] >= 1 && hasUse(g, k)) return g; return null; }
function cheapestIn(m, k, maxPrice) {
  let best = null, bp = Infinity;
  for (const g of m?.matUse?.[k] || []) { const pr = m.price[g]; if ((m.stock[g] || 0) >= 1 && pr <= maxPrice && pr < bp) { bp = pr; best = g; } }
  return best;
}
function useDaily(sim) {
  const S = sim.S, R = sim.rng, M = MS(sim);
  const winter = sim.seasonIdx() === 3;
  const keeps = {};
  for (const c of Object.values(S.creatures)) if (c.keeper != null) keeps[c.keeper] = (keeps[c.keeper] || 0) + 1;
  for (const hh of Object.values(S.households)) {
    if (hh.bandits || hh.house == null) continue;
    const m = S.towns[hh.s];
    hh.stock = hh.stock || {};
    // 燃やす：冬は毎日、ほかの季節も炊事にときどき
    if (winter || R.chance(0.15)) {
      let g = pickFromStock(hh.stock, 'fuel') || ((hh.stock.wood || 0) >= 1 ? 'wood' : null);
      if (!g && hh.money > 25) { g = cheapestIn(m, 'fuel', 6); if (g && marketBuy(sim, hh.s, g, 1, hh, { whole: true }) >= 1) hh.stock[g] = (hh.stock[g] || 0) + 1; else g = null; }
      if (g) { hh.stock[g] -= 1; if (hh.stock[g] < 1e-4) delete hh.stock[g]; hh.warmDay = sim.today; M.stats.used++; }
    }
    // 家畜の餌：飼っている家は、蔵の餌を使う（使った日は干し草代を払わない）
    if (keeps[hh.id]) {
      let g = pickFromStock(hh.stock, 'feed');
      if (!g && hh.money > 30) { g = cheapestIn(m, 'feed', 4); if (g && marketBuy(sim, hh.s, g, 1, hh, { whole: true }) >= 1) hh.stock[g] = (hh.stock[g] || 0) + 1; else g = null; }
      if (g) { hh.stock[g] -= 1; if (hh.stock[g] < 1e-4) delete hh.stock[g]; hh.feedDay = sim.today; M.stats.used++; }
    }
    // 畑の肥やし：畑を持つ農家は週に1度（撒いた週は実りが増える）
    if ((hh.land > 0 || hh.members.some((id) => S.people[id]?.job === 'farmer')) && (hh.fertUntil ?? -1) < sim.today) {
      let g = pickFromStock(hh.stock, 'fertilize');
      if (!g && hh.money > 40) { g = cheapestIn(m, 'fertilize', 5); if (g && marketBuy(sim, hh.s, g, 1, hh, { whole: true }) >= 1) hh.stock[g] = (hh.stock[g] || 0) + 1; else g = null; }
      if (g) { hh.stock[g] -= 1; if (hh.stock[g] < 1e-4) delete hh.stock[g]; hh.fertUntil = sim.today + 7; M.stats.used++; }
    }
  }
  // 持ち物の楽しみ：収集品・趣味の品・ぜいたく品を持つ人は、毎日少し気分がよい
  for (const p of sim.living()) {
    if (!p.mat || !p.needs) continue;
    let pl = 0, es = 0;
    for (const id of Object.keys(p.mat)) { if (hasUse(id, 'hobby')) pl += 2; if (hasUse(id, 'collect') || hasUse(id, 'luxury')) es += 1.5; }
    p.needs.pleasure = Math.min(100, p.needs.pleasure + Math.min(8, pl));
    p.needs.esteem = Math.min(100, p.needs.esteem + Math.min(6, es));
  }
}

// ---------- 買う：欲求から種類を決め、その町にある品から選ぶ ----------
export function matterCandidates(sim, p, add) {
  const h = sim.hour();
  if (h < 8 || h >= 19 || sim.ageOf(p) < 14 || p.jail != null || !p.needs) return;
  if ((p.mNext ?? 0) > sim.S.t) return;
  const m = sim.S.towns[p.s];
  if (!m?.matUse) return;
  const cat = wantCategory(sim, p, m);
  if (!cat) { p.mNext = sim.S.t + 240; return; }
  const money = spendable(sim, p);
  if (money < 12) return;
  add(3.5 + cat.urge, 'buymat', sim.placeFor(p, 'market'), 20, { food: cat.k });
}
function wantCategory(sim, p, m) {
  const n = p.needs, J = JOBS[p.job] || {};
  const opts = [];
  const have = (k) => (m.matUse[k] || []).some((g) => (m.stock[g] || 0) >= 1);
  if ((p.ail || p.hp < p.maxhp * 0.6) && have('medicine')) opts.push({ k: 'medicine', urge: 3 });
  if (J.combat && have('wear')) opts.push({ k: 'wear', urge: 1.2 });
  if (!p.eq?.tool && have('tool')) opts.push({ k: 'tool', urge: 1.5 });
  if (['wizard', 'scholar', 'courtmage', 'sage', 'alchemist', 'magister'].includes(p.job) && have('magic')) opts.push({ k: 'magic', urge: 1.5 });
  const rich = spendable(sim, p) > 120 ? 0.6 : 0;   // 懐にゆとりがあれば、欲しい物を探しに行く
  if (n.pleasure < 80) { if (have('drink')) opts.push({ k: 'drink', urge: (85 - n.pleasure) / 20 }); if (have('hobby')) opts.push({ k: 'hobby', urge: (80 - n.pleasure) / 20 + rich }); if (have('luxury')) opts.push({ k: 'luxury', urge: (75 - n.pleasure) / 25 + rich }); }
  if (n.esteem < 80) { if (have('collect')) opts.push({ k: 'collect', urge: (80 - n.esteem) / 20 + rich }); if (have('wear')) opts.push({ k: 'wear', urge: (75 - n.esteem) / 25 }); }
  if (n.lust < 70 && sim.ageOf(p) >= 17 && have('gift')) opts.push({ k: 'gift', urge: (75 - n.lust) / 20 });
  if (n.sloth < 70 && have('build') && sim.hh(p)?.house != null && (sim.hh(p).comfort || 0) < 8) opts.push({ k: 'build', urge: 0.6 + rich });
  if ((n.survival < 85 || sim.isRestDay?.(p.s)) && (p.values?.faith || 0) > 0.5 && have('ritual')) opts.push({ k: 'ritual', urge: 0.9 });
  if (!opts.length) return null;
  opts.sort((a, b) => b.urge - a.urge);
  return opts[0].urge > 0.3 ? opts[0] : null;
}
// その町にある品の中から、懐に合う物を選ぶ（値打ちと欲しさのつり合い）
function pickItem(sim, p, m, k, budget) {
  const R = sim.rng;
  let best = null, bs = -Infinity;
  for (const g of m.matUse[k] || []) {
    if ((m.stock[g] || 0) < 1) continue;
    const pr = m.price[g];
    if (!(pr > 0) || pr > budget) continue;
    const it = MAT.get(g);
    let sc = Math.log(1 + it.v) * (0.5 + (it.demand ?? 1) * 0.3) - pr / Math.max(10, budget) + R.next() * 0.6;
    if (k === 'wear' || k === 'tool') { if (!ITEMS[g]) continue; if (k === 'tool' && !(ITEMS[g].jobs || []).includes(p.job)) continue; if (k === 'wear' && JOBS[p.job]?.combat && !isUpgrade(p, g)) continue; }
    if (k === 'medicine' && it.fx) sc += (it.fx.hp || 0) / 10 + (it.fx.cure || it.fx.sev || 0) / 10;
    if (k === 'magic' && !(it.fx?.research || it.fx?.study || it.fx?.mana)) sc -= 1;
    if (sc > bs) { bs = sc; best = g; }
  }
  return best;
}
function isUpgrade(p, g) {
  const d = ITEMS[g]; const cur = p.eq?.[d.type];
  const sc = (id) => (ITEMS[id]?.atk || 0) + (ITEMS[id]?.def || 0);
  return !cur || sc(g) > sc(cur.id) * 1.15;
}
export function matterArrive(sim, p, a) {
  if (a.type !== 'buymat') return;
  const m = sim.S.towns[p.s], k = a.food, M = MS(sim);
  p.mNext = sim.S.t + 720 + sim.rng.int(0, 1440);   // 次に品物を探しに行くのは半日〜1日半あと
  a.until = sim.S.t + 15;
  if (!m?.matUse || !k) return;
  const money = spendable(sim, p);
  const budget = Math.min(money * (k === 'medicine' ? 0.6 : k === 'wear' || k === 'tool' ? 0.5 : 0.25), 400);
  const g = pickItem(sim, p, m, k, budget);
  if (!g) return;
  if (marketBuy(sim, p.s, g, 1, personPayer(sim, p), { whole: true, who: JOBS[p.job]?.name || '町の人' }) < 1) return;
  M.stats.bought++; markSeen(sim, g, { p: p.id, s: p.s, how: 'buy' });
  applyUse(sim, p, g, k);
}
// 使ったときの決まった動き（物ごとに別の処理は書かない）
function applyUse(sim, p, g, k) {
  const it = MAT.get(g), n = p.needs, fx = it.fx || {}, M = MS(sim);
  const lv = Math.log(1 + it.v);
  M.stats.used++;
  switch (k) {
    case 'medicine':
      if (fx.hp) p.hp = Math.min(p.maxhp, p.hp + fx.hp);
      if (p.ail) p.ail.sev = Math.max(0, p.ail.sev - (fx.cure || fx.sev || 8));
      if (!fx.hp && !p.ail) p.hp = Math.min(p.maxhp, p.hp + 5);
      n.survival = Math.min(100, n.survival + 10);
      break;
    case 'drink':
      n.pleasure = Math.min(100, n.pleasure + 8 + lv * 3 + (fx.mood || 0));
      n.hunger = Math.min(100, n.hunger + (it.food || 0) / 3);
      break;
    case 'wear': case 'tool':
      addItem(p, makeItem(g, 0.9 + sim.rng.next() * 0.2)); autoEquip(p); Object.assign(p, humanStats(sim, p));
      n.esteem = Math.min(100, n.esteem + 6 + lv);
      break;
    case 'build': { const hh = sim.hh(p); if (hh) hh.comfort = Math.min(10, (hh.comfort || 0) + Math.min(1, it.v / 15)); n.sloth = Math.min(100, n.sloth + 10); break; }
    case 'gift': {
      const to = (p.spouseId != null && sim.S.people[p.spouseId]?.deathYear == null ? sim.S.people[p.spouseId] : null) || sim.crushOf?.(p);
      if (to) { sim.relMut(p, to).a = Math.min(100, sim.rel(p, to).a + 3 + lv * 2); sim.relMut(to, p).a = Math.min(100, sim.rel(to, p).a + 5 + lv * 3); keep(to, g); if (to.memories) sim.remember(to, `${p.given}から${it.name}を贈られた`, { emo: 0.6, imp: 0.45, about: [p.id], k: 'gift' }); n.lust = Math.min(100, n.lust + 15); }
      else keep(p, g);
      break;
    }
    case 'ritual': n.survival = Math.min(100, n.survival + 12); n.pleasure = Math.min(100, n.pleasure + 5); if (p.values) p.values.faith = Math.min(1, (p.values.faith || 0) + 0.005); break;
    case 'magic': { const K = sim.kingdomOf(p); const pts = (fx.research || fx.study || fx.mana || 2) * 0.5; if (K) { K.research += pts; K.contrib[p.id] = (K.contrib[p.id] || 0) + pts; } n.esteem = Math.min(100, n.esteem + 5); break; }
    default: // hobby・collect・luxury：持つ
      keep(p, g);
      n.pleasure = Math.min(100, n.pleasure + 6 + lv * 2 + (fx.mood || 0));
      n.esteem = Math.min(100, n.esteem + 4 + lv * 2);
      if (it.rare >= 2) { p.fame = (p.fame || 0) + it.rare; if (sim.nearby) sim.gossip(p, `めずらしい${it.name}を手に入れた`, 0.3, sim.nearby(p, 6), { silent: true }); }
      if (p.memories && (it.v >= 20 || sim.rng.chance(0.3))) sim.remember(p, `市場で${it.name}を買った`, { emo: 0.4, imp: 0.3, k: 'spend' });
  }
}
function keep(p, g) {
  p.mat = p.mat || {};
  p.mat[g] = (p.mat[g] || 0) + 1;
  const ks = Object.keys(p.mat);
  if (ks.length > 16) delete p.mat[ks[0]];
}

// ---------- 値段：毎日、町にある物だけ ----------
const SEASONAL = new Set(['harvest', 'gather', 'forage', 'fish']);
function matterPrices(sim) {
  const S = sim.S, si = sim.seasonIdx();
  const pop = {};
  for (const p of sim.living()) pop[p.s] = (pop[p.s] || 0) + 1;
  for (const [sidS, m] of Object.entries(S.towns)) {
    const sid = +sidS;
    const L = priceLevel(sim, sid);
    const pf = Math.max(0.4, Math.min(3, (pop[sid] || 10) / 40));
    const use = {};
    for (const g of Object.keys(m.stock)) {
      if (GOODS[g]) continue;
      const it = MAT.get(g);
      if (!it) continue;
      const s = m.stock[g] || 0;
      if (s < 0.01) { if (!(m.lots?.[g]?.length)) { delete m.stock[g]; delete m.price[g]; if (m.lots) delete m.lots[g]; } continue; }
      // 傷む物は市場でも傷む
      if (it.keep) m.stock[g] = s * (1 - Math.min(0.5, 1 / it.keep) * 0.6);
      const gd = matterGood(g);
      const tgt = gd.target * pf;
      const hi = 2 + (it.rare || 0) * 1.5;
      let pr = it.v * L * Math.min(hi, Math.max(0.4, Math.pow(tgt / (m.stock[g] + tgt * 0.25), 0.55)));
      if (it.src.some((x) => SEASONAL.has(x.how)) && it.cat !== 'arcane') pr *= [1, 0.95, 0.85, 1.3][si];
      if (it.limit === 'vein' || it.limit === 'grove' || it.limit === 'relic') pr *= 1 + (1 - resFrac(sim, sid, it)) * (it.limit === 'relic' ? 2 : 1.5);
      const old = m.price[g];
      m.price[g] = old > 0 ? old + (pr - old) * 0.35 : pr;
      for (const k of USESET.get(g)) (use[k] || (use[k] = [])).push(g);
    }
    m.matUse = use;
  }
}

// ---------- 採り尽くした所は少しずつ戻る ----------
function regrow(sim) {
  const M = MS(sim);
  for (const [key, r] of Object.entries(M.res)) {
    const id = key.slice(key.indexOf('|') + 1), it = MAT.get(id);
    if (!it) { delete M.res[key]; continue; }
    const mx = RES_MAX[it.limit][it.rare || 0];
    const nr = r + mx * (it.limit === 'grove' ? 0.02 : 0.002);
    if (nr >= mx) delete M.res[key]; else M.res[key] = nr;
  }
}
// 家の蔵の物も傷む・増えすぎた物は置き場がない
function spoil(sim) {
  for (const hh of Object.values(sim.S.households)) {
    const st = hh.stock; if (!st) continue;
    for (const g of Object.keys(st)) {
      if (GOODS[g]) continue;
      const it = MAT.get(g);
      if (it?.keep) st[g] *= 1 - Math.min(0.5, 1 / it.keep);
      if (st[g] > 40) st[g] = 40;
      if (st[g] < 0.05) delete st[g];
    }
  }
}

// ---------- 毎日 ----------
export function matterDaily(sim) {
  ensureMatter(sim);
  spoil(sim);
  milkDaily(sim);
  tradeImports(sim);
  householdCraft(sim);
  matterPrices(sim);
  useDaily(sim);
  regrow(sim);
}

// ---------- 数え上げ（試験・図鑑） ----------
export function matterCount(sim) {
  const S = sim.S, set = new Set();
  for (const t of Object.values(S.towns)) for (const [g, n] of Object.entries(t.stock)) if (n >= 0.5 && MAT.has(g)) set.add(g);
  for (const hh of Object.values(S.households)) for (const [g, n] of Object.entries(hh.stock || {})) if (n >= 0.5 && MAT.has(g)) set.add(g);
  return { inWorld: set.size, seen: Object.keys(MS(sim).seen).length, total: MAT.size, stats: MS(sim).stats, byHow: MS(sim).byHow };
}
export const MATTER_LABEL = { buymat: '市場で品物を選んでいる' };
export const MATTER_GO = { buymat: '市場へ買い物に向かっている' };
export const MATTER_PREF = { buymat: '品物選び' };
export { SRC as MATTER_SRC, USE as MATTER_USE };
export const matterRecipes = () => recipes();
void DAYS_PER_SEASON; void SPECIES; void flow; void meal; void marketDeliver;
