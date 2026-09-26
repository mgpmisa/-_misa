// 地形の区画描画：大陸を 32×32 マスの区画に分け、カメラに映る区画だけを描く。
//  ・近い区画は今までと同じ見た目（ドット絵の地面・段差の側面・木・畑の作物・川）。
//  ・隠れて見えない側面は作らないので、今の「全マスに箱」より三角形がずっと少ない。
//  ・地面のテクスチャは1枚の貼り合わせ（アトラス）にまとめ、区画ごとに描画1〜2回ですむ。季節はアトラスを描き直すだけ。
//  ・遠い区画（引いて見たとき、または画面の奥）は、2×2 か 4×4 マスをまとめた粗い地面にし、木を省く。
//  ・開拓や道普請でマスが変わったら rebuildTiles(マス番号の配列) で、その区画だけ作り直す。
//  ・未開拓地（S.explored で「どの国も知らない」区画）は、霧がかかったように暗く、色を抜いて描く。
// 使い方（render.js）：
//   this.chunks = new TerrainChunks(this.scene, sim.S.world, TEX, { groundKey: (t, x, z) => this.groundKey(t, x, z), crystalMat: this.mats.crystal, getExplored: () => sim.S.explored });
//   毎フレーム this.chunks.update(this.camera, this.controls.target, this.renderer)
import * as THREE from 'three';
import { W, H, T } from './world.js';
import { FOG_CELL, FW, FH } from './lod.js';

export const CHUNK = 32;
const NCX = Math.ceil(W / CHUNK), NCZ = Math.ceil(H / CHUNK);
const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
const topY = (h) => 0.3 + h * 0.4;
const NORTH = H * 0.62;
const BOTTOM = -1.6;
const hsh = (x, z, s = 0) => { let h = (x * 73856093) ^ (z * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// 詳しさの段階：0＝1マスずつ（木あり）、1＝2×2 まとめ、2＝4×4 まとめ
const LEVEL_STEP = [1, 2, 4];
const MAX_FULL = 36;          // 1マスずつで描く区画の上限（カメラの近い順）。今の 160 の世界は全部で 25 区画なので、いつも全部が段階0
const PX_L1 = 1.5, PX_L2 = 0.75;   // 1マスが画面で何ピクセルより小さくなったら粗くするか
const BUILD_MS = 8;           // 1フレームで区画を作る時間の目安
const KEEP_VERTS = 2_500_000; // 作り置きの頂点数の上限（超えたら、見えていない区画から捨てる）

// 地面のアトラス（1枠 16px ＋ まわり 1px の余白）
const SLOT = 18, ACOLS = 8;
const SLOT_KEYS = ['grassN', 'grassS', 'pasture', 'roadN', 'roadS', 'plaza', 'field', 'sand', 'desert', 'snow', 'rock', 'peak', 'forestN', 'forestS', 'dense', 'jungle', 'savanna', 'swamp', 'waste', 'seabed', 'riverbed', 'sideDirt', 'sideSand', 'sideRock', 'lava'];
const SLOT_OF = Object.fromEntries(SLOT_KEYS.map((k, i) => [k, i]));
const AW = ACOLS * SLOT, AH = Math.ceil(SLOT_KEYS.length / ACOLS) * SLOT;
const sideKeyFor = (k) => (['sand', 'desert', 'seabed', 'riverbed'].includes(k) ? 'sideSand' : ['rock', 'peak', 'waste'].includes(k) ? 'sideRock' : 'sideDirt');

// 霧（未開拓地）のシェーダー：暗く・色を抜き・うっすら青みがかった靄をかける。aFog が 0 の所は今までと同じ。
function addFog(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFog;\nvarying float vFog;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFog = aFog;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFog;')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\nif (vFog > 0.001) { float l = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)); vec3 mist = vec3(l) * 0.42 + vec3(0.05, 0.06, 0.085); gl_FragColor.rgb = mix(gl_FragColor.rgb, mist, clamp(vFog, 0.0, 1.0) * 0.82); }');
  };
  mat.customProgramCacheKey = () => 'eldeFog1';
  return mat;
}

// 頂点をためる入れ物
class GeoBuf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.f = []; this.i = []; this.v = 0; }
  // 4隅 a,b,c,d（どちら回りでもよい。法線 nrm の向きに合わせて表を決める）
  quad(pts, nrm, uvs, col, fogs) {
    const [a, b, c] = pts;
    const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0;
    const v0 = this.v;
    for (let k = 0; k < 4; k++) {
      this.p.push(pts[k][0], pts[k][1], pts[k][2]); this.n.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uvs[k * 2], uvs[k * 2 + 1]); this.c.push(col[0], col[1], col[2]); this.f.push(fogs[k]);
    }
    if (flip) this.i.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2); else this.i.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
    this.v += 4;
  }
  geometry() {
    if (!this.v) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aFog', new THREE.Float32BufferAttribute(this.f, 1));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.userData.fogXZ = this.fogXZ; // 霧の描き直し用（頂点ごとの霧の位置）
    return g;
  }
}

