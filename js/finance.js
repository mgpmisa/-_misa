// 借金と取り立て・酒場の賭け事
// 困った人は親族・友人（無利子か低利）→ 両替商・商人・金持ち（週5%前後）の順に借りる。
// 期日に返せなければ督促、取り立て、3回滞ると差し押さえか踏み倒し（恨み）。まれに夜逃げ。
// 貸し手・借り手が死ねば相続人が引き継ぐ。酒場ではサイコロやカードの賭けが立つ。
import { JOBS } from './data.js';
import { ITEMS, addItem, autoEquip, itemName, itemValue } from './items.js';
import { spendable, weeklyRent, headOf } from './property.js';
import { humanStats, markWanted } from './society.js';

const LENDER_JOBS = { changer: 0.05, merchant: 0.06, jeweler: 0.05 };
const CROOKS = new Set(['swindler', 'pickpocket', 'thief', 'smuggler', 'pirate']);
const WHY = { rent: '家賃', food: '食べ物代', gear: '装備の代金', tool: '仕事道具の代金', capital: '商売の元手', gamble: '賭けの負け', wedding: '婚礼の費用', funeral: '弔いの費用', land: '畑を買う元手', house: '家を借りる元手', debt: '別の借金の返済' };

// ---------- 状態 ----------
export function initFinance(sim) {
  const S = sim.S;
  S.loans = S.loans || [];
  S.finance = S.finance || { seq: 1, stats: { made: 0, repaid: 0, late: 0, seized: 0, defaulted: 0, fled: 0, forgiven: 0, inherited: 0, collect: 0, games: 0, cheats: 0, bigWins: 0, refused: 0 } };
  if (!S.finance.stats) S.finance.stats = {};
}
const st = (sim, k, n = 1) => { const s = sim.S.finance.stats; s[k] = (s[k] || 0) + n; };
const alive = (sim, id) => { const q = sim.S.people[id]; return q && q.deathYear == null ? q : null; };
const openLoans = (sim) => (sim.S.loans || []).filter((l) => l.state === 'open');
export const debtsOf = (sim, p) => openLoans(sim).filter((l) => l.to === p.id);
export const creditsOf = (sim, p) => openLoans(sim).filter((l) => l.from === p.id);
const owedTotal = (sim, p) => debtsOf(sim, p).reduce((s, l) => s + l.owed, 0);

// 使えるお金（家計は食べ物代として少し残す）
const cashOf = (sim, p, reserve = 15) => Math.max(0, (p.purse || 0) + Math.max(0, (sim.hh(p)?.money || 0) - reserve));
// 財布→家計の順に、実際に取れた分だけ取る（負にしない）
function take(sim, p, amt, reserve = 15) {
  let need = Math.max(0, amt);
  const a = Math.min(need, Math.max(0, p.purse || 0)); p.purse = (p.purse || 0) - a; need -= a;
  const hh = sim.hh(p);
  if (need > 0 && hh) { const b = Math.min(need, Math.max(0, hh.money - reserve)); hh.money -= b; need -= b; }
  return amt - need;
}
const r1 = (x) => Math.round(x);

// ---------- 借りる ----------
// 貸してくれる人を探す：好感度の高い親族・友人 → 両替商・商人・町の金持ち
function findLender(sim, p, amt) {
  const S = sim.S, R = sim.rng;
  const already = new Set(debtsOf(sim, p).map((l) => l.from));
  const friends = Object.entries(p.rel || {})
    .map(([id, r]) => ({ q: alive(sim, +id), r }))
    .filter(({ q, r }) => q && q.id !== p.id && q.s === p.s && q.hh !== p.hh && r.a > 30 && sim.ageOf(q) >= 18 && q.jail == null && !already.has(q.id) && cashOf(sim, q, 40) >= amt)
    .sort((x, y) => (sim.isKin(y.q, p) ? 40 : 0) + y.r.a - (sim.isKin(x.q, p) ? 40 : 0) - x.r.a);
  for (const { q, r } of friends.slice(0, 3)) {
    const back = sim.rel(q, p).a;
    if (back < 10) continue;
    const kin = sim.isKin(q, p);
    const ok = 0.25 + q.pers.A * 0.45 + back / 200 + (kin ? 0.2 : 0) - (p.badDebt ? 0.5 : 0);
    if (R.chance(ok)) return { q, rate: kin || back > 60 ? 0 : 0.02, kind: kin ? 'kin' : 'friend' };
  }
  if (p.badDebt && R.chance(0.8)) return null;
  if (debtsOf(sim, p).length >= 2) return null;
  const pros = sim.living().filter((q) => q.s === p.s && q.id !== p.id && q.hh !== p.hh && q.jail == null && !already.has(q.id) && sim.ageOf(q) >= 20 &&
    (LENDER_JOBS[q.job] != null || (sim.hh(q)?.money || 0) > 320) && cashOf(sim, q, 60) >= amt);
  if (!pros.length) return null;
  pros.sort((a, b) => (LENDER_JOBS[b.job] != null ? 1 : 0) - (LENDER_JOBS[a.job] != null ? 1 : 0));
  const q = pros[0];
  // 返せそうにない相手には貸さない（金貸しの目利き）
  const worth = (sim.hh(p)?.money || 0) + (p.purse || 0) + (sim.hh(p)?.land || 0) * 15 + (p.inv || []).reduce((s, it) => s + itemValue(it), 0);
  if (worth + 40 < amt * 0.6 && R.chance(0.5)) return { refuse: q };
  return { q, rate: LENDER_JOBS[q.job] ?? 0.04, kind: 'pro' };
}

