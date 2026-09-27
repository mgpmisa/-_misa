// 食べ物の担当のファイルを点検する台本
import fs from 'fs';
const dir = '/home/user/-_misa/js/catalog/';
const mine = [...(await import(dir + 'food.js')).default, ...(await import(dir + 'food2.js')).default];
const others = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('food'))) {
  for (const it of (await import(dir + f)).default) others[it.id] = f;
}
const HOW = 'dig mine chop gather harvest fish hunt milk craft cook brew loot trade forage'.split(' ');
const UK = 'craft build food drink fuel medicine magic trade luxury hobby collect ritual tool wear feed fertilize dye gift quest'.split(' ');
const errs = [], ids = new Set();
for (const it of mine) {
  const e = (m) => errs.push(`${it.id}: ${m}`);
  if (ids.has(it.id)) e('id がかぶっている'); ids.add(it.id);
  if (others[it.id]) e('ほかの担当（' + others[it.id] + '）と id がかぶっている');
  if (!/^[a-z][a-z0-9_]*$/.test(it.id)) e('id の形');
  for (const k of ['name', 'cat', 'sub', 'w', 'v', 'stack', 'rare', 'src', 'use', 'desc', 'demand']) if (it[k] === undefined || it[k] === '') e('項目がない ' + k);
  if (it.cat !== 'food') e('cat');
  if (!it.src?.length) e('src が空'); if (!it.use?.length) e('use が空');
  for (const s of it.src || []) { if (!HOW.includes(s.how)) e('how ' + s.how); if (['craft', 'cook', 'brew'].includes(s.how) && !it.make) e('make がない'); }
  for (const u of it.use || []) if (!UK.includes(u.k)) e('use.k ' + u.k);
  if (!(it.food > 0) && !(it.drink > 0)) e('food も drink もない');
  if (it.make && !(it.make.t > 0)) e('make.t');
  if (!(it.w > 0) || !(it.v >= 0)) e('重さか値打ち');
  if (it.demand < 0 || it.demand > 3) e('demand');
}
// 材料
const need = {};
for (const it of mine) for (const m of Object.keys(it.make?.from || {})) if (!ids.has(m) && !others[m]) (need[m] = need[m] || []).push(it.id);
const must = ['bread', 'ale', 'honey', 'vinegar', 'oil', 'sugar', 'egg', 'cacao', 'lemon_juice'];
for (const m of must) if (!ids.has(m) && !others[m]) errs.push('必ず含める id がない：' + m);
console.log('物の数', mine.length, ' 不具合', errs.length);
errs.slice(0, 40).forEach((x) => console.log(' ', x));
const used = {}; for (const it of mine) for (const m of Object.keys(it.make?.from || {})) if (others[m]) used[m] = others[m];
console.log('ほかの担当の id を使った数', Object.keys(used).length, JSON.stringify(used));
console.log('まだない材料', Object.keys(need).length);
console.log(Object.keys(need).sort().join(' '));
