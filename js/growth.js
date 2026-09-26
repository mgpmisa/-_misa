// 能力と技能の成長：行動した分だけ経験になり、人はそれぞれの道に特化していく
//
// ■ 状態（すべて遅延初期化。古いセーブでも最初の1時間で妥当な値を推定して作る）
//   p.stats  = { str 筋力, vit 体力, agi 敏捷, dex 器用, int 知力, wis 精神, cha 魅力 }  （表示・判定用。毎時計算し直す。ふつうの大人で10前後）
//   p.skills = { 剣術: 0〜100, 農耕: …, … }  （使うほど上がり、上がるほど伸びにくい。長く使わないと少し錆びる）
//   p.titles = ['剣の達人', …]               （特化の称号。語り草 p.deeds・記憶・速報にも残る）
//   p.gr     = { pot 素質, tr 鍛えた分, last 最後に使った日, rec 最近の伸び, walkH 歩いた時間, m 補正の控え, … }
//   p.aspire = 'adventurer' など            （技能が職業より伸びた人の「志」。guild.js・career.js が拾う）
//   c.stats  = { vet 歴戦, wit 知恵 }         （生き物：戦うほど強く、年を経るほど賢く）
//
// ■ 本体から呼ぶ関数
//   growthHourly(sim)            … newHour：その時の行動から経験を得る・仕事の腕を同期・能力値を計算
//   growthDaily(sim)             … newDay：錆び・称号・志・戦闘能力の更新
//   growthStats(sim, p)          … humanStats に掛ける補正 {hp, atk, def, spd, work, heal, talk, trade, evade}
//   growthAttack(sim, e, t, dmg) … stepCombat の一撃ごと：回避・盾受け・会心・技能の伸び。0 を返したら外れ
//   growthTalk(sim, a, b, eff)   … endTalk：魅力と話術で好感度の上がり方が変わる・話術が伸びる
//   growthLevelCheck(sim, p)     … sim.levelCheck の置き換え（ゆるやかな必要経験値 xpNeed）
//   learnAt(sim, p, kind, dt)    … 学び舎（'school' 学校, 'academy' 魔法学園, 'dojo' 道場）で学んでいる間、毎歩
//   moveMul(p) workMul(p) healMul(p) tradeMul(p) … 歩く速さ・仕事・回復量・売値の掛け算（控えを読むだけで軽い）
//   growthHtml(sim, p)           … 人物の詳細欄に差し込む HTML
import { clamp } from './rng.js';
import { JOBS } from './data.js';
import { ITEMS } from './items.js';
import { T, tileAt } from './world.js';
import { humanStats } from './society.js';

// ---------- 名前 ----------
export const STAT_NAME = { str: '筋力', vit: '体力', agi: '敏捷', dex: '器用', int: '知力', wis: '精神', cha: '魅力' };
const STAT_KEYS = Object.keys(STAT_NAME);
const BODY = new Set(['str', 'vit', 'agi']);

export const SKILL_LIST = [
  '剣術', '槍術', '斧術', '鈍器', '弓術', '短剣', '格闘', '盾', '攻撃魔法', '回復魔法', '祈り', '医術', '薬学',
  '鍛冶', '木工', '石工', '細工', '裁縫', '焼き物', '醸造', '料理', '農耕', '畜産', '採掘', '伐採', '狩猟', '釣り',
  '商い', '話術', '統率', '歌と楽器', '踊り', '絵画', '読み書き', '学問', '騎乗', '隠密', '盗み', '泳ぎ', '登山', '航海',
];
const COMBAT_SKILLS = ['剣術', '槍術', '斧術', '鈍器', '弓術', '短剣', '格闘'];

// 武器の種類 → 技能と、力の元になる能力
const WEAPON_SKILL = {
  dagger: '短剣', sword: '剣術', longsword: '剣術', greatsword: '剣術', dragonblade: '剣術', holysword: '剣術',
  spear: '槍術', axe: '斧術', mace: '鈍器', bow: '弓術', staff: '攻撃魔法',
};
const SKILL_POWER = { 剣術: ['str', 'dex'], 槍術: ['str', 'agi'], 斧術: ['str', 'vit'], 鈍器: ['str', 'vit'], 弓術: ['dex', 'agi'], 短剣: ['agi', 'dex'], 格闘: ['str', 'agi'], 攻撃魔法: ['int', 'wis'] };

