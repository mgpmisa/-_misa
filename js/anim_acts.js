// 暮らしと仕事の動き（ドット絵）― グラフィック部（人の担当）
//
// 社長の指示「この世界の全ての行動には全てグラフィックを用意する。人物動作はドット絵、それ以外は3D」に合わせ、
// これまで「立つだけ」だった行動と、動きの決まっていなかった職業に、固有の動きを足す。
// 形の書き方は js/anim_people.js と同じ（姿勢 → 4方向×コマ）。道具・小物・地面の小道具・効果も、ここで足す。
//
//   畑   sow 種まき（季節：春）／weed 草取り・苗植え（夏）／water 水やり（夏）／reap 鎌で刈る（秋）
//   家畜 feed 餌をまく（牧場・羊飼い・馬番）
//   手仕事 spin 糸を紡ぐ（紡錘）／weave 機を織る（機）／wicker かごを編む／twist 縄をなう
//   売り買い handover 品を渡して代金を受け取る／buy 代金を払って品を受け取る／hawk 呼び込み
//   しぐさ laugh 笑う／nod 相づち／stretch 伸びをする／search 地面を調べる（冒険・足跡を追う）
//          offer 献金・施し／whisper 耳打ち（裏の取り引き）／meditate 瞑想／cheerup 子をあやす
//   力仕事 tamp 道を突き固める／draw 水を汲む（川辺・水場）／hang 洗濯物を干す／net 投網を打つ／pluck 木の実を摘む
//
// ■ 本体からの呼び方（anim_people.js に数行。scratchpad/acts/apply.py）
//   import * as AX from './anim_acts.js';
//   AX.installActs({ WORK, LIFE, TOOL, OBJ, A, AT, TL, TO, MO, hands4, swing, GOLD, dk, lt, JOB_MOTION })  … 動きと道具の登録
//   drawProp の頭：if (AX.PROPS[kind]) { AX.PROPS[kind](P, G, ph, {...}); return; }                         … 地面の小道具
//   drawTool の頭：if (AX.HEADS[T.head]) return AX.HEADS[T.head](put, at, len, E, {...});                  … 道具の先
//   drawFx  の頭：if (AX.FX[kind]) { AX.FX[kind](...); continue; }                                        … 効果
//   personAnimState：{ const ax = AX.actAnimState(sim, p, a, age, kid); if (ax) return ax; }               … 行動 → 動き
//
// 娯楽（湯・芝居・歌・踊り・賭け事）と裁き・処刑は、ほかの社員の持ち場なので、ここでは何も返さない（LEAVE）。

// 行動の種類のうち、ほかの社員（娯楽・裁き・造幣・両替・職場の蔵・建築）が動きを決めるもの
const LEAVE = new Set(['bathe', 'show', 'watchplay', 'perform', 'act', 'tavern', 'festival', 'ldance', 'ltryst', 'wedding', 'funeral',
  'trial', 'execution', 'pillory', 'scaffold', 'escort', 'mint', 'exchange', 'changer', 'build', 'construct', 'restock', 'shelve']);

// 整数のハッシュ（0..1）。同じ人・同じ時間帯なら同じ値
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
// 30分ごとに変わる、その人のくじ
const lot = (p, t, span = 30, salt = 0) => hash((p.id | 0) * 7919 + Math.floor(t / span) * 131 + salt);

// ================================================================ 道具（手から伸びる物）
export const TOOLS = {
  sickle: { len: 2, back: 0, head: 'sickle' },          // 鎌（短い柄と、弧を描く刃）
  tamper: { len: 7, back: 3, head: 'tamp' },            // 突き棒（道を固める）
  spindle: { len: 4, back: 0, head: 'whorl', shaft: '#c8b890' }, // 紡錘（糸の先に錘）
};
// 道具の先の描き方：(put, at, len, E, c) → 先の位置
export const HEADS = {
  sickle(put, at, len, E) {
    const s = '#dce0e8', d = '#9aa0aa';
    put(at(len + 1), s); put(at(len + 2, 1), s); put(at(len + 2, 2), s); put(at(len + 1, 3), d); put(at(len, 3), '#f0f2f6');
    return at(len + 2, 2);
  },
  tamp(put, at, len) {
    for (let w = -1; w <= 1; w++) { put(at(len, w), '#6a5a48'); put(at(len + 1, w), '#4a3e30'); }
    return at(len + 1);
  },
  whorl(put, at, len) {
    put(at(len + 1), '#8a5a2a'); put(at(len + 1, 1), '#8a5a2a'); put(at(len + 1, -1), '#8a5a2a'); put(at(len + 2), '#c8b890');
    return at(len + 2);
  },
};

