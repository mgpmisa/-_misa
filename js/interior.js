// 内装ビュー：建物とダンジョンの中を、外の世界と同じドット絵ボクセルで描く
//
//   const iv = new InteriorView(canvas, sim);
//   const { title, subtitle } = iv.open(buildingId);
//   毎フレーム iv.update(realDt) / クリックで iv.pick(x, y) / iv.close()
//
// 部屋の座標は「マス」単位（x:東へ, z:南へ）。0..W × 0..D が床。北(z=0)と西(x=0)が奥の壁。
// 壁は4面とも作り、カメラ側の2面だけを毎フレーム隠す（回しても中が見える）。
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { TEX, buildTextures, canvasTex, noiseTex, personTexture } from './textures.js';
import { SPECIES, KINGDOMS } from './data.js';
import * as SPR from './sprites.js';
import { makeRng } from './rng.js';
import * as TH from './tribehome.js'; // 奥地の民族の家の内装

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const DUNGEONS = new Set(['cave', 'pyramid', 'demoncastle']);
const OPEN_AIR = new Set(['market', 'ruins']);
const INSIDE_ROLES = new Set(['guardian', 'leader', 'treasure', 'overlord', 'castleguard', 'aide']);
const BOSS_ROLES = new Set(['leader', 'treasure', 'overlord']);
const LABEL = {
  house: '民家', castle: '玉座の間', church: '聖堂', tavern: '酒場', bakery: 'パン屋', smithy: '鍛冶場', workshop: '工房', market: '市場',
  guild: '冒険者ギルド', barracks: '兵舎', prison: '牢獄', magictower: '魔法の塔', mansion: '屋敷', clinic: '診療所', school: '学校',
  stable: '厩舎', mill: '風車小屋', lighthouse: '灯台', observatory: '展望台', mine: '坑道', hideout: '盗賊のアジト', ruins: '遺跡',
  well: '井戸の底', cave: '洞窟の迷宮', pyramid: 'ピラミッドの回廊', demoncastle: '魔王城',
  guardpost: '門の詰所', academy: '魔法学園の教室', dojo: '剣術道場', fort: '砦の中', camp: '開拓者の小屋', drillyard: '練兵場',
};

function strHash(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
const hash2 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ================================================================ テクスチャと材質（一度だけ作って使い回す）
let LIB = null;
function px(g, x, y, c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
function lib() {
  if (LIB) return LIB;
  if (!TEX.planks) buildTextures();
  const T = {};
  const hsh = (x, y, s) => hash2(x * 31 + s * 7777, y * 17 + s);
  T.books = canvasTex(16, 16, (g) => {
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 3; row++) {
      const y0 = 1 + row * 5;
      let x = 1;
      while (x < 15) {
        const w = hsh(x, row, 1) > 0.6 ? 2 : 1, hgt = 3 + (hsh(x, row, 2) > 0.5 ? 1 : 0);
        const cols = ['#8a2a2a', '#2a4a8a', '#2a6a3a', '#8a6a2a', '#5a2a6a', '#c9b48a', '#1a1a1a'];
        g.fillStyle = cols[(hsh(x, row, 3) * cols.length) | 0];
        g.fillRect(x, y0 + 4 - hgt, Math.min(w, 15 - x), hgt);
        if (hsh(x, row, 4) > 0.6) px(g, x, y0 + 4 - hgt + 1, '#e0c070');
        x += w;
      }
      g.fillStyle = '#6e4526'; g.fillRect(0, y0 + 4, 16, 1);
    }
    g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); g.fillRect(0, 0, 16, 1);
  }, true);
  T.bottles = canvasTex(16, 16, (g) => {
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 3; row++) {
      const y0 = 1 + row * 5;
      for (let x = 1; x < 15; x += 2) {
        const c = ['#3a8a4a', '#8a3a2a', '#c9b44a', '#4a6ab8', '#b86ab8', '#e8e8e8'][(hsh(x, row, 5) * 6) | 0];
        if (hsh(x, row, 6) > 0.25) { g.fillStyle = c; g.fillRect(x, y0 + 1, 1, 3); px(g, x, y0, '#d8c8a0'); }
      }
      g.fillStyle = '#6e4526'; g.fillRect(0, y0 + 4, 16, 1);
    }
  }, true);
  T.window = canvasTex(8, 8, (g) => {
    g.fillStyle = '#a8dcff'; g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#e8f6ff'; g.fillRect(1, 1, 2, 1); g.fillRect(1, 2, 1, 1); g.fillRect(5, 5, 1, 1);
    g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, 8, 1); g.fillRect(0, 7, 8, 1); g.fillRect(0, 0, 1, 8); g.fillRect(7, 0, 1, 8); g.fillRect(3, 0, 2, 8); g.fillRect(0, 3, 8, 1);
  });
  T.stained = canvasTex(8, 16, (g) => {
    const cols = ['#d9263a', '#2a5ad9', '#e8c040', '#3ab85a', '#a040d0', '#40c0e0'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) g.fillStyle = cols[(hash2((x >> 1) + 3, (y >> 1) * 7) * cols.length) | 0], g.fillRect(x, y, 1, 1);
    g.fillStyle = '#1a1414';
    for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 8, 1);
    g.fillRect(0, 0, 1, 16); g.fillRect(7, 0, 1, 16); g.fillRect(3, 0, 1, 16);
    g.fillStyle = '#fff4c0'; g.fillRect(2, 4, 4, 1); g.fillRect(3, 2, 2, 5);
    g.clearRect(0, 0, 2, 1); g.clearRect(6, 0, 2, 1); g.clearRect(0, 1, 1, 1); g.clearRect(7, 1, 1, 1);
  });
  T.blackboard = canvasTex(16, 8, (g) => {
    g.fillStyle = '#6e4526'; g.fillRect(0, 0, 16, 8);
    g.fillStyle = '#2a4a3a'; g.fillRect(1, 1, 14, 6);
    g.fillStyle = '#e8f0e8'; g.fillRect(2, 2, 5, 1); g.fillRect(2, 4, 3, 1); g.fillRect(6, 4, 1, 1); g.fillRect(9, 2, 1, 3); g.fillRect(8, 3, 3, 1); g.fillRect(12, 3, 2, 1); g.fillRect(12, 5, 2, 1);
  });
  T.notice = canvasTex(16, 12, (g) => {
    g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 16, 12);
    g.fillStyle = '#b8844a'; g.fillRect(1, 1, 14, 10);
    const papers = [[2, 2, 3, 4], [6, 2, 3, 3], [10, 2, 4, 4], [2, 7, 4, 3], [7, 6, 3, 4], [11, 7, 3, 3]];
    for (const [x, y, w, h] of papers) {
      g.fillStyle = hash2(x, y) > 0.5 ? '#f2ead8' : '#e8d8a8'; g.fillRect(x, y, w, h);
      g.fillStyle = '#8a7a6a'; for (let yy = y + 1; yy < y + h; yy += 1) g.fillRect(x + 1, yy, w - 2, 1);
      px(g, x + ((w / 2) | 0), y, '#c93a32');
    }
  });
  T.portrait = canvasTex(12, 16, (g) => {
    g.fillStyle = '#c9a03a'; g.fillRect(0, 0, 12, 16);
    g.fillStyle = '#2a2430'; g.fillRect(1, 1, 10, 14);
    g.fillStyle = '#6a2a3a'; g.fillRect(2, 10, 8, 5);
    g.fillStyle = '#e0b890'; g.fillRect(4, 4, 4, 5);
    g.fillStyle = '#4a3020'; g.fillRect(3, 3, 6, 2); g.fillRect(3, 4, 1, 3); g.fillRect(8, 4, 1, 3);
    g.fillStyle = '#f0d060'; g.fillRect(4, 2, 4, 1);
  });
  T.starchart = canvasTex(16, 16, (g) => {
    g.fillStyle = '#18204a'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#c9a03a'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
    g.fillStyle = '#5a6aa8'; g.fillRect(3, 5, 5, 1); g.fillRect(7, 5, 1, 5); g.fillRect(8, 10, 4, 1);
    for (let i = 0; i < 14; i++) px(g, 2 + ((hash2(i, 3) * 12) | 0), 2 + ((hash2(i, 9) * 12) | 0), hash2(i, 1) > 0.7 ? '#ffe070' : '#e8f0ff');
  });
  T.magic = canvasTex(32, 32, (g) => {
    const c = '#b070ff', c2 = '#e8c0ff';
    for (let a = 0; a < 360; a += 1.5) {
      const r = a * Math.PI / 180;
      px(g, Math.round(16 + Math.cos(r) * 15), Math.round(16 + Math.sin(r) * 15), c);
      px(g, Math.round(16 + Math.cos(r) * 12), Math.round(16 + Math.sin(r) * 12), c2);
      px(g, Math.round(16 + Math.cos(r) * 5), Math.round(16 + Math.sin(r) * 5), c);
    }
    for (let k = 0; k < 5; k++) {
      const a1 = (k * 144 - 90) * Math.PI / 180, a2 = ((k + 1) * 144 - 90) * Math.PI / 180;
      for (let t = 0; t <= 1; t += 0.03) px(g, Math.round(16 + (Math.cos(a1) * (1 - t) + Math.cos(a2) * t) * 12), Math.round(16 + (Math.sin(a1) * (1 - t) + Math.sin(a2) * t) * 12), c2);
    }
    for (let k = 0; k < 8; k++) { const r = k * Math.PI / 4; g.fillStyle = c2; g.fillRect(Math.round(16 + Math.cos(r) * 13.5) - 1, Math.round(16 + Math.sin(r) * 13.5) - 1, 2, 2); }
  });
  T.redMagic = canvasTex(32, 32, (g) => { g.drawImage(T.magic.image, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ff3a4a'; g.fillRect(0, 0, 32, 32); });
  const carpet = (base, edge, dot) => canvasTex(16, 16, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { if ((x + y) % 8 === 0 && (x - y + 16) % 8 === 4) px(g, x, y, dot); else if (hash2(x + 40, y) > 0.9) px(g, x, y, edge); }
  }, true);
  T.carpet = carpet('#a3202a', '#8a1a22', '#e0b84a');
  T.carpetBlue = carpet('#2a4a8a', '#223e74', '#e0c070');
  T.carpetGreen = carpet('#2f6a44', '#275a39', '#e8d8a0');
  T.carpetPurple = carpet('#5a2a6a', '#4a2258', '#e0b84a');
  T.mosaic = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const chk = ((x >> 3) + (y >> 3)) % 2 === 0;
      const edge = x % 8 === 0 || y % 8 === 0;
      px(g, x, y, edge ? '#8a847a' : chk ? (hash2(x, y) > 0.9 ? '#e0dcd2' : '#d4cfc4') : (hash2(x, y) > 0.9 ? '#9a948a' : '#a8a296'));
    }
  }, true);
  T.parquet = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const q = ((x >> 2) + (y >> 2)) % 2 === 0;
      const line = q ? y % 4 === 0 : x % 4 === 0;
      px(g, x, y, line ? '#5a3418' : hash2(x, y + 3) > 0.85 ? '#b07a44' : q ? '#9a6232' : '#8a562a');
    }
  }, true);
  T.whiteTile = canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 8 === 0 || y % 8 === 0 ? '#b8c0c0' : hash2(x, y + 9) > 0.9 ? '#ffffff' : '#e8ecea'); }, true);
  T.plaster = noiseTex('#e8dcc4', 71, 0.03, (g) => { g.fillStyle = '#c9b89a'; g.fillRect(0, 15, 16, 1); });
  T.wallpaper = canvasTex(16, 16, (g) => {
    g.fillStyle = '#6a2a3a'; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x % 8 === 3 || x % 8 === 4) && y % 4 !== 0) px(g, x, y, '#7a3446');
    for (let y = 2; y < 16; y += 8) for (let x = 0; x < 16; x += 8) { px(g, x + 3, y, '#c9a03a'); px(g, x + 4, y, '#c9a03a'); px(g, x + 3, y + 1, '#c9a03a'); }
  }, true);
  T.hay = noiseTex('#d9b54a', 72, 0.08, (g) => { for (let i = 0; i < 10; i++) { g.fillStyle = hash2(i, 72) > 0.5 ? '#f0d070' : '#b08a30'; g.fillRect((hash2(i, 5) * 14) | 0, (hash2(i, 6) * 16) | 0, 3, 1); } });
  T.straw = noiseTex('#b89a58', 73, 0.07, (g) => { for (let i = 0; i < 12; i++) { g.fillStyle = hash2(i, 73) > 0.5 ? '#d8b870' : '#8a6a38'; g.fillRect((hash2(i, 7) * 14) | 0, (hash2(i, 8) * 16) | 0, 2, 1); } });
  T.sack = noiseTex('#d8c49a', 74, 0.05, (g) => { g.fillStyle = '#a8946a'; g.fillRect(0, 3, 16, 1); });
  T.caveFloor = noiseTex('#5a524a', 75, 0.08, (g) => { for (let i = 0; i < 6; i++) { px(g, (hash2(i, 75) * 16) | 0, (hash2(i, 76) * 16) | 0, '#3e3832'); px(g, (hash2(i, 77) * 16) | 0, (hash2(i, 78) * 16) | 0, '#7a7068'); } });
  T.caveWall = noiseTex('#6e665c', 79, 0.09, (g) => { for (let i = 0; i < 5; i++) { const x = (hash2(i, 79) * 14) | 0, y = (hash2(i, 80) * 14) | 0; px(g, x, y, '#4a443c'); px(g, x + 1, y, '#8e867a'); px(g, x, y + 1, '#4a443c'); } });
  T.sandFloor = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 8 === 0 || y % 8 === 0 ? '#a8844a' : hash2(x, y + 81) > 0.88 ? '#e8c890' : '#cfaa6a');
  }, true);
  T.glyphs = canvasTex(16, 16, (g) => {
    g.drawImage(TEX.sandstone.image, 0, 0);
    g.fillStyle = '#7a5a2a';
    const gl = [[2, 5, 1, 3], [3, 5, 2, 1], [9, 5, 3, 1], [10, 6, 1, 2], [5, 9, 1, 2], [4, 10, 3, 1], [12, 9, 1, 3], [11, 9, 1, 1], [13, 11, 1, 1]];
    for (const [x, y, w, h] of gl) g.fillRect(x, y, w, h);
    px(g, 6, 13, '#2a6ab8'); px(g, 12, 2, '#c93a32');
  }, true);
  T.demonFloor = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 8 === 0 || y % 8 === 0 ? '#1e1622' : hash2(x, y + 82) > 0.92 ? '#6a2233' : hash2(x, y + 83) > 0.5 ? '#3e3446' : '#383040');
  }, true);
  T.sarcophagus = canvasTex(8, 16, (g) => {
    g.fillStyle = '#c9a03a'; g.fillRect(0, 0, 8, 16);
    g.fillStyle = '#2a4a8a'; g.fillRect(1, 5, 6, 1); g.fillRect(1, 7, 6, 1); g.fillRect(1, 9, 6, 1); g.fillRect(2, 0, 4, 1);
    g.fillStyle = '#e0b890'; g.fillRect(2, 1, 4, 3);
    px(g, 3, 2, '#1a1a1a'); px(g, 4, 2, '#1a1a1a');
    g.fillStyle = '#8a6a2a'; g.fillRect(3, 11, 2, 4);
  });
  T.shield = canvasTex(8, 8, (g) => { g.fillStyle = '#6a6a74'; g.fillRect(1, 0, 6, 6); g.fillRect(2, 6, 4, 1); g.fillRect(3, 7, 2, 1); g.fillStyle = '#c93a32'; g.fillRect(2, 1, 4, 4); g.fillStyle = '#e0b84a'; g.fillRect(3, 1, 2, 4); g.fillRect(2, 2, 4, 1); });
  T.map = canvasTex(16, 12, (g) => { g.fillStyle = '#e8d8a8'; g.fillRect(0, 0, 16, 12); g.fillStyle = '#6aa0c8'; g.fillRect(0, 0, 16, 12); g.fillStyle = '#9ac070'; g.fillRect(2, 2, 7, 5); g.fillRect(9, 5, 5, 5); g.fillRect(4, 7, 3, 2); g.fillStyle = '#c93a32'; px(g, 5, 4, '#c93a32'); px(g, 11, 7, '#c93a32'); g.fillStyle = '#5a3a22'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 11, 16, 1); });
  // 鉱脈（光る石）
  const oreSpots = [];
  for (let i = 0; i < 7; i++) oreSpots.push([(hash2(i, 90) * 14) | 0, (hash2(i, 91) * 14) | 0, ['#40e0ff', '#ffd040', '#ff60c0', '#60ff90'][i % 4]]);
  T.ore = canvasTex(16, 16, (g) => { g.drawImage(TEX.rock.image, 0, 0); for (const [x, y, c] of oreSpots) { g.fillStyle = c; g.fillRect(x, y, 2, 2); px(g, x, y, '#ffffff'); } }, true);
  T.oreGlow = canvasTex(16, 16, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 16, 16); for (const [x, y, c] of oreSpots) { g.fillStyle = c; g.fillRect(x, y, 2, 2); } }, true);

  const L = (o, tile) => { const m = new THREE.MeshLambertMaterial(o); if (tile) m.userData.tile = tile; return m; };
  const E = (color, emissive, k = 1.4, o = {}) => L({ color, emissive, emissiveIntensity: k, ...o });
  const M = {
    planks: L({ map: TEX.planks }, 1), wood: L({ map: TEX.wood }, 1), darkWood: L({ map: TEX.wood, color: '#8a7a70' }, 1), timber: L({ map: TEX.timber }, 2), timber2: L({ map: TEX.timber2 }, 2),
    stone: L({ map: TEX.stone }, 1), plaza: L({ map: TEX.plaza }, 1), darkStone: L({ map: TEX.darkStone }, 1), darkBrick: L({ map: TEX.darkBrick }, 1), sandstone: L({ map: TEX.sandstone }, 1),
    glyphs: L({ map: T.glyphs }, 1.5), dirt: L({ map: TEX.dirt }, 1), rock: L({ map: TEX.rock }, 1), caveFloor: L({ map: T.caveFloor }, 1), caveWall: L({ map: T.caveWall }, 1),
    sandFloor: L({ map: T.sandFloor }, 1), demonFloor: L({ map: T.demonFloor }, 1), grass: L({ map: TEX.grass }, 1), mosaic: L({ map: T.mosaic }, 2), parquet: L({ map: T.parquet }, 1),
    whiteTile: L({ map: T.whiteTile }, 1), plaster: L({ map: T.plaster }, 1.5), wallpaper: L({ map: T.wallpaper }, 1), hay: L({ map: T.hay }, 1), straw: L({ map: T.straw }, 1), sack: L({ map: T.sack }),
    books: L({ map: T.books }, 1), bottles: L({ map: T.bottles }, 1), carpet: L({ map: T.carpet }, 1), carpetBlue: L({ map: T.carpetBlue }, 1), carpetGreen: L({ map: T.carpetGreen }, 1), carpetPurple: L({ map: T.carpetPurple }, 1),
    cloth: L({ map: TEX.cloth }, 1), awning: L({ map: TEX.awning }, 1), awning2: L({ map: TEX.awning2 }, 1),
    blackboard: L({ map: T.blackboard }), notice: L({ map: T.notice }), portrait: L({ map: T.portrait }), starchart: L({ map: T.starchart }), sarcophagus: L({ map: T.sarcophagus }), shield: L({ map: T.shield }), mapTex: L({ map: T.map }),
    iron: L({ color: '#4a4a52' }), steel: L({ color: '#b8c0cc' }), gold: L({ color: '#e0b84a' }), brass: L({ color: '#b8883a' }), black: L({ color: '#16121a' }), white: L({ color: '#f2eee4' }),
    red: L({ color: '#b82a32' }), blue: L({ color: '#2f5ab0' }), green: L({ color: '#3a8a3a' }), leaf: L({ color: '#4a9a3a' }), brown: L({ color: '#7a4a26' }), beige: L({ color: '#e0d0a8' }),
    bread: L({ color: '#c98a3a' }), apple: L({ color: '#d0302a' }), orange: L({ color: '#e8902a' }), fish: L({ color: '#9ab0c0' }), meat: L({ color: '#b8504a' }), cabbage: L({ color: '#8ac050' }),
    purple: L({ color: '#7a3aa0' }), pink: L({ color: '#e090b0' }), bone: L({ color: '#e8e0c8' }), soot: L({ color: '#2a2622' }), clay: L({ color: '#b86a40' }), water: L({ map: TEX.water.clone(), transparent: true, opacity: 0.88 }, 1),
    fire: E('#ffb040', '#ff7a1a', 1.6), fire2: E('#ffd070', '#ffa030', 1.6), coal: E('#8a2a0a', '#ff4a10', 1.2), candle: E('#fff0c0', '#ffd070', 1.4), lava: L({ map: TEX.lava.clone(), emissive: '#ff5a1a', emissiveIntensity: 1.1 }, 1),
    win: L({ map: T.window, emissive: '#cfeaff', emissiveMap: T.window, emissiveIntensity: 0.8 }), stained: L({ map: T.stained, emissive: '#ffffff', emissiveMap: T.stained, emissiveIntensity: 0.9, transparent: true, alphaTest: 0.5 }),
    magic: L({ map: T.magic, emissive: '#c080ff', emissiveMap: T.magic, emissiveIntensity: 1.6, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    redMagic: L({ map: T.redMagic, emissive: '#ff4050', emissiveMap: T.redMagic, emissiveIntensity: 1.6, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    crystal: E('#60d0ff', '#40b0ff', 1.2), redCrystal: E('#c01a3a', '#ff2a4a', 1.2), greenGlow: E('#50e070', '#40ff60', 1.0), mushroom: E('#60ffd0', '#40e0c0', 1.1),
    ore: L({ map: T.ore, emissive: '#ffffff', emissiveMap: T.oreGlow, emissiveIntensity: 1.3 }, 1), lamp: E('#fff4c0', '#ffe080', 2.0), daylight: E('#fff8e0', '#fff4d0', 1.0),
    purpleFire: E('#d080ff', '#a040ff', 1.8), shadow: new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }),
    beam: L({ color: '#fff4c8', emissive: '#fff0b0', emissiveIntensity: 0.6, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  };
  for (const m of [M.water, M.lava]) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; m.map.needsUpdate = true; }
  M.lava.emissiveMap = M.lava.map;
  M.caps = { rock: L({ color: '#2a2622' }), sand: L({ color: '#6a5028' }), demon: L({ color: '#140c16' }) };
  M.banner = (color) => (M['ban' + color] = M['ban' + color] || L({ color, side: THREE.DoubleSide }));
  M.tinted = (color) => (M['tint' + color] = M['tint' + color] || L({ color }));
  LIB = { T, M };
  return LIB;
}

// UV をワールドの大きさに合わせる（タイル状の材質は 1マス = テクスチャ1枚）
function tileUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / s, uv.getY(k) * dims[f][1] / s); }
}

