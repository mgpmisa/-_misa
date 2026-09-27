import { A, S, U, M } from './gen_core.mjs';

// ===== 宝石（屑石・原石・磨いた石・極上の石） =====
// id, 名前, 磨いた値, めずらしさ, 産地, 色と言い伝え
const GEMS = [
  ['ruby', '紅玉', 160, 2, ['mountain', 'mine', 'river'], '燃えるように赤い。戦士の勇気を守るという。'],
  ['sapphire', '青玉', 150, 2, ['mountain', 'mine', 'river'], '深い空の青。賢者の石と呼ばれる。'],
  ['emerald', '翠玉', 170, 2, ['mountain', 'mine'], '森の緑。恋を実らせるという。'],
  ['diamond', '金剛石', 400, 3, ['mine', 'volcano'], '何よりも硬く、光を七色に割る。'],
  ['topaz', '黄玉', 60, 1, ['mountain', 'mine'], '蜂蜜色に透き通る。旅人のお守り。'],
  ['amethyst', '紫水晶', 30, 1, ['cave', 'mountain', 'mine'], '葡萄色の水晶。酒に酔わないという。'],
  ['garnet', '柘榴石', 25, 0, ['mountain', 'river', 'mine'], '柘榴の実の赤。友情のしるし。'],
  ['opal', '蛋白石', 90, 2, ['desert', 'mine'], '虹色の火が遊ぶ乳白の石。'],
  ['aquamarine', '藍玉', 70, 1, ['mountain', 'mine'], '海の水の色。船乗りのお守り。'],
  ['peridot', '橄欖石', 35, 1, ['volcano', 'beach'], '若草色の火山の石。夜の悪夢を払う。'],
  ['skyturquoise', '碧空石', 28, 1, ['desert', 'mine'], '青緑の不透明な石。落馬を防ぐという。'],
  ['lapis', '瑠璃', 45, 1, ['mountain', 'mine'], '金の粒が星のように散る紺の石。'],
  ['jade', '翡翠', 80, 1, ['river', 'mountain'], 'しっとりとした緑の玉。長寿を授けるという。'],
  ['onyx', '縞瑪瑙', 18, 0, ['desert', 'mine'], '白と黒の縞の石。印章に彫られる。'],
  ['agate', '瑪瑙', 10, 0, ['river', 'beach', 'desert'], '年輪のような縞の石。'],
  ['jasper', '碧玉', 8, 0, ['river', 'hill'], '赤や緑の不透明な石。祈りの数珠になる。'],
  ['moonstone', '月長石', 40, 1, ['mountain', 'river'], '月の光のように青白くゆらめく石。'],
  ['sunstone', '日長石', 40, 1, ['mountain', 'volcano'], '中に金の火花が散る橙の石。'],
  ['tourmaline', '電気石', 50, 1, ['mountain', 'mine'], '温めると灰を引き寄せる色とりどりの石。'],
  ['spinel', '尖晶石', 70, 2, ['mountain', 'river'], '紅玉とまちがえられてきた赤い石。'],
  ['zircon', '風信子石', 35, 1, ['river', 'mine'], '金剛石に負けないほどきらめく石。'],
  ['catseye', '猫目石', 110, 2, ['river', 'mine'], '光の筋が猫の瞳のように動く。'],
  ['alexandrite', '変彩石', 260, 3, ['mountain', 'mine'], '昼は緑、灯りの下では赤に変わる。'],
  ['iolite', '菫青石', 30, 1, ['mountain'], '見る向きで色が変わる菫色の石。船乗りが太陽を探す。'],
  ['citrine', '黄水晶', 22, 0, ['cave', 'mountain'], '陽だまり色の水晶。商売繁盛のお守り。'],
  ['smokyquartz', '煙水晶', 14, 0, ['cave', 'mountain'], '煙を閉じ込めたような茶色の水晶。'],
  ['rosequartz', '紅水晶', 16, 0, ['cave', 'mountain'], '淡い桃色の水晶。恋のお守り。'],
  ['carnelian', '紅玉髄', 12, 0, ['river', 'desert'], '夕焼け色の石。声をよくするという。'],
  ['bloodstone', '血玉髄', 20, 1, ['river', 'hill'], '緑に赤い点の散る石。血止めのお守り。'],
  ['rainbowspar', '虹光石', 35, 1, ['mountain', 'tundra'], '傾けると青や金の光がひらめく灰色の石。'],
  ['rosestone', '薔薇石', 30, 1, ['mine', 'cave'], '薔薇の花びらのような縞の桃色の石。'],
  ['dragoneye', '竜眼石', 900, 4, ['volcano', 'dungeon'], '竜の瞳のように縦に光の筋が走る金色の石。'],
  ['startear', '星涙石', 700, 4, ['mountain', 'ruins'], '流れ星が泣いてこぼした涙という青白い石。'],
  ['spiritstone', '精霊石', 300, 3, ['forest', 'dense', 'ruins'], '精霊がまどろむという、中で光が揺れる緑の石。'],
  ['nightglow', '夜光石', 120, 2, ['cave', 'dungeon'], '昼の光を吸って夜に青く光る石。'],
  ['rainbowstone', '虹石', 350, 3, ['mountain', 'river'], '七つの色が層になった不思議な石。'],
  ['abyssstone', '深淵石', 250, 3, ['demoncastle', 'deep'], '覗くと底なしの闇に吸い込まれる黒い石。'],
];
for (const [id, nm, v, rare, on, lore] of GEMS) {
  const lim = 'vein';
  const loot = rare >= 3 ? ['dungeon', 'ruins'] : ['dungeon'];
  A(`${id}_chip`, `${nm}の屑石`, 'gem', 0.02, v * 0.08, { limit: lim, rare: Math.max(0, rare - 1), demand: 1, stack: 99, src: [S('mine', on, rare >= 3 ? 0.01 : 0.08)], use: [U('craft', '象嵌・安い装身具・研磨の粉'), U('trade')], desc: `${nm}の小さなかけら。${lore}` });
  A(`${id}_rough`, `${nm}の原石`, 'gem', 0.1, v * 0.4, { limit: lim, rare, demand: 1, stack: 50, src: [S('mine', on, rare >= 3 ? 0.001 : rare === 2 ? 0.005 : 0.02), S('loot', loot, 0.03)], use: [U('craft', '宝石職人が磨く'), U('trade')], desc: `掘り出したままの${nm}。${lore}` });
  A(id, nm, 'gem', 0.02, v, { rare, demand: 1, stack: 50, make: M({ [`${id}_rough`]: 1 }, 'jeweler', rare >= 3 ? 8 : 3), use: [U('craft', '指輪・首飾り・王冠に嵌める'), U('luxury'), U('gift')], desc: `磨き上げた${nm}。${lore}` });
  A(`${id}_flawless`, `極上の${nm}`, 'gem', 0.03, v * 6, { rare: Math.min(4, rare + 1), demand: 0, stack: 10, src: [S('loot', ['dungeon', 'demoncastle', 'pyramid'], 0.002)], make: M({ [`${id}_rough`]: 3 }, 'jeweler', 12), use: [U('collect', '王族が競って集める'), U('luxury'), U('trade')], desc: `傷ひとつない大粒の${nm}。一国の宝になる。` });
}
A('gem', '宝石', 'gem', 0.02, 80, { limit: 'vein', rare: 1, demand: 1, stack: 50, src: [S('mine', ['mine', 'mountain', 'cave'], 0.01), S('loot', ['dungeon', 'ruins', 'pyramid'], 0.1), S('trade', ['town'])], use: [U('craft', '装身具に嵌める'), U('luxury'), U('trade')], desc: '市場で出回る、いろいろな色の磨いた宝石。' });
A('star_sapphire', '星彩青玉', 'gem', 0.03, 1200, { limit: 'vein', rare: 4, demand: 0, stack: 10, src: [S('mine', ['mountain'], 0.0003), S('loot', ['dungeon'], 0.001)], use: [U('collect', '中に六つの光の星が浮かぶ'), U('luxury')], desc: '灯りをかざすと六条の星が浮かぶ青玉。' });
A('gemsand', '宝石の磨き砂', 'gem', 1, 3, { demand: 1, make: M({ garnet_chip: 3 }, 'jeweler', 1), use: [U('craft', '宝石と金物を磨く粉')], desc: '柘榴石の屑石を砕いた赤い砂。石を磨く。' });
A('diamond_dust', '金剛砂', 'gem', 0.1, 20, { rare: 2, demand: 0, make: M({ diamond_chip: 2 }, 'jeweler', 2), use: [U('craft', '硬い宝石を削る・名剣の研ぎ')], desc: '金剛石の屑を砕いた、何でも削る砂。' });

