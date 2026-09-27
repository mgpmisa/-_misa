// 暮らしの手間と生活リズム：水くみ・洗濯・家事の分担・食べ物が傷む・保存食・朝型/夜型・昼寝
// 本体（sim.js）からは次の関数を呼ぶだけで動く。状態はすべて遅延初期化なので古いセーブでも動く。
//   choreOptions(sim, p, add)   … decide の中で行動候補を足す
//   sleepPlan(sim, p, h, age)   … decide の睡眠の時間帯（朝型・夜型）を決める
//   choreArrive(sim, p, a)      … arrive で到着したときの処理
//   choreDo(sim, p, dt)         … doAction で行動中の処理（井戸端会議もここ）
//   choreHourly(sim)            … newHour で1時間ごとの処理（水を使う・保存食を出す・口論）
//   choreDaily(sim)             … newDay で1日ごとの処理（分担決め・洗濯物・傷み）
import { clamp } from './rng.js';
import { restDayFor } from './labor.js';
import { JOBS, GOODS, KINGDOMS } from './data.js';
import { T, tileAt, walkable } from './world.js';

export const CHORE_TYPES = ['water', 'laundry', 'nap', 'preserve', 'cook', 'childcare', 'help'];

// ui.js にそのまま足せるラベル
export const CHORE_LABEL = {
  water: '水を汲んでいる', laundry: '洗濯をしている', nap: '昼寝をしている', preserve: '冬に備えて保存食を作っている',
  cook: '食事の支度をしている', childcare: '幼い子の世話をしている', help: '親の仕事を手伝っている',
};
export const CHORE_GO = {
  water: '水くみに向かっている', laundry: '洗濯物を抱えて向かっている', nap: '昼寝をしに家へ帰るところ', preserve: '保存食づくりに家へ向かっている',
  cook: '食事の支度に家へ向かっている', childcare: '子どものいる家へ帰るところ', help: '親の仕事場へついて行くところ',
};
export const CHORE_PREF = {
  water: '水くみ', laundry: '洗濯', nap: '昼寝', preserve: '保存食づくり', cook: '料理', childcare: '子守り', help: '家の手伝い',
};

const WATER_PER_DAY = 3;          // 1家族が1日に使う水
const MAX_WATER = 10, MAX_LAUNDRY = 10;
// 季節ごとの傷みやすさ（春・夏・秋・冬）：家の食糧・保存食・市場
const HOME_SPOIL = [0.035, 0.07, 0.035, 0.012];
const MARKET_SPOIL = { bread: [0.03, 0.05, 0.03, 0.015], fish: [0.04, 0.07, 0.04, 0.015], meat: [0.03, 0.06, 0.03, 0.01] };
const PRESERVED_SPOIL = 0.003;
const NIGHT_JOBS = { innkeeper: 1.5, bard: 1.5, thief: 1.8, jailer: 0.5 };
const EARLY_JOBS = { farmer: -0.5, rancher: -0.6, fisher: -0.8, priest: -0.5, servant: -0.5 };

// ---------- 遅延初期化 ----------
export function ensureHh(hh) {
  if (hh._ch) return hh;
  if (hh.water == null) hh.water = 6;
  if (hh.laundry == null) hh.laundry = 2;
  if (hh.preserved == null) hh.preserved = 0;
  if (!hh.chores) hh.chores = { cook: null, water: null, laundry: null, childcare: null };
  if (!hh.choreLoad) hh.choreLoad = {};
  Object.defineProperty(hh, '_ch', { value: true, enumerable: false }); // 保存されない印
  return hh;
}
const doesChores = (hh) => hh && hh.house != null && !hh.wander && !hh.bandits && !hh.royal; // 王家は召使いが家事をする

function hash01(n) {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13;
  return (x % 10007) / 10007;
}

