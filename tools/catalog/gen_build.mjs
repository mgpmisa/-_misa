import { A, S, U, M } from './gen_core.mjs';

// ===== 化石・古代の品 =====
const R = 'relic';
const FOS = [
  ['fossil_shell', '貝の化石', 0.3, 2, 0, ['hill', 'rock', 'beach'], 0.03, '山の上から出る貝の化石。昔ここは海だった。', [U('collect'), U('craft', '砕いて石灰にする')]],
  ['fossil_spiral', '渦巻き石', 0.5, 12, 1, ['hill', 'rock', 'beach'], 0.01, '蛇がとぐろを巻いたような太古の巻き貝の化石。', [U('collect', '好事家の棚に飾る'), U('ritual', '蛇よけのお守り')]],
  ['fossil_fish', '魚の化石', 2, 20, 1, ['hill', 'rock'], 0.008, '石板に骨の一本一本まで残る魚。', [U('collect'), U('quest', '学者が買い求める')]],
  ['fossil_leaf', '葉の化石', 0.5, 5, 0, ['hill', 'rock', 'swamp'], 0.02, '見たことのない太古の木の葉の跡。', [U('collect'), U('hobby', '押し葉の好事家が集める')]],
  ['fossil_crawler', '古代の這い虫の化石', 0.3, 18, 1, ['hill', 'rock'], 0.008, '節のある殻をもつ太古の虫の化石。', [U('collect'), U('quest', '学者の研究')]],
  ['fossil_bone', '骨の石', 5, 15, 1, ['hill', 'desert', 'rock'], 0.01, '石に変わった大きな獣の骨。', [U('collect'), U('medicine', '砕いて骨接ぎの薬'), U('craft', '彫り物')]],
  ['fossil_dragonbone', '古竜の骨の化石', 30, 400, 3, ['desert', 'mountain'], 0.0005, '家よりも大きな太古の竜の骨。', [U('collect', '王立の学舎に飾る'), U('magic', '竜の力の研究'), U('medicine', '竜骨の妙薬')]],
  ['fossil_dragontooth', '竜の歯の化石', 1, 80, 2, ['desert', 'mountain', 'hill'], 0.002, '短剣ほどもある太古の竜の牙。', [U('medicine', '削って心を鎮める竜骨の薬'), U('collect'), U('craft', '魔よけの短剣の柄')]],
  ['fossil_egg', '卵の化石', 3, 60, 2, ['desert', 'hill'], 0.002, '石になった巨大な卵。何の卵かは誰も知らない。', [U('collect'), U('ritual', '子宝のお守り')]],
  ['fossil_footprint', '足跡の石板', 25, 35, 2, ['hill', 'river', 'rock'], 0.002, '巨大な三本指の足跡が残る石板。', [U('collect'), U('build', '広場の見世物')]],
  ['fossil_feather', '羽の化石', 0.3, 45, 2, ['hill', 'rock'], 0.002, '羽の生えた小さな竜の化石。', [U('collect'), U('quest', '学者の研究')]],
  ['fossil_coral', '珊瑚の化石', 2, 3, 0, ['hill', 'beach', 'rock'], 0.03, '山から出る石の珊瑚。', [U('build', '砕いて石灰'), U('collect')]],
  ['fossil_seaurchin', '石の海胆', 0.2, 4, 0, ['hill', 'beach'], 0.02, '五つの筋が星のように走る丸い化石。', [U('ritual', '雷よけのお守り'), U('collect')]],
  ['petrifiedwood', '珪化木', 10, 15, 1, ['desert', 'hill'], 0.01, '木目も年輪もそのまま石になった木。', [U('collect'), U('craft', '磨いて卓や飾り')]],
];
for (const [id, nm, w, v, rare, on, rate, desc, use] of FOS) {
  A(id, nm, 'fossil', w, v, { limit: R, rare, demand: 0, src: [S('dig', on, rate), S('mine', ['mine'], rate)], use, desc });
}
const OLD = [
  ['potsherd', '古代の土器片', 0.2, 1, 0, '縄の模様の残る古い土器のかけら。', [U('collect'), U('quest', '学者が年代を調べる'), U('craft', '砕いて焼き物の骨材')]],
  ['ancient_tileshard', '古代の瓦片', 0.5, 2, 0, '古代の都の屋根瓦のかけら。紋が押されている。', [U('collect'), U('quest', '古い都の場所の手がかり')]],
  ['ancient_mosaic', '古代の色石の敷き片', 2, 25, 1, '小さな色石を並べて絵を描いた床のかけら。', [U('collect'), U('luxury', '館の壁に飾る')]],
  ['stone_arrowhead', '古代の石の矢じり', 0.02, 3, 0, '遠い昔の狩人が作った石の矢じり。', [U('collect'), U('ritual', '魔よけ')]],
  ['stone_axehead', '古代の石斧の刃', 1, 5, 0, '磨き上げられた緑の石の斧の刃。', [U('collect'), U('ritual', '雷の神の斧と呼ばれる')]],
  ['ancient_bead', '古代の玉', 0.02, 15, 1, '穴のあいた勾玉や管玉。首飾りだったもの。', [U('collect'), U('luxury')]],
  ['runestone', '刻印石', 50, 60, 2, '古代の文字がびっしり刻まれた立石。', [U('quest', '学者が読み解く'), U('magic', '失われた術の手がかり'), U('collect')]],
  ['ancient_tablet', '古代の碑文の石板', 8, 80, 2, '古い王国の法や物語が刻まれた石板。', [U('quest', '歴史を知る手がかり'), U('collect')]],
  ['stone_idol', '小さな石の像', 1.5, 30, 1, '忘れられた神を刻んだ手のひらほどの像。', [U('ritual', '古い神を祀る'), U('collect')]],
  ['ancient_brick', '古代の煉瓦', 4, 4, 0, '銘の刻まれた古い焼き煉瓦。いまの煉瓦より硬い。', [U('build', '記念の建物に使う'), U('collect')]],
];
for (const [id, nm, w, v, rare, desc, use] of OLD) {
  A(id, nm, 'antique', w, v, { limit: R, rare, demand: 0, src: [S('dig', ['ruins', 'hill', 'desert', 'field'], rare ? 0.005 : 0.03), S('loot', ['ruins', 'pyramid', 'dungeon'], rare ? 0.02 : 0.1)], use, desc });
}

