import { A, S, U, M } from './gen_core.mjs';

// ===== ふつうの石 =====
A('gravel', '砂利', 'stone', 1.5, 0.3, { limit: 'none', demand: 1, src: [S('dig', ['rock', 'hill', 'mountain', 'river'], 0.6)], use: [U('build', '道の敷き石・版築に混ぜる'), U('craft', '漆喰・目地練りの骨材')], desc: '川原や崖の下でとれる小石の集まり。' });
A('pebble', '石ころ', 'stone', 0.3, 0.02, { limit: 'none', demand: 0, stack: 50, src: [S('gather', ['grass', 'field', 'river', 'beach', 'hill', 'rock', 'town'], 0.8), S('dig', ['field', 'farm'], 0.5)], use: [U('tool', '投石・漬け物の重し・網の錘'), U('craft', '砕いて砂利にする')], desc: 'どこにでも転がっている石。拾えば投げ石にも重しにもなる。' });
A('cobble', '丸石', 'stone', 3, 0.3, { limit: 'none', demand: 1, src: [S('gather', ['river', 'beach'], 0.6), S('dig', ['hill', 'rock'], 0.4)], use: [U('build', '石垣・石畳・かまど')], desc: '川に磨かれた握りこぶしより大きい丸い石。' });
A('riverstone', '川石', 'stone', 1, 0.1, { limit: 'none', src: [S('gather', ['river'], 0.7)], use: [U('hobby', '庭石・水石の趣味'), U('tool', '焼いて湯を沸かす焼き石')], desc: '形のよい川原の平たい石。好事家は形を競う。' });
A('stone', '石材', 'stone', 20, 3, { limit: 'vein', demand: 2, src: [S('mine', ['rock', 'mountain', 'hill'], 0.5), S('dig', ['rock'], 0.3)], use: [U('build', '家・壁・橋の石材'), U('craft', '切り石・石臼の材料')], desc: '石切り場から切り出したふつうの石材。' });
A('flatstone', '平石', 'stone', 8, 0.8, { limit: 'vein', src: [S('gather', ['river', 'rock', 'hill'], 0.3)], use: [U('build', '屋根の置き石・床・炉の敷石')], desc: '自然に平たく割れた石。' });
A('cutstone', '切り石', 'stone', 18, 6, { demand: 2, make: M({ stone: 1 }, 'mason', 2), use: [U('build', '城壁・教会・橋の角をそろえた石')], desc: '石工がのみで四角く整えた石。' });
A('rubble', '瓦礫', 'stone', 4, 0.05, { limit: 'none', demand: 0, src: [S('dig', ['town', 'ruins'], 0.8), S('gather', ['ruins'], 0.6)], use: [U('build', '石垣の裏込め・道の下地'), U('craft', '砕いて砂利にする')], desc: '崩れた家や壁のかけら。捨てずに道の下地にする。' });
A('crushedstone', '砕石', 'stone', 2, 0.4, { demand: 1, make: M({ stone: 1 }, 'mason', 1), use: [U('build', '道の路盤・目地練りの骨材')], desc: '石を割って小さくそろえたもの。' });
A('pavingstone', '敷石', 'stone', 12, 2.5, { demand: 1, make: M({ stone: 1 }, 'mason', 1), use: [U('build', '広場・街道の石畳')], desc: '石畳にするための平たく切った石。' });
A('cornerstone', '礎石', 'stone', 60, 14, { stack: 1, demand: 1, make: M({ granite_block: 2 }, 'mason', 4), use: [U('build', '柱と家の土台'), U('ritual', '建前の祈り')], desc: '柱の下に据える大きな石。家の長寿を祈って置く。' });
A('milestone', '道しるべの石', 'stone', 40, 10, { stack: 1, demand: 0, make: M({ cutstone: 1 }, 'roadworker', 3), use: [U('build', '街道の里程と行き先を刻む')], desc: '町までの道のりを刻んだ石柱。' });
A('pillar', '石柱', 'stone', 120, 30, { stack: 1, demand: 0, make: M({ cutstone: 4 }, 'mason', 8), use: [U('build', '神殿・宮殿・大広間の柱')], desc: '一本の石から削り出した柱。' });
A('stonetrough', '石の水槽', 'stone', 80, 12, { stack: 1, demand: 0, make: M({ stone: 3 }, 'mason', 6), use: [U('feed', '馬と家畜の水飲み場'), U('build', '井戸端の洗い場')], desc: '石をくりぬいた水槽。' });
A('gravestone', '墓石', 'stone', 60, 20, { stack: 1, demand: 1, make: M({ granite_block: 1 }, 'mason', 6), use: [U('ritual', '故人の名を刻んで弔う')], desc: '名と生涯を刻む墓の石。遺族が石工に頼む。' });
A('hearthstone', 'かまど石', 'stone', 10, 2, { demand: 1, make: M({ soapstone_raw: 1 }, 'mason', 2), use: [U('build', 'かまどと暖炉の内張り')], desc: '火に強い石を平たく割った、かまど用の石。' });
A('quern', 'ひき臼', 'stone', 30, 18, { stack: 1, demand: 1, make: M({ granite_block: 1 }, 'mason', 6), use: [U('tool', '家で麦や豆を粉にひく')], desc: '手で回す小さな石臼。' });
A('millstone', '石臼', 'stone', 300, 80, { stack: 1, demand: 1, make: M({ granite_block: 6 }, 'mason', 24), use: [U('build', '水車小屋・風車の粉ひき')], desc: '水車で回す大きな臼。粉屋の命。' });
A('mortar', 'すり鉢', 'stone', 4, 6, { stack: 5, demand: 1, make: M({ basalt_block: 1 }, 'mason', 3), use: [U('tool', '薬草・香辛料・顔料をすりつぶす')], desc: '石をくりぬいたすり鉢。薬師と料理人の道具。' });
A('grindwheel', '回し砥石', 'stone', 40, 20, { stack: 1, demand: 1, make: M({ sandstone_block: 1 }, 'mason', 5), use: [U('tool', '刃物と農具を研ぐ車')], desc: '回して刃を当てる丸い砥石。鍛冶屋の軒先にある。' });
A('whetstone_coarse', '荒砥', 'stone', 1, 2, { demand: 2, make: M({ sandstone_raw: 1 }, 'mason', 1), use: [U('tool', '欠けた刃を直す')], desc: '目の粗い砥石。刃こぼれを直すのに使う。' });
A('whetstone', '中砥', 'stone', 1, 4, { demand: 2, make: M({ quartzite_raw: 1 }, 'mason', 1), use: [U('tool', 'ふだんの刃物研ぎ')], desc: '剣と包丁を研ぐいちばん使う砥石。' });
A('whetstone_fine', '仕上げ砥', 'stone', 1, 10, { rare: 1, demand: 1, make: M({ slate_raw: 1 }, 'mason', 2), use: [U('tool', '剃刀のような鋭い刃に仕上げる')], desc: 'きめの細かい石から作る、刃を鏡のように仕上げる砥石。' });
A('whetstone_natural', '天然の名砥', 'stone', 1, 60, { limit: 'vein', rare: 3, demand: 0, src: [S('mine', ['mountain'], 0.005)], use: [U('tool', '名工の刀を研ぐ'), U('collect', '研ぎ師の宝')], desc: '限られた山でしか採れない、研ぎ師が一生探し求める砥石。' });

