// 地域ごとの天気・気温と自然災害（洪水・日照り・山火事・吹雪・大嵐）
// 大陸を GRID×GRID の地域に分け、地域の地形構成と季節から毎日の天気を決める。
// 状態は S.wx / S.disasters に入る（古いセーブでも ensureWx で遅延初期化）。
import { makeRng, clamp } from './rng.js';
import { T, W, H } from './world.js';
import { DAYS_PER_SEASON, DAYS_PER_YEAR, JOBS } from './data.js';

export const GRID = 4;
const CW = W / GRID, CH = H / GRID;

export const WX_NAME = { sunny: '晴れ', cloudy: 'くもり', fog: '霧', rain: '雨', storm: '嵐', squall: 'スコール', snow: '雪', blizzard: '吹雪', hot: '猛暑', sandstorm: '砂嵐' };
// 旧来の4種（描画・会話・画面表示が前提にしている値）への読み替え
export const WX_LEGACY = { sunny: 'sunny', hot: 'sunny', cloudy: 'cloudy', fog: 'cloudy', sandstorm: 'cloudy', rain: 'rain', storm: 'rain', squall: 'rain', snow: 'snow', blizzard: 'snow' };
// 外の悪さ（0=快適）
const BAD = { sunny: 0, cloudy: 0.1, fog: 0.3, rain: 1, squall: 1.3, snow: 0.8, hot: 0.8, storm: 2.2, sandstorm: 2.2, blizzard: 3 };
// 外仕事の効率
const WORK_MUL = { sunny: 1, cloudy: 1, fog: 0.95, rain: 0.85, squall: 0.75, snow: 0.8, hot: 0.8, storm: 0.5, sandstorm: 0.5, blizzard: 0.3 };
const PRECIP = { rain: 1, squall: 1.3, storm: 2, snow: 0.6, blizzard: 0.8 };
const OUTDOOR_PLACES = new Set(['field', 'ranch', 'forest', 'wild', 'shore', 'dock', 'patrol', 'gate', 'road', 'stable']);
const CLIMATE_NAME = { temperate: '平野', coast: '海沿い', desert: '砂漠', snow: '雪原', jungle: 'ジャングル', mountain: '山地', waste: '魔界', sea: '海' };

// 気候ごと・季節ごと（春夏秋冬）の天気の出やすさ
const TABLE = {
  temperate: [
    { sunny: 4, cloudy: 3, rain: 3, storm: 0.3, fog: 0.6 },
    { sunny: 5, cloudy: 2, rain: 1.5, storm: 0.8, hot: 1 },
    { sunny: 4, cloudy: 3, rain: 2.5, storm: 0.4, fog: 1 },
    { sunny: 3, cloudy: 3, snow: 3, blizzard: 0.3 },
  ],
  coast: [
    { sunny: 3.5, cloudy: 3, rain: 3.5, storm: 0.6, fog: 1.2 },
    { sunny: 5, cloudy: 2, rain: 1.5, storm: 1.2, hot: 0.5 },
    { sunny: 3, cloudy: 3, rain: 3, storm: 1.2, fog: 1.2 },
    { sunny: 2.5, cloudy: 3.5, rain: 1.5, snow: 2, storm: 0.8 },
  ],
  desert: [
    { sunny: 7, hot: 2, cloudy: 1, rain: 0.15, sandstorm: 0.4 },
    { sunny: 5, hot: 6, cloudy: 0.5, rain: 0.05, sandstorm: 0.6 },
    { sunny: 7, hot: 2, cloudy: 1, rain: 0.15, sandstorm: 0.5 },
    { sunny: 6, cloudy: 2, rain: 0.4, sandstorm: 0.3 },
  ],
  snow: [
    { sunny: 3, cloudy: 3, snow: 3, rain: 1 },
    { sunny: 4, cloudy: 3, rain: 2, fog: 0.8 },
    { sunny: 2, cloudy: 3, snow: 3, rain: 1, fog: 0.6 },
    { sunny: 1, cloudy: 2, snow: 4, blizzard: 2.2 },
  ],
  jungle: [
    { sunny: 3, cloudy: 2, squall: 3, rain: 2, fog: 0.8 },
    { sunny: 3, cloudy: 1.5, squall: 5, rain: 1.5, storm: 0.6, hot: 1.5 },
    { sunny: 3, cloudy: 2, squall: 3, rain: 2.5, storm: 0.4 },
    { sunny: 4, cloudy: 3, rain: 2, squall: 1 },
  ],
  mountain: [
    { sunny: 3, cloudy: 3, fog: 1.5, rain: 2, snow: 1 },
    { sunny: 4, cloudy: 3, fog: 1.2, rain: 2, storm: 0.6 },
    { sunny: 3, cloudy: 3, fog: 1.5, rain: 1.5, snow: 1.5 },
    { sunny: 1.5, cloudy: 2, snow: 4, blizzard: 1.2 },
  ],
  waste: [
    { cloudy: 4, fog: 2, sunny: 1, storm: 1 },
    { cloudy: 3, fog: 1, sunny: 2, storm: 1.2, hot: 1 },
    { cloudy: 4, fog: 2, sunny: 1, storm: 1 },
    { cloudy: 4, fog: 2.5, sunny: 1, storm: 0.8 },
  ],
};
TABLE.sea = TABLE.coast;
const SEASON_TEMP = [0, 8, 1, -10];
const WX_TEMP = { sunny: 1.5, hot: 7, cloudy: -1, fog: -1.5, rain: -3, squall: -2, storm: -4, snow: -3, blizzard: -7, sandstorm: 1 };

