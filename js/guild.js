// 冒険者ギルド：依頼掲示板・クエスト・冒険者ランク・パーティー
import { JOBS, SPECIES } from './data.js';
import { ITEMS, DROPS, addItem, makeItem, countItem, takeItem, itemName } from './items.js';
import { startFight, arrest } from './society.js';

export const RANKS_ADV = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
const RANK_PTS = [0, 3, 8, 15, 30, 55, 100];
export const advRank = (p) => { let r = 0; for (let i = 0; i < RANK_PTS.length; i++) if ((p.qp || 0) >= RANK_PTS[i]) r = i; return r; };
export const isAdventurer = (p) => p.job && (JOBS[p.job]?.rank === 'adventurer' || p.job === 'paladin');
const QTYPE = { hunt: '討伐', gather: '採集', explore: '探索', bandits: '盗賊団退治', bounty: '賞金首', deliver: '配達' };
export const QUEST_TYPE_NAME = QTYPE;

function guildTown(sim, s) {
  // 村や港の依頼は、同じ国の王都のギルドに貼り出される
  const t = typeof s === 'number' ? sim.town(s) : s;
  return sim.S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === t.kingdom) || t;
}

function post(sim, q) {
  const S = sim.S;
  S.quests = S.quests || [];
  S.nextQuest = (S.nextQuest || 0) + 1;
  const quest = { id: S.nextQuest, state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 14, ...q };
  S.quests.push(quest);
  const g = sim.townBuilding(sim.town(quest.s), 'guild');
  sim.pushLog(`【依頼】${quest.title}（報酬${quest.reward}銅貨・${RANKS_ADV[quest.rank]}ランク以上）`, 'event', quest.giver != null ? [quest.giver] : [], g ? g.door : sim.town(quest.s));
  return quest;
}

