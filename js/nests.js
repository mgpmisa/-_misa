// 生き物の巣（動物・魔物の担当）
// ・種ごとに巣の形と置き場所を決め、住みかの地形に沿って置く。群れの種は群れで1つ、つがいは2頭で1つ。
// ・眠る時間になると巣へ帰って眠る（生き物の「住処」c.home を巣の場所にする。fauna.js の眠りがそこへ帰る）。
// ・夜行性（フクロウ・オオカミ・キツネ・コウモリ・アンデッドなど）は昼に巣で眠り、夜に出てくる。
// ・子は母の巣で育つ。独り立ちした若い獣は、新しい土地に自分の巣を作る。
// ・S.nests = { id: { id, sp, kind, name, x, z, members:[生き物のid], band, made, empty } }。古いセーブでも毎日足していく。
// お金は動かさない。
import { SPECIES } from './data.js';
import { W, H, walkable, tileAt, biomeOf, isWater } from './world.js';
import { townMask } from './creatures.js';

// 種 → [形, 名前]。形：burrow 巣穴 / cave 洞穴 / bed 寝床 / tree 木の上の巣 / cliff 岩山の巣 / shore 水辺の巣 / camp 野営地 / web 蜘蛛の巣
export const NEST = {
  rabbit: ['burrow', '草地の巣穴'], fox: ['burrow', '森の巣穴'], snake: ['burrow', '岩の下の穴'], scorpion: ['burrow', '砂の巣穴'],
  frog: ['burrow', '水辺の泥の穴'], turtle: ['shore', '水辺の砂の巣'], croc: ['burrow', '川岸の巣穴'], rat: ['burrow', '倉のそばの穴'],
  bear: ['cave', '山の洞穴'], polarbear: ['cave', '雪の洞穴'], tiger: ['cave', '岩陰のねぐら'], bat: ['cave', '岩山の洞穴'],
  wolf: ['bed', '森の奥のねぐら'], deer: ['bed', '草の寝床'], reindeer: ['bed', '雪原の寝床'], boar: ['bed', '寝屋（枯れ草の寝床）'], camel: ['bed', '砂漠のねぐら'],
  owl: ['tree', '木のうろの巣'], crow: ['tree', '木の上の巣'], parrot: ['tree', '木の上の巣'], squirrel: ['tree', '木の上の巣'], monkey: ['tree', '木の上の寝床'],
  eagle: ['cliff', '岩山の巣'], goose: ['shore', '水辺の巣'], seagull: ['shore', '浜の巣'], penguin: ['shore', '氷の浜の営巣地'],
  goblin: ['camp', 'ゴブリンの野営地'], orc: ['camp', 'オークの野営地'], spider: ['web', '大蜘蛛の巣'], wyvern: ['cliff', 'ワイバーンの巣'], unicorn: ['bed', '泉のほとりのねぐら'],
  hobgoblin: ['camp', 'ゴブリンの野営地'], goblinlord: ['camp', 'ゴブリンの野営地'], orcking: ['camp', 'オークの野営地'], arachne: ['web', '大蜘蛛の巣'],
};
export const NEST_KIND_NAME = { burrow: '巣穴', cave: '洞穴', bed: '寝床', tree: '木の上の巣', cliff: '岩山の巣', shore: '水辺の巣', camp: '野営地', web: '蜘蛛の巣' };
const SOCIAL = new Set(['wolf', 'deer', 'reindeer', 'boar', 'monkey', 'penguin', 'seagull', 'camel', 'goose', 'crow', 'bat', 'rat', 'frog']);
// 夜行性：昼に巣で眠り、夜に出る（fauna.js の NOCT にオオカミを足したもの、魔物は不死者・蜘蛛・ゴブリン）
export const NOCT_ANIMAL = new Set(['owl', 'bat', 'fox', 'tiger', 'scorpion', 'frog', 'rat', 'wolf']);
export const NOCT_MONSTER = new Set(['skeleton', 'skelknight', 'lich', 'mummy', 'pharaoh', 'spider', 'arachne', 'goblin', 'hobgoblin', 'goblinlord']);
const TREE_B = new Set(['forest', 'dense', 'jungle']);
const d2p = (c, n) => Math.hypot(c.home.x - n.x, c.home.z - n.z);

function fits(sim, kind, def, x, z) {
  const t = tileAt(sim.S.world, x, z);
  const b = biomeOf(t);
  if (def.swims || isWater(t)) return false;
  if (kind === 'tree') return TREE_B.has(b);
  if (kind === 'cliff') return b === 'mountain' || b === 'snow';
  if (kind === 'cave') return walkable(t) && (b === 'mountain' || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => biomeOf(tileAt(sim.S.world, x + dx, z + dz)) === 'mountain') || b === 'jungle' || b === 'snow');
  if (kind === 'shore') return walkable(t) && [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2], [-2, 0], [0, -2]].some(([dx, dz]) => isWater(tileAt(sim.S.world, x + dx, z + dz)));
  return walkable(t) && (!def.biome || def.biome.includes(b) || kind === 'burrow');
}
// 住処の近く（半径6まで）で、巣の形に合う場所
function spotNear(sim, c, kind) {
  const def = SPECIES[c.sp], mask = townMask(sim), hx = Math.round(c.home.x), hz = Math.round(c.home.z);
  for (let r = 0; r <= 6; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = hx + dx, z = hz + dz;
      if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2) continue;
      if (c.sp !== 'rat' && mask[z * W + x]) continue;
      if (fits(sim, kind, def, x, z)) return { x, z };
    }
  }
  const t = tileAt(sim.S.world, hx, hz);
  return walkable(t) || def.flies ? { x: hx, z: hz } : null;
}
function wants(sim, c) {
  const def = SPECIES[c.sp];
  if (!def || !NEST[c.sp] || c.hp <= 0 || c.dormant || c.inDungeon || def.swims) return false;
  if (def.monster) return c.lair == null && !c.named && !c.general && !c.raid;   // ダンジョン・遺跡に住む魔物は、その建物が住処
  return def.kind === 'wild';
}