// ================================================================ 手に持つ小物（向きのない物）
function makeObjs(K) {
  const { dk } = K;
  const mid2 = (hands) => [Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2)];
  return {
    // 種袋（腰に下げた麻袋、口から麦が見える）
    seedbag: (P, x, y) => { P.rect(x - 1, y - 1, 3, 3, '#c8b890'); P.rect(x - 1, y - 1, 3, 1, '#a89870'); P.px(x, y - 2, '#e8d8a0'); P.px(x + 1, y + 1, '#a89870'); },
    // 刈った麦の束（穂が上）
    sheaf: (P, x, y) => { P.rect(x - 1, y - 3, 3, 2, '#e8c860'); P.px(x, y - 4, '#f0d880'); P.rect(x, y - 1, 1, 3, '#c8a040'); P.px(x - 1, y, '#a88830'); },
    // 羊毛のかたまり（紡ぐ前）
    fleece: (P, x, y) => { P.rect(x - 1, y - 2, 3, 3, '#f4f0e8'); P.px(x - 1, y - 2, '#e0dcd0'); P.px(x + 1, y, '#e0dcd0'); },
    // 紡錘（糸が垂れて、下で錘が回る）。tl.ph で錘の明るい面が回る
    spin: (P, x, y, tl) => { P.line(x, y + 1, x, y + 5, '#f0ece0'); P.rect(x - 1, y + 6, 3, 1, tl.ph ? '#a86a3a' : '#8a5a2a'); P.px(tl.ph ? x + 1 : x - 1, y + 6, '#c88a5a'); P.px(x, y + 7, '#c8b890'); P.px(x, y + 5, '#c8b890'); },
    // 編みかけのかご（ひざの上）
    wicker: (P, x, y, tl, G, hands) => { const [mx, my] = mid2(hands); P.rect(mx - 2, my, 5, 2, '#c8a060'); P.px(mx - 2, my, '#a88040'); P.px(mx, my, '#a88040'); P.px(mx + 2, my, '#a88040'); P.px(mx - 1 + (tl.ph || 0), my - 1, '#d8b878'); },
    // 投網（たたんだ網）
    net: (P, x, y) => { P.rect(x - 1, y - 1, 3, 3, '#c8c0a8'); P.px(x, y, '#8a8470'); P.px(x - 1, y + 1, '#8a8470'); P.px(x + 1, y - 1, '#a8a088'); },
    // 洗った布（干す前、両手で広げる）
    wetcloth: (P, x, y, tl, G, hands, ex) => { const [mx, my] = mid2(hands); P.rect(mx - 2, my, 5, 3, tl.c || '#e8e8f0'); P.rect(mx - 2, my, 5, 1, dk(tl.c || '#e8e8f0', 0.08)); void ex; },
    // 手おけ（水の入った桶）
    pail: (P, x, y) => { P.rect(x - 1, y + 1, 3, 3, '#8a6a4a'); P.rect(x - 1, y + 1, 3, 1, '#6ab0e0'); P.px(x, y, '#5a5a5a'); P.px(x - 1, y + 3, '#6a4a2a'); },
    // じょうろ（手の下に胴、前へ注ぎ口。tl.ph で前へ傾ける）
    wcan: (P, x, y, tl, G) => {
      const d = G.S ? -1 : G.B ? -1 : 1, t = tl.ph ? 1 : 0;
      P.rect(x - 1, y + 1, 3, 3, '#7a9aa8'); P.rect(x - 1, y + 1, 3, 1, '#9abac8'); P.px(x, y, '#5a7a88');
      P.px(x + 2 * d, y + 2 - t, '#7a9aa8'); P.px(x + 3 * d, y + 1 - t, '#7a9aa8'); P.px(x + 4 * d, y + 1 - 2 * t + t, '#9abac8');
    },
    // 品物の包み（売り買いの受け渡し）
    parcel: (P, x, y, tl) => { const c = tl.c || '#b89060'; P.rect(x - 1, y - 1, 3, 2, c); P.px(x, y - 1, dk(c, 0.25)); P.px(x, y, dk(c, 0.25)); },
    // 木の実（摘んだところ）
    berries: (P, x, y) => { P.px(x, y - 1, '#c03040'); P.px(x + 1, y - 1, '#6a2a8a'); P.px(x, y - 2, '#4a9a3a'); },
    // 縄（なっている途中）
    cord: (P, x, y, tl, G, hands) => { const a = hands.T.hand, b = hands.O.hand; P.line(a[0], a[1], b[0], b[1], '#c8a860'); P.px(Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2) + (tl.ph ? 1 : 0), '#a88840'); },
  };
}

