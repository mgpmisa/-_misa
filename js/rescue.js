// 助けを求める声と、助けに入る人（開発部）
// ・獣や魔物に襲われた人・逃げる人は「助けて！」と叫ぶ（声は12マスほど届く）
// ・声を聞いた人は、自分の力と相手の強さを比べて、駆けつける／詰所・ギルド・狩人の家へ知らせに走る／隠れる、を決める
// ・知らされた衛兵・冒険者・狩人は出動する。狩人や衛兵は見回りで町の近くの獣を見つけたら、叫びがなくても退治しに行く
// ・助けた・助けられたは、好感・記憶・会話の記録・出来事ログに残る
// ・獣は、人が大勢で来たら逃げる
// 竜など強すぎる相手には手を出さず、今までの警鐘（danger.js）と討伐依頼（guild.js）に任せる
//
// 状態：S.rescue = { inc: {creatureId: 出来事}, cries: [最近の叫び], stats: {...}, log: [...] }
// 人の任務：p.mission = { type: 'rescue', inc, x, z, until } … 駆けつけて戦う
//           p.mission = { type: 'alert', inc, x, z, bld, until } … 詰所などへ知らせに走る
// お金：助けられた人が礼金を渡す（助けられた人の財布 → 助けた人の財布）。退治の報酬は今までの仕組み（肉を市場に売る・依頼の報酬）のまま。
import { JOBS, SPECIES } from './data.js';
import { startFight } from './society.js';
import { around } from './creatures.js';
import { gearGuardMul, gearWillDefend } from './gear.js';
import { isBedridden } from './health.js';
import { isRare, popTarget } from './fauna.js';
import { dangerAt } from './danger.js';

const VOICE = 12;                 // 叫び声の届く距離（マス）
const TICK = 1;                   // 何分ごとに見回すか
const TOO_STRONG = 420;           // これより強い相手（竜・魔王軍の将など）は警鐘と討伐依頼に任せる
const MAX_RESCUERS = 6;
const NEED = 1.6;                 // 相手の強さのこの倍の力が集まれば立ち向かう（素人は深手で退くので余裕を見る）
const BEASTS = new Set(['wolf', 'bear', 'tiger', 'polarbear', 'croc']);
const FIGHTERS = new Set(['guard', 'watchman', 'gatekeeper', 'militia', 'soldier', 'knight', 'royalguard', 'general', 'paladin',
  'hunter', 'adventurer', 'warrior', 'archer', 'swordmaster', 'sage', 'cleric', 'wizard', 'guildmaster', 'pioneer']);
const PATROLLERS = new Set(['guard', 'watchman', 'gatekeeper', 'militia', 'soldier', 'knight', 'hunter', 'adventurer', 'warrior', 'archer', 'paladin']);
const POSTS = { guardpost: '衛兵の詰所', barracks: '兵舎', fort: '砦', watchtower: '見張り塔', guild: 'ギルド' };

export const RESCUE_ACTION_LABEL = { rescue: '助けに駆けつけ、獣と渡り合っている', alert: '危険を知らせに来ている' };
export const RESCUE_ACTION_GO = { rescue: '悲鳴を聞いて助けに駆けつけている', alert: '危険を知らせに走っている' };
export const RESCUE_PREF_LABEL = { rescue: '人助け', alert: '知らせに走ること' };

const isHuman = (e) => typeof e?.id === 'number';
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const powerC = (c) => (c.atk || 5) * Math.sqrt(Math.max(1, c.hp || c.maxhp || 20));
const alive = (sim, p) => p && p.deathYear == null && p.needs;

export function ensureRescue(sim) {
  const S = sim.S;
  S.rescue = S.rescue || {};
  const R = S.rescue;
  R.inc = R.inc || {};
  R.cries = R.cries || [];
  R.log = R.log || [];
  R.stats = R.stats || {};
  for (const k of ['cries', 'rushed', 'groups', 'alerts', 'delivered', 'dispatched', 'hid', 'relays', 'patrolFound', 'engaged', 'killed', 'drivenOff', 'saved', 'victimsDied', 'rescuersDied', 'tooStrong', 'withdrew', 'quests', 'scared'])
    R.stats[k] = R.stats[k] || 0;
  return R;
}

