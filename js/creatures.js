// 動物・魔物：それぞれの目的で動き、食べ、増え、進化し、危険を学ぶ
import { SPECIES } from './data.js';
import { T, W, H, CORE, walkable, tileAt, biomeOf, isWater } from './world.js';
import { findPath } from './path.js';
import { findPathFar } from './pathfar.js';
import { lodBegin, lodDue, lodCreatureGrid, creatureArray } from './lod.js';
import { clamp } from './rng.js';
import { startFight } from './society.js';
import { DROPS, addItem, makeItem } from './items.js';
import { splitCoins, splitLoot } from './guild.js';
import { faunaThink, faunaDied, popTarget, canHunt } from './fauna.js';
import { monsterThink, onMonsterKilled } from './monsters.js';

// 生息数の目安
const POP = {
  rat: 8, crow: 10, owl: 6, frog: 8, snake: 6, turtle: 5, bat: 6,
  deer: 14, boar: 8, wolf: 10, bear: 5, fox: 7, rabbit: 16, squirrel: 8, camel: 6, scorpion: 8, croc: 5, monkey: 8, tiger: 4, parrot: 6,
  reindeer: 8, polarbear: 3, penguin: 8, seagull: 10, eagle: 4, dolphin: 8, whale: 3,
  slime: 12, unicorn: 2, golem: 3, goblin: 10, orc: 6, skeleton: 8, mummy: 6, spider: 6, wyvern: 2, imp: 8, demonsoldier: 4,
};
const WIDE_WORLD = W > CORE;
const SPAWN_FRAC = 0.6;   // 広い世界で、はじめに放つ数（目安に対する割合）
const PREY = new Set(['deer', 'boar', 'rabbit', 'squirrel', 'camel', 'reindeer', 'penguin', 'monkey', 'cow', 'sheep', 'pig', 'chicken', 'goat', 'horse', 'slime', 'rat', 'frog', 'duck', 'turtle', 'donkey']);
const PREDATOR = new Set(['wolf', 'bear', 'fox', 'tiger', 'polarbear', 'croc', 'scorpion', 'eagle', 'snake', 'owl']);
const TIER_XP = [0, 40, 130, 400];
const isHuman = (e) => typeof e.id === 'number';

export function makeCreature(sim, sp, x, z, extra = {}) {
  const def = SPECIES[sp];
  const S = sim.S;
  const id = 'c' + S.nextCid++;
  const lv = extra.lv || 1;
  const c = {
    id, sp, name: def.name, pos: { x, z }, home: { x: extra.hx ?? x, z: extra.hz ?? z }, lv, xp: 0, age: extra.age ?? sim.rng.int(0, 400),
    hunger: sim.rng.range(50, 100), goal: null, fight: null, kind: def.kind, hostile: def.kind === 'hostile' || def.kind === 'demon',
    owner: extra.owner ?? null, range: extra.range ?? 10, kills: 0, lair: extra.lair ?? null, dormant: extra.dormant || false,
  };
  c.role = extra.role || defaultRole(sim, c);
  const lairB = c.lair != null ? sim.S.world.buildings[c.lair] : null;
  if (lairB && ['cave', 'pyramid', 'ruins'].includes(lairB.type) && ['guardian', 'leader', 'treasure'].includes(c.role)) { c.inDungeon = true; c.pos = { x: lairB.door.x, z: lairB.door.z }; }
  // 町の中に生まれてしまったら、町の外へ出す
  if (!allowedInTown(c) && townMask(sim)[Math.round(z) * W + Math.round(x)]) {
    const s = sim.S.world.settlements.reduce((b, q) => (Math.hypot(q.x - x, q.z - z) < Math.hypot(b.x - x, b.z - z) ? q : b));
    const a = Math.atan2(z - s.z, x - s.x) || sim.rng.next() * 6.28;
    for (let r = s.r + 4; r < s.r + 14; r++) {
      const nx = Math.round(s.x + Math.cos(a) * r), nz = Math.round(s.z + Math.sin(a) * r);
      if (nx > 1 && nz > 1 && nx < W - 2 && nz < H - 2 && canStand(sim, c, def, nx, nz)) { c.pos = { x: nx, z: nz }; c.home = { x: nx, z: nz }; break; }
    }
    if (townMask(sim)[Math.round(c.pos.z) * W + Math.round(c.pos.x)]) { c.hp = 0; return c; } // 置き場所がなければ生まれない
  }
  applyStats(c);
  c.hp = c.maxhp;
  S.creatures[id] = c;
  if (!c.inDungeon) settleCreature(sim, c);
  return c;
}

