// 人生設計：夢と計画・貯金・開業・弟子入りと継承・引退と老後
// 本体（sim.js）からは次の関数を呼ぶだけで動く。状態はすべて遅延初期化なので古いセーブでも動く。
//   careerDaily(sim)             … newDay で1日ごとの処理（計画・貯金・達成・弟子入り・継承・引退・欠員補充）
//   careerOptions(sim, p, add)   … decide の中で、引退した人の過ごし方（孫の世話・庭いじり・釣り・昔語り）を足す
//   careerDo(sim, p, dt)         … doAction で行動中の処理
//   careerWorkPlace(sim, p)      … 自分の店を持つ人の仕事場（なければ null）
//   careerThought(sim, p)        … 心の声（なければ null）
//   careerSay(sim, p)            … 会話で話す自分の目標の一文（なければ null）
//   careerCard(sim, p)           … 詳細欄に出す行（[見出し, 本文] の配列）
//
// 人の状態：
//   p.plan = { goal, job, txt, need, saved, since, deadline, stage, fromDream }
//     stage: 'saving'（貯めている）→ 'waiting'（貯まったが機会待ち）→ 'done' / 'failed'
//   p.master（師匠の id）、p.appr（見習い中なら true）、p.apprSince、p.apprentices（弟子の id 配列）
//   p.shop（自分の店の建物 id）、p.retired（引退した）
// 建物：b.shopOf（店主の id）、b.shopJob（店の職業）
import { JOBS, JOB_QUOTA, GOODS, DAYS_PER_YEAR } from './data.js';
import { clamp } from './rng.js';
import { houseValue } from './property.js';
import { humanStats } from './society.js';

// ---------- 表 ----------
// 店を構えられる職業と、その店の呼び名
export const SHOP_NOUN = {
  baker: 'パン屋', smith: '鍛冶場', carpenter: '大工の工房', tailor: '仕立て屋', cobbler: '靴屋', potter: '焼き物の工房',
  weaver: '機織り小屋', jeweler: '宝飾店', butcher: '肉屋', brewer: '酒蔵', herbalist: '薬屋', barber: '床屋',
  merchant: '雑貨屋', shipwright: '造船所', alchemist: '錬金術の店',
};
// 町の割り当てにない土地でも、1軒ならあってよい店
const TOWN_SHOPS = ['baker', 'merchant', 'butcher', 'tailor', 'cobbler', 'herbalist'];
// 弟子をとれる職人
const CRAFTS = ['smith', 'carpenter', 'baker', 'tailor', 'cobbler', 'potter', 'weaver', 'jeweler', 'butcher', 'brewer', 'herbalist', 'shipwright', 'mason', 'miller', 'alchemist'];
// 腕がなくても就ける、人の多い仕事（ここから転職・弟子入りしやすい）
const COMMON = ['farmer', 'fisher', 'sailor', 'laundress', 'stablehand', 'gatherer', 'charcoal', 'woodcutter', 'maid', 'gardener', 'wanderer', 'messenger'];
// 引退しない・計画を持たない職業
const NO_RETIRE = ['king', 'royal', 'noble', 'elder', 'thief', 'beggar', 'banditchief', 'pickpocket', 'swindler', 'pirate', 'smuggler', 'wanderer', 'bard'];
const NO_PLAN_RANK = ['king', 'royal', 'outlaw', 'prisoner'];
// 欠員を埋めない職業（身分や悪事で決まるもの）
const SKILLED = ['doctor', 'priest', 'teacher', 'scribe', 'alchemist', 'jeweler', 'captain', 'shipwright', 'cook', 'butler', 'herbalist', 'nun', 'midwife'];
const NO_VACANCY = [...SKILLED, 'king', 'noble', 'royal', 'thief', 'beggar', 'pickpocket', 'swindler', 'banditchief', 'pirate', 'smuggler', 'chancellor', 'treasurer', 'general', 'courtmage', 'guildmaster', 'knight', 'royalguard', 'paladin', 'sage', 'wizard', 'scholar', 'elder'];

// 既存の夢の文 → 計画の種類
const DREAM_GOAL = {
  '自分の店を持つ': 'shop', '誰よりもうまいパンを焼く': 'shop', '大金持ちになる': 'shop',
  '騎士に取り立てられる': 'knight', '王様に認められる': 'knight',
  '星の運行の謎を解く': 'scholar', '新しい魔法を編み出す': 'scholar', '砂漠の古代遺跡の秘密を知る': 'scholar',
  '海の向こうへ渡る': 'ship', '村いちばんの麦畑をつくる': 'land', '子どもたちに立派な家を残す': 'house',
  '静かに年をとる': 'nest', '誰にも頭を下げずに生きる': 'shop', '故郷に錦を飾る': 'shop',
};
// 計画の種類（ui などで使える名前）
export const GOAL_NAME = {
  shop: '自分の店', newshop: '開業', knight: '騎士への取り立て', scholar: '学者への道', ship: '自分の船', land: '畑を広げる',
  house: '持ち家', tutor: '子の学問', nest: '老後の蓄え', craft: '一人前の職人',
};

// ui.js にそのまま足せるラベル
export const CAREER_LABEL = { garden: '庭いじりをしている', fishing: 'のんびり釣り糸を垂れている', grandkids: '孫の相手をしている' };
export const CAREER_GO = { garden: '庭いじりをしに家へ帰るところ', fishing: '釣りに出かけるところ', grandkids: '孫の顔を見に行くところ' };
export const CAREER_PREF = { garden: '庭いじり', fishing: '釣り', grandkids: '孫の世話' };
export const CAREER_TYPES = ['garden', 'fishing', 'grandkids'];

// ---------- 小道具 ----------
const alive = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null ? q : null; };
const jobName = (j) => JOBS[j]?.name || j;
const quotaOf = (sim, sid, job) => JOB_QUOTA[sim.town(sid).type]?.[job] ?? 0;
const yearsLeft = (sim, plan) => Math.max(0, (plan.deadline - sim.today) / DAYS_PER_YEAR);
const leftTxt = (sim, plan) => { const y = yearsLeft(sim, plan); return y >= 1 ? `あと${Math.round(y)}年` : `あと${Math.max(1, Math.round(plan.deadline - sim.today))}日`; };

function state(sim) {
  const S = sim.S;
  S.career = S.career || { v: 1, opened: 0, apprenticed: 0, graduated: 0, inherited: 0, retired: 0, achieved: 0, failed: 0, switched: 0, vacancy: 0, byGoal: {} };
  return S.career;
}

