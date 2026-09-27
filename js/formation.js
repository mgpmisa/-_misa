// パーティの隊列と、職業による能力の補正（開発部）
//
// 社長の指示：
//   1. パーティの移動は前衛と後衛に分かれ、ちゃんと広がって歩く（今はみんな重なっていてパーティらしさが薄い）。
//   2. 職業によって能力に補正を付ける。例：盾役は重い防具や盾を付けるので筋力が要る。だから筋力を高めにする。
//
// ■ 1. 移動の隊列（見た目の位置だけを変える）
//   ・本当の位置 p.pos は変えない。道探し・到着・詰まり・会話・戦い・セーブには一切影響しない
//     （spacing.js と同じ考え方。本当の位置をずらすと、道の途中の点を踏み外して詰まる・壁に入るおそれがあるため）。
//   ・並び（前から）：先頭＝斥候と盾役 → 攻撃役 → 遠距離と回復役 → しんがり＝2人目の盾役（いなければ4人以上のとき一番強い攻撃役）。
//   ・列の間は1.2マス、横の間は1.1マス。道幅（歩ける横の広さ）に合わせて1列・2列・3列を変える。道の上では2列まで。
//   ・隊列は「先頭の人が歩いてきた跡」と「これから歩く道」に沿って置く。曲がり角では蛇のように道なりに曲がり、
//     壁や水を横切らない。置けない所（建物・水・柵）には置かず、真ん中へ寄せる。
//   ・場面ごとの並び：
//       宿・酒場・建物の入口へ近づいたとき … 1列に並んで順に入る
//       野営 …… 焚き火を囲む輪。盾役と攻撃役は外側（見張りの向き）
//       町で立ち止まって待つとき …… 行き先の入口を向いて、前に盾役とリーダー、後ろにほかの仲間
//       戦いの前（敵が9マス以内に見えた） …… 敵の方を向いて、盾役と攻撃役が横一列、遠距離と回復役が2.4マス後ろ、斥候は脇
//   ・戦いが始まった人（e.fight）は、今の戦いの仕組み（tactics.js・combat.js）の本当の位置に任せる。
//
// ■ 2. 職業による能力の補正
//   ・JOB_BONUS（住人の仕事）と CLASS_BONUS（冒険者の職業。こちらが優先）で、職ごとに上乗せする能力と理由を決める。
//   ・始めの値：職に就いたとき、上乗せ分を「鍛えた分」（p.gr.tr。growth.js）に足す。職が変わったら、前の職の分を引いて新しい職の分を足す。
//   ・伸びやすさ：その職の務め（仕事・鍛錬・依頼・見回り・戦い）をしている1時間ごとに、上乗せする能力が余分に伸びる（上乗せ1につき×0.25）。
//   ・筋力が上がると、持てる重さ（carry.js の carryPower が p.stats.str を読む）と、
//     重い鎧を着たときの息の減り方（combat.js の useSta に formationArmorStrain を掛ける）が良くなる。
//   ・人の詳細欄：「職業の補正：筋力＋2・体力＋1.5（重い盾と鎧を扱う）」。
//
// ■ 本体からの呼び方（部長がつなぐ。patch_formation.py）
//   ensureFormation(sim)            … sim.js newWorld の最後と load のあと（状態の用意だけ。古いセーブでも動く）
//   formationHourly(sim)            … sim.js newHourRest（tacticsHourly のあと）：職業の補正を付け直し、務めの伸びを足す
//   formationPos(sim, e, human)     … render.js：spacedPos の前。隊列の見た目の位置 {x,z}、隊列にいなければ null
//   formationArmorStrain(e, mul)    … combat.js useSta：鎧の重さの倍率を、筋力で軽くする
//   formationBonusHtml(sim, p)      … ui.js 人の詳細欄（能力と技能の下）
//   formationRows(sim, p)           … ui.js 冒険者の欄（隊列での位置）
//   formationStats(sim)             … 試験用の数
//
// ■ お金の流れ：なし（見た目の位置と能力の数だけ。お金は一切動かさない）
//
// ■ 状態
//   S.formation = { v, stats:{ applied, changed, removed, extraH } } … 回数の記録（保存される）
//   p.gr.jb     = { key, add:{str:2,…}, why }                        … いま付いている職業の補正（保存される）
//   sim._fmt    = 隊列の計算の控え（保存しない。先頭の足跡・列の数など）
import { W, H, T, walkable } from './world.js';
import { gainStat, STAT_NAME } from './growth.js';
import { tacticsRole, ROLE_NAME } from './tactics.js';

// ---------- 数の目安 ----------
export const FTUNE = {
  ROW: 1.2,          // 列の間（マス）
  COL: 1.1,          // 横の間（マス）
  FILE: 1.05,        // 1列で歩くときの間
  JOIN: 6,           // 先導役からこの距離までの仲間を隊列に入れる
  SAME_DEST: 4,      // 同じ行き先とみなす差
  TRAIL: 12,         // 足跡を覚えておく長さ（マス）
  DOOR_Q: 4.5,       // 入口までこの距離になったら1列に並ぶ
  FOE_R: 9,          // この距離に敵が見えたら戦いの前の並び
  FOE_EVERY: 4,      // 敵を探し直す間隔（分）
  BACK: 2.4,         // 戦いの前：後衛は前衛の何マス後ろ
  CAMP_R: 1.15,      // 野営の輪の半径
  UP_WAIT: 3,        // 列の数を増やすのは、広い所が3回続いてから（ばたつかない）
  GROW: 0.25,        // 伸びやすさ：上乗せ1につき、務め1時間で余分に鍛える量（growth.js の gainStat の率）
  STRAIN_STEP: 0.08, // 筋力が10より1高いごとに、鎧の重さの余分な疲れを8%軽くする
  STRAIN_MIN: -0.3, STRAIN_MAX: 0.6,
};

