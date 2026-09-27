import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);
const WZ = 'wizard', CM = 'courtmage', PR = 'priest';

// ================= 巻物（1回使うと消える） =================
const SC = [
  ['light', '灯火', 6, 0, { light: 10, hours: 8 }, '暗い所を照らす光の玉を呼ぶ。'],
  ['fireball', '火球', 20, 1, { dmg: 40, elem: 'fire' }, '魔物の群れに火の玉を放つ。'],
  ['icebolt', '氷の矢', 18, 1, { dmg: 35, elem: 'ice' }, '鋭い氷の矢を撃ち出す。'],
  ['thunder', '雷撃', 26, 1, { dmg: 50, elem: 'thunder' }, '空から雷を落とす。'],
  ['windblade', '風の刃', 16, 1, { dmg: 30, elem: 'wind' }, '見えない風の刃で切り裂く。'],
  ['stonewall', '石の壁', 22, 1, { wall: true }, '地面から石の壁をせり上げる。籠城に。'],
  ['heal', '癒し', 14, 0, { hp: 50 }, '読み上げると傷がふさがる。'],
  ['heal_all', '皆の癒し', 40, 1, { hp: 40, area: true }, 'まわりの仲間すべての傷を癒す。'],
  ['cure', '病払い', 30, 1, { cure: 'any', sev: 30 }, '病人の熱と痛みを払う。'],
  ['uncurse', '解呪', 45, 2, { cure: 'curse' }, '呪いの品と呪われた者を清める。'],
  ['ward', '守りの結界', 35, 1, { ward: 'monster', days: 3 }, '三日のあいだ魔物が近寄れない円を張る。'],
  ['return', '帰還', 30, 1, { teleport: 'home' }, 'ダンジョンの奥から一瞬で町へ帰る。'],
  ['invis', '姿隠し', 40, 2, { invis: true, hours: 1 }, 'ひととき姿を消す。'],
  ['levitate', '浮遊', 25, 1, { fall: true, hours: 1 }, '体が宙に浮く。崖も谷も渡れる。'],
  ['waterwalk', '水上歩き', 20, 1, { waterwalk: true, hours: 4 }, '川や沼の上を歩いて渡れる。'],
  ['nightsight', '暗視', 10, 0, { sight: 10, hours: 8 }, '闇の中でもよく見える。'],
  ['identify', '鑑定', 8, 0, { identify: true }, '拾った品の正体と値打ちがわかる。'],
  ['detect', '宝探し', 25, 1, { detect: 'treasure' }, '近くに埋まった宝のありかが光って見える。'],
  ['repel', '魔物除け', 18, 0, { ward: 'monster', hours: 12 }, '旅のあいだ魔物を遠ざける。'],
  ['sleepmist', '眠りの霧', 20, 1, { sleep: 8, area: true }, '眠りの霧で敵を眠らせる。'],
  ['fear', '恐怖', 22, 1, { fear: true }, '敵を恐怖で逃げ出させる。'],
  ['charm', '魅了', 50, 2, { love: 15 }, '相手を一時こちらの味方にする。'],
  ['rain', '雨乞い', 40, 1, { weather: 'rain' }, 'その地に雨を呼ぶ。日照りの村が欲しがる。'],
  ['harvest', '豊穣', 45, 1, { crop: 20, days: 10 }, '畑の実りを増やす。'],
  ['familiar', '使い魔召喚', 55, 2, { summon: 'familiar' }, '小さな使い魔を呼び出して手伝わせる。'],
  ['seal', '封印', 80, 3, { seal: true }, '魔物や呪いを壺や石に封じる。'],
  ['message', '伝言', 5, 0, { message: true }, '遠くの人へ声を届ける。商人と伝令が使う。'],
  ['mapping', '地図描き', 15, 0, { map: true }, '読んだ場所の見取り図が紙に浮かぶ。'],
  ['resurrect', '蘇生', 900, 4, { revive: true }, '死んで間もない者を生き返らせる。伝説の巻物。'],
  ['meteor', '星落とし', 400, 4, { dmg: 300, area: true }, '空から星を落とす。古王国の大魔法。'],
];
for (const [k, n, v, r, fx, desc] of SC) C(`scroll_${k}`, `${n}の巻物`, 'scroll', 0.1, v, r >= 3 ? CM : WZ, { scroll_blank: 1, ink_magic: 1 + (r >= 2 ? 1 : 0), ...(r >= 3 ? { crystal: 1 } : r >= 1 ? { mana_crystal_s: 1 } : {}) }, 2 + r * 2, { st: 10, r, d: r ? 0 : 1, use: U('magic:読み上げると魔法が出る（1回きり）', r >= 3 ? 'collect:王家の宝物庫' : 'quest'), fx, desc, more: [loot(D, r >= 3 ? 0.002 : r >= 2 ? 0.02 : 0.06)] });