// 毎日：町の困りごとが依頼になる
export function guildDaily(sim) {
  const S = sim.S, R = sim.rng;
  S.quests = (S.quests || []).filter((q) => q.state !== 'done' && q.state !== 'failed' || sim.today - (q.closed || 0) < 5);
  for (const q of S.quests) if (q.state === 'open' && sim.today > q.deadline) { q.state = 'failed'; q.closed = sim.today; }
  const open = (sid) => S.quests.filter((q) => q.s === sid && q.state === 'open').length;
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    if (S.towns[cap.id].occupied || open(cap.id) >= 9) continue;
    const towns = S.world.settlements.filter((s) => s.kingdom === cap.kingdom);
    // 1) 町に近い魔物の討伐
    for (const c of Object.values(S.creatures)) {
      if (!c.hostile || c.dormant || c.inDungeon || c.quested || SPECIES[c.sp].kind === 'demon' && c.sp === 'demonlord') continue;
      const near = towns.find((s) => Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < s.r + 22);
      if (!near || !R.chance(0.35)) continue;
      const power = c.atk + c.maxhp / 8;
      const rank = Math.min(6, Math.floor(power / 9));
      const giver = R.pick(sim.living().filter((p) => p.s === near.id && sim.isAdult(p)));
      c.quested = true;
      post(sim, { type: 'hunt', s: cap.id, from: near.id, target: c.id, rank, reward: Math.round(15 + power * 3 + (c.bounty || 0)), giver: giver?.id, title: `${sim.placeName(c.pos.x, c.pos.z)}の${c.name}を退治してほしい（${near.name}）` });
      if (open(cap.id) >= 9) break;
    }
    // 2) 素材の採集（医者・薬師・鍛冶屋・錬金術師から）
    const crafters = sim.living().filter((p) => towns.some((s) => s.id === p.s) && ['doctor', 'herbalist', 'smith', 'alchemist', 'jeweler', 'tailor'].includes(p.job));
    if (crafters.length && R.chance(0.5)) {
      const giver = R.pick(crafters);
      const want = { doctor: ['herb', 5], herbalist: ['herb', 6], smith: [R.pick(['fang', 'scale', 'iron']), 3], alchemist: [R.pick(['jelly', 'magicstone', 'silk']), 2], jeweler: ['magicstone', 1], tailor: ['silk', 2] }[giver.job];
      const [item, qty] = want;
      const rank = Math.min(5, Math.floor(ITEMS[item].value * qty / 25));
      post(sim, { type: 'gather', s: cap.id, from: giver.s, item, qty, rank, reward: Math.round(ITEMS[item].value * qty * 1.8 + 10), giver: giver.id, title: `${ITEMS[item].name}を${qty}つ集めてほしい（${JOBS[giver.job].name}の${giver.given}）` });
    }
    // 3) ダンジョン・遺跡の探索
    if (R.chance(0.25)) {
      const b = R.pick(S.world.specials.map((id) => sim.building(id)).filter((x) => ['cave', 'pyramid', 'ruins'].includes(x.type) && Math.hypot(x.x - cap.x, x.z - cap.z) < 70));
      if (b && !S.quests.some((q) => q.state === 'open' && q.target === 'b' + b.id)) {
        const giver = R.pick(sim.living().filter((p) => p.s === cap.id && ['scholar', 'courtmage', 'king', 'noble', 'sage'].includes(p.job)));
        post(sim, { type: 'explore', s: cap.id, target: 'b' + b.id, rank: { ruins: 1, cave: 2, pyramid: 3 }[b.type], reward: { ruins: 50, cave: 90, pyramid: 140 }[b.type], giver: giver?.id, title: `${b.name}の奥を調べてきてほしい` });
      }
    }
    // 4) 盗賊団と賞金首
    for (const b of S.world.buildings.filter((x) => x.type === 'hideout' && x.bounty)) {
      if (Math.hypot(b.x - cap.x, b.z - cap.z) > 70 || S.quests.some((q) => q.state !== 'done' && q.state !== 'failed' && q.target === 'b' + b.id)) continue;
      post(sim, { type: 'bandits', s: cap.id, target: 'b' + b.id, rank: 3, reward: b.bounty, giver: S.kingdoms[cap.kingdom].kingId, title: `${b.name}の盗賊団を退治せよ（王の布告）` });
    }
    for (const [id, w] of Object.entries(S.wanted)) {
      const p = S.people[id];
      if (!p || p.deathYear != null || p.jail != null || w.kingdom !== cap.kingdom || S.quests.some((q) => q.state !== 'done' && q.state !== 'failed' && q.target === +id)) continue;
      post(sim, { type: 'bounty', s: cap.id, target: +id, rank: w.crime === '殺人' ? 3 : 1, reward: 20 + w.bounty * 2, giver: S.kingdoms[cap.kingdom].kingId, title: `賞金首：${sim.fullName(p)}（${w.crime}）` });
    }
    // 5) 配達
    if (R.chance(0.3)) {
      const dest = R.pick(S.world.settlements.filter((s) => s.id !== cap.id && !S.towns[s.id].occupied));
      const giver = R.pick(sim.living().filter((p) => p.s === cap.id && ['merchant', 'noble', 'scribe', 'changer'].includes(p.job)));
      if (dest && giver) post(sim, { type: 'deliver', s: cap.id, target: dest.id, rank: 0, reward: 12 + Math.round(Math.hypot(dest.x - cap.x, dest.z - cap.z) / 2), giver: giver.id, title: `${dest.name}まで荷物を届けてほしい（${giver.given}）` });
    }
  }
  // ランクの見直し
  for (const p of sim.living()) if (isAdventurer(p)) p.advRank = advRank(p);
}

