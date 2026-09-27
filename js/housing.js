// 住まいの手狭さ（開発部）：家族が増えて寝台が足りなくなった家の、増築・引っ越し・独り立ち
//
// ■ 寝台の数（interior.js の民家の内装と同じ考え方）
//   部屋の奥行き D = clamp(b.d*3+1, 6, 10)。西と東の壁ぞいに、奥行き2ずつ寝台を並べる（片側 floor((D-5)/2)+1 台、上限6台）。
//   いちばん目の寝台は夫婦の広い寝台（2人）。平屋で眠れる人数 = 寝台の数 + 1。
//   二階建て（b.floors = 2）は、二階に寝床があるので、寝台はすべて2人分（夫婦の寝台と二段の寝台）になり、眠れる人数は2倍。
//   眠れる人数より家族が多い家は、はみ出た人が床に寝わらを敷いて寝る（interior.js の takeMat）。
//
// ■ 毎日（housingDaily：newDay の matterDaily のあと）
//   手狭な家は、居心地（hh.comfort）が毎日少しずつ下がり、機嫌が悪くなる（不満）。2日ほど様子を見てから、家族で考える。
//   持ち家：家計に余裕があれば、大工と石工に頼んで二階建てに増築する。
//     材料（材木14・石材6・鉄の釘1袋）は、施主が市場で持ち主から買う（marketBuy）。そろわないときは数日待ち、4日目には古材で間に合わせる。
//     釘だけが市場にないとき（鍛冶屋が釘を作っていない町）は、2日待って、昔ながらの木の栓で組む。
//     家計だけで足りなければ、家族の大人が財布の小遣いを出し合う（財布 → 家計。同じ家の中のお金の移し替え）。
//     工事は4日。毎日、施主の家計から大工・石工の家計へ日当を払う（flow で帳簿に残す）。払えない日は工事が止まる。
//     できあがると b.floors = 2。家の値打ち（property.js の houseValue）は1.7倍になる。
//   借家：同じ町の空き家で、家族がみな寝台で眠れる家を探して引っ越す（家賃は新しい家の値打ちから決まる）。
//     空き家に持ち主がいなければ、お金があれば町から買う。なければ町の裕福な家が町から買い取って大家になる。
//     大きな空き家がなければ、大家に頼んで増築してもらう。費用は大家が払い、家賃は値打ちに合わせて上がる。
//   お金が足りないとき：大人になった独り身の子が、家を出て独り立ちする（空き家を借りる・買う、なければ宿住まい）。
//     それもできなければ、詰めて暮らす（寝わら）。
//   増築・引っ越し・独り立ちは、出来事の欄（pushLog）・年代記（chron）・本人と家族の記憶・噂（gossip の祝いの言葉）に残す。
//
// ■ お金の出どころと行き先
//   材料：施主（または大家）の家計 → 品の持ち主（商人・職人・町）……marketBuy が払い、帳簿に書く
//   日当：施主（または大家）の家計 → 大工・石工の家計
//   空き家を買う：買い手の家計 → 町の蓄え（空き家の持ち主がいないときは町のもの）
//   独り立ちの持たせ金：親の家計 → 子の新しい家計
import { JOBS } from './data.js';
import { houseValue, weeklyRent, headOf } from './property.js';
import { marketBuy } from './market.js';
import { matterWant } from './matter.js';
import { flow, income, whoLabel } from './ledger.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MATS = { wood: 14, stone: 6, iron_nail: 1 };
const MAT_JP = { wood: '材木', stone: '石材', iron_nail: '鉄の釘' };
const MAT_V = { wood: 2, stone: 3, iron_nail: 16 };
const BUILD_DAYS = 4;
const WAGE = { carp: 12, mason: 10 };
const CARP_JOBS = ['carpenter', 'shipwright'];
const MASON_JOBS = ['mason', 'roadworker', 'miner'];
const HELP_JOBS = ['pioneer', 'woodcutter', 'farmer', 'stablehand', 'charcoal', 'gatherer', 'shepherd'];
export const HOUSE_VALUE_2F = 1.7;

