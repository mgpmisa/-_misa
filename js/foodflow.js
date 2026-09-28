// 食べ物の流れ（経済部）― docs/畑と地域の食料.md の優先順位1と2
//
// 1. 家の食べ物の余りを売る
//    - 乳：乳牛・山羊の乳は、飼い主の家の蔵へ（fauna.js の「恵み」から呼ばれる animalYield）。卵は matter.js が蔵へ入れる。
//    - 菜園（kgarden）：村と首都の外の農家は、春〜秋の朝に家のそばの菜園で野菜をとり、蔵へ入れる。
//    - ベリー摘み（berry）：夏と秋、村の子どもと大人が森の縁で木苺・黒苺を摘み、蔵へ入れる（村ごとに1日の量に限り）。
//    - 家族の食べる分（1人1日1杯・1個・1束 ×2〜3日）だけ残し、余りは今までどおり市場で売る（market.js の sellable → keepCap）。
//      お金：買い手（市場の商人・村の蔵・町の人の家計） → 作った家の家計。
//    - 町の人は、ふだんの買い物のついでに、乳・卵・野菜・ベリー・チーズなどの「おかず」を少し買う（sideDish）。
//      お金：買った家の家計 → 品の持ち主（作った家・商人）。
// 2. 家畜を持たせる：新しい世界を作るとき、村と首都の外の農家1軒に、乳牛1頭か山羊2頭と、鶏4〜6羽（fauna の本物の生き物）。
//    古いセーブには足さない（S.foodflow.stocked が無いまま）。
// 4. 隊商と行商人が日持ちする食べ物を運ぶ：tradeFoods（logistics.js・civic.js から呼ぶ）。
// 5. 5日に1度の市（fair）：王都と港町の広場に、近くの村の人が蔵の余りを背負って売りに来る。
//    場所代：売る人の家計 → 町の蓄え。売り上げ：買い手 → 売る人の家計（marketBuy が露店の札の持ち主へ払う）。
//    露店の台と品は actgfx.js（行動 'stall'）、売り手の動きは anim_acts.js（'stall'）をそのまま使う。
//
// ■ 本体からの呼び方
//   initFoodflow(sim)                 … newWorld の seedMarkets の後（家畜を配る）
//   foodflowCandidates(sim, p, add)   … decide（菜園・ベリー摘み・市へ売りに行く）
//   foodflowArrive(sim, p, a)         … arrive（とれた物を蔵へ・市の露店を開く）
//   foodflowHourly(sim)               … newHour（市の露店を片づけ、売れ残りを家へ）
//   foodflowDaily(sim)                … newDay
//   sideDish(sim, p, hh, m)           … doShop の食べ物の買い物の後
//   animalYield(sim, hh, list, si)    … fauna.js の livestockCare（sim._ff 経由）
import { GOODS } from './data.js';
import { T, W, H } from './world.js';
import { stash, marketBuy, MARKET_HOOK, STALL_API } from './market.js';
import { matterGood } from './matter.js';
import { makeCreature } from './creatures.js';
import { ensureAnimal } from './fauna.js';
import { flow, meal } from './ledger.js';

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
export const gdAny = (g) => GOODS[g] || matterGood(g);
export const goodLabel = (g) => gdAny(g)?.name || g;

// 家族が取っておく量（1人1日あたり）。これより多い分を売る
const FAMILY_USE = { milk: 1, b_goat_milk: 1, egg: 1, b_duck_egg: 0.5, cabbage: 0.5, turnip: 0.5, carrot: 0.5, onion: 0.5, pea: 0.5, raspberry: 1, blackberry: 1, strawberry: 1 };
// 季節（0春 1夏 2秋 3冬）ごとの菜園の野菜
const GARDEN = [['onion', 'pea', 'cabbage'], ['cabbage', 'carrot', 'pea', 'onion'], ['turnip', 'cabbage', 'carrot', 'onion'], []];
const GARDEN_Q = [1.5, 3, 4, 0];
const BERRY = [['strawberry'], ['raspberry', 'blackberry', 'strawberry', 'currant', 'elderflower'], ['blackberry', 'raspberry', 'elderberry', 'hazelnut', 'rosehip', 'lingonberry'], ['rosehip', 'sloe']];   // 冬は霜のあとの野ばらの実とスロー（開発部）
const BERRY_DAY = [6, 16, 12, 3];   // 村ごとの1日の実りの量
// おかず（町の人がついでに買う物）
const SIDE = ['milk', 'b_goat_milk', 'egg', 'b_duck_egg', 'cabbage', 'turnip', 'carrot', 'onion', 'pea', 'raspberry', 'blackberry', 'strawberry', 'cheese', 'butter'];
const RURAL_JOBS = new Set(['farmer', 'rancher', 'shepherd', 'beekeeper', 'gatherer', 'hunter', 'woodcutter', 'charcoal', 'miller', 'fisher', 'pioneer']);
const FAIR_EVERY = 5, FAIR_R = 48, FAIR_FEE = 2, FAIR_CARRY = 20;

