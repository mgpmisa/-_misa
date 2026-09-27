// 首都のまわりの農家（経済部）
// 首都の城壁の外に、畑つきの農家を置く。数は首都の人口に見合うだけ（道・川・建物・柵は避ける）。
// 農家は畑で麦を作り、家で食べきれない分は家の蔵へ入れて市場で売る（stash → 市場。お金は取り引きでだけ動く）。
// 新しい世界を作るときだけ置く。古いセーブには足さない。
import { T, W, H } from './world.js';
import { JOBS, DAYS_PER_YEAR, traitLabels } from './data.js';
import { createPersonFactory } from './history.js';
import { starterKit } from './items.js';
import { humanStats } from './society.js';
import { speechStyle } from './speech.js';
import { houseValue } from './property.js';
import { clamp } from './rng.js';

const LAND = new Set([T.GRASS, T.SAVANNA, T.FOREST]);
const FAMS_N = ['アッカー', 'フェルト', 'ハーファー', 'ロッゲ', 'ヴィーゼ', 'ゲルステ', 'ブラッハ', 'ザート', 'ヘッケ', 'ミューレ', 'シュトロー', 'ヘルプスト'];
const FAMS_S = ['アル＝ハクル', 'イブン＝ザルア', 'アル＝カムフ', 'バヌー＝ナフル', 'アル＝サキヤ', 'イブン＝ハサード'];
const inb = (x, z) => x >= 2 && z >= 2 && x < W - 2 && z < H - 2;

export function initFarmsteads(sim) {
  const S = sim.S, w = S.world, R = sim.rng, Y = sim.year();
  S.farmsteads = S.farmsteads || { made: 0, hh: [] };
  const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
  const changed = [];
  for (const s of w.settlements) {
    if (s.type !== 'capital' || s.tribal) continue;
    const ppl = sim.living().filter((p) => p.s === s.id);
    const farmers = ppl.filter((p) => p.job === 'farmer' && sim.ageOf(p) >= 18).length;
    const want = clamp(Math.round(ppl.length / 16) - Math.floor(farmers / 2), 2, 6);
    const south = s.kingdom === 2;
    const fams = R.shuffle((south ? FAMS_S : FAMS_N).slice());
    const people = [];
    for (let i = 0; i < want; i++) {
      const site = findSite(sim, s);
      if (!site) break;
      const fam = fams[i % fams.length];
      // 家族：夫婦（ともに農夫）と子ども0〜3人
      const age = R.int(24, 50);
      const h = make({ sex: 'm', family: fam, birthYear: Y - age, s: s.id, south });
      const wf = make({ sex: 'f', family: fam, birthYear: Y - age + R.int(-4, 4), s: s.id, south });
      h.spouseId = wf.id; wf.spouseId = h.id;
      const mem = [h, wf];
      const nk = R.int(0, 3);
      for (let k = 0; k < nk; k++) {
        const ka = R.int(0, Math.min(16, age - 19));
        if (ka < 0) continue;
        const c = make({ sex: R.chance(0.5) ? 'm' : 'f', family: fam, birthYear: Y - ka, father: h, mother: wf, s: s.id, south });
        if (!h.children.includes(c.id)) h.children.push(c.id);
        if (!wf.children.includes(c.id)) wf.children.push(c.id);
        mem.push(c);
      }
      const hid = S.nextHh++;
      const b = build(sim, s, site, `${fam}家の農家`, changed);
      const hh = S.households[hid] = { id: hid, members: mem.map((p) => p.id), house: b.id, s: s.id, money: R.int(50, 110), food: mem.length * 4, comfort: 0, name: `${fam}家`, land: 2, farmstead: true };
      b.hh = hid; b.owner = hid; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0;
      for (const f of site.field) w.fields.push({ x: f.x, z: f.z, s: s.id, farm: hid });
      for (const p of mem) { p.hh = hid; initFarmer(sim, p, b.door, s); people.push(p); }
      S.farmsteads.hh.push(hid); S.farmsteads.made++;
    }
    // 家族どうしと、ほかの農家とのつきあい
    for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) link(sim, people[i], people[j]);
  }
  sim._kin?.clear?.(); sim._anc?.clear?.();
  if (changed.length) sim.events?.push({ type: 'tiles', list: [...new Set(changed)] });
  sim.dirty?.();
}

