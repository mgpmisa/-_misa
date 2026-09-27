// 奥地の民族の村（開発部）
// 物語部のデータ（js/lore.js）を読み、世界の中で民族の村を動かす。
//   - 奥地（町から遠い森・雪原・砂漠・沼・山・島）に民族の村を置く。国の領土ではなく「民族の土地」にする
//   - 民族ごとの名前・見た目・話し方を持つ村人（家系・記憶・世帯つき）。暮らしは既存の仕組みにのる
//   - 守り神（強大な魔物）をすみかに置き、毎年の供物・大きな約束の年のくじ（18歳以上）・送り出しを行う
//   - 物語の筋（STORY_ARCS）を条件がそろったら始め、分かれ道を乱数と登場人物の性格・強さで決め、結末の効き目を反映する
//   - 王国との関係（交易・贈り物・衝突・同盟・併合）。expansion.js の接近・要求の知らせに答える
//   - 伝説の噂を酒場に流し、ギルドの依頼にする
//
// 本体からの呼び方（くわしくは報告書のコード片）
//   initTribes(sim)            … newWorld の ensureExpansion のあと（古いセーブは load で S.tribes がなければ）
//   tribesDaily(sim)           … newDay の expansionDaily のあと
//   tribesHourly(sim)          … newHour の expansionHourly のあと（村に着いたよそ者を見つける）
//   tribesPlace(sim, p, kind)  … placeFor の頭（祠・集会所へ行かせる）
//   tribeBirth(sim, c, mother, father) … birth の最後（民族の名前と見た目をつける）
//   tribeWork(sim, p, dt, eff) … doWork の switch の前（里の仕事の実りを家の蔵と里の蓄えへ。お金は動かない）
//   話し方：tribeVoice / tribeTail / tribeGreeting / tribeTopic / tribeThoughts（speech.js へ）
//
// 状態（古いセーブで欠けていても、ensureTribes / initTribes で作る）
//   S.tribes = { v, villages:[村], pending:[置けなかった民族], arcs:[物語], away:[送られた人], legends:{}, seq, stats }
//   settlement に tribal:true, tribe:'fianna', tribeV:村番号。人は p.tribe
import { T, W, H, walkable, isWater, tryPlace } from './world.js';
import { JOBS, SPECIES, KINGDOMS, DEATH_CAUSES, GOODS, DAYS_PER_YEAR, DAYS_PER_SEASON, SEASONS, traitLabels } from './data.js';
import { createPersonFactory } from './history.js';
import { makeCreature, killCreature, applyStats, townMask } from './creatures.js';
import { setTribalLand, annexTribalLand, registerTribeHandler, chunkAt, ensureExpansion, tribalChunks, EXP_CS } from './expansion.js';
import { starterKit } from './items.js';
import { humanStats } from './society.js';
import { speechStyle } from './speech.js';
import { houseValue, transferEstate } from './property.js';
import { isAdventurer } from './guild.js';
import { clamp } from './rng.js';
import {
  TRIBES, TRIBE_NAMES, TRIBE_SPEECH, GUARDIANS, NEW_SPECIES, LEGENDS, STORY_ARCS, LORE_TIMELINE,
  offeringDue, tribeName, loreText, guardianOfTribe, tribeById, legendById, arcById,
} from './lore.js';

// ---------- 読み込み時：新しい魔物と職業と死因の名前を足す（data.js は編集しない） ----------
for (const [k, v] of Object.entries(NEW_SPECIES)) if (!SPECIES[k]) SPECIES[k] = v;
const NEW_JOBS = {
  tribe_elder: { name: '長老', place: 'shrine', rank: 'commoner', tribal: true },
  shaman: { name: '巫女', place: 'shrine', rank: 'commoner', goods: 'herbs', tribal: true },
};
for (const [k, v] of Object.entries(NEW_JOBS)) if (!JOBS[k]) JOBS[k] = v;
if (!DEATH_CAUSES.sent) DEATH_CAUSES.sent = '守り神のもとへ送られた';
if (!DEATH_CAUSES.stayed) DEATH_CAUSES.stayed = '守り神のもとに残った';

// ---------- 大きさ（W・H に比例させる。160 の世界と約10倍の大陸で同じ書き方） ----------
const LS = Math.max(1, Math.min(W, H) / 160);      // 長さの倍率
const BIGW = W >= 320;                             // 10倍の大陸
const VR = BIGW ? 7 : 5;                           // 村の半径（チェビシェフ）
// 王国の町の縁から（村の半径＋これ）だけ離れた所を「奥地」とみる。今の 160 の世界は土地が混んでいるので近め
const MIN_TOWN = BIGW ? Math.round(13 * LS) : 6;
const MIN_SPECIAL = BIGW ? Math.round(5 * LS) : 2; // 特別な場所（洞窟・遺跡など）から離す
const MAX_VILLAGES = BIGW ? 3 : 6;                 // 置く村の数の上限（重くならないよう、広い大陸でも2〜3つ）
const MAX_TRIBAL_POP = 240;                        // 民族の人口の合計の目安（150〜250人）
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
const kname = (k) => KINGDOMS[k]?.name || '王国';
const TILE = (name) => T[name];
// 小さな世界で置く順（約束の年が近く、人を送る約束のある民族から）
const ORDER = ['fianna', 'bolota', 'yarvi', 'garai', 'mahina', 'nefer', 'mictla', 'hollin', 'harn', 'dorgu', 'elda'];
// 暮らし → 職業
const LIVE_JOB = { hunt: 'hunter', fish: 'fisher', dive: 'fisher', farm: 'farmer', slashburn: 'farmer', herb: 'gatherer', gather: 'gatherer', herd: 'hunter', trade: 'gatherer', craft: 'weaver', mine: 'miner', smuggle: 'gatherer' };
export const TRIBAL_JOBS = new Set(['hunter', 'fisher', 'farmer', 'gatherer', 'tribe_elder', 'shaman', 'weaver', 'miner', 'potter']);
// 家の形（グラフィック部への注文。b.style）
const HOUSE_STYLE = { fianna: 'roundhut', yarvi: 'tent', mahina: 'stilt', mictla: 'platform', dorgu: 'yurt', nefer: 'adobe', garai: 'stonehut', bolota: 'stilt', harn: 'pithouse', elda: 'whitestone', hollin: 'stonehut' };
const ATT0 = { trade: 10, neutral: 0, grudge: -5, fear: -5, hostile: -15 };
const FAITH0 = { fianna: 75, yarvi: 70, mahina: 72, mictla: 85, dorgu: 60, nefer: 78, garai: 68, bolota: 70, harn: 80, elda: 90, hollin: 62 };

// ---------- 状態 ----------
let handlerOn = false;
export function ensureTribes(sim) {
  if (!handlerOn) { registerTribeHandler(tribeHandler); handlerOn = true; }
  const S = sim.S;
  if (!S.tribes) initTribes(sim);
  const X = S.tribes;
  X.arcs = X.arcs || []; X.away = X.away || []; X.legends = X.legends || {}; X.stats = X.stats || {}; X.hist = X.hist || [];
  return X;
}
const TS = (sim) => sim.S.tribes;
const vOf = (sim, vid) => TS(sim)?.villages[vid] || null;
const tribeOfV = (V) => tribeById(V.tribe);
const gOfV = (V) => guardianOfTribe(V.tribe);
export function villageOfPerson(sim, p) { const s = sim.town(p.s); return s?.tribal ? vOf(sim, s.tribeV) : null; }
export const isFreeTribal = (s) => !!(s && s.tribal && s.annexed == null);

// ========================================================================================
// 1. 村を置く
// ========================================================================================
export function initTribes(sim) {
  const S = sim.S, w = S.world, R = sim.rng;
  if (!handlerOn) { registerTribeHandler(tribeHandler); handlerOn = true; }
  ensureExpansion(sim);
  S.tribes = { v: 1, villages: [], pending: [], arcs: [], away: [], legends: {}, seq: 1, stats: { lots: 0, sent: 0, returned: 0, arcs: 0, endings: 0, slain: 0, trades: 0, gifts: 0, clashes: 0, annexed: 0 }, hist: [] };
  // 移住の仕組み（sim.immigration）がよその人を民族の村へ送りこまないよう、町ごとの基準人口を先に作っておく
  if (!S.initPop) { S.initPop = {}; for (const p of sim.living()) S.initPop[p.s] = (S.initPop[p.s] || 0) + 1; }
  const order = ORDER;
  const changed = [];
  const tribalPop = () => S.tribes.villages.reduce((n, V) => n + V.pop0, 0);
  // 1) 本体が用意した置き場（world.freeVillages の tribe:true）を使う。まわりの地形にいちばん合う民族を選ぶ
  for (const fv of (w.freeVillages || []).filter((v) => v.tribe && v.usedBy == null)) {
    if (S.tribes.villages.length >= MAX_VILLAGES || tribalPop() >= MAX_TRIBAL_POP - 40) break;
    const placed = new Set(S.tribes.villages.map((V) => V.tribe));
    const t = order.map(tribeById).filter((x) => x && !placed.has(x.id)).map((x, i) => ({ t: x, sc: biomeMatch(w, x, fv.x, fv.z, (fv.r || VR) + 6) - i * 0.01 })).sort((a, b) => b.sc - a.sc)[0]?.t;
    if (!t) break;
    const V = buildVillage(sim, t, { x: fv.x, z: fv.z }, changed);
    fv.usedBy = V.id;
  }
  // 2) 置き場が足りなければ、自分で奥地を探す
  for (const tid of order) {
    if (S.tribes.villages.length >= MAX_VILLAGES || tribalPop() >= MAX_TRIBAL_POP - 40) break;
    if (S.tribes.villages.some((V) => V.tribe === tid)) continue;
    const t = tribeById(tid);
    if (!t) continue;
    const want = 1;
    let made = 0;
    for (let n = 0; n < want; n++) {
      if (S.tribes.villages.length >= MAX_VILLAGES) break;
      const g = guardianOfTribe(t.id);
      const site = findVillageSite(sim, t).find((c) => !g || findLairSite(sim, { x: c.x, z: c.z, r: VR }, g, true));
      if (!site) break;
      buildVillage(sim, t, site, changed);
      made++;
    }
  }
  const placedAll = new Set(S.tribes.villages.map((V) => V.tribe));
  S.tribes.pending = TRIBES.map((t) => t.id).filter((id) => !placedAll.has(id));
  if (changed.length) sim.events.push({ type: 'tiles', list: [...new Set(changed)] });
  initLegends(sim);
  addLoreChronicle(sim);
  sim.dirty();
  sim._townMask = null;
  const names = S.tribes.villages.map((V) => `${tribeById(V.tribe).name}の${V.name}`);
  if (names.length) sim.pushLog(`地図の外の奥地には、国に属さない民が暮らしている：${names.join('、')}。`, 'event');
  return S.tribes;
}

// 奥地らしい場所を探す：民族の住む地形が多く、王国の町から遠く、魔界と特別な場所から離れた所
function findVillageSite(sim, t) {
  const S = sim.S, w = S.world, R = sim.rng;
  const tiles = new Set((t.tiles || [t.biome]).map(TILE).filter((x) => x != null));
  const isle = t.biome === 'ISLE', volcano = t.biome === 'VOLCANO';
  const others = S.tribes.villages;
  const specials = (w.specials || []).map((id) => w.buildings[id]).filter(Boolean);
  // 今の小さな世界は全マスを調べる。広い大陸は W・H に比例した回数だけくじで調べる
  const M = VR + 3;
  const tries = BIGW ? Math.round(4000 * LS * LS) : (W - 2 * M) * (H - 2 * M);
  const cands = [];
  for (let i = 0; i < tries; i++) {
    const x = BIGW ? R.int(M, W - 1 - M) : M + (i % (W - 2 * M)), z = BIGW ? R.int(M, H - 1 - M) : M + Math.floor(i / (W - 2 * M));
    const t0 = w.tiles[z * W + x];
    if (!tiles.has(t0) && !(isle && t0 === T.BEACH)) continue;
    const dTown = Math.min(...w.settlements.map((s) => Math.hypot(s.x - x, s.z - z) - s.r));
    if (dTown < MIN_TOWN + VR) continue;
    const dDemon = w.demon ? Math.hypot(w.demon.x - x, w.demon.z - z) - (w.demonR || 20) : 99;
    if (dDemon < VR + (volcano ? 1 : BIGW ? 20 : 6)) continue;   // 魔界のすぐそばは魔王軍の通り道（火の山の民だけは例外）
    if (specials.some((b) => cheb(b.x + (b.w >> 1), b.z + (b.d >> 1), x, z) < VR + MIN_SPECIAL)) continue;
    if (others.some((V) => cheb(V.x, V.z, x, z) < VR * 2 + (BIGW ? 8 * LS : 4))) continue;
    // まわりの地形
    let match = 0, walk = 0, sea = 0, road = 0, bad = 0, lava = 0, n = 0;
    const RR = VR + 1;
    for (let dz = -RR; dz <= RR; dz++) for (let dx = -RR; dx <= RR; dx++) {
      const tt = w.tiles[(z + dz) * W + x + dx]; n++;
      if (tiles.has(tt)) match++;
      if (walkable(tt)) walk++;
      if (tt === T.SEA || tt === T.DEEP) sea++;
      if (tt === T.ROAD || tt === T.BRIDGE) road++;
      if (tt === T.BLD || tt === T.WALL || tt === T.FIELD || tt === T.PASTURE || tt === T.FENCE || tt === T.PLAZA || tt === T.DOCK) bad++;
      if (tt === T.LAVA) lava++;
    }
    if (bad) continue;
    if (walk / n < (BIGW ? 0.72 : 0.6)) continue;
    if (!isle && sea > n * 0.3) continue;
    if (!BIGW && road > 8) continue;   // 街道が通っている所は奥地ではない
    const frac = match / n;
    if (frac < (isle ? 0.2 : BIGW ? 0.35 : 0.3)) continue;
    if (isle && sea < n * 0.08) continue;
    let sc = Math.min(dTown, 40 * LS) * 0.6 + frac * 18 - road * 1.5 + R.next() * 2;
    if (isle) sc += Math.min(sea, 30) * 0.3;
    if (volcano) sc += Math.min(lava, 6) * 2 - Math.max(0, dDemon - 20) * 0.3;
    cands.push({ x, z, dTown, frac, sc });
  }
  cands.sort((a, b) => b.sc - a.sc);
  // 近すぎる候補は1つにまとめる（よい順に30まで）
  const out = [];
  for (const c of cands) { if (out.every((o) => cheb(o.x, o.z, c.x, c.z) > 4)) out.push(c); if (out.length >= 30) break; }
  return out;
}

// その場所のまわりが、民族の住む地形にどれだけ合うか（0〜1）
function biomeMatch(w, t, x, z, r) {
  const tiles = new Set((t.tiles || [t.biome]).map(TILE).filter((v) => v != null));
  let m = 0, n = 0;
  for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) { if (!inb(x + dx, z + dz)) continue; n++; if (tiles.has(w.tiles[(z + dz) * W + x + dx])) m++; }
  return n ? m / n : 0;
}
// 地形を村の土地にならす（民族の家が建てられるように）
const BASE_OK = [T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH, T.FOREST];
const CLEAR = { [T.DENSE]: T.FOREST, [T.JUNGLE]: T.GRASS, [T.SWAMP]: T.GRASS, [T.ROCK]: T.GRASS, [T.PASTURE]: T.GRASS };
function nearestKingdom(w, x, z) {
  let best = null, bd = 1e9;
  for (const s of w.settlements) { if (s.tribal || s.kingdom == null || s.kingdom < 0) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best ? best.kingdom : 0;
}

function buildVillage(sim, t, site, changed) {
  const S = sim.S, w = S.world, R = sim.rng, X = S.tribes;
  const vid = X.villages.length;
  const sid = w.settlements.length;
  const names = TRIBE_NAMES[t.id]?.places || [t.self];
  const used = new Set(w.settlements.map((s) => s.name));
  const name = R.shuffle(names.slice()).find((n) => !used.has(n)) || `${t.self}の村`;
  const cx = site.x, cz = site.z;
  const h0 = Math.max(1, w.hgt[cz * W + cx]);
  // ならす
  for (let dz = -VR - 1; dz <= VR + 1; dz++) for (let dx = -VR - 1; dx <= VR + 1; dx++) {
    const x = cx + dx, z = cz + dz;
    if (!inb(x, z)) continue;
    const i = z * W + x, tt = w.tiles[i];
    const edge = Math.max(Math.abs(dx), Math.abs(dz)) > VR;
    if (tt === T.SEA || tt === T.DEEP || tt === T.PEAK || tt === T.LAVA || tt === T.RIVER) continue;
    if (edge) { w.hgt[i] = Math.round((w.hgt[i] + h0) / 2); continue; }
    w.hgt[i] = h0;
    if (CLEAR[tt] != null) { w.tiles[i] = CLEAR[tt]; changed.push(i); }
  }
  // 広場と十字の踏み分け道
  for (let dz = -VR; dz <= VR; dz++) for (let dx = -VR; dx <= VR; dx++) {
    const x = cx + dx, z = cz + dz, i = z * W + x, tt = w.tiles[i];
    const plaza = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
    if (!(plaza || dx === 0 || dz === 0)) continue;
    if (tt === T.RIVER) { w.tiles[i] = T.BRIDGE; changed.push(i); continue; }
    if (!walkable(tt) || tt === T.BLD) continue;
    w.tiles[i] = plaza ? T.PLAZA : T.ROAD; changed.push(i);
  }
  const faces = nearestKingdom(w, cx, cz);
  const s = {
    id: sid, name, type: 'village', kingdom: faces, x: cx, z: cz, r: VR, h: h0, buildings: [], plaza: { x: cx, z: cz, r: 1 },
    gates: [], guardposts: [], walls: [], tribal: true, tribe: t.id, tribeV: vid, faces,
  };
  w.settlements.push(s);
  // 柵：村の外周に丸太の柵。十字の道の出口だけ開ける
  for (let k = -VR - 1; k <= VR + 1; k++) for (const [x, z] of [[cx + k, cz - VR - 1], [cx + k, cz + VR + 1], [cx - VR - 1, cz + k], [cx + VR + 1, cz + k]]) {
    if (!inb(x, z)) continue;
    const i = z * W + x, tt = w.tiles[i];
    if (x === cx || z === cz) {   // 門：道を外へ2マスのばす
      if (walkable(tt) && tt !== T.BLD) { w.tiles[i] = T.ROAD; changed.push(i); }
      continue;
    }
    if (!walkable(tt) || tt === T.BLD || tt === T.ROAD || tt === T.BRIDGE) continue;
    if (t.id === 'dorgu' || t.id === 'yarvi') continue;   // 移り住む民は柵を持たない
    w.tiles[i] = T.FENCE; changed.push(i);
  }
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const gx = cx + dx * (VR + 1), gz = cz + dz * (VR + 1);
    for (let k = 2; k <= 3; k++) { const x = cx + dx * (VR + k), z = cz + dz * (VR + k); if (inb(x, z)) { const i = z * W + x, tt = w.tiles[i]; if (walkable(tt) && tt !== T.BLD && tt !== T.FENCE) { w.tiles[i] = T.ROAD; changed.push(i); } } }
    if (inb(gx, gz) && w.tiles[gz * W + gx] === T.ROAD) s.gates.push({ x: gx, z: gz, dx, dz });
  }
  // 建物（民族の村の建物は b.tribe と b.style を持つ）
  const land = [...BASE_OK, T.DENSE, T.JUNGLE, T.SWAMP, T.ROCK];
  const place = (type, bname, bw, bd, extra = {}, far = false) => {
    const streets = [];
    for (let z = cz - VR; z <= cz + VR; z++) for (let x = cx - VR; x <= cx + VR; x++) { const tt = w.tiles[z * W + x]; if (tt === T.ROAD || tt === T.PLAZA) streets.push({ x, z, d: Math.abs(x - cx) + Math.abs(z - cz) + R.next() * 2 }); }
    streets.sort((a, b) => (far ? b.d - a.d : a.d - b.d));
    const b = tryPlace(w, s, streets, type, bname, bw, bd, { land, extra: { tribe: t.id, style: HOUSE_STYLE[t.id] || 'hut', ...extra } }, R);
    if (b) { s.buildings.push(b.id); b.roof = 'tribal'; sim.events.push({ type: 'building', id: b.id }); }
    return b;
  };
  const g = guardianOfTribe(t.id);
  const shrine = place('shrine', t.look?.landmarks?.[0]?.replace(/（.*）/, '') || `${t.self}の祠`, 2, 2, { open: true, landmark: true });
  const hall = place('tavern', `${t.self}の集会所`, 3, 2, { hall: true });
  const V = {
    id: vid, tribe: t.id, sid, name, x: cx, z: cz, r: VR, faces, shrine: shrine?.id ?? null, hall: hall?.id ?? null,
    guardian: g ? g.id : null, cid: null, gstate: g ? (g.lair && g.power ? 'alive' : 'none') : 'none', lair: null,
    faith: FAITH0[t.id] ?? 70, att: KINGDOMS.map((_, k) => clamp((t.attitude?.toKingdom?.[k] || 0) + (ATT0[t.attitude?.default] || 0), -100, 100)),
    trade: KINGDOMS.map(() => false), ally: KINGDOMS.map(() => false), block: 0, annexed: null, renewed: false, lamps: 7,
    pop0: 0, lastTrade: {}, lastGift: -99, lastClash: -99, arcCool: {}, done: {}, founded: sim.today,
  };
  V.trade = V.att.map((a) => a >= 20);
  X.villages.push(V);
  // 町の蓄え（市場）：民族の産物が多め
  const stock = {}, price = {};
  for (const [k, G] of Object.entries(GOODS)) {
    const mine = (t.goods || []).includes(k);
    stock[k] = G.target * (mine ? 1.2 : k === 'wheat' || k === 'fish' || k === 'meat' ? 0.5 : 0.15);
    price[k] = G.base;
  }
  S.towns[sid] = { stock, price, commission: 0, fund: 40, history: [], occupied: false, damage: 0, unrest: 0, alms: 0, mats: {} };
  S.culture = S.culture || {};
  S.culture[sid] = (TRIBE_SPEECH[t.id]?.sayings || []).map((text) => ({ text, w: 2, origin: '祖先から' }));
  if (S.expansion) { S.expansion.sk[sid] = faces; (S.expansion.origK = S.expansion.origK || {})[sid] = faces; }
  // 村人
  populateVillage(sim, V, t, s);
  S.initPop[sid] = 1;   // よそからの移住（sim.immigration）は起こさない。民族の村は自分で人を呼ぶ
  // 守り神とすみか
  if (g) placeGuardian(sim, V, g, changed);
  // 民族の土地（村のまわりとすみかのまわり）
  markTribalLand(sim, V);
  return V;
}

