// 持ち物の重さと枠・袋やかご（身に付ける装備）・荷獣と荷車・家の蔵と町の倉庫・荷運び・ダンジョンの宝の持ち帰り（開発部）
//
// 社長の決まり
//  1. 力の大きさで持てる重さが変わる。持てる重さを超えたら歩けない（その人が考えて荷を下ろす）。
//  2. 所持数の枠を超えては持てない。入らない物は拾わない・入れかえる・家に置く・地面に置く（黙って消さない）。
//  3. いま何を持っているかを、人の詳細欄で見られる（carryHtml）。重すぎる人の頭の上には印が出る（carryMarks）。
//  持てる量を増やす方法は2つ：力を鍛える（鍛錬・荷運び・力仕事）と、袋やかごを買って身に付ける。
//
// 数字は調査部の資料（docs/持ち物と運ぶ道具.md 第7章）による。
//  ・力：幼い子1、子ども2、老人と病人2、大人の女4、大人の男5、力仕事の職6、鍛えた荷運び8（上限）。
//  ・素手（肩と手）で持てるのは 力×3kg。袋やかごを身に付けると、その容量ぶん増える。
//    ただし体が耐えられるのは 力×5kg まで（身に付けた鎧も含む。着た鎧は重さの半分で数える）。
//  ・所持数の枠：基本12。袋やかごで増える。同じ素材や薬は1枠に重ねる。身に付けた武具と袋は枠を使わない。
//  ・荷獣（ロバ・荷馬）と荷車は、人の上限とは別の入れ物。
//
// 状態（すべて遅延初期化。古いセーブでも動く）
//  S.carry = { v, ground: [{x,z,it|tr,t,by,sid}], depots: { sid: { rent: {pid: {items, paid, due}} } }, heavy: [id], stats }
//  p.eq.back / belt / hand / rope / beast / cart … 身に付けた袋・かご・縄・荷獣・荷車（p.inv の中の品を指す）
//  p.carryFit（鍛えた力 0〜3）、p.carryWish（鍛えたい・袋がほしい理由）、p.held（荷運びが預かっている雇い主の荷）
//  p.hire（雇った荷運び）、p.porterFor（荷運びとして雇われている先）、hh.store（家の蔵の品）
//
// お金の出どころと行き先（すべて払う人→受け取る人。経済部の市場 market.js と帳簿 ledger.js を使う）
//  ・袋・かご・荷獣の代金：買い手の財布（足りなければ家計）→ 市場の品の持ち主（商人・店に預けた職人・町）… marketBuy
//  ・職人の材料：職人の家計 → 市場の品の持ち主（marketBuy）。町の素材置き場の魔物素材は、職人の家計 → 町の蓄え
//  ・職人と農夫の作った品：家の蔵へ（stash）。売るのは経済部の仕組み（商人が買い取る・市の日の露店）
//  ・倉庫代：借り手の財布・家計 → 倉庫（穀物倉）の持ち主の家計。持ち主がいなければ町の蓄え
//  ・荷運びの日当：雇い主の財布・家計 → 荷運びの財布・家計（雇いが終わった日に、働いた日数ぶん）。
//    町での荷揚げは、商人の家計 → 荷運び（毎日の終わりにまとめて）
//  ・荷獣の餌代：持ち主の財布・家計 → 市場の藁の持ち主（marketBuy）
//  ・地面に置いた品・拾った品：お金は動かない

import { ITEMS, TREASURE_ITEMS, makeItem, itemName, itemValue, carryHooks } from './items.js';
import { GOODS, JOBS } from './data.js';
import { pay, earn, spendable } from './property.js';
import { peopleNear } from './perf.js';
import { isAdventurer } from './guild.js';
import { marketBuy, personPayer, stash } from './market.js';
import { flow } from './ledger.js';
import { MAT } from './matter.js';

// ---------- 物の一覧（素材管理部の js/catalog/）から、重さ・重ねられる数・入れ物を読む ----------
// 入れ物は gear4.js の eq.slot='bag'（cap＝増える枠、kg＝増える持てる重さ、half＝中身が半分の重さ、place＝据え置き、beast＝荷獣に付ける）。
// 荷車・手押し車・そりは sub:'vehicle'（use の「荷を○kgまで運ぶ」）。荷を運ぶロバと荷馬は生き物なので、一覧にないためここで持つ。
// 一覧は経済部の matter.js が読み込んだもの（MAT）をそのまま使う（同じ重さ・同じ重ねられる数）
export const CAT = {};
for (const e of MAT.values()) if (e?.id && !CAT[e.id]) CAT[e.id] = e;

// 一覧にまだない品の重さ（kg）
const ITEM_W = { ring: 0.05, amulet: 0.1, potion: 0.3, antidote: 0.2, iron: 2, bone: 0.5, fang: 0.5, jelly: 0.5, silk: 0.2, bandage: 0.2, scale: 3, magicstone: 0.1, demoncore: 0.1, horn: 3, feather: 0.2, herb: 0.2, scalearmor: 14, holysword: 3, dragonblade: 3.5 };
const TYPE_W = { weapon: 3, armor: 8, shield: 5, accessory: 0.1, tool: 2, consumable: 0.3, material: 0.5, bag: 1, mount: 0 };
// ダンジョンの宝（名前で持つ品）
export const TREASURE_W = {
  '古代の金貨': 0.5, '竜の鱗の首飾り': 0.5, '魔石の王冠': 2, 'ファラオの黄金仮面': 10, '聖銀の短剣': 1, '星読みの水晶': 3,
  '古文書': 1, '人魚の涙': 0.1, '精霊の羽根': 0.05, '王家の紋章入り指輪': 0.05,
};
const TREASURE_V = 120; // 名のある宝の値打ちの目安（入れかえの判断に使う）
// 市場の品（1単位あたり）。一覧にある品は一覧の重さを使う
const GOODS_W0 = { wheat: 1, bread: 1, fish: 1, meat: 1, honey: 1, ore: 5, tools: 2, weapons: 3, ale: 2, cloth: 1.5, furniture: 15, gem: 0.1, wool: 2, herbs: 0.2, medicine: 0.2, shoes: 1, pottery: 2, jewelry: 0.1, stone: 10, armor: 8 };
export const goodWeight = (g) => CAT[g]?.w ?? GOODS_W0[g] ?? 2;

// ---------- 入れ物（身に付ける装備） ----------
// 体のどこに付けるか：back 背・belt 腰・hand 手（仕事の袋やかご）・beast 荷獣・beastbag 荷獣に付ける袋・cart 荷車・home 家に置く
const SLOTS = ['back', 'belt', 'hand', 'beast', 'beastbag', 'cart'];
export const SLOT_NAME = { back: '背', belt: '腰', hand: '手', beast: '荷獣', beastbag: '荷獣の袋', cart: '荷車' };
const bagSlot = (e) => {
  if (e.sub === 'vehicle') return 'cart';
  if (e.eq?.place) return 'home';
  if (e.eq?.beast) return 'beastbag';
  if (/背|天秤/.test(e.name) || (e.fits === 'なんでも' && e.eq.kg >= 12)) return 'back';
  if (e.eq.kg <= 5) return 'belt';
  return 'hand';
};
const SOFT = ['willow', 'reed', 'straw', 'rattan', 'vine'], CLOTH = ['hempcloth', 'woolcloth', 'cottoncloth', 'linen', 'sailcloth'];
const lifeOf = (e) => {
  if (e.eq?.half) return 2000;
  if ((e.rare || 0) >= 2) return 300;
  const from = Object.keys(e.make?.from || {});
  if (e.sub === 'vehicle' || from.some((k) => ['wood', 'iron', 'steel', 'clay'].includes(k))) return 200;
  if (from.some((k) => /hide|leather/.test(k))) return 80;
  if (from.some((k) => CLOTH.includes(k))) return 40;
  if (from.some((k) => SOFT.includes(k))) return 20;
  return 60;
};
// 仕事の袋やかご（その職の仕事がはかどる）。一覧の「入れる物」（fits）に合わせて選んだ
const JOB_BAGS = {
  farmer: ['harvestbasket', 'hempsack', 'backbasket', 'grainbale'], gardener: ['harvestbasket'], miller: ['hempsack'], baker: ['hempsack'], beekeeper: ['harvestbasket'],
  fisher: ['creel', 'netbag'], sailor: ['netbag', 'creel'], diver: ['netbag', 'creel'], gatherer: ['herbbasket', 'elvenpouch', 'backbasket'], herbalist: ['herbbasket', 'medicinebox'], doctor: ['medicinebox'],
  hunter: ['huntergamebag', 'furbag'], butcher: ['huntergamebag', 'orcstomach'], shepherd: ['shepherdbag'], woodcutter: ['frame'], charcoal: ['frame', 'backbasket'], mason: ['frame', 'orebag'], miner: ['orebag', 'dwarfminerpack'],
  wizard: ['magesatchel'], scholar: ['magesatchel'], sage: ['magesatchel'], courtmage: ['magesatchel'], magister: ['magesatchel'], scribe: ['magesatchel'], messenger: ['messengerbag'],
  peddler: ['peddlerbox', 'backbasket'], merchant: ['peddlerbox', 'travelerpack'], porter: ['porterpack', 'frame', 'carrypole'], soldier: ['soldierpack'], knight: ['soldierpack'], pilgrim: ['pilgrimscrip'],
};
// 作る職人：一覧の by を、この世界の職業に読みかえる（樽職人・車大工は大工が兼ねる）
const MAKER = { basketweaver: ['basketweaver'], roper: ['roper'], leatherworker: ['leatherworker'], weaver: ['weaver', 'sackmaker'], tailor: ['tailor', 'sackmaker'], carpenter: ['carpenter'], cooper: ['carpenter'], wheelwright: ['carpenter'] };
export const BAGS = {};
for (const e of MAT.values()) {
  if (e.cat !== 'gear') continue;
  const bag = e.sub === 'bag' && e.eq?.slot === 'bag';
  const veh = e.sub === 'vehicle' && /荷を(\d+)kg/.test(e.use?.map((u) => u.note || '').join(' ') || '');
  if (!bag && !veh) continue;
  const kg = veh ? +e.use.map((u) => u.note || '').join(' ').match(/荷を(\d+)kg/)[1] : e.eq.kg;
  const slot = bagSlot(e);
  const loot = (e.src || []).find((s) => s.how === 'loot');
  const jobs = Object.keys(JOB_BAGS).filter((j) => JOB_BAGS[j].includes(e.id));
  BAGS[e.id] = {
    name: e.name, type: 'bag', slot, cap: kg, sl: veh ? Math.round(kg / 25) : e.eq.cap, w: e.w, value: e.v, life: lifeOf(e),
    light: e.eq?.half ? 0.5 : null, rare: (e.rare || 0) >= 2 || !!loot, loot: loot ? loot.rate || 0.001 : 0, jobs,
    needBeast: veh && /wheelwright/.test(e.make?.by || '') && e.id !== 'handcart', by: e.make?.by || null, make: e.make || null, fits: e.fits || '', stuff: Object.keys(e.make?.from || {}).map((k) => CAT[k]?.name || k).join('と') || '—',
  };
}
// 荷を運ぶ生き物（一覧にないので、ここで持つ）
BAGS.donkey = { name: '荷を運ぶロバ', type: 'mount', slot: 'beast', cap: 60, sl: 6, w: 0, value: 80, life: 800, feed: 0.5, jobs: [], stuff: '生き物', by: 'rancher', fits: 'なんでも' };
BAGS.packhorse = { name: '荷馬', type: 'mount', slot: 'beast', cap: 110, sl: 8, w: 0, value: 150, life: 800, feed: 1, jobs: [], stuff: '生き物', by: 'rancher', fits: 'なんでも' };
for (const d of Object.values(BAGS)) if (d.slot === 'cart' || d.slot === 'beastbag') d.type = 'mount';
// 素材の品（市場で売り買いする）。値段は一覧の値打ち、麻布・縄・革は材料と手間に見合う値に
const NEW_GOODS = {
  hemp: [0.8, 16], flax: [1, 10], willow: [0.6, 16], straw: [0.3, 30], rope_fiber: [4, 10], hempcloth: [4, 10], linen: [7, 6],
  hide: [4, 10], leather: [7, 10], iron: [12, 14],
};
const MATS_OK = new Set([...Object.keys(NEW_GOODS), 'wood', 'ore']);
// 市場で作れる入れ物：まれでなく、材料がすべて市場にある物
for (const [id, d] of Object.entries(BAGS)) d.market = !d.rare && d.type !== 'mount' || d.slot === 'cart' || id === 'donkey' || id === 'packhorse';
for (const [id, d] of Object.entries(BAGS)) if (d.make && !d.rare) d.market = Object.keys(d.make.from).every((k) => MATS_OK.has(k)) && !!MAKER[d.make.by];
for (const d of Object.values(BAGS)) if (d.rare || d.value >= 1000) d.market = false;   // まれな品・王侯の馬車は市場で作らない