// 町ごとの職業の数（毎日1回数える）
function countJobs(sim) {
  const cnt = {};
  for (const p of sim.living()) { if (!p.job) continue; const c = cnt[p.s] || (cnt[p.s] = {}); c[p.job] = (c[p.job] || 0) + 1; }
  return cnt;
}
// その仕事を抜けても町が困らないか
function canLeave(sim, cnt, sid, job) {
  if (!job) return true;
  const q = quotaOf(sim, sid, job);
  return (cnt[sid]?.[job] || 0) - 1 >= q;
}
// その仕事を新しく始めても、町で余らないか（需要）
function canJoin(sim, cnt, sid, job, extra = 1) {
  const q = quotaOf(sim, sid, job);
  const n = cnt[sid]?.[job] || 0;
  if (q === 0) return n === 0 && !!SHOP_NOUN[job] && extra > 0; // 町にない店は1軒だけ
  const g = JOBS[job]?.goods, m = sim.S.towns[sid];
  if (g && m && m.stock?.[g] > (GOODS[g]?.target || 10) * 1.8) return false; // 品が余っている
  return n < q + extra;
}
function setJob(sim, p, job, skill) {
  if (p.job) p.formerJob = p.job;
  p.job = job;
  p.skill = p.skill || {};
  p.skill[job] = Math.max(p.skill[job] || 0, skill);
  if (!['royal', 'noble', 'knight'].includes(p.rank) || job === 'knight') p.rank = JOBS[job].rank;
  Object.assign(p, humanStats(sim, p));
}
const shopsIn = (sim, sid) => sim.town(sid).buildings.map((id) => sim.building(id)).filter((b) => b.shopOf != null);
const shopCap = (sim, sid) => Math.max(1, Math.floor(sim.living().filter((q) => q.s === sid).length / 18));

// 店の候補地と値段（空き家を買う／なければ新しく建てる）
function shopSite(sim, sid) {
  const town = sim.town(sid);
  const empty = town.buildings.map((id) => sim.building(id)).filter((b) => b.type === 'house' && b.hh == null && b.shopOf == null);
  if (empty.length) {
    const b = empty.sort((a, c) => (a.value || houseValue(sim, a)) - (c.value || houseValue(sim, c)))[0];
    return { b, price: b.value || houseValue(sim, b), build: false };
  }
  const mul = { capital: 1.6, port: 1.2, village: 0.8 }[town.type] || 1;
  return { b: null, price: Math.round(2.5 * 2 * 40 * mul * 1.15), build: true };
}
function shopCost(sim, sid) { return Math.round(shopSite(sim, sid).price) + 20; }

// ---------- 計画を選ぶ ----------
function candidates(sim, p, cnt) {
  const out = [], age = sim.ageOf(p), town = sim.townOf(p), hh = sim.hh(p);
  const dg = DREAM_GOAL[p.dream];
  const amb = p.values.ambition, C = p.pers.C, O = p.pers.O;
  const push = (goal, w, txt, need, job = null) => out.push({ goal, w: w * (dg === (goal === 'newshop' ? 'shop' : goal) ? 5 : 1), txt, need: Math.round(need), job });
  const skill = p.skill?.[p.job] || 0;
  // 職人として独立：自分の店を持つ
  if (SHOP_NOUN[p.job] && p.shop == null && !p.appr && age >= 20 && age <= 55 && skill >= 0.3) push('shop', 1.5 + amb * 3, `自分の${SHOP_NOUN[p.job]}を持つ`, shopCost(sim, p.s), p.job);
  // 転職して開業：町に足りない店を開く
  if ((COMMON.includes(p.job) || !p.job) && age >= 20 && age <= 45 && (amb > 0.45 || dg === 'shop') && canLeave(sim, cnt, p.s, p.job)) {
    const pop = sim.living().filter((q) => q.s === p.s).length;
    const need = Object.keys(SHOP_NOUN).filter((j) => (quotaOf(sim, p.s, j) > 0 ? canJoin(sim, cnt, p.s, j, 0) : pop >= 18 && TOWN_SHOPS.includes(j) && canJoin(sim, cnt, p.s, j, 1)));
    if (need.length) {
      const j = p.dream === '誰よりもうまいパンを焼く' && need.includes('baker') ? 'baker' : sim.rng.pick(need);
      push('newshop', 0.8 + amb * 2, `${SHOP_NOUN[j]}を開く`, shopCost(sim, p.s) + 40, j);
    }
  }
  if (town.type === 'capital' && ['soldier', 'guard', 'gatekeeper', 'watchman', 'royalguard'].includes(p.job) && age >= 19 && age <= 40 && p.values.courage > 0.35) push('knight', 1 + p.values.courage * 2 + amb, '騎士に取り立てられる', 150);
  if (town.type === 'capital' && (['scribe', 'teacher', 'alchemist', 'herbalist', 'doctor', 'butler'].includes(p.job) || O > 0.75) && !['scholar', 'wizard', 'courtmage', 'sage'].includes(p.job) && age >= 18 && age <= 45 && O > 0.5) push('scholar', 0.6 + O * 2, '学者になる', 120);
  if (town.type === 'port' && ['fisher', 'sailor'].includes(p.job) && age >= 20 && age <= 50) push('ship', 1 + amb * 2, '自分の船を持つ', 280);
  if (p.job === 'farmer' && hh && (hh.land || 0) < 10 && age >= 20 && age <= 60) push('land', 1.5 + C, (hh.land || 0) > 0 ? '畑を広げる' : '自分の畑を持つ', 160);
  const home = sim.homeOf(p);
  if (home && home.type === 'house' && home.owner != null && home.owner !== p.hh && age >= 22 && age <= 60) push('house', 1.5 + p.values.family * 2, '自分の家を持つ', Math.round((home.value || houseValue(sim, home)) * 1.15));
  if (hh && age >= 24 && age <= 55 && hh.members.some((id) => { const k = alive(sim, id); return k && (p.children || []).includes(k.id) && sim.ageOf(k) >= 5 && sim.ageOf(k) <= 12; })) push('tutor', 0.8 + p.values.family * 2, '子どもに読み書きを習わせる', 50);
  if (age >= 44 && age <= 62) push('nest', 0.6 + C + (1 - amb), town.type === 'village' ? '老後は畑を眺めて静かに暮らす' : '老後は田舎で静かに暮らす', 130);
  return out;
}

