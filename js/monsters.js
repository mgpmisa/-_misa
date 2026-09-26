// 魔物の政治：群れ（氏族）と跡目争い・縄張り争い、魔王軍の指揮系統（魔将・忠誠・離反・処罰・作戦会議）
// 状態：S.bands（群れ）、S.bandSeq、S.demonArmy（魔王軍の指揮系統）。どれも遅延初期化なので古いセーブでも動く。
// 生き物に足す印：c.band（群れid）、c.general（魔将id）、c.rebel（離反した魔王軍）
import { SPECIES } from './data.js';
import { killCreature, makeCreature, applyStats, townMask, buildGrid, around } from './creatures.js';
import { startFight } from './society.js';
import { T, W, H, walkable, tileAt, biomeOf } from './world.js';

// 食物連鎖の表は動物担当の fauna.js にある。まだつながっていなくても動くように、あとから読み込む
let FA = null;
import('./fauna.js').then((m) => { FA = m; }).catch(() => {});

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
// 数の目安は固定数でなく広さあたりの密度（160×160マスを1とした広さの倍率を掛ける）
const AREA = () => (W * H) / 25600;
const capOf = (sp) => Math.round((SP_CAP[sp] || 10) * AREA());
// どの魔物も絶滅しない最低数（160×160マスあたり）と、湧く場所
const MIN_DENS = { goblin: 5, orc: 3, skeleton: 4, mummy: 3, spider: 3, slime: 5, golem: 1, wyvern: 1, unicorn: 1, imp: 3 };
const SPRING = { goblin: ['cave'], skeleton: ['cave'], spider: ['cave'], mummy: ['pyramid'], golem: ['ruins'], slime: ['ruins'], imp: ['demoncastle'] };
const GEN_NAMES = ['ガルザーク', 'ベリアス', 'ヴォルグ', 'ザガン', 'モラクス', 'アンドラス', 'グシオン', 'バラム', 'マルバス', 'ハルファス', 'フォカロル', 'ナベリウス'];
const GEN_EPI = ['黒炎の', '鉄血の', '冷笑の', '千刃の', '沈黙の', '嵐の', '毒舌の', '双角の'];
const FIGHTER_JOBS = new Set(['knight', 'soldier', 'adventurer', 'wizard', 'general', 'royalguard', 'courtmage', 'warrior', 'archer', 'cleric', 'sage', 'paladin', 'guildmaster', 'watchman', 'guard']);

function stat(sim, k) { initMonsters(sim); const st = sim.S.demonArmy.stats = sim.S.demonArmy.stats || {}; st[k] = (st[k] || 0) + 1; }
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
  stat(sim, 'succession');
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
    if (win.members.length >= MAX_BAND || (count[base] || 0) >= capOf(base)) break;
    const p = sim.randomNear(wb.x, wb.z, 3);
    if (!p) break;
    const c = makeCreature(sim, base, p.x, p.z, { lair: win.lair, hx: wb.x, hz: wb.z, range: 7, lv: R.int(1, 3), age: 0 });
    if (c.hp <= 0) continue;
    if (c.inDungeon) { c.inDungeon = false; c.pos = { x: p.x, z: p.z }; }
    c.role = 'member'; c.band = win.id; win.members.push(c.id); count[base] = (count[base] || 0) + 1; grown++;
  }
  const how = { undead: '倒れた者が骸兵として起き上がり', goblin: '噂を聞いた同族が集まり', orc: '噂を聞いた同族が集まり', spider: '巣に新しい子が孵り', mummy: '眠っていた棺が開き', demon: '流れ者が加わり' }[win.fam];
  const n = victims.length + wLoss;
  stat(sim, 'turf');
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
  c.title = `${epi}魔将${nm}`; c.given = nm; c.general = id; c.role = 'aide'; c.raid = null; c.range = 8;
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
  const want = Math.min(6, 2 + Math.floor(D.power / 70) + (S.demonArmy.extraTroops || 0));
  const troops = idle.sort((a, b) => b.lv - a.lv).slice(0, want);
  if (troops.length < 2) { sim.pushLog(`${c.name}は兵が足りず、出陣を見送った。`, 'event', [], c.pos); g.lastCampaign = sim.today - 4; return; }
  g.lastCampaign = sim.today;
  const until = S.t + 60 * 36;
  for (const x of [c, ...troops]) { x.raid = target.id; x.raidUntil = until; x.path = null; x.goal = null; }
  c.role = 'leader'; for (const x of troops) { x.role = 'raider'; x.leader = c.id; }
  g.campaign = { sid: target.id, start: sim.today, until, troops: troops.map((x) => x.id), night: isNight(sim) };
  monsterSay(sim, c, 'attack', true);
  const town = S.towns[target.id];
  if (town.threat && S.t < town.threat.until) { town.threat.by.push(c.id, ...troops.map((x) => x.id)); town.threat.until = Math.max(town.threat.until, S.t + 60 * 40); }
  else town.threat = { until: S.t + 60 * 40, since: S.t, by: [c.id, ...troops.map((x) => x.id)] };
  sim.news(`${c.name}率いる魔王軍（${troops.length + 1}体）が${target.name}へ出陣した！`, 3, c.pos);
  for (const p of sim.living()) if (p.s === target.id) sim.remember(p, `${c.name}の軍勢が町に向かっているという知らせを聞いた`, { emo: -0.9, imp: 0.8, k: 'demon' });
}

