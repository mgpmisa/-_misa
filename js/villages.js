// 独立村（国に属さない村）と、村どうし・村と国のあいだの関係（開発部）
//
// 1. 独立村の住民：world.freeVillages の indep:true の置き場に、成り立ちの違う村を3つ作る
//    （隠れ里・自由開拓民の村・鉱山の町・修道村・傭兵の砦村・商人の宿場から、地形に合うものを選ぶ）。
//    家系・記憶・仕事・欲求は今の人と同じ仕組み。長と掟があり、王国の税は取らず、村の蓄えを持つ。
// 2. 関係：独立村・民族の里・王国の町・王国・盗賊団のあいだに「気持ちの値」と「恨みと恩の記録」を持つ。
// 3. 事件は台本ではなく、人の行いから拾う：
//    - 死（S.graves）・手配（S.wanted）・裏稼業の事件（S.uw.cases）・結婚と駆け落ちを見張る
//    - 村人一人ひとりが、貧しさ・性格・恋・恨みから、よその村や町へ出かけて盗み・密猟・聖地荒らし・仇討ち・駆け落ちをする
//    - 被害を受けた側の長が、性格・掟・力の差・関係で「水に流す／引き渡し要求／賠償要求／報復／仲裁を頼む」を選ぶ
//    - 飢え・疫病・魔物の被害、王国の要求（年貢・臣従）、盗賊団のみかじめ、魔物の群れの恨みも同じ流れにのる
//    - 争いが大きくなると、人が実際に出かけて戦う（襲撃・焼き討ち・討伐隊）。和解の道（贈り物・人質・縁組・仲裁）もある
//    - 住民がいなくなれば廃村。生き残りは難民になり、仇を誓う者もいる。廃村にはのちに人が住みつく
// 4. お金は必ず、村の蓄え（S.towns[sid].fund）・国庫・家計のあいだを移すだけ（xfer）。
//
// 本体からの呼び方（くわしくは報告書のつなぎ込みスクリプト）
//   initVillages(sim)        … newWorld の initTribes のあと
//   ensureVillages(sim)      … load の ensureTribes のあと（古いセーブでも村を作る）
//   villagesHourly(sim)      … newHour の tribesHourly のあと
//   villagesDaily(sim)       … newDay の tribesDaily のあと
//   villagesPlace(sim,p,kind)… placeFor の tribesPlace のあと
//   画面：villagesNationHTML(sim, esc)（国々の欄）、villageLabel(sim, p)・villageOriginHTML(sim, p, esc)（人の詳細欄）
//
// 状態（遅延初期化。古いセーブで欠けていても ensureVillages で作る）
//   S.villages = { v, list:[村], rel:{ 'a|b': 関係 }, inc:[事件], trips:[出かけ], raids:[出陣], pacts:[約束], hist:[記録], seq, gi, stats }
//   settlement に indep:true, vid:村番号, vkind:成り立ち。人は p.vOrigin（生まれた村の番号）
import { T, W, H, walkable, tryPlace } from './world.js';
import { JOBS, KINGDOMS, DEATH_CAUSES, GOODS, DAYS_PER_YEAR, traitLabels } from './data.js';
import { createPersonFactory } from './history.js';
import { setTribalLand, annexTribalLand, tribalChunks, EXP_CS, ensureExpansion } from './expansion.js';
import { starterKit, makeItem, addItem, autoEquip } from './items.js';
import { humanStats, startFight } from './society.js';
import { speechStyle } from './speech.js';
import { houseValue, transferEstate } from './property.js';
import { clamp } from './rng.js';

// ---------- 新しい職業と死因（data.js は編集しない） ----------
const NEW_JOBS = {
  vchief: { name: '村の長', place: 'hall', rank: 'commoner' },
  vguard: { name: '村の守り手', place: 'gate', rank: 'commoner', combat: 2 },
  mercenary: { name: '傭兵', place: 'barracks', rank: 'commoner', combat: 3, goods: 'meat' },
  hermit: { name: '修道士', place: 'church', rank: 'commoner', svc: 'heal' },
};
for (const [k, v] of Object.entries(NEW_JOBS)) if (!JOBS[k]) JOBS[k] = v;
if (!DEATH_CAUSES.feud) DEATH_CAUSES.feud = '村どうしの争い';

const VR = 7;                 // 村の半径
const LAND_BASE = 100;        // 領土の「民族の土地」の番号を借りる（100＋村番号。tribes.js の番号とぶつからない）
const MAX_TRIPS = 14;         // 同時に出かけている人の上限
const inb = (x, z) => x >= 0 && z >= 0 && x < W && z < H;
const cheb = (ax, az, bx, bz) => Math.max(Math.abs(ax - bx), Math.abs(az - bz));
const kname = (k) => KINGDOMS[k]?.name || '王国';
const r0 = (x) => Math.round(x);
const alive = (p) => !!(p && p.deathYear == null && p.needs);
const pw = (p) => (p.atk || 5) * Math.sqrt(Math.max(1, p.hp ?? p.maxhp ?? 40));

// ========================================================================================
// 0. 村の成り立ちと掟
// ========================================================================================
// 掟は、長が決めるときの傾き（数値）を持つ。forgive=水に流す raid=報復 handover=引き渡しに応じる pay=賠償に応じる
// demandPay=賠償を求める tribute=王の要求をのむ host=よそ者を受け入れる aid=困った村を助ける peace=和解
export const LAWS = {
  shelter: { name: '追われて来た者は決して売らない', handover: -2.5, host: 1.5 },
  no_king: { name: '王の旗は立てさせない', tribute: -2, raid: 0.2 },
  silence: { name: 'よそ者に里のことを明かさない', host: -0.4 },
  council: { name: '大事なことは寄り合いで決める' },
  no_master: { name: '誰も誰の主人にもならない', tribute: -1.2 },
  share: { name: '蓄えは困った者と分け合う', aid: 1.5, forgive: 0.3 },
  tunnel: { name: '坑道の中では争わない', peace: 0.5 },
  contract: { name: '交わした約束は命をかけて守る', pay: 0.8 },
  pay_blood: { name: '血には銀で償う', pay: 1.5, demandPay: 1.5, raid: -0.5 },
  no_blood: { name: '血を流してはならない', raid: -6, forgive: 1.5, peace: 2 },
  guest: { name: '訪ねてきた者はもてなす', host: 1, aid: 0.5 },
  strength: { name: '強い者が頭になる', raid: 0.8, tribute: -0.5 },
  eye_for_eye: { name: '受けた傷は必ず返す', raid: 1.5, forgive: -1.5, peace: -0.8 },
  trade_sacred: { name: '取引の約束は神聖である', pay: 1, peace: 0.8, demandPay: 0.8 },
  exile: { name: '掟を破った者は村を追われる', handover: 1, justice: 1 },
  crown: { name: '王の法', justice: 1.5 },
};
// 民族の里の掟（民族の気風から）
const TRIBE_LAWS = { fianna: ['guest', 'eye_for_eye'], yarvi: ['share', 'guest'], mahina: ['guest', 'share'], mictla: ['eye_for_eye', 'silence'], dorgu: ['strength', 'eye_for_eye'], nefer: ['guest', 'pay_blood'], garai: ['contract', 'tunnel'], bolota: ['shelter', 'guest'], harn: ['strength', 'guest'], elda: ['no_blood', 'silence'], hollin: ['shelter', 'no_king'] };

export const KINDS = {
  hidden: {
    label: '隠れ里', title: '里長', hall: ['tavern', '囲炉裏の寄り合い小屋', 3, 2], extra: [['church', '里の祠', 2, 2, { open: true }]],
    laws: ['shelter', 'no_king', 'silence'], jobs: { farmer: 5, charcoal: 2, gatherer: 2, hunter: 2, weaver: 1, vguard: 2 },
    goods: ['wood', 'herbs', 'cloth'], wants: ['tools', 'wheat'],
    fams: ['ヘルト', 'ブラント', 'モース', 'リンデ', 'グラウ', 'アッシュ', 'ドルン', 'ファルン'],
    names: ['霧隠れの里', '奥谷の隠れ里', '樅の隠れ里', '灰川の隠れ里'],
    origin: (kn) => `${kn}の重税と追手を逃れた人々が、山あいに身を寄せて開いた`, king: -32, kingOther: -8, res: '森と炭焼き', succession: 'heir',
  },
  free: {
    label: '自由開拓民の村', title: '寄り合いの世話役', hall: ['tavern', '寄り合い所', 3, 2], extra: [['church', '小さな礼拝堂', 2, 2, { open: true }]],
    laws: ['council', 'no_master', 'share'], jobs: { farmer: 6, woodcutter: 3, shepherd: 1, beekeeper: 1, hunter: 1, vguard: 2 },
    goods: ['wheat', 'wood', 'honey', 'wool'], wants: ['tools', 'cloth'],
    fams: ['フライ', 'ノイマン', 'ハーン', 'ベルク', 'ヴィント', 'アーデ', 'ロス', 'ミュラー'],
    names: ['自由村ヴァルトハイム', 'フライエンフェルト', '風見の開拓村', 'ノイラントの自由村'],
    origin: () => '主人を持たずに生きたいと願った開拓民たちが、誰の土地でもない野を切り開いて作った', king: -12, kingOther: -5, res: '麦畑と牧草地', succession: 'council',
  },
  mine: {
    label: '鉱山の町', title: '親方', hall: ['tavern', '坑夫の酒場', 3, 2], extra: [['smithy', '鍛冶場', 2, 2]],
    laws: ['tunnel', 'contract', 'pay_blood'], jobs: { miner: 6, mason: 1, smith: 1, farmer: 2, hunter: 1, vguard: 2 },
    goods: ['ore', 'stone', 'gem'], wants: ['wheat', 'ale'],
    fams: ['アイゼン', 'シュタイガー', 'クナップ', 'ハンマー', 'コール', 'エルツ', 'グルーバー', 'ブライ'],
    names: ['鉄床の町グルーベン', '銀坑の町エルツタール', '黒岩の鉱山町', 'ハンマーシュタットの坑道町'],
    origin: (kn) => `山奥で鉄の鉱脈を見つけた坑夫たちが、${kn}の許しを得ずに掘りはじめた`, king: -6, kingOther: 0, res: '鉄の鉱脈', succession: 'skill', mine: true,
  },
  abbey: {
    label: '世捨て人の修道村', title: '院長', hall: ['church', '修道院', 3, 3, { open: true }], extra: [['tavern', '巡礼の宿坊', 2, 2]],
    laws: ['no_blood', 'guest', 'silence'], jobs: { hermit: 4, herbalist: 1, beekeeper: 1, farmer: 3, gatherer: 2, weaver: 1 },
    goods: ['herbs', 'honey', 'medicine'], wants: ['wheat', 'cloth'],
    fams: ['ザンクト', 'ミルデ', 'シュティル', 'ローゼ', 'ヘレ', 'フロム', 'ギュート'],
    names: ['静けさの修道村', '白樺の庵', '聖ミルデの修道村', '祈りの丘の修道村'],
    origin: () => '世の争いに疲れた者たちが、祈りと畑仕事だけで暮らそうと集まった', king: 6, kingOther: 6, res: '薬草の畑', succession: 'faith',
  },
  merc: {
    label: '傭兵の砦村', title: '頭目', hall: ['tavern', '砦の大広間', 3, 2], extra: [['barracks', '詰所', 3, 2], ['smithy', '鍛冶場', 2, 2]],
    laws: ['strength', 'contract', 'eye_for_eye'], jobs: { mercenary: 6, smith: 1, hunter: 2, farmer: 3, vguard: 1 },
    goods: ['meat', 'tools'], wants: ['wheat', 'ale'],
    fams: ['ヴォルフ', 'アイゼンハルト', 'シュヴェルト', 'ラウ', 'デーゲン', 'ブラント', 'シュトルム', 'カイル'],
    names: ['狼牙の砦村', '鉄の誓いの砦', 'ラウエンの傭兵砦', '赤い旗の砦村'],
    origin: (kn) => `${kn}の戦で雇い主に見捨てられた傭兵たちが、剣一本で砦を築いた`, king: -16, kingOther: 0, res: '腕っぷし', succession: 'strength',
  },
  inn: {
    label: '商人の宿場', title: '元締め', hall: ['tavern', '宿屋', 3, 3], extra: [['smithy', '蹄鉄屋', 2, 2]],
    laws: ['trade_sacred', 'guest', 'pay_blood'], jobs: { innkeeper: 1, brewer: 1, farmer: 4, weaver: 1, tailor: 1, hunter: 1, vguard: 2 },
    goods: ['ale', 'cloth', 'furniture'], wants: ['wheat', 'ore'],
    fams: ['ヴィルト', 'ハンデル', 'ガスト', 'ヴェーク', 'ブルンネン', 'ザルツ', 'クレーマー'],
    names: ['渡り鳥の宿場', '泉の宿場', '塩の道の宿場', 'ミッテンの宿場'],
    origin: () => '国と国のあいだを渡る商人たちが、泉のほとりで荷を下ろしたのが始まりだった', king: 10, kingOther: 5, res: '泉と宿', succession: 'wealth',
  },
  // 廃村のあとに住みついた者たち
  den: { label: '盗賊の巣', title: '頭', hall: ['tavern', 'ねぐら', 3, 2], laws: ['strength'], jobs: { thief: 3 }, goods: [], wants: ['wheat'], fams: [], names: [], origin: () => '廃村に盗賊が住みついた', king: -30, kingOther: -20, res: 'なし', succession: 'strength' },
  resettled: { label: '開拓者の村', title: '世話役', hall: ['tavern', '寄り合い所', 3, 2], laws: ['council', 'share'], jobs: { farmer: 5, woodcutter: 2, hunter: 1, vguard: 1 }, goods: ['wheat', 'wood'], wants: ['tools'], fams: [], names: [], origin: () => '廃村の跡に開拓者が住みついた', king: 0, kingOther: 0, res: '麦畑', succession: 'council' },
};

// ========================================================================================
// 1. 状態・勢力・関係
// ========================================================================================
export function ensureVillages(sim) {
  const S = sim.S;
  if (!S.villages) initVillages(sim, { late: true });
  const X = S.villages;
  X.list = X.list || []; X.rel = X.rel || {}; X.inc = X.inc || []; X.trips = X.trips || []; X.raids = X.raids || []; X.pacts = X.pacts || []; X.hist = X.hist || [];
  X.stats = X.stats || {}; X.seq = X.seq || 1;
  if (X.gi == null || X.gi > S.graves.length) X.gi = S.graves.length;
  return X;
}
const XV = (sim) => sim.S.villages;
const stat = (sim, k, n = 1) => { const st = XV(sim).stats; st[k] = (st[k] || 0) + n; };
export const isFreeVillage = (s) => !!(s && s.indep && s.annexed == null);

// 勢力の鍵：'s<町>'（村・民族の里・王国の町） 'k<国>'（王国） 'h<建物>'（盗賊団のアジト）
function P(sim, key) {
  if (!key) return null;
  const S = sim.S, c = key[0], id = +key.slice(1);
  if (c === 's') {
    const s = sim.town(id);
    if (!s) return null;
    if (s.indep) { const V = XV(sim)?.list[s.vid]; return { key, c, sid: id, s, kind: 'indep', V, name: s.name, k: s.annexed ?? null, x: s.x, z: s.z, r: s.r, dead: !V || V.state === 'ruin' }; }
    if (s.tribal && s.annexed == null) { const TV = S.tribes?.villages?.[s.tribeV]; return { key, c, sid: id, s, kind: 'tribal', TV, name: s.name, k: null, x: s.x, z: s.z, r: s.r, dead: !!TV?.gone || !popSids(sim).has(id) }; }
    return { key, c, sid: id, s, kind: 'town', name: s.name, k: s.kingdom, x: s.x, z: s.z, r: s.r, dead: !!s.abandoned };
  }
  if (c === 'k') {
    const K = S.kingdoms[id];
    if (!K) return null;
    const cap = sim.town(K.capital);
    return { key, c, kind: 'kingdom', k: id, K, name: K.name, x: cap.x, z: cap.z, r: cap.r, sid: cap.id, dead: false };
  }
  if (c === 'h') {
    const b = sim.building(id);
    if (!b) return null;
    return { key, c, kind: 'bandit', bid: id, b, name: `${b.name}の盗賊団`, x: b.door.x, z: b.door.z, r: 3, dead: !banditsOf(sim, id).length };
  }
  return null;
}
const nameOf = (sim, key) => P(sim, key)?.name || '誰か';
// 町の勢力：王国の町の揉め事は、その国（王）が受け持つ
function partyKeyOfSid(sim, sid) {
  const s = sim.town(sid);
  if (!s) return null;
  if (s.indep) return 's' + sid;
  if (s.tribal && s.annexed == null) return 's' + sid;
  return 'k' + s.kingdom;
}
const partyKeyOf = (sim, p) => (p?.bandit && p.hideout != null ? 'h' + p.hideout : partyKeyOfSid(sim, p?.s));
const isVillageKey = (sim, key) => { const q = P(sim, key); return q && (q.kind === 'indep' || q.kind === 'tribal'); };
// 人の住んでいる町（1時間ごとに作り直す）
function popSids(sim) {
  const hk = Math.floor(sim.S.t / 60), L = sim.living();
  if (sim._vPop && sim._vPop.hk === hk && sim._vPop.n === L.length) return sim._vPop.set;
  const set = new Set();
  for (const p of L) set.add(p.s);
  sim._vPop = { hk, n: L.length, set };
  return set;
}
function banditsOf(sim, bid) { return sim.living().filter((p) => p.bandit && p.hideout === bid && p.jail == null); }

// 住人（その勢力の人）
function residents(sim, key) {
  const q = P(sim, key);
  if (!q) return [];
  if (q.c === 's') return sim.living().filter((p) => p.s === q.sid && !p.away);
  if (q.c === 'k') return sim.living().filter((p) => sim.town(p.s)?.kingdom === q.k && !sim.town(p.s)?.indep && !(sim.town(p.s)?.tribal && sim.town(p.s)?.annexed == null));
  if (q.c === 'h') return banditsOf(sim, q.bid);
  return [];
}
const adultsOf = (sim, key) => residents(sim, key).filter((p) => sim.ageOf(p) >= 16);

// 長（決める人）
function chiefOf(sim, key) {
  const q = P(sim, key), S = sim.S;
  if (!q) return null;
  let p = null;
  if (q.kind === 'indep') p = S.people[q.V?.chief];
  else if (q.kind === 'tribal') p = S.people[q.TV?.elder];
  else if (q.kind === 'kingdom' || q.kind === 'town') p = S.people[S.kingdoms[q.k]?.kingId];
  else if (q.kind === 'bandit') { const b = banditsOf(sim, q.bid); p = b.find((x) => x.job === 'banditchief') || b.sort((a, c) => (c.lv || 1) - (a.lv || 1))[0]; }
  return alive(p) ? p : null;
}
function lawsOf(sim, key) {
  const q = P(sim, key);
  if (!q) return [];
  if (q.kind === 'indep') return q.V?.laws || [];
  if (q.kind === 'tribal') return TRIBE_LAWS[q.TV?.tribe] || ['guest'];
  if (q.kind === 'kingdom' || q.kind === 'town') return ['crown'];
  return ['strength'];
}
const law = (sim, key, axis) => lawsOf(sim, key).reduce((a, l) => a + (LAWS[l]?.[axis] || 0), 0);
const hasLaw = (sim, key, l) => lawsOf(sim, key).includes(l);
// 決める人の気質。寄り合いの村は、大人たちの気質の平均が半分まじる
function mind(sim, key) {
  const c = chiefOf(sim, key);
  const base = c ? { A: c.pers.A, C: c.pers.C, E: c.pers.E, N: c.pers.N, O: c.pers.O, courage: c.values.courage, ambition: c.values.ambition, faith: c.values.faith, family: c.values.family } : { A: 0.5, C: 0.5, E: 0.5, N: 0.5, O: 0.5, courage: 0.5, ambition: 0.5, faith: 0.5, family: 0.5 };
  if (hasLaw(sim, key, 'council')) {
    const ad = adultsOf(sim, key);
    if (ad.length) for (const k of Object.keys(base)) {
      const avg = ad.reduce((s, p) => s + (p.pers[k] ?? p.values[k] ?? 0.5), 0) / ad.length;
      base[k] = base[k] * 0.5 + avg * 0.5;
    }
  }
  base.p = c;
  return base;
}

// お金の置き場（出どころと行き先）
function acct(sim, key) {
  const q = P(sim, key), S = sim.S;
  if (!q) return null;
  if (q.c === 's') { const t = S.towns[q.sid]; return t ? { get: () => Math.max(0, t.fund || 0), add: (d) => { t.fund = (t.fund || 0) + d; }, name: `${q.name}の蓄え` } : null; }
  if (q.c === 'k') return { get: () => Math.max(0, q.K.treasury || 0), add: (d) => { q.K.treasury += d; }, name: `${q.name}の国庫` };
  if (q.c === 'h') { const ch = chiefOf(sim, key); const hh = ch && sim.hh(ch); return hh ? { get: () => Math.max(0, hh.money), add: (d) => { hh.money += d; }, name: `${q.name}の隠し金` } : null; }
  return null;
}
const hhAcct = (hh) => (hh ? { get: () => Math.max(0, hh.money), add: (d) => { hh.money += d; }, name: hh.name } : null);
// お金を移す（足りなければあるだけ）。出どころと行き先がどちらもあるときだけ動く
function xfer(from, to, amt) {
  if (!from || !to || !(amt > 0)) return 0;
  const n = Math.max(0, Math.min(amt, from.get()));
  if (n <= 0) return 0;
  from.add(-n); to.add(n);
  return n;
}

// ---------- 関係（気持ちの値と、恨みと恩の記録） ----------
const relKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function rec(sim, a, b) {
  const X = XV(sim), key = relKey(a, b);
  let r = X.rel[key];
  if (!r) {
    const [x, y] = a < b ? [a, b] : [b, a];
    r = X.rel[key] = { a: x, b: y, ab: baseFeel(sim, x, y), ba: baseFeel(sim, y, x), log: [], heat: 0 };
  }
  return r;
}
// 最初の気持ち（まだ記録がない組）
function baseFeel(sim, from, to) {
  const f = P(sim, from), t = P(sim, to);
  if (!f || !t) return 0;
  if (f.kind === 'tribal' && (t.kind === 'kingdom' || t.kind === 'town')) return clamp(f.TV?.att?.[t.k] ?? 0, -100, 100);
  if (t.kind === 'tribal' && (f.kind === 'kingdom' || f.kind === 'town')) return clamp((t.TV?.att?.[f.k] ?? 0) * 0.5, -100, 100);
  if (f.kind === 'bandit' || t.kind === 'bandit') return -30;
  if (f.kind === 'indep' && f.V) { const K = KINDS[f.V.kind]; if (t.kind === 'kingdom' || t.kind === 'town') return (t.k === f.V.faces ? K.king : K.kingOther) * (t.kind === 'town' ? 0.6 : 1); }
  if (t.kind === 'indep' && t.V && (f.kind === 'kingdom' || f.kind === 'town')) return (KINDS[t.V.kind].king * 0.4);
  return 0;
}
export function feel(sim, from, to) { const r = rec(sim, from, to); return from === r.a ? r.ab : r.ba; }
// from の to への気持ちを d だけ動かす。to の側も mutual の割合で動く。txt があれば恨み／恩として記録する
function addFeel(sim, from, to, d, txt = null, mutual = 0.4) {
  if (!from || !to || from === to) return;
  const r = rec(sim, from, to);
  if (from === r.a) { r.ab = clamp(r.ab + d, -100, 100); r.ba = clamp(r.ba + d * mutual, -100, 100); }
  else { r.ba = clamp(r.ba + d, -100, 100); r.ab = clamp(r.ab + d * mutual, -100, 100); }
  if (txt) {
    r.log.push({ d: sim.today, y: sim.year(), f: from, t: to, k: d < 0 ? 'grudge' : 'favor', txt, w: r0(d) });
    if (r.log.length > 12) r.log.splice(0, r.log.length - 12);
  }
  // 王国の町の揉め事は、町の気持ちにも、国の気持ちにも
  for (const [x, y] of [[from, to], [to, from]]) {
    const q = P(sim, x);
    if (q?.kind === 'tribal' && P(sim, y)?.kind === 'kingdom' && q.TV?.att) q.TV.att[P(sim, y).k] = clamp(q.TV.att[P(sim, y).k] + d * 0.3, -100, 100);
  }
}
function heatUp(sim, a, b, h) { const r = rec(sim, a, b); r.heat = Math.min(60, (r.heat || 0) + h); r.lastHeat = sim.today; }
const peaceNow = (sim, a, b) => XV(sim).pacts.some((q) => q.type === 'peace' && q.until > sim.today && ((q.a === a && q.b === b) || (q.a === b && q.b === a)));
const allied = (sim, a, b) => XV(sim).pacts.some((q) => q.type === 'ally' && ((q.a === a && q.b === b) || (q.a === b && q.b === a)));
const alliesOf = (sim, a) => XV(sim).pacts.filter((q) => q.type === 'ally' && (q.a === a || q.b === a)).map((q) => (q.a === a ? q.b : q.a)).filter((k) => !P(sim, k)?.dead);

// 記録（年代記・速報・村の記録）
function note(sim, keys, text, imp = 1, pos = null, k = undefined) {
  const X = XV(sim);
  const e = { d: sim.today, y: sim.year(), text, keys };
  X.hist.push(e);
  if (X.hist.length > 80) X.hist.splice(0, X.hist.length - 80);
  for (const key of keys) { const q = P(sim, key); if (q?.kind === 'indep' && q.V) { q.V.log = q.V.log || []; q.V.log.push(e); if (q.V.log.length > 12) q.V.log.shift(); } }
  if (imp >= 2) { sim.chron(text, k); sim.news(text, imp, pos); }
  else sim.pushLog(text + '。', 'event', [], pos);
}
// 勢力の人々の記憶に残す（大人から max 人。about の身内を優先）
function tell(sim, key, txt, emo, imp, max = 8, about = [], k = 'feud') {
  const ad = adultsOf(sim, key);
  if (!ad.length) return;
  const R = sim.rng;
  const aboutP = about.map((id) => sim.S.people[id]).filter(Boolean);
  const scored = ad.map((p) => ({ p, sc: (aboutP.some((a) => a.id === p.id || sim.kinTerm(p, a)) ? 3 : 0) + (p.job === 'vchief' ? 2 : 0) + R.next() }));
  scored.sort((a, b) => b.sc - a.sc);
  for (const { p } of scored.slice(0, max)) if (!about.includes(p.id)) sim.remember(p, txt, { emo, imp, about, k });
}
function choose(sim, opts) {
  let best = null, bs = -Infinity;
  for (const [id, sc] of Object.entries(opts)) { if (sc == null || !Number.isFinite(sc)) continue; const v = sc + sim.rng.range(0, 0.35); if (v > bs) { bs = v; best = id; } }
  return best;
}

