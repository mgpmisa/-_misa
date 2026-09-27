// パーティの組み方と、盾役（騎士）の挑発・かばう（開発部）
//
// 社長の指示：
//   1. パーティを組むときは、ランクがあまり大きく離れない者どうしで組む。
//   2. パーティには、防御力の強い騎士（盾役）を入れることを優先する。
//   3. 騎士は挑発で魔物の気を引き、仲間に攻撃がいかないようにする。
//
// ■ 決まり
//   ・ランク合わせ：仲間どうしのランクの差は1段まで。親子・夫婦・深い絆（師匠と弟子）なら2段まで。
//     2段離れた組では、強い人が弱い人を守る（かばう相手として一番に選ぶ）。
//     パーティが受けられる依頼の格付けは「いちばん低い人のランク＋1」までに下がる。
//   ・役割：盾（騎士見習い・聖騎士・戦士、重い鎧と盾の人、騎士・近衛）／攻撃／回復（僧侶）／遠距離（弓・魔法）／斥候（シーフ）。
//     結成のときは、まず盾を1人、そのあと攻撃・回復・遠距離の順にそろえる。
//   ・助っ人：盾役のいないパーティが依頼（Dランク以上）に出るとき、ギルドの口利きで町の騎士・兵士（非番）を雇うことがある。
//   ・戦い：盾役は魔物を挑発して自分に向けさせ、近くの弱い仲間（後衛・回復役・子ども・弟子）への攻撃を盾で受け止める。
//     挑発の効き目は魔物の頭の良さ（monsters.js の intelOf）と怒り（手負い・盾役に傷つけられた）で変わる。切れると元の相手に戻る。
//     陣形：盾が前、攻撃役はその横、弓・魔法・回復は後ろ（間合いを取る）。
//
// ■ お金の流れ（どこからも湧かせない）
//   助っ人の雇い賃 … パーティの仲間の財布（足りなければ家計。property.js の pay）→ 雇われた騎士・兵士（property.js の earn）。
//                    頭割りで、払えない仲間がいれば雇わない。flow に「パーティの仲間 → 騎士・兵士：助っ人の雇い賃」と記録する。
//   それ以外（ランク合わせ・挑発・かばう・陣形）ではお金は動かない。
//
// ■ 状態（すべて遅延初期化。古いセーブでも動く）
//   S.tactics = { v, stats:{...} }         … 回数の記録
//   pt.mentor = { 弱い人id: 強い人id }      … 2段離れた深い関係の組
//   p.tHire   = { pt, q, until, fee }        … 助っ人として雇われている騎士・兵士
//   c.taunt   = { by, until, prev }          … 挑発された魔物（by の人を狙う。切れたら prev に戻る）
//   p.guardT  = 盾を構えた時刻（描画で「構える姿」を出す）
//
// ■ 本体からの呼び方（部長がつなぐ。patch_tactics.py）
//   tacticsDaily(sim)              … sim.js newDay の partyLifeDaily のあと
//   tacticsHourly(sim)             … sim.js newHourRest の partyLifeHourly のあと
//   tacticsFormParty(sim, leader, free, R) … guild.js partiesDaily の結成（仲間の選び方）
//   tacticsPickMates(sim, p, pool, n)      … guild.js takeQuest の臨時の仲間
//   tacticsCrewRank(sim, crew)             … guild.js takeQuest のパーティのランク
//   tacticsMonsterTurn(sim, e, t)  … society.js stepCombat：魔物の攻撃の直前（挑発で向きを変えたら true）
//   tacticsHumanTurn(sim, e, t)    … society.js stepCombat：人の攻撃の直前（挑発したら true。陣形の位置取り）
//   tacticsIncoming(sim, e, t, dmg) … society.js stepCombat：魔物の一撃が人に当たる直前（かばう・盾で受ける）→ { t, dmg }
//   tacticsReach(sim, e)           … society.js stepCombat：人の間合い（回復役も後ろに下がる）
//   tacticsRole(sim, p) / tacticsRoleName(sim, p) / tacticsLineup(sim, pt) / tacticsRows(sim, p, link) … 表示
import { JOBS, SPECIES } from './data.js';
import { advClassOf, advReach } from './advclass.js';
import { intelOf } from './monsters.js';
import { startFight } from './society.js';
import { pay, earn, spendable } from './property.js';
import { flow } from './ledger.js';
import { T, walkable, tileAt } from './world.js';

