// パーティの組み方と、盾役（騎士）の怒り・挑発・かばう・陣形（開発部）
//
// 社長の指示：
//   1. パーティを組むときは、ランクがあまり大きく離れない者どうしで組む。
//   2. パーティには、防御力の強い騎士（盾役）を入れることを優先する。
//   3. 騎士は挑発で魔物の気を引き、仲間に攻撃がいかないようにする。
// 数字は調査部の docs/戦闘の研究.md（第4部①②、4-2、4-4）に合わせた。すべて下の TUNE にまとめてある。
//
// ■ 決まり
//   ・ランク合わせ：仲間はリーダーのランクの上下1つまで。
//     例外「指導」：B以上の者、または親子・夫婦・深い絆の者は、2つ下までの新人を1人だけ連れて行ける（師匠と弟子）。
//     師匠は弟子をかばう。3つ以上離れた者どうしは組まない。
//     パーティが受けられる依頼の格付けは「いちばん低い人のランク＋1」まで。回復役も人数分の回復薬もなければ、さらに1つ下げる。
//   ・役割：盾（騎士見習い・聖騎士・戦士、重い鎧と盾の人、騎士・近衛）／攻撃／回復（僧侶）／遠距離（弓・魔法）／斥候（シーフ）。
//     結成のときは、まず盾を1人、次に回復・攻撃・遠距離の順にそろえる。前衛（盾か攻撃）のいない顔ぶれでは組まない。
//   ・助っ人：盾役のいないパーティがDランク以上の依頼に出るとき、ギルドの口利きで町の騎士・兵士（非番）を雇うことがある。
//   ・怒り：魔物は、戦っている人ごとに怒りをためる。与えた傷×1（盾役は×2など）、回復した量×0.5（近くの魔物に分ける）。
//     狙いを変えるのは、別の人の怒りが今の相手の110％（そばにいる人）／130％（離れた人）を超えたときだけ。
//   ・挑発：盾役は仲間が狙われたら挑発する。いちばんの怒り＋10％を得て、3手は必ず自分を狙わせる。使ったあと8手は使えない。
//     効く確率＝100％−知能×40％（知能0.3未満は必ず効く）。騎士見習い・勇者は−20％、戦士（雄叫び）は−30％。
//     挑発が効いているあいだは、賢い魔物が弱い者に狙いを変える割合が25％→10％（monsters.js）。
//   ・かばう：盾役から2マス以内の弱い仲間（後衛・回復役・子ども・戦えない人）が打たれるとき、代わりに受ける。
//     聖騎士50％・騎士/近衛45％・騎士見習い30％・戦士20％（兵士など盾持ちは30％）。師匠は弟子を45％以上でかばう。
//     受けるときは盾受けの判定もする。かばったときは装備の傷みが1.5倍。
//   ・陣形：盾が前、攻撃役はその横、弓・魔法・回復は2〜3マス後ろ。後衛は近づかれたら下がって間合いを保つ（1手使う）。
//     後衛へ向かう魔物が前衛から1.5マス以内を通ると、70％で足止めされる（飛ぶ魔物は30％）。
//
// ■ お金の流れ（どこからも湧かせない）
//   助っ人の雇い賃 … パーティの仲間の財布（足りなければ家計。property.js の pay）→ 雇われた騎士・兵士（property.js の earn）。
//                    頭割りで、払えない仲間がいれば雇わない。flow に「パーティの仲間 → 騎士・兵士：助っ人の雇い賃」と記録する。
//   それ以外（ランク合わせ・怒り・挑発・かばう・陣形）ではお金は動かない。
//
// ■ 状態（すべて遅延初期化。古いセーブでも動く）
//   S.tactics = { v, stats:{...} }       … 回数の記録
//   pt.mentor = { 弟子id: 師匠id }
//   p.tHire   = { pt, q, until, fee }    … 助っ人として雇われている騎士・兵士
//   c.thr     = { t, m:{人id: 怒り} }     … 魔物の怒り（60分戦わなければ忘れる）
//   c.taunt   = { by, n }                … 挑発された魔物（あと n 手は by を狙う）
//   p.guardT  = 盾を構えた時刻（描画で「構える姿」を出す）
//
// ■ 本体からの呼び方（部長がつなぐ。patch_tactics.py）
//   tacticsDaily(sim) / tacticsHourly(sim)   … sim.js newDay / newHourRest
//   tacticsFormParty / tacticsAfterForm / tacticsPickMates / tacticsCrewRank / tacticsRoleName … guild.js
//   tacticsIntercept(sim, e, t)     … society.js stepCombat：魔物が相手へ近づく前（前衛の足止め。true なら動かない）
//   tacticsMonsterTurn(sim, e, t)   … society.js stepCombat：魔物の攻撃の直前。null＝そのまま／false＝この手は向き直るだけ／人＝この人を打つ
//   tacticsHumanTurn(sim, e, t)     … society.js stepCombat：人の攻撃の直前（挑発・下がる なら true）
//   tacticsIncoming(sim, e, t, dmg) … society.js stepCombat：魔物の一撃が人に当たる直前（盾受け・かばう）→ { t, dmg } か null
//   tacticsAfterHit(sim, e, t, dmg) … society.js stepCombat：一撃のあと（怒りをためる・かばった装備の傷み）
//   tacticsReach(sim, e)            … society.js stepCombat：人の間合い（回復役も後ろから）
//   tacticsRows / tacticsLineup     … ui.js（人の詳細欄・ギルドの欄）
import { JOBS, SPECIES } from './data.js';
import { advClassOf, advReach } from './advclass.js';
import { intelOf } from './monsters.js';
import { startFight } from './society.js';
import { gearOnHit } from './gear.js';
import { countItem } from './items.js';
import { pay, earn, spendable } from './property.js';
import { flow } from './ledger.js';
import { T, walkable, tileAt } from './world.js';

