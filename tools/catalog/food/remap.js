// 動物・魔物の担当（beast.js）の id に合わせる
const REMAP = {
  beef: 'b_cow_shoulder', veal: 'b_cow_loin', pork: 'b_pig_shoulder', mutton: 'b_sheep_meat', lamb: 'b_sheep_meat', goat_meat: 'b_goat_meat', venison: 'b_deer_meat',
  boar_meat: 'b_boar_meat', rabbit_meat: 'b_rabbit_meat', chicken: 'b_chicken_meat', duck_meat: 'b_duck_meat', goose_meat: 'b_goose_meat', reindeer_meat: 'b_reindeer_meat',
  horse_meat: 'b_horse_meat', bear_meat: 'b_bear_meat', camel_meat: 'b_camel_meat', frog_meat: 'b_frog_meat', croc_meat: 'b_croc_meat', snake_meat: 'b_snake_meat',
  turtle_meat: 'b_turtle_meat', whale_meat: 'b_whale_meat', wyvern_meat: 'b_wyvern_meat', dragon_meat: 'b_dragon_meat', dragon_bone: 'b_dragon_bone',
  animal_blood: 'b_pig_blood', liver: 'b_pig_liver', kraken_tentacle: 'b_kraken_tentacle',
  trout: 'b_trout', salmon: 'b_salmon', carp: 'b_carp', pike: 'b_pike', eel: 'b_eel', catfish: 'b_catfish', herring: 'b_herring', cod: 'b_cod', sardine: 'b_sardine',
  mackerel: 'b_mackerel', tuna: 'b_tuna', sturgeon: 'b_sturgeon', bream: 'b_seabream', flatfish: 'b_flounder', lakefish: 'b_kokanee',
  crab: 'b_swimcrab', shrimp: 'b_sweetshrimp', oyster: 'b_oyster', clam: 'b_clam', mussel: 'b_mussel', squid: 'b_squid', octopus: 'b_octopus', lobster: 'b_spinylobster', sea_urchin: 'b_seaurchin',
  goat_milk: 'b_goat_milk', sheep_milk: 'b_sheep_milk', mare_milk: 'b_horse_milk', reindeer_milk: 'b_reindeer_milk', camel_milk: 'b_camel_milk',
  duck_egg: 'b_duck_egg', goose_egg: 'b_goose_egg', honey_forest: 'b_forest_honey', isinglass: 'b_isinglass', river_snail: 'b_mudsnail', tree_grub: 'b_grub', locust: 'b_locust',
  honeycomb: 'b_honeycomb', royal_jelly: 'b_royaljelly', lard: 'b_lard', oil_fish: 'b_fishoil', oil_whale: 'b_whaleoil',
};
// 動物の担当が作る物（食べ物の担当では作らない）
const DROP = new Set(['milk', 'egg', 'honey', 'goat_milk', 'sheep_milk', 'mare_milk', 'reindeer_milk', 'camel_milk', 'duck_egg', 'honeycomb', 'royal_jelly', 'honey_forest',
  'lard', 'oil_fish', 'oil_whale', 'tree_grub', 'locust', 'river_snail']);
module.exports = { REMAP, DROP };