// ========================================================================================
// 2. 村を作る
// ========================================================================================
export function initVillages(sim, opt = {}) {
  const S = sim.S, w = S.world, R = sim.rng;
  ensureExpansion(sim);
  S.villages = { v: 1, list: [], rel: {}, inc: [], trips: [], raids: [], pacts: [], hist: [], seq: 1, gi: S.graves.length, stats: {} };
  if (!S.initPop) { S.initPop = {}; for (const p of sim.living()) S.initPop[p.s] = (S.initPop[p.s] || 0) + 1; }
  const sites = (w.freeVillages || []).filter((v) => v.indep && v.usedBy == null);
  if (!sites.length) return S.villages;
  const money0 = opt.late ? moneyTotal(sim) : 0;
  // 成り立ちを地形で選ぶ（同じ世界に同じ成り立ちは1つまで。世界ごとに違う組み合わせになる）
  const kinds = assignKinds(sim, sites);
  const changed = [];
  const popGoal = R.int(95, 140);
  sites.forEach((fv, i) => { buildVillage(sim, fv, kinds[i], changed, Math.round(popGoal / sites.length) + R.int(-4, 4)); });
  if (changed.length) sim.events.push({ type: 'tiles', list: [...new Set(changed)] });
  seedRelations(sim);
  sim._townMask = null;
  sim.dirty();
  if (opt.late) { const add = moneyTotal(sim) - money0; if (add > 0) { S.ledger = S.ledger || { seed: 0, outside: 0 }; S.ledger.outside = (S.ledger.outside || 0) + add; } }
  const names = S.villages.list.map((V) => `${V.name}（${KINDS[V.kind].label}）`);
  if (names.length) sim.pushLog(`どの国にも属さない村がある：${names.join('、')}。`, 'event');
  return S.villages;
}

function assignKinds(sim, sites) {
  const S = sim.S, w = S.world, R = sim.rng;
  const count = (fv, pred, rr = 16) => { let n = 0; for (let dz = -rr; dz <= rr; dz += 2) for (let dx = -rr; dx <= rr; dx += 2) { const x = fv.x + dx, z = fv.z + dz; if (inb(x, z) && pred(w.tiles[z * W + x])) n++; } return n; };
  const hideouts = w.buildings.filter((b) => b.type === 'hideout');
  const score = (fv, kind) => {
    const rock = count(fv, (t) => t === T.ROCK || t === T.PEAK), forest = count(fv, (t) => t === T.FOREST || t === T.DENSE || t === T.JUNGLE);
    const water = count(fv, (t) => t === T.RIVER || t === T.SEA), grass = count(fv, (t) => t === T.GRASS || t === T.SAVANNA);
    const dTown = Math.min(...w.settlements.filter((s) => !s.indep).map((s) => Math.hypot(s.x - fv.x, s.z - fv.z)));
    const dBand = Math.min(999, ...hideouts.map((b) => Math.hypot(b.x - fv.x, b.z - fv.z)));
    const nm = fv.name || '';
    switch (kind) {
      case 'mine': return rock * 0.12;
      case 'hidden': return forest * 0.06 + (dTown > 140 ? 1 : 0);
      case 'free': return grass * 0.05 + (nm.includes('自由') ? 0.8 : 0);
      case 'abbey': return dTown * 0.01 + forest * 0.02;
      case 'merc': return (dBand < 120 ? 1.5 : 0) + rock * 0.03;
      case 'inn': return water * 0.08 + (nm.includes('渡り鳥') ? 0.8 : 0) + (dTown < 150 ? 0.8 : 0);
    }
    return 0;
  };
  const pool = ['hidden', 'free', 'mine', 'abbey', 'merc', 'inn'];
  const out = new Array(sites.length).fill(null);
  const pairs = [];
  sites.forEach((fv, i) => { for (const k of pool) pairs.push({ i, k, sc: Math.min(2, score(fv, k)) + R.range(0, 3) }); });
  pairs.sort((a, b) => b.sc - a.sc);
  const used = new Set();
  for (const pr of pairs) { if (out[pr.i] || used.has(pr.k)) continue; out[pr.i] = pr.k; used.add(pr.k); }
  return out.map((k) => k || R.pick(pool));
}

function nearestKingdom(sim, x, z) {
  let best = 0, bd = 1e9;
  for (const s of sim.S.world.settlements) { if (s.indep || s.tribal || s.kingdom == null || s.kingdom < 0) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s.kingdom; } }
  return best;
}
const LAND = [T.GRASS, T.SAVANNA, T.DESERT, T.SNOW, T.BEACH, T.FOREST, T.DENSE, T.JUNGLE, T.SWAMP, T.ROCK, T.FIELD];
const CLEAR = { [T.DENSE]: T.FOREST, [T.JUNGLE]: T.GRASS, [T.SWAMP]: T.GRASS, [T.ROCK]: T.GRASS, [T.PASTURE]: T.GRASS };

function buildVillage(sim, fv, kind, changed, popGoal) {
  const S = sim.S, w = S.world, R = sim.rng, X = S.villages;
  const K = KINDS[kind];
  const vid = X.list.length, sid = w.settlements.length;
  const cx = fv.x, cz = fv.z, r = VR;
  const h0 = Math.max(1, w.hgt[cz * W + cx]);
  const used = new Set(w.settlements.map((s) => s.name));
  const name = R.shuffle(K.names.slice()).find((n) => !used.has(n)) || fv.name;
  // ならす（木や岩をどけて平らに）
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const x = cx + dx, z = cz + dz;
    if (!inb(x, z)) continue;
    const i = z * W + x, tt = w.tiles[i];
    if (tt === T.SEA || tt === T.DEEP || tt === T.PEAK || tt === T.LAVA || tt === T.RIVER || tt === T.BLD) continue;
    w.hgt[i] = h0;
    if (CLEAR[tt] != null) { w.tiles[i] = CLEAR[tt]; changed.push(i); }
  }
  // 広場と、柵の中だけの踏み分け道（十字と、ひと回りの小道。外への道は作らない）
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, z = cz + dz, i = z * W + x, tt = w.tiles[i];
    const plaza = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
    if (!(plaza || dx === 0 || dz === 0 || Math.max(Math.abs(dx), Math.abs(dz)) === 4)) continue;
    if (tt === T.RIVER) { w.tiles[i] = T.BRIDGE; changed.push(i); continue; }
    if (!walkable(tt) || tt === T.BLD) continue;
    w.tiles[i] = plaza ? T.PLAZA : T.ROAD; changed.push(i);
  }
  const faces = nearestKingdom(sim, cx, cz);
  const s = { id: sid, name, type: 'village', kingdom: faces, x: cx, z: cz, r, h: h0, buildings: [], plaza: { x: cx, z: cz, r: 1 }, gates: [], guardposts: [], walls: [], indep: true, vid, faces, vkind: kind };
  w.settlements.push(s);
  fv.usedBy = 'v' + vid;
  // 柵（出入口は4つ。外へ道は延ばさない）
  for (let k = -r - 1; k <= r + 1; k++) for (const [x, z] of [[cx + k, cz - r - 1], [cx + k, cz + r + 1], [cx - r - 1, cz + k], [cx + r + 1, cz + k]]) {
    if (!inb(x, z)) continue;
    const i = z * W + x, tt = w.tiles[i];
    if (x === cx || z === cz) { if (walkable(tt) && tt !== T.BLD) { w.tiles[i] = T.GRASS; changed.push(i); } continue; }
    if (!walkable(tt) || tt === T.BLD || tt === T.BRIDGE) continue;
    w.tiles[i] = T.FENCE; changed.push(i);
  }
  for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const gx = cx + dx * (r + 1), gz = cz + dz * (r + 1);
    if (inb(gx, gz) && walkable(w.tiles[gz * W + gx])) s.gates.push({ x: gx, z: gz, dx, dz });
  }
  // 建物
  const place = (type, bname, bw, bd, extra = {}) => {
    const streets = [];
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) { const tt = w.tiles[z * W + x]; if (tt === T.ROAD || tt === T.PLAZA) streets.push({ x, z, d: Math.abs(x - cx) + Math.abs(z - cz) + R.next() * 2 }); }
    streets.sort((a, b) => a.d - b.d);
    const b = tryPlace(w, s, streets, type, bname, bw, bd, { land: LAND, extra: { vkind: kind, ...extra } }, R);
    if (b) { s.buildings.push(b.id); sim.events.push({ type: 'building', id: b.id }); }
    return b;
  };
  const [ht, hn, hw, hd, hx] = K.hall;
  const hall = place(ht, hn, hw, hd, { hall: true, ...(hx || {}) });
  place('well', '井戸', 1, 1, { open: true });
  const barter = place('market', '物々交換の場', 2, 2, { open: true, barter: true });
  for (const [t2, n2, w2, d2, x2] of K.extra || []) place(t2, n2, w2, d2, x2 || {});
  const V = {
    id: vid, sid, name, kind, x: cx, z: cz, r, faces, laws: K.laws.slice(), chief: null, title: K.title, hall: hall?.id ?? null, barter: barter?.id ?? null,
    state: 'alive', founded: sim.year() - R.int(35, 150), pop0: 0, log: [], hunger: 0, cool: {}, loss: [], annexed: null, mine: null,
  };
  X.list.push(V);
  // 鉱山（柵の外の岩場）
  if (K.mine) V.mine = s.mine = placeMine(sim, s, changed);
  // 市場（物々交換の場）と村の蓄え
  const stock = {}, price = {};
  for (const [g, G] of Object.entries(GOODS)) { const mine = K.goods.includes(g); stock[g] = G.target * (mine ? 0.9 : ['wheat', 'meat', 'bread', 'fish'].includes(g) ? 0.5 : 0.12); price[g] = G.base; }
  S.towns[sid] = { stock, price, commission: 0, fund: R.int(90, 180), history: [], occupied: false, damage: 0, unrest: 0, alms: 0, mats: {} };
  S.culture = S.culture || {};
  S.culture[sid] = V.laws.map((l) => ({ text: LAWS[l].name, w: 3, origin: '村の掟' }));
  if (S.expansion) { S.expansion.sk[sid] = faces; (S.expansion.origK = S.expansion.origK || {})[sid] = faces; }
  S.initPop[sid] = -1;   // 王国の移住（sim.immigration）は来ない。人の出入りは villages.js が受け持つ
  populate(sim, V, s, popGoal);
  placeFields(sim, s, changed);
  markLand(sim, V);
  return V;
}
function placeMine(sim, s, changed) {
  const w = sim.S.world;
  let best = null, bs = -1;
  for (let dz = -s.r - 9; dz <= s.r + 9; dz++) for (let dx = -s.r - 9; dx <= s.r + 9; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) < s.r + 3) continue;
    const x = s.x + dx, z = s.z + dz;
    if (!inb(x, z) || x < 3 || z < 3 || x > W - 4 || z > H - 4) continue;
    const t = w.tiles[z * W + x];
    if (!walkable(t) || t === T.BLD || t === T.FENCE || t === T.ROAD) continue;
    let rock = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const tt = w.tiles[(z + b) * W + x + a]; if (tt === T.ROCK || tt === T.PEAK) rock++; }
    const sc = rock * 2 - Math.max(Math.abs(dx), Math.abs(dz)) * 0.3;
    if (sc > bs && walkable(w.tiles[(z + 1) * W + x]) && w.tiles[(z + 1) * W + x] !== T.BLD) { bs = sc; best = { x, z }; }
  }
  if (!best) return null;
  const id = w.buildings.length;
  w.tiles[best.z * W + best.x] = T.BLD; w.bldAt[best.z * W + best.x] = id; changed.push(best.z * W + best.x);
  const b = { id, type: 'mine', name: `${s.name.replace(/^.*の/, '')}の坑道`, x: best.x, z: best.z, w: 1, d: 1, door: { x: best.x, z: best.z + 1 }, h: w.hgt[(best.z + 1) * W + best.x], face: 'S', settlement: s.id, kingdom: s.kingdom, roof: 'tile', vkind: 'mine' };
  w.buildings.push(b);
  s.buildings.push(id);
  sim.events.push({ type: 'building', id });
  return id;
}
function placeFields(sim, s, changed) {
  const w = sim.S.world;
  let n = 0;
  for (let rr = s.r + 2; rr <= s.r + 5 && n < 26; rr++) for (let dz = -rr; dz <= rr && n < 26; dz++) for (let dx = -rr; dx <= rr && n < 26; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr || Math.abs(dx) <= 1 || Math.abs(dz) <= 1) continue;
    const x = s.x + dx, z = s.z + dz;
    if (!inb(x, z)) continue;
    const i = z * W + x, t = w.tiles[i];
    if (t !== T.GRASS && t !== T.SAVANNA && t !== T.FOREST) continue;
    w.tiles[i] = T.FIELD; changed.push(i); w.fields.push({ x, z, s: s.id }); n++;
  }
}
function markLand(sim, V) {
  const tr = sim.S.territory;
  if (!tr) return;
  const CW = tr.cw, CH = tr.ch;
  for (let ci = 0; ci < CW * CH; ci++) {
    const cx = (ci % CW) * EXP_CS + (EXP_CS >> 1), cz = Math.floor(ci / CW) * EXP_CS + (EXP_CS >> 1);
    if (tr.owner[ci] >= 0 || tr.tribe?.[ci] >= 0) continue;
    if (cheb(V.x, V.z, cx, cz) > V.r + 5 + (EXP_CS >> 1)) continue;
    setTribalLand(sim, ci, LAND_BASE + V.id);
  }
}
function placeHouseIn(sim, s, name) {
  const w = sim.S.world, R = sim.rng;
  for (let grow = 0; grow <= 3; grow++) {
    s.extraR = grow;
    const RR = s.r + grow;
    const streets = [];
    for (let z = s.z - RR; z <= s.z + RR; z++) for (let x = s.x - RR; x <= s.x + RR; x++) { if (!inb(x, z)) continue; const tt = w.tiles[z * W + x]; if (tt === T.ROAD || tt === T.PLAZA) streets.push({ x, z, d: Math.abs(x - s.x) + Math.abs(z - s.z) + R.next() * 5 }); }
    streets.sort((a, b) => a.d - b.d);
    const b = tryPlace(w, s, streets, 'house', name, 2, 2, { land: LAND, extra: { vkind: s.vkind } }, R);
    if (b) { s.extraR = 0; s.buildings.push(b.id); sim.events.push({ type: 'building', id: b.id }); return b; }
  }
  s.extraR = 0;
  return null;
}
function freeHouse(sim, s) { return s.buildings.map((id) => sim.building(id)).find((b) => b && b.type === 'house' && b.hh == null && !b.ruin) || null; }

// ---------- 村人 ----------
function populate(sim, V, s, goal) {
  const S = sim.S, R = sim.rng, Y = sim.year(), K = KINDS[V.kind];
  const make = createPersonFactory({ rng: R, people: S.people, nextId: () => S.nextId++ });
  const south = V.faces === 2 && V.z > H * 0.55;
  const fams = R.shuffle(K.fams.slice());
  let fi = 0;
  const people = [], families = [];
  const mk = (o) => { const p = make({ ...o, s: s.id, south }); p.vOrigin = V.id; return p; };
  const ancestors = (fam, by) => {
    const a = mk({ sex: 'm', family: fam, birthYear: by }), b = mk({ sex: 'f', family: fam, birthYear: by + R.int(-3, 3) });
    a.spouseId = b.id; b.spouseId = a.id;
    for (const q of [a, b]) { q.deathYear = by + R.int(52, 78); q.deathCause = R.pick(['old', 'winter', 'sick', 'accident']); q.deathDay = -1; delete q.notes; delete q.anc2; }
    a.deeds.push(R.pick([`${V.name}を開いた最初の者たちのひとりだった`, '村いちばんの働き者だった', `${K.res}のことなら何でも知っていた`, '若いころ村を守って戦った']));
    S.graves.push(a.id, b.id);
    return [a, b];
  };
  const family = (age, withKids = true) => {
    const fam = fams[fi++ % fams.length];
    const [fa, fb] = ancestors(fam, Y - age - R.int(24, 32));
    const h = mk({ sex: 'm', family: fam, birthYear: Y - age, father: fa, mother: fb });
    const wf = mk({ sex: 'f', family: fam, birthYear: Y - age + R.int(-4, 5) });
    wf.birthFamily = R.pick(K.fams.length ? K.fams : [fam]);
    h.spouseId = wf.id; wf.spouseId = h.id;
    const F = { head: h, members: [h, wf] };
    people.push(h, wf);
    if (withKids) {
      const n = R.int(0, 4);
      for (let k = 0; k < n; k++) {
        const kidAge = k === 0 && age > 40 ? R.int(16, Math.min(28, age - 19)) : R.int(0, Math.min(17, age - 19));
        if (age - kidAge < 18 || kidAge < 0) continue;
        const c = mk({ sex: R.chance(0.5) ? 'm' : 'f', family: fam, birthYear: Y - kidAge, father: h, mother: wf });
        people.push(c); F.members.push(c);
      }
    }
    families.push(F);
    return F;
  };
  // 長の家
  const chiefF = family(R.int(44, 64));
  while (people.length < goal) {
    const roll = R.next();
    if (roll < 0.12) {
      // 年寄りの夫婦
      const F = family(R.int(62, 76), false);
      if (R.chance(0.4)) { const w2 = F.members[1]; w2.deathYear = Y - R.int(1, 8); w2.deathCause = 'old'; w2.deathDay = -1; F.members.pop(); people.splice(people.indexOf(w2), 1); F.head.spouseId = null; F.head.exSpouses.push(w2.id); S.graves.push(w2.id); }
    } else if (roll < 0.2) {
      // ひとり者（よそから流れてきた者・連れ合いを亡くした者）
      const fam = R.pick(K.fams.length ? K.fams : ['ロス']);
      const p = mk({ sex: R.chance(0.6) ? 'm' : 'f', family: fam, birthYear: Y - R.int(20, 45) });
      people.push(p); families.push({ head: p, members: [p] });
    } else family(R.int(24, 55));
  }
  // 世帯と家
  for (const F of families) {
    const hid = S.nextHh++;
    const hh = S.households[hid] = { id: hid, members: F.members.map((p) => p.id), house: null, s: s.id, money: R.int(40, 110), food: F.members.length * 4, comfort: 0, name: `${F.head.family}の家`, land: 2, vil: true };
    const b = placeHouseIn(sim, s, hh.name);
    if (b) { hh.house = b.id; b.hh = hid; b.owner = hid; b.value = houseValue(sim, b); b.rent = 0; b.arrears = 0; }
    else hh.street = true;
    for (const p of F.members) p.hh = hid;
  }
  // 長と仕事
  const chief = chiefF.head;
  const weights = Object.entries(K.jobs);
  const count = {};
  for (const p of people) {
    const age = Y - p.birthYear;
    let job = null;
    if (p === chief) job = 'vchief';
    else if (age >= 14 && age < 68) job = pickJob(sim, weights, count, p);
    if (job) count[job] = (count[job] || 0) + 1;
    const home = sim.building(S.households[p.hh]?.house);
    initVillager(sim, p, job, home ? home.door : { x: s.x, z: s.z });
  }
  V.chief = chief.id;
  chief.vTitle = V.title;
  V.pop0 = people.length;
  // 人間関係と記憶
  sim._kin.clear(); sim._anc.clear?.();
  sim.dirty();
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) link(sim, people[i], people[j]);
  for (const p of people) villageMemories(sim, V, p);
}
function pickJob(sim, weights, count, p) {
  const R = sim.rng;
  // 村に足りない仕事ほど選ばれる。腕に覚えのありそうな者は守り手・傭兵に向く
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const have = Object.entries(count).filter(([j]) => weights.some(([x]) => x === j)).reduce((a, [, n]) => a + n, 0) + 1;
  let best = null, bs = -Infinity;
  for (const [j, wt] of weights) {
    const combat = JOBS[j]?.combat || 0;
    const deficit = (wt / total) * have - (count[j] || 0);
    const sc = deficit * 2 + (combat ? (p.values.courage - 0.5) * 0.8 : 0) + R.range(0, 0.5);
    if (sc > bs) { bs = sc; best = j; }
  }
  return best;
}
function initVillager(sim, p, job, pos) {
  const R = sim.rng, age = sim.ageOf(p);
  delete p.notes; delete p.anc2;
  p.job = job; if (age >= 68 && job && job !== 'vchief') { p.formerJob = job; p.job = null; }
  p.rank = JOBS[p.job]?.rank || 'commoner';
  p.needs = { survival: 85, sleep: R.range(60, 95), hunger: R.range(60, 90), lust: R.range(50, 95), sloth: R.range(50, 90), pleasure: R.range(40, 90), esteem: R.range(40, 90) };
  if (age < 16) p.needs.lust = 100;
  p.mood = 60; p.memories = []; p.rel = {}; p.gk = {}; p.talkedToday = {}; p.recent = []; p.tool = R.range(0.3, 0.9); p.workedToday = 0;
  p.pregnant = 0; p.cooldown = 0; p.q = {}; p.skill = {}; p.danger = {}; p.fame = p.job === 'vchief' ? 20 : 0;
  p.lv = 1 + Math.floor(clamp((JOBS[p.job]?.combat || 0) * 2 + R.range(0, 3) + (age > 30 ? 1 : 0), 0, 9));
  if (p.job) p.skill[p.job] = clamp(0.25 + Math.min(Math.max(0, age - 14), 30) / 40 + R.range(-0.1, 0.1), 0.05, 0.95);
  p.style = speechStyle(p, age); p.traits = traitLabels(p);
  p.inv = []; p.eq = {}; if (age >= 14) armVillager(p, R);
  p.purse = age < 14 ? R.int(0, 2) : R.int(3, 14);
  Object.assign(p, humanStats(sim, p)); p.hp = p.maxhp;
  p.pos = { x: pos.x, z: pos.z }; p.inside = null; p.path = []; p.action = null;
}
function armVillager(p, R) {
  starterKit(p, R);
  const q = () => 0.75 + R.next() * 0.35;
  if (p.job === 'vguard') { addItem(p, makeItem('spear', q())); addItem(p, makeItem('leatherarmor', q())); }
  if (p.job === 'mercenary') { addItem(p, makeItem(R.pick(['sword', 'axe', 'spear']), q())); addItem(p, makeItem(R.chance(0.5) ? 'chainmail' : 'leatherarmor', q())); if (R.chance(0.5)) addItem(p, makeItem('shield', q())); }
  autoEquip(p);
}
function link(sim, a, b) {
  const R = sim.rng;
  if (a.rel[b.id]) return;
  const compat = 1 - (Math.abs(a.pers.E - b.pers.E) + Math.abs(a.pers.A - b.pers.A) + Math.abs(a.pers.O - b.pers.O) + Math.abs(a.values.faith - b.values.faith)) / 4;
  const base = (compat - 0.55) * 60 + (a.pers.A + b.pers.A - 1) * 15 + 6;
  let fa = a.hh === b.hh ? 95 : 40, aa = base + R.gauss(0, 12), ab = base + R.gauss(0, 12);
  const kin = sim.kinTerm(a, b);
  if (kin) { fa = Math.max(fa, 70); const bonus = ['夫', '妻'].includes(kin) ? R.gauss(55, 20) : ['父', '母', '息子', '娘'].includes(kin) ? R.gauss(45, 18) : R.gauss(22, 15); aa += bonus; ab += bonus; }
  a.rel[b.id] = { a: clamp(aa, -100, 100), f: fa };
  b.rel[a.id] = { a: clamp(ab, -100, 100), f: fa };
}
function villageMemories(sim, V, p) {
  const R = sim.rng, Y = sim.year(), age = sim.ageOf(p), K = KINDS[V.kind];
  const at = (ago) => -ago * DAYS_PER_YEAR - R.int(1, DAYS_PER_YEAR - 1);
  if (age >= 8) sim.remember(p, `子どものころ、${V.name}は${K.origin(kname(V.faces))}のだと年寄りに聞いた`, { t: at(age - R.int(6, 10)), emo: 0.3, imp: 0.55, k: 'story' });
  if (age >= 12 && R.chance(0.5)) { const l = R.pick(V.laws); sim.remember(p, `「${LAWS[l].name}」という掟を、親から何度も言い聞かされた`, { t: at(age - R.int(8, 12)), emo: 0.1, imp: 0.5, k: 'story' }); }
  if (age >= 18 && R.chance(0.3)) sim.remember(p, R.pick([`${V.name}の柵を、村のみんなで建て直した`, '冬に蓄えが尽きかけて、みんなで分け合ってしのいだ', '村の寄り合いで大人たちが夜遅くまで言い争っていた']), { t: at(R.int(2, Math.max(3, age - 14))), emo: 0.2, imp: 0.5, k: 'life' });
  sim.trimMemories(p);
}

