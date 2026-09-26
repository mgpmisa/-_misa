// 品物の事典・加工の連鎖・需要・作りすぎない職人・収集と見栄（経済部 品物の担当）
//
// ・世界のすべての物質（市場の品）を、分類・用途・産地つきで定義する（CATALOG）。
//   今までの20品（data.js の GOODS）に、新しい品を足す。installGoods() が GOODS に登録するので、
//   市場の値段・隊商・行商・よその町との交易は、新しい品もそのまま扱える。
// ・加工の連鎖（RECIPES）：石ころ→切り石→彫像、粘土→煉瓦、木→板→家具、鉄鉱石→鉄→武器、
//   羊毛→糸→布→服、小麦→粉→パン、魔物素材→薬・霊薬・護符、魔石→魔灯・大魔石、原石→装身具 など。
// ・職人は、材料を市場で買い、作った品を売る。売値が「材料費＋手間」を下回る品は作らず、
//   在庫が積み上がった品はやめて別の品に切り替える（goodsWork）。
// ・需要（goodsHourly / goodsDaily）：家の修繕・冬の薪・日々の食卓・服と靴・道具の買い替え・
//   軍の武具・教会の蝋燭・酒場の酒・祭り・魔法使いの魔石・学者の書物と化石・楽師の楽器・
//   貴族と王族の珍味・宝飾・収集品。在庫がなければ「足りなかった分」が値段を押し上げる。
// ・収集と見栄：貴族・王族は趣味（美食・宝飾・骨董・芸術・魔道・珍獣）に沿って品を集めて自慢し、
//   贈り物をし、王都の競売で競り合う。王家の宝物庫は冒険者の見つけた宝を買い上げる。
//
// 状態は S.goods に入る（古いセーブでは ensureGoods が遅延で作る）。
// 資源の担当（resources.js）は、goodsHooks.gather を差し替えれば、採集の量を資源の残りで絞れる。

import { GOODS, JOBS, KINGDOMS } from './data.js';
import { ITEMS, makeItem, addItem, autoEquip, TREASURE_ITEMS } from './items.js';

// ---------- 分類 ----------
export const CATS = {
  food: '食料', delicacy: '珍味', drink: '酒', build: '建材', craft: '工芸素材', fuel: '燃料', textile: '衣料',
  medicine: '薬', jewel: '宝飾', collect: '収集品', magic: '魔術素材', royal: '王族の趣味の品', gear: '道具・武具',
};
// 産地の倍率 prod: [アルデリア, ヴェルムント（北）, サハル（南の砂漠）]
// src：どこから来るか（field 畑・ranch 牧場・forest 森・mine 鉱山・sea 海・earth 土木・monster 魔物・ruin 遺跡・craft 加工）
// perish：市場で1日に傷む割合。port：港町でよく採れる
const C = (name, cat, base, target, o = {}) => ({ name, cat, base, target, meals: o.meals || 0, ...o });

export const CATALOG = {
  // ---- 今までの20品（値段と目安量は data.js のまま。cloth だけ糸から織る手間に合わせて上げる） ----
  wheat:     C('小麦', 'food', 2, 40, { meals: 1, src: 'field', prod: [1.2, 0.8, 0.9], uses: '粉にひく・麦酒を造る・家の食べ物' }),
  bread:     C('パン', 'food', 3, 30, { meals: 2, src: 'craft', uses: '毎日の食べ物・祭りのふるまい' }),
  fish:      C('魚', 'food', 4, 16, { meals: 2, src: 'sea', uses: '食べ物・塩漬けと燻製' }),
  meat:      C('肉', 'food', 6, 12, { meals: 3, src: 'ranch', uses: '食べ物・干し肉・祭り' }),
  wood:      C('材木', 'build', 2, 30, { src: 'forest', prod: [1, 1.2, 0.4], uses: '板にひく・炭を焼く・道具の柄・橋と柵' }),
  ore:       C('鉄鉱石', 'craft', 5, 20, { src: 'mine', prod: [1, 1.4, 0.8], uses: '炭で溶かして鉄にする' }),
  tools:     C('道具', 'gear', 14, 6, { src: 'craft', uses: '職人と農夫の道具の買い替え' }),
  weapons:   C('武器', 'gear', 30, 6, { src: 'craft', uses: '兵の武器・冒険者の武器' }),
  ale:       C('麦酒', 'drink', 2, 20, { src: 'craft', uses: '酒場・祭り' }),
  cloth:     C('布', 'textile', 12, 10, { src: 'craft', uses: '服・晴れ着・帆・画布' }),
  furniture: C('家具', 'craft', 26, 4, { src: 'craft', uses: '家の暮らしを整える・貴族の屋敷' }),
  gem:       C('宝石の原石', 'jewel', 80, 3, { src: 'mine', rare: true, uses: '磨いて装身具に・王族の収集' }),
  honey:     C('はちみつ', 'food', 5, 8, { meals: 1, src: 'field', uses: '甘味・蜂蜜酒' }),
  wool:      C('羊毛', 'textile', 4, 12, { src: 'ranch', prod: [1, 1.3, 0.6], uses: '糸に紡ぐ・布に織る' }),
  herbs:     C('薬草', 'medicine', 3, 12, { src: 'forest', uses: '薬・香水・霊薬' }),
  medicine:  C('薬', 'medicine', 12, 6, { src: 'craft', uses: '病とけがの手当て・冒険者の回復薬' }),
  shoes:     C('靴', 'textile', 10, 6, { src: 'craft', uses: '暮らしの履き物（すり減って買い替える）' }),
  pottery:   C('陶器', 'craft', 6, 8, { src: 'craft', uses: '家の器と壺・酒と薬の入れ物' }),
  jewelry:   C('装身具', 'jewel', 60, 3, { src: 'craft', uses: '貴族の身だしなみ・贈り物・収集' }),
  stone:     C('切り石', 'build', 3, 20, { src: 'craft', uses: '道の石畳・家の修繕・町の普請・彫像' }),

  // ---- 建材 ----
  rubble:    C('石ころ・土石', 'build', 0.4, 80, { src: 'earth', uses: '切り石に割る・石灰を焼く（そこらの石ころも加工すれば建材になる）' }),
  clay:      C('粘土', 'build', 0.6, 40, { src: 'earth', uses: '煉瓦・陶器' }),
  sand:      C('砂', 'build', 0.4, 40, { src: 'earth', prod: [0.6, 0.5, 3], uses: '硝子を吹く' }),
  planks:    C('板', 'build', 2, 30, { src: 'craft', uses: '家具・家の修繕・小舟・楽器・額縁' }),
  brick:     C('煉瓦', 'build', 2, 30, { src: 'craft', uses: '家の修繕・町の普請' }),
  lime:      C('石灰', 'build', 4.5, 12, { src: 'craft', uses: '漆喰・なめし・畑の土づくり・硝子' }),
  glass:     C('硝子', 'craft', 10, 8, { src: 'craft', prod: [0.8, 0.6, 1.5], uses: '窓・薬瓶・魔灯・香水瓶' }),
  // ---- 燃料 ----
  firewood:  C('薪', 'fuel', 1.5, 40, { src: 'forest', uses: '冬の暖と煮炊き・パン窯・燻製' }),
  charcoal:  C('木炭', 'fuel', 4.5, 20, { src: 'craft', uses: '鉄を溶かす・焼き物の窯・石灰焼き・硝子' }),
  resin:     C('樹脂（松やに）', 'craft', 3, 10, { src: 'forest', prod: [1, 1.4, 0.3], uses: '船の水漏れ止め・家具のニス・灯台のたいまつ' }),
  // ---- 金属 ----
  iron:      C('鉄', 'craft', 12, 14, { src: 'craft', item: 'iron', uses: '道具・武器・防具・魔灯の枠' }),
  silver:    C('銀', 'jewel', 20, 6, { src: 'mine', prod: [1, 1.2, 1], uses: '装身具・王家の蓄え' }),
  gold:      C('金', 'jewel', 80, 3, { src: 'mine', prod: [0.6, 0.6, 3], rare: true, uses: '装身具・王家の蓄え' }),
  // ---- 食料と飲み物 ----
  flour:     C('小麦粉', 'food', 3, 20, { meals: 1, src: 'craft', perish: 0.01, uses: 'パンを焼く' }),
  salt:      C('塩', 'food', 3, 16, { src: 'sea', port: true, prod: [1, 1, 1.6], uses: '塩漬け・チーズ・毎日の味つけ' }),
  spice:     C('香辛料', 'delicacy', 12, 6, { src: 'field', prod: [0, 0, 1], uses: '貴族の食卓・香水・祭り（南の砂漠の国の特産）' }),
  fruit:     C('果物', 'food', 2, 16, { meals: 1, src: 'field', perish: 0.08, prod: [1.2, 0.6, 1.2], uses: '食べ物・葡萄酒' }),
  milk:      C('乳', 'food', 1, 12, { meals: 1, src: 'ranch', perish: 0.35, uses: '飲む・チーズにする' }),
  cheese:    C('チーズ', 'food', 6, 8, { meals: 2, src: 'craft', perish: 0.01, uses: '日持ちする食べ物・貴族の食卓' }),
  cured:     C('干し肉・燻製', 'food', 8, 10, { meals: 3, src: 'craft', uses: '旅と冒険の携帯食・冬の備え' }),
  wine:      C('葡萄酒', 'drink', 5, 10, { src: 'craft', uses: '貴族の食卓・教会の儀式・酒場' }),
  mead:      C('蜂蜜酒', 'drink', 5, 8, { src: 'craft', uses: '酒場・北の国の祝いの酒' }),
  wax:       C('蜜蝋', 'craft', 6, 6, { src: 'field', uses: '教会の蝋燭・封蝋・護符' }),
  // ---- 衣料 ----
  yarn:      C('糸', 'textile', 4.5, 10, { src: 'craft', uses: '布に織る' }),
  clothes:   C('服', 'textile', 25, 6, { src: 'craft', item: 'clothes', uses: '暮らしの服（すり切れて買い替える）' }),
  finery:    C('絹の晴れ着', 'royal', 70, 2, { src: 'craft', uses: '貴族と王族の装い・婚礼' }),
  silk:      C('絹糸・蜘蛛糸', 'textile', 9, 6, { src: 'monster', item: 'silk', prod: [0.3, 0.2, 1.5], uses: '晴れ着・楽器の弦・弓の弦' }),
  dye:       C('染料', 'craft', 4, 8, { src: 'forest', prod: [1, 0.6, 1.8], uses: '布を染める・絵の具・インク' }),
  // ---- 動物と魔物の素材 ----
  hide:      C('生皮・毛皮', 'craft', 4, 10, { src: 'monster', item: 'hide', prod: [1, 1.6, 0.7], uses: '革になめす・北の冬の毛皮' }),
  leather:   C('革', 'craft', 7, 10, { src: 'craft', item: 'leather', uses: '靴・防具・書物の表紙・馬具' }),
  feather:   C('羽根', 'craft', 1.5, 10, { src: 'monster', item: 'feather', uses: '矢羽根・羽根ぶとん・羽ペン' }),
  bone:      C('骨', 'craft', 1, 12, { src: 'monster', item: 'bone', uses: '護符・畑の骨粉' }),
  fang:      C('牙', 'craft', 3, 8, { src: 'monster', item: 'fang', uses: '護符・お守り' }),
  jelly:     C('スライムのゼリー', 'magic', 2.5, 6, { src: 'monster', item: 'jelly', uses: '薬の練り台・家具のにかわ' }),
  bandage:   C('ミイラの古布', 'magic', 4, 4, { src: 'monster', item: 'bandage', uses: '砕いて薬に（ミイラの粉）' }),
  scale:     C('竜の鱗', 'magic', 60, 2, { src: 'monster', item: 'scale', rare: true, uses: '竜鱗の武具・装身具・王族の収集' }),
  horn:      C('ユニコーンの角', 'magic', 200, 1, { src: 'monster', item: 'horn', rare: true, uses: '霊薬・王族の収集' }),
  // ---- 魔術素材（魔石の等級：魔石＜大魔石＜魔核） ----
  magicstone:C('魔石', 'magic', 30, 4, { src: 'monster', item: 'magicstone', uses: '魔法の研究・魔灯・霊薬・護符・魔法の杖' }),
  crystal:   C('大魔石', 'magic', 160, 1, { src: 'craft', rare: true, uses: '宮廷魔術の大研究・王族の収集' }),
  demoncore: C('魔核', 'magic', 90, 1, { src: 'monster', item: 'demoncore', rare: true, uses: '宮廷魔術の研究・王族の収集' }),
  magiclamp: C('魔灯', 'magic', 34, 3, { src: 'craft', uses: '屋敷と灯台と街路の明かり' }),
  charm:     C('護符・お守り', 'magic', 10, 6, { src: 'craft', uses: '冒険者と信心深い人のお守り' }),
  // ---- 薬 ----
  rareherb:  C('霊草', 'medicine', 25, 3, { src: 'forest', prod: [1, 1.3, 0.5], uses: '霊薬' }),
  elixir:    C('霊薬', 'medicine', 110, 2, { src: 'craft', rare: true, uses: '王侯の長寿の薬・重い病' }),
  perfume:   C('香水', 'royal', 25, 3, { src: 'craft', uses: '貴族のたしなみ・贈り物' }),
  // ---- 珍味 ----
  truffle:   C('白き地茸', 'delicacy', 35, 2, { src: 'forest', perish: 0.06, prod: [1.3, 0.8, 0.2], rare: true, uses: '王侯の宴の珍味（森の奥の土の中に育つ）' }),
  liver:     C('魔物の肝', 'delicacy', 30, 2, { src: 'monster', perish: 0.1, rare: true, uses: '精のつく珍味・霊薬' }),
  roe:       C('魚卵の塩漬け', 'delicacy', 20, 3, { src: 'sea', port: true, perish: 0.02, prod: [0.6, 1.8, 0.4], uses: '北の海の珍味' }),
  dragonegg: C('竜の卵', 'delicacy', 400, 0.5, { src: 'monster', rare: true, uses: '王族の宴か宝物庫へ・魔術の研究' }),
  // ---- 宝飾 ----
  pearl:     C('真珠', 'jewel', 40, 3, { src: 'sea', port: true, rare: true, uses: '装身具・王族の収集' }),
  amber:     C('琥珀', 'jewel', 15, 4, { src: 'sea', port: true, prod: [0.5, 2, 0.1], uses: '装身具・香水・収集' }),
  // ---- 収集品 ----
  coin:      C('古代の硬貨', 'collect', 25, 3, { src: 'ruin', rare: true, uses: '好事家の収集・学者の研究' }),
  fossil:    C('化石', 'collect', 30, 2, { src: 'earth', rare: true, uses: '好事家の収集・学者の研究' }),
  antique:   C('骨董・古文書', 'collect', 70, 2, { src: 'ruin', prod: [1, 1, 1.8], rare: true, uses: '貴族の収集・学者の研究・競売' }),
  book:      C('書物', 'collect', 22, 4, { src: 'craft', uses: '学者と魔法使いの研究・貴族の書庫・教会' }),
  // ---- 王族の趣味の品 ----
  painting:  C('絵画', 'royal', 45, 2, { src: 'craft', uses: '屋敷と教会の飾り・収集' }),
  statue:    C('彫像', 'royal', 55, 1, { src: 'craft', uses: '広場と屋敷の飾り・収集' }),
  instrument:C('楽器', 'royal', 30, 2, { src: 'craft', uses: '楽師・吟遊詩人の商売道具・貴族のたしなみ' }),
  // ---- 道具・武具 ----
  armor:     C('防具', 'gear', 45, 4, { src: 'craft', uses: '兵の鎧・冒険者の鎧' }),
  boat:      C('小舟', 'gear', 150, 1, { src: 'craft', uses: '漁師・船乗り・真珠採りの舟' }),
};
// 旧来の20品のうち、ここで基準の値段を改める品（加工の手間に合わせる）
const BASE_FIX = { cloth: 12 };

