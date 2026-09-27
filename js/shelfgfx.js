// 職場の蔵の中身を、建物の中の棚・台・かご・たる・武器立てに「物」として並べる（経済部・グラフィック兼任）
//
// 社長の指示：データや文字だけでなく、物として目に見えるようにする。
//   パン工房なら棚のパン（なければ空、1〜5個で1段、6〜20個で2段、21個以上で満杯）、粉袋、薪の山。
//   鍛冶場なら武器立ての剣・斧・槍、鎧かけ、鉄の延べ棒の山、鉱石。よろず屋・市場は置いている品を代表の絵で。
//   酒場はたるの数、薬屋は薬瓶、仕立て屋は布の巻き、粉ひき小屋は麦袋と粉袋、工房は材木の山と作った品。
//   見ている間に売れたり作られたりしたら、数秒ごとに作り直す。
//
// ■ 描き方
//   品の形（パン・袋・薪・剣…）は、小さな箱と筒を組み合わせた「部品」で作る。同じ部品は InstancedMesh にまとめて1回で描く。
//   色と模様は、ほかの内装と同じ 16px 前後のドット絵テクスチャ（canvasTex）。材質と形は一度だけ作って使い回す。
//   部屋の座標は interior.js と同じ（x：東、z：南、0..W × 0..D）。棚の位置は interior.js・bldnew.js の家具に合わせてある。
//
// ■ 本体からの呼び方（interior.js：patch_workshop.py）
//   shelfAttach(view, b) … InteriorView.open の最後
//   shelfTick(view, dt, now) … InteriorView.update の animate のあと（3秒ごとに中身を見て、変わっていれば作り直す。
//                          職場の中の人は、いまの動き（運び込む・並べる・こねる・焼く・打つ…）のドット絵に差し替える）
//   shelfDetach(view)    … InteriorView.close
import * as THREE from 'three';
import { canvasTex } from './textures.js';
import { wsDisplay } from './workshop.js';
import { MAT } from './matter.js';
import { ITEMS } from './items.js';
import { innPlan } from './buildings.js';
import { drawPersonAnim, personAnimState, animFrameAt } from './anim_people.js';
import './wsanim.js';   // 職場の人の動き（運び込む・棚に並べる・作る・運び出す）を anim_people.js に足す

const TYPES = new Set(['bakery', 'smithy', 'genstore', 'tailorshop', 'apothecary', 'tavern', 'inn', 'mill', 'workshop', 'market']);
const hashS = (s) => { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ================================================================ 材質と形（一度だけ）
let L = null;
function lib() {
  if (L) return L;
  const T = {};
  // パンの皮：焼き色のむらと切れ目
  T.crust = canvasTex(16, 8, (g) => {
    rect(g, 0, 0, 16, 8, '#c98a3a');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 8; y++) { const r = hashS(x * 31 + y); if (r > 0.82) px(g, x, y, '#a86a28'); else if (r < 0.1) px(g, x, y, '#e0a854'); }
    for (const x0 of [3, 8, 13]) { px(g, x0, 2, '#f0d090'); px(g, x0 - 1, 3, '#f0d090'); px(g, x0 - 2, 4, '#f0d090'); }
  });
  T.darkCrust = canvasTex(16, 8, (g) => { rect(g, 0, 0, 16, 8, '#7a4a22'); for (let x = 0; x < 16; x++) for (let y = 0; y < 8; y++) if (hashS(x * 7 + y * 13) > 0.8) px(g, x, y, '#5a341a'); });
  // 麻袋（麦）と粉袋（白に青い筋）
  T.burlap = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#c8b07a'); for (let y = 0; y < 8; y += 2) for (let x = (y / 2) % 2; x < 8; x += 2) px(g, x, y, '#a8905a'); });
  T.flour = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#eee8d8'); for (let y = 0; y < 8; y += 2) for (let x = (y / 2) % 2; x < 8; x += 2) px(g, x, y, '#d8d0bc'); rect(g, 0, 3, 8, 1, '#5a7ab0'); });
  // 薪の木肌と切り口
  T.bark = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#6a4424'); for (let i = 0; i < 8; i++) px(g, i, (i * 3) % 8, '#4a2e18'); px(g, 2, 5, '#8a5a30'); px(g, 6, 1, '#8a5a30'); });
  T.ring = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#d8b07a'); g.strokeStyle = '#a07040'; g.strokeRect(1.5, 1.5, 5, 5); px(g, 4, 4, '#a07040'); });
  // 刃（光る縁）
  T.blade = canvasTex(4, 16, (g) => { rect(g, 0, 0, 4, 16, '#b8c0cc'); rect(g, 1, 0, 1, 16, '#e8eef8'); rect(g, 3, 0, 1, 16, '#8a92a0'); });
  // 盾の面
  T.shield = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#6a6a74'); rect(g, 1, 1, 6, 6, '#b82a32'); rect(g, 3, 1, 2, 6, '#e0b84a'); rect(g, 1, 3, 6, 2, '#e0b84a'); });
  T.woodShield = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#8a5a30'); for (let x = 0; x < 8; x += 3) rect(g, x, 0, 1, 8, '#6a4020'); rect(g, 3, 3, 2, 2, '#b8b8c0'); });
  // 布の巻き（白地に筋。色は材質の色で染める）
  T.roll = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#ffffff'); for (let x = 1; x < 8; x += 3) rect(g, x, 0, 1, 8, '#d8d8d8'); });
  // 瓶のラベル
  T.label = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#ffffff'); rect(g, 0, 3, 8, 3, '#f0e8c8'); px(g, 2, 4, '#5a3a2a'); px(g, 4, 4, '#5a3a2a'); px(g, 5, 4, '#5a3a2a'); });
  T.hay = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#d9b54a'); for (let i = 0; i < 10; i++) px(g, (i * 5) % 8, (i * 3) % 8, i % 2 ? '#f0d070' : '#b08a30'); });
  T.planks = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#a87a48'); rect(g, 0, 3, 8, 1, '#7a5430'); rect(g, 0, 7, 8, 1, '#7a5430'); px(g, 1, 1, '#6a4428'); px(g, 6, 5, '#6a4428'); });
  T.ore = canvasTex(8, 8, (g) => { rect(g, 0, 0, 8, 8, '#4a4440'); px(g, 2, 2, '#e08a3a'); px(g, 3, 2, '#f0b060'); px(g, 5, 5, '#e08a3a'); px(g, 6, 1, '#c0c8d0'); });
  const Lm = (o) => new THREE.MeshLambertMaterial(o);
  const M = {
    crust: Lm({ map: T.crust }), darkCrust: Lm({ map: T.darkCrust }), burlap: Lm({ map: T.burlap }), flour: Lm({ map: T.flour }),
    bark: Lm({ map: T.bark }), ring: Lm({ map: T.ring }), blade: Lm({ map: T.blade }), shield: Lm({ map: T.shield }), woodShield: Lm({ map: T.woodShield }),
    hay: Lm({ map: T.hay }), planks: Lm({ map: T.planks }), ore: Lm({ map: T.ore }),
    iron: Lm({ color: '#5a5a64' }), ironTop: Lm({ color: '#8a8a96' }), steel: Lm({ color: '#b8c0cc' }), brass: Lm({ color: '#c09040' }), gold: Lm({ color: '#e0b84a' }),
    wood: Lm({ color: '#8a5a30' }), darkWood: Lm({ color: '#4a3020' }), rope: Lm({ color: '#a08858' }), cork: Lm({ color: '#8a6a40' }),
    leather: Lm({ color: '#7a4a26' }), clay: Lm({ color: '#b86a40' }), red: Lm({ color: '#c02a2a' }), white: Lm({ color: '#f2eee4' }), bone: Lm({ color: '#e8e0c8' }),
  };
  M.tint = (c) => M['t' + c] || (M['t' + c] = Lm({ color: c }));
  M.rollOf = (c) => M['r' + c] || (M['r' + c] = Lm({ map: T.roll, color: c }));
  M.glass = (c) => M['g' + c] || (M['g' + c] = Lm({ color: c, emissive: c, emissiveIntensity: 0.25 }));
  M.labeled = (c) => M['l' + c] || (M['l' + c] = Lm({ map: T.label, color: c }));
  const G = new Map();
  const box = (w, h, d) => { const k = `b${w},${h},${d}`; if (!G.has(k)) G.set(k, new THREE.BoxGeometry(w, h, d)); return G.get(k); };
  const cyl = (r, h, r2 = r, seg = 8) => { const k = `c${r},${h},${r2},${seg}`; if (!G.has(k)) G.set(k, new THREE.CylinderGeometry(r2, r, h, seg)); return G.get(k); };
  const sph = (r) => { const k = `s${r}`; if (!G.has(k)) G.set(k, new THREE.SphereGeometry(r, 7, 5)); return G.get(k); };
  L = { T, M, box, cyl, sph };
  return L;
}