// ---------- 数の目安（調査部の docs/戦闘の研究.md ができたら、ここだけ合わせる） ----------
export const TUNE = {
  RANK_GAP: 1,          // ふつうの仲間どうしのランクの差の上限
  RANK_GAP_DEEP: 2,     // 親子・夫婦・深い絆（師匠と弟子）の上限
  DEEP_REL: 65,         // 深い絆とみなす好感（両方向）
  DEEP_BOND: 60,        // パーティの絆値（partylife.js）でも深いとみなす
  TAUNT_R: 5,           // 挑発の声が届く距離（マス）
  TAUNT_CD: 6,          // 挑発のあと、次に挑発できるまで（分）
  TAUNT_BASE: 0.9,      // 挑発の効きやすさ（知能0の魔物）
  TAUNT_INTEL: 0.55,    // 知能1で効きやすさがこれだけ下がる
  TAUNT_RAGE: 0.2,      // 怒っている（手負い・盾役に傷つけられた）ときの上乗せ
  TAUNT_MIN: 8,         // 挑発が続く時間（分）：知能1のとき
  TAUNT_MAX: 16,        //                    知能0のとき
  COVER_R: 2.6,         // かばえる距離（マス）
  COVER_P: 0.45,        // かばう確率（よその人）
  COVER_P_MATE: 0.7,    // かばう確率（同じパーティの仲間）
  COVER_P_MENTOR: 0.8,  // 師匠が弟子をかばう確率
  COVER_HP: 0.35,       // これより弱った盾役はかばわない
  BLOCK_P: 0.35,        // 盾役が自分への攻撃を盾で受け止める確率（盾があるとき）
  BLOCK_MUL: 0.55,      // 盾で受けたときの傷の倍率
  ARMOR_MUL: 0.8,       // 盾なし（鎧だけ）で受けたときの倍率
  DEF_CUT: 0.3,         // 守りの力（def）のこの割合を、さらに傷から引く
  REACH_HEAL: 2.6,      // 回復役は後ろから（間合い）
  REAR_KEEP: 2.2,       // 後衛はこれより近づかれたら少し下がる
  SIDE_STEP: 0.35,      // 攻撃役が盾役の横へずれる1回の量
  HIRE_P: 0.35,         // 盾役のいないパーティが助っ人を雇う確率（1時間ごと）
  HIRE_MIN_Q: 2,        // 助っ人を雇うのは、この格付け（D）以上の依頼
  HIRE_DAYS: 4,         // 雇う日数
  HIRE_DAY_FEE: 5,      // 1日あたりの雇い賃（＋レベル×0.6）
  HIRE_TOWN_MAX: 2,     // 1つの町から同時に雇える助っ人の数（町の守りを空けない）
  LOG_GAP: 45,          // 同じ人の挑発・かばうのログを出す間隔（分）
};

const TANK_CLASS = new Set(['squire', 'paladin', 'fighter']);
const ATTACK_CLASS = new Set(['hero', 'swordsman', 'monk', 'bandit']);
const RANGED_CLASS = new Set(['archer', 'wizard', 'sorcerer']);
const HEAVY = new Set(['chainmail', 'platearmor', 'scalearmor']);
const HIRE_JOBS = new Set(['knight', 'soldier']);
export const ROLE_NAME = { tank: '盾', attack: '攻撃', heal: '回復', ranged: '遠距離', scout: '斥候' };
const WANT = ['tank', 'attack', 'heal', 'ranged'];

const isHuman = (e) => typeof e.id === 'number';
const alive = (m) => !!m && m.deathYear == null && m.hp > 0;
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

