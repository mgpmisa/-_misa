// 店と水車の持ち主・店の借り賃・差し押さえ・商売の費用（経済部）
// 社長の許可（docs/建物の持ち主と商売の費用.md 第5章）にもとづく。1銅貨も湧かせない・消さない。
//
// ■ 店の持ち主
//   パン屋・鍛冶場・工房・仕立て屋・薬屋・よろず屋・宿屋・酒場・湯屋は、持ち主（b.owner）と使う店主（b.shop.tenant）を持つ。
//   店主の持ち物になる割合：王都は半分、港町は6割、そのほかは8割。残りは貴族・商人・教会から借りる。
//     b.owner：世帯の id（家の持ち主と同じ扱い。相続は property.js の transferEstate がそのまま行う）、または 'a'+町（教会）・'k'+国（国）
//   借り賃は、住まいと同じ計算（weeklyRent）で週ごと。借り手の家計 → 持ち主の家計（教会なら施し箱、国なら国庫）。
//   店主がやめた・亡くなって継ぐ人が別の仕事なら、店は空き店になり、同じ仕事の別の人に貸す。
//   店に住む家族は、別に家を借りない（借家住まいだった店主は、店の2階に移る）。
// ■ 水車（風車小屋）
//   持ち主はその町の貴族（いなければ国）。粉屋が週18銅貨で借りる。
//   農家とパン屋が麦を粉にするとき、麦の16分の1を粉ひき代として粉屋に納める（millToll）。粉屋はパンを焼かない。
// ■ 商売の費用
//   組合費・露店の場所代・はかり料（market.js）、酒を売る許し（その週に仕込んだ家は、週に日給1日分を町の蓄えへ）、
//   町の負担（町に家を持つ家は、週に大人1人1銅貨を町の蓄えへ。借り手は払わない）。
// ■ 払えないとき（住まいも店も同じ）
//   1週目：待ってもらう。2週目：差し押さえ（仕事の道具と武器・防具・身につけている物は取らない）。5日以内に払えば返す。
//   払えなければ、品は市場に出して代金を大家へ、道具類は町の商人・鍛冶屋が買い取って代金を大家へ。3週目：追い出す（店なら閉める）。
//
// 本体からの呼び方：ensureShops(sim)（newWorld・load）、shopsDaily(sim)（newDay）、millToll(sim, sid, qty, payerHh)、
//   distrain(sim, hh, ownerCode, due, why)（property.js の家賃滞納から）、shopOf(sim, hh)、shopRows(sim, b)（建物の詳細欄）
import { JOBS, GOODS } from './data.js';
import { ITEMS, itemValue, addItem } from './items.js';
import { weeklyRent, houseValue, headOf } from './property.js';
import { acct, marketDeliver, MARKET_HOOK } from './market.js';
import { flow, econState } from './ledger.js';

export const SHOP_JOBS = {
  bakery: ['baker'], smithy: ['smith'], workshop: ['carpenter', 'tailor', 'cobbler', 'potter', 'weaver', 'jeweler', 'shipwright'],
  tailorshop: ['tailor', 'weaver'], apothecary: ['herbalist', 'alchemist'], genstore: ['shopkeeper', 'merchant'],
  tavern: ['innkeeper'], inn: ['hostkeeper', 'innkeeper'], bathhouse: ['bathkeeper'], mill: ['miller'],
};
const OWN_RATE = { capital: 0.5, port: 0.6 };
const MILL_RENT = 18;
const DAY_WAGE = 9;
const KEEP_TYPES = new Set(['tool', 'weapon', 'armor', 'shield']);
const alive = (p) => p && p.deathYear == null;
const r1 = (v) => Math.round(v * 10) / 10;