// ---------- GOODS へ登録（本体の値段・隊商・行商が新しい品も扱えるように） ----------
export function installGoods() {
  for (const [k, c] of Object.entries(CATALOG)) {
    if (!GOODS[k]) GOODS[k] = { name: c.name, base: c.base, meals: c.meals || 0, target: c.target };
    if (BASE_FIX[k]) GOODS[k].base = BASE_FIX[k];
    GOODS[k].cat = c.cat; GOODS[k].rare = !!c.rare;
  }
}
installGoods();

// 商人が卸から補ってよい品（新しい品・珍品は、だれかが作るか見つけるまで市場に出ない）
export const RESTOCK = new Set(['wheat', 'bread', 'fish', 'meat', 'wood', 'ore', 'tools', 'weapons', 'ale', 'cloth', 'furniture', 'honey', 'wool', 'herbs', 'medicine', 'shoes', 'pottery', 'stone']);
export const goodsOfCat = (cat) => Object.keys(CATALOG).filter((k) => CATALOG[k].cat === cat);
export const goodName = (g) => CATALOG[g]?.name || GOODS[g]?.name || g;
// 持ち物の素材（items.js）と市場の品の対応
export const ITEM_TO_GOOD = { iron: 'iron', leather: 'leather', hide: 'hide', bone: 'bone', fang: 'fang', jelly: 'jelly', silk: 'silk', bandage: 'bandage', scale: 'scale', magicstone: 'magicstone', demoncore: 'demoncore', horn: 'horn', feather: 'feather', herb: 'herbs' };

// 資源の担当（resources.js）が差し替える口。gather(sim, p, g, n, src) は実際に採れた量を返す
export const goodsHooks = { gather: null };

// ---------- 加工の連鎖（レシピ） ----------
// jobs：その職の人が作る。alt：その町に jobs の人がいないときだけ、片手間（半分の速さ）で作る
// h：1回に要る仕事量（腕と道具を掛けた「はかどり」で、ふつうの職人の約1時間ぶん）
// soft：あれば使う（なければ手間が1.5倍）
const R = (id, jobs, inp, out, h, o = {}) => ({ id, jobs, inp, out, h, alt: o.alt || [], soft: o.soft || null, name: o.name || '' });
const MILL = ['miller'], BAKE = ['baker'], BREW = ['brewer', 'innkeeper'], DAIRY = ['shepherd', 'rancher'];
const WOODW = ['carpenter', 'shipwright'], SAW = ['carpenter', 'shipwright', 'woodcutter'], CHAR = ['charcoal', 'woodcutter'];
const MASON = ['mason', 'roadworker'], KILN = ['potter'], TEX = ['weaver', 'shepherd'], TAIL = ['tailor', 'weaver'];
const TAN = ['cobbler', 'hunter'], HERB = ['herbalist', 'alchemist'], ALCH = ['alchemist', 'herbalist'], MAGE = ['courtmage', 'wizard', 'sage', 'magister', 'alchemist'];
const JEWEL = ['jeweler'], CHARMJ = ['fortune', 'priest', 'cleric', 'nun'], SCRIBE = ['scribe', 'scholar'], ART = ['painter'];

