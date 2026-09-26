// 国と魔王：王の判断・戦争・研究・討伐隊・魔王の侵攻と復活・文化（ことわざ）の進化
import { clamp } from './rng.js';
import { expansionWarEnded, expansionWarReason } from './expansion.js';
import { KINGDOMS, TECHS, SPECIES, JOBS, DEMON_REALM } from './data.js';
import { makeCreature, applyStats } from './creatures.js';
import { startFight, humanStats } from './society.js';
import { T, W, H } from './world.js';
import { addItem, makeItem, autoEquip } from './items.js';

const FIGHTERS = new Set(['knight', 'soldier', 'adventurer', 'wizard', 'general', 'royalguard', 'courtmage', 'warrior', 'archer', 'cleric', 'sage', 'paladin', 'guildmaster', 'watchman']);
const ARMY = new Set(['knight', 'soldier', 'general']);
const title = (p) => (p.sex === 'f' ? '女王' : '王');

export function initPolitics(sim, hist) {
  const S = sim.S, R = sim.rng;
  S.kingdoms = hist.kingdoms.map((k, i) => {
    const cap = S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === i);
    const king = sim.living().find((p) => p.rank === 'king' && sim.town(p.s).kingdom === i);
    const techs = R.shuffle(TECHS.filter((t) => t.cost < 120).map((t) => t.id)).slice(0, R.int(0, 2));
    return {
      id: i, name: k.name, color: KINGDOMS[i].color, capital: cap.id, kingId: king ? king.id : null, treasury: R.int(600, 1200), tax: 0.05,
      relations: {}, war: null, techs, research: 0, contrib: {}, fame: 50, dynasty: k.dynasty, nobles: k.nobles, monarchs: k.monarchs,
      mood: 60, lastFeast: -99, heroCall: null, losses: 0,
    };
  });
  for (const a of S.kingdoms) for (const b of S.kingdoms) if (a !== b) a.relations[b.id] = R.int(-15, 30);
  // 魔王（眠っている）
  const castle = S.world.buildings.find((b) => b.type === 'demoncastle');
  const gen = hist.currentDemon.gen;
  const dl = makeCreature(sim, 'demonlord', castle.door.x, castle.door.z + 1, { lair: castle.id, hx: castle.door.x, hz: castle.door.z + 1, range: 0, lv: 5 + gen, dormant: true });
  dl.title = hist.currentDemon.name; dl.named = true; dl.guard = true; dl.power = 1 + 0.2 * (gen - 1);
  applyStats(dl); dl.hp = dl.maxhp;
  S.demon = { name: hist.currentDemon.name, gen, active: false, awakenDay: R.int(4, 8), power: 40, resist: [], lordId: dl.id, raids: 0, castle: castle.id, defeated: hist.demonLords.length, lastRaid: 0 };
  // 文化：町ごとのことわざ
  for (const s of S.world.settlements) {
    const list = [];
    for (const p of sim.living()) if (p.s === s.id && p.saying) {
      const e = list.find((x) => x.text === p.saying);
      if (e) e.w += 1; else list.push({ text: p.saying, w: 1, origin: '昔から' });
    }
    S.culture[s.id] = list;
  }
}

export function addSaying(sim, sid, text, w = 1, origin = null) {
  const list = sim.S.culture[sid] || (sim.S.culture[sid] = []);
  const e = list.find((x) => x.text === text);
  if (e) e.w += w; else list.push({ text, w, origin: origin || `${sim.year()}年ごろ` });
}
function newSayingEverywhere(sim, text, near = null) {
  for (const s of sim.S.world.settlements) {
    if (near && Math.hypot(s.x - near.x, s.z - near.z) > 45) continue;
    addSaying(sim, s.id, text, 2, `${sim.year()}年の出来事から`);
  }
}