function S_(sim) { const S = sim.S; if (!S.shops) S.shops = { held: [], stats: { rent: 0, distrain: 0, closed: 0, leased: 0, toll: 0, license: 0, burden: 0 } }; return S.shops; }
function townOfB(sim, b) { return sim.S.world.settlements.find((s) => s.buildings.includes(b.id)); }
function ownerName(sim, o) {
  if (o == null) return '町';
  if (typeof o === 'number') return sim.S.households[o]?.name || '町';
  const s = String(o);
  return s[0] === 'a' ? '教会' : s[0] === 'k' ? '国' : '町';
}
function payTo(sim, code, amt, sid) { const a = acct(sim, code) || acct(sim, 't' + sid); if (a) a.money += amt; }
// 家族みんなのお金から払う（家計 → 財布）。払えた額を返す
function takeFrom(sim, hh, amt) {
  let need = amt;
  const t = Math.min(need, Math.max(0, hh.money)); hh.money -= t; need -= t;
  for (const id of hh.members) { if (need <= 0) break; const p = sim.S.people[id]; if (!alive(p)) continue; const x = Math.min(need, Math.max(0, p.purse || 0)); p.purse -= x; need -= x; }
  return amt - need;
}
function workerHh(sim, sid, jobs, not = new Set()) {
  for (const p of sim.living()) {
    if (p.s !== sid || !jobs.includes(p.job) || p.jail != null || sim.ageOf(p) < 16) continue;
    const hh = sim.hh(p); if (!hh || hh.bandits || not.has(hh.id)) continue;
    return hh;
  }
  return null;
}
function landlordFor(sim, s, R) {
  const S = sim.S;
  const rich = Object.values(S.households).filter((h) => h.s === s.id && !h.royal && !h.bandits && h.house != null && h.members.some((id) => ['noble', 'merchant', 'changer', 'innkeeper'].includes(S.people[id]?.job) || S.people[id]?.rank === 'noble'));
  if (R.chance(0.3) || !rich.length) return 'a' + s.id;   // 教会の貸し店
  return R.pick(rich).id;
}
export function shopOf(sim, hh) {
  if (!hh) return null;
  for (const b of sim.S.world.buildings) if (b.shop && b.shop.tenant === hh.id) return b;
  return null;
}
export function hasShop(sim, hh) { return !!shopOf(sim, hh); }

// ---------- 店に入る（借りる・持つ） ----------
function lease(sim, b, s, hh) {
  const sh = b.shop;
  sh.tenant = hh.id; sh.arrears = 0; sh.since = sim.today;
  const own = b.owner === hh.id;
  sh.rent = own ? 0 : b.type === 'mill' ? MILL_RENT : weeklyRent(sim, b);
  // 借家住まいの店主は、店の2階に移る（別に家を借りない）
  const home = hh.house != null ? sim.building(hh.house) : null;
  if (b.type !== 'mill' && home && home.type === 'house' && home.owner !== hh.id && home.hh === hh.id) {
    home.hh = null; home.name = '空き家'; home.rent = 0; home.arrears = 0;
    hh.house = b.id; hh.inn = false; hh.street = false; b.hh = hh.id;
  }
  S_(sim).stats.leased++;
  const head = headOf(sim, hh);
  if (head) sim.remember(head, own ? `自分の${b.name}で店を開いた` : `${ownerName(sim, b.owner)}から${b.name}を週${sh.rent}銅貨で借りて、店を開いた`, { emo: 0.5, imp: 0.6, k: 'house' });
}
function closeShop(sim, b, why) {
  const sh = b.shop, S = sim.S;
  const hh = S.households[sh.tenant];
  if (hh && hh.house === b.id) { hh.house = null; hh.street = true; }
  if (b.hh === sh.tenant) b.hh = null;
  sh.tenant = null; sh.arrears = 0; sh.rent = 0;
  S_(sim).stats.closed++;
  const head = hh && headOf(sim, hh);
  if (head && why) { sim.remember(head, why, { emo: -0.8, imp: 0.8, k: 'evicted' }); sim.pushLog(`${sim.fullName(head)}の一家が${b.name}を閉めた（${why}）。`, 'event', [head.id], b.door); }
}

// ---------- はじめに ----------
export function ensureShops(sim) {
  const S = sim.S, R = sim.rng;
  S_(sim);
  const taken = new Set();
  for (const s of S.world.settlements) {
    for (const id of s.buildings) {
      const b = sim.building(id);
      if (!b || !SHOP_JOBS[b.type] || b.shop) continue;
      b.shop = { tenant: null, rent: 0, arrears: 0 };
      b.value = b.value || houseValue(sim, b);
      const hh = workerHh(sim, s.id, SHOP_JOBS[b.type], taken);
      if (b.type === 'mill') {
        const noble = Object.values(S.households).find((h) => h.s === s.id && !h.royal && h.members.some((pid) => S.people[pid]?.rank === 'noble'));
        b.owner = noble ? noble.id : 'k' + (s.kingdom ?? 0);   // 水車は領主のもの（いなければ国）
      } else if (b.owner == null || b.owner === undefined) {
        b.owner = hh && R.chance(OWN_RATE[s.type] ?? 0.8) ? hh.id : landlordFor(sim, s, R);
      }
      if (hh) { taken.add(hh.id); lease(sim, b, s, hh); }
    }
  }
}