// 役割：種族と群れの状況から決まる
function defaultRole(sim, c) {
  const R = sim.rng, sp = c.sp, def = SPECIES[sp];
  const LIVE = { cow: ['dairy', 'plow', 'meat'], sheep: ['wool'], pig: ['meat'], chicken: ['layer'], duck: ['layer'], goat: ['dairy'], horse: ['mount', 'pack'], donkey: ['pack'], dog: ['watchdog'], cat: ['mouser'] };
  if (LIVE[sp]) return R.pick(LIVE[sp]);
  if (sp === 'rat') return 'pest';
  if (sp === 'demonlord') return 'overlord';
  if (sp === 'demongeneral') return 'aide';
  if (def.kind === 'demon') return c.raid ? 'raider' : sp === 'imp' && R.chance(0.2) ? 'herald' : 'castleguard';
  if (c.lair != null) return R.pick(['guardian', 'guardian', 'sentry', 'scout', 'member']);
  if (def.pack) return 'member';
  if (PREY.has(sp)) return R.pick(['member', 'member', 'sentry', 'parent', 'loner']);
  return R.pick(['loner', 'wanderer', 'parent']);
}

// 群れの長を決める（群れ・巣ごとに最も強いもの）
function electLeaders(sim, all) {
  const groups = {};
  for (const c of all) {
    if (c.role === 'overlord' || c.role === 'aide' || SPECIES[c.sp].kind === 'livestock' || c.role === 'pest') continue;
    const key = c.lair != null ? 'L' + c.lair : (SPECIES[c.sp].pack || c.role === 'member' || c.role === 'leader') && c.home ? c.sp + ':' + Math.floor(c.home.x / 12) + ',' + Math.floor(c.home.z / 12) : null;
    if (key) (groups[key] = groups[key] || []).push(c);
  }
  for (const g of Object.values(groups)) {
    if (g.length < 2) { if (g[0] && g[0].role === 'leader') g[0].role = 'loner'; continue; }
    g.sort((a, b) => b.lv * 10 + b.atk - (a.lv * 10 + a.atk));
    for (const c of g) { if (c.role === 'leader') c.role = c.lair != null ? 'guardian' : 'member'; c.leader = g[0].id; }
    g[0].role = g[0].named ? 'treasure' : 'leader'; g[0].leader = null;
  }
}

export function applyStats(c) {
  const def = SPECIES[c.sp];
  c.maxhp = Math.round(def.hp * (1 + 0.15 * (c.lv - 1)) * (c.power || 1));
  c.atk = Math.round(def.atk * (1 + 0.1 * (c.lv - 1)) * (c.power || 1));
  c.def = Math.round(def.atk * 0.3 + c.lv);
  c.name = c.title || def.name;
  c.hostile = def.kind === 'hostile' || def.kind === 'demon';
  c.kind = def.kind;
}

function tilesOfBiome(world, biomes, n, rng, pred) {
  const out = [];
  for (let i = 0; i < n * 60 && out.length < n; i++) {
    const x = rng.int(2, W - 3), z = rng.int(2, H - 3);
    const t = world.tiles[z * W + x];
    let b = biomeOf(t);
    if (b === 'beach' || b === 'snow') {
      const nearSea = [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => { const tt = tileAt(world, x + dx, z + dz); return tt === T.SEA || tt === T.DEEP; });
      if (b === 'snow' && nearSea && biomes.includes('snowcoast')) b = 'snowcoast';
    }
    if (!biomes.includes(b)) continue;
    if (pred && !pred(x, z, t)) continue;
    out.push({ x, z });
  }
  return out;
}