// 昔からの因縁（村と村・村と国）。年代記と人々の記憶にも入れる
function seedRelations(sim) {
  const S = sim.S, R = sim.rng, X = S.villages, Y = sim.year();
  const keys = X.list.map((V) => 's' + V.sid);
  const tribal = (S.tribes?.villages || []).filter((TV) => !TV.gone).map((TV) => 's' + TV.sid);
  const events = [];
  for (const V of X.list) {
    const me = 's' + V.sid, K = KINDS[V.kind];
    // 近くの国（向き合う国）
    const kk = 'k' + V.faces;
    rec(sim, me, kk);
    const fy = V.founded;
    events.push({ y: fy, text: `${V.name}が開かれた（${K.origin(kname(V.faces))}という）`, keys: [me] });
    if (V.kind === 'hidden') { const y = fy + R.int(10, Math.max(12, Y - fy - 5)); events.push({ y, text: `${kname(V.faces)}の追手が${V.name}を探して山を越えたが、里の者は息をひそめてやり過ごした`, keys: [me, kk], d: -8, f: me, t: kk }); }
    if (V.kind === 'mine') { const y = Y - R.int(5, 40); events.push({ y, text: `${kname(V.faces)}の役人が${V.name}の鉱石の取り分を求めて来たが、親方は追い返した`, keys: [me, kk], d: -6, f: kk, t: me }); }
    if (V.kind === 'merc') { const y = Y - R.int(3, 30); events.push({ y, text: `${V.name}の傭兵たちが${kname(V.faces)}の戦に雇われ、報酬のことで揉めた`, keys: [me, kk], d: -5, f: me, t: kk }); }
    if (V.kind === 'abbey') { const y = Y - R.int(4, 35); events.push({ y, text: `流行り病の年、${V.name}の修道士たちが${kname(V.faces)}の村々へ薬を届けた`, keys: [me, kk], d: 10, f: kk, t: me }); }
    if (V.kind === 'inn') { const y = Y - R.int(2, 25); events.push({ y, text: `${kname(V.faces)}の商人たちが${V.name}で荷を下ろすようになった`, keys: [me, kk], d: 6, f: kk, t: me }); }
  }
  // 村どうし・村と民族の里：近ければ因縁がある
  const all = [...keys, ...tribal];
  for (let i = 0; i < keys.length; i++) for (let j = 0; j < all.length; j++) {
    const a = keys[i], b = all[j];
    if (a === b || (j < keys.length && j <= i)) continue;
    const qa = P(sim, a), qb = P(sim, b);
    const d = Math.hypot(qa.x - qb.x, qa.z - qb.z);
    rec(sim, a, b);
    if (d > 330 || !R.chance(0.75)) continue;
    const y = Y - R.int(3, 60);
    const good = R.chance(qa.V.kind === 'abbey' || qa.V.kind === 'inn' ? 0.7 : qa.V.kind === 'merc' ? 0.35 : 0.5);
    const T0 = good
      ? R.pick([`${qa.name}と${qb.name}の若者どうしが結ばれ、両方の村で祝った`, `凶作の冬、${qb.name}が${qa.name}に麦を分けた`, `${qa.name}の者が${qb.name}の子を狼から救った`])
      : R.pick([`${qa.name}と${qb.name}が狩り場をめぐって争い、けが人が出た`, `${qb.name}の者が${qa.name}の家畜を盗んだと言われ、今も言い分が食い違っている`, `${qa.name}の若者が${qb.name}の祭りで騒ぎを起こした`]);
    events.push({ y, text: T0, keys: [a, b], d: good ? R.int(6, 14) : -R.int(6, 16), f: good ? a : b, t: good ? b : a, pair: true });
  }
  for (const e of events.sort((a, b) => a.y - b.y)) {
    S.chronicle.push({ y: e.y, k: undefined, text: e.text, vil: true });
    if (e.f && e.t) { addFeel(sim, e.f, e.t, e.d, `${e.y}年、${e.text}`, e.pair ? 0.6 : 0.3); const r = rec(sim, e.f, e.t); r.log[r.log.length - 1].d = -(Y - e.y) * DAYS_PER_YEAR; }
    // 覚えている人（その年に生きていた大人）
    for (const key of e.keys) {
      const q = P(sim, key);
      if (q?.c !== 's') continue;
      for (const p of sim.living().filter((x) => x.s === q.sid && x.birthYear <= e.y - 8)) if (R.chance(0.45)) sim.remember(p, `${e.y}年、${e.text}のを覚えている`, { t: -(Y - e.y) * DAYS_PER_YEAR - R.int(1, 30), emo: (e.d || 0) / 20, imp: 0.55, k: 'story' });
    }
  }
  S.chronicle.sort((a, b) => a.y - b.y);
}

// ========================================================================================
// 3. 毎時：出かけた人・出陣・死の見張り
// ========================================================================================
export function villagesHourly(sim) {
  const S = sim.S;
  if (!S.villages) return;
  const X = S.villages;
  if (!X.list.length) return;
  const m0 = sim._vAudit ? moneyTotal(sim) : 0;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  sim._vIn = true;
  pollGraves(sim);
  stepTrips(sim);
  stepRaids(sim);
  sim._vIn = false;
  if (t0) sim._vMs = (sim._vMs || 0) + performance.now() - t0;
  if (sim._vAudit) { const d = moneyTotal(sim) - m0; X.stats.leak = (X.stats.leak || 0) + d; }
}

// ---------- 死の見張り：誰かが誰かに殺された ----------
function pollGraves(sim) {
  const S = sim.S, X = XV(sim);
  if (X.gi > S.graves.length) X.gi = S.graves.length;
  for (; X.gi < S.graves.length; X.gi++) {
    const v = S.people[S.graves[X.gi]];
    if (!v || v.deathDay !== sim.today && v.deathDay !== sim.today - 1) continue;
    if (v.vRaidDeath != null) continue;          // 出陣での死は出陣の結末で扱う
    const vk = partyKeyOfSid(sim, v.s);
    if (!vk) continue;
    // 村人の死：魔物・獣・病・飢えは村の苦しみとして数える
    const vq = P(sim, vk);
    if (vq?.kind === 'indep' && vq.V && ['monster', 'beast', 'demon', 'sick', 'hunger'].includes(v.deathCause)) vq.V.loss.push({ d: sim.today, c: v.deathCause });
    const killer = typeof v.killedBy === 'number' ? S.people[v.killedBy] : null;
    if (!killer || killer.id === v.id) continue;
    const kk = partyKeyOf(sim, killer);
    if (!kk || kk === vk) continue;
    if (!isVillageKey(sim, vk) && !isVillageKey(sim, kk)) continue;   // 村がかかわらない殺しは本体の仕組みにまかせる
    const known = !!S.wanted[killer.id] || killer.jail != null || v.deathCause !== 'murder';
    if (v.deathCause === 'justice') {
      // お尋ね者や盗賊として討たれた：討たれた側の村は、掟と誇りしだいで恨む
      addFeel(sim, vk, kk, -4, `${v.given}が${nameOf(sim, kk)}の者に「成敗」された`, 0);
      tell(sim, vk, `${v.given}が${nameOf(sim, kk)}の者に討たれた`, -0.6, 0.7, 6, [v.id]);
      continue;
    }
    openIncident(sim, { type: 'murder', a: vk, b: kk, culprit: killer.id, victim: v.id, harm: 8 + (v.fame || 0) / 10, known, where: { x: Math.round(v.pos?.x ?? 0), z: Math.round(v.pos?.z ?? 0) } });
  }
}

// ---------- 出かけた人（盗み・密猟・聖地荒らし・仇討ち・駆け落ち・使い・交易・逃亡） ----------
function newTrip(sim, p, deed, toSid, spot, data = {}) {
  const X = XV(sim), S = sim.S;
  if (!alive(p) || p.jail != null || p.fight) return null;
  if (X.trips.some((t) => t.pid === p.id)) return null;
  const t = { id: X.seq++, pid: p.id, deed, to: toSid, tx: spot.x, tz: spot.z, start: S.t, stage: 'go', from: p.s, data };
  X.trips.push(t);
  p.mission = { type: 'stroll', x: spot.x, z: spot.z, until: S.t + 1440 * 2.5, dur: 40, vtrip: t.id };
  p.action = null;
  p.vLastDeed = sim.today;
  stat(sim, 'trip:' + deed);
  return t;
}
function stepTrips(sim) {
  const S = sim.S, X = XV(sim), R = sim.rng;
  for (const t of X.trips.slice()) {
    const p = S.people[t.pid];
    const drop = () => { X.trips.splice(X.trips.indexOf(t), 1); if (p && p.mission?.vtrip === t.id) p.mission = null; };
    if (!alive(p) || p.jail != null) { if (t.deed === 'envoy' || t.deed === 'kenvoy') envoyLost(sim, t); drop(); continue; }
    if (S.t - t.start > 1440 * 3) { if (t.stage === 'go' && (t.deed === 'envoy' || t.deed === 'kenvoy')) arriveTrip(sim, t, p); drop(); continue; }
    if (t.stage === 'go') {
      if (t.deed === 'avenge') {
        const tg = S.people[t.data.target];
        if (!alive(tg) || tg.jail != null) { sim.remember(p, `${tg?.given || '仇'}への恨みを晴らす前に、相手がいなくなった`, { emo: -0.3, imp: 0.6, k: 'feud' }); goBack(sim, t, p); continue; }
        if (tg.inside == null) { t.tx = Math.round(tg.pos.x); t.tz = Math.round(tg.pos.z); }
      }
      if (!p.mission || p.mission.vtrip !== t.id) { if (!p.fight) { p.mission = { type: 'stroll', x: t.tx, z: t.tz, until: S.t + 1440 * 2, dur: 40, vtrip: t.id }; p.action = null; } continue; }
      p.mission.x = t.tx; p.mission.z = t.tz;
      const d = Math.hypot(p.pos.x - t.tx, p.pos.z - t.tz);
      if (d <= (t.deed === 'avenge' ? 3 : 3.5)) {
        // 夜を待つ（盗み・聖地荒らしは、用心深い者ほど暗くなってから）
        const h = sim.hour();
        if ((t.deed === 'steal' || t.deed === 'sacrilege') && h >= 6 && h < 21 && p.pers.C > 0.4 && !t.waited && S.t - t.start < 1440 * 1.6) { continue; }
        arriveTrip(sim, t, p);
      }
    } else if (t.stage === 'back') {
      const home = sim.town(p.s);
      if (!p.mission || p.mission.vtrip !== t.id) { if (!p.fight && home) { p.mission = { type: 'stroll', x: home.x, z: home.z, until: S.t + 1440 * 2, dur: 30, vtrip: t.id }; p.action = null; } }
      if (home && Math.hypot(p.pos.x - home.x, p.pos.z - home.z) <= home.r + 1) drop();
    }
  }
}
function goBack(sim, t, p) {
  const home = sim.town(p.s);
  t.stage = 'back';
  if (home) { p.mission = { type: 'stroll', x: home.x, z: home.z, until: sim.S.t + 1440 * 2, dur: 30, vtrip: t.id }; p.action = null; }
}
// その場にいて、見ている人
function onlookers(sim, pos, r, ex = []) {
  return sim.living().filter((q) => !ex.includes(q) && q.jail == null && !(q.action?.type === 'sleep' && q.action.phase === 'do') && Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) < r && (q.inside == null || Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) < 3));
}
function arriveTrip(sim, t, p) {
  const S = sim.S, R = sim.rng;
  switch (t.deed) {
    case 'steal': doSteal(sim, t, p); break;
    case 'poach': doPoach(sim, t, p); break;
    case 'sacrilege': doSacrilege(sim, t, p); break;
    case 'avenge': doAvenge(sim, t, p); break;
    case 'elope': doElope(sim, t, p); return;
    case 'visit': {
      const lover = S.people[t.data.lover];
      if (alive(lover)) { sim.relMut(p, lover).a += 3; sim.relMut(lover, p).a += 3; sim.remember(p, `${lover.given}に会いに、${sim.town(t.to)?.name}まで出かけた`, { emo: 0.6, imp: 0.5, about: [lover.id], k: 'romance' }); if (lover.inside == null && !lover.talk && !p.talk && !lover.fight) { lover.action = null; } }
      break;
    }
    case 'barter': doBarter(sim, t, p); break;
    case 'envoy': case 'kenvoy': envoyArrived(sim, t, p); break;
    case 'flee': fugitiveArrives(sim, t, p); XV(sim).trips.splice(XV(sim).trips.indexOf(t), 1); if (p.mission?.vtrip === t.id) p.mission = null; return;
    case 'hostage': case 'wed': XV(sim).trips.splice(XV(sim).trips.indexOf(t), 1); if (p.mission?.vtrip === t.id) p.mission = null; return;
  }
  if (XV(sim).trips.includes(t)) goBack(sim, t, p);
}

// 盗み：よその村・里・町の家から銅貨を盗む
function doSteal(sim, t, p) {
  const S = sim.S, R = sim.rng, s = sim.town(t.to);
  if (!s) return;
  const vk = partyKeyOfSid(sim, s.id), pk = partyKeyOf(sim, p);
  const hhs = Object.values(S.households).filter((h) => h.s === s.id && h.house != null && h.money > 20 && !h.royal && !h.members.includes(p.id));
  if (!hhs.length) return;
  const b0 = hhs.map((h) => ({ h, b: sim.building(h.house) })).filter((x) => x.b).sort((a, b) => Math.hypot(a.b.door.x - p.pos.x, a.b.door.z - p.pos.z) - Math.hypot(b.b.door.x - p.pos.x, b.b.door.z - p.pos.z))[0];
  if (!b0) return;
  const { h: vh, b } = b0;
  p.pos = { x: b.door.x, z: b.door.z };
  const night = sim.hour() >= 21 || sim.hour() < 5;
  const wit = onlookers(sim, p.pos, 6, [p]).filter((q) => partyKeyOf(sim, q) !== pk);
  const skill = p.skill.thief || 0.15;
  const ok = R.chance(clamp(0.5 + p.pers.C * 0.15 + skill * 0.3 - wit.length * 0.12 - (night ? 0 : 0.2), 0.05, 0.92));
  let loot = 0;
  if (ok) {
    loot = xfer(hhAcct(vh), hhAcct(sim.hh(p)), Math.min(35, vh.money * 0.25) * R.range(0.6, 1.2));
    p.skill.thief = Math.min(1, skill + 0.03);
    sim.remember(p, `${s.name}の${b.name}に忍び込み、${r0(loot)}銅貨を盗んだ`, { emo: 0.2 - p.values.faith * 0.4, imp: 0.7, k: 'uwcrime' });
  } else sim.remember(p, `${s.name}で盗みに入ろうとしたが、しくじった`, { emo: -0.5, imp: 0.6, k: 'uwcrime' });
  stat(sim, 'steal');
  // 見つかったか
  const seen = wit.filter((q) => R.chance(ok ? 0.45 + (1 - q.pers.A) * 0.2 : 0.85));
  const victims = vh.members.map((id) => S.people[id]).filter(alive);
  if (seen.length) {
    for (const q of seen) sim.remember(q, `${nameOf(sim, pk)}の${p.given}が、${b.name}に忍び込むのを見た`, { emo: -0.6, imp: 0.7, about: [p.id], k: 'crime' });
    sim.gossip(p, `${s.name}で盗みを働いたらしい`, -0.7, seen, { silent: true });
    if (P(sim, vk)?.kind === 'kingdom') markWantedQuiet(sim, p, '盗み', 10);
    const lawful = seen.find((q) => ['guard', 'knight', 'soldier', 'watchman', 'gatekeeper', 'militia', 'vguard'].includes(q.job));
    if (lawful && !lawful.fight) startFight(sim, lawful, p, false);
    for (const q of victims) sim.remember(q, `${nameOf(sim, pk)}の${p.given}に家の銅貨を${r0(loot)}枚盗まれた`, { emo: -0.8, imp: 0.8, about: [p.id], k: 'theft' });
    openIncident(sim, { type: 'theft', a: vk, b: pk, culprit: p.id, victim: victims[0]?.id ?? null, harm: 2 + loot / 12, amt: loot, known: true, where: p.pos });
  } else if (ok) {
    for (const q of victims) if (sim.ageOf(q) >= 10) sim.remember(q, `家から${r0(loot)}銅貨が盗まれていた`, { emo: -0.7, imp: 0.7, k: 'theft' });
    // 見かけない顔を見た者がいれば、どこの者かは知られる。いなければ、嫌っている相手が疑われる
    const glimpse = wit.filter((q) => !seen.includes(q));
    if (glimpse.length && R.chance(0.6)) {
      for (const q of glimpse) sim.remember(q, `夜ふけに、見かけない${nameOf(sim, pk)}の者がうろついていた`, { emo: -0.3, imp: 0.5, k: 'crime' });
      openIncident(sim, { type: 'theft', a: vk, b: pk, culprit: null, victim: victims[0]?.id ?? null, harm: 1.5 + loot / 15, amt: loot, known: false, suspect: true, where: p.pos });
    } else suspicion(sim, vk, 'theft', loot, victims[0], p.pos, pk);
  }
}
function markWantedQuiet(sim, p, crime, days) {
  const cur = sim.S.wanted[p.id];
  sim.S.wanted[p.id] = { crime, days: (cur?.days || 0) + days, since: sim.today, kingdom: sim.townOf(p).kingdom, bounty: (cur?.bounty || 0) + Math.round(days / 2), _v: 1 };
  if (p.rank !== 'outlaw') p.rankBefore = p.rankBefore || p.rank;
  if (!['king', 'royal', 'noble'].includes(p.rank)) p.rank = 'outlaw';
}
// 犯人がわからないとき：被害を受けた側は、ふだん嫌っている相手を疑う（濡れ衣のこともある）
function suspicion(sim, vk, type, amt, victim, pos, truth = null) {
  const S = sim.S, R = sim.rng;
  const vq = P(sim, vk);
  if (!vq) return;
  const cands = allParties(sim).filter((k) => k !== vk && !P(sim, k)?.dead && Math.hypot(P(sim, k).x - vq.x, P(sim, k).z - vq.z) < 320);
  let best = null, bs = 0;
  for (const k of cands) { const f = feel(sim, vk, k); const sc = -f / 30 + (k[0] === 'h' ? 1.2 : 0) + R.range(0, 0.6); if (sc > bs) { bs = sc; best = k; } }
  if (!best || bs < 1.1) return;
  const m = mind(sim, vk);
  if (m.A > 0.72) return;   // 疑い深くない長は、証しもなく人を責めない
  stat(sim, best === truth ? 'suspectRight' : 'suspectWrong');
  tell(sim, vk, `盗みは${nameOf(sim, best)}の者のしわざにちがいないと、みんな言い合った`, -0.4, 0.6, 6);
  openIncident(sim, { type: type, a: vk, b: best, culprit: null, victim: victim?.id ?? null, harm: 1.5 + amt / 15, amt, known: false, suspect: true, wrong: best !== truth, where: pos });
}
// 密猟：よその土地（里の猟場・王家の森）で獲物をとる
function doPoach(sim, t, p) {
  const S = sim.S, R = sim.rng;
  const vk = partyKeyOfSid(sim, t.to), pk = partyKeyOf(sim, p);
  const gain = R.range(2, 5);
  const home = S.towns[p.s];
  if (home) home.stock.meat = (home.stock.meat || 0) + gain;
  const hh = sim.hh(p); if (hh) hh.food += 2;
  sim.remember(p, `${sim.town(t.to)?.name}のあたりの猟場で、こっそり獲物を仕留めた`, { emo: 0.3, imp: 0.5, k: 'hunt' });
  stat(sim, 'poach');
  const wit = onlookers(sim, p.pos, 14, [p]).filter((q) => partyKeyOf(sim, q) === vk && sim.isAdult(q));
  if (wit.length && R.chance(0.35 + wit.length * 0.15)) {
    for (const q of wit) sim.remember(q, `${nameOf(sim, pk)}の${p.given}が、うちの猟場で獲物をとっていた`, { emo: -0.5, imp: 0.6, about: [p.id], k: 'crime' });
    sim.gossip(p, `${nameOf(sim, vk)}の猟場で密猟をしたらしい`, -0.5, wit, { silent: true });
    openIncident(sim, { type: 'poach', a: vk, b: pk, culprit: p.id, harm: 1.5, known: true, where: p.pos });
  }
}
// 聖地荒らし：民族の祠や、町の教会の供え物に手を出す
function doSacrilege(sim, t, p) {
  const S = sim.S, R = sim.rng;
  const vk = partyKeyOfSid(sim, t.to), pk = partyKeyOf(sim, p);
  const b = sim.building(t.data.bid);
  const m = S.towns[t.to];
  const took = xfer(acct(sim, 's' + t.to), hhAcct(sim.hh(p)), Math.min(25, (m?.fund || 0) * 0.15));
  if (m && m.stock.gem > 0.3) { m.stock.gem -= 0.3; const home = S.towns[p.s]; if (home) home.stock.gem = (home.stock.gem || 0) + 0.3; }
  sim.remember(p, `${b?.name || '祠'}の供え物に手を出し、${r0(took)}銅貨ぶんを持ち帰った`, { emo: 0.1 - p.values.faith * 0.6, imp: 0.8, k: 'uwcrime' });
  stat(sim, 'sacrilege');
  const tq = P(sim, vk);
  if (tq?.kind === 'tribal' && tq.TV) tq.TV.faith = clamp((tq.TV.faith || 60) - 4, 0, 100);
  const wit = onlookers(sim, p.pos, 8, [p]).filter((q) => partyKeyOf(sim, q) === vk);
  const known = wit.length > 0 && R.chance(0.7);
  if (known) for (const q of wit) sim.remember(q, `${nameOf(sim, pk)}の${p.given}が、${b?.name || '祠'}を荒らしていた`, { emo: -0.9, imp: 0.9, about: [p.id], k: 'crime' });
  tell(sim, vk, `${b?.name || '祠'}の供え物が荒らされていた。罰当たりな`, -0.8, 0.8, 8);
  openIncident(sim, { type: 'sacrilege', a: vk, b: known ? pk : null, culprit: known ? p.id : null, harm: tq?.kind === 'tribal' ? 7 : 4, amt: took, known, where: p.pos, trueB: pk });
}
// 仇討ち：身内を殺した相手を追って、よその村や町へ
function doAvenge(sim, t, p) {
  const S = sim.S, tg = S.people[t.data.target];
  if (!alive(tg)) return;
  if (tg.inside != null) { const b = sim.building(tg.inside); tg.pos = { ...b.door }; tg.inside = null; }
  for (const e of [p, tg]) { e.talk = null; if (e.inside != null) { const b = sim.building(e.inside); e.pos = { ...b.door }; e.inside = null; } }
  // 命のやりとり（殴り合いにならないよう、じかに刃を向ける）
  p.fight = { target: tg.id, cd: 0, lethal: true };
  if (!tg.fight) tg.fight = { target: p.id, cd: 0.5, lethal: true };
  sim.remember(p, `${t.data.why || '身内の仇'}を討つため、${tg.given}に刃を向けた`, { emo: -0.3, imp: 1, about: [tg.id], k: 'feud' });
  sim.remember(tg, `${nameOf(sim, partyKeyOf(sim, p))}の${p.given}が、仇だと叫んで斬りかかってきた`, { emo: -0.9, imp: 1, about: [p.id], k: 'feud' });
  if (sim.isWatched(p)) sim.events.push({ type: 'say', id: p.id, text: `${tg.given}！ ${t.data.why || '仇'}、ここで晴らす！` });
  sim.pushLog(`${nameOf(sim, partyKeyOf(sim, p))}の${sim.fullName(p)}が、仇の${sim.fullName(tg)}に斬りかかった。`, 'event', [p.id, tg.id], p.pos);
  stat(sim, 'avenge');
  p.revenge = null; p.vAvenge = null;
}
// 駆け落ち：恋人と二人で、どちらの家も届かない土地へ
function doElope(sim, t, p) {
  const S = sim.S, R = sim.rng, X = XV(sim);
  const lover = S.people[t.data.lover];
  X.trips.splice(X.trips.indexOf(t), 1);
  if (p.mission?.vtrip === t.id) p.mission = null;
  if (!alive(lover) || lover.spouseId != null || p.spouseId != null) return;
  const dest = sim.town(t.to);
  if (!dest) return;
  const [m, w] = p.sex === 'm' ? [p, lover] : [lover, p];
  const ka = partyKeyOf(sim, p), kb = partyKeyOf(sim, lover);
  const hhA = sim.hh(p), hhB = sim.hh(lover);
  const hid = S.nextHh++;
  const hh = S.households[hid] = { id: hid, members: [], house: null, s: dest.id, money: 0, food: 2, comfort: 0, name: `${m.family}の家`, vil: !!dest.indep };
  xfer(hhAcct(hhA), hhAcct(hh), Math.min(30, (hhA?.money || 0) * 0.2));
  xfer(hhAcct(hhB), hhAcct(hh), Math.min(30, (hhB?.money || 0) * 0.2));
  const house = dest.indep ? (freeHouse(sim, dest) || placeHouseIn(sim, dest, hh.name)) : (sim.placeHouse(dest) || freeHouse(sim, dest));
  if (house) { hh.house = house.id; house.hh = hid; house.owner = house.owner ?? hid; house.name = hh.name; house.value = house.value || houseValue(sim, house); } else hh.street = true;
  for (const x of [m, w]) { sim.moveTo(x, hh); x.s = dest.id; x.action = null; x.mission = null; }
  sim.marry(m, w, true);
  for (const x of [m, w]) sim.remember(x, `家族の反対を振り切って、${(x === m ? w : m).given}と${dest.name}へ駆け落ちした`, { emo: 0.6, imp: 1, about: [(x === m ? w : m).id], k: 'elope' });
  stat(sim, 'elope');
  note(sim, [ka, kb, 's' + dest.id].filter((k) => isVillageKey(sim, k)), `${nameOf(sim, ka)}の${p.given}と${nameOf(sim, kb)}の${lover.given}が、家の反対を振り切って${dest.name}へ駆け落ちした`, 2, dest);
  // 残された家族：相手の側に怒りが向く。許嫁がいたなら、許嫁の側の面目もつぶれる
  for (const [x, other, xk, ok] of [[p, lover, ka, kb], [lover, p, kb, ka]]) {
    const fam = [S.people[x.fatherId], S.people[x.motherId]].filter(alive);
    for (const f of fam) sim.remember(f, `${x.given}が${nameOf(sim, ok)}の${other.given}とどこかへ行ってしまった`, { emo: -0.8, imp: 0.95, about: [x.id, other.id], k: 'elope' });
    if (fam.some((f) => f.pers.A < 0.5 || f.values.family > 0.6) && ok !== xk) openIncident(sim, { type: 'elope', a: xk, b: ok, culprit: other.id, victim: x.id, harm: 2.5, known: true, where: dest });
    const bt = x.vBetrothed != null ? S.people[x.vBetrothed] : null;
    if (bt && alive(bt)) {
      const bk = partyKeyOf(sim, bt);
      sim.remember(bt, `許嫁の${x.given}が、ほかの者と駆け落ちした`, { emo: -0.9, imp: 1, about: [x.id], k: 'romance' });
      bt.vBetrothed = null; x.vBetrothed = null;
      if (bk !== xk) openIncident(sim, { type: 'jilt', a: bk, b: xk, culprit: x.id, victim: bt.id, harm: 4, known: true, where: dest });
    }
  }
}
// 交易：村の産物をよその市へ運んで、麦や道具と換える
function doBarter(sim, t, p) {
  const S = sim.S, from = S.towns[p.s], to = S.towns[t.to], R = sim.rng;
  if (!from || !to) return;
  const V = XV(sim).list[sim.town(p.s)?.vid];
  const goods = t.data.goods || {};
  sim.mcash(t.to);
  let got = 0;
  for (const [g, n] of Object.entries(goods)) {
    to.stock[g] = (to.stock[g] || 0) + n;
    const val = Math.min(n * (to.price[g] || GOODS[g].base) * 0.8, to.cash);
    to.cash -= val; got += val;
  }
  // 代金の6割は村の蓄えへ、4割は運んだ者の家へ
  const fundPart = got * 0.6;
  if (from) from.fund = (from.fund || 0) + fundPart;
  const hh = sim.hh(p); if (hh) hh.money += got - fundPart;
  // 村に足りないものを買って帰る（村の蓄えから相手の市の金庫へ）
  const want = (V ? KINDS[V.kind].wants : ['wheat']).filter((g) => GOODS[g]);
  for (const g of want) {
    const n = Math.min(4, Math.floor(to.stock[g] || 0));
    if (n <= 0) continue;
    const cost = n * (to.price[g] || GOODS[g].base);
    if ((from.fund || 0) < cost + 20) continue;
    from.fund -= cost; to.cash += cost; to.stock[g] -= n; from.stock[g] = (from.stock[g] || 0) + n;
  }
  const vk = partyKeyOfSid(sim, t.to), pk = partyKeyOf(sim, p);
  addFeel(sim, vk, pk, 0.6, null, 1);
  sim.remember(p, `${sim.town(t.to).name}の市へ村の品を運び、${r0(got)}銅貨になった`, { emo: 0.4, imp: 0.4, k: 'trade' });
  stat(sim, 'barter');
}

