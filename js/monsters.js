// 魔物の政治：群れ（氏族）と跡目争い・縄張り争い、魔王軍の指揮系統（魔将・忠誠・離反・処罰・作戦会議）
// 状態：S.bands（群れ）、S.bandSeq、S.demonArmy（魔王軍の指揮系統）。どれも遅延初期化なので古いセーブでも動く。
// 生き物に足す印：c.band（群れid）、c.general（魔将id）、c.rebel（離反した魔王軍）
import { SPECIES } from './data.js';
import { killCreature, makeCreature, applyStats, townMask } from './creatures.js';
import { T, W, H, walkable, tileAt } from './world.js';

// 種族の系統（進化しても同じ群れのまま）
const FAMILY = {
  goblin: 'goblin', hobgoblin: 'goblin', goblinlord: 'goblin',
  orc: 'orc', orcking: 'orc',
  skeleton: 'undead', skelknight: 'undead', lich: 'undead',
  mummy: 'mummy', pharaoh: 'mummy',
  spider: 'spider', arachne: 'spider',
};
// 系統ごとの基本種・長の呼び名・群れの名前
const FAM = {
  goblin: { base: 'goblin', chief: '族長', label: 'ゴブリン', names: ['牙の氏族', '赤耳の氏族', '錆刃の氏族', '泥沼の氏族', '夜目の氏族', '折れ角の氏族'] },
  orc: { base: 'orc', chief: '大族長', label: 'オーク', names: ['血斧の部族', '鉄拳の部族', '黒牙の部族', '石割りの部族', '灰色傷の部族'] },
  undead: { base: 'skeleton', chief: '骸の将', label: '不死者', names: ['骨の軍団', '嘆きの骸兵団', '朽ちた騎士団', '墓守りの列', '冷たい灯の軍団'] },
  mummy: { base: 'mummy', chief: '墓所の主', label: 'ミイラ', names: ['砂の眷属', '王墓の近衛', '乾いた誓いの一団'] },
  spider: { base: 'spider', chief: '女王', label: '大蜘蛛', names: ['黒糸の巣', '毒牙の一族', '夜織りの一族'] },
  demon: { base: 'imp', chief: '首領', label: '魔族', names: ['黒角の独立軍', '裂けた旗の軍勢', '灰燼の叛軍'] },
};
// 仲間が増える上限（種ごと）。creatures.js の生息数の目安の約1.4倍
const SP_CAP = { goblin: 14, orc: 9, skeleton: 11, mummy: 8, spider: 8, imp: 20 };
const MAX_BAND = 10;
const GEN_NAMES = ['ガルザーク', 'ベリアス', 'ヴォルグ', 'ザガン', 'モラクス', 'アンドラス', 'グシオン', 'バラム', 'マルバス', 'ハルファス', 'フォカロル', 'ナベリウス'];
const GEN_EPI = ['黒炎の', '鉄血の', '冷笑の', '千刃の', '沈黙の', '嵐の', '毒舌の', '双角の'];
const FIGHTER_JOBS = new Set(['knight', 'soldier', 'adventurer', 'wizard', 'general', 'royalguard', 'courtmage', 'warrior', 'archer', 'cleric', 'sage', 'paladin', 'guildmaster', 'watchman', 'guard']);

const alive = (S, c) => !!c && c.hp > 0 && S.creatures[c.id] === c;
const power = (c) => c.lv * 10 + c.atk + c.maxhp / 10;
const spName = (sp) => SPECIES[sp]?.name || sp;

// ---------- 初期化（遅延） ----------
export function initMonsters(sim) {
  const S = sim.S;
  S.bands = S.bands || {};
  S.bandSeq = S.bandSeq || 1;
  S.demonArmy = S.demonArmy || { generals: {}, seq: 1, plan: null, memory: {}, lastCouncil: -99, wasActive: false, recentLoss: 0, wins: 0, lastAppoint: -99, lastPurge: -99, lordLow: 1 };
  const DA = S.demonArmy;
  DA.generals = DA.generals || {}; DA.memory = DA.memory || {};
}

function bandBase(sim, band) {
  if (band.lair != null) { const b = sim.building(band.lair); if (b) return { x: b.door.x, z: b.door.z }; }
  return band.camp || { x: 80, z: 80 };
}
function bandMembers(sim, band) { return band.members.map((id) => sim.S.creatures[id]).filter((c) => alive(sim.S, c)); }
function famOf(c) { return c.rebel ? 'demon' : FAMILY[c.sp] || null; }
function eligible(sim, c) {
  if (!c || c.hp <= 0 || c.dormant || c.occupier != null || c.general) return false;
  if (c.rebel) return true;
  return !!FAMILY[c.sp] && SPECIES[c.sp].kind === 'hostile';
}
function newBandName(sim, fam) {
  const used = new Set(Object.values(sim.S.bands).map((b) => b.name));
  const free = FAM[fam].names.filter((n) => !used.has(n));
  if (free.length) return sim.rng.pick(free);
  const n = sim.rng.pick(FAM[fam].names);
  for (let i = 2; i < 9; i++) if (!used.has(`第${i}の${n}`)) return `第${i}の${n}`;
  return n;
}
function createBand(sim, members, opt = {}) {
  const S = sim.S;
  const fam = opt.fam || famOf(members[0]);
  const id = 'b' + S.bandSeq++;
  const lead = members.slice().sort((a, b) => power(b) - power(a))[0];
  const band = {
    id, fam, sp: FAM[fam].base, lair: opt.lair ?? (lead.lair ?? null), camp: opt.camp || { x: Math.round(lead.home.x), z: Math.round(lead.home.z) },
    leader: opt.leader?.id || lead.id, members: members.map((c) => c.id), loyalty: opt.loyalty ?? 60, founded: sim.today,
    name: opt.name || newBandName(sim, fam), wins: 0, losses: 0, lastWar: -99, rebel: !!opt.rebel,
  };
  S.bands[id] = band;
  for (const c of members) c.band = id;
  return band;
}
function chiefTitle(band) { return FAM[band.fam]?.chief || '長'; }

