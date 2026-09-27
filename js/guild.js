// 冒険者ギルド：依頼掲示板・クエスト・冒険者ランク・パーティー
import { JOBS, SPECIES } from './data.js';
import { bandBounty } from './monsters.js';
import { ITEMS, DROPS, addItem, makeItem, countItem, takeItem, itemName } from './items.js';
import { startFight, arrest } from './society.js';
import { advRole } from './advclass.js';

export const RANKS_ADV = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
const RANK_PTS = [0, 3, 8, 15, 30, 55, 100];
export const advRank = (p) => { let r = 0; for (let i = 0; i < RANK_PTS.length; i++) if ((p.qp || 0) >= RANK_PTS[i]) r = i; return r; };
export const isAdventurer = (p) => p.job && (JOBS[p.job]?.rank === 'adventurer' || p.job === 'paladin');
const QTYPE = { hunt: '討伐', gather: '採集', explore: '探索', bandits: '盗賊団退治', bounty: '賞金首', deliver: '配達' };
export const QUEST_TYPE_NAME = QTYPE;

// その場所の危なさ：近くにいる一番強い敵（名のある個体・群れの主は重く見る）
const powerOf = (c) => (c.atk + c.maxhp / 8) * (c.named ? 1.6 : 1);
export function threatNear(sim, x, z, r = 12) {
  let best = 0;
  for (const c of Object.values(sim.S.creatures)) {
    if (c.hp <= 0 || c.dormant || !(c.hostile || c.named)) continue;
    if (Math.abs(c.pos.x - x) > r || Math.abs(c.pos.z - z) > r) continue;
    best = Math.max(best, powerOf(c));
  }
  return best;
}
const rankFor = (power) => Math.max(0, Math.min(6, Math.floor(power / 9)));
// ギルドが「死地」と覚えた場所（依頼で人が死んだ所）には、しばらく依頼を出さない
const isDeadly = (sim, x, z) => (sim.S.deadly || []).some((d) => d.until > sim.today && Math.hypot(d.x - x, d.z - z) < 14);

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
  // 引き受けた依頼：担い手が全員死ぬか捕まれば掲示板に戻す。引き受けから12日で打ち切り
  for (const q of S.quests) {
    if (q.state !== 'taken') continue;
    const alive = q.takenBy.map((id) => S.people[id]).filter((m) => m && m.deathYear == null && m.jail == null && m.quest === q.id);
    if (!alive.length || sim.today - (q.taken || q.posted) > 12) {
      for (const m of alive) { m.quest = null; m.action = null; sim.remember(m, `「${q.title}」をやり遂げられず、ギルドに断りを入れた`, { emo: -0.5, imp: 0.5, k: 'quest' }); }
      q.takenBy = []; q.party = null;
      if (alive.length === 0) {
        // 担い手が全滅（または捕縛）した：難しさを上げて取り下げ、人が死んだ場所は死地として覚える
        q.state = 'failed'; q.closed = sim.today; q.rank = Math.min(6, q.rank + 2);
        const c = S.creatures[q.target]; if (c) c.quested = false;
        if (q.where) {
          S.deadly = (S.deadly || []).filter((d) => d.until > sim.today);
          S.deadly.push({ x: q.where.x, z: q.where.z, until: sim.today + 20 });
          sim.pushLog(`ギルドは「${q.title}」で冒険者を失い、その土地を死地として依頼を取り下げた。`, 'event', [], q.where);
        }
      }
      else { q.state = 'failed'; q.closed = sim.today; const c = S.creatures[q.target]; if (c) c.quested = false; }
    }
  }
  const open = (sid) => S.quests.filter((q) => q.s === sid && q.state === 'open').length;
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    if (S.towns[cap.id].occupied || open(cap.id) >= 9) continue;
    const towns = S.world.settlements.filter((s) => s.kingdom === cap.kingdom);
    // 1) 町に近い魔物の討伐
    for (const c of Object.values(S.creatures)) {
      if (!c.hostile || c.dormant || c.inDungeon || c.quested || SPECIES[c.sp].kind === 'demon' && c.sp === 'demonlord') continue;
      const near = towns.find((s) => Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < s.r + 22);
      if (!near || !R.chance(0.35)) continue;
      if (isDeadly(sim, c.pos.x, c.pos.z)) continue;
      const power = c.atk + c.maxhp / 8;
      const rank = rankFor(Math.max(power, threatNear(sim, c.pos.x, c.pos.z, 12)));
      const giver = R.pick(sim.living().filter((p) => p.s === near.id && sim.isAdult(p)));
      c.quested = true;
      post(sim, { type: 'hunt', s: cap.id, from: near.id, target: c.id, rank, where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, reward: Math.round(15 + power * 3 + (c.bounty || 0) + bandBounty(sim, c)), giver: giver?.id, title: `${sim.placeName(c.pos.x, c.pos.z)}の${c.name}を退治してほしい（${near.name}）` });
      if (open(cap.id) >= 9) break;
    }
    // 2) 素材の採集（医者・薬師・鍛冶屋・錬金術師から）
    const crafters = sim.living().filter((p) => towns.some((s) => s.id === p.s) && ['doctor', 'herbalist', 'smith', 'alchemist', 'jeweler', 'tailor'].includes(p.job));
    const busy = new Set(S.quests.filter((q) => q.state === 'open' || q.state === 'taken').map((q) => q.giver));
    const idle = crafters.filter((p) => !busy.has(p.id));
    if (idle.length && R.chance(0.5)) {
      const giver = R.pick(idle);
      const want = { doctor: ['herb', 5], herbalist: ['herb', 6], smith: [R.pick(['fang', 'scale', 'iron']), 3], alchemist: [R.pick(['jelly', 'magicstone', 'silk']), 2], jeweler: ['magicstone', 1], tailor: ['silk', 2] }[giver.job];
      const [item, qty] = want;
      // 難しさ：素材の値打ちと、その素材を落とす魔物のうち一番安全に狩れる相手の危なさの大きいほう
      const src = item === 'herb' ? [] : Object.values(S.creatures).filter((c) => c.hp > 0 && !c.dormant && !c.inDungeon && (DROPS[c.sp] || []).includes(item) && SPECIES[c.sp].kind !== 'demon' && Math.hypot(c.pos.x - cap.x, c.pos.z - cap.z) < 70);
      const safest = src.map((c) => Math.max(powerOf(c), threatNear(sim, c.pos.x, c.pos.z, 12))).sort((a, b) => a - b)[0];
      const rank = Math.max(Math.min(5, Math.floor(ITEMS[item].value * qty / 25)), safest != null ? rankFor(safest) : 0);
      if (item === 'herb' || safest != null) post(sim, { type: 'gather', s: cap.id, from: giver.s, item, qty, rank, reward: Math.round(ITEMS[item].value * qty * 1.8 + 10), giver: giver.id, title: `${ITEMS[item].name}を${qty}つ集めてほしい（${JOBS[giver.job].name}の${giver.given}）` });
    }
    // 3) ダンジョン・遺跡の探索
    if (R.chance(0.25)) {
      const b = R.pick(S.world.specials.map((id) => sim.building(id)).filter((x) => ['cave', 'pyramid', 'ruins'].includes(x.type) && Math.hypot(x.x - cap.x, x.z - cap.z) < 70));
      if (b && !S.quests.some((q) => q.state === 'open' && q.target === 'b' + b.id)) {
        const giver = R.pick(sim.living().filter((p) => p.s === cap.id && ['scholar', 'courtmage', 'king', 'noble', 'sage'].includes(p.job)));
        const inside = Object.values(S.creatures).filter((c) => c.hp > 0 && (c.lair === b.id || Math.hypot(c.pos.x - b.door.x, c.pos.z - b.door.z) < 10)).reduce((m, c) => Math.max(m, powerOf(c)), 0);
        if (!isDeadly(sim, b.door.x, b.door.z)) post(sim, { type: 'explore', s: cap.id, target: 'b' + b.id, where: { x: b.door.x, z: b.door.z }, rank: Math.max({ ruins: 1, cave: 2, pyramid: 3 }[b.type], rankFor(inside)), reward: { ruins: 50, cave: 90, pyramid: 140 }[b.type], giver: giver?.id, title: `${b.name}の奥を調べてきてほしい` });
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
  const pt = partyOf(sim, p);
  const crew = pt ? pt.members.map((id) => S.people[id]).filter((o) => o && o.deathYear == null && !o.quest && o.jail == null && o.s === p.s && o.hp > o.maxhp * 0.5) : [p];
  if (pt && !crew.includes(p)) crew.unshift(p);
  const rank = pt ? Math.round(crew.reduce((s2, o) => s2 + advRank(o), 0) / crew.length + (crew.length >= 3 ? 1 : 0)) : advRank(p);
  const cands = (S.quests || []).filter((q) => q.state === 'open' && q.s === p.s && q.rank <= rank + 1);
  if (!cands.length) return;
  const q = R.weighted(cands, (x) => x.reward / 20 + (x.rank === rank ? 2 : 1) + p.values.ambition);
  const members = pt ? crew : [p];
  if (!pt && q.rank >= 2) {
    const mates = sim.living().filter((o) => o !== p && isAdventurer(o) && !o.quest && o.s === p.s && o.jail == null && sim.rel(p, o).a > -10 && o.hp > o.maxhp * 0.6).sort((a, b) => sim.rel(p, b).a - sim.rel(p, a).a).slice(0, Math.min(3, q.rank));
    members.push(...mates);
  }
  q.state = 'taken'; q.takenBy = members.map((m) => m.id); q.taken = sim.today;
  for (const m of members) {
    m.quest = q.id; m.action = null;
    sim.remember(m, members.length > 1 ? `${members.map((x) => x.given).join('・')}と組んで「${q.title}」を引き受けた` : `ギルドで「${q.title}」を引き受けた`, { emo: 0.4, imp: 0.5, k: 'quest' });
  }
  if (pt) { q.party = pt.id; sim.pushLog(`パーティー「${pt.name}」（${members.map((x) => x.given).join('・')}）が「${q.title}」を引き受けた。`, 'event', members.map((x) => x.id), p.pos); }
  else if (members.length > 1) sim.pushLog(`冒険者${members.map((x) => x.given).join('・')}が臨時のパーティーを組み、「${q.title}」を引き受けた。`, 'event', members.map((x) => x.id), p.pos);
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
      const mine = (p.atk || 5) * Math.sqrt(p.maxhp || 40) * (q.takenBy.length || 1);
      let bestScore = Infinity;
      for (const c of Object.values(S.creatures)) {
        if (!species.includes(c.sp) || c.dormant || c.inDungeon || c.hp <= 0 || SPECIES[c.sp].kind === 'demon' || c.named) continue;
        const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
        if (d > 80) continue;
        const threat = Math.max(powerOf(c), threatNear(sim, c.pos.x, c.pos.z, 12));
        if (threat * Math.sqrt(threat) > mine * 1.5 || isDeadly(sim, c.pos.x, c.pos.z)) continue; // 竜の縄張りのような所には近づかない
        const sc = d + threat * 2;
        if (sc < bestScore) { bestScore = sc; best = c; bd = d; }
      }
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
  // 報酬は依頼主が払う（王の布告なら国庫）。払えない分はギルドの積立（町の蓄え）から
  let fundR = 0;
  if (giver && giver.deathYear == null && giver.rank !== 'king') { const hh = sim.hh(giver); if (hh) { const x = Math.min(Math.max(0, hh.money) * 0.5, q.reward); hh.money -= x; fundR += x; } }
  else { const k = S.kingdoms[sim.town(q.s).kingdom]; if (k) { const x = Math.min(Math.max(0, k.treasury - 100), q.reward); k.treasury -= x; fundR += x; } }
  if (fundR < q.reward) { const town = S.towns[q.s]; const x = Math.min(q.reward - fundR, Math.max(0, town.fund || 0)); town.fund -= x; fundR += x; }
  q.reward = Math.round(fundR);
  const share = Math.round(q.reward / members.length);
  for (const m of members) {
    m.purse = (m.purse || 0) + share * 0.7; if (sim.hh(m)) sim.hh(m).money += share * 0.3;
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
  const pt = q.party != null ? S.advParties?.[q.party] : null;
  if (pt) {
    pt.done++; pt.fame += 2 + q.rank * 3; pt.log.unshift(`${sim.year()}年 ${q.title}`); pt.log.length = Math.min(pt.log.length, 12);
    q.doneBy = `「${pt.name}」`;
    for (const a of members) for (const b of members) if (a !== b) sim.relMut(a, b).a += 4;
    if ([10, 25, 50].includes(pt.done)) sim.news(`パーティー「${pt.name}」が依頼達成${pt.done}件を数え、名を上げている`, 2, p.pos);
  }
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
      m.purse = (m.purse || 0) + Math.round(d.value * n * 0.7);
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

// ---------- 冒険者パーティー ----------
const PARTY_A = ['銀の', '暁の', '黄昏の', '鋼の', '紅の', '蒼き', '風の', '星降る', '灰色の', '獅子の', '白銀の', '炎の', '月影の', '北風の', '砂漠の', '黒鉄の'];
const PARTY_B = ['牙', '剣', '翼', '盾', '誓い', '旅団', '狼', '灯火', '矢', '一団', '同盟', '爪', '風', '鷹'];
const ROLE_OF = { warrior: '前衛', paladin: '前衛', adventurer: '遊撃', archer: '後衛', sage: '魔法', cleric: '回復', guildmaster: '前衛' };
export const partyRole = (p) => advRole(p) || ROLE_OF[p.job] || '遊撃';
export function partyOf(sim, p) { const pt = p.party != null ? sim.S.advParties?.[p.party] : null; return pt && !pt.gone ? pt : null; }

// 毎日：気の合う冒険者どうしがパーティーを組み、仲たがいすると解散する
export function partiesDaily(sim) {
  const S = sim.S, R = sim.rng;
  S.advParties = S.advParties || {};
  S.nextParty = S.nextParty || 1;
  for (const pt of Object.values(S.advParties)) {
    if (pt.gone) continue;
    const alive = pt.members.map((id) => S.people[id]).filter((m) => m && m.deathYear == null && m.party === pt.id);
    // 亡くなった仲間を弔う
    for (const id of pt.members) {
      const m = S.people[id];
      if (m && m.deathYear != null && !pt.mourned?.includes(id)) {
        pt.mourned = [...(pt.mourned || []), id];
        for (const o of alive) sim.remember(o, `パーティー「${pt.name}」の仲間${m.given}を失った`, { emo: -0.9, imp: 0.9, about: [m.id], k: 'death' });
        pt.log.unshift(`${sim.year()}年 ${m.given}を失う`);
      }
    }
    pt.members = alive.map((m) => m.id);
    if (!pt.members.includes(pt.leader)) {
      const nl = alive.slice().sort((a, b) => b.lv - a.lv)[0];
      if (nl) { pt.leader = nl.id; sim.remember(nl, `「${pt.name}」のリーダーを引き継いだ`, { emo: 0.3, imp: 0.7, k: 'party' }); }
    }
    // 仲たがい：仲間どうしの好感度が低い、または人数が足りない
    let worst = 0, pair = null;
    for (const a of alive) for (const b of alive) if (a !== b) { const v = sim.rel(a, b).a; if (v < worst) { worst = v; pair = [a, b]; } }
    if (alive.length < 2 || worst < -25) { disband(sim, pt, alive, pair); continue; }
    // 一緒にいると仲が深まる
    for (const a of alive) for (const b of alive) if (a !== b) sim.relMut(a, b).a = Math.min(100, sim.rel(a, b).a + 0.3);
  }
  // 冒険者の数が少ない王都には、流れの冒険者がやって来る。若者が冒険者を志すこともある
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    if (S.towns[cap.id].occupied) continue;
    const advs = sim.living().filter((p) => p.s === cap.id && isAdventurer(p));
    const openQ = (S.quests || []).filter((q) => q.s === cap.id && q.state === 'open').length;
    if (advs.length < 6 + Math.min(6, openQ / 2) && R.chance(0.3)) sim.adventurerArrives(cap);
    if (R.chance(0.08)) {
      const kingdomTowns = S.world.settlements.filter((s) => s.kingdom === cap.kingdom && !(s.tribal && s.annexed == null)).map((s) => s.id);
      const y = sim.living().find((p) => kingdomTowns.includes(p.s) && sim.ageOf(p) >= 16 && sim.ageOf(p) <= 24 && p.spouseId == null && p.values.courage > 0.6 && p.values.ambition > 0.55 && !['king', 'royal', 'noble'].includes(p.rank) && !isAdventurer(p) && !JOBS[p.job]?.guardTown && R.chance(0.3));
      if (y) {
        const from = sim.town(y.s);
        y.formerJob = y.job; y.job = R.pick(['adventurer', 'warrior', 'archer']); y.rank = 'adventurer'; y.skill[y.job] = 0.15;
        if (y.s !== cap.id) {
          const inn = sim.townBuilding(cap, 'tavern');
          const id = S.nextHh++;
          S.households[id] = { id, members: [], house: inn ? inn.id : null, inn: true, s: cap.id, money: 10, food: 0, comfort: 0, name: `${y.family}（宿住まい）` };
          sim.moveTo(y, S.households[id]); y.s = cap.id;
        }
        sim.remember(y, `家族の反対を押し切って、${from.name}を出て冒険者になった`, { emo: 0.7, imp: 1, k: 'career' });
        y.deeds.push(`${sim.year()}年、冒険者を志した`);
        sim.pushLog(`${from.name}の${y.given}（${sim.ageOf(y)}歳）が、冒険者になると言って家を飛び出した。`, 'event', [y.id], y.pos);
        for (const pid of [y.fatherId, y.motherId]) { const par = S.people[pid]; if (par && par.deathYear == null) sim.remember(par, `${y.given}が冒険者になると言って出ていった。無事でいてくれればいいが`, { emo: -0.4, imp: 0.8, about: [y.id], k: 'family' }); }
      }
    }
  }
  // 結成：ソロの冒険者が、気の合う仲間を誘う
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    const free = sim.living().filter((p) => p.s === cap.id && isAdventurer(p) && !partyOf(sim, p) && p.jail == null && sim.ageOf(p) >= 16 && p.job !== 'guildmaster');
    if (free.length < 2 || !R.chance(0.6)) continue;
    const leader = free.slice().sort((a, b) => (b.lv + b.pers.E * 3 + b.values.ambition * 3) - (a.lv + a.pers.E * 3 + a.values.ambition * 3))[0];
    const roles = new Set([partyRole(leader)]);
    const picks = [leader];
    const others = free.filter((o) => o !== leader && sim.rel(leader, o).a > -5).sort((a, b) => (sim.rel(leader, b).a + (roles.has(partyRole(b)) ? -20 : 10) + Math.abs(b.lv - leader.lv) * -1) - (sim.rel(leader, a).a + (roles.has(partyRole(a)) ? -20 : 10) + Math.abs(a.lv - leader.lv) * -1));
    for (const o of others) { if (picks.length >= 4) break; if (R.chance(0.5 + o.pers.A * 0.4)) { picks.push(o); roles.add(partyRole(o)); } }
    if (picks.length < 2) continue;
    let name;
    for (let i = 0; i < 6; i++) { name = R.pick(PARTY_A) + R.pick(PARTY_B); if (!Object.values(S.advParties).some((x) => x.name === name && !x.gone)) break; }
    const id = S.nextParty++;
    S.advParties[id] = { id, name, leader: leader.id, members: picks.map((m) => m.id), s: cap.id, formed: sim.today, year: sim.year(), done: 0, fame: 0, log: [`${sim.year()}年 ${cap.name}で結成`] };
    for (const m of picks) {
      m.party = id;
      sim.remember(m, m === leader ? `仲間を集めてパーティー「${name}」を結成した` : `${leader.given}に誘われ、パーティー「${name}」に加わった`, { emo: 0.8, imp: 0.8, about: picks.filter((x) => x !== m).map((x) => x.id), k: 'party' });
      for (const o of picks) if (o !== m) sim.relMut(m, o).a += 12;
    }
    sim.pushLog(`${cap.name}の冒険者ギルドで、${leader.given}を頭にパーティー「${name}」（${picks.map((m) => `${m.given}・${partyRole(m)}`).join('／')}）が結成された。`, 'event', picks.map((m) => m.id), leader.pos);
  }
}

function disband(sim, pt, alive, pair) {
  pt.gone = true; pt.ended = sim.today;
  for (const m of alive) {
    m.party = null;
    sim.remember(m, pair && pair.includes(m) ? `${pair.find((x) => x !== m).given}と揉めて、パーティー「${pt.name}」は解散した` : `パーティー「${pt.name}」が解散した`, { emo: -0.5, imp: 0.7, k: 'party' });
  }
  if (pt.done >= 3 || alive.length) sim.pushLog(`パーティー「${pt.name}」が${pair ? `${pair[0].given}と${pair[1].given}の仲たがいで` : ''}解散した（依頼達成${pt.done}件）。`, 'event', alive.map((m) => m.id), alive[0]?.pos);
}

// 戦利品の山分け：パーティーの誰かが魔物から素材を得たら、仲間にも分ける
export function splitLoot(sim, p, it) {
  const pt = partyOf(sim, p);
  if (!pt || !it || (it.n || 1) < 2) return;
  const mates = pt.members.map((id) => sim.S.people[id]).filter((m) => m && m !== p && m.deathYear == null && m.quest === p.quest);
  if (!mates.length) return;
  const each = Math.floor((it.n || 1) / (mates.length + 1));
  if (each < 1) return;
  for (const m of mates) { it.n -= each; addItem(m, makeItem(it.id, 1, { n: each })); }
}

// 報酬のお金：パーティーなら一緒に戦った仲間と山分け、ひとりなら財布と家計に
export function splitCoins(sim, p, amt) {
  // 魔物退治の報酬は、国庫（なければ近くの町の蓄え）から出る。払えない分は出ない
  const k = sim.kingdomOf?.(p); const town = sim.S.towns[p.s];
  let paid = 0;
  if (k && k.treasury > 200) { paid = Math.min(amt, (k.treasury - 200) * 0.1); k.treasury -= paid; }
  if (paid < amt && town) { const f = Math.min(amt - paid, (town.fund || 0) * 0.2); town.fund -= f; paid += f; }
  amt = paid;
  if (amt <= 0) return;
  const pt = partyOf(sim, p);
  const mates = pt ? pt.members.map((id) => sim.S.people[id]).filter((m) => m && m.deathYear == null && (m === p || (m.quest && m.quest === p.quest))) : [p];
  const each = amt / mates.length;
  for (const m of mates) { m.purse = (m.purse || 0) + each * 0.7; const hh = sim.hh(m); if (hh) hh.money += each * 0.3; else m.purse += each * 0.3; }
}
