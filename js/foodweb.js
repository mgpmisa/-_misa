// 食物連鎖と繁殖（動物・魔物の担当）
//
// ・繁殖：実在の動物の妊娠期間・1回に生まれる数・年に何回産むか・独り立ち・大人になる年・寿命を、
//   この世界の暦（1年＝40日）に直した表（BREED）で動かす。魔物はファンタジーの通説（BREED_M）。
//   実在の日数 × 40 / 365 がこの世界の日数。生まれる数は、卵をたくさん産む種は「育って巣立つ数」。
// ・満腹度（c.hunger 0〜100）：体の大きさで減る速さが違う（小さい体ほど早くおなかがすく）。
//   おなかがすくと、表どおりに食べ物を探す：草食は草地・木の実の多い所へ移り、肉食は獲物を追う（fauna.js huntByWeb）。
//   満腹の雌だけが身ごもる。飢えが続くと弱って死ぬ（fauna.js feedHour）。釣り合いはここから生まれる。
// ・人の狩り：子ども・子連れの母は狩らない。春（と、ゆっくり増える種の子育ての季節）は禁猟。数の少ない種は狩らない（fauna.js canHunt）。
// ・漁：漁師は川と海の魚の群れ（fauna.js の餌場 fish）からとる。魚が減った漁場では、とる量を控える。
// ・猫は町のネズミを捕る。
// ・beasts.js の上限・下限と fauna.js の移住・間引きは安全弁として残す。
// お金は動かさない（狩った肉・魚の売り買いは、これまでどおり市場の取り引き）。
import { SPECIES, DAYS_PER_YEAR, DAYS_PER_SEASON } from './data.js';
import { W, H, walkable, tileAt, biomeOf, isWater } from './world.js';
import { makeCreature, killCreature, townMask, ranchRoom, herdUnits, stockUnit } from './creatures.js';
import { FOOD_WEB, popTarget, foodAt, eatFrom, ensureAnimal } from './fauna.js';
import { beastsFull, beastsRare } from './beasts.js';
import { BREED, BREED_M } from './breeding.js';
export { BREED, BREED_M };
import { nestsDaily } from './nests.js';
export { nestsDaily, monsterSleeps, nestTileHtml } from './nests.js';   // 巣（nests.js）

const Y = DAYS_PER_YEAR;
const MONOGAMOUS = new Set(['wolf', 'fox', 'eagle', 'owl', 'crow', 'goose', 'penguin', 'seagull', 'parrot']);
const PRED = new Set(['wolf', 'bear', 'fox', 'tiger', 'polarbear', 'croc', 'scorpion', 'eagle', 'snake', 'owl']);   // creatures.js の PREDATOR と同じ
const PESTS = new Set(['rat']);   // 害獣は禁猟にしない
const HOUSE_CAP = { dog: 2, cat: 2, horse: 4, donkey: 3 };   // 家で飼う数（子犬・子猫は、よその家へもらわれていく）

// ---------- 食物連鎖の表を広げる（fauna.js の FOOD_WEB。誰が誰を食べるか） ----------
const MORE_PREY = {
  fox: ['crow', 'goose', 'seagull'],                 // キツネは地上の鳥も襲う
  owl: ['crow'],                                     // ワシミミズクはカラスを襲う
  eagle: ['crow', 'parrot', 'seagull', 'snake', 'frog', 'fox'],
  snake: ['parrot', 'crow', 'bat'],
  croc: ['goose', 'seagull'],
  tiger: ['wolf', 'crow'],
  bear: ['tiger', 'wolf', 'fox'],                    // クマはトラ（子や弱ったもの）も襲う
  polarbear: ['seagull'],   // トナカイは狩らない（下の LESS_PREY）
  cat: ['crow', 'bat'],
  // 魔物
  goblin: ['crow', 'turtle', 'slime'],
  hobgoblin: ['wolf', 'fox'],
  orc: ['wolf', 'goblin', 'tiger'],
  orcking: ['wolf', 'tiger', 'goblin'],
  spider: ['crow', 'parrot', 'goblin', 'snake'],     // 大蜘蛛はゴブリンも糸で捕らえる
  arachne: ['tiger', 'wolf', 'goblin', 'orc'],
  wyvern: ['wolf', 'tiger', 'bear', 'goblin', 'orc', 'polarbear'],
  dragon: ['wolf', 'orc', 'whale'],
  kingslime: ['goblin', 'squirrel'],
  human: ['duck', 'chicken', 'pig', 'sheep', 'cow', 'goat'],   // 家畜は牧場で育てて食べる（狩りではない：canHunt は野生だけに使われる）
};
for (const [sp, add] of Object.entries(MORE_PREY)) {
  const e = FOOD_WEB[sp] || (FOOD_WEB[sp] = { lv: 2, prey: [] });
  e.prey = [...new Set([...(e.prey || []), ...add])];
}
// 実在しない組み合わせを外す：ホッキョクグマは海のアザラシ（ここでは魚とペンギン）を食べ、トナカイはまず狩らない。
// トラは砂漠にいないのでラクダを狩らない（40日試験でトナカイ・ラクダが1年で半分近くまで減り続けたため）
const LESS_PREY = { polarbear: ['reindeer'], tiger: ['camel'] };
for (const [sp, del] of Object.entries(LESS_PREY)) if (FOOD_WEB[sp]?.prey) FOOD_WEB[sp].prey = FOOD_WEB[sp].prey.filter((p) => !del.includes(p));
// 表に段がない種を足す
if (!FOOD_WEB.skeleton) for (const sp of ['skeleton', 'skelknight', 'lich', 'mummy', 'pharaoh', 'golem', 'imp', 'demonsoldier', 'demongeneral', 'demonlord']) FOOD_WEB[sp] = { lv: 4, prey: [], need: 0, none: true };