// ITEMS と GOODS に登録（本体の値段・在庫・所持品の仕組みがそのまま扱える）
for (const [id, d] of Object.entries(ITEMS)) { const c = CAT[id]; d.w = c?.w ?? ITEM_W[id] ?? d.w; if (c?.stack) d.stack = c.stack; }
for (const k of Object.keys(NEW_GOODS)) if (!ITEMS[k]) ITEMS[k] = { name: CAT[k]?.name || k, type: 'material', value: NEW_GOODS[k][0], w: CAT[k]?.w ?? 1, stack: CAT[k]?.stack || 20 };
for (const [id, d] of Object.entries(BAGS)) if (!ITEMS[id]) ITEMS[id] = { name: d.name, type: d.type, value: d.value, w: d.w, bag: true, stack: 1 };
for (const [k, [base, target]] of Object.entries(NEW_GOODS)) if (!GOODS[k]) GOODS[k] = { name: CAT[k]?.name || k, base, meals: 0, target };
for (const [id, d] of Object.entries(BAGS)) if (d.market && !GOODS[id]) GOODS[id] = { name: d.name, base: d.value, meals: 0, target: d.slot === 'beast' || d.slot === 'cart' || d.value >= 40 ? 1 : 3 };

// ---------- 新しい職人（一覧の by と同じ名前） ----------
const NEW_JOBS = {
  basketweaver: { name: 'かご編み', place: 'workshop', rank: 'commoner' },
  roper:        { name: '縄ない', place: 'workshop', rank: 'commoner' },
  sackmaker:    { name: '袋縫い', place: 'workshop', rank: 'commoner' },
  leatherworker:{ name: '革細工', place: 'workshop', rank: 'citizen' },
  porter:       { name: '荷運び', place: 'market', rank: 'commoner' },
};
for (const [k, j] of Object.entries(NEW_JOBS)) if (!JOBS[k]) JOBS[k] = { ...j };
// 力仕事の職（力＋1）
const LABOR = new Set(['soldier', 'knight', 'royalguard', 'guard', 'gatekeeper', 'miner', 'woodcutter', 'mason', 'smith', 'hunter', 'fisher', 'farmer', 'warrior', 'paladin', 'adventurer', 'porter', 'charcoal', 'rancher', 'sailor', 'shipwright', 'roadworker', 'pioneer', 'gravedigger', 'stablehand', 'butcher', 'miller', 'general', 'banditchief', 'pirate']);

// ---------- 作り方（職人の仕事） ----------
// 入れ物は一覧の make（材料・職人・時間）どおり。素材（麻布・縄・革）はここで決める
const RC = (out, n, inp, h, o = {}) => ({ out, n, inp, h, mats: o.mats || null });
// 経済部の matter.js は、一覧の作り手（かご編み・縄ない・革細工）を機織り・靴屋に読みかえて作らせる。
// ここでは新しい職人（かご編み・縄ない・袋縫い・革細工）が、自分の手に合う入れ物と素材を作る（機織りや靴屋と並んで作る）
const CRAFT = {
  roper: [RC('rope_fiber', 1, { hemp: 2 }, 0.8), RC('rope_fiber', 1, { straw: 4 }, 0.8)],
  sackmaker: [RC('hempcloth', 1, { hemp: 3 }, 1.2)],
  leatherworker: [RC('leather', 1, { hide: 1 }, 0.6)],
};
const OWN = { basketweaver: 'basketweaver', roper: 'roper', leatherworker: 'leatherworker', weaver: 'sackmaker', tailor: 'sackmaker' };
for (const [id, d] of Object.entries(BAGS)) {
  if (!d.market || !d.make || !OWN[d.make.by]) continue;
  const j = OWN[d.make.by];
  (CRAFT[j] = CRAFT[j] || []).push(RC(id, 1, d.make.from, Math.max(0.5, (d.make.t || 2) * 0.8)));
}
const SIDE = {};
// 町に置きたい職人の数
const WANT_JOBS = { basketweaver: { capital: 1, port: 1, village: 1 }, roper: { capital: 1, port: 1 }, sackmaker: { capital: 1, village: 1 }, leatherworker: { capital: 1, port: 1 }, porter: { capital: 2, port: 2, village: 1 } };
const FROM_JOBS = ['beggar', 'wanderer', 'laundress', 'gatherer', 'farmer', 'fisher', 'stablehand', 'maid', 'charcoal', 'woodcutter', 'shepherd'];

// ---------- 状態 ----------
let SIM = null;
export function ensureCarry(sim, fresh = false) {
  const S = sim.S;
  SIM = sim;
  const first = !S.carry;
  if (!S.carry) S.carry = { v: 1, ground: [], depots: {}, heavy: [], stats: {} };
  const C = S.carry;
  C.ground = C.ground || []; C.depots = C.depots || {}; C.heavy = C.heavy || [];
  const st = C.stats = C.stats || {};
  for (const k of ['dropped', 'picked', 'swapped', 'stashed', 'given', 'left', 'bought', 'boughtSpent', 'crafted', 'broken', 'rent', 'rentPaid', 'hired', 'wages', 'blocked', 'unblocked', 'rot', 'fed', 'treasureHome', 'treasureLeft', 'loot', 'lootLeft', 'recruited', 'trained']) if (st[k] == null) st[k] = 0;
  st.byGood = st.byGood || {};
  ensureTownGoods(sim, fresh || first);
  if (first) starterBags(sim);
  return C;
}
// 町の在庫と値段に新しい品を足す（古いセーブ・新しい村でも）
function ensureTownGoods(sim, fresh) {
  const S = sim.S;
  for (const s of S.world.settlements) {
    const m = S.towns[s.id];
    if (!m || !m.stock) continue;
    if (m._carryV === 1 && !fresh) continue;
    const kind = s.type === 'capital' ? 1 : s.type === 'port' ? 0.8 : 0.6;
    for (const k of [...Object.keys(NEW_GOODS), ...Object.keys(BAGS).filter((id) => GOODS[id])]) {
      if (m.price[k] == null || !isFinite(m.price[k])) m.price[k] = GOODS[k].base;
      if (m.stock[k] == null || !isFinite(m.stock[k]) || (fresh && m._carryV !== 1)) {
        const b = BAGS[k];
        m.stock[k] = b ? (b.slot === 'beast' || b.slot === 'cart' ? (s.type === 'capital' ? 1 : 0) : Math.round(GOODS[k].target * kind)) : Math.round(GOODS[k].target * kind);
      }
    }
    m._carryV = 1;
  }
}
// 最初の世界：それまでに手に入れていた袋やかごを持たせる（品物だけ。お金は動かない）
function starterBags(sim) {
  const R = sim.rng;
  const give = (p, id) => { const it = makeItem(id, R.range(0.85, 1.15)); it.dur = R.range(0.4, 1); p.inv.push(it); };
  for (const p of sim.living()) {
    if (!p.inv) p.inv = [];
    const age = sim.ageOf(p);
    if (age < 12) continue;
    if (p.tribe != null) { give(p, R.pick(['tribalbasket', 'furbag', 'reedbasket', 'netsack'])); equipBags(p); continue; }   // 民族ごとの編み籠や毛皮の袋
    const j = p.job;
    const tool = JOB_BAGS[j]?.find((id) => BAGS[id] && !BAGS[id].rare && BAGS[id].slot !== 'home');
    if (tool && R.chance(0.7)) give(p, tool);
    if (j === 'merchant') { give(p, 'travelerpack'); if (R.chance(0.6)) { give(p, 'packhorse'); if (R.chance(0.5)) give(p, 'cart'); } else give(p, 'donkey'); }
    if (j === 'peddler') { give(p, 'peddlerbox'); if (R.chance(0.5)) give(p, 'donkey'); }
    if (isAdventurer(p) && R.chance(0.5)) give(p, R.chance(0.5) ? 'adventurersack' : 'travelerpack');
    if (['soldier', 'knight'].includes(j) && R.chance(0.3)) give(p, 'soldierpack');
    if (sim.isAdult(p) && R.chance(0.55)) give(p, R.chance(0.6) ? 'leatherpouch' : 'coinpurse');
    if (j === 'farmer' && R.chance(0.3)) give(p, 'backbasket');
    equipBags(p);
  }
  for (const hh of Object.values(sim.S.households)) {
    if (hh.house == null) continue;
    hh.store = hh.store || [];
    const fish = hh.members.some((id) => ['fisher', 'brewer', 'innkeeper', 'butcher'].includes(sim.S.people[id]?.job));
    if (fish && R.chance(0.7)) hh.store.push(makeItem('barrel'));
    if (R.chance(0.3)) hh.store.push(makeItem('crate'));
  }
}

// ---------- 重さの計算 ----------
export function unitWeight(it) {
  const d = ITEMS[it.id];
  if (!d) return 1;
  return d.w ?? ITEM_W[it.id] ?? TYPE_W[d.type] ?? 0.5;
}
export function itemWeight(it) { return unitWeight(it) * (it.n || 1); }
// 何枠使うか：一覧の「重ねられる数」（stack）ごとに1枠
export function slotsOf(it) { const d = ITEMS[it.id]; const st = d?.stack || (['material', 'consumable'].includes(d?.type) ? 20 : 1); return Math.max(1, Math.ceil((it.n || 1) / st)); }
export const treasureWeight = (name) => TREASURE_W[name] ?? (String(name).startsWith('折れた') ? 2 : 1);
const heldWeight = (h) => (h.tr ? treasureWeight(h.tr) : itemWeight(h.it));
const bagOf = (it) => (it ? BAGS[it.id] : null);
const isBag = (it) => !!BAGS[it?.id];
const r1 = (x) => Math.round(x * 10) / 10;

// 力（1〜8）
export function carryPower(sim, p) {
  const age = sim.ageOf(p);
  let pw = age < 10 ? 1 : age < 14 ? 2 : age < 16 ? 3 : p.sex === 'm' ? 5 : 4;
  if (age >= 16 && age < 65 && LABOR.has(p.job)) pw += 1;
  if (age >= 14) {
    pw += Math.max(-1, Math.min(1, ((p.stats?.str ?? 10) - 10) * 0.12));   // 生まれつきと鍛錬の筋力（growth.js）
    pw += p.carryFit || 0;                                                 // 荷を担いで鍛えた分
  }
  if (age >= 65) pw = Math.min(pw, age >= 75 ? 1.5 : 2);
  if (p.ail || (p.pregnant || 0) >= 4 || (p.maxhp && p.hp < p.maxhp * 0.35)) pw = Math.min(pw, 2);
  if ((p.needs?.hunger ?? 50) < 8) pw -= 1;                                // ひどい空腹は力が出ない
  return Math.max(1, Math.min(8, pw));
}