// ---------- 力の見積もり ----------
function combatOf(p) { return JOBS[p.job]?.combat || 0; }
export function humanPower(p) { return (p.atk || 5) * Math.sqrt(Math.max(1, p.hp || 1)) * gearGuardMul(p); }
// 勇気：性格・職業・装備で決まる（0〜1.5 くらい）
function bravery(p) {
  let b = 0.3 + (p.values?.courage ?? 0.5) * 0.6 + (1 - (p.pers?.N ?? 0.5)) * 0.25 + (p.pers?.A ?? 0.5) * 0.1;
  const cb = combatOf(p);
  if (cb) b += 0.25 + cb * 0.05;
  if (p.job === 'hunter') b += 0.15;
  if (!p.eq?.weapon) b -= 0.15;
  return b;
}
function canFight(sim, p) {
  const age = sim.ageOf(p);
  return age >= 16 && age < 65 && !isBedridden(p) && p.hp > p.maxhp * 0.5 && p.jail == null;
}
function cname(c) { return c.given && !c.name.includes(c.given) ? `${c.name}の${c.given}` : c.name; }
function packPower(sim, c) {
  let t = powerC(c);
  if (sim._cgrid) for (const o of around(sim._cgrid, c.pos.x, c.pos.z, 8)) {
    if (o === c || o.hp <= 0 || o.dormant || o.inDungeon) continue;
    if (!(o.sp === c.sp || (o.hostile && c.hostile))) continue;
    if (Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 8) t += powerC(o);
  }
  return t;
}
function isThreat(c) {
  if (!c || c.hp <= 0 || c.dormant || c.inDungeon || c.owner != null || c.keeper != null) return false;
  return c.hostile || BEASTS.has(c.sp);
}
// 数が少ない種か（1時間ごとに数え直す）
function scarce(sim, sp) {
  if (isRare(sim, sp)) return true;
  const S = sim.S, hr = Math.floor(S.t / 60);
  if (sim._rescueCntH !== hr) {
    sim._rescueCntH = hr; const n = sim._rescueCnt = {};
    for (const c of Object.values(S.creatures)) if (c.hp > 0 && BEASTS.has(c.sp)) n[c.sp] = (n[c.sp] || 0) + 1;
  }
  const t = popTarget(sim, sp) || 0;
  return (sim._rescueCnt[sp] || 0) <= Math.max(3, t * 0.85);
}
// 殺すか、追い払うか：人を襲っている・飢えている・畑を荒らす・人を殺したことのある獣と魔物は討つ。
// ただうろついているだけの獣は、人が大勢で近づけば逃げるので追い払う（どの種も絶滅させない）
function mustKill(sim, c) {
  if (!c.hostile && scarce(sim, c.sp)) return false;   // 数の少ない獣は、人を襲っていても追い払うだけ
  if (c.hostile || c.forage || (c.bounty || 0) > 0 || c.hunger < 15) return true;
  if (c.fight && typeof c.fight.target === 'number') return true;
  return false;
}
function tooStrong(c, threat) {
  const def = SPECIES[c.sp] || {};
  return threat > TOO_STRONG || def.boss || c.sp === 'dragon' || (c.named && c.hostile);
}
// 近くに竜のような手に負えない相手がいる場所か（そこへは駆けつけず、警鐘と討伐依頼に任せる）
function deadlyNear(sim, x, z, r = 16) {
  if (!sim._cgrid) return false;
  for (const o of around(sim._cgrid, x, z, r)) {
    if (o.hp <= 0 || o.dormant || o.inDungeon || !o.hostile) continue;
    if (Math.hypot(o.pos.x - x, o.pos.z - z) > r) continue;
    if (tooStrong(o, powerC(o))) return true;
  }
  return false;
}
// その人が相手のところまで行く道が、竜の縄張りのような所を通らないか（行き先と中間点の危険度で見る）
function safeWay(sim, p, c) {
  const mx = (p.pos.x + c.pos.x) / 2, mz = (p.pos.z + c.pos.z) / 2;
  return dangerAt(sim, mx, mz) < 5 && !deadlyNear(sim, mx, mz, 12);
}
function nearestTown(sim, x, z) {
  let best = null, bd = Infinity;
  for (const s of sim.S.world.settlements) { const d = Math.hypot(s.x - x, s.z - z) - s.r; if (d < bd) { bd = d; best = s; } }
  return best;
}
// 名前の並び：3人までは「AとBとC」、それより多ければ「AとBら5人」
function names(list) { return list.length <= 3 ? list.join('と') : `${list.slice(0, 2).join('と')}ら${list.length}人`; }
function say(sim, p, text) { if (sim.isWatched(p)) sim.events.push({ type: 'say', id: p.id, text }); }

// ---------- 出来事（1頭の獣・魔物につき1件） ----------
function incidentOf(sim, c, kind) {
  const R = ensureRescue(sim);
  let inc = R.inc[c.id];
  if (!inc) {
    const s = nearestTown(sim, c.pos.x, c.pos.z);
    inc = R.inc[c.id] = { c: c.id, sp: c.sp, name: cname(c), sid: s?.id ?? 0, t0: sim.S.t, kind, victims: [], rescuers: [], runners: [], fought: [], lastCry: -1e9, lastFight: -1e9, x: Math.round(c.pos.x), z: Math.round(c.pos.z), ox: Math.round(c.pos.x), oz: Math.round(c.pos.z), announced: false, out: [] };
  }
  return inc;
}

// ---------- 毎歩（中で1分に1回だけ働く） ----------
export function rescueStep(sim, dt) {
  sim._rescueT = (sim._rescueT || 0) - dt;
  if (sim._rescueT > 0) return;
  sim._rescueT = TICK;
  const S = sim.S, R = ensureRescue(sim);
  // 1) 叫ぶ人を探す：獣・魔物と戦っている（襲われている）人と、獣から逃げている人
  for (const p of sim.living()) {
    if (p.jail != null || p.inside != null && !p.fight) continue;
    if ((p._cryT || -1e9) > S.t - 8) continue;
    let c = null;
    if (p.fight && typeof p.fight.target === 'string') {
      const t = S.creatures[p.fight.target];
      if (!t || t.hp <= 0) continue;
      const inc = R.inc[t.id];
      if (inc && inc.rescuers.includes(p.id)) continue;          // 助けに来た人は叫ばない（弱ったら退く）
      const scary = isThreat(t) || p.hp < p.maxhp * 0.5;
      const strong = combatOf(p) >= 2 && p.hp > p.maxhp * 0.5;   // 腕の立つ者は、まだ叫ばない
      if (!scary || strong) continue;
      c = t;
    } else if (p.action?.type === 'flee' && sim._cgrid) {
      let bd = 6;   // 逃げていても、獣がすぐそばに迫ったときだけ叫ぶ
      for (const o of around(sim._cgrid, p.pos.x, p.pos.z, 6)) {
        if (!isThreat(o)) continue;
        const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
        if (d < bd) { bd = d; c = o; }
      }
    }
    if (c) cry(sim, p, c);
  }
  // 2) 駆けつける人・知らせに走る人を動かし、出来事の結末を見る
  for (const id of Object.keys(R.inc)) stepIncident(sim, R.inc[id]);
}