// ---------- 生活リズム ----------
// p.chrono：本人の生まれつきの傾向（-1＝朝型 〜 +1＝夜型）。chronoOf は年齢・職業込みの実際のずれ（-2〜+2時間）。
export function chronoOf(sim, p, age = sim.ageOf(p)) {
  if (p.chrono == null) p.chrono = Math.round((hash01(p.id) * 2 - 1) * 100) / 100;
  let c = p.chrono;
  if (age >= 60) c -= 1.1; else if (age >= 50) c -= 0.5; else if (age >= 15 && age <= 25) c += 0.8;
  c += (NIGHT_JOBS[p.job] || 0) + (EARLY_JOBS[p.job] || 0);
  if (p.job === 'baker') c = -2;
  return clamp(c, -2, 2);
}

// decide の睡眠の時間帯。bedtime（いま寝る時間か）と untilHour（起きる時刻）と bias（点数補正）を返す。
export function sleepPlan(sim, p, h, age = sim.ageOf(p)) {
  if (age < 13) return { bedtime: h >= 20 || h < 6.5, untilHour: 6.5, bias: 0, shift: 0 };
  const shift = chronoOf(sim, p, age);
  let start = (p.sleepType === 'short' ? 23.5 : p.sleepType === 'long' ? 20.5 : 21.5) + shift;
  const end = (p.sleepType === 'short' ? 4.5 : p.sleepType === 'long' ? 7.5 : 5.8) + shift;
  let bedtime;
  if (start >= 24) { start -= 24; bedtime = h >= start && h < end; } else bedtime = h >= start || h < end;
  // 朝、もう十分眠れているなら起きる（doAction の wakeEarly と同じ条件。寝る→すぐ起きるの繰り返しを防ぐ）
  if (bedtime && p.needs.sleep >= 98 && h > 4 && h < 12) bedtime = false;
  // 寝る時刻を過ぎて間もないうちは眠気がまだ弱い（夜型ほど粘る）
  let bias = 0;
  if (bedtime) {
    const since = ((h - start) + 24) % 24;
    if (since < 1) bias = -0.8 * Math.max(0, shift);
  }
  return { bedtime, untilHour: end + (1 - p.pers.C) * 1.2, bias, shift };
}

// ---------- 場所 ----------
function wellSpot(sim, p) {
  const s = sim.townOf(p);
  sim._chWell = sim._chWell || new Map();
  let spot = sim._chWell.get(s.id);
  if (spot === undefined) {
    const b = sim.townBuilding(s, 'well');
    if (b) spot = { x: b.door.x, z: b.door.z, well: true };
    else {
      // 井戸のない町：いちばん近い川辺（海水は飲めないので川だけ）。それもなければ広場の水場
      const w = sim.S.world, R = s.r + 12;
      let bd = 1e9;
      spot = null;
      for (let z = s.z - R; z <= s.z + R; z++) for (let x = s.x - R; x <= s.x + R; x++) {
        const t = tileAt(w, x, z);
        if (!walkable(t) || t === T.BLD || t === T.RIVER || t === T.WALL) continue;
        if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b2]) => tileAt(w, x + a, z + b2) === T.RIVER)) continue;
        const d = Math.hypot(x - s.x, z - s.z);
        if (d > s.r + 5) continue;   // 町の外の遠い川までは汲みに行かない（王都から37マス先の川へ通い、獣に出会って立ち往生していた）。なければ広場の水場
        if (d < bd) { bd = d; spot = { x, z, well: false, river: true }; }
      }
      if (!spot) spot = { x: s.x, z: s.z, well: false, plaza: true };
    }
    sim._chWell.set(s.id, spot);
  }
  // 井戸のまわりに少し散らばる
  const near = spot.plaza ? sim.placeFor(p, 'plaza') : sim.randomNear(spot.x, spot.z, 1.5);
  return near ? { x: near.x, z: near.z, well: spot.well } : { x: spot.x, z: spot.z, well: spot.well };
}

function busyOf(sim, q, age) {
  if (age < 14) return age >= 6 && age < 14 ? 0.5 : 0; // 学校
  if (age >= 68 || !q.job) return 0;
  if (['king', 'royal', 'noble'].includes(q.job)) return 0.3;
  return 1;
}
function familyDoing(sim, hh, type, except) {
  for (const id of hh.members) {
    if (id === except) continue;
    const q = sim.S.people[id];
    if (q && q.action && q.action.type === type) return true;
  }
  return false;
}

