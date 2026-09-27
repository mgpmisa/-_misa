// 造幣の流れの人の動き（ドット絵）：炉・延べ板・打刻・鉱石運び・硬貨の箱の警護（経済部）
//
// anim_people.js の仕組み（WORK の動き・OBJ の手に持つ小物）に、造幣の動きを足す。anim_people.js の ANIM_EXT を通して登録する。
//   work:mf_smelt   炉で溶かす … ふいごを踏む（足踏み・火の粉）→ やっとこでるつぼを持ち上げて傾ける
//   work:mf_cast    延べ板にする … るつぼから鋳型へ流す → 赤い延べ板をやっとこで水おけに入れて冷ます → 冷めた延べ板を胸に抱えて運ぶ
//   work:mf_strike  打って硬貨にする … 金床の上の打ち型を、槌で打つ（硬貨が跳ねる）
//   work:mf_count   打ち上がった硬貨を数える（もとからある coins の動きを使う）
//   work:mf_cartpull  荷車（鉱石の荷車・硬貨の箱の手押し車）の柄を握って引く・押す（歩きながら）
//   work:mf_orecarry  鉱石の袋を肩に担いで歩く
//   work:mf_guardmarch 槍を立てて、硬貨の箱に付き添って歩く
// 人の状態 → 動き：ANIM_EXT.STATE に mintAnimState を足す（personAnimState の頭で呼ばれる）
import { ANIM_EXT } from './anim_people.js';

const A = (a, b, r) => ({ a, b: b ?? a, r: r ?? 1 });
const AT = (at, dx = 0, dy = 0, o) => ({ at, dx, dy, ...o });
const TL = (k, a, o) => ({ k, a, ...o });
const LEGS = ['w0', 'stand', 'w2', 'stand'];

// ---------- 手に持つ小物（手の位置に描く。G.S は横向き：前は x の小さい側） ----------
const OBJS = {
  // るつぼ：やっとこ（2マス）の先の、赤く溶けた銀の入った土の壺。tilt で傾けて注ぐ
  mf_crucible: (P, x, y, tl, G) => {
    const f = G.S ? -1 : 0, cx = x + f * 3, cy = y + (G.S ? 0 : 1);
    if (G.S) { P.px(x - 1, y, '#3a3a42'); P.px(x - 2, y, '#3a3a42'); } else P.px(x, y + 1, '#3a3a42');
    if (tl.tilt) {
      P.rect(cx - 1, cy - 1, 3, 2, '#8a4a2a'); P.px(cx - 1, cy + 1, '#6a3a1a');
      P.px(cx + (G.S ? -2 : -1), cy - 1, '#ffd060'); P.px(cx + (G.S ? -2 : -1), cy, '#ffb040');
    } else {
      P.rect(cx - 1, cy - 2, 3, 3, '#8a4a2a'); P.rect(cx - 1, cy - 2, 3, 1, '#ffb040'); P.px(cx, cy - 2, '#fff0a0'); P.px(cx - 1, cy, '#6a3a1a');
    }
  },
  // 延べ板：銀色の細い板。hot なら赤く焼けている
  mf_ingot: (P, x, y, tl, G) => {
    const hot = !!tl.hot;
    if (G.S) { P.rect(x - 3, y - 1, 3, 1, hot ? '#ffb070' : '#eef2f8'); P.rect(x - 3, y, 3, 1, hot ? '#e0602a' : '#a8b0bc'); if (hot) P.px(x - 1, y, '#3a3a42'); }
    else { P.rect(x - 1, y - 1, 3, 1, hot ? '#ffb070' : '#eef2f8'); P.rect(x - 1, y, 3, 1, hot ? '#e0602a' : '#a8b0bc'); }
  },
  // 冷めた延べ板を2枚重ねて抱える
  mf_ingots: (P, x, y, tl, G) => {
    const x0 = G.S ? x - 3 : x - 1;
    P.rect(x0, y - 2, 4, 1, '#eef2f8'); P.rect(x0, y - 1, 4, 1, '#a8b0bc'); P.rect(x0, y, 4, 1, '#dfe4ec'); P.px(x0 + 3, y, '#8a909a');
  },
  // 打ち型（鉄の短い棒。下の面に紋が彫ってある）
  mf_die: (P, x, y, tl, G) => { P.rect(x, y - 2, 1, 3, '#5a5a64'); P.px(x, y - 3, '#8a8a94'); P.px(x, y + 1, '#c8ccd4'); void G; },
  // 鉱石の袋（肩に担ぐ）：麻袋から灰色の石がのぞく
  mf_oresack: (P, x, y, tl, G) => {
    const x0 = G.S ? x : x - 2;
    P.rect(x0, y - 3, 4, 4, '#8a7a5a'); P.rect(x0, y - 3, 4, 1, '#a89a70'); P.px(x0 + 1, y - 4, '#9a968e'); P.px(x0 + 2, y - 4, '#7a766e'); P.px(x0 + 3, y - 1, '#6a5a3a');
    if (tl.gold) P.px(x0 + 2, y - 4, '#e8c040');
  },
  // 硬貨の箱（鉄の帯と金の錠）
  mf_chest: (P, x, y, tl, G) => {
    const x0 = G.S ? x - 4 : x - 2, w = G.S ? 4 : 5;
    P.rect(x0, y - 2, w, 3, '#6a4020'); P.rect(x0, y - 2, w, 1, '#8a5a30'); P.px(x0 + 1, y - 2, '#4a4a52'); P.px(x0 + w - 2, y - 1, '#4a4a52'); P.px(x0 + (w >> 1), y - 1, '#e8c040');
  },
  // 荷車の柄（両手で握る横木）
  mf_shaft: (P, x, y, tl, G) => { if (G.S) { P.px(x + 1, y, '#7a5230'); P.px(x + 2, y + 1, '#7a5230'); } else { P.px(x - 1, y + 1, '#7a5230'); P.px(x + 1, y + 1, '#7a5230'); } },
};