// ---------- 叫ぶ ----------
export function cry(sim, p, c) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  p._cryT = S.t;
  const inc = incidentOf(sim, c, 'cry');
  if (!inc.victims.includes(p.id)) inc.victims.push(p.id);
  const fresh = S.t - inc.lastCry > 4;
  inc.lastCry = S.t;
  R.stats.cries++;
  R.cries.push({ t: S.t, by: p.id, c: c.id, sp: c.sp, x: Math.round(p.pos.x), z: Math.round(p.pos.z) });
  if (R.cries.length > 30) R.cries.splice(0, R.cries.length - 30);
  p.cries = (p.cries || 0) + 1;
  say(sim, p, rng.pick(['助けて！', `だ、誰か！ ${c.name}が！`, '誰か来てくれ！', `${c.name}だ！ 助けて！`]));
  if (rng.chance(0.5)) sim.remember(p, `${sim.placeName(p.pos.x, p.pos.z)}で${c.name}に襲われ、「助けて！」と叫んだ`, { emo: -0.8, imp: 0.6, k: 'danger', where: { x: Math.round(p.pos.x), z: Math.round(p.pos.z) } });
  if (!fresh) return;
  hear(sim, p, c, inc);
}

// 声を聞いた人がそれぞれ決める
function hear(sim, victim, c, inc) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  const threat = packPower(sim, c);
  const strongFoe = tooStrong(c, threat) || deadlyNear(sim, c.pos.x, c.pos.z);
  const need = threat * NEED;
  const hearers = [];
  for (const q of sim.living()) {
    if (q === victim || q.jail != null || q.fight || q.talk && rng.chance(0.3)) continue;
    if (['march', 'crusade', 'defend', 'rescue', 'alert'].includes(q.mission?.type)) continue;
    if (inc.victims.includes(q.id) || inc.out?.includes(q.id) || inc.rescuers.includes(q.id)) continue;
    const d = Math.hypot(q.pos.x - victim.pos.x, q.pos.z - victim.pos.z);
    if (d > VOICE) continue;
    if (q.action?.type === 'sleep' && q.action.phase === 'do' && !rng.chance(0.5)) continue; // 寝ていても半分は飛び起きる
    hearers.push(q);
  }
  // 子どもは家の大人を呼びに行く（家の大人を聞き手に加える）
  const kids = hearers.filter((q) => sim.ageOf(q) < 14);
  for (const k of kids) {
    const hh = sim.hh(k);
    if (!hh) continue;
    for (const id of hh.members) {
      const a = S.people[id];
      if (!alive(sim, a) || hearers.includes(a) || a === victim || !canFight(sim, a) || a.fight || a.mission) continue;
      if (Math.hypot(a.pos.x - k.pos.x, a.pos.z - k.pos.z) > 35) continue;
      a._relayBy = k.id;
      hearers.push(a);
      sim.remember(k, `${c.name}が出て、${sim.kinTerm(k, a) || ''}${a.given}を呼びに走った`, { emo: -0.4, imp: 0.5, about: [a.id], k: 'danger' });
      break;
    }
  }
  const committed = inc.rescuers.map((id) => S.people[id]).filter((q) => alive(sim, q)).reduce((t, q) => t + humanPower(q), 0);
  const capable = [], weak = [];
  for (const q of hearers) (canFight(sim, q) ? capable : weak).push(q);
  const kinOf = (q) => !!sim.kinTerm(q, victim) || q.hh === victim.hh || (sim.rel(q, victim).a > 40);
  const willing = strongFoe ? [] : capable.filter((q) => safeWay(sim, q, c) && (bravery(q) >= 0.75 || combatOf(q) >= 1 || kinOf(q)) && gearWillDefend(q, rng))
    .sort((a, b) => humanPower(b) * bravery(b) - humanPower(a) * bravery(a));
  const potential = committed + willing.slice(0, MAX_RESCUERS).reduce((t, q) => t + humanPower(q), 0);
  const joined = [];
  if (!strongFoe && committed < need && potential >= need) {
    let sum = committed;
    for (const q of willing) {
      if (sum >= need * 1.15 || inc.rescuers.length >= MAX_RESCUERS) break;
      sendRescue(sim, q, c, inc);
      joined.push(q);
      sum += humanPower(q);
    }
  }
  // 行かない（行けない）大人：勝ち目がなければ知らせに走る。足りていれば見守る
  const stay = capable.filter((q) => !joined.includes(q));
  if (strongFoe) {
    if (!inc.announced) { inc.announced = true; R.stats.tooStrong++; }
  } else if (committed + joined.reduce((t, q) => t + humanPower(q), 0) < need) {
    const runners = stay.concat(weak.filter((q) => sim.ageOf(q) >= 10 && sim.ageOf(q) < 65 && !isBedridden(q)))
      .filter((q) => !q.mission).slice(0, Math.max(0, 2 - inc.runners.length));
    for (const q of runners) sendAlert(sim, q, c, inc);
  }
  for (const q of hearers) if (q._relayBy != null) { if (q.mission) R.stats.relays++; delete q._relayBy; }
  // 子ども・年寄り・病人・腰の引けた人は家へ逃げて隠れる
  for (const q of weak.concat(strongFoe ? capable : [])) {
    if (q.mission || inc.runners.includes(q.id)) continue;
    if (Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) > VOICE + 2) continue;
    if (q.inside != null && q.action?.type !== 'sleep') { continue; } // 家の中にいる人は戸を閉めて籠もる
    if (q.action?.type === 'flee') continue;
    sim.startAction(q, { type: 'flee', place: sim.placeFor(q, 'home'), dur: 60 });
    R.stats.hid++;
    if (rng.chance(0.3)) sim.remember(q, `${victim.given}の悲鳴が聞こえ、${c.name}が出たと知って家に隠れた`, { emo: -0.6, imp: 0.45, about: [victim.id], k: 'danger' });
  }
  if (joined.length) {
    R.stats.rushed += joined.length;
    if (joined.length >= 2) R.stats.groups++;
    const lead = joined[0];
    say(sim, lead, rng.pick(['今行くぞ！', '持ちこたえろ！', `${victim.given}、待ってろ！`, 'みんな、手を貸してくれ！']));
    if (joined.length >= 2) for (const a of joined) for (const b of joined) if (a !== b) sim.relMut(a, b).a = Math.min(100, sim.rel(a, b).a + 2);
    addLog(sim, `${victim.given}の「助けて！」を聞き、${names(joined.map((q) => q.given))}が${c.name}に立ち向かいに駆けつけた。`, joined.map((q) => q.id).concat(victim.id), c.pos);
  }
}