// ================================================================ 地面の小道具（体の前に置く物）。drawProp と同じ座標
export const PROPS = {
  // 機（はた）：2本の柱と横木、縦糸。ph で綜絖（そうこう）が上下する
  loom(P, G, ph, c) {
    const S = c.S, wd = '#8a6a4a', wdD = '#6a4a2a';
    if (S) {
      const x0 = c.sx0 - 8, top = G.nk - 1;
      P.rect(x0, top, 1, c.FEET - top + 1, wdD); P.rect(x0 + 5, top, 1, c.FEET - top + 1, wdD);
      P.rect(x0, top, 6, 1, wd); P.rect(x0, G.torsoBot, 6, 1, wd);
      for (let x = x0 + 1; x <= x0 + 4; x++) P.rect(x, top + 1, 1, G.torsoBot - top - 1, (x + ph) & 1 ? '#e8e0d0' : '#c8b8a0');
      P.rect(x0 + 1, top + 3 + ph, 4, 1, '#b07a4a');
    } else {
      const x0 = 2, x1 = 13, top = G.nk + 2, y1 = G.torsoBot + 2;
      P.rect(x0, top, 1, c.FEET - top + 1, wdD); P.rect(x1, top, 1, c.FEET - top + 1, wdD);
      P.rect(x0, top, x1 - x0 + 1, 1, wd); P.rect(x0, y1, x1 - x0 + 1, 1, wd);
      for (let x = x0 + 1; x < x1; x++) P.rect(x, top + 1, 1, y1 - top - 1, (x + ph) & 1 ? '#e8e0d0' : '#d0b890');
      P.rect(x0 + 1, y1 - 2 + ph, x1 - x0 - 1, 1, '#b07a4a');
      P.rect(x0 + 2, y1 - 1, x1 - x0 - 3, 1, '#b04a4a'); // 織り上がった布
    }
  },
  // 手おけ（地面に置いた桶）
  bucket(P, G, ph, c) {
    const bx = c.S ? c.sx0 - 6 : 9, y = c.FEET - 2;
    P.rect(bx, y, 3, 3, '#8a6a4a'); P.rect(bx, y, 3, 1, ph ? '#8ac8f0' : '#6ab0e0'); P.px(bx + 1, y + 2, '#6a4a2a');
  },
  // 露店の台（布をかけた台に、品がいくつか）
  counter(P, G, ph, c) {
    const S = c.S, y = G.torsoBot + 1;
    if (S) { const x0 = c.sx0 - 8; P.rect(x0, y, 7, 1, '#b08a5a'); P.rect(x0, y + 1, 7, c.FEET - y, '#c84a3a'); P.rect(x0, y + 2, 7, 1, '#e8d8c0'); P.px(x0 + 1, y - 1, '#e8c060'); P.px(x0 + 3, y - 1, '#6ac050'); P.px(x0 + 5, y - 1, '#c03040'); }
    else { P.rect(1, y, 14, 1, '#b08a5a'); P.rect(1, y + 1, 14, c.FEET - y, '#c84a3a'); P.rect(1, y + 2, 14, 1, '#e8d8c0'); P.px(3, y - 1, '#e8c060'); P.px(4, y - 1, '#e8c060'); P.px(7 + ph, y - 1, '#6ac050'); P.px(11, y - 1, '#c03040'); P.px(12, y - 1, '#d8a050'); }
  },
  // 献金箱（施し箱）
  almsbox(P, G, ph, c) {
    const bx = c.S ? c.sx0 - 6 : 6, y = c.FEET - 4;
    P.rect(bx, y, 4, 5, '#6a4a2a'); P.rect(bx, y, 4, 1, '#8a6a4a'); P.rect(bx + 1, y, 2, 1, '#2a1a10'); P.px(bx + 1, y + 2, '#c9a23a');
  },
};

// ================================================================ 効果（輪郭の外）。生座標で描く
export const FX = {
  // 水のしずく（下へ落ちる3粒）
  drops({ dot, x, y, ex, fs, sg }) { const c = ex?.c || '#8ad0ff', ph = ex?.ph || 0; for (let j = 0; j < 3; j++) dot(x + (j & 1) * fs * sg, y + 1 + j * 2 + ph, j === 0 ? '#e0f4ff' : c); },
  // 呼び声（口元から3本の短い線）
  shout({ dot, x, y, fs, sg }) { const d = fs * sg; for (const [i, j] of [[1, -2], [2, -2], [2, 0], [3, 0], [1, 2], [2, 2]]) dot(x + i * d, y + j, '#fff4c0'); },
  // 種・餌をまく（弧を描いて散る粒）
  scatter({ dot, x, y, ex, fs, sg }) { const cs = ex?.c || ['#e8d8a0', '#c8b070']; const ph = ex?.ph || 0; const pts = [[1, 0], [2, 1], [3, 3], [2, 4], [4, 5], [1, 3]]; pts.forEach(([i, j], n) => { if ((n + ph) % 3 !== 2) dot(x + i * fs * sg, y + j, cs[n % cs.length]); }); },
  // 投網が広がる（前方に網目の弧）
  netcast({ dot, x, y, fs, sg }) { for (let i = -4; i <= 4; i++) { const px = x + (5 + Math.round(Math.abs(i) * 0.4)) * fs * sg, py = y + i; dot(px, py, (i & 1) ? '#c8c0a8' : '#8a8470'); } for (let i = 1; i <= 4; i++) dot(x + i * fs * sg, y, '#c8c0a8'); },
  // 湯気のように立つ小さな光の粒（瞑想）
  aura({ dot, x, y, ex }) { const ph = ex || 0; const c = '#fff4c0'; for (const [i, j] of [[-5, 2], [5, 0], [-4, -3], [4, -5]]) dot(x + i, y + j - ph, c); },
  // 紙吹雪のような笑いの線（頭の横に2本）
  haha({ dot, x, y, fs, sg }) { const d = fs * sg; for (const [i, j] of [[3, -1], [4, -2], [3, 1], [4, 2]]) dot(x + i * d, y + j, '#fff0a0'); },
};

