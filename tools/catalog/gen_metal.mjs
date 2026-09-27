import { A, S, U, M } from './gen_core.mjs';

// ===== 金属の鉱石（貧鉱・鉱石・富鉱・砕いた鉱石・洗った鉱石） =====
// key, 金属名, 鉱石のid頭, 場所, 鉱石の値, めずらしさ, 鉱石の説明
const ORES = [
  ['iron', '鉄', 'ore', ['mountain', 'hill', 'rock', 'mine'], 5, 0, '赤茶けた重い石。鉄の多くはこれから作る。'],
  ['copper', '銅', 'copper_ore', ['mountain', 'hill', 'mine'], 4, 0, '緑や青のしみが浮いた石。銅がとれる。'],
  ['tin', '錫', 'tin_ore', ['mountain', 'river', 'mine'], 6, 1, '黒く重い石。青銅に欠かせない錫がとれる。'],
  ['lead', '鉛', 'lead_ore', ['mountain', 'hill', 'mine'], 3, 0, '銀色に光る四角い結晶の石。鉛と少しの銀がとれる。'],
  ['zinc', '亜鉛', 'zinc_ore', ['mountain', 'mine'], 4, 1, '褐色の石。銅と合わせると真鍮になる。'],
  ['silver', '銀', 'silver_ore', ['mountain', 'mine', 'cave'], 18, 1, '黒い筋に銀が光る石。'],
  ['gold', '金', 'gold_ore', ['mountain', 'river', 'mine'], 45, 2, '白い石英に金の粒が走る石。'],
  ['platinum', '白金', 'platinum_ore', ['river', 'mountain', 'mine'], 70, 2, '川砂にまじる重い灰色の粒。溶かすのが難しい。'],
  ['mithril', 'ミスリル', 'mithril_ore', ['mountain', 'mine', 'dungeon'], 180, 3, '青白く光る石。ドワーフが命がけで掘る。'],
  ['adamantite', 'アダマンタイト', 'adamantite_ore', ['mountain', 'mine', 'dungeon'], 240, 3, '黒紫の、つるはしが欠けるほど硬い石。'],
  ['orichalcum', 'オリハルコン', 'orichalcum_ore', ['ruins', 'deep', 'dungeon'], 380, 4, '赤金色にかがやく伝説の鉱石。古代の都の跡にだけ眠る。'],
];
const GRADE_LIMIT = 'vein';
for (const [key, mn, oid, on, v, rare, desc] of ORES) {
  const minePlaces = on;
  A(`${oid}_poor`, `${mn}の貧鉱`, 'ore', 5, v * 0.45, { limit: GRADE_LIMIT, rare, demand: 1, src: [S('mine', minePlaces, rare ? 0.1 : 0.5)], use: [U('craft', `${mn}が少ない。多く集めて砕けば${mn}がとれる`), U('build', '石垣の石')], desc: `${mn}の少ない鉱石。捨て石と紙一重。` });
  A(oid, key === 'iron' ? '鉄鉱石' : `${mn}鉱石`, 'ore', 5, v, { limit: GRADE_LIMIT, rare, demand: key === 'iron' ? 2 : 1, src: [S('mine', minePlaces, rare ? 0.05 : 0.35)], use: [U('craft', `砕いて洗い、炉で溶かして${mn}にする`), U('trade')], desc });
  A(`${oid}_rich`, `${mn}の富鉱`, 'ore', 5, v * 2.2, { limit: GRADE_LIMIT, rare: Math.min(4, rare + 1), demand: 1, src: [S('mine', minePlaces, rare ? 0.01 : 0.08)], use: [U('craft', `${mn}をたっぷり含む。少ない手間で${mn}になる`), U('trade', '鉱夫の誇り')], desc: `${mn}がぎっしり詰まった上等な鉱石。` });
  A(`${oid}_crushed`, `砕いた${mn}鉱石`, 'ore', 5, v * 1.1, { demand: 1, make: M({ [oid]: 1 }, 'miner', 1), use: [U('craft', '水で洗って石を除く')], desc: `${mn}鉱石を槌で砕いたもの。` });
  A(`${oid}_washed`, `洗った${mn}鉱石`, 'ore', 3, v * 1.35, { demand: 1, make: M({ [`${oid}_crushed`]: 1, freshwater: 2 }, 'miner', 1), use: [U('craft', `炉で溶かして${mn}にする`)], desc: `砕いた${mn}鉱石を水で洗い、重い粒だけ残したもの。` });
}