// ---------- 毎時 ----------
export function politicsHourly(sim) {
  const S = sim.S;
  const people = sim.living();
  // 魔物が近いと生存欲が下がる → 逃げる
  const hostile = Object.values(S.creatures).filter((c) => c.hostile && !c.dormant && c.hp > 0);
  for (const p of people) {
    if (p.inside != null || p.jail != null) continue;
    let near = false;
    for (const c of hostile) if (Math.abs(c.pos.x - p.pos.x) < 6 && Math.abs(c.pos.z - p.pos.z) < 6) { near = true; break; }
    if (near && !FIGHTERS.has(p.job) && p.job !== 'guard') { p.needs.survival = Math.max(0, p.needs.survival - 35); if (p.action && p.action.type !== 'flee') p.action = null; }
  }
  // 町が襲われているとき：戦える者は守りに出る
  for (const [sid, town] of Object.entries(S.towns)) {
    if (!town.threat || S.t > town.threat.until) { town.threat = null; continue; }
    const s = sim.town(+sid);
    const raiders = town.threat.by.map((id) => S.creatures[id]).filter((c) => c && c.hp > 0);
    if (!raiders.length) {
      if (!town.threat.won) { town.threat.won = true; sim.news(`${s.name}は魔物の襲撃を退けた`, 2, s); newSayingEverywhere(sim, `${s.name}の守りを忘れるな`, s); }
      town.threat = null; continue;
    }
    for (const p of people) {
      if (p.s !== +sid || p.jail != null || p.fight) continue;
      if (FIGHTERS.has(p.job) || p.job === 'guard' || p.job === 'hunter') {
        const c = raiders.reduce((best, r) => (Math.hypot(r.pos.x - p.pos.x, r.pos.z - p.pos.z) < Math.hypot(best.pos.x - p.pos.x, best.pos.z - p.pos.z) ? r : best), raiders[0]);
        const pw = (x) => (x.atk || 5) * Math.sqrt(x.maxhp || 20);
        // 群れ全体と守り手全体の力を比べる。敵が町のすぐ外（半径＋6マス）に来るまでは門と町の中を固めて待つ
        const theirs = raiders.filter((r) => Math.hypot(r.pos.x - c.pos.x, r.pos.z - c.pos.z) < 8).reduce((t, r) => t + pw(r), 0);
        const ours = people.filter((q) => q.s === +sid && (FIGHTERS.has(q.job) || q.job === 'guard' || q.job === 'hunter') && !q.fight && q.jail == null).slice(0, 8).reduce((t, q) => t + pw(q), 0);
        const close = Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < s.r + 6;
        const outmatched = !close || theirs > ours * 1.2;
        if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 2) startFight(sim, p, c);
        // 格の違う相手には打って出ず、町の中を固める
        else if (outmatched) p.mission = { type: 'defend', x: s.x, z: s.z, until: S.t + 60 };
        else p.mission = { type: 'defend', x: Math.round(c.pos.x), z: Math.round(c.pos.z), until: S.t + 60 };
        if (p.action && p.action.type !== 'defend') p.action = null;
      }
    }
    // 占領：守り手がいなくなって魔物が居座る
    // 援軍：王は都の兵を送る
    if (!town.threat.aid) {
      town.threat.aid = true;
      const k = S.kingdoms[s.kingdom];
      const troops = people.filter((p) => ARMY.has(p.job) && sim.town(p.s).kingdom === s.kingdom && p.s !== s.id && p.jail == null && !p.mission).sort((a, b) => Math.hypot(sim.town(a.s).x - s.x, sim.town(a.s).z - s.z) - Math.hypot(sim.town(b.s).x - s.x, sim.town(b.s).z - s.z)).slice(0, 4);
      for (const p of troops) { p.mission = { type: 'defend', x: s.x, z: s.z, until: S.t + 60 * 30 }; p.action = null; }
      if (troops.length && k) sim.news(`${k.name}が${s.name}へ援軍（${troops.length}人）を送った`, 2, s);
    }
    const defenders = people.filter((p) => (p.s === +sid || (p.mission?.type === 'defend' && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + 3)) && (FIGHTERS.has(p.job) || p.job === 'guard' || p.job === 'hunter') && sim.ageOf(p) >= 16 && p.jail == null);
    const inTown = raiders.filter((c) => Math.hypot(c.pos.x - s.x, c.pos.z - s.z) < s.r);
    if (!defenders.length && inTown.length >= 2 && S.t - (town.threat.since || S.t) > 240 && raiders.some((c) => SPECIES[c.sp].kind === 'demon')) occupy(sim, s, raiders);
  }
  // 戦争：敵の兵士が近づけば戦う
  for (const k of S.kingdoms) {
    if (!k.war) continue;
    const mine = people.filter((p) => ARMY.has(p.job) && sim.town(p.s).kingdom === k.id && !p.fight && !p.inside);
    const theirs = people.filter((p) => ARMY.has(p.job) && sim.town(p.s).kingdom === k.war.with && !p.inside);
    for (const a of mine) {
      const e = theirs.find((b) => Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) < 6);
      if (e) startFight(sim, a, e);
    }
  }
  // 討伐隊：魔王城に着いたら決戦
  for (const party of S.parties) {
    if (party.done) continue;
    const members = party.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
    if (!members.length) { failParty(sim, party); continue; }
    // 30日たっても決着がつかなければ、いったん帰還する
    if (sim.today - (party.since || 0) > 30 && !party.battle) {
      party.done = true; party.returned = true;
      const k = S.kingdoms[party.kingdom]; if (k) k.heroCall = null;
      for (const p of members) { if (p.mission?.type === 'crusade') p.mission = null; p.crusade = null; p.action = null; sim.remember(p, `${S.demon.name}の城にたどり着けず、討伐の旅からいったん引き返した`, { emo: -0.5, imp: 0.8, k: 'hero' }); }
      sim.news(`${S.demon.name}討伐に向かった勇者の一行が、いったん都へ引き返した`, 2);
      continue;
    }
    const lord = S.creatures[S.demon.lordId];
    if (!lord || lord.hp <= 0) { party.done = true; continue; }
    for (const p of members) {
      const d = Math.hypot(lord.pos.x - p.pos.x, lord.pos.z - p.pos.z);
      if (d < 4 && !p.fight) {
        startFight(sim, p, lord);
        if (!party.battle) {
          party.battle = true;
          sim.news(`勇者${p.given}の一行が${S.demon.name}との決戦に挑む！`, 4, lord.pos);
          for (const g of Object.values(S.creatures)) if (SPECIES[g.sp].kind === 'demon' && g !== lord && Math.hypot(g.pos.x - lord.pos.x, g.pos.z - lord.pos.z) < 10) startFight(sim, g, sim.rng.pick(members));
        }
      } else if (!p.fight) p.mission = { type: 'crusade', x: lord.pos.x | 0, z: (lord.pos.z | 0) + 2, until: S.t + 600 };
    }
  }
}