// ===== 石灰・漆喰・煉瓦・瓦 =====
A('quicklime', '生石灰', 'lime', 3, 1.5, { demand: 1, make: M({ limestone_raw: 1, coal: 1 }, 'mason', 6), use: [U('craft', '水をかけて消石灰にする'), U('fertilize', '畑の酸を抜く')], desc: '石灰岩を焼いた白い塊。水をかけると熱を出す。' });
A('slakedlime', '消石灰', 'lime', 3, 1.8, { demand: 2, make: M({ quicklime: 1, freshwater: 1 }, 'mason', 1), use: [U('build', '漆喰・目地練りの材料'), U('medicine', '疫病のあとの消毒'), U('fertilize')], desc: '生石灰に水をかけた白い粉。' });
A('limemortar', '石灰の目地練り', 'lime', 5, 2, { demand: 2, make: M({ slakedlime: 1, riversand: 2 }, 'mason', 1), use: [U('build', '石と煉瓦を積むつなぎ')], desc: '消石灰に川砂を混ぜた、石を積むつなぎ。' });
A('plaster', '漆喰', 'lime', 4, 3, { demand: 2, make: M({ slakedlime: 2, straw: 1 }, 'mason', 1), use: [U('build', '白い壁・火に強い蔵の壁')], desc: '消石灰に藁のすさを混ぜた、白壁の塗り。' });
A('plaster_fine', '上塗りの漆喰', 'lime', 4, 8, { rare: 1, demand: 1, make: M({ slakedlime: 1, marble_dust: 1 }, 'mason', 2), use: [U('build', '宮殿の壁・壁画の下地'), U('luxury')], desc: '大理石の粉を混ぜた、磨くと光る漆喰。' });
A('pozzolana', '火山灰の練り土', 'lime', 5, 3, { demand: 1, make: M({ volcanicash: 2, slakedlime: 1 }, 'mason', 1), use: [U('build', '港の岸壁・橋脚・水道（水の中でも固まる）')], desc: '火山灰と石灰を練った、水の中でも固まる練り土。' });
A('burnt_gypsum', '焼き石膏', 'lime', 2, 2, { demand: 1, make: M({ gypsum: 1 }, 'mason', 2), use: [U('medicine', '折れた骨を固める'), U('craft', '像や飾りの型取り')], desc: '石膏を焼いた粉。水で練るとすぐ固まる。' });
A('adobe', '日干し煉瓦', 'brick', 4, 0.3, { demand: 2, make: M({ adobemix: 1 }, 'mason', 1), use: [U('build', '雨の少ない土地の家・塀')], desc: '練り土を型に詰めて天日で干した煉瓦。' });
A('brick', '焼き煉瓦', 'brick', 3, 1, { demand: 2, make: M({ clay: 1, coal: 1 }, 'potter', 2), use: [U('build', '家・かまど・煙突・城壁')], desc: '粘土を窯で焼いた赤い煉瓦。' });
A('brick_red', '赤煉瓦', 'brick', 3, 1.4, { demand: 1, make: M({ redclay: 1, coal: 1 }, 'potter', 2), use: [U('build', '美しい赤い壁・町の役所')], desc: '赤粘土を焼いた、色の冴えた煉瓦。' });
A('firebrick', '耐火煉瓦', 'brick', 3.5, 3, { demand: 1, make: M({ fireclay: 1, coal: 1 }, 'potter', 3), use: [U('build', '鍛冶炉・パン窯・溶鉱炉の内張り')], desc: '火に強い粘土で焼いた、白っぽい煉瓦。' });
A('brick_glazed', '化粧煉瓦', 'brick', 3, 5, { rare: 1, demand: 0, make: M({ brick: 1, glaze: 1 }, 'potter', 2), use: [U('build', '神殿と城門の色鮮やかな壁'), U('luxury')], desc: '釉をかけて焼いた青や金の煉瓦。' });
A('brick_dark', '魔界の黒煉瓦', 'brick', 3, 6, { rare: 1, demand: 0, make: M({ cursedsoil: 1, coal: 1 }, 'potter', 3), use: [U('build', '魔を寄せつけない牢・魔導の塔')], desc: '魔界の土で焼いた黒い煉瓦。魔力を吸う。' });
A('rooftile', '瓦', 'tile', 2, 0.8, { demand: 2, make: M({ clay: 1 }, 'potter', 1), use: [U('build', '燃えない屋根')], desc: '粘土を焼いた屋根の瓦。' });
A('rooftile_glazed', '釉瓦', 'tile', 2, 4, { rare: 1, demand: 0, make: M({ rooftile: 1, glaze: 1 }, 'potter', 2), use: [U('build', '王宮と神殿の屋根'), U('luxury')], desc: '青や緑の釉をかけて光る瓦。' });
A('floortile', '敷き瓦', 'tile', 2, 1, { demand: 1, make: M({ clay: 1 }, 'potter', 1), use: [U('build', '台所・浴場の床')], desc: '床に敷く平たい焼き物の板。' });
A('tile_painted', '絵付けの陶板', 'tile', 1, 10, { rare: 1, demand: 0, make: M({ floortile: 1, cobaltblue: 1 }, 'potter', 3), use: [U('build', '館の壁の飾り'), U('luxury')], desc: '青い顔料で花や鳥を描いた陶板。' });
A('glaze', '釉薬', 'tile', 1, 3, { demand: 1, make: M({ feldspar: 1, quartzpowder: 1, limestone_powder: 1 }, 'potter', 2), use: [U('craft', '器と瓦にかけてつやを出す・水を通さなくする')], desc: '焼くと硝子になって器を覆う、石の粉の泥。' });
A('crucible', 'るつぼ', 'tile', 2, 8, { demand: 1, make: M({ fireclay: 1, graphite: 1 }, 'potter', 3), use: [U('tool', '金銀と薬を溶かす器')], desc: '耐火粘土と石墨で作った、金属を溶かす器。' });
A('castmold', '鋳型', 'tile', 5, 3, { demand: 1, make: M({ moldsand: 2 }, 'smith', 2), use: [U('tool', '鍋・鐘・活字を流し込む型')], desc: '鋳物砂で作った、溶けた金属を流す型。' });