// ========================================================================================
// 4. 毎日
// ========================================================================================
export function villagesDaily(sim) {
  const S = sim.S;
  const X = ensureVillages(sim);
  if (!X.list.length) return;
  const m0 = sim._vAudit ? moneyTotal(sim) : 0;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  sim._vIn = true;
  for (const V of X.list) {
    if (V.state === 'ruin') { resettle(sim, V); continue; }
    const s = sim.town(V.sid);
    if (!s) continue;
    if (s.annexed == null && V.annexed != null) V.annexed = null;
    upkeep(sim, V, s);
    if (checkRuin(sim, V, s)) continue;
    crisis(sim, V, s);
    if (V.annexed == null) { kingdomPressure(sim, V); banditPressure(sim, V); }
    monsterWatch(sim, V);
  }
  deedsDaily(sim);
  watchMarriages(sim);
  pollWanted(sim);
  pollCases(sim);
  fugitives(sim);
  stepIncidents(sim);
  stepPacts(sim);
  peaceDaily(sim);
  relDecay(sim);
  sim._vIn = false;
  if (t0) sim._vMs = (sim._vMs || 0) + performance.now() - t0;
  if (sim._vAudit) { const d = moneyTotal(sim) - m0; X.stats.leak = (X.stats.leak || 0) + d; }
}

// ---------- 村の手入れ：仕事・長・蓄え ----------
function upkeep(sim, V, s) {
  const S = sim.S, R = sim.rng, K = KINDS[V.kind];
  const here = sim.living().filter((p) => p.s === V.sid);
  const count = {};
  for (const p of here) if (p.job) count[p.job] = (count[p.job] || 0) + 1;
  const allowed = new Set([...Object.keys(K.jobs), 'vchief']);
  for (const p of here) {
    if (p.vOrigin == null && sim.ageOf(p) < 1) p.vOrigin = V.id;
    const age = sim.ageOf(p);
    if (age >= 14 && age < 68 && p.job && !allowed.has(p.job) && !['adventurer', 'warrior', 'archer', 'cleric', 'sage', 'paladin', 'thief', 'banditchief'].includes(p.job) && p.jail == null) {
      const par = [S.people[p.fatherId], S.people[p.motherId]].find((q) => q && allowed.has(q.job) && q.job !== 'vchief');
      const job = par && R.chance(0.6) ? par.job : pickJob(sim, Object.entries(K.jobs), count, p);
      count[job] = (count[job] || 0) + 1;
      p.job = job; p.rank = JOBS[job].rank; p.skill[job] = Math.max(p.skill[job] || 0, 0.25); p.plan = null; p.shop = null;
      if (JOBS[job].combat) { armVillager(p, R); Object.assign(p, humanStats(sim, p)); }
    }
  }
  // 長がいなくなったら、村の決まり方で次の長を選ぶ
  const chief = S.people[V.chief];
  if (!alive(chief) || chief.s !== V.sid || chief.jail != null) chooseChief(sim, V, here, chief);
  const t = S.towns[V.sid];
  // 週に一度、暮らしに余裕のある家が村の蓄えに積み立てる（出どころ：家計 → 行き先：村の蓄え）
  if (sim.today % 7 === 3) for (const hh of Object.values(S.households)) if (hh.s === V.sid && hh.money > 40 && !hh.bandits) { const x = (hh.money - 40) * 0.06; hh.money -= x; t.fund += x; }
  // 村の守り手への手当て（村の蓄え → 家計）。蓄えに余裕があるときだけ
  if (sim.today % 3 === 0 && t.fund > 60) for (const p of here) if (p.job === 'vguard') xfer(acct(sim, 's' + V.sid), hhAcct(sim.hh(p)), 1.5);
  // 飢えの見張り
  const pop = Math.max(1, here.length);
  const food = Object.values(S.households).filter((h) => h.s === V.sid).reduce((a, h) => a + (h.food || 0), 0) + (t.stock.wheat || 0) * 0.5 + (t.stock.bread || 0) + (t.stock.meat || 0) + (t.stock.fish || 0);
  V.foodIdx = food / pop;
  V.hunger = V.foodIdx < 1.2 ? (V.hunger || 0) + 1 : Math.max(0, (V.hunger || 0) - 1);
  V.loss = (V.loss || []).filter((l) => sim.today - l.d <= 20);
  // 村の品を運んで売りに行く（ときどき）
  if (sim.today % 3 === V.id % 3 && XV(sim).trips.length < MAX_TRIPS) barterTrip(sim, V, here);
}
function chooseChief(sim, V, here, old) {
  const S = sim.S, R = sim.rng, K = KINDS[V.kind];
  const ad = here.filter((p) => sim.ageOf(p) >= 25 && sim.ageOf(p) < 75 && p.jail == null && !p.vHostage);
  if (!ad.length) return;
  let next = null, how = '';
  const byScore = (f) => ad.slice().sort((a, b) => f(b) - f(a))[0];
  switch (K.succession) {
    case 'strength': next = byScore((p) => (p.lv || 1) * 10 + (p.atk || 0)); how = '腕比べで勝ち残り'; break;
    case 'council': next = byScore((p) => ad.reduce((s, q) => s + (q.rel[p.id]?.a || 0), 0) + sim.ageOf(p) * 0.5); how = '寄り合いで推され'; break;
    case 'skill': next = byScore((p) => (p.skill.miner || 0) * 60 + sim.ageOf(p) * 0.4 + (p.fame || 0)); how = '坑夫たちに腕を認められ'; break;
    case 'faith': next = byScore((p) => p.values.faith * 50 + sim.ageOf(p) * 0.5); how = '祈りの深さを認められ'; break;
    case 'wealth': next = byScore((p) => (sim.hh(p)?.money || 0) + (p.fame || 0) * 3); how = '顔の広さを買われ'; break;
    default: {
      next = old ? ad.find((p) => p.fatherId === old.id && sim.ageOf(p) >= 28) : null;
      how = next ? '父のあとを継いで' : '年寄りたちに選ばれ';
      if (!next) next = byScore((p) => (p.fame || 0) + sim.ageOf(p));
    }
  }
  if (!next) return;
  if (old && old.job === 'vchief' && alive(old)) { old.job = old.formerJob || 'farmer'; old.vTitle = null; }
  next.formerJob = next.job; next.job = 'vchief'; next.rank = 'commoner'; next.vTitle = V.title; next.fame = (next.fame || 0) + 10;
  V.chief = next.id;
  sim.remember(next, `${how}、${V.name}の${V.title}になった`, { emo: 0.6, imp: 0.95, k: 'village' });
  if (old) note(sim, ['s' + V.sid], `${V.name}で、${sim.fullName(next)}が${how}新しい${V.title}になった`, 1, sim.town(V.sid));
}
function barterTrip(sim, V, here) {
  const S = sim.S, R = sim.rng, K = KINDS[V.kind], t = S.towns[V.sid];
  const goods = {};
  let n = 0;
  for (const g of K.goods) { const have = t.stock[g] || 0, keep = GOODS[g].target * 0.4; if (have > keep + 2) { const q = Math.min(8, (have - keep) * 0.5); goods[g] = q; t.stock[g] -= q; n += q; } }
  if (n < 2) { for (const [g, q] of Object.entries(goods)) t.stock[g] += q; return; }
  const trader = here.filter((p) => sim.isAdult(p) && sim.ageOf(p) < 60 && !p.mission && p.jail == null && p.job !== 'vchief' && !p.fight).sort((a, b) => (b.pers.E + b.pers.C + (p2job(b) ? 0.5 : 0)) - (a.pers.E + a.pers.C + (p2job(a) ? 0.5 : 0)))[0];
  // 行き先：気持ちのよい、近い市（村・里・町）
  const me = 's' + V.sid;
  const dests = sim.S.world.settlements.filter((q) => q.id !== V.sid && !q.abandoned && !S.towns[q.id]?.occupied && Math.hypot(q.x - V.x, q.z - V.z) < 230);
  let best = null, bs = -Infinity;
  for (const q of dests) { const k = partyKeyOfSid(sim, q.id); const f = feel(sim, me, k); if (f < -35) continue; const sc = f / 20 - Math.hypot(q.x - V.x, q.z - V.z) / 70 + (q.type === 'capital' ? 0.6 : 0) + R.range(0, 1); if (sc > bs) { bs = sc; best = q; } }
  if (!trader || !best) { for (const [g, q] of Object.entries(goods)) t.stock[g] += q; return; }
  const spot = sim.randomNear(best.x, best.z, 2) || { x: best.x, z: best.z };
  if (!newTrip(sim, trader, 'barter', best.id, spot, { goods })) for (const [g, q] of Object.entries(goods)) t.stock[g] += q;
}
const p2job = (p) => ['weaver', 'tailor', 'innkeeper', 'brewer', 'carpenter', 'miner'].includes(p.job);

// ---------- 村人ひとりひとりの思い：盗み・密猟・聖地荒らし・仇討ち・恋 ----------
function deedsDaily(sim) {
  const S = sim.S, R = sim.rng, X = XV(sim);
  if (X.trips.length >= MAX_TRIPS) return;
  // 動く者：独立村・民族の里の人、それに村の近くの王国の町の人
  const actorSids = new Set();
  for (const V of X.list) if (V.state !== 'ruin') { actorSids.add(V.sid); const near = nearestTownOf(sim, V); if (near) actorSids.add(near.id); }
  for (const TV of S.tribes?.villages || []) if (!TV.gone) actorSids.add(TV.sid);
  const villageSids = [...actorSids].filter((sid) => isVillageKey(sim, partyKeyOfSid(sim, sid)));
  const rich = new Map();
  for (const h of Object.values(S.households)) if (h.money > 30 && h.house != null) rich.set(h.s, (rich.get(h.s) || 0) + 1);
  sim._vRich = rich;
  for (const sid of actorSids) {
    const s = sim.town(sid);
    if (!s || s.abandoned) continue;
    if (!R.chance(0.45)) continue;
    const pk = partyKeyOfSid(sim, sid);
    const vq = P(sim, pk);
    const hungry = vq?.V?.hunger >= 2;
    const people = sim.living().filter((p) => p.s === sid && sim.ageOf(p) >= 16 && sim.ageOf(p) <= 50 && p.jail == null && !p.mission && !p.quest && !p.fight && !p.away && p.job !== 'vchief' && !['king', 'royal', 'noble'].includes(p.rank) && !p.vHostage && (p.vLastDeed == null || sim.today - p.vLastDeed >= 12));
    let best = null;
    for (const p of people) for (const opt of deedOptions(sim, p, pk, sid, hungry, villageSids)) if (!best || opt.sc > best.sc) best = opt;
    if (!best || best.sc <= 0) continue;
    const spot = best.spot || best.spotFn?.();
    if (!spot) continue;
    best.spot = spot;
    const t = newTrip(sim, best.p, best.deed, best.to, spot, best.data || {});
    if (t && best.deed === 'elope') { const lv = S.people[best.data.lover]; if (lv && alive(lv)) { lv.mission = { type: 'stroll', x: best.spot.x, z: best.spot.z, until: S.t + 1440 * 2.5, dur: 40 }; lv.action = null; } }
    if (t) sim.remember(best.p, deedMotive(sim, best), { emo: -0.1, imp: 0.5, k: 'plan' });
  }
}
function deedMotive(sim, o) {
  const nm = sim.town(o.to)?.name || 'よそ';
  switch (o.deed) {
    case 'steal': return o.why === 'need' ? `家に銅貨がない。${nm}まで行けば、どうにかなると思った` : `${nm}の連中から少しいただいても罰は当たらないと思った`;
    case 'poach': return `${nm}のあたりの猟場なら、獲物がいると思った`;
    case 'sacrilege': return `${nm}の祠の供え物なんて、ただの迷信の飾りだと思った`;
    case 'avenge': return `${sim.S.people[o.data.target]?.given || '仇'}を許せない。${nm}まで行くと決めた`;
    case 'elope': return `${sim.S.people[o.data.lover]?.given}と一緒になれないなら、村を捨てると決めた`;
    case 'visit': return `${sim.S.people[o.data.lover]?.given}に会いたくて、${nm}まで行くことにした`;
  }
  return `${nm}へ出かけることにした`;
}
function nearestTownOf(sim, V) {
  let best = null, bd = 1e9;
  for (const s of sim.S.world.settlements) { if (s.indep || s.tribal || s.abandoned) continue; const d = Math.hypot(s.x - V.x, s.z - V.z); if (d < bd) { bd = d; best = s; } }
  return best;
}
function deedOptions(sim, p, pk, sid, hungry, villageSids) {
  const S = sim.S, R = sim.rng, out = [];
  const me = sim.town(sid);
  const hh = sim.hh(p);
  const bad = (1 - p.pers.A) * 1.2 + (1 - p.pers.C) * 0.4 + p.values.ambition * 0.4 + p.pers.N * 0.2;
  const need = (hh?.money ?? 0) < 15 ? 1 : (hh?.money ?? 0) < 40 ? 0.4 : 0;
  const starving = p.needs.hunger < 30 ? 0.6 : 0;
  const iAmTown = P(sim, pk)?.kind === 'kingdom';
  // 狙う先：村（村の人は、よその村と近くの王国の町も）
  const targets = (iAmTown ? villageSids : [...villageSids, ...S.world.settlements.filter((q) => !q.indep && !q.tribal && !q.abandoned).map((q) => q.id)]).filter((t) => t !== sid);
  for (const tsid of targets) {
    const ts = sim.town(tsid);
    if (!ts || ts.abandoned) continue;
    const d = Math.hypot(ts.x - me.x, ts.z - me.z);
    if (d > 240) continue;
    const tk = partyKeyOfSid(sim, tsid);
    if (tk === pk) continue;
    const f = feel(sim, pk, tk);
    const far = d / 120;
    const tq = P(sim, tk);
    // 盗み
    if (!iAmTown || tq.kind !== 'kingdom') {
      const wealth = (sim._vRich?.get(tsid) || 0) > 2 ? 0.3 : -1;
      const sc = bad * 1.25 + need * 1.2 + starving + (p.skill.thief || 0) * 1.5 + (hungry ? 0.4 : 0) - f / 60 - p.values.faith * 0.5 - far + wealth - 2.5 + R.range(-0.3, 0.3);
      out.push({ p, deed: 'steal', to: tsid, sc, why: need || starving ? 'need' : 'greed', spotFn: () => sim.randomNear(ts.x, ts.z, Math.max(2, ts.r - 2)) || { x: ts.x, z: ts.z } });
    }
    // 密猟（狩人・薬草摘み・飢えた村）
    if (['hunter', 'gatherer', 'mercenary', 'charcoal'].includes(p.job) || hungry) {
      const sc = (p.job === 'hunter' ? 0.7 : 0.2) + (hungry ? 0.8 : 0) + need * 0.6 + (1 - p.pers.C) * 0.5 - f / 70 - far * 1.2 - 1.7 + R.range(-0.3, 0.3);
      out.push({ p, deed: 'poach', to: tsid, sc, spotFn: () => sim.randomNear(ts.x, ts.z, ts.r + 12, (t, x, z) => Math.max(Math.abs(x - ts.x), Math.abs(z - ts.z)) > ts.r + 4 && (t === T.FOREST || t === T.GRASS || t === T.SAVANNA || t === T.DENSE || t === T.SNOW)) });
    }
    // 聖地荒らし（民族の祠・町の教会）
    if (tq.kind === 'tribal' || (tq.kind === 'kingdom' && !iAmTown)) {
      const shrine = tq.kind === 'tribal' ? sim.building(tq.TV?.shrine) : sim.townBuilding(ts, 'church');
      if (shrine) {
        const sc = p.pers.O * 0.7 + (1 - p.values.faith) * 1.3 + bad * 0.6 + p.values.ambition * 0.3 + need * 0.5 - f / 60 - far - 3.0 + R.range(-0.3, 0.3);
        out.push({ p, deed: 'sacrilege', to: tsid, sc, spot: { x: shrine.door.x, z: shrine.door.z }, data: { bid: shrine.id } });
      }
    }
  }
  // 仇討ち：身内を殺した相手が、よその村や町にいる
  const rv = p.revenge != null ? S.people[p.revenge] : null;
  const av = p.vAvenge?.pid != null ? S.people[p.vAvenge.pid] : null;
  for (const tg of [rv, av]) {
    if (!alive(tg) || tg.s === p.s || tg.jail != null) continue;
    const ts = sim.town(tg.s);
    if (!ts || Math.hypot(ts.x - me.x, ts.z - me.z) > 300) continue;
    const hate = -(p.rel[tg.id]?.a ?? -60);
    const sc = p.values.courage * 1.5 + (1 - p.pers.A) * 1.2 + hate / 60 + p.pers.N * 0.3 - 2.2 + R.range(-0.3, 0.3) - (hasLaw(sim, pk, 'no_blood') ? 3 : 0) + (hasLaw(sim, pk, 'eye_for_eye') ? 0.6 : 0);
    out.push({ p, deed: 'avenge', to: tg.s, sc, spot: { x: Math.round(tg.pos.x), z: Math.round(tg.pos.z) }, data: { target: tg.id, why: p.vAvenge?.why || '身内の仇' } });
  }
  // 恋：よその者に心を寄せている
  if (p.spouseId == null && sim.ageOf(p) >= 18 && sim.ageOf(p) <= 38) {
    for (const [id, r] of Object.entries(p.rel)) {
      if (r.a < 58) continue;
      const q = S.people[id];
      if (!alive(q) || q.s === p.s || q.spouseId != null || q.sex === p.sex || sim.ageOf(q) < 18 || sim.ageOf(q) > 40 || q.jail != null) continue;
      const qk = partyKeyOf(sim, q);
      if (qk === pk) continue;
      const qs = sim.town(q.s);
      if (!qs || Math.hypot(qs.x - me.x, qs.z - me.z) > 280) continue;
      const love = r.a / 100 + (q.rel[p.id]?.a ?? 0) / 100;
      const hostile = Math.min(feel(sim, pk, qk), feel(sim, qk, pk));
      const blocked = hostile < -12 || p.vBetrothed != null || [S.people[p.fatherId], S.people[p.motherId]].some((f) => alive(f) && f.pers.A < 0.35 && f.values.family > 0.6);
      if (blocked && (q.rel[p.id]?.a ?? 0) > 50) {
        const sc = love * 1.3 + p.pers.O * 0.8 + (1 - p.pers.C) * 0.4 + (p.vBetrothed != null ? 0.6 : 0) - p.values.family * 0.6 - 1.9 + R.range(-0.3, 0.3);
        const third = elopeDest(sim, p, q);
        if (third) out.push({ p, deed: 'elope', to: third.id, sc, spot: sim.randomNear(third.x, third.z, 2) || { x: third.x, z: third.z }, data: { lover: q.id } });
      } else {
        const sc = love * 1.2 + p.pers.E * 0.4 + (100 - p.needs.lust) / 100 - 1.3 + R.range(-0.3, 0.3);
        out.push({ p, deed: 'visit', to: q.s, sc, spot: q.inside == null ? { x: Math.round(q.pos.x), z: Math.round(q.pos.z) } : { x: qs.x, z: qs.z }, data: { lover: q.id } });
      }
    }
  }
  return out;
}
function elopeDest(sim, a, b) {
  const S = sim.S;
  const ka = partyKeyOf(sim, a), kb = partyKeyOf(sim, b);
  const sa = sim.town(a.s), cands = S.world.settlements.filter((q) => q.id !== a.s && q.id !== b.s && !q.abandoned && !S.towns[q.id]?.occupied && Math.hypot(q.x - sa.x, q.z - sa.z) < 320);
  let best = null, bs = -Infinity;
  for (const q of cands) {
    const k = partyKeyOfSid(sim, q.id);
    if (k === ka || k === kb) continue;
    const sc = (hasLaw(sim, k, 'guest') || hasLaw(sim, k, 'shelter') ? 1.2 : 0) + Math.min(feel(sim, k, ka), feel(sim, k, kb)) / 40 - Math.hypot(q.x - sa.x, q.z - sa.z) / 150 + sim.rng.range(0, 0.6);
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}

// ---------- 結婚の見張り：村と村・村と町の縁組 ----------
function watchMarriages(sim) {
  const S = sim.S;
  for (const p of sim.living()) {
    if (p._vs == null) { p._vs = p.s; p._vsp = p.spouseId; continue; }
    if (p.spouseId !== p._vsp && p.spouseId != null && p.id < p.spouseId) {
      const q = S.people[p.spouseId];
      if (q && q._vs != null) {
        const ka = partyKeyOfSid(sim, p._vs), kb = partyKeyOfSid(sim, q._vs);
        if (ka && kb && ka !== kb && (isVillageKey(sim, ka) || isVillageKey(sim, kb))) {
          const eloped = [p, q].some((x) => x.memories?.some((m) => m.k === 'elope' && sim.today - m.t <= 2));
          if (!eloped) {
            addFeel(sim, ka, kb, 8, `${nameOf(sim, ka)}の${p.given}と${nameOf(sim, kb)}の${q.given}が結ばれた`, 1);
            note(sim, [ka, kb], `${nameOf(sim, ka)}の${p.given}と${nameOf(sim, kb)}の${q.given}が結ばれ、二つの村に縁ができた`, 1, p.pos);
            tell(sim, ka, `${p.given}が${nameOf(sim, kb)}の${q.given}と結ばれた`, 0.4, 0.5, 5, [p.id]);
            tell(sim, kb, `${q.given}が${nameOf(sim, ka)}の${p.given}と結ばれた`, 0.4, 0.5, 5, [q.id]);
            stat(sim, 'union');
          }
        }
      }
    }
    p._vsp = p.spouseId;
    if (p.spouseId == null || sim.today % 5 === 0) p._vs = p.s;
  }
}

// ---------- 手配の見張り：村人の悪事（村の中なら村の掟で裁く） ----------
function pollWanted(sim) {
  const S = sim.S, R = sim.rng;
  for (const [id, w] of Object.entries(S.wanted)) {
    if (!w || w._v) continue;
    const p = S.people[id];
    w._v = 1;
    if (!alive(p)) continue;
    const pk = partyKeyOf(sim, p);
    const q = P(sim, pk);
    if (!q || q.kind !== 'indep') continue;
    const home = sim.town(p.s);
    if (Math.hypot(p.pos.x - home.x, p.pos.z - home.z) <= home.r + 4) villageJustice(sim, q.V, p, w);
    else openIncident(sim, { type: 'crime', a: 'k' + w.kingdom, b: pk, culprit: p.id, harm: w.crime === '殺人' ? 8 : 2.5, known: true, crime: w.crime });
  }
}
// 村の裁き：王国には渡さない。掟と長の気質で決める
function villageJustice(sim, V, p, w) {
  const S = sim.S, R = sim.rng, me = 's' + V.sid;
  delete S.wanted[p.id];
  if (p.rank === 'outlaw') p.rank = p.rankBefore || 'commoner';
  const m = mind(sim, me);
  const grave = w.crime === '殺人' || w.crime === '放火' || w.crime === '誘拐';
  const opts = {
    forgive: m.A * 1.2 + (sim.kinTerm(m.p || p, p) ? 1.5 : 0) - (grave ? 3 : 0) + law(sim, me, 'forgive') * 0.3,
    fine: m.C * 0.8 + 0.6 - (grave ? 1 : 0) + law(sim, me, 'pay') * 0.3,
    exile: (hasLaw(sim, me, 'exile') ? 1.5 : 0) + (grave ? 2 : 0) + (1 - m.A) * 0.8 + (p.vStrikes || 0) * 0.8,
  };
  const how = choose(sim, opts);
  p.vStrikes = (p.vStrikes || 0) + 1;
  const victims = [];
  if (how === 'forgive') { sim.remember(p, `${w.crime}のことを、${V.title}に許してもらった`, { emo: 0.4, imp: 0.8, k: 'village' }); note(sim, [me], `${V.name}で${p.given}の${w.crime}が明るみに出たが、${V.title}は許した`, 1, p.pos); }
  else if (how === 'fine') {
    const paid = xfer(hhAcct(sim.hh(p)), acct(sim, me), 15 + (grave ? 20 : 0));
    sim.remember(p, `${w.crime}の償いに、${r0(paid)}銅貨を村の蓄えに納めさせられた`, { emo: -0.5, imp: 0.8, k: 'village' });
    note(sim, [me], `${V.name}の寄り合いが、${w.crime}を働いた${p.given}に償いの銅貨を納めさせた`, 1, p.pos);
  } else exilePerson(sim, V, p, `${w.crime}の罪`);
  stat(sim, 'justice:' + how);
}
function exilePerson(sim, V, p, why) {
  const S = sim.S, R = sim.rng;
  const dest = nearestTownOf(sim, V);
  if (!dest) return;
  moveToSettlement(sim, p, dest, { inn: true });
  p.vExiled = V.id;
  sim.remember(p, `${why}で、${V.name}を追われた`, { emo: -0.9, imp: 1, k: 'village' });
  tell(sim, 's' + V.sid, `${p.given}が${why}で村を追われた`, -0.4, 0.6, 8, [p.id]);
  note(sim, ['s' + V.sid], `${V.name}の掟により、${sim.fullName(p)}が${why}で村を追われた`, 2, V);
  stat(sim, 'exile');
  // 追われた者の身内は、長を恨むこともある
  for (const q of sim.living()) if (q.s === V.sid && sim.kinTerm(q, p) && q.pers.A < 0.45) { const ch = S.people[V.chief]; if (alive(ch)) sim.relMut(q, ch).a -= 20; }
}
// ひとりを別の町へ移す（自分だけの世帯になる）
function moveToSettlement(sim, p, dest, opt = {}) {
  const S = sim.S, R = sim.rng;
  const old = sim.hh(p);
  if (old) { old.members = old.members.filter((id) => id !== p.id); if (!old.members.length) { const b = old.house != null ? sim.building(old.house) : null; if (b && b.type === 'house' && b.hh === old.id) { b.hh = null; b.name = '空き家'; } transferEstate(sim, old, null); delete S.households[old.id]; } }
  const hid = S.nextHh++;
  let house = null;
  if (opt.house) house = dest.indep ? (freeHouse(sim, dest) || placeHouseIn(sim, dest, `${p.family}の家`)) : freeHouse(sim, dest);
  const inn = !house ? sim.townBuilding(dest, 'tavern') : null;
  const hh = S.households[hid] = { id: hid, members: [p.id], house: house ? house.id : inn ? inn.id : null, inn: !house && !!inn, s: dest.id, money: 0, food: 1, comfort: 0, name: house ? `${p.family}の家` : `${p.family}（宿住まい）`, street: !house && !inn, vil: !!dest.indep };
  if (house) { house.hh = hid; house.owner = house.owner ?? hid; house.name = hh.name; }
  if (old && old.members.length) xfer(hhAcct(old), hhAcct(hh), Math.min(20, old.money * 0.15));
  p.hh = hid; p.s = dest.id; p.action = null; p.mission = null; p.path = null;
  sim.dirty();
  return hh;
}
// 家族ごと別の町へ移す
function moveHousehold(sim, hh, dest) {
  const S = sim.S;
  const old = hh.house != null ? sim.building(hh.house) : null;
  if (old && old.type === 'house' && old.hh === hh.id) { old.hh = null; if (!old.ruin) old.name = '空き家'; }
  hh.s = dest.id; hh.house = null; hh.inn = false;
  const nb = dest.indep ? (freeHouse(sim, dest) || placeHouseIn(sim, dest, hh.name)) : (sim.placeHouse(dest) || freeHouse(sim, dest));
  if (nb) { hh.house = nb.id; nb.hh = hh.id; nb.name = hh.name; nb.owner = nb.owner ?? hh.id; nb.value = nb.value || houseValue(sim, nb); sim.events.push({ type: 'building', id: nb.id }); hh.street = false; }
  else { const inn = sim.townBuilding(dest, 'tavern'); if (inn) { hh.house = inn.id; hh.inn = true; hh.street = false; } else hh.street = true; }
  hh.vil = !!dest.indep;
  for (const id of hh.members) { const p = S.people[id]; if (p) { p.s = dest.id; p.action = null; p.mission = null; p.path = null; } }
  sim.dirty();
}

// ---------- 裏稼業の事件の見張り（よその者どうしの事件だけ拾う） ----------
function pollCases(sim) {
  const uw = sim.S.uw;
  if (!uw?.cases) return;
  for (const c of uw.cases.slice(-40)) {
    if (c._v) continue;
    c._v = 1;
    if (sim.today - c.d > 2) continue;
    const off = sim.S.people[c.off], vic = sim.S.people[c.vic];
    if (!off || !vic) continue;
    const ok = partyKeyOf(sim, off), vk = partyKeyOf(sim, vic);
    if (!ok || !vk || ok === vk || (!isVillageKey(sim, ok) && !isVillageKey(sim, vk))) continue;
    const harm = { 殺人: 8, 猟奇殺人: 9, 誘拐: 6, 放火: 6, 暗殺: 8, 恐喝: 3, 墓荒らし: 4 }[c.k] ?? 2;
    openIncident(sim, { type: 'crime', a: vk, b: ok, culprit: off.id, victim: vic.id, harm, known: !!sim.S.wanted[off.id], crime: c.k });
  }
}

// ---------- お尋ね者が隠れ里へ逃げこむ ----------
function fugitives(sim) {
  const S = sim.S, R = sim.rng, X = XV(sim);
  if (X.trips.length >= MAX_TRIPS) return;
  const havens = X.list.filter((V) => V.state !== 'ruin' && V.annexed == null && (V.laws.includes('shelter') || V.laws.includes('guest')));
  if (!havens.length) return;
  for (const [id, w] of Object.entries(S.wanted)) {
    const p = S.people[id];
    if (!alive(p) || p.jail != null || p.mission || p.bandit || p.fight || p.vFled) continue;
    const pk = partyKeyOf(sim, p);
    if (isVillageKey(sim, pk)) continue;
    const V = havens.slice().sort((a, b) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) - Math.hypot(b.x - p.pos.x, b.z - p.pos.z))[0];
    const d = Math.hypot(V.x - p.pos.x, V.z - p.pos.z);
    if (d > 260) continue;
    const sc = (1 - p.values.family) * 0.6 + p.values.courage * 0.4 + (w.days > 30 ? 0.8 : 0) + (p.pers.O * 0.4) - d / 200 - 1.2 + R.range(-0.2, 0.2);
    if (sc <= 0 || !R.chance(0.2)) continue;
    const t = newTrip(sim, p, 'flee', V.sid, { x: V.x, z: V.z }, { k: w.kingdom, crime: w.crime });
    if (t) { p.vFled = sim.today; sim.remember(p, `${w.crime}の追手を逃れて、国の外の${V.name}を目指すことにした`, { emo: -0.4, imp: 0.9, k: 'crime' }); break; }
  }
}
function fugitiveArrives(sim, t, p) {
  const S = sim.S, V = XV(sim).list[sim.town(t.to)?.vid];
  if (!V || V.state === 'ruin') return;
  const me = 's' + V.sid;
  const m = mind(sim, me);
  const take = law(sim, me, 'host') + m.A * 0.8 - (t.data.crime === '殺人' ? 1.2 : 0) + sim.rng.range(0, 0.5);
  if (take < 0.6) { sim.remember(p, `${V.name}に逃げこもうとしたが、門で追い返された`, { emo: -0.7, imp: 0.8, k: 'crime' }); return; }
  const dest = sim.town(V.sid);
  moveToSettlement(sim, p, dest, { house: true });
  p.vFugitive = { k: t.data.k, crime: t.data.crime, d: sim.today };
  sim.remember(p, `${V.name}の人々にかくまってもらった`, { emo: 0.7, imp: 1, k: 'village' });
  note(sim, [me], `${kname(t.data.k)}で${t.data.crime}の罪を問われた${sim.fullName(p)}が、${V.name}にかくまわれた`, 1, dest);
  stat(sim, 'fugitive');
  // 王国がそれを知れば、引き渡しを求める
  openIncident(sim, { type: 'harbor', a: 'k' + t.data.k, b: me, culprit: p.id, harm: t.data.crime === '殺人' ? 6 : 3, known: true, crime: t.data.crime, delay: 3 });
}

