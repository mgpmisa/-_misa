// 子どもの経験と職業（開発部）― 企画部の設計書 docs/子どもの経験と職業.md の第1段・第2段
//
// 社長の指示「子どもの頃の経験で、大人になって就く職業が決まる。家庭環境とお金で、できる経験が変わる」。
// 子どもは行動するたびに「経験」（18種、0〜100）をためる。家の豊かさ（5段階）で、通える学び舎とできる遊びが変わる。
// 学び舎と習い事はお金を払って通う（払う側と受け取る側は必ず決まっている。払えない家は通えない）。
// 14歳の誕生日の職選びは、経験・才能・家業・町の不足・夢・身分の点数で決まる。
//
// ■ 本体から呼ぶ関数
//   childOptions(sim, p, cands, add) … sim.js decide：civicOptions などのあと。子どもの行動（type 'kid'、中身 a.k）を足し、
//                                      お金を払っていない子の魔法学園・道場・日曜学校の候補を外す
//   childDo(sim, p, dt)             … sim.js doAction の switch（case 'kid'）：支払い・駄賃・危険・出来事・思い出
//   childHourly(sim, list)          … hourSlice の growthHourly のあと：経験をためる。技能と能力を子ども率0.5で伸ばす
//   childDaily(sim)                 … newDay（誕生日の処理の前）：家の段階・季節の月謝・奨学・拾い上げ・一度きりの出来事
//   childFirstJob(sim, p)           … 14歳の誕生日：点数で職を選ぶ（選べなければ null → 今までの civicFirstJob）
//   kidActText(sim, p, a, short)    … ui.js actionText：「チャンバラをしている」など
//   childCardHtml(sim, p, esc)      … ui.js 人物の詳細欄「子ども時代」
//   kidClassBonus(p, cls)           … advclass.js pickClass：冒険者の職業への上乗せ点（経験/40）
//   KACT                            … 行動の表（anim_kids.js が動きを選ぶのに使う）
//
// ■ 状態（古いセーブで欠けていても動く）
//   p.kid = { v, xp:{経験:0〜100}, hrs:{行動:時間}, tier:1〜5, lessons:{習い事:…}, events:[…], fav, went:{学び舎:時間}, own:{持ち物}, cnt:{…}, est }
//   S.childhood = { v, season, year, picks:{…}, stats:{ fee:{…}, first:[…], ev:{…} } }
//
// ■ お金の流れ（すべて取り引き。払えなければしない）
//   教会の手習い 家計 → 教会の施し箱（季節5）／町の学校 家計 → 町の蓄え（季節15）／算術の塾 家計 → 教える人の家計（季節20）
//   家庭教師 家計 → 先生の家計（1回6）／魔法の手ほどき 家計 → 魔法使いの家計（1回10）／魔法学園 家計 → 導師の家計（季節60）
//   剣術道場 家計 → 師範の家計（季節20、兵士・騎士の子は半額）／乗馬 家計 → 馬丁（1回4）／弓 家計 → 狩人（1回2）・弓 家計 → 大工（8）
//   楽器 家計 → 楽師（1回3）・笛 家計 → 大工か細工師（8）／踊り 家計 → 踊り子（1回3）／行儀作法 家計 → 執事（季節10）
//   小姓 家計 → 騎士の家計（80、1回）／商家の見習い 家計 → 商人（100、1回）／弟子入り 家計 → 親方（60〜150、1回）
//   修道院 家計 → 教会の施し箱（30、1回）／留学 家計 → 他国の導師（年300）／本 家計 → 書記か商人（40）
//   奨学生 国庫 → 町の蓄え・導師／駄賃 頼んだ人の財布・家計 → 子の財布／奉公の給金 雇い主の家計 → 子の家の家計
//   子の財布は夜に家計へ（困窮・貧しい家は全額、ふつうは半分）／罰金 家計 → 町の蓄え・国庫／弁償 家計 → 被害の家計・市場の金庫
import { JOBS, JOB_QUOTA, DAYS_PER_SEASON, DAYS_PER_YEAR } from './data.js';
import { ensureGrowth, gainSkill, gainStat, jobGrowth, SKILL_LIST } from './growth.js';
import { chooseYouthJob, lackingJobs, YOUTH_JOBS, SENIOR_JOBS } from './history.js';
import { flow } from './ledger.js';
import { restDayFor } from './labor.js';
import { tooDangerous } from './danger.js';
import { T, tileAt } from './world.js';
import { findPath } from './path.js';
import { weatherMood } from './weather.js';

// ================================================================ 経験
export const EXP = {
  bu: '武（打ち合い）', aim: '狙い', body: '体', wild: '山野の知恵', water: '水', soil: '畑と家畜', craft: '手仕事', trade: '商いと数',
  letter: '読み書き', lore: '知識', magic: '魔力', faith: '祈り', art: '歌と芸', care: '世話と料理', court: '礼儀と騎乗', shadow: '裏の経験',
  nerve: '度胸', lead: '人を動かす',
};
const EXP_KEYS = Object.keys(EXP);
// 経験 → 伸びやすさを決める能力の素質
const TAL = { bu: ['str', 'agi'], aim: ['dex'], body: ['vit', 'str'], wild: ['agi', 'int'], water: ['vit'], soil: ['str', 'vit'], craft: ['dex'], trade: ['cha', 'int'], letter: ['int'], lore: ['int'], magic: ['int', 'wis'], faith: ['wis'], art: ['cha', 'dex'], care: ['wis', 'cha'], court: ['cha'], shadow: ['agi', 'dex'], nerve: ['vit', 'wis'], lead: ['cha'] };
// 経験 → 今の growth.js の技能（子ども率 0.5 で伸ばす）
const EXP_SKILL = {
  bu: [['剣術', 0.7], ['格闘', 0.4]], aim: [['弓術', 1]], body: [['登山', 0.3]], wild: [['狩猟', 0.5], ['薬学', 0.5]], water: [['泳ぎ', 1], ['釣り', 0.4]],
  soil: [['農耕', 0.7], ['畜産', 0.5]], craft: [['木工', 0.5], ['細工', 0.5]], trade: [['商い', 1]], letter: [['読み書き', 1]], lore: [['学問', 1]],
  magic: [['攻撃魔法', 0.6], ['回復魔法', 0.4]], faith: [['祈り', 1]], art: [['歌と楽器', 0.6], ['踊り', 0.4]], care: [['料理', 0.6], ['医術', 0.2]],
  court: [['騎乗', 0.6], ['話術', 0.4]], shadow: [['隠密', 0.7], ['盗み', 0.3]], nerve: [], lead: [['統率', 0.5], ['話術', 0.5]],
};
// 職業 → [主の経験, 副の経験]（表4-2。家の手伝い・親のまね・大人の生い立ちの推定にも使う）
export const JOB_EXP = {
  farmer: ['soil', 'body'], rancher: ['soil', 'wild'], shepherd: ['soil', 'wild'], beekeeper: ['soil', 'craft'], gardener: ['soil', 'art'], miller: ['craft', 'body'],
  baker: ['care', 'craft'], cook: ['care', 'craft'], butcher: ['craft', 'care'], brewer: ['craft', 'care'], fisher: ['water', 'craft'], sailor: ['water', 'nerve'],
  captain: ['water', 'lead'], diver: ['water', 'body'], ferryman: ['water', 'body'], keeper: ['nerve', 'water'], shipwright: ['craft', 'water'], hunter: ['wild', 'aim'],
  gatherer: ['wild', 'lore'], herbalist: ['lore', 'wild'], woodcutter: ['body', 'wild'], charcoal: ['body', 'wild'], miner: ['body', 'craft'], mason: ['craft', 'body'],
  pioneer: ['body', 'nerve'], roadworker: ['body', 'craft'], smith: ['craft', 'body'], carpenter: ['craft', 'body'], tailor: ['craft', 'care'], weaver: ['craft', 'care'],
  cobbler: ['craft', 'care'], potter: ['craft', 'art'], jeweler: ['craft', 'art'], merchant: ['trade', 'letter'], changer: ['trade', 'letter'], peddler: ['trade', 'body'],
  innkeeper: ['care', 'trade'], servant: ['care', 'court'], maid: ['care', 'court'], butler: ['court', 'care'], nanny: ['care', 'faith'], midwife: ['care', 'faith'],
  laundress: ['care', 'body'], stablehand: ['court', 'soil'], coachman: ['court', 'soil'], messenger: ['body', 'lead'], scribe: ['letter', 'lore'], teacher: ['letter', 'lore'],
  scholar: ['lore', 'letter'], doctor: ['lore', 'care'], alchemist: ['lore', 'magic'], wizard: ['magic', 'lore'], courtmage: ['magic', 'lore'], sage: ['magic', 'lore'],
  magister: ['magic', 'lore'], priest: ['faith', 'letter'], nun: ['faith', 'letter'], cleric: ['faith', 'nerve'], paladin: ['faith', 'bu'], gravedigger: ['nerve', 'faith'],
  soldier: ['bu', 'body'], militia: ['bu', 'body'], guard: ['bu', 'body'], gatekeeper: ['bu', 'body'], watchman: ['nerve', 'body'], jailer: ['nerve', 'bu'],
  knight: ['court', 'bu'], royalguard: ['court', 'bu'], general: ['lead', 'bu'], swordmaster: ['bu', 'lead'], warrior: ['bu', 'nerve'], adventurer: ['nerve', 'bu'],
  archer: ['aim', 'body'], musician: ['art', 'lead'], bard: ['art', 'lead'], dancer: ['art', 'body'], troupe: ['art', 'body'], jester: ['art', 'lead'], painter: ['art', 'craft'],
  storyteller: ['lore', 'art'], fortune: ['lore', 'shadow'], barber: ['craft', 'care'], pickpocket: ['shadow', 'trade'], thief: ['shadow', 'nerve'], banditchief: ['shadow', 'lead'],
  pirate: ['shadow', 'water'], smuggler: ['shadow', 'trade'], swindler: ['lead', 'shadow'], beggar: ['shadow', 'lead'], elder: ['lead', 'lore'], noble: ['court', 'letter'],
  royal: ['court', 'letter'], king: ['court', 'lead'], chancellor: ['letter', 'lead'], treasurer: ['trade', 'letter'], overseer: ['lead', 'letter'], wanderer: ['wild', 'body'],
  guildmaster: ['lead', 'bu'],
};

// ================================================================ 小道具
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v * 10) / 10;
const h01 = (n, salt = 0) => { let x = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 7, 0xc2b2ae35)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; return (x >>> 0) / 4294967296; };
const alive = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null && q.needs ? q : null; };
const jobName = (j) => JOBS[j]?.name || j || '';
const parentsOf = (sim, p) => [alive(sim, p.fatherId), alive(sim, p.motherId)].filter(Boolean);
const NOBLE = new Set(['king', 'royal', 'noble']);
const RICH_JOBS = new Set(['merchant', 'doctor', 'knight', 'changer', 'jeweler', 'captain', 'guildmaster', 'general', 'chancellor', 'treasurer', 'courtmage', 'royalguard', 'magister', 'swordmaster']);
const CRAFT_JOBS = new Set(['smith', 'carpenter', 'tailor', 'weaver', 'cobbler', 'potter', 'jeweler', 'shipwright', 'mason', 'butcher', 'brewer', 'miller', 'baker', 'barber']);
const SWORD_FAMILY = new Set(['knight', 'soldier', 'general', 'royalguard', 'paladin', 'warrior', 'adventurer', 'swordmaster', 'guildmaster', 'gatekeeper', 'guard', 'militia']);
const MAGIC_FAMILY = new Set(['wizard', 'courtmage', 'sage', 'alchemist', 'magister']);
const BAD_JOBS = new Set(['thief', 'pickpocket', 'banditchief', 'pirate', 'smuggler', 'swindler']);
const tribalOf = (s) => !!(s && s.tribal && s.annexed == null);

// ================================================================ 状態
export function childState(sim) {
  const S = sim.S;
  if (!S.childhood) S.childhood = { v: 1, season: -1, year: -1, picks: {}, stats: { fee: {}, first: [], ev: {}, att: {} } };
  const C = S.childhood;
  C.picks = C.picks || {}; C.stats = C.stats || {};
  const st = C.stats; st.fee = st.fee || {}; st.first = st.first || []; st.ev = st.ev || {}; st.att = st.att || {};
  return C;
}
// 魔の芽（生まれつきの魔力の素質）：今の canAcademy の素質判定と同じ考え方。魔法の家の子は芽を持ちやすい
export function magicSeed(sim, p) {
  if (p.kid && p.kid.seed != null) return p.kid.seed;
  const fam = parentsOf(sim, p).some((q) => MAGIC_FAMILY.has(q.job || q.formerJob));
  return h01(p.id * 7 + 3) < 0.12 + (p.pers?.O ?? 0.5) * 0.1 + (fam ? 0.25 : 0);
}
function blankKid() { return { v: 1, xp: {}, hrs: {}, tier: 3, lessons: {}, events: [], fav: null, went: {}, own: {}, cnt: {}, est: false }; }
// p.kid を作る（古いセーブ・生成直後の子は、年齢・家の段階・親の職から、これまでの経験を推定する）
export function ensureKid(sim, p) {
  if (p.kid && p.kid.v) return p.kid;
  ensureGrowth(sim, p);
  const k = p.kid = blankKid();
  k.seed = magicSeed(sim, p);
  const age = sim.ageOf(p);
  k.tier = computeTier(sim, p, age >= 14);
  if (age >= 14) estimateAdult(sim, p, k, age);
  else if (age >= 4) estimateChild(sim, p, k, age);
  return k;
}
function talentMul(p, e, seed) {
  const pot = p.gr?.pot || {};
  const ks = TAL[e] || [];
  let s = 0; for (const x of ks) s += pot[x] ?? 10;
  const v = ks.length ? s / ks.length : 10;
  const t = clamp(0.7 + (v - 10) * 0.06, 0.4, 1.06);
  if (e === 'magic' && !seed) return t * 0.25;
  return t;
}
// 経験をためる（1時間あたり：率 × 0.12 × (1 − xp/110) × 年齢 × 先生 × 才能）
function addXp(p, k, e, hours, rate, teach, age) {
  const ageF = age < 6 ? 0.6 : age < 10 ? 1 : 1.2;
  const x = k.xp[e] || 0;
  const d = rate * 0.12 * hours * Math.max(0, 1 - x / 110) * ageF * (teach || 1) * talentMul(p, e, k.seed);
  k.xp[e] = Math.min(100, x + d);
  return d;
}
// 生成直後・古いセーブの子：年ごとの「よくやったこと」から推定する（乱数は人ごとのハッシュ。世界の乱数を乱さない）
function estimateChild(sim, p, k, age) {
  const par = parentsOf(sim, p);
  const s = sim.townOf(p) || {};
  const pj = par.map((q) => q.job || q.formerJob).filter((j) => j && JOB_EXP[j]);
  const tribal = tribalOf(s);
  const prof = {};
  const put = (e, h) => { prof[e] = (prof[e] || 0) + h; };
  const t = k.tier;
  // 家の段階ごとの一年の過ごし方（時間／年。1年＝40日）
  if (tribal) { put('wild', 50); put('art', 30); put('faith', 25); put('lore', 25); put('aim', age >= 10 ? 30 : 0); put('body', 30); }
  else if (t === 1) { put('body', 55); put('shadow', 28); put('nerve', 22); put('trade', 22); put('care', 18); put('lead', 12); put('letter', 8); }
  else if (t === 2) { put(s.type === 'port' ? 'water' : 'soil', 50); put('wild', 30); put('body', 35); put('letter', 22); put('care', 14); }
  else if (t === 3) { put('letter', 55); put('lore', 25); put('body', 22); put('bu', 15); put('trade', 10); put('care', 10); }
  else if (t === 4) { put('letter', 70); put('trade', 40); put('lore', 45); put('art', 22); put('body', 14); put('court', 10); }
  else { put('court', 65); put('letter', 70); put('lore', 55); put('bu', 38); put('art', 20); put('aim', 15); if (k.seed) put('magic', 30); }
  // 家業の手伝い・親のまね
  if (pj.length) {
    const j = pj[Math.floor(h01(p.id, 11) * pj.length)];
    const [m, sb] = JOB_EXP[j];
    const hv = 40 + h01(p.id, 12) * 45;   // 手伝いの多い家・少ない家
    put(m, hv); put(sb, hv * 0.45);
  }
  // 好きな遊び（性格で選ぶ）
  const favs = [['bu', 0.4 + (p.values?.courage ?? 0.5)], ['art', 0.3 + (p.pers?.E ?? 0.5)], ['wild', 0.3 + (p.pers?.O ?? 0.5)], ['nerve', (p.values?.courage ?? 0.5) * 0.8],
    ['lead', (p.pers?.E ?? 0.5) * 0.7], ['shadow', 0.8 - (p.pers?.A ?? 0.5)], ['aim', 0.5], ['body', 0.5], ['craft', 0.3 + (p.pers?.C ?? 0.5) * 0.4], ['care', (p.pers?.A ?? 0.5) * 0.6]];
  let tot = 0; for (const [, w] of favs) tot += w;
  let u = h01(p.id, 13) * tot, fav = favs[0][0];
  for (const [e, w] of favs) { u -= w; if (u <= 0) { fav = e; break; } }
  put(fav, 30 + h01(p.id, 14) * 25);
  const noise = (e) => 0.7 + h01(p.id, 20 + EXP_KEYS.indexOf(e)) * 0.6;
  for (let y = 4; y < age; y++) {
    const ay = y;
    for (const [e, h] of Object.entries(prof)) {
      if (e === 'letter' && (ay < 6 || t <= 1)) continue;
      if (e === 'magic' && ay < 8) continue;
      for (let q = 0; q < 4; q++) addXp(p, k, e, h * noise(e) / 4, 1, 1.1, ay);
    }
  }
  k.est = true;
  k.fav = FAV_OF[fav] || null;
  if (t >= 3 && age >= 7 && !tribal) k.went[(s.type === 'village' ? 'parish' : t >= 5 ? 'tutor' : 'school')] = Math.round((age - 6) * 60);
  else if (t === 2 && age >= 7 && !tribal) k.went.parish = Math.round((age - 6) * 20);
}
const FAV_OF = { bu: 'chanbara', art: 'song', wild: 'bugs', nerve: 'explore', lead: 'boss', shadow: 'hide', aim: 'stones', body: 'tag', craft: 'mud', care: 'house' };
// 大人（生成直後の世界の大人・古いセーブの大人）：今の職と身分から、子ども時代を逆にたどって推定する
function estimateAdult(sim, p, k, age) {
  const j = p.formerJob || p.job;
  const je = JOB_EXP[j];
  const base = (e, v) => { k.xp[e] = Math.max(k.xp[e] || 0, clamp(v, 0, 100)); };
  if (je) { base(je[0], 38 + h01(p.id, 31) * 30); base(je[1], 20 + h01(p.id, 32) * 22); }
  const fav = EXP_KEYS[Math.floor(h01(p.id, 33) * EXP_KEYS.length)];
  if (fav !== 'magic') base(fav, 18 + h01(p.id, 34) * 25);
  const rank = p.rank;
  if (NOBLE.has(rank)) { base('court', 55); base('letter', 55); base('lore', 35); }
  else if (['citizen', 'knight'].includes(rank)) base('letter', 25 + h01(p.id, 35) * 25);
  else base('letter', h01(p.id, 36) * 18);
  k.fav = FAV_OF[fav] || FAV_OF[je?.[0]] || null;
  k.est = true;
  if (NOBLE.has(rank)) k.went.tutor = 400; else if (rank === 'citizen') k.went.school = 200; else if (k.xp.letter > 10) k.went.parish = 100;
}