// ---------- 寝台の数 ----------
export function bedSlots(b) {
  const D = clamp(b.d * 3 + 1, 6, 10);
  return Math.min(6, 2 * (Math.floor((D - 5) / 2) + 1));
}
// その家で寝台に眠れる人数（n は家族の人数）
export function bedCapacity(b, n = 2) {
  if (!b || b.type !== 'house') return 99;
  const slots = bedSlots(b);
  if ((b.floors || 1) >= 2) return 2 * slots;
  return slots + (n >= 2 ? 1 : 0);
}
const alive = (sim, hh) => (hh?.members || []).map((id) => sim.S.people[id]).filter((p) => p && p.deathYear == null);

// ---------- 状態 ----------
function HS(sim) {
  const S = sim.S;
  if (!S.housing) S.housing = { v: 1, jobs: {}, n: { expand: 0, lordExpand: 0, move: 0, leave: 0, started: 0, cancel: 0 } };
  return S.housing;
}
export function housingStats(sim) { return HS(sim).n; }

// その家は手狭か（寝台の足りない人数）
export function shortBeds(sim, hh) {
  const b = hh?.house != null ? sim.building(hh.house) : null;
  if (!b || b.type !== 'house' || b.hh !== hh.id) return 0;
  const n = alive(sim, hh).length;
  return Math.max(0, n - bedCapacity(b, n));
}

// ---------- 職人を探す ----------
let wcache = { day: -1, S: null, by: null };
function workersIn(sim, sid) {
  if (wcache.day !== sim.today || wcache.S !== sim.S) {
    const by = {};
    for (const p of sim.living()) {
      if (!p.job || p.jail != null || !p.needs) continue;
      const age = sim.ageOf(p);
      if (age < 16 || age > 68 || !sim.hh(p)) continue;
      (by[p.s] || (by[p.s] = [])).push(p);
    }
    wcache = { day: sim.today, S: sim.S, by };
  }
  return wcache.by[sid] || [];
}
function findWorker(sim, sid, jobs, notHh, busy) {
  const ok = (p) => jobs.includes(p.job) && p.hh !== notHh && !busy.has(p.id);
  const here = workersIn(sim, sid).filter(ok);
  if (here.length) return here[(sim.today + sid) % here.length];
  // 町にいなければ、同じ国のいちばん近い町から呼ぶ
  const s = sim.town(sid);
  const others = sim.S.world.settlements.filter((t) => t.id !== sid && t.kingdom === s.kingdom && !t.tribal).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
  for (const t of others.slice(0, 6)) { const l = workersIn(sim, t.id).filter(ok); if (l.length) return l[0]; }
  return null;
}
function busyWorkers(sim) {
  const set = new Set();
  for (const j of Object.values(HS(sim).jobs)) { if (j.carp != null) set.add(j.carp); if (j.mason != null) set.add(j.mason); }
  return set;
}
const jobName = (p) => JOBS[p?.job]?.name || '';
const hname = (hh) => (/家$/.test(hh.name || '') ? hh.name : `${hh.name || ''}の家`);   // 「ランゲ家」はそのまま、「ランゲ（宿住まい）」なら「〜の家」

// ---------- 見積もり ----------
function matPrice(sim, sid, g) { const m = sim.S.towns[sid]; const pr = m?.price?.[g]; return pr > 0 ? pr : MAT_V[g]; }
function estimate(sim, sid) {
  let c = 0;
  for (const [g, n] of Object.entries(MATS)) c += n * matPrice(sim, sid, g);
  return Math.round(c + BUILD_DAYS * (WAGE.carp + WAGE.mason));
}

