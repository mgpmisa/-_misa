// 共通の道具
export const FILES = {};
export function r(x, d) {
  if (d != null) { const p = 10 ** d; return Math.round(x * p) / p; }
  if (x >= 20) return Math.round(x);
  if (x >= 2) return Math.round(x * 2) / 2;
  return Math.round(x * 100) / 100;
}
export const CR = { how: 'craft' };
export const LOOT = (rate = 0.03, on = ['dungeon', 'ruins']) => ({ how: 'loot', on, rate });
export const TR = (on) => ({ how: 'trade', on });
export const uWear = (note) => ({ k: 'wear', note });
export const uMelt = { k: 'craft', note: '鋳つぶして地金に戻す' };
const ORDER = ['id', 'name', 'cat', 'sub', 'w', 'v', 'stack', 'rare', 'demand', 'limit', 'src', 'use', 'make', 'eq', 'fx', 'desc'];
export function add(file, o) {
  const x = { cat: 'gear', stack: 1, rare: 0, demand: 1, ...o };
  if (x.w == null || x.v == null) throw new Error('w/v missing ' + x.id);
  const out = {};
  for (const k of ORDER) if (x[k] !== undefined) out[k] = x[k];
  for (const k of Object.keys(x)) if (!(k in out)) out[k] = x[k];
  (FILES[file] = FILES[file] || []).push(out);
  return out;
}