// ================================================================ 家の段階（1 困窮・2 貧しい・3 ふつう・4 裕福・5 富裕／貴族）
export const TIER_NAME = ['', '困窮', '貧しい', 'ふつう', '裕福', '富裕・貴族'];
export function computeTier(sim, p, grown = false) {   // grown：大人の生い立ちの推定（今の暮らし向きから）
  const par = grown ? [] : parentsOf(sim, p);
  const s = sim.townOf(p);
  if (NOBLE.has(p.rank) || par.some((q) => NOBLE.has(q.rank))) return 5;
  if (tribalOf(s)) return 2;
  const hh = sim.hh(p);
  if (grown ? p.job === 'beggar' || hh?.almshouse : !par.length || hh?.almshouse || par.every((q) => q.job === 'beggar' || q.jail != null)) return 1;
  const n = Math.max(1, hh?.members?.length || 1);
  const pc = (hh?.money || 0) / n;
  // 1人あたりの蓄えを、世の中の真ん中（中央値 m）と比べる。生成直後の世界で m≈17 のとき、分かれ目は 9・15・29・68 銅貨
  // （下から約1割・4割・8割・95%。物の値段と蓄えが動いても、段階の割合が大きくは崩れないように）
  const m = medianPc(sim);
  let t = pc < m * 0.55 ? 1 : pc < m * 0.9 ? 2 : pc < m * 1.7 ? 3 : pc < m * 4 ? 4 : 5;
  if (t < 4 && par.some((q) => RICH_JOBS.has(q.job) || q.shop != null)) t = Math.max(t, pc >= m * 0.9 ? 4 : 3);   // 親方・商人・医者・騎士の家
  return t;
}
// 子どものいる家の、1人あたりの蓄えの中央値（1日1回数える）
const MED = new WeakMap();
function medianPc(sim) {
  const c = MED.get(sim.S);
  if (c && c.d === sim.today) return c.m;
  const v = [];
  for (const h of Object.values(sim.S.households)) {
    if (!h.members?.length || h.royal || h.almshouse || h.bandits || h.wander) continue;
    if (tribalOf(sim.town(h.s))) continue;
    const nk = h.members.filter((id) => { const q = sim.S.people[id]; return q && q.deathYear == null && sim.ageOf(q) < 14; }).length;
    for (let i = 0; i < nk; i++) v.push((h.money || 0) / h.members.length);   // 子ども1人ずつ数える
  }
  v.sort((a, b) => a - b);
  const m = Math.max(4, v.length ? v[v.length >> 1] : 17);
  MED.set(sim.S, { d: sim.today, m });
  return m;
}
const reserveOf = (hh) => (hh?.members?.length || 1) * 12;   // 食べ物の分として残しておく蓄え
const canPay = (hh, amt) => !!hh && (hh.money || 0) - reserveOf(hh) >= amt;

// ================================================================ お金を動かす（取り引きだけ。払えなければ動かさない）
const W_HH = (sim, q, l = '家計') => { const h = q && sim.hh(q); return h ? { o: h, f: 'money', l } : null; };
const W_HHO = (h, l = '家計') => (h ? { o: h, f: 'money', l } : null);
const W_PURSE = (q, l = '子の財布') => (q ? { o: q, f: 'purse', l } : null);
const W_FUND = (sim, sid) => { const t = sim.S.towns[sid]; return t ? { o: t, f: 'fund', l: '町の蓄え' } : null; };
const W_ALMS = (sim, sid) => { const t = sim.S.towns[sid]; return t ? { o: t, f: 'alms', l: '教会の施し箱' } : null; };
const W_CASH = (sim, sid) => { const t = sim.S.towns[sid]; return t ? { o: t, f: 'cash', l: '市場の金庫' } : null; };
const kingdomOf = (sim, s) => (s ? (sim.S.kingdoms || []).find((k) => k.id === s.kingdom) : null);
const W_TREAS = (sim, s) => { const k = kingdomOf(sim, s); return k ? { o: k, f: 'treasury', l: '国庫' } : null; };
function xfer(sim, from, to, amt, why, kind = 'fee') {
  if (!(amt > 0) || !from || !to) return 0;
  if (from.o === to.o && from.f === to.f) return 0;
  const b0 = from.o[from.f] || 0;
  if (b0 < amt) return 0;
  const c0 = to.o[to.f] || 0;
  from.o[from.f] = b0 - amt;
  to.o[to.f] = c0 + amt;
  flow(sim, from.l, to.l, amt, why);
  const st = childState(sim).stats;
  const r = st.fee[kind + ':' + why] || (st.fee[kind + ':' + why] = { n: 0, paid: 0, recv: 0 });
  r.n++; r.paid += b0 - from.o[from.f]; r.recv += to.o[to.f] - c0;
  return amt;
}

// ================================================================ 町ごとの一日の下調べ（決める処理を軽くする）
const TCACHE = new WeakMap();
function townCtx(sim, sid) {
  let M = TCACHE.get(sim.S);
  if (!M || M.d !== sim.today) { M = { d: sim.today, t: new Map() }; TCACHE.set(sim.S, M); }
  let c = M.t.get(sid);
  if (c) return c;
  c = { jobs: {}, kids: [0, 0, 0], spots: [], troupe: false, stray: h01(sid * 31 + sim.today, 5) < 0.3, rich: [] };
  for (const q of sim.living()) {
    if (q.s !== sid || q.jail != null) continue;
    const a = sim.ageOf(q);
    if (a < 14) { if (a >= 3) c.kids[a < 8 ? 0 : a < 11 ? 1 : 2]++; continue; }
    if (q.job) (c.jobs[q.job] || (c.jobs[q.job] = [])).push(q.id);
    if (q.job === 'troupe') c.troupe = true;   // 旅芸人の一座がこの町に来ている
  }
  for (const h of Object.values(sim.S.households)) if (h.s === sid && !h.royal && !h.almshouse && !h.bandits && h.house != null && (h.money || 0) / Math.max(1, h.members.length) >= 45) c.rich.push(h.id);
  const s = sim.town(sid);
  for (let i = 0; i < 3; i++) { const sp = s && sim.randomNear(s.x, s.z, (s.plaza?.r || 1) + 3 + i * 2, (t) => t !== T.BLD); if (sp) c.spots.push(sp); }
  M.t.set(sid, c);
  return c;
}
const firstOf = (sim, c, jobs, pred) => { for (const j of jobs) for (const id of c.jobs[j] || []) { const q = alive(sim, id); if (q && (!pred || pred(q))) return q; } return null; };
function teacherFor(sim, p, kind) {
  const s = sim.townOf(p), c = townCtx(sim, p.s);
  const cap = sim.capitalOf(p), cc = cap ? townCtx(sim, cap.id) : c;
  switch (kind) {
    case 'abacus': return firstOf(sim, c, ['changer', 'scribe', 'merchant', 'treasurer']);
    case 'tutor': return firstOf(sim, c, ['teacher', 'scribe', 'scholar', 'priest', 'sage', 'nun']);
    case 'magiclesson': return firstOf(sim, c, ['wizard', 'sage', 'alchemist', 'courtmage', 'magister']);
    case 'academy': return s?.type === 'capital' ? firstOf(sim, cc, ['magister', 'courtmage', 'wizard', 'sage']) : null;
    case 'dojo': return cap ? firstOf(sim, cc, ['swordmaster', 'knight', 'general', 'royalguard']) : null;
    case 'ride': return firstOf(sim, c, ['stablehand', 'coachman', 'knight']);
    case 'archery': return firstOf(sim, c, ['hunter', 'archer']);
    case 'music': return firstOf(sim, c, ['musician', 'bard', 'jester']);
    case 'dance': return firstOf(sim, c, ['dancer', 'troupe']);
    case 'etiquette': return firstOf(sim, c, ['butler', 'maid', 'chancellor']);
    case 'page': return firstOf(sim, c, ['knight', 'royalguard', 'general']) || (cap && firstOf(sim, cc, ['knight', 'royalguard']));
    case 'merchantboy': return firstOf(sim, c, ['merchant', 'changer']);
    case 'bowmaker': return firstOf(sim, c, ['carpenter', 'shipwright', 'jeweler']);
    case 'flutemaker': return firstOf(sim, c, ['carpenter', 'jeweler', 'potter']);
    case 'bookseller': return firstOf(sim, c, ['scribe', 'merchant', 'teacher']);
    case 'leather': return firstOf(sim, c, ['cobbler', 'tailor', 'hunter']);
  }
  return null;
}