// ---------- 行動候補（decide から呼ぶ） ----------
export function choreOptions(sim, p, add) {
  const hh = sim.hh(p);
  const h = sim.hour(), age = sim.ageOf(p), n = p.needs, si = sim.seasonIdx(), R = sim.rng;
  const rest = restDayFor(sim, p);
  const chores = doesChores(hh) ? ensureHh(hh).chores : null;
  const workHour = h >= 7 && h < 17 && p.job && age >= 14 && age <= 67 && p.workedToday < 9 * 60;

  // 昼寝：夏の昼（12〜14時）。怠けたい人・南の国の人
  if (si === 1 && h >= 12 && h < 14 && age >= 4) {
    const south = KINGDOMS[sim.townOf(p).kingdom]?.south;
    const lazy = (100 - n.sloth) / 16 + (100 - n.sleep) / 30 - p.pers.C * 1.5;
    const sc = (south ? 4.5 : 0) + lazy + (rest ? 1 : 0);
    if (sc > 2.5 && hh.house != null) add(sc, 'nap', sim.placeFor(p, 'home'), R.int(40, 90));
  }

  // パン職人は夜明け前から窯に火を入れる
  if (p.job === 'baker' && age >= 14 && age <= 67 && h >= 4 && h < 7 && p.workedToday < 3 * 60 && !rest) {
    add(6 + p.pers.C * 2, 'work', sim.placeFor(p, 'bakery'), R.int(60, 120));
  }

  // 子どもが親の仕事場について行く（7〜13歳、学校のない時間）
  if (age >= 7 && age < 14 && h >= 13 && h < 17 && n.sleep > 25) {
    for (const pid of [p.fatherId, p.motherId]) {
      const par = sim.S.people[pid];
      const a = par && par.deathYear == null && par.action;
      if (!a || a.type !== 'work' || a.phase !== 'do' || !par.job || JOBS[par.job]?.combat || par.s !== p.s) continue;
      add(2.5 + p.pers.C * 2 + (p.q.help || 0), 'help', { x: a.tx, z: a.tz, bld: a.bld ?? null }, R.int(60, 120), { friend: par.id });
      break;
    }
  }

  if (!chores) return;
  const mine = (k) => chores[k] === p.id;

  // 水くみ
  if (age >= 10 && h >= 6 && h < 19.5 && hh.water < 5 && !familyDoing(sim, hh, 'water', p.id)) {
    const urgent = hh.water < 1.5;
    let sc = mine('water') ? 3 + (5 - hh.water) * 0.7 + p.pers.C : urgent ? 3 + (1.5 - hh.water) * 2 : -99;
    if (workHour && !mine('water')) sc -= 1.5;
    if (sc > -50) { const sp = wellSpot(sim, p); if (sp) add(sc + (urgent ? 2.5 : 0), 'water', sp, R.int(15, 25)); }
  }
  // 洗濯：雨や雪でない日（晴れならなおよい）、井戸端・川辺で
  const dryDay = sim.S.weather === 'sunny' || sim.S.weather === 'cloudy';
  if (age >= 12 && dryDay && h >= 7 && h < 16 && hh.laundry >= 4 && !familyDoing(sim, hh, 'laundry', p.id)) {
    let sc = mine('laundry') ? 3 + (hh.laundry - 4) * 0.6 + p.pers.C + (sim.S.weather === 'sunny' ? 1 : 0) : hh.laundry >= 8 ? 2.5 : -99;
    if (sc > -50) { const sp = wellSpot(sim, p); if (sp) add(sc, 'laundry', sp, R.int(40, 70)); }
  }
  // 食事の支度（夕方）
  if (mine('cook') && h >= 16.5 && h < 18 && hh.food >= 1 && hh.cookedDay !== sim.today) {
    add(3.5 + p.pers.C * 1.5, 'cook', sim.placeFor(p, 'home'), R.int(30, 50));
  }
  // 幼い子の世話
  if (mine('childcare') && h >= 8 && h < 18) {
    const kid = hh.members.some((id) => { const q = sim.S.people[id]; return q && sim.ageOf(q) < 4 && !q.inside; });
    add(2 + p.pers.A * 1.5 + (kid ? 2 : 0), 'childcare', sim.placeFor(p, 'home'), R.int(40, 90));
  }
  // 秋の保存食づくり（燻製・塩漬け）
  if (si === 2 && age >= 14 && h >= 9 && h < 17 && !familyDoing(sim, hh, 'preserve', p.id)) {
    const cap = hh.members.length * 10;
    const surplus = hh.food - hh.members.length * 2;
    const canBuy = hh.money > 60 + sim.price('fish', p.s) * 2;
    if (hh.preserved < cap && (surplus >= 2 || canBuy)) {
      add(2 + p.pers.C * 2 + (1 - hh.preserved / cap) * 1.5 + (mine('cook') ? 1 : 0) - (workHour ? 1.5 : 0), 'preserve', sim.placeFor(p, 'home'), R.int(60, 100));
    }
  }
}

