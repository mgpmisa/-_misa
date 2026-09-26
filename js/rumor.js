// 噂の尾ひれ
// 会話で噂が人から人へ伝わるたびに、話し手の性格によって少しずつ大げさになる。
// ときどき主語（誰の話か）も取り違える。本人や目撃者と話すと本当の話に戻る。
//
// 噂（gossip の g）に r = { hops, mag, truth, subj, emo, origin, town } を持たせる。
//   hops  … 何人の口を経たか（目撃者は 0）
//   mag   … 大げささ（0 = 本当の話、最大 3）
//   truth … 元の話（pred）
//   subj  … 本当の主語（人のid）
//   emo   … 元の感情の強さ
//   origin… 噂が生まれた町
//   town  … この版が語られた町
// g.key は元の噂と同じまま（知っている／知らないの判定 gk がそのまま使える）。
// 古いセーブの噂（r が無い）は「本当の話・hops 0」とみなす。

const MAX_MAG = 3;

// 文字列から決まった数を作る（町ごとに言い回しがそろうように）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pickBy = (arr, seed) => arr[seed % arr.length];
const stripRashii = (s) => s.replace(/らしい$/, '');

// ---- 言い換え表 ----
// re に合った話を、mag（1〜3）に応じて言い換える。各段に複数の言い方があり、町ごとに選ばれる。
export const EXAGGERATIONS = [
  { re: /^(.+)と大声で言い争っていた$/, lv: [
    ['$1とつかみ合いのけんかをしていた', '$1と取っ組み合いのけんかをしていた'],
    ['$1と殴り合いの大げんかをして、衛兵が止めに入った', '$1と酒場で大乱闘を起こした'],
    ['$1と刃物を持ち出す大乱闘を起こした', '$1と大乱闘を起こして、店をひとつ壊した'],
  ] },
  { re: /^(.+)を倒した$/, lv: [
    ['$1を何匹も倒した', '$1を三匹まとめて倒した'],
    ['$1の群れをひとりで蹴散らした', '$1の群れを打ち破った'],
    ['$1の大軍をたったひとりで退けた', '$1の親玉を討ち取った'],
  ] },
  { re: /^酒場で(.+)$/, lv: [
    ['酒場で酔って大騒ぎした', '酒場で酔っぱらって朝まで騒いだ'],
    ['酒場で酒樽を三つも空けた', '酒場で酔って客に片っぱしからけんかを売った'],
    ['酒場で酔って暴れ、店を出入り禁止になった', '三日三晩、酒場で飲み続けて倒れた'],
  ] },
  { re: /^(\d+)銅貨で家を買い取った$/, lv: [
    [(m) => `${Math.round(m[1] * 2)}銅貨で家を買い取った`],
    [(m) => `${Math.round(m[1] * 5)}銅貨で大きな家を買い取った`, () => '金貨を積んで屋敷を買い取った'],
    [() => '通りの家を丸ごと買い占めた', () => '貴族の屋敷を買い取ったらしい'],
  ] },
  { re: /^鉱山で宝石を掘り当てた$/, lv: [
    ['鉱山でこぶし大の宝石を掘り当てた', '鉱山で宝石をいくつも掘り当てた'],
    ['鉱山で宝石の鉱脈を掘り当てた', '鉱山で王冠に使うほどの宝石を掘り当てた'],
    ['鉱山で一生遊んで暮らせるほどの宝石を掘り当てた', '鉱山で竜の卵ほどの宝石を掘り当てた'],
  ] },
  { re: /^(.+)で「(.+)」を見つけた$/, lv: [
    ['$1で「$2」と金貨の袋を見つけた', '$1で「$2」をいくつも見つけた'],
    ['$1で伝説の「$2」を見つけた', '$1で山ほどの財宝を見つけた'],
    ['$1で古の王の財宝をまるごと見つけた', '$1で呪われた宝を持ち帰った'],
  ] },
  { re: /^盗みを働いたらしい$/, lv: [
    ['何度も盗みを働いているらしい', '店の売り上げを盗んだらしい'],
    ['盗賊団の手先らしい', '町じゅうの家から盗んでいるらしい'],
    ['盗賊団の頭らしい', '王家の宝物庫に忍び込んだらしい'],
  ] },
  { re: /^(.+)を殴り倒したらしい$/, lv: [
    ['$1を半殺しにしたらしい', '$1を殴って骨を折ったらしい'],
    ['$1とその仲間を叩きのめしたらしい', '$1を殴って三日も寝込ませたらしい'],
    ['町の若い衆を五人まとめて叩きのめしたらしい', '衛兵まで殴り倒したらしい'],
  ] },
  { re: /^(.+)を殺したらしい$/, lv: [
    ['$1を闇討ちにしたらしい', '$1をむごたらしく殺したらしい'],
    ['$1のほかにも人を殺しているらしい', '$1の一家を皆殺しにしたらしい'],
    ['魔王の手先で、何人も殺しているらしい', '$1を殺して、その血を飲んだらしい'],
  ] },
  { re: /^(.+)の罪で捕まった$/, lv: [
    ['$1の罪で捕まり、鎖につながれた', '$1の罪で捕まった。余罪もあるらしい'],
    ['$1の罪で捕まった。余罪が山ほどあるらしい', '$1の罪で、牢の奥深くに放り込まれた'],
    ['$1の罪で縛り首になるらしい', '$1の罪で、国外追放になるらしい'],
  ] },
  { re: /^家賃が払えず家を追い出された$/, lv: [
    ['借金まみれで家を追い出された', '家賃をため込んで追い出された'],
    ['借金取りに追われて夜逃げした', '家財を全部差し押さえられた'],
    ['借金のかたに家財も名前も取られたらしい', '借金を踏み倒して行方をくらましたらしい'],
  ] },
  { re: /^(.+)の名人と呼ばれるようになった$/, lv: [
    ['町一番の$1と呼ばれている', '$1の名人として評判になった'],
    ['大陸一の$1と呼ばれている', '$1の腕を見込まれて王都に招かれるらしい'],
    ['$1の腕で王さまから勲章をもらうらしい', '伝説の$1の生まれ変わりだと言われている'],
  ] },
  { re: /^(.+)と婚約した$/, lv: [
    ['$1と婚約した。式は盛大にやるらしい', '$1とひそかに婚約していた'],
    ['$1と駆け落ち同然で婚約した', '$1と婚約した。持参金が金貨百枚らしい'],
    ['$1とのあいだに、もう子どもがいるらしい', '$1と婚約して、王都で式を挙げるらしい'],
  ] },
  { re: /^(.+)と結婚した$/, lv: [
    ['$1と盛大な式を挙げた', '$1と結婚した。三日続く宴だったらしい'],
    ['$1と結婚した。村じゅうが酔いつぶれたらしい', '$1と結婚して、大きな家を建てるらしい'],
    ['$1と結婚した。王さまから祝いの品が届いたらしい', '$1と結婚した。実は二度目の結婚らしい'],
  ] },
  { re: /^(.+)との身分違いの恋を反対されたらしい$/, lv: [
    ['$1との恋を親に猛反対されたらしい', '$1とこっそり会っているらしい'],
    ['$1と駆け落ちしようとしたらしい', '$1と夜中に町を抜け出そうとしたらしい'],
    ['$1と駆け落ちしたらしい', '$1の家と決闘沙汰になったらしい'],
  ] },
  { re: /^おめでたらしい$/, lv: [
    ['おめでたらしい。もうすぐらしい', 'おめでたらしい。男の子だそうだ'],
    ['双子を身ごもったらしい', 'おめでたらしい。占い師によると大物になるらしい'],
    ['三つ子を身ごもったらしい', 'おめでたらしい。父親は別の人らしい'],
  ] },
  { re: /^(.+)という(男の子|女の子)を産んだ$/, lv: [
    ['$1という、まるまる太った$2を産んだ', '$1という、元気な$2を産んだ'],
    ['$1という$2を産んだ。生まれてすぐ笑ったらしい', '双子を産んだらしい'],
    ['$1という$2を産んだ。額に星のしるしがあるらしい', '$1という$2を産んだ。勇者の生まれ変わりらしい'],
  ] },
  { re: /^(.+)から越してきたらしい$/, lv: [
    ['$1から逃げてきたらしい', '$1から夜逃げしてきたらしい'],
    ['$1でお尋ね者だったらしい', '$1で没落した貴族の出らしい'],
    ['$1で何かやらかして追われているらしい', '$1の王家の隠し子らしい'],
  ] },
  { re: /^新しい家具を買った$/, lv: [
    ['家具を丸ごと買い替えた', '高そうな家具を買いそろえた'],
    ['貴族みたいな家具をそろえたらしい', 'どこかで大金を手に入れたらしい'],
    ['金の椅子を買ったらしい', '隠し財産があるらしい'],
  ] },
  { re: /^(.+)の見習いを始めた$/, lv: [
    ['$1の見習いを始めた。筋がいいらしい', '$1の見習いを始めた。親方に気に入られたらしい'],
    ['$1の見習いで、もう親方を追い抜いたらしい', '$1の見習いを始めた。天才らしい'],
    ['$1の見習いのくせに、王さまに呼ばれたらしい', '$1の見習いで、もう弟子がいるらしい'],
  ] },
  // これから足される「病」の噂にも備える
  { re: /^(.*)病(気)?に(かかった|なった)(らしい)?$/, lv: [
    ['$1重い病にかかったらしい', '$1病で寝込んでいるらしい'],
    ['流行り病にかかったらしい', '$1病で、もう長くないらしい'],
    ['流行り病を町に持ち込んだらしい', '流行り病で家族みんな倒れたらしい'],
  ] },
];

