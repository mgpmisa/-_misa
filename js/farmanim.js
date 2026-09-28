// 農夫の季節の動き（ドット絵）― 開発部（グラフィック兼務）
// anim_acts.js の種まき・草取り・水やり・鎌で刈る に、足りなかった畑仕事の動きを足す。
//   plow    鋤を押して畝を立てる（地面に鋤と土くれ）／plowox 牛馬に鋤を引かせて手綱と柄を持つ
//   spread  肥やしを熊手ですくってまく（茶色の粒が飛ぶ）
//   haul    刈った麦の束を肩にかついで運ぶ／haulman 肥やしのかごを抱えて運ぶ
//   thresh  殻竿（からざお）で脱穀する（冬の仕事）
// どの区画で何をしているかは farming.js が p.farmTask（と p.farmTaskT）に入れる。
//
// ■ anim_acts.js からの呼び方
//   installActs の中：installFarmActs(K); Object.assign(PROPS, FARM_PROPS); Object.assign(HEADS, FARM_HEADS);
//   jobWork の 'farmer'：{ const fm = farmMotionOf(sim, p); if (fm) return fm; }

// 道具の先
export const FARM_HEADS = {
  // 殻竿：柄の先に、短い打ち棒が蝶番でぶら下がる
  flail(put, at, len) {
    const w = '#a07a4a', d = '#7a5a34';
    put(at(len, 0), '#5a4028'); put(at(len + 1, 1), w); put(at(len + 2, 1), w); put(at(len + 3, 2), d); put(at(len + 4, 2), d);
    return at(len + 4, 2);
  },
};
// 地面の小道具（体の前の地面）
export const FARM_PROPS = {
  // 鋤：斜めの柄と鉄の刃、掘り返した土くれ。ph で土くれが動く
  plough(P, G, ph, c) {
    const y = c.FEET, wood = '#8a6238', iron = '#9aa0a8', soil = '#5a3e24', soil2 = '#7a5a36';
    if (c.S) {
      const x = c.sx0 - 7;
      P.line(x + 6, y - 5, x + 2, y - 1, wood); P.line(x + 6, y - 4, x + 3, y - 1, wood);
      P.rect(x, y - 1, 3, 1, iron); P.px(x - 1, y, iron);
      P.px(x - 2, y - 1 - (ph & 1), soil2); P.px(x - 3, y - (ph & 1 ? 0 : 1), soil); P.px(x + 1, y, soil);
    } else {
      const x = 7;
      P.rect(x, y - 4, 2, 4, wood); P.rect(x - 1, y - 5, 4, 1, wood);
      P.rect(x, y, 2, 1, iron);
      P.px(x - 2, y - (ph & 1), soil2); P.px(x + 3, y - 1 + (ph & 1), soil);
    }
  },
};

export function installFarmActs(K) {
  const { A, AT, TL, hands4, swing, WORK } = K;
  K.TOOL.flail = { len: 8, back: 2, head: 'flail' };
  // 大きな麦の束（肩にかつぐ）・肥やしのかご
  K.OBJ.bundle = (P, x, y) => {
    P.rect(x - 2, y - 5, 5, 3, '#e8c860'); P.px(x - 1, y - 6, '#f0d880'); P.px(x + 1, y - 6, '#f0d880'); P.px(x + 3, y - 5, '#f0d880');
    P.rect(x - 2, y - 2, 5, 1, '#a88830'); P.rect(x - 1, y - 1, 3, 2, '#c8a040');
  };
  K.OBJ.dungbasket = (P, x, y) => {
    P.rect(x - 2, y - 2, 5, 4, '#8a6a3a'); P.rect(x - 2, y - 2, 5, 1, '#a88a5a'); P.px(x - 1, y - 3, '#5a3a1e'); P.px(x + 1, y - 3, '#4a2e18'); P.px(x, y - 3, '#6a4a2a');
  };
  const walk = ['w0', 'stand', 'w2', 'stand'];
  const M = {};
  // 鋤を押す：前かがみで両手を柄に。脚は畝に沿って歩く。前の地面に鋤と土くれ
  M.plow = hands4((v, k) => ({ legs: walk[k], lean: 1, T: AT('fwd', 0, 2), O: AT('fwd', 1, 3), prop: 'plough', ph: k, dy: k & 1 }), [300, 260, 300, 260]);
  // 牛馬に引かせる：片手で柄、片手で手綱（前へ伸ばす）
  M.plowox = hands4((v, k) => ({ legs: walk[k], lean: 1, T: A(70, 80), O: AT('fwd', 1, 3), prop: 'plough', ph: k, dy: k & 1 }), [320, 280, 320, 280]);
  // 肥やしをまく：熊手ですくって前へ放る（茶色の粒）
  const pitch = WORK.pitch || WORK.dig;
  M.spread = { ...pitch, pose(v, k, c) { const q = pitch.pose(v, k, c); for (const t of [].concat(q.tools || [])) t.k = 'pitchfork'; for (const f of q.fx || []) f[4] = ['#6a4a2a', '#8a6a3a', '#4a3018']; return q; } };
  // 刈った束をかついで運ぶ
  M.haul = hands4((v, k) => ({ legs: walk[k], T: A(150, 175), O: AT('chest', 0, 1), tools: TL('bundle', 0), dy: k & 1 }), [280, 240, 280, 240]);
  // 肥やしのかごを抱えて運ぶ
  M.haulman = hands4((v, k) => ({ legs: walk[k], T: AT('belly', 1, -1), O: AT('belly', 0, -1), tools: TL('dungbasket', 0, { h: 'O' }), dy: k & 1 }), [300, 260, 300, 260]);
  // 殻竿で脱穀：振り上げて、足もとの麦の穂に打ちつける（麦わらの粒が跳ねる）
  M.thresh = swing('flail', { fx: ['#e8c860', '#c8a040', '#f0d880'], hit: 30 });
  for (const [k, v] of Object.entries(M)) if (!WORK[k]) WORK[k] = v;
}

// 畑仕事 → 動き（farming.js が決めた仕事。2時間より古い記録は使わない）
const MAP = { plow: 'work:plow', plowox: 'work:plowox', sow: 'work:sow', spread: 'work:spread', weed: 'work:weed', water: 'work:water', reap: 'work:reap', haul: 'work:haul', haulman: 'work:haulman', thresh: 'work:thresh' };
export function farmMotionOf(sim, p) {
  if (!p.farmTask || sim?.S?.t == null || sim.S.t - (p.farmTaskT ?? -1e9) > 120) return null;
  return MAP[p.farmTask] || null;
}