function occupy(sim, s, raiders) {
  const S = sim.S, town = S.towns[s.id];
  if (town.occupied) return;
  town.occupied = true; town.threat = null;
  for (const c of raiders) { c.raid = null; c.home = { x: s.x, z: s.z }; c.range = s.r; c.occupier = s.id; }
  sim.news(`${s.name}が${S.demon.name}の軍勢に占領された！ 住民たちは逃げ出した`, 4, s);
  sim.chron(`${s.name}が${S.demon.name}の軍勢に占領された`, s.kingdom);
  newSayingEverywhere(sim, `${s.name}の悲劇を忘れるな`);
  const cap = S.world.settlements.find((q) => q.type === 'capital' && q.kingdom === s.kingdom && !S.towns[q.id].occupied)
    || S.world.settlements.find((q) => q.type === 'capital' && !S.towns[q.id].occupied);
  for (const p of sim.living().filter((q) => q.s === s.id)) {
    sim.remember(p, `${s.name}が魔王軍に奪われ、着の身着のままで逃げ出した`, { emo: -1, imp: 1, k: 'refugee' });
    if (!cap) continue;
    p.s = cap.id; p.inside = null; p.action = null; p.mission = { type: 'flee', x: cap.x, z: cap.z, until: S.t + 600 };
    const hh = sim.hh(p);
    if (hh) { hh.s = cap.id; if (hh.house != null) { const b = sim.building(hh.house); if (b.type === 'house') { b.hh = null; b.name = '廃屋'; } } hh.house = null; hh.street = true; hh.refugee = s.id; }
    if (!['king', 'royal', 'noble'].includes(p.rank)) p.rank = 'homeless';
  }
}

function liberate(sim, s) {
  const S = sim.S, town = S.towns[s.id];
  town.occupied = false;
  sim.news(`${s.name}が魔王軍から解放された！`, 3, s);
  sim.chron(`${s.name}が魔王軍の手から解放された`, s.kingdom);
  for (const p of sim.living()) {
    const hh = sim.hh(p);
    if (hh && hh.refugee === s.id) {
      hh.refugee = null; hh.street = false; hh.s = s.id; p.s = s.id;
      const house = sim.placeHouse(s) || s.buildings.map((id) => sim.building(id)).find((b) => b.type === 'house' && !b.hh);
      if (house && hh.house == null) { hh.house = house.id; house.hh = hh.id; house.name = hh.name; sim.events.push({ type: 'building', id: house.id }); }
      if (p.rank === 'homeless') p.rank = JOBS[p.job]?.rank || 'commoner';
      p.mission = { type: 'travel', x: s.x, z: s.z, until: S.t + 600 };
      sim.remember(p, `解放された${s.name}へ帰ることになった`, { emo: 0.9, imp: 0.95 });
    }
  }
}

// ---------- 魔王：毎時 ----------
export function demonHourly(sim) {
  const S = sim.S, D = S.demon, R = sim.rng;
  if (!D) return;
  const lord = S.creatures[D.lordId];
  if (D.active && (!lord || lord.hp <= 0)) demonDefeated(sim);
  // 占領された町の解放判定
  for (const s of S.world.settlements) {
    if (!S.towns[s.id].occupied) continue;
    const occupiers = Object.values(S.creatures).filter((c) => c.occupier === s.id && c.hp > 0);
    if (!occupiers.length) liberate(sim, s);
  }
}

