// 植物カタログの生成道具（scratchpad 専用。出力の js/catalog/plant*.js は純粋なデータ）
export const L = [];
const seen = new Map();
export const S = (how, on, rate) => { const o = { how }; if (on) o.on = on; if (rate != null) o.rate = rate; return o; };
export const U = (k, note) => (note ? { k, note } : { k });
export const PLANT = U('craft', '畑に植える');
export const M = (from, by, t, n) => { const m = { from, by, t }; if (n && n > 1) m.n = n; return m; };
const r2 = (x) => (x >= 10 ? Math.round(x) : x >= 1 ? Math.round(x * 10) / 10 : Math.max(0.01, Math.round(x * 100) / 100));
export const has = (id) => seen.has(id);
// P(id, name, sub, w, v, { st, r, d, lim, src, use, make, food, drink, keep, fx, desc, file })
// ほかの担当が使っている id に合わせた付け替え（作る時点で置き換える）
export const RN = { sandalwood_chips: 'sandalwood', cedar_lumber: 'cedar', mandrake_root: 'mandrake', belladonna: 'nightshade', aconite: 'wolfsbane', moonlight_flower: 'moonflower', madder_root: 'madder', cave_glowcap: 'glowcap', mermaid_weed: 'gill_weed', four_leaf_clover: 'clover4', bamboo_culm: 'bamboo', palm_frond: 'palm_leaf', willow_withy: 'willow_twig', tobacco_leaf: 'tobacco', sphagnum: 'swamp_moss', dreamgrass_flower: 'dreamgrass', mace: 'mace_spice',
  // 食べ物・道具の担当が材料に使っている id に合わせる
  oats: 'oat', bilberry: 'blueberry', black_truffle: 'truffle', olive_fruit: 'olive', rose_petals: 'rose_petal', cherries: 'cherry', cherries_sapling: 'cherry_fruit_sapling', violet: 'violet_flower', licorice: 'licorice_root', pine_needles: 'pine_needle', gentian: 'gentian_root', linseed: 'flax_seed', hempseed: 'hemp_seed', black_pepper: 'peppercorn', black_pepper_vine: 'pepper_vine', cinnamon: 'cinnamon_bark', sumac_spice: 'sumac', betel_leaf: 'chewnut_raw', yew_stave: 'yew', ironwood_lumber: 'ironwood', ebony_lumber: 'ebony', oak_lumber: 'oak', world_tree_branch: 'worldtree_branch', torch_pine: 'pinewood' };
export function P(id, name, sub, w, v, o = {}) {
  id = RN[id] || id;
  if (o.make) o.make.from = Object.fromEntries(Object.entries(o.make.from).map(([k, n]) => [RN[k] || k, n]));
  if (seen.has(id)) throw new Error('dup ' + id);
  if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('bad id ' + id);
  const it = { id, name, cat: 'plant', sub, w: r2(w), v: r2(v), stack: o.st ?? (w >= 20 ? 1 : w >= 5 ? 10 : w >= 1 ? 20 : 50), rare: o.r ?? 0 };
  let src = [...(o.src || [])];
  if (o.make && !src.some((s) => ['craft', 'cook', 'brew'].includes(s.how))) src.push({ how: 'craft' });
  it.src = src;
  it.use = o.use;
  if (o.make) it.make = o.make;
  // 有限度：畑で育てる・作れる物には書かない。野や林で採る物は grove、伝説の物は relic
  let lim = o.lim;
  if (lim === undefined) {
    const grown = src.some((s) => ['harvest', 'craft', 'cook', 'brew'].includes(s.how));
    if (!grown) lim = it.rare >= 4 ? 'relic' : src.some((s) => ['chop', 'gather', 'forage', 'fish', 'hunt'].includes(s.how)) ? 'grove' : null;
  }
  if (lim) it.limit = lim;
  it.demand = o.d ?? 1;
  for (const k of ['food', 'drink', 'keep', 'fx']) if (o[k] != null && o[k] !== 0) it[k] = o[k];
  it.desc = o.desc;
  seen.set(id, o.file || 1);
  it._file = o.file || 1;
  L.push(it);
  return it;
}
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function ser(v) {
  if (Array.isArray(v)) return '[' + v.map(ser).join(', ') + ']';
  if (v && typeof v === 'object') return '{ ' + Object.entries(v).map(([k, x]) => (/^[a-zA-Z_$][\w$]*$/.test(k) ? k : q(k)) + ': ' + ser(x)).join(', ') + ' }';
  if (typeof v === 'string') return q(v);
  return String(v);
}
export function write(fs, path, head, list) {
  const body = list.map((it) => { const { _file, ...o } = it; return '  ' + ser(o) + ','; }).join('\n');
  fs.writeFileSync(path, head + '\nexport default [\n' + body + '\n];\n');
}