// ---------- 地域の地形構成（地形はほぼ固定なので world ごとにキャッシュ） ----------
const _geo = new WeakMap();
export function regionGeo(sim) {
  const w = sim.S.world;
  let g = _geo.get(w);
  if (g && g.rev === (sim.S.wx?.tileRev || 0)) return g;
  const regs = [];
  for (let rz = 0; rz < GRID; rz++) for (let rx = 0; rx < GRID; rx++) {
    const c = { land: 0, sea: 0, desert: 0, snow: 0, jungle: 0, forest: 0, rock: 0, waste: 0, river: 0 };
    for (let z = rz * CH; z < (rz + 1) * CH; z++) for (let x = rx * CW; x < (rx + 1) * CW; x++) {
      const t = w.tiles[z * W + x];
      if (t === T.SEA || t === T.DEEP) { c.sea++; continue; }
      c.land++;
      if (t === T.DESERT) c.desert++;
      else if (t === T.SNOW) c.snow++;
      else if (t === T.JUNGLE || t === T.SWAMP) c.jungle++;
      else if (t === T.FOREST || t === T.DENSE) c.forest++;
      else if (t === T.ROCK || t === T.PEAK) c.rock++;
      else if (t === T.WASTE || t === T.LAVA) c.waste++;
      else if (t === T.RIVER) c.river++;
    }
    const L = Math.max(1, c.land), all = CW * CH;
    let climate = 'temperate';
    if (c.land < all * 0.1) climate = 'sea';
    else if (c.waste > L * 0.3) climate = 'waste';
    else if (c.snow > L * 0.25) climate = 'snow';
    else if (c.desert > L * 0.22) climate = 'desert';
    else if (c.jungle > L * 0.22) climate = 'jungle';
    else if (c.rock > L * 0.3) climate = 'mountain';
    else if (c.sea > all * 0.35) climate = 'coast';
    const cz = (rz + 0.5) * CH;
    const base = -2 + 30 * (cz / H) + ({ desert: 6, snow: -6, mountain: -5, jungle: 3, waste: 2 }[climate] || 0);
    const i = rz * GRID + rx;
    regs.push({ i, rx, rz, cx: (rx + 0.5) * CW, cz, climate, base, forest: c.forest + c.jungle, land: c.land, sids: [] });
  }
  for (const s of w.settlements) regs[regionIndex(s.x, s.z)].sids.push(s.id);
  // 川沿いの町（洪水の恐れ）・海沿いの町（大嵐の恐れ）
  const river = {}, coast = {};
  for (const s of w.settlements) {
    const r = s.r + 5;
    let rv = 0, sea = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = s.x + dx, z = s.z + dz;
      if (x < 0 || z < 0 || x >= W || z >= H) continue;
      const t = w.tiles[z * W + x];
      if (t === T.RIVER || t === T.BRIDGE) rv++;
      else if (t === T.SEA || t === T.DEEP) sea++;
    }
    river[s.id] = rv >= 6; coast[s.id] = sea >= 20;
  }
  g = { rev: sim.S.wx?.tileRev || 0, regs, river, coast };
  _geo.set(w, g);
  return g;
}