function awaken(sim) {
  const S = sim.S, D = S.demon;
  const lord = S.creatures[D.lordId];
  D.active = true;
  if (lord) { lord.dormant = false; lord.hp = lord.maxhp; }
  sim.news(`${DEMON_REALM.name}の空が裂け、第${D.gen}代${D.name}が目覚めた！`, 5, lord?.pos);
  sim.chron(`第${D.gen}代${D.name}が${DEMON_REALM.name}で目覚め、世界征服を宣言した`);
  newSayingEverywhere(sim, '赤い空の日には戸を閉めよ');
  for (const p of sim.living()) {
    sim.remember(p, `${D.name}が目覚めたという知らせに、背筋が凍った`, { emo: -0.9, imp: 0.9, k: 'demon' });
    p.needs.survival = Math.max(0, p.needs.survival - 30);
  }
  for (const k of S.kingdoms) for (const o of S.kingdoms) if (k !== o) k.relations[o.id] = Math.min(100, k.relations[o.id] + 25);
}

function demonDefeated(sim) {
  const S = sim.S, D = S.demon, R = sim.rng;
  if (!D.active) return;
  D.active = false; D.defeated++;
  const party = S.parties.find((p) => !p.done);
  const heroes = party ? party.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null) : [];
  const hero = heroes[0] || null;
  const hname = hero ? `勇者${hero.given}` : '名もなき戦士たち';
  sim.news(`${hname}が${D.name}を討ち果たした！ 大陸に平和が戻る`, 5, hero?.pos);
  sim.chron(`${hname}${hero ? `・${hero.family}` : ''}が第${D.gen}代${D.name}を討ち果たした`, hero ? sim.townOf(hero).kingdom : undefined);
  newSayingEverywhere(sim, hero ? `${hero.given}のように勇敢であれ` : '闇は必ず晴れる');
  for (const p of heroes) {
    p.hero = D.name; p.fame += 120; p.needs.esteem = 100;
    p.deeds.unshift(`${D.name}を討ち果たした勇者だった`);
    sim.remember(p, `仲間とともに${D.name}を討ち果たした`, { emo: 1, imp: 1, k: 'hero' });
    if (p.rank !== 'king' && p.rank !== 'royal') { p.rank = 'knight'; if (p.job !== 'wizard') p.job = 'knight'; }
  }
  for (const p of sim.living()) if (!heroes.includes(p)) sim.remember(p, `${hname}が${D.name}を討ったという知らせに、みんなで泣いて喜んだ`, { emo: 0.95, imp: 0.85, k: 'hero' });
  if (party) party.done = true;
  // 次の魔王は、負けた理由への耐性をもって復活する（進化）
  const usedHoly = heroes.some((p) => p.holy);
  if (usedHoly) D.resist.push('holy');
  D.gen++;
  D.name = `魔王${['ザルヴァーン', 'ネクロディア', 'ヴォルグラム', 'アスタロート', 'ベルゼリオン', 'モルディガン', 'イシュタール', 'グラズヘイム'][Math.min(7, D.gen - 1)]}`;
  D.awakenDay = sim.today + 50 + D.gen * 15;
  D.power = 40 + D.gen * 15;
  const lordOld = S.creatures[D.lordId];
  if (lordOld) delete S.creatures[D.lordId];
  const castle = sim.building(D.castle);
  const dl = makeCreature(sim, 'demonlord', castle.door.x, castle.door.z + 1, { lair: castle.id, hx: castle.door.x, hz: castle.door.z + 1, range: 0, lv: 5 + D.gen, dormant: true });
  dl.title = D.name; dl.named = true; dl.guard = true; dl.power = 1 + 0.25 * (D.gen - 1); applyStats(dl); dl.hp = dl.maxhp;
  D.lordId = dl.id;
  sim.chron(`しかし魔界の奥深くで、次なる${D.name}が力を蓄え始めた（${usedHoly ? '聖なる力への耐性を得て' : 'より強大になって'}）`);
  // 平和の祝祭
  const from = (sim.dayIndex + 1) * 1440 + 16 * 60;
  for (const s of S.world.settlements) if (!S.towns[s.id].occupied) S.gatherings.push({ type: 'festival', place: 'plaza', from, to: from + 6 * 60, s: s.id, label: '平和の祝祭' });
}

function failParty(sim, party) {
  const S = sim.S;
  party.done = true;
  sim.news(`${S.demon.name}討伐に向かった勇者の一行が全滅した……`, 4);
  sim.chron(`${S.demon.name}討伐隊が全滅した`);
  S.demon.power += 20;
  const k = S.kingdoms[party.kingdom];
  if (k) { k.fame -= 15; k.heroCall = null; k.heroCooldown = sim.today + 20; }
  for (const p of sim.living()) if (sim.rng.chance(0.5)) sim.remember(p, '勇者さまたちが魔王に敗れたと聞いて、目の前が暗くなった', { emo: -0.9, imp: 0.8, k: 'demon' });
}