export function spawnInitialCreatures(sim) {
  const S = sim.S, w = S.world, R = sim.rng;
  const farFromTown = (x, z) => w.settlements.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 4);
  // 家畜
  for (const s of w.settlements) {
    if (s.ranch) {
      const herd = s.kingdom === 2 ? { goat: 3, chicken: 3, sheep: 2, cow: 1, donkey: 1 } : { cow: 3, sheep: 4, pig: 2, chicken: 3, duck: 2, donkey: 1 };
      for (const [sp, n] of Object.entries(herd)) for (let i = 0; i < n; i++) {
        const x = R.int(s.ranch.x0, s.ranch.x1), z = R.int(s.ranch.z0, s.ranch.z1);
        makeCreature(sim, sp, x, z, { owner: s.id, range: 0 });
      }
    }
    // 馬は厩舎の前だけ
    const stable = sim.townBuilding(s, 'stable');
    if (stable) for (let i = 0; i < 3; i++) makeCreature(sim, 'horse', stable.door.x, stable.door.z, { owner: s.id, range: 1.2, hx: stable.door.x, hz: stable.door.z });
    // 町の犬・猫・アヒル・ロバ・ネズミ
    // 町の中の動物は常識的な数に（犬・猫は数匹、ネズミは物陰に少し）
    const pets = { dog: s.type === 'capital' ? 2 : 1, cat: s.type === 'capital' ? 2 : 1, rat: 1 };
    for (const [sp, n] of Object.entries(pets)) for (let i = 0; i < n; i++) {
      const p = sim.randomNear(s.x, s.z, s.r - 1);
      if (!p) continue;
      const extra = { owner: s.id, range: sp === 'dog' ? 2 : sp === 'rat' ? 2 : Math.floor(s.r / 2) };
      if (sp === 'dog' && s.ranch && i === 0) { extra.role = 'herder'; extra.range = 0; }
      if (sp === 'dog' && !extra.role) { const house = sim.S.world.buildings.find((b) => b.settlement === s.id && b.type === 'house' && sim.rng.chance(0.3)); if (house) Object.assign(p, house.door); }
      if (sp === 'rat' || sp === 'cat') { extra.hx = s.x; extra.hz = s.z; }
      makeCreature(sim, sp, p.x, p.z, extra);
    }
  }
  // 野生動物
  for (let [sp, n] of Object.entries(POP)) {
    const def = SPECIES[sp];
    if (!def.biome || sp === 'rat') continue;
    // 広い世界：数は生息地の広さに比例（fauna.js の目安）。はじめは目安の一部だけ放ち、あとは子を産んで増える
    if (WIDE_WORLD) n = Math.max(n, Math.round((popTarget(sim, sp) || n) * SPAWN_FRAC));
    const spots = tilesOfBiome(w, def.biome, def.pack ? Math.ceil(n / 3) : n, R, (x, z, t) => (def.swims ? isWater(t) && t !== T.RIVER : walkable(t) || def.flies) && ((def.kind === 'wild' || def.kind === 'hostile') && !def.flies ? farFromTown(x, z) && w.settlements.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + (def.kind === 'hostile' ? 14 : 4)) : true));
    for (const sp0 of spots) {
      const count = def.pack ? 3 : 1;
      for (let i = 0; i < count; i++) makeCreature(sim, sp, sp0.x + (i ? R.int(-1, 1) : 0), sp0.z + (i ? R.int(-1, 1) : 0), { range: def.swims ? 20 : 12, lv: def.monster ? R.int(1, 3) : 1 });
    }
  }
  // 魔物の巣
  const lairs = w.specials.map((id) => sim.building(id));
  for (const b of lairs) {
    const spawn = { cave: ['skeleton', 'skeleton', 'goblin', 'goblin', 'spider'], pyramid: ['mummy', 'mummy', 'mummy', 'scorpion'], ruins: ['golem', 'slime'], hideout: [] }[b.type];
    if (!spawn) continue;
    for (const sp of spawn) {
      const p = sim.randomNear(b.door.x, b.door.z, 4);
      if (p) makeCreature(sim, sp, p.x, p.z, { lair: b.id, hx: b.door.x, hz: b.door.z, range: 7, lv: R.int(1, 4) });
    }
    if (b.name === '竜の巣穴' || b.dragon) {
      // 未開の地の竜の巣（world.js が b.dragon と竜の名を付ける）は、国々の竜より少し強い
      const p = sim.randomNear(b.door.x, b.door.z, 3);
      if (p) { const d = makeCreature(sim, 'dragon', p.x, p.z, { lair: b.id, hx: b.door.x, hz: b.door.z, range: 10, lv: b.dragon ? 4 : 3 }); d.title = b.dragonName || '赤き竜ヴァルグリム'; applyStats(d); d.named = true; }
    }
  }
  // 魔界
  const dc = lairs.find((b) => b.type === 'demoncastle');
  for (let i = 0; i < 10; i++) {
    const p = sim.randomNear(w.demon.x, w.demon.z, 12, (t) => t === T.WASTE);
    if (p) makeCreature(sim, i < 7 ? 'imp' : 'demonsoldier', p.x, p.z, { lair: dc?.id, hx: w.demon.x, hz: w.demon.z, range: 12, lv: 1 });
  }
}

// ---------- 毎ステップ ----------
export function buildGrid(list) {
  const g = new Map();
  for (const e of list) {
    const k = (Math.floor(e.pos.x / 8) << 8) | Math.floor(e.pos.z / 8);
    let a = g.get(k); if (!a) g.set(k, a = []); a.push(e);
  }
  return g;
}
export function around(grid, x, z, r) {
  const out = [];
  const cx0 = Math.floor((x - r) / 8), cx1 = Math.floor((x + r) / 8), cz0 = Math.floor((z - r) / 8), cz1 = Math.floor((z + r) / 8);
  const far = grid.far;   // 広い世界：遠い生き物の升目（lod.js）
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const a = grid.get((cx << 8) | cz); if (a) for (const e of a) out.push(e);
    if (far) { const f = far.get((cx << 8) | cz); if (f) for (const e of f) if (e.hp > 0) out.push(e); }
  }
  return out;
}