// ================================================================ 部屋を組み立てる道具
class Kit {
  constructor(W, D, seed, M) {
    this.W = W; this.D = D; this.M = M;
    this.R = makeRng(seed);
    this.bins = new Map();
    this.groups = { main: new THREE.Group(), N: new THREE.Group(), S: new THREE.Group(), W: new THREE.Group(), E: new THREE.Group() };
    this.blocked = new Uint8Array(W * D);
    this.floor = null; // ダンジョンのときだけ（0:岩 1:床 2:通れない床）
    this.slots = [];
    this.lights = [];
    this.spin = [];
    this.decos = [];
    this.door = { x: W / 2, z: D - 0.6 };
    this.wallH = 2.4;
    this.open = false;
  }
  add(geo, mat, cx, cy, cz, o = {}) {
    if (o.rx) geo.rotateX(o.rx);
    if (o.rz) geo.rotateZ(o.rz);
    if (o.ry) geo.rotateY(o.ry);
    if (o.dyn) { // 動かすもの：中心を原点にしたまま位置だけずらす（その場で回せる）
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx - this.W / 2, cy, cz - this.D / 2);
      this.groups[o.g || 'main'].add(m);
      return m;
    }
    geo.translate(cx - this.W / 2, cy, cz - this.D / 2);
    const key = (o.g || 'main') + '|' + mat.uuid;
    let b = this.bins.get(key);
    if (!b) this.bins.set(key, (b = { g: o.g || 'main', mat, geos: [] }));
    b.geos.push(geo);
    return null;
  }
  // x,z,y は角（最小側）。w,h,d は大きさ
  box(x, y, z, w, h, d, mat, o = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const t = o.tile ?? mat.userData.tile;
    if (t) tileUV(geo, w, h, d, t);
    return this.add(geo, mat, x + w / 2, y + h / 2, z + d / 2, o);
  }
  cyl(cx, y, cz, r, h, mat, o = {}) {
    const geo = new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 8, 1, !!o.openEnded);
    return this.add(geo, mat, cx, y + (o.centered ? 0 : h / 2), cz, o);
  }
  sphere(cx, y, cz, r, mat, o = {}) { return this.add(new THREE.SphereGeometry(r, o.seg || 8, o.seg2 || 6), mat, cx, y, cz, o); }
  torus(cx, y, cz, R, tube, mat, o = {}) { return this.add(new THREE.TorusGeometry(R, tube, 4, o.seg || 16), mat, cx, y, cz, o); }
  plane(cx, y, cz, w, d, mat, o = {}) { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return this.add(g, mat, cx, y, cz, o); }
  solid(x, z, w, d) {
    for (let zz = Math.floor(z + 0.05); zz < Math.ceil(z + d - 0.05); zz++) for (let xx = Math.floor(x + 0.05); xx < Math.ceil(x + w - 0.05); xx++) if (xx >= 0 && zz >= 0 && xx < this.W && zz < this.D) this.blocked[zz * this.W + xx] = 1;
  }
  slot(k, x, z, o = {}) { const s = { k, x, z, y: o.y || 0, face: o.face || null, lie: !!o.lie, room: o.room ?? -1, taken: null, cap: o.cap || 1, n: 0 }; this.slots.push(s); return s; }
  light(x, y, z, color, intensity = 3, dist = 7, flick = 1) { this.lights.push({ x, y, z, color, intensity, dist, flick }); }
  walkable(x, z) {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.D) return false;
    if (this.floor) return this.floor[cz * this.W + cx] === 1;
    return !this.blocked[cz * this.W + cx];
  }
  finish() {
    for (const b of this.bins.values()) {
      const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      for (const g of b.geos) if (g !== geo) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, b.mat);
      this.groups[b.g].add(mesh);
    }
    this.bins.clear();
  }
}

// ---------------------------------------------------------------- 家具
const F = {
  // 床と4面の壁（窓・扉・柱つき）
  room(K, o) {
    const { W, D, M } = K;
    const h = K.wallH = o.h || 2.4, t = 0.35;
    K.box(-t, -0.3, -t, W + 2 * t, 0.3, D + 2 * t, o.floor);
    const wallMat = o.wall;
    const winSet = { N: new Set(o.win?.N || []), S: new Set(o.win?.S || []), W: new Set(o.win?.W || []), E: new Set(o.win?.E || []) };
    const winMat = o.winMat || M.win;
    const wy0 = o.winY ?? 0.9, wy1 = o.winTop ?? Math.min(h - 0.4, 1.9);
    const run = (side, len) => {
      for (let i = 0; i < len; i++) {
        const isWin = winSet[side].has(i);
        const isDoor = side === 'S' && o.door != null && i === Math.floor(o.door);
        const seg = (y0, y1, mat, inset = 0) => {
          if (y1 <= y0) return;
          if (side === 'N') K.box(i, y0, -t + inset, 1, y1 - y0, t - inset * 2, mat, { g: 'N' });
          if (side === 'S') K.box(i, y0, D + inset, 1, y1 - y0, t - inset * 2, mat, { g: 'S' });
          if (side === 'W') K.box(-t + inset, y0, i, t - inset * 2, y1 - y0, 1, mat, { g: 'W' });
          if (side === 'E') K.box(W + inset, y0, i, t - inset * 2, y1 - y0, 1, mat, { g: 'E' });
        };
        if (isDoor) { seg(0, 1.7, M.darkWood, 0.08); seg(1.7, h, wallMat); }
        else if (isWin) { seg(0, wy0, wallMat); seg(wy0, wy1, winMat, 0.1); seg(wy1, h, wallMat); }
        else seg(0, h, wallMat);
      }
    };
    run('N', W); run('S', W); run('W', D); run('E', D);
    // 角の柱と上の縁
    const trim = o.trim || M.darkWood;
    for (const [x, z, g] of [[-t, -t, 'N'], [W, -t, 'N'], [-t, D, 'S'], [W, D, 'S']]) K.box(x, 0, z, t, h + 0.1, t, trim, { g });
    K.box(-t, h, -t, W + 2 * t, 0.12, t, trim, { g: 'N' }); K.box(-t, h, D, W + 2 * t, 0.12, t, trim, { g: 'S' });
    K.box(-t, h, 0, t, 0.12, D, trim, { g: 'W' }); K.box(W, h, 0, t, 0.12, D, trim, { g: 'E' });
    K.box(0, 0, -0.06, W, 0.14, 0.06, trim, { g: 'N' }); K.box(-0.06, 0, 0, 0.06, 0.14, D, trim, { g: 'W' });
    if (o.beams) {
      for (let x = 3; x < W - 1; x += 4) if (!winSet.N.has(x)) K.box(x - 0.08, 0, -0.05, 0.16, h, 0.05, trim, { g: 'N' });
      for (let z = 3; z < D - 1; z += 4) if (!winSet.W.has(z)) K.box(-0.05, 0, z - 0.08, 0.05, h, 0.16, trim, { g: 'W' });
    }
    if (o.door != null) K.door = { x: Math.floor(o.door) + 0.5, z: D - 0.5 };
    // 窓から差し込む光の筋
    if (o.sunbeams !== false) {
      for (const i of winSet.W) K.box(0.02, 0.01, i + 0.1, 2.2, 0.01, 0.8, M.beam, { g: 'W' });
      for (const i of winSet.N) K.box(i + 0.1, 0.01, 0.02, 0.8, 0.01, 1.8, M.beam, { g: 'N' });
    }
  },
  winAt(n, len, R) { // 壁に等間隔で窓
    const out = [];
    if (n <= 0) return out;
    const step = len / (n + 1);
    for (let k = 1; k <= n; k++) out.push(Math.round(step * k + (R ? R.range(-0.4, 0.4) : 0)));
    return out.filter((v) => v > 0 && v < len - 1);
  },
  bed(K, x, z, o = {}) { // 1×2（dir:'z' のとき南北に長い）。double のときは夫婦で寝る幅広の寝台
    const M = K.M, alongZ = o.dir !== 'x', dbl = !!o.double;
    const w = alongZ ? (dbl ? 1.6 : 1) : 2, d = alongZ ? 2 : (dbl ? 1.6 : 1);
    const lo = o.poor;
    const fh = lo ? 0.12 : 0.32;
    if (!lo) {
      K.box(x + 0.05, 0, z + 0.05, w - 0.1, fh, d - 0.1, o.frame || M.wood);
      if (alongZ) K.box(x + 0.05, 0, z + 0.02, w - 0.1, 0.75, 0.14, o.frame || M.wood); else K.box(x + 0.02, 0, z + 0.05, 0.14, 0.75, d - 0.1, o.frame || M.wood);
    }
    K.box(x + 0.1, fh, z + 0.1, w - 0.2, 0.14, d - 0.2, lo ? M.straw : M.white);
    const bl = o.blanket || M.red;
    if (alongZ) { K.box(x + 0.08, fh + 0.1, z + 0.75, w - 0.16, 0.08, d - 0.85, bl); K.box(x + 0.22, fh + 0.14, z + 0.22, 0.56, 0.1, 0.36, M.white); }
    else { K.box(x + 0.75, fh + 0.1, z + 0.08, w - 0.85, 0.08, d - 0.16, bl); K.box(x + 0.22, fh + 0.14, z + 0.22, 0.36, 0.1, 0.56, M.white); }
    if (o.canopy) {
      for (const [px_, pz_] of [[x + 0.05, z + 0.05], [x + w - 0.15, z + 0.05], [x + 0.05, z + d - 0.15], [x + w - 0.15, z + d - 0.15]]) K.box(px_, 0, pz_, 0.1, 2.0, 0.1, M.darkWood);
      K.box(x, 2.0, z, w, 0.12, d, o.canopy);
    }
    K.solid(x, z, w, d);
    const bs = K.slot('bed', x + w / 2, z + d / 2, { y: fh + 0.18, lie: true, face: alongZ ? [0, 1] : [1, 0], cap: dbl ? 2 : 1 });
    if (dbl) { bs.double = true; bs.spots = alongZ ? [[-0.38, 0], [0.38, 0]] : [[0, -0.38], [0, 0.38]]; bs.occ = []; }
    if (o.upper) { // 二段ベッド
      const y2 = 1.1;
      for (const [px_, pz_] of [[x + 0.05, z + 0.05], [x + w - 0.15, z + 0.05], [x + 0.05, z + d - 0.15], [x + w - 0.15, z + d - 0.15]]) K.box(px_, 0, pz_, 0.1, y2 + 0.5, 0.1, M.wood);
      K.box(x + 0.05, y2, z + 0.05, w - 0.1, 0.12, d - 0.1, M.wood);
      K.box(x + 0.1, y2 + 0.12, z + 0.1, w - 0.2, 0.12, d - 0.2, M.white);
      if (alongZ) K.box(x + 0.08, y2 + 0.2, z + 0.75, w - 0.16, 0.08, d - 0.85, o.blanket2 || bl); else K.box(x + 0.75, y2 + 0.2, z + 0.08, w - 0.85, 0.08, d - 0.16, o.blanket2 || bl);
      K.slot('bed', x + w / 2, z + d / 2, { y: y2 + 0.32, lie: true, face: alongZ ? [0, 1] : [1, 0] });
    }
  },
  table(K, x, z, w, d, o = {}) {
    const M = K.M, h = o.h ?? 0.72, top = o.top || M.wood;
    K.box(x, h - 0.1, z, w, 0.1, d, top);
    for (const [lx, lz] of [[x + 0.08, z + 0.08], [x + w - 0.2, z + 0.08], [x + 0.08, z + d - 0.2], [x + w - 0.2, z + d - 0.2]]) K.box(lx, 0, lz, 0.12, h - 0.1, 0.12, o.legs || M.darkWood);
    if (o.cloth) K.box(x - 0.04, h, z + d * 0.2, w + 0.08, 0.02, d * 0.6, o.cloth);
    K.solid(x, z, w, d);
    return h;
  },
  roundTable(K, cx, cz, r = 0.6, o = {}) {
    const M = K.M;
    K.cyl(cx, 0.62, cz, r, 0.1, o.top || M.wood, { seg: 10 });
    K.cyl(cx, 0, cz, 0.1, 0.62, M.darkWood, { seg: 6 });
    K.cyl(cx, 0, cz, 0.3, 0.05, M.darkWood, { seg: 8 });
    K.solid(cx - 0.5, cz - 0.5, 1, 1);
  },
  chair(K, cx, cz, face, o = {}) { // face: 座った人が向く向き [fx,fz]
    const M = K.M, mat = o.mat || M.wood;
    K.box(cx - 0.22, 0, cz - 0.22, 0.44, 0.42, 0.44, mat);
    if (!o.stool) {
      const bx = cx - face[0] * 0.2, bz = cz - face[1] * 0.2;
      if (face[0] !== 0) K.box(bx - 0.04, 0.42, cz - 0.22, 0.08, 0.5, 0.44, mat); else K.box(cx - 0.22, 0.42, bz - 0.04, 0.44, 0.5, 0.08, mat);
    }
    if (o.cushion) K.box(cx - 0.2, 0.42, cz - 0.2, 0.4, 0.05, 0.4, o.cushion);
  },
  bench(K, x, z, w, o = {}) { // 東西に長い長椅子。北を向く
    const M = K.M;
    K.box(x, 0.36, z + 0.1, w, 0.08, 0.5, o.mat || M.wood);
    K.box(x, 0.36, z + 0.6, w, 0.6, 0.08, o.mat || M.wood);
    for (let i = 0; i <= w; i += Math.max(1, w / 2)) K.box(Math.min(x + i, x + w - 0.1), 0, z + 0.2, 0.1, 0.36, 0.4, M.darkWood);
  },
  shelf(K, x, z, w, side, mat, o = {}) { // 壁ぎわの棚。side は背にする壁
    const M = K.M, h = o.h || 1.8, dp = o.dp || 0.45;
    if (side === 'N') K.box(x, 0, z, w, h, dp, M.wood), K.box(x + 0.04, 0.05, z + dp, w - 0.08, h - 0.1, 0.02, mat);
    else if (side === 'W') K.box(x, 0, z, dp, h, w, M.wood), K.box(x + dp, 0.05, z + 0.04, 0.02, h - 0.1, w - 0.08, mat);
    else if (side === 'E') K.box(x - dp, 0, z, dp, h, w, M.wood), K.box(x - dp - 0.02, 0.05, z + 0.04, 0.02, h - 0.1, w - 0.08, mat);
    if (side === 'N') K.solid(x, z, w, 1); else if (side === 'W') K.solid(x, z, 1, w); else K.solid(x - 1, z, 1, w);
  },
  openShelf(K, x, z, len, side, items) { // 品物が見える棚（北か西の壁）
    const M = K.M, h = 1.7, dp = 0.45;
    const alongX = side === 'N';
    const B = (a, y, b, w, hh, d, m) => (alongX ? K.box(x + a, y, z + b, w, hh, d, m) : K.box(x + b, y, z + a, d, hh, w, m));
    B(0, 0, 0, len, h, 0.06, M.darkWood);
    B(0, 0, 0, 0.08, h, dp, M.wood); B(len - 0.08, 0, 0, 0.08, h, dp, M.wood);
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.05 + lv * 0.52;
      B(0, y, 0, len, 0.06, dp, M.wood);
      if (lv === 3) break;
      for (let i = 0; i < Math.floor(len / 0.42); i++) {
        const m = items[(i + lv) % items.length];
        if (hash2(i * 7 + lv, Math.floor(x * 13 + z * 7)) < 0.15) continue;
        B(0.12 + i * 0.42, y + 0.06, 0.1, 0.32, 0.16 + (i % 2) * 0.04, 0.28, m);
      }
    }
    if (alongX) K.solid(x, z, len, 1); else K.solid(x, z, 1, len);
  },
  barrel(K, cx, cz, o = {}) {
    const M = K.M, h = o.h || 0.8, r = o.r || 0.3, y = o.y || 0;
    if (o.lying) {
      K.cyl(cx, y + r, cz, r, h, M.wood, { rz: Math.PI / 2, centered: true, seg: 8 });
      K.cyl(cx - h * 0.3, y + r, cz, r + 0.02, 0.06, M.iron, { rz: Math.PI / 2, centered: true, seg: 8 });
      K.cyl(cx + h * 0.3, y + r, cz, r + 0.02, 0.06, M.iron, { rz: Math.PI / 2, centered: true, seg: 8 });
      K.cyl(cx + h / 2 + 0.01, y + r, cz, r * 0.7, 0.02, M.darkWood, { rz: Math.PI / 2, centered: true, seg: 8 });
    } else {
      K.cyl(cx, y, cz, r, h, M.wood, { seg: 8, r2: r });
      K.cyl(cx, y + h * 0.18, cz, r + 0.02, 0.06, M.iron, { seg: 8 });
      K.cyl(cx, y + h * 0.78, cz, r + 0.02, 0.06, M.iron, { seg: 8 });
    }
    if (!y) K.solid(cx - 0.3, cz - 0.3, 0.6, 0.6);
  },
  crate(K, x, z, s = 0.6, y = 0, mat) { K.box(x, y, z, s, s, s, mat || K.M.planks); if (!y) K.solid(x, z, s, s); },
  sack(K, cx, cz, o = {}) { const M = K.M; K.cyl(cx, 0, cz, 0.24, 0.45, M.sack, { r2: 0.18, seg: 7 }); K.cyl(cx, 0.45, cz, 0.08, 0.1, M.sack, { seg: 5 }); },
  candle(K, cx, cz, y = 0, o = {}) { // 燭台
    const M = K.M;
    if (!o.noStand) { K.cyl(cx, y, cz, 0.16, 0.06, M.brass, { seg: 6 }); K.cyl(cx, y, cz, 0.04, o.h || 1.2, M.brass, { seg: 4 }); }
    const top = y + (o.noStand ? 0 : o.h || 1.2);
    const arms = o.arms || 1;
    for (let i = 0; i < arms; i++) {
      const ox = arms > 1 ? (i - (arms - 1) / 2) * 0.22 : 0;
      K.box(cx + ox - 0.04, top, cz - 0.04, 0.08, 0.16, 0.08, M.white, o);
      K.box(cx + ox - 0.03, top + 0.16, cz - 0.03, 0.06, 0.08, 0.06, M.candle, o);
    }
    if (arms > 1) K.box(cx - arms * 0.11, top - 0.03, cz - 0.03, arms * 0.22, 0.04, 0.06, M.brass, o);
    if (o.light !== false) K.light(cx, top + 0.4, cz, '#ffc070', o.li || 1.6, o.ld || 4.5, 1);
    if (!o.noStand) K.solid(cx - 0.2, cz - 0.2, 0.4, 0.4);
  },
  chandelier(K, cx, cz, y, o = {}) {
    const M = K.M, R = o.r || 0.7;
    K.torus(cx, y, cz, R, 0.05, M.brass, { rx: Math.PI / 2, seg: 12 });
    K.box(cx - 0.02, y, cz - 0.02, 0.04, (o.chain || 1.2), 0.04, M.iron);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; K.box(cx + Math.cos(a) * R - 0.04, y, cz + Math.sin(a) * R - 0.04, 0.08, 0.14, 0.08, M.white); K.box(cx + Math.cos(a) * R - 0.03, y + 0.14, cz + Math.sin(a) * R - 0.03, 0.06, 0.08, 0.06, M.candle); }
    K.light(cx, y - 0.2, cz, '#ffd090', o.li || 3.2, o.ld || 9, 1);
  },
  torch(K, side, pos, y = 1.5, o = {}) { // 壁の松明
    const M = K.M, { W, D } = K;
    let x, z;
    if (side === 'N') { x = pos; z = 0.12; } else if (side === 'S') { x = pos; z = D - 0.12; } else if (side === 'W') { x = 0.12; z = pos; } else { x = W - 0.12; z = pos; }
    const g = o.g || side;
    K.box(x - 0.05, y - 0.35, z - 0.05, 0.1, 0.4, 0.1, M.darkWood, { g });
    K.box(x - 0.08, y + 0.02, z - 0.08, 0.16, 0.14, 0.16, o.fire || M.fire, { g });
    K.box(x - 0.05, y + 0.14, z - 0.05, 0.1, 0.1, 0.1, M.fire2, { g });
    K.light(x + (side === 'W' ? 0.5 : side === 'E' ? -0.5 : 0), y + 0.3, z + (side === 'N' ? 0.5 : side === 'S' ? -0.5 : 0), o.color || '#ff9a40', o.li || 2.4, o.ld || 6, 1);
  },
  hearth(K, x, w, o = {}) { // 北の壁の暖炉（x から幅 w）
    const M = K.M, mat = o.mat || M.stone, h = K.wallH;
    K.box(x, 0, 0, w, 1.3, 0.7, mat);
    K.box(x + 0.25, 1.3, 0, w - 0.5, h - 1.3, 0.5, mat, { g: 'N' });
    K.box(x - 0.1, 1.25, 0, w + 0.2, 0.15, 0.85, M.darkWood);
    K.box(x + 0.3, 0.05, 0.3, w - 0.6, 0.85, 0.42, M.soot);
    K.box(x + 0.45, 0.06, 0.45, w - 0.9, 0.12, 0.3, M.coal);
    K.box(x + w / 2 - 0.25, 0.15, 0.55, 0.5, 0.32, 0.12, M.fire);
    K.box(x + w / 2 - 0.12, 0.3, 0.6, 0.24, 0.3, 0.1, M.fire2);
    K.solid(x, 0, w, 1);
    K.light(x + w / 2, 0.8, 1.2, '#ff9a40', o.li || 4, 8, 1.4);
  },
  rug(K, x, z, w, d, mat, border) {
    const M = K.M;
    K.box(x, 0, z, w, 0.025, d, border || M.gold);
    K.box(x + 0.12, 0.005, z + 0.12, w - 0.24, 0.03, d - 0.24, mat);
  },
  pillar(K, cx, cz, h, mat, o = {}) {
    const M = K.M, r = o.r || 0.32;
    if (o.round) K.cyl(cx, 0.2, cz, r, h - 0.4, mat, { seg: 8 });
    else K.box(cx - r, 0.2, cz - r, r * 2, h - 0.4, r * 2, mat);
    K.box(cx - r - 0.1, 0, cz - r - 0.1, r * 2 + 0.2, 0.2, r * 2 + 0.2, o.cap || mat);
    K.box(cx - r - 0.1, h - 0.2, cz - r - 0.1, r * 2 + 0.2, 0.2, r * 2 + 0.2, o.cap || mat);
    K.solid(cx - 0.4, cz - 0.4, 0.8, 0.8);
  },
  wallPic(K, side, pos, y, w, h, mat, o = {}) { // 壁に貼るもの（絵・掲示板・黒板・旗）
    const { W, D } = K;
    if (side === 'N') K.box(pos - w / 2, y, -0.02, w, h, 0.06, mat, { g: 'N', ...o });
    else if (side === 'W') K.box(-0.02, y, pos - w / 2, 0.06, h, w, mat, { g: 'W', ...o });
    else if (side === 'E') K.box(W - 0.04, y, pos - w / 2, 0.06, h, w, mat, { g: 'E', ...o });
    else K.box(pos - w / 2, y, D - 0.04, w, h, 0.06, mat, { g: 'S', ...o });
  },
  banner(K, side, pos, color, y = 0.8, h = 1.6) {
    const M = K.M, mat = M.banner(color);
    F.wallPic(K, side, pos, y, 0.7, h, mat);
    F.wallPic(K, side, pos, y + h, 0.9, 0.06, M.gold);
    // 裾の切れ込みと紋章
    if (side === 'N') { K.box(pos - 0.12, y + h * 0.5, 0.04, 0.24, 0.3, 0.02, M.gold, { g: 'N' }); }
    else if (side === 'W') { K.box(0.04, y + h * 0.5, pos - 0.12, 0.02, 0.3, 0.24, M.gold, { g: 'W' }); }
    else if (side === 'E') { K.box(K.W - 0.06, y + h * 0.5, pos - 0.12, 0.02, 0.3, 0.24, M.gold, { g: 'E' }); }
  },
  plant(K, cx, cz, o = {}) {
    const M = K.M;
    K.cyl(cx, 0, cz, 0.2, 0.35, M.clay, { r2: 0.24, seg: 7 });
    K.sphere(cx, 0.6, cz, o.r || 0.32, M.leaf, { seg: 6, seg2: 4 });
    K.solid(cx - 0.25, cz - 0.25, 0.5, 0.5);
  },
  chest(K, x, z, o = {}) {
    const M = K.M, w = o.w || 0.8, d = o.d || 0.55;
    K.box(x, 0, z, w, 0.4, d, o.mat || M.brown);
    K.box(x - 0.02, 0.4, z - 0.02, w + 0.04, 0.16, d + 0.04, o.mat || M.brown);
    K.box(x + 0.1, 0, z - 0.03, 0.08, 0.56, d + 0.06, M.iron); K.box(x + w - 0.18, 0, z - 0.03, 0.08, 0.56, d + 0.06, M.iron);
    K.box(x + w / 2 - 0.06, 0.28, z + d, 0.12, 0.14, 0.04, M.gold);
    if (o.open) { K.box(x + 0.05, 0.4, z + 0.05, w - 0.1, 0.12, d - 0.1, M.gold); }
    K.solid(x, z, w, d);
  },
  goldPile(K, cx, cz, r = 1) {
    const M = K.M;
    K.cyl(cx, 0, cz, r, r * 0.5, M.gold, { r2: r * 0.15, seg: 10 });
    for (let i = 0; i < 6; i++) { const a = i * 1.1, rr = r * (0.6 + (i % 3) * 0.2); K.cyl(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr, 0.12, 0.05, M.gold, { seg: 6 }); }
    K.box(cx - 0.12, r * 0.4, cz - 0.1, 0.24, 0.2, 0.2, M.redCrystal);
    K.solid(cx - r * 0.6, cz - r * 0.6, r * 1.2, r * 1.2);
  },
  stool(K, cx, cz) { F.chair(K, cx, cz, [0, 1], { stool: true }); },
  cauldron(K, cx, cz, glow) {
    const M = K.M;
    K.cyl(cx, 0.1, cz, 0.45, 0.5, M.iron, { r2: 0.5, seg: 10 });
    K.cyl(cx, 0.58, cz, 0.42, 0.04, glow || M.greenGlow, { seg: 10 });
    K.box(cx - 0.3, 0, cz - 0.05, 0.1, 0.12, 0.1, M.iron); K.box(cx + 0.2, 0, cz - 0.05, 0.1, 0.12, 0.1, M.iron);
    K.solid(cx - 0.5, cz - 0.5, 1, 1);
    K.light(cx, 1.2, cz, glow === M.redCrystal ? '#ff4040' : '#60ff80', 1.8, 4.5, 0.6);
  },
  stairs(K, x, z, n, dir, mat, h = 0.28) { // 段々（dir: 'N' 奥へ上がる, 'W' 西へ上がる）
    for (let i = 0; i < n; i++) {
      if (dir === 'N') K.box(x, 0, z - i * 0.5 - 0.5, 1.2, (i + 1) * h, 0.5, mat);
      else K.box(x - i * 0.5 - 0.5, 0, z, 0.5, (i + 1) * h, 1.2, mat);
    }
  },
  armor(K, cx, cz) { // 鎧の置物
    const M = K.M;
    K.box(cx - 0.25, 0, cz - 0.25, 0.5, 0.12, 0.5, M.darkWood);
    K.box(cx - 0.14, 0.12, cz - 0.1, 0.28, 0.55, 0.2, M.steel);
    K.box(cx - 0.2, 0.67, cz - 0.14, 0.4, 0.45, 0.28, M.steel);
    K.box(cx - 0.12, 1.12, cz - 0.12, 0.24, 0.26, 0.24, M.steel);
    K.box(cx - 0.02, 1.38, cz - 0.02, 0.04, 0.14, 0.04, M.red);
    K.solid(cx - 0.3, cz - 0.3, 0.6, 0.6);
  },
  weaponRack(K, x, z, w, side = 'N') { // 壁ぎわの武器掛け
    const M = K.M;
    if (side === 'N') {
      K.box(x, 0, z, w, 0.12, 0.35, M.darkWood); K.box(x, 1.1, z, w, 0.1, 0.35, M.darkWood);
      for (let i = 0; i < w * 3 - 1; i++) {
        const cx = x + 0.3 + i * 0.33;
        if (i % 3 === 2) { K.box(cx - 0.02, 0.1, z + 0.15, 0.04, 1.7, 0.04, M.darkWood); K.box(cx - 0.05, 1.8, z + 0.13, 0.1, 0.22, 0.08, M.steel); }
        else { K.box(cx - 0.04, 0.2, z + 0.15, 0.08, 1.1, 0.03, M.steel); K.box(cx - 0.1, 0.35, z + 0.14, 0.2, 0.05, 0.05, M.brass); }
      }
      K.solid(x, z, w, 0.5);
    } else {
      K.box(x, 0, z, 0.35, 0.12, w, M.darkWood); K.box(x, 1.1, z, 0.35, 0.1, w, M.darkWood);
      for (let i = 0; i < w * 3 - 1; i++) {
        const cz = z + 0.3 + i * 0.33;
        if (i % 3 === 2) { K.box(x + 0.15, 0.1, cz - 0.02, 0.04, 1.7, 0.04, M.darkWood); K.box(x + 0.13, 1.8, cz - 0.05, 0.08, 0.22, 0.1, M.steel); }
        else { K.box(x + 0.15, 0.2, cz - 0.04, 0.03, 1.1, 0.08, M.steel); K.box(x + 0.14, 0.35, cz - 0.1, 0.05, 0.05, 0.2, M.brass); }
      }
      K.solid(x, z, 0.5, w);
    }
  },
  dummy(K, cx, cz) { // 訓練用の人形
    const M = K.M;
    K.box(cx - 0.05, 0, cz - 0.05, 0.1, 1.1, 0.1, M.darkWood);
    K.cyl(cx, 0.6, cz, 0.22, 0.6, M.hay, { seg: 7 });
    K.box(cx - 0.45, 1.0, cz - 0.05, 0.9, 0.1, 0.1, M.darkWood);
    K.sphere(cx, 1.38, cz, 0.18, M.sack, { seg: 6, seg2: 4 });
    K.box(cx - 0.25, 0, cz - 0.25, 0.5, 0.08, 0.5, M.darkWood);
    K.solid(cx - 0.4, cz - 0.4, 0.8, 0.8);
  },
  bars(K, x0, z0, x1, z1, h = 2.0) { // 鉄格子（直線）
    const M = K.M;
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.25);
    for (let i = 0; i <= n; i++) { const t = i / n; K.box(x0 + (x1 - x0) * t - 0.03, 0, z0 + (z1 - z0) * t - 0.03, 0.06, h, 0.06, M.iron); }
    if (x0 === x1) { K.box(x0 - 0.05, h - 0.1, Math.min(z0, z1), 0.1, 0.1, len, M.iron); K.box(x0 - 0.05, 0.9, Math.min(z0, z1), 0.1, 0.06, len, M.iron); }
    else { K.box(Math.min(x0, x1), h - 0.1, z0 - 0.05, len, 0.1, 0.1, M.iron); K.box(Math.min(x0, x1), 0.9, z0 - 0.05, len, 0.06, 0.1, M.iron); }
  },
  stalag(K, cx, cz, h, mat) { K.cyl(cx, 0, cz, h * 0.28, h, mat, { r2: 0.02, seg: 6 }); },
  bones(K, cx, cz) {
    const M = K.M;
    K.box(cx - 0.25, 0, cz - 0.04, 0.5, 0.06, 0.08, M.bone, { ry: 0.6 });
    K.box(cx - 0.2, 0, cz - 0.04, 0.4, 0.06, 0.08, M.bone, { ry: -0.9 });
    K.sphere(cx + 0.15, 0.1, cz + 0.12, 0.1, M.bone, { seg: 6, seg2: 4 });
  },
  brazier(K, cx, cz, fire, o = {}) {
    const M = K.M;
    K.cyl(cx, 0, cz, 0.08, 0.8, o.stand || M.iron, { seg: 6 });
    K.cyl(cx, 0.8, cz, 0.28, 0.2, o.stand || M.iron, { r2: 0.36, seg: 8 });
    K.cyl(cx, 1.0, cz, 0.26, 0.2, fire || M.fire, { r2: 0.08, seg: 6 });
    K.solid(cx - 0.3, cz - 0.3, 0.6, 0.6);
    K.light(cx, 1.6, cz, o.color || '#ff9040', o.li || 3, o.ld || 7, 1.2);
  },
};