// ================= 呪文書（読むと魔法を覚える） =================
const SCH = [['fire', '火'], ['water', '水'], ['wind', '風'], ['earth', '土'], ['light', '光'], ['dark', '闇']];
const LV = [['basic', '初級', 30, 0, 'magister'], ['mid', '中級', 90, 1, WZ], ['high', '上級', 280, 2, CM]];
for (const [s, n] of SCH) for (const [l, ln, v, r, by] of LV) C(`spellbook_${s}_${l}`, `${n}の魔導書・${ln}`, 'spellbook', 1.2, s === 'dark' ? v * 1.5 : v, by, { book_blank: 1, ink_magic: 2 + r * 2, [`${s}_essence`]: r }, 20 + r * 30, { st: 1, r: r + (s === 'dark' ? 1 : 0), d: r ? 0 : 1, use: U(`magic:読むと${n}の魔法を${ln}まで覚える`, 'trade', ...(s === 'dark' ? ['collect:禁書の好事家'] : [])), fx: { learn: s, lv: r + 1 }, desc: `${n}の魔法の呪文と印の結び方を記した${ln}の書。${s === 'dark' ? '教会は持つことを禁じている。' : ''}`, more: [loot(D, 0.02 / (r + 1)), trade()] });
C('spellbook_heal', '癒しの祈祷書', 'spellbook', 1, 80, PR, { book_blank: 1, ink_gold: 1, holy_water: 1 }, 30, { st: 1, r: 1, use: U('magic:読むと癒しの魔法を覚える', 'ritual'), fx: { learn: 'heal', lv: 1 }, desc: '僧侶と修道女が学ぶ癒しの祈りの書。' });
C('spellbook_barrier', '結界魔法の書', 'spellbook', 1.5, 200, CM, { book_blank: 1, ink_magic: 4, crystal: 1 }, 60, { st: 1, r: 2, use: U('magic:町を守る結界の研究', 'trade'), fx: { learn: 'barrier', lv: 1, research: 30 }, desc: '町に魔物を近づけない結界の張り方。' });
C('spellbook_necro', '死霊術の書', 'spellbook', 1.4, 600, 'lich', { book_blank: 1, ink_blood: 3, bone_ash: 3 }, 90, { st: 1, r: 3, use: U('magic:死者を操る禁呪', 'collect:禁書の好事家'), fx: { learn: 'necro', lv: 1, curse: 2 }, desc: 'リッチが書き残したという禁書。持つだけで異端とされる。', more: [loot(['dungeon', 'ruins', 'demoncastle'], 0.01)] });
C('spellbook_summon', '召喚術の書', 'spellbook', 1.4, 450, CM, { book_blank: 1, ink_magic: 5, demoncore_essence: 1 }, 80, { st: 1, r: 3, use: U('magic:魔物を呼び出して従える'), fx: { learn: 'summon', lv: 1 }, desc: '魔物を呼び出す円の描き方を記した書。', more: [loot(['demoncastle'], 0.01)] });

