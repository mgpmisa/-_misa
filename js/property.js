// 財産：所持金（財布）・家の持ち主と借家・家賃・追い出し・畑と家畜の持ち主・相続
// 家計（hh.money）は家族の共有財産、財布（p.purse）は一人ひとりの小遣いと稼ぎ。
import { JOBS } from './data.js';
import { ITEMS, addItem, autoEquip, itemName, itemValue } from './items.js';

const TOWN_MUL = { capital: 1.6, port: 1.2, village: 0.8 };

export function houseValue(sim, b) {
  if (b.type === 'mansion') return 1500;
  if (b.type === 'castle') return 20000;
  const s = sim.S.world.settlements.find((t) => t.buildings.includes(b.id));
  return Math.round(b.w * b.d * 40 * (TOWN_MUL[s?.type] || 1));
}
export const weeklyRent = (sim, b) => Math.max(4, Math.round(houseValue(sim, b) / 28));
const hhName = (sim, id) => sim.S.households[id]?.name || '町';
const headOf = (sim, hh) => {
  const mem = (hh?.members || []).map((id) => sim.S.people[id]).filter((p) => p && p.deathYear == null);
  return mem.sort((a, b) => sim.ageOf(b) * (b.sex === 'm' ? 1.1 : 1) - sim.ageOf(a) * (a.sex === 'm' ? 1.1 : 1))[0] || null;
};
export { headOf };

// ---------- はじめに：持ち主を決める ----------
export function initProperty(sim) {
  const S = sim.S, R = sim.rng;
  if (S.property) return;
  S.property = { v: 1 };
  const hhs = Object.values(S.households);
  const wealthOf = (hh) => hh.money + (hh.members.some((id) => S.people[id]?.rank === 'noble') ? 400 : 0);
  for (const s of S.world.settlements) {
    const houses = s.buildings.map((id) => sim.building(id)).filter((b) => b.type === 'house' || b.type === 'mansion');
    // 大家になれるのは、町の貴族や裕福な商人の家
    const landlords = hhs.filter((h) => h.s === s.id && h.house != null && !h.royal && !h.bandits && (wealthOf(h) > 220 || h.members.some((id) => ['noble', 'merchant', 'changer', 'innkeeper'].includes(S.people[id]?.job))));
    const ownRate = s.type === 'village' ? 0.85 : s.type === 'port' ? 0.6 : 0.5;
    for (const b of houses) {
      b.value = houseValue(sim, b);
      if (b.type === 'mansion' || !landlords.length) { b.owner = b.hh ?? null; continue; }
      if (b.hh != null && (R.chance(ownRate) || landlords.some((l) => l.id === b.hh))) { b.owner = b.hh; continue; }
      const l = R.pick(landlords.filter((x) => x.id !== b.hh)) || null;
      b.owner = l ? l.id : null;
      if (b.hh != null && b.owner != null) { b.rent = weeklyRent(sim, b); b.arrears = 0; }
    }
  }
  // 畑：自作農は自分の畑を持ち、小作は地主（村長・貴族）の畑を耕す
  for (const hh of hhs) {
    const jobs = hh.members.map((id) => S.people[id]?.job);
    if (jobs.includes('elder')) hh.land = R.int(8, 12);
    else if (jobs.includes('noble')) hh.land = R.int(10, 20);
    else if (jobs.some((j) => ['farmer', 'beekeeper', 'miller', 'rancher', 'shepherd'].includes(j))) hh.land = R.chance(0.65) ? R.int(2, 6) : 0;
  }
  // 家畜：牧場主・羊飼い・農家の家のもの。厩舎の馬は国のもの
  for (const c of Object.values(S.creatures)) if (c.owner != null && ['livestock'].includes(sim.speciesKind(c))) assignKeeper(sim, c);
  // 財布：大人は少しずつ持っている
  for (const p of sim.living()) {
    const age = sim.ageOf(p);
    const base = { king: 300, royal: 150, noble: 80, knight: 40, citizen: 20, adventurer: 25, commoner: 8, homeless: 1, outlaw: 12, prisoner: 0 }[p.rank] ?? 8;
    p.purse = age < 10 ? R.int(0, 2) : age < 14 ? R.int(0, 6) : Math.round(base * R.range(0.4, 1.6));
  }
}

