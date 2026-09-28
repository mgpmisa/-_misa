// 子どもの動き（ドット絵）― 開発部（childhood.js の行動に合わせて描く）
//
// 社長の方針「全ての行動に絵を用意する」。子どもの行動（sim の action.type 'kid'、中身 a.k）ごとに動きを返す。
// 今ある動き（anim_people.js・anim_acts.js の 'work:read' 'work:weed' 'work:fish' など）は、子どもの体に合わせて
// 道具が7割の大きさで描かれるので、そのまま使い回す。どうしても新しく要る動きだけ、ここで足す：
//   kid_swing 棒を振る／kid_duel 打ち合う／kid_throw 投げる／kid_climb 木登り／kid_splash 水をかけ合う／kid_slide 氷すべり／
//   kid_net 虫取り網／kid_pick しゃがんで拾う／kid_mud 泥だんご／kid_wrestle 取っ組み合い／kid_lead 号令／kid_house ままごと／
//   kid_act 身ぶり／kid_sing 歌う／kid_hide 物陰から頭を出す／kid_peek のぞく／kid_gaze 寝ころんで星を見る／kid_pet 動物をなでる／
//   kid_draw 地面に絵を描く／kid_whittle 木を削る／kid_milk 乳しぼり／kid_mend 網をつくろう／kid_bellows ふいご／kid_babysit 子守り／
//   kid_carry 薪を運ぶ／kid_nurse 看病／kid_bee 煙でいぶす／kid_stable 馬にブラシ／kid_chimney 煙突掃除／kid_bell 鐘つき／kid_bow お辞儀／
//   kid_pageboy 盾を抱える小姓／kid_spell 指先の小さな火／kid_ride ポニーに乗る／kid_flute 笛／kid_ledger 帳面／kid_listen 焚き火の前で聞く／
//   kid_filch さっと手を伸ばす／kid_dice さいころ／kid_haulpack 大きな荷を背負う／kid_run 走り回る／kid_read 石板に書く
//
// ■ 本体からの呼び方：main.js で import './anim_kids.js' するだけ（読み込まれた時点で動きと「行動 → 動き」の決め方が登録される）
//   anim_people.js の addWorkMotions・addAnimStateHook・ANIM_STATE_HOOKS・POSE_KIT と、anim_acts.js の PROPS・FX（地面の小道具と効果）を使う。
import { addWorkMotions, addAnimStateHook, ANIM_STATE_HOOKS, POSE_KIT, JOB_MOTION } from './anim_people.js';
import { PROPS, FX } from './anim_acts.js';
import { KACT } from './childhood.js';

const { hands4, A, AT, TL, OBJ } = POSE_KIT;
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const lot = (p, t, span = 20, salt = 0) => hash((p.id | 0) * 7919 + Math.floor(t / span) * 131 + salt);
const STICK = '#c8a060';   // 遊びの道具は明るい色（遠くからでも何をしているか分かるように）

// ================================================================ 手に持つ小物
Object.assign(OBJ, {
  mudball: (P, x, y, tl) => { P.rect(x - 1, y - 1, 2, 2, tl.ph ? '#7a5a3a' : '#8a6a44'); P.px(x - 1, y - 1, '#a8885a'); },
  pebble: (P, x, y) => { P.px(x, y - 1, '#b8b4ac'); P.px(x + 1, y - 1, '#8a867e'); },
  snowball: (P, x, y) => { P.rect(x - 1, y - 2, 2, 2, '#f4f8ff'); P.px(x, y - 1, '#d0dcec'); },
  kidcup: (P, x, y) => { P.rect(x - 1, y, 2, 1, '#e8e0c8'); P.px(x, y - 1, '#6ac050'); },
  leafplate: (P, x, y) => { P.rect(x - 1, y, 3, 1, '#5aa040'); P.px(x, y - 1, '#e04040'); },
  knife: (P, x, y) => { P.px(x, y - 1, '#dce0e8'); P.px(x, y - 2, '#dce0e8'); P.px(x, y, '#6a4a2a'); },
  woodpiece: (P, x, y, tl) => { P.rect(x - 1, y - 1, 2, 3, '#d8b070'); if (tl.ph) P.px(x, y - 2, '#e8c890'); },
  firewood: (P, x, y, tl, G, hands) => { const mx = Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), my = Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2); P.rect(mx - 3, my - 2, 6, 1, '#8a5a2a'); P.rect(mx - 3, my - 1, 6, 1, '#a0703a'); P.rect(mx - 2, my - 3, 5, 1, '#7a4a22'); P.px(mx - 3, my - 1, '#d0a070'); },
  slate: (P, x, y, tl, G, hands) => { const mx = Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), my = Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2); P.rect(mx - 2, my - 1, 4, 3, '#3a4448'); P.rect(mx - 2, my - 1, 4, 1, '#8a6a4a'); P.px(mx - 1 + (tl.ph || 0), my, '#e8e8e0'); },
  kflute: (P, x, y) => { P.rect(x - 2, y, 4, 1, '#c8a060'); P.px(x - 1, y, '#5a3a1a'); P.px(x + 1, y, '#5a3a1a'); },
  kshield: (P, x, y, tl, G, hands) => { const mx = Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), my = Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2); P.rect(mx - 2, my - 2, 4, 5, '#b0282a'); P.rect(mx - 2, my - 2, 4, 1, '#c8ccd4'); P.px(mx - 1, my, '#e8c040'); P.px(mx, my, '#e8c040'); P.px(mx - 1, my + 2, '#8a1a1a'); P.px(mx, my + 3, '#b0282a'); },
  bigpack: (P, x, y, tl, G) => { const bx = G.S ? 11 : 3; P.rect(bx, (G.nk || 11) - 1, G.S ? 4 : 10, 6, '#a88a5a'); P.rect(bx, (G.nk || 11) - 1, G.S ? 4 : 10, 1, '#c8a878'); P.px(bx + 1, (G.nk || 11) + 2, '#6a5030'); },
  brushk: (P, x, y) => { P.rect(x - 1, y - 1, 3, 1, '#8a6a4a'); P.rect(x - 1, y, 3, 1, '#e8d8a0'); },
  wetrag: (P, x, y) => { P.rect(x - 1, y, 3, 1, '#e8f0f8'); P.px(x, y + 1, '#c8d8e8'); },
  dice2: (P, x, y) => { P.px(x, y + 1, '#f4f0e0'); P.px(x + 1, y + 1, '#e8e0d0'); },
  kbowl: (P, x, y) => { P.rect(x - 1, y, 3, 1, '#8a5a3a'); P.px(x, y - 1, '#c8b890'); },
});

