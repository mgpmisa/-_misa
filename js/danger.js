// 危険察知：魔物の分布図（町の人みんなが知っている「危険区域」）と、町の守り
import { SPECIES, JOBS } from './data.js';
import { musterOnAlarm } from './civic.js';
import { W, H, T } from './world.js';
import { startFight } from './society.js';
import { gearGuardMul, gearWillDefend } from './gear.js';
import { creatureArray } from './lod.js';

export const CH = 8;              // 区画の大きさ（マス）
export const CW = W / CH, CHH = H / CH;
const LAIRS = new Set(['cave', 'pyramid', 'ruins', 'hideout', 'demoncastle']);
const DEFENDERS = new Set(['guard', 'watchman', 'gatekeeper', 'militia', 'soldier', 'knight', 'royalguard', 'general', 'paladin']);

export const chunkOf = (x, z) => Math.min(CHH - 1, Math.max(0, Math.floor(z / CH))) * CW + Math.min(CW - 1, Math.max(0, Math.floor(x / CH)));

// 毎時：魔物の強さと巣の位置から危険度を計算する
export function computeDanger(sim) {
  const S = sim.S, w = S.world;
  const d = new Float32Array(CW * CHH);
  const add = (cx, cz, v) => { if (cx >= 0 && cz >= 0 && cx < CW && cz < CHH) d[cz * CW + cx] += v; };
  const spread = (x, z, v) => {
    const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
    add(cx, cz, v);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add(cx + a, cz + b, v * 0.35);
  };
  for (const c of Object.values(S.creatures)) {
    if (c.dormant || c.hp <= 0 || c.inDungeon) continue;
    const def = SPECIES[c.sp];
    if (c.hostile) spread(c.pos.x, c.pos.z, (c.atk * c.lv) / 12 + (c.named ? 4 : 0));
    else if (['wolf', 'bear', 'tiger', 'polarbear', 'croc'].includes(c.sp)) spread(c.pos.x, c.pos.z, def.atk / 10);
  }
  for (const id of w.specials) {
    const b = sim.building(id);
    if (LAIRS.has(b.type) && !b.sealed) spread(b.door.x, b.door.z, b.type === 'demoncastle' ? 6 : 2.5);
  }
  // 魔界そのもの
  for (let cz = 0; cz < CHH; cz++) for (let cx = 0; cx < CW; cx++) {
    let waste = 0;
    for (let z = cz * CH; z < cz * CH + CH; z += 2) for (let x = cx * CH; x < cx * CH + CH; x += 2) if (w.tiles[z * W + x] === T.WASTE || w.tiles[z * W + x] === T.LAVA) waste++;
    if (waste > 3) d[cz * CW + cx] += 3 + waste / 4;
  }
  // 町の中は守られている
  for (const s of w.settlements) if (!S.towns[s.id].occupied) {
    const cx = Math.floor(s.x / CH), cz = Math.floor(s.z / CH);
    d[cz * CW + cx] *= 0.2;
  }
  S.dangerMap = Array.from(d, (v) => Math.round(v * 10) / 10);
}

export function dangerAt(sim, x, z) {
  const m = sim.S.dangerMap;
  return m ? m[chunkOf(x, z)] || 0 : 0;
}

// その人にとって、その場所は危なすぎるか（職業と勇気で許容度が違う）
export function tooDangerous(sim, p, x, z) {
  const v = dangerAt(sim, x, z) + (p.danger?.[sim.chunkKey(x, z)] || 0);
  const J = JOBS[p.job];
  const tolerance = J?.combat ? 4 + J.combat * 2 + p.lv * 0.5 : ['hunter', 'woodcutter', 'miner', 'gatherer', 'charcoal', 'mason'].includes(p.job) ? 2 : 0.8;
  return v > tolerance * (0.6 + p.values.courage * 0.8);
}