// いまの荷の様子。重い計算ではないが、同じ時刻の2回目からは覚えておいた値を使う
export function carryState(sim, p, fresh = false) {
  const c = p._cl;
  if (!fresh && c && !p._cd && sim.S.t - c.t < 30) return c;
  const eq = p.eq || {};
  const worn = new Set([eq.weapon, eq.armor, eq.shield, eq.accessory].filter(Boolean));
  const bags = SLOTS.map((s) => eq[s]).filter(Boolean);
  const bagSet = new Set(bags);
  let light = 1;
  for (const b of bags) { const d = bagOf(b); if (d?.light) light = Math.min(light, d.light); }
  let wornW = 0, carried = 0, slots = 0;
  const inv = p.inv || [];
  for (const it of inv) {
    const w = itemWeight(it);
    if (worn.has(it)) { wornW += ITEMS[it.id]?.type === 'armor' ? w * 0.5 : w; continue; }
    if (bagSet.has(it)) { if (ITEMS[it.id]?.type !== 'mount') carried += w; continue; }   // 荷獣と荷車は自分で歩く・引かれる
    carried += w * light; slots += slotsOf(it);
  }
  for (const t of p.treasures || []) { carried += treasureWeight(t) * light; slots++; }
  for (const h of p.held || []) { carried += heldWeight(h); slots++; }
  const pw = carryPower(sim, p);
  let hands = pw * 3, sl = 12, beast = 0;
  for (const b of bags) {
    const d = bagOf(b);
    if (!d) continue;
    const ok = (b.dur ?? 1) > 0;
    if (d.slot === 'beast') { beast += d.cap; sl += d.sl; continue; }
    if (d.slot === 'cart') { if (!d.needBeast || eq.beast) { beast += d.cap; sl += d.sl; } continue; }
    if (d.slot === 'beastbag') { if (eq.beast) { beast += d.cap; sl += d.sl; } continue; }   // 鞍袋・荷かごは荷獣がいるときだけ
    if (ok) { hands += d.cap; sl += d.sl; }
  }
  if (p.inside != null && sim.building(p.inside)?.type && ['cave', 'pyramid', 'ruins', 'demoncastle'].includes(sim.building(p.inside).type)) beast = 0;   // 荷獣はダンジョンに入れない
  const body = pw * 5;
  const personCap = Math.max(0, Math.min(hands, body - wornW));   // 自分で背負える分
  const onBeast = Math.min(Math.max(0, carried - personCap), beast);   // あふれた分は荷獣と荷車へ
  const person = carried - onBeast;
  const cap = wornW + personCap + beast;
  const total = wornW + carried;
  const over = person > personCap + 1e-6;
  const st = { t: sim.S.t, pw, wornW, carried, person, personCap, hands, body, beast, cap, total, over, slots, maxSlots: sl, light, ratio: cap > 0 ? total / cap : 9 };
  p._cl = st; p._cd = false;
  return st;
}
// 重さ w の物をもう1つ持てるか（枠も見る）
function roomFor(sim, p, w, slot = true) {
  const st = carryState(sim, p, true);
  if (slot && st.slots >= st.maxSlots) return false;
  return st.carried + w * st.light <= st.personCap + st.beast + 1e-6;
}
const vpk = (it) => itemValue(it) / Math.max(0.05, itemWeight(it));   // 1kgあたりの値打ち

// ---------- 袋を身に付ける ----------
export function equipBags(p) {
  p.eq = p.eq || {};
  for (const s of SLOTS) {
    const cands = (p.inv || []).filter((it) => bagOf(it)?.slot === s && (it.dur ?? 1) > 0);
    const score = (it) => { const d = bagOf(it); return d.cap + d.sl * 2 + ((d.jobs || []).includes(p.job) ? 30 : 0) + (d.light ? (1 - d.light) * 40 : 0); };
    const best = cands.sort((a, b) => score(b) - score(a))[0];
    if (best) p.eq[s] = best; else if (p.eq[s] && !(p.inv || []).includes(p.eq[s])) p.eq[s] = null;
  }
  p._cd = true;
}
// 仕事の道具としての袋やかご（なければ運べる量が減り、稼ぎも減る）
const NEEDS_BAG = { farmer: 0.85, gardener: 0.9, fisher: 0.85, sailor: 0.9, diver: 0.9, gatherer: 0.8, herbalist: 0.9, hunter: 0.85, woodcutter: 0.9, charcoal: 0.9, peddler: 0.8, porter: 0.75, beekeeper: 0.9 };
export function carryWorkMul(p) {
  const mul = NEEDS_BAG[p.job];
  if (!mul) return 1;
  const eq = p.eq || {};
  for (const s of SLOTS) { const d = bagOf(eq[s]); if (d && (d.jobs || []).includes(p.job) && (eq[s].dur ?? 1) > 0) return 1; }
  if (eq.back && ['farmer', 'gatherer', 'charcoal', 'peddler'].includes(p.job)) return (1 + mul) / 2;   // 背負いの袋で代わりにする
  return mul;
}

// ---------- 置き場所 ----------
function ground(sim, p, x, z, obj) {
  const C = sim.S.carry;
  C.ground.push({ x: Math.round(x), z: Math.round(z), ...obj, t: sim.S.t, by: p?.id ?? null, sid: p?.s ?? null });
  C.stats.dropped++;
}
function dropHere(sim, p, obj) {
  let x = p.pos?.x ?? 0, z = p.pos?.z ?? 0;
  if (p.inside != null) { const b = sim.building(p.inside); if (b?.door) { x = b.door.x; z = b.door.z; } }
  ground(sim, p, x, z, obj);
}
const homeHere = (sim, p) => { const hh = sim.hh(p); return hh && hh.house != null && p.inside === hh.house ? hh : null; };
function stashHome(sim, hh, it) {
  hh.store = hh.store || [];
  const d = ITEMS[it.id];
  if (d && ['material', 'consumable'].includes(d.type)) { const same = hh.store.find((x) => x.id === it.id); if (same) { same.n = (same.n || 1) + (it.n || 1); return; } }
  hh.store.push(it);
  sim.S.carry.stats.stashed++;
}
function removeFromInv(p, it) {
  const i = (p.inv || []).indexOf(it);
  if (i >= 0) p.inv.splice(i, 1);
  if (p.eq) for (const k of Object.keys(p.eq)) if (p.eq[k] === it) p.eq[k] = null;
  p._cd = true;
}
// 手放してよい持ち物（身に付けた武具・袋・仕事の道具・依頼の品は手放さない）
function spareItems(sim, p) {
  const eq = new Set(Object.values(p.eq || {}).filter(Boolean));
  const keepQuest = new Set((sim.S.quests || []).filter((q) => q.id === p.quest && q.item).map((q) => q.item));
  let potions = 0;
  return (p.inv || []).filter((it) => {
    if (eq.has(it)) return false;
    if (keepQuest.has(it.id)) return false;
    if (it.id === 'potion' && potions++ < 1) return false;
    return true;
  });
}
// そばにいる仲間（同じ依頼のパーティー・雇った荷運び・同じ家の家族）
function companions(sim, p) {
  const out = [];
  const S = sim.S;
  const near = (q, r) => q && q !== p && q.deathYear == null && q.pos && p.pos && Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.z - p.pos.z) <= r && q.jail == null && !q.fight;
  if (p.hire) { const q = S.people[p.hire.porter]; if (near(q, 10) && S.t < p.hire.until) out.push(q); }
  const pt = p.party ? S.advParties?.[p.party] : null;
  if (pt) for (const id of pt.members) { const q = S.people[id]; if (near(q, 4) && (!p.quest || q.quest === p.quest)) out.push(q); }
  const hh = sim.hh(p);
  if (hh) for (const id of hh.members) { const q = S.people[id]; if (near(q, 2) && sim.isAdult(q)) out.push(q); }
  return out;
}
// 持ち物に足す（同じ素材や薬は1つに重ねる）
function pushMerge(p, it) {
  p.inv = p.inv || [];
  const d = ITEMS[it.id];
  const same = d && ['material', 'consumable'].includes(d.type) && p.inv.find((x) => x.id === it.id && x !== it);
  if (same) same.n = (same.n || 1) + (it.n || 1); else p.inv.push(it);
  p._cd = true;
  if (isBag(it)) equipBags(p);
}
function giveTo(sim, from, to, obj) {
  if (to.porterFor && to.porterFor.by === from.id) { (to.held = to.held || []).push(obj); to._cd = true; return; }
  if (obj.tr) { (to.treasures = to.treasures || []).push(obj.tr); to._cd = true; return; }
  pushMerge(to, obj.it);
}

// あふれたときの判断（資料 7-(8) の順）。返り値：'room' 場所を空けたので持てる／'placed' 家の蔵や仲間に渡した／'left' その場に置いた
function decideOverflow(sim, p, obj, where = 'slot') {
  const S = sim.S, st = S.carry.stats;
  const w = obj.tr ? treasureWeight(obj.tr) : itemWeight(obj.it);
  const name = obj.tr ? `「${obj.tr}」` : itemName(obj.it);
  const val = obj.tr ? TREASURE_V : itemValue(obj.it);
  // 家にいれば家の蔵へ
  const hh = homeHere(sim, p);
  if (hh && obj.it) { stashHome(sim, hh, obj.it); return 'placed'; }
  // 1. 仲間に分ける
  for (const q of companions(sim, p)) {
    if (roomFor(sim, q, w)) {
      giveTo(sim, p, q, obj); st.given++;
      if (val >= 8 && sim.rng.chance(0.5)) sim.remember(p, `持ちきれない${name}を${q.given}に持ってもらった`, { emo: 0.1, imp: 0.2, about: [q.id], k: 'carry' });
      return 'placed';
    }
  }
  // 2. 1kgあたりの値打ちが一番低い物と入れかえる（枠があふれたときは枠だけ、重さのときは重さも見る）
  const ok = () => { const s2 = carryState(sim, p, true); return where === 'slot' ? s2.slots < s2.maxSlots : roomFor(sim, p, w, true); };
  const myV = val / Math.max(0.05, w);
  const spare = spareItems(sim, p).filter((it) => vpk(it) < myV && itemValue(it) < val).sort((a, b) => vpk(a) - vpk(b));
  const out = [];
  for (const it of spare) {
    if (ok() || out.length >= 6) break;
    removeFromInv(p, it); out.push(it);
  }
  if (out.length) {
    if (ok()) {
      for (const it of out) dropHere(sim, p, { it });
      st.swapped++;
      if (val >= 5 || sim.rng.chance(0.2)) sim.remember(p, `${out.map(itemName).join('・')}をその場に置いて、${name}を持った`, { emo: 0.1, imp: 0.25, k: 'carry' });
      return 'room';
    }
    for (const it of out) p.inv.push(it);   // 入れかえても足りない：元に戻す
    p._cd = true;
  }
  // 3〜6. 置いていく（あとで誰かが拾える）。次は袋を買うか、力を鍛えようと思う
  dropHere(sim, p, obj);
  st.left++;
  if (val >= 5) {
    sim.remember(p, `持ちきれず、${name}を置いてきた`, { emo: -0.3, imp: val >= 40 ? 0.5 : 0.3, k: 'carry' });
    wish(sim, p, val >= 40 ? 'treasure' : 'bag');
  }
  return 'left';
}
function wish(sim, p, why) {
  p.carryWish = { why, until: sim.today + 12 };
}