// ===== 岩の種類（原石・切り石・石板・磨き石） =====
const ROCKS = [
  // id, 名前, 場所, 原石の値, めずらしさ, 使い道の説明, 説明
  ['granite', '花崗岩', ['mountain', 'rock', 'hill'], 3, 0, '城壁・礎石・石臼', '白と黒のまだらの硬い石。城壁と石臼に使う。'],
  ['limestone', '石灰岩', ['hill', 'rock', 'cave'], 2, 0, '石灰・漆喰・教会の壁', '白っぽくやわらかい石。焼けば石灰になる。'],
  ['sandstone', '砂岩', ['desert', 'rock', 'hill'], 2, 0, '彫刻・砥石・砂漠の家', '砂が固まった石。彫りやすく、砥石にもなる。'],
  ['slate', '粘板岩', ['mountain', 'rock'], 2.5, 0, '屋根の石板・書き板・仕上げ砥', '薄くはがれる黒い石。屋根に葺けば百年もつ。'],
  ['basalt', '玄武岩', ['volcano', 'rock', 'beach'], 2.5, 0, '敷石・すり鉢・港の岸壁', '黒く重い火山の石。すり鉢や敷石になる。'],
  ['marble', '大理石', ['mountain'], 12, 1, '宮殿・神殿・彫像', '白く美しい石。王宮と神殿に使われる。'],
  ['andesite', '安山岩', ['mountain', 'volcano'], 2, 0, '石垣・敷石', '灰色の丈夫な火山の石。'],
  ['tuff', '凝灰岩', ['volcano', 'hill'], 1.5, 0, 'やわらかい壁石・蔵', '火山灰が固まった軽い石。切りやすく火に強い。'],
  ['gneiss', '片麻岩', ['mountain'], 2.5, 0, '石垣・敷石', '縞模様のある硬い石。'],
  ['quartzite', '珪岩', ['mountain', 'hill'], 3, 0, '砥石・石臼の歯', 'とても硬い石英の岩。'],
  ['serpentine', '蛇紋岩', ['mountain'], 10, 1, '飾り彫り・暖炉の飾り', '蛇の肌のような緑の模様の石。'],
  ['soapstone', '凍石', ['hill', 'mountain'], 4, 0, '鍋・かまど・小さな彫り物', 'ろうのようにやわらかく、火に強い石。'],
  ['voidrock', '魔界の黒岩', ['demoncastle'], 20, 2, '魔を通さぬ壁・闇の祭壇', '光を吸う真っ黒な石。魔力をさえぎる。'],
];
for (const [id, nm, on, v, rare, note, desc] of ROCKS) {
  const lim = 'vein';
  A(`${id}_raw`, `${nm}の原石`, 'rock', 20, v, { limit: lim, rare, demand: rare ? 1 : 2, src: [S('mine', [...on, 'mine'], rare ? 0.08 : 0.4)], use: [U('build', note), U('craft', '切り石・石板に加工する')], desc: `${desc}（掘り出したままの塊）` });
  A(`${id}_block`, `${nm}の切り石`, 'rock', 18, v * 2.2, { rare, demand: 1, make: M({ [`${id}_raw`]: 1 }, 'mason', 2), use: [U('build', note)], desc: `${nm}を四角く切りそろえた石材。` });
  A(`${id}_slab`, `${nm}の石板`, 'rock', 10, v * 1.5, { rare, demand: 1, make: M({ [`${id}_block`]: 1 }, 'mason', 2), use: [U('build', '床・壁の張り石・屋根'), U('craft', '台所の作業台')], desc: `${nm}を薄く挽いた板。` });
  A(`${id}_polished`, `磨いた${nm}`, 'rock', 10, v * 4, { rare: Math.min(4, rare + 1), demand: 0, make: M({ [`${id}_slab`]: 1, volcanicsand: 1 }, 'mason', 4), use: [U('luxury', '貴族の館の床・卓の天板'), U('build', '神殿・宮殿の飾り')], desc: `砂で鏡のように磨き上げた${nm}。` });
}
A('marble_white', '極上の白大理石', 'rock', 20, 80, { limit: 'vein', rare: 3, demand: 0, src: [S('mine', ['mountain'], 0.01)], use: [U('luxury', '王の像・大神殿の祭壇'), U('trade')], desc: '筋ひとつない純白の大理石。王家が買い占める。' });
A('limestone_powder', '石灰岩の粉', 'rock', 3, 0.5, { demand: 1, make: M({ limestone_raw: 1 }, 'mason', 1), use: [U('fertilize', '酸っぱい畑を直す'), U('craft', '硝子・釉薬の材料')], desc: '石灰岩を砕いた粉。' });
A('marble_dust', '大理石の粉', 'rock', 2, 2, { demand: 0, make: M({ marble_raw: 1 }, 'mason', 1), use: [U('build', '白く光る上等な漆喰'), U('craft', '歯磨き粉・磨き粉')], desc: '大理石を切ったときに出る白い粉。捨てずに漆喰に混ぜる。' });
A('slate_shingle', '石板の屋根板', 'rock', 2, 1, { demand: 1, make: M({ slate_raw: 1 }, 'mason', 1), use: [U('build', '燃えない屋根葺き')], desc: '粘板岩を薄くはいだ屋根の板。火事に強い。' });
A('slate_board', '書き板', 'rock', 1, 2, { demand: 1, make: M({ slate_slab: 1 }, 'mason', 1), use: [U('tool', '白墨で字を書く・子どもの手習い')], desc: '粘板岩の小さな板。学校の子どもが字を練習する。' });