export function borrow(sim, p, amt, why) {
  initFinance(sim);
  const S = sim.S, R = sim.rng;
  amt = Math.max(5, r1(amt));
  const f = findLender(sim, p, amt);
  if (!f || f.refuse) {
    if (f?.refuse) {
      st(sim, 'refused');
      sim.remember(p, `${f.refuse.given}に${amt}銅貨の借金を頼んだが、断られた`, { emo: -0.5, imp: 0.45, about: [f.refuse.id], k: 'debt' });
    }
    return null;
  }
  const q = f.q;
  const got = take(sim, q, amt, 40);
  if (got < amt * 0.8) { if (got > 0) { q.purse = (q.purse || 0) + got; } return null; }
  const days = amt < 25 ? 7 : amt < 70 ? 10 : 14;
  const owed = r1(got * (1 + f.rate * days / 7));
  const loan = { id: S.finance.seq++, from: q.id, to: p.id, amt: r1(got), owed, rate: f.rate, day: sim.today, due: sim.today + days, paid: 0, late: 0, why, kind: f.kind, state: 'open' };
  S.loans.push(loan);
  const hh = sim.hh(p);
  if (why === 'wedding' || why === 'funeral') {
    // 式の費用はそのまま教会（司祭の家）へ払われる
    const priest = sim.living().find((x) => x.job === 'priest' && x.s === p.s && sim.hh(x));
    if (priest) sim.hh(priest).money += got; else S.towns[p.s].fund += got;
  } else if (['rent', 'food', 'capital', 'land', 'house'].includes(why) && hh) hh.money += got; else p.purse = (p.purse || 0) + got;
  st(sim, 'made');
  const rateTxt = f.rate === 0 ? '利子なしで' : `週${Math.round(f.rate * 100)}分の利子で`;
  const whoTxt = f.kind === 'pro' ? `${JOBS[q.job]?.name || '金持ち'}の${q.given}` : q.given;
  sim.remember(p, `${WHY[why] || 'お金'}に困り、${whoTxt}から${r1(got)}銅貨を${rateTxt}借りた。期日は${days}日後`, { emo: -0.3, imp: 0.65, about: [q.id], k: 'debt' });
  sim.remember(q, `${p.given}に${r1(got)}銅貨を貸した（${WHY[why] || '入り用'}だそうだ）`, { emo: f.kind === 'pro' ? 0.2 : 0.1, imp: 0.5, about: [p.id], k: 'loan' });
  if (f.kind !== 'pro') sim.relMut(p, q).a += 6;
  sim.pushLog(`${sim.fullName(p)}が${WHY[why] || 'お金'}に困り、${whoTxt}から${r1(got)}銅貨を借りた。`, 'event', [p.id, q.id], p.pos);
  markDue(sim);
  return loan;
}

// 借金が必要になった人を探す（毎日）
function seekLoans(sim) {
  const S = sim.S, R = sim.rng;
  const weeklyCheck = new Set();
  // 家賃の滞納・食費不足（世帯の主が借りに行く）
  for (const b of S.world.buildings) {
    if (b.type !== 'house' || b.hh == null || !(b.arrears > 0) || b.owner === b.hh) continue;
    const hh = S.households[b.hh];
    if (!hh || hh.bandits) continue;
    const head = headOf(sim, hh);
    if (!head || sim.ageOf(head) < 16 || head.jail != null || weeklyCheck.has(head.id)) continue;
    weeklyCheck.add(head.id);
    if (debtsOf(sim, head).some((l) => l.why === 'rent')) continue;
    const need = (b.rent || weeklyRent(sim, b)) * (b.arrears + 1) - Math.max(0, hh.money);
    if (need > 3 && R.chance(0.35 + b.arrears * 0.2)) borrow(sim, head, need, 'rent');
  }
  for (const hh of Object.values(S.households)) {
    if (hh.bandits || hh.royal || hh.wander) continue;
    const head = headOf(sim, hh);
    if (!head || sim.ageOf(head) < 16 || head.jail != null || weeklyCheck.has(head.id)) continue;
    const mine = debtsOf(sim, head);
    if (mine.length >= 2) continue;
    const has = (w) => mine.some((l) => l.why === w);
    const mems = hh.members.map((id) => alive(sim, id)).filter(Boolean);
    const recent = (k, d, own) => mems.some((q) => q.memories?.some((m) => m.k === k && m.src === 'self' && sim.today - m.t <= d && (!own || S.people[m.about?.[0]]?.hh === hh.id)));
    let need = 0, why = null;
    // 食べ物代：家計が底をつきかけ、食べ物も少ない
    if (hh.money < 18 && hh.food < mems.length * 2 && (head.purse || 0) < 10 && !has('food') && R.chance(0.15)) { need = 10 + mems.length * 5; why = 'food'; }
    // 弔いの費用：身内を亡くしたばかり
    else if (recent('death', 1, true) && hh.money < 70 && !has('funeral') && R.chance(0.35)) { need = R.int(20, 40); why = 'funeral'; }
    // 婚礼の費用：婚約したばかり
    else if (recent('engage', 3) && hh.money < 90 && !has('wedding') && R.chance(0.4)) { need = R.int(30, 60); why = 'wedding'; }
    // 家を借りる元手：宿なし・宿住まい
    else if ((hh.street || hh.inn) && !has('house') && R.chance(0.2)) { need = R.int(20, 45); why = 'house'; }
    // 畑を買う元手：小作が自作農になりたい（あと少しで届く）
    else if (!hh.land && hh.money >= 150 && hh.money < 260 && mems.some((q) => q.job === 'farmer') && head.values.ambition > 0.5 && !has('land') && R.chance(0.1)) { need = 265 - hh.money; why = 'land'; }
    if (why) { weeklyCheck.add(head.id); borrow(sim, head, need, why); }
  }
  // 一人ひとり：装備の代金・商売の元手・賭けの負け
  for (const p of sim.living()) {
    if (p.jail != null || weeklyCheck.has(p.id) || sim.ageOf(p) < 16) continue;
    const J = JOBS[p.job];
    if (J?.combat && R.chance(0.1) && !debtsOf(sim, p).length) {
      const shop = sim.S.towns[p.s]?.shop || [];
      const up = shop.filter((it) => sim.isUpgrade(p, it)).map((it) => Math.round(itemValue(it) * 1.2)).sort((a, b) => a - b)[0];
      const have = spendable(sim, p) - 10;
      if (up && up > have && up - have < 90 && p.values.ambition > 0.35) borrow(sim, p, up - have + 5, 'gear');
    } else if (J && !J.combat && sim.ageOf(p) < 60 && !p.eq?.tool && (sim.hh(p)?.money || 0) <= 25 && R.chance(0.1) && !debtsOf(sim, p).length) {
      const shop = sim.S.towns[p.s]?.shop || [];
      const tool = shop.find((it) => ITEMS[it.id].type === 'tool' && ITEMS[it.id].jobs?.includes(p.job));
      if (tool) borrow(sim, p, Math.round(itemValue(tool) * 1.2) + 5, 'tool');
    } else if ((p.job === 'merchant' || J?.goods) && (sim.hh(p)?.money || 0) < 90 && p.values.ambition > 0.55 && R.chance(p.job === 'merchant' ? 0.08 : 0.015) && !debtsOf(sim, p).length) {
      borrow(sim, p, R.int(40, 90), 'capital');
    } else if (p.gamble && p.gamble.net < -10 && (p.purse || 0) < 5 && p.pers.C < 0.6 && R.chance(0.25 + p.pers.N * 0.2) && debtsOf(sim, p).length < 2) {
      borrow(sim, p, R.int(10, 30), 'gamble');
    }
  }
}

