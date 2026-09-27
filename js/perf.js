// 軽量化の道具（技術部）
// 人口が1000〜5000人に増えても重くならないように、「全員をなめて近くの人を探す」処理を、
// 住人の居場所の升目（格子）と、建物ごと・町ごとの一覧で置き換える。
//
// ■ 住人の索引（はじめて使われたときに作り、最大8歩まで使い回す）
//   ・外にいる人の升目（4×4マス）、建物の中にいる人の一覧、町ごとの一覧を持つ。
//   ・作ったあとで動いた人・建物に出入りした人は、sim.step の住人の処理で pxTouch が「動いた人」に足すので、
//     結果は全員をなめたときと同じ（同じ人が、同じ順番＝sim.living() の順で返る）。
// ■ ほかに：人の LOD（personDt）、出会いの判定の間引き（encounterDt）、魔物のいる升目の下調べ（threatNear）、
//   1歩・1時間だけ使い回す一覧（stepCache・hourCache）
//   ・three.js を使わないので、node のヘッドレス試験でもそのまま読み込める。
// ■ 使い方
//   peopleNear(sim, x, z, r)      … 外にいて、(x,z) から縦横の距離の和が r 未満の人（sim.nearby と同じ条件）
//   peopleInside(sim, bid)        … 建物 bid の中にいる人
//   townPeople(sim, sid)          … 町 sid の人（q.s === sid）
//   pxBeginStep(sim) / pxTouch(sim, i, p) / pxEndLoop(sim) … sim.step から呼ぶ
const CELL = 4;          // 升目の大きさ（マス）
const MARGIN = 2;        // 索引を作ったあと、この距離より動いた人は「動いた人」として別に調べる
const MAX_AGE = 8;       // 索引は最大でこの歩数まで使い回す（動いた人が増えたら早めに作り直す）

function build(sim) {
  const L = sim.living(), n = L.length;
  const X = sim._px || (sim._px = {});
  X.L = L; X.n = n; X.valid = true; X.inLoop = X.inLoop || false; X.born = sim._pstep || 0;
  if (!X.xs || X.xs.length < n) { const cap = Math.ceil(n * 1.3) + 16; X.xs = new Float64Array(cap); X.zs = new Float64Array(cap); X.mark = new Uint32Array(cap); X.q = 0; }
  X.ins = new Array(n);
  X.grid = new Map(); X.bld = new Map(); X.town = null;
  X.extra = []; X.extraSet = new Set();
  const xs = X.xs, zs = X.zs, ins = X.ins, grid = X.grid, bld = X.bld;
  for (let i = 0; i < n; i++) {
    const p = L[i];
    const x = p.pos ? p.pos.x : 0, z = p.pos ? p.pos.z : 0;
    xs[i] = x; zs[i] = z; ins[i] = p.inside;
    if (p.inside != null) { let a = bld.get(p.inside); if (!a) bld.set(p.inside, a = []); a.push(i); }
    if (!p.inside) { const k = ((Math.floor(x / CELL) + 512) << 11) | (Math.floor(z / CELL) + 512); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
  }
  return X;
}

function idx(sim) {
  const X = sim._px;
  if (!X || !X.valid || X.L !== sim.living() || (sim._pstep || 0) - X.born > MAX_AGE || X.extra.length > 32 + (X.n >> 4)) return build(sim);
  return X;
}

// ---------- sim.step から ----------
// 索引は数歩のあいだ使い回す。そのあいだに動いた人・建物に出入りした人は、住人の処理のたびに pxTouch が
// 「動いた人」に足すので、探した結果は作り直したときと同じになる。
export function pxBeginStep(sim) { sim._pstep = (sim._pstep || 0) + 1; if (sim._px) sim._px.inLoop = true; }
export function pxEndLoop(sim) { if (sim._px) sim._px.inLoop = false; }
// people[i]（= sim.living()[i]）の処理が終わったあとに呼ぶ。索引を作ってから動いた・出入りした人を覚える
export function pxTouch(sim, i, p) {
  const X = sim._px;
  if (!X || !X.valid || i >= X.n || X.L[i] !== p) return;
  if (p.inside !== X.ins[i] || !p.pos || Math.abs(p.pos.x - X.xs[i]) > MARGIN || Math.abs(p.pos.z - X.zs[i]) > MARGIN) {
    if (!X.extraSet.has(i)) { X.extraSet.add(i); X.extra.push(i); }
  }
}

function collect(X, lists, out) {
  const mark = X.mark, q = ++X.q;
  if (q >= 0xfffffff0) { mark.fill(0); X.q = 1; }
  const qq = X.q;
  for (const a of lists) for (const i of a) if (mark[i] !== qq) { mark[i] = qq; out.push(i); }
  for (const i of X.extra) if (mark[i] !== qq) { mark[i] = qq; out.push(i); }
  out.sort((a, b) => a - b);
  return out;
}

// 外にいて、(x,z) から縦横の距離の和が r 未満の生きている人。except は除く。sim.living() の順
export function peopleNear(sim, x, z, r, except = null) {
  const X = idx(sim);
  const lists = [];
  const R = r + MARGIN;
  const cx0 = Math.floor((x - R) / CELL) + 512, cx1 = Math.floor((x + R) / CELL) + 512;
  const cz0 = Math.floor((z - R) / CELL) + 512, cz1 = Math.floor((z + R) / CELL) + 512;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const a = X.grid.get((cx << 11) | cz); if (a) lists.push(a); }
  const ids = collect(X, lists, []);
  const out = [];
  for (const i of ids) {
    const q = X.L[i];
    if (q === except || q.deathYear != null || q.inside || !q.pos) continue;
    if (Math.abs(q.pos.x - x) + Math.abs(q.pos.z - z) < r) out.push(q);
  }
  return out;
}

