// 血縁関係の計算

// 祖先を世代の深さつきで返す: Map(id -> depth)  1=親, 2=祖父母 ...
const ANC_CACHE = new WeakMap();   // people の表ごとに、(人, 深さ) → 祖先の一覧。返した Map は書き換えないこと
export function ancestors(people, p, maxDepth = 8) {
  let cache = ANC_CACHE.get(people);
  if (!cache) { cache = new Map(); ANC_CACHE.set(people, cache); }
  const key = typeof p.id === 'number' ? p.id * 16 + maxDepth : p.id + ':' + maxDepth;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = ancestorsOf(people, p, maxDepth);
  if (cache.size > 300000) cache.clear();
  cache.set(key, out);
  return out;
}
function ancestorsOf(people, p, maxDepth) {
  const out = new Map();
  let frontier = [p];
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next = [];
    for (const q of frontier) {
      for (const pid of [q.fatherId, q.motherId]) {
        if (pid == null || out.has(pid)) continue;
        const par = people[pid];
        if (!par) continue;
        out.set(pid, d);
        next.push(par);
      }
    }
    frontier = next;
  }
  return out;
}

export function isCloseKin(people, a, b) {
  if (a.id === b.id) return true;
  const A = ancestors(people, a, 3), B = ancestors(people, b, 3);
  if (A.has(b.id) || B.has(a.id)) return true;
  for (const id of A.keys()) if (B.has(id)) return true;
  return false;
}

export function siblings(people, p) {
  const out = [];
  const par = [p.fatherId, p.motherId].filter((x) => x != null).map((id) => people[id]).filter(Boolean);
  const seen = new Set();
  for (const q of par) for (const cid of q.children) {
    if (cid !== p.id && !seen.has(cid)) { seen.add(cid); out.push(people[cid]); }
  }
  return out.filter(Boolean);
}

const ANC = {
  1: ['父', '母'], 2: ['祖父', '祖母'], 3: ['曾祖父', '曾祖母'], 4: ['高祖父', '高祖母'],
};

// from から見た to の続柄（無ければ null）
export function kinTerm(people, from, to) {
  if (!from || !to || from.id === to.id) return null;
  if (from.spouseId === to.id) return to.sex === 'm' ? '夫' : '妻';
  const anc = ancestors(people, from, 8);
  if (anc.has(to.id)) {
    const d = anc.get(to.id);
    if (ANC[d]) return ANC[d][to.sex === 'm' ? 0 : 1];
    return `${d}代前のご先祖`;
  }
  const desc = ancestors(people, to, 4);
  if (desc.has(from.id)) {
    const d = desc.get(from.id);
    if (d === 1) return to.sex === 'm' ? '息子' : '娘';
    if (d === 2) return '孫';
    if (d === 3) return 'ひ孫';
    return '子孫';
  }
  if (siblings(people, from).some((s) => s.id === to.id)) {
    const older = to.birthYear * 100 + to.birthDay < from.birthYear * 100 + from.birthDay;
    if (to.sex === 'm') return older ? '兄' : '弟';
    return older ? '姉' : '妹';
  }
  // おじ・おば
  for (const [pid, d] of anc) {
    if (d !== 1) continue;
    if (siblings(people, people[pid]).some((s) => s.id === to.id)) return to.sex === 'm' ? 'おじ' : 'おば';
  }
  // いとこ
  const A2 = ancestors(people, from, 2), B2 = ancestors(people, to, 2);
  for (const [id, d] of A2) if (d === 2 && B2.get(id) === 2) return 'いとこ';
  // 義理
  if (from.spouseId != null) {
    const sp = people[from.spouseId];
    if (sp && (sp.fatherId === to.id || sp.motherId === to.id)) return to.sex === 'm' ? '義父' : '義母';
  }
  return null;
}

// 子どもっぽい/くだけた呼び方
export function casualKin(term, childish) {
  const map = childish
    ? { 父: 'お父さん', 母: 'お母さん', 祖父: 'おじいちゃん', 祖母: 'おばあちゃん', 兄: 'お兄ちゃん', 姉: 'お姉ちゃん', 曾祖父: 'ひいおじいちゃん', 曾祖母: 'ひいおばあちゃん' }
    : { 父: '親父', 母: 'お袋', 祖父: 'じいさん', 祖母: 'ばあさん', 曾祖父: 'ひいじいさん', 曾祖母: 'ひいばあさん' };
  return map[term] || term;
}