export const RECIPES = [
  R('flour', MILL, { wheat: 1 }, { flour: 1 }, 0.4, { alt: ['baker', 'farmer'], name: '小麦をひいて粉にする' }),
  R('bread_f', BAKE, { flour: 1 }, { bread: 1.8 }, 0.6, { alt: ['cook', 'innkeeper'], soft: { firewood: 0.15 }, name: '粉からパンを焼く' }),
  R('bread_w', BAKE, { wheat: 1 }, { bread: 1.6 }, 1.1, { alt: ['cook', 'miller', 'innkeeper'], soft: { firewood: 0.15 }, name: '小麦をひいてパンを焼く' }),
  R('ale', BREW, { wheat: 1 }, { ale: 3 }, 0.9, { name: '麦酒を仕込む' }),
  R('wine', BREW, { fruit: 2 }, { wine: 2 }, 1.2, { alt: ['farmer', 'gardener'], soft: { pottery: 0.1 }, name: '葡萄酒を仕込む' }),
  R('mead', BREW, { honey: 1 }, { mead: 2 }, 1.0, { alt: ['beekeeper'], name: '蜂蜜酒を仕込む' }),
  R('cured_m', ['butcher', 'hunter'], { meat: 1, salt: 0.3 }, { cured: 1.3 }, 0.8, { alt: ['rancher', 'cook'], soft: { firewood: 0.3 }, name: '肉を塩漬けにして燻す' }),
  R('cured_f', ['fisher', 'sailor'], { fish: 2, salt: 0.4 }, { cured: 1.6 }, 1.0, { alt: ['captain', 'cook'], soft: { firewood: 0.3 }, name: '魚を塩漬けにして燻す' }),
  R('cheese', DAIRY, { milk: 3, salt: 0.1 }, { cheese: 1 }, 0.8, { alt: ['farmer', 'cook'], name: '乳をチーズにする' }),
  R('planks', SAW, { wood: 2 }, { planks: 3 }, 0.6, { alt: ['pioneer'], name: '材木を板にひく' }),
  R('furniture', WOODW, { planks: 5, resin: 0.3 }, { furniture: 1 }, 5, { soft: { jelly: 0.1 }, name: '板から家具をこしらえる' }),
  R('furniture_w', WOODW, { wood: 7 }, { furniture: 1 }, 6, { name: '材木から家具を削り出す' }),
  R('boat', ['shipwright'], { planks: 25, resin: 3, cloth: 2 }, { boat: 1 }, 24, { alt: ['carpenter'], name: '小舟を造る' }),
  R('instrument', ['carpenter'], { planks: 2, silk: 0.5, resin: 0.2 }, { instrument: 1 }, 8, { alt: ['shipwright', 'musician', 'bard'], name: '楽器を作る' }),
  R('charcoal', CHAR, { wood: 3 }, { charcoal: 2 }, 1.0, { alt: ['pioneer'], name: '炭を焼く' }),
  R('iron', ['smith'], { ore: 1.4, charcoal: 0.5 }, { iron: 1 }, 0.8, { alt: ['miner'], name: '鉄鉱石を溶かして鉄にする' }),
  R('tools', ['smith'], { iron: 0.6, wood: 1 }, { tools: 1 }, 1.5, { name: '道具を打つ' }),
  R('weapons', ['smith'], { iron: 1.5, wood: 0.5, leather: 0.3 }, { weapons: 1 }, 2.5, { name: '武器を打つ' }),
  R('bow', ['hunter'], { wood: 2, feather: 1, silk: 0.2 }, { weapons: 1 }, 5, { alt: ['carpenter', 'smith'], name: '弓と矢をこしらえる' }),
  R('armor', ['smith'], { iron: 2, leather: 1 }, { armor: 1 }, 3, { name: '鎖かたびらを編む' }),
  R('armor_l', ['cobbler'], { leather: 3, bone: 1 }, { armor: 0.8 }, 4, { alt: ['tailor', 'hunter'], name: '革鎧を縫う' }),
  R('stone', MASON, { rubble: 3 }, { stone: 1 }, 0.6, { alt: ['miner', 'pioneer'], name: '石ころを割って切り石にする' }),
  R('lime', MASON, { rubble: 2, charcoal: 0.5 }, { lime: 1 }, 0.5, { alt: ['potter', 'miner'], name: '石灰を焼く' }),
  R('brick', KILN, { clay: 2, charcoal: 0.3 }, { brick: 2 }, 0.6, { alt: ['mason', 'roadworker', 'pioneer'], name: '煉瓦を焼く' }),
  R('pottery', KILN, { clay: 2, charcoal: 0.3 }, { pottery: 1 }, 1.2, { alt: ['mason', 'roadworker'], name: '壺と器を焼く' }),
  R('glass', KILN, { sand: 3, charcoal: 1, lime: 0.2 }, { glass: 1 }, 1.0, { alt: ['alchemist', 'roadworker'], name: '硝子を吹く' }),
  R('statue', MASON, { stone: 6 }, { statue: 1 }, 12, { alt: ['miner'], name: '彫像を刻む' }),
  R('yarn', TEX, { wool: 1 }, { yarn: 1.2 }, 0.4, { alt: ['tailor', 'nanny'], name: '羊毛を紡いで糸にする' }),
  R('cloth', TEX, { yarn: 2 }, { cloth: 1 }, 1.0, { alt: ['tailor'], soft: { dye: 0.05 }, name: '糸を布に織る' }),
  R('cloth_w', TEX, { wool: 2 }, { cloth: 1 }, 1.8, { alt: ['tailor'], name: '羊毛から布を織る' }),
  R('clothes', TAIL, { cloth: 1.5 }, { clothes: 1 }, 2, { alt: ['laundress', 'nanny'], name: '服を仕立てる' }),
  R('finery', TAIL, { silk: 2, cloth: 1, dye: 0.5 }, { finery: 1 }, 8, { name: '絹の晴れ着を仕立てる' }),
  R('leather', TAN, { hide: 1, lime: 0.2 }, { leather: 1 }, 0.6, { alt: ['tailor', 'rancher', 'butcher'], name: '皮をなめして革にする' }),
  R('shoes', ['cobbler'], { leather: 0.8 }, { shoes: 1 }, 1.5, { alt: ['tailor'], name: '靴を縫う' }),
  R('medicine', HERB, { herbs: 2 }, { medicine: 1 }, 1.5, { alt: ['doctor', 'midwife', 'nun', 'cleric', 'gatherer'], soft: { pottery: 0.1 }, name: '薬草から薬を煎じる' }),
  R('medicine_j', HERB, { herbs: 1, jelly: 1 }, { medicine: 1 }, 1.2, { alt: ['doctor', 'midwife'], name: 'ゼリーで膏薬を練る' }),
  R('medicine_b', ALCH, { herbs: 1, bandage: 1 }, { medicine: 1.5 }, 1.5, { alt: ['doctor', 'courtmage', 'wizard'], name: 'ミイラの古布を砕いて薬にする' }),
  R('elixir', ALCH, { rareherb: 1, magicstone: 0.3, glass: 0.5 }, { elixir: 1 }, 6, { alt: ['courtmage', 'wizard', 'sage'], name: '霊薬を練る' }),
  R('elixir_h', ALCH, { horn: 0.2, herbs: 2, glass: 0.5 }, { elixir: 1 }, 6, { alt: ['courtmage', 'wizard', 'sage'], name: 'ユニコーンの角から霊薬を練る' }),
  R('elixir_l', ALCH, { liver: 1, rareherb: 0.5, glass: 0.5 }, { elixir: 1 }, 6, { alt: ['courtmage', 'wizard', 'doctor'], name: '魔物の肝から霊薬を練る' }),
  R('perfume', ALCH, { herbs: 2, spice: 0.3, glass: 0.3 }, { perfume: 1 }, 3, { alt: ['gatherer', 'gardener', 'courtmage'], name: '香水を調合する' }),
  R('perfume_a', ALCH, { amber: 0.5, herbs: 1, glass: 0.3 }, { perfume: 1 }, 3, { alt: ['gardener', 'courtmage'], name: '琥珀の香水を調合する' }),
  R('magiclamp', MAGE, { magicstone: 0.3, glass: 1, iron: 0.2 }, { magiclamp: 1 }, 3, { name: '魔灯を組む' }),
  R('crystal', ['courtmage', 'wizard'], { magicstone: 4 }, { crystal: 1 }, 8, { alt: ['sage', 'magister'], name: '魔石を練り合わせて大魔石にする' }),
  R('jewelry_g', JEWEL, { gem: 0.2, silver: 0.5 }, { jewelry: 1 }, 6, { alt: ['smith'], name: '原石を磨いて銀の台にはめる' }),
  R('jewelry_p', JEWEL, { pearl: 0.5, silver: 0.3 }, { jewelry: 1 }, 5, { alt: ['smith', 'diver'], name: '真珠の首飾りを作る' }),
  R('jewelry_a', JEWEL, { amber: 1, silver: 0.3 }, { jewelry: 0.6 }, 4, { alt: ['smith'], name: '琥珀の飾りを作る' }),
  R('jewelry_s', JEWEL, { scale: 0.3, gold: 0.1 }, { jewelry: 1 }, 6, { alt: ['smith'], name: '竜の鱗の首飾りを作る' }),
  R('jewelry_au', JEWEL, { gold: 0.2, gem: 0.1 }, { jewelry: 1 }, 6, { alt: ['smith'], name: '金の指輪を作る' }),
  R('charm', CHARMJ, { fang: 1, bone: 1 }, { charm: 1 }, 1.0, { alt: ['hunter', 'jeweler', 'gatherer'], name: '牙と骨でお守りを作る' }),
  R('charm_m', CHARMJ, { bone: 1, magicstone: 0.05, wax: 0.2 }, { charm: 1 }, 1.0, { alt: ['wizard', 'courtmage', 'magister'], name: '魔石のかけらで護符を作る' }),
  R('book', SCRIBE, { leather: 1, dye: 0.2, feather: 0.1 }, { book: 1 }, 5, { alt: ['priest', 'teacher', 'magister', 'sage', 'courtmage'], soft: { wax: 0.1 }, name: '書物を写す' }),
  R('painting', ART, { cloth: 1, planks: 1, dye: 1 }, { painting: 1 }, 8, { alt: ['jester', 'troupe', 'scribe', 'nun', 'gardener', 'teacher'], name: '絵を描く' }),
];
const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// ---------- 採集（自然から採る品） ----------
// main：その職の本業の採集（goodsWork が値段を見て、採集と加工のどちらをするか決める）
// by：本業のかたわらに少し採れる品（市場に余っていれば採らない）
// rate は「はかどり1」あたりの量。find は珍しい掘り出し物（見つけると記憶と噂になる）
export const GATHER = {
  shepherd:   { main: [['wool', 0.4]], by: [['milk', 0.3]] },
  beekeeper:  { main: [['honey', 0.35]], by: [['wax', 0.08]] },
  gatherer:   { main: [['herbs', 0.6], ['dye', 0.35]], by: [['fruit', 0.1], ['resin', 0.03], ['rareherb', 0.012], ['honey', 0.03], ['wax', 0.01]], find: [['truffle', 0.006]] },
  diver:      { main: [['pearl', 0.03]], by: [['dye', 0.03], ['salt', 0.05], ['amber', 0.01]] },
  mason:      { main: [['rubble', 1.5]], by: [], find: [['fossil', 0.002]] },
  charcoal:   { main: [['firewood', 1.6]], by: [['resin', 0.05]] },
  woodcutter: { main: [['wood', 1.6], ['firewood', 2.2]], by: [['resin', 0.05], ['firewood', 0.3]], find: [['truffle', 0.002]] },
  miner:      { main: [['ore', 0.9], ['rubble', 1.6]], by: [['rubble', 0.4], ['silver', 0.02], ['gold', 0.004]], find: [['gem', 0.03], ['coin', 0.001], ['fossil', 0.002], ['magicstone', 0.003]] },
  roadworker: { main: [], by: [['rubble', 0.8], ['clay', 0.3], ['sand', 0.15]], find: [['coin', 0.0015], ['fossil', 0.0015]] },
  pioneer:    { main: [], by: [['rubble', 0.6], ['clay', 0.3], ['sand', 0.1], ['firewood', 0.3]], find: [['coin', 0.001], ['fossil', 0.001], ['antique', 0.0004]] },
  gardener:   { main: [], by: [['fruit', 0.1], ['herbs', 0.05]] },
  farmer:     { main: [], by: [['fruit', 0.12], ['honey', 0.02], ['wax', 0.006], ['rubble', 0.05], ['spice', 0.08], ['silk', 0.015], ['dye', 0.02]], find: [['coin', 0.0005]] },
  rancher:    { main: [], by: [['milk', 0.6], ['hide', 0.1], ['feather', 0.06], ['bone', 0.04]] },
  hunter:     { main: [], by: [['hide', 0.06], ['feather', 0.05], ['bone', 0.04], ['fang', 0.02]], find: [['liver', 0.006]] },
  fisher:     { main: [], by: [['salt', 0.06], ['sand', 0.05]], find: [['roe', 0.006], ['amber', 0.004]] },
  sailor:     { main: [], by: [['salt', 0.04]], find: [['roe', 0.006], ['amber', 0.003]] },
  captain:    { main: [], by: [], find: [['roe', 0.005], ['pearl', 0.002]] },
  keeper:     { main: [], by: [['resin', 0.01]], find: [['amber', 0.004]] },
  butcher:    { main: [], by: [['hide', 0.05], ['bone', 0.05]] },
  gravedigger:{ main: [], by: [['bone', 0.02]], find: [['coin', 0.0008]] },
};
// 季節の倍率（春・夏・秋・冬）
const SEASON = { fruit: [0.5, 1.5, 2, 0], honey: [0.8, 1.4, 0.8, 0], wax: [0.8, 1.4, 0.8, 0], milk: [1.2, 1, 0.9, 0.7], herbs: [1.2, 1.2, 0.8, 0.2], rareherb: [1, 1.2, 1, 0.3], truffle: [0.3, 0.5, 2.5, 0.8], dye: [1, 1.3, 1, 0.3], spice: [1, 1.2, 1, 0.6] };

const WAGE = 0.8;   // 手間の値打ち（1はかどりあたりの銅貨）。これを売値が下回る仕事はしない
const SELL = 0.85;  // 市場に売るときの取り分（sim.sell と同じ）

// ---------- 状態 ----------
export function ensureGoods(sim) {
  const S = sim.S;
  if (!S.goods) S.goods = { v: 1, made: {}, used: {}, spoil: {}, day: { made: {}, used: {} }, pl: {}, plDay: {}, dem: {}, col: {}, vault: {}, auctions: [], lots: {}, jobs: {}, jobsDay: -1, acc: {} };
  const G = S.goods;
  for (const k of ['made', 'used', 'spoil', 'pl', 'plDay', 'dem', 'col', 'vault', 'lots', 'jobs', 'acc']) G[k] = G[k] || {};
  G.auctions = G.auctions || [];
  G.day = G.day || { made: {}, used: {} };
  const n = S.world.settlements.length;
  if (G._towns !== n || G._v !== Object.keys(GOODS).length) {
    for (const s of S.world.settlements) ensureTownStock(sim, s);
    G._towns = n; G._v = Object.keys(GOODS).length;
  }
  return G;
}
function ensureTownStock(sim, s) {
  const m = sim.S.towns[s.id];
  if (!m) return;
  m.stock = m.stock || {}; m.price = m.price || {};
  const fresh = !m.goodsV;
  for (const [k, c] of Object.entries(CATALOG)) {
    const G = GOODS[k];
    if (m.price[k] == null || !isFinite(m.price[k])) m.price[k] = G.base;
    // 新しい品：町の格と国の産地で最初の在庫を決める（本体の initTowns が一律に入れた分も、ここで直す）
    if (m.stock[k] == null || !isFinite(m.stock[k]) || (fresh && !isOld(k))) m.stock[k] = initialStock(sim, s, k, c);
  }
  m.goodsV = 1;
}
const OLD = new Set(['wheat', 'bread', 'fish', 'meat', 'wood', 'ore', 'tools', 'weapons', 'ale', 'cloth', 'furniture', 'gem', 'honey', 'wool', 'herbs', 'medicine', 'shoes', 'pottery', 'jewelry', 'stone']);
const isOld = (k) => OLD.has(k);
function initialStock(sim, s, k, c) {
  const kind = s.type === 'capital' ? 1 : s.type === 'port' ? 0.8 : 0.6;
  const prod = c.prod ? c.prod[s.kingdom] ?? 1 : 1;
  const port = c.port ? (s.type === 'port' ? 1.4 : 0.3) : 1;
  if (c.rare) return s.type === 'capital' ? Math.round(c.target * 0.6 * Math.max(0.3, prod)) : 0;
  if (s.frontier) return c.target * 0.15 * prod;
  return c.target * kind * prod * port * 0.8;
}

// ---------- 帳簿 ----------
const add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
function noteMade(G, g, n) { add(G.made, g, n); add(G.day.made, g, n); }
function noteUsed(G, g, n) { add(G.used, g, n); add(G.day.used, g, n); }
function notePL(G, job, rev, cost) { const x = G.plDay[job] = G.plDay[job] || { rev: 0, cost: 0 }; x.rev += rev; x.cost += cost; }
function unmet(G, sid, g, n) { const d = G.dem[sid] = G.dem[sid] || {}; d[g] = (d[g] || 0) + n; }