function sendRescue(sim, q, c, inc) {
  q.mission = { type: 'rescue', inc: c.id, x: Math.round(c.pos.x), z: Math.round(c.pos.z), until: sim.S.t + 120 };
  q.action = null;
  if (!inc.rescuers.includes(q.id)) inc.rescuers.push(q.id);
}

// 知らせる先：一番近い衛兵の詰所・兵舎・砦・見張り塔・ギルド、または狩人の家
function alertTarget(sim, q, c) {
  const S = sim.S;
  let best = null, bd = 40;
  for (const b of S.world.buildings) {
    if (!POSTS[b.type] || !b.door) continue;
    const d = Math.hypot(b.door.x - q.pos.x, b.door.z - q.pos.z);
    if (d < bd) { bd = d; best = { b, name: POSTS[b.type] }; }
  }
  for (const h of Object.values(S.households)) {
    if (h.house == null || !h.members.some((id) => S.people[id]?.job === 'hunter' && S.people[id].deathYear == null)) continue;
    const b = sim.building(h.house);
    if (!b?.door) continue;
    const d = Math.hypot(b.door.x - q.pos.x, b.door.z - q.pos.z);
    if (d < bd) { bd = d; best = { b, name: '狩人の家' }; }
  }
  return best;
}
function sendAlert(sim, q, c, inc) {
  const tgt = alertTarget(sim, q, c);
  if (!tgt) return false;
  q.mission = { type: 'alert', inc: c.id, x: tgt.b.door.x, z: tgt.b.door.z, bld: tgt.b.id, until: sim.S.t + 90 };
  q.action = null;
  inc.runners.push(q.id);
  ensureRescue(sim).stats.alerts++;
  say(sim, q, sim.rng.pick([`${tgt.name}に知らせてくる！`, '人を呼んでくる！ 逃げて！', `${c.name}だ、${tgt.name}へ！`]));
  return true;
}

function scare(sim, c, p) {
  c.wary = c.wary || {};
  if (c.fleeUntil > sim.S.t) { c.wary[p.id] = Math.max(c.wary[p.id] || 0, 3); return; }
  c.fleeUntil = sim.S.t + 90;
  if (c.fight) { const t = sim.entity(c.fight.target); if (t?.fight?.target === c.id) t.fight = null; c.fight = null; }
  c.wary = c.wary || {};
  c.wary[p.id] = Math.min(8, (c.wary[p.id] || 0) + 3);
  c.goal = { x: c.home.x, z: c.home.z, run: true };
  ensureRescue(sim).stats.scared++;
}

