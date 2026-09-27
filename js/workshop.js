// 職場の蔵と、仕入れ → 作る → 売る の流れ（経済部）
//
// 社長の指示：パン職人の穀物やパンは、どこに置いてあるのか。職場（工房・店）の蔵に何がどれだけあり、
//   どこから仕入れ、何をいくつ作り、どこで誰に売ったのかを、すべての職場で見えるようにする。
//
// ■ 職場の蔵（b.ws）
//   パン工房・鍛冶場・工房・仕立て屋・薬屋・よろず屋・酒場・宿屋・湯屋・粉ひき小屋・坑道に「蔵」を持たせる。
//   蔵の中身は、持ち主の世帯ごとに分けて持つ：b.ws.st[世帯id] = { 品: 数 }（店は店主＝shops.js の b.shop.tenant の世帯）。
//     材料：その職場の仕事で使う品（パン工房なら小麦粉・麦・薪）
//     できた品：その職場で作った品（パン工房ならパン）
//   店先の棚に並べた品は、町の市場の在庫そのもの（持ち主＝店主、札 c:3。market.js の marketDeliver({shop:true})）。
//   だから、店先の品は市場に並ぶ品として数えられ、客が買うと代金は店主へ入る（marketBuy）。
//   家の蔵（hh.stock）は、家族の食べ物と私物だけ。職人は、家族の食べる分だけを職場から持ち帰る（自分の品なのでお金は動かない）。
//
// ■ 職人の流れ
//   1. 仕入れ：材料を市場で持ち主（農夫・粉屋・商人・鉱夫…）から買い、職場の蔵へ（marketBuy：職人の家計 → 品の持ち主）
//      パン工房は、粉ひき小屋の小麦粉があれば粉を買う。なければ麦を買って粉ひき小屋でひいてもらう（麦の16分の1を粉屋へ：millToll）
//   2. 作る：職場の蔵の材料を使って作り、できた品を職場の蔵に置く（お金は動かない）
//   3. 売る：店先の棚に並べる（町の市場の品になる）。棚に入りきらない分は、市場へ行ったときに商人へ卸す（marketDeliver）
//      酒場の麦酒・薬屋の薬は、店の中で客に出す分を蔵に残す（wsTake）
//   お金は取り引きでしか動かない。この仕組みは新しいお金の置き場所を作らない（帳簿 ledger.js はそのまま）。
//
// ■ 記録：職場ごとに今日と昨日の 仕入れ（誰から・いくつ・いくら）・作った数・売った数（誰へ・いくつ・いくら・どこで）
//          町ごとに 品ごとの売り手と買い手の数（「暮らし」欄の流れの図）
//
// ■ 本体からの呼び方（部長がつなぐ。つなぎ方は scratchpad の patch_workshop.py）
//   workshopWork(sim, p, dt, eff) … doWork の switch の前。職場を持つパン職人・大工・仕立て屋・宿屋の主人・鍛冶屋は true を返す（元の処理はしない）
//   wsOwnsWork(sim, p)            … genericWork の J.goods の前（職場で作る人は、元の「家の蔵へ作る」をしない）
//   workshopHourly(sim) / workshopDaily(sim) … newHour・newDay
//   wsHave / wsTake               … 宿の食事・酒場の麦酒・薬屋の薬・救貧院のパン（店の中で客に出す分）
//   wsGearSold(sim, p, it, price) … buyGear（鍛冶場の武具が売れた）
//   wsBuildingHTML / wsTownFlowHTML / wsPersonHTML … 画面（ui.js）
//   wsDisplay(sim, b)             … 建物の中の棚の絵（shelfgfx.js）
import { GOODS, JOBS } from './data.js';
import { ITEMS, itemName } from './items.js';
import { MARKET_HOOK, marketBuy, marketDeliver, guildOf, isGuildMember } from './market.js';
import { millToll } from './shops.js';
import { MAT, matterGood, MATTER_HOOK, matterRecipes } from './matter.js';
import { whoLabel } from './ledger.js';

const gd = (g) => GOODS[g] || matterGood(g);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const r1 = (v) => Math.round(v * 10) / 10;
const alive = (p) => p && p.deathYear == null;