// ギルドで依頼を受ける（パーティーも組む）
export function takeQuest(sim, p) {
  const S = sim.S, R = sim.rng;
  if (p.quest) return;
  const rank = advRank(p);
  const cands = (S.quests || []).filter((q) => q.state === 'open' && q.s === p.s && q.rank <= rank + 1);
  if (!cands.length) return;
  const q = R.weighted(cands, (x) => x.reward / 20 + (x.rank === rank ? 2 : 1) + p.values.ambition);
  const members = [p];
  if (q.rank >= 2) {
    const mates = sim.living().filter((o) => o !== p && isAdventurer(o) && !o.quest && o.s === p.s && o.jail == null && sim.rel(p, o).a > -10 && o.hp > o.maxhp * 0.6).sort((a, b) => sim.rel(p, b).a - sim.rel(p, a).a).slice(0, Math.min(3, q.rank));
    members.push(...mates);
  }
  q.state = 'taken'; q.takenBy = members.map((m) => m.id); q.taken = sim.today;
  for (const m of members) {
    m.quest = q.id; m.action = null;
    sim.remember(m, members.length > 1 ? `${members.map((x) => x.given).join('・')}と組んで「${q.title}」を引き受けた` : `ギルドで「${q.title}」を引き受けた`, { emo: 0.4, imp: 0.5, k: 'quest' });
  }
  if (members.length > 1) sim.pushLog(`冒険者${members.map((x) => x.given).join('・')}がパーティーを組み、「${q.title}」を引き受けた。`, 'event', members.map((x) => x.id), p.pos);
  else sim.pushLog(`冒険者${p.given}が「${q.title}」を引き受けた。`, 'event', [p.id], p.pos);
}

export function questOf(sim, p) { return p.quest ? (sim.S.quests || []).find((q) => q.id === p.quest) : null; }

// 依頼の目的地（行動の場所）
export function questPlace(sim, p) {
  const q = questOf(sim, p);
  if (!q) return null;
  const S = sim.S;
  if (q.state === 'report' || q.state === 'done') { const g = sim.townBuilding(sim.town(q.s), 'guild'); return g ? { type: 'report', place: { x: g.door.x, z: g.door.z, bld: g.id } } : null; }
  switch (q.type) {
    case 'hunt': {
      const c = S.creatures[q.target];
      if (!c || c.hp <= 0) { completeQuest(sim, q); return questPlace(sim, p); }
      return { type: 'quest', place: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, quest: { target: c.id } };
    }
    case 'gather': {
      if (countItem(p, q.item) >= q.qty || q.takenBy.reduce((s, id) => s + (S.people[id] ? countItem(S.people[id], q.item) : 0), 0) >= q.qty) { completeQuest(sim, q); return questPlace(sim, p); }
      if (q.item === 'herb') return { type: 'gather', place: sim.placeFor({ ...p, job: 'gatherer', lv: 5 }, 'forest') };
      // 素材は、それを落とす魔物を狩る
      const species = Object.entries(DROPS).filter(([, d]) => d.includes(q.item)).map(([k]) => k);
      let best = null, bd = 80;
      for (const c of Object.values(S.creatures)) if (species.includes(c.sp) && !c.dormant && !c.inDungeon && c.hp > 0) { const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z); if (d < bd) { bd = d; best = c; } }
      if (!best) return { type: 'gather', place: sim.placeFor(p, 'wild') };
      return { type: 'quest', place: { x: Math.round(best.pos.x), z: Math.round(best.pos.z) }, quest: { target: best.id } };
    }
    case 'explore': case 'bandits': {
      const b = sim.building(+q.target.slice(1));
      return { type: 'quest', place: { x: b.door.x, z: b.door.z }, quest: { target: q.target, questId: q.id } };
    }
    case 'bounty': {
      const t = S.people[q.target];
      if (!t || t.deathYear != null || t.jail != null) { if (q.hunted) completeQuest(sim, q); else { q.state = 'failed'; q.closed = sim.today; for (const id of q.takenBy) if (S.people[id]) S.people[id].quest = null; } return null; }
      return { type: 'hunt', place: { x: Math.round(t.pos.x), z: Math.round(t.pos.z) }, target: t.id };
    }
    case 'deliver': {
      const d = sim.town(q.target);
      if (Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < d.r) { completeQuest(sim, q); return questPlace(sim, p); }
      return { type: 'travel', place: { x: d.x, z: d.z } };
    }
  }
  return null;
}