// ---------- 数の目安（docs/戦闘の研究.md の案。調整はここだけで） ----------
export const TUNE = {
  // ランク（4-4）
  RANK_GAP: 1,            // リーダーの上下1つまで
  MENTOR_GAP: 2,          // 指導：2つ下までの新人を1人
  MENTOR_RANK: 4,         // 指導できるのは B 以上（または深い関係）
  DEEP_REL: 65,           // 深い絆とみなす好感（両方向）
  DEEP_BOND: 60,          // パーティの絆値（partylife.js）でも深いとみなす
  // 怒り（4-1①）
  THR_HEAL: 0.5,          // 回復した量の怒り
  THR_NEAR: 1.1,          // そばにいる人（1.5マス以内）に狙いを変える条件
  THR_FAR: 1.3,           // 離れた人に狙いを変える条件
  THR_NEAR_R: 1.5,
  THR_FORGET: 60,         // この分だけ戦わなければ怒りを忘れる
  THR_MUL: { paladin: 2, knight: 2, royalguard: 2, squire: 1.5, fighter: 1.3, shield: 1.5 },   // 盾役の怒りの倍率（4-2）
  // 挑発（4-1①）
  TAUNT_R: 5,             // 声が届く距離（マス）
  TAUNT_ADD: 1.1,         // いちばんの怒り＋10％
  TAUNT_HANDS: 3,         // 3手は必ず自分を狙わせる
  TAUNT_CD: 8,            // 使ったあと8手（分）は使えない
  TAUNT_INTEL: 0.4,       // 効く確率 ＝ 1 − 知能×0.4
  TAUNT_DUMB: 0.3,        // これ未満の知能には必ず効く
  TAUNT_PEN: { squire: 0.2, hero: 0.2, fighter: 0.3 },   // 効く確率から引く
  FOCUS_TAUNTED: 0.1,     // 挑発中に賢い魔物が弱い者を狙う割合（ふだん0.25。monsters.js に書く値の控え）
  // かばう（4-1①）
  COVER_R: 2,
  COVER_P: { paladin: 0.5, knight: 0.45, royalguard: 0.45, squire: 0.3, fighter: 0.2, other: 0.3 },
  COVER_MENTOR: 0.45,     // 師匠が弟子をかばう確率の下限
  COVER_HP: 0.3,          // これより弱った盾役はかばわない
  COVER_WEAR: 0.5,        // かばったときの装備の傷みの上乗せ（1.5倍）
  BLOCK_P: 0.35,          // 盾で受け止める確率（盾があるとき）
  BLOCK_MUL: 0.55,        // 盾で受けたときの傷の倍率
  DEF_CUT: 0.3,           // 盾で受けたとき、守りの力（def）のこの割合をさらに引く
  // 陣形（4-1②）
  REACH_HEAL: 2.5,        // 回復役は2〜3マス後ろから
  REAR_KEEP: 2,           // 後衛は、狙われてこれより近づかれたら下がる
  REAR_STEP: 1,           // 下がる量（1手）
  REAR_MAX: 2,            // 続けて下がるのは2手まで（そのあとは戦う）
  BLOCK_R: 1.5,           // 前衛の足止めが効く距離
  BLOCK_STOP: 0.7,        // 足止めの確率
  BLOCK_STOP_FLY: 0.3,    // 飛ぶ魔物
  SIDE_STEP: 0.35,        // 攻撃役が盾役の横へずれる量
  // 助っ人
  HIRE_P: 0.35, HIRE_MIN_Q: 2, HIRE_DAYS: 4, HIRE_DAY_FEE: 5, HIRE_TOWN_MAX: 2,
  LOG_GAP: 45,            // 同じ人の挑発・かばうのログを出す間隔（分）
};

const TANK_CLASS = new Set(['squire', 'paladin', 'fighter']);
const RANGED_CLASS = new Set(['archer', 'wizard', 'sorcerer']);
const HEAVY = new Set(['chainmail', 'platearmor', 'scalearmor']);
const HIRE_JOBS = new Set(['knight', 'soldier']);
const FLY_SP = new Set(['imp']);
export const ROLE_NAME = { tank: '盾', attack: '攻撃', heal: '回復', ranged: '遠距離', scout: '斥候' };
const WANT = ['tank', 'heal', 'attack', 'ranged'];

const isHuman = (e) => typeof e.id === 'number';
const alive = (m) => !!m && m.deathYear == null && m.hp > 0;
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

// ---------- 状態 ----------
const STAT_KEYS = ['formed', 'formedTank', 'formedHeal', 'noFront', 'mentorPairs', 'rankRefused', 'rankLeave', 'taunt', 'tauntResisted', 'forced', 'thrSwitch', 'cover', 'block', 'intercept', 'hired', 'hireFee', 'hireEnd', 'sideStep', 'backStep'];
export function tacticsState(sim) {
  const S = sim.S;
  if (!S.tactics) S.tactics = { v: 2, stats: {} };
  const X = S.tactics;
  if (!X.stats) X.stats = {};
  for (const k of STAT_KEYS) if (X.stats[k] == null) X.stats[k] = 0;
  return X;
}
const ST = (sim) => tacticsState(sim).stats;

