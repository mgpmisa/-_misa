// 市場と商人・組合・市の日・品物の持ち主・作り手の蔵（経済部）
//
// 社長の決まり：働いている最中にお金は入らない。品物は「作る → 持つ → 売る → 買う → 使う（食べる）」と回る。
// 販売の決まり（社長の許可済み。数字は docs/商人の歴史.md 第5章）：
//   作り手（農夫・漁師など）は、資格なしで次の3つから一人ひとりが考えて選ぶ。
//     (a) 市の日に、市場の露店で町の人に直接売る。場所代（パン1個分）を町の蓄えへ。売値は相場どおりで高いが、半日つぶれる。
//     (b) いつでも町の商人に売る。仕入れ値は相場の8割で安いが、手間がかからない。
//         商人のいない村では、村長が村の蔵（村の蓄え）で同じ値で買い取る。
//     (c) 家で食べる（自炊）。
//   町で店を構えて売れるのは、組合に入った商人と職人だけ（入会金・組合費は組合の箱へ。箱は病気や老いた組合員を助ける）。
//   村の家庭の手作り品は、露店で売れる（村長・見回りの検査つき）。量のごまかしは罰金（半分は告げた人へ、半分は施し箱へ）。
//   市場の外で作り手の家を回って先回りして買い占める商人は罪になる（罰金は同じ分け方）。
//
// ■ 品物の持ち主
//   市場の在庫 m.stock[g] には、必ず持ち主の札（m.lots[g] = [{o, q, c, u, w}]）が付いている。
//     o：持ち主（数なら世帯の id、'k1' なら国庫、't5' なら町の蓄え）
//     c：0＝商人が買い取った品　1＝店に預けた品（売れたら店番の商人に1割）　2＝市の日の露店の品　3＝組合の職人の店の品・村の蔵の品・国や町の品
//     u：買い取ったときの1個の値（商人のもうけの計算用）　w：ごまかしの量（0.85 なら15%少なく渡す）
//   在庫を減らすだけの処理（ねずみ・腐り・災害・供え物）は、持ち主の品が減るだけ（お金は動かない）。
//   札の付いていない在庫は、町の品（'t'+町）とみなす。売れた代金は町の蓄えへ入る。
//
// ■ 本体からの呼び方
//   ensureMarket(sim)          … newWorld と load の最後（古いセーブの市場の金庫を商人へ返し、組合を作る）
//   stash(sim, p, g, q)        … 作った品を家の蔵へ（sim.sell の代わり）
//   marketBuy(sim, sid, g, qty, payer, opt)      … 市場で買う。受け取った数を返す
//   marketDeliver(sim, sid, g, qty, seller, opt) … 市場へ品を出す（商人・村の蔵が買い取る／預ける）
//   ownStock(sim, sid, g, owner, q)              … 国や町の品を店先に並べる
//   cookFromStock(sim, hh, want)  … 蔵の食べ物で自炊する
//   marketCandidates(sim, p, add) … decide：売りに行く（商人へ／市の日の露店）
//   marketArrive(sim, p, a)       … arrive：'sell'・'stall'・'shop'
//   marketHourly(sim)             … newHour：終わった露店を片づけ、売れ残りを家へ持ち帰る
//   marketDaily(sim)              … newDay：蔵の生鮮品が傷む・先回りの買い占め・組合の入会と組合費と助け
import { GOODS, JOBS, DAYS_PER_SEASON } from './data.js';
import { flow, income, meal, whoLabel, econState } from './ledger.js';
import { hasShop, millToll } from './shops.js';

const FOOD = ['bread', 'fish', 'wheat', 'meat', 'honey'];
const PERISH = { fish: 0.15, meat: 0.12, bread: 0.1 };
const WHOLESALE = 0.8;        // 商人の買い取り値（相場の8割）
const COMMISSION = 0.1;       // 店に預けた品が売れたときの店番の手間賃
const DAY_WAGE = 9;           // ふつうの日給（docs/建物の持ち主と商売の費用.md）
export const GUILD_JOBS = new Set(['merchant', 'shopkeeper', 'baker', 'smith', 'carpenter', 'tailor', 'cobbler', 'potter', 'weaver', 'jeweler', 'brewer', 'butcher', 'herbalist', 'alchemist', 'shipwright', 'innkeeper', 'miller']);
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