// ================================================================ 動き
function makeMotions(K) {
  const { A, AT, TL, TO, MO, hands4, swing, LIFE, WORK } = K;
  const SEED = { c: ['#e8d8a0', '#c8b070'] }, FEED = { c: ['#e8c060', '#b08a40', '#f0e0a0'] };
  const M = {
    // 種まき：腰の種袋から一握り取り、腕を横へ振ってまく。脚は畝に沿って歩く
    sow: hands4((v, k) => {
      const bag = TL('seedbag', 0, { h: 'O' });
      const legs = ['w0', 'stand', 'w2', 'stand'][k];
      if (v === 'B') return { legs, O: AT('belly'), T: [A(20), A(60, 80), A(90, 110), A(40, 60)][k], tools: bag, fx: k === 2 ? [['scatter', 'T', 0, 0, { ...SEED, ph: 0 }]] : [] };
      return [
        { legs, O: AT('belly', 0, 0), T: AT('belly', 1, -1), tools: bag },
        { legs, O: AT('belly', 0, 0), T: A(60, 85), tools: bag, fx: [['scatter', 'T', 0, 0, { ...SEED, ph: 1 }]] },
        { legs, O: AT('belly', 0, 0), T: A(95, 110), tools: bag, fx: [['scatter', 'T', 0, 0, { ...SEED, ph: 0 }]], face: { m: 's' } },
        { legs, O: AT('belly', 0, 0), T: A(40, 60), tools: bag, fx: [['scatter', 'T', 0, 2, { ...SEED, ph: 2 }]] },
      ][k];
    }, [240, 180, 240, 200]),
    // 草取り・苗植え：しゃがんで、両手を交互に地面へ。抜いた草を持ち上げる
    weed: hands4((v, k) => {
      const up = k === 1 || k === 3;
      return {
        legs: 'squat', lean: 1,
        T: up ? AT('low', 0, -3) : AT('low', 1, 0),
        O: up ? AT('low', 1, 0) : AT('low', 0, -2),
        tools: up && k === 1 ? TL('herbs', 0) : [],
        fx: up ? [['dots', up && k === 1 ? 'T' : 'O', 0, 1, ['#4a9a3a', '#6ac050', '#7a5a3a']]] : [],
        dy: k === 2 ? 1 : 0,
      };
    }, [300, 260, 300, 260]),
    // 水やり：じょうろを前へ傾け、水が落ちる
    water: hands4((v, k) => {
      const tilt = k === 1 || k === 2;
      return {
        T: tilt ? A(55, 80) : A(30, 45), O: tilt ? AT('belly', 1, 0) : A(10),
        tools: TL('wcan', 0, { ph: tilt ? 1 : 0 }),
        fx: tilt && v !== 'B' ? [['drops', 'T', 4, 1, { ph: k - 1 }]] : [],
        legs: k === 3 ? 'w0' : 'stand',
      };
    }, [300, 260, 260, 300]),
    // 鎌で刈る：左手で穂をつかみ、右手の鎌で根元を払う。刈った束を持ち上げる
    reap: hands4((v, k) => {
      const straw = ['#e8c860', '#c8a040', '#f0d880'];
      if (v === 'B') return { legs: 'wide', lean: 1, dy: k & 1, T: [A(70, 110), A(30, 20), A(60, 90), A(40, 60)][k], O: A(40, 30), fx: k === 1 ? [['dots', 'T', 0, 0, straw]] : [] };
      return [
        { legs: 'wide', lean: 1, O: AT('low', 1, -3), T: A(80, 120), tools: TL('sickle', 150) },
        { legs: 'wide', lean: 1, dy: 1, O: AT('low', 1, -3), T: AT('low', 0, -1), tools: TL('sickle', 60), fx: [['dots', 'tip', 0, -1, straw]] },
        { legs: 'wide', O: AT('chest', 0, 1), T: A(50, 80), tools: [TL('sickle', 120), TL('sheaf', 0, { h: 'O' })], face: { m: 's' } },
        { legs: 'wide', lean: 1, O: AT('low', 1, -2), T: A(60, 100), tools: TL('sickle', 140) },
      ][k];
    }, [300, 180, 360, 240]),
    // 餌をまく：かごを抱えて、一つかみずつ足もとへ放る（鶏・羊）
    feed: hands4((v, k) => {
      const bk = TL('basket', 0, { h: 'O' });
      return [
        { O: AT('belly'), T: AT('belly', 1, -1), tools: bk },
        { O: AT('belly'), T: A(60, 80), tools: bk, fx: [['scatter', 'T', 0, 1, { ...FEED, ph: 0 }]] },
        { O: AT('belly'), T: A(45, 70), tools: bk, fx: [['scatter', 'T', 1, 3, { ...FEED, ph: 1 }]], face: { m: 's' } },
        { O: AT('belly'), T: A(20, 30), tools: bk, dy: 1 },
      ][k];
    }, [260, 200, 300, 260]),
    // 糸を紡ぐ：左手に羊毛、右手を上げて糸を引き出し、紡錘が回る
    spin: hands4((v, k) => ({
      O: AT('chest', 0, 1), T: A(120, 165 - (k & 1) * 10),
      tools: [TL('fleece', 0, { h: 'O' }), TL('spin', 0, { ph: k & 1 })],
      headDy: 1, face: k === 3 ? { e: 'c' } : null,
    }), [220, 220, 220, 220]),
    // 機を織る：腰かけて機に向かい、杼（ひ）を左右へ通し、筬（おさ）を打ち込む
    weave: hands4((v, k) => {
      const p = k & 1;
      if (v === 'S') return { legs: 'sit', lean: 1, T: AT('fwd', p ? 2 : 0, 1), O: AT('fwd', p ? 0 : 2, 2), prop: 'loom', ph: p };
      return { legs: 'sit', T: AT('chest', p ? 2 : -1, 2), O: AT('chest', p ? -1 : 2, 2), prop: 'loom', ph: p, headDy: 1 };
    }, [240, 240, 240, 240]),
    // かごを編む：座って、ひざの上のかごに編み枝を通す
    wicker: hands4((v, k) => ({ legs: 'sit', headDy: 1, T: AT('lap', k & 1 ? 1 : -1, -1), O: AT('lap', 1, 0), tools: TL('wicker', 0, { ph: k & 1 }), item: false }), [280, 280, 280, 280]),
    // 縄をなう：両手のあいだで縄をより合わせる
    twist: hands4((v, k) => ({ legs: 'sit', T: AT('chest', 1, 1 + (k & 1)), O: AT('belly', 0, 1 - (k & 1)), tools: TL('cord', 0, { ph: k & 1 }), headDy: 1, item: false }), [220, 220, 220, 220]),
    // 品を渡して、代金を受け取る（売る側）
    handover: hands4((v, k) => {
      const pc = TL('parcel', 0, {});
      return [
        { T: AT('chest', 0, 1), O: AT('chest', 1, 1), tools: pc, face: { m: 's' } },
        { lean: v === 'S' ? 1 : 0, T: AT('fwd', 1, 0), O: AT('fwd', 0, 1), tools: pc, face: MO },
        { T: AT('fwd', 1, 0), O: A(20), fx: [['coin', 'T', 0, -2]], face: { m: 's' } },
        { T: AT('belly', 0, 0), O: A(10), fx: [['coin', 'T', 0, -1]], face: { m: 's', e: 'c' } },
      ][k];
    }, [360, 320, 300, 420]),
    // 代金を払って、品を受け取る（買う側）。かごに入れる
    buy: hands4((v, k) => {
      const bk = TL('basket', 0, { h: 'O' });
      return [
        { lean: v === 'S' ? 1 : 0, T: AT('mouth', 1, 1, { late: true }), O: AT('belly'), tools: bk, headDy: 1 },
        { T: AT('fwd', 1, 0), O: AT('belly'), tools: bk, fx: [['coin', 'T', 0, -2]], face: MO },
        { T: AT('fwd', 0, 1), O: AT('belly'), tools: [bk, TL('parcel', 0, { c: '#d8a050' })], face: { m: 's' } },
        { T: AT('belly', 1, -1), O: AT('belly'), tools: [bk, TL('parcel', 0, { c: '#d8a050' })], face: { m: 's' } },
      ][k];
    }, [520, 300, 300, 360]),
    // 呼び込み：口に手を当てて声を張り、もう片手で品を示す
    hawk: hands4((v, k) => {
      if (v === 'B') return { O: A(60, 100), T: AT('cheek', 0, 0, { late: true }), dy: k & 1 };
      return k & 1
        ? { T: AT('cheek', 0, 1, { late: true }), O: A(70, 100), face: { m: 'O' }, fx: [['shout', 'face', 1, 0]] }
        : { T: AT('chest'), O: A(50, 80), face: { m: 's' } };
    }, [420, 380, 360, 420]),
    // 笑う：体をそらし、腹に手を当て、目を細めて大笑い
    laugh: hands4((v, k) => ({ lean: v === 'S' ? -1 : 0, dy: k & 1, T: AT('belly'), O: k === 2 ? A(60, 110) : A(20, 30), face: { e: 'c', m: k & 1 ? 'O' : 's' }, fx: k & 1 ? [['haha', 'head', 0, 2]] : [] }), [200, 180, 200, 180]),
    // 相づち：後ろ手に組み、うなずきながら聞く
    nod: hands4((v, k) => ({ T: AT('hip', -1, 0), O: AT('hip', -1, 0), headDy: k === 1 || k === 3 ? 1 : 0, face: k === 3 ? { m: 's' } : k === 1 ? { e: 'c' } : null }), [500, 220, 700, 220]),
    // 伸びをする：両腕を上へ、目を閉じてあくび
    stretch: hands4((v, k) => [
      { T: A(90, 130), O: A(90, 130) },
      { T: A(165, 180), O: A(165, 180), face: { e: 'c', m: 'O' }, dy: -1 },
      { T: A(170, 180), O: A(170, 180), face: { e: 'c', m: 'O' } },
      { T: A(40, 70), O: A(40, 70), face: { m: 's' } },
    ][k], [300, 500, 500, 500]),
    // 地面を調べる：しゃがみ、額に手をかざしながら、もう片手で土や跡を探る（冒険・足跡を追う）
    search: hands4((v, k) => ({ legs: k === 3 ? 'stand' : 'squat', lean: 1, O: AT('brow', 0, 0, { late: true }), T: AT('low', k & 1, -1 + (k & 1)), item: 'keep', fx: k === 1 ? [['dots', 'T', 0, 1, ['#7a5a3a', '#9a8a6a']]] : [], face: k === 2 ? { e: 'c' } : null }), [360, 300, 360, 500]),
    // 献金・施し：胸の前の銅貨を箱へ落とし、手を合わせる
    offer: hands4((v, k) => [
      { T: AT('chest'), O: A(10), prop: 'almsbox', fx: [['coin', 'T', 0, -1]] },
      { lean: v === 'S' ? 1 : 0, T: AT('fwd', 0, 3), O: A(10), prop: 'almsbox', fx: [['coin', 'T', 0, 1]] },
      { T: AT('chest', 0, -1), O: AT('chest', 0, -1), prop: 'almsbox', face: { e: 'c' } },
      { T: AT('chest', 0, -1), O: AT('chest', 0, -1), prop: 'almsbox', headDy: 1, face: { e: 'c' }, fx: [['spark', 'head', 0, -1, '#fff0a0']] },
    ][k], [360, 300, 600, 500]),
    // 耳打ち：身を寄せ、手を口の横に当てて小声で。銅貨がそっと渡る
    whisper: hands4((v, k) => ({ lean: v === 'S' ? 1 : 0, T: AT('cheek', 0, 0, { late: true }), O: k >= 2 ? AT('fwd', 0, 2) : AT('belly'), fx: k === 3 ? [['coin', 'O', 0, -1]] : [], face: { m: k & 1 ? 'o' : undefined, e: k === 2 ? 'c' : undefined } }), [400, 300, 400, 500]),
    // 瞑想：地面に座り、ひざの上で手を組み、目を閉じて静かに息をする
    meditate: hands4((v, k) => ({ legs: 'sit', T: AT('lap', 0, -1), O: AT('lap', 1, -1), dy: k === 1 ? 1 : 0, face: { e: 'c' }, item: false, fx: k === 2 ? [['aura', 'chest', 0, 0, 0]] : k === 3 ? [['aura', 'chest', 0, 0, 1]] : [] }), [900, 700, 600, 600]),
    // 子をあやす（孫の相手）：しゃがんで両手を広げ、笑いかける
    cheerup: hands4((v, k) => ({ legs: 'squat', T: k & 1 ? A(110, 140) : A(60, 90), O: k & 1 ? A(110, 140) : A(60, 90), face: { m: k & 1 ? 'O' : 's' }, fx: k === 1 ? [['heart', 'head', 3, -2]] : [] }), [300, 300, 300, 300]),
    // 道を突き固める：突き棒を持ち上げて、落とす。土ぼこり
    tamp: hands4((v, k) => {
      const t = TL('tamper', 0, { behind: v === 'B' });
      return [
        { legs: 'wide', T: AT('chest', 0, 1), O: TO(-2), tools: t },
        { legs: 'wide', T: A(140, 170), O: TO(-2), tools: t, jump: 0, face: { e: 'c' } },
        { legs: 'wide', dy: 1, T: AT('belly', 0, 1), O: TO(-2), tools: t, fx: [['puff', 'tip', 2, -1, '#c8b898'], ['puff', 'tip', -2, -1, '#b8a888']] },
        { legs: 'wide', T: AT('belly', 0, 0), O: TO(-2), tools: t, fx: [['sweat', 'head']] },
      ][k];
    }, [360, 260, 160, 360]),
    // 水を汲む：川辺・水場にしゃがんで桶を沈め、持ち上げる（しずくが落ちる）
    draw: hands4((v, k) => [
      { legs: 'squat', lean: 1, T: AT('low', 1, -1), O: AT('low', 0, -1), tools: TL('pail', 0), fx: v === 'B' ? [] : [['dots', 'T', 0, 3, ['#bfe8ff', '#8ad0ff']]] },
      { legs: 'squat', lean: 1, dy: 1, T: AT('low', 1, 0), O: AT('low', 0, 0), tools: TL('pail', 0), face: { e: 'c' } },
      { T: AT('belly', 1, 0), O: AT('belly', 0, 0), tools: TL('pail', 0), fx: v === 'B' ? [] : [['drops', 'T', 0, 3, { ph: 0 }]] },
      { T: AT('chest', 1, 1), O: AT('chest', 0, 1), tools: TL('pail', 0), face: { m: 's' }, fx: [['sweat', 'head']] },
    ][k], [360, 300, 320, 420]),
    // 洗濯物を干す：足もとのかごから布を取り、背伸びして綱に掛ける
    hang: hands4((v, k) => {
      const cs = ['#e8e8f0', '#b8d0e8', '#e8d0c0', '#d8e8c8'];
      return [
        { legs: 'squat', lean: 1, T: AT('low', 0, -1), O: AT('low', 1, -1), tools: TL('basket', 0) },
        { T: AT('chest', 1, 1), O: AT('chest', -1, 1), tools: TL('wetcloth', 0, { c: cs[k] }) },
        { T: A(160, 175), O: A(160, 175), tools: TL('wetcloth', 0, { c: cs[2] }), dy: -1, fx: [['line', 'T', 0, 0, ['O', 0, 0, '#c8a860']]] },
        { T: A(150, 165), O: A(20), face: { m: 's' } },
      ][k];
    }, [360, 300, 420, 300]),
    // 投網を打つ：網を抱え、体をひねって前へ投げ広げ、綱を手繰る
    net: hands4((v, k) => [
      { T: AT('chest', 1, 1), O: AT('chest', 0, 1), tools: TL('net', 0) },
      { lean: v === 'S' ? -1 : 0, T: A(130, 150), O: A(40, 70), tools: TL('net', 0), face: { e: 'c' } },
      { lean: v === 'S' ? 1 : 0, T: A(80, 90), O: A(70, 90), fx: v === 'B' ? [] : [['netcast', 'T', 0, 0]], face: { m: 'O' } },
      { legs: 'wide', lean: v === 'S' ? -1 : 0, T: AT('chest', 1, 0), O: A(80, 90), fx: [['line', 'O', 0, 0, ['O', 7, 2, '#c8c0a8']]] },
    ][k], [300, 260, 420, 600]),
    // 木の実を摘む：背伸びして枝の実をもぎ、腰のかごへ
    pluck: hands4((v, k) => [
      { T: A(150, 165), O: AT('belly'), tools: TL('basket', 0, { h: 'O' }) },
      { T: A(165, 175), O: AT('belly'), tools: [TL('basket', 0, { h: 'O' }), TL('berries', 0)], dy: -1, fx: [['dots', 'T', 0, -1, ['#4a9a3a', '#6ac050']]] },
      { T: AT('chest', 1, 0), O: AT('belly'), tools: [TL('basket', 0, { h: 'O' }), TL('berries', 0)], face: { m: 's' } },
      { T: AT('belly', 1, -1), O: AT('belly'), tools: TL('basket', 0, { h: 'O' }) },
    ][k], [300, 360, 260, 300]),
  };
  // 見張りの合間に遠くを見る（既存の lookout をやや長く）
  M.gaze = { ...WORK.lookout, durs: WORK.lookout.durs.map((d) => d + 200) };
  // 地面に腰を下ろして休む（既存の sit と同じ形）
  M.sitrest = LIFE.sit;
  void swing;
  return M;
}

