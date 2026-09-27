// 保存食の工房と、屋台・料理屋（開発部）
//
// 社長の許可（docs/畑と地域の食料.md 第9章の優先順位3）：
//   乳酪小屋（チーズ・バター）・燻製小屋・塩蔵所（塩漬け）・塩焼き小屋（塩田。海辺だけ）と、屋台・料理屋を町に置く。
//
// ■ 流れ（職場の蔵 js/workshop.js にのせる。パン工房と同じ）
//   1. 仕入れ：材料（牛の乳・肉・魚・塩・麦・パン・粉）を市場で持ち主から買い、職場の蔵へ
//      お金：職人の家計 → 品の持ち主（marketBuy。商人・作り手・村の蔵）
//   2. 作る：職場の蔵の材料を使って作り、職場の蔵へ（お金は動かない）
//   3. 売る：保存食は店先の棚（町の市場の品。持ち主＝職人の家）に並べ、売れたときに 客 → 職人の家計。
//            棚に入りきらない分は、市場へ行ったときに商人へ卸す（商人 → 職人の家計）
//   屋台と料理屋の料理は棚に出さず、店で客に出す：客の財布（足りなければ家計） → 屋台の主・料理屋の主の家計
//   店の借り賃：shops.js のまま（週ごと。借り手の家計 → 持ち主）。屋台は町の持ち物なので、場所代は 屋台の主 → 町の蓄え
//   新しいお金の置き場所は作らない（帳簿 ledger.js はそのまま）。
//
// ■ 作りすぎない
//   町の市場に目安の1.5倍ほどあれば作らない（workshop.js の stopM）。職場の蔵にたまれば作らない（back）。
//   燻製・塩漬けは、町の生の肉・魚が目安より多いとき（あまって傷みそうなとき）だけ買う（町の食べ物を取り上げない）。
//   料理は町の人の数に合わせた数だけ作る（傷みが早いので）。
//
// ■ 外食（needs.js の食べる判断に1つ足す）
//   空腹の人は、町に屋台か料理屋があり、料理ができていて、財布に余裕があれば、外で食べることを選ぶことがある。
//   家に食べ物がない人・人づきあいの好きな人・気前のよい人ほど選び、貧しい人は選ばない。市の日は屋台に人が集まる。
//
// ■ 本体からの呼び方（部長がつなぐ。apply.py）
//   ensureFoodshop(sim, fresh) … newWorld の ensureBuildings のあと（fresh=true）、load の ensureBuildings のあと
//   foodshopDaily(sim)         … newDay の shopsDaily の前（働き手の補充・記録）
//   dineCands(sim, p, cands)   … needs.js の needsCands の頭
//   dineArrive(sim, p, a)      … needs.js の needsArrive（a.type === 'dine'）
//   fsSummary(sim)             … 試験用の数字
import { JOBS } from './data.js';
import { T, W, H, tryPlace } from './world.js';
import { makeRng } from './rng.js';
import { SHOP_JOBS, ensureShops } from './shops.js';
import { WP, wsRegister, wsTake, shopOfHh, wsInvalidate, goodName } from './workshop.js';
import { GUILD_JOBS, isMarketDay } from './market.js';
import { matterGood } from './matter.js';
import { GOODS } from './data.js';
import { spendable, pay } from './property.js';
import { flow, meal, income } from './ledger.js';
import { BLD_TYPE_LABEL } from './buildings.js';

const alive = (p) => p && p.deathYear == null && p.needs;
const gd = (g) => GOODS[g] || matterGood(g);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// ================================================================ 仕事と建物の種類
export const FS_JOBS = {
  cheesemaker: { name: 'チーズ職人', place: 'dairy', rank: 'citizen' },
  smoker: { name: '燻製職人', place: 'smokehouse', rank: 'commoner' },
  salter: { name: '塩漬け職人', place: 'saltery', rank: 'commoner' },
  saltmaker: { name: '塩焼き', place: 'saltworks', rank: 'commoner' },
  stallkeeper: { name: '屋台の主', place: 'foodstall', rank: 'commoner' },
  chef: { name: '料理屋の主', place: 'eatery', rank: 'citizen' },
};
for (const [k, v] of Object.entries(FS_JOBS)) if (!JOBS[k]) JOBS[k] = v;
for (const k of ['cheesemaker', 'smoker', 'salter', 'chef']) GUILD_JOBS.add(k);