// ===== 硝子 =====
A('glass_raw', '粗硝子', 'glass', 2, 3, { demand: 1, make: M({ sand: 2, natron: 1, limestone_powder: 1 }, 'glassmaker', 4), use: [U('craft', '吹いて瓶・器にする')], desc: '砂と曹達を溶かした、緑がかった泡まじりの硝子。' });
A('glass', '透明硝子', 'glass', 2, 8, { rare: 1, demand: 1, make: M({ quartzsand: 2, natron: 1, pyrolusite: 1 }, 'glassmaker', 6), use: [U('craft', '杯・瓶・遠見玉'), U('luxury')], desc: '珪砂と色消しの石で作った、澄んだ硝子。' });
A('windowglass', '窓硝子', 'glass', 3, 12, { rare: 1, demand: 1, make: M({ glass: 1 }, 'glassmaker', 3), use: [U('build', '明るい窓（裕福な家・教会）')], desc: '吹いて開いて平たくした窓の硝子板。' });
A('leadglass', '玻璃', 'glass', 2, 25, { rare: 2, demand: 0, make: M({ quartzsand: 2, lead: 1, natron: 1 }, 'glassmaker', 8), use: [U('luxury', '光を虹に割る杯と燭台の飾り'), U('craft', 'まがい物の宝石')], desc: '鉛を混ぜた、重くよくきらめく硝子。' });
const GLASS = [
  ['blue', '青', { quartzsand: 2, natron: 1, cobalt_ore: 1 }, '空の青。'],
  ['red', '赤', { quartzsand: 2, natron: 1, gold_powder: 1 }, '金を溶かして出す、深い紅。いちばん高い。'],
  ['green', '緑', { sand: 2, natron: 1, copper_powder: 1 }, '銅で染めた若葉の緑。'],
  ['purple', '紫', { sand: 2, natron: 1, pyrolusite: 1 }, '満俺で染めた菫の紫。'],
  ['yellow', '黄', { sand: 2, natron: 1, antimony: 1 }, '安母尼で染めた黄金の色。'],
];
for (const [k, nm, from, d] of GLASS) {
  A(`glass_${k}`, `${nm}硝子`, 'glass', 2, k === 'red' ? 60 : 15, { rare: 1, demand: 0, make: M(from, 'glassmaker', 6), use: [U('craft', '色硝子の窓・器・硝子玉'), U('luxury')], desc: `色をつけた硝子。${d}` });
}
A('stainedglass', '色硝子の窓', 'glass', 8, 150, { rare: 2, demand: 0, stack: 1, make: M({ glass_blue: 1, glass_red: 1, glass_green: 1, glass_yellow: 1, lead_sheet: 1 }, 'glassmaker', 48), use: [U('build', '教会と王宮の窓'), U('luxury')], desc: '色硝子を鉛の枠でつないで聖者や物語を描いた窓。' });
A('glassbead', '硝子玉', 'glass', 0.01, 0.5, { demand: 1, stack: 99, make: M({ glass_raw: 1 }, 'glassmaker', 2), use: [U('craft', '首飾り・刺繍の飾り'), U('trade', '奥地の民との取り引き'), U('gift')], desc: '色とりどりの小さな硝子の玉。' });
A('glasslens', '硝子の遠見玉', 'glass', 0.1, 15, { rare: 1, demand: 1, make: M({ glass: 1 }, 'glassmaker', 4), use: [U('tool', '拡大鏡・眼鏡・遠眼鏡')], desc: 'ふくらみをつけて磨いた硝子。水晶より安い。' });
A('cullet', '硝子くず', 'glass', 1, 0.5, { limit: 'none', demand: 0, src: [S('gather', ['town', 'ruins'], 0.1)], use: [U('craft', '溶かしてまた硝子にする')], desc: '割れた瓶や窓のかけら。拾い集めて溶かし直す。' });
A('seaglass', '浜辺の硝子', 'glass', 0.02, 0.5, { limit: 'none', demand: 0, src: [S('gather', ['beach'], 0.05)], use: [U('collect', '波に丸められた色硝子'), U('hobby', '子どもの宝物')], desc: '波に角を削られた曇り硝子のかけら。' });

