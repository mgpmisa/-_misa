// 冒険者の職業（クラス）とパーティの輪の色
//
// ■ 状態（すべて遅延初期化。古いセーブでも advClassDaily か advClassOf を呼べば決まる）
//   p.advClass    = 'swordsman' など（下の ADV_CLASSES のキー）。冒険者でなくなったら消す
//   p.advClassJob = 決めたときの職業（職業が変わったら決め直す）
//   pt.ci         = パーティの輪の色の番号（S.advParties[id].ci。結成後はじめて色を聞かれたときに決める）
//
// ■ 本体から呼ぶ関数
//   advClassDaily(sim)            … newDay（partiesDaily のあと）と load のあと：全員の職業を決める・見直す
//   advClassOf(sim, p)            … その人の職業（なければその場で決める）。冒険者でなければ null
//   advClassName(p)               … 表示名（剣士 など）。なければ ''
//   advRole(p)                    … パーティでの役目（前衛・後衛・回復・魔法・遊撃・斥候）
//   advReach(e)                   … 戦いの間合い（魔法使い・魔導士・弓使いは遠くから撃つ）
//   advOnAttack(sim, e, t, dmg)   … 一撃ごと：職業ごとの小さな差（僧侶は仲間を癒す など）
//   advExploreMul(sim, p)         … ダンジョン探索の力の倍率（シーフの罠外し・鍵開け）
//   advTreasureBonus(sim, p)      … 宝物を見つける確率の上乗せ（シーフ）
//   partyColor(sim, pt)           … { hex, name } パーティの輪の色（生きているパーティどうしで重ならない）
//   partyRingOf(sim, p)           … 輪を出すべきなら { key, hex }、出さないなら null（描画側が毎フレーム呼ぶ。軽い）
//   advClassRows(sim, p, link)    … 人の詳細欄に入れる <dt><dd> の行（職業とパーティ）
//   advClassText(sim, p)          … 同じ内容の文（ログ・試験用）
//
// お金の出入りはない（職業は見た目と戦い方の小さな差だけ）。
import { JOBS } from './data.js';

export const ADV_CLASSES = {
  swordsman: { name: '剣士', role: '前衛', look: '青い上着に鉢巻き、背丈ほどの大剣' },
  hero: { name: '勇者', role: '前衛', look: '金の額冠と赤いマント、剣と青い盾' },
  fighter: { name: '戦士', role: '前衛', look: '毛皮の胴着、むき出しの腕に大斧' },
  monk: { name: '武闘家', role: '前衛', look: '道着に黒帯、赤い鉢巻き、拳に白い布、裸足' },
  squire: { name: '騎士見習い', role: '前衛', look: '鉄の鍋兜に鎖かたびら、紋章の前垂れ、剣と盾' },
  bandit: { name: '盗賊', role: '遊撃', look: '赤いバンダナ、毛皮、むき出しの腕に斧か短剣' },
  thief: { name: 'シーフ', role: '斥候', look: '臙脂か焦げ茶の頭巾と口当て、細身、腰の道具袋と鍵束、短刀' },
  archer: { name: '弓使い', role: '後衛', look: '羽根付き帽子か緑の頭巾、弓と矢筒' },
  wizard: { name: '魔法使い', role: '魔法', look: 'とんがり帽子とローブ、玉の付いた杖' },
  sorcerer: { name: '魔導士', role: '魔法', look: '青系の頭巾付きローブに金の縁取りと胸の光る紋、分厚い魔導書' },
  priest: { name: '僧侶', role: '回復', look: '白い法衣と金の帯、白い司教帽、聖印の杖' },
  paladin: { name: '聖騎士', role: '前衛', look: '白い板金鎧と白い盾' },
};
// 見た目を描き分ける職業（sprites.js・anim_people.js の outfitOf が 'adv_' + 職業 を返す）。
// 戦士・弓使い・聖騎士は、今ある職業の装い（warrior・archer・paladin）をそのまま使う。
export const ADV_DRAWN = ['swordsman', 'hero', 'monk', 'squire', 'bandit', 'thief', 'wizard', 'sorcerer', 'priest'];
export const ADV_OUTFIT = { fighter: 'warrior', archer: 'archer', paladin: 'paladin' };