// ---------- 返す・督促・差し押さえ ----------
function repay(sim, l, amt, early) {
  const S = sim.S;
  const p = alive(sim, l.to), q = alive(sim, l.from);
  if (!p || !q) return;
  const got = take(sim, p, Math.min(amt, l.owed), 10);
  if (got <= 0) return 0;
  l.owed -= got; l.paid += got;
  // 貸し手は家計に入れる（金貸しは財布）
  if (LENDER_JOBS[q.job] != null || !sim.hh(q)) q.purse = (q.purse || 0) + got; else sim.hh(q).money += got;
  if (l.owed <= 0.5) {
    l.owed = 0; l.state = 'repaid'; l.closed = sim.today;
    st(sim, 'repaid');
    const warm = l.kind !== 'pro' || l.late === 0;
    sim.remember(p, `${q.given}に借りていたお金を${l.late ? 'ようやく' : 'きちんと'}返し終えた。${l.kind === 'pro' ? '肩の荷が下りた' : 'ありがたかった'}`, { emo: 0.6, imp: 0.55, about: [q.id], k: 'debt' });
    sim.remember(q, `${p.given}が貸したお金を${l.late ? '遅れながらも' : '期日どおりに'}返してくれた`, { emo: 0.4, imp: 0.4, about: [p.id], k: 'loan' });
    if (warm) { sim.relMut(p, q).a += l.kind === 'pro' ? 3 : 10; sim.relMut(q, p).a += l.late ? 2 : 8; }
    if (early || !l.late) p.needs.esteem = Math.min(100, p.needs.esteem + 10);
    if (l.paid >= 40) sim.pushLog(`${sim.fullName(p)}が${q.given}に借りていた${r1(l.paid)}銅貨を返し終えた。`, 'event', [p.id, q.id], p.pos);
  }
  return got;
}

function dueCheck(sim) {
  const S = sim.S, R = sim.rng;
  for (const l of S.loans) {
    if (l.state !== 'open') continue;
    const p = alive(sim, l.to), q = alive(sim, l.from);
    if (!p || !q) continue;
    // 余裕があれば早めに返す
    if (sim.today < l.due) {
      if (sim.today - l.day >= 5 && l.why !== 'land' && cashOf(sim, p) > l.owed + 50 && R.chance(0.25 + p.pers.C * 0.3)) repay(sim, l, l.owed, true);
      continue;
    }
    const cash = cashOf(sim, p);
    if (cash >= l.owed) { repay(sim, l, l.owed); continue; }
    // 一部だけでも返す
    if (cash > l.owed * 0.3 && p.pers.C > 0.3) repay(sim, l, cash * 0.8);
    if (l.state !== 'open') continue;
    l.late++; l.due = sim.today + 5;
    st(sim, 'late');
    // 遅れた分の利息（金貸しだけ）
    if (l.kind === 'pro') l.owed = r1(l.owed * (1 + l.rate));
    sim.remember(p, `${q.given}への借金${r1(l.owed)}銅貨を期日に返せなかった（${l.late}回目）`, { emo: -0.6 - l.late * 0.1, imp: 0.6, about: [q.id], k: 'debt' });
    sim.remember(q, `${p.given}が期日になっても借金${r1(l.owed)}銅貨を返さない`, { emo: -0.4, imp: 0.5, about: [p.id], k: 'loan' });
    sim.relMut(q, p).a -= 4 + l.late * 3;
    if (l.late >= 2 && flee(sim, l, p, q)) continue;
    if (l.late >= 3) seize(sim, l, p, q);
  }
  markDue(sim);
}