export const FOODFLOW_LABEL = { kgarden: '家のそばの菜園で野菜の世話をしている', berry: '森の縁でベリーを摘んでいる' };
export const FOODFLOW_GO = { kgarden: '菜園へ向かっている', berry: 'ベリーを摘みに森へ向かっている' };
export const FOODFLOW_PREF = { kgarden: '菜園の世話', berry: 'ベリー摘み' };

function FF(sim) {
  const S = sim.S;
  S.foodflow = S.foodflow || { v: 1 };
  const F = S.foodflow;
  F.fairs = F.fairs || [];
  F.berry = F.berry || {};
  F.stats = F.stats || { milk: 0, veg: 0, berry: 0, side: 0, sideSpent: 0, fairStalls: 0, fairFees: 0, fairSold: 0, animals: 0 };
  hooks(sim);
  return F;
}
function hooks(sim) {
  sim._ff = API;
  if (!MARKET_HOOK.keepCap) MARKET_HOOK.keepCap = keepCap;
}
function keepCap(sim, hh, g, days) {
  const u = FAMILY_USE[g];
  return u == null ? null : hh.members.length * u * days;
}

// ---------- 田舎の家（村・首都の外の農家） ----------
function isRural(sim, hh) {
  if (!hh || hh.house == null || hh.bandits || hh.royal) return false;
  const s = sim.town(hh.s);
  if (!s || s.tribal) return false;
  if (s.type === 'village') return true;
  return (sim.S.farmsteads?.hh || []).includes(hh.id);
}

// ================================================================ 2. 家畜を配る（新しい世界だけ）
export function initFoodflow(sim) {
  const S = sim.S, R = sim.rng, F = FF(sim);
  if (F.stocked) return;
  F.stocked = 1;
  for (const hh of Object.values(S.households)) {
    if (!hh.members?.length || !isRural(sim, hh)) continue;
    const farmer = hh.members.some((id) => { const q = S.people[id]; return q && q.deathYear == null && q.job === 'farmer' && sim.ageOf(q) >= 16; });
    if (!farmer) continue;
    const b = sim.building(hh.house);
    if (!b?.door) continue;
    const s = sim.town(hh.s);
    const south = s.kingdom === 2;
    const want = [];
    if (!south && R.chance(0.6)) want.push(['cow', 'dairy', R.int(4, 9) * 40]);
    else want.push(['goat', 'dairy', R.int(2, 6) * 40], ['goat', 'dairy', R.int(2, 6) * 40]);
    const hens = R.int(4, 6);
    for (let i = 0; i < hens; i++) want.push(['chicken', 'layer', R.int(40, 100)]);
    for (const [sp, role, age] of want) {
      const c = makeCreature(sim, sp, b.door.x, b.door.z, { owner: hh.s, range: sp === 'chicken' ? 1.4 : 2, hx: b.door.x, hz: b.door.z, role, age });
      if (!S.creatures[c.id] || !(c.hp > 0)) { delete S.creatures[c.id]; continue; }
      c.keeper = hh.id; c.sex = 'f'; c.farm = hh.id;
      ensureAnimal(sim, c);
      c.role = role;
      F.stats.animals++;
    }
  }
}

