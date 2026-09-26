// 装備の耐久と手入れ・修理、守り手（騎士・兵士・門番・衛兵・自警団・冒険者）の待遇と満足度（開発部）
//
// ■ 耐久値
//   品 it.dur は「残りの割合」0〜1（items.js の makeItem が dur:1 を入れる。古いセーブで欠けていれば満タンとみなす）。
//   最大値 maxDur(it) は品の種類・素材・品質・修理回数から毎回計算する（保存しない）。表示は「剣 72/100」。
//   戦いで攻撃するたびに武器が、攻撃を受けるたびに防具・盾・装身具が減る。鍛錬でも少し、仕事で道具が減る。
//   半分を切ると性能が落ち（wearMul：0.5で1.0 → 0で0.6）、0で壊れる（記憶に残る。形見や名品は「折れた〇〇」として宝物に残る）。
// ■ 修理と手入れ
//   鍛冶屋（金物）・靴屋（革）・仕立て屋と機織り（布）・宝石細工師（装身具）が直す。代金は品の値打ちと傷み具合で決まり、直した職人の家計へ。
//   修理するたびに少しずつ最大値が下がる（何度も直した品はいずれ買い替える）。
//   自分でも毎日少し手入れする（技能「鍛冶」が高いほど戻る。手入れでは8割5分まで）。
//   修理か買い替えかは持ち主が決める（代金が買い替えの半分を超えたら買い替え。形見・名品・伝説の品は必ず直す）。
// ■ 守り手の待遇（S.gear に遅延初期化）
//   危険手当（勤務した日だけ）・戦功の褒美・負傷の見舞金・殉職の弔慰金。国の兵は国庫から、自警団と冒険者は町の蓄えから。
//   王の性格（寛大さ）と国庫の具合で額が変わり、国庫が細れば止まる（国庫を守る下限あり）。
//   国は週に一度、傷んだ装備の兵に武器・防具を鍛冶屋へ一括で注文する（国庫から鍛冶屋へ）。
// ■ 満足度 p.morale（0〜100）
//   給金・休み・戦功・仲間の死・装備の状態・気分で上下する。
//   高い者：道場で謝礼を払って稽古し、良い装備を買い、見回りに熱心で、町の守りで踏みとどまる。
//   低い者：持ち場を抜けて酒場へ（怠け）、賄賂に弱くなり、辞め、兵は脱走することもある。
//
// ■ 本体から呼ぶ関数
//   gearOnHit(sim, e, t, dmg)      … society.js stepCombat の `t.hp -= dmg;` の直後（武器・防具の摩耗、戦功、負傷）
//   gearWearTool(sim, p, tool, hr) … sim.js doWork の道具の摩耗を置き換え
//   gearOnDeath(sim, p, cause, killer) … sim.js die の onDeath の直後（弔慰金・仲間の嘆き・形見の印）
//   gearCandidates(sim, p, add)    … sim.js decide（修理に行く・道場で稽古・装備を買う・怠ける）
//   gearArrive(sim, p)             … sim.js arrive の最後
//   gearDo(sim, p, dt)             … sim.js doAction の最後（道場の稽古）
//   gearHourly(sim) / gearDaily(sim) … newHour / newDay
//   gearDungeonLoot(sim, p, b)     … ダンジョン探索の戦利品（名品が出る）
//   wearMul(it)・durText(it)・gearGuardMul(p)・gearWillDefend(p)・gearDutyBonus(p)・gearHtml(sim, p)
import { clamp } from './rng.js';
import { JOBS, SPECIES } from './data.js';
import { ITEMS, makeItem, addItem, autoEquip, itemName, itemValue } from './items.js';
import { humanStats, markWanted } from './society.js';
import { spendable, pay, earn } from './property.js';
import { learnAt, gainSkill } from './growth.js';

// ---------- 名前と分類 ----------
export const GEAR_LABEL = { repair: '装備の修理を頼んでいる', lesson: '道場で謝礼を払って稽古している' };
export const GEAR_GO = { repair: '装備の修理を頼みに行くところ', lesson: '道場へ稽古に向かっている' };
export const GEAR_PREF = { repair: '道具の手入れ', lesson: '道場での稽古' };

const SLOTS = ['weapon', 'armor', 'shield', 'accessory', 'tool'];
const COMBAT_SLOTS = ['weapon', 'armor', 'shield', 'accessory'];
// 国に仕える守り手（国庫から）と、町の守り手（町の蓄えから）
const CROWN_DEF = { knight: 3, royalguard: 3, general: 4, soldier: 2, guard: 2, gatekeeper: 2, watchman: 1.5, paladin: 2 };
const TOWN_DEF = { militia: 1.2 };
const ADV = new Set(['adventurer', 'warrior', 'archer', 'cleric', 'sage']);
export const isGuardian = (p) => !!p?.job && (CROWN_DEF[p.job] != null || TOWN_DEF[p.job] != null || ADV.has(p.job));
const isCrown = (p) => CROWN_DEF[p.job] != null;
const isAdv = (p) => ADV.has(p.job);
const alive = (p) => p && p.deathYear == null;
const r1 = (v) => Math.round(v * 10) / 10;
const SLOT_NAME = { weapon: '武器', armor: '防具', shield: '盾', accessory: '装身具', tool: '道具' };

// ---------- 状態 ----------
export function ensureGear(sim) {
  const S = sim.S;
  if (!S.gear) S.gear = { v: 1, orders: [], stats: {} };
  const st = S.gear.stats;
  for (const k of ['broken', 'brokeWeapon', 'brokeArmor', 'brokeShield', 'brokeAcc', 'brokeTool', 'repaired', 'repairIncome', 'selfCare', 'hazardPaid', 'meritPaid', 'merits', 'injuryPaid', 'injuries', 'condolence', 'fallen',
    'lessons', 'lessonFees', 'orders', 'orderItems', 'orderSpent', 'soldSpares', 'spareIncome', 'quits', 'deserts', 'corrupt', 'slack', 'bought', 'boughtSpent', 'treasures', 'payStopped']) if (st[k] == null) st[k] = 0;
  S.gear.orders = S.gear.orders || [];
  S.gear.crown = S.gear.crown || {};
  return S.gear;
}
function gm(p) { return p.gm || (p.gm = { merit: 0, grief: 0, noRest: 0, dutyH: 0, lowD: 0, paid: 0, earned: 0, inj: -1 }); }