// ================================================================ 建物ごとの内装
function sizeOf(b) {
  const t = b.type;
  const fix = { guardpost: [8, 7], camp: [7, 6], fort: [14, 11], dojo: [14, 10], academy: [16, 12], well: [6, 6], lighthouse: [8, 8], mill: [9, 9], observatory: [10, 9], mine: [16, 8], stable: [15, 9], market: [16, 10], hideout: [13, 11], ruins: [14, 12] };
  if (fix[t]) return fix[t];
  if (t === 'castle') return [20, 16];
  if (t === 'house') return [clamp(b.w * 3 + 2, 7, 12), clamp(b.d * 3 + 1, 6, 10)];
  if (t === 'church') return [clamp(b.w * 3 + 2, 10, 15), clamp(b.d * 3 + 3, 11, 16)];
  return [clamp(Math.round(b.w * 3) + 2, 8, 18), clamp(Math.round(b.d * 3) + 3, 8, 16)];
}

const BUILD = {
  house(K, ctx) {
    const { M, R, W, D } = K;
    const hh = ctx.hh;
    const money = hh ? hh.money || 0 : 0;
    const members = hh ? hh.members.length : 0;
    const rich = money > 260 || hh?.royal, poor = !hh || money < 45;
    const wall = rich ? M.timber2 : poor ? M.plaster : M.timber;
    F.room(K, { floor: poor ? M.dirt : M.planks, wall, beams: true, door: Math.floor(W / 2), win: { N: F.winAt(1, W, R).map((x) => Math.min(x, W - 4)), W: F.winAt(1, D, R), E: F.winAt(1, D, R), S: [1] } });
    // かまど（北の壁の右寄り）
    const sx = W - 3;
    K.box(sx, 0, 0, 2, 0.8, 0.9, M.stone); K.box(sx + 0.3, 0.8, 0, 1.4, K.wallH - 0.8, 0.5, M.stone, { g: 'N' });
    K.box(sx + 0.55, 0.12, 0.7, 0.9, 0.4, 0.22, M.soot); K.box(sx + 0.7, 0.15, 0.78, 0.6, 0.22, 0.12, M.fire);
    K.cyl(sx + 1, 0.8, 0.45, 0.28, 0.28, M.iron, { seg: 8 }); K.solid(sx, 0, 2, 1);
    K.light(sx + 1, 0.9, 1.3, '#ff9a40', 2.8, 6, 1.3);
    K.slot('work', sx + 1, 1.5, { face: [0, -1] });
    // 棚とたる
    if (!poor || R.chance(0.5)) F.shelf(K, 1, 0, 2, 'N', M.bottles, { h: 1.6 });
    F.barrel(K, sx - 0.6, 0.45); if (!poor) F.barrel(K, sx - 0.6, 1.2, { h: 0.6 });
    // 寝台（世帯人数ぶん、西と東の壁ぞい）
    const nb = clamp(members || 1, 1, 6);
    const beds = [];
    for (let z = 2; z + 2 <= D - 1 && beds.length < nb; z += 2) beds.push([0.1, z]);
    for (let z = 2; z + 2 <= D - 1 && beds.length < nb; z += 2) beds.push([W - 1.1, z]);
    const blankets = [M.red, M.blue, M.green, M.purple, M.orange, M.pink];
    beds.forEach(([x, z], i) => F.bed(K, x, z, { double: i === 0 && members >= 2 && x < 1, poor, blanket: poor ? M.sack : blankets[(i + K.R.int(0, 5)) % 6], canopy: rich && i === 0 ? M.red : null, frame: rich ? M.darkWood : M.wood }));
    // 食卓と椅子
    const seats = clamp(Math.max(2, members), 2, 6);
    const tw = seats > 4 ? 3 : 2, tx = Math.floor(W / 2 - tw / 2), tz = Math.floor(D / 2) - 0.5;
    if (rich) F.rug(K, tx - 1.1, tz - 1.2, tw + 2.2, 3.4, M.carpet);
    else if (!poor) F.rug(K, tx - 0.6, tz - 0.8, tw + 1.2, 2.6, M.carpetGreen, M.brown);
    F.table(K, tx, tz, tw, 1, { cloth: rich ? M.white : null, top: poor ? M.planks : M.wood });
    K.box(tx + 0.3, 0.72, tz + 0.3, 0.3, 0.12, 0.3, M.bread); K.cyl(tx + tw - 0.5, 0.72, tz + 0.5, 0.14, 0.12, M.clay, { seg: 6 });
    let n = 0;
    for (let i = 0; i < tw && n < seats; i++, n++) { F.chair(K, tx + 0.5 + i, tz - 0.4, [0, 1], { stool: poor, cushion: rich ? M.red : null }); K.slot('eat', tx + 0.5 + i, tz - 0.4, { face: [0, 1] }); }
    for (let i = 0; i < tw && n < seats; i++, n++) { F.chair(K, tx + 0.5 + i, tz + 1.4, [0, -1], { stool: poor, cushion: rich ? M.red : null }); K.slot('eat', tx + 0.5 + i, tz + 1.4, { face: [0, -1] }); }
    if (n < seats) { F.chair(K, tx - 0.4, tz + 0.5, [1, 0], { stool: poor }); K.slot('eat', tx - 0.4, tz + 0.5, { face: [1, 0] }); }
    if (rich) {
      F.candle(K, tx + tw / 2, tz + 0.5, 0.72, { noStand: true, arms: 3 });
      F.wallPic(K, 'N', 4.2, 1.1, 0.7, 0.9, M.portrait);
      F.plant(K, 0.5, D - 0.6); F.plant(K, W - 0.5, D - 0.6);
      F.chest(K, 1.2, D - 0.9, { mat: M.darkWood });
    } else if (!poor) F.crate(K, 0.2, D - 0.8);
    else { F.sack(K, 0.5, D - 0.6); }
    if (!hh) { for (let i = 0; i < 6; i++) K.box(R.range(1, W - 2), 0, R.range(1, D - 2), R.range(0.2, 0.5), 0.05, R.range(0.2, 0.5), M.soot); }
  },

  castle(K, ctx) {
    const { M, R, W, D } = K;
    const col = KINGDOMS[ctx.b.kingdom]?.color || '#c93a32';
    const cx = W / 2;
    F.room(K, { floor: M.mosaic, wall: M.stone, h: 3.6, trim: M.darkStone, door: Math.floor(cx), win: { N: [2, W - 3], W: [3, 8, 13], E: [3, 8, 13] }, winTop: 2.8 });
    // 玉座の壇
    K.box(cx - 4, 0, 0, 8, 0.25, 3.4, M.stone); K.box(cx - 3, 0.25, 0, 6, 0.2, 2.6, M.stone);
    F.rug(K, cx - 2.6, 0.45, 5.2, 2.0, M.carpet);
    // 玉座
    const ty = 0.47;
    K.box(cx - 0.6, ty, 0.5, 1.2, 0.5, 0.9, M.gold); K.box(cx - 0.45, ty + 0.5, 0.6, 0.9, 0.08, 0.7, M.red);
    K.box(cx - 0.6, ty, 0.3, 1.2, 1.9, 0.25, M.gold); K.box(cx - 0.45, ty + 0.55, 0.52, 0.9, 1.2, 0.05, M.red);
    K.box(cx - 0.75, ty, 0.5, 0.18, 0.85, 0.9, M.gold); K.box(cx + 0.57, ty, 0.5, 0.18, 0.85, 0.9, M.gold);
    K.box(cx - 0.18, ty + 1.9, 0.33, 0.36, 0.3, 0.2, M.gold); K.box(cx - 0.08, ty + 2.0, 0.3, 0.16, 0.16, 0.05, M.redCrystal);
    K.slot('throne', cx, 1.1, { y: ty + 0.1, face: [0, 1] });
    for (const s of [-1, 1]) {
      const x = cx + s * 1.8;
      K.box(x - 0.4, ty, 0.6, 0.8, 0.45, 0.7, M.gold); K.box(x - 0.4, ty, 0.45, 0.8, 1.3, 0.18, M.gold); K.box(x - 0.3, ty + 0.45, 0.62, 0.6, 0.06, 0.6, M.blue);
      K.slot('royal', x, 1.1, { y: ty + 0.05, face: [0, 1] });
    }
    // 赤いじゅうたん（扉から壇まで）
    F.rug(K, cx - 1.1, 3.4, 2.2, D - 3.4, M.carpet);
    // 柱と燭台・衛兵の立ち位置
    for (let z = 4.5; z < D - 1.5; z += 3.5) {
      for (const s of [-1, 1]) {
        F.pillar(K, cx + s * 4.2, z, 3.6, M.stone, { r: 0.35, cap: M.darkStone });
        K.slot('guard', cx + s * 2.0, z + 0.3, { face: [-s, 0] });
      }
    }
    for (const s of [-1, 1]) { F.candle(K, cx + s * 3.2, 1.2, 0.25, { h: 1.4, arms: 3, li: 2.4 }); }
    // 国の旗
    for (const x of [cx - 5.5, cx - 3, cx + 3, cx + 5.5]) F.banner(K, 'N', x, col, 1.0, 2.0);
    for (const z of [5.5, 10.5]) { F.banner(K, 'W', z, col, 0.9, 1.8); F.banner(K, 'E', z, col, 0.9, 1.8); }
    F.wallPic(K, 'N', cx, 2.35, 1.3, 1.0, M.shield);
    F.chandelier(K, cx, 6.5, 3.0, { r: 0.9, li: 3.5, ld: 11 });
    F.chandelier(K, cx, 12, 3.0, { r: 0.9, li: 3.5, ld: 11 });
    // 脇の机（書記・大臣）
    F.table(K, 1, D - 5, 2, 1, { cloth: M.carpetBlue }); K.box(1.4, 0.72, D - 4.7, 0.5, 0.05, 0.4, M.white); F.candle(K, 2.6, D - 4.5, 0.72, { noStand: true, light: false });
    F.chair(K, 2, D - 3.6, [0, -1]); K.slot('work', 2, D - 3.6, { face: [0, -1] });
    F.table(K, W - 3, D - 5, 2, 1, { cloth: M.carpetBlue }); K.box(W - 2.4, 0.72, D - 4.7, 0.6, 0.12, 0.4, M.gold);
    F.chair(K, W - 2, D - 3.6, [0, -1]); K.slot('work', W - 2, D - 3.6, { face: [0, -1] });
    // 王の寝所（左右の奥）
    F.bed(K, 0.3, 0.3, { dir: 'x', canopy: M.banner(col), frame: M.darkWood, blanket: M.red });
    F.bed(K, W - 2.3, 0.3, { dir: 'x', canopy: M.banner(col), frame: M.darkWood, blanket: M.blue });
    F.bed(K, 0.3, 1.5, { dir: 'x', frame: M.darkWood, blanket: M.purple });
    F.bed(K, W - 2.3, 1.5, { dir: 'x', frame: M.darkWood, blanket: M.green });
    F.armor(K, 0.6, D - 1.2); F.armor(K, W - 0.6, D - 1.2);
    F.plant(K, 3.5, D - 0.6); F.plant(K, W - 3.5, D - 0.6);
  },

  church(K) {
    const { M, R, W, D } = K;
    const cx = W / 2;
    F.room(K, { floor: M.mosaic, wall: M.stone, h: 3.6, trim: M.darkStone, door: Math.floor(cx), winMat: M.stained, win: { N: [Math.floor(cx) - 2, Math.floor(cx) + 2], W: F.winAt(3, D), E: F.winAt(3, D) }, winY: 1.0, winTop: 3.0 });
    // 祭壇
    K.box(cx - 2.5, 0, 0, 5, 0.25, 2.6, M.stone);
    K.box(cx - 1.2, 0.25, 0.7, 2.4, 0.85, 0.8, M.stone); K.box(cx - 1.3, 1.1, 0.65, 2.6, 0.06, 0.9, M.white); K.box(cx - 0.3, 1.1, 0.64, 0.6, 0.02, 0.92, M.red);
    K.box(cx - 0.05, 1.16, 1.0, 0.1, 0.7, 0.1, M.gold); K.box(cx - 0.25, 1.56, 1.0, 0.5, 0.1, 0.1, M.gold);
    F.candle(K, cx - 0.9, 1.05, 1.16, { noStand: true, arms: 1, li: 1.2 }); F.candle(K, cx + 0.9, 1.05, 1.16, { noStand: true, arms: 1, li: 1.2 });
    K.solid(cx - 1.2, 0.7, 2.4, 0.8);
    K.slot('work', cx, 1.9, { y: 0.25, face: [0, 1] });
    // 丸いステンドグラス（北の壁の中央）
    F.wallPic(K, 'N', cx, 2.0, 1.2, 1.4, M.stained);
    F.candle(K, cx - 2.2, 1.6, 0.25, { h: 1.3, arms: 3, li: 2.2 }); F.candle(K, cx + 2.2, 1.6, 0.25, { h: 1.3, arms: 3, li: 2.2 });
    // 中央の通路のじゅうたんと長椅子
    F.rug(K, cx - 0.7, 2.6, 1.4, D - 2.6, M.carpet);
    const bw = Math.min(3.5, cx - 1.6);
    for (let z = 3.6; z < D - 1.8; z += 1.5) {
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? cx - 1.0 - bw : cx + 1.0;
        F.bench(K, x0, z, bw);
        K.solid(x0, z + 0.1, bw, 0.7);
        for (let i = 0; i < Math.floor(bw); i++) K.slot('pew', x0 + 0.5 + i, z + 0.35, { face: [0, -1], y: 0.05 });
      }
    }
    for (let z = 4; z < D - 1; z += 4) { F.torch(K, 'W', z, 1.8, { color: '#ffd080' }); F.torch(K, 'E', z, 1.8, { color: '#ffd080' }); }
    F.plant(K, 0.6, 0.6); F.plant(K, W - 0.6, 0.6);
  },

  tavern(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber2, beams: true, door: Math.floor(W / 2), win: { W: F.winAt(2, D), E: [], N: [], S: [1, W - 2] } });
    // カウンター（北西）と酒だる
    const cw = Math.min(6, W - 6);
    K.box(0.4, 0, 2.2, cw, 1.0, 0.6, M.wood); K.box(0.3, 1.0, 2.1, cw + 0.2, 0.1, 0.8, M.darkWood); K.solid(0.4, 2.2, cw, 0.8);
    for (let i = 0; i < 3; i++) K.cyl(1 + i * 1.2, 1.1, 2.5, 0.1, 0.2, M.brass, { seg: 6 });
    F.shelf(K, 0.4, 0, cw - 1, 'N', M.bottles, { h: 2.0 });
    for (let i = 0; i < 2; i++) F.barrel(K, cw - 0.2 + i * 0.9, 0.5, { lying: true, h: 0.9, r: 0.38 });
    F.barrel(K, cw + 0.25, 1.4, { h: 0.9 }); F.barrel(K, cw + 1.1, 1.4, { h: 0.9 });
    K.slot('work', 1.5, 1.4, { face: [0, 1] }); K.slot('work', 3.5, 1.4, { face: [0, 1] });
    for (let i = 0; i < Math.floor(cw / 1.3); i++) { const x = 1 + i * 1.3; F.stool(K, x, 3.35); K.slot('seat', x, 3.35, { face: [0, -1] }); }
    // 暖炉（北の壁の東寄り）
    F.hearth(K, W - 3.6, 2.2);
    F.rug(K, W - 4.2, 1.2, 3.4, 1.4, M.carpetGreen, M.brown);
    // 2階への階段（東の壁ぞい、南から北へ）
    for (let i = 0; i < 7; i++) K.box(W - 1.3, 0, D - 1.8 - i * 0.55, 1.2, 0.3 * (i + 1), 0.55, M.planks);
    K.box(W - 1.35, 0, D - 1.8 - 7 * 0.55, 1.3, 0.3 * 7, 0.1, M.darkWood);
    K.solid(W - 1.4, D - 1.8 - 7 * 0.55, 1.4, 7 * 0.55 + 0.6);
    for (let i = 0; i < 8; i++) K.box(W - 1.4, 0.3 * (i + 1), D - 1.3 - i * 0.55, 0.06, 0.9, 0.06, M.darkWood);
    // 丸テーブル
    const tables = [];
    for (let z = 5.2; z < D - 1.5; z += 3.4) for (let x = 3.2; x < W - 3.2; x += 3.6) tables.push([x + (Math.floor(z) % 2 ? 0.6 : 0), z]);
    for (const [x, z] of tables) {
      F.roundTable(K, x, z, 0.55);
      K.cyl(x - 0.15, 0.72, z, 0.08, 0.16, M.brass, { seg: 6 }); K.cyl(x + 0.2, 0.72, z + 0.1, 0.08, 0.16, M.brass, { seg: 6 });
      for (const [dx, dz] of [[-0.95, 0], [0.95, 0], [0, 0.95], [0, -0.95]]) { F.stool(K, x + dx, z + dz); K.slot('seat', x + dx, z + dz, { face: [-Math.sign(dx), -Math.sign(dz)] }); }
    }
    // 小さな舞台（南西）
    K.box(0, 0, D - 2.2, 2.2, 0.25, 2.2, M.wood); K.slot('stage', 1.1, D - 1.1, { y: 0.25, face: [1, -1] }); K.slot('stage', 1.6, D - 1.6, { y: 0.25, face: [1, -1] });
    F.chandelier(K, W / 2 - 1, D / 2 + 1, 2.1, { r: 0.6, chain: 0.4 });
    F.torch(K, 'W', 2.5, 1.6);
    F.wallPic(K, 'W', D / 2 + 1, 1.3, 0.8, 0.6, M.shield);
    // 宿の寝台（奥の間の代わりに東の壁ぞい）
    F.bed(K, W - 2.6, 3.0, { dir: 'z', blanket: M.green });
  },

  bakery(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.stone, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { W: F.winAt(1, D), E: F.winAt(1, D), N: [], S: [1] } });
    // 石窯
    const ox = W / 2 - 1.5;
    K.box(ox, 0, 0, 3, 1.0, 1.9, M.stone);
    K.sphere(ox + 1.5, 1.0, 0.95, 1.2, M.stone, { seg: 10, seg2: 6 });
    K.box(ox + 1.1, 1.8, 0, 0.8, K.wallH - 1.8, 0.6, M.stone, { g: 'N' });
    K.box(ox + 0.95, 0.9, 1.85, 1.1, 0.7, 0.12, M.soot);
    K.box(ox + 1.1, 0.92, 1.9, 0.8, 0.4, 0.1, M.fire); K.box(ox + 1.25, 1.05, 1.95, 0.5, 0.3, 0.08, M.fire2);
    K.solid(ox, 0, 3, 2);
    K.light(ox + 1.5, 1.2, 2.6, '#ff8a30', 4.5, 8, 1.4);
    K.box(ox + 3.2, 0, 0.3, 0.1, 1.8, 0.1, M.darkWood); K.box(ox + 3.1, 1.6, 0.25, 0.3, 0.3, 0.05, M.darkWood);
    K.slot('work', ox + 1.5, 2.6, { face: [0, -1] });
    // パン棚
    F.openShelf(K, 0.02, 1.2, 3.4, 'W', [M.bread, M.orange, M.bread]);
    F.openShelf(K, 0.6, 0.02, Math.min(2.6, ox - 0.8), 'N', [M.bread, M.bread, M.orange]);
    // こね台と粉袋
    F.table(K, W / 2 - 1, D / 2 + 0.5, 2, 1, { top: M.planks });
    K.box(W / 2 - 0.8, 0.72, D / 2 + 0.7, 0.6, 0.08, 0.5, M.beige); K.box(W / 2 + 0.2, 0.72, D / 2 + 0.7, 0.35, 0.14, 0.3, M.bread);
    K.slot('work', W / 2, D / 2 + 1.9, { face: [0, -1] });
    for (let i = 0; i < 4; i++) F.sack(K, 0.6 + (i % 2) * 0.55, D - 0.6 - Math.floor(i / 2) * 0.55);
    F.sack(K, W - 0.6, D - 0.6);
    // 売り台
    K.box(W - 3.6, 0, D - 2.2, 2.2, 0.9, 0.6, M.wood); K.solid(W - 3.6, D - 2.2, 2.2, 0.6);
    for (let i = 0; i < 4; i++) K.cyl(W - 3.3 + i * 0.5, 0.9, D - 1.9, 0.17, 0.14, i % 2 ? M.bread : M.orange, { seg: 7 });
    K.slot('work', W - 2.5, D - 2.8, { face: [0, 1] });
  },

  smithy(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.plaza, wall: M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { W: F.winAt(1, D), N: [], E: [], S: [1] } });
    // 炉
    K.box(0.3, 0, 0, 2.6, 0.95, 1.7, M.stone); K.box(0.6, 0.95, 0.3, 2.0, 0.12, 1.1, M.coal);
    K.box(0.8, 1.07, 0.5, 1.6, 0.1, 0.7, M.fire);
    K.box(0.4, 2.0, 0.1, 2.4, 0.3, 1.5, M.darkStone); K.box(0.9, 2.3, 0, 1.4, K.wallH - 2.3, 0.8, M.darkStone, { g: 'N' });
    K.solid(0.3, 0, 2.6, 2);
    K.light(1.6, 1.4, 1.2, '#ff6a20', 5, 8, 1.5);
    K.box(3.1, 0, 0.4, 0.8, 0.6, 0.8, M.brown); K.box(3.3, 0.6, 0.6, 0.5, 0.3, 0.4, M.brown); // ふいご
    K.slot('work', 1.6, 2.3, { face: [0, -1] });
    // 金床
    const ax = W / 2 + 0.5, az = D / 2;
    K.box(ax - 0.25, 0, az - 0.2, 0.5, 0.45, 0.4, M.darkWood);
    K.box(ax - 0.2, 0.45, az - 0.15, 0.4, 0.2, 0.3, M.iron); K.box(ax - 0.45, 0.65, az - 0.18, 0.9, 0.18, 0.36, M.iron); K.box(ax + 0.45, 0.7, az - 0.08, 0.25, 0.1, 0.16, M.iron);
    K.box(ax - 0.1, 0.83, az - 0.3, 0.1, 0.06, 0.5, M.darkWood);
    K.solid(ax - 0.5, az - 0.3, 1, 0.6);
    K.slot('work', ax, az + 0.8, { face: [0, -1] });
    // 武器掛け
    F.weaponRack(K, W - 3.4, 0.1, 3);
    F.wallPic(K, 'E', D / 2, 1.2, 0.7, 0.7, M.shield);
    // 水おけ
    K.box(0.3, 0, D / 2 + 0.2, 0.7, 0.5, 1.6, M.wood); K.box(0.38, 0.4, D / 2 + 0.28, 0.54, 0.05, 1.44, M.water); K.solid(0.3, D / 2 + 0.2, 0.7, 1.6);
    // 鉄材と炭
    for (let i = 0; i < 4; i++) K.box(W - 1.5, i * 0.1, D - 1.5 + i * 0.03, 1.1, 0.1, 0.18, M.iron);
    F.barrel(K, W - 0.6, D - 2.4); F.crate(K, 0.3, D - 1.0, 0.7, 0, M.darkWood);
    K.cyl(W - 2.5, 0, D - 1.3, 0.4, 0.3, M.soot, { r2: 0.1 });
  },

  workshop(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { N: F.winAt(1, W), W: F.winAt(1, D), E: [], S: [1] } });
    // 道具掛け（北の壁）
    K.box(0.6, 1.0, -0.02, 3.2, 1.0, 0.06, M.planks, { g: 'N' });
    const tools = [[0.9, 0.08, 0.6, M.darkWood], [1.3, 0.25, 0.1, M.steel], [1.7, 0.06, 0.7, M.darkWood], [2.2, 0.3, 0.2, M.steel], [2.7, 0.06, 0.55, M.darkWood], [3.2, 0.22, 0.12, M.iron]];
    for (const [x, w, h, m] of tools) K.box(x, 1.2, 0.04, w, h + 0.2, 0.05, m, { g: 'N' });
    // 作業台
    const benches = [[1, 1.2], [W - 4, 1.2], [W / 2 - 1.5, D / 2 + 0.6]];
    for (const [x, z] of benches) {
      F.table(K, x, z, 3, 1, { h: 0.85, top: M.tinted('#d8a870') });
      K.box(x + 0.3, 0.85, z + 0.3, 0.8, 0.1, 0.3, M.wood); K.box(x + 1.5, 0.85, z + 0.2, 0.15, 0.12, 0.6, M.steel); K.box(x + 2.2, 0.85, z + 0.4, 0.4, 0.2, 0.3, M.clay);
      K.slot('work', x + 1.5, z + 1.6, { face: [0, -1] });
    }
    // 木材の山
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4 - (i >> 1); j++) K.box(W - 3.2 + j * 0.02, i * 0.2, D - 2.0 + j * 0.28 + (i % 2) * 0.12, 2.6, 0.2, 0.26, M.wood);
    K.solid(W - 3.2, D - 2.0, 2.6, 1.3);
    // 馬（ひき台）と丸太
    K.box(1.2, 0.5, D - 2, 1.4, 0.1, 0.25, M.darkWood); K.box(1.3, 0, D - 2, 0.1, 0.5, 0.25, M.darkWood); K.box(2.4, 0, D - 2, 0.1, 0.5, 0.25, M.darkWood);
    K.cyl(0.6, 0.25, D - 0.8, 0.25, 1.2, M.wood, { rz: Math.PI / 2, centered: true });
    F.barrel(K, 0.5, D / 2);
    F.torch(K, 'N', W - 1.5, 1.7); F.torch(K, 'W', D - 1.5, 1.6); F.chandelier(K, W / 2, D / 2 + 1, 2.1, { r: 0.5, chain: 0.4 });
    for (let i = 0; i < 6; i++) K.box(R.range(1, W - 2), 0, R.range(3, D - 3), 0.2, 0.02, 0.08, M.beige, { ry: R.range(0, 3) });
  },

  market(K, ctx) {
    const { M, R, W, D } = K;
    K.open = true;
    K.box(-0.5, -0.3, -0.5, W + 1, 0.3, D + 1, M.plaza);
    const goods = [[M.apple, M.orange], [M.fish, M.fish], [M.cabbage, M.apple], [M.bread, M.bread], [M.meat, M.meat], [M.purple, M.pink]];
    const stalls = [];
    for (let x = 1; x + 3.2 < W; x += 4) stalls.push([x, 1]);
    for (let x = 2; x + 3.2 < W; x += 4.5) stalls.push([x, D - 3.5]);
    stalls.forEach(([x, z], i) => {
      const aw = i % 2 ? M.awning2 : M.awning;
      for (const [px_, pz_] of [[x, z], [x + 3, z], [x, z + 1.4], [x + 3, z + 1.4]]) K.box(px_, 0, pz_, 0.12, 2.1, 0.12, M.darkWood);
      K.box(x - 0.2, 2.1, z - 0.3, 3.5, 0.12, 2.1, aw, { rx: 0.12 });
      K.box(x, 0, z + 0.9, 3.1, 0.85, 0.6, M.wood); K.solid(x, z, 3.1, 1.5);
      const [g1, g2] = goods[(i + R.int(0, 5)) % goods.length];
      for (let k = 0; k < 6; k++) K.sphere(x + 0.35 + k * 0.48, 0.97, z + 1.2, 0.13, k % 2 ? g1 : g2, { seg: 6, seg2: 4 });
      F.crate(K, x + 0.2, z + 0.1, 0.55, 0, M.planks); F.crate(K, x + 2.3, z + 0.1, 0.55, 0, M.planks);
      K.slot('work', x + 1.5, z + 0.45, { face: [0, 1] });
    });
    for (let i = 0; i < 5; i++) F.barrel(K, R.range(1, W - 1), R.range(D / 2 - 1.5, D / 2 + 1.5), { h: 0.7 });
    F.sack(K, W - 0.8, D / 2); F.sack(K, W - 1.3, D / 2 + 0.3);
    K.door = { x: W / 2, z: D - 0.5 };
  },

  guild(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber2, beams: true, door: Math.floor(W / 2), win: { W: F.winAt(2, D), E: F.winAt(1, D), N: [], S: [1] } });
    // 依頼掲示板
    F.wallPic(K, 'N', W / 2, 0.8, 3.2, 1.6, M.notice);
    K.box(W / 2 - 1.7, 0.75, 0, 3.4, 0.08, 0.2, M.darkWood, { g: 'N' });
    // 受付カウンター（西）
    K.box(2.3, 0, 1, 0.6, 1.0, 4, M.wood); K.box(2.2, 1.0, 0.9, 0.8, 0.1, 4.2, M.darkWood); K.solid(2.2, 1, 0.8, 4);
    K.box(2.4, 1.1, 1.5, 0.4, 0.05, 0.5, M.white); K.box(2.45, 1.1, 3.4, 0.3, 0.25, 0.3, M.gold);
    F.shelf(K, 0, 0.6, 4, 'W', M.books);
    K.slot('work', 1.5, 2.2, { face: [1, 0] }); K.slot('work', 1.5, 3.8, { face: [1, 0] });
    for (let i = 0; i < 4; i++) K.slot('wait', 3.4, 1.6 + i * 0.8, { face: [-1, 0] });
    // テーブル
    const tabs = [[W / 2 - 0.5, D / 2 - 0.5], [W - 3.5, D / 2 + 1.5], [W / 2 - 1, D - 3]];
    for (const [x, z] of tabs) {
      if (x < 3.5) continue;
      F.table(K, x, z, 2, 1);
      K.box(x + 0.3, 0.72, z + 0.2, 0.7, 0.02, 0.5, M.mapTex); K.cyl(x + 1.5, 0.72, z + 0.5, 0.09, 0.18, M.brass, { seg: 6 });
      for (const [dx, dz, f] of [[0.5, -0.4, [0, 1]], [1.5, -0.4, [0, 1]], [0.5, 1.4, [0, -1]], [1.5, 1.4, [0, -1]]]) { F.stool(K, x + dx, z + dz); K.slot('seat', x + dx, z + dz, { face: f }); }
    }
    // 戦利品の飾り：魔物の首・交差した剣・盾
    const hx = W - 1.5;
    K.box(hx - 0.4, 1.6, -0.02, 0.8, 0.8, 0.12, M.darkWood, { g: 'N' });
    K.box(hx - 0.3, 1.7, 0.1, 0.6, 0.5, 0.45, M.green, { g: 'N' }); K.box(hx - 0.25, 1.75, 0.5, 0.5, 0.25, 0.25, M.green, { g: 'N' });
    K.box(hx - 0.32, 2.1, 0.2, 0.1, 0.35, 0.1, M.bone, { g: 'N' }); K.box(hx + 0.22, 2.1, 0.2, 0.1, 0.35, 0.1, M.bone, { g: 'N' });
    K.box(hx - 0.2, 1.95, 0.56, 0.08, 0.08, 0.02, M.redCrystal, { g: 'N' }); K.box(hx + 0.12, 1.95, 0.56, 0.08, 0.08, 0.02, M.redCrystal, { g: 'N' });
    F.wallPic(K, 'E', 2.5, 1.3, 1.4, 0.1, M.steel, { rx: 0.7 }); F.wallPic(K, 'E', 2.5, 1.3, 1.4, 0.1, M.steel, { rx: -0.7 });
    F.wallPic(K, 'E', D / 2, 1.2, 0.7, 0.7, M.shield);
    F.chest(K, W - 1.3, D - 1.2, { mat: M.darkWood }); F.barrel(K, W - 0.6, 1.5);
    F.torch(K, 'W', D - 2, 1.6); F.torch(K, 'N', 1.2, 1.7);
    F.chandelier(K, W / 2, D / 2, 2.1, { r: 0.6, chain: 0.4 });
  },

  barracks(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.plaza, wall: M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: F.winAt(2, W), W: [], E: [], S: [] } });
    // 二段ベッド（西と東の壁ぞい）
    for (let z = 0.3; z + 2 <= D - 1.5; z += 2.4) { F.bed(K, 0.1, z, { upper: true, blanket: M.blue, blanket2: M.blue }); F.chest(K, 1.25, z + 0.7, { w: 0.5, d: 0.6 }); }
    for (let z = 0.3; z + 2 <= D - 3.5; z += 2.4) F.bed(K, W - 1.1, z, { upper: true, blanket: M.blue, blanket2: M.blue });
    // 武器ラック
    F.weaponRack(K, W / 2 - 1.5, 0.1, 3);
    F.weaponRack(K, W - 0.5, D - 3.2, 3, 'W');
    // 訓練用の人形
    for (let i = 0; i < 2; i++) { const x = W / 2 - 1 + i * 2.2, z = D / 2 + 0.8; F.dummy(K, x, z); K.slot('work', x, z + 1.1, { face: [0, -1] }); }
    F.table(K, W / 2 - 1, 2.0, 2, 1); K.box(W / 2 - 0.8, 0.72, 2.2, 0.8, 0.02, 0.6, M.mapTex);
    K.slot('work', W / 2 - 0.4, 3.4, { face: [0, -1] }); K.slot('eat', W / 2 + 0.6, 3.4, { face: [0, -1] });
    F.wallPic(K, 'N', 3, 1.0, 0.7, 1.6, M.banner('#3a5ab8'));
    F.torch(K, 'W', D - 1.2, 1.6); F.torch(K, 'E', D - 1.2, 1.6);
    F.barrel(K, 0.6, D - 0.6);
  },

  prison(K, ctx) {
    const { M, W, D } = K;
    F.room(K, { floor: M.darkStone, wall: M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [] } });
    const n = Math.max(2, Math.floor((W - 0.5) / 3));
    const cw = (W - 0.4) / n, cd = 3;
    for (let i = 0; i < n; i++) {
      const x0 = 0.2 + i * cw;
      if (i > 0) K.box(x0 - 0.1, 0, 0, 0.2, 2.2, cd, M.stone);
      F.bars(K, x0 + 0.1, cd, x0 + cw - 0.1, cd, 2.1);
      K.box(x0 + 0.25, 0, 0.2, 1.1, 0.12, 0.7, M.straw);
      K.cyl(x0 + cw - 0.45, 0, 0.45, 0.16, 0.3, M.wood, { seg: 6 });
      K.box(x0 + cw / 2 - 0.2, 1.6, -0.02, 0.4, 0.3, 0.06, M.black, { g: 'N' }); // 小窓
      K.box(x0 + cw / 2 - 0.12, 1.64, -0.03, 0.02, 0.22, 0.08, M.iron, { g: 'N' }); K.box(x0 + cw / 2 + 0.1, 1.64, -0.03, 0.02, 0.22, 0.08, M.iron, { g: 'N' });
      K.slot('cell', x0 + cw / 2, cd / 2 + 0.3, { face: [0, 1], cap: 3 });
    }
    // 格子の外に立てないようにする（独房の中は自由）
    for (let x = 0; x < W; x++) K.blocked[3 * W + x] = 1;
    for (let z = 0; z < 3; z++) for (let x = 0; x < W; x++) K.blocked[z * W + x] = 1;
    // 看守の机
    F.table(K, 1, D - 3, 2, 1); K.box(1.3, 0.72, D - 2.8, 0.4, 0.05, 0.3, M.white);
    F.candle(K, 2.6, D - 2.5, 0.72, { noStand: true, light: false });
    F.chair(K, 2, D - 1.6, [0, -1]); K.slot('work', 2, D - 1.6, { face: [0, -1] });
    K.box(W - 1.2, 0, D - 2.4, 0.5, 1.8, 0.5, M.iron);
    F.wallPic(K, 'E', D - 2, 1.4, 0.5, 0.3, M.brass);
    for (let x = 2; x < W; x += 5) F.torch(K, 'S', x, 1.6, { g: 'S' });
    F.torch(K, 'W', D - 1, 1.6); F.torch(K, 'E', 4.5, 1.6);
    F.barrel(K, W - 0.6, D - 0.6);
  },

  magictower(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.darkStone, wall: M.stone, h: 3.2, trim: M.purple, door: Math.floor(W / 2), win: { N: [], W: [Math.floor(D / 2)], E: [Math.floor(D / 2)], S: [] }, winTop: 2.4 });
    for (let x = 0.2; x + 2 <= W - 0.2; x += 2.05) F.shelf(K, x, 0, 2, 'N', M.books, { h: 2.6 });
    F.shelf(K, 0, 1.2, Math.floor(D / 2) - 1.4, 'W', M.books, { h: 2.2 });
    F.shelf(K, 0, Math.floor(D / 2) + 1.2, D - Math.floor(D / 2) - 2.5, 'W', M.bottles, { h: 2.2 });
    // 魔法陣（回る）
    const cx = W / 2, cz = D / 2 + 0.3;
    K.spin.push({ mesh: K.plane(cx, 0.03, cz, 3.6, 3.6, M.magic, { dyn: true }), speed: 0.3, axis: 'y' });
    K.light(cx, 0.8, cz, '#b070ff', 3.5, 6, 0.4);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.785; K.box(cx + Math.cos(a) * 1.9 - 0.1, 0.8 + (k % 2) * 0.2, cz + Math.sin(a) * 1.9 - 0.1, 0.2, 0.35, 0.2, M.crystal, { ry: 0.785 }); }
    // 机と天球儀
    F.table(K, W - 3.2, 1.4, 2.2, 1); K.box(W - 3, 0.72, 1.6, 0.6, 0.12, 0.4, M.books); K.box(W - 2.2, 0.72, 1.7, 0.5, 0.02, 0.4, M.white);
    F.candle(K, W - 1.3, 1.7, 0.72, { noStand: true, li: 1.2 });
    F.chair(K, W - 2.1, 2.8, [0, -1]); K.slot('work', W - 2.1, 2.8, { face: [0, -1] });
    const gx = 1.6, gz = D - 1.8;
    K.cyl(gx, 0, gz, 0.3, 0.1, M.brass); K.cyl(gx, 0.1, gz, 0.05, 0.7, M.brass, { seg: 5 });
    K.sphere(gx, 1.25, gz, 0.2, M.blue, { seg: 8 });
    const arm = K.torus(gx, 1.25, gz, 0.45, 0.03, M.brass, { dyn: true, seg: 16 });
    K.torus(gx, 1.25, gz, 0.45, 0.03, M.gold, { rx: Math.PI / 2, rz: 0.4, seg: 16 });
    K.torus(gx, 1.25, gz, 0.38, 0.025, M.gold, { ry: 1.2, rx: 0.3, seg: 16 });
    if (arm) K.spin.push({ mesh: arm, speed: 0.6, axis: 'y' });
    K.solid(gx - 0.5, gz - 0.5, 1, 1);
    K.slot('work', gx + 1, gz, { face: [-1, 0] });
    F.cauldron(K, W - 1.5, D - 2.3);
    K.slot('work', W - 2.5, D - 2.3, { face: [1, 0] });
    F.bed(K, W - 1.1, 3.5, { blanket: M.purple });
    F.wallPic(K, 'E', D / 2 + 1.5, 1.5, 1.0, 1.0, M.starchart);
    F.torch(K, 'W', D / 2 + 1.5, 1.8, { fire: M.purpleFire, color: '#c080ff' });
  },

  mansion(K, ctx) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.parquet, wall: M.wallpaper, h: 3.0, trim: M.darkWood, door: Math.floor(W / 2), win: { N: [2, W - 3], W: F.winAt(2, D), E: F.winAt(2, D), S: [] }, winTop: 2.4 });
    F.hearth(K, W / 2 - 1.3, 2.6, { mat: M.stone, li: 4 });
    F.wallPic(K, 'N', W / 2, 1.7, 1.0, 1.2, M.portrait);
    F.wallPic(K, 'W', 2.5, 1.2, 0.8, 1.0, M.portrait); F.wallPic(K, 'E', D - 3, 1.2, 0.8, 1.0, M.portrait);
    // じゅうたんとソファ
    F.rug(K, W / 2 - 2.5, 1.5, 5, 3.6, M.carpet);
    for (const s of [-1, 1]) {
      const x = W / 2 + s * 1.8;
      K.box(x - 0.5, 0, 2.2, 1.0, 0.45, 1.6, M.red); K.box(x + (s > 0 ? 0.35 : -0.55), 0.45, 2.2, 0.2, 0.5, 1.6, M.red);
      K.solid(x - 0.5, 2.2, 1, 1.6);
      K.slot('seat', x, 2.6, { face: [-s, 0], y: 0.1 }); K.slot('seat', x, 3.4, { face: [-s, 0], y: 0.1 });
    }
    F.table(K, W / 2 - 0.6, 3.0, 1.2, 0.8, { h: 0.45 }); K.cyl(W / 2, 0.45, 3.4, 0.1, 0.18, M.gold, { seg: 6 });
    // 長い食卓
    const tw = Math.min(W - 6, 5), tx = W / 2 - tw / 2, tz = D - 3.6;
    F.table(K, tx, tz, tw, 1.1, { cloth: M.white });
    for (let i = 0; i < tw; i++) {
      F.chair(K, tx + 0.5 + i, tz - 0.4, [0, 1], { cushion: M.red }); K.slot('eat', tx + 0.5 + i, tz - 0.4, { face: [0, 1] });
      F.chair(K, tx + 0.5 + i, tz + 1.5, [0, -1], { cushion: M.red }); K.slot('eat', tx + 0.5 + i, tz + 1.5, { face: [0, -1] });
      K.cyl(tx + 0.5 + i, 0.72, tz + 0.55, 0.14, 0.03, M.white, { seg: 8 });
    }
    F.candle(K, W / 2, tz + 0.55, 0.72, { noStand: true, arms: 3 });
    F.chandelier(K, W / 2, D / 2, 2.6, { r: 1.0, li: 4, ld: 12, chain: 0.4 });
    // 天蓋つきの寝台
    F.bed(K, 0.2, 0.3, { dir: 'x', canopy: M.purple, frame: M.darkWood, blanket: M.purple });
    F.bed(K, W - 2.2, 0.3, { dir: 'x', canopy: M.purple, frame: M.darkWood, blanket: M.blue });
    F.armor(K, 0.6, D - 1.4); F.plant(K, W - 0.6, D - 0.6); F.plant(K, 0.6, D - 0.6);
    F.chest(K, W - 1.2, 2.0, { mat: M.darkWood });
    for (let i = 0; i < 2; i++) K.slot('work', W / 2 - 3 + i * 6, 5.2, { face: [0, -1] });
  },

  clinic(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.whiteTile, wall: M.plaster, beams: true, door: Math.floor(W / 2), win: { N: F.winAt(2, W), W: [], E: [], S: [] } });
    for (let z = 0.4; z + 2 <= D - 1; z += 2.4) {
      F.bed(K, 0.2, z, { blanket: M.white, frame: M.steel });
      K.box(0.1, 0, z + 2.1, 1.4, 1.4, 0.06, M.cloth); // 寝台のあいだの仕切り布
    }
    F.openShelf(K, W - 3.8, 0.02, 1.6, 'N', [M.green, M.red, M.blue, M.white, M.purple]);
    // 薬草（天井から吊るす）と薬研
    for (let i = 0; i < 5; i++) { K.box(W / 2 - 1.5 + i * 0.6, 1.5, 0.3, 0.2, 0.5, 0.2, i % 2 ? M.leaf : M.green); K.box(W / 2 - 1.48 + i * 0.6, 2.0, 0.38, 0.04, 0.4, 0.04, M.brown); }
    F.table(K, W / 2 - 1, D / 2 - 0.5, 2, 1, { top: M.planks });
    K.cyl(W / 2 - 0.4, 0.72, D / 2, 0.18, 0.15, M.stone, { seg: 7 }); K.box(W / 2 + 0.2, 0.72, D / 2 - 0.2, 0.5, 0.1, 0.4, M.leaf);
    K.slot('work', W / 2, D / 2 + 0.9, { face: [0, -1] }); K.slot('work', W - 1.8, 2, { face: [1, 0] });
    for (let i = 0; i < 3; i++) F.sack(K, W - 0.6, D - 0.6 - i * 0.6);
    F.plant(K, W - 0.6, D - 2.8);
    F.chair(K, W / 2 + 2, D - 1.2, [-1, 0]); K.slot('seat', W / 2 + 2, D - 1.2, { face: [-1, 0] });
    F.candle(K, W / 2 + 0.7, D / 2 - 0.3, 0.72, { noStand: true, li: 2 }); F.torch(K, 'W', D - 1.2, 1.6, { color: '#ffd080' });
  },

  school(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber, beams: true, door: Math.floor(W / 2), win: { W: F.winAt(2, D), E: F.winAt(2, D), N: [], S: [] } });
    F.wallPic(K, 'N', W / 2, 0.9, 3.4, 1.4, M.blackboard);
    F.table(K, W / 2 - 1, 1.2, 2, 0.9); K.box(W / 2 - 0.7, 0.72, 1.4, 0.5, 0.1, 0.4, M.books);
    K.slot('work', W / 2 + 0.3, 0.7, { face: [0, 1] });
    for (let z = 3; z < D - 1.4; z += 1.7) for (let x = 1.2; x + 1.1 < W - 0.8; x += 2.1) {
      F.table(K, x, z, 1.2, 0.6, { h: 0.6 });
      K.box(x + 0.2, 0.6, z + 0.15, 0.4, 0.02, 0.3, M.white);
      F.chair(K, x + 0.6, z + 1.0, [0, -1]); K.slot('desk', x + 0.6, z + 1.0, { face: [0, -1] });
    }
    F.shelf(K, 0, D - 3.5, 2.5, 'W', M.books, { h: 1.6 });
    K.cyl(0.6, 0, 0.6, 0.25, 0.5, M.wood); K.sphere(0.6, 0.8, 0.6, 0.28, M.blue, { seg: 8 });
    F.torch(K, 'W', 2, 1.7); F.chandelier(K, W / 2, D / 2 + 1, 2.1, { r: 0.6, chain: 0.4 });
  },

  // 門の詰所：門番と自警団の待機場所。仮眠の寝台・槍掛け・火鉢・当番の帳面
  guardpost(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.plaza, wall: M.stone, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [2], W: [2], E: [], S: [] } });
    F.bed(K, 0.1, 0.2, { blanket: M.blue, poor: true }); F.bed(K, 1.2, 0.2, { blanket: M.blue, poor: true });
    F.weaponRack(K, W - 3.2, 0.1, 3);
    F.table(K, W / 2 - 0.6, D / 2 - 0.2, 1.4, 0.9); K.box(W / 2 - 0.4, 0.72, D / 2, 0.5, 0.02, 0.4, M.white);
    F.stool(K, W / 2 + 0.1, D / 2 + 1.1); K.slot('work', W / 2 + 0.1, D / 2 + 1.1, { face: [0, -1] });
    F.stool(K, W / 2 - 1.1, D / 2 + 0.3); K.slot('guard', W / 2 - 1.1, D / 2 + 0.3, { face: [1, 0] });
    F.brazier(K, W - 1.2, D - 1.6, M.fire);
    K.slot('guard', 1.2, D - 1.2, { face: [0, 1] }); K.slot('seat', W - 2.4, D - 1.2, { face: [1, 0] });
    F.wallPic(K, 'N', W / 2 + 1.5, 1.2, 0.9, 0.7, M.notice);
    F.torch(K, 'W', D - 2, 1.6);
  },

  // 魔法学園：長机が並ぶ教室、教壇の上に魔法陣、本棚と水晶
  academy(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.parquet, wall: M.stone, h: 3.0, trim: M.purple, door: Math.floor(W / 2), win: { N: [], W: F.winAt(3, D), E: F.winAt(3, D), S: [] }, winTop: 2.4 });
    F.wallPic(K, 'N', W / 2, 1.0, 4.0, 1.5, M.blackboard);
    F.wallPic(K, 'N', 2.2, 1.2, 1.4, 1.2, M.starchart);
    const cx = W / 2, cz = 2.2;
    K.spin.push({ mesh: K.plane(cx, 0.03, cz, 2.4, 2.4, M.magic, { dyn: true }), speed: 0.25, axis: 'y' });
    K.light(cx, 0.8, cz, '#b070ff', 2.6, 5, 0.4);
    K.slot('work', cx, cz, { face: [0, 1] });
    for (let z = 4; z < D - 1.5; z += 1.8) for (let x = 1.2; x + 2.6 < W - 0.6; x += 3.2) {
      F.table(K, x, z, 2.6, 0.7, { h: 0.66, top: M.darkWood });
      K.box(x + 0.3, 0.66, z + 0.15, 0.5, 0.08, 0.35, M.books); F.candle(K, x + 2.1, z + 0.35, 0.66, { noStand: true, li: 0.6 });
      for (const dx of [0.6, 1.9]) { F.chair(K, x + dx, z + 1.1, [0, -1]); K.slot('desk', x + dx, z + 1.1, { face: [0, -1] }); }
    }
    F.shelf(K, 0, D - 4, 3, 'W', M.books, { h: 2.4 }); F.shelf(K, W - 0.6, D - 4, 3, 'E', M.bottles, { h: 2.2 });
    for (const [x, z] of [[W - 1.2, 1.2], [1.0, 3.6]]) K.box(x - 0.15, 0, z - 0.15, 0.3, 0.9, 0.3, M.crystal);
    F.chandelier(K, W / 2, D / 2 + 1, 2.6, { r: 0.8, chain: 0.4 });
    F.torch(K, 'W', 1.5, 1.9, { fire: M.purpleFire, color: '#c080ff' }); F.torch(K, 'E', 1.5, 1.9, { fire: M.purpleFire, color: '#c080ff' });
  },

  // 剣術道場：板の間に木剣掛け、打ち込み人形、師範の座
  dojo(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.timber2, trim: M.darkWood, beams: true, door: Math.floor(W / 2), win: { N: [], W: F.winAt(2, D), E: F.winAt(2, D), S: [] } });
    F.weaponRack(K, 1, 0.1, 3); F.weaponRack(K, W - 4, 0.1, 3);
    F.wallPic(K, 'N', W / 2, 1.1, 1.6, 1.0, M.banner('#2a2a2a'));
    K.box(W / 2 - 1.2, 0, 0.3, 2.4, 0.2, 1.2, M.darkWood); K.solid(W / 2 - 1.2, 0.3, 2.4, 1.2);
    K.slot('work', W / 2, 1.1, { face: [0, 1], y: 0.2 });
    for (let i = 0; i < 2; i++) { const x = 1.4 + i * (W - 2.8); F.dummy(K, x, D / 2); }
    // 稽古の立ち位置（向かい合う）
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = W / 2 - 2.4 + c * 2.4, z = 3.2 + r * 2.4;
      if (z > D - 1.5) continue;
      K.slot('drill', x, z, { face: [0, r ? -1 : 1] });
    }
    F.bench(K, 1, D - 1.4, 3); K.slot('seat', 1.5, D - 1.3, { face: [0, -1] }); K.slot('seat', 2.5, D - 1.3, { face: [0, -1] });
    F.torch(K, 'W', D - 2, 1.6); F.torch(K, 'E', D - 2, 1.6);
  },

  // 国境の砦：兵の詰め所。寝台・地図の机・武器庫・見張りの梯子
  fort(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.plaza, wall: M.stone, trim: M.darkStone, h: 2.8, door: Math.floor(W / 2), win: { N: [3, W - 4], W: [], E: [], S: [] }, winMat: M.black });
    for (let z = 0.3; z + 2 <= D - 1.5; z += 2.4) F.bed(K, 0.1, z, { upper: true, blanket: M.red, blanket2: M.red });
    F.weaponRack(K, W - 0.5, 1.0, 3, 'W'); F.weaponRack(K, W / 2 - 1.5, 0.1, 3);
    F.table(K, W / 2 - 1, D / 2 - 0.5, 2.2, 1.2); K.box(W / 2 - 0.8, 0.72, D / 2 - 0.3, 1.8, 0.02, 0.8, M.mapTex);
    K.slot('work', W / 2, D / 2 + 1.1, { face: [0, -1] }); K.slot('guard', W - 1.5, D - 1.5, { face: [0, 1] }); K.slot('guard', 2.2, D - 1.2, { face: [0, 1] });
    F.barrel(K, W - 0.7, D - 0.7); F.barrel(K, W - 1.5, D - 0.7); F.crate(K, W - 1.2, D - 2.0);
    F.brazier(K, 3, D - 2.2, M.fire);
    F.wallPic(K, 'N', W / 2, 1.2, 1.2, 1.4, M.banner('#8e2c24'));
    F.torch(K, 'W', D - 1.2, 1.6); F.torch(K, 'E', D - 3, 1.6);
  },

  // 開拓者の小屋：土間に藁の寝床、斧と鋤、炉、切った丸太
  camp(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.dirt, wall: M.planks, trim: M.darkWood, h: 2.1, door: Math.floor(W / 2), win: { N: [], W: [2], E: [], S: [] } });
    F.bed(K, 0.1, 0.3, { poor: true, blanket: M.brown });
    F.hearth(K, W - 3, 2);
    K.slot('work', W - 2, 1.6, { face: [0, -1] });
    for (let i = 0; i < 3; i++) K.cyl(1.4 + i * 0.5, 0.18, D - 0.6, 0.18, 0.9, M.wood, { rx: Math.PI / 2, centered: true });
    F.sack(K, W - 0.6, D - 0.6); F.sack(K, W - 1.2, D - 0.5);
    F.table(K, 2.0, 2.4, 1.2, 0.8); F.stool(K, 2.6, 3.6); K.slot('eat', 2.6, 3.6, { face: [0, -1] });
    F.torch(K, 'W', D - 2, 1.4);
  },

  stable(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.straw, wall: M.planks, trim: M.darkWood, door: Math.floor(W / 2), win: { N: [], W: [], E: [], S: [] }, h: 2.2 });
    // 馬房（北の壁ぞい）
    const n = Math.floor((W - 0.5) / 2.4);
    for (let i = 0; i <= n; i++) { const x = 0.2 + i * 2.4; K.box(x - 0.08, 0, 0, 0.16, 1.3, 3, M.wood); K.box(x - 0.1, 1.3, 0, 0.2, 0.1, 3.05, M.darkWood); }
    for (let i = 0; i < n; i++) {
      const x = 0.2 + i * 2.4;
      K.box(x + 0.1, 0.9, 3, 0.7, 0.1, 0.1, M.darkWood); K.box(x + 1.5, 0.9, 3, 0.7, 0.1, 0.1, M.darkWood); // 柵
      K.box(x + 0.3, 0.5, 0.2, 1.6, 0.35, 0.4, M.wood); K.box(x + 0.35, 0.8, 0.25, 1.5, 0.06, 0.3, M.hay);
      if (i % 2 === 0 || n <= 3) K.decos.push({ sp: i % 3 === 2 ? 'donkey' : 'horse', x: x + 1.2, z: 1.6, face: [R.chance(0.5) ? 1 : -1, 0.3] });
    }
    for (let z = 0; z < 3; z++) for (let x = 0; x < W; x++) K.blocked[z * W + x] = 1;
    // 干し草の山
    for (let i = 0; i < 3; i++) K.box(W - 2.4 + i * 0.1, i * 0.45, D - 2.4 + i * 0.15, 2.0 - i * 0.3, 0.45, 1.8 - i * 0.3, M.hay);
    K.solid(W - 2.4, D - 2.4, 2, 1.8);
    K.box(0.4, 0, D - 1.5, 1.8, 0.6, 0.7, M.wood); K.box(0.5, 0.45, D - 1.4, 1.6, 0.1, 0.5, M.water); K.solid(0.4, D - 1.5, 1.8, 0.7);
    F.sack(K, 3, D - 0.6); F.barrel(K, 3.8, D - 0.6);
    K.box(W / 2 + 1.5, 1.1, D - 0.1, 0.8, 0.5, 0.06, M.brown, { g: 'S' });
    K.slot('work', W / 2, 4, { face: [0, -1] }); K.slot('work', W - 3, D - 3, { face: [1, 1] });
    F.torch(K, 'W', D - 3, 1.5);
  },

  mill(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.planks, wall: M.stone, door: Math.floor(W / 2), win: { N: [], W: [Math.floor(D / 2)], E: [], S: [] } });
    const cx = W / 2, cz = D / 2 - 0.5;
    K.cyl(cx, 0, cz, 1.4, 0.5, M.wood, { seg: 12 });
    K.cyl(cx, 0.5, cz, 1.2, 0.3, M.stone, { seg: 12 });
    const top = K.cyl(cx, 0.8, cz, 1.2, 0.3, M.stone, { seg: 12, dyn: true });
    if (top) K.spin.push({ mesh: top, speed: 0.8, axis: 'y', cx, cz });
    const shaft = K.box(cx - 0.12, 1.1, cz - 0.12, 0.24, K.wallH - 1.1, 0.24, M.darkWood, { dyn: true });
    if (shaft) K.spin.push({ mesh: shaft, speed: 0.8, axis: 'y', cx, cz });
    K.cyl(cx, 1.1, cz, 0.4, 0.4, M.wood, { r2: 0.6, seg: 8 }); // 漏斗
    K.solid(cx - 1.5, cz - 1.5, 3, 3);
    // 大きな歯車（北の壁）
    const gear = new THREE.Group();
    const gm = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.2, 14), M.wood); gm.rotation.x = Math.PI / 2; gear.add(gm);
    for (let k = 0; k < 12; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), M.darkWood); const a = k * Math.PI / 6; t.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, 0); t.rotation.z = a; gear.add(t); }
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.4), M.iron); gear.add(hub);
    gear.position.set(W - 2.3 - W / 2, 1.5, 0.25 - D / 2);
    K.groups.N.add(gear); K.spin.push({ mesh: gear, speed: -0.6, axis: 'z' });
    K.box(W - 2.35, 1.45, 0, 0.1, 0.1, 0.4, M.iron, { g: 'N' });
    for (let i = 0; i < 6; i++) F.sack(K, 0.6 + (i % 3) * 0.55, D - 0.6 - Math.floor(i / 3) * 0.55);
    F.crate(K, W - 1.2, D - 1.2, 0.8); F.barrel(K, 0.6, 0.6);
    K.slot('work', cx + 1.8, cz + 1.4, { face: [-1, -1] }); K.slot('work', 2, D - 2.5, { face: [0, 1] });
    for (let i = 0; i < 8; i++) K.box(K.R.range(1, W - 1), 0.001, K.R.range(1, D - 1), 0.3, 0.01, 0.3, M.white);
  },

  lighthouse(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.stone, wall: M.stone, h: 3.8, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [], W: [3], E: [3], S: [] }, winY: 2.4, winTop: 3.3 });
    const cx = W / 2, cz = D / 2 - 0.5;
    F.pillar(K, cx, cz, 3.6, M.stone, { round: true, r: 0.45 });
    // らせん階段
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = i * (Math.PI * 2 / 12) + Math.PI / 2, y = 0.2 * (i + 1);
      K.add(new THREE.BoxGeometry(1.4, 0.12, 0.55), M.planks, cx + Math.cos(a) * 1.15, y, cz + Math.sin(a) * 1.15, { ry: -a });
      K.add(new THREE.BoxGeometry(0.06, 0.8, 0.06), M.darkWood, cx + Math.cos(a) * 1.8, y + 0.4, cz + Math.sin(a) * 1.8, {});
    }
    K.solid(cx - 2, cz - 2, 4, 4);
    // 上の灯り
    K.box(cx - 1.4, 3.6, cz - 1.4, 2.8, 0.1, 2.8, M.darkStone);
    K.cyl(cx, 3.7, cz, 0.35, 0.5, M.lamp, { seg: 8 }); K.cyl(cx, 4.2, cz, 0.45, 0.15, M.brass, { seg: 8 });
    K.light(cx, 3.2, cz, '#ffe6a0', 5, 10, 0.4);
    F.table(K, 0.4, D - 2.2, 1.6, 0.9); F.candle(K, 1.6, D - 1.8, 0.72, { noStand: true, li: 1.2 }); K.box(0.6, 0.72, D - 2, 0.4, 0.05, 0.5, M.mapTex);
    F.chair(K, 1.2, D - 0.9, [0, -1]); K.slot('work', 1.2, D - 0.9, { face: [0, -1] });
    F.bed(K, W - 1.2, D - 2.4, { blanket: M.blue });
    F.barrel(K, 0.5, 0.5); F.barrel(K, 1.2, 0.5, { h: 0.6 });
    K.box(W - 1.5, 0, 0.3, 1, 0.5, 0.5, M.stone); K.cyl(W - 1, 0.5, 0.55, 0.3, 0.4, M.clay, { seg: 7 });
  },

  observatory(K) {
    const { M, W, D } = K;
    F.room(K, { floor: M.parquet, wall: M.stone, h: 3.0, trim: M.darkStone, door: Math.floor(W / 2), win: { N: [], W: [2], E: [2], S: [] } });
    const cx = W / 2, cz = D / 2 - 1;
    F.rug(K, cx - 2, cz - 1.5, 4, 3.4, M.carpetBlue);
    // 望遠鏡
    K.box(cx - 0.5, 0, cz - 0.5, 1, 0.35, 1, M.darkWood);
    for (const s of [-1, 1]) K.box(cx - 0.05 + s * 0.3, 0.35, cz - 0.05, 0.1, 0.9, 0.1, M.brass);
    K.cyl(cx, 1.5, cz - 0.3, 0.22, 2.6, M.brass, { rx: -0.9, centered: true, r2: 0.16, seg: 10 });
    K.cyl(cx, 2.35, cz - 1.35, 0.26, 0.2, M.iron, { rx: -0.9, centered: true, seg: 10 });
    K.solid(cx - 0.6, cz - 0.6, 1.2, 1.2);
    // 天井の開いた部分から見える星空（北の壁の上部）
    K.box(cx - 1.4, 2.2, -0.02, 2.8, 0.8, 0.06, M.starchart, { g: 'N' });
    F.wallPic(K, 'W', D / 2 + 1, 1.1, 1.4, 1.2, M.starchart); F.wallPic(K, 'E', D / 2 + 1, 1.1, 1.4, 1.2, M.starchart);
    F.table(K, 0.5, D - 2.4, 2.2, 1); K.box(0.8, 0.72, D - 2.2, 0.8, 0.02, 0.6, M.mapTex); K.sphere(2.2, 0.9, D - 1.9, 0.18, M.blue, { seg: 8 });
    F.chair(K, 1.5, D - 1.0, [0, -1]); K.slot('work', 1.5, D - 1.0, { face: [0, -1] });
    K.slot('work', cx + 1.2, cz + 0.8, { face: [-1, -1] });
    F.shelf(K, 0, 0.8, 2.4, 'W', M.books, { h: 2.0 });
    F.candle(K, W - 2, D - 1, 0, { h: 1.2 });
  },

  mine(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.dirt, wall: M.caveWall, h: 2.6, trim: M.caps.rock, door: 1, win: {}, sunbeams: false });
    // でこぼこの岩壁
    for (let x = 0; x < W; x++) { const h = R.range(0.3, 1.2); K.box(x, 0, 0, 1, h, R.range(0.2, 0.6), M.rock, { g: 'N' }); }
    for (let z = 0; z < D; z++) { const h = R.range(0.3, 1.0); K.box(0, 0, z, R.range(0.2, 0.5), h, 1, M.rock, { g: 'W' }); }
    // 鉱脈（光る鉱石）
    for (let i = 0; i < 5; i++) { const x = 1.5 + i * 2.8 + R.range(-0.5, 0.5); K.box(x, R.range(0.6, 1.4), -0.05, R.range(0.6, 1.1), R.range(0.4, 0.7), 0.25, M.ore, { g: 'N' }); K.slot('work', x + 0.4, 1.4, { face: [0, -1] }); }
    for (let i = 0; i < 2; i++) { const z = 2 + i * 3; K.box(-0.05, R.range(0.6, 1.2), z, 0.25, 0.6, 0.9, M.ore, { g: 'W' }); }
    K.light(W / 2, 1.2, 0.8, '#60d0ff', 1.6, 7, 0.3);
    // 支柱
    for (let x = 1.5; x < W; x += 3.5) {
      K.box(x, 0, 0.5, 0.2, 2.1, 0.2, M.wood); K.box(x, 0, D - 0.7, 0.2, 2.1, 0.2, M.wood, { g: 'S' });
      K.box(x - 0.05, 2.1, 0.4, 0.3, 0.22, D - 0.9, M.wood, { g: 'S' });
      K.solid(x, 0.5, 0.2, 0.2);
    }
    // トロッコの線路
    const rz = D / 2 + 0.5;
    for (let x = 0.3; x < W; x += 0.6) K.box(x, 0, rz - 0.55, 0.2, 0.05, 1.1, M.darkWood);
    K.box(0, 0.05, rz - 0.45, W, 0.05, 0.08, M.iron); K.box(0, 0.05, rz + 0.37, W, 0.05, 0.08, M.iron);
    const cart = W - 4;
    K.box(cart, 0.2, rz - 0.5, 1.4, 0.7, 1.0, M.iron); K.box(cart + 0.1, 0.9, rz - 0.4, 1.2, 0.2, 0.8, M.ore);
    for (const [dx, dz] of [[0.25, -0.55], [1.15, -0.55], [0.25, 0.45], [1.15, 0.45]]) K.cyl(cart + dx, 0.18, rz + dz, 0.16, 0.08, M.black, { rx: Math.PI / 2, centered: true });
    K.solid(cart, rz - 0.5, 1.4, 1);
    // 吊りランプとつるはし
    for (let x = 3; x < W; x += 5) { K.box(x - 0.1, 1.6, 1.0, 0.2, 0.3, 0.2, M.lamp); K.light(x, 1.4, 1.5, '#ffcf80', 2.4, 6, 0.6); }
    K.box(W - 1.6, 0, D - 1.6, 0.06, 1.0, 0.06, M.wood, { rz: 0.3 }); K.box(W - 1.9, 0.9, D - 1.62, 0.6, 0.08, 0.1, M.iron, { rz: 0.3 });
    for (let i = 0; i < 4; i++) K.cyl(R.range(2, W - 2), 0, R.range(D - 2, D - 0.8), R.range(0.15, 0.35), R.range(0.15, 0.3), M.rock, { seg: 5, r2: 0.08 });
    F.crate(K, 0.4, D - 1.2, 0.7); F.barrel(K, 1.5, D - 0.8);
    K.box(-0.35, 0, D - 3, 0.36, 2.6, 2, M.daylight, { g: 'W' });
    K.door = { x: 0.6, z: D - 2 };
  },

  hideout(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.dirt, wall: M.cloth, h: 2.0, trim: M.darkWood, door: Math.floor(W / 2), win: {}, sunbeams: false });
    // 天幕の骨組み
    for (let x = 0; x <= W; x += W / 3) { K.box(x - 0.08, 0, -0.1, 0.16, 2.5, 0.16, M.darkWood, { g: 'N' }); K.box(x - 0.08, 0, D - 0.06, 0.16, 2.5, 0.16, M.darkWood, { g: 'S' }); }
    K.box(-0.1, 2.3, -0.2, W + 0.2, 0.08, 0.5, M.cloth, { g: 'N', rx: -0.5 });
    // たき火
    const cx = W / 2, cz = D / 2 + 0.5;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; K.box(cx + Math.cos(a) * 0.6 - 0.12, 0, cz + Math.sin(a) * 0.6 - 0.12, 0.24, 0.18, 0.24, M.stone); }
    K.box(cx - 0.4, 0.05, cz - 0.08, 0.8, 0.12, 0.16, M.wood, { ry: 0.5 }); K.box(cx - 0.4, 0.05, cz - 0.08, 0.8, 0.12, 0.16, M.wood, { ry: -0.6 });
    K.cyl(cx, 0.12, cz, 0.3, 0.45, M.fire, { r2: 0.04, seg: 6 }); K.cyl(cx, 0.12, cz, 0.18, 0.6, M.fire2, { r2: 0.02, seg: 5 });
    K.solid(cx - 0.8, cz - 0.8, 1.6, 1.6);
    K.light(cx, 1.0, cz, '#ff8a30', 5, 9, 1.6);
    for (let k = 0; k < 5; k++) { const a = k * 1.25 + 0.3; K.slot('seat', cx + Math.cos(a) * 1.4, cz + Math.sin(a) * 1.4, { face: [-Math.cos(a), -Math.sin(a)] }); }
    // 戦利品の山
    F.goldPile(K, 1.6, 1.4, 1.0);
    F.chest(K, 2.8, 0.4, { open: true }); F.chest(K, 0.3, 2.8, { mat: M.darkWood });
    for (let i = 0; i < 3; i++) F.crate(K, 3.8 + i * 0.7, 0.3, 0.65); F.crate(K, 4.1, 0.3, 0.55, 0.65);
    F.sack(K, 1, 3.8); F.sack(K, 1.5, 4.2); F.barrel(K, 3.6, 1.3, { lying: true });
    K.box(4.6, 0, 1.2, 0.8, 0.05, 1.2, M.carpetPurple);
    // 見張り台
    const tx = W - 2.6, tz = 0.4;
    for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) K.box(tx + dx, 0, tz + dz, 0.16, 2.2, 0.16, M.darkWood);
    K.box(tx - 0.1, 2.2, tz - 0.1, 2.36, 0.12, 2.36, M.planks);
    for (let i = 0; i < 6; i++) K.box(tx - 0.4, 0.3 + i * 0.35, tz + 1, 0.3, 0.06, 0.06, M.wood);
    K.box(tx - 0.42, 0, tz + 0.9, 0.06, 2.3, 0.06, M.wood); K.box(tx - 0.42, 0, tz + 1.26, 0.06, 2.3, 0.06, M.wood);
    K.box(tx - 0.1, 2.32, tz - 0.1, 2.36, 0.4, 0.08, M.wood); K.box(tx - 0.1, 2.32, tz - 0.1, 0.08, 0.4, 2.36, M.wood);
    K.solid(tx, tz, 2.2, 2.2);
    K.slot('work', tx + 1.1, tz + 1.1, { y: 2.32, face: [0, 1] });
    // 寝袋
    for (let i = 0; i < 4; i++) { const x = 0.4 + i * 1.3, z = D - 2.6; K.box(x, 0, z, 0.9, 0.1, 1.9, i % 2 ? M.brown : M.sack); K.box(x + 0.15, 0.1, z + 0.1, 0.6, 0.12, 0.35, M.beige); K.slot('bed', x + 0.45, z + 0.95, { y: 0.18, lie: true, face: [0, 1] }); }
    F.table(K, W - 3.2, D - 3.6, 1.6, 1.0, { h: 0.6 }); K.box(W - 3, 0.6, D - 3.4, 0.3, 0.02, 0.2, M.white); K.box(W - 2.4, 0.6, D - 3.3, 0.3, 0.02, 0.2, M.white);
    K.slot('work', W - 2.4, D - 2.2, { face: [0, -1] }); K.slot('seat', W - 3.6, D - 3.1, { face: [1, 0] });
    F.weaponRack(K, W - 0.5, 3.2, 2, 'W');
  },

  ruins(K) {
    const { M, R, W, D } = K;
    K.open = true;
    K.box(-0.5, -0.3, -0.5, W + 1, 0.3, D + 1, M.grass);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (R.chance(0.72)) K.box(x + 0.03, 0, z + 0.03, 0.94, R.range(0.02, 0.06), 0.94, M.plaza, { ry: R.range(-0.05, 0.05) });
    // 崩れた壁
    const brokenWall = (side, len) => {
      for (let i = 0; i < len; i++) {
        const h = R.chance(0.2) ? 0 : R.range(0.3, 2.6);
        if (h <= 0) continue;
        if (side === 'N') K.box(i, 0, -0.4, 1, h, 0.4, M.stone, { g: 'N' });
        if (side === 'W') K.box(-0.4, 0, i, 0.4, h, 1, M.stone, { g: 'W' });
        if (side === 'E') K.box(W, 0, i, 0.4, h * 0.5, 1, M.stone, { g: 'E' });
        if (side === 'S') K.box(i, 0, D, 1, h * 0.4, 0.4, M.stone, { g: 'S' });
        if (R.chance(0.3)) K.box(i + 0.1, h, side === 'N' ? -0.4 : side === 'S' ? D : i, 0.8, 0.12, 0.4, M.leaf, { g: side });
      }
    };
    brokenWall('N', W); brokenWall('W', D); brokenWall('E', D); brokenWall('S', W);
    // 柱（立っているもの・倒れたもの）
    const cx = W / 2;
    for (let z = 3; z < D - 2; z += 3) for (const s of [-1, 1]) {
      const x = cx + s * 3.2;
      if (R.chance(0.35)) {
        K.cyl(x + s * 1.2, 0.35, z, 0.33, 3.0, M.stone, { rz: Math.PI / 2, ry: R.range(-0.4, 0.4), centered: true });
        K.box(x - 0.45, 0, z - 0.45, 0.9, 0.3, 0.9, M.stone);
        K.solid(x - 0.5, z - 0.5, 2.5, 1);
      } else F.pillar(K, x, z, R.range(1.2, 3.4), M.stone, { round: true, r: 0.32 });
    }
    for (let i = 0; i < 12; i++) K.box(R.range(0.5, W - 1), 0, R.range(0.5, D - 1), R.range(0.2, 0.6), R.range(0.15, 0.4), R.range(0.2, 0.6), M.stone, { ry: R.range(0, 3) });
    // 古い祭壇
    K.box(cx - 2, 0, 0.6, 4, 0.3, 2.4, M.stone); K.box(cx - 1, 0.3, 1.1, 2, 0.8, 1, M.darkStone);
    K.plane(cx, 1.12, 1.6, 1.6, 0.8, M.magic, { dyn: false });
    K.light(cx, 1.6, 1.8, '#b070ff', 2.2, 5, 0.4);
    K.solid(cx - 1, 1.1, 2, 1);
    for (let i = 0; i < 6; i++) K.sphere(R.range(0.5, W - 0.5), 0.2, R.range(0.5, D - 0.5), R.range(0.25, 0.45), M.leaf, { seg: 5, seg2: 4 });
    K.door = { x: W / 2, z: D - 0.5 };
  },

  well(K) {
    const { M, R, W, D } = K;
    F.room(K, { floor: M.caveFloor, wall: M.caveWall, h: 4.2, trim: M.caps.rock, win: {}, sunbeams: false });
    K.box(0.3, 0.02, 0.3, W - 0.6, 0.02, D - 0.6, M.water);
    K.water = true;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; K.box(W / 2 + Math.cos(a) * (W / 2 - 0.6) - 0.35, 0, D / 2 + Math.sin(a) * (D / 2 - 0.6) - 0.35, 0.7, R.range(0.1, 0.4), 0.7, M.rock); }
    // 上から差しこむ光と、つるべ
    K.cyl(W / 2, 0.05, D / 2, 1.3, 4.5, M.beam, { openEnded: true, seg: 12 });
    K.box(W / 2 - 0.02, 1.0, D / 2 - 0.02, 0.04, 4.0, 0.04, M.brown);
    K.cyl(W / 2, 0.6, D / 2, 0.22, 0.4, M.wood, { r2: 0.26 }); K.cyl(W / 2, 0.62, D / 2, 0.2, 0.36, M.iron, { openEnded: true });
    K.light(W / 2, 3.5, D / 2, '#e8f4ff', 3, 8, 0);
    for (let i = 0; i < 5; i++) K.box(R.range(0, W - 0.3), R.range(0.5, 3.5), -0.05, 0.3, 0.2, 0.1, M.leaf, { g: 'N' });
    K.box(W / 2 - 0.3, 0.5, -0.05, 0.6, 0.2, 0.15, M.gold, { g: 'N' });
  },
};