function newPlan(sim, p, cnt) {
  const R = sim.rng;
  const cands = candidates(sim, p, cnt);
  if (!cands.length) return null;
  const c = R.weighted(cands, (x) => x.w);
  const rate = 0.5 + p.pers.C * 1.2;
  const years = clamp(Math.ceil(c.need / (rate * DAYS_PER_YEAR)) + R.int(0, 2), 1, 8);
  const fromDream = DREAM_GOAL[p.dream] === (c.goal === 'newshop' ? 'shop' : c.goal);
  p.plan = { goal: c.goal, job: c.job, txt: c.txt, need: c.need, saved: 0, since: sim.today, deadline: sim.today + years * DAYS_PER_YEAR, stage: 'saving', fromDream };
  // 夢が叶った・夢を諦めた人は、この計画を新しい夢にする
  if (p._dreamFree) { p.dream = c.txt; p.plan.fromDream = true; p._dreamFree = false; }
  return p.plan;
}

// ---------- はじめに ----------
export function initCareer(sim) {
  const st = state(sim);
  if (st.init) return;
  st.init = true;
  const R = sim.rng, cnt = countJobs(sim);
  for (const p of sim.living()) {
    const age = sim.ageOf(p);
    // 親と同じ職人の若者は、親が師匠
    if (age >= 14 && age <= 20 && p.job && CRAFTS.includes(p.job)) {
      const par = [alive(sim, p.fatherId), alive(sim, p.motherId)].find((q) => q && q.job === p.job && q.s === p.s);
      if (par && (p.skill?.[p.job] || 0) < 0.5) { p.master = par.id; p.appr = true; p.apprSince = sim.today; (par.apprentices = par.apprentices || []).push(p.id); }
    }
    if (age < 18 || NO_PLAN_RANK.includes(p.rank) || p.jail != null || sim.hh(p)?.bandits || p.appr) continue;
    if (!R.chance(0.7)) continue;
    const plan = newPlan(sim, p, cnt);
    if (!plan) continue;
    // これまでに貯めてきた分：家計と財布から少しずつ（お金は増やさない）
    const hh = sim.hh(p);
    const years = clamp((age - 18) / 12, 0, 1.5);
    const want = Math.round(plan.need * R.range(0.05, 0.75) * years);
    let got = Math.min(want, Math.max(0, (p.purse || 0) - 3));
    p.purse -= got;
    if (hh && got < want && hh.money > 60) { const x = Math.min(want - got, (hh.money - 60) * 0.35); hh.money -= x; got += x; }
    plan.saved = Math.round(got);
    plan.since = sim.today - R.int(0, DAYS_PER_YEAR * 2);
  }
}

// ---------- 毎日 ----------
export function careerDaily(sim) {
  const S = sim.S, R = sim.rng;
  const st = state(sim);
  if (!st.init) initCareer(sim);
  const cnt = countJobs(sim);
  const doy = sim.dayOfYear();
  for (const p of sim.living()) {
    if (p.jail != null) continue;
    const age = sim.ageOf(p);
    if (age < 14) continue;
    // 見習い：師匠の腕を少しずつ受け継ぐ
    if (p.master != null) apprenticeDay(sim, p, cnt);
    // 若者の弟子入り
    else if (age <= 18 && !p.appr && R.chance(0.02)) seekMaster(sim, p, cnt);
    // 引退（誕生日に考える）
    if (p.birthDay === doy && age >= 55 && age < 68 && p.job && !p.retired) considerRetire(sim, p, cnt);
    if (age < 18 || NO_PLAN_RANK.includes(p.rank) || sim.hh(p)?.bandits) continue;
    const plan = p.plan;
    if (!plan || plan.stage === 'done' || plan.stage === 'failed') {
      if ((p.planRest || 0) <= sim.today && !p.appr && age <= 62 && R.chance(0.08)) newPlan(sim, p, cnt);
      continue;
    }
    planDay(sim, p, plan, cnt);
  }
  // 店の後始末：店主がいなくなった店
  for (const sid of S.world.settlements.map((s) => s.id)) for (const b of shopsIn(sim, sid)) {
    const o = S.people[b.shopOf];
    if (o && o.deathYear == null && o.shop === b.id && o.job === b.shopJob) continue;
    closeShop(sim, b, o);
  }
  // 町の欠員：人手の足りない仕事に、余っている仕事の大人が就く（週に1度、町ごとに1人まで）
  if (sim.dayIndex % 7 === 3) fillVacancies(sim, countJobs(sim));
}

// 計画の1日：貯める → 達成 → 期限切れ
function planDay(sim, p, plan, cnt) {
  const hh = sim.hh(p), R = sim.rng;
  // 暮らしに困ったら、貯金を取り崩す
  if (hh && hh.money < 8 && plan.saved > 10) {
    const x = Math.min(plan.saved, 15); plan.saved -= x; hh.money += x;
    if (R.chance(0.5)) sim.remember(p, `暮らしが苦しく、${plan.txt}ための蓄えを少し取り崩した`, { emo: -0.5, imp: 0.5, k: 'career' });
  }
  if (plan.stage === 'saving') {
    const rate = 0.25 * (0.5 + p.pers.C);
    const fromPurse = Math.min(Math.max(0, (p.purse || 0) - 3) * rate, 4);
    p.purse = (p.purse || 0) - fromPurse;
    let fromHh = 0;
    if (hh && hh.money > 110 && sim.ageOf(p) >= 20) { fromHh = Math.min((hh.money - 110) * 0.02, 2); hh.money -= fromHh; }
    plan.saved = Math.min(plan.need, plan.saved + fromPurse + fromHh);
    if (plan.saved >= plan.need) { plan.stage = 'waiting'; sim.remember(p, `${plan.txt}ためのお金がとうとう貯まった`, { emo: 0.7, imp: 0.6, k: 'career' }); }
    else if (plan.saved >= plan.need * 0.8 && !plan.near) { plan.near = true; sim.remember(p, `${plan.txt}まで、あと少しだ`, { emo: 0.5, imp: 0.4, k: 'career' }); }
  }
  if (plan.stage === 'waiting' && R.chance(0.35)) achieve(sim, p, plan, cnt);
  if ((plan.stage === 'saving' || plan.stage === 'waiting') && sim.today > plan.deadline) giveUp(sim, p, plan);
}

function giveUp(sim, p, plan) {
  const st = state(sim), hh = sim.hh(p);
  const why = plan.stage === 'waiting' ? 'お金は貯まったのに機会に恵まれず' : '思うようにお金が貯まらず';
  plan.stage = 'failed';
  const back = plan.saved; plan.saved = 0;
  p.purse = (p.purse || 0) + back * 0.4; if (hh) hh.money += back * 0.6; else p.purse += back * 0.6;
  sim.remember(p, `${why}、${plan.txt}という夢を諦めた`, { emo: -0.7, imp: 0.8, k: 'career' });
  p.planRest = sim.today + 10;
  if (plan.fromDream || p.dream === plan.txt) p._dreamFree = true;
  st.failed++;
  if (sim.rng.chance(0.4)) sim.pushLog(`${sim.fullName(p)}は、${plan.txt}という夢を諦めたらしい。`, 'event', [p.id], p.pos);
}