// ---------- 耐久の計算 ----------
const MAT_DUR = { scale: 2.6, iron: 1.2, magicstone: 1.4, gem: 1.6, silk: 0.9, leather: 0.85, wood: 0.75, cloth: 0.55 };
const BASE_DUR = { weapon: 70, armor: 90, shield: 60, accessory: 180, tool: 250 };   // 武器・防具は打ち合った回数、道具は使った時間
function matMul(d) {
  if (!d.mat) return d.rare ? 50 : 1;
  let s = 0, n = 0;
  for (const [k, v] of Object.entries(d.mat)) { s += (MAT_DUR[k] ?? 1) * v; n += v; }
  return n ? s / n : 1;
}
export function maxDur(it) {
  const d = ITEMS[it?.id];
  if (!d || !BASE_DUR[d.type]) return 0;
  const q = it.q || 1;
  return Math.max(20, Math.round(BASE_DUR[d.type] * matMul(d) * Math.pow(q, 1.6) * (1 - Math.min(0.4, (it.rp || 0) * 0.05))));
}
const durOf = (it) => (it?.dur == null ? 1 : it.dur);
// 性能の掛け算：半分までは変わらず、半分を切ると落ちる（0で6割）。items.js の equipBonus に同じ式を入れる
export const wearMul = (it) => { const d = durOf(it); return d >= 0.5 ? 1 : 0.6 + d * 0.8; };
export function durText(it) {
  const mx = maxDur(it);
  if (!mx) return '';
  return `${Math.max(0, Math.round(durOf(it) * mx))}/${mx}`;
}
// 形見・ダンジョンの名品・名工以上・聖剣は、直してでも使い続ける
export const cherished = (it) => !!(it && (it.memento || it.found || (it.q || 1) >= 1.55 || ITEMS[it.id]?.rare));
const unbreakable = (it) => !!ITEMS[it?.id]?.rare;

// 摩耗させる（点数で）。壊れたら true
function wear(sim, p, it, pts, why) {
  if (!it || pts <= 0) return false;
  const mx = maxDur(it);
  if (!mx) return false;
  const before = durOf(it);
  if (it.since == null) it.since = sim.today;
  let after = before - pts / mx;
  if (unbreakable(it)) after = Math.max(0.2, after);
  it.dur = Math.round(after * 10000) / 10000;
  if (after <= 0) { breakItem(sim, p, it, why); return true; }
  // 性能が変わる境目（半分・3割・1割）をまたいだら能力を計算し直す
  if (typeof p.id === 'number' && ITEMS[it.id].type !== 'tool' && [0.5, 0.3, 0.1].some((x) => before >= x && after < x)) {
    Object.assign(p, humanStats(sim, p));
    if (after < 0.3 && sim.rng.chance(0.5)) sim.remember(p, `${itemName(it)}がだいぶ傷んできた。そろそろ直さないと`, { emo: -0.2, imp: 0.25, k: 'gear' });
  }
  return false;
}

function breakItem(sim, p, it, why) {
  const S = sim.S, st = ensureGear(sim).stats, d = ITEMS[it.id];
  const idx = (p.inv || []).indexOf(it);
  if (idx >= 0) p.inv.splice(idx, 1);
  for (const s of SLOTS) if (p.eq?.[s] === it) p.eq[s] = null;
  st.broken++;
  st[{ weapon: 'brokeWeapon', armor: 'brokeArmor', shield: 'brokeShield', accessory: 'brokeAcc', tool: 'brokeTool' }[d.type]]++;
  const long = sim.today - (it.since ?? sim.today) >= 40 || it.rp >= 2;
  const nm = itemName(it);
  const verb = d.type === 'weapon' ? (['bow', 'staff'].includes(it.id) ? '折れた' : it.id === 'mace' ? '砕けた' : '折れた') : d.type === 'tool' ? '壊れた' : d.type === 'accessory' ? '割れた' : '裂けて使えなくなった';
  let txt;
  if (it.memento) txt = `${it.memento}の形見の${nm}が、とうとう${verb}`;
  else if (it.found) txt = `${it.found}で見つけた${nm}が${verb}`;
  else if (long) txt = `長年使った${nm}がとうとう${verb}`;
  else txt = why ? `${why}で${nm}が${verb}` : `${nm}が${verb}`;
  if (typeof p.id === 'number') {
    sim.remember(p, txt, { emo: it.memento || long ? -0.6 : -0.35, imp: it.memento || it.found ? 0.8 : long ? 0.55 : 0.35, k: 'gear' });
    if (cherished(it)) { (p.treasures = p.treasures || []).push(`折れた${nm}`); st.treasures++; }
    if (d.type === 'tool') autoEquip(p);   // 予備の道具があれば持ち替える
    else {
      autoEquip(p);
      Object.assign(p, humanStats(sim, p));
      if (isGuardian(p)) { const g = gm(p); p.morale = clamp((p.morale ?? 55) - 6, 0, 100); g.broke = sim.today; }
      if (sim.isWatched(p)) sim.events.push({ type: 'say', id: p.id, text: d.type === 'weapon' ? sim.rng.pick(['くっ、得物が……！', `${nm}が……！`, 'しまった、折れた！']) : 'ああ、鎧が……' });
      if (long || cherished(it) || why) sim.pushLog(`${sim.fullName(p)}の${nm}が${verb}。`, 'event', [p.id], p.pos);
    }
  }
}

// ---------- 戦いでの摩耗・戦功・負傷（stepCombat から） ----------
const isHuman = (x) => typeof x?.id === 'number';
export function gearOnHit(sim, e, t, dmg) {
  const R = sim.rng;
  if (isHuman(e) && e.eq?.weapon) {
    // 硬い相手（鎧の騎士・竜・ゴーレム）ほど刃がこぼれる
    const hard = 1 + Math.min(1.5, (t.def || 0) / 20) + (['golem', 'dragon', 'wyvern', 'skelknight'].includes(t.sp) ? 0.5 : 0);
    wear(sim, e, e.eq.weapon, hard, isHuman(t) ? `${t.given}との戦い` : `${t.name}との戦い`);
  }
  if (isHuman(t)) {
    const eq = t.eq || {};
    const by = isHuman(e) ? `${e.given}との戦い` : `${e.name}との戦い`;
    if (eq.shield && R.chance(0.5)) wear(sim, t, eq.shield, 1 + dmg / 15, by);
    else if (eq.armor) wear(sim, t, eq.armor, 0.6 + dmg / 10, by);
    if (eq.accessory && R.chance(0.2)) wear(sim, t, eq.accessory, 0.5, by);
    // 負傷：守り手が深手を負った（見舞金は gearDaily で）
    if (isGuardian(t) && t.hp > 0 && t.hp < t.maxhp * 0.35) { const g = gm(t); if (g.inj !== sim.today) { g.inj = sim.today; g.injPaid = false; } }
  }
  // 戦功：守り手・冒険者が魔物を仕留めた
  if (isHuman(e) && !isHuman(t) && t.hp <= 0 && isGuardian(e) && SPECIES[t.sp]?.monster) merit(sim, e, t);
}