export function regionIndex(x, z) {
  const rx = clamp(Math.floor(x / CW), 0, GRID - 1), rz = clamp(Math.floor(z / CH), 0, GRID - 1);
  return rz * GRID + rx;
}

// 地域の呼び名（ニュース用）
export function regionName(sim, i) {
  const g = regionGeo(sim), r = g.regs[i], w = sim.S.world;
  if (r.sids.length) {
    const s = r.sids.map((id) => w.settlements[id]).sort((a, b) => (a.type === 'capital' ? -1 : 0) - (b.type === 'capital' ? -1 : 0))[0];
    return `${s.name}のあたり`;
  }
  const ns = r.rz === 0 ? '北' : r.rz === GRID - 1 ? '南' : '';
  const ew = r.rx === 0 ? '西' : r.rx === GRID - 1 ? '東' : '';
  return `${ns}${ew || (ns ? '' : '中央')}の${CLIMATE_NAME[r.climate]}`;
}

// ---------- 状態 ----------
export function ensureWx(sim) {
  const S = sim.S;
  S.disasters = S.disasters || [];
  if (S.wx && S.wx.r && S.wx.r.length === GRID * GRID) return S.wx;
  const g = regionGeo(sim);
  S.wx = {
    v: 1, day: -1, tileRev: 0, fx: {}, burns: [], damaged: [], cool: {}, drought: {},
    r: g.regs.map((r) => ({ w: 'sunny', streak: 1, temp: r.base, wet: 0, dry: 0 })),
  };
  return S.wx;
}

export function weatherAt(sim, x, z) {
  const wx = ensureWx(sim);
  return wx.r[regionIndex(x, z)].w;
}
export function tempAt(sim, x, z) {
  const wx = ensureWx(sim);
  return wx.r[regionIndex(x, z)].temp;
}
const posOf = (sim, p) => (p.pos ? p.pos : sim.townOf(p));
export function weatherOf(sim, p) { const q = posOf(sim, p); return weatherAt(sim, q.x, q.z); }
export function legacyWeatherAt(sim, x, z) { return WX_LEGACY[weatherAt(sim, x, z)] || 'sunny'; }
export function weatherLabel(sim, x, z) {
  const wx = ensureWx(sim), r = wx.r[regionIndex(x, z)];
  return `${WX_NAME[r.w]} ${Math.round(r.temp)}℃`;
}

// 互換：S.weather に「注目地点（カメラ）」または王都アルデン付近の天気を入れる
export function syncLegacyWeather(sim) {
  const S = sim.S, f = sim.focus;
  const cap = S.world.settlements.find((s) => s.type === 'capital') || S.world.settlements[0];
  const x = f ? f.x : cap.x, z = f ? f.z : cap.z;
  const w = weatherAt(sim, x, z);
  S.weather = WX_LEGACY[w] || 'sunny';
  S.wxHere = { w, name: WX_NAME[w], temp: Math.round(tempAt(sim, x, z)) };
}

// ---------- 毎日の天気 ----------
function pickWeather(R, table, prevW) {
  const keys = Object.keys(table);
  return R.weighted(keys, (k) => table[k]) || prevW;
}
function fixByTemp(w, temp) {
  if (temp <= 0.5) { if (w === 'rain' || w === 'squall') return 'snow'; if (w === 'storm') return 'blizzard'; }
  if (temp >= 4) { if (w === 'snow') return 'rain'; if (w === 'blizzard') return 'storm'; }
  if (w === 'hot' && temp < 22) return 'sunny';
  return w;
}