// ---------- ランク ----------
const RANK_PTS = [0, 3, 8, 15, 30, 55, 100];   // guild.js と同じ
function rankOfPts(qp) { let r = 0; for (let i = 0; i < RANK_PTS.length; i++) if ((qp || 0) >= RANK_PTS[i]) r = i; return r; }
// 冒険者は達成点から。騎士・兵士（助っ人）は腕前（レベル）から見積もる
export function rankOf(p) {
  if (!p) return 0;
  if (p.tHire || (!(p.qp > 0) && HIRE_JOBS.has(p.job))) return Math.max(1, Math.min(4, Math.floor((p.lv || 1) / 3)));
  return rankOfPts(p.qp);
}
// 深い関係：親子・夫婦・互いに深い好感・パーティの深い絆
export function deepTie(sim, a, b) {
  if (!a || !b || a === b) return false;
  if (a.fatherId === b.id || a.motherId === b.id || b.fatherId === a.id || b.motherId === a.id) return true;
  if (a.spouseId === b.id || b.spouseId === a.id) return true;
  if ((sim.rel(a, b).a || 0) >= TUNE.DEEP_REL && (sim.rel(b, a).a || 0) >= TUNE.DEEP_REL) return true;
  if (a.party != null && a.party === b.party) {
    const bd = sim.S.advParties?.[a.party]?.bond || {};
    if ((bd[a.id] || 0) >= TUNE.DEEP_BOND && (bd[b.id] || 0) >= TUNE.DEEP_BOND && (sim.rel(a, b).a || 0) >= 40) return true;
  }
  return false;
}
// 指導できる組か（m が師匠、o が新人）
const canMentor = (sim, m, o) => rankOf(m) - rankOf(o) <= TUNE.MENTOR_GAP && rankOf(m) - rankOf(o) > TUNE.RANK_GAP && (rankOf(m) >= TUNE.MENTOR_RANK || deepTie(sim, m, o));
// o を、リーダー leader の顔ぶれ picks に加えてよいか。弟子として入るなら 'pupil'
export function rankFits(sim, o, picks, leader = picks[0]) {
  const r = rankOf(o), L = rankOf(leader);
  const pupils = picks.filter((m) => L - rankOf(m) > TUNE.RANK_GAP);
  for (const u of pupils) if (r - rankOf(u) > TUNE.MENTOR_GAP) return false;   // 弟子と3つ以上離れない
  if (Math.abs(r - L) <= TUNE.RANK_GAP) return true;
  if (r < L && !pupils.length && picks.some((m) => canMentor(sim, m, o)) && picks.every((m) => rankOf(m) - r <= TUNE.MENTOR_GAP)) return 'pupil';
  return false;
}
// パーティのランク：平均（3人以上なら＋1）。ただし、いちばん低い人のランク＋1まで。
// 回復役も、全員の回復薬もなければ1つ下げる（4-4 の「回復役か人数分の回復薬を必ず」）
export function tacticsCrewRank(sim, crew) {
  const ms = crew.filter(Boolean);
  if (!ms.length) return 0;
  const rs = ms.map(rankOf);
  const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  let r = Math.min(Math.round(avg + (ms.length >= 3 ? 1 : 0)), Math.min(...rs) + 1);
  if (ms.length >= 2 && !ms.some((m) => tacticsRole(sim, m) === 'heal') && !ms.every((m) => countItem(m, 'potion') > 0)) r -= 1;
  return Math.max(0, Math.min(6, r));
}

// ---------- 役割 ----------
export function tacticsRole(sim, p) {
  if (!p) return 'attack';
  const cls = advClassOf(sim, p);
  const eq = p.eq || {};
  const heavy = !!(eq.shield && eq.armor && HEAVY.has(eq.armor.id));
  if (cls) {
    if (TANK_CLASS.has(cls)) return 'tank';
    if (cls === 'priest') return 'heal';
    if (RANGED_CLASS.has(cls)) return 'ranged';
    if (heavy) return 'tank';          // 重い鎧と盾を持つ剣士・盗賊などは盾役を務める
    if ((cls === 'swordsman' || cls === 'hero') && eq.shield && eq.armor) return 'tank';   // 盾と鎧を持つ剣士・勇者も前で受け止める
    if (cls === 'thief') return 'scout';
    return 'attack';
  }
  switch (p.job) {
    case 'knight': case 'royalguard': case 'paladin': return 'tank';
    case 'soldier': case 'guard': case 'watchman': case 'militia': case 'gatekeeper': return eq.shield ? 'tank' : 'attack';
    case 'cleric': case 'priest': return 'heal';
    case 'archer': case 'sage': case 'wizard': case 'courtmage': case 'hunter': return 'ranged';
    case 'thief': case 'pickpocket': return 'scout';
  }
  return heavy ? 'tank' : 'attack';
}
export const tacticsRoleName = (sim, p) => ROLE_NAME[tacticsRole(sim, p)] || '攻撃';
const isTank = (sim, p) => tacticsRole(sim, p) === 'tank';
const isFront = (sim, p) => { const r = tacticsRole(sim, p); return r === 'tank' || r === 'attack'; };
// 盾役の種類（怒り・かばう・挑発の数字を引く鍵）
function tankKind(sim, p) {
  if (p.job === 'paladin' || p.advClass === 'paladin') return 'paladin';
  if (p.job === 'knight' || p.job === 'royalguard') return p.job;
  if (p.advClass === 'squire' || p.advClass === 'fighter') return p.advClass;
  return isTank(sim, p) ? 'shield' : null;
}
// かばってもらう側：後衛・回復役・子ども・戦えない人・深手の人
function isWeak(sim, t) {
  const r = tacticsRole(sim, t);
  if (r === 'heal' || r === 'ranged') return true;
  if (sim.ageOf(t) < 14) return true;
  if (!(JOBS[t.job]?.combat) && !t.advClass) return true;
  return t.hp < t.maxhp * 0.35;
}

