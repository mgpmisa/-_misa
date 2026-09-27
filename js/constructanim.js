// 普請場の仕事の姿（ドット絵）：開発部（グラフィック兼務）
//
// anim_people.js の「仕事の動き」（WORK）に、建築の工程ごとの動きを足す。絵の描き方（腕の角度・手の置き場所・道具・小道具）は
// anim_people.js の仕組みをそのまま使うので、同じ人なら歩く絵・ほかの仕事の絵と見た目がそろう。
//   c_stake     … 掛矢（大きな木槌）を両手で振りかぶり、杭を打ち込む（縄張り・柵）
//   c_hammer    … 掛矢で柱と梁の継ぎ目を打ち込む（骨組み）
//   c_nail      … 金槌で釘を打つ（壁板・屋根板・仕上げ）
//   c_stone     … しゃがんで石を抱え上げ、胸まで持ち上げ、前の石垣に据える（土台・石の壁・石の塀）
//   c_roofup    … 藁束（瓦）を拾い、頭の上へ差し上げて屋根の上の職人に渡す（屋根を葺く）
//   c_carry     … 背負子に材木を背負って歩く（資材を運ぶ）
//   c_carrystone… 背負子に石を背負って歩く
//   c_cart      … 手押しの荷車を押して歩く（荷車そのものは 3D：constructgfx.js）
//   のこぎりを引く（saw）・土を掘る（dig）・つるはしで石を割る（pick）・袋を担ぐ（lift）・掃く（sweep）は、もとからある動きを使う。
// 小道具（地面に置く物）：beam（梁の材）・stake（杭）・wallcourse（積みかけの石垣）
// 手に持つ物：stoneblock（切り石）・thatch（藁束）・backlogs（背負子と材木）・backstone（背負子と石）
//
// 座標は anim_people.js の設計座標（幅16・足元 y23・中心線 x8。横向きは左を向く）

const WD = '#8a6a4a', WDD = '#6a4a2a', WDL = '#c8a070';
const ST = '#a8a49c', STL = '#c8c4bc', STD = '#6e6a64';

