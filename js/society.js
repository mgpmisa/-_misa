// 戦い・犯罪・裁き
import { clamp } from './rng.js';
import { growthStats, growthAttack } from './growth.js';
import { JOBS, SPECIES } from './data.js';
import { killCreature } from './creatures.js';
import { equipBonus, countItem, takeItem } from './items.js';

const LAWFUL = new Set(['guard', 'knight', 'soldier', 'jailer', 'watchman', 'royalguard', 'general', 'paladin']);

export function humanStats(sim, p) {
  const age = sim.ageOf(p);
  const combat = JOBS[p.job]?.combat || 0;
  const lv = p.lv || 1;
  const child = age < 14 ? 0.4 : age > 70 ? 0.6 : 1;
  const steel = sim.S.kingdoms && sim.hasTech?.(p, 'steel') ? 2 : 0;
  let maxhp = Math.round((40 + lv * 8 + combat * 6) * child);
  const eb = equipBonus(p);
  const g = growthStats(sim, p);
  maxhp = Math.round(maxhp * g.hp);
  return {
    maxhp,
    atk: Math.round((3 + combat * 2 + lv * 1.6 + eb.atk + (eb.atk ? steel : 0)) * child * g.atk),
    def: Math.round((1 + lv * 0.8 + eb.def) * child * g.def),
    hp: p.hp == null ? maxhp : Math.min(p.hp, maxhp),
  };
}

const isHuman = (e) => typeof e.id === 'number';
const nameOf = (e) => (isHuman(e) ? e.given : e.name);

export function startFight(sim, a, b, lethal = true) {
  if (!a || !b || a === b || a.hp <= 0 || b.hp <= 0) return;
  // 人どうしのけんかは、ふつうは殺し合いにならない
  if (isHuman(a) && isHuman(b) && lethal === true && !LAWFUL.has(a.job) && !LAWFUL.has(b.job) && !a.bandit) lethal = false;
  if (isHuman(a) && a.deathYear != null) return;
  if (isHuman(b) && b.deathYear != null) return;
  a.fight = { target: b.id, cd: 0, lethal };
  if (!b.fight) b.fight = { target: a.id, cd: 0.5, lethal };
  const dungeon = a.inDungeon || b.inDungeon;
  for (const e of [a, b]) if (isHuman(e)) { e.talk = null; if (e.inside != null && !dungeon) { const bl = sim.building(e.inside); e.pos = { ...bl.door }; e.inside = null; } }
  const watched = (isHuman(a) && sim.isWatched(a)) || (isHuman(b) && sim.isWatched(b));
  if (watched) sim.events.push({ type: 'fight', a: a.id, b: b.id });
}