// 新しい住みかを探す（空いた洞窟・遺跡があればそこへ、なければ町から離れた野営地）
function findNewHome(sim, from, fam, minD = 14, maxD = 32) {
  const S = sim.S, w = S.world, R = sim.rng;
  const usedLairs = new Set(Object.values(S.bands).map((b) => b.lair).filter((x) => x != null));
  if (fam !== 'demon') {
    const lair = w.specials.map((id) => sim.building(id)).find((b) => ['cave', 'ruins', 'pyramid'].includes(b.type) && !usedLairs.has(b.id) && Math.hypot(b.door.x - from.x, b.door.z - from.z) < 45 && b.name !== '竜の巣穴');
    if (lair) return { lair: lair.id, x: lair.door.x, z: lair.door.z };
  }
  const mask = townMask(sim);
  const bases = Object.values(S.bands).map((b) => bandBase(sim, b));
  for (let i = 0; i < 60; i++) {
    const a = R.next() * Math.PI * 2, d = R.range(minD, maxD);
    const x = Math.round(from.x + Math.cos(a) * d), z = Math.round(from.z + Math.sin(a) * d);
    if (x < 3 || z < 3 || x > W - 4 || z > H - 4) continue;
    const t = tileAt(w, x, z);
    if (!walkable(t) || t === T.BLD || t === T.RIVER || mask[z * W + x]) continue;
    if (fam === 'demon' && t !== T.WASTE && i < 40) continue;
    if (w.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 14)) continue;
    if (bases.some((b) => Math.hypot(b.x - x, b.z - z) < 10) && i < 50) continue;
    return { lair: null, x, z };
  }
  return null;
}
function relocate(sim, band, home) {
  band.lair = home.lair; band.camp = { x: home.x, z: home.z };
  for (const c of bandMembers(sim, band)) {
    c.lair = home.lair; c.home = { x: home.x, z: home.z }; c.inDungeon = false; c.raid = null;
    c.goal = { x: home.x, z: home.z, path: true }; c.path = null; c.range = 8;
  }
}

// ---------- 群れの編成（毎日） ----------
function rebuildBands(sim) {
  const S = sim.S;
  const all = Object.values(S.creatures);
  // 死んだ者・抜けた者を名簿から外す
  for (const band of Object.values(S.bands)) band.members = band.members.filter((id) => { const c = S.creatures[id]; return alive(S, c) && c.band === band.id && eligible(sim, c); });
  // 群れのない魔物は、近くの同じ系統の群れに加わる
  const loose = [];
  for (const c of all) {
    if (!eligible(sim, c)) continue;
    if (c.band && S.bands[c.band] && S.bands[c.band].members.includes(c.id)) continue;
    c.band = null;
    const fam = famOf(c);
    let best = null, bd = 14;
    for (const band of Object.values(S.bands)) {
      if (band.fam !== fam || band.members.length >= MAX_BAND) continue;
      if (c.lair != null && band.lair === c.lair) { best = band; break; }
      const b = bandBase(sim, band), d = Math.hypot(b.x - c.home.x, b.z - c.home.z);
      if (d < bd) { bd = d; best = band; }
    }
    if (best) { best.members.push(c.id); c.band = best.id; }
    else loose.push(c);
  }
  // 残った者どうしで新しい群れを作る（同じ巣、または近くにいる同じ系統）
  const used = new Set();
  for (const c of loose) {
    if (used.has(c.id)) continue;
    const fam = famOf(c);
    const grp = loose.filter((o) => !used.has(o.id) && famOf(o) === fam && (c.lair != null ? o.lair === c.lair : Math.hypot(o.home.x - c.home.x, o.home.z - c.home.z) < 12));
    if (grp.length < 2) continue;
    for (const o of grp) used.add(o.id);
    const band = createBand(sim, grp.slice(0, MAX_BAND));
    const b = bandBase(sim, band);
    sim.pushLog(`${sim.placeName(b.x, b.z)}で${FAM[fam].label}たちが「${band.name}」としてまとまった。`, 'event', [], b);
  }
  // 群れが空になったら消える
  for (const band of Object.values(S.bands)) if (!band.members.length) delete S.bands[band.id];
}