// 建物 bid の中にいる生きている人。sim.living() の順
export function peopleInside(sim, bid, except = null) {
  const X = idx(sim);
  const a = X.bld.get(bid);
  const ids = collect(X, a ? [a] : [], []);
  const out = [];
  for (const i of ids) { const q = X.L[i]; if (q !== except && q.deathYear == null && q.inside === bid) out.push(q); }
  return out;
}

// 町 sid の生きている人（索引を作った時点の町。歩のとちゅうで町を移った人は次の歩から）
export function townPeople(sim, sid) {
  const X = idx(sim);
  if (!X.town) { X.town = new Map(); for (const p of X.L) { let t = X.town.get(p.s); if (!t) X.town.set(p.s, t = []); t.push(p); } }
  return X.town.get(sid) || [];
}

// ---------- 1歩のあいだだけ使い回す一覧 ----------
// 同じ歩（同じ S.t）のあいだは同じ結果を返す。世帯の一覧のように、1歩のうちにはほとんど変わらないものに使う。
// 使う側は、取り出したあとにもう一度条件を確かめること（歩のとちゅうで変わった分を除くため）。
export function stepCache(sim, key, make) {
  const t = sim.S.t;
  const C = sim._stepCache || (sim._stepCache = { t: -1, m: new Map() });
  if (C.t !== t || C.S !== sim.S) { C.t = t; C.S = sim.S; C.m.clear(); }
  let v = C.m.get(key);
  if (v === undefined) { v = make(); C.m.set(key, v); }
  return v;
}
// 畑を8区画以上持つ世帯（小作料の納め先の候補）
// 1時間のあいだ使い回す一覧（使う側で条件を確かめ直す。1時間のうちに新しく加わった分は次の1時間から）
export function hourCache(sim, key, make) {
  const h = Math.floor(sim.S.t / 60);
  const C = sim._hourCache || (sim._hourCache = { h: -1, m: new Map() });
  if (C.h !== h || C.S !== sim.S || C.nh !== sim.S.nextHh) { C.h = h; C.S = sim.S; C.nh = sim.S.nextHh; C.m.clear(); }
  let v = C.m.get(key);
  if (v === undefined) { v = make(); C.m.set(key, v); }
  return v;
}
export function landlords(sim) {
  return hourCache(sim, 'landlords', () => Object.values(sim.S.households).filter((h) => h.land >= 4));
}
// 王家・貴族の世帯（町ごと。仕える仕事の相手）
export function lordHouseholds(sim) {
  return hourCache(sim, 'lords', () => {
    const S = sim.S, out = [];
    for (const h of Object.values(S.households)) if (h.royal || h.members.some((id) => S.people[id]?.rank === 'noble')) out.push(h);
    return out;
  });
}