// ---------- 状態 ----------
function FW(sim) {
  const S = sim.S;
  S.foodweb = S.foodweb || {};
  const F = S.foodweb;
  F.stats = F.stats || {};
  const st = F.stats;
  for (const k of ['births', 'litters', 'conceived', 'monsterBirths', 'catRat', 'closedSkip', 'youngSkip', 'fishSpared', 'seek', 'chased']) st[k] = st[k] || 0;
  st.bornBy = st.bornBy || {};
  return F;
}
const cr = (S, id) => (id != null ? S.creatures[id] : null);
const d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const isLive = (c) => SPECIES[c.sp]?.kind === 'livestock';
const juvKids = (S, c) => (c.young || []).map((id) => S.creatures[id]).filter((k) => k && k.hp > 0 && k.juv);

// ---------- fauna.js から：独り立ちの日数と寿命 ----------
export const matureDays = (sp) => BREED[sp]?.ind;
export const lifeYears = (sp) => BREED[sp]?.life;

// ---------- fauna.js popTarget から：数の目安をピラミッドの形にする ----------
// 上の段ほど少なく（食べる側は、食べられる側よりずっと少ない）。大きな肉食の目安を下げる。
// はじめに放つ数（creatures.js：目安の6割）もこれで減る。
const PYRAMID = { wolf: 0.45, tiger: 0.5, polarbear: 0.5, eagle: 0.5, bear: 0.6, croc: 0.7, fox: 0.8, owl: 0.8, snake: 0.8 };
export const spawnMul = (sp) => PYRAMID[sp] ?? 1;

// ---------- creatures.js から：1時間に減る満腹度 ----------
// ふだん 1（肉食 1.6）。体の小さい種ほど早くおなかがすく（体重あたりの代謝）。育ちざかりの子は少し早い
export function burn(c, def) {
  if (def.diet === 'none') return 0;
  const base = PRED.has(c.sp) ? 1.6 : 1;
  const k = Math.max(0.8, Math.min(1.25, Math.pow((def.size || 0.6) / 0.6, -0.25)));
  return base * k * (c.juv || c.role === 'young' ? 1.1 : 1);
}
// creatures.js の creatureDaily：この種の数は、ここ（繁殖）が受け持つ（湧いて増えない）
// 産む魔物でも、数が下限（はじめの数の6割）以下に減ったときは、これまでどおり巣の奥から湧く（安全弁）
export const ownsRegen = (sp, sim) => !!(BREED[sp] && SPECIES[sp]?.kind === 'wild') || !!BREED_M[sp] && !(sim && beastsRare(sim, sp));