export const FS_TYPE_LABEL = { dairy: '乳酪小屋', smokehouse: '燻製小屋', saltery: '塩蔵所', saltworks: '塩焼き小屋（塩田）', foodstall: '屋台', eatery: '料理屋（煮売り屋）' };
export const FS_TYPES = new Set(Object.keys(FS_TYPE_LABEL));
Object.assign(BLD_TYPE_LABEL, FS_TYPE_LABEL);   // 建物の呼び名（ui.js）。建物の中を見られるようにもなる
const JOB_OF = { dairy: 'cheesemaker', smokehouse: 'smoker', saltery: 'salter', saltworks: 'saltmaker', foodstall: 'stallkeeper', eatery: 'chef' };

// 料理：材料（1皿ぶん）。お腹のふくれ方は材料の食べ物の量のまま（どこからも湧かせない）
export const DISHES = {
  meat_skewer: { inp: { meat: 0.35, bread: 0.25 }, at: 'foodstall', bowl: false },
  grilled_fish: { inp: { fish: 0.5, bread: 0.25 }, at: 'foodstall', bowl: false },
  pie_meat: { inp: { meat: 0.25, flour_wheat: 0.45 }, at: 'foodstall', bowl: false },
  stew_meat: { inp: { meat: 0.3, wheat: 0.6 }, at: 'eatery', bowl: true },
  fishstew_fish: { inp: { fish: 0.4, wheat: 0.6 }, at: 'eatery', bowl: true },
  porridge_wheat: { inp: { wheat: 1.3 }, at: 'eatery', bowl: true },
};
const mealsOf = (g) => (g === 'flour_wheat' ? 0.95 : gd(g)?.meals || 0);   // 粉は麦とほぼ同じ（ひき減り）
export function dishFill(d) { let m = 0; for (const [g, n] of Object.entries(DISHES[d].inp)) m += n * mealsOf(g); return m * 30; }