// 表に無い話の言い換え（どんな述語にもつながる形）
function fallback(truth, mag, emo, seed) {
  const base = stripRashii(truth);
  if (mag === 1) return pickBy([`${base}らしい`, `どうやら${base}らしい`], seed);
  const good = emo >= 0;
  if (mag === 2) return pickBy(good
    ? [`${base}うえに、町の顔役に褒められたらしい`, `${base}うえに、祝いの宴まで開いたらしい`]
    : [`${base}うえに、ほかにも悪さをしているらしい`, `${base}うえに、謝りもしなかったらしい`], seed);
  return pickBy(good
    ? [`${base}うえに、王さまから褒美までもらったらしい`, `${base}うえに、吟遊詩人が歌にしたらしい`]
    : [`${base}うえに、町じゅうの鼻つまみ者らしい`, `${base}うえに、呪いまでかけられたらしい`], seed);
}

// 元の話と大げささから、語られる文を作る
export function exaggerate(truth, mag, emo = 0, seed = 0) {
  if (!mag) return truth;
  mag = Math.min(MAX_MAG, mag);
  for (const rule of EXAGGERATIONS) {
    const m = truth.match(rule.re);
    if (!m) continue;
    const opt = pickBy(rule.lv[mag - 1], seed);
    if (typeof opt === 'function') return opt(m);
    return opt.replace(/\$(\d)/g, (_, i) => m[+i] ?? '');
  }
  return fallback(truth, mag, emo, seed);
}