// ================= 護符・お守り（身につける） =================
const acc = { slot: 'accessory' };
C('amulet', '護りの護符', 'charm', 0.1, 90, CM, { magicstone: 1, silver: 0.3 }, 4, { st: 1, r: 1, use: U('wear:守りが上がる', 'gift'), fx: { def: 3 }, eq: acc, desc: '魔石を銀で包んだ護符。身につけると刃がそれる。', more: [loot(D, 0.05)] });
C('charm', '護符・お守り', 'charm', 0.05, 10, 'jeweler', { fang: 1, bone: 1 }, 1, { d: 2, st: 5, use: U('wear:冒険者と信心深い人のお守り', 'gift'), fx: { luck: 2 }, eq: acc, desc: '牙と骨を編んだ、どこでも売っているお守り。' });
const CH = [
  ['talisman_paper', '魔除けの札', { paper_reed: 1, vermilion: 0.2 }, 3, PR, { ward: 'evil' }, '朱で印を書いた札。戸口に貼る。', 2],
  ['bell_ward', '厄除けの鈴', { copper: 0.2 }, 5, PR, { ward: 'evil' }, '悪いものが嫌う澄んだ音の鈴。', 1],
  ['charm_travel', '旅の守り', { cloth: 0.1, silver_powder: 0.2 }, 6, PR, { ward: 'road', luck: 2 }, '旅人と行商人が首にかける守り袋。', 2],
  ['charm_birth', '安産の守り', { cloth: 0.1, holy_water: 0.2 }, 6, 'midwife', { safebirth: 10 }, '身ごもった女が腹帯に縫いつける守り。', 1],
  ['charm_trade', '商売繁盛の守り', { copper: 0.1, gold_leaf: 0.2 }, 8, PR, { trade: 5 }, '商人が帳場に飾る金色の守り。', 1],
  ['charm_harvest', '豊作の守り', { wheat: 1, yarn: 0.1 }, 3, 'farmer', { crop: 3 }, '麦の穂を編んだ人形の守り。畑の小屋に吊るす。', 1],
  ['charm_love', '恋結びの守り', { yarn: 0.1, rose: 1 }, 5, 'fortune', { love: 5 }, '赤い糸で薔薇の花びらを結んだ守り。', 1],
  ['charm_study', '学びの守り', { owl_feather: 1 }, 5, 'teacher', { focus: 3 }, 'フクロウの羽根の守り。学ぶ子の筆入れに。', 1],
  ['charm_sea', '航海安全の守り', { seashell_cowrie: 1, yarn: 0.1 }, 6, 'priest', { ward: 'sea' }, '船乗りが帆柱に結ぶ宝貝の守り。', 1],
  ['charm_fire', '火除けの守り', { water_essence: 0.2, paper_reed: 1 }, 8, PR, { ward: 'fire' }, '台所と鍛冶場の守り。', 1],
  ['charm_wolf', '狼除けの守り', { fang: 2 }, 4, 'hunter', { ward: 'beast' }, '狼の牙を束ねた、羊飼いの守り。', 1],
  ['charm_sick', '病除けの守り', { garlic: 1, cloth: 0.1 }, 4, 'nun', { ward: 'sick' }, '大蒜と香草を入れた匂い袋。', 2],
  ['dreamcatcher', '夢捕りの輪', { willow_twig: 1, yarn: 0.2, feather: 2 }, 6, 'shaman', { ward: 'nightmare', mood: 2 }, '枕もとに吊るすと悪い夢を網でからめ取る。', 1],
  ['evil_eye', '邪眼除けの青い目玉', { glass: 0.1, lapis: 0.1 }, 7, 'glassblower', { ward: 'curse' }, '青い硝子の目玉。ねたみの目をはね返す。サハルの名物。', 1],
  ['charm_clover', '四つ葉の押し葉の守り', { clover4: 1, paper_reed: 1 }, 12, 'gardener', { luck: 5 }, '四つ葉を押して包んだ守り。めったに作れない。', 1],
  ['rabbit_foot', '兎の足のお守り', { rabbit_foot: 1 }, 5, 'hunter', { luck: 3 }, '兎の後ろ足。幸運を呼ぶと信じられている。', 1],
  ['horseshoe_charm', '蹄鉄のお守り', { horseshoe: 1 }, 3, 'smith', { luck: 2, ward: 'evil' }, '古い蹄鉄を戸口に打ちつける。', 1],
  ['charm_holysilver', '聖銀の護符', { holy_silver: 0.3 }, 70, PR, { ward: 'undead', def: 2 }, '不死の魔物が近寄れない聖銀の護符。', 0],
  ['charm_dragonscale', '竜鱗の護符', { scale: 1, gold: 0.1 }, 90, 'jeweler', { ward: 'fire', def: 3 }, '竜の鱗を金で縁取った護符。火を寄せつけない。', 0],
  ['charm_spirit', '精霊の加護の護符', { spirit_feather: 1, silver: 0.2 }, 150, CM, { mana: 20, luck: 5 }, '精霊の羽根を封じた護符。魔力がわき出る。', 0],
];
for (const [id, name, from, v, by, fx, desc, d] of CH) C(id, name, 'charm', 0.05, v, by, from, 1 + (v > 50 ? 4 : 0), { st: 5, r: v > 100 ? 2 : v > 50 ? 1 : 0, d, use: U(fx.def ? 'wear:身につけて身を守る' : 'wear:身につける・戸口に飾る', v > 50 ? 'collect' : 'gift'), fx, eq: acc, desc, more: v > 50 ? [loot(D, 0.02)] : [] });