// ---------- お金の口座（世帯・国庫・町の蓄え・施し箱・組合の箱） ----------
export function acct(sim, code) {
  const S = sim.S;
  if (code == null) return null;
  if (typeof code === 'object') return code;          // 世帯そのもの、または { money } の形のもの
  if (typeof code === 'number') return S.households[code] || null;
  const s = String(code), id = +s.slice(1);
  if (s[0] === 'k') { const k = S.kingdoms[id]; return k ? { get money() { return k.treasury; }, set money(v) { const d = v - k.treasury; k.treasury = v; if (d > 0 && k.fisc) k.fisc.dayIn = (k.fisc.dayIn || 0) + d; } } : null; }
  if (s[0] === 't') { const t = S.towns[id]; return t ? { get money() { return t.fund || 0; }, set money(v) { t.fund = v; } } : null; }
  if (s[0] === 'a') { const t = S.towns[id]; return t ? { get money() { return t.alms || 0; }, set money(v) { t.alms = v; } } : null; }
  if (s[0] === 'g') { const t = S.towns[id]; return t?.guild ? { get money() { return t.guild.box || 0; }, set money(v) { t.guild.box = v; } } : null; }
  return null;
}
// 人が払うときの口座（財布から先に、足りなければ家計から。家計は10銅貨を残す）
export function personPayer(sim, p) {
  return { get money() { return (p.purse || 0) + Math.max(0, (sim.hh(p)?.money || 0) - 10); },
    set money(v) { let d = this.money - v; const a = Math.min(Math.max(0, d), p.purse || 0); p.purse = (p.purse || 0) - a; d -= a; const hh = sim.hh(p); if (hh) hh.money -= d; else p.purse -= d; } };
}
// お金を渡す。持ち主がいなくなっていれば町の蓄えへ
function give(sim, code, amt, sid) {
  const a = acct(sim, code) || acct(sim, 't' + sid);
  if (a) a.money += amt;
  return a;
}
function label(sim, code) { return typeof code === 'object' && code && code.members ? whoLabel(sim, code.id) : whoLabel(sim, code); }

// ---------- 組合 ----------
function isGuildTown(sim, sid) { const s = sim.town(sid); return !!s && (s.type === 'capital' || s.type === 'port' || s.type === 'town') && !s.tribal; }
export function guildOf(sim, sid) {
  const t = sim.S.towns[sid];
  if (!t || !isGuildTown(sim, sid)) return null;
  if (!t.guild) t.guild = { box: 0, mem: {}, fees: 0, dues: 0, aid: 0 };
  return t.guild;
}
export function isGuildMember(sim, p) { const g = guildOf(sim, p.s); return !!g && g.mem[p.id] != null; }
// 店を構えて売れる人か（組合の町では組合員だけ。組合のない村ではだれでも）
function licensed(sim, p) { return !guildOf(sim, p.s) || isGuildMember(sim, p); }

// ---------- 町の商人（組合に入った店主） ----------
const mcache = { key: -1, by: null, S: null };
export function merchantsOf(sim, sid) {
  const key = Math.floor(sim.S.t / 60);
  if (mcache.key !== key || mcache.S !== sim.S) {
    const by = {};
    for (const p of sim.living()) {
      if ((p.job !== 'merchant' && p.job !== 'shopkeeper') || p.jail != null || sim.ageOf(p) < 16) continue;   // よろず屋の主も店を構える商人
      if (!licensed(sim, p)) continue;   // 組合に入っていない商人は店を構えられない
      const hh = sim.hh(p); if (!hh || hh.bandits) continue;
      if (!(by[p.s] || (by[p.s] = [])).includes(hh)) by[p.s].push(hh);
    }
    mcache.key = key; mcache.by = by; mcache.S = sim.S;
  }
  return mcache.by[sid] || [];
}
function shopkeeper(sim, sid) {
  const list = merchantsOf(sim, sid);
  if (!list.length) return null;
  return list[(sim.today + sid) % list.length];
}
// 市の日：町ごとに3日に1度（週に1〜2回）。町の番号で日をずらし、近くの町どうしが同じ日になりにくい
export function isMarketDay(sim, sid, day = sim.today) { return (day + sid) % 3 === 0; }
export function nextMarketDay(sim, sid) { let d = sim.today; while (!isMarketDay(sim, sid, d)) d++; return d - sim.today; }

// ---------- 在庫の札 ----------
function lotsOf(sim, m, g, sid) {
  const L = m.lots || (m.lots = {});
  const list = L[g] || (L[g] = []);
  const stock = Math.max(0, num(m.stock[g]));
  let sum = 0;
  for (const l of list) sum += l.q;
  if (sum > stock + 1e-6) {
    // 札の合計が在庫より多い：ねずみ・腐り・災害で減った分を、持ち主ごとに同じ割合で減らす
    const f = sum > 0 ? stock / sum : 0;
    for (const l of list) l.q *= f;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].q < 1e-4) list.splice(i, 1);
  } else if (stock > sum + 1e-6) {
    // 札のない在庫（開拓で出た木・町が集めた品など）は町の品
    list.push({ o: 't' + sid, q: stock - sum, c: 3, u: 0 });
  }
  return list;
}
function addLot(sim, m, sid, g, o, q, c, u, opt = {}) {
  const list = lotsOf(sim, m, g, sid);
  const lot = { o, q, c, u: u || 0 };
  if (opt.w) lot.w = opt.w;
  const same = (l) => l.o === o && l.c === c && !l.w && !lot.w && Math.abs((l.u || 0) - (u || 0)) < 0.01;
  if (opt.front) { if (list[0] && same(list[0])) list[0].q += q; else list.unshift(lot); }   // 露店の品は先に売れる（相場で、作り手から直接）
  else { const last = list[list.length - 1]; if (last && same(last)) last.q += q; else list.push(lot); }
  m.stock[g] = num(m.stock[g]) + q;
  if (list.length > 40) {   // 札が増えすぎたら、同じ持ち主の札をまとめる（露店の札は先頭のまま）
    const merged = new Map();
    for (const l of list) { const k = `${l.o}|${l.c}|${l.w || 1}`; const x = merged.get(k); if (x) { x.u = (x.u * x.q + (l.u || 0) * l.q) / (x.q + l.q || 1); x.q += l.q; } else merged.set(k, { ...l }); }
    m.lots[g] = [...merged.values()].sort((a, b) => (a.c === 2 ? 0 : 1) - (b.c === 2 ? 0 : 1));
  }
}
// 国や町の品を店先に並べる（売れたときに代金が持ち主へ）
export function ownStock(sim, sid, g, o, q) { const m = sim.S.towns[sid]; if (m && q > 0 && GOODS[g]) addLot(sim, m, sid, g, o, q, 3, 0); }