// 噂の出自情報（無ければ作る）
export function rumorInfo(sim, g) {
  if (g.r) return g.r;
  const subj = sim.S.people[g.subj];
  return { hops: 0, mag: 0, truth: g.pred, subj: g.subj, emo: g.emo, origin: subj ? subj.s : null, town: subj ? subj.s : null };
}

// sim.gossip の直後に呼ぶ：噂の生まれ（目撃者はみな本当の話を持つ）
// witnesses が多い（町じゅうに知れ渡った）ときは「目撃者」ではなく「町の噂」として扱う
export function rumorBirth(sim, g, subj, witnesses) {
  if (!g || g.r) return g;
  g.r = { hops: 0, mag: 0, truth: g.pred, subj: subj.id, emo: g.emo, origin: subj.s, town: subj.s };
  if (witnesses && witnesses.length > 15) g.r.wide = 1;
  return g;
}

function isTrueVersion(g) {
  const r = g.r;
  return !r || (r.mag === 0 && g.subj === r.subj);
}

// 主語の取り違え：本当の主語の家族か、話し手の知り合い（同じ性別）に
function swapSubject(sim, from, g, r) {
  const S = sim.S, R = sim.rng;
  const real = S.people[r.subj];
  if (!real) return null;
  const cands = [];
  const ok = (q) => q && q.deathYear == null && q.id !== real.id && q.id !== from.id && !g.pred.includes(q.given) && !r.truth.includes(q.given);
  const hh = S.households[real.hh];
  if (hh) for (const id of hh.members) { const q = S.people[id]; if (ok(q) && sim.ageOf(q) >= 14) cands.push(q); }
  const known = Object.keys(from.rel || {});
  for (let i = 0; i < 6 && known.length; i++) {
    const q = S.people[known[(R.next() * known.length) | 0]];
    if (ok(q) && q.sex === real.sex && q.s === real.s && sim.ageOf(q) >= 14) cands.push(q);
  }
  return cands.length ? R.pick(cands) : null;
}