// ================================================================ 品の形（部品の組み合わせ）
// 部品：[形, 材質, dx, dy, dz, rx, rz]（dy は底からの高さ。形の中心の高さを渡す）
const HALF = Math.PI / 2;
function shape(kind, color) {
  const { M, box, cyl, sph } = lib();
  const c = color || '#c0a070';
  switch (kind) {
    case 'loaf': return [[box(0.28, 0.11, 0.17), M.crust, 0, 0.055, 0], [box(0.22, 0.04, 0.11), M.crust, 0, 0.12, 0]];
    case 'bun': return [[cyl(0.1, 0.09, 0.08), color ? M.tint(c) : M.crust, 0, 0.045, 0]];
    case 'darkLoaf': return [[box(0.26, 0.12, 0.17), M.darkCrust, 0, 0.06, 0]];
    case 'sackT': return [[cyl(0.22, 0.42, 0.17, 7), M.burlap, 0, 0.21, 0], [cyl(0.07, 0.08, 0.07, 5), M.rope, 0, 0.46, 0]];
    case 'sackF': return [[cyl(0.22, 0.42, 0.17, 7), M.flour, 0, 0.21, 0], [cyl(0.07, 0.08, 0.07, 5), M.rope, 0, 0.46, 0]];
    case 'log': return [[cyl(0.065, 0.55, 0.065, 6), M.bark, 0, 0.065, 0, 0, HALF]];
    case 'ingot': return [[box(0.3, 0.07, 0.11), M.iron, 0, 0.035, 0], [box(0.24, 0.012, 0.07), M.ironTop, 0, 0.076, 0]];
    case 'ore': return [[box(0.15, 0.12, 0.13), M.ore, 0, 0.06, 0, 0.3, 0.2]];
    case 'sword': return [[box(0.09, 0.78, 0.03), M.blade, 0, 0.62, 0], [box(0.19, 0.035, 0.05), M.brass, 0, 0.22, 0], [box(0.035, 0.16, 0.035), M.darkWood, 0, 0.13, 0], [box(0.055, 0.05, 0.05), M.brass, 0, 0.03, 0]];
    case 'longsword': return [[box(0.1, 1.0, 0.03), M.blade, 0, 0.73, 0], [box(0.22, 0.035, 0.05), M.brass, 0, 0.22, 0], [box(0.035, 0.2, 0.035), M.darkWood, 0, 0.11, 0]];
    case 'dagger': return [[box(0.08, 0.34, 0.03), M.blade, 0, 0.5, 0], [box(0.13, 0.03, 0.04), M.brass, 0, 0.32, 0], [box(0.03, 0.12, 0.03), M.darkWood, 0, 0.25, 0]];
    case 'axe': return [[box(0.04, 1.05, 0.04), M.wood, 0, 0.53, 0], [box(0.24, 0.2, 0.05), M.iron, 0.1, 0.98, 0], [box(0.04, 0.2, 0.055), M.steel, 0.23, 0.98, 0]];
    case 'spear': return [[box(0.035, 1.7, 0.035), M.wood, 0, 0.85, 0], [box(0.08, 0.26, 0.03), M.blade, 0, 1.82, 0]];
    case 'mace': return [[box(0.04, 0.7, 0.04), M.darkWood, 0, 0.35, 0], [box(0.17, 0.18, 0.17), M.iron, 0, 0.75, 0]];
    case 'bow': return [[box(0.035, 1.1, 0.03), M.wood, 0, 0.6, 0], [box(0.006, 1.02, 0.006), M.white, 0.07, 0.6, 0]];
    case 'staff': return [[box(0.04, 1.3, 0.04), M.wood, 0, 0.65, 0], [sph(0.07), M.glass('#8a60e0'), 0, 1.34, 0]];
    case 'tool': return [[box(0.05, 0.55, 0.05), M.wood, 0, 0.28, 0], [box(0.22, 0.1, 0.1), M.steel, 0, 0.56, 0]];
    case 'armor': return [[box(0.46, 0.1, 0.46), M.darkWood, 0, 0.05, 0], [box(0.05, 0.6, 0.05), M.darkWood, 0, 0.4, 0], [box(0.42, 0.48, 0.26), M.tint(c), 0, 0.88, 0], [box(0.5, 0.1, 0.28), M.tint(c), 0, 1.1, 0], [box(0.2, 0.22, 0.2), M.tint(c), 0, 1.3, 0]];
    case 'shieldHang': return [[box(0.05, 0.46, 0.4), color === 'wood' ? M.woodShield : M.shield, 0, 0, 0]];
    case 'barrel': return [[cyl(0.3, 0.8, 0.3, 8), M.wood, 0, 0.4, 0], [cyl(0.315, 0.05, 0.315, 8), M.iron, 0, 0.16, 0], [cyl(0.315, 0.05, 0.315, 8), M.iron, 0, 0.64, 0], [cyl(0.22, 0.01, 0.22, 8), M.darkWood, 0, 0.805, 0]];
    case 'barrelLie': return [[cyl(0.36, 0.9, 0.36, 8), M.wood, 0, 0.36, 0, 0, HALF], [cyl(0.375, 0.06, 0.375, 8), M.iron, -0.28, 0.36, 0, 0, HALF], [cyl(0.375, 0.06, 0.375, 8), M.iron, 0.28, 0.36, 0, 0, HALF], [cyl(0.05, 0.08, 0.05, 6), M.brass, 0.47, 0.3, 0, 0, HALF]];
    case 'bottle': return [[cyl(0.055, 0.15, 0.055, 6), M.labeled(c), 0, 0.075, 0], [cyl(0.025, 0.06, 0.025, 5), M.glass(c), 0, 0.18, 0], [box(0.03, 0.03, 0.03), M.cork, 0, 0.225, 0]];
    case 'mug': return [[cyl(0.06, 0.11, 0.055, 6), M.brass, 0, 0.055, 0]];
    case 'roll': return [[cyl(0.09, 0.4, 0.09, 7), M.rollOf(c), 0, 0.09, 0, 0, HALF]];
    case 'fold': return [[box(0.3, 0.07, 0.24), M.tint(c), 0, 0.035, 0], [box(0.3, 0.012, 0.05), M.white, 0, 0.074, 0.06]];
    case 'jar': return [[cyl(0.1, 0.18, 0.08, 7), M.tint(color || '#b86a40'), 0, 0.09, 0], [cyl(0.05, 0.05, 0.06, 6), M.tint(color || '#b86a40'), 0, 0.205, 0]];
    case 'shoes': return [[box(0.08, 0.07, 0.18), M.leather, -0.05, 0.035, 0], [box(0.08, 0.07, 0.18), M.leather, 0.05, 0.035, 0.02]];
    case 'stool': return [[cyl(0.18, 0.05, 0.18, 8), M.wood, 0, 0.45, 0], [box(0.04, 0.43, 0.04), M.darkWood, -0.1, 0.215, -0.08], [box(0.04, 0.43, 0.04), M.darkWood, 0.1, 0.215, -0.08], [box(0.04, 0.43, 0.04), M.darkWood, 0, 0.215, 0.12]];
    case 'jewel': return [[box(0.12, 0.06, 0.09), M.gold, 0, 0.03, 0], [sph(0.03), M.glass(color || '#e03050'), 0, 0.08, 0]];
    case 'crate': return [[box(0.3, 0.24, 0.3), M.planks, 0, 0.12, 0]];
    case 'ball': return [[sph(0.095), M.tint(c), 0, 0.095, 0]];
    case 'fish': return [[box(0.3, 0.05, 0.09), M.tint(color || '#9ab0c0'), 0, 0.025, 0], [box(0.06, 0.05, 0.12), M.tint(color || '#9ab0c0'), 0.17, 0.025, 0]];
    case 'fishHang': return [[box(0.05, 0.3, 0.1), M.tint(color || '#9ab0c0'), 0, 0, 0], [box(0.05, 0.06, 0.13), M.tint(color || '#9ab0c0'), 0, -0.17, 0]];
    case 'meat': return [[box(0.24, 0.1, 0.15), M.tint(color || '#b8504a'), 0, 0.05, 0], [cyl(0.02, 0.1, 0.02, 5), M.bone, 0.15, 0.05, 0, 0, HALF]];
    case 'herbs': return [[box(0.1, 0.24, 0.1), M.tint(color || '#4a9a3a'), 0, 0.12, 0], [box(0.11, 0.03, 0.11), M.rope, 0, 0.08, 0]];
    case 'hide': return [[box(0.34, 0.03, 0.26), M.tint(color || '#8a5a30'), 0, 0.015, 0]];
    case 'hay': return [[box(0.5, 0.32, 0.36), M.hay, 0, 0.16, 0]];
    case 'stone': return [[box(0.26, 0.14, 0.18), M.tint(color || '#9a968c'), 0, 0.07, 0]];
    case 'wool': return [[sph(0.1), M.tint(color || '#f0ece0'), 0, 0.09, 0]];
    case 'scroll': return [[cyl(0.035, 0.26, 0.035, 6), M.tint(color || '#e8d8a8'), 0, 0.035, 0, 0, HALF]];
    case 'shelf2': return [[box(0.45, 0.06, 4.6), M.wood, 0, 0.55, 0], [box(0.45, 0.06, 4.6), M.wood, 0, 1.05, 0], [box(0.45, 1.1, 0.06), M.darkWood, 0, 0.55, -2.27], [box(0.45, 1.1, 0.06), M.darkWood, 0, 0.55, 2.27], [box(0.05, 1.1, 4.6), M.darkWood, 0.2, 0.55, 0]];
    default: return [[box(0.2, 0.16, 0.2), M.tint(c), 0, 0.08, 0]];
  }
}

