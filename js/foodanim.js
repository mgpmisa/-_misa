// 保存食の工房と屋台・料理屋の人の動き（ドット絵。グラフィック部）
//
// 社長の指示：この世界のすべての行動には絵を用意する。人物の動作はドット絵。
// anim_people.js の仕組み（WORK の動き・OBJ の手に持つ小物・STATE の状態 → 動き）に足す。wsanim.js と同じ作り方。
//   work:fs_press      チーズ職人：型に入れた凝乳を両手で押して搾る（乳清がしたたる）
//   work:fs_hang       燻製職人：肉を持ち上げて煙の中の梁に吊るす（煙が上る）
//   work:fs_hangfish   燻製職人：魚を吊るす
//   work:fs_salt       塩漬け職人・塩焼き：鉢の塩をつまんでまく（白い粒が散る）
//   work:fs_grill      屋台の主：炭火の上で串をまわして焼く（火の粉と煙）
//   work:fs_serve      屋台の主・料理屋の主：料理の皿を客へ差し出す
//   work:fs_eatbowl    客：椀を持って匙で食べる（煮込み・麦粥）
//   work:fs_eatskewer  客：串焼き・焼き魚・パイをかじる
//   鍋をかき混ぜる動きは anim_people.js の stir（料理屋の主・塩焼き・チーズ職人の乳を温める）
// 人の状態は workshop.js の p.wsAct（運び込む・並べる）と、foodshop.js の食事の行動（dine）から決める。
import { ANIM_EXT, JOB_MOTION } from './anim_people.js';
import { DISHES } from './foodshop.js';

const A = (a, b, r) => ({ a, b: b ?? a, r: r ?? 1 });
const AT = (at, dx = 0, dy = 0, o) => ({ at, dx, dy, ...o });
const TL = (k, a, o) => ({ k, a, ...o });

// ---------- 手に持つ小物 ----------
const OBJS = {
  // チーズの型（木の輪に入った白い凝乳）
  fs_mould: (P, x, y, tl) => { P.rect(x - 2, y - 1, 5, 3, '#9a7040'); P.rect(x - 1, y - 2, 3, 1, tl.ph ? '#f4ecd0' : '#fff8e0'); P.px(x - 2, y + 2, '#6a4a28'); P.px(x + 2, y + 2, '#6a4a28'); },
  // 丸いチーズ（黄色い輪、切り口）
  fs_cheese: (P, x, y) => { P.rect(x - 2, y - 1, 4, 3, '#e8c040'); P.rect(x - 2, y - 1, 4, 1, '#f8e070'); P.px(x + 1, y, '#c89820'); P.px(x - 1, y + 1, '#c89820'); },
  // 燻製の肉（紐で吊るす骨つきの腿）
  fs_ham: (P, x, y) => { P.px(x, y - 3, '#d8c8a0'); P.px(x, y - 2, '#d8c8a0'); P.rect(x - 1, y - 1, 3, 3, '#8a3a24'); P.rect(x - 1, y - 1, 3, 1, '#b05a34'); P.px(x, y + 2, '#6a2a1a'); P.px(x, y + 3, '#e8e0c8'); },
  // 燻製の魚（尾を上に）
  fs_fish: (P, x, y) => { P.px(x, y - 3, '#d8c8a0'); P.px(x - 1, y - 2, '#b08a40'); P.px(x + 1, y - 2, '#b08a40'); P.rect(x - 1, y - 1, 2, 4, '#c89a50'); P.px(x, y, '#e0b870'); P.px(x - 1, y + 2, '#2a2a2a'); },
  // 塩の鉢（木の鉢に白い山）
  fs_saltbowl: (P, x, y) => { P.rect(x - 2, y, 4, 2, '#8a5a30'); P.rect(x - 1, y - 1, 3, 1, '#f8f8f8'); P.px(x, y - 2, '#ffffff'); },
  // 料理の皿（湯気の立つ椀、または串）
  fs_plate: (P, x, y, tl) => {
    P.rect(x - 2, y, 5, 1, '#e8e0d0'); P.rect(x - 1, y + 1, 3, 1, '#b8b0a0');
    if (tl.bowl) { P.rect(x - 1, y - 2, 3, 2, '#8a5a3a'); P.rect(x - 1, y - 2, 3, 1, tl.c || '#c87a3a'); }
    else { P.rect(x - 2, y - 1, 4, 1, '#9a6a3a'); P.px(x - 1, y - 2, tl.c || '#a0402a'); P.px(x + 1, y - 2, tl.c || '#a0402a'); }
  },
  // 串焼き（串に3切れ）
  fs_skewer: (P, x, y, tl) => { const c = tl.c || '#9a3a24'; P.px(x, y + 2, '#c8a870'); P.px(x, y + 1, '#c8a870'); P.px(x, y, c); P.px(x, y - 1, '#c8a870'); P.px(x, y - 2, c); P.px(x - 1, y - 2, c); P.px(x, y - 3, '#d8b890'); },
  // パイの切れ（三角）
  fs_pie: (P, x, y) => { P.rect(x - 1, y - 1, 3, 2, '#d8a050'); P.px(x - 1, y - 1, '#f0c070'); P.px(x + 1, y, '#8a3a24'); },
  // 匙
  fs_spoon: (P, x, y) => { P.px(x, y, '#c0c0c8'); P.px(x, y + 1, '#8a8a92'); P.px(x, y + 2, '#8a8a92'); },
};