// ---------- 増築を始める ----------
function startExpand(sim, hh, b, payer, byLord) {
  const Hs = HS(sim), R = sim.rng;
  const busy = busyWorkers(sim);
  const carp = findWorker(sim, hh.s, CARP_JOBS, payer.id, busy) || findWorker(sim, hh.s, HELP_JOBS, payer.id, busy);
  if (!carp) return false;
  busy.add(carp.id);
  const mason = findWorker(sim, hh.s, MASON_JOBS, payer.id, busy) || findWorker(sim, hh.s, HELP_JOBS, payer.id, busy);
  const cost = estimate(sim, hh.s);
  Hs.jobs[b.id] = { b: b.id, hh: hh.id, payer: payer.id, lord: !!byLord, need: { ...MATS }, stage: 'mat', wait: 0, days: 0, stall: 0, start: sim.today, carp: carp.id, mason: mason ? mason.id : null, est: cost, spent: 0 };
  Hs.n.started++;
  const head = headOf(sim, hh), lh = byLord ? headOf(sim, payer) : null;
  const who = `${CARP_JOBS.includes(carp.job) ? '' : '手の空いた'}${jobName(carp)}の${carp.given}`;
  if (head) {
    const txt = byLord ? `大家の${lh ? lh.given : payer.name}が、家を二階建てに建て増してくれることになった。家賃は上がるが、みんな寝台で眠れる` : `家族が増えて寝台が足りないので、${who}に頼んで家を二階建てに建て増すことにした`;
    for (const p of alive(sim, hh)) if (sim.ageOf(p) >= 10) sim.remember(p, txt, { emo: 0.5, imp: 0.6, about: [carp.id], k: 'house' });
  }
  if (lh) sim.remember(lh, `借り手の${hname(hh)}が手狭なので、${who}に二階の建て増しを頼んだ`, { emo: 0.1, imp: 0.5, about: [carp.id], k: 'house' });
  sim.remember(carp, `${hname(hh)}の二階の建て増しを請け負った`, { emo: 0.4, imp: 0.45, k: 'work' });
  if (mason) sim.remember(mason, `${hname(hh)}の建て増しで、石の土台と壁を任された`, { emo: 0.3, imp: 0.35, k: 'work' });
  sim.pushLog(`${byLord ? `大家の${lh ? sim.fullName(lh) : payer.name}が、借り手の${hh.name}のために` : `${hh.name}が`}、${who}に頼んで家を二階建てに建て増しはじめた（見積もり${cost}銅貨）。`, 'event', [head?.id, carp.id].filter((x) => x != null), b.door);
  void R;
  return true;
}

// ---------- 工事を進める（毎日） ----------
function progressJobs(sim) {
  const S = sim.S, Hs = HS(sim);
  for (const [bid, j] of Object.entries(Hs.jobs)) {
    const b = sim.building(+bid);
    const hh = S.households[j.hh], payer = S.households[j.payer];
    if (!b || !hh || !payer || b.hh !== hh.id) { delete Hs.jobs[bid]; Hs.n.cancel++; continue; }
    const sid = hh.s;
    if (j.stage === 'mat') {
      // 材料は施主が市場で買う（家計は20銅貨を残す）
      const wallet = { get money() { return Math.max(0, payer.money - 20); }, set money(v) { payer.money = v + 20; } };
      for (const g of Object.keys(j.need)) {
        if (j.need[g] < 0.05) continue;
        const before = payer.money;
        const got = marketBuy(sim, sid, g, j.need[g], wallet, { who: whoLabel(sim, payer.id) });
        j.need[g] -= got; j.spent += before - payer.money;
        if (j.need[g] >= 0.05) (j.poor || (j.poor = {}))[g] = (sim.S.towns[sid]?.stock?.[g] || 0) >= 0.05;   // 品はあったが、お金が足りなかった
      }
      const left = Object.entries(j.need).filter(([, n]) => n >= 0.05);
      j.wait++;
      // 市場に無い材料は、職人に注文する（鍛冶屋が釘を打つ。できた品は市場に出て、施主が買う）
      for (const [g, n] of left) matterWant(sim, sid, g, n);
      const onlyNails = left.length === 1 && left[0][0] === 'iron_nail';
      if (!left.length || j.wait >= (onlyNails ? 5 : 4)) {   // 釘だけなら、よその町の鍛冶屋から届くのを少し長く待つ
        // 釘が手に入らなければ木の栓で組む。ほかの材料が足りなければ古材で間に合わせる
        const other = left.filter(([g]) => g !== 'iron_nail').map(([g]) => MAT_JP[g]);
        if (left.length) j.makeshift = [left.some(([g]) => g === 'iron_nail') ? (j.poor?.iron_nail ? '釘を買うお金が足りず、木の栓で組んだ' : '釘が手に入らず、木の栓で組んだ') : '', other.length ? `${other.join('と')}がそろわず、古材で間に合わせた` : ''].filter(Boolean).join('。');
        j.stage = 'build';
      }
      continue;
    }
    // 工事：その日の日当を払えた職人がいれば1日進む
    let worked = 0;
    for (const [k, pid] of [['carp', j.carp], ['mason', j.mason]]) {
      const w = pid != null ? S.people[pid] : null;
      if (!w || w.deathYear != null || w.jail != null) { if (k === 'carp') j.carp = null; else j.mason = null; continue; }
      const whh = sim.hh(w); if (!whh) continue;
      const wage = WAGE[k];
      if (payer.money < wage + 5) continue;
      payer.money -= wage; whh.money += wage; j.spent += wage;
      flow(sim, whoLabel(sim, payer.id), whoLabel(sim, whh.id), wage, '家の建て増しの日当');
      income(sim, w.job, wage);
      worked++;
    }
    if (!worked) {
      // 職人がいなくなったら、別の職人を探す
      if (j.carp == null) { const c = findWorker(sim, sid, CARP_JOBS, payer.id, busyWorkers(sim)) || findWorker(sim, sid, HELP_JOBS, payer.id, busyWorkers(sim)); if (c) j.carp = c.id; }
      j.stall++;
      if (j.stall >= 20) { delete Hs.jobs[bid]; Hs.n.cancel++; const h = headOf(sim, hh); if (h) sim.remember(h, 'お金が続かず、家の建て増しを途中であきらめた', { emo: -0.6, imp: 0.6, k: 'house' }); }
      continue;
    }
    j.days++;
    if (j.days >= BUILD_DAYS) finishExpand(sim, b, hh, payer, j);
  }
}