// 決定的な迷宮（部屋と通路）
function genDungeon(R, type) {
  const W = R.int(22, 30), D = R.int(20, 28);
  const grid = new Uint8Array(W * D);
  const roomId = new Int16Array(W * D).fill(-1);
  const rooms = [];
  const want = R.int(5, 8);
  for (let tries = 0; tries < 600 && rooms.length < want; tries++) {
    const w = R.int(4, 7), d = R.int(4, 6);
    const x = R.int(1, W - w - 1), z = R.int(1, D - d - 3);
    if (rooms.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && z < r.z + r.d + 2 && z + d + 2 > r.z)) continue;
    rooms.push({ x, z, w, d, cx: x + w / 2, cz: z + d / 2 });
  }
  // 入口の部屋は一番南
  rooms.sort((a, b) => (b.z + b.d) - (a.z + a.d));
  const carve = (x, z, v = 1) => { if (x > 0 && z > 0 && x < W - 1 && z < D) grid[z * W + x] = v; };
  rooms.forEach((r, i) => { for (let z = r.z; z < r.z + r.d; z++) for (let x = r.x; x < r.x + r.w; x++) { carve(x, z); roomId[z * W + x] = i; } });
  const wide = type === 'demoncastle' || type === 'pyramid';
  const corridor = (a, b) => {
    let x = Math.floor(a.cx), z = Math.floor(a.cz);
    const tx = Math.floor(b.cx), tz = Math.floor(b.cz);
    const hFirst = R.chance(0.5);
    const cells = [];
    const stepX = () => { while (x !== tx) { cells.push([x, z]); x += Math.sign(tx - x); } };
    const stepZ = () => { while (z !== tz) { cells.push([x, z]); z += Math.sign(tz - z); } };
    if (hFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    cells.push([x, z]);
    for (const [cx, cz] of cells) { carve(cx, cz); if (wide) carve(cx + 1, cz); }
  };
  const linked = [0];
  const edges = [];
  while (linked.length < rooms.length) {
    let best = null, bd = 1e9;
    for (let i = 0; i < rooms.length; i++) {
      if (linked.includes(i)) continue;
      for (const j of linked) { const d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cz - rooms[j].cz); if (d < bd) { bd = d; best = [i, j]; } }
    }
    corridor(rooms[best[1]], rooms[best[0]]);
    edges.push(best);
    linked.push(best[0]);
  }
  if (rooms.length > 3) { const a = R.int(1, rooms.length - 1), b = R.int(1, rooms.length - 1); if (a !== b) { corridor(rooms[a], rooms[b]); edges.push([a, b]); } }
  // 入口（南の端まで通路）
  const e = rooms[0];
  const ex = Math.floor(e.cx);
  for (let z = e.z + e.d; z < D; z++) { grid[z * W + ex] = 1; if (wide) grid[z * W + ex + 1] = 1; }
  // 入口からの距離
  const dist = bfs(grid, W, D, ex, D - 1);
  rooms.forEach((r) => { r.dist = dist[Math.floor(r.cz) * W + Math.floor(r.cx)]; });
  let boss = 1;
  for (let i = 1; i < rooms.length; i++) if (rooms[i].dist > rooms[boss].dist) boss = i;
  const deg = rooms.map((_, i) => edges.filter(([a, b]) => a === i || b === i).length);
  return { W, D, grid, roomId, rooms, boss, entrance: 0, entry: { x: ex + (wide ? 1 : 0.5), z: D - 0.5 }, deg, wide };
}
function bfs(grid, W, D, sx, sz) {
  const dist = new Int32Array(W * D).fill(-1);
  const q = [sz * W + sx];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const j = nz * W + nx;
      if (grid[j] !== 1 || dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; q.push(j);
    }
  }
  return dist;
}