// 会話で噂が from から to へ伝わるときに呼ぶ。to が覚える新しい版（g2）を返す。
export function rumorRelay(sim, from, to, g) {
  const R = sim.rng;
  const r0 = rumorInfo(sim, g);
  const P = from.pers || { E: 0.5, N: 0.5, C: 0.5, A: 0.5, O: 0.5 };
  const firsthand = r0.hops === 0 && !r0.wide && isTrueVersion(g);
  const crossTown = to.s !== r0.town;
  // 大げさにする確率：外向的・神経質・想像力が強いほど高く、きちょうめんなほど低い
  let pUp = 0.08 + P.E * 0.3 + P.N * 0.22 + P.O * 0.1 - P.C * 0.2 + (crossTown ? 0.15 : 0);
  if (firsthand) pUp *= 0.4;
  pUp = Math.max(0.03, Math.min(0.75, pUp));
  let mag = r0.mag;
  if (R.chance(pUp)) mag = Math.min(MAX_MAG, mag + 1);
  else if (mag > 0 && P.C > 0.7 && R.chance(0.25)) mag--; // きちょうめんな人は控えめに言い直す
  const r = { hops: r0.hops + 1, mag, truth: r0.truth, subj: r0.subj, emo: r0.emo, origin: r0.origin, town: to.s };
  let subj = g.subj;
  const pSwap = 0.025 + (1 - P.C) * 0.05 + (r.hops > 2 ? 0.03 : 0);
  if (R.chance(pSwap)) { const q = swapSubject(sim, from, g, r); if (q) subj = q.id; }
  // 同じ町・同じ大げささなら、言い回しもそろう（町ごとの「版」ができる）
  const seed = hash(`${g.key}|${to.s}|${mag}`);
  const pred = mag === r0.mag && to.s === r0.town ? g.pred : exaggerate(r.truth, mag, r.emo, seed);
  const emo = Math.max(-1, Math.min(1, r.emo * (1 + mag * 0.25)));
  return { ...g, subj, pred, emo, r };
}

// 覚える文（endTalk の remember 用）
export function rumorHeardText(sim, from, g2) {
  const subj = sim.S.people[g2.subj];
  return `${from.given}から、${subj ? subj.given : '誰か'}が${g2.pred}と聞いた`;
}

