// 大地・鉱物の一覧を組み立てる道具（生成用。本体には入れない）
export const L = [];
const seen = new Set();
export const S = (how, on, rate) => (rate == null ? { how, on } : { how, on, rate });
export const U = (k, note) => (note ? { k, note } : { k });
export const M = (from, by, t) => ({ from, by, t });
const r2 = (x) => (x >= 10 ? Math.round(x) : x >= 1 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
export function A(id, name, sub, w, v, o = {}) {
  if (seen.has(id)) throw new Error('dup ' + id);
  seen.add(id);
  const it = { id, name, cat: 'earth', sub, w: r2(w), v: r2(v), stack: o.stack ?? (w >= 20 ? 1 : w >= 5 ? 10 : w >= 1 ? 20 : 50), rare: o.rare ?? 0 };
  it.src = o.src;
  it.use = o.use;
  if (o.make) it.make = o.make;
  if (o.limit) it.limit = o.limit;
  it.demand = o.demand ?? 1;
  for (const k of ['food', 'drink', 'keep', 'eq', 'fx']) if (o[k] != null) it[k] = o[k];
  it.desc = o.desc;
  // make があれば src に craft を足す
  if (it.make && !it.src?.some((s) => s.how === 'craft' || s.how === 'cook' || s.how === 'brew')) it.src = [...(it.src || []), { how: 'craft' }];
  L.push(it);
  return it;
}
export const has = (id) => seen.has(id);