// ---------- 動き ----------
const WORKS = {
  // チーズを搾る：型に手をかける → 体重をのせて押す（乳清がしたたる）→ 緩める → もう一度
  fs_press: {
    durs: [300, 380, 260, 380],
    pose(v, k) {
      const dn = k === 1 || k === 3;
      return { legs: 'wide', lean: dn ? 1 : 0, dy: dn ? 1 : 0, T: AT('belly', 1, dn ? 3 : 1), O: AT('belly', -1, dn ? 3 : 1), tools: TL('fs_mould', 0, { h: 'O', ph: dn ? 1 : 0 }), prop: 'table',
        face: dn ? { e: 'c', m: 'f' } : null, fx: dn ? [['dots', 'O', 0, 3, ['#f0f0e0', '#e0e8f0']]] : [] };
    },
  },
  // 肉を吊るす：足もとの肉を持つ → 頭の上へ → 梁に掛ける → 手を下ろす（煙が上る）
  fs_hang: {
    durs: [320, 300, 420, 300],
    pose(v, k) {
      const t = TL('fs_ham', 0);
      return [
        { legs: 'squat', lean: 1, T: AT('low'), O: AT('low', 1), tools: t },
        { T: A(120, 140), O: A(100, 120), tools: t, face: { e: 'c' } },
        { T: A(160, 175), O: A(150, 170), tools: t, dy: -1, fx: [['puff', 'T', 0, -3, '#b8b8c0'], ['puff', 'T', 2, -5, '#d0d0d8']] },
        { T: A(40, 60), O: A(20, 40), face: { m: 's' }, fx: [['puff', 'head', 1, -6, '#c8c8d0']] },
      ][k];
    },
  },
  fs_hangfish: {
    durs: [320, 300, 420, 300],
    pose(v, k) { const x = WORKS.fs_hang.pose(v, k); if (x.tools) x.tools = TL('fs_fish', 0); return x; },
  },
  // 塩をまく：鉢を抱え、手でつまんで振りまく
  fs_salt: {
    durs: [260, 220, 260, 240],
    pose(v, k) {
      const bowl = TL('fs_saltbowl', 0, { h: 'O' });
      return [
        { O: AT('belly', 0, -1), T: AT('belly', 0, -1), tools: bowl },
        { O: AT('belly', 0, -1), T: AT('chest', 1, 0), tools: bowl, face: { e: 'c' } },
        { O: AT('belly', 0, -1), T: AT('fwd', 1, 1), tools: bowl, fx: [['dots', 'T', 1, 2, ['#ffffff', '#e8eef8']]] },
        { O: AT('belly', 0, -1), T: AT('fwd', 0, 2), tools: bowl, lean: 1, fx: [['dots', 'T', 2, 4, ['#ffffff', '#dfe6f0']]] },
      ][k];
    },
  },
  // 串を焼く：炭火の上で串を返す（火の粉と煙）
  fs_grill: {
    durs: [240, 240, 240, 240],
    pose(v, k) {
      const t = TL('fs_skewer', 0);
      return { legs: 'wide', lean: 1, T: AT('fwd', k & 1 ? 1 : 0, 2), O: AT('fwd', -1, 2), tools: t, prop: 'pot', ph: k & 1,
        fx: [['glow', 'T', 0, 3, '#ff9040'], k & 1 ? ['spark', 'T', 1, 1, '#ffd060'] : ['puff', 'T', 0, -4, '#d8d8e0']] };
    },
  },
  // 料理を出す：皿を胸に → 前へ差し出す → 置く → 手を戻して笑う
  fs_serve: {
    durs: [280, 360, 300, 380],
    pose(v, k) {
      const t = TL('fs_plate', 0, { bowl: (Math.floor(Date.now() / 4000) & 1) === 1 });
      return [
        { T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools: t },
        { T: AT('fwd', 1, 1), O: AT('fwd', 0, 1), tools: t, lean: 1, face: { m: 's' } },
        { T: AT('fwd', 1, 2), O: AT('fwd', 0, 2), tools: t, lean: 1, dy: 1, fx: [['puff', 'T', 0, -3, '#e8e8ec']] },
        { T: A(30, 50), O: A(20, 40), face: { m: 's', e: 'c' } },
      ][k];
    },
  },
  // 客：椀を持ち、匙で口へ運ぶ
  fs_eatbowl: {
    durs: [320, 280, 300, 300],
    pose(v, k) {
      const tools = [TL('bowl', 0, { h: 'O' }), TL('fs_spoon', 0)];
      return [
        { T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools, fx: [['puff', 'O', 0, -3, '#e8e8ec']] },
        { T: AT('mouth', 0, 0, { late: true }), O: AT('chest', 0, 1), tools, face: { m: 'o' } },
        { T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools, face: { m: 'f' } },
        { dy: 1, T: AT('chest', 0, 1), O: AT('chest', 0, 1), tools, face: { m: 's', e: 'c' } },
      ][k];
    },
  },
  // 客：串焼き・焼き魚・パイをかじる
  fs_eatskewer: {
    durs: [340, 260, 320, 300],
    pose(v, k) {
      const t = TL('fs_skewer', 0);
      return [
        { T: AT('chest', 0, 0), O: AT('belly'), tools: t },
        { T: AT('mouth', 0, 0, { late: true }), O: AT('belly'), tools: t, face: { m: 'o' } },
        { T: AT('mouth', 0, 1, { late: true }), O: AT('belly'), tools: t, face: { m: 'f', e: 'c' } },
        { T: AT('chest', 0, 1), O: AT('belly'), tools: t, face: { m: 's' } },
      ][k];
    },
  },
  fs_eatpie: {
    durs: [340, 260, 320, 300],
    pose(v, k) { const x = WORKS.fs_eatskewer.pose(v, k); x.tools = TL('fs_pie', 0); return x; },
  },
};

