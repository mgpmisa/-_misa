// パーティの暮らし（開発部）
//
// 社長の指示：
//   1. 人それぞれ歩く速さが違う。パーティは一番遅い人に速さを合わせ、遅れた人がいればほかの人は待つ。
//   2. パーティを組んだら、解散するまで依頼・移動・食事・寝る・休みを一緒にする。行き先はリーダーが決める。
//      家には帰らず宿屋に泊まる（同じ宿にまとめる。満室なら馬小屋、町が遠ければ一緒に野宿）。
//      けが・病気・家族の急用で抜けることはある。解散したらそれぞれの暮らしに戻る。
//   3. 一緒に過ごした時間・一緒に戦った・助け合った・危機を越えた出来事で「絆値」が上がり、
//      けんか・報酬の取り分の不満・見捨てられたことで下がる。
//      絆値に応じて、仲間といるときだけ「チームの力」（攻め・守り・命中・逃げない勇気・回復の効き）が加わる。絆100で +15%。
//      絆が深いと、解散しても友情や恋が残り、記憶と会話に出る。
//   4. 結婚している人・子のいる人は、家族に会えない日が続くと不満がたまる（家族の側も）。
//      一定を超えるとパーティを抜けて家に帰る。家に帰ると不満が解ける。
//      家族持ちは長い遠征の依頼を受けず（独り身は何十日でもよいが、家族持ちは3〜5日まで）、近場の依頼を選ぶ。
//
// ■ 本体からの呼び方（部長がつなぐ）
//   partyDecide(sim, p)          … sim.js decide の needsDecide の直前。true なら行動を始めたので decide を終える
//   partyCands(sim, p, cands)    … sim.js decide の needsCands のあと。パーティの人の「家に帰る」候補を外す
//   partyAfterDecide(sim, p)     … sim.js decide の最後の startAction のあと。リーダーが決めたら仲間に合わせさせる
//   partySpeedMul(sim, p, dt)    … sim.js walk の速さの掛け算（一番遅い人に合わせる・遅れた人を待つと 0）
//   partyLifeHourly(sim)         … sim.js newHourRest の最後
//   partyLifeDaily(sim)          … sim.js newDay の partiesDaily のあと
//   teamMul / teamAim / teamNerve … society.js stepCombat（攻め・守り／命中／逃げない勇気）
//   teamHeal(sim, e, best)       … advclass.js 僧侶の癒し（回復の効き）
//   questFamilyOk / questNearMul … guild.js takeQuest（家族持ちは長い遠征を受けない・近場を選ぶ）
//   partyBondRows(sim, p, link)  … ui.js 人の詳細欄（冒険者の欄）
//
// ■ お金の流れ（どこからも湧かせない）
//   宿代・馬小屋代・食事代 … 各自の財布（足りなければ家計）→ 宿・酒場の主（needs.js の旅先の宿・食事の処理をそのまま使う）
//   立て替え               … 払えない仲間の分を、いちばん余裕のある仲間が自分の財布から渡す（人 → 人。flow に記録）
//   報酬と素材の分け方     … 今の splitCoins・splitLoot・reportQuest のまま（この仕組みではお金を動かさない）
//   荷運びの日当の割り勘   … 荷運びを雇った仲間へ、ほかの仲間が1日分の日当を頭割りで渡す（人 → 人。日当そのものは carry.js が雇い主 → 荷運びへ払う）
//
// ■ パーティの荷（持ち物の仕組み carry.js に合わせる。carry.js は編集しない）
//   ・重すぎる仲間（持てる量の85%以上）の荷を、そばにいる余裕のある仲間が引き取る（品物が人から人へ移るだけ。お金は動かない）。
//     それでも重ければ、パーティが雇った荷運びに預ける（carry.js の預かり荷 p.held。雇いが終われば雇い主へ渡る）。
//   ・荷運びはパーティで1人：雇うのはリーダー（carry.js の hirePorters）。ほかの仲間はその時間は雇わない印を付ける。
//   ・歩く速さの「一番遅い人」は、荷の重さによる遅れ（carry.js の carryWalk と同じ 0.85／0.35）も入れて決める。
import { T } from './world.js';
import { spendable, pay } from './property.js';
import { sleepPlan } from './chores.js';
import { moveMul } from './growth.js';
import { healthSpeedMul } from './health.js';
import { flow } from './ledger.js';
import { carryState, itemWeight, BAGS } from './carry.js';
import { unsafeFor, crewUnsafe } from './deadly.js';