// 長が倒れたら跡目を決める
function succession(sim, band) {
  const S = sim.S, R = sim.rng;
  const ms = bandMembers(sim, band).sort((a, b) => power(b) - power(a));
  const base = bandBase(sim, band);
  const where = sim.placeName(base.x, base.z);
  if (!ms.length) return;
  const top = ms[0], second = ms[1];
  if (!second || power(second) / power(top) < 0.75 || ms.length < 3) {
    band.leader = top.id; band.loyalty = Math.max(20, band.loyalty - 10);
    sim.pushLog(`${where}の「${band.name}」で、${top.name}が新しい${chiefTitle(band)}になった。`, 'event', [], base);
    if (ms.length >= 4) sim.news(`「${band.name}」の${chiefTitle(band)}が倒れ、${top.name}が跡を継いだ`, 1, base);
    return;
  }
  // 跡目争い
  const pTop = power(top) / (power(top) + power(second));
  const winner = R.chance(pTop) ? top : second, loser = winner === top ? second : top;
  band.leader = winner.id; band.loyalty = 40;
  band.succession = (band.succession || 0) + 1;
  S.demonArmy.stats = S.demonArmy.stats || {};
  S.demonArmy.stats.succession = (S.demonArmy.stats.succession || 0) + 1;
  if (R.chance(0.4) || ms.length < 4) {
    killCreature(sim, loser, winner);
    sim.news(`${where}の「${band.name}」で跡目争い。${winner.name}が${loser.name}を討ち、新しい${chiefTitle(band)}となった`, 2, base);
    sim.chron(`${where}の${FAM[band.fam].label}「${band.name}」で跡目争いが起き、${winner.name}が${chiefTitle(band)}の座を得た`);
  } else {
    // 敗れた方が一党を率いて出ていく（群れの分裂）
    const rest = ms.filter((c) => c !== winner && c !== loser);
    const n = Math.max(1, Math.floor(rest.length / 3));
    const followers = R.shuffle(rest.slice()).slice(0, n);
    const home = findNewHome(sim, base, band.fam);
    if (!home) { killCreature(sim, loser, winner); sim.news(`「${band.name}」の跡目争いで、${loser.name}が討たれた`, 2, base); return; }
    const out = [loser, ...followers];
    band.members = band.members.filter((id) => !out.some((c) => c.id === id));
    const nb = createBand(sim, out, { fam: band.fam, leader: loser, loyalty: 70, lair: home.lair, camp: { x: home.x, z: home.z }, rebel: band.rebel });
    relocate(sim, nb, home);
    const dest = home.lair != null ? sim.building(home.lair).name : sim.placeName(home.x, home.z);
    sim.news(`${where}の「${band.name}」で跡目争い。敗れた${loser.name}は${out.length}体を連れて去り、${dest}で「${nb.name}」を名乗った`, 2, base);
    sim.chron(`${FAM[band.fam].label}の「${band.name}」が跡目争いで割れ、${loser.name}が「${nb.name}」を興した`);
  }
}

// 群れの気風：勝てば忠誠が上がり、長より強い者がいると下剋上の気配
function bandMood(sim, band) {
  const ms = bandMembers(sim, band);
  const lead = sim.S.creatures[band.leader];
  band.loyalty += (60 - band.loyalty) * 0.05;
  if (lead) {
    const rival = ms.filter((c) => c !== lead).sort((a, b) => power(b) - power(a))[0];
    if (rival && power(rival) > power(lead) * 1.2) band.loyalty -= 3;
    if (rival && band.loyalty < 20 && ms.length >= 4 && sim.rng.chance(0.3)) {
      const base = bandBase(sim, band);
      sim.pushLog(`「${band.name}」で${rival.name}が${chiefTitle(band)}の${lead.name}に牙をむいた（下剋上）。`, 'event', [], base);
      // 下剋上：いったん長を空位にして跡目争いへ
      if (sim.rng.chance(power(rival) / (power(rival) + power(lead)))) { killCreature(sim, lead, rival); band.leader = null; succession(sim, band); }
      else { killCreature(sim, rival, lead); band.loyalty = 55; sim.news(`「${band.name}」の${chiefTitle(band)}${lead.name}が、下剋上をたくらんだ${rival.name}を返り討ちにした`, 1, base); }
    }
  }
  band.loyalty = Math.max(0, Math.min(100, band.loyalty));
}