function merit(sim, p, c) {
  const S = sim.S, st = ensureGear(sim).stats, def = SPECIES[c.sp];
  const s = sim.townOf(p);
  const near = s && Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < s.r + 25;
  const g = gm(p);
  g.merit += c.named ? 3 : 1;
  p.morale = clamp((p.morale ?? 55) + (c.named ? 15 : 5), 0, 100);
  st.merits++;
  // 褒美：国の兵は国庫、自警団と冒険者は（町の近くで倒したときだけ）町の蓄えから
  const base = Math.min(40, 2 + (def.loot || 5) * (c.lv || 1) * 0.15) * (c.named ? 3 : 1);
  let amt = 0, from = '';
  if (isCrown(p)) {
    const k = sim.kingdomOf(p);
    const f = payFactor(sim, k);
    amt = Math.round(base * generosity(sim, k) * f);
    if (amt >= 1 && k.treasury - amt > FLOOR) { k.treasury -= amt; spend(sim, k, amt); from = '国'; } else amt = 0;
  } else if (near) {
    const t = S.towns[p.s];
    amt = Math.round(base * 0.6);
    if (amt >= 1 && t.fund - amt > 60) { t.fund -= amt; from = '町'; } else amt = 0;
  }
  if (amt > 0) {
    earn(sim, p, amt, 0.6); st.meritPaid += amt; g.earned += amt;
    sim.remember(p, `${c.name}を討った戦功で、${from}から${amt}銅貨の褒美を賜った`, { emo: 0.7, imp: c.named ? 0.9 : 0.5, k: 'duty' });
    if (c.named || amt >= 20) sim.pushLog(`${sim.townOf(p).name}の${JOBS[p.job].name}${p.given}が${c.name}を討ち、${from}から${amt}銅貨の褒美を賜った。`, 'event', [p.id], p.pos);
  }
}

// ---------- 道具の摩耗（doWork から） ----------
export function gearWearTool(sim, p, tool, hr) {
  if (!tool) return;
  wear(sim, p, tool, hr, null);
}

// ---------- 死：弔慰金・仲間の嘆き・形見の印 ----------
const LINE = new Set(['monster', 'demon', 'beast', 'war']);
export function gearOnDeath(sim, p, cause, killer) {
  const S = sim.S, st = ensureGear(sim).stats;
  // 形見：いちばん値打ちのある品に、故人の名を刻む（受け継いだ者は直してでも使う）
  const best = (p.inv || []).filter((it) => COMBAT_SLOTS.includes(ITEMS[it.id]?.type) || ITEMS[it.id]?.type === 'tool').sort((a, b) => itemValue(b) - itemValue(a))[0];
  if (best && itemValue(best) >= 20 && !best.memento) best.memento = p.given;
  if (!isGuardian(p) || !LINE.has(cause) && !(cause === 'murder' && killer?.bandit)) return;
  st.fallen++;
  const hh = sim.hh(p);
  const kin = hh ? hh.members.filter((id) => id !== p.id && alive(S.people[id])) : [];
  // 弔慰金：国の兵は国庫から（王が寛大なほど多い）、自警団と冒険者は町の蓄えから
  if (hh && kin.length) {
    let amt = 0, from = '';
    if (isCrown(p)) {
      const k = sim.kingdomOf(p);
      amt = Math.round((20 + (p.lv || 1) * 2) * generosity(sim, k) * Math.max(0.5, payFactor(sim, k)));
      if (k.treasury - amt > FLOOR) { k.treasury -= amt; spend(sim, k, amt); from = '国'; }
      else { const t = S.towns[p.s]; amt = Math.min(amt, Math.max(0, Math.round(t.fund * 0.2))); t.fund -= amt; from = '町'; }
    } else {
      const t = S.towns[p.s];
      amt = Math.min(25, Math.max(0, Math.round(t.fund * 0.15)));
      t.fund -= amt; from = isAdv(p) ? 'ギルドと町' : '町';
    }
    if (amt > 0) {
      hh.money += amt; st.condolence += amt;
      for (const id of kin) { const q = S.people[id]; if (sim.ageOf(q) >= 14) sim.remember(q, `${p.given}の殉職に、${from}から${amt}銅貨の弔慰金が届いた`, { emo: -0.1, imp: 0.6, about: [p.id], k: 'duty' }); }
      sim.pushLog(`${JOBS[p.job].name}${sim.fullName(p)}の殉職に、${from}から遺族へ${amt}銅貨の弔慰金が贈られた。`, 'event', [p.id], p.pos);
    }
  }
  // 同じ町の守り手は仲間の死を悼み、満足度が下がる
  for (const q of sim.living()) {
    if (q === p || q.s !== p.s || !isGuardian(q)) continue;
    const g = gm(q);
    const close = sim.rel(q, p).a > 30;
    g.grief += close ? 1.5 : 0.5;
    q.morale = clamp((q.morale ?? 55) - (close ? 7 : 2), 0, 100);
  }
}

// ---------- 王の寛大さと国庫の具合 ----------
// 国庫から出した待遇の費用を国ごとに数える（試験と国々のタブ用）
function spend(sim, k, amt) { const c = ensureGear(sim).crown; c[k.id] = Math.round(((c[k.id] || 0) + amt) * 10) / 10; }
const FLOOR = 350;   // 待遇に使うのはこれより上の分だけ（国庫を崩さない）
export function generosity(sim, k) {
  const king = k && sim.S.people[k.kingId];
  if (!king) return 0.8;
  return clamp(1 + (king.pers.A - 0.5) * 0.8 + (king.values.courage - 0.5) * 0.4 - (king.values.ambition - 0.5) * 0.3, 0.5, 1.5);
}
// 国庫が 350 以下なら 0、1150 で 1
function payFactor(sim, k) { return k ? clamp((k.treasury - FLOOR) / 800, 0, 1) : 0; }

