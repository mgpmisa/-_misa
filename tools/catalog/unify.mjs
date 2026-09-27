// 分類をまたぐ材料の名前をそろえる（部長）。作り方の材料 id を付け替える
import fs from 'fs';
const MAP = {
  b_sheep_meat: 'mutton', b_deer_meat: 'venison', b_chicken_meat: 'chicken', b_dragon_bone: 'dragonbone',
  b_pig_blood: 'animal_blood', b_pig_liver: 'liver', b_flounder: 'flatfish', b_seabream: 'bream', b_swimcrab: 'crab',
  b_spinylobster: 'lobster', b_lard: 'lard', b_seaurchin: 'sea_urchin', wine: 'wine_red', lime: 'slakedlime', finery: 'gold_paint',
};
for (const s of 'goat_meat boar_meat reindeer_meat horse_meat eel cod sardine mackerel duck_meat camel_meat salmon herring rabbit_meat goose_meat bear_meat frog_meat croc_meat whale_meat wyvern_meat trout pike catfish tuna sturgeon snake_meat turtle_meat dragon_meat carp oyster mussel squid clam octopus kraken_tentacle goose_egg isinglass'.split(' ')) MAP['b_' + s] = s;
const dir = new URL('../../js/catalog/', import.meta.url);
let n = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const p = new URL(f, dir); let s = fs.readFileSync(p, 'utf8'); const before = s;
  // make.from の中の材料名だけを付け替える
  s = s.replace(/from: \{([^}]*)\}/g, (m, inner) => 'from: {' + inner.replace(/\b([a-z_0-9]+):/g, (mm, k) => (MAP[k] ? (n++, MAP[k] + ':') : mm)) + '}');
  if (s !== before) fs.writeFileSync(p, s);
}
console.log('付け替え', n);