// ================================================================ 地面の小道具（anim_acts.js の PROPS に足す）
// c：{ S 横向きか, sx0 横向きの胴の左, FEET 足元 }。横向きは体の前（左）、正面は体の右わき
const px0 = (c, w) => (c.S ? c.sx0 - w - 1 : 13);
Object.assign(PROPS, {
  // 木：幹と枝葉。子は幹にしがみつく
  ktree(P, G, ph, c) {
    const x = c.S ? c.sx0 - 3 : 12, top = Math.max(-6, (G.t ?? 4) - 8);
    P.rect(x, top + 4, 3, c.FEET - top - 3, '#7a5230'); P.rect(x, top + 4, 1, c.FEET - top - 3, '#5a3a20');
    for (let i = -4; i <= 6; i++) for (let j = 0; j < 5; j++) if (Math.abs(i - 1) + j * 1.2 < 6.5) P.px(x + i, top + j, (i + j + ph) % 3 ? '#4a8a3a' : '#6aaa4a');
  },
  // 子犬（しっぽが揺れる）
  pup(P, G, ph, c) {
    const x = px0(c, 5), y = c.FEET - 3;
    P.rect(x, y, 4, 2, '#c89a60'); P.rect(x - 1, y - 2, 2, 2, '#c89a60'); P.px(x - 1, y - 2, '#8a6a40'); P.px(x - 1, y - 1, '#2a1a10');
    P.px(x, y + 2, '#8a6a40'); P.px(x + 3, y + 2, '#8a6a40'); P.px(x + 4, y - (ph ? 1 : 0), '#c89a60');
  },
  // 子ヤギ（乳しぼり）
  kgoat(P, G, ph, c) {
    const x = px0(c, 7), y = c.FEET - 5;
    P.rect(x, y, 6, 3, '#f0ece0'); P.rect(x - 2, y - 2, 3, 3, '#f0ece0'); P.px(x - 2, y - 3, '#a89878'); P.px(x - 2, y - 1, '#2a2a2a');
    for (const lx of [x, x + 5]) P.rect(lx, y + 3, 1, 2, '#c8c0b0');
    P.px(x + 3, y + 3, ph ? '#f0b0b0' : '#e8a0a0');
  },
  // ポニー（乗馬・馬屋）
  pony(P, G, ph, c) {
    const S = c.S, y = c.FEET - 7;
    if (S) { const x = c.sx0 - 9; P.rect(x, y, 12, 4, '#8a5a32'); P.rect(x - 3, y - 4, 4, 5, '#8a5a32'); P.px(x - 3, y - 4, '#5a3a1a'); P.px(x - 2, y - 2, '#1a1a1a'); for (const lx of [x + 1, x + 10]) P.rect(lx, y + 4, 2, 3 - (ph && lx > x ? 1 : 0), '#6a4222'); P.rect(x + 1, y - 1, 9, 1, '#5a3a1a'); }
    else { const b = c.FEET - 4; P.rect(3, b, 10, 2, '#8a5a32'); P.rect(3, b, 10, 1, '#a0703a'); for (const lx of [4, 11]) P.rect(lx, b + 2, 1, 3, '#6a4222'); P.rect(7, b + 1, 2, 3, '#8a5a32'); P.px(7, b + 2, '#1a1a1a'); P.px(8, b + 2, '#1a1a1a'); P.px(7, b + 4, '#5a3a1a'); }
  },
  // ふいごと炉の火
  kbellows(P, G, ph, c) {
    const x = px0(c, 6), y = c.FEET - 3;
    P.rect(x, y, 5, 3, '#6a4a2a'); P.rect(x, y - (ph ? 0 : 1), 5, 1, '#8a6a4a'); P.px(x + 5, y + 1, '#3a3a3a');
    P.rect(x + 6, y - 1, 3, 4, '#5a5a62'); P.px(x + 7, y - 2, ph ? '#ffd040' : '#ff8030'); P.px(x + 6, y - 2, '#ff6020');
  },
  // 樽（かくれんぼ・見張りの物陰）
  kcrate(P, G, ph, c) {
    const S = c.S, top = (G.torsoBot ?? 16) - 2;
    const x0 = S ? c.sx0 - 3 : 3, w = S ? 8 : 10;
    P.rect(x0, top, w, c.FEET - top + 1, '#8a6a42'); P.rect(x0, top, w, 1, '#a8885a'); P.rect(x0, top + 3, w, 1, '#5a4a3a'); P.rect(x0, c.FEET - 1, w, 1, '#5a4a3a');
  },
  // 焚き火（昔語り）
  campfire(P, G, ph, c) {
    const x = c.S ? c.sx0 - 6 : 6, y = c.FEET - 1;
    P.rect(x, y, 4, 1, '#6a4a2a'); P.px(x + 1, y - 1, '#ff8030'); P.px(x + 2, y - 1, '#ffd040'); P.px(x + 1 + ph, y - 2, '#ffe070'); P.px(x + 2 - ph, y - 3, '#ffb040');
  },
  // 地面の絵（棒で描いた線）
  scribble(P, G, ph, c) {
    const x = c.S ? c.sx0 - 8 : 2, y = c.FEET;
    const pts = [[0, 0], [1, -1], [2, -1], [3, 0], [4, 0], [5, -1], [2, 0], [6, 0]];
    pts.slice(0, 5 + ph * 3).forEach(([i, j]) => P.px(x + i, y + j, '#6a5236'));
  },
  // 氷の張った地面
  kice(P, G, ph, c) { for (let i = -2; i < 16; i++) P.px(i, c.FEET + 1, (i + ph) % 4 ? '#c8e0f0' : '#ffffff'); },
  // 水面（川遊び：足もとが水に隠れる）
  kwater(P, G, ph, c) { for (let i = -1; i < 17; i++) { P.px(i, c.FEET - 2, (i + ph) % 3 ? '#6ab0e0' : '#bfe8ff'); P.rect(i, c.FEET - 1, 1, 2, '#4a90c8'); } },
  // 鐘の綱
  bellrope(P, G, ph, c) { const x = c.S ? c.sx0 - 2 : 8; for (let y = -8; y < (G.torsoBot ?? 16) - 2 + ph; y++) P.px(x, y, '#c8a878'); },
});