// ---------- 買う ----------
// payer：世帯・口座の札（'k1' など）・{money}。qty は小数でもよい。opt.price で1個の値を決められる。
// 戻り値は実際に受け取った数（量をごまかす売り手からは、払った数より少ない）
export function marketBuy(sim, sid, g, qty, payer, opt = {}) {
  const m = sim.S.towns[sid];
  if (!m || !GOODS[g] || qty <= 0) return 0;
  const pa = acct(sim, payer);
  if (!pa) return 0;
  const price = opt.price ?? m.price[g];
  qty = Math.min(qty, num(m.stock[g]));
  if (!opt.force) qty = Math.min(qty, Math.max(0, pa.money) / Math.max(0.01, price));
  if (opt.whole) qty = Math.floor(qty + 1e-9);
  if (qty <= 1e-6) return 0;
  const list = lotsOf(sim, m, g, sid);
  const keeper = shopkeeper(sim, sid);
  const E = econState(sim);
  const payerName = opt.who || label(sim, payer);
  let need = qty, got = 0;
  while (need > 1e-9 && list.length) {
    const l = list[0];
    const w = l.w || 1;                        // ごまかしの量
    const take = Math.min(need, l.q / w);      // 買い手が払う数
    const cost = take * price;
    pa.money -= cost;
    if (l.c === 1 && keeper && keeper.id !== l.o) {
      // 店に預けた品：持ち主へ。店番の商人に1割
      const cut = cost * COMMISSION;
      give(sim, l.o, cost - cut, sid); keeper.money += cut;
      flow(sim, payerName, label(sim, l.o), cost - cut, GOODS[g].name);
      flow(sim, label(sim, l.o), '市場の商人', cut, '店番の手間賃');
      E.day.merchant += cut; incomeOf(sim, l.o, cost - cut); incomeOf(sim, keeper.id, cut);
    } else {
      give(sim, l.o, cost, sid);
      const isM = l.c === 0;
      flow(sim, payerName, isM ? '市場の商人' : label(sim, l.o), cost, GOODS[g].name + (l.c === 2 ? '（市の露店）' : ''));
      const gain = isM ? cost - take * (l.u || 0) : cost;
      if (isM) E.day.merchant += gain;
      incomeOf(sim, l.o, gain);
    }
    l.q -= take * w; need -= take; got += take * w;
    if (l.q < 1e-6) list.shift();
  }
  m.stock[g] = Math.max(0, num(m.stock[g]) - got);
  return got;
}
function incomeOf(sim, code, amt) {
  if (typeof code !== 'number') return;
  const hh = sim.S.households[code]; if (!hh) return;
  for (const id of hh.members) { const p = sim.S.people[id]; if (p && p.deathYear == null && p.job) { income(sim, p.job, amt); return; } }
}