function markTribalLand(sim, V) {
  const S = sim.S, tr = S.territory;
  if (!tr) return;
  const pts = [{ x: V.x, z: V.z, r: V.r + 4 * LS }];
  if (V.lair) pts.push({ x: V.lair.x, z: V.lair.z, r: Math.min(10, (gOfV(V)?.lair?.radius || 8) * 0.6) * LS });
  const CW = tr.cw, CH = tr.ch;
  for (let ci = 0; ci < CW * CH; ci++) {
    const cx = (ci % CW) * EXP_CS + (EXP_CS >> 1), cz = Math.floor(ci / CW) * EXP_CS + (EXP_CS >> 1);
    if (tr.owner[ci] >= 0) continue;
    if (tr.tribe?.[ci] >= 0) continue;
    if (!pts.some((p) => cheb(p.x, p.z, cx, cz) <= p.r + (EXP_CS >> 1))) continue;
    setTribalLand(sim, ci, V.id);
  }
}

// ---------- 村人 ----------
function tribeLook(t, R, sex) {
  const L = t.look || {};
  return {
    skin: R.pick(L.skin || ['#e8b98f']), hair: R.pick(L.hair || ['#3a2a1a']),
    shirt: L.clothes?.main || '#6a5a3a', pants: L.clothes?.accent || '#4a3a2a', trim: L.clothes?.trim || '#c8b890',
    hairStyle: R.int(0, 2), beard: sex === 'm' && R.chance(0.3), tribe: t.id, acc: R.pick(L.accessories || ['']),
  };
}
function makeTribal(sim, make, t, s, opt) {
  const R = sim.rng;
  const nm = tribeName(R, t.id, opt.sex) || { given: '名無し', family: t.self };
  const p = make({ sex: opt.sex, family: opt.family || nm.family, birthYear: opt.birthYear, father: opt.father, mother: opt.mother, given: nm.given, s: s.id, south: false });
  p.tribe = t.id;
  const lk = tribeLook(t, R, p.sex);
  if (opt.father && opt.mother) { lk.skin = R.pick([opt.father.look.skin, opt.mother.look.skin]); lk.hair = R.pick([opt.father.look.hair, opt.mother.look.hair]); }
  p.look = lk;
  if (R.chance(0.5)) p.saying = R.pick(TRIBE_SPEECH[t.id]?.sayings || [p.saying || '']);
  return p;
}
function initTribal(sim, p, job, pos) {
  const R = sim.rng, age = sim.ageOf(p);
  delete p.notes; delete p.anc2;
  p.job = age >= 14 && age < 68 ? job : null;
  if (age >= 68 && job) p.formerJob = job;
  p.rank = JOBS[p.job]?.rank || 'commoner';
  p.needs = { survival: 85, sleep: R.range(60, 95), hunger: R.range(60, 90), lust: R.range(50, 95), sloth: R.range(50, 90), pleasure: R.range(40, 90), esteem: R.range(40, 90) };
  if (age < 16) p.needs.lust = 100;
  p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = R.range(0.3, 0.9); p.workedToday = 0;
  p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = {}; p.danger = {}; p.fame = 0;
  p.lv = 1 + Math.floor(clamp((JOBS[p.job]?.combat || 0) * 2 + R.range(0, 3) + (age > 30 ? 1 : 0), 0, 9));
  if (p.job) p.skill[p.job] = clamp(0.25 + Math.min(age - 14, 30) / 40 + R.range(-0.1, 0.1), 0.05, 0.95);
  p.style = speechStyle(p, age); p.traits = traitLabels(p);
  p.inv = []; p.eq = {}; if (age >= 14) starterKit(p, R);
  p.purse = age < 14 ? R.int(0, 2) : R.int(2, 12);
  Object.assign(p, humanStats(sim, p)); p.hp = p.maxhp;
  p.pos = { x: pos.x, z: pos.z }; p.inside = null; p.path = []; p.action = null;
}

function populateVillage(sim, V, t, s) {
  const S = sim.S, R = sim.rng, Y = sim.year();
  const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
  const [lo0, hi0] = t.pop || [20, 40];
  // 広い大陸：民族の人口の目安どおり（ただし1村40〜80人、合計 MAX_TRIBAL_POP まで）。小さな世界：9〜18人
  const room = MAX_TRIBAL_POP - TS(sim).villages.reduce((n, v) => n + (v.pop0 || 0), 0);
  const target = BIGW ? clamp(R.int(lo0, hi0), 40, Math.max(40, Math.min(80, room))) : R.int(Math.max(9, Math.round(lo0 * 0.33)), Math.max(12, Math.round(hi0 * 0.25)));
  const clans = R.shuffle((TRIBE_NAMES[t.id]?.clans || [t.self]).slice());
  const people = [], families = [];
  const g = gOfV(V);
  // 家系の祖（亡くなった人）。記憶と昔話の種になる
  const ancestor = (clan, y) => {
    const a = makeTribal(sim, make, t, s, { sex: 'm', family: clan, birthYear: y });
    const b = makeTribal(sim, make, t, s, { sex: 'f', family: clan, birthYear: y + R.int(-3, 3) });
    a.spouseId = b.id; b.spouseId = a.id;
    for (const q of [a, b]) { q.deathYear = y + R.int(55, 75); q.deathCause = R.pick(['old', 'winter', 'sick']); q.deathDay = -1; delete q.notes; delete q.anc2; }
    a.deeds.push(R.pick(['村いちばんの狩人だった', '長老として村をまとめた', '祭りの歌を百も覚えていた', '若いころ守り神の姿を見た']));
    if (g?.offering?.major?.human && R.chance(0.5)) b.deeds.push(`若いころ${g.name}のもとへ送られ、一年ののちに戻った`);
    S.graves.push(a.id, b.id);
    return [a, b];
  };
  let ci = 0;
  // 長老の家
  const elderAge = R.int(60, 74);
  const [ga, gb] = ancestor(clans[ci % clans.length], Y - elderAge - R.int(24, 32));
  const elder = makeTribal(sim, make, t, s, { sex: R.chance(0.6) ? 'm' : 'f', family: clans[ci % clans.length], birthYear: Y - elderAge, father: ga, mother: gb });
  people.push(elder); families.push({ head: elder, members: [elder] });
  if (R.chance(0.6)) {
    const sp = makeTribal(sim, make, t, s, { sex: elder.sex === 'm' ? 'f' : 'm', family: elder.family, birthYear: Y - elderAge + R.int(-4, 4) });
    elder.spouseId = sp.id; sp.spouseId = elder.id; people.push(sp); families[0].members.push(sp);
  }
  ci++;
  // 夫婦と子ども（くじの年頃の若者も含む）
  while (people.length < target) {
    const clan = clans[ci % clans.length]; ci++;
    const age = R.int(36, 52);
    const [fa, fb] = ancestor(clan, Y - age - R.int(24, 32));
    const h = makeTribal(sim, make, t, s, { sex: 'm', family: clan, birthYear: Y - age, father: fa, mother: fb });
    const wf = makeTribal(sim, make, t, s, { sex: 'f', family: clan, birthYear: Y - age + R.int(-3, 5) });
    wf.birthFamily = R.pick(TRIBE_NAMES[t.id]?.clans || [clan]);
    h.spouseId = wf.id; wf.spouseId = h.id;
    const fam = { head: h, members: [h, wf] };
    people.push(h, wf);
    const nKids = R.int(1, 3);
    for (let k = 0; k < nKids && people.length < target + 1; k++) {
      const kidAge = k === 0 ? R.int(17, 26) : R.int(3, 16);
      if (age - kidAge < 18) continue;
      const c = makeTribal(sim, make, t, s, { sex: R.chance(0.5) ? 'm' : 'f', family: clan, birthYear: Y - kidAge, father: h, mother: wf });
      people.push(c); fam.members.push(c);
    }
    families.push(fam);
  }
  // 世帯と家
  for (const fam of families) {
    const hid = S.nextHh++;
    const hh = S.households[hid] = { id: hid, members: fam.members.map((p) => p.id), house: null, s: s.id, money: R.int(30, 80), food: fam.members.length * 4, comfort: 0, name: `${fam.head.family}の家`, land: 3, tribal: true };
    const b = placeHouseIn(sim, s, t, hh.name);
    if (b) { hh.house = b.id; b.hh = hid; b.owner = hid; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0; }
    else hh.street = true;
    for (const p of fam.members) p.hh = hid;
  }
  // 職業
  const adults = people.filter((p) => Y - p.birthYear >= 14);
  const liv = (t.livelihood || ['hunt']).map((l) => LIVE_JOB[l] || 'gatherer').filter((j) => JOBS[j]);
  const shaman = adults.filter((p) => p !== elder && Y - p.birthYear >= 25 && Y - p.birthYear < 62).sort((a, b) => (b.sex === 'f' ? 1 : 0) - (a.sex === 'f' ? 1 : 0) || b.values.faith - a.values.faith)[0];
  for (const p of people) {
    const home = S.households[p.hh]?.house != null ? sim.building(S.households[p.hh].house) : null;
    const pos = home ? home.door : { x: s.x, z: s.z };
    const job = p === elder ? 'tribe_elder' : p === shaman ? 'shaman' : R.pick(liv);
    initTribal(sim, p, job, pos);
    if (p === elder && Y - p.birthYear >= 68) { p.job = 'tribe_elder'; p.formerJob = null; }
  }
  V.elder = elder.id; V.shamanId = shaman?.id ?? null;
  V.pop0 = people.length;
  // 人間関係と記憶
  sim._kin.clear(); sim._anc.clear?.();
  sim.dirty();
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) linkPeople(sim, people[i], people[j]);
  for (const p of people) tribalMemories(sim, V, t, p);
}
function placeHouseIn(sim, s, t, name) {
  const w = sim.S.world, R = sim.rng;
  const land = [...BASE_OK, T.DENSE, T.JUNGLE, T.SWAMP, T.ROCK];
  for (let grow = 0; grow <= 4; grow += 2) {
    s.extraR = grow;
    const RR = s.r + grow;
    const streets = [];
    for (let z = s.z - RR; z <= s.z + RR; z++) for (let x = s.x - RR; x <= s.x + RR; x++) { if (!inb(x, z)) continue; const tt = w.tiles[z * W + x]; if (tt === T.ROAD || tt === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + R.next() * 5 }); }
    streets.sort((a, b) => a.d - b.d);
    const b = tryPlace(w, s, streets, 'house', name, 2, 2, { land, extra: { tribe: t.id, style: HOUSE_STYLE[t.id] || 'hut' } }, R);
    if (b) { s.extraR = 0; b.roof = 'tribal'; s.buildings.push(b.id); sim.events.push({ type: 'building', id: b.id }); return b; }
  }
  s.extraR = 0;
  return null;
}
function linkPeople(sim, a, b) {
  const R = sim.rng;
  if (a.rel[b.id]) return;
  const compat = 1 - (Math.abs(a.pers.E - b.pers.E) + Math.abs(a.pers.A - b.pers.A) + Math.abs(a.pers.O - b.pers.O) + Math.abs(a.values.faith - b.values.faith)) / 4;
  const base = (compat - 0.55) * 60 + (a.pers.A + b.pers.A - 1) * 15 + 8;   // 小さな村はみな顔見知り
  let fa = a.hh === b.hh ? 95 : 45, aa = base + R.gauss(0, 10), ab = base + R.gauss(0, 10);
  const kin = sim.kinTerm(a, b);
  if (kin) {
    fa = Math.max(fa, 70);
    const bonus = ['夫', '妻'].includes(kin) ? R.gauss(55, 20) : ['父', '母', '息子', '娘'].includes(kin) ? R.gauss(45, 18) : R.gauss(25, 15);
    aa += bonus; ab += bonus;
  }
  a.rel[b.id] = { a: clamp(aa, -100, 100), f: fa };
  b.rel[a.id] = { a: clamp(ab, -100, 100), f: fa };
}
function tribalMemories(sim, V, t, p) {
  const R = sim.rng, Y = sim.year(), age = sim.ageOf(p), g = gOfV(V);
  const at = (yearsAgo) => -yearsAgo * DAYS_PER_YEAR - R.int(1, DAYS_PER_YEAR - 1);
  if (age >= 6) sim.remember(p, `子どものころ、${V.name}の焚き火のそばで、${g ? g.name : '祖霊'}の昔話を聞いた`, { t: at(age - R.int(5, 9)), emo: 0.4, imp: 0.55, k: 'story' });
  for (const f of t.festivals || []) if (age >= 8 && R.chance(0.5)) sim.remember(p, `${f.name}の日のことをよく覚えている。${f.text.split('。')[0]}`, { t: at(R.int(1, Math.max(1, age - 6))), emo: 0.5, imp: 0.4, k: 'festival' });
  const hist = (t.history || []).filter((h) => h.y > p.birthYear + 6 && h.y <= Y);
  for (const h of hist) sim.remember(p, `${h.y}年、${loreText(h.text, loreCtx(sim, V))}のを覚えている`, { t: at(Y - h.y), emo: -0.1, imp: 0.6, k: 'story' });
  if (g?.offering?.major?.human && age >= 18 && R.chance(0.4)) {
    const ago = R.int(1, Math.min(age - 12, g.offering.major.cycleYears * 2));
    sim.remember(p, R.pick([`${ago}年前、くじの袋に手を入れたときの冷たさを覚えている`, `${ago}年前の約束の年、知り合いが${g.lair.name}へ送られていった`, '約束の年の夜は、村じゅうが静かになる']), { t: at(ago), emo: -0.6, imp: 0.7, k: 'offering' });
  }
  if (age >= 16 && R.chance(0.35)) {
    const k = V.att.indexOf(Math.min(...V.att));
    sim.remember(p, `${TRIBE_SPEECH[t.id]?.words?.kingdom || kname(k)}の話をすると、大人たちはいつも顔をしかめた`, { t: at(R.int(3, 20)), emo: -0.3, imp: 0.4, k: 'story' });
  }
  sim.trimMemories(p);
}

// ---------- 守り神のすみか ----------
function findLairSite(sim, V, g, probe = false) {
  const S = sim.S, w = S.world, R = sim.rng;
  const want = TILE(g.lair.biome);
  const sea = g.lair.biome === 'SEA';
  const lava = g.lair.biome === 'LAVA';
  const mask = townMask(sim);
  let best = null, bs = -Infinity;
  const maxD = Math.round(16 * LS);
  for (let i = 0; i < 1500; i++) {
    const x = V.x + R.int(-maxD, maxD), z = V.z + R.int(-maxD, maxD);
    if (!inb(x, z) || x < 2 || z < 2 || x > W - 3 || z > H - 3) continue;
    const d = cheb(x, z, V.x, V.z);
    if (d < V.r + 5) continue;
    const tt = w.tiles[z * W + x];
    if (mask[z * W + x]) continue;
    let sc = -Math.abs(d - (V.r + 8 * LS)) * 0.4 + R.next();
    if (sea) {
      if (tt !== T.SEA && tt !== T.DEEP) continue;
      const shore = [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]].some(([a, b]) => walkable(w.tiles[(z + b) * W + x + a]));
      if (!shore) continue;
      sc += 3;
    } else if (lava) {
      if (tt !== T.LAVA && tt !== T.ROCK && tt !== T.WASTE) continue;
      if (tt === T.LAVA) sc += 4;
    } else {
      if (!walkable(tt) || tt === T.BLD || tt === T.ROAD || tt === T.FENCE || tt === T.FIELD) continue;
      if (tt === want) sc += 5; else if (want === T.PEAK && tt === T.ROCK) sc += 4;
      if (w.buildings.some((b) => b.special && cheb(b.x, b.z, x, z) < 4)) continue;
    }
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best;
}
function placeGuardian(sim, V, g, changed) {
  const S = sim.S, w = S.world, R = sim.rng;
  let best = findLairSite(sim, V, g);
  if (!best) best = { x: clamp(V.x + V.r + 6, 3, W - 4), z: V.z };
  V.lair = { x: best.x, z: best.z, bid: null, name: g.lair.name };
  // すみかの目印（小さな祠）。歩ける場所ならその場に、海や溶岩なら岸に
  let mx = best.x, mz = best.z;
  if (!walkable(w.tiles[mz * W + mx]) || w.tiles[mz * W + mx] === T.BLD) {
    let bd = 99;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const x = best.x + dx, z = best.z + dz; if (!inb(x, z)) continue; const tt = w.tiles[z * W + x]; if (!walkable(tt) || tt === T.BLD || tt === T.ROAD) continue; const d = Math.abs(dx) + Math.abs(dz); if (d < bd) { bd = d; mx = x; mz = z; } }
  }
  const door = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b]) => ({ x: mx + a, z: mz + b })).find((q) => inb(q.x, q.z) && walkable(w.tiles[q.z * W + q.x]) && w.tiles[q.z * W + q.x] !== T.BLD);
  if (door && walkable(w.tiles[mz * W + mx])) {
    const id = w.buildings.length;
    w.tiles[mz * W + mx] = T.BLD; w.bldAt[mz * W + mx] = id; changed.push(mz * W + mx);
    const b = { id, type: 'shrine', name: g.lair.name, x: mx, z: mz, w: 1, d: 1, door, h: w.hgt[door.z * W + door.x], face: 'S', kingdom: -1, special: true, open: true, lair: true, guardian: g.id, tribe: V.tribe, style: 'lair', landmark: g.lair.landmark };
    w.buildings.push(b); w.specials.push(id);
    V.lair.bid = id;
    sim.events.push({ type: 'building', id });
  }
  if (g.sealed || SPECIES[g.species]?.sealed) { V.gstate = 'sealed'; V.lamps = 7; }
  spawnGuardian(sim, V, g, !!(g.sealed || SPECIES[g.species]?.sealed));
}
function spawnGuardian(sim, V, g, dormant = false) {
  if (!SPECIES[g.species]) return null;
  const c = makeCreature(sim, g.species, V.lair.x, V.lair.z, { lv: Math.max(3, g.power - 3), range: 3, dormant });
  if (!c || c.hp <= 0 || !sim.S.creatures[c.id]) { V.cid = null; return null; }
  c.title = g.name; c.named = true; c.guardian = g.id; c.tribeV = V.id; c.role = 'loner'; c.range = 3; c.home = { x: V.lair.x, z: V.lair.z };
  c.pos = { x: V.lair.x, z: V.lair.z };
  applyStats(c); c.hp = c.maxhp;
  c.calm = Infinity;   // ふだんは人を襲わない（荒ぶると calm を外す）
  V.cid = c.id;
  return c;
}
const guardianC = (sim, V) => (V.cid ? sim.S.creatures[V.cid] : null);