// ---------- 達成 ----------
function achieve(sim, p, plan, cnt) {
  const S = sim.S, st = state(sim), town = sim.townOf(p), hh = sim.hh(p), year = sim.year();
  const done = (memo, deed, log, chron) => {
    plan.stage = 'done'; plan.doneDay = sim.today;
    st.achieved++; st.byGoal[plan.goal] = (st.byGoal[plan.goal] || 0) + 1;
    sim.remember(p, memo, { emo: 0.95, imp: 0.95, k: 'career' });
    if (deed) p.deeds.push(`${year}年、${deed}`);
    p.needs.esteem = 100;
    const fam = hh ? hh.members.map((id) => alive(sim, id)).filter((q) => q && q !== p && sim.ageOf(q) >= 8) : [];
    for (const q of fam) sim.remember(q, `${p.given}が${log}`, { emo: 0.7, imp: 0.6, about: [p.id], k: 'career' });
    sim.gossip(p, log, 0.5, sim.living().filter((q) => q.s === p.s && q.hh !== p.hh && sim.rel(q, p).f > 20).slice(0, 30), { silent: true, congrat: 'おめでとう、念願がかなったんだってね' });
    sim.pushLog(`${sim.fullName(p)}が${log}。`, 'event', [p.id], p.pos);
    if (chron) sim.chron(chron, town.kingdom);
    p.planRest = sim.today + 20;
    if (plan.fromDream || p.dream === plan.txt) p._dreamFree = true;
  };
  switch (plan.goal) {
    case 'shop': case 'newshop': {
      const job = plan.job;
      if (plan.goal === 'newshop' && (!canJoin(sim, cnt, p.s, job, 1) || !canLeave(sim, cnt, p.s, p.job))) return;
      if (plan.goal === 'shop' && p.job !== job) return;
      if (shopsIn(sim, p.s).length >= shopCap(sim, p.s)) return;
      const site = shopSite(sim, p.s);
      if (site.price + 20 > plan.saved + Math.max(0, (hh?.money || 0) - 60)) return;
      const b = site.b || sim.placeHouse(town);
      if (!b) return;
      b.value = b.value || houseValue(sim, b);
      const price = Math.round(site.b ? b.value : b.value * 1.15);
      if (price > plan.saved + Math.max(0, (hh?.money || 0) - 30)) { if (!site.b) { b.name = '空き家'; b.hh = null; b.owner = null; sim.events.push({ type: 'building', id: b.id }); } return; }
      let need = price; const t = Math.min(need, plan.saved); plan.saved -= t; need -= t;
      if (need > 0 && hh) hh.money -= need;
      p.purse = (p.purse || 0) + plan.saved; plan.saved = 0; // 余りは財布へ
      const seller = site.b && b.owner != null ? S.households[b.owner] : null;
      if (seller && seller.id !== p.hh) seller.money += price; else S.towns[p.s].fund += price;
      if (plan.goal === 'newshop') { setJob(sim, p, job, 0.3); cnt[p.s][job] = (cnt[p.s][job] || 0) + 1; st.switched++; }
      openShop(sim, p, b);
      st.opened++;
      const noun = SHOP_NOUN[job];
      const built = site.build ? `${noun}を建てて` : `空き家を買い取って${noun}に仕立て、`;
      done(`${built}念願の自分の${noun}を開いた`, `念願の${noun}を開いた`, `${town.name}に念願の${noun}を開いた`, `${sim.fullName(p)}が${town.name}に${noun}「${b.name}」を開いた`);
      return;
    }
    case 'knight': {
      if ((cnt[p.s]?.knight || 0) >= quotaOf(sim, p.s, 'knight') + 1) return;
      if ((p.lv || 1) < 3 && !sim.rng.chance(0.3)) return;
      const k = sim.kingdomOf(p);
      p.purse += plan.saved * 0.2; plan.saved = 0;
      const old = p.job;
      setJob(sim, p, 'knight', 0.35);
      cnt[p.s].knight = (cnt[p.s].knight || 0) + 1; if (cnt[p.s][old]) cnt[p.s][old]--;
      st.switched++;
      done(`鎧と馬をそろえ、ついに騎士に叙された`, `${k?.name || '王国'}の騎士に叙された`, '騎士に叙された', `${jobName(old)}の${sim.fullName(p)}が騎士に叙された`);
      return;
    }
    case 'scholar': {
      if ((cnt[p.s]?.scholar || 0) >= quotaOf(sim, p.s, 'scholar') + 1 || !canLeave(sim, cnt, p.s, p.job)) return;
      plan.saved = 0;
      const old = p.job;
      setJob(sim, p, 'scholar', 0.3);
      cnt[p.s].scholar = (cnt[p.s].scholar || 0) + 1; if (old && cnt[p.s][old]) cnt[p.s][old]--;
      st.switched++;
      done('書物をそろえ、学者として天文台に通えるようになった', `${jobName(old)}から学者に転じた`, '学者の道に進んだ', null);
      return;
    }
    case 'ship': {
      if ((cnt[p.s]?.captain || 0) >= quotaOf(sim, p.s, 'captain') + 1 || !canLeave(sim, cnt, p.s, p.job)) return;
      S.towns[p.s].fund += plan.saved; plan.saved = 0;
      const old = p.job;
      setJob(sim, p, 'captain', 0.35);
      cnt[p.s].captain = (cnt[p.s].captain || 0) + 1; if (cnt[p.s][old]) cnt[p.s][old]--;
      st.switched++;
      const ship = sim.rng.pick(['カモメ号', '潮風号', '朝凪号', '海燕号', 'マリア号', '北斗号', '銀鱗号']);
      done(`念願の自分の船「${ship}」を手に入れ、船長になった`, `自分の船「${ship}」を持ち、船長になった`, `自分の船「${ship}」を手に入れ、船長になった`, `${sim.fullName(p)}が${town.name}で船「${ship}」を手に入れた`);
      return;
    }
    case 'land': {
      if (!hh) return;
      const lord = Object.values(S.households).filter((h) => h.id !== hh.id && h.s === p.s && (h.land || 0) >= 6).sort((a, b) => b.land - a.land)[0];
      if (lord) { lord.land -= 2; lord.money += plan.saved; } else S.towns[p.s].fund += plan.saved;
      plan.saved = 0;
      hh.land = (hh.land || 0) + 2;
      done(lord ? `${lord.name}から畑を買い足し、畑が${hh.land}区画になった` : `荒れ地を切り開いて、畑が${hh.land}区画になった`, `畑を${hh.land}区画に広げた`, '畑を広げた', null);
      return;
    }
    case 'house': {
      const b = sim.homeOf(p);
      if (!b || !hh || b.owner === hh.id) { plan.stage = 'done'; return; }
      const lord = S.households[b.owner];
      const price = Math.round((b.value || houseValue(sim, b)) * 1.15);
      if (plan.saved + Math.max(0, hh.money - 60) < price) return;
      let need = price; const t = Math.min(need, plan.saved); plan.saved -= t; need -= t; hh.money -= need;
      hh.money += plan.saved; plan.saved = 0;
      if (lord) lord.money += price; else S.towns[p.s].fund += price;
      b.owner = hh.id; b.rent = 0; b.arrears = 0; b.name = hh.name;
      done(`${price}銅貨で借りていた家を買い取った。ついに我が家だ`, '借りていた家を買い取った', '借りていた家を買い取った', null);
      return;
    }
    case 'tutor': {
      const kids = (p.children || []).map((id) => alive(sim, id)).filter((k) => k && sim.ageOf(k) >= 5 && sim.ageOf(k) <= 14);
      if (!kids.length) { p.purse += plan.saved; plan.saved = 0; plan.stage = 'done'; p.planRest = sim.today + 10; return; }
      const teacher = sim.living().find((q) => q.job === 'teacher' && q.s === p.s) || sim.living().find((q) => q.job === 'priest' && q.s === p.s);
      if (teacher && sim.hh(teacher)) sim.hh(teacher).money += plan.saved; else S.towns[p.s].fund += plan.saved;
      plan.saved = 0;
      for (const k of kids) {
        k.skill = k.skill || {}; k.skill.study = Math.min(1, (k.skill.study || 0) + 0.25);
        sim.remember(k, `${teacher ? teacher.given + 'に' : ''}読み書きを習いはじめた`, { emo: 0.5, imp: 0.6, about: teacher ? [teacher.id] : [], k: 'career' });
      }
      done(`子どもに${teacher ? teacher.given + 'のもとで' : ''}読み書きを習わせてやれた`, null, '子どもに読み書きを習わせはじめた', null);
      return;
    }
    case 'nest': {
      p.nestEgg = (p.nestEgg || 0) + plan.saved; plan.saved = 0;
      done('老後の蓄えができた。これでいつ仕事を退いても大丈夫だ', null, '老後の蓄えをこしらえた', null);
      return;
    }
  }
}