// anim_people.js の WORK に足す動き。K は anim_people.js の部品（A, AT, TO, TL, swing, hands4, OBJ, TOOL）
export function constructMotions(K) {
  const { A, AT, TO, TL, swing, hands4, OBJ, TOOL } = K;
  // 道具：掛矢（柄の長い木槌）
  if (!TOOL.bigmallet) TOOL.bigmallet = { len: 6, back: 1, head: 'mallet' };
  // 手に持つ物
  const mid = (hands) => [Math.round((hands.T.hand[0] + hands.O.hand[0]) / 2), Math.round((hands.T.hand[1] + hands.O.hand[1]) / 2)];
  if (!OBJ.stoneblock) OBJ.stoneblock = (P, x, y, tl, G, hands) => {
    const [mx, my] = mid(hands);
    P.rect(mx - 2, my - 2, 4, 3, ST); P.rect(mx - 2, my - 2, 4, 1, STL); P.rect(mx - 2, my + 1, 4, 1, STD); P.px(mx + 1, my - 1, STD);
  };
  if (!OBJ.thatch) OBJ.thatch = (P, x, y, tl, G, hands) => {
    const [mx, my] = mid(hands);
    P.rect(mx - 2, my - 2, 5, 2, '#d8c05a'); P.rect(mx - 2, my - 3, 5, 1, '#f0dc80'); P.px(mx - 3, my - 1, '#b89a3a'); P.px(mx + 3, my - 2, '#b89a3a'); P.px(mx, my - 1, '#8a6a2a');
  };
  // 背負子と荷：体の向きで描く場所を変える（横向きは背中側、正面は肩の上にのぞく、背中向きは背中を覆う）
  const backLoad = (kind) => (P, x, y, tl, G) => {
    const log = kind === 'logs';
    const c1 = log ? WD : ST, c2 = log ? WDL : STL, c3 = log ? WDD : STD;
    if (G.S) {
      const bx = 11, top = G.tT - 3;
      P.rect(bx, top, 1, G.torsoBot - top + 2, WDD);                 // 背負子の枠
      if (log) { for (let i = 0; i < 3; i++) { P.rect(bx + 1, top + i * 2, 3, 2, i & 1 ? c1 : c3); P.px(bx + 3, top + i * 2, c2); } }
      else { P.rect(bx + 1, top + 1, 3, 4, c1); P.rect(bx + 1, top + 1, 3, 1, c2); P.rect(bx + 1, top + 4, 3, 1, c3); }
      P.px(bx + 1, G.torsoBot + 1, WDD);
    } else if (G.F) {
      const top = G.tT - 4;
      if (log) { P.rect(2, top, 12, 2, c1); P.px(2, top, c2); P.px(13, top, c2); P.rect(3, top + 2, 10, 1, c3); }
      else { P.rect(5, top, 6, 3, c1); P.rect(5, top, 6, 1, c2); }
      P.px(4, top + 3, WDD); P.px(11, top + 3, WDD);
    } else {
      const top = G.tT - 3;
      P.rect(4, top, 1, G.torsoBot - top + 1, WDD); P.rect(11, top, 1, G.torsoBot - top + 1, WDD);
      if (log) { for (let i = 0; i < 3; i++) { P.rect(3, top + i * 2, 10, 2, i & 1 ? c1 : c3); P.px(3, top + i * 2, c2); P.px(12, top + i * 2, c2); } }
      else { P.rect(5, top + 1, 6, 5, c1); P.rect(5, top + 1, 6, 1, c2); P.rect(5, top + 5, 6, 1, c3); }
    }
  };
  if (!OBJ.backlogs) OBJ.backlogs = backLoad('logs');
  if (!OBJ.backstone) OBJ.backstone = backLoad('stone');

  const walkLegs = ['w0', 'stand', 'w2', 'stand'];
  const chips = ['#e0c090', '#a8845a'];
  return {
    // 杭を打つ（縄張り・柵）
    c_stake: swing('bigmallet', { prop: 'stake', hit: 35, fx: chips, hitF: 22 }),
    // 掛矢で骨組みの継ぎ目を打ち込む
    c_hammer: swing('bigmallet', { prop: 'beam', hit: 55, fx: chips, hitF: 28 }),
    // 金槌で釘を打つ
    c_nail: swing('hammer', { two: false, hold: true, prop: 'beam', hit: 65, T2: A(60, 30), fx: ['#e8ecf4', '#a8845a'], hitF: 30 }),
    // 石を抱え上げて石垣に据える
    c_stone: hands4((v, k) => [
      { legs: 'squat', lean: 1, T: AT('low', 1, 0), O: AT('low', 0, 0), tools: TL('stoneblock', 0), prop: 'wallcourse', ph: 0 },
      { dy: 1, T: AT('belly', 1, 0), O: AT('belly', 0, 0), tools: TL('stoneblock', 0), prop: 'wallcourse', ph: 0, face: { e: 'c' } },
      { legs: 'wide', lean: 1, T: AT('fwd', 1, 1), O: AT('fwd', 0, 1), tools: TL('stoneblock', 0), prop: 'wallcourse', ph: 0 },
      { legs: 'wide', lean: 1, dy: 1, T: AT('fwd', 1, 2), O: A(30), prop: 'wallcourse', ph: 1, fx: [['dots', 'T', 0, 1, ['#c8c4bc', '#8a8680']]] },
    ][k], [340, 320, 300, 420]),
    // 藁束を頭の上へ差し上げる（屋根の上の職人に渡す）
    c_roofup: hands4((v, k) => [
      { legs: 'squat', lean: 1, T: AT('low', 1, 0), O: AT('low', 0, 0), tools: TL('thatch', 0) },
      { dy: 1, T: AT('chest', 1, 0), O: AT('chest', 0, 0), tools: TL('thatch', 0) },
      { T: A(160, 175), O: A(150, 170), tools: TL('thatch', 0), face: { m: 'o' } },
      { T: A(170, 180), O: A(165, 178), tools: TL('thatch', 0), face: { e: 'c' } },
    ][k], [320, 280, 300, 420]),
    // 背負子に材木・石を背負って歩く
    c_carry: hands4((v, k) => ({ legs: walkLegs[k], lean: v === 'S' ? 1 : 0, dy: k & 1 ? 0 : 0, T: AT('shoulder', 0, 1), O: AT('shoulder', 0, 1), tools: TL('backlogs', 0, { behind: v !== 'B' }), fx: k === 3 ? [['sweat', 'head']] : [] }), [150, 150, 150, 150]),
    c_carrystone: hands4((v, k) => ({ legs: walkLegs[k], lean: 1, T: AT('shoulder', 0, 1), O: AT('shoulder', 0, 1), tools: TL('backstone', 0, { behind: v !== 'B' }), fx: k === 1 ? [['sweat', 'head']] : [] }), [170, 170, 170, 170]),
    // 手押しの荷車を押して歩く（両手を前に低く）
    c_cart: hands4((v, k) => ({ legs: walkLegs[k], lean: v === 'S' ? 1 : 0, T: AT('fwd', 1, 3), O: AT('fwd', 0, 3) }), [160, 160, 160, 160]),
  };
}

// 小道具（地面に置く物）：anim_people.js の drawProp に無い種類はここで描く
export function constructProp(P, kind, G, ph, sx0, FEET) {
  const S = G.S;
  switch (kind) {
    case 'beam': {
      // 梁の材（横に寝かせた角材）。ph で打ち込んだ木栓が見える
      const bx = S ? sx0 - 9 : 2, bw = S ? 7 : 12, y = FEET - 2;
      P.rect(bx, y, bw, 2, WD); P.rect(bx, y, bw, 1, WDL); P.rect(bx, y + 2, bw, 1, WDD);
      P.px(bx + (S ? 2 : 5), y + 1, WDD);
      if (ph) P.px(bx + (S ? 3 : 6), y - 1, '#5a3a22');
      break;
    }
    case 'stake': {
      // 杭（打つたびに沈む）
      const x = S ? sx0 - 5 : 7, top = G.torsoBot - 2 + (ph ? 2 : 0);
      P.rect(x, top, 2, FEET - top + 1, WD); P.rect(x, top, 2, 1, WDL); P.px(x + 1, FEET, WDD);
      break;
    }
    case 'wallcourse': {
      // 積みかけの石垣（ph で1段ふえる）
      const x0 = S ? sx0 - 9 : 2, w = S ? 6 : 12, rows = 2 + (ph ? 1 : 0);
      for (let r = 0; r < rows; r++) {
        const y = FEET - 1 - r * 2;
        P.rect(x0, y, w, 2, r & 1 ? STL : ST);
        for (let i = (r & 1 ? 1 : 3); i < w; i += 4) P.px(x0 + i, y, STD);
        P.rect(x0, y + 1, w, 1, STD);
      }
      break;
    }
  }
}