// ================================================================ 登録（anim_people.js から1回呼ぶ）
let JM = null;
export function installActs(K) {
  Object.assign(K.TOOL, TOOLS);
  Object.assign(K.OBJ, makeObjs(K));
  const M = makeMotions(K);
  for (const [k, v] of Object.entries(M)) if (!K.WORK[k]) K.WORK[k] = v;
  JM = K.JOB_MOTION || null;
}
export const ACT_MOTIONS = ['sow', 'weed', 'water', 'reap', 'feed', 'spin', 'weave', 'wicker', 'twist', 'handover', 'buy', 'hawk', 'laugh', 'nod', 'stretch', 'search', 'offer', 'whisper', 'meditate', 'cheerup', 'tamp', 'draw', 'hang', 'net', 'pluck', 'gaze', 'sitrest'];

// 職業 → 仕事の動き（これまで決まっていなかった職業）
export const ACT_JOB_MOTION = {
  overseer: 'write', roadworker: 'tamp', pioneer: 'chop', coachman: 'lift', peddler: 'hawk', troupe: 'juggle', ferryman: 'rope',
  swordmaster: 'train', magister: 'lecture', basketweaver: 'wicker', roper: 'twist', sackmaker: 'sew', leatherworker: 'tap',
  porter: 'lift', hostkeeper: 'serve', bathkeeper: 'sweep', librarian: 'read', actor: 'tell', shopkeeper: 'handover',
  granarian: 'write', matron: 'cradle', vchief: 'lecture', vguard: 'guard', mercenary: 'train', hermit: 'meditate',
  weaver: 'weave',
};