// ---------- 出来事ごとの見回し ----------
function stepIncident(sim, inc) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  const c = S.creatures[inc.c];
  // 今この獣と戦っている人（誰でも）を手柄の候補に
  if (c && c.hp > 0) {
    for (const id of inc.rescuers) { const p = S.people[id]; if (p?.fight?.target === c.id && !inc.fought.includes(id)) { inc.fought.push(id); R.stats.engaged++; } }
    if (c.fight && typeof c.fight.target === 'number' || inc.rescuers.some((id) => S.people[id]?.fight?.target === c.id)) inc.lastFight = S.t;
    inc.x = Math.round(c.pos.x); inc.z = Math.round(c.pos.z);
    if (!inc.kill && (mustKill(sim, c) || inc.victims.some((id) => S.people[id]?.fight?.target === c.id))) inc.kill = true;
  }
  // 助けに入った人・犠牲者の死
  for (const id of inc.rescuers.slice()) {
    const p = S.people[id];
    if (p && p.deathYear != null && !inc.deadR?.includes(id)) {
      inc.deadR = inc.deadR || []; inc.deadR.push(id); R.stats.rescuersDied++;
      const v = inc.victims.map((x) => S.people[x]).find((x) => x && x.deathYear == null);
      addLog(sim, `${sim.fullName(p)}は${v ? `${v.given}を助けようとして` : ''}${inc.name}に倒れた。`, [p.id], { x: inc.x, z: inc.z });
      if (v) sim.remember(v, `${p.given}がわたしを助けようとして、${inc.name}に殺されてしまった`, { emo: -1, imp: 1, about: [p.id], k: 'death' });
    }
  }
  for (const id of inc.victims) {
    const v = S.people[id];
    if (v && v.deathYear != null && !inc.deadV?.includes(id)) { inc.deadV = inc.deadV || []; inc.deadV.push(id); R.stats.victimsDied++; }
  }
  // 結末：討ち取った／逃げていった／町から離れた／時間切れ
  if (!c || c.hp <= 0) return finish(sim, inc, S.t - inc.lastFight < 4 ? 'killed' : 'gone');
  const helpersNear = inc.rescuers.map((id) => S.people[id]).filter((p) => alive(sim, p) && dist(p, c) < 10);
  if (c.fleeUntil > S.t && !helpersNear.some((p) => p.fight?.target === c.id) && helpersNear.every((p) => dist(p, c) > 7)) return finish(sim, inc, 'drivenOff');
  if (Math.hypot(c.pos.x - (inc.ox ?? inc.x), c.pos.z - (inc.oz ?? inc.z)) > 22 && S.t - inc.lastFight > 6) return finish(sim, inc, 'left');
  if (S.t - inc.t0 > 300) return finish(sim, inc, 'timeout');
  // 竜などが近くに来たら、駆けつけた者も引き上げる
  if (deadlyNear(sim, c.pos.x, c.pos.z)) {
    for (const id of inc.rescuers) { const p = S.people[id]; if (alive(sim, p) && p.mission?.inc === c.id) { p.mission = null; if (p.fight?.target === c.id) p.fight = null; sim.startAction(p, { type: 'flee', place: sim.placeFor(p, 'home'), dur: 60 }); } }
    R.stats.tooStrong++;
    return finish(sim, inc, 'timeout');
  }
  // 獣は、人が大勢で来たら逃げる（群れの長は子分より粘る。魔物は monsters.js の退き方に任せる）
  const def = SPECIES[c.sp] || {};
  if (def.kind === 'wild' && !(c.fleeUntil > S.t)) {
    const around5 = sim.living().filter((p) => p.inside == null && (p.fight?.target === c.id || inc.rescuers.includes(p.id)) && dist(p, c) < 5);
    if (around5.length >= 3 && (c.hp < c.maxhp * 0.6 || around5.length >= 4) && rng.chance(c.role === 'leader' ? 0.2 : 0.35)) {
      for (const p of around5) scare(sim, c, p);
      for (const p of around5) if (p.fight?.target === c.id) p.fight = null;
    }
  }
  const threat = packPower(sim, c);
  // 駆けつける人：近づいたら戦う。獣が動いたら追い直す。深手を負った素人は退く
  for (const id of inc.rescuers) {
    const p = S.people[id];
    if (!alive(sim, p) || p.mission?.type !== 'rescue' || p.mission.inc !== c.id) continue;
    if (p.hp < p.maxhp * 0.45 && combatOf(p) < 2) {
      p.mission = null; p.fight = null; p.action = null; R.stats.withdrew++;
      (inc.out = inc.out || []).push(p.id);
      sim.startAction(p, { type: 'flee', place: sim.placeFor(p, 'home'), dur: 60 });
      sim.remember(p, `${inc.name}に手傷を負わされ、引き下がるしかなかった`, { emo: -0.5, imp: 0.55, k: 'fight' });
      continue;
    }
    // 行く手に竜のような相手がいたら引き返す
    if (!p.fight && deadlyNear(sim, p.pos.x, p.pos.z, 12)) {
      p.mission = null; p.action = null; (inc.out = inc.out || []).push(p.id); R.stats.tooStrong++;
      sim.startAction(p, { type: 'flee', place: sim.placeFor(p, 'home'), dur: 60 });
      continue;
    }
    p.mission.until = Math.max(p.mission.until, S.t + 30);
    if (p.fight) continue;
    const d = dist(p, c);
    // ひとりずつ飛び込んで返り討ちにならないよう、力が揃うまで少し離れて待つ（襲われている人がいて、自分ひとりでも持ちこたえられるなら飛び込む）
    if (d < 9 && inc.kill) {
      const here = inc.rescuers.map((x) => S.people[x]).filter((q) => alive(sim, q) && dist(q, c) < 8).reduce((t, q) => t + humanPower(q), 0);
      const urgent = inc.victims.some((x) => S.people[x]?.fight?.target === c.id);
      const mine = humanPower(p);
      if (!(here >= threat || (urgent || combatOf(p) >= 3) && mine >= threat * 0.8)) {
        p.waitT = p.waitT || S.t;
        if (d < 5 && !p.fight) { const k = 5.5 / Math.max(0.1, d); p.mission.x = Math.round(c.pos.x + (p.pos.x - c.pos.x) * k); p.mission.z = Math.round(c.pos.z + (p.pos.z - c.pos.z) * k); if (p.action?.type === 'rescue') p.action = null; }
        if (S.t - p.waitT > 15 && !inc.runners.some((x) => alive(sim, S.people[x]) && S.people[x].mission?.type === 'alert')) { p.waitT = S.t; sendAlert(sim, p, c, inc); }
        if (p.action?.type === 'rescue' && p.action.phase === 'do') p.action = null;
        continue;
      }
      delete p.waitT;
    }
    if (d < 7 && !(c.fleeUntil > S.t && d > 3)) {
      if (!inc.kill && SPECIES[c.sp]?.kind === 'wild') {
        // 追い払う：大声と武器で脅すと、獣は住みかへ逃げていく
        if (d < 5) { scare(sim, c, p); if (!inc.fought.includes(p.id)) inc.fought.push(p.id); say(sim, p, sim.rng.pick(['しっしっ！ 森へ帰れ！', 'こっちへ来るな！', 'おおい！ 去れ！'])); }
        continue;
      }
      startFight(sim, p, c); continue;
    }
    if (Math.hypot(p.mission.x - c.pos.x, p.mission.z - c.pos.z) > 3 && S.t - (p._rsRepath || -1e9) > 5) {
      p.mission.x = Math.round(c.pos.x); p.mission.z = Math.round(c.pos.z);
      p._rsRepath = S.t;
      p.action = null;
    } else if (p.action?.type === 'rescue' && p.action.phase === 'do') p.action = null; // 着いたのに相手がいない：探し直す
  }
  // 知らせに走る人：着いたら（あるいは途中で戦える人に出会ったら）知らせる
  for (const id of inc.runners) {
    const p = S.people[id];
    if (!alive(sim, p) || p.mission?.type !== 'alert' || p.mission.inc !== c.id) continue;
    const arrived = p.inside === p.mission.bld || Math.hypot(p.pos.x - p.mission.x, p.pos.z - p.mission.z) < 1.6;
    let met = null;
    if (!arrived) met = sim.living().find((q) => q !== p && q.inside == null && PATROLLERS.has(q.job) && canFight(sim, q) && !q.fight && q.mission?.type !== 'rescue' && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 4);
    if (!arrived && !met) continue;
    p.mission = null; p.action = null;
    R.stats.delivered++;
    const ok = dispatch(sim, inc, c, met, p);
    sim.remember(p, `${inc.name}が出たと${met ? `${met.given}に` : '詰所に'}知らせに走った${ok ? '' : '。でも手に負える相手ではないと言われた'}`, { emo: 0.2, imp: 0.5, k: 'danger' });
    if (met) say(sim, p, `${met.given}さん！ ${inc.name}が出たんです！`);
  }
}