export function weatherDaily(sim) {
  const S = sim.S, wx = ensureWx(sim), g = regionGeo(sim), today = sim.dayIndex;
  if (wx.day === today) return;
  wx.day = today;
  const R = makeRng((S.seed * 31 + today * 7919) >>> 0);
  const si = sim.seasonIdx();
  const doy = sim.dayOfYear() % DAYS_PER_SEASON;
  const prev = wx.r.map((r) => r.w);
  for (const reg of g.regs) {
    const st = wx.r[reg.i];
    const table = TABLE[reg.climate][si];
    let w;
    const keep = 0.55 * Math.pow(0.82, st.streak - 1);
    // 前線は西から東へ流れる：西どなりの昨日の天気が来ることがある
    const west = reg.rx > 0 ? prev[reg.i - 1] : null;
    if (R.chance(keep)) w = st.w;
    else if (west && table[west] && R.chance(0.25)) w = west;
    else w = pickWeather(R, table, st.w);
    // 気温：季節の中で少しずつ移り変わる
    const nextSeasonT = SEASON_TEMP[(si + 1) % 4], blend = doy / DAYS_PER_SEASON * 0.5;
    const seasonT = SEASON_TEMP[si] * (1 - blend) + nextSeasonT * blend;
    const seasonMul = reg.climate === 'desert' ? 0.6 : reg.climate === 'jungle' ? 0.4 : 1;
    let temp = reg.base + seasonT * seasonMul + R.gauss(0, 2);
    w = fixByTemp(w, temp + (WX_TEMP[w] || 0));
    temp += WX_TEMP[w] || 0;
    st.streak = w === st.w ? st.streak + 1 : 1;
    st.w = w;
    st.temp = Math.round(temp * 10) / 10;
    const pr = PRECIP[w] || 0;
    st.wet = Math.max(0, st.wet * 0.8 + pr - (w === 'sunny' || w === 'hot' ? 0.4 : 0));
    st.dry = pr > 0 ? 0 : st.dry + 1;
  }
  disastersDaily(sim, R, g);
  syncLegacyWeather(sim);
}

// 毎時（任意）：注目地点の天気を S.weather に反映し、焼け跡の回復などは日次で
export function weatherHourly(sim) { if (sim.S.wx) syncLegacyWeather(sim); }

// ---------- 暮らしへの影響 ----------
function isOutdoorJob(job) {
  const J = job && JOBS[job];
  return !!(J && OUTDOOR_PLACES.has(J.place));
}
// decide の最初に1回だけ呼び、結果を weatherBias に渡す
export function weatherMood(sim, p) {
  const w = weatherOf(sim, p), q = posOf(sim, p);
  const temp = tempAt(sim, q.x, q.z);
  let bad = BAD[w] ?? 0;
  if (temp < -8) bad += 0.8; else if (temp > 34) bad += 0.6;
  const fx = sim.S.wx?.fx?.[p.s];
  const today = sim.dayIndex;
  return {
    w, temp, bad,
    nice: (w === 'sunny' && temp > 10 && temp < 28) ? 1 : 0,
    outdoorJob: isOutdoorJob(p.job),
    closed: !!(fx && fx.closed >= today),
    drought: !!(sim.S.wx?.drought?.[p.s]),
    disaster: !!(fx && fx.hUntil >= today),
  };
}
// 行動候補ごとの点数補正
export function weatherBias(wm, type) {
  const b = wm.bad;
  switch (type) {
    case 'stroll': case 'plaza': case 'play': case 'storytell': return -b * 1.5 + wm.nice * 0.6;
    case 'court': return -b * 0.8;
    case 'work': return wm.outdoorJob ? -b * 0.8 : 0;
    case 'train': return -b * 0.6;
    case 'travel': case 'trade': return -b * 2 - (wm.closed ? 30 : 0);
    case 'quest': case 'hunt': case 'gather': case 'escort': return -b * 1.2 - (wm.closed ? 6 : 0);
    case 'tavern': return b * 0.8;
    case 'rest': return b * 0.6;
    case 'visit': return b * 0.2;
    case 'pray': return b * 0.3 + (wm.drought ? 2.5 : 0) + (wm.disaster ? 1 : 0);
    default: return 0;
  }
}
// 外仕事の効率（doWork の eff に掛ける）
export function weatherWorkMul(sim, p) {
  if (!isOutdoorJob(p.job)) return 1;
  return WORK_MUL[weatherOf(sim, p)] ?? 1;
}
// 町の収穫倍率（洪水・日照りのあいだ下がる）
export function harvestMul(sim, sid) {
  const wx = sim.S.wx;
  if (!wx) return 1;
  let m = 1;
  const fx = wx.fx[sid];
  if (fx && fx.hUntil >= sim.dayIndex) m *= fx.harvest;
  if (wx.drought[sid]) m *= 0.55;
  return m;
}
// 吹雪で道が閉ざされているか
export function roadsClosed(sim, sid) {
  const fx = sim.S.wx?.fx?.[sid];
  return !!(fx && fx.closed >= sim.dayIndex);
}
// 気分（newHour の mood に足す。-8〜+3 程度）
export function weatherMoodDelta(sim, p) {
  const wm = weatherMood(sim, p);
  let d = wm.nice * 2 - wm.bad * (1 + p.pers.N) * 1.2;
  if (wm.disaster) d -= 4;
  if (wm.drought) d -= 2;
  return clamp(d, -8, 3);
}