// ---------- 職業による能力の補正 ----------
// [上乗せ, 理由]
const B = (add, why) => ({ add, why });
export const JOB_BONUS = {
  // 盾役・兵
  knight: B({ str: 2, vit: 1.5 }, '重い盾と鎧を扱う'), royalguard: B({ str: 2, vit: 1.5 }, '重い盾と鎧で王を守る'),
  paladin: B({ str: 1.5, vit: 1.5, wis: 1 }, '重い鎧を着て、祈りも捧げる'), soldier: B({ str: 1.5, vit: 1.5 }, '盾と槍を担いで行軍する'),
  warrior: B({ str: 2, vit: 1 }, '大斧を振るう'), general: B({ str: 1, cha: 1.5 }, '鎧を着て兵を率いる'),
  guard: B({ vit: 1, str: 1 }, '鎧を着て見張りに立つ'), gatekeeper: B({ vit: 1, str: 1 }, '鎧を着て門に立ち続ける'),
  watchman: B({ vit: 1, agi: 0.5 }, '夜通し見回る'), jailer: B({ vit: 1, str: 1 }, '囚人を押さえつける'), militia: B({ vit: 1, str: 0.5 }, '槍を持って町を守る'),
  swordmaster: B({ str: 1.5, agi: 1, dex: 1 }, '剣の型を毎日教える'), guildmaster: B({ str: 1, cha: 1 }, '冒険者を束ねる'), banditchief: B({ str: 1.5, cha: 1 }, '荒くれ者を力で従える'),
  pirate: B({ str: 1, agi: 1 }, '揺れる甲板で斬り合う'),
  // 力仕事
  smith: B({ str: 2, dex: 0.5 }, '重い槌を振るう'), woodcutter: B({ str: 2, vit: 0.5 }, '斧で木を倒す'), miner: B({ str: 2, vit: 1 }, 'つるはしで岩を掘る'),
  mason: B({ str: 1.5, dex: 0.5 }, '石を切り出して積む'), carpenter: B({ str: 1, dex: 1 }, '材木を担いで組む'), shipwright: B({ str: 1, dex: 1 }, '船の材木を担いで組む'),
  farmer: B({ str: 1, vit: 1 }, '鍬で畑を耕す'), rancher: B({ str: 1, vit: 1 }, '家畜の世話で力を使う'), miller: B({ str: 1.5 }, '粉の袋を担ぐ'),
  butcher: B({ str: 1, dex: 0.5 }, '大きな肉を切り分ける'), roadworker: B({ str: 1.5, vit: 1 }, '石を運んで道を固める'), pioneer: B({ str: 1.5, vit: 1 }, '木を倒し、土地を拓く'),
  charcoal: B({ vit: 1, str: 0.5 }, '炭焼きの火の番をする'), gravedigger: B({ str: 1, vit: 0.5 }, '墓穴を掘る'), stablehand: B({ str: 1, vit: 0.5 }, '馬の世話で力を使う'),
  sailor: B({ vit: 1, agi: 1 }, '帆を操る'), diver: B({ vit: 1.5, agi: 0.5 }, '深く潜る'), fisher: B({ dex: 1, vit: 0.5 }, '網を引く'),
  coachman: B({ str: 0.5, dex: 1 }, '手綱をさばく'), ferryman: B({ str: 1, vit: 0.5 }, '竿で舟を押す'),
  // 身軽さと器用さ
  archer: B({ dex: 2, agi: 1.5 }, '弓を引き、身軽に動く'), hunter: B({ dex: 1.5, agi: 1 }, '弓で獲物を射る'),
  thief: B({ agi: 2, dex: 1.5 }, '身軽に忍び込む'), pickpocket: B({ dex: 2, agi: 1 }, '指先で財布を抜く'), smuggler: B({ agi: 1, cha: 1 }, '見つからずに品を運ぶ'),
  messenger: B({ agi: 1.5, vit: 1 }, '走って知らせを届ける'), dancer: B({ agi: 1.5, cha: 1 }, '舞で人を魅せる'),
  tailor: B({ dex: 1.5 }, '針と糸を使う'), weaver: B({ dex: 1.5 }, '機を織る'), cobbler: B({ dex: 1.5 }, '革を縫う'), potter: B({ dex: 1.5 }, 'ろくろを回す'),
  jeweler: B({ dex: 1.5, int: 0.5 }, '細かな細工をする'), painter: B({ dex: 1.5, cha: 0.5 }, '絵筆を使う'), barber: B({ dex: 1.5 }, '剃刀を使う'),
  baker: B({ dex: 1, vit: 0.5 }, '生地をこねる'), cook: B({ dex: 1 }, '包丁を使う'), beekeeper: B({ dex: 1 }, '蜂を扱う'), gatherer: B({ agi: 1, dex: 0.5 }, '山を歩いて薬草を探す'),
  // 知力
  wizard: B({ int: 2.5 }, '呪文を学ぶ'), courtmage: B({ int: 2.5, wis: 0.5 }, '王に仕える魔術を学ぶ'), sage: B({ int: 2, wis: 1 }, '古い書と魔法に通じる'),
  magister: B({ int: 2, wis: 0.5 }, '魔法を教える'), scholar: B({ int: 2 }, '書物を読み解く'), alchemist: B({ int: 1.5, dex: 0.5 }, '薬と金属を調べる'),
  doctor: B({ int: 1, wis: 1 }, '病と傷を診る'), herbalist: B({ int: 1, dex: 0.5 }, '薬草を調合する'), teacher: B({ int: 1, cha: 0.5 }, '子どもに教える'),
  chancellor: B({ int: 1.5, cha: 0.5 }, '国の政を考える'), treasurer: B({ int: 1.5 }, '国の金を数える'), scribe: B({ int: 1, dex: 0.5 }, '文字を書き写す'),
  overseer: B({ int: 1, cha: 0.5 }, '普請を取り仕切る'), captain: B({ int: 1, cha: 1 }, '船と船乗りを率いる'), keeper: B({ wis: 1 }, '灯台の火を守る'),
  // 精神
  priest: B({ wis: 2.5 }, '祈りを捧げる'), cleric: B({ wis: 2.5 }, '祈りで仲間を癒す'), nun: B({ wis: 2 }, '祈りと奉仕の日々'), midwife: B({ wis: 1, dex: 0.5 }, 'お産を助ける'),
  elder: B({ wis: 1, cha: 1 }, '村をまとめる'), fortune: B({ wis: 1, cha: 1 }, '人の運命を占う'), nanny: B({ wis: 1 }, '子を育てる'),
  // 魅力
  merchant: B({ cha: 2 }, '客と値を交渉する'), bard: B({ cha: 2, dex: 0.5 }, '歌と物語で人を惹きつける'), peddler: B({ cha: 1.5, vit: 0.5 }, '村々を回って売り込む'),
  innkeeper: B({ cha: 1 }, '旅人をもてなす'), changer: B({ cha: 1, int: 1 }, 'お金の両替を交渉する'), musician: B({ cha: 1, dex: 1 }, '楽器を奏でる'),
  jester: B({ cha: 1.5, agi: 0.5 }, '人を笑わせる'), troupe: B({ cha: 1.5, agi: 0.5 }, '旅の舞台に立つ'), storyteller: B({ cha: 1.5 }, '物語を語る'),
  swindler: B({ cha: 2 }, '口先で人をだます'), king: B({ cha: 1.5 }, '民の前に立つ'), royal: B({ cha: 1 }, '宮廷で振る舞う'), noble: B({ cha: 1 }, '宮廷で振る舞う'),
  butler: B({ cha: 1, dex: 0.5 }, '主に仕える'), maid: B({ dex: 1 }, '身の回りの世話をする'),
  adventurer: B({ vit: 1, agi: 1 }, '旅と戦いに慣れる'),
};
// 冒険者の職業（advclass.js）。こちらが仕事の補正より優先する
export const CLASS_BONUS = {
  squire: B({ str: 2, vit: 1.5 }, '重い盾と鎧を扱う'), paladin: B({ str: 1.5, vit: 1.5, wis: 1 }, '重い鎧を着て、祈りも捧げる'),
  fighter: B({ str: 2, vit: 1.5 }, '大斧と重い胴着で盾になる'), swordsman: B({ str: 1.5, dex: 1 }, '剣を振るう'),
  hero: B({ str: 1.5, vit: 1, cha: 1 }, '剣を振るい、仲間を奮い立たせる'), monk: B({ agi: 2, str: 1 }, '身ひとつで戦う'),
  bandit: B({ str: 1.5, agi: 1 }, '斧を振るって荒れ地を駆ける'), thief: B({ agi: 2, dex: 2 }, '鍵を開け、罠を外す'),
  archer: B({ dex: 2, agi: 1.5 }, '弓を引き、身軽に動く'), wizard: B({ int: 2.5 }, '呪文を学ぶ'), sorcerer: B({ int: 2.5, wis: 0.5 }, '魔導書を読み解く'),
  priest: B({ wis: 2.5 }, '祈りで仲間を癒す'),
};
// 務めとみなす行動（この1時間にしていれば、上乗せの能力が余分に伸びる）
const DUTY = new Set(['work', 'train', 'quest', 'patrol', 'hunt', 'gather', 'dojo', 'academy', 'guard', 'defend', 'march', 'perform', 'trade', 'pray']);
const TITLE_AT = { str: [17.5, '怪力'], vit: [17.5, '鉄の体'], agi: [16.5, '俊足'], dex: [17.5, '器用な手'], int: [17.5, '博識'], wis: [18.5, '徳の人'], cha: [17.5, '人気者'] };   // growth.js の STAT_TITLES と同じ

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const alive = (m) => !!m && m.deathYear == null && !!m.needs;