// ---------- 粉ひき代：麦の16分の1を粉屋へ ----------
export function millToll(sim, sid, qty, payerHh) {
  if (!(qty > 0)) return qty;
  const S = sim.S;
  const s = sim.town(sid); if (!s) return qty;
  let miller = null, millB = null;
  for (const id of s.buildings) { const b = sim.building(id); if (b?.type === 'mill' && b.shop?.tenant != null && S.households[b.shop.tenant]) { miller = S.households[b.shop.tenant]; millB = b; break; } }
  if (!miller || miller === payerHh) return qty;   // 水車のない村は、家の石うすでひく
  const toll = qty / 16;
  if (!(MARKET_HOOK.toll && MARKET_HOOK.toll(sim, millB, miller, toll, payerHh))) { const st = miller.stock || (miller.stock = {}); st.wheat = (st.wheat || 0) + toll; }   // 粉ひき小屋の蔵へ（workshop.js）
  S_(sim).stats.toll += toll;
  return qty - toll;
}

// ---------- 差し押さえ ----------
export function distrain(sim, hh, ownerCode, due, why = '家賃') {
  const S = sim.S, SH = S_(sim);
  if (!hh || due <= 0 || SH.held.some((x) => x.hh === hh.id)) return false;
  const m = S.towns[hh.s];
  const held = { hh: hh.id, s: hh.s, owner: ownerCode, due: r1(due), day: sim.today, goods: {}, items: [], why };
  let val = 0;
  // 蔵の品から
  for (const [g, n] of Object.entries(hh.stock || {})) {
    if (val >= due || !GOODS[g]) break;
    const price = m?.price[g] || GOODS[g].base;
    const q = Math.min(n, (due - val) / price + 0.5);
    if (q < 0.2) continue;
    hh.stock[g] -= q; held.goods[g] = q; val += q * price;
  }
  // 持ち物から（仕事の道具・武器・防具・身につけている物は取らない）
  for (const id of hh.members) {
    if (val >= due) break;
    const p = S.people[id]; if (!alive(p) || !p.inv) continue;
    const worn = new Set(Object.values(p.eq || {}));
    for (const it of p.inv.slice()) {
      if (val >= due) break;
      const d = ITEMS[it.id];
      if (!d || KEEP_TYPES.has(d.type) || worn.has(it) || d.type === 'material' && (it.n || 1) < 1) continue;
      p.inv.splice(p.inv.indexOf(it), 1);
      held.items.push({ it, from: p.id }); val += itemValue(it) * 0.4;
    }
  }
  if (val <= 0) return false;
  SH.held.push(held); SH.stats.distrain++;
  const head = headOf(sim, hh);
  if (head) { sim.remember(head, `${why}が払えず、${ownerName(sim, ownerCode)}に家の品を差し押さえられた。5日のうちに払えば返してもらえる`, { emo: -0.8, imp: 0.75, k: 'rent' }); sim.pushLog(`${sim.fullName(head)}の一家が${why}を払えず、品物を差し押さえられた。`, 'event', [head.id], head.pos); }
  return true;
}
function heldDaily(sim) {
  const S = sim.S, SH = S_(sim);
  SH.held = SH.held.filter((x) => {
    const hh = S.households[x.hh];
    // 払えた：品を返す
    if (hh && hh.money + 0 >= x.due + 5) {
      const paid = takeFrom(sim, hh, x.due); payTo(sim, x.owner, paid, x.s);
      flow(sim, '借り手', ownerName(sim, x.owner), paid, x.why + '（差し押さえの請け戻し）');
      for (const [g, n] of Object.entries(x.goods)) { const st = hh.stock || (hh.stock = {}); st[g] = (st[g] || 0) + n; }
      for (const { it, from } of x.items) { const p = S.people[from]; if (alive(p)) addItem(p, it); }
      return false;
    }
    if (sim.today - x.day < 5 && hh) return true;
    // 払えない：品は市場へ（売れた代金は大家へ）、道具類は町の商人・鍛冶屋が買い取る（代金は大家へ）
    for (const [g, n] of Object.entries(x.goods)) marketDeliver(sim, x.s, g, n, x.owner, { consign: true });
    const buyer = Object.values(S.households).find((h) => h.s === x.s && h.id !== x.hh && h.money > 60 && h.members.some((id) => ['merchant', 'smith', 'shopkeeper', 'changer'].includes(S.people[id]?.job)));
    for (const { it } of x.items) {
      const v = Math.round(itemValue(it) * 0.4);
      if (buyer && buyer.money > v + 20) { buyer.money -= v; payTo(sim, x.owner, v, x.s); flow(sim, '町の商人', ownerName(sim, x.owner), v, '差し押さえた品の買い取り'); const bp = buyer.members.map((id) => S.people[id]).find(alive); if (bp) addItem(bp, it); }
    }
    if (hh) { const head = headOf(sim, hh); if (head) sim.remember(head, `差し押さえられた品が売られてしまった`, { emo: -0.7, imp: 0.6, k: 'rent' }); }
    return false;
  });
}