// ---------- 自然災害 ----------
function fxOf(wx, sid) { return wx.fx[sid] || (wx.fx[sid] = { harvest: 1, hUntil: -1, closed: -1 }); }
function housesOf(sim, sid) {
  const w = sim.S.world;
  return (w.settlements[sid].buildings || []).map((id) => w.buildings[id]).filter((b) => b && b.type === 'house');
}
function nearTile(w, x, z, r, pred) {
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
    if (pred(w.tiles[zz * W + xx])) return true;
  }
  return false;
}
function householdsInHouses(sim, bids) {
  const set = new Set(bids);
  return Object.values(sim.S.households).filter((h) => h.house != null && set.has(h.house));
}
function damageHouses(sim, R, houses, n, dmg) {
  const wx = sim.S.wx;
  const hit = R.shuffle(houses.slice()).slice(0, n);
  for (const b of hit) {
    b.dmg = clamp((b.dmg || 0) + dmg, 0, 1);
    if (!wx.damaged.includes(b.id)) wx.damaged.push(b.id);
  }
  for (const hh of householdsInHouses(sim, hit.map((b) => b.id))) {
    hh.comfort = Math.max(0, (hh.comfort || 0) - 1);
    hh.food = Math.max(0, (hh.food || 0) * 0.6);
  }
  return hit;
}
// 国庫から復興費を出す
function relief(sim, d, houses) {
  const S = sim.S;
  let paid = 0;
  const hhs = householdsInHouses(sim, houses.map((b) => b.id));
  for (const sid of d.sids) {
    const s = S.world.settlements[sid], k = S.kingdoms[s.kingdom];
    if (!k || S.towns[sid]?.occupied) continue;
    const want = d.cost / d.sids.length;
    const pay = Math.round(Math.min(want, Math.max(0, k.treasury) * 0.25));
    if (pay <= 0) continue;
    k.treasury -= pay; paid += pay;
    const mine = hhs.filter((h) => h.s === sid);
    const each = mine.length ? pay * 0.6 / mine.length : 0;
    for (const h of mine) h.money += each;
    S.towns[sid].fund += pay - each * mine.length;
  }
  d.paid = paid;
  if (paid > 0) for (const b of houses) b.repairFund = true;
  return paid;
}
function tellTown(sim, sids, txt, emo, imp, victims = new Set(), vtxt = txt) {
  for (const p of sim.living()) {
    if (!sids.includes(p.s) || sim.ageOf(p) < 6) continue;
    const v = victims.has(p.hh);
    sim.remember(p, v ? vtxt : txt, { emo: v ? emo - 0.3 : emo, imp: v ? imp + 0.2 : imp, k: 'disaster' });
  }
}
function record(sim, d) {
  const S = sim.S;
  d.id = (S.disasters.length ? S.disasters[S.disasters.length - 1].id : 0) + 1;
  d.day = sim.dayIndex; d.y = sim.year();
  S.disasters.push(d);
  if (S.disasters.length > 60) S.disasters.shift();
  return d;
}
function cooled(wx, key, days, today) {
  if ((wx.cool[key] ?? -999) > today) return false;
  wx.cool[key] = today + days;
  return true;
}