// items.js の addItem から呼ばれる：枠を超える品は持たない（入れかえるか、家の蔵か地面へ）
carryHooks.add = (p, it, merged) => {
  p._cd = true;
  if (merged || !SIM || !SIM.S?.carry || p.deathYear != null || !p.pos) {
    if (!merged && isBag(it) && p.inv) { p.inv.push(it); equipBags(p); return it; }
    return null;
  }
  if (isBag(it)) {
    // 袋やかごは身に付ける。予備の袋は枠を使う
    const st = carryState(SIM, p, true);
    const slot = bagOf(it).slot;
    const cur = p.eq?.[slot];
    if (cur && st.slots >= st.maxSlots && !homeHere(SIM, p)) { if (decideOverflow(SIM, p, { it }) !== 'room') return it; }
    p.inv.push(it); equipBags(p);
    return it;
  }
  const st = carryState(SIM, p, true);
  p._cd = true;                                      // このあと品が増えるので、次は数え直す
  if (st.slots < st.maxSlots) return null;          // 枠に空きがある：そのまま持つ
  const r = decideOverflow(SIM, p, { it });
  p._cd = true;
  return r !== 'room' ? it : null;
};
// ---------- 経済部の物（matter.js）を持ち歩く ----------
// 仕事で採った物・狩りの獲物・ダンジョンの宝は、まず採った人の持ち物に入る（重さと枠の上限あり）。
// 家（家のない人は泊まっている宿）に帰ったら、家の蔵へ移す（carryHourly）。売るのは経済部の仕組み。
export function matterItem(id) {
  if (ITEMS[id]) return ITEMS[id];
  const e = CAT[id];
  if (!e) return null;
  ITEMS[id] = { name: e.name, type: 'material', value: e.v, w: e.w, stack: e.stack || 1, matter: true };
  return ITEMS[id];
}
carryHooks.carry = (sim, p, id, q, how) => {
  if (!sim.S.carry || !p || p.deathYear != null || !p.pos || !(q > 0)) return q;
  const d = matterItem(id);
  if (!d || homeHere(sim, p)) return q;                // 家の中で手に入れた物は、そのまま家の蔵へ
  p.inv = p.inv || [];
  const st = Math.max(1, d.stack || 1), uw = d.w ?? 0.5;
  let same = p.inv.find((x) => x.id === id);
  let cur = same ? same.n || 1 : 0, fit = 0;
  while (fit < q) {
    const needSlot = (cur + fit) % st === 0;           // 重ねきれず、新しい枠が要る
    if (!roomFor(sim, p, uw * (fit + 1), needSlot)) break;
    if (needSlot) { const s2 = carryState(sim, p, true); if (s2.slots + Math.ceil((cur + fit + 1) / st) - Math.ceil(Math.max(cur, 1) / st) > s2.maxSlots) break; }
    fit++;
  }
  if (fit > 0) { if (same) same.n = cur + fit; else p.inv.push(same = makeItem(id, 1, { n: fit })); p._cd = true; }
  const left = q - fit;
  if (left > 0) {
    // 持ちきれない：値打ちの低い物と入れかえるか、その場に置く（あとで誰かが拾える）
    const it = makeItem(id, 1, { n: left });
    const r = decideOverflow(sim, p, { it }, 'weight');
    if (r === 'room') { const s3 = p.inv.find((x) => x.id === id); if (s3) s3.n = (s3.n || 1) + left; else p.inv.push(it); p._cd = true; }
  }
  sim.S.carry.stats.carriedIn = (sim.S.carry.stats.carriedIn || 0) + fit;
  return 0;
};
// 家（宿）に着いたら、持ち歩いていた物を家の蔵へ
function unloadMatter(sim, p, hh) {
  let n = 0;
  for (const it of (p.inv || []).slice()) {
    if (!ITEMS[it.id]?.matter || ITEMS[it.id].type !== 'material') continue;
    removeFromInv(p, it);
    stash(sim, hh, it.id, it.n || 1);
    n += it.n || 1;
  }
  if (n) sim.S.carry.stats.unloaded = (sim.S.carry.stats.unloaded || 0) + n;
}
const lodgingOf = (sim, p) => { const hh = sim.hh(p); if (!hh || p.inside == null) return null; if (hh.house != null) return p.inside === hh.house ? hh : null; const b = sim.building(p.inside); return b && (b.type === 'tavern' || b.type === 'inn') ? hh : null; };

// 相続：受け継いだ品は、持てなければ跡継ぎの家の蔵へ
carryHooks.inherit = (sim, heir, it) => {
  const hh = sim.hh(heir);
  const st = carryState(sim, heir, true);
  if (!isBag(it) && hh && hh.house != null && (st.slots >= st.maxSlots || !roomFor(sim, heir, itemWeight(it)))) { stashHome(sim, hh, it); return it; }
  (heir.inv = heir.inv || []).push(it); heir._cd = true;
  if (isBag(it)) equipBags(heir);
  if (hh || !heir.pos) return it;
  if (st.slots >= st.maxSlots) { removeFromInv(heir, it); dropHere(sim, heir, { it }); }
  return it;
};
// 商人の隊商に積める量（logistics.js）。荷車・荷馬・背負い袋の重さの容量で決まる
carryHooks.tradeQty = (sim, p, base, g) => {
  if (!sim.S.carry) return base;
  const st = carryState(sim, p, true);
  const kg = Math.max(0, st.cap - st.total);
  const w = goodWeight(g);
  return Math.max(1, Math.min(base + 4, Math.floor(kg / w)));
};

// ---------- 歩く：重すぎたら歩けない（sim.walk の頭で呼ぶ）。返り値は速さの倍率。0 なら今は歩かない ----------
export function carryWalk(sim, p) {
  if (!sim.S.carry) return 1;
  const st = carryState(sim, p);
  if (!st.over) { if (p._heavy != null) p._heavy = null; return st.ratio > 0.85 ? 0.85 : 1; }
  const S = sim.S;
  // 下ろせる物がない（身に付けた鎧だけで重い）：立ち止まらず、とても遅く歩く
  if (!spareItems(sim, p).length && !p.treasures?.length && !p.held?.length) return 0.35;
  if (p._heavy == null) {
    p._heavy = S.t; S.carry.stats.blocked++;
    if (!S.carry.heavy.includes(p.id)) S.carry.heavy.push(p.id);
    if (sim.isWatched?.(p)) sim.events.push({ type: 'say', id: p.id, text: '荷が重くて歩けない……どれかを置いていこう' });
    return 0;
  }
  if (S.t - p._heavy < 3) return 0;          // 立ち止まって、何を下ろすか考える
  lighten(sim, p);
  p._heavy = null;
  S.carry.stats.unblocked++;
  const st2 = carryState(sim, p, true);
  if (st2.over) return 0.35;                 // 身に付けた鎧だけで重い：とても遅く歩く
  return 1;
}
// 荷を下ろす：家なら蔵へ、仲間がいれば渡し、いなければ値打ちの低い物からその場に置く
export function lighten(sim, p) {
  const hh = homeHere(sim, p);
  const put = [];
  for (let i = 0; i < 40; i++) {
    const st = carryState(sim, p, true);
    if (!st.over) break;
    const spare = spareItems(sim, p).sort((a, b) => vpk(a) - vpk(b));
    const tr = (p.treasures || []).slice().sort((a, b) => TREASURE_V / treasureWeight(a) - TREASURE_V / treasureWeight(b));
    let obj = null;
    if (spare.length && (!tr.length || vpk(spare[0]) <= TREASURE_V / treasureWeight(tr[0]))) { obj = { it: spare[0] }; removeFromInv(p, spare[0]); }
    else if (p.held?.length) { obj = p.held.shift(); p._cd = true; }
    else if (tr.length) { obj = { tr: tr[0] }; p.treasures.splice(p.treasures.indexOf(tr[0]), 1); p._cd = true; }
    else break;
    const w = obj.tr ? treasureWeight(obj.tr) : itemWeight(obj.it);
    if (hh) { if (obj.it) stashHome(sim, hh, obj.it); else { stashHome(sim, hh, { id: 'relic', custom: obj.tr, value: TREASURE_V, tr: true }); } put.push(obj); continue; }
    const mate = companions(sim, p).find((q) => roomFor(sim, q, w));
    if (mate) { giveTo(sim, p, mate, obj); sim.S.carry.stats.given++; put.push(obj); continue; }
    dropHere(sim, p, obj); put.push(obj);
  }
  if (put.length) {
    const names = put.slice(0, 3).map((o) => (o.tr ? `「${o.tr}」` : itemName(o.it))).join('・');
    sim.remember(p, hh ? `重すぎる荷を下ろして、${names}を家に置いた` : `荷が重くて歩けず、${names}をその場に下ろした`, { emo: -0.1, imp: 0.25, k: 'carry' });
    if (!hh) wish(sim, p, 'bag');
  }
  p._cd = true;
}

// ---------- ダンジョンの宝を持ち帰る（sim.doQuest から） ----------
// 持てれば持つ。だめなら雇った荷運び、仲間、値打ちの低い物との入れかえ。どれも無理なら置いてくる
export function carryLoot(sim, p, it, b) {
  const st = sim.S.carry?.stats;
  if (!st) { return null; }
  st.loot++;
  const stackable = ['material', 'consumable'].includes(ITEMS[it.id]?.type) && (p.inv || []).some((x) => x.id === it.id);
  if (roomFor(sim, p, itemWeight(it), !stackable)) {
    if (stackable) { const same = p.inv.find((x) => x.id === it.id); same.n = (same.n || 1) + (it.n || 1); p._cd = true; return same; }
    p.inv.push(it); p._cd = true; if (isBag(it)) equipBags(p);
    return it;
  }
  const porter = porterAt(sim, p, b);
  if (porter && roomFor(sim, porter, itemWeight(it))) { (porter.held = porter.held || []).push({ it }); porter._cd = true; return it; }
  const r = decideOverflow(sim, p, { it }, 'weight');
  if (r === 'room') {
    const same = ['material', 'consumable'].includes(ITEMS[it.id]?.type) && p.inv.find((x) => x.id === it.id);
    if (same) { same.n = (same.n || 1) + (it.n || 1); p._cd = true; return same; }
    p.inv.push(it); p._cd = true; if (isBag(it)) equipBags(p); return it;
  }
  if (r === 'left') st.lootLeft++;
  return it;
}
// 名のある宝。持ち帰れたら true
export function carryTreasure(sim, p, name, b) {
  const C = sim.S.carry;
  if (!C) { (p.treasures = p.treasures || []).push(name); return true; }
  const w = treasureWeight(name);
  if (roomFor(sim, p, w)) { (p.treasures = p.treasures || []).push(name); p._cd = true; return true; }
  const porter = porterAt(sim, p, b);
  if (porter && roomFor(sim, porter, w)) { (porter.held = porter.held || []).push({ tr: name }); porter._cd = true; sim.remember(p, `見つけた「${name}」を、荷運びの${porter.given}に担いでもらった`, { emo: 0.4, imp: 0.4, k: 'carry', about: [porter.id] }); return true; }
  // 値打ちの低い物を捨ててでも宝を持つ
  const r = decideOverflow(sim, p, { tr: name }, 'weight');
  if (r === 'room') { (p.treasures = p.treasures || []).push(name); p._cd = true; return true; }
  if (r === 'placed') return true;
  // 置いてきた（宝はダンジョンの入口に残り、ほかの人が見つけることもある。記憶は decideOverflow が残す）
  C.stats.treasureLeft++;
  wish(sim, p, 'treasure');
  return false;
}
// 深い所の宝箱から、まれに珍しい袋が出る（外から入る品）
export function carryDungeon(sim, p, b) {
  const R = sim.rng;
  const deep = b.type === 'pyramid' || b.type === 'demoncastle' ? 2 : 1;
  let id = null;
  // 一覧で「宝箱から出る」とされた入れ物（魔法の小袋・次元の背嚢・底なしの袋）を、一覧の出る割合で
  for (const [k, d] of Object.entries(BAGS)) if (d.loot && R.chance(d.loot * 2 * deep)) { id = k; break; }
  if (!id) return;
  const it = makeItem(id, R.range(0.9, 1.3));
  carryLoot(sim, p, it, b);
  if (p.inv?.includes(it)) {
    sim.remember(p, `${b.name}の宝箱から${BAGS[id].name}を見つけた`, { emo: 0.8, imp: 0.7, k: 'carry' });
    sim.pushLog(`冒険者${p.given}が${b.name}の宝箱から${BAGS[id].name}を見つけた。`, 'event', [p.id], b.door);
    p.fame = (p.fame || 0) + 5;
  }
}