// 知らせを受けた（見回りで見つけた）町の戦える者が、組を作って出動する
function dispatch(sim, inc, c, starter, reporter) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  const threat = packPower(sim, c);
  if (tooStrong(c, threat) || deadlyNear(sim, c.pos.x, c.pos.z)) { R.stats.tooStrong++; return false; }
  const need = threat * NEED;
  const s = sim.town(inc.sid);
  let sum = inc.rescuers.map((id) => S.people[id]).filter((q) => alive(sim, q)).reduce((t, q) => t + humanPower(q), 0);
  const cands = sim.living().filter((q) => q !== starter && FIGHTERS.has(q.job) && canFight(sim, q) && !q.fight && !(['march', 'crusade', 'rescue', 'alert'].includes(q.mission?.type)) && !inc.rescuers.includes(q.id) && gearWillDefend(q, rng)
    && (q.s === inc.sid || Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) < 20) && Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) < 45 && safeWay(sim, q, c))
    .sort((a, b) => dist(a, c) - dist(b, c));
  const team = [];
  if (starter && canFight(sim, starter) && !starter.fight && !inc.rescuers.includes(starter.id)) { team.push(starter); sum += humanPower(starter); }
  for (const q of cands) {
    if (sum >= need * 1.2 || team.length + inc.rescuers.length >= MAX_RESCUERS) break;
    team.push(q); sum += humanPower(q);
  }
  if (sum < need) {
    // 町の手勢では勝てない獣：ギルドに討伐を頼む（報酬は依頼主→ギルドの積立の順で払われる。guild.js の決まりのまま）
    R.stats.tooStrong++;
    postBeastQuest(sim, c, s, reporter);
    return false;
  }
  inc.kill = inc.kill || mustKill(sim, c);
  if (!team.length) return true;   // すでに駆けつけた者で足りている
  for (const q of team) sendRescue(sim, q, c, inc);
  R.stats.dispatched += team.length;
  if (team.length >= 2) R.stats.groups++;
  const who = names(team.map((q) => `${JOBS[q.job]?.name || ''}${q.given}`));
  const why = reporter ? `${reporter.given}の知らせを受け、` : '';
  addLog(sim, `${why}${who}が${sim.placeName(c.pos.x, c.pos.z)}の${inc.name}の退治に向かった。`, team.map((q) => q.id), c.pos);
  if (team[0]) say(sim, team[0], rng.pick(['行くぞ！', '案内してくれ！', `${inc.name}か。任せておけ`]));
  return true;
}