// 市場から品を取る（買う）。payer は家計（hh）か { money } を持つもの。足りなければ買わない
function takeGoods(sim, sid, g, n, payer, why) {
  const m = sim.S.towns[sid], G = sim.S.goods;
  if (!m || m.stock[g] == null) return false;
  if (m.stock[g] < n) { unmet(G, sid, g, n - Math.max(0, m.stock[g])); return false; }
  const cost = n * m.price[g];
  if (payer && payer.money < cost) return false;
  m.stock[g] -= n;
  if (payer) {
    payer.money -= cost;
    m.commission = (m.commission || 0) + cost * 0.06;
    if (m.cash != null) m.cash += cost * 0.94;   // 市場の金庫（resources.js）があれば、代金はそこへ入る
  }
  noteUsed(G, g, n);
  return cost || true;
}
// 市場へ品を出す（sim.sell と同じ取り分）。p がいなければ在庫が増えるだけ
function putGoods(sim, p, sid, g, n) {
  const G = sim.S.goods;
  noteMade(G, g, n);
  if (p && sim.hh(p)) return sim.sell(p, g, n);
  const m = sim.S.towns[sid];
  m.stock[g] += n;
  if (!p) return 0;
  const got = n * m.price[g] * SELL;   // 家のない人は財布へ
  p.purse = (p.purse || 0) + got;
  return got;
}

// ---------- 値段：在庫と需要（足りなかった分）で決まる ----------
// 本体の updatePrices の代わりに呼ぶ。在庫が目安より多ければ安く、少なければ高く、
// 買いに来て買えなかった人が多いほど、さらに高くなる
export function goodsUpdatePrices(sim) {
  const S = sim.S, G = ensureGoods(sim);
  for (const [sid, m] of Object.entries(S.towns)) {
    const d = G.dem[sid] || {};
    for (const [k, g] of Object.entries(GOODS)) {
      if (m.stock[k] == null || !isFinite(m.stock[k])) m.stock[k] = 0;
      if (m.price[k] == null || !isFinite(m.price[k])) m.price[k] = g.base;
      const t = g.target;
      let r = Math.pow(t / (Math.max(0, m.stock[k]) + t * 0.25), 0.55);
      const short = d[k] || 0;
      if (short > 0) r *= 1 + Math.min(1, short / (t * 0.5 + 1)) * 0.6;
      const hi = g.rare ? 3 : 3.5;
      r = r < 0.4 ? 0.4 : r > hi ? hi : r;
      m.price[k] += (g.base * r - m.price[k]) * 0.25;
    }
  }
}

// ---------- 仕事：採集と加工 ----------
// 町ごとに、どの職の人がいるか（1日ごとに数え直す）
function jobsIn(sim, sid) {
  const G = sim.S.goods;
  if (G.jobsDay !== sim.today) {
    G.jobs = {};
    for (const q of sim.living()) if (q.job) { const a = G.jobs[q.s] = G.jobs[q.s] || {}; a[q.job] = 1; }
    G.jobsDay = sim.today;
  }
  return G.jobs[sid] || {};
}
const recipesByJob = {};
for (const r of RECIPES) {
  for (const j of r.jobs) (recipesByJob[j] = recipesByJob[j] || []).push({ r, side: false });
  for (const j of r.alt) (recipesByJob[j] = recipesByJob[j] || []).push({ r, side: true });
}
export function hasGoodsWork(job) { return !!(recipesByJob[job] || GATHER[job]); }

function kingdomMul(sim, s, g) {
  const c = CATALOG[g];
  let x = c?.prod ? c.prod[s.kingdom] ?? 1 : 1;
  if (c?.port) x *= s.type === 'port' ? 1.4 : 0.3;
  const se = SEASON[g];
  if (se) x *= se[sim.seasonIdx()];
  return x;
}
function gatherAmt(sim, p, s, g, n, src) {
  n *= kingdomMul(sim, s, g);
  if (n <= 0) return 0;
  if (goodsHooks.gather) n = goodsHooks.gather(sim, p, g, n, src) || 0;
  return n;
}
// 加工の値打ち：1はかどりあたりのもうけ（材料が足りない・作りすぎのときは null）
function recipeValue(sim, m, r) {
  let cost = 0, rev = 0, h = r.h;
  for (const [g, n] of Object.entries(r.inp)) { if (!(m.stock[g] >= n)) return null; cost += n * m.price[g]; }
  if (r.soft) for (const [g, n] of Object.entries(r.soft)) { if (m.stock[g] >= n) cost += n * m.price[g]; else h *= 1.5; }
  for (const [g, n] of Object.entries(r.out)) {
    if (m.stock[g] > GOODS[g].target * 1.6) return null;          // 在庫が積み上がっている品は作らない
    rev += n * m.price[g] * SELL;
  }
  if (rev < cost + h * WAGE) return null;                          // 材料費＋手間を下回るなら作らない
  return { v: (rev - cost) / h, h, cost, rev };
}

// 職人・採集の人の仕事。mode='full'：採集か加工の一番もうかる仕事をする
//                    mode='side'：本業（本体の処理）のかたわらに、副産物と片手間の加工だけ
// 何かの品の仕事がある職なら true を返す（本体の古い生産の処理を飛ばしてよい）
export function goodsWork(sim, p, dt, eff, mode = 'full') {
  const job = p.job;
  const recs = recipesByJob[job], gat = GATHER[job];
  if (!recs && !gat) return false;
  const S = sim.S, G = ensureGoods(sim), m = S.towns[p.s], s = sim.S.world.settlements[p.s];
  if (!m || !s || m.occupied) return true;
  // 副産物と掘り出し物（少しずつまとめて）
  p._gacc = (p._gacc || 0) + eff;
  if (p._gacc >= 0.5 && gat) {
    const e = p._gacc; p._gacc = 0;
    for (const [g, rate] of gat.by || []) {
      if (m.stock[g] > GOODS[g].target * 2.5) continue;           // 余っていれば採らない
      const n = gatherAmt(sim, p, s, g, rate * e, 'by');
      if (n > 0) { const got = putGoods(sim, p, p.s, g, n); notePL(G, job, got, 0); }
    }
    for (const [g, rate] of gat.find || []) {
      const ch = rate * e * kingdomMul(sim, s, g);
      if (ch > 0 && sim.rng.chance(Math.min(0.5, ch))) findGood(sim, p, g, JOBS[job]?.name);
    }
  }
  if (mode === 'side' && !recs) return true;
  const speed = mode === 'side' ? 0.35 : 1;
  // 仕事を選ぶ（1回の仕事が終わったとき・採集は1時間ごと）
  let c = p.craft;
  if (c && c.kind === 'g' && S.t >= c.until) c = p.craft = null;
  if (!c) {
    if ((p.craftWait || 0) > S.t) return true;
    const here = jobsIn(sim, p.s);
    let best = null;
    for (const [g, rate] of mode === 'full' ? gat?.main || [] : []) {
      if (m.stock[g] > GOODS[g].target * 2.5) continue;
      const v = rate * kingdomMul(sim, s, g) * m.price[g] * SELL;
      if (v > 0.25 && (!best || v > best.v)) best = { kind: 'g', g, rate, v };
    }
    for (const { r, side } of recs || []) {
      if (side && r.jobs.some((j) => here[j])) continue;          // 本職がいる町では手を出さない
      const x = recipeValue(sim, m, r);
      if (!x) continue;
      const v = x.v * (side ? 0.5 : 1);
      if (!best || v > best.v) best = { kind: 'r', r: r.id, v, side };
    }
    if (!best) { p.craftWait = S.t + 45; return true; }
    c = p.craft = best.kind === 'g' ? { kind: 'g', g: best.g, rate: best.rate, until: S.t + 60 } : { kind: 'r', r: best.r, prog: 0, side: best.side };
  }
  if (c.kind === 'g') {
    const n = gatherAmt(sim, p, s, c.g, c.rate * eff * speed, 'main');
    if (n > 0) { const got = putGoods(sim, p, p.s, c.g, n); notePL(G, job, got, 0); }
    return true;
  }
  const r = RECIPE_BY_ID[c.r];
  if (!r) { p.craft = null; return true; }
  c.prog += eff * speed * (c.side ? 0.5 : 1);
  let need = r.h;
  if (r.soft) for (const [g, n] of Object.entries(r.soft)) if (!(m.stock[g] >= n)) need *= 1.5;
  if (c.prog < need) return true;
  p.craft = null;
  // 仕上げ：材料を買って、品を売る
  const hh = sim.hh(p);
  const payer = hh || { money: p.purse || 0 };
  let cost = 0;
  for (const [g, n] of Object.entries(r.inp)) if (!(m.stock[g] >= n) || payer.money < n * m.price[g]) return true;   // 材料が消えていた
  for (const [g, n] of Object.entries(r.inp)) cost += takeGoods(sim, p.s, g, n, payer) || 0;
  if (r.soft) for (const [g, n] of Object.entries(r.soft)) if (m.stock[g] >= n && payer.money > n * m.price[g]) cost += takeGoods(sim, p.s, g, n, payer) || 0;
  if (!hh) p.purse = payer.money;
  let rev = 0;
  for (const [g, n] of Object.entries(r.out)) rev += putGoods(sim, p, p.s, g, n) || 0;
  notePL(G, job, rev, cost);
  if (rev > 30 && sim.rng.chance(0.25)) sim.remember(p, `${r.name.replace(/る$/, 'った')}（${Math.round(rev)}銅貨で売れた）`, { emo: 0.3, imp: 0.2, k: 'craft' });
  return true;
}

// 珍しい品を掘り当てた・見つけた
const FIND_TXT = { gem: '宝石の原石を掘り当てた', coin: '土の中から古代の硬貨を掘り出した', fossil: '岩の中から見事な化石を見つけた', antique: '土の中から古い壺と古文書を掘り出した', truffle: '森の奥で白き地茸を見つけた', roe: '網に上等の魚卵がかかった', amber: '浜で大きな琥珀を拾った', pearl: '大粒の真珠を見つけた', magicstone: '岩の割れ目から魔石を掘り出した', liver: '仕留めた獲物から上等の肝がとれた', dragonegg: '竜の巣で卵を見つけた', crystal: '洞窟の奥で大魔石を見つけた', gold: '金の粒を掘り当てた', bandage: 'ミイラの古布を持ち帰った' };
export function findGood(sim, p, g, who) {
  const G = ensureGoods(sim);
  const got = putGoods(sim, p, p.s, g, 1);
  notePL(G, p.job || 'none', got, 0);
  const v = GOODS[g].base;
  const txt = FIND_TXT[g] || `${goodName(g)}を見つけた`;
  sim.remember(p, `${txt}（${Math.round(got)}銅貨で売れた）`, { emo: 0.6 + Math.min(0.4, v / 200), imp: 0.4 + Math.min(0.5, v / 150), k: 'find' });
  p.needs.esteem = Math.min(100, p.needs.esteem + Math.min(40, v / 2));
  if (v >= 25) sim.gossip(p, txt, 0.5, sim.living().filter((q) => q.s === p.s && q !== p).slice(0, 30), { congrat: `${goodName(g)}を見つけたんだってね`, silent: true });
  if (v >= 60 && sim.rng.chance(0.5)) sim.pushLog(`${who || ''}${p.given}が${txt}。`, 'event', [p.id], p.pos);
  if (v >= 150) sim.news?.(`${sim.townOf(p).name}の${p.given}が${goodName(g)}を見つけた`, 2, p.pos);
}