const STAT_KEYS = ['applied', 'changed', 'removed', 'extraH', 'silentTitles'];
export function ensureFormation(sim) {
  const S = sim.S;
  if (!S.formation) S.formation = { v: 1, stats: {} };
  const F = S.formation;
  if (!F.stats) F.stats = {};
  for (const k of STAT_KEYS) if (F.stats[k] == null) F.stats[k] = 0;
  return F;
}

// その人に合う補正と、その鍵（職が変わったかを見分ける）
export function bonusOf(sim, p) {
  if (!p || p.deathYear != null || !p.job) return null;
  if (sim.ageOf(p) < 14) return null;
  if (p.advClass && CLASS_BONUS[p.advClass]) return { key: 'c:' + p.advClass, ...CLASS_BONUS[p.advClass] };
  if (JOB_BONUS[p.job]) return { key: 'j:' + p.job, ...JOB_BONUS[p.job] };
  return null;
}
function applyBonus(sim, p, silent) {
  const g = p.gr;
  if (!g || !g.tr) return;
  const F = ensureFormation(sim).stats;
  const first = g.jb === undefined;
  const want = bonusOf(sim, p);
  const key = want ? want.key : null;
  if (g.jb && g.jb.key === key) return;
  // 前の職の分を引く（使わずに抜けた分があれば、残っている分だけ）
  if (g.jb && g.jb.add) {
    for (const [k, v] of Object.entries(g.jb.add)) {
      const cut = Math.min(v, g.tr[k] || 0);
      g.tr[k] = r1((g.tr[k] || 0) - cut);
      if (p.stats && typeof p.stats[k] === 'number') p.stats[k] = r1(p.stats[k] - cut);
    }
    F.removed++;
  }
  if (!want) { g.jb = { key: null }; return; }
  const add = {};
  for (const [k, v] of Object.entries(want.add)) {
    add[k] = v;
    g.tr[k] = r1((g.tr[k] || 0) + v);
    if (p.stats && typeof p.stats[k] === 'number') p.stats[k] = r1(p.stats[k] + v);
  }
  g.jb = { key, add, why: want.why };
  if (first) F.applied++; else F.changed++;
  // はじめて付けたとき（世界の始まり・古いセーブ）に届いた称号は、黙って持たせる（速報があふれないように）
  if ((silent || first) && p.stats && sim.ageOf(p) >= 16) {
    const got = p.titles || (p.titles = []);
    for (const k of Object.keys(add)) {
      const [v, t] = TITLE_AT[k] || [];
      if (t && p.stats[k] >= v && !got.includes(t)) { got.push(t); F.silentTitles++; }
    }
  }
}

