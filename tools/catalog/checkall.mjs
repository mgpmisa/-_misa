// 全分類の物の一覧を読み、重なり・行き先のない材料・使い道や手に入れ方の漏れを数える
import fs from 'fs';
const dir = new URL('../../js/catalog/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
const all = [], byId = new Map(), dup = [];
for (const f of files) {
  const list = (await import(new URL(f, dir))).default;
  for (const it of list) { it._f = f; if (byId.has(it.id)) dup.push(`${it.id} (${byId.get(it.id)._f} / ${f})`); else byId.set(it.id, it); all.push(it); }
}
const missing = new Map();
for (const it of all) for (const k of Object.keys(it.make?.from || {})) if (!byId.has(k)) missing.set(k, (missing.get(k) || []).concat(it.id));
const noSrc = all.filter((i) => !i.src?.length).map((i) => i.id), noUse = all.filter((i) => !i.use?.length).map((i) => i.id);
const cats = {}; for (const it of byId.values()) cats[it.cat] = (cats[it.cat] || 0) + 1;
console.log('合計', byId.size, JSON.stringify(cats));
console.log('重なり', dup.length, dup.slice(0, 30).join(', '));
console.log('行き先のない材料', missing.size, [...missing.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 60).map(([k, v]) => `${k}(${v.length})`).join(' '));
console.log('手に入れ方なし', noSrc.length, '使い道なし', noUse.length);