// ---------- 伝説の場所 ----------
function initLegends(sim) {
  const S = sim.S, w = S.world, R = sim.rng, X = S.tribes;
  for (const L of LEGENDS) {
    const e = X.legends[L.id] = X.legends[L.id] || { bid: null, heard: 0, posted: -99, found: false };
    if (L.site) { const b = w.buildings.find((q) => q.name === L.site); if (b) e.bid = b.id; continue; }
    const V = X.villages.find((v) => v.tribe === L.tribe);
    if (!V) continue;
    // 守り神そのものが番をしている伝説は、すみかの目印を使う
    const g = gOfV(V);
    if (g && (L.keeper === g.species || L.kind === 'seal')) { e.bid = V.lair?.bid ?? null; e.lairOf = V.id; continue; }
    if (L.biome === 'SEA') continue;
    const site = findLegendSite(sim, V, L);
    if (!site) continue;
    const bid = w.buildings.length;
    const door = { x: site.x + 1, z: site.z + 2 };
    for (let z = site.z; z < site.z + 2; z++) for (let x = site.x; x < site.x + 3; x++) { w.tiles[z * W + x] = T.BLD; w.bldAt[z * W + x] = bid; }
    const b = { id: bid, type: 'ruins', name: L.name, x: site.x, z: site.z, w: 3, d: 2, door, h: w.hgt[door.z * W + door.x], face: 'S', kingdom: -1, special: true, legend: L.id, tribe: L.tribe };
    w.buildings.push(b); w.specials.push(bid);
    e.bid = bid;
    sim.events.push({ type: 'building', id: bid });
    sim.events.push({ type: 'tiles', list: [site.z * W + site.x, site.z * W + site.x + 1, site.z * W + site.x + 2, (site.z + 1) * W + site.x, (site.z + 1) * W + site.x + 1, (site.z + 1) * W + site.x + 2] });
    if (L.keeper && SPECIES[L.keeper] && !SPECIES[L.keeper].guardian) {
      for (let i = 0; i < (SPECIES[L.keeper].monster ? 2 : 1); i++) {
        const c = makeCreature(sim, L.keeper, door.x, door.z, { lair: bid, role: 'guardian', lv: 1 + Math.round(L.danger / 3), range: 4 });
        if (c && c.hp > 0) c.legend = L.id;
      }
    }
  }
}
function findLegendSite(sim, V, L) {
  const w = sim.S.world, R = sim.rng;
  const want = TILE(L.biome);
  const mask = townMask(sim);
  let best = null, bs = -Infinity;
  const maxD = Math.round(22 * LS);
  for (let i = 0; i < 1200; i++) {
    const x = V.x + R.int(-maxD, maxD), z = V.z + R.int(-maxD, maxD);
    if (x < 3 || z < 3 || x > W - 6 || z > H - 6) continue;
    let ok = true, match = 0;
    for (let dz = 0; dz <= 2 && ok; dz++) for (let dx = 0; dx < 3; dx++) {
      const tt = w.tiles[(z + dz) * W + x + dx];
      if (!walkable(tt) || tt === T.BLD || tt === T.ROAD || tt === T.FENCE || tt === T.FIELD || tt === T.PLAZA || mask[(z + dz) * W + x + dx]) { ok = false; break; }
      if (tt === want) match++;
    }
    if (!ok) continue;
    if (w.buildings.some((b) => b.special && cheb(b.x, b.z, x, z) < 6 * LS)) continue;
    const d = cheb(x, z, V.x, V.z);
    if (d < V.r + 6) continue;
    const sc = match * 2 - Math.abs(d - 14 * LS) * 0.2 + R.next();
    if (sc > bs) { bs = sc; best = { x, z }; }
  }
  return best;
}

// 年代記に民族の歴史を混ぜる（置かれた民族と、どこにも属さない伝説だけ）
function addLoreChronicle(sim) {
  const S = sim.S;
  const placed = new Set(S.tribes.villages.map((V) => V.tribe));
  const ctx = loreCtx(sim, null);
  const have = new Set(S.chronicle.map((c) => c.text));
  const oldYears = new Set(S.chronicle.filter((c) => c.y < 0).map((c) => c.y));   // 建国前の年は history.js がすでに書いている
  for (const e of LORE_TIMELINE) {
    if (e.tribe && !placed.has(e.tribe)) continue;
    if (e.y > sim.year()) continue;
    if (e.y < 0 && oldYears.has(e.y)) continue;
    const key = `${e.y}:${e.tribe}`;
    if (have.has(key)) continue;   // 同じ年・同じ民族の出来事は1つだけ（年表と民族の歴史の重なり）
    const text = loreText(e.text, ctx);
    if (have.has(text)) continue;
    have.add(key);
    S.chronicle.push({ y: e.y, k: e.k, text, lore: true });
  }
  S.chronicle.sort((a, b) => a.y - b.y);
}

// 物語の札
function demonLords(sim) {
  const X = TS(sim);
  if (X && X._lords && X._lordsN === sim.S.chronicle.length) return X._lords;
  const lords = [];
  for (const c of sim.S.chronicle) { const m = /第\d+代(魔王[^がの]+)が魔界ネクロスに現れ/.exec(c.text || ''); if (m) lords.push({ name: m[1], from: c.y }); }
  if (X) { X._lords = lords; X._lordsN = sim.S.chronicle.length; }
  return lords;
}
function loreCtx(sim, V, extra = {}) {
  const t = V ? tribeOfV(V) : null, g = V ? gOfV(V) : null;
  const k = extra.k ?? V?.faces ?? 0;
  const king = sim.S.people[sim.S.kingdoms?.[k]?.kingId];
  return {
    demonLords: demonLords(sim), tribe: t?.name || '奥地の民', village: V?.name || '奥地の村', guardian: g?.name || '守り神', lair: V?.lair?.name || g?.lair?.name || 'すみか',
    kingdom: kname(k), king: king ? `${king.given}王` : '王', demon: sim.S.demon?.name || '魔王', year: sim.year(), ...extra.names,
  };
}

// ========================================================================================
// 2. 毎日・毎時
// ========================================================================================
export function tribesHourly(sim) {
  const S = sim.S, X = S.tribes;
  if (!X || !X.villages.length) return;
  const h = Math.floor(sim.hour());
  guardianWard(sim);
  // 分け合い：朝から晩まで、蔵の乏しい家に里の蓄えを分ける
  if (h >= 6 && h <= 20) for (const V of X.villages) if (!V.gone) shareFood(sim, V);
  if (h < 8 || h > 19) return;
  // 村に着いたよそ者（行商人・旅人・冒険者）
  for (const V of X.villages) {
    const s = sim.town(V.sid);
    if (!s || V.gone) continue;
    for (const p of sim.living()) {
      if (p.s === V.sid || p.tribe === V.tribe || p.inside != null || !p.pos) continue;
      if (cheb(p.pos.x, p.pos.z, V.x, V.z) > V.r + 2) continue;
      visitorArrived(sim, V, p);
    }
  }
}

// 守り神の加護：守り神が健在なあいだ、縄張りの魔物や猛獣は村に近づかない（討たれると、この守りが消える）
function guardianWard(sim) {
  const S = sim.S, R = sim.rng, X = S.tribes;
  for (const V of X.villages) {
    if (V.gone || !['alive', 'angry', 'sealed'].includes(V.gstate)) continue;
    const g = gOfV(V);
    const reach = V.r + Math.round(8 * LS);
    let drove = 0;
    for (const c of Object.values(S.creatures)) {
      if (c.hp <= 0 || c.guardian || c.owner != null || c.inDungeon || c.dormant) continue;
      const def = SPECIES[c.sp];
      if (!def || !(c.hostile || (def.diet === 'meat' && def.atk >= 8))) continue;
      if (cheb(c.pos.x, c.pos.z, V.x, V.z) > reach) continue;
      if (c.occupier != null) continue;
      if (c.raid === V.sid) c.raid = null;
      const dx = c.pos.x - V.x, dz = c.pos.z - V.z, d = Math.hypot(dx, dz) || 1;
      const far = reach + 12;
      const hx = clamp(Math.round(V.x + dx / d * far), 2, W - 3), hz = clamp(Math.round(V.z + dz / d * far), 2, H - 3);
      c.home = { x: hx, z: hz }; c.goal = { x: hx, z: hz, run: true, path: true }; c.path = null; c.fleeUntil = S.t + 90;
      drove++;
    }
    if (drove && sim.today !== V.wardDay) {
      V.wardDay = sim.today;
      if (R.chance(0.3)) sim.pushLog(`${V.name}に近づいた魔物が、${g?.name || '守り神'}の気配におびえて引き返していった。`, 'event', [], V);
    }
  }
}

export function tribesDaily(sim) {
  const S = sim.S;
  const X = ensureTribes(sim);
  if (!X.villages.length) return;
  const year = sim.year(), doy = sim.dayOfYear(), si = sim.seasonIdx(), dis = doy % DAYS_PER_SEASON;
  for (const V of X.villages) {
    if (V.gone) continue;
    const s = sim.town(V.sid);
    if (!s) continue;
    // 戦などで村の持ち主が変わっていたら、併合されたとみる
    if (V.annexed == null && s.kingdom !== V.faces) annexVillage(sim, V, s.kingdom, 'conquest');
    fixVillagers(sim, V, s);
    commons(sim, V, s);
    guardianWatch(sim, V);
    offerings(sim, V, year, si, dis);
    festivals(sim, V, si, dis);
    kingdomRelations(sim, V);
    triggers(sim, V);
  }
  awayDaily(sim);
  legendsDaily(sim);
  globalTriggers(sim);
  stepArcs(sim);
  if (sim.today % 5 === 0) {
    X.popHist = X.popHist || [];
    X.popHist.push({ d: sim.today, pop: X.villages.map((V) => sim.living().filter((p) => p.s === V.sid).length), faith: X.villages.map((V) => Math.round(V.faith)) });
    if (X.popHist.length > 200) X.popHist.shift();
  }
}

// ---------- 村人の手入れ：民族の仕事・名前・見た目を保つ ----------
function fixVillagers(sim, V, s) {
  const t = tribeOfV(V), R = sim.rng, S = sim.S;
  const liv = (t.livelihood || ['hunt']).map((l) => LIVE_JOB[l] || 'gatherer').filter((j) => JOBS[j]);
  let elder = S.people[V.elder];
  const here = sim.living().filter((p) => p.s === V.sid);
  for (const p of here) {
    if (!p.tribe) {
      // 民族の母から生まれた子（tribeBirth がつながっていないときの保険）と、嫁いできた人
      const m = S.people[p.motherId];
      if (m?.tribe === V.tribe && sim.ageOf(p) < 1) nameNewborn(sim, p, t);
      else if (sim.ageOf(p) >= 16 && !p.outsider) { p.outsider = true; sim.remember(p, `${V.name}に移り住み、${t.name}の暮らしを覚えはじめた`, { emo: 0.3, imp: 0.6, k: 'arrival' }); }
    }
    const age = sim.ageOf(p);
    if (p.job && !TRIBAL_JOBS.has(p.job) && !isAdventurer(p) && age >= 14 && age < 68) {
      p.job = R.pick(liv); p.rank = JOBS[p.job].rank; p.skill[p.job] = Math.max(p.skill[p.job] || 0, 0.3); p.plan = null; p.shop = null;
    }
  }
  if (!elder || elder.deathYear != null || elder.s !== V.sid) {
    const next = here.filter((p) => sim.ageOf(p) >= 45 && !p.away).sort((a, b) => (b.fame + sim.ageOf(b)) - (a.fame + sim.ageOf(a)))[0];
    if (next) {
      V.elder = next.id; next.job = 'tribe_elder'; next.rank = JOBS.tribe_elder.rank; next.formerJob = null;
      sim.remember(next, `${V.name}の長老に選ばれた`, { emo: 0.5, imp: 0.9, k: 'tribe' });
      if (elder) sim.pushLog(`${tribeOfV(V).name}の${V.name}で、${sim.fullName(next)}が新しい長老になった。`, 'event', [next.id], s);
    }
  }
}
function nameNewborn(sim, c, t) {
  const R = sim.rng, old = c.given;
  const n = TRIBE_NAMES[t.id];
  if (n) { c.given = R.pick(c.sex === 'f' ? n.female : n.male); }
  c.tribe = t.id;
  const m = sim.S.people[c.motherId], f = sim.S.people[c.fatherId];
  const lk = tribeLook(t, R, c.sex);
  lk.skin = R.pick([m?.look?.skin, f?.look?.skin].filter(Boolean).concat([lk.skin]));
  lk.hair = R.pick([m?.look?.hair, f?.look?.hair].filter(Boolean).concat([lk.hair]));
  c.look = { ...c.look, ...lk };
  if (m && m.memories) for (const mm of m.memories) if (mm.txt.includes(`の${old}が生まれた`)) mm.txt = mm.txt.replace(`の${old}が生まれた`, `の${c.given}が生まれた`);
  if (f && f.memories) for (const mm of f.memories) if (mm.txt.includes(`の${old}が生まれた`)) mm.txt = mm.txt.replace(`の${old}が生まれた`, `の${c.given}が生まれた`);
}
// birth の最後で呼ぶ：民族の親から生まれた子に、民族の名前と見た目を
export function tribeBirth(sim, c, mother, father) {
  const tid = mother?.tribe || father?.tribe;
  if (!tid) return;
  const t = tribeById(tid);
  if (t) nameNewborn(sim, c, t);
}

// ---------- 村のくらし：森・海・畑の恵み（小さな村が飢えないように） ----------
function commons(sim, V, s) {
  const S = sim.S, t = tribeOfV(V), m = S.towns[V.sid];
  const here = sim.living().filter((p) => p.s === V.sid);
  const workers = here.filter((p) => sim.isAdult(p) && p.job && sim.ageOf(p) < 68).length;
  const sm = [0.8, 1, 1.2, 0.6][sim.seasonIdx()];
  // 民族の産物が少しずつ村の蓄えにたまる
  for (const g of t.goods || []) if (m.stock[g] != null && m.stock[g] < GOODS[g].target * 1.6) m.stock[g] += 0.25 * workers * sm;
  // 分け合い：食べ物に困っている家に、里の蓄えから分ける（食べ物もお金も湧かせない。里の仕事でとれた分だけを分ける）
  shareFood(sim, V);
  // 人が減った村には、奥の集落から親戚の一家が移ってくる
  if (here.length < Math.max(6, V.pop0 * 0.7) && sim.rng.chance(0.08)) kinArrive(sim, V, s);
}
// ---------- 里の仕事：とれた獲物・魚・木の実・薬草は、家の蔵と里の蓄えへ（お金は動かない） ----------
// sim.js の doWork の switch の前で呼ぶ：if (tribeWork(this, p, dt, eff)) return;
//   本当を返したら、本体の仕事（市場に売ってお金を受け取る処理）はしない。
//   狩人は偽を返す：本体の「獲物を見つけて戦う」も続けて行う。
// 出どころ：里の人の働き。行き先：まず働いた人の家の蔵（家族の4食分まで）、残りは里の分け合いの蓄え（村の市場の在庫）。
const TRIBE_FOOD = { hunter: ['meat', 1.8], fisher: ['fish', 1.7], gatherer: ['fruit', 1.3], farmer: ['wheat', 1.4] };
const TRIBE_CRAFT = { weaver: ['cloth', 0.25], potter: ['pottery', 0.3], miner: ['ore', 0.9], shaman: ['herbs', 0.5], gatherer: ['herbs', 0.25] };
// 職人の里でも、手のあいた時に小さな畑と家畜の世話をする（その分の食べ物）
const TRIBE_SIDE_FOOD = { weaver: 0.6, potter: 0.6, miner: 0.6 };
const FOODS = ['meat', 'fish', 'bread', 'wheat', 'fruit', 'cured', 'cheese', 'honey'];
const FOOD_SM = [0.9, 1.1, 1.3, 0.6];   // 春・夏・秋・冬の恵み
export function tribeWork(sim, p, dt, eff) {
  const s = sim.town(p.s);
  if (!s?.tribal || s.annexed != null) return false;
  const S = sim.S, m = S.towns[p.s], hh = sim.hh(p);
  if (!m || !hh || !TRIBAL_JOBS.has(p.job)) return false;
  const si = sim.seasonIdx();
  const f = TRIBE_FOOD[p.job] || (TRIBE_SIDE_FOOD[p.job] ? ['wheat', TRIBE_SIDE_FOOD[p.job]] : null);
  if (f) {
    let g = f[0];
    if (!GOODS[g]) g = 'wheat';
    let mult = FOOD_SM[si];
    if (p.job === 'fisher' && si === 3) mult = 0.5;
    if (p.job === 'farmer') mult = [0.9, 1.3, 2.4, 0.25][si] * (S.harvest ?? 1);
    let meals = f[1] * mult * eff;
    // まず自分の家の蔵へ
    const want = hh.members.length * 4 - hh.food;
    if (want > 0 && hh.house != null) { const q = Math.min(want, meals); hh.food += q; meals -= q; }
    // 残りは里の分け合いの蓄えへ（蓄えがいっぱいなら、とりすぎないで森に残す）
    if (meals > 0) {
      const per = GOODS[g].meals || 1, cap = (GOODS[g].target || 10) * 3;
      if ((m.stock[g] || 0) < cap) m.stock[g] = (m.stock[g] || 0) + meals / per;
    }
  }
  const c = TRIBE_CRAFT[p.job];
  if (c && GOODS[c[0]] && (m.stock[c[0]] || 0) < (GOODS[c[0]].target || 10) * 2) m.stock[c[0]] = (m.stock[c[0]] || 0) + c[1] * eff;
  return p.job !== 'hunter';
}
// 分け合い：蔵の乏しい家に、里の蓄えの食べ物を分ける（蓄えから減った分だけ家に入る。お金は動かない）
function shareFood(sim, V) {
  const S = sim.S, m = S.towns[V.sid];
  if (!m) return;
  for (const hh of Object.values(S.households)) {
    if (hh.s !== V.sid || hh.house == null || !hh.members.length) continue;
    const n = hh.members.length;
    if (hh.food >= n * 1.5) continue;
    for (const g of FOODS) {
      if (hh.food >= n * 3) break;
      const per = GOODS[g]?.meals || 0;
      if (!per || !(m.stock[g] >= 0.5)) continue;
      const q = Math.min(m.stock[g], (n * 3 - hh.food) / per);
      m.stock[g] -= q; hh.food += q * per;
    }
  }
}
function kinArrive(sim, V, s) {
  const S = sim.S, R = sim.rng, t = tribeOfV(V), Y = sim.year();
  const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
  const clan = R.pick(TRIBE_NAMES[t.id]?.clans || [t.self]);
  const a = makeTribal(sim, make, t, s, { sex: 'm', family: clan, birthYear: Y - R.int(22, 38) });
  const b = makeTribal(sim, make, t, s, { sex: 'f', family: clan, birthYear: Y - R.int(20, 36) });
  a.spouseId = b.id; b.spouseId = a.id;
  const mem = [a, b];
  if (R.chance(0.6)) mem.push(makeTribal(sim, make, t, s, { sex: R.chance(0.5) ? 'm' : 'f', family: clan, birthYear: Y - R.int(1, 10), father: a, mother: b }));
  const hid = S.nextHh++;
  const hh = S.households[hid] = { id: hid, members: mem.map((p) => p.id), house: null, s: s.id, money: R.int(20, 50), food: mem.length * 4, comfort: 0, name: `${clan}の家`, land: 3, tribal: true };
  const b0 = s.buildings.map((id) => sim.building(id)).find((q) => q.type === 'house' && q.hh == null) || placeHouseIn(sim, s, t, hh.name);
  if (b0) { hh.house = b0.id; b0.hh = hid; b0.owner = hid; b0.name = hh.name; b0.value = b0.value || houseValue(sim, b0); b0.rent = 0; }
  else hh.street = true;
  const liv = (t.livelihood || ['hunt']).map((l) => LIVE_JOB[l] || 'gatherer').filter((j) => JOBS[j]);
  for (const p of mem) { p.hh = hid; initTribal(sim, p, R.pick(liv), b0 ? b0.door : { x: s.x, z: s.z }); sim.remember(p, `奥の集落から、親戚を頼って${V.name}へ移ってきた`, { emo: 0.4, imp: 0.9, k: 'arrival' }); }
  sim.dirty(); sim._kin.clear();
  const locals = sim.living().filter((q) => q.s === V.sid);
  for (const p of mem) for (const q of locals) if (p !== q) linkPeople(sim, p, q);
  sim.pushLog(`${t.name}の${V.name}に、奥の集落から${sim.fullName(a)}の一家が移ってきた。`, 'event', [a.id], s);
}