const ADV_JOBS = new Set(['adventurer', 'warrior', 'archer', 'cleric', 'sage', 'paladin']);
export const isAdvJob = (job) => !!job && job !== 'guildmaster' && (ADV_JOBS.has(job) || JOBS[job]?.rank === 'adventurer');

// 職業 → なれる職業と、その上乗せ点
const JOB_BIAS = {
  warrior: { swordsman: 2.1, fighter: 1.5, monk: 1.9, bandit: 1.8, squire: 1.7 },
  archer: { archer: 3, thief: 2.6 },
  cleric: { priest: 5, monk: 1.2 },
  sage: { sorcerer: 3.4, wizard: 3.2, priest: 0.5 },
  adventurer: { swordsman: 0.9, fighter: 0.7, monk: 1.1, bandit: 1.5, thief: 1.8, archer: 0.9, squire: 1.3, wizard: 0, sorcerer: 0, priest: 0 },
};
const SWORDS = new Set(['sword', 'longsword', 'greatsword', 'dragonblade', 'holysword']);

// 整数のハッシュ（同じ人ならいつも同じ揺らぎ）
function h01(n, salt) { let x = (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; return (x >>> 0) / 4294967296; }

function statsOf(p) {
  const s = p.stats || {};
  const d = (k) => (typeof s[k] === 'number' ? s[k] : 10);
  return { str: d('str'), vit: d('vit'), agi: d('agi'), dex: d('dex'), int: d('int'), wis: d('wis'), cha: d('cha') };
}
const sk = (p, k) => (p.skills && typeof p.skills[k] === 'number' ? p.skills[k] : 0);

// 能力・性格・技能・装備から、いちばん合う職業を選ぶ（勇者は別の判定）
function pickClass(sim, p) {
  if (p.job === 'paladin') return 'paladin';
  const bias = JOB_BIAS[p.job] || JOB_BIAS.adventurer;
  const st = statsOf(p), pe = p.pers || {}, va = p.values || {};
  const O = pe.O ?? 0.5, C = pe.C ?? 0.5, E = pe.E ?? 0.5, A = pe.A ?? 0.5, N = pe.N ?? 0.5;
  const faith = va.faith ?? 0.5, courage = va.courage ?? 0.5;
  const w = p.eq?.weapon?.id || null;
  const age = sim.ageOf ? sim.ageOf(p) : 25;
  const former = p.formerJob || '';
  const score = {
    swordsman: sk(p, '剣術') * 0.06 + (st.str + st.dex) / 16 + (SWORDS.has(w) ? 1 : 0) + C * 0.8 + courage * 0.6,
    fighter: (sk(p, '斧術') + sk(p, '鈍器')) * 0.06 + (st.str + st.vit) / 14 + (w === 'axe' || w === 'mace' ? 0.5 : 0) + courage * 0.8,
    monk: sk(p, '格闘') * 0.09 + (st.str + st.agi) / 16 + C * 1.1 + faith * 0.5 + (!w ? 0.5 : 0) - (w === 'bow' || w === 'staff' ? 2 : 0) - 0.4,
    squire: sk(p, '盾') * 0.06 + sk(p, '槍術') * 0.03 + C * 1.2 + A * 0.6 + (age <= 22 ? 1.4 : age <= 26 ? 0.4 : -1.5) + (p.eq?.shield ? 1 : 0),
    bandit: (sk(p, '盗み') + sk(p, '斧術')) * 0.05 + (1 - A) * 2 + N * 0.6 + (['thief', 'pickpocket', 'banditchief', 'pirate', 'smuggler'].includes(former) ? 3 : 0) + (w === 'axe' ? 0.8 : 0),
    thief: (sk(p, '隠密') + sk(p, '短剣') + sk(p, '盗み') * 0.5) * 0.06 + (st.agi + st.dex) / 16 + O * 0.6 + (1 - E) * 0.5 + (w === 'dagger' ? 1.2 : 0),
    archer: sk(p, '弓術') * 0.08 + (st.dex + st.agi) / 16 + (w === 'bow' ? 2.5 : 0) + (former === 'hunter' ? 2 : 0),
    wizard: sk(p, '攻撃魔法') * 0.08 + st.int / 7 + O * 1.2 + (w === 'staff' ? 1 : 0) + E * 0.4 - (p.job === 'adventurer' && st.int < 12.5 && sk(p, '攻撃魔法') < 15 ? 4 : 0),
    sorcerer: (sk(p, '学問') + sk(p, '読み書き')) * 0.03 + sk(p, '攻撃魔法') * 0.05 + st.int / 7 + C * 1 + O * 0.6 + (1 - E) * 0.5 - (p.job === 'adventurer' && !(st.int >= 11 && sk(p, '学問') + sk(p, '攻撃魔法') >= 20) ? 4 : 0),
    priest: (sk(p, '回復魔法') + sk(p, '祈り')) * 0.07 + st.wis / 7 + A * 1 + faith * 1.6 - (p.job === 'adventurer' && !(faith >= 0.6 && sk(p, '回復魔法') + sk(p, '祈り') >= 15) ? 4 : 0),
  };
  let best = null, bs = -Infinity;
  for (const k of Object.keys(score)) {
    if (!(k in bias)) continue;
    const v = score[k] + bias[k] + h01(p.id, k.length * 31 + k.charCodeAt(0)) * 1.6;
    if (v > bs) { bs = v; best = k; }
  }
  return best || 'swordsman';
}

// 勇者：聖剣を授かった者、魔王討伐隊の先頭に立つ者、名声と実績が抜きんでた者だけ
function heroWorthy(sim, p) {
  if (p.job === 'paladin' || p.job === 'cleric' || p.job === 'sage') return false;
  if (p.holy || p.eq?.weapon?.id === 'holysword') return true;
  const crusade = p.crusade != null ? (sim.S.parties || []).find((x) => x.id === p.crusade && !x.done) : null;
  if (crusade && crusade.members[0] === p.id) return true;
  return (p.fame || 0) >= 160 && (p.advRank || 0) >= 5 && (p.values?.courage ?? 0) > 0.6;
}

export function advClassOf(sim, p) {
  if (!p || p.deathYear != null || !isAdvJob(p.job) || (sim.ageOf && sim.ageOf(p) < 13)) return null;
  if (p.advClass && p.advClassJob === p.job && ADV_CLASSES[p.advClass]) return p.advClass;
  p.advClass = pickClass(sim, p); p.advClassJob = p.job;
  return p.advClass;
}
export const advClassName = (p) => (p && p.advClass && ADV_CLASSES[p.advClass] ? ADV_CLASSES[p.advClass].name : '');
export const advRole = (p) => (p && p.advClass && ADV_CLASSES[p.advClass] ? ADV_CLASSES[p.advClass].role : null);

export function advClassDaily(sim) {
  const S = sim.S;
  const L = sim.living();
  const advs = [];
  for (const p of L) {
    if (isAdvJob(p.job) && !(sim.ageOf && sim.ageOf(p) < 13)) {
      const before = p.advClass && p.advClassJob === p.job ? p.advClass : null;
      advClassOf(sim, p); advs.push(p);
      // 騎士見習いも28歳を過ぎれば一人前の剣士
      if (p.advClass === 'squire' && sim.ageOf && sim.ageOf(p) >= 28) { p.advClass = 'swordsman'; if (S._advClassInit) sim.remember?.(p, '見習いを卒業し、一人前の剣士として認められた', { emo: 0.7, imp: 0.7, k: 'career' }); }
      if (!before && S._advClassInit && p.advClass !== 'hero') sim.remember?.(p, `${ADV_CLASSES[p.advClass].name}として身を立てると決めた`, { emo: 0.4, imp: 0.4, k: 'career' });
    } else if (p.advClass) { delete p.advClass; delete p.advClassJob; }
  }
  // 勇者はごく一部（冒険者の3％まで、最低1人の枠）
  const cap = Math.max(1, Math.floor(advs.length * 0.03));
  let heroes = advs.filter((p) => p.advClass === 'hero').length;
  const cands = advs.filter((p) => p.advClass !== 'hero' && heroWorthy(sim, p)).sort((a, b) => (b.fame || 0) - (a.fame || 0));
  for (const p of cands) {
    if (heroes >= cap && !(p.holy || p.eq?.weapon?.id === 'holysword')) break;
    p.advClass = 'hero'; p.advClassJob = p.job; heroes++;
    if (S._advClassInit) {
      sim.remember?.(p, '人々から「勇者」と呼ばれるようになった', { emo: 0.9, imp: 0.95, k: 'career' });
      sim.news?.(`${sim.fullName ? sim.fullName(p) : p.given}が「勇者」と呼ばれるようになった`, 2, p.pos);
      (p.deeds = p.deeds || []).push(`${sim.year ? sim.year() : ''}年、勇者と呼ばれるようになった`);
    }
  }
  S._advClassInit = true;
}

// ---------- 戦い方の小さな差 ----------
export function advReach(e) {
  switch (e.advClass) {
    case 'wizard': return 3.2;
    case 'sorcerer': return 3.0;
    case 'archer': return 3.6;
    default: return 1.3;
  }
}
const DMG_MUL = { hero: 1.1, swordsman: 1.05, fighter: 1.05, monk: 1.06, squire: 1, bandit: 1.03, thief: 0.97, archer: 0.95, wizard: 0.95, sorcerer: 0.95, priest: 0.85, paladin: 1 };
export function advOnAttack(sim, e, t, dmg) {
  const c = e.advClass;
  if (!c) return dmg;
  let d = Math.max(1, Math.round(dmg * (DMG_MUL[c] ?? 1)));
  // 武闘家：ときどき二連撃（小さな上乗せ）
  if (c === 'monk' && sim.rng.chance(0.15)) d += Math.max(1, Math.round(dmg * 0.3));
  // シーフ：急所を突く
  if (c === 'thief' && sim.rng.chance(0.12)) d = Math.round(d * 1.5);
  // 僧侶：祈りの光で、近くのいちばん弱った仲間（いなければ自分）を少し癒す
  if (c === 'priest') {
    const S = sim.S;
    const pt = e.party != null ? S.advParties?.[e.party] : null;
    let best = e.hp < e.maxhp ? e : null;
    if (pt && !pt.gone) for (const id of pt.members) {
      const m = S.people[id];
      if (!m || m === e || m.deathYear != null || m.hp <= 0 || m.hp >= m.maxhp) continue;
      if (Math.abs(m.pos.x - e.pos.x) > 6 || Math.abs(m.pos.z - e.pos.z) > 6) continue;
      if (!best || m.hp / m.maxhp < best.hp / best.maxhp) best = m;
    }
    if (best) {
      const amt = Math.round(3 + (e.lv || 1) * 0.6 + statsOf(e).wis * 0.15);
      best.hp = Math.min(best.maxhp, best.hp + amt);
      sim.events?.push({ type: 'heal', id: best.id });
    }
  }
  return d;
}
// ダンジョン探索：シーフは罠を外し鍵を開ける。同じ依頼にシーフの仲間がいても少し楽になる
export function advExploreMul(sim, p) {
  if (p.advClass === 'thief') return 1.25;
  const pt = p.party != null ? sim.S.advParties?.[p.party] : null;
  if (pt && !pt.gone && pt.members.some((id) => { const m = sim.S.people[id]; return m && m !== p && m.deathYear == null && m.advClass === 'thief' && m.quest && m.quest === p.quest; })) return 1.12;
  return 1;
}
export const advTreasureBonus = (sim, p) => (p.advClass === 'thief' ? 0.04 : 0);

// ---------- パーティの輪の色 ----------
export const PARTY_COLORS = [
  ['#ff4a4a', '赤'], ['#4a8cff', '青'], ['#38d86a', '緑'], ['#b35cff', '紫'], ['#ff9a2a', '橙'], ['#36dcea', '水色'],
  ['#ff6ac8', '桃色'], ['#a6e23a', '黄緑'], ['#f2f2f2', '白'], ['#6a5cff', '藍'], ['#e8b060', '小麦色'], ['#20b0a0', '青緑'],
];
export function partyColor(sim, pt) {
  if (pt.ci == null) {
    const used = new Map();
    for (const o of Object.values(sim.S.advParties || {})) if (!o.gone && o !== pt && o.ci != null) used.set(o.ci, (used.get(o.ci) || 0) + 1);
    let best = 0, bu = Infinity;
    for (let k = 0; k < PARTY_COLORS.length; k++) { const i = (pt.id + k) % PARTY_COLORS.length; const u = used.get(i) || 0; if (u < bu) { bu = u; best = i; } }
    pt.ci = best;
  }
  const [hex, name] = PARTY_COLORS[pt.ci % PARTY_COLORS.length];
  return { hex, name };
}
// 描画側から毎フレーム呼ぶ：建物の中の人・解散したパーティ・ひとりきりのパーティには出さない
export function partyRingOf(sim, p) {
  if (p.party == null || p.inside != null || p.deathYear != null) return null;
  const pt = sim.S.advParties?.[p.party];
  if (!pt || pt.gone || !pt.members || pt.members.length < 2 || !pt.members.includes(p.id)) return null;
  return { key: pt.id, hex: partyColor(sim, pt).hex };
}

// ---------- 詳細欄 ----------
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function advClassText(sim, p) {
  const cls = advClassOf(sim, p);
  const out = { cls: cls ? ADV_CLASSES[cls].name : null, role: cls ? ADV_CLASSES[cls].role : null, party: null, color: null, colorName: null, mates: [] };
  const pt = p.party != null ? sim.S.advParties?.[p.party] : null;
  if (pt && !pt.gone) {
    const c = partyColor(sim, pt);
    out.party = pt.name; out.color = c.hex; out.colorName = c.name;
    out.mates = pt.members.map((id) => sim.S.people[id]).filter((x) => x && x.id !== p.id && x.deathYear == null);
  }
  out.line = [out.cls ? `冒険者の職業：${out.cls}（${out.role}）` : null, out.party ? `パーティ：「${out.party}」（${out.mates.map((m) => `${m.given}${advClassName(m) ? '・' + advClassName(m) : ''}`).join('、') || '仲間なし'}）輪の色：${out.colorName}` : null].filter(Boolean).join('／');
  return out;
}
// link(person) → HTML（ui.js の this.pLink を渡す）。<dl class="kv"> の中にそのまま入れる
export function advClassRows(sim, p, link = (x) => escH(x.given)) {
  const t = advClassText(sim, p);
  let h = '';
  if (t.cls) h += `<dt>職業</dt><dd>${escH(t.cls)}（${escH(t.role)}）</dd>`;
  if (t.party) {
    const sw = `<span style="display:inline-block;width:0.8em;height:0.8em;border-radius:50%;border:2px solid ${t.color};vertical-align:-0.1em;margin-right:0.3em"></span>`;
    h += `<dt>パーティ</dt><dd>${sw}「${escH(t.party)}」 ${t.mates.map((m) => `${link(m)}${advClassName(m) ? `（${escH(advClassName(m))}）` : ''}`).join('、') || '仲間なし'}<br><span class="sub">足元の輪の色：${escH(t.colorName)}</span></dd>`;
  }
  return h;
}