// 1時間ごと：補正の付け直しと、務めによる余分な伸び
export function formationHourly(sim) {
  const S = sim.S;
  const F = ensureFormation(sim).stats;
  for (const p of sim.living()) {
    if (!p.gr || !p.gr.tr) continue;
    applyBonus(sim, p, false);
    const jb = p.gr.jb;
    if (!jb || !jb.add || p.jail != null) continue;
    const a = p.action;
    const duty = (a && DUTY.has(a.type) && a.phase !== 'walk') || (p.gr.fought != null && S.t - p.gr.fought < 60) || !!p.fight;
    if (!duty) continue;
    for (const [k, v] of Object.entries(jb.add)) gainStat(p, k, 1, FTUNE.GROW * v);
    F.extraH++;
  }
}

// 重い鎧の疲れ：mul（布1・革1.1・鎖1.3・板金1.6）の「1を超えた分」を、筋力が高いほど軽くする
export function formationArmorStrain(e, mul) {
  if (!(mul > 1) || !e || typeof e.id !== 'number') return mul;
  const str = typeof e.stats?.str === 'number' ? e.stats.str : 10;
  const relief = clamp((str - 10) * FTUNE.STRAIN_STEP, FTUNE.STRAIN_MIN, FTUNE.STRAIN_MAX);
  return 1 + (mul - 1) * (1 - relief);
}