export function assignKeeper(sim, c) {
  const S = sim.S;
  if (c.keeper != null && S.households[c.keeper]) return;
  if (c.sp === 'horse' && c.range > 0 && c.range < 2) { c.keeper = null; c.stateOwned = true; return; }
  const cands = Object.values(S.households).filter((h) => h.s === c.owner && h.members.some((id) => ['rancher', 'shepherd', 'farmer', 'stablehand', 'elder'].includes(S.people[id]?.job)));
  const pref = cands.filter((h) => h.members.some((id) => ['rancher', 'shepherd'].includes(S.people[id]?.job)));
  const pool = pref.length ? pref : cands;
  c.keeper = pool.length ? pool[(c.id.length + Number(c.id.replace(/\D/g, '') || 0)) % pool.length].id : null;
}

// ---------- 財布とお金の出どころ ----------
export const spendable = (sim, p) => (p.purse || 0) + Math.max(0, (sim.hh(p)?.money || 0) - 10);
// 財布から先に払い、足りなければ家計から出す
export function pay(sim, p, amt) {
  const hh = sim.hh(p);
  const fromPurse = Math.min(p.purse || 0, amt);
  p.purse = (p.purse || 0) - fromPurse;
  if (amt > fromPurse && hh) hh.money -= amt - fromPurse;
}
// 稼ぎの一部は自分の財布へ、残りは家計へ
export function earn(sim, p, amt, keep = 0.5) {
  const hh = sim.hh(p);
  p.purse = (p.purse || 0) + amt * keep;
  if (hh) hh.money += amt * (1 - keep); else p.purse += amt * (1 - keep);
}

// 持っている家・畑・家畜
export function estateOf(sim, hhId) {
  const S = sim.S;
  const houses = S.world.buildings.filter((b) => b.owner === hhId && (b.type === 'house' || b.type === 'mansion'));
  const fields = S.households[hhId]?.land || 0;
  const beasts = Object.values(S.creatures).filter((c) => c.keeper === hhId && c.hp > 0);
  return { houses, fields, beasts };
}
export function wealthOfHousehold(sim, hh) {
  if (!hh) return 0;
  const e = estateOf(sim, hh.id);
  const people = hh.members.map((id) => sim.S.people[id]).filter(Boolean);
  const items = people.reduce((s, p) => s + (p.purse || 0) + (p.inv || []).reduce((t, it) => t + itemValue(it), 0), 0);
  return Math.round(hh.money + items + e.houses.reduce((s, b) => s + (b.value || houseValue(sim, b)), 0) + e.fields * 15 + e.beasts.length * 30);
}