function endCampaign(sim, g, alive_) {
  const S = sim.S, DA = S.demonArmy, R = sim.rng, D = S.demon;
  const sid = g.campaign.sid, won = !!S.towns[sid]?.occupied, wasNight = !!g.campaign.night;
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
  // 魔王は負けから学ぶ：昼に負ければ次は夜襲、兵を増やす
  if (!wasNight && !DA.nightPref) { DA.nightPref = true; sim.pushLog(`${D.name}「昼の攻めは人間どもに見抜かれる。次からは夜に攻めよ」`, 'event', [], lordOf(sim)?.pos); }
  DA.extraTroops = Math.min(2, (DA.extraTroops || 0) + 1);
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
    stat(sim, 'punish');
  } else if (g.losses >= 2 && R.chance(0.4)) {
    // 位を剥奪
    c.title = null; c.general = null; c.role = 'castleguard'; applyStats(c);
    DA.fallen = (DA.fallen || []).concat(g.name);
    delete DA.generals[g.id];
    sim.news(`${g.title}は敗戦の責めで魔将の位を剥奪された`, 2, c.pos);
    stat(sim, 'punish');
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
  stat(sim, 'defect');
  const idle = Object.values(S.creatures).filter((x) => SPECIES[x.sp].kind === 'demon' && x.hp > 0 && !x.dormant && !x.general && !x.rebel && x.occupier == null && x.sp !== 'demonlord' && !x.band && (g.campaign?.troops.includes(x.id) || Math.hypot(x.pos.x - c.pos.x, x.pos.z - c.pos.z) < 15));
  const n = Math.min(idle.length, 1 + Math.floor(g.ambition * 3) + (g.loyalty < 10 ? 1 : 0));
  const men = R.shuffle(idle.slice()).slice(0, n);
  const all = [c, ...men];
  const home = findNewHome(sim, w.demon, 'demon', 22, 45) || findNewHome(sim, c.pos, 'demon', 12, 30);
  for (const x of all) { x.rebel = true; x.general = null; x.raid = null; x.occupier = null; x.role = 'member'; }
  c.title = `叛将${g.name}`; applyStats(c);
  const band = createBand(sim, all, { fam: 'demon', leader: c, loyalty: 75, lair: null, camp: home ? { x: home.x, z: home.z } : { x: Math.round(c.pos.x), z: Math.round(c.pos.z) }, rebel: true, name: `${g.name}の叛軍` });
  if (home) relocate(sim, band, home);
  const lordName = D.active ? D.name : DA.lordName || D.name;
  sim.news(D.active ? `${g.title}が${lordName}に背き、${all.length}体を率いて独立した！（${why}）` : `${lordName}亡き後、${g.title}が${all.length}体を率いて独立した（${why}）`, 3, c.pos);
  sim.chron(`${g.title}が${D.active ? `${lordName}に背いて離反し` : `${lordName}の死後に自立し`}、「${band.name}」を興した`);
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
  DA.lordName = D.name;
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
    if (!g.campaign && !g.pending && !c.occupier && sim.today - g.lastCampaign >= 11 && sim.today - (D.lastRaid || 0) >= 3 && R.chance(0.5)) {
      if (DA.nightPref) g.pending = true; else campaign(sim, g);
    }
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

// =====================================================================
// 魔物の暮らし：名前・家族・住処・飢え・序列・知能・種族語・賢い戦い方・敗北の学習・恨みと報復
// 個体の印（動物担当 fauna.js と同じ形）：c.given（名前）、c.sex、c.mate、c.parents、c.young（子のid配列）、
//   c.home（{x,z,bld?}）、c.hunger（0〜100、100が満腹）、c.rank（群れの序列、1が長）、c.intel（知能0〜1）
// 群れの印：band.stock（巣の食料）、band.lessons（敗北の記憶）、band.grudge（恨み）、band.war（大群の攻め込み）
// =====================================================================

// 知能：種の基本値（階級が上がるほど賢い）
const INTEL = {
  slime: 0.08, bigslime: 0.14, kingslime: 0.35, unicorn: 0.55, golem: 0.2,
  goblin: 0.4, hobgoblin: 0.5, goblinlord: 0.75, orc: 0.35, orcking: 0.65,
  skeleton: 0.25, skelknight: 0.45, lich: 0.95, mummy: 0.3, pharaoh: 0.85,
  spider: 0.3, arachne: 0.7, wyvern: 0.45, dragon: 0.95,
  imp: 0.45, demonsoldier: 0.5, demongeneral: 0.85, demonlord: 1,
};
export function intelOf(c) {
  const base = INTEL[c.sp] ?? (SPECIES[c.sp]?.monster ? 0.3 : 0.1);
  return Math.min(1, base + (c.lv || 1) * 0.01 + (c.general ? 0.05 : 0));
}
// 名前のつくり（種族らしい音）
const NAME_PARTS = {
  goblin: [['グル', 'ズギ', 'ガブ', 'ニグ', 'ラク', 'ボギ', 'ギズ', 'ドゥグ', 'スニ'], ['ガ', 'ク', 'ズ', 'ブ', 'ッグ', 'ギ', 'ル', '']],
  orc: [['ボル', 'ガル', 'ウル', 'グロ', 'マシュ', 'ドゥル', 'ラグ', 'ザグ', 'ゴル'], ['ゾグ', 'ナク', 'ガシュ', 'ドゥム', 'バク', 'ルグ', 'ック']],
  spider: [['シャ', 'キ', 'リ', 'ス', 'ナ', 'ヴィ'], ['リラ', 'ルル', 'シス', 'ラ', 'キキ', 'ネア']],
  slime: [['プル', 'ポヨ', 'ムニ', 'ペト', 'ぷる', 'トロ'], ['ン', 'ポ', 'リ', 'ル', '']],
  demon: [['バル', 'ゼギ', 'モル', 'ヴァ', 'ラズ', 'ク', 'グリ', 'ネビ'], ['ラス', 'ゴス', 'ザ', 'ト', 'エル', 'ム']],
  mummy: [['アメン', 'ネフ', 'セト', 'ケト', 'ラー', 'ティ', 'メル'], ['ホテプ', 'ネト', 'カー', 'ラ', 'メス', 'アンク']],
  dragon: [['ヴァル', 'ゾル', 'ファ', 'ニル', 'ドラ', 'グラ'], ['グリム', 'ヴァス', 'ニール', 'ゴン', 'ザード']],
  unicorn: [['シル', 'エル', 'ミ', 'アリ', 'ルナ'], ['ヴァ', 'リエル', 'ミア', 'ナ']],
  golem: [['石守り', '古き番人', '苔むす', '刻印の'], ['一号', '二号', '三号', '']],
};
const PAST_NAMES = ['ハインツ', 'エルマー', 'ゲルト', 'オットー', 'ヴィルマ', 'アグネス', 'ルドルフ', 'クラウス', 'ベルタ', 'ディーター', 'イルゼ', 'ヨアヒム'];
function nameStyle(sp) {
  const f = FAMILY[sp];
  if (f === 'undead') return 'undead';
  if (f) return f;
  if (['slime', 'bigslime', 'kingslime'].includes(sp)) return 'slime';
  if (SPECIES[sp]?.kind === 'demon') return 'demon';
  if (sp === 'wyvern' || sp === 'dragon') return 'dragon';
  return NAME_PARTS[sp] ? sp : 'demon';
}
function makeName(sim, c) {
  const R = sim.rng, st = nameStyle(c.sp);
  if (c.title) { const n = c.title.replace(/^.*(竜|魔将|叛将|魔王|の)/, ''); if (n) return n; }
  if (st === 'undead') return `${R.pick(PAST_NAMES)}の骸`;
  const [a, b] = NAME_PARTS[st];
  return R.pick(a) + R.pick(b);
}
// 家族を持つ系統（不死者・ゴーレム・魔王軍は持たない）
const HAS_FAMILY = new Set(['goblin', 'orc', 'spider', 'slime', 'dragon', 'unicorn']);
const GROW_DAYS = 10;
// 夜は住処で眠る種（昼に動く）。不死者・蜘蛛・ゴブリン・魔族は夜も動く
const DIURNAL = new Set(['orc', 'orcking', 'slime', 'bigslime', 'kingslime', 'unicorn', 'golem', 'wyvern']);
const PREY_SP = new Set(['deer', 'boar', 'rabbit', 'squirrel', 'camel', 'reindeer', 'penguin', 'monkey', 'rat', 'frog', 'turtle', 'crow']);
// 食物連鎖（fauna.js があればその表、なければ控えめな自前の表）
function preyList(sp) {
  if (FA) return FA.preyFor(sp);
  return SPECIES[sp].diet === 'none' || SPECIES[sp].diet === 'grass' ? [] : [...PREY_SP];
}
function canEat(sim, c, o, desperate) {
  if (o.owner != null || o.hp <= 0 || o.dormant) return false;
  if (FA) return FA.canHunt(sim, c.sp, o.sp, desperate);
  if (!PREY_SP.has(o.sp)) return false;
  return desperate || (sim._monCount?.[o.sp] || 0) > 4; // 安全弁：数の少ない獲物は狩らない
}
const meals = (sp) => Math.max(1, Math.round((FA ? FA.foodValue(sp) : 6) / 5));
function forage(sim, c, units) { // 草・木の実をあさる（スライム・ゴブリン・蜘蛛の虫など）
  const base = FA ? (FA.FOOD_WEB[c.sp]?.base || []) : (SPECIES[c.sp].diet === 'grass' ? ['plant'] : []);
  for (const k of base) {
    if (k !== 'plant' && k !== 'nuts') { if (k === 'insect' && sim.rng.chance(0.5)) return 1; continue; }
    const got = FA ? FA.eatFrom(sim, c.pos.x, c.pos.z, k, units) : units * 0.6;
    if (got > 0.2) return got / units;
  }
  return 0;
}
const BACKLINE = new Set(['wizard', 'cleric', 'sage', 'archer', 'courtmage', 'priest']);
const eats = (c) => SPECIES[c.sp].diet !== 'none';
const isNight = (sim) => { const h = sim.hour(); return h >= 21 || h < 5; };

// ---------- 種族語 ----------
const TALK = {
  goblin: {
    alarm: ['グガ！ ニンゲン、クル！', 'ギッ！ ヒト、イル！ ミンナ、オコセ！', 'アッチ、ニンゲンノ ニオイ！'],
    attack: ['ガアア！ ヤッチマエ！', 'ギヒヒ、カコメ！ カコメ！', 'ツヨイノハ オレタチ！'],
    hurt: ['イテェ…！ イテェヨォ！', 'グッ…ヤラレタ…'], retreat: ['ニゲロ！ ツヨイ！ ニゲロー！', 'サガレ！ スニ モドレ！'],
    heal: ['クスリクサ、カム！ ゲンキ！', 'マテ、ナオス！'], call: ['ナカマ、コイ！ ココダ！', 'ピィーーッ！（指笛）'],
    hungry: ['ハラ…ヘッタ…', 'ニク、ナイ…', 'ヒツジ、ウマソウ…'], idle: ['オサ、ツヨイ！', 'キラキラ、アツメル。', 'ヨル、スキ。ヒカリ、キライ。'],
    council: ['ナカマ、コロサレタ！ ニンゲン、ユルサナイ！', 'ミンナデ イク！ ムラ、モヤス！', 'オサ、キメタ。コンヤ、ヤル！'],
    victory: ['ギャハハ！ カッタ！ カッタ！', 'エモノ、タクサン！'], young: ['オレモ、タタカウ！', 'オヤ、ドコ？'], focus: ['ヨワイノ、ネラエ！'], protect: ['ナカマ、マモル！'],
  },
  orc: {
    alarm: ['ブオッ！ ニンゲンダ！', 'ハナガ、ニオウ。ニンゲンノ チダ。'], attack: ['ブオオオ！ タタキツブセ！', 'ニク！ ニク！ ニクダ！', 'オークノ チカラ、ミセテヤル！'],
    hurt: ['グオッ！ ヤルナ…！'], retreat: ['クソッ、ヒクゾ！ マタ クル！', 'サガレ！ カズガ タリン！'], heal: ['キズ、ヤケ。サケ、ノメ。'],
    call: ['ブオオオーーッ！（角笛）', 'ミンナ アツマレ！'], hungry: ['ハラガ ヘッタ。ブタ、クイタイ。', 'エモノ、イナイ。ムラ、イク。'],
    idle: ['ツヨイヤツガ エライ。', 'オノ、トグ。'], council: ['キョウダイガ コロサレタ！ チニハ チヲ！', 'ブオオ！ ゼンブノ ブゾクデ イクゾ！'],
    victory: ['ブハハ！ ヨワイ ヨワイ！'], young: ['オレ、ハヤク オオキク ナル！'], focus: ['ホソイヤツカラ ツブセ！'], protect: ['キョウダイニ テヲ ダスナ！'],
  },
  undead: {
    alarm: ['カタ…カタカタ…', '（骨の鳴る音）'], attack: ['カタカタカタ！', 'ウ…ア…イキタ…モノ…'], hurt: ['（骨が砕ける音）'], retreat: ['カタ…カタ…（崩れるように退く）'],
    heal: ['（青白い灯がゆらめく）'], call: ['カタカタカタカタ！'], hungry: [], idle: ['……', 'カタ…'],
    council: ['カタ…カタカタ…（骸が一斉に向きを変えた）'], victory: ['（顎の骨が鳴った）'], young: [], focus: [], protect: [],
  },
  lich: {
    alarm: ['ほう……生者の匂いがするな', '愚かな。我が眠りを妨げるか'], attack: ['死の冷たさを知るがよい', '骸どもよ、起きよ。生者を迎えよ'],
    hurt: ['この身に傷を……！ 面白い'], retreat: ['退け、骸ども。今は引く時だ', '覚えておけ。死は待つことを知っている'],
    heal: ['闇よ、この骨に肉を戻せ', '倒れるな。まだ役目は終わっておらぬ'], call: ['眠れる骸どもよ、我がもとへ'], hungry: [],
    idle: ['百年など、瞬きにすぎぬ', '生きていた頃の名は……もう忘れた'], council: ['同胞の骨を砕いた者どもに、永い眠りを与えよう', '夜を待て。灯りが消えた刻に攻める'],
    victory: ['死は平等だ。ようこそ'], young: [], focus: ['祈り手から黙らせよ'], protect: ['我が僕に触れるな'],
  },
  mummy: {
    alarm: ['ウ…ウゥ…王ノ眠リヲ…', 'カエ…レ…'], attack: ['ノロイ…アレ…', 'ウアアア…'], hurt: ['（包帯が裂ける音）'], retreat: ['（砂の中へ沈むように退いた）'],
    heal: ['（香油の匂いが立ちこめる）'], call: ['ウオォォ…（地の底から響く声）'], hungry: [], idle: ['……王ハ…ドコ…'],
    council: ['王墓ヲ…荒ラス者ニ…呪イヲ…'], victory: ['ネムレ…'], young: [], focus: [], protect: [],
  },
  pharaoh: {
    alarm: ['墓を荒らす盗人どもめ', '跪け。王の御前であるぞ'], attack: ['ラーの名において、呪われよ！', '千年の呪いを受けるがよい'],
    hurt: ['王に刃を向けるとは……'], retreat: ['近衛よ、玉座を守れ。退くのだ'], heal: ['香油と祈りよ、王の僕を癒せ'], call: ['近衛の者ども、集え！'],
    hungry: [], idle: ['我が名はとこしえに刻まれている'], council: ['王墓を汚した者の町に、砂の嵐を'], victory: ['王に逆らう者の末路だ'], young: [], focus: ['祈る者から斬れ'], protect: ['王の僕に手を出すな'],
  },
  spider: {
    alarm: ['シュルルル…', 'キチキチキチ…'], attack: ['キシャアアッ！'], hurt: ['ギギッ！'], retreat: ['（糸を引いて闇へ逃げた）'], heal: [], call: ['キチキチキチキチ！'],
    hungry: ['シュル…（糸が空っぽだ）'], idle: ['（糸を張っている）'], council: ['キチキチ…（巣全体が震えた）'], victory: ['シュルル…（獲物を糸で包んだ）'], young: ['キ…キ…'], focus: [], protect: [],
  },
  arachne: {
    alarm: ['あら、迷い込んだ虫がいるわ', 'ふふ……糸が震えている'], attack: ['逃げても無駄よ。ここは私の巣'], hurt: ['よくも私の脚を……！'],
    retreat: ['子どもたち、奥へ退がりなさい'], heal: ['いい子ね、糸で傷を縛ってあげる'], call: ['子どもたち、集まりなさい'], hungry: ['お腹が空いたわね……村の方へ行こうかしら'],
    idle: ['美しい巣でしょう？'], council: ['私の子を殺した村……一匹残らず糸で包んであげる'], victory: ['ごちそうさま'], young: [], focus: ['まずは杖を持った子から'], protect: ['私の子に触れないで'],
  },
  slime: { alarm: ['ぷるっ！'], attack: ['ぽよーん！'], hurt: ['ぷしゅ……'], retreat: ['ぷるぷる（逃げた）'], heal: [], call: ['ぷるるるる！'], hungry: ['ぷ……（しぼんでいる）'], idle: ['ぷるん', 'ぽよ'], council: [], victory: ['ぷるん♪'], young: ['ぷ'], focus: [], protect: [] },
  demon: {
    alarm: ['ギギッ、人間ダ！', '魔王様ニ 知ラセロ！'], attack: ['魔王様ノ タメニ！', 'ヒャハハ！ 燃エロ！'], hurt: ['グギャッ！'], retreat: ['退ケ、退ケ！'], heal: ['闇ノ 力ヨ…'],
    call: ['増援ヲ 呼ベ！'], hungry: [], idle: ['魔界ノ 空ハ 赤イ。'], council: ['我ラガ 同胞ノ 仇ヲ！'], victory: ['魔王様ニ 栄光ヲ！'], young: [], focus: ['弱イ ヤツカラ 狙エ！'], protect: ['同胞ヲ 守レ！'],
  },
  general: {
    alarm: ['人間どもの斥候か。小賢しい', '魔王様の御名のもとに、ここは通さぬ'], attack: ['我が刃の錆となれ！', '全軍、かかれ！'], hurt: ['ほう……少しはやるな'],
    retreat: ['全軍、退け！ 態勢を立て直す', '今日のところは引いてやろう'], heal: ['回復の術を。まだ倒れるな'], call: ['伝令！ 後詰めを呼べ！'], hungry: [],
    idle: ['魔王様の御心は計り知れぬ', '次の戦は夜に仕掛けるべきだな'], council: ['同胞の死を無駄にはせぬ'], victory: ['見たか、これが魔王軍の力だ'], young: [], focus: ['後ろの術者を先に討て！'], protect: ['部下には指一本触れさせぬ'],
  },
  lord: {
    alarm: ['よく来たな、人間よ'], attack: ['我が前にひれ伏せ！', '絶望を教えてやろう'], hurt: ['この我に傷をつけるか……！'], retreat: [], heal: ['闇よ、我を満たせ'], call: ['将どもよ、我がもとへ！'],
    hungry: [], idle: ['世界は、いずれ我がものとなる'], council: ['前の戦の敗因を申せ'], victory: ['脆いものだな'], young: [], focus: [], protect: [],
  },
  dragon: {
    alarm: ['我が眠りを妨げるのは誰だ', '宝の匂いを嗅ぎつけたか、盗人め'], attack: ['我が宝に触れる者は灰となれ！', 'グオオオオ！'], hurt: ['小さき者が……よくも！'],
    retreat: ['……覚えておけ'], heal: [], call: ['グオオオオオ！（大地が震える咆哮）'], hungry: ['……羊の群れが恋しい'], idle: ['金貨の音は良い', '千年前の空も、こんな色だった'],
    council: [], victory: ['愚か者め'], young: [], focus: [], protect: ['我が子に触れるな！'],
  },
  unicorn: { alarm: ['（角が淡く光った）'], attack: ['（高くいなないた）'], hurt: ['（悲しげにいなないた）'], retreat: ['（森の奥へ駆け去った）'], heal: ['（角の光が傷をふさいだ）'], call: ['（澄んだいななきが森に響いた）'], hungry: [], idle: ['（静かにこちらを見つめている）', '（泉の水を飲んでいる）'], council: [], victory: [], young: ['（母のそばを離れない）'], focus: [], protect: ['（子の前に立ちはだかった）'] },
  golem: { alarm: ['シンニュウシャ…ハイジョ…'], attack: ['ハイジョ…ハイジョ…'], hurt: ['（石の欠ける音）'], retreat: [], heal: [], call: ['（刻印が赤く光った）'], hungry: [], idle: ['……マモル……', '（身じろぎもしない）'], council: [], victory: ['ハイジョ…カンリョウ'], young: [], focus: [], protect: [] },
  beast: { alarm: ['グルル…'], attack: ['ガアッ！'], hurt: ['ギャン！'], retreat: ['（身を翻して逃げた）'], heal: [], call: ['ウオオーン！'], hungry: ['グゥ…'], idle: ['…'], council: [], victory: ['ガウ'], young: [], focus: [], protect: [] },
};
function talkKey(c) {
  if (c.sp === 'demonlord') return 'lord';
  if (c.sp === 'demongeneral' || c.general) return 'general';
  if (c.sp === 'lich') return 'lich';
  if (c.sp === 'pharaoh') return 'pharaoh';
  if (c.sp === 'arachne') return 'arachne';
  if (c.sp === 'dragon' || c.sp === 'wyvern') return 'dragon';
  if (c.sp === 'unicorn') return 'unicorn';
  if (c.sp === 'golem') return 'golem';
  const st = nameStyle(c.sp);
  if (st === 'undead') return 'undead';
  return TALK[st] ? st : 'beast';
}
// 吹き出しを出す（見ている範囲だけ・間隔をあける）
export function monsterSay(sim, c, kind, force = false) {
  const S = sim.S;
  if (!c || c.hp <= 0) return null;
  if (!force && S.t - (c.saidAt ?? -999) < 25) return null;
  if (!c.given) ensureIdentity(sim, c);
  const set = TALK[talkKey(c)] || TALK.beast;
  const lines = set[kind];
  if (!lines || !lines.length) return null;
  const text = sim.rng.pick(lines);
  c.saidAt = S.t;
  if (sim.isWatched(c)) sim.events.push({ type: 'say', id: c.id, text });
  return text;
}
const who = (c) => (!c.given || c.name.includes(c.given) ? c.name : `${c.name}の${c.given}`);

// ---------- 個体の身元（毎日） ----------
function ensureIdentity(sim, c) {
  if (!c.given) c.given = makeName(sim, c);
  c.intel = intelOf(c);
  if (!c.sex) c.sex = HAS_FAMILY.has(nameStyle(c.sp)) ? (sim.rng.chance(0.5) ? 'm' : 'f') : 'n';
  c.parents = c.parents || [];
  c.young = c.young || [];
  if (c.mate === undefined) c.mate = null;
  if (c.home && c.lair != null) c.home.bld = c.lair;
  if (!eats(c)) c.hunger = 100;
  // 回復役：ゴブリンの呪い師、リッチ、ファラオ、アラクネ、魔将
  if (c.healer === undefined) c.healer = ['lich', 'pharaoh', 'arachne', 'demongeneral', 'goblinlord'].includes(c.sp) || (c.sp === 'hobgoblin' && sim.rng.chance(0.4)) || (c.sp === 'goblin' && sim.rng.chance(0.12));
  if (c.herbs === undefined) c.herbs = c.intel >= 0.45 ? 1 : 0;
}

// 生まれた子に親をつける（creatures.js の繁殖で生まれた個体を、近くの同じ種のつがいの子にする）
function adoptNewborns(sim, list) {
  const S = sim.S, R = sim.rng;
  for (const c of list) {
    if (c._born) continue;
    c._born = true;
    if (c.age > 1 || !HAS_FAMILY.has(nameStyle(c.sp))) continue;
    const adults = list.filter((o) => o !== c && FAMILY_OR_SP(o) === FAMILY_OR_SP(c) && o.age > GROW_DAYS && !(o.parents?.length && o.age < GROW_DAYS) && Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 8);
    if (!adults.length) continue;
    const mom = adults.find((o) => o.sex === 'f' && o.mate) || adults.find((o) => o.sex === 'f') || adults[0];
    const dad = mom.mate && S.creatures[mom.mate];
    c.parents = [mom.id].concat(dad ? [dad.id] : []);
    for (const p of [mom, dad]) if (p) p.young = (p.young || []).concat(c.id);
    c.role = 'young'; c.power = 0.55; applyStats(c); c.hp = Math.min(c.hp, c.maxhp);
    c.home = { x: mom.home.x, z: mom.home.z, bld: mom.lair ?? undefined }; c.lair = mom.lair;
    if (mom.band && S.bands[mom.band]) { c.band = mom.band; if (!S.bands[mom.band].members.includes(c.id)) S.bands[mom.band].members.push(c.id); }
    const place = sim.placeName(mom.home.x, mom.home.z);
    sim.pushLog(`${place}で、${who(mom)}${dad ? `と${dad.given}` : ''}の子「${c.given}」が生まれた。`, 'event', [], mom.pos);
    monsterSay(sim, mom, 'idle');
  }
}
const FAMILY_OR_SP = (c) => FAMILY[c.sp] || nameStyle(c.sp);

// つがいを作る・子を育てる
function familyDaily(sim, list) {
  const S = sim.S, R = sim.rng;
  const single = list.filter((c) => c.sex !== 'n' && !c.mate && c.age > GROW_DAYS && !c.general);
  for (const c of single) {
    if (c.mate) continue;
    const kin = (a, b) => a.parents?.includes(b.id) || b.parents?.includes(a.id) || (a.parents?.length && b.parents?.some((id) => a.parents.includes(id)));
    const m = single.find((o) => o !== c && !o.mate && o.sex !== c.sex && !kin(c, o) && FAMILY_OR_SP(o) === FAMILY_OR_SP(c) && (c.band ? o.band === c.band : Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 12));
    if (m && R.chance(0.35)) {
      c.mate = m.id; m.mate = c.id;
      sim.pushLog(`${sim.placeName(c.home.x, c.home.z)}で、${who(c)}と${m.given}がつがいになった。`, 'event', [], c.pos);
    }
  }
  for (const c of list) {
    if (c.mate && !alive(S, S.creatures[c.mate])) { const lost = c.mate; c.mate = null; c.widowed = sim.today; c.mournFor = lost; }
    c.young = (c.young || []).filter((id) => alive(S, S.creatures[id]));
    // 子の成長
    if (c.role === 'young' && c.age >= GROW_DAYS) {
      delete c.power; applyStats(c); c.role = c.lair != null ? 'guardian' : 'member';
      sim.pushLog(`${who(c)}が一人前になった。`, 'event', [], c.pos);
    }
  }
}

// ---------- 飢え：狩り・備蓄・略奪・餓死 ----------
function hungerDaily(sim, list) {
  const S = sim.S, R = sim.rng;
  // 群れ：働き手が狩りに出て、巣に食料をためる。序列の高い者から食べる
  const all = Object.values(S.creatures);
  for (const band of Object.values(S.bands)) {
    const ms = bandMembers(sim, band).filter(eats);
    if (!ms.length) continue;
    band.stock = band.stock || 0;
    const base = bandBase(sim, band);
    const hunters = ms.filter((c) => c.role !== 'young' && c.id !== band.leader);
    const desperate = (band.hungry ?? 60) < 20;
    let kills = 0;
    for (const h of hunters) {
      if (kills >= 2 || !R.chance(0.45)) continue;
      // 食物連鎖の表にある獲物だけ、数の少ない種は（飢えていなければ）見逃す
      const prey = all.filter((o) => Math.abs(o.pos.x - base.x) < 22 && Math.abs(o.pos.z - base.z) < 22 && canEat(sim, h, o, desperate) && o.atk <= h.atk * 1.2);
      if (!prey.length) continue;
      const v = R.pick(prey);
      band.stock += meals(v.sp); kills++;
      killCreature(sim, v, h);
    }
    // 獲物がとれなくても、木の実・虫をあさって少しは食べる
    for (const h of hunters) band.stock += forage(sim, h, 1) * 0.6;
    ms.sort((a, b) => (a.rank || 99) - (b.rank || 99));
    for (const c of ms) {
      if (c.hunger > 70) continue;
      // 序列の高い者から食べる。残り物がなければ下位は自分であさる（あまり満たされない）
      if (band.stock >= 1) { band.stock -= 1; c.hunger = Math.min(100, c.hunger + 55); }
      else if (R.chance(0.5)) c.hunger = Math.min(100, c.hunger + 25);
    }
    band.stock = Math.min(band.stock, ms.length * 3);
    band.hungry = ms.reduce((s, c) => s + c.hunger, 0) / ms.length;
    if (band.hungry < 30) {
      const lead = S.creatures[band.leader];
      if (lead) monsterSay(sim, lead, 'hungry');
      if (sim.today - (band.lastLoot || -99) >= 4 && R.chance(0.5)) loot(sim, band);
    }
  }
  // 群れのない魔物：自分で狩るか、草・木の実をあさる
  for (const c of list) {
    if (c.band || !eats(c) || c.hunger > 60) continue;
    const f = forage(sim, c, FA ? Math.min(3, FA.needOf(c.sp) / 2) : 1);
    if (f > 0) { c.hunger = Math.min(100, c.hunger + 45 * f); continue; }
    // 餌場が痩せていても、草の根や虫をかじって少しはしのぐ
    if (R.chance(0.5)) c.hunger = Math.min(100, c.hunger + 20);
    if (preyList(c.sp).length && R.chance(0.4)) {
      const prey = all.find((o) => Math.abs(o.pos.x - c.pos.x) < 15 && Math.abs(o.pos.z - c.pos.z) < 15 && canEat(sim, c, o, c.hunger < 10) && o.atk <= c.atk * 1.2);
      if (prey) killCreature(sim, prey, c); // 狩った者は満腹になる
    }
  }
  // 餓死
  for (const c of list) {
    if (!eats(c) || c.named || c.sp === 'demonlord') continue;
    if (c.hunger <= 1) c.starve = (c.starve || 0) + 1; else c.starve = 0;
    if (c.starve >= 6 && sim.rng.chance(0.5)) {
      sim.pushLog(`${sim.placeName(c.pos.x, c.pos.z)}で、${who(c)}が飢えて倒れた。`, 'event', [], c.pos);
      stat(sim, 'starve');
      killCreature(sim, c, null);
    }
  }
}
// 略奪：飢えた群れは家畜・畑を襲う
function loot(sim, band) {
  const S = sim.S, R = sim.rng;
  band.lastLoot = sim.today;
  const base = bandBase(sim, band);
  const town = S.world.settlements.filter((s) => !S.towns[s.id].occupied).sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z))[0];
  if (!town || Math.hypot(town.x - base.x, town.z - base.z) > 45) return;
  const ms = bandMembers(sim, band).filter((c) => c.role !== 'young');
  if (!ms.length) return;
  const stock = Object.values(S.creatures).filter((c) => c.owner === town.id && SPECIES[c.sp].kind === 'livestock' && ['sheep', 'chicken', 'pig', 'goat', 'duck', 'cow'].includes(c.sp));
  const thief = R.pick(ms);
  let what;
  if (stock.length > 3 && R.chance(0.6)) {
    const v = R.pick(stock); what = v.name;
    killCreature(sim, v, thief);
    band.stock += 4;
  } else {
    const m = S.towns[town.id];
    const take = Math.min(m.stock.wheat || 0, 12);
    if (take < 2) return;
    m.stock.wheat -= take; band.stock += Math.round(take / 3); what = '畑の麦';
  }
  stat(sim, 'loot');
  sim.news(`飢えた「${band.name}」の${FAM[band.fam].label}たちが夜のうちに${town.name}の${what}を奪っていった`, 1, town);
  const res = sim.living().filter((p) => p.s === town.id && sim.isAdult(p));
  for (let i = 0; i < 3 && res.length; i++) sim.remember(R.pick(res), `${FAM[band.fam].label}に${what}をやられた。群れが飢えているらしい`, { emo: -0.6, imp: 0.55, k: 'monster' });
  band.rage = (band.rage || 0) + 1; // 飢えが続くと人里への怒りになる
}