// ---------- 荷運び（ポーター） ----------
function porterAt(sim, p, b) {
  if (!p.hire) return null;
  const q = sim.S.people[p.hire.porter];
  if (!q || q.deathYear != null || sim.S.t > p.hire.until || q.porterFor?.by !== p.id) return null;
  if (b && q.pos && Math.abs(q.pos.x - b.door.x) + Math.abs(q.pos.z - b.door.z) > 10) return null;
  return q;
}
const DAY_WAGE = 8;
// 日雇いで荷運びを引き受けることのある仕事（体を使う下働き）
const HIRE_JOBS = new Set(['laundress', 'gravedigger', 'coachman', 'servant', 'stablehand', 'maid', 'miller', 'roadworker', 'charcoal', 'sailor', 'shepherd', 'woodcutter', 'fisher', 'farmer', 'gatherer']);   // ダンジョンへの荷運びの日当（町の人夫5銅貨より高い。危ないので）
function hirePorters(sim) {
  const S = sim.S, R = sim.rng;
  for (const p of sim.living()) {
    const a = p.action;
    if (!a || a.type !== 'quest' || a.phase !== 'walk' || p.hire || !isAdventurer(p)) continue;
    const q = a.quest;
    if (!q || typeof q.target !== 'string' || !q.target.startsWith('b')) continue;
    const b = sim.building(+q.target.slice(1));
    if (!b || b.type === 'hideout') continue;
    // 荷が多い人・前に宝を置いてきた人・懐に余裕のある人ほど雇う
    const st = carryState(sim, p);
    const want = (p.carryWish?.why === 'treasure' ? 0.6 : 0) + (st.ratio > 0.6 ? 0.3 : 0) + (spendable(sim, p) > 80 ? 0.2 : 0);
    if (!R.chance(Math.min(0.8, want))) { p.hire = { porter: null, until: S.t + 240 }; continue; }   // 今回は雇わない（しばらく考え直さない）
    const days = 2, fee = DAY_WAGE * days;
    if (spendable(sim, p) < fee + 10) { p.hire = { porter: null, until: S.t + 240 }; continue; }
    // 荷運び：本職の荷運び、宿なし・物乞い、手の空いた若者や貧しい家の者（日雇い）
    const cand = sim.living().filter((x) => x.s === p.s && !x.porterFor && x.jail == null && !x.fight && sim.isAdult(x) && sim.ageOf(x) < 56 && x.hh !== p.hh && !x.mission && !x.ail && !x.party && !isAdventurer(x) && x.tribe == null
      && (x.job === 'porter' || x.job === 'beggar' || x.job === 'wanderer' || (!x.job && !x.retired) || ((FROM_JOBS.includes(x.job) || HIRE_JOBS.has(x.job)) && (sim.hh(x)?.money ?? 0) < 150)));
    const porter = cand.sort((x, y) => (y.job === 'porter') - (x.job === 'porter') || carryPower(sim, y) - carryPower(sim, x))[0];
    if (!porter) { p.hire = { porter: null, until: S.t + 240 }; continue; }
    // 日当は雇いが終わった日に、働いた日数ぶん払う（endHires）
    S.carry.stats.hired++;
    const until = S.t + 60 * 24 * days;
    p.hire = { porter: porter.id, until };
    porter.porterFor = { by: p.id, until, bld: b.id, from: S.t };
    porter.mission = { type: 'porter', x: b.door.x, z: b.door.z, until, dur: 120 };
    porter.action = null;
    sim.remember(p, `${b.name}へ行くのに、${porter.given}を荷運びに雇った（日当${DAY_WAGE}銅貨）`, { emo: 0.2, imp: 0.3, k: 'carry', about: [porter.id] });
    sim.remember(porter, `冒険者${p.given}に荷運びとして雇われ、${b.name}の入口まで行くことになった`, { emo: 0.3, imp: 0.35, k: 'carry', about: [p.id] });
    if (R.chance(0.3)) sim.pushLog(`冒険者${p.given}が${porter.given}を荷運びに雇い、${b.name}へ向かった。`, 'event', [p.id, porter.id], p.pos);
  }
}
// 雇いの終わり：預かった荷を雇い主に渡す（遠ければ雇い主の家へ届ける）
function endHires(sim) {
  const S = sim.S;
  for (const q of sim.living()) {
    const h = q.porterFor;
    if (!h) continue;
    const boss = S.people[h.by];
    const bossDone = !boss || boss.deathYear != null || !(boss.action?.type === 'quest') || S.t > h.until;
    if (!bossDone) continue;
    handOver(sim, q, boss);
    payPorter(sim, boss, q, h);
    q.porterFor = null;
    if (q.mission?.type === 'porter') { q.mission = null; if (q.action?.type === 'porter') q.action = null; }
    if (boss && boss.hire?.porter === q.id) boss.hire = null;
  }
  for (const p of sim.living()) if (p.hire && S.t > p.hire.until) p.hire = null;
}
// 荷運びの日当：働いた日数（半日は1日と数える）×日当。雇い主の財布と家計から、荷運びの財布と家計へ
function payPorter(sim, boss, porter, h) {
  if (!boss || boss.deathYear != null) return;
  const days = Math.max(1, Math.ceil((Math.min(sim.S.t, h.until) - (h.from ?? sim.S.t)) / (60 * 12)) / 2);
  const fee = Math.min(DAY_WAGE * Math.ceil(days), spendable(sim, boss));
  if (fee <= 0) { sim.remember(porter, `${boss.given}は荷運びの日当を払えなかった`, { emo: -0.5, imp: 0.4, k: 'carry', about: [boss.id] }); return; }
  pay(sim, boss, fee); earn(sim, porter, fee, 0.6);
  flow(sim, '冒険者', '荷運び', fee, '荷運びの日当');
  sim.S.carry.stats.wages += fee;
}
function handOver(sim, porter, boss) {
  const held = porter.held || [];
  porter.held = [];
  porter._cd = true;
  if (!held.length) return;
  const near = boss && boss.deathYear == null && boss.pos && porter.pos && Math.abs(boss.pos.x - porter.pos.x) + Math.abs(boss.pos.z - porter.pos.z) <= 8;
  const hh = boss ? sim.S.households[boss.hh] : null;
  for (const h of held) {
    if (near && roomFor(sim, boss, heldWeight(h))) { if (h.tr) (boss.treasures = boss.treasures || []).push(h.tr); else pushMerge(boss, h.it); boss._cd = true; continue; }
    if (hh && hh.house != null) { stashHome(sim, hh, h.it || { id: 'relic', custom: h.tr, value: TREASURE_V, tr: true }); if (h.tr) sim.S.carry.stats.treasureHome++; continue; }
    // 家のない雇い主：町の倉庫に預ける（倉庫代は雇い主の持ち）。雇い主が亡くなっていればその場に置く
    if (boss && boss.deathYear == null) depositDepot(sim, boss, [h.it || { id: 'relic', custom: h.tr, value: TREASURE_V, tr: true }], true);
    else dropHere(sim, porter, h);
  }
  if (boss && boss.deathYear == null) sim.remember(boss, `荷運びの${porter.given}が、預けていた荷を${near ? '手渡してくれた' : '家まで届けてくれた'}`, { emo: 0.3, imp: 0.3, k: 'carry', about: [porter.id] });
}

// ---------- 町の倉庫（穀物倉を借りる） ----------
const RENT_KG = 10, RENT_DAYS = 5;   // 10kg分を5日あずけるごとに1銅貨（前払い）
function depotOwner(sim, sid) {
  const s = sim.town(sid);
  const b = sim.townBuilding?.(s, 'granary') || sim.townBuilding?.(s, 'market');
  const hh = b?.owner != null ? sim.S.households[b.owner] : null;
  return { b, hh };
}
function rentFee(items) { const kg = items.reduce((s, it) => s + (it.tr ? 1 : itemWeight(it)), 0); return Math.max(1, Math.ceil(kg / RENT_KG)); }
function payRent(sim, p, sid, fee) {
  const { hh } = depotOwner(sim, sid);
  if (spendable(sim, p) < fee) return false;
  pay(sim, p, fee);
  if (hh) hh.money += fee; else sim.S.towns[sid].fund = (sim.S.towns[sid].fund || 0) + fee;   // 倉の持ち主（いなければ町の蓄え）へ
  flow(sim, '倉庫の借り手', hh ? '倉の持ち主' : '町の蓄え', fee, '倉庫代');
  sim.S.carry.stats.rentPaid += fee;
  return true;
}
export function depositDepot(sim, p, items, force = false) {
  const C = sim.S.carry, sid = p.s;
  const D = C.depots[sid] = C.depots[sid] || { rent: {} };
  const r = D.rent[p.id] || { items: [], paid: sim.today, due: 0 };
  const fee = rentFee([...r.items, ...items]) - (r.items.length ? rentFee(r.items) : 0);
  if (!force && !payRent(sim, p, sid, Math.max(1, fee))) return false;
  if (force && !payRent(sim, p, sid, Math.max(1, fee))) r.due += Math.max(1, fee);
  r.items.push(...items);
  if (!D.rent[p.id]) { r.paid = sim.today + RENT_DAYS; C.stats.rent++; }
  D.rent[p.id] = r;
  p.depot = sid;
  return true;
}
function depotDaily(sim) {
  const S = sim.S, C = S.carry;
  for (const [sid, D] of Object.entries(C.depots)) {
    for (const [pid, r] of Object.entries(D.rent)) {
      const p = S.people[pid];
      if (!p || p.deathYear != null) {
        // 借り手が亡くなった：家族の家の蔵へ（家族がいなければ倉の持ち主のもの）
        const hh = p ? S.households[p.hh] : null;
        const { hh: owner, b } = depotOwner(sim, +sid);
        const to = hh && hh.house != null ? hh : owner && owner.house != null ? owner : null;
        for (const it of r.items) { if (to) stashHome(sim, to, it); else if (b) ground(sim, null, b.door.x, b.door.z, { it }); }
        delete D.rent[pid];
        continue;
      }
      if (sim.today < r.paid) continue;
      const fee = rentFee(r.items) + (r.due || 0);
      if (payRent(sim, p, +sid, fee)) { r.paid = sim.today + RENT_DAYS; r.due = 0; }
      else if (sim.today - r.paid > 10) {
        // 10日を過ぎても払えない：荷は倉の持ち主が引き取る
        const { hh: owner, b } = depotOwner(sim, +sid);
        for (const it of r.items) { if (owner && owner.house != null) stashHome(sim, owner, it); else if (b) ground(sim, null, b.door.x, b.door.z, { it }); }
        sim.remember(p, '倉庫代が払えず、預けていた荷を倉の持ち主に取られた', { emo: -0.6, imp: 0.5, k: 'carry' });
        delete D.rent[pid];
      }
    }
  }
}
function takeFromDepot(sim, p) {
  const D = sim.S.carry.depots[p.s];
  const r = D?.rent[p.id];
  if (!r || sim.today >= r.paid && r.due) return;
  // よい装備や袋があれば引き出す
  for (const it of r.items.slice()) {
    if (it.tr) continue;
    const better = isBag(it) ? !p.eq?.[bagOf(it).slot] : ['weapon', 'armor', 'shield'].includes(ITEMS[it.id]?.type) && !p.eq?.[ITEMS[it.id].type];
    if (better && roomFor(sim, p, itemWeight(it))) { r.items.splice(r.items.indexOf(it), 1); p.inv.push(it); p._cd = true; if (isBag(it)) equipBags(p); }
  }
  if (!r.items.length) delete D.rent[p.id];
}

