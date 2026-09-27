// 食べ物カタログの生成用の小道具
const items = [];
const seen = new Map();
const GRADE = { common: '庶民', inn: '宿', noble: '貴族', royal: '王宮' };

function r2(x) { return Math.round(x * 100) / 100; }

const { REMAP, DROP } = require('./remap');
function add(o) {
  if (DROP.has(o.id)) return null;
  if (o.make) { const f = {}; for (const [k, n] of Object.entries(o.make.from)) { const kk = REMAP[k] || k; f[kk] = (f[kk] || 0) + n; } o.make = { ...o.make, from: f }; }
  if (seen.has(o.id)) throw new Error('dup ' + o.id + ' ' + o.name);
  const it = { id: o.id, name: o.name, cat: 'food', sub: o.sub, w: r2(o.w ?? 0.5), v: r2(o.v ?? 2), stack: o.stack ?? 10, rare: o.rare ?? 0 };
  it.src = o.src || (o.make ? [{ how: o.how || 'cook' }] : null);
  if (o.trade && it.src) it.src = [...it.src, { how: 'trade' }];
  if (o.loot && it.src) it.src = [...it.src, { how: 'loot', on: o.loot }];
  if (o.make) { if (!(o.make.t > 0)) o.make.t = 0.2; it.make = o.make; }
  // 使い道：食べる・飲むのほかの価値も付ける
  const use = [];
  if (o.food && !o.noEat) use.push({ k: 'food', ...(o.eatNote ? { note: o.eatNote } : {}) });
  if (o.drink && !o.noEat) use.push({ k: 'drink', ...(o.drinkNote ? { note: o.drinkNote } : {}) });
  for (const u of o.use || []) use.push(typeof u === 'string' ? { k: u } : u);
  if (o.keep >= 60 && o.food >= 8 && !o.noEat && !use.some((u) => u.note && u.note.includes('旅'))) use.push({ k: 'food', note: '旅の携行食（日持ちする）' });
  if (o.grade === 'noble' && !use.some((u) => u.k === 'gift')) use.push({ k: 'gift', note: '貴族への贈り物・もてなし' });
  if (o.grade === 'royal' && !use.some((u) => u.k === 'luxury')) use.push({ k: 'luxury', note: '王宮の宴の品' });
  if (o.grade === 'inn' && !use.some((u) => u.k === 'trade')) use.push({ k: 'trade', note: '宿と酒場の売り物' });
  it.use = use;
  if (o.food) it.food = o.food;
  if (o.drink) it.drink = o.drink;
  if (o.keep) it.keep = o.keep;
  if (o.fx) it.fx = o.fx;
  it.demand = o.demand ?? 1;
  if (o.limit) it.limit = o.limit;
  if (o.grade) it.grade = o.grade;
  if (o.tribe) it.tribe = o.tribe;
  it.desc = o.desc;
  seen.set(it.id, it);
  items.push(it);
  return it;
}
const mk = (from, by, t) => ({ from, by, t });

module.exports = { items, seen, add, mk, GRADE, r2 };