// ---------- 序列 ----------
function rankDaily(sim, band) {
  const R = sim.rng;
  const ms = bandMembers(sim, band);
  const score = (c) => power(c) + Math.min(c.age, 300) / 15 + (c.kills || 0) * 4 + (c.merit || 0) - (c.role === 'young' ? 100 : 0);
  ms.sort((a, b) => (b.id === band.leader) - (a.id === band.leader) || score(b) - score(a));
  ms.forEach((c, i) => { c.rank = i + 1; });
  // 序列争い：序列が近く力の拮抗した二体が、殺さない程度にやり合う
  if (ms.length >= 4 && R.chance(0.2)) {
    const i = R.int(1, ms.length - 2), a = ms[i], b = ms[i + 1];
    if (b.role !== 'young' && score(b) > score(a) * 0.85) {
      const bWins = R.chance(score(b) / (score(a) + score(b)));
      const win = bWins ? b : a, lose = bWins ? a : b;
      lose.hp = Math.max(1, Math.round(lose.hp * 0.6)); win.merit = (win.merit || 0) + 3; lose.merit = (lose.merit || 0) - 2;
      if (bWins) { a.rank = i + 2; b.rank = i + 1; }
      monsterSay(sim, win, 'victory');
      sim.pushLog(`「${band.name}」で序列争い。${win.given}が${lose.given}を打ち負かし、${win.rank}番手になった。`, 'event', [], win.pos);
    }
  }
}