// ---------- 満腹度の見え方（詳細欄） ----------
export function hungerText(c) {
  const h = Math.round(c.hunger ?? 80);
  const w = h >= 80 ? '満腹' : h >= 55 ? 'ふつう' : h >= 30 ? '空腹' : h >= 10 ? 'とても空腹' : '飢えている';
  return `${w}（${h}／100）`;
}
const KIND_NAME = { plant: '草', nuts: '木の実', fish: '魚', insect: '虫', carrion: '死肉' };
export function doingText(sim, c) {
  const S = sim.S, def = SPECIES[c.sp] || {};
  if (def.diet === 'none') return '';
  const d = c.fwDo && S.t < c.fwDo.until ? c.fwDo : null;
  if (c.fight) { const t = sim.entity?.(c.fight.target); return t && typeof t.id !== 'number' && (FOOD_WEB[c.sp]?.prey || []).includes(t.sp) ? `${SPECIES[t.sp].name}を狩っている` : '戦っている'; }
  if (d?.k === 'eat') return `仕留めた${SPECIES[d.sp]?.name || '獲物'}を食べている`;
  if (d?.k === 'graze') return `${KIND_NAME[d.kind] || '草'}を食べている`;
  if (d?.k === 'seek') return `${KIND_NAME[d.kind] || '食べ物'}の多い所を探して移っている`;
  if (d?.k === 'chased') return '畑から追い払われて逃げている';
  if (c.forage) return '飢えて人里の畑や家畜を狙っている';
  if (c.preg && !def.monster) return `身ごもっている（${Math.max(0, Math.ceil(c.preg.due - sim.today))}日ほどで生まれる）`;
  if (isLive(c)) return c.fed ? '飼い主の餌で満ちている' : (c.hunger ?? 80) < 55 ? '牧草や道ばたの草を食べて、飼い主の餌を待っている' : '';
  if ((c.hunger ?? 80) < 45 && (FOOD_WEB[c.sp]?.prey || []).length) return c.goal?.run ? '獲物を追っている' : '獲物を探している';
  if ((c.hunger ?? 80) < 45) return '食べ物を探している';
  return '';
}

// ---------- fauna.js faunaThink から（huntByWeb のあと） ----------
// 仕留めた獲物を食べる・草を食む・食べ物の多い所へ移る・畑から追い払われる
export function think(sim, c, def, all, humans) {
  const S = sim.S, R = sim.rng;
  if (c.hunger == null) c.hunger = 80;
  const d = c.fwDo && S.t < c.fwDo.until ? c.fwDo : null;
  if (!d && c.fwDo) c.fwDo = null;
  if (d?.k === 'eat') { c.goal = null; return true; }
  // 畑を荒らしに来た獣は、近くの人に追い払われる
  if (c.forage && humans?.length && R.chance(0.35)) {
    const q = humans.find((h) => h.hp > 0 && !h.fight && (sim.ageOf(h) >= 14) && Math.hypot(h.pos.x - c.pos.x, h.pos.z - c.pos.z) < 6);
    if (q) {
      const dx = c.pos.x - q.pos.x, dz = c.pos.z - q.pos.z, dd = Math.hypot(dx, dz) || 1;
      c.forage.until = S.t;   // fauna.js forageStart がねぐらへ帰す
      c.goal = { x: c.pos.x + dx / dd * 8, z: c.pos.z + dz / dd * 8, run: true };
      c.fleeUntil = S.t + 20;
      c.fwDo = { k: 'chased', until: S.t + 20 };
      FW(sim).stats.chased++;
      if (R.chance(0.3)) sim.pushLog(`${sim.fullName(q)}が、畑に来た${SPECIES[c.sp].name}を追い払った。`, 'event', [q.id], c.pos);
      return true;
    }
  }
  if (d?.k === 'chased') return true;
  if (isLive(c) || c.forage || c.juv) return false;
  const base = (FOOD_WEB[c.sp]?.base || []).filter((k) => k === 'plant' || k === 'nuts' || k === 'fish');
  if (!base.length || c.hunger >= 45 || (FOOD_WEB[c.sp]?.prey || []).length && c.hunger < 30) return false;   // 肉食は獲物を追う（huntByWeb）
  if (d?.k === 'graze') { c.goal = null; return true; }
  if (d?.k === 'seek') {
    if (Math.hypot(c.pos.x - d.x, c.pos.z - d.z) > 2) { if (!c.goal) c.goal = { x: d.x, z: d.z, path: !def.flies && !def.swims }; return true; }
    c.home = { x: d.x, z: d.z };   // よい餌場に着いた：ここを新しい行動圏にする
    c.fwDo = null;
  }
  if (S.t - (c._fwT ?? -1e9) < 20) return false;   // 探すのは20分に1回（重さ対策）
  c._fwT = S.t;
  const here = foodAt(sim, c.pos.x, c.pos.z);
  const best = (fa) => base.reduce((b, k) => ((fa[k] ?? 0) > b.v ? { k, v: fa[k] ?? 0 } : b), { k: base[0], v: -1 });
  const bh = best(here);
  if (bh.v >= 0.45) { c.fwDo = { k: 'graze', kind: bh.k, until: S.t + R.int(25, 45) }; c.goal = null; return true; }
  // まわりの餌場（16マス先・32マス先）から、いちばん豊かな所へ
  const mask = townMask(sim), wd = S.world;
  let pick = null;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + R.range(-0.3, 0.3), r = R.pick([16, 24, 32]);
    const x = Math.round(c.pos.x + Math.cos(a) * r), z = Math.round(c.pos.z + Math.sin(a) * r);
    if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2 || mask[z * W + x]) continue;
    const t = tileAt(wd, x, z);
    if (def.swims ? !isWater(t) : !def.flies && !walkable(t)) continue;
    if (def.biome && !def.biome.includes(biomeOf(t)) && !(def.biome.includes('snowcoast') && biomeOf(t) === 'snow')) continue;
    const b = best(foodAt(sim, x, z));
    if (b.v > bh.v + 0.25 && (!pick || b.v > pick.v)) pick = { x, z, k: b.k, v: b.v };
  }
  if (!pick) return false;
  c.fwDo = { k: 'seek', kind: pick.k, x: pick.x, z: pick.z, until: S.t + 180 };
  c.goal = { x: pick.x, z: pick.z, path: !def.flies && !def.swims };
  FW(sim).stats.seek++;
  return true;
}