function postBeastQuest(sim, c, s, reporter) {
  const S = sim.S, R = ensureRescue(sim);
  if (c.hostile || c.quested || !s) return; // 魔物の依頼は guild.js が出す
  const cap = S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === s.kingdom) || s;
  if (S.towns[cap.id]?.occupied) return;
  S.quests = S.quests || [];
  if (S.quests.filter((q) => q.s === cap.id && q.state === 'open').length >= 9) return;
  const power = c.atk + c.maxhp / 8;
  const giver = reporter && sim.isAdult(reporter) ? reporter : sim.rng.pick(sim.living().filter((p) => p.s === s.id && sim.isAdult(p)));
  S.nextQuest = (S.nextQuest || 0) + 1;
  const q = { id: S.nextQuest, state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 14, type: 'hunt', s: cap.id, from: s.id, target: c.id, rank: Math.max(0, Math.min(6, Math.floor(power / 9))), where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, reward: Math.round(12 + power * 2.5), giver: giver?.id, title: `${sim.placeName(c.pos.x, c.pos.z)}に出る${c.name}を退治してほしい（${s.name}）` };
  S.quests.push(q);
  c.quested = true;
  R.stats.quests++;
  const g = sim.townBuilding(cap, 'guild');
  sim.pushLog(`【依頼】${q.title}（報酬${q.reward}銅貨・${['F', 'E', 'D', 'C', 'B', 'A', 'S'][q.rank]}ランク以上）`, 'event', giver ? [giver.id] : [], g ? g.door : cap);
}

// ---------- 結末 ----------
function finish(sim, inc, how) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  delete R.inc[inc.c];
  const rescuers = inc.rescuers.map((id) => S.people[id]).filter((p) => alive(sim, p));
  for (const p of rescuers) { delete p.waitT; if (p.mission?.inc === inc.c) { p.mission = null; if (p.action?.type === 'rescue') p.action = null; } }
  for (const id of inc.runners) { const p = S.people[id]; if (alive(sim, p) && p.mission?.inc === inc.c) { p.mission = null; if (p.action?.type === 'alert') p.action = null; } }
  if (how !== 'killed' && how !== 'drivenOff') return;
  const heroes = inc.fought.map((id) => S.people[id]).filter((p) => alive(sim, p));
  if (!heroes.length) return;
  if (how === 'killed') R.stats.killed++; else R.stats.drivenOff++;
  const verb = how === 'killed' ? '討ち取り' : '追い払い';
  const saved = inc.victims.map((id) => S.people[id]).filter((v) => alive(sim, v) && !heroes.includes(v));
  const hn = names(heroes.map((p) => p.given));
  const where = sim.placeName(inc.x, inc.z);
  const pos = { x: inc.x, z: inc.z };
  if (saved.length) {
    R.stats.saved += saved.length;
    const vn = names(saved.map((v) => v.given));
    const text = `${hn}が${where}で${inc.name}を${verb}、${vn}を救った。`;
    if (['bear', 'tiger', 'polarbear'].includes(inc.sp) || heroes.length >= 3) sim.news(`${hn}が${inc.name}から${vn}を救った`, 1, pos);
    addLog(sim, text, heroes.map((p) => p.id).concat(saved.map((v) => v.id)), pos);
    for (const v of saved) for (const h of heroes) bond(sim, h, v, inc);
    for (const h of heroes) {
      h.fame = (h.fame || 0) + 2;
      h.needs.esteem = Math.min(100, h.needs.esteem + 20);
      (h.deeds = h.deeds || []).length < 12 && !h.deeds.includes(`${inc.name}から人を救った`) && h.deeds.push(`${inc.name}から人を救った`);
    }
    const town = sim.living().filter((q) => q.s === inc.sid && !heroes.includes(q) && !saved.includes(q));
    const wit = town.filter((q) => rng.chance(0.15)).slice(0, 8);
    if (wit.length) sim.gossip(heroes[0], `${where}で${inc.name}から${saved[0].given}を救った`, 0.7, wit, { congrat: `${inc.name}から${saved[0].given}を助けたんだってね`, silent: true });
  } else {
    // 見回り・知らせを受けての退治
    addLog(sim, `${hn}が${where}に出た${inc.name}を${how === 'killed' ? '退治した' : '追い払った'}。`, heroes.map((p) => p.id), pos);
    for (const h of heroes) {
      h.needs.esteem = Math.min(100, h.needs.esteem + 10);
      sim.remember(h, `${where}に出た${inc.name}を${how === 'killed' ? '仲間と退治した' : '追い払った'}`.replace('仲間と', heroes.length > 1 ? '仲間と' : ''), { emo: 0.5, imp: 0.5, k: 'hunt', where: pos });
    }
  }
  if (heroes.length > 1) for (const a of heroes) for (const b of heroes) if (a !== b) { const r = sim.relMut(a, b); r.a = Math.min(100, r.a + 6); r.f = Math.min(100, (r.f || 0) + 4); }
  for (const id of inc.runners) {
    const p = S.people[id];
    if (alive(sim, p) && !heroes.includes(p)) { p.needs.esteem = Math.min(100, p.needs.esteem + 8); for (const h of heroes) sim.relMut(p, h).a = Math.min(100, sim.rel(p, h).a + 5); }
  }
}

