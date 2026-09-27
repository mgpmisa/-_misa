// 職場の仕事の人の動き（ドット絵）：仕入れた品を運び込む・棚に並べる・作る・運び出す（経済部）
//
// 社長の指示：この世界のすべての行動にはグラフィックを用意する。人物の動作はドット絵、それ以外は3D。
// anim_people.js の仕組み（WORK の動き・OBJ の手に持つ小物・STATE の状態 → 動き）に、職場の動きを足す。
//   work:ws_carry     仕入れた麻袋（麦・粉）を肩に担いで職場へ歩く
//   work:ws_carrybox  仕入れた木箱（材木・鉱石・羊毛・薬草など）を胸に抱えて職場へ歩く
//   work:ws_haul      職場に着いて、運び込んだ袋を下ろし、奥の棚へ積む（かがむ → 持ち上げる → 運ぶ → 下ろす）
//   work:ws_stock     できた品をかごから取り、店先の棚に並べる（かがむ → 腕を上げる → 置く）
//   work:ws_bake      パン窯へ、パンをのせた木べらを差し入れる（窯の火が照らす）
//   work:ws_pour      粉ひき小屋：麦袋を持ち上げ、石うすの漏斗へ注ぐ
//   work:ws_carryout  あまった品をかごに入れて、市場の商人へ運び出す
// 作る動きは職業ごと：パン職人は こねる（knead）と 焼く（ws_bake）を交互に、粉屋は ws_pour、宿屋の主人は麦酒を仕込む（stir）、
//   そのほかは anim_people.js の職業の動き（鍛冶屋 smith・大工 saw・仕立て屋 sew・薬師 grind・陶工 potter・靴屋 tap…）。
// 人の状態は workshop.js が p.wsAct = { k: 'in'|'stock'|'make', g, until } に書く（sim の時間で数十分だけ続く）。
import { ANIM_EXT } from './anim_people.js';
import { workplaceOf, wsCarrying } from './workshop.js';

const A = (a, b, r) => ({ a, b: b ?? a, r: r ?? 1 });
const AT = (at, dx = 0, dy = 0, o) => ({ at, dx, dy, ...o });
const TL = (k, a, o) => ({ k, a, ...o });
const LEGS = ['w0', 'stand', 'w2', 'stand'];

// ---------- 手に持つ小物（手の位置に描く。G.S は横向き：前は x の小さい側） ----------
const OBJS = {
  // 麻袋：麦は麻色、粉は白地に青い筋
  ws_sack: (P, x, y, tl, G) => {
    const x0 = G.S ? x : x - 2;
    const c = tl.flour ? ['#eee8d8', '#d0c8b4', '#5a7ab0'] : ['#c8b07a', '#a8905a', '#8a7448'];
    P.rect(x0, y - 3, 4, 4, c[0]); P.rect(x0, y + 1, 4, 1, c[1]); P.px(x0 + 1, y - 4, c[1]); P.px(x0 + 2, y - 4, '#a08858');
    if (tl.flour) P.rect(x0, y - 1, 4, 1, c[2]); else { P.px(x0 + 1, y - 2, c[2]); P.px(x0 + 3, y, c[2]); }
  },
  // 木箱（中身の色がのぞく）
  ws_box: (P, x, y, tl, G) => {
    const x0 = G.S ? x - 4 : x - 2, w = G.S ? 4 : 5;
    P.rect(x0, y - 2, w, 3, '#a87a48'); P.rect(x0, y - 2, w, 1, '#c89a60'); P.rect(x0, y, w, 1, '#7a5430');
    P.px(x0 + 1, y - 3, tl.c || '#8a8a96'); P.px(x0 + w - 2, y - 3, tl.c2 || tl.c || '#6a6a74');
  },
  // パンのかご（丸パンが山になっている）
  ws_basket: (P, x, y, tl, G) => {
    const x0 = G.S ? x - 4 : x - 2, w = G.S ? 4 : 5;
    P.rect(x0, y - 1, w, 2, '#c8a060'); P.rect(x0, y + 1, w, 1, '#a88040');
    P.px(x0 + 1, y - 2, tl.c || '#d8a050'); P.px(x0 + 2, y - 2, tl.c2 || '#f0c070'); P.px(x0 + w - 2, y - 2, tl.c || '#d8a050'); if (!G.S) P.px(x0 + 2, y - 3, tl.c2 || '#f0c070');
  },
  // 棚に置く品（パンなら丸パン、ほかは小さな包み）
  ws_item: (P, x, y, tl) => { const c = tl.c || '#d8a050'; P.rect(x - 1, y - 1, 3, 2, c); P.px(x - 1, y - 1, tl.c2 || '#f0c070'); },
  // パン窯の木べら（長い柄の先に丸パン）。横向きは前へ長く、正面は手前へ短く
  ws_peel: (P, x, y, tl, G) => {
    if (G.S) { for (let i = 1; i <= 6; i++) P.px(x - i, y, '#9a7040'); P.rect(x - 9, y - 1, 3, 2, '#b88a50'); if (tl.bread) { P.rect(x - 9, y - 2, 3, 1, '#d8a050'); } }
    else { P.px(x, y + 1, '#9a7040'); P.px(x, y + 2, '#9a7040'); P.rect(x - 1, y + 3, 3, 2, '#b88a50'); if (tl.bread) P.rect(x - 1, y + 2, 3, 1, '#d8a050'); }
  },
};