// ---------- 売る（市場へ品を出す） ----------
// seller：世帯（作り手）か口座の札。戻り値 { got：いま受け取ったお金, left：売れずに持ち帰る数 }
//   opt.consign：商人が買わなかった分を店に預ける（行商人・隊商・国の品）
//   opt.shop：組合の職人が自分の店に並べる
export function marketDeliver(sim, sid, g, qty, seller, opt = {}) {
  const m = sim.S.towns[sid];
  if (!m || !GOODS[g] || qty <= 0) return { got: 0, left: qty };
  const code = typeof seller === 'object' && seller?.members ? seller.id : seller;
  const G = GOODS[g], price = m.price[g];
  let left = qty, got = 0;
  if (opt.shop) { addLot(sim, m, sid, g, code, left, 3, 0); return { got: 0, left: 0 }; }
  // 1. 組合の商人が買い取る（在庫が多すぎる品は買わない。生ものは控えめ）
  const merchants = merchantsOf(sim, sid).filter((h) => h.id !== code);
  const cap = G.target * (PERISH[g] ? 1.0 : 1.4) * (opt.capMul || 1);
  const unit = price * WHOLESALE * (opt.tradeMul || 1);
  for (const mh of sim.rng.shuffle(merchants.slice())) {
    if (left <= 1e-6) break;
    const room = Math.max(0, cap - num(m.stock[g]));
    const afford = Math.max(0, mh.money - 25) / Math.max(0.01, unit);
    const n = Math.min(left, room, afford);
    if (n < 0.05) continue;
    const cost = n * unit;
    mh.money -= cost; give(sim, code, cost, sid);
    addLot(sim, m, sid, g, mh.id, n, 0, unit);
    flow(sim, '市場の商人', label(sim, code), cost, `${G.name}の買い取り`);
    { const wf = cost * 0.01; mh.money -= wf; m.fund = (m.fund || 0) + wf; flow(sim, '市場の商人', '町の蓄え', wf, 'はかり料'); }   // 町の計量所で量ってもらう
    incomeOf(sim, code, cost);
    got += cost; left -= n;
  }
  // 1b. 商人の手元が細いとき：店に置いてもらい、売れたときに払ってもらう（後払い。店番の手間賃1割）
  if (left > 1e-6 && merchants.length && typeof code === 'number') {
    const room = Math.max(0, cap - num(m.stock[g]));
    const n = Math.min(left, room);
    if (n >= 0.05) { addLot(sim, m, sid, g, code, n, 1, 0); left -= n; }
  }
  // 2. 組合のない村：村長が村の蔵に買い取る（村の蓄えから、同じ8割の値で）
  if (left > 1e-6 && !merchants.length && !guildOf(sim, sid) && typeof code === 'number') {
    const t = sim.S.towns[sid];
    const room = Math.max(0, G.target * (PERISH[g] ? 0.8 : 1.2) - num(m.stock[g]));
    const n = Math.min(left, room, Math.max(0, (t.fund || 0) - 40) / Math.max(0.01, unit));
    if (n >= 0.05) {
      const cost = n * unit;
      t.fund -= cost; give(sim, code, cost, sid);
      addLot(sim, m, sid, g, 't' + sid, n, 3, unit);
      flow(sim, '村の蔵（村長）', label(sim, code), cost, `${G.name}の買い取り`);
      incomeOf(sim, code, cost);
      got += cost; left -= n;
    }
  }
  // 3. 店に預ける（行商人・隊商・国や町の品）
  if (left > 1e-6 && (opt.consign || typeof code === 'string')) { addLot(sim, m, sid, g, code, left, 1, 0); left = 0; }
  return { got, left };
}

// ---------- 家の蔵 ----------
export function stash(sim, p, g, q) {
  const hh = p?.members ? p : sim.hh(p);
  if (!hh || !(q > 0) || !GOODS[g]) return 0;
  const st = hh.stock || (hh.stock = {});
  st[g] = (st[g] || 0) + q;
  return 0;
}
export function stockValue(sim, hh, sid) {
  const st = hh?.stock; if (!st) return 0;
  const m = sim.S.towns[sid ?? hh.s]; let v = 0;
  for (const [g, n] of Object.entries(st)) if (n > 0 && GOODS[g]) v += n * (m?.price[g] ?? GOODS[g].base);
  return v;
}
// 家族のための取り置き（食べ物）を除いた、売ってよい量。家計の苦しい家ほど多めに取っておく
function sellable(sim, hh, g) {
  const n = hh.stock?.[g] || 0;
  if (!GOODS[g].meals) return n;
  const days = hh.money < 30 ? 3 : 2;
  const keep = Math.max(0, hh.members.length * 2 * days - (hh.food || 0)) / GOODS[g].meals;
  return Math.max(0, n - keep);
}
function sellValue(sim, hh, sid) {
  if (!hh?.stock) return 0;
  const m = sim.S.towns[sid]; let v = 0;
  for (const g of Object.keys(hh.stock)) if (GOODS[g]) v += sellable(sim, hh, g) * (m?.price[g] ?? GOODS[g].base);
  return v;
}
// 蔵の食べ物で食事を作る（自炊）。足した食数を返す
export function cookFromStock(sim, hh, want) {
  const st = hh?.stock; if (!st) return 0;
  let added = 0;
  for (const g of FOOD) {
    if (want - added <= 0.01) break;
    const n = st[g] || 0; if (n <= 0.01) continue;
    const meals = GOODS[g].meals;
    const use = Math.min(n, (want - added) / meals);
    st[g] = n - use;
    added += (g === 'wheat' ? millToll(sim, hh.s, use, hh) : use) * meals;   // 麦は水車でひく（16分の1を粉屋へ）
  }
  if (added > 0) { hh.food = (hh.food || 0) + added; meal(sim, 'self', added); }
  return added;
}

// (b) 家の蔵の品を、いまいる町の商人（村なら村の蔵）に売る。組合の職人は自分の店に並べる
export function sellHousehold(sim, p) {
  const hh = sim.hh(p);
  if (!hh?.stock) return 0;
  const sid = p.s;
  let total = 0; const sold = [];
  const craft = GUILD_JOBS.has(p.job) && p.job !== 'merchant' && p.job !== 'shopkeeper' && !!guildOf(sim, sid) && isGuildMember(sim, p);
  for (const g of Object.keys(hh.stock)) {
    if (!GOODS[g]) continue;
    const n = sellable(sim, hh, g);
    if (n < 0.2) continue;
    // 組合の職人：自分で作った品は自分の店に並べ、売れたときに相場で受け取る
    const own = craft && hasShop(sim, hh) && (g === JOBS[p.job]?.goods || g === 'bread' || g === 'ale' || !GOODS[g].meals);
    const r = marketDeliver(sim, sid, g, n, hh, own ? { shop: true } : {});
    hh.stock[g] -= n - r.left;
    if (hh.stock[g] < 1e-4) delete hh.stock[g];
    total += r.got;
    if (n - r.left > 0.2) sold.push(GOODS[g].name);
  }
  if (sold.length && sim.rng.chance(0.25)) sim.remember(p, `${sold.slice(0, 3).join('と')}を${craft ? '店に並べた' : '市場の商人に売った'}${total >= 1 ? `（${Math.round(total)}銅貨になった）` : ''}`, { emo: total >= 1 ? 0.3 : 0.05, imp: 0.2, k: 'work' });
  return total;
}