// ---------- 動き ----------
const WORKS = {
  // 炉で溶かす：ふいごを踏む（4コマ）→ るつぼを持ち上げる → 傾ける
  mf_smelt: {
    durs: [240, 200, 240, 200, 420, 480],
    pose(v, k) {
      if (k < 4) {
        const down = k & 1;
        return { legs: LEGS[k], dy: down, T: AT('hip'), O: AT('hip'), face: down ? { m: 'f' } : null,
          fx: down ? [['glow', 'fwdfeet', 3, -6, '#ffb040'], ['puff', 'fwdfeet', 2, -2, '#9a9088']] : [['spark', 'fwdfeet', 4, -8, '#ffd060']] };
      }
      if (k === 4) return { legs: 'wide', lean: 1, T: AT('fwd', 0, 1), O: AT('fwd', -1, 1), tools: TL('mf_crucible', 0), fx: [['glow', 'T', 3, -2, '#ffb040']] };
      return { legs: 'wide', lean: 1, dy: 1, T: AT('fwd', 1, 2), O: AT('fwd', 0, 2), tools: TL('mf_crucible', 0, { tilt: 1 }), fx: [['dots', 'T', 4, 2, ['#ffd060', '#ff8030']], ['glow', 'T', 4, 3, '#ff9040']] };
    },
  },
  // 延べ板にする：鋳型へ流す（2コマ）→ 水おけで冷ます → 抱えて運ぶ
  mf_cast: {
    durs: [360, 360, 420, 520],
    pose(v, k) {
      if (k < 2) return { legs: 'wide', lean: 1, dy: k, T: AT('fwd', 1, 2), O: AT('fwd', 0, 2), tools: TL('mf_crucible', 0, { tilt: 1 }), fx: [['dots', 'T', 4, 3 + k, ['#ffd060', '#ff8030']], ['glow', 'fwdfeet', 3, -3, '#ff9040']] };
      if (k === 2) return { legs: 'squat', lean: 1, T: AT('low', 0, -1), O: AT('belly'), tools: TL('mf_ingot', 0, { hot: 1 }), prop: 'tub', ph: 1, fx: [['puff', 'T', -1, -4, '#f0f0f4'], ['puff', 'T', 1, -6, '#d8d8dc']] };
      return { T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('mf_ingots', 0), face: { m: 's' } };
    },
  },
  // 打って硬貨にする：打ち型を左手で押さえ、右手の槌で打つ
  mf_strike: {
    durs: [280, 110, 200, 220],
    pose(v, k) {
      const die = TL('mf_die', 0, { h: 'O' });
      if (v === 'S') return [
        { legs: 'wide', lean: -1, T: A(175, 190), O: AT('fwd', 0, 2), tools: [TL('hammer', 205), die], prop: 'anvil', ph: 0 },
        { legs: 'wide', T: A(130, 120), O: AT('fwd', 0, 2), tools: [TL('hammer', 140), die], prop: 'anvil', ph: 0 },
        { legs: 'wide', lean: 1, dy: 1, T: A(60, 30), O: AT('fwd', 0, 2), tools: [TL('hammer', 60), die], prop: 'anvil', ph: 1, fx: [['spark', 'tip', 0, -1, '#fff4a0'], ['coin', 'tipO', 1, -2]] },
        { legs: 'wide', T: A(90, 100), O: AT('fwd', 0, 2), tools: [TL('hammer', 110), die], prop: 'anvil', ph: 1, fx: [['coin', 'tipO', 2, -4]] },
      ][k];
      const bh = v === 'B';
      return [
        { legs: 'wide', T: A(160, 175), O: AT('belly', 0, 1), tools: [TL('hammer', 185), die], prop: 'anvil', ph: 0 },
        { legs: 'wide', T: A(120, 130), O: AT('belly', 0, 1), tools: [TL('hammer', 160), die], prop: 'anvil', ph: 0 },
        { legs: 'wide', dy: 1, T: AT('belly', -1, 0), O: AT('belly', 0, 1), tools: [TL('hammer', 30, { behind: bh }), die], prop: 'anvil', ph: 1, fx: bh ? [] : [['spark', 'tip', 0, -1, '#fff4a0'], ['coin', 'O', 2, -3]] },
        { legs: 'wide', T: AT('chest', 1, 0), O: AT('belly', 0, 1), tools: [TL('hammer', 120), die], prop: 'anvil', ph: 1, fx: bh ? [] : [['coin', 'O', 3, -5]] },
      ][k];
    },
  },
  // 荷車の柄を握って引く（歩きながら）
  mf_cartpull: {
    durs: [170, 170, 170, 170],
    pose(v, k) {
      const low = v === 'S' ? A(35, 25) : AT('belly', 1, 2);
      const low2 = v === 'S' ? A(30, 20) : AT('belly', 1, 2);
      return { legs: LEGS[k], dy: k & 1, lean: v === 'S' ? 1 : 0, T: low, O: low2, tools: TL('mf_shaft', 0), fx: k === 3 ? [['sweat', 'head']] : [] };
    },
  },
  // 鉱石の袋を肩に担いで歩く
  mf_orecarry: {
    durs: [190, 190, 190, 190],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('shoulder'), O: AT('chest', 0, -1), tools: TL('mf_oresack', 0), face: k === 1 ? { m: 'f' } : null }; },
  },
  // 硬貨の箱を抱えて歩く
  mf_chestcarry: {
    durs: [200, 200, 200, 200],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('mf_chest', 0), face: { m: 'f' } }; },
  },
  // 槍を立てて付き添う
  mf_guardmarch: {
    durs: [180, 180, 180, 180],
    pose(v, k) { return { legs: LEGS[k], T: A(0), O: A(k & 1 ? 10 : -10), tools: TL('spear', 180), face: k === 2 ? { e: 'c' } : null }; },
  },
};