// ================= 呪いの品 =================
const CU = [
  ['curse_doll', '呪いの藁人形', 8, 1, { curse: 2 }, '恨む相手の髪を入れて釘を打つ人形。', { straw: 1, iron: 0.05 }],
  ['curse_ring', '外れない呪いの指輪', 50, 2, { curse: 3, luck: -5 }, 'はめたが最後、外れない。美しいので売れてしまう。', null],
  ['curse_necklace', '不幸の首飾り', 80, 2, { curse: 3, luck: -8 }, '持ち主が次々と死んだという真珠の首飾り。', null],
  ['curse_mirror', '嘆きの鏡', 120, 3, { curse: 4, mood: -10 }, '夜ごと映った者の泣き声が聞こえる古い鏡。', null],
  ['curse_coin', '呪われた金貨', 30, 2, { curse: 2, luck: -3 }, '海賊の宝の金貨。使っても使っても財布に戻ってくる。', null],
  ['curse_hand', '干からびた骸骨の手', 25, 1, { curse: 1 }, '墓から掘り出された手。夜中に指が動く。', null],
  ['curse_nail', '呪詛の釘', 3, 0, { curse: 1 }, '呪いの儀式に使う黒い釘。', { iron: 0.05, dark_essence: 0.1 }],
  ['curse_feather', '黒い羽根の呪符', 12, 1, { curse: 2 }, '鴉の羽根に血で呪文を書いた札。', { crow_feather: 1, ink_blood: 0.2 }],
  ['curse_hair', '死者の髪の房', 6, 1, { curse: 1 }, '棺から切り取った髪。死霊術の材料。', null],
  ['curse_seal', '魔王の印章', 400, 3, { curse: 5, fame: 5 }, '歴代魔王の印章。持つ者には魔物が従うというが…。', null],
  ['curse_music_box', '止まらない手回し箱', 40, 2, { curse: 2, sleep: -5 }, '夜になると勝手に子守歌を鳴らす小箱。', null],
  ['curse_portrait', '目が動く肖像画', 90, 2, { curse: 2, mood: -5 }, '見る者を目で追う貴婦人の絵。屋敷に置くと住み手が逃げる。', null],
];
for (const [id, name, v, r, fx, desc, from] of CU) {
  const o = { st: 1, r, d: 0, lim: from ? undefined : 'relic', use: U('magic:呪いの研究・解呪の修行', 'trade:好事家と闇の商人が買う', 'quest:解呪の依頼', 'ritual:教会に納めて清めてもらう'), fx, desc };
  if (from) C(id, name, 'curse', 0.2, v, 'witch', from, 1, { ...o, more: [loot(D, 0.05)] });
  else I(id, name, 'curse', 0.3, v, { ...o, src: [loot(D, 0.02), g('forage', ['ruins'], 0.01)] });
}