// ---------- 家の蔵 ----------
const HOME_BASE = 80;
function homeCap(sim, hh) {
  const b = hh.house != null ? sim.building(hh.house) : null;
  let cap = HOME_BASE + (b ? b.w * b.d * 8 : 0);
  for (const it of hh.store || []) if (bagOf(it)?.slot === 'home') cap += bagOf(it).cap;
  return cap;
}
const homeLoad = (hh) => (hh.store || []).reduce((s, it) => s + (bagOf(it)?.slot === 'home' ? 0 : it.tr ? 1 : itemWeight(it)), 0);
// 家にいるとき：多すぎる荷を蔵に置き、よい袋や武具があれば取り出す
function tidyAtHome(sim, p, hh, strong = false) {
  const st = carryState(sim, p, true);
  const full = st.slots >= st.maxSlots * (strong ? 0.5 : 0.75) || st.ratio > (strong ? 0.6 : 0.8);
  if (full) {
    const spare = spareItems(sim, p).filter((it) => ITEMS[it.id]?.type !== 'consumable').sort((a, b) => vpk(a) - vpk(b));
    const room = homeCap(sim, hh) - homeLoad(hh);
    let put = 0;
    for (const it of spare) {
      const s2 = carryState(sim, p, true);
      if (s2.slots < s2.maxSlots * 0.55 && s2.ratio < 0.6) break;
      if (put + itemWeight(it) > room) continue;
      removeFromInv(p, it); stashHome(sim, hh, it); put += itemWeight(it);
    }
    // 重い宝は家に置く（家宝）
    for (const t of (p.treasures || []).slice()) if (treasureWeight(t) >= 2 && carryState(sim, p, true).ratio > 0.5) { p.treasures.splice(p.treasures.indexOf(t), 1); stashHome(sim, hh, { id: 'relic', custom: t, value: TREASURE_V, tr: true }); p._cd = true; }
  }
  // 蔵にある袋のほうがよければ身に付ける
  for (const it of (hh.store || []).slice()) {
    const d = bagOf(it);
    if (!d || d.slot === 'home' || (it.dur ?? 1) <= 0) continue;
    const cur = p.eq?.[d.slot];
    if (!cur || (bagOf(cur).cap + bagOf(cur).sl * 2 < d.cap + d.sl * 2)) { hh.store.splice(hh.store.indexOf(it), 1); p.inv.push(it); equipBags(p); if (cur) { removeFromInv(p, cur); stashHome(sim, hh, cur); equipBags(p); } }
  }
}

// ---------- 地面の品を拾う ----------
function pickups(sim) {
  const S = sim.S, C = S.carry;
  if (!C.ground.length) return;
  const n = Math.min(C.ground.length, 250);
  const start = (C._gi || 0) % C.ground.length;
  const take = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % C.ground.length;
    const g = C.ground[i];
    if (S.t - g.t < 30) continue;
    const val = g.tr ? TREASURE_V : itemValue(g.it);
    const w = g.tr ? treasureWeight(g.tr) : itemWeight(g.it);
    for (const q of peopleNear(sim, g.x, g.z, 2)) {
      if (q.deathYear != null || q.fight || q.jail != null || q.inside != null || sim.ageOf(q) < 12 || (q.id === g.by && S.t - g.t < 60 * 12)) continue;
      const poor = spendable(sim, q) < 20;
      if (!(val >= 3 || poor && val >= 1)) continue;
      if (q.bandit == null && q.pers?.C > 0.8 && q.pers?.A > 0.6 && g.by != null && S.people[g.by]?.deathYear == null && sim.rng.chance(0.3)) continue;   // 律儀な人は人の落とし物を拾わない
      if (!roomFor(sim, q, w, !(g.it && ['material', 'consumable'].includes(ITEMS[g.it.id]?.type) && q.inv?.some((x) => x.id === g.it.id)))) continue;
      if (g.tr) (q.treasures = q.treasures || []).push(g.tr);
      else { const d = ITEMS[g.it.id]; const same = d && ['material', 'consumable'].includes(d.type) && q.inv.find((x) => x.id === g.it.id); if (same) same.n = (same.n || 1) + (g.it.n || 1); else q.inv.push(g.it); if (isBag(g.it)) equipBags(q); }
      q._cd = true;
      C.stats.picked++;
      if (val >= 5) sim.remember(q, `道に落ちていた${g.tr ? `「${g.tr}」` : itemName(g.it)}を拾った`, { emo: 0.4, imp: val >= 40 ? 0.5 : 0.25, k: 'carry' });
      if (g.tr) sim.pushLog(`${q.given}が、落ちていた「${g.tr}」を拾った。`, 'event', [q.id], { x: g.x, z: g.z });
      take.push(g);
      break;
    }
  }
  if (take.length) { const set = new Set(take); C.ground = C.ground.filter((g) => !set.has(g)); }
  C._gi = start + n;
}
const ORGANIC = new Set(['herb', 'jelly', 'hide', 'leather', 'feather', 'bone', 'bandage', 'silk', 'hemp', 'flax', 'willow', 'straw', 'rope_fiber', 'hempcloth', 'linen', 'potion', 'antidote', 'clothes', 'robe']);
function groundDaily(sim) {
  const S = sim.S, C = S.carry;
  // 野ざらしの草や皮や布は、半月ほどで朽ちる（記録に残す）
  const keep = [];
  for (const g of C.ground) {
    if (g.it && ORGANIC.has(g.it.id) && S.t - g.t > 60 * 24 * 15) { C.stats.rot++; continue; }
    keep.push(g);
  }
  // 多すぎるときは、いちばん古くて安い物から朽ちたことにする（めったに起きない）
  if (keep.length > 900) { keep.sort((a, b) => (a.tr ? 999 : itemValue(a.it)) - (b.tr ? 999 : itemValue(b.it)) || a.t - b.t); C.stats.rot += keep.length - 900; keep.splice(0, keep.length - 900); }
  C.ground = keep;
}

// ---------- 市場で買う（今の本体の買い方。経済部の marketBuy ができたら置き換える） ----------
export function buyBag(sim, p, g) {
  const S = sim.S, m = S.towns[p.s];
  if (!m || !BAGS[g] || !(m.stock[g] >= 1)) return false;
  const price = m.price[g];
  if (spendable(sim, p) < price + 5) return false;
  if (marketBuy(sim, p.s, g, 1, personPayer(sim, p), { whole: true, who: p.given }) < 1) return false;   // 買い手の財布（足りなければ家計）→ 品の持ち主
  const it = makeItem(g, sim.rng.range(0.9, 1.1));
  const old = p.eq?.[BAGS[g].slot];
  (p.inv = p.inv || []).push(it); equipBags(p);
  const hh = homeHere(sim, p) || sim.hh(p);
  if (old && old !== p.eq[BAGS[g].slot] && hh && hh.house != null && BAGS[g].slot !== 'beast') { removeFromInv(p, old); stashHome(sim, hh, old); }
  S.carry.stats.bought++; S.carry.stats.boughtSpent += price;
  S.carry.stats.byGood[g] = (S.carry.stats.byGood[g] || 0) + 1;
  sim.remember(p, `市場で${BAGS[g].name}を${Math.round(price)}銅貨で買った`, { emo: 0.3, imp: 0.25, k: 'carry' });
  return true;
}
// 家の入れ物（樽・木箱）は家計で買って蔵に置く
function buyHomeBox(sim, p, g) {
  const S = sim.S, m = S.towns[p.s], hh = sim.hh(p);
  if (!hh || hh.house == null || !(m.stock[g] >= 1)) return false;
  const price = m.price[g];
  if (hh.money < price + 30) return false;
  if (marketBuy(sim, p.s, g, 1, hh, { whole: true }) < 1) return false;   // 家計 → 品の持ち主
  stashHome(sim, hh, makeItem(g));
  S.carry.stats.bought++; S.carry.stats.boughtSpent += price; S.carry.stats.byGood[g] = (S.carry.stats.byGood[g] || 0) + 1;
  return true;
}
// いま一番ほしい袋（なければ null）
function wantedBag(sim, p) {
  const eq = p.eq || {}, j = p.job;
  const m = sim.S.towns[p.s];
  if (!m) return null;
  const has = (s) => !!eq[s];
  const hasJobBag = SLOTS.some((s) => (bagOf(eq[s])?.jobs || []).includes(j));
  const opts = [];
  const push = (ids, score) => { for (const id of ids) if (m.stock[id] >= 1) { opts.push({ id, score }); return; } };
  if (NEEDS_BAG[j] && !hasJobBag) push((JOB_BAGS[j] || []).filter((id) => BAGS[id]?.market), 3.5);
  if (isAdventurer(p) && !has('back')) push(['adventurersack', 'travelerpack', 'hempbackpack'], p.quest ? 5 : 3.5);
  if (isAdventurer(p) && has('back') && p.carryWish?.why === 'treasure' && bagOf(eq.back).cap < 24) push(['bearpack', 'wolfpack', 'porterpack', 'travelerpack'].filter((id) => bagOf(eq.back).cap < BAGS[id]?.cap), 3);
  if (['merchant', 'peddler'].includes(j)) {
    if (!has('back')) push(j === 'peddler' ? ['peddlerbox', 'travelerpack'] : ['travelerpack', 'peddlerbox'], 3);
    if (!has('beast') && spendable(sim, p) > 200) push(['packhorse', 'donkey'], 2.5);
    if (has('beast') && !has('beastbag') && spendable(sim, p) > 60) push(['panniers', 'saddlebags'], 2);
    if (has('beast') && !has('cart') && spendable(sim, p) > 160) push(['cart', 'handcart'], 2);
  }
  if (['soldier', 'knight', 'wanderer', 'messenger', 'pilgrim'].includes(j) && !has('back')) push(['soldierpack', 'travelerpack', 'hempbackpack'], 1.5);
  if (sim.isAdult(p) && !has('belt') && spendable(sim, p) > 40) push(['leatherpouch', 'coinpurse'], 1.2);
  if (p.carryWish?.why === 'bag' && !has('back')) push(['travelerpack', 'hempbackpack', 'backbasket'], 3);
  if (!opts.length) return null;
  const best = opts.sort((a, b) => b.score - a.score)[0];
  if (spendable(sim, p) < m.price[best.id] + 8) return null;
  return best;
}

// ---------- 行動の候補（sim.decide から） ----------
export function carryDecide(sim, p, add) {
  if (!sim.S.carry || p.jail != null || p.fight || !sim.isAdult(p) || p.porterFor) return;
  const h = sim.hour(), S = sim.S;
  if (S.towns[p.s]?.occupied) return;
  if (h >= 8 && h < 18 && (p._cbuy || 0) < S.t) {
    p._cbuy = S.t + 180;   // 3時間に1度だけ考える
    const w = wantedBag(sim, p);
    if (w) { p._wantBag = w.id; add(w.score, 'buybag', sim.placeFor(p, 'market'), 15); }
  }
  const st = carryState(sim, p);
  // 荷がいっぱい：家（なければ町の倉庫）へ置きに戻る
  if ((st.slots >= st.maxSlots - 1 || st.ratio > 0.85) && !(p.action?.type === 'quest')) {
    const hh = sim.hh(p);
    if (hh && hh.house != null && sim.building(hh.house)) add(3 + (st.over ? 3 : 0), 'stash', sim.placeFor(p, 'home'), 10);
    else {
      const { b } = depotOwner(sim, p.s);
      if (b && spendable(sim, p) > 6) add(2.5, 'depot', { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id }, 10);
    }
  }
  // もっと運べるように力を鍛えたい（宝を持ち帰りたい・荷を多く運んで稼ぎたい）
  const why = p.carryWish && sim.today < p.carryWish.until ? p.carryWish.why : p.job === 'porter' ? 'earn' : null;
  if (why && h >= 7 && h < 18 && (p.carryFit || 0) < 3 && sim.ageOf(p) < 55) {
    add(1.5 + p.values.ambition * 2 + (why === 'treasure' ? 1 : 0), 'haultrain', sim.placeFor(p, 'plaza'), sim.rng.int(60, 120));
  }
}
export function carryArrive(sim, p) {
  const a = p.action;
  if (!a || !sim.S.carry) return;
  switch (a.type) {
    case 'buybag': {
      const g = p._wantBag; p._wantBag = null;
      if (g) buyBag(sim, p, g);
      a.until = sim.S.t + 10;
      break;
    }
    case 'stash': { const hh = homeHere(sim, p); if (hh) tidyAtHome(sim, p, hh, true); a.until = sim.S.t + 10; break; }
    case 'depot': {
      const spare = spareItems(sim, p).filter((it) => ITEMS[it.id]?.type !== 'consumable').sort((x, y) => vpk(x) - vpk(y));
      const put = [];
      for (const it of spare) { const st = carryState(sim, p, true); if (st.slots < st.maxSlots * 0.6 && st.ratio < 0.6) break; removeFromInv(p, it); put.push(it); }
      if (put.length) {
        if (depositDepot(sim, p, put)) sim.remember(p, `町の倉庫を借りて、${put.slice(0, 3).map(itemName).join('・')}を預けた`, { emo: 0.1, imp: 0.25, k: 'carry' });
        else { for (const it of put) p.inv.push(it); p._cd = true; }
      }
      takeFromDepot(sim, p);
      a.until = sim.S.t + 10;
      break;
    }
  }
}

