// 再現可能な乱数（シード付き）
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    get state() { return s; },
    set state(v) { s = v >>> 0; },
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    gauss: (m = 0, sd = 1) => {
      const u = 1 - next(), v = next();
      return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted: (items, wfn) => {
      let total = 0;
      const ws = items.map((it) => { const w = Math.max(0, wfn(it)); total += w; return w; });
      if (total <= 0) return null;
      let x = next() * total;
      for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
      return items[items.length - 1];
    },
  };
  return r;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
