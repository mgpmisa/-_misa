import fs from 'fs';
import { FILES, add, CR } from './g0_common.mjs';
import { genWeapons } from './g1_weapons.mjs';
import { genArmor } from './g2_armor.mjs';
import { genClothes } from './g3_clothes.mjs';
import { genTools } from './g4_tools.mjs';
import { genHome } from './g5_home.mjs';

genWeapons(); genArmor(); genClothes(); genTools(); genHome();

// 魔法・宝の担当から頼まれた材料
add('gear4', { id: 'lacquer', name: '漆', sub: 'finish', w: 0.2, v: 12, stack: 20, rare: 1, demand: 1, src: [CR],
  use: [{ k: 'craft', note: '器・鞘・鎧に塗って水と虫から守り、艶を出す' }, { k: 'luxury' }], make: { from: { lacquer_sap: 2 }, by: 'lacquerer', t: 4 }, desc: '漆の木の汁を漉して練った塗り物。乾くと硬く艶やかになる。' });
add('gear4', { id: 'meerschaum', name: '海泡石', sub: 'stone', w: 0.5, v: 15, stack: 20, rare: 2, demand: 0, limit: 'vein',
  src: [{ how: 'mine', on: ['hill', 'mountain'], rate: 0.02 }, { how: 'gather', on: ['beach'], rate: 0.005 }], use: [{ k: 'craft', note: '煙管の火皿・彫り物' }, { k: 'hobby' }, { k: 'trade' }], desc: '海の泡が固まったといわれる白く軽い石。柔らかく彫りやすい。' });

add('gear', { id: 'weapons', name: '武器', sub: 'weapon_set', w: 3, v: 30, rare: 0, demand: 2, src: [CR, { how: 'loot', on: ['ruins'], rate: 0.03 }],
  use: [{ k: 'wear', note: '兵や自警団に配る' }, { k: 'trade' }, { k: 'craft', note: '鋳つぶして地金に戻す' }], make: { from: { iron: 2, wood: 1, leather: 1 }, by: 'smith', t: 6 },
  eq: { slot: 'weapon', atk: 7, dur: 1 }, desc: '市場で取り引きされる、ありふれた武器ひと揃い（剣・槍・斧のどれか）。' });
// ほかの担当とかぶる物は作らない（向こうの id を使う）
const DROP = new Set(['whetstone', 'hinge', 'crucible', 'castmold', 'mortar', 'nails', 'coppernails', 'barrelhoop', 'alembic', 'inkwell', 'quill', 'hourglass',
  'handbell', 'huntinghorn', 'festivalmask', 'featherheaddress', 'magicbag', 'writingslate']);
const MAT = { wax: 'sealing_wax', nails: 'iron_nail', rope: 'rope_fiber', starmetal: 'stariron', soot: 'lampblack', pitch: 'tar', ochre: 'redochre', fat: 'tallow', shell: 'seashell_common', slate: 'slate_board', barrelhoop: 'iron_hoop' };
const ID = { waterjar: 'kitchenwaterjar', rope: 'rope_fiber', balance: 'merchantbalance' };
const NAME = { merchantbalance: '商人の天秤' };
const fix = (s) => s.replace(/^starmetal_/, 'stariron_');
const out = {};
for (const [f, list] of Object.entries(FILES)) {
  out[f] = [];
  for (const o of list) {
    if (DROP.has(o.id)) continue;
    o.id = fix(ID[o.id] || o.id);
    if (NAME[o.id]) o.name = NAME[o.id];
    if (o.make?.from) { const n = {}; for (const [k, v] of Object.entries(o.make.from)) n[fix(MAT[k] || k)] = (n[fix(MAT[k] || k)] || 0) + v; o.make.from = n; }
    if (o.eq?.antimagic && o.name.startsWith('星鉄')) { /* keep */ }
    out[f].push(o);
  }
}
const HEAD = {
  gear: '// 道具・装備（1）武器：剣・斧・槍・槌・弓・弩・投石具・杖・鞭・棍棒・矢・民族の武器・魔法の武器',
  gear2: '// 道具・装備（2）防具：兜・鎧・盾・籠手・すね当て・民族の防具・魔法の防具',
  gear3: '// 道具・装備（3）糸・布・衣服・靴・帽子・身分と祭りの服',
  gear4: '// 道具・装備（4）入れ物（持てる量を増やす）・仕事の道具・金物・乗り物・馬具',
  gear5: '// 道具・装備（5）家具・食器・鍋・灯り・布もの・暮らしの道具・旅と野営の道具',
};
const ser = (o) => '  ' + JSON.stringify(o).replace(/"([a-zA-Z_]\w*)":/g, '$1: ').replace(/,(?=[a-z_]+: |\{|\[)/g, ', ').replace(/"/g, "'") + ',';
let total = 0;
for (const [f, list] of Object.entries(out)) {
  const txt = `${HEAD[f]}\n// 素材管理部 道具の担当。書き方は docs/素材の決まり.md。\n// eq.slot='bag' の cap＝増える枠、kg＝増える持てる重さ。eq.layer（under/legs/over）は鎧と重ね着できる服。\nexport default [\n${list.map(ser).join('\n')}\n];\n`;
  fs.writeFileSync(`/home/user/-_misa/js/catalog/${f}.js`, txt);
  total += list.length;
  console.log(f, list.length);
}
console.log('total', total);