function openShop(sim, p, b) {
  const noun = SHOP_NOUN[p.job] || '店';
  b.owner = p.hh; b.hh = b.hh ?? p.hh; b.rent = 0; b.arrears = 0;
  b.shopOf = p.id; b.shopJob = p.job; b.name = `${p.given}の${noun}`;
  p.shop = b.id;
  sim.events.push({ type: 'building', id: b.id });
}
function closeShop(sim, b, o) {
  if (o && !o._succ) succession(sim, o);
  if (b.shopOf !== o?.id) return; // 弟子や子が継いだ
  if (o && o.shop === b.id) o.shop = null;
  b.shopOf = null; b.shopJob = null;
  const hh = b.hh != null ? sim.S.households[b.hh] : null;
  if (!hh || hh.house !== b.id) { b.hh = null; b.name = '空き家'; }
  sim.events.push({ type: 'building', id: b.id });
}
function inheritShop(sim, o, heir, b) {
  const st = state(sim), noun = SHOP_NOUN[b.shopJob] || '店';
  o.shop = null;
  b.shopOf = heir.id; b.owner = heir.hh; b.hh = heir.hh; b.name = `${heir.given}の${noun}`; b.rent = 0; b.arrears = 0;
  heir.shop = b.id;
  st.inherited++;
  const why = o.deathYear != null ? '亡き' : '引退した';
  const kin = sim.kinTerm(heir, o);
  const who = kin ? `${kin}の${o.given}` : `師匠${o.given}`;
  sim.remember(heir, `${why}${who}の${noun}を継いだ`, { emo: 0.6, imp: 0.95, about: [o.id], k: 'career' });
  heir.deeds.push(`${sim.year()}年、${who}の${noun}を継いだ`);
  if (o.deathYear == null) sim.remember(o, `${kin ? (sim.kinTerm(o, heir) || '') + 'の' : '一番弟子の'}${heir.given}に${noun}を譲った`, { emo: 0.5, imp: 0.85, about: [heir.id], k: 'career' });
  sim.pushLog(`${sim.fullName(heir)}が、${why}${kin ? kin : '師匠'}${sim.fullName(o)}の${noun}を継いだ。`, 'event', [heir.id], heir.pos);
  sim.chron(`${sim.fullName(heir)}が${why}${kin ? kin : '師匠'}${sim.fullName(o)}の${noun}を継いだ`, sim.townOf(heir).kingdom);
  sim.events.push({ type: 'building', id: b.id });
}

// 師匠（店主）が亡くなった・引退したとき：一番弟子（いなければ同じ仕事の子）が跡を継ぎ、ほかの弟子は跡継ぎのもとへ
function succession(sim, m) {
  if (m._succ) return;
  m._succ = true;
  const job = m.job || m.formerJob;
  const apps = (m.apprentices || []).map((id) => alive(sim, id)).filter((q) => q && q.master === m.id);
  const same = apps.filter((q) => q.job === job && q.s === m.s);
  const child = (m.children || []).map((id) => alive(sim, id)).find((q) => q && q.job === job && q.s === m.s && sim.ageOf(q) >= 16 && q.shop == null);
  const heir = same[0] || child || null;
  const b = m.shop != null ? sim.building(m.shop) : null;
  if (heir) {
    heir.skill[job] = Math.max(heir.skill[job] || 0, 0.35);
    if (heir.master === m.id) { heir.formerMaster = m.id; heir.master = null; heir.appr = false; }
    if (b && b.shopOf === m.id && heir.shop == null) inheritShop(sim, m, heir, b);
    else if (same[0] === heir) {
      sim.remember(heir, `師匠の${m.given}が${m.deathYear != null ? '亡くなり' : '仕事を退き'}、跡を継いで一人前として働くことになった`, { emo: 0.2, imp: 0.9, about: [m.id], k: 'career' });
      heir.deeds.push(`${sim.year()}年、師匠${m.given}の跡を継いだ`);
      state(sim).inherited++;
    }
  }
  for (const q of apps) {
    if (q === heir) continue;
    q.formerMaster = m.id;
    if (heir && q.job === job && q.appr && (heir.skill[job] || 0) >= 0.4) {
      q.master = heir.id; (heir.apprentices = heir.apprentices || []).push(q.id);
      sim.remember(q, `兄弟子の${heir.given}のもとで修業を続けることになった`, { emo: 0.1, imp: 0.6, about: [heir.id], k: 'career' });
    } else {
      q.master = null; q.appr = false;
      if (q.job === job) q.skill[job] = Math.max(q.skill[job] || 0, 0.3);
      sim.remember(q, `師匠の${m.given}を失い、ひとりで腕を磨くことになった`, { emo: -0.4, imp: 0.7, about: [m.id], k: 'career' });
    }
  }
}