// ---------- 縄張り争い ----------
function turfWars(sim) {
  const S = sim.S, R = sim.rng;
  const bands = Object.values(S.bands).filter((b) => b.members.length >= 2 && sim.today - b.lastWar >= 6);
  const pairs = [];
  for (let i = 0; i < bands.length; i++) for (let j = i + 1; j < bands.length; j++) {
    const a = bands[i], b = bands[j];
    if (a.fam === b.fam) continue;
    const pa = bandBase(sim, a), pb = bandBase(sim, b), d = Math.hypot(pa.x - pb.x, pa.z - pb.z);
    if (d < 30) pairs.push({ a, b, d });
  }
  if (!pairs.length) return;
  const pr = R.pick(pairs);
  // 近いほど、どちらかの群れが大きいほど争いになりやすい
  const chance = 0.18 * (1 - pr.d / 40) * (1 + Math.max(pr.a.members.length, pr.b.members.length) / 8);
  if (!R.chance(chance)) return;
  fight(sim, pr.a, pr.b);
}
function bandStrength(sim, band) {
  return bandMembers(sim, band).reduce((s, c) => s + power(c), 0) * (0.8 + band.loyalty / 250);
}
function fight(sim, A, B) {
  const S = sim.S, R = sim.rng;
  if (bandMembers(sim, A).some((c) => c.raid) || bandMembers(sim, B).some((c) => c.raid)) return;
  A.lastWar = B.lastWar = sim.today;
  const sa = bandStrength(sim, A) * R.range(0.7, 1.3), sb = bandStrength(sim, B) * R.range(0.7, 1.3);
  const win = sa >= sb ? A : B, lose = win === A ? B : A;
  const decisive = Math.max(sa, sb) > Math.min(sa, sb) * 1.6;
  const pa = bandBase(sim, A), pb = bandBase(sim, B);
  const mid = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
  const wm = bandMembers(sim, win), lm = bandMembers(sim, lose);
  // 犠牲：負けた側は1〜3体、勝った側もときどき1体
  const lossN = Math.min(lm.length, 1 + (decisive ? 1 : 0) + (R.chance(0.3) ? 1 : 0));
  const victims = lm.filter((c) => c.id !== lose.leader).sort((a, b) => power(a) - power(b)).slice(0, lossN);
  if (victims.length < lossN && lm.length <= lossN) victims.push(...lm.filter((c) => !victims.includes(c)).slice(0, lossN - victims.length));
  for (const v of victims) killCreature(sim, v, R.pick(wm));
  let wLoss = 0;
  if (wm.length > 2 && R.chance(decisive ? 0.15 : 0.45)) { const v = wm.filter((c) => c.id !== win.leader).sort((a, b) => power(a) - power(b))[0]; if (v) { killCreature(sim, v, R.pick(lm.filter((c) => S.creatures[c.id]).concat(wm).filter((c) => c !== v))); wLoss = 1; } }
  win.wins++; lose.losses++;
  win.loyalty = Math.min(100, win.loyalty + 12); lose.loyalty = Math.max(0, lose.loyalty - 15);
  // 勝った群れは大きくなる（捕虜・倒れた者が骸兵として起きる・噂を聞いた同族が集まる）
  const count = {};
  for (const c of Object.values(S.creatures)) count[c.sp] = (count[c.sp] || 0) + 1;
  const base = FAM[win.fam].base, wb = bandBase(sim, win);
  let grown = 0;
  const gain = decisive ? 2 : 1;
  for (let i = 0; i < gain; i++) {
    if (win.members.length >= MAX_BAND || (count[base] || 0) >= (SP_CAP[base] || 10)) break;
    const p = sim.randomNear(wb.x, wb.z, 3);
    if (!p) break;
    const c = makeCreature(sim, base, p.x, p.z, { lair: win.lair, hx: wb.x, hz: wb.z, range: 7, lv: R.int(1, 3), age: 0 });
    if (c.hp <= 0) continue;
    if (c.inDungeon) { c.inDungeon = false; c.pos = { x: p.x, z: p.z }; }
    c.role = 'member'; c.band = win.id; win.members.push(c.id); count[base] = (count[base] || 0) + 1; grown++;
  }
  const how = { undead: '倒れた者が骸兵として起き上がり', goblin: '噂を聞いた同族が集まり', orc: '噂を聞いた同族が集まり', spider: '巣に新しい子が孵り', mummy: '眠っていた棺が開き', demon: '流れ者が加わり' }[win.fam];
  const n = victims.length + wLoss;
  S.demonArmy.stats = S.demonArmy.stats || {};
  S.demonArmy.stats.turf = (S.demonArmy.stats.turf || 0) + 1;
  sim.news(`${sim.placeName(mid.x, mid.z)}で「${A.name}」（${FAM[A.fam].label}）と「${B.name}」（${FAM[B.fam].label}）が縄張りを争い、「${win.name}」が勝った（${n}体が倒れた）${grown ? `。${how}群れは${win.members.length}体に` : ''}`, 2, mid);
  // 近くの町の人が、魔物どうしの争いの声を聞く
  const town = S.world.settlements.slice().sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z))[0];
  if (town && Math.hypot(town.x - mid.x, town.z - mid.z) < 40) {
    const hear = sim.living().filter((p) => p.s === town.id && sim.isAdult(p));
    for (let i = 0; i < 3 && hear.length; i++) sim.remember(R.pick(hear), `${sim.placeName(mid.x, mid.z)}の方から、魔物どうしが争う叫び声が聞こえた`, { emo: -0.3, imp: 0.4, k: 'monster' });
  }
  // 負けた群れが1体以下になったら滅び、巣は奪われる
  const rest = bandMembers(sim, lose);
  if (rest.length <= 1) {
    for (const c of rest) { c.band = null; c.role = 'loner'; }
    lose.members = [];
    const took = lose.lair != null && (win.lair == null || R.chance(0.3)) && !(win.rebel && lose.lair === S.demon?.castle);
    if (took) {
      const b = sim.building(lose.lair);
      relocate(sim, win, { lair: lose.lair, x: b.door.x, z: b.door.z });
      sim.chron(`「${win.name}」が「${lose.name}」を滅ぼし、${b.name}を奪った`);
    } else sim.chron(`${FAM[lose.fam].label}の「${lose.name}」が「${win.name}」に滅ぼされた`);
    delete S.bands[lose.id];
  }
}