// 作り方（workshop.js の PROD と同じ形）。alt でその時どきの品を選ぶ（null なら作らない）
function avail(sim, sid, st, g, need) { return (st[g] || 0) + (sim.S.towns[sid]?.stock?.[g] || 0) >= need; }
// 料理の材料：町の人が買う分（目安の7割）は残して、そのうえで手に入るか
function spare(sim, sid, st, g, need) { const m = sim.S.towns[sid]; return (st[g] || 0) + Math.max(0, (m?.stock?.[g] || 0) - (gd(g)?.target || 10) * 0.7) >= need; }
function surplus(sim, sid, g, mul) { const m = sim.S.towns[sid]; return (m?.stock?.[g] || 0) > (gd(g)?.target || 10) * mul; }
function under(sim, sid, g, mul = 1.2) { const m = sim.S.towns[sid]; return (m?.stock?.[g] || 0) < (gd(g)?.target || 10) * mul; }
const popCache = { t: -1, c: {} };
function popOf(sim, sid) {
  if (popCache.t !== sim.today || popCache.S !== sim.S) { popCache.t = sim.today; popCache.S = sim.S; popCache.c = {}; for (const p of sim.living()) popCache.c[p.s] = (popCache.c[p.s] || 0) + 1; }
  return popCache.c[sid] || 0;
}
const V = {
  cheese: { out: 'cheese', rate: 0.35, inp: { milk: 3, salt: 0.02 }, stopM: 1.5, back: 12 },
  butter: { out: 'butter', rate: 0.5, inp: { milk: 2 }, stopM: 1.3, back: 8 },
  meat_smoked: { out: 'meat_smoked', rate: 0.7, inp: { meat: 0.34 }, fuel: 0.08, stopM: 1.5, back: 12 },
  smokedfish_fish: { out: 'smokedfish_fish', rate: 0.8, inp: { fish: 0.4 }, fuel: 0.08, stopM: 1.5, back: 12 },
  meat_salted: { out: 'meat_salted', rate: 0.6, inp: { meat: 0.34, salt: 0.2 }, stopM: 1.5, back: 14 },
  saltfish_fish: { out: 'saltfish_fish', rate: 0.7, inp: { fish: 0.4, salt: 0.2 }, stopM: 1.5, back: 14 },
  salt: { out: 'salt', rate: 1.2, inp: {}, fuel: 0.12, stopM: 1.4, back: 24 },
};
function stOf(b, hh) { return b.ws?.st?.[hh.id] || {}; }
function pickDairy(sim, p, b, hh) {
  const st = stOf(b, hh), sid = p.s;
  if (!avail(sim, sid, st, 'milk', 1.5)) return null;
  const salty = avail(sim, sid, st, 'salt', 0.05);
  if (salty && under(sim, sid, 'cheese', 1.5)) return V.cheese;
  if (under(sim, sid, 'butter', 1.3)) return V.butter;
  return salty ? V.cheese : null;
}
function pickSmoke(sim, p, b, hh) {
  const st = stOf(b, hh), sid = p.s;
  const opts = [];
  if (((st.meat || 0) >= 0.3 || surplus(sim, sid, 'meat', 1.0)) && under(sim, sid, 'meat_smoked', 1.5)) opts.push(V.meat_smoked);
  if (((st.fish || 0) >= 0.3 || surplus(sim, sid, 'fish', 1.0)) && under(sim, sid, 'smokedfish_fish', 1.5)) opts.push(V.smokedfish_fish);
  if (!opts.length) return null;
  return opts[Math.floor((sim.S.t / 180) % opts.length)];
}
function pickSalt(sim, p, b, hh) {
  const st = stOf(b, hh), sid = p.s;
  if (!avail(sim, sid, st, 'salt', 0.2)) return null;
  const opts = [];
  if (((st.meat || 0) >= 0.3 || surplus(sim, sid, 'meat', 1.0)) && under(sim, sid, 'meat_salted', 1.5)) opts.push(V.meat_salted);
  if (((st.fish || 0) >= 0.3 || surplus(sim, sid, 'fish', 1.0)) && under(sim, sid, 'saltfish_fish', 1.5)) opts.push(V.saltfish_fish);
  if (!opts.length) return null;
  return opts[Math.floor((sim.S.t / 180) % opts.length)];
}
const dishDefs = {};
for (const [d, D] of Object.entries(DISHES)) dishDefs[d] = { out: d, rate: 3.5, inp: D.inp, back: 4 };
function pickDish(type) {
  return (sim, p, b, hh) => {
    const st = stOf(b, hh), sid = p.s;
    const pop = popOf(sim, sid);
    const md = type === 'foodstall' && isMarketDay(sim, sid) ? 1.6 : 1;
    const back = Math.round(clampN(pop / 35, 2, 6) * md);   // 料理は傷みが早いので、町の人の数に合わせて少しずつ
    const list = Object.keys(DISHES).filter((d) => DISHES[d].at === type);
    // いちばん少ない料理から、材料が手に入るものを作る
    list.sort((a, c) => (st[a] || 0) - (st[c] || 0));
    for (const d of list) {
      if ((st[d] || 0) >= back) continue;
      const R = dishDefs[d];
      if (!Object.entries(R.inp).every(([g, n]) => spare(sim, sid, st, g, n * 2))) continue;
      R.back = back;
      return R;
    }
    return null;
  };
}
const PROD = {
  cheesemaker: { out: 'cheese', rate: 0.35, inp: {}, alt: pickDairy },
  smoker: { out: 'meat_smoked', rate: 0.7, inp: {}, alt: pickSmoke },
  salter: { out: 'meat_salted', rate: 0.6, inp: {}, alt: pickSalt },
  saltmaker: { ...V.salt },
  stallkeeper: { out: 'meat_skewer', rate: 2.2, inp: {}, alt: pickDish('foodstall') },
  chef: { out: 'stew_meat', rate: 2.2, inp: {}, alt: pickDish('eatery') },
};
const keepAll = (list) => Object.fromEntries(list.map((g) => [g, 999]));
const stallDishes = Object.keys(DISHES).filter((d) => DISHES[d].at === 'foodstall');
const eateryDishes = Object.keys(DISHES).filter((d) => DISHES[d].at === 'eatery');
const inpsOf = (list) => [...new Set(list.flatMap((d) => Object.keys(DISHES[d].inp)))];
const WP_NEW = {
  dairy: { label: '乳酪小屋', jobs: ['cheesemaker'], io: { inp: ['milk', 'salt'], out: ['cheese', 'butter'] }, sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す'] },
  smokehouse: { label: '燻製小屋', jobs: ['smoker'], io: { inp: ['meat', 'fish', 'wood'], out: ['meat_smoked', 'smokedfish_fish'] }, sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す'] },
  saltery: { label: '塩蔵所', jobs: ['salter'], io: { inp: ['meat', 'fish', 'salt'], out: ['meat_salted', 'saltfish_fish'] }, sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す'] },
  saltworks: { label: '塩焼き小屋', jobs: ['saltmaker'], io: { inp: ['wood'], out: ['salt'] }, sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す（乳酪小屋・塩蔵所が買う）'] },
  foodstall: { label: '屋台', jobs: ['stallkeeper'], keep: keepAll(stallDishes), io: { inp: inpsOf(stallDishes), out: stallDishes }, sells: ['屋台で客に出す（串焼き・焼き魚・パイ）'] },
  eatery: { label: '料理屋', jobs: ['chef'], keep: keepAll(eateryDishes), io: { inp: inpsOf(eateryDishes), out: eateryDishes }, sells: ['店の中で客に出す（煮込み・麦粥）'] },
};
for (const [type, wp] of Object.entries(WP_NEW)) {
  const job = wp.jobs[0];
  wsRegister(type, wp, { [job]: PROD[job] }, { cheese: 12, butter: 8, meat_smoked: 10, smokedfish_fish: 10, meat_salted: 10, saltfish_fish: 10, salt: 16 });
  SHOP_JOBS[type] = wp.jobs.slice();
}

// ================================================================ 状態
function FS(sim) {
  const S = sim.S;
  if (!S.fs) S.fs = { v: 1, day: null, hist: [], stats: { dine: 0, dineMoney: 0, built: 0, hired: 0 } };
  const F = S.fs;
  F.hist = F.hist || []; F.stats = F.stats || { dine: 0, dineMoney: 0, built: 0, hired: 0 };
  if (!F.day || F.day.d !== sim.today) F.day = { d: sim.today, dine: 0, money: 0, by: {}, no: 0 };
  return F;
}

// ================================================================ どの町に何を置くか
const eligible = (sim, s) => s && !s.tribe && !s.tribal && sim.S.towns?.[s.id];
function coastal(sim, s) {
  const w = sim.S.world, r = (s.r || 4) + 6;
  let n = 0;
  for (let z = s.z - r; z <= s.z + r; z += 1) for (let x = s.x - r; x <= s.x + r; x += 1) {
    if (x < 0 || z < 0 || x >= W || z >= H) continue;
    const t = w.tiles[z * W + x];
    if (t === T.SEA || t === T.DEEP) n++;
  }
  return n >= 6;
}
function wants(sim, s, pop) {
  const cap = s.type === 'capital', port = s.type === 'port', town = s.grade === 'town', hamlet = s.frontier && s.grade !== 'town';
  if (hamlet && pop < 30) return [];
  const sea = coastal(sim, s);
  const herd = !!s.ranch || sim.living().some((p) => p.s === s.id && (p.job === 'shepherd' || p.job === 'rancher'));
  const out = [];
  // 町の大きさに合わせて（小さな村に店を並べすぎない）
  if (cap || ((town || herd) && pop >= 20)) out.push('dairy');
  if (cap || pop >= 40) out.push('smokehouse');
  if (cap || port || (sea && pop >= 40)) out.push('saltery');
  if (sea && (cap || port || pop >= 30)) out.push('saltworks');
  if (cap || pop >= 45 || (port && pop >= 25)) out.push('foodstall');
  if (cap || (port && pop >= 30) || pop >= 70) out.push('eatery');
  return out;
}
const SIZE = { dairy: [3, 2], smokehouse: [2, 2], saltery: [2, 2], saltworks: [3, 2], foodstall: [2, 1], eatery: [3, 2] };
const NAMES = {
  dairy: ['乳酪小屋', '牛乳とチーズの小屋'], smokehouse: ['燻製小屋', '煙の小屋'], saltery: ['塩蔵所', '樽漬けの蔵'], saltworks: ['塩焼き小屋', '浜の塩焼き場'],
  foodstall: ['串焼きの屋台', '広場の屋台', 'パイと焼き魚の屋台'], eatery: ['煮売り屋「鍋と匙」', '料理屋「木の匙亭」', '食堂「三つの鍋」', '煮売り屋「湯気の窓」'],
};
function streetsOf(sim, s, type, r1, R) {
  const w = sim.S.world, out = [];
  const central = type === 'foodstall' || type === 'eatery';
  const far = type === 'smokehouse' || type === 'saltery' || type === 'dairy';
  for (let z = s.z - r1; z <= s.z + r1; z++) for (let x = s.x - r1; x <= s.x + r1; x++) {
    if (x < 1 || z < 1 || x >= W - 1 || z >= H - 1) continue;
    const t = w.tiles[z * W + x];
    if (t !== T.ROAD && t !== T.PLAZA) continue;
    const d = Math.abs(x - s.x) + Math.abs(z - s.z);
    let key = central ? d - (t === T.PLAZA ? 4 : 0) : far ? -d : d;
    if (type === 'saltworks') {
      let best = 99;
      for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue; const tt = w.tiles[zz * W + xx]; if (tt === T.SEA || tt === T.DEEP) best = Math.min(best, Math.abs(dx) + Math.abs(dz)); }
      if (best > 8) continue;
      key = best * 3 + d * 0.2;
    }
    out.push({ x, z, d: key + R.next() * 2 });
  }
  return out.sort((a, b) => a.d - b.d);
}
function place(sim, s, type, R, runtime) {
  const w = sim.S.world;
  const [bw, bd] = SIZE[type];
  const name = R.pick(NAMES[type]);
  const RR = (s.r || 4) + (s.extraR || 0) + (s.type === 'capital' ? 1 : 0);
  let b = null;
  for (const [ww, dd] of [[bw, bd], [Math.max(1, bw - 1), bd], [2, 1]]) {
    if (b) break;
    b = tryPlace(w, { x: s.x, z: s.z, r: RR, id: s.id, kingdom: s.kingdom }, streetsOf(sim, s, type, RR, R), type, name, ww, dd, { extra: { fs: true } }, R);
    for (let k = 1; !b && k <= 4; k++) b = tryPlace(w, { x: s.x, z: s.z, r: RR + k * 3, id: s.id, kingdom: s.kingdom }, streetsOf(sim, s, type, RR + k * 3, R), type, name, ww, dd, { extra: { fs: true }, land: [T.GRASS, T.SAVANNA, T.FOREST, T.DESERT, T.SNOW, T.BEACH, T.DENSE, T.JUNGLE] }, R);
  }
  if (!b) return null;
  if (s.kingdom == null) b.kingdom = null;
  s.buildings.push(b.id);
  if (type === 'foodstall') b.owner = 't' + s.id;   // 屋台は町の持ち物：場所代は町の蓄えへ（shops.js の借り賃の仕組み）
  if (runtime) sim.events.push({ type: 'building', id: b.id });
  FS(sim).stats.built++;
  return b;
}

// ================================================================ 働き手
// 回してよい仕事（町にこの人数より多くいるときだけ）。食べ物を作る人（農夫・漁師・狩人・牧場主・採集）は回さない：町の食べ物が減るので
const SPARE = { laundress: 1, roadworker: 1, peddler: 1, sailor: 2, beggar: 0, wanderer: 0, woodcutter: 2, messenger: 1, actor: 1, troupe: 1, bard: 0, musician: 0,
  hermit: 2, vguard: 2, miner: 4, soldier: 3, archer: 1, warrior: 1, maid: 1, servant: 1, gardener: 0, coachman: 0, ferryman: 1, pioneer: 1, weaver: 1, militia: 1 };
const PREF = { cheesemaker: ['maid', 'servant'], smoker: ['woodcutter', 'pioneer'], salter: ['sailor', 'ferryman'], saltmaker: ['sailor', 'ferryman'], stallkeeper: ['peddler', 'beggar'], chef: ['servant', 'maid'] };
const OK_RANK = new Set(['commoner', 'citizen', 'homeless', 'wanderer']);
function staffTown(sim, s, maxHire, busyHh) {
  const S = sim.S;
  let hired = 0;
  const locals = sim.living().filter((p) => p.s === s.id);
  const count = {};
  for (const p of locals) count[p.job] = (count[p.job] || 0) + 1;
  // 客に料理を出す店から先に（塩は乳酪と塩漬けの元なので次に）
  const ORDER = ['eatery', 'foodstall', 'saltworks', 'saltery', 'smokehouse', 'dairy'];
  const list = s.buildings.map((id) => sim.building(id)).filter((b) => b && FS_TYPES.has(b.type)).sort((a, c) => ORDER.indexOf(a.type) - ORDER.indexOf(c.type));
  for (const b of list) {
    const job = JOB_OF[b.type];
    // すでに店主がいる、または町に同じ仕事の人がいて店を持っていれば足りている
    if ((count[job] || 0) >= 1) continue;
    if (hired >= maxHire) break;
    const pref = PREF[job] || [];
    const cands = locals.filter((p) => {
      const a = sim.ageOf(p);
      if (a < 17 || a > 62 || p.jail != null || S.wanted?.[p.id] || !OK_RANK.has(p.rank) || p.mission || p.party != null || p.quest != null) return false;
      const h = sim.hh(p); if (!h || h.bandits || h.royal || busyHh.has(h.id)) return false;
      if (!p.job) return true;
      const keep = SPARE[p.job];
      return keep != null && (count[p.job] || 0) > keep;
    });
    if (!cands.length) continue;
    cands.sort((a, c) => (pref.includes(c.job) ? 1 : 0) - (pref.includes(a.job) ? 1 : 0) || (count[c.job] || 0) - (count[a.job] || 0) || a.id - c.id);
    const p = cands[0];
    const old = p.job;
    count[old] = (count[old] || 1) - 1;
    p.job = job; count[job] = 1;
    if (p.rank === 'homeless' || p.rank === 'wanderer' || JOBS[job].rank === 'citizen') p.rank = JOBS[job].rank;
    p.skill = p.skill || {}; p.skill[job] = Math.max(p.skill[job] || 0, 0.35);
    if (p.memories) sim.remember(p, `${JOBS[old]?.name || '無職'}をやめて、${b.name}の${JOBS[job].name}になった`, { emo: 0.5, imp: 0.7, k: 'job' });
    if (p.action && p.action.type === 'work') p.action = null;
    busyHh.add(sim.hh(p).id);
    hired++;
    FS(sim).stats.hired++;
  }
  return hired;
}
function busyHouseholds(sim) {
  const set = new Set();
  for (const b of sim.S.world.buildings) if (b?.shop?.tenant != null) set.add(b.shop.tenant);
  return set;
}

// ================================================================ はじめに・毎日
export function ensureFoodshop(sim, fresh = false) {
  const S = sim.S;
  const F = FS(sim);
  if (!F.placed) {
    // 置き場所は町ごとに決まった乱数で（世界の乱数を使わない：ほかの仕組みの流れを変えない）
    const R = makeRng(((S.seed || 1) ^ 0x5f00d5) >>> 0);
    const pop = {};
    for (const p of sim.living()) pop[p.s] = (pop[p.s] || 0) + 1;
    for (const s of S.world.settlements) {
      if (!eligible(sim, s)) continue;
      const have = new Set(s.buildings.map((id) => sim.building(id)?.type));
      for (const type of wants(sim, s, pop[s.id] || 0)) if (!have.has(type)) place(sim, s, type, R, false);   // 読み込みの途中なので描画の知らせは出さない（buildings.js と同じ）
    }
    F.placed = true;
  }
  const busy = busyHouseholds(sim);
  for (const s of S.world.settlements) if (eligible(sim, s)) staffTown(sim, s, 99, busy);
  if (!fresh) ensureShops(sim);   // 古いセーブ：店の持ち主と借り手（新しい世界は seedMarkets が決める）
  wsInvalidate();
}
export function foodshopDaily(sim) {
  const y = sim.S.fs?.day;   // 昨日の外食の記録（FS は日が替わると新しい日にするので、先に取っておく）
  const F = FS(sim);
  const busy = busyHouseholds(sim);
  for (const s of sim.S.world.settlements) if (eligible(sim, s)) staffTown(sim, s, 1, busy);
  // 昨日の外食の記録
  F.hist.push({ d: y?.d ?? sim.today - 1, dine: y?.dine || 0, money: Math.round((y?.money || 0) * 10) / 10, by: y?.by || {}, no: y?.no || 0, ask: y?.ask || 0 });
  if (F.hist.length > 30) F.hist.shift();
  F.day = { d: sim.today, dine: 0, money: 0, by: {}, no: 0 };
}

// ================================================================ 外食（needs.js）
function price(sim, sid, d) {
  const m = sim.S.towns[sid];
  let c = 0;
  for (const [g, n] of Object.entries(DISHES[d].inp)) c += n * (m?.price?.[g] ?? gd(g)?.base ?? 2);
  return Math.max(2, Math.round((c * 1.4 + 1) * 2) / 2);   // 材料の値の4割増しと手間賃1銅貨（半銅貨きざみ）
}
// 町の外食の店（料理ができているもの）
function openShops(sim, sid) {
  const out = [];
  const s = sim.town(sid); if (!s) return out;
  for (const id of s.buildings) {
    const b = sim.building(id);
    if (!b || (b.type !== 'foodstall' && b.type !== 'eatery') || b.shop?.tenant == null) continue;
    const st = b.ws?.st?.[b.shop.tenant]; if (!st) continue;
    let best = null;
    for (const d of Object.keys(DISHES)) if (DISHES[d].at === b.type && (st[d] || 0) >= 2 && (!best || st[d] > st[best])) best = d;   // 1皿だけでは売り切れているかもしれない
    if (best) out.push({ b, d: best });
  }
  return out;
}
const mealTimeAt = (h) => (h >= 6 && h < 8.5) || (h >= 11.5 && h < 13.5) || (h >= 18 && h < 20);
export function dineCands(sim, p, cands) {
  const n = p.needs;
  if (!n || n.hunger >= 58 || p.jail != null || p.mission || p.party != null || p.quest != null || p.pilgrim || p.fight) return;
  const age = sim.ageOf(p); if (age < 9) return;
  const h = sim.hour(); if (h < 7 || h >= 21) return;
  const s = sim.town(p.s); if (!s) return;
  if (Math.abs(p.pos.x - s.x) > (s.r || 4) + 8 || Math.abs(p.pos.z - s.z) > (s.r || 4) + 8) return;   // 旅先は needs.js の旅の食事
  if (cands.some((c) => c.type === 'flee' && c.score > 8)) return;
  const shops = openShops(sim, p.s); if (!shops.length) return;
  const hh = sim.hh(p); if (!hh) return;
  const money = spendable(sim, p);
  const pick = shops.length > 1 ? shops[Math.floor(sim.rng.next() * shops.length)] : shops[0];
  const b = pick.b;
  const cost = price(sim, p.s, pick.d);
  const own = b.shop.tenant === hh.id;
  if (!own && money < cost + 2) return;
  const eat = cands.find((c) => c.type === 'eat' || (c.type === 'shop' && c.food));
  let sc = eat ? eat.score - sim.rng.range(0, 1.2) : (100 - n.hunger) / 14 + (mealTimeAt(h) ? 2.5 : 0);
  // 財布と相談：余裕があるほど、貧しいほど選ばない。家に食べ物がなければ選びやすい
  const ratio = own ? 10 : money / cost;
  sc += ratio >= 12 ? 0.6 : ratio >= 6 ? 0.1 : ratio >= 3 ? -0.8 : -1.8;
  sc += (p.pers?.E || 0.5) * 0.9 - (p.pers?.C || 0.5) * 0.5;
  if (hh.food < 1 && !(hh.stock && Object.keys(hh.stock).length)) sc += 1.2;
  if (hh.house == null) sc += 0.8;   // 台所のない暮らし
  if (b.type === 'foodstall' && isMarketDay(sim, p.s)) sc += 0.7;
  if (age < 16) sc -= 0.8;
  sc -= 0.4;
  FS(sim).day.ask = (FS(sim).day.ask || 0) + 1;
  cands.push({ score: sc + sim.rng.range(0, 1.2), type: 'dine', place: { x: b.door.x, z: b.door.z, bld: b.id }, dur: 40, fs: b.id });
}
// 売り切れ：市場へ食べ物を買いに行く（ふだんの買い物と同じ）
function soldOut(sim, p, b) {
  if (p.memories && sim.rng.chance(0.15)) sim.remember(p, `${b.name}へ食べに行ったが、売り切れていた`, { emo: -0.2, imp: 0.2, k: 'food' });
  const hh = sim.hh(p);
  if (hh && hh.money >= sim.price('bread', p.s) && sim.marketHasFood(p.s)) sim.startAction(p, { type: 'shop', place: sim.placeFor(p, 'market'), dur: 20, food: true });
}
export function dineArrive(sim, p, a) {
  const S = sim.S, F = FS(sim);
  const b = sim.building(a.fs ?? a.bld);   // startAction は place.bld を a.bld に写す
  a.until = S.t + 2;
  if (!b?.shop || b.shop.tenant == null || !p.needs) return;
  const kh = S.households[b.shop.tenant], st = b.ws?.st?.[b.shop.tenant];
  if (!kh || !st) return;
  const list = Object.keys(DISHES).filter((d) => DISHES[d].at === b.type && (st[d] || 0) >= 1);
  if (!list.length) { F.day.no++; soldOut(sim, p, b); return; }
  const d = list[Math.floor(sim.rng.next() * list.length)];
  const hh = sim.hh(p);
  const own = hh && hh.id === kh.id;
  const cost = own ? 0 : price(sim, p.s, d);
  if (!own && spendable(sim, p) < cost) { F.day.no++; return; }
  const got = wsTake(sim, kh, d, 1, own ? '家族' : '外食の客', cost);   // 職場の蔵から1皿（売れた記録）
  if (got < 1 - 1e-6) { F.day.no++; return; }
  if (!own) {
    pay(sim, p, cost); kh.money += cost;   // 客の財布（足りなければ家計） → 屋台・料理屋の主の家計
    const who = JOBS[b.type === 'eatery' ? 'chef' : 'stallkeeper'].name;
    flow(sim, '外食の客', who, cost, goodName(d));
    income(sim, b.type === 'eatery' ? 'chef' : 'stallkeeper', cost);
  }
  const fill = dishFill(d);
  p.needs.hunger = Math.min(100, p.needs.hunger + fill);
  p.needs.pleasure = Math.min(100, (p.needs.pleasure || 0) + 4);
  meal(sim, b.type === 'eatery' ? 'eatery' : 'stall', fill / 30);
  a.until = S.t + 25; a.dish = d;
  p.fsDish = d;
  F.day.dine++; F.day.money += cost; F.day.by[b.type] = (F.day.by[b.type] || 0) + 1;
  F.stats.dine++; F.stats.dineMoney += cost;
  if (p.memories && sim.rng.chance(0.12)) {
    const keeper = kh.members.map((id) => S.people[id]).find((q) => alive(q) && q.job === JOB_OF[b.type]);
    sim.remember(p, `${b.name}で${goodName(d)}を${own ? '食べた' : `${cost}銅貨で食べた`}${keeper ? `（${keeper.given}の店）` : ''}`, { emo: 0.3, imp: 0.25, k: 'food', about: keeper ? [keeper.id] : undefined });
  }
}
export const DINE_LABEL = { dine: '屋台・料理屋で食事をしている' };
export const DINE_GO = { dine: '屋台・料理屋へ食べに行くところ' };
export const DINE_PREF = { dine: '外食' };

// ================================================================ 試験用
export function fsSummary(sim) {
  const out = { shops: {}, made: {}, sold: {}, dine: FS(sim).day.dine, hist: FS(sim).hist.slice(-1)[0] || null };
  for (const b of sim.S.world.buildings) {
    if (!b || !FS_TYPES.has(b.type)) continue;
    out.shops[b.type] = (out.shops[b.type] || 0) + (b.shop?.tenant != null ? 1 : 0);
    for (const L of [b.ws?.prev, b.ws?.log]) {
      if (!L) continue;
      for (const [g, n] of Object.entries(L.made || {})) out.made[g] = (out.made[g] || 0) + n;
      for (const x of Object.values(L.sold || {})) out.sold[x.g] = (out.sold[x.g] || 0) + x.n;
    }
  }
  return out;
}
export { shopOfHh };