// 品 → 形と色
const GOOD_KIND = {
  bread: ['loaf'], wheat: ['sackT'], flour_wheat: ['sackF'], fish: ['fish'], meat: ['meat'], wood: ['log'], ore: ['ore'], tools: ['tool'], weapons: ['sword'],
  ale: ['bottle', '#8a5a20'], cloth: ['roll', '#c05a4a'], furniture: ['stool'], gem: ['jewel', '#40c0e0'], honey: ['jar', '#e0a830'], wool: ['wool'], herbs: ['herbs'],
  medicine: ['bottle', '#3aa05a'], shoes: ['shoes'], pottery: ['jar'], jewelry: ['jewel'], stone: ['stone'], iron: ['ingot'],
};
const SUB_KIND = {
  bread: 'bun', sweet: 'bun', pie: 'bun', flour: 'sackF', meat: 'meat', fish: 'fish', cured: 'meat', wine: 'bottle', ale: 'bottle', spirit: 'bottle', herbtea: 'jar', soup: 'jar', stew: 'jar', spice: 'jar',
  fruit: 'ball', veg: 'ball', root: 'ball', mushroom: 'ball', seed: 'sackT', herb: 'herbs', magicherb: 'herbs', flower: 'herbs', wild: 'herbs', dye: 'jar', fiber: 'wool', fuel: 'log', wood: 'log', sapling: 'herbs',
  gem: 'jewel', metal: 'ingot', ore: 'ore', rock: 'stone', stone: 'stone', soil: 'sackT', element: 'bottle', water: 'bottle',
  hide: 'hide', fur: 'hide', bone: 'stone', tooth: 'stone', feather: 'herbs', organ: 'meat', fat: 'jar', insect: 'ball', shellfish: 'ball',
  sword: 'sword', axe: 'axe', spear: 'spear', mace: 'mace', shield: 'crate', clothes: 'fold', outfit: 'fold', head: 'fold', bag: 'fold', travel: 'crate', tool_farm: 'tool',
  armor_plate: 'crate', medicine: 'bottle', alchemy: 'bottle', jewelry: 'jewel', scroll: 'scroll', study: 'scroll', history: 'scroll', relic: 'jewel', instrument: 'crate', device: 'crate', tribal_craft: 'jar',
};
const PALETTE = ['#c05a4a', '#4a7ac0', '#5aa05a', '#d0a040', '#8a5ab0', '#e08a50', '#a0a0a0', '#e0d0a0', '#50a0a0', '#b04070'];
function kindOf(g) {
  if (GOOD_KIND[g]) return GOOD_KIND[g];
  if (ITEMS[g]) {
    const t = ITEMS[g].type;
    return [t === 'weapon' ? 'sword' : t === 'armor' ? 'fold' : t === 'tool' ? 'tool' : 'crate'];
  }
  const it = MAT.get(g);
  const col = PALETTE[Math.floor(hashS(g) * PALETTE.length)];
  if (!it) return ['crate', col];
  const k = SUB_KIND[it.sub] || { food: 'jar', plant: 'herbs', beast: 'hide', earth: 'stone', gear: 'crate', arcane: 'bottle' }[it.cat] || 'crate';
  const fix = { sackT: null, sackF: null, log: null, ingot: null, ore: null, sword: null, axe: null, spear: null, mace: null, tool: null, stool: null, crate: null };
  if (it.sub === 'bread') return [/black|rye|dark/.test(g) ? 'darkLoaf' : 'bun', /white/.test(g) ? '#f0d8a0' : null];
  if (it.sub === 'fruit' || it.sub === 'veg' || it.sub === 'root') return ['ball', ['#d0302a', '#e8902a', '#8ac050', '#e0c040', '#a04080'][Math.floor(hashS(g + 'c') * 5)]];
  return [k, k in fix ? null : col];
}