// ---------- 魔王軍の指揮系統 ----------
function lordOf(sim) { const D = sim.S.demon; return D && sim.S.creatures[D.lordId]; }
function generalsAlive(sim) {
  const S = sim.S, DA = S.demonArmy;
  return Object.values(DA.generals).filter((g) => alive(S, S.creatures[g.cid]));
}
function appointGeneral(sim, reason) {
  const S = sim.S, R = sim.rng, DA = S.demonArmy, D = S.demon, w = S.world;
  const used = new Set(Object.values(DA.generals).map((g) => g.name).concat(DA.fallen || []));
  const nm = GEN_NAMES.find((n) => !used.has(n)) || R.pick(GEN_NAMES) + DA.seq;
  // 進化や侵攻で生まれた名もなき魔将がいれば取り立て、いなければ魔族兵から昇格させる
  let c = Object.values(S.creatures).find((x) => x.sp === 'demongeneral' && x.hp > 0 && !x.general && !x.rebel && !x.occupier);
  let from = '';
  if (!c) {
    const sol = Object.values(S.creatures).filter((x) => x.sp === 'demonsoldier' && x.hp > 0 && !x.rebel && !x.raid && !x.occupier && !x.band).sort((a, b) => b.lv - a.lv)[0];
    const p = sol ? { x: sol.pos.x, z: sol.pos.z } : sim.randomNear(w.demon.x, w.demon.z, 6, (t) => t === T.WASTE);
    if (!p) return null;
    if (sol) { killQuiet(sim, sol); from = '魔族兵から'; }
    c = makeCreature(sim, 'demongeneral', p.x, p.z, { hx: w.demon.x, hz: w.demon.z, range: 8, lv: 1 + Math.floor(D.power / 50), role: 'aide' });
    if (c.hp <= 0) return null;
  }
  const id = 'g' + DA.seq++;
  const epi = R.pick(GEN_EPI);
  c.title = `${epi}魔将${nm}`; c.general = id; c.role = 'aide'; c.raid = null; c.range = 8;
  applyStats(c); c.hp = c.maxhp;
  const g = { id, cid: c.id, name: nm, title: c.title, front: null, loyalty: R.int(55, 85), ambition: R.range(0.1, 0.9), wins: 0, losses: 0, since: sim.today, lastCampaign: sim.today - R.int(0, 6), campaign: null };
  DA.generals[id] = g;
  DA.lastAppoint = sim.today;
  sim.news(`${D.name}が${from}${c.title}を取り立てた${reason ? `（${reason}）` : ''}`, 2, c.pos);
  return g;
}
// 名簿から静かに消す（昇格のため）
function killQuiet(sim, c) { delete sim.S.creatures[c.id]; sim.events.push({ type: 'cdied', id: c.id }); c.hp = 0; }

// 作戦会議：どの国・町を攻めるかを、国の強さと過去の敗北の記憶から決める
function council(sim) {
  const S = sim.S, R = sim.rng, DA = S.demonArmy, D = S.demon, w = S.world;
  DA.lastCouncil = sim.today;
  const fighters = {};
  for (const p of sim.living()) if (FIGHTER_JOBS.has(p.job)) { const k = sim.town(p.s).kingdom; fighters[k] = (fighters[k] || 0) + 1; }
  const occupied = w.settlements.filter((s) => S.towns[s.id].occupied);
  const scored = w.settlements.filter((s) => !S.towns[s.id].occupied).map((s) => {
    const mem = DA.memory[s.id] || { defeats: 0, wins: 0 };
    const d = Math.hypot(s.x - w.demon.x, s.z - w.demon.z);
    const near = occupied.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 35) ? 12 : 0;
    const cap = s.type === 'capital' ? (D.power > 160 ? 8 : -25) : 0;
    const score = -d * 0.8 - (fighters[s.kingdom] || 0) * 0.5 - mem.defeats * 14 + near + cap + R.range(0, 12);
    return { s, score, mem };
  }).sort((a, b) => b.score - a.score);
  if (!scored.length) return;
  const prev = DA.plan;
  const kid = scored[0].s.kingdom;
  const targets = scored.filter((x) => x.s.kingdom === kid).slice(0, 3).map((x) => x.s.id);
  const others = scored.filter((x) => !targets.includes(x.s.id)).slice(0, 3).map((x) => x.s.id);
  const gens = generalsAlive(sim).filter((g) => !S.creatures[g.cid].occupier);
  const tlist = targets.concat(others);
  gens.forEach((g, i) => { g.front = tlist[i % tlist.length]; });
  const avoided = prev && prev.kingdom !== kid && (prev.targets || []).some((sid) => (DA.memory[sid]?.defeats || 0) > 0);
  const kname = S.kingdoms[kid]?.name || '人間の国';
  const reason = avoided ? `${S.kingdoms[prev.kingdom]?.name}での敗北を踏まえ、矛先を変えた` : prev && prev.kingdom === kid ? '攻めを続ける' : '守りの手薄な国から攻める';
  DA.plan = { kingdom: kid, targets, since: sim.today, reason };
  const lord = lordOf(sim);
  const fronts = gens.map((g) => `${g.name}→${sim.town(g.front).name}`).join('、');
  sim.pushLog(`魔王城で作戦会議。${D.name}は${kname}攻めを命じた（${reason}）${fronts ? `。前線：${fronts}` : ''}。伝令のインプが各地の魔将のもとへ走った。`, 'event', [], lord?.pos || w.demon);
  if (!prev || prev.kingdom !== kid) {
    sim.news(`魔王軍の矛先が${kname}に向いたらしい——斥候がそう伝えた`, 3, sim.town(targets[0]));
    sim.chron(`${D.name}は作戦会議で${kname}攻めを決めた（${reason}）`);
    // 人間側：狙われた国の王に知らせが届く（警戒の度合いは kingdom.demonAlert に書く）
    for (const k of S.kingdoms) {
      const hit = k.id === kid;
      k.demonAlert = hit ? { level: 2 + (avoided ? 1 : 0), targets: targets.slice(), since: sim.today } : (k.demonAlert && k.demonAlert.level > 1 ? { level: 1, targets: [], since: sim.today } : k.demonAlert || null);
      const king = S.people[k.kingId];
      if (hit && king && king.deathYear == null) sim.remember(king, `魔王軍が我が${k.name}を狙っているとの報せが届いた`, { emo: -0.8, imp: 0.9, k: 'demon' });
    }
    for (const sid of targets) for (const p of sim.living()) if (p.s === sid && R.chance(0.3)) sim.remember(p, `魔王軍が次はこの町を狙うという噂を聞いた`, { emo: -0.6, imp: 0.6, k: 'demon' });
  }
}