function buildDungeon(K, G, type) {
  const { M, R } = K;
  const { W, D, grid, rooms } = G;
  const th = type === 'pyramid'
    ? { floor: M.sandFloor, wall: M.glyphs, cap: M.caps.sand, torchFire: M.fire, tcolor: '#ffa050' }
    : type === 'demoncastle'
      ? { floor: M.demonFloor, wall: M.darkBrick, cap: M.caps.demon, torchFire: M.purpleFire, tcolor: '#c060ff' }
      : { floor: M.caveFloor, wall: M.caveWall, cap: M.caps.rock, torchFire: M.fire, tcolor: '#ff9a40' };
  K.floor = grid;
  const at = (x, z) => (x < 0 || z < 0 || x >= W || z >= D ? 0 : grid[z * W + x]);
  // 魔王城：溶岩の池（ボス部屋の左右と、いくつかの部屋の中央）
  if (type === 'demoncastle') {
    rooms.forEach((r, i) => {
      if (i === G.entrance) return;
      if (i === G.boss) {
        for (let z = r.z; z < r.z + r.d; z++) { grid[z * W + r.x] = 2; grid[z * W + r.x + r.w - 1] = 2; }
      } else if (r.w >= 5 && r.d >= 5 && R.chance(0.6)) {
        for (let z = r.z + 2; z < r.z + r.d - 2; z++) for (let x = r.x + 2; x < r.x + r.w - 2; x++) grid[z * W + x] = 2;
      }
    });
  }
  // 床
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = grid[z * W + x];
    if (v === 1) K.box(x, -0.3, z, 1, 0.3, 1, th.floor);
    else if (v === 2) { K.box(x, -0.5, z, 1, 0.3, 1, M.lava); }
  }
  // 壁のブロック（床に接する岩だけ）
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (grid[z * W + x] !== 0) continue;
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz)) { near = true; break; }
    if (!near) continue;
    const h = type === 'cave' ? 1.3 + hash2(x, z) * 0.5 : 1.5;
    K.box(x, -0.3, z, 1, h + 0.3, 1, th.wall);
    K.box(x, h, z, 1, 0.04, 1, th.cap);
  }
  // 入口から差す光
  const ex = G.entry.x;
  K.box(Math.floor(ex) + 0.1, 0.005, D - 1.9, G.wide ? 1.8 : 0.8, 0.01, 1.8, M.beam);
  K.light(ex, 1.2, D - 1, '#e8f0ff', 2.5, 5, 0);
  K.door = { x: G.entry.x, z: D - 0.5 };
  // 松明（部屋の北の壁）
  rooms.forEach((r, i) => {
    const z = r.z;
    for (const x of [r.x + 1, r.x + r.w - 2]) {
      if (at(x, z - 1) !== 0) continue;
      if (type === 'pyramid' && i % 2) continue;
      K.box(x + 0.45, 0.9, z - 0.05, 0.1, 0.4, 0.15, M.darkWood);
      K.box(x + 0.41, 1.3, z - 0.05, 0.18, 0.16, 0.2, th.torchFire);
      K.light(x + 0.5, 1.6, z + 0.5, th.tcolor, 2.6, 6, 1);
    }
  });
  // 部屋の飾り
  rooms.forEach((r, i) => {
    const rx = () => r.x + 0.5 + R.range(0, r.w - 1), rz = () => r.z + 0.5 + R.range(0, r.d - 1);
    const free = (x, z) => at(Math.floor(x), Math.floor(z)) === 1;
    if (i === G.boss) return;
    if (type === 'cave') {
      for (let k = 0; k < 3; k++) { const x = rx(), z = rz(); if (free(x, z)) F.stalag(K, x, z, R.range(0.4, 1.1), M.rock); }
      if (R.chance(0.6)) { const x = rx(), z = rz(); if (free(x, z)) { K.box(x - 0.1, 0, z - 0.1, 0.2, 0.5, 0.2, M.crystal, { ry: 0.6 }); K.box(x + 0.1, 0, z, 0.14, 0.35, 0.14, M.crystal, { ry: 0.3 }); K.light(x, 0.8, z, '#40b0ff', 1.2, 3.5, 0.2); } }
      for (let k = 0; k < 3; k++) { const x = rx(), z = rz(); if (free(x, z)) { K.cyl(x, 0, z, 0.03, 0.15, M.beige, { seg: 4 }); K.cyl(x, 0.15, z, 0.1, 0.06, M.mushroom, { r2: 0.02, seg: 6 }); } }
      if (R.chance(0.5)) { const x = rx(), z = rz(); if (free(x, z)) K.box(x - 0.5, 0.005, z - 0.4, 1.0, 0.01, 0.8, M.water); }
      if (R.chance(0.6)) { const x = rx(), z = rz(); if (free(x, z)) F.bones(K, x, z); }
    } else if (type === 'pyramid') {
      for (const [x, z] of [[r.x + 0.5, r.z + 0.5], [r.x + r.w - 0.5, r.z + 0.5]]) if (free(x, z)) F.pillar(K, x, z, 1.5, M.sandstone, { r: 0.28, cap: M.gold });
      if (i !== G.entrance && r.w >= 4) {
        const x = r.x + r.w / 2 - 0.5, z = r.z + r.d / 2 - 1;
        K.box(x - 0.05, 0, z - 0.05, 1.1, 0.35, 2.1, M.sandstone); K.box(x, 0.35, z, 1, 0.25, 2, M.sarcophagus);
        K.solid(x, z, 1, 2);
      }
      for (let k = 0; k < 2; k++) { const x = rx(), z = rz(); if (free(x, z)) K.cyl(x, 0, z, 0.18, 0.5, M.clay, { r2: 0.12, seg: 7 }); }
      if (R.chance(0.5)) { const x = rx(), z = rz(); if (free(x, z)) K.cyl(x, 0, z, 0.6, 0.2, M.sandstone, { r2: 0.1, seg: 8 }); }
    } else {
      for (const [x, z] of [[r.x + 0.5, r.z + 0.5], [r.x + r.w - 0.5, r.z + 0.5]]) if (free(x, z)) F.pillar(K, x, z, 1.5, M.darkStone, { r: 0.28, cap: M.caps.demon });
      if (R.chance(0.6)) { const x = rx(), z = rz(); if (free(x, z)) { K.box(x - 0.12, 0, z - 0.12, 0.24, 0.7, 0.24, M.redCrystal, { ry: 0.7 }); K.light(x, 1, z, '#ff3040', 1.4, 4, 0.3); } }
      if (R.chance(0.5)) { const x = rx(), z = rz(); if (free(x, z)) F.bones(K, x, z); }
      if (R.chance(0.4)) { const x = r.x + r.w - 1.2, z = r.z + r.d - 1.2; if (free(x, z)) F.bars(K, x, z, x + 1, z, 1.2); }
    }
    // 宝箱（行き止まりの部屋と、ときどき）
    if (i !== G.entrance && (G.deg[i] <= 1 || R.chance(0.3))) {
      const x = r.x + r.w - 1.5, z = r.z + 0.3;
      if (free(x + 0.4, z + 0.3)) F.chest(K, x, z, { mat: type === 'demoncastle' ? M.darkWood : M.brown });
    }
  });
  // 罠（通路のとげ床）
  const corr = [];
  for (let z = 1; z < D - 2; z++) for (let x = 1; x < W - 1; x++) if (grid[z * W + x] === 1 && G.roomId[z * W + x] < 0) corr.push([x, z]);
  for (let k = 0; k < Math.min(6, corr.length >> 2); k++) {
    const [x, z] = corr[R.int(0, corr.length - 1)];
    K.box(x + 0.05, 0, z + 0.05, 0.9, 0.04, 0.9, M.iron);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) K.cyl(x + 0.2 + a * 0.3, 0.04, z + 0.2 + b * 0.3, 0.07, 0.22, M.steel, { r2: 0, seg: 4 });
  }
  // ボス部屋
  const B = rooms[G.boss];
  const bx = B.x + B.w / 2, bz = B.z + 1.2;
  if (type === 'demoncastle') {
    F.rug(K, bx - 0.8, B.z + 0.2, 1.6, B.d - 0.2, M.carpet, M.redCrystal);
    K.box(bx - 1.3, 0, B.z, 2.6, 0.3, 1.6, M.darkBrick);
    K.box(bx - 0.7, 0.3, B.z + 0.2, 1.4, 0.55, 1.0, M.black); K.box(bx - 0.7, 0.3, B.z, 1.4, 2.4, 0.3, M.black);
    K.box(bx - 0.9, 0.3, B.z + 0.2, 0.25, 1.0, 1.0, M.black); K.box(bx + 0.65, 0.3, B.z + 0.2, 0.25, 1.0, 1.0, M.black);
    for (const s of [-1, 1]) K.cyl(bx + s * 0.55, 2.7, B.z + 0.15, 0.12, 0.6, M.redCrystal, { r2: 0, seg: 5 });
    K.box(bx - 0.2, 2.2, B.z + 0.3, 0.4, 0.3, 0.05, M.redCrystal);
    K.solid(bx - 1.3, B.z, 2.6, 1.6);
    K.slot('throne', bx, B.z + 0.95, { y: 0.35, face: [0, 1], room: G.boss });
    for (const s of [-1, 1]) F.brazier(K, bx + s * 2, B.z + 0.6, M.purpleFire, { color: '#c060ff', li: 3.5 });
    K.plane(bx, 0.03, B.z + B.d / 2 + 0.8, 2.4, 2.4, M.redMagic);
    K.light(bx, 1.4, B.z + 1.5, '#ff3040', 3, 8, 0.4);
  } else if (type === 'pyramid') {
    K.box(bx - 1.5, 0, B.z + 0.2, 3, 0.3, 2.6, M.sandstone);
    K.box(bx - 0.6, 0.3, B.z + 0.4, 1.2, 0.4, 2.2, M.gold); K.box(bx - 0.55, 0.7, B.z + 0.45, 1.1, 0.3, 2.1, M.sarcophagus);
    K.solid(bx - 1.5, B.z + 0.2, 3, 2.6);
    for (const s of [-1, 1]) { F.pillar(K, bx + s * 2, B.z + 0.6, 2.0, M.black, { r: 0.25, cap: M.gold }); F.brazier(K, bx + s * 2, B.z + 2.2, M.fire, { stand: M.gold }); }
    F.goldPile(K, B.x + 1.2, B.z + B.d - 1.2, 0.8);
    K.slot('boss', bx, B.z + 3.5, { face: [0, 1], room: G.boss });
  } else {
    F.goldPile(K, bx, B.z + B.d / 2, 1.3);
    for (let k = 0; k < 5; k++) F.bones(K, B.x + 0.8 + R.range(0, B.w - 1.6), B.z + 0.8 + R.range(0, B.d - 1.6));
    for (const [x, z] of [[B.x + 0.6, B.z + 0.6], [B.x + B.w - 0.6, B.z + B.d - 0.6]]) { K.box(x - 0.2, 0, z - 0.2, 0.4, 1.1, 0.4, M.crystal, { ry: 0.5 }); K.light(x, 1.4, z, '#40b0ff', 2, 5, 0.2); }
    K.slot('boss', bx, B.z + B.d / 2 + 1.6, { face: [0, 1], room: G.boss });
  }
  for (let k = 0; k < 2; k++) F.chest(K, B.x + B.w - 1.3, B.z + 0.3 + k * 0.9, { open: k === 0, mat: type === 'demoncastle' ? M.darkWood : M.brown });
}