// 町の守り：門番・衛兵・自警団が、近づいた魔物を町に入る前に迎え撃つ
export function defendTowns(sim) {
  const S = sim.S;
  const hostile = creatureArray(sim).filter((c) => S.creatures[c.id] === c && c.hostile && !c.dormant && c.hp > 0 && !c.inDungeon && !c.fight);
  if (!hostile.length) return;
  for (const s of S.world.settlements) {
    if (S.towns[s.id].occupied) continue;
    const near = hostile.filter((c) => Math.abs(c.pos.x - s.x) < s.r + 9 && Math.abs(c.pos.z - s.z) < s.r + 9);
    if (!near.length) continue;
    const guards = sim.living().filter((p) => p.s === s.id && DEFENDERS.has(p.job) && !p.fight && p.jail == null && p.hp > p.maxhp * 0.4 && !(p.action?.type === 'sleep' && p.job !== 'gatekeeper' && p.job !== 'watchman') && gearWillDefend(p, sim.rng));
    for (const c of near) {
      // 力の差を見る：勝ち目のない相手（竜など）には立ち向かわず、鐘を鳴らして籠城し、討伐を頼む
      const power = (x) => (x.atk || 5) * Math.sqrt(x.maxhp || x.hp || 20);
      const avail = guards.filter((p) => !p.fight);
      const ours = avail.slice(0, 4).reduce((t, p) => t + power(p) * gearGuardMul(p), 0);
      const pack = near.filter((o) => Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 8).reduce((t, o) => t + power(o), 0);
      if (ours < Math.max(power(c) * 1.8, pack * 1.3)) {
        const town = S.towns[s.id];
        const adults = sim.living().filter((q) => q.s === s.id && sim.isAdult(q) && q.jail == null).length;
        const weak = power(c) < 60 && adults >= 6; // 町の大人が数人で追い払える相手なら鐘は鳴らさない
        if (!weak && (!town.alarmAt || S.t - town.alarmAt > 720) && (!c.alarmed || S.t - c.alarmed > 1440)) {
          c.alarmed = S.t; town.alarmAt = S.t;
          sim.pushLog(`${s.name}に${c.name}が迫り、警鐘が鳴らされた。人々は家に籠もり、衛兵は門を固めた。`, 'event', [], s);
          for (const q of sim.living()) if (q.s === s.id && q.inside == null && !q.fight && !q.quest && q.mission?.type !== 'crusade') { if (musterOnAlarm(sim, q, s)) continue; q.action = null; q.mission = null; sim.startAction(q, { type: 'flee', place: sim.placeFor(q, 'home'), dur: 90 }); }
          if (!S.quests?.some((x) => x.target === c.id && x.state !== 'done' && x.state !== 'failed')) c.quested = false;
        }
        continue;
      }
      const g = avail.sort((a, b) => Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) - Math.hypot(b.pos.x - c.pos.x, b.pos.z - c.pos.z)).slice(0, c.atk > 12 ? 4 : 2);
      for (const p of g) {
        if (p.inside != null) { const b = sim.building(p.inside); p.pos = { ...b.door }; p.inside = null; }
        const d = Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
        if (d < 2.5) startFight(sim, p, c);
        else { p.mission = { type: 'defend', x: Math.round(c.pos.x), z: Math.round(c.pos.z), until: S.t + 40 }; p.action = null; }
        if (!c.warned) {
          c.warned = true;
          sim.pushLog(`${s.name}の${JOBS[p.job].name}${p.given}が、町に近づく${c.name}を見つけて迎え撃ちに出た。`, 'event', [p.id], p.pos);
        }
      }
    }
  }
}

// 戦えない人は、近くに魔物や猛獣が見えたらすぐ逃げる
export function spotThreats(sim, p, grid, around) {
  if (p.inside != null || p.fight || p.jail != null || p.mission?.type === 'defend' || p.mission?.type === 'crusade' || p.mission?.type === 'march') return false;
  const J = JOBS[p.job];
  if (J?.combat >= 2 || DEFENDERS.has(p.job)) return false;
  const tough = J?.combat >= 1; // 狩人・開拓者・道普請は、獣では逃げない（魔物からは逃げる）
  const sight = 6 + p.pers.N * 3;
  for (const c of around(grid, p.pos.x, p.pos.z, sight)) {
    if (c.dormant || c.hp <= 0) continue;
    const scary = c.hostile || (!tough && ['wolf', 'bear', 'tiger', 'polarbear', 'croc'].includes(c.sp)) || (tough && ['bear', 'tiger', 'polarbear'].includes(c.sp) && p.lv < 3);
    if (!scary) continue;
    if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > sight) continue;
    // 危険を覚え、家（なければ町の中心）へ逃げる
    sim.learnDanger(p, c.pos.x, c.pos.z, 2.5);
    p.needs.survival = Math.max(0, p.needs.survival - 40);
    if (p.action?.type !== 'flee') {
      const home = sim.placeFor(p, 'home');
      sim.startAction(p, { type: 'flee', place: home, dur: 40 });
      if (sim.rng.chance(0.4)) sim.remember(p, `${sim.placeName(c.pos.x, c.pos.z)}で${c.name}を見かけて、あわてて逃げ帰った`, { emo: -0.6, imp: 0.55, k: 'sight', where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) } });
      if (sim.isWatched(p)) sim.events.push({ type: 'say', id: p.id, text: sim.rng.pick([`${c.name}だ！ 逃げろ！`, 'ひっ……！', `だ、誰か！ ${c.name}が出た！`]) });
    }
    return true;
  }
  return false;
}