// 3回滞った：差し押さえ（家畜・持ち物）、足りなければ踏み倒し扱いで恨み
function seize(sim, l, p, q) {
  const S = sim.S, R = sim.rng;
  // 情け深い身内・友人は帳消しにしてやることもある
  if (l.kind !== 'pro' && q.pers.A > 0.7 && R.chance(0.5)) {
    l.state = 'forgiven'; l.closed = sim.today; st(sim, 'forgiven');
    sim.remember(q, `どうしても返せない${p.given}の借金${r1(l.owed)}銅貨を、帳消しにしてやった`, { emo: 0.2, imp: 0.6, about: [p.id], k: 'loan' });
    sim.remember(p, `${q.given}が、返せなかった借金を帳消しにしてくれた。一生の恩だ`, { emo: 0.8, imp: 0.85, about: [q.id], k: 'debt' });
    sim.relMut(p, q).a += 25;
    sim.pushLog(`${sim.fullName(q)}が、${p.given}の借金${r1(l.owed)}銅貨を帳消しにしてやった。`, 'event', [q.id, p.id], q.pos);
    return;
  }
  const hh = sim.hh(p), qhh = sim.hh(q);
  const taken = [];
  let need = l.owed;
  // 家畜
  if (hh && qhh) for (const c of Object.values(S.creatures)) {
    if (need <= 0) break;
    if (c.keeper !== hh.id || !(c.hp > 0)) continue;
    c.keeper = qhh.id; need -= 30; taken.push(c.name || '家畜');
  }
  // 持ち物（素材と消耗品以外。値打ちの高いものから）
  const goods = (p.inv || []).filter((it) => !['consumable'].includes(ITEMS[it.id]?.type)).sort((a, b) => itemValue(b) - itemValue(a));
  for (const it of goods) {
    if (need <= 0) break;
    const v = itemValue(it) * 0.6;
    if (itemValue(it) < 10) continue;
    p.inv.splice(p.inv.indexOf(it), 1);
    for (const k of Object.keys(p.eq || {})) if (p.eq[k] === it) p.eq[k] = null;
    addItem(q, it);
    need -= v; taken.push(itemName(it));
  }
  if (taken.length) {
    autoEquip(p); autoEquip(q);
    Object.assign(p, humanStats(sim, p)); Object.assign(q, humanStats(sim, q));
    st(sim, 'seized');
    const list = taken.slice(0, 3).join('、') + (taken.length > 3 ? 'など' : '');
    sim.remember(p, `借金のかたに、${q.given}に${list}を差し押さえられた`, { emo: -0.85, imp: 0.85, about: [q.id], k: 'debt' });
    sim.remember(q, `返さない${p.given}から、借金のかたに${list}を取り上げた`, { emo: 0.1, imp: 0.6, about: [p.id], k: 'loan' });
    sim.relMut(p, q).a -= 25;
    sim.pushLog(`${sim.fullName(q)}が、借金を返さない${p.given}から${list}を差し押さえた。`, 'event', [q.id, p.id], p.pos);
    sim.gossip(p, `借金のかたに${taken[0]}を取られた`, -0.4, sim.living().filter((x) => x.s === p.s && x.id !== q.id && R.chance(0.15)), { silent: true });
  }
  if (need <= 0) { l.owed = 0; l.state = 'seized'; l.closed = sim.today; return; }
  if (taken.length) { l.owed = r1(need); l.late = 1; l.due = sim.today + 5; return; }
  // 取れるものが何もない：踏み倒し。恨みと不仲が残る
  l.state = 'defaulted'; l.closed = sim.today; st(sim, 'defaulted');
  p.badDebt = true;
  sim.relMut(q, p).a -= 40; sim.relMut(p, q).a -= 15;
  sim.remember(q, `${p.given}に貸した${r1(l.owed)}銅貨は、とうとう戻らなかった。あいつは許さない`, { emo: -0.8, imp: 0.8, about: [p.id], k: 'loan' });
  sim.remember(p, `${q.given}への借金を返せないまま、顔を合わせられなくなった`, { emo: -0.7, imp: 0.75, about: [q.id], k: 'debt' });
  sim.gossip(p, `${q.given}からの借金を踏み倒したらしい`, -0.6, sim.living().filter((x) => x.s === p.s && x.id !== q.id && R.chance(0.25)), { silent: true });
  sim.pushLog(`${sim.fullName(p)}が${q.given}からの借金${r1(l.owed)}銅貨を踏み倒した。${q.given}はかんかんだ。`, 'event', [p.id, q.id], p.pos);
}

// 借金苦で夜逃げ：一家で別の町へ移る（持ち家は貸し手のものに）
function flee(sim, l, p, q) {
  const S = sim.S, R = sim.rng;
  const hh = sim.hh(p);
  if (!hh || hh.royal || hh.bandits || hh.wander || ['king', 'royal', 'noble', 'knight'].includes(p.rank)) return false;
  if (hh.members.some((id) => ['elder', 'priest', 'king'].includes(S.people[id]?.job))) return false;
  const total = owedTotal(sim, p);
  if (total < 25 || !R.chance(0.04 + p.pers.N * 0.08 + (total > 100 ? 0.06 : 0))) return false;
  const here = sim.townOf(p);
  const dests = S.world.settlements.filter((s) => s.id !== p.s && !S.towns[s.id]?.occupied && Math.hypot(s.x - here.x, s.z - here.z) < 80);
  const dest = R.pick(dests);
  if (!dest) return false;
  const mem = hh.members.map((id) => alive(sim, id)).filter(Boolean);
  const b = hh.house != null ? sim.building(hh.house) : null;
  if (b && b.type === 'house') {
    if (b.owner === hh.id && sim.hh(q)) { b.owner = q.hh; }
    b.hh = null; b.name = '空き家'; b.rent = 0; b.arrears = 0;
    sim.events.push({ type: 'building', id: b.id });
  }
  hh.house = null; hh.inn = false; hh.street = true; hh.s = dest.id;
  for (const x of mem) {
    if (x.inside != null) { const ib = sim.building(x.inside); x.inside = null; if (ib) x.pos = { ...ib.door }; }
    x.action = null; x.path = null; x.s = dest.id;
    x.mission = { type: 'travel', x: dest.x, z: dest.z, until: sim.S.t + 1440 };
    sim.remember(x, `借金から逃れるため、夜の闇にまぎれて${here.name}を捨て、${dest.name}へ逃げた`, { emo: -0.7, imp: 0.95, k: 'flee' });
  }
  for (const d of debtsOf(sim, p)) { d.state = 'fled'; d.closed = sim.today; const c = alive(sim, d.from); if (c) { sim.relMut(c, p).a -= 40; sim.remember(c, `${p.given}の一家が借金を踏み倒して夜逃げした`, { emo: -0.8, imp: 0.8, about: [p.id], k: 'loan' }); } }
  p.badDebt = true;
  st(sim, 'fled');
  sim.gossip(p, '借金を抱えて一家で夜逃げした', -0.5, sim.living().filter((x) => x.s === here.id && R.chance(0.3)), { silent: true });
  sim.pushLog(`${hh.name}が借金を抱えきれず、夜のうちに${here.name}から${dest.name}へ逃げ出した。`, 'event', mem.map((x) => x.id), p.pos);
  sim.dirty();
  return true;
}