// ===== 特別な鉱物・鉱石 =====
const V = 'vein';
A('hematite', '赤鉄鉱', 'ore', 5, 6, { limit: V, src: [S('mine', ['mountain', 'hill', 'mine'], 0.2)], use: [U('craft', '上等な鉄の鉱石'), U('dye', '砕けば弁柄の赤')], desc: '血のように赤い粉を出す鉄の鉱石。' });
A('magnetite', '磁鉄鉱', 'ore', 5, 7, { limit: V, src: [S('mine', ['mountain', 'mine'], 0.15)], use: [U('craft', '鉄を多く含む黒い鉱石'), U('tool', 'まれに磁石になる')], desc: '鉄を引きつける黒い鉱石。' });
A('bogiron', '沼鉄鉱', 'ore', 4, 2, { limit: V, demand: 1, src: [S('dig', ['swamp', 'lake'], 0.25)], use: [U('craft', '村の鍛冶屋が溶かす手近な鉄のもと')], desc: '沼の底に固まる茶色い塊。鉱山のない村の鉄のもと。' });
A('ironsand', '砂鉄', 'ore', 4, 3, { limit: 'none', demand: 1, src: [S('dig', ['river', 'beach'], 0.3), S('gather', ['river'], 0.2)], use: [U('craft', 'たたら吹きで玉鋼を作る')], desc: '川や浜の黒い砂。磁石で集める。' });
A('pyrite', '黄鉄鉱', 'ore', 2, 1.5, { limit: V, src: [S('mine', ['mountain', 'mine', 'cave'], 0.2)], use: [U('tool', '火打ち石と打てば火花'), U('collect', '愚か者の金と呼ばれる金色の立方体'), U('craft', '硫黄と緑礬のもと')], desc: '金そっくりに光る石。新米の鉱夫がよくだまされる。' });
A('malachite', '孔雀石', 'ore', 2, 12, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.06)], use: [U('craft', '銅の鉱石'), U('dye', '岩緑青の顔料'), U('luxury', '縞模様の飾り石')], desc: '孔雀の羽のような緑の縞の石。' });
A('azurite', '藍銅鉱', 'ore', 2, 14, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.05)], use: [U('dye', '岩群青の青い顔料'), U('craft', '銅の鉱石')], desc: '深い青の銅の鉱石。画家が欲しがる。' });
A('native_copper', '自然銅', 'ore', 1, 9, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.03), S('gather', ['river'], 0.01)], use: [U('craft', '溶かさずそのまま叩いて使える銅'), U('collect')], desc: '石の中から出た、赤い銅そのままの塊。' });
A('cassiterite_sand', '川の錫砂', 'ore', 4, 5, { limit: 'none', rare: 1, src: [S('dig', ['river'], 0.08)], use: [U('craft', '洗って溶かせば錫')], desc: '川底にたまる黒く重い錫の砂。' });
A('silver_galena', '銀を含む方鉛鉱', 'ore', 5, 12, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.06)], use: [U('craft', '鉛を溶かしたあと灰吹きで銀をとる')], desc: '銀を多く含む鉛の鉱石。' });
A('native_silver', '自然銀', 'ore', 0.5, 70, { limit: V, rare: 2, src: [S('mine', ['mine', 'cave'], 0.01)], use: [U('craft', 'そのまま溶かせる銀'), U('collect', '針金のようにねじれた銀の木')], desc: '岩のすきまに樹のように伸びた銀。' });
A('gold_dust', '砂金', 'ore', 0.1, 12, { limit: 'vein', rare: 1, demand: 1, stack: 99, src: [S('gather', ['river'], 0.02)], use: [U('craft', '溶かして金にする'), U('trade')], desc: '川底の砂を椀でゆすってとる金の粒。' });
A('gold_nugget', '金塊', 'ore', 0.3, 280, { limit: 'vein', rare: 3, src: [S('mine', ['mine', 'mountain'], 0.003), S('gather', ['river'], 0.001)], use: [U('trade'), U('collect', '見つけた者は一夜で金持ち')], desc: '親指ほどの金そのものの塊。' });
A('gold_quartz', '金を含む石英', 'ore', 4, 30, { limit: V, rare: 2, src: [S('mine', ['mine', 'mountain'], 0.02)], use: [U('craft', '砕いて水銀で金を集める'), U('collect')], desc: '白い石英に金の筋が走る石。' });
A('cinnabar', '辰砂', 'ore', 2, 20, { limit: V, rare: 2, src: [S('mine', ['volcano', 'mine'], 0.03)], use: [U('craft', '焼いて水銀をとる'), U('dye', '朱の顔料'), U('ritual', '魔よけの朱')], desc: '鮮やかな朱色の石。触れすぎると毒。' });
A('stibnite', '輝安鉱', 'ore', 3, 10, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.04)], use: [U('craft', '活字の合金・黄色い硝子'), U('luxury', '目のふちの黒い化粧墨')], desc: '剣のように尖った銀色の結晶の束。' });
A('bismuth_ore', '蒼鉛鉱', 'ore', 3, 10, { limit: V, rare: 1, src: [S('mine', ['mountain', 'mine'], 0.03)], use: [U('craft', '低い熱で溶ける蒼鉛の材料')], desc: '溶かして冷やすと虹色の階段のような結晶になる。' });
A('orpiment', '雌黄', 'ore', 1, 12, { limit: V, rare: 1, demand: 0, src: [S('mine', ['volcano', 'mine'], 0.04)], use: [U('dye', '金色に近い黄色の顔料'), U('craft', '鼠や虫を殺す毒')], desc: '金のように黄色い石。猛毒を含む。' });
A('realgar', '鶏冠石', 'ore', 1, 10, { limit: V, rare: 1, demand: 0, src: [S('mine', ['volcano', 'mine'], 0.04)], use: [U('dye', '赤橙の顔料'), U('ritual', '虫よけ・魔よけの酒に一つまみ')], desc: '鶏のとさかのような赤い石。毒がある。' });
A('pyrolusite', '軟満俺鉱', 'ore', 3, 4, { limit: V, src: [S('mine', ['mountain', 'mine'], 0.1)], use: [U('craft', '硝子の濁りを消す・紫の硝子'), U('dye', '黒い顔料')], desc: '指が黒くなる黒い石。硝子職人の秘薬。' });
A('cobalt_ore', '輝青鉱', 'ore', 3, 16, { limit: V, rare: 2, src: [S('mine', ['mountain', 'mine'], 0.02)], use: [U('dye', '呉須の青（器の絵付け）'), U('craft', '青い硝子')], desc: '焼くと深い青を出す鉱石。鉱夫は「小鬼の石」と呼ぶ。' });
A('graphite', '石墨', 'ore', 2, 3, { limit: V, src: [S('mine', ['mountain', 'mine'], 0.1)], use: [U('tool', '書き物の芯・金型の滑り'), U('craft', 'るつぼの材料')], desc: '紙に黒くこすれるやわらかい石。' });
A('sulfur', '硫黄', 'ore', 1, 1.5, { limit: 'none', demand: 1, src: [S('gather', ['volcano'], 0.4), S('mine', ['volcano'], 0.3)], use: [U('medicine', '肌の病の塗り薬'), U('craft', 'つけ木・燻して虫よけ・火薬'), U('magic', '火の錬金')], desc: '火山の口にたまる黄色い石。燃やすと鼻をつく煙が出る。' });
A('sulfur_flower', '硫黄の華', 'ore', 0.2, 3, { demand: 1, make: M({ sulfur: 2 }, 'alchemist', 2), use: [U('medicine', '皮膚病・疥癬の薬'), U('magic')], desc: '硫黄を熱して冷やした、花のように細かい黄色の粉。' });
A('saltpeter', '硝石', 'ore', 1, 3, { limit: 'vein', demand: 1, src: [S('gather', ['cave', 'desert'], 0.2)], use: [U('craft', '肉の塩漬けを赤く保つ・火薬の材料'), U('tool', '水を冷やす')], desc: '洞窟の壁に白くふく塩。' });
A('saltpeter_refined', '精製した硝石', 'ore', 1, 6, { demand: 1, make: M({ nitersoil: 3, freshwater: 2 }, 'alchemist', 3), use: [U('craft', '火薬・花火・肉の塩漬け'), U('magic', '爆ぜる魔法薬')], desc: '硝石土を水で煮出して結晶にした、白い硝石。' });
A('alum', '明礬', 'ore', 1, 2, { limit: 'vein', demand: 1, src: [S('gather', ['volcano'], 0.2), S('mine', ['mine'], 0.1)], use: [U('dye', '染め物の色止め'), U('craft', '皮なめし'), U('medicine', '血止め')], desc: '温泉の周りでとれる白い結晶。染め屋の必需品。' });
A('burnt_alum', '焼き明礬', 'ore', 0.5, 3, { make: M({ alum: 1 }, 'alchemist', 1), use: [U('medicine', '汗止め・傷の血止め'), U('food', 'なすの漬け物の色止め')], desc: '明礬を焼いて水を飛ばした粉。' });
A('borax', '硼砂', 'ore', 1, 6, { limit: 'vein', rare: 1, src: [S('gather', ['desert', 'lake'], 0.05)], use: [U('craft', '金銀のろう付け・釉薬'), U('medicine', '口の中の傷の薬')], desc: '干上がった湖のほとりの白い結晶。' });
A('natron', '天然の曹達', 'ore', 1, 1.5, { limit: 'vein', src: [S('gather', ['desert', 'lake'], 0.2)], use: [U('craft', '硝子・石けんの材料'), U('ritual', '亡骸を清める')], desc: '乾いた塩湖に白く積もる粉。硝子づくりに欠かせない。' });
A('gypsum', '石膏', 'ore', 3, 0.8, { limit: V, src: [S('mine', ['desert', 'cave', 'mine'], 0.3)], use: [U('craft', '焼いて焼き石膏にする'), U('fertilize', '塩の強い畑を直す')], desc: '爪で傷がつくやわらかい白い石。' });
A('alabaster', '雪花石膏', 'ore', 5, 8, { limit: V, rare: 1, src: [S('mine', ['desert', 'cave'], 0.05)], use: [U('craft', '透ける灯り皿・彫り物'), U('luxury')], desc: '光を透かす白い石膏。灯りを入れると柔らかく光る。' });
A('selenite', '透石膏', 'ore', 1, 5, { limit: V, rare: 1, src: [S('mine', ['cave', 'desert'], 0.04)], use: [U('build', '小窓の明かり取り'), U('collect', '月の石と呼ばれる')], desc: '板のように透き通った石膏の結晶。' });
A('mica', '雲母', 'ore', 0.5, 2, { limit: V, src: [S('mine', ['mountain', 'mine'], 0.15)], use: [U('build', '角灯とかまどののぞき窓'), U('craft', 'きらきら光る化粧と絵の具')], desc: '薄く薄くはがれて透き通る石。' });
A('talc', '滑石', 'ore', 2, 1, { limit: V, src: [S('mine', ['hill', 'mine'], 0.2)], use: [U('medicine', '天花粉・あせも'), U('tool', '仕立て屋のしるし付け'), U('craft', '石けんに混ぜる')], desc: 'すべすべした、いちばんやわらかい石。' });
A('firewool', '石の綿', 'ore', 0.5, 12, { limit: V, rare: 2, src: [S('mine', ['mountain', 'mine'], 0.02)], use: [U('craft', '火に燃えない布・灯芯・炉の手袋')], desc: '綿のようにほぐれる石。織れば火に入れても燃えない布になる。' });
A('fluorite', '蛍石', 'ore', 1, 6, { limit: V, rare: 1, src: [S('mine', ['cave', 'mine'], 0.06)], use: [U('craft', '炉で金属を溶けやすくする'), U('collect', '暗がりで淡く光る')], desc: '紫や緑の透き通った結晶。熱すると光る。' });
A('meteorite', '隕石', 'ore', 8, 90, { limit: 'relic', rare: 3, demand: 0, src: [S('gather', ['grass', 'desert', 'snow', 'tundra', 'savanna'], 0.001)], use: [U('craft', '溶かして隕鉄をとる'), U('collect', '天から落ちた石'), U('ritual', '星の神への供え物')], desc: '流れ星の燃えかす。中に不思議な鉄を含む。' });
A('starore', '星鉄鉱', 'ore', 3, 400, { limit: 'relic', rare: 4, demand: 0, src: [S('mine', ['mountain'], 0.0005), S('loot', ['ruins'], 0.002)], use: [U('craft', '星鉄の材料'), U('magic', '星の力を宿す')], desc: '夜になると星のように瞬く鉱石。天が落とした最初の鉄という。' });
A('dragonvein_ore', '竜脈鉱', 'ore', 5, 220, { limit: 'vein', rare: 3, demand: 0, src: [S('mine', ['volcano'], 0.004)], use: [U('craft', '竜鋼の材料'), U('magic', '大地の力を引き出す')], desc: '竜の眠る火山の奥にだけできる、脈打つように熱い赤い鉱石。' });
A('darkiron_ore', '冥鉄鉱', 'ore', 5, 35, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['demoncastle'], 0.08), S('hunt', ['demonsoldier', 'golem'], 0.1)], use: [U('craft', '冥鉄の材料')], desc: '魔界の岩からとれる紫がかった黒い鉱石。' });
A('magic_ore', '魔鉱石', 'ore', 4, 25, { limit: 'vein', rare: 2, src: [S('mine', ['cave', 'dungeon', 'mine'], 0.03)], use: [U('craft', '砕いて魔石のかけらをとる'), U('magic')], desc: '魔力がしみ込んだ石。坑道の奥でかすかに青く光る。' });

