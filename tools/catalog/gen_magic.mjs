import { A, S, U, M } from './gen_core.mjs';

// ===== 魔石・魔晶 =====
const MON = ['goblinlord', 'orcking', 'lich', 'arachne', 'dragon', 'imp', 'golem', 'kingslime', 'pharaoh', 'wyvern'];
A('magicstone_shard', '魔石のかけら', 'magic', 0.05, 6, { limit: 'herd', demand: 1, stack: 99, src: [S('hunt', ['slime', 'bigslime', 'goblin', 'hobgoblin', 'skeleton', 'imp'], 0.2), S('mine', ['cave', 'dungeon'], 0.03)], use: [U('magic', '灯りの魔導具・小さな術'), U('craft', '集めて魔石に固める')], desc: '弱い魔物の体に宿る、小指の先ほどの魔石。' });
A('magicstone', '魔石', 'magic', 0.2, 30, { limit: 'herd', rare: 1, demand: 2, stack: 50, src: [S('hunt', MON, 0.4), S('loot', ['dungeon', 'demoncastle'], 0.1), S('mine', ['dungeon'], 0.01)], use: [U('magic', '杖・護符・結界の力のもと'), U('craft', '魔法の杖と護符の材料'), U('trade')], desc: '魔物の心臓近くにできる、魔力の固まり。' });
A('magicstone_large', '大魔石', 'magic', 0.8, 150, { limit: 'herd', rare: 2, demand: 1, stack: 20, src: [S('hunt', ['dragon', 'lich', 'demongeneral', 'orcking', 'goblinlord', 'pharaoh', 'arachne'], 0.3), S('loot', ['dungeon', 'demoncastle'], 0.02)], use: [U('magic', '町の結界・大きな魔導具'), U('trade')], desc: '強い魔物から取れる拳ほどの魔石。' });
A('magicstone_great', '極大魔石', 'magic', 3, 800, { limit: 'herd', rare: 3, demand: 0, stack: 5, src: [S('hunt', ['dragon', 'demonlord', 'demongeneral'], 0.2), S('loot', ['demoncastle'], 0.005)], use: [U('magic', '国を守る大結界の要'), U('collect', '王の宝物庫')], desc: '古竜や魔将の心臓に眠る、人の頭ほどの魔石。' });
A('magicstone_empty', '空の魔石', 'magic', 0.2, 5, { demand: 1, stack: 50, make: M({ magicstone: 1 }, 'wizard', 1), src: [S('gather', ['ruins', 'dungeon'], 0.05)], use: [U('magic', '魔力を込め直せばまた使える'), U('craft', '色の抜けた飾り石')], desc: '力を使い切って透明になった魔石。' });
A('magicstone_recharged', '込め直した魔石', 'magic', 0.2, 22, { demand: 1, stack: 50, make: M({ magicstone_empty: 1, magicstone_shard: 3 }, 'wizard', 4), use: [U('magic', '魔石と同じに使える')], desc: '空の魔石に魔術師が魔力を込め直したもの。少し曇っている。' });
A('magicstone_dust', '魔石の粉', 'magic', 0.1, 4, { demand: 1, stack: 99, make: M({ magicstone_shard: 1 }, 'alchemist', 1), use: [U('magic', '魔法陣を描く・魔法薬'), U('fertilize', '魔法の薬草の畑に撒く')], desc: '魔石のかけらを砕いた光る粉。' });
A('manacrystal', '魔晶', 'magic', 0.2, 120, { rare: 2, demand: 1, stack: 20, make: M({ magicstone: 3, crystal: 1 }, 'alchemist', 12), use: [U('magic', '混じりけのない魔力のもと・高位の杖'), U('trade')], desc: '魔石の力を水晶に移し、澄ませた結晶。' });
A('manacrystal_large', '大魔晶', 'magic', 1, 900, { rare: 3, demand: 0, stack: 5, make: M({ magicstone_large: 3, crystal_ball: 1 }, 'alchemist', 48), use: [U('magic', '宮廷魔術の大儀式・飛空の研究'), U('collect')], desc: '大魔石三つを一つに澄ませた、澄んだ光の結晶。' });