// ---------- 毎日 ----------
export function politicsDaily(sim, opts = {}) {
  const S = sim.S, R = sim.rng, D = S.demon;
  for (const k of S.kingdoms) {
    const king = S.people[k.kingId];
    if (!king || king.deathYear != null) succession(sim, k);
  }
  if (opts.succession) return;

  // 魔王の目覚め・侵攻
  if (D && !D.active && sim.today >= D.awakenDay - 2 && sim.today < D.awakenDay) {
    sim.news('魔界の方角の空が、夕焼けでもないのに赤く染まっている……', 2);
    for (let i = 0; i < 3; i++) { const p = sim.randomNear(S.world.demon.x, S.world.demon.z, 10, (t) => t === T.WASTE); if (p) makeCreature(sim, 'imp', p.x, p.z, { hx: S.world.demon.x, hz: S.world.demon.z, range: 12 }); }
  }
  if (D && !D.active && sim.today >= D.awakenDay) awaken(sim);
  if (D && D.active) {
    D.power += 2;
    if (sim.today - D.lastRaid >= R.int(6, 10)) sendDemonRaid(sim);
  }

  for (const k of S.kingdoms) {
    const king = S.people[k.kingId];
    if (!king) continue;
    const towns = S.world.settlements.filter((s) => s.kingdom === k.id);
    // 税収と税率の上げ下げは taxes.js（taxesDaily）が受け持つ
    // 王の判断
    const threat = D && D.active ? D.power + D.raids * 10 : 0;
    const ambition = king.values.ambition, kind = king.pers.A;
    if (k.treasury > 900 && sim.today - k.lastFeast > 20 && kind > 0.5 && R.chance(0.15)) {
      k.lastFeast = sim.today; k.treasury -= 200;
      const cap = sim.town(k.capital);
      const from = sim.dayIndex * 1440 + 17 * 60;
      S.gatherings.push({ type: 'festival', place: 'plaza', from, to: from + 5 * 60, s: cap.id, label: '王の祝宴' });
      sim.news(`${title(king)}${king.given}が${cap.name}で民に祝宴をふるまう`, 2, cap);
    }
    // 研究
    const next = TECHS.filter((t) => !k.techs.includes(t.id)).sort((a, b) => priority(sim, k, b) - priority(sim, k, a))[0];
    if (next && k.research >= next.cost) {
      k.research -= next.cost;
      k.techs.push(next.id);
      const top = Object.entries(k.contrib).sort((a, b) => b[1] - a[1])[0];
      const who = top ? S.people[top[0]] : null;
      k.contrib = {};
      if (who && who.deathYear == null) {
        who.deeds.push(`「${next.name}」を発見した`); who.fame += 30; who.needs.esteem = 100;
        sim.remember(who, `長年の研究が実を結び、「${next.name}」を発見した`, { emo: 1, imp: 1, k: 'discovery' });
        sim.gossip(who, `「${next.name}」を発見した`, 0.8, sim.living().filter((q) => sim.town(q.s).kingdom === k.id), { congrat: '大発見をしたんだってね', silent: true });
      }
      sim.news(`${k.name}で「${next.name}」が発見された${who ? `（${sim.fullName(who)}）` : ''}。${next.desc}`, 3, sim.town(k.capital));
      sim.chron(`${who ? sim.fullName(who) + 'が' : ''}「${next.name}」を発見し、${k.name}に広めた`, k.id);
      if (next.id === 'holy') forgeHolySword(sim, k);
    }
    // 技術の伝わり
    for (const o of S.kingdoms) {
      if (o === k || k.relations[o.id] < 15) continue;
      for (const t of o.techs) if (!k.techs.includes(t) && R.chance(0.02)) {
        k.techs.push(t);
        sim.news(`「${TECHS.find((x) => x.id === t).name}」が${o.name}から${k.name}へ伝わった`, 1);
      }
    }
    // 他国との関係
    for (const o of S.kingdoms) {
      if (o === k) continue;
      let r = k.relations[o.id];
      r += (0 - r) * 0.02;
      if (D && D.active) r += 1.5;
      if (kind < 0.35) r -= 0.8;
      const oreLow = towns.every((s) => S.towns[s.id].stock.ore < 8);
      const foodLow = towns.some((s) => S.towns[s.id].price.bread > 5);
      if (oreLow || foodLow) r -= 1.5 + ambition;
      k.relations[o.id] = clamp(r, -100, 100);
    }
    // 戦争の判断
    if (!k.war) {
      const foe = S.kingdoms.filter((o) => o !== k && !o.war).sort((a, b) => k.relations[a.id] - k.relations[b.id])[0];
      if (foe && k.relations[foe.id] < -45 && ambition > 0.45 && (!D || !D.active || ambition > 0.85)) {
        const mine = armySize(sim, k.id), theirs = armySize(sim, foe.id);
        if (mine >= theirs * 0.8 && R.chance(0.15)) declareWar(sim, k, foe);
      }
    } else warDaily(sim, k);
    // 魔王討伐令
    if (D && D.active && !S.parties.some((p) => !p.done) && threat > 70 - king.values.courage * 20 && k.treasury > 200 && R.chance(0.35)) callHeroes(sim, k);
  }

  // ことわざの流行りすたり
  for (const list of Object.values(S.culture)) {
    for (const e of list) e.w *= 0.985;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].w < 0.3) list.splice(i, 1);
  }
}