// 人の詳細欄
export function formationBonusHtml(sim, p) {
  if (!p || p.deathYear != null || !p.gr) return '';
  const jb = p.gr.jb;
  if (!jb || !jb.add) return '';
  const parts = Object.entries(jb.add).map(([k, v]) => `${STAT_NAME[k]}＋${v}`).join('・');
  const grow = Object.keys(jb.add).map((k) => STAT_NAME[k]).join('・');
  const str = p.stats?.str ?? 10;
  const strain = str > 10.5 ? `　重い鎧の疲れ −${Math.round(clamp((str - 10) * FTUNE.STRAIN_STEP, 0, FTUNE.STRAIN_MAX) * 100)}%` : '';
  return `<div class="section"><dl class="kv"><dt>職業の補正</dt><dd>${esc(parts)}（${esc(jb.why || '')}）<br><span class="sub">務めのたびに${esc(grow)}が伸びやすい${strain}</span></dd></dl></div>`;
}
export function formationBonusText(sim, p) { return formationBonusHtml(sim, p).replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').trim(); }

// ======================================================================
// 移動の隊列（見た目だけ）
// ======================================================================
const URGENT = new Set(['flee', 'defend', 'alert', 'rescue', 'march', 'crusade']);
const ROAD_LIKE = new Set([T.ROAD, T.BRIDGE, T.PLAZA, T.DOCK]);

function fst(sim) {
  let s = sim._fmt;
  if (!s || s.S !== sim.S) s = sim._fmt = { S: sim.S, pt: new Map(), stats: { layouts: 0, walk: 0, file: 0, door: 0, foe: 0, camp: 0, wait: 0, pulled: 0, cols: [0, 0, 0, 0] } };
  return s;
}
function tileOf(sim, x, z) {
  x = Math.round(x); z = Math.round(z);
  if (x < 0 || z < 0 || x >= W || z >= H) return -1;
  return sim.S.world.tiles[z * W + x];
}
const okT = (t) => t >= 0 && walkable(t);
// a から b まで、歩ける地面だけを通るか
function clearLine(sim, ax, az, bx, bz) {
  if (!okT(tileOf(sim, bx, bz))) return false;
  const d = Math.abs(bx - ax) + Math.abs(bz - az);
  const n = Math.ceil(d / 0.3);
  for (let i = 1; i < n; i++) { const k = i / n; if (!okT(tileOf(sim, ax + (bx - ax) * k, az + (bz - az) * k))) return false; }
  return true;
}
// 一緒に歩いている顔ぶれか
function walking(m) {
  const a = m.action;
  return !!a && a.phase === 'walk' && a.tx != null && !URGENT.has(a.type) && !m.fight && !m.talk && m.inside == null && !m.mission;
}
function partyOf(sim, e) {
  const pt = sim.S.advParties?.[e.party];
  return pt && !pt.gone && pt.members.includes(e.id) ? pt : null;
}
const strength = (m) => (m.atk || 5) + (m.maxhp || 40) * 0.15 + (m.lv || 1);

// 役割で並びの組に分ける：[先頭, 攻撃, 後衛, しんがり]
function roleGroups(sim, ms) {
  const role = new Map(ms.map((m) => [m.id, tacticsRole(sim, m)]));
  const tanks = ms.filter((m) => role.get(m.id) === 'tank').sort((a, b) => strength(b) - strength(a) || a.id - b.id);
  const scouts = ms.filter((m) => role.get(m.id) === 'scout');
  let atk = ms.filter((m) => role.get(m.id) === 'attack').sort((a, b) => strength(b) - strength(a) || a.id - b.id);
  const back = ms.filter((m) => role.get(m.id) === 'ranged' || role.get(m.id) === 'heal').sort((a, b) => (role.get(a.id) === 'heal') - (role.get(b.id) === 'heal') || a.id - b.id);
  let front = [...scouts, ...(tanks.length ? [tanks[0]] : [])];
  let rear = [];
  if (tanks.length >= 2) { rear = [tanks[1]]; front.push(...tanks.slice(2)); }
  else if (ms.length >= 4 && atk.length >= 2) { rear = [atk[0]]; atk = atk.slice(1); }   // 盾が1人なら、一番強い攻撃役がしんがり
  if (!front.length && atk.length) { front = [atk[0]]; atk = atk.slice(1); }             // 盾も斥候もいなければ、一番強い攻撃役が先頭
  const all = [[front, '先頭'], [atk, '次の列'], [back, '後ろ'], [rear, 'しんがり']].filter(([g]) => g.length);
  return { groups: all.map(([g]) => g), names: all.map(([, n]) => n), role };
}

// ---------- 道なりの線（足跡＋これから歩く道） ----------
function buildLine(st, guide) {
  const pts = [];
  const tr = st.trail;
  for (let i = 0; i < tr.length; i++) pts.push(tr[i]);
  const last = pts[pts.length - 1];
  if (!last || Math.hypot(last.x - guide.pos.x, last.z - guide.pos.z) > 0.01) pts.push({ x: guide.pos.x, z: guide.pos.z });
  const i0 = pts.length - 1;
  let len = 0, px = guide.pos.x, pz = guide.pos.z;
  const path = guide.path && guide.path.length ? guide.path : [{ x: guide.action.tx, z: guide.action.tz }];
  for (let i = 0; i < path.length && len < 9; i++) {
    const q = path[i];
    const d = Math.hypot(q.x - px, q.z - pz);
    if (d < 0.01) continue;
    pts.push({ x: q.x, z: q.z }); len += d; px = q.x; pz = q.z;
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return { pts, cum, s0: cum[i0], end: cum[cum.length - 1] };
}
// 線の上の s の点（はみ出たら端の向きのまま伸ばす）
function at(L, s) {
  const { pts, cum } = L, n = pts.length;
  if (n === 1) return { x: pts[0].x, z: pts[0].z };
  if (s <= 0) { const a = pts[0], b = pts[1], d = cum[1] || 1; return { x: a.x + (a.x - b.x) / d * -s, z: a.z + (a.z - b.z) / d * -s }; }
  if (s >= cum[n - 1]) { const a = pts[n - 1], b = pts[n - 2], d = (cum[n - 1] - cum[n - 2]) || 1; const k = s - cum[n - 1]; return { x: a.x + (a.x - b.x) / d * k, z: a.z + (a.z - b.z) / d * k }; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const k = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * k, z: pts[lo].z + (pts[hi].z - pts[lo].z) * k };
}
function tangent(L, s, fb) {
  const a = at(L, s - 0.7), b = at(L, s + 0.7);
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
  return d > 0.05 ? { x: dx / d, z: dz / d } : fb;
}
// 横に何マス空いているか（片側。0〜1.5）
function room(sim, c, n, road) {
  const side = (sgn) => {
    let r = 0;
    for (const k of [0.55, 1.1, 1.5]) {
      const x = c.x + n.x * k * sgn, z = c.z + n.z * k * sgn;
      if (!clearLine(sim, c.x, c.z, x, z)) break;
      if (road && k > 1.1 && !ROAD_LIKE.has(tileOf(sim, x, z))) break;   // 道の上では、道の脇（1マス）までしか広がらない
      r = k;
    }
    return r;
  };
  return [side(1), side(-1)];
}
// 並べる列の数（1〜3）
function colsFor(sim, L, sc, span, fb) {
  let best = 3;
  for (const off of [-span / 2, 0, span / 2]) {
    const s = sc + off;
    const c = at(L, s), t = tangent(L, s, fb), n = { x: -t.z, z: t.x };
    const ct = tileOf(sim, c.x, c.z);
    const road = ROAD_LIKE.has(ct);
    const [l, r] = room(sim, c, n, road);
    const w = l + r;
    let cols = w >= 2.2 ? 3 : w >= 1.05 ? 2 : 1;
    if (road && cols > 2) cols = 2;           // 道の上では2列まで（すれ違う人のために片側を空ける）
    if (cols < best) best = cols;
  }
  return best;
}
// 横の置き場（1列の人数 k、列の数 C）
function lateral(k) { return k <= 1 ? [0] : k === 2 ? [-0.55, 0.55] : [-1.1, 0, 1.1]; }

// 置けるか確かめて、だめなら真ん中へ寄せる
function slotAt(sim, S2, c, n, lat, fb) {
  for (const f of [1, 0.5]) {
    const x = c.x + n.x * lat * f, z = c.z + n.z * lat * f;
    if (clearLine(sim, c.x, c.z, x, z)) { if (f !== 1) S2.pulled++; return { x, z }; }
  }
  S2.pulled++;
  return okT(tileOf(sim, c.x, c.z)) || !fb ? { x: c.x, z: c.z } : { x: fb.x, z: fb.z };
}

// 近くに見えている敵（数分ごとに探し直す）
function foeNear(sim, st, cx, cz) {
  const t = sim.S.t;
  if (st.foeT != null && t - st.foeT < FTUNE.FOE_EVERY && st.foeAt && Math.abs(st.foeAt.x - cx) + Math.abs(st.foeAt.z - cz) < 3) return st.foe;
  st.foeT = t; st.foeAt = { x: cx, z: cz };
  let best = null, bd = FTUNE.FOE_R;
  for (const c of Object.values(sim.S.creatures)) {
    if (!c.hostile || c.hp <= 0 || c.dormant || c.inDungeon || c.keeper != null) continue;
    const dx = c.pos.x - cx, dz = c.pos.z - cz;
    if (Math.abs(dx) > bd || Math.abs(dz) > bd) continue;
    const d = Math.hypot(dx, dz);
    if (d < bd) { bd = d; best = c; }
  }
  st.foe = best ? best.id : null;
  return st.foe;
}

// ---------- 歩くときの並び ----------
function walkLayout(sim, pt, st, out) {
  const S2 = fst(sim).stats;
  const ms = pt.members.map((id) => sim.S.people[id]).filter((m) => alive(m) && m.party === pt.id && walking(m));
  if (ms.length < 2) { st.trail = []; return false; }
  const lead = sim.S.people[pt.leader];
  const guide0 = ms.includes(lead) ? lead : ms.slice().sort((a, b) => a.id - b.id)[0];
  const ga = guide0.action;
  let grp = ms.filter((m) => Math.abs(m.action.tx - ga.tx) <= FTUNE.SAME_DEST && Math.abs(m.action.tz - ga.tz) <= FTUNE.SAME_DEST && Math.hypot(m.pos.x - guide0.pos.x, m.pos.z - guide0.pos.z) <= FTUNE.JOIN);
  if (grp.length < 2) { st.trail = []; return false; }
  // 先導役：いちばん先にいる人（残りの道のりが短い人）
  const remain = (m) => Math.hypot(m.action.tx - m.pos.x, m.action.tz - m.pos.z) + (m.path ? m.path.length * 0.01 : 0);
  const guide = grp.slice().sort((a, b) => remain(a) - remain(b) || a.id - b.id)[0];
  // 足跡
  const tr = st.trail || (st.trail = []);
  const lastP = tr[tr.length - 1];
  if (lastP && Math.hypot(lastP.x - guide.pos.x, lastP.z - guide.pos.z) > 3) tr.length = 0;
  if (!lastP || tr.length === 0 || Math.hypot(tr[tr.length - 1].x - guide.pos.x, tr[tr.length - 1].z - guide.pos.z) >= 0.3) tr.push({ x: guide.pos.x, z: guide.pos.z });
  let tl = 0;
  for (let i = tr.length - 1; i > 0; i--) { tl += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].z - tr[i - 1].z); if (tl > FTUNE.TRAIL) { tr.splice(0, i - 1); break; } }
  const L = buildLine(st, guide);
  // 歩き出す直前・着く直前で道がほとんどないときは、少し前の並びをそのまま使う（全員が1点に重ならない）
  if (L.end < 0.5) {
    if (st.prev && sim.S.t - st.prevT <= 3) { for (const m of grp) { const q = st.prev.get(m.id); if (q) out.set(m.id, q); } return out.size > 0; }
    return false;
  }
  const fb = (() => { const t = tangent(L, L.s0, null); if (t) { st.head = t; return t; } return st.head || { x: 0, z: 1 }; })();
  // 群れの真ん中：先導役から、みんなの位置の前後の平均だけずらす
  let along = 0;
  for (const m of grp) along += (m.pos.x - guide.pos.x) * fb.x + (m.pos.z - guide.pos.z) * fb.z;
  let sc = L.s0 + along / grp.length;
  const { groups, role } = roleGroups(sim, grp);
  // 入口の前：1列に並んで順に入る
  const remG = Math.hypot(ga.tx - guide.pos.x, ga.tz - guide.pos.z);
  const door = ga.bld != null || ga.food === 'way' || ga.type === 'wayeat' || ga.type === 'report' || ga.type === 'guild' || ga.type === 'tavern';
  const queue = door && remG <= FTUNE.DOOR_Q;
  // 戦いの前：敵の方を向いて横一列
  const foeId = !queue ? foeNear(sim, st, guide.pos.x, guide.pos.z) : null;
  const foe = foeId != null ? sim.S.creatures[foeId] : null;
  if (foe) return foeLayout(sim, grp, role, guide, foe, out, st);
  // 列の数
  let C = queue ? 1 : colsFor(sim, L, sc, Math.max(2, groups.length * FTUNE.ROW), fb);
  if (!queue && st.C != null && C > st.C) { st.up = (st.up || 0) + 1; if (st.up < FTUNE.UP_WAIT) C = st.C; else st.up = 0; } else st.up = 0;
  st.C = C;
  // 列に分ける
  const rows = [];
  for (const g of groups) for (let i = 0; i < g.length; i += C) rows.push(g.slice(i, i + C));
  const gap = C === 1 ? FTUNE.FILE : FTUNE.ROW;
  const R = rows.length;
  let front = sc + (R - 1) / 2 * gap;
  // 行き先の手前で先頭が止まる（道の先を越えて置かない）。入口の前は先頭が入口に立つ
  if (front > L.end) front = L.end;
  // 歩き始めで足跡が短いときは、隊列を前へずらして道の上に収める
  const back = front - (R - 1) * gap;
  if (back < 0 && front < L.end) front = Math.min(L.end, front - back);
  for (let i = 0; i < R; i++) {
    const s = front - i * gap;
    const c = at(L, s);
    // 足跡より後ろ（歩き始め）は、線をまっすぐ伸ばした所。壁や水にかかるなら足跡の端に寄せる
    const e = at(L, Math.max(0, Math.min(L.end, s)));
    const cc = s >= 0 && s <= L.end ? c : clearLine(sim, e.x, e.z, c.x, c.z) ? c : e;
    const t = tangent(L, s, fb), n = { x: -t.z, z: t.x };
    // 片側が壁・建物なら、空いている側へ寄せて並ぶ
    const [rp, rm] = room(sim, cc, n, ROAD_LIKE.has(tileOf(sim, cc.x, cc.z)));   // +n の側と −n の側の空き
    let lats = lateral(rows[i].length);
    const hi = lats[lats.length - 1], lo = lats[0];
    let sh = 0;
    if (hi > rp + 0.05) sh = rp - hi; else if (-lo > rm + 0.05) sh = -lo - rm;
    if (sh && lo + sh >= -rm - 0.05 && hi + sh <= rp + 0.05) lats = lats.map((v) => v + sh);
    rows[i].forEach((m, j) => {
      const q = slotAt(sim, S2, cc, n, lats[j], m.pos);
      out.set(m.id, { x: q.x, z: q.z, row: i, rows: R, kind: queue ? 'door' : C === 1 ? 'file' : 'walk', face: t });
    });
  }
  S2.layouts++; S2[queue ? 'door' : C === 1 ? 'file' : 'walk']++; S2.cols[C]++;
  st.prev = new Map(out); st.prevT = sim.S.t;
  return true;
}

