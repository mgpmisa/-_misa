// 入れ物・仕事の道具・金物・運ぶ物（gear4.js）
import { add, r, CR, LOOT, TR, uWear } from './g0_common.mjs';

const F = 'gear4';
export function genTools() {
  // ---- 入れ物（持てる量を増やす）：eq.cap＝増える枠、eq.kg＝増える持てる重さ ----
  // [id, 名前, cap, kg, 重さ, 値打ち, 材料, 職人, rare, demand, 向いている物, 説明, 手に入れ方の追加, 置き物]
  const BAG = [
    ['coinpurse', '布の巾着', 1, 0.5, 0.05, 2, { hempcloth: 1 }, 'tailor', 0, 3, 'お金・小物', '口を紐で絞る小さな袋。お金と指輪を入れる。'],
    ['leatherpouch', '革の腰袋', 2, 3, 0.2, 4, { leather: 1 }, 'leatherworker', 0, 3, '小物', '帯に下げる革の袋。火打ち石や薬を入れる。'],
    ['toolpouch', '腰の道具袋', 3, 4, 0.4, 8, { leather: 2 }, 'leatherworker', 0, 2, '道具', '職人や盗賊が腰に巻く、仕切りの多い袋。'],
    ['hempsack', '麻の穀物袋', 4, 15, 0.3, 3, { hempcloth: 1 }, 'weaver', 0, 3, '穀物・粉・芋', '麦や粉を入れて運ぶ粗い麻の袋。'],
    ['hempbackpack', '麻の背負い袋', 6, 20, 0.8, 10, { hempcloth: 2, rope: 1 }, 'weaver', 0, 3, 'なんでも', '麻布を縫って肩紐を付けた背負い袋。'],
    ['travelerpack', '旅人の背嚢', 8, 22, 1.5, 14, { leather: 2, hempcloth: 1 }, 'leatherworker', 0, 2, 'なんでも', '革の底と雨蓋の付いた背嚢。旅人と兵士の定番。'],
    ['adventurersack', '冒険者の雑嚢', 6, 12, 0.7, 8, { hempcloth: 1, leather: 1 }, 'leatherworker', 0, 2, 'なんでも', '肩から斜めに掛ける袋。戦いの邪魔にならない。'],
    ['porterpack', '荷運びの大背嚢', 10, 30, 2.5, 25, { leather: 3, hempcloth: 2 }, 'leatherworker', 0, 1, 'なんでも', '背中いっぱいの大きな背嚢。戦うと動きが鈍る。', null, 0, { slow: 1 }],
    ['peddlerbox', '行商人の背負い箱', 8, 20, 3, 8, { willow: 3 }, 'basketweaver', 0, 1, '布・衣・小物', '引き出しの付いた柳の箱。行李とも呼ぶ。開けばそのまま店になる。'],
    ['huntergamebag', '狩人の獲物袋', 4, 20, 0.6, 6, { hide: 1, rope: 1 }, 'leatherworker', 0, 1, '肉・毛皮', '血が染みても平気な毛皮の袋。仕留めた獣を入れる。'],
    ['herbbasket', '薬師の採取籠', 3, 5, 0.3, 2, { willow: 1 }, 'basketweaver', 0, 2, '薬草・木の実・きのこ', '薬草を潰さずに持ち帰る浅い籠。'],
    ['mageSatchel', '魔導士の書物鞄', 5, 8, 1, 20, { leather: 2, brass: 0 }, 'leatherworker', 0, 1, '書物・巻物・魔石', '魔導書と巻物を湿気から守る硬い革の鞄。'],
    ['harvestbasket', '収穫かご', 4, 15, 0.8, 3, { willow: 2 }, 'basketweaver', 0, 3, '畑の産物', '腕に掛ける大きな柳のかご。'],
    ['creel', '魚籠', 3, 10, 0.5, 3, { willow: 2 }, 'basketweaver', 0, 2, '魚', '腰に下げる、魚を生かしておける籠。'],
    ['backbasket', '背負いかご', 6, 25, 1.5, 6, { willow: 3, rope: 1 }, 'basketweaver', 0, 3, 'なんでも', '背中に負う深い柳のかご。薪も野菜も入る。'],
    ['frame', '背負子', 5, 30, 2, 5, { wood: 1, rope: 1 }, 'carpenter', 0, 2, '薪・石・材木など大物', '木の枠に縄を張った背負い道具。長い物も縛りつけられる。'],
    ['carrypole', '天秤棒', 4, 30, 2, 3, { wood: 1, rope: 2 }, 'carpenter', 0, 2, '桶・かご', '肩にかついで前後に荷を下げる棒。水売りと魚売りの道具。'],
    ['shepherdbag', '羊飼いの肩掛け袋', 3, 6, 0.4, 5, { woolcloth: 1 }, 'weaver', 0, 1, '弁当・小物', '羊毛で織った肩掛けの袋。'],
    ['soldierpack', '兵士の背嚢', 7, 22, 1.8, 15, { leather: 2, hempcloth: 1 }, 'leatherworker', 0, 2, '食料・野営道具', '国から支給される揃いの背嚢。鍋と毛布を括りつける。'],
    ['messengerbag', '伝令の文書袋', 2, 3, 0.4, 12, { leather: 1, wax: 1 }, 'leatherworker', 0, 1, '手紙・文書', '蝋で目を塞ぎ、雨でも手紙を濡らさない袋。'],
    ['ladyhandbag', '貴婦人の錦の手提げ', 2, 2, 0.2, 90, { brocade: 1 }, 'tailor', 1, 1, '小物・香水', '金糸の模様の小さな手提げ。持つこと自体が身分のしるし。'],
    ['medicinebox', '薬師の薬箱', 4, 6, 2, 25, { wood: 2, leather: 1 }, 'carpenter', 0, 1, '薬', '小さな引き出しがたくさん付いた背負いの薬箱。'],
    ['orebag', '鉱夫の鉱石袋', 4, 25, 1, 7, { sailcloth: 1, leather: 1 }, 'leatherworker', 0, 1, '鉱石・石', '厚い帆布の底に革を当てた袋。尖った石でも破れない。'],
    ['netbag', '漁師の網袋', 3, 12, 0.3, 3, { rope: 1 }, 'roper', 0, 2, '魚・貝', '縄で編んだ網の袋。水がすぐ切れる。'],
    ['pilgrimscrip', '巡礼の頭陀袋', 3, 6, 0.3, 3, { hempcloth: 1 }, 'weaver', 0, 1, '食べ物・施し', '首から下げる質素な袋。施しを受けて旅を続ける。'],
    ['waterskinbag', '水袋の肩掛け', 2, 5, 0.5, 6, { leather: 2 }, 'leatherworker', 0, 1, '水・酒', '水袋を二つ下げられる肩掛け。'],
    ['bedrollstrap', '寝具の背負い紐', 2, 8, 0.3, 3, { leather: 1 }, 'leatherworker', 0, 1, '毛布・天幕', '丸めた毛布や天幕を背中に括りつける革紐。'],
    ['thiefbag', '盗賊の隠し袋', 2, 3, 0.1, 10, { cottoncloth: 1 }, 'tailor', 0, 0, '小物・盗品', '服の内側に縫い付ける隠し袋。'],
    ['grainbale', '藁の俵', 3, 30, 1.5, 1, { straw: 4 }, 'weaver', 0, 2, '米・麦・芋', '藁を編んだ俵。蔵に積み重ねられる。', null, 1],
    ['barrel', '樽', 1, 30, 12, 8, { wood: 2, iron: 1 }, 'cooper', 0, 2, '酒・水・塩漬けの魚や肉', '塩をして詰めた魚や肉は腐らない。据え置きか荷車に積む。', null, 1],
    ['keg', '小樽', 1, 10, 4, 5, { wood: 1, iron: 1 }, 'cooper', 0, 2, '酒・油・水', '肩にかつげる小さな樽。', null, 0],
    ['crate', '木箱', 4, 30, 8, 6, { wood: 2 }, 'carpenter', 0, 2, 'なんでも', '釘で組んだ箱。荷車や蔵に積む。', null, 1],
    ['lockchest', '鍵つきの木箱', 6, 40, 12, 18, { wood: 2, iron: 1, lock: 1 }, 'carpenter', 0, 1, 'お金・宝', '錠前の付いた箱。家に置けば盗まれにくい。', null, 1],
    ['storagejar', '陶器の壺', 1, 15, 5, 4, { clay: 2 }, 'potter', 0, 2, '穀物・油・酒・漬け物', '口の狭い壺。ねずみに食われない。', null, 1],
    ['bigjar', '大甕', 1, 60, 20, 10, { clay: 5 }, 'potter', 0, 1, '水・酒・漬け物', '人が入れるほど大きな甕。家の土間に据える。', null, 1],
    ['oiljar', '油壺', 1, 5, 1.5, 3, { clay: 1 }, 'potter', 0, 2, '灯り油・食用の油', '注ぎ口の付いた小さな壺。', null, 0],
    ['wickerhamper', '柳の行李箱', 4, 20, 3, 8, { willow: 4 }, 'basketweaver', 0, 1, '衣・布', '蓋付きの柳の箱。衣替えの服をしまう。', null, 1],
    ['saddlebags', '鞍袋', 6, 40, 3, 12, { leather: 3 }, 'leatherworker', 0, 1, 'なんでも', '馬やロバの背の両側に下げる袋。荷獣に付ける。', null, 0, { beast: 1 }],
    ['panniers', '荷かご', 6, 60, 4, 8, { willow: 6, rope: 1 }, 'basketweaver', 0, 1, 'なんでも', 'ロバや荷馬の背の両側に下げる大きなかご。荷獣に付ける。', null, 0, { beast: 1 }],
    // 民族の入れ物
    ['tribalbasket', '森の民の編み籠', 5, 18, 0.6, 12, { rattan: 3 }, 'tribal_crafter', 1, 1, 'なんでも', '籐を細かく編み、模様を染めた籠。水も漏れにくい。', TR(['forest', 'jungle'])],
    ['furbag', '雪原の民の毛皮袋', 5, 16, 1, 14, { hide: 2, sinew: 1 }, 'tribal_crafter', 1, 1, '食べ物・毛皮', '海獣の毛皮を縫った袋。中の物が凍らない。', TR(['snow', 'tundra'])],
    ['reedbasket', '沼の民の葦の背負い籠', 5, 18, 0.7, 6, { reed: 4 }, 'tribal_crafter', 0, 1, '魚・貝・草', '葦を編んだ軽い背負い籠。', TR(['swamp'])],
    ['netsack', '山の民の背負い網袋', 5, 20, 0.5, 8, { hemp: 3 }, 'tribal_crafter', 0, 1, 'なんでも', '麻縄で編んだ伸びる網の袋。', TR(['mountain'])],
    ['saddlepackdesert', '砂の民の駱駝袋', 8, 50, 4, 30, { woolcloth: 3, leather: 2 }, 'tribal_crafter', 1, 1, 'なんでも', '織物の模様が美しい、駱駝の背に振り分ける大袋。', TR(['desert']), 0, { beast: 1 }],
    ['gourdcarrier', '瓢箪下げの網', 2, 6, 0.2, 2, { vine: 2 }, 'tribal_crafter', 0, 1, '水・酒', '瓢箪を下げる蔓の網。', TR(['savanna', 'jungle'])],
    // ドワーフ・エルフの品
    ['dwarfpack', 'ドワーフ製の鉄枠背嚢', 12, 35, 4, 80, { steel: 1, leather: 3, sailcloth: 1 }, 'dwarf_smith', 2, 1, 'なんでも', '鋼の枠で重さを腰に逃がす背嚢。重い荷でも疲れにくい。', TR(['mountain'])],
    ['dwarfminerpack', 'ドワーフの鉱石背負い箱', 8, 45, 6, 60, { steel: 2, oak: 2 }, 'dwarf_smith', 2, 1, '鉱石・石', '鉄張りの箱の背負子。岩を詰めても壊れない。', TR(['mountain'])],
    ['elvenbag', 'エルフ織りの袋', 8, 20, 0.3, 70, { elvencloth: 2 }, 'elven_weaver', 2, 1, 'なんでも', '羽のように軽い袋。周りの色に紛れて盗まれにくい。', TR(['forest', 'dense'])],
    ['elvenpouch', 'エルフ織りの小袋', 3, 5, 0.05, 30, { elvencloth: 1 }, 'elven_weaver', 2, 1, '薬草・種', '中の薬草がいつまでもしおれない小袋。', TR(['forest', 'dense'])],
    // 魔物の革の袋
    ['wolfpack', '狼革の背嚢', 8, 24, 1.2, 30, { wolf_hide: 2, hempcloth: 1 }, 'leatherworker', 0, 1, 'なんでも', '軽くしなやかな狼の革の背嚢。'],
    ['bearpack', '熊革の大背嚢', 11, 32, 2.5, 55, { bear_hide: 3 }, 'leatherworker', 1, 1, 'なんでも', '熊の厚い革で作る丈夫な大背嚢。'],
    ['crocbag', '鰐革の旅行鞄', 7, 20, 1.5, 90, { croc_hide: 2 }, 'leatherworker', 1, 1, 'なんでも', '水に浸かっても中が濡れない鰐革の鞄。商人の自慢の品。'],
    ['wyvernpack', 'ワイバーン革の背嚢', 12, 30, 1, 200, { wyvern_hide: 3 }, 'leatherworker', 2, 1, 'なんでも', '飛竜の革の背嚢。軽く、刃も炎も通さない。'],
    ['spidersilkbag', '大蜘蛛の糸の袋', 6, 18, 0.1, 60, { spidersilkcloth: 1 }, 'weaver', 1, 1, 'なんでも', '大蜘蛛の糸で織った袋。畳めば拳ほどになる。'],
    ['slimeskin', '粘体の水袋', 2, 8, 0.2, 10, { jelly: 3 }, 'alchemist', 1, 1, '水・薬', 'スライムのゼリーを固めた伸び縮みする水袋。', null],
    ['orcstomach', '大鬼の胃袋の袋', 5, 25, 1.5, 15, { orc_hide: 2 }, 'leatherworker', 0, 0, '肉・骨', '大鬼の胃袋をなめした臭う袋。どんな荷を詰めても破れない。', null],
    ['basiliskbag', '竜革の宝物袋', 10, 30, 0.8, 400, { dragon_hide: 2, gold: 1 }, 'leatherworker', 3, 1, '宝', '竜の翼の膜をなめした袋。王族が宝を入れて運ぶ。'],
    // 魔法の袋（ダンジョン・魔王の屋敷の宝箱からだけ）
    ['magicpouch', '魔法の小袋', 10, 30, 0.1, 500, null, null, 3, 1, 'なんでも', '手のひらほどの袋に、背嚢ひとつ分が入る。中の重さは半分になる。', 'loot'],
    ['magicbag', '魔法の袋', 20, 60, 0.3, 1500, null, null, 3, 1, 'なんでも', '中が広い魔法の袋。重さは半分になる。王族の趣味の品として高く売れる。', 'loot'],
    ['dimensionpack', '次元の背嚢', 30, 100, 1, 4000, null, null, 4, 1, 'なんでも', '蓋の奥に小部屋ほどの空間が広がる背嚢。', 'loot'],
    ['bottomlessbag', '底なしの袋', 50, 200, 0.5, 9000, null, null, 4, 1, 'なんでも', '古の大賢者が作ったという袋。底がない。世界にひとつ。', 'relic'],
  ];
  for (const row of BAG) {
    const [id0, name, cap, kg, w, v, from, by, rare, dem, fit, desc, extra, place, ex] = row;
    const id = id0 === 'mageSatchel' ? 'magesatchel' : id0;
    const src = [];
    const loot = extra === 'loot' || extra === 'relic';
    if (from) { for (const k in from) if (!from[k]) delete from[k]; src.push(CR); }
    if (extra && !loot) src.push(extra);
    if (loot) src.push(LOOT(extra === 'relic' ? 0.0003 : v >= 3000 ? 0.001 : 0.004, ['dungeon', 'demoncastle']));
    const eq = { slot: 'bag', cap, kg };
    if (place) eq.place = 1;
    if (loot) eq.half = 1;
    if (ex) Object.assign(eq, ex);
    add(F, { id, name, sub: 'bag', w, v, rare, demand: dem, ...(extra === 'relic' ? { limit: 'relic' } : {}), src,
      use: [uWear(place ? '家・蔵・荷車に置いて物をしまう' : ex?.beast ? '荷獣に付けて荷を運ぶ' : `身に着けて持てる量を増やす（${fit}）`),
        ...(loot ? [{ k: 'luxury', note: '王族の趣味の品' }, { k: 'trade' }] : v >= 60 ? [{ k: 'trade' }, { k: 'gift' }] : [{ k: 'tool', note: '荷運び' }])],
      ...(from ? { make: { from, by, t: r(1 + v / 6, 1) } } : {}), eq, fits: fit, desc });
  }

  // ---- 仕事の道具（eq.slot='tool'、jobs＝向いている職業、eff＝仕事のはかどり具合） ----
  // [id, 名前, 小分類, jobs, 値打ち, 重さ, 材料, 職人, eff, demand, 説明]
  const T = [
    // 畑
    ['hoe', '鍬', 'farm', ['farmer', 'beekeeper'], 10, 1.8, { iron: 1, wood: 1 }, 'smith', 1.2, 3, '畑を耕す農民の第一の道具。'],
    ['spade', '鋤', 'farm', ['farmer', 'gardener', 'gravedigger'], 10, 2, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '土を深く掘り返す踏み鋤。墓掘りにも。'],
    ['sickle', '鎌', 'farm', ['farmer', 'gatherer'], 7, 0.5, { iron: 1, wood: 1 }, 'smith', 1.2, 3, '麦を刈る三日月形の鎌。'],
    ['scythe', '草刈りの大鎌', 'farm', ['farmer', 'rancher'], 14, 2.5, { iron: 1, wood: 2 }, 'smith', 1.3, 2, '牧草や麦を一度に広く刈る大鎌。'],
    ['rake', '熊手', 'farm', ['farmer', 'gardener'], 5, 1.2, { wood: 2 }, 'carpenter', 1.1, 2, '刈った草や落ち葉をかき集める。'],
    ['pitchfork', '干し草用の三叉', 'farm', ['farmer', 'rancher', 'stablehand'], 6, 1.5, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '干し草を持ち上げる長い三つ又。'],
    ['flailtool', '殻竿', 'farm', ['farmer', 'miller'], 4, 1.5, { wood: 2, leather: 1 }, 'carpenter', 1.2, 2, '麦を叩いて穂から粒を落とす道具。'],
    ['winnow', '箕', 'farm', ['farmer', 'miller'], 3, 0.8, { willow: 2 }, 'basketweaver', 1.1, 2, '粒を煽ってもみ殻を飛ばす平たいかご。'],
    ['plow', '犂', 'farm', ['farmer'], 40, 25, { iron: 2, oak: 3 }, 'smith', 1.6, 1, '牛や馬に引かせて畑を耕す。人の何倍も速い。'],
    ['harrow', '馬鍬', 'farm', ['farmer'], 30, 20, { wood: 4, iron: 1 }, 'carpenter', 1.3, 1, '耕した土の塊を砕いて均す、歯の付いた枠。'],
    ['dibble', '種まき棒', 'farm', ['farmer', 'gardener'], 1, 0.3, { wood: 1 }, 'carpenter', 1.05, 2, '土に穴を開けて種を落とす棒。'],
    ['wateringpail', '水撒き桶', 'farm', ['farmer', 'gardener'], 5, 1.5, { wood: 2, iron: 1 }, 'cooper', 1.1, 2, '細い口から水を撒く桶。'],
    ['graftknife', '接ぎ木の小刀', 'farm', ['gardener', 'farmer'], 6, 0.2, { steel: 1, wood: 1 }, 'smith', 1.2, 1, '果樹を接ぎ木する鋭い小刀。'],
    ['pruningshears', '剪定ばさみ', 'farm', ['gardener'], 8, 0.4, { iron: 1 }, 'smith', 1.2, 1, '庭木や葡萄の枝を切るはさみ。'],
    ['smoker', '養蜂の燻し器', 'farm', ['beekeeper'], 8, 0.8, { copper: 1, leather: 1 }, 'smith', 1.3, 1, '煙で蜂をおとなしくさせるふいご付きの缶。'],
    ['beehive', '蜜蜂の巣箱', 'farm', ['beekeeper'], 15, 8, { wood: 3, straw: 2 }, 'carpenter', 1.4, 1, '蜂を住まわせる箱。これがあれば森で巣を探さずに済む。'],
    ['beeveil', '養蜂の面布', 'farm', ['beekeeper'], 4, 0.2, { linen: 1, straw: 1 }, 'tailor', 1.1, 1, '蜂に刺されないよう顔を覆う網の帽子。'],
    ['shears', '毛刈りばさみ', 'farm', ['shepherd', 'rancher'], 9, 0.5, { iron: 1 }, 'smith', 1.2, 2, '羊の毛を刈る大きなばさみ。'],
    ['crook', '羊飼いの杖', 'farm', ['shepherd'], 3, 1.2, { wood: 1 }, 'carpenter', 1.2, 1, '先の曲がった杖。羊の首を引っかけて呼び戻す。'],
    ['milkpail', '乳しぼりの手桶', 'farm', ['rancher', 'shepherd'], 3, 1, { wood: 2 }, 'cooper', 1.1, 2, '乳をしぼって受ける手桶。'],
    ['churn', '乳脂の攪拌桶', 'farm', ['rancher', 'cook'], 8, 5, { wood: 3 }, 'cooper', 1.2, 1, '乳を突いて乳脂を固める縦長の桶。'],
    ['cheesepress', '乳酪搾りの台', 'farm', ['rancher', 'cook'], 15, 8, { oak: 2, iron: 1 }, 'carpenter', 1.2, 1, '固まった乳を押して水を抜く台。'],
    // 木工
    ['woodaxe', '木こり斧', 'wood', ['woodcutter', 'charcoal', 'carpenter', 'shipwright', 'pioneer'], 12, 2.2, { iron: 1, wood: 1 }, 'smith', 1.2, 3, '木を切り倒す重い斧。'],
    ['saw', 'のこぎり', 'wood', ['carpenter', 'shipwright', 'woodcutter'], 12, 1, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '板や角材を挽く。'],
    ['twomansaw', '二人挽きの大鋸', 'wood', ['woodcutter', 'shipwright', 'pioneer'], 25, 4, { iron: 2, wood: 1 }, 'smith', 1.5, 1, '大木を二人で挽き切る長い鋸。'],
    ['plane', '鉋', 'wood', ['carpenter', 'shipwright'], 10, 1, { iron: 1, oak: 1 }, 'smith', 1.2, 1, '板の表面を削って平らにする。'],
    ['chisel', '鑿', 'wood', ['carpenter', 'shipwright', 'mason'], 6, 0.3, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '木に穴や溝を彫る。'],
    ['auger', '錐', 'wood', ['carpenter', 'shipwright', 'cooper'], 6, 0.6, { iron: 1, wood: 1 }, 'smith', 1.1, 1, '木に丸い穴をあける。'],
    ['adze', '手斧（ちょうな）', 'wood', ['carpenter', 'shipwright'], 9, 1.3, { iron: 1, wood: 1 }, 'smith', 1.2, 1, '丸太の面を平らに削る、刃が横向きの斧。'],
    ['mallet', '木槌', 'wood', ['carpenter', 'mason', 'cooper'], 3, 1, { wood: 1 }, 'carpenter', 1.1, 2, '鑿を叩き、ほぞを打ち込む木の槌。'],
    ['square', '曲尺', 'wood', ['carpenter', 'mason'], 5, 0.3, { iron: 1 }, 'smith', 1.1, 1, '直角を測る鉄の物差し。'],
    ['chalkline', '墨壺', 'wood', ['carpenter', 'shipwright'], 4, 0.3, { wood: 1, hemp: 1, soot: 1 }, 'carpenter', 1.1, 1, '墨を含ませた糸を弾いて真っすぐな線を引く。'],
    ['drawknife', '銑', 'wood', ['carpenter', 'cooper', 'bowyer'], 7, 0.5, { iron: 1, wood: 1 }, 'smith', 1.2, 1, '両手で引いて木の皮や角を削る刃物。'],
    ['wedge', '割り楔', 'wood', ['woodcutter', 'mason'], 2, 1, { iron: 1 }, 'smith', 1.1, 2, '丸太や石に打ち込んで割る鉄の楔。'],
    ['woodlathe', '足踏みの木工ろくろ', 'wood', ['carpenter'], 60, 40, { oak: 4, iron: 1, rope: 1 }, 'carpenter', 1.4, 1, '足で回して椀や脚を丸く削る。据え置き。'],
    ['cooperhoop', '樽職人の箍締め', 'wood', ['cooper'], 8, 1, { iron: 1, wood: 1 }, 'smith', 1.2, 1, '樽の箍を打ち込む道具。'],
    // 鍛冶・細工
    ['hammer', '金槌', 'smith', ['smith', 'jeweler'], 12, 1, { iron: 1 }, 'smith', 1.2, 2, '鍛冶屋と細工師の金槌。'],
    ['anvil', '金床', 'smith', ['smith', 'armorer'], 80, 60, { iron: 12 }, 'smith', 1.5, 1, '熱した鉄を叩く鉄の台。鍛冶場になくてはならない。据え置き。'],
    ['bellows', 'ふいご', 'smith', ['smith', 'armorer', 'glassblower'], 30, 10, { leather: 3, wood: 2 }, 'carpenter', 1.4, 1, '炉に風を送って火を強くする革の袋。'],
    ['tongs', '火ばさみ', 'smith', ['smith', 'armorer'], 8, 1.2, { iron: 1 }, 'smith', 1.1, 1, '熱い鉄をつかむはさみ。'],
    ['file', 'やすり', 'smith', ['smith', 'jeweler', 'armorer'], 6, 0.3, { steel: 1 }, 'smith', 1.1, 1, '刃や金具を削って整える。'],
    ['whetstone', '砥石', 'smith', ['smith', 'butcher', 'cook', 'soldier', 'knight', 'barber'], 3, 0.5, { stone: 1 }, 'mason', 1.1, 3, '刃物を研ぐ石。兵士も持ち歩く。'],
    ['sledge', '向こう槌', 'smith', ['smith'], 15, 5, { iron: 3, wood: 1 }, 'smith', 1.3, 1, '弟子が両手で振るう大きな槌。'],
    ['crucible', '坩堝', 'smith', ['smith', 'jeweler', 'alchemist'], 6, 2, { clay: 2 }, 'potter', 1.2, 1, '金属を溶かす土の器。'],
    ['castmold', '鋳型', 'smith', ['smith', 'jeweler'], 10, 5, { stone: 2 }, 'mason', 1.2, 1, '溶けた金属を流し込む石の型。'],
    ['loupe', '拡大鏡', 'smith', ['jeweler', 'scholar', 'scribe'], 40, 0.1, { glass: 1, brass: 1 }, 'glassblower', 1.3, 1, '宝石の傷や細かな字を見る磨いた硝子。'],
    ['glasspipe', '硝子吹きの竿', 'smith', ['glassblower'], 12, 1.5, { iron: 1 }, 'smith', 1.3, 1, '溶けた硝子を膨らませる長い管。'],
    // 採掘・石
    ['pickaxe', 'つるはし', 'mine', ['miner', 'mason'], 14, 3, { iron: 1, wood: 1 }, 'smith', 1.2, 3, '岩を砕き、鉱石を掘る。'],
    ['masonchisel', '石工の鏨', 'mine', ['mason'], 6, 0.5, { steel: 1 }, 'smith', 1.2, 1, '石を刻む硬い鋼の鏨。'],
    ['sledgehammer', '大槌', 'mine', ['mason', 'miner', 'roadworker'], 15, 6, { iron: 3, wood: 1 }, 'smith', 1.3, 2, '大岩を割る重い槌。'],
    ['crowbar', 'かなてこ', 'mine', ['mason', 'miner', 'roadworker', 'carpenter'], 10, 3, { iron: 2 }, 'smith', 1.2, 1, '重い石をてこで動かす鉄の棒。'],
    ['goldpan', '砂金掬いの皿', 'mine', ['miner', 'diver'], 4, 0.8, { wood: 1 }, 'carpenter', 1.2, 1, '川の砂を揺すって砂金を探す木の皿。'],
    ['sieve', 'ふるい', 'mine', ['miner', 'miller', 'baker'], 3, 0.6, { wood: 1, hemp: 1 }, 'basketweaver', 1.1, 2, '砂や粉をふるい分ける網の枠。'],
    ['trowel', '鏝', 'mine', ['mason', 'roadworker'], 5, 0.4, { iron: 1, wood: 1 }, 'smith', 1.1, 1, '漆喰を塗り広げる平たい鉄板。'],
    ['plumbbob', '下げ振り', 'mine', ['mason', 'carpenter'], 4, 0.3, { lead: 1, hemp: 1 }, 'smith', 1.1, 1, '糸の先に錘を下げて真っすぐを確かめる。'],
    ['level', '水準器', 'mine', ['mason', 'carpenter', 'roadworker'], 8, 0.8, { wood: 1, glass: 1 }, 'glassblower', 1.1, 1, '水の入った硝子管で水平を測る。'],
    ['shovel', 'すくい鋤', 'mine', ['roadworker', 'miner', 'gravedigger', 'pioneer'], 8, 2, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '土や砂利をすくう鉄の匙形の道具。'],
    ['stumpgrubber', '根掘り鍬', 'mine', ['pioneer', 'farmer', 'roadworker'], 12, 3, { iron: 2, wood: 1 }, 'smith', 1.3, 1, '切り株の根を掘り起こす重い鍬。開拓に欠かせない。'],
    // 漁
    ['rod', '釣り竿', 'fish', ['fisher', 'sailor', 'captain', 'diver'], 8, 0.8, { wood: 1 }, 'carpenter', 1.2, 2, '竹や木の竿に糸と針を付けたもの。'],
    ['fishhook', '釣り針', 'fish', ['fisher'], 0.5, 0.01, { iron: 1 }, 'smith', 1.05, 2, '小さな鉄の針。10本ひと組。', 10],
    ['fishnet', '網', 'fish', ['fisher', 'sailor'], 15, 4, { rope: 3 }, 'roper', 1.4, 2, '魚をまとめて獲る網。'],
    ['castnet', '投網', 'fish', ['fisher'], 12, 3, { hempthread: 6, lead: 1 }, 'roper', 1.3, 1, '投げて広げ、魚を包み込む網。'],
    ['trawlnet', '引き網', 'fish', ['captain', 'sailor'], 60, 20, { rope: 10, lead: 2 }, 'roper', 1.8, 1, '船で引く大きな網。'],
    ['harpoon', '銛', 'fish', ['fisher', 'diver', 'hunter'], 12, 2, { iron: 1, wood: 1, rope: 1 }, 'smith', 1.3, 1, '大きな魚や海獣を突く、返しの付いた槍。'],
    ['fishtrap', '筌', 'fish', ['fisher'], 4, 1, { willow: 2 }, 'basketweaver', 1.2, 2, '川に沈めて魚を誘い込む籠の罠。'],
    ['crabpot', '蟹籠', 'fish', ['fisher', 'diver'], 5, 1.5, { willow: 2, rope: 1 }, 'basketweaver', 1.2, 1, '餌を入れて海に沈める籠。'],
    ['oar', '櫂', 'fish', ['fisher', 'ferryman', 'sailor'], 4, 2, { wood: 1 }, 'shipwright', 1.1, 2, '舟を漕ぐ木の板。'],
    ['clamrake', '貝掘りの熊手', 'fish', ['diver', 'fisher'], 3, 0.8, { iron: 1, wood: 1 }, 'smith', 1.2, 1, '浜の砂から貝を掻き出す。'],
    ['pearlknife', '真珠採りの小刀', 'fish', ['diver'], 5, 0.2, { steel: 1 }, 'smith', 1.2, 1, '貝をこじ開ける短い刃。'],
    ['divingstone', '潜りの錘石', 'fish', ['diver'], 1, 5, { stone: 1, rope: 1 }, 'mason', 1.2, 1, '抱えて深く潜るための石。'],
    // 狩り・肉
    ['snare', 'くくり罠', 'hunt', ['hunter'], 2, 0.2, { hemp: 1 }, 'roper', 1.2, 2, '獣の通り道に仕掛ける輪の罠。'],
    ['beartrap', '虎挟み', 'hunt', ['hunter', 'pioneer'], 18, 4, { iron: 3 }, 'smith', 1.4, 1, '踏むと鉄の顎が閉じる大きな罠。魔物にも使う。'],
    ['netrap', '落とし網', 'hunt', ['hunter'], 10, 3, { rope: 2 }, 'roper', 1.3, 1, '木の上から落として獲物を包む網。'],
    ['birdlime', '鳥もち', 'hunt', ['hunter'], 1, 0.1, { resin: 1 }, 'gatherer', 1.1, 1, '枝に塗って小鳥を捕る粘る樹脂。', 10],
    ['birdcall', '囮の鳥笛', 'hunt', ['hunter'], 3, 0.05, { wood: 1 }, 'carpenter', 1.2, 1, '鳥の声をまねて獲物を呼ぶ笛。'],
    ['skinningknife', '皮剥ぎの小刀', 'hunt', ['hunter', 'butcher', 'leatherworker'], 6, 0.2, { steel: 1, antler: 1 }, 'smith', 1.2, 2, '獲物の皮をきれいに剥ぐ反った刃。'],
    ['huntinghorn', '狩りの角笛', 'hunt', ['hunter', 'noble', 'general'], 8, 0.4, { antler: 1 }, 'carpenter', 1.1, 1, '猟犬や仲間を呼ぶ角笛。戦の合図にも吹く。'],
    ['cleaver', '肉切り包丁', 'hunt', ['butcher', 'cook'], 8, 1, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '骨ごと肉を断つ重い包丁。'],
    ['meathook', '肉吊りの鉤', 'hunt', ['butcher'], 2, 0.3, { iron: 1 }, 'smith', 1.1, 1, '肉を吊るして血を抜く鉤。'],
    // 縄
    ['rope', '縄', 'rope', ['sailor', 'hunter', 'woodcutter', 'adventurer'], 4, 1, { hemp: 2 }, 'roper', 1.1, 3, '麻を綯った縄。荷を縛り、丸太を引き、崖を下りる。'],
    ['strawrope', '藁縄', 'rope', ['farmer'], 1, 0.8, { straw: 3 }, 'roper', 1.05, 3, '藁を綯った安い縄。すぐ切れるが何にでも使う。'],
    ['hawser', '船の綱', 'rope', ['sailor', 'captain', 'ferryman'], 15, 8, { hemp: 10 }, 'roper', 1.3, 1, '船を岸につなぐ太い綱。'],
    ['silkrope', '絹の綱', 'rope', ['adventurer', 'thief'], 40, 0.4, { silk: 3 }, 'roper', 1.3, 1, '細く軽いが切れない蜘蛛の糸の綱。'],
    ['hideleash', '革紐', 'rope', ['rancher', 'hunter'], 2, 0.2, { leather: 1 }, 'leatherworker', 1.05, 2, '家畜や猟犬をつなぐ革の紐。'],
    // 糸・布・革・焼き物
    ['needle', '針と糸', 'textile', ['tailor', 'weaver', 'cobbler'], 5, 0.05, { iron: 1 }, 'smith', 1.2, 3, '服を縫い、繕う。'],
    ['spindle', '紡錘', 'textile', ['weaver'], 2, 0.2, { wood: 1 }, 'carpenter', 1.1, 2, '回して繊維に撚りをかけ糸にする。'],
    ['spinningwheel', '糸車', 'textile', ['weaver'], 25, 12, { wood: 4, leather: 1 }, 'carpenter', 1.5, 1, '車を回して速く糸を紡ぐ。据え置き。'],
    ['loom', '織機', 'textile', ['weaver'], 80, 40, { wood: 8, rope: 1 }, 'carpenter', 1.5, 1, '縦糸と横糸を組んで布を織る。据え置き。'],
    ['cardingcomb', '梳き櫛', 'textile', ['weaver', 'shepherd'], 4, 0.4, { wood: 1, iron: 1 }, 'smith', 1.2, 1, '羊毛の繊維をほぐしてそろえる針の櫛。'],
    ['dyevat', '染め桶', 'textile', ['weaver', 'tailor'], 10, 10, { wood: 3, iron: 1 }, 'cooper', 1.2, 1, '布を浸して染める大きな桶。'],
    ['tailorshears', '裁ちばさみ', 'textile', ['tailor'], 8, 0.4, { steel: 1 }, 'smith', 1.2, 1, '布を裁つ大きなはさみ。'],
    ['thimble', '指貫', 'textile', ['tailor'], 1, 0.01, { brass: 1 }, 'smith', 1.05, 1, '針を押す指を守る金の輪。'],
    ['bobbin', '糸巻き', 'textile', ['weaver', 'tailor'], 1, 0.05, { wood: 1 }, 'carpenter', 1.05, 1, '糸を巻いておく木の軸。'],
    ['lacepillow', '飾り編みの台', 'textile', ['tailor'], 12, 1, { wood: 1, linen: 1 }, 'carpenter', 1.2, 1, '糸巻きをたくさん使って飾り編みをする台。'],
    ['headknife', '革包丁', 'textile', ['leatherworker', 'cobbler'], 6, 0.3, { steel: 1 }, 'smith', 1.2, 1, '半月形の刃で革を裁つ。'],
    ['tanningvat', '鞣し桶', 'textile', ['leatherworker'], 12, 15, { wood: 3, iron: 1 }, 'cooper', 1.3, 1, '樹皮の汁に皮を浸けて革にする桶。'],
    ['awl', '革錐', 'textile', ['leatherworker', 'cobbler'], 2, 0.05, { iron: 1, wood: 1 }, 'smith', 1.1, 1, '革に糸を通す穴をあける。'],
    ['shoelast', '靴の木型', 'textile', ['cobbler'], 5, 0.8, { wood: 1 }, 'carpenter', 1.2, 1, '靴を形作る足の形の木。'],
    ['potterswheel', 'ろくろ', 'textile', ['potter'], 40, 30, { wood: 3, stone: 2 }, 'carpenter', 1.5, 1, '回る台の上で土を器の形に挽く。据え置き。'],
    ['potterspaddle', '陶工のへら', 'textile', ['potter'], 2, 0.1, { wood: 1 }, 'carpenter', 1.1, 1, '土の器を整えるへらと切り糸。'],
    ['basketknife', 'かご編みの小刀', 'textile', ['basketweaver'], 3, 0.1, { iron: 1 }, 'smith', 1.2, 1, '柳の枝を割き、削る小刀。'],
    ['ropewalk', '縄ないの撚り車', 'textile', ['roper'], 20, 15, { wood: 4, iron: 1 }, 'carpenter', 1.5, 1, '長い縄を撚り合わせる車。据え置き。'],
    // 台所・薬・商い
    ['mortar', 'すり鉢', 'kitchen', ['cook', 'herbalist', 'baker'], 4, 2, { clay: 2 }, 'potter', 1.1, 2, '胡麻や薬草をすり潰す溝の付いた鉢。'],
    ['pestle', '乳鉢と乳棒', 'kitchen', ['herbalist', 'alchemist', 'doctor'], 8, 1.5, { stone: 1 }, 'mason', 1.2, 1, '薬を細かくすり潰す石の鉢。'],
    ['yagen', '薬研', 'kitchen', ['herbalist', 'doctor'], 15, 6, { iron: 2, wood: 1 }, 'smith', 1.3, 1, '舟形の溝で車輪を転がし薬を粉にする。'],
    ['alembic', '蒸留器', 'kitchen', ['alchemist', 'brewer', 'herbalist'], 60, 4, { copper: 2, glass: 1 }, 'glassblower', 1.5, 1, '液を熱して湯気を集め、強い酒や薬の精を取り出す。'],
    ['balance', '天秤', 'kitchen', ['merchant', 'changer', 'jeweler', 'herbalist'], 20, 1.5, { brass: 2 }, 'smith', 1.3, 2, '分銅と比べて重さを量る。商いの信用のもと。'],
    ['steelyard', '竿秤', 'kitchen', ['merchant', 'miller', 'butcher'], 10, 2, { iron: 1, wood: 1 }, 'smith', 1.2, 2, '竿と錘で重い荷を量る。'],
    ['measurebox', '升', 'kitchen', ['merchant', 'miller', 'farmer'], 2, 0.4, { wood: 1 }, 'carpenter', 1.1, 2, '穀物や酒を量る木の箱。'],
    ['ruler', '物差し', 'kitchen', ['tailor', 'carpenter', 'merchant'], 2, 0.1, { wood: 1 }, 'carpenter', 1.05, 2, '長さを測る目盛りの入った棒。'],
    ['hourglass', '砂時計', 'kitchen', ['scholar', 'doctor', 'cook', 'captain'], 25, 0.5, { glass: 1, sand: 1, wood: 1 }, 'glassblower', 1.1, 1, '砂が落ちきるまでで時を計る。'],
    ['kneadingtrough', '練り鉢', 'kitchen', ['baker'], 5, 5, { wood: 2 }, 'carpenter', 1.2, 2, 'パンの生地を捏ねる木の鉢。'],
    ['peel', 'パン窯のへら', 'kitchen', ['baker'], 4, 1.5, { wood: 1 }, 'carpenter', 1.2, 1, '窯の奥へパンを出し入れする長い柄の板。'],
    ['brewpaddle', '醸造の攪拌棒', 'kitchen', ['brewer'], 1, 1, { wood: 1 }, 'carpenter', 1.05, 1, '麦汁をかき混ぜる長い櫂。'],
    ['brewkettle', '醸造の大釜', 'kitchen', ['brewer', 'innkeeper'], 70, 30, { copper: 6 }, 'smith', 1.5, 1, '麦汁を煮る銅の大釜。据え置き。'],
    ['razor', '剃刀', 'kitchen', ['barber'], 6, 0.1, { steel: 1 }, 'smith', 1.2, 1, 'ひげを剃る鋭い刃。'],
    ['barbershears', '床屋の鋏', 'kitchen', ['barber'], 6, 0.2, { steel: 1 }, 'smith', 1.2, 1, '髪を切る小さな鋏。'],
    ['surgeonkit', '外科の小刀一式', 'kitchen', ['doctor'], 40, 1, { steel: 2, leather: 1 }, 'smith', 1.4, 1, '傷を縫い、矢じりを抜く小刀と鉗子の一揃い。'],
    ['splint', '添え木', 'kitchen', ['doctor', 'nun', 'cleric'], 1, 0.3, { wood: 1 }, 'carpenter', 1.1, 2, '折れた骨を固定する板。'],
    ['midwifekit', '産婆の道具包み', 'kitchen', ['midwife'], 15, 1, { linen: 2, steel: 1 }, 'tailor', 1.3, 1, '清めた布と小さなはさみと湯桶の一揃い。'],
    ['quill', '羽根ペン', 'kitchen', ['scribe', 'scholar', 'teacher', 'merchant'], 1, 0.01, { feather: 1 }, 'scribe', 1.1, 2, '鵞鳥の羽根を削ったペン。'],
    ['inkwell', 'インク壺', 'kitchen', ['scribe', 'scholar', 'teacher'], 3, 0.2, { clay: 1 }, 'potter', 1.05, 2, '墨を入れる小さな壺。'],
    ['writingslate', '石板と石筆', 'kitchen', ['teacher', 'merchant'], 3, 0.8, { slate: 1 }, 'mason', 1.1, 2, '何度も書いて消せる黒い石の板。子どもの手習いに。'],
    ['tools', '道具', 'set', ['smith', 'carpenter', 'farmer', 'miner'], 14, 5, { iron: 2, wood: 2 }, 'smith', 1.2, 3, 'よく使う道具をひとまとめにした一揃い。'],
    ['repairkit', '修繕道具の包み', 'set', ['adventurer', 'soldier', 'knight', 'warrior'], 12, 1.5, { leather: 1, iron: 1, hempthread: 2 }, 'smith', 1.1, 2, '旅先で武具を直す砥石・鋲・革紐の一揃い。耐久が少し戻る。'],
    ['lockpicks', '鍵開けの道具', 'set', ['thief', 'pickpocket', 'smuggler'], 20, 0.1, { steel: 1 }, 'smith', 1.4, 0, '細い針金と鉤の一揃い。持っているだけで疑われる。'],
    ['forgerykit', '偽造の道具', 'set', ['swindler'], 30, 0.5, { brass: 1, wax: 1 }, 'smith', 1.4, 0, '判と印章を偽る道具。見つかれば牢屋行き。'],
  ];
  for (const [id, name, sub, jobs, v, w, from, by, eff, dem, desc, stack] of T) add(F, { id, name, sub: 'tool_' + sub, w, v, stack: stack || 1, rare: 0, demand: dem,
    src: [CR], use: [{ k: 'tool', note: '仕事がはかどる' }, ...(from.iron || from.steel || from.copper ? [{ k: 'craft', note: '壊れたら鋳つぶして地金に' }] : [{ k: 'fuel', note: '壊れたら薪になる' }])],
    make: { from, by, t: r(1 + v / 6, 1) }, eq: { slot: 'tool', jobs, eff, ...(/据え置き/.test(desc) ? { place: 1 } : {}) }, desc });
  // 材質ちがいの道具（青銅：安いがはかどらない／鋼：よくはかどり長持ち）
  const TV = ['hoe', 'pickaxe', 'woodaxe', 'hammer', 'saw', 'sickle', 'chisel'];
  for (const tk of TV) {
    const b = T.find((x) => x[0] === tk);
    for (const [mk, mn, vm, em, dm] of [['bronze', '青銅の', 0.8, 0.9, 0.8], ['steel', '鋼の', 1.8, 1.4, 1.5]]) {
      const from = { ...b[6] }; const ni = from.iron || 1; delete from.iron; from[mk] = ni;
      add(F, { id: `${mk}_${tk}`, name: mn + b[1], sub: 'tool_' + b[2], w: b[5], v: r(b[4] * vm), rare: mk === 'steel' ? 1 : 0, demand: mk === 'steel' ? 1 : 2, src: [CR],
        use: [{ k: 'tool', note: '仕事がはかどる' }, { k: 'craft', note: '壊れたら鋳つぶして地金に' }], make: { from, by: 'smith', t: r(1 + b[4] / 6, 1) },
        eq: { slot: 'tool', jobs: b[3], eff: r(1 + (b[8] - 1) * em + (mk === 'steel' ? 0.05 : -0.05), 2), dur: dm }, desc: mk === 'steel' ? '鋼で作った刃。長持ちし、よく切れる。' : '青銅で作った昔ながらの道具。安いが刃がすぐ鈍る。' });
    }
  }

  // ---- 金物（建物と家具の材料） ----
  const HW = [
    ['nails', '鉄釘', { iron: 1 }, 0.01, 0.1, 100, 3, '家・船・樽を組む鉄の釘。一度に50本打ち出す。', 50],
    ['coppernails', '銅釘', { copper: 1 }, 0.01, 0.2, 100, 1, '船底に打つ錆びない銅の釘。', 50],
    ['hinge', '蝶番', { iron: 1 }, 0.2, 2, 20, 2, '扉や蓋を開け閉めさせる金具。', 2],
    ['lock', '錠前と鍵', { iron: 1, brass: 1 }, 0.4, 12, 5, 2, '扉や箱に取り付ける錠前。鍵は二本。', 1],
    ['padlock', '掛け錠', { iron: 1 }, 0.3, 6, 5, 1, '鎖や掛け金に掛ける錠。', 1],
    ['chain', '鎖', { iron: 2 }, 2, 8, 5, 1, '鉄の輪をつないだ鎖。井戸・門・牢で使う。', 1],
    ['barrelhoop', '樽の箍', { iron: 1 }, 0.5, 1.5, 20, 1, '樽の板を締める鉄の輪。', 4],
    ['clamp', '鎹', { iron: 1 }, 0.2, 0.5, 50, 1, '材木どうしをつなぐコの字の金具。', 10],
    ['doorhandle', '扉の取っ手と掛け金', { iron: 1 }, 0.3, 2, 20, 1, '扉に付ける取っ手と掛け金。', 1],
    ['bell', '鐘', { bronze: 20 }, 30, 150, 1, 1, '教会や見張り塔に吊るす青銅の鐘。火事と魔物を知らせる。', 1],
    ['handbell', '手鈴', { bronze: 1 }, 0.3, 5, 10, 1, '触れ役や物売りが振る鈴。', 1],
  ];
  for (const [id, name, from, w, v, stack, dem, desc, n] of HW) add(F, { id, name, sub: 'hardware', w, v, stack, demand: dem, src: [CR],
    use: [{ k: 'build', note: '家・家具・船を組む' }, { k: 'craft' }, ...(id === 'bell' || id === 'handbell' ? [{ k: 'ritual', note: '祈りの時刻を告げる' }] : [])],
    make: { from, by: 'smith', t: r(1 + v / 10, 1), n }, desc });

  // ---- 運ぶ物（乗り物・馬具） carry＝運べる重さ(kg)。引く者：pull ----
  const VH = [
    ['wheelbarrow', '手押し車', 'vehicle', 80, 'man', 15, 20, { wood: 3, iron: 1 }, 'carpenter', 2, '一輪の手押し車。道の上だけ。鉱夫・石工・農民の友。'],
    ['handcart', '二輪の手車', 'vehicle', 150, 'man', 30, 40, { wood: 5, iron: 1 }, 'wheelwright', 2, '人が引く二輪の荷車。'],
    ['cart', '荷車', 'vehicle', 500, 'donkey', 120, 100, { wood: 6, iron: 2 }, 'wheelwright', 1, 'ロバか馬が引く二輪の荷車。'],
    ['wagon', '四輪の荷馬車', 'vehicle', 700, 'horse', 250, 220, { wood: 10, iron: 4 }, 'wheelwright', 1, '二頭の馬で引く大きな荷馬車。'],
    ['coveredwagon', '幌馬車', 'vehicle', 700, 'horse', 280, 320, { wood: 10, iron: 4, sailcloth: 4 }, 'wheelwright', 1, '帆布の幌を掛けた荷馬車。雨でも荷が濡れない。隊商の家にもなる。'],
    ['stagecoach', '乗合馬車', 'vehicle', 300, 'horse', 400, 400, { wood: 12, iron: 5, leather: 4 }, 'wheelwright', 1, '町から町へ人を乗せて走る箱馬車。'],
    ['noblecarriage', '貴族の馬車', 'vehicle', 200, 'horse', 450, 1200, { wood: 12, iron: 5, velvet: 3, gold: 1 }, 'wheelwright', 0, '彫刻と天鵞絨の内張りの馬車。'],
    ['royalcarriage', '王家の馬車', 'vehicle', 200, 'horse', 600, 5000, { ebony: 10, gold: 5, velvet: 5, steel: 4 }, 'wheelwright', 0, '金で飾った王家の馬車。四頭の白馬で引く。'],
    ['oxcart', '牛車', 'vehicle', 800, 'ox', 300, 120, { oak: 10, iron: 2 }, 'wheelwright', 1, '牛が引く頑丈な荷車。遅いが木材も石材も運べる。'],
    ['sled', 'そり', 'vehicle', 100, 'man', 12, 12, { wood: 3, rope: 1 }, 'carpenter', 1, '雪と森では荷車より速い。'],
    ['dogsled', '犬ぞり', 'vehicle', 200, 'dog', 20, 30, { wood: 3, leather: 2 }, 'carpenter', 1, '犬の群れに引かせる雪国のそり。'],
    ['horsesled', '馬ぞり', 'vehicle', 400, 'horse', 60, 60, { wood: 5, iron: 1 }, 'carpenter', 1, '冬に馬が引く大きなそり。'],
    ['stoneboat', '石運びの修羅', 'vehicle', 600, 'ox', 80, 25, { oak: 6 }, 'carpenter', 1, '大石を載せて牛に引かせる平たいそり。城や砦の普請に。'],
    ['litter', '輿', 'vehicle', 100, 'man', 30, 150, { wood: 4, silkcloth: 2 }, 'carpenter', 0, '担ぎ手が担ぐ、貴人の乗る箱。'],
    ['stretcher', '担架', 'vehicle', 100, 'man', 6, 5, { wood: 2, hempcloth: 1 }, 'carpenter', 1, 'けが人を運ぶ二本の棒と布。'],
    ['raft', '筏', 'boat', 300, 'man', 60, 10, { wood: 8, rope: 2 }, 'carpenter', 1, '丸太を組んだ筏。川を下って材木を運ぶ。'],
    ['dugout', '丸木舟', 'boat', 200, 'man', 80, 30, { wood: 6 }, 'shipwright', 1, '一本の大木をくり抜いた舟。'],
    ['rowboat', '小舟', 'boat', 400, 'man', 120, 80, { wood: 8, nails: 2, pitch: 1 }, 'shipwright', 1, '櫂で漕ぐ小さな舟。漁師と渡し守の舟。'],
    ['fishingboat', '漁船', 'boat', 1500, 'man', 800, 400, { wood: 30, sailcloth: 3, nails: 4, pitch: 3 }, 'shipwright', 1, '帆と櫂で沖へ出る漁の船。'],
  ];
  for (const [id, name, sub, carry, pull, w, v, from, by, dem, desc] of VH) add(F, { id, name, sub, w, v, rare: v >= 1000 ? 2 : 0, demand: dem, src: [CR],
    use: [{ k: 'tool', note: `荷を${carry}kgまで運ぶ` }, ...(v >= 1000 ? [{ k: 'luxury', note: '身分のしるし' }] : []), { k: 'fuel', note: '壊れたら薪と鉄くずに' }],
    make: { from, by, t: r(4 + v / 8, 1) }, carry, pull, desc });
  const TACK = [
    ['saddle', '鞍', 30, 8, { leather: 4, wood: 1, iron: 1 }, 1, '馬に乗るための革の鞍。'],
    ['packsaddle', '荷鞍', 20, 7, { wood: 2, leather: 2 }, 1, 'ロバや荷馬の背に荷を積む木の鞍。'],
    ['bridle', '手綱と轡', 10, 1, { leather: 2, iron: 1 }, 2, '馬の口に噛ませ、向きを操る。'],
    ['stirrups', '鐙', 8, 1.5, { iron: 1, leather: 1 }, 1, '足を掛ける輪。馬上で踏ん張り、槍を構えられる。'],
    ['harness', '輓具', 25, 6, { leather: 4, iron: 1 }, 1, '馬や牛に荷車を引かせる革の胸当てと引き綱。'],
    ['yoke', '牛の軛', 12, 10, { oak: 2 }, 1, '二頭の牛の首にかける木の横木。'],
    ['horsetack', '馬具一式', 60, 12, { leather: 8, iron: 2, wood: 1 }, 1, '鞍・手綱・鐙・腹帯をひと揃いにしたもの。'],
    ['horseshoe', '蹄鉄', 2, 0.4, { iron: 1 }, 2, '馬の蹄に打つ鉄。四つひと組で使う。', 4],
    ['barding', '馬鎧', 300, 30, { iron: 15, leather: 6 }, 0, '軍馬に着せる鎖と板金の鎧。'],
    ['chanfron', '馬の面当て', 60, 3, { steel: 2, leather: 1 }, 0, '軍馬の顔を守る板金の面。'],
    ['camelsaddle', '駱駝の鞍', 35, 9, { wood: 2, woolcloth: 2, leather: 2 }, 1, 'こぶの上に載せる砂の国の鞍。'],
    ['wyvernsaddle', 'ワイバーンの鞍', 400, 10, { wyvern_hide: 2, steel: 2, leather: 4 }, 0, '飛竜を乗りこなす竜騎兵の鞍。落ちないよう脚を縛る帯が付く。'],
    ['dogharness', '犬ぞりの引き具', 8, 1, { leather: 2 }, 1, '犬の胸に掛ける引き綱。'],
    ['horseblanket', '馬衣', 10, 3, { woolcloth: 2 }, 1, '冬や行列で馬に掛ける布。家の紋章を染める。'],
    ['feedbag', '飼い葉袋', 2, 0.3, { hempcloth: 1 }, 2, '馬の口に掛けて燕麦を食べさせる袋。'],
    ['currycomb', '馬櫛', 3, 0.3, { iron: 1, wood: 1 }, 1, '馬の毛並みを整える櫛。馬丁の道具。'],
  ];
  for (const [id, name, v, w, from, dem, desc, stack] of TACK) add(F, { id, name, sub: 'tack', w, v, stack: stack || 1, rare: v >= 300 ? 2 : 0, demand: dem, src: [CR],
    use: [{ k: 'tool', note: '馬・ロバ・牛に付ける' }, ...(v >= 60 ? [{ k: 'trade' }] : [])],
    make: { from, by: id === 'horseshoe' || id === 'barding' || id === 'chanfron' ? 'smith' : id === 'yoke' || id === 'packsaddle' ? 'carpenter' : 'saddler', t: r(1 + v / 8, 1) },
    eq: { slot: 'tool', jobs: ['stablehand', 'coachman', 'knight', 'rancher', 'peddler', 'merchant'], eff: 1.1, beast: 1, ...(id === 'barding' ? { def: 6 } : id === 'chanfron' ? { def: 2 } : {}) }, desc });
}