export class TerrainChunks {
  // textures：textures.js の TEX（buildTextures() 済み）
  // opts.groundKey(t, x, z)：render.js の groundKey（建物の下の地面の種類をそろえるため）。なければ同じ規則の写しを使う
  // opts.crystalMat：魔界の結晶の材質（render.js の this.mats.crystal）
  // opts.getExplored()：S.explored（なければ霧なし）
  constructor(scene, world, textures, opts = {}) {
    this.scene = scene; this.world = world; this.TEX = textures; this.opts = opts;
    this.groundKey = opts.groundKey || ((t, x, z) => this.defaultGroundKey(t, x, z));
    this.chunks = [];
    for (let cz = 0; cz < NCZ; cz++) for (let cx = 0; cx < NCX; cx++) {
      const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = Math.min(W, x0 + CHUNK), z1 = Math.min(H, z0 + CHUNK);
      const box = new THREE.Box3(new THREE.Vector3(wx(x0) - 0.5, BOTTOM, wz(z0) - 0.5), new THREE.Vector3(wx(x1 - 1) + 0.5, topY(9) + 3, wz(z1 - 1) + 0.5));
      this.chunks.push({ id: cz * NCX + cx, cx, cz, x0, z0, x1, z1, box, lv: [null, null, null], shown: -1, seen: 0, dirty: false, fogRev: 0 });
    }
    this.season = 0;
    this.frame = 0;
    this.fogRev = 0;
    this.stats = { visible: 0, full: 0, built: 0, verts: 0, drawn: 0 };
    this.makeMaterials();
    this.inTownBox = world.settlements.map((s) => [s.x - s.r - 1, s.z - s.r - 1, s.x + s.r + 1, s.z + s.r + 1]);
    this._frustum = new THREE.Frustum(); this._m4 = new THREE.Matrix4();
  }

  defaultGroundKey(t, x, z) {
    const n = z < NORTH;
    switch (t) {
      case T.BLD: {
        const b = this.world.buildings[this.world.bldAt[z * W + x]];
        if (b?.type === 'demoncastle') return 'waste';
        if (b?.type === 'pyramid') return 'desert';
        if (b?.type === 'cave' || b?.type === 'mine') return 'rock';
        if (b?.type === 'castle' || b?.type === 'church' || b?.type === 'market') return 'plaza';
        return n ? 'grassN' : 'grassS';
      }
      case T.GRASS: case T.FENCE: return n ? 'grassN' : 'grassS';
      case T.PASTURE: return 'pasture';
      case T.ROAD: return n ? 'roadN' : 'roadS';
      case T.PLAZA: case T.WALL: return 'plaza';
      case T.FIELD: return 'field';
      case T.BEACH: return 'sand';
      case T.DESERT: return 'desert';
      case T.SNOW: return 'snow';
      case T.ROCK: return 'rock';
      case T.PEAK: return 'peak';
      case T.FOREST: return n ? 'forestN' : 'forestS';
      case T.DENSE: return 'dense';
      case T.JUNGLE: return 'jungle';
      case T.SAVANNA: return 'savanna';
      case T.SWAMP: return 'swamp';
      case T.WASTE: return 'waste';
      case T.LAVA: return 'lava';
      case T.DOCK: case T.BRIDGE: return 'riverbed';
      case T.SEA: case T.DEEP: return 'seabed';
      case T.RIVER: return 'riverbed';
      default: return 'grassN';
    }
  }

