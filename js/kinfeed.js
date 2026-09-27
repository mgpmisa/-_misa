// 子どもを先に食べさせる（経済部）
// 小さな子（6歳未満）は自分で食べ物を探せない。家の大人が次の順で子の食事を工面する。
//   1. 家の食べ物（少ないときは大人が自分の分を減らして、子の分を先に取り分ける）
//   2. 家の蔵の麦・魚・肉で自炊
//   3. 親が市場で買う        … 家計（足りなければ親の財布）→ 品の持ち主（marketBuy）
//   4. 親戚・近所から分けてもらう … 食べ物だけが動く（お金は動かない）
//   5. 教会の施し            … 町の施し箱（t.alms）→ 品の持ち主（marketBuy）。買った食べ物を子へ
// どこからもお金や食べ物は湧かない。
import { GOODS } from './data.js';
import { marketBuy, cookFromStock } from './market.js';
import { meal } from './ledger.js';

const KID = 6;
const FOODS = ['bread', 'fish', 'wheat', 'meat'];
const alive = (sim, id) => { const q = sim.S.people[id]; return q && q.deathYear == null && q.needs ? q : null; };
const kidsOf = (sim, hh) => hh.members.map((id) => alive(sim, id)).filter((q) => q && sim.ageOf(q) < KID);
const st = (sim) => { const S = sim.S; S.kinfeed = S.kinfeed || { bought: 0, kin: 0, alms: 0, shared: 0, halved: 0, none: 0 }; return S.kinfeed; };

// 子の世話をする大人（親を先に。同じ町にいて、牢にいない人）
function carerOf(sim, p, hh) {
  const par = [p.motherId, p.fatherId].map((id) => alive(sim, id)).find((q) => q && q.hh === hh.id && q.jail == null);
  if (par) return par;
  return hh.members.map((id) => alive(sim, id)).find((q) => q && q !== p && sim.ageOf(q) >= 14 && q.jail == null) || null;
}
function feed(p, amt) { p.needs.hunger = Math.min(100, p.needs.hunger + amt * 100); }
function note(sim, p, txt, o) { if (!p.memories.some((m) => m.txt === txt && sim.today - m.t < 3)) sim.remember(p, txt, o); }

// 市場でいちばん安く腹がふくれる食べ物
function cheapest(sim, sid, budget) {
  const m = sim.S.towns[sid]; if (!m || m.occupied) return null;
  const opts = FOODS.filter((g) => (m.stock[g] || 0) >= 1 && m.price[g] != null && m.price[g] <= budget);
  if (!opts.length) return null;
  return opts.sort((a, b) => m.price[a] / GOODS[a].meals - m.price[b] / GOODS[b].meals)[0];
}