// ---------- 修理 ----------
const REPAIRERS = {
  metal: ['smith'], leather: ['cobbler', 'tailor', 'smith'], cloth: ['tailor', 'weaver', 'cobbler'], jewel: ['jeweler', 'smith'],
};
function repairKind(it) {
  const d = ITEMS[it.id];
  if (d.type === 'accessory') return 'jewel';
  const m = d.mat || {};
  if (m.iron || m.scale || d.type === 'tool' || d.type === 'weapon' || d.type === 'shield') return 'metal';
  if (m.leather) return 'leather';
  return 'cloth';
}
function repairerFor(sim, p, it, cache) {
  const kind = repairKind(it);
  for (const job of REPAIRERS[kind]) {
    const key = p.s + ':' + job;
    let r = cache?.[key];
    if (r === undefined) { r = sim.living().find((q) => q.job === job && q.s === p.s && q.jail == null) || null; if (cache) cache[key] = r; }
    if (r) return r;
  }
  return null;
}
export function repairCost(it) {
  return Math.max(1, Math.round(itemValue(it) * (1 - durOf(it)) * 0.3));
}
// 同じ部位の、店に並ぶ買い替え候補の値段（なければ null）
function replacePrice(sim, p, it) {
  const shop = sim.S.towns[p.s]?.shop || [];
  const d = ITEMS[it.id];
  const sc = (x) => ((ITEMS[x.id].atk || 0) + (ITEMS[x.id].def || 0) + (d.type === 'tool' ? 1 : 0)) * x.q;
  const c = shop.filter((x) => ITEMS[x.id].type === d.type && (d.type !== 'tool' || x.id === it.id) && sc(x) >= sc(it) * 0.9).map((x) => Math.round(itemValue(x) * 1.2)).sort((a, b) => a - b);
  return c.length ? c[0] : null;
}
// 直すべき品：[品, 修理代]（修理か買い替えかの判断つき）
function needsRepair(sim, p, cache) {
  const combat = isGuardian(p) || (JOBS[p.job]?.combat || 0) >= 2;
  const out = [];
  for (const s of SLOTS) {
    const it = p.eq?.[s];
    if (!it || unbreakable(it)) continue;
    const dur = durOf(it);
    const th = s === 'tool' ? 0.3 : combat ? 0.6 : 0.4;
    if (dur >= th) continue;
    const r = repairerFor(sim, p, it, cache);
    if (!r) continue;
    const cost = r.hh === p.hh ? 0 : repairCost(it);
    if (!cherished(it)) {
      const rp = replacePrice(sim, p, it);
      if (rp != null && cost > rp * 0.5 && spendable(sim, p) >= rp + 10) continue; // 買い替えたほうが得（buygear に任せる）
      if (dur > 0.25 && cost > spendable(sim, p) * 0.5) continue;
    }
    if (cost > spendable(sim, p)) continue;
    out.push([it, cost, r]);
  }
  return out;
}
function doRepair(sim, p) {
  const st = ensureGear(sim).stats;
  const list = needsRepair(sim, p, {});
  if (!list.length) return;
  const done = [];
  let total = 0;
  for (const [it, cost, r] of list) {
    if (cost > spendable(sim, p)) continue;
    const sk = r.skill?.[r.job] ?? 0.3;
    if (cost > 0) { pay(sim, p, cost); const hh = sim.hh(r); if (hh) hh.money += cost; st.repairIncome += cost; }
    it.dur = Math.min(1, Math.max(durOf(it), 0.82 + sk * 0.18));
    it.rp = (it.rp || 0) + 1;
    if (r.skill) r.skill[r.job] = Math.min(1, sk + 0.002);
    st.repaired++; total += cost;
    done.push(itemName(it));
    if (r !== p && r.needs) r.needs.esteem = Math.min(100, r.needs.esteem + 3);
    if (r !== p && sim.rng.chance(0.3)) sim.remember(r, `${p.given}の${itemName(it)}を${cost}銅貨で直した`, { emo: 0.3, imp: 0.25, about: [p.id], k: 'craft' });
  }
  if (!done.length) return;
  Object.assign(p, humanStats(sim, p));
  if (isGuardian(p)) p.morale = clamp((p.morale ?? 55) + 3, 0, 100);
  sim.remember(p, `${done.join('と')}を${total ? `${total}銅貨で` : ''}直してもらった`, { emo: 0.3, imp: 0.3, k: 'gear' });
  if (sim.isWatched(p) && list.some(([it]) => it.memento)) sim.events.push({ type: 'say', id: p.id, text: '形見なんだ。大事に使わないとな' });
}