function priority(sim, k, t) {
  const S = sim.S;
  const towns = S.world.settlements.filter((s) => s.kingdom === k.id);
  let p = -t.cost / 100;
  if (t.id === 'holy' && S.demon?.active) p += 5;
  if (t.id === 'barrier' && S.demon?.active) p += 3;
  if (t.id === 'rotation' && towns.some((s) => S.towns[s.id].price.bread > 4)) p += 3;
  if (t.id === 'medicine' && S.stats.deaths > 3) p += 2;
  if (t.id === 'steel' && k.war) p += 3;
  if (t.id === 'navigation' && towns.some((s) => s.type === 'port')) p += 1;
  return p;
}

function forgeHolySword(sim, k) {
  const best = sim.living().filter((p) => sim.town(p.s).kingdom === k.id && FIGHTERS.has(p.job)).sort((a, b) => b.lv - a.lv)[0];
  if (!best) return;
  best.holy = true; addItem(best, makeItem('holysword', 1.2)); autoEquip(best); Object.assign(best, humanStats(sim, best));
  best.deeds.push('聖剣を授かった');
  sim.remember(best, `${k.name}の${'王'}から聖剣を授かった`, { emo: 0.9, imp: 1 });
  sim.news(`聖剣が鍛え上げられ、${sim.fullName(best)}に授けられた`, 3, best.pos);
}

function armySize(sim, kid) {
  let n = 0;
  for (const p of sim.living()) if (ARMY.has(p.job) && sim.town(p.s).kingdom === kid && p.jail == null) n += p.lv;
  return n;
}

function declareWar(sim, a, b) {
  const S = sim.S, R = sim.rng;
  const ex = expansionWarReason(sim, a, b);
  const reason = ex?.reason || R.pick(['国境の鉱山をめぐって', '交易路の通行税をめぐって', '食糧不足の打開のため', '王家の名誉をかけて', '国境の森の領有をめぐって']);
  const capA = sim.town(a.capital), capB = sim.town(b.capital);
  const front = ex?.front || sim.randomNear((capA.x + capB.x) / 2, (capA.z + capB.z) / 2, 8) || { x: Math.round((capA.x + capB.x) / 2), z: Math.round((capA.z + capB.z) / 2) };
  const name = `${a.name.replace('王国', '')}・${b.name.replace('王国', '')}戦争`;
  a.war = { with: b.id, since: sim.today, front, name, losses: 0 };
  b.war = { with: a.id, since: sim.today, front, name, losses: 0 };
  sim.news(`${reason}、${a.name}が${b.name}に宣戦布告！「${name}」が始まった`, 4, front);
  sim.chron(`${reason}、${a.name}と${b.name}の間で「${name}」が始まった`, a.id);
  for (const p of sim.living()) {
    const k = sim.town(p.s).kingdom;
    if (k !== a.id && k !== b.id) continue;
    if (sim.isAdult(p)) sim.remember(p, `${name}が始まった`, { emo: -0.8, imp: 0.9, k: 'war' });
    if (ARMY.has(p.job)) {
      p.mission = { type: 'march', x: front.x + R.int(-2, 2), z: front.z + R.int(-2, 2), until: S.t + 1440 * 20, dur: 240 };
      if (p.action) p.action = null;
      sim.remember(p, `${name}の前線へ出陣した`, { emo: -0.4, imp: 0.9, k: 'war' });
    }
  }
}

function warDaily(sim, k) {
  const S = sim.S, war = k.war, o = S.kingdoms[war.with];
  if (!o || !o.war) { k.war = null; return; }
  // 兵士は前線へ（補充も）
  for (const p of sim.living()) if (ARMY.has(p.job) && sim.town(p.s).kingdom === k.id && !p.mission && p.jail == null) {
    p.mission = { type: 'march', x: war.front.x + sim.rng.int(-2, 2), z: war.front.z + sim.rng.int(-2, 2), until: S.t + 1440 * 5, dur: 240 };
  }
  const days = sim.today - war.since;
  const mine = armySize(sim, k.id), theirs = armySize(sim, o.id);
  if (days > 12 || mine < 3 || theirs < 3) {
    const winner = mine >= theirs ? k : o, loser = winner === k ? o : k;
    endWar(sim, winner, loser);
  }
}