// ===== 特別な石 =====
A('obsidian', '黒曜石', 'rock', 2, 4, { limit: 'vein', rare: 1, demand: 1, src: [S('mine', ['volcano'], 0.3), S('gather', ['volcano'], 0.15)], use: [U('craft', '鋭い刃・矢じり'), U('ritual', '魔よけの鏡')], desc: '火山の硝子。割ると剃刀より鋭い刃になる。' });
A('obsidian_flake', '黒曜石の刃片', 'rock', 0.1, 1, { demand: 1, make: M({ obsidian: 1 }, 'hunter', 0.5), use: [U('tool', '毛皮はぎ・外科の小刀'), U('craft', '矢じり')], desc: '黒曜石を打ち欠いた薄く鋭いかけら。' });
A('obsidian_mirror', '黒曜石の鏡', 'rock', 1.5, 30, { rare: 2, demand: 0, make: M({ obsidian: 2, volcanicsand: 1 }, 'jeweler', 8), use: [U('ritual', '占い・魔よけ'), U('collect')], desc: '磨き上げた黒い鏡。あの世が映るという。' });
A('pumice', '軽石', 'rock', 0.3, 0.3, { limit: 'none', demand: 1, src: [S('gather', ['volcano', 'beach'], 0.6)], use: [U('tool', 'かかとの角質を削る・皮なめしの磨き'), U('build', '軽い壁石')], desc: '水に浮くほど軽い穴だらけの石。' });
A('pumice_powder', '軽石の粉', 'rock', 1, 0.5, { demand: 1, make: M({ pumice: 3 }, 'mason', 1), use: [U('craft', '木工と金物の磨き粉・羊皮紙の下ごしらえ')], desc: '軽石を細かく砕いた磨き粉。' });
A('flint', '火打ち石', 'rock', 0.4, 0.5, { limit: 'none', demand: 2, src: [S('gather', ['hill', 'field', 'beach'], 0.3), S('dig', ['hill'], 0.3)], use: [U('tool', '鋼と打ち合わせて火を起こす'), U('craft', '石の刃')], desc: '鋼で打つと火花が出る硬い石。どの家にもある。' });
A('flint_flake', '火打ち石の刃片', 'rock', 0.1, 0.4, { demand: 0, make: M({ flint: 1 }, 'hunter', 0.5), use: [U('tool', '小刀・鎌の刃'), U('craft', '石の矢じり')], desc: '火打ち石を割った鋭いかけら。' });
A('chalk', '白亜', 'rock', 3, 0.3, { limit: 'none', demand: 1, src: [S('dig', ['hill', 'beach'], 0.5)], use: [U('craft', '石灰の材料'), U('fertilize', '酸っぱい畑を直す')], desc: '白くやわらかい石。崖一面が白いところもある。' });
A('chalkstick', '白墨', 'rock', 0.05, 0.1, { demand: 2, stack: 50, make: M({ chalk: 1 }, 'mason', 0.5), use: [U('tool', '書き板の字・仕立て屋と大工のしるし')], desc: '白亜を棒にしたもの。' });
A('oilshale', '油頁岩', 'rock', 5, 0.8, { limit: 'vein', src: [S('mine', ['hill', 'mine'], 0.2)], use: [U('fuel', '石炭の代わりに燃やす'), U('craft', '煮出して石蝋をとる')], desc: '油を含んで燃える黒い頁岩。' });
A('feldspar', '長石', 'rock', 3, 0.6, { limit: 'vein', src: [S('mine', ['mountain', 'mine'], 0.3)], use: [U('craft', '釉薬・磁器の材料')], desc: '白やうす紅の石。焼けばとろりとした釉になる。' });
A('quartz', '石英', 'rock', 2, 0.6, { limit: 'vein', src: [S('mine', ['mountain', 'mine', 'cave'], 0.4), S('gather', ['river'], 0.1)], use: [U('craft', '砕いて硝子と磁器の材料')], desc: '白く濁った硬い石。澄んだものは水晶と呼ぶ。' });
A('quartzpowder', '石英の粉', 'rock', 2, 1, { demand: 1, make: M({ quartz: 1 }, 'mason', 1), use: [U('craft', '硝子・磁器・釉薬の材料')], desc: '石英を砕いてふるった粉。' });
A('skystone', '浮き石', 'rock', 1, 150, { limit: 'vein', rare: 3, demand: 0, src: [S('mine', ['mountain'], 0.003), S('loot', ['ruins'], 0.01)], use: [U('magic', '空を飛ぶ船と塔の研究'), U('collect', '宙に浮く石の置き物')], desc: 'わずかに宙に浮く不思議な石。古代人は城を浮かべたという。' });
A('glowrock', '光苔岩', 'rock', 3, 3, { limit: 'vein', rare: 1, src: [S('mine', ['cave', 'dungeon'], 0.1)], use: [U('build', '坑道と地下室の明かり'), U('hobby', '夜の庭の飾り')], desc: '光る苔がびっしり生えた岩。暗がりでぼんやり青く光る。' });
A('singingstone', '鳴り石', 'rock', 2, 12, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['cave', 'mountain'], 0.02)], use: [U('hobby', '石琴という楽器になる'), U('collect')], desc: '叩くと鐘のように澄んだ音を出す石。' });
A('warmstone', '温石', 'rock', 1, 1.5, { limit: 'vein', src: [S('gather', ['volcano'], 0.2)], use: [U('tool', '焼いて布で包み、寝床と懐を温める'), U('medicine', '腹痛を温める')], desc: '熱をよく蓄える石。冬の懐の友。' });
A('lodestone', '磁石', 'rock', 1, 15, { limit: 'vein', rare: 2, demand: 1, src: [S('mine', ['mountain', 'mine'], 0.03)], use: [U('tool', '方位を知る針を作る'), U('magic', '引き合う力の研究')], desc: '鉄を引き寄せる不思議な石。船乗りが北を知るのに使う。' });
A('compassneedle', '磁針', 'stone', 0.05, 25, { rare: 1, demand: 1, make: M({ steel_wire: 1, lodestone: 1 }, 'smith', 2), use: [U('tool', '海と砂漠で北を指す')], desc: '磁石でこすった鋼の針。水に浮かべると北を向く。' });
