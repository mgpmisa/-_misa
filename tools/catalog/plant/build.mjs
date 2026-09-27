import fs from 'fs';
import { L, write } from './core.mjs';
await import('./trees.mjs'); await import('./special.mjs');
await import('./crops.mjs'); await import('./veg.mjs'); await import('./fruit.mjs'); await import('./nuts.mjs'); await import('./fiber.mjs');
await import('./herbs.mjs'); await import('./magic.mjs'); await import('./other.mjs'); await import('./extra.mjs');
// 他の担当から頼まれた id に合わせて名前を付け替える

// ほかの担当がすでに作っている物は、そちらに任せる（id がかぶらないように）
const DROP = new Set(['birch_sap', 'maple_sap', 'maple_syrup', 'palm_sap', 'bran', 'grape_pomace', 'wood_ash', 'lye', 'smudge_bundle', 'honey']);
for (let i = L.length - 1; i >= 0; i--) if (DROP.has(L[i].id)) L.splice(i, 1);
const MATURE = new Set(['dreamgrass', 'black_lotus', 'poppy_latex', 'laughing_weed', 'laughing_mushroom', 'madcap', 'lovegrass_flower', 'datura', 'henbane']);
for (const it of L) if (MATURE.has(it.id)) { const { desc, ...rest } = it; Object.keys(it).forEach((k) => delete it[k]); Object.assign(it, rest, { mature: true, desc }); }
const OUT = process.argv[2] || '/home/user/-_misa/js/catalog';
const head = (t) => `// 素材管理部 植物の担当：${t}（cat: 'plant'）。データだけのファイル。書き方は docs/素材の決まり.md`;
write(fs, OUT + '/plant.js', head('木・木材・木炭・樹脂・魔法の木'), L.filter((x) => x._file === 1));
write(fs, OUT + '/plant2.js', head('穀物・豆・野菜・果物・木の実・油・繊維'), L.filter((x) => x._file === 2));
write(fs, OUT + '/plant3.js', head('薬草・香辛料・嗜好品・毒草・魔法の草'), L.filter((x) => x._file === 3));
write(fs, OUT + '/plant4.js', head('キノコ・苔・海藻・花・染め草・地形の植物・畑の加工品'), L.filter((x) => x._file === 4));
console.log('total', L.length, [1, 2, 3, 4].map((f) => L.filter((x) => x._file === f).length));
