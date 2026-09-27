// 物の出どころの棚卸し：node tools/catalog/origin.mjs [jsのディレクトリ] [seed] [日数] [結果.json]（経済部 素材の担当）
// 目録の src（出どころ）と、世界で実際に手に入る仕組みを突き合わせる
import fs from 'fs';
const dir = process.argv[2] || new URL('../../js', import.meta.url).pathname, seed = +process.argv[3] || 12345, days = +process.argv[4] || 1, out = process.argv[5];
const { Sim } = await import(dir + '/sim.js');
const { T } = await import(dir + '/world.js');
const { JOBS, SPECIES } = await import(dir + '/data.js');
const MM = await import(dir + '/matter.js');
const MAT = MM.MAT, MAKER = MM.MAKER;
const sim = new Sim().newWorld(seed); const S = sim.S;
// ---- 世界の実在：地形・建物・生き物・職業（数日回して見る） ----
const tileN = {}; for (const t of S.world.tiles) tileN[t] = (tileN[t] || 0) + 1;
const TILE_ON = {
  [T.DEEP]: ['deep', 'sea'], [T.SEA]: ['sea'], [T.BEACH]: ['beach'], [T.GRASS]: ['grass', 'field'], [T.FOREST]: ['forest'], [T.DENSE]: ['dense', 'forest'],
  [T.JUNGLE]: ['jungle'], [T.DESERT]: ['desert'], [T.SNOW]: ['snow', 'tundra'], [T.ROCK]: ['rock', 'hill', 'mountain'], [T.PEAK]: ['mountain'],
  [T.RIVER]: ['river', 'lake'], [T.ROAD]: ['town'], [T.FIELD]: ['farm', 'field'], [T.PLAZA]: ['town'], [T.BLD]: ['town'], [T.WASTE]: ['volcano', 'rock'],
  [T.BRIDGE]: ['river'], [T.SAVANNA]: ['savanna', 'grass'], [T.DOCK]: ['sea', 'beach'], [T.LAVA]: ['volcano'], [T.PASTURE]: ['grass', 'farm'], [T.SWAMP]: ['swamp'],
};
const onExists = new Set();
for (const [t, keys] of Object.entries(TILE_ON)) if (tileN[t] > 0) for (const k of keys) onExists.add(k);
const bTypes = new Set(S.world.buildings.map((b) => b.type));
if (bTypes.has('mine')) { onExists.add('mine'); onExists.add('cave'); onExists.add('mountain'); }
const jobsSeen = new Set(), spSeen = new Set(), keptSp = new Set();
const look = () => { for (const p of sim.living()) if (p.job) jobsSeen.add(p.job); for (const c of Object.values(S.creatures || {})) { spSeen.add(c.sp); if (c.keeper != null) keptSp.add(c.sp); } };
look();
for (let d = 0; d < days; d++) { for (let i = 0; i < 2880; i++) sim.step(0.5); look(); }
const got = S.matter?.seen ? new Set(Object.keys(S.matter.seen)) : new Set();
// ---- 仕組み：どの職がどの手に入れ方をするか（matter.js の GATHER と同じ） ----
const GATHER = {
  farmer: ['harvest'], beekeeper: ['harvest', 'gather'], gardener: ['harvest', 'gather'], rancher: ['gather'], shepherd: ['gather'],
  woodcutter: ['chop', 'gather'], charcoal: ['chop'], pioneer: ['chop', 'dig'], roadworker: ['dig'],
  miner: ['mine', 'dig'], mason: ['mine', 'dig'],
  fisher: ['fish', 'gather'], sailor: ['fish'], captain: ['fish'], diver: ['fish', 'gather'],
  gatherer: ['gather', 'forage'], herbalist: ['gather'], shaman: ['gather', 'forage'], hunter: ['forage'], laundress: ['gather'],
};
const whoHow = {}; for (const [j, hs] of Object.entries(GATHER)) if (jobsSeen.has(j)) for (const h of hs) (whoHow[h] = whoHow[h] || []).push(j);
const LOOT_OK = new Set(['dungeon', 'demoncastle', 'pyramid', 'ruins'].filter((k) => k === 'dungeon' ? bTypes.has('cave') : bTypes.has(k)));
const JP = { ...MM.ON_JP };
const makersOf = (by) => MAKER[by] || (JOBS[by] ? [by] : []);
// ---- 1品ずつ ----
const R = new Map();   // id → { ok, ways:[], why:[] , who:Set, where:Set }
const plantBeast = (it) => it.cat === 'plant' || it.cat === 'beast';
function direct(it) {
  const r = { ok: false, ways: new Set(), why: [], who: new Set(), where: new Set(), town: false };
  for (const s of it.src || []) {
    const h = s.how, ons = s.on || [];
    if (h === 'trade') { r.ok = true; r.ways.add('trade'); r.who.add('商人（遠い国から）'); continue; }
    if (h === 'craft' || h === 'cook' || h === 'brew') continue;
    if (h === 'loot') { for (const o of ons) { r.where.add(o); if (LOOT_OK.has(o)) { r.ok = true; r.ways.add('loot'); r.who.add('冒険者'); } else r.why.push(`宝箱の場所「${JP[o] || o}」は宝探しの対象でない`); } continue; }
    if (h === 'hunt') { for (const o of ons) { if (spSeen.has(o) || SPECIES[o]) { r.ok = true; r.ways.add('hunt'); r.who.add('狩人・冒険者・兵士'); } else r.why.push(`狩る相手「${o}」がこの世界にいない`); } continue; }
    if (h === 'milk') { for (const o of ons) { if (keptSp.has(o)) { r.ok = true; r.ways.add('milk'); r.who.add('家畜の飼い主'); } else r.why.push(`家畜「${o}」を飼う人がいない`); } continue; }
    const jobs = whoHow[h] || [];
    for (const o of ons) {
      r.where.add(o);
      if (!onExists.has(o)) { r.why.push(`${h}:${JP[o] || o}（この世界にその地形がない／採れない場所）`); continue; }
      if (!jobs.length) { r.why.push(`${h} をする職の人がいない`); continue; }
      if (o === 'town' && (h === 'gather' || h === 'forage') && plantBeast(it)) { r.town = true; r.why.push('町の中で摘む草・虫（直しで止めた）'); continue; }
      if (o === 'town' && h === 'harvest' && !['farmer', 'beekeeper', 'gardener'].some((j) => jobsSeen.has(j))) continue;
      r.ok = true; r.ways.add(h); for (const j of jobs) r.who.add(JOBS[j]?.name || j);
    }
  }
  return r;
}
for (const it of MAT.values()) R.set(it.id, direct(it));
// 作る：材料がすべて手に入り、作り手がいれば（くり返して広げる）
let changed = true, pass = 0;
while (changed && pass < 30) {
  changed = false; pass++;
  for (const it of MAT.values()) {
    const r = R.get(it.id); if (r.ok || !it.make) continue;
    const by = it.make.by;
    const makers = by === 'household' || by === 'cook' ? ['家の台所'] : makersOf(by).filter((j) => jobsSeen.has(j));
    if (!makers.length) continue;
    const ins = Object.keys(it.make.from || {});
    if (ins.every((k) => R.get(k)?.ok || (!MAT.has(k)))) { r.ok = true; r.ways.add('make'); for (const j of makers) r.who.add(JOBS[j]?.name || j); changed = true; }
  }
}
for (const it of MAT.values()) {
  const r = R.get(it.id); if (r.ok || !it.make) continue;
  const by = it.make.by;
  const makers = by === 'household' || by === 'cook' ? ['家'] : makersOf(by).filter((j) => jobsSeen.has(j));
  if (!makers.length) r.why.push(`作り手「${by}」がいない`);
  const miss = Object.keys(it.make.from || {}).filter((k) => MAT.has(k) && !R.get(k).ok);
  if (miss.length) r.why.push('材料が手に入らない：' + miss.slice(0, 4).join('・'));
}
// ---- 集計 ----
const CAT_JP = MM.CAT_JP;
const rows = [];
for (const it of MAT.values()) {
  const r = R.get(it.id);
  rows.push({ id: it.id, name: it.name, cat: it.cat, sub: it.sub || '', rare: it.rare || 0, ok: r.ok, ways: [...r.ways], who: [...r.who], where: [...r.where], why: [...new Set(r.why)], town: r.town, seen: got.has(it.id), src: (it.src || []).map((s) => s.how + ':' + (s.on || []).join('/')) });
}
const byCat = {};
for (const x of rows) { const c = byCat[x.cat + '/' + x.sub] || (byCat[x.cat + '/' + x.sub] = { n: 0, ok: 0, seen: 0, ways: {}, where: {}, who: {} }); c.n++; if (x.ok) c.ok++; if (x.seen) c.seen++; for (const w of x.ways) c.ways[w] = (c.ways[w] || 0) + 1; for (const w of x.where) c.where[w] = (c.where[w] || 0) + 1; for (const w of x.who) c.who[w] = (c.who[w] || 0) + 1; }
const summary = { seed, days, total: rows.length, ok: rows.filter((x) => x.ok).length, ng: rows.filter((x) => !x.ok).length, seen: rows.filter((x) => x.seen).length, townPlants: rows.filter((x) => x.town).length, onExists: [...onExists], lootOk: [...LOOT_OK], missingTerrain: Object.keys(JP).filter((k) => !onExists.has(k)) };
console.log(JSON.stringify(summary));
const whyN = {}; for (const x of rows) if (!x.ok) for (const w of x.why) { const k = w.replace(/：.*/, '').replace(/「.*」/, '「…」'); whyN[k] = (whyN[k] || 0) + 1; }
console.log('×の理由', JSON.stringify(Object.entries(whyN).sort((a, b) => b[1] - a[1]).slice(0, 20)));
if (out) fs.writeFileSync(out, JSON.stringify({ summary, byCat, rows, whyN, CAT_JP, JP }, null, 0));