// ---------- 到着（arrive から呼ぶ） ----------
export function choreArrive(sim, p, a) {
  const hh = sim.hh(p);
  switch (a.type) {
    case 'water': {
      if (!doesChores(hh)) return;
      ensureHh(hh);
      const age = sim.ageOf(p);
      hh.water = Math.min(MAX_WATER, hh.water + (age < 14 ? 4 : 6));
      p.needs.sloth = Math.max(0, p.needs.sloth - 4);
      break;
    }
    case 'laundry': {
      if (!doesChores(hh)) return;
      ensureHh(hh);
      hh.laundry = Math.max(0, hh.laundry - 8);
      break;
    }
    case 'cook': {
      if (!doesChores(hh)) return;
      hh.cookedDay = sim.today;
      break;
    }
    case 'preserve': {
      if (!doesChores(hh)) return;
      ensureHh(hh);
      const cap = hh.members.length * 10;
      let made = 0;
      const surplus = hh.food - hh.members.length * 2;
      if (surplus > 0) { const amt = Math.min(surplus, 4 + (p.pers.C * 2)); hh.food -= amt; made += amt * 0.9; }
      // 市場で魚や肉を少し買い足して漬ける（在庫が十分あるときだけ）
      const m = sim.market(p.s);
      for (const g of ['fish', 'meat']) {
        if (hh.preserved + made >= cap || hh.money < 60 + m.price[g]) break;
        if (m.stock[g] < GOODS[g].target * 1.2) continue;
        if (sim.buy(p, g, 1)) made += GOODS[g].meals * 0.85;
      }
      hh.preserved = Math.min(cap, hh.preserved + made);
      if (made > 0 && sim.rng.chance(0.15)) sim.remember(p, sim.rng.pick(['冬に備えて魚を燻製にした', '冬に備えて肉を塩漬けにした', '家族で保存食をこしらえた']), { emo: 0.2, imp: 0.2, k: 'chore' });
      break;
    }
    case 'nap': case 'childcare': case 'help': break;
  }
}

// ---------- 行動中（doAction から呼ぶ） ----------
export function choreDo(sim, p, dt) {
  const a = p.action, n = p.needs, hr = dt / 60;
  if (!a) return;
  switch (a.type) {
    case 'nap': n.sleep += 12 * hr; n.sloth += 14 * hr; break;
    case 'water': case 'laundry': {
      n.sloth -= 3 * hr;
      if (a.type === 'laundry') n.pleasure += 2 * hr;
      // 井戸端会議：同じ場所にいる隣人と話しやすい
      if (!p.talk && p.cooldown <= 0 && sim.rng.chance(0.05 * dt)) {
        for (const q of sim.living()) {
          if (q === p || q.talk || q.fight || q.cooldown > 0 || q.s !== p.s || !q.action || q.inside) continue;
          if (q.action.type !== 'water' && q.action.type !== 'laundry') continue;
          if (Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.z - p.pos.z) > 4) continue;
          if (p.talkedToday[q.id] && sim.rng.chance(0.7)) continue;
          sim.startTalk(p, q);
          break;
        }
      }
      break;
    }
    case 'cook': n.esteem += 2 * hr; break;
    case 'childcare': {
      n.esteem += 1.5 * hr;
      const hh = sim.hh(p);
      for (const id of hh.members) {
        const q = sim.S.people[id];
        if (q && q !== p && sim.ageOf(q) < 6 && q.inside === p.inside) { q.needs.pleasure = Math.min(100, q.needs.pleasure + 10 * hr); q.needs.survival = Math.min(100, q.needs.survival + 5 * hr); }
      }
      break;
    }
    case 'preserve': n.esteem += 1 * hr; break;
    case 'help': {
      const par = sim.S.people[a.friend];
      if (!par || par.deathYear != null || !par.job || par.action?.type !== 'work') { a.until = sim.S.t; break; }
      const k = par.job, sk = p.skill[k] || 0;
      if (sk < 0.3) p.skill[k] = sk + 0.004 * hr * (0.5 + p.pers.O) * (0.3 - sk) / 0.3;
      n.esteem += 2 * hr; n.pleasure += 1 * hr;
      if (sim.rng.chance(0.0006 * dt)) sim.remember(p, `${par.given}の仕事を手伝って、${JOBS[k].name}の手ほどきを受けた`, { emo: 0.4, imp: 0.35, about: [par.id], k: 'chore' });
      break;
    }
  }
}