// 家（2×2、扉は南）と、家のそばの畑（4〜6マス）。家とそのまわり1マスは、草地・サバンナ・森・やぶだけの場所
function findSite(sim, s) {
  const w = sim.S.world, R = sim.rng, tiles = w.tiles;
  const others = w.settlements.filter((q) => q !== s);
  const land = (x, z) => inb(x, z) && LAND.has(tiles[z * W + x]);
  const cands = [];
  for (let dz = -s.r - 20; dz <= s.r + 20; dz++) for (let dx = -s.r - 20; dx <= s.r + 20; dx++) {
    const x0 = s.x + dx, z0 = s.z + dz;
    // 城壁の外（首都の四角の外）
    if (!(x0 - 1 > s.x + s.r + 1 || x0 + 2 < s.x - s.r - 1 || z0 - 1 > s.z + s.r + 1 || z0 + 2 < s.z - s.r - 1)) continue;
    if (!land(x0, z0)) continue;
    cands.push({ x0, z0, d: Math.max(Math.abs(dx), Math.abs(dz)) + R.next() * 5 });
  }
  cands.sort((a, b) => a.d - b.d);
  for (const { x0, z0 } of cands) {
    if (others.some((q) => Math.max(Math.abs(q.x - x0), Math.abs(q.z - z0)) <= (q.r || 6) + 4)) continue;
    let ok = true;
    for (let z = z0 - 1; z <= z0 + 2 && ok; z++) for (let x = x0 - 1; x <= x0 + 2; x++) if (!land(x, z)) { ok = false; break; }
    if (!ok) continue;
    // 扉の前（z0+3）が歩ける
    const fr = tiles[(z0 + 3) * W + x0];
    if (fr === T.BLD || fr === T.FENCE || fr === T.RIVER || fr === T.SEA || fr === T.DEEP || fr === T.PEAK || fr === T.ROCK) continue;
    const field = [];
    for (let r = 1; r <= 3 && field.length < 6; r++) for (let z = z0 - 1 - r; z <= z0 + 2 + r && field.length < 6; z++) for (let x = x0 - 1 - r; x <= x0 + 2 + r && field.length < 6; x++) {
      if (Math.max(x0 - 1 - r - x, x - x0 - 2 - r, z0 - 1 - r - z, z - z0 - 2 - r) !== 0 && !(x === x0 - 1 - r || x === x0 + 2 + r || z === z0 - 1 - r || z === z0 + 2 + r)) continue;
      if (x === x0 && z === z0 + 3) continue;   // 扉の前はあける
      if (!land(x, z)) continue;
      field.push({ x, z });
    }
    if (field.length < 4) continue;
    return { x0, z0, field };
  }
  return null;
}