// ---------- creatures.js killCreature から：獣・魔物が獲物を仕留めた ----------
export function onPreyKilled(sim, killer, c) {
  if (!killer || typeof killer.id === 'number') return;
  killer.fwDo = { k: 'eat', sp: c.sp, until: sim.S.t + Math.round(20 + Math.min(60, (SPECIES[c.sp]?.size || 0.5) * 40)) };
  killer.goal = null;
}

// ---------- anim_creatures.js から：食べる・草を食む・探す・追う ----------
export function anim(sim, c, moving) {
  const d = c.fwDo && sim.S.t < c.fwDo.until ? c.fwDo : null;
  if (!d) return null;
  const def = SPECIES[c.sp] || {};
  if (moving) return d.k === 'chased' || d.k === 'seek' && c.goal?.run ? (def.flies && def.shape === 'bird' ? 'fly' : 'run') : null;
  if (d.k === 'eat') return 'eat';
  if (d.k === 'graze') return d.kind === 'plant' && def.diet !== 'meat' ? 'graze' : 'eat';
  return null;
}

// ---------- 人の狩り（sim.js の狩人・fauna.js の罠） ----------
export function closedSeason(sim, sp) {
  if (PESTS.has(sp)) return false;
  const si = sim.seasonIdx(), b = BREED[sp];
  if (si === 0) return true;   // 春は子育ての季節：禁猟
  return !!(b && b.seasons.includes(si) && b.per <= 1);   // ゆっくり増える種は、その子育ての季節も
}
export function huntOk(sim, c) {
  const st = FW(sim).stats;
  if (c.juv || c.role === 'young' || juvKids(sim.S, c).length || c.preg) { st.youngSkip++; return false; }
  if (closedSeason(sim, c.sp)) { st.closedSkip++; return false; }
  return true;
}

// ---------- 漁（sim.js の漁師・船乗り） ----------
// 近くの漁場の魚の群れからとる。群れが3割を切った漁場では、とる量を6割に控える（魚を絶やさない）
export function fish(sim, p, q) {
  if (!(q > 0)) return q;
  const x = p.pos.x, z = p.pos.z;
  let bx = x, bz = z, bv = -1;
  for (const [dx, dz] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
    const v = foodAt(sim, x + dx, z + dz).fish;
    if (v > bv) { bv = v; bx = x + dx; bz = z + dz; }
  }
  if (bv <= 0) return q;   // 近くに漁場の表がない（湖・井戸ばた）：これまでどおり
  let take = q;
  if (bv < 0.6) { take = q * 0.6; FW(sim).stats.fishSpared += q - take; }   // foodAt は「目安の半分」で1。0.6 ＝ 群れが3割
  const got = eatFrom(sim, bx, bz, 'fish', take * FISH_K);
  return Math.min(take, got / FISH_K + take * 0.2);   // 群れを減らせなかった分は、とれない（2割は小川・磯の小魚）
}
const FISH_K = 1.0;