// ===== 顔料 =====
const PIG = [
  ['yellowochre', '黄土の顔料', 1, M({ loess: 2, freshwater: 1 }, 'painter', 1), '黄土色', '黄土を水にさらして細かい粒だけ集めた顔料。'],
  ['redochre', '弁柄', 1.5, M({ hematite: 1 }, 'painter', 2), '赤茶', '赤鉄鉱を焼いて砕いた赤。家の柱や船を塗る。'],
  ['greenearth', '緑土', 1.5, M({ clay: 2 }, 'painter', 2), 'くすんだ緑', '緑色の粘土から集めた顔料。'],
  ['umber', '焦茶土', 1.2, M({ redsoil: 2, freshwater: 1 }, 'painter', 1), '焦げ茶', '赤土から集めた焦げ茶の顔料。'],
  ['ultramarine', '群青', 60, M({ lapis: 1 }, 'painter', 12), '深い青', '瑠璃を砕いて何度もさらした、金より尊い青。聖女の衣に使う。'],
  ['azureblue', '岩群青', 20, M({ azurite: 1 }, 'painter', 4), '明るい青', '藍銅鉱を砕いた青。'],
  ['malachitegreen', '岩緑青', 16, M({ malachite: 1 }, 'painter', 4), '鮮やかな緑', '孔雀石を砕いた緑。'],
  ['vermilion', '朱', 30, M({ cinnabar: 1 }, 'painter', 4), '朱色', '辰砂を砕いた朱。神殿の柱と印に使う。'],
  ['whitelead', '鉛白', 6, M({ lead_sheet: 1, vinegar: 1 }, 'painter', 24), '白', '鉛を酢で錆びさせた白。白粉にもなるが毒。'],
  ['redlead', '鉛丹', 5, M({ lead: 1 }, 'painter', 6), '橙', '鉛を焼いた橙色。鉄の錆止めに塗る。'],
  ['orpimentyellow', '雌黄の顔料', 14, M({ orpiment: 1 }, 'painter', 3), '金色の黄', '雌黄を砕いた黄色。写本の金の代わり。'],
  ['cobaltblue', '呉須', 12, M({ cobalt_ore: 1, clay: 1 }, 'potter', 4), '藍色', '焼き物の絵付けに使う青い顔料。'],
  ['chalkwhite', '白亜の粉', 0.5, M({ chalk: 1 }, 'painter', 1), '白', '白亜をすり潰した白。壁の下塗り。'],
  ['mineralblack', '石墨の黒', 1, M({ graphite: 1 }, 'painter', 1), '黒', '石墨を砕いた、鈍く光る黒。'],
  ['gold_paint', '金泥', 200, M({ gold_powder: 1 }, 'painter', 4), '金', '金粉を膠で溶いた絵の具。写本と聖画の光輪に。'],
];
for (const [id, nm, v, make, col, desc] of PIG) {
  A(id, nm, 'pigment', 0.2, v, { rare: v >= 20 ? 2 : v >= 5 ? 1 : 0, demand: v >= 20 ? 0 : 1, stack: 50, make, use: [U('dye', `${col}の絵の具・壁の塗り・染め`), ...(v >= 20 ? [U('luxury')] : [])], desc });
}