function build(sim, s, site, name, changed) {
  const w = sim.S.world, { tiles, hgt, bldAt } = w;
  const { x0, z0 } = site;
  const id = w.buildings.length;
  const door = { x: x0, z: z0 + 2 };
  const h0 = hgt[door.z * W + door.x];
  for (let z = z0; z < z0 + 2; z++) for (let x = x0; x < x0 + 2; x++) { const i = z * W + x; tiles[i] = T.BLD; bldAt[i] = id; hgt[i] = h0; changed.push(i); }
  // 扉の前の小道と、家のまわりの森を切り開く
  for (let x = x0 - 1; x <= x0 + 2; x++) { const i = (z0 + 2) * W + x; tiles[i] = x === door.x ? T.ROAD : T.GRASS; changed.push(i); }
  for (let z = z0 - 1; z <= z0 + 1; z++) for (const x of [x0 - 1, x0 + 2]) { const i = z * W + x; if (tiles[i] === T.FOREST) { tiles[i] = T.GRASS; changed.push(i); } }
  for (const f of site.field) { const i = f.z * W + f.x; tiles[i] = T.FIELD; hgt[i] = h0; changed.push(i); }
  const b = { id, type: 'house', name, x: x0, z: z0, w: 2, d: 2, door, h: h0, face: 'S', settlement: s.id, kingdom: s.kingdom, roof: s.kingdom === 2 ? 'flat' : 'thatch', farm: true };
  w.buildings.push(b);
  s.buildings.push(id);
  sim.events?.push({ type: 'building', id });
  return b;
}

function initFarmer(sim, p, pos, s) {
  const R = sim.rng, age = sim.ageOf(p);
  delete p.notes; delete p.anc2;
  p.job = age >= 14 ? 'farmer' : null;
  p.rank = JOBS[p.job]?.rank || 'commoner';
  p.needs = { survival: 85, sleep: R.range(60, 95), hunger: R.range(60, 90), lust: R.range(50, 95), sloth: R.range(50, 90), pleasure: R.range(40, 90), esteem: R.range(40, 90) };
  if (age < 16) p.needs.lust = 100;
  p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = R.range(0.4, 0.9); p.workedToday = 0;
  p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = {}; p.danger = {}; p.fame = 0;
  p.lv = 1 + Math.floor(clamp(R.range(0, 3) + (age > 30 ? 1 : 0), 0, 9));
  if (p.job) p.skill[p.job] = clamp(0.3 + Math.min(Math.max(0, age - 14), 30) / 40 + R.range(-0.1, 0.1), 0.05, 0.95);
  p.style = speechStyle(p, age); p.traits = traitLabels(p);
  p.inv = []; p.eq = {}; if (age >= 14) starterKit(p, R);
  p.purse = age < 14 ? R.int(0, 2) : R.int(3, 12);
  Object.assign(p, humanStats(sim, p)); p.hp = p.maxhp;
  p.pos = { x: pos.x, z: pos.z }; p.inside = null; p.path = []; p.action = null;
  const at = (ago) => -ago * DAYS_PER_YEAR - R.int(1, DAYS_PER_YEAR - 1);
  if (age >= 18) sim.remember(p, R.pick([`${s.name}の城壁の外で、畑を耕して暮らしてきた`, `親の代から、${s.name}の人たちの食べる麦を作ってきた`, '日照りの年は、畑に水を運ぶので一日が終わった']), { t: at(R.int(1, 10)), emo: 0.2, imp: 0.5, k: 'story' });
  if (age >= 10 && age < 18) sim.remember(p, '小さいころから、畑で親の手伝いをしてきた', { t: at(R.int(1, 5)), emo: 0.2, imp: 0.4, k: 'story' });
  sim.trimMemories?.(p);
}

function link(sim, a, b) {
  const R = sim.rng;
  if (a.rel[b.id]) return;
  const compat = 1 - (Math.abs(a.pers.E - b.pers.E) + Math.abs(a.pers.A - b.pers.A) + Math.abs(a.pers.O - b.pers.O)) / 3;
  const base = (compat - 0.55) * 60 + (a.pers.A + b.pers.A - 1) * 15 + 6;
  let fa = a.hh === b.hh ? 95 : 35, aa = base + R.gauss(0, 12), ab = base + R.gauss(0, 12);
  if (a.hh === b.hh) { const bonus = a.spouseId === b.id ? R.gauss(55, 20) : R.gauss(45, 18); aa += bonus; ab += bonus; }
  a.rel[b.id] = { a: clamp(aa, -100, 100), f: fa };
  b.rel[a.id] = { a: clamp(ab, -100, 100), f: fa };
}