// ---------- 結成：リーダーの上下1ランク、盾を先に、次に回復・攻撃・遠距離 ----------
export function tacticsFormParty(sim, leader, free, R = sim.rng) {
  const picks = [leader];
  const roles = new Set([tacticsRole(sim, leader)]);
  let pool = free.filter((o) => o !== leader && sim.rel(leader, o).a > -5);
  const before = pool.length;
  pool = pool.filter((o) => rankFits(sim, o, [leader]) || Math.abs(rankOf(o) - rankOf(leader)) <= TUNE.MENTOR_GAP);
  if (before > pool.length) ST(sim).rankRefused += before - pool.length;
  const score = (o) => {
    const r = tacticsRole(sim, o);
    const need = WANT.indexOf(r);
    let s = sim.rel(leader, o).a;
    if (!roles.has(r)) s += need >= 0 ? 40 - need * 6 : 8;   // 足りない役割ほど先に（盾がいちばん）
    else s -= 20;
    s -= Math.abs(rankOf(o) - rankOf(leader)) * 6 + Math.abs((o.lv || 1) - (leader.lv || 1));
    return s;
  };
  const add = (o) => { picks.push(o); roles.add(tacticsRole(sim, o)); };
  // 1) 盾役を1人（盾役は誘いに応じやすい）
  if (!roles.has('tank')) {
    const tank = pool.filter((o) => isTank(sim, o) && rankFits(sim, o, picks, leader)).sort((a, b) => score(b) - score(a))[0];
    if (tank && R.chance(0.75 + tank.pers.A * 0.2)) add(tank);
  }
  // 2) 残りは、足りない役割から（ランクが合う者だけ。弟子は1人まで）
  for (let guard = 0; guard < 12 && picks.length < 4; guard++) {
    const cand = pool.filter((o) => !picks.includes(o) && rankFits(sim, o, picks, leader)).sort((a, b) => score(b) - score(a));
    if (!cand.length) break;
    const o = cand[0];
    if (R.chance(0.5 + o.pers.A * 0.4)) add(o);
    else pool = pool.filter((x) => x !== o);   // 断られた
  }
  if (picks.length >= 2 && !picks.some((m) => isFront(sim, m))) { ST(sim).noFront++; return [leader]; }   // 前衛のいない顔ぶれでは組まない
  if (picks.length >= 2) { ST(sim).formed++; if (roles.has('tank')) ST(sim).formedTank++; if (roles.has('heal')) ST(sim).formedHeal++; }
  return picks;
}
// 結成のあと：リーダーより2つ下の弟子に師匠を付ける（guild.js が結成のログを出したあとで呼ぶ）
export function tacticsAfterForm(sim, pt) {
  if (!pt) return;
  const ms = pt.members.map((id) => sim.S.people[id]).filter(alive);
  const L = sim.S.people[pt.leader] || ms[0];
  for (const b of ms) {
    if (rankOf(L) - rankOf(b) <= TUNE.RANK_GAP) continue;
    const a = ms.filter((m) => m !== b && canMentor(sim, m, b)).sort((x, y) => (deepTie(sim, y, b) - deepTie(sim, x, b)) || rankOf(y) - rankOf(x))[0];
    if (!a) continue;
    pt.mentor = pt.mentor || {};
    if (pt.mentor[b.id] != null) continue;
    pt.mentor[b.id] = a.id; ST(sim).mentorPairs++;
    sim.remember(a, `ランクの離れた新人の${b.given}を連れて行くことになった。自分が守ってやらねば`, { emo: 0.4, imp: 0.6, about: [b.id], k: 'party' });
    sim.remember(b, `${a.given}に付いて、腕を磨かせてもらうことになった`, { emo: 0.6, imp: 0.6, about: [a.id], k: 'party' });
    sim.pushLog(`パーティー「${pt.name}」では、${a.given}が師匠として新人の${b.given}の面倒を見ている。`, 'event', [a.id, b.id], a.pos);
  }
}
// 臨時の仲間（ソロの冒険者が依頼のために声をかける）：ランクの合う者、盾役を先に
export function tacticsPickMates(sim, p, pool, n) {
  const out = [];
  const ok = pool.filter((o) => rankFits(sim, o, [p], p));
  const tank = isTank(sim, p) ? null : ok.find((o) => isTank(sim, o));
  if (tank && n > 0) out.push(tank);
  for (const o of ok) { if (out.length >= n) break; if (!out.includes(o) && rankFits(sim, o, [p, ...out], p)) out.push(o); }
  return out;
}

// ---------- 陣容の表示 ----------
export function tacticsLineup(sim, pt) {
  const ms = (pt.members || []).map((id) => sim.S.people[id]).filter((m) => m && m.deathYear == null);
  const have = new Set(ms.map((m) => tacticsRole(sim, m)));
  const n = WANT.filter((r) => have.has(r)).length;
  const grade = n >= 4 ? 'そろっている' : n === 3 ? 'よい' : have.has('tank') ? 'ふつう' : '盾がいない';
  return `陣容：${['tank', 'attack', 'heal', 'ranged', 'scout'].filter((r) => have.has(r)).map((r) => ROLE_NAME[r]).join('・') || 'なし'}（${grade}）`;
}
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 人の詳細欄（<dl class="kv"> の中）：役割、陣形、師匠・弟子、助っ人
export function tacticsRows(sim, p, link = (x) => escH(x.given)) {
  if (!p || p.deathYear != null) return '';
  const r = tacticsRole(sim, p);
  const pos = { tank: '前に立ち、魔物を挑発して仲間をかばう', attack: '盾役の横から斬り込む', heal: '2〜3歩うしろから仲間を癒す', ranged: '2〜3歩うしろから撃つ', scout: '先を探り、罠を外す' }[r];
  let h = `<dt>役割</dt><dd>${ROLE_NAME[r]}<br><span class="sub">${pos}</span></dd>`;
  const pt = p.party != null ? sim.S.advParties?.[p.party] : null;
  if (pt && !pt.gone) {
    const ms = pt.members.map((id) => sim.S.people[id]).filter((m) => m && m.deathYear == null);
    h += `<dt>陣形</dt><dd>${ms.map((m) => `${m === p ? escH(m.given) : link(m)}（${ROLE_NAME[tacticsRole(sim, m)]}・${'FEDCBAS'[rankOf(m)]}${m.tHire ? '・助っ人' : ''}）`).join('、')}<br><span class="sub">${escH(tacticsLineup(sim, pt))}</span></dd>`;
    const mt = pt.mentor || {};
    if (mt[p.id] != null && sim.S.people[mt[p.id]]) h += `<dt>師匠</dt><dd>${link(sim.S.people[mt[p.id]])}</dd>`;
    const pupils = Object.entries(mt).filter(([, a]) => a === p.id).map(([b]) => sim.S.people[b]).filter(alive);
    if (pupils.length) h += `<dt>弟子</dt><dd>${pupils.map(link).join('、')}</dd>`;
  }
  if (p.tHire) h += `<dt>助っ人</dt><dd>${sim.S.advParties?.[p.tHire.pt] ? `「${escH(sim.S.advParties[p.tHire.pt].name)}」に` : ''}雇われている（雇い賃${p.tHire.fee}銅貨）</dd>`;
  return h;
}
export function tacticsText(sim, p) { return tacticsRows(sim, p).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

// ---------- 毎日：リーダーとランクが離れすぎた仲間は抜ける（古いセーブのパーティ・昇格の差） ----------
export function tacticsDaily(sim) {
  const S = sim.S, R = sim.rng;
  tacticsState(sim);
  for (const pt of Object.values(S.advParties || {})) {
    if (pt.gone) continue;
    const ms = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && m.party === pt.id && !m.tHire);
    const L = S.people[pt.leader];
    if (ms.length < 3 || !alive(L)) continue;   // 2人組は解散になるので、無理に抜けさせない
    const mt = pt.mentor || {};
    let worst = null, wg = 0;
    for (const m of ms) {
      if (m === L) continue;
      const g = Math.abs(rankOf(m) - rankOf(L));
      if (g <= TUNE.RANK_GAP) continue;
      if (mt[m.id] != null && alive(S.people[mt[m.id]]) && g <= TUNE.MENTOR_GAP) continue;   // 師匠の付いた弟子
      if (g > wg) { wg = g; worst = m; }
    }
    if (!worst || worst.quest || !R.chance(0.3)) continue;
    const i = pt.members.indexOf(worst.id); if (i >= 0) pt.members.splice(i, 1);
    worst.party = null;
    if (pt.mentor) delete pt.mentor[worst.id];
    ST(sim).rankLeave++;
    sim.remember(worst, `パーティー「${pt.name}」の仲間とは腕の差が開きすぎた。自分に見合う仲間を探そう`, { emo: -0.3, imp: 0.6, k: 'party' });
    sim.pushLog(`${worst.given}は、腕の差が開きすぎたとしてパーティー「${pt.name}」を抜けた。`, 'event', [worst.id], worst.pos);
  }
}