// ================================================================ 置き場（部屋ごとの棚の位置）
// 返す：[{kind, color, x, y, z, ry}]。x,z は部屋の座標（マス）、y は置く面の高さ
function tierCount(q, cap, perLevel) {
  // 0個なら空、1〜5個で1段、6〜20個で2段、21個以上で満杯（段ごとに数を分ける）
  if (q < 0.5) return [];
  const tier = q < 6 ? 1 : q < 21 ? 2 : 3;
  const n = Math.min(cap, tier === 3 ? cap : Math.max(1, Math.round(q)));
  const out = [];
  let left = n;
  for (let lv = 0; lv < tier; lv++) { const k = Math.min(perLevel, Math.ceil(left / (tier - lv))); out.push(k); left -= k; }
  return out;
}
// 品の見える棚（interior.js の openShelf と同じ寸法）に、品ごとに列を割り当てて並べる
// goods：[[品, 数], ...]　shelf：{x, z, len, side}
function fillShelf(list, shelf, goods, opt = {}) {
  const per = Math.floor(shelf.len / 0.42);
  const colsPer = opt.cols || Math.max(1, Math.floor(per / Math.max(1, goods.length)));
  let col = opt.startCol || 0;
  const levelOrder = [1, 0, 2];   // 目の高さの段から埋める
  for (const [g, q] of goods) {
    if (col >= per) break;
    const [kind, color] = kindOf(g);
    const w = Math.min(colsPer, per - col);
    const lvls = tierCount(q, w * 3, w);
    lvls.forEach((k, li) => {
      const lv = levelOrder[li];
      const y = 0.05 + lv * 0.52 + 0.06;
      for (let i = 0; i < k; i++) {
        const a = 0.12 + (col + i) * 0.42 + 0.16, b = 0.24;
        const [x, z] = shelf.side === 'N' ? [shelf.x + a, shelf.z + b] : [shelf.x + b, shelf.z + a];
        list.push({ kind, color, x, y, z, ry: (shelf.side === 'N' ? 0 : HALF) + (kind === 'roll' ? HALF : 0) });   // 布の巻きは切り口を手前に
      }
    });
    col += w;
  }
  return col;
}
function sortGoods(o, pred = () => true) { return Object.entries(o || {}).filter(([g, n]) => n >= 0.5 && pred(g)).sort((a, b) => b[1] - a[1]); }
function sacks(list, spots, n, kind, y0 = 0) {
  for (let i = 0; i < Math.min(n, spots.length * 2); i++) { const [x, z] = spots[i % spots.length]; list.push({ kind, x: x + (i >= spots.length ? 0.04 : 0), y: y0 + (i >= spots.length ? 0.42 : 0), z, ry: (i * 0.7) % 1.5 }); }
}
function woodPile(list, x0, z0, len, n, alongX = true) {
  // 薪・材木を三角に積む
  let k = 0;
  for (let layer = 0; layer < 5 && k < n; layer++) for (let i = 0; i < 5 - layer && k < n; i++, k++) {
    const a = 0.08 + i * 0.14 + layer * 0.07, y = layer * 0.12;
    list.push(alongX ? { kind: 'log', x: x0 + len / 2, y, z: z0 + a, ry: 0, sx: len / 0.55 } : { kind: 'log', x: x0 + a, y, z: z0 + len / 2, ry: HALF, sx: len / 0.55 });
  }
}