// ================================================================ 行動の表
// D(キー, 名前（している）, 名詞, 年齢, 場所, 時刻, 季節, 経験, 能力, 動き, 追加)
//   場所：play 遊び場（広場の近くの集まり場所）／near 町の空き地／plaza 広場／home 家／edge 町の外れ（森の縁・草地）／forest 森／wild 野／
//         water 水辺／field 畑／ranch 牧場／dock 船着き場／market 市場／tavern 宿屋／church 教会／school 学校／smithy 鍛冶場／stable 厩舎／
//         parent 親の仕事場／teacher 先生の家／castle 城／mansion 屋敷／barracks 兵舎／guild ギルド／cemetery 墓地／mill 粉ひき小屋／hideout アジト
//   季節：'0123'（春夏秋冬）　追加：grp 相手の子の数、tier 家の段階の範囲、kind（play 遊び／help 手伝い／job 駄賃／bad 悪いこと／learn 学び／tribe 里）
export const KACT = {};
function D(k, n, s, age, w, hrs, se, x, st, an, o = {}) {
  const xp = {};
  for (const t of x.split(' ')) { const m = t.match(/^([a-z]+)([\d.]+)$/); if (m) xp[m[1]] = +m[2]; }
  const [h0, h1] = hrs.split('-').map(Number);
  KACT[k] = { k, n, s, a: age, w, h0, h1, se, xp, st: st ? st.split(' ') : [], an: an.split(' '), kind: 'play', ...o };
}
// ---- 3-A お金がなくてもできる遊び
D('chanbara', '棒きれでチャンバラをしている', 'チャンバラ', [5, 13], 'play', '7.5-19', '0123', 'bu1 lead0.2', 'str agi', 'kid_duel kid_swing', { grp: 1, risk: ['bump', 0.02], mem: ['{f}と棒きれでチャンバラをして、一本取った', '{f}とチャンバラをして、額にこぶを作った', '棒きれを剣に見立てて、騎士のまねをした'] });
D('knightplay', '騎士ごっこをしている', '騎士ごっこ', [5, 12], 'play', '7.5-19', '0123', 'bu0.6 court0.3 lead0.4', 'cha str', 'kid_lead kid_duel', { grp: 2, mem: ['{f}たちと騎士ごっこをして、馬の役をやらされた', '騎士ごっこで、みんなの前で叙任のまねをしてもらった'] });
D('stones', '石を投げて的当てをしている', '石投げ', [5, 13], 'near', '7.5-19', '0123', 'aim1', 'dex', 'kid_throw', { risk: ['window', 0.01], mem: ['石投げで、木の幹に十回続けて当てた', '石投げの的当てで{f}に勝った'] });
D('sling', '投石紐で鳥をねらっている', '投石紐', [8, 13], 'edge', '7-18', '0123', 'aim1.3 nerve0.2', 'dex str', 'kid_throw', { notCap: true, mem: ['投石紐で、はじめて鳥を落とした', '投石紐をぐるぐる回して、石を遠くまで飛ばした'] });
D('tag', '鬼ごっこをしている', '鬼ごっこ', [4, 13], 'play', '7.5-19', '0123', 'body1 lead0.2', 'agi vit', 'play kid_run', { grp: 1, wander: true, mem: ['{f}と日が暮れるまで鬼ごっこをした', '鬼ごっこで、足の速い{f}をやっと捕まえた'] });
D('climb', '木登りをしている', '木登り', [5, 13], 'edge', '7.5-18.5', '012', 'body0.8 wild0.3 nerve0.3', 'agi str', 'kid_climb', { risk: ['fall', 0.005], mem: ['いちばん高い木のてっぺんまで登った', '木の上から町を見下ろした'] });
D('swim', '川で水遊びをしている', '川遊び', [5, 13], 'water', '9-18', '1', 'water1 body0.4', 'vit', 'kid_splash', { risk: ['drown', 0.001], mem: ['夏の川で{f}と水をかけ合った', '川で泳げるようになった'] });
D('ice', '凍った水辺ですべって遊んでいる', '氷すべり', [5, 13], 'water', '9-17', '3', 'body0.5 nerve0.5', 'agi', 'kid_slide', { notSouth: true, risk: ['ice', 0.002], mem: ['凍った川の上をすべって遊んだ'] });
D('snow', '雪合戦をしている', '雪合戦', [4, 13], 'play', '8-17', '3', 'aim0.5 body0.5 lead0.3', 'agi', 'kid_throw', { grp: 1, notSouth: true, mem: ['{f}たちと雪合戦をして、雪だるまを作った'] });
D('bugs', '虫取りをしている', '虫取り', [4, 11], 'edge', '8-18', '01', 'wild1 lore0.2', 'dex', 'kid_net', { risk: ['bee', 0.01], mem: ['草むらで大きなカエルを捕まえた', '虫取りで、見たこともない色のチョウを捕まえた'] });
D('nuts', '木の実を拾っている', '木の実拾い', [5, 12], 'forest', '8-17', '2', 'wild0.8 body0.2', 'agi', 'work:pluck kid_pick', { gain: 'nuts', mem: ['秋の森で、かごいっぱいの木の実を拾った'] });
D('mud', '泥だんごをこねている', '泥だんご', [3, 8], 'near', '8-18', '0123', 'craft0.5', 'dex', 'kid_mud', { mem: ['ぴかぴかの泥だんごを作った'] });
D('wrestle', '取っ組み合いをしている', '取っ組み合い', [6, 13], 'play', '8-19', '0123', 'bu0.5 body0.5 nerve0.3', 'str', 'kid_wrestle', { grp: 1, mem: ['{f}と相撲をとって、投げ飛ばした', '{f}と取っ組み合いをして、泥だらけになった'] });
D('boss', '子どもたちの先頭に立って号令をかけている', 'ガキ大将', [8, 13], 'play', '8-19', '0123', 'lead1 nerve0.3', 'cha', 'kid_lead', { grp: 3, cond: (c) => (c.k.xp.lead || 0) >= 15 || ((c.p.pers?.E ?? 0.5) > 0.6 && (c.p.values?.courage ?? 0.5) > 0.5), mem: ['近所の子どもたちを率いて、秘密の砦を作った', 'ガキ大将として、年下の子たちの面倒を見た'] });
D('house', 'ままごとをしている', 'ままごと', [3, 9], 'near', '8-18', '0123', 'care0.8 lead0.1', 'cha', 'kid_house', { mem: ['{f}とままごとをして、お母さん役をした', '葉っぱのお皿でままごとをした'] });
D('mime', '劇ごっこで大人のまねをしている', '劇ごっこ', [5, 12], 'plaza', '9-18', '0123', 'art0.8 lead0.3', 'cha', 'kid_act', { mem: ['広場で劇ごっこをして、みんなを笑わせた', '旅の一座のまねをして、王様の役をやった'] });
D('song', '歌を歌って遊んでいる', '歌遊び', [3, 10], 'near', '8-19', '0123', 'art0.6', 'cha', 'kid_sing', { mem: ['{f}と手拍子をしながら数え歌を歌った'] });
D('hide', 'かくれんぼをしている', 'かくれんぼ', [4, 11], 'play', '8-19', '0123', 'shadow0.5 body0.3', 'agi', 'kid_hide', { grp: 1, mem: ['かくれんぼで、最後まで誰にも見つからなかった', 'かくれんぼで樽の中に隠れて、そのまま眠ってしまった'] });
D('explore', '探検ごっこをしている', '探検ごっこ', [8, 13], 'edge', '9-17', '012', 'nerve1 wild0.5', 'vit agi', 'work:search kid_peek', { risk: ['lost', 0.01, 'hurt', 0.01, 'monster', 0.003], mem: ['森の縁の廃屋を探検して、古い鍵を見つけた', '洞窟の入り口までこっそり行ってみた'] });
D('dream', '寝ころんで星を眺めている', '星見', [5, 13], 'home', '19-21.5', '0123', 'lore0.3 magic0.2', 'int wis', 'kid_gaze', { mem: ['屋根の上から流れ星を三つ数えた', '星を眺めながら、遠い国のことを考えた'] });
D('pet', '動物をかわいがっている', '動物とのふれあい', [3, 13], 'near', '8-19', '0123', 'care0.3 soil0.5', 'wis', 'kid_pet', { cond: (c) => c.animals, mem: ['子ヤギに名前をつけて、毎日なでた', '迷い犬にパンを分けてやった'] });
D('draw', '棒で地面に絵を描いている', 'お絵かき', [4, 12], 'near', '8-18', '0123', 'art0.5 craft0.3', 'dex', 'kid_draw', { mem: ['地面いっぱいに竜の絵を描いた'] });
D('whittle', '小刀で木を削っている', '木彫り', [8, 13], 'home', '9-19', '0123', 'craft1', 'dex', 'kid_whittle', { cond: (c) => c.knife, risk: ['cut', 0.01], mem: ['小刀で木を削って、小さな馬を彫った', '木を削って笛を作った'] });
D('kidfish', '自分で作った竿で釣りをしている', '子どもの釣り', [7, 13], 'water', '6-18', '012', 'water0.8 wild0.3', 'dex', 'work:fish', { gain: 'fish', mem: ['自分で作った竿で、はじめて魚を釣った'] });
D('flowers', '花を摘んで花輪を作っている', '花摘み', [4, 10], 'edge', '8-17', '01', 'art0.4 wild0.4', 'dex', 'work:pluck kid_pick', { mem: ['花輪を作って、母さんの頭にのせた'] });
D('mimic', '大人の仕事のまねをしている', '仕事のまね', [4, 8], 'home', '8-18', '0123', '', '', 'kid_mimic', { parExp: 0.5, cond: (c) => c.pj.length > 0, mem: ['親の道具をこっそり持ち出して、仕事のまねをした'] });
// ---- 3-B 家の手伝い（お金は動かない）
const H = { kind: 'help' };
D('field', '畑の草取りを手伝っている', '畑の手伝い', [6, 13], 'field', '7-17', '012', 'soil1 body0.5', 'str vit', 'work:weed work:hoe', { ...H, cond: (c) => c.pj.includes('farmer') || (c.hh?.land || 0) > 0, mem: ['畑の草取りを手伝って、腰が痛くなった', '鳥追いで、畑のカラスを追い払った'] });
D('herd', '家畜の番をしている', '羊番', [6, 13], 'ranch', '7-17', '0123', 'soil1 wild0.3 nerve0.2', 'vit', 'work:crook', { ...H, cond: (c) => c.pj.some((j) => ['rancher', 'shepherd'].includes(j)), mem: ['羊の番をしながら、一日じゅう雲を数えた'] });
D('milk', '乳しぼりと卵集めをしている', '乳しぼり', [6, 13], 'ranch', '6-10', '0123', 'soil0.8 care0.2', 'dex', 'kid_milk', { ...H, cond: (c) => c.pj.some((j) => ['rancher', 'shepherd', 'farmer'].includes(j)) && c.s.type !== 'capital', mem: ['はじめて一人で乳しぼりができた'] });
D('fishhelp', '網のつくろいと魚干しを手伝っている', '漁の手伝い', [6, 13], 'dock', '7-17', '0123', 'water1 craft0.3', 'dex vit', 'work:twist kid_mend', { ...H, cond: (c) => c.pj.some((j) => ['fisher', 'diver', 'sailor', 'captain', 'ferryman'].includes(j)), mem: ['網のつくろいを覚えて、父さんにほめられた'] });
D('boathelp', '舟に乗って漁を手伝っている', '舟の手伝い', [10, 13], 'dock', '6-15', '1', 'water1.2 nerve0.3', 'vit agi', 'work:rope', { ...H, cond: (c) => c.pj.some((j) => ['fisher', 'sailor', 'captain'].includes(j)), mem: ['はじめて舟に乗せてもらい、沖まで出た'] });
D('forge', '鍛冶場でふいごを押している', 'ふいご押し', [8, 13], 'smithy', '8-17', '0123', 'craft1 body0.5', 'str vit', 'kid_bellows', { ...H, cond: (c) => c.pj.includes('smith'), risk: ['burn', 0.01], mem: ['鍛冶場でふいごを押して、火花を浴びた'] });
D('shophelp', '工房の掃除と下働きをしている', '工房の手伝い', [7, 13], 'parent', '8-17', '0123', 'craft1', 'dex', 'kid_mimic kid_sweep', { ...H, parExp: 0.4, cond: (c) => c.pj.some((j) => CRAFT_JOBS.has(j)), mem: ['工房の木くずを掃いて、職人たちの手元をじっと見た'] });
D('counter', '店番をしている', '店番', [8, 13], 'market', '8-18', '0123', 'trade1 letter0.2 lead0.2', 'cha', 'work:hawk work:handover', { ...H, cond: (c) => c.pj.some((j) => ['merchant', 'baker', 'butcher', 'peddler', 'changer', 'brewer'].includes(j)), mem: ['一人で店番をして、はじめて品を売った', 'お釣りを間違えて、客に笑われた'] });
D('serve', '宿屋で皿を運んでいる', '宿屋の手伝い', [8, 13], 'tavern', '11-21', '0123', 'care0.6 trade0.4 lead0.3', 'cha vit', 'work:serve', { ...H, cond: (c) => c.pj.includes('innkeeper'), mem: ['宿屋の手伝いで、旅の人から遠い国の話を聞いた'] });
D('babysit', '弟や妹の子守りをしている', '子守り', [7, 13], 'home', '7-19', '0123', 'care1', 'wis', 'work:cheerup kid_babysit', { ...H, cond: (c) => c.babies > 0, mem: ['泣きやまない弟をおぶって、夜まであやした'] });
D('chore', '薪を集めて運んでいる', '薪集め', [8, 13], 'edge', '7-17', '0123', 'body1', 'str vit', 'kid_carry', { ...H, cond: (c) => c.tier <= 3 && (c.sim.today + c.p.id) % 3 === 0, mem: ['冬の前に、薪を山のように集めた'] });
D('cookhelp', '料理を手伝っている', '料理の手伝い', [6, 13], 'home', '10-12.5', '0123', 'care0.8', 'dex', 'work:stir', { ...H, mem: ['はじめて一人でかゆを煮た'] });
D('herbhelp', '薬草摘みを手伝っている', '薬草摘みの手伝い', [7, 13], 'forest', '8-16', '012', 'wild0.6 lore0.4', 'int dex', 'work:pluck work:search', { ...H, cond: (c) => c.pj.some((j) => ['herbalist', 'gatherer', 'midwife', 'doctor', 'alchemist'].includes(j)), mem: ['薬草と毒草の見分け方を教わった'] });
D('traphelp', '罠の見回りについて行っている', '罠の見回り', [9, 13], 'forest', '6-16', '0123', 'wild1 aim0.3 nerve0.3', 'agi dex', 'work:search kid_peek', { ...H, cond: (c) => c.pj.includes('hunter'), risk: ['beast', 0.002], mem: ['罠にかかったウサギを、父さんと持ち帰った'] });
D('woodhelp', '枝払いと薪束ねを手伝っている', '枝払い', [9, 13], 'forest', '7-16', '0123', 'body1 wild0.3', 'str', 'work:chop kid_carry', { ...H, cond: (c) => c.pj.some((j) => ['woodcutter', 'charcoal', 'pioneer'].includes(j)), mem: ['枝払いを手伝って、手にまめができた'] });
D('nurse', '家族の看病をしている', '看病', [6, 13], 'home', '7-21', '0123', 'care1 faith0.3', 'wis', 'kid_nurse', { ...H, cond: (c) => c.sick, mem: ['熱を出した家族の枕元で、一晩じゅう手ぬぐいを替えた'] });
D('gravehelp', '墓掘りを手伝っている', '墓掘りの手伝い', [10, 13], 'cemetery', '8-16', '0123', 'nerve0.5 faith0.3 body0.3', 'vit', 'work:dig', { ...H, cond: (c) => c.pj.includes('gravedigger'), mem: ['墓掘りを手伝って、はじめて人の弔いを間近で見た'] });
D('beehelp', '蜂の巣の世話を手伝っている', '養蜂の手伝い', [8, 13], 'field', '9-16', '012', 'soil0.6 craft0.3 nerve0.3', 'dex', 'kid_bee', { ...H, cond: (c) => c.pj.includes('beekeeper'), risk: ['sting', 0.02], mem: ['蜂を煙でいぶして、はじめて蜜をとった'] });
D('mill', '粉ひきとパンこねを手伝っている', '粉ひきの手伝い', [8, 13], 'mill', '6-15', '0123', 'craft0.6 body0.4', 'str', 'work:knead kid_mud', { ...H, cond: (c) => c.pj.some((j) => ['miller', 'baker'].includes(j)), mem: ['パン生地をこねて、焼きたてを一番に味見した'] });
// ---- 3-C 駄賃をもらう小さな仕事（頼んだ人・雇い主 → 子の財布）
const J1 = { kind: 'job', town: true };
D('errand', '市場の使い走りをしている', '使い走り', [7, 13], 'market', '7-17', '0123', 'trade0.8 body0.3 lead0.3', 'agi cha', 'work:handover kid_run', { ...J1, pay: 1, mem: ['市場の使い走りで、はじめて駄賃をもらった'] });
D('message', '伝言を届けている', '伝言運び', [8, 13], 'plaza', '8-18', '0123', 'body0.6 lead0.3', 'agi', 'work:scroll kid_run', { ...J1, pay: 1, mem: ['伝言を届けて、銅貨を一枚もらった'] });
D('stray', '迷い出た家畜を探している', '迷子の家畜探し', [8, 13], 'wild', '8-17', '0123', 'wild0.8 soil0.3', 'vit', 'work:search', { ...J1, pay: 2, cond: (c) => c.tc.stray && (c.tc.jobs.rancher || c.tc.jobs.shepherd), mem: ['迷い出た羊を見つけて、お礼をもらった'] });
D('hireherd', 'よその家の羊番をしている', 'よその羊番', [9, 13], 'ranch', '7-17', '0123', 'soil1 wild0.3', 'vit', 'work:crook', { ...J1, pay: 2, tier: [1, 2], cond: (c) => c.tc.jobs.rancher || c.tc.jobs.shepherd || c.tc.jobs.farmer, mem: ['よその家の羊番をして、一日二銅貨もらった'] });
D('stable', '馬屋の手伝いをしている', '馬屋の手伝い', [9, 13], 'stable', '7-17', '0123', 'court0.5 soil0.5', 'str', 'kid_stable', { ...J1, pay: 1, cond: (c) => c.tc.jobs.stablehand || c.tc.jobs.innkeeper || c.tc.jobs.coachman, mem: ['馬屋の手伝いで、馬の背に乗せてもらった'] });
D('haul', '荷運びをしている', '荷運び', [10, 13], 'market', '7-17', '0123', 'body1', 'str vit', 'kid_carry', { ...J1, pay: 1, mem: ['大人に交じって荷車を押し、駄賃をもらった'] });
D('chimney', '煙突掃除をしている', '煙突掃除', [7, 12], 'near', '8-16', '3', 'body0.5 nerve0.5 shadow0.2', 'agi', 'kid_chimney', { ...J1, pay: 2, notVil: true, risk: ['soot', 0.005], cond: (c) => c.tc.rich.length > 0, mem: ['煙突掃除で、真っ黒になって家に帰った'] });
D('scavenge', 'くず拾いをしている', 'くず拾い', [6, 13], 'market', '7-17', '0123', 'trade0.3 craft0.3', 'vit', 'work:search kid_pick', { ...J1, pay: 1, cond: (c) => c.tc.jobs.smith || c.tc.jobs.tailor || c.tc.jobs.merchant, mem: ['くず鉄を集めて鍛冶屋に売った'] });
D('choir', '聖歌隊で歌っている', '聖歌隊', [7, 13], 'church', '9-12', '0123', 'faith1 art1 letter0.2', 'wis cha', 'kid_sing', { kind: 'job', town: true, cond: (c) => (c.p.gr?.pot?.cha ?? 10) >= 11 || (c.k.xp.art || 0) >= 25, mem: ['聖歌隊で歌って、司祭さまにほめられた', '聖歌隊の練習のあと、教会でパンをもらった'] });
D('acolyte', '侍者として鐘をついている', '侍者', [8, 13], 'church', '7-12', '0123', 'faith1 letter0.3', 'wis', 'kid_bell pray', { kind: 'job', town: true, mem: ['朝の鐘をつかせてもらった'] });
D('nightwatch', '夜警について明かりを掲げている', '夜警の手伝い', [10, 13], 'plaza', '19-22', '0123', 'nerve0.5 body0.3', 'wis', 'work:lantern', { ...J1, pay: 1, cond: (c) => c.tc.jobs.watchman || c.tc.jobs.keeper || c.tc.jobs.guard, mem: ['夜警について町を回り、明かりを掲げた'] });
D('servant', 'よその家に奉公している', '住み込み奉公', [10, 13], 'rich', '7-18', '0123', 'care1 court0.2', 'vit dex', 'kid_sweep work:serve', { kind: 'job', lesson: 'servant', mem: ['奉公先の奥さまに、行儀を厳しくしつけられた'] });
D('porter', '冒険者の荷物持ちをしている', '荷物持ち', [12, 13], 'guild', '8-17', '0123', 'nerve1 body0.5 wild0.3', 'vit', 'kid_haulpack', { ...J1, pay: 3, cond: (c) => (c.p.values?.courage ?? 0.5) > 0.5 && (c.tc.jobs.adventurer || c.tc.jobs.warrior || c.tc.jobs.archer), risk: ['monster', 0.01], mem: ['冒険者の荷物持ちをして、武勇伝を聞かせてもらった'] });
// ---- 3-D 貧しさゆえのこと・危ないこと・悪いこと
const B = { kind: 'bad', town: true };
D('kidbeg', '物乞いをしている', '物乞い', [4, 13], 'plaza', '8-18', '0123', 'lead0.3 shadow0.2', 'cha', 'beg', { ...B, tier: [1, 1], mem: ['広場で物乞いをして、恥ずかしくて泣いた', '通りがかりの人が銅貨をくれた'] });
D('lookout', 'スリの見張りをしている', 'スリの見張り', [8, 13], 'market', '9-17', '0123', 'shadow1 body0.3', 'agi', 'kid_hide kid_filch', { ...B, cond: (c) => c.bad && (c.tc.jobs.pickpocket || c.tc.jobs.thief), risk: ['caught', 0.03], mem: ['スリの見張りをして、分け前をもらった'] });
D('filch', '市場で食べ物をかすめ取ろうとしている', 'かっぱらい', [7, 13], 'market', '8-18', '0123', 'shadow0.8 nerve0.3', 'agi dex', 'kid_filch', { ...B, cond: (c) => c.p.needs.hunger < 30 && c.tier <= 2, risk: ['caught', 0.08], mem: ['おなかがすいて、市場のパンをかすめ取った'] });
D('brawl', '裏通りでけんかをしている', 'けんか', [9, 13], 'near', '9-19', '0123', 'bu0.5 body0.2 nerve0.5 shadow0.2', 'str', 'kid_wrestle', { ...B, grp: 1, cond: (c) => c.s.type !== 'village' && ((c.p.pers?.A ?? 0.5) < 0.45 || c.tier <= 2), risk: ['hurt', 0.03], mem: ['裏通りで{f}とけんかをして、鼻血を出した'] });
D('dare', '肝だめしに出かけている', '肝だめし', [9, 13], 'dare', '19-21.5', '0123', 'nerve1.5 wild0.5', 'wis', 'kid_peek', { ...B, grp: 1, cond: (c) => (c.p.values?.courage ?? 0.5) > 0.45, risk: ['monster', 0.02], mem: ['夜の墓地で肝だめしをして、一人で奥まで行った', '{f}と肝だめしに行き、物音に驚いて逃げ帰った'] });
D('dice', '骨のさいころで賭け遊びをしている', '賭け遊び', [9, 13], 'near', '10-19', '0123', 'trade0.3 shadow0.3', 'int', 'kid_dice', { ...B, grp: 1, mem: ['{f}とさいころで賭けをして、木の実を巻き上げた'] });
D('poach', '領主の森で密猟を手伝っている', '密猟の手伝い', [10, 13], 'forest', '5-9', '0123', 'wild1 shadow0.5 aim0.3', 'agi', 'kid_peek work:search', { ...B, cond: (c) => c.tier <= 2 && c.pj.includes('hunter'), risk: ['poached', 0.02], gain: 'meat', mem: ['夜明け前の森で、父さんの密猟を手伝った'] });
D('eavesdrop', '酒場の外で大人の話を立ち聞きしている', '立ち聞き', [9, 13], 'tavern', '17-21', '0123', 'lore0.3 shadow0.3 lead0.2', 'int', 'kid_hide', { ...B, outside: true, mem: ['酒場の外で、大人たちのひそひそ話を立ち聞きした'] });
D('banditwatch', '根城の見張り役をしている', '見張り役', [10, 13], 'hideout', '7-19', '0123', 'shadow1 nerve0.5', 'agi', 'work:lookout kid_hide', { ...B, town: false, cond: (c) => c.pj.some((j) => ['thief', 'banditchief', 'pirate', 'smuggler'].includes(j)), mem: ['親の仲間に言われて、根城の見張りに立った'] });
D('toil', '朝から晩まで働かされている', '働きづめ', [8, 13], 'toil', '7-17', '0123', 'body0.5', 'vit', 'kid_toil', { kind: 'job', town: true, tier: [1, 1], pay: 3, toil: true, mem: ['朝から晩まで働いて、稼ぎはぜんぶ家に入れた'] });
// ---- 3-E お金があるからできる学び（家計 → 教える人）
const L = { kind: 'learn', town: true };
D('parish', '教会で手習いをしている', '教会の手習い', [6, 11], 'church', '8-11.5', '0123', 'letter1 faith0.3', 'int', 'kid_read work:write', { ...L, lesson: 'parish', school: true, teach: 1.5, mem: ['教会の手習いで、自分の名前が書けるようになった', '司祭さまに主の祈りを教わった'] });
D('school', '学校で学んでいる', '町の学校', [6, 13], 'school', '8-12', '0123', 'letter1 lore0.6 trade0.3', 'int', 'work:read work:write kid_read', { ...L, lesson: 'school', school: true, teach: 1.5, mem: ['学校で文字の読み書きを習った', '学校で大陸の歴史を教わった', '学校で算術を習って頭が痛くなった', '学校で友だちと先生にいたずらをした'] });
D('abacus', '算術の塾に通っている', '算術の塾', [10, 13], 'teacher', '13-16', '0123', 'trade1 lore0.3', 'int', 'work:coins kid_ledger', { ...L, lesson: 'abacus', teach: 1.5, mem: ['算術の塾で、そろばんの珠をはじく速さを競った'] });
D('tutor', '家庭教師に習っている', '家庭教師', [6, 13], 'home', '9-12', '0123', 'letter1.3 lore1 court0.3', 'int', 'work:read work:write', { ...L, lesson: 'tutor', session: 6, teach: 1.5, mem: ['家庭教師の先生に、古い詩を暗唱させられた'] });
D('read', '本を読んでいる', '読書', [8, 13], 'home', '19-21.5', '0123', 'lore1 letter0.5', 'int', 'work:read', { ...L, cond: (c) => c.k.own.book && (c.k.xp.letter || 0) >= 20, mem: ['買ってもらった本を、夜更けまで読んだ'] });
D('magiclesson', '魔法の手ほどきを受けている', '魔法の手ほどき', [8, 13], 'teacher', '13-16', '0123', 'magic1 lore0.5', 'int wis', 'kid_spell', { ...L, lesson: 'magiclesson', session: 10, teach: 1.5, mem: ['魔法使いに、指先に小さな火をともす方法を教わった'] });
D('ride', '乗馬の稽古をしている', '乗馬', [8, 13], 'stable', '9-16', '0123', 'court1 body0.3', 'agi', 'kid_ride', { ...L, lesson: 'ride', session: 4, risk: ['fallhorse', 0.005], mem: ['はじめて一人でポニーを走らせた'] });
D('archery', '弓の稽古をしている', '弓の稽古', [9, 13], 'edge', '9-16', '0123', 'aim1.2', 'dex', 'work:shoot', { ...L, lesson: 'archery', session: 2, mem: ['子ども用の弓で、的の真ん中を射抜いた'] });
D('music', '楽器の稽古をしている', '楽器の稽古', [7, 13], 'teacher', '13-17', '0123', 'art1.3', 'cha dex', 'kid_flute work:strum', { ...L, lesson: 'music', session: 3, mem: ['笛の稽古で、はじめて一曲吹きとおせた'] });
D('dance', '踊りの稽古をしている', '踊りの稽古', [7, 13], 'teacher', '13-17', '0123', 'art1 body0.3', 'agi cha', 'work:dance', { ...L, lesson: 'dance', session: 3, mem: ['踊りの稽古で、くるりと三回まわれた'] });
D('etiquette', '行儀作法の稽古をしている', '行儀作法', [7, 13], 'castle', '9-15', '0123', 'court1 lead0.5', 'cha', 'kid_bow', { ...L, lesson: 'etiquette', mem: ['行儀作法の稽古で、お辞儀の角度を何度も直された'] });
D('page', '騎士の小姓として仕えている', '騎士の小姓', [7, 13], 'barracks', '8-17', '0123', 'court1 bu0.8 care0.3', 'str cha', 'kid_pageboy kid_bow kid_swing', { ...L, lesson: 'page', teach: 1.7, mem: ['騎士さまの盾を磨いて、馬の世話をした', '小姓として、騎士さまの食卓で給仕をした'] });
D('merchantboy', '商家の見習いをしている', '商家の見習い', [11, 13], 'market', '8-17', '0123', 'trade1.5 letter0.5', 'int cha', 'work:coins work:hawk kid_ledger', { ...L, lesson: 'merchantboy', teach: 1.7, mem: ['商家の見習いで、帳面のつけ方を教わった'] });
D('indenture', '親方のもとで弟子入り前の修業をしている', '弟子入り', [12, 13], 'master', '8-17', '0123', 'craft1.5', 'dex str', 'kid_mimic', { ...L, lesson: 'indenture', teach: 1.7, masterExp: true, mem: ['親方の仕事を見て、道具の名前をぜんぶ覚えた'] });
D('cloister', '修道院で祈りと写本を学んでいる', '修道院', [7, 13], 'church', '7-17', '0123', 'faith1.5 letter1 lore0.5', 'wis int', 'pray work:write', { ...L, lesson: 'cloister', teach: 1.7, mem: ['修道院で、写本の一字一字をていねいに写した'] });
D('abroad', '他国の学園に留学している', '留学', [13, 17], 'abroad', '9-16', '0123', 'lore2 magic1', 'int', 'work:read kid_spell', { ...L, lesson: 'abroad', teach: 1.7, mem: ['留学先の学園で、見たこともない魔導書を読んだ'] });
D('hawking', '狩りのお供をしている', '狩りのお供', [9, 13], 'wild', '8-15', '0123', 'wild1 court0.5 aim0.5', 'agi', 'work:search work:shoot', { kind: 'play', town: true, tier: [5, 5], cond: (c) => (c.sim.today + c.p.id) % 4 === 0, mem: ['狩りのお供で、鷹が獲物を捕らえるのを見た'] });
D('caravan', '商隊について旅をしている', '商隊の旅', [11, 13], 'caravan', '6-18', '0123', 'trade1 wild0.5 nerve0.3', 'vit', 'kid_haulpack', { ...L, cond: (c) => c.caravanPar, mem: ['商隊について隣の町まで旅をした'] });
// ---- 3-F 民族の里
const R = { kind: 'tribe', tribe: true };
D('spiritdance', '精霊の舞を踊っている', '精霊の舞', [5, 13], 'plaza', '9-19', '0123', 'art1 faith0.8', 'agi cha', 'work:dance', { ...R, mem: ['祭りの前に、精霊の舞を習った'] });
D('spearhunt', '投げ槍の稽古をしている', '投げ槍の稽古', [10, 13], 'edge', '8-17', '0123', 'aim1 bu0.6 wild0.5', 'str dex', 'kid_throw', { ...R, mem: ['投げ槍で、はじめて獲物を仕留めた'] });
D('eldertale', '長老の昔語りを聞いている', '長老の昔語り', [5, 13], 'plaza', '19-21.5', '0123', 'lore0.8 faith0.3', 'int', 'kid_listen', { ...R, mem: ['焚き火の前で、長老から里の始まりの話を聞いた'] });
D('ritual', '儀式の供をしている', '儀式の供', [10, 13], 'plaza', '9-15', '0123', 'nerve1 faith1', 'wis', 'pray', { ...R, cond: (c) => (c.sim.today + c.s.id) % 10 === 0, mem: ['里の儀式で、はじめて供え物を運ぶ役をつとめた'] });
D('herbrite', '薬草と毒草の見分けを習っている', '薬草の見分け', [7, 13], 'forest', '8-16', '012', 'wild1 lore0.3', 'int', 'work:pluck', { ...R, mem: ['里の森で、薬草と毒草の見分けを教わった'] });
// 既存の行動の型 → 経験（本体の行動もそのまま経験になる）
const TYPE_XP = {
  help: { parExp: 1, teach: 1.2 }, academy: { xp: { magic: 1.5, lore: 1 }, teach: 1.7, went: 'academy' }, dojo: { xp: { bu: 1.5, body: 0.5, nerve: 0.3 }, teach: 1.5, went: 'dojo' },
  lesson: { xp: { bu: 1.2, body: 0.4 }, teach: 1.5 }, water: { xp: { body: 1 } }, childcare: { xp: { care: 1 } }, cook: { xp: { care: 0.8 } }, laundry: { xp: { care: 0.3, body: 0.5 } },
  pray: { xp: { faith: 0.3 } }, plaza: { xp: { lead: 0.2 } }, festival: { xp: { art: 0.5, lead: 0.2 } }, beg: { xp: { lead: 0.3, shadow: 0.2 } }, steal: { xp: { shadow: 1, nerve: 0.3 } },
  storytell: { xp: { lore: 0.3 } }, school: { xp: { letter: 1, faith: 0.2 }, teach: 1.3, went: 'parish' }, play: { xp: { body: 0.6 } }, stroll: { xp: { body: 0.3, wild: 0.1 } },
};