// ---------- 1時間ごと（newHour から呼ぶ） ----------
export function choreHourly(sim) {
  const S = sim.S, h = Math.floor(sim.hour());
  const awake = h >= 6 && h < 22;
  for (const hh of Object.values(S.households)) {
    if (!doesChores(hh)) continue;
    ensureHh(hh);
    if (awake) hh.water = Math.max(0, hh.water - WATER_PER_DAY / 16 * clamp(hh.members.length / 3, 0.5, 1.6));
    // 家の食糧が尽きそうなら保存食を少しずつ出す
    const want = hh.members.length * 2;
    if (hh.preserved > 0 && hh.food < want) {
      const take = Math.min(hh.preserved, want - hh.food, 2);
      hh.preserved -= take; hh.food += take;
    }
    const dry = hh.water <= 0, dirty = hh.laundry >= 9;
    if ((dry || dirty) && awake) {
      for (const id of hh.members) {
        const q = S.people[id];
        if (!q || q.deathYear != null) continue;
        if (dry) q.needs.pleasure = Math.max(0, q.needs.pleasure - 1.5);
        if (dirty && sim.ageOf(q) >= 12) q.needs.esteem = Math.max(0, q.needs.esteem - 1);
      }
    }
    // 家事の偏りが続く夫婦は、家にいるときに口論になることがある
    if (hh.grudge && awake && sim.rng.chance(0.06)) {
      const a = S.people[hh.grudge.a], b = S.people[hh.grudge.b];
      if (a && b && a.deathYear == null && b.deathYear == null && a.inside != null && a.inside === b.inside && !a.talk && !b.talk) {
        sim.remember(a, `家事の分担のことで${b.given}と口論になった`, { emo: -0.6, imp: 0.55, about: [b.id], k: 'quarrel' });
        sim.remember(b, `家事の分担のことで${a.given}に責められた`, { emo: -0.5, imp: 0.5, about: [a.id], k: 'quarrel' });
        sim.relMut(a, b).a = clamp(sim.rel(a, b).a - 4, -100, 100);
        sim.relMut(b, a).a = clamp(sim.rel(b, a).a - 3, -100, 100);
        if (sim.isWatched(a)) sim.pushLog(`${a.given}と${b.given}が家事の分担のことで言い争っている。`, 'talk', [a.id, b.id], a.pos);
        hh.grudge = null;
      }
    }
  }
}