// ===== 水晶 =====
A('crystal_rough', '水晶の原石', 'crystal', 0.3, 5, { limit: 'vein', demand: 1, src: [S('mine', ['cave', 'mountain', 'mine'], 0.1)], use: [U('craft', '磨いて玉や遠見玉にする'), U('collect')], desc: '六角の柱の形をした透き通った石。' });
A('crystal_cluster', '水晶の群晶', 'crystal', 3, 40, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['cave'], 0.01)], use: [U('collect', '館の飾り'), U('magic', '場を清めるという')], desc: '無数の水晶の柱が束になって生えた塊。' });
A('crystal', '水晶', 'crystal', 0.2, 12, { demand: 1, make: M({ crystal_rough: 1 }, 'jeweler', 2), use: [U('craft', '装身具・杖の飾り'), U('magic')], desc: '磨いて透きとおらせた水晶。' });
A('crystal_ball', '水晶玉', 'crystal', 2, 90, { rare: 2, demand: 0, make: M({ crystal_rough: 5 }, 'jeweler', 24), use: [U('magic', '占い師・星読みの道具'), U('collect')], desc: '大きな水晶を何日もかけて丸く磨いた玉。' });
A('crystal_lens', '水晶の遠見玉', 'crystal', 0.1, 30, { rare: 1, demand: 1, make: M({ crystal: 1 }, 'jeweler', 6), use: [U('tool', '遠眼鏡・拡大鏡・老眼の眼鏡')], desc: 'ふくらみをつけて磨いた水晶。物が大きく見える。' });
A('rockcrystal_flawless', '極上の水晶', 'crystal', 0.5, 70, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['cave', 'mountain'], 0.005)], use: [U('collect'), U('magic', '魔導具の芯')], desc: '内に曇りも泡もない大きな水晶。' });
A('cave_pearl', '洞窟の石の玉', 'crystal', 0.05, 8, { limit: 'vein', rare: 2, demand: 0, src: [S('gather', ['cave'], 0.01)], use: [U('collect', '真珠のような石灰の玉'), U('gift')], desc: '鍾乳洞のしずくが長い年月でまるく育てた石の玉。' });
A('stalactite', '鍾乳石', 'crystal', 3, 4, { limit: 'vein', rare: 1, src: [S('mine', ['cave'], 0.1)], use: [U('hobby', '庭の置き石'), U('medicine', '砕いて骨の薬')], desc: '洞窟の天井から垂れ下がる石のつらら。' });
A('geode', '晶洞', 'crystal', 2, 15, { limit: 'vein', rare: 2, demand: 0, src: [S('dig', ['desert', 'hill'], 0.005), S('mine', ['mine'], 0.01)], use: [U('collect', '割ると中に紫水晶がびっしり'), U('gift')], desc: '丸いただの石に見えて、割ると中に結晶の洞がある。' });