// ---------- 動き ----------
const WORKS = {
  // 麻袋を肩に担いで歩く
  ws_carry: {
    durs: [190, 190, 190, 190],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('shoulder'), O: AT('chest', 0, -1), tools: TL('ws_sack', 0), face: k === 1 ? { m: 'f' } : null }; },
  },
  ws_carryflour: {
    durs: [190, 190, 190, 190],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('shoulder'), O: AT('chest', 0, -1), tools: TL('ws_sack', 0, { flour: 1 }), face: k === 1 ? { m: 'f' } : null }; },
  },
  // 木箱を胸に抱えて歩く
  ws_carrybox: {
    durs: [200, 200, 200, 200],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('ws_box', 0), face: { m: 'f' } }; },
  },
  // かごを抱えて市場へ運び出す
  ws_carryout: {
    durs: [200, 200, 200, 200],
    pose(v, k) { return { legs: LEGS[k], dy: k & 1, T: AT('belly', 0, 0), O: AT('belly', 0, 0), tools: TL('ws_basket', 0), face: k === 2 ? { m: 's' } : null }; },
  },
  // 運び込んだ袋を下ろして積む：かがんで持つ → 胸へ持ち上げる → 運ぶ → かがんで下ろす
  ws_haul: {
    durs: [320, 320, 300, 360],
    pose(v, k) {
      return [
        { legs: 'squat', lean: 1, T: AT('low'), O: AT('low', 1), tools: TL('ws_sack', 0) },
        { dy: 1, T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('ws_sack', 0), face: { e: 'c' } },
        { legs: 'w0', T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: TL('ws_sack', 0), fx: [['sweat', 'head']] },
        { legs: 'squat', lean: 1, T: AT('low', 1, 0), O: AT('low', 1, 1), tools: TL('ws_sack', 0), fx: [['puff', 'fwdfeet', 2, -1, '#d8d0c0']] },
      ][k];
    },
  },
  // 店先の棚に並べる：かごから取る → 腕を上げる → 棚に置く → 手を戻す
  ws_stock: {
    durs: [300, 260, 360, 280],
    pose(v, k) {
      const bk = TL('ws_basket', 0, { h: 'O' });
      return [
        { O: AT('belly'), T: AT('belly', 0, 1), tools: [bk, TL('ws_item', 0)] },
        { O: AT('belly'), T: A(120, 150), tools: [bk, TL('ws_item', 0)], face: { e: 'c' } },
        { O: AT('belly'), T: A(150, 170), tools: [bk, TL('ws_item', 0)], dy: -1 },
        { O: AT('belly'), T: A(100, 130), tools: [bk], face: { m: 's' } },
      ][k];
    },
  },
  // パン窯へ木べらを差し入れる（2コマ）→ 引き出す（2コマ）
  ws_bake: {
    durs: [320, 420, 320, 380],
    pose(v, k) {
      const inn = k === 1 || k === 2;
      return { legs: 'wide', lean: inn ? 1 : 0, T: AT('fwd', inn ? 1 : 0, 1), O: AT('fwd', inn ? 0 : -1, 1), tools: TL('ws_peel', 0, { bread: k !== 2 }),
        fx: inn ? [['glow', 'T', -6, -1, '#ffb040'], ['spark', 'T', -7, -3, '#ffd060']] : [['glow', 'T', -6, 0, '#ff9040']] };
    },
  },
  // 麦袋を持ち上げて漏斗へ注ぐ
  ws_pour: {
    durs: [320, 360, 360, 300],
    pose(v, k) {
      return [
        { legs: 'squat', lean: 1, T: AT('low'), O: AT('low', 1), tools: TL('ws_sack', 0) },
        { T: A(120, 140), O: A(110, 130), tools: TL('ws_sack', 0), face: { e: 'c' } },
        { T: A(140, 160), O: A(130, 150), tools: TL('ws_sack', 0), lean: 1, fx: [['dots', 'T', 1, 3, ['#e8d8a0', '#c8b070']]] },
        { T: A(130, 150), O: A(120, 140), tools: TL('ws_sack', 0), lean: 1, fx: [['dots', 'T', 1, 4, ['#e8d8a0', '#f0f0e8']], ['puff', 'T', 2, 6, '#f0ece0']] },
      ][k];
    },
  },
};