// ---------- 死んだとき：債権と債務の相続 ----------
function settleDead(sim) {
  const S = sim.S, R = sim.rng;
  for (const l of S.loans) {
    if (l.state !== 'open') continue;
    const lender = S.people[l.from], debtor = S.people[l.to];
    // 貸し手が死んだ：証文は相続人へ
    if (lender && lender.deathYear != null) {
      const heir = alive(sim, lender.estate?.to);
      if (!heir || heir.id === l.to || heir.hh === debtor?.hh) {
        l.state = 'void'; l.closed = sim.today;
        if (debtor && debtor.deathYear == null) sim.remember(debtor, `貸し主の${lender.given}が亡くなり、借金は立ち消えになった`, { emo: 0.2, imp: 0.5, about: [lender.id], k: 'debt' });
      } else {
        l.from = heir.id; st(sim, 'inherited');
        sim.remember(heir, `亡き${sim.kinTerm(heir, lender) || lender.given}が${debtor?.given || '誰か'}に貸した${r1(l.owed)}銅貨の証文を受け継いだ`, { emo: 0.1, imp: 0.55, about: [lender.id], k: 'loan' });
        if (debtor && debtor.deathYear == null) sim.remember(debtor, `${lender.given}への借金は、これからは${heir.given}に返すことになった`, { emo: -0.1, imp: 0.4, about: [heir.id], k: 'debt' });
      }
      continue;
    }
    // 借り手が死んだ：相続人が背負うか、帳消しにしてもらうか
    if (debtor && debtor.deathYear != null) {
      const heir = alive(sim, debtor.estate?.to);
      const q = alive(sim, l.from);
      if (!q) { l.state = 'void'; l.closed = sim.today; continue; }
      if (heir && heir.id !== q.id && sim.ageOf(heir) >= 14 && (heir.pers.A > 0.5 || heir.values.family > 0.6 || cashOf(sim, heir) > l.owed * 1.5)) {
        l.to = heir.id; l.due = Math.max(l.due, sim.today + 14); l.late = 0; st(sim, 'inherited');
        sim.remember(heir, `亡き${sim.kinTerm(heir, debtor) || debtor.given}が${q.given}に借りていた${r1(l.owed)}銅貨を、代わりに返すことにした`, { emo: -0.4, imp: 0.7, about: [debtor.id, q.id], k: 'debt' });
        sim.remember(q, `亡くなった${debtor.given}の借金は、${heir.given}が返すと約束してくれた`, { emo: 0.2, imp: 0.4, about: [heir.id], k: 'loan' });
        sim.relMut(q, heir).a += 5;
      } else {
        l.state = 'forgiven'; l.closed = sim.today; st(sim, 'forgiven');
        const kind = q.pers.A > 0.6 || sim.isKin(q, debtor);
        sim.remember(q, kind ? `亡くなった${debtor.given}の借金${r1(l.owed)}銅貨は、香典がわりに帳消しにした` : `${debtor.given}が死んで、貸した${r1(l.owed)}銅貨は戻らなくなった`, { emo: kind ? 0 : -0.5, imp: 0.55, about: [debtor.id], k: 'loan' });
        if (heir) {
          sim.remember(heir, kind ? `${q.given}が、亡き${sim.kinTerm(heir, debtor) || debtor.given}の借金を帳消しにしてくれた` : `亡き${sim.kinTerm(heir, debtor) || debtor.given}の借金は、うちには返せないと${q.given}に断った`, { emo: kind ? 0.6 : -0.3, imp: 0.6, about: [q.id], k: 'debt' });
          if (kind) sim.relMut(heir, q).a += 12; else sim.relMut(q, heir).a -= 10;
        }
      }
    }
  }
}

// ---------- 取り立て（貸し手が家まで出向く） ----------
// 期日を過ぎた借金がある貸し手の一覧（再計算は日ごと・変化時）
function markDue(sim) {
  const m = new Map();
  for (const l of sim.S.loans || []) if (l.state === 'open' && l.late >= 1 && l.visit !== sim.today) m.set(l.from, l);
  sim._finDue = m;
}

// decide の中で呼ぶ：取り立てに行く候補を足す
export function financeCandidates(sim, p, add) {
  if (!sim.S.loans) return;
  if (!sim._finDue) markDue(sim);
  const l = sim._finDue.get(p.id);
  if (!l || l.state !== 'open' || l.visit === sim.today) return;
  const h = sim.hour();
  if (!((h >= 6 && h < 8) || (h >= 17.5 && h < 20.5))) return; // 家にいそうな朝夕に訪ねる
  const b = alive(sim, l.to);
  const hh = b && sim.hh(b);
  if (!b || !hh || hh.house == null || b.s !== p.s) return;
  const home = sim.building(hh.house);
  if (!home) return;
  add(5 + (1 - p.pers.A) * 2 + l.late * 0.8 + (l.kind === 'pro' ? 1 : 0), 'collect', { x: home.door.x, z: home.door.z, bld: home.id }, 20, { friend: b.id });
}