// ================================================================ 本体
export class InteriorView {
  constructor(canvas, sim) {
    this.canvas = canvas;
    this.sim = sim;
    this.pixel = 2;
    if (!canvas.style.imageRendering) canvas.style.imageRendering = 'pixelated';
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, minZoom: 0.5, maxZoom: 6, minPolarAngle: 0.05, maxPolarAngle: 1.25, screenSpacePanning: false });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.raycaster = new THREE.Raycaster();
    this.scene = null;
    this.ents = new Map();
    this.bubbles = new Map();
    this.bid = null;
    this.time = 0;
  }

  // ---------- 開く・閉じる ----------
  open(buildingId) {
    this.close();
    const sim = this.sim, b = sim.building(buildingId);
    if (!b) return { title: '', subtitle: '' };
    const { M } = lib();
    this.bid = buildingId; this.b = b;
    const type = b.type;
    const seed = (strHash(type) ^ Math.imul(buildingId + 1, 2654435761)) >>> 0;
    this.dungeon = DUNGEONS.has(type);
    let K;
    let G = null;
    if (this.dungeon) {
      const R0 = makeRng(seed);
      G = genDungeon(R0, type);
      K = new Kit(G.W, G.D, seed ^ 0x5bd1e995, M);
      buildDungeon(K, G, type);
    } else {
      const [W, D] = sizeOf(b);
      K = new Kit(W, D, seed, M);
      const ctx = { b, sim, hh: b.hh != null ? sim.S.households[b.hh] : null };
      if (!(b.tribe && b.style && TH.tribalInterior(K, ctx, F))) (BUILD[type] || BUILD.house)(K, ctx);
    }
    K.finish();
    this.K = K; this.G = G;
    const scene = this.scene = new THREE.Scene();
    for (const g of Object.values(K.groups)) scene.add(g);
    this.outdoor = K.open;
    scene.background = new THREE.Color(this.dungeon ? '#0c0a10' : K.open ? '#8fd0ff' : '#16110e');
    // 明かり
    this.hemi = new THREE.HemisphereLight('#ffeedd', '#40302a', 1.0);
    this.sun = new THREE.DirectionalLight('#fff2d6', 1.0);
    this.sun.position.set(-K.W * 0.6, 14, -K.D * 0.4);
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.hemi, this.sun, this.sun.target);
    this.points = [];
    let ls = K.lights;
    const cap = this.dungeon ? 14 : 10;
    if (ls.length > cap) { const step = ls.length / cap; ls = Array.from({ length: cap }, (_, i) => ls[Math.floor(i * step)]); }
    for (const l of ls) {
      const p = new THREE.PointLight(l.color, l.intensity, l.dist, 1.2);
      p.position.set(l.x - K.W / 2, l.y, l.z - K.D / 2);
      p.userData = { base: l.intensity, flick: l.flick, ph: Math.random() * 10 };
      scene.add(p); this.points.push(p);
    }
    // 飾りの動物（厩舎の馬など）
    this.decos = [];
    K.decos.forEach((d, i) => {
      const fake = { id: `deco:${buildingId}:${i}`, sp: d.sp, lv: 1 };
      const sheet = this.makeSheet(fake, false);
      if (!sheet) return;
      const r = this.makeSprite(sheet, fake.id, false);
      r.x = d.x; r.z = d.z; r.fx = d.face[0]; r.fz = d.face[1]; r.deco = true; r.y = 0;
      this.decos.push(r);
    });
    // カメラ
    this.walls = { N: K.groups.N, S: K.groups.S, W: K.groups.W, E: K.groups.E };
    const span = Math.max(K.W, K.D);
    this.controls.target.set(0, 0.6, this.dungeon ? 0 : 0.3);
    this.camera.position.set(span * 0.9, span * 1.25, span * 1.15);
    this.camera.zoom = this.dungeon ? 1.15 : 1;
    this.camera.near = -200; this.camera.far = 400;
    this.controls.maxPolarAngle = this.dungeon ? 1.05 : 1.25;
    this.resize();
    this.controls.update();
    this.time = 0;
    this.first = true;
    this.syncEntities();
    this.first = false;
    // 題名
    const hh = b.hh != null ? sim.S.households[b.hh] : null;
    const town = b.settlement != null ? sim.town(b.settlement) : null;
    let sub = (b.tribe && b.style && TH.tribalLabel(b)) || LABEL[type] || type;
    if (type === 'house' && hh) {
      const m = hh.money || 0;
      sub += `・${hh.name || ''}（${m > 260 ? '裕福' : m < 45 ? '質素' : 'ふつう'}な暮らし）`;
    } else if (type === 'house') sub += '・空き家';
    if (this.dungeon) sub += `・${G.rooms.length}つの部屋`;
    const n = this.countInside();
    sub += n.people || n.monsters ? `・中に${n.people ? `${n.people}人` : ''}${n.people && n.monsters ? '・' : ''}${n.monsters ? `魔物${n.monsters}体` : ''}` : '・誰もいない';
    if (town && type !== 'house') sub = `${town.name}の${sub}`;
    return { title: b.name || LABEL[type] || type, subtitle: sub };
  }

  close() {
    for (const id of [...this.ents.keys()]) this.drop(id);
    for (const r of this.decos || []) this.disposeSprite(r);
    this.decos = [];
    for (const el of this.bubbles.values()) el.el.remove();
    this.bubbles.clear();
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      this.scene = null;
    }
    this.K = null; this.G = null; this.bid = null;
  }

  setPixel(n) { this.pixel = clamp(Math.round(n) || 2, 1, 4); this.resize(); }
  resize() {
    const w = this.canvas.clientWidth || this.canvas.width || 320, h = this.canvas.clientHeight || this.canvas.height || 240;
    this.renderer.setSize(Math.max(1, Math.floor(w / this.pixel)), Math.max(1, Math.floor(h / this.pixel)), false);
    const aspect = w / h;
    const K = this.K;
    const W = K ? K.W : 10, D = K ? K.D : 10;
    let s = (W + D) * 0.25 + 1.0;
    s = Math.max(s, ((W + D) * 0.3) / aspect);
    Object.assign(this.camera, { left: -s * aspect, right: s * aspect, top: s, bottom: -s });
    this.camera.updateProjectionMatrix();
  }

  countInside() {
    return { people: this.peopleInside().length, monsters: this.creaturesInside().length };
  }
  peopleInside() {
    const id = this.bid;
    return this.sim.living().filter((p) => p.inside === id || p.jail === id);
  }
  creaturesInside() {
    const id = this.bid;
    return Object.values(this.sim.S.creatures).filter((c) => c.lair === id && c.hp > 0 && !c.dead && (c.inDungeon != null ? c.inDungeon : INSIDE_ROLES.has(c.role)));
  }

  // ---------- スプライト ----------
  makeSheet(e, isHuman) {
    let cv = null;
    try {
      if (isHuman && SPR.drawPerson) cv = SPR.drawPerson(e, { age: this.sim.ageOf(e) });
      else if (!isHuman && SPR.drawCreature) cv = SPR.drawCreature(e, SPECIES[e.sp]);
    } catch (err) { cv = null; }
    if (!cv) {
      if (isHuman) return { tex: personTexture(e, 'adult'), cols: 1, rows: 1, fw: 16, fh: 20, worldH: 0.95 };
      return null;
    }
    const u = cv.userData || {};
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const cols = u.cols || 1, rows = u.rows || 1;
    const fw = u.frameW || cv.width / cols, fh = u.frameH || cv.height / rows;
    let worldH = u.worldH || (isHuman ? 0.95 : (SPECIES[e.sp]?.size || 1) * 0.7);
    if (isHuman && !u.worldH) { const a = this.sim.ageOf(e); worldH = a < 5 ? 0.5 : a < 13 ? 0.7 : 0.95; }
    return { tex, cols, rows, fw, fh, worldH, grounded: u.grounded !== false };
  }
  makeSprite(sheet, id, isHuman) {
    const mat = new THREE.SpriteMaterial({ map: sheet.tex, transparent: true, alphaTest: 0.5 });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    const hgt = sheet.worldH, wid = hgt * sheet.fw / sheet.fh;
    sprite.scale.set(wid, hgt, 1);
    sheet.tex.repeat.set(1 / sheet.cols, 1 / sheet.rows);
    sprite.userData = { id, human: isHuman };
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(Math.min(0.5, wid * 0.35), 10), LIB.M.shadow);
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(sprite, shadow);
    return { sprite, shadow, sheet, id, human: isHuman, x: 0, z: 0, y: 0, fx: 0, fz: 1, phase: Math.random() * 10, path: [], wait: 0, slot: null, kind: null, lie: false, flash: 0 };
  }
  disposeSprite(r) {
    this.scene?.remove(r.sprite, r.shadow);
    r.sheet.tex.dispose(); r.sprite.material.dispose(); r.shadow.geometry.dispose();
  }
  drop(id) {
    const r = this.ents.get(id);
    if (!r) return;
    this.freeSlot(r);
    this.disposeSprite(r);
    this.ents.delete(id);
    const b = this.bubbles.get(id);
    if (b) { b.el.remove(); this.bubbles.delete(id); }
  }
  hit(id) { const r = this.ents.get(id); if (r) r.flash = 0.18; }

  // ---------- 誰がどこにいるか ----------
  kindFor(e, human) {
    const t = this.b.type;
    if (!human) {
      if (e.sp === 'demonlord') return 'throne';
      if (BOSS_ROLES.has(e.role) || e.role === 'aide') return 'boss';
      return 'room';
    }
    if (e.jail === this.bid) return 'cell';
    if (this.dungeon) return 'explore';
    const a = e.action?.type;
    switch (a) {
      case 'sleep': return 'bed';
      case 'eat': return 'eat';
      case 'tavern': return 'seat';
      case 'pray': return 'pew';
      case 'school': case 'academy': return 'desk';
      case 'dojo': return 'drill';
      case 'jail': return 'cell';
      case 'work': {
        if (t === 'castle') {
          if (e.job === 'king') return 'throne';
          if (e.job === 'royal') return 'royal';
          if (['royalguard', 'guard', 'knight', 'soldier', 'gatekeeper', 'general'].includes(e.job)) return 'guard';
          if (['maid', 'butler', 'servant', 'cook', 'gardener', 'jester'].includes(e.job)) return 'wander';
        }
        if (t === 'tavern' && ['bard', 'musician', 'dancer'].includes(e.job)) return 'stage';
        if (t === 'guild' && e.job === 'adventurer') return 'wait';
        if (t === 'school' && e.job !== 'teacher') return 'desk';
        if (t === 'academy' && e.job !== 'magister') return 'desk';
        if ((t === 'guardpost' || t === 'fort') && ['gatekeeper', 'militia', 'soldier', 'guard', 'knight', 'watchman'].includes(e.job)) return 'guard';
        if (t === 'dojo' && e.job !== 'swordmaster') return 'drill';
        return 'work';
      }
      default: return 'wander';
    }
  }
  static FALLBACK = { bed: ['bed', 'lie'], eat: ['eat', 'seat', 'wander'], seat: ['seat', 'eat', 'wander'], pew: ['pew', 'seat', 'wander'], desk: ['desk', 'seat', 'wander'], drill: ['drill', 'seat', 'wander'], work: ['work', 'wander'], stage: ['stage', 'work', 'wander'], wait: ['wait', 'seat', 'wander'], throne: ['throne', 'royal', 'boss', 'wander'], royal: ['royal', 'wander'], guard: ['guard', 'wander'], cell: ['cell', 'wander'], boss: ['boss', 'room'], room: ['room'], explore: ['explore'], wander: ['wander'] };
  takeSlot(r, kind, e) {
    for (const k of InteriorView.FALLBACK[kind] || ['wander']) {
      if (k === 'lie') { if (this.takeMat(r)) return 'lie'; continue; }
      if (k === 'wander' || k === 'room' || k === 'explore' || k === 'boss' && !this.K.slots.some((s) => s.k === 'boss')) return k === 'boss' ? 'room' : k;
      let list = this.K.slots.filter((s) => s.k === k && s.n < s.cap);
      if (k === 'bed') {
        // 1つの寝台には1人。夫婦の寝台（double）だけは夫婦2人で寝る
        const mate = e.spouseId;
        const shared = list.find((s) => s.double && s.n > 0 && s.occ.some((o) => o === mate));
        if (shared) list = [shared];
        else {
          const free = list.filter((s) => s.n === 0);
          // 夫婦の寝台は、夫婦者（連れ合いが家にいる人）に優先して渡す
          const pref = mate != null ? free.filter((s) => s.double) : free.filter((s) => !s.double);
          list = pref.length ? pref : free;
        }
      }
      if (!list.length) continue;
      // 同じ人はなるべく同じ席に（id から選ぶ）
      const h = typeof e.id === 'number' ? e.id : strHash(e.id);
      const s = list[h % list.length];
      s.n++; r.slot = s;
      if (s.spots) { let i = 0; while (s.occ[i] != null) i++; s.occ[i] = e.id; r.spot = i; } else r.spot = null;
      return k;
    }
    return 'wander';
  }
  // 寝台が足りないときは、床に寝わらを敷いて寝る（ほかの人と重ならない場所を探す）
  takeMat(r) {
    const K = this.K;
    const taken = [];
    for (const s of K.slots) if (s.n > 0 || s.k === 'bed') taken.push([s.x, s.z]);
    for (const o of this.ents.values()) if (o !== r && o.kind === 'lie') taken.push([o.tx, o.tz]);
    const door = K.door || { x: -9, z: -9 };
    let best = null, bd = -1;
    for (let z = 0; z < K.D; z++) for (let x = 0; x < K.W; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      if (!K.walkable(cx, cz) || Math.hypot(cx - door.x, cz - door.z) < 1.6) continue;
      let dmin = 9; for (const [tx, tz] of taken) dmin = Math.min(dmin, Math.hypot(cx - tx, cz - tz));
      if (dmin < 0.95) continue;
      // 壁ぎわを好む（部屋の真ん中で寝ない）
      const wallish = (x === 0 || z === 0 || x === K.W - 1 || z === K.D - 1) ? 1 : 0;
      const sc = Math.min(dmin, 2) + wallish + (r.room >= 0 && this.G?.rooms[r.room] ? 0 : 0);
      if (sc > bd) { bd = sc; best = [cx, cz]; }
    }
    if (!best) return false;
    const s = { k: 'mat', x: best[0], z: best[1], y: 0.04, face: [1, 0], lie: true, room: -1, cap: 1, n: 1, dyn: true };
    K.slots.push(s); r.slot = s; r.spot = null;
    return true;
  }
  freeSlot(r) {
    const s = r.slot; if (!s) return;
    s.n--;
    if (s.occ && r.spot != null) s.occ[r.spot] = null;
    if (s.dyn) { const i = this.K.slots.indexOf(s); if (i >= 0) this.K.slots.splice(i, 1); }
    r.slot = null; r.spot = null;
  }
  roomFor(e) {
    const G = this.G;
    if (!G) return -1;
    const k = this.kindFor(e, false);
    if (k === 'boss' || k === 'throne') return G.boss;
    const cands = G.rooms.map((_, i) => i).filter((i) => i !== G.entrance && i !== G.boss);
    if (!cands.length) return G.boss;
    return cands[strHash(e.id) % cands.length];
  }
  randomCell(roomIdx) {
    const K = this.K, R = Math.random;
    if (this.G && roomIdx >= 0) {
      const r = this.G.rooms[roomIdx];
      for (let t = 0; t < 30; t++) { const x = r.x + R() * r.w, z = r.z + R() * r.d; if (K.walkable(x, z)) return [Math.floor(x) + 0.5, Math.floor(z) + 0.5]; }
      return [r.cx, r.cz];
    }
    for (let t = 0; t < 40; t++) { const x = 0.5 + R() * (K.W - 1), z = 0.5 + R() * (K.D - 1); if (K.walkable(x, z)) return [Math.floor(x) + 0.5, Math.floor(z) + 0.5]; }
    return [K.door.x, K.door.z - 1];
  }
  gridPath(x0, z0, x1, z1) {
    const G = this.G;
    if (!G) return [[x1, z1]];
    const { W, D } = G;
    const sx = clamp(Math.floor(x0), 0, W - 1), sz = clamp(Math.floor(z0), 0, D - 1);
    const tx = clamp(Math.floor(x1), 0, W - 1), tz = clamp(Math.floor(z1), 0, D - 1);
    const dist = bfs(this.K.floor, W, D, tx, tz);
    if (dist[sz * W + sx] < 0) return [[x1, z1]];
    const out = [];
    let x = sx, z = sz, guard = 0;
    while ((x !== tx || z !== tz) && guard++ < 400) {
      let best = null, bd = dist[z * W + x];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue; const d = dist[nz * W + nx]; if (d >= 0 && d < bd) { bd = d; best = [nx, nz]; } }
      if (!best) break;
      [x, z] = best; out.push([x + 0.5, z + 0.5]);
    }
    out.push([x1, z1]);
    return out;
  }
  // 冒険者の順路：入口の部屋から、入口から近い順に部屋をめぐり、ボス部屋へ
  route() {
    const G = this.G;
    if (this._route) return this._route;
    const order = G.rooms.map((r, i) => i).filter((i) => i !== G.boss).sort((a, b) => G.rooms[a].dist - G.rooms[b].dist);
    order.push(G.boss);
    return (this._route = order);
  }

  syncEntities() {
    const seen = new Set();
    const K = this.K;
    const add = (e, human) => {
      seen.add(e.id);
      let r = this.ents.get(e.id);
      const key = human ? `${e.job}|${e.rank}|${e.jail != null}|${this.sim.ageOf(e) < 13}|${e.advClass || ''}` : `${e.sp}|${e.lv}`;
      if (r && r.key !== key) { this.drop(e.id); r = null; }
      if (!r) {
        const sheet = this.makeSheet(e, human);
        if (!sheet) return;
        r = this.makeSprite(sheet, e.id, human);
        r.key = key;
        r.e = e;
        const start = this.first ? null : [K.door.x, K.door.z];
        r.room = human ? -1 : this.roomFor(e);
        r.hover = !human && (SPECIES[e.sp]?.flies || sheet.grounded === false);
        if (this.dungeon && human) { r.step = 0; r.ofs = [(hash2(strHash(String(e.id)), 1) - 0.5) * 0.6, (hash2(strHash(String(e.id)), 2) - 0.5) * 0.6]; }
        this.ents.set(e.id, r);
        this.assign(r, e, human);
        if (start) { r.x = start[0]; r.z = start[1]; this.retarget(r); }
        else if (this.dungeon && human) { r.x = this.G.entry.x; r.z = this.G.entry.z - 1.5 - Math.random() * 2; this.retarget(r); }
        else { r.x = r.tx; r.z = r.tz; r.path = []; }
      } else {
        r.e = e;
        const k = this.kindFor(e, human);
        if (k !== r.want) { this.freeSlot(r); this.assign(r, e, human); this.retarget(r); }
      }
    };
    for (const p of this.peopleInside()) add(p, true);
    for (const c of this.creaturesInside()) add(c, false);
    for (const id of [...this.ents.keys()]) if (!seen.has(id)) this.drop(id);
  }
  assign(r, e, human) {
    const want = this.kindFor(e, human);
    r.want = want;
    r.kind = this.takeSlot(r, want, e);
    r.lie = false;
    if (r.slot) { const o = r.spot != null && r.slot.spots ? r.slot.spots[r.spot] : [0, 0]; r.tx = r.slot.x + o[0]; r.tz = r.slot.z + o[1]; r.ty = r.slot.y; }
    else if (r.kind === 'explore') { const g = this.nextExplore(r); r.tx = g[0]; r.tz = g[1]; r.ty = 0; }
    else { const [x, z] = this.randomCell(r.room); r.tx = x; r.tz = z; r.ty = 0; }
    if (r.slot?.k === 'cell') { r.tx += (hash2(strHash(String(e.id)), 7) - 0.5) * 0.9; }
  }
  nextExplore(r) {
    const order = this.route();
    const i = Math.min(r.step || 0, order.length - 1);
    const room = this.G.rooms[order[i]];
    if (i === order.length - 1) { const [x, z] = this.randomCell(order[i]); return [x, z]; }
    return [room.cx + r.ofs[0], room.cz + r.ofs[1]];
  }
  retarget(r) {
    r.path = this.dungeon ? this.gridPath(r.x, r.z, r.tx, r.tz) : [[r.tx, r.tz]];
  }

  // ---------- 毎フレーム ----------
  update(realDt) {
    if (!this.scene) return;
    const dt = Math.min(0.1, realDt || 0);
    this.time += dt;
    const now = this.time;
    this.syncEntities();
    this.animate(dt, now);
    this.light(now);
    this.cullWalls();
    for (const s of this.K.spin) {
      if (s.axis === 'z') s.mesh.rotation.z += s.speed * dt;
      else if (s.axis === 'y' && s.cx != null) { s.mesh.rotation.y += s.speed * dt; }
      else if (s.axis === 'y') s.mesh.rotation.y += s.speed * dt;
      else s.mesh.rotation.y += s.speed * dt;
    }
    if (LIB.M.water.map) LIB.M.water.map.offset.x = (now * 0.03) % 1;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateBubbles(now);
  }

  animate(dt, now) {
    const K = this.K;
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const fwd = new THREE.Vector2(camDir.x, camDir.z);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, -1); fwd.normalize();
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const dirOf = (vx, vz, cur) => {
      if (Math.hypot(vx, vz) < 1e-4) return cur;
      const sx = vx * right.x + vz * right.y, sf = vx * fwd.x + vz * fwd.y;
      return Math.abs(sx) > Math.abs(sf) ? (sx > 0 ? 2 : 1) : (sf > 0 ? 3 : 0);
    };
    const seq = [0, 1, 2, 1];
    const place = (r) => {
      const sh = r.sheet;
      let walking = false;
      if (!r.deco && r.path.length) {
        const [gx, gz] = r.path[0];
        const dx = gx - r.x, dz = gz - r.z, d = Math.hypot(dx, dz);
        const sp = (r.human ? 1.7 : 1.3) * dt;
        if (d <= sp) { r.x = gx; r.z = gz; r.path.shift(); }
        else { r.x += dx / d * sp; r.z += dz / d * sp; r.fx = dx; r.fz = dz; walking = true; }
        if (!r.path.length) { r.wait = 1.5 + Math.random() * 3; if (r.slot?.face) { r.fx = r.slot.face[0]; r.fz = r.slot.face[1]; } }
      } else if (!r.deco) {
        // 着いた後
        if (r.slot) { r.lie = r.slot.lie; }
        else if (r.kind === 'lie') r.lie = true;
        else if (r.kind === 'explore') {
          r.wait -= dt;
          if (r.wait <= 0) { r.step = Math.min((r.step || 0) + 1, this.route().length - 1); const g = this.nextExplore(r); r.tx = g[0]; r.tz = g[1]; this.retarget(r); }
        } else if (r.kind === 'wander' || r.kind === 'room') {
          r.wait -= dt;
          if (r.wait <= 0) { const [x, z] = this.randomCell(r.room); r.tx = x; r.tz = z; this.retarget(r); }
        }
      }
      // 戦い
      const e = r.e;
      let fighting = false;
      if (e?.fight) {
        const o = this.ents.get(e.fight.target);
        if (o) { r.fx = o.x - r.x; r.fz = o.z - r.z; fighting = true; }
      }
      if (walking || fighting) r.phase += dt * (fighting ? 10 : 7);
      const dir = r.lie ? 0 : dirOf(r.fx, r.fz, r.dir ?? 0);
      r.dir = dir;
      const frame = sh.cols >= 3 ? (walking || fighting ? seq[Math.floor(r.phase) % 4] : 1) : 0;
      const row = sh.rows >= 4 ? dir : 0;
      sh.tex.offset.set(frame / sh.cols, 1 - (row + 1) / sh.rows);
      const onSlot = r.slot && !r.path.length;
      let y = onSlot ? r.slot.y : 0;
      if (r.hover) y += 0.7 + Math.sin(now * 3 + r.phase) * 0.08;
      const wx = r.x - K.W / 2, wz = r.z - K.D / 2;
      if (r.lie && onSlot || r.kind === 'lie' && !r.path.length) {
        r.sprite.material.rotation = Math.PI / 2;
        r.sprite.center.set(0.5, 0.5);
        r.sprite.position.set(wx, y + r.sprite.scale.x * 0.5, wz);
        r.shadow.visible = false;
      } else {
        r.sprite.material.rotation = 0;
        r.sprite.center.set(0.5, 0);
        r.sprite.position.set(wx, y + 0.01, wz);
        r.shadow.visible = true;
        r.shadow.position.set(wx, (onSlot ? r.slot.y : 0) + 0.02, wz);
      }
      if (r.flash > 0) { r.flash -= dt; r.sprite.material.color.set('#ff6a6a'); } else r.sprite.material.color.set('#ffffff');
    };
    for (const r of this.ents.values()) place(r);
    for (const r of this.decos) place(r);
  }

  light(now) {
    const h = this.sim.hour();
    const dayF = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 20 ? 1 - (h - 18) / 2 : 0;
    const M = LIB.M;
    if (this.dungeon) {
      this.hemi.intensity = 1.25; this.hemi.color.set('#b0a8c8'); this.hemi.groundColor.set('#302428');
      this.sun.intensity = 0.5;
    } else if (this.outdoor) {
      const sky = new THREE.Color('#0e1633').lerp(new THREE.Color('#8fd0ff'), dayF);
      this.scene.background = sky;
      this.hemi.intensity = 0.45 + dayF * 0.9; this.hemi.color.set(dayF > 0.3 ? '#dff1ff' : '#5a6aa8'); this.hemi.groundColor.set('#5d7a3a');
      this.sun.intensity = 0.2 + dayF * 1.8;
      this.sun.color.set(dayF > 0.2 ? '#fff2d6' : '#8aa0ff');
    } else {
      this.hemi.intensity = 0.72 + dayF * 0.45; this.hemi.color.set(dayF > 0.3 ? '#fff0dc' : '#8a90b8'); this.hemi.groundColor.set('#3a2a20');
      this.sun.intensity = dayF * 1.1;
      this.sun.color.set('#fff2d6');
    }
    M.win.emissiveIntensity = 0.15 + dayF * 0.85;
    M.win.emissive.set(dayF > 0.3 ? '#cfeaff' : '#3a4a80');
    M.stained.emissiveIntensity = 0.25 + dayF * 0.9;
    M.beam.opacity = 0.18 * dayF;
    M.daylight.emissiveIntensity = 0.2 + dayF * 0.9;
    const night = 1 - dayF;
    const f1 = 0.85 + Math.sin(now * 11) * 0.08 + Math.sin(now * 23.7) * 0.07;
    const f2 = 0.85 + Math.sin(now * 13.3 + 1) * 0.08 + Math.sin(now * 19.1) * 0.07;
    M.fire.emissiveIntensity = 1.5 * f1; M.fire2.emissiveIntensity = 1.6 * f2; M.coal.emissiveIntensity = 1.0 + 0.3 * f1; M.candle.emissiveIntensity = 1.3 * f2;
    M.purpleFire.emissiveIntensity = 1.7 * f2;
    M.magic.emissiveIntensity = 1.3 + Math.sin(now * 2) * 0.4; M.redMagic.emissiveIntensity = 1.3 + Math.sin(now * 2.3) * 0.4;
    M.lava.emissiveIntensity = 0.9 + Math.sin(now * 1.5) * 0.2;
    M.crystal.emissiveIntensity = 1.0 + Math.sin(now * 1.7) * 0.25;
    if (M.lava.map) M.lava.map.offset.set((now * 0.02) % 1, (now * 0.013) % 1);
    const boost = this.dungeon ? 1 : 0.75 + night * 0.5;
    for (const p of this.points) {
      const u = p.userData;
      const fl = 1 + (Math.sin(now * 9 + u.ph) * 0.07 + Math.sin(now * 21.3 + u.ph * 2) * 0.05) * u.flick;
      p.intensity = u.base * fl * boost;
    }
  }

  cullWalls() {
    if (!this.walls) return;
    const t = this.controls.target, c = this.camera.position;
    const ox = c.x - t.x, oz = c.z - t.z;
    const top = Math.hypot(ox, oz) < 0.5;
    this.walls.S.visible = top || oz <= 0.3;
    this.walls.N.visible = top || oz >= -0.3;
    this.walls.E.visible = top || ox <= 0.3;
    this.walls.W.visible = top || ox >= -0.3;
  }

  // ---------- 選ぶ・しゃべる ----------
  project(v) {
    const p = v.clone().project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + (p.x * 0.5 + 0.5) * rect.width, y: rect.top + (-p.y * 0.5 + 0.5) * rect.height, ok: p.z < 1 && p.z > -1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05 };
  }
  pick(clientX, clientY) {
    if (!this.scene) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const sprites = [...this.ents.values()].map((r) => r.sprite);
    const hit = this.raycaster.intersectObjects(sprites, false);
    if (hit.length) return { entity: hit[0].object.userData.id };
    let best = null, bd = 24;
    for (const r of this.ents.values()) {
      const s = this.project(r.sprite.position.clone().add(new THREE.Vector3(0, r.sprite.scale.y / 2, 0)));
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (d < bd) { bd = d; best = r.id; }
    }
    return best != null ? { entity: best } : null;
  }
  say(id, text) {
    const r = this.ents.get(id);
    if (!r || !text) return;
    let b = this.bubbles.get(id);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'iv-bubble';
      Object.assign(el.style, {
        position: 'fixed', zIndex: 60, pointerEvents: 'none', transform: 'translate(-50%, -100%)', maxWidth: '200px',
        background: '#fffdf4', color: '#2a1e14', border: '2px solid #2a1e14', borderRadius: '6px', padding: '3px 7px',
        font: '12px/1.35 "DotGothic16", sans-serif', boxShadow: '2px 2px 0 rgba(0,0,0,0.35)', whiteSpace: 'pre-wrap',
      });
      document.body.appendChild(el);
      b = { el, until: 0 };
      this.bubbles.set(id, b);
    }
    b.el.textContent = text;
    b.until = this.time + Math.min(7, 2.5 + text.length * 0.12);
  }
  updateBubbles(now) {
    for (const [id, b] of this.bubbles) {
      const r = this.ents.get(id);
      if (!r || now > b.until) { b.el.remove(); this.bubbles.delete(id); continue; }
      const top = r.sprite.position.clone().add(new THREE.Vector3(0, r.sprite.material.rotation ? r.sprite.scale.x * 0.6 : r.sprite.scale.y + 0.1, 0));
      const s = this.project(top);
      b.el.style.display = s.ok ? 'block' : 'none';
      b.el.style.left = `${s.x}px`; b.el.style.top = `${s.y - 4}px`;
    }
  }
}