const FS_JOB = new Set(['cheesemaker', 'smoker', 'salter', 'saltmaker', 'stallkeeper', 'chef']);
// 作る動き（職業ごと。時間で交互に）
function makeAnim(sim, p) {
  const t = Math.floor((sim.S.t || 0) / 8);
  const g = p.wsAct?.g || '';
  switch (p.job) {
    case 'cheesemaker': return t % 3 === 2 ? 'work:stir' : 'work:fs_press';                 // 乳を温めて混ぜる・型で搾る
    case 'smoker': return /fish/.test(g) || t % 2 ? 'work:fs_hangfish' : 'work:fs_hang';
    case 'salter': return 'work:fs_salt';
    case 'saltmaker': return t % 2 ? 'work:stir' : 'work:fs_salt';                         // 塩水を煮詰める・塩をかき集める
    case 'stallkeeper': return t % 3 === 2 ? 'work:fs_serve' : 'work:fs_grill';
    case 'chef': return t % 3 === 2 ? 'work:fs_serve' : 'work:stir';
    default: return null;
  }
}
// 人の状態 → 動き（wsanim.js より先に見る）
export function fsAnimState(sim, p, moving) {
  const a = p.action;
  if (!a || p.fight || !sim?.S) return null;
  if (a.type === 'dine') {
    if (moving || a.phase !== 'do' || !a.dish) return null;
    if (DISHES[a.dish]?.bowl) return 'work:fs_eatbowl';
    return /pie/.test(a.dish) ? 'work:fs_eatpie' : 'work:fs_eatskewer';
  }
  if (a.type !== 'work' || !FS_JOB.has(p.job) || moving || a.phase !== 'do') return null;
  const w = p.wsAct;
  if (w && sim.S.t < w.until && (w.k === 'in' || w.k === 'stock')) return null;   // 運び込む・並べるは wsanim.js
  return makeAnim(sim, p);
}

let done = false;
export function registerFsAnims() {
  if (done || !ANIM_EXT) return;
  done = true;
  Object.assign(ANIM_EXT.OBJ, OBJS);
  Object.assign(ANIM_EXT.WORK, WORKS);
  ANIM_EXT.STATE.unshift(fsAnimState);
  // 動きのシートの見本（ふだんの「仕事」の動き）
  Object.assign(JOB_MOTION, { cheesemaker: 'stir', smoker: 'smoke', salter: 'stir', saltmaker: 'stir', stallkeeper: 'serve', chef: 'stir' });
}
registerFsAnims();