// ===== 塩 =====
A('rocksalt', '岩塩', 'salt', 1, 2, { limit: 'vein', demand: 3, src: [S('mine', ['mountain', 'desert', 'mine'], 0.3)], use: [U('food', '料理の塩・保存食の塩漬け'), U('feed', '家畜の塩なめ'), U('trade')], desc: '山から掘り出す塩の岩。' });
A('rocksalt_pink', '薄紅の岩塩', 'salt', 1, 8, { limit: 'vein', rare: 1, src: [S('mine', ['mountain'], 0.04)], use: [U('luxury', '貴族の食卓の塩'), U('gift')], desc: '桜色に透ける岩塩。味がまろやかだという。' });
A('seasalt', '海塩', 'salt', 1, 2.5, { demand: 3, make: M({ brine: 3 }, 'saltmaker', 3), src: [S('gather', ['beach'], 0.05)], use: [U('food', '料理の塩・魚の塩漬け'), U('trade')], desc: '海水を煮詰めてとった塩。港町の暮らしを支える。' });
A('lakesalt', '湖塩', 'salt', 1, 2, { demand: 2, make: M({ saltlakewater: 5 }, 'saltmaker', 4), src: [S('gather', ['lake', 'desert'], 0.1)], use: [U('food'), U('feed', '家畜の塩')], desc: '塩湖の水を天日で干してとった塩。' });
A('coarsesalt', '粗塩', 'salt', 1, 1.2, { demand: 2, make: M({ saltysoil: 3, freshwater: 2 }, 'saltmaker', 3), use: [U('food', '漬け物・塩漬け肉'), U('feed')], desc: '塩土を煮出した灰色の塩。安いがにがい。' });
A('finesalt', '焼き塩', 'salt', 1, 4, { demand: 2, make: M({ seasalt: 1 }, 'saltmaker', 1), use: [U('food', 'さらさらの上等な塩'), U('medicine', '歯を磨く')], desc: '塩を焼いてさらさらにしたもの。湿気で固まらない。' });
A('deepsalt', '深海の塩', 'salt', 1, 12, { rare: 2, demand: 0, make: M({ deepseawater: 6 }, 'saltmaker', 6), use: [U('luxury', '王の料理人が使う塩')], desc: '深い海の水からとった、甘みのある塩。' });
A('saltlick', '塩の塊', 'salt', 5, 6, { demand: 1, make: M({ rocksalt: 3 }, 'rancher', 1), use: [U('feed', '牛や馬が舐める塩の塊')], desc: '牧場の柱につるす大きな岩塩。' });
A('nigari', '苦汁', 'salt', 1, 1.5, { demand: 1, make: M({ brine: 2 }, 'saltmaker', 2), use: [U('food', '豆の汁を固めて豆腐にする'), U('medicine', '便通')], desc: '塩を煮たあとに残るにがい汁。' });