  // ---------- 材質とアトラス ----------
  makeMaterials() {
    const TEX = this.TEX;
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    this.atlasCtx = cv.getContext('2d'); this.atlasCtx.imageSmoothingEnabled = false;
    const at = this.atlas = new THREE.CanvasTexture(cv);
    at.magFilter = THREE.NearestFilter; at.minFilter = THREE.NearestFilter; at.generateMipmaps = false; at.colorSpace = THREE.SRGBColorSpace;
    this.slotImg = {
      grassN: TEX.grass, grassS: TEX.grass, pasture: TEX.pasture, roadN: TEX.road, roadS: TEX.road, plaza: TEX.plaza, field: TEX.field[0],
      sand: TEX.sand, desert: TEX.desert, snow: TEX.snow, rock: TEX.rock, peak: TEX.peak, forestN: TEX.forestFloor, forestS: TEX.forestFloor,
      dense: TEX.denseFloor, jungle: TEX.jungleFloor, savanna: TEX.savanna, swamp: TEX.swamp, waste: TEX.waste, seabed: TEX.sand, riverbed: TEX.sand,
      sideDirt: TEX.dirt, sideSand: TEX.sand, sideRock: TEX.rock, lava: TEX.lava,
    };
    for (const k of SLOT_KEYS) this.drawSlot(k);
    this.groundMat = addFog(new THREE.MeshLambertMaterial({ map: at, vertexColors: true }));
    this.lavaMat = addFog(new THREE.MeshLambertMaterial({ map: TEX.lava, vertexColors: true, emissive: '#ff5a1a', emissiveIntensity: 0.8, emissiveMap: TEX.lava }));
    this.riverMat = addFog(new THREE.MeshLambertMaterial({ map: TEX.water, transparent: true, opacity: 0.9 }));
    this.cropMat = addFog(new THREE.MeshLambertMaterial({ color: '#d9b24a' }));
    this.cropGeo = new THREE.BoxGeometry(0.82, 1, 0.82); this.cropGeo.translate(0, 0.5, 0);
    // 海底・川底の色（render.js の材質の色と同じ）。頂点色に掛ける
    this.tint = { seabed: new THREE.Color('#6a8aa0'), riverbed: new THREE.Color('#8a9a88') };
    // 木（render.js の buildTrees と同じ形・色）
    const L = (o) => addFog(new THREE.MeshLambertMaterial({ flatShading: true, ...o }));
    const tm = this.treeMats = {
      trunk: L({ color: '#6b4226' }), pine: L({ color: '#2f6b3a' }), pine2: L({ color: '#3d8247' }), round: L({ color: '#4d9a3c' }), jungle: L({ color: '#2f7a2a' }),
      palm: L({ color: '#4f9a2a' }), cactus: L({ color: '#4f8a3a' }), acacia: L({ color: '#7a8a2a' }), dead: L({ color: '#3a2a26' }), boulder: L({ color: '#8a8580' }),
      crystal: this.opts.crystalMat ? addFog(this.opts.crystalMat.clone()) : L({ color: '#8a1a3a', emissive: '#ff3a5a', emissiveIntensity: 0.6 }),
      snowPine: L({ color: '#e8f0f0' }),
    };
    this.treeGeo = {
      trunk: new THREE.BoxGeometry(0.16, 0.5, 0.16).translate(0, 0.25, 0),
      tallTrunk: new THREE.BoxGeometry(0.14, 1.2, 0.14).translate(0, 0.6, 0),
      pine1: new THREE.ConeGeometry(0.5, 0.9, 6).translate(0, 0.8, 0), pine2: new THREE.ConeGeometry(0.36, 0.75, 6).translate(0, 1.3, 0),
      round: new THREE.IcosahedronGeometry(0.48, 0).translate(0, 0.85, 0),
      jungle: new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.6, 1).translate(0, 1.5, 0),
      palm: new THREE.ConeGeometry(0.75, 0.25, 6).translate(0, 1.3, 0),
      cactus: new THREE.BoxGeometry(0.2, 0.8, 0.2).translate(0, 0.4, 0), cactusArm: new THREE.BoxGeometry(0.5, 0.14, 0.14).translate(0, 0.5, 0),
      acacia: new THREE.CylinderGeometry(0.75, 0.6, 0.18, 7).translate(0, 1.0, 0),
      dead: new THREE.BoxGeometry(0.1, 0.9, 0.1).translate(0, 0.45, 0), deadBranch: new THREE.BoxGeometry(0.5, 0.07, 0.07).translate(0.1, 0.7, 0),
      boulder: new THREE.DodecahedronGeometry(0.38, 0).translate(0, 0.15, 0), crystal: new THREE.OctahedronGeometry(0.25, 0).scale(0.6, 1.6, 0.6).translate(0, 0.35, 0),
    };
    // 部品の名前 → [形, 材質]（render.js の put(name, geo, mat) と同じ組み合わせ）
    const G = this.treeGeo;
    this.partDef = {
      trunk: [G.trunk, tm.trunk], tallTrunk: [G.tallTrunk, tm.trunk], pine1: [G.pine1, tm.pine], pine2: [G.pine2, tm.pine2], round: [G.round, tm.round],
      snowPine: [G.pine1, tm.snowPine], jungle: [G.jungle, tm.jungle], palm: [G.palm, tm.palm], cactus: [G.cactus, tm.cactus], cactusArm: [G.cactusArm, tm.cactus],
      acacia: [G.acacia, tm.acacia], dead: [G.dead, tm.dead], deadBranch: [G.deadBranch, tm.dead], boulder: [G.boulder, tm.boulder], crystal: [G.crystal, tm.crystal],
    };
  }
  drawSlot(k) {
    const i = SLOT_OF[k], img = this.slotImg[k]?.image;
    if (!img) return;
    const g = this.atlasCtx, x = (i % ACOLS) * SLOT, y = ((i / ACOLS) | 0) * SLOT;
    // まわり 1px は端の色を写す（ドットがにじまないように）
    g.drawImage(img, 0, 0, 16, 16, x + 1, y + 1, 16, 16);
    g.drawImage(img, 0, 0, 1, 16, x, y + 1, 1, 16); g.drawImage(img, 15, 0, 1, 16, x + 17, y + 1, 1, 16);
    g.drawImage(g.canvas, x, y + 1, SLOT, 1, x, y, SLOT, 1); g.drawImage(g.canvas, x, y + 16, SLOT, 1, x, y + 17, SLOT, 1);
    this.atlas.needsUpdate = true;
  }
  // 枠の中の (u0,v0)（0〜1。v0=1 が絵の上）をアトラスの uv に
  auv(k, u0, v0) {
    const i = SLOT_OF[k], sx = (i % ACOLS) * SLOT + 1, sy = ((i / ACOLS) | 0) * SLOT + 1;
    return [(sx + u0 * 16) / AW, 1 - (sy + (1 - v0) * 16) / AH];
  }

  // ---------- 季節（render.js の applySeason から呼ぶ） ----------
  applySeason(si) {
    const TEX = this.TEX;
    this.season = si;
    this.slotImg.grassN = [TEX.grass, TEX.grass, TEX.grassAutumn, TEX.snow][si];
    this.slotImg.forestN = [TEX.forestFloor, TEX.forestFloor, TEX.grassAutumn, TEX.snow][si];
    this.slotImg.roadN = si === 3 ? TEX.roadSnow : TEX.road;
    this.slotImg.grassS = si === 2 ? TEX.savanna : TEX.grass;
    this.slotImg.field = TEX.field[si];
    for (const k of ['grassN', 'forestN', 'roadN', 'grassS', 'field']) this.drawSlot(k);
    this.cropMat.color.set(['#79c24e', '#4f9a32', '#e0b84a', '#ffffff'][si]);
    this.treeMats.round.color.set(['#4d9a3c', '#3f8a32', '#d0822e', '#b8c4b8'][si]);
    this.treeMats.pine.color.set(si === 3 ? '#cfe0d8' : '#2f6b3a');
    this.treeMats.pine2.color.set(si === 3 ? '#ffffff' : '#3d8247');
    for (const ch of this.chunks) if (ch.lv[0]) this.placeCrops(ch.lv[0]);
  }
  cropHeight() { return [0.1, 0.32, 0.4, 0.0][this.season]; }
  placeCrops(L) {
    if (!L.crops) return;
    const h = this.cropHeight(), m4 = new THREE.Matrix4(), w = this.world;
    L.cropTiles.forEach(([x, z], i) => {
      const hh = h * (0.8 + hsh(x, z, 2) * 0.4);
      m4.makeScale(1, Math.max(0.001, hh), 1).setPosition(wx(x), topY(w.hgt[z * W + x]), wz(z));
      L.crops.setMatrixAt(i, m4);
    });
    L.crops.visible = h > 0;
    L.crops.instanceMatrix.needsUpdate = true;
  }

  // ---------- 霧 ----------
  fogAt(X, Z) {
    const ex = this.opts.getExplored?.();
    if (!ex) return 0;
    const fx = X / FOG_CELL - 0.5, fz = Z / FOG_CELL - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
    const v = (cx, cz) => { cx = cx < 0 ? 0 : cx >= FW ? FW - 1 : cx; cz = cz < 0 ? 0 : cz >= FH ? FH - 1 : cz; return ex[cz * FW + cx] ? 0 : 1; };
    return (v(x0, z0) * (1 - tx) + v(x0 + 1, z0) * tx) * (1 - tz) + (v(x0, z0 + 1) * (1 - tx) + v(x0 + 1, z0 + 1) * tx) * tz;
  }
  // 霧の状態が変わったら呼ぶ（S.explored を書き換えたあと）。cells を渡せば、その霧区画にかかる区画だけ描き直す
  refreshFog(cells = null) {
    this.fogRev++;
    if (!cells) return;
    const touch = new Set();
    for (const i of cells) {
      const fx = i % FW, fz = (i / FW) | 0;
      // 霧は隣の霧区画へなめらかにつながるので、1区画ぶん広めに
      for (const [x, z] of [[fx * FOG_CELL - FOG_CELL, fz * FOG_CELL - FOG_CELL], [fx * FOG_CELL + 2 * FOG_CELL, fz * FOG_CELL + 2 * FOG_CELL], [fx * FOG_CELL - FOG_CELL, fz * FOG_CELL + 2 * FOG_CELL], [fx * FOG_CELL + 2 * FOG_CELL, fz * FOG_CELL - FOG_CELL]]) {
        const cx = Math.min(NCX - 1, Math.max(0, Math.floor(x / CHUNK))), cz = Math.min(NCZ - 1, Math.max(0, Math.floor(z / CHUNK)));
        touch.add(cz * NCX + cx);
      }
    }
    // 触れない区画は、ひとつ前まで最新だったものだけ「最新」のままにする
    for (const ch of this.chunks) if (!touch.has(ch.id) && ch.fogRev === this.fogRev - 1) ch.fogRev = this.fogRev;
  }
  applyFog(ch) {
    for (const L of ch.lv) {
      if (!L) continue;
      for (const m of L.fogMeshes) {
        const g = m.geometry, a = g.getAttribute('aFog'), xz = g.userData.fogXZ;
        if (!a || !xz) continue;
        for (let i = 0; i < a.count; i++) a.array[i] = this.fogAt(xz[i * 2], xz[i * 2 + 1]);
        a.needsUpdate = true;
      }
    }
    ch.fogRev = this.fogRev;
  }

  // ---------- 1区画を作る ----------
  tileTop(i) {
    const w = this.world, t = w.tiles[i], h = w.hgt[i];
    let y = topY(h);
    if (t === T.SEA) y = -0.35; else if (t === T.DEEP) y = -0.9; else if (t === T.RIVER || t === T.BRIDGE) y = topY(h) - 0.35; else if (t === T.DOCK) y = -0.35;
    else if (t === T.ROAD || t === T.PLAZA) y -= 0.02;
    return y;
  }
  inTown(x, z) { for (const b of this.inTownBox) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3]) return true; return false; }

  // s×s マスのまとまり（s=1 なら1マス）の見た目：地面の種類・高さ・明るさ
  blockInfo(bx, bz, s) {
    const w = this.world;
    if (s === 1) {
      const i = bz * W + bx, t = w.tiles[i];
      return { key: this.groundKey(t, bx, bz), y: this.tileTop(i), v: 0.92 + hsh(bx, bz, 1) * 0.12 };
    }
    const cnt = {}; let ys = 0, n = 0, best = null, bc = 0;
    for (let z = bz; z < Math.min(H, bz + s); z++) for (let x = bx; x < Math.min(W, bx + s); x++) {
      const i = z * W + x, t = w.tiles[i];
      if (t === T.RIVER || t === T.BRIDGE) continue;   // 川は上から細く重ねて描く
      const k = this.groundKey(t, x, z);
      const c = (cnt[k] = (cnt[k] || 0) + 1);
      if (c > bc) { bc = c; best = k; }
      ys += this.tileTop(i); n++;
    }
    if (!n) { const i = bz * W + bx; return { key: 'riverbed', y: this.tileTop(i), v: 1 }; }
    return { key: best, y: ys / n, v: 0.92 + hsh(bx, bz, 1) * 0.12 };
  }

  buildLevel(ch, lvl) {
    const s = LEVEL_STEP[lvl], w = this.world;
    const ground = new GeoBuf(), lava = new GeoBuf(), river = new GeoBuf();
    ground.fogXZ = []; lava.fogXZ = []; river.fogXZ = [];
    const col = [0, 0, 0];
    const infoCache = new Map();
    const info = (bx, bz) => {
      if (bx < 0 || bz < 0 || bx >= W || bz >= H) return null;
      const k = bz * W + bx;
      let r = infoCache.get(k); if (!r) infoCache.set(k, r = this.blockInfo(bx, bz, s));
      return r;
    };
    for (let bz = ch.z0; bz < ch.z1; bz += s) for (let bx = ch.x0; bx < ch.x1; bx += s) {
      const I = info(bx, bz), key = I.key, y = I.y;
      const X0 = bx, X1 = Math.min(W, bx + s), Z0 = bz, Z1 = Math.min(H, bz + s);
      const px0 = wx(X0) - 0.5, px1 = wx(X1 - 1) + 0.5, pz0 = wz(Z0) - 0.5, pz1 = wz(Z1 - 1) + 0.5;
      const tint = this.tint[key];
      col[0] = I.v * (tint ? tint.r : 1); col[1] = I.v * (tint ? tint.g : 1); col[2] = I.v * (tint ? tint.b : 1);
      const fogs = [this.fogAt(X0, Z0), this.fogAt(X0, Z1), this.fogAt(X1, Z1), this.fogAt(X1, Z0)];
      const B = key === 'lava' ? lava : ground;
      const uvT = key === 'lava' ? [0, 1, 0, 0, 1, 0, 1, 1] : [...this.auv(key, 0, 1), ...this.auv(key, 0, 0), ...this.auv(key, 1, 0), ...this.auv(key, 1, 1)];
      B.quad([[px0, y, pz0], [px0, y, pz1], [px1, y, pz1], [px1, y, pz0]], [0, 1, 0], uvT, col, fogs);
      B.fogXZ.push(X0, Z0, X0, Z1, X1, Z1, X1, Z0);
      // 側面：隣が低い所だけ
      const sk = sideKeyFor(key), sc = [I.v, I.v, I.v];
      const vAt = (yy) => (yy - BOTTOM) / (y - BOTTOM);
      const side = (nb, pts, uAt, fx0, fz0, fx1, fz1) => {
        const yn = nb ? Math.max(BOTTOM, nb.y) : BOTTOM;
        if (yn >= y - 1e-4) return;
        const [a, b] = pts; // 面の両端（xz）
        const q = [[a[0], yn, a[1]], [a[0], y, a[1]], [b[0], y, b[1]], [b[0], yn, b[1]]];
        const ua = uAt[0], ub = uAt[1], vb = vAt(yn);
        const uv = [...this.auv(sk, ua, vb), ...this.auv(sk, ua, 1), ...this.auv(sk, ub, 1), ...this.auv(sk, ub, vb)];
        const f0 = this.fogAt(fx0, fz0), f1 = this.fogAt(fx1, fz1);
        ground.quad(q, pts[2], uv, sc, [f0, f0, f1, f1]);
        ground.fogXZ.push(fx0, fz0, fx0, fz0, fx1, fz1, fx1, fz1);
      };
      // +x（BoxGeometry の px 面：z が大きい側で u=0）
      side(info(X1, bz), [[px1, pz1], [px1, pz0], [1, 0, 0]], [0, 1], X1, Z1, X1, Z0);
      // -x（nx 面：z が小さい側で u=0）
      side(info(bx - s, bz), [[px0, pz0], [px0, pz1], [-1, 0, 0]], [0, 1], X0, Z0, X0, Z1);
      // +z（pz 面：x が小さい側で u=0）
      side(info(bx, Z1), [[px0, pz1], [px1, pz1], [0, 0, 1]], [0, 1], X0, Z1, X1, Z1);
      // -z（nz 面：x が大きい側で u=0）
      side(info(bx, bz - s), [[px1, pz0], [px0, pz0], [0, 0, -1]], [0, 1], X1, Z0, X0, Z0);
    }
    // 川の水面（どの段階でも1マスずつ。粗い地面のときは、その上に重ねる）
    for (let z = ch.z0; z < ch.z1; z++) for (let x = ch.x0; x < ch.x1; x++) {
      const i = z * W + x, t = w.tiles[i];
      if (t !== T.RIVER && t !== T.BRIDGE) continue;
      let y = topY(w.hgt[i]) - 0.12 + 0.025;
      if (s > 1) { const I = info(x - (x - ch.x0) % s, z - (z - ch.z0) % s); if (I) y = Math.max(y, I.y + 0.02); }
      const f = this.fogAt(x + 0.5, z + 0.5);
      river.quad([[wx(x) - 0.5, y, wz(z) - 0.5], [wx(x) - 0.5, y, wz(z) + 0.5], [wx(x) + 0.5, y, wz(z) + 0.5], [wx(x) + 0.5, y, wz(z) - 0.5]], [0, 1, 0], [0, 1, 0, 0, 1, 0, 1, 1], [1, 1, 1], [f, f, f, f]);
      river.fogXZ.push(x + 0.5, z + 0.5, x + 0.5, z + 0.5, x + 0.5, z + 0.5, x + 0.5, z + 0.5);
    }
    const group = new THREE.Group();
    const L = { group, verts: 0, fogMeshes: [], lvl };
    const add = (buf, mat, recv = true) => {
      const g = buf.geometry(); if (!g) return null;
      const m = new THREE.Mesh(g, mat); m.receiveShadow = recv; m.matrixAutoUpdate = false;
      m.userData.chunk = ch.id;
      group.add(m); L.fogMeshes.push(m); L.verts += buf.v;
      return m;
    };
    L.ground = add(ground, this.groundMat);
    add(lava, this.lavaMat);
    add(river, this.riverMat, false);
    if (lvl === 0) { this.buildTrees(ch, L); this.buildCrops(ch, L); }
    group.matrixAutoUpdate = false;
    return L;
  }

  // 木・岩（render.js の buildTrees と同じ規則・同じ乱数）
  buildTrees(ch, L) {
    const w = this.world, parts = {};
    const put = (name) => (parts[name] = parts[name] || []);
    for (let z = ch.z0; z < ch.z1; z++) for (let x = ch.x0; x < ch.x1; x++) {
      const t = w.tiles[z * W + x];
      const r = hsh(x, z, 7), r2 = hsh(x, z, 8);
      const y = topY(w.hgt[z * W + x]);
      const item = { x: wx(x) + (r2 - 0.5) * 0.3, y, z: wz(z) + (r - 0.5) * 0.3, s: 0.8 + r2 * 0.45, rot: r * 6.28, fx: x + 0.5, fz: z + 0.5 };
      if (this.inTown(x, z) && t !== T.FOREST && t !== T.DENSE) continue;
      switch (t) {
        case T.FOREST:
          if (r < 0.75) { if (r2 < 0.5) { put('trunk').push(item); put('round').push(item); } else { put('trunk').push(item); put('pine1').push(item); put('pine2').push(item); } }
          break;
        case T.DENSE:
          if (r < 0.9) { put('trunk').push(item); put('pine1').push(item); put('pine2').push(item); }
          break;
        case T.SNOW:
          if (r < 0.12) { put('trunk').push(item); put('snowPine').push(item); put('pine2').push(item); }
          break;
        case T.JUNGLE:
          if (r < 0.8) {
            if (r2 < 0.7) { put('tallTrunk').push(item); put('jungle').push(item); }
            else { put('tallTrunk').push(item); put('palm').push(item); }
          }
          break;
        case T.GRASS: if (r < 0.03) { put('trunk').push(item); put('round').push(item); } break;
        case T.SAVANNA: if (r < 0.05) { put('tallTrunk').push({ ...item, s: item.s * 0.8 }); put('acacia').push({ ...item, s: item.s * 0.8 }); } break;
        case T.DESERT: if (r < 0.04) { put('cactus').push(item); put('cactusArm').push(item); } else if (r < 0.06) put('boulder').push(item); break;
        case T.BEACH: if (z > H * 0.5 && r < 0.08) { put('tallTrunk').push(item); put('palm').push(item); } break;
        case T.ROCK: case T.PEAK: if (r < 0.22) put('boulder').push({ ...item, s: item.s * 1.3 }); break;
        case T.SWAMP: if (r < 0.2) { put('dead').push(item); put('deadBranch').push(item); } break;
        case T.WASTE: if (r < 0.08) { put('dead').push(item); put('deadBranch').push(item); } else if (r < 0.13) put('crystal').push(item); break;
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [name, list] of Object.entries(parts)) {
      const [base, mat] = this.partDef[name];
      // 形は写しを持つ（小さい形なので軽い。共有すると捨てるときに GPU の中身まで消えてしまう）
      const g = base.clone();
      const fog = new Float32Array(list.length), xz = [];
      list.forEach((it, i) => { fog[i] = this.fogAt(it.fx, it.fz); xz.push(it.fx, it.fz); });
      g.setAttribute('aFog', new THREE.InstancedBufferAttribute(fog, 1));
      g.userData.fogXZ = xz;
      const mesh = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((it, i) => { q.setFromEuler(e.set(0, it.rot, 0)); m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s, it.s, it.s)); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      L.group.add(mesh); L.fogMeshes.push(mesh); L.verts += base.attributes.position.count * list.length;
    }
  }
  buildCrops(ch, L) {
    const w = this.world, tiles = [];
    for (let z = ch.z0; z < ch.z1; z++) for (let x = ch.x0; x < ch.x1; x++) if (w.tiles[z * W + x] === T.FIELD) tiles.push([x, z]);
    if (!tiles.length) return;
    const g = this.cropGeo.clone();
    const fog = new Float32Array(tiles.length), xz = [];
    tiles.forEach(([x, z], i) => { fog[i] = this.fogAt(x + 0.5, z + 0.5); xz.push(x + 0.5, z + 0.5); });
    g.setAttribute('aFog', new THREE.InstancedBufferAttribute(fog, 1));
    g.userData.fogXZ = xz;
    L.crops = new THREE.InstancedMesh(g, this.cropMat, tiles.length);
    L.crops.castShadow = true; L.crops.matrixAutoUpdate = false;
    L.cropTiles = tiles;
    this.placeCrops(L);
    L.crops.computeBoundingSphere();
    L.group.add(L.crops); L.fogMeshes.push(L.crops);
  }

  disposeLevel(L) {
    if (!L) return;
    L.group.removeFromParent();
    L.group.traverse((o) => {
      if (!o.geometry) return;
      o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
  }

  // ---------- 地形が変わったとき ----------
  // tileIndexList：変わったマスの番号（z*W+x）。隣の区画の側面にもかかわるので、端のマスなら隣も作り直す
  rebuildTiles(tileIndexList) {
    const hit = new Set();
    for (const i of tileIndexList) {
      const x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx * 4, zz = z + dz * 4; // 粗い段階（4マスまとめ）の側面も考えて 4 マスぶん
        if (xx < 0 || zz < 0 || xx >= W || zz >= H) continue;
        hit.add(Math.floor(zz / CHUNK) * NCX + Math.floor(xx / CHUNK));
      }
    }
    for (const id of hit) this.chunks[id].dirty = true;
  }
  // 建物が建った・消えたとき（地面の種類が建物で変わるため）
  rebuildRect(x0, z0, x1, z1) {
    const list = [];
    for (let z = z0; z <= z1; z += 4) for (let x = x0; x <= x1; x += 4) list.push(z * W + x);
    list.push(z1 * W + x1);
    this.rebuildTiles(list);
  }

  // ---------- 毎フレーム ----------
  // camera：描画に使うカメラ。target：注視点（controls.target）。gl：WebGLRenderer（画面の大きさを知るため。なくてもよい）
  update(camera, target = null, gl = null) {
    this.frame++;
    camera.updateMatrixWorld();
    this._m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m4);
    // 1マスが画面で何ピクセルか（正射影カメラ）
    const hPx = gl ? gl.getDrawingBufferSize(this._v2 || (this._v2 = new THREE.Vector2())).y : 400;
    const viewH = (camera.top - camera.bottom) / (camera.zoom || 1);
    const px = hPx / Math.max(1e-3, viewH);
    const far = px < PX_L2 ? 2 : px < PX_L1 ? 1 : 0;
    const tx = target ? target.x : 0, tz = target ? target.z : 0;
    const vis = [];
    for (const ch of this.chunks) {
      if (!this._frustum.intersectsBox(ch.box)) { if (ch.shown >= 0) { ch.lv[ch.shown].group.visible = false; ch.shown = -1; } continue; }
      const c = ch.box.getCenter(this._tmp || (this._tmp = new THREE.Vector3()));
      ch.dist = Math.hypot(c.x - tx, c.z - tz);
      vis.push(ch);
    }
    vis.sort((a, b) => a.dist - b.dist);
    // 近い順に MAX_FULL 区画までを 1マスずつ、残りは粗く
    vis.forEach((ch, i) => { ch.want = Math.max(far, i < MAX_FULL ? 0 : 1); ch.seen = this.frame; });
    // 作る：まず穴をなくす（どの段階もない区画は、いちばん粗い段階をすぐ作る）
    const t0 = performance.now();
    for (const ch of vis) {
      if (ch.dirty) { for (let k = 0; k < 3; k++) if (ch.lv[k] && k !== ch.shown) { this.disposeLevel(ch.lv[k]); ch.lv[k] = null; } }
      if (!ch.lv.some(Boolean)) { ch.lv[2] = this.buildLevel(ch, 2); this.scene.add(ch.lv[2].group); ch.lv[2].group.visible = false; if (ch.dirty && ch.shown < 0) ch.dirty = false; }
    }
    // 次に、ほしい段階を近い順に、時間の許すかぎり作る（作り直しの区画を先に）
    const order = vis.slice().sort((a, b) => (b.dirty - a.dirty) || (a.dist - b.dist));
    for (const ch of order) {
      if (performance.now() - t0 > BUILD_MS && this.stats.built > 0) break;
      if (!ch.dirty && ch.lv[ch.want]) continue;
      const old = ch.lv[ch.want];
      const L = this.buildLevel(ch, ch.want);
      this.scene.add(L.group); L.group.visible = false;
      ch.lv[ch.want] = L;
      if (old) { if (ch.shown === ch.want) ch.shown = -1; this.disposeLevel(old); }
      if (ch.dirty) { for (let k = 0; k < 3; k++) if (k !== ch.want && ch.lv[k]) { if (ch.shown === k) ch.shown = -1; this.disposeLevel(ch.lv[k]); ch.lv[k] = null; } ch.dirty = false; }
    }
    // 見せる：ほしい段階があればそれ、なければ作ってある中でいちばん近い段階
    let verts = 0, full = 0;
    for (const ch of vis) {
      let show = ch.lv[ch.want] ? ch.want : [0, 1, 2].filter((k) => ch.lv[k]).sort((a, b) => Math.abs(a - ch.want) - Math.abs(b - ch.want))[0];
      if (ch.fogRev !== this.fogRev) this.applyFog(ch);
      if (show !== ch.shown) { if (ch.shown >= 0 && ch.lv[ch.shown]) ch.lv[ch.shown].group.visible = false; ch.lv[show].group.visible = true; ch.shown = show; }
      if (show === 0) full++;
      verts += ch.lv[show].verts;
    }
    this.stats.visible = vis.length; this.stats.full = full; this.stats.drawnVerts = verts; this.stats.built = this.chunks.filter((c) => c.lv.some(Boolean)).length;
    // 作り置きが多すぎたら、長く見ていない区画の細かい段階から捨てる
    if (this.frame % 60 === 0) this.evict();
  }
  evict() {
    let total = 0;
    for (const ch of this.chunks) for (const L of ch.lv) if (L) total += L.verts;
    this.stats.verts = total;
    if (total <= KEEP_VERTS) return;
    const cand = [];
    for (const ch of this.chunks) for (let k = 0; k < 2; k++) if (ch.lv[k] && ch.shown !== k) cand.push([ch.seen, ch, k]);
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, ch, k] of cand) {
      if (total <= KEEP_VERTS * 0.8) break;
      total -= ch.lv[k].verts; this.disposeLevel(ch.lv[k]); ch.lv[k] = null;
    }
    this.stats.verts = total;
  }

  // ---------- クリックしたマス ----------
  // ray：THREE.Ray（raycaster.ray）。地面の高さに沿って光線をたどり、最初に当たるマスを返す（{x,z} か null）
  raycastTile(ray) {
    const o = ray.origin, d = ray.direction;
    const yTop = topY(9) + 0.1, yBot = BOTTOM;
    if (d.y > -1e-6) return null;                      // 下を向いていない光線は地面に当たらない
    // 高い面から低い面までの区間だけを、マスの境目ごとにたどる（DDA）
    let t = Math.max(0, (yTop - o.y) / d.y);
    const tEnd = (yBot - o.y) / d.y;
    let gx = o.x + d.x * t + W / 2, gz = o.z + d.z * t + H / 2;
    let x = Math.floor(gx), z = Math.floor(gz);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const dtx = Math.abs(d.x) > 1e-9 ? Math.abs(1 / d.x) : Infinity, dtz = Math.abs(d.z) > 1e-9 ? Math.abs(1 / d.z) : Infinity;
    let ntx = t + (Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? x + 1 - gx : gx - x) * dtx) : Infinity);
    let ntz = t + (Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? z + 1 - gz : gz - z) * dtz) : Infinity);
    for (let k = 0; k < 4 * (W + H) && t <= tEnd; k++) {
      const tOut = Math.min(ntx, ntz, tEnd);
      if (x >= 0 && z >= 0 && x < W && z < H && o.y + d.y * tOut <= this.tileTop(z * W + x) + 1e-4) return { x, z };
      if (ntx < ntz) { t = ntx; ntx += dtx; x += sx; } else { t = ntz; ntz += dtz; z += sz; }
    }
    return null;
  }

  // 描画の数字（試験・画面の隅の表示用）
  info() { return { ...this.stats, chunks: this.chunks.length }; }

  dispose() {
    for (const ch of this.chunks) for (let k = 0; k < 3; k++) { this.disposeLevel(ch.lv[k]); ch.lv[k] = null; }
    this.atlas.dispose();
    for (const m of [this.groundMat, this.lavaMat, this.riverMat, this.cropMat, ...Object.values(this.treeMats)]) m.dispose();
    for (const g of Object.values(this.treeGeo)) g.dispose();
    this.cropGeo.dispose();
  }
}