// ========================================================================================
// 5. 事件（揉め事）の流れ
// ========================================================================================
const INC_LABEL = { theft: '盗み', murder: '殺し', poach: '密猟', sacrilege: '聖地荒らし', elope: '駆け落ち', jilt: '婚約破棄', crime: '罪', harbor: 'お尋ね者をかくまった', raided: '襲撃', unpaid: '年貢の滞り', slander: '濡れ衣' };
function openIncident(sim, o) {
  const X = XV(sim);
  if (!o.a || !P(sim, o.a) || P(sim, o.a).dead) return null;
  if (o.b && (!P(sim, o.b) || o.b === o.a)) return null;
  // 同じ相手との同じ種類の揉め事が進んでいれば、重さを足すだけ
  const same = X.inc.find((q) => !q.done && q.type === o.type && q.a === o.a && q.b === o.b);
  if (same) { same.harm += o.harm * 0.5; return same; }
  const inc = { id: X.seq++, stage: 'judge', due: sim.today + (o.delay || 0), start: sim.today, log: [], data: {}, ...o };
  X.inc.push(inc);
  stat(sim, 'inc:' + o.type);
  if (o.b) { addFeel(sim, o.a, o.b, -Math.min(20, o.harm * 1.6), o.known === false ? null : incText(sim, inc), 0.1); heatUp(sim, o.a, o.b, o.harm * 0.6); }
  return inc;
}
function incText(sim, inc) {
  const S = sim.S, c = S.people[inc.culprit], v = S.people[inc.victim];
  const bn = nameOf(sim, inc.b), an = nameOf(sim, inc.a);
  switch (inc.type) {
    case 'theft': return c ? `${bn}の${c.given}が${an}で盗みを働いた` : `${an}の家から銅貨が盗まれ、${bn}の者が疑われた`;
    case 'murder': return `${bn}の${c?.given || '者'}が${an}の${v?.given || '者'}を殺した`;
    case 'poach': return `${bn}の${c?.given || '者'}が${an}の猟場で密猟した`;
    case 'sacrilege': return `${bn}の${c?.given || '者'}が${an}の聖地を荒らした`;
    case 'elope': return `${bn}の${c?.given || '者'}が${an}の${v?.given || '若者'}を連れて駆け落ちした`;
    case 'jilt': return `${bn}の${c?.given || '者'}が${an}の${v?.given || '者'}との婚約を踏みにじった`;
    case 'crime': return `${bn}の${c?.given || '者'}が${an}で${inc.crime || '罪'}を犯した`;
    case 'harbor': return `${bn}が${an}のお尋ね者${c?.given || ''}をかくまった`;
    case 'raided': return `${bn}が${an}を襲った`;
    case 'unpaid': return `${bn}が約束の貢ぎを納めなかった`;
    case 'slander': return `${bn}が${an}にいわれのない濡れ衣を着せた`;
  }
  return `${bn}と${an}のあいだで揉め事が起きた`;
}
function stepIncidents(sim) {
  const X = XV(sim);
  for (const inc of X.inc.slice()) {
    if (inc.done) continue;
    if (sim.today < inc.due) continue;
    if (P(sim, inc.a)?.dead || (inc.b && P(sim, inc.b)?.dead)) { closeInc(sim, inc, 'gone'); continue; }
    if (sim.today - inc.start > 40) { closeInc(sim, inc, 'fade'); continue; }
    try { runIncident(sim, inc); } catch (e) { inc.err = String(e); closeInc(sim, inc, 'error'); stat(sim, 'incError'); }
  }
  X.inc = X.inc.filter((q) => !q.done || sim.today - q.doneDay < 30);
}
function closeInc(sim, inc, how) { inc.done = true; inc.doneDay = sim.today; inc.end = how; stat(sim, 'end:' + how); }
function logInc(inc, sim, txt) { inc.log.push({ d: sim.today, txt }); }
function strengthOf(sim, key, n = 12) {
  const q = P(sim, key);
  if (!q) return 1;
  if (q.kind === 'kingdom') {
    const cap = q.sid;
    return sim.living().filter((p) => p.s === cap && ['soldier', 'knight', 'guard', 'general', 'royalguard', 'militia', 'gatekeeper'].includes(p.job) && p.jail == null).sort((a, b) => pw(b) - pw(a)).slice(0, n).reduce((s, p) => s + pw(p), 0) + 1;
  }
  const f = fightersOf(sim, key, n);
  let s = f.reduce((a, p) => a + pw(p), 0) + 1;
  if (q.kind === 'indep' || q.kind === 'tribal') s *= 1.15;   // 柵と地の利
  if (q.kind === 'tribal' && ['alive', 'angry'].includes(q.TV?.gstate)) s *= 1.2;
  return s;
}
function fightersOf(sim, key, n = 8, busyOk = false) {
  return residents(sim, key).filter((p) => sim.ageOf(p) >= 16 && sim.ageOf(p) <= 58 && p.jail == null && !p.away && p.hp > p.maxhp * 0.45 && p.pregnant === 0 && (busyOk || (!p.mission && !p.quest)) && p.job !== 'vchief' && !['king', 'royal'].includes(p.rank))
    .sort((a, b) => (pw(b) * (1 + (JOBS[b.job]?.combat || 0) * 0.3 + b.values.courage * 0.5)) - (pw(a) * (1 + (JOBS[a.job]?.combat || 0) * 0.3 + a.values.courage * 0.5))).slice(0, n);
}
function runIncident(sim, inc) {
  const S = sim.S, R = sim.rng;
  const cul = S.people[inc.culprit];
  switch (inc.stage) {
    case 'judge': {
      // 被害を受けた側の長が、どう応じるかを決める
      if (!inc.b) { closeInc(sim, inc, 'unknown'); return; }
      const a = inc.a, b = inc.b, m = mind(sim, a);
      const f = feel(sim, a, b);
      const ratio = strengthOf(sim, a) / strengthOf(sim, b);
      const aq = P(sim, a), bq = P(sim, b);
      const canRaid = (aq.kind === 'indep' || aq.kind === 'tribal' || aq.kind === 'kingdom' || aq.kind === 'bandit') && !peaceNow(sim, a, b) && (aq.kind !== 'kingdom' || inc.harm >= 5) && bq.kind !== 'kingdom';
      const culAlive = alive(cul) && cul.jail == null && partyKeyOf(sim, cul) === b;
      const mediator = findMediator(sim, a, b);
      const opts = {
        forgive: m.A * 2 + f / 40 + law(sim, a, 'forgive') - inc.harm * 0.3 - m.N * 0.5 + (allied(sim, a, b) ? 1.5 : 0) - (inc.suspect ? 0 : 0.3),
        demand_culprit: culAlive ? 1 + m.C + inc.harm * 0.15 + law(sim, a, 'justice') : null,
        demand_pay: 0.6 + law(sim, a, 'demandPay') + (1 - m.courage) * 0.8 + inc.harm * 0.1 + (inc.amt ? 0.4 : 0),
        retaliate: canRaid ? m.courage * 1.5 + (1 - m.A) * 1.5 + law(sim, a, 'raid') + inc.harm * 0.25 - f / 50 + (ratio - 1) * 1.2 - 1.2 + (rec(sim, a, b).heat || 0) / 25 : null,
        mediate: mediator ? m.A + 0.3 + (Math.abs(f) < 35 ? 0.5 : 0) : null,
      };
      const how = choose(sim, opts);
      inc.choice = how; inc.opts = Object.fromEntries(Object.entries(opts).map(([k, v]) => [k, v == null ? null : +v.toFixed(2)]));
      const ch = m.p;
      const an = nameOf(sim, a), bn = nameOf(sim, b);
      if (how === 'forgive') {
        if (ch) sim.remember(ch, `${incText(sim, inc)}件を、水に流すことにした`, { emo: 0.1, imp: 0.6, k: 'feud' });
        note(sim, [a, b], `${an}の${ch ? ch.given : '長'}は、${incText(sim, inc)}件を水に流した`, 1, P(sim, a));
        addFeel(sim, b, a, 4, `${an}が${INC_LABEL[inc.type]}の件を水に流してくれた`, 0.3);
        closeInc(sim, inc, 'forgive');
      } else if (how === 'retaliate') {
        startRaid(sim, a, b, inc.harm >= 7 && m.A < 0.3 && !hasLaw(sim, a, 'no_blood') ? 'burn' : 'raid', inc);
        inc.stage = 'raid';
      } else if (how === 'mediate') {
        inc.mediator = mediator; inc.stage = 'mediate'; inc.due = sim.today + 2;
        note(sim, [a, b, mediator], `${an}は${incText(sim, inc)}件で、${nameOf(sim, mediator)}に仲立ちを頼んだ`, 1, P(sim, a));
      } else {
        inc.demand = how === 'demand_culprit' ? 'culprit' : 'pay';
        inc.ask = inc.demand === 'pay' ? r0(Math.min(90, 12 + inc.harm * 7 + (inc.amt || 0) * 1.2)) : 0;
        sendEnvoy(sim, inc, a, b);
      }
      return;
    }
    case 'envoy': return;   // 使者が着くのを待つ
    case 'judge2': sendEnvoy(sim, inc, inc.a, inc.b); return;   // 助けた見返りに年貢を求める（王）
    case 'answer': answer(sim, inc); return;
    case 'escalate': {
      const a = inc.a, b = inc.b, m = mind(sim, a);
      const ratio = strengthOf(sim, a) / strengthOf(sim, b);
      const aq = P(sim, a), bq = P(sim, b);
      const canRaid = (aq.kind !== 'town') && bq.kind !== 'kingdom' && !peaceNow(sim, a, b);
      const opts = {
        raid: canRaid ? m.courage * 1.3 + (1 - m.A) * 1.2 + law(sim, a, 'raid') + (ratio - 1) * 1.3 + inc.harm * 0.2 - 0.6 + (aq.kind === 'kingdom' ? 0.8 : 0) : null,
        grumble: m.A + (1 - m.courage) * 0.8 + (ratio < 0.8 ? 1 : 0) + law(sim, a, 'forgive') * 0.3,
        allies: alliesOf(sim, a).length ? m.E * 0.8 + 0.5 : null,
      };
      const how = choose(sim, opts);
      inc.choice2 = how;
      if (how === 'raid' || (how === 'allies' && canRaid)) { startRaid(sim, a, b, aq.kind === 'kingdom' ? 'punitive' : inc.harm >= 7 && m.A < 0.3 && !hasLaw(sim, a, 'no_blood') ? 'burn' : 'raid', inc, how === 'allies'); inc.stage = 'raid'; }
      else {
        addFeel(sim, a, b, -6, `${nameOf(sim, b)}は求めに応じず、${nameOf(sim, a)}は泣き寝入りした`, 0);
        tell(sim, a, `${nameOf(sim, b)}は謝りもしなかった。いつか思い知らせてやる`, -0.6, 0.6, 6);
        note(sim, [a, b], `${nameOf(sim, a)}は${nameOf(sim, b)}への恨みを胸にしまった`, 1, P(sim, a));
        closeInc(sim, inc, 'grudge');
      }
      return;
    }
    case 'mediate': {
      const med = inc.mediator, mm = mind(sim, med);
      const fa = feel(sim, med, inc.a), fb = feel(sim, med, inc.b);
      const ok = R.chance(clamp(0.25 + mm.A * 0.5 + (fa + fb) / 300 - inc.harm * 0.03 + law(sim, inc.b, 'pay') * 0.1, 0.1, 0.9));
      if (ok) {
        const paid = xfer(acct(sim, inc.b), acct(sim, inc.a), r0(8 + inc.harm * 4));
        addFeel(sim, inc.a, inc.b, 12, `${nameOf(sim, med)}の仲立ちで、${nameOf(sim, inc.b)}が償いをした`, 0.8);
        addFeel(sim, inc.a, med, 6, `${nameOf(sim, med)}が揉め事を収めてくれた`, 0.5); addFeel(sim, inc.b, med, 4, null, 0.5);
        note(sim, [inc.a, inc.b, med], `${nameOf(sim, med)}の${mm.p?.given || '長'}の仲立ちで、${nameOf(sim, inc.a)}と${nameOf(sim, inc.b)}が和解した${paid ? `（償いの銅貨${r0(paid)}枚）` : ''}`, 2, P(sim, med));
        closeInc(sim, inc, 'mediated');
      } else {
        note(sim, [inc.a, inc.b, med], `${nameOf(sim, med)}の仲立ちは実らなかった`, 1, P(sim, med));
        inc.stage = 'escalate'; inc.due = sim.today + 1;
      }
      return;
    }
    case 'raid': {
      // 出陣が終われば閉じる
      const r = XV(sim).raids.find((q) => q.inc === inc.id);
      if (!r || r.stage === 'done') closeInc(sim, inc, r?.res || 'raid');
      return;
    }
  }
}
function findMediator(sim, a, b) {
  const cands = allParties(sim).filter((k) => k !== a && k !== b && !P(sim, k)?.dead && isVillageKey(sim, k));
  let best = null, bs = 20;
  for (const k of cands) { const sc = Math.min(feel(sim, k, a), feel(sim, k, b)) + mind(sim, k).A * 20 + (hasLaw(sim, k, 'no_blood') || hasLaw(sim, k, 'trade_sacred') ? 10 : 0); if (sc > bs) { bs = sc; best = k; } }
  return best;
}
function allParties(sim) {
  const S = sim.S, out = [];
  for (const V of XV(sim).list) if (V.state !== 'ruin') out.push('s' + V.sid);
  for (const TV of S.tribes?.villages || []) if (!TV.gone && S.world.settlements[TV.sid]?.annexed == null) out.push('s' + TV.sid);
  for (const K of S.kingdoms) out.push('k' + K.id);
  for (const b of S.world.buildings) if (b.type === 'hideout' && banditsOf(sim, b.id).length) out.push('h' + b.id);
  return out;
}
// 使者を送る（実際に歩いて行く）
function sendEnvoy(sim, inc, a, b) {
  const S = sim.S;
  const aq = P(sim, a), bq = P(sim, b);
  let envoy = null;
  if (aq.kind === 'kingdom') envoy = sim.living().filter((p) => p.s === aq.sid && ['knight', 'noble', 'soldier', 'messenger'].includes(p.job) && !p.mission && p.jail == null && !p.fight).sort((x, y) => (y.job === 'knight' ? 2 : y.job === 'noble' ? 1 : 0) - (x.job === 'knight' ? 2 : x.job === 'noble' ? 1 : 0))[0];
  else if (aq.kind === 'bandit') envoy = banditsOf(sim, aq.bid).find((p) => !p.mission && p.job !== 'banditchief') || chiefOf(sim, a);
  else envoy = adultsOf(sim, a).filter((p) => !p.mission && p.jail == null && sim.ageOf(p) < 65 && !p.fight).sort((x, y) => (y.pers.E + y.pers.A + (y.job === 'vchief' ? -1 : 0)) - (x.pers.E + x.pers.A + (x.job === 'vchief' ? -1 : 0)))[0];
  inc.stage = 'envoy';
  const spot = { x: bq.x, z: bq.z };
  const t = envoy ? newTrip(sim, envoy, aq.kind === 'kingdom' ? 'kenvoy' : 'envoy', bq.sid ?? null, spot, { inc: inc.id }) : null;
  const what = inc.demand === 'culprit' ? `${S.people[inc.culprit]?.given || '下手人'}の引き渡し` : inc.demand === 'pay' ? `償いの銅貨${inc.ask}枚` : inc.demand === 'tribute' ? `年貢（10日ごとに${inc.ask}銅貨）` : inc.demand === 'submit' ? '王への臣従' : inc.demand === 'protect' ? `みかじめ料${inc.ask}銅貨` : '話し合い';
  inc.what = what;
  note(sim, [a, b], `${nameOf(sim, a)}が${nameOf(sim, b)}へ使者を立て、${what}を求めた（${INC_LABEL[inc.type] || '要求'}の件）`, inc.harm >= 5 || aq.kind === 'kingdom' ? 2 : 1, P(sim, b), aq.kind === 'kingdom' ? aq.k : undefined);
  if (envoy) sim.remember(envoy, `${nameOf(sim, a)}の使者として、${nameOf(sim, b)}へ${what}を求めに行くことになった`, { emo: -0.1, imp: 0.7, k: 'feud' });
  if (!t) { inc.stage = 'answer'; inc.due = sim.today + 1; }
}
function envoyArrived(sim, t, p) {
  const inc = XV(sim).inc.find((q) => q.id === t.data.inc);
  if (!inc || inc.done) return;
  inc.envoy = p.id;
  inc.stage = 'answer'; inc.due = sim.today;
  const ch = chiefOf(sim, inc.b);
  if (ch && alive(ch)) { sim.remember(ch, `${nameOf(sim, inc.a)}の使者${p.given}が来て、${inc.what}を求めた`, { emo: -0.4, imp: 0.8, about: [p.id], k: 'feud' }); sim.remember(p, `${nameOf(sim, inc.b)}の${ch.given}に、${inc.what}を求める口上を述べた`, { emo: 0, imp: 0.6, about: [ch.id], k: 'feud' }); }
  answer(sim, inc);
}
function envoyLost(sim, t) {
  const inc = XV(sim).inc.find((q) => q.id === t.data.inc);
  if (inc && !inc.done && inc.stage === 'envoy') { inc.stage = 'answer'; inc.due = sim.today; }
}
// 求められた側の答え
function answer(sim, inc) {
  const S = sim.S, R = sim.rng;
  if (inc.stage !== 'answer') return;
  const a = inc.a, b = inc.b, m = mind(sim, b);
  const fear = clamp(strengthOf(sim, a) / strengthOf(sim, b), 0.2, 4);
  const f = feel(sim, b, a);
  const cul = S.people[inc.culprit];
  const an = nameOf(sim, a), bn = nameOf(sim, b);
  const bq = P(sim, b);
  let res;
  if (inc.demand === 'tribute' || inc.demand === 'submit' || inc.demand === 'protect') { answerDemand(sim, inc); return; }
  if (inc.demand === 'culprit') {
    const popular = alive(cul) ? adultsOf(sim, b).reduce((s, q) => s + (q.rel[cul.id]?.a || 0), 0) / Math.max(1, adultsOf(sim, b).length) : 0;
    const kin = alive(cul) && m.p && (sim.kinTerm(m.p, cul) || m.p.id === cul.id);
    const opts = {
      handover: 0.6 + law(sim, b, 'handover') + m.A * 0.8 + (fear - 1) * 1.1 - popular / 40 - (kin ? 2.5 : 0) + (inc.wrong ? -3 : 0),
      offer_pay: 0.4 + law(sim, b, 'pay') + m.C * 0.5 + (fear - 1) * 0.5 + (inc.wrong ? -2 : 0),
      refuse: m.ambition * 0.8 + m.courage * 0.8 + popular / 50 + (kin ? 1.5 : 0) - (fear - 1) * 0.8 - f / 60 + (inc.wrong ? 2.5 : 0),
    };
    res = choose(sim, opts);
    inc.answerOpts = opts;
    if (res === 'handover' && alive(cul)) {
      punish(sim, inc, cul);
      addFeel(sim, a, b, 10, `${bn}が${cul.given}を引き渡した`, 0.2);
      tell(sim, b, `${cul.given}が${an}へ引き渡された`, -0.5, 0.7, 8, [cul.id]);
      closeInc(sim, inc, 'handover');
      return;
    }
    if (res === 'offer_pay') { inc.demand = 'pay'; inc.ask = r0(15 + inc.harm * 6); }
  }
  if (inc.demand === 'pay') {
    const fund = acct(sim, b)?.get() || 0;
    const opts = {
      pay: 0.5 + law(sim, b, 'pay') + m.A * 0.6 + (fear - 1) * 0.9 + (fund > inc.ask * 1.5 ? 0.5 : -0.8) + (inc.wrong ? -3 : 0),
      refuse: m.ambition * 0.8 + m.courage * 0.7 - (fear - 1) * 0.7 - f / 60 + (inc.wrong ? 2.5 : 0) + (1 - m.A) * 0.4,
    };
    res = choose(sim, opts);
    if (res === 'pay') {
      // 償い：払う側の蓄え → 被害者の家（なければ被害を受けた側の蓄え）
      const vic = S.people[inc.victim];
      const vhh = alive(vic) ? sim.hh(vic) : null;
      const paid = xfer(acct(sim, b), vhh ? hhAcct(vhh) : acct(sim, a), inc.ask);
      addFeel(sim, a, b, 8 + paid / 10, `${bn}が償いの銅貨${r0(paid)}枚を払った`, 0.3);
      note(sim, [a, b], `${bn}は${an}に償いの銅貨${r0(paid)}枚を払い、${INC_LABEL[inc.type]}の件は収まった`, inc.harm >= 5 ? 2 : 1, bq);
      if (alive(cul)) sim.remember(cul, `自分のせいで、村が${an}に${r0(paid)}銅貨を払うことになった`, { emo: -0.7, imp: 0.9, k: 'feud' });
      stat(sim, 'reparation', paid);
      closeInc(sim, inc, 'paid');
      return;
    }
  }
  // 拒んだ
  addFeel(sim, a, b, -8, `${bn}が${inc.what || '求め'}を突っぱねた`, 0.1);
  if (inc.wrong) {
    // 濡れ衣だった：言いがかりをつけられた側が恨む
    openIncident(sim, { type: 'slander', a: b, b: a, harm: 2, known: true, delay: 2 });
    tell(sim, b, `${an}にいわれのない濡れ衣を着せられた`, -0.7, 0.8, 8);
  }
  note(sim, [a, b], `${bn}の${m.p?.given || '長'}は、${an}の${inc.what || '求め'}を突っぱねた`, inc.harm >= 5 ? 2 : 1, bq);
  inc.stage = 'escalate'; inc.due = sim.today + 1;
}
// 引き渡された者の裁き（受け取った側の掟で）
function punish(sim, inc, p) {
  const S = sim.S, R = sim.rng, a = inc.a, aq = P(sim, a);
  if (aq.kind === 'kingdom') {
    const cap = sim.town(aq.K.capital), prison = sim.townBuilding(cap, 'prison');
    delete S.wanted[p.id];
    if (prison) {
      p.fight = null; p.action = null; p.path = []; p.mission = null;
      p.jail = prison.id; p.prisonDays = inc.harm >= 7 ? 90 : 20; p.crime = inc.crime || INC_LABEL[inc.type];
      p.pos = { ...prison.door }; p.inside = prison.id;
      if (p.rank !== 'outlaw' && p.rank !== 'prisoner') p.rankBefore = p.rankBefore || p.rank;
      p.rank = 'prisoner';
    }
    sim.remember(p, `村から${aq.name}へ引き渡され、牢に入れられた`, { emo: -0.9, imp: 1, k: 'crime' });
    note(sim, [a, partyKeyOf(sim, p)], `${sim.fullName(p)}が${aq.name}へ引き渡され、${cap.name}の牢に入れられた`, 2, cap, aq.k);
    stat(sim, 'handover:jail');
    return;
  }
  const opts = {
    execute: inc.type === 'murder' && hasLaw(sim, a, 'eye_for_eye') ? 2 + (1 - mind(sim, a).A) : null,
    exile: 0.8 + (hasLaw(sim, a, 'exile') ? 1 : 0),
    labor: 1 + mind(sim, a).A * 0.8 - inc.harm * 0.1,
  };
  const how = choose(sim, opts);
  const an = aq.name;
  if (how === 'execute') {
    sim.remember(p, `${an}の掟で、命をもって償うことになった`, { emo: -1, imp: 1, k: 'feud' });
    note(sim, [a, partyKeyOf(sim, p)], `${an}の掟「${LAWS.eye_for_eye.name}」により、${sim.fullName(p)}が命で償わされた`, 2, aq);
    const home = partyKeyOf(sim, p);
    for (const q of sim.living()) if (sim.kinTerm(q, p) && q.values.courage > 0.5 && sim.ageOf(q) >= 16) { q.vAvenge = { party: a, why: `${p.given}の仇`, since: sim.today }; sim.remember(q, `${p.given}が${an}の掟で命を奪われた。この恨みは忘れない`, { emo: -1, imp: 1, about: [p.id], k: 'feud' }); }
    p.vRaidDeath = -1;
    sim.die(p, 'execution', null);
    addFeel(sim, home, a, -10, `${an}が${p.given}の命を奪った`, 0);
    stat(sim, 'handover:execute');
  } else if (how === 'exile') {
    const dest = nearestTownOf(sim, aq.V || { x: aq.x, z: aq.z }) || sim.town(aq.sid);
    if (dest) moveToSettlement(sim, p, dest, { inn: true });
    sim.remember(p, `${an}に引き渡され、どこにも帰れない身になった`, { emo: -0.9, imp: 1, k: 'feud' });
    note(sim, [a, partyKeyOf(sim, p)], `引き渡された${sim.fullName(p)}は、${an}の裁きで遠くへ追いやられた`, 1, aq);
    stat(sim, 'handover:exile');
  } else {
    // 償いの働き：相手の村でしばらく働く（村の蓄えにその分を入れる → 本人の家計から）
    const paid = xfer(hhAcct(sim.hh(p)), acct(sim, a), 20);
    sim.remember(p, `${an}に引き渡され、償いのために働かされた`, { emo: -0.6, imp: 0.9, k: 'feud' });
    note(sim, [a, partyKeyOf(sim, p)], `引き渡された${sim.fullName(p)}は、${an}で償いの働きをすることになった${paid ? `（家から${r0(paid)}銅貨の償い）` : ''}`, 1, aq);
    stat(sim, 'handover:labor');
  }
}