// ---------- 守り神の見張り ----------
function guardianWatch(sim, V) {
  const g = gOfV(V);
  if (!g || !V.lair) return;
  const c = guardianC(sim, V);
  if (V.gstate === 'sealed') return;
  if ((V.gstate === 'alive' || V.gstate === 'angry' || V.gstate === 'woken') && !c) {
    // 討たれた（誰が討ったかは、記憶と戦いの記録からさがす）
    const slayer = sim.living().filter((p) => p.memories?.some((m) => m.txt.startsWith(`${g.name}を倒した`) && sim.today - m.t <= 2))[0] || null;
    V.gstate = 'slain'; V.slainDay = sim.today;
    TS(sim).stats.slain++;
    if (!TS(sim).arcs.some((a) => a.arc === 'guardian_fallout' && a.vid === V.id && !a.done)) startArc(sim, 'guardian_fallout', V, { slayer: slayer?.id ?? null }, { k: slayer ? sim.townOf(slayer)?.kingdom : V.faces });
    return;
  }
  if (!c) return;
  // すみかから離れない。荒ぶっているときだけ近づく者を襲う
  c.home = { x: V.lair.x, z: V.lair.z };
  if (V.gstate === 'angry' && sim.today < (V.angryUntil || 0)) { c.calm = null; c.guard = false; c.hostile = true; }
  else if (V.gstate === 'woken') { c.calm = null; c.hostile = true; }
  else { c.calm = Infinity; c.hostile = SPECIES[c.sp]?.kind === 'hostile'; if (V.gstate === 'angry') { V.gstate = 'alive'; sim.pushLog(`${g.name}の怒りがおさまった。${V.name}の人々はほっと息をついた。`, 'event', [], V.lair); } }
}

// ---------- 供物と約束 ----------
const seasonOf = (name) => { const i = SEASONS.indexOf(name); return i < 0 ? null : i; };
function majorSeason(g, t) {
  const m = seasonOf(g.offering?.minor?.season);
  if (m != null) return m;
  const f = (t.festivals || []).find((x) => /約束|番|火渡り|灯|送り|返し|十分の一/.test(x.name + x.text)) || t.festivals?.[0];
  return seasonOf(f?.season) ?? 2;
}
function offerings(sim, V, year, si, dis) {
  const g = gOfV(V), t = tribeOfV(V), S = sim.S, m = S.towns[V.sid];
  if (!g || V.gstate === 'slain' || V.gstate === 'gone' || V.gstate === 'none') return;
  const minor = g.offering?.minor;
  // 毎年（または季節ごと）の小さな供物：その季節の4日目
  if (minor && dis === 3 && (minor.every === 'season' || seasonOf(minor.season) === si)) {
    let short = 0;
    for (const [k, n] of Object.entries(minor.goods || {})) { const have = m.stock[k] || 0; if (have >= n) m.stock[k] = have - n; else { short += n - have; m.stock[k] = 0; } }
    const shaman = S.people[V.shamanId] || S.people[V.elder];
    const from = sim.dayIndex * 1440 + 9 * 60;
    if (V.shrine != null) S.gatherings.push({ type: 'pray', place: 'shrine', from, to: from + 120, s: V.sid, label: `${g.name}への供物` });
    if (short > 2) { V.faith = clamp(V.faith - 2, 0, 100); if (sim.rng.chance(0.25)) breakPromise(sim, V, '供物が足りなかった'); }
    else if (shaman && shaman.deathYear == null) sim.remember(shaman, `${loreText(minor.text, loreCtx(sim, V))}。${g.name}は受け取ってくれたようだ`, { emo: 0.4, imp: 0.4, k: 'offering' });
    if (V.gstate === 'angry' && short <= 2 && sim.rng.chance(0.5)) { V.angryUntil = sim.today; }
  }
  // 大きな約束の年
  if (!offeringDue(g, year) || V.majorYear === year) return;
  const ms = majorSeason(g, t);
  if (si !== ms) return;
  const major = g.offering.major;
  if (dis === 0 && !V.majorStarted) {
    V.majorStarted = year;
    if (major.human && !V.renewed && V.gstate !== 'sealed') {
      if (V.faith < 40 && sim.rng.chance(0.4)) startArc(sim, 'faith_schism', V, {}, {});
      else startLot(sim, V, g);
    } else if (major.human && V.gstate === 'sealed') {
      startLot(sim, V, g);   // 灯守の志願（エルダ）
    } else {
      const need = major.goods || {};
      const short = Object.entries(need).some(([k, n]) => (m.stock[k] || 0) < n);
      if (short) startArc(sim, 'lean_year', V, {}, { k: bestKingdom(V) });
      else V.pendingMajor = true;
    }
  }
  // 約束の日（季節の9日目）：供物を納める／若者を送り出す
  if (dis === 8) {
    V.majorYear = year; V.majorStarted = null;
    if (V.pendingMajor) { payMajor(sim, V, g); V.pendingMajor = false; }
    if (V.send) { sendOne(sim, V, g); }
  }
}
function payMajor(sim, V, g) {
  const m = sim.S.towns[V.sid], major = g.offering.major;
  for (const [k, n] of Object.entries(major.goods || {})) m.stock[k] = Math.max(0, (m.stock[k] || 0) - n);
  const text = loreText(major.text, loreCtx(sim, V));
  sim.chron(`${tribeOfV(V).name}の${V.name}が、${g.name}との約束を果たした（${text.replace(/。$/, '')}）`, undefined);
  sim.pushLog(`${V.name}で大きな約束の日。${text}。`, 'event', [], V.lair || V);
  V.faith = clamp(V.faith + 4, 0, 100);
  for (const p of sim.living().filter((q) => q.s === V.sid && sim.isAdult(q))) sim.remember(p, `約束の年。${text.replace(/。$/, '')}のを見届けた`, { emo: 0.2, imp: 0.7, k: 'offering' });
}
// くじ：18歳以上（約束が決めた年ごろ）の大人だけ。子どもは決して選ばない
function eligibleYouth(sim, V, g) {
  const sel = g.offering.major.selection || { minAge: 18, maxAge: 30, unmarried: true };
  const minAge = Math.max(18, sel.minAge || 18), maxAge = sel.maxAge || 30;
  return sim.living().filter((p) => p.s === V.sid && p.tribe === V.tribe && sim.ageOf(p) >= minAge && sim.ageOf(p) <= maxAge && (!sel.unmarried || p.spouseId == null) && p.jail == null && !p.away && p.pregnant === 0);
}
function startLot(sim, V, g) {
  const R = sim.rng, S = sim.S, t = tribeOfV(V);
  const sel = g.offering.major.selection || {};
  const pool = eligibleYouth(sim, V, g);
  TS(sim).stats.lots++;
  if (!pool.length) {
    sim.chron(`${t.name}の${V.name}では約束の年にくじを引ける若者がおらず、長老たちが供物を倍にして${g.name}に詫びた`, undefined);
    const m = S.towns[V.sid]; for (const k of Object.keys(g.offering.minor?.goods || {})) m.stock[k] = Math.max(0, (m.stock[k] || 0) - 3);
    V.faith = clamp(V.faith - 5, 0, 100);
    return;
  }
  // 名乗り出る者がいれば、くじは引かない
  const vol = sel.volunteer !== false ? pool.filter((p) => p.values.courage > 0.72 && p.pers.A > 0.55).sort((a, b) => b.values.courage - a.values.courage)[0] : null;
  const youth = vol || R.pick(pool);
  const kin = [S.people[youth.fatherId], S.people[youth.motherId], ...sim.living().filter((q) => q.s === V.sid && ['兄', '弟', '姉', '妹'].includes(sim.kinTerm(q, youth)))].filter((q) => q && q.deathYear == null && !q.away)[0] || null;
  V.send = { pid: youth.id, day: sim.today, vol: !!vol };
  if (sel.method === 'volunteer') {
    // 灯守：志願した大人が生涯の灯守になる（物語の筋は動かさず、送り出しだけ）
    sim.pushLog(`${V.name}で、${sim.fullName(youth)}が灯守に志願した。`, 'event', [youth.id], youth.pos);
    sim.remember(youth, '灯守に志願した。塔に入れば二度と谷の外へは出られない', { emo: -0.2, imp: 1, k: 'offering' });
    return;
  }
  startArc(sim, 'lot_and_rescuer', V, { youth: youth.id, kin: kin?.id ?? null, elder: V.elder, vol: !!vol }, { k: V.faces });
}
// 送り出し：送られた人はいったん世界から離れる（死ではない。deathCause='sent'。戻ってくる者もいる）
function sendOne(sim, V, g) {
  const S = sim.S, t = tribeOfV(V);
  const p = S.people[V.send.pid];
  V.send = null;
  if (!p || p.deathYear != null || p.s !== V.sid && !p.sentInstead) return;
  const major = g.offering.major;
  const back = (major.returns || 0) > 0;
  const fateTxt = { orvan: '森守として森へ入った', waimoana: '花の舟で環礁へ送られた', yowali: '蛇の巫として石段を登った', vodnik: '沼の花嫁（花婿）として浮島へ渡った', ashking: '灯守として塔に入った' }[g.id] || `${g.lair.name}へ送られた`;
  const from = sim.dayIndex * 1440 + 17 * 60;
  S.gatherings.push({ type: 'festival', place: 'shrine', from, to: from + 180, s: V.sid, label: `${g.name}への送り` });
  for (const q of sim.living().filter((x) => x.s === V.sid && x !== p)) {
    const term = sim.kinTerm(q, p);
    sim.remember(q, term ? `${term}の${p.given}が${fateTxt}` : `${p.given}が${fateTxt}のを見送った`, { emo: term ? -0.9 : -0.5, imp: term ? 1 : 0.7, about: [p.id], k: 'offering' });
  }
  sim.remember(p, `約束の日、${fateTxt}`, { emo: -0.4, imp: 1, k: 'offering' });
  sim.chron(`${t.name}の${V.name}で、${sim.fullName(p)}が${fateTxt}（${p.sentInstead ? '身代わり' : 'くじ'}）`, undefined);
  sim.news(`${t.name}の${V.name}で、約束の日に${p.given}が${fateTxt}`, 2, V.lair || V);
  goAway(sim, p, V, back ? sim.today + DAYS_PER_YEAR + 1 : null, g.id, major.returns || 0);
  TS(sim).stats.sent++;
  if (g.id === 'waimoana') V.lastSent = { pid: p.id, year: sim.year() };
}
function goAway(sim, p, V, until, gid, backChance = 1) {
  const S = sim.S;
  const hh = sim.hh(p);
  if (hh) {
    hh.members = hh.members.filter((id) => id !== p.id);
    if (!hh.members.length) {
      const b = hh.house != null ? sim.building(hh.house) : null;
      if (b && b.type === 'house') { b.hh = null; b.name = '空き家'; }
      transferEstate(sim, hh, null);
      delete S.households[hh.id];
    }
  }
  if (p.talk) { const o = S.people[p.talk.a === p.id ? p.talk.b : p.talk.a]; if (o) o.talk = null; p.talk = null; }
  p.awayHh = p.hh; p.hh = null;
  p.away = { v: V.id, gid, from: sim.today, until };
  p.deathYear = sim.year(); p.deathDay = sim.today; p.deathCause = 'sent';
  p.action = null; p.path = []; p.inside = null; p.mission = null; p.fight = null; p.quest = null;
  if (p.spouseId != null && !until) { const sp = S.people[p.spouseId]; if (sp) { sp.exSpouses.push(p.id); sp.spouseId = null; } p.exSpouses.push(p.spouseId); p.spouseId = null; }
  TS(sim).away.push({ pid: p.id, v: V.id, until, gid, back: backChance });
  sim.dirty();
}
function awayDaily(sim) {
  const X = TS(sim), S = sim.S;
  for (const a of X.away.slice()) {
    if (a.until == null || sim.today < a.until) continue;
    X.away.splice(X.away.indexOf(a), 1);
    const p = S.people[a.pid], V = vOf(sim, a.v), g = GUARDIANS.find((x) => x.id === a.gid);
    if (!p || !V) continue;
    if (sim.rng.chance(a.back ?? 1)) comeBack(sim, p, V, g);
    else {
      // 戻らなかった者は、自分から守り神のそばに残る道を選んだ
      p.deathCause = 'stayed';
      const t = tribeOfV(V);
      const txt = g?.id === 'orvan' ? '梢の見張り番として森に残った' : g?.id === 'vodnik' ? '主さまの孤独を思って、浮島に残った' : `${g?.lair?.name || '守り神のもと'}に残った`;
      sim.chron(`${t.name}の${V.name}から送られた${sim.fullName(p)}は、一年たっても戻らなかった。${txt}という`, undefined);
      for (const q of sim.living().filter((x) => x.s === V.sid)) { const term = sim.kinTerm(q, p); if (term) sim.remember(q, `${term}の${p.given}は戻らなかった。${txt}のだと、長老は言った`, { emo: -0.7, imp: 0.9, about: [p.id], k: 'offering' }); }
    }
  }
}
function comeBack(sim, p, V, g, why = 'return') {
  const S = sim.S, R = sim.rng, s = sim.town(V.sid);
  p.deathYear = null; p.deathCause = null; p.deathDay = null; p.away = null;
  p.needs = p.needs || { survival: 80, sleep: 80, hunger: 70, lust: 70, sloth: 70, pleasure: 70, esteem: 60 };
  p.memories = p.memories || []; p.rel = p.rel || {}; p.gk = p.gk || {}; p.talkedToday = {}; p.recent = p.recent || []; p.q = p.q || {}; p.danger = p.danger || {};
  p.s = V.sid;
  let hh = S.households[p.awayHh];
  if (!hh) hh = [S.people[p.fatherId], S.people[p.motherId]].map((q) => q && q.deathYear == null && q.s === V.sid ? sim.hh(q) : null).find(Boolean);
  if (!hh) {
    const hid = S.nextHh++;
    hh = S.households[hid] = { id: hid, members: [], house: null, s: V.sid, money: 20, food: 4, comfort: 0, name: `${p.family}の家`, land: 3, tribal: true };
    const b = s.buildings.map((id) => sim.building(id)).find((q) => q.type === 'house' && q.hh == null) || placeHouseIn(sim, s, tribeOfV(V), hh.name);
    if (b) { hh.house = b.id; b.hh = hid; b.owner = hid; b.name = hh.name; } else hh.street = true;
  }
  hh.members.push(p.id); p.hh = hh.id; p.awayHh = null;
  const home = hh.house != null ? sim.building(hh.house) : null;
  p.pos = home ? { ...home.door } : { x: V.x, z: V.z }; p.inside = null; p.path = []; p.action = null;
  // 一年を守り神のそばで過ごした人は、口数が減り、獣や主の気持ちがわかるようになる
  p.pers.E = clamp(p.pers.E - 0.15, 0.03, 0.97); p.pers.A = clamp(p.pers.A + 0.08, 0.03, 0.97); p.values.faith = clamp(p.values.faith + 0.1, 0.03, 0.97);
  p.skill.gatherer = Math.max(p.skill.gatherer || 0, 0.6);
  const txt = { orvan: '一年を森で過ごし、角の王の背から降りて村へ戻った', vodnik: '一年と一日を浮島で過ごし、主さまの昔話と薬の知恵を持って戻った' }[g?.id] || `${g?.lair?.name || '守り神のもと'}から戻った`;
  sim.remember(p, txt, { emo: 0.5, imp: 1, k: 'offering' });
  p.deeds.push(txt);
  p.style = speechStyle(p, sim.ageOf(p)); Object.assign(p, humanStats(sim, p)); p.hp = p.maxhp;
  sim.dirty(); sim._kin.clear();
  for (const q of sim.living().filter((x) => x.s === V.sid && x !== p)) { const term = sim.kinTerm(q, p); sim.remember(q, `${term ? term + 'の' : ''}${p.given}が${g?.lair?.name || '守り神のもと'}から戻ってきた`, { emo: 0.8, imp: term ? 0.95 : 0.6, about: [p.id], k: 'offering' }); }
  sim.chron(`${tribeOfV(V).name}の${V.name}で、${sim.fullName(p)}が${txt}`, undefined);
  sim.news(`${V.name}に、送られた${p.given}が戻ってきた`, 2, p.pos);
  TS(sim).stats.returned++;
}
function breakPromise(sim, V, why) {
  const g = gOfV(V);
  if (!g || !g.onBreak) return;
  V.gstate = 'angry'; V.angryUntil = sim.today + Math.round(DAYS_PER_YEAR / 2);
  V.faith = clamp(V.faith - 8, 0, 100);
  sim.chron(loreText(g.onBreak.chronicle, loreCtx(sim, V)), undefined);
  sim.news(`${V.name}：${loreText(g.onBreak.text, loreCtx(sim, V)).split('。')[0]}（${why}）`, 3, V.lair || V);
  onBreakEffect(sim, V, g.onBreak.effect);
}
// 約束が破れたときの災い（抽象的に：村の蓄え・気分・病・霧など）
function onBreakEffect(sim, V, eff) {
  const S = sim.S, m = S.towns[V.sid], R = sim.rng;
  const here = sim.living().filter((p) => p.s === V.sid);
  const nearTowns = S.world.settlements.filter((s) => !s.tribal && Math.hypot(s.x - V.x, s.z - V.z) < 45 * LS);
  switch (eff) {
    case 'blight': m.stock.meat = 0; break;
    case 'blizzard': case 'fog': case 'storm': case 'drought': case 'quake': case 'eruption': case 'closed':
      for (const k of ['meat', 'fish', 'wheat']) m.stock[k] = (m.stock[k] || 0) * 0.3;
      for (const s of nearTowns) { const t = S.towns[s.id]; if (t) t.stock.wheat *= 0.8; }
      break;
    case 'plague': {
      for (const p of R.shuffle(here.slice()).slice(0, 2)) p.hp = Math.max(1, p.hp * 0.5);
      break;
    }
    case 'unseal': V.lamps = Math.max(0, (V.lamps ?? 7) - 1); break;
  }
  for (const p of here) sim.remember(p, `${gOfV(V)?.name}が怒っている。村の空気が重い`, { emo: -0.7, imp: 0.8, k: 'offering' });
  for (const s of nearTowns) for (const p of sim.living().filter((q) => q.s === s.id && R.chance(0.15))) sim.remember(p, `奥地のほうで、何か悪いことが起きているらしい`, { emo: -0.3, imp: 0.4, k: 'rumor' });
}

// ---------- 祭り ----------
function festivals(sim, V, si, dis) {
  const t = tribeOfV(V), S = sim.S;
  if (dis !== 5) return;
  for (const f of t.festivals || []) {
    if (seasonOf(f.season) !== si) continue;
    const from = sim.dayIndex * 1440 + 16 * 60;
    S.gatherings.push({ type: 'festival', place: 'plaza', from, to: from + 6 * 60, s: V.sid, label: f.name });
    sim.pushLog(`${t.name}の${V.name}で「${f.name}」。${f.text}`, 'event', [], V);
    for (const p of sim.living().filter((q) => q.s === V.sid && sim.ageOf(q) >= 6 && sim.rng.chance(0.5))) sim.remember(p, `今年も${f.name}の日が来た`, { emo: 0.6, imp: 0.4, k: 'festival' });
  }
}