// ================= 占いの道具 =================
const DV = [
  ['crystal_ball_s', '小さな水晶玉', { quartz: 1 }, 30, 'jeweler', 1, '町の占い師が使う手のひらの水晶玉。'],
  ['crystal_ball', '水晶玉', { quartz: 3, manastone_dust: 1 }, 120, CM, 2, '覗くと遠くの景色が映るという大きな水晶玉。'],
  ['fate_cards', '運命の札', { paper_reed: 3, ink_color: 1 }, 12, 'fortune', 0, '二十二枚の絵札。占い師の商売道具。'],
  ['oracle_bones', '骨占いの骨', { bone: 3 }, 5, 'shaman', 0, '獣の骨を焼いてひびで吉凶を読む。民族の巫女が使う。'],
  ['pendulum', '探し物の振り子', { quartz: 0.3, yarn: 0.1 }, 8, 'fortune', 0, '地図の上に垂らすと、失くし物や水脈を指す。'],
  ['magic_mirror', '魔鏡', { silver: 1, glass: 1, manastone_dust: 2 }, 200, CM, 2, '問いかけると真実を映すという鏡。'],
  ['astrolabe', '星読みの盤', { copper: 2 }, 60, 'scholar', 1, '星の高さを測る真鍮の盤。占星術と航海に。'],
  ['rune_stones', '古文字の石', { stone: 1, ochre: 0.1 }, 10, 'shaman', 0, '古い文字を刻んだ小石の袋。振って吉凶を読む。'],
];
for (const [id, name, from, v, by, r, desc] of DV) C(id, name, 'divine', r ? 1.5 : 0.3, v, by, from, 2 + r * 4, { st: 1, r, use: U('tool:占い（先のことを知る）', 'hobby:占いの手習い', r ? 'collect' : 'trade'), fx: { foresee: 1 + r }, desc, more: r >= 2 ? [loot(D, 0.01)] : [] });

// ================= 杖の芯と木地 =================
const WC = [
  ['wandcore_stone', '魔石の芯', { magicstone: 1 }, 35, 0, '最もよくある杖の芯。安定して扱いやすい。'],
  ['wandcore_unicorn', '一角獣のたてがみの芯', { unicorn_hair: 1 }, 120, 2, '癒しの魔法がよく通る、白く光る芯。'],
  ['wandcore_dragon', '竜の髭の芯', { dragon_whisker: 1 }, 200, 3, '火の魔法を倍にする荒々しい芯。'],
  ['wandcore_spirit', '精霊樹の芯', { spirit_wood: 1 }, 90, 2, '風と森の魔法に向く、生きている木の芯。'],
  ['wandcore_moonsilver', '月銀の芯', { holy_silver: 0.5 }, 110, 2, '光の魔法と死霊払いに向く聖銀の芯。'],
  ['wandcore_thunder', '雷鳥の羽根の芯', { thunderbird_feather: 1 }, 140, 3, 'ドルグ族の雷鳥の羽根。雷の魔法がほとばしる。'],
  ['wandcore_demon', '魔核の芯', { demoncore: 1 }, 180, 3, '闇の魔法が強まるが、持ち手の心をむしばむ。'],
  ['wandcore_silk', '蜘蛛女の銀糸の芯', { silk: 3, silver_powder: 1 }, 60, 1, 'アラクネの糸を撚った芯。眠りと魅了の魔法に。'],
  ['wandcore_bone', '死霊の骨芯', { bone: 2, dark_essence: 1 }, 70, 2, 'リッチの杖に使われていた骨の芯。'],
  ['wandcore_coral', '珊瑚の芯', { coral: 1 }, 50, 1, '水の魔法に向く、海の民の杖の芯。'],
];
for (const [id, name, from, v, r, desc] of WC) C(id, name, 'wandcore', 0.1, v, 'wandmaker', from, 4 + r * 3, { st: 5, r, d: 0, use: U('craft:魔法の杖を作る', 'magic', 'trade'), desc, more: r >= 2 ? [loot(D, 0.01)] : [] });
C('wand_blank', '杖の木地', 'wandcore', 0.4, 4, 'carpenter', { wood: 1 }, 1, { st: 5, use: U('craft:魔法の杖を作る'), desc: '樫やイチイを削った、芯を入れる前の杖。' });