// 袋で運ぶ品か（麦・粉・穀物）
const SACK = new Set(['wheat', 'flour_wheat', 'seed_wheat']);
// 作る動き（職業ごと）
function makeAnim(sim, p) {
  switch (p.job) {
    case 'baker': return Math.floor((sim.S.t || 0) / 9) % 2 ? 'work:ws_bake' : 'work:knead';
    case 'miller': return 'work:ws_pour';
    case 'innkeeper': case 'hostkeeper': return 'work:stir';
    default: return 'work';
  }
}
// 人の状態 → 動き（personAnimState の頭で呼ばれる。null ならいつもどおり）
export function wsAnimState(sim, p, moving) {
  const a = p.action;
  if (!a || p.fight || !sim?.S) return null;
  const t = sim.S.t, w = p.wsAct;
  if (a.type === 'work') {
    if (!w || t >= w.until) return null;
    if (moving) return w.k === 'in' ? (SACK.has(w.g) ? (w.g === 'flour_wheat' ? 'work:ws_carryflour' : 'work:ws_carry') : 'work:ws_carrybox') : null;
    if (a.phase !== 'do') return null;
    if (w.k === 'in') return 'work:ws_haul';
    if (w.k === 'stock') return 'work:ws_stock';
    if (w.k === 'make') return makeAnim(sim, p);
    return null;
  }
  // 市場へ売りに行く：職場の蔵のあまりをかごに入れて運び出す
  if (a.type === 'sell' && moving && workplaceOf(sim, p) && wsCarrying(sim, p)) return 'work:ws_carryout';
  return null;
}

let done = false;
export function registerWsAnims() {
  if (done || !ANIM_EXT) return;
  done = true;
  Object.assign(ANIM_EXT.OBJ, OBJS);
  Object.assign(ANIM_EXT.WORK, WORKS);
  ANIM_EXT.STATE.push(wsAnimState);
}
registerWsAnims();
