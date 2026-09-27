// 裁きと刑場の人の動き（ドット絵）
// 社長の決まり：「すべての行動にグラフィックを用意する。人物の動作はドット絵、それ以外は3D」。
// anim_people.js の姿勢の書き方（legs・腕の角度 A・手の置き場 AT・道具 TL・表情 face・効果 fx）で、次の動きを足す。
//   escorted  … 連行：手を前で縛られ、うつむいて歩く（牢から裁きの場・刑場へ引き立てられるとき）
//   plead     … 裁きの場：ひざまずき、手を胸の前で合わせて言い渡しを聞く
//   judge     … 裁く人：片手を前へ差し出して刑を言い渡す
//   condemned … 刑場：処刑台の上でひざまずき、うなだれる
//   flinch    … むち打ち：縛られて立ち、打たれるたびに身をすくめる（傷や血は描かない）
//   jeer      … 群衆：こぶしを振り上げてはやし立てる（大人向けの設定が有効なときだけ）
//   shock     … 群衆：口もとを手でおおい、身を引く
// 読み上げ役は既存の「巻物を読む」、処刑人は「綱を引く（鐘）」、衛兵は「見張り」、見物人は「額に手をかざす」を使う。
// 刑の執行そのものは、render.js の「死ぬ」動き（倒れて横たわる）をそのまま使い、残酷な描写はしない。
// render.js・sim.js からは何も呼ばない。main.js が読み込むだけで、anim_people.js に動きと判定が登録される。
import { registerPersonAnims, ANIM_STATE_HOOKS } from './anim_people.js';

registerPersonAnims(({ A, AT, MO }) => ({
  escorted: {
    durs: [200, 160, 200, 160],
    pose: (v, k) => ({ legs: ['w0', 'stand', 'w2', 'stand'][k], headDy: 1, lean: v === 'S' ? 1 : 0, T: AT('belly'), O: AT('belly', 1, 0), item: false, face: { e: k === 3 ? 'c' : undefined } }),
  },
  plead: {
    durs: [700, 500, 700, 400],
    pose: (v, k) => ({ legs: 'kneel2', headDy: k === 3 ? 1 : 0, lean: v === 'S' ? (k === 3 ? 2 : 1) : 0, dy: k === 1 ? 1 : 0, T: AT('chest', 0, -1), O: AT('chest', 1, -1), item: false, face: k === 1 ? MO : k === 3 ? { e: 'c' } : null }),
  },
  judge: {
    durs: [500, 420, 600, 700],
    pose: (v, k) => [
      { T: AT('chest'), O: A(70, 80), face: MO },
      { T: AT('chest'), O: A(95, 90), face: { m: 'O' }, lean: v === 'S' ? 1 : 0 },
      { T: AT('chest'), O: A(100, 110), face: MO, lean: v === 'S' ? 1 : 0 },
      { T: AT('chest'), O: A(25), face: null },
    ][k],
  },
  condemned: {
    durs: [1100, 800, 1100],
    pose: (v, k) => ({ legs: 'kneel2', lean: v === 'S' ? 2 : 1, headDy: 1, dy: k === 1 ? 1 : 0, T: AT('belly'), O: AT('belly', 1, 0), item: false, face: { e: 'c' } }),
  },
  flinch: {
    durs: [700, 140, 420, 500],
    pose: (v, k) => [
      { headDy: 1, T: AT('belly'), O: AT('belly', 1, 0), item: false, face: { e: 'c' } },
      { lean: v === 'S' ? -1 : 0, dy: 1, T: AT('belly'), O: AT('belly', 1, 0), item: false, white: 0.35, face: { e: 'c', m: 'O' }, fx: [['sweat', 'head']] },
      { headDy: 1, dy: 1, T: AT('belly'), O: AT('belly', 1, 0), item: false, face: { e: 'c', m: 'f' } },
      { headDy: 1, T: AT('belly'), O: AT('belly', 1, 0), item: false, face: { e: 'c' } },
    ][k],
  },
  jeer: {
    durs: [220, 220, 260, 300],
    pose: (v, k) => [
      { T: A(20), O: A(165, 175), face: { m: 'O' } },
      { T: A(20), O: A(140, 155), face: { m: 's' }, dy: 1 },
      { T: A(25), O: A(170, 178), face: { m: 'O' }, jump: 1 },
      { T: A(20), O: A(60, 80), face: { m: 's' } },
    ][k],
  },
  shock: {
    durs: [500, 400, 600, 400],
    pose: (v, k) => ({ lean: v === 'S' ? -1 : 0, dy: k & 1, T: AT('mouth', 0, 0, { late: true }), O: AT('mouth', 1, 0, { late: true }), item: false, face: { e: k >= 2 ? 'c' : undefined, m: 'O' } }),
  },
}));

const hash = (id) => ((id * 2654435761) >>> 0) % 100;
function execOf(sim, p) {
  const ex = sim?.S?.justice?.execs;
  if (!ex) return null;
  for (const e of ex) if (e.roles?.[p.id] || e.crowd?.includes?.(p.id)) return e;
  return null;
}
// いまの行動 → 動き（anim_people.js の personAnimState の最初に呼ばれる）
export function justiceAnimState(sim, p, moving) {
  const a = p.action;
  if (!a) return null;
  const t = a.type;
  if (t === 'scaffold' || t === 'dock' || t === 'pillory') return moving || a.phase !== 'do' ? 'escorted' : t === 'dock' ? 'plead' : t === 'pillory' ? 'flinch' : 'condemned';
  if (moving || a.phase !== 'do') return null;
  if (t === 'judgeseat') return 'judge';
  if (t !== 'execduty' && t !== 'execwatch') return null;
  const e = execOf(sim, p);
  const role = e?.roles?.[p.id];
  if (role === 'herald') return 'work:scroll';
  if (role === 'exec') return 'work:rope';
  if (role === 'judge') return 'judge';
  if (role === 'guard') return 'work:guard';
  const h = hash(p.id), pe = p.pers || { N: 0.5, A: 0.5, O: 0.5 }, faith = p.values?.faith ?? 0.5;
  const mature = sim?.S?.settings?.matureCrimes !== false;
  if (!e || e.stage === 'done') {
    // 刑のあと：ざわめき・祈り・涙
    if (sim?.hh && sim.hh(p)?.jsShame === sim.today) return 'cry';
    if (pe.N > 0.55 && pe.A > 0.45) return 'shock';
    if (faith > 0.6 || h < 25) return 'pray';
    return h < 60 ? 'work:lookout' : 'idle';
  }
  // 刑の前：見物
  if (pe.N > 0.6 && pe.A > 0.5) return 'shock';
  if (mature && pe.A < 0.3 && h < 55) return 'jeer';
  if (faith > 0.7 && h < 40) return 'pray';
  return h < 60 ? 'work:lookout' : h < 80 ? 'talk' : 'idle';
}
ANIM_STATE_HOOKS.push(justiceAnimState);