// ---------- 毎日 ----------
export function shopsDaily(sim) {
  const S = sim.S, SH = S_(sim), R = sim.rng;
  ensureShops(sim);
  heldDaily(sim);
  const weekly = sim.dayIndex % 7 === 0;
  const busy = new Set();
  for (const b of S.world.buildings) if (b.shop?.tenant != null) busy.add(b.shop.tenant);
  for (const s of S.world.settlements) {
    for (const id of s.buildings) {
      const b = sim.building(id);
      if (!b?.shop) continue;
      const sh = b.shop;
      if (b.owner == null) b.owner = 't' + s.id;   // 持ち主の家が絶えた店は町のもの
      // 店主がやめた・いなくなった：空き店にする
      if (sh.tenant != null) {
        const hh = S.households[sh.tenant];
        const still = hh && hh.members.some((pid) => { const p = S.people[pid]; return alive(p) && SHOP_JOBS[b.type].includes(p.job); });
        if (!still) { closeShop(sim, b, null); busy.delete(sh.tenant); }
      }
      // 空き店：同じ仕事で店を持たない人に貸す（持ち主の家に同じ仕事の人がいれば、その家が使う）
      if (sh.tenant == null) {
        const ownHh = typeof b.owner === 'number' ? S.households[b.owner] : null;
        const hh = ownHh && ownHh.members.some((pid) => SHOP_JOBS[b.type].includes(S.people[pid]?.job)) ? ownHh : workerHh(sim, s.id, SHOP_JOBS[b.type], busy);
        if (hh) { lease(sim, b, s, hh); busy.add(hh.id); }
        continue;
      }
      // 借り賃：週ごと
      if (weekly && sh.rent > 0 && b.owner !== sh.tenant) {
        const hh = S.households[sh.tenant];
        const paid = takeFrom(sim, hh, sh.rent);
        payTo(sim, b.owner, paid, s.id);
        SH.stats.rent += paid;
        flow(sim, JOBS[SHOP_JOBS[b.type][0]]?.name || '店主', ownerName(sim, b.owner), paid, b.type === 'mill' ? '水車の借り賃' : '店の借り賃');
        if (paid >= sh.rent - 0.5) { sh.arrears = 0; continue; }
        sh.arrears = (sh.arrears || 0) + 1;
        const head = headOf(sim, hh);
        if (sh.arrears === 1 && head) sim.remember(head, `${b.name}の借り賃が払えず、待ってもらった`, { emo: -0.6, imp: 0.5, k: 'rent' });
        if (sh.arrears === 2) distrain(sim, hh, b.owner, sh.rent - paid, '店の借り賃');
        if (sh.arrears >= 3) closeShop(sim, b, `${b.name}の借り賃が3週たまり、店を閉めることになった`);
      }
    }
  }
  // 酒を売る許し：その週に麦酒を仕込んだ家は、週に1度、日給1日分を町の蓄えへ
  if (weekly) for (const hh of Object.values(S.households)) {
    if (hh.brewDay == null || hh.brewDay < sim.today - 7) continue;
    const x = takeFrom(sim, hh, DAY_WAGE);
    if (x > 0) { S.towns[hh.s].fund += x; SH.stats.license += x; flow(sim, '酒を造る家', '町の蓄え', x, '酒を売る許し'); }
  }
  // 町の負担：町に家を持つ家は、週に大人1人1銅貨（借り手は払わない）
  if (weekly) for (const hh of Object.values(S.households)) {
    if (hh.royal || hh.bandits || hh.house == null) continue;
    const s = sim.town(hh.s); if (!s || s.type === 'village' || s.tribal) continue;
    const b = sim.building(hh.house); if (!b || b.owner !== hh.id) continue;
    const adults = hh.members.filter((id) => alive(S.people[id]) && sim.ageOf(S.people[id]) >= 16).length;
    if (hh.money < 30 + adults) continue;   // 苦しい家は夜の見張りの番を務める
    hh.money -= adults; S.towns[hh.s].fund += adults; SH.stats.burden += adults;
    flow(sim, '町に家を持つ家', '町の蓄え', adults, '町の負担');
  }
  void R; void econState;
}

// 建物の詳細欄
export function shopRows(sim, b) {
  if (!b?.shop) return [];
  const sh = b.shop, S = sim.S;
  const t = sh.tenant != null ? S.households[sh.tenant] : null;
  const rows = [['持ち主', ownerName(sim, b.owner)], ['店主', t ? t.name : '空き店']];
  if (t && sh.rent > 0) rows.push(['借り賃', `週${sh.rent}銅貨${sh.arrears ? `（${sh.arrears}週たまっている）` : ''}`]);
  return rows;
}