// ---------- 職場の種類 ----------
// jobs：そこで働く職業　label：呼び名　keep：店の中で客に出すために蔵に残す量　sells：売る場所
export const WP = {
  bakery:     { label: 'パン工房',     jobs: ['baker'], sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す', '家族の食卓（持ち帰り）'] },
  smithy:     { label: '鍛冶場',       jobs: ['smith'], sells: ['鍛冶場の店先（武具と道具は客に直接）', '小物は店先の棚（町の市場）'] },
  workshop:   { label: '職人の工房',   jobs: ['carpenter', 'tailor', 'cobbler', 'potter', 'weaver', 'jeweler', 'shipwright'], sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す'] },
  tailorshop: { label: '仕立て屋',     jobs: ['tailor', 'weaver'], sells: ['店先の棚（町の市場に並ぶ）', '市場の商人へ卸す'] },
  apothecary: { label: '薬屋',         jobs: ['herbalist', 'alchemist'], keep: { medicine: 3 }, sells: ['店の中で客に出す（診立てと薬）', '店先の棚（町の市場）'] },
  genstore:   { label: 'よろず屋',     jobs: ['shopkeeper', 'merchant'], merchant: true, sells: ['店先の棚（作り手から買い取った品）'] },
  tavern:     { label: '酒場・宿',     jobs: ['innkeeper'], keep: { ale: 12, bread: 4, meat: 3, fish: 3 }, sells: ['店の中で客に出す（麦酒と料理）', 'あまった麦酒は店先の棚（町の市場）'] },
  inn:        { label: '宿屋',         jobs: ['hostkeeper', 'innkeeper'], keep: { ale: 12, bread: 4, meat: 3, fish: 3 }, sells: ['店の中で客に出す（麦酒と料理）', 'あまった麦酒は店先の棚（町の市場）'] },
  bathhouse:  { label: '湯屋',         jobs: ['bathkeeper'], sells: ['湯（客の代金はその場で）'] },
  mill:       { label: '粉ひき小屋',   jobs: ['miller'], keep: { wheat: 999 }, sells: ['小麦粉は店先の棚（町の市場。パン工房が買う）', 'あまりは市場の商人へ卸す'] },
  mine:       { label: '鉱山の小屋',   jobs: ['miner'], shared: true, sells: ['市場の商人へ卸す（鍛冶屋が買う）'] },
};
export const WS_TYPES = new Set(Object.keys(WP));

// ---------- 作り方（今までの doWork・genericWork と同じ量） ----------
// rate：仕事の手際1あたりにできる数　inp：できた品1つに要る材料　noInp：材料がなくても手持ちの端切れで作れる割合
// stopM：町の市場にこれだけあれば作らない（目安の何倍）　back：職場の蔵にこれだけたまれば作らない
const PROD = {
  baker:      { out: 'bread', rate: 1.6875, inp: { flour_wheat: 1 / 1.8 }, fuel: 0.03, stopM: 1.6, back: 12 },
  carpenter:  { out: 'furniture', rate: 0.1, inp: { wood: 10 }, stopM: 2, back: 3 },
  shipwright: { out: 'furniture', rate: 0.08, inp: { wood: 3.75 }, stopM: 2, back: 4 },
  tailor:     { out: 'cloth', rate: 0.25, inp: { wool: 1.2 }, noInp: 0.4, back: 8 },
  weaver:     { out: 'cloth', rate: 0.25, inp: { wool: 1.2 }, noInp: 0.4, stopM: 2, back: 10 },
  innkeeper:  { out: 'ale', rate: 2.4, inp: { wheat: 1 / 3 }, back: 20 },
  herbalist:  { out: 'medicine', rate: 0.12, inp: { herbs: 0.5 / 0.12 }, stopM: 2, back: 6 },
  alchemist:  { out: 'medicine', rate: 0.12, inp: { herbs: 0.5 / 0.12 }, stopM: 2, back: 6 },
  jeweler:    { out: 'jewelry', rate: 0.03, inp: { gem: 1 }, stopM: 2, back: 3 },
  cobbler:    { out: 'shoes', rate: 0.15, inp: {}, stopM: 2, back: 6 },
  potter:     { out: 'pottery', rate: 0.3, inp: {}, stopM: 2, back: 8 },
  miller:     { out: 'flour_wheat', rate: 4, inp: { wheat: 1 }, stopM: 1.5, back: 30, fromStore: true },
};
// 元の doWork の switch で作っていた職業（職場があれば、元の処理の代わりにここで作る）
const TAKEOVER = new Set(['baker', 'carpenter', 'tailor', 'innkeeper', 'smith']);
// 店先の棚に並べられる数
const SHELF_CAP = { bread: 24, ale: 16, flour_wheat: 20, medicine: 6, furniture: 3, cloth: 8, shoes: 6, pottery: 8, jewelry: 3 };
function shelfCap(g) { if (SHELF_CAP[g] != null) return SHELF_CAP[g]; const G = gd(g); return G ? Math.max(2, Math.min(10, Math.round((G.target || 6) * 0.5))) : 2; }
// 物の名前（今の20品・物の一覧・鍛冶の材料）
const MAT_NAME = { iron: '鉄の延べ棒', leather: '革', silk: '絹糸', scale: '竜の鱗', magicstone: '魔石', gem: '宝石', cloth: '布', wood: '材木' };
export function goodName(g) { return gd(g)?.name || MAT_NAME[g] || ITEMS[g]?.name || g; }

// ---------- 状態 ----------
function WSS(sim) {
  const S = sim.S;
  if (!S.ws) S.ws = { v: 1, town: {}, prevTown: {}, d: sim.today };
  if (!S.ws.town) S.ws.town = {};
  if (!S.ws.prevTown) S.ws.prevTown = {};
  return S.ws;
}
export function wsOf(b) {
  if (!b.ws) b.ws = { st: {}, log: null, prev: null };
  if (!b.ws.st) b.ws.st = {};
  return b.ws;
}
function storeOf(b, hid) { const W = wsOf(b); return W.st[hid] || (W.st[hid] = {}); }
function blankLog(d) { return { d, buy: {}, made: {}, sold: {}, shelf: {}, home: {} }; }
function logOf(sim, b) {
  const W = wsOf(b);
  if (!W.log || W.log.d !== sim.today) { if (W.log) W.prev = W.log; W.log = blankLog(sim.today); }
  return W.log;
}
function bump(obj, key, init, n, c) {
  let x = obj[key];
  if (!x) { if (Object.keys(obj).length >= 40) return; x = obj[key] = init; }
  x.n += n; x.c += c;
}
function logBuy(sim, b, g, from, n, c) { if (n > 1e-6) bump(logOf(sim, b).buy, g + '|' + from, { g, from, n: 0, c: 0 }, n, c); }
function logSold(sim, b, g, to, where, n, c) { if (n > 1e-6) bump(logOf(sim, b).sold, g + '|' + to + '|' + where, { g, to, where, n: 0, c: 0 }, n, c); }
function logMade(sim, b, g, n, sid) {
  if (!(n > 1e-6)) return;
  const L = logOf(sim, b); L.made[g] = (L.made[g] || 0) + n;
  if (!TRACK.has(g)) return;
  const T = townDay(sim, sid ?? b.settlement); const x = T[g] || (T[g] = { made: 0, from: {}, to: {} }); x.made += n;
}
function logKey(sim, b, k, g, n) { if (n > 1e-6) { const L = logOf(sim, b); L[k][g] = (L[k][g] || 0) + n; } }

// 町ごとの品の流れ（売り手の種類 → 買い手の種類）
function townDay(sim, sid) {
  const W = WSS(sim);
  if (W.d !== sim.today) { W.prevTown = W.town; W.town = {}; W.d = sim.today; }
  return W.town[sid] || (W.town[sid] = {});
}
const TRACK = new Set(['wheat', 'flour_wheat', 'bread', 'ore', 'gear', 'ale', 'wool', 'cloth', 'herbs', 'medicine', 'wood', 'furniture']);
function tally(sim, sid, g, from, to, n) {
  if (!(n > 1e-6) || sid == null || !TRACK.has(g)) return;
  const T = townDay(sim, sid);
  const x = T[g] || (T[g] = { made: 0, from: {}, to: {} });
  x.from[from] = (x.from[from] || 0) + n; x.to[to] = (x.to[to] || 0) + n;
}

// ---------- 職場を探す（1時間ごとに作り直す） ----------
const cache = { key: -1, S: null, byHh: new Map(), mines: new Map(), all: [] };
function refresh(sim) {
  const key = Math.floor(sim.S.t / 60);
  if (cache.key === key && cache.S === sim.S) return cache;
  cache.key = key; cache.S = sim.S; cache.byHh = new Map(); cache.mines = new Map(); cache.all = [];
  for (const b of sim.S.world.buildings) {
    if (!b || !WP[b.type]) continue;
    if (b.type === 'mine') {
      const s = b.settlement ?? sim.S.world.settlements.find((q) => q.buildings.includes(b.id))?.id;
      if (s != null && !cache.mines.has(s)) cache.mines.set(s, b);
      cache.all.push(b);
      continue;
    }
    if (b.shop?.tenant != null) { cache.byHh.set(b.shop.tenant, b); cache.all.push(b); }
    else if (b.ws) cache.all.push(b);
  }
  return cache;
}
export function wsInvalidate() { cache.key = -1; }
// 店を借りている世帯の職場
export function shopOfHh(sim, hid) { return hid == null ? null : refresh(sim).byHh.get(hid) || null; }
// この人の働く職場（なければ null：自分の家で作る）
export function workplaceOf(sim, p) {
  if (!p || !p.job || p.hh == null) return null;
  const C = refresh(sim);
  const b = C.byHh.get(p.hh);
  if (b && WP[b.type].jobs.includes(p.job)) return b;
  if (p.job === 'miner') return C.mines.get(p.s) || null;
  return null;
}
function townOfB(sim, b) { return b.settlement ?? sim.S.world.settlements.find((s) => s.buildings.includes(b.id))?.id; }
// 職場で作る人か（genericWork の J.goods の代わり）
export function wsOwnsWork(sim, p) { return !!PROD[p.job] && !!workplaceOf(sim, p) && p.job !== 'miller'; }

// 職場の蔵を「世帯のように」見せる入れ物（matter.js の作る仕組み・marketBuy の払い手にそのまま渡せる）
// お金は本当の家計から出る。品は職場の蔵に入る
const pseudoCache = new Map();
function pseudoHh(sim, b, hh) {
  const k = b.id + ':' + hh.id;
  let x = pseudoCache.get(k);
  const st = storeOf(b, hh.id);
  if (!x || x.__hh !== hh || x.stock !== st) {
    x = { __b: b, __hh: hh, id: hh.id, s: hh.s, members: hh.members, stock: st,
      get money() { return this.__hh.money; }, set money(v) { this.__hh.money = v; } };
    pseudoCache.set(k, x);
  }
  x.members = hh.members;
  return x;
}

// ---------- 分類：材料か、できた品か ----------
const ioCache = new Map();
function ioOf(type) {
  let x = ioCache.get(type);
  if (x) return x;
  const inp = new Set(), out = new Set();
  const R = matterRecipes();
  for (const j of WP[type]?.jobs || []) {
    const P = PROD[j];
    if (P) { out.add(P.out); for (const k of Object.keys(P.inp)) inp.add(k); if (P.fuel) inp.add('wood'); }
    for (const id of R.get(j) || []) { out.add(id); for (const k of Object.keys(MAT.get(id)?.make?.from || {})) inp.add(k); }
  }
  if (type === 'bakery') { inp.add('wheat'); inp.add('flour_wheat'); }
  if (type === 'smithy') { inp.add('ore'); inp.add('wood'); inp.add('cloth'); }
  if (type === 'mill') inp.add('wheat');
  if (type === 'tavern' || type === 'inn') { for (const g of ['bread', 'meat', 'fish']) inp.add(g); }
  if (type === 'mine') { out.add('ore'); out.add('gem'); }
  x = { inp, out };
  ioCache.set(type, x);
  return x;
}
// できた品（売る物）か。作る品で、ほかの品の材料にもなるもの（パン種など）は材料として残す
function isProduct(type, g) {
  const io = ioOf(type);
  if (io.inp.has(g) && !(io.out.has(g) && (PROD_OUT.has(g)))) return false;
  return true;
}
const PROD_OUT = new Set(Object.values(PROD).map((x) => x.out));

// ---------- 市場のつなぎ（market.js から呼ばれる） ----------
const CTX = { b: null, hh: null };
function payerHhId(payer) {
  if (payer == null) return null;
  if (typeof payer === 'number') return payer;
  if (typeof payer === 'object' && payer.members) return payer.id;
  return null;
}
function catOfOwner(sim, o, g) {
  if (typeof o === 'number') {
    const b = shopOfHh(sim, o);
    if (b && WP[b.type]) return WP[b.type].label;
    return whoLabel(sim, o);
  }
  return whoLabel(sim, o);
}
function catOfPayer(sim, payer, name) {
  if (payer && typeof payer === 'object' && payer.__b) return WP[payer.__b.type]?.label || '職場';
  const hid = payerHhId(payer);
  if (hid != null) {
    if (CTX.b && CTX.hh && CTX.hh.id === hid) return WP[CTX.b.type]?.label || '職場';
    const b = shopOfHh(sim, hid);
    if (b && WP[b.type]?.merchant && /買い付け/.test(name || '')) return WP[b.type].label;
    if (b && (b.type === 'tavern' || b.type === 'inn')) return WP[b.type].label;
    const hh = sim.S.households[hid];
    if (hh && hh.members.some((id) => sim.S.people[id]?.job === 'merchant')) return '市場の商人';
    return '家々';
  }
  if (typeof payer === 'string') return payer[0] === 'k' ? '国' : payer[0] === 'a' ? '教会' : '町';
  return name || '町の施設';
}
// marketBuy が終わったとき：parts = [[持ち主, 数, 代金, 札の種類], ...]
function onBuy(sim, sid, g, parts, payer, payerName) {
  if (!parts || !parts.length) return;
  const buyerCat = catOfPayer(sim, payer, payerName);
  // 買い手の職場（仕入れ）
  let bb = null;
  if (payer && typeof payer === 'object' && payer.__b) bb = payer.__b;
  else { const hid = payerHhId(payer); if (hid != null) { if (CTX.b && CTX.hh?.id === hid) bb = CTX.b; else { const b = shopOfHh(sim, hid); if (b && ((WP[b.type]?.merchant && /買い付け/.test(payerName || '')) || ((b.type === 'tavern' || b.type === 'inn') && ioOf(b.type).inp.has(g)))) bb = b; } } }
  for (const [o, n, c, cls] of parts) {
    const sellerCat = catOfOwner(sim, o, g);
    tally(sim, sid, g, sellerCat, buyerCat, n);
    if (bb) logBuy(sim, bb, g, typeof o === 'number' ? `${sellerCat}（${sim.S.households[o]?.name || '―'}）` : sellerCat, n, c);
    // 売り手の職場（店先の棚・よろず屋の品が売れた）
    if (typeof o === 'number' && (cls === 3 || cls === 0)) {
      const sb = shopOfHh(sim, o);
      if (sb && (cls === 3 || WP[sb.type]?.merchant)) logSold(sim, sb, g, buyerCat === '家々' ? `家々（${payerName || '町の人'}）` : buyerCat, cls === 3 ? '店先の棚' : '店の品', n, c);
    }
  }
}
// marketDeliver で商人・村の蔵が買い取ったとき
function onDeliver(sim, sid, g, n, sellerCode, buyerCode, cost) {
  const sellerCat = catOfOwner(sim, sellerCode, g);
  const buyerCat = typeof buyerCode === 'number' ? (shopOfHh(sim, buyerCode) && WP[shopOfHh(sim, buyerCode).type]?.merchant ? WP[shopOfHh(sim, buyerCode).type].label : '市場の商人') : '村の蔵';
  tally(sim, sid, g, sellerCat, buyerCat, n);
  if (typeof buyerCode === 'number') { const b = shopOfHh(sim, buyerCode); if (b && WP[b.type]?.merchant) logBuy(sim, b, g, `${sellerCat}（${sim.S.households[sellerCode]?.name || '―'}）`, n, cost); }
}
// 粉ひき代の麦は、粉ひき小屋の蔵へ（粉屋の世帯の品）
function onToll(sim, millB, miller, toll, payerHh) {
  if (!millB || !miller) return false;
  const st = storeOf(millB, miller.id);
  st.wheat = (st.wheat || 0) + toll;
  logBuy(sim, millB, 'wheat', `粉ひき代（${payerHh ? catOfOwner(sim, payerHh.id) : '町の人'}）`, toll, 0);
  return true;
}
// 坑道で掘った鉱石・宝石は、鉱山の小屋の蔵へ
function onStash(sim, p, g, q) {
  if (!p || p.job !== 'miner' || p.action?.type !== 'work') return false;
  const b = workplaceOf(sim, p); if (!b) return false;
  const hh = sim.hh(p); if (!hh) return false;
  const st = storeOf(b, hh.id); st[g] = (st[g] || 0) + q;
  logMade(sim, b, g, q, p.s);
  return true;
}

// ---------- 市場へ行ったとき：職場の蔵のあまりを卸す ----------
function overflow(sim, b, hid, g, st) {
  const P = WP[b.type];
  const keep = P.keep?.[g] ?? 0;
  const have = st[g] || 0;
  if (have <= keep + 0.2 || !isProduct(b.type, g)) return 0;
  const canShelf = b.type !== 'mine' && shelfOk(sim, b, hid);
  return canShelf ? Math.max(0, have - keep - shelfCap(g)) : have - keep;
}
function sellWs(sim, p) {
  const hh = sim.hh(p); if (!hh) return 0;
  let total = 0;
  const C = refresh(sim);
  const list = [];
  const shop = C.byHh.get(hh.id); if (shop) list.push(shop);
  const mine = C.mines.get(p.s); if (mine && mine.ws?.st?.[hh.id]) list.push(mine);
  for (const b of list) {
    const sid = townOfB(sim, b); if (sid !== p.s) continue;
    const st = b.ws?.st?.[hh.id]; if (!st) continue;
    for (const g of Object.keys(st)) {
      const n = overflow(sim, b, hh.id, g, st);
      if (n < 0.2 || !gd(g)) continue;
      const r = marketDeliver(sim, sid, g, n, hh);
      const sold = n - r.left;
      if (sold <= 1e-6) continue;
      st[g] -= sold; if (st[g] < 1e-4) delete st[g];
      if (r.got > 0) logSold(sim, b, g, '市場の商人', '卸し', sold, r.got);
      else logSold(sim, b, g, '市場（店に預けた）', '預け', sold, 0);
      total += r.got;
    }
  }
  return total;
}
function wsValue(sim, hh, sid) {
  let v = 0;
  const C = refresh(sim);
  const m = sim.S.towns[sid];
  for (const b of [C.byHh.get(hh.id), C.mines.get(sid)]) {
    const st = b?.ws?.st?.[hh.id]; if (!st || townOfB(sim, b) !== sid) continue;
    for (const g of Object.keys(st)) { const n = overflow(sim, b, hh.id, g, st); if (n >= 0.2) v += n * (m?.price?.[g] ?? gd(g)?.base ?? 1); }
  }
  return v;
}

// ---------- 店先の棚 ----------
function shelfOk(sim, b, hid) {
  if (b.type === 'mine') return false;
  const sid = townOfB(sim, b);
  if (!guildOf(sim, sid)) return true;   // 組合のない村は、だれでも店先で売れる
  const hh = sim.S.households[hid];
  return !!hh && hh.members.some((id) => { const q = sim.S.people[id]; return alive(q) && WP[b.type].jobs.includes(q.job) && isGuildMember(sim, q); });
}
// 店先の棚に並んでいる数（町の市場の、店主の札 c:3。よろず屋は買い取った品 c:0 も）
export function shelfQty(sim, b, g, hid = b.shop?.tenant) {
  const sid = townOfB(sim, b), m = sim.S.towns[sid];
  const list = m?.lots?.[g]; if (!list || hid == null) return 0;
  const merchant = WP[b.type]?.merchant;
  let s = 0;
  for (const l of list) if (l.o === hid && (l.c === 3 || (merchant && l.c === 0))) s += l.q;
  return Math.min(s, num(m.stock[g]));
}
export function shelfGoods(sim, b, hid = b.shop?.tenant) {
  const sid = townOfB(sim, b), m = sim.S.towns[sid];
  const out = {};
  if (!m?.lots || hid == null) return out;
  const merchant = WP[b.type]?.merchant, outs = ioOf(b.type).out;
  for (const [g, list] of Object.entries(m.lots)) {
    if (!merchant && !outs.has(g)) continue;   // 同じ家のほかの職人の品（別の店の品）は数えない
    let s = 0;
    for (const l of list) if (l.o === hid && (l.c === 3 || (merchant && l.c === 0))) s += l.q;
    s = Math.min(s, num(m.stock[g]));
    if (s >= 0.05) out[g] = s;
  }
  return out;
}
function restock(sim, b) {
  const hid = b.shop?.tenant; if (hid == null) return;
  const st = b.ws?.st?.[hid]; if (!st) return;
  if (!shelfOk(sim, b, hid)) return;
  const sid = townOfB(sim, b), hh = sim.S.households[hid]; if (!hh || sid == null) return;
  const keep = WP[b.type].keep || {};
  for (const g of Object.keys(st)) {
    if (!gd(g) || !isProduct(b.type, g)) continue;
    const avail = (st[g] || 0) - (keep[g] || 0);
    if (avail < 0.2) continue;
    const room = shelfCap(g) - shelfQty(sim, b, g, hid);
    const n = Math.min(avail, room);
    if (n < 0.2) continue;
    marketDeliver(sim, sid, g, n, hh, { shop: true });   // 店主の品として町の市場に並ぶ（お金は売れたときに客から）
    st[g] -= n; if (st[g] < 1e-4) delete st[g];
    logKey(sim, b, 'shelf', g, n);
  }
}

// ---------- 家族の食べる分を持ち帰る（自分の品なのでお金は動かない） ----------
function takeHome(sim, b, hh) {
  const st = b.ws?.st?.[hh.id]; if (!st) return;
  const want = hh.members.length * 3 - (hh.food || 0);
  if (want <= 0) return;
  let homeMeals = 0;
  for (const [g, n] of Object.entries(hh.stock || {})) homeMeals += n * (gd(g)?.meals || 0);
  let need = want - homeMeals;
  if (need <= 0) return;
  for (const g of ['bread', 'flour_wheat', 'wheat', 'fish', 'meat']) {
    if (need <= 0) break;
    const n = st[g] || 0, meals = gd(g)?.meals || 0;
    if (n < 0.2 || meals <= 0) continue;
    const q = Math.min(n, need / meals);
    st[g] = n - q; if (st[g] < 1e-4) delete st[g];
    const hs = hh.stock || (hh.stock = {}); hs[g] = (hs[g] || 0) + q;
    need -= q * meals;
    logKey(sim, b, 'home', g, q);
  }
}

// ---------- 仕事：仕入れ → 作る ----------
function buyInto(sim, b, hh, sid, g, n) {
  if (!(n > 1e-4)) return 0;
  const P = pseudoHh(sim, b, hh);
  const got = marketBuy(sim, sid, g, n, P);   // 代金は品の持ち主へ（onBuy が仕入れを記録する）
  if (got > 0) P.stock[g] = (P.stock[g] || 0) + got;
  return got;
}
// パン工房：小麦粉を用意する（粉を買うか、麦を買って粉ひき小屋でひいてもらう）
function flourFor(sim, b, hh, sid, need, batch) {
  const st = storeOf(b, hh.id), m = sim.S.towns[sid];
  if ((st.flour_wheat || 0) >= need) return;
  const want = batch - (st.flour_wheat || 0);
  // 1. 蔵の麦をひいてもらう
  if ((st.wheat || 0) > 0.05) {
    const q = Math.min(st.wheat, want * 16 / 15);
    st.wheat -= q; if (st.wheat < 1e-4) delete st.wheat;
    const f = millToll(sim, sid, q, hh);   // 麦の16分の1は粉ひき代として粉屋へ
    st.flour_wheat = (st.flour_wheat || 0) + f;
    logKey(sim, b, 'home', f < q - 1e-9 ? '__milled' : '__ground', f);
    if ((st.flour_wheat || 0) >= need) return;
  }
  // 2. 粉ひき小屋の小麦粉が市場にあり、麦からひくより高くなければ粉を買う
  const pw = m.price.wheat || 2, pf = m.price.flour_wheat;
  if ((m.stock.flour_wheat || 0) >= 0.5 && pf != null && pf <= pw * 16 / 15 * 1.25) {
    buyInto(sim, b, hh, sid, 'flour_wheat', want);
    if ((st.flour_wheat || 0) >= need) return;
  }
  // 3. 麦を買って、粉ひき小屋でひいてもらう
  const got = buyInto(sim, b, hh, sid, 'wheat', Math.max(0, want - (st.flour_wheat || 0)) * 16 / 15);
  if (got > 0) {
    st.wheat -= got; if (st.wheat < 1e-4) delete st.wheat;
    const f = millToll(sim, sid, got, hh);
    st.flour_wheat = (st.flour_wheat || 0) + f;
    logKey(sim, b, 'home', f < got - 1e-9 ? '__milled' : '__ground', f);
  }
}
function produce(sim, p, b, hh, eff, dt) {
  const R = PROD[p.job]; if (!R) return;
  const sid = p.s, m = sim.S.towns[sid], st = storeOf(b, hh.id);
  const G = gd(R.out); if (!G) return;
  const onShelf = shelfQty(sim, b, R.out, hh.id);
  if (R.stopM && (m.stock[R.out] || 0) >= (G.target || 10) * R.stopM) return;   // 町に十分ある：作らない（作りすぎると値が下がる）
  if ((st[R.out] || 0) >= R.back) return;                                         // 奥の棚がいっぱい
  if (R.out === 'ale' && onShelf + (st.ale || 0) >= (G.target || 20) * 1.2) return;
  const amount = R.rate * eff;
  if (!(amount > 0)) return;
  // 1. 仕入れ：材料が1回分に足りなければ、2時間分をまとめて買う（eff には働いた時間が入っている）
  const perHr = eff / Math.max(1e-6, dt / 60);
  let f = 1;
  for (const [k, u] of Object.entries(R.inp)) {
    const need = amount * u;
    if ((st[k] || 0) < need) {
      const batch = Math.max(need, u * R.rate * perHr * 2);
      if (p.job === 'baker' && k === 'flour_wheat') flourFor(sim, b, hh, sid, need, batch);
      else if (!R.fromStore) buyInto(sim, b, hh, sid, k, batch - (st[k] || 0));
      else if ((m.stock[k] || 0) > (gd(k)?.target || 20) * 2) buyInto(sim, b, hh, sid, k, Math.min(10, batch - (st[k] || 0)));   // 粉屋は、町の麦がたっぷりあまっているときだけ少し買う（麦は食べ物なので取り上げすぎない）
    }
    f = Math.min(f, (st[k] || 0) / need);
  }
  if (R.noInp && f < R.noInp) f = R.noInp;   // 端切れで少しは作れる
  if (f <= 1e-6) return;
  f = Math.min(1, f);
  // 薪（パン窯）：あれば使う。なくても焚き付けを拾って焼く
  if (R.fuel) {
    const w = amount * f * R.fuel;
    if ((st.wood || 0) < w && (m.stock.wood || 0) >= 1) buyInto(sim, b, hh, sid, 'wood', Math.max(w, 1.5));
    if ((st.wood || 0) >= w) { st.wood -= w; if (st.wood < 1e-4) delete st.wood; }
  }
  // 2. 作る：材料を使い、できた品を職場の蔵へ
  for (const [k, u] of Object.entries(R.inp)) { const use = Math.min(st[k] || 0, amount * f * u); st[k] = (st[k] || 0) - use; if (st[k] < 1e-4) delete st[k]; }
  const made = amount * f;
  st[R.out] = (st[R.out] || 0) + made;
  logMade(sim, b, R.out, made, sid);
  if (R.out === 'ale') hh.brewDay = sim.today;   // 酒を売る許し（shops.js）
}

export function workshopWork(sim, p, dt, eff) {
  if (MARKET_HOOK.buy !== onBuy) ensureWorkshop(sim);
  const b = workplaceOf(sim, p);
  if (!b) return false;
  const hh = sim.hh(p); if (!hh) return false;
  if (b.type === 'mine') return false;   // 鉱夫は元の仕事（掘った物は onStash で鉱山の小屋の蔵へ）
  CTX.b = b; CTX.hh = hh;
  try {
    if (p.job === 'smith') {
      const town = sim.S.towns[p.s];
      const n0 = town.shop?.length || 0, iron0 = town.mats?.iron || 0;
      sim.forge(p, dt, eff);   // 鉱石を買って鉄に、鉄から武具を打つ（town.mats・town.shop が鍛冶場の蔵と店先）
      const n1 = town.shop?.length || 0;
      if (n1 > n0) for (const it of town.shop.slice(n0)) logMade(sim, b, it.id, 1, p.s);
      const di = (town.mats?.iron || 0) - iron0;
      if (di > 0) logKey(sim, b, 'home', '__iron', di);
    } else produce(sim, p, b, hh, eff, dt);
    p.wsT = (p.wsT || 0) + dt;
    if (p.wsT >= 60) { p.wsT = 0; restock(sim, b); takeHome(sim, b, hh); }
  } finally { CTX.b = null; CTX.hh = null; }
  return TAKEOVER.has(p.job);
}

// ---------- 店の中で客に出す（酒場の麦酒・宿の料理・薬屋の薬・救貧院のパン） ----------
export function wsHave(sim, hh, g) {
  if (!hh) return 0;
  const b = shopOfHh(sim, hh.id);
  return (hh.stock?.[g] || 0) + (b?.ws?.st?.[hh.id]?.[g] || 0);
}
// 家の蔵（古いセーブの品）→ 職場の蔵の順に取る。お金は呼ぶ側が客から受け取っている。取れた数を返す
export function wsTake(sim, hh, g, n, who = '客', cost = 0) {
  if (!hh || !(n > 0)) return 0;
  let need = n;
  const h = Math.min(need, hh.stock?.[g] || 0);
  if (h > 0) { hh.stock[g] -= h; if (hh.stock[g] < 1e-4) delete hh.stock[g]; need -= h; }
  const b = shopOfHh(sim, hh.id), st = b?.ws?.st?.[hh.id];
  if (need > 0 && st && (st[g] || 0) > 0) {
    const x = Math.min(need, st[g]);
    st[g] -= x; if (st[g] < 1e-4) delete st[g]; need -= x;
    logSold(sim, b, g, who, '店の中', x, cost * x / n);
    tally(sim, townOfB(sim, b), g, WP[b.type].label, who, x);
  }
  return n - need;
}
// 鍛冶場の武具が売れた（buyGear）
export function wsGearSold(sim, p, it, price) {
  const town = sim.S.towns[p.s]; void town;
  const s = sim.town(p.s); if (!s) return;
  const b = s.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'smithy' && x.shop?.tenant != null) || s.buildings.map((id) => sim.building(id)).find((x) => x?.type === 'smithy');
  if (!b) return;
  const J = JOBS[p.job];
  const to = J?.combat ? `${J.name}（${p.given}）` : `${J?.name || '町の人'}（${p.given}）`;
  logSold(sim, b, it.id, to, '鍛冶場の店先', 1, price);
  tally(sim, p.s, 'gear', '鍛冶場', J?.combat ? '兵・冒険者' : '職人・町の人', 1);
}

// ---------- 毎時・毎日 ----------
export function workshopHourly(sim) {
  if (MARKET_HOOK.buy !== onBuy) ensureWorkshop(sim);
  const h = sim.hour();
  if (h < 6 || h > 20) return;
  for (const b of refresh(sim).all) if (b.shop?.tenant != null && b.ws) restock(sim, b);
}
const PERISH = { fish: 0.15, meat: 0.12, bread: 0.1 };
export function workshopDaily(sim) {
  const S = sim.S;
  WSS(sim);
  wsInvalidate();
  for (const b of S.world.buildings) {
    if (!b?.ws?.st) continue;
    const W = b.ws;
    // 日が替わったら記録を昨日へ
    if (W.log && W.log.d !== sim.today) { W.prev = W.log; W.log = blankLog(sim.today); }
    for (const [hid, st] of Object.entries(W.st)) {
      const hh = S.households[hid];
      const mine = hh && (b.type === 'mine' ? hh.members.some((id) => S.people[id]?.job === 'miner' && alive(S.people[id])) : b.shop?.tenant === +hid);
      // 店をやめた・絶えた世帯の品：家の蔵へ持ち帰る（絶えていれば町の市場へ。売れた代金は町へ）
      if (!mine) {
        for (const [g, n] of Object.entries(st)) {
          if (n < 0.01 || !gd(g)) continue;
          if (hh) { const hs = hh.stock || (hh.stock = {}); hs[g] = (hs[g] || 0) + n; }
          else { const sid = townOfB(sim, b); if (sid != null) marketDeliver(sim, sid, g, n, 't' + sid, { consign: true }); }
        }
        delete W.st[hid];
        continue;
      }
      // 傷む品（パン・魚・肉は家の蔵と同じ速さ。物の一覧の品は日持ちに合わせて）
      for (const g of Object.keys(st)) {
        const r = PERISH[g] ?? (MAT.get(g)?.keep ? Math.min(0.5, 1 / MAT.get(g).keep) : 0);
        if (r > 0) st[g] *= 1 - r;
        if (st[g] > 80) st[g] = 80;
        if (st[g] < 0.02) delete st[g];
      }
    }
  }
}

// ---------- 起動：市場と物の仕組みにつなぐ ----------
export function ensureWorkshop(sim) {
  WSS(sim);
  MARKET_HOOK.buy = onBuy;
  MARKET_HOOK.deliver = onDeliver;
  MARKET_HOOK.toll = onToll;
  MARKET_HOOK.stash = onStash;
  MARKET_HOOK.sellWs = sellWs;
  MARKET_HOOK.wsValue = wsValue;
  MATTER_HOOK.hh = (s, p) => {
    const hh = s.hh(p); if (!hh) return hh;
    const b = workplaceOf(s, p);
    if (!b || b.type === 'mine') return hh;
    return pseudoHh(s, b, hh);   // 作る物の材料は職場の蔵から。できた物も職場の蔵へ
  };
  wsInvalidate();
}

// ================================================================ 画面
// 建物の中の絵（shelfgfx.js）に渡す：できた品（奥の棚＋店先の棚）と材料
export function wsDisplay(sim, b) {
  if (!b) return null;
  const sid = townOfB(sim, b);
  const out = {}, mats = {};
  const add = (o, g, n) => { if (n > 0.01) o[g] = (o[g] || 0) + n; };
  if (b.type === 'market') {
    const m = sim.S.towns[sid];
    for (const [g, n] of Object.entries(m?.stock || {})) if (n >= 0.5) add(out, g, n);
    return { out, mats, items: [], market: true };
  }
  const hid = b.shop?.tenant;
  if (b.ws?.st) for (const [h, st] of Object.entries(b.ws.st)) for (const [g, n] of Object.entries(st)) {
    if (b.type !== 'mine' && +h !== hid) continue;
    (isProduct(b.type, g) ? add(out, g, n) : add(mats, g, n));
  }
  if (hid != null) for (const [g, n] of Object.entries(shelfGoods(sim, b, hid))) add(out, g, n);
  let items = [];
  if (b.type === 'smithy') {
    const town = sim.S.towns[sid];
    items = (town?.shop || []).map((it) => ({ id: it.id, type: ITEMS[it.id]?.type || 'tool' }));
    for (const [k, n] of Object.entries(town?.mats || {})) add(mats, k, n);
  }
  return { out, mats, items };
}

const fmt = (n) => (n >= 10 ? Math.round(n) : r1(n));
function listTxt(o, esc) {
  const e = Object.entries(o).filter(([g, n]) => n >= 0.05 && g[0] !== '_').sort((a, b) => b[1] - a[1]);
  return e.length ? e.slice(0, 12).map(([g, n]) => `${esc(goodName(g))} ${fmt(n)}`).join('・') : 'なし';
}
function logHTML(L, esc, title) {
  if (!L) return `<p class="sub">${title}：まだ記録がない</p>`;
  const buys = Object.values(L.buy).sort((a, b) => b.c - a.c).slice(0, 8);
  const sold = Object.values(L.sold).sort((a, b) => b.n - a.n).slice(0, 8);
  const made = Object.entries(L.made).filter(([g]) => g[0] !== '_');
  const milled = L.home?.__milled || 0, ground = L.home?.__ground || 0, iron = L.home?.__iron || 0;
  const home = Object.entries(L.home || {}).filter(([g]) => g[0] !== '_');
  const shelf = Object.entries(L.shelf || {});
  const soldN = sold.reduce((t, x) => t + x.n, 0), soldC = Object.values(L.sold).reduce((t, x) => t + x.c, 0);
  const buyC = Object.values(L.buy).reduce((t, x) => t + x.c, 0);
  let h = `<div class="wsday"><b>${title}</b>`;
  h += `<div class="wsrow"><span class="k">仕入れ</span><span>${buys.length ? buys.map((x) => `${esc(goodName(x.g))} ${fmt(x.n)}個 ← ${esc(x.from)}${x.c >= 0.5 ? `（${Math.round(x.c)}銅貨）` : ''}`).join('<br>') : 'なし'}${buyC >= 0.5 ? `<br><span class="sub">払った合計 ${Math.round(buyC)}銅貨</span>` : ''}</span></div>`;
  if (milled > 0.05) h += `<div class="wsrow"><span class="k">粉ひき</span><span>麦を粉ひき小屋でひいてもらい、小麦粉 ${fmt(milled)}（麦の16分の1を粉屋へ）</span></div>`;
  if (ground > 0.05) h += `<div class="wsrow"><span class="k">粉ひき</span><span>町に粉ひき小屋がないので、工房の石うすで麦をひいた：小麦粉 ${fmt(ground)}</span></div>`;
  if (iron > 0.05) h += `<div class="wsrow"><span class="k">製錬</span><span>鉱石から鉄の延べ棒 ${fmt(iron)}</span></div>`;
  h += `<div class="wsrow"><span class="k">作った</span><span>${made.length ? made.map(([g, n]) => `${esc(goodName(g))} ${fmt(n)}`).join('・') : 'なし'}</span></div>`;
  if (shelf.length) h += `<div class="wsrow"><span class="k">店先へ</span><span>${shelf.map(([g, n]) => `${esc(goodName(g))} ${fmt(n)}`).join('・')}</span></div>`;
  h += `<div class="wsrow"><span class="k">売った</span><span>${sold.length ? sold.map((x) => `${esc(goodName(x.g))} ${fmt(x.n)}個 → ${esc(x.to)}［${esc(x.where)}］${x.c >= 0.5 ? `（${Math.round(x.c)}銅貨）` : ''}`).join('<br>') : 'なし'}${soldN > 0 ? `<br><span class="sub">売り上げ ${Math.round(soldC)}銅貨</span>` : ''}</span></div>`;
  if (home.length) h += `<div class="wsrow"><span class="k">持ち帰り</span><span>${home.map(([g, n]) => `${esc(goodName(g))} ${fmt(n)}`).join('・')}（家族の食卓へ）</span></div>`;
  return h + '</div>';
}
const WS_CSS = `<style>.wsbox .wsrow{display:flex;gap:6px;margin:2px 0;font-size:12px;line-height:1.45}.wsbox .wsrow .k{flex:0 0 4.2em;color:#b8a070}.wsbox .wsday{margin-top:6px;padding-top:4px;border-top:1px dashed #5a4a34}.wsbar{display:inline-block;height:7px;background:#c98a3a;border-radius:2px;vertical-align:middle;margin-right:4px}.wsflow .node{border:1px solid #6a5838;border-radius:6px;padding:4px 7px;margin:0;background:#2a2218;font-size:12px}.wsflow .node b{color:#f0d8a0}.wsflow .arr{font-size:12px;color:#c9b070;padding:1px 0 1px 18px}.wsflow .bad{color:#ff8a70;font-weight:bold}.wsflow .ok{color:#8ad070}.wsflow .warn{color:#f0c050;font-weight:bold}.wsflow h5{margin:10px 0 4px;font-size:13px;color:#f0d8a0}</style>`;

// 建物の詳細欄「蔵と流れ」
export function wsBuildingHTML(sim, b, esc = (s) => String(s), pLink = null) {
  if (!b) return '';
  if (b.type === 'market') return marketBuildingHTML(sim, b, esc);
  const P = WP[b.type]; if (!P) return '';
  const S = sim.S, hid = b.shop?.tenant;
  const d = wsDisplay(sim, b);
  let h = `${WS_CSS}<div class="section wsbox"><h4>蔵と流れ（${esc(P.label)}）</h4>`;
  const workers = [];
  if (b.type === 'mine') { for (const p of sim.living()) if (p.job === 'miner' && workplaceOf(sim, p) === b) workers.push(p); }
  else if (hid != null) for (const id of S.households[hid]?.members || []) { const q = S.people[id]; if (alive(q) && P.jobs.includes(q.job)) workers.push(q); }
  h += `<div class="wsrow"><span class="k">働く人</span><span>${workers.length ? workers.map((q) => (pLink ? pLink(q, `${q.given}（${JOBS[q.job]?.name || ''}）`) : esc(q.given))).join('、') : '空き店（働く人がいない）'}</span></div>`;
  h += `<div class="wsrow"><span class="k">材料</span><span>${listTxt(d.mats, esc)}</span></div>`;
  if (b.type === 'smithy' && d.items.length) {
    const byT = {}; for (const it of d.items) byT[it.id] = (byT[it.id] || 0) + 1;
    h += `<div class="wsrow"><span class="k">武具</span><span>${Object.entries(byT).map(([id, n]) => `${esc(ITEMS[id]?.name || id)} ${n}`).join('・')}（鍛冶場の武器立てと鎧かけ）</span></div>`;
  }
  const back = {}, front = hid != null ? shelfGoods(sim, b, hid) : {};
  if (b.ws?.st) for (const [hh2, st] of Object.entries(b.ws.st)) { if (b.type !== 'mine' && +hh2 !== hid) continue; for (const [g, n] of Object.entries(st)) if (isProduct(b.type, g)) back[g] = (back[g] || 0) + n; }
  h += `<div class="wsrow"><span class="k">奥の棚</span><span>${listTxt(back, esc)}</span></div>`;
  if (b.type !== 'mine') h += `<div class="wsrow"><span class="k">店先の棚</span><span>${listTxt(front, esc)}${Object.keys(front).length ? '<br><span class="sub">町の市場に並ぶ品として数える。売れると代金は店主へ</span>' : ''}</span></div>`;
  h += `<div class="wsrow"><span class="k">売る場所</span><span>${P.sells.map(esc).join('・')}</span></div>`;
  if (hid != null && b.type !== 'mine' && !shelfOk(sim, b, hid)) h += `<div class="wsrow"><span class="k"></span><span class="sub">組合に入っていないので店先に並べられず、市場の商人へ卸している</span></div>`;
  const W = b.ws;
  const today = W?.log?.d === sim.today ? W.log : null;
  const yday = W?.log?.d === sim.today - 1 ? W.log : W?.prev?.d === sim.today - 1 ? W.prev : null;
  h += logHTML(today, esc, '今日');
  h += logHTML(yday, esc, '昨日');
  return h + '</div>';
}
function marketBuildingHTML(sim, b, esc) {
  const sid = townOfB(sim, b), m = sim.S.towns[sid];
  if (!m) return '';
  const byKind = { '市場の商人が買い取った品': {}, '店に預けた品': {}, '市の日の露店': {}, '職人の店先・町や国の品': {} };
  const keys = Object.keys(byKind);
  for (const [g, list] of Object.entries(m.lots || {})) for (const l of list) if (l.q >= 0.05) { const k = keys[[0, 1, 2, 3][l.c] ?? 3]; byKind[k][g] = (byKind[k][g] || 0) + l.q; }
  let h = `${WS_CSS}<div class="section wsbox"><h4>蔵と流れ（市場）</h4>`;
  for (const [k, o] of Object.entries(byKind)) h += `<div class="wsrow"><span class="k" style="flex-basis:8em">${esc(k)}</span><span>${listTxt(o, esc)}</span></div>`;
  h += wsTownFlowHTML(sim, sid, esc, true);
  return h + '</div>';
}

// 人の詳細欄：働く職場とその蔵
export function wsPersonHTML(sim, p, esc = (s) => String(s)) {
  if (!p || !p.job || p.deathYear != null) return '';
  const b = workplaceOf(sim, p);
  const J = JOBS[p.job];
  if (!b) {
    if (!PROD[p.job] && !J?.goods) return '';
    return `<div class="section"><h4>働く職場</h4><p>自分の家（店を持たないので、作った品は家の蔵に置き、市場の商人へ売る）</p></div>`;
  }
  const d = wsDisplay(sim, b);
  return `<div class="section"><h4>働く職場</h4><p><span class="link" data-bid="${b.id}">${esc(b.name || WP[b.type].label)}</span>（${esc(WP[b.type].label)}）<br>材料：${listTxt(d.mats, esc)}<br>できた品：${listTxt(d.out, esc)}</p></div>`;
}

// ---------- 「暮らし」欄：町の流れの図 ----------
// 昨日（なければ今日）の、品ごとの売り手 → 買い手の数と、作った数
function flowDay(sim, sid) {
  const W = WSS(sim);
  const cur = W.d === sim.today ? W.town[sid] : null;
  const prev = W.d === sim.today ? W.prevTown?.[sid] : W.town[sid];
  return { T: prev || cur || {}, label: prev ? '昨日' : '今日' };
}
function sumFrom(x, pred) { let s = 0; for (const [k, v] of Object.entries(x?.from || {})) if (pred(k)) s += v; return s; }
function sumTo(x, pred) { let s = 0; for (const [k, v] of Object.entries(x?.to || {})) if (pred(k)) s += v; return s; }
function wsIn(sim, sid, type) {
  const bs = (sim.town(sid)?.buildings || []).map((id) => sim.building(id)).filter((b) => b?.type === type || (type === 'tavern' && b?.type === 'inn'));
  return bs;
}
function storeSum(sim, bs, g, part) {
  let s = 0;
  for (const b of bs) {
    const hid = b.shop?.tenant;
    if (part !== 'front' && b.ws?.st) for (const [h, st] of Object.entries(b.ws.st)) if (b.type === 'mine' || +h === hid) s += st[g] || 0;
    if (part !== 'back' && hid != null) s += shelfQty(sim, b, g, hid);
  }
  return s;
}
function madeSum(sim, bs, g, day) {
  let s = 0;
  for (const b of bs) { const L = day === 'today' ? (b.ws?.log?.d === sim.today ? b.ws.log : null) : (b.ws?.log?.d === sim.today - 1 ? b.ws.log : b.ws?.prev?.d === sim.today - 1 ? b.ws.prev : null); s += L?.made?.[g] || 0; }
  return s;
}
function node(label, body, st) { return `<div class="node"><b>${label}</b>${st ? ` <span class="${st[0]}">${st[1]}</span>` : ''}<br>${body}</div>`; }
function arrow(txt) { return `<div class="arr">↓ ${txt}</div>`; }
function bar(v, max) { return `<span class="wsbar" style="width:${Math.max(2, Math.min(60, Math.round(v / Math.max(1, max) * 60)))}px"></span>`; }

export function wsTownFlowHTML(sim, sid, esc = (s) => String(s), inner = false) {
  const S = sim.S, m = S.towns[sid];
  if (!m) return '';
  const { T, label } = flowDay(sim, sid);
  const hhs = Object.values(S.households).filter((h) => h.s === sid);
  const jobHh = (job) => hhs.filter((h) => h.members.some((id) => S.people[id]?.job === job && alive(S.people[id])));
  const hstock = (list, g) => list.reduce((t, h) => t + (h.stock?.[g] || 0), 0);
  const day = label === '昨日' ? 'prev' : 'today';
  const out = [];
  // ---- パン：麦畑 → 粉ひき小屋 → パン工房 → 店先 → 家々の食卓
  {
    const farm = jobHh('farmer'), mills = wsIn(sim, sid, 'mill'), bak = wsIn(sim, sid, 'bakery');
    const w = T.wheat, f = T.flour_wheat, br = T.bread;
    if (farm.length || bak.length || (m.stock.bread || 0) > 0) {
      let h = `<h5>パン（${label}の流れ）</h5>`;
      const fw = hstock(farm, 'wheat');
      const wheatOut = sumFrom(w, (k) => k === '農夫');
      h += node(`麦畑（農家${farm.length}軒）`, `納屋の麦 ${fmt(fw)}　市場の麦 ${fmt(m.stock.wheat || 0)}`, farm.length ? null : ['warn', '農家がいない（よその村から運ぶ）']);
      h += arrow(`麦 ${fmt(sumTo(w, () => true))} が売れた（農家から ${fmt(wheatOut)}・商人から ${fmt(sumFrom(w, (k) => k === '商人' || k === '市場の商人'))}）→ パン工房へ ${fmt(sumTo(w, (k) => k === 'パン工房'))}・商人と村の蔵へ ${fmt(sumTo(w, (k) => k === '市場の商人' || k === '村の蔵'))}・家々へ ${fmt(sumTo(w, (k) => k === '家々'))}`);
      if (mills.length) {
        const mw = storeSum(sim, mills, 'wheat', 'back'), mf = storeSum(sim, mills, 'flour_wheat');
        const madeF = madeSum(sim, mills, 'flour_wheat', day);
        h += node('粉ひき小屋', `蔵の麦 ${fmt(mw)}（粉ひき代）　小麦粉 ${fmt(mf)}　ひいた粉 ${fmt(madeF)}`, mw > 40 && madeF < 1 ? ['warn', '麦がたまっている'] : null);
        h += arrow(`小麦粉 ${fmt(sumFrom(f, (k) => k === '粉ひき小屋'))} を売った（パン工房へ ${fmt(sumTo(f, (k) => k === 'パン工房'))}）`);
      }
      if (bak.length) {
        const bf = storeSum(sim, bak, 'flour_wheat', 'back') + storeSum(sim, bak, 'wheat', 'back');
        const back = storeSum(sim, bak, 'bread', 'back'), front = storeSum(sim, bak, 'bread', 'front');
        const made = madeSum(sim, bak, 'bread', day);
        const soldShop = sumFrom(br, (k) => k === 'パン工房');
        const st = made < 1 && bf < 0.5 ? ['bad', '材料が足りない'] : back + front > 30 && soldShop < made * 0.5 ? ['warn', 'パンが売れ残っている'] : made > 0 ? ['ok', '順調'] : null;
        h += node(`パン工房（${bak.filter((b) => b.shop?.tenant != null).length}軒）`, `粉と麦 ${fmt(bf)}　焼いたパン ${fmt(made)}　奥の棚 ${fmt(back)}`, st);
        h += arrow(`店先へ並べた`);
        h += node('店先の棚・市場', `${bar(front, 24 * bak.length)}店先のパン ${fmt(front)}　市場のパン ${fmt(m.stock.bread || 0)}（${(m.price.bread || 0).toFixed(1)}銅貨）`, (m.stock.bread || 0) < 3 ? ['bad', '品切れ'] : null);
      } else h += node('パン工房', 'この町にはパン工房がない（家で麦を煮て食べる・商人が運ぶ）', null);
      const toHome = sumTo(br, (k) => k === '家々'), toInn = sumTo(br, (k) => k === '酒場・宿' || k === '宿屋'), toAlms = sumTo(br, (k) => !['家々', '酒場・宿', '宿屋', '市場の商人', 'パン工房'].includes(k));
      h += arrow(`パン ${fmt(sumTo(br, () => true))} が売れた`);
      h += node('家々の食卓・宿屋', `家々 ${fmt(toHome)}　宿屋・酒場 ${fmt(toInn)}　救貧院など ${fmt(toAlms)}`, null);
      out.push(h);
    }
  }
  // ---- 武具：鉱山 → 鍛冶場 → 兵・冒険者
  {
    const smi = wsIn(sim, sid, 'smithy').filter((b) => b.shop?.tenant != null), mines = wsIn(sim, sid, 'mine');
    const o = T.ore, g = T.gear;
    if (smi.length) {
      const town = S.towns[sid];
      let h = `<h5>武器と道具（${label}の流れ）</h5>`;
      h += node(mines.length ? '鉱山（鉱夫）' : '鉱石の出どころ', `鉱山の小屋の鉱石 ${fmt(storeSum(sim, mines, 'ore', 'back'))}　市場の鉱石 ${fmt(m.stock.ore || 0)}`, (m.stock.ore || 0) < 1 && !(town.mats?.iron > 0) ? ['bad', '鉱石が足りない'] : null);
      h += arrow(`鉱石 ${fmt(sumTo(o, (k) => k === '鍛冶場'))} を鍛冶場が仕入れた`);
      let mk = 0; for (const b of smi) { const L = day === 'today' ? b.ws?.log : (b.ws?.log?.d === sim.today - 1 ? b.ws.log : b.ws?.prev); for (const [k, v] of Object.entries(L?.made || {})) if (ITEMS[k]) mk += v; }
      h += node('鍛冶場', `鉄の延べ棒 ${fmt(town.mats?.iron || 0)}　打った武具 ${fmt(mk)}　武器立てと鎧かけ ${town.shop?.length || 0}点`, (town.shop?.length || 0) >= 14 ? ['warn', '武具が売れ残っている'] : null);
      h += arrow(`武具 ${fmt(sumTo(g, () => true))} 点が売れた`);
      h += node('兵・冒険者・職人', `兵と冒険者 ${fmt(sumTo(g, (k) => k === '兵・冒険者'))}　職人・町の人 ${fmt(sumTo(g, (k) => k !== '兵・冒険者'))}`, null);
      out.push(h);
    }
  }
  // ---- 麦酒・布・薬・家具：材料 → 職場 → 客
  const simple = [
    { g: 'ale', name: '麦酒', src: 'wheat', types: ['tavern'], srcName: '麦' },
    { g: 'cloth', name: '布', src: 'wool', types: ['tailorshop', 'workshop'], srcName: '羊毛' },
    { g: 'medicine', name: '薬', src: 'herbs', types: ['apothecary'], srcName: '薬草' },
    { g: 'furniture', name: '家具', src: 'wood', types: ['workshop'], srcName: '材木' },
  ];
  for (const c of simple) {
    const bs = c.types.flatMap((t) => wsIn(sim, sid, t)).filter((b) => b.shop?.tenant != null);
    const x = T[c.g];
    const made = madeSum(sim, bs, c.g, day);
    if (!bs.length || (made < 0.05 && storeSum(sim, bs, c.g) < 0.5 && !x)) continue;
    const label2 = [...new Set(bs.map((b) => WP[b.type].label))].join('・');
    let h = `<h5>${c.name}（${label}の流れ）</h5>`;
    h += node(`${c.srcName}の出どころ`, `市場の${c.srcName} ${fmt(m.stock[c.src] || 0)}`, null);
    h += arrow(`${c.srcName} ${fmt(sumTo(T[c.src], (k) => k === WP[bs[0].type].label || bs.some((b) => WP[b.type].label === k)))} を仕入れた`);
    const mats = storeSum(sim, bs, c.src, 'back'), back = storeSum(sim, bs, c.g, 'back'), front = storeSum(sim, bs, c.g, 'front');
    h += node(label2, `材料 ${fmt(mats)}　作った${c.name} ${fmt(made)}　奥 ${fmt(back)}・店先 ${fmt(front)}`, made < 0.05 && mats < 0.1 ? ['bad', '材料が足りない'] : back + front > (gd(c.g)?.target || 10) * 1.5 ? ['warn', '売れ残っている'] : null);
    h += arrow(`${c.name} ${fmt(sumFrom(x, () => true))} が売れた・出た`);
    const to = Object.entries(x?.to || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${esc(k)} ${fmt(v)}`).join('　');
    h += node('客', to || 'まだ売れていない', null);
    out.push(h);
  }
  // ---- よろず屋：作り手 → よろず屋 → 家々
  {
    const gs = wsIn(sim, sid, 'genstore').filter((b) => b.shop?.tenant != null);
    if (gs.length) {
      let buyN = 0, soldN = 0;
      for (const b of gs) { const L = day === 'today' ? b.ws?.log : (b.ws?.log?.d === sim.today - 1 ? b.ws.log : b.ws?.prev); for (const v of Object.values(L?.buy || {})) buyN += v.n; for (const v of Object.values(L?.sold || {})) soldN += v.n; }
      let items = 0; for (const b of gs) for (const n of Object.values(shelfGoods(sim, b))) items += n;
      out.push(`<h5>よろず屋（${label}の流れ）</h5>${node('作り手（農家・漁師・職人）', '家の納屋・職場の蔵の品', null)}${arrow(`${fmt(buyN)}個を買い取った`)}${node('よろず屋の棚', `並んでいる品 ${fmt(items)}個`, items < 1 ? ['bad', '棚が空'] : null)}${arrow(`${fmt(soldN)}個が売れた`)}${node('家々', '町の人の暮らしへ', null)}`);
    }
  }
  if (!out.length) return inner ? '' : '';
  return `${inner ? '' : WS_CSS}<div class="wsflow"><h4>町の品の流れ（仕入れ → 作る → 売る）</h4><p class="sub">枠は職場と蔵、↓ は${label}動いた数。<span class="bad">赤</span>は足りない所、<span class="warn">黄</span>は詰まっている所。</p>${out.join('')}</div>`;
}