// ================================================================ 場所
function actPlace(sim, p, K, c) {
  const s = c.s, R = sim.rng;
  switch (K.w) {
    case 'play': { const sp = c.tc.spots; return sp.length ? { ...sp[(h01(K.k.length * 13 + (c.sim.today % 7), p.s) * sp.length) | 0] } : sim.placeFor(p, 'plaza'); }
    case 'near': return sim.randomNear(s.x, s.z, Math.max(3, s.r - 1), (t) => t !== T.BLD) || sim.placeFor(p, 'plaza');
    case 'edge': {
      if (s.type === 'capital' && K.k !== 'archery' && K.k !== 'spearhunt') return sim.randomNear(s.x, s.z, Math.max(3, s.r - 1), (t) => t !== T.BLD) || sim.placeFor(p, 'plaza');
      return sim.randomNear(s.x, s.z, s.r + 5, (t, x, z) => (t === T.GRASS || t === T.FOREST || t === T.SAVANNA || t === T.PLAZA || t === T.ROAD) && Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) >= s.r - 2 && !tooDangerous(sim, p, x, z));
    }
    case 'forest': { const f = sim.placeFor(p, 'forest'); return f && Math.hypot(f.x - s.x, f.z - s.z) < s.r + 14 ? f : null; }
    case 'wild': { const f = sim.placeFor(p, 'wild'); return f && Math.hypot(f.x - s.x, f.z - s.z) < s.r + 16 ? f : null; }
    case 'water': { const f = sim.placeFor(p, 'shore'); if (!f || Math.hypot(f.x - s.x, f.z - s.z) > s.r + 10) return null; const t = tileAt(sim.S.world, f.x, f.z); return t === T.SEA || t === T.RIVER ? null : f; }
    case 'dock': return s.dock ? sim.placeFor(p, 'dock') : null;
    case 'field': case 'ranch': case 'market': case 'tavern': case 'church': case 'school': case 'smithy': case 'stable': case 'castle': case 'barracks': case 'guild': case 'mill': case 'plaza': {
      let kind = K.w;
      if (kind === 'castle' && !sim.townBuilding(s, 'castle')) kind = 'mansion';
      if (kind === 'barracks' && s.type !== 'capital') return null;
      if (kind === 'school' && !sim.townBuilding(s, 'school')) return null;
      if (kind === 'guild' && !sim.townBuilding(s, 'guild')) return null;
      if (kind === 'smithy' && !sim.townBuilding(s, 'smithy')) return null;
      const pl = sim.placeFor(p, kind);
      if (K.outside && pl) return sim.randomNear(pl.x, pl.z, 2, (t) => t !== T.BLD) || { x: pl.x, z: pl.z };
      return pl;
    }
    case 'cemetery': { const b = sim.townBuilding(s, 'cemetery') || sim.townBuilding(s, 'church'); return b ? { x: b.door.x, z: b.door.z, bld: null } : null; }
    case 'dare': { const b = sim.townBuilding(s, 'cemetery'); if (b) return { x: b.door.x, z: b.door.z, bld: null }; return sim.randomNear(s.x, s.z, s.r + 4, (t, x, z) => (t === T.FOREST || t === T.GRASS) && Math.max(Math.abs(x - s.x), Math.abs(z - s.z)) >= s.r - 1 && !tooDangerous(sim, p, x, z)); }
    case 'home': return sim.placeFor(p, 'home');
    case 'hideout': return p.hideout != null || c.par.some((q) => q.hideout != null) ? sim.placeFor(c.par.find((q) => q.hideout != null) || p, 'hideout') : null;
    case 'parent': {
      const q = c.par.find((x) => CRAFT_JOBS.has(x.job));
      if (!q) return null;
      const a = q.action;
      if (a && a.type === 'work' && a.phase === 'do' && a.tx != null && q.s === p.s) return { x: a.tx, z: a.tz, bld: a.bld ?? null };
      return sim.placeFor(q, JOBS[q.job]?.place || 'workshop');
    }
    case 'master': { const m = alive(sim, c.k.lessons.indenture?.m); if (!m) return null; const a = m.action; if (a && a.type === 'work' && a.phase === 'do' && a.tx != null) return { x: a.tx, z: a.tz, bld: a.bld ?? null }; return sim.placeFor(m, JOBS[m.job]?.place || 'workshop'); }
    case 'teacher': { const t = alive(sim, c.k.lessons[K.lesson]?.t) || teacherFor(sim, p, K.lesson); return t ? sim.placeFor(t, 'home') : null; }
    case 'rich': { const h = sim.S.households[c.k.lessons.servant?.h]; const b = h && h.house != null ? sim.building(h.house) : null; return b ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : null; }
    case 'toil': { const e = c.k.lessons.toil ? alive(sim, c.k.lessons.toil.e) : null; if (e) return sim.placeFor(e, JOBS[e.job]?.place || 'field'); return sim.placeFor(p, s.type === 'port' ? 'dock' : 'field'); }
    case 'caravan': { const q = c.caravanPar; const a = q?.action; return a && a.tx != null ? { x: a.tx, z: a.tz } : null; }
    case 'abroad': { const t = alive(sim, c.k.lessons.abroad?.t); if (!t) return null; const b = sim.townBuilding(sim.town(t.s), 'academy') || sim.townBuilding(sim.town(t.s), 'magictower'); return b ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : null; }
  }
  return null;
}

// ================================================================ 決める（decide）
function kidCtx(sim, p, k, age) {
  const s = sim.townOf(p);
  const par = parentsOf(sim, p);
  const pj = par.map((q) => q.job).filter(Boolean);
  const hh = sim.hh(p);
  const tc = townCtx(sim, p.s);
  const tribal = tribalOf(s);
  const c = { sim, p, k, age, s, par, pj, hh, tc, tier: k.tier, tribal, h: sim.hour(), season: sim.seasonIdx(), rest: restDayFor(sim, p) };
  c.animals = s.type !== 'capital' || pj.some((j) => ['rancher', 'shepherd', 'stablehand', 'hunter', 'coachman'].includes(j)) || h01(p.id, 41) < 0.3;
  c.knife = pj.some((j) => CRAFT_JOBS.has(j) || ['hunter', 'woodcutter', 'fisher', 'carpenter'].includes(j)) || h01(p.id, 42) < 0.5;
  c.babies = 0; c.sick = false;
  for (const id of hh?.members || []) { const q = alive(sim, id); if (!q || q === p) continue; if (sim.ageOf(q) < 5) c.babies++; if ((q.ail && q.ail.sev >= 15) || q.action?.type === 'sickbed') c.sick = true; }
  c.bad = c.tier <= 1 || pj.some((j) => BAD_JOBS.has(j)) || Object.entries(p.rel || {}).some(([id, r]) => r.a > 30 && BAD_JOBS.has(sim.S.people[id]?.job));
  const trader = par.find((q) => ['merchant', 'peddler'].includes(q.job) && q.action && ['trade', 'peddle', 'travel'].includes(q.action.type) && q.action.phase === 'walk');
  c.caravanPar = trader || null;
  c.south = !!(s && sim.S.kingdoms?.find((x) => x.id === s.kingdom)?.south) || s.name?.includes('オアシス');
  return c;
}
function eligible(c, K) {
  const { age, h, season, s, tier } = c;
  if (age < K.a[0] || age > K.a[1]) return false;
  if (h < K.h0 || h >= K.h1) return false;
  if (!K.se.includes(String(season))) return false;
  if (K.tribe ? !c.tribal : c.tribal && K.kind !== 'play') return false;
  if (K.town && c.tribal) return false;
  if (K.notCap && s.type === 'capital') return false;
  if (K.notVil && s.type === 'village') return false;
  if (K.notSouth && c.south) return false;
  if (K.tier && (tier < K.tier[0] || tier > K.tier[1])) return false;
  if (K.lesson && !activeLesson(c.sim, c.p, c.k, K.lesson)) return false;
  if (K.school && c.rest) return false;
  if (K.cond && !K.cond(c)) return false;
  return true;
}
export function activeLesson(sim, p, k, name) {
  const L = k.lessons[name];
  if (!L) return false;
  if (L.until != null && L.until < sim.today) return false;
  if (name === 'tutor' && (p.id + sim.today) % 3 === 0) return false;       // 家庭教師は週に2〜3回
  if (['magiclesson', 'music', 'dance', 'ride', 'archery'].includes(name) && (p.id + sim.today + name.length) % 2 === 0) return false;   // 1日おき
  return true;
}
const INDOOR = new Set(['home', 'church', 'school', 'tavern', 'teacher', 'castle', 'barracks', 'smithy', 'mill', 'rich', 'abroad', 'master', 'parent']);
const SCHOOLING = new Set(['parish', 'school', 'tutor', 'cloister', 'page', 'merchantboy', 'indenture', 'servant', 'etiquette']);
function scoreOf(c, K) {
  const { p, k, h } = c, n = p.needs;
  const pers = p.pers || {}, vals = p.values || {};
  const main = Object.keys(K.xp)[0];
  const interest = main ? (k.xp[main] || 0) / 45 : 0.3;
  const fav = k.fav === K.k ? 0.8 : 0;
  switch (K.kind) {
    case 'learn': return (SCHOOLING.has(K.lesson) ? 6 : 5) + (pers.C ?? 0.5) * 2 + interest * 0.5;
    case 'help': return 3.2 + (pers.C ?? 0.5) * 2 + (c.par.some((q) => q.action?.type === 'work' && q.action.phase === 'do') ? 0.8 : 0) + interest * 0.4 + (c.tier <= 2 ? 0.6 : 0);
    case 'job': return (K.toil ? 5.5 : 2.6) + (c.tier <= 2 ? 1.6 : c.tier === 3 ? 0.3 : -1.2) + (vals.ambition ?? 0.5) + (K.lesson ? 4 : 0) + interest * 0.3 + (c.tier <= 1 && h < 12 ? 1.5 : 0);
    case 'bad': return 2.2 + (c.tier <= 1 ? 1.2 : 0) + (1 - (pers.A ?? 0.5)) * 1.2 + (K.k === 'filch' ? (30 - n.hunger) / 8 : 0) + (K.k === 'kidbeg' ? (40 - n.hunger) / 15 : 0) + interest * 0.3;
    case 'tribe': return 3.6 + (100 - n.pleasure) / 30 + interest * 0.5;
    default: return 3.1 + (100 - n.pleasure) / 25 + interest * 0.6 + fav + (h >= 15 ? 0.6 : 0) - (c.schoolNow ? 2.5 : 0);
  }
}
export function childOptions(sim, p, cands, add) {
  const age = sim.ageOf(p);
  if (age >= 18 || p.jail != null) return;
  const k = ensureKid(sim, p);
  // お金を払っていない子は、魔法学園・道場に通えない（奨学・拾い上げの子は払わなくてよい）。子どもの日曜学校は教会の手習いに置き換える
  for (let i = cands.length - 1; i >= 0; i--) {
    const t = cands[i].type;
    if ((t === 'academy' || t === 'dojo') && !activeLesson(sim, p, k, t)) cands.splice(i, 1);
    else if (t === 'school' && age < 14) cands.splice(i, 1);
  }
  if (age >= 14) {
    if (k.lessons.abroad && activeLesson(sim, p, k, 'abroad') && age <= 17) {
      const c = kidCtx(sim, p, k, age);
      const K = KACT.abroad;
      if (eligible(c, K)) { const pl = actPlace(sim, p, K, c); if (pl) add(scoreOf(c, K), 'kid', pl, 240, { k: 'abroad' }); }
    }
    return;
  }
  if (age < 3) return;
  const c = kidCtx(sim, p, k, age);
  c.schoolNow = !c.rest && c.h >= 8 && c.h < 12 && Object.keys(k.lessons).some((x) => SCHOOLING.has(x) && activeLesson(sim, p, k, x));
  const R = sim.rng;
  const el = [];
  for (const K of Object.values(KACT)) if (eligible(c, K)) el.push(K);
  if (!el.length) return;
  // 学び舎と習い事は必ず候補に入れる。ほかは重みつきで5つまで
  const must = el.filter((K) => K.kind === 'learn');
  const rest = el.filter((K) => K.kind !== 'learn');
  const pick = [...must];
  for (let i = 0; i < 5 && rest.length; i++) {
    let tot = 0; const w = rest.map((K) => { const v = Math.max(0.05, 1 + (k.xp[Object.keys(K.xp)[0]] || 0) / 30 + (k.fav === K.k ? 1.5 : 0) + (K.kind === 'help' ? 0.8 : 0)); tot += v; return v; });
    let u = R.next() * tot, j = 0;
    for (; j < rest.length - 1; j++) { u -= w[j]; if (u <= 0) break; }
    pick.push(rest[j]); rest.splice(j, 1);
  }
  let wm = null; try { wm = weatherMood(sim, p); } catch (e) { wm = null; }
  const bad = wm?.bad || 0;
  for (const K of pick) {
    if (K.grp) { const g = c.tc.kids[age < 8 ? 0 : age < 11 ? 1 : 2] + (c.tc.kids[1] >> 1); if (g - 1 < K.grp) continue; }
    const pl = actPlace(sim, p, K, c);
    if (!pl) continue;
    let dur = K.kind === 'learn' ? R.int(100, 180) : K.kind === 'help' ? R.int(60, 120) : K.toil ? R.int(180, 260) : K.kind === 'job' ? R.int(45, 100) : R.int(35, 90);
    const extra = { k: K.k };
    if (K.school) { extra.untilHour = K.h1; }
    const outdoor = !INDOOR.has(K.w) && !pl.bld;
    add(scoreOf(c, K) - (outdoor ? bad * 1.5 : 0), 'kid', pl, dur, extra);   // 雨や雪の日は外で遊ばない
  }
}

