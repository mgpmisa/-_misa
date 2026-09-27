// 大地の担当（earth.js）と重なる物を外し、材料を大地の担当の id に付け替える
export const DROP = new Set([
  // 同じ id（大地の担当が持つ）
  'sulfur_flower', 'alum', 'green_vitriol', 'vermilion', 'verdigris', 'gold_leaf', 'silver_powder', 'crystal', 'mortar', 'crucible',
  'lightstone', 'warmstone', 'coolstone', 'barrierstone', 'slate_board', 'amber_insect',
  // 同じ物で id だけ違う（大地の担当の id を使う）
  'quicksilver', 'distilled_water', 'oil_of_vitriol', 'lead_white', 'holy_silver', 'manastone_dust', 'mana_crystal_s',
  'pigment_red', 'pigment_blue', 'pigment_green', 'pigment_yellow', 'ink_gold', 'crystal_ball_s', 'stone_tablet',
  'spec_quartz_cluster', 'spec_amethyst_geode', 'spec_pyrite', 'spec_fulgurite', 'spec_fern_fossil', 'spec_fish_fossil', 'spec_ammonite',
  'spec_dragon_bone_fossil', 'spec_meteorite', 'spec_desert_rose', 'spec_fluorite', 'spec_opal_rough', 'spec_serpentine', 'spec_malachite_rough',
  'spec_obsidian_ball', 'fossil',
]);
export const MAT = {
  quicksilver: 'mercury', distilled_water: 'distilledwater', oil_of_vitriol: 'vitriol_oil', lead_white: 'whitelead', holy_silver: 'holysilver',
  manastone_dust: 'magicstone_dust', mana_crystal_s: 'manacrystal', crystal: 'magicstone_large', ink_gold: 'gold_paint',
  pigment_red: 'redochre', pigment_blue: 'ultramarine', pigment_green: 'malachitegreen', pigment_yellow: 'yellowochre',
  water: 'freshwater', marble: 'marble_block', ochre: 'yellowochre', slate: 'slate_raw', sulfur_flower: 'sulfur_flower',
};
// id を変えて残す物（大地の担当と名前・id がぶつかる）
export const RENAME = {
  crystal_ball: ['scrying_orb', '遠見の魔晶玉', { crystal_ball: 1, magicstone_dust: 1 }, '大地の担当の水晶玉に魔石の粉を吸わせた占いの玉。覗くと遠くの景色が映る。'],
  obsidian_mirror: ['obsidian_scry_mirror', '黒曜の占い鏡', null, null],
};
// 元素の精は、大地の担当の元素の粉を酒精で溶いて作る
export const ESS = { fire: 'fire_dust', water: 'water_dust', earth: 'earth_dust', wind: 'wind_dust', light: 'light_dust', dark: 'dark_dust' };
export function fix(list) {
  const out = [];
  for (const it of list) {
    if (DROP.has(it.id)) continue;
    if (RENAME[it.id]) { const [id, name, from, desc] = RENAME[it.id]; it.id = id; it.name = name; if (from) it.make.from = from; if (desc) it.desc = desc; }
    const m = /^(\w+)_essence$/.exec(it.id);
    if (m && ESS[m[1]]) it.make.from = { [ESS[m[1]]]: 1, aqua_vitae: 1 };
    if (it.make) {
      const f = {};
      for (const [k, n] of Object.entries(it.make.from)) { if (!n) continue; const k2 = MAT[k] || k; f[k2] = (f[k2] || 0) + n; }
      it.make.from = f;
    }
    out.push(it);
  }
  return out;
}