// ---------- 繁殖（fauna.js の breed の代わり） ----------
// 満腹の雌が身ごもり、妊娠期間ののち、生まれる季節に子を産む。やせた母は少なく産む
function eligibleMale(byMale, c, r) {
  for (const m of byMale[c.sp] || []) if (m.hp > 0 && d2(m, c) < r) return m;
  return null;
}
function houseCount(animals, c) { let n = 0; for (const o of animals) if (o.sp === c.sp && o.owner === c.owner && o.keeper === c.keeper && o.hp > 0) n++; return n; }
export function breedAnimals(sim, animals, si) {
  const S = sim.S, R = sim.rng, F = FW(sim), st = F.stats, today = sim.today;
  const count = {}, byMale = {};
  for (const c of animals) {
    if (c.hp <= 0) continue;
    count[c.sp] = (count[c.sp] || 0) + 1;
    if (c.sex === 'm' && !c.juv && c.age >= (BREED[c.sp]?.adult ?? 0)) (byMale[c.sp] = byMale[c.sp] || []).push(c);
  }
  const first = !F.init;
  F.init = 1;
  // 種ごとのはじめの数（安全弁：はじめの数の1.5倍までしか身ごもらない。ふだんは餌と天敵で釣り合う）
  if (!F.base) { F.base = {}; for (const [sp, n] of Object.entries(count)) F.base[sp] = n; }
  const capOf = (sp) => { const b0 = F.base[sp] ?? count[sp] ?? 4; return Math.max(4, Math.min(Math.round((popTarget(sim, sp) || b0 * 2) * 1.3), Math.round(b0 * (sp === 'rat' ? 1.2 : 1.5)), b0 + 30)); };
  const ranchN = {};
  for (const mom of animals) {
    const sp = mom.sp, b = BREED[sp], def = SPECIES[sp];
    if (!b || mom.sex !== 'f' || mom.hp <= 0 || !S.creatures[mom.id]) continue;
    const live = def.kind === 'livestock';
    // 出産
    if (mom.preg) {
      if (today < mom.preg.due) continue;
      const p = mom.preg; mom.preg = null;
      if (!b.seasons.includes(si) && today - p.due < DAYS_PER_SEASON) { mom.preg = { due: today + 1 }; continue; }   // 生まれる季節を待つ
      birth(sim, mom, b, count, animals, ranchN, capOf(sp));
      continue;
    }
    if (mom.juv || mom.age < b.adult || mom.hibernate) continue;
    // はじめての世界：すでに身ごもっている母がいる（前の季節に身ごもった）
    if (first) {
      mom.fwLast = today - R.int(0, Math.ceil(Y / b.per));
      const doy = sim.dayOfYear(), si0 = Math.floor(doy / DAYS_PER_SEASON) % 4;
      if (b.seasons.includes(si0) && b.g >= 2) {
        // いまが生まれる季節：前の季節に身ごもった母の多く（8割）が、この季節のうちに産む
        if (R.chance(0.8 * Math.min(1, b.per))) { mom.preg = { due: Math.ceil(today + R.range(0, DAYS_PER_SEASON - (doy % DAYS_PER_SEASON))) }; st.conceived++; }
      } else {
        const due = today + R.range(0, Math.max(1, b.g));
        if (b.seasons.includes(Math.floor(((doy + due - today) % Y) / DAYS_PER_SEASON)) && R.chance(0.55 * Math.min(1, b.per))) { mom.preg = { due: Math.ceil(due) }; st.conceived++; }
      }
      continue;
    }
    if (today - (mom.fwLast ?? -1e9) < Y / b.per) continue;         // 年に産める回数
    if (juvKids(S, mom).length) continue;                           // 子育て中は身ごもらない
    const due = today + Math.max(1, Math.round(b.g));
    const dueSeason = Math.floor(((sim.dayOfYear() + due - today) % Y) / DAYS_PER_SEASON);
    if (!b.seasons.includes(dueSeason)) continue;                    // 生まれる時期が合わない
    // 相手：一生つがいの種はつがい、ほかは近くの大人の雄。家畜は飼い主が種付けを手配する
    if (!live) {
      if (MONOGAMOUS.has(sp)) { const m = cr(S, mom.mate); if (!m || m.hp <= 0 || d2(m, mom) > 16) continue; }
      else if (!eligibleMale(byMale, mom, 16)) continue;
      if (sp === 'wolf' && mom.rank > 2 && mom._gsize >= 3) continue;   // オオカミは長のつがいだけ
      if ((count[sp] || 0) >= capOf(sp)) continue;                      // 安全弁（fauna.js の間引きは目安の 1.6 倍）
    } else {
      if (mom.owner == null && mom.keeper == null) continue;
      if (mom.range === 0 && mom.owner != null) { const s = sim.town(mom.owner); if (!s?.ranch) continue; }
      else if (HOUSE_CAP[sp] && houseCount(animals, mom) >= HOUSE_CAP[sp]) continue;
      if ((count[sp] || 0) >= capOf(sp)) continue;
    }
    // 満腹度：満ち足りた雌ほど身ごもりやすい。草食は足もとの草も見る
    const h = mom.hunger ?? 60;
    if (h < (live ? 45 : 55)) continue;
    let pr = 0.2 * h / 100;
    if (!live && !PRED.has(sp)) { const fa = foodAt(sim, mom.pos.x, mom.pos.z); const k = (FOOD_WEB[sp]?.base || ['plant']).reduce((m, x) => Math.max(m, fa[x] ?? 0), 0); pr *= Math.max(0.2, Math.min(1.2, k)); }
    if (!R.chance(pr)) continue;
    mom.preg = { due };
    st.conceived++;
  }
}
function birth(sim, mom, b, count, animals, ranchN, cap) {
  const S = sim.S, R = sim.rng, st = FW(sim).stats, def = SPECIES[mom.sp];
  let n = R.int(b.lit[0], b.lit[1]);
  const h = mom.hunger ?? 60;
  if (h < 40) n = Math.max(1, Math.ceil(n * 0.5));   // やせた母は少なく産む
  if (h < 12) n = 0;                                   // 飢えた母は子を失う
  // 牧場・家の広さ
  if (def.kind === 'livestock') {
    if (mom.range === 0 && mom.owner != null) {
      const s = sim.town(mom.owner);
      const herd = animals.filter((c) => c.owner === mom.owner && c.range === 0 && c.sp !== 'dog' && S.creatures[c.id]);
      const room = s?.ranch ? ranchRoom(s) - herdUnits(herd) - (ranchN[mom.owner] || 0) : 0;
      n = Math.min(n, Math.floor(room / Math.max(0.25, stockUnit(mom.sp))), 12 - herd.length);
    } else if (HOUSE_CAP[mom.sp]) n = Math.min(n, HOUSE_CAP[mom.sp] + 1 - houseCount(animals, mom));
  }
  n = Math.min(n, cap - (count[mom.sp] || 0));
  mom.fwLast = sim.today;
  if (n <= 0) return;
  let made = 0;
  for (let i = 0; i < n; i++) {
    const k = makeCreature(sim, mom.sp, mom.pos.x, mom.pos.z, { owner: mom.owner, range: mom.range, hx: mom.home.x, hz: mom.home.z, age: 0 });
    if (!k || !S.creatures[k.id]) continue;
    k.pos = { x: mom.pos.x, z: mom.pos.z };
    if (mom.keeper != null) k.keeper = mom.keeper;
    if (mom.flock) k.flock = mom.flock;
    ensureAnimal(sim, k);   // fauna.js：いちばん近い母（この母）の子になる
    made++;
  }
  if (!made) return;
  count[mom.sp] = (count[mom.sp] || 0) + made;
  if (mom.range === 0 && mom.owner != null) ranchN[mom.owner] = (ranchN[mom.owner] || 0) + made * stockUnit(mom.sp);
  st.births += made; st.litters++;
  st.bornBy[mom.sp] = (st.bornBy[mom.sp] || 0) + made;
  if (mom.nick || R.chance(0.06)) {
    const egg = def.flies || ['goose', 'turtle', 'croc', 'snake', 'frog', 'penguin', 'chicken', 'duck', 'scorpion'].includes(mom.sp);
    sim.pushLog(`${sim.placeName(mom.pos.x, mom.pos.z)}で、${def.name}が${made}${egg ? '羽（匹）の子をかえした' : '頭の子を産んだ'}。`, 'event', [], mom.pos);
  }
}