// ---------- 賢いふるまい（creatures.js の think() の頭で呼ぶ） ----------
// true を返したら、その回の考えはここで済んだ（think() は return する）
export function monsterThink(sim, c, def, all, humans) {
  if (!def.monster || c.dormant) return false;
  const S = sim.S, R = sim.rng;
  if (!S.bands) initMonsters(sim);
  if (c.fleeUntil && S.t < c.fleeUntil) return false;
  if (c.raid || c.occupier != null || c.sp === 'demonlord') return false;
  const I = c.intel ?? intelOf(c);
  const home = c.home;
  const dHome = Math.hypot(c.pos.x - home.x, c.pos.z - home.z);
  const goHome = (run) => { c.goal = { x: home.x + R.range(-1, 1), z: home.z + R.range(-1, 1), run, path: dHome > 14 }; };
  // 大群の集結中：集合場所へ
  if (c.warParty) {
    const band = S.bands[c.warParty];
    if (band?.war?.rally) { c.goal = { x: band.war.rally.x + R.range(-2, 2), z: band.war.rally.z + R.range(-2, 2), run: false, path: Math.hypot(c.pos.x - band.war.rally.x, c.pos.z - band.war.rally.z) > 14 }; return true; }
    c.warParty = null;
  }
  // 子どもは巣のそばを離れない
  if (c.role === 'young') {
    if (humans.length && R.chance(0.3)) monsterSay(sim, c, 'young');
    c.goal = { x: home.x + R.range(-2, 2), z: home.z + R.range(-2, 2) }; return true;
  }
  // 傷ついたら住処へ帰って休む（賢いほど早めに引く）
  if (c.hp < c.maxhp * (0.3 + I * 0.25) && !c.named) {
    if (dHome < 1.5 && c.lair != null && ['cave', 'pyramid', 'ruins'].includes(sim.building(c.lair)?.type)) { c.inDungeon = true; c.resting = true; c.goal = null; return true; }
    goHome(true); return true;
  }
  // 夜：昼に動く種は住処で眠る
  if (DIURNAL.has(c.sp) && isNight(sim)) { if (dHome > 3) goHome(false); else c.goal = null; return true; }
  // 仇を見つけたら襲う
  if (c.avenge != null) {
    const foe = humans.find((h) => h.id === c.avenge && h.inside == null && Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z) < 10);
    if (foe) {
      monsterSay(sim, c, 'council');
      if (Math.hypot(foe.pos.x - c.pos.x, foe.pos.z - c.pos.z) < 1.4) startFight(sim, c, foe); else c.goal = { x: foe.pos.x, z: foe.pos.z, run: true };
      return true;
    }
  }
  // ドラゴン：宝を守り、縄張りに入った者に怒る
  if (c.sp === 'dragon' || (c.sp === 'wyvern' && c.named)) {
    const mask = townMask(sim);
    const intr = humans.find((h) => h.inside == null && Math.hypot(h.pos.x - home.x, h.pos.z - home.z) < 8 && !mask[Math.round(h.pos.z) * W + Math.round(h.pos.x)]);
    if (intr) {
      // まず咆哮で警告し、それでも立ち去らない者に襲いかかる
      if (!c.warnAt || S.t - c.warnAt > 60) { c.warnAt = S.t; monsterSay(sim, c, 'alarm', true); c.goal = null; if (intr.needs) intr.needs.survival = Math.max(0, intr.needs.survival - 40); return true; }
      if (S.t - c.warnAt < 8) return true;
      if (S.t > (c.enraged || 0)) {
        c.enraged = S.t + 60 * 12;
        if (S.t - (c.ragedNews ?? -1e9) > 1440 * 5) { c.ragedNews = S.t; sim.news(`${who(c)}が縄張りを侵され、怒り狂っている！`, 2, c.pos); }
        else sim.pushLog(`${who(c)}の咆哮が${sim.placeName(c.pos.x, c.pos.z)}に響いた。`, 'event', [], c.pos);
      }
      monsterSay(sim, c, 'alarm');
      if (Math.hypot(intr.pos.x - c.pos.x, intr.pos.z - c.pos.z) < 1.6) startFight(sim, c, intr); else c.goal = { x: intr.pos.x, z: intr.pos.z, run: true };
      return true;
    }
  }
  // 見張り：人を見つけたら種族語で知らせる
  if (humans.length && I >= 0.3 && R.chance(0.25)) {
    const h = humans.find((q) => q.inside == null && Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z) < 7);
    if (h) monsterSay(sim, c, 'alarm');
  }
  // 腹が減ったら狩る
  if (eats(c) && c.hunger < 30) {
    let prey = null, bd = 10;
    for (const o of all) {
      if (o === c || o.atk > c.atk * 0.7 || o.maxhp > c.hp || !canEat(sim, c, o, c.hunger < 10)) continue;
      const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z);
      if (d < bd) { bd = d; prey = o; }
    }
    if (prey) {
      if (R.chance(0.1)) monsterSay(sim, c, 'hungry');
      if (bd < 1.4) startFight(sim, c, prey); else c.goal = { x: prey.pos.x, z: prey.pos.z, run: true };
      return true;
    }
  }
  if (R.chance(0.02)) monsterSay(sim, c, c.hunger < 30 ? 'hungry' : 'idle');
  return false;
}