function foeLayout(sim, grp, role, guide, foe, out, st) {
  const S2 = fst(sim).stats;
  let hx = foe.pos.x - guide.pos.x, hz = foe.pos.z - guide.pos.z;
  const d = Math.hypot(hx, hz) || 1; hx /= d; hz /= d;
  const n = { x: -hz, z: hx };
  const cx = grp.reduce((a, m) => a + m.pos.x, 0) / grp.length, cz = grp.reduce((a, m) => a + m.pos.z, 0) / grp.length;
  const frontL = grp.filter((m) => { const r = role.get(m.id); return r === 'tank' || r === 'attack'; }).sort((a, b) => (role.get(b.id) === 'tank') - (role.get(a.id) === 'tank') || a.id - b.id);
  const scouts = grp.filter((m) => role.get(m.id) === 'scout');
  const backL = grp.filter((m) => { const r = role.get(m.id); return r === 'ranged' || r === 'heal'; });
  // 前の列：盾役が真ん中、攻撃役がその両脇。斥候は端
  const line = [];
  for (const m of frontL) { if (line.length % 2) line.push(m); else line.unshift(m); }
  if (frontL.length) { const tanks = frontL.filter((m) => role.get(m.id) === 'tank'); if (tanks.length) { line.splice(line.indexOf(tanks[0]), 1); line.splice(Math.floor(line.length / 2), 0, tanks[0]); } }
  line.push(...scouts);
  const place = (arr, fwd, kind) => {
    const k = arr.length;
    arr.forEach((m, j) => {
      const lat = (j - (k - 1) / 2) * FTUNE.COL;
      const c = { x: cx + hx * fwd, z: cz + hz * fwd };
      const base = clearLine(sim, cx, cz, c.x, c.z) ? c : { x: cx, z: cz };
      const q = slotAt(sim, S2, base, n, lat, m.pos);
      out.set(m.id, { x: q.x, z: q.z, row: kind === 'front' ? 0 : 1, rows: 2, kind: 'foe', face: { x: hx, z: hz } });
    });
  };
  place(line.length ? line : backL, 0.8, 'front');
  if (line.length) place(backL, 0.8 - FTUNE.BACK, 'back');
  st.trail = [];
  S2.layouts++; S2.foe++;
  return true;
}