// ---------- 毎時：助っ人の雇い入れと、雇いの終わり ----------
function partyQuest(sim, ms) {
  const qid = ms.map((m) => m.quest).find((x) => x != null);
  return qid != null ? (sim.S.quests || []).find((q) => q.id === qid) : null;
}
function release(sim, k, why) {
  const S = sim.S, h = k.tHire;
  const pt = h ? S.advParties?.[h.pt] : null;
  if (pt) { const i = pt.members.indexOf(k.id); if (i >= 0) pt.members.splice(i, 1); }
  if (k.party === h?.pt) k.party = null;
  delete k.tHire;
  ST(sim).hireEnd++;
  if (alive(k) && pt) sim.remember(k, `パーティー「${pt.name}」の助っ人を${why}`, { emo: 0.3, imp: 0.4, k: 'party' });
}
export function tacticsHourly(sim) {
  const S = sim.S, R = sim.rng;
  tacticsState(sim);
  const hiredBy = {};
  for (const k of sim.living()) {
    if (!k.tHire) continue;
    const h = k.tHire, pt = S.advParties?.[h.pt];
    const q = (S.quests || []).find((x) => x.id === h.q);
    if (!pt || pt.gone || !pt.members.includes(k.id) || !q || q.state !== 'taken' || sim.today > h.until || (k.mission && ['march', 'crusade', 'defend'].includes(k.mission.type)) || k.jail != null) {
      release(sim, k, !q || q.state === 'report' || q.state === 'done' ? '務め終えた' : '途中で終えた');
      continue;
    }
    hiredBy[k.s] = (hiredBy[k.s] || 0) + 1;
    // 助っ人はリーダーにならない（リーダーが倒れて引き継がれたら、冒険者に戻す）
    if (pt.leader === k.id) { const nl = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && !m.tHire).sort((a, b) => (b.lv || 1) - (a.lv || 1))[0]; if (nl) pt.leader = nl.id; }
  }
  for (const pt of Object.values(S.advParties || {})) {
    if (pt.gone) continue;
    const ms = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && m.party === pt.id);
    if (ms.length < 2 || ms.some((m) => isTank(sim, m))) continue;
    const q = partyQuest(sim, ms);
    if (!q || q.state !== 'taken' || q.rank < TUNE.HIRE_MIN_Q || q.hireTried) continue;
    const L = S.people[pt.leader] && alive(S.people[pt.leader]) ? S.people[pt.leader] : ms[0];
    const home = sim.town(L.s);
    if (!home || (L.inside == null && Math.hypot(L.pos.x - home.x, L.pos.z - home.z) > home.r + 4)) continue;   // ギルドのある町にいるときだけ
    q.hireTried = true;
    if (!R.chance(TUNE.HIRE_P + (q.rank - TUNE.HIRE_MIN_Q) * 0.1)) continue;
    if ((hiredBy[L.s] || 0) >= TUNE.HIRE_TOWN_MAX) continue;
    const k = sim.living().filter((o) => HIRE_JOBS.has(o.job) && o.s === L.s && !o.tHire && o.party == null && !o.mission && !o.fight && o.jail == null && !o.quest
      && sim.ageOf(o) >= 18 && sim.ageOf(o) <= 50 && o.hp > o.maxhp * 0.8 && isTank(sim, o)
      && !(o.action && ['work', 'defend', 'patrol', 'alert', 'march', 'rescue'].includes(o.action.type)))
      .sort((a, b) => (b.lv || 1) - (a.lv || 1) + (sim.rel(L, b).a - sim.rel(L, a).a) * 0.05)[0];
    if (!k) continue;
    const fee = Math.round((TUNE.HIRE_DAY_FEE + (k.lv || 1) * 0.6) * TUNE.HIRE_DAYS);
    const share = Math.ceil(fee / ms.length);
    if (ms.some((m) => spendable(sim, m) < share + 5)) continue;   // 払えない仲間がいれば雇わない
    let got = 0;
    for (const m of ms) { pay(sim, m, share); got += share; }
    earn(sim, k, got, 0.5);
    flow(sim, 'パーティの仲間', JOBS[k.job]?.name || '騎士・兵士', got, '助っ人の雇い賃');
    k.tHire = { pt: pt.id, q: q.id, until: sim.today + TUNE.HIRE_DAYS, fee: got };
    k.party = pt.id; pt.members.push(k.id);
    k.action = null; k.path = null;
    hiredBy[L.s] = (hiredBy[L.s] || 0) + 1;
    ST(sim).hired++; ST(sim).hireFee += got;
    for (const m of ms) sim.relMut(m, k).a = Math.max(sim.rel(m, k).a, 10);
    sim.remember(k, `非番の日に、パーティー「${pt.name}」の助っ人として${got}銅貨で雇われた`, { emo: 0.4, imp: 0.5, about: ms.map((m) => m.id), k: 'party' });
    sim.remember(L, `盾役がいないので、ギルドの口利きで${JOBS[k.job].name}の${k.given}を雇った`, { emo: 0.3, imp: 0.4, about: [k.id], k: 'party' });
    sim.pushLog(`盾役のいないパーティー「${pt.name}」が、ギルドの口利きで${JOBS[k.job].name}${k.given}を助っ人に雇った（雇い賃${got}銅貨）。`, 'event', [k.id, ...ms.map((m) => m.id)], L.pos);
  }
}