// 開拓・普請で土地をならしたときに出る土石と掘り出し物（expansion.js・civic.js から呼ぶ）
export function goodsEarthworks(sim, sid, tiles = 1, p = null) {
  const G = ensureGoods(sim), s = sim.S.world.settlements[sid], m = sim.S.towns[sid];
  if (!s || !m) return;
  const R = sim.rng;
  for (const [g, n] of [['rubble', 1.5], ['clay', 0.5], ['sand', 0.2]]) {
    if (m.stock[g] > GOODS[g].target * 3) continue;
    const x = gatherAmt(sim, p, s, g, n * tiles, 'earth');
    if (x > 0) { m.stock[g] += x; noteMade(G, g, x); }
  }
  for (const [g, ch] of [['coin', 0.01], ['fossil', 0.008], ['antique', 0.003]]) {
    if (!R.chance(Math.min(0.6, ch * tiles * kingdomMul(sim, s, g)))) continue;
    if (p) findGood(sim, p, g, '開拓の'); else { m.stock[g] += 1; noteMade(G, g, 1); }
  }
}
// 生き物を倒したとき（creatures.js の killCreature から呼ぶ）
const LIVER_SP = new Set(['orc', 'orcking', 'bear', 'boar', 'polarbear', 'tiger', 'croc', 'wyvern', 'dragon', 'troll', 'ogre', 'minotaur', 'hobgoblin']);
export function goodsOnKill(sim, c, killer) {
  if (!killer || killer.deathYear != null || !killer.needs || !sim.S.towns[killer.s]) return;
  const R = sim.rng;
  ensureGoods(sim);
  if (LIVER_SP.has(c.sp) && R.chance(0.3)) findGood(sim, killer, 'liver');
  if (c.sp === 'dragon' && R.chance(0.25)) findGood(sim, killer, 'dragonegg');
  if (c.sp === 'wyvern' && R.chance(0.05)) findGood(sim, killer, 'dragonegg');
}
// 遺跡・ピラミッド・洞窟の探索に勝ったとき（sim.js の探索の処理から呼ぶ）
export function goodsOnExplore(sim, p, b) {
  const R = sim.rng;
  ensureGoods(sim);
  const t = b.type;
  if ((t === 'ruin' || t === 'ruins' || t === 'pyramid' || t === 'observatory') && R.chance(0.3)) findGood(sim, p, R.chance(0.6) ? 'coin' : 'antique');
  if (t === 'pyramid' && R.chance(0.3)) findGood(sim, p, R.chance(0.6) ? 'bandage' : 'gold');
  if ((t === 'cave' || t === 'mine') && R.chance(0.12)) findGood(sim, p, R.chance(0.7) ? 'fossil' : 'crystal');
  if (t === 'cave' && R.chance(0.03)) findGood(sim, p, 'dragonegg');
}

// 鍛冶場の素材箱（town.mats）を市場で補う（sim.js の forge の最初で呼ぶ）
const FORGE_KEEP = { iron: 4, leather: 2, silk: 1, magicstone: 1, scale: 2 };
export function forgeSupply(sim, p) {
  const town = sim.S.towns[p.s], hh = sim.hh(p), G = ensureGoods(sim);
  if (!town || !hh) return;
  // 店の棚が埋まっているときは素材を買い足さない（売れ残りの赤字を防ぐ）。買い足しは2時間に1度まで
  if ((town.shop || []).length >= 9 || (p._fsT || 0) > sim.S.t) return;
  p._fsT = sim.S.t + 120;
  town.mats = town.mats || {};
  const skill = p.skill?.smith || 0.3;
  for (const [k, want] of Object.entries(FORGE_KEEP)) {
    if ((town.mats[k] || 0) >= want) continue;
    if ((k === 'scale' || k === 'magicstone') && (skill < 0.6 || hh.money < 200)) continue;
    const g = ITEM_TO_GOOD[k];
    const n = Math.min(2, want - (town.mats[k] || 0));
    if (hh.money < n * town.price[g] + 20) continue;
    const cost = takeGoods(sim, p.s, g, n, hh);
    if (cost) { town.mats[k] = (town.mats[k] || 0) + n; notePL(G, 'smith', 0, cost); }
  }
}

// ---------- 需要（毎時：1日の需要を24に分けて少しずつ） ----------
export function goodsHourly(sim) {
  ensureGoods(sim);
  const S = sim.S, hour = Math.floor(sim.hour());
  // 酒場の夜：葡萄酒と蜂蜜酒（麦酒は本体の酒場の処理）
  if (hour >= 18 && hour <= 22) for (const s of S.world.settlements) {
    const m = S.towns[s.id]; if (!m || m.occupied) continue;
    const pop = popOf(sim, s.id);
    tick(sim, s.id, 'wine', pop * 0.006, (n) => drinkers(sim, s.id, 'wine', n));
    tick(sim, s.id, 'mead', pop * (s.kingdom === 1 ? 0.012 : 0.005), (n) => drinkers(sim, s.id, 'mead', n));
  }
}
// 端数をためて、1個ぶんになったら実行する
function tick(sim, sid, key, amt, fn) {
  const A = sim.S.goods.acc, k = sid + ':' + key;
  A[k] = (A[k] || 0) + amt;
  if (A[k] >= 1) { const n = Math.floor(A[k]); A[k] -= n; fn(n); }
}
let _popCache = null, _popT = -1;
function popOf(sim, sid) {
  if (_popT !== sim.S.t) {
    _popCache = {};
    for (const q of sim.living()) _popCache[q.s] = (_popCache[q.s] || 0) + 1;
    _popT = sim.S.t;
  }
  return _popCache[sid] || 0;
}
function drinkers(sim, sid, g, n) {
  const R = sim.rng;
  const cands = sim.living().filter((q) => q.s === sid && sim.isAdult(q) && q.action?.type === 'tavern');
  for (let i = 0; i < n; i++) {
    const q = cands.length ? R.pick(cands) : null;
    const hh = q ? sim.hh(q) : null;
    if (!hh || hh.money < 30) { unmet(sim.S.goods, sid, g, 0.3); continue; }
    if (takeGoods(sim, sid, g, 1, hh)) {
      q.needs.pleasure = Math.min(100, q.needs.pleasure + 12);
      const keeper = sim.living().find((x) => x.job === 'innkeeper' && x.s === sid);
      const share = sim.S.towns[sid].price[g] * 0.15;   // 酒場の取り分（市場の代金から分ける）
      if (keeper && sim.hh(keeper)) { sim.hh(keeper).money += share; const t = sim.S.towns[sid]; if (t.cash != null) t.cash -= share; }
    }
  }
}

// ---------- 需要（1日ごと） ----------
const TOOL_OF = {};
for (const [id, d] of Object.entries(ITEMS)) if (d.type === 'tool') for (const j of d.jobs) TOOL_OF[j] = id;
const MAGIC_JOBS = new Set(['wizard', 'courtmage', 'sage', 'magister', 'alchemist']);
const LEARNED = new Set(['scholar', 'teacher', 'scribe', 'magister', 'sage']);
const PLAYERS = new Set(['musician', 'bard', 'troupe', 'dancer', 'jester']);
const BOATERS = new Set(['fisher', 'sailor', 'diver', 'captain']);
const FIGHTERS = new Set(['soldier', 'knight', 'guard', 'gatekeeper', 'militia', 'royalguard', 'watchman', 'jailer', 'general']);
const HIGH = new Set(['noble', 'royal', 'king']);

export function goodsDaily(sim) {
  const S = sim.S, G = ensureGoods(sim), R = sim.rng, si = sim.seasonIdx();
  // 前の日の帳簿を残して、新しい日を始める
  G.last = { made: G.day.made, used: G.day.used, pl: G.plDay, day: sim.today - 1 };
  G.day = { made: {}, used: {} }; G.plDay = {};
  // 足りなかった分は少しずつ忘れる
  for (const d of Object.values(G.dem)) for (const k of Object.keys(d)) { d[k] *= 0.6; if (d[k] < 0.05) delete d[k]; }
  // 傷む品
  for (const m of Object.values(S.towns)) for (const [k, c] of Object.entries(CATALOG)) {
    if (!c.perish || !(m.stock[k] > c.target * 0.3)) continue;
    const lost = Math.min(m.stock[k] - c.target * 0.3, m.stock[k] * c.perish);
    m.stock[k] -= lost; add(G.spoil, k, lost);
  }
  // 冒険者の置いていった素材（town.mats）を、鍛冶の取り置きを残して市場に出す
  for (const m of Object.values(S.towns)) {
    if (!m.mats) continue;
    for (const [k, n] of Object.entries(m.mats)) {
      const g = ITEM_TO_GOOD[k]; if (!g || !(n > 0)) continue;
      const keep = FORGE_KEEP[k] || 0;
      if (n > keep) { const x = n - keep; m.mats[k] = keep; m.stock[g] += x; noteMade(G, g, x); }
    }
  }
  const people = sim.living();
  const byTown = {};
  for (const q of people) (byTown[q.s] = byTown[q.s] || []).push(q);
  // 狩人など、パーティーに入っていない人の持ち物の素材を売る
  for (const q of people) {
    if (!q.inv || !q.inv.length || q.party || !sim.S.towns[q.s] || !sim.isAdult(q)) continue;
    for (const it of q.inv.slice()) {
      const g = ITEM_TO_GOOD[it.id];
      if (!g || ITEMS[it.id]?.type !== 'material') continue;
      if ((S.quests || []).some((x) => x.id === q.quest && x.item === it.id)) continue;
      const n = it.n || 1;
      q.inv.splice(q.inv.indexOf(it), 1);
      const got = putGoods(sim, q, q.s, g, n);
      // sim.sell は家計に入れるので、そのまま（狩りの稼ぎ）
      notePL(G, q.job || 'none', got, 0);
    }
  }
  const houses = S.world.buildings.filter((b) => (b.type === 'house' || b.type === 'mansion') && b.hh != null);
  for (const b of houses) houseUpkeep(sim, b, si);
  for (const hh of Object.values(S.households)) householdShopping(sim, hh, si);
  for (const q of people) personNeeds(sim, q, si);
  for (const s of S.world.settlements) townNeeds(sim, s, byTown[s.id] || [], si);
  for (const k of S.kingdoms) armory(sim, k);
  nobleLife(sim);
  if (sim.today % 7 === 3) auctions(sim);
  treasureVault(sim);
}

// 家の傷みと修繕：板・煉瓦か切り石・石灰。豊かな家は硝子の窓を入れる
function houseUpkeep(sim, b, si) {
  const S = sim.S, R = sim.rng;
  b.cond = b.cond ?? 1;
  b.cond = Math.max(0, b.cond - (si === 3 ? 0.006 : 0.004));
  const hh = S.households[b.owner ?? b.hh] || S.households[b.hh];
  const dweller = S.households[b.hh];
  if (!hh || hh.bandits) return;
  const sid = S.households[b.hh]?.s ?? hh.s;
  const m = S.towns[sid]; if (!m) return;
  if (b.cond < 0.75 && hh.money > 60) {
    let fix = 0;
    if (takeGoods(sim, sid, 'planks', 2, hh)) fix += 0.1;
    const wall = m.price.brick * 3 < m.price.stone * 2 ? ['brick', 3] : ['stone', 2];
    if (takeGoods(sim, sid, wall[0], wall[1], hh) || takeGoods(sim, sid, wall[0] === 'brick' ? 'stone' : 'brick', wall[0] === 'brick' ? 2 : 3, hh)) fix += 0.1;
    if (takeGoods(sim, sid, 'lime', 0.5, hh)) fix += 0.05;
    if (fix > 0) {
      b.cond = Math.min(1, b.cond + fix);
      if (dweller) dweller.comfort = Math.min(10, (dweller.comfort || 0) + fix);
      const q = dweller && S.people[dweller.members[0]];
      if (q && fix >= 0.2 && R.chance(0.3)) sim.remember(q, '傷んだ家の壁と床を直した', { emo: 0.2, imp: 0.2, k: 'house' });
    }
  }
  if (b.cond < 0.35 && dweller && R.chance(0.1)) {
    dweller.comfort = Math.max(-3, (dweller.comfort || 0) - 0.5);
    const q = S.people[dweller.members[0]];
    if (q) sim.remember(q, '家の傷みがひどく、雨漏りがする', { emo: -0.4, imp: 0.3, k: 'house' });
  }
  if (!b.glass && hh.money > 320 && R.chance(0.05) && takeGoods(sim, sid, 'glass', 2, hh)) {
    b.glass = 1;
    if (dweller) dweller.comfort = Math.min(10, (dweller.comfort || 0) + 1);
    const q = dweller && S.people[dweller.members[0]];
    if (q) { sim.remember(q, '家に硝子の窓を入れた。部屋が明るくなった', { emo: 0.5, imp: 0.4, k: 'house' }); q.needs.esteem = Math.min(100, q.needs.esteem + 15); }
  }
}