// ================================================================ している間（doAction）
export function kidActText(sim, p, a, short) {
  const K = KACT[a.k];
  if (!K) return short ? '遊んでいる' : '遊んでいる';
  if (a.phase === 'walk') return short ? '移動中' : `${K.s}に向かっている`;
  return short ? K.s.slice(0, 10) : K.n;
}
function remember(sim, p, txt, opt = {}) { sim.remember(p, txt, { k: 'kid', ...opt }); }
function mates(sim, p, a) {
  const out = [];
  for (const q of sim.nearby(p, 4)) if (q !== p && q.action?.type === 'kid' && q.action.k === a.k && sim.ageOf(q) < 14) out.push(q);
  return out;
}
function memText(K, f) {
  const m = K.mem || [`${K.s}をした`];
  return m;
}
export function childDo(sim, p, dt) {
  const a = p.action;
  if (!a || a.type !== 'kid' || a.phase !== 'do') return;
  const K = KACT[a.k];
  if (!K) { a.until = sim.S.t; return; }
  const k = ensureKid(sim, p), n = p.needs, hr = dt / 60, S = sim.S;
  if (!a.kin) { a.kin = 1; if (!startKid(sim, p, a, K, k)) { a.until = S.t; return; } }
  // 欲求：遊べば楽しい、学べば気が張る、働けば疲れる
  if (K.kind === 'play' || K.kind === 'tribe') n.pleasure += 24 * hr;
  else if (K.kind === 'learn') { n.pleasure += 4 * hr; n.esteem += 2 * hr; n.sloth -= 3 * hr; }
  else if (K.kind === 'help') { n.esteem += 3 * hr; n.pleasure += 2 * hr; n.sloth -= 3 * hr; }
  else if (K.kind === 'job') { n.esteem += 2 * hr; n.sloth -= 5 * hr; }
  else if (K.kind === 'bad') { n.pleasure += 10 * hr; }
  if (a.k === 'kidbeg') n.esteem -= 3 * hr;
  // 鬼ごっこ・探検は少しずつ動き回る
  if (K.wander && !p.inside && sim.rng.chance(0.03 * dt) && sim.pathBudget > 0) {
    const nx = Math.round(p.pos.x) + sim.rng.int(-3, 3), nz = Math.round(p.pos.z) + sim.rng.int(-3, 3);
    const t = tileAt(S.world, nx, nz);
    if (t !== T.BLD && t !== T.SEA && t !== T.RIVER) { sim.pathBudget--; const path = findPath(S.world, Math.round(p.pos.x), Math.round(p.pos.z), nx, nz, 200); if (path && path.length < 8) { p.path = path; a.phase = 'walk'; a.wander = true; return; } }
  }
  if (!a.kmid && S.t >= (a.until - (a.dur || 60) * 0.4)) { a.kmid = 1; midKid(sim, p, a, K, k); }
  if (!a.kend && S.t + dt >= a.until) { a.kend = 1; endKid(sim, p, a, K, k); }
}
// 始めるとき：1回ごとの礼金を払う（払えなければやめる）・危険の判定
function startKid(sim, p, a, K, k) {
  const hh = sim.hh(p);
  if (K.session) {
    const L = k.lessons[K.lesson];
    if (!L) return false;
    if (!L.free) {
      const t = alive(sim, L.t) || teacherFor(sim, p, K.lesson);
      if (!t || sim.hh(t) === hh) { if (!t) return false; }
      else {
        if (!canPay(hh, K.session)) { endLesson(sim, p, k, K.lesson, 'money'); return false; }
        xfer(sim, W_HHO(hh), W_HH(sim, t, '先生の家計'), K.session, K.s);
        L.t = t.id;
      }
    }
    k.cnt[K.lesson] = (k.cnt[K.lesson] || 0) + 1;
  }
  if (K.risk) {
    for (let i = 0; i < K.risk.length; i += 2) if (sim.rng.chance(K.risk[i + 1])) { hazard(sim, p, K.risk[i], K, k); break; }
  }
  return true;
}
// 半ばを過ぎたとき：駄賃・品
function midKid(sim, p, a, K, k) {
  const s = sim.townOf(p), tc = townCtx(sim, p.s), R = sim.rng;
  if (K.pay) {
    let payer = null, src = null;
    const pickJobs = { errand: ['merchant', 'baker', 'butcher', 'innkeeper', 'changer', 'brewer'], message: ['merchant', 'scribe', 'innkeeper', 'priest', 'elder', 'changer'], stray: ['rancher', 'shepherd'], hireherd: ['rancher', 'shepherd', 'farmer'],
      stable: ['stablehand', 'innkeeper', 'coachman'], haul: ['merchant', 'peddler', 'captain', 'miller'], scavenge: ['smith', 'tailor', 'merchant'], nightwatch: ['watchman', 'keeper', 'guard'],
      porter: ['adventurer', 'warrior', 'archer', 'cleric', 'sage'], toil: ['farmer', 'fisher', 'weaver', 'tailor', 'potter', 'miller', 'smith', 'carpenter'] }[K.k] || [];
    const hh = sim.hh(p);
    const cand = [];
    for (const j of pickJobs) for (const id of tc.jobs[j] || []) { const q = alive(sim, id); if (q && sim.hh(q) !== hh) cand.push(q); }
    if (K.k === 'toil' && k.lessons.toil) { const e = alive(sim, k.lessons.toil.e); if (e) cand.unshift(e); }
    if (K.k === 'chimney') for (const hid of tc.rich) { const h = sim.S.households[hid]; if (h && h !== hh && h.money > 30) { src = W_HHO(h, '頼んだ家の家計'); break; } }
    if (!src && cand.length) {
      payer = K.k === 'toil' ? cand[0] : cand[(R.next() * cand.length) | 0];
      // 財布から払う（使い走り・荷物持ち）か、家計から払う（雇い主）
      if (['errand', 'message', 'porter'].includes(K.k) && (payer.purse || 0) >= K.pay) src = W_PURSE(payer, '頼んだ人の財布');
      else { const ph = sim.hh(payer); if (ph && ph.money >= K.pay + 10) src = W_HHO(ph, K.k === 'scavenge' ? 'くず買いの家計' : '雇い主の家計'); }
    }
    if (src) {
      const why = K.k === 'toil' ? '子どもの日銭' : '子どもの駄賃';
      const got = xfer(sim, src, W_PURSE(p), K.pay, `${why}（${K.s}）`, 'wage');
      if (got) {
        k.earned = (k.earned || 0) + got;
        if (payer && K.k === 'errand') { const m = k.cnt.errBy || (k.cnt.errBy = {}); m[payer.id] = (m[payer.id] || 0) + 1; }
        if (K.k === 'toil' && payer) k.lessons.toil = { e: payer.id };
        if (K.k === 'toil' && p.gr?.pot) { k.stunt = (k.stunt || 0); if (k.stunt < 0.3) { k.stunt += 0.02; p.gr.pot.vit = Math.max(5, p.gr.pot.vit - 0.02); } }   // 働きづめの子は体が育ちにくい
      }
    }
  }
  if (K.k === 'kidbeg') {
    const giver = sim.nearby(p, 5).find((q) => q !== p && sim.ageOf(q) >= 16 && (q.pers?.A ?? 0.5) > 0.55 && (q.purse || 0) > 5 && sim.hh(q) !== sim.hh(p));
    if (giver) xfer(sim, W_PURSE(giver, '通りがかりの人の財布'), W_PURSE(p), 1, '子どもへの施し', 'alms');
  }
  if (K.k === 'lookout') {
    const boss = firstOf(sim, tc, ['pickpocket', 'thief'], (q) => (q.purse || 0) >= 3);
    if (boss) xfer(sim, W_PURSE(boss, 'スリの財布'), W_PURSE(p), R.int(1, 3), 'スリの分け前', 'bad');
  }
  if (K.k === 'dice') {
    const m = mates(sim, p, a).find((q) => (q.purse || 0) >= 1);
    if (m && (p.purse || 0) >= 1) { if (R.chance(0.5)) xfer(sim, W_PURSE(m), W_PURSE(p), 1, '子どもの賭け', 'bad'); else xfer(sim, W_PURSE(p), W_PURSE(m), 1, '子どもの賭け', 'bad'); }
  }
  if (K.k === 'filch' && s) {
    const mk = sim.market(p.s);
    if (mk?.stock && (mk.stock.bread || 0) >= 1) { mk.stock.bread -= 1; const hh = sim.hh(p); if (hh) hh.food = (hh.food || 0) + 1; else p.needs.hunger = Math.min(100, p.needs.hunger + 25); k.cnt.filch = (k.cnt.filch || 0) + 1; }
  }
  if (K.k === 'eavesdrop') {
    const talker = sim.nearby(p, 6).find((q) => sim.ageOf(q) >= 16 && q.memories?.some((m) => m.g && sim.today - m.t < 5));
    const m = talker && talker.memories.slice().reverse().find((x) => x.g && sim.today - x.t < 5 && !(p.gk && p.gk[x.g.key]));
    const subj = m && sim.S.people[m.g.subj];
    if (m && subj && subj.id !== p.id) { sim.remember(p, `${subj.given}が${m.g.pred}`, { emo: m.g.emo * 0.5, imp: 0.4, about: [subj.id], k: 'news', g: m.g }); if (p.gk) p.gk[m.g.key] = 1; }
  }
  if (K.gain) {
    const hh = sim.hh(p);
    if (hh && R.chance(0.5)) { hh.food = (hh.food || 0) + 0.5; k.cnt.gain = (k.cnt.gain || 0) + 1; }
  }
  if (K.k === 'sling' && !k.own.sling) {
    const par = parentsOf(sim, p);
    if (par.some((q) => ['hunter', 'shepherd', 'cobbler', 'rancher'].includes(q.job))) k.own.sling = 1;
    else { const t = teacherFor(sim, p, 'leather'); if (t && (p.purse || 0) >= 1 && xfer(sim, W_PURSE(p), W_HH(sim, t, '革職人の家計'), 1, '投石紐の革ひも', 'buy')) k.own.sling = 1; }
  }
}
// 終わるとき：思い出・出来事
function endKid(sim, p, a, K, k) {
  const R = sim.rng;
  const mm = mates(sim, p, a);
  const f = mm.length ? mm[(R.next() * mm.length) | 0] : null;
  const chance = K.kind === 'learn' ? 0.06 : K.kind === 'play' ? 0.07 : 0.08;
  if (R.chance(chance)) {
    const ms = memText(K);
    let t = ms[(R.next() * ms.length) | 0];
    if (t.includes('{f}')) t = f ? t.replace('{f}', f.given) : t.replace(/\{f\}(たち)?と/, '').replace('{f}', 'あの子');
    const sad = /こぶ|泣|痛|叱|恥|まめ|泥だらけ|鼻血|笑われ/.test(t);
    remember(sim, p, t, { emo: sad ? -0.15 : K.kind === 'bad' ? 0.1 : 0.45, imp: 0.42 + (k.fav === K.k ? 0.08 : 0), about: f ? [f.id] : [], k: f ? 'friend' : 'kid' });
  }
  if (f && (K.kind === 'play' || K.kind === 'tribe')) { const r = sim.relMut(p, f); r.a = Math.min(100, r.a + 1); r.f = Math.min(100, (r.f || 0) + 1.5); }
  if (a.k === 'dream' || a.k === 'dare') k.cnt.awe = sim.today;   // 魔力の目覚めのきっかけ
  if (a.k === 'mime' && k.events.includes('E4')) addXp(p, k, 'art', 0.5, 0.8, 1, sim.ageOf(p));
}
// 危険
function hazard(sim, p, kind, K, k) {
  const R = sim.rng, st = childState(sim).stats;
  st.ev['危険:' + kind] = (st.ev['危険:' + kind] || 0) + 1;
  const hurt = (f) => { p.hp = Math.max(Math.ceil(p.maxhp * 0.3), p.hp - Math.round(p.maxhp * f)); };
  const hh = sim.hh(p), s = sim.townOf(p);
  switch (kind) {
    case 'bump': hurt(0.05); if (R.chance(0.3)) remember(sim, p, 'チャンバラで棒が当たって、おでこにこぶを作った', { emo: -0.2, imp: 0.35 }); break;
    case 'window': {   // 窓を割る：家計 → 被害の家（1銅貨）
      const tc = townCtx(sim, p.s);
      const vid = tc.rich.find((id) => id !== hh?.id) ?? Object.values(sim.S.households).find((h) => h.s === p.s && h !== hh && h.house != null)?.id;
      const vh = sim.S.households[vid];
      if (vh && hh && hh.money >= 1) xfer(sim, W_HHO(hh), W_HHO(vh, '被害の家の家計'), 1, '割った窓の弁償', 'fine');
      remember(sim, p, '石投げで窓を割ってしまい、親に叱られた', { emo: -0.4, imp: 0.5 });
      break;
    }
    case 'fall': hurt(0.4); remember(sim, p, '木から落ちて腕の骨を折った', { emo: -0.6, imp: 0.75 }); addEvent(sim, p, k, 'fall'); break;
    case 'fallhorse': hurt(0.2); remember(sim, p, 'ポニーから落ちて、しばらく馬が怖かった', { emo: -0.4, imp: 0.55 }); break;
    case 'drown': case 'ice': {
      const adult = sim.nearby(p, 6).find((q) => sim.ageOf(q) >= 16);
      hurt(0.25); p.needs.survival = Math.max(0, p.needs.survival - 40);
      remember(sim, p, kind === 'ice' ? '氷が割れて冷たい川に落ち、震えながら家に帰った' : adult ? `川で溺れかけて、${adult.given}に引き上げてもらった` : '川で溺れかけて、必死で岸にしがみついた', { emo: -0.7, imp: 0.8, about: adult ? [adult.id] : [] });
      addXp(p, k, 'nerve', 3, 1, 1, sim.ageOf(p)); k.cnt.awe = sim.today;
      break;
    }
    case 'lost': remember(sim, p, '森で迷子になり、日が暮れてからやっと家に帰れた', { emo: -0.5, imp: 0.6 }); p.needs.survival = Math.max(0, p.needs.survival - 20); break;
    case 'hurt': hurt(0.15); remember(sim, p, K.k === 'brawl' ? 'けんかで鼻血を出して、泣きながら帰った' : 'ころんでひざをすりむいた', { emo: -0.3, imp: 0.4 }); break;
    case 'bee': case 'sting': hurt(0.05); remember(sim, p, 'ハチに刺されて、手がぱんぱんに腫れた', { emo: -0.4, imp: 0.45 }); break;
    case 'burn': hurt(0.08); remember(sim, p, '鍛冶場の火の粉で、腕にやけどをした', { emo: -0.4, imp: 0.5 }); break;
    case 'cut': hurt(0.05); remember(sim, p, '小刀で指を切って、血が止まらなかった', { emo: -0.3, imp: 0.4 }); break;
    case 'soot': p.needs.survival = Math.max(0, p.needs.survival - 10); remember(sim, p, '煙突のすすを吸いこんで、何日も咳が止まらなかった', { emo: -0.4, imp: 0.45 }); break;
    case 'beast': case 'monster': {
      // 魔物・獣に出会う：怖くて逃げる。近くに冒険者や衛兵がいれば助けてもらえる（E3）
      p.needs.survival = Math.max(0, p.needs.survival - 45);
      k.cnt.awe = sim.today;
      const rescuer = sim.living().find((q) => q.s === p.s && ['adventurer', 'warrior', 'archer', 'cleric', 'sage', 'guard', 'militia', 'soldier', 'knight', 'hunter'].includes(q.job) && sim.ageOf(q) >= 16 && q.hp > q.maxhp * 0.5 && Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z) < 30);
      if (rescuer && R.chance(0.7)) {
        remember(sim, p, `${kind === 'beast' ? '森で獣' : '町の外で魔物'}に出くわし、${JOBS[rescuer.job]?.name || ''}の${rescuer.given}に命を救われた`, { emo: 0.3, imp: 0.9, about: [rescuer.id] });
        sim.remember(rescuer, `${p.given}という子どもを、${kind === 'beast' ? '獣' : '魔物'}から守ってやった`, { emo: 0.5, imp: 0.55, about: [p.id], k: 'help' });
        const r = sim.relMut(p, rescuer); r.a = Math.min(100, r.a + 25);
        addXp(p, k, 'nerve', 30, 1, 1, sim.ageOf(p));
        if (!k.events.includes('E3')) { addEvent(sim, p, k, 'E3'); k.dream = ['guard', 'militia', 'soldier', 'knight'].includes(rescuer.job) ? 'soldier' : 'adventurer'; }
      } else {
        hurt(0.2);
        remember(sim, p, kind === 'beast' ? '森で狼に出くわして、夢中で逃げ帰った' : '町の外で魔物の影を見て、足がすくんで動けなかった', { emo: -0.8, imp: 0.8 });
        addXp(p, k, 'nerve', 4, 1, 1, sim.ageOf(p));
      }
      if (!p.fight && !p.mission) { p.action.until = sim.S.t; }
      break;
    }
    case 'caught': case 'poached': {
      // 捕まる（E6）：親が罰金・弁償を払う。叱られて改心するか、ひねくれる
      const fine = K.k === 'filch' ? Math.max(2, sim.price('bread', p.s) * 2) : 5;
      if (hh) {
        const to = K.k === 'filch' ? W_CASH(sim, p.s) : kind === 'poached' ? W_TREAS(sim, s) : W_FUND(sim, p.s);
        const x = Math.min(fine, Math.max(0, Math.floor(hh.money)));
        if (x > 0) xfer(sim, W_HHO(hh), to, x, K.k === 'filch' ? '子どもの盗みの弁償' : kind === 'poached' ? '密猟の罰金' : '子どもの悪さの罰金', 'fine');
      }
      const turn = R.chance(0.6);
      remember(sim, p, turn ? `${K.s}で捕まり、こっぴどく叱られた。もう二度としないと誓った` : `${K.s}で捕まった。大人なんて信用できないと思った`, { emo: -0.7, imp: 0.8 });
      k.xp.shadow = clamp((k.xp.shadow || 0) + (turn ? -10 : 5), 0, 100);
      for (const q of parentsOf(sim, p)) sim.remember(q, `${p.given}が${K.s}で捕まり、罰金を払った`, { emo: -0.5, imp: 0.5, about: [p.id], k: 'family' });
      addEvent(sim, p, k, 'E6');
      p.action.until = sim.S.t;
      break;
    }
  }
}
function addEvent(sim, p, k, ev) {
  if (!k.events.includes(ev)) k.events.push(ev);
  if (k.events.length > 12) k.events.splice(0, k.events.length - 12);
  const st = childState(sim).stats; st.ev[ev] = (st.ev[ev] || 0) + 1;
}
export const EVENT_NAME = { E1: '魔力の目覚め', E2: '教会に拾い上げられる', E3: '冒険者に命を救われる', E4: '旅の一座の芝居を見る', E5: '親を亡くす', E6: '盗みで捕まる', E7: '騎士の行進を見る', E8: '飢えを生き延びる', fall: '木から落ちて骨を折る',
  sch: '王の奨学生に選ばれる', church: '教会に拾い上げられる', mage: '魔法の才を見出される', master: '親方の目に留まる', merchant: '商人に拾われる', knight: '騎士の目に留まる', guild: '冒険者ギルドに登録する' };