export function stepCreatures(sim, dt) {
  const S = sim.S, R = sim.rng, w = S.world;
  const hr = dt / 60;
  const L = lodBegin(sim);
  const all = L.on ? creatureArray(sim) : Object.values(S.creatures);
  const due = lodDue(sim, all);   // 広い世界だけ。160 の世界では null
  const cgrid = sim._cgrid = due ? lodCreatureGrid(sim, buildGrid) : buildGrid(all.filter((c) => !c.dormant && c.hp > 0 && !c.inDungeon));
  const LV = sim.living(), ps = sim._pstep || 0;
  if (!sim._hgrid || sim._hgridL !== LV || ps - sim._hgridAt >= 2 || ps < sim._hgridAt) { sim._hgrid = buildGrid(LV.filter((h) => h.inside == null && h.jail == null)); sim._hgridL = LV; sim._hgridAt = ps; }
  const hgrid = sim._hgrid;
  // 遠い荒野の生き物は数歩に1回、まとめた時間で動かす（LOD。広い世界だけ。160 の世界では due は null で今までどおり）
  const n = due ? due.length : all.length;
  for (let i = 0; i < n; i += due ? 2 : 1) {
    const c = due ? due[i] : all[i], k = due ? due[i + 1] : 1;
    if (c.dormant || c.hp <= 0) continue;
    const cdt = dt * k, chr = cdt / 60;
    const def = SPECIES[c.sp];
    if (c.inDungeon && !c.fight) { if (c.hp < c.maxhp) c.hp = Math.min(c.maxhp, c.hp + 2 * chr); continue; }
    c.hunger = clamp(c.hunger - (PREDATOR.has(c.sp) ? 1.6 : 1) * chr, 0, 100);
    if (c.hp < c.maxhp) c.hp = Math.min(c.maxhp, c.hp + 2 * chr);
    if (c.fight) continue;
    c.think = (c.think || 0) - cdt;
    if (c.think <= 0) {
      // 遠い荒野の生き物（LOD の段階1・2）は、考える間隔も長くする（誰も見ていない所で細かく迷わない）
      c.think = R.range(1.5, 3) * (k > 1 ? k * 0.8 : 1);
      think(sim, c, def, around(cgrid, c.pos.x, c.pos.z, 12), around(hgrid, c.pos.x, c.pos.z, 9).filter((h) => h.inside == null && h.jail == null && h.deathYear == null));
    }
    move(sim, c, def, cdt);
  }
}

function dist(a, b) { return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z); }

function inTown(sim, x, z, pad = 1) {
  for (const s of sim.S.world.settlements) if (Math.abs(s.x - x) <= s.r + pad && Math.abs(s.z - z) <= s.r + pad) return s;
  return null;
}