// 職業 → [主な技能（W＝持っている武器の技能）, 鍛えられる能力, 副の技能]
const W = 'W';
const JOB_GROWTH = {
  king: ['統率', ['cha', 'wis'], '話術'], royal: ['話術', ['cha', 'int'], '騎乗'], noble: ['話術', ['cha', 'int'], '騎乗'],
  knight: [W, ['str', 'vit'], '騎乗'], soldier: [W, ['str', 'vit'], '盾'], guard: [W, ['vit', 'agi']], jailer: [W, ['vit', 'str']],
  farmer: ['農耕', ['str', 'vit']], rancher: ['畜産', ['str', 'vit']], hunter: ['狩猟', ['dex', 'agi'], '弓術'], fisher: ['釣り', ['dex', 'vit'], '泳ぎ'],
  woodcutter: ['伐採', ['str', 'vit']], miner: ['採掘', ['str', 'vit']], baker: ['料理', ['dex', 'vit']], smith: ['鍛冶', ['str', 'dex']],
  carpenter: ['木工', ['dex', 'str']], innkeeper: ['料理', ['cha', 'vit'], '商い'], merchant: ['商い', ['cha', 'int'], '話術'], tailor: ['裁縫', ['dex']],
  servant: ['料理', ['vit', 'dex']], priest: ['祈り', ['wis', 'cha'], '回復魔法'], elder: ['話術', ['wis', 'cha'], '統率'],
  wizard: ['攻撃魔法', ['int', 'wis'], '学問'], scholar: ['学問', ['int'], '読み書き'], adventurer: [W, ['vit', 'agi'], '隠密'],
  sailor: ['航海', ['vit', 'agi'], '泳ぎ'], thief: ['盗み', ['agi', 'dex'], '隠密'], wanderer: ['話術', ['vit', 'agi'], '登山'],
  beggar: ['話術', ['cha']], bard: ['歌と楽器', ['cha', 'dex'], '話術'],
  chancellor: ['学問', ['int', 'wis'], '話術'], treasurer: ['商い', ['int'], '読み書き'], general: ['統率', ['str', 'cha'], W],
  royalguard: [W, ['str', 'vit'], '盾'], courtmage: ['攻撃魔法', ['int', 'wis'], '学問'], butler: ['話術', ['dex', 'cha']],
  maid: ['裁縫', ['dex', 'vit'], '料理'], cook: ['料理', ['dex']], gardener: ['農耕', ['dex', 'vit']], jester: ['歌と楽器', ['cha', 'agi'], '話術'],
  gatekeeper: [W, ['vit', 'str']], militia: [W, ['vit']], doctor: ['医術', ['int', 'wis'], '薬学'], herbalist: ['薬学', ['int', 'dex']],
  midwife: ['医術', ['dex', 'wis']], teacher: ['学問', ['int', 'cha'], '読み書き'], scribe: ['読み書き', ['int', 'dex']], changer: ['商い', ['int']],
  butcher: ['料理', ['str', 'dex'], '商い'], brewer: ['醸造', ['vit', 'int']], cobbler: ['裁縫', ['dex']], potter: ['焼き物', ['dex']],
  weaver: ['裁縫', ['dex']], jeweler: ['細工', ['dex', 'int']], alchemist: ['薬学', ['int'], '学問'], fortune: ['話術', ['wis', 'cha']],
  painter: ['絵画', ['dex', 'cha']], musician: ['歌と楽器', ['dex', 'cha']], dancer: ['踊り', ['agi', 'cha']], stablehand: ['騎乗', ['str', 'vit'], '畜産'],
  messenger: ['騎乗', ['vit', 'agi']], watchman: [W, ['vit']], gravedigger: ['祈り', ['str', 'vit']], laundress: ['裁縫', ['vit']],
  nanny: ['料理', ['cha', 'wis']], barber: ['細工', ['dex', 'cha'], '話術'], storyteller: ['話術', ['cha', 'int'], '学問'], nun: ['回復魔法', ['wis'], '祈り'],
  shepherd: ['畜産', ['vit', 'agi']], beekeeper: ['畜産', ['dex']], miller: ['農耕', ['str']], charcoal: ['伐採', ['vit']], mason: ['石工', ['str', 'dex']],
  gatherer: ['薬学', ['agi', 'dex'], '登山'], captain: ['航海', ['int', 'cha'], '統率'], shipwright: ['木工', ['str', 'dex'], '航海'], keeper: ['航海', ['wis']],
  diver: ['泳ぎ', ['vit', 'agi']], pirate: ['航海', ['str', 'agi'], W], smuggler: ['商い', ['agi', 'cha'], '航海'],
  warrior: [W, ['str', 'vit']], archer: ['弓術', ['dex', 'agi']], cleric: ['回復魔法', ['wis'], '祈り'], sage: ['攻撃魔法', ['int', 'wis'], '回復魔法'],
  paladin: [W, ['str', 'wis'], '回復魔法'], guildmaster: ['統率', ['cha', 'str'], W], banditchief: ['統率', ['str', 'cha'], W],
  pickpocket: ['盗み', ['dex', 'agi'], '隠密'], swindler: ['話術', ['cha', 'int'], '商い'],
};
// 表にない職業（他の社員が足したもの）も、職業の性質から推定する
export function jobGrowth(job) {
  if (!job) return null;
  if (JOB_GROWTH[job]) return JOB_GROWTH[job];
  const J = JOBS[job] || {};
  if (J.combat) return [W, ['str', 'vit']];
  if (J.svc === 'heal') return ['医術', ['wis', 'int']];
  if (J.svc === 'entertain') return ['歌と楽器', ['cha', 'dex']];
  if (J.svc === 'teach') return ['学問', ['int', 'cha']];
  if (J.svc === 'trade' || J.svc === 'bank') return ['商い', ['int', 'cha']];
  if (J.research) return ['学問', ['int']];
  if (J.goods === 'medicine' || J.goods === 'herbs') return ['薬学', ['int', 'dex']];
  if (J.goods === 'wood') return ['伐採', ['str', 'vit']];
  if (J.goods === 'fish') return ['釣り', ['dex', 'vit']];
  if (J.goods) return ['細工', ['dex', 'str']];
  return ['話術', ['vit', 'cha']];
}

// ---------- 称号 ----------
const TITLES = [
  ['剣術', 70, '剣の達人'], ['剣術', 90, '剣聖'], ['槍術', 70, '槍の名手'], ['斧術', 70, '斧の豪傑'], ['鈍器', 70, '鉄槌の戦士'],
  ['弓術', 70, '弓の名手'], ['弓術', 90, '百発百中の射手'], ['短剣', 70, '短剣の使い手'], ['格闘', 70, '拳の達人'], ['盾', 70, '鉄壁'],
  ['攻撃魔法', 70, '大魔導師'], ['回復魔法', 70, '癒しの手'], ['祈り', 75, '篤信の人'], ['医術', 70, '名医'], ['薬学', 70, '薬の名人'],
  ['鍛冶', 92, '名工'], ['木工', 92, '名棟梁'], ['石工', 92, '石の名人'], ['細工', 92, '細工の名人'], ['裁縫', 92, '仕立ての名人'],
  ['焼き物', 92, '名陶工'], ['醸造', 92, '酒造りの名人'], ['料理', 85, '料理上手'], ['農耕', 92, '篤農家'], ['畜産', 92, '家畜の名人'],
  ['採掘', 92, '掘り名人'], ['伐採', 92, '森の達人'], ['狩猟', 85, '名狩人'], ['釣り', 92, '釣り名人'], ['商い', 92, '商売上手'],
  ['話術', 88, '弁舌家'], ['統率', 90, '名将'], ['歌と楽器', 85, '名演奏家'], ['踊り', 85, '舞の名手'], ['絵画', 85, '名画家'],
  ['読み書き', 92, '能筆家'], ['学問', 92, '碩学'], ['騎乗', 80, '名騎手'], ['隠密', 80, '影歩き'], ['盗み', 80, '盗みの名人'],
  ['泳ぎ', 70, '泳ぎの達者'], ['登山', 70, '山歩きの達人'], ['航海', 92, '名航海士'],
];
const STAT_TITLES = [['str', 17.5, '怪力'], ['vit', 17.5, '鉄の体'], ['agi', 16.5, '俊足'], ['dex', 17.5, '器用な手'], ['int', 17.5, '博識'], ['wis', 18.5, '徳の人'], ['cha', 17.5, '人気者']];
const WALK_TITLE_H = 260; // 旅に明け暮れた時間（毎時の見本で数える）で「健脚」

