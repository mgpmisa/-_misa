// ドット絵テクスチャを canvas で生成
import * as THREE from 'three';

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, f);
  return '#' + c.getHexString();
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };

export function noiseTex(base, seed, amt = 0.06, extra) {
  return canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = hash(x, y, seed);
      px(g, x, y, r < 0.18 ? shade(base, -amt) : r > 0.85 ? shade(base, amt) : base);
    }
    extra && extra(g);
  }, true);
}

export const TEX = {};
export function buildTextures() {
  TEX.grass = noiseTex('#5da53c', 1, 0.06, (g) => {
    for (let i = 0; i < 3; i++) { const x = (hash(i, 9, 3) * 16) | 0, y = (hash(i, 7, 3) * 16) | 0; px(g, x, y, hash(i, 1, 1) > 0.5 ? '#f4f0d0' : '#f2d04a'); }
    for (let i = 0; i < 5; i++) { const x = (hash(i, 2, 5) * 16) | 0, y = (hash(i, 4, 5) * 15) | 0; px(g, x, y, '#79c24e'); px(g, x, y + 1, '#4c8f30'); }
  });
  TEX.grassSnow = noiseTex('#e9eef4', 2, 0.04, (g) => { for (let i = 0; i < 6; i++) px(g, (hash(i, 3, 8) * 16) | 0, (hash(i, 5, 8) * 16) | 0, '#9fb7a0'); });
  TEX.grassAutumn = noiseTex('#8fa33c', 11, 0.07, (g) => { for (let i = 0; i < 6; i++) px(g, (hash(i, 3, 18) * 16) | 0, (hash(i, 5, 18) * 16) | 0, hash(i, 1, 2) > 0.5 ? '#c9782e' : '#d9a441'); });
  TEX.road = noiseTex('#c99a5c', 3, 0.07, (g) => { for (let i = 0; i < 5; i++) px(g, (hash(i, 3, 4) * 16) | 0, (hash(i, 5, 4) * 16) | 0, '#9c7446'); });
  TEX.roadSnow = noiseTex('#d8cfc2', 13, 0.05);
  TEX.plaza = canvasTex(16, 16, (g) => {
    g.fillStyle = '#a9a39a'; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = (y % 8 === 0) || ((x + (Math.floor(y / 8) % 2) * 4) % 8 === 0);
      if (edge) px(g, x, y, '#7d776e'); else if (hash(x, y, 6) > 0.85) px(g, x, y, '#bdb7ae');
    }
  }, true);
  TEX.sand = noiseTex('#dcc58e', 7, 0.05);
  TEX.dirt = noiseTex('#7a5534', 8, 0.06, (g) => { for (let i = 0; i < 6; i++) px(g, (hash(i, 3, 9) * 16) | 0, (hash(i, 5, 9) * 16) | 0, '#5e3f25'); });
  TEX.water = canvasTex(16, 16, (g) => {
    g.fillStyle = '#3d8fd8'; g.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 7; i++) { const x = (hash(i, 1, 10) * 14) | 0, y = (hash(i, 2, 10) * 16) | 0; g.fillStyle = '#7cc0f0'; g.fillRect(x, y, 3, 1); }
    for (let i = 0; i < 6; i++) px(g, (hash(i, 3, 11) * 16) | 0, (hash(i, 4, 11) * 16) | 0, '#2f75b8');
  }, true);
  // 畑（季節ごと）
  const field = (soil, crop, tip, density) => canvasTex(16, 16, (g) => {
    g.fillStyle = soil; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (y % 4 === 3) px(g, x, y, shade(soil, -0.06));
      else if (crop && hash(x, y, 12) < density) px(g, x, y, hash(x, y, 13) > 0.7 ? tip : crop);
    }
  }, true);
  TEX.field = [
    field('#8a5d36', '#79c24e', '#a7e070', 0.35),
    field('#7a5230', '#4f9a32', '#6cb846', 0.85),
    field('#7a5230', '#d9b24a', '#f0d27a', 0.9),
    field('#8a6848', '#e8eef2', '#ffffff', 0.5),
  ];
  TEX.thatch = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const r = hash(x, y, 20);
      px(g, x, y, y % 4 === 0 ? '#a8631e' : r < 0.25 ? '#c97a28' : r > 0.8 ? '#f0b04e' : '#e09a38');
    }
  }, true);
  TEX.tileRoof = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 2) % 4 === 0;
      px(g, x, y, edge ? '#6b2e1e' : hash(x, y, 21) > 0.8 ? '#b0503a' : '#94412c');
    }
  }, true);
  TEX.slate = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 2) % 4 === 0;
      px(g, x, y, edge ? '#1d3f63' : hash(x, y, 22) > 0.8 ? '#4d86b8' : '#2f6394');
    }
  }, true);
  TEX.greyRoof = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, y % 4 === 0 ? '#55575c' : hash(x, y, 23) > 0.8 ? '#8a8d93' : '#6f7278');
  }, true);
  TEX.snowRoof = noiseTex('#eef3f8', 24, 0.04);
  // 木骨造りの壁
  const timber = (plaster, beam) => canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, hash(x, y, 30) > 0.9 ? shade(plaster, -0.05) : plaster);
    g.fillStyle = beam;
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); g.fillRect(0, 7, 16, 1);
    for (let i = 0; i < 7; i++) { px(g, 1 + i, 8 + i, beam); px(g, 14 - i, 8 + i, beam); }
  }, true);
  TEX.timber = timber('#eadfc4', '#5a3a22');
  TEX.timber2 = timber('#e2cfa6', '#4a2e1a');
  TEX.stone = canvasTex(16, 16, (g) => {
    g.fillStyle = '#d8d2c4'; g.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const edge = y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0;
      if (edge) px(g, x, y, '#a8a194'); else if (hash(x, y, 31) > 0.85) px(g, x, y, '#ece6d8');
    }
  }, true);
  TEX.darkStone = noiseTex('#6a6660', 32, 0.07);
  TEX.wood = canvasTex(16, 16, (g) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, x % 4 === 0 ? '#4a2e1a' : hash(x, y, 33) > 0.8 ? '#8a5a34' : '#6e4526');
  }, true);
  TEX.awning = canvasTex(8, 8, (g) => { for (let x = 0; x < 8; x++) { g.fillStyle = x % 4 < 2 ? '#c93a32' : '#f2ead8'; g.fillRect(x, 0, 1, 8); } }, true);
  TEX.awning2 = canvasTex(8, 8, (g) => { for (let x = 0; x < 8; x++) { g.fillStyle = x % 4 < 2 ? '#2f6ab0' : '#f2ead8'; g.fillRect(x, 0, 1, 8); } }, true);
  return TEX;
}