// ---------- 毎日 ----------
export function propertyDaily(sim) {
  const S = sim.S, R = sim.rng;
  if (!S.property) initProperty(sim);
  // 小遣い：働く大人は家計から少しずつ自分の財布へ（子どもは親から駄賃）
  for (const p of sim.living()) {
    const hh = sim.hh(p);
    if (!hh || p.jail != null) continue;
    const age = sim.ageOf(p);
    if (age < 7) continue;
    const allowance = age < 14 ? 0.3 : p.job && JOBS[p.job]?.pay != null || JOBS[p.job]?.goods ? 1.5 : 0.6;
    if (hh.money > 40 && (p.purse || 0) < 60) { const a = Math.min(allowance, hh.money * 0.01); hh.money -= a; p.purse = (p.purse || 0) + a; }
    // 財布が膨らみすぎたら家計に入れる（家族思いの人ほど）
    if ((p.purse || 0) > 150 && p.pers.A > 0.4 && !['adventurer'].includes(p.rank)) { const x = p.purse * 0.3; p.purse = (p.purse || 0) - x; hh.money += x; }
  }
  // 宿住まい：毎日宿代を払う。払えなければ追い出される
  for (const hh of Object.values(S.households)) {
    if (!hh.inn) continue;
    const mem = hh.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
    if (!mem.length) continue;
    const fee = 3 * mem.length;
    const cash = hh.money + mem.reduce((t, p) => t + (p.purse || 0), 0);
    const inn = sim.building(hh.house);
    const keeper = sim.living().find((q) => q.job === 'innkeeper' && q.s === hh.s);
    if (cash >= fee) {
      let need = fee; const t = Math.min(need, hh.money); hh.money -= t; need -= t;
      for (const p of mem) { const x = Math.min(need, p.purse || 0); p.purse = (p.purse || 0) - x; need -= x; }
      if (keeper && sim.hh(keeper)) sim.hh(keeper).money += fee * 0.9;
    } else {
      hh.inn = false; hh.street = true; hh.house = null;
      for (const p of mem) { if (p.inside === inn?.id) { p.inside = null; p.pos = { ...inn.door }; } p.action = null; sim.remember(p, '宿代が払えず、宿屋を追い出された', { emo: -0.8, imp: 0.8, k: 'evicted' }); }
      sim.pushLog(`${sim.fullName(mem[0])}が宿代を払えず、宿屋を追い出された。`, 'event', mem.map((p) => p.id), inn?.door);
    }
  }
  const weekly = sim.dayIndex % 7 === 0;
  const houses = S.world.buildings.filter((b) => b.type === 'house');
  if (weekly) {
    // 家賃の取り立て
    for (const b of houses) {
      if (b.hh == null || b.owner == null || b.owner === b.hh) continue;
      const tenant = S.households[b.hh], lord = S.households[b.owner];
      if (!tenant) continue;
      b.rent = b.rent || weeklyRent(sim, b);
      if (!lord) { b.owner = null; continue; }
      const purses = tenant.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
      let need = b.rent;
      const take = Math.min(need, Math.max(0, tenant.money)); tenant.money -= take; need -= take;
      for (const p of purses) { if (need <= 0) break; const t = Math.min(need, p.purse || 0); p.purse = (p.purse || 0) - t; need -= t; }
      lord.money += b.rent - need;
      if (need <= 0.5) { b.arrears = 0; continue; }
      b.arrears = (b.arrears || 0) + 1;
      const head = headOf(sim, tenant), lh = headOf(sim, lord);
      if (head) sim.remember(head, `家賃を払えず、${lh ? lh.given : hhName(sim, lord.id)}に待ってもらった`, { emo: -0.6, imp: 0.55, about: lh ? [lh.id] : [], k: 'rent' });
      if (b.arrears >= 3) evict(sim, b, tenant, lord);
    }
  }
  // 住まい探し：宿なしの家族が、お金を貯めて空き家を借りる・買う
  for (const hh of Object.values(S.households)) {
    if (!(hh.street || (hh.inn && hh.money + 0 > 200)) || hh.bandits || hh.wander || hh.royal) continue;
    const mem = hh.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
    if (!mem.length) continue;
    const cash = hh.money + mem.reduce((s, p) => s + (p.purse || 0), 0);
    const town = sim.town(hh.s);
    const empty = town.buildings.map((id) => sim.building(id)).filter((b) => b.type === 'house' && b.hh == null);
    const b = empty.sort((a, c) => (a.value || 0) - (c.value || 0))[0];
    if (!b) {
      const inn = sim.townBuilding(town, 'tavern');
      if (inn && cash > 30 * mem.length) { hh.street = false; hh.inn = true; hh.house = inn.id; for (const p of mem) sim.remember(p, '空き家がないので、しばらく宿屋に部屋を借りることにした', { emo: 0.3, imp: 0.5, k: 'house' }); }
      continue;
    }
    b.value = b.value || houseValue(sim, b);
    const rent = weeklyRent(sim, b);
    if (b.owner == null && cash > b.value * 1.1) { settle(sim, hh, b, mem, true); continue; }
    if (cash > rent * 3) {
      if (b.owner == null) { const lord = pickLandlord(sim, hh.s, hh.id); if (lord) b.owner = lord.id; else { if (cash > b.value * 0.6) settle(sim, hh, b, mem, true); continue; } }
      settle(sim, hh, b, mem, false);
    }
  }
  // 家を買い取る：借家住まいでお金が貯まった家族は、大家から家を買う
  if (weekly) for (const b of houses) {
    if (b.hh == null || b.owner == null || b.owner === b.hh) continue;
    const tenant = S.households[b.hh], lord = S.households[b.owner];
    if (!tenant || !lord) continue;
    const price = Math.round((b.value || houseValue(sim, b)) * 1.15);
    if (tenant.money > price + 60 && R.chance(0.5)) {
      tenant.money -= price; lord.money += price; b.owner = tenant.id; b.rent = 0; b.arrears = 0;
      const head = headOf(sim, tenant);
      b.name = tenant.name;
      if (head) {
        for (const id of tenant.members) { const q = S.people[id]; if (q && sim.ageOf(q) >= 10) sim.remember(q, `${price}銅貨で借りていた家を買い取った。ついに我が家だ`, { emo: 0.9, imp: 0.8, k: 'house' }); }
        sim.gossip(head, `${price}銅貨で家を買い取った`, 0.5, sim.living().filter((q) => q.s === head.s && q.hh !== head.hh).slice(0, 40), { congrat: '家を買ったんだって？ おめでとう' });
        const lh = headOf(sim, lord);
        sim.pushLog(`${sim.fullName(head)}の一家が、大家の${lh ? sim.fullName(lh) : hhName(sim, lord.id)}から借りていた家を${price}銅貨で買い取った。`, 'event', [head.id], b.door);
      }
    }
  }
  if (weekly) buyLand(sim);
  // 家畜の持ち主の引き継ぎ
  if (sim.dayIndex % 3 === 0) for (const c of Object.values(S.creatures)) if (c.owner != null && sim.speciesKind(c) === 'livestock' && !c.stateOwned && (c.keeper == null || !S.households[c.keeper])) assignKeeper(sim, c);
}