// ---------- 弟子入りと継承 ----------
function seekMaster(sim, p, cnt) {
  const R = sim.rng;
  if (p.shop != null) return;
  const cur = p.job;
  if (cur && !COMMON.includes(cur)) return; // 親の職人仕事を継いでいる若者はそのまま
  if ((p.skill?.[cur] || 0) > 0.4) return;
  const drive = p.values.ambition * 0.6 + p.pers.O * 0.4 + (DREAM_GOAL[p.dream] === 'shop' ? 0.3 : 0);
  if (!R.chance(drive * 0.8)) return;
  if (!canLeave(sim, cnt, p.s, cur)) return;
  const masters = sim.living().filter((q) => q.s === p.s && CRAFTS.includes(q.job) && !q.appr && q.id !== p.id && (q.skill?.[q.job] || 0) >= 0.45 && sim.ageOf(q) >= 25 && sim.ageOf(q) < 66
    && (q.apprentices || []).filter((id) => alive(sim, id)?.master === q.id).length < 2 && canJoin(sim, cnt, p.s, q.job, 2) && !sim.isKin(q, p));
  if (!masters.length) return;
  const m = R.weighted(masters, (q) => 1 + (q.skill[q.job] || 0) + (p.dream === '誰よりもうまいパンを焼く' && q.job === 'baker' ? 5 : 0) + Math.max(0, sim.rel(p, q).a) / 30);
  setJob(sim, p, m.job, 0.1);
  if (cur) cnt[p.s][cur]--;
  cnt[p.s][m.job] = (cnt[p.s][m.job] || 0) + 1;
  p.master = m.id; p.appr = true; p.apprSince = sim.today;
  (m.apprentices = m.apprentices || []).push(p.id);
  sim.relMut(p, m).a += 10; sim.relMut(m, p).a += 8;
  state(sim).apprenticed++;
  sim.remember(p, `${cur ? jobName(cur) + 'の仕事をやめ、' : ''}${jobName(m.job)}の${m.given}に弟子入りした`, { emo: 0.7, imp: 0.9, about: [m.id], k: 'career' });
  sim.remember(m, `${p.given}を弟子にとった`, { emo: 0.5, imp: 0.7, about: [p.id], k: 'career' });
  for (const id of [p.fatherId, p.motherId]) { const q = alive(sim, id); if (q) sim.remember(q, `${p.given}が${jobName(m.job)}の${m.given}に弟子入りした`, { emo: 0.5, imp: 0.6, about: [p.id, m.id], k: 'career' }); }
  sim.pushLog(`${sim.fullName(p)}（${sim.ageOf(p)}歳）が、${jobName(m.job)}の${sim.fullName(m)}に弟子入りした。`, 'event', [p.id, m.id], p.pos);
}

function apprenticeDay(sim, p, cnt) {
  const m = sim.S.people[p.master];
  const job = p.job;
  // 師匠がいなくなった（亡くなった・引退した・職を変えた）
  if (!m || m.deathYear != null || m.job !== job || m.s !== p.s) {
    if (m && !m._succ) succession(sim, m);
    if (p.master === m?.id || !m) { p.formerMaster = p.master; p.master = null; p.appr = false; }
    return;
  }
  if (!p.appr) { p.formerMaster = p.master; p.master = null; return; }
  // 修業：師匠の腕に引っぱられて上達する
  const ms = m.skill?.[job] || 0.5;
  p.skill[job] = Math.min(ms, (p.skill[job] || 0.1) + 0.0045 * (0.5 + ms) * (0.5 + p.pers.C));
  if (sim.rng.chance(0.02)) sim.relMut(p, m).a += sim.rng.chance(0.8) ? 3 : -4;
  if ((p.skill[job] || 0) >= 0.5 && sim.ageOf(p) >= 17 && sim.today - (p.apprSince || 0) >= 20) {
    p.appr = false;
    state(sim).graduated++;
    sim.remember(p, `師匠の${m.given}に認められ、一人前の${jobName(job)}になった`, { emo: 0.9, imp: 0.95, about: [m.id], k: 'career' });
    sim.remember(m, `弟子の${p.given}が一人前になった。教えた甲斐があった`, { emo: 0.7, imp: 0.7, about: [p.id], k: 'career' });
    p.deeds.push(`${sim.year()}年、${m.given}のもとで修業を終え、一人前の${jobName(job)}になった`);
    sim.relMut(p, m).a += 15;
    sim.pushLog(`${sim.fullName(p)}が師匠${sim.fullName(m)}に認められ、一人前の${jobName(job)}になった。`, 'event', [p.id, m.id], p.pos);
  }
}