// ---------- 職人の仕事と、畑・森・牧場の素材（sim.doWork から）。職人の仕事をしたら true ----------
export function carryWork(sim, p, dt, eff) {
  const S = sim.S;
  if (!S.carry) return false;
  const m = S.towns[p.s], hh = sim.hh(p);
  if (!m || !hh) return false;
  const R = sim.rng;
  // 素材（おまけで出る物も、市場が買い取る）
  const gat = (g, n) => { if (n > 0 && m.stock[g] < GOODS[g].target * 2.5) sim.sell(p, g, n); };
  const si = sim.seasonIdx();
  switch (p.job) {
    case 'rancher': if (R.chance(0.0004 * dt)) gat(R.chance(0.6) ? 'donkey' : 'packhorse', 1); break;   // 荷を運ぶロバと荷馬を育てる（麻・藁・柳などの素材は matter.js が採る）
    case 'porter': {
      // 町での荷揚げ：商人に雇われて荷を運ぶ（日当は商人の家計から）
      const hr = dt / 60;
      p.carryFit = Math.min(3, (p.carryFit || 0) + 0.004 * hr);
      const boss = merchantOf(sim, p.s);
      if (boss) { p._haul = (p._haul || 0) + 0.6 * hr * (0.7 + carryPower(sim, p) / 16) * carryWorkMul(p); p._haulBy = boss.id; }   // 日当は一日の終わりに商人から（carryDaily）
      return true;
    }
  }
  const recs = CRAFT[p.job];
  if (!recs) return false;
  const side = SIDE[p.job];
  if (side) { const hk = Math.floor(S.t / 60); if (p._cwh !== hk) { p._cwh = hk; p._cws = R.chance(side); } if (!p._cws) return false; }
  let c = p.cw;
  if (!c) {
    if ((p._cwWait || 0) > S.t) return !side;
    const best = pickRecipe(sim, m, recs, p.s, hh);
    if (!best) { p._cwWait = S.t + 60; return !side; }
    c = p.cw = { r: recs.indexOf(best), prog: 0 };
  }
  const r = recs[c.r];
  if (!r) { p.cw = null; return !side; }
  c.prog += eff;
  if (c.prog < r.h) return true;
  p.cw = null;
  // 仕上げ：材料を買って（家計→市場の金庫・町の蓄え）、品を市場に売る（市場の金庫→家計）
  const cost = inputCost(sim, m, r, p.s);
  if (cost == null || hh.money < cost) return true;
  for (const [g, n] of Object.entries(r.inp)) { const own = Math.min(n, hh.stock?.[g] || 0); if (own > 0) hh.stock[g] -= own; if (n - own > 1e-9 && marketBuy(sim, p.s, g, n - own, hh) < n - own - 1e-6) return true; }   // 家の蔵にあればそれを使い、足りない分を市場で買う
  if (r.mats) { const town = S.towns[p.s]; for (const [id, n] of Object.entries(r.mats)) { const pr = n * ITEMS[id].value * 0.8; town.mats[id] -= n; hh.money -= pr; town.fund = (town.fund || 0) + pr; flow(sim, JOBS[p.job]?.name || '職人', '町の蓄え', pr, '魔物素材'); } }
  stash(sim, p, r.out, r.n);   // できた品は家の蔵へ。売るのは市場の仕組み（商人・市の日）
  S.carry.stats.crafted += r.n;
  if (R.chance(0.15)) sim.remember(p, `${GOODS[r.out]?.name || r.out}をこしらえた`, { emo: 0.3, imp: 0.2, k: 'craft' });
  return true;
}
function inputCost(sim, m, r, sid) {
  let cost = 0;
  for (const [g, n] of Object.entries(r.inp)) { if (!(m.stock[g] >= n)) return null; cost += n * m.price[g]; }   // 材料が市場に足りていること
  if (r.mats) { const mats = sim.S.towns[sid].mats || {}; for (const [id, n] of Object.entries(r.mats)) { if (!((mats[id] || 0) >= n)) return null; cost += n * ITEMS[id].value * 0.8; } }
  return cost;
}
function pickRecipe(sim, m, recs, sid, hh) {
  let best = null, bv = 0;
  for (const r of recs) {
    if (m.stock[r.out] > (GOODS[r.out]?.target || 5) * 1.6 || (hh?.stock?.[r.out] || 0) >= (BAGS[r.out] ? 3 : 8)) continue;   // 余っている物・売れ残っている物は作らない
    const cost = inputCost(sim, m, r, sid);
    if (cost == null) continue;
    const v = (r.n * m.price[r.out] * 0.85 - cost) / r.h;
    if (v > 0.4 && v > bv) { bv = v; best = r; }
  }
  return best;
}
function merchantOf(sim, sid) {
  const k = '_cm' + Math.floor(sim.S.t / 60);
  const C = sim._carryM || (sim._carryM = {});
  if (C.k !== k) { C.k = k; C.m = {}; }
  if (C.m[sid] === undefined) {
    const hhs = Object.values(sim.S.households).filter((h) => h.s === sid && h.money > 60 && h.members.some((id) => ['merchant', 'shopkeeper', 'innkeeper'].includes(sim.S.people[id]?.job)));
    C.m[sid] = hhs.sort((a, b) => b.money - a.money)[0] || null;
  }
  return C.m[sid];
}

// ---------- 1時間ごと ----------
export function carryHourly(sim) {
  const S = sim.S;
  ensureCarry(sim);
  const C = S.carry;
  const heavy = [];
  for (const p of sim.living()) {
    const st = carryState(sim, p, true);
    if (st.over || st.ratio > 0.9) heavy.push(p.id);
    const a = p.action;
    // 鍛える：鍛錬・荷を担ぐ鍛錬・力仕事・重い荷を担いで歩く
    if (a && a.phase === 'do' && (a.type === 'train' || a.type === 'haultrain')) { p.carryFit = Math.min(3, (p.carryFit || 0) + (a.type === 'haultrain' ? 0.05 : 0.02)); p._cfDay = sim.today; C.stats.trained++; }
    else if (a && a.type === 'work' && a.phase === 'do' && LABOR.has(p.job)) { p.carryFit = Math.min(3, (p.carryFit || 0) + 0.004); p._cfDay = sim.today; }
    else if (a && a.phase === 'walk' && st.ratio > 0.7) { p.carryFit = Math.min(3, (p.carryFit || 0) + 0.01); p._cfDay = sim.today; }
    if (p.porterFor) { p.carryFit = Math.min(3, (p.carryFit || 0) + 0.006); p._cfDay = sim.today; }
    // 家（宿）に着いたら、採った物を蔵へ移す
    if (p.inside != null) { const lh = lodgingOf(sim, p); if (lh) unloadMatter(sim, p, lh); }
    // 家にいれば荷を片づける
    if (p.inside != null) { const hh = homeHere(sim, p); if (hh && (st.slots > st.maxSlots * 0.75 || st.ratio > 0.8 || (hh.store || []).some((it) => isBag(it) && bagOf(it).slot !== 'home' && !p.eq?.[bagOf(it).slot]))) tidyAtHome(sim, p, hh); }
  }
  C.heavy = heavy;
  hirePorters(sim);
  endHires(sim);
  pickups(sim);
}

// ---------- 1日ごと ----------
export function carryDaily(sim) {
  const S = sim.S, R = sim.rng;
  ensureCarry(sim);
  const C = S.carry;
  recruit(sim);
  // 町での荷揚げの日当：一日の終わりに、雇った商人の家計から荷運びへ
  for (const p of sim.living()) {
    if (!(p._haul > 0)) continue;
    const boss = S.households[p._haulBy];
    const fee = boss ? Math.max(0, Math.min(p._haul, boss.money - 20)) : 0;
    if (fee > 0) { boss.money -= fee; earn(sim, p, fee, 0.6); flow(sim, '市場の商人', '荷運び', fee, '荷揚げの日当'); C.stats.wages += fee; }
    p._haul = 0;
  }
  for (const p of sim.living()) {
    // 使った袋やかごは傷み、やがて壊れる
    const eq = p.eq || {};
    for (const s of SLOTS) {
      const it = eq[s], d = bagOf(it);
      if (!d || s === 'beast') continue;
      const used = p.workedToday > 0 || p.action?.type === 'quest' || p.mission;
      if (!used) continue;
      it.dur = (it.dur ?? 1) - (1 / d.life) * R.range(0.6, 1.4);
      if (it.dur <= 0) {
        removeFromInv(p, it); C.stats.broken++;
        sim.remember(p, `使い込んだ${d.name}が、とうとう壊れてしまった`, { emo: -0.2, imp: 0.25, k: 'carry' });
        equipBags(p);
      }
    }
    // 荷獣の餌代：藁を市場で買う（持ち主の家計→市場の金庫）
    if (eq.beast) feedBeast(sim, p, eq.beast);
    // 鍛えなければ少しずつ落ちる
    if ((p.carryFit || 0) > 0 && p._cfDay !== sim.today) p.carryFit = Math.max(0, p.carryFit - 0.01);
    // 雇いが切れたのに、荷運びの荷が残っている
    if (p.held?.length && !p.porterFor) handOver(sim, p, null);
  }
  // 亡くなった荷運びが預かっていた荷はその場に
  for (const id of S.graves.slice(-30)) { const d = S.people[id]; if (d?.held?.length) { for (const h of d.held) ground(sim, d, d.pos?.x ?? 0, d.pos?.z ?? 0, h); d.held = []; } }
  depotDaily(sim);
  groundDaily(sim);
  // 樽と木箱：漁師・酒造り・宿屋の家は樽を、物の多い家は木箱を買う
  for (const p of sim.living()) {
    if (!R.chance(0.03) || !sim.isAdult(p)) continue;
    const hh = sim.hh(p);
    if (!hh || hh.house == null) continue;
    const has = (id) => (hh.store || []).some((x) => x.id === id);
    if (['fisher', 'brewer', 'innkeeper', 'butcher'].includes(p.job) && !has('barrel')) buyHomeBox(sim, p, 'barrel');
    else if (homeLoad(hh) > homeCap(sim, hh) * 0.7 && !has('crate')) buyHomeBox(sim, p, 'crate');
  }
  ensureTownGoods(sim, false);
}
function feedBeast(sim, p, it) {
  const S = sim.S, m = S.towns[p.s], d = bagOf(it);
  const hh = sim.hh(p);
  if (!m || !d?.feed) return;
  const need = Math.min(4, d.feed / Math.max(0.2, m.price.straw || 0.3));   // 藁を何束
  if ((hh?.stock?.straw || 0) >= need) { hh.stock.straw -= need; it.hungry = 0; return; }       // 自分の家の藁
  const cost = need * (m.price.straw || 0.3);
  if (m.stock.straw >= need && spendable(sim, p) >= cost && marketBuy(sim, p.s, 'straw', need, personPayer(sim, p), { who: p.given }) >= need - 1e-6) {
    S.carry.stats.fed += cost; it.hungry = 0;
    return;
  }
  // 牧場の草で食べさせる（お金は動かない）。村なら困らない
  if (sim.town(p.s)?.type === 'village') return;
  it.hungry = (it.hungry || 0) + 1;
  if (it.hungry >= 5) {
    // 養えない：市場（馬喰）に売る（市場の金庫→持ち主）
    removeFromInv(p, it); equipBags(p);
    if (hh) stash(sim, p, it.id, 1);   // 家の蔵に移し、市場の仕組みで売る
    sim.remember(p, `餌代が払えず、${d.name}を手放すことにした`, { emo: -0.5, imp: 0.45, k: 'carry' });
  }
}
// 町に足りない職人と荷運びを、手の空いている人から募る
function recruit(sim) {
  const S = sim.S, R = sim.rng;
  const cnt = {};
  for (const p of sim.living()) { if (!p.job) continue; const c = cnt[p.s] || (cnt[p.s] = {}); c[p.job] = (c[p.job] || 0) + 1; }
  for (const s of S.world.settlements) {
    if (!['capital', 'port', 'village'].includes(s.type) || S.towns[s.id]?.occupied || s.tribe != null || s.tribal || s.indep || s.frontier) continue;   // 里・独立村・開拓村は、それぞれの決まりで仕事が決まる   // 開拓村は畑づくりが先
    for (const [job, want] of Object.entries(WANT_JOBS)) {
      const n = want[s.type] || 0;
      if ((cnt[s.id]?.[job] || 0) >= n) continue;
      if (!R.chance(0.35)) continue;
      const pool = sim.living().filter((p) => p.s === s.id && p.tribe == null && p.jail == null && !p.porterFor && !p.shop && !p.retired && p.hideout == null && !p.bandit && !p.expProj && !p.expPrevJob && sim.ageOf(p) >= 17 && sim.ageOf(p) <= 50 && (p.plan?.stage !== 'saving')
        && (!p.job || FROM_JOBS.includes(p.job) && (cnt[s.id]?.[p.job] || 0) >= (p.job === 'farmer' ? 5 : p.job === 'beggar' || p.job === 'wanderer' ? 1 : 3)));
      if (!pool.length) continue;
      const pick = pool.sort((a, b) => (job === 'porter' ? carryPower(sim, b) - carryPower(sim, a) : (b.pers?.C || 0) - (a.pers?.C || 0)))[0];
      const from = pick.job;
      if (from) { pick.formerJob = from; cnt[s.id][from]--; }
      pick.job = job;
      pick.skill = pick.skill || {}; pick.skill[job] = Math.max(pick.skill[job] || 0, 0.3);
      cnt[s.id] = cnt[s.id] || {}; cnt[s.id][job] = (cnt[s.id][job] || 0) + 1;
      S.carry.stats.recruited++;
      sim.remember(pick, `${JOBS[from]?.name ? JOBS[from].name + 'をやめて、' : ''}${JOBS[job].name}として働きはじめた`, { emo: 0.3, imp: 0.5, k: 'career' });
      sim.pushLog(`${s.name}の${pick.given}が${JOBS[job].name}になった。`, 'event', [pick.id], pick.pos);
    }
  }
}