const LAYOUT = {
  bakery(K, d, list) {
    const { W, D } = K, ox = W / 2 - 1.5;
    const breads = sortGoods(d.out, (g) => kindOf(g)[0] === 'loaf' || kindOf(g)[0] === 'bun' || kindOf(g)[0] === 'darkLoaf');
    const plain = breads.find(([g]) => g === 'bread');
    const others = breads.filter(([g]) => g !== 'bread');
    // 西の壁のパン棚：ふつうのパン
    fillShelf(list, { x: 0.02, z: 1.2, len: 3.4, side: 'W' }, plain ? [plain] : [], { cols: 8 });
    // 北の棚：黒パン・菓子など（なければ、あふれたパン）
    const nLen = Math.min(2.6, ox - 0.8);
    const nGoods = others.length ? others.slice(0, 3) : plain && plain[1] > 24 ? [['bread', plain[1] - 24]] : [];
    fillShelf(list, { x: 0.6, z: 0.02, len: nLen, side: 'N' }, nGoods);
    // 売り台：店先のパン（あれば丸パンを並べる）
    const q = plain ? plain[1] : 0;
    for (let i = 0; i < Math.min(5, Math.ceil(q / 4)); i++) list.push({ kind: 'bun', x: W - 3.3 + i * 0.42, y: 0.9, z: D - 1.9, ry: 0 });
    // 粉袋（白）と麦袋（麻）
    const spots = [[0.6, D - 0.6], [1.15, D - 0.6], [0.6, D - 1.15], [1.15, D - 1.15], [W - 0.6, D - 0.6], [1.7, D - 0.6]];
    const flour = d.mats.flour_wheat || 0, wheat = d.mats.wheat || 0;
    const nf = flour < 0.3 ? 0 : Math.min(8, Math.ceil(flour / 3)), nw = wheat < 0.3 ? 0 : Math.min(4, Math.ceil(wheat / 5));
    sacks(list, spots, nf, 'sackF');
    sacks(list, spots.slice().reverse(), nw, 'sackT');
    // 薪の山（窯の東）
    const wood = d.mats.wood || 0;
    woodPile(list, ox + 3.45, 0.15, 1.8, wood < 0.05 ? 0 : Math.min(15, Math.ceil(wood * 5)));
  },
  smithy(K, d, list) {
    const { W, D } = K;
    const weapons = d.items.filter((it) => it.type === 'weapon');
    const tools = d.items.filter((it) => it.type === 'tool');
    const armors = d.items.filter((it) => it.type === 'armor');
    const shields = d.items.filter((it) => it.type === 'shield');
    // 武器立て（北の壁、interior.js の weaponRack と同じ位置）
    const rack = [...weapons, ...tools].slice(0, 8);
    rack.forEach((it, i) => {
      const k = { sword: 'sword', longsword: 'longsword', greatsword: 'longsword', dagger: 'dagger', spear: 'spear', axe: 'axe', mace: 'mace', bow: 'bow', staff: 'staff', dragonblade: 'longsword', holysword: 'longsword' }[it.id] || (it.type === 'tool' ? 'tool' : 'sword');
      list.push({ kind: k, x: W - 3.4 + 0.3 + i * 0.36, y: 0.12, z: 0.3, ry: 0 });
    });
    // 入りきらない道具は床の木箱の上に
    tools.slice(Math.max(0, 8 - weapons.length)).slice(0, 6).forEach((it, i) => list.push({ kind: 'tool', x: 0.45 + (i % 3) * 0.16, y: 0.7, z: D - 0.85 + Math.floor(i / 3) * 0.2, ry: HALF }));
    // 鎧かけ（東の壁ぞい）
    const col = { chainmail: '#8a8a96', platearmor: '#c8d0dc', leatherarmor: '#8a5a30', robe: '#6a3aa0', clothes: '#d8c8a0', scalearmor: '#4a8a5a' };
    armors.slice(0, 3).forEach((it, i) => list.push({ kind: 'armor', color: col[it.id] || '#9a9aa6', x: W - 0.55, y: 0, z: 2.0 + i * 1.0, ry: -HALF }));
    // 盾（東の壁に掛ける）
    shields.slice(0, 3).forEach((it, i) => list.push({ kind: 'shieldHang', color: it.id === 'shield' ? 'wood' : null, x: W - 0.05, y: 1.05, z: 7.0 + i * 0.7, ry: 0 }));
    // 鉄の延べ棒の山（4本ずつ向きを変えて積む）
    const iron = Math.min(16, Math.floor((d.mats.iron || 0) + 0.3));
    for (let i = 0; i < iron; i++) { const layer = Math.floor(i / 4), k = i % 4; list.push(layer % 2 ? { kind: 'ingot', x: W - 1.45 + k * 0.13 - 0.2, y: layer * 0.07, z: D - 1.2, ry: HALF } : { kind: 'ingot', x: W - 1.2, y: layer * 0.07, z: D - 1.45 + k * 0.13, ry: 0 }); }
    // 鉱石（炉のわき）
    const ore = Math.min(10, Math.ceil((d.mats.ore || 0) * 1.5));
    for (let i = 0; i < ore; i++) list.push({ kind: 'ore', x: 3.35 + (i % 3) * 0.17, y: Math.floor(i / 5) * 0.1, z: 1.65 + (Math.floor(i / 3) % 2) * 0.16, ry: i });
    // 鍛冶の小物（釘・蝶番など）は木箱に
    const small = sortGoods(d.out).filter(([g]) => !ITEMS[g]).slice(0, 4);
    small.forEach(([g], i) => { const [k, c] = kindOf(g); list.push({ kind: k === 'sword' ? 'ingot' : k, color: c, x: 0.4 + i * 0.2, y: 0.7, z: D - 0.55, ry: 0 }); });
  },
  genstore(K, d, list) {
    const { W, D } = K;
    const goods = sortGoods(d.out, (g) => g !== 'wheat' && g !== 'flour_wheat');
    const n = Math.floor((W - 0.6) / 0.42);
    const col = fillShelf(list, { x: 0.3, z: 0.05, len: W - 0.6, side: 'N' }, goods.slice(0, 8), { cols: Math.max(2, Math.floor(n / Math.max(1, Math.min(8, goods.length)))) });
    void col;
    fillShelf(list, { x: 0, z: 1.4, len: 3.5, side: 'W' }, goods.slice(8, 10));
    const grain = (d.out.wheat || 0) + (d.out.flour_wheat || 0);
    const spots = [[1.2, D - 0.7], [1.7, D - 0.7], [2.2, D - 0.7], [2.7, D - 0.7]];
    sacks(list, spots, grain < 0.5 ? 0 : Math.min(8, Math.ceil(grain / 4)), (d.out.flour_wheat || 0) > (d.out.wheat || 0) ? 'sackF' : 'sackT');
  },
  tailorshop(K, d, list) {
    const { W } = K;
    const goods = sortGoods(d.out);
    const cloth = goods.filter(([g]) => kindOf(g)[0] === 'roll');
    const rest = goods.filter(([g]) => kindOf(g)[0] !== 'roll').slice(0, 5);
    const col = fillShelf(list, { x: 0.3, z: 0.05, len: W - 0.6, side: 'N' }, cloth.length ? cloth : [], { cols: 8 });
    fillShelf(list, { x: 0.3, z: 0.05, len: W - 0.6, side: 'N' }, rest, { startCol: col, cols: 3 });
    // 材料の羊毛は、かごの代わりに床に丸めて
    const wool = Math.min(6, Math.ceil(d.mats.wool || 0));
    for (let i = 0; i < wool; i++) list.push({ kind: 'wool', x: 1.0 + (i % 3) * 0.22, y: Math.floor(i / 3) * 0.16, z: K.D - 0.9, ry: 0 });
  },
  apothecary(K, d, list) {
    const { W } = K;
    const goods = sortGoods(d.out);
    // 帳場の上の薬瓶（東寄りに2列）
    let k = 0;
    for (const [g, q] of goods) {
      const [kind, color] = kindOf(g);
      const n = Math.min(14 - k, q < 0.5 ? 0 : q < 6 ? Math.ceil(q) : q < 21 ? Math.min(10, Math.ceil(q / 2) + 3) : 14);
      for (let i = 0; i < n; i++, k++) list.push({ kind: kind === 'bottle' ? 'bottle' : kind, color: color || '#3aa05a', x: 5.0 + (k % 7) * 0.4, y: 1.08, z: 3.35 + Math.floor(k / 7) * 0.25, ry: 0 });
      if (k >= 14) break;
    }
    void W;
    // 材料の薬草の束（床のかご）
    const herbs = Math.min(8, Math.ceil(d.mats.herbs || 0));
    for (let i = 0; i < herbs; i++) list.push({ kind: 'herbs', x: 1.7 + (i % 4) * 0.14, y: 0, z: K.D - 0.7 - Math.floor(i / 4) * 0.14, ry: 0 });
  },
  tavern(K, d, list) {
    const { W } = K, cw = Math.min(6, W - 6);
    const ale = (d.out.ale || 0);
    // 酒だる：麦酒5杯ぶんで1たる（横だる2、立てだる2、あふれは奥の壁ぞい）
    const nb = ale < 0.5 ? 0 : Math.min(6, Math.ceil(ale / 5));
    const spots = [['barrelLie', cw - 0.2, 0.5], ['barrelLie', cw + 0.7, 0.5], ['barrel', cw + 0.25, 1.4], ['barrel', cw + 1.1, 1.4], ['barrel', cw + 1.95, 1.4], ['barrel', cw + 1.95, 0.55]];
    for (let i = 0; i < nb; i++) { const [k, x, z] = spots[i]; list.push({ kind: k, x, y: 0, z, ry: 0 }); }
    // カウンターの上の食材（宿の蔵のパン・肉・魚）
    let k = 0;
    for (const g of ['bread', 'meat', 'fish']) { const q = Math.min(4, Math.ceil((d.mats[g] || 0) + (d.out[g] || 0))); for (let i = 0; i < q && k < 8; i++, k++) list.push({ kind: kindOf(g)[0], x: 0.8 + k * 0.6, y: 1.1, z: 2.55, ry: 0 }); }
    // 麦を仕込む麻袋
    const wheat = d.mats.wheat || 0;
    sacks(list, [[W - 4.6, 0.5], [W - 4.1, 0.5]], wheat < 0.3 ? 0 : Math.min(4, Math.ceil(wheat / 4)), 'sackT');
  },
  inn(K, d, list) {
    const { W, D } = K;
    const plan = innPlan(W, D), cz = plan.hallZ + 0.4;
    const ale = d.out.ale || 0;
    const n = ale < 0.5 ? 0 : Math.min(8, Math.ceil(ale / 2));
    for (let i = 0; i < n; i++) list.push({ kind: 'bottle', color: '#8a5a20', x: 2.15 + (i % 4) * 0.33, y: 1.08, z: cz + 0.2 + Math.floor(i / 4) * 0.25, ry: 0 });
    const food = Math.min(3, Math.ceil((d.mats.bread || 0) + (d.mats.meat || 0)));
    for (let i = 0; i < food; i++) list.push({ kind: i % 2 ? 'meat' : 'loaf', x: 0.7 + i * 0.35, y: 1.08, z: cz + 0.45, ry: 0 });
  },
  mill(K, d, list) {
    const { D } = K;
    const spots = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) spots.push([0.6 + c * 0.55, D - 0.6 - r * 0.55]);
    const wheat = d.mats.wheat || 0, flour = (d.out.flour_wheat || 0);
    const nw = wheat < 0.3 ? 0 : Math.min(9, Math.ceil(wheat / 5)), nf = flour < 0.3 ? 0 : Math.min(9, Math.ceil(flour / 4));
    sacks(list, spots, nw, 'sackT');
    // 粉袋は東の壁ぞい
    const fsp = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) fsp.push([K.W - 2.4 + c * 0.5, 1.0 + r * 0.55]);
    sacks(list, fsp, nf, 'sackF');
  },
  workshop(K, d, list) {
    const { W, D } = K;
    // 材木の山（interior.js と同じ場所。数に合わせて段を積む）
    const wood = d.mats.wood || 0;
    const layers = wood < 0.3 ? 0 : Math.min(5, Math.ceil(wood / 4));
    for (let i = 0; i < layers; i++) for (let j = 0; j < 4 - (i >> 1); j++) list.push({ kind: 'plank', x: W - 3.2 + j * 0.02 + 1.3, y: i * 0.2, z: D - 2.0 + j * 0.28 + (i % 2) * 0.12 + 0.13, ry: 0 });
    // 東の壁の品の棚（2段）と、その前の家具
    list.push({ kind: 'shelf2', x: W - 0.25, y: 0, z: 6.0, ry: 0, fixed: true });
    const goods = sortGoods(d.out, (g) => kindOf(g)[0] !== 'stool');
    let k = 0;
    for (const [g, q] of goods) {
      const [kind, color] = kindOf(g);
      const n = Math.min(20 - k, q < 0.5 ? 0 : q < 6 ? Math.ceil(q) : q < 21 ? 6 : 8);
      for (let i = 0; i < n; i++, k++) list.push({ kind, color, x: W - 0.25, y: k < 10 ? 0.58 : 1.08, z: 4.0 + (k % 10) * 0.42, ry: HALF });
      if (k >= 20) break;
    }
    const stools = Math.min(4, Math.floor((d.out.furniture || 0) + 0.5));
    for (let i = 0; i < stools; i++) list.push({ kind: 'stool', x: W - 1.2, y: 0, z: 4.3 + i * 0.9, ry: 0 });
  },
  market(K, d, list) {
    const { W, D } = K;
    const stalls = [];
    for (let x = 1; x + 3.2 < W; x += 4) stalls.push([x, 1]);
    for (let x = 2; x + 3.2 < W; x += 4.5) stalls.push([x, D - 3.5]);
    const goods = sortGoods(d.out, (g) => !['wood', 'stone', 'ore'].includes(g)).slice(0, stalls.length);
    stalls.forEach(([x, z], i) => {
      const e = goods[i]; if (!e) return;
      const [kind, color] = kindOf(e[0]);
      const q = e[1];
      const n = q < 0.5 ? 0 : q < 6 ? Math.ceil(q) : q < 21 ? 8 : 12;
      for (let k = 0; k < n; k++) list.push({ kind, color, x: x + 0.35 + (k % 6) * 0.48, y: 0.85, z: z + 1.05 + Math.floor(k / 6) * 0.25, ry: 0 });
    });
  },
};