// 家の買い物：日々の食卓・冬の薪・塩・服と靴・器
function householdShopping(sim, hh, si) {
  const S = sim.S, R = sim.rng;
  if (hh.house == null || hh.bandits || hh.royal || !hh.members.length) return;
  const s = S.world.settlements[hh.s], m = S.towns[hh.s];
  if (!s || !m || m.occupied) return;
  const n = hh.members.length;
  const first = S.people[hh.members[0]];
  // 食卓の彩り：チーズ・果物・干し肉・乳・はちみつ（食べ物の蓄えに入る）
  if (hh.money > 70 && hh.food < n * 6 && R.chance(0.6)) {
    const opts = ['cheese', 'fruit', 'cured', 'milk', 'honey'].filter((g) => m.stock[g] >= 1);
    if (opts.length) {
      const g = opts.sort((a, b) => m.price[a] / GOODS[a].meals - m.price[b] / GOODS[b].meals)[0];
      if (m.price[g] / GOODS[g].meals < 4.5 && takeGoods(sim, hh.s, g, 1, hh)) hh.food += GOODS[g].meals;
    } else unmet(S.goods, hh.s, R.pick(['cheese', 'fruit', 'cured']), 0.3);
  }
  // 冬の暖と煮炊きの薪（村の家は自分で拾うので、町と港と王都の家だけ）
  if (s.type !== 'village' || s.kingdom === 1) {
    const want = [0.15, 0.05, 0.2, 0.6][si] * (s.kingdom === 1 ? 1.5 : s.kingdom === 2 ? 0.4 : 1);
    if (R.chance(Math.min(1, want))) {
      const g = m.price.charcoal / 3 < m.price.firewood && m.stock.charcoal >= 1 ? 'charcoal' : 'firewood';
      if (hh.money > 12 && takeGoods(sim, hh.s, g, 1, hh)) hh.warmDay = sim.today;
      else if (si === 3 && first) { for (const id of hh.members) { const q = S.people[id]; if (q?.needs) q.needs.pleasure = Math.max(0, q.needs.pleasure - 8); } if (R.chance(0.2)) sim.remember(first, '薪が買えず、寒い夜を過ごした', { emo: -0.4, imp: 0.3, k: 'cold' }); }
    }
    // 北の冬は毛皮もいる
    if (si === 3 && s.kingdom === 1 && R.chance(0.05) && hh.money > 40) takeGoods(sim, hh.s, 'hide', 1, hh);
  }
  if (R.chance(0.03) && hh.money > 20) takeGoods(sim, hh.s, 'salt', 1, hh);
  if (hh.money > 200 && R.chance(s.kingdom === 2 ? 0.05 : 0.02)) takeGoods(sim, hh.s, 'spice', 1, hh) && first && (first.needs.pleasure = Math.min(100, first.needs.pleasure + 10));
  // すり切れた服と靴の買い替え、割れた器
  if (R.chance(n / 200) && hh.money > 50 && takeGoods(sim, hh.s, 'clothes', 1, hh)) { hh.comfort = Math.min(10, (hh.comfort || 0) + 0.2); if (first) first.needs.esteem = Math.min(100, first.needs.esteem + 8); }
  if (R.chance(n / 200) && hh.money > 30) takeGoods(sim, hh.s, 'shoes', 1, hh);
  if (R.chance(1 / 100) && hh.money > 25) takeGoods(sim, hh.s, 'pottery', 1, hh);
  // 豊かな家：羽根ぶとん・香水
  if (hh.money > 260 && R.chance(1 / 150) && takeGoods(sim, hh.s, 'feather', 4, hh)) hh.comfort = Math.min(10, (hh.comfort || 0) + 0.5);
  if (hh.money > 260 && R.chance(1 / 60) && takeGoods(sim, hh.s, 'perfume', 1, hh) && first) first.needs.esteem = Math.min(100, first.needs.esteem + 12);
  // 豊かな家のごちそう：魔物の肝・白き地茸・魚卵（精がつく・自慢になる）
  if (hh.money > 300 && R.chance(0.04)) {
    const g = ['liver', 'truffle', 'roe'].find((x) => m.stock[x] >= 1 && m.price[x] < hh.money * 0.15);
    if (g && takeGoods(sim, hh.s, g, 1, hh)) for (const id of hh.members) { const q = S.people[id]; if (q?.needs) { q.needs.pleasure = Math.min(100, q.needs.pleasure + 15); if (g === 'liver') q.hp = Math.min(q.maxhp, q.hp + 10); } }
  }
}

// 一人ひとりの必要：仕事の道具・武具・冒険の携帯食・お守り・研究の材料・楽器・舟・畑の土づくり
function personNeeds(sim, p, si) {
  const S = sim.S, R = sim.rng, m = S.towns[p.s];
  if (!m || m.occupied || p.jail != null || !sim.isAdult(p) || !p.job) return;
  const hh = sim.hh(p);
  if (!hh) return;
  const J = JOBS[p.job] || {};
  const k = sim.kingdomOf(p);
  // 道具が壊れた・持っていない職人は、市場の道具を買う
  const toolId = TOOL_OF[p.job];
  if (toolId && !p.eq?.tool && hh.money > m.price.tools + 15 && takeGoods(sim, p.s, 'tools', 1, hh)) {
    addItem(p, makeItem(toolId, R.range(0.85, 1.15))); autoEquip(p);
    sim.remember(p, `市場で新しい${ITEMS[toolId].name}を買った`, { emo: 0.3, imp: 0.2, k: 'gear' });
  }
  // 戦う人：武器・防具がなければ市場で買う
  if (J.combat && p.eq) {
    if (!p.eq.weapon && hh.money > m.price.weapons + 20 && takeGoods(sim, p.s, 'weapons', 1, hh)) { addItem(p, makeItem(R.pick(['spear', 'sword', 'axe', 'mace']), R.range(0.85, 1.1))); autoEquip(p); }
    const arm = p.eq.armor && ITEMS[p.eq.armor.id];
    if ((!arm || arm.def <= 1) && hh.money > m.price.armor + 40 && R.chance(0.3) && takeGoods(sim, p.s, 'armor', 1, hh)) { addItem(p, makeItem(R.chance(0.5) ? 'chainmail' : 'leatherarmor', R.range(0.85, 1.1))); autoEquip(p); }
  }
  // 冒険者：依頼に出るときの携帯食とお守り
  const adv = J.rank === 'adventurer' || p.party;
  if (adv && p.quest && R.chance(0.5)) { const w = { money: p.purse || 0 }; if (w.money > m.price.cured + 5 && takeGoods(sim, p.s, 'cured', 1, w)) p.purse = w.money; else if (hh.money > 30) takeGoods(sim, p.s, 'cured', 1, hh); }
  if ((adv || (p.pers?.N > 0.6 && hh.money > 50)) && !p.charmDay && R.chance(adv ? 0.05 : 0.02) && takeGoods(sim, p.s, 'charm', 1, hh)) {
    p.charmDay = sim.today;
    sim.remember(p, 'お守りを買って懐に入れた', { emo: 0.3, imp: 0.2 });
  }
  if (p.charmDay && sim.today - p.charmDay > 60) p.charmDay = 0;
  // 魔法使い：魔石を研究に使う。宮廷魔術師は国の金で大魔石・魔核・竜の卵も
  if (MAGIC_JOBS.has(p.job) && k) {
    const payer = p.job === 'courtmage' && k.treasury > 300 ? k : hh;
    if (payer === k || hh.money > 60) {
      const w = payer === k ? { money: k.treasury } : payer;
      if (R.chance(0.35) && takeGoods(sim, p.s, 'magicstone', 0.3, w)) { k.research += 1.5; }
      if (p.job === 'courtmage' && k.treasury > 900 && R.chance(0.08)) {
        const g = ['crystal', 'demoncore', 'dragonegg'].find((x) => m.stock[x] >= 1);
        if (g && takeGoods(sim, p.s, g, 1, w)) {
          k.research += g === 'dragonegg' ? 40 : 20;
          sim.remember(p, `国の金で${goodName(g)}を手に入れ、研究に使った`, { emo: 0.6, imp: 0.6, k: 'research' });
          sim.pushLog(`宮廷魔術師${p.given}が${goodName(g)}を研究に用いた。`, 'event', [p.id], p.pos);
        }
      }
      if (payer === k) k.treasury = w.money;
    }
  }
  // 学者・教師：書物と、化石・古代の硬貨・古文書を研究に使う
  if ((LEARNED.has(p.job) || MAGIC_JOBS.has(p.job)) && k) {
    if (R.chance(0.06) && hh.money > m.price.book + 30 && takeGoods(sim, p.s, 'book', 1, hh)) { k.research += 3; sim.remember(p, '新しい書物を手に入れて読みふけった', { emo: 0.4, imp: 0.3, k: 'study' }); }
    if (p.job === 'scholar' || p.job === 'sage') {
      for (const g of ['fossil', 'coin', 'antique']) {
        if (m.stock[g] >= 1 && R.chance(0.05)) {
          const w = k.treasury > 400 ? { money: k.treasury } : hh;
          if (takeGoods(sim, p.s, g, 1, w)) {
            if (w !== hh) k.treasury = w.money;
            k.research += 6;
            sim.remember(p, `${goodName(g)}を調べ、昔の世界のことが少しわかった`, { emo: 0.6, imp: 0.5, k: 'study' });
            break;
          }
        }
      }
    }
  }
  // 楽師・吟遊詩人・旅芸人：楽器（なければ買う。あれば芸の張りが出る）
  if (PLAYERS.has(p.job) && !p.instrDay && hh.money > m.price.instrument + 20 && R.chance(0.1) && takeGoods(sim, p.s, 'instrument', 1, hh)) {
    p.instrDay = sim.today; p.needs.esteem = Math.min(100, p.needs.esteem + 20);
    sim.remember(p, '新しい楽器を手に入れた。音色がいい', { emo: 0.6, imp: 0.4 });
  }
  // 漁師・船乗り：舟の手入れ（樹脂と板）、古くなった舟の買い替え
  if (BOATERS.has(p.job)) {
    if (R.chance(0.08) && hh.money > 20) { takeGoods(sim, p.s, 'resin', 0.5, hh); takeGoods(sim, p.s, 'planks', 1, hh); }
    if ((!p.boatDay || sim.today - p.boatDay > 400) && hh.money > m.price.boat + 20 && R.chance(0.05) && takeGoods(sim, p.s, 'boat', 1, hh)) {
      p.boatDay = sim.today;
      sim.remember(p, '新しい小舟を手に入れた', { emo: 0.7, imp: 0.6 });
    }
  }
  // 農夫：春に骨粉と石灰を畑にまく
  if (p.job === 'farmer' && si === 0 && hh.fertYear !== sim.year() && hh.money > 40 && R.chance(0.2)) {
    if (takeGoods(sim, p.s, 'bone', 2, hh) || takeGoods(sim, p.s, 'lime', 1, hh)) { hh.fertYear = sim.year(); sim.remember(p, '畑に骨粉と石灰をまいて土をこしらえた', { emo: 0.2, imp: 0.2, k: 'farm' }); }
  }
  // 馬丁：馬具の革。灯台守：たいまつの樹脂か魔灯
  if (p.job === 'stablehand' && R.chance(0.05) && m.fund > 30) { const w = { money: m.fund }; if (takeGoods(sim, p.s, 'leather', 1, w)) m.fund = w.money; }
  if (p.job === 'keeper') {
    const t = S.towns[p.s];
    if (!t.lamp && t.fund > 80 && m.stock.magiclamp >= 1) { const w = { money: t.fund }; if (takeGoods(sim, p.s, 'magiclamp', 1, w)) { t.fund = w.money; t.lamp = 1; sim.pushLog(`${sim.townOf(p).name}の灯台に魔灯がともった。`, 'event', [p.id], p.pos); } }
    else if (!t.lamp && R.chance(0.3)) { const w = { money: t.fund }; if (takeGoods(sim, p.s, 'resin', 0.5, w)) t.fund = w.money; }
  }
}