// ---------- 王国との関係 ----------
function bestKingdom(V) { let k = V.faces, b = -999; V.att.forEach((a, i) => { if (a > b) { b = a; k = i; } }); return k; }
function kingdomRelations(sim, V) {
  const S = sim.S, R = sim.rng, t = tribeOfV(V), s = sim.town(V.sid);
  for (let k = 0; k < V.att.length; k++) {
    const K = S.kingdoms[k];
    if (!K) continue;
    // 態度は少しずつ、もともとの気持ちへ戻る
    const base = (t.attitude?.toKingdom?.[k] || 0) + (ATT0[t.attitude?.default] || 0);
    V.att[k] += (base - V.att[k]) * 0.004;
    const town = nearestTown(sim, V, k);
    if (!town) continue;
    // 交易：隊商が季節ごとに行き来する（行商人をじっさいに村へ向かわせる）
    if (V.trade[k] && V.att[k] > -30 && sim.today - (V.lastTrade[k] ?? -99) >= 8) {
      V.lastTrade[k] = sim.today;
      tradeExchange(sim, V, k, town);
      if (R.chance(0.5)) sendPeddler(sim, V, k, town);
    }
    // 贈り物：仲の良い王へ
    if (V.att[k] >= 45 && sim.today - V.lastGift >= 20 && R.chance(0.06)) {
      V.lastGift = sim.today;
      const gift = t.special?.[0] || '特産の品';
      K.treasury += 25; K.fame = (K.fame || 50) + 1;
      TS(sim).stats.gifts++;
      const king = S.people[K.kingId];
      if (king && king.deathYear == null) sim.remember(king, `${t.name}から「${gift}」が贈られてきた`, { emo: 0.5, imp: 0.6, k: 'politics' });
      sim.chron(`${t.name}の${V.name}が、${kname(k)}の王に「${gift}」を贈った`, k);
      sim.pushLog(`${t.name}の使いが${town.name}に着き、「${gift}」を王への贈り物として差し出した。`, 'event', [], town);
    }
    // 同盟：深い信頼か、魔王の脅威
    if (!V.ally[k] && V.att[k] >= 60 && (S.demon?.active || R.chance(0.004))) {
      V.ally[k] = true;
      sim.chron(`${kname(k)}と${t.name}が盟約を結んだ`, k);
      sim.news(`${kname(k)}と${t.name}の${V.name}が盟約を結んだ`, 2, V);
    }
    // 衝突：憎しみが深く、開拓地が近いと、若者が開拓小屋を荒らす
    if (V.att[k] <= -45 && sim.today - V.lastClash >= 15 && R.chance(0.05)) {
      const pr = (S.expansion?.projects || []).find((q) => q.k === k && q.x != null && Math.hypot(q.x - V.x, q.z - V.z) < 30 * LS && !['failed', 'done'].includes(q.stage));
      if (pr) {
        V.lastClash = sim.today; TS(sim).stats.clashes++;
        pr.morale = Math.max(0, (pr.morale || 1) - 0.25);
        const tm = S.towns[pr.sid ?? pr.from]; if (tm) tm.stock.meat = Math.max(0, tm.stock.meat - 3);
        sim.news(`${t.name}の若者たちが、${kname(k)}の開拓地の柵を夜のうちに倒した`, 2, { x: pr.x, z: pr.z });
        V.att[k] -= 3;
      }
    }
  }
  s.faces = V.faces;
}
function nearestTown(sim, V, k) {
  let best = null, bd = 1e9;
  for (const s of sim.S.world.settlements) { if (s.tribal || s.kingdom !== k || s.abandoned || sim.S.towns[s.id]?.occupied) continue; const d = Math.hypot(s.x - V.x, s.z - V.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function tradeExchange(sim, V, k, town) {
  const S = sim.S, t = tribeOfV(V), vm = S.towns[V.sid], tm = S.towns[town.id];
  let moved = 0;
  for (const g of t.goods || []) { const n = Math.min(4, (vm.stock[g] || 0) * 0.3); if (n > 0.5) { vm.stock[g] -= n; tm.stock[g] = (tm.stock[g] || 0) + n; moved += n * GOODS[g].base; } }
  for (const g of t.wants || []) { if (!GOODS[g]) continue; const n = Math.min(3, (tm.stock[g] || 0) * 0.2); if (n > 0.3) { tm.stock[g] -= n; vm.stock[g] = (vm.stock[g] || 0) + n; } }
  // 里の蓄えの食べ物が乏しければ、品と引き換えに町の小麦を持ち帰る（物々交換。持ち帰った分は代金から差し引く）
  { const pop = sim.living().filter((p) => p.s === V.sid).length, have = FOODS.reduce((a, g) => a + (vm.stock[g] || 0) * (GOODS[g]?.meals || 0), 0), spare = (tm.stock.wheat || 0) - GOODS.wheat.target * 0.5;
    if (have < pop * 3 && spare > 1 && moved > 0) { const n = Math.min(12, spare * 0.3, moved / GOODS.wheat.base); tm.stock.wheat -= n; vm.stock.wheat = (vm.stock.wheat || 0) + n; moved -= n * GOODS.wheat.base; } }
  { const mc = sim.mcash(town.id); const pay = Math.max(0, Math.min(moved * 0.2, mc.cash)); mc.cash -= pay; vm.fund += pay; }   // 里の品の代金は、町の市場の金庫から里の蓄えへ
  V.att[k] = Math.min(100, V.att[k] + 0.6);
  TS(sim).stats.trades++;
}
function sendPeddler(sim, V, k, town) {
  const cands = sim.living().filter((p) => p.s === town.id && ['peddler', 'merchant'].includes(p.job) && sim.isAdult(p) && !p.mission && !p.quest && p.jail == null && !p.fight);
  const p = sim.rng.pick(cands);
  if (!p) return;
  const spot = sim.randomNear(V.x, V.z, 1) || { x: V.x, z: V.z };
  p.mission = { type: 'stroll', x: spot.x, z: spot.z, until: sim.S.t + 20 * 60, dur: 60, tribeTrade: V.id };
  p.action = null;
}

// ---------- よそ者の到着 ----------
function visitorArrived(sim, V, p) {
  const X = TS(sim), t = tribeOfV(V);
  V.visit = V.visit || {};
  if (V.visit[p.id] != null && sim.today - V.visit[p.id] < 6) return;
  V.visit[p.id] = sim.today;
  const k = sim.town(p.s)?.kingdom;
  if (k == null || k < 0) return;
  const elder = sim.S.people[V.elder];
  const words = TRIBE_SPEECH[t.id];
  // あいさつ
  const host = sim.living().find((q) => q.s === V.sid && q.pos && cheb(q.pos.x, q.pos.z, p.pos.x, p.pos.z) < 6 && sim.isAdult(q)) || elder;
  if (host && host.deathYear == null && words) {
    const line = V.att[k] < -40 ? `${words.you}に見せるものはない。帰れ。` : sim.rng.pick(words.greet);
    sayLine(sim, host, line, p);
  }
  sim.remember(p, `地図にない${t.name}の村、${V.name}にたどり着いた`, { emo: 0.4, imp: 0.7, k: 'travel', where: { x: V.x, z: V.z } });
  // 交易の始まり（行商人・商人・旅人）
  const trader = ['peddler', 'merchant', 'wanderer', 'bard'].includes(p.job);
  if (trader && !V.trade[k] && V.att[k] > -40 && !X.arcs.some((a) => a.arc === 'first_trade' && a.vid === V.id && !a.done) && sim.rng.chance(0.5)) {
    startArc(sim, 'first_trade', V, { merchant: p.id, elder: V.elder, youth: pickYoung(sim, V, (q) => q.pers.O)?.id ?? null }, { k });
  } else if (trader && V.trade[k]) {
    const hh = sim.hh(p); const vf = sim.S.towns[V.sid]; if (hh && vf) { const x = Math.max(0, Math.min(6, (vf.fund || 0) * 0.05)); vf.fund -= x; hh.money += x; }   // 里との商いのもうけは、里の蓄えから
    sim.remember(p, `${V.name}で${t.special?.[0] || '奥地の品'}を仕入れた`, { emo: 0.4, imp: 0.4, k: 'trade' });
  } else if (V.att[k] <= -60 && !trader && !isAdventurer(p)) {
    // 敵意の強い村は、よそ者を追い返す
    p.mission = null; p.action = null;
    p.needs.survival = Math.max(0, p.needs.survival - 25);
    sim.remember(p, `${V.name}の人々に弓を向けられ、あわてて引き返した`, { emo: -0.6, imp: 0.6, k: 'travel' });
  }
}
function sayLine(sim, p, text, to = null) {
  if (!p || p.deathYear != null) return;
  if (sim.isWatched(p)) sim.events.push({ type: 'say', id: p.id, text });
  sim.pushLog(`${p.given}「${text}」`, 'talk', to ? [p.id, to.id] : [p.id], p.pos);
  if (to && to.deathYear == null) {
    const rec = { t: sim.S.t, lines: [[p.id, text]], topics: ['tribe'], mood: 0 };
    for (const [a, b] of [[p, to], [to, p]]) { a.talkLog = a.talkLog || []; a.talkLog.push({ ...rec, with: b.id }); if (a.talkLog.length > 20) a.talkLog.splice(0, a.talkLog.length - 20); }
  }
}
function pickYoung(sim, V, score = (q) => q.values.courage) {
  return sim.living().filter((q) => q.s === V.sid && sim.ageOf(q) >= 18 && sim.ageOf(q) <= 30 && !q.away).sort((a, b) => score(b) - score(a))[0] || null;
}
function pickAdult(sim, V, score = (q) => q.pers.E) {
  return sim.living().filter((q) => q.s === V.sid && sim.isAdult(q) && sim.ageOf(q) < 65).sort((a, b) => score(b) - score(a))[0] || null;
}

// ---------- 国からの知らせ（expansion.js の registerTribeHandler） ----------
// ev = { type: 'approach' | 'claim', k: 国, ci: 区画, tribe: 村番号 }
function tribeHandler(sim, ev) {
  const X = sim.S.tribes;
  if (!X) return null;
  const V = X.villages[ev.tribe];
  if (!V || V.gone) return null;
  const t = tribeOfV(V), k = ev.k, R = sim.rng, S = sim.S;
  const a = V.att[k] ?? 0;
  const K = S.kingdoms[k];
  const king = S.people[K?.kingId];
  const adults = sim.living().filter((p) => p.s === V.sid && sim.isAdult(p)).length;
  const gPow = V.gstate === 'alive' || V.gstate === 'angry' ? (gOfV(V)?.power || 0) : 0;
  const strength = adults + gPow * 2 + V.faith / 10;          // 村の強さ：人と守り神と信仰
  const pressure = 8 + (king?.values.ambition || 0.5) * 12;   // 国の押し
  if (V.annexed != null) { if (ev.type === 'claim' && V.annexed === k) annexTribalLand(sim, ev.ci, k, '併合'); return { allow: V.annexed === k }; }
  if (ev.type === 'approach') {
    V.approach = V.approach || {};
    const first = V.approach[k] == null;
    V.approach[k] = sim.today;
    let allow, how;
    if (sim.today < V.block) { allow = false; how = '境の石の約束を盾に、それより奥へは入らせなかった'; }
    else if (a >= 30) { allow = true; how = '開拓団を迎え入れた'; if (!V.trade[k]) { V.trade[k] = true; how = '市を開くことを条件に、開拓団を迎え入れた'; } }
    else if (a <= -20 && strength >= pressure) { allow = false; how = '開拓団の接近を拒んだ'; V.att[k] -= 2; }
    else { allow = true; how = `毎年の貢ぎ物（${t.special?.[0] || '特産品'}）を条件に、開拓を黙認した`; if (K) K.treasury -= 10; S.towns[V.sid].fund += 10; V.att[k] -= 1; }
    if (first || R.chance(0.3)) {
      sim.pushLog(`${t.name}の${V.name}は、${kname(k)}の${how}。`, 'event', [], V);
      if (first) sim.chron(`${t.name}の${V.name}が、近づいてきた${kname(k)}の${how}`, k);
    }
    if (a < 20 && R.chance(0.3) && !X.arcs.some((q) => q.arc === 'frontier_clash' && q.vid === V.id && !q.done) && coolOk(sim, V, 'frontier_clash', 30)) {
      startArc(sim, 'frontier_clash', V, {}, { k, ci: ev.ci });
    }
    return { allow };
  }
  if (ev.type === 'claim') {
    const c = { x: (ev.ci % S.territory.cw) * EXP_CS + (EXP_CS >> 1), z: Math.floor(ev.ci / S.territory.cw) * EXP_CS + (EXP_CS >> 1) };
    const core = cheb(c.x, c.z, V.x, V.z) <= V.r + EXP_CS;
    if (!core && a >= 50) {
      annexTribalLand(sim, ev.ci, k, '譲渡');
      V.att[k] -= 2;
      sim.pushLog(`${t.name}は、${kname(k)}の求めに応じて${sim.placeName(c.x, c.z)}の土地を譲った。`, 'event', [], c);
      return { allow: true };
    }
    if ((king?.values.ambition || 0.5) > 0.55 && R.chance(0.2) && !X.arcs.some((q) => q.arc === 'annex' && q.vid === V.id && !q.done) && coolOk(sim, V, 'annex', 60)) {
      startArc(sim, 'annex', V, {}, { k });
      return { allow: false };
    }
    if (R.chance(0.4)) sim.pushLog(`${kname(k)}が${t.name}の土地を欲しがったが、${V.name}の長老は首を縦にふらなかった。`, 'event', [], V);
    V.att[k] -= 1;
    return { allow: false };
  }
  return null;
}
function coolOk(sim, V, arc, days) { const d = V.arcCool[arc]; return d == null || sim.today - d >= days; }

// ---------- 条件がそろったら始まる筋（村ごと） ----------
function triggers(sim, V) {
  const S = sim.S, R = sim.rng, X = TS(sim), t = tribeOfV(V);
  const active = (arc) => X.arcs.some((a) => a.arc === arc && a.vid === V.id && !a.done);
  // 奥地の若者、王都へ
  if (!active('youth_to_capital') && coolOk(sim, V, 'youth_to_capital', DAYS_PER_YEAR) && R.chance(0.02)) {
    const k = bestKingdom(V);
    const y = sim.living().filter((p) => p.s === V.sid && p.tribe === V.tribe && sim.ageOf(p) >= 18 && sim.ageOf(p) <= 25 && p.pers.O > 0.7 && p.spouseId == null && !p.away && V.send?.pid !== p.id)[0];
    if (y && V.att[k] > -40) startArc(sim, 'youth_to_capital', V, { youth: y.id, kin: y.motherId ?? y.fatherId }, { k });
  }
  // 送られ人の島（マヒナ）：送りの翌年
  if (V.tribe === 'mahina' && V.lastSent && V.lastSent.year === sim.year() - 1 && !V.done.island && !active('sent_ones_island')) {
    const g = gOfV(V);
    if (sim.seasonIdx() === majorSeason(g, t) && sim.dayOfYear() % DAYS_PER_SEASON === 2) {
      V.done.island = true;
      const sent = S.people[V.lastSent.pid];
      const kin = sent ? sim.living().filter((q) => q.s === V.sid && sim.isAdult(q) && ((q.rel[sent.id]?.a || 0) > 50 || sim.kinTerm(q, sent))).sort((a, b) => (b.rel[sent.id]?.a || 0) - (a.rel[sent.id]?.a || 0))[0] : null;
      if (sent && kin && R.chance(0.3)) startArc(sim, 'sent_ones_island', V, { kin: kin.id, sent: sent.id, elder: V.elder }, { k: V.faces });
    }
  }
  // 古の封印が開拓で破られる（エルダ）
  if (V.tribe === 'elda' && V.gstate === 'sealed' && V.lair && !active('seal_broken') && coolOk(sim, V, 'seal_broken', DAYS_PER_YEAR)) {
    const near = (S.expansion?.projects || []).find((q) => q.x != null && Math.hypot(q.x - V.lair.x, q.z - V.lair.z) < 12 * LS && !['failed'].includes(q.stage));
    if (near && R.chance(0.2)) startArc(sim, 'seal_broken', V, { pioneer: near.leader ?? null }, { k: near.k });
  }
  // 開拓地の若者と、奥地の娘（若者）
  if (!active('cross_marriage') && coolOk(sim, V, 'cross_marriage', 20) && R.chance(0.3)) {
    for (const b of sim.living()) {
      if (b.s !== V.sid || b.tribe !== V.tribe || b.spouseId != null || sim.ageOf(b) < 18 || sim.ageOf(b) > 40) continue;
      const hit = Object.entries(b.rel).find(([id, r]) => { const a = S.people[id]; return r.a > 50 && a && a.deathYear == null && !a.tribe && a.spouseId == null && a.sex !== b.sex && sim.ageOf(a) >= 18 && !sim.town(a.s)?.tribal; });
      if (hit) { const a = S.people[hit[0]]; startArc(sim, 'cross_marriage', V, { a: a.id, b: b.id, kinA: a.fatherId ?? a.motherId, elder: V.elder }, { k: sim.town(a.s).kingdom }); break; }
    }
  }
  // 古竜と赤き竜（ガライ）
  if (V.tribe === 'garai' && (V.gstate === 'alive' || V.gstate === 'angry') && !active('dragon_kin') && coolOk(sim, V, 'dragon_kin', DAYS_PER_YEAR * 2)) {
    const dragon = Object.values(S.creatures).find((c) => c.sp === 'dragon' && c.hp > 0 && !c.guardian);
    const hunted = dragon && ((S.quests || []).some((q) => q.target === dragon.id && q.state !== 'failed') || dragon.enraged > S.t - 1440 * 3);
    if (dragon && hunted && R.chance(0.5)) {
      const k = sim.town(sim.living().find((p) => p.quest && (S.quests || []).find((q) => q.id === p.quest)?.target === dragon.id)?.s ?? -1)?.kingdom ?? V.faces;
      startArc(sim, 'dragon_kin', V, { smith: pickAdult(sim, V, (q) => q.values.courage)?.id ?? null, dragon: dragon.id }, { k });
    }
  }
  // 伝説の噂を聞いた冒険者（依頼を受けたとき）→ legendsDaily で始める
}
function globalTriggers(sim) {
  const S = sim.S, X = TS(sim), R = sim.rng;
  // 魔王の目覚め
  const D = S.demon;
  if (D && D.active && X.demonSeen !== (D.gen || 1) + ':' + (D.name || '')) {
    X.demonSeen = (D.gen || 1) + ':' + (D.name || '');
    for (const V of X.villages) {
      if (V.gone || !['harn', 'dorgu', 'fianna'].includes(V.tribe)) continue;
      const k = bestKingdom(V);
      startArc(sim, 'demon_alliance', V, { envoy: pickAdult(sim, V, (q) => q.values.courage + q.pers.E)?.id ?? null }, { k });
    }
  }
  // 流行り病と奥地の薬
  for (const e of S.health?.epi || []) {
    if (e.tribeSeen) continue;
    e.tribeSeen = true;
    const s = sim.town(e.sid);
    if (!s || s.tribal) continue;
    const V = X.villages.filter((v) => !v.gone && ['bolota', 'fianna', 'mictla', 'elda'].includes(v.tribe) && v.att[s.kingdom] > -40).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
    if (V && Math.hypot(V.x - s.x, V.z - s.z) < 90 * LS && R.chance(0.5)) {
      const healer = sim.living().filter((p) => p.s === V.sid && ['shaman', 'gatherer'].includes(p.job) && sim.isAdult(p)).sort((a, b) => (b.skill[b.job] || 0) - (a.skill[a.job] || 0))[0];
      if (healer) startArc(sim, 'swamp_cure', V, { healer: healer.id, doctor: sim.living().find((p) => p.s === s.id && ['doctor', 'herbalist'].includes(p.job))?.id ?? null }, { k: s.kingdom, data: { epiSid: s.id } });
    }
  }
  // 若者が自分で冒険者になって王都へ出た（partiesDaily の若者の志）→ 奥地の若者、王都へ（王都から始まる）
  for (const p of sim.living()) {
    if (!p.tribe || p.tribeLeft || !isAdventurer(p)) continue;
    const s = sim.town(p.s);
    if (!s || s.tribal) continue;
    p.tribeLeft = true;
    const V = X.villages.find((v) => v.tribe === p.tribe);
    if (V && !X.arcs.some((a) => a.arc === 'youth_to_capital' && a.cast.youth === p.id)) startArc(sim, 'youth_to_capital', V, { youth: p.id, kin: p.motherId ?? p.fatherId }, { k: s.kingdom, at: 'city' });
  }
}

// ========================================================================================
// 3. 物語の筋（STORY_ARCS を場面ごとに進める）
// ========================================================================================
function startArc(sim, arcId, V, cast = {}, ctx = {}) {
  const def = arcById(arcId);
  if (!def || !V) return null;
  const X = TS(sim);
  const st = { id: X.seq++, arc: arcId, vid: V.id, step: ctx.at || def.steps[0].id, due: sim.today, cast: { ...cast }, k: ctx.k ?? V.faces, ci: ctx.ci ?? null, started: sim.today, log: [], data: { ...(ctx.data || {}) } };
  X.arcs.push(st);
  X.stats.arcs++;
  V.arcCool[arcId] = sim.today;
  // 始めの場面はその日のうちに
  runArc(sim, st);
  return st;
}
function stepArcs(sim) {
  const X = TS(sim);
  for (const st of X.arcs.slice()) if (!st.done && sim.today >= st.due) runArc(sim, st);
  X.arcs = X.arcs.filter((a) => !a.done || sim.today - a.doneDay < 60);
}
function person(sim, id) { const p = id != null ? sim.S.people[id] : null; return p && p.deathYear == null ? p : null; }
function arcCtx(sim, st, V) {
  const S = sim.S, c = st.cast, name = (id) => { const p = id != null ? S.people[id] : null; return p ? p.given : null; };
  const names = {};
  for (const [role, id] of Object.entries(c)) if (typeof id === 'number') { const n = name(id); if (n) names[role] = n; }
  if (!names.elder) names.elder = name(V.elder) || '長老';
  if (st.data.beastName) names.beast = st.data.beastName;
  if (st.data.legend) names.legend = legendById(st.data.legend)?.name;
  if (c.slayer != null && name(c.slayer)) names.adv = names.adv || name(c.slayer);
  if (!names.adv) names.adv = '旅の冒険者';
  if (!names.youth) names.youth = '村の若者';
  if (!names.hero) names.hero = names.adv || '王国の騎士';
  if (!names.pioneer) names.pioneer = '開拓団の頭';
  if (!names.merchant) names.merchant = '行商人';
  if (!names.envoy) names.envoy = '使者';
  if (!names.healer) names.healer = '薬の名人';
  if (!names.official) names.official = '使者';
  if (!names.go) names.go = '旅人';
  if (!names.keeper) names.keeper = '灯守';
  if (!names.smith) names.smith = '鍛冶';
  if (!names.guide) names.guide = '案内人';
  return loreCtx(sim, V, { k: st.k, names });
}
function playLines(sim, st, lines, V) {
  if (!lines) return;
  const S = sim.S, ctx = arcCtx(sim, st, V);
  const spoken = [];
  for (const [role, arr] of Object.entries(lines)) {
    const id = st.cast[role];
    const p = person(sim, id);
    if (!p || !arr?.length) continue;
    const text = loreText(sim.rng.pick(arr), ctx);
    spoken.push([p, text]);
  }
  for (let i = 0; i < spoken.length; i++) {
    const [p, text] = spoken[i];
    const to = spoken[(i + 1) % spoken.length]?.[0];
    sayLine(sim, p, text, to !== p ? to : null);
    sim.remember(p, `「${text}」と口にした`, { emo: -0.1, imp: 0.35, k: 'tribe' });
  }
}
// 場面ごとの動き（配役を決める・人を動かす・戦いの勝ち負けを決める）
const ACT = {
  lot_and_rescuer: {
    lot(sim, st, V) {
      const S = sim.S, y = person(sim, st.cast.youth);
      if (!y) return { end: true };
      const g = gOfV(V), t = tribeOfV(V);
      const tool = g.offering.major.selection?.tool || 'くじ';
      sim.chron(`${t.name}の${V.name}で約束の年のくじが引かれ、${sim.fullName(y)}が${g.name}のもとへ送られることになった${st.cast.vol ? '（みずから名乗り出た）' : ''}`, undefined);
      sim.news(`${V.name}で約束の年のくじ（${tool}）。${y.given}が${g.lair.name}へ送られることになった`, 2, y.pos);
      sim.remember(y, st.cast.vol ? `約束の年、みずから名乗り出た。${g.lair.name}へ行く` : `約束の年のくじで、${tool}を引いてしまった`, { emo: -0.8, imp: 1, k: 'offering' });
      const kin = person(sim, st.cast.kin);
      if (kin) sim.remember(kin, `${sim.kinTerm(kin, y) || ''}の${y.given}がくじに当たった`, { emo: -0.95, imp: 1, about: [y.id], k: 'offering' });
      sim.gossip(y, `約束の年のくじに当たったらしい`, -0.6, sim.living().filter((q) => q.s === V.sid && q !== y), { silent: true, imp: 0.8 });
      return { delay: 1 };
    },
    meet(sim, st, V) {
      const S = sim.S, y = person(sim, st.cast.youth);
      if (!y) return { end: true };
      // 近くの冒険者（勇気が高く、お人好しな者ほど）
      const advs = sim.living().filter((p) => isAdventurer(p) && p.jail == null && !p.mission && sim.ageOf(p) >= 18 && p.hp > p.maxhp * 0.5 && !p.tribe);
      const adv = sim.rng.weighted(advs, (p) => (p.values.courage + p.pers.A) * 2 * (p.quest ? 0.3 : 1) / (1 + Math.hypot(p.pos.x - V.x, p.pos.z - V.z) / 40));
      if (!adv) { st.data.noAdv = true; return { to: 'end_refused_quiet', silent: true }; }
      st.cast.adv = adv.id;
      adv.mission = { type: 'stroll', x: V.x, z: V.z, until: S.t + 14 * 60, dur: 60 };
      adv.action = null;
      sim.remember(adv, `奥地の${V.name}で、くじに当たった${y.given}の話を聞いた`, { emo: -0.4, imp: 0.8, about: [y.id], k: 'quest' });
      sim.relMut(adv, y).a += 20; sim.relMut(y, adv).a += 15;
      return { delay: 1 };
    },
    slay(sim, st, V) {
      const adv = person(sim, st.cast.adv), g = gOfV(V), c = guardianC(sim, V);
      if (!adv || !c) return { to: 'end_refused', silent: true };
      adv.mission = { type: 'march', x: V.lair.x, z: V.lair.z, until: sim.S.t + 20 * 60, dur: 90 };
      adv.action = null;
      const party = partyPower(sim, adv);
      const foe = g.power * 6 + (V.faith - 50) / 10;
      const pw = clamp(party / (party + foe) + (adv.values.courage - 0.5) * 0.15, 0.05, 0.9);
      st.data.win = sim.rng.chance(pw);
      st.data.pw = Math.round(pw * 100);
      return { delay: 2 };
    },
    swap(sim, st, V) {
      const adv = person(sim, st.cast.adv);
      if (!adv) return { to: 'end_refused', silent: true };
      return { delay: 1 };
    },
    talk(sim, st, V) { return { delay: 2 }; },
  },
  guardian_fallout: {
    news(sim, st, V) {
      const g = gOfV(V);
      st.cast.elder = V.elder;
      st.cast.youth = pickYoung(sim, V, (q) => q.pers.O - q.values.faith)?.id ?? null;
      const pick = sim.rng.weighted(g.onSlain || [], (o) => o.w);
      st.data.slain = pick || null;
      if (pick?.beast) st.data.beastName = SPECIES[pick.beast]?.name || pick.beast;
      st.data.forced = pick ? `end_${pick.result}` : null;
      for (const p of sim.living().filter((q) => q.s === V.sid)) sim.remember(p, `${g.name}が討たれたと聞いた。千年の約束が終わった`, { emo: p.values.faith > 0.6 ? -0.8 : 0.2, imp: 1, k: 'offering' });
      return { delay: 1 };
    },
  },
  frontier_clash: {
    axe(sim, st, V) {
      const S = sim.S, k = st.k;
      const pr = (S.expansion?.projects || []).filter((q) => q.k === k && q.x != null).sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
      st.cast.pioneer = person(sim, pr?.leader)?.id ?? sim.living().find((p) => p.job === 'pioneer' && sim.town(p.s)?.kingdom === k)?.id ?? null;
      st.cast.elder = V.elder;
      st.cast.youth = pickYoung(sim, V, (q) => q.values.courage - q.pers.A)?.id ?? null;
      const go = sim.living().filter((p) => !p.tribe && ['merchant', 'peddler', 'adventurer', 'wanderer', 'bard', 'priest'].includes(p.job) && Object.keys(p.rel).some((id) => S.people[id]?.s === V.sid)).sort((a, b) => b.pers.A - a.pers.A)[0];
      st.cast.go = go?.id ?? null;
      if (pr) st.data.pr = pr.id;
      return { delay: 2 };
    },
    raid(sim, st, V) {
      const S = sim.S, pr = (S.expansion?.projects || []).find((q) => q.id === st.data.pr);
      if (pr) pr.morale = Math.max(0, (pr.morale || 1) - 0.3);
      TS(sim).stats.clashes++;
      return { delay: 2 };
    },
    parley(sim, st, V) { return { delay: 2 }; },
    retreat(sim, st, V) { return { delay: 1 }; },
  },
  youth_to_capital: {
    leave(sim, st, V) {
      const y = person(sim, st.cast.youth);
      if (!y) return { end: true };
      const cap = sim.S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === st.k);
      if (!cap) return { end: true };
      moveToTown(sim, y, cap, { job: y.skill.hunter > 0.4 || y.job === 'hunter' ? 'archer' : sim.rng.pick(['adventurer', 'warrior', 'archer']), inn: true });
      y.tribeLeft = true; st.data.qp0 = y.qp || 0;
      sim.remember(y, `外の世界を見たくて、${V.name}を出て${cap.name}へ向かった`, { emo: 0.6, imp: 1, k: 'arrival' });
      const kin = person(sim, st.cast.kin); if (kin) sim.remember(kin, `${y.given}が村を出て${cap.name}へ行ってしまった`, { emo: -0.5, imp: 0.9, about: [y.id], k: 'family' });
      return { delay: 3 };
    },
    city(sim, st, V) {
      const y = person(sim, st.cast.youth);
      if (!y) return { end: true };
      st.cast.mentor = sim.living().filter((p) => p.s === y.s && (p.job === 'guildmaster' || (isAdventurer(p) && p.id !== y.id))).sort((a, b) => (b.qp || 0) - (a.qp || 0))[0]?.id ?? null;
      st.data.city = sim.today;
      if (st.data.qp0 == null) st.data.qp0 = y.qp || 0;
      return { wait: true, delay: 1 };
    },
    fame(sim, st, V) { return { delay: 3 }; },
    home(sim, st, V) { return { delay: 1 }; },
  },
  seal_broken: {
    fell(sim, st, V) {
      st.cast.keeper = V.shamanId ?? V.elder;
      const S = sim.S;
      st.cast.hero = strongest(sim, st.k)?.id ?? null;
      st.cast.king = S.kingdoms[st.k]?.kingId ?? null;
      V.lamps = Math.max(0, (V.lamps ?? 7) - 1);
      return { delay: 1 };
    },
    ash(sim, st, V) {
      V.faith = clamp(V.faith - 5, 0, 100);
      return { delay: 2 };
    },
    ally(sim, st, V) { return { delay: 3 }; },
    wake(sim, st, V) {
      if (V.gstate !== 'sealed') return { to: 'end_resealed', silent: true };
      const c = guardianC(sim, V) || spawnGuardian(sim, V, gOfV(V), false);
      if (c) { c.dormant = false; c.calm = null; c.hostile = true; }
      V.gstate = 'woken'; V.lamps = 0;
      sim.news(`灰の王が井戸から出てきた！　${V.lair?.name}のまわりに灰が降っている`, 4, V.lair);
      const hero = person(sim, st.cast.hero);
      const pw = hero ? clamp(partyPower(sim, hero) / (partyPower(sim, hero) + 60), 0.1, 0.8) : 0.1;
      st.data.win = sim.rng.chance(pw);
      if (hero) { hero.mission = { type: 'march', x: V.lair.x, z: V.lair.z, until: sim.S.t + 24 * 60, dur: 90 }; hero.action = null; }
      return { delay: 3 };
    },
  },
  sent_ones_island: {
    row(sim, st, V) { return { delay: 2 }; },
    reef(sim, st, V) { return { delay: 1 }; },
    lost(sim, st, V) { return { delay: 1 }; },
  },
  first_trade: {
    arrive(sim, st, V) { return { delay: 1 }; },
    barter(sim, st, V) {
      const m = person(sim, st.cast.merchant), vm = sim.S.towns[V.sid];
      if (m) { const hh = sim.hh(m); if (hh) hh.money += 15; }
      vm.stock.tools = (vm.stock.tools || 0) + 2; vm.stock.stone = (vm.stock.stone || 0) + 2;
      return { delay: 1 };
    },
    chased(sim, st, V) { return { delay: 1 }; },
  },
  faith_schism: {
    split(sim, st, V) {
      st.cast.elder = V.elder;
      st.cast.youth = pickYoung(sim, V, (q) => q.pers.O + q.values.courage - q.values.faith)?.id ?? null;
      st.cast.go = pickAdult(sim, V, (q) => q.pers.A)?.id ?? null;
      return { delay: 2 };
    },
  },
  lean_year: {
    short(sim, st, V) {
      st.cast.elder = V.elder;
      st.cast.envoy = pickAdult(sim, V, (q) => q.pers.E + q.values.courage)?.id ?? null;
      st.cast.king = sim.S.kingdoms[st.k]?.kingId ?? null;
      return { delay: 1 };
    },
    ask(sim, st, V) {
      const e = person(sim, st.cast.envoy), cap = sim.S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === st.k);
      if (e && cap) { e.mission = { type: 'stroll', x: cap.x, z: cap.z, until: sim.S.t + 30 * 60, dur: 60 }; e.action = null; }
      return { delay: 3 };
    },
    raid(sim, st, V) { return { delay: 1 }; },
  },
  cross_marriage: {
    meet(sim, st, V) { return { delay: 2 }; },
    oppose(sim, st, V) { return { delay: 3 }; },
  },
  demon_alliance: {
    envoy(sim, st, V) {
      const e = person(sim, st.cast.envoy), cap = sim.S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === st.k);
      if (!e || !cap) return { end: true };
      st.cast.king = sim.S.kingdoms[st.k]?.kingId ?? null;
      st.cast.hero = (sim.living().find((p) => p.hero || p.heroTitle) || strongest(sim, st.k))?.id ?? null;
      e.mission = { type: 'stroll', x: cap.x, z: cap.z, until: sim.S.t + 36 * 60, dur: 60 }; e.action = null;
      return { delay: 3 };
    },
    gift(sim, st, V) { return { delay: 1 }; },
  },
  relic_hunt: {
    set(sim, st, V) { st.cast.elder = V.elder; st.cast.guide = pickAdult(sim, V, (q) => q.pers.O + q.values.courage)?.id ?? null; return { delay: 1 }; },
    guide(sim, st, V) { return { wait: true, delay: 1 }; },
    trespass(sim, st, V) { return { wait: true, delay: 1 }; },
  },
  swamp_cure: {
    come(sim, st, V) {
      const h = person(sim, st.cast.healer), s = sim.town(st.data.epiSid);
      st.cast.king = sim.S.kingdoms[st.k]?.kingId ?? null;
      if (h && s) { h.mission = { type: 'stroll', x: s.x, z: s.z, until: sim.S.t + 30 * 60, dur: 60 }; h.action = null; }
      const e = (sim.S.health?.epi || []).find((x) => x.sid === st.data.epiSid);
      if (e) e.until = Math.min(e.until, sim.today + 2);
      return { delay: 2 };
    },
  },
  dragon_kin: {
    warn(sim, st, V) {
      st.cast.king = sim.S.kingdoms[st.k]?.kingId ?? null;
      st.cast.hero = strongest(sim, st.k)?.id ?? null;
      return { delay: 2 };
    },
    parley(sim, st, V) { return { delay: 2 }; },
    hunt(sim, st, V) {
      const hero = person(sim, st.cast.hero), d = sim.S.creatures[st.cast.dragon];
      if (!hero || !d) return { to: 'end_fail', silent: true };
      const party = partyPower(sim, hero);
      st.data.win = sim.rng.chance(clamp(party / (party + 55), 0.05, 0.85));
      hero.mission = { type: 'march', x: Math.round(d.pos.x), z: Math.round(d.pos.z), until: sim.S.t + 20 * 60, dur: 90 }; hero.action = null;
      return { delay: 2 };
    },
  },
  annex: {
    flag(sim, st, V) {
      const k = st.k;
      st.cast.official = sim.living().filter((p) => sim.town(p.s)?.kingdom === k && !sim.town(p.s)?.tribal && ['treasurer', 'collector', 'knight', 'scribe', 'chancellor'].includes(p.job)).sort((a, b) => b.pers.C - a.pers.C)[0]?.id ?? null;
      st.cast.elder = V.elder;
      st.cast.youth = pickYoung(sim, V, (q) => q.values.courage - q.pers.A)?.id ?? null;
      st.cast.go = sim.living().filter((p) => !p.tribe && Object.entries(p.rel).some(([id, r]) => r.a > 40 && sim.S.people[id]?.s === V.sid)).sort((a, b) => b.pers.A - a.pers.A)[0]?.id ?? null;
      return { delay: 2 };
    },
  },
};
// 分かれ道の重みの倍率（登場人物の性格・強さ・村の態度から）
function condMul(sim, st, V, to) {
  const S = sim.S, c = st.cast, g = gOfV(V), t = tribeOfV(V), k = st.k, a = V.att[k] ?? 0;
  const P = (role) => person(sim, c[role]);
  const king = S.people[S.kingdoms[k]?.kingId];
  const key = `${st.arc}:${to}`;
  switch (key) {
    case 'lot_and_rescuer:slay': { const adv = P('adv'); if (!adv) return 0; const strong = partyPower(sim, adv) >= g.power * 6; return strong || adv.values.courage > 0.65 ? 2 : 0.4; }
    case 'lot_and_rescuer:swap': { const adv = P('adv'); if (!adv || !g.offering.major.selection?.substitute) return 0; return adv.pers.A > 0.62 ? 2 : 0.5; }
    case 'lot_and_rescuer:talk': { const adv = P('adv'); if (!adv) return 0; return adv.pers.A > 0.5 ? 1.5 : 0.6; }
    case 'lot_and_rescuer:end_slain': return st.data.win ? 1 : 0;
    case 'lot_and_rescuer:end_fallen': return st.data.win ? 0 : 1;
    case 'lot_and_rescuer:end_renewed': return g.temper === 'calm' ? 1 : 0.25;
    case 'lot_and_rescuer:end_refused': return (P('elder')?.pers.A || 0.5) < 0.4 ? 1.5 : 1;
    case 'frontier_clash:raid': return a < -20 ? 2 : 0.3;
    case 'frontier_clash:parley': return c.go != null ? 1.5 : 0.5;
    case 'frontier_clash:retreat': return sim.living().filter((p) => p.s === V.sid && sim.isAdult(p)).length < 8 ? 2 : 0.4;
    case 'frontier_clash:end_war': return king && (king.pers.A < 0.4 || king.values.ambition > 0.65) ? 1.5 : 0.3;
    case 'frontier_clash:end_trade': return t.attitude?.default === 'trade' || t.attitude?.default === 'neutral' ? 2 : 0.6;
    case 'youth_to_capital:fame': { const y = P('youth'); return y && (y.qp || 0) - (st.data.qp0 || 0) >= 5 ? 1 : 0; }
    case 'youth_to_capital:home': { const y = P('youth'); return y && (y.qp || 0) - (st.data.qp0 || 0) >= 5 ? 0 : 1; }
    case 'seal_broken:ally': return a > -20 ? 2 : 0.3;
    case 'seal_broken:end_slain': return st.data.win ? 1 : 0;
    case 'seal_broken:end_ashland': return st.data.win ? 0 : 1;
    case 'sent_ones_island:lost': return (P('kin')?.skill.fisher || 0.3) > 0.5 ? 0.5 : 1;
    case 'first_trade:barter': return ['trade', 'neutral'].includes(t.attitude?.default) ? 2 : a > 0 ? 1 : 0.5;
    case 'first_trade:end_greed': return (P('merchant')?.pers.A ?? 0.5) < 0.4 ? 3 : 0.2;
    case 'faith_schism:end_keep': return (P('elder')?.fame || 0) > 10 || V.faith > 50 ? 1.5 : 0.8;
    case 'faith_schism:end_break': { const young = sim.living().filter((p) => p.s === V.sid && sim.ageOf(p) >= 16 && sim.ageOf(p) < 30).length, old = sim.living().filter((p) => p.s === V.sid && sim.ageOf(p) >= 45).length; return young > old ? 1.5 : 0.7; }
    case 'lean_year:ask': return a > -20 ? 2 : 0.2;
    case 'lean_year:raid': return ['hostile', 'grudge'].includes(t.attitude?.default) ? 1.5 : 0.4;
    case 'lean_year:end_aid': return king && king.pers.A > 0.55 ? 2 : 0.6;
    case 'lean_year:end_vassal': return king && king.values.ambition > 0.6 ? 2 : 0.5;
    case 'cross_marriage:end_wed': { const A = P('a'), B = P('b'); return A && B && sim.rel(A, B).a > 80 ? 3 : 1; }
    case 'demon_alliance:gift': return a > -30 ? 3 : 0.2;
    case 'relic_hunt:guide': { const L = legendById(st.data.legend); const tv = TS(sim).villages.find((v) => v.tribe === L?.tribe); return tv && (tv.att[k] ?? 0) > -20 ? 2 : 0.3; }
    case 'relic_hunt:end_found': return st.data.qres === 'done' ? 3 : st.data.qres === 'failed' ? 0.2 : 1;
    case 'relic_hunt:end_lost': return st.data.qres === 'dead' ? 4 : st.data.qres === 'done' ? 0 : 1;
    case 'relic_hunt:end_return': return st.data.qres === 'done' ? 0.3 : 1;
    case 'swamp_cure:end_steal': return king && king.values.ambition > 0.6 ? 2 : 0.3;
    case 'dragon_kin:parley': return king && king.pers.A > 0.55 ? 2 : 0.6;
    case 'dragon_kin:end_slain': return st.data.win ? 1 : 0;
    case 'dragon_kin:end_fail': return st.data.win ? 0 : 1;
    case 'annex:end_accept': return a > 20 ? 2 : 0.2;
    case 'annex:end_resist': return a < -30 ? 2 : 0.2;
    case 'annex:end_charter': return c.go != null ? 2 : 0.5;
  }
  return 1;
}
function runArc(sim, st) {
  const def = arcById(st.arc), V = vOf(sim, st.vid);
  if (!def || !V) { st.done = true; st.doneDay = sim.today; return; }
  if (def.endings[st.step] || st.step.startsWith('end_')) return finishArc(sim, st, V, st.step);
  const step = def.steps.find((s) => s.id === st.step);
  if (!step) { st.done = true; st.doneDay = sim.today; return; }
  // 待っている場面（依頼の結果や、王都での一年）
  if (st.waiting) {
    if (!waitDone(sim, st, V)) { st.due = sim.today + 1; return; }
    st.waiting = false;
  } else {
    const act = ACT[st.arc]?.[step.id];
    const r = act ? act(sim, st, V) || {} : {};
    if (r.end) { st.done = true; st.doneDay = sim.today; return; }
    if (r.to && r.silent) { st.step = r.to; st.due = sim.today + (r.delay ?? 0); return runArc(sim, st); }
    const ctx = arcCtx(sim, st, V);
    const text = loreText(step.text, ctx);
    st.log.push({ d: sim.today, step: step.id, text });
    sim.pushLog(`【${def.title}】${text}。`, 'event', Object.values(st.cast).filter((x) => typeof x === 'number'), V);
    playLines(sim, st, step.lines, V);
    if (r.to) { st.step = r.to; st.due = sim.today + (r.delay ?? 1); return; }
    if (r.wait) { st.waiting = true; st.due = sim.today + (r.delay ?? 1); st.data.waitFrom = sim.today; st.data.afterWait = true; return; }
    st.due = sim.today + (r.delay ?? 1);
    if (step.id === def.steps[0].id && st.arc !== 'lot_and_rescuer') sim.news(`${text}`, 2, V);
  }
  // 次の場面を選ぶ
  let options = step.next || [];
  if (st.data.forced) { const f = options.find((o) => o.to === st.data.forced); if (f) options = [f]; st.data.forced = null; }
  const g = gOfV(V);
  const nxt = sim.rng.weighted(options, (o) => {
    let w = o.w;
    if (typeof w === 'string') { const res = w.split('.')[1]; w = (g?.onSlain || []).filter((x) => x.result === res).reduce((s, x) => s + x.w, 0); }
    return w * condMul(sim, st, V, o.to);
  }) || options[0];
  if (!nxt) { st.done = true; st.doneDay = sim.today; return; }
  st.step = nxt.to;
}
function waitDone(sim, st, V) {
  const S = sim.S;
  if (st.arc === 'youth_to_capital') {
    const y = person(sim, st.cast.youth);
    if (!y) { st.done = true; return false; }
    return (y.qp || 0) - (st.data.qp0 || 0) >= 5 || sim.today - st.data.city > DAYS_PER_YEAR;
  }
  if (st.arc === 'relic_hunt') {
    const q = (S.quests || []).find((x) => x.id === st.data.quest);
    const adv = S.people[st.cast.adv];
    if (adv && adv.deathYear != null && !adv.away) { st.data.qres = 'dead'; return true; }
    if (!q || q.state === 'report' || q.state === 'done') { st.data.qres = 'done'; return true; }
    if (q.state === 'failed' || q.state === 'open') { st.data.qres = 'failed'; return true; }
    return sim.today - st.data.waitFrom > 16;
  }
  return true;
}
function finishArc(sim, st, V, endId) {
  const def = arcById(st.arc);
  const S = sim.S, t = tribeOfV(V), g = gOfV(V);
  st.done = true; st.doneDay = sim.today; st.ending = endId;
  TS(sim).stats.endings++;
  if (endId === 'end_refused_quiet') {
    // 冒険者が見つからなかった：若者は約束の日に送られる
    sim.pushLog(`${V.name}に立ち寄る冒険者はいなかった。約束の日が近づいていく。`, 'event', [], V);
    return;
  }
  const E = def.endings[endId];
  if (!E) return;
  const ctx = arcCtx(sim, st, V);
  // 守り神が討たれたあとの結末は、守り神ごとの文（onSlain）を優先する
  const sl = st.data.slain && `end_${st.data.slain.result}` === endId ? st.data.slain : null;
  const text = loreText(E.text, ctx) + (sl?.text ? `。${sl.text.replace(/。$/, '')}` : '');
  st.log.push({ d: sim.today, step: endId, text });
  sim.pushLog(`【${def.title}】${text}。`, 'event', Object.values(st.cast).filter((x) => typeof x === 'number'), V);
  const chron = sl?.chronicle ? loreText(sl.chronicle, ctx) : E.chronicle ? loreText(E.chronicle, ctx) : null;
  if (chron) { sim.chron(chron, st.k); sim.news(chron, 3, V); }
  else if (E.chronicle !== null) sim.news(text, 1, V);
  // 登場人物の記憶と噂
  const castP = Object.values(st.cast).filter((x) => typeof x === 'number').map((id) => person(sim, id)).filter(Boolean);
  for (const p of castP) sim.remember(p, text, { emo: endEmo(endId), imp: 0.9, k: 'tribe' });
  for (const p of sim.living().filter((q) => q.s === V.sid && !castP.includes(q) && sim.isAdult(q))) if (sim.rng.chance(0.6)) sim.remember(p, text, { emo: endEmo(endId) * 0.7, imp: 0.7, k: 'tribe' });
  const subj = castP.find((p) => !p.tribe) || castP[0];
  if (subj) sim.gossip(subj, `奥地の${V.name}の出来事に関わったらしい（${def.title}）`, endEmo(endId), sim.living().filter((q) => q.s === subj.s && sim.rng.chance(0.3)), { silent: true, imp: 0.5 });
  // 筋ごとの後始末（効き目より先に：人の生き死に・結婚・移住など）
  endHook(sim, st, V, endId);
  applyEffects(sim, st, V, E.effects || {}, ctx);
  if (E.then) {
    const cast = st.arc === 'lot_and_rescuer' ? { slayer: st.cast.adv } : {};
    startArc(sim, E.then, V, cast, { k: st.k });
  }
  S.tribes.hist.push({ d: sim.today, y: sim.year(), arc: st.arc, end: endId, v: V.id, text });
  if (S.tribes.hist.length > 200) S.tribes.hist.shift();
}
function endEmo(endId) { return /slain|saved|renewed|market|stone|trade|bridge|wed|aid|ally|honor|found|resealed|recall|charter|reveal|keep|return/.test(endId) ? 0.5 : -0.6; }
function endHook(sim, st, V, endId) {
  const S = sim.S, c = st.cast, g = gOfV(V), t = tribeOfV(V), R = sim.rng;
  const P = (role) => person(sim, c[role]);
  switch (`${st.arc}:${endId}`) {
    case 'lot_and_rescuer:end_slain': {
      const adv = P('adv'), gc = guardianC(sim, V);
      if (gc) { killCreature(sim, gc, adv || null); }
      V.gstate = 'slain'; V.slainDay = sim.today; V.send = null;
      TS(sim).stats.slain++;
      if (adv) { adv.fame += 40; adv.deeds.push(`奥地の${V.name}の若者を救うため${g.name}を討った`); }
      break;
    }
    case 'lot_and_rescuer:end_fallen': {
      const adv = P('adv'), gc = guardianC(sim, V);
      if (adv) sim.die(adv, 'monster', gc || null);
      break;
    }
    case 'lot_and_rescuer:end_swap': {
      const adv = P('adv');
      if (adv && V.send) { V.send.pid = adv.id; adv.sentInstead = true; sim.remember(adv, `${P('youth')?.given || '若者'}の身代わりとして、${g.lair.name}へ行くと決めた`, { emo: 0.2, imp: 1, k: 'offering' }); }
      break;
    }
    case 'lot_and_rescuer:end_renewed': V.renewed = true; V.send = null; break;
    case 'guardian_fallout:end_exposed': case 'guardian_fallout:end_saved': case 'guardian_fallout:end_faith': case 'guardian_fallout:end_curse': {
      if (endId === 'end_saved') {
        // 送られた人たちが帰ってくる（潮の主の環礁・大蛇の洞など）
        for (const a of TS(sim).away.filter((x) => x.v === V.id).slice()) { const p = S.people[a.pid]; if (!p) continue; TS(sim).away.splice(TS(sim).away.indexOf(a), 1); comeBack(sim, p, V, g, 'saved'); }
      }
      if (endId === 'end_curse') breakPromiseQuiet(sim, V);
      break;
    }
    case 'frontier_clash:end_war': {
      for (const id of sim.S.world.settlements[V.sid].buildings) { const b = sim.building(id); if (b && b.type === 'house' && R.chance(0.4)) { b.burnt = true; b.name = '焼け跡'; } }
      break;
    }
    case 'youth_to_capital:end_bridge': {
      const y = P('youth'); if (y) { y.fame += 15; y.deeds.push(`故郷${V.name}と${kname(st.k)}の案内人になった`); moveHome(sim, y, V); }
      break;
    }
    case 'youth_to_capital:end_return': { const y = P('youth'); if (y) moveHome(sim, y, V, true); break; }
    case 'seal_broken:end_slain': { const hero = P('hero'), gc = guardianC(sim, V); if (gc) killCreature(sim, gc, hero || null); V.gstate = 'slain'; if (hero) hero.fame += 60; break; }
    case 'seal_broken:end_resealed': { V.lamps = 7; if (gOfV(V)?.sealed) V.gstate = 'sealed'; const gc = guardianC(sim, V); if (gc) { gc.dormant = true; gc.calm = Infinity; } break; }
    case 'seal_broken:end_ashland': { V.block = sim.today + 800; break; }
    case 'sent_ones_island:end_together': case 'sent_ones_island:end_lost': { const k = P('kin'); if (k) goAway(sim, k, V, null, g?.id); break; }
    case 'first_trade:end_greed': { const m = P('merchant'); if (m) { const hh = sim.hh(m); if (hh) hh.money += 60; m.treasures = m.treasures || []; m.treasures.push(`${t.name}の聖なる品`); } break; }
    case 'faith_schism:end_break': breakPromise(sim, V, '村が約束を破ると決めた'); break;
    case 'lean_year:end_aid': {
      const K = S.kingdoms[st.k]; if (K) K.treasury -= 60;
      const m = S.towns[V.sid]; for (const [k, n] of Object.entries(g.offering.major.goods || {})) m.stock[k] = Math.max(m.stock[k] || 0, n);
      V.pendingMajor = true;
      break;
    }
    case 'lean_year:end_raid': { const m = S.towns[V.sid]; for (const [k, n] of Object.entries(g.offering.major.goods || {})) m.stock[k] = Math.max(m.stock[k] || 0, n); V.pendingMajor = true; break; }
    case 'lean_year:end_vassal': { const m = S.towns[V.sid]; for (const [k, n] of Object.entries(g.offering.major.goods || {})) m.stock[k] = Math.max(m.stock[k] || 0, n); V.pendingMajor = true; break; }
    case 'lean_year:end_wrath': breakPromise(sim, V, '供物がそろわなかった'); break;
    case 'cross_marriage:end_wed': case 'cross_marriage:end_elope': {
      const A = P('a'), B = P('b');
      if (A && B && A.spouseId == null && B.spouseId == null) { sim.marry(A, B); if (endId === 'end_elope') for (const p of [A, B]) sim.remember(p, 'だれにも告げずに駆け落ちした', { emo: 0.4, imp: 1, k: 'marriage' }); }
      break;
    }
    case 'cross_marriage:end_part': { const A = P('a'), B = P('b'); if (A && B) { sim.relMut(A, B).a -= 30; sim.relMut(B, A).a -= 30; } break; }
    case 'demon_alliance:end_ally': V.ally[st.k] = true; break;
    case 'relic_hunt:end_found': {
      const adv = P('adv'), L = legendById(st.data.legend);
      if (adv && L?.prize) { adv.treasures = adv.treasures || []; if (!adv.treasures.includes(L.prize)) adv.treasures.push(L.prize); adv.fame += 25; adv.deeds.push(`「${L.name}」から「${L.prize}」を持ち帰った`); }
      if (L) { const e = TS(sim).legends[L.id]; if (e) e.found = true; }
      break;
    }
    case 'relic_hunt:end_lost': { const adv = P('adv'); if (adv && adv.deathYear == null && R.chance(0.5)) sim.die(adv, 'monster'); break; }
    case 'dragon_kin:end_recall': { const d = S.creatures[c.dragon]; if (d) { d.calm = S.t + 1440 * DAYS_PER_YEAR * 3; d.enraged = 0; d.range = Math.min(d.range || 6, 6); } break; }
    case 'dragon_kin:end_slain': { const d = S.creatures[c.dragon], hero = P('hero'); if (d) killCreature(sim, d, hero || null); break; }
    case 'dragon_kin:end_fail': { const hero = P('hero'), d = S.creatures[c.dragon]; if (hero && R.chance(0.6)) sim.die(hero, 'monster', d || null); break; }
  }
}
function breakPromiseQuiet(sim, V) { V.faith = clamp(V.faith - 5, 0, 100); }
function partyPower(sim, p) {
  const pt = p.party != null ? sim.S.advParties?.[p.party] : null;
  const mem = pt && !pt.gone ? pt.members.map((id) => sim.S.people[id]).filter((m) => m && m.deathYear == null) : [p];
  return mem.reduce((s, m) => s + (m.lv || 1) + (m.atk || 0) / 3, 0);
}
function strongest(sim, k) {
  return sim.living().filter((p) => (isAdventurer(p) || ['knight', 'general', 'paladin', 'royalguard'].includes(p.job)) && !p.tribe && sim.town(p.s)?.kingdom === k && p.jail == null).sort((a, b) => (b.lv * 10 + (b.atk || 0)) - (a.lv * 10 + (a.atk || 0)))[0] || null;
}

