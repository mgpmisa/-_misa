// 人としての欲求を忠実に（開発部）
//
// 1. 旅先で食べる・寝る
//    家から遠い人（家まで歩いて1時間ほど以上）が空腹や眠気を感じたら、家へ引き返さず、
//    いちばん近い町・村・民族の里で食べて寝る。宿屋が満室なら馬小屋、払えなければ野宿。
//    町が遠ければ、持っている弁当を食べるか、野で木の実や獲物をとる。寝るのはその場で野宿（危ない所は避ける）。
//    遠出の前には家の蔵から弁当を持っていく。依頼・任務・隊商の予定は壊さない（食べて寝たら続ける）。
// 2. 欲求がゼロのまま続いたときのつらさ
//    空腹：力と素早さが落ち、いらいらし、体力が減り、ついには餓死する。食べれば少しずつ戻る。
//    眠気：仕事と戦いの力と判断が落ち、けがをしやすくなり、ついにはその場で眠り込む。眠れば戻る。
//    娯楽・承認・性・怠惰が長くゼロ：気がふさぐ・自信をなくす・人恋しい・働きづめで疲れ切る。
// 3. 家に食べ物がなく、町でも手に入らない人は、野で食べ物を探す（狩人・採集の民・冒険者が得意）。
//
// ■ 本体からの呼び方（部長がつなぐ）
//   needsDecide(sim, p)        … decide の「特別な任務」の前。true なら行動を始めたので decide を終える
//   needsCands(sim, p, cands)  … decide の divineDecide のあと。旅の途中で家へ引き返す候補を、その場の候補に置き換える
//   needsArrive(sim, p, a)     … arrive の最後。旅先の食事・宿・野宿・野の食べ物
//   needsHourly(sim, p)        … hourlyPerson の最後（1人1時間に1回）。つらさの計算・弁当の支度・隊商での食事とまどろみ
//   needsLabel(p)              … 人の詳細欄の文（例：「空腹で力が出ない・寝不足でふらついている」）
//   NEEDS_LABEL / NEEDS_GO / NEEDS_PREF … ui.js 用
//
// ■ お金の流れ（どこからも湧かせない）
//   旅先の酒場・宿の食事  客（財布→家計の順） → 材料の仕入れ値は市場の金庫へ、残りは酒場／宿の主の家計（いなければ町の蓄え）
//                         ※ 本体の宿の食事（sim.js arrive の eat 'inn'）と同じ流れ
//   旅先の市場で買う      客 → 市場の金庫（94%）と市場組合の手数料（6%） ※ sim.buy と同じ割合。経済部の marketBuy ができたら差し替える
//   宿代・馬小屋代        客 → 宿の主の家計（いなければ酒場の主、それもいなければ町の蓄え） ※ buildings.js の lodge と同じ額
//   弁当                  家の蔵（hh.food）から持ち出すだけ。お金は動かない
//   野の食べ物・野宿      お金は動かない
import { clamp } from './rng.js';
import { T, W, tileAt, walkable } from './world.js';
import { spendable, pay, earn } from './property.js';
import { humanStats } from './society.js';
import { lodgingKeeper, innPlan, bldInteriorSize } from './buildings.js';
import { sleepPlan } from './chores.js';
import { tooDangerous } from './danger.js';
import { GOODS, JOBS } from './data.js';
import { marketBuy, personPayer } from './market.js';
import { wsTake } from './workshop.js';
import { dineCands, dineArrive, DINE_LABEL, DINE_GO, DINE_PREF } from './foodshop.js';   // 屋台・料理屋で外食する

// 試験用のお金の見張り：sim._nAudit に総額を数える関数を入れると、この仕組みの中で増えた・減ったお金を sim._nLeak に記録する
const audited = (name, fn) => function (sim, ...a) {
  if (!sim._nAudit) return fn(sim, ...a);
  const m0 = sim._nAudit(); const r = fn(sim, ...a); const d = sim._nAudit() - m0;
  if (Math.abs(d) > 1e-6) { const L = sim._nLeak = sim._nLeak || {}; L[name] = (L[name] || 0) + d; }
  return r;
};

// ---------- 目安の数 ----------
const AWAY = 48;          // 家までこれより遠ければ「遠出」（道を歩いておよそ1時間）
const NEAR_TOWN = 34;     // この距離までの町なら、弁当より町の温かい食事・宿を選ぶ
const FAR_TOWN = 70;      // 弁当も何もないとき、ここまでなら町まで歩く
const URGENT = new Set(['defend', 'rescue', 'alert', 'flee']);
const FEE_INN = { capital: 4, port: 3, village: 2 };   // buildings.js の FEE.inn と同じ
const FEE_STABLE = 1;
const FEE_TAVERN = 3;     // 宿屋のない町で酒場の隅に泊まる（sim.js の宿住まいと同じ額）
const FORAGERS = { hunter: 0.4, gatherer: 0.4, trapper: 0.35, ranger: 0.35, herbalist: 0.3, woodcutter: 0.2, farmer: 0.15, shepherd: 0.15, fisher: 0.2, charcoal: 0.15 };