// 町の需要：教会の蝋燭と葡萄酒・祭り・普請と広場の彫像・魔灯の街路（町の蓄えから）
function townNeeds(sim, s, pop, si) {
  const S = sim.S, R = sim.rng, t = S.towns[s.id];
  if (!t || t.occupied) return;
  const w = { money: t.fund };
  const n = pop.length;
  if (t.fund > 30) {
    if (R.chance(0.4)) takeGoods(sim, s.id, 'wax', 0.25, w);   // 教会の蝋燭
    if (R.chance(0.2)) takeGoods(sim, s.id, 'wine', 1, w); // 儀式の葡萄酒
  }
  if (sim.isFestival()) {
    for (const [g, per] of [['ale', 0.3], ['wine', 0.08], ['mead', 0.05], ['meat', 0.08], ['bread', 0.2], ['cheese', 0.05], ['fruit', 0.1], ['spice', 0.01], ['cured', 0.03]]) {
      const want = Math.max(1, Math.round(n * per));
      const got = Math.min(want, Math.floor(S.towns[s.id].stock[g] || 0));
      if (got >= 1 && w.money > 50) takeGoods(sim, s.id, g, got, w);
      if (got < want) unmet(S.goods, s.id, g, want - got);
    }
    for (const q of pop) if (q.needs) q.needs.pleasure = Math.min(100, q.needs.pleasure + 10);
  }
  // 蓄えに余裕があれば、町の普請で本当に石畳・井戸・壁を直す
  if (w.money > 350) {
    let ok = 0;
    if (takeGoods(sim, s.id, 'stone', 4, w)) ok++;
    if (takeGoods(sim, s.id, 'brick', 4, w)) ok++;
    if (takeGoods(sim, s.id, 'lime', 1, w)) ok++;
    if (ok) { t.works = (t.works || 0) + ok; if (t.works % 12 < ok && R.chance(0.6)) sim.pushLog(`${s.name}で、石畳と井戸の縁が町の蓄えで直された。`, 'event', [], s); }
  }
  if (w.money > 380 && (t.statues || 0) < 3 && m0(t, 'statue') && R.chance(0.25) && takeGoods(sim, s.id, 'statue', 1, w)) {
    t.statues = (t.statues || 0) + 1;
    sim.pushLog(`${s.name}の広場に新しい彫像が据えられた。`, 'event', [], s);
    for (const q of pop) if (q.needs) q.needs.esteem = Math.min(100, q.needs.esteem + 5);
  }
  if (s.type === 'port' && w.money > 260 && (t.boats || 0) < 4 && R.chance(0.06) && takeGoods(sim, s.id, 'boat', 1, w)) {
    t.boats = (t.boats || 0) + 1;
    sim.pushLog(`${s.name}の蓄えで新しい漁の小舟が買われ、浜に下ろされた。`, 'event', [], s);
  }
  if (w.money > 450 && s.type === 'capital' && (t.lamps || 0) < 12 && R.chance(0.15) && takeGoods(sim, s.id, 'magiclamp', 1, w)) t.lamps = (t.lamps || 0) + 1;
  if (w.money > 300 && R.chance(0.03) && takeGoods(sim, s.id, 'painting', 1, w)) { t.churchArt = (t.churchArt || 0) + 1; sim.pushLog(`${s.name}の教会に新しい絵が掛けられた。`, 'event', [], s); }
  t.fund = w.money;
}
const m0 = (t, g) => t.stock[g] >= 1;

// 軍の武具：王都の市場から、国庫で兵の武器と鎧を買い、いちばん貧弱な装備の兵に渡す
function armory(sim, k) {
  const S = sim.S, R = sim.rng;
  const cap = S.world.settlements.find((s) => s.kingdom === k.id && s.type === 'capital');
  if (!cap || S.towns[cap.id]?.occupied || k.treasury < 250) return;
  const troops = sim.living().filter((q) => FIGHTERS.has(q.job) && sim.townOf(q).kingdom === k.id && q.eq);
  if (!troops.length) return;
  const sc = (q, slot) => q.eq[slot] ? ((ITEMS[q.eq[slot].id]?.atk || 0) + (ITEMS[q.eq[slot].id]?.def || 0)) * q.eq[slot].q : 0;
  for (const [g, slot, pick] of [['weapons', 'weapon', () => R.pick(['sword', 'spear', 'longsword'])], ['armor', 'armor', () => R.chance(0.7) ? 'chainmail' : 'leatherarmor']]) {
    const worst = troops.slice().sort((a, b) => sc(a, slot) - sc(b, slot))[0];
    const id = pick();
    const it = makeItem(id, R.range(0.9, 1.15));
    const better = ((ITEMS[id].atk || 0) + (ITEMS[id].def || 0)) * it.q > sc(worst, slot) * 1.15;
    if (!better || !R.chance(0.5)) continue;
    const w = { money: k.treasury };
    if (!takeGoods(sim, cap.id, g, 1, w)) continue;
    k.treasury = w.money;
    addItem(worst, it); autoEquip(worst);
    worst.needs.esteem = Math.min(100, worst.needs.esteem + 10);
    sim.remember(worst, `国から新しい${ITEMS[id].name}を支給された`, { emo: 0.5, imp: 0.4, k: 'gear' });
  }
}

// ---------- 貴族と王族：珍味・宝飾・収集・見栄・贈り物 ----------
export const HOBBIES = {
  gourmet: { name: '美食', goods: ['truffle', 'liver', 'roe', 'spice', 'wine', 'cheese', 'mead', 'dragonegg'] },
  jewels:  { name: '宝飾', goods: ['jewelry', 'pearl', 'amber', 'gem', 'gold', 'finery', 'perfume'] },
  antique: { name: '骨董', goods: ['antique', 'coin', 'fossil', 'book', 'silver'] },
  arts:    { name: '芸術', goods: ['painting', 'statue', 'instrument', 'finery', 'glass'] },
  arcana:  { name: '魔道', goods: ['magiclamp', 'crystal', 'demoncore', 'elixir', 'magicstone', 'horn'] },
  beasts:  { name: '珍獣の品', goods: ['scale', 'horn', 'dragonegg', 'fang', 'hide'] },
};
const EAT = new Set(['truffle', 'liver', 'roe', 'spice', 'wine', 'cheese', 'mead', 'perfume', 'elixir', 'magicstone']);
function colOf(sim, hh) {
  const G = sim.S.goods;
  let c = G.col[hh.id];
  if (!c) {
    const keys = Object.keys(HOBBIES);
    c = G.col[hh.id] = { hobby: keys[(hh.id * 7 + 3) % keys.length], items: [], value: 0, envy: 0 };
  }
  return c;
}
function highHouseholds(sim) {
  const S = sim.S;
  return Object.values(S.households).filter((h) => h.members.length && (h.royal || h.members.some((id) => HIGH.has(S.people[id]?.rank))) && !h.bandits);
}
const TITLES = {
  painting: ['「{p}の夕暮れ」', '「{f}家の肖像」', '「収穫の祭り」', '「嵐の海」', '「竜と騎士」', '「春の{p}」'],
  statue: ['初代国王の像', '祈る乙女の像', '獅子の像', '勇者の像', '眠る竜の像'],
  book: ['『{p}年代記』', '『薬草の書』', '『星の運行について』', '『魔物図譜』', '『古王国の詩集』', '『航海の手引き』'],
  antique: ['古王国の銀杯', '割れた石板', '古い王冠の破片', '金象嵌の小箱', '古い地図', '古文書の束'],
};
function pieceName(sim, g, hh) {
  const T = TITLES[g];
  if (!T) return goodName(g);
  const s = sim.S.world.settlements[hh.s];
  return sim.rng.pick(T).replace('{p}', s?.name.replace(/^(王都|港町)/, '') || '').replace('{f}', (hh.name || '').replace(/家.*$/, ''));
}
function nobleLife(sim) {
  const S = sim.S, R = sim.rng;
  const highs = highHouseholds(sim);
  for (const hh of highs) {
    const c = colOf(sim, hh);
    const lead = hh.members.map((id) => S.people[id]).find((q) => q && q.deathYear == null && sim.isAdult(q) && q.needs);
    if (!lead) continue;
    const m = S.towns[hh.s]; if (!m || m.occupied) continue;
    const k = S.kingdoms[S.world.settlements[hh.s]?.kingdom];
    // 使えるお金：家計が150を超えた分の一部（見栄を張られると増える）。王家は国庫にも頼る
    const purse = { money: hh.money };
    const royalTreasury = hh.royal && k && k.treasury > 1200;
    let budget = Math.max(0, (hh.money - 150) * (0.05 + Math.min(0.06, c.envy * 0.01))) + (royalTreasury ? 40 : 0);
    if (budget < 3) { unmetLux(sim, hh, c); continue; }
    const want = HOBBIES[c.hobby].goods.concat(['wine', 'spice', 'jewelry', 'furniture', 'finery', 'perfume', 'painting', 'book', 'statue', 'truffle', 'liver']);
    const tries = R.int(1, 2);
    for (let i = 0; i < tries; i++) {
      const hobbyPick = R.chance(0.65);
      const pool = (hobbyPick ? HOBBIES[c.hobby].goods : want).filter((g) => m.stock[g] >= 1 && m.price[g] <= budget * 4);
      if (!pool.length) { if (hobbyPick) unmet(S.goods, hh.s, R.pick(HOBBIES[c.hobby].goods), 0.3); continue; }
      const g = R.pick(pool);
      const price = m.price[g];
      const payer = royalTreasury && price > hh.money - 150 ? (() => { const w = { money: k.treasury }; return w; })() : purse;
      if (payer.money - price < (payer === purse ? 120 : 800)) continue;
      if (!takeGoods(sim, hh.s, g, 1, payer)) continue;
      if (payer !== purse) k.treasury = payer.money;
      budget -= price;
      if (EAT.has(g) || g === 'furniture' || GOODS[g].base < 20) {
        lead.needs.pleasure = Math.min(100, lead.needs.pleasure + 15);
        if (g === 'furniture') hh.comfort = Math.min(10, (hh.comfort || 0) + 1);
        if (GOODS[g].base >= 20 && R.chance(0.3)) sim.remember(lead, `宴で${goodName(g)}を味わった`, { emo: 0.5, imp: 0.3 });
      } else {
        const piece = { g, name: pieceName(sim, g, hh), v: Math.round(price), d: sim.today };
        c.items.push(piece); c.value += piece.v;
        if (c.items.length > 40) { const old = c.items.shift(); c.value -= old.v; }
        lead.needs.esteem = Math.min(100, lead.needs.esteem + Math.min(40, price / 3));
        if (price >= 40) brag(sim, hh, lead, piece, highs);
      }
    }
    hh.money = purse.money;
    c.envy = Math.max(0, c.envy - 0.2);
    // 霊薬：年老いた・弱った当主は、長生きの薬を求める
    const age = sim.ageOf(lead);
    if ((age >= 50 || lead.hp < lead.maxhp * 0.7 || lead.sick) && m.stock.elixir >= 1 && hh.money > m.price.elixir + 150 && R.chance(0.25)) {
      if (takeGoods(sim, hh.s, 'elixir', 1, hh)) {
        lead.hp = lead.maxhp; lead.needs.survival = 100;
        lead.elixirs = (lead.elixirs || 0) + 1;
        sim.remember(lead, '高価な霊薬を飲み、体に力が戻るのを感じた', { emo: 0.6, imp: 0.5 });
      }
    }
    // 贈り物：ときどき、ほかの貴族か王へ（仲が良くなる）
    if (R.chance(0.04) && hh.money > 260) gift(sim, hh, lead, highs);
  }
}
function unmetLux(sim, hh, c) {
  if (sim.rng.chance(0.2)) unmet(sim.S.goods, hh.s, sim.rng.pick(HOBBIES[c.hobby].goods), 0.2);
}
function brag(sim, hh, lead, piece, highs) {
  const S = sim.S, R = sim.rng;
  const peers = highs.filter((h) => h !== hh && S.world.settlements[h.s]?.kingdom === S.world.settlements[hh.s]?.kingdom);
  const listeners = peers.flatMap((h) => h.members.map((id) => S.people[id])).filter((q) => q && q.deathYear == null && q.needs && sim.isAdult(q));
  sim.remember(lead, `${piece.name}を手に入れ、客に見せびらかした`, { emo: 0.6, imp: 0.5, k: 'collect' });
  if (listeners.length) sim.gossip(lead, `${piece.name}を手に入れたそうだ`, 0.3, listeners.slice(0, 12), { silent: true });
  // 張り合い：ほかの家の見栄に火がつく
  for (const h of peers) { const c = colOf(sim, h); if (c.value < colOf(sim, hh).value) c.envy = Math.min(6, c.envy + 1); }
  for (const q of listeners) if (R.chance(0.3)) q.needs.esteem = Math.max(0, q.needs.esteem - 5);
  if (piece.v >= 120 || R.chance(0.2)) sim.pushLog(`${hh.name}が${piece.name}（${piece.v}銅貨）を手に入れ、屋敷の広間に飾った。`, 'event', [lead.id], S.world.settlements[hh.s]);
}
function gift(sim, hh, lead, highs) {
  const S = sim.S, R = sim.rng, m = S.towns[hh.s];
  const g = ['wine', 'perfume', 'jewelry', 'spice', 'book', 'finery'].filter((x) => m.stock[x] >= 1).sort((a, b) => m.price[a] - m.price[b])[R.int(0, 2)];
  if (!g) return;
  const k = S.kingdoms[S.world.settlements[hh.s]?.kingdom];
  const king = k && S.people[k.kingId];
  const others = highs.filter((h) => h !== hh).flatMap((h) => h.members.map((id) => S.people[id])).filter((q) => q && q.deathYear == null && q.needs && sim.isAdult(q));
  const to = king && king.deathYear == null && king.needs && R.chance(0.3) && king.hh !== hh.id ? king : R.pick(others);
  if (!to) return;
  const w = { money: hh.money };
  if (!takeGoods(sim, hh.s, g, 1, w)) return;
  hh.money = w.money;
  sim.relMut(to, lead).a += 12; sim.relMut(lead, to).a += 5;
  to.needs.esteem = Math.min(100, to.needs.esteem + 10);
  sim.remember(to, `${lead.given}から${goodName(g)}を贈られた`, { emo: 0.5, imp: 0.4, about: [lead.id], k: 'gift' });
  sim.remember(lead, `${to.given}に${goodName(g)}を贈った`, { emo: 0.3, imp: 0.3, about: [to.id], k: 'gift' });
}