// ---------------------------------------------------------------
// ミニマップ（ui.js の buildMinimap／redrawMinimapBase の代わりに使える）
// 地図の下絵を別の canvas に持ち、区画単位で描き直す。毎フレームは drawImage で貼るだけ（512 の世界でも軽い）。
// ---------------------------------------------------------------
export class MinimapBase {
  // col：ui.js の地形の色表。kingdomRGB：国ごとの [r,g,b]
  constructor(world, col, kingdomRGB) {
    this.world = world; this.col = col; this.kRGB = kingdomRGB;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
  }
  // explored：S.explored（なければ霧なし）。rect を渡すと、その四角だけ描き直す
  paint(explored = null, rect = null) {
    const w = this.world, d = this.img.data;
    const x0 = rect ? Math.max(0, rect.x0) : 0, z0 = rect ? Math.max(0, rect.z0) : 0, x1 = rect ? Math.min(W - 1, rect.x1) : W - 1, z1 = rect ? Math.min(H - 1, rect.z1) : H - 1;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * W + x, t = w.tiles[i];
      let [r, g, b] = this.col[t] || [0, 0, 0];
      const k = w.kingdomOf[i];
      if (k >= 0 && !(t === T.SEA || t === T.DEEP) && this.kRGB[k]) {
        const [kr, kg, kb] = this.kRGB[k];
        r = r * 0.82 + kr * 0.18; g = g * 0.82 + kg * 0.18; b = b * 0.82 + kb * 0.18;
      }
      if (explored && !explored[Math.floor(z / FOG_CELL) * FW + Math.floor(x / FOG_CELL)]) {
        // 未開拓：暗く、色を抜く
        const l = r * 0.299 + g * 0.587 + b * 0.114;
        r = r * 0.2 + (l * 0.42 + 14) * 0.8; g = g * 0.2 + (l * 0.42 + 17) * 0.8; b = b * 0.2 + (l * 0.42 + 24) * 0.8;
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0, x0, z0, x1 - x0 + 1, z1 - z0 + 1);
  }
  // 霧区画の番号（S.explored の添字）の一覧を描き直す
  paintFogCells(explored, cells) {
    for (const c of cells) { const fx = c % FW, fz = (c / FW) | 0; this.paint(explored, { x0: fx * FOG_CELL, z0: fz * FOG_CELL, x1: fx * FOG_CELL + FOG_CELL - 1, z1: fz * FOG_CELL + FOG_CELL - 1 }); }
  }
  // マス番号の一覧（道普請など）を描き直す
  paintTiles(explored, list) {
    for (const i of list) { const x = i % W, z = (i / W) | 0; this.paint(explored, { x0: x, z0: z, x1: x, z1: z }); }
  }
}
