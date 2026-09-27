import fs from 'fs';
const dir = '/home/user/-_misa/js/catalog/';
const mine = [];
const other = {};
for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) {
  const m = (await import(dir + f)).default;
  if (f.startsWith('gear')) mine.push(...m.map((o) => ({ ...o, _f: f }))); else for (const o of m) other[o.id] = f;
}
const { ITEMS } = await import('/home/user/-_misa/js/items.js');
const err = [];
const ids = new Map();
const SLOTS = ['weapon', 'armor', 'shield', 'head', 'hands', 'feet', 'bag', 'accessory', 'tool'];
const HOW = ['dig', 'mine', 'chop', 'gather', 'harvest', 'fish', 'hunt', 'milk', 'craft', 'cook', 'brew', 'loot', 'trade', 'forage'];
const UK = ['craft', 'build', 'food', 'drink', 'fuel', 'medicine', 'magic', 'trade', 'luxury', 'hobby', 'collect', 'ritual', 'tool', 'wear', 'feed', 'fertilize', 'dye', 'gift', 'quest'];
for (const o of mine) {
  if (ids.has(o.id)) err.push('重複(自分) ' + o.id);
  ids.set(o.id, o);
  if (other[o.id]) err.push(`重複(${other[o.id]}) ${o.id}`);
  if (!/^[a-z0-9_]+$/.test(o.id)) err.push('id形式 ' + o.id);
  for (const k of ['id', 'name', 'cat', 'sub', 'w', 'v', 'stack', 'rare', 'demand']) if (o[k] == null || o[k] === '') err.push(`項目なし ${k} ${o.id}`);
  if (o.cat !== 'gear') err.push('cat ' + o.id);
  if (!o.src?.length) err.push('srcなし ' + o.id);
  if (!o.use?.length) err.push('useなし ' + o.id);
  for (const s of o.src || []) if (!HOW.includes(s.how)) err.push('how ' + o.id + ' ' + s.how);
  for (const u of o.use || []) if (!UK.includes(u.k)) err.push('use.k ' + o.id + ' ' + u.k);
  if (o.src?.some((s) => s.how === 'craft') && !o.make) err.push('makeなし ' + o.id);
  if (!o.make && !o.src.every((s) => ['loot', 'mine', 'gather'].includes(s.how))) err.push('makeなし(loot以外) ' + o.id);
  if (o.eq && !SLOTS.includes(o.eq.slot)) err.push('slot ' + o.id + ' ' + o.eq.slot);
  if (o.sub === 'bag' && (o.eq?.slot !== 'bag' || !o.eq.cap || !o.eq.kg)) err.push('入れ物のeq ' + o.id);
  if ((/^(magic_)?(sword|axe|spear|polearm|mace|bow|crossbow|club|whip|staff)/.test(o.sub)) && !(o.eq?.atk > 0)) err.push('atkなし ' + o.id);
  if (o.limit && !['vein', 'grove', 'herd', 'relic', 'none'].includes(o.limit)) err.push('limit ' + o.id);
  if (!(o.demand >= 0 && o.demand <= 3)) err.push('demand ' + o.id);
}
const must = [...Object.entries(ITEMS).filter(([, d]) => ['weapon', 'armor', 'shield', 'tool'].includes(d.type)).map(([k]) => k), 'tools', 'weapons', 'furniture', 'shoes', 'cloth', 'pottery'];
for (const k of must) if (!ids.has(k)) err.push('今ある品が無い ' + k);
// 材料
const need = {};
for (const o of mine) for (const k of Object.keys(o.make?.from || {})) if (!ids.has(k) && !other[k] && !ITEMS[k]) (need[k] = need[k] || []).push(o.id);
console.log('件数', mine.length);
console.log('誤り', err.length); console.log(err.slice(0, 60).join('\n'));
console.log('まだない材料', Object.keys(need).length);
console.log(Object.entries(need).map(([k, v]) => `${k}(${v.length})`).join(' '));
const bySub = {}; for (const o of mine) bySub[o._f] = (bySub[o._f] || 0) + 1; console.log(bySub);
