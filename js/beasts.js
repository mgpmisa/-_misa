// 魔物の数と手ごわさの釣り合い（動物・魔物の担当）
//
// 1) 手ごわい魔物（強さ＝攻め×√体力 が 250 以上：ワイバーン・ゴーレム・オークキング・リッチなど）には、
//    1人や弱いパーティでは挑まない。まわりで一緒に戦う人の力の合計が相手の NEED_STRONG 倍に届かなければ退く
//    （combat.js の partyCheck から呼ぶ。冒険者でない狩人・開拓者・自警団も同じ判断をする）。
//    行軍・聖戦・町の守り（march / crusade / defend）の最中は、それぞれの仕組みの判断に任せる。
// 2) 種ごとの数の釣り合い（竜・魔王・魔将・守り神・封印された魔物は数えない）
//    ・はじめの数（世界ができたときの数）を覚え、その 1.6 倍（少なくとも＋3）を「上限」、6割を「下限」とする。
//    ・上限に届いた種は、湧き口・群れの呼び寄せ・繁殖で増えない（beastsFull）。
//    ・上限の 1.25 倍を超えた種は、餌の取り合いで弱い個体から散っていく（毎日、超えた分の2割まで）。
//    ・下限を割った種は、住む土地の奥（町から離れた所）から流れてくる。ギルドと冒険者は、町から離れた所にいる
//      少ない種を狙わない（beastsRare）。
// お金は動かさない（討伐の報酬はこれまでどおり guild.js：国庫・町の蓄え → 討った人）。
import { SPECIES } from './data.js';
import { W, H, walkable, tileAt, biomeOf, isWater } from './world.js';
import { makeCreature, killCreature, townMask, applyStats } from './creatures.js';
import { powerC, crewPower } from './deadly.js';

export const STRONG_POWER = 250;   // これ以上の魔物は「手ごわい」
export const NEED_STRONG = 1.0;    // 手ごわい魔物に挑むには、相手の力と同じだけの仲間の力がいる
const EXEMPT = new Set(['march', 'crusade', 'defend']);
const NOT_COUNTED = new Set(['dragon', 'demonlord', 'demongeneral']);
// monsters.js の keepAlive が受け持つ種（こちらでは下限の補充をしない）
const KEEP_ALIVE = new Set(['goblin', 'orc', 'skeleton', 'mummy', 'spider', 'slime', 'golem', 'wyvern', 'unicorn', 'imp']);
const isHuman = (e) => typeof e?.id === 'number';

function B(sim) {
  const S = sim.S;
  S.beasts = S.beasts || { base: null, stats: { starved: {}, refill: {}, retreat: 0, blocked: {} } };
  const b = S.beasts;
  if (!b.base) {
    b.base = {};
    for (const c of Object.values(S.creatures)) if (counted(c.sp)) b.base[c.sp] = (b.base[c.sp] || 0) + 1;
  }
  return b;
}
export function counted(sp) {
  const d = SPECIES[sp];
  return !!(d && d.monster && !d.boss && !d.guardian && !d.sealed && !NOT_COUNTED.has(sp));
}
function counts(sim) {
  const key = sim.S.t + ':' + sim.S.nextCid;   // 生まれるたびに数え直す
  if (sim._bzT === key && sim._bzC) return sim._bzC;
  const n = {};
  for (const c of Object.values(sim.S.creatures)) if (c.hp > 0) n[c.sp] = (n[c.sp] || 0) + 1;
  sim._bzT = key; sim._bzC = n;
  return n;
}
const demonFree = (sim, sp) => SPECIES[sp]?.kind === 'demon' && !!sim.S.demon?.active;   // 魔王の軍勢が動くあいだは数えない
export function beastsCap(sim, sp) { const b = B(sim).base[sp] || 0; return Math.max(3, Math.round(b * 1.6), b + 3); }
export function beastsFloorOf(sim, sp) { const b = B(sim).base[sp] || 0; return b >= 2 ? Math.max(2, Math.ceil(b * 0.6)) : b; }
// 上限に届いていて、もう増やさない
export function beastsFull(sim, sp) {
  if (!counted(sp) || demonFree(sim, sp)) return false;
  const full = (counts(sim)[sp] || 0) >= beastsCap(sim, sp);
  if (full) { const st = B(sim).stats; st.blocked[sp] = (st.blocked[sp] || 0) + 1; }
  return full;
}
// 数が少ない（下限以下）
export function beastsRare(sim, sp) { return counted(sp) && (counts(sim)[sp] || 0) <= beastsFloorOf(sim, sp); }
// monsters.js keepAlive の最低数：広さから出した数と、はじめの数から出した下限の小さいほう
export function beastsFloor(sim, sp, scaled) { const f = beastsFloorOf(sim, sp); return Math.max(1, Math.min(scaled, f || scaled)); }
// 町から離れた所にいる少ない種は、狙わない
export function beastsSpare(sim, c, s) {
  if (!c || !beastsRare(sim, c.sp)) return false;
  return !s || Math.hypot(c.pos.x - s.x, c.pos.z - s.z) > (s.r || 0) + 8;
}