// 小さな子の食事（sim.js の decide から。n.hunger < 55 のとき）
export function feedChild(sim, p, hh) {
  if (!hh || !p.needs) return;
  const K = st(sim);
  if (hh.food < 0.5 && hh.stock && hh.house != null) cookFromStock(sim, hh, Math.max(1, kidsOf(sim, hh).length));
  if (hh.food >= 0.5) { hh.food -= 0.5; feed(p, 0.5); return; }
  // 家に食べ物がない。同じ家の工面は1時間に1回まで
  if (hh.kfT != null && sim.S.t - hh.kfT < 60) return;
  hh.kfT = sim.S.t;
  const carer = carerOf(sim, p, hh);
  const h = sim.hour(), sid = p.s, t = sim.S.towns[sid];
  const shopOpen = h >= 6 && h < 21;
  // 1. 親が市場で買う（家計から。足りなければ親の財布から）
  if (carer && shopOpen && t && !t.occupied) {
    const purse = { get money() { return carer.purse || 0; }, set money(v) { carer.purse = v; } };
    for (const payer of [hh, purse]) {
      const g = cheapest(sim, sid, Math.max(0, payer.money));
      if (!g) continue;
      const got = marketBuy(sim, sid, g, 1, payer, { whole: true, who: '子のために買う親' });
      if (got >= 1) {
        const meals = GOODS[g].meals * got;
        meal(sim, 'bought', meals);
        hh.food += meals - 0.5; feed(p, 0.5); K.bought++;
        if (hh.food < 0.5) hh.food = Math.max(0, hh.food);
        note(sim, carer, `なけなしのお金で${GOODS[g].name}を買い、まず${p.given}に食べさせた`, { emo: 0.1, imp: 0.4, about: [p.id], k: 'family' });
        return;
      }
    }
  }
  // 2. 親戚・近所から分けてもらう（食べ物だけが動く）
  const home = hh.house != null ? sim.building(hh.house) : null;
  let best = null, bs = -Infinity;
  for (const o of Object.values(sim.S.households)) {
    if (o === hh || o.s !== sid || o.bandits || o.street || o.wander || !o.members.length) continue;
    const spare = (o.food || 0) - o.members.length * 1.5;
    if (spare < 0.5) continue;
    const mem = o.members.map((id) => alive(sim, id)).filter(Boolean);
    if (!mem.length) continue;
    const kin = mem.find((q) => sim.kinTerm(q, p) || (carer && sim.kinTerm(q, carer)));
    const ob = o.house != null ? sim.building(o.house) : null;
    const d = home && ob ? Math.hypot(ob.door.x - home.door.x, ob.door.z - home.door.z) : 99;
    if (!kin && d > 14) continue;
    const sc = (kin ? 30 : 0) - d + spare;
    if (sc > bs) { bs = sc; best = { o, giver: kin || mem.find((q) => sim.ageOf(q) >= 14) || mem[0], kin: !!kin }; }
  }
  if (best) {
    const q = Math.min(1.5, (best.o.food || 0) - best.o.members.length * 1.5);
    best.o.food -= q; hh.food += q - 0.5; feed(p, 0.5); if (best.kin) K.kin++; else K.shared++;
    const g = best.giver, who = carer || p;
    if (g && g.memories) {
      note(sim, g, `食べ物が尽きた${who.given}の家の小さな${p.given}に、うちの食べ物を分けてあげた`, { emo: 0.4, imp: 0.4, about: [who.id, p.id], k: 'help' });
      if (carer) { note(sim, carer, `${g.given}が${p.given}の分の食べ物を分けてくれた。この恩は忘れない`, { emo: 0.6, imp: 0.6, about: [g.id], k: 'help' }); sim.relMut(carer, g).a += 8; }
    }
    return;
  }
  // 3. 教会の施し：施し箱のお金で市場の食べ物を買い、子に食べさせる
  if (t && !t.occupied && shopOpen && (t.alms || 0) >= 1) {
    const g = cheapest(sim, sid, t.alms);
    if (g && marketBuy(sim, sid, g, 1, 'a' + sid, { whole: true, who: '教会の施し箱' }) >= 1) {
      const meals = GOODS[g].meals;
      meal(sim, 'alms', meals);
      hh.food += meals - 0.5; feed(p, 0.5); K.alms++;
      if (carer) note(sim, carer, `教会の施しで${p.given}に食べさせてもらった。情けなくて、ありがたかった`, { emo: 0.2, imp: 0.5, k: 'help' });
      return;
    }
  }
  K.none++;
  if (carer) note(sim, carer, `${p.given}に食べさせる物が何もない。泣く声を聞くのがつらい`, { emo: -0.8, imp: 0.7, about: [p.id], k: 'hunger' });
}

// 大人が家で食べるとき：まず小さな子の分を取り分ける。残りが少なければ自分の分を減らす。
// 戻り値は、この大人が食べてよい量（0.5 か 1）。食べ物を減らすのは呼び出し側。
export function adultShare(sim, p, hh) {
  if (!hh || sim.ageOf(p) < KID) return 1;
  const kids = kidsOf(sim, hh);
  if (!kids.length) return 1;
  // 腹をすかせた子に先に食べさせる
  for (const k of kids) if (k.needs.hunger < 70 && hh.food >= 1.5) { hh.food -= 0.5; feed(k, 0.5); }
  const reserve = kids.length * 1;   // 子の次の2食分は残しておく
  if (hh.food - 1 >= reserve || p.needs.hunger < 12) return 1;
  st(sim).halved++;
  if (sim.hour() >= 17 || sim.hour() < 4) note(sim, p, '子どもに先に食べさせ、自分は腹をすかせて寝た', { emo: -0.3, imp: 0.55, about: kids.map((k) => k.id), k: 'family' });
  else note(sim, p, '食べ物が少ない。子どもの分を残して、自分は半分だけ食べた', { emo: -0.2, imp: 0.45, about: kids.map((k) => k.id), k: 'family' });
  return 0.5;
}
