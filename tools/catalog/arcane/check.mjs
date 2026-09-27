import fs from 'fs';
const R = '/home/user/-_misa/js/';
const mine = [];
for (const f of ['arcane.js', 'arcane2.js', 'arcane3.js']) mine.push(...(await import(R + 'catalog/' + f + '?' + Date.now())).default);
const earth = (await import(R + 'catalog/earth.js')).default;
const { GOODS, SPECIES } = await import(R + 'data.js');
const { ITEMS } = await import(R + 'items.js');
const { CATALOG } = await import(R + 'goods.js');
const HOW = new Set('dig mine chop gather harvest fish hunt milk craft cook brew loot trade forage'.split(' '));
const ON = new Set('grass forest dense jungle savanna desert snow tundra swamp beach river lake sea deep hill mountain rock cave volcano field farm town dungeon ruins demoncastle pyramid mine'.split(' '));
const K = new Set('craft build food drink fuel medicine magic trade luxury hobby collect ritual tool wear feed fertilize dye gift quest'.split(' '));
const LIM = new Set(['vein', 'grove', 'herd', 'relic', 'none']);
const err = []; const ids = new Set(); const eids = new Set(earth.map((x) => x.id));
for (const it of mine) {
  for (const k of ['id', 'name', 'cat', 'sub', 'w', 'v', 'stack', 'rare', 'demand', 'src', 'use', 'desc']) if (it[k] == null || it[k] === '') err.push(`${it.id}: ${k} がない`);
  if (!/^[a-z0-9_]+$/.test(it.id)) err.push(`${it.id}: id の形`);
  if (ids.has(it.id)) err.push(`${it.id}: id がかぶる`); ids.add(it.id);
  if (eids.has(it.id)) err.push(`${it.id}: 大地の担当とかぶる`);
  if (it.cat !== 'arcane') err.push(`${it.id}: cat`);
  if (!it.src?.length) err.push(`${it.id}: src が空`);
  if (!it.use?.length) err.push(`${it.id}: use が空`);
  if (!(it.demand >= 0 && it.demand <= 3)) err.push(`${it.id}: demand`);
  if (it.limit && !LIM.has(it.limit)) err.push(`${it.id}: limit`);
  if (/[A-Za-z]/.test(it.name)) err.push(`${it.id}: 名前に英字`);
  for (const s of it.src || []) { if (!HOW.has(s.how)) err.push(`${it.id}: how ${s.how}`); for (const o of s.on || []) if (!ON.has(o) && !SPECIES[o]) err.push(`${it.id}: on ${o}`); if (s.how === 'craft' && !it.make) err.push(`${it.id}: craft なのに make がない`); }
  for (const u of it.use || []) if (!K.has(u.k)) err.push(`${it.id}: use.k ${u.k}`);
  if (it.make && !Object.keys(it.make.from).length) err.push(`${it.id}: make が空`);
}
for (const id of ['medicine', 'jewelry', 'potion', 'antidote', 'ring', 'amulet']) if (!ids.has(id)) err.push(`必須の既存 id がない: ${id}`);
const known = new Set([...ids, ...eids, ...Object.keys(GOODS), ...Object.keys(ITEMS), ...Object.keys(CATALOG)]);
const need = {};
for (const it of mine) for (const k of Object.keys(it.make?.from || {})) if (!known.has(k)) (need[k] = need[k] || []).push(it.id);
console.log('種類:', mine.length, ' 誤り:', err.length); err.slice(0, 40).forEach((e) => console.log(' ', e));
const bySub = {}; for (const it of mine) bySub[it.sub] = (bySub[it.sub] || 0) + 1; console.log(JSON.stringify(bySub));
console.log('ほかの担当に頼む材料', Object.keys(need).length, ':', Object.entries(need).map(([k, v]) => `${k}(${v.length})`).join(' '));
console.log('mature', mine.filter((x) => x.mature).length, 'relic', mine.filter((x) => x.limit === 'relic').length);
fs.writeFileSync('need.json', JSON.stringify(need, null, 1));
