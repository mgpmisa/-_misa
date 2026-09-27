import { L } from './gen_core.mjs';
import './gen_soil.mjs'; import './gen_stone.mjs'; import './gen_metal.mjs'; import './gen_gem.mjs'; import './gen_magic.mjs'; import './gen_build.mjs'; import './gen_more.mjs';
const by = {}; for (const it of L) by[it.sub] = (by[it.sub] || 0) + 1;
console.log(L.length, JSON.stringify(by));
if (process.argv[2]) {
  const fs = await import('fs');
  const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const ser = (x) => Array.isArray(x) ? '[' + x.map(ser).join(', ') + ']' : x && typeof x === 'object' ? '{ ' + Object.entries(x).map(([k, v]) => (/^[a-z_][a-z0-9_]*$/i.test(k) ? k : q(k)) + ': ' + ser(v)).join(', ') + ' }' : typeof x === 'string' ? q(x) : String(x);
  let out = `// 大地・鉱物・金属・宝石・水・化石・建材（素材管理部 大地の担当）\n// 決まりは docs/素材の決まり.md。処理は書かず、物の一覧だけを返す。\nexport default [\n`;
  let lastSub = null;
  for (const it of L) { if (it.sub !== lastSub) { out += `  // --- ${it.sub} ---\n`; lastSub = it.sub; } out += '  ' + ser(it) + ',\n'; }
  out += '];\n';
  fs.writeFileSync(process.argv[2], out);
}