// ---------- 手ごわい魔物 ----------
export const maxPower = (c) => (c.atk || 5) * Math.sqrt(Math.max(1, c.maxhp || c.hp || 20));
export function strongBeast(c) {
  if (!c || isHuman(c) || c.hp <= 0) return false;
  const d = SPECIES[c.sp];
  return !!(d && d.monster && maxPower(c) >= STRONG_POWER);
}
// この人がいま戦っている相手が手ごわい魔物で、自分で判断してよい立場か
export function beastsStrongFoe(sim, e) {
  if (!isHuman(e) || !e.fight || EXEMPT.has(e.action?.type)) return false;
  return strongBeast(sim.entity(e.fight.target));
}
// 一緒に戦っている人（自分と、8マス以内で魔物と戦っている人）
export function beastsCrew(sim, e) {
  const out = [e];
  for (const q of sim.living()) {
    if (q === e || !q.fight || q.hp <= 0 || q.fight.down || EXEMPT.has(q.action?.type)) continue;
    if (Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z) > 8) continue;
    const t = sim.entity(q.fight.target);
    if (t && !isHuman(t)) out.push(q);
  }
  return out;
}
// 退く目安（partyCheck のいつもの目安と比べて大きいほうを使う）
export function beastsNeed(sim, foes) { return foes.some(strongBeast) ? NEED_STRONG : 0; }
export function beastsNoteRetreat(sim) { B(sim).stats.retreat++; }
export function beastsCrewOk(crew, c) { return !strongBeast(c) || crewPower(crew) >= powerC(c) * NEED_STRONG; }

// ---------- 毎日：減りすぎた種を呼び戻し、増えすぎた種を散らす ----------
export function beastsDaily(sim) {
  const S = sim.S, R = sim.rng, b = B(sim), st = b.stats, w = S.world;
  const n = { ...counts(sim) };
  const mask = townMask(sim);
  // 古いセーブ：強さを見直した種（ワイバーン・ゴーレム）の体力と攻めを新しい値に合わせる（1度だけ）
  if (!b.restat) {
    b.restat = 1;
    for (const c of Object.values(S.creatures)) if ((c.sp === 'wyvern' || c.sp === 'golem') && c.hp > 0) { const r = c.hp / Math.max(1, c.maxhp); applyStats(c); c.hp = Math.max(1, Math.round(c.maxhp * r)); }
  }
  const species = new Set([...Object.keys(b.base), ...Object.keys(n)]);
  for (const sp of species) {
    if (!counted(sp) || demonFree(sim, sp)) continue;
    const def = SPECIES[sp];
    const have = n[sp] || 0;
    // 下限を割った：住む土地の奥から流れてくる
    const floor = beastsFloorOf(sim, sp);
    if (!KEEP_ALIVE.has(sp) && def.biome && have < floor && R.chance(have === 0 ? 0.8 : 0.4)) {
      let p = null;
      for (let i = 0; i < 120 && !p; i++) {
        const x = R.int(3, W - 4), z = R.int(3, H - 4), t = tileAt(w, x, z);
        if (def.swims ? !isWater(t) : !walkable(t)) continue;
        if (!def.biome.includes(biomeOf(t)) || mask[z * W + x]) continue;
        if (w.settlements.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 25)) continue;
        p = { x, z };
      }
      if (p) {
        const c = makeCreature(sim, sp, p.x, p.z, { hx: p.x, hz: p.z, range: 10, lv: R.int(1, 2), age: 30 });
        if (c && c.hp > 0) {
          n[sp] = have + 1; st.refill[sp] = (st.refill[sp] || 0) + 1;
          if (have === 0) sim.pushLog(`${sim.placeName(p.x, p.z)}に、姿を消していた${def.name}が戻ってきた。`, 'event', [], p);
        }
      }
    }
    // 上限を大きく超えた：餌や縄張りの取り合いで、弱い個体から散っていく
    const cap = beastsCap(sim, sp);
    if (have > cap * 1.25) {
      const k = Math.ceil((have - cap) * 0.2);
      const cands = Object.values(S.creatures).filter((c) => c.sp === sp && c.hp > 0 && !c.named && !c.fight && !c.dormant && !c.raid && !c.title && c.role !== 'leader' && c.role !== 'treasure')
        .sort((a, c) => (a.hunger ?? 50) - (c.hunger ?? 50) || a.lv - c.lv);
      for (const c of cands.slice(0, k)) { killCreature(sim, c, null); st.starved[sp] = (st.starved[sp] || 0) + 1; }
      n[sp] = have - Math.min(k, cands.length);
    }
  }
  sim._bzC = null;
}