// ===== 石炭と化石燃料 =====
A('coal', '石炭', 'fuel', 4, 1.5, { limit: 'vein', demand: 2, src: [S('mine', ['mountain', 'hill', 'mine'], 0.4)], use: [U('fuel', '鍛冶炉・暖炉の燃料'), U('craft', '蒸し焼きにして骸炭')], desc: '燃える黒い石。木炭より長く強く燃える。' });
A('lignite', '褐炭', 'fuel', 4, 0.8, { limit: 'vein', demand: 1, src: [S('dig', ['hill', 'swamp'], 0.2), S('mine', ['mine'], 0.3)], use: [U('fuel', '家のかまど・煙が多い')], desc: '茶色い若い石炭。火力は弱い。' });
A('anthracite', '無煙炭', 'fuel', 4, 4, { limit: 'vein', rare: 1, demand: 1, src: [S('mine', ['mountain', 'mine'], 0.05)], use: [U('fuel', '煙を出さず高い熱。王宮の暖炉と名工の炉')], desc: 'つやのある黒い石炭。ほとんど煙が出ない。' });
A('coke', '骸炭', 'fuel', 3, 3, { demand: 1, make: M({ coal: 2 }, 'charcoal', 6), use: [U('fuel', '銑鉄を溶かす強い炉の燃料')], desc: '石炭を蒸し焼きにして煙のもとを抜いたもの。' });
A('coalbriquette', '練炭', 'fuel', 2, 1, { demand: 2, make: M({ coal_dust: 2, clay: 1 }, 'charcoal', 1), use: [U('fuel', '長く燃える冬の燃料')], desc: '炭の粉を粘土で固めたもの。貧しい家の冬を支える。' });
A('coal_dust', '炭の粉', 'fuel', 2, 0.2, { limit: 'none', demand: 0, src: [S('gather', ['mine'], 0.6)], use: [U('craft', '練炭の材料'), U('dye', '墨・黒い顔料')], desc: '石炭を掘ったあとに残る粉。' });
A('jet', '黒玉', 'fuel', 0.3, 20, { limit: 'vein', rare: 2, demand: 0, src: [S('mine', ['beach', 'hill', 'mine'], 0.01), S('gather', ['beach'], 0.005)], use: [U('luxury', '喪服に合わせる黒い装身具'), U('collect')], desc: '太古の木が石になった、磨くと黒く光る宝石。' });