// 会話の終わりに呼ぶ：本人や目撃者と話すと、尾ひれのついた噂が本当の話に戻る。
// 直った件数の一覧を返す（ログに出すかは呼ぶ側が決める）
export function rumorCorrect(sim, a, b) {
  const fixed = [];
  for (const [x, y] of [[a, b], [b, a]]) {
    if (!x.memories || !y.memories) continue;
    let yTrue = null;
    for (const m of x.memories) {
      const g = m.g;
      if (!g || !g.r || isTrueVersion(g)) continue;
      if (!yTrue) { yTrue = new Set(); for (const ym of y.memories) if (ym.g && isTrueVersion(ym.g) && (!ym.g.r || (ym.g.r.hops === 0 && !ym.g.r.wide) || ym.g.r.fixed)) yTrue.add(ym.g.key); }
      // 本人（取り違えられた人も含む）ならまず直る。目撃者や、すでに本当の話を知る人なら半々
      const self = y.id === g.r.subj || (y.id === g.subj && g.subj !== g.r.subj);
      if (!(self ? sim.rng.chance(0.9) : yTrue.has(g.key) && sim.rng.chance(0.5))) continue;
      const subj = sim.S.people[g.r.subj];
      if (!subj) continue;
      const wrongWho = g.subj !== g.r.subj ? sim.S.people[g.subj] : null;
      m.g = { ...g, subj: g.r.subj, pred: g.r.truth, emo: g.r.emo, r: { ...g.r, mag: 0, fixed: 1 } };
      m.txt = `${subj.given}が${g.r.truth}（${y.given}に聞いたら、噂は${wrongWho ? `${wrongWho.given}の話とすり替わっていた` : '大げさだった'}）`;
      m.emo *= 0.6;
      fixed.push({ who: x.id, by: y.id, key: g.key, was: g.pred, truth: g.r.truth, subj: subj.id });
    }
  }
  return fixed;
}

// ---- 観察用 ----
// ある噂（key）が、いま町ごとにどう語られているか
export function rumorVersions(sim, key) {
  const S = sim.S, towns = {};
  let truth = null;
  for (const p of sim.living()) {
    if (!p.memories) continue;
    for (const m of p.memories) {
      if (!m.g || m.g.key !== key) continue;
      const r = rumorInfo(sim, m.g);
      truth = truth || { subj: S.people[r.subj]?.given, text: r.truth };
      const t = towns[p.s] || (towns[p.s] = { town: sim.town(p.s)?.name ?? String(p.s), versions: {} });
      const who = S.people[m.g.subj]?.given ?? '？';
      const text = `${who}が${m.g.pred}`;
      const v = t.versions[text] || (t.versions[text] = { text, count: 0, mag: r.mag, maxHops: 0, wrongSubj: m.g.subj !== r.subj });
      v.count++; v.maxHops = Math.max(v.maxHops, r.hops);
    }
  }
  return {
    key, truth: truth ? `${truth.subj}が${truth.text}` : null,
    towns: Object.values(towns).map((t) => ({ town: t.town, versions: Object.values(t.versions).sort((x, y) => y.count - x.count) })),
  };
}

// いま広まっている噂の一覧（版の数が多い順）。UI の「噂」欄用
export function rumorList(sim, limit = 10, days = 12) {
  const S = sim.S, map = new Map();
  for (const p of sim.living()) {
    if (!p.memories) continue;
    for (const m of p.memories) {
      if (!m.g || sim.today - m.t > days) continue;
      const r = rumorInfo(sim, m.g);
      let e = map.get(m.g.key);
      if (!e) { e = { key: m.g.key, truth: `${S.people[r.subj]?.given ?? '？'}が${r.truth}`, holders: 0, versions: new Set(), maxMag: 0, maxHops: 0, towns: new Set() }; map.set(m.g.key, e); }
      e.holders++; e.versions.add(`${m.g.subj}|${m.g.pred}`); e.towns.add(p.s);
      e.maxMag = Math.max(e.maxMag, r.mag); e.maxHops = Math.max(e.maxHops, r.hops);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, versions: e.versions.size, towns: e.towns.size }))
    .sort((x, y) => y.versions - x.versions || y.holders - x.holders)
    .slice(0, limit);
}