// arrive の中で呼ぶ：着いたら取り立てる
export function financeArrive(sim, p) {
  const a = p.action;
  if (!a || a.type !== 'collect') return;
  a.until = sim.S.t + 20;
  const l = (sim.S.loans || []).find((x) => x.state === 'open' && x.from === p.id && x.to === a.friend);
  const b = alive(sim, a.friend);
  if (!l || !b) return;
  l.visit = sim.today;
  if (sim._finDue) sim._finDue.delete(p.id);
  st(sim, 'collect');
  const R = sim.rng;
  const home = b.hh != null && sim.hh(b)?.house;
  const there = b.inside != null && b.inside === home;
  const pos = p.pos;
  if (!there) {
    const fam = sim.hh(b)?.members.map((id) => alive(sim, id)).filter((x) => x && x.inside === home && x.id !== b.id) || [];
    for (const x of fam) sim.remember(x, `${p.given}が${b.given}の借金を取り立てに家まで来た`, { emo: -0.5, imp: 0.5, about: [p.id, b.id], k: 'debt' });
    sim.remember(b, `${p.given}が留守中に借金の取り立てに来たらしい`, { emo: -0.5, imp: 0.55, about: [p.id], k: 'debt' });
    sim.remember(p, `${b.given}の家まで取り立てに行ったが、留守だった`, { emo: -0.3, imp: 0.35, about: [b.id], k: 'loan' });
    return;
  }
  const say = (who, txt) => sim.pushLog(`${who.given}「${txt}」`, 'talk', [p.id, b.id], pos);
  const hard = p.pers.A < 0.4 || l.kind === 'pro';
  say(p, hard ? R.pick([`${b.given}、期日はとっくに過ぎてるぞ。${r1(l.owed)}銅貨、耳をそろえて返してもらおう`, `いつまで待たせる気だ。今日こそ返してもらう`, `${b.given}、貸した金の話をしに来た`]) : R.pick([`${b.given}、言いにくいんだが……貸したお金、どうなってる？`, `責めるつもりはないけど、そろそろ返してもらえると助かる`]));
  const cash = cashOf(sim, b);
  if (cash >= l.owed * 0.4) {
    const got = repay(sim, l, Math.min(cash * 0.8, l.owed));
    say(b, l.state === 'open' ? `……今はこれだけしかない。${r1(got)}銅貨、受け取ってくれ` : 'わかった、待たせて悪かった。これで全部だ');
    sim.remember(b, `取り立てに来た${p.given}に${r1(got)}銅貨を渡した`, { emo: -0.3, imp: 0.45, about: [p.id], k: 'debt' });
    if (l.state === 'open') { l.late = Math.max(1, l.late - 1); }
  } else {
    say(b, R.pick(['頼む、もう少しだけ待ってくれ……', '今は一枚もないんだ。本当なんだ', '来週には必ず返す。約束する']));
    sim.remember(b, `${p.given}が家まで借金の取り立てに来た。${hard ? '怒鳴られた' : '合わせる顔がない'}`, { emo: -0.7, imp: 0.65, about: [p.id], k: 'debt' });
    sim.remember(p, `${b.given}の家に取り立てに行ったが、返してもらえなかった`, { emo: -0.5, imp: 0.5, about: [b.id], k: 'loan' });
    sim.relMut(b, p).a -= hard ? 6 : 2; sim.relMut(p, b).a -= 4;
    if (hard) sim.gossip(b, `${p.given}に借金を取り立てられていた`, -0.3, sim.nearby(b, 6), { silent: true });
  }
}

// ---------- 酒場の賭け事（時間ごと） ----------
const GAMES = [
  { name: 'サイコロ', verb: 'サイコロ賭博' },
  { name: 'カード', verb: 'カード賭博' },
  { name: '骨札', verb: '骨札の賭け' },
];
function joinChance(sim, p) {
  const n = p.needs;
  let c = 0.3 + (p.pers.N - 0.5) * 0.35 + (0.5 - p.pers.C) * 0.45 + (100 - n.pleasure) / 350 + (100 - n.sloth) / 500 + (p.gamble?.taste || 0);
  if (CROOKS.has(p.job)) c += 0.45;
  if (p.gamble && p.gamble.net < -15) c += p.pers.N > 0.6 ? 0.15 : -0.1; // 取り返したい／こりた
  if (p.rank === 'king' || p.rank === 'royal' || p.job === 'priest') c -= 0.4;
  return Math.max(0, Math.min(0.85, c));
}

export function financeHourly(sim) {
  const h = Math.floor(sim.hour());
  if (h < 18 || h > 23) return;
  initFinance(sim);
  const S = sim.S, R = sim.rng;
  const groups = new Map();
  for (const p of sim.living()) {
    const a = p.action;
    if (!a || a.type !== 'tavern' || a.phase !== 'do' || p.inside == null || p.talk) continue;
    if (sim.ageOf(p) < 16 || p.jail != null) continue;
    let g = groups.get(p.inside); if (!g) groups.set(p.inside, g = []); g.push(p);
  }
  for (const [bid, ppl] of groups) {
    if (ppl.length < 2) continue;
    const players = R.shuffle(ppl.filter((p) => (p.purse || 0) + ((p.pers.C < 0.3 && p.pers.N > 0.6) ? Math.max(0, (sim.hh(p)?.money || 0) - 20) : 0) >= 2 && R.chance(joinChance(sim, p)))).slice(0, 5);
    if (players.length < 2) continue;
    playGame(sim, players, sim.building(bid));
  }
}