// 人の状態 → 動き（personAnimState の頭で呼ばれる。null ならいつもどおり）
export function mintAnimState(sim, p, moving) {
  const a = p.action;
  if (!a || p.fight) return null;
  switch (a.type) {
    case 'orehaul': return moving ? 'work:mf_cartpull' : 'idle';
    case 'coinrun': return moving ? 'work:mf_cartpull' : 'idle';
    case 'coinguard': return moving ? 'work:mf_guardmarch' : 'work:guard';
    case 'mintwork': return a.phase === 'do' ? `work:${({ smelt: 'mf_smelt', cast: 'mf_cast', strike: 'mf_strike', count: 'coins' })[p.mintStep] || 'coins'}` : null;
  }
  if (moving && p.mfOre && (p.mfOre.silver_ore || 0) + (p.mfOre.gold_ore || 0) > 0) return 'work:mf_orecarry';
  return null;
}
// 造幣所の中の工程 → 動きの名前（interior の上書きに使う）
export const STEP_ANIM = { smelt: 'work:mf_smelt', cast: 'work:mf_cast', strike: 'work:mf_strike', count: 'work:coins' };

let done = false;
export function registerMintAnims() {
  if (done || !ANIM_EXT) return;
  done = true;
  Object.assign(ANIM_EXT.OBJ, OBJS);
  Object.assign(ANIM_EXT.WORK, WORKS);
  ANIM_EXT.STATE.push(mintAnimState);
}
registerMintAnims();