function finishExpand(sim, b, hh, payer, j) {
  const S = sim.S, Hs = HS(sim);
  delete Hs.jobs[b.id];
  const oldRent = b.rent || 0;
  const oldValue = b.value || houseValue(sim, b);
  b.floors = 2;
  b.value = houseValue(sim, b);
  if (j.lord) { b.rent = weeklyRent(sim, b); Hs.n.lordExpand++; } else Hs.n.expand++;
  hh.comfort = Math.min(10, Math.max(0, hh.comfort || 0) + 2);
  hh.crowd = 0;
  sim.events.push({ type: 'building', id: b.id });
  const head = headOf(sim, hh), lh = j.lord ? headOf(sim, payer) : null;
  const carp = j.carp != null ? S.people[j.carp] : null;
  const town = sim.town(hh.s);
  const n = alive(sim, hh).length;
  const spent = Math.round(j.spent);
  const mk = j.makeshift ? `（${j.makeshift}）` : '';
  const cap2 = bedCapacity(b, n);
  const beds = n <= cap2 ? `家族${n}人がみな寝台で眠れる` : `寝台で眠れるのは${cap2}人になった（まだ${n - cap2}人は寝わら）`;
  for (const p of alive(sim, hh)) if (sim.ageOf(p) >= 6) sim.remember(p, j.lord ? `大家が家を二階建てにしてくれた。${beds}。家賃は週${oldRent}から${b.rent}銅貨に上がった` : `家が二階建てになった。${spent}銅貨かかったが、${beds}`, { emo: n <= cap2 ? 0.8 : 0.5, imp: 0.75, about: carp ? [carp.id] : [], k: 'house' });
  if (lh) sim.remember(lh, `${hh.name}に貸している家を二階建てにした。${spent}銅貨かかったが、家賃は週${b.rent}銅貨になる`, { emo: 0.3, imp: 0.5, k: 'house' });
  if (carp && carp.deathYear == null) sim.remember(carp, `${hname(hh)}の二階の建て増しを仕上げた`, { emo: 0.6, imp: 0.5, k: 'work' });
  if (head) sim.gossip(head, '家を二階建てに建て増した', 0.5, sim.living().filter((q) => q.s === hh.s && q.hh !== hh.id).slice(0, 40), { congrat: '家を二階建てにしたんだってね。立派になったね', silent: true });
  sim.pushLog(`${town.name}の${hname(hh)}が二階建てになった${mk}。${j.lord ? `費用${spent}銅貨は大家が払い、家賃は週${oldRent}から${b.rent}銅貨に上がった` : `費用は${spent}銅貨、家の値打ちは${Math.round(oldValue)}から${b.value}銅貨に上がった`}。`, 'event', [head?.id, carp?.id].filter((x) => x != null), b.door);
  sim.chron(`${town.name}の${head ? sim.fullName(head) : hh.name}の家が、家族が増えて二階建てに建て増された`, town.kingdom);
}