function disastersDaily(sim, R, g) {
  const S = sim.S, wx = S.wx, today = sim.dayIndex, si = sim.seasonIdx(), w = S.world;
  // 復旧：傷んだ家は少しずつ直る（復興費が出ていれば早い）
  wx.damaged = wx.damaged.filter((id) => {
    const b = w.buildings[id];
    if (!b || !b.dmg) return false;
    b.dmg = Math.max(0, b.dmg - (b.repairFund ? 0.08 : 0.03));
    if (b.dmg <= 0) { delete b.dmg; delete b.repairFund; return false; }
    return true;
  });
  // 焼け跡は数年で森に戻る
  if (wx.burns.length) {
    const back = [];
    wx.burns = wx.burns.filter((q) => {
      if (q.back > today) return true;
      if (w.tiles[q.i] === T.GRASS) { w.tiles[q.i] = q.t; back.push(q.i); }
      return false;
    });
    if (back.length) {
      wx.tileRev++;
      sim.events.push({ type: 'tiles', list: back });
    }
  }
  // 日照りの終わり
  for (const sid of Object.keys(wx.drought)) {
    const s = w.settlements[sid], st = wx.r[regionIndex(s.x, s.z)];
    if (st.wet > 0.8) {
      const d = S.disasters.find((q) => q.id === wx.drought[sid]);
      delete wx.drought[sid];
      if (d && !d.end) {
        d.end = today;
        sim.news(`${s.name}に恵みの雨。長い日照りがようやく終わった`, 1, { x: s.x, z: s.z });
        tellTown(sim, [+sid], '長い日照りのあと、ようやく雨が降った。みんなで空を見上げて喜んだ', 0.7, 0.6);
      }
    }
  }

  for (const reg of g.regs) {
    const st = wx.r[reg.i];
    const sids = reg.sids.filter((id) => !S.towns[id]?.occupied);
    // 洪水：長雨で川があふれる
    if (st.wet >= 3.2 && (PRECIP[st.w] || 0) >= 1) {
      const hit = sids.filter((id) => g.river[id]);
      if (hit.length && R.chance(0.3) && cooled(wx, 'flood' + reg.i, 20, today)) flood(sim, R, reg, hit);
    }
    // 日照り
    if (si < 3 && st.dry >= 9 && !['desert', 'waste', 'sea'].includes(reg.climate)) {
      const hit = sids.filter((id) => !wx.drought[id]);
      if (hit.length && R.chance(0.3) && cooled(wx, 'drought' + reg.i, 25, today)) drought(sim, R, reg, hit);
    }
    // 山火事：乾いた夏・秋の森
    if ((si === 1 || si === 2) && st.dry >= 4 && (st.w === 'sunny' || st.w === 'hot') && reg.forest > 40) {
      if (R.chance(st.w === 'hot' ? 0.12 : 0.05) && cooled(wx, 'fire' + reg.i, 30, today)) wildfire(sim, R, reg);
    }
    // 吹雪で道が閉ざされる
    if (st.w === 'blizzard' && st.streak >= 2 && sids.length && R.chance(0.6) && cooled(wx, 'snow' + reg.i, 8, today)) snowbound(sim, R, reg, sids);
    // 大嵐（海沿いの町）
    if (st.w === 'storm') {
      const hit = sids.filter((id) => g.coast[id]);
      if (hit.length && R.chance(0.12) && cooled(wx, 'storm' + reg.i, 20, today)) gale(sim, R, reg, hit);
    }
  }
}

function flood(sim, R, reg, sids) {
  const S = sim.S, w = S.world, today = sim.dayIndex;
  const houses = [];
  for (const sid of sids) {
    const riverside = housesOf(sim, sid).filter((b) => nearTile(w, b.door.x, b.door.z, 4, (t) => t === T.RIVER));
    houses.push(...damageHouses(sim, R, riverside, R.int(2, 6), R.range(0.3, 0.7)));
    const fx = fxOf(S.wx, sid);
    fx.harvest = Math.min(fx.harvest, 0.6); fx.hUntil = Math.max(fx.hUntil, today + R.int(6, 10));
    const m = S.towns[sid];
    if (m?.stock) m.stock.wheat = (m.stock.wheat || 0) * 0.7;
  }
  const names = sids.map((id) => w.settlements[id].name).join('と');
  const s0 = w.settlements[sids[0]];
  const d = record(sim, { kind: 'flood', name: '洪水', region: reg.i, sids, x: s0.x, z: s0.z, houses: houses.length, cost: 60 + houses.length * 30 });
  const paid = relief(sim, d, houses);
  d.text = `長雨で川があふれ、${names}の畑と${houses.length}軒の家が水に浸かった`;
  sim.news(`${d.text}${paid ? `。国庫から復興費${paid}Gが出た` : ''}`, 2, { x: s0.x, z: s0.z });
  sim.chron(`${names}で大水。川があふれ、畑と家々が水に浸かった`, s0.kingdom);
  const vict = new Set(householdsInHouses(sim, houses.map((b) => b.id)).map((h) => h.id));
  tellTown(sim, sids, `長雨で川があふれ、${names}が水浸しになった`, -0.5, 0.6, vict, '川があふれて家が水に浸かり、家財も蓄えも流された');
}