// ---------- 戦い：怒り ----------
function thrOf(sim, c) {
  const t = sim.S.t;
  if (!c.thr || t - c.thr.t > TUNE.THR_FORGET) c.thr = { t, m: {} };
  c.thr.t = t;
  return c.thr.m;
}
const topThr = (m) => { let v = 0; for (const k in m) if (m[k] > v) v = m[k]; return v; };
function thrMul(sim, e) { const k = tankKind(sim, e); return k ? (TUNE.THR_MUL[k] || 1) : 1; }
// 狙える人か
const here = (h, c) => h.inside == null || !!c.inDungeon;   // ダンジョンの中の戦いでは、中にいる人も数える
const targetable = (sim, h, c) => alive(h) && h.jail == null && here(h, c) && dist(h, c) < 8;

function canLog(sim, p, key) {
  const t = sim.S.t;
  p._tlog = p._tlog || {};
  if (p._tlog[key] != null && t - p._tlog[key] < TUNE.LOG_GAP) return false;
  p._tlog[key] = t; return true;
}
const say = (sim, e, text) => { if (sim.isWatched(e)) sim.events.push({ type: 'say', id: e.id, text }); };
const monName = (c) => c.name || SPECIES[c.sp]?.name || '魔物';
const allyOf = (g, t) => isHuman(t) && t !== g && t.deathYear == null && !(t.fight && t.fight.target === g.id) && !(t.bandit && !g.bandit);
const flying = (c) => FLY_SP.has(c.sp) || ['bird', 'dragon'].includes(SPECIES[c.sp]?.shape);
function mentorOf(sim, t) {
  if (t.party == null) return null;
  const id = sim.S.advParties?.[t.party]?.mentor?.[t.id];
  return id != null ? sim.S.people[id] : null;
}
// 戦っている魔物（近くのもの）
function fightingMonstersNear(sim, x, z, r) {
  const out = [];
  const src = sim._fighting instanceof Set && sim._fighting.size ? sim._fighting : Object.values(sim.S.creatures);
  for (const c of src) {
    if (!c.fight || c.hp <= 0 || isHuman(c)) continue;
    if (Math.abs(c.pos.x - x) > r || Math.abs(c.pos.z - z) > r) continue;
    out.push(c);
  }
  return out;
}
// 戦っている前衛（1歩ごとに作り直す）と、同じパーティの仲間
function frontNear(sim, t, r, pred) {   // pred でその場（外かダンジョンか）も確かめる
  const out = [];
  const pt = t.party != null ? sim.S.advParties?.[t.party] : null;
  if (pt && !pt.gone) for (const id of pt.members) { const m = sim.S.people[id]; if (alive(m) && m !== t && dist(m, t) <= r && pred(m)) out.push(m); }
  if (!sim._tacF || sim._tacF.t !== sim.S.t) {
    sim._tacF = { t: sim.S.t, list: [] };
    for (const p of sim.living()) if (p.fight && isFront(sim, p)) sim._tacF.list.push(p);
  }
  for (const p of sim._tacF.list) if (!out.includes(p) && p !== t && alive(p) && dist(p, t) <= r && pred(p)) out.push(p);
  return out;
}
function setTarget(sim, c, h) {
  c.fight.target = h.id; c._tacTgt = h.id;
  if (!h.fight) startFight(sim, h, c);
}
const inReach = (c, h) => dist(c, h) <= 1.3;