// ================================================================ 行動 → 動き
// 仕事の中身を、季節・場所・時間で選び分ける（同じ職業でも皆が同じ動きにならないように）
function jobWork(sim, p, a, t) {
  const out = p.inside == null;
  const u = lot(p, t, 30, 17);
  switch (p.job) {
    case 'farmer': {
      const si = sim.seasonIdx ? sim.seasonIdx() : 0;
      if (!out) return null;
      if (si === 0) return u < 0.55 ? 'work:sow' : 'work:hoe';
      if (si === 1) return u < 0.4 ? 'work:weed' : u < 0.7 ? 'work:water' : 'work:hoe';
      if (si === 2) return u < 0.6 ? 'work:reap' : u < 0.8 ? 'work:lift' : 'work:hoe';
      return u < 0.5 ? 'work:hoe' : 'work:dig';
    }
    case 'gardener': return out ? (u < 0.4 ? 'work:snip' : u < 0.7 ? 'work:weed' : 'work:water') : null;
    case 'gatherer': return u < 0.3 ? 'work:pluck' : null;
    case 'fisher': return out && u < 0.25 ? 'work:net' : null;
    case 'hunter': return out && u < 0.3 ? 'work:search' : null;
    case 'woodcutter': return u < 0.2 ? 'work:saw' : null;
    case 'pioneer': return u < 0.35 ? 'work:dig' : u < 0.5 ? 'work:tamp' : null;
    case 'roadworker': return u < 0.35 ? 'work:dig' : null;
    case 'laundress': return out && u < 0.4 ? 'work:hang' : null;
    case 'weaver': return out ? 'work:spin' : 'work:weave';
    case 'tailor': return u < 0.2 ? 'work:spin' : null;
    case 'rancher': return u < 0.5 ? 'work:feed' : null;
    case 'shepherd': return u < 0.3 ? 'work:feed' : null;
    case 'stablehand': return u < 0.4 ? 'work:feed' : null;
    case 'militia': case 'guard': case 'vguard': case 'gatekeeper': case 'soldier': return out && u < 0.2 ? 'work:gaze' : null;
    case 'merchant': case 'shopkeeper': return u < 0.4 ? 'work:hawk' : u < 0.7 ? 'work:handover' : null;
    case 'hermit': return u < 0.35 ? 'work:pray' : null;
    case 'peddler': return u < 0.4 ? 'work:handover' : null;
    case 'granarian': return u < 0.5 ? 'work:lift' : null;
    case 'overseer': return out && u < 0.5 ? 'work:gaze' : null;
  }
  return null;
}