// ---------- 住人の詳しさの段階（人の LOD） ----------
// カメラから遠い人は、毎歩ではなく数歩に1回、そのあいだの時間をまとめて進める。
//   ・眠っている（建物の中）…… 16歩に1回（8分ごと）。ただし朝（4〜12時）に眠りが足りてきた人は毎歩（起きる時刻を変えない）
//   ・落ち着いた行動を続けている（働く・休む・祈る・学ぶ…）…… 8歩に1回（4分ごと）
//   ・そのほか（歩く・考える・ほかの行動）…… 3歩に1回（1分半ごと）
//   ・急ぐ行動（逃げる・助けに行く・知らせる・戦いに行く・依頼・狩り・盗み）…… 毎歩
// 時間は飛ばさずに持ち越すので、欲求の減り方・仕事の量・眠りの長さ・歩く速さは変わらない。
// 行動の終わる時刻と、次の行動を選ぶ時刻が最大で数分ずれるだけ。
// 会話中・戦闘中・任務中の人、カメラの近く（見えている範囲＋10マス）の人・選ばれている人は、いつも毎歩。
// ヘッドレス（カメラ無し）では、全員が「カメラから遠い人」になる。
// S.settings.lod を false にすると切れる（lod.js と同じ切り替え）。
import { W as WORLD_W } from './world.js';
const CALM = new Set(['sleep', 'work', 'home', 'rest', 'tavern', 'pray', 'school', 'eat', 'jail', 'nap', 'cook', 'preserve', 'train']);
const URGENT = new Set(['flee', 'rescue', 'alert', 'defend', 'march', 'crusade', 'quest', 'hunt', 'steal', 'rob', 'fight']);
function plodOn(sim) { const s = sim.S.settings?.lod; return s == null ? WORLD_W > 200 : !!s; }
export function watchedNear(sim, p) {
  const f = sim.focus;
  if (!f) return false;
  if (f.ids && f.ids.has(p.id)) return true;
  return Math.abs(p.pos.x - f.x) < f.r + 10 && Math.abs(p.pos.z - f.z) < f.r + 10;
}
// この歩で p（= people[pi]）を進める時間（分）。0 なら今回は進めない（時間は次に持ち越す）。
// 次に進める歩と持ち越しの時間は、sim.living() の並びの番号で配列に持つ（毎歩の見送りを軽くするため）。
function plState(sim, people) {
  let PL = sim._pl;
  if (PL && PL.L === people) return PL;
  const n = people.length, carry = new Map();
  if (PL) for (let i = 0; i < PL.L.length; i++) if (PL.owe[i]) carry.set(PL.L[i].id, PL.owe[i]);
  PL = sim._pl = { L: people, due: new Int32Array(n), owe: new Float64Array(n) };
  if (carry.size) for (let i = 0; i < n; i++) { const o = carry.get(people[i].id); if (o) PL.owe[i] = o; }
  return PL;
}
export function personDt(sim, p, dt, pi, people) {
  const PL = plState(sim, people);
  const step = sim._pstep || 0;
  // 見送り中：会話や戦いが始まっていなければ、そのまま見送る
  if (PL.due[pi] > step && !p.talk && !p.fight) { PL.owe[pi] += dt; return 0; }
  PL.due[pi] = 0;
  if (plodOn(sim) && !p.talk && !p.fight && !p.mission && p.pos && !watchedNear(sim, p)) {
    const a = p.action;
    let per = 3;
    if (a && URGENT.has(a.type)) per = 1;
    else if (a && a.phase === 'do' && CALM.has(a.type)) per = a.type === 'sleep' && p.inside != null ? 16 : 8;
    // 朝（4〜12時。その少し前から）に眠りが足りた人は、目覚めの判定（sim.js の wakeEarly）を毎歩行う。起きる時刻が遅れないように
    if (a && a.type === 'sleep' && p.needs.sleep >= 90) { const h = sim.hour(); if (h > 3.7 && h < 12) per = 1; }
    const m = per > 1 ? (step + (p.id | 0)) % per : 0;
    if (m !== 0) { PL.due[pi] = step + (per - m); PL.owe[pi] += dt; return 0; }
  }
  const d = dt + PL.owe[pi];
  PL.owe[pi] = 0;
  return d;
}