function think(sim, c, def, all, humans) {
  const R = sim.rng, S = sim.S;
  // 逃走
  if (c.fleeUntil && S.t < c.fleeUntil) { c.goal = { x: c.home.x, z: c.home.z, run: true }; return; }
  // 群れの襲撃
  if (c.raid) {
    const s = sim.town(c.raid);
    const prey = nearestHuman(sim, c, humans, 8, true);
    if (prey && dist(c, prey) < 1.5) { startFightLazy(sim, c, prey); return; }
    if (prey) { c.goal = { x: prey.pos.x, z: prey.pos.z, run: true }; return; }
    if (Math.hypot(c.pos.x - s.x, c.pos.z - s.z) > 2) { c.goal = { x: s.x, z: s.z, run: true, path: true }; return; }
    if (S.t > (c.raidUntil || 0)) { c.raid = null; c.goal = { x: c.home.x, z: c.home.z, path: true }; }
    return;
  }
  // 動物の暮らし（家族・住処・飢え・序列・縄張り）
  if (faunaThink(sim, c, def, all, humans)) return;
  if (monsterThink(sim, c, def, all, humans)) return;
  // 役割ごとのふるまい
  switch (c.role) {
    case 'herder': case 'plow': {
      const s = sim.town(c.owner);
      const h = sim.hour();
      if (c.role === 'plow' && h > 8 && h < 16 && sim.S.world.fields.length) { const f = sim.S.world.fields.find((q) => q.s === c.owner); if (f) { c.goal = { x: f.x + R.range(-2, 2), z: f.z + R.range(-2, 2) }; return; } }
      if (s && s.ranch) { c.goal = { x: R.range(s.ranch.x0, s.ranch.x1), z: R.range(s.ranch.z0, s.ranch.z1), run: c.role === 'herder' }; return; }
      break;
    }
    case 'mouser': {
      const rat = all.find((o) => o.sp === 'rat' && o.hp > 0 && dist(o, c) < 6);
      if (rat) { if (dist(rat, c) < 1.2) startFightLazy(sim, c, rat); else c.goal = { x: rat.pos.x, z: rat.pos.z, run: true }; return; }
      break;
    }
    case 'watchdog': {
      c.goal = { x: c.home.x + R.range(-1.5, 1.5), z: c.home.z + R.range(-1.5, 1.5) };
      const thief = humans.find((h) => h.action?.type === 'steal' && Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z) < 5);
      if (thief) { c.goal = { x: thief.pos.x, z: thief.pos.z, run: true }; c.barking = S.t; }
      return;
    }
    case 'sentry': {
      const seen = humans.find((h) => Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z) < 8 && !inTown(sim, h.pos.x, h.pos.z, 2));
      if (seen) {
        // 仲間に知らせる：魔物は襲いかかり、草食動物は一斉に逃げる
        for (const o of all) {
          if (o === c || o.sp !== c.sp && o.lair !== c.lair) continue;
          if (dist(o, c) > 10) continue;
          if (o.hostile) o.goal = { x: seen.pos.x, z: seen.pos.z, run: true };
          else if (PREY.has(o.sp)) { const dx = o.pos.x - seen.pos.x, dz = o.pos.z - seen.pos.z, d = Math.hypot(dx, dz) || 1; o.goal = { x: o.pos.x + dx / d * 6, z: o.pos.z + dz / d * 6, run: true }; }
        }
      }
      if (!seen) { c.goal = { x: c.home.x + R.range(-1, 1), z: c.home.z + R.range(-1, 1) }; return; }
      break;
    }
    case 'member': case 'guardian': case 'raider': {
      const lead = c.leader && S.creatures[c.leader];
      if (lead && lead.hp > 0 && !lead.dormant && dist(lead, c) > 3 && !c.raid) { c.goal = { x: lead.pos.x + R.range(-2, 2), z: lead.pos.z + R.range(-2, 2), run: dist(lead, c) > 8 }; return; }
      break;
    }
    case 'aide': case 'castleguard': {
      const lord = S.demon && S.creatures[S.demon.lordId];
      if (!c.raid && lord) { c.goal = { x: lord.pos.x + R.range(-3, 3), z: lord.pos.z + R.range(-3, 3) }; return; }
      break;
    }
    case 'herald': {
      if (!c.raid) { const t = R.pick(sim.S.world.settlements); c.goal = { x: (t.x + c.home.x) / 2, z: (t.z + c.home.z) / 2, path: true }; return; }
      break;
    }
  }
  // 家畜
  if (def.kind === 'livestock') {
    const s = sim.town(c.owner);
    if (s && s.ranch && c.range === 0) c.goal = { x: R.range(s.ranch.x0, s.ranch.x1), z: R.range(s.ranch.z0, s.ranch.z1) };
    else c.goal = { x: c.home.x + R.range(-c.range, c.range), z: c.home.z + R.range(-c.range, c.range) };
    return;
  }
  // 草食：捕食者から逃げる
  if (PREY.has(c.sp) || def.kind === 'neutral') {
    const threat = all.find((o) => o !== c && o.hp > 0 && !o.dormant && (PREDATOR.has(o.sp) || o.hostile) && dist(o, c) < 4);
    const hunter = humans.find((h) => (h.job === 'hunter' || h.job === 'adventurer') && !h.inside && Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z) < 3);
    const danger = threat || hunter;
    if (danger && def.kind !== 'neutral') {
      const dx = c.pos.x - danger.pos.x, dz = c.pos.z - danger.pos.z, d = Math.hypot(dx, dz) || 1;
      c.goal = { x: c.pos.x + (dx / d) * 5, z: c.pos.z + (dz / d) * 5, run: true };
      return;
    }
  }
  // 捕食者：お腹がすいたら狩る
  if (PREDATOR.has(c.sp) && c.hunger < 40) {
    let prey = null, bd = 12;
    for (const o of all) {
      if (o === c || o.hp <= 0 || o.dormant || !PREY.has(o.sp) || !canHunt(sim, c.sp, o.sp, c.hunger < 8) || SPECIES[o.sp].size > def.size * 1.4) continue;
      const d = dist(o, c);
      if (d < bd && !inTown(sim, o.pos.x, o.pos.z)) { bd = d; prey = o; }
    }
    if (!prey && c.hunger < 12 && def.atk >= 8) {
      const h = nearestHuman(sim, c, humans, 8, false);
      if (h) prey = h;
    }
    if (prey) {
      if (dist(prey, c) < 1.4) startFightLazy(sim, c, prey);
      else c.goal = { x: prey.pos.x, z: prey.pos.z, run: true };
      return;
    }
  }
  // 名のある魔物は巣（宝）を守り、遠くへは行かない
  if (c.named && !c.raid && Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) > c.range) { c.goal = { x: c.home.x, z: c.home.z }; return; }
  // 敵対する魔物：縄張りに入った人間を襲う
  if (c.hostile && !c.guard && !(c.calm && S.t < c.calm)) {
    const known = sim.S.speciesMemory[c.sp];
    const h = nearestHuman(sim, c, humans, c.named ? 6 : 4, false);
    if (h && !(known && (known.fear || 0) > 5 && h.lv > c.lv + 3)) {
      if (dist(h, c) < 1.4) startFightLazy(sim, c, h);
      else c.goal = { x: h.pos.x, z: h.pos.z, run: true };
      return;
    }
  }
  // ふだん：巣や住みかのまわりをうろつく（危険な場所は学んで避ける）
  const mem = sim.S.speciesMemory[c.sp];
  for (let i = 0; i < 4; i++) {
    const gx = c.home.x + R.range(-c.range, c.range), gz = c.home.z + R.range(-c.range, c.range);
    const key = Math.floor(gx / 8) * 100 + Math.floor(gz / 8);
    if (mem && (mem.danger?.[key] || 0) > 2 && i < 3) continue;
    c.goal = { x: gx, z: gz };
    break;
  }
}

function nearestHuman(sim, c, humans, r, inTownOk) {
  let best = null, bd = r;
  for (const h of humans) {
    if (h.inside != null || h.jail != null || h.deathYear != null) continue;
    const d = Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z);
    if (d >= bd) continue;
    if (!inTownOk && inTown(sim, h.pos.x, h.pos.z, 3)) continue;
    bd = d; best = h;
  }
  return best;
}

function startFightLazy(sim, c, t) { startFight(sim, c, t); }