// いまの行動 → 動きの名前。関係のない行動は null（anim_people.js のいつもの決め方に任せる）
// 立ち止まっているときだけ呼ばれる（歩いているときは歩行シート）
export function actAnimState(sim, p, a, age, kid) {
  if (!a || a.phase !== 'do' || LEAVE.has(a.type)) return null;
  const t = sim?.S?.t ?? 0;
  const out = p.inside == null;
  const u = lot(p, t, 12, 3);
  const elder = age >= 60;
  switch (a.type) {
    case 'work': {
      if (kid && !p.job) return null;
      return p.job ? jobWork(sim, p, a, t) : null;
    }
    // ---- 売り買い
    case 'sell': case 'trade': return 'work:handover';
    case 'stall': return u < 0.45 ? 'work:hawk' : u < 0.8 ? 'work:handover' : null;
    case 'kgarden': return out ? (u < 0.4 ? 'work:hoe' : u < 0.7 ? 'work:weed' : 'work:water') : null;   // 家のそばの菜園（foodflow.js）
    case 'berry': return out ? (u < 0.75 ? 'work:pluck' : null) : null;   // 森の縁のベリー摘み（foodflow.js）
    case 'peddle': return u < 0.6 ? 'work:hawk' : 'work:handover';
    case 'shop': case 'shopping': case 'buygear': case 'buybag': case 'buyclothes': case 'buymed': case 'buymat': case 'repair':
      return kid ? null : 'work:buy';
    case 'donate': return 'work:offer';
    case 'uw_deal': return 'work:whisper';
    // ---- 家のこと
    case 'water': return out ? 'work:draw' : null;
    case 'laundry': return out ? (lot(p, t, 25, 5) < 0.35 ? 'work:hang' : 'work:wash') : null;
    case 'help': {   // 子が親の仕事を手伝う：親の仕事の動き
      const par = sim?.S?.people?.[a.friend];
      const m = par && JM ? (JM[par.job] || null) : null;
      return m && m !== 'train' && m !== 'shoot' && m !== 'guard' ? 'work:' + m : null;
    }
    case 'grandkids': return u < 0.5 ? 'work:cheerup' : null;
    case 'stash': return 'work:lift';
    case 'deliver': return 'work:scroll';
    // ---- 学び・鍛錬
    case 'read': case 'academy': return 'work:read';
    case 'dojo': case 'lesson': return 'work:train';
    case 'coach': return 'work:lift';
    // ---- 休み・ぶらぶら
    case 'rest': case 'home': case 'pamper': case 'visit':
      if (!out) return a.type === 'rest' && !elder && u < 0.3 ? 'work:stretch' : 'sit';
      return u < 0.5 ? 'sit' : u < 0.7 ? 'work:stretch' : null;
    case 'plaza':
      if (kid) return 'play';
      if (elder) return u < 0.6 ? 'sit' : 'work:nod';
      return u < 0.3 ? 'work:nod' : u < 0.45 ? 'work:laugh' : u < 0.55 ? 'work:stretch' : null;
    case 'stroll':
      if (kid) return u < 0.5 ? 'play' : null;
      return u < 0.3 ? 'work:gaze' : u < 0.45 ? 'work:stretch' : null;
    case 'dine': case 'wayeat': return 'eat';
    // ---- 冒険・野の仕事
    case 'quest': case 'explore': case 'ruins': case 'discover': return out ? 'work:search' : null;
    case 'forage': return 'work:gather';
    case 'uw_grow': return u < 0.5 ? 'work:weed' : 'work:hoe';
    case 'uw_poach': return u < 0.5 ? 'work:search' : 'work:sneak';
    case 'pilgrim': return 'pray';
    case 'garden': return u < 0.4 ? 'work:weed' : u < 0.6 ? 'work:water' : 'work:hoe';
    case 'fishing': return u < 0.15 ? 'work:net' : 'work:fish';
  }
  return null;
}