// ---------- 借家から大きな家へ引っ越す ----------
function landlordFor(sim, sid, not, price) {
  return Object.values(sim.S.households).filter((h) => h.s === sid && h.id !== not && h.house != null && !h.royal && !h.bandits && !h.inn && !h.street && h.money > price + 120).sort((a, b) => b.money - a.money)[0] || null;
}
// 空き家を手に入れる：持ち主がいれば借りる。いなければ買う（お金は町の蓄えへ）か、町の裕福な家に買ってもらって借りる
function acquire(sim, hh, nb, cash) {
  const S = sim.S;
  nb.value = nb.value || houseValue(sim, nb);
  const rent = weeklyRent(sim, nb);
  if (nb.owner != null && S.households[nb.owner] && nb.owner !== hh.id) { if (cash < rent * 3) return null; return { rent, how: 'rent' }; }
  const price = Math.round(nb.value);
  if (hh.money >= price + 40) {
    hh.money -= price; S.towns[hh.s].fund = (S.towns[hh.s].fund || 0) + price;
    flow(sim, whoLabel(sim, hh.id), '町の蓄え', price, '空き家の買い取り');
    nb.owner = hh.id; return { rent: 0, how: 'buy', price };
  }
  if (cash < rent * 3) return null;
  const lord = landlordFor(sim, hh.s, hh.id, price);
  if (!lord) return null;
  lord.money -= price; S.towns[hh.s].fund = (S.towns[hh.s].fund || 0) + price;
  flow(sim, whoLabel(sim, lord.id), '町の蓄え', price, '貸家にする空き家の買い取り');
  nb.owner = lord.id;
  return { rent, how: 'rent', lord };
}
function vacate(sim, b, hh) {
  b.hh = null; b.rent = 0; b.arrears = 0; b.forgiven = false;
  b.name = b.owner != null && b.owner !== hh.id ? '空き家（貸家）' : '空き家';
  for (const p of alive(sim, hh)) {
    if (p.inside === b.id) { p.inside = null; p.pos = { ...b.door }; p.path = []; }
    if (p.action && p.action.bld === b.id) p.action = null;
  }
}
function tryMove(sim, hh, b, mem, empties) {
  if ((b.arrears || 0) > 0) return false;
  const n = mem.length;
  const cash = hh.money + mem.reduce((s, p) => s + (p.purse || 0), 0);
  const cands = (empties[hh.s] || []).filter((x) => x.hh == null && bedCapacity(x, n) >= n && bedCapacity(x, n) > bedCapacity(b, n)).sort((a, c) => weeklyRent(sim, a) - weeklyRent(sim, c));
  for (const nb of cands) {
    const got = acquire(sim, hh, nb, cash);
    if (!got) continue;
    const oldRent = b.rent || 0;
    const oldLord = sim.S.households[b.owner];
    vacate(sim, b, hh);
    nb.hh = hh.id; hh.house = nb.id; nb.name = hh.name; nb.rent = got.rent; nb.arrears = 0;
    HS(sim).n.move++;
    hh.crowd = 0; hh.comfort = Math.min(10, Math.max(0, hh.comfort || 0) + 1.5);
    const head = headOf(sim, hh), town = sim.town(hh.s);
    const lh = got.lord ? headOf(sim, got.lord) : nb.owner != null && nb.owner !== hh.id ? headOf(sim, sim.S.households[nb.owner]) : null;
    const how = got.how === 'buy' ? `${got.price}銅貨で買い取った` : `週${got.rent}銅貨で借りた（前の家賃は週${oldRent}銅貨）`;
    for (const p of mem) if (sim.ageOf(p) >= 6) sim.remember(p, `手狭になった借家を出て、寝台が${bedSlots(nb)}台ある広い家へ引っ越した。${how}`, { emo: 0.7, imp: 0.7, about: lh ? [lh.id] : [], k: 'house' });
    const oh = headOf(sim, oldLord);
    if (oh) sim.remember(oh, `借り手の${hh.name}が、手狭になったと言って広い家へ移っていった`, { emo: -0.1, imp: 0.35, k: 'rent' });
    if (lh && got.how === 'rent') sim.remember(lh, `${hh.name}に家を貸すことになった。家賃は週${got.rent}銅貨`, { emo: 0.3, imp: 0.4, k: 'rent' });
    if (head) sim.gossip(head, '広い家へ引っ越した', 0.4, sim.living().filter((q) => q.s === hh.s && q.hh !== hh.id).slice(0, 40), { congrat: '広い家に引っ越したんだってね', silent: true });
    sim.pushLog(`${hh.name}が、家族が増えて手狭になった借家から、${town.name}の広い家へ引っ越した。${how}。`, 'event', head ? [head.id] : [], nb.door);
    sim.chron(`${town.name}の${head ? sim.fullName(head) : hh.name}一家が、手狭な借家から広い家へ移った`, town.kingdom);
    return true;
  }
  return false;
}