export function stepCombat(sim, dt) {
  const all = [];
  for (const p of sim.living()) if (p.fight) all.push(p);
  for (const c of Object.values(sim.S.creatures)) if (c.fight) all.push(c);
  for (const e of all) {
    if (!e.fight || e.hp <= 0) continue;
    const t = sim.entity(e.fight.target);
    if (!t || t.hp <= 0 || (isHuman(t) && (t.deathYear != null || t.jail != null))) { e.fight = null; continue; }
    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d > 12) { e.fight = null; continue; }
    if (d > 1.3) {
      const sp = (isHuman(e) ? 1.1 : (SPECIES[e.sp]?.speed || 1)) * dt;
      const m = Math.min(sp, d - 1);
      e.pos.x += (dx / d) * m; e.pos.z += (dz / d) * m;
      continue;
    }
    e.fight.cd -= dt;
    if (e.fight.cd > 0) continue;
    e.fight.cd = 1;
    const R = sim.rng;
    // 危なくなったら回復薬を飲む
    if (isHuman(e) && e.hp < e.maxhp * 0.35 && countItem(e, 'potion') > 0) { takeItem(e, 'potion', 1); e.hp = Math.min(e.maxhp, e.hp + 45); sim.events.push({ type: 'heal', id: e.id }); continue; }
    let dmg = Math.max(1, Math.round(e.atk * R.range(0.7, 1.3) - (t.def || 0) * 0.5));
    // 魔王の耐性
    if (t.sp === 'demonlord' && isHuman(e)) dmg = Math.round(dmg * (e.eq?.weapon?.id === 'holysword' ? (sim.S.demon?.resist?.includes('holy') ? 1.1 : 1.6) : 0.6));
    if (isHuman(t) && sim.hasTech(t, 'barrier') && !isHuman(e) && sim.townOf(t) && Math.hypot(t.pos.x - sim.townOf(t).x, t.pos.z - sim.townOf(t).z) < sim.townOf(t).r) dmg = Math.max(1, Math.round(dmg * 0.7));
    dmg = growthAttack(sim, e, t, dmg);
    if (dmg <= 0) continue; // かわされた
    if (isHuman(e) && isHuman(t) && !e.fight.lethal && t.hp - dmg <= 0) dmg = Math.max(0, t.hp - 1);
    t.hp -= dmg;
    if (isHuman(t)) { t.needs.survival = Math.max(0, t.needs.survival - 12); sim.learnDanger(t, t.pos.x, t.pos.z, 1); }
    sim.events.push({ type: 'hit', id: t.id, dmg });
    // 殴り合い：相手が弱ったら終わる
    if (isHuman(e) && isHuman(t) && !e.fight.lethal && t.hp < t.maxhp * 0.35) {
      t.hp = Math.max(1, t.hp);
      e.fight = null; if (t.fight?.target === e.id) t.fight = null;
      sim.remember(t, `${e.given}に殴り倒された`, { emo: -0.8, imp: 0.8, about: [e.id], k: 'fight' });
      sim.remember(e, `${t.given}を殴り倒した`, { emo: 0.1, imp: 0.6, about: [t.id], k: 'fight' });
      sim.relMut(t, e).a -= 20;
      if (!LAWFUL.has(e.job)) {
        const wit = sim.living().filter((q) => q !== e && q !== t && !q.inside && Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z) < 6);
        if (wit.length) { markWanted(sim, e, '傷害', 6); sim.gossip(e, `${t.given}を殴り倒したらしい`, -0.6, wit, { silent: true }); }
      }
      continue;
    }
    if (t.hp <= 0) { resolveKill(sim, e, t); e.fight = null; continue; }
    // 降参・逮捕・逃走
    if (isHuman(t) && isHuman(e) && LAWFUL.has(e.job) && sim.S.wanted[t.id] && t.hp < t.maxhp * 0.4) { arrest(sim, e, t); e.fight = null; continue; }
    // 戦う職業でない人は、魔物に襲われたら逃げようとする
    if (isHuman(t) && !isHuman(e) && !(JOBS[t.job]?.combat) && t.hp < t.maxhp * 0.8 && R.chance(0.45 + (1 - t.values.courage) * 0.3)) {
      t.fight = null; e.fight = null; e.calm = sim.S.t + 90;
      t.needs.survival = 0; t.action = null; t.path = [];
      sim.remember(t, `${nameOf(e)}に襲われ、必死で逃げ延びた`, { emo: -0.9, imp: 0.8, k: 'fight', where: { x: Math.round(t.pos.x), z: Math.round(t.pos.z) } });
      sim.learnDanger(t, t.pos.x, t.pos.z, 3);
      continue;
    }
    if (t.hp < t.maxhp * 0.25) {
      const courage = isHuman(t) ? t.values.courage : (SPECIES[t.sp]?.kind === 'wild' ? 0.2 : 0.7);
      if (R.chance(0.35 * (1 - courage)) && !SPECIES[t.sp]?.boss) {
        t.fight = null; e.fight = null;
        if (isHuman(t)) { t.needs.survival = 0; t.action = null; sim.remember(t, `${nameOf(e)}との戦いから命からがら逃げた`, { emo: -0.8, imp: 0.75, k: 'fight' }); }
        else t.fleeUntil = sim.S.t + 60;
      }
    }
  }
}