// ================= 魔導具 =================
const DEV = [
  ['lightstone', '明かりの石', { magicstone: 0.2, quartz: 0.5 }, 18, 2, { light: 6 }, 'なでると一晩じゅう光る石。蝋燭いらず。', 'tool:家と坑道の明かり'],
  ['magiclamp', '魔灯', { magicstone: 0.3, glass: 1, iron: 0.2 }, 34, 2, { light: 10 }, '屋敷と灯台と街路を照らす魔法の灯り。', 'tool:屋敷・灯台・街路の明かり'],
  ['warmstone', '暖の石', { fire_essence: 0.2, stone: 1 }, 20, 2, { warmth: 10 }, '冬の寝床に入れると朝までぽかぽか。北の国の必需品。', 'tool:冬の寒さしのぎ'],
  ['coolstone', '冷えの石', { water_essence: 0.2, stone: 1 }, 20, 1, { cool: 10 }, '砂漠の家と食料庫を冷やす石。', 'tool:夏と砂漠の暑さしのぎ・食料を冷やす'],
  ['waterjar', '水を生む壺', { water_essence: 1, pottery: 1 }, 90, 1, { water: 20 }, '一日に桶二杯の水がわく壺。砂漠の隊商が命より大事にする。', 'tool:水のない土地で水を得る'],
  ['firestarter', '火種の石', { fire_essence: 0.1, flint: 1 }, 6, 2, { fire: true }, '打てば必ず火がつく石。野営と台所に。', 'tool:火をおこす'],
  ['windbell', '涼風の鈴', { wind_essence: 0.2, copper: 0.2 }, 15, 1, { cool: 4, mood: 2 }, '鳴るたびに涼しい風が吹く鈴。', 'tool:夏の涼'],
  ['keepbox', '保存の箱', { wood: 3, water_essence: 0.5 }, 60, 1, { fresh: 5 }, '入れた食べ物が五倍長持ちする箱。宮廷の台所に。', 'tool:食べ物を長持ちさせる'],
  ['speakshell', '遠声の貝', { seashell_conch: 2, wind_essence: 0.5 }, 120, 1, { message: true }, '二つで一組。片方に話すともう片方から声が出る。', 'tool:遠くの人と話す（軍と商会）'],
  ['magic_key', '魔法の鍵', { iron: 0.2, manastone_dust: 1 }, 45, 1, { unlock: true }, 'たいていの錠前を開けてしまう鍵。', 'tool:錠前を開ける'],
  ['watcheye', '見張りの目玉', { glass: 0.5, dark_essence: 0.3 }, 70, 1, { alarm: true }, '怪しい者が近づくと鳴く硝子の目玉。倉と宝物庫に。', 'tool:盗賊よけの警報'],
  ['magic_bag', '魔法の袋', { leather: 1, wind_essence: 1, silk: 1 }, 250, 0, {}, '見た目は小さいが、荷車一台分が入る袋。', 'wear:たくさんの荷を運ぶ'],
  ['purestone', '浄水の石', { light_essence: 0.2, quartz: 0.5 }, 25, 2, { cure: 'belly', sev: 5 }, '井戸に沈めると水が清まり、腹下しが減る。', 'tool:井戸と水甕を清める'],
  ['homestone', '帰還の石', { crystal: 0.2, stone: 1 }, 80, 1, { teleport: 'home' }, '握って念じると、家の暖炉の前に帰れる石。', 'tool:冒険の帰り道'],
  ['compass_magic', '方位の魔針', { iron: 0.1, manastone_dust: 0.5 }, 22, 1, { navigate: true }, '北ではなく、探す物の方を指す針。', 'tool:道と宝を探す'],
  ['flying_carpet', '空飛ぶ絨毯', { cloth: 6, wind_essence: 5, crystal: 1 }, 1500, 0, { fly: true }, '古王国の遺跡から見つかったという、空を飛ぶ絨毯。', 'collect:伝説の品'],
  ['vanity_mirror', '美しく映る鏡', { silver: 0.5, glass: 1, light_essence: 0.2 }, 60, 1, { mood: 4, beauty: 3 }, '見る者を少しだけ美しく映す鏡。貴婦人に人気。', 'luxury:化粧台に'],
  ['translate_earring', '通訳の耳飾り', { silver: 0.2, wind_essence: 0.3 }, 140, 0, { speak: 'all' }, '民族の言葉も古語も聞き取れる耳飾り。', 'wear:よその民族と話す'],
  ['growcrystal', '温室の結晶', { earth_essence: 1, quartz: 1 }, 100, 1, { crop: 8 }, '畑に埋めると冬でも作物が育つ結晶。', 'tool:畑の実りを増やす'],
  ['barrierstone', '結界石', { crystal: 1, holy_silver: 0.5 }, 600, 1, { ward: 'monster', area: 'town' }, '町の四隅に置くと魔物が近づきにくくなる大石。', 'build:町の守り'],
  ['sweepbroom', 'ひとりでに掃く箒', { straw: 2, wood: 1, wind_essence: 0.5 }, 50, 0, { clean: 20 }, '夜のうちに床を掃いてくれる箒。宿屋のおかみの憧れ。', 'tool:家の掃除'],
  ['wakebell', '目覚めの鐘', { copper: 0.5, manastone_dust: 0.3 }, 18, 1, { wake: true }, '決めた刻に自分で鳴る小さな鐘。', 'tool:朝寝坊を起こす'],
  ['copyquill', '写しの魔筆', { eagle_feather: 1, ink_magic: 1 }, 90, 1, { research: 3 }, '書物の上を走らせると白紙に写しを取る羽ペン。', 'tool:書物を写す'],
  ['memorycrystal', '記憶の水晶', { quartz: 1, manastone_dust: 2 }, 110, 1, { record: true }, '見聞きしたことを閉じ込め、あとで映し出す水晶。', 'collect:思い出を残す'],
  ['heatstone_forge', '炉熱の魔石', { fire_essence: 1, magicstone: 1 }, 70, 1, { forge: 5 }, '鍛冶炉に入れると木炭いらずで鉄が溶ける。', 'tool:鍛冶の燃料を減らす'],
  ['rain_rod', '雨呼びの杖', { water_essence: 2, wand_blank: 1 }, 160, 1, { weather: 'rain' }, '日照りの畑で振ると雲が集まる杖。', 'tool:日照りを終わらせる'],
  ['bottomless_flask', '尽きない水筒', { leather: 1, water_essence: 0.5 }, 45, 1, { drink: 30 }, 'いくら飲んでも水が尽きない革の水筒。', 'tool:旅と砂漠越え'],
  ['glowdust', '光る砂', { manastone_dust: 0.5, sand: 1 }, 4, 1, { light: 2 }, '撒くとしばらく光る砂。坑道や迷宮の道しるべに。', 'tool:道しるべ'],
];
for (const [id, name, from, v, d, fx, desc, use] of DEV) {
  const r = v >= 500 ? 3 : v >= 100 ? 2 : v >= 40 ? 1 : 0;
  C(id, name, 'device', v >= 500 ? 5 : 0.5, v, id === 'barrierstone' ? CM : 'enchanter', from, 2 + r * 4, { st: v < 30 ? 10 : 1, r, d, use: U(use, 'magic', r >= 2 ? 'collect' : 'trade'), fx, eq: id === 'magic_bag' ? { slot: 'bag', cap: 30, kg: 200 } : id === 'translate_earring' ? acc : undefined, desc, more: r >= 1 ? [loot(D, r >= 3 ? 0.002 : 0.02)] : [] });
}
export default B.list;