// ================================================================ 1時間ごと：経験をためる・技能と能力を子ども率で伸ばす
export function childHourly(sim, list) {
  for (const p of list) {
    if (!p || p.deathYear != null) continue;
    const age = sim.ageOf(p);
    if (age >= 14 && !(age <= 17 && p.kid?.lessons && (p.action?.type === 'academy' || p.action?.type === 'dojo' || p.action?.k === 'abroad'))) continue;
    if (age < 3) continue;
    const a = p.action;
    if (!a || a.phase !== 'do' || p.fight || p.talk) continue;
    const k = ensureKid(sim, p);
    if (a.type === 'kid') {
      const K = KACT[a.k]; if (!K) continue;
      k.hrs[a.k] = (k.hrs[a.k] || 0) + 1;
      if (K.lesson || K.w === 'school' || K.w === 'church') k.went[a.k] = (k.went[a.k] || 0) + 1;
      if (age >= 14) { for (const [e, r] of Object.entries(K.xp)) for (const [sk, sr] of EXP_SKILL[e] || []) gainSkill(sim, p, sk, 1, r * sr * 0.5); continue; }
      const teach = K.teach || (K.kind === 'help' ? 1.2 : 1);
      for (const [e, r] of Object.entries(K.xp)) {
        addXp(p, k, e, 1, r, teach, age);
        for (const [sk, sr] of EXP_SKILL[e] || []) gainSkill(sim, p, sk, 1, r * sr * 0.5);
        if (e === 'nerve' && p.values) p.values.courage = Math.min(1, p.values.courage + 0.0006 * r);
      }
      for (const stt of K.st) gainStat(p, stt, 1, 0.5);
      // 親の仕事のまね・工房の手伝い・弟子入り：親（親方）の職の経験
      const src = K.parExp ? parentsOf(sim, p).find((q) => JOB_EXP[q.job] && (K.k !== 'shophelp' || CRAFT_JOBS.has(q.job))) : K.masterExp ? alive(sim, k.lessons.indenture?.m) : null;
      if (src && JOB_EXP[src.job]) {
        const [m, sb] = JOB_EXP[src.job];
        const rr = K.parExp || 1;
        addXp(p, k, m, 1, rr, K.masterExp ? 1.7 : 1.2, age); addXp(p, k, sb, 1, rr * 0.5, K.masterExp ? 1.7 : 1.2, age);
        const jg = jobGrowth(src.job);
        if (jg && typeof jg[0] === 'string' && SKILL_LIST.includes(jg[0])) gainSkill(sim, p, jg[0], 1, rr * 0.5);
      }
      if (K.toil) { const e = alive(sim, k.lessons.toil?.e); const je = e && JOB_EXP[e.job]; if (je) addXp(p, k, je[0], 1, 1, 1.2, age); }
      if (a.k === 'serve') addXp(p, k, 'lore', 1, 0.1, 1, age);
    } else if (TYPE_XP[a.type]) {
      const X = TYPE_XP[a.type];
      k.hrs['@' + a.type] = (k.hrs['@' + a.type] || 0) + 1;
      if (X.went) k.went[X.went] = (k.went[X.went] || 0) + 1;
      if (age >= 14) continue;
      if (X.xp) for (const [e, r] of Object.entries(X.xp)) addXp(p, k, e, 1, r, X.teach || 1, age);
      if (X.parExp) {
        const par = sim.S.people[a.friend];
        const je = par && JOB_EXP[par.job];
        if (je) { addXp(p, k, je[0], 1, 1, X.teach, age); addXp(p, k, je[1], 1, 0.5, X.teach, age); }
      }
    }
  }
}