// ---------- 行動の候補（decide） ----------
export function gearCandidates(sim, p, add) {
  if (p.jail != null || !p.job || !sim.isAdult(p) || p.quest && isAdv(p) && p.action?.type === 'quest') return;
  const h = sim.hour(), S = sim.S, R = sim.rng;
  if (S.towns[p.s]?.occupied) return;
  // 修理を頼みに行く（職人の開いている昼間）
  if (h >= 8 && h < 18) {
    const list = needsRepair(sim, p, null);
    if (list.length) {
      const [it, , r] = list.sort((a, b) => durOf(a[0]) - durOf(b[0]))[0];
      const place = sim.placeFor(p, JOBS[r.job]?.place || 'smithy');
      if (place) add(3 + (1 - durOf(it)) * 6 + (cherished(it) ? 2 : 0) + (isGuardian(p) ? 1.5 : 0), 'repair', place, 15);
    }
  }
  if (!isGuardian(p)) return;
  const m = p.morale ?? 55;
  const rest = sim.isRestDay();
  // 満足した守り手：謝礼を払って道場で稽古（道場のある町のみ）
  if (m >= 60 && h >= 9 && h < 17 && !p.fight) {
    const s = sim.townOf(p);
    const dojo = sim.townBuilding(s, 'dojo');
    const fee = lessonFee(p);
    const teacher = teacherFor(sim, p);
    const place = dojo ? { x: dojo.door.x, z: dojo.door.z, bld: dojo.id } : sim.placeFor(p, 'drillyard');
    if (teacher && place && spendable(sim, p) >= fee + 15 && p.gm?.lessonDay !== sim.today) {
      add(2.5 + (m - 60) / 10 + p.values.ambition * 2 + (rest ? 2 : 0), 'lesson', place, R.int(60, 120));
    }
  }
  // 満足した守り手：少し無理をしてでも良い装備を買う
  if (m >= 65 && h >= 8 && h < 18) {
    const shop = S.towns[p.s]?.shop || [];
    if (shop.some((it) => sim.isUpgrade(p, it) && itemValue(it) * 1.2 <= spendable(sim, p) - 10)) add(3 + (m - 65) / 8, 'buygear', sim.placeFor(p, 'smithy'), 15);
  }
  // 満足度の低い守り手：持ち場を抜けて酒場へ（怠け）
  if (m < 30 && !isAdv(p) && h >= 8 && h < 20 && !rest) add(5 + (30 - m) / 5 + (100 - p.needs.sloth) / 50, 'tavern', sim.placeFor(p, 'tavern'), R.int(50, 100));
}
// 師：町の剣の師範。いなければ、町でいちばん腕の立つ騎士・将軍・近衛・聖騎士・ギルドの長が教官を務める
const TEACHERS = ['swordmaster', 'general', 'royalguard', 'knight', 'paladin', 'guildmaster'];
function teacherFor(sim, p) {
  let best = null, bs = -1;
  for (const q of sim.living()) {
    if (q === p || q.s !== p.s || q.jail != null || !TEACHERS.includes(q.job)) continue;
    const sc = (q.job === 'swordmaster' ? 100 : 0) + (q.lv || 1);
    if (q.job !== 'swordmaster' && (q.lv || 1) <= (p.lv || 1) + 1) continue;
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}
const lessonFee = (p) => (['knight', 'royalguard', 'general', 'paladin'].includes(p.job) ? 6 : 4);

// ---------- 到着（arrive） ----------
export function gearArrive(sim, p) {
  const a = p.action;
  if (!a) return;
  const st = ensureGear(sim).stats;
  if (a.type === 'repair') { doRepair(sim, p); a.until = sim.S.t + 15; return; }
  if (a.type === 'buygear') {
    // 買い物の結果（sim.buyGear が記憶を残す）を数える
    const m = p.memories?.[p.memories.length - 1];
    if (m && m.k === 'gear' && m.min === sim.S.t && m.txt.includes('買った')) { st.bought = (st.bought || 0) + 1; st.boughtSpent = (st.boughtSpent || 0) + (+(m.txt.match(/(\d+)銅貨/)?.[1]) || 0); }
    return;
  }
  if (a.type === 'lesson') {
    const master = teacherFor(sim, p);
    const fee = lessonFee(p);
    if (!master || spendable(sim, p) < fee) { a.until = sim.S.t + 5; return; }
    pay(sim, p, fee); const hh = sim.hh(master); if (hh) hh.money += fee;
    st.lessons++; st.lessonFees += fee;
    gm(p).lessonDay = sim.today;
    if (sim.rng.chance(0.35)) sim.remember(p, `${fee}銅貨の謝礼を払い、${master.job === 'swordmaster' ? '師範' : JOBS[master.job].name}の${master.given}に稽古をつけてもらった`, { emo: 0.4, imp: 0.35, about: [master.id], k: 'duty' });
    return;
  }
  if (a.type === 'tavern' && isGuardian(p) && !isAdv(p) && (p.morale ?? 55) < 30) {
    const h = sim.hour();
    const night = p.shift === 'night' || p.job === 'watchman';
    const onDuty = night ? (h >= 19 || h < 7) : (h >= 7 && h < 19);
    if (onDuty && !sim.isRestDay()) {
      st.slack++; gm(p).slack = (gm(p).slack || 0) + 1;
      if (sim.rng.chance(0.4)) sim.remember(p, '持ち場を抜けて、酒場で油を売った', { emo: 0.1, imp: 0.3, k: 'duty' });
    }
  }
}

// ---------- 行動中（doAction） ----------
export function gearDo(sim, p, dt) {
  const a = p.action;
  if (!a || a.phase !== 'do' || a.type !== 'lesson') return;
  const hr = dt / 60;
  learnAt(sim, p, 'dojo', dt);
  p.xp = (p.xp || 0) + 1.0 * hr * (0.5 + p.pers.C);
  p.needs.sloth = Math.max(0, p.needs.sloth - 6 * hr);
  p.needs.esteem = Math.min(100, p.needs.esteem + 2 * hr);
  if (p.eq?.weapon) wear(sim, p, p.eq.weapon, 0.3 * hr, null);
}

// ---------- 毎時 ----------
function initMorale(p) {
  if (p.morale == null || Number.isNaN(p.morale)) p.morale = clamp(52 + ((p.pers?.C ?? 0.5) - 0.5) * 20 + ((p.values?.courage ?? 0.5) - 0.5) * 16 + ((p.mood ?? 50) - 50) * 0.2, 15, 90);
}
export function gearHourly(sim) {
  const G = ensureGear(sim);
  const t = sim.today;
  const seed = !G.seeded && t === 0;
  G.seeded = true;
  for (const p of sim.living()) {
    // 世界の始まり：持ち物はそれぞれ使い込まれている（一度だけ）。古いセーブで耐久のない品は満タンから
    if (seed && p.inv) for (const it of p.inv) if (BASE_DUR[ITEMS[it.id]?.type] && !unbreakable(it)) { const h = ((p.id * 2654435761 + (it.id.length * 97)) >>> 0) % 1000 / 1000; it.dur = r1(1 - 0.6 * h * h); }
    if (seed && p.eq && (p.eq.weapon || p.eq.armor)) { autoEquip(p); Object.assign(p, humanStats(sim, p)); }
    if (p.eq) for (const s of SLOTS) { const it = p.eq[s]; if (it) { if (it.dur == null) it.dur = 1; if (it.since == null) it.since = t - (t < 1 ? 60 + (p.id % 200) : 0); } }
    if (!isGuardian(p)) continue;
    const a = p.action, g = gm(p);
    initMorale(p);
    if (!p.eq) continue;
    if (a && a.phase === 'do') {
      if (a.type === 'work' || a.type === 'sentry' || a.type === 'quest') g.dutyH++;
      if (a.type === 'train' || a.type === 'dojo') { g.dutyH += 0.5; if (p.eq.weapon) wear(sim, p, p.eq.weapon, 0.3, null); }
      if ((a.type === 'work' || a.type === 'sentry') && p.eq.armor) wear(sim, p, p.eq.armor, 0.03, null);
    }
  }
}

// ---------- 毎日 ----------
export function gearDaily(sim) {
  const S = sim.S, R = sim.rng, G = ensureGear(sim), st = G.stats;
  const living = sim.living();
  const byK = {};
  for (const p of living) {
    // 自分での手入れ（誰でも少し。鍛冶の心得があるほど戻る。手入れでは8割5分まで）
    if (p.eq && p.jail == null) {
      const sk = (p.skills?.['鍛冶'] || 0) / 100;
      for (const s of SLOTS) {
        const it = p.eq[s];
        if (!it || durOf(it) >= 0.85 || unbreakable(it)) continue;
        const add = (s === 'tool' ? 0.006 : isGuardian(p) ? 0.02 : 0.01) + sk * 0.05;
        const before = durOf(it);
        it.dur = Math.min(0.85, before + add);
        st.selfCare++;
        if (before < 0.5 && it.dur >= 0.5) Object.assign(p, humanStats(sim, p));
        if (p.skills && s !== 'tool' && R.chance(0.3)) gainSkill(sim, p, '鍛冶', 0.15, 0.5);
      }
    }
    if (!isGuardian(p) || p.jail != null) continue;
    const g = gm(p);
    initMorale(p);
    const k = sim.kingdomOf(p);
    (byK[k.id] = byK[k.id] || []).push(p);
    // --- 給金（危険手当）：勤めた日だけ ---
    const worked = g.dutyH >= 3;
    let paidOK = true;          // ふだんの給金が出ているか（国庫・町の蓄えが尽きると出ない）
    let hazard = 0;             // 危険手当が出ているか（0〜1）
    if (isCrown(p)) {
      const f = payFactor(sim, k);
      const amt = r1(CROWN_DEF[p.job] * generosity(sim, k) * f);
      if (worked && amt >= 0.3) { k.treasury -= amt; spend(sim, k, amt); earn(sim, p, amt, 0.5); st.hazardPaid += amt; g.earned += amt; g.paid = amt; }
      else if (worked) g.paid = 0;
      hazard = clamp(amt / CROWN_DEF[p.job], 0, 1.5);
      if (k.treasury < 30) paidOK = false;
      if (amt < 0.3) { st.payStopped++; if (R.chance(0.08)) sim.remember(p, '国庫が苦しく、危険手当が止まったままだ', { emo: -0.3, imp: 0.3, k: 'duty' }); }
    } else if (TOWN_DEF[p.job]) {
      const t = S.towns[p.s];
      const amt = r1(TOWN_DEF[p.job] * (t.fund > 150 ? 1 : t.fund > 60 ? 0.5 : 0));
      if (worked && amt > 0) { t.fund -= amt; earn(sim, p, amt, 0.5); st.hazardPaid += amt; g.earned += amt; g.paid = amt; }
      hazard = amt / TOWN_DEF[p.job];
      if (t.fund < 10) paidOK = false;
    } else if (isAdv(p)) { paidOK = spendable(sim, p) > 15; hazard = 0.6; }
    // --- 負傷の見舞金 ---
    if (g.inj >= sim.today - 1 && !g.injPaid) {
      g.injPaid = true; st.injuries++;
      let amt = 0, from = '';
      if (isCrown(p)) { amt = Math.round(8 * generosity(sim, k) * Math.max(0.3, payFactor(sim, k))); if (k.treasury - amt > FLOOR * 0.6) { k.treasury -= amt; spend(sim, k, amt); from = '国'; } else amt = 0; }
      else { const t = S.towns[p.s]; amt = t.fund > 80 ? 5 : 0; t.fund -= amt; from = '町'; }
      if (amt > 0) {
        earn(sim, p, amt, 0.5); st.injuryPaid += amt; g.earned += amt;
        p.morale = clamp(p.morale + 4, 0, 100);
        sim.remember(p, `深手を負った見舞いに、${from}から${amt}銅貨が届いた`, { emo: 0.3, imp: 0.4, k: 'duty' });
      } else p.morale = clamp(p.morale - 3, 0, 100);
    }
    // --- 休み ---
    if (g.dutyH < 3) g.noRest = 0; else g.noRest++;
    // --- 満足度の目標値 ---
    const cond = (() => {
      const w = p.eq?.weapon, a = p.eq?.armor;
      if (!w) return -10;
      return ((wearMul(w) + (a ? wearMul(a) : 0.8)) / 2 - 0.85) * 40 + (w.q < 0.8 ? -3 : w.q > 1.2 ? 3 : 0);
    })();
    const gen = isCrown(p) ? (generosity(sim, k) - 1) * 15 : 0;
    const target = 52 + gen + (paidOK ? 0 : -15) + hazard * 8 + Math.min(15, g.merit * 3) - Math.min(12, g.grief * 4) + cond
      - Math.max(0, g.noRest - 6) * 3 + ((p.mood ?? 50) - 50) * 0.25 + (p.pers.C - 0.5) * 6 + (p.values.courage - 0.5) * 6
      + (S.towns[p.s]?.occupied ? -15 : 0);
    p.morale = r1(clamp(p.morale * 0.75 + target * 0.25, 0, 100));
    g.merit *= 0.85; g.grief *= 0.8; g.earned *= 0.8;
    if (g.merit < 0.05) g.merit = 0; if (g.grief < 0.05) g.grief = 0;
    g.dutyH = 0;
    // --- 満足度の低さが続くと ---
    if (p.morale < 25) g.lowD = (g.lowD || 0) + 1; else g.lowD = 0;
    if (p.morale > 60 && p.gm.corrupt) { p.uwCorrupt = false; p.gm.corrupt = false; }
    // 賄賂に弱くなる（町の衛兵・門番）
    if (g.lowD >= 3 && !p.uwCorrupt && ['guard', 'watchman', 'gatekeeper', 'militia'].includes(p.job) && p.pers.A < 0.55 && R.chance(0.25)) {
      const nK = living.filter((q) => q.uwCorrupt && sim.townOf(q).kingdom === k.id).length;
      if (nK < 4) { p.uwCorrupt = true; g.corrupt = true; st.corrupt++; sim.remember(p, 'こんな扱いなら、少しくらい袖の下を受け取っても罰は当たるまい', { emo: -0.2, imp: 0.5, k: 'duty' }); }
    }
    // 辞める・脱走する
    if (g.lowD >= 5 && R.chance(0.15)) quit(sim, p, k);
    if (g.lowD === 0 && p.morale >= 75 && R.chance(0.05)) sim.remember(p, R.pick(['この町を守れることを誇りに思う', 'お上はよく報いてくれる。もっと腕を磨こう', '仲間にも恵まれた。今の務めに不満はない']), { emo: 0.5, imp: 0.3, k: 'duty' });
  }
  // --- 冒険者：使わない武具を鍛冶屋に売る（ダンジョンの名品は高く売れる） ---
  sellSpares(sim, living);
  // --- 国の一括注文（週に一度）と納品 ---
  bulkOrders(sim, byK);
}

function quit(sim, p, k) {
  const st = ensureGear(sim).stats, S = sim.S;
  const s = sim.townOf(p);
  const old = p.job;
  const desert = ['soldier', 'knight'].includes(old) && (k.war || p.morale < 10);
  p.formerJob = old;
  p.job = s.type === 'village' ? 'farmer' : isAdv(p) ? 'wanderer' : 'servant';
  if (!JOBS[p.job]) p.job = 'farmer';
  if (!['king', 'royal', 'noble'].includes(p.rank)) p.rank = JOBS[p.job].rank || 'commoner';
  p.mission = null; p.post = null; p.shift = null; p.action = null;
  p.gm.lowD = 0; p.morale = 40;
  if (p.uwCorrupt && p.gm.corrupt) { p.uwCorrupt = false; p.gm.corrupt = false; }
  autoEquip(p); Object.assign(p, humanStats(sim, p));
  if (desert) {
    st.deserts++;
    markWanted(sim, p, '脱走', 5);
    sim.remember(p, `${JOBS[old].name}の務めに耐えられず、隊を抜けた`, { emo: -0.6, imp: 0.9, k: 'duty' });
    sim.pushLog(`${s.name}の${JOBS[old].name}${sim.fullName(p)}が待遇に耐えかねて脱走した。`, 'event', [p.id], p.pos);
    sim.gossip(p, `${JOBS[old].name}を脱走したらしい`, -0.5, sim.living().filter((q) => q.s === p.s && sim.rng.chance(0.3)), { silent: true });
  } else {
    st.quits++;
    sim.remember(p, `割に合わない${JOBS[old].name}の務めを辞め、${JOBS[p.job].name}として暮らすことにした`, { emo: -0.2, imp: 0.85, k: 'duty' });
    sim.pushLog(`${s.name}の${JOBS[old].name}${sim.fullName(p)}が務めを辞めた（待遇への不満）。`, 'event', [p.id], p.pos);
  }
}

function sellSpares(sim, living) {
  const S = sim.S, st = ensureGear(sim).stats;
  const smiths = {};
  for (const q of living) if (q.job === 'smith' && q.jail == null && !smiths[q.s]) smiths[q.s] = q;
  for (const p of living) {
    if (!isAdv(p) || !p.inv?.length || (p.quest && p.action?.type === 'quest')) continue;
    const smith = smiths[p.s];
    const town = S.towns[p.s];
    if (!smith || !town || town.occupied) continue;
    town.shop = town.shop || [];
    const eqd = new Set(Object.values(p.eq || {}));
    for (const it of p.inv.slice()) {
      const d = ITEMS[it.id];
      if (!d || !COMBAT_SLOTS.includes(d.type) || eqd.has(it) || it.memento || d.rare) continue;
      if (town.shop.length >= 16) break;
      const fine = (it.q || 1) >= 1.3 || it.found;
      const price = Math.round(itemValue(it) * (fine ? 0.75 : 0.5) * (0.4 + durOf(it) * 0.6));
      const shh = sim.hh(smith);
      if (!shh || shh.money < price + 20 || price < 1) continue;
      shh.money -= price; p.purse = (p.purse || 0) + price;
      p.inv.splice(p.inv.indexOf(it), 1);
      it.maker = smith.id;  // 売れたら鍛冶屋の家計へ（buyGear）
      if (durOf(it) < 0.9) it.dur = Math.max(durOf(it), 0.9);  // 鍛冶屋が研ぎ直して店に出す
      town.shop.push(it);
      st.soldSpares++; st.spareIncome += price;
      sim.remember(p, `使わない${itemName(it)}を鍛冶屋の${smith.given}に${price}銅貨で売った`, { emo: 0.4, imp: fine ? 0.5 : 0.25, k: 'gear' });
      if (fine) sim.pushLog(`冒険者${p.given}が${it.found ? `${it.found}で見つけた` : ''}${itemName(it)}を鍛冶屋に${price}銅貨で売った。店先に名品が並んだ。`, 'event', [p.id, smith.id], p.pos);
    }
  }
}

// 国の一括注文：週に一度、傷んだ・粗末な装備の兵に新しい武具を支給する
const ISSUE = {
  knight: ['longsword', 'chainmail'], royalguard: ['longsword', 'platearmor'], general: ['greatsword', 'platearmor'], paladin: ['longsword', 'chainmail'],
  soldier: ['spear', 'leatherarmor'], guard: ['spear', 'leatherarmor'], gatekeeper: ['spear', 'chainmail'], watchman: ['mace', 'leatherarmor'],
};
function bulkOrders(sim, byK) {
  const S = sim.S, G = S.gear, st = G.stats, R = sim.rng;
  // 納品
  for (const o of G.orders.slice()) {
    if (o.due > sim.today) continue;
    G.orders.splice(G.orders.indexOf(o), 1);
    const smith = S.people[o.smith];
    let n = 0;
    for (const [pid, id] of o.items) {
      const p = S.people[pid];
      if (!alive(p) || !ISSUE[p.job]) continue;
      const sk = smith?.skill?.smith ?? 0.4;
      const it = makeItem(id, clamp(0.75 + sk * 0.5 + R.gauss(0, 0.05), 0.7, 1.35), { maker: o.smith, since: sim.today, issued: o.k });
      const slot = ITEMS[id].type;
      const old = p.eq?.[slot];
      addItem(p, it); autoEquip(p);
      if (old && old !== p.eq[slot] && !cherished(old) && p.inv.includes(old)) p.inv.splice(p.inv.indexOf(old), 1); // 古い品は武器庫へ返す
      Object.assign(p, humanStats(sim, p));
      p.morale = clamp((p.morale ?? 55) + 6, 0, 100);
      sim.remember(p, `国から新しい${itemName(it)}が支給された`, { emo: 0.6, imp: 0.45, k: 'gear' });
      n++;
    }
    if (n && smith) sim.remember(smith, `国から請け負った武具${n}点を納めた`, { emo: 0.5, imp: 0.5, k: 'craft' });
    if (n) sim.pushLog(`${S.kingdoms[o.k].name}の兵に、鍛冶屋${smith ? smith.given : ''}が打った武具${n}点が支給された。`, 'event', [], null);
  }
  if (sim.today % 7 !== 2) return;
  for (const k of S.kingdoms) {
    const f = payFactor(sim, k);
    if (k.treasury < 700 || G.orders.some((o) => o.k === k.id)) continue;
    const budget = Math.min(150, (k.treasury - 600) * 0.2) * generosity(sim, k);
    const smiths = sim.living().filter((q) => q.job === 'smith' && sim.townOf(q).kingdom === k.id && q.jail == null).sort((a, b) => (b.skill?.smith || 0) - (a.skill?.smith || 0));
    if (!smiths.length || budget < 30) continue;
    const need = [];
    for (const p of byK[k.id] || []) {
      const kit = ISSUE[p.job];
      if (!kit) continue;
      for (const id of kit) {
        const slot = ITEMS[id].type, cur = p.eq?.[slot];
        const sc = (x) => ((ITEMS[x.id].atk || 0) + (ITEMS[x.id].def || 0)) * x.q * wearMul(x);
        if (cherished(cur)) continue;
        if (!cur || sc(cur) < (ITEMS[id].atk || ITEMS[id].def) * 0.85 || durOf(cur) < 0.35) need.push([p.id, id, durOf(cur || { dur: 0 })]);
      }
    }
    if (!need.length) continue;
    need.sort((a, b) => a[2] - b[2]);
    let spent = 0;
    const items = [];
    for (const [pid, id] of need) {
      const cost = Math.round(ITEMS[id].value * 0.9);
      if (spent + cost > budget) continue;
      spent += cost; items.push([pid, id]);
      if (items.length >= 8) break;
    }
    if (!items.length) continue;
    const smith = smiths[0];
    k.treasury -= spent; spend(sim, k, spent);
    const hh = sim.hh(smith); if (hh) hh.money += spent;
    st.orders++; st.orderItems += items.length; st.orderSpent += spent;
    G.orders.push({ k: k.id, smith: smith.id, items, due: sim.today + 2 });
    sim.remember(smith, `国から兵の武具${items.length}点の注文を受けた（${spent}銅貨）`, { emo: 0.6, imp: 0.55, k: 'craft' });
    sim.pushLog(`${k.name}の国庫から、鍛冶屋${sim.fullName(smith)}へ兵の武具${items.length}点が一括で注文された（${spent}銅貨）。`, 'event', [smith.id], smith.pos);
  }
}

// ---------- ダンジョンの戦利品（名品） ----------
const LOOT = ['sword', 'axe', 'shield', 'ring', 'amulet', 'chainmail', 'longsword', 'spear', 'mace', 'ironshield', 'bow', 'staff', 'greatsword', 'platearmor'];
export function gearDungeonLoot(sim, p, b) {
  const R = sim.rng;
  if (!R.chance(0.3)) return null;
  const fine = R.chance(0.12 + (b.type === 'pyramid' ? 0.08 : 0));
  const id = R.pick(fine ? LOOT : LOOT.slice(0, 7));
  const it = makeItem(id, fine ? R.range(1.3, 1.75) : R.range(0.7, 1.3), { dur: r1(R.range(0.45, 0.95)), since: sim.today });
  if (fine) it.found = b.name;
  addItem(p, it);
  if (fine) {
    sim.remember(p, `${b.name}の奥で、古い${itemName(it)}を見つけた`, { emo: 0.8, imp: 0.7, k: 'gear' });
    sim.pushLog(`冒険者${p.given}が${b.name}で${itemName(it)}を見つけた。`, 'event', [p.id], b.door);
  }
  return it;
}

// ---------- 守りへの効き目（danger.js・civic.js・society.js 用） ----------
// 町の守りの力の掛け算（満足度が高いほど踏みとどまる）
export function gearGuardMul(p) {
  const m = p?.morale;
  if (m == null) return 1;
  // 満足度が高くても無謀に挑ませはしない（勝ち目の見極めは danger.js のまま）。低いと及び腰になる
  return m >= 40 ? 1 : 0.85 + m / 267;
}
// 迎え撃ちに出るか（満足度がひどく低い者は、見て見ぬふりをすることがある）
export function gearWillDefend(p, rng) {
  const m = p?.morale;
  if (m == null || m >= 20) return true;
  return rng ? rng.chance(0.5 + m / 40) : true;
}
// 勤務（見回り・門番）の点数への足し引き
export function gearDutyBonus(p) {
  const m = p?.morale;
  if (m == null) return 0;
  return m >= 65 ? (m - 65) / 12 : m < 30 ? -(30 - m) / 8 : 0;
}
// 一撃の気迫（humanStats の攻撃に掛ける。±5%）
export function gearMoraleMul(p) {
  const m = p?.morale;
  if (m == null) return 1;
  return 0.95 + clamp(m, 0, 100) / 1000;
}

// ---------- 画面 ----------
export function gearItemNote(it) {
  if (!it) return '';
  const t = durText(it);
  const bits = [];
  if (t) bits.push(`耐久${t}`);
  if (durOf(it) < 0.5 && maxDur(it)) bits.push('傷み');
  if (it.memento) bits.push(`${it.memento}の形見`);
  if (it.found) bits.push(`${it.found}で発見`);
  if (it.issued != null) bits.push('国の支給品');
  return bits.join('・');
}
export function gearHtml(sim, p, esc = (s) => s) {
  if (!isGuardian(p) || p.morale == null) return '';
  const k = sim.kingdomOf(p), g = p.gm || {};
  const m = Math.round(p.morale);
  const word = m >= 75 ? '意気盛ん' : m >= 55 ? '満足している' : m >= 35 ? 'ふつう' : m >= 20 ? '不満がたまっている' : '辞めたがっている';
  let pay = '';
  if (isCrown(p)) {
    const base = (JOBS[p.job]?.pay ?? ({ knight: 1.4, soldier: 1, guard: 1 }[p.job] || 1)) * 8;
    const hz = r1(CROWN_DEF[p.job] * generosity(sim, k) * payFactor(sim, k));
    pay = `日給およそ${Math.round(base)}銅貨＋危険手当${hz}銅貨（国庫から）${hz < 0.3 ? '・<b class="up">手当が止まっている</b>' : ''}`;
  } else if (TOWN_DEF[p.job]) pay = `日給およそ${Math.round((JOBS[p.job]?.pay || 0.5) * 8)}銅貨＋手当${TOWN_DEF[p.job]}銅貨（町の蓄えから）`;
  else pay = '依頼の報酬と戦功の褒美（町の蓄えから）';
  const bar = `<div class="bar"><i class="${m < 30 ? 'low' : m < 55 ? 'mid' : ''}" style="width:${m}%"></i></div>`;
  return `<div class="section"><h4>守り手の待遇</h4><dl class="kv"><dt>満足度</dt><dd>${m}（${esc(word)}）${bar}</dd><dt>給金</dt><dd>${pay}</dd>${g.earned >= 1 ? `<dt>最近の手当</dt><dd>${Math.round(g.earned)}銅貨</dd>` : ''}${g.slack ? `<dt>怠け</dt><dd>持ち場を${g.slack}回抜けた</dd>` : ''}</dl></div>`;
}
// 世界全体の数字（試験・国々のタブ用）
export function gearSummary(sim) {
  const G = ensureGear(sim);
  const gs = sim.living().filter((p) => isGuardian(p) && p.morale != null);
  return { ...G.stats, guardians: gs.length, morale: gs.length ? Math.round(gs.reduce((s, p) => s + p.morale, 0) / gs.length) : null };
}