// ---------- 大人になった子が独り立ちする ----------
function tryLeave(sim, hh, b, mem, empties) {
  const S = sim.S;
  const head = headOf(sim, hh);
  const kids = mem.filter((p) => p !== head && p.id !== head?.spouseId && sim.ageOf(p) >= 18 && p.jail == null && p.rank !== 'royal' && p.rank !== 'king'
    && (p.spouseId == null || S.people[p.spouseId]?.deathYear != null) && p.job && p.needs && !(p.children || []).some((id) => S.people[id]?.deathYear == null && S.people[id]?.hh === hh.id))
    .sort((a, c) => sim.ageOf(c) - sim.ageOf(a));
  const p = kids[0];
  if (!p) return false;
  const gift = Math.max(0, Math.min(40, hh.money * 0.2));
  const cash = gift + (p.purse || 0);
  const id = S.nextHh++;
  const nh = { id, members: [], house: null, s: hh.s, money: 0, food: 2, comfort: 0, name: `${p.family}家` };
  // 空き家（小さい順）→ 宿屋
  const cands = (empties[hh.s] || []).filter((x) => x.hh == null).sort((a, c) => (a.value || houseValue(sim, a)) - (c.value || houseValue(sim, c)));
  let got = null, nb = null;
  S.households[id] = nh;
  nh.money = gift; hh.money -= gift;
  for (const x of cands) { got = acquire(sim, nh, x, nh.money + (p.purse || 0)); if (got) { nb = x; break; } }
  if (!nb) {
    const inn = sim.townBuilding(sim.town(hh.s), 'tavern');
    if (!inn || cash < 30) { hh.money += nh.money; delete S.households[id]; S.nextHh--; return false; }
    nh.inn = true; nh.house = inn.id; nh.name = `${p.family}（宿住まい）`;
  } else { nb.hh = id; nh.house = nb.id; nb.name = nh.name; nb.rent = got.rent; nb.arrears = 0; }
  if (gift > 0) flow(sim, whoLabel(sim, hh.id), nh.name, gift, '独り立ちの持たせ金');
  if (p.inside === b.id) { p.inside = null; p.pos = { ...b.door }; p.path = []; }
  p.action = null;
  sim.moveTo(p, nh);
  HS(sim).n.leave++;
  hh.crowd = 0;
  const where = nb ? (got.how === 'buy' ? `${got.price}銅貨で空き家を買った` : `空き家を週${got.rent}銅貨で借りた`) : '宿屋に部屋を借りた';
  sim.remember(p, `家が手狭になったので、家を出て独り立ちした。${where}`, { emo: 0.5, imp: 0.85, about: head ? [head.id] : [], k: 'house' });
  for (const q of mem) if (q !== p && sim.ageOf(q) >= 8) sim.remember(q, `${sim.kinTerm(q, p) || ''}${p.given}が、家を出て独り立ちした`, { emo: 0.2, imp: 0.55, about: [p.id], k: 'house' });
  sim.gossip(p, '家を出て独り立ちした', 0.4, sim.living().filter((q) => q.s === p.s && q.hh !== hh.id && q.hh !== id).slice(0, 30), { congrat: '独り立ちしたんだってね。がんばってね', silent: true });
  sim.pushLog(`${sim.fullName(p)}が、手狭になった${hh.name}を出て独り立ちした（${where}）。`, 'event', [p.id], nb ? nb.door : p.pos);
  return true;
}