// ---------- 立ち止まっているときの並び（野営・町で待つ） ----------
function stillLayout(sim, pt, st, out) {
  const S2 = fst(sim).stats;
  const ms = pt.members.map((id) => sim.S.people[id]).filter((m) => alive(m) && m.party === pt.id && m.inside == null && !m.fight && !m.talk && m.action && m.action.phase !== 'walk' && !URGENT.has(m.action.type));
  if (ms.length < 2) return false;
  const cx0 = ms.reduce((a, m) => a + m.pos.x, 0) / ms.length, cz0 = ms.reduce((a, m) => a + m.pos.z, 0) / ms.length;
  const grp = ms.filter((m) => Math.hypot(m.pos.x - cx0, m.pos.z - cz0) <= 4);
  if (grp.length < 2) return false;
  const cx = grp.reduce((a, m) => a + m.pos.x, 0) / grp.length, cz = grp.reduce((a, m) => a + m.pos.z, 0) / grp.length;
  const { groups, role } = roleGroups(sim, grp);
  const camp = grp.filter((m) => m.action.type === 'sleep' && m.action.food === 'camp').length >= grp.length / 2;
  if (camp) {
    // 焚き火を囲む輪：守りの者（盾・攻撃）と、守られる者（後衛）を交互に。盾役は少し外側で見張る
    const guards = grp.filter((m) => { const r = role.get(m.id); return r === 'tank' || r === 'attack' || r === 'scout'; });
    const weak = grp.filter((m) => !guards.includes(m));
    const ring = [];
    while (guards.length || weak.length) { if (guards.length) ring.push(guards.shift()); if (weak.length) ring.push(weak.shift()); }
    const k = ring.length, rad = Math.max(FTUNE.CAMP_R, (k * 1.1) / (2 * Math.PI));
    const rot = ((pt.id * 2654435761) >>> 0) % 360 * Math.PI / 180;
    ring.forEach((m, j) => {
      const a = rot + (j / k) * Math.PI * 2;
      const rr = rad + (role.get(m.id) === 'tank' ? 0.35 : 0);
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const q = clearLine(sim, cx, cz, x, z) ? { x, z } : { x: m.pos.x, z: m.pos.z };
      out.set(m.id, { x: q.x, z: q.z, row: 0, rows: 1, kind: 'camp', face: role.get(m.id) === 'tank' ? { x: Math.cos(a), z: Math.sin(a) } : { x: -Math.cos(a), z: -Math.sin(a) } });
    });
    S2.layouts++; S2.camp++;
    return true;
  }
  // 町で待つ：行き先の入口（なければリーダー）を向いて、前にリーダーと盾役、後ろにほかの仲間
  const inTown = sim.S.world.settlements.some((s) => Math.hypot(s.x - cx, s.z - cz) <= (s.r || 6) + 2);
  if (!inTown) return false;
  const lead = sim.S.people[pt.leader];
  const b = lead?.action?.bld != null ? sim.building(lead.action.bld) : null;
  let fx, fz;
  if (b && b.door) { fx = b.door.x - cx; fz = b.door.z - cz; } else if (st.head) { fx = st.head.x; fz = st.head.z; } else { fx = 0; fz = 1; }
  const d = Math.hypot(fx, fz) || 1; fx /= d; fz /= d;
  const n = { x: -fz, z: fx };
  const first = [...(groups[0] || [])];
  if (lead && grp.includes(lead) && !first.includes(lead)) first.unshift(lead);
  const rest = grp.filter((m) => !first.includes(m));
  const rows = [first.slice(0, 3), ...(first.length > 3 ? [first.slice(3)] : [])];
  for (let i = 0; i < rest.length; i += 3) rows.push(rest.slice(i, i + 3));
  rows.forEach((row, i) => {
    const off = ((rows.length - 1) / 2 - i) * 1.1;
    const c0 = { x: cx + fx * off, z: cz + fz * off };
    const c = clearLine(sim, cx, cz, c0.x, c0.z) ? c0 : { x: cx, z: cz };
    const lats = lateral(row.length);
    row.forEach((m, j) => { const q = slotAt(sim, S2, c, n, lats[j], m.pos); out.set(m.id, { x: q.x, z: q.z, row: i, rows: rows.length, kind: 'wait', face: { x: fx, z: fz } }); });
  });
  S2.layouts++; S2.wait++;
  return true;
}