function pickLandlord(sim, sid, not) {
  const S = sim.S;
  return Object.values(S.households).filter((h) => h.s === sid && h.id !== not && h.house != null && !h.royal && !h.bandits && h.money > 150).sort((a, b) => b.money - a.money)[0] || null;
}

function settle(sim, hh, b, mem, buy) {
  const S = sim.S;
  if (buy) {
    let need = b.value;
    const t = Math.min(need, hh.money); hh.money -= t; need -= t;
    for (const p of mem) { const x = Math.min(need, p.purse || 0); p.purse = (p.purse || 0) - x; need -= x; }
    S.towns[hh.s].fund += b.value - need;
    b.owner = hh.id; b.rent = 0;
  } else { b.rent = weeklyRent(sim, b); b.arrears = 0; }
  hh.street = false; hh.inn = false; hh.name = hh.name.replace('（宿住まい）', '家'); hh.house = b.id; b.hh = hh.id; b.name = hh.name;
  for (const p of mem) {
    for (const j of ['homeless']) if (p.rank === j) p.rank = 'commoner';
    if (p.job === 'beggar' && sim.ageOf(p) < 60) { p.formerJob = 'beggar'; p.job = p.sex === 'm' ? 'stablehand' : 'laundress'; p.rank = 'commoner'; }
    sim.remember(p, buy ? '貯めたお金で空き家を買い、やっと屋根の下で眠れるようになった' : `空き家を借りた。家賃は週${b.rent}銅貨`, { emo: 0.85, imp: 0.8, k: 'house' });
  }
  sim.pushLog(`${hh.name}が${sim.town(hh.s).name}の空き家を${buy ? '買って' : '借りて'}住みはじめた。`, 'event', mem.map((p) => p.id), b.door);
  sim.events.push({ type: 'building', id: b.id });
}

function evict(sim, b, tenant, lord) {
  const S = sim.S;
  const lh = headOf(sim, lord);
  const mem = tenant.members.map((id) => S.people[id]).filter((p) => p && p.deathYear == null);
  // 情け深い大家は一度だけ待ってくれる
  if (lh && lh.pers.A > 0.7 && !b.forgiven) { b.forgiven = true; b.arrears = 1; sim.remember(lh, `家賃を滞らせている${tenant.name}を、もう少し待ってやることにした`, { emo: 0.1, imp: 0.4, k: 'rent' }); return; }
  b.hh = null; b.name = '空き家（貸家）'; b.arrears = 0; b.rent = 0; b.forgiven = false;
  tenant.house = null; tenant.street = true;
  for (const p of mem) {
    if (p.inside === b.id) { p.inside = null; p.pos = { ...b.door }; }
    p.action = null;
    sim.remember(p, `家賃が払えず、${lh ? lh.given : '大家'}に家を追い出された`, { emo: -0.95, imp: 0.95, about: lh ? [lh.id] : [], k: 'evicted' });
    if (lh) sim.relMut(p, lh).a -= 35;
  }
  if (lh) sim.remember(lh, `家賃を払わない${tenant.name}を家から追い出した`, { emo: -0.1, imp: 0.5, k: 'rent' });
  sim.pushLog(`${tenant.name}が家賃を払えず、${hhName(sim, lord.id)}に家を追い出された。一家は路頭に迷っている。`, 'event', mem.map((p) => p.id), b.door);
  if (mem[0]) sim.gossip(mem[0], `家賃が払えず家を追い出された`, -0.6, sim.living().filter((q) => q.s === tenant.s && q.hh !== tenant.id).slice(0, 40), { silent: true });
  sim.events.push({ type: 'building', id: b.id });
}