// ===== 薬や染めに使う石の薬品 =====
A('green_vitriol', '緑礬', 'mineral', 0.5, 2, { demand: 1, make: M({ pyrite: 2, freshwater: 1 }, 'alchemist', 4), use: [U('dye', '黒い染めと墨（没食子と合わせる）'), U('medicine', '貧血の薬')], desc: '黄鉄鉱を風に当ててとる緑の結晶。' });
A('blue_vitriol', '胆礬', 'mineral', 0.5, 4, { demand: 1, make: M({ copper_scrap: 1, sulfur: 1 }, 'alchemist', 4), use: [U('medicine', 'かびと虫を殺す'), U('craft', '葡萄畑の病よけ')], desc: '青く透き通った銅の結晶。' });
A('vitriol_oil', '礬油', 'mineral', 1, 15, { rare: 1, demand: 0, stack: 10, make: M({ green_vitriol: 3 }, 'alchemist', 8), use: [U('magic', '金属を溶かす錬金の強い水'), U('craft', '金と銀の見分け')], desc: '緑礬を蒸して取る、何でも溶かす恐ろしい液。' });
A('flux', '融剤', 'mineral', 1, 2, { demand: 1, make: M({ limestone_powder: 1, fluorite: 1 }, 'smith', 1), use: [U('craft', '炉で鉱滓を流れやすくする')], desc: '石灰と蛍石を混ぜた、鉱石を溶けやすくする粉。' });
A('polishpowder', '磨き粉', 'mineral', 1, 1, { demand: 1, make: M({ pumice_powder: 1, chalkwhite: 1 }, 'alchemist', 1), use: [U('tool', '銀器・鎧・鍋を磨く')], desc: '軽石と白亜を合わせた、金物を光らせる粉。' });
A('toothpowder', '歯磨きの粉', 'mineral', 0.2, 1, { demand: 1, make: M({ chalkwhite: 1, finesalt: 1 }, 'alchemist', 1), use: [U('medicine', '歯を白く保つ'), U('luxury')], desc: '白亜の粉に焼き塩を混ぜた歯磨き。' });