// ---------- 効き目 ----------
function applyEffects(sim, st, V, eff, ctx) {
  const S = sim.S, R = sim.rng, k = st.k, g = gOfV(V), t = tribeOfV(V);
  if (eff.attitude) V.att = V.att.map((a, i) => clamp(a + (i === k ? eff.attitude : eff.attitude / 3), -100, 100));
  if (eff.faith) V.faith = clamp(V.faith + eff.faith, 0, 100);
  if (eff.guardian === 'slain' && V.gstate !== 'slain') { const gc = guardianC(sim, V); if (gc) killCreature(sim, gc, null); V.gstate = 'slain'; V.slainDay = sim.today; }
  if (eff.guardian === 'angry') { if (V.gstate !== 'angry') breakPromise(sim, V, '約束が破れた'); }
  if (eff.guardian === 'calm' && V.gstate === 'angry') V.angryUntil = sim.today;
  if (eff.guardian === 'renewed') V.renewed = true;
  if (eff.guardian === 'gone') V.gstate = 'gone';
  if (eff.spawn) {
    const sp = eff.spawn === 'onSlain.beast' ? st.data.slain?.beast : eff.spawn;
    if (sp && SPECIES[sp]) spawnBeasts(sim, V, sp);
  }
  if (eff.pop && eff.pop < 0) villagersLeave(sim, V, -eff.pop, st, ctx);
  if (eff.trade) { V.trade[k] = true; }
  if (eff.annex) annexVillage(sim, V, k, st.arc === 'annex' && st.ending === 'end_charter' ? 'charter' : 'annex');
  if (eff.frontierOpen) openFrontier(sim, V);
  if (eff.frontierBlock) V.block = Math.max(V.block || 0, sim.today + eff.frontierBlock);
  if (eff.legend) spreadLegend(sim, eff.legend, 6);
  if (eff.rumor) spreadRumor(sim, loreText(eff.rumor, ctx), V);
  if (eff.chronicle) sim.chron(loreText(eff.chronicle, ctx), k);
  if (eff.leave === 'youth') {
    const ys = st.arc === 'faith_schism' ? sim.living().filter((p) => p.s === V.sid && sim.ageOf(p) >= 18 && sim.ageOf(p) <= 30 && p.values.faith < 0.5) : [person(sim, st.cast.youth)].filter(Boolean);
    const dest = nearestTown(sim, V, k);
    if (dest) for (const y of ys) if (y.s === V.sid || st.arc === 'youth_to_capital') { if (st.arc !== 'youth_to_capital') moveToTown(sim, y, dest, {}); }
  }
  if (eff.leave === 'adv') { /* 身代わり：endHook で送り出しの相手を入れ替えた */ }
  if (eff.join === 'adv') { const adv = person(sim, st.cast.adv); if (adv) moveToTown(sim, adv, sim.town(V.sid), { tribalHouse: true }); }
  if (eff.join === 'envoy') {
    const e = person(sim, st.cast.envoy), cap = S.world.settlements.find((s) => s.type === 'capital' && s.kingdom === k);
    if (e && cap) { moveToTown(sim, e, cap, { job: e.values.courage > 0.6 ? 'warrior' : 'archer', inn: true }); e.fame += 20; e.deeds.push(`${t.name}の使者として${kname(k)}と盟約を結び、魔王討伐に加わった`); }
  }
}
function spawnBeasts(sim, V, sp) {
  const n = SPECIES[sp].pack ? 5 : sp === 'dragon' || sp === 'arachne' ? 1 : 3;
  const at = V.lair || V;
  for (let i = 0; i < n; i++) {
    const c = makeCreature(sim, sp, at.x + sim.rng.int(-3, 3), at.z + sim.rng.int(-3, 3), { hx: at.x, hz: at.z, range: 8, lv: 2 + sim.rng.int(0, 2) });
    if (c && c.hp > 0) c.fromGuardian = V.id;
    if (c && c.hp > 0 && (sp === 'dragon' || sp === 'arachne')) { c.named = true; c.title = sp === 'dragon' ? '赤き竜ヴァルグリム' : c.name; applyStats(c); c.hp = c.maxhp; }
  }
}
// 人が村を去る（王国の町へ逃れる）。子どもは親と一緒に
function villagersLeave(sim, V, frac, st, ctx) {
  const S = sim.S, R = sim.rng;
  const hhs = Object.values(S.households).filter((h) => h.s === V.sid && h.members.length);
  const here = sim.living().filter((p) => p.s === V.sid).length;
  let need = Math.max(1, Math.round(here * frac));
  const dest = nearestTown(sim, V, st.k) || nearestTown(sim, V, V.faces);
  if (!dest) return;
  for (const hh of R.shuffle(hhs)) {
    if (need <= 0) break;
    if (hh.members.includes(V.elder)) continue;
    const mem = hh.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
    moveHousehold(sim, hh, dest);
    for (const p of mem) sim.remember(p, `${V.name}を離れ、${dest.name}へ逃れた`, { emo: -0.8, imp: 1, k: 'arrival' });
    need -= mem.length;
  }
  sim.pushLog(`${V.name}の人々の一部が、村を離れて${dest.name}へ移った。`, 'event', [], dest);
}
function moveHousehold(sim, hh, dest) {
  const S = sim.S;
  const old = hh.house != null ? sim.building(hh.house) : null;
  if (old && old.type === 'house' && old.hh === hh.id) { old.hh = null; old.name = '空き家'; }
  hh.s = dest.id; hh.house = null;
  const nb = sim.placeHouse(dest) || dest.buildings.map((id) => sim.building(id)).find((q) => q.type === 'house' && q.hh == null);
  if (nb) { hh.house = nb.id; nb.hh = hh.id; nb.name = hh.name; nb.owner = nb.owner ?? hh.id; nb.value = nb.value || houseValue(sim, nb); sim.events.push({ type: 'building', id: nb.id }); hh.street = false; }
  else hh.street = true;
  for (const id of hh.members) { const p = S.people[id]; if (p) { p.s = dest.id; p.action = null; p.mission = null; } }
  hh.tribal = false;
}
function moveToTown(sim, p, dest, opt = {}) {
  const S = sim.S, R = sim.rng;
  const old = sim.hh(p);
  if (old) { old.members = old.members.filter((id) => id !== p.id); if (!old.members.length) { const b = old.house != null ? sim.building(old.house) : null; if (b && b.type === 'house' && b.hh === old.id) { b.hh = null; b.name = '空き家'; } transferEstate(sim, old, null); delete S.households[old.id]; } }
  const hid = S.nextHh++;
  let house = null;
  if (opt.tribalHouse && dest.tribal) house = dest.buildings.map((id) => sim.building(id)).find((q) => q.type === 'house' && q.hh == null) || placeHouseIn(sim, dest, tribeById(dest.tribe), `${p.family}の家`);
  const inn = !house ? sim.townBuilding(dest, 'tavern') : null;
  S.households[hid] = { id: hid, members: [p.id], house: house ? house.id : inn ? inn.id : null, inn: !house && !!inn, s: dest.id, money: R.int(15, 40), food: 2, comfort: 0, name: house ? `${p.family}の家` : `${p.family}（宿住まい）`, street: !house && !inn, tribal: !!dest.tribal };
  if (house) { house.hh = hid; house.owner = hid; house.name = `${p.family}の家`; }
  p.hh = hid; p.s = dest.id; p.action = null; p.mission = null;
  if (opt.job && JOBS[opt.job]) { p.formerJob = p.job; p.job = opt.job; p.rank = JOBS[opt.job].rank; p.skill[opt.job] = Math.max(p.skill[opt.job] || 0, 0.25); }
  sim.dirty();
}
function moveHome(sim, p, V, keepJob = false) {
  const s = sim.town(V.sid);
  const par = [sim.S.people[p.fatherId], sim.S.people[p.motherId]].find((q) => q && q.deathYear == null && q.s === V.sid);
  const old = sim.hh(p);
  if (par && sim.hh(par)) { sim.moveTo(p, sim.hh(par)); if (old && old !== sim.hh(par) && !old.members.length) delete sim.S.households[old.id]; }
  else moveToTown(sim, p, s, { tribalHouse: true });
  p.s = V.sid; p.tribeLeft = false;
  if (!keepJob || isAdventurer(p)) { p.formerJob = p.job; p.job = 'hunter'; p.rank = JOBS.hunter.rank; }
  sim.dirty();
}