// ================================================================ 作る・毎フレーム・閉じる
function build(view, b, d) {
  const K = view.K, list = [];
  (LAYOUT[b.type] || (() => {}))(K, d, list);
  const { box, M } = lib();
  const bins = new Map();
  const mtx = new THREE.Matrix4(), part = new THREE.Matrix4(), rot = new THREE.Matrix4(), sc = new THREE.Matrix4();
  for (const e of list) {
    const parts = e.kind === 'plank' ? [[box(2.6, 0.2, 0.26), M.wood, 0, 0.1, 0]] : shape(e.kind, e.color);
    for (const [geo, mat, dx, dy, dz, rx = 0, rz = 0] of parts) {
      const key = geo.uuid + '|' + mat.uuid;
      let bin = bins.get(key);
      if (!bin) bins.set(key, (bin = { geo, mat, m: [] }));
      mtx.makeTranslation(e.x - K.W / 2, e.y, e.z - K.D / 2);
      rot.makeRotationY(e.ry || 0); mtx.multiply(rot);
      part.makeTranslation(dx, dy, dz);
      mtx.multiply(part);
      if (rx) { rot.makeRotationX(rx); mtx.multiply(rot); }
      if (rz) { rot.makeRotationZ(rz); mtx.multiply(rot); }
      if (e.sx) { sc.makeScale(1, e.sx, 1); mtx.multiply(sc); }   // 横に寝かせた筒（薪・材木）は長さを伸ばす
      bin.m.push(mtx.clone());
    }
  }
  const group = new THREE.Group();
  for (const bin of bins.values()) {
    const im = new THREE.InstancedMesh(bin.geo, bin.mat, bin.m.length);
    bin.m.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere?.();
    group.add(im);
  }
  group.userData.count = list.length;
  return group;
}
// 中身の要約（変わったときだけ作り直す）
function signature(d) {
  const q = (o) => Object.entries(o).filter(([, n]) => n >= 0.3).map(([g, n]) => `${g}:${n < 6 ? Math.ceil(n) : n < 21 ? Math.round(n / 2) * 2 : Math.round(n / 5) * 5}`).sort().join(',');
  return `${q(d.out)}|${q(d.mats)}|${(d.items || []).map((x) => x.id).join(',')}`;
}
export function shelfAttach(view, b) {
  shelfDetach(view);
  if (!b || !TYPES.has(b.type) || !view.scene || !view.K) return;
  if (b.tribe && b.style) return;   // 奥地の民族の家は別の内装
  const d = wsDisplay(view.sim, b);
  if (!d) return;
  const group = build(view, b, d);
  view.scene.add(group);
  view._shelf = { group, b, sig: signature(d), t: 0 };
}
// ---------- 職場の中の人の動き（ドット絵） ----------
// 着いて立っている人（寝台・寝ている人は除く）を、personAnimState の動きのシートに差し替える。歩いている間は歩行シートに戻す
const SHOW = new Set(['eat', 'drink', 'talk', 'pray', 'cry', 'cheer', 'wave', 'beg']);
const texOf = new WeakMap();
function sheetTex(sh) {
  let t = texOf.get(sh);
  if (!t) {
    t = new THREE.CanvasTexture(sh.canvas);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(1 / sh.cols, 1 / sh.rows);
    texOf.set(sh, t);
  }
  return t;
}
function restore(r) {
  if (!r._ws0) return;
  r.sprite.material.map = r._ws0.map; r.sprite.scale.set(r._ws0.sx, r._ws0.sy, 1); r.sprite.material.needsUpdate = true;
  r._ws0 = null;
}
function posePeople(view, now) {
  const sim = view.sim;
  for (const r of view.ents.values()) {
    if (!r.human) continue;
    const e = sim.S.people[r.id];
    let anim = null;
    if (e && !r.path.length && !r.lie && !(r.slot && r.slot.lie) && e.deathYear == null) {
      try { anim = personAnimState(sim, e, false); } catch (err) { anim = null; }
      if (anim && !(anim.startsWith('work') || SHOW.has(anim))) anim = null;
    }
    if (!anim) { restore(r); continue; }
    let sh = null;
    try { sh = drawPersonAnim(e, { age: sim.ageOf(e) }, anim); } catch (err) { sh = null; }
    if (!sh) { restore(r); continue; }
    const tex = sheetTex(sh);
    if (!r._ws0) r._ws0 = { map: r.sprite.material.map, sx: r.sprite.scale.x, sy: r.sprite.scale.y };
    if (r.sprite.material.map !== tex) { r.sprite.material.map = tex; r.sprite.material.needsUpdate = true; }
    const f = animFrameAt(sh, now + (r.id % 7) * 0.13);
    const row = sh.rows >= 4 ? (r.dir ?? 0) : 0;
    tex.offset.set(f / sh.cols, 1 - (row + 1) / sh.rows);
    r.sprite.scale.set(sh.worldW || sh.frameW * (sh.worldH / sh.frameH), sh.worldH, 1);
  }
}
export function shelfTick(view, dt, now) {
  const s = view._shelf;
  if (!s || !view.scene) return;
  if (now != null) posePeople(view, now);
  s.t += dt || 0;
  if (s.t < 3) return;
  s.t = 0;
  const d = wsDisplay(view.sim, s.b);
  if (!d) return;
  const sig = signature(d);
  if (sig === s.sig) return;
  view.scene.remove(s.group);
  for (const m of s.group.children) m.dispose?.();
  s.group = build(view, s.b, d);
  view.scene.add(s.group);
  s.sig = sig;
}
export function shelfDetach(view) {
  const s = view._shelf;
  if (!s) return;
  view.scene?.remove(s.group);
  for (const m of s.group.children) m.dispose?.();
  view._shelf = null;
}
// 試験用：いまの棚に並んでいる品の数
export function shelfCount(view) { return view._shelf?.group?.userData?.count || 0; }