// ===== 琥珀 =====
A('amber_rough', '琥珀の原石', 'amber', 0.1, 8, { limit: 'vein', rare: 1, demand: 1, src: [S('gather', ['beach'], 0.01), S('dig', ['forest', 'dense'], 0.005)], use: [U('craft', '磨いて装身具にする'), U('medicine', '焚けばよい香り')], desc: '太古の樹の脂が石になったもの。海辺に打ち上げられる。' });
A('amber', '琥珀', 'amber', 0.05, 25, { rare: 1, demand: 1, make: M({ amber_rough: 1 }, 'jeweler', 2), use: [U('luxury', '首飾り・数珠'), U('gift'), U('magic', 'こすると物を引き寄せる')], desc: '蜜色に磨いた琥珀。' });
A('amber_insect', '虫入り琥珀', 'amber', 0.05, 150, { limit: 'relic', rare: 3, demand: 0, src: [S('gather', ['beach'], 0.0005), S('dig', ['forest'], 0.0003)], use: [U('collect', '太古の虫がそのまま眠る'), U('magic', '時止めの研究')], desc: '太古の羽虫が閉じ込められた琥珀。学者も王も欲しがる。' });
A('amber_dust', '琥珀の粉', 'amber', 0.1, 5, { demand: 0, make: M({ amber_rough: 1 }, 'jeweler', 1), use: [U('craft', 'つや出しの塗り'), U('ritual', '神殿の香')], desc: '琥珀を削ったときの粉。焚けば香る。' });