// ========================================================================================
// 6. 出陣（襲撃・焼き討ち・討伐・加勢）
// ========================================================================================
function startRaid(sim, from, to, kind, inc = null, callAllies = false) {
  const S = sim.S, R = sim.rng, X = XV(sim);
  const fq = P(sim, from), tq = P(sim, to);
  if (!fq || !tq || (tq.sid == null && tq.kind !== 'bandit') || tq.kind === 'kingdom') return null;
  if (X.raids.some((r) => r.stage !== 'done' && r.from === from && r.toKey === to)) return null;
  const want = kind === 'burn' ? 9 : kind === 'punitive' ? 8 : kind === 'bandit' ? 6 : kind === 'hunger' ? 6 : 5;
  let men = [];
  if (fq.kind === 'kingdom') men = sim.living().filter((p) => p.s === fq.sid && ['soldier', 'knight', 'militia', 'guard', 'gatekeeper'].includes(p.job) && !p.mission && !p.quest && p.jail == null && p.hp > p.maxhp * 0.5).sort((a, b) => pw(b) - pw(a)).slice(0, want);
  else if (fq.kind === 'bandit') men = banditsOf(sim, fq.bid).filter((p) => p.hp > p.maxhp * 0.5 && !p.mission);
  else men = fightersOf(sim, from, want);
  if (men.length < 2) { if (inc) { logInc(inc, sim, '兵が集まらなかった'); } return null; }
  const leader = men.slice().sort((a, b) => (b.values.courage + (b.lv || 1) / 10) - (a.values.courage + (a.lv || 1) / 10))[0];
  const r = { id: X.seq++, kind, from, to: tq.sid ?? null, toKey: to, inc: inc?.id ?? null, leader: leader.id, men: men.map((p) => p.id), stage: 'march', t0: S.t, d0: sim.today, x: tq.x, z: tq.z };
  X.raids.push(r);
  for (const p of men) { p.mission = { type: 'march', x: tq.x, z: tq.z, until: S.t + 1440 * 2.5, dur: 60, vraid: r.id }; p.action = null; p.vRaid = r.id; sim.remember(p, `${nameOf(sim, from)}の者として、${nameOf(sim, to)}へ${RAID_LABEL[kind]}に向かった`, { emo: -0.2, imp: 0.8, k: 'feud' }); }
  // 仲間の勢力も加わる
  if (callAllies || kind === 'burn') for (const al of alliesOf(sim, from)) {
    if (al === to || feel(sim, al, to) > -10 || P(sim, al)?.kind === 'kingdom') continue;
    const extra = fightersOf(sim, al, 3);
    for (const p of extra) { r.men.push(p.id); p.mission = { type: 'march', x: tq.x, z: tq.z, until: S.t + 1440 * 2.5, dur: 60, vraid: r.id }; p.action = null; p.vRaid = r.id; }
    if (extra.length) { r.allies = (r.allies || []).concat(al); note(sim, [al, from, to], `${nameOf(sim, al)}が盟約にしたがい、${nameOf(sim, from)}の${RAID_LABEL[kind]}に加わった`, 1, P(sim, al)); }
  }
  const imp = kind === 'burn' || kind === 'punitive' ? 3 : 2;
  note(sim, [from, to], `${nameOf(sim, from)}の${men.length}人が、${nameOf(sim, to)}へ${RAID_LABEL[kind]}に出た（率いるのは${leader.given}）`, imp, P(sim, from), fq.kind === 'kingdom' ? fq.k : undefined);
  stat(sim, 'raid:' + kind);
  return r;
}
const RAID_LABEL = { raid: '襲撃', burn: '焼き討ち', punitive: '討伐', bandit: '略奪', hunger: '食べ物を奪い', aid: '加勢', guard: '用心棒', hunt: '魔物退治' };
function stepRaids(sim) {
  const S = sim.S, X = XV(sim);
  for (const r of X.raids) {
    if (r.stage === 'done') continue;
    const men = r.men.map((id) => S.people[id]).filter((p) => alive(p) && p.jail == null);
    try {
      if (r.kind === 'aid' || r.kind === 'guard') { stepGuard(sim, r, men); continue; }
      if (r.kind === 'hunt') { stepHunt(sim, r, men); continue; }
      const tgt = tgtOf(sim, r);
      if (!tgt) { endRaid(sim, r, men); continue; }
      if (r.stage === 'march') {
        for (const p of men) if (!p.fight && (!p.mission || p.mission.vraid !== r.id)) { p.mission = { type: 'march', x: r.x, z: r.z, until: S.t + 1440 * 2, dur: 60, vraid: r.id }; p.action = null; }
        const near = men.filter((p) => Math.hypot(p.pos.x - tgt.x, p.pos.z - tgt.z) <= tgt.r + 4);
        const close = men.filter((p) => Math.hypot(p.pos.x - tgt.x, p.pos.z - tgt.z) <= tgt.r + 25);
        if (close.length && !r.alarm) alarm(sim, r, tgt);
        if ((near.length >= Math.max(2, Math.ceil(men.length * 0.6))) || (S.t - r.t0 > 1440 * 1.6 && near.length >= 2)) { r.stage = 'fight'; r.ft = S.t; beginFight(sim, r, near, tgt); }
        else if (S.t - r.t0 > 1440 * 2.2 || men.length < 2) { r.res = 'giveup'; note(sim, [r.from, r.toKey], `${nameOf(sim, r.from)}の${RAID_LABEL[r.kind]}は、${tgt.name}にたどり着けずに引き返した`, 1, tgt); endRaid(sim, r, men); }
      } else if (r.stage === 'fight') {
        if (S.t - r.ft >= 60) resolveRaid(sim, r, men, tgt);
      } else if (r.stage === 'return') {
        const home = men.filter((p) => { const h = sim.town(p.s); return h && Math.hypot(p.pos.x - h.x, p.pos.z - h.z) > h.r + 2; });
        for (const p of men) if (!home.includes(p) && p.mission?.vraid === r.id) { p.mission = null; p.vRaid = null; }
        if (!home.length || S.t - r.rt > 1440 * 2) endRaid(sim, r, men);
      }
    } catch (e) { r.err = String(e); endRaid(sim, r, men); stat(sim, 'raidError'); }
  }
  X.raids = X.raids.filter((r) => r.stage !== 'done' || sim.today - (r.doneDay ?? sim.today) < 20);
}
// 攻める先（村・里・町、または盗賊のアジト）
function tgtOf(sim, r) {
  if (r.toKey?.[0] === 'h') { const q = P(sim, r.toKey); return q ? { id: null, bid: q.bid, x: q.x, z: q.z, r: 4, name: q.name } : null; }
  return sim.town(r.to);
}
function alarm(sim, r, tgt) {
  r.alarm = true;
  const S = sim.S;
  const def = fightersOf(sim, r.toKey, 12, true);
  for (const p of def) { if (p.fight || p.vRaid) continue; p.mission = { type: 'defend', x: tgt.x, z: tgt.z, until: S.t + 180, dur: 40 }; p.action = null; }
  for (const p of sim.living()) if (tgt.id != null && p.s === tgt.id && sim.ageOf(p) >= 6) sim.remember(p, `${nameOf(sim, r.from)}の者たちが、村へ攻め寄せてきた`, { emo: -0.9, imp: 0.9, k: 'feud' });
  sim.pushLog(`${tgt.name}に${nameOf(sim, r.from)}の者たちが迫っている！`, 'event', [], tgt);
  // 盟約を結んだ勢力が、近ければ駆けつける
  for (const al of alliesOf(sim, r.toKey)) {
    if (al === r.from) continue;
    const aq = P(sim, al);
    if (!aq || aq.kind === 'kingdom' || Math.hypot(aq.x - tgt.x, aq.z - tgt.z) > 160) continue;
    startAid(sim, al, r.toKey, 'aid', 3, 1);
  }
}
function beginFight(sim, r, near, tgt) {
  const S = sim.S;
  const def = defendersAt(sim, r, tgt);
  near.forEach((p, i) => { const d = def[i % Math.max(1, def.length)]; if (d && !d.fight && !p.fight) startFight(sim, p, d, false); });
  sim.pushLog(`${tgt.name}で、${nameOf(sim, r.from)}の者たちと村の者たちがぶつかった。`, 'event', near.map((p) => p.id).slice(0, 4), tgt);
}
function defendersAt(sim, r, tgt) {
  return sim.living().filter((p) => ((tgt.id != null && (p.s === tgt.id || p.vGuardAt === tgt.id)) || (tgt.bid != null && p.bandit && p.hideout === tgt.bid)) && !r.men.includes(p.id) && sim.ageOf(p) >= 16 && sim.ageOf(p) <= 62 && p.jail == null && Math.hypot(p.pos.x - tgt.x, p.pos.z - tgt.z) <= tgt.r + 6 && p.hp > 5);
}
function resolveRaid(sim, r, men, tgt) {
  const S = sim.S, R = sim.rng;
  const att = men.filter((p) => Math.hypot(p.pos.x - tgt.x, p.pos.z - tgt.z) <= tgt.r + 8);
  const def = defendersAt(sim, r, tgt);
  const fighters = def.filter((p) => (JOBS[p.job]?.combat || 0) >= 1 || p.values.courage > 0.45);
  const A = att.reduce((s, p) => s + pw(p), 0) + 1;
  const D = fighters.reduce((s, p) => s + pw(p), 0) + (def.length - fighters.length) * 4 + 1;
  const tq = P(sim, r.toKey);
  const fence = tq?.kind === 'indep' || tq?.kind === 'tribal' ? 1.15 : 1.05;
  const ratio = A / (D * fence);
  const win = R.chance(clamp(1 / (1 + Math.exp(-(ratio - 1) * 2.4)), 0.05, 0.95));
  const fury = { raid: 0.09, burn: 0.16, punitive: 0.12, bandit: 0.1, hunger: 0.07 }[r.kind] ?? 0.1;
  const lead = S.people[r.leader];
  const cruel = alive(lead) ? 1.3 - lead.pers.A * 0.6 : 1;
  const deadD = [], deadA = [];
  for (const p of fighters) {
    const hurt = 1.25 - p.hp / Math.max(1, p.maxhp);
    if (R.chance(clamp(fury * (win ? 1.4 : 0.6) * hurt * cruel * clamp(ratio, 0.5, 2.5), 0, 0.6))) deadD.push(p);
    else if (R.chance(0.35)) p.hp = Math.max(1, p.hp * 0.5);
  }
  for (const p of att) {
    const hurt = 1.25 - p.hp / Math.max(1, p.maxhp);
    if (R.chance(clamp(fury * (win ? 0.5 : 1.3) * hurt * clamp(1 / ratio, 0.4, 2.5), 0, 0.6))) deadA.push(p);
    else if (R.chance(0.35)) p.hp = Math.max(1, p.hp * 0.5);
  }
  for (const p of [...att, ...def]) { if (p.fight) { const o = S.people[p.fight.target]; if (o?.fight?.target === p.id) o.fight = null; p.fight = null; } }
  const killerOf = (side) => { const pool = side.filter((q) => alive(q) && !deadA.includes(q) && !deadD.includes(q)); return pool.length ? R.pick(pool) : null; };
  const dn = (list, foes) => { for (const p of list) { const k = killerOf(foes); p.vRaidDeath = r.id; sim.die(p, 'feud', k); if (k) { k.fame = (k.fame || 0) + 2; sim.remember(k, `${tgt.name}での争いで、${p.given}を討ち取った`, { emo: -0.3, imp: 0.8, about: [p.id], k: 'feud' }); } for (const q of sim.living()) if (sim.kinTerm(q, p) && q.values.courage > 0.5 && sim.ageOf(q) >= 16 && k) { q.vAvenge = { pid: k.id, party: partyKeyOf(sim, k), why: `${p.given}の仇`, since: sim.today }; } } };
  dn(deadD, att); dn(deadA, fighters);
  // 結果
  const fromN = nameOf(sim, r.from), toN = tgt.name;
  let loot = 0, burned = 0, took = 0;
  if (win) {
    if (tgt.id != null && (r.kind === 'burn' || r.kind === 'punitive' && R.chance(0.3))) burned = burnHouses(sim, tgt, r.kind === 'burn' ? R.range(0.3, 0.6) : 0.2);
    if (r.kind !== 'punitive' || !inDemand(sim, r)) {
      const to = r.kind === 'bandit' ? acct(sim, r.from) : acct(sim, r.from);
      loot = xfer(acct(sim, r.toKey), to, (acct(sim, r.toKey)?.get() || 0) * R.range(0.3, 0.5));
      // 家々からも奪う（焼き討ち・略奪）
      if (r.kind === 'bandit' || r.kind === 'burn' || r.kind === 'hunger') for (const hh of Object.values(S.households)) if (hh.s === tgt.id && R.chance(0.4)) loot += xfer(hhAcct(hh), to, hh.money * 0.3);
    }
    // 食べ物
    const tm = tgt.id != null ? S.towns[tgt.id] : null, fm = P(sim, r.from)?.c === 's' ? S.towns[P(sim, r.from).sid] : null;
    if (tm) for (const g of ['wheat', 'meat', 'fish', 'bread']) { const n = (tm.stock[g] || 0) * (r.kind === 'hunger' ? 0.6 : 0.35); tm.stock[g] -= n; took += n; if (fm) fm.stock[g] = (fm.stock[g] || 0) + n; else { const share = n / Math.max(1, att.length); for (const p of att) { const h = sim.hh(p); if (h) h.food += share; } } }
  }
  r.res = win ? 'win' : 'lose';
  r.dead = { a: deadA.length, d: deadD.length }; r.loot = r0(loot); r.burned = burned;
  const txt = win
    ? `${fromN}の${RAID_LABEL[r.kind]}で${toN}が破れた（${toN}の死者${deadD.length}人・${fromN}の死者${deadA.length}人${loot ? `・奪われた銅貨${r0(loot)}` : ''}${burned ? `・焼かれた家${burned}軒` : ''}）`
    : `${toN}の人々が${fromN}の${RAID_LABEL[r.kind]}を退けた（${fromN}の死者${deadA.length}人・${toN}の死者${deadD.length}人）`;
  note(sim, [r.from, r.toKey], txt, 3, tgt, P(sim, r.from)?.kind === 'kingdom' ? P(sim, r.from).k : undefined);
  if (win && r.kind === 'punitive') submitAfterDefeat(sim, r);
  for (const p of att) if (alive(p)) sim.remember(p, win ? `${toN}を打ち負かした` : `${toN}で手ひどく追い返された`, { emo: win ? 0.3 : -0.7, imp: 0.9, k: 'feud' });
  for (const p of sim.living()) if (tgt.id != null && p.s === tgt.id && sim.ageOf(p) >= 8) sim.remember(p, win ? `${fromN}の者たちに村を荒らされた` : `みんなで${fromN}の者たちを追い払った`, { emo: win ? -0.9 : 0.5, imp: 0.95, k: 'feud' });
  // 恨み：襲われた側 → 襲った側
  const harm = deadD.length * 4 + burned * 2 + loot / 15 + 2;
  heatUp(sim, r.from, r.toKey, harm);
  addFeel(sim, r.toKey, r.from, -Math.min(30, harm * 2), `${fromN}が${toN}に${RAID_LABEL[r.kind]}をかけた`, 0.1);
  if (!win) addFeel(sim, r.from, r.toKey, -4, null, 0);
  if (P(sim, r.from)?.kind !== 'bandit') openIncident(sim, { type: 'raided', a: r.toKey, b: r.from, harm: Math.min(10, harm / 2 + (win ? 1 : 0)), known: true, delay: 2 });
  else if (!win) addFeel(sim, r.toKey, r.from, 5, null, 0);
  cleanWanted(sim, r, [...att, ...def]);
  // 帰る
  r.stage = 'return'; r.rt = S.t;
  for (const p of men) { const h = sim.town(p.s); if (alive(p) && h) { p.mission = { type: 'march', x: h.x, z: h.z, until: S.t + 1440 * 2, dur: 30, vraid: r.id }; p.action = null; } }
  stat(sim, win ? 'raidWin' : 'raidLose');
  stat(sim, 'raidDead', deadA.length + deadD.length);
}
function inDemand(sim, r) { const inc = XV(sim).inc.find((q) => q.id === r.inc); return inc && (inc.demand === 'tribute' || inc.demand === 'submit'); }
function burnHouses(sim, s, frac) {
  const S = sim.S;
  const houses = s.buildings.map((id) => sim.building(id)).filter((b) => b && b.type === 'house' && !b.ruin);
  const n = Math.max(1, Math.round(houses.length * frac));
  let done = 0;
  for (const b of sim.rng.shuffle(houses).slice(0, n)) {
    b.ruin = true; b.burnt = sim.today; b.name = '焼け跡';
    const hh = b.hh != null ? S.households[b.hh] : null;
    if (hh) { hh.food = 0; hh.house = null; const inn = sim.townBuilding(s, 'tavern'); if (inn) { hh.house = inn.id; hh.inn = true; } else hh.street = true; for (const id of hh.members) { const p = S.people[id]; if (alive(p)) sim.remember(p, '家を焼かれた', { emo: -1, imp: 1, k: 'feud' }); } }
    b.hh = null;
    sim.events.push({ type: 'building', id: b.id });
    done++;
  }
  return done;
}
// 殴り合いでついた「傷害」の手配は、村どうしの争いでは消す
function cleanWanted(sim, r, people) {
  const S = sim.S;
  for (const p of people) { const w = S.wanted[p.id]; if (w && w.since >= r.d0 && w.crime === '傷害') { delete S.wanted[p.id]; if (p.rank === 'outlaw') p.rank = p.rankBefore || 'commoner'; } }
}
function endRaid(sim, r, men) {
  r.stage = 'done'; r.doneDay = sim.today;
  for (const p of men) { if (p.mission?.vraid === r.id) p.mission = null; p.vRaid = null; p.vGuardAt = null; }
  const inc = XV(sim).inc.find((q) => q.id === r.inc);
  if (inc && !inc.done) closeInc(sim, inc, r.res || 'raid');
}
// 加勢・用心棒：守りに行って、しばらく村にとどまる
function startAid(sim, from, toKey, kind, n, days, wage = 0) {
  const S = sim.S, X = XV(sim);
  const tq = P(sim, toKey);
  if (!tq || tq.sid == null) return null;
  const men = fightersOf(sim, from, n);
  if (!men.length) return null;
  const r = { id: X.seq++, kind, from, to: tq.sid, toKey, men: men.map((p) => p.id), stage: 'go', t0: S.t, d0: sim.today, until: S.t + 1440 * days, x: tq.x, z: tq.z, wage };
  X.raids.push(r);
  for (const p of men) { p.mission = { type: 'march', x: tq.x, z: tq.z, until: r.until, dur: 90, vraid: r.id }; p.action = null; p.vRaid = r.id; p.vGuardAt = tq.sid; sim.remember(p, `${tq.name}を守りに向かった`, { emo: 0.1, imp: 0.7, k: 'feud' }); }
  note(sim, [from, toKey], `${nameOf(sim, from)}の${men.length}人が、${tq.name}の${RAID_LABEL[kind]}に向かった`, 1, tq);
  stat(sim, 'raid:' + kind);
  return r;
}
function stepGuard(sim, r, men) {
  const S = sim.S;
  if (S.t < r.until && men.length) {
    for (const p of men) if (!p.fight && (!p.mission || p.mission.vraid !== r.id)) { const spot = sim.randomNear(r.x, r.z, 5) || { x: r.x, z: r.z }; p.mission = { type: 'march', x: spot.x, z: spot.z, until: r.until, dur: 90, vraid: r.id }; p.action = null; }
    return;
  }
  for (const p of men) { p.vGuardAt = null; const h = sim.town(p.s); if (h) { p.mission = { type: 'stroll', x: h.x, z: h.z, until: S.t + 1440 * 2, dur: 30 }; p.action = null; } }
  endRaid(sim, r, men);
}
// 魔物退治の討伐隊：群れの住処へ行き、見つけた魔物と戦う
function stepHunt(sim, r, men) {
  const S = sim.S;
  const band = S.bands?.[r.band];
  if (!band || !men.length || S.t > r.until) {
    const n0 = r.n0 || 0, n1 = band ? band.members.length : 0;
    note(sim, [r.from, r.toKey], `${nameOf(sim, r.from)}の討伐隊が戻った（${band ? `「${band.name}」の${Math.max(0, n0 - n1)}体を討った` : '群れは散った'}）`, 2, P(sim, r.toKey));
    for (const p of men) { const h = sim.town(p.s); if (h) { p.mission = { type: 'stroll', x: h.x, z: h.z, until: S.t + 1440 * 2, dur: 30 }; p.action = null; } }
    endRaid(sim, r, men);
    return;
  }
  const foes = band.members.map((id) => S.creatures[id]).filter((c) => c && c.hp > 0);
  if (!foes.length) { r.until = S.t; return; }
  const base = foes[0].pos;
  for (const p of men) {
    if (p.fight) continue;
    const c = foes.slice().sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z))[0];
    if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 4) startFight(sim, p, c, true);
    else { p.mission = { type: 'march', x: Math.round(c.pos.x), z: Math.round(c.pos.z), until: r.until, dur: 30, vraid: r.id }; p.action = null; }
  }
}

// 王の討伐・臣従のあと
function submitAfterDefeat(sim, r) {
  const inc = XV(sim).inc.find((q) => q.id === r.inc);
  const tq = P(sim, r.toKey), kq = P(sim, r.from);
  if (!tq || tq.kind !== 'indep' || kq?.kind !== 'kingdom') return;
  if (inc?.demand === 'submit' || !inc) annex(sim, tq.V, kq.k, '討伐に敗れて');
  else if (inc?.demand === 'tribute') setTribute(sim, r.toKey, r.from, inc.ask * 1.5, '討伐に敗れて');
  else { const paid = xfer(acct(sim, r.toKey), acct(sim, r.from), 40); note(sim, [r.toKey, r.from], `${tq.name}は${kq.name}に${r0(paid)}銅貨を差し出して許しを請うた`, 2, tq, kq.k); }
}