// 属性の結晶（火・水・風・土・光・闇）
const ELEM = [
  ['fire', '炎', ['volcano'], ['dragon', 'wyvern'], '炎の魔法・かまどの火種・鍛冶炉を熱くする', '赤く揺らめく、触れると温かい結晶。'],
  ['water', '水', ['sea', 'lake', 'deep'], ['slime', 'bigslime', 'kingslime'], '水の魔法・渇きの地で水を呼ぶ・食べ物を冷やす', '青く澄んだ、しっとり冷たい結晶。'],
  ['wind', '風', ['mountain'], ['wyvern', 'eagle'], '風の魔法・帆に風を呼ぶ・風車', '緑がかった、耳を寄せると風の音がする結晶。'],
  ['earth', '土', ['cave', 'mine'], ['golem'], '土の魔法・畑を肥やす・城壁を固める', '茶色の、ずっしり重い結晶。'],
  ['light', '光', ['ruins'], ['unicorn'], '光の魔法・癒やし・亡者払いの灯り', '金色に光る、夜でも本が読める結晶。'],
  ['dark', '闇', ['demoncastle'], ['lich', 'imp', 'demonsoldier', 'demongeneral'], '闇の魔法・呪いの研究・影に隠れる', '光を吸う紫黒の結晶。長く持つと心が冷える。'],
];
for (const [k, nm, on, mons, note, desc] of ELEM) {
  A(`${k}_shard`, `${nm}の結晶のかけら`, 'element', 0.05, 8, { limit: 'vein', rare: 1, demand: 1, stack: 99, src: [S('mine', on, 0.05), S('hunt', mons, 0.15)], use: [U('magic', note), U('craft', '集めて結晶にする')], desc: `${desc}（小さなかけら）` });
  A(`${k}_crystal`, `${nm}の結晶`, 'element', 0.3, 45, { limit: 'vein', rare: 2, demand: 1, stack: 20, src: [S('mine', on, 0.005), S('hunt', mons, 0.03), S('loot', ['dungeon'], 0.03)], use: [U('magic', note), U('craft', '属性の杖・魔導具の芯'), U('trade')], desc });
  A(`${k}_crystal_large`, `${nm}の大結晶`, 'element', 2, 300, { limit: 'vein', rare: 3, demand: 0, stack: 5, src: [S('loot', ['dungeon', 'ruins', 'demoncastle'], 0.003)], use: [U('magic', `${nm}の大魔法の要`), U('collect')], desc: `人の背丈の半分ほどもある${nm}の結晶。` });
  A(`${k}_dust`, `${nm}の結晶の粉`, 'element', 0.05, 7, { demand: 1, stack: 99, make: M({ [`${k}_shard`]: 1 }, 'alchemist', 1), use: [U('magic', `${nm}の魔法薬・魔法陣`)], desc: `${nm}の結晶のかけらを砕いた粉。` });
}
// 魔法の石の加工品
A('heatstone', '火の温め石', 'magic', 2, 30, { rare: 1, demand: 1, make: M({ soapstone_raw: 1, fire_shard: 1 }, 'wizard', 4), use: [U('tool', '薪のいらない暖房・かまど'), U('luxury')], desc: '火の結晶を埋めた凍石。ひと冬じゅう温かい。' });
A('coolstone', '冷え石', 'magic', 2, 30, { rare: 1, demand: 1, make: M({ granite_raw: 1, water_shard: 1 }, 'wizard', 4), use: [U('tool', '食べ物と酒を冷やして長持ちさせる')], desc: '水の結晶を埋めた石。そばに置いた物がひんやりする。' });
A('lightstone', '灯り石', 'magic', 0.5, 25, { rare: 1, demand: 2, make: M({ crystal: 1, light_shard: 1 }, 'wizard', 3), use: [U('tool', '油のいらない灯り'), U('build', '坑道・宮殿の廊下の明かり')], desc: '光の結晶を水晶に閉じ込めた、火を使わない灯り。' });
A('windstone', '風呼び石', 'magic', 0.5, 40, { rare: 2, demand: 1, make: M({ crystal: 1, wind_shard: 2 }, 'wizard', 4), use: [U('tool', '凪の海で帆に風を呼ぶ'), U('trade')], desc: '船乗りが高く買う、風の結晶を込めた石。' });
A('barrierstone', '結界石', 'magic', 40, 400, { rare: 2, demand: 1, stack: 1, make: M({ granite_block: 1, magicstone_large: 1, light_crystal: 1 }, 'courtmage', 24), use: [U('build', '町の四隅に据えて魔物を遠ざける結界'), U('magic')], desc: '大魔石と光の結晶を埋め込んだ石柱。町を守る結界の要。' });
A('wardstone', '魔よけの石', 'magic', 1, 15, { demand: 1, make: M({ flatstone: 1, magicstone_shard: 2 }, 'priest', 2), use: [U('ritual', '家の戸口と畑の角に置く魔よけ'), U('magic')], desc: '魔石のかけらを埋めて祈りを刻んだ小石。' });
A('golemcore', 'ゴーレムの核石', 'magic', 5, 180, { limit: 'herd', rare: 3, demand: 0, stack: 5, src: [S('hunt', ['golem'], 0.3)], use: [U('magic', '石の番人を動かす研究'), U('collect')], desc: 'ゴーレムの胸にある、刻印の刻まれた魔法の石。' });