// ===== 金属（延べ棒と加工品） =====
// key, 名前, 延べ棒のid, 延べ棒の値, めずらしさ, 作り方, 延べ棒の使い道, 説明, 形のリスト
const METALS = [
  ['iron', '鉄', 'iron', 12, 0, M({ crude_iron: 1, charcoal: 1 }, 'smith', 2), '武器・農具・釘・蝶番', '鍛冶屋が叩いて何にでもする、いちばんの金属。', ['sheet', 'wire', 'rod', 'nail', 'hoop', 'scrap', 'powder']],
  ['steel', '鋼', 'steel', 30, 1, M({ iron: 2, charcoal: 2 }, 'smith', 4), '剣・鎧・よい道具', '鉄に炭を吸わせて鍛えた、強くしなる金属。', ['sheet', 'wire', 'rod', 'scrap']],
  ['copper', '銅', 'copper', 10, 0, M({ crude_copper: 1, charcoal: 1 }, 'smith', 2), '鍋・屋根・青銅と真鍮', 'やわらかく赤い金属。鍋と屋根に使う。', ['sheet', 'wire', 'rod', 'nail', 'scrap', 'powder']],
  ['tin', '錫', 'tin', 14, 1, M({ tin_ore_washed: 2, charcoal: 1 }, 'smith', 2), '青銅・白鑞・器のめっき', '白く光るやわらかい金属。', ['sheet', 'leaf', 'scrap']],
  ['bronze', '青銅', 'bronze', 16, 0, M({ copper: 3, tin: 1 }, 'smith', 3), '像・鐘・古風な武器', '銅と錫を合わせた、錆びにくい金属。', ['sheet', 'rod', 'scrap']],
  ['brass', '真鍮', 'brass', 18, 0, M({ copper: 2, zinc: 1 }, 'smith', 3), '楽器・燭台・金具', '金のように光る銅と亜鉛の合金。', ['sheet', 'wire', 'scrap']],
  ['lead', '鉛', 'lead', 8, 0, M({ lead_ore_washed: 2, charcoal: 1 }, 'smith', 2), '水道管・屋根・網の錘', '重くやわらかい金属。', ['sheet', 'shot', 'scrap']],
  ['zinc', '亜鉛', 'zinc', 12, 1, M({ zinc_ore_washed: 2, coal: 1 }, 'smith', 3), '真鍮', '青白い金属。真鍮づくりに使う。', ['scrap', 'powder']],
  ['silver', '銀', 'silver', 120, 1, M({ crude_silver: 1 }, 'smith', 2), '装身具・食器・銀貨の地金', '白く輝く尊い金属。', ['sheet', 'wire', 'leaf', 'powder', 'scrap']],
  ['gold', '金', 'gold', 900, 2, M({ gold_ore_washed: 3, charcoal: 1 }, 'smith', 3), '王冠・装身具・金貨の地金', '錆びず曇らず、永遠に輝く金属。', ['sheet', 'wire', 'leaf', 'powder', 'scrap']],
  ['platinum', '白金', 'platinum', 1200, 3, M({ platinum_ore_washed: 3, coal: 2 }, 'smith', 8), '王家の装身具・錬金のるつぼ', '金より重く、どんな酸にも溶けない金属。', ['wire', 'scrap']],
  ['whitesilver', '白銀', 'whitesilver', 700, 2, M({ silver: 3, platinum: 1 }, 'jeweler', 6), '儀式の器・貴族の装身具', '銀と白金を合わせた、曇らない白い金属。', ['sheet', 'leaf']],
  ['pewter', '白鑞', 'pewter', 12, 0, M({ tin: 3, lead: 1 }, 'smith', 2), '酒場の杯と皿', '錫と鉛を合わせた、器に向く鈍い銀色の金属。', ['sheet']],
  ['electrum', '琥珀金', 'electrum', 500, 2, M({ gold: 1, silver: 2 }, 'jeweler', 4), '古い王国の装身具', '金と銀が自然に混ざった淡い黄金色の金属。', ['sheet']],
  ['shakudo', '赤銅', 'shakudo', 60, 1, M({ copper: 5, gold_powder: 1 }, 'jeweler', 4), '刀の鍔・飾り金具', '銅にわずかな金を混ぜた、黒紫に色づく金属。', []],
  ['oborogin', '朧銀', 'oborogin', 45, 1, M({ copper: 3, silver: 1 }, 'jeweler', 4), '飾り金具・煙管', '銅と銀を合わせた、霞のような灰色の金属。', []],
  ['typemetal', '活字の合金', 'typemetal', 14, 1, M({ lead: 3, tin: 1, antimony: 1 }, 'smith', 2), '印刷の活字', '鉛に錫と安母尼を混ぜた、型どおり固まる金属。', []],
  ['bellbronze', '鐘の青銅', 'bellbronze', 20, 1, M({ copper: 3, tin: 1 }, 'smith', 3), '教会の鐘・銅鑼', '錫を多く混ぜた、よく響く青銅。', []],
  ['antimony', '安母尼', 'antimony', 14, 1, M({ stibnite: 2, charcoal: 1 }, 'alchemist', 3), '活字の合金・錬金', '輝安鉱から取り出したもろい銀色の金属。', []],
  ['bismuth', '蒼鉛', 'bismuth', 16, 1, M({ bismuth_ore: 2, charcoal: 1 }, 'alchemist', 2), '低い熱で溶ける合金・胃薬', '虹色の結晶を作る不思議な金属。', []],
  ['mithril', 'ミスリル', 'mithril', 2500, 3, M({ mithril_ore_washed: 3, anthracite: 2 }, 'smith', 12), '軽く強い鎧・魔法の武器', '銀のように輝き、鋼より硬く羽のように軽い金属。', ['sheet', 'wire', 'powder', 'scrap']],
  ['adamantite', 'アダマンタイト', 'adamantite', 3000, 3, M({ adamantite_ore_washed: 3, anthracite: 3 }, 'smith', 16), '決して砕けない盾と鎧', 'この世でいちばん硬い金属。', ['sheet', 'rod', 'scrap']],
  ['orichalcum', 'オリハルコン', 'orichalcum', 5000, 4, M({ orichalcum_ore_washed: 3, anthracite: 3 }, 'smith', 20), '伝説の武具・古代の魔導具', '古代の都を支えたという、赤金色の神の金属。', ['sheet', 'powder', 'scrap']],
  ['meteoriciron', '隕鉄', 'meteoriciron', 800, 3, M({ meteorite: 1, charcoal: 2 }, 'smith', 8), '王の剣・星を祀る祭具', '天から落ちた鉄。うねる模様が浮かぶ。', ['rod', 'scrap']],
  ['stariron', '星鉄', 'stariron', 6000, 4, M({ starore: 2, meteoriciron: 1 }, 'smith', 30), '勇者の剣', '夜空の光を宿す、伝説の鍛冶だけが扱える金属。', ['rod']],
  ['dragonsteel', '竜鋼', 'dragonsteel', 8000, 4, M({ steel: 3, dragonvein_ore: 2, scale: 2, dragonspring: 1 }, 'smith', 40), '竜殺しの剣・竜鱗に負けない鎧', '竜脈の鉱石と竜の鱗を鋼に溶かし込んだ、炎に強い赤黒い金属。', ['sheet', 'rod']],
  ['magicsteel', '魔鋼', 'magicsteel', 400, 2, M({ steel: 2, magicstone: 1 }, 'smith', 10), '魔法を通す剣・杖の芯', '魔石を溶かし込み、魔力をよく通す鋼。', ['sheet', 'rod']],
  ['holysilver', '聖銀', 'holysilver', 600, 3, M({ silver: 2, holyspring: 2 }, 'priest', 12), '退魔の武器・聖職者の護符', '聖なる泉で清め祈りを込めた銀。亡者を焼く。', ['sheet', 'powder']],
  ['darkiron', '冥鉄', 'darkiron', 180, 2, M({ darkiron_ore: 3, coal: 2 }, 'smith', 10), '魔族の武器・呪いに耐える盾', '魔界の鉱石から打つ、光を吸う黒い鉄。', ['sheet']],
];
const FORM = {
  sheet: ['板', 1, 1.25, (m) => `${m}の鎧・器・屋根の板金`, (n) => `${n}を叩いて薄く延ばした板。`],
  wire: ['の針金', 1, 1.4, () => '鎖かたびら・針・楽器の弦・細工', (n) => `${n}を細く引き伸ばした線。`],
  rod: ['の棒', 1, 1.1, () => '鍛えて剣・槍・道具にする', (n) => `鍛冶屋が打ちやすい長さにした${n}の棒。`],
  nail: ['の釘', 1, 1.3, () => '家・船・家具を組む', (n) => `${n}で打った釘。延べ棒ひとつ分のひと袋。`],
  hoop: ['の箍', 1, 1.2, () => '樽と桶のたが・車輪の輪金', (n) => `${n}の平たい輪。`],
  scrap: ['くず', 1, 0.45, () => '溶かして延べ棒に戻す', (n) => `壊れた道具や削りかすの${n}。捨てずに溶かし直す。`],
  powder: ['の粉', 1, 1.2, () => '錬金・薬・魔法陣・金継ぎ', (n) => `${n}をやすりで細かく削った粉。`],
  leaf: ['箔', 1, 1.5, () => '神像・額縁・写本・屋根の箔押し', (n) => `${n}を打ち延ばした、透けるほど薄い箔。延べ棒ひとつ分をひと箱に詰めたもの。`],
  shot: ['の玉', 1, 1.1, () => '投石紐の弾・釣り網と釣り糸の錘', (n) => `${n}を溶かして垂らした小さな玉。`],
};
for (const [key, nm, id, v, rare, make, note, desc, forms] of METALS) {
  const hi = v >= 300;
  A(id, key === 'iron' ? '鉄のインゴット' : `${nm}の延べ棒`, 'metal', 1, v, { rare, demand: v < 50 ? 2 : 1, make, use: [U('craft', note), ...(v >= 100 ? [U('trade')] : [])], desc });
  for (const f of forms) {
    const [suf, w, mul, un, dn] = FORM[f];
    const fid = `${id}_${f}`;
    const fname = `${nm}${suf}`;
    const o = { rare: f === 'scrap' ? Math.max(0, rare - 1) : rare, demand: f === 'nail' ? 2 : 1, desc: dn(nm) };
    if (f === 'scrap') {
      o.limit = 'none';
      o.src = [S('gather', ['town', 'ruins'], hi ? 0.005 : 0.1), S('loot', ['dungeon', 'ruins'], hi ? 0.01 : 0.2)];
      o.use = [U('craft', un(nm)), U('trade', 'くず屋が買い取る')];
    } else {
      o.make = M({ [id]: 1 }, f === 'leaf' ? 'jeweler' : 'smith', f === 'leaf' ? 4 : 1);
      const uses = [U(f === 'nail' || f === 'hoop' ? 'build' : 'craft', un(nm))];
      if (f === 'leaf') uses.push(U('luxury'));
      if (f === 'powder' && hi) uses.push(U('magic'));
      if (f === 'shot') uses.push(U('tool'));
      o.use = uses;
    }
    A(fid, fname, 'metal', w, v * mul, o);
  }
}
// 精錬の途中の物・特別な鉄と鋼
A('crude_iron', '粗鉄', 'metal', 2, 9, { demand: 1, make: M({ ore_washed: 1, charcoal: 2 }, 'smith', 3), use: [U('craft', '叩いて鉱滓を絞り出し、鉄の延べ棒にする')], desc: '炉から出たばかりの、鉱滓まじりの鉄の塊。' });
A('crude_copper', '粗銅', 'metal', 1.5, 7, { demand: 1, make: M({ copper_ore_washed: 1, charcoal: 1 }, 'smith', 2), use: [U('craft', 'もう一度溶かして銅の延べ棒にする')], desc: '炉から出たばかりの、泡の跡が残る銅。' });
A('crude_silver', '灰吹き銀', 'metal', 1, 95, { rare: 1, demand: 1, make: M({ silver_ore_washed: 2, lead: 1 }, 'smith', 4), use: [U('craft', '銀の延べ棒にする')], desc: '鉛に銀を溶かし込み、灰の上で鉛を吹き飛ばしてとった銀。' });
A('slag', '鉱滓', 'metal', 3, 0.1, { demand: 0, make: M({ crude_iron: 1 }, 'smith', 1), src: [S('gather', ['mine', 'town'], 0.4)], use: [U('build', '道の敷き石・煉瓦に混ぜる'), U('fertilize', '畑に撒く')], desc: '鉄を作るときに出る、硝子のような黒いかす。' });
A('pig_iron', '銑鉄', 'metal', 2, 7, { demand: 1, make: M({ ore_washed: 1, coke: 1 }, 'smith', 3), use: [U('craft', '鋳物にする・錬って鉄にする')], desc: '強い炉で溶けるまで熱した、炭の多いもろい鉄。' });
A('castiron', '鋳鉄', 'metal', 5, 18, { demand: 2, make: M({ pig_iron: 2, moldsand: 1 }, 'smith', 3), use: [U('craft', '鍋・釜・暖炉の鋳物'), U('build', '門扉・欄干')], desc: '型に流して固めた鉄。鍋や釜になる。' });
A('tamahagane', '玉鋼', 'metal', 1, 60, { rare: 2, demand: 1, make: M({ ironsand: 5, charcoal: 5 }, 'smith', 24), use: [U('craft', '名刀の材料')], desc: '砂鉄と木炭を三日三晩吹いて生まれる、最上の鋼。' });
A('blacksteel', '黒鋼', 'metal', 1, 55, { rare: 1, demand: 1, make: M({ steel: 1, coal: 1 }, 'smith', 6), use: [U('craft', '鋭い刃・鎧の要所')], desc: '炭を深く吸わせて焼き入れた、黒く硬い鋼。' });
A('damascus', '波紋鋼', 'metal', 1, 150, { rare: 2, demand: 0, make: M({ steel: 2, iron: 2 }, 'smith', 16), use: [U('craft', '名匠の剣'), U('luxury', '水の流れのような模様')], desc: '硬い鋼とやわらかい鉄を何百回も折り重ねた、波の模様の鋼。' });
A('spring_steel', 'ばね鋼', 'metal', 1, 40, { rare: 1, make: M({ steel_wire: 2 }, 'smith', 4), use: [U('craft', '弩のばね・錠前・時計')], desc: '曲げても戻るよう鍛えた鋼。' });
A('verdigris', '緑青', 'metal', 0.2, 6, { demand: 0, make: M({ copper_sheet: 1, vinegar: 1 }, 'alchemist', 24), src: [S('gather', ['ruins'], 0.1)], use: [U('dye', '緑の絵の具'), U('medicine', '傷の腐れ止め（毒でもある）')], desc: '銅につく青緑の錆。' });
A('mercury', '水銀', 'metal', 1, 40, { rare: 2, demand: 0, stack: 10, make: M({ cinnabar: 2, charcoal: 1 }, 'alchemist', 4), use: [U('craft', '金めっき・砂金集め・鏡の裏張り'), U('magic', '錬金術の要')], desc: '銀色に流れる液体の金属。錬金術師が珍重する。毒がある。' });
A('solder', 'ろう', 'metal', 0.3, 8, { demand: 1, make: M({ tin: 1, lead: 1 }, 'smith', 1), use: [U('craft', '金物のつぎはぎ・鍋の穴ふさぎ')], desc: '低い熱で溶けて金物をつなぐ合金の棒。' });
A('gold_solder', '金ろう', 'metal', 0.1, 120, { rare: 2, demand: 0, make: M({ gold_powder: 1, borax: 1 }, 'jeweler', 2), use: [U('craft', '金細工のつなぎ')], desc: '金細工師が使う、金と硼砂のろう。' });
A('gilding', '金めっきの泥', 'metal', 0.2, 300, { rare: 2, demand: 0, make: M({ gold_powder: 1, mercury: 1 }, 'jeweler', 2), use: [U('craft', '祭具・鎧・王冠の金めっき'), U('luxury')], desc: '金を水銀に溶かした泥。塗って焼けば金色に輝く。' });