const grade = (s) => (s.type === 'capital' ? 'capital' : s.type === 'port' || s.grade === 'town' ? 'port' : 'village');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------- 状態 ----------
function NX(sim) {
  const S = sim.S;
  if (!S.needsX) S.needsX = { v: 1, stats: {} };
  const st = S.needsX.stats;
  for (const k of ['wayEatInn', 'wayEatMarket', 'wayEatPack', 'wayEatFail', 'forage', 'forageOk', 'waySleepInn', 'waySleepStable', 'waySleepRough', 'waySleepCamp', 'packed', 'convoyMeal', 'faint', 'starved', 'snap', 'hurt', 'daze', 'turnHomeStopped']) if (st[k] == null) st[k] = 0;
  return S.needsX;
}
const ND = (p) => p.nd || (p.nd = { h0: 0, s0: 0, lo: {} });

// ---------- 家からの遠さ ----------
function homeSpot(sim, p) {
  const hs = sim.placeFor(p, 'home');
  return hs || sim.townOf(p);
}
function awayInfo(sim, p) {
  // 自分の家のそばにいる人は、それだけで「遠出ではない」（ほとんどの人はここで済む）
  const hb = sim.homeOf(p);
  if (hb && dist(p.pos, hb.door) <= AWAY) return { home: hb.door, d: dist(p.pos, hb.door), away: false };
  const home = homeSpot(sim, p);
  const d = dist(p.pos, home);
  return { home, d, away: d > AWAY };
}