function endWar(sim, winner, loser) {
  const S = sim.S;
  const name = winner.war.name;
  // 敗戦国は勝者の都にいちばん近い村を割譲する
  const wcap = sim.town(winner.capital);
  const ceded = S.world.settlements.filter((s) => s.kingdom === loser.id && s.type !== 'capital').sort((a, b) => Math.hypot(a.x - wcap.x, a.z - wcap.z) - Math.hypot(b.x - wcap.x, b.z - wcap.z))[0];
  const gold = Math.min(loser.treasury * 0.4, 400);
  loser.treasury -= gold; winner.treasury += gold;
  winner.war = null; loser.war = null;
  winner.relations[loser.id] = -20; loser.relations[winner.id] = -40;
  winner.fame += 20; loser.fame -= 20;
  let txt = `「${name}」が終わり、${winner.name}が勝利した`;
  if (ceded) {
    ceded.kingdom = winner.id;
    const w = S.world;
    for (let z = ceded.z - 20; z <= ceded.z + 20; z++) for (let x = ceded.x - 20; x <= ceded.x + 20; x++) {
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      if (w.kingdomOf[z * W + x] === loser.id && Math.hypot(x - ceded.x, z - ceded.z) < 14) w.kingdomOf[z * W + x] = winner.id;
    }
    for (const b of ceded.buildings) sim.building(b).kingdom = winner.id;
    txt += `。${ceded.name}は${winner.name}の領土となった`;
    for (const p of sim.living()) if (p.s === ceded.id) sim.remember(p, `戦争のあと、${ceded.name}は${winner.name}のものになった`, { emo: -0.3, imp: 0.9, k: 'war' });
    sim.events.push({ type: 'borders' });
  }
  sim.news(txt, 4, ceded || wcap);
  sim.chron(txt, winner.id);
  newSayingEverywhere(sim, `${name}を忘れるな`);
  for (const p of sim.living()) if (p.mission?.type === 'march') p.mission = null;
  expansionWarEnded(sim, winner, loser);
}

function callHeroes(sim, k) {
  const S = sim.S, R = sim.rng;
  const king = S.people[k.kingId];
  if (k.heroCooldown && sim.today < k.heroCooldown) return; // 全滅のあとしばらくは次の討伐隊を出さない
  const cands = sim.living().filter((p) => sim.town(p.s).kingdom === k.id && (FIGHTERS.has(p.job) || p.job === 'priest' || p.job === 'cleric') && p.jail == null && !p.quest && !p.mission && sim.ageOf(p) >= 16 && sim.ageOf(p) < 60 && p.values.courage > 0.35)
    .sort((a, b) => (b.lv * 3 + b.fame / 10 + b.values.courage * 5) - (a.lv * 3 + a.fame / 10 + a.values.courage * 5));
  const members = [];
  for (const job of ['paladin', 'knight', 'warrior', 'adventurer', 'sage', 'wizard', 'cleric', 'priest']) { const p = cands.find((q) => q.job === job && !members.includes(q)); if (p) members.push(p); }
  for (const p of cands) if (members.length < 4 && !members.includes(p)) members.push(p);
  if (members.length < 2) return;
  // 勝ち目がなければ出さない（一行の力の合計が魔王の3割に届くまで待ち、そのあいだは鍛錬と聖剣の研究を急ぐ）
  const lord = S.creatures[S.demon.lordId];
  const pw = (x) => (x.atk || 5) * Math.sqrt(x.maxhp || 40);
  if (lord && members.reduce((t, p) => t + pw(p), 0) < pw(lord) * 0.3) {
    if (!k.heroWait || sim.today - k.heroWait > 10) { k.heroWait = sim.today; sim.news(`${k.name}は魔王に挑める勇者がまだ育っていないとして、討伐隊の派遣を見送った`, 1); }
    return;
  }
  const hero = members.sort((a, b) => b.lv - a.lv)[0];
  const bounty = Math.min(k.treasury * 0.4, 500);
  k.treasury -= bounty;
  const party = { id: S.parties.length + 1, kingdom: k.id, members: members.map((p) => p.id), since: sim.today, bounty };
  S.parties.push(party);
  const castle = sim.building(S.demon.castle);
  for (const p of members) {
    p.mission = { type: 'crusade', x: castle.door.x, z: castle.door.z + 2, until: S.t + 1440 * 30 };
    p.action = null; p.crusade = party.id;
    sim.hh(p).money += bounty / members.length;
    if (k.techs.includes('holy') && p === hero && !p.holy) { p.holy = true; addItem(p, makeItem('holysword', 1.2)); autoEquip(p); }
    for (let i = 0; i < 3; i++) addItem(p, makeItem('potion'));
    Object.assign(p, humanStats(sim, p));
    sim.remember(p, `${title(king)}${king.given}さまから${S.demon.name}討伐の命を受けた`, { emo: 0.4, imp: 1, k: 'hero' });
  }
  hero.heroTitle = true;
  sim.news(`${k.name}の${title(king)}${king.given}が魔王討伐令を発した。勇者${hero.given}ら${members.length}人が${S.demon.name}のもとへ旅立つ`, 4, sim.town(k.capital));
  sim.chron(`${king.given}${title(king)}の命により、勇者${sim.fullName(hero)}の一行が魔王討伐へ旅立った`, k.id);
}