// 町（城壁の内側と村の周り）に入れるのは、飼われている動物・ネズミ・町を襲う魔物だけ
export function allowedInTown(c) {
  return c.owner != null || c.sp === 'rat' || c.raid != null || c.occupier != null || SPECIES[c.sp].flies && !SPECIES[c.sp].monster;
}
export function townMask(sim) {
  const w = sim.S.world;
  if (sim._townMask && sim._townMaskN === w.settlements.length) return sim._townMask;
  const m = new Uint8Array(W * H);
  for (const s of w.settlements) for (let z = s.z - s.r - 2; z <= s.z + s.r + 2; z++) for (let x = s.x - s.r - 2; x <= s.x + s.r + 2; x++) if (x >= 0 && z >= 0 && x < W && z < H) m[z * W + x] = 1;
  sim._townMask = m; sim._townMaskN = w.settlements.length;
  return m;
}
// 立てない場所（海・川・柵・建物の上など）にいたら、いちばん近い立てる場所へ移す
export function settleCreature(sim, c) {
  if (!c || c.inDungeon || c.dormant || c.hp <= 0) return true;
  const def = SPECIES[c.sp];
  const x0 = Math.round(c.pos.x), z0 = Math.round(c.pos.z);
  if (canStand(sim, c, def, x0, z0)) return true;
  for (let r = 1; r <= 10; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    if (canStand(sim, c, def, x0 + dx, z0 + dz)) {
      c.pos = { x: x0 + dx, z: z0 + dz }; c.path = null; c.goal = null;
      if (c.home && !canStand(sim, c, def, Math.round(c.home.x), Math.round(c.home.z)) && c.range !== 0) c.home = { x: x0 + dx, z: z0 + dz };
      return true;
    }
  }
  return false;
}

function canStand(sim, c, def, x, z) {
  if (x < 0 || z < 0 || x >= W || z >= H) return false;
  if (!allowedInTown(c) && townMask(sim)[z * W + x]) return false;
  if (def.flies) return true;
  const t = tileAt(sim.S.world, x, z);
  if (def.swims) return t === T.SEA || t === T.DEEP;
  if (c.sp === 'croc' && t === T.RIVER) return true;
  return walkable(t) && t !== T.BLD;
}

function move(sim, c, def, dt) {
  if (!allowedInTown(c) && townMask(sim)[Math.round(c.pos.z) * W + Math.round(c.pos.x)]) {
    const s = sim.S.world.settlements.reduce((b, q) => (Math.hypot(q.x - c.pos.x, q.z - c.pos.z) < Math.hypot(b.x - c.pos.x, b.z - c.pos.z) ? q : b));
    const dx = c.pos.x - s.x || 0.1, dz = c.pos.z - s.z, d = Math.hypot(dx, dz) || 1;
    c.pos.x += (dx / d) * 0.6 * dt; c.pos.z += (dz / d) * 0.6 * dt;
    c.goal = null;
    return;
  }
  if (!c.goal) return;
  const g = c.goal;
  // 遠い目的地は経路を使う
  if (g.path && !c.path && !def.flies && !def.swims) {
    if (sim.pathBudget-- > 0) c.path = (W > 200 ? findPathFar(sim.S.world, Math.round(c.pos.x), Math.round(c.pos.z), Math.round(g.x), Math.round(g.z), { maxIter: 12000 }) : findPath(sim.S.world, Math.round(c.pos.x), Math.round(c.pos.z), Math.round(g.x), Math.round(g.z), 12000)) || [];
    else return;
  }
  const speed = (def.speed || 0.8) * dt * (g.run ? 1.3 : 0.5);
  if (c.path && c.path.length) {
    let sp = speed;
    while (sp > 0 && c.path.length) {
      const t = c.path[0];
      const dx = t.x - c.pos.x, dz = t.z - c.pos.z, d = Math.hypot(dx, dz);
      if (d <= sp) { c.pos.x = t.x; c.pos.z = t.z; c.path.shift(); sp -= d; }
      else { c.pos.x += (dx / d) * sp; c.pos.z += (dz / d) * sp; sp = 0; }
    }
    if (!c.path.length) { c.path = null; c.goal = null; }
    return;
  }
  const dx = g.x - c.pos.x, dz = g.z - c.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { c.goal = null; c.path = null; return; }
  // まとめて動かすとき（LOD）も川や壁を飛び越えないよう、1マスほどずつ確かめながら進む（ふだんの1歩は1回で終わる）
  let rem = Math.min(speed, d);
  while (rem > 1e-9) {
    const m = Math.min(rem, 1.05); rem -= m;
    const nx = c.pos.x + (dx / d) * m, nz = c.pos.z + (dz / d) * m;
    if (canStand(sim, c, def, Math.round(nx), Math.round(nz))) { c.pos.x = nx; c.pos.z = nz; }
    else if (canStand(sim, c, def, Math.round(nx), Math.round(c.pos.z))) c.pos.x = nx;
    else if (canStand(sim, c, def, Math.round(c.pos.x), Math.round(nz))) c.pos.z = nz;
    else { c.goal = null; break; }
  }
  c.face = dx < 0 ? -1 : 1;
}