function layoutOf(sim, ptId) {
  const F = fst(sim);
  let st = F.pt.get(ptId);
  if (!st) F.pt.set(ptId, st = { t: -1, pos: new Map(), trail: [], C: null });
  if (st.t === sim.S.t) return st;
  st.t = sim.S.t;
  st.pos.clear();
  const pt = sim.S.advParties?.[ptId];
  if (!pt || pt.gone) { F.pt.delete(ptId); return null; }
  if (!walkLayout(sim, pt, st, st.pos)) stillLayout(sim, pt, st, st.pos);
  return st;
}

// ---------- 描画から ----------
// 隊列の見た目の位置。隊列に入っていなければ null（そのときは spacing.js の立ち位置を使う）
// S.settings.formation を false にすると切れる（前と後を見比べるため）
export function formationPos(sim, e, human) {
  if (!human || e.party == null || e.inside != null || e.fight || e.deathYear != null) return null;
  if (sim.S.settings?.formation === false) return null;
  if (!partyOf(sim, e)) return null;
  const st = layoutOf(sim, e.party);
  return st ? st.pos.get(e.id) || null : null;
}
// 立ち止まっているときに向く先（野営・待つ・戦いの前）。なければ null
export function formationFace(sim, e) {
  const q = formationPos(sim, e, true);
  if (!q || !q.face || q.kind === 'walk' || q.kind === 'file' || q.kind === 'door') return null;
  return { x: q.x + q.face.x, z: q.z + q.face.z };
}

// ---------- 人の詳細欄（冒険者の欄の中）：隊列での位置 ----------
const KIND_NAME = { walk: '隊列を組んで歩いている', file: '道が狭いので1列で歩いている', door: '入口の前で1列に並んでいる', foe: '敵に向かって陣を敷いている', camp: '焚き火を囲んで野営している', wait: '仲間とそろって待っている' };
export function formationRows(sim, p) {
  if (!p || p.party == null || p.deathYear != null) return '';
  const pt = partyOf(sim, p);
  if (!pt) return '';
  const ms = pt.members.map((id) => sim.S.people[id]).filter(alive);
  const { groups, names } = roleGroups(sim, ms);
  const i = groups.findIndex((g) => g.includes(p));
  const place = i >= 0 ? names[i] : '';
  const q = p.inside == null && !p.fight ? formationPos(sim, p, true) : null;
  return `<dt>隊列</dt><dd>${esc(place || '—')}（${esc(ROLE_NAME[tacticsRole(sim, p)] || '')}）${q ? `<br><span class="sub">${esc(KIND_NAME[q.kind] || '')}</span>` : ''}</dd>`;
}

// ---------- 試験用 ----------
export function formationStats(sim) {
  const F = fst(sim).stats;
  return { ...F, cols: [...F.cols], bonus: { ...ensureFormation(sim).stats } };
}