// ================================================================ 効果（anim_acts.js の FX に足す）
Object.assign(FX, {
  // 飛んでいく小石・雪玉
  stone({ dot, x, y, ex, fs, sg }) { const d = fs * sg, c = ex?.c || '#a8a49c'; const k = ex?.k || 3; dot(x + k * d, y - 1, c, true); dot(x + (k + 1) * d, y - 1, c, true); if (k > 2) dot(x + (k - 2) * d, y, '#e8e8e8'); },
  // 虫取り網の輪と、逃げる虫
  bugnet({ dot, x, y, ex }) { for (const [i, j] of [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-1, 1], [0, 1], [1, 1]]) dot(x + i, y + j, '#f0f0e8', true); if (ex?.bug) { dot(x + 3, y - 3, '#e8c040', true); dot(x + 4, y - 4, '#40a040', true); } },
  // 水しぶき
  splash({ dot, x, y, ex }) { const ph = ex?.ph || 0; for (const [i, j] of [[-3, -1], [-2, -3], [0, -4], [2, -3], [3, -1]]) dot(x + i, y + j - ph, (i + ph) & 1 ? '#bfe8ff' : '#e8f8ff', true); },
  // 氷の光
  glint({ dot, x, y }) { dot(x, y, '#ffffff', true); dot(x - 1, y, '#e0f4ff'); dot(x + 1, y, '#e0f4ff'); dot(x, y - 1, '#e0f4ff'); },
  // 葉のゆれ
  leaf({ dot, x, y, ex }) { const ph = ex?.ph || 0; dot(x + 2 + ph, y - 2, '#6aaa4a', true); dot(x - 2, y - 1 + ph, '#4a8a3a', true); },
  // すす（黒い粉）
  soot({ dot, x, y, ex }) { const ph = ex?.ph || 0; for (const [i, j] of [[-2, -1], [1, -2], [2, 1], [-1, 2]]) dot(x + i, y + j - ph, '#3a3a3a', true); },
  // 蜂
  bees({ dot, x, y, ex }) { const ph = ex?.ph || 0; for (const [i, j] of [[3, -2], [-3, -3], [4, 1]]) { dot(x + i + ph, y + j, '#e8c040', true); dot(x + i + ph + 1, y + j, '#2a2a2a', true); } },
  // 鐘の音の輪
  bellring({ dot, x, y, ex }) { const r = 3 + (ex?.ph || 0); for (let i = 0; i < 10; i++) { const a = Math.PI * (1.1 + i * 0.08); dot(x + Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r * 0.6), '#fff4b0', true); dot(x - Math.round(Math.cos(a) * r), y + Math.round(Math.sin(a) * r * 0.6), '#fff4b0', true); } },
  // 小さな火（魔法の手ほどき）
  flame({ dot, x, y, ex }) { const ph = ex?.ph || 0; dot(x, y - 1, '#ffd040', true); dot(x, y - 2 - ph, '#ff8030', true); dot(x - 1 + ph, y - 2, '#ffb040', true); dot(x, y - 3, ph ? '#fff4c0' : '#ffe070', true); },
  // 「！」
  bang({ dot, x, y }) { for (let j = 0; j < 3; j++) dot(x, y - j - 2, '#ff4040', true); dot(x, y, '#ff4040', true); },
  // 星
  twinkle({ dot, x, y, ex }) { const ph = ex?.ph || 0; for (const [i, j] of [[-4, -3], [3, -5], [6, -1]]) { dot(x + i, y + j, ph ? '#ffffff' : '#fff4b0', true); } },
});