// 競売：週に1度、各国の王都で。市場の珍品と、亡くなった・落ちぶれた収集家の品が出る
function auctions(sim) {
  const S = sim.S, R = sim.rng, G = S.goods;
  // 持ち主のいなくなった収集・落ちぶれた家の収集は競売へ
  for (const [id, c] of Object.entries(G.col)) {
    const hh = S.households[id];
    const gone = !hh || !hh.members.some((x) => S.people[x]?.deathYear == null);
    const broke = hh && !gone && hh.money < 25 && c.items.length;
    if (!gone && !broke) continue;
    const s = S.world.settlements[hh?.s ?? 0];
    const cap = S.world.settlements.find((x) => x.kingdom === s?.kingdom && x.type === 'capital') || S.world.settlements[0];
    const lots = G.lots[cap.id] = G.lots[cap.id] || [];
    const sell = gone ? c.items.splice(0) : c.items.splice(0, 2);
    for (const it of sell) { lots.push({ ...it, seller: gone ? null : +id }); c.value -= it.v; }
    if (gone) delete G.col[id];
  }
  for (const cap of S.world.settlements.filter((s) => s.type === 'capital')) {
    const t = S.towns[cap.id]; if (!t || t.occupied) continue;
    const lots = (G.lots[cap.id] = G.lots[cap.id] || []).splice(0, 4);
    const rare = Object.keys(CATALOG).filter((g) => ['collect', 'jewel', 'magic', 'royal', 'delicacy'].includes(CATALOG[g].cat) && GOODS[g].base >= 25 && t.stock[g] >= 1);
    for (const g of R.shuffle(rare).slice(0, 3 - Math.min(2, lots.length))) { t.stock[g] -= 1; noteUsed(G, g, 1); lots.push({ g, name: pieceName(sim, g, { s: cap.id, name: '' }), v: Math.round(t.price[g]), d: sim.today, seller: 'market' }); }
    if (!lots.length) continue;
    const bidders = highHouseholds(sim).filter((h) => S.world.settlements[h.s]?.kingdom === cap.kingdom || h.money > 600);
    for (const lot of lots) {
      let best = null, second = lot.v * 0.8;
      for (const h of bidders) {
        const c = colOf(sim, h);
        const likes = HOBBIES[c.hobby].goods.includes(lot.g);
        const val = lot.v * (0.8 + R.next() * 0.6 + (likes ? 0.5 : 0) + c.envy * 0.08);
        if (h.money - val < 150) continue;
        if (!best || val > best.val) { if (best) second = Math.max(second, best.val); best = { h, val }; } else second = Math.max(second, val);
      }
      if (!best) { if (lot.seller === 'market') { t.stock[lot.g] += 1; } else (G.lots[cap.id] = G.lots[cap.id] || []).push(lot); continue; }
      const price = Math.round(Math.min(best.val, second * 1.05));
      best.h.money -= price;
      if (lot.seller != null && lot.seller !== 'market' && S.households[lot.seller]) S.households[lot.seller].money += price * 0.9;
      else t.fund += price * 0.9;   // 市場の品・持ち主のない品：代金は町の蓄えへ
      t.fund += lot.seller === 'market' ? 0 : price * 0.1;
      const c = colOf(sim, best.h);
      if (EAT.has(lot.g)) { /* 珍味は宴で振る舞われる */ } else { c.items.push({ g: lot.g, name: lot.name, v: price, d: sim.today }); c.value += price; if (c.items.length > 40) c.value -= c.items.shift().v; }
      const lead = best.h.members.map((id) => S.people[id]).find((q) => q && q.deathYear == null && q.needs);
      if (lead) { lead.needs.esteem = Math.min(100, lead.needs.esteem + 25); sim.remember(lead, `王都の競売で${lot.name}を${price}銅貨で競り落とした`, { emo: 0.7, imp: 0.5, k: 'collect' }); }
      const rec = { d: sim.today, town: cap.id, name: lot.name, g: lot.g, price, buyer: best.h.name };
      G.auctions.push(rec); if (G.auctions.length > 30) G.auctions.shift();
      sim.pushLog(`${cap.name}の競売で、${lot.name}が${best.h.name}に${price}銅貨で落札された。`, 'event', lead ? [lead.id] : [], cap);
      if (price >= 250) sim.news?.(`${cap.name}の競売で${lot.name}に${price}銅貨の値がついた`, 2, cap);
    }
  }
}

// 王家の宝物庫：冒険者が見つけた名のある宝（p.treasures）を、国庫で買い上げる
const TREASURE_VALUE = { '古代の金貨': 120, '竜の鱗の首飾り': 300, '魔石の王冠': 450, 'ファラオの黄金仮面': 600, '聖銀の短剣': 250, '星読みの水晶': 350, '古文書': 150, '人魚の涙': 280, '精霊の羽根': 220, '王家の紋章入り指輪': 400 };
function treasureVault(sim) {
  const S = sim.S, R = sim.rng, G = S.goods;
  for (const p of sim.living()) {
    if (!p.treasures?.length || !R.chance(0.15)) continue;
    const k = sim.kingdomOf(p);
    if (!k) continue;
    const name = p.treasures[0];
    const v = TREASURE_VALUE[name] || 150;
    if (name === 'ファラオの黄金仮面' && p.curse) continue;   // 呪いが解けるまで手放せない
    if (k.treasury < v * 1.6) continue;
    if (R.chance(0.35 * (p.values?.ambition || 0.5))) continue;   // 手元に置きたい者もいる
    p.treasures.shift();
    k.treasury -= v;
    p.purse = (p.purse || 0) + v * 0.5; const hh = sim.hh(p); if (hh) hh.money += v * 0.5; else p.purse += v * 0.5;
    (G.vault[k.id] = G.vault[k.id] || []).push({ name, from: p.id, d: sim.today, v });
    if (G.vault[k.id].length > 50) G.vault[k.id].shift();
    sim.remember(p, `見つけた「${name}」を王家の宝物庫に${v}銅貨で納めた`, { emo: 0.7, imp: 0.7, k: 'treasure' });
    p.fame = (p.fame || 0) + 10;
    sim.news?.(`${KINGDOMS[k.id]?.name || ''}の宝物庫に「${name}」が納められた`, 1);
    sim.chron?.(`冒険者${p.given}が「${name}」を王家に献じた`, k.id);
  }
}

// ---------- 表示（ui.js の暮らしタブ用） ----------
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 町の市場を分類ごとに並べる（econ-grid と同じ3列）
export function goodsEconHtml(sim, sid) {
  const S = sim.S; ensureGoods(sim);
  const m = S.towns[sid]; if (!m) return '';
  let h = '';
  for (const [cat, cname] of Object.entries(CATS)) {
    const keys = Object.keys(CATALOG).filter((k) => CATALOG[k].cat === cat);
    const shown = keys.filter((k) => m.stock[k] >= 0.5 || !GOODS[k].rare);
    if (!shown.length) continue;
    h += `<span class="h" style="grid-column:1/-1">${cname}</span>`;
    for (const k of shown) {
      const pr = m.price[k], r = pr / GOODS[k].base;
      const cls = r > 1.15 ? 'up' : r < 0.87 ? 'down' : '';
      h += `<span title="${escH(CATALOG[k].uses || '')}">${escH(goodName(k))}</span><span class="${cls}">${pr.toFixed(1)}銅貨</span><span>${Math.floor(m.stock[k])}個</span>`;
    }
  }
  return `<div class="econ-grid"><span class="h">品物</span><span class="h">市場の値段</span><span class="h">在庫</span>${h}</div>`;
}
// 収集家と競売と宝物庫（その町の国）
export function goodsCollectHtml(sim, sid) {
  const S = sim.S, G = ensureGoods(sim);
  const k = S.world.settlements[sid]?.kingdom;
  const cols = Object.entries(G.col).map(([id, c]) => ({ hh: S.households[id], c })).filter((x) => x.hh && S.world.settlements[x.hh.s]?.kingdom === k && x.c.items.length).sort((a, b) => b.c.value - a.c.value).slice(0, 5);
  let h = '';
  if (cols.length) h += `<h4 class="sub-h">名高い収集家</h4><ul class="plist">${cols.map(({ hh, c }) => `<li><span class="kind">${escH(HOBBIES[c.hobby].name)}</span><span>${escH(hh.name)}（${Math.round(c.value)}銅貨ぶん）<br><span class="sub">${c.items.slice(-4).map((x) => escH(x.name)).join('・')}</span></span></li>`).join('')}</ul>`;
  const auc = G.auctions.filter((a) => S.world.settlements[a.town]?.kingdom === k).slice(-5).reverse();
  if (auc.length) h += `<h4 class="sub-h">王都の競売</h4><ul class="plist">${auc.map((a) => `<li><span class="kind">落札</span><span>${escH(a.name)} … ${a.price}銅貨<br><span class="sub">${escH(a.buyer)}</span></span></li>`).join('')}</ul>`;
  const v = (G.vault[k] || []).slice(-5).reverse();
  if (v.length) h += `<h4 class="sub-h">王家の宝物庫</h4><ul class="plist">${v.map((x) => `<li><span class="kind">宝</span><span>「${escH(x.name)}」<br><span class="sub">${escH(S.people[x.from]?.given || '冒険者')}が納めた</span></span></li>`).join('')}</ul>`;
  return h;
}
// 品物の事典（分類・用途・産地・作り方）
export function goodsBookHtml() {
  const madeBy = {};
  for (const r of RECIPES) for (const g of Object.keys(r.out)) (madeBy[g] = madeBy[g] || []).push(r);
  const KN = ['アルデリア', 'ヴェルムント', 'サハル'];
  let h = '';
  for (const [cat, cname] of Object.entries(CATS)) {
    const keys = Object.keys(CATALOG).filter((k) => CATALOG[k].cat === cat);
    if (!keys.length) continue;
    h += `<h4 class="sub-h">${cname}</h4><ul class="plist">`;
    for (const k of keys) {
      const c = CATALOG[k];
      const how = (madeBy[k] || []).map((r) => `${Object.entries(r.inp).map(([g, n]) => goodName(g) + n).join('＋')}→${JOBS[r.jobs[0]]?.name || ''}`).join('／');
      const prod = c.prod ? c.prod.map((x, i) => (x >= 1.4 ? KN[i] + 'の特産' : x === 0 ? KN[i] + 'では採れない' : '')).filter(Boolean).join('・') : '';
      h += `<li><span class="kind">${GOODS[k].base}</span><span>${escH(c.name)}<br><span class="sub">${escH(c.uses || '')}${how ? '<br>作り方：' + escH(how) : ''}${prod ? '<br>' + escH(prod) : ''}</span></span></li>`;
    }
    h += '</ul>';
  }
  return h;
}