// 家計で足りなければ、家族の大人が財布から出し合う。足りる見込みがなければ何も動かさない
function pool(sim, hh, mem, need) {
  if (hh.money >= need) return true;
  const adults = mem.filter((p) => sim.ageOf(p) >= 14);
  const purses = adults.reduce((s, p) => s + Math.max(0, (p.purse || 0) - 3), 0);
  if (hh.money + purses < need) return false;
  let short = need - hh.money;
  for (const p of adults.sort((a, c) => (c.purse || 0) - (a.purse || 0))) {
    if (short <= 0) break;
    const x = Math.min(short, Math.max(0, (p.purse || 0) - 3));
    if (x <= 0) continue;
    p.purse -= x; hh.money += x; short -= x;
    sim.remember(p, `家の建て増しのために、財布から${Math.round(x)}銅貨を出した`, { emo: 0.2, imp: 0.35, k: 'house' });
  }
  return true;
}

// ---------- 毎日 ----------
export function housingDaily(sim) {
  const S = sim.S, R = sim.rng, Hs = HS(sim);
  if (!S.property) return;
  progressJobs(sim);
  const empties = {};
  for (const s of S.world.settlements) {
    if (s.tribal) continue;
    for (const id of s.buildings) { const x = sim.building(id); if (x && x.type === 'house' && x.hh == null && !Hs.jobs[x.id]) (empties[s.id] || (empties[s.id] = [])).push(x); }
  }
  let crowded = 0;
  for (const hh of Object.values(S.households)) {
    if (hh.inn || hh.street || hh.wander || hh.bandits || hh.royal || hh.tribal || hh.orphanage || hh.almshouse) continue;
    const b = hh.house != null ? sim.building(hh.house) : null;
    if (!b || b.type !== 'house' || b.hh !== hh.id) continue;
    const mem = alive(sim, hh), n = mem.length;
    const cap = bedCapacity(b, n);
    if (n <= cap) { if (hh.crowd) hh.crowd = 0; continue; }
    crowded++;
    hh.crowd = (hh.crowd || 0) + 1;
    hh.comfort = Math.max(-4, (hh.comfort || 0) - 0.3);   // 寝わらで寝る日が続くと、家族みんなの機嫌が下がる
    if (hh.crowd === 1 || hh.crowd % 20 === 0) for (const p of mem) if (sim.ageOf(p) >= 8) sim.remember(p, `家族が${n}人になり、寝台が足りない。${n - cap}人が床に寝わらを敷いて寝ている`, { emo: -0.35, imp: 0.4, k: 'crowded' });
    if (Hs.jobs[b.id] || hh.crowd < 2 || (hh.housingTry || 0) > sim.today) continue;
    hh.housingTry = sim.today + R.int(3, 7);
    const own = b.owner === hh.id || b.owner == null || !S.households[b.owner];
    const cost = estimate(sim, hh.s);
    if (own) {
      if ((b.floors || 1) < 2 && pool(sim, hh, mem, cost + 30) && startExpand(sim, hh, b, hh, false)) continue;
      tryLeave(sim, hh, b, mem, empties);
      continue;
    }
    if (tryMove(sim, hh, b, mem, empties)) continue;
    const lord = S.households[b.owner];
    const lh = headOf(sim, lord);
    const newRent = Math.max(4, Math.round((b.value || houseValue(sim, b)) * HOUSE_VALUE_2F / 28));
    const kind = lh ? 0.4 + lh.pers.A * 0.4 : 0.5;
    if ((b.floors || 1) < 2 && lord.money >= cost + 120 && hh.money >= newRent * 2 && R.chance(kind) && startExpand(sim, hh, b, lord, true)) continue;
    tryLeave(sim, hh, b, mem, empties);
  }
  Hs.crowded = crowded;
}