// 人の番：盾役は挑発する。攻撃役は盾役の横へ、後衛は近づかれたら下がる
export function tacticsHumanTurn(sim, e, t) {
  if (!isHuman(e) || !t || isHuman(t)) return false;   // 魔物と戦うときだけ
  const S = sim.S, R = sim.rng;
  const role = tacticsRole(sim, e);
  if (role === 'tank' || e.advClass === 'hero') {
    if (S.t < (e.tauntCd || 0) || e.hp < e.maxhp * 0.25) return false;
    // 仲間（自分以外の人）を狙っている魔物
    const foes = fightingMonstersNear(sim, e.pos.x, e.pos.z, TUNE.TAUNT_R).filter((c) => {
      if (c.taunt && c.taunt.by === e.id) return false;
      const v = sim.entity(c.fight.target);
      return v && v !== e && allyOf(e, v) && dist(c, e) <= TUNE.TAUNT_R;
    });
    if (!foes.length) return false;
    e.tauntCd = S.t + TUNE.TAUNT_CD; e.guardT = S.t;
    const pen = TUNE.TAUNT_PEN[e.advClass] || 0;
    let won = 0;
    for (const c of foes) {
      const I = c.intel ?? intelOf(c);
      const p = Math.max(0.05, (I < TUNE.TAUNT_DUMB ? 1 : 1 - I * TUNE.TAUNT_INTEL) - pen);
      if (!R.chance(p)) { ST(sim).tauntResisted++; continue; }
      const m = thrOf(sim, c);
      m[e.id] = Math.max(m[e.id] || 0, topThr(m) * TUNE.TAUNT_ADD, 1);
      c.taunt = { by: e.id, n: TUNE.TAUNT_HANDS };
      won++;
    }
    ST(sim).taunt++;
    const who = e.job === 'knight' || e.job === 'royalguard' || e.job === 'paladin' || e.advClass === 'squire' || e.advClass === 'paladin' ? '騎士' : e.advClass === 'hero' ? '勇者' : e.advClass === 'fighter' ? '戦士' : '';
    const first = foes[0];
    say(sim, e, won ? R.pick([`こっちだ、${monName(first)}！`, 'おれが相手だ！ かかってこい！', '仲間には指一本触れさせん！', '来い！ この盾を破ってみろ！']) : 'くそっ、こっちを向け！');
    if (won && canLog(sim, e, 'taunt')) sim.pushLog(`${who}${e.given}が大声で挑発し、${monName(first)}${won > 1 ? `たち${won}体` : ''}の注意を引きつけた。`, 'event', [e.id], e.pos);
    return true;
  }
  if (role === 'attack') {
    // 陣形：同じ相手と戦う盾役と重なっていたら、横へずれる
    const pt = e.party != null ? sim.S.advParties?.[e.party] : null;
    const tank = pt ? pt.members.map((id) => sim.S.people[id]).find((m) => m && m !== e && alive(m) && m.fight?.target === t.id && isTank(sim, m) && dist(m, e) < 0.9) : null;
    if (tank) {
      const dx = t.pos.x - tank.pos.x, dz = t.pos.z - tank.pos.z, d = Math.hypot(dx, dz) || 1;
      const side = (e.id & 1) ? 1 : -1;
      if (nudge(sim, e, (-dz / d) * TUNE.SIDE_STEP * side, (dx / d) * TUNE.SIDE_STEP * side)) ST(sim).sideStep++;
    }
  } else if (role === 'ranged' || role === 'heal') {
    // 後衛：狙われて近づかれたら、下がって間合いを保つ（続けて2手まで）
    if (dist(e, t) < TUNE.REAR_KEEP && t.fight?.target === e.id && (e._rear || 0) < TUNE.REAR_MAX) {
      const dx = e.pos.x - t.pos.x, dz = e.pos.z - t.pos.z, n = Math.hypot(dx, dz) || 1;
      if (nudge(sim, e, (dx / n) * TUNE.REAR_STEP, (dz / n) * TUNE.REAR_STEP)) { e._rear = (e._rear || 0) + 1; ST(sim).backStep++; return true; }
    }
    e._rear = 0;
  }
  return false;
}
function nudge(sim, e, dx, dz) {
  const x = e.pos.x + dx, z = e.pos.z + dz;
  const tl = tileAt(sim.S.world, Math.round(x), Math.round(z));
  if (tl == null || !walkable(tl) || tl === T.BLD) return false;
  e.pos.x = x; e.pos.z = z; return true;
}

// 魔物が相手へ近づく前：後衛へ向かう途中で前衛のそばを通ると、足止めされる
export function tacticsIntercept(sim, e, t) {
  if (isHuman(e) || !isHuman(t) || !e.fight || !isWeak(sim, t)) return false;
  const S = sim.S;
  if (e._icT != null && S.t - e._icT < 1) return false;   // 1手に1回だけ判定する
  e._icT = S.t;
  const fronts = frontNear(sim, t, 12, (m) => here(m, e) && dist(m, e) <= TUNE.BLOCK_R && allyOf(m, t) && m.hp > m.maxhp * 0.25);
  if (!fronts.length) return false;
  if (!sim.rng.chance(flying(e) ? TUNE.BLOCK_STOP_FLY : TUNE.BLOCK_STOP)) return false;
  const g = fronts.sort((a, b) => (isTank(sim, b) - isTank(sim, a)) || dist(a, e) - dist(b, e))[0];
  const m = thrOf(sim, e);
  m[g.id] = Math.max(m[g.id] || 0, (m[t.id] || 0), 1);
  setTarget(sim, e, g);
  g.guardT = S.t;
  ST(sim).intercept++;
  if (isTank(sim, g)) say(sim, g, sim.rng.pick(['通さん！', 'ここから先へは行かせない！', 'どこへ行く、相手はおれだ！']));
  return true;
}

// 魔物の番：挑発されていれば盾役を、そうでなければ怒りのいちばん大きい相手を狙う
export function tacticsMonsterTurn(sim, e, t) {
  if (isHuman(e) || !e.fight) return null;
  const S = sim.S;
  const m = thrOf(sim, e);
  // 挑発：あと n 手は必ず盾役を狙う
  if (e.taunt) {
    const by = S.people[e.taunt.by];
    e.taunt.n--;
    const n = e.taunt.n;
    if (n <= 0) delete e.taunt;
    if (by && targetable(sim, by, e)) {
      e._tacTgt = by.id;
      if (by === t) return null;
      setTarget(sim, e, by); ST(sim).forced++;
      return inReach(e, by) ? by : false;
    }
    delete e.taunt;
  }
  // ほかの仕組み（賢い魔物が弱い者を狙う・仲間をかばう など）で狙いが変わった：その相手を今いちばんの怒りとみなす
  if (e._tacTgt != null && e.fight.target !== e._tacTgt && isHuman(t)) m[t.id] = Math.max(m[t.id] || 0, topThr(m));
  e._tacTgt = e.fight.target;
  // 怒りで狙いを変える：そばの人は110％、離れた人は130％を超えたときだけ
  const cur = m[t.id] || 0;
  let best = null, bv = 0;
  for (const k in m) {
    if (+k === t.id || m[k] <= bv) continue;
    const h = S.people[k];
    if (!targetable(sim, h, e)) { delete m[k]; continue; }
    bv = m[k]; best = h;
  }
  if (!best) return null;
  const need = dist(best, e) <= TUNE.THR_NEAR_R ? TUNE.THR_NEAR : TUNE.THR_FAR;
  if (bv <= cur * need) return null;
  setTarget(sim, e, best); ST(sim).thrSwitch++;
  return inReach(e, best) ? best : false;
}