// ---------- 死 ----------
export function killCreature(sim, c, killer) {
  const S = sim.S, def = SPECIES[c.sp];
  c.hp = 0;
  delete S.creatures[c.id];
  sim.events.push({ type: 'cdied', id: c.id });
  faunaDied(sim, c, killer);
  onMonsterKilled(sim, c, killer);
  const mem = S.speciesMemory[c.sp] || (S.speciesMemory[c.sp] = { deaths: 0, kills: 0, evolved: 0, danger: {}, fear: 0 });
  mem.deaths++;
  const key = Math.floor(c.pos.x / 8) * 100 + Math.floor(c.pos.z / 8);
  mem.danger[key] = (mem.danger[key] || 0) + 1;
  if (killer && isHuman(killer)) mem.fear += 0.3;
  if (!killer) return;
  if (isHuman(killer)) {
    const p = killer;
    p.xp = (p.xp || 0) + Math.round(def.hp / 3 + c.lv * 5); sim.levelCheck(p);
    const hh = sim.hh(p);
    for (const d of DROPS[c.sp] || []) if (sim.rng.chance(d === 'scale' || d === 'horn' || d === 'demoncore' ? 0.9 : 0.6)) splitLoot(sim, p, addItem(p, d === 'gemx' ? makeItem('magicstone') : makeItem(d)));
    if (!def.monster) {
      const meat = Math.max(1, Math.round(def.size * 3));
      if (['livestock', 'wild'].includes(def.kind)) sim.sell(p, 'meat', meat);
      if (p.job === 'hunter') p.needs.esteem = Math.min(100, p.needs.esteem + 10);
    } else {
      const loot = (def.loot || 5) * c.lv + (c.bounty || 0);
      splitCoins(sim, p, loot);
      p.fame += Math.round((def.loot || 5) / 8) + (c.named ? 30 : 0);
      p.needs.esteem = Math.min(100, p.needs.esteem + 15 + (c.named ? 50 : 0));
      sim.remember(p, `${c.name}を倒した${loot > 30 ? `（${Math.round(loot)}銅貨の報酬）` : ''}`, { emo: 0.6, imp: c.named || def.loot >= 60 ? 1 : 0.45, k: 'hunt', where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) } });
      if (p.vendetta === c.sp) { p.vendetta = null; sim.remember(p, `家族の仇の${def.name}を討ち、胸のつかえがおりた`, { emo: 0.7, imp: 0.9 }); }
      if (c.named || def.loot >= 60) {
        p.deeds.push(`${c.name}を討ち取った`);
        sim.news(`${sim.fullName(p)}が${c.name}を討ち取った`, c.named ? 3 : 2, c.pos);
        sim.chron(`${sim.fullName(p)}が${sim.placeName(c.pos.x, c.pos.z)}で${c.name}を討ち取った`, sim.townOf(p).kingdom);
        sim.gossip(p, `${c.name}を倒した`, 0.8, sim.living().filter((q) => q.s === p.s), { congrat: `${c.name}を倒したんだってね`, silent: true });
      }
    }
  } else {
    killer.hunger = 100;
    killer.xp = (killer.xp || 0) + 8 + c.lv * 2;
    killer.kills = (killer.kills || 0) + 1;
    evolveCheck(sim, killer);
  }
}

export function evolveCheck(sim, c) {
  const def = SPECIES[c.sp];
  const tier = c.tier || 1;
  const top = def.evolve && !SPECIES[def.evolve].evolve;
  const topAlive = top && Object.values(sim.S.creatures).some((o) => o.sp === def.evolve && o.hp > 0);
  if (def.evolve && (c.xp || 0) >= TIER_XP[tier] && !topAlive) {
    const old = c.name;
    c.sp = def.evolve; c.tier = tier + 1; c.lv += 2;
    applyStats(c); c.hp = c.maxhp;
    const mem = sim.S.speciesMemory[c.sp] || (sim.S.speciesMemory[c.sp] = { deaths: 0, kills: 0, evolved: 0, danger: {}, fear: 0 });
    mem.evolved++;
    sim.events.push({ type: 'evolve', id: c.id });
    sim.news(`${sim.placeName(c.pos.x, c.pos.z)}で${old}が${c.name}に進化した`, 2, c.pos);
    if (c.sp === 'goblinlord' || c.sp === 'orcking' || c.sp === 'kingslime' || c.sp === 'lich' || c.sp === 'pharaoh' || c.sp === 'arachne' || c.sp === 'dragon') {
      c.named = true;
      sim.chron(`${sim.placeName(c.pos.x, c.pos.z)}に${c.name}が現れた`);
    }
  } else if (!def.evolve && (c.xp || 0) >= 60 * c.lv) {
    c.lv++; c.xp = 0; applyStats(c);
  }
}