function resolveKill(sim, killer, victim) {
  if (isHuman(victim)) {
    let cause;
    if (!isHuman(killer)) cause = SPECIES[killer.sp]?.kind === 'demon' ? 'demon' : SPECIES[killer.sp]?.monster ? 'monster' : 'beast';
    else {
      const kk = sim.townOf(killer).kingdom, vk = sim.townOf(victim).kingdom;
      const atWar = sim.S.kingdoms[kk]?.war?.with === vk;
      if (atWar && LAWFUL.has(killer.job) && LAWFUL.has(victim.job)) cause = 'war';
      else if ((LAWFUL.has(killer.job) || killer.job === 'adventurer' || killer.job === 'hunter') && (sim.S.wanted[victim.id] || victim.bandit)) cause = 'justice';
      else if (victim.bandit && !killer.bandit) cause = 'justice';
      else cause = 'murder';
    }
    if (isHuman(killer)) {
      killer.xp = (killer.xp || 0) + 15 + victim.lv * 5; sim.levelCheck(killer);
      if (cause === 'murder') commitMurder(sim, killer, victim);
      else if (cause === 'war') { killer.fame += 3; sim.remember(killer, `戦場で${victim.given}を討ち取った`, { emo: -0.2, imp: 0.6, about: [victim.id], k: 'war' }); }
    } else {
      killer.xp = (killer.xp || 0) + 20; killer.kills = (killer.kills || 0) + 1;
      if (killer.bounty != null) killer.bounty += 15; else killer.bounty = 15;
    }
    sim.die(victim, cause, killer);
  } else {
    killCreature(sim, victim, killer);
  }
}

function commitMurder(sim, killer, victim) {
  const witnesses = sim.living().filter((q) => q !== killer && q !== victim && !q.inside && q.action?.type !== 'sleep' && Math.hypot(q.pos.x - killer.pos.x, q.pos.z - killer.pos.z) < 7);
  sim.remember(killer, `${victim.given}を手にかけてしまった`, { emo: -0.6, imp: 1, about: [victim.id], k: 'crime' });
  killer.revenge = null;
  if (witnesses.length) {
    markWanted(sim, killer, '殺人', 120);
    for (const w of witnesses) sim.remember(w, `${killer.given}が${victim.given}を殺すところを見てしまった`, { emo: -1, imp: 1, about: [killer.id, victim.id], k: 'crime' });
    sim.gossip(killer, `${victim.given}を殺したらしい`, -1, sim.living().filter((q) => q.s === killer.s), { silent: true });
    sim.news(`${sim.townOf(killer).name}で殺人事件。${sim.fullName(killer)}が${victim.given}を手にかけ、衛兵が追っている`, 3, killer.pos);
  } else {
    sim.news(`${sim.townOf(victim).name}で${sim.fullName(victim)}が何者かに殺された。犯人はわかっていない`, 3, victim.pos);
    sim.chron(`${sim.townOf(victim).name}で${sim.fullName(victim)}が殺害された（犯人不明）`, sim.townOf(victim).kingdom);
    sim.S.unsolved = (sim.S.unsolved || []);
    sim.S.unsolved.push({ victim: victim.id, killer: killer.id, day: sim.today });
  }
}

export function markWanted(sim, p, crime, days) {
  const cur = sim.S.wanted[p.id];
  sim.S.wanted[p.id] = { crime, days: (cur?.days || 0) + days, since: sim.today, kingdom: sim.townOf(p).kingdom, bounty: (cur?.bounty || 0) + Math.round(days / 2) };
  if (p.rank !== 'outlaw') p.rankBefore = p.rankBefore || p.rank;
  // 王族・貴族は罪を犯しても身分そのものは失わない（お尋ね者の印は wanted で持つ）
  if (!['king', 'royal', 'noble'].includes(p.rank)) p.rank = 'outlaw';
}