// 助けた・助けられた：好感・記憶・会話の記録・礼金
function bond(sim, h, v, inc) {
  const S = sim.S;
  const rv = sim.relMut(v, h), rh = sim.relMut(h, v);
  rv.a = Math.min(100, rv.a + 25); rv.f = Math.min(100, (rv.f || 0) + 10);
  rh.a = Math.min(100, rh.a + 12); rh.f = Math.min(100, (rh.f || 0) + 6);
  v.savedBy = h.id;
  sim.remember(v, `${inc.name}に襲われたところを、${h.given}が駆けつけて助けてくれた。命の恩人だ`, { emo: 0.85, imp: 0.9, about: [h.id], k: 'rescued' });
  sim.remember(h, `${sim.placeName(inc.x, inc.z)}で${inc.name}から${v.given}を助けた`, { emo: 0.7, imp: 0.75, about: [v.id], k: 'rescue' });
  // 会話の記録（叫び → 駆けつけ → お礼）
  const lines = [[v.id, sim.rng.pick(['助けて！', `誰か！ ${inc.name}が！`])], [h.id, sim.rng.pick(['今行くぞ！', '下がってろ！', 'もう大丈夫だ！'])], [v.id, sim.rng.pick(['ありがとう……本当にありがとう', 'あなたは命の恩人です', '助かった……恩に着るよ'])]];
  const rec = { t: S.t, lines, topics: ['rescue'], mood: 2 };
  for (const [p, o] of [[v, h], [h, v]]) { p.talkLog = p.talkLog || []; p.talkLog.push({ ...rec, with: o.id }); if (p.talkLog.length > 20) p.talkLog.splice(0, p.talkLog.length - 20); }
  // 礼金：助けられた人の財布から、助けた人の財布へ（払えるときだけ）
  if ((v.purse || 0) >= 15 && sim.isAdult(v) && h.hh !== v.hh) {
    const gift = Math.min(8, Math.round(v.purse * 0.15));
    v.purse -= gift; h.purse = (h.purse || 0) + gift;
  }
}

function addLog(sim, text, ids, pos) {
  const R = ensureRescue(sim);
  R.log.push({ t: sim.S.t, text });
  if (R.log.length > 40) R.log.splice(0, R.log.length - 40);
  sim.pushLog(text, 'event', ids, pos);
}

// ---------- 毎時：見回り ----------
// 狩人・衛兵・門番・自警団・冒険者は、町の近くに出た獣（狼・熊など）や弱い魔物を見つけたら、叫びがなくても退治しに行く
export function rescueHourly(sim) {
  const S = sim.S, R = ensureRescue(sim), rng = sim.rng;
  const h = sim.hour();
  const people = sim.living().filter((p) => p.inside == null && PATROLLERS.has(p.job) && !p.fight && p.jail == null && canFight(sim, p) && !(['march', 'crusade', 'rescue', 'alert'].includes(p.mission?.type)) && !(p.action?.type === 'sleep' && p.action.phase === 'do'));
  if (!people.length) return;
  const creatures = Object.values(S.creatures).filter((c) => (isThreat(c) || c.forage) && !c.raid && !R.inc[c.id]);
  for (const s of S.world.settlements) {
    if (S.towns[s.id]?.occupied) continue;
    for (const c of creatures) {
      if (c.hp <= 0 || R.inc[c.id]) continue;
      if (Math.abs(c.pos.x - s.x) > s.r + 12 || Math.abs(c.pos.z - s.z) > s.r + 12) continue;
      const night = h >= 21 || h < 5;
      const sight = night ? 7 : 12;
      const finder = people.find((p) => !p.mission && Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < (p.job === 'hunter' ? sight + 4 : sight));
      if (!finder) continue;
      const threat = packPower(sim, c);
      if (tooStrong(c, threat) || deadlyNear(sim, c.pos.x, c.pos.z)) continue;   // 警鐘と討伐依頼に任せる
      R.stats.patrolFound++;
      // 数の減った獣は殺さず、追い払うだけ（どの種も絶滅させない）
      if (!c.hostile && SPECIES[c.sp]?.kind === 'wild' && (isRare(sim, c.sp) || !mustKill(sim, c))) {
        scare(sim, c, finder);
        if (rng.chance(0.3)) sim.remember(finder, `町の近くに出た${c.name}を、弓と声で森へ追い返した`, { emo: 0.3, imp: 0.35, k: 'hunt' });
        continue;
      }
      const inc = incidentOf(sim, c, 'patrol');
      inc.sid = s.id;
      say(sim, finder, rng.pick([`${c.name}だ。町に近づけるわけにはいかない`, `${c.name}の足跡……近いぞ`, '仕留めるぞ']));
      if (!dispatch(sim, inc, c, finder, null)) delete R.inc[c.id];
    }
  }
}

// ---------- 毎日：古い出来事の掃除 ----------
export function rescueDaily(sim) {
  const S = sim.S, R = ensureRescue(sim);
  for (const [id, inc] of Object.entries(R.inc)) if (S.t - inc.t0 > 600 || !S.creatures[id]) finish(sim, inc, 'gone');
  for (const p of sim.living()) if ((p.mission?.type === 'rescue' || p.mission?.type === 'alert') && !R.inc[p.mission.inc]) p.mission = null;
}

// 詳細欄向け：その人の「助けた／助けられた」
export function rescueNote(sim, p) {
  const S = sim.S, out = [];
  if (p.savedBy != null && S.people[p.savedBy]) out.push(`命の恩人：${S.people[p.savedBy].given}`);
  const n = (p.memories || []).filter((m) => m.k === 'rescue').length;
  if (n) out.push(`人を助けた回数：${n}`);
  return out.join('　');
}