function sendDemonRaid(sim) {
  const S = sim.S, D = S.demon, R = sim.rng;
  D.lastRaid = sim.today; D.raids++;
  const w = S.world;
  const target = w.settlements.filter((s) => !S.towns[s.id].occupied).sort((a, b) => Math.hypot(a.x - w.demon.x, a.z - w.demon.z) - Math.hypot(b.x - w.demon.x, b.z - w.demon.z))[R.int(0, 1)];
  if (!target) return;
  const n = 3 + Math.min(6, Math.floor(D.power / 30));
  const units = [];
  for (let i = 0; i < n; i++) {
    const p = sim.randomNear(w.demon.x, w.demon.z, 8, (t) => t === T.WASTE);
    if (!p) continue;
    const sp = i === 0 && D.power > 90 ? 'demongeneral' : i < n / 2 ? 'demonsoldier' : 'imp';
    const c = makeCreature(sim, sp, p.x, p.z, { hx: w.demon.x, hz: w.demon.z, range: 10, lv: 1 + Math.floor(D.power / 50) });
    c.raid = target.id; c.raidUntil = S.t + 60 * 36; c.role = i === 0 ? 'leader' : 'raider';
    units.push(c);
  }
  S.towns[target.id].threat = { until: S.t + 60 * 40, since: S.t, by: units.map((c) => c.id) };
  sim.news(`${D.name}の軍勢（${units.length}体）が${target.name}へ進軍を始めた！`, 4, w.demon);
  for (const p of sim.living()) if (p.s === target.id) sim.remember(p, `魔王軍がこの町に向かっているという知らせを聞いた`, { emo: -0.9, imp: 0.8, k: 'demon' });
}

function succession(sim, k) {
  const S = sim.S;
  const old = S.people[k.kingId];
  const royals = sim.living().filter((p) => ['royal', 'king'].includes(p.rank) && sim.town(p.s).kingdom === k.id);
  let heir = null;
  if (old) {
    heir = old.children.map((id) => S.people[id]).filter((c) => c && c.deathYear == null && sim.ageOf(c) >= 14).sort((a, b) => a.birthYear - b.birthYear)[0];
    if (!heir) { const sp = S.people[old.spouseId] || S.people[old.exSpouses[old.exSpouses.length - 1]]; if (sp && sp.deathYear == null) heir = sp; }
  }
  if (!heir) heir = royals.filter((p) => sim.ageOf(p) >= 14).sort((a, b) => a.birthYear - b.birthYear)[0];
  let newDynasty = false;
  if (!heir) {
    heir = sim.living().filter((p) => p.rank === 'noble' && sim.town(p.s).kingdom === k.id && sim.ageOf(p) >= 20).sort((a, b) => b.values.ambition - a.values.ambition)[0];
    newDynasty = true;
  }
  if (!heir) heir = sim.living().filter((p) => sim.town(p.s).kingdom === k.id && sim.ageOf(p) >= 25).sort((a, b) => b.fame - a.fame)[0];
  if (!heir) return;
  k.kingId = heir.id; heir.rank = 'king'; heir.job = 'king'; k.monarchs.push(heir.id);
  Object.assign(heir, humanStats(sim, heir));
  const n = k.monarchs.length;
  if (newDynasty) { sim.chron(`${k.dynasty}王家の血が絶え、${heir.family}家が新たな王朝を開いた`, k.id); k.dynasty = heir.family; }
  heir.deeds.unshift(`${k.name}の第${n}代${title(heir)}だった`);
  sim.remember(heir, `${k.name}の第${n}代${title(heir)}に即位した`, { emo: 0.5, imp: 1, k: 'crown' });
  sim.news(`${heir.given}・${heir.family}が${k.name}の第${n}代${title(heir)}に即位した`, 4, heir.pos);
  sim.chron(`${sim.fullName(heir)}が${k.name}の第${n}代${title(heir)}に即位した`, k.id);
  // 王家の住まい（城）へ
  const cap = sim.town(k.capital);
  const royalHh = Object.values(S.households).find((h) => h.royal && h.s === cap.id);
  if (royalHh && heir.hh !== royalHh.id) sim.moveTo(heir, royalHh);
  heir.s = cap.id;
  for (const p of sim.living()) if (sim.town(p.s).kingdom === k.id && sim.isAdult(p) && p !== heir && sim.rng.chance(0.4)) sim.remember(p, `新しい${title(heir)}${heir.given}さまが即位した`, { emo: 0.3, imp: 0.6, k: 'crown' });
}