export function completeQuest(sim, q) {
  if (q.state === 'report' || q.state === 'done') return;
  q.state = 'report';
  for (const id of q.takenBy) { const m = sim.S.people[id]; if (m && m.deathYear == null) m.action = null; }
}

// ギルドで報告して報酬を受け取る
export function reportQuest(sim, p) {
  const q = questOf(sim, p);
  if (!q || q.state !== 'report') return;
  const S = sim.S;
  const members = q.takenBy.map((id) => S.people[id]).filter((m) => m && m.deathYear == null);
  if (q.type === 'gather') {
    let need = q.qty;
    for (const m of members) { const have = Math.min(need, countItem(m, q.item)); if (have) { takeItem(m, q.item, have); need -= have; } }
    const giver = S.people[q.giver];
    if (giver && giver.deathYear == null) addItem(giver, makeItem(q.item, 1, { n: q.qty }));
  }
  const giver = q.giver != null ? S.people[q.giver] : null;
  if (giver && giver.deathYear == null && giver.rank !== 'king') { const hh = sim.hh(giver); if (hh) hh.money -= Math.min(hh.money * 0.5, q.reward * 0.5); }
  const share = Math.round(q.reward / members.length);
  for (const m of members) {
    sim.hh(m).money += share;
    m.qp = (m.qp || 0) + 1 + q.rank;
    const before = m.advRank || 0;
    m.advRank = advRank(m);
    m.fame += 2 + q.rank * 2;
    m.needs.esteem = Math.min(100, m.needs.esteem + 25);
    m.quest = null;
    sim.remember(m, `「${q.title}」をやり遂げ、${share}銅貨の報酬を受け取った`, { emo: 0.7, imp: 0.6, k: 'quest' });
    if (m.advRank > before) {
      sim.remember(m, `冒険者ランクが${RANKS_ADV[m.advRank]}に上がった`, { emo: 0.9, imp: 0.85, k: 'quest' });
      if (m.advRank >= 4) sim.news(`冒険者${sim.fullName(m)}が${RANKS_ADV[m.advRank]}ランクに昇格した`, 2, m.pos);
    }
  }
  if (giver && giver.deathYear == null) { sim.remember(giver, `頼んでいた「${q.title}」を冒険者が片づけてくれた`, { emo: 0.6, imp: 0.5, k: 'quest' }); for (const m of members) sim.relMut(giver, m).a += 10; }
  q.state = 'done'; q.closed = sim.today; q.doneBy = members.map((m) => m.given).join('・');
  sim.pushLog(`冒険者${q.doneBy}が「${q.title}」を達成した。`, 'event', members.map((m) => m.id), p.pos);
  // 素材を売る
  sellMaterials(sim, members);
}

// 冒険者は余った素材を町で売る（職人の材料になる）
export function sellMaterials(sim, people) {
  for (const m of people) {
    const town = sim.S.towns[m.s];
    town.mats = town.mats || {};
    for (const it of (m.inv || []).slice()) {
      const d = ITEMS[it.id];
      if (!d || d.type !== 'material') continue;
      const keep = (sim.S.quests || []).some((q) => q.id === m.quest && q.item === it.id);
      if (keep) continue;
      const n = it.n || 1;
      town.mats[it.id] = (town.mats[it.id] || 0) + n;
      sim.hh(m).money += Math.round(d.value * n * 0.7);
      m.inv.splice(m.inv.indexOf(it), 1);
    }
  }
}

// 賞金首を捕まえる
export function huntBounty(sim, p, target) {
  if (!target || target.deathYear != null || target.jail != null) return;
  if (Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) < 1.8) {
    if (target.values.courage < 0.45 || target.hp < target.maxhp * 0.4) {
      const q = questOf(sim, p);
      if (q) q.hunted = true;
      arrest(sim, p, target);
    } else startFight(sim, p, target);
  }
}