// ========================================================================================
// 7. 危機：飢え・病・魔物
// ========================================================================================
function crisis(sim, V, s) {
  const S = sim.S, R = sim.rng, me = 's' + V.sid;
  if ((V.cool.crisis ?? -99) > sim.today) return;
  const epi = S.health?.epi?.find((e) => e.sid === V.sid);
  const monsterLoss = V.loss.filter((l) => ['monster', 'beast', 'demon'].includes(l.c)).length;
  let kind = null;
  if (V.hunger >= 3) kind = 'hunger';
  else if (epi && (epi.dead || 0) >= 1) kind = 'plague';
  else if (monsterLoss >= 2) kind = 'monster';
  if (!kind) return;
  V.cool.crisis = sim.today + 12;
  const m = mind(sim, me);
  const helpers = allParties(sim).filter((k) => k !== me && !P(sim, k)?.dead && k[0] !== 'h' && Math.hypot(P(sim, k).x - V.x, P(sim, k).z - V.z) < 300);
  const bestHelper = helpers.map((k) => ({ k, sc: feel(sim, me, k) + (P(sim, k).kind === 'kingdom' ? 5 : 0) + (kind === 'plague' && (hasLaw(sim, k, 'no_blood') || P(sim, k).kind === 'tribal') ? 20 : 0) })).sort((a, b) => b.sc - a.sc)[0];
  const weakest = kind === 'hunger' ? helpers.filter((k) => isVillageKey(sim, k) && !peaceNow(sim, me, k)).map((k) => ({ k, sc: -feel(sim, me, k) / 20 + (strengthOf(sim, me) / strengthOf(sim, k)) + ((S.towns[P(sim, k).sid]?.stock.wheat || 0) / 40) })).sort((a, b) => b.sc - a.sc)[0] : null;
  const opts = {
    beg: bestHelper ? 0.8 + m.A * 0.6 + bestHelper.sc / 40 - m.ambition * 0.5 : null,
    raid: weakest && kind === 'hunger' ? (1 - m.A) * 1.4 + m.courage + law(sim, me, 'raid') + (weakest.sc - 1) * 0.6 - 0.6 : null,
    hire: kind === 'monster' ? hireOption(sim, V) : null,
    king: kind === 'monster' && feel(sim, me, 'k' + V.faces) > -15 ? 0.6 + m.A * 0.5 + feel(sim, me, 'k' + V.faces) / 40 : null,
    leave: (1 - m.courage) * 0.6 + (V.hunger >= 6 || monsterLoss >= 4 ? 1 : -0.5),
    endure: m.C * 0.6 + m.courage * 0.4,
  };
  const how = choose(sim, opts);
  const label = { hunger: '飢え', plague: '流行り病', monster: '魔物の被害' }[kind];
  stat(sim, 'crisis:' + kind + ':' + how);
  if (how === 'beg') askHelp(sim, V, bestHelper.k, kind);
  else if (how === 'raid') { startRaid(sim, me, weakest.k, 'hunger', null); note(sim, [me, weakest.k], `${label}に追いつめられた${V.name}が、${nameOf(sim, weakest.k)}の蓄えを奪いに出ることを決めた`, 2, V); }
  else if (how === 'hire') hireMercs(sim, V, 'monster');
  else if (how === 'king') kingHunt(sim, V);
  else if (how === 'leave') { const hhs = Object.values(S.households).filter((h) => h.s === V.sid && h.members.length && !h.members.includes(V.chief)); for (const hh of R.shuffle(hhs).slice(0, Math.max(1, Math.round(hhs.length * 0.2)))) refugeeHousehold(sim, V, hh, label); note(sim, [me], `${label}に耐えかねて、${V.name}から何家族かが村を出ていった`, 2, V); }
  else note(sim, [me], `${V.name}は${label}に苦しみながらも、村を守って耐えている`, 1, V);
}
function askHelp(sim, V, k, kind) {
  const S = sim.S, me = 's' + V.sid, R = sim.rng;
  const m = mind(sim, k);
  const f = feel(sim, k, me);
  const q = P(sim, k);
  const fund = acct(sim, k)?.get() || 0;
  const give = m.A * 1.2 + law(sim, k, 'aid') + f / 40 + (fund > 150 ? 0.4 : -0.6) + (q.kind === 'kingdom' ? 0.2 : 0) - 0.8 + R.range(-0.2, 0.2);
  const label = { hunger: '飢え', plague: '流行り病', monster: '魔物の被害' }[kind];
  if (give > 0) {
    const amt = xfer(acct(sim, k), acct(sim, me), Math.min(60, fund * 0.15));
    // 食べ物・薬（品物は市から市へ）
    const from = q.sid != null ? S.towns[q.sid] : null, to = S.towns[V.sid];
    if (from && to) for (const g of kind === 'plague' ? ['medicine', 'herbs'] : ['wheat', 'meat', 'bread']) { const n = Math.min(12, (from.stock[g] || 0) * 0.3); from.stock[g] -= n; to.stock[g] = (to.stock[g] || 0) + n; }
    addFeel(sim, me, k, 14, `${label}のとき、${q.name}が助けてくれた`, 0.3);
    note(sim, [me, k], `${label}に苦しむ${V.name}の頼みに、${q.name}が応えて${amt ? `${r0(amt)}銅貨と` : ''}${kind === 'plague' ? '薬' : '食べ物'}を送った`, 2, V, q.kind === 'kingdom' ? q.k : undefined);
    tell(sim, me, `${label}のとき、${q.name}が助けてくれた。この恩は忘れない`, 0.7, 0.8, 10);
    if (q.kind === 'kingdom' && m.ambition > 0.6) { const X = XV(sim); X.inc.push({ id: X.seq++, type: 'favor', a: k, b: me, demand: 'tribute', ask: r0(10 + amt / 6), stage: 'judge2', due: sim.today + 8, start: sim.today, log: [], data: {}, harm: 1 }); }
    stat(sim, 'aid');
  } else {
    addFeel(sim, me, k, -8, `${label}のとき、${q.name}は助けを断った`, 0);
    note(sim, [me, k], `${q.name}は、${label}に苦しむ${V.name}の頼みを断った`, 1, V);
    tell(sim, me, `${q.name}に助けを求めたが、冷たく断られた`, -0.6, 0.7, 8);
    stat(sim, 'aidRefused');
  }
}
function hireOption(sim, V) {
  const merc = XV(sim).list.find((x) => x.kind === 'merc' && x.state !== 'ruin' && x.id !== V.id);
  if (!merc) return null;
  const fund = acct(sim, 's' + V.sid)?.get() || 0;
  return fund > 50 ? 0.7 + feel(sim, 's' + V.sid, 's' + merc.sid) / 50 : null;
}
function hireMercs(sim, V, why) {
  const merc = XV(sim).list.find((x) => x.kind === 'merc' && x.state !== 'ruin' && x.id !== V.id);
  if (!merc) return false;
  const me = 's' + V.sid, mk = 's' + merc.sid;
  const wage = r0(Math.min(80, 30 + (acct(sim, me).get()) * 0.1));
  if (feel(sim, mk, me) < -25) { note(sim, [me, mk], `${merc.name}の${merc.title}は、${V.name}からの用心棒の頼みを断った`, 1, V); return false; }
  const r = startAid(sim, mk, me, 'guard', 3, 10, wage);
  if (!r) return false;
  // 前払いの報酬：頼んだ村の蓄え → 傭兵の家（人数で割る）
  const each = wage / r.men.length;
  for (const id of r.men) xfer(acct(sim, me), hhAcct(sim.hh(sim.S.people[id])), each);
  addFeel(sim, mk, me, 3, null, 0.5);
  note(sim, [me, mk], `${V.name}が${merc.name}の傭兵を${r.men.length}人、${wage}銅貨で雇った（${why === 'monster' ? '魔物' : why === 'bandit' ? '盗賊' : '王国の兵'}に備えて）`, 2, V);
  stat(sim, 'hire');
  return true;
}
function kingHunt(sim, V) {
  const S = sim.S, me = 's' + V.sid, kk = 'k' + V.faces;
  const band = Object.values(S.bands || {}).filter((b) => b.members.length).map((b) => { const c = S.creatures[b.members[0]]; return c ? { b, d: Math.hypot(c.pos.x - V.x, c.pos.z - V.z) } : null; }).filter(Boolean).sort((a, b) => a.d - b.d)[0];
  const m = mind(sim, kk);
  if (!band || band.d > 90 || m.A + feel(sim, kk, me) / 50 + m.courage * 0.5 < 0.7) { note(sim, [me, kk], `${V.name}は${kname(V.faces)}の王に魔物退治を頼んだが、王は兵を出さなかった`, 1, V, V.faces); addFeel(sim, me, kk, -5, `${kname(V.faces)}の王は魔物退治の頼みを聞き流した`, 0); return; }
  const X = XV(sim), cap = sim.town(S.kingdoms[V.faces].capital);
  const men = sim.living().filter((p) => p.s === cap.id && ['soldier', 'knight'].includes(p.job) && !p.mission && p.jail == null).sort((a, b) => pw(b) - pw(a)).slice(0, 5);
  if (men.length < 2) return;
  const r = { id: X.seq++, kind: 'hunt', from: kk, to: V.sid, toKey: me, band: band.b.id, n0: band.b.members.length, men: men.map((p) => p.id), stage: 'go', t0: S.t, d0: sim.today, until: S.t + 1440 * 4, x: V.x, z: V.z };
  X.raids.push(r);
  for (const p of men) { const c = S.creatures[band.b.members[0]]; p.mission = { type: 'march', x: Math.round(c.pos.x), z: Math.round(c.pos.z), until: r.until, dur: 30, vraid: r.id }; p.action = null; p.vRaid = r.id; }
  addFeel(sim, me, kk, 10, `${kname(V.faces)}の王が、魔物退治の兵を出してくれた`, 0.3);
  note(sim, [me, kk], `${kname(V.faces)}の王が${V.name}の頼みに応え、「${band.b.name}」の討伐隊${men.length}人を送った`, 2, V, V.faces);
  stat(sim, 'kingHunt');
}
// 魔物の群れの恨み・大群が村に向いたら
function monsterWatch(sim, V) {
  const S = sim.S, me = 's' + V.sid;
  for (const b of Object.values(S.bands || {})) {
    if (b.grudge?.sid === V.sid && V.grudgeSeen !== b.id + ':' + b.grudge.since) {
      V.grudgeSeen = b.id + ':' + b.grudge.since;
      tell(sim, me, `「${b.name}」の魔物たちが、村を恨んで狙っているらしいと聞いた`, -0.6, 0.7, 10);
      note(sim, [me], `「${b.name}」の魔物たちが、仲間を殺された恨みを${V.name}に向けている`, 1, V);
    }
    if (b.war?.target === V.sid && V.hordeSeen !== b.id + ':' + b.war.launchDay) {
      V.hordeSeen = b.id + ':' + b.war.launchDay;
      const m = mind(sim, me);
      const opts = { hire: hireOption(sim, V), allies: alliesOf(sim, me).length ? 1 + m.E * 0.5 : null, fight: m.courage + 0.3 };
      const how = choose(sim, opts);
      note(sim, [me], `「${b.name}」の大群が${V.name}を狙っている。${how === 'hire' ? '村は傭兵を雇った' : how === 'allies' ? '村は盟友に加勢を頼んだ' : '村は柵を固めて迎え撃つ構えだ'}`, 2, V);
      if (how === 'hire') hireMercs(sim, V, 'monster');
      else if (how === 'allies') for (const al of alliesOf(sim, me)) if (P(sim, al)?.kind !== 'kingdom') startAid(sim, al, me, 'aid', 3, 4);
      stat(sim, 'horde');
    }
  }
}

// ========================================================================================
// 8. 王国の求め（年貢・臣従）と、盗賊団のみかじめ
// ========================================================================================
function kingdomPressure(sim, V) {
  const S = sim.S, R = sim.rng, me = 's' + V.sid;
  if (sim.today < 3 || (V.cool.king ?? -99) > sim.today) return;
  if (!R.chance(0.12)) return;
  if (XV(sim).inc.some((q) => !q.done && q.b === me && (q.demand === 'tribute' || q.demand === 'submit'))) return;
  if (XV(sim).pacts.some((q) => q.type === 'tribute' && q.from === me)) return;
  const tr = S.territory;
  let best = null, bs = -Infinity;
  for (const K of S.kingdoms) {
    const king = S.people[K.kingId];
    if (!alive(king)) continue;
    const kk = 'k' + K.id;
    // 国の土地がどこまで村に迫っているか
    let dLand = 999;
    if (tr) for (let ci = 0; ci < tr.owner.length; ci++) { if (tr.owner[ci] !== K.id) continue; const cx = (ci % tr.cw) * EXP_CS + (EXP_CS >> 1), cz = Math.floor(ci / tr.cw) * EXP_CS + (EXP_CS >> 1); const d = cheb(cx, cz, V.x, V.z); if (d < dLand) dLand = d; }
    const cap = sim.town(K.capital);
    const dCap = Math.hypot(cap.x - V.x, cap.z - V.z);
    if (dLand > 90 && dCap > 220) continue;
    const want = V.kind === 'mine' ? (S.towns[cap.id].price.ore / GOODS.ore.base > 1.15 ? 0.9 : 0.4) : V.kind === 'inn' ? 0.3 : 0.1;
    const sc = king.values.ambition * 1.2 + (K.treasury < 700 ? 0.6 : 0) + want + Math.max(0, (90 - dLand) / 90) * 0.8 - king.pers.A * 0.5 - (K.war ? 0.8 : 0) - (S.demon?.active ? 0.6 : 0) - feel(sim, kk, me) / 80 + R.range(-0.2, 0.2);
    if (sc > bs) { bs = sc; best = { K, king, sc }; }
  }
  if (!best || bs < 1.25) return;
  V.cool.king = sim.today + 25;
  const kk = 'k' + best.K.id;
  const ratio = strengthOf(sim, kk) / strengthOf(sim, me);
  const demand = best.king.values.ambition > 0.72 && ratio > 1.6 ? 'submit' : 'tribute';
  const X = XV(sim);
  const inc = { id: X.seq++, type: 'demand', a: kk, b: me, demand, ask: demand === 'tribute' ? r0(12 + best.king.values.ambition * 20 + (V.kind === 'mine' ? 10 : 0)) : 0, stage: 'x', due: sim.today, start: sim.today, log: [], data: {}, harm: 3, known: true };
  X.inc.push(inc);
  stat(sim, 'demand:' + demand);
  sim.remember(best.king, `${V.name}に${demand === 'submit' ? '臣従' : '年貢'}を求めることにした`, { emo: 0.2, imp: 0.7, k: 'politics' });
  sendEnvoy(sim, inc, kk, me);
}
function banditPressure(sim, V) {
  const S = sim.S, R = sim.rng, me = 's' + V.sid;
  if ((V.cool.bandit ?? -99) > sim.today || !R.chance(0.1)) return;
  if (XV(sim).pacts.some((q) => q.type === 'tribute' && q.from === me && q.to[0] === 'h')) return;
  const fund = acct(sim, me).get();
  let best = null, bs = -Infinity;
  for (const b of S.world.buildings) {
    if (b.type !== 'hideout') continue;
    const d = Math.hypot(b.x - V.x, b.z - V.z);
    if (d > 160) continue;
    const gang = banditsOf(sim, b.id);
    if (gang.length < 2) continue;
    const hk = 'h' + b.id, ch = chiefOf(sim, hk);
    if (!ch) continue;
    const sc = ch.values.ambition + (1 - ch.pers.A) + fund / 250 - d / 160 - strengthOf(sim, me) / strengthOf(sim, hk) * 0.6 + R.range(-0.2, 0.2);
    if (sc > bs) { bs = sc; best = { b, hk, ch }; }
  }
  if (!best || bs < 0.9) return;
  V.cool.bandit = sim.today + 20;
  const X = XV(sim);
  const inc = { id: X.seq++, type: 'demand', a: best.hk, b: me, demand: 'protect', ask: r0(20 + Math.min(60, fund * 0.2)), stage: 'x', due: sim.today, start: sim.today, log: [], data: {}, harm: 3, known: true };
  X.inc.push(inc);
  stat(sim, 'demand:protect');
  sendEnvoy(sim, inc, best.hk, me);
}
// 王・盗賊の求めへの答え
function answerDemand(sim, inc) {
  const S = sim.S, R = sim.rng, a = inc.a, b = inc.b;
  const bq = P(sim, b), aq = P(sim, a);
  if (bq?.kind !== 'indep' || bq.V.annexed != null) { closeInc(sim, inc, 'moot'); return; }
  const m = mind(sim, b);
  const fear = clamp(strengthOf(sim, a) / strengthOf(sim, b), 0.2, 5);
  const f = feel(sim, b, a);
  const allies = allParties(sim).filter((k) => k !== a && k !== b && isVillageKey(sim, k) && feel(sim, k, b) > 15 && feel(sim, b, k) > 10 && (feel(sim, k, a) < 0 || aq.kind === 'bandit'));
  const V = bq.V;
  const hirable = inc.demand === 'protect' && hireOption(sim, V) != null;
  const opts = {
    accept: 0.4 + (1 - m.courage) * 0.8 + m.A * 0.5 + (fear - 1) * 0.7 + f / 60 + law(sim, b, 'tribute') - m.ambition * 0.4 - (inc.demand === 'submit' ? 1.2 : 0),
    negotiate: inc.demand === 'tribute' ? m.C * 0.8 + m.E * 0.4 + 0.2 : null,
    refuse: m.courage * 1.1 + m.ambition * 0.5 - (fear - 1) * 0.6 - f / 80 - law(sim, b, 'tribute') * 0.6 + (KINDS[V.kind].king < -20 && aq.kind === 'kingdom' ? 0.6 : 0),
    allies: allies.length ? 0.4 + m.E * 0.5 + m.courage * 0.5 + allies.length * 0.3 - law(sim, b, 'tribute') * 0 : null,
    hire: hirable ? 0.6 + m.C * 0.4 + (fear - 1) * 0.3 : null,
  };
  const how = choose(sim, opts);
  inc.answer = how; inc.answerOpts = opts;
  const an = aq.name, bn = bq.name, what = inc.what;
  stat(sim, 'demandAns:' + how);
  if (how === 'accept' || how === 'negotiate') {
    if (inc.demand === 'submit') { annex(sim, V, aq.k, '王の求めをのんで'); closeInc(sim, inc, 'annex'); return; }
    const amt = how === 'negotiate' ? r0(inc.ask * 0.6) : inc.ask;
    if (inc.demand === 'protect') {
      const paid = xfer(acct(sim, b), acct(sim, a), amt);
      note(sim, [a, b], `${bn}は${an}に、みかじめ料${r0(paid)}銅貨を渡して村を守った`, 1, bq);
      tell(sim, b, `盗賊どもに銅貨を差し出すことになった。悔しい`, -0.6, 0.7, 8);
      addFeel(sim, b, a, -6, `${an}にみかじめ料を取られた`, 0);
      closeInc(sim, inc, 'paid');
      return;
    }
    setTribute(sim, b, a, amt, how === 'negotiate' ? '話し合いの末に' : '求めをのんで');
    closeInc(sim, inc, 'tribute');
    return;
  }
  if (how === 'hire') { hireMercs(sim, V, 'bandit'); note(sim, [a, b], `${bn}は${an}の求めを拒み、傭兵を雇って備えた`, 2, bq); }
  if (how === 'allies') {
    for (const k of allies) if (!allied(sim, b, k)) { XV(sim).pacts.push({ type: 'ally', a: b, b: k, since: sim.today, why: `${an}に抗うため` }); addFeel(sim, b, k, 10, `${an}に抗うために盟約を結んだ`, 1); }
    note(sim, [a, b, ...allies], `${bn}は${an}の${what}を拒み、${allies.map((k) => nameOf(sim, k)).join('・')}と盟約を結んだ`, 2, bq, aq.kind === 'kingdom' ? aq.k : undefined);
    stat(sim, 'alliance');
  }
  if (how === 'refuse') note(sim, [a, b], `${bn}の${m.p?.given || '長'}は、${an}の${what}をきっぱりと拒んだ`, 2, bq, aq.kind === 'kingdom' ? aq.k : undefined);
  addFeel(sim, a, b, -10, `${bn}が${what}を拒んだ`, 0.2);
  tell(sim, b, `${an}の${what}を、村は拒んだ`, 0.1, 0.7, 10);
  // 求めた側の出方：力ずくか、引き下がるか
  const am = mind(sim, a);
  const ratio = strengthOf(sim, a) / (strengthOf(sim, b) * (1 + alliesOf(sim, b).length * 0.3) * (how === 'hire' ? 1.4 : 1));
  const force = am.ambition * 1.2 + am.courage * 0.6 + (ratio - 1) * 0.8 - am.A * 0.8 - (aq.K?.war ? 1 : 0) - (S.demon?.active && aq.kind === 'kingdom' ? 0.8 : 0) + R.range(-0.2, 0.3);
  if (force > 0.6) {
    const kind = aq.kind === 'kingdom' ? 'punitive' : 'bandit';
    inc.stage = 'raid';
    if (!startRaid(sim, a, b, kind, inc)) closeInc(sim, inc, 'nomen');
  } else {
    note(sim, [a, b], `${an}は、${bn}へ兵を向けるのを見送った`, 1, aq, aq.kind === 'kingdom' ? aq.k : undefined);
    addFeel(sim, b, a, 4, null, 0);
    if (aq.kind === 'kingdom') XV(sim).list[bq.V.id].cool.king = sim.today + 40;
    closeInc(sim, inc, 'backoff');
  }
}
function setTribute(sim, from, to, amt, how) {
  const X = XV(sim);
  X.pacts = X.pacts.filter((q) => !(q.type === 'tribute' && q.from === from));
  X.pacts.push({ type: 'tribute', from, to, amt: r0(amt), every: 10, next: sim.today + 10, since: sim.today, miss: 0 });
  const tq = P(sim, to);
  note(sim, [from, to], `${nameOf(sim, from)}は${how}、${tq.name}に10日ごとに${r0(amt)}銅貨の年貢を納めることになった`, 2, P(sim, from), tq.kind === 'kingdom' ? tq.k : undefined);
  tell(sim, from, `${tq.name}に年貢を納めることになった`, -0.5, 0.8, 10);
  stat(sim, 'tribute');
}
function annex(sim, V, k, how) {
  const S = sim.S, s = sim.town(V.sid);
  if (V.annexed === k) return;
  V.annexed = k; s.annexed = k; s.kingdom = k;
  for (const id of s.buildings) { const b = sim.building(id); if (b) b.kingdom = k; }
  if (S.expansion) S.expansion.sk[V.sid] = k;
  for (const ci of tribalChunks(sim, LAND_BASE + V.id)) annexTribalLand(sim, ci, k, '併合');
  for (const hh of Object.values(S.households)) if (hh.s === V.sid) hh.vil = false;
  XV(sim).pacts = XV(sim).pacts.filter((q) => !(q.type === 'tribute' && q.from === 's' + V.sid));
  note(sim, ['s' + V.sid, 'k' + k], `${V.name}は${how}、${kname(k)}の領地になった`, 3, V, k);
  tell(sim, 's' + V.sid, `${V.name}は${kname(k)}の旗の下に入った`, -0.4, 0.9, 20);
  stat(sim, 'annex');
}
// ---------- 約束（年貢・用心棒の契約・和平） ----------
function stepPacts(sim) {
  const S = sim.S, X = XV(sim);
  for (const q of X.pacts.slice()) {
    if (q.type === 'tribute' && sim.today >= q.next) {
      q.next = sim.today + q.every;
      const fq = P(sim, q.from), tq = P(sim, q.to);
      if (!fq || fq.dead || !tq || tq.dead || fq.V?.annexed != null) { X.pacts.splice(X.pacts.indexOf(q), 1); continue; }
      const paid = xfer(acct(sim, q.from), acct(sim, q.to), q.amt);
      stat(sim, 'tributePaid', paid);
      addFeel(sim, q.from, q.to, -1.5, null, 0);
      if (paid < q.amt * 0.7) {
        q.miss++;
        note(sim, [q.from, q.to], `${fq.name}は${tq.name}への年貢を納めきれなかった（${r0(paid)}／${q.amt}銅貨）`, 1, fq);
        if (q.miss >= 2) { X.pacts.splice(X.pacts.indexOf(q), 1); openIncident(sim, { type: 'unpaid', a: q.to, b: q.from, harm: 4, known: true }); }
      } else if (sim.rng.chance(0.3)) tell(sim, q.from, `${tq.name}へ年貢の${q.amt}銅貨を納めた`, -0.3, 0.4, 3);
    }
    if (q.type === 'peace' && q.until <= sim.today) X.pacts.splice(X.pacts.indexOf(q), 1);
    if (q.type === 'hostage' && q.until <= sim.today) { returnHostages(sim, q); X.pacts.splice(X.pacts.indexOf(q), 1); }
    if (q.type === 'ally' && (P(sim, q.a)?.dead || P(sim, q.b)?.dead || Math.min(feel(sim, q.a, q.b), feel(sim, q.b, q.a)) < -20)) { X.pacts.splice(X.pacts.indexOf(q), 1); note(sim, [q.a, q.b], `${nameOf(sim, q.a)}と${nameOf(sim, q.b)}の盟約が解けた`, 1, P(sim, q.a)); }
  }
}