function drought(sim, R, reg, sids) {
  const S = sim.S, w = S.world, today = sim.dayIndex;
  const s0 = w.settlements[sids[0]];
  const names = sids.map((id) => w.settlements[id].name).join('と');
  const d = record(sim, { kind: 'drought', name: '日照り', region: reg.i, sids, x: s0.x, z: s0.z, houses: 0, cost: 50 * sids.length });
  for (const sid of sids) {
    S.wx.drought[sid] = d.id;
    const s = w.settlements[sid];
    if (!S.towns[sid].occupied) {
      const from = today * 1440 + 9 * 60;
      S.gatherings.push({ type: 'pray', place: 'church', from, to: from + 120, s: sid, label: '雨乞いの祈り' });
    }
    // 蓄えから麦を放出
    const m = S.towns[sid];
    if (m?.stock) m.stock.wheat = (m.stock.wheat || 0) + 10;
    void s;
  }
  const paid = relief(sim, d, []);
  d.text = `雨が降らない日が続き、${names}の畑が干上がり始めた`;
  sim.news(`${d.text}。教会で雨乞いの祈りが捧げられる${paid ? `（国庫から${paid}Gの救済）` : ''}`, 2, { x: s0.x, z: s0.z });
  sim.chron(`${names}を日照りが襲った`, s0.kingdom);
  tellTown(sim, sids, '雨が何日も降らず、畑の麦がしおれていくのを見た', -0.5, 0.55);
}

function wildfire(sim, R, reg) {
  const S = sim.S, w = S.world, today = sim.dayIndex;
  const isWood = (t) => t === T.FOREST || t === T.DENSE || t === T.JUNGLE;
  let start = -1;
  for (let k = 0; k < 60 && start < 0; k++) {
    const x = R.int(reg.rx * CW, (reg.rx + 1) * CW - 1), z = R.int(reg.rz * CH, (reg.rz + 1) * CH - 1);
    if (isWood(w.tiles[z * W + x])) start = z * W + x;
  }
  if (start < 0) return;
  const size = R.int(20, 80), burned = [], seen = new Set([start]), queue = [start];
  while (queue.length && burned.length < size) {
    const i = queue.splice(R.int(0, queue.length - 1), 1)[0];
    const t = w.tiles[i];
    if (!isWood(t)) continue;
    w.tiles[i] = T.GRASS;
    burned.push(i);
    S.wx.burns.push({ i, t, back: today + R.int(2 * DAYS_PER_YEAR, 4 * DAYS_PER_YEAR) });
    const x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
      const j = zz * W + xx;
      if (!seen.has(j) && isWood(w.tiles[j])) { seen.add(j); queue.push(j); }
    }
  }
  if (!burned.length) return;
  S.wx.tileRev++;
  sim.events.push({ type: 'tiles', list: burned });
  const cx = burned.reduce((a, i) => a + (i % W), 0) / burned.length, cz = burned.reduce((a, i) => a + ((i / W) | 0), 0) / burned.length;
  const near = w.settlements.filter((s) => Math.hypot(s.x - cx, s.z - cz) < s.r + 10 && !S.towns[s.id]?.occupied).map((s) => s.id);
  let houses = [];
  for (const sid of near) {
    const s = w.settlements[sid];
    if (Math.hypot(s.x - cx, s.z - cz) < s.r + 5) houses.push(...damageHouses(sim, R, housesOf(sim, sid), R.int(1, 3), R.range(0.3, 0.8)));
  }
  const place = sim.placeName(Math.round(cx), Math.round(cz));
  const d = record(sim, { kind: 'fire', name: '山火事', region: reg.i, sids: near, x: cx, z: cz, tiles: burned.length, houses: houses.length, cost: near.length ? 40 + houses.length * 35 : 0 });
  const paid = near.length ? relief(sim, d, houses) : 0;
  d.text = `乾いた森に火がつき、${place}の森が${burned.length}区画焼けた`;
  sim.news(`${d.text}${houses.length ? `。${houses.length}軒の家に火が移った` : ''}${paid ? `（国庫から${paid}G）` : ''}`, near.length ? 2 : 1, { x: cx, z: cz });
  sim.chron(`${place}で大きな山火事`, near.length ? w.settlements[near[0]].kingdom : undefined);
  if (near.length) {
    const vict = new Set(householdsInHouses(sim, houses.map((b) => b.id)).map((h) => h.id));
    tellTown(sim, near, `${place}の森が燃え、空が赤く染まるのを見た`, -0.5, 0.6, vict, '山火事の火が家に燃え移り、必死で水をかけた');
  }
}