// 魔物の一撃が人に当たる直前：盾役は盾で受け、近くの盾役（師匠）は弱い仲間をかばう → { t, dmg }
export function tacticsIncoming(sim, e, t, dmg) {
  if (isHuman(e) || !isHuman(t) || dmg <= 0) return null;
  const S = sim.S, R = sim.rng;
  if (isTank(sim, t)) {
    const out = shieldBlock(sim, t, dmg);
    return out === dmg ? null : { t, dmg: out };
  }
  if (!isWeak(sim, t)) return null;
  // かばう人を探す：師匠 → 2マス以内の盾役
  const cands = [];
  const mentor = mentorOf(sim, t);
  if (alive(mentor) && here(mentor, e) && dist(mentor, t) <= TUNE.COVER_R && mentor.hp > mentor.maxhp * TUNE.COVER_HP) cands.push([mentor, Math.max(TUNE.COVER_MENTOR, TUNE.COVER_P[tankKind(sim, mentor)] || 0)]);
  for (const g of frontNear(sim, t, TUNE.COVER_R, (g) => isTank(sim, g) && here(g, e))) {
    if (g === mentor || g.hp <= g.maxhp * TUNE.COVER_HP || !allyOf(g, t)) continue;
    const k = tankKind(sim, g);
    cands.push([g, TUNE.COVER_P[k] ?? TUNE.COVER_P.other]);
  }
  for (const [g, p] of cands) {
    if (!R.chance(p)) continue;
    // 盾役の守りで受け直す（弱い人の守りで減らした分を戻し、盾役の守りで減らす）
    let d2 = Math.max(1, Math.round(dmg + (t.def || 0) * 0.5 - (g.def || 0) * 0.5));
    d2 = shieldBlock(sim, g, d2);
    ST(sim).cover++;
    g.guardT = S.t; g._covT = S.t;
    if (!g.fight || g.fight.target !== e.id) startFight(sim, g, e);
    const mm = thrOf(sim, e); mm[g.id] = Math.max(mm[g.id] || 0, (mm[t.id] || 0) * TUNE.THR_NEAR);   // 割って入った盾役に怒りが向く
    const mentorCase = g === mentor;
    say(sim, g, R.pick(mentorCase ? [`${t.given}、下がっていろ！`, 'おれの後ろにいろ！'] : ['下がれ！', 'させるか！', `${t.given}、無事か！`, '後ろへ！']));
    if (canLog(sim, g, 'cover')) sim.pushLog(`${g.given}が盾で${t.given}をかばった${mentorCase ? '（師匠が弟子を守った）' : ''}。`, 'event', [g.id, t.id], g.pos);
    if (t.rel && R.chance(0.3)) sim.relMut(t, g).a = Math.min(100, sim.rel(t, g).a + 3);
    return { t: g, dmg: d2 };
  }
  return null;
}
// 盾受け：盾があれば一定の確率で盾で受け止め、守りの力でさらに減らす
function shieldBlock(sim, g, dmg) {
  if (!g.eq?.shield || !sim.rng.chance(TUNE.BLOCK_P)) return dmg;
  ST(sim).block++; g.guardT = sim.S.t;
  return Math.max(1, Math.round(dmg * TUNE.BLOCK_MUL - (g.def || 0) * TUNE.DEF_CUT));
}

// 一撃のあと：人が魔物に与えた傷で怒りをためる（盾役は倍）。回復役の癒しは近くの魔物に分けて怒りに。かばった装備はよけいに傷む
export function tacticsAfterHit(sim, e, t, dmg) {
  if (!dmg || dmg <= 0) return;
  if (isHuman(e) && !isHuman(t)) {
    if (t.hp > 0) { const m = thrOf(sim, t); m[e.id] = (m[e.id] || 0) + dmg * thrMul(sim, e); }
    if (e.advClass === 'priest') {
      // 祈りの光（advclass.js）で癒した量のおおよそ
      const pt = e.party != null ? sim.S.advParties?.[e.party] : null;
      const hurt = pt ? pt.members.some((id) => { const x = sim.S.people[id]; return x && x.hp > 0 && x.hp < x.maxhp && Math.abs(x.pos.x - e.pos.x) <= 6 && Math.abs(x.pos.z - e.pos.z) <= 6; }) : e.hp < e.maxhp;
      if (hurt) {
        const heal = 3 + (e.lv || 1) * 0.6 + (e.stats?.wis ?? 10) * 0.15;
        const cs = fightingMonstersNear(sim, e.pos.x, e.pos.z, 6);
        for (const c of cs) { const m = thrOf(sim, c); m[e.id] = (m[e.id] || 0) + heal * TUNE.THR_HEAL / cs.length; }
      }
    }
  } else if (!isHuman(e) && isHuman(t) && t._covT === sim.S.t && sim.rng.chance(TUNE.COVER_WEAR)) {
    gearOnHit(sim, e, t, dmg);   // かばった盾役の装備は1.5倍傷む（修理代が鍛冶屋へ回る）
  }
}

// 人の間合い：弓・魔法は advclass.js のまま。回復役は後ろから
export function tacticsReach(sim, e) {
  if (e.advClass) return e.advClass === 'priest' ? TUNE.REACH_HEAL : advReach(e);
  return tacticsRole(sim, e) === 'heal' ? TUNE.REACH_HEAL : 1.3;
}

export function tacticsSummary(sim) { return { ...ST(sim) }; }