// ---------- 併合と開拓の解放 ----------
function annexVillage(sim, V, k, how = 'annex') {
  const S = sim.S, s = sim.town(V.sid), t = tribeOfV(V);
  if (V.annexed === k) return;
  V.annexed = k; s.kingdom = k; s.annexed = k; s.charter = how === 'charter';
  if (S.expansion) S.expansion.sk[V.sid] = k;
  for (const ci of tribalChunks(sim, V.id)) annexTribalLand(sim, ci, k, how === 'conquest' ? '奪取' : '併合');
  TS(sim).stats.annexed++;
  if (how === 'conquest') sim.chron(`${t.name}の${V.name}が${kname(k)}の手に落ちた`, k);
  for (const hh of Object.values(S.households)) if (hh.s === V.sid) hh.tribal = how === 'charter';
}
function openFrontier(sim, V) {
  const S = sim.S, tr = S.territory, w = S.world;
  if (!tr?.tribe || !V.lair) return;
  const CW = tr.cw;
  const changed = [];
  for (const ci of tribalChunks(sim, V.id)) {
    const cx = (ci % CW) * EXP_CS + (EXP_CS >> 1), cz = Math.floor(ci / CW) * EXP_CS + (EXP_CS >> 1);
    if (cheb(cx, cz, V.x, V.z) <= V.r + EXP_CS) continue;   // 村そのものの区画は残す
    tr.tribe[ci] = -1; tr.kind[ci] = 0;
    for (let z = Math.floor(ci / CW) * EXP_CS; z < Math.floor(ci / CW) * EXP_CS + EXP_CS; z++) for (let x = (ci % CW) * EXP_CS; x < (ci % CW) * EXP_CS + EXP_CS; x++) if (inb(x, z) && w.kingdomOf[z * W + x] === -3) w.kingdomOf[z * W + x] = -1;
    changed.push(ci);
  }
  if (changed.length && S.expansion) S.expansion._borders = true;
}