// ========================================================================================
// 9. 和解（贈り物・人質・縁組・仲立ち）
// ========================================================================================
function peaceDaily(sim) {
  const S = sim.S, R = sim.rng, X = XV(sim);
  for (const r of Object.values(X.rel)) {
    if (!(r.heat > 0)) continue;
    r.heat = Math.max(0, r.heat - 0.25);
    if (P(sim, r.a)?.dead || P(sim, r.b)?.dead) continue;
    if (peaceNow(sim, r.a, r.b)) continue;
    if (!(isVillageKey(sim, r.a) || isVillageKey(sim, r.b))) continue;
    if (r.heat < 3 || sim.today - (r.lastPeace ?? -99) < 8) continue;
    if (X.raids.some((q) => q.stage !== 'done' && ((q.from === r.a && q.toKey === r.b) || (q.from === r.b && q.toKey === r.a)))) continue;
    // 両方の長がどれだけ和解を望むか（死者が出るほど、疲れて望むようになる）
    const will = (k, o) => { const m = mind(sim, k); const lost = X.hist.filter((e) => e.keys.includes(k) && e.keys.includes(o) && sim.today - e.d < 40 && /死者[1-9]/.test(e.text)).length; return m.A * 1.1 + lost * 0.35 + (1 - m.ambition) * 0.3 + feel(sim, k, o) / 100 - r.heat / 25 + law(sim, k, 'peace') + R.range(-0.2, 0.2); };
    const wa = will(r.a, r.b), wb = will(r.b, r.a);
    const med = findMediator(sim, r.a, r.b);
    if (!((wa > 0.7 && wb > 0.7) || (med && wa + wb > 1.1))) continue;
    if (!R.chance(0.35)) continue;
    r.lastPeace = sim.today;
    const init = wa >= wb ? r.a : r.b, other = init === r.a ? r.b : r.a;
    const m = mind(sim, init);
    const pairs = matchPair(sim, init, other);
    const opts = {
      gift: (acct(sim, init)?.get() || 0) > 60 ? 0.6 + m.E * 0.5 + (hasLaw(sim, init, 'trade_sacred') ? 0.6 : 0) : null,
      marry: pairs ? 0.5 + m.family * 1.2 : null,
      hostage: 0.3 + m.C * 0.6 - feel(sim, init, other) / 80,
      mediator: med ? 0.5 + mind(sim, med).A : null,
    };
    const how = choose(sim, opts);
    makePeace(sim, init, other, how, { pairs, med });
  }
}
function makePeace(sim, a, b, how, o) {
  const S = sim.S, X = XV(sim), R = sim.rng;
  const an = nameOf(sim, a), bn = nameOf(sim, b);
  let txt;
  if (how === 'gift') { const g = xfer(acct(sim, a), acct(sim, b), R.int(25, 50)); txt = `${an}が${bn}へ${r0(g)}銅貨ぶんの贈り物を届け、争いをやめることで話がまとまった`; }
  else if (how === 'marry' && o.pairs) { const [x, y] = o.pairs; betroth(sim, x, y); txt = `${an}の${x.given}と${bn}の${y.given}の縁組が決まり、二つの村は争いをやめた`; }
  else if (how === 'mediator' && o.med) { txt = `${nameOf(sim, o.med)}の仲立ちで、${an}と${bn}が争いをやめた`; addFeel(sim, a, o.med, 6, `${nameOf(sim, o.med)}が争いを収めてくれた`, 0.5); addFeel(sim, b, o.med, 6, null, 0.5); }
  else { const ok = exchangeHostages(sim, a, b); txt = ok ? `${an}と${bn}が若者を人質として預け合い、争いをやめた` : `${an}と${bn}の長が顔を合わせ、しばらく争いをやめることにした`; }
  X.pacts.push({ type: 'peace', a, b, since: sim.today, until: sim.today + 60, how });
  const r = rec(sim, a, b); r.heat = 0;
  addFeel(sim, a, b, 12, txt, 1);
  note(sim, [a, b], txt, 2, P(sim, a));
  tell(sim, a, `${bn}との争いが終わった。ほっとした`, 0.6, 0.7, 12);
  tell(sim, b, `${an}との争いが終わった。ほっとした`, 0.6, 0.7, 12);
  for (const inc of X.inc) if (!inc.done && ((inc.a === a && inc.b === b) || (inc.a === b && inc.b === a))) closeInc(sim, inc, 'peace');
  stat(sim, 'peace:' + how);
}
// 縁組の相手選び：年頃で、ほかに想う人がいない者どうし（性格の相性で）
function matchPair(sim, a, b) {
  const pool = (k) => adultsOf(sim, k).filter((p) => p.spouseId == null && sim.ageOf(p) >= 18 && sim.ageOf(p) <= 32 && p.jail == null && p.vBetrothed == null && !p.vHostage);
  const A = pool(a), B = pool(b);
  let best = null, bs = -Infinity;
  for (const x of A) for (const y of B) {
    if (x.sex === y.sex || sim.isKin(x, y)) continue;
    const sc = 1 - (Math.abs(x.pers.A - y.pers.A) + Math.abs(x.pers.E - y.pers.E)) / 2 + x.values.family * 0.3 + y.values.family * 0.3;
    if (sc > bs) { bs = sc; best = [x, y]; }
  }
  return best;
}
function betroth(sim, x, y) {
  x.vBetrothed = y.id; y.vBetrothed = x.id;
  for (const [p, q] of [[x, y], [y, x]]) {
    // 本人の気持ち：ほかに想う人がいれば、胸が苦しい（駆け落ちの種になる）
    const other = Object.entries(p.rel).find(([id, r]) => r.a > 60 && +id !== q.id && alive(sim.S.people[id]) && sim.S.people[id].spouseId == null && sim.S.people[id].sex !== p.sex);
    sim.remember(p, other ? `村のために、${q.given}と夫婦になれと言われた。けれど心には${sim.S.people[other[0]].given}がいる` : `村どうしの和解のしるしに、${q.given}と夫婦になることが決まった`, { emo: other ? -0.6 : 0.3, imp: 1, about: [q.id], k: 'engage' });
    sim.relMut(p, q).a += other ? 0 : 20;
  }
  XV(sim).pacts.push({ type: 'wed', a: x.id, b: y.id, at: sim.today + 4 });
  stat(sim, 'betroth');
}
function exchangeHostages(sim, a, b) {
  const pa = P(sim, a), pb = P(sim, b);
  if (pa.c !== 's' || pb.c !== 's') return false;
  const pick = (k) => adultsOf(sim, k).filter((p) => sim.ageOf(p) >= 16 && sim.ageOf(p) <= 26 && p.spouseId == null && p.jail == null && !p.vHostage && !p.mission).sort((x, y) => y.values.courage - x.values.courage)[0];
  const ha = pick(a), hb = pick(b);
  if (!ha || !hb) return false;
  const q = { type: 'hostage', a, b, pa: ha.id, pb: hb.id, until: sim.today + 30 };
  for (const [p, dest, homeK] of [[ha, pb, a], [hb, pa, b]]) {
    const host = chiefOf(sim, dest.key) || adultsOf(sim, dest.key)[0];
    p.vHostage = { home: p.s, hh: p.hh, at: dest.sid, until: q.until };
    if (host && sim.hh(host)) { const old = sim.hh(p); if (old) old.members = old.members.filter((id) => id !== p.id); sim.hh(host).members.push(p.id); p.hh = host.hh; p.s = dest.sid; p.action = null; p.mission = null; p.path = null; }
    sim.remember(p, `村の和解のために、人質として${dest.name}へ預けられた`, { emo: -0.4, imp: 1, k: 'feud' });
  }
  XV(sim).pacts.push(q);
  sim.dirty();
  return true;
}
function returnHostages(sim, q) {
  const S = sim.S;
  for (const id of [q.pa, q.pb]) {
    const p = S.people[id];
    if (!alive(p) || !p.vHostage) continue;
    const h = p.vHostage;
    const cur = sim.hh(p); if (cur) cur.members = cur.members.filter((x) => x !== p.id);
    let home = S.households[h.hh];
    if (!home || home.s !== h.home) home = Object.values(S.households).find((x) => x.s === h.home && x.members.some((m) => sim.kinTerm(p, S.people[m])));
    if (!home) { const hid = S.nextHh++; home = S.households[hid] = { id: hid, members: [], house: null, s: h.home, money: 0, food: 2, comfort: 0, name: `${p.family}の家`, street: true, vil: true }; }
    home.members.push(p.id); p.hh = home.id; p.s = h.home; p.vHostage = null; p.action = null; p.mission = null; p.path = null;
    sim.remember(p, `人質の務めを終えて、${sim.town(h.home)?.name}へ帰った`, { emo: 0.6, imp: 0.9, k: 'feud' });
  }
  sim.dirty();
}
// 縁組の婚礼（決まった日に）
function weddings(sim) {
  const S = sim.S, X = XV(sim);
  for (const q of X.pacts.slice()) {
    if (q.type !== 'wed' || sim.today < q.at) continue;
    X.pacts.splice(X.pacts.indexOf(q), 1);
    const x = S.people[q.a], y = S.people[q.b];
    if (!alive(x) || !alive(y) || x.spouseId != null || y.spouseId != null || x.vBetrothed !== y.id) continue;
    const [m, w] = x.sex === 'm' ? [x, y] : [y, x];
    const mk = partyKeyOf(sim, m), wk = partyKeyOf(sim, w);
    x.vBetrothed = null; y.vBetrothed = null;
    const hh = sim.hh(m);
    if (hh) { sim.moveTo(w, hh); w.s = m.s; w.action = null; w.mission = null; }
    sim.marry(m, w, true);
    for (const p of [m, w]) sim.remember(p, `${(p === m ? w : m).given}と、村どうしの縁組で結婚した`, { emo: 0.5, imp: 1, about: [(p === m ? w : m).id], k: 'marriage' });
    addFeel(sim, mk, wk, 10, `${m.given}と${w.given}の婚礼で、二つの村が結ばれた`, 1);
    if (!allied(sim, mk, wk) && Math.min(feel(sim, mk, wk), feel(sim, wk, mk)) > 25) X.pacts.push({ type: 'ally', a: mk, b: wk, since: sim.today, why: '縁組' });
    note(sim, [mk, wk], `${nameOf(sim, mk)}の${m.given}と${nameOf(sim, wk)}の${w.given}の婚礼が行われた`, 2, m.pos);
    stat(sim, 'arranged');
  }
}

// ---------- 関係のゆるやかな戻り ----------
function relDecay(sim) {
  weddings(sim);
  if (sim.today % 2) return;
  for (const r of Object.values(XV(sim).rel)) {
    const ba = baseFeel(sim, r.a, r.b), bb = baseFeel(sim, r.b, r.a);
    r.ab += (ba - r.ab) * 0.01; r.ba += (bb - r.ba) * 0.01;
  }
}

// ========================================================================================
// 10. 滅び・難民・仇・住みつく者
// ========================================================================================
function checkRuin(sim, V, s) {
  const S = sim.S;
  const here = sim.living().filter((p) => p.s === V.sid && !p.vHostage);
  const adults = here.filter((p) => sim.ageOf(p) >= 16);
  if (here.length && adults.length >= 3) return false;
  // 大人が2人以下：残った者も村を捨てる
  const by = lastEnemy(sim, V);
  for (const hh of Object.values(S.households).filter((h) => h.s === V.sid && h.members.length)) refugeeHousehold(sim, V, hh, '村が立ちゆかなくなって');
  ruin(sim, V, by);
  return true;
}
// 村を追いつめた相手：この40日で、村を打ち負かした出陣の主
function lastEnemy(sim, V) {
  const me = 's' + V.sid;
  const r = XV(sim).raids.filter((q) => q.toKey === me && q.res === 'win' && sim.today - (q.d0 ?? 0) <= 40).sort((a, b) => b.d0 - a.d0)[0];
  return r ? r.from : null;
}
function ruin(sim, V, byKey) {
  const S = sim.S, s = sim.town(V.sid), me = 's' + V.sid;
  V.state = 'ruin'; V.ruinDay = sim.today; V.ruinBy = byKey;
  s.abandoned = true; s.ruined = true;
  for (const id of s.buildings) { const b = sim.building(id); if (b && b.type === 'house') { b.hh = null; if (!b.ruin) { b.ruin = true; b.name = '廃屋'; } sim.events.push({ type: 'building', id }); } }
  // 村の蓄えは、生き残りの家に分ける（行き先：難民の家計）
  const refugees = Object.values(S.households).filter((h) => h.fromV === V.id && h.members.length);
  if (refugees.length) { const each = (S.towns[V.sid].fund || 0) / refugees.length; for (const h of refugees) xfer(acct(sim, me), hhAcct(h), each); }
  XV(sim).pacts = XV(sim).pacts.filter((q) => !(q.a === me || q.b === me || q.from === me || q.to === me));
  const by = byKey ? nameOf(sim, byKey) : null;
  note(sim, [me, ...(byKey ? [byKey] : [])], `${V.name}は住む者がいなくなり、廃村となった${by ? `（${by}との争いの末に）` : ''}`, 3, V);
  // 仇を誓う者
  for (const p of sim.living()) {
    if (p.vOrigin !== V.id || sim.ageOf(p) < 14) continue;
    sim.remember(p, `生まれ育った${V.name}が廃村になった`, { emo: -1, imp: 1, k: 'feud' });
    if (byKey && p.values.courage > 0.55 && (1 - p.pers.A) + p.values.courage > 1.1) { p.vAvenge = { party: byKey, why: `${V.name}の仇`, since: sim.today }; sim.remember(p, `いつか${by}に${V.name}の仇を討つと誓った`, { emo: -0.8, imp: 1, k: 'feud' }); stat(sim, 'avenger'); }
  }
  stat(sim, 'ruin');
}
function refugeeHousehold(sim, V, hh, why) {
  const S = sim.S, R = sim.rng, me = 's' + V.sid;
  const head = hh.members.map((id) => S.people[id]).filter(alive).sort((a, b) => sim.ageOf(b) - sim.ageOf(a))[0];
  // 行き先：身内のいる所・仲のよい村・受け入れてくれる掟の村・近くの王国の町
  let best = null, bs = -Infinity;
  for (const q of S.world.settlements) {
    if (q.id === V.sid || q.abandoned || S.towns[q.id]?.occupied) continue;
    const d = Math.hypot(q.x - V.x, q.z - V.z);
    if (d > 360) continue;
    const k = partyKeyOfSid(sim, q.id);
    const kin = head ? sim.living().filter((x) => x.s === q.id && sim.kinTerm(head, x)).length : 0;
    const took = Object.values(S.households).filter((h) => h.fromV === V.id && h.s === q.id).length;
    const sc = kin * 1.5 + feel(sim, me, k) / 25 + (hasLaw(sim, k, 'guest') || hasLaw(sim, k, 'shelter') ? 1 : 0) - d / 120 + (q.type === 'capital' ? 0.3 : 0) + R.range(0, 1) - took * 0.7 - (k === V.ruinBy || k === lastEnemy(sim, V) ? 5 : 0);
    if (sc > bs) { bs = sc; best = q; }
  }
  if (!best) return;
  hh.fromV = V.id;
  moveHousehold(sim, hh, best);
  for (const id of hh.members) { const p = S.people[id]; if (!alive(p)) continue; p.vRefugee = V.id; if (sim.ageOf(p) >= 6) sim.remember(p, `${why}、${V.name}を離れて${best.name}へ逃れた`, { emo: -0.9, imp: 1, k: 'arrival' }); }
  const bk = partyKeyOfSid(sim, best.id);
  addFeel(sim, me, bk, 6, `${best.name}が${V.name}の者を受け入れてくれた`, 0.2);
  stat(sim, 'refugee', hh.members.length);
}
// 廃村に、のちに人が住みつく（盗賊・王国の開拓者・生き残り）
function resettle(sim, V) {
  const S = sim.S, R = sim.rng, s = sim.town(V.sid);
  if (sim.today - V.ruinDay < 20 || !R.chance(0.08)) return;
  const opts = {};
  const den = S.world.buildings.filter((b) => b.type === 'hideout' && Math.hypot(b.x - V.x, b.z - V.z) < 170 && banditsOf(sim, b.id).length >= 2).sort((a, b) => Math.hypot(a.x - V.x, a.z - V.z) - Math.hypot(b.x - V.x, b.z - V.z))[0];
  if (den) { const ch = chiefOf(sim, 'h' + den.id); if (ch) opts.bandit = ch.values.ambition + (1 - ch.pers.A) * 0.5 - 0.6 + R.range(0, 0.4); }
  const K = S.kingdoms.map((k) => ({ k, king: S.people[k.kingId], d: Math.hypot(sim.town(k.capital).x - V.x, sim.town(k.capital).z - V.z) })).filter((x) => alive(x.king)).sort((a, b) => a.d - b.d)[0];
  if (K && K.d < 300) opts.pioneer = K.king.values.ambition * 0.9 + 0.2 + R.range(0, 0.4);
  const survivors = sim.living().filter((p) => p.vOrigin === V.id && sim.isAdult(p) && p.s !== V.sid && p.jail == null && !p.mission);
  if (survivors.length >= 2) opts.return = survivors.reduce((a, p) => a + p.values.courage, 0) / survivors.length + survivors.length * 0.05 + R.range(0, 0.4);
  const how = choose(sim, opts);
  if (!how) return;
  stat(sim, 'resettleTry:' + how);
  let movers = [];
  if (how === 'bandit') {
    const gang = banditsOf(sim, den.id);
    const hhs = [...new Set(gang.map((p) => p.hh))].map((id) => S.households[id]).filter(Boolean);
    for (const hh of hhs) { moveHousehold(sim, hh, s); hh.bandits = true; movers.push(...hh.members); }
    for (const p of gang) p.hideout = V.hall ?? p.hideout;
    V.kind = 'den'; V.laws = KINDS.den.laws.slice(); V.title = KINDS.den.title;
    const ch = chiefOf(sim, 'h' + (V.hall ?? den.id)) || gang[0];
    V.chief = ch?.id ?? null;
  } else if (how === 'pioneer') {
    const pool = Object.values(S.households).filter((h) => sim.town(h.s)?.kingdom === K.k.id && !sim.town(h.s)?.indep && !h.royal && !h.bandits && (h.street || h.inn || h.money < 60) && h.members.length && h.members.every((id) => S.people[id]?.jail == null));
    for (const hh of R.shuffle(pool).slice(0, 3)) { moveHousehold(sim, hh, s); movers.push(...hh.members); }
    if (!movers.length) return;
    V.kind = 'resettled'; V.laws = KINDS.resettled.laws.slice(); V.title = KINDS.resettled.title;
    annex(sim, V, K.k.id, '開拓者が住みつき');
  } else {
    const hhs = [...new Set(survivors.map((p) => p.hh))].map((id) => S.households[id]).filter(Boolean);
    for (const hh of hhs.slice(0, 4)) { moveHousehold(sim, hh, s); movers.push(...hh.members); }
  }
  if (!movers.length) return;
  V.state = 'alive'; s.abandoned = false; s.ruined = false; V.chief = V.kind === 'den' ? V.chief : null;
  for (const id of movers) { const p = S.people[id]; if (alive(p)) sim.remember(p, how === 'return' ? `廃村になった${V.name}へ、生き残りの仲間と戻った` : `廃村の${V.name}の跡に住みついた`, { emo: 0.3, imp: 1, k: 'arrival' }); }
  note(sim, ['s' + V.sid], how === 'bandit' ? `廃村となった${V.name}に、盗賊団が住みついた` : how === 'pioneer' ? `廃村となった${V.name}の跡に、${K.k.name}の開拓者たちが住みついた` : `${V.name}の生き残りたちが、廃村に戻って村を建て直しはじめた`, 2, V);
  stat(sim, 'resettle:' + how);
}

// ========================================================================================
// 11. 行き先（placeFor の頭で呼ぶ）
// ========================================================================================
export function villagesPlace(sim, p, kind) {
  const s = sim.town(p.s);
  if (!s?.indep) return null;
  const V = XV(sim)?.list[s.vid];
  if (!V) return null;
  const door = (id) => { const b = id != null ? sim.building(id) : null; return b ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : null; };
  const own = (type) => { const b = sim.townBuilding(s, type); return b ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : null; };
  switch (kind) {
    case 'hall': return door(V.hall) || sim.randomNear(s.x, s.z, 2);
    case 'market': return door(V.barter) || sim.randomNear(s.x, s.z, 2);
    case 'church': case 'clinic': case 'school': return own('church') || door(V.hall) || sim.randomNear(s.x, s.z, 2);
    case 'barracks': case 'dojo': return own('barracks') || sim.randomNear(s.x, s.z, s.r - 1);
    case 'smithy': return own('smithy') || sim.randomNear(s.x, s.z, 2);
    case 'mine': return V.mine != null ? door(V.mine) : null;
    case 'castle': case 'mansion': case 'guild': case 'prison': case 'magictower': case 'bakery': case 'workshop': case 'observatory': case 'stable': case 'academy': case 'lighthouse':
      return door(V.hall) || sim.randomNear(s.x, s.z, 2) || { x: s.x, z: s.z };
  }
  return null;
}

// ========================================================================================
// 12. 画面向け
// ========================================================================================
export function villagesSummary(sim) {
  const X = sim.S.villages;
  if (!X) return [];
  return X.list.map((V) => {
    const me = 's' + V.sid, s = sim.town(V.sid);
    const ch = sim.S.people[V.chief];
    const rels = allParties(sim).filter((k) => k !== me && X.rel[relKey(me, k)]).map((k) => ({ k, name: nameOf(sim, k), f: r0(feel(sim, me, k)), back: r0(feel(sim, k, me)) })).sort((a, b) => Math.abs(b.f) - Math.abs(a.f));
    return {
      id: V.id, sid: V.sid, name: V.name, kind: KINDS[V.kind]?.label || V.kind, state: V.state, annexed: V.annexed != null ? kname(V.annexed) : null,
      chief: alive(ch) ? { id: ch.id, name: sim.fullName(ch), title: V.title } : null, laws: V.laws.map((l) => LAWS[l]?.name).filter(Boolean),
      pop: sim.living().filter((p) => p.s === V.sid).length, pop0: V.pop0, fund: r0(sim.S.towns[V.sid]?.fund || 0), x: V.x, z: V.z,
      rels, pacts: X.pacts.filter((q) => q.a === me || q.b === me || q.from === me || q.to === me), log: (V.log || []).slice(-5),
    };
  });
}
export function villagesNationHTML(sim, esc) {
  const list = villagesSummary(sim);
  if (!list.length) return '';
  const X = sim.S.villages;
  const col = (f) => (f <= -30 ? 'up' : f >= 30 ? 'down' : '');
  let h = `<div class="nation villages"><div class="nname">独立村</div>`;
  for (const v of list) {
    const me = 's' + v.sid;
    const pacts = v.pacts.map((q) => q.type === 'ally' ? `${esc(nameOf(sim, q.a === me ? q.b : q.a))}と盟約` : q.type === 'peace' ? `${esc(nameOf(sim, q.a === me ? q.b : q.a))}と和平（${q.until - sim.today}日）` : q.type === 'tribute' ? (q.from === me ? `${esc(nameOf(sim, q.to))}へ年貢${q.amt}` : `${esc(nameOf(sim, q.from))}から年貢${q.amt}`) : q.type === 'hostage' ? '人質を預け合う' : '').filter(Boolean);
    h += `<dl class="kv" style="margin-top:6px"><dt class="link" data-goto="${v.x},${v.z}">${esc(v.name)}</dt><dd>${esc(v.kind)}${v.state === 'ruin' ? '（廃村）' : `・${v.pop}人`}${v.annexed ? `・${esc(v.annexed)}領` : ''}・蓄え${v.fund}</dd>`;
    if (v.chief) h += `<dt>${esc(v.chief.title)}</dt><dd><span class="link" data-pid="${v.chief.id}">${esc(v.chief.name)}</span></dd>`;
    h += `<dt>掟</dt><dd>${v.laws.map((l) => `「${esc(l)}」`).join('')}</dd>`;
    h += `<dt>関係</dt><dd>${v.rels.slice(0, 6).map((r) => `${esc(r.name.replace(/王国$/, ''))} <b class="${col(r.f)}">${r.f}</b>`).join('　') || '―'}</dd>`;
    if (pacts.length) h += `<dt>約束</dt><dd>${pacts.join('、')}</dd>`;
    const rl = v.rels.map((r) => X.rel[relKey(me, r.k)]?.log || []).flat().filter((e) => e.d >= 0).sort((a, b) => b.d - a.d).slice(0, 2);
    if (rl.length) h += `<dt>恨みと恩</dt><dd>${rl.map((e) => `<span class="${e.k === 'grudge' ? 'up' : 'down'}">${esc(e.txt)}</span>`).join('<br>')}</dd>`;
    if (v.log.length) h += `<dt>最近</dt><dd class="small">${v.log.slice(-3).reverse().map((e) => `${e.y}年 ${esc(e.text)}`).join('<br>')}</dd>`;
    h += `</dl>`;
  }
  const act = X.raids.filter((r) => r.stage !== 'done' && !['aid', 'guard', 'hunt'].includes(r.kind));
  if (act.length) h += `<p class="small">いま進んでいる争い：${act.map((r) => `${esc(nameOf(sim, r.from))}→${esc(sim.town(r.to)?.name || '')}（${RAID_LABEL[r.kind]}）`).join('、')}</p>`;
  return h + '</div>';
}
// 人の詳細欄：町の横の括弧の中身（独立村の人なら「隠れ里」など）。独立村の人でなければ null
export function villageLabel(sim, p) {
  const s = sim.town(p.s);
  if (!s?.indep) return null;
  const V = XV(sim)?.list[s.vid];
  if (!V) return null;
  if (V.annexed != null) return `${kname(V.annexed)}領`;
  return `${KINDS[V.kind]?.label || '独立村'}${V.state === 'ruin' ? '・廃村' : ''}`;
}
// 人の詳細欄：出身の村と、村での立場
export function villageOriginHTML(sim, p, esc) {
  const X = XV(sim);
  if (!X) return '';
  let h = '';
  const V = p.vOrigin != null ? X.list[p.vOrigin] : null;
  if (V && p.s !== V.sid) h += `<br>${esc(V.name)}の出${p.vRefugee === V.id ? '（村を追われた）' : p.vExiled === V.id ? '（掟で追放）' : ''}${V.state === 'ruin' ? '・今は廃村' : ''}`;
  else if (V) h += `<br>${esc(V.name)}生まれ`;
  if (p.vTitle && p.job === 'vchief') h += `<br>${esc(V?.name || '')}の${esc(p.vTitle)}`;
  if (p.vHostage) h += `<br>人質として${esc(sim.town(p.vHostage.at)?.name || '')}に預けられている`;
  if (p.vFugitive) h += `<br>${esc(kname(p.vFugitive.k))}から逃げてきたお尋ね者`;
  if (p.vAvenge && p.deathYear == null) h += `<br>${esc(p.vAvenge.why || '仇')}を討つと誓っている`;
  return h;
}

// ========================================================================================
// 13. 試験・点検用
// ========================================================================================
export function moneyTotal(sim) {
  const S = sim.S;
  let t = 0;
  for (const h of Object.values(S.households)) t += h.money || 0;
  for (const p of Object.values(S.people)) t += p.purse || 0;
  for (const m of Object.values(S.towns)) t += (m.fund || 0) + (m.cash || 0) + (m.commission || 0) + (m.alms || 0);
  for (const k of S.kingdoms || []) t += k.treasury || 0;
  return t;
}
// 事件をじかに起こす（試験用）
export function startVillageIncident(sim, o) { return openIncident(sim, o); }
// 試験用：いま各町で、いちばんしたいこと（実行はしない）
export function peekDeeds(sim) {
  const S = sim.S, X = XV(sim), out = [];
  const actorSids = new Set();
  for (const V of X.list) if (V.state !== 'ruin') { actorSids.add(V.sid); const near = nearestTownOf(sim, V); if (near) actorSids.add(near.id); }
  for (const TV of S.tribes?.villages || []) if (!TV.gone) actorSids.add(TV.sid);
  const villageSids = [...actorSids].filter((sid) => isVillageKey(sim, partyKeyOfSid(sim, sid)));
  const rich = new Map();
  for (const h of Object.values(S.households)) if (h.money > 30 && h.house != null) rich.set(h.s, (rich.get(h.s) || 0) + 1);
  sim._vRich = rich;
  for (const sid of actorSids) {
    const pk = partyKeyOfSid(sim, sid);
    const people = sim.living().filter((p) => p.s === sid && sim.ageOf(p) >= 16 && sim.ageOf(p) <= 50 && p.jail == null && p.job !== 'vchief');
    const by = {};
    for (const p of people) for (const o of deedOptions(sim, p, pk, sid, false, villageSids)) if (!by[o.deed] || o.sc > by[o.deed].sc) by[o.deed] = o;
    out.push({ sid, name: sim.town(sid).name, best: Object.values(by).map((o) => `${o.deed}:${o.sc.toFixed(2)}`) });
  }
  return out;
}
export function startVillageRaid(sim, from, toKey, kind = 'raid') { return startRaid(sim, from, toKey, kind, null); }
export function villageRuin(sim, vid, byKey = null) { const V = XV(sim).list[vid]; if (!V) return; for (const hh of Object.values(sim.S.households).filter((h) => h.s === V.sid && h.members.length)) refugeeHousehold(sim, V, hh, '村が滅びて'); ruin(sim, V, byKey); }
export { partyKeyOfSid, P as villageParty };