// ---------- 毎日 ----------
export function creatureDaily(sim) {
  const S = sim.S, R = sim.rng, w = S.world;
  const all = Object.values(S.creatures);
  const count = {};
  for (const c of all) {
    count[c.sp] = (count[c.sp] || 0) + 1;
    c.age++;
    if (SPECIES[c.sp].monster) { c.xp = (c.xp || 0) + 0.8; evolveCheck(sim, c); }
  }
  electLeaders(sim, all);
  // ネズミは町の食糧をかじる
  for (const c of all) if (c.sp === 'rat' && c.owner != null && S.towns[c.owner]) { const m = S.towns[c.owner]; m.stock.wheat = Math.max(0, m.stock.wheat - 0.6); m.stock.bread = Math.max(0, m.stock.bread - 0.3); }
  // 繁殖・湧き
  for (const [sp, target0] of Object.entries(POP)) {
    const target = popTarget(sim, sp) ?? target0;
    const def = SPECIES[sp];
    const n = count[sp] || 0;
    const demonMul = sp === 'imp' || sp === 'demonsoldier' ? (S.demon?.active ? 2.5 : 0.6) : 1;
    if (n >= target * demonMul) continue;
    if (sp === 'rat') {
      const s = R.pick(w.settlements);
      const p = sim.randomNear(s.x, s.z, s.r - 1);
      if (p && R.chance(0.4)) makeCreature(sim, 'rat', p.x, p.z, { owner: s.id, range: s.r - 1, hx: s.x, hz: s.z, age: 0 });
      continue;
    }
    const parent = all.find((c) => c.sp === sp && c.hp > 0);
    if (parent && R.chance(def.monster ? 0.35 : 0.6)) {
      const p = def.swims || def.flies ? { x: parent.pos.x, z: parent.pos.z } : sim.randomNear(parent.pos.x, parent.pos.z, 2);
      if (p) makeCreature(sim, sp, p.x, p.z, { hx: parent.home.x, hz: parent.home.z, range: parent.range, lair: parent.lair, age: 0 });
    } else if (!parent && def.biome && R.chance(0.1)) {
      const spots = tilesOfBiome(w, def.biome, 1, R, (x, z, t) => (def.swims ? isWater(t) && t !== T.RIVER : walkable(t) || def.flies));
      if (spots[0]) makeCreature(sim, sp, spots[0].x, spots[0].z, { range: 12, age: 0 });
    }
  }
  // 家畜の繁殖
  for (const s of w.settlements) {
    if (!s.ranch) continue;
    const herd = all.filter((c) => c.owner === s.id && c.range === 0);
    if (herd.length < 10 && herd.length >= 2 && R.chance(0.3)) {
      const p = R.pick(herd);
      makeCreature(sim, p.sp, p.pos.x, p.pos.z, { owner: s.id, range: 0, age: 0 });
    }
  }
  // 魔物の群れが村を襲う（巣ごとに数えて、群れが大きくなると動く）
  const byLair = {};
  for (const c of all) if (c.hostile && c.lair != null && SPECIES[c.sp].kind === 'hostile' && !c.raid && !c.named && !c.inDungeon) (byLair[c.lair] = byLair[c.lair] || []).push(c);
  for (const [lair, group] of Object.entries(byLair)) {
    const b = sim.building(+lair);
    const strength = group.reduce((s, c) => s + c.atk, 0);
    const mem = S.speciesMemory[group[0].sp];
    const caution = mem ? mem.fear : 0;
    b.lastRaid = b.lastRaid ?? -99;
    if (group.length >= 4 + caution / 3 && strength > 40 && sim.today - b.lastRaid >= 8 && R.chance(0.12)) {
      b.lastRaid = sim.today;
      const target = w.settlements.filter((s) => !S.towns[s.id].occupied).sort((a, b2) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(b2.x - b.x, b2.z - b.z))[0];
      if (!target || Math.hypot(target.x - b.x, target.z - b.z) > 45) continue;
      const raiders = group.slice(0, Math.min(group.length, 6));
      for (const c of raiders) { c.raid = target.id; c.raidUntil = S.t + 60 * 8; c.path = null; }
      sim.news(`${b.name}から${raiders[0].name}たちの群れが${target.name}へ向かっている！`, 3, b.door);
      S.towns[target.id].threat = { until: S.t + 60 * 10, since: S.t, by: raiders.map((c) => c.id) };
      for (const q of sim.living()) if (q.s === target.id) sim.remember(q, `${raiders[0].name}の群れが町に向かっているという知らせを聞いた`, { emo: -0.8, imp: 0.7, k: 'monster' });
    }
  }
  // 家の近くに出た魔物は危険な場所として人々に知られる
  for (const c of all) {
    if (!c.hostile || c.dormant) continue;
    for (const s of w.settlements) {
      if (Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < s.r + 10 && R.chance(0.2)) {
        const witness = R.pick(sim.living().filter((q) => q.s === s.id));
        if (witness) {
          sim.remember(witness, `${sim.placeName(c.pos.x, c.pos.z)}で${c.name}を見かけた`, { emo: -0.5, imp: 0.55, k: 'sight', where: { x: Math.round(c.pos.x), z: Math.round(c.pos.z) } });
          sim.learnDanger(witness, c.pos.x, c.pos.z, 2);
        }
      }
    }
  }
}