export function arrest(sim, guard, p) {
  const w = sim.S.wanted[p.id];
  const cap = sim.capitalOf(guard);
  const prison = sim.townBuilding(cap, 'prison');
  if (!prison) return;
  p.fight = null; p.action = null; p.path = []; p.mission = null;
  p.jail = prison.id; p.prisonDays = w ? w.days : 5; p.crime = w ? w.crime : '騒ぎ';
  p.pos = { ...prison.door }; p.inside = prison.id; if (p.rank !== 'outlaw' && p.rank !== 'prisoner') p.rankBefore = p.rankBefore || p.rank; if (!['king', 'royal', 'noble'].includes(p.rank)) p.rank = 'prisoner';
  delete sim.S.wanted[p.id];
  guard.needs.esteem = Math.min(100, guard.needs.esteem + 30); guard.fame += 4;
  sim.hh(guard).money += (w?.bounty || 5);
  sim.remember(guard, `お尋ね者の${p.given}を捕らえた`, { emo: 0.6, imp: 0.7, about: [p.id], k: 'justice' });
  sim.remember(p, `${guard.given}に捕まり、${p.crime}の罪で牢獄に入れられた`, { emo: -0.9, imp: 1, about: [guard.id], k: 'crime' });
  sim.relMut(p, guard).a -= 30;
  sim.gossip(p, `${p.crime}の罪で捕まった`, -0.5, sim.living().filter((q) => q.s === p.s || q.s === guard.s), { silent: true });
  sim.news(`${sim.fullName(p)}が${p.crime}の罪で捕らえられた`, p.crime === '殺人' ? 3 : 1, prison.door);
  // 家族は看守・衛兵を恨むことがある
  for (const id of sim.hh(p)?.members || []) {
    const q = sim.S.people[id];
    if (q && q !== p && q.pers.A < 0.35 && sim.ageOf(q) >= 14) { sim.relMut(q, guard).a -= 25; sim.remember(q, `${guard.given}が身内の${p.given}を牢に入れた`, { emo: -0.7, imp: 0.7, about: [guard.id, p.id], k: 'grudge' }); }
  }
}

// 悪事の候補（sim.decide から呼ばれる）
export function tryCrime(sim, p) {
  const h = sim.hour(), R = sim.rng, age = sim.ageOf(p);
  if (age < 15 || p.jail != null) return null;
  const hh = sim.hh(p);
  const night = h >= 22 || h < 4;
  const desperate = p.needs.hunger < 25 && hh.money < 5 && p.pers.A < 0.5;
  // 盗み
  if (night && (p.job === 'thief' || desperate || (p.pers.A < 0.25 && p.values.ambition > 0.7 && hh.money < 40))) {
    const s = sim.townOf(p);
    const targets = s.buildings.map((id) => sim.building(id)).filter((b) => (b.type === 'house' || b.type === 'mansion' || b.type === 'market') && b.hh !== p.hh && !(b.wary > sim.today) && (b.type === 'market' || (sim.S.households[b.hh]?.money || 0) > 30));
    if (targets.length) {
      const b = R.pick(targets);
      return { type: 'steal', score: (p.job === 'thief' ? 7 : 4) + (1 - p.pers.A) * 2, place: { x: b.door.x, z: b.door.z }, dur: 15, crimeTarget: b.id };
    }
  }
  // 街道の強盗（盗賊団）
  if (p.bandit && h >= 8 && h < 19 && p.lastRob !== sim.today) {
    const hide = sim.building(p.hideout);
    const prey = sim.living().find((q) => !q.bandit && !q.inside && q.jail == null && Math.hypot(q.pos.x - hide.x, q.pos.z - hide.z) < 14 && !sim.town(q.s) === false && Math.hypot(q.pos.x - sim.townOf(q).x, q.pos.z - sim.townOf(q).z) > sim.townOf(q).r + 2);
    if (prey) return { type: 'rob', score: 7, place: { x: Math.round(prey.pos.x), z: Math.round(prey.pos.z) }, dur: 10, crimeTarget: prey.id };
  }
  // 復讐
  if (p.revenge != null) {
    const t = sim.S.people[p.revenge];
    if (!t || t.deathYear != null) { p.revenge = null; return null; }
    if (t.s === p.s && !t.inside && t.jail == null && p.values.courage > 0.4) {
      const hate = -sim.rel(p, t).a;
      if (hate > 75 && p.pers.A < 0.3 && R.chance(0.25)) return { type: 'revenge', score: 2 + hate / 40, place: { x: Math.round(t.pos.x), z: Math.round(t.pos.z) }, dur: 5, crimeTarget: t.id };
    }
  }
  return null;
}