// ================================================================ 動き
const ST = (a, o) => TL('staffplain', a, { s: 0.62, ...o });   // 棒きれ
const M = {
  // 棒を振り下ろす（チャンバラ）
  kid_swing: hands4((v, k) => [
    { legs: 'wide', T: A(170, 185), O: A(30, 60), tools: ST(195), face: { m: 's' } },
    { legs: 'wide', T: A(130, 120), O: A(30, 60), tools: ST(140) },
    { legs: 'wide', lean: v === 'S' ? 1 : 0, dy: 1, T: A(70, 50), O: A(20, 30), tools: ST(50), face: { m: 'O' }, fx: [['dots', 'tip', 0, -1, ['#e8d8a0', '#c8b890']]] },
    { legs: 'wide', T: A(90, 100), O: A(30, 50), tools: ST(100) },
  ][k], [240, 110, 220, 200]),
  // 打ち合う：受ける・打つを交互に。棒が当たると小さな光
  kid_duel: hands4((v, k) => [
    { legs: 'wide', T: A(120, 150), O: A(40, 70), tools: ST(160), face: { m: 's' } },
    { legs: 'wide', jump: 1, T: A(95, 80), O: A(40, 60), tools: ST(85), fx: [['spark', 'tip', 0, 0, '#fff4c0']], face: { m: 'O' } },
    { legs: 'w0', T: A(140, 175), O: A(60, 90), tools: ST(200) },
    { legs: 'wide', dy: 1, T: A(60, 40), O: A(30, 40), tools: ST(40), fx: [['spark', 'tip', 0, 0, '#fff4c0']] },
  ][k], [200, 160, 200, 160]),
  // 投げる（石・雪玉・投げ槍）
  kid_throw: hands4((v, k) => [
    { legs: 'wide', lean: v === 'S' ? -1 : 0, T: A(175, 210), O: A(80, 90), tools: TL('pebble', 0), face: { e: 'c' } },
    { legs: 'wide', lean: v === 'S' ? 1 : 0, T: A(120, 100), O: A(40, 20), fx: [['stone', 'T', 0, 0, { k: 2 }]], face: { m: 'O' } },
    { legs: 'w0', lean: v === 'S' ? 1 : 0, T: A(60, 40), O: A(20, 10), fx: [['stone', 'T', 0, -1, { k: 6 }]], face: { m: 's' } },
  ][k], [320, 120, 360]),
  // 木にしがみつく・登る
  kid_climb: hands4((v, k) => [
    { legs: 'w0', jump: 3, T: A(175, 180), O: A(160, 170), prop: 'ktree', ph: 0, fx: [['leaf', 'head', 0, -3, { ph: 0 }]] },
    { legs: 'w2', jump: 5, T: A(165, 175), O: A(175, 180), prop: 'ktree', ph: 1, face: { m: 's' } },
    { legs: 'sit', jump: 7, T: A(120, 150), O: A(40, 30), prop: 'ktree', ph: 0, face: { m: 'O' }, fx: [['leaf', 'head', 0, -2, { ph: 1 }]] },
  ][k], [420, 420, 900]),
  // 川で水をかけ合う
  kid_splash: hands4((v, k) => [
    { legs: 'stand', dy: 2, T: A(40, 70), O: A(40, 70), prop: 'kwater', ph: 0, face: { m: 's' } },
    { legs: 'stand', dy: 2, jump: 1, T: A(130, 160), O: A(120, 150), prop: 'kwater', ph: 1, face: { e: 'c', m: 'O' }, fx: [['splash', 'T', 0, 0, { ph: 0 }]] },
  ][k], [260, 300]),
  // 氷の上をすべる
  kid_slide: hands4((v, k) => [
    { legs: 'wide', lean: v === 'S' ? 2 : 0, T: A(90, 100), O: A(90, 80), prop: 'kice', ph: 0, face: { m: 'O' }, fx: [['glint', 'fwdfeet', 0, 0]] },
    { legs: 'wide', lean: v === 'S' ? 2 : 0, dy: 1, T: A(100, 120), O: A(80, 70), prop: 'kice', ph: 1, face: { m: 's' } },
  ][k], [360, 360]),
  // 虫取り網を振る
  kid_net: hands4((v, k) => [
    { T: A(160, 175), O: A(30, 40), tools: TL('rod', 190, { s: 0.55 }), fx: [['bugnet', 'tip', 0, 0]] },
    { lean: v === 'S' ? 1 : 0, T: A(100, 80), O: A(30, 40), tools: TL('rod', 90, { s: 0.55 }), fx: [['bugnet', 'tip', 0, 0, { bug: true }]], face: { m: 'O' } },
    { legs: 'squat', T: A(60, 40), O: AT('low'), tools: TL('rod', 40, { s: 0.55 }), fx: [['bugnet', 'tip', 0, 0]], face: { m: 's' } },
  ][k], [320, 200, 520]),
  // しゃがんで拾う・摘む
  kid_pick: hands4((v, k) => ({ legs: 'squat', lean: 1, T: AT('low', k & 1, -1 + (k & 1)), O: AT('belly'), tools: TL('basket', 0, { h: 'O' }), face: k === 2 ? { m: 's' } : null })),
  // 泥だんごをこねる
  kid_mud: hands4((v, k) => ({ legs: 'squat', T: AT('low', 0, k & 1 ? -1 : 0), O: AT('low', 1, k & 1 ? 0 : -1), tools: TL('mudball', 0, { ph: k & 1 }), face: k === 3 ? { m: 's' } : null })),
  // 取っ組み合い・相撲
  kid_wrestle: hands4((v, k) => [
    { legs: 'wide', lean: v === 'S' ? 2 : 1, T: A(95, 100), O: A(85, 90), face: { m: 'f' } },
    { legs: 'wide', lean: v === 'S' ? 2 : 1, dy: 1, T: A(105, 120), O: A(90, 110), face: { e: 'c', m: 'O' }, fx: [['puff', 'feet', -3, 0, '#c8b898']] },
    { legs: 'w0', lean: v === 'S' ? 1 : 0, T: A(90, 80), O: A(95, 90), face: { m: 'f' } },
    { legs: 'wide', lean: v === 'S' ? 2 : 1, dy: 1, T: A(100, 110), O: A(95, 100), fx: [['puff', 'feet', 3, 0, '#c8b898'], ['sweat', 'head']] },
  ][k], [260, 200, 260, 200]),
  // 棒を旗にして号令
  kid_lead: hands4((v, k) => [
    { T: A(175, 180), O: AT('hip'), tools: ST(180), face: { m: 'O' }, fx: [['shout', 'face', 1, 0]] },
    { jump: 1, T: A(150, 130), O: AT('hip'), tools: ST(150), face: { m: 's' } },
    { T: A(175, 180), O: A(60, 90), tools: ST(185), face: { m: 'O' }, fx: [['shout', 'face', 1, 0]] },
    { T: A(120, 110), O: AT('hip'), tools: ST(120) },
  ][k], [300, 260, 300, 260]),
  // ままごと（座って器を並べる）
  kid_house: hands4((v, k) => ({ legs: 'sit', T: AT('lap', k & 1, 0), O: AT('lap', 1, 0), tools: [TL('leafplate', 0, { h: 'O' }), TL('kidcup', 0)], face: k === 2 ? { m: 'o' } : { m: 's' } }), [500, 400, 500, 400]),
  // 身ぶり・物まね
  kid_act: hands4((v, k) => [
    { T: A(130, 170), O: A(130, 170), face: { m: 'O' } },
    { jump: 1, T: A(90, 60), O: A(20, 30), face: { e: 'c', m: 's' } },
    { lean: v === 'S' ? -1 : 0, T: AT('chest'), O: A(150, 180), face: { m: 'O' } },
    { T: A(60, 90), O: A(60, 90), headDy: 1, face: { e: 'c' } },
  ][k], [320, 280, 320, 360]),
  // 歌う（口を開けて、音符）
  kid_sing: hands4((v, k) => ({ T: AT('chest', 0, 1), O: AT('chest', 0, 1), dy: k & 1, face: { m: k & 1 ? 'O' : 'o', e: k === 2 ? 'c' : undefined }, fx: k & 1 ? [['note', 'head', 3, -2, '#3a2a6a']] : [] }), [360, 360, 360, 360]),
  // 物陰から頭だけ出す
  kid_hide: hands4((v, k) => ({ legs: 'squat', dy: k === 1 ? 3 : 1, T: AT('low'), O: AT('low', 1), prop: 'kcrate', face: k === 2 ? { e: 'c' } : { m: 's' } }), [500, 700, 300, 500]),
  // のぞく・探検（手をかざして遠くを見る）
  kid_peek: hands4((v, k) => ({ legs: k === 2 ? 'squat' : 'stand', lean: 1, O: AT('brow', 0, 0, { late: true }), T: k === 2 ? AT('low') : A(30, 50), face: k === 1 ? { m: 'O' } : null, fx: k === 1 ? [['bang', 'head', 2, -1]] : [] }), [500, 300, 500, 400]),
  // 寝ころんで星を見る
  kid_gaze: { durs: [900, 700], pose: (v, k) => ({ lie: true, face: { m: 's' }, fx: [['twinkle', 'head', 0, -2, { ph: k }]] }) },
  // 動物をなでる
  kid_pet: hands4((v, k) => ({ legs: 'squat', T: k & 1 ? A(80, 100) : A(70, 60), O: AT('low', 1), prop: 'pup', ph: k & 1, face: { m: 's', e: k === 3 ? 'c' : undefined }, fx: k === 1 ? [['heart', 'head', 3, -2]] : [] })),
  // 棒で地面に描く
  kid_draw: hands4((v, k) => ({ legs: 'squat', lean: 1, T: A(40 + (k & 1) * 15, 20), O: AT('low', 1), tools: ST(20 + (k & 1) * 10, { s: 0.45 }), prop: 'scribble', ph: k > 1 ? 1 : 0 })),
  // 座って木を削る
  kid_whittle: hands4((v, k) => ({ legs: 'sit', headDy: 1, T: AT('lap', k & 1 ? 1 : 0, -1), O: AT('lap', 1, 0), tools: [TL('woodpiece', 0, { h: 'O', ph: k & 1 }), TL('knife', 0)], fx: k & 1 ? [['dots', 'O', 0, 1, ['#e8c890', '#d8b070']]] : [] })),
  // 乳しぼり
  kid_milk: hands4((v, k) => ({ legs: 'squat', T: AT('low', 0, k & 1), O: AT('low', 1, (k + 1) & 1), prop: 'kgoat', ph: k & 1, tools: TL('pail', 0, { h: 'O' }), fx: k & 1 ? [['drops', 'T', 0, 1, { ph: 0 }]] : [] })),
  // 網をつくろう
  kid_mend: hands4((v, k) => ({ legs: 'sit', headDy: 1, T: AT('lap', 0, k & 1 ? -1 : 0), O: AT('lap', 1, 0), tools: TL('net', 0, { h: 'O' }) })),
  // ふいごを押す
  kid_bellows: hands4((v, k) => [
    { legs: 'wide', lean: 1, T: AT('belly', 1, -1), O: AT('belly', 0, -1), prop: 'kbellows', ph: 0 },
    { legs: 'wide', lean: 2, dy: 1, T: AT('low', 1, 0), O: AT('low', 0, 0), prop: 'kbellows', ph: 1, fx: [['spark', 'fwdfeet', 3, -4, '#ffd040']], face: { e: 'c' } },
    { legs: 'wide', lean: 1, T: AT('belly', 1, -1), O: AT('belly', 0, -1), prop: 'kbellows', ph: 0, fx: [['sweat', 'head']] },
    { legs: 'wide', lean: 2, dy: 1, T: AT('low', 1, 0), O: AT('low', 0, 0), prop: 'kbellows', ph: 1, fx: [['spark', 'fwdfeet', 2, -5, '#ff8030']] },
  ][k], [300, 240, 300, 240]),
  // 赤ん坊を抱いてあやす
  kid_babysit: hands4((v, k) => ({ lean: v === 'S' ? (k & 1 ? 1 : -1) : 0, dy: k & 1, T: AT('chest', 0, 1), O: AT('chest', 1, 1), tools: TL('baby', 0), face: { m: k === 2 ? 'o' : 's' }, fx: k === 1 ? [['note', 'head', 3, -2, '#6a4a8a']] : [] }), [420, 420, 420, 420]),
  // 薪（荷）を運ぶ
  kid_carry: hands4((v, k) => ({ legs: k & 1 ? 'w0' : 'w2', dy: k & 1, T: AT('belly', 0, 1), O: AT('belly', 1, 1), tools: TL('firewood', 0), fx: k === 3 ? [['sweat', 'head']] : [] }), [260, 260, 260, 260]),
  // 枕元で看病する
  kid_nurse: hands4((v, k) => ({ legs: 'kneel2', lean: 1, headDy: 1, T: k & 1 ? AT('fwd', 1, 1) : AT('chest'), O: AT('lap'), tools: TL('wetrag', 0), face: { e: k === 3 ? 'c' : undefined } }), [600, 500, 600, 700]),
  // 煙でいぶす（養蜂）
  kid_bee: hands4((v, k) => ({ lean: v === 'S' ? 1 : 0, T: A(80 + (k & 1) * 10, 70), O: AT('belly'), tools: TL('smoker', 0), fx: [['puff', 'T', 1, -2, '#d8d8dc'], ['bees', 'head', 0, 0, { ph: k & 1 }]], face: { m: k === 2 ? 'O' : 'f' } }), [360, 360, 360, 360]),
  // 馬にブラシ
  kid_stable: hands4((v, k) => ({ T: A(100 + (k & 1) * 20, 100), O: AT('belly'), tools: TL('brushk', 0), prop: 'pony', ph: k & 1, face: { m: 's' } }), [320, 320, 320, 320]),
  // 煙突掃除：すすだらけでほうきを突き上げる
  kid_chimney: hands4((v, k) => ({ gray: 0.12, T: A(165 - (k & 1) * 25, 175), O: TO2(), tools: TL('broom', 180 - (k & 1) * 20, { s: 0.7 }), fx: [['soot', 'tip', 0, 0, { ph: k & 1 }]], face: { m: k === 2 ? 'O' : 'f' } }), [300, 300, 300, 300]),
  // 鐘の綱を引く
  kid_bell: hands4((v, k) => [
    { T: A(175, 180), O: A(170, 180), prop: 'bellrope', ph: 0 },
    { dy: 2, T: A(130, 150), O: A(125, 145), prop: 'bellrope', ph: 1, fx: [['bellring', 'head', 0, -6, { ph: 0 }]], face: { e: 'c' } },
    { jump: 1, T: A(175, 180), O: A(170, 180), prop: 'bellrope', ph: 0, fx: [['bellring', 'head', 0, -7, { ph: 1 }]] },
    { dy: 2, T: A(130, 150), O: A(125, 145), prop: 'bellrope', ph: 1, face: { m: 's' } },
  ][k], [400, 300, 400, 300]),
  // お辞儀（行儀作法・給仕の礼）
  kid_bow: hands4((v, k) => [
    { T: AT('belly'), O: AT('belly', 1) },
    { lean: v === 'S' ? 2 : 0, headDy: 2, dy: 1, T: AT('belly'), O: A(10), face: { e: 'c' } },
    { lean: v === 'S' ? 2 : 0, headDy: 2, dy: 1, T: AT('belly'), O: A(10), face: { e: 'c' } },
    { T: AT('belly'), O: AT('belly', 1), face: { m: 's' } },
  ][k], [500, 300, 700, 600]),
  // 小姓：騎士の盾を抱える
  kid_pageboy: hands4((v, k) => ({ dy: k & 1, T: AT('chest', 0, 1), O: AT('chest', 1, 1), tools: TL('kshield', 0), face: k === 3 ? { m: 's' } : null }), [500, 400, 500, 400]),
  // 指先に小さな火をともす
  kid_spell: hands4((v, k) => ({ T: A(95, 100), O: AT('chest'), face: { e: k === 0 ? 'c' : undefined, m: k === 2 ? 'O' : 's' }, fx: k ? [['flame', 'T', 0, -1, { ph: k & 1 }]] : [['glow', 'T', 0, 0, '#ffe8a0']] }), [500, 300, 400, 300]),
  // ポニーに乗る
  kid_ride: hands4((v, k) => ({ legs: 'sit', jump: 5 + (k & 1), T: A(70, 90), O: A(70, 90), prop: 'pony', ph: k & 1, face: { m: k === 2 ? 'O' : 's' } }), [260, 260, 260, 260]),
  // 笛を吹く
  kid_flute: hands4((v, k) => ({ T: AT('mouth', 1, 0, { late: true }), O: AT('mouth', 0, 0, { late: true }), tools: TL('kflute', 0), dy: k & 1, face: { e: 'c' }, fx: k & 1 ? [['note', 'head', 3, -2, '#2a4a6a']] : [] }), [400, 400, 400, 400]),
  // 帳面をつける（見習い・塾）
  kid_ledger: hands4((v, k) => ({ headDy: 1, T: AT('chest', k & 1, 1), O: AT('chest', 0, 1), tools: TL('openbook', 0, { ph: k === 3 ? 1 : 0 }) }), [500, 400, 500, 700]),
  // 焚き火の前で座って聞く（うなずき）
  kid_listen: hands4((v, k) => ({ legs: 'sit', headDy: k === 1 ? 1 : 0, T: AT('lap'), O: AT('lap', 1), prop: 'campfire', ph: k & 1, face: k === 3 ? { m: 'O' } : null }), [700, 400, 700, 500]),
  // さっと手を伸ばす（「！」）
  kid_filch: hands4((v, k) => [
    { lean: v === 'S' ? 1 : 0, T: AT('belly'), O: AT('hip'), face: { e: 'c' } },
    { lean: v === 'S' ? 2 : 0, T: A(95, 90), O: AT('hip'), fx: [['bang', 'head', 0, -1]], face: { m: 'O' } },
    { lean: v === 'S' ? -1 : 0, T: AT('chest'), O: AT('hip'), tools: TL('bread', 0) },
  ][k], [500, 160, 400]),
  // さいころ
  kid_dice: hands4((v, k) => ({ legs: 'squat', T: k === 1 ? A(70, 50) : AT('low'), O: AT('lap'), tools: k === 1 ? [] : TL('dice2', 0), face: { m: k === 2 ? 'O' : 's' }, fx: k === 2 ? [['dots', 'fwdfeet', 0, -1, ['#f4f0e0', '#e8e0d0']]] : [] }), [400, 200, 400, 500]),
  // 大きな荷を背負う（荷物持ち・商隊）
  kid_haulpack: hands4((v, k) => ({ lean: 1, dy: k & 1, T: AT('chest', 0, 0), O: AT('chest', 1, 0), tools: TL('bigpack', 0), fx: k === 3 ? [['sweat', 'head']] : [] }), [300, 300, 300, 300]),
  // 石板に字を書く（手習い）
  kid_read: hands4((v, k) => ({ legs: 'sit', headDy: 1, T: AT('lap', k & 1, -1), O: AT('lap', 1, 0), tools: TL('slate', 0, { ph: k & 1 }), face: k === 3 ? { m: 's' } : null }), [500, 400, 500, 600]),
};
function TO2() { return POSE_KIT.TO(-2); }
addWorkMotions(M);
export const KID_MOTIONS = Object.keys(M);

