// 恋と楽しみの場の、人の動き（ドット絵）― 開発部
//
// 社長の指示「この世界のすべての行動にはグラフィックを用意する。人物の動作はドット絵」に合わせ、
// 娯楽の動きを js/anim_people.js の仕組み（姿勢 → 4方向×コマのドット絵）で足す。
//   sing   歌う（胸に手を当て、もう片手を広げ、口を開けて音符が浮かぶ）         … 吟遊詩人の恋歌
//   clap   手をたたく（胸の前で手を合わせる・火花）                             … 芸・芝居・恋歌を見聞きする客
//   dice   賭け事（卓の上にサイコロを振る・銅貨）                               … 酒場の賭け事（finance.js）
//   bathe  湯に入る（腰を落として肩まで湯に浸かり、湯気が立つ・頬が赤い）       … 湯屋（buildings.js の bathe）
//   sweet  逢い引き（はにかんで手を振る・ハート）                               … 逢い引き
//   すでにある動き：楽器を弾く strum・踊る dance・喜ぶ cheer
// どの行動のときにどの動きにするかは leisureAnimState（anim_people.js の personAnimState から呼ばれる）。
// 歓楽の館の客は館の中にいて姿が見えないので、動きは作らない（露骨な描写はしない）。
//
// ■ 本体からの呼び方（anim_people.js に3行の入口を足す。patch_leisure.py）
//   anim_people.js：export function addWorkMotions / addAnimStateHook / POSE_KIT
//   leisuregfx.js が import './anim_leisure.js' する（読み込まれた時点で動きが登録される）
import { addWorkMotions, addAnimStateHook, POSE_KIT } from './anim_people.js';

const { A, AT, TL, MO, hands4 } = POSE_KIT;
const INK = ['#3a2a4a', '#8a2a6a'];

addWorkMotions({
  // 歌う：片手を胸に、もう片手を客へ広げる。口を大きく開け、音符が2色で交互に浮かぶ
  sing: hands4((v, k) => {
    if (v === 'B') return { dy: k & 1, fx: [['note', 'head', 3, -2 - (k & 1), INK[k >> 1]]] };
    return {
      T: AT('chest', 0, 0),
      O: k & 1 ? A(110, 135) : A(85, 105),
      lean: v === 'S' ? -(k & 1) : 0,
      face: { m: k & 1 ? 'O' : 'o', e: k === 2 ? 'c' : undefined },
      fx: [['note', 'head', 4, -1 - (k & 1) * 2, INK[k >> 1]], ...(k === 3 ? [['heart', 'head', -3, -3, '#ff8aa8']] : [])],
    };
  }, [280, 260, 320, 260]),
  // 手をたたく：胸の前で両手を合わせる（開く→合わせる）。合わせたコマに小さな火花
  clap: hands4((v, k) => {
    if (v === 'B') return { dy: k & 1, T: A(40, 70), O: A(40, 70) };
    const shut = k & 1;
    return {
      T: AT('chest', shut ? 0 : -1, shut ? -1 : 0),
      O: AT('chest', shut ? 0 : 1, shut ? -1 : 0),
      jump: k === 3 ? 1 : 0,
      face: { m: k === 3 ? 'O' : 's' },
      fx: shut ? [['spark', 'chest', 0, -3, '#fff4a0']] : [],
    };
  }, [150, 110, 150, 200]),
  // 賭け事：卓（酒場の3Dの丸卓）に向かって、サイコロを振る → 転がる → 銅貨を取る／くやしがる
  dice: hands4((v, k) => {
    if (v === 'B') return { dy: k & 1, T: A(60, 100), O: A(40, 80) };
    return [
      { lean: 1, T: A(70, 120), O: AT('fwd', 1, 2), face: { m: 's' } },
      { lean: 1, T: AT('fwd', 0, 2), O: AT('fwd', 1, 2), fx: [['dots', 'T', 2, 1, ['#f4f0e0', '#e8e0d0']]] },
      { lean: 1, T: AT('fwd', 0, 2), O: AT('fwd', 1, 2), face: { e: 'c' }, fx: [['dots', 'T', 3, 2, ['#f4f0e0', '#c8c0b0']]] },
      { T: AT('chest', 0, 0), O: A(150, 170), face: { m: 'O' }, fx: [['coin', 'O', 0, -2]] },
    ][k];
  }, [260, 180, 360, 420]),
  // 湯に入る：腰を落とし、手は湯の中。目を細め、頬が赤く、湯気が立ちのぼる（湯船は建物の中の3D）
  bathe: hands4((v, k) => ({
    legs: 'squat', dy: 2, headDy: k === 2 ? 1 : 0,
    T: AT('low', 0, -1), O: AT('low', 1, -1),
    face: { e: 'c', m: 's', blush: true },
    fx: [['puff', 'head', -2 + (k & 1), -3 - (k & 1), '#f0f0f4'], ['puff', 'head', 3, -5 + (k & 1), '#e4e4ea']],
  }), [520, 520, 520, 520]),
  // 逢い引き：はにかんで小さく手を振る。ときどきハート
  sweet: hands4((v, k) => ({
    O: k & 1 ? A(140, 150) : A(120, 170),
    T: AT('chest', 0, 1),
    headDy: k === 2 ? 1 : 0,
    face: { m: 's', blush: true, e: k === 2 ? 'c' : undefined },
    fx: k >= 2 ? [['heart', 'head', 3, -2 - (k & 1), '#ff6a8a']] : [],
  }), [300, 300, 380, 300]),
});

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };

// いまの行動 → 娯楽の動き（関係のない行動は null を返し、anim_people.js のいつもの決め方に任せる）
export function leisureAnimState(sim, p, a, kid) {
  if (!a || a.phase !== 'do') return null;
  const t = sim?.S?.t ?? 0;
  const lz = p.lz;
  const recent = (x, m = 60) => x != null && t - x < m;
  switch (a.type) {
    case 'ldance': return kid ? 'play' : 'work:dance';
    case 'ltryst': return 'work:sweet';
    case 'bathe': return 'work:bathe';
    case 'show': case 'watchplay': return kid ? 'cheer' : 'work:clap';
    case 'perform':
      if (p.job === 'dancer') return 'work:dance';
      if (p.job === 'bard') return hash(p.id + Math.floor(t / 20)) < 0.55 ? 'work:sing' : 'work:strum';
      return 'work:strum';
    case 'act': return hash(p.id + Math.floor(t / 15)) < 0.5 ? 'work:sing' : null;
    case 'tavern': {
      if (kid) return null;
      if (recent(lz?.danceT)) return 'work:dance';
      const h = sim.hour ? sim.hour() : 20;
      if (p.gamble?.last === sim.today && h >= 18 && hash(p.id * 3 + Math.floor(t / 25)) < 0.6) return 'work:dice';
      if (recent(lz?.songT, 40)) return 'work:clap';
      return null;
    }
    case 'festival':
      if (!kid && recent(lz?.danceT)) return 'work:dance';
      if (!kid && recent(lz?.songT, 40)) return 'work:clap';
      return null;
  }
  return null;
}
addAnimStateHook(leisureAnimState);