// ================================================================ 1日ごと
export function childDaily(sim) {
  const C = childState(sim), S = sim.S, R = sim.rng;
  const season = Math.floor(sim.today / DAYS_PER_SEASON), year = Math.floor(sim.today / DAYS_PER_YEAR);
  const newSeason = C.season !== season, newYear = C.year !== year;
  C.season = season; C.year = year;
  if (newYear) C.picks = {};
  const kids = [];
  for (const p of sim.living()) { const a = sim.ageOf(p); if (a >= 3 && a <= 17 && p.jail == null) kids.push(p); }
  for (const p of kids) {
    const k = ensureKid(sim, p);
    const age = sim.ageOf(p);
    // 子の財布 → 家計（困窮・貧しい家は全額、ふつうは半分）
    if (age < 14 && (p.purse || 0) >= 1) {
      const hh = sim.hh(p);
      const share = k.tier <= 2 ? 1 : k.tier === 3 ? 0.5 : 0;
      const x = Math.floor((p.purse || 0) * share);
      if (hh && x > 0) xfer(sim, W_PURSE(p), W_HHO(hh), x, '子の稼ぎを家に入れる', 'home');
    }
    // 親を亡くす（E5）
    const par = [p.fatherId, p.motherId].filter((id) => id != null);
    if (!k.parDead) k.parDead = par.filter((id) => S.people[id]?.deathYear != null);   // 前から亡くなっている親は数えない
    for (const id of par) {
      const q = S.people[id];
      if (q && q.deathYear != null && !k.parDead.includes(id)) {
        k.parDead.push(id);
        if (age < 14 && sim.today - (q.deathDay ?? sim.today) < 5) {
          addXp(p, k, 'care', 8, 1, 1, age); addXp(p, k, 'nerve', 8, 1, 1, age);
          addEvent(sim, p, k, 'E5');
        }
      }
    }
    if (age >= 14) continue;
    // 魔力の目覚め（E1）：魔の芽のある子が、星見・肝だめし・強い恐怖のあと
    if (k.seed && !k.events.includes('E1') && k.cnt.awe != null && sim.today - k.cnt.awe <= 2 && R.chance(0.02 + (k.xp.magic || 0) / 2000)) {
      addEvent(sim, p, k, 'E1'); k.xp.magic = Math.min(100, (k.xp.magic || 0) + 15); k.awoke = sim.today;
      remember(sim, p, '夜、指先がふっと光った。自分の中に何かが目覚めた気がした', { emo: 0.6, imp: 0.9 });
    }
    // 魔法の才を見出される：同じ町の魔法使い・導師・賢者が気づく（10日のうちに6割）
    if (k.events.includes('E1') && !k.lessons.magiclesson?.free && sim.today - (k.awoke ?? -99) <= 10 && R.chance(0.09) && age >= 8) {
      const t = teacherFor(sim, p, 'magiclesson');
      if (t) {
        k.lessons.magiclesson = { t: t.id, free: true, until: null };
        addEvent(sim, p, k, 'mage'); k.path = k.path || 'mage';
        remember(sim, p, `${t.given}が私の魔力に気づいて、ただで魔法を教えてくれることになった`, { emo: 0.8, imp: 0.9, about: [t.id] });
        sim.remember(t, `${p.given}という子に魔法の才を見つけた。塔の掃除と引き換えに教えてやることにした`, { emo: 0.5, imp: 0.6, about: [p.id], k: 'career' });
        k.dream = 'wizard';
      }
    }
    // 旅の一座の芝居を見る（E4）
    const tc = townCtx(sim, p.s);
    if (tc.troupe && !k.events.includes('E4') && R.chance(0.3)) { addEvent(sim, p, k, 'E4'); addXp(p, k, 'art', 40, 1, 1, age); remember(sim, p, '旅の一座の芝居を見て、役者になりたいと思った', { emo: 0.7, imp: 0.7 }); if ((k.xp.art || 0) > 20) k.dream = k.dream || 'troupe'; }
    // 騎士の行進を見る（E7）：収穫祭の日、王都の子
    if (sim.isFestival() && sim.townOf(p).type === 'capital' && !k.events.includes('E7') && R.chance(0.35)) { addEvent(sim, p, k, 'E7'); addXp(p, k, 'bu', 25, 1, 1, age); addXp(p, k, 'court', 25, 1, 1, age); remember(sim, p, '収穫祭で騎士さまたちの行進を見て、騎士になりたいと思った', { emo: 0.8, imp: 0.7 }); if ((p.values?.courage ?? 0.5) > 0.5) k.dream = k.dream || 'knight'; }
    // 飢えを生き延びる（E8）
    if ((p.nd?.h0 || 0) >= 18 && !k.events.includes('E8')) { addEvent(sim, p, k, 'E8'); addXp(p, k, 'care', 30, 1, 1, age); addXp(p, k, R.chance(0.5) ? 'faith' : 'nerve', 30, 1, 1, age); remember(sim, p, 'ひもじくて眠れない夜を、家族で身を寄せ合って生き延びた', { emo: -0.6, imp: 0.8 }); }
    // 商人に拾われる：同じ商人に20回以上使い走りをした、trade 40以上
    if (!k.lessons.merchantboy && age >= 11 && (k.xp.trade || 0) >= 40 && k.cnt.errBy) {
      const [mid, nn] = Object.entries(k.cnt.errBy).sort((a2, b2) => b2[1] - a2[1])[0] || [];
      const m = alive(sim, +mid);
      const key = 'merchant:' + p.s;
      if (m && nn >= 20 && m.job === 'merchant' && (C.picks[key] || 0) < 1) {
        C.picks[key] = (C.picks[key] || 0) + 1;
        k.lessons.merchantboy = { t: m.id, free: true }; addEvent(sim, p, k, 'merchant'); k.path = k.path || 'merchant';
        remember(sim, p, `使い走りをしていた${m.given}さんに見込まれて、ただで見習いに置いてもらえることになった`, { emo: 0.8, imp: 0.9, about: [m.id] });
      }
    }
  }
  if (newSeason) seasonStart(sim, kids, newYear);
}
// 季節のはじめ：家の段階を決め直し、習い事を選んで月謝を払う
function seasonStart(sim, kids, newYear) {
  const C = childState(sim), R = sim.rng;
  const until = sim.today + DAYS_PER_SEASON - 1;
  if (newYear) yearlyPicks(sim, kids);
  // 1人あたりの目安で決めると、同じ家の兄弟を順に見るうちに蓄えが減るので、家ごとにまとめて決める
  const byHh = new Map();
  for (const p of kids) { const h = sim.hh(p); if (!h) continue; (byHh.get(h) || byHh.set(h, []).get(h)).push(p); }
  for (const [hh, list] of byHh) {
    for (const p of list) p.kid.tier = computeTier(sim, p);
    list.sort((a, b) => sim.ageOf(b) - sim.ageOf(a));
    let budget = Math.max(0, (hh.money || 0) - reserveOf(hh)) * 0.6;   // 季節の習い事に回せる額（食べ物の分を残す）
    for (const p of list) {
      const k = p.kid, age = sim.ageOf(p), s = sim.townOf(p);
      const had = Object.keys(k.lessons).filter((x) => !k.lessons[x].free && !k.lessons[x].once);
      // 季節ごとの習い事はいったん切れる（払い直す）。1回ごと・一度払いの習い事は残す
      for (const x of Object.keys(k.lessons)) { const L = k.lessons[x]; if (L.season) delete k.lessons[x]; }
      if (tribalOf(s)) continue;
      const opts = lessonOptions(sim, p, k, age, s);
      for (const o of opts) {
        if (k.lessons[o.name]) continue;
        const free = o.free || (k.sch && ['school', 'academy', 'parish'].includes(o.name));
        let fee = free ? 0 : o.fee;
        if (fee > budget) continue;
        if (fee > 0 && !canPay(hh, fee)) continue;
        if (o.fee > 0 && k.sch && ['school', 'academy'].includes(o.name)) {
          // 王の奨学生：国庫 → 学校（町の蓄え）・導師
          const tr = W_TREAS(sim, s);
          const to = o.name === 'school' ? W_FUND(sim, p.s) : W_HH(sim, o.t, '導師の家計');
          if (!tr || tr.o.treasury < o.fee + 100 || !xfer(sim, tr, to, o.fee, `${KACT[o.name]?.s || '魔法学園'}の奨学金`, 'fee')) continue;
        } else if (fee > 0) {
          if (!xfer(sim, W_HHO(hh), o.to(), fee, o.why)) continue;
          budget -= fee;
        }
        if (o.name[0] !== '_') k.lessons[o.name] = { t: o.t?.id ?? null, season: !!o.season, once: !!o.once, until: o.season ? until : null, free: !!free, since: k.lessons[o.name]?.since ?? sim.today, ...(o.extra || {}) };
        if (o.first) o.first();
      }
      const lost = had.filter((x) => !k.lessons[x] && KACT[x]);
      if (lost.length && k.tier <= 2) remember(sim, p, `家のお金が苦しくなって、${KACT[lost[0]].s}をやめた`, { emo: -0.5, imp: 0.6 });
      // 住み込み奉公の給金：雇い主の家計 → 子の家の家計（季節ごと）
      if (k.lessons.servant) {
        const eh = sim.S.households[k.lessons.servant.h];
        if (eh && eh.money >= 5 + reserveOf(eh)) xfer(sim, W_HHO(eh, '雇い主の家計'), W_HHO(hh, '奉公の子の家の家計'), 5, '奉公の給金', 'wage');
        else delete k.lessons.servant;
      }
      const st = C.stats.att;
      const key = `t${k.tier}`;
      const row = st[key] || (st[key] = { kids: 0, school: 0 });
      if (age >= 6 && age <= 13) { row.kids++; if (['parish', 'school', 'tutor', 'cloister'].some((x) => k.lessons[x])) row.school++; }
    }
  }
}
// その子が選べる習い事（家の段階・経験・親の職・町の先生から）。親の選ぶ重みの高い順
function lessonOptions(sim, p, k, age, s) {
  const out = [];
  const tier = k.tier, par = parentsOf(sim, p), pj = par.map((q) => q.job);
  const hh = sim.hh(p);
  const top = Object.entries(k.xp).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e]) => e);
  const want = (e) => (top.includes(e) ? 2 : 1);
  const tc = townCtx(sim, p.s);
  const hasSchool = !!sim.townBuilding(s, 'school') && s.type !== 'village';
  const church = sim.townBuilding(s, 'church');
  const push = (name, w, fee, to, why, o = {}) => out.push({ name, w, fee, to, why, ...o });
  // 学校・手習い（家計 → 町の蓄え／教会の施し箱）
  if (age >= 6 && age <= 13) {
    if (tier >= 5 && teacherFor(sim, p, 'tutor')) {
      const t = teacherFor(sim, p, 'tutor');
      push('tutor', 9, 0, null, '家庭教師', { t, once: true, extra: { t: t.id } });   // 1回ごとに払う
    } else if (hasSchool && (tier >= 3 || (tier === 2 && sim.rng.chance(0.25)))) push('school', 8, 15, () => W_FUND(sim, p.s), '町の学校の月謝', { season: true });
    else if (church && age <= 11 && (tier >= 2 || sim.rng.chance(0.35))) {
      const winter = sim.seasonIdx() === 3;
      if (tier >= 3 || winter || s.type !== 'village' || sim.rng.chance(0.5)) push('parish', 7, tier <= 1 ? 0 : 5, () => W_ALMS(sim, p.s), '教会の手習いの謝礼', { season: true, free: tier <= 1 });
    }
    if (tier === 4 && teacherFor(sim, p, 'tutor') && want('letter') > 1 && sim.rng.chance(0.5)) { const t = teacherFor(sim, p, 'tutor'); push('tutor', 4, 0, null, '家庭教師', { t, once: true, extra: { t: t.id } }); }
  }
  // 算術の塾（家計 → 教える人）
  if (age >= 10 && age <= 13 && s.type !== 'village' && (tier >= 4 || (tier === 3 && (top.includes('trade') || pj.some((j) => ['merchant', 'changer', 'peddler'].includes(j)))))) {
    const t = teacherFor(sim, p, 'abacus'); if (t && sim.hh(t) !== hh) push('abacus', 3 * want('trade'), 20, () => W_HH(sim, t, '算術の先生の家計'), '算術の塾の月謝', { t, season: true });
  }
  // 1回ごとの習い事（家計 → 先生。通うたびに払う）
  const session = (name, cond, w) => { if (!cond) return; const t = teacherFor(sim, p, name); if (t && sim.hh(t) !== hh) push(name, w, 0, null, KACT[name].s, { t, once: true, extra: { t: t.id } }); };
  session('magiclesson', age >= 8 && tier >= 4 && k.seed, 3 * want('magic'));
  session('music', age >= 7 && tier >= 3 && (top.includes('art') || tier >= 4) && sim.rng.chance(0.5), 2 * want('art'));
  session('dance', age >= 7 && tier >= 3 && top.includes('art') && sim.rng.chance(0.4), 2 * want('art'));
  session('archery', age >= 9 && tier >= 3 && (top.includes('aim') || pj.includes('hunter')) && sim.rng.chance(0.5), 2 * want('aim'));
  const ownHorse = pj.some((j) => ['knight', 'noble', 'royal', 'king', 'coachman', 'stablehand', 'general', 'royalguard'].includes(j));
  if (age >= 8 && age <= 13 && (ownHorse || (tier >= 4 && sim.rng.chance(0.5)))) {
    if (ownHorse) push('ride', 3 * want('court'), 0, null, '乗馬', { once: true, free: true });
    else session('ride', true, 2 * want('court'));
  }
  // 魔法学園（家計 → 導師。季節60）・剣術道場（家計 → 師範。季節20、兵士・騎士の子は半額）
  if (age >= 10 && age <= 17 && s.type === 'capital' && sim.townBuilding(s, 'academy') && (k.seed || (k.xp.letter || 0) >= 30) && (tier >= 4 || k.sch)) {
    const t = teacherFor(sim, p, 'academy'); if (t && sim.hh(t) !== hh) push('academy', 5 * want('magic') + (k.seed ? 2 : 0), 60, () => W_HH(sim, t, '導師の家計'), '魔法学園の月謝', { t, season: true });
  }
  const swordKid = pj.some((j) => SWORD_FAMILY.has(j));
  if (age >= 10 && age <= 17 && (tier >= 3 || (swordKid && tier >= 2)) && (swordKid || top.includes('bu') || (p.values?.courage ?? 0.5) > 0.62)) {
    const cap = sim.capitalOf(p);
    if (cap && sim.townBuilding(cap, 'dojo') && Math.hypot(cap.x - s.x, cap.z - s.z) < 40) {
      const t = teacherFor(sim, p, 'dojo'); if (t && sim.hh(t) !== hh) push('dojo', 3 * want('bu') + (swordKid ? 2 : 0), swordKid ? 10 : 20, () => W_HH(sim, t, '剣の師範の家計'), '剣術道場の月謝', { t, season: true });
    }
  }
  // 行儀作法（貴族・王族の家。家計 → 執事）
  if (age >= 7 && age <= 13 && tier >= 5) { const t = teacherFor(sim, p, 'etiquette'); if (t && sim.hh(t) !== hh) push('etiquette', 4, 10, () => W_HH(sim, t, '執事の家計'), '行儀作法の謝礼', { t, season: true }); }
  // 一度払いの預け先：小姓（騎士へ80）・商家の見習い（商人へ100）・弟子入り（親方へ60〜150）・修道院（教会へ30〜）
  if (age >= 7 && age <= 13 && !k.lessons.page && (pj.some((j) => ['knight', 'noble', 'royal', 'general', 'royalguard'].includes(j)) || (tier >= 4 && (p.values?.courage ?? 0.5) >= 0.6)) && p.sex !== 'f') {
    const t = teacherFor(sim, p, 'page'); if (t && sim.hh(t) !== hh && !par.includes(t)) push('page', 4 + want('court'), 80, () => W_HH(sim, t, '騎士の家計'), '小姓の支度金', { t, first: () => remember(sim, p, `騎士の${t.given}さまの小姓になった`, { emo: 0.7, imp: 0.85, about: [t.id] }) });
    else if (t && par.includes(t)) push('page', 5, 0, null, '小姓', { t, free: true });
  }
  if (age >= 11 && age <= 13 && !k.lessons.merchantboy && (pj.includes('merchant') || (tier >= 3 && (k.xp.trade || 0) >= 25))) {
    const t = teacherFor(sim, p, 'merchantboy');
    if (t) push('merchantboy', 4 * want('trade'), pj.includes('merchant') || sim.hh(t) === hh ? 0 : 100, () => W_HH(sim, t, '商人の家計'), '商家の見習いの支度金', { t, free: pj.includes('merchant'), first: () => remember(sim, p, `${t.given}さんの店で見習いを始めた`, { emo: 0.6, imp: 0.8, about: [t.id] }) });
  }
  if (age >= 12 && age <= 13 && !k.lessons.indenture && (k.xp.craft || 0) >= 20) {
    const m = pickMaster(sim, p, k);
    if (m) {
      const same = pj.includes(m.job);
      const fee = same ? 0 : ({ jeweler: 150, smith: 120, shipwright: 120, carpenter: 90, tailor: 80, mason: 80, potter: 70, cobbler: 60, weaver: 60, baker: 70, butcher: 70, brewer: 80, miller: 70, barber: 60 }[m.job] || 80);
      push('indenture', 5 * want('craft'), fee, () => W_HH(sim, m, '親方の家計'), '弟子入りの入門金', { t: m, free: same, extra: { m: m.id, job: m.job }, first: () => { remember(sim, p, same ? `親の工房で、${JOBS[m.job]?.name || ''}の修業の見習いを始めた` : `${JOBS[m.job]?.name || ''}の${m.given}親方のもとへ、弟子入りの見習いに通い始めた`, { emo: 0.6, imp: 0.85, about: [m.id] }); sim.remember(m, `${p.given}を弟子入り前の見習いとして預かった`, { emo: 0.4, imp: 0.5, about: [p.id], k: 'career' }); } });
    }
  }
  if (age >= 7 && age <= 13 && !k.lessons.cloister && s.type === 'capital' && church && (k.xp.faith || 0) >= 25 && tier >= 3 && (p.values?.faith ?? 0.5) > 0.6) push('cloister', 3 * want('faith'), 30, () => W_ALMS(sim, p.s), '修道院への寄進', { first: () => remember(sim, p, '修道院に預けられ、祈りと写本の日々が始まった', { emo: 0.3, imp: 0.85 }) });
  // 本（家計 → 書記・商人。40）
  if (!k.own.book && age >= 8 && tier >= 4 && (k.xp.letter || 0) >= 20) { const t = teacherFor(sim, p, 'bookseller'); if (t && sim.hh(t) !== hh) out.push({ name: '_book', w: 2 * want('lore'), fee: 40, to: () => W_HH(sim, t, '書記の家計'), why: '子どもの本', first: () => { k.own.book = 1; remember(sim, p, '誕生日でもないのに本を買ってもらった', { emo: 0.7, imp: 0.6 }); } }); }
  // 弓と笛（家計 → 大工・細工師）
  if (!k.own.bow && out.some((o) => o.name === 'archery')) { const t = teacherFor(sim, p, 'bowmaker'); if (t && sim.hh(t) !== hh) out.push({ name: '_bow', w: 9, fee: 8, to: () => W_HH(sim, t, '弓を作った職人の家計'), why: '子ども用の弓', first: () => { k.own.bow = 1; } }); }
  if (!k.own.flute && out.some((o) => o.name === 'music')) { const t = teacherFor(sim, p, 'flutemaker'); if (t && sim.hh(t) !== hh) out.push({ name: '_flute', w: 9, fee: 8, to: () => W_HH(sim, t, '笛を作った職人の家計'), why: '子どもの笛', first: () => { k.own.flute = 1; } }); }
  // 留学（富裕の家。年300：家計 → 他国の導師）
  if (age >= 13 && age <= 17 && tier >= 5 && (k.xp.lore || 0) >= 40 && !k.lessons.abroad && sim.rng.chance(0.3)) {
    const home = sim.capitalOf(p);
    const far = sim.S.world.settlements.filter((q) => q.type === 'capital' && q.kingdom !== s.kingdom && home && Math.hypot(q.x - home.x, q.z - home.z) < 140);
    for (const q of far) { const t = firstOf(sim, townCtx(sim, q.id), ['magister', 'courtmage', 'sage']); if (t) { push('abroad', 6, 300, () => W_HH(sim, t, '他国の導師の家計'), '留学の学費', { t, extra: { until: sim.today + DAYS_PER_YEAR } }); break; } }
  }
  // 住み込み奉公（困窮・貧しい家の10〜13歳：裕福な家へ。給金は雇い主 → 子の家）
  if (age >= 10 && age <= 13 && tier <= 2 && !k.lessons.servant && sim.rng.chance(0.3)) {
    const eh = tc.rich.map((id) => sim.S.households[id]).find((h) => h && h !== hh && h.money > 100 && !Object.values(sim.S.people).some((q) => q.kid?.lessons?.servant?.h === h.id && q.deathYear == null));
    if (eh) push('servant', 3, 0, null, '奉公', { free: true, extra: { h: eh.id }, first: () => remember(sim, p, `${eh.name || 'よその家'}に奉公に出された`, { emo: -0.1, imp: 0.75 }) });
  }
  // 働きづめ（困窮の家）：雇い主は仕事のあるときに決まる
  if (age >= 8 && tier <= 1 && !k.lessons.toil && sim.rng.chance(0.5)) push('toil', 1, 0, null, '働きづめ', { free: true, extra: { e: null } });
  // 親は、子の一番高い経験と親の職に合う習い事を先に選ぶ
  const pjSet = new Set(pj);
  for (const o of out) { const K = KACT[o.name]; if (K) { const m = Object.keys(K.xp)[0]; if (pj.some((j) => JOB_EXP[j]?.[0] === m)) o.w *= 1.5; } void pjSet; o.w += sim.rng.next() * 0.5; }
  out.sort((a, b) => b.w - a.w);
  // 支払い先の関数（to）が無い習い事は、1回ごと・無料
  for (const o of out) if (!o.to) o.to = () => null;
  return out;
}
function pickMaster(sim, p, k) {
  const tc = townCtx(sim, p.s);
  const par = parentsOf(sim, p);
  const own = par.find((q) => CRAFT_JOBS.has(q.job) && (q.skill?.[q.job] || 0) >= 0.3);
  if (own && sim.rng.chance(0.6)) return own;
  const list = [];
  for (const j of CRAFT_JOBS) for (const id of tc.jobs[j] || []) { const q = alive(sim, id); if (q && (q.skill?.[q.job] || 0) >= 0.4 && sim.ageOf(q) >= 25) list.push(q); }
  if (!list.length) return own || null;
  return list[(sim.rng.next() * list.length) | 0];
}
// 年に一度：王の奨学生・教会の拾い上げ・親方の目に留まる・騎士の目に留まる
function yearlyPicks(sim, kids) {
  const C = childState(sim);
  const bySet = new Map();
  for (const p of kids) { const a = sim.ageOf(p); if (a >= 6 && a <= 13 && p.kid && !tribalOf(sim.townOf(p))) (bySet.get(p.s) || bySet.set(p.s, []).get(p.s)).push(p); }
  // 王の奨学生（王都ごとに年1人。国庫が苦しいと0人）
  for (const cap of sim.S.world.settlements.filter((s) => s.type === 'capital')) {
    const k0 = kingdomOf(sim, cap);
    if (!k0 || (k0.treasury || 0) < 300) continue;
    const cand = [];
    for (const s of sim.S.world.settlements.filter((q) => q.kingdom === cap.kingdom)) for (const p of bySet.get(s.id) || []) {
      const k = p.kid, a = sim.ageOf(p);
      if (a < 10 || k.tier > 3 || k.sch) continue;
      const smart = (k.xp.letter || 0) + (k.xp.lore || 0) >= 90 || ((p.gr?.pot?.int ?? 10) >= 13 && (k.xp.letter || 0) >= 30);
      if (smart) cand.push(p);
    }
    cand.sort((a, b) => ((b.kid.xp.letter || 0) + (b.kid.xp.lore || 0) + (b.gr?.pot?.int ?? 10) * 3) - ((a.kid.xp.letter || 0) + (a.kid.xp.lore || 0) + (a.gr?.pot?.int ?? 10) * 3));
    const p = cand[0];
    if (p) {
      p.kid.sch = { since: sim.today, k: cap.kingdom };
      addEvent(sim, p, p.kid, 'sch'); p.kid.path = p.kid.path || 'sch';
      remember(sim, p, `学問の才を認められて、王の奨学生に選ばれた`, { emo: 0.9, imp: 0.95 });
      for (const q of parentsOf(sim, p)) sim.remember(q, `${p.given}が王の奨学生に選ばれた。わが家の誇りだ`, { emo: 0.9, imp: 0.8, about: [p.id], k: 'family' });
      sim.pushLog(`${sim.fullName(p)}（${sim.ageOf(p)}歳）が王の奨学生に選ばれた。`, 'event', [p.id], p.pos);
    }
  }
  for (const [sid, list] of bySet) {
    const s = sim.town(sid);
    // 教会の拾い上げ（教会ごとに年1人）：聖歌隊・侍者で faith 35以上、困窮・貧しい・孤児
    if (sim.townBuilding(s, 'church')) {
      const c = list.filter((p) => p.kid.tier <= 2 && (p.kid.xp.faith || 0) >= 35 && ((p.kid.hrs.choir || 0) + (p.kid.hrs.acolyte || 0) > 0 || p.kid.est) && !p.kid.lessons.cloister).sort((a, b) => (b.kid.xp.faith || 0) - (a.kid.xp.faith || 0))[0];
      if (c) {
        c.kid.lessons.cloister = { t: null, free: true, since: sim.today };
        addEvent(sim, c, c.kid, 'church'); c.kid.path = c.kid.path || 'church';
        remember(sim, c, '司祭さまに見込まれて、教会でただで学べることになった', { emo: 0.8, imp: 0.9 });
      }
    }
    // 親方の目に留まる（町ごとに年2人まで）：craft 40以上
    let n = 0;
    for (const p of list.filter((q) => sim.ageOf(q) >= 12 && (q.kid.xp.craft || 0) >= 40 && !q.kid.lessons.indenture && q.kid.tier <= 3).sort((a, b) => (b.kid.xp.craft || 0) - (a.kid.xp.craft || 0))) {
      if (n >= 2) break;
      const m = pickMaster(sim, p, p.kid);
      if (!m || parentsOf(sim, p).includes(m)) continue;
      p.kid.lessons.indenture = { t: m.id, m: m.id, job: m.job, free: true, since: sim.today };
      addEvent(sim, p, p.kid, 'master'); p.kid.path = p.kid.path || 'master'; n++;
      remember(sim, p, `${JOBS[m.job]?.name || ''}の${m.given}親方が、入門金なしで弟子入りさせてくれることになった`, { emo: 0.8, imp: 0.9, about: [m.id] });
      sim.remember(m, `手先の器用な${p.given}という子を、入門金なしで弟子にとることにした`, { emo: 0.5, imp: 0.6, about: [p.id], k: 'career' });
    }
  }
  // 騎士の目に留まる（国ごとに年1人）：bu 45以上・勇気0.7以上・騎士と親しい
  for (const k0 of sim.S.kingdoms || []) {
    for (const p of kids) {
      const s = sim.townOf(p), k = p.kid;
      if (!k || s?.kingdom !== k0.id || sim.ageOf(p) < 8 || sim.ageOf(p) > 13 || k.lessons.page || (k.xp.bu || 0) < 45 || (p.values?.courage ?? 0) < 0.7) continue;
      const kn = Object.entries(p.rel || {}).map(([id, r]) => [alive(sim, +id), r]).find(([q, r]) => q && ['knight', 'royalguard', 'general'].includes(q.job) && r.a >= 30);
      if (!kn) continue;
      k.lessons.page = { t: kn[0].id, free: true, since: sim.today };
      addEvent(sim, p, k, 'knight'); k.path = k.path || 'knight'; k.dream = 'knight';
      remember(sim, p, `騎士の${kn[0].given}さまに見込まれて、支度金なしで小姓に取り立てられた`, { emo: 0.9, imp: 0.95, about: [kn[0].id] });
      break;
    }
  }
  void C;
}
function endLesson(sim, p, k, name, why) {
  if (!k.lessons[name]) return;
  delete k.lessons[name];
  if (why === 'money' && KACT[name]) remember(sim, p, `家のお金が苦しくなって、${KACT[name].s}をやめた`, { emo: -0.5, imp: 0.6 });
}

// ================================================================ 14歳の職選び
// 表4-2：職業ごとの必要な条件（満たさないと選べない）
const REQ = {
  farmer: (c) => c.s.type !== 'capital' || c.pj.includes('farmer'), rancher: (c) => c.pj.includes('rancher'), shepherd: (c) => c.s.type === 'village' || c.pj.includes('shepherd'),
  fisher: (c) => c.s.type === 'port' || c.pj.includes('fisher'), sailor: (c) => c.s.type === 'port', diver: (c) => c.s.type === 'port' && (c.xp.water || 0) >= 40,
  hunter: (c) => c.s.type !== 'capital', smith: (c) => c.pj.includes('smith') || c.ind === 'smith', carpenter: (c) => c.pj.includes('carpenter') || c.ind === 'carpenter' || (c.xp.craft || 0) >= 35,
  shipwright: (c) => c.pj.includes('shipwright') || c.ind === 'shipwright', mason: (c) => c.pj.includes('mason') || c.ind === 'mason' || (c.xp.craft || 0) >= 35,
  tailor: (c) => c.pj.includes('tailor') || c.ind === 'tailor' || (c.xp.craft || 0) >= 35, weaver: (c) => c.pj.includes('weaver') || c.ind === 'weaver' || (c.xp.craft || 0) >= 30,
  cobbler: (c) => c.pj.includes('cobbler') || c.ind === 'cobbler' || (c.xp.craft || 0) >= 30, potter: (c) => c.pj.includes('potter') || c.ind === 'potter' || (c.xp.craft || 0) >= 30,
  merchant: (c) => c.k.lessons.merchantboy || c.pj.includes('merchant') || (c.xp.trade || 0) >= 45, changer: (c) => c.s.type !== 'village' && (c.xp.letter || 0) >= 30,
  innkeeper: (c) => c.pj.includes('innkeeper'), butler: (c) => (c.xp.court || 0) >= 30, maid: (c) => c.p.sex === 'f', nanny: (c) => c.p.sex === 'f', midwife: (c) => c.p.sex === 'f',
  scribe: (c) => (c.xp.letter || 0) >= 40, teacher: (c) => (c.xp.letter || 0) >= 50, scholar: (c) => (c.xp.lore || 0) >= 45 && (c.xp.letter || 0) >= 45 && (c.p.gr?.pot?.int ?? 10) >= 11,
  doctor: (c) => (c.xp.lore || 0) >= 35 && (c.xp.care || 0) >= 30, herbalist: (c) => (c.xp.lore || 0) >= 25, wizard: (c) => (c.xp.magic || 0) >= 30,
  nun: (c) => (c.xp.faith || 0) >= 35 && c.p.sex === 'f', priest: (c) => (c.xp.faith || 0) >= 35, cleric: (c) => (c.xp.faith || 0) >= 30, paladin: (c) => (c.xp.faith || 0) >= 30 && (c.xp.bu || 0) >= 30,
  soldier: (c) => c.s.type === 'capital' || (c.xp.bu || 0) + (c.xp.body || 0) >= 50, militia: (c) => c.s.type !== 'capital', knight: (c) => (c.xp.court || 0) >= 35 && (c.xp.bu || 0) >= 35 && !!c.k.lessons.page,
  warrior: (c) => (c.xp.bu || 0) >= 35, archer: (c) => (c.xp.aim || 0) >= 35, adventurer: (c) => (c.xp.nerve || 0) >= 30, thief: (c) => (c.xp.shadow || 0) >= 40,
  musician: (c) => (c.xp.art || 0) >= 35, bard: (c) => (c.xp.art || 0) >= 35, dancer: (c) => (c.xp.art || 0) >= 30, troupe: (c) => (c.xp.art || 0) >= 30, painter: (c) => (c.xp.art || 0) >= 30,
  pickpocket: (c) => (c.xp.shadow || 0) >= 30 && (c.tier <= 1 || c.bad), swindler: (c) => (c.xp.lead || 0) >= 30 && (c.xp.shadow || 0) >= 20,
  keeper: (c) => c.s.type === 'port', ferryman: (c) => c.s.type !== 'capital', miner: (c) => c.s.type === 'village' || c.pj.includes('miner'), beekeeper: (c) => c.pj.includes('beekeeper') || c.s.type === 'village',
  miller: (c) => c.pj.includes('miller') || c.s.type === 'village', gardener: (c) => c.s.type === 'capital', coachman: (c) => c.s.type !== 'village', stablehand: () => true, messenger: (c) => c.s.type === 'capital',
  butcher: (c) => c.pj.includes('butcher') || (c.xp.craft || 0) >= 25, brewer: (c) => c.pj.includes('brewer') || (c.xp.craft || 0) >= 25, baker: () => true, cook: (c) => c.s.type === 'capital' || c.pj.includes('cook'),
  laundress: (c) => c.p.sex === 'f', servant: () => true, charcoal: (c) => c.s.type !== 'capital', woodcutter: () => true, pioneer: () => true, roadworker: () => true, peddler: () => true,
  gatherer: (c) => c.s.type !== 'capital',
};
// 14歳でそのまま就ける職（今の YOUTH_JOBS ＋ 見習いから始める職）
const EXT_YOUTH = new Set(['scribe', 'nun', 'herbalist', 'wizard', 'painter', 'pickpocket', 'butcher', 'brewer', 'keeper']);
const canTake = (j) => YOUTH_JOBS.has(j) || EXT_YOUTH.has(j);
// 14歳では就けない職（要職・冒険者など）は、つながる若者の職で始めて、志（p.aspire）にする
const BRIDGE = { merchant: 'peddler', changer: 'peddler', innkeeper: 'cook', teacher: 'scribe', scholar: 'scribe', doctor: 'herbalist', priest: 'scribe', butler: 'servant', midwife: 'nanny',
  knight: 'soldier', royalguard: 'soldier', warrior: 'soldier', adventurer: 'soldier', archer: 'hunter', cleric: 'scribe', paladin: 'soldier', thief: 'pickpocket', bard: 'musician', swindler: 'peddler' };