function snowbound(sim, R, reg, sids) {
  const S = sim.S, w = S.world, today = sim.dayIndex;
  for (const sid of sids) { const fx = fxOf(S.wx, sid); fx.closed = Math.max(fx.closed, today + R.int(1, 3)); }
  const s0 = w.settlements[sids[0]];
  const names = sids.map((id) => w.settlements[id].name).join('と');
  const d = record(sim, { kind: 'blizzard', name: '大雪', region: reg.i, sids, x: s0.x, z: s0.z, houses: 0, cost: 20 * sids.length });
  const paid = relief(sim, d, []);
  d.text = `吹雪が何日も続き、${names}へ通じる道が雪に閉ざされた`;
  sim.news(`${d.text}${paid ? `。国庫から除雪の費用${paid}Gが出た` : ''}`, 1, { x: s0.x, z: s0.z });
  sim.chron(`${names}が大雪で孤立した`, s0.kingdom);
  tellTown(sim, sids, '吹雪で道が閉ざされ、何日も家にこもって過ごした', -0.3, 0.45);
}

function gale(sim, R, reg, sids) {
  const S = sim.S, w = S.world, today = sim.dayIndex;
  const houses = [];
  for (const sid of sids) {
    houses.push(...damageHouses(sim, R, housesOf(sim, sid), R.int(1, 4), R.range(0.2, 0.5)));
    const fx = fxOf(S.wx, sid);
    fx.closed = Math.max(fx.closed, today);
    const m = S.towns[sid];
    if (m?.stock) m.stock.fish = (m.stock.fish || 0) * 0.6;
  }
  const s0 = w.settlements[sids[0]];
  const names = sids.map((id) => w.settlements[id].name).join('と');
  const d = record(sim, { kind: 'storm', name: '大嵐', region: reg.i, sids, x: s0.x, z: s0.z, houses: houses.length, cost: 40 + houses.length * 25 });
  const paid = relief(sim, d, houses);
  d.text = `海から大嵐が吹きつけ、${names}で${houses.length}軒の屋根が飛ばされた`;
  sim.news(`${d.text}${paid ? `。国庫から復興費${paid}G` : ''}`, 2, { x: s0.x, z: s0.z });
  sim.chron(`${names}を大嵐が襲った`, s0.kingdom);
  const vict = new Set(householdsInHouses(sim, houses.map((b) => b.id)).map((h) => h.id));
  tellTown(sim, sids, '大嵐の夜、雨戸を押さえて一晩中眠れなかった', -0.4, 0.5, vict, '大嵐で家の屋根が吹き飛ばされた');
}

// ---------- 画面向けの要約 ----------
export function weatherSummary(sim) {
  const wx = ensureWx(sim), g = regionGeo(sim);
  return g.regs.filter((r) => r.sids.length).map((r) => ({ name: regionName(sim, r.i), climate: CLIMATE_NAME[r.climate], w: wx.r[r.i].w, label: WX_NAME[wx.r[r.i].w], temp: Math.round(wx.r[r.i].temp), streak: wx.r[r.i].streak }));
}