// 悪事の現場に着いたとき
export function crimeArrive(sim, p) {
  const a = p.action, R = sim.rng;
  if (a.type === 'steal') {
    const b = sim.building(a.crimeTarget);
    b.wary = sim.today + 4; // 狙われた家はしばらく用心する
    const victims = b.type === 'market' ? null : sim.S.households[b.hh];
    const witnesses = sim.living().filter((q) => q !== p && !q.bandit && q.action?.type !== 'sleep' && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 5 && (!q.inside || q.inside === b.id));
    const guards = witnesses.filter((q) => LAWFUL.has(q.job)).length;
    const dogs = Object.values(sim.S.creatures).filter((c) => c.role === 'watchdog' && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 6);
    if (dogs.length) { witnesses.push(...sim.living().filter((q) => q.inside === b.id && q !== p).slice(0, 2)); if (b.barked !== sim.today) { b.barked = sim.today; sim.pushLog(`${b.name}の近くで犬が激しく吠えた。`, 'event', [], p.pos); } }
    const skill = p.skill.thief || 0.2;
    const ok = R.chance(clamp(0.55 + p.pers.C * 0.15 + skill * 0.3 - witnesses.length * 0.15 - guards * 0.2, 0.05, 0.95));
    if (ok) {
      const loot = victims ? Math.min(30, Math.max(3, victims.money * 0.2)) : R.int(5, 15);
      if (victims) victims.money -= loot; else sim.market(p.s).stock.bread = Math.max(0, sim.market(p.s).stock.bread - 2);
      sim.hh(p).money += loot;
      p.skill.thief = Math.min(1, skill + 0.03);
      p.needs.esteem = Math.min(100, p.needs.esteem + 10);
      sim.remember(p, `夜の闇にまぎれて${b.name}から${Math.round(loot)}銅貨を盗んだ`, { emo: 0.2, imp: 0.5, k: 'crime' });
      if (victims) {
        for (const id of victims.members) { const q = sim.S.people[id]; if (q && sim.ageOf(q) >= 10) sim.remember(q, `家から${Math.round(loot)}銅貨が盗まれていた`, { emo: -0.7, imp: 0.7, k: 'theft' }); }
        sim.S.towns[p.s].crime = (sim.S.towns[p.s].crime || 0) + 1;
      }
    }
    if (witnesses.length && (!ok || R.chance(0.4))) {
      markWanted(sim, p, '盗み', 8);
      for (const w of witnesses) sim.remember(w, `${p.given}が${b.name}に忍び込むのを見た`, { emo: -0.5, imp: 0.7, about: [p.id], k: 'crime' });
      sim.gossip(p, '盗みを働いたらしい', -0.7, witnesses, { silent: true });
      sim.pushLog(`${sim.fullName(p)}の盗みが見つかった。`, 'event', [p.id], p.pos);
      const g = witnesses.find((q) => LAWFUL.has(q.job));
      if (g) startFight(sim, g, p);
    }
    a.until = sim.S.t + 5;
  } else if (a.type === 'rob' || a.type === 'revenge') {
    const t = sim.S.people[a.crimeTarget];
    if (t && t.deathYear == null && Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 3) {
      if (a.type === 'rob') {
        const loot = Math.min(40, sim.householdMoney(t) * 0.3);
        p.lastRob = sim.today;
        if (t.values.courage < 0.5 || R.chance(0.5)) {
          sim.hh(t).money -= loot; sim.hh(p).money += loot;
          sim.remember(t, `街道で盗賊の${p.given}に${Math.round(loot)}銅貨を奪われた`, { emo: -0.8, imp: 0.8, about: [p.id], k: 'robbed' });
          sim.learnDanger(t, p.pos.x, p.pos.z, 3);
          sim.remember(p, `街道で${t.given}から${Math.round(loot)}銅貨を巻き上げた`, { emo: 0.3, imp: 0.5, k: 'crime' });
          markWanted(sim, p, '追いはぎ', 15);
          const hide = sim.building(p.hideout);
          if (hide) { hide.robberies = (hide.robberies || 0) + 1; }
          sim.pushLog(`${sim.fullName(t)}が街道で盗賊に襲われた。`, 'event', [t.id, p.id], t.pos);
        } else startFight(sim, p, t, R.chance(0.2));
      } else {
        const lethal = p.pers.A < 0.2 && p.pers.N > 0.65 && R.chance(0.3);
        sim.remember(p, lethal ? `恨みを晴らすために${t.given}に刃を向けた` : `恨みを晴らすために${t.given}に殴りかかった`, { emo: -0.3, imp: 0.9, about: [t.id], k: 'crime' });
        startFight(sim, p, t, lethal);
        markWanted(sim, p, '傷害', 20);
      }
    }
    a.until = sim.S.t + 2;
  }
}