// ---------- 画面：人の詳細欄の「持ち物」 ----------
export function carryHtml(sim, p, esc) {
  if (!sim.S.carry || p.deathYear != null) return '';
  const st = carryState(sim, p, true);
  const eq = p.eq || {};
  const worn = new Set([eq.weapon, eq.armor, eq.shield, eq.accessory, eq.tool].filter(Boolean));
  const bagSet = new Set(SLOTS.map((s) => eq[s]).filter(Boolean));
  const kg = (x) => `${r1(x)}kg`;
  const pct = Math.min(100, Math.round(st.ratio * 100));
  const bar = `<div class="bar"><i class="${st.over ? 'low' : st.ratio > 0.85 ? 'mid' : ''}" style="width:${pct}%"></i></div>`;
  const pwTxt = `${r1(st.pw)}（${(p.carryFit || 0) >= 0.05 ? `鍛えて＋${r1(p.carryFit)}` : 'まだ鍛えていない'}）`;
  let h = `<div class="section"><h4>持ち物</h4><dl class="kv">`;
  h += `<dt>重さ</dt><dd>${r1(st.total)} / ${r1(st.cap)}kg${st.over ? '　<b class="up">重すぎて歩けない</b>' : st.ratio > 0.85 ? '　<b>荷が重い</b>' : ''}${bar}</dd>`;
  h += `<dt>枠</dt><dd>${st.slots} / ${st.maxSlots}</dd>`;
  h += `<dt>力</dt><dd>${pwTxt}　素手で${kg(st.pw * 3)}・体の限り${kg(st.body)}${st.beast ? `・荷獣と荷車${kg(st.beast)}` : ''}</dd>`;
  if (p.carryWish && sim.today < p.carryWish.until) h += `<dt>思い</dt><dd>${esc(p.carryWish.why === 'treasure' ? '宝を持ち帰れるよう、力をつけたい' : p.carryWish.why === 'earn' ? '荷を多く運んで稼ぎたい' : 'もっと入る袋がほしい')}</dd>`;
  const bagRows = SLOTS.filter((s) => eq[s]).map((s) => { const it = eq[s], d = bagOf(it); return `${SLOT_NAME[s]}：${esc(d.name)}（${d.slot === 'beast' || d.slot === 'cart' ? `荷${d.cap}kg` : `＋${d.cap}kg・枠＋${d.sl}`}${d.fits && d.fits !== 'なんでも' ? `・${esc(d.fits)}向き` : ''}${d.light ? `・中身が${Math.round((1 - d.light) * 100)}%軽い` : ''}・${esc(d.stuff)}${d.slot === 'beast' ? '' : `・傷み${Math.round((1 - (it.dur ?? 1)) * 100)}%`}）`; });
  h += `<dt>身に付けた袋</dt><dd>${bagRows.join('<br>') || 'なし（手と肩で持つだけ）'}</dd>`;
  const rows = [];
  for (const it of p.inv || []) {
    if (bagSet.has(it)) continue;
    const mark = worn.has(it) ? '<span class="sub">［装備中］</span>' : '';
    rows.push(`<tr><td>${esc(itemName(it).replace(/×\d+$/, ''))}${mark}</td><td style="text-align:right">${it.n || 1}</td><td style="text-align:right">${kg(itemWeight(it))}</td></tr>`);
  }
  for (const t of p.treasures || []) rows.push(`<tr><td>「${esc(t)}」<span class="sub">［宝］</span></td><td style="text-align:right">1</td><td style="text-align:right">${kg(treasureWeight(t))}</td></tr>`);
  for (const hd of p.held || []) rows.push(`<tr><td>${hd.tr ? `「${esc(hd.tr)}」` : esc(itemName(hd.it))}<span class="sub">［雇い主の荷］</span></td><td style="text-align:right">${hd.it?.n || 1}</td><td style="text-align:right">${kg(heldWeight(hd))}</td></tr>`);
  h += `</dl><table class="carry" style="width:100%;font-size:12px;border-collapse:collapse;margin-top:4px"><tr><th style="text-align:left">品</th><th style="text-align:right">数</th><th style="text-align:right">重さ</th></tr>${rows.join('') || '<tr><td colspan="3">なし</td></tr>'}</table><dl class="kv" style="margin-top:6px">`;
  if (p.hire?.porter != null && sim.S.people[p.hire.porter]) h += `<dt>荷運び</dt><dd>${esc(sim.S.people[p.hire.porter].given)}を雇っている</dd>`;
  if (p.porterFor) { const b = sim.S.people[p.porterFor.by]; h += `<dt>雇われ</dt><dd>${esc(b?.given || '')}の荷運び（日当${DAY_WAGE}銅貨）</dd>`; }
  const hh = sim.hh(p);
  if (hh) {
    const store = hh.store || [];
    const list = store.map((it) => (it.tr ? `「${esc(it.custom)}」` : esc(itemName(it)))).slice(0, 14);
    h += `<dt>家の蔵</dt><dd>食糧 ${Math.floor(hh.food || 0)}食分${store.length ? `<br>${list.join('、')}${store.length > 14 ? ` ほか${store.length - 14}品` : ''}` : ''}${hh.house != null ? `<br><span class="sub">置ける重さ ${Math.round(homeLoad(hh))} / ${Math.round(homeCap(sim, hh))}kg</span>` : ''}</dd>`;
  }
  const D = sim.S.carry.depots[p.depot ?? p.s];
  const r = D?.rent[p.id];
  if (r) h += `<dt>預けた倉庫</dt><dd>${esc(sim.town(p.depot ?? p.s)?.name || '')}の倉庫：${r.items.map((it) => (it.tr ? `「${esc(it.custom)}」` : esc(itemName(it)))).join('、')}<br><span class="sub">倉庫代は${RENT_DAYS}日ごとに${rentFee(r.items)}銅貨（${Math.max(0, r.paid - sim.today)}日分払ってある）</span></dd>`;
  h += `</dl></div>`;
  return h;
}
// 頭の上の印（ui.updateOverlay から）
export function carryMarks(ui) {
  const sim = ui.sim, C = sim.S?.carry;
  if (!C || typeof document === 'undefined') return;
  const box = document.getElementById('bubbles');
  if (!box) return;
  const M = ui._cmarks || (ui._cmarks = new Map());
  const want = new Set();
  if (ui.r.camera.zoom >= 0.9) {
    for (const id of C.heavy) {
      if (want.size >= 40) break;
      const p = sim.S.people[id];
      if (!p || p.deathYear != null || p.inside != null || !p.pos) continue;
      const s = ui.r.project(ui.r.spriteTop(p));
      if (!s.visible) continue;
      want.add(id);
      let el = M.get(id);
      if (!el) { el = document.createElement('div'); el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font-size:11px;line-height:14px;color:#fff;background:rgba(150,70,25,.88);border:1px solid rgba(255,220,160,.6);padding:0 4px;border-radius:3px;pointer-events:none;white-space:nowrap;'; box.appendChild(el); M.set(id, el); }
      const st = p._cl;
      el.textContent = p._heavy != null || st?.over ? '重くて動けない' : '荷が重い';
      el.style.left = `${s.x}px`; el.style.top = `${s.y + 14}px`;   // 頭の少し下（吹き出しや名札と重ならない）
    }
  }
  for (const [id, el] of M) if (!want.has(id)) { el.remove(); M.delete(id); }
}

// 行動の名前（ui.js）
export const CARRY_LABEL = { buybag: '市場で袋やかごを選んでいる', stash: '家に荷を置いている', depot: '倉庫に荷を預けている', porter: '雇い主の荷を預かって待っている', haultrain: '重い荷を担いで足腰を鍛えている' };
export const CARRY_GO = { buybag: '市場へ袋を買いに向かっている', stash: '荷を置きに家へ戻っている', depot: '倉庫へ荷を預けに向かっている', porter: '雇い主の荷を担いで歩いている', haultrain: '荷を担ぐ鍛錬に向かっている' };
export const CARRY_PREF = { buybag: '袋選び', haultrain: '荷担ぎの鍛錬', porter: '荷運び' };

// 試験・点検用の集計
export function carryReport(sim) {
  const S = sim.S, C = S.carry;
  if (!C) return null;
  const L = sim.living().filter((p) => sim.isAdult(p));
  const st = L.map((p) => carryState(sim, p, true));
  const avg = (f) => Math.round(st.reduce((s, x) => s + f(x), 0) / Math.max(1, st.length) * 10) / 10;
  const jobs = {};
  for (const p of sim.living()) if (NEW_JOBS[p.job]) jobs[p.job] = (jobs[p.job] || 0) + 1;
  return { stats: C.stats, ground: C.ground.length, heavy: C.heavy.length, over: st.filter((x) => x.over).length, avgKg: avg((x) => x.total), avgCap: avg((x) => x.cap), avgSlots: avg((x) => x.slots), avgMax: avg((x) => x.maxSlots), jobs, withBack: L.filter((p) => p.eq?.back).length, adults: L.length };
}