const DREAM_TEXT = { knight: '騎士に取り立てられる', adventurer: '伝説の魔物を倒す', warrior: '伝説の魔物を倒す', merchant: '自分の店を持つ', scholar: '星の運行の謎を解く', wizard: '新しい魔法を編み出す', soldier: '王様に認められる' };
const CHOICES = Object.keys(REQ).filter((j) => JOBS[j]);
export function kidJobScores(sim, p) {
  const k = ensureKid(sim, p);
  const s = sim.townOf(p);
  const par = parentsOf(sim, p);
  const pAll = [sim.S.people[p.fatherId], sim.S.people[p.motherId]].filter(Boolean);
  const pj = pAll.map((q) => q.job || q.formerJob).filter(Boolean);
  const c = { sim, p, k, s, xp: k.xp, pj, tier: k.tier, ind: k.lessons.indenture?.job || null, bad: pj.some((j) => BAD_JOBS.has(j)) };
  const counts = {};
  for (const q of sim.living()) if (q.s === p.s && q.job && sim.ageOf(q) >= 14) counts[q.job] = (counts[q.job] || 0) + 1;
  const lack = new Set(lackingJobs(s.type, counts, 21));
  const quota = JOB_QUOTA[s.type] || {};
  const pot = p.gr?.pot || {};
  const rows = [];
  for (const j of CHOICES) {
    if (!REQ[j](c)) continue;
    const inTown = quota[j] || pj.includes(j) || ['soldier', 'servant', 'peddler', 'woodcutter', 'pioneer', 'roadworker', 'scribe', 'herbalist', 'nun', 'painter', 'stablehand', 'baker', 'musician', 'dancer', 'troupe', 'adventurer', 'warrior', 'archer', 'cleric', 'knight', 'merchant', 'priest', 'scholar', 'doctor', 'teacher', 'wizard', 'thief', 'pickpocket', 'butcher', 'brewer'].includes(j);
    if (!inTown) continue;
    const [m, sb] = JOB_EXP[j] || [];
    const exp = m ? (k.xp[m] || 0) / 50 + (k.xp[sb] || 0) / 100 : 0;
    const sts = jobGrowth(j)?.[1] || [];
    const tal = sts.length ? sts.reduce((a, x) => a + ((pot[x] ?? 10) - 10), 0) / 3 / sts.length : 0;
    const property = pj.includes(j) && (['farmer', 'fisher', 'rancher', 'merchant', 'innkeeper', 'captain', 'noble'].includes(j) || CRAFT_JOBS.has(j) || par.some((q) => q.job === j && q.shop != null));
    const fam = pj.includes(j) ? (property ? FAM_PROP : FAM_HIRED) : 0;
    const need = lack.has(j) ? 0.8 : 0;
    const dream = k.dream === j || (DREAM_TEXT[j] && p.dream === DREAM_TEXT[j]) ? 0.8 : 0;
    const rank = NOBLE.has(p.rank) && j === 'noble' ? 3 : (pj.includes('knight') && j === 'knight') ? 1 : 0;
    const path = (k.lessons.indenture?.job === j ? 1.2 : 0) + (k.lessons.merchantboy && j === 'merchant' ? 1.2 : 0) + (k.lessons.page && j === 'knight' ? 1.2 : 0) + (k.lessons.cloister && ['priest', 'nun', 'scribe'].includes(j) ? 0.8 : 0) + ((k.lessons.magiclesson || k.lessons.academy) && j === 'wizard' ? 0.8 : 0);
    const bad = BAD_JOBS.has(j) && !(c.tier <= 1 || c.bad) ? -3 : 0;
    const score = exp * 1.0 + tal * 0.6 + fam + need + dream + rank + path + bad + h01(p.id, CHOICES.indexOf(j)) * 0.4;
    rows.push({ j, score, exp, fam, need, dream, tal });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows;
}
// 家業点：設計書は財産のある家業 1.5・雇われ仕事 0.7。試験（種3つ）で継ぐ割合が53%、1.3・0.5 では14日後に35%だったので、間の 1.4・0.6
let FAM_PROP = 1.4, FAM_HIRED = 0.6;
export function setFamilyPoints(a, b) { FAM_PROP = a; FAM_HIRED = b; }
// 14歳の職の選び方（副作用なし。試験でも使う）→ { job, ideal, aspire, pick } か null
export function pickFirstJob(sim, p, rnd = () => sim.rng.next()) {
  const k = ensureKid(sim, p);
  const s = sim.townOf(p);
  if (!s || tribalOf(s) || NOBLE.has(p.rank)) return null;   // 里の子と貴族の子は今までどおり
  if (Math.max(0, ...Object.values(k.xp)) < 20) return null;   // 何もしなかった子は今どおり（家業か町の不足）
  const pAll = [sim.S.people[p.fatherId], sim.S.people[p.motherId]].filter(Boolean);
  const pj = pAll.map((q) => q.job || q.formerJob).filter(Boolean);
  const rows = kidJobScores(sim, p);
  if (!rows.length) return null;
  // 上位3つから重みつきで
  const top3 = rows.slice(0, 3);
  let tot = 0; const w = top3.map((r) => { const v = Math.exp((r.score - top3[0].score) * 2.2); tot += v; return v; });
  let u = rnd() * tot, pick = top3[0];
  for (let i = 0; i < top3.length; i++) { u -= w[i]; if (u <= 0) { pick = top3[i]; break; } }
  let ideal = pick.j, job = ideal, aspire = null;
  if (!canTake(ideal)) {
    const br = BRIDGE[ideal];
    const brOk = br && canTake(br) && (REQ[br]?.({ sim, p, k, s, xp: k.xp, pj, tier: k.tier, ind: null, bad: false }) ?? true);
    job = brOk ? br : (rows.find((r) => canTake(r.j))?.j || null);
    aspire = ideal;
  }
  if (!job) return null;
  if (job === 'soldier' && s.type !== 'capital') job = 'militia';   // 村・港の子は自警団から
  return { job, ideal, aspire, pick, pj };
}
export function childFirstJob(sim, p) {
  const k = ensureKid(sim, p);
  const s = sim.townOf(p);
  const par = parentsOf(sim, p);
  const st = childState(sim).stats;
  const top = Object.entries(k.xp).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, v]) => [e, Math.round(v)]);
  const R = sim.rng;
  const res = pickFirstJob(sim, p);
  if (!res) { if (s && !tribalOf(s) && !NOBLE.has(p.rank)) { st.first.push({ id: p.id, d: sim.today, job: null, why: 'fallback', top, par: [] }); if (st.first.length > 400) st.first.shift(); } return null; }
  const { job, ideal, aspire, pick, pj } = res;
  const inherit = pj.includes(job) || pj.includes(ideal);
  st.first.push({ id: p.id, d: sim.today, job, ideal, aspire, top, par: pj, inherit, reason: pick.exp >= pick.fam ? 'exp' : 'fam', tier: k.tier });
  if (st.first.length > 400) st.first.shift();
  k.job14 = { job, ideal, d: sim.today };
  if (aspire) { p.aspire = aspire; p.aspireDay = sim.today; }
  if (DREAM_TEXT[ideal] && !p.dream) p.dream = DREAM_TEXT[ideal];
  // 弟子入りしていた親方がいれば、そのまま師匠（career.js の弟子のしくみ）
  const L = k.lessons.indenture;
  const m = L && alive(sim, L.m);
  if (m && m.job === job && m.s === p.s) { p.master = m.id; p.appr = true; p.apprSince = sim.today; (m.apprentices = m.apprentices || []).push(p.id); }
  if (job === 'wizard') { const t = teacherFor(sim, p, 'magiclesson'); if (t && t.job === 'wizard') { p.master = t.id; p.appr = true; p.apprSince = sim.today; (t.apprentices = t.apprentices || []).push(p.id); } }
  // 冒険者ギルドへ（登録料5：子の財布 → ギルドマスターの家計）
  if (['adventurer', 'warrior', 'archer', 'cleric', 'thief'].includes(ideal) && Math.max(k.xp.nerve || 0, k.xp.bu || 0, k.xp.aim || 0, k.xp.shadow || 0) >= 35) {
    const cap = sim.capitalOf(p), gm = cap && firstOf(sim, townCtx(sim, cap.id), ['guildmaster']);
    if (gm && (p.purse || 0) >= 5 && xfer(sim, W_PURSE(p), W_HH(sim, gm, 'ギルドの家計'), 5, '冒険者ギルドの登録料')) { k.guild = sim.today; addEvent(sim, p, k, 'guild'); k.path = k.path || 'guild'; remember(sim, p, '冒険者ギルドに見習いとして名前を書いてもらった', { emo: 0.8, imp: 0.85 }); }
  }
  // 子ども時代のまとめの記憶（大人になっても会話の話題になる）
  const favK = favOf(k);
  if (favK) remember(sim, p, `子どものころは、${KACT[favK].s}ばかりしていた`, { emo: 0.5, imp: 0.62 });
  if (k.went.school || k.went.parish || k.went.tutor) remember(sim, p, k.went.tutor ? '子どものころ、家庭教師に読み書きを習った' : k.went.school ? '子どものころ、町の学校に通った' : '子どものころ、教会の手習いに通った', { emo: 0.3, imp: 0.5 });
  // 家業を継がないと言い出す：別の経験が家業の経験より20以上高い
  const pm = par.find((q) => JOB_EXP[q.job]);
  if (pm && !inherit) {
    const fe = k.xp[JOB_EXP[pm.job][0]] || 0;
    const [be, bv] = Object.entries(k.xp).sort((a, b) => b[1] - a[1])[0];
    if (bv - fe >= 20 && be !== JOB_EXP[pm.job][0]) {
      const cheer = R.chance(0.3);
      remember(sim, p, `${JOBS[pm.job]?.name || '家業'}は継がないと${pm.sex === 'f' ? '母さん' : '父さん'}に言った。${cheer ? '思いがけず応援してくれた' : '大げんかになった'}`, { emo: cheer ? 0.5 : -0.5, imp: 0.85, about: [pm.id], k: 'family' });
      sim.remember(pm, `${p.given}が${JOBS[pm.job]?.name || '家業'}を継がないと言い出した${cheer ? '。好きな道を行けばいい' : '。まったく、誰に似たのか'}`, { emo: cheer ? 0.3 : -0.5, imp: 0.7, about: [p.id], k: 'family' });
      if (!cheer) { const r1_ = sim.relMut(p, pm); r1_.a -= 5; const r2 = sim.relMut(pm, p); r2.a -= 5; }
      else { const r2 = sim.relMut(pm, p); r2.a += 3; }
    }
  }
  for (const x of Object.keys(k.lessons)) if (!['academy', 'dojo', 'abroad'].includes(x)) delete k.lessons[x];
  return job;
}
function favOf(k) {
  let best = null, bv = 0;
  for (const [a, h] of Object.entries(k.hrs)) { const K = KACT[a]; if (!K || (K.kind !== 'play' && K.kind !== 'tribe')) continue; if (h > bv) { bv = h; best = a; } }
  if (best && bv >= 3) k.fav = best;
  return k.fav;
}

// ================================================================ 冒険者の職業（advclass.js）への上乗せ：経験/40
export function kidClassBonus(p, cls) {
  const x = p.kid?.xp;
  if (!x) return 0;
  const v = (e) => x[e] || 0;
  switch (cls) {
    case 'swordsman': return v('bu') / 40;
    case 'fighter': return (v('bu') + v('body')) / 2 / 40;
    case 'monk': return Math.min(1.5, ((p.kid.hrs?.wrestle || 0) + (p.kid.hrs?.brawl || 0)) / 60);
    case 'squire': return v('court') / 40;
    case 'thief': return v('shadow') / 40;
    case 'archer': return v('aim') / 40;
    case 'wizard': return v('magic') / 40;
    case 'sorcerer': return (v('magic') + v('lore')) / 2 / 40;
    case 'priest': return v('faith') / 40;
    case 'paladin': return (v('faith') + v('bu')) / 2 / 40;
    case 'bandit': return (v('shadow') + v('nerve')) / 2 / 40;
  }
  return 0;
}
export const kidHeroic = (p) => { const x = p.kid?.xp; return !!x && (x.nerve || 0) >= 40 && (x.lead || 0) >= 40 && (x.bu || 0) >= 40; };

// ================================================================ 人物の詳細欄「子ども時代」
export function childCardHtml(sim, p, esc = (s) => String(s)) {
  if (!p || !p.memories) return '';
  const age = sim.ageOf(p);
  if (age < 3) return '';
  const k = ensureKid(sim, p);
  const top = Object.entries(k.xp).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const fav = favOf(k);
  const WENT = { school: '町の学校', parish: '教会の手習い', tutor: '家庭教師', abacus: '算術の塾', academy: '魔法学園', dojo: '剣術道場', magiclesson: '魔法の手ほどき', music: '楽器の稽古', dance: '踊りの稽古', ride: '乗馬', archery: '弓の稽古', etiquette: '行儀作法', page: '騎士の小姓', merchantboy: '商家の見習い', indenture: '弟子入り', cloister: '修道院', abroad: '留学', choir: '聖歌隊', acolyte: '侍者' };
  const went = Object.entries(k.went).filter(([x, h]) => WENT[x] && h >= 1).sort((a, b) => b[1] - a[1]).map(([x, h]) => `${WENT[x]}${h >= 10 ? `（${Math.round(h)}時間）` : ''}`);
  const now = Object.keys(k.lessons).filter((x) => WENT[x] && activeLessonLoose(sim, k, x)).map((x) => WENT[x] + (k.lessons[x].free ? '（無料）' : ''));
  const bar = (v) => `<div class="bar" style="display:inline-block;width:70px;vertical-align:middle"><i style="width:${Math.round(v)}%"></i></div>`;
  let h = `<div class="section"><h4>子ども時代${k.est ? '<span class="sub">（生い立ちからの推定をふくむ）</span>' : ''}</h4><dl class="kv">`;
  h += `<dt>家の暮らし向き</dt><dd>${esc(TIER_NAME[k.tier] || 'ふつう')}${age < 14 ? '' : '（子どものころ）'}</dd>`;
  if (fav && KACT[fav]) h += `<dt>好きだった遊び</dt><dd>${esc(KACT[fav].s)}</dd>`;
  h += `<dt>伸びた経験</dt><dd>${top.length ? top.map(([e, v]) => `${esc(EXP[e])} ${Math.round(v)} ${bar(v)}`).join('<br>') : 'まだこれから'}</dd>`;
  h += `<dt>通った学び舎</dt><dd>${went.length ? esc(went.join('、')) : 'なし（家の手伝いと遊びで育った）'}</dd>`;
  if (now.length && age < 18) h += `<dt>いま通っている</dt><dd>${esc(now.join('、'))}</dd>`;
  if (k.sch) h += `<dt>奨学</dt><dd>王の奨学生（学費は国庫もち）</dd>`;
  if (k.events.length) h += `<dt>出来事</dt><dd>${esc(k.events.map((e) => EVENT_NAME[e] || e).join('、'))}</dd>`;
  if (k.earned) h += `<dt>稼いだ駄賃</dt><dd>${Math.round(k.earned)}銅貨</dd>`;
  if (k.job14) h += `<dt>14歳の職選び</dt><dd>${esc(jobName(k.job14.job))}${k.job14.ideal !== k.job14.job ? `（本当は${esc(jobName(k.job14.ideal))}になりたい）` : ''}</dd>`;
  else if (age < 14) { const rows = kidJobScores(sim, p).slice(0, 3); if (rows.length && Math.max(0, ...Object.values(k.xp)) >= 15) h += `<dt>向いていそうな職</dt><dd>${esc(rows.map((r) => jobName(r.j)).join('、'))}</dd>`; }
  h += '</dl></div>';
  return h;
}
function activeLessonLoose(sim, k, x) { const L = k.lessons[x]; return !!L && (L.until == null || L.until >= sim.today); }
export const KID_LABEL = { kid: '遊んでいる' };
export const KID_GO = { kid: '遊びに行くところ' };
void r1; void chooseYouthJob; void SENIOR_JOBS;