// ---------- 引退 ----------
function considerRetire(sim, p, cnt) {
  const R = sim.rng, age = sim.ageOf(p), job = p.job;
  if (NO_RETIRE.includes(job) || JOBS[job]?.crook) return;
  const skill = p.skill?.[job] || 0.3;
  const body = p.maxhp ? clamp((p.hp ?? p.maxhp) / p.maxhp, 0.2, 1) : 1;
  const heir = (p.apprentices || []).map((id) => alive(sim, id)).find((q) => q && q.job === job && q.s === p.s)
    || (p.children || []).map((id) => alive(sim, id)).find((q) => q && q.job === job && q.s === p.s && sim.ageOf(q) >= 18);
  const spare = (cnt[p.s]?.[job] || 0) > quotaOf(sim, p.s, job);
  if (!heir && !spare && age < 62) return;
  const nest = p.nestEgg || (p.plan?.goal === 'nest' && p.plan.stage === 'done');
  const chance = clamp(0.07 * (age - 54) + (1 - body) * 0.5 + (0.5 - p.pers.C) * 0.2 - (skill - 0.5) * 0.3 + (nest ? 0.15 : 0) + (heir ? 0.1 : 0), 0.02, 0.85);
  if (!R.chance(chance)) return;
  const st = state(sim);
  sim.remember(p, `${heir ? heir.given + 'に後を任せ、' : ''}長年続けた${jobName(job)}の仕事から退いた`, { emo: 0.2, imp: 0.9, about: heir ? [heir.id] : [], k: 'career' });
  p.formerJob = job; p.job = null; p.retired = true; p.retiredYear = sim.year();
  if (cnt[p.s]?.[job]) cnt[p.s][job]--;
  if (p.plan && (p.plan.stage === 'saving' || p.plan.stage === 'waiting') && p.plan.goal !== 'nest' && p.plan.goal !== 'house') {
    p.purse = (p.purse || 0) + p.plan.saved; p.plan.saved = 0; p.plan.stage = 'failed';
  }
  if (p.nestEgg) { const hh = sim.hh(p); if (hh) hh.money += p.nestEgg * 0.5; p.purse = (p.purse || 0) + p.nestEgg * 0.5; p.nestEgg = 0; }
  // 店と弟子は、一番弟子（いなければ同じ仕事の子）に託す
  succession(sim, p);
  st.retired++;
  p.deeds.push(`${sim.year()}年、${age}歳で${jobName(job)}の仕事から退いた`);
  sim.gossip(p, `${jobName(job)}の仕事から退いた`, 0.2, sim.living().filter((q) => q.s === p.s && sim.rel(q, p).f > 30).slice(0, 20), { silent: true, congrat: '長いあいだ、お疲れさま' });
  sim.pushLog(`${sim.fullName(p)}（${age}歳）が、長年続けた${jobName(job)}の仕事から退いた。`, 'event', [p.id], p.pos);
}

// ---------- 欠員補充 ----------
function fillVacancies(sim, cnt) {
  const R = sim.rng, st = state(sim);
  for (const s of sim.S.world.settlements) {
    if (sim.S.towns[s.id].occupied) continue;
    const quota = JOB_QUOTA[s.type] || {};
    const lacking = Object.keys(quota).filter((j) => !NO_VACANCY.includes(j) && (cnt[s.id]?.[j] || 0) < quota[j]);
    if (!lacking.length) continue;
    const job = R.pick(lacking);
    const pool = sim.living().filter((q) => q.s === s.id && !q.appr && q.shop == null && !q.retired && q.jail == null && sim.ageOf(q) >= 16 && sim.ageOf(q) <= 50
      && !NO_PLAN_RANK.includes(q.rank) && !['noble', 'knight'].includes(q.rank) && !sim.hh(q)?.bandits
      && (q.job ? COMMON.includes(q.job) && canLeave(sim, cnt, s.id, q.job) : !q.formerJob));
    if (!pool.length) continue;
    const p = R.weighted(pool, (q) => 1 + q.pers.C + (q.job ? 0 : 1));
    const old = p.job;
    setJob(sim, p, job, 0.2);
    if (old) cnt[s.id][old]--;
    (cnt[s.id] || (cnt[s.id] = {}))[job] = (cnt[s.id][job] || 0) + 1;
    st.vacancy++;
    sim.remember(p, `${s.name}で${jobName(job)}の手が足りないと聞き、${old ? jobName(old) + 'から' : ''}${jobName(job)}に転じた`, { emo: 0.4, imp: 0.8, k: 'career' });
    sim.pushLog(`${s.name}で${jobName(job)}の口に空きが出て、${sim.fullName(p)}が${old ? jobName(old) + 'から' : ''}${jobName(job)}になった。`, 'event', [p.id], p.pos);
  }
}

// ---------- 仕事場 ----------
export function careerWorkPlace(sim, p) {
  if (p.shop == null) return null;
  const b = sim.building(p.shop);
  if (!b || b.shopOf !== p.id || p.job !== b.shopJob) return null;
  return { x: b.door.x, z: b.door.z, bld: b.id };
}

// ---------- 引退した人の過ごし方 ----------
export function careerOptions(sim, p, add) {
  if (!p.retired || p.job) return;
  const h = sim.hour(), age = sim.ageOf(p), R = sim.rng;
  if (h < 8 || h >= 18) return;
  const hh = sim.hh(p);
  if (hh && hh.house != null) add(2 + p.pers.C * 1.5 + (sim.seasonIdx() < 3 ? 0.8 : -1), 'garden', sim.placeFor(p, 'home'), R.int(40, 90));
  if (!sim.townOf(p).occupied) add(1.5 + (1 - p.pers.E) * 1.5 + (p.formerJob === 'fisher' || p.formerJob === 'sailor' ? 1.5 : 0), 'fishing', sim.placeFor(p, 'shore'), R.int(60, 120));
  const gk = grandkids(sim, p);
  if (gk.length) { const k = R.pick(gk); add(2.5 + p.values.family * 2.5, 'grandkids', k.hh === p.hh ? sim.placeFor(p, 'home') : sim.placeFor(k, 'home'), R.int(40, 90), { friend: k.id }); }
  if (age < 68) add(1.5 + p.pers.E * 2, 'storytell', sim.placeFor(p, 'plaza'), R.int(40, 90));
}
function grandkids(sim, p) {
  const out = [];
  for (const c of p.children || []) { const ch = sim.S.people[c]; if (!ch) continue; for (const g of ch.children || []) { const k = alive(sim, g); if (k && k.s === p.s && sim.ageOf(k) < 12) out.push(k); } }
  return out;
}