// ---------- 目安の数 ----------
const BONUS_MAX = 0.15;     // 絆100でチームの力 +15%
const NEAR = 10;            // 「一緒にいる」とみなす距離
const COMBAT_NEAR = 8;      // 戦いでチームの力が出る距離
const SAME_DEST = 4;        // 同じ行き先とみなす差
const LODGE_RANGE = 34;     // この距離までの町の宿に泊まる（needs.js の NEAR_TOWN と同じ）
const WAIT_MAX = 60;        // 遅れた仲間を待つのは最大60分（そのあと60分は待たずに進む）
const FEE_INN = { capital: 4, port: 3, village: 2 };   // needs.js・buildings.js と同じ額
const URGENT = new Set(['flee', 'defend', 'alert', 'rescue', 'march', 'crusade']);
// リーダーについて一緒にする行動
const COPY = new Set(['quest', 'gather', 'hunt', 'report', 'guild', 'travel', 'train', 'buygear', 'tavern', 'plaza', 'stroll', 'pray', 'rest', 'wayeat', 'forage', 'bathe']);
// パーティにいるあいだはしないこと（家に帰る・家の用事・ふだんの仕事）
const BLOCK = new Set(['home', 'visit', 'court', 'school', 'work', 'shop', 'storytell', 'play', 'eat', 'sleep']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const grade = (s) => (s.type === 'capital' ? 'capital' : s.type === 'port' || s.grade === 'town' ? 'port' : 'village');
const alive = (m) => !!m && m.deathYear == null && !!m.needs;

// ---------- 状態 ----------
const STAT_KEYS = ['loadShared', 'porterShared', 'porterSplit', 'together', 'apart', 'groupSleep', 'groupEat', 'follow', 'waitSteps', 'slowSteps', 'innNights', 'stableNights', 'campNights', 'roughNights', 'homeNights',
  'familyLeave', 'heldBack', 'refuseDeadly', 'dangerLeave', 'reunion', 'homesick', 'farRefused', 'feeCover', 'bondFought', 'bondCrisis', 'bondHelp', 'bondQuest', 'bondQuarrel', 'bondShare', 'abandoned', 'friendsAfter', 'loveAfter', 'injuredOut'];
export function partyLifeState(sim) {
  const S = sim.S;
  if (!S.partyLife) S.partyLife = { v: 1, stats: {}, leaving: [] };
  const L = S.partyLife;
  if (!L.stats) L.stats = {};
  if (!L.leaving) L.leaving = [];
  for (const k of STAT_KEYS) if (L.stats[k] == null) L.stats[k] = 0;
  return L;
}
const ST = (sim) => partyLifeState(sim).stats;
const PL = (p) => p.pl || (p.pl = {});
function ptl(pt) { return pt.pl || (pt.pl = { seq: 0, plan: null, done: pt.done || 0, rs: {} }); }

function partyOfP(sim, p) {
  if (p.party == null) return null;
  const pt = sim.S.advParties?.[p.party];
  return pt && !pt.gone && pt.members.includes(p.id) ? pt : null;
}
function membersOf(sim, pt) { return pt.members.map((id) => sim.S.people[id]).filter((m) => alive(m) && m.party === pt.id); }
// 一緒に動ける状態か（けが・病気・牢・任務・家族のもとへ帰る途中は別行動）
function available(sim, m) {
  if (!alive(m) || m.jail != null || m.mission || m.pl?.leaving) return false;
  if (m.hp < m.maxhp * 0.35) return false;
  if (m.action?.type === 'sickbed') return false;
  return true;
}
function leaderOf(sim, pt) {
  const L = sim.S.people[pt.leader];
  if (available(sim, L) && L.party === pt.id) return L;
  let best = null;
  for (const m of membersOf(sim, pt)) if (available(sim, m) && (!best || (m.lv || 1) > (best.lv || 1))) best = m;
  return best;
}
const together = (a, b) => (a.inside != null && a.inside === b.inside) || (a.inside == null && b.inside == null && dist(a.pos, b.pos) <= NEAR) || dist(a.pos, b.pos) <= 2;

// ---------- 絆 ----------
function bondOf(pt, id) { return (pt.bond && pt.bond[id]) || 0; }
function addBond(sim, pt, m, d, key) {
  pt.bond = pt.bond || {};
  const v = pt.bond[m.id] || 0;
  pt.bond[m.id] = Math.max(0, Math.min(100, v + d));
  if (key) ST(sim)[key] += 1;
}
export function bondBonus(bond) { return BONUS_MAX * Math.max(0, Math.min(100, bond)) / 100; }
// 仲間がそばにいるときだけのチームの力（0〜0.15）
function teamBonus(sim, p) {
  if (typeof p.id !== 'number' || p.party == null) return 0;
  const pt = partyOfP(sim, p);
  if (!pt) return 0;
  const b = bondOf(pt, p.id);
  if (b <= 0) return 0;
  for (const id of pt.members) {
    if (id === p.id) continue;
    const m = sim.S.people[id];
    if (!alive(m) || m.hp <= 0) continue;
    if ((m.inside != null && m.inside === p.inside) || (Math.abs(m.pos.x - p.pos.x) <= COMBAT_NEAR && Math.abs(m.pos.z - p.pos.z) <= COMBAT_NEAR)) return bondBonus(b);
  }
  return 0;
}
// 戦い：攻めと守りの掛け算。一緒に戦ったしるしも付ける
export function teamMul(sim, e) {
  if (typeof e.id !== 'number' || e.party == null) return 1;
  PL(e).fightT = sim.S.t;
  return 1 + teamBonus(sim, e);
}
// 戦い：かわされた攻撃を、仲間との連携で当てる（命中）
export function teamAim(sim, e, d0) {
  if (typeof e.id !== 'number' || e.party == null) return 0;
  const b = teamBonus(sim, e);
  return b > 0 && sim.rng.chance(b) ? d0 : 0;
}
// 戦い：怖さの減り方（逃げない勇気）。1 より小さいほど怖がらない
export function teamNerve(sim, t) {
  if (typeof t.id !== 'number' || t.party == null) return 1;
  return 1 - teamBonus(sim, t) * 2;
}
// 僧侶の癒しの効き。仲間を癒したら助け合いとして絆が少し上がる
export function teamHeal(sim, e, best) {
  if (typeof e.id !== 'number' || e.party == null) return 1;
  const b = teamBonus(sim, e);
  if (best && best !== e && best.party === e.party) {
    const pt = partyOfP(sim, e);
    const h = Math.floor(sim.S.t / 60);
    if (pt && PL(e).helpH !== h) { PL(e).helpH = h; addBond(sim, pt, e, 0.4, 'bondHelp'); addBond(sim, pt, best, 0.4); }
  }
  return 1 + b;
}

// ---------- 歩く速さ ----------
function baseSpeed(sim, m) {
  const age = sim.ageOf(m);
  let load = 1;
  if (sim.S.carry) { const st = carryState(sim, m); load = st.over ? 0.35 : st.ratio > 0.85 ? 0.85 : 1; }   // 荷が重い人は遅い（carry.js の carryWalk と同じ）
  return (age < 13 ? 1.1 : age > 65 ? 0.6 : 0.95) * moveMul(m) * healthSpeedMul(m) * load;
}
// 一番遅い仲間に合わせた速さの掛け算。先に行きすぎたら 0（待つ）
export function partySpeedMul(sim, p, dt) {
  if (p.party == null) return 1;
  const a = p.action;
  if (!a || a.phase !== 'walk' || a.tx == null || URGENT.has(a.type)) return 1;
  const pt = partyOfP(sim, p);
  if (!pt || !available(sim, p)) return 1;
  const now = sim.S.t, me = PL(p);
  const mine = baseSpeed(sim, p);
  let minSp = mine, wait = false;
  const myRem = Math.hypot(a.tx - p.pos.x, a.tz - p.pos.z);
  for (const id of pt.members) {
    if (id === p.id) continue;
    const m = sim.S.people[id];
    if (!available(sim, m)) continue;
    const b = m.action;
    if (!b || b.phase !== 'walk' || b.tx == null) continue;
    if (Math.abs(b.tx - a.tx) > SAME_DEST || Math.abs(b.tz - a.tz) > SAME_DEST) continue;
    const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
    if (d > 30) continue;
    const sp = baseSpeed(sim, m);
    if (sp < minSp) minSp = sp;
    if (d > 4 && Math.hypot(b.tx - m.pos.x, b.tz - m.pos.z) > myRem + 3) wait = true;
  }
  if (wait && !(me.noWait > now)) {
    me.waitT = (me.waitT || 0) + (dt || 0.5);
    if (me.waitT > WAIT_MAX) { me.noWait = now + 60; me.waitT = 0; }
    else { ST(sim).waitSteps++; return 0; }
  } else if (!wait) me.waitT = 0;
  if (minSp < mine) { ST(sim).slowSteps++; return minSp / mine; }
  return 1;
}

// ---------- 宿と食事 ----------
function innOf(sim, sid) {
  const id = sim.S.bld?.at?.[sid]?.inn;
  if (id != null) return sim.building(id);
  return null;
}
function lodgeTown(sim, p) {
  let best = null, bd = LODGE_RANGE;
  for (const s of sim.S.world.settlements) {
    const t = sim.S.towns[s.id];
    if (!t || t.occupied) continue;
    const d = dist(p.pos, s) - (s.r || 6) * 0.5;
    if (d > bd) continue;
    const where = innOf(sim, s.id) || sim.townBuilding(s, 'tavern');
    if (!where) continue;
    bd = d; best = { s, where };
  }
  return best;
}
function campNear(sim, x, z, r = 3) {
  const ok = (t) => t !== T.BLD && t !== T.ROAD;
  return sim.randomNear(x, z, r, ok) || sim.randomNear(x, z, r * 2, ok) || { x: Math.round(x), z: Math.round(z) };
}
function mealCost(sim, sid) {
  const m = sim.S.towns[sid];
  const g = m && ['bread', 'fish', 'meat'].find((x) => (m.stock[x] || 0) >= 1);
  return g ? Math.round(m.price[g] * 1.6 + 1) : Infinity;
}
// 払えない仲間の分を、いちばん余裕のある仲間が立て替える（人 → 人）
function cover(sim, pt, m, amt) {
  const need = amt - spendable(sim, m);
  if (need <= 0) return true;
  let best = null, bv = need + 10;
  for (const o of membersOf(sim, pt)) { if (o === m) continue; const v = spendable(sim, o); if (v > bv) { bv = v; best = o; } }
  if (!best) return false;
  const x = Math.ceil(need);
  pay(sim, best, x);
  m.purse = (m.purse || 0) + x;
  flow(sim, 'パーティの仲間', 'パーティの仲間', x, '宿代・食事代の立て替え');
  ST(sim).feeCover++;
  addBond(sim, pt, m, 0.6, 'bondHelp'); addBond(sim, pt, best, 0.3);
  sim.relMut(m, best).a = Math.min(100, sim.rel(m, best).a + 1);
  if (m.memories && sim.rng.chance(0.15)) sim.remember(m, `手持ちが足りず、${best.given}が宿代を立て替えてくれた`, { emo: 0.4, imp: 0.4, about: [best.id], k: 'party' });
  return true;
}
function planSleep(sim, p, sp) {
  const lt = lodgeTown(sim, p);
  const until = sp.bedtime ? sp.untilHour : null, dur = sp.bedtime ? 0 : 180;
  if (lt) return { kind: 'sleep', sid: lt.s.id, x: lt.where.door.x, z: lt.where.door.z, bld: lt.where.id, fee: innOf(sim, lt.s.id) ? FEE_INN[grade(lt.s)] : 3, untilHour: until, dur };
  const c = campNear(sim, p.pos.x, p.pos.z, 4);
  return { kind: 'camp', x: c.x, z: c.z, untilHour: until, dur };
}
function planEat(sim, p) {
  for (const s of sim.S.world.settlements) {
    const t = sim.S.towns[s.id];
    if (!t || t.occupied) continue;
    if (dist(p.pos, s) - (s.r || 6) * 0.5 > LODGE_RANGE) continue;
    const tav = sim.townBuilding(s, 'tavern') || innOf(sim, s.id);
    const cost = mealCost(sim, s.id);
    if (!tav || !isFinite(cost)) continue;
    return { kind: 'eat', sid: s.id, x: tav.door.x, z: tav.door.z, bld: tav.open ? null : tav.id, fee: cost };
  }
  return null;
}
// 計画どおりに一人を動かす
function startPlan(sim, pt, m, plan) {
  if (plan.kind === 'sleep') {
    const home = sim.homeOf(m);
    if (home && home.id === plan.bld) sim.startAction(m, { type: 'sleep', place: { x: home.door.x, z: home.door.z, bld: home.open ? null : home.id }, dur: plan.dur, untilHour: plan.untilHour });
    else {
      cover(sim, pt, m, plan.fee);
      // bld は着いてから決める（needs.js の旅先の宿の処理が寝台を割り当て、宿代を宿の主へ払う）
      sim.startAction(m, { type: 'sleep', place: { x: plan.x, z: plan.z }, dur: plan.dur, untilHour: plan.untilHour, food: 'way', dest: plan.sid });
    }
  } else if (plan.kind === 'camp') {
    const c = campNear(sim, plan.x, plan.z, 2);
    sim.startAction(m, { type: 'sleep', place: c, dur: plan.dur, untilHour: plan.untilHour, food: 'camp' });
  } else if (plan.kind === 'eat') {
    if (!cover(sim, pt, m, plan.fee)) return false;
    sim.startAction(m, { type: 'wayeat', place: { x: plan.x, z: plan.z, bld: plan.bld }, dur: 30, food: 'inn', dest: plan.sid });
  }
  if (m.action) { m.action.pplan = plan.id; m.action.pseq = ptl(pt).seq; }
  return true;
}

// ---------- 決める ----------
const mealTimeAt = (h) => (h >= 6 && h < 8.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20.5);
export function partyDecide(sim, p) {
  const me = p.pl;
  // 家族のもとへ帰る途中：まっすぐ家へ
  if (me?.leaving && p.party == null) {
    const hp = sim.placeFor(p, 'home');
    if (hp && sim.homeOf(p)) { sim.startAction(p, { type: 'home', place: hp, dur: 90 }); return true; }
    me.leaving = false;
    return false;
  }
  if (p.party == null) return false;
  const pt = partyOfP(sim, p);
  if (!pt || p.fight) return false;
  if (!available(sim, p)) { if (p.hp < p.maxhp * 0.35 && me?.outD !== sim.today) { PL(p).outD = sim.today; ST(sim).injuredOut++; } return false; }
  const L = leaderOf(sim, pt);
  if (!L) return false;
  const h = sim.hour();
  if (p === L) return leaderPlan(sim, p, pt, h);
  return followerDecide(sim, p, pt, L, h);
}
function leaderPlan(sim, p, pt, h) {
  const X = ptl(pt), now = sim.S.t;
  const ms = membersOf(sim, pt).filter((m) => available(sim, m));
  const sp = sleepPlan(sim, p, h, sim.ageOf(p));
  const sleepy = sp.bedtime || p.needs.sleep < 20 || ms.filter((m) => m.needs.sleep < 15).length * 2 > ms.length;
  let plan = null;
  if (sleepy) { plan = planSleep(sim, p, sp); ST(sim).groupSleep++; }
  else if (h >= 6 && h < 21.5 && !(X.ateT > now - 150) && (p.needs.hunger < 40 || (mealTimeAt(h) && ms.some((m) => m.needs.hunger < 55)))) {
    plan = planEat(sim, p);
    if (plan) { X.ateT = now; ST(sim).groupEat++; }
  }
  if (!plan) return false;   // ふだんの判断へ（partyCands で家に帰る候補を外し、partyAfterDecide で仲間を合わせる）
  X.seq++;
  plan.id = X.seq; plan.t = now;
  X.plan = plan;
  if (!startPlan(sim, pt, p, plan)) return false;
  syncFollowers(sim, pt, p);
  return true;
}
function followerDecide(sim, p, pt, L, h) {
  const X = ptl(pt), n = p.needs;
  const la = L.action;
  // リーダーの食事・寝る計画に合わせる
  if (la && la.pplan != null && X.plan && X.plan.id === la.pplan) {
    if (startPlan(sim, pt, p, X.plan)) { ST(sim).follow++; return true; }
  }
  // 自分だけのどうしようもない空腹・眠気は、旅先の食事・寝床（needs.js）に任せる
  if (n.hunger < 15 || n.sleep < 8) return false;
  // リーダーの行き先が竜など手に負えない相手の縄張り：ついて行かない（deadly.js。rescue.js の「竜の近くへは駆けつけない」と同じ見方）
  if (la && la.tx != null && !URGENT.has(la.type) && unsafeFor(sim, p, la.tx, la.tz)) return refuseDeadly(sim, p, pt, L);
  let c;
  if (la && COPY.has(la.type) && !(la.type === 'eat' && la.food !== 'inn')) {
    let place;
    if (la.bld != null) { const b = sim.building(la.bld); place = b ? { x: b.door.x, z: b.door.z, bld: la.bld } : null; }
    if (!place) place = la.tx != null ? (sim.randomNear(la.tx, la.tz, 1) || { x: la.tx, z: la.tz }) : campNear(sim, L.pos.x, L.pos.z, 2);
    const remain = la.phase === 'do' && la.until ? Math.max(10, la.until - sim.S.t) : la.dur;
    c = { type: la.type, place, dur: remain, untilHour: la.untilHour, quest: la.quest, friend: la.friend, food: la.food, dest: la.dest };
  } else if (la && la.type === 'sleep' && (la.food === 'way' || la.food === 'camp')) {
    c = { type: 'sleep', place: la.bld != null ? { x: la.tx, z: la.tz } : campNear(sim, la.tx ?? L.pos.x, la.tz ?? L.pos.z, 2), dur: la.dur, untilHour: la.untilHour, food: la.food, dest: la.dest };
  } else {
    // リーダーがひとりの用事をしている・考え中：そばで待つ
    const spot = L.inside != null ? (() => { const b = sim.building(L.inside); return b ? { x: b.door.x, z: b.door.z } : null; })() : null;
    c = { type: 'rest', place: spot || campNear(sim, L.pos.x, L.pos.z, 2), dur: 20 };
  }
  sim.startAction(p, c);
  if (p.action) { p.action.pseq = X.seq; p.action.pfollow = L.id; }
  ST(sim).follow++;
  return true;
}
// リーダーが決め直したら、仲間も合わせて決め直す
function syncFollowers(sim, pt, L) {
  const X = ptl(pt);
  for (const m of membersOf(sim, pt)) {
    if (m === L || !available(sim, m) || m.fight || m.talk) continue;
    if (m.needs.hunger < 15 || m.needs.sleep < 8) continue;
    if (m.action && m.action.pseq === X.seq) continue;
    m.action = null; m.path = null;
  }
}
export function partyAfterDecide(sim, p) {
  if (p.party == null) return;
  const pt = partyOfP(sim, p);
  if (!pt || !available(sim, p) || leaderOf(sim, pt) !== p) return;
  const X = ptl(pt);
  X.seq++;
  if (p.action) p.action.pseq = X.seq;
  syncFollowers(sim, pt, p);
}
// パーティの人は家に帰らない（家の用事・ふだんの仕事もしない）。休むのは仲間のそばで
export function partyCands(sim, p, cands) {
  if (p.party == null) return;
  const pt = partyOfP(sim, p);
  if (!pt || !available(sim, p)) return;
  const home = sim.homeOf(p), hd = home?.door;
  for (const c of cands) {
    if (URGENT.has(c.type)) continue;
    if (c.type === 'rest') { c.place = campNear(sim, p.pos.x, p.pos.z, 2); continue; }
    if (BLOCK.has(c.type) && !(c.type === 'sleep' && (c.food === 'way' || c.food === 'camp')) && !(c.type === 'eat' && c.food === 'inn')) { c.score = -99; continue; }
    if (hd && c.place && Math.abs(c.place.x - hd.x) <= 2 && Math.abs(c.place.z - hd.z) <= 2) c.score = -99;
  }
  holdBack(sim, p, pt, cands);
}
// 竜など手に負えない相手の縄張りへ向かう案は、仲間が引き止める（討伐依頼を受けた十分に強いパーティなら行ける。deadly.js）
function holdBack(sim, p, pt, cands) {
  const crew = membersOf(sim, pt).filter((m) => available(sim, m));
  if (!crew.includes(p)) crew.push(p);
  let top = null;
  for (const c of cands) if (c.score > -99 && (!top || c.score > top.score)) top = c;
  for (const c of cands) {
    if (c.score <= -99 || URGENT.has(c.type) || !c.place || c.place.x == null) continue;
    const foe = crewUnsafe(sim, crew, c.place.x, c.place.z);
    if (!foe) continue;
    c.score = -99;
    if (c !== top || crew.length < 2) continue;
    // いちばんやりたかった行き先を止められた：いちばん慎重な仲間が引き止めた
    ST(sim).heldBack++;
    const X = ptl(pt);
    const who = crew.filter((m) => m !== p).sort((a, b) => ((b.pers?.N || 0) - (b.values?.courage || 0)) - ((a.pers?.N || 0) - (a.values?.courage || 0)))[0];
    if (!who || X.heldD === sim.today) continue;
    X.heldD = sim.today;
    const fname = foe.title || foe.name;
    sim.remember(p, `${fname}の縄張りへ向かおうとして、${who.given}に「命がいくつあっても足りない」と引き止められた`, { emo: -0.1, imp: 0.5, about: [who.id], k: 'party' });
    sim.remember(who, `${p.given}が${fname}の縄張りへ行こうとしたので、引き止めた`, { emo: 0.1, imp: 0.5, about: [p.id], k: 'party' });
    addBond(sim, pt, who, 0.5);
    sim.pushLog(`パーティ「${pt.name}」の${who.given}が、${fname}の縄張りへ向かおうとする${p.given}を引き止めた。`, 'event', [who.id, p.id], p.pos);
  }
}
// 仲間がリーダーの危なすぎる行き先について行かない。重ねて向かうなら、パーティを抜ける
function refuseDeadly(sim, p, pt, L) {
  const me = PL(p);
  ST(sim).refuseDeadly++;
  if (me.refD !== sim.today) { me.refD = sim.today; me.refN = 0; }
  me.refN++;
  const la = L.action;
  const here = unsafeFor(sim, p, p.pos.x, p.pos.z);
  if (me.refN === 1) sim.remember(p, `${L.given}が竜の縄張りのような所へ向かおうとした。命が惜しいので、ついて行かなかった`, { emo: -0.4, imp: 0.55, about: [L.id], k: 'party' });
  if (me.refN >= 3 && la && unsafeFor(sim, p, la.tx, la.tz)) {
    ST(sim).dangerLeave++;
    leaveParty(sim, p, pt, 'danger', L);
  }
  // その場（危なければ町）で待つ
  const place = here ? sim.placeFor(p, 'plaza') : campNear(sim, p.pos.x, p.pos.z, 2);
  sim.startAction(p, { type: here ? 'flee' : 'rest', place, dur: 30 });
  if (p.action) p.action.pseq = ptl(pt).seq;
  return true;
}

// ---------- 家族 ----------
function familyOf(sim, p) {
  const S = sim.S, out = [];
  const sp = p.spouseId != null ? S.people[p.spouseId] : null;
  if (alive(sp)) out.push(sp.id);
  const hh = sim.hh(p);
  if (hh) for (const id of hh.members) { const k = S.people[id]; if (alive(k) && (k.fatherId === p.id || k.motherId === p.id) && sim.ageOf(k) < 16) out.push(k.id); }
  return out;
}
export const famLimit = (p) => 3 + (p.id % 3);   // 家族持ちが家を空けられる日数（3〜5日）
function atHome(sim, p) {
  const home = sim.homeOf(p);
  if (!home) return false;
  return p.inside === home.id || dist(p.pos, home.door) < 3;
}
const awayDays = (sim, p) => (p.pl?.home != null ? (sim.S.t - p.pl.home) / 1440 : 0);
function trackFamily(sim, m, pt) {
  const me = PL(m), now = sim.S.t;
  if (!me.fam || !me.fam.length) { me.miss = 0; return; }
  if (me.home == null) me.home = now;
  if (atHome(sim, m)) {
    if ((me.miss || 0) > 30) {
      ST(sim).reunion++;
      sim.remember(m, '久しぶりに家族の顔を見て、胸のつかえがとれた', { emo: 0.7, imp: 0.6, about: me.fam, k: 'family' });
      for (const id of me.fam) { const f = sim.S.people[id]; if (alive(f)) { sim.remember(f, `${m.given}がやっと帰ってきた`, { emo: 0.6, imp: 0.5, about: [m.id], k: 'family' }); f.mood = Math.min(100, (f.mood || 50) + 8); } }
    }
    me.home = now; me.miss = 0; me.leaving = false;
    return;
  }
  const lim = famLimit(m);
  const away = (now - me.home) / 1440;
  me.miss = Math.min(150, Math.max(0, (away - 1) / Math.max(1, lim - 1) * 100));
  if (me.miss > 50) {
    m.mood = Math.max(0, (m.mood || 50) - 1.5);
    if (me.missD !== sim.today) {
      me.missD = sim.today; ST(sim).homesick++;
      sim.remember(m, `もう${Math.floor(away)}日も家族に会っていない。${me.fam.length > 1 ? '子どもたちの' : '家の'}ことが気にかかる`, { emo: -0.5, imp: 0.5, about: me.fam, k: 'family' });
      for (const id of me.fam) {
        const f = sim.S.people[id];
        if (!alive(f)) continue;
        f.mood = Math.max(0, (f.mood || 50) - 4);
        sim.remember(f, `${m.given}がもう何日も帰ってこない。冒険者仲間とばかり一緒にいる`, { emo: -0.5, imp: 0.5, about: [m.id], k: 'family' });
        sim.relMut(f, m).a = Math.max(-100, sim.rel(f, m).a - 2);
      }
    }
  }
  if (me.miss >= 100 && pt && m.party === pt.id && !me.leaving) leaveParty(sim, m, pt, 'family');
}
function leaveParty(sim, m, pt, why, L = null) {
  const S = sim.S, me = PL(m);
  pt.members = pt.members.filter((id) => id !== m.id);
  m.party = null;
  if (m.quest != null) {
    const q = (S.quests || []).find((x) => x.id === m.quest);
    if (q && q.takenBy.length > 1) q.takenBy = q.takenBy.filter((id) => id !== m.id);
    m.quest = null;
  }
  m.action = null; m.path = null;
  me.past = [{ n: pt.name, b: Math.round(bondOf(pt, m.id)), d: sim.today }, ...(me.past || [])].slice(0, 3);
  if (why === 'family') {
    me.leaving = true;
    partyLifeState(sim).leaving.push(m.id);
    ST(sim).familyLeave++;
    sim.remember(m, `家族に会いたくて、パーティ「${pt.name}」を抜けて家に帰ることにした`, { emo: -0.2, imp: 0.7, about: me.fam, k: 'party' });
    for (const id of pt.members) {
      const o = S.people[id];
      if (!alive(o)) continue;
      sim.remember(o, `${m.given}が家族のもとへ帰るといって、パーティ「${pt.name}」を抜けた`, { emo: o.pers.A > 0.5 ? -0.1 : -0.35, imp: 0.5, about: [m.id], k: 'party' });
      if (o.pers.A < 0.4) addBond(sim, pt, o, -2);
    }
    sim.pushLog(`${m.given}は家族に会いたくなり、パーティ「${pt.name}」を抜けて家へ帰った。`, 'event', [m.id], m.pos);
  } else if (why === 'danger') {
    // リーダーが竜の縄張りのような所へ向かうのを止められず、命を惜しんで抜けた
    sim.remember(m, `${L ? L.given : '頭'}が危なすぎる所へ向かうので、パーティ「${pt.name}」を抜けた`, { emo: -0.5, imp: 0.7, about: L ? [L.id] : [], k: 'party' });
    for (const id of pt.members) {
      const o = S.people[id];
      if (!alive(o)) continue;
      sim.remember(o, `${m.given}が「命あっての物種だ」と言って、パーティ「${pt.name}」を抜けた`, { emo: -0.3, imp: 0.5, about: [m.id], k: 'party' });
      addBond(sim, pt, o, -1);
    }
    sim.pushLog(`${m.given}は、危なすぎる所へ向かう${L ? L.given : '頭'}について行けず、パーティ「${pt.name}」を抜けた。`, 'event', [m.id], m.pos);
  }
}

// ---------- パーティの荷（carry.js に合わせる） ----------
const HEAVY = 0.85;
// 手放してよい品（身に付けた武具・袋・依頼の品・薬は手放さない）
function spareOf(sim, p) {
  const eq = new Set(Object.values(p.eq || {}).filter(Boolean));
  const keep = new Set((sim.S.quests || []).filter((q) => q.id === p.quest && q.item).map((q) => q.item));
  return (p.inv || []).filter((it) => !eq.has(it) && !BAGS[it.id] && !keep.has(it.id) && it.id !== 'potion');
}
function hasRoom(sim, o, w, maxRatio) {
  const st = carryState(sim, o, true);
  if (st.slots >= st.maxSlots) return false;
  if (st.carried + w * st.light > st.personCap + st.beast + 1e-6) return false;
  return st.cap > 0 && (st.total + w) / st.cap <= maxRatio;
}
function moveItem(from, to, it) {
  const i = (from.inv || []).indexOf(it);
  if (i < 0) return false;
  from.inv.splice(i, 1);
  to.inv = to.inv || [];
  const same = it.n != null && to.inv.find((x) => x.id === it.id && x.n != null && !BAGS[x.id] && x.q == null && it.q == null && x.dur == null && it.dur == null);
  if (same) same.n = (same.n || 1) + (it.n || 1); else to.inv.push(it);
  from._cd = true; to._cd = true;
  return true;
}
// パーティの誰かが雇っている荷運び（そばにいる者）
function partyPorter(sim, pt, near) {
  const S = sim.S;
  for (const id of pt.members) {
    const x = S.people[id];
    if (!alive(x) || !x.hire || x.hire.porter == null || S.t > x.hire.until) continue;
    const q = S.people[x.hire.porter];
    if (!alive(q) || q.porterFor?.by !== x.id) continue;
    if (near && Math.abs(q.pos.x - near.pos.x) + Math.abs(q.pos.z - near.pos.z) > 10) continue;
    return { porter: q, boss: x };
  }
  return null;
}
function shareLoads(sim, pt, ms) {
  if (!sim.S.carry) return;
  const st = ST(sim);
  const av = ms.filter((m) => available(sim, m) && !m.fight);
  for (const m of av) {
    let cs = carryState(sim, m, true);
    if (!cs.over && cs.ratio < HEAVY) continue;
    const spare = spareOf(sim, m).sort((a, b) => itemWeight(b) - itemWeight(a));
    let gave = 0, toWho = null;
    for (const it of spare) {
      cs = carryState(sim, m, true);
      if (!cs.over && cs.ratio < HEAVY - 0.1) break;
      const w = itemWeight(it);
      const mate = av.filter((o) => o !== m && together(o, m) && hasRoom(sim, o, w, 0.7)).sort((a, b) => carryState(sim, a).ratio - carryState(sim, b).ratio)[0];
      if (mate) { if (moveItem(m, mate, it)) { gave++; toWho = mate; st.loadShared++; addBond(sim, pt, m, 0.3, 'bondHelp'); addBond(sim, pt, mate, 0.3); } continue; }
      const pp = partyPorter(sim, pt, m);
      if (pp && hasRoom(sim, pp.porter, w, 1)) {
        const i = m.inv.indexOf(it);
        if (i >= 0) { m.inv.splice(i, 1); m._cd = true; (pp.porter.held = pp.porter.held || []).push({ it }); pp.porter._cd = true; gave++; st.porterShared++; }
        continue;
      }
      break;
    }
    if (gave && toWho && m.memories && sim.rng.chance(0.2)) sim.remember(m, `荷が重くて足が止まりかけたら、${toWho.given}が荷を分けて持ってくれた`, { emo: 0.4, imp: 0.35, about: [toWho.id], k: 'party' });
  }
}
// 荷運びはパーティで1人（リーダーが雇う）。日当の1日分は仲間で割り勘にする
function partyPorterRules(sim, pt, ms, L) {
  if (!sim.S.carry) return;
  const X = ptl(pt), now = sim.S.t;
  for (const m of ms) if (m !== L && available(sim, m) && !m.hire) m.hire = { porter: null, until: now + 70 };   // carry.js の「今回は雇わない」印
  const pp = partyPorter(sim, pt, null);
  if (!pp) return;
  const key = pp.porter.id + ':' + Math.round(pp.boss.hire.until);
  if (X.porterKey === key) return;
  X.porterKey = key;
  const others = ms.filter((m) => m !== pp.boss && available(sim, m));
  if (!others.length) return;
  const share = Math.round((8 / (others.length + 1)) * 10) / 10;   // 荷運びの日当8銅貨（carry.js の DAY_WAGE）の1日分を頭割り
  for (const o of others) {
    if (spendable(sim, o) < share + 5) continue;
    pay(sim, o, share);
    pp.boss.purse = (pp.boss.purse || 0) + share;
    flow(sim, 'パーティの仲間', 'パーティの仲間', share, '荷運びの日当の割り勘');
    ST(sim).porterSplit++;
  }
}

// ---------- 1時間ごと ----------
export function partyLifeHourly(sim) {
  const S = sim.S;
  if (!S.advParties) return;
  const st = ST(sim), now = sim.S.t, hr = Math.floor(sim.hour());
  for (const pt of Object.values(S.advParties)) {
    if (pt.gone) continue;
    const ms = membersOf(sim, pt);
    if (ms.length < 1) continue;
    const L = leaderOf(sim, pt);
    const X = ptl(pt);
    pt.bond = pt.bond || {};
    let fighters = 0;
    for (const m of ms) if (m.pl?.fightT > now - 60) fighters++;
    for (const m of ms) {
      const me = PL(m);
      // 一緒にいた割合・一緒に過ごした時間
      if (L && m !== L && available(sim, m)) {
        if (together(m, L)) { st.together++; addBond(sim, pt, m, 0.12 * (1 - bondOf(pt, m.id) / 120)); }
        else st.apart++;
      } else if (m === L && ms.some((o) => o !== m && available(sim, o) && together(o, m))) addBond(sim, pt, m, 0.12 * (1 - bondOf(pt, m.id) / 120));
      // 一緒に戦った
      if (fighters >= 2 && me.fightT > now - 60 && me.fightH !== hr) { me.fightH = hr; addBond(sim, pt, m, 1.2, 'bondFought'); }
      // 危機を越えた
      if (m.hp < m.maxhp * 0.3) me.low = true;
      else if (me.low && m.hp > m.maxhp * 0.6) {
        me.low = false;
        for (const o of ms) if (o === m || together(o, m)) addBond(sim, pt, o, 4, o === m ? 'bondCrisis' : null);
        sim.remember(m, `死にかけたが、パーティ「${pt.name}」の仲間に支えられて持ち直した`, { emo: 0.6, imp: 0.7, about: ms.filter((o) => o !== m).map((o) => o.id), k: 'party' });
      }
      // 見捨てられた：弱って戦っているのに、仲間が誰もそばにいない
      if (m.fight && m.hp < m.maxhp * 0.35 && ms.length > 1 && me.abD !== sim.today && !ms.some((o) => o !== m && dist(o.pos, m.pos) < 12)) {
        me.abD = sim.today; st.abandoned++;
        addBond(sim, pt, m, -6);
        if (L && L !== m) { sim.relMut(m, L).a = Math.max(-100, sim.rel(m, L).a - 5); sim.remember(m, `危ないところで、パーティ「${pt.name}」の仲間は誰も助けに来なかった`, { emo: -0.7, imp: 0.7, about: [L.id], k: 'party' }); }
      }
      // 夜の寝床を数える（深夜1時）
      if (hr === 1 && m.action?.type === 'sleep' && m.action.phase === 'do') {
        const b = m.inside != null ? sim.building(m.inside) : null;
        const home = sim.homeOf(m);
        if (home && m.inside === home.id && !['inn', 'tavern'].includes(home.type)) st.homeNights++;
        else if (b && (b.type === 'inn' || b.type === 'tavern')) st.innNights++;
        else if (b && b.type === 'stable') st.stableNights++;
        else if (m.action.food === 'camp' || m.action.dest == null) st.campNights++;
        else st.roughNights++;
      }
      trackFamily(sim, m, pt);
    }
    shareLoads(sim, pt, ms);
    partyPorterRules(sim, pt, ms, L);
  }
  // 家族のもとへ帰る途中の人
  const LV = partyLifeState(sim);
  if (LV.leaving.length) {
    LV.leaving = LV.leaving.filter((id) => { const m = S.people[id]; if (!alive(m) || !m.pl?.leaving) return false; trackFamily(sim, m, null); return !!m.pl.leaving; });
  }
}

// ---------- 毎日 ----------
export function partyLifeDaily(sim) {
  const S = sim.S;
  if (!S.advParties) return;
  const st = ST(sim);
  for (const pt of Object.values(S.advParties)) {
    if (pt.gone) { if (!pt.plDone) farewell(sim, pt); continue; }
    const X = ptl(pt);
    pt.bond = pt.bond || {};
    let ms = membersOf(sim, pt);
    // 家族のもとへ帰る途中の人は、新しいパーティに入らない
    for (const m of ms) if (m.pl?.leaving) { pt.members = pt.members.filter((id) => id !== m.id); m.party = null; }
    ms = membersOf(sim, pt);
    if (ms.length < 2 && pt.formed === sim.today) { pt.gone = true; pt.ended = sim.today; for (const m of ms) m.party = null; pt.plDone = true; continue; }
    for (const m of ms) {
      if (pt.bond[m.id] == null) {
        // 入ったときの絆：もともとの仲の良さから
        let r = 0, k = 0;
        for (const o of ms) if (o !== m) { r += sim.rel(m, o).a; k++; }
        pt.bond[m.id] = Math.max(0, Math.min(30, 5 + (k ? r / k : 0) / 5));
      }
      PL(m).fam = familyOf(sim, m);
    }
    // 依頼を一緒にやり遂げた／報酬の取り分の不満
    if ((pt.done || 0) > (X.done || 0)) {
      const k = pt.done - (X.done || 0);
      X.done = pt.done;
      const avgLv = ms.reduce((s, m) => s + (m.lv || 1), 0) / Math.max(1, ms.length);
      for (const m of ms) {
        addBond(sim, pt, m, 4 * k, 'bondQuest');
        if (m.pers.A < 0.3 && (m.lv || 1) > avgLv + 2) {
          addBond(sim, pt, m, -2.5 * k, 'bondShare');
          if (sim.rng.chance(0.5)) sim.remember(m, `いちばん働いたのに、報酬が頭割りなのは納得がいかない`, { emo: -0.4, imp: 0.45, k: 'party' });
        }
      }
    }
    // けんか：仲間どうしの好感が1日で大きく下がった
    X.rs = X.rs || {};
    for (const a of ms) for (const b of ms) {
      if (a.id >= b.id) continue;
      const key = a.id + '-' + b.id, v = (sim.rel(a, b).a + sim.rel(b, a).a) / 2;
      if (X.rs[key] != null && v < X.rs[key] - 6) { addBond(sim, pt, a, -3, 'bondQuarrel'); addBond(sim, pt, b, -3); }
      X.rs[key] = v;
    }
    for (const k of Object.keys(X.rs)) { const [a, b] = k.split('-').map(Number); if (!pt.members.includes(a) || !pt.members.includes(b)) delete X.rs[k]; }
  }
}
// 解散：絆が深ければ友情や恋が残る
function farewell(sim, pt) {
  pt.plDone = true;
  const S = sim.S, st = ST(sim);
  const ids = [...new Set([...(pt.members || []), ...Object.keys(pt.bond || {}).map(Number)])];
  const ppl = ids.map((id) => S.people[id]).filter(alive);
  for (const m of ppl) { const me = PL(m); if (!(me.past || []).some((x) => x.n === pt.name && x.d >= (pt.ended ?? sim.today) - 1)) me.past = [{ n: pt.name, b: Math.round(bondOf(pt, m.id)), d: pt.ended ?? sim.today }, ...(me.past || [])].slice(0, 3); }
  for (const a of ppl) for (const b of ppl) {
    if (a.id >= b.id) continue;
    const ba = bondOf(pt, a.id), bb = bondOf(pt, b.id);
    if (ba < 55 || bb < 55) continue;
    sim.relMut(a, b).a = Math.min(100, sim.rel(a, b).a + 12); sim.relMut(b, a).a = Math.min(100, sim.rel(b, a).a + 12);
    st.friendsAfter++;
    sim.remember(a, `パーティ「${pt.name}」は解散したが、${b.given}とは今も戦友だ`, { emo: 0.6, imp: 0.7, about: [b.id], k: 'party' });
    sim.remember(b, `パーティ「${pt.name}」は解散したが、${a.given}とは今も戦友だ`, { emo: 0.6, imp: 0.7, about: [a.id], k: 'party' });
    const aa = sim.ageOf(a), ab = sim.ageOf(b);
    if (ba >= 70 && bb >= 70 && a.sex !== b.sex && a.spouseId == null && b.spouseId == null && aa >= 17 && ab >= 17 && Math.abs(aa - ab) <= 14 && !sim.isKin(a, b)) {
      for (const [x, y] of [[a, b], [b, a]]) { const r = sim.relMut(x, y); r.a = Math.min(100, r.a + 15); r.f = Math.min(100, (r.f || 0) + 20); }
      st.loveAfter++;
      sim.remember(a, `旅のあいだずっとそばにいた${b.given}のことが、別れてから気になってしかたがない`, { emo: 0.7, imp: 0.8, about: [b.id], k: 'love' });
      sim.remember(b, `旅のあいだずっとそばにいた${a.given}のことが、別れてから気になってしかたがない`, { emo: 0.7, imp: 0.8, about: [a.id], k: 'love' });
    }
  }
}

// ---------- 依頼を選ぶ（guild.js takeQuest） ----------
function questSpot(sim, q) {
  const S = sim.S;
  try {
    switch (q.type) {
      case 'hunt': { const c = S.creatures[q.target]; return c ? c.pos : null; }
      case 'explore': case 'bandits': { const b = typeof q.target === 'string' ? sim.building(+q.target.slice(1)) : null; return b ? b.door : null; }
      case 'bounty': { const t = S.people[q.target]; return t ? t.pos : null; }
      case 'deliver': { const t = sim.town(q.target); return t || null; }
    }
  } catch (e) { return null; }
  return null;
}
// 行って帰るまでの日数の見積もり（1日に歩くのは約250マス）
function tripDays(sim, q) {
  const spot = questSpot(sim, q), from = sim.town(q.s);
  if (!spot || !from) return 1;
  return 0.5 + dist(spot, from) * 2 / 250;
}
export function questFamilyOk(sim, crew, q) {
  if (!crew || !crew.length) return true;
  let est = null;
  for (const m of crew) {
    const fam = m.pl?.fam || familyOf(sim, m);
    if (!fam.length) continue;
    if (est == null) est = tripDays(sim, q);
    if (awayDays(sim, m) + est > famLimit(m)) {
      const me = PL(m);
      if (me.refQ !== q.id) { me.refQ = q.id; ST(sim).farRefused++; }
      return false;
    }
  }
  return true;
}
export function questNearMul(sim, crew, q) {
  if (!crew || !crew.some((m) => (m.pl?.fam || []).length || m.spouseId != null)) return 1;
  const spot = questSpot(sim, q), from = sim.town(q.s);
  if (!spot || !from) return 1;
  return 1 / (1 + dist(spot, from) / 40);
}

// ---------- 詳細欄 ----------
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function partyBondText(sim, p) {
  const pt = partyOfP(sim, p);
  if (!pt) return null;
  const b = Math.round(bondOf(pt, p.id));
  return `パーティ〈${pt.name}〉の絆：${b}（チームの力 +${Math.round(bondBonus(b) * 100)}%）`;
}
export function partyBondRows(sim, p) {
  let h = '';
  const t = partyBondText(sim, p);
  if (t) {
    const pt = partyOfP(sim, p);
    const near = teamBonus(sim, p) > 0;
    h += `<dt>絆</dt><dd>${escH(t)}${near ? '・仲間がそばにいる' : '・仲間と離れている'}</dd>`;
    const L = leaderOf(sim, pt);
    const pp = partyPorter(sim, pt, null);
    if (pp && pp.boss !== p) h += `<dt>荷運び</dt><dd>${escH(pp.porter.given)}（${escH(pp.boss.given)}が雇った。日当は仲間で割り勘）</dd>`;
    if (L) h += `<dt>行き先</dt><dd>${L === p ? '自分が決める（リーダー）' : `リーダーの${escH(L.given)}について行く`}・泊まりは宿屋</dd>`;
  }
  const me = p.pl;
  if (me?.fam?.length) {
    const away = awayDays(sim, p);
    if (me.leaving) h += `<dt>家族</dt><dd>家族に会いたくてパーティを抜け、家へ帰るところ</dd>`;
    else if (away >= 1) h += `<dt>家族</dt><dd>家を空けて${Math.floor(away)}日（家族恋しさ ${Math.round(me.miss || 0)}／100。${famLimit(p)}日が限り）</dd>`;
  }
  if (me?.past?.length) h += `<dt>元の仲間</dt><dd>${me.past.map((x) => `〈${escH(x.n)}〉絆${x.b}`).join('、')}</dd>`;
  return h;
}
export function partyLifeSummary(sim) { return { ...ST(sim) }; }
