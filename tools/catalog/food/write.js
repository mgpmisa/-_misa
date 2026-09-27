const fs = require('fs');
const items = require('./main');
const key = (k) => (/^[a-z_$][a-z0-9_$]*$/i.test(k) ? k : `'${k}'`);
function ser(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(ser).join(', ')}]`;
  return `{ ${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${key(k)}: ${ser(x)}`).join(', ')} }`;
}
const HEAD = (n, part) => `// 世界の物：食べ物・飲み物・嗜好品（素材管理部 食べ物の担当 cat: 'food'）その${part}
// 書き方は docs/素材の決まり.md。処理は書かず、物の一覧だけを返す。
// 生成元：tools/catalog/food/（node tools/catalog/food/write.js js/catalog で作り直せる。点検は check_food.mjs）
// 追加の項目：grade 格（common 庶民 / inn 宿 / noble 貴族 / royal 王宮）、tribe その品を作る民族（js/lore.js の TRIBES の id）
// fx の言葉（魔法の担当と同じ）：hp 体力 / mood 気分 / sleep 眠り / energy 疲れ / warmth 寒さしのぎ / mana 魔力 / cure 治す病
//   食べ物の担当が足したもの：drunk 酔い（0〜1。負の値は酔い覚まし）/ courage 勇気（戦いの前の士気）
// make.by の新しい職業名：household 家の者（誰でも家で作る）/ vintner 葡萄酒造り / distiller 蒸留酒造り / confectioner 菓子職人
//   cheesemaker 乳酪職人 / saltmaker 塩焼き / leafcurer 香草葉の刻み屋 / elf_brewer エルフの醸し手 / dwarf_distiller ドワーフの蒸留師
export default [
`;
const half = Math.ceil(items.length / 2);
const parts = [items.slice(0, half), items.slice(half)];
const out = process.argv[2];
parts.forEach((p, i) => {
  fs.writeFileSync(`${out}/food${i ? i + 1 : ''}.js`, HEAD(p.length, i + 1) + p.map((it) => '  ' + ser(it) + ',').join('\n') + '\n];\n');
});
console.log('wrote', items.length);