// 衛兵がお尋ね者を探す
export function crimeHourly(sim) {
  const wanted = Object.keys(sim.S.wanted).map((id) => sim.S.people[id]).filter((p) => p && p.deathYear == null && p.jail == null);
  if (!wanted.length) return;
  for (const g of sim.living()) {
    if (!LAWFUL.has(g.job) || g.fight || g.inside || g.jail != null || !g.action || g.action.type === 'sleep') continue;
    for (const w of wanted) {
      if (w.inside || w.fight) continue;
      const d = Math.hypot(w.pos.x - g.pos.x, w.pos.z - g.pos.z);
      if (d < 10) {
        if (w.values.courage < 0.4 || w.hp < w.maxhp * 0.4) { arrest(sim, g, w); break; }
        startFight(sim, g, w);
        break;
      }
    }
  }
}

export function justiceDaily(sim) {
  const S = sim.S, R = sim.rng;
  for (const p of sim.living()) {
    if (p.jail == null) {
      if (p.revenge != null && R.chance(p.pers.A * 0.08)) {
        const t = S.people[p.revenge];
        if (t) sim.remember(p, `${t.given}への恨みを、もう手放そうと思った`, { emo: 0.3, imp: 0.6, about: [t.id] });
        p.revenge = null;
      }
      continue;
    }
    p.prisonDays--;
    const jail = sim.building(p.jail);
    // 脱獄
    const jailers = sim.living().filter((q) => q.job === 'jailer' && q.inside === p.jail && q.action?.type !== 'sleep');
    if (p.values.courage > 0.7 && !jailers.length && R.chance(0.03)) {
      p.jail = null; p.inside = null; p.pos = { ...jail.door }; p.action = null;
      markWanted(sim, p, '脱獄', 20);
      sim.remember(p, '看守の目を盗んで牢獄から逃げ出した', { emo: 0.4, imp: 1, k: 'crime' });
      sim.news(`${sim.fullName(p)}が牢獄から脱走した`, 2, jail.door);
      continue;
    }
    if (p.prisonDays <= 0) {
      p.jail = null; p.inside = null; p.pos = { ...jail.door }; p.action = null;
      p.rank = p.rankBefore && !['outlaw', 'prisoner'].includes(p.rankBefore) ? p.rankBefore : p.job === 'thief' ? 'citizen' : (JOBS[p.job]?.rank || 'commoner');
      delete p.rankBefore;
      if (p.rank === 'outlaw') p.rank = 'wanderer';
      p.pers.C = clamp(p.pers.C + 0.04, 0, 1);
      if (p.job === 'thief' && R.chance(0.35 + p.pers.C * 0.3)) {
        p.job = 'farmer'; p.rank = 'commoner';
        sim.remember(p, '牢を出て、もう二度と盗みはしないと心に決めた', { emo: 0.5, imp: 0.9 });
      } else sim.remember(p, '刑期を終えて牢獄から出された', { emo: 0.3, imp: 0.8 });
      sim.pushLog(`${sim.fullName(p)}が刑期を終えて釈放された。`, 'event', [p.id], p.pos);
    }
  }
  // 盗賊のアジトに懸賞金
  for (const b of S.world.buildings) {
    if (b.type === 'hideout' && (b.robberies || 0) >= 2 && !b.bounty) {
      b.bounty = Math.min(300, 60 + b.robberies * 10);
      b.robberies = 0;
      sim.news(`街道の盗賊団に${b.bounty}銅貨の懸賞金がかけられた（${b.name}）`, 2, b.door);
    }
  }
}