// ================================================================ 1. 乳（fauna.js の恵みの代わり）
// 乳牛1頭 1日3杯（冬1.5杯）、山羊1頭 1.5杯（冬0.5杯）。matter.js の milkDaily が 0.5杯ずつ入れるので、残りをここで足す。
// 卵は matter.js が1羽1日0.5個を蔵へ入れているので、ここでは足さない。
export function animalYield(sim, hh, list, si) {
  const F = FF(sim);
  let milk = 0, gmilk = 0;
  for (const c of list) {
    if (c.juv || c.hunger < 35 || c.role !== 'dairy' || c.sex === 'm') continue;
    if (c.sp === 'cow') milk += si === 3 ? 1.0 : 2.5;
    else if (c.sp === 'goat') gmilk += si === 3 ? 0 : 1.0;
  }
  const st = hh.stock || {};
  if (milk > 0 && num(st.milk) < 20) stash(sim, hh, 'milk', milk);
  if (gmilk > 0 && matterGood('b_goat_milk') && num(st.b_goat_milk) < 20) stash(sim, hh, 'b_goat_milk', gmilk);
  F.stats.milk += milk + gmilk;
  return milk + gmilk;
}

// ================================================================ 行動の候補
export function foodflowCandidates(sim, p, add) {
  const h = sim.hour(), age = sim.ageOf(p), R = sim.rng;
  if (h < 6 || h >= 17.5 || p.jail != null || !p.needs || p.mission || p.party != null || p.bandit) return;
  const hh = sim.hh(p);
  if (!isRural(sim, hh)) return;
  const S = sim.S, F = FF(sim), si = sim.seasonIdx(), s = sim.townOf(p);
  if (!s || S.towns[s.id]?.occupied) return;
  const rest = sim.isRestDay?.(p.s);
  const busyJob = p.job && !RURAL_JOBS.has(p.job) && !rest;
  // 菜園：朝のうちに1家に1度
  if (GARDEN_Q[si] > 0 && age >= 12 && h >= 6.5 && h < 11 && hh.ffGarden !== sim.today && !busyJob) {
    const spot = nearHome(sim, hh);
    if (spot) add(2.2 + p.pers.C * 1.5 + (p.values?.family || 0.5) + (age >= 55 ? 0.8 : 0), 'kgarden', spot, R.int(40, 70));
  }
  // ベリー摘み：夏と秋。子どもは昼から、大人は手の空いたとき。村の実りが残っているうち
  if (BERRY_DAY[si] > 0 && age >= 8 && (p.ffBerry ?? -1) !== sim.today && !busyJob && h >= (age < 14 ? 12.5 : 8) && h < 17) {
    const b = F.berry[s.id];
    const left = b && b.d === sim.today ? b.left : BERRY_DAY[si];
    if (left >= 1) {
      const spot = sim.randomNear(s.x, s.z, (s.r || 6) + 7, (t, x, z) => t === T.FOREST && Math.hypot(x - s.x, z - s.z) > (s.r || 6) - 1);
      if (spot) add(1.6 + p.pers.O + (age < 14 ? 1.2 : 0) + (100 - p.needs.pleasure) / 60, 'berry', spot, R.int(40, 80));
    }
  }
  // 5日に1度の市：朝のうちに、近くの王都・港町の広場へ売りに行く（1家に1人）
  if (sim.isAdult(p) && age < 66 && h >= 5.5 && h < 9.5 && (!p.job || RURAL_JOBS.has(p.job)) && hh.ffFair !== sim.today) {
    const town = fairTownFor(sim, s);
    if (town) {
      const v = fairValue(sim, hh, town.id);
      const going = F.fairs.filter((x) => x.sid === town.id).length;
      if (v >= 8 && going < 10 && hh.money >= FAIR_FEE) {
        const spot = sim.randomNear(town.x, town.z, 3, (t) => t === T.PLAZA || t === T.ROAD) || sim.randomNear(town.x, town.z, 4);
        if (spot) add(3.5 + p.pers.E + p.pers.C + Math.min(3, v / 12) + (hh.money < 40 ? 1 : 0), 'stall', spot, 240, { dest: town.id });
      }
    }
  }
}
function nearHome(sim, hh) {
  const b = sim.building(hh.house);
  if (!b?.door) return null;
  return sim.randomNear(b.door.x, b.door.z, 2, (t) => t !== T.ROAD && t !== T.PLAZA) || sim.randomNear(b.door.x, b.door.z, 2);
}
export function isFairDay(sim, sid, day = sim.today) { return (day + sid * 2) % FAIR_EVERY === 1; }
function fairTownFor(sim, s) {
  const S = sim.S;
  let best = null, bd = FAIR_R;
  for (const q of S.world.settlements) {
    if (q.id === s.id || q.tribal || (q.type !== 'capital' && q.type !== 'port') || S.towns[q.id]?.occupied || !isFairDay(sim, q.id)) continue;
    const d = Math.hypot(q.x - s.x, q.z - s.z);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function fairValue(sim, hh, sid) {
  const m = sim.S.towns[sid];
  let v = 0;
  for (const g of Object.keys(hh.stock || {})) {
    const G = gdAny(g); if (!G) continue;
    v += STALL_API.sellable(sim, hh, g) * (m?.price[g] ?? G.base);
  }
  return v;
}

// ================================================================ 到着
export function foodflowArrive(sim, p, a) {
  if (!a) return;
  if (a.type === 'kgarden') { gardenHarvest(sim, p); return; }
  if (a.type === 'berry') { pickBerries(sim, p); return; }
  if (a.type === 'stall' && a.dest != null && a.dest !== p.s) openFairStall(sim, p, a);
}
function gardenHarvest(sim, p) {
  const hh = sim.hh(p), si = sim.seasonIdx(), R = sim.rng, F = FF(sim);
  if (!hh || hh.ffGarden === sim.today || !GARDEN_Q[si]) return;
  hh.ffGarden = sim.today;
  const list = GARDEN[si].filter((g) => matterGood(g));
  if (!list.length) return;
  const g1 = R.pick(list), g2 = R.pick(list);
  const q = GARDEN_Q[si] * (0.7 + R.next() * 0.6) * (0.8 + (p.skill?.farmer || 0.3) * 0.5);
  stash(sim, hh, g1, q * 0.6); stash(sim, hh, g2, q * 0.4);
  F.stats.veg += q;
  p.needs.pleasure = Math.min(100, p.needs.pleasure + 4);
  if (R.chance(0.12)) sim.remember(p, R.pick([`家の菜園で${goodLabel(g1)}をとった`, `菜園の${goodLabel(g1)}がよく育っている`, `菜園の草を抜き、${goodLabel(g2)}に水をやった`]), { emo: 0.3, imp: 0.2, k: 'farm' });
}
function pickBerries(sim, p) {
  const S = sim.S, F = FF(sim), si = sim.seasonIdx(), R = sim.rng;
  if ((p.ffBerry ?? -1) === sim.today) return;
  p.ffBerry = sim.today;
  const b = F.berry[p.s] && F.berry[p.s].d === sim.today ? F.berry[p.s] : (F.berry[p.s] = { d: sim.today, left: BERRY_DAY[si] });
  const list = BERRY[si].filter((g) => matterGood(g));
  if (!list.length || b.left < 0.5) return;
  const q = Math.min(b.left, 1.5 + R.next() * 2.5);
  b.left -= q;
  const g = R.pick(list);
  const hh = sim.hh(p);
  if (hh) stash(sim, hh, g, q);
  F.stats.berry += q;
  p.needs.pleasure = Math.min(100, p.needs.pleasure + 6);
  if (R.chance(0.15)) sim.remember(p, sim.ageOf(p) < 14 ? `森の縁で${goodLabel(g)}を摘んだ。つまみ食いしたら甘かった` : `森の縁で${goodLabel(g)}をかごいっぱいに摘んだ`, { emo: 0.4, imp: 0.25, k: 'farm' });
  void S;
}

// ================================================================ 5. 市（5日に1度）
function openFairStall(sim, p, a) {
  const S = sim.S, F = FF(sim), sid = a.dest, m = S.towns[sid], hh = sim.hh(p);
  if (!m || !hh || !isFairDay(sim, sid) || hh.ffFair === sim.today) return;
  if (F.fairs.some((x) => x.hh === hh.id)) return;
  if (hh.money < FAIR_FEE) return;
  const goods = {};
  let carried = 0;
  const list = Object.keys(hh.stock || {}).filter((g) => gdAny(g)).sort((x, y) => (m.price[y] ?? gdAny(y).base) - (m.price[x] ?? gdAny(x).base));
  for (const g of list) {
    if (carried >= FAIR_CARRY) break;
    const n = Math.min(STALL_API.sellable(sim, hh, g), FAIR_CARRY - carried);
    if (n < 0.5) continue;
    STALL_API.addLot(sim, m, sid, g, hh.id, n, 2, 0, { front: true });
    hh.stock[g] -= n; if (hh.stock[g] < 1e-4) delete hh.stock[g];
    goods[g] = n; carried += n;
  }
  if (!Object.keys(goods).length) return;
  hh.ffFair = sim.today;
  // 場所代：売る人の家計 → 町の蓄え
  hh.money -= FAIR_FEE; m.fund = num(m.fund) + FAIR_FEE;
  flow(sim, '市に来た村の売り手', '町の蓄え', FAIR_FEE, '市の場所代');
  F.stats.fairStalls++; F.stats.fairFees += FAIR_FEE;
  F.fairs.push({ sid, hh: hh.id, pid: p.id, until: S.t + (a.dur || 240), goods, money0: hh.money, day: sim.today });
  if (sim.rng.chance(0.3)) sim.remember(p, `${sim.town(sid).name}の市に、${Object.keys(goods).slice(0, 3).map(goodLabel).join('と')}を背負って売りに来た`, { emo: 0.25, imp: 0.3, k: 'work' });
}
function closeFairStall(sim, x) {
  const S = sim.S, F = FF(sim), m = S.towns[x.sid], hh = S.households[x.hh], p = S.people[x.pid];
  let back = 0;
  for (const g of Object.keys(x.goods)) {
    const L = STALL_API.lotsOf(sim, m, g, x.sid);
    for (let i = L.length - 1; i >= 0; i--) {
      const l = L[i];
      if (l.c !== 2 || l.o !== x.hh) continue;
      m.stock[g] = Math.max(0, num(m.stock[g]) - l.q);
      if (hh) stash(sim, hh, g, l.q);   // 売れ残りは背負って持ち帰る
      back += l.q;
      L.splice(i, 1);
    }
  }
  const earned = hh ? Math.max(0, hh.money - x.money0) : 0;
  F.stats.fairSold += earned;
  if (p && p.deathYear == null && p.memories && sim.rng.chance(0.4)) {
    sim.remember(p, earned >= 1 ? `${sim.town(x.sid).name}の市で${Math.round(earned)}銅貨ぶん売れた` : `${sim.town(x.sid).name}の市に出たが、ほとんど売れなかった`, { emo: earned >= 1 ? 0.4 : -0.3, imp: 0.3, k: 'work' });
  }
  void back;
}
export function foodflowHourly(sim) {
  const S = sim.S, F = FF(sim);
  if (!F.fairs.length) return;
  const h = sim.hour();
  F.fairs = F.fairs.filter((x) => {
    const p = S.people[x.pid];
    const here = p && p.deathYear == null && p.action?.type === 'stall' && p.action.dest === x.sid;
    if (!here || S.t >= x.until || h >= 17 || x.day !== sim.today) { closeFairStall(sim, x); return false; }
    return true;
  });
}
export function foodflowDaily(sim) {
  const F = FF(sim);
  // 日をまたいだ市の露店は必ず片づける
  for (const x of F.fairs) closeFairStall(sim, x);
  F.fairs = [];
  F.berry = {};
}

// ================================================================ おかずを買う（町の人）
export function sideDish(sim, p, hh, m) {
  if (!hh || !m || hh.house == null || hh.ffSide === sim.today) return;
  if (num(hh.money) < 30 || hh.members.length === 0) return;
  hh.ffSide = sim.today;
  const R = sim.rng, F = FF(sim);
  // 自分の家でとれる物は買わない
  const opts = SIDE.filter((g) => num(m.stock[g]) >= 1 && m.price[g] > 0 && gdAny(g)?.meals > 0 && num(hh.stock?.[g]) < 1);
  if (!opts.length) return;
  const g = R.weighted ? R.weighted(opts, (x) => Math.min(20, num(m.stock[x])) + 1) : R.pick(opts);
  const G = gdAny(g);
  const want = Math.max(1, Math.min(6, Math.ceil(Math.min(hh.members.length, 4) * 0.25 / G.meals)));
  const afford = Math.floor(num(hh.money) * 0.06 / m.price[g]);
  const qty = Math.min(want, afford, Math.floor(num(m.stock[g])));
  if (qty < 1) return;
  const price = m.price[g];
  const got = marketBuy(sim, p.s, g, qty, hh, { whole: true });   // 代金：家計 → 品の持ち主（作った家・商人）
  if (got <= 0) return;
  hh.food = num(hh.food) + got * G.meals; meal(sim, 'bought', got * G.meals);
  p.needs.pleasure = Math.min(100, p.needs.pleasure + 3);
  F.stats.side += got; F.stats.sideSpent += got * price;
}

// ================================================================ 4. 隊商と行商人が運べる品
// 今の20品のほか、市場にある「日持ち20日以上の食べ物」（チーズ・燻製・塩漬け・干し肉・干し果物・麦酒・蜂蜜・粉など）
export function tradeFoods(m) {
  const out = [];
  for (const g of Object.keys(m?.stock || {})) {
    if (GOODS[g]) continue;
    const G = matterGood(g);
    if (!G || !(G.meals > 0 || g === 'flour' || g === 'salt')) continue;
    if (G.keep && G.keep < 20) continue;
    if (num(m.stock[g]) < 3) continue;
    out.push(g);
  }
  return out;
}
export function tradeGoods(m) { return [...Object.keys(GOODS), ...tradeFoods(m)]; }
// 行き先の値段（まだ並んだことのない町では、珍しいので相場の1.3倍とみなす）
export function priceAt(m, g) { const pr = m?.price?.[g]; return pr > 0 ? pr : (gdAny(g)?.base || 1) * 1.3; }
export function targetOf(g) { return gdAny(g)?.target || 10; }

// 荷車の相乗り：町の荷車が出るとき、行き先で1.15倍以上に売れる日持ちする食べ物を、荷台の空きに少し積む
// お金：荷主（商人の家計・町の蓄え） → 出発地の品の持ち主。着いたら、行き先の商人 → 荷主（logistics.js の sellGoods）
export function sideCargo(sim, fromSid, toSid, payer) {
  const S = sim.S, a = S.towns[fromSid], b = S.towns[toSid];
  const none = { goods: {}, cost: 0 };
  if (!a || !b || !payer) return none;
  let best = null, br = 1.15;
  for (const g of tradeFoods(a)) {
    if (!(a.price[g] > 0) || num(a.stock[g]) < Math.max(3, targetOf(g) * 0.2)) continue;
    const r = priceAt(b, g) / a.price[g];
    if (r > br) { br = r; best = g; }
  }
  if (!best) return none;
  const price = a.price[best];
  const q = Math.min(8, Math.floor(num(a.stock[best]) / 2), Math.floor(Math.max(0, num(payer.money) - 20) * 0.3 / price));
  if (q < 1) return none;
  const got = marketBuy(sim, fromSid, best, q, payer, { whole: true });
  if (got <= 0) return none;
  const F = FF(sim); F.stats.convoyFood = (F.stats.convoyFood || 0) + got;
  return { goods: { [best]: got }, cost: got * price };
}
// 行商人の荷：日持ちする食べ物で、近く（48マス）の町で1.3倍以上に売れる物があれば、それを選ぶ
export function peddleFood(sim, sid) {
  const S = sim.S, m = S.towns[sid], s = sim.town(sid);
  if (!m || !s) return null;
  let best = null, br = 1.3;
  for (const g of tradeFoods(m)) {
    if (!(m.price[g] > 0) || num(m.stock[g]) < 4) continue;
    for (const q of S.world.settlements) {
      if (q.id === sid || S.towns[q.id]?.occupied || Math.hypot(q.x - s.x, q.z - s.z) >= 48) continue;
      const r = priceAt(S.towns[q.id], g) / m.price[g];
      if (r > br) { br = r; best = g; }
    }
  }
  if (best) { const F = FF(sim); F.stats.peddleFood = (F.stats.peddleFood || 0) + 1; }
  return best;
}

const API = { animalYield };