function playGame(sim, players, bld) {
  const R = sim.rng, S = sim.S;
  st(sim, 'games');
  const game = R.pick(GAMES);
  const afford = (p) => (p.purse || 0) + ((p.pers.C < 0.3 && p.pers.N > 0.6) ? Math.max(0, (sim.hh(p)?.money || 0) - 20) : 0);
  const stake = Math.max(1, Math.min(20, Math.floor(Math.min(...players.map(afford)) * R.range(0.15, 0.4))));
  const net = new Map(players.map((p) => [p.id, 0]));
  const rounds = R.int(2, 5);
  const cheat = players.find((p) => p.job === 'swindler' || (CROOKS.has(p.job) && p.pers.A < 0.35));
  let caught = null;
  for (let r = 0; r < rounds; r++) {
    let pot = 0;
    const inRound = players.filter((p) => afford(p) >= stake);
    if (inRound.length < 2) break;
    for (const p of inRound) { pot += take(sim, p, stake, 20); net.set(p.id, net.get(p.id) - stake); }
    const weights = inRound.map((p) => (p === cheat ? 2.6 : 1) * (0.85 + (p.skill?.gamble || 0)));
    let x = R.next() * weights.reduce((s, w) => s + w, 0), win = inRound[0];
    for (let i = 0; i < inRound.length; i++) { x -= weights[i]; if (x <= 0) { win = inRound[i]; break; } }
    win.purse = (win.purse || 0) + pot; net.set(win.id, net.get(win.id) + pot);
    if (cheat && !caught && R.chance(0.05 * (inRound.length - 1))) { caught = cheat; break; }
  }
  const pos = bld?.door || players[0].pos;
  const ids = players.map((p) => p.id);
  const names = players.map((p) => p.given).join('、');
  // いかさまがばれた：勝ち分を吐き出させ、皆に嫌われる
  if (caught) {
    st(sim, 'cheats');
    const gain = Math.max(0, net.get(caught.id));
    const back = Math.min(gain, Math.max(0, caught.purse || 0));
    caught.purse -= back;
    const losers = players.filter((p) => p !== caught && net.get(p.id) < 0);
    const tot = losers.reduce((s, p) => s - net.get(p.id), 0) || 1;
    for (const p of losers) { const share = back * (-net.get(p.id)) / tot; p.purse = (p.purse || 0) + share; net.set(p.id, net.get(p.id) + share); }
    net.set(caught.id, net.get(caught.id) - back);
    for (const p of players) if (p !== caught) {
      sim.relMut(p, caught).a -= 30;
      sim.remember(p, `酒場の${game.name}で${caught.given}のいかさまを見破った`, { emo: -0.6, imp: 0.65, about: [caught.id], k: 'theft' });
    }
    sim.remember(caught, `酒場の${game.name}でいかさまがばれ、袋だたきにされかけた`, { emo: -0.7, imp: 0.7, k: 'crime' });
    sim.pushLog(`${bld?.name || '酒場'}の${game.verb}で、${sim.fullName(caught)}のいかさまがばれた。店じゅうが大騒ぎだ。`, 'event', ids, pos);
    sim.gossip(caught, `酒場の${game.name}でいかさまをしていた`, -0.6, sim.living().filter((q) => q.inside === bld?.id && q.id !== caught.id), { silent: true });
    if (R.chance(0.25)) markWanted(sim, caught, 'いかさま賭博', 2);
  }
  let best = null;
  for (const p of players) {
    const d = r1(net.get(p.id));
    const g = p.gamble || (p.gamble = { net: 0, games: 0, taste: 0 });
    g.net += d; g.games++; g.last = sim.today;
    g.taste = Math.max(-0.3, Math.min(0.3, g.taste + (d > 0 ? 0.03 : d < 0 ? -0.01 : 0)));
    p.needs.pleasure = Math.min(100, p.needs.pleasure + (d >= 0 ? 12 : 5));
    if (d >= 8) { sim.remember(p, `酒場の${game.name}で${d}銅貨勝った`, { emo: 0.55, imp: 0.4, k: 'gamble' }); p.needs.esteem = Math.min(100, p.needs.esteem + 8); }
    else if (d <= -8) sim.remember(p, `酒場の${game.name}で${-d}銅貨すった`, { emo: -0.5, imp: 0.45, k: 'gamble' });
    if (g.net <= -40 && !p.memories.some((m) => m.k === 'gamble' && m.txt.includes('負けが込') && sim.today - m.t < 5)) sim.remember(p, '賭けの負けが込んできた。次こそ取り返さないと', { emo: -0.7, imp: 0.6, k: 'gamble' });
    if (!best || d > r1(net.get(best.id))) best = p;
  }
  const bw = r1(net.get(best.id));
  if (bw >= 30 && best !== caught) {
    st(sim, 'bigWins');
    sim.gossip(best, `酒場の${game.name}で${bw}銅貨の大勝ちをした`, 0.3, sim.living().filter((q) => q.s === best.s && (q.inside === bld?.id || sim.rng.chance(0.08))), { congrat: '賭けで大勝ちしたんだって？' , silent: true });
    sim.pushLog(`${sim.fullName(best)}が${bld?.name || '酒場'}の${game.name}で${bw}銅貨の大勝ちをした！`, 'event', ids, pos);
  } else if (!caught && stake * players.length >= 12) {
    sim.pushLog(`${bld?.name || '酒場'}で${names}が${game.verb}に興じ、${best.given}が${Math.max(0, bw)}銅貨をせしめた。`, 'event', ids, pos);
  }
  if (!caught && R.chance(0.35)) {
    const loser = players.reduce((a, b) => (net.get(a.id) < net.get(b.id) ? a : b));
    sim.pushLog(`${best.given}「${R.pick(['よっしゃ、今夜はツイてる！', 'また勝っちまったな', '悪いな、いただきだ'])}」`, 'talk', [best.id, loser.id], pos);
    if (loser !== best) sim.pushLog(`${loser.given}「${R.pick(['くそっ、もう一勝負だ！', '今日はツキがない……', 'こんなはずじゃ……'])}」`, 'talk', [loser.id, best.id], pos);
  }
}