// (a) 市の日の露店：場所代を払い、品を並べて町の人に直接売る。終わったら売れ残りを持ち帰る
function openStall(sim, p, a) {
  const hh = sim.hh(p), sid = p.s, m = sim.S.towns[sid];
  if (!hh?.stock || !m || !isMarketDay(sim, sid)) return;
  const fee = Math.max(1, Math.round(m.price.bread || 3));   // 場所代：パン1個分
  if (hh.money < fee) return;
  const S = sim.S;
  const st = (m.stalls = m.stalls || []);
  if (st.some((x) => x.hh === hh.id)) return;
  // 量のごまかし：正直でない者は、量を15%少なく渡す（検査で見つかると罰金）
  const cheat = p.pers.C < 0.3 && p.pers.A < 0.4 && sim.rng.chance(0.5);
  const goods = {};
  for (const g of Object.keys(hh.stock)) {
    if (!GOODS[g]) continue;
    const n = sellable(sim, hh, g);
    if (n < 0.5) continue;
    addLot(sim, m, sid, g, hh.id, n, 2, 0, { front: true, w: cheat ? 0.85 : 0 });
    hh.stock[g] -= n; if (hh.stock[g] < 1e-4) delete hh.stock[g];
    goods[g] = n;
  }
  if (!Object.keys(goods).length) return;
  hh.money -= fee; m.fund = (m.fund || 0) + fee;
  flow(sim, '露店の作り手', '町の蓄え', fee, '市の場所代');
  st.push({ hh: hh.id, pid: p.id, until: S.t + (a.dur || 240), goods, cheat, money0: hh.money });
  const E = econState(sim); E.day.stalls = (E.day.stalls || 0) + 1;
}
function closeStall(sim, sid, x) {
  const S = sim.S, m = S.towns[sid], hh = S.households[x.hh], p = S.people[x.pid];
  for (const g of Object.keys(x.goods)) {
    const list = lotsOf(sim, m, g, sid);
    for (let i = list.length - 1; i >= 0; i--) {
      const l = list[i];
      if (l.c !== 2 || l.o !== x.hh) continue;
      m.stock[g] = Math.max(0, num(m.stock[g]) - l.q);
      if (hh) stash(sim, hh, g, l.q);
      list.splice(i, 1);
    }
  }
  const earned = hh ? Math.max(0, hh.money - x.money0) : 0;
  if (p && p.deathYear == null && p.memories) {
    if (earned >= 1 && sim.rng.chance(0.4)) sim.remember(p, `市の日に露店を出し、${Math.round(earned)}銅貨ぶん売れた`, { emo: 0.4, imp: 0.3, k: 'work' });
    else if (earned < 1 && sim.rng.chance(0.4)) sim.remember(p, '市の日に露店を出したが、ほとんど売れなかった', { emo: -0.3, imp: 0.3, k: 'work' });
  }
  // 村長・見回りの検査：ごまかしが見つかれば罰金（半分は告げた人へ、半分は施し箱へ）
  if (x.cheat && hh && p && p.deathYear == null && earned > 0) {
    const guards = sim.living().filter((q) => q.s === sid && ['guard', 'watchman', 'militia', 'elder', 'gatekeeper'].includes(q.job) && q.jail == null).length;
    if (sim.rng.chance(Math.min(0.7, 0.25 + guards * 0.05))) {
      const pool = sim.living().filter((q) => q.s === sid && q.hh !== x.hh && sim.isAdult(q) && sim.hh(q));
      fine(sim, p, hh, Math.min(Math.max(5, earned * 0.5), 25), pool.length ? sim.rng.pick(pool) : null, '露店で量をごまかした');
    }
  }
}
// 罰金：半分は告げた人へ、半分は施し箱へ
function fine(sim, p, hh, amt, informer, what) {
  const x = Math.max(0, Math.min(amt, hh.money));
  if (x <= 0) return 0;
  hh.money -= x;
  const t = sim.S.towns[p.s];
  const ih = informer && sim.hh(informer);
  if (ih) { ih.money += x / 2; t.alms = (t.alms || 0) + x / 2; } else t.alms = (t.alms || 0) + x;
  flow(sim, JOBS[p.job]?.name || '売り手', ih ? '施し箱と告げた人' : '施し箱', x, '罰金（' + what + '）');
  sim.remember(p, `${what}のが見つかり、${Math.round(x)}銅貨の罰金を払わされた`, { emo: -0.7, imp: 0.6, k: 'justice' });
  if (ih) sim.remember(informer, `${p.given}が${what}のを告げ、罰金の半分をもらった`, { emo: 0.3, imp: 0.4, about: [p.id], k: 'justice' });
  p.fame = Math.max(0, (p.fame || 0) - 3);
  sim.pushLog(`${sim.town(p.s).name}で、${sim.fullName(p)}が${what}として${Math.round(x)}銅貨の罰金を科された。`, 'event', [p.id], p.pos);
  const E = econState(sim); E.day.fines = (E.day.fines || 0) + x;
  return x;
}