// 魔将の出陣：城の兵を率いて担当の前線を攻める（兵は城にいる者から連れていく）
function campaign(sim, g) {
  const S = sim.S, R = sim.rng, D = S.demon, w = S.world;
  const c = S.creatures[g.cid];
  if (!c || c.occupier != null || c.raid || g.front == null || S.towns[g.front]?.occupied) return;
  const target = sim.town(g.front);
  const idle = Object.values(S.creatures).filter((x) => SPECIES[x.sp].kind === 'demon' && x.hp > 0 && !x.dormant && !x.raid && !x.rebel && !x.general && x.occupier == null && x.sp !== 'demonlord' && !x.band && Math.hypot(x.pos.x - w.demon.x, x.pos.z - w.demon.z) < 22);
  const want = Math.min(5, 2 + Math.floor(D.power / 70));
  const troops = idle.sort((a, b) => b.lv - a.lv).slice(0, want);
  if (troops.length < 2) { sim.pushLog(`${c.name}は兵が足りず、出陣を見送った。`, 'event', [], c.pos); g.lastCampaign = sim.today - 4; return; }
  g.lastCampaign = sim.today;
  const until = S.t + 60 * 36;
  for (const x of [c, ...troops]) { x.raid = target.id; x.raidUntil = until; x.path = null; x.goal = null; }
  c.role = 'leader'; for (const x of troops) { x.role = 'raider'; x.leader = c.id; }
  g.campaign = { sid: target.id, start: sim.today, until, troops: troops.map((x) => x.id) };
  const town = S.towns[target.id];
  if (town.threat && S.t < town.threat.until) { town.threat.by.push(c.id, ...troops.map((x) => x.id)); town.threat.until = Math.max(town.threat.until, S.t + 60 * 40); }
  else town.threat = { until: S.t + 60 * 40, since: S.t, by: [c.id, ...troops.map((x) => x.id)] };
  sim.news(`${c.name}率いる魔王軍（${troops.length + 1}体）が${target.name}へ出陣した！`, 3, c.pos);
  for (const p of sim.living()) if (p.s === target.id) sim.remember(p, `${c.name}の軍勢が町に向かっているという知らせを聞いた`, { emo: -0.9, imp: 0.8, k: 'demon' });
}

function endCampaign(sim, g, alive_) {
  const S = sim.S, DA = S.demonArmy, R = sim.rng, D = S.demon;
  const sid = g.campaign.sid, won = !!S.towns[sid]?.occupied;
  const mem = DA.memory[sid] = DA.memory[sid] || { defeats: 0, wins: 0 };
  g.campaign = null;
  const t = sim.town(sid);
  const gc = S.creatures[g.cid];
  if (gc && gc.occupier == null) { gc.role = 'aide'; gc.raid = null; }
  if (won) {
    mem.wins++; g.wins++; DA.wins++; g.loyalty = Math.min(100, g.loyalty + 12);
    sim.pushLog(`${g.title}が${t.name}攻めの手柄を${D.name}に報告した。`, 'event', [], t);
    return;
  }
  mem.defeats++; DA.recentLoss += 1;
  if (!alive_) return; // 討ち死には別に扱う
  g.losses++;
  sim.pushLog(`${g.title}は${t.name}を落とせず、魔王城へ引き返した。`, 'event', [], t);
  punish(sim, g);
}
// 失敗した魔将への処罰
function punish(sim, g) {
  const S = sim.S, R = sim.rng, D = S.demon, DA = S.demonArmy;
  const c = S.creatures[g.cid], lord = lordOf(sim);
  if (!c) return;
  const others = generalsAlive(sim).filter((x) => x !== g);
  if (g.losses >= 2 && R.chance(0.45) && lord && lord.hp > 0) {
    // 処刑
    killCreature(sim, c, lord);
    DA.fallen = (DA.fallen || []).concat(g.name);
    delete DA.generals[g.id];
    for (const o of others) o.loyalty += o.ambition > 0.6 ? -8 : 5; // 野心家は反発し、ほかは恐れて従う
    sim.news(`${D.name}は、敗戦を重ねた${g.title}をみずから処刑した`, 3, lord.pos);
    sim.chron(`${D.name}が敗戦の責めを負わせ、${g.title}を処刑した`);
    DA.stats.punish = (DA.stats.punish || 0) + 1;
  } else if (g.losses >= 2 && R.chance(0.4)) {
    // 位を剥奪
    c.title = null; c.general = null; c.role = 'castleguard'; applyStats(c);
    DA.fallen = (DA.fallen || []).concat(g.name);
    delete DA.generals[g.id];
    sim.news(`${g.title}は敗戦の責めで魔将の位を剥奪された`, 2, c.pos);
    DA.stats.punish = (DA.stats.punish || 0) + 1;
  } else {
    g.loyalty -= 12 + g.ambition * 10;
    sim.pushLog(`${D.name}は玉座の間で${g.title}を激しく叱責した。`, 'event', [], lord?.pos || c.pos);
  }
}