// ================================================================ 行動 → 動き
const MIMIC_OK = (m) => m && !['train', 'shoot', 'guard', 'cast', 'orb', 'rule'].includes(m);
function parentMotion(sim, p) {
  for (const id of [p.fatherId, p.motherId]) { const q = sim?.S?.people?.[id]; const m = q && JOB_MOTION[q.job]; if (MIMIC_OK(m)) return 'work:' + m; }
  return 'work:handwork';
}
export function kidAnim(sim, p, a) {
  const K = KACT[a.k];
  if (!K) return null;
  const t = sim?.S?.t ?? 0;
  const list = K.an;
  let name = list.length > 1 ? list[Math.floor(lot(p, t, 24, a.k.length) * list.length) % list.length] : list[0];
  if (name === 'kid_mimic') {
    if (a.k === 'indenture') { const m = sim.S.people[p.kid?.lessons?.indenture?.m]; const mm = m && JOB_MOTION[m.job]; return MIMIC_OK(mm) ? 'work:' + mm : 'work:handwork'; }
    return parentMotion(sim, p);
  }
  if (name === 'kid_toil') { const e = sim.S.people[p.kid?.lessons?.toil?.e]; const mm = e && JOB_MOTION[e.job]; return MIMIC_OK(mm) ? 'work:' + mm : 'work:lift'; }
  if (name === 'kid_run') return 'play';
  if (name === 'kid_sweep') return 'work:sweep';
  if (['play', 'pray', 'beg', 'sit', 'cheer', 'wave'].includes(name)) return name;
  return name.startsWith('work:') ? name : 'work:' + name;
}
// 歩いている子：鬼ごっこなどで走り回っているときは、はしゃぐ動き
ANIM_STATE_HOOKS.push((sim, p, moving) => {
  const a = p.action;
  if (!moving || !a || a.type !== 'kid' || !a.wander || p.fight) return null;
  return 'play';
});
addAnimStateHook((sim, p, a) => (a && a.type === 'kid' ? kidAnim(sim, p, a) : null));