// ---------- 行動の候補と到着 ----------
// 売りに行くかどうか、どこで売るかは、その人の性格・家計の苦しさ・品の量・市の日かどうかで決める
export function marketCandidates(sim, p, add) {
  const h = sim.hour();
  if (h < 7 || h >= 18 || sim.ageOf(p) < 14 || p.jail != null || !p.needs) return;
  const hh = sim.hh(p);
  if (!hh?.stock || hh.bandits) return;
  const v = sellValue(sim, hh, p.s);
  if (v < 5) return;
  const poor = hh.money < 30 ? 1.5 : hh.money < 80 ? 0.6 : 0;
  const m = sim.S.towns[p.s];
  const stallDay = isMarketDay(sim, p.s) && h < 12 && !(m?.stalls || []).some((x) => x.hh === hh.id);
  // (b) 商人（村なら村の蔵）へ：手間がかからない。困っている家・心配性の人ほど急いで売る。市の日なら少し待つ
  add(2.2 + Math.min(3.5, v / 14) + poor + p.pers.N * 0.5 - (stallDay ? 0.8 : 0), 'sell', sim.placeFor(p, 'market'), 20);
  // (a) 市の日の露店：朝のうちに出す。人づきあいの好きな人・働き者・品の多い家ほど選ぶ。怠け者は選ばない
  if (stallDay) add(1.8 + Math.min(4, v / 10) + p.pers.E * 1.5 + p.pers.C - (100 - p.needs.sloth) / 60 + (v >= 25 ? 1 : 0), 'stall', sim.placeFor(p, 'market'), 240);
}
export function marketArrive(sim, p, a) {
  if (a.type === 'stall') { openStall(sim, p, a); return; }
  if (a.type === 'sell' || a.type === 'shop') sellHousehold(sim, p);
}
export function marketHourly(sim) {
  const S = sim.S;
  for (const [sid, m] of Object.entries(S.towns)) {
    if (!m.stalls?.length) continue;
    m.stalls = m.stalls.filter((x) => { if (S.t >= x.until || !isMarketDay(sim, +sid)) { closeStall(sim, +sid, x); return false; } return true; });
  }
}

// ---------- 市場の外での先回りの買い占め（罪） ----------
// 市の日の朝、欲の深い商人が作り手の家を回り、市場に出る前の品を買い占める。見つかれば罰金
function forestall(sim) {
  const S = sim.S, R = sim.rng;
  for (const s of S.world.settlements) {
    if (!isMarketDay(sim, s.id) || S.towns[s.id]?.occupied) continue;
    for (const mh of merchantsOf(sim, s.id)) {
      const p = mh.members.map((id) => S.people[id]).find((q) => q && q.deathYear == null && q.job === 'merchant');
      if (!p || p.pers.A > 0.35 || (p.values?.ambition ?? 0.5) < 0.55 || !R.chance(0.3) || mh.money < 80) continue;
      const m = S.towns[s.id];
      const src = R.shuffle(Object.values(S.households).filter((h) => h.s === s.id && h !== mh && h.stock && FOOD.some((g) => (h.stock[g] || 0) >= 3))).slice(0, 3);
      let bought = 0; const victims = [];
      for (const h of src) for (const g of FOOD) {
        const n = Math.min((h.stock[g] || 0) * 0.6, 10);
        if (n < 1) continue;
        const unit = m.price[g] * 0.85;
        const cost = Math.min(n * unit, mh.money - 40);
        if (cost <= 0) continue;
        const q = cost / unit;
        mh.money -= cost; h.money += cost; h.stock[g] -= q;
        addLot(sim, m, s.id, g, mh.id, q, 0, unit);
        bought += cost; if (!victims.includes(h)) victims.push(h);
      }
      if (bought <= 0) continue;
      flow(sim, '市場の商人', '作り手', bought, '先回りの買い占め');
      const guards = sim.living().filter((q) => q.s === s.id && ['guard', 'watchman', 'militia', 'gatekeeper'].includes(q.job) && q.jail == null).length;
      if (R.chance(Math.min(0.6, 0.2 + guards * 0.05))) {
        const vp = victims.flatMap((h) => h.members).map((id) => S.people[id]).find((q) => q && q.deathYear == null && sim.isAdult(q));
        fine(sim, p, mh, Math.max(10, bought * 0.3), vp, '市場の外で先回りして品を買い占めた');
      }
    }
  }
}