// ---------- 噂と伝説 ----------
function spreadRumor(sim, text, V) {
  const S = sim.S, R = sim.rng;
  const towns = S.world.settlements.filter((s) => !s.tribal && Math.hypot(s.x - V.x, s.z - V.z) < 90 * LS);
  for (const s of R.shuffle(towns).slice(0, 3)) {
    for (const p of R.shuffle(sim.living().filter((q) => q.s === s.id && sim.isAdult(q))).slice(0, 3)) sim.remember(p, `噂で聞いた：${text}`, { emo: -0.1, imp: 0.5, k: 'rumor' });
  }
}
function spreadLegend(sim, id, n = 3) {
  const L = legendById(id), S = sim.S, R = sim.rng;
  if (!L) return;
  const e = TS(sim).legends[id] = TS(sim).legends[id] || { bid: null, heard: 0, posted: -99, found: false };
  const taverns = S.world.settlements.filter((s) => !s.tribal).map((s) => sim.townBuilding(s, 'tavern')).filter(Boolean);
  const tav = R.pick(taverns);
  if (!tav) return;
  const s = sim.town(tav.settlement ?? 0) || S.world.settlements.find((q) => q.buildings.includes(tav.id));
  const inside = sim.living().filter((p) => p.inside === tav.id);
  const pool = inside.length >= 2 ? inside : sim.living().filter((p) => p.s === s?.id && sim.isAdult(p));
  const rumor = R.pick(L.rumors);
  const teller = R.pick(pool);
  if (!teller) return;
  sayLine(sim, teller, rumor);
  for (const p of R.shuffle(pool.slice()).slice(0, n)) if (p !== teller) sim.remember(p, `酒場で「${rumor}」という噂を聞いた`, { emo: 0.3, imp: 0.45, k: 'legend', legend: id });
  sim.remember(teller, `「${L.name}」の噂を酒場で話した`, { emo: 0.2, imp: 0.3, k: 'legend' });
  e.heard++;
}
function legendsDaily(sim) {
  const S = sim.S, R = sim.rng, X = TS(sim);
  const placed = new Set(X.villages.map((V) => V.tribe));
  const known = LEGENDS.filter((L) => !L.tribe || placed.has(L.tribe) || L.site);
  if (sim.today % 3 === 0 && known.length) spreadLegend(sim, R.pick(known).id, 3);
  // ギルドの依頼（伝説の探索）：王都ごとに1つまで
  const open = (S.quests || []).filter((q) => q.legend && (q.state === 'open' || q.state === 'taken'));
  if (sim.today % 4 === 0 && open.length < 2) {
    const cands = known.filter((L) => L.quest && X.legends[L.id]?.bid != null && !X.legends[L.id].found && sim.today - (X.legends[L.id].posted ?? -99) > 20 && !open.some((q) => q.legend === L.id));
    const L = R.pick(cands);
    if (L) postLegendQuest(sim, L);
  }
  // 依頼を受けた冒険者 → 伝説の宝を探して
  for (const q of S.quests || []) {
    if (!q.legend || q.arcStarted || q.state !== 'taken' || !q.takenBy?.length) continue;
    q.arcStarted = true;
    const L = legendById(q.legend);
    const V = X.villages.find((v) => v.tribe === L.tribe) || X.villages.slice().sort((a, b) => { const b0 = S.world.buildings[X.legends[L.id].bid]; return b0 ? Math.hypot(a.x - b0.x, a.z - b0.z) - Math.hypot(b.x - b0.x, b.z - b0.z) : 0; })[0];
    if (!V || !R.chance(0.5)) continue;
    startArc(sim, 'relic_hunt', V, { adv: q.takenBy[0] }, { k: sim.town(S.people[q.takenBy[0]]?.s)?.kingdom ?? V.faces, data: { legend: L.id, quest: q.id } });
  }
  // 伝説の依頼が片づいたら宝を渡す（筋が始まらなかったときも）
  for (const q of S.quests || []) {
    if (!q.legend || q.prized || q.state !== 'done') continue;
    q.prized = true;
    const L = legendById(q.legend);
    const who = (q.takenBy || []).map((id) => S.people[id]).find((p) => p && p.deathYear == null);
    if (who && L?.prize && !X.arcs.some((a) => a.arc === 'relic_hunt' && a.data.quest === q.id)) {
      who.treasures = who.treasures || []; if (!who.treasures.includes(L.prize)) who.treasures.push(L.prize);
      who.fame += 20;
      sim.chron(`冒険者${sim.fullName(who)}が「${L.name}」から「${L.prize}」を持ち帰った`, sim.townOf(who).kingdom);
      sim.news(`冒険者${who.given}が伝説の「${L.prize}」を持ち帰った`, 3, who.pos);
      X.legends[L.id].found = true;
    }
  }
}
function postLegendQuest(sim, L) {
  const S = sim.S, X = TS(sim), e = X.legends[L.id];
  const b = S.world.buildings[e.bid];
  if (!b) return null;
  const cap = S.world.settlements.filter((s) => s.type === 'capital' && !S.towns[s.id]?.occupied).sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z))[0];
  if (!cap) return null;
  const giver = sim.rng.pick(sim.living().filter((p) => p.s === cap.id && ['scholar', 'courtmage', 'sage', 'noble', 'merchant'].includes(p.job)));
  S.quests = S.quests || [];
  S.nextQuest = (S.nextQuest || 0) + 1;
  const quest = { id: S.nextQuest, state: 'open', takenBy: [], posted: sim.today, deadline: sim.today + 20, type: 'explore', s: cap.id, target: 'b' + b.id, rank: Math.min(6, Math.max(1, Math.round(L.danger / 1.7))), reward: 30 + L.danger * 18, giver: giver?.id, title: `${L.quest}（伝説「${L.name}」）`, legend: L.id };
  S.quests.push(quest);
  e.posted = sim.today;
  const g = sim.townBuilding(cap, 'guild');
  sim.pushLog(`【依頼】${quest.title}（報酬${quest.reward}銅貨）`, 'event', giver ? [giver.id] : [], g ? g.door : cap);
  return quest;
}

// ========================================================================================
// 4. 行き先（placeFor の頭で呼ぶ）
// ========================================================================================
export function tribesPlace(sim, p, kind) {
  const s = sim.town(p.s);
  if (!s?.tribal) return null;
  const V = vOf(sim, s.tribeV);
  if (!V) return null;
  const shrine = V.shrine != null ? sim.building(V.shrine) : null;
  switch (kind) {
    case 'church': case 'clinic': case 'shrine': return shrine ? { x: shrine.door.x, z: shrine.door.z } : null;
    case 'school': case 'market': return sim.randomNear(s.x, s.z, 2) || { x: s.x, z: s.z };
    case 'guild': case 'barracks': case 'castle': case 'mansion': case 'prison': case 'magictower': case 'smithy': case 'bakery': case 'workshop': return sim.randomNear(s.x, s.z, 2) || { x: s.x, z: s.z };
  }
  return null;
}

// ========================================================================================
// 5. 話し方（speech.js の Voice につなぐ）
// ========================================================================================
export function tribeVoice(p) { return p?.tribe ? TRIBE_SPEECH[p.tribe] || null : null; }
export function tribeFirstPerson(p, age) {
  const v = tribeVoice(p);
  if (!v || age < 13) return null;
  return age >= 60 ? v.me.elder : v.me[p.sex] || v.me.m;
}
export function tribeTail(p, kind, rng) {
  const v = tribeVoice(p);
  const arr = v?.tails?.[kind] || v?.tails?.n;
  return arr ? rng.pick(arr) : null;
}
// あいさつ：よそ者には民族のあいさつ、仲間には呼びかけ
export function tribeGreeting(api, p, B) {
  const v = tribeVoice(p);
  if (!v || api.ageOf(p) < 13) return null;
  if (B.tribe !== p.tribe) return api.rng.pick(v.greet);
  if (api.rng.chance(0.3)) return `${v.kin}、${api.rng.pick(v.exclaim)}`;
  return null;
}
// 話題：民族の人は守り神・よそ者・暮らし・約束の年・怖いことを話す。王国の人は伝説の噂を話す
export function tribeTopic(api, A, B) {
  const v = tribeVoice(A);
  const X = api.S.tribes;
  if (v && api.ageOf(A) >= 13) {
    const V = X?.villages.find((x) => x.sid === A.s) || X?.villages.find((x) => x.tribe === A.tribe);
    const g = V ? guardianOfTribe(V.tribe) : null;
    const due = V && g && offeringDue(g, api.year()) && V.majorYear !== api.year();
    const next = due ? 'offering' : V && (V.gstate === 'angry' || V.gstate === 'woken') ? 'fear' : null;
    const w = 2.2;
    return {
      w, fn: (api2, A2, B2, voice) => {
        const R = api2.rng;
        const group = next && R.chance(0.6) ? next : B2.tribe !== A2.tribe && R.chance(0.5) ? 'outsider' : R.pick(['guardian', 'life', 'life', 'outsider']);
        const line = R.pick(v.lines[group] || v.lines.life);
        if (!line) return { kind: 'tribe', text: R.pick(v.exclaim) };
        let [body, kind] = line;
        if (B2.tribe !== A2.tribe && R.chance(0.3)) body = `${v.you}、${body}`;
        const text = kind === 'raw' ? body + (/[。！？」]$/.test(body) ? '' : '。') : voice.s(body, kind);
        return { kind: 'tribe', text, sentiment: group === 'fear' || group === 'offering' ? -0.3 : 0.1 };
      },
    };
  }
  // 王国の人：酒場で聞いた伝説・奥地の噂
  const m = A.memories?.find((x) => (x.k === 'legend' || x.k === 'rumor' || x.k === 'tribe') && api.today - x.t < 8 && x.src !== 'heard');
  if (m) return { w: 1.4, fn: (api2, A2, B2, voice) => ({ kind: 'legend', text: voice.s(m.txt.replace(/^噂で聞いた：/, '').replace(/。$/, '') + 'って話', 'n'), sentiment: 0.1 }) };
  return null;
}
export function tribeThoughts(api, p) {
  const v = tribeVoice(p);
  if (!v || api.ageOf(p) < 10) return [];
  const R = api.rng, out = [];
  out.push(R.pick(v.exclaim));
  if (p.saying) out.push(`『${p.saying}』……ご先祖の言葉だ。`);
  const line = R.pick(v.lines.guardian || []);
  if (line) out.push(line[0] + '……。');
  const X = api.S.tribes, V = X?.villages.find((x) => x.sid === p.s);
  if (V?.send?.pid === p.id) out.push('約束の日まで、あと何日だろう。', 'くじを引いたあの手の冷たさが、まだ残っている。');
  if (V && (V.gstate === 'angry')) out.push(R.pick(v.lines.fear || [['……', 'raw']])[0] + '……。');
  return out;
}

// ========================================================================================
// 6. 画面向けの要約（ui.js の国々のタブなどで使う）
// ========================================================================================
export function tribesSummary(sim) {
  const X = sim.S.tribes;
  if (!X) return [];
  return X.villages.map((V) => {
    const t = tribeOfV(V), g = gOfV(V);
    const pop = sim.living().filter((p) => p.s === V.sid).length;
    return {
      id: V.id, sid: V.sid, name: V.name, tribe: t.name, alias: t.alias, pop, faith: Math.round(V.faith),
      guardian: g?.name || 'なし', gstate: { alive: '健在', angry: '怒っている', slain: '討たれた', sealed: '封じられている', woken: '目覚めた', gone: '去った', none: '―' }[V.gstate] || V.gstate,
      att: V.att.map((a, k) => ({ k, name: kname(k), a: Math.round(a), trade: V.trade[k], ally: V.ally[k] })),
      annexed: V.annexed != null ? kname(V.annexed) : null, renewed: V.renewed,
      next: g?.offering?.major ? nextMajorYear(g, sim.year()) : null,
      arcs: X.arcs.filter((a) => a.vid === V.id && !a.done).map((a) => arcById(a.arc)?.title),
    };
  });
}
function nextMajorYear(g, y) { for (let i = 0; i < 40; i++) if (offeringDue(g, y + i)) return y + i; return null; }
// 人の詳細欄：「ドゥール＝アン（フィアナの民）」の括弧の中身。民族の人でなければ null
export function tribeLabel(sim, p) {
  const s = sim.town(p.s);
  const t = p.tribe ? tribeById(p.tribe) : s?.tribal ? tribeById(s.tribe) : null;
  if (!t) return null;
  if (s?.tribal && s.annexed != null) return `${t.name}・${kname(s.annexed)}${s.charter ? 'の自治村' : '領'}`;
  return s?.tribal ? t.name : `${t.name}の出`;
}
// 国々のタブ：奥地の民の欄（esc は ui.js の esc）
export function tribesNationHTML(sim, esc) {
  const list = tribesSummary(sim);
  if (!list.length) return '';
  const X = sim.S.tribes;
  let h = `<div class="nation tribes"><div class="nname">奥地の民</div>`;
  for (const v of list) {
    const V = X.villages[v.id];
    h += `<dl class="kv" style="margin-top:6px"><dt class="link" data-goto="${V.x},${V.z}">${esc(v.name)}</dt><dd>${esc(v.tribe)}（${esc(v.alias)}）・${v.pop}人${v.annexed ? `・${esc(v.annexed)}領` : ''}</dd>
      <dt>守り神</dt><dd>${esc(v.guardian)}（${esc(v.gstate)}）${v.renewed ? '・人を送らない約束に改めた' : ''}${v.next ? `・次の約束の年 ${v.next}年` : ''}</dd>
      <dt>信仰</dt><dd>${v.faith}</dd>
      <dt>王国への態度</dt><dd>${v.att.map((a) => `${esc(a.name.replace('王国', ''))} <b class="${a.a < -30 ? 'up' : a.a > 30 ? 'down' : ''}">${a.a}</b>${a.trade ? '・交易' : ''}${a.ally ? '・盟約' : ''}`).join('　')}</dd>
      ${v.arcs.length ? `<dt>いま</dt><dd>${v.arcs.map(esc).join('、')}</dd>` : ''}</dl>`;
  }
  const pend = (X.pending || []).map((id) => tribeById(id)?.name).filter(Boolean);
  if (pend.length) h += `<p class="small">まだ誰も知らない民：${pend.map(esc).join('、')}（大陸が広がれば見つかる）</p>`;
  return h + '</div>';
}
// 試験・デバッグ用：筋を手で始める（村番号 vid）
export function startTribeArc(sim, arcId, vid, cast = {}, ctx = {}) { return startArc(sim, arcId, vOf(sim, vid), cast, ctx); }