// ---------- 状態 ----------
const STAT_KEYS = ['formed', 'formedTank', 'mentorPairs', 'rankRefused', 'rankLeave', 'taunt', 'tauntResisted', 'pulled', 'tauntEnd', 'cover', 'block', 'hired', 'hireFee', 'hireEnd', 'sideStep', 'backStep'];
export function tacticsState(sim) {
  const S = sim.S;
  if (!S.tactics) S.tactics = { v: 1, stats: {} };
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
    const pt = sim.S.advParties?.[a.party];
    const bd = pt?.bond || {};
    if ((bd[a.id] || 0) >= TUNE.DEEP_BOND && (bd[b.id] || 0) >= TUNE.DEEP_BOND && (sim.rel(a, b).a || 0) >= 40) return true;
  }
  return false;
}
// その人を、今の顔ぶれに加えてよいか
export function rankFits(sim, o, picks) {
  const r = rankOf(o);
  for (const m of picks) {
    const g = Math.abs(rankOf(m) - r);
    if (g <= TUNE.RANK_GAP) continue;
    if (g <= TUNE.RANK_GAP_DEEP && deepTie(sim, o, m)) continue;
    return false;
  }
  return true;
}
// パーティのランク：平均（3人以上なら＋1）。ただし、いちばん低い人のランク＋1まで
export function tacticsCrewRank(sim, crew) {
  const ms = crew.filter(Boolean);
  if (!ms.length) return 0;
  const rs = ms.map(rankOf);
  const avg = rs.reduce((a, b) => a + b, 0) / rs.length;
  const base = Math.round(avg + (ms.length >= 3 ? 1 : 0));
  return Math.max(0, Math.min(6, Math.min(base, Math.min(...rs) + 1)));
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
    if (heavy) return 'tank';          // 重い鎧と盾を持つ剣士・盗賊・シーフは盾役を務める
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
// かばってもらう側：後衛・回復役・子ども・深手の人
function isWeak(sim, t) {
  const r = tacticsRole(sim, t);
  if (r === 'heal' || r === 'ranged') return true;
  if (sim.ageOf(t) < 14) return true;
  if (!(JOBS[t.job]?.combat) && !t.advClass) return true;
  return t.hp < t.maxhp * 0.35;
}

// ---------- 結成：盾を先に、次に攻撃・回復・遠距離。ランクの近い者どうし ----------
export function tacticsFormParty(sim, leader, free, R = sim.rng) {
  const picks = [leader];
  const roles = new Set([tacticsRole(sim, leader)]);
  const pool = free.filter((o) => o !== leader && sim.rel(leader, o).a > -5);
  let refused = 0;
  const fits = pool.filter((o) => { const ok = rankFits(sim, o, [leader]); if (!ok) refused++; return ok; });
  if (refused) ST(sim).rankRefused += refused;
  const score = (o) => {
    const r = tacticsRole(sim, o);
    const need = WANT.indexOf(r);
    let s = sim.rel(leader, o).a;
    if (!roles.has(r)) s += need >= 0 ? 40 - need * 6 : 8;   // 足りない役割ほど先に（盾がいちばん）
    else s -= 20;
    s -= Math.abs(rankOf(o) - rankOf(leader)) * 6 + Math.abs((o.lv || 1) - (leader.lv || 1));
    return s;
  };
  // 1) 盾役を1人（盾役は誘いに応じやすい）
  if (!roles.has('tank')) {
    const tank = fits.filter((o) => isTank(sim, o)).sort((a, b) => score(b) - score(a))[0];
    if (tank && R.chance(0.75 + tank.pers.A * 0.2)) { picks.push(tank); roles.add('tank'); }
  }
  // 2) 残りは、足りない役割から（全員の顔ぶれとランクが合う者だけ）
  for (let guard = 0; guard < 12 && picks.length < 4; guard++) {
    const cand = fits.filter((o) => !picks.includes(o) && rankFits(sim, o, picks)).sort((a, b) => score(b) - score(a));
    if (!cand.length) break;
    const o = cand[0];
    if (R.chance(0.5 + o.pers.A * 0.4)) { picks.push(o); roles.add(tacticsRole(sim, o)); }
    else fits.splice(fits.indexOf(o), 1);   // 断られた
  }
  if (picks.length >= 2) { ST(sim).formed++; if (roles.has('tank')) ST(sim).formedTank++; }
  return picks;
}
// 結成のあと：2段離れた深い関係の組を「師匠と弟子」として覚える（guild.js が結成のログを出したあとで呼ぶ）
export function tacticsAfterForm(sim, pt) {
  if (!pt) return;
  const ms = pt.members.map((id) => sim.S.people[id]).filter(alive);
  for (const a of ms) for (const b of ms) {
    if (rankOf(a) - rankOf(b) < 2 || !deepTie(sim, a, b)) continue;
    pt.mentor = pt.mentor || {};
    if (pt.mentor[b.id] != null) continue;
    pt.mentor[b.id] = a.id; ST(sim).mentorPairs++;
    sim.remember(a, `ランクの離れた${b.given}と組んだ。自分が${b.given}を守ってやらねば`, { emo: 0.4, imp: 0.6, about: [b.id], k: 'party' });
    sim.remember(b, `${a.given}に付いて、腕を磨かせてもらうことになった`, { emo: 0.6, imp: 0.6, about: [a.id], k: 'party' });
    sim.pushLog(`パーティー「${pt.name}」では、${a.given}が師匠のように${b.given}の面倒を見ている。`, 'event', [a.id, b.id], a.pos);
  }
}
// 臨時の仲間（ソロの冒険者が依頼のために声をかける）：ランクの合う者、盾役を先に
export function tacticsPickMates(sim, p, pool, n) {
  const out = [];
  const ok = pool.filter((o) => rankFits(sim, o, [p]));
  const tank = isTank(sim, p) ? null : ok.find((o) => isTank(sim, o));
  if (tank && n > 0) out.push(tank);
  for (const o of ok) { if (out.length >= n) break; if (!out.includes(o) && rankFits(sim, o, [p, ...out])) out.push(o); }
  return out;
}

// ---------- 陣容の表示 ----------
export function tacticsLineup(sim, pt) {
  const ms = (pt.members || []).map((id) => sim.S.people[id]).filter((m) => m && m.deathYear == null);
  const have = new Set(ms.map((m) => tacticsRole(sim, m)));
  const n = WANT.filter((r) => have.has(r)).length;
  const grade = n >= 4 ? 'そろっている' : n === 3 ? 'よい' : have.has('tank') ? 'ふつう' : '盾がいない';
  return `陣容：${WANT.filter((r) => have.has(r)).map((r) => ROLE_NAME[r]).join('・') || 'なし'}${have.has('scout') ? '・斥候' : ''}（${grade}）`;
}
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 人の詳細欄（<dl class="kv"> の中）：役割、陣形の位置、師匠・弟子、助っ人
export function tacticsRows(sim, p, link = (x) => escH(x.given)) {
  if (!p || p.deathYear != null) return '';
  const r = tacticsRole(sim, p);
  const pos = { tank: '前に立ち、魔物を挑発して仲間をかばう', attack: '盾役の横から斬り込む', heal: '後ろから仲間を癒す', ranged: '後ろから撃つ', scout: '先を探り、罠を外す' }[r];
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

// ---------- 毎日：ランクが離れすぎた仲間は抜ける（古いセーブのパーティ） ----------
export function tacticsDaily(sim) {
  const S = sim.S, R = sim.rng;
  tacticsState(sim);
  for (const pt of Object.values(S.advParties || {})) {
    if (pt.gone) continue;
    const ms = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && m.party === pt.id && !m.tHire);
    if (ms.length < 3) continue;   // 2人組は解散になるので、無理に抜けさせない
    // いちばん離れた組の、低いほうが抜ける（深い関係は2段まで許す）
    let worst = null, wg = 0;
    for (const a of ms) for (const b of ms) {
      const g = rankOf(a) - rankOf(b);
      if (g <= TUNE.RANK_GAP || (g <= TUNE.RANK_GAP_DEEP && deepTie(sim, a, b))) continue;
      if (g > wg) { wg = g; worst = b; }
    }
    if (!worst || worst.quest || !R.chance(0.3)) continue;
    const i = pt.members.indexOf(worst.id); if (i >= 0) pt.members.splice(i, 1);
    worst.party = null;
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
  // 雇いの終わり：依頼が済んだ・期限・任務が入った・パーティが解散した
  const hiredBy = {};
  for (const k of sim.living()) {
    if (!k.tHire) continue;
    const h = k.tHire, pt = S.advParties?.[h.pt];
    const q = (S.quests || []).find((x) => x.id === h.q);
    if (!pt || pt.gone || !pt.members.includes(k.id) || !q || !['taken'].includes(q.state) || sim.today > h.until || (k.mission && ['march', 'crusade', 'defend'].includes(k.mission.type)) || k.jail != null) {
      release(sim, k, !q || q.state === 'report' || q.state === 'done' ? '務め終えた' : '途中で終えた');
      continue;
    }
    hiredBy[k.s] = (hiredBy[k.s] || 0) + 1;
    // 助っ人はリーダーにならない（リーダーが倒れて引き継がれたら、冒険者に戻す）
    if (pt.leader === k.id) { const nl = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && !m.tHire).sort((a, b) => (b.lv || 1) - (a.lv || 1))[0]; if (nl) pt.leader = nl.id; }
  }
  // 雇い入れ：盾役のいないパーティが、D以上の依頼を引き受けたとき
  for (const pt of Object.values(S.advParties || {})) {
    if (pt.gone) continue;
    const ms = pt.members.map((id) => S.people[id]).filter((m) => alive(m) && m.party === pt.id);
    if (ms.length < 2 || ms.some((m) => isTank(sim, m))) continue;
    const q = partyQuest(sim, ms);
    if (!q || q.state !== 'taken' || q.rank < TUNE.HIRE_MIN_Q || q.hireTried) continue;
    const L = S.people[pt.leader] && alive(S.people[pt.leader]) ? S.people[pt.leader] : ms[0];
    if (L.inside == null && sim.town(L.s) && Math.hypot(L.pos.x - sim.town(L.s).x, L.pos.z - sim.town(L.s).z) > sim.town(L.s).r + 4) continue;   // ギルドのある町にいるときだけ
    q.hireTried = true;
    if (!R.chance(TUNE.HIRE_P + (q.rank - TUNE.HIRE_MIN_Q) * 0.1)) continue;
    if ((hiredBy[L.s] || 0) >= TUNE.HIRE_TOWN_MAX) continue;
    const k = sim.living().filter((o) => HIRE_JOBS.has(o.job) && o.s === L.s && !o.tHire && o.party == null && !o.mission && !o.fight && o.jail == null && !o.quest
      && sim.ageOf(o) >= 18 && sim.ageOf(o) <= 50 && o.hp > o.maxhp * 0.8 && isTank(sim, o)
      && !(o.action && ['work', 'defend', 'patrol', 'alert', 'march'].includes(o.action.type)))
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

// ---------- 戦い ----------
function canLog(sim, p, key) {
  const t = sim.S.t;
  p._tlog = p._tlog || {};
  if (p._tlog[key] != null && t - p._tlog[key] < TUNE.LOG_GAP) return false;
  p._tlog[key] = t; return true;
}
const say = (sim, e, text) => { if (sim.isWatched(e)) sim.events.push({ type: 'say', id: e.id, text }); };
const monName = (c) => c.name || SPECIES[c.sp]?.name || '魔物';
const allyOf = (sim, g, t) => isHuman(t) && t !== g && t.deathYear == null && !(t.fight && t.fight.target === g.id) && !(t.bandit && !g.bandit);
const samePt = (a, b) => a.party != null && a.party === b.party;
function mentorOf(sim, t) {
  if (t.party == null) return null;
  const pt = sim.S.advParties?.[t.party];
  const id = pt?.mentor?.[t.id];
  return id != null ? sim.S.people[id] : null;
}
// 戦っている魔物の一覧（近くのもの）
function fightingMonstersNear(sim, x, z, r) {
  const out = [];
  const src = sim._fighting instanceof Set && sim._fighting.size ? sim._fighting : null;
  const it = src || Object.values(sim.S.creatures);
  for (const c of it) {
    if (!c.fight || c.hp <= 0 || isHuman(c)) continue;
    if (Math.abs(c.pos.x - x) > r || Math.abs(c.pos.z - z) > r) continue;
    out.push(c);
  }
  return out;
}

// 人の番：盾役は挑発する。攻撃役は盾役の横へ、後衛は下がる
export function tacticsHumanTurn(sim, e, t) {
  if (!isHuman(e) || !t || isHuman(t)) return false;   // 魔物と戦うときだけ
  const S = sim.S;
  t.lastHitBy = e.id;   // 魔物は、自分に斬りかかった者を覚える（挑発が切れたときの戻り先）
  const role = tacticsRole(sim, e);
  if (role === 'tank') {
    if (S.t < (e.tauntCd || 0) || e.hp < e.maxhp * 0.25) return false;
    // 仲間（自分以外の人）を狙っている魔物
    const foes = fightingMonstersNear(sim, e.pos.x, e.pos.z, TUNE.TAUNT_R).filter((c) => {
      if (c.taunt && c.taunt.by === e.id && c.taunt.until > S.t) return false;
      const v = sim.entity(c.fight.target);
      return v && v !== e && allyOf(sim, e, v) && Math.hypot(c.pos.x - e.pos.x, c.pos.z - e.pos.z) <= TUNE.TAUNT_R;
    });
    if (!foes.length) return false;
    e.tauntCd = S.t + TUNE.TAUNT_CD; e.guardT = S.t;
    const R = sim.rng;
    let won = 0;
    for (const c of foes) {
      const I = c.intel ?? intelOf(c);
      const rage = (c.hp < c.maxhp * 0.5 || c.lastHitBy === e.id || (c.enraged && c.enraged > S.t)) ? TUNE.TAUNT_RAGE : 0;
      const p = Math.max(0.05, Math.min(0.97, TUNE.TAUNT_BASE - I * TUNE.TAUNT_INTEL + rage));
      if (!R.chance(p)) { ST(sim).tauntResisted++; continue; }
      c.taunt = { by: e.id, until: S.t + TUNE.TAUNT_MAX - (TUNE.TAUNT_MAX - TUNE.TAUNT_MIN) * I, prev: c.taunt?.prev ?? c.fight.target };
      won++;
    }
    ST(sim).taunt++;
    const who = JOBS[e.job]?.rank === 'knight' || e.job === 'paladin' || e.advClass === 'squire' || e.advClass === 'paladin' ? '騎士' : tacticsRoleName(sim, e) === '盾' ? '盾役の' : '';
    const target = foes[0];
    say(sim, e, won ? R.pick([`こっちだ、${monName(target)}！`, 'おれが相手だ！ かかってこい！', '仲間には指一本触れさせん！', '来い！ この盾を破ってみろ！']) : 'くそっ、こっちを向け！');
    if (won && canLog(sim, e, 'taunt')) sim.pushLog(`${who}${e.given}が大声で挑発し、${monName(target)}${won > 1 ? `たち${won}体` : ''}の注意を引きつけた。`, 'event', [e.id], e.pos);
    return true;
  }
  // 陣形：攻撃役は、同じ相手と戦う盾役の横へ少しずれる。後衛は近づかれたら少し下がる
  if (role === 'attack') {
    const tank = e.party != null ? sim.S.advParties?.[e.party]?.members.map((id) => sim.S.people[id]).find((m) => m && m !== e && alive(m) && m.fight?.target === t.id && isTank(sim, m) && dist(m, e) < 2.5) : null;
    if (tank && dist(e, tank) < 0.9) {
      const dx = t.pos.x - tank.pos.x, dz = t.pos.z - tank.pos.z, d = Math.hypot(dx, dz) || 1;
      const side = (e.id & 1) ? 1 : -1;
      nudge(sim, e, (-dz / d) * TUNE.SIDE_STEP * side, (dx / d) * TUNE.SIDE_STEP * side) && ST(sim).sideStep++;
    }
  } else if (role === 'ranged' || role === 'heal') {
    const d = dist(e, t);
    if (d < TUNE.REAR_KEEP && t.fight?.target === e.id) {
      const dx = e.pos.x - t.pos.x, dz = e.pos.z - t.pos.z, n = Math.hypot(dx, dz) || 1;
      nudge(sim, e, (dx / n) * 0.5, (dz / n) * 0.5) && ST(sim).backStep++;
    }
  }
  return false;
}
function nudge(sim, e, dx, dz) {
  const x = e.pos.x + dx, z = e.pos.z + dz;
  const tl = tileAt(sim.S.world, Math.round(x), Math.round(z));
  if (!walkable(tl) || tl === T.BLD) return false;
  e.pos.x = x; e.pos.z = z; return true;
}

// 魔物の番：挑発されていれば、挑発した盾役へ向き直る。切れたら元の相手へ
export function tacticsMonsterTurn(sim, e, t) {
  if (isHuman(e) || !e.taunt) return false;
  const S = sim.S, tn = e.taunt;
  const by = S.people[tn.by];
  if (tn.until <= S.t || !alive(by) || by.jail != null || by.inside != null || dist(e, by) > 8) {
    // 挑発が切れた：元の相手（まだ近くにいれば）に戻る
    delete e.taunt; ST(sim).tauntEnd++;
    let prev = tn.prev != null ? sim.entity(tn.prev) : null;
    if (!prev || prev.hp <= 0) prev = e.lastHitBy != null ? sim.entity(e.lastHitBy) : null;
    if (prev && prev !== t && prev.hp > 0 && (!isHuman(prev) || (prev.deathYear == null && prev.jail == null && prev.inside == null)) && dist(e, prev) < 6) { e.fight.target = prev.id; return true; }
    return false;
  }
  if (e.fight.target === by.id) return false;
  e.fight.target = by.id;
  ST(sim).pulled++;
  if (!by.fight) startFight(sim, by, e);
  return true;   // 向き直るのに、この回の攻撃を使う
}

// 魔物の一撃が人に当たる直前：盾役は盾で受け、近くの盾役は弱い仲間をかばう → { t, dmg }
export function tacticsIncoming(sim, e, t, dmg) {
  if (isHuman(e) || !isHuman(t) || dmg <= 0) return null;
  const S = sim.S, R = sim.rng;
  // 盾役自身への攻撃：盾で受け止める
  if (isTank(sim, t)) {
    const out = guardHit(sim, t, dmg);
    return out === dmg ? null : { t, dmg: out };
  }
  if (!isWeak(sim, t)) return null;
  // かばう人を探す：師匠 → 同じパーティの盾役 → 近くの盾役（騎士・兵士）
  const cands = [];
  const mentor = mentorOf(sim, t);
  if (mentor && alive(mentor) && mentor.inside == null && dist(mentor, t) <= TUNE.COVER_R && mentor.hp > mentor.maxhp * TUNE.COVER_HP) cands.push([mentor, TUNE.COVER_P_MENTOR]);
  for (const g of nearPeople(sim, t, TUNE.COVER_R)) {
    if (g === t || g === mentor || !isTank(sim, g) || g.hp <= g.maxhp * TUNE.COVER_HP || !allyOf(sim, g, t) || g.inside != null) continue;
    cands.push([g, samePt(g, t) ? TUNE.COVER_P_MATE : TUNE.COVER_P]);
  }
  for (const [g, p] of cands) {
    if (!R.chance(p)) continue;
    const d2 = guardHit(sim, g, dmg, true);
    ST(sim).cover++;
    g.guardT = S.t;
    // かばった盾役は、そのまま相手を引き受ける
    if (!g.fight || g.fight.target !== e.id) startFight(sim, g, e);
    if (e.fight && e.fight.target === t.id && R.chance(0.5)) e.fight.target = g.id;
    const mentorCase = g === mentor;
    say(sim, g, R.pick(mentorCase ? [`${t.given}、下がっていろ！`, 'おれの後ろにいろ！'] : ['下がれ！', 'させるか！', `${t.given}、無事か！`, '後ろへ！']));
    if (canLog(sim, g, 'cover')) sim.pushLog(`${g.given}が盾で${t.given}をかばった${mentorCase ? '（師匠が弟子を守った）' : ''}。`, 'event', [g.id, t.id], g.pos);
    if (t.rel && R.chance(0.3)) sim.relMut(t, g).a = Math.min(100, sim.rel(t, g).a + 3);
    return { t: g, dmg: d2 };
  }
  return null;
}
function nearPeople(sim, t, r) {
  const out = [];
  // 同じパーティの仲間と、戦っている人（兵士・騎士）から探す（全員をなめない）
  const pt = t.party != null ? sim.S.advParties?.[t.party] : null;
  if (pt && !pt.gone) for (const id of pt.members) { const m = sim.S.people[id]; if (alive(m) && m !== t && dist(m, t) <= r) out.push(m); }
  const key = sim.S.t;
  if (!sim._tacF || sim._tacF.t !== key) {
    sim._tacF = { t: key, list: [] };
    for (const p of sim.living()) if ((p.fight || p.tHire) && p.inside == null && isTank(sim, p)) sim._tacF.list.push(p);
  }
  for (const p of sim._tacF.list) if (!out.includes(p) && p !== t && alive(p) && dist(p, t) <= r) out.push(p);
  return out;
}
// 盾役が受ける傷：盾があれば一定の確率で盾で受け止め、守りの力でさらに減らす
function guardHit(sim, g, dmg, covering = false) {
  const eq = g.eq || {};
  let d = dmg;
  if (eq.shield && (covering || sim.rng.chance(TUNE.BLOCK_P))) { d *= TUNE.BLOCK_MUL; ST(sim).block++; g.guardT = sim.S.t; }
  else if (covering) d *= TUNE.ARMOR_MUL;
  else return dmg;
  d -= (g.def || 0) * TUNE.DEF_CUT;
  return Math.max(1, Math.round(d));
}

// 人の間合い：弓・魔法は advclass.js のまま。回復役は後ろから
export function tacticsReach(sim, e) {
  if (e.advClass) return e.advClass === 'priest' ? TUNE.REACH_HEAL : advReach(e);
  const r = tacticsRole(sim, e);
  return r === 'heal' ? TUNE.REACH_HEAL : 1.3;
}

export function tacticsSummary(sim) { return { ...ST(sim) }; }