// ---------- 賢い戦い方（society.js の stepCombat() で、攻撃の直前に呼ぶ） ----------
// true を返したら、その回の攻撃のかわりに別の行動をとった（stepCombat は continue する）
function humansAround(sim, x, z, r) {
  const S = sim.S;
  if (!sim._monHG || sim._monHG.t !== S.t) sim._monHG = { t: S.t, g: buildGrid(sim.living().filter((h) => h.inside == null && h.jail == null)) };
  return around(sim._monHG.g, x, z, r).filter((h) => Math.hypot(h.pos.x - x, h.pos.z - z) < r);
}
function alliesAround(sim, e, r) {
  const S = sim.S;
  const src = sim._cgrid ? around(sim._cgrid, e.pos.x, e.pos.z, r) : Object.values(S.creatures);
  return src.filter((o) => o !== e && o.hp > 0 && !o.dormant && S.creatures[o.id] === o && o.hostile && (e.band ? o.band === e.band : FAMILY_OR_SP(o) === FAMILY_OR_SP(e) || (SPECIES[o.sp].kind === 'demon' && SPECIES[e.sp].kind === 'demon' && !o.rebel === !e.rebel)) && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < r);
}
export function monsterTactics(sim, e, t) {
  const def = SPECIES[e.sp];
  if (!def || !def.monster || typeof t.id !== 'number') return false; // 人と戦うときだけ
  const I = e.intel ?? intelOf(e);
  if (I < 0.3) return false; // 低い知能は突撃だけ
  const S = sim.S, R = sim.rng;
  if (!S.bands) initMonsters(sim);
  const f = e.fight;
  // 仲間を回復（回復役）
  if (e.healer && S.t >= (e.healCd || 0)) {
    const hurt = alliesAround(sim, e, 6).filter((o) => o.hp < o.maxhp * 0.5).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0] || (e.hp < e.maxhp * 0.5 ? e : null);
    if (hurt) {
      e.healCd = S.t + 12;
      hurt.hp = Math.min(hurt.maxhp, hurt.hp + Math.round(hurt.maxhp * 0.25));
      sim.events.push({ type: 'heal', id: hurt.id });
      monsterSay(sim, e, 'heal', true);
      stat(sim, 'heal');
      return true;
    }
  }
  // 薬草で自分を手当て
  if (e.hp < e.maxhp * 0.4 && (e.herbs || 0) > 0 && I >= 0.45) {
    e.herbs--; e.hp = Math.min(e.maxhp, e.hp + Math.round(e.maxhp * 0.3));
    sim.events.push({ type: 'heal', id: e.id }); monsterSay(sim, e, 'heal', true); return true;
  }
  // 形勢不利なら撤退（賢いほど見切りが早い。群れの長が号令をかけると仲間も退く）
  const foes = humansAround(sim, e.pos.x, e.pos.z, 6).filter((h) => h.fight && (h.fight.target === e.id || S.creatures[h.fight.target]?.band === e.band && e.band));
  const friends = alliesAround(sim, e, 6).filter((o) => o.fight);
  const bad = e.hp < e.maxhp * 0.3 || (I >= 0.5 && foes.length >= friends.length + 3 && e.hp < e.maxhp * 0.7);
  if (bad && !def.boss && R.chance(0.25 + I * 0.6)) {
    retreat(sim, e, t, foes);
    if (e.band && (S.bands[e.band]?.leader === e.id || I >= 0.7)) for (const o of friends) retreat(sim, o, null, foes, true);
    return true;
  }
  // 援軍を呼び、囲む（一度の戦いで一回）
  if (!f.called && I >= 0.4) {
    f.called = true;
    // 相手が強すぎるときは呼ばない（無駄死にさせない）。呼ぶのは元気な仲間だけ
    const tooStrong = I >= 0.5 && t.hp > e.hp * 3;
    const help = tooStrong ? [] : alliesAround(sim, e, 10).filter((o) => !o.fight && o.role !== 'young' && !o.inDungeon && o.sp !== 'demonlord' && o.hp > o.maxhp * 0.6).slice(0, 2);
    if (help.length) {
      monsterSay(sim, e, 'call', true);
      for (const o of help) startFight(sim, o, t);
      stat(sim, 'call');
    }
  }
  // 弱い相手（後ろの術者・戦えない者）を先に狙う
  if (I >= 0.6 && R.chance(0.25)) {
    const weak = humansAround(sim, e.pos.x, e.pos.z, 4).filter((h) => h !== t && h.deathYear == null && (BACKLINE.has(h.job) || h.hp < t.hp * 0.6)).sort((a, b) => a.hp - b.hp)[0];
    if (weak) { f.target = weak.id; monsterSay(sim, e, 'focus'); return false; }
  }
  // 傷ついた仲間をかばう
  if (I >= 0.5 && R.chance(0.3)) {
    const ally = alliesAround(sim, e, 4).find((o) => o.hp < o.maxhp * 0.35);
    const h = ally && humansAround(sim, ally.pos.x, ally.pos.z, 3).find((q) => q.fight?.target === ally.id && q !== t);
    if (h) { f.target = h.id; if (!h.fight || h.fight.target === ally.id) h.fight = { target: e.id, cd: 0.5, lethal: true }; monsterSay(sim, e, 'protect'); return false; }
  }
  if (R.chance(0.08)) monsterSay(sim, e, e.hp < e.maxhp * 0.5 ? 'hurt' : 'attack');
  return false;
}
function retreat(sim, e, t, foes, follow = false) {
  const S = sim.S;
  const tgt = t || (e.fight && sim.entity(e.fight.target));
  e.fight = null;
  if (tgt && tgt.fight?.target === e.id) tgt.fight = null;
  e.fleeUntil = S.t + 120; e.raid = null; e.path = null;
  e.goal = { x: e.home.x, z: e.home.z, run: true, path: true };
  if (!follow) monsterSay(sim, e, 'retreat', true);
  stat(sim, 'retreat');
  learn(sim, e, 'retreat', foes || []);
}