// 魔将の離反：魔王が弱ると、野心のある魔将は兵を連れて独立する
function defect(sim, g, why) {
  const S = sim.S, R = sim.rng, D = S.demon, DA = S.demonArmy, w = S.world;
  const c = S.creatures[g.cid];
  if (!c) return;
  delete DA.generals[g.id];
  DA.fallen = (DA.fallen || []).concat(g.name);
  DA.stats.defect = (DA.stats.defect || 0) + 1;
  const idle = Object.values(S.creatures).filter((x) => SPECIES[x.sp].kind === 'demon' && x.hp > 0 && !x.dormant && !x.general && !x.rebel && x.occupier == null && x.sp !== 'demonlord' && !x.band && (g.campaign?.troops.includes(x.id) || Math.hypot(x.pos.x - c.pos.x, x.pos.z - c.pos.z) < 15));
  const n = Math.min(idle.length, 1 + Math.floor(g.ambition * 3) + (g.loyalty < 10 ? 1 : 0));
  const men = R.shuffle(idle.slice()).slice(0, n);
  const all = [c, ...men];
  const home = findNewHome(sim, w.demon, 'demon', 22, 45) || findNewHome(sim, c.pos, 'demon', 12, 30);
  for (const x of all) { x.rebel = true; x.general = null; x.raid = null; x.occupier = null; x.role = 'member'; }
  c.title = `叛将${g.name}`; applyStats(c);
  const band = createBand(sim, all, { fam: 'demon', leader: c, loyalty: 75, lair: null, camp: home ? { x: home.x, z: home.z } : { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, rebel: true, name: `${g.name}の叛軍` });
  if (home) relocate(sim, band, home);
  sim.news(`${g.title}が${D.name}に背き、${all.length}体を率いて独立した！（${why}）`, 3, c.pos);
  sim.chron(`${g.title}が${D.name}に背いて離反し、「${band.name}」を興した`);
}

// 魔王が弱っているかどうか（0〜1）
function lordWeakness(sim) {
  const S = sim.S, DA = S.demonArmy, lord = lordOf(sim);
  const hpr = lord ? Math.min(lord.hp / lord.maxhp, DA.lordLow ?? 1) : 0;
  const occ = S.world.settlements.filter((s) => S.towns[s.id].occupied).length;
  return Math.max(0, Math.min(1, (1 - hpr) * 0.9 + DA.recentLoss * 0.12 - occ * 0.1 - DA.wins * 0.03));
}

function demonArmyDaily(sim) {
  const S = sim.S, R = sim.rng, D = S.demon, DA = S.demonArmy;
  if (!D) return;
  DA.stats = DA.stats || {};
  // 魔王が倒れた：残った魔将は散り散りになるか、独立する
  if (!D.active && DA.wasActive) {
    DA.wasActive = false;
    for (const g of generalsAlive(sim)) {
      if (g.ambition > 0.4 || R.chance(0.5)) defect(sim, g, '主を失い、自ら王を名乗った');
      else { const c = S.creatures[g.cid]; if (c) { c.general = null; c.role = 'castleguard'; } delete DA.generals[g.id]; sim.pushLog(`${g.title}は主を失い、魔界の奥へ姿を消した。`, 'event', [], c?.pos); }
    }
    DA.plan = null; DA.recentLoss = 0; DA.wins = 0;
    for (const k of S.kingdoms) k.demonAlert = null;
    return;
  }
  if (!D.active) { DA.lordLow = 1; return; }
  if (!DA.wasActive) { DA.wasActive = true; DA.lastAppoint = -99; }
  DA.recentLoss *= 0.93;
  // 死んだ魔将を名簿から外す（討ち死に）
  for (const g of Object.values(DA.generals)) {
    const c = S.creatures[g.cid];
    if (alive(S, c)) continue;
    if (g.campaign) endCampaign(sim, g, false);
    DA.fallen = (DA.fallen || []).concat(g.name);
    delete DA.generals[g.id];
    DA.recentLoss += 1.5;
    for (const o of generalsAlive(sim)) o.loyalty -= 4;
    sim.chron(`${g.title}が討たれ、魔王軍は将を一人失った`);
  }
  // 魔将を取り立てる（力が強いほど多く、最大3人）
  const want = Math.min(3, 1 + Math.floor(D.power / 70));
  if (generalsAlive(sim).length < want && sim.today - DA.lastAppoint >= 4) appointGeneral(sim, generalsAlive(sim).length ? '前線を広げるため' : '軍を率いる将として');
  // 作戦会議（5日ごと）
  if (sim.today - DA.lastCouncil >= 5 || !DA.plan) council(sim);
  // 出陣と帰還
  const weak = lordWeakness(sim);
  const lord = lordOf(sim);
  for (const g of generalsAlive(sim)) {
    const c = S.creatures[g.cid];
    if (g.campaign && (S.t > g.campaign.until + 60 * 6 || S.towns[g.campaign.sid]?.occupied || (!c.raid && S.t > g.campaign.until))) endCampaign(sim, g, true);
    if (!DA.generals[g.id]) continue;
    // 忠誠：勝てば上がり、魔王が弱ると下がる。野心家ほど揺らぐ
    g.loyalty += 1 - weak * 6 * (0.5 + g.ambition) + R.range(-1, 1);
    g.loyalty = Math.max(0, Math.min(100, g.loyalty));
    if (g.loyalty < 20 && R.chance(0.35)) { defect(sim, g, weak > 0.5 ? '魔王の力が衰えたと見て' : '度重なる叱責に耐えかねて'); continue; }
    if (weak > 0.6 && g.ambition > 0.65 && R.chance(0.12)) { defect(sim, g, '魔王が倒されかけたのを見て'); continue; }
    if (!g.campaign && !c.occupier && sim.today - g.lastCampaign >= 11 && sim.today - (D.lastRaid || 0) >= 3 && R.chance(0.5)) campaign(sim, g);
  }
  // 魔王が健在なら、叛軍を討ちに兵を出すことがある
  const rebels = Object.values(S.bands).filter((b) => b.rebel && b.members.length);
  if (rebels.length && lord && weak < 0.5 && sim.today - DA.lastPurge >= 7 && R.chance(0.3)) {
    DA.lastPurge = sim.today;
    const rb = R.pick(rebels), ms = bandMembers(sim, rb);
    const v = ms.filter((x) => x.id !== rb.leader).sort((a, b) => power(a) - power(b))[0] || (ms.length === 1 ? ms[0] : null);
    if (v) { killCreature(sim, v, lord); sim.news(`${D.name}の追討軍が「${rb.name}」を襲い、${v.name}を討ち取った`, 2, bandBase(sim, rb)); }
  }
  DA.lordLow = 1;
}

// ---------- 公開する関数 ----------
// 毎日：sim.newDay() の creatureDaily(this) のあと、politicsDaily(this) の前後どちらでもよい
export function monstersDaily(sim) {
  const S = sim.S;
  initMonsters(sim);
  rebuildBands(sim);
  for (const band of Object.values(S.bands)) {
    if (!band.members.length) continue;
    const lead = S.creatures[band.leader];
    if (!alive(S, lead) || lead.band !== band.id) succession(sim, band);
    else bandMood(sim, band);
  }
  for (const band of Object.values(S.bands)) if (!band.members.length) delete S.bands[band.id];
  turfWars(sim);
  demonArmyDaily(sim);
  // 役割と長の印をそろえる（creatures.js の electLeaders のあとに上書きする）
  for (const band of Object.values(S.bands)) {
    const ms = bandMembers(sim, band);
    for (const c of ms) {
      if (c.id === band.leader) { c.role = c.named ? 'treasure' : 'leader'; c.leader = null; }
      else { c.leader = band.leader; if (!['guardian', 'sentry', 'scout', 'member', 'raider'].includes(c.role)) c.role = c.lair != null ? 'guardian' : 'member'; }
      c.bandBounty = Math.round(Math.max(0, ms.length - 2) * 4 * (c.id === band.leader ? 3 : 1));
    }
  }
}

// 毎時（任意）：魔王が倒されかけたことを覚えておく。sim.newHour() の demonHourly(this) のあとで呼ぶ
export function monstersHourly(sim) {
  const S = sim.S, DA = S.demonArmy;
  if (!DA || !S.demon?.active) return;
  const lord = lordOf(sim);
  if (lord && lord.maxhp) DA.lordLow = Math.min(DA.lordLow ?? 1, lord.hp / lord.maxhp);
}

// 討伐依頼の上乗せ（guild.js 用）：大きな群れの一員、とくに長は報酬が上がる
export function bandBounty(sim, c) {
  if (!c || !c.band || !sim.S.bands?.[c.band]) return 0;
  return c.bandBounty || 0;
}

// 魔王軍の次の攻め先（politics.js の sendDemonRaid 用）。作戦がなければ null
export function demonTarget(sim) {
  const S = sim.S, DA = S.demonArmy;
  if (!DA?.plan) return null;
  const t = DA.plan.targets.map((sid) => sim.town(sid)).find((s) => s && !S.towns[s.id].occupied);
  return t || null;
}

// 詳細欄（ui.js 用）：生き物の所属を日本語で
export function monsterInfo(sim, c) {
  const S = sim.S;
  if (c.general && S.demonArmy?.generals[c.general]) {
    const g = S.demonArmy.generals[c.general];
    return `魔王軍の魔将（忠誠${Math.round(g.loyalty)}・${g.wins}勝${g.losses}敗${g.front != null ? `・担当：${sim.town(g.front).name}` : ''}）`;
  }
  const band = c.band && S.bands?.[c.band];
  if (!band) return c.rebel ? '魔王軍を離反した者' : '';
  const lead = S.creatures[band.leader];
  const pos = c.id === band.leader ? chiefTitle(band) : `一員（${chiefTitle(band)}：${lead ? lead.name : '空位'}）`;
  return `「${band.name}」の${pos}・${band.members.length}体・結束${Math.round(band.loyalty)}・${band.wins}勝${band.losses}敗`;
}