// ---------- 買い付け：町の商人が、品の余っている近くの町や村から仕入れて運ぶ ----------
// 王都や港町には畑がほとんどない。商人は近くの村の市場で品の持ち主から買い（代金は村の作り手・村の蔵へ）、
// 荷車の手間賃を御者・行商人に払い、次の日に自分の店に並べる。これで村の麦が王都の食卓に届く。
const CARRIERS = ['coachman', 'peddler', 'stablehand'];
function merchantImports(sim) {
  const S = sim.S, W = S.world.settlements;
  // 前の日に出た荷が着く
  for (const [sid, m] of Object.entries(S.towns)) {
    if (!m.inbound?.length) continue;
    const keep = [];
    for (const x of m.inbound) {
      if (x.day > sim.today) { keep.push(x); continue; }
      addLot(sim, m, +sid, x.g, S.households[x.o] ? x.o : 't' + sid, x.q, 0, x.u);
    }
    m.inbound = keep;
  }
  for (const s of W) {
    const m = S.towns[s.id];
    if (!m || m.occupied) continue;
    const list = merchantsOf(sim, s.id).filter((h) => h.money > 60);
    if (!list.length) continue;
    const near = W.filter((q) => q.id !== s.id && S.towns[q.id] && !S.towns[q.id].occupied && !(q.tribal && q.annexed == null) && Math.hypot(q.x - s.x, q.z - s.z) < 90)
      .map((q) => ({ q, d: Math.hypot(q.x - s.x, q.z - s.z) })).sort((a, b) => a.d - b.d).slice(0, 6);
    if (!near.length) continue;
    let trips = 0;
    const goods = Object.keys(GOODS).sort((a, b) => (FOOD.includes(a) ? 0 : 1) - (FOOD.includes(b) ? 0 : 1));
    for (const g of goods) {
      if (trips >= 10) break;
      const G = GOODS[g];
      const coming = (m.inbound || []).filter((x) => x.g === g).reduce((t, x) => t + x.q, 0);
      let want = G.target * (FOOD.includes(g) ? 1.5 : 0.5) - num(m.stock[g]) - coming;
      if (want < 1) continue;
      for (const { q, d } of near) {
        if (want < 1) break;
        const sm = S.towns[q.id];
        const spare = num(sm.stock[g]) - G.target * (sm === m ? 9 : 0.4);
        if (spare < 1) continue;
        const freight = Math.max(0.2, 0.004 * d * G.base);          // 荷車の手間賃（1個あたり）
        if (m.price[g] < sm.price[g] + freight) continue;            // 運んでも割に合わない
        const mh = list.slice().sort((a, b) => b.money - a.money)[0];
        const n = Math.min(want, spare, 40, (mh.money - 50) / (sm.price[g] + freight));
        if (n < 1) continue;
        const got = marketBuy(sim, q.id, g, n, mh, { who: '町の商人（買い付け）' });
        if (got <= 0) continue;
        const fcost = got * freight;
        const carrier = sim.living().find((c) => (c.s === s.id || c.s === q.id) && CARRIERS.includes(c.job) && c.jail == null && sim.hh(c) && sim.hh(c) !== mh);
        const ch = carrier ? sim.hh(carrier) : null;
        mh.money -= fcost; if (ch) { ch.money += fcost; income(sim, carrier.job, fcost); } else m.fund = (m.fund || 0) + fcost;   // 手間賃は御者へ（いなければ町の荷役＝町の蓄え）
        flow(sim, '市場の商人', ch ? JOBS[carrier.job].name : '町の蓄え', fcost, '荷車の手間賃');
        (m.inbound = m.inbound || []).push({ g, q: got, o: mh.id, u: sm.price[g] + freight, day: sim.today + 1, from: q.id });
        want -= got; trips++;
      }
    }
  }
}