// ---------- 敗北の学習 ----------
function nearestTown(sim, x, z, max = 40) {
  let best = null, bd = max;
  for (const s of sim.S.world.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function learn(sim, c, kind, foes) {
  const S = sim.S;
  const band = c.band && S.bands[c.band];
  const town = nearestTown(sim, c.pos.x, c.pos.z);
  const jobs = {};
  for (const h of foes) jobs[h.job] = (jobs[h.job] || 0) + 1;
  const lesson = { day: sim.today, kind, night: isNight(sim), hour: Math.floor(sim.hour()), sid: town ? town.id : null, x: Math.round(c.pos.x), z: Math.round(c.pos.z), foes: foes.length, jobs: Object.keys(jobs).slice(0, 3) };
  if (band) {
    band.lessons = band.lessons || [];
    // 同じ日の同じ町の記憶はまとめる
    const same = band.lessons.find((l) => l.day === lesson.day && l.sid === lesson.sid && l.kind === kind);
    if (same) same.foes = Math.max(same.foes, lesson.foes); else band.lessons.push(lesson);
    if (band.lessons.length > 8) band.lessons.shift();
  }
  const mem = S.speciesMemory[c.sp] || (S.speciesMemory[c.sp] = { deaths: 0, kills: 0, evolved: 0, danger: {}, fear: 0 });
  mem.fear += kind === 'defeat' ? 0.6 : 0.15;
  const key = Math.floor(c.pos.x / 8) * 100 + Math.floor(c.pos.z / 8);
  mem.danger[key] = (mem.danger[key] || 0) + (kind === 'defeat' ? 1 : 0.5);
}
// 学んだことから攻め方を決める：数をそろえる・夜に襲う・別の道・守りの薄い村
function planFromLessons(sim, band, target, base) {
  const S = sim.S;
  const L = (band.lessons || []);
  const here = L.filter((l) => l.sid === target.id);
  const plan = { target, need: 4, night: false, flank: false, notes: [] };
  if (here.length) {
    plan.need = Math.min(10, Math.max(4, ...here.map((l) => l.foes + 3)));
    plan.notes.push(`前は${here[here.length - 1].foes}人の守りに退いた。数をそろえる`);
    if (here.some((l) => !l.night)) { plan.night = true; plan.notes.push('昼に負けたので夜に襲う'); }
    plan.flank = true; plan.notes.push('前と違う道から回り込む');
  }
  // 同じ町で二度負けたら、守りの薄い別の村を狙う
  if (here.filter((l) => l.kind === 'defeat').length >= 2 || here.length >= 3) {
    const alt = S.world.settlements.filter((s) => s.id !== target.id && !S.towns[s.id].occupied && Math.hypot(s.x - base.x, s.z - base.z) < 55)
      .map((s) => ({ s, d: defendersOf(sim, s) })).sort((a, b) => a.d - b.d)[0];
    if (alt) { plan.target = alt.s; plan.notes.push(`${target.name}は守りが固い。${alt.s.name}を狙う`); }
  }
  if ((band.fam === 'undead' || band.fam === 'spider' || band.fam === 'goblin') && !plan.night) { plan.night = true; }
  return plan;
}
function defendersOf(sim, s) {
  let n = 0;
  for (const p of sim.living()) if (p.s === s.id && FIGHTER_JOBS.has(p.job) && p.jail == null) n++;
  return n;
}

// ---------- 恨みと報復（仲間を殺された群れの大群） ----------
// creatures.js の killCreature() の頭で呼ぶ：死んだ魔物の家族・群れが恨みを持つ
export function onMonsterKilled(sim, c, killer) {
  const S = sim.S;
  if (!SPECIES[c.sp]?.monster) return;
  initMonsters(sim);
  // ドラゴンの宝：倒した者の取り分に足す
  if (c.hoard && killer && typeof killer.id === 'number') { c.bounty = (c.bounty || 0) + Math.round(c.hoard); c.hoard = 0; }
  if (!killer || typeof killer.id !== 'number') return;
  const band = c.band && S.bands[c.band];
  const g = band ? (band.grudge = band.grudge || { sid: null, pids: [], count: 0, since: sim.today }) : null;
  if (g) {
    g.sid = killer.s; g.count += c.id === band.leader ? 3 : 1; g.since = sim.today;
    if (!g.pids.includes(killer.id)) g.pids.push(killer.id);
    if (g.pids.length > 5) g.pids.shift();
  }
  // 家族は仇を覚える
  for (const id of [c.mate, ...(c.young || []), ...(c.parents || [])]) {
    const k = id && S.creatures[id];
    if (k && k.hp > 0) { k.avenge = killer.id; k.mournFor = c.id; }
  }
  // 群れが戦いの途中で仲間を失った：敗北の記憶
  if (band && killer.s != null) {
    const foes = humansAround(sim, c.pos.x, c.pos.z, 8).filter((h) => h.fight);
    if (foes.length >= 2) learn(sim, c, 'defeat', foes);
  }
}

// 話し合い → 仲間集め → 前兆 → 攻め込み → 結果
function grudgeDaily(sim) {
  const S = sim.S, R = sim.rng, M = S.monsterWar = S.monsterWar || { last: -99, count: 0, log: [] };
  for (const band of Object.values(S.bands)) {
    const war = band.war;
    if (war) { warStep(sim, band); continue; }
    const g = band.grudge;
    if (g && sim.today - g.since > 30) { band.grudge = null; continue; }
    const angry = (g && g.count >= 3) || (band.rage || 0) >= 3;
    if (!angry || band.rebel) continue;
    if (sim.today - M.last < 20 || sim.today - (band.lastBigWar || -99) < 30) continue;
    if (bandMembers(sim, band).filter((c) => c.role !== 'young').length < 3) continue;
    bandCouncil(sim, band, g && g.count >= 3 ? 'grudge' : 'hunger');
  }
}
function bandCouncil(sim, band, why) {
  const S = sim.S, R = sim.rng, M = S.monsterWar;
  const base = bandBase(sim, band);
  const lead = S.creatures[band.leader] || bandMembers(sim, band)[0];
  if (!lead) return;
  let target = why === 'grudge' && band.grudge.sid != null ? sim.town(band.grudge.sid) : nearestTown(sim, base.x, base.z, 55);
  if (!target || S.towns[target.id].occupied || Math.hypot(target.x - base.x, target.z - base.z) > 60) target = nearestTown(sim, base.x, base.z, 55);
  if (!target || S.towns[target.id].occupied) { band.grudge = null; band.rage = 0; return; }
  // 賢い群れは、恨みの町が固ければ同じ国の守りの薄い村を狙う（低い知能はまっすぐ向かう）
  const brains = Math.max(...bandMembers(sim, band).map((c) => c.intel ?? intelOf(c)));
  if (brains >= 0.45 && defendersOf(sim, target) > bandMembers(sim, band).length * 1.5) {
    const soft = S.world.settlements.filter((s2) => s2.kingdom === target.kingdom && !S.towns[s2.id].occupied && Math.hypot(s2.x - base.x, s2.z - base.z) < 60)
      .sort((a, b) => defendersOf(sim, a) - defendersOf(sim, b))[0];
    if (soft) target = soft;
  }
  const plan = planFromLessons(sim, band, target, base);
  target = plan.target;
  // 近くの同族の群れにも呼びかける
  const allies = Object.values(S.bands).filter((b) => b !== band && b.fam === band.fam && !b.war && !b.rebel && Math.hypot(bandBase(sim, b).x - base.x, bandBase(sim, b).z - base.z) < 45);
  let party = bandMembers(sim, band).filter((c) => c.role !== 'young');
  const joined = [];
  for (const b of allies) {
    const add = bandMembers(sim, b).filter((c) => c.role !== 'young' && c.id !== b.leader).slice(0, 3);
    if (add.length) { party = party.concat(add); joined.push(b.name); }
  }
  // 足りなければ遠くの同族を呼び寄せる（最大3体）
  const count = {};
  for (const c of Object.values(S.creatures)) count[c.sp] = (count[c.sp] || 0) + 1;
  const bsp = FAM[band.fam].base;
  let called = 0;
  while (party.length < plan.need && called < 3 && (count[bsp] || 0) < capOf(bsp) + 2) {
    const p = sim.randomNear(base.x, base.z, 4);
    if (!p) break;
    const c = makeCreature(sim, bsp, p.x, p.z, { lair: band.lair, hx: base.x, hz: base.z, range: 7, lv: R.int(1, 3), age: 30 });
    if (c.hp <= 0) break;
    if (c.inDungeon) { c.inDungeon = false; c.pos = { x: p.x, z: p.z }; }
    c.band = band.id; band.members.push(c.id); c.role = 'member'; ensureIdentity(sim, c);
    party.push(c); called++; count[bsp] = (count[bsp] || 0) + 1;
  }
  party = party.slice(0, 10);
  // 集合場所：前と違う道なら町の反対側へ回り込む
  const ang = Math.atan2(base.z - target.z, base.x - target.x) + (plan.flank ? R.pick([-1.2, 1.2]) : 0);
  const rd = target.r + 20;
  let rally = { x: Math.round(target.x + Math.cos(ang) * rd), z: Math.round(target.z + Math.sin(ang) * rd) };
  const safe = sim.randomNear(rally.x, rally.z, 4, (t) => walkable(t) && t !== T.BLD);
  if (safe && !townMask(sim)[Math.round(safe.z) * W + Math.round(safe.x)]) rally = safe;
  band.war = { why, target: target.id, rally, party: party.map((c) => c.id), stage: 'gather', launchDay: sim.today + 1, night: plan.night, notes: plan.notes, joined, start: 0, defenders: 0 };
  for (const c of party) { c.warParty = band.id; c.path = null; }
  M.last = sim.today; band.lastBigWar = sim.today;
  stat(sim, 'council');
  // 話し合いの様子（種族語つき）
  const lines = [];
  const l1 = monsterSay(sim, lead, 'council', true); if (l1) lines.push(`${lead.given}「${l1}」`);
  for (const c of party.filter((x) => x !== lead).slice(0, 2)) { const l = monsterSay(sim, c, R.chance(0.5) ? 'council' : 'attack', true); if (l) lines.push(`${c.given}「${l}」`); }
  const reason = why === 'grudge' ? '仲間を殺された恨みを晴らすため' : '飢えをしのぐため';
  sim.pushLog(`${sim.placeName(base.x, base.z)}で「${band.name}」が${chiefTitle(band)}${lead.given}のもとに集まり、話し合った。${lines.join(' ')}`, 'event', [], base);
  sim.news(`「${band.name}」の${FAM[band.fam].label}たちが${reason}、${target.name}を襲う相談をしている${joined.length ? `（${joined.join('・')}も加わった）` : ''}`, 2, base);
  // 人間側への前兆
  const OMEN = { goblin: '森で小さな足跡がおびただしく増えている', orc: '夜ごと角笛のような音が聞こえる', undead: '墓場の土が掘り返されていた', mummy: '砂の上に包帯の切れ端が落ちていた', spider: '街道の木々に太い糸が張られている', demon: '空を黒い影が何度も横切った' };
  const omen = OMEN[band.fam] || '獣の遠吠えが近づいている';
  S.towns[target.id].omen = { until: S.t + 60 * 24 * 4, size: party.length, band: band.id, fam: band.fam, text: omen };
  S.omens = (S.omens || []).filter((o) => o.until > S.t).concat({ sid: target.id, band: band.id, size: party.length, until: S.t + 60 * 24 * 4, label: FAM[band.fam].label });
  sim.news(`${target.name}の猟師が「${omen}」と知らせた。大群の前兆ではないかと町がざわめく`, 2, target);
  const res = sim.living().filter((p) => p.s === target.id && sim.isAdult(p));
  for (let i = 0; i < 6 && res.length; i++) sim.remember(R.pick(res), `${omen}という話を聞いた。${FAM[band.fam].label}の大群が来るかもしれない`, { emo: -0.7, imp: 0.7, k: 'monster' });
}
function warStep(sim, band, hourly = false) {
  const S = sim.S, R = sim.rng, war = band.war;
  const town = sim.town(war.target);
  const party = war.party.map((id) => S.creatures[id]).filter((c) => alive(S, c));
  if (war.stage === 'gather') {
    if (!party.length || S.towns[town.id].occupied) { endWar(sim, band, 'cancel', party); return; }
    const ready = sim.today >= war.launchDay && (!war.night || isNight(sim));
    if (!ready) return;
    war.stage = 'march'; war.startT = S.t; war.start = party.length; war.defenders = defendersOf(sim, town);
    war.pop0 = sim.living().filter((p) => p.s === town.id).length;
    const until = S.t + 60 * 10;
    for (const c of party) { c.warParty = null; c.raid = town.id; c.raidUntil = until; c.path = null; c.inDungeon = false; c.calm = null; }
    const tw = S.towns[town.id];
    if (tw.threat && S.t < tw.threat.until) { tw.threat.by.push(...party.map((c) => c.id)); tw.threat.until = Math.max(tw.threat.until, S.t + 60 * 12); }
    else tw.threat = { until: S.t + 60 * 12, since: S.t, by: party.map((c) => c.id) };
    const lead = S.creatures[band.leader];
    if (lead) monsterSay(sim, lead, 'attack', true);
    sim.news(`「${band.name}」の大群（${party.length}体）が${war.night ? '夜陰に乗じて' : ''}${town.name}に攻め込んできた！`, 3, town);
    sim.chron(`${FAM[band.fam].label}の「${band.name}」が${war.why === 'grudge' ? '仲間の仇を討つため' : '飢えに追われて'}${town.name}を襲った${war.notes.length ? `（${war.notes[0]}）` : ''}`, town.kingdom);
    for (const p of sim.living()) if (p.s === town.id) sim.remember(p, `${FAM[band.fam].label}の大群が町に攻め込んできた`, { emo: -0.9, imp: 0.85, k: 'monster' });
    S.monsterWar.count++;
    return;
  }
  if (war.stage === 'march') {
    const busy = party.filter((c) => c.raid === town.id || c.fight);
    if (busy.length && S.t < war.startT + 60 * 14) return;
    const lost = war.start - party.length;
    const pop1 = sim.living().filter((p) => p.s === town.id).length;
    const killed = Math.max(0, war.pop0 - pop1);
    const outcome = killed >= 2 && lost < war.start / 2 ? 'win' : lost >= war.start / 2 ? 'defeat' : 'draw';
    endWar(sim, band, outcome, party, { lost, killed });
  }
}
function endWar(sim, band, outcome, party, r = {}) {
  const S = sim.S, war = band.war, town = sim.town(war.target);
  band.war = null;
  for (const c of party) { c.warParty = null; if (c.raid === town.id) c.raid = null; c.goal = { x: c.home.x, z: c.home.z, path: true }; c.path = null; }
  if (outcome === 'cancel') return;
  S.monsterWar.log.push({ day: sim.today, band: band.name, town: town.name, outcome, lost: r.lost, killed: r.killed });
  if (S.monsterWar.log.length > 20) S.monsterWar.log.shift();
  const lead = S.creatures[band.leader];
  if (outcome === 'win') {
    band.grudge = null; band.rage = 0; band.loyalty = Math.min(100, band.loyalty + 20); band.stock = (band.stock || 0) + 6;
    if (lead) monsterSay(sim, lead, 'victory', true);
    sim.news(`「${band.name}」は${town.name}を荒らして引き上げた（町の死者${r.killed}人）`, 3, town);
    sim.chron(`「${band.name}」が${town.name}を襲い、恨みを晴らした`, town.kingdom);
    const mem = S.speciesMemory[FAM[band.fam].base]; if (mem) mem.fear = Math.max(0, mem.fear - 1);
  } else {
    band.lessons = band.lessons || [];
    band.lessons.push({ day: sim.today, kind: outcome === 'defeat' ? 'defeat' : 'retreat', night: war.night, hour: 0, sid: town.id, foes: war.defenders, jobs: [] });
    if (band.lessons.length > 8) band.lessons.shift();
    band.loyalty = Math.max(0, band.loyalty - (outcome === 'defeat' ? 20 : 8));
    if (band.grudge) band.grudge.count = 1;
    sim.news(`${town.name}は「${band.name}」の大群を退けた（魔物${r.lost}体を討ち取った）`, 3, town);
    sim.chron(`${town.name}の人々が「${band.name}」の大群を退けた`, town.kingdom);
    const mem = S.speciesMemory[FAM[band.fam].base]; if (mem) mem.fear += 1;
    for (const p of sim.living()) if (p.s === town.id && sim.rng.chance(0.4)) sim.remember(p, `みんなで${FAM[band.fam].label}の大群を追い払った`, { emo: 0.6, imp: 0.7, k: 'monster' });
  }
}

// ---------- 住処で休んだ者を起こす・ドラゴンの宝（毎時） ----------
function lifeHourly(sim) {
  const S = sim.S;
  for (const c of Object.values(S.creatures)) {
    if (c.resting && (c.hp >= c.maxhp * 0.85)) { c.resting = false; c.inDungeon = false; }
  }
  for (const band of Object.values(S.bands || {})) if (band.war && band.war.stage === 'gather' && sim.today >= band.war.launchDay) warStep(sim, band, true);
}

// 安全弁：数が減りすぎた魔物は、巣の奥から湧くか、未開拓地から流れてくる
function keepAlive(sim) {
  const S = sim.S, R = sim.rng, w = S.world;
  const count = sim._monCount;
  const mask = townMask(sim);
  for (const [sp, d] of Object.entries(MIN_DENS)) {
    const min = Math.max(1, Math.round(d * AREA()));
    if ((count[sp] || 0) >= min) continue;
    const def = SPECIES[sp];
    const lairs = (SPRING[sp] || []).flatMap((t) => w.specials.map((id) => sim.building(id)).filter((b) => b && b.type === t));
    let p = null, lair = null, how;
    if (lairs.length && R.chance(0.7)) {
      lair = R.pick(lairs);
      p = sim.randomNear(lair.door.x, lair.door.z, 4, (t) => walkable(t) && t !== T.BLD);
      how = `${lair.name}の奥から${def.name}が這い出してきた`;
    }
    if (!p) {
      // 未開拓地：町から遠く、その種の住む土地
      lair = null;
      for (let i = 0; i < 80 && !p; i++) {
        const x = R.int(3, W - 4), z = R.int(3, H - 4), t = tileAt(w, x, z);
        if (!walkable(t) || t === T.BLD || mask[z * W + x]) continue;
        if (def.biome && !def.biome.includes(biomeOf(t)) && i < 60) continue;
        if (w.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 25)) continue;
        p = { x, z };
      }
      how = p ? `未開の地から${def.name}の一団が流れてきた（${sim.placeName(p.x, p.z)}）` : null;
    }
    if (!p) continue;
    const n = Math.min(3, min - (count[sp] || 0));
    for (let i = 0; i < n; i++) {
      const c = makeCreature(sim, sp, p.x + R.int(-1, 1), p.z + R.int(-1, 1), { lair: lair?.id ?? null, hx: lair ? lair.door.x : p.x, hz: lair ? lair.door.z : p.z, range: 8, lv: R.int(1, 2), age: 30 });
      if (c.hp <= 0) continue;
      if (c.inDungeon) { c.inDungeon = false; c.pos = { x: p.x, z: p.z }; }
      ensureIdentity(sim, c);
      count[sp] = (count[sp] || 0) + 1;
    }
    stat(sim, 'spring');
    sim.pushLog(`${how}。`, 'event', [], p);
  }
}

function lifeDaily(sim) {
  const S = sim.S;
  sim._monCount = {};
  for (const c of Object.values(S.creatures)) sim._monCount[c.sp] = (sim._monCount[c.sp] || 0) + 1;
  keepAlive(sim);
  const list = Object.values(S.creatures).filter((c) => SPECIES[c.sp]?.monster && c.hp > 0 && !c.dormant);
  for (const c of list) ensureIdentity(sim, c);
  adoptNewborns(sim, list);
  familyDaily(sim, list);
  for (const band of Object.values(S.bands)) rankDaily(sim, band);
  for (const c of list) if (!c.band) c.rank = 1;
  hungerDaily(sim, list);
  // ドラゴンは宝を蓄える
  for (const c of list) if (c.sp === 'dragon') c.hoard = Math.min(2000, (c.hoard || 0) + 6);
  // 薬草を補う（賢い者は巣で集めてくる）
  for (const c of list) if (c.intel >= 0.45 && (c.herbs || 0) < 1 && sim.rng.chance(0.3)) c.herbs = 1;
  grudgeDaily(sim);
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
  lifeDaily(sim);
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
  const S = sim.S;
  if (!S.bands) return;
  lifeHourly(sim);
  const DA = S.demonArmy;
  if (!DA || !S.demon?.active) return;
  // 夜襲を学んだ魔王軍は、夜になってから出陣する
  if (isNight(sim)) for (const g of generalsAlive(sim)) if (g.pending) { g.pending = false; campaign(sim, g); }
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
  const pos = c.id === band.leader ? chiefTitle(band) : `${c.rank ? `${c.rank}番手` : '一員'}（${chiefTitle(band)}：${lead ? lead.given || lead.name : '空位'}）`;
  return `「${band.name}」の${pos}・${band.members.length}体・結束${Math.round(band.loyalty)}・${band.wins}勝${band.losses}敗`;
}

// 詳細欄（ui.js 用）：[見出し, 内容] の組を返す
export function monsterDetail(sim, c) {
  const S = sim.S, rows = [];
  if (!SPECIES[c.sp]?.monster) return rows;
  const nm = (id) => { const o = S.creatures[id]; return o ? o.given || o.name : '（亡き者）'; };
  if (c.given) rows.push(['名前', c.given]);
  rows.push(['知能', ['獣なみ', '低い', 'ふつう', '高い', 'きわめて高い'][Math.min(4, Math.floor((c.intel ?? intelOf(c)) * 5))]]);
  if (SPECIES[c.sp].diet !== 'none') rows.push(['空腹', c.hunger > 70 ? '満腹' : c.hunger > 40 ? 'ふつう' : c.hunger > 15 ? '空腹' : '飢えている']);
  const info = monsterInfo(sim, c);
  if (info) rows.push(['所属', info]);
  if (c.home) rows.push(['住処', c.home.bld != null && sim.building(c.home.bld) ? sim.building(c.home.bld).name : sim.placeName(c.home.x, c.home.z)]);
  if (c.mate) rows.push(['つがい', nm(c.mate)]);
  if (c.parents?.length) rows.push(['親', c.parents.map(nm).join('・')]);
  if (c.young?.length) rows.push(['子', c.young.map(nm).join('・')]);
  if (c.role === 'young') rows.push(['成長', `あと${Math.max(0, GROW_DAYS - c.age)}日で一人前`]);
  if (c.avenge != null && S.people[c.avenge]) rows.push(['仇', sim.fullName(S.people[c.avenge])]);
  if (c.healer) rows.push(['役目', '仲間の手当て']);
  if (c.hoard) rows.push(['宝', `${Math.round(c.hoard)}銅貨ぶん`]);
  const band = c.band && S.bands?.[c.band];
  if (band?.grudge && band.grudge.sid != null) rows.push(['恨み', `${sim.town(band.grudge.sid).name}の人間（${band.grudge.count}）`]);
  if (band?.lessons?.length) { const l = band.lessons[band.lessons.length - 1]; rows.push(['教訓', `${l.sid != null ? sim.town(l.sid).name : 'どこか'}で${l.foes}人に${l.kind === 'defeat' ? '敗れた' : '退いた'}`]); }
  return rows;
}

// 詳細欄にそのまま足せる HTML（ui.js の creatureHtml で faunaHtml の次に）
export function monsterHtml(sim, c) {
  const rows = monsterDetail(sim, c);
  if (!rows.length) return '';
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return `<div class="section"><h4>魔物としての暮らし</h4><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`;
}