// ---------- 小さな道具 ----------
function hrand(id, salt) { // 人ごとに決まった乱数（世界の乱数の流れを乱さない）
  let x = (Math.imul((typeof id === 'number' ? id : String(id).length * 7919) + 1, 2654435761) ^ Math.imul(salt + 11, 40503)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; x = Math.imul(x, 3266489917) >>> 0; x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const hgauss = (id, salt) => (hrand(id, salt) + hrand(id, salt + 101) + hrand(id, salt + 202) - 1.5) * 2; // 平均0・幅±3
const r1 = (v) => Math.round(v * 10) / 10;
const isHuman = (e) => typeof e.id === 'number';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function weaponKey(p) {
  const w = p.eq?.weapon;
  return (w && WEAPON_SKILL[w.id]) || '格闘';
}
function mainSkillOf(p, g = jobGrowth(p.job)) {
  if (!g) return null;
  return g[0] === W ? weaponKey(p) : g[0];
}

// 年齢による能力の伸び縮み（体は35歳を過ぎると少しずつ落ち、精神は年とともに深まる）
function ageFactor(k, age) {
  if (BODY.has(k)) {
    if (age < 18) return 0.45 + 0.55 * Math.max(0, age) / 18;
    if (age <= 35) return 1;
    return Math.max(0.55, 1 - (age - 35) * 0.009);
  }
  if (k === 'dex') { if (age < 16) return 0.5 + 0.5 * age / 16; return age <= 50 ? 1 : Math.max(0.6, 1 - (age - 50) * 0.008); }
  if (k === 'int') { if (age < 16) return 0.55 + 0.45 * age / 16; return age <= 70 ? 1 : Math.max(0.7, 1 - (age - 70) * 0.01); }
  if (k === 'wis') return age < 16 ? 0.6 + 0.4 * age / 16 : 1;
  return age < 12 ? 0.8 : 1;
}
function statAt(p, k, age) {
  const g = p.gr;
  let v = ((g.pot[k] || 10) + (g.tr[k] || 0)) * ageFactor(k, age);
  if (k === 'wis') v += Math.min(4, Math.max(0, age - 25) * 0.07);
  return v;
}
function computeStats(sim, p) {
  const age = sim.ageOf(p);
  const s = p.stats || (p.stats = {});
  for (const k of STAT_KEYS) s[k] = r1(statAt(p, k, age));
  return s;
}

// ---------- 遅延初期化（いまの職業・年齢・レベル・装備から、これまでの人生で身についた分を推定する） ----------
export function ensureGrowth(sim, p) {
  if (p.gr && p.skills && p.stats) return p.gr;
  const S = sim.S, age = sim.ageOf(p), id = p.id;
  const pers = p.pers || { O: 0.5, C: 0.5, E: 0.5, A: 0.5, N: 0.5 };
  const vals = p.values || { faith: 0.5, courage: 0.5, ambition: 0.5 };
  // 素質：個人差＋性格。親がいれば親の素質を受け継ぐ（生まれたばかりの子）
  const pot = {};
  for (const [i, k] of STAT_KEYS.entries()) pot[k] = 10 + hgauss(id, i * 7 + 3) * 0.55;
  pot.int += (pers.O - 0.5) * 3; pot.cha += (pers.E - 0.5) * 2 + (pers.A - 0.5) * 1;
  pot.wis += ((vals.faith ?? 0.5) - 0.5) * 2 + (pers.C - 0.5) * 1; pot.dex += (pers.C - 0.5) * 1; pot.vit += (0.5 - pers.N) * 1;
  if (p.south) { pot.vit += 0.4; pot.agi += 0.3; } else { pot.str += 0.2; pot.int += 0.2; } // 土地の暮らしによる小さな差
  const par = [S.people[p.fatherId], S.people[p.motherId]].filter((q) => q?.gr?.pot);
  if (par.length && age <= 2) for (const k of STAT_KEYS) {
    const pm = par.reduce((s, q) => s + q.gr.pot[k], 0) / par.length;
    pot[k] = pm * 0.55 + 10 * 0.2 + pot[k] * 0.25;
  }
  for (const k of STAT_KEYS) pot[k] = r1(clamp(pot[k], 5, 16));
  const g = p.gr = { pot, tr: {}, last: {}, rec: {}, walkH: 0, sync: null, syncJob: null, v: 1 };
  const tr = g.tr, sk = p.skills = p.skills || {};
  const set = (k, v) => { if (v > 0.5) sk[k] = r1(Math.max(sk[k] || 0, clamp(v, 0, 95))); };
  const years = clamp(age - 16, 0, 30);
  // 暮らしで誰もが身につける分
  if (age >= 8) {
    tr.str = Math.min(0.8, (age - 8) * 0.06); tr.vit = Math.min(0.8, (age - 8) * 0.06);
    set('料理', age >= 14 ? 6 + hrand(id, 31) * 22 : 2);
    const rankRW = { king: 60, royal: 55, noble: 50, knight: 35, citizen: 22, adventurer: 18, commoner: 8, wanderer: 10 }[p.rank] ?? 8;
    set('読み書き', rankRW * Math.min(1, age / 16) + (p.skill?.study || 0) * 40);
    set('学問', rankRW * 0.5 * Math.min(1, age / 18) + (p.skill?.study || 0) * 25);
    set('話術', (6 + pers.E * 24) * Math.min(1, age / 18));
    set('祈り', (vals.faith ?? 0.5) * 25 * Math.min(1, age / 16));
    const town = sim.town ? sim.town(p.s) : null;
    set('泳ぎ', town?.type === 'port' ? 18 + hrand(id, 33) * 15 : 3 + hrand(id, 34) * 8);
    if (town?.type === 'village' && age >= 12) { set('農耕', 8 + hrand(id, 35) * 12); set('畜産', 3 + hrand(id, 36) * 8); }
    if (['king', 'royal', 'noble', 'knight'].includes(p.rank)) set('騎乗', 20 + years * 1.2);
  }
  // 職業の腕（既存の p.skill[職業] 0〜1 を 0〜100 に）と、仕事で鍛えた能力
  const jg = jobGrowth(p.job);
  if (jg && age >= 14) {
    const main = mainSkillOf(p, jg);
    const jobSk = (p.skill?.[p.job] ?? Math.min(0.9, 0.2 + years / 40)) * 100;
    if (jg[0] !== W) set(main, jobSk);
    if (jg[2]) set(jg[2] === W ? weaponKey(p) : jg[2], jobSk * 0.4);
    for (const k of jg[1]) tr[k] = (tr[k] || 0) + Math.min(3.5, years * 0.18);
  }
  // 武器の腕：戦う職業とレベルから
  const combat = JOBS[p.job]?.combat || 0;
  if (age >= 14 && (combat || p.eq?.weapon)) {
    const wk = weaponKey(p);
    set(wk, 6 + ((p.lv || 1) - 1) * 5 + combat * 5 + hrand(id, 41) * 8);
    if (wk === '攻撃魔法') tr.int = (tr.int || 0) + Math.min(2.5, combat * 0.6);
    else tr.str = (tr.str || 0) + Math.min(2.5, combat * 0.5);
    tr.vit = (tr.vit || 0) + Math.min(2, combat * 0.4); tr.agi = (tr.agi || 0) + Math.min(2, combat * 0.4);
    if (p.eq?.shield) set('盾', 5 + ((p.lv || 1) - 1) * 4 + combat * 3);
    if (wk !== '格闘') set('格闘', 4 + combat * 4);
  }
  if (['cleric', 'priest', 'nun', 'paladin', 'sage'].includes(p.job)) set('回復魔法', Math.max(sk['回復魔法'] || 0, 15 + years * 1.2));
  if (['thief', 'pickpocket', 'banditchief', 'pirate'].includes(p.job) || p.bandit) { set('隠密', 15 + years); set('盗み', 10 + years); }
  if (['wanderer', 'messenger', 'merchant', 'bard', 'adventurer'].includes(p.job)) g.walkH = Math.min(400, years * 12);
  for (const k of STAT_KEYS) tr[k] = r1(Math.min(6, tr[k] || 0));
  computeStats(sim, p);
  // もともと届いている称号は、黙って持たせる（最初の日に速報があふれないように）
  checkTitles(sim, p, true);
  p.titles = p.titles || [];
  return g;
}

// ---------- 伸び方 ----------
const BASE_SKILL = 0.08;  // 技能0の人が1時間使ったときの伸び（上がるほど二乗で鈍る）
const BASE_STAT = 0.004;  // 能力値を1時間鍛えたときの伸び（鍛えた分は最大+12まで、上がるほど鈍る）
function learnMul(sim, p) {
  const age = sim.ageOf(p), g = p.gr;
  const ageM = age < 12 ? 1.2 : age < 22 ? 1.3 : age < 32 ? 1.1 : age < 50 ? 1 : age < 65 ? 0.8 : 0.6;
  return (0.7 + (p.stats?.int ?? 10) * 0.03) * (0.8 + (p.pers?.O ?? 0.5) * 0.4) * ageM * (g.mb || 1);
}
export function gainSkill(sim, p, k, hours, rate = 1) {
  if (!k || hours <= 0) return 0;
  const g = p.gr, sk = p.skills;
  const s = sk[k] || 0;
  const u = Math.max(0, 1 - s / 105);
  const d = BASE_SKILL * rate * hours * u * u * learnMul(sim, p);
  sk[k] = Math.min(100, s + d);
  // 行動した時間そのものが経験値になる（戦いと魔法は濃い経験、暮らしの技は薄い経験）
  p.xp = (p.xp || 0) + hours * rate * (XP_RICH.has(k) ? 1.5 : 0.5);
  g.last[k] = sim.today;
  g.rec[k] = (g.rec[k] || 0) + d;
  return d;
}
const XP_RICH = new Set(['剣術', '槍術', '斧術', '鈍器', '弓術', '短剣', '格闘', '盾', '攻撃魔法', '回復魔法']);

// ---------- レベル ----------
// 次のレベルに必要な経験値。旧式（20×Lv×Lv：Lv5→500、Lv8→1280）はきつすぎて誰も上がらなかったので、
// ゆるやかな曲線にする（Lv1→40、Lv2→70、Lv3→112、Lv5→222、Lv8→443、Lv10→622、Lv20→1840）
export const xpNeed = (lv) => Math.round(15 * Math.pow(lv, 1.6) + 25);
// sim.levelCheck の置き換え（一度に何段も上がれる。上限Lv60）
export function growthLevelCheck(sim, p) {
  let up = 0;
  while ((p.xp || 0) >= xpNeed(p.lv || 1) && (p.lv || 1) < 60) { p.xp -= xpNeed(p.lv || 1); p.lv = (p.lv || 1) + 1; up++; }
  if (!up) return;
  Object.assign(p, humanStats(sim, p));
  p.hp = Math.min(p.maxhp, p.hp + 20 * up);
  if (p.needs) p.needs.esteem = Math.min(100, p.needs.esteem + 10 * up);
  if (p.lv % 3 === 0 || p.lv >= 10) {
    sim.remember(p, `鍛錬と経験を重ねて、また一段強くなった（Lv${p.lv}）`, { emo: 0.6, imp: 0.5, k: 'level' });
    if (p.needs) p.needs.esteem = Math.min(100, p.needs.esteem + 20);
  }
  if (p.lv === 20 || p.lv === 30) { (p.deeds = p.deeds || []).push(`${sim.year()}年、Lv${p.lv}に達した`); p.fame = (p.fame || 0) + 5; }
}

export function gainStat(p, k, hours, rate = 1) {
  const g = p.gr, t = g.tr[k] || 0;
  const u = Math.max(0, 1 - t / 12);
  g.tr[k] = t + BASE_STAT * rate * hours * u * u;
}
function train(sim, p, hours, skills, stats) {
  for (const [k, r] of skills) gainSkill(sim, p, k, hours, r);
  for (const [k, r] of stats) gainStat(p, k, hours, r);
}

// 行動の型 → 伸びる技能と能力（1時間あたり）
const ACT_GAIN = {
  pray: [[['祈り', 1]], [['wis', 1]]],
  tavern: [[['話術', 0.3]], [['cha', 0.3]]],
  plaza: [[['話術', 0.2]], [['cha', 0.2]]],
  festival: [[['踊り', 0.4], ['歌と楽器', 0.3]], [['cha', 0.4], ['agi', 0.2]]],
  perform: [[['歌と楽器', 1.2]], [['cha', 0.8], ['dex', 0.4]]],
  storytell: [[['話術', 1], ['学問', 0.3]], [['cha', 0.5], ['int', 0.3]]],
  school: [[['読み書き', 1], ['学問', 0.6]], [['int', 0.8]]],
  play: [[['登山', 0.1]], [['agi', 0.8], ['vit', 0.5]]],
  stroll: [[], [['vit', 0.3]]],
  patrol: [[[W, 0.25]], [['vit', 0.6], ['agi', 0.2]]],
  gather: [[['薬学', 0.8], ['登山', 0.2]], [['agi', 0.3], ['dex', 0.3]]],
  quest: [[['隠密', 0.3], ['登山', 0.2]], [['vit', 0.6], ['agi', 0.4]]],
  steal: [[['盗み', 2], ['隠密', 1.5]], [['agi', 1], ['dex', 0.8]]],
  beg: [[['話術', 0.3]], [['cha', 0.1]]],
  cook: [[['料理', 1]], [['dex', 0.3]]],
  water: [[], [['str', 0.6], ['vit', 0.6]]],
  laundry: [[['裁縫', 0.2]], [['vit', 0.4]]],
  preserve: [[['料理', 0.8]], [['dex', 0.2]]],
  trade: [[['商い', 0.8], ['話術', 0.3]], [['cha', 0.2], ['int', 0.2]]],
  travel: [[], [['vit', 0.4]]],
};
const LEARN_KIND = {
  school: [[['読み書き', 1.2], ['学問', 1]], [['int', 1]]],
  academy: [[['攻撃魔法', 1], ['回復魔法', 0.8], ['学問', 0.8]], [['int', 1], ['wis', 0.8]]],
  dojo: [[[W, 1.4], ['格闘', 0.6], ['盾', 0.4]], [['str', 1], ['agi', 0.8], ['vit', 0.8]]],
};
const resolveSk = (p, k) => (k === W ? weaponKey(p) : k);

// 学び舎での学習（毎歩呼ばれる。dt は分）
export function learnAt(sim, p, kind, dt) {
  if (!p || p.deathYear != null) return;
  ensureGrowth(sim, p);
  const L = LEARN_KIND[kind] || LEARN_KIND.school;
  const hr = dt / 60;
  const teacher = 1.3; // 先生について学ぶと、独りでやるより伸びる
  for (const [k, r] of L[0]) gainSkill(sim, p, resolveSk(p, k), hr, r * teacher);
  for (const [k, r] of L[1]) gainStat(p, k, hr, r);
  p.gr.la = sim.S.t;
}

// ---------- 仕事の腕の同期（既存の p.skill[職業] 0〜1 は残し、新しい技能から計算し直す） ----------
function syncJobSkill(sim, p) {
  const g = p.gr, jg = jobGrowth(p.job);
  if (!jg || jg[0] === W || !p.skill) { g.sync = null; g.syncJob = null; return; }
  const k = jg[0], cur = p.skill[p.job] ?? 0;
  if (g.syncJob !== p.job) {
    p.skills[k] = Math.max(p.skills[k] || 0, cur * 100);       // 転職・弟子入りで新しく付いた腕
  } else if (g.sync != null && Math.abs(cur - g.sync) > 1e-9) {
    if (cur > g.sync) p.skills[k] = Math.min(100, (p.skills[k] || 0) + Math.min(0.5, (cur - g.sync) * 30)); // 鍛冶の一打・修業など外からの伸び（3割だけ取り込み、1時間0.5まで）
    else p.skills[k] = cur * 100;                                 // 外から下げられた（転職など）
  }
  const v = Math.round(clamp((p.skills[k] || 0) / 100, 0, 1) * 10000) / 10000;
  p.skill[p.job] = v; g.sync = v; g.syncJob = p.job;
}

// ---------- 能力と技能の効き目 ----------
const NEUTRAL = { hp: 1, atk: 1, def: 1, spd: 1, work: 1, heal: 1, talk: 0, trade: 1, evade: 0.03 };
export function growthStats(sim, p) {
  if (!p || !p.gr || !p.stats) return NEUTRAL;
  const age = clamp(sim.ageOf(p), 18, 70); // 子どもと老人の弱さは humanStats が別に掛ける
  const st = (k) => statAt(p, k, age);
  const sk = p.skills;
  const wk = weaponKey(p), ws = sk[wk] || 0;
  const pw = SKILL_POWER[wk] || ['str', 'dex'];
  const pstat = st(pw[0]) * 0.65 + st(pw[1]) * 0.35;
  const jg = jobGrowth(p.job);
  const js = jg ? jg[1].reduce((s, k) => s + st(k), 0) / jg[1].length : 10;
  const m = {
    hp: clamp(1 + (st('vit') - 10) * 0.022, 0.8, 1.35),
    atk: clamp(1 + (pstat - 10) * 0.018 + (ws - 30) * 0.003, 0.8, 1.45),
    def: clamp(1 + (st('vit') - 10) * 0.012 + (p.eq?.shield ? ((sk['盾'] || 0) - 20) * 0.002 : 0), 0.85, 1.3),
    spd: clamp(1 + ((p.stats.agi ?? 10) - 10) * 0.01 + Math.min(0.05, (p.gr.walkH || 0) / 5000), 0.85, 1.2),
    work: clamp(1 + (js - 10) * 0.015, 0.85, 1.25),
    heal: clamp(1 + Math.max(sk['回復魔法'] || 0, sk['医術'] || 0) / 100 * 0.6 + (st('wis') - 10) * 0.015, 0.8, 1.8),
    talk: clamp(((p.stats.cha ?? 10) - 10) * 0.15 + ((sk['話術'] || 0) - 20) * 0.03, -1.5, 3),
    trade: clamp(1 + ((sk['商い'] || 0) - 20) * 0.0015 + ((p.stats.cha ?? 10) - 10) * 0.004, 0.95, 1.15),
    evade: clamp(0.03 + (st('agi') - 10) * 0.006 + (wk === '短剣' || wk === '格闘' ? ws * 0.0006 : 0), 0.01, 0.2),
  };
  Object.defineProperty(p.gr, 'm', { value: m, writable: true, configurable: true, enumerable: false }); // 控え（保存しない）
  return m;
}
export const moveMul = (p) => p.gr?.m?.spd || 1;
export const workMul = (p) => p.gr?.m?.work || 1;
export const healMul = (p) => p.gr?.m?.heal || 1;
export const tradeMul = (p) => p.gr?.m?.trade || 1;

// 生き物の成長：戦うほど強く（歴戦）、年を経るほど賢く（身のこなし）
function creatureStats(c) {
  const s = c.stats || (c.stats = { vet: 0, wit: 0 });
  s.wit = Math.min(0.05, (c.age || 0) / 8000);
  return s;
}

// ---------- 戦闘の一撃ごと（stepCombat から） ----------
export function growthAttack(sim, e, t, dmg) {
  const R = sim.rng, eh = isHuman(e), th = isHuman(t);
  if (eh && !e.gr) return dmg; if (th && !t.gr) return dmg;
  const wk = eh ? weaponKey(e) : null;
  const ws = eh ? (e.skills[wk] || 0) : 0;
  const cs = !eh ? creatureStats(e) : null, ct = !th ? creatureStats(t) : null;
  // 回避：守る側の身のこなし − 攻める側の腕と器用さ
  let ev = th ? (t.gr.m?.evade ?? 0.03) : 0.03 + ct.wit + ct.vet * 0.004;
  if (eh) ev -= ((e.stats.dex ?? 10) - 10) * 0.004 + ws * 0.0004;
  if (R.chance(clamp(ev, 0.01, 0.25))) {
    if (th) { gainStat(t, 'agi', 0.3); t.gr.fought = sim.S.t; }
    if (eh) { gainSkill(sim, e, wk, 0.15); e.gr.fought = sim.S.t; }
    return 0;
  }
  // 盾で受ける
  if (th && t.eq?.shield && R.chance(0.08 + (t.skills['盾'] || 0) * 0.0022)) {
    dmg = Math.max(1, Math.round(dmg * 0.45));
    gainSkill(sim, t, '盾', 0.4); gainStat(t, 'vit', 0.2); gainStat(t, 'str', 0.1);
  }
  // 会心の一撃（腕が上がるほど出やすい）
  if (eh && R.chance(ws * 0.0008)) dmg = Math.round(dmg * 1.5);
  // 歴戦の魔物・獣は一撃が重い
  if (!eh) { dmg = Math.round(dmg * (1 + Math.min(0.1, cs.vet * 0.02))); cs.vet = Math.min(5, cs.vet + 0.01); }
  if (!th) ct.vet = Math.min(5, ct.vet + 0.01);
  // 学び：攻めた側は武器の技能と力、受けた側は打たれ強さ
  if (eh) {
    const pw = SKILL_POWER[wk] || ['str', 'dex'];
    gainSkill(sim, e, wk, 0.4); gainStat(e, pw[0], 0.3); gainStat(e, pw[1], 0.15);
    e.gr.fought = sim.S.t;
  }
  if (th) { gainStat(t, 'vit', 0.2); t.gr.fought = sim.S.t; }
  return dmg;
}

// ---------- 会話（endTalk から、好感度を反映する前に） ----------
export function growthTalk(sim, a, b, eff) {
  if (!a?.gr || !b?.gr || !eff) return;
  // a の b への気持ち（daA）は、b の魅力と話しぶりで良くなる
  const ta = b.gr.m?.talk || 0, tb = a.gr.m?.talk || 0;
  if (typeof eff.daA === 'number') eff.daA += eff.daA >= 0 ? ta : ta * 0.5;
  if (typeof eff.daB === 'number') eff.daB += eff.daB >= 0 ? tb : tb * 0.5;
  for (const p of [a, b]) { gainSkill(sim, p, '話術', 0.1); gainStat(p, 'cha', 0.05); }
}

// ---------- 1時間ごと ----------
const WATERISH = new Set([T.SEA, T.DEEP, T.RIVER, T.BEACH]);
function nearWater(w, x, z) {
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (WATERISH.has(tileAt(w, x + dx, z + dz))) return true;
  return false;
}
export function growthHourly(sim) {
  const S = sim.S, w = S.world, summer = sim.seasonIdx?.() === 1;
  for (const p of sim.living()) {
    if (p.jail != null && p.gr) { computeStats(sim, p); continue; }
    const fresh = !p.gr;
    ensureGrowth(sim, p);
    const g = p.gr, a = p.action, age = sim.ageOf(p);
    g.mb = 1;
    // 師匠と一緒にいると伸びが速い
    let master = null;
    if (p.master != null) {
      master = S.people[p.master];
      if (master && master.deathYear == null && ((p.inside != null && master.inside === p.inside) || Math.abs(master.pos.x - p.pos.x) + Math.abs(master.pos.z - p.pos.z) < 5)) g.mb = 1.6;
      else master = null;
    }
    if (a && age >= 3 && !p.fight) {
      if (a.phase === 'walk') {
        // 歩く・走る：体力と敏捷。山・雪・砂漠・沼は足腰がよく鍛えられる
        const tile = tileAt(w, Math.round(p.pos.x), Math.round(p.pos.z));
        const hard = tile === T.ROCK || tile === T.SNOW || tile === T.PEAK;
        const rough = hard || tile === T.DESERT || tile === T.SWAMP || tile === T.JUNGLE || tile === T.DENSE;
        const run = a.type === 'flee' || p.mission?.type === 'march';
        gainStat(p, 'vit', rough ? 0.9 : 0.5); gainStat(p, 'agi', run ? 0.6 : 0.25);
        if (hard) gainSkill(sim, p, '登山', 1);
        if (p.mission?.type === 'march' || a.type === 'travel' || a.type === 'trade') g.walkH = (g.walkH || 0) + 1;
        g.walkH = (g.walkH || 0) + 0.5;
      } else if (a.type === 'work' && p.job) {
        const jg = jobGrowth(p.job);
        const main = mainSkillOf(p, jg);
        const combatJob = jg[0] === W;
        gainSkill(sim, p, main, 1, combatJob ? 0.35 : 1);      // 兵士の勤めは実戦ほどは腕が上がらない
        if (jg[2]) gainSkill(sim, p, resolveSk(p, jg[2]), 1, 0.35);
        for (const k of jg[1]) gainStat(p, k, 1, 0.8);
        if ((p.job === 'fisher' || p.job === 'diver') && summer) gainSkill(sim, p, '泳ぎ', 0.5);
        // 師匠の手ほどき：師匠の腕に届くまでは、そばで見て覚える
        if (master && master.skills && (master.skills[main] || 0) > (p.skills[main] || 0)) gainSkill(sim, p, main, 0.6);
        if (master) { gainSkill(sim, master, '話術', 0.1); }
      } else if (a.type === 'help' && a.friend != null) {
        const par = S.people[a.friend];
        const jg = par && jobGrowth(par.job);
        if (jg) { gainSkill(sim, p, mainSkillOf(par, jg), 1, 0.5); for (const k of jg[1]) gainStat(p, k, 1, 0.4); }
      } else if (a.type === 'train') {
        // 鍛錬：持っている武器の型と、体づくり
        gainSkill(sim, p, weaponKey(p), 1, 0.8); if (p.eq?.shield) gainSkill(sim, p, '盾', 1, 0.4);
        gainStat(p, 'str', 1); gainStat(p, 'vit', 0.8); gainStat(p, 'agi', 0.6);
      } else if ((a.type === 'school' || a.type === 'academy' || a.type === 'dojo') && g.la != null && S.t - g.la < 60) {
        // learnAt が呼ばれている間は、そちらで数える
      } else if (ACT_GAIN[a.type]) {
        const [sks, sts] = ACT_GAIN[a.type];
        train(sim, p, 1, sks.map(([k, r]) => [resolveSk(p, k), r]), sts);
        if ((a.type === 'stroll' || a.type === 'play') && summer && !p.inside && nearWater(w, Math.round(p.pos.x), Math.round(p.pos.z))) { gainSkill(sim, p, '泳ぎ', 1); gainStat(p, 'vit', 0.4); }
      }
    }
    // 戦いを生き延びた：経験になる。深手を負ったら、次は慎重に
    if (g.fought != null && !p.fight && S.t - g.fought > 3) {
      if (p.hp < p.maxhp * 0.3) {
        if (p.values) p.values.courage = Math.max(0.05, p.values.courage - 0.02);
        gainStat(p, 'wis', 1);
        if (sim.rng.chance(0.4)) sim.remember(p, '危ないところだった。次はもっと慎重に戦おう', { emo: -0.3, imp: 0.45, k: 'fight' });
      } else {
        p.xp = (p.xp || 0) + 2; sim.levelCheck?.(p);
      }
      g.fought = null;
    }
    // 学校と先生の授業でたまる既存の p.skill.study（0〜1）を、読み書き・学問・知力の伸びに換える
    const study = p.skill?.study || 0;
    if (g.study == null) g.study = study;
    else if (study > g.study) {
      const d = (study - g.study) * 100;
      gainSkill(sim, p, '読み書き', d * 1.5); gainSkill(sim, p, '学問', d); gainStat(p, 'int', d * 1.2);
      g.study = study;
    } else g.study = study;
    syncJobSkill(sim, p);
    computeStats(sim, p);
    if (fresh) { growthStats(sim, p); Object.assign(p, humanStats(sim, p)); }
    else growthStats(sim, p);
  }
}

// ---------- 1日ごと ----------
export function growthDaily(sim) {
  const S = sim.S, today = sim.today;
  for (const p of sim.living()) {
    if (!p.gr) continue;
    const g = p.gr, sk = p.skills;
    // 錆び：20日使わない技能は、ゆっくり（高いほど早く）落ちる。ただし身についた分の6割は残る
    for (const k of Object.keys(sk)) {
      const last = g.last[k];
      if (last == null) { g.last[k] = today; continue; }
      if (today - last > 20 && sk[k] > 15) sk[k] = Math.max(15, sk[k] - 0.03 * (sk[k] / 50));
      if (sk[k] < 0.5) delete sk[k]; else sk[k] = Math.round(sk[k] * 1000) / 1000;
    }
    for (const k of Object.keys(g.rec)) { g.rec[k] = Math.round(g.rec[k] * 800) / 1000; if (g.rec[k] < 0.02) delete g.rec[k]; }
    // 体の鍛えた分は、使わなければ少しずつ抜ける
    for (const k of BODY) if (g.tr[k]) g.tr[k] *= 0.999;
    for (const k of STAT_KEYS) if (g.tr[k]) g.tr[k] = Math.round(g.tr[k] * 1000) / 1000;
    g.walkH = Math.round(g.walkH || 0);
    computeStats(sim, p);
    checkTitles(sim, p, false);
    checkAspire(sim, p);
    growthLevelCheck(sim, p);
    growthStats(sim, p);
    Object.assign(p, humanStats(sim, p));
  }
}

// ---------- 称号 ----------
function checkTitles(sim, p, silent) {
  const got = p.titles || (p.titles = []);
  const age = sim.ageOf(p);
  const earn = [];
  const has = (t) => got.includes(t);
  for (const [k, v, t] of TITLES) if ((p.skills[k] || 0) >= v && !has(t)) earn.push([t, k]);
  if (age >= 16) for (const [k, v, t] of STAT_TITLES) if ((p.stats[k] || 0) >= v && !has(t)) earn.push([t, k]);
  if ((p.gr.walkH || 0) >= WALK_TITLE_H && !has('健脚')) earn.push(['健脚', null]);
  for (const [t, k] of earn) {
    got.push(t);
    if (silent) continue;
    const town = sim.townOf?.(p);
    p.fame = (p.fame || 0) + 6;
    p.needs && (p.needs.esteem = Math.min(100, p.needs.esteem + 30));
    p.deeds = p.deeds || [];
    p.deeds.push(`${sim.year()}年、「${t}」と呼ばれるようになった`);
    sim.remember(p, `みんなに「${t}」と呼ばれるようになった。${k && STAT_NAME[k] ? '体が応えてくれている' : 'これまでの積み重ねが実を結んだ'}`, { emo: 0.7, imp: 0.7, k: 'title' });
    if (town) sim.gossip(p, `「${t}」と呼ばれているらしい`, 0.5, sim.living().filter((q) => q.s === p.s && q !== p), { congrat: `「${t}」だなんて、すごいね`, silent: true });
    if (k && !STAT_NAME[k] && (COMBAT_SKILLS.includes(k) || ['攻撃魔法', '回復魔法', '医術', '盾'].includes(k) || (p.skills[k] || 0) >= 92)) sim.news(`${town?.name || ''}の${sim.fullName(p)}が「${t}」と呼ばれるようになった`, 1, p.pos);
    else sim.pushLog?.(`${sim.fullName(p)}が「${t}」と呼ばれるようになった。`, 'event', [p.id], p.pos);
  }
}

// ---------- 志（技能が職業より伸びた人が、道を変えたくなる） ----------
const ENTERTAIN = new Set(['bard', 'musician', 'jester', 'dancer']);
function checkAspire(sim, p) {
  if (p.aspire || !p.job) return;
  const age = sim.ageOf(p);
  if (age < 16 || age > 35 || ['king', 'royal', 'noble'].includes(p.rank)) return;
  const sk = p.skills, J = JOBS[p.job] || {};
  const jobSk = p.skill?.[p.job] ? p.skill[p.job] * 100 : 0;
  let pick = null;
  const bestCombat = COMBAT_SKILLS.reduce((b, k) => ((sk[k] || 0) > (sk[b] || 0) ? k : b), '剣術');
  if (!J.combat && (sk[bestCombat] || 0) >= 35 && (sk[bestCombat] || 0) > jobSk && (p.values?.courage ?? 0) > 0.5) {
    pick = [bestCombat === '弓術' ? 'archer' : bestCombat === '斧術' ? 'warrior' : 'adventurer', `${bestCombat}の腕を試したい。いっそ冒険者になって、自分の力で生きていきたい`];
  } else if (!['cleric', 'priest', 'nun', 'paladin', 'sage', 'doctor'].includes(p.job) && (sk['回復魔法'] || 0) >= 35) {
    pick = ['cleric', '祈りの力で人の傷を癒やせる。いつか僧侶として人を助けたい'];
  } else if (!['wizard', 'sage', 'courtmage'].includes(p.job) && (sk['攻撃魔法'] || 0) >= 35) {
    pick = ['wizard', '魔法の手応えが忘れられない。魔法使いの道に進みたい'];
  } else if (!ENTERTAIN.has(p.job) && (sk['歌と楽器'] || 0) >= 45 && (sk['歌と楽器'] || 0) > jobSk) {
    pick = ['bard', '歌で食べていけたら……。吟遊詩人として旅に出てみたい'];
  } else if (!['merchant', 'changer', 'treasurer', 'smuggler'].includes(p.job) && (sk['商い'] || 0) >= 50 && (sk['商い'] || 0) > jobSk) {
    pick = ['merchant', '商いの勘には自信がある。自分の店を持ちたい'];
  }
  if (!pick || !sim.rng.chance(0.05)) return;
  p.aspire = pick[0]; p.aspireDay = sim.today;
  sim.remember(p, pick[1], { emo: 0.5, imp: 0.65, k: 'career' });
}

// ---------- 画面（人物の詳細欄） ----------
export function growthHtml(sim, p) {
  if (!p?.gr || !p.stats) return '';
  const st = p.stats, g = p.gr;
  const bar = (label, v, max, tip) => `<span title="${esc(tip)}">${esc(label)}</span><div class="bar"><i class="${v / max < 0.3 ? 'low' : v / max < 0.5 ? 'mid' : ''}" style="width:${Math.round(clamp(v / max, 0, 1) * 100)}%"></i></div>`;
  let h = `<div class="section"><h4>能力と技能</h4>`;
  if (p.titles?.length) h += `<div class="traits" style="margin-bottom:6px">${p.titles.map((t) => `<span class="trait">${esc(t)}</span>`).join('')}</div>`;
  h += `<div class="bars">${STAT_KEYS.map((k) => bar(`${STAT_NAME[k]} ${st[k].toFixed(1)}`, st[k], 20, `素質 ${g.pot[k]} ＋鍛錬 ${r1(g.tr[k] || 0)}`)).join('')}</div>`;
  const top = Object.entries(p.skills || {}).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const grade = (v) => (v >= 90 ? '極み' : v >= 70 ? '達人' : v >= 50 ? '熟練' : v >= 30 ? '一人前' : v >= 12 ? '見習い' : 'かじった程度');
  h += `<dl class="kv" style="margin-top:8px">${top.map(([k, v]) => {
    const rec = g.rec[k] || 0;
    const trend = rec >= 1 ? '<b class="up">ぐんぐん伸びている</b>' : rec >= 0.2 ? '<span class="up">伸びている</span>' : rec >= 0.03 ? '少しずつ' : (sim.today - (g.last[k] ?? sim.today)) > 20 ? '<span class="dead">錆びつき気味</span>' : '足踏み';
    return `<dt>${esc(k)}</dt><dd>${v.toFixed(1)}（${grade(v)}）　${trend}${rec >= 0.03 ? `（+${rec.toFixed(1)}）` : ''}</dd>`;
  }).join('') || '<dt>技能</dt><dd>まだ何も身についていない</dd>'}`;
  const m = g.m;
  if (m && sim.ageOf(p) >= 14) h += `<dt>戦いぶり</dt><dd>攻め×${m.atk.toFixed(2)}　守り×${m.def.toFixed(2)}　かわす${Math.round(m.evade * 100)}%</dd><dt>足の速さ</dt><dd>×${m.spd.toFixed(2)}${(g.walkH || 0) > 40 ? `（旅の経験 ${Math.round(g.walkH)}時間）` : ''}</dd>`;
  h += `<dt>経験</dt><dd>Lv${p.lv || 1}　次まで ${Math.max(0, Math.ceil(xpNeed(p.lv || 1) - (p.xp || 0)))}</dd>`;
  if (p.aspire) h += `<dt>志</dt><dd>${esc(JOBS[p.aspire]?.name || p.aspire)}になりたい</dd>`;
  h += `</dl></div>`;
  return h;
}
// 生き物の詳細欄用（1行）
export function growthCreatureHtml(c) {
  const s = c?.stats;
  if (!s || (s.vet < 0.05 && s.wit < 0.01)) return '';
  const vet = s.vet >= 2 ? '歴戦の古強者' : s.vet >= 0.5 ? '戦い慣れている' : s.vet >= 0.05 ? '少し戦いを知っている' : '';
  const wit = s.wit >= 0.04 ? '長く生きて抜け目がない' : s.wit >= 0.02 ? '年季が入っている' : '';
  return `<dl class="kv"><dt>経験</dt><dd>${[vet, wit].filter(Boolean).join('・')}</dd></dl>`;
}