// ---------- 組合：入会金・組合費・助け ----------
function guildDaily(sim) {
  const S = sim.S, R = sim.rng;
  const doy = sim.dayOfYear();
  for (const s of S.world.settlements) {
    const g = guildOf(sim, s.id); if (!g) continue;
    // 組合員の整理（亡くなった人・町を出た人）
    for (const id of Object.keys(g.mem)) { const q = S.people[id]; if (!q || q.deathYear != null || q.s !== s.id) delete g.mem[id]; }
    // 入会：組合の職に就いているのに組合員でない人（越してきた・見習いから上がった）
    for (const p of sim.living()) {
      if (p.s !== s.id || !GUILD_JOBS.has(p.job) || g.mem[p.id] != null || sim.ageOf(p) < 16) continue;
      const hh = sim.hh(p); if (!hh) continue;
      const heir = [p.fatherId, p.motherId].some((id) => id != null && (g.mem[id] != null || GUILD_JOBS.has(S.people[id]?.job || S.people[id]?.formerJob)));
      const fee = Math.round(DAY_WAGE * (30 + (p.id % 31)) * (heir ? 0.5 : 1));   // 日給の30〜60日分（跡継ぎは半額）
      if (hh.money < fee + 30) { if (!p._guildWait || sim.today - p._guildWait > 10) { p._guildWait = sim.today; sim.remember(p, `組合の入会金${fee}銅貨がまだ貯まらず、町で店を構えられない`, { emo: -0.3, imp: 0.35, k: 'work' }); } continue; }
      hh.money -= fee; g.box += fee; g.fees += fee; g.mem[p.id] = sim.today;
      flow(sim, JOBS[p.job].name, '組合の箱', fee, '組合の入会金');
      sim.remember(p, `${fee}銅貨の入会金を納めて、${s.name}の組合に入った。これで店を構えられる`, { emo: 0.6, imp: 0.6, k: 'work' });
      mcache.key = -1;
    }
    // 組合費：季節の初めに、日給の2日分
    if (doy % DAYS_PER_SEASON === 0 && g.duesDay !== sim.today) {
      g.duesDay = sim.today;
      for (const id of Object.keys(g.mem)) {
        const p = S.people[id], hh = p && sim.hh(p);
        if (!hh || !p.job) continue;   // 引退した組合員は組合費を納めない
        const due = DAY_WAGE * 2;
        if (hh.money < due) { g.late = g.late || {}; g.late[id] = (g.late[id] || 0) + 1; if (g.late[id] >= 2) { delete g.mem[id]; mcache.key = -1; sim.remember(p, '組合費を納められず、組合から外された', { emo: -0.7, imp: 0.6, k: 'work' }); } continue; }
        hh.money -= due; g.box += due; g.dues += due;
        flow(sim, JOBS[p.job]?.name || '組合員', '組合の箱', due, '組合費');
      }
    }
    // 助け：病で伏せっている組合員、老いて退いた組合員に、5日ごとに少しずつ
    if ((sim.today + s.id) % 5 === 0 && g.box > 10) {
      for (const id of Object.keys(g.mem)) {
        const p = S.people[id], hh = p && sim.hh(p);
        if (!hh || g.box < 6) continue;
        const sick = p.ail && p.ail.sev >= 35, old = !p.job && sim.ageOf(p) >= 60;
        if (!sick && !old) continue;
        const x = Math.min(6, g.box * 0.2);
        g.box -= x; g.aid += x; hh.money += x;
        flow(sim, '組合の箱', sick ? '病の組合員' : '老いた組合員', x, '組合の助け');
        if (R.chance(0.4)) sim.remember(p, `組合から${Math.round(x)}銅貨の見舞いが届いた`, { emo: 0.5, imp: 0.4, k: 'help' });
      }
    }
  }
}

// ---------- 起動・毎日 ----------
export function ensureMarket(sim) {
  const S = sim.S;
  for (const s of S.world.settlements) {
    const m = S.towns[s.id]; if (!m) continue;
    m.lots = m.lots || {};
    // 組合：今いる商人と職人は、もとから組合員（古いセーブも同じ）
    const g = guildOf(sim, s.id);
    if (g && !g.init) { g.init = true; for (const p of sim.living()) if (p.s === s.id && GUILD_JOBS.has(p.job || p.formerJob)) g.mem[p.id] = sim.today; }
    mcache.key = -1;
    // 古いセーブ：市場の金庫と手数料は、町の商人（いなければ町の蓄え）へ返す
    const old = num(m.cash) + num(m.commission);
    if (old > 0) {
      const list = merchantsOf(sim, s.id);
      if (list.length) for (const hh of list) hh.money += old / list.length; else m.fund = num(m.fund) + old;
    }
    delete m.cash; m.commission = 0;
    // 札のない在庫：町に商人がいれば商人の品、いなければ町の品
    for (const k of Object.keys(GOODS)) {
      const have = (m.lots[k] || []).reduce((t, l) => t + l.q, 0);
      const extra = num(m.stock[k]) - have;
      if (extra <= 1e-6) continue;
      const mh = merchantsOf(sim, s.id)[0];
      (m.lots[k] = m.lots[k] || []).push(mh ? { o: mh.id, q: extra, c: 0, u: GOODS[k].base * WHOLESALE } : { o: 't' + s.id, q: extra, c: 3, u: 0 });
    }
  }
}
export function marketDaily(sim) {
  for (const hh of Object.values(sim.S.households)) {
    const st = hh.stock; if (!st) continue;
    for (const [g, r] of Object.entries(PERISH)) if (st[g] > 0) { st[g] *= 1 - r; if (st[g] < 0.05) delete st[g]; }
  }
  mcache.key = -1;
  guildDaily(sim);
  forestall(sim);
  merchantImports(sim);
}
// 画面用
export function stockText(sim, hh) {
  const st = hh?.stock; if (!st) return '';
  return Object.entries(st).filter(([, n]) => n >= 0.5).map(([g, n]) => `${GOODS[g]?.name || g}${Math.floor(n)}`).join('・');
}
export function marketTownHTML(sim, sid) {
  const m = sim.S.towns[sid], g = guildOf(sim, sid);
  const mer = merchantsOf(sim, sid).length;
  const d = nextMarketDay(sim, sid);
  const stalls = (m?.stalls || []).length;
  return `<p>市の日：${d === 0 ? `今日（露店${stalls}軒）` : `${d}日後`}　組合の商人：${mer}人${g ? `　組合員${Object.keys(g.mem).length}人・組合の箱${Math.round(g.box)}銅貨` : '（組合のない村：村長が村の蔵に買い取る）'}</p>`;
}
export const MARKET_LABEL = { sell: '市場で品物を売っている', stall: '市の日の露店で品物を売っている' };
export const MARKET_GO = { sell: '品物を市場へ売りに行くところ', stall: '市の日の露店を出しに行くところ' };
export const MARKET_PREF = { sell: '品物を商人に売ること', stall: '市の露店' };
export { FOOD as FOOD_GOODS };