// 出会い（会話の始まり）の判定を、広い世界では3歩に1回、3歩分の時間でまとめて行う。
// 会話が始まる確率は時間に比例しているので、1時間あたりの会話の数は変わらない。0 なら今回は判定しない
export function encounterDt(sim, dt) {
  sim._encOwe = (sim._encOwe || 0) + dt;
  if (plodOn(sim) && (sim._pstep || 0) % 3 !== 0) return 0;
  const d = sim._encOwe; sim._encOwe = 0;
  return d;
}

// ---------- 魔物・猛獣がいる升目（spotThreats の下調べ） ----------
// 生き物の升目（sim._cgrid、8×8マス）のうち、人が怖がりうる生き物（敵意のある魔物・猛獣）がいる升目の一覧。
// 升目が作り直されるたび（1歩に1回）に作り直す。近くのどの升目にもいなければ、1匹ずつ調べなくてよい。
const SCARY_SP = new Set(['wolf', 'bear', 'tiger', 'polarbear', 'croc']);
function threatSet(grid) {
  if (grid._threat) return grid._threat;
  const s = new Set();
  const scan = (m) => { for (const [k, a] of m) for (const c of a) if ((c.hostile || SCARY_SP.has(c.sp)) && !c.dormant && c.hp > 0) { s.add(k); break; } };
  scan(grid);
  if (grid.far) scan(grid.far);
  grid._threat = s;
  return s;
}
export function threatNear(grid, x, z, r) {
  const s = threatSet(grid);
  if (!s.size) return false;
  const cx0 = Math.floor((x - r) / 8), cx1 = Math.floor((x + r) / 8), cz0 = Math.floor((z - r) / 8), cz1 = Math.floor((z + r) / 8);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (s.has((cx << 8) | cz)) return true;
  return false;
}

// ---------- 続柄の下調べ ----------
// 亡くなった人 dead と続柄（kinTerm）がありうる人かどうかを、祖先の一覧（覚えてある）だけで素早く見分ける関数を返す。
// false の人は kinTerm が必ず null になる（配偶者・元配偶者・祖先と子孫・共通の祖先を持つ人・義理の親子だけが続柄を持つため）。
export function kinFilter(sim, dead) {
  const deadAnc = sim.ancestors(dead);
  return (q) => {
    if (q.spouseId === dead.id || q.exSpouses?.[q.exSpouses.length - 1] === dead.id || deadAnc.has(q.id)) return true;
    if (dead.spouseId === q.id) return true;
    if (q.spouseId != null) { const sp = sim.S.people[q.spouseId]; if (sp && (sp.fatherId === dead.id || sp.motherId === dead.id)) return true; }
    const qa = sim.ancestors(q);
    if (qa.has(dead.id)) return true;
    if (deadAnc.size < qa.size) { for (const id of deadAnc.keys()) if (qa.has(id)) return true; }
    else for (const id of qa.keys()) if (deadAnc.has(id)) return true;
    return false;
  };
}