// ---------- 近くの町 ----------
function atWar(sim, a, b) {
  if (a == null || b == null || a === b) return false;
  const K = sim.S.kingdoms;
  return K[a]?.war?.with === b || K[b]?.war?.with === a;
}
function myKingdom(sim, p) { return sim.townOf(p)?.kingdom; }
// 泊まれる・食べられる町を近い順に（戦争中の敵国と占領された町は除く）
function nearestTowns(sim, p, maxD) {
  const S = sim.S, out = [], k = myKingdom(sim, p);
  // 盗賊とお尋ね者は町に入らず、野で済ませる
  if (sim.hh(p)?.bandits || S.wanted?.[p.id]) return out;
  for (const s of S.world.settlements) {
    const t = S.towns[s.id];
    if (!t || t.occupied) continue;
    if (atWar(sim, k, s.kingdom)) continue;
    const d = dist(p.pos, s) - (s.r || 6) * 0.5;
    if (d <= maxD) out.push({ s, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}
function bOf(sim, sid, type) {
  const id = sim.S.bld?.at?.[sid]?.[type];
  if (id != null) return sim.building(id);
  return null;
}
function tavernOf(sim, s) { return sim.townBuilding(s, 'tavern'); }
function marketOf(sim, s) { return sim.townBuilding(s, 'market') || bOf(sim, s.id, 'genstore'); }
const doorOf = (b) => ({ x: b.door.x, z: b.door.z });
function hasFood(sim, sid) { const m = sim.S.towns[sid]; return !!m && ['bread', 'fish', 'meat'].some((g) => (m.stock[g] || 0) >= 1); }
function mealCost(sim, sid) {
  const m = sim.S.towns[sid];
  const g = ['bread', 'fish', 'meat'].find((x) => (m.stock[x] || 0) >= 1);
  return g ? Math.round(m.price[g] * 1.6 + 1) : Infinity;
}
function keeperOf(sim, sid, jobs) {
  let best = null;
  for (const q of sim.living()) {
    if (q.s !== sid || !q.needs || q.jail != null || !jobs.includes(q.job)) continue;
    if (!best || jobs.indexOf(q.job) < jobs.indexOf(best.job)) best = q;
  }
  return best;
}
// 受け取り手の家計へ（いなければ町の蓄えへ）。buildings.js の payTo と同じ流れ
function payTo(sim, p, amt, keeper, sid) {
  if (amt <= 0) return 0;
  pay(sim, p, amt);
  if (keeper && sim.hh(keeper)) earn(sim, keeper, amt, 0.3);
  else sim.S.towns[sid].fund = (sim.S.towns[sid].fund || 0) + amt;
  return amt;
}

// ---------- 野の場所 ----------
function campSpot(sim, p, x, z, r = 5) {
  const ok = (t, xx, zz) => t !== T.BLD && t !== T.ROAD && !tooDangerous(sim, p, xx, zz);
  return sim.randomNear(x, z, r, ok) || sim.randomNear(x, z, r * 2, ok) || sim.randomNear(x, z, 2) || { x: Math.round(x), z: Math.round(z) };
}
function forageSpot(sim, p) {
  const good = (t) => t === T.FOREST || t === T.DENSE || t === T.JUNGLE || t === T.GRASS || t === T.SAVANNA;
  return sim.randomNear(p.pos.x, p.pos.z, 8, (t, x, z) => good(t) && !tooDangerous(sim, p, x, z))
    || sim.randomNear(p.pos.x, p.pos.z, 16, (t, x, z) => good(t) && !tooDangerous(sim, p, x, z));
}

// ================================================================ 決める（decide の最初）
const mealTimeAt = (h) => (h >= 6 && h < 8.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20);
export const needsDecide = audited('needsDecide', needsDecideImpl);
function needsDecideImpl(sim, p) {
  if (!p.needs || p.jail != null || p.fight || p.deathYear != null) return false;
  const age = sim.ageOf(p);
  if (age < 8) return false;
  const hh = sim.hh(p);
  if (!hh) return false;
  NX(sim);
  const n = p.needs, h = sim.hour();
  const m = p.mission && !(p.mission.until && sim.S.t > p.mission.until) ? p.mission : null;
  const urgent = m && URGENT.has(m.type);
  const ai = awayInfo(sim, p);
  if (ai.away) {
    const sp = sleepPlan(sim, p, h, age);
    let sleepy, hungry;
    if (urgent) { sleepy = false; hungry = n.hunger < 10 && (p.ration || 0) >= 1; }
    else if (m) { sleepy = n.sleep < 25 || (sp.bedtime && n.sleep < 50 && (m.until || Infinity) - sim.S.t > 360); hungry = n.hunger < 35; }
    else { sleepy = sp.bedtime || n.sleep < 20; hungry = n.hunger < 45 || (mealTimeAt(h) && n.hunger < 65 && !sp.bedtime); }
    if (hungry && (!sleepy || n.hunger < 30)) return startWayEat(sim, p, ai, urgent);
    if (sleepy) return startWaySleep(sim, p, ai, sp);
    if (!m && (p.ration || 0) < 1 && (p.quest != null || p.pilgrim) && h >= 6 && h < 19) buyRationNearby(sim, p);
    return false;
  }
  // 家の近く：弁当の支度（依頼や任務で遠くへ出る人）
  if ((p.quest != null || (m && !urgent)) && (p.ration || 0) < 2) packRation(sim, p, hh);
  // 家にも町にも食べ物がないときは、野で探す
  if (n.hunger < 12 && (p.nd?.h0 || 0) >= 1 && !urgent && !canEatHere(sim, p, hh)) {
    if ((p.ration || 0) >= 1) { sim.startAction(p, { type: 'wayeat', place: null, dur: 15, food: 'pack' }); return true; }
    return startForage(sim, p);
  }
  return false;
}
function canEatHere(sim, p, hh) {
  if (hh.food >= 1 && hh.house != null) return true;
  const age = sim.ageOf(p);
  if (age < 6) return hh.food >= 0.5;
  if (hh.money >= sim.price('bread', p.s) && sim.marketHasFood(p.s)) return true;
  if (spendable(sim, p) >= mealCost(sim, p.s)) return true;
  return false;
}

function startWayEat(sim, p, ai, urgent) {
  const hasPack = (p.ration || 0) >= 1;
  if (!urgent) {
    const towns = nearestTowns(sim, p, hasPack ? NEAR_TOWN : FAR_TOWN).filter((o) => o.d < ai.d);
    for (const { s } of towns) {
      if (!hasFood(sim, s.id)) continue;
      const tav = tavernOf(sim, s) || bOf(sim, s.id, 'inn');
      if (tav && spendable(sim, p) >= mealCost(sim, s.id)) { sim.startAction(p, { type: 'wayeat', place: { ...doorOf(tav), bld: tav.open ? null : tav.id }, dur: 30, food: 'inn', dest: s.id }); return true; }
      const mk = marketOf(sim, s);
      const g = ['bread', 'fish', 'meat'].find((x) => (sim.S.towns[s.id].stock[x] || 0) >= 1);
      if (g && spendable(sim, p) >= sim.S.towns[s.id].price[g]) { sim.startAction(p, { type: 'wayeat', place: mk ? doorOf(mk) : (sim.randomNear(s.x, s.z, 2) || { x: s.x, z: s.z }), dur: 20, food: 'market', dest: s.id }); return true; }
    }
    // 町がないか、払えない。家のほうが近ければ家へ帰る（ふつうの decide にまかせる）
    if (!hasPack && ai.d < FAR_TOWN) return false;
  }
  if (hasPack) { sim.startAction(p, { type: 'wayeat', place: null, dur: urgent ? 10 : 20, food: 'pack' }); return true; }
  if (urgent) return false;
  return startForage(sim, p);
}
function startForage(sim, p) {
  const spot = forageSpot(sim, p);
  if (!spot) return false;
  const skill = FORAGERS[p.job] || ((JOBS[p.job]?.combat || 0) >= 2 ? 0.2 : 0);
  sim.startAction(p, { type: 'forage', place: spot, dur: Math.round(70 - skill * 60), food: 'forage' });
  return true;
}
function startWaySleep(sim, p, ai, sp) {
  const until = sp.bedtime ? sp.untilHour : null;
  const dur = sp.bedtime ? 0 : 180;
  const towns = nearestTowns(sim, p, NEAR_TOWN).filter((o) => o.d < ai.d);
  for (const { s } of towns) {
    const inn = bOf(sim, s.id, 'inn');
    const tav = tavernOf(sim, s);
    const where = inn || tav;
    if (!where) {
      // 宿のない里：村の真ん中で寝かせてもらう（お金は動かない）
      const spot = sim.randomNear(s.x, s.z, 3, (t) => t !== T.BLD) || { x: s.x, z: s.z };
      sim.startAction(p, { type: 'sleep', place: spot, dur, untilHour: until, food: 'way', dest: s.id });
      return true;
    }
    // bld は着いてから決める（buildings.js の宿の処理は自分の町の宿代を取るので、そちらに渡さない）
    sim.startAction(p, { type: 'sleep', place: doorOf(where), dur, untilHour: until, food: 'way', dest: s.id });
    return true;
  }
  // 町が遠い：その場で野宿
  const spot = campSpot(sim, p, p.pos.x, p.pos.z, 4);
  sim.startAction(p, { type: 'sleep', place: spot, dur, untilHour: until, food: 'camp' });
  return true;
}

// ---------- 弁当 ----------
function packRation(sim, p, hh) {
  if (!hh || hh.food < 3 || hh.bandits) return;
  const keep = Math.max(2, hh.members.length * 1.5);
  const take = Math.min(2 - (p.ration || 0), Math.floor(hh.food - keep));
  if (take <= 0) return;
  hh.food -= take;
  p.ration = (p.ration || 0) + take;
  NX(sim).stats.packed += take;
}
// 旅先の市場で弁当（パン）を買い足す
function buyRationNearby(sim, p) {
  const s = sim.S.world.settlements.find((q) => dist(p.pos, q) <= (q.r || 6) + 2);
  if (!s || !sim.S.towns[s.id] || sim.S.towns[s.id].occupied) return;
  const m = sim.S.towns[s.id];
  if ((m.stock.bread || 0) < 3) return;
  const cost = m.price.bread;
  if (spendable(sim, p) < cost + 8) return;
  if (marketSell(sim, p, s.id, 'bread', cost) >= 1) p.ration = (p.ration || 0) + GOODS.bread.meals;
}
// 市場から1つ買う（sim.buy と同じ割合で市場の金庫と手数料へ）。経済部の marketBuy ができたら差し替える
function marketSell(sim, p, sid, g, cost) {
  return marketBuy(sim, sid, g, 1, personPayer(sim, p), { whole: true, price: cost });   // 代金は品の持ち主（商人・作り手・町）へ（market.js）
}

// ================================================================ decide の候補を直す（旅の途中で家へ引き返さない）
const HOMEBOUND = new Set(['sleep', 'eat', 'shop', 'rest', 'home', 'beg', 'askfood']);
export const needsCands = audited('needsCands', needsCandsImpl);
function needsCandsImpl(sim, p, cands) {
  if (!cands.length || !p.needs || p.jail != null) return;
  // 空腹のとき、財布と相談して屋台・料理屋で食べることもある（foodshop.js）
  dineCands(sim, p, cands);
  // 寝不足だと判断が鈍る：いちばん良い行動を選びそこねる
  const ss = p.nd ? sleepStage(p.nd) : 0;
  if (ss) { for (const c of cands) c.score += sim.rng.range(-1.6, 1.6) * ss; NX(sim).stats.daze++; }
  // 飢えて弱った人は、逃げ込む先の家で食べる（体力が落ちて「逃げたい」が勝ち続け、家に食べ物があっても食べずに弱っていた）
  if (p.needs.hunger < 25) {
    const flee = cands.find((c) => c.type === 'flee');
    const eat = flee && cands.find((c) => c.type === 'eat' && !c.food && c.place && flee.place && dist(c.place, flee.place) < 2);
    if (eat && eat.score <= flee.score) { eat.score = flee.score + 0.5; NX(sim).stats.eatAtRefuge = (NX(sim).stats.eatAtRefuge || 0) + 1; }
  }
  const busy = p.quest != null || p.mission || p.pilgrim;
  if (!busy) return;
  const ai = awayInfo(sim, p);
  if (!ai.away) return;
  let changed = 0;
  for (const c of cands) {
    if (!HOMEBOUND.has(c.type) || !c.place || c.food === 'way' || c.food === 'camp') continue;
    if (dist(c.place, ai.home) > 10) continue;
    if (c.type === 'rest') { c.place = campSpot(sim, p, p.pos.x, p.pos.z, 2); c.dur = Math.min(c.dur || 40, 40); }
    else c.score = -99;
    changed++;
  }
  if (changed) NX(sim).stats.turnHomeStopped += changed;
}

// ================================================================ 着いたとき
export const needsArrive = audited('needsArrive', needsArriveImpl);
function needsArriveImpl(sim, p, a) {
  if (!a) return;
  if (a.type === 'wayeat') { arriveEat(sim, p, a); return; }
  if (a.type === 'dine') { dineArrive(sim, p, a); return; }   // 屋台・料理屋の食事（客 → 店の主）
  if (a.type === 'forage') { arriveForage(sim, p, a); return; }
  if (a.type === 'sleep' && (a.food === 'way' || a.food === 'camp')) arriveSleep(sim, p, a);
}
function arriveEat(sim, p, a) {
  const st = NX(sim).stats, n = p.needs, R = sim.rng;
  const sid = a.dest;
  if (a.food === 'pack') {
    if ((p.ration || 0) >= 1) {
      p.ration -= 1; n.hunger = Math.min(100, n.hunger + 45); st.wayEatPack++;
      if (p.memories && R.chance(0.05)) sim.remember(p, R.pick(['道ばたに腰を下ろして、持ってきた弁当を食べた', '干し肉をかじりながら先を急いだ', '木陰で黒パンを食べた。固かった']), { emo: 0.1, imp: 0.2, k: 'meal' });
    } else st.wayEatFail++;
    a.until = sim.S.t + 15;
    return;
  }
  if (sid == null || !sim.S.towns[sid]) { st.wayEatFail++; a.until = sim.S.t + 5; return; }
  const town = sim.town(sid), m = sim.S.towns[sid];
  if (a.food === 'inn') {
    // 旅先の酒場の食事：材料は市場から（仕入れ値は市場の金庫へ）、残りは酒場の主へ
    const g = ['bread', 'fish', 'meat'].find((x) => (m.stock[x] || 0) >= 1);
    const cost = g ? Math.round(m.price[g] * 1.6 + 1) : 0;
    if (g && spendable(sim, p) >= cost) {
      const keeper = keeperOf(sim, sid, ['innkeeper', 'hostkeeper']);
      const kh = keeper && sim.hh(keeper);
      pay(sim, p, cost);
      if (kh) { kh.money += cost; if (wsTake(sim, kh, g, 1, '旅の客', cost) < 1) marketBuy(sim, sid, g, 1, kh, { force: true }); }   // 客 → 主。主は材料を持ち主から仕入れる
      else { m.fund = (m.fund || 0) + cost; marketBuy(sim, sid, g, 1, 't' + sid, { force: true }); }   // 主がいなければ町の炊き出し（町の蓄えで材料を買う）
      n.hunger = Math.min(100, n.hunger + 30 * GOODS[g].meals);
      n.pleasure = Math.min(100, n.pleasure + 4);
      st.wayEatInn++;
      if (p.memories && R.chance(0.08)) sim.remember(p, `旅の途中、${town.name}の${sim.building(a.bld)?.name || '酒場'}で${GOODS[g].name}の料理を食べた`, { emo: 0.3, imp: 0.3, k: 'meal' });
      topUpRation(sim, p, sid);
      return;
    }
  }
  // 市場で買って食べる
  const g = ['bread', 'fish', 'meat'].find((x) => (m.stock[x] || 0) >= 1);
  if (g && spendable(sim, p) >= m.price[g]) {
    marketSell(sim, p, sid, g, m.price[g]);
    n.hunger = Math.min(100, n.hunger + 30 * GOODS[g].meals);
    st.wayEatMarket++;
    if (p.memories && R.chance(0.05)) sim.remember(p, `${town.name}の市場で${GOODS[g].name}を買って、歩きながら食べた`, { emo: 0.2, imp: 0.2, k: 'meal' });
    topUpRation(sim, p, sid);
    a.until = sim.S.t + 15;
    return;
  }
  st.wayEatFail++;
  a.until = sim.S.t + 5;
  if ((p.ration || 0) >= 1) { p.ration -= 1; n.hunger = Math.min(100, n.hunger + 45); st.wayEatPack++; }
}
function topUpRation(sim, p, sid) {
  if ((p.ration || 0) >= 2) return;
  const m = sim.S.towns[sid];
  if ((m.stock.bread || 0) < 3) return;
  if (spendable(sim, p) < m.price.bread + 8) return;
  marketSell(sim, p, sid, 'bread', m.price.bread);
  p.ration = (p.ration || 0) + GOODS.bread.meals;
}
function arriveForage(sim, p, a) {
  const st = NX(sim).stats, n = p.needs, R = sim.rng;
  st.forage++;
  const t = tileAt(sim.S.world, Math.round(p.pos.x), Math.round(p.pos.z));
  const skill = FORAGERS[p.job] || ((JOBS[p.job]?.combat || 0) >= 2 ? 0.2 : 0);
  const winter = sim.seasonIdx() === 3 ? -0.2 : 0;
  const land = t === T.FOREST || t === T.DENSE || t === T.JUNGLE ? 0.1 : 0;
  const ok = R.chance(clamp(0.4 + skill + winter + land, 0.1, 0.92));
  if (ok) {
    st.forageOk++;
    n.hunger = Math.min(100, n.hunger + (skill >= 0.3 ? 50 : 38));
    // 腕のいい狩人・採集の民は、家の近くなら余りを持ち帰る
    const hh = sim.hh(p);
    if (skill >= 0.3 && hh && hh.house != null && !awayInfo(sim, p).away && R.chance(0.5)) hh.food += 1;
    if (p.memories && R.chance(0.1)) sim.remember(p, R.pick(skill >= 0.3 ? ['罠にかかった野うさぎを焼いて食べた', '森で木の実と茸をたっぷり集めた', '川で魚を手づかみにして焼いた'] : ['野いちごと木の実で飢えをしのいだ', '食べられる草を探して、なんとか腹をふさいだ']), { emo: 0.2, imp: 0.3, k: 'meal' });
  } else {
    n.hunger = Math.min(100, n.hunger + 6);
    if (p.memories && R.chance(0.1)) sim.remember(p, '野で食べ物を探したが、ほとんど見つからなかった', { emo: -0.3, imp: 0.3, k: 'hunger' });
  }
}
function nightKey(sim) { return Math.floor((sim.S.t - 720) / 1440); }
const planCache = new Map();
function bedsOf(b) {
  try {
    const [Wd, Dd] = bldInteriorSize(b);
    const k = Wd * 100 + Dd;
    if (!planCache.has(k)) planCache.set(k, innPlan(Wd, Dd).beds);
    return planCache.get(k);
  } catch (e) { return []; }
}
function arriveSleep(sim, p, a) {
  const st = NX(sim).stats, R = sim.rng;
  if (a.food === 'camp' || a.dest == null) {
    st.waySleepCamp++;
    if (p.memories && R.chance(0.1)) sim.remember(p, R.pick(['焚き火をおこして、星の下で野宿した', '街道わきの木の根もとで、外套にくるまって眠った', '岩かげで野宿した。夜の獣の声が気になった']), { emo: -0.05, imp: 0.3, k: 'lodge' });
    return;
  }
  const sid = a.dest, s = sim.town(sid);
  if (!s || !sim.S.towns[sid]) return;
  const inn = bOf(sim, sid, 'inn');
  const tav = tavernOf(sim, s);
  if (inn) {
    const B = sim.S.bld;
    const nk = nightKey(sim);
    let rec = B.nights[inn.id];
    if (!rec || rec.n !== nk) rec = B.nights[inn.id] = { n: nk, g: {}, st: 0 };
    const keeper = keeperOf(sim, sid, ['hostkeeper', 'innkeeper']) || lodgingKeeper(sim, sid);
    const fee = FEE_INN[grade(s)];
    let bed = rec.g[p.id] ?? -2;
    if (bed === -2) {
      const beds = bedsOf(inn);
      const used = new Set(Object.values(rec.g).filter((i) => i >= 0));
      bed = beds.findIndex((b, i) => !used.has(i) && !b.double);
      if (bed < 0) bed = beds.findIndex((b, i) => !used.has(i));
      if (bed >= 0 && spendable(sim, p) >= fee) {
        rec.g[p.id] = bed;
        payTo(sim, p, fee, keeper, sid);
        st.waySleepInn++;
        B.stats.lodge = (B.stats.lodge || 0) + 1;
        p.inside = inn.id; a.bld = inn.id;
        if (p.memories && R.chance(0.1)) sim.remember(p, `旅の途中、${s.name}の${inn.name}に泊まった`, { emo: 0.2, imp: 0.3, k: 'lodge' });
        return;
      }
      rec.g[p.id] = -1;
      if (spendable(sim, p) >= FEE_STABLE) {
        payTo(sim, p, FEE_STABLE, keeper, sid);
        rec.st = (rec.st || 0) + 1;
        st.waySleepStable++;
        B.stats.lodgeStable = (B.stats.lodgeStable || 0) + 1;
        const stable = s.buildings.map((id) => sim.building(id)).find((x) => x && x.type === 'stable' && Math.hypot(x.x - inn.x, x.z - inn.z) < 16);
        if (stable) { p.inside = stable.id; a.bld = stable.id; p.pos = { x: stable.door.x, z: stable.door.z }; }
        if (p.memories && R.chance(0.2)) sim.remember(p, bed < 0 ? `${inn.name}は満室で、馬小屋のわらの上で寝た` : `宿代が足りず、${inn.name}の馬小屋の隅を借りて寝た`, { emo: -0.3, imp: 0.35, k: 'lodge' });
        return;
      }
    } else if (bed >= 0) { p.inside = inn.id; a.bld = inn.id; st.waySleepInn++; return; }
    st.waySleepRough++;
    B.stats.lodgeRough = (B.stats.lodgeRough || 0) + 1;
    if (p.memories && R.chance(0.2)) sim.remember(p, `${inn.name}に泊まれず、軒下で夜を明かした`, { emo: -0.5, imp: 0.4, k: 'lodge' });
    return;
  }
  if (tav) {
    // 宿屋のない町：酒場の隅に泊めてもらう
    if (spendable(sim, p) >= FEE_TAVERN) {
      payTo(sim, p, FEE_TAVERN, keeperOf(sim, sid, ['innkeeper', 'hostkeeper']), sid);
      p.inside = tav.id; a.bld = tav.id;
      st.waySleepInn++;
      return;
    }
    st.waySleepRough++;
    return;
  }
  // 宿のない里：村の真ん中で寝かせてもらう
  st.waySleepCamp++;
  if (p.memories && R.chance(0.15) && s.tribal) sim.remember(p, `${s.name}の人たちが、焚き火のそばで寝かせてくれた`, { emo: 0.3, imp: 0.4, k: 'lodge' });
}

// ================================================================ 1時間ごと（hourlyPerson の最後）
export const needsHourly = audited('needsHourly', needsHourlyImpl);
function needsHourlyImpl(sim, p) {
  if (!p.needs || p.deathYear != null) return;
  const n = p.needs, a = p.action, R = sim.rng;
  const sleeping = a && a.type === 'sleep' && a.phase === 'do';
  const nd = p.nd;
  // 何ともない人は軽く済ませる
  if (!nd && n.hunger > 5 && n.sleep > 5 && n.pleasure > 5 && n.esteem > 5 && n.sloth > 5 && n.lust > 5 && !a?.convoy) { packOnDeparture(sim, p); return; }
  const d = ND(p);
  const st = NX(sim).stats;
  // 隊商・船の乗り手：荷車の上で食べ、夜はまどろむ（行動は変えない）
  if (a?.convoy != null) {
    if (n.hunger < 40) {
      if ((p.ration || 0) >= 1) { p.ration -= 1; n.hunger = Math.min(100, n.hunger + 45); st.convoyMeal++; }
      else {
        const s = sim.S.world.settlements.find((q) => dist(p.pos, q) <= (q.r || 6) + 4 && sim.S.towns[q.id] && !sim.S.towns[q.id].occupied);
        const m = s && sim.S.towns[s.id];
        const g = m && ['bread', 'fish', 'meat'].find((x) => (m.stock[x] || 0) >= 1);
        if (g && spendable(sim, p) >= m.price[g]) { marketSell(sim, p, s.id, g, m.price[g]); n.hunger = Math.min(100, n.hunger + 30 * GOODS[g].meals); st.convoyMeal++; }
      }
    }
    const h = sim.hour();
    if ((h >= 22 || h < 5) && n.sleep < 70) n.sleep = Math.min(100, n.sleep + 9);
  }
  // 空腹：0のまま続いた時間
  if (n.hunger < 3) d.h0 += 1;
  else if (n.hunger > 30) d.h0 = Math.max(0, d.h0 - 3);
  else d.h0 = Math.max(0, d.h0 - 0.5);
  // 眠気
  if (n.sleep < 3 && !sleeping) d.s0 += 1;
  else if (sleeping) d.s0 = Math.max(0, d.s0 - 4);
  else if (n.sleep > 30) d.s0 = Math.max(0, d.s0 - 1);
  // ほかの欲求
  for (const k of ['pleasure', 'esteem', 'lust', 'sloth']) {
    if (n[k] < 3) d.lo[k] = (d.lo[k] || 0) + 1;
    else if (n[k] > 25) delete d.lo[k];
  }
  const hs = hungerStage(d), ss = sleepStage(d);
  // 気分
  let moodD = 0;
  if (hs) moodD -= hs * 3;
  if (ss) moodD -= ss * 2.5;
  if ((d.lo.pleasure || 0) >= 12) moodD -= 3;
  if ((d.lo.esteem || 0) >= 12) moodD -= 2;
  if ((d.lo.lust || 0) >= 24) moodD -= 1;
  if ((d.lo.sloth || 0) >= 8) moodD -= 2;
  if (moodD) p.mood = clamp(p.mood + moodD, 0, 100);
  // 空腹：体力が減る。ついには餓死
  if (d.h0 >= 6) {
    const rate = d.h0 >= 36 ? 0.016 : 0.008;
    p.hp = Math.max(1, p.hp - (p.maxhp || 40) * rate);
    if (d.h0 >= 96 && p.hp <= (p.maxhp || 40) * 0.12 && R.chance(0.25)) {
      st.starved++;
      sim.remember(p, '何日も食べられず、力尽きた', { emo: -1, imp: 1, k: 'hunger' });
      sim.pushLog(`${p.given}は何日も食べ物にありつけず、飢えて倒れた。`, 'event', [p.id], p.pos);
      sim.die(p, 'hunger');
      return;
    }
    if (d.h0 === 24 || d.h0 === 48) { sim.remember(p, d.h0 === 24 ? 'まる一日、何も口にしていない。目がかすむ' : '空腹で足がもつれ、倒れそうになった', { emo: -0.7, imp: 0.6, k: 'hunger' }); }
  }
  // 空腹・寝不足でいらいらする（近くの人にきつく当たる）
  if ((hs >= 1 || ss >= 1) && !sleeping && !p.talk && R.chance(0.04 * (hs + ss))) snap(sim, p, hs >= ss ? '空腹' : '寝不足');
  // 寝不足：仕事中のけが・ぼんやり・眠り込み
  if (ss >= 1 && a && !sleeping && !p.fight) {
    if (a.type === 'work' && R.chance(0.04 * ss)) {
      p.hp = Math.max(1, p.hp - (p.maxhp || 40) * 0.08);
      st.hurt++;
      if (p.memories) sim.remember(p, '寝不足でぼんやりして、仕事中に手をけがした', { emo: -0.4, imp: 0.4, k: 'hurt' });
    }
  }
  // 逃げている・駆けつけている最中は気が張っていて、もう少し持ちこたえる。眠り込んで起こされたら、しばらくは踏ん張る
  const faintAt = a && URGENT.has(a.type) ? 14 : 8;
  if (d.s0 >= faintAt && !sleeping && !p.fight && a?.convoy == null && p.jail == null && !(d.fcd > sim.S.t)) {
    st.faint++;
    d.fcd = sim.S.t + 120;
    sim.startAction(p, { type: 'sleep', place: null, dur: 240, food: 'faint' });
    if (sim.isWatched(p)) sim.pushLog(`${p.given}は眠気に勝てず、その場に倒れるように眠り込んだ。`, 'event', [p.id], p.pos);
    if (p.memories && !p.memories.some((m) => m.k === 'faint' && sim.today - m.t < 1)) sim.remember(p, '眠気に勝てず、道ばたで眠り込んでしまった', { emo: -0.4, imp: 0.45, k: 'faint' });
  }
  applyPenalty(sim, p, d, hs, ss);
  packOnDeparture(sim, p);
  // もう何ともなければ片づける
  if (!d.h0 && !d.s0 && !Object.keys(d.lo).length && !d.pen) delete p.nd;
}
const hungerStage = (d) => (d.h0 >= 24 ? 2 : d.h0 >= 3 ? 1 : 0);
const sleepStage = (d) => (d.s0 >= 5 ? 2 : d.s0 >= 2 ? 1 : 0);

// 遠くへ出かける人は、家の近くにいるうちに弁当を持つ
function packOnDeparture(sim, p) {
  const a = p.action;
  if (!a || a.phase !== 'walk' || (p.ration || 0) >= 2 || a.tx == null) return;
  const age = sim.ageOf(p);
  if (age < 12) return;
  const hh = sim.hh(p);
  if (!hh || hh.house == null || hh.food < 3) return;
  const home = sim.building(hh.house);
  if (!home) return;
  const d0 = dist(p.pos, home.door);
  if (d0 > 20) return;
  if (Math.hypot(a.tx - home.door.x, a.tz - home.door.z) <= AWAY) return;
  packRation(sim, p, hh);
}

function snap(sim, p, why) {
  const q = sim.nearby(p, 3).find((o) => o.needs && !o.talk && !o.fight && o.deathYear == null);
  if (!q) return;
  const R = sim.rng;
  sim.relMut(p, q).a = clamp(sim.rel(p, q).a - 2, -100, 100);
  sim.relMut(q, p).a = clamp(sim.rel(q, p).a - 4, -100, 100);
  NX(sim).stats.snap++;
  if (p.memories && R.chance(0.3)) sim.remember(p, `${why}でいらいらして、${q.given}にきつく当たってしまった`, { emo: -0.3, imp: 0.35, about: [q.id], k: 'quarrel' });
  if (q.memories && R.chance(0.3)) sim.remember(q, `${p.given}に八つ当たりされた`, { emo: -0.3, imp: 0.3, about: [p.id], k: 'quarrel' });
}

// 力・素早さ・仕事の出来・身のこなしを下げる（humanStats を計算し直してから掛ける。ほかの仕組みが計算し直したら、次の1時間でまた掛ける）
function applyPenalty(sim, p, d, hs, ss) {
  let atk = 1, def = 1, spd = 1, work = 1, evade = 1;
  if (hs === 1) { atk *= 0.85; spd *= 0.9; work *= 0.85; }
  if (hs === 2) { atk *= 0.6; spd *= 0.7; work *= 0.6; def *= 0.85; }
  if (ss === 1) { atk *= 0.85; def *= 0.85; work *= 0.8; spd *= 0.95; evade *= 0.7; }
  if (ss === 2) { atk *= 0.7; def *= 0.7; work *= 0.65; spd *= 0.85; evade *= 0.4; }
  if ((d.lo.sloth || 0) >= 8) work *= 0.85;
  if ((d.lo.pleasure || 0) >= 12) work *= 0.95;
  const on = atk < 1 || def < 1 || spd < 1 || work < 1;
  if (!on && !d.pen) return;
  try { Object.assign(p, humanStats(sim, p)); } catch (e) { return; }
  if (!on) { d.pen = false; return; }
  d.pen = true;
  p.atk = Math.max(1, Math.round(p.atk * atk));
  p.def = Math.max(0, Math.round(p.def * def));
  const m = p.gr?.m;
  if (m) { m.spd *= spd; m.work *= work; m.evade *= evade; }
}

// ================================================================ 画面
export function needsLabel(p) {
  const d = p?.nd;
  const out = [];
  if (d) {
    const hs = hungerStage(d), ss = sleepStage(d);
    if (d.h0 >= 72) out.push('飢えて死にかけている');
    else if (hs === 2) out.push('飢えで目がかすみ、足がもつれる');
    else if (hs === 1) out.push('空腹で力が出ない');
    if (ss === 2) out.push('寝不足でふらつき、今にも眠り込みそう');
    else if (ss === 1) out.push('寝不足でふらついている');
    if ((d.lo.pleasure || 0) >= 12) out.push('楽しみがなく気がふさいでいる');
    if ((d.lo.esteem || 0) >= 12) out.push('認められず自信をなくしている');
    if ((d.lo.lust || 0) >= 24) out.push('人恋しい');
    if ((d.lo.sloth || 0) >= 8) out.push('働きづめで疲れ切っている');
  }
  if ((p?.ration || 0) >= 1) out.push(`弁当${Math.floor(p.ration)}食分を持っている`);
  return out.join('・');
}
export const NEEDS_LABEL = { wayeat: '旅先で食事をしている', forage: '野で食べ物を探している', ...DINE_LABEL };
export const NEEDS_GO = { wayeat: '近くで食事をとろうとしている', forage: '食べ物を探しに野へ向かっている', ...DINE_GO };
export const NEEDS_PREF = { wayeat: '旅先の食事', forage: '野の食べ物探し', ...DINE_PREF };
export function needsSummary(sim) { return { ...(sim.S.needsX?.stats || {}) }; }