// ---------- 相続 ----------
// 亡くなった人の財布と持ち物は、連れ合い → 年長の子 → きょうだい → 同じ家の人 の順で受け継ぐ
export function heirOf(sim, p) {
  const S = sim.S;
  const alive = (id) => { const q = S.people[id]; return q && q.deathYear == null && q.id !== p.id ? q : null; };
  const sp = alive(p.spouseId);
  if (sp) return sp;
  const kids = (p.children || []).map(alive).filter(Boolean).sort((a, b) => a.birthYear - b.birthYear);
  const adult = kids.find((k) => sim.ageOf(k) >= 14);
  if (adult || kids[0]) return adult || kids[0];
  const sib = Object.values(S.people).find((q) => q.deathYear == null && q.id !== p.id && q.fatherId != null && (q.fatherId === p.fatherId || q.motherId === p.motherId) && q.s === p.s);
  if (sib) return sib;
  const hh = sim.hh(p);
  return hh ? hh.members.map(alive).filter(Boolean)[0] || null : null;
}

export function inherit(sim, p) {
  const S = sim.S;
  const heir = heirOf(sim, p);
  const inv = (p.inv || []).filter((it) => !(ITEMS[it.id]?.type === 'consumable'));
  const purse = Math.round(p.purse || 0);
  p.purse = 0;
  if (!heir) {
    if (purse > 0) S.towns[p.s].fund += purse;
    p.estate = { to: null, purse, items: inv.length };
    return null;
  }
  heir.purse = (heir.purse || 0) + purse;
  const best = inv.filter((it) => ITEMS[it.id]?.type !== 'material').sort((a, b) => itemValue(b) - itemValue(a))[0];
  for (const it of inv) addItem(heir, it);
  p.inv = []; p.eq = {};
  autoEquip(heir);
  p.estate = { to: heir.id, purse, items: inv.length };
  const bits = [];
  if (purse >= 5) bits.push(`${purse}銅貨`);
  if (best && itemValue(best) >= 20) bits.push(`形見の${itemName(best)}`);
  if (bits.length) sim.remember(heir, `亡き${sim.kinTerm(heir, p) || p.given}から${bits.join('と')}を受け継いだ`, { emo: -0.2, imp: 0.75, about: [p.id], k: 'inherit' });
  return heir;
}

// 世帯がなくなるとき：家・畑・家畜・家計を相続人の世帯へ
export function transferEstate(sim, oldHh, heirHhId) {
  const S = sim.S;
  const to = heirHhId != null && S.households[heirHhId] ? heirHhId : null;
  for (const b of S.world.buildings) if (b.owner === oldHh.id) {
    b.owner = to;
    if (b.hh === to) { b.rent = 0; b.arrears = 0; }
  }
  if (oldHh.land) { if (to != null) S.households[to].land = (S.households[to].land || 0) + oldHh.land; oldHh.land = 0; }
  for (const c of Object.values(S.creatures)) if (c.keeper === oldHh.id) c.keeper = to;
  if (to == null) S.towns[oldHh.s].fund += Math.max(0, oldHh.money);
  else S.households[to].money += Math.max(0, oldHh.money);
  oldHh.money = 0;
}

// 小作：自分の畑を持たない農夫は、収穫の一部を地主に納める
export function fieldShare(sim, p, qty) {
  const S = sim.S, hh = sim.hh(p);
  if (!hh || hh.land > 0) return qty;
  const town = sim.town(p.s);
  const lord = Object.values(S.households).filter((h) => h.land >= 8 && (h.s === p.s || sim.town(h.s).kingdom === town.kingdom)).sort((a, b) => (a.s === p.s ? -1 : 1) - (b.s === p.s ? -1 : 1) || b.land - a.land)[0];
  if (!lord) return qty;
  const cut = qty * 0.3;
  lord.food += cut * 0.3; lord.money += cut * 0.7 * sim.price('wheat', p.s) * 0.8;
  return qty - cut;
}
// 畑を買う：お金が貯まった小作は、地主から畑を買い取って自作農になる
export function buyLand(sim) {
  const S = sim.S;
  for (const hh of Object.values(S.households)) {
    if (hh.land > 0 || hh.money < 260) continue;
    if (!hh.members.some((id) => S.people[id]?.job === 'farmer')) continue;
    const lord = Object.values(S.households).filter((h) => h.land >= 4 && h.s === hh.s && h.id !== hh.id).sort((a, b) => b.land - a.land)[0];
    if (!lord) continue;
    const price = 180;
    hh.money -= price; lord.money += price; lord.land -= 2; hh.land = 2;
    const head = headOf(sim, hh);
    for (const id of hh.members) { const q = S.people[id]; if (q && sim.ageOf(q) >= 12) sim.remember(q, `${price}銅貨で畑を買い、小作から自作農になった`, { emo: 0.85, imp: 0.8, k: 'land' }); }
    if (head) sim.pushLog(`${hh.name}が${hhName(sim, lord.id)}から畑を買い取り、自分の畑を持った。`, 'event', [head.id], head.pos);
  }
}