// 住人のドット絵（16x20）
export function personTexture(p, ageGroup) {
  const L = p.look;
  return canvasTex(16, 20, (g) => {
    const f = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const hair = ageGroup === 'elder' ? '#d8d8d8' : L.hair;
    const skin = L.skin;
    const dark = shade(L.shirt, -0.15);
    // 脚
    if (p.sex === 'f' && ageGroup !== 'child') {
      f(4, 11, 8, 6, L.shirt); f(4, 16, 8, 1, dark); f(5, 17, 2, 2, '#3a2a1e'); f(9, 17, 2, 2, '#3a2a1e');
    } else {
      f(5, 13, 2, 5, L.pants); f(9, 13, 2, 5, L.pants); f(5, 18, 2, 1, '#2a1e14'); f(9, 18, 2, 1, '#2a1e14');
    }
    // 体
    f(4, 8, 8, 6, L.shirt); f(4, 13, 8, 1, dark);
    if (p.sex === 'm' || ageGroup === 'child') f(4, 12, 8, 1, '#5a3a22');
    f(3, 9, 1, 4, skin); f(12, 9, 1, 4, skin); f(3, 8, 1, 1, L.shirt); f(12, 8, 1, 1, L.shirt);
    // 頭
    f(5, 2, 6, 6, skin);
    f(6, 5, 1, 1, '#2a1e14'); f(9, 5, 1, 1, '#2a1e14');
    f(7, 7, 2, 1, shade(skin, -0.12));
    // 髪
    f(5, 1, 6, 2, hair); f(4, 2, 1, 3, hair); f(11, 2, 1, 3, hair);
    if (L.hairStyle === 1) { f(5, 3, 2, 1, hair); }
    if (p.sex === 'f') {
      f(4, 5, 1, 4, hair); f(11, 5, 1, 4, hair);
      if (L.hairStyle === 2) { f(4, 9, 1, 2, hair); f(11, 9, 1, 2, hair); }
    }
    if (L.beard && ageGroup !== 'child') f(6, 7, 4, 1, hair === '#d8d8d8' ? '#e8e8e8' : shade(hair, -0.05));
    if (ageGroup === 'elder' && p.sex === 'm') f(5, 1, 6, 1, shade(skin, -0.05));
    // 輪郭
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(30,20,12,0.9)';
    const img = g.getImageData(0, 0, 16, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++) {
      const a = img.data[(y * 16 + x) * 4 + 3];
      if (a) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < 16 && ny < 20 && img.data[(ny * 16 + nx) * 4 + 3] > 0;
      });
      if (n) g.fillRect(x, y, 1, 1);
    }
  });
}
