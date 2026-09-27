import fs from 'fs';
const dir = process.argv[2];
const mine = [];
for (const f of ['plant.js', 'plant2.js', 'plant3.js', 'plant4.js']) mine.push(...(await import(dir + '/' + f + '?' + Date.now())).default);
const others = new Map();
for (const f of fs.readdirSync('/home/user/-_misa/js/catalog')) if (/\.js$/.test(f) && !f.startsWith('plant')) for (const it of (await import('/home/user/-_misa/js/catalog/' + f)).default) others.set(it.id, f);
const HOW = 'dig mine chop gather harvest fish hunt milk craft cook brew loot trade forage'.split(' ');
const ON = 'grass forest dense jungle savanna desert snow tundra swamp beach river lake sea deep hill mountain rock cave volcano field farm town dungeon ruins demoncastle pyramid mine'.split(' ');
const K = 'craft build food drink fuel medicine magic trade luxury hobby collect ritual tool wear feed fertilize dye gift quest'.split(' ');
const LIM = ['vein', 'grove', 'herd', 'relic', 'none'];
const err = []; const ids = new Set();
for (const it of mine) {
  if (ids.has(it.id)) err.push('dup ' + it.id); ids.add(it.id);
  if (others.has(it.id)) err.push('他の担当とかぶる ' + it.id + ' ' + others.get(it.id));
  for (const k of ['id', 'name', 'cat', 'sub', 'w', 'v', 'stack', 'rare', 'desc']) if (it[k] == null || it[k] === '') err.push('欠け ' + it.id + ' ' + k);
  if (it.cat !== 'plant') err.push('cat ' + it.id);
  if (!it.src?.length) err.push('src空 ' + it.id);
  if (!it.use?.length) err.push('use空 ' + it.id);
  for (const s of it.src || []) { if (!HOW.includes(s.how)) err.push('how ' + it.id + ' ' + s.how); for (const o of s.on || []) if (!ON.includes(o)) err.push('on ' + it.id + ' ' + o); }
  for (const u of it.use || []) if (!K.includes(u.k)) err.push('k ' + it.id + ' ' + u.k);
  if (it.limit && !LIM.includes(it.limit)) err.push('limit ' + it.id);
  if (!(it.demand >= 0 && it.demand <= 3)) err.push('demand ' + it.id);
  if (it.src?.some((s) => s.how === 'craft') && !it.make) err.push('craftなのにmakeなし ' + it.id);
  if (it.src?.some((s) => ['harvest', 'craft'].includes(s.how)) && it.limit && it.limit !== 'none') err.push('育てられるのにlimit ' + it.id);
}
const need = {};
for (const it of mine) if (it.make) for (const [k, n] of Object.entries(it.make.from)) { if (!(n > 0)) err.push('材料の数 ' + it.id + ' ' + k); if (!ids.has(k) && !others.has(k)) (need[k] ||= []).push(it.id); }
for (const [k, v] of Object.entries(need)) err.push('材料がない ' + k + ' <- ' + v.join(','));
for (const id of ['wheat', 'wood', 'herbs', 'herb', 'charcoal', 'straw']) if (!ids.has(id)) err.push('必須の id がない ' + id);
console.log('件数', mine.length, 'エラー', err.length); console.log(err.slice(0, 60).join('\n'));
const bySub = {}; for (const it of mine) bySub[it.sub] = (bySub[it.sub] || 0) + 1; console.log(JSON.stringify(bySub));
const lim = {}; for (const it of mine) lim[it.limit || '(なし)'] = (lim[it.limit || '(なし)'] || 0) + 1; console.log(lim);