// 毎日（と、世界を作ったとき）
export function nestsDaily(sim) {
  const S = sim.S, R = sim.rng;
  S.nests = S.nests || {};
  S.nestSeq = S.nestSeq || 1;
  const N = S.nests;
  for (const n of Object.values(N)) n.members = [];
  const bySp = {};
  for (const n of Object.values(N)) (bySp[n.sp] = bySp[n.sp] || []).push(n);
  const all = Object.values(S.creatures);
  let changed = false;
  const kids = [];
  for (const c of all) {
    if (!wants(sim, c)) { if (c.nest != null && c.hp > 0 && !N[c.nest]) c.nest = null; continue; }
    if (c.juv || c.role === 'young') { kids.push(c); continue; }
    let n = c.nest != null ? N[c.nest] : null;
    if (n && n.sp !== c.sp && NEST[n.sp]?.[0] !== NEST[c.sp][0]) n = null;   // 進化した魔物は、形が同じなら同じ巣
    const away = c.forage || c.mig && !c.mig.arrived;
    if (n && !away && d2p(c, n) > 8) n = null;   // 住む場所を移した：古い巣を離れる
    if (!n && away) continue;
    if (!n) {
      const [kind, name] = NEST[c.sp];
      const social = SOCIAL.has(c.sp) || !!c.band;
      const mate = c.mate != null ? S.creatures[c.mate] : null;
      // 群れ：同じ群れ（魔物は同じ一団）の巣。つがい：相手の巣。ほかは近くの同じ種の空いた巣
      let best = null, bd = social ? 8 : 3;
      for (const o of bySp[c.sp] || []) {
        if (c.band ? o.band !== c.band : o.band) continue;
        if (mate && mate.nest === o.id) { best = o; break; }
        const cap = social ? 14 : 1;
        if (o.members.length >= cap) continue;
        const d = d2p(c, o);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) {
        const p = spotNear(sim, c, kind);
        if (!p) continue;
        best = { id: S.nestSeq++, sp: c.sp, kind, name, x: p.x, z: p.z, members: [], band: c.band || null, made: sim.today, empty: 0 };
        N[best.id] = best;
        (bySp[c.sp] = bySp[c.sp] || []).push(best);
        changed = true;
      }
      n = best;
    }
    c.nest = n.id;
    n.members.push(c.id);
    n.empty = 0;
    if (!away) {
      c.home = { x: n.x, z: n.z, ...(c.home?.bld != null ? { bld: c.home.bld } : {}) };
      c.den = n.name;
    }
  }
  // 子は母の巣で育つ
  for (const c of kids) {
    const mom = c.parents?.[0] != null ? S.creatures[c.parents[0]] : null;
    const n = mom?.nest != null ? N[mom.nest] : c.nest != null ? N[c.nest] : null;
    if (!n) continue;
    c.nest = n.id; n.members.push(c.id); c.den = n.name;
  }
  // 住む者のいなくなった巣は、数日で崩れて消える
  for (const n of Object.values(N)) {
    if (n.members.length) continue;
    n.empty = (n.empty || 0) + 1;
    if (n.empty >= 4) { delete N[n.id]; changed = true; }
  }
  if (changed) S.nestVer = (S.nestVer || 0) + 1;
}

// 夜行性の魔物は、昼（8時〜17時）は住処で眠る（monsters.js monsterThink から）
export function monsterSleeps(sim, c) {
  if (!NOCT_MONSTER.has(c.sp) || c.named || c.raid || c.war || c.fight || c.avenge != null || c.hunger < 25) { if (c.sleeping) c.sleeping = false; return false; }
  const h = sim.hour();
  const day = h >= 8 && h < 17;
  if (!day) { if (c.sleeping) c.sleeping = false; return false; }
  c.sleeping = Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z) < 3;
  return true;
}

// 地面をクリックしたとき（ui.js tileHtml）：何の巣か・何匹住んでいるか
export function nestTileHtml(sim, x, z, esc) {
  const N = sim.S.nests;
  if (!N) return '';
  let best = null, bd = 1.6;
  for (const n of Object.values(N)) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
  if (!best) return '';
  const S = sim.S;
  const ms = best.members.map((id) => S.creatures[id]).filter((c) => c && c.hp > 0);
  const adults = ms.filter((c) => !c.juv && c.role !== 'young'), young = ms.length - adults.length;
  const inside = ms.filter((c) => Math.hypot(c.pos.x - best.x, c.pos.z - best.z) < 2).length;
  const noct = NOCT_ANIMAL.has(best.sp) || NOCT_MONSTER.has(best.sp);
  const list = ms.slice(0, 10).map((c) => `<span class="link" data-cid="${c.id}">${esc(c.name)}</span>`).join('、');
  return `<div class="section"><h4>${esc(SPECIES[best.sp]?.name || '')}の${esc(best.name)}</h4><dl class="kv">`
    + `<dt>巣の形</dt><dd>${esc(NEST_KIND_NAME[best.kind] || best.kind)}</dd>`
    + `<dt>住んでいる</dt><dd>${ms.length}匹（大人${adults.length}${young ? `・子${young}` : ''}）</dd>`
    + `<dt>いま巣にいる</dt><dd>${inside}匹（${noct ? '夜行性：昼に眠り、夜に出てくる' : '昼に動き、夜に眠る'}）</dd>`
    + (list ? `<dt>顔ぶれ</dt><dd>${list}</dd>` : '') + `</dl></div>`;
}