// ---------- 毎日 ----------
export function financeDaily(sim) {
  initFinance(sim);
  const S = sim.S;
  settleDead(sim);
  dueCheck(sim);
  seekLoans(sim);
  // 賭けの勝ち負けの記憶は少しずつ薄れる
  for (const p of sim.living()) if (p.gamble) { p.gamble.net *= 0.9; if (Math.abs(p.gamble.net) < 1 && sim.today - (p.gamble.last || 0) > 20) delete p.gamble; }
  // 片がついた証文は30日で捨てる
  if (S.loans.length > 50) S.loans = S.loans.filter((l) => l.state === 'open' || sim.today - (l.closed ?? sim.today) < 30);
  markDue(sim);
}

// ---------- 心の声・会話・詳細欄 ----------
export function financeThoughts(sim, p) {
  if (!sim.S.loans) return [];
  const out = [];
  for (const l of debtsOf(sim, p)) {
    const q = sim.S.people[l.from]; if (!q) continue;
    const left = l.due - sim.today;
    if (l.late) out.push(`${q.given}への借金、もう${l.late}回も待ってもらってる……。`, 'このままじゃ、何もかも取り上げられる……。');
    else if (left <= 3) out.push('借金の期日が近い……。', `あと${Math.max(0, left)}日で${q.given}に${r1(l.owed)}銅貨を返さないと。`);
    else out.push(`${q.given}に借りた${r1(l.owed)}銅貨、早く返さないとな。`);
  }
  for (const l of creditsOf(sim, p)) {
    const b = sim.S.people[l.to]; if (!b) continue;
    out.push(l.late ? `${b.given}め、いつになったら返すつもりだ。` : `${b.given}には金を貸してる。ちゃんと返してくれるだろうな。`);
  }
  if (p.gamble) {
    if (p.gamble.net < -20) out.push('次こそは取り返せるはずだ……。', 'あのとき降りておけば……。');
    else if (p.gamble.net > 20) out.push('今夜もツキが来てる気がする。');
  }
  if (p.badDebt) out.push('借金のことで、町の人の目が冷たい気がする。');
  return out;
}

export function financeTopicWeight(sim, A, B) {
  if (!sim.S.loans) return 0;
  if (openLoans(sim).some((l) => (l.from === A.id && l.to === B.id) || (l.from === B.id && l.to === A.id))) return 2.5;
  if (debtsOf(sim, A).length) return 1.2;
  if (A.gamble && Math.abs(A.gamble.net) > 12 && sim.today - (A.gamble.last || 0) < 4) return 1.2;
  return 0;
}

// speech.js の話題として使う（v は Voice）
export function financeTopic(sim, A, B, v) {
  const R = sim.rng;
  const lent = openLoans(sim).find((l) => l.from === A.id && l.to === B.id);
  if (lent) {
    if (lent.late) return { kind: 'complain', text: v.s(`貸した${r1(lent.owed)}銅貨、いつになったら返してもらえるの${v.style === 'polite' ? 'でしょう' : 'か'}`, 'raw') + '？', sentiment: -0.5 };
    return { kind: 'debt', text: v.s(`貸した${r1(lent.owed)}銅貨、期日までにちゃんと返してもらう`, 'v'), sentiment: -0.1 };
  }
  const owe = openLoans(sim).find((l) => l.to === A.id && l.from === B.id);
  if (owe) return { kind: 'complain', text: v.r({ polite: 'お借りしたお金、もう少しだけ待っていただけませんか。', plain: '借りたお金、もう少しだけ待ってくれないか。', rough: '借りた金、もうちょい待ってくれ。頼む！', elder: '借りた金、もう少し待ってくれんかのう。', child: '借りたお金、もうちょっと待って……。', noble_f: 'お借りしたお金、もう少しお待ちいただけて？' }), sentiment: -0.4 };
  const my = debtsOf(sim, A)[0];
  if (my) {
    const q = sim.S.people[my.from];
    return { kind: 'complain', text: v.s(R.pick([`借金の期日が近くて、夜も眠れない`, `${q?.given || '人'}に借りた${r1(my.owed)}銅貨が、まだ返せていない`, 'お金を借りるって、つらい']), 'v'), sentiment: -0.6 };
  }
  if (A.gamble && A.gamble.net > 12) return { kind: 'boast', text: v.s(`ゆうべ酒場の賭けで${r1(A.gamble.net)}銅貨も勝った`, 'v'), sentiment: 0.6 };
  if (A.gamble && A.gamble.net < -12) return { kind: 'complain', text: v.s(`ゆうべの賭けで${r1(-A.gamble.net)}銅貨もすった`, 'v'), sentiment: -0.5 };
  return { kind: 'weather', text: v.s('お金の話は、あまりしたくない', 'v'), sentiment: 0 };
}

// 詳細欄に出す一行（なければ空文字）
export function financeSummary(sim, p) {
  if (!sim.S.loans) return '';
  const d = debtsOf(sim, p), c = creditsOf(sim, p);
  const bits = [];
  if (d.length) bits.push('借金：' + d.map((l) => `${sim.S.people[l.from]?.given || '?'}へ${r1(l.owed)}銅貨${l.late ? `（${l.late}回滞納）` : `（あと${Math.max(0, l.due - sim.today)}日）`}`).join('、'));
  if (c.length) bits.push('貸し：' + c.map((l) => `${sim.S.people[l.to]?.given || '?'}に${r1(l.owed)}銅貨`).join('、'));
  if (p.gamble && Math.abs(p.gamble.net) >= 5) bits.push(`賭けの収支：${p.gamble.net > 0 ? '+' : ''}${r1(p.gamble.net)}銅貨`);
  return bits.join(' ／ ');
}