// ---------- 毎日（sim.js：faunaDaily のあと） ----------
export function foodwebDaily(sim) {
  const S = sim.S, R = sim.rng, F = FW(sim), st = F.stats;
  nestsDaily(sim);   // 巣：新しく独り立ちした獣・生まれた子・住む場所を移した群れ
  const all = Object.values(S.creatures);
  // 町のネズミが絶えたら、荷車や船の荷に紛れて入ってくる
  const nRat = all.filter((c) => c.sp === 'rat' && c.hp > 0).length;
  if (nRat < 4 && R.chance(nRat ? 0.3 : 0.8)) {
    const s = R.pick(S.world.settlements);
    const p = s && sim.randomNear(s.x, s.z, Math.max(2, s.r - 1));
    if (p) for (let i = 0; i < 2; i++) { const k = makeCreature(sim, 'rat', p.x, p.z, { owner: s.id, range: s.r - 1, hx: s.x, hz: s.z, age: 20 }); if (k) k.sex = i ? 'm' : 'f'; }
  }
  breedMonsters(sim, all);
}

// 魔物の繁殖：満腹のつがい（スライムは1匹で分裂）が、表の間隔で子を産む。数は beasts.js の上限まで
function breedMonsters(sim, all) {
  const S = sim.S, R = sim.rng, st = FW(sim).stats, today = sim.today, si = sim.seasonIdx();
  const bySp = {};
  for (const c of all) if (BREED_M[c.sp] && c.hp > 0 && !c.dormant && !c.inDungeon) (bySp[c.sp] = bySp[c.sp] || []).push(c);
  for (const [sp, list] of Object.entries(bySp)) {
    const b = BREED_M[sp];
    for (const mom of list) {
      if (mom.preg) {
        if (today < mom.preg.due) continue;
        mom.preg = null;
        if (beastsFull(sim, sp)) continue;
        const n = R.int(b.lit[0], b.lit[1]) - ((mom.hunger ?? 60) < 40 ? 1 : 0);
        let made = 0;
        for (let i = 0; i < n; i++) {
          if (beastsFull(sim, sp)) break;
          const k = makeCreature(sim, sp, mom.pos.x, mom.pos.z, { hx: mom.home?.x ?? mom.pos.x, hz: mom.home?.z ?? mom.pos.z, range: mom.range || 8, lair: mom.lair, age: 0 });
          if (k && S.creatures[k.id]) made++;
        }
        mom.fwLast = today;
        st.monsterBirths += made;
        st.bornBy[sp] = (st.bornBy[sp] || 0) + made;
        continue;
      }
      if (mom.named || mom.general || mom.raid || mom.role === 'young' || (mom.age || 0) < b.adult) continue;
      if (today - (mom.fwLast ?? (mom.fwLast = today - R.int(0, Math.ceil(Y / b.per)))) < Y / b.per) continue;
      if (!b.seasons.includes(si)) continue;
      const h = mom.band && S.bands?.[mom.band] ? Math.min(mom.hunger ?? 60, S.bands[mom.band].hungry ?? 60) : mom.hunger ?? 60;
      if (h < 55) continue;
      if (sp !== 'slime') {
        if (mom.sex === 'm') continue;
        const mate = cr(S, mom.mate);
        const ok = mate && mate.hp > 0 ? true : mom.sex === 'n' && list.some((o) => o !== mom && o.hp > 0 && d2(o, mom) < 20 && (o.age || 0) >= b.adult);
        if (!ok) continue;
      }
      if (beastsFull(sim, sp) || !R.chance(0.2 * h / 100)) continue;
      mom.preg = { due: today + Math.max(1, Math.round(b.g)) };
    }
  }
}

// 猫（creatures.js のネズミ捕り）は、その町のネズミが残り2匹以下なら追わない（床下の奥に逃げこむ）
export function ratsFew(sim, o) {
  const k = Math.floor(sim.S.t / 30);
  if (sim._fwRatK !== k) { sim._fwRatK = k; sim._fwRat = {}; for (const c of Object.values(sim.S.creatures)) if (c.sp === 'rat' && c.hp > 0) sim._fwRat[c.owner] = (sim._fwRat[c.owner] || 0) + 1; }
  return (sim._fwRat[o.owner] || 0) <= 2;
}
// 集計（試験・詳細画面用）
export function foodwebReport(sim) { return FW(sim).stats; }
// fauna.js canHunt から：数の少ない魔物（beasts.js の下限以下）は、飢えていなければ狩らない
export const rareMonster = (sim, sp) => beastsRare(sim, sp);