export function careerDo(sim, p, dt) {
  const a = p.action, n = p.needs, hr = dt / 60, R = sim.rng;
  if (!a || !CAREER_TYPES.includes(a.type)) return false;
  switch (a.type) {
    case 'garden': {
      n.pleasure += 10 * hr; n.sloth += 3 * hr; n.esteem += 1 * hr;
      const hh = sim.hh(p); if (hh && sim.seasonIdx() !== 3) hh.food += 0.08 * hr;
      if (R.chance(0.002 * dt)) sim.remember(p, R.pick(['庭の豆がよく育った', '庭に植えた花が咲いた', '畑の隅でカボチャが大きくなっている']), { emo: 0.4, imp: 0.3, k: 'garden' });
      break;
    }
    case 'fishing': {
      n.pleasure += 12 * hr; n.sloth += 4 * hr;
      if (R.chance(0.004 * dt)) { const hh = sim.hh(p); if (hh) hh.food += 1; sim.remember(p, R.pick(['釣りで大きな魚が釣れた', '一日粘って小魚が数匹', '川べりで昔の仲間に会い、一緒に釣りをした']), { emo: 0.5, imp: 0.3, k: 'fishing' }); }
      break;
    }
    case 'grandkids': {
      n.pleasure += 14 * hr; n.esteem += 2 * hr;
      const k = alive(sim, a.friend);
      if (k) {
        k.needs.pleasure = Math.min(100, k.needs.pleasure + 10 * hr);
        if (R.chance(0.003 * dt)) {
          const [what, got] = R.pick([['昔話を聞かせた', '昔話を聞かせてくれた'], ['こっそりお菓子をあげた', 'こっそりお菓子をくれた'], ['木の笛を作ってやった', '木の笛を作ってくれた'], ['字を教えてやった', '字を教えてくれた']]);
          sim.remember(p, `孫の${k.given}に${what}`, { emo: 0.7, imp: 0.4, about: [k.id], k: 'grandkids' });
          sim.remember(k, `${sim.kinTerm(k, p) || p.given}が${got}`, { emo: 0.7, imp: 0.45, about: [p.id], k: 'grandkids' });
          sim.relMut(k, p).a += 3;
        }
      }
      break;
    }
  }
  for (const key of Object.keys(n)) n[key] = clamp(n[key], 0, 100);
  return true;
}

// ---------- 心の声・会話・詳細欄 ----------
export function careerThought(sim, p) {
  const R = sim.rng, plan = p.plan, age = sim.ageOf(p);
  const opts = [];
  if (p.appr && p.master != null) {
    const m = sim.S.people[p.master];
    if (m) opts.push(`${m.given}師匠の手つき、今日こそ盗んでみせる。`, `いつか師匠に「もう教えることはない」と言わせたい。`, `また${m.given}師匠に叱られた……でも、少しは上達したはずだ。`);
  }
  if ((p.apprentices || []).some((id) => alive(sim, id)?.master === p.id)) opts.push('弟子に教えることで、自分も学んでいる気がする。', 'あいつもだいぶ腕が上がってきたな。');
  if (p.retired) opts.push('若いころは朝から晩まで働いたものだ。', 'のんびり暮らすのも悪くない。', `${jobName(p.formerJob)}だったころの手の感覚は、まだ覚えている。`);
  if (p.shop != null && p.action?.type === 'work') opts.push('自分の店だと思うと、仕事にも力が入る。', 'お客さんが来てくれるといいな。');
  if (plan && (plan.stage === 'saving' || plan.stage === 'waiting')) {
    const r = plan.saved / Math.max(1, plan.need);
    if (plan.stage === 'waiting') opts.push(`お金は貯まった。あとは${plan.txt}機会を待つだけだ。`);
    else if (r >= 0.8) opts.push(`あと少しで${plan.txt}ことができる……！`, `${plan.txt}日まで、もうひと踏ん張り。`);
    else if (r >= 0.4) opts.push(`${plan.txt}ために、今日も少し貯めておこう。`, `貯えは${Math.round(plan.saved)}銅貨。まだまだ先は長い。`);
    else opts.push(`${plan.txt}なんて、夢のまた夢かな……。`, `コツコツ貯めれば、いつか${plan.txt}ことができるはず。`);
    if (yearsLeft(sim, plan) < 0.5 && r < 0.7) opts.push(`このままじゃ${plan.txt}のは無理かもしれない……。`);
  }
  if (plan?.stage === 'done' && sim.today - (plan.doneDay || 0) < 10) opts.push(`${plan.txt}という夢がかなった。まだ信じられない。`);
  if (plan?.stage === 'failed' && (p.planRest || 0) > sim.today) opts.push(`${plan.txt}夢は、諦めるしかなかった……。`);
  if (!opts.length) return null;
  return R.pick(opts);
}

export function careerSay(sim, p) {
  const R = sim.rng, plan = p.plan;
  if (p.appr && p.master != null) { const m = sim.S.people[p.master]; if (m) return R.pick([`いま${m.given}さんのところで${jobName(p.job)}の修業をしてるんだ`, `師匠の${m.given}さんは厳しいけど、腕は確かだよ`]); }
  if (p.shop != null) { const b = sim.building(p.shop); if (b) return R.pick([`${b.name}、よかったら寄っていってね`, `自分の店を持って、やっと一人前になった気がするよ`]); }
  if (p.retired) return R.pick([`${jobName(p.formerJob)}の仕事はもう若い者に任せたよ`, '仕事を退いてからは、庭いじりと孫の相手が楽しみでね']);
  if (plan && (plan.stage === 'saving' || plan.stage === 'waiting')) {
    const r = plan.saved / Math.max(1, plan.need);
    if (r >= 0.8) return R.pick([`あと少しで${plan.txt}ことができるんだ`, `もうすぐ${plan.txt}。楽しみでね`]);
    return R.pick([`いつか${plan.txt}つもりで、少しずつ貯めてるんだ`, `${plan.txt}までは、無駄づかいできないよ`]);
  }
  if (plan?.stage === 'done' && sim.today - (plan.doneDay || 0) < 20) return `念願かなって、${pastOf(plan.txt)}んだよ`;
  return null;
}

const PAST = [['持つ', '持てた'], ['開く', '開けた'], ['なる', 'なれた'], ['広げる', '広げられた'], ['られる', 'られた'], ['習わせる', '習わせてやれた'], ['暮らす', '暮らす支度ができた']];
export function pastOf(txt) { for (const [a, b] of PAST) if (txt.endsWith(a)) return txt.slice(0, -a.length) + b; return txt; }

export function careerCard(sim, p) {
  const rows = [], plan = p.plan;
  if (plan && (plan.stage === 'saving' || plan.stage === 'waiting')) rows.push(['目標', `${plan.txt}（${Math.round(plan.saved)}／${plan.need}銅貨・${leftTxt(sim, plan)}）`]);
  if (p.master != null) { const m = sim.S.people[p.master]; if (m) rows.push(['師匠', `${sim.fullName(m)}（${jobName(m.job || m.formerJob)}）${p.appr ? '・修業中' : ''}`]); }
  const ap = (p.apprentices || []).map((id) => alive(sim, id)).filter((q) => q && q.master === p.id);
  if (ap.length) rows.push(['弟子', ap.map((q) => q.given).join('、')]);
  if (p.shop != null) { const b = sim.building(p.shop); if (b) rows.push(['店', b.name]); }
  if (p.retired && p.formerJob) rows.push(['隠居', `元${jobName(p.formerJob)}（${p.retiredYear ?? ''}年に引退）`]);
  return rows;
}