// ---------- 1日ごと（newDay から呼ぶ） ----------
export function choreDaily(sim) {
  const S = sim.S, si = sim.seasonIdx();
  // 市場の生鮮品が傷む（目安量の6割より下は減らさない）
  for (const m of Object.values(S.towns)) {
    for (const [g, rates] of Object.entries(MARKET_SPOIL)) {
      const floor = GOODS[g].target * 0.6;
      if (m.stock[g] > floor) m.stock[g] = Math.max(floor, m.stock[g] * (1 - rates[si]));
    }
  }
  for (const hh of Object.values(S.households)) {
    if (!doesChores(hh)) continue;
    ensureHh(hh);
    const members = hh.members.map((id) => S.people[id]).filter((q) => q && q.deathYear == null);
    if (!members.length) continue;
    // 食べ物が傷む（夏は早く、冬は遅く）。保存食はほとんど傷まない
    const keep = members.length * 2; // 2日分の手持ちはすぐ食べるので傷まない扱い
    if (hh.food > keep) hh.food -= (hh.food - keep) * HOME_SPOIL[si];
    hh.preserved *= 1 - PRESERVED_SPOIL;
    // 洗濯物がたまる
    hh.laundry = Math.min(MAX_LAUNDRY, hh.laundry + 0.8 + members.length * 0.45);
    assignChores(sim, hh, members);
  }
}

// 年齢・仕事の忙しさ・まじめさ（C）で、その日の家事の担当を決める
export function assignChores(sim, hh, members = hh.members.map((id) => sim.S.people[id]).filter((q) => q && q.deathYear == null)) {
  ensureHh(hh);
  const info = members.map((q) => { const age = sim.ageOf(q); return { q, age, busy: busyOf(sim, q, age), n: 0 }; });
  const load = hh.choreLoad;
  const pick = (ok, fit) => {
    let best = null, bs = -1e9;
    for (const x of info) {
      if (!ok(x)) continue;
      const sc = fit(x) - (load[x.q.id] || 0) * 0.35 - x.n * 1.2 + sim.rng.range(0, 0.4);
      if (sc > bs) { bs = sc; best = x; }
    }
    if (best) best.n++;
    return best ? best.q.id : null;
  };
  const adult = (x) => x.age >= 14 && x.age < 80;
  hh.chores.cook = pick(adult, (x) => 2 - x.busy * 1.5 + x.q.pers.C + (x.age >= 60 ? 0.5 : 0));
  hh.chores.water = pick((x) => x.age >= 10 && x.age < 70, (x) => (x.age < 16 ? 2.5 : 0) + 1 - x.busy + x.q.pers.C * 0.5);
  hh.chores.laundry = pick((x) => x.age >= 12 && x.age < 75, (x) => 1.5 - x.busy + x.q.pers.C);
  const baby = info.some((x) => x.age < 4);
  hh.chores.childcare = baby ? pick((x) => x.age >= 12, (x) => 1.5 - x.busy * 1.2 + x.q.pers.A + (x.age >= 55 ? 1 : 0)) : null;
  // 手伝う子は技能の芽が育つ（担当表には乗るが大人の負担にはならない）
  // 負担の記録（仕事を持つ人は、その分も負担とみなす）
  for (const x of info) {
    const today = x.n + (x.age >= 14 ? x.busy * 1.5 : 0);
    load[x.q.id] = (load[x.q.id] || 0) * 0.8 + today;
  }
  for (const id of Object.keys(load)) if (!members.some((q) => String(q.id) === id)) delete load[id];
  // 夫婦の偏り：負担の差が大きい日が続くと、多い側の気持ちが冷える
  const husband = members.find((q) => q.spouseId != null && q.sex === 'm' && members.some((w) => w.id === q.spouseId));
  hh.grudge = null;
  if (husband) {
    const wife = sim.S.people[husband.spouseId];
    const la = load[husband.id] || 0, lb = load[wife.id] || 0;
    const diff = la - lb;
    if (Math.abs(diff) > 4) {
      const [over, under] = diff > 0 ? [husband, wife] : [wife, husband];
      const r = sim.relMut(over, under);
      r.a = clamp(r.a - (Math.abs(diff) - 4) * 0.4 * (1.3 - over.pers.A), -100, 100);
      if (over.pers.A < 0.55 || over.pers.N > 0.6) {
        hh.grudge = { a: over.id, b: under.id };
      }
      if (sim.rng.chance(0.1)) sim.remember(over, `家のことを自分ばかりがしている気がする`, { emo: -0.4, imp: 0.35, about: [under.id], k: 'chore' });
    }
  }
}

// 14歳で見習いになるとき、手伝いで育った技能を引き継ぐための小道具
export function apprenticeSkill(p, base = 0.1) { return Math.max(base, p.skill?.[p.job] || 0); }
