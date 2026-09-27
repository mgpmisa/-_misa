// 3D描画：広大な大陸を見下ろすドット絵ボクセル世界（角度・ズーム自由、4方向歩行）
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { W, H, T } from './world.js';
import { buildTextures, personTexture, TEX } from './textures.js';
import { SPECIES, KINGDOMS } from './data.js';
import * as SPR from './sprites.js';
import { TerrainChunks } from './terrain_chunks.js';
import { drawPersonAnim, personAnimState, animFrameAt as pFrameAt, animDuration } from './anim_people.js';
import { PartyRings } from './partyring.js';
import * as TH from './tribehome.js'; // 奥地の民族の家と里
import * as BN from './bldnew.js'; // 宿屋・浴場・図書館など町の暮らしの建物
import * as BG from './bldgfx.js'; // 建物の看板・種類ごとの形・煙（グラフィック部）
import * as LG from './leisuregfx.js'; // 歓楽の館の外観（大人向けの設定のときだけ。まとめ描きには入れない）
import { ConstructGfx } from './constructgfx.js'; // 普請場（縄張り・土台・骨組み・足場・資材の山・荷運び）（開発部）
import { actGfxFrame } from './actgfx.js'; // 畝・切り株と薪・干し物・焚き火・浮き・露店の台など（グラフィック部）
import { convoyViews } from './logistics.js';
import { mintViews } from './mintflow.js';   // 鉱石の荷車・硬貨の箱の手押し車
import { mintCartMesh } from './mintgfx.js';
import { ShadowPool, CrowdDots, dotColor } from './crowd.js';
import { formationPos, formationFace } from './formation.js'; // パーティの隊列（見た目の位置だけ。開発部）
import { spacingBegin, spacedPos, spacingFace, spacingSlideCorpse } from './spacing.js'; // 立ち止まった者どうしが重ならない立ち位置（技術部）
import { drawCreatureAnim, creatureAnimState, animFrameAt as cFrameAt, peekCreatureAnim } from './anim_creatures.js';

const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;
export const topY = (h) => 0.3 + h * 0.4;
const SEA_Y = 0.12;
const NORTH = H * 0.62;
const hsh = (x, z, s = 0) => { let h = (x * 73856093) ^ (z * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class Renderer {
  constructor(canvas, sim) {
    this.sim = sim;
    this.canvas = canvas;
    this.pixel = window.innerWidth < 700 ? 2 : 2;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.shadowMap.enabled = window.innerWidth >= 700;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd0ff');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -300, 600);
    this.controls = new OrbitControls(this.camera, canvas);
    Object.assign(this.controls, { enableDamping: true, dampingFactor: 0.12, minZoom: 0.12 * 160 / W, maxZoom: 8, minPolarAngle: 0.1, maxPolarAngle: 1.35, screenSpacePanning: false });
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('start', () => { this.userMoved = performance.now(); });

    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5d7a3a', 1.2);
    this.sun = new THREE.DirectionalLight('#fff2d6', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    buildTextures();
    this.mats = this.makeMaterials();
    this.ents = new Map();
    this.shadows = new ShadowPool(this.scene);   // 足元の影は全員まとめて1回で描く（crowd.js）
    this.dots = new CrowdDots(this.scene);        // 大きく引いたときの人と生き物の点（crowd.js）
    this.terrainMeshes = [];
    this.buildTerrain();
    this.buildStructures();
    this.buildBuildings();
    TH.tribalExtras(this, wx, wz, topY); // 民族の里の柵・焚き火・守り柱
    this.buildMills();
    this.cgfx = new ConstructGfx(this, { wx, wz, topY, SEA_Y });
    this.buildWeather();
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 16), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9, depthWrite: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.partyRings = new PartyRings(this.scene); // パーティの輪（まとめて1回で描く）
    this.raycaster = new THREE.Raycaster();
    this.lastSeason = -1;
    const cap = sim.S.world.settlements[0];
    this.lookAt(cap.x, cap.z, 2.2);
    this.resize();
  }

  // ---------- 材質 ----------
  makeMaterials() {
    const L = (o) => new THREE.MeshLambertMaterial(o);
    const m = {
      timber: L({ map: TEX.timber }), timber2: L({ map: TEX.timber2 }), stone: L({ map: TEX.stone }), sandstone: L({ map: TEX.sandstone }), adobe: L({ map: TEX.adobe }),
      darkBrick: L({ map: TEX.darkBrick }), darkStone: L({ map: TEX.darkStone }), planks: L({ map: TEX.planks }), wood: L({ map: TEX.wood }),
      thatch: L({ map: TEX.thatch, side: THREE.DoubleSide }), tileRoof: L({ map: TEX.tileRoof, side: THREE.DoubleSide }), slate: L({ map: TEX.slate, side: THREE.DoubleSide }), greyRoof: L({ map: TEX.greyRoof, side: THREE.DoubleSide }),
      tileRoofS: L({ map: TEX.tileRoof, side: THREE.DoubleSide }), flatRoof: L({ map: TEX.flatRoof }), demonRoof: L({ map: TEX.demonRoof, side: THREE.DoubleSide }),
      win: L({ color: '#3a2f28', emissive: '#ffcf6a', emissiveIntensity: 0 }), redGlow: L({ color: '#3a0a10', emissive: '#ff2a3a', emissiveIntensity: 1.2 }),
      door: L({ color: '#4a2c18' }), black: L({ color: '#141014' }), gold: L({ color: '#e0b84a' }), cloth: L({ map: TEX.cloth, side: THREE.DoubleSide }),
      awning: L({ map: TEX.awning }), awning2: L({ map: TEX.awning2 }), white: L({ color: '#f2f0ea' }), red: L({ color: '#c93a32' }), fire: L({ color: '#ff9a2a', emissive: '#ff7a1a', emissiveIntensity: 1.5 }),
      lamp: L({ color: '#40362c', emissive: '#ffd27a', emissiveIntensity: 0 }), crystal: L({ color: '#8a1a3a', emissive: '#ff3a5a', emissiveIntensity: 0.6 }),
      sail: L({ color: '#f0ead8', side: THREE.DoubleSide }), hull: L({ color: '#6b4226' }), dome: L({ color: '#b8c0c8' }), purple: L({ map: TEX.slate, color: '#b070e0', side: THREE.DoubleSide }),
    };
    for (const k of KINGDOMS) m['banner' + k.color] = L({ color: k.color, side: THREE.DoubleSide });
    this.nightMats = [m.win, m.lamp];
    this.snowable = [m.thatch, m.tileRoof, m.slate, m.greyRoof];
    for (const x of this.snowable) x.userData.base = x.map;
    return m;
  }

  setPixel(n) { this.pixel = n; this.resize(); }
  setShadows(on) { this.shadowsOn = on; this.renderer.shadowMap.enabled = on; this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(1, Math.floor(w / this.pixel)), Math.max(1, Math.floor(h / this.pixel)), false);
    const aspect = w / h, s = 14;
    Object.assign(this.camera, { left: -s * aspect, right: s * aspect, top: s, bottom: -s });
    this.camera.updateProjectionMatrix();
  }

  // ---------- 地形 ----------
  groundKey(t, x, z) {
    const n = z < NORTH;
    switch (t) {
      case T.BLD: {
        const b = this.sim.S.world.buildings[this.sim.S.world.bldAt[z * W + x]];
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
  buildTerrain() {
    const w = this.sim.S.world;
    // 地面・木・畑の作物・川は区画ごとに描く（terrain_chunks.js）
    this.chunks = new TerrainChunks(this.scene, w, TEX, { groundKey: (t, x, z) => this.groundKey(t, x, z), crystalMat: this.mats.crystal, getExplored: () => this.sim.S.explored });
    this.treeMats = this.chunks.treeMats;
    // 海
    this.waterTex = TEX.water.clone(); this.waterTex.needsUpdate = true;
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping; this.waterTex.repeat.set(W / 2, H / 2);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, H + 80), new THREE.MeshLambertMaterial({ map: this.waterTex, transparent: true, opacity: 0.86 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = SEA_Y; sea.receiveShadow = true;
    this.scene.add(sea);
  }

  applySeason(si) {
    this.chunks.applySeason(si);
    for (const mt of this.snowable) { mt.map = si === 3 ? TEX.snowRoof : mt.userData.base; mt.needsUpdate = true; }
  }

  // ---------- 木・岩 ----------
  buildTrees() {
    const S = this.sim.S, w = S.world;
    const inTown = (x, z) => w.settlements.some((s) => Math.abs(s.x - x) <= s.r + 1 && Math.abs(s.z - z) <= s.r + 1);
    const L = (o) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
    const tm = this.treeMats = {
      trunk: L({ color: '#6b4226' }), pine: L({ color: '#2f6b3a' }), pine2: L({ color: '#3d8247' }), round: L({ color: '#4d9a3c' }), jungle: L({ color: '#2f7a2a' }),
      palm: L({ color: '#4f9a2a' }), cactus: L({ color: '#4f8a3a' }), acacia: L({ color: '#7a8a2a' }), dead: L({ color: '#3a2a26' }), boulder: L({ color: '#8a8580' }), crystal: this.mats.crystal,
      snowPine: L({ color: '#e8f0f0' }),
    };
    const parts = {};
    this.treeAt = {};   // マスごとの木（開拓や道普請で切ったら消す）
    const put = (name, geo, mat) => { parts[name] = parts[name] || { geo, mat, list: [] }; return parts[name].list; };
    const G = {
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
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = w.tiles[z * W + x];
      const r = hsh(x, z, 7), r2 = hsh(x, z, 8);
      const y = topY(w.hgt[z * W + x]);
      const item = { x: wx(x) + (r2 - 0.5) * 0.3, y, z: wz(z) + (r - 0.5) * 0.3, s: 0.8 + r2 * 0.45, rot: r * 6.28, ti: z * W + x };
      if (inTown(x, z) && t !== T.FOREST && t !== T.DENSE) continue;
      switch (t) {
        case T.FOREST:
          if (r < 0.75) { if (r2 < 0.5) { put('trunk', G.trunk, tm.trunk).push(item); put('round', G.round, tm.round).push(item); } else { put('trunk', G.trunk, tm.trunk).push(item); put('pine1', G.pine1, tm.pine).push(item); put('pine2', G.pine2, tm.pine2).push(item); } }
          break;
        case T.DENSE:
          if (r < 0.9) { put('trunk', G.trunk, tm.trunk).push(item); put('pine1', G.pine1, tm.pine).push(item); put('pine2', G.pine2, tm.pine2).push(item); }
          break;
        case T.SNOW:
          if (r < 0.12) { put('trunk', G.trunk, tm.trunk).push(item); put('snowPine', G.pine1, tm.snowPine).push(item); put('pine2', G.pine2, tm.pine2).push(item); }
          break;
        case T.JUNGLE:
          if (r < 0.8) {
            if (r2 < 0.7) { put('tallTrunk', G.tallTrunk, tm.trunk).push(item); put('jungle', G.jungle, tm.jungle).push(item); }
            else { put('tallTrunk', G.tallTrunk, tm.trunk).push(item); put('palm', G.palm, tm.palm).push(item); }
          }
          break;
        case T.GRASS: if (r < 0.03) { put('trunk', G.trunk, tm.trunk).push(item); put('round', G.round, tm.round).push(item); } break;
        case T.SAVANNA: if (r < 0.05) { put('tallTrunk', G.tallTrunk, tm.trunk).push({ ...item, s: item.s * 0.8 }); put('acacia', G.acacia, tm.acacia).push({ ...item, s: item.s * 0.8 }); } break;
        case T.DESERT: if (r < 0.04) { put('cactus', G.cactus, tm.cactus).push(item); put('cactusArm', G.cactusArm, tm.cactus).push(item); } else if (r < 0.06) put('boulder', G.boulder, tm.boulder).push(item); break;
        case T.BEACH: if (z > H * 0.5 && r < 0.08) { put('tallTrunk', G.tallTrunk, tm.trunk).push(item); put('palm', G.palm, tm.palm).push(item); } break;
        case T.ROCK: case T.PEAK: if (r < 0.22) put('boulder', G.boulder, tm.boulder).push({ ...item, s: item.s * 1.3 }); break;
        case T.SWAMP: if (r < 0.2) { put('dead', G.dead, tm.dead).push(item); put('deadBranch', G.deadBranch, tm.dead).push(item); } break;
        case T.WASTE: if (r < 0.08) { put('dead', G.dead, tm.dead).push(item); put('deadBranch', G.deadBranch, tm.dead).push(item); } else if (r < 0.13) put('crystal', G.crystal, tm.crystal).push(item); break;
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const p of Object.values(parts)) {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, p.list.length);
      p.list.forEach((it, i) => { q.setFromEuler(e.set(0, it.rot, 0)); m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.s, it.s, it.s)); mesh.setMatrixAt(i, m4); (this.treeAt[it.ti] = this.treeAt[it.ti] || []).push([mesh, i]); });
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  // ---------- 柵・城壁・桟橋・街灯・船 ----------
  buildStructures() {
    const w = this.sim.S.world, M = this.mats;
    const m4 = new THREE.Matrix4();
    const fences = [], walls = [], docks = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = w.tiles[z * W + x];
      if (t === T.FENCE) fences.push([x, z]); else if (t === T.WALL) walls.push([x, z]); else if (t === T.DOCK) docks.push([x, z]);
    }
    const fset = new Set(fences.map(([x, z]) => x + ',' + z));
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.45, 0.1).translate(0, 0.22, 0), M.wood, Math.max(1, fences.length));
    const rails = [];
    fences.forEach(([x, z], i) => {
      const y = topY(w.hgt[z * W + x]);
      post.setMatrixAt(i, m4.makeTranslation(wx(x), y, wz(z)));
      if (fset.has(x + 1 + ',' + z)) rails.push([wx(x) + 0.5, y, wz(z), 0]);
      if (fset.has(x + ',' + (z + 1))) rails.push([wx(x), y, wz(z) + 0.5, 1]);
    });
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.05), M.wood, Math.max(1, rails.length * 2));
    rails.forEach(([x, y, z, r], i) => { for (let k = 0; k < 2; k++) { m4.makeRotationY(r ? Math.PI / 2 : 0).setPosition(x, y + 0.16 + k * 0.17, z); rail.setMatrixAt(i * 2 + k, m4); } });
    post.castShadow = rail.castShadow = true;
    this.scene.add(post, rail);
    // 城壁
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.4, 1).translate(0, 0.7, 0), M.stone, Math.max(1, walls.length));
    const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.3, 0.35).translate(0, 1.55, 0), M.stone, Math.max(1, walls.length));
    walls.forEach(([x, z], i) => { const y = topY(w.hgt[z * W + x]); wall.setMatrixAt(i, m4.makeTranslation(wx(x), y, wz(z))); cren.setMatrixAt(i, m4.makeTranslation(wx(x) + ((x + z) % 2 ? 0.25 : -0.25), y, wz(z))); });
    wall.castShadow = cren.castShadow = true; wall.receiveShadow = true;
    this.scene.add(wall, cren);
    // 城門（王都の城壁の切れ目）
    const gateGeos = new Map();
    const gpush = (mat, g) => { if (!gateGeos.has(mat)) gateGeos.set(mat, []); gateGeos.get(mat).push(g); };
    for (const s of w.settlements) {
      if (s.type !== 'capital' || !s.gates) continue;
      for (const g of s.gates) {
        const y = topY(w.hgt[g.z * W + g.x]);
        const side = g.dx !== 0 ? [0, 1] : [1, 0];
        for (const k of [-1, 1]) {
          const t = new THREE.CylinderGeometry(0.55, 0.6, 2.4, 8).toNonIndexed(); t.translate(wx(g.x) + side[0] * k * 1.1, y + 1.2, wz(g.z) + side[1] * k * 1.1); gpush(M.stone, t);
          const c = new THREE.ConeGeometry(0.75, 0.9, 8).toNonIndexed(); c.translate(wx(g.x) + side[0] * k * 1.1, y + 2.85, wz(g.z) + side[1] * k * 1.1); gpush(M.slate, c);
        }
        const arch = this.box(side[0] ? 2.8 : 0.9, 0.6, side[1] ? 2.8 : 0.9); arch.translate(wx(g.x), y + 1.9, wz(g.z)); gpush(M.stone, arch);
      }
    }
    // 村と港の門：丸太の門柱と横木（町の入口の目印）
    for (const s of w.settlements) {
      if (s.type === 'capital' || !s.gates) continue;
      for (const g of s.gates) {
        const y = topY(w.hgt[g.z * W + g.x]);
        const side = g.dx !== 0 ? [0, 1] : [1, 0];
        for (const k of [-1, 1]) { const t = this.box(0.16, 1.5, 0.16); t.translate(wx(g.x) + side[0] * k * 0.62, y + 0.75, wz(g.z) + side[1] * k * 0.62); gpush(M.wood, t); }
        const bar = this.box(side[0] ? 1.6 : 0.14, 0.14, side[1] ? 1.6 : 0.14); bar.translate(wx(g.x), y + 1.42, wz(g.z)); gpush(M.wood, bar);
        const sign = this.box(side[0] ? 0.6 : 0.06, 0.26, side[1] ? 0.6 : 0.06); sign.translate(wx(g.x), y + 1.2, wz(g.z)); gpush(M.planks, sign);
      }
    }
    for (const [mat, geos] of gateGeos) { const m = new THREE.Mesh(mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; })), mat); m.castShadow = true; this.scene.add(m); }
    // 橋：川の上に板を渡し、両脇に欄干
    //   橋は1つの InstancedMesh にまとめて描く。あとから架かった橋も同じ入れ物に足すので、
    //   three.js の「見えない物は描かない」判定（最初に計った外枠の球）が古いままだと、見る角度によって橋が消えてしまう。
    //   そこで frustumCulled を切り、作り直すたびに外枠も計り直す（rebuildBridges）
    this.bridgeTiles = new Set();
    for (let i = 0; i < W * H; i++) if (w.tiles[i] === T.BRIDGE) this.bridgeTiles.add(i);
    this.rebuildBridges();
    // 桟橋
    const dock = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.12, 0.9), M.planks, Math.max(1, docks.length));
    docks.forEach(([x, z], i) => dock.setMatrixAt(i, m4.makeTranslation(wx(x), SEA_Y + 0.12, wz(z))));
    dock.receiveShadow = true;
    this.scene.add(dock);
    // 船
    this.boats = [];
    for (const s of w.settlements) {
      if (!s.dockEnd) continue;
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.6), M.hull); hull.position.y = 0.1;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), M.wood); mast.position.y = 0.9;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), M.sail); sail.position.set(0.05, 1.0, 0); sail.rotation.y = Math.PI / 2;
      g.add(hull, mast, sail);
      for (const o of g.children) o.castShadow = true;
      g.position.set(wx(s.dockEnd.x) + 1, SEA_Y, wz(s.dockEnd.z) + 1);
      g.userData.sid = s.id;
      this.scene.add(g); this.boats.push(g);
    }
    // 街灯（町の広場の四隅）
    const lamps = [];
    for (const s of w.settlements) for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const x = s.x + dx, z = s.z + dz, t = w.tiles[z * W + x];
      if (t === T.GRASS || t === T.SAVANNA || t === T.ROAD || t === T.PLAZA) lamps.push([x, z]);
    }
    const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(0, 0.55, 0), M.black, Math.max(1, lamps.length));
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22).translate(0, 1.2, 0), M.lamp, Math.max(1, lamps.length));
    lamps.forEach(([x, z], i) => { const y = topY(w.hgt[z * W + x]); pole.setMatrixAt(i, m4.makeTranslation(wx(x) + 0.3, y, wz(z) + 0.3)); head.setMatrixAt(i, m4.makeTranslation(wx(x) + 0.3, y, wz(z) + 0.3)); });
    this.scene.add(pole, head);
  }

  // 橋を描き直す（生成時と、道普請・橋の手直しで橋のマスが変わったとき）
  //  ・板の向き：橋が続く向き（なければ両岸の道の向き、なければ川を横切る向き）
  //  ・板の高さ：つながった橋ごとに、両岸のうち高い方の地面にそろえる（長い橋の中ほどで段がつかないように）
  //  ・欄干：両脇。となりも橋（幅2の橋）なら、その側には付けない
  rebuildBridges() {
    const w = this.sim.S.world, m4 = new THREE.Matrix4(), M = this.mats;
    const list = [...this.bridgeTiles];
    const need = Math.max(64, list.length);
    if (!this.bridgeDeck || this.bridgeCap < need) {
      if (this.bridgeDeck) { this.scene.remove(this.bridgeDeck, this.bridgeRail); this.bridgeDeck.dispose(); this.bridgeRail.dispose(); }
      this.bridgeCap = Math.ceil(need * 1.5);
      this.bridgeDeck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), M.planks, this.bridgeCap);
      this.bridgeRail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.08), M.wood, this.bridgeCap * 2);
      this.bridgeDeck.castShadow = this.bridgeRail.castShadow = true; this.bridgeDeck.receiveShadow = true;
      this.bridgeDeck.frustumCulled = this.bridgeRail.frustumCulled = false;
      this.scene.add(this.bridgeDeck, this.bridgeRail);
    }
    const t = (a, b) => (a < 0 || b < 0 || a >= W || b >= H ? T.DEEP : w.tiles[b * W + a]);
    const isB = (a, b) => t(a, b) === T.BRIDGE;
    const road = (q) => q === T.ROAD || q === T.PLAZA || q === T.DOCK;
    const land = (q) => q !== T.RIVER && q !== T.SEA && q !== T.DEEP && q !== T.BRIDGE;
    // つながった橋ごとの板の高さ
    const deckH = new Map();
    for (const i0 of list) {
      if (deckH.has(i0)) continue;
      const comp = [i0], seen = new Set([i0]);
      let h = -1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % W, z = (i / W) | 0;
        for (const [a, b] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
          const q = t(a, b), j = b * W + a;
          if (q === T.BRIDGE) { if (!seen.has(j)) { seen.add(j); comp.push(j); } } else if (land(q) && q !== T.DEEP) h = Math.max(h, w.hgt[j]);
        }
      }
      if (h < 0) h = Math.max(...comp.map((i) => w.hgt[i])) + 1;
      for (const i of comp) deckH.set(i, h);
    }
    let nd = 0, nr = 0;
    for (const i of list) {
      const x = i % W, z = (i / W) | 0;
      const bx = isB(x - 1, z) || isB(x + 1, z), bz = isB(x, z - 1) || isB(x, z + 1);
      let alongX;
      if (bx !== bz) alongX = bx;
      else {
        const rx = road(t(x - 1, z)) || road(t(x + 1, z)), rz = road(t(x, z - 1)) || road(t(x, z + 1));
        if (rx !== rz) alongX = rx;
        else { const wx2 = !land(t(x - 1, z)) && !land(t(x + 1, z)); alongX = !wx2; }   // 左右が水なら、川は東西に流れている → 橋は南北
      }
      const y = topY(deckH.get(i)) - 0.05;
      this.bridgeDeck.setMatrixAt(nd++, m4.makeTranslation(wx(x), y, wz(z)));
      for (const k of [-1, 1]) {
        if (alongX ? isB(x, z + k) : isB(x + k, z)) continue;
        if (alongX) m4.makeTranslation(wx(x), y + 0.16, wz(z) + k * 0.46); else m4.makeRotationY(Math.PI / 2).setPosition(wx(x) + k * 0.46, y + 0.16, wz(z));
        this.bridgeRail.setMatrixAt(nr++, m4);
      }
    }
    this.bridgeDeck.count = nd; this.bridgeRail.count = nr;
    this.bridgeDeck.instanceMatrix.needsUpdate = true; this.bridgeRail.instanceMatrix.needsUpdate = true;
    this.bridgeDeck.computeBoundingSphere(); this.bridgeRail.computeBoundingSphere();
  }
  // 地形のマスが変わったとき（道普請・開拓・野火のあとなど）に、上から新しい地面を重ねて描き直す
  refreshTiles(list) {
    const w = this.sim.S.world, B = this.bridgeTiles;
    let dirty = false;
    for (const i of list) {
      const isB = w.tiles[i] === T.BRIDGE;
      if (isB !== B.has(i)) { if (isB) B.add(i); else B.delete(i); dirty = true; }
      // となりが橋なら、板の向き・欄干・高さが変わるかもしれない
      else if (!dirty && (B.has(i - 1) || B.has(i + 1) || B.has(i - W) || B.has(i + W))) dirty = true;
    }
    if (dirty) this.rebuildBridges();
    this.chunks.rebuildTiles(list);
  }

  // ---------- 建物 ----------
  prism(L, D, Hr) {
    const hl = L / 2, hd = D / 2;
    const v = [-hl, 0, hd, hl, 0, hd, hl, Hr, 0, -hl, 0, hd, hl, Hr, 0, -hl, Hr, 0, hl, 0, -hd, -hl, 0, -hd, -hl, Hr, 0, hl, 0, -hd, -hl, Hr, 0, hl, Hr, 0, hl, 0, hd, hl, 0, -hd, hl, Hr, 0, -hl, 0, -hd, -hl, 0, hd, -hl, Hr, 0];
    const sl = Math.hypot(hd, Hr);
    const uv = [0, 0, L, 0, L, sl, 0, 0, L, sl, 0, sl, 0, 0, L, 0, L, sl, 0, 0, L, sl, 0, sl, 0, 0, D, 0, D / 2, Hr, 0, 0, D, 0, D / 2, Hr];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  box(w, h, d) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) { const i = f * 6 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return g;
  }
  cyl(rt, rb, h, seg = 8) { const g = new THREE.CylinderGeometry(rt, rb, h, seg).toNonIndexed(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rb * 4, uv.getY(i) * h); return g; }
  cone(r, h, seg = 8) { const g = new THREE.ConeGeometry(r, h, seg).toNonIndexed(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 4, uv.getY(i) * h); return g; }

  buildingParts(b) {
    const M = this.mats, parts = [];
    if (LG.skipBuilding(b)) return parts; // 歓楽の館と取り壊した跡（js/leisuregfx.js が別に描く）
    const add = (geo, mat, x, y, z, ry = 0) => { const g = geo.index ? geo.toNonIndexed() : geo; g.rotateY(ry); g.translate(x, y, z); if (!g.attributes.uv) return; parts.push({ g, mat }); };
    const south = b.kingdom === 2;
    const face = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
    const W_ = b.w - 0.25, D_ = b.d - 0.25;
    const door = (w, d, h = 0.62) => add(this.box(face[0] ? 0.08 : 0.42, h, face[1] ? 0.08 : 0.42), M.door, face[0] * w / 2 + (face[0] ? 0.02 * face[0] : 0), h / 2, face[1] * d / 2 + (face[1] ? 0.02 * face[1] : 0));
    const windows = (w, d, y, mat = M.win) => {
      for (const s of [-1, 1]) {
        const n = Math.max(1, Math.floor(w));
        for (let i = 0; i < n; i++) add(this.box(0.22, 0.22, 0.05), mat, -w / 2 + (i + 0.5) * (w / n), y, s * (d / 2 + 0.01));
        add(this.box(0.05, 0.22, 0.22), mat, s * (w / 2 + 0.01), y, 0);
      }
    };
    const gable = (w, d, wh, mat) => {
      const along = w >= d;
      const g = this.prism(along ? w + 0.35 : d + 0.35, along ? d + 0.4 : w + 0.4, Math.min(1.1, 0.55 + Math.min(w, d) * 0.22));
      add(g, mat, 0, wh, 0, along ? 0 : Math.PI / 2);
    };
    const flat = (w, d, wh) => { add(this.box(w + 0.1, 0.12, d + 0.1), M.flatRoof, 0, wh + 0.06, 0); for (const [x, z] of [[-w / 2, 0], [w / 2, 0]]) add(this.box(0.1, 0.2, d), M.adobe, x, wh + 0.2, z); };
    const houseLike = (wh, wall, roof) => {
      add(this.box(W_, wh, D_), south ? M.adobe : wall, 0, wh / 2, 0);
      if (south && b.roof !== 'tile') flat(W_, D_, wh); else gable(W_, D_, wh, south ? M.tileRoofS : roof);
      if (!south) add(this.box(0.28, 0.7, 0.28), M.darkStone, W_ * 0.25, wh + 0.6, D_ * 0.18);
      windows(W_, D_, wh * 0.6);
      door(W_, D_);
    };
    const banner = (x, z, y, color) => { add(this.box(0.06, 1.4, 0.06), M.wood, x, y + 0.7, z); add(new THREE.PlaneGeometry(0.5, 0.35), this.mats['banner' + color] || M.red, x + 0.28, y + 1.2, z); };
    const kcol = KINGDOMS[b.kingdom]?.color || '#c93a32';
    if (b.tribe && b.style && TH.tribalParts(this, b, add, M, W_, D_, face, door)) return parts; // 民族の家（js/tribehome.js）
    if (BG.styledParts(this, b, { add, M, W_, D_, face, south, kcol, door, windows, gable, flat, banner })) return parts; // 看板と種類ごとの形（js/bldgfx.js）
    if (BN.NEW_TYPES.has(b.type)) { BN.newBldParts(this, b, add, M, W_, D_, face, door, { houseLike, gable, windows, banner, flat, south, kcol }); return parts; } // 町の暮らしの建物（js/bldnew.js）
    switch (b.type) {
      case 'house': houseLike(1.15, M.timber, b.roof === 'tile' ? M.tileRoof : M.thatch); break;
      case 'bakery': houseLike(1.2, M.timber, M.thatch); break;
      case 'workshop': houseLike(1.2, M.timber2, M.thatch); break;
      case 'smithy': houseLike(1.15, M.timber2, M.greyRoof); add(this.box(0.35, 0.3, 0.2), M.black, face[0] * (W_ / 2 + 0.45), 0.15, face[1] * (D_ / 2 + 0.45)); break;
      case 'tavern': houseLike(1.5, M.timber, M.tileRoof); add(this.box(0.4, 0.28, 0.05), M.gold, face[0] * (W_ / 2 + 0.15) + (face[0] ? 0 : 0.6), 1.05, face[1] * (D_ / 2 + 0.15) + (face[1] ? 0 : 0.6)); break;
      case 'guild': houseLike(1.4, M.timber2, M.slate); banner(W_ / 2 - 0.2, D_ / 2 - 0.2, 1.4, kcol); break;
      case 'mansion': houseLike(2.1, M.timber2, M.slate); windows(W_, D_, 0.6); add(this.box(0.28, 0.8, 0.28), M.darkStone, -W_ * 0.3, 2.9, 0); break;
      case 'barracks':
        add(this.box(W_, 1.3, D_), south ? M.sandstone : M.stone, 0, 0.65, 0);
        for (let i = 0; i < Math.floor(W_); i++) add(this.box(0.3, 0.25, 0.3), south ? M.sandstone : M.stone, -W_ / 2 + 0.3 + i, 1.42, D_ / 2 - 0.15);
        windows(W_, D_, 0.8); door(W_, D_); banner(0, 0, 1.3, kcol);
        break;
      case 'prison':
        add(this.box(W_, 1.5, D_), M.darkStone, 0, 0.75, 0); windows(W_, D_, 1.0, M.black); door(W_, D_, 0.8);
        add(this.box(W_ + 0.1, 0.1, D_ + 0.1), M.darkStone, 0, 1.55, 0);
        break;
      case 'church': {
        const wall = south ? M.sandstone : M.stone;
        add(this.box(W_, 1.6, D_), wall, 0, 0.8, 0);
        gable(W_, D_, 1.6, south ? M.tileRoofS : M.greyRoof);
        add(this.box(0.8, 1.6, 0.8), wall, 0, 2.4, 0);
        add(this.cone(0.62, 1.4, 4), south ? M.tileRoofS : M.greyRoof, 0, 3.9, 0, Math.PI / 4);
        add(this.box(0.08, 0.5, 0.08), M.gold, 0, 4.8, 0); add(this.box(0.3, 0.08, 0.08), M.gold, 0, 4.75, 0);
        windows(W_, D_, 1.0); door(W_, D_, 0.8);
        break;
      }
      case 'magictower':
        add(this.cyl(0.9, 1.1, 4.2, 8), b.kingdom === 1 ? M.stone : M.sandstone, 0, 2.1, 0);
        add(this.cone(1.3, 2.2, 8), M.purple, 0, 5.3, 0);
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; add(this.box(0.2, 0.34, 0.05), M.win, Math.sin(a) * 1.0, 3.1, Math.cos(a) * 1.0, a); }
        door(1.8, 1.8, 0.7);
        break;
      case 'market': {
        for (let i = 0; i < Math.floor(W_ / 1.3); i++) {
          const x = -W_ / 2 + 0.6 + i * 1.3;
          add(this.box(1.0, 0.5, 0.6), M.planks, x, 0.25, 0.1);
          add(this.box(1.15, 0.05, 0.9), i % 2 ? M.awning2 : M.awning, x, 1.15, 0);
          for (const px of [-0.5, 0.5]) add(this.box(0.06, 1.2, 0.06), M.wood, x + px, 0.6, -0.35);
          add(this.box(0.18, 0.12, 0.18), M.gold, x - 0.25, 0.56, 0.1); add(this.box(0.18, 0.12, 0.18), M.red, x, 0.56, 0.1);
        }
        break;
      }
      case 'well':
        add(this.cyl(0.42, 0.45, 0.45, 8), M.darkStone, 0, 0.22, 0);
        for (const s of [-1, 1]) add(this.box(0.07, 0.9, 0.07), M.wood, s * 0.38, 0.7, 0);
        add(this.prism(1.0, 0.9, 0.35), M.thatch, 0, 1.1, 0);
        break;
      case 'castle': {
        const wall = south ? M.sandstone : M.stone;
        const roof = this.mats['banner' + kcol] ? new THREE.MeshLambertMaterial({ map: TEX.slate, color: kcol, side: THREE.DoubleSide }) : M.slate;
        const hw = b.w / 2 - 0.3, hd = b.d / 2 - 0.3;
        // 外壁
        add(this.box(b.w - 0.6, 1.5, 0.4), wall, 0, 0.75, -hd); add(this.box(b.w - 0.6, 1.5, 0.4), wall, -0.0, 0.75, hd);
        add(this.box(0.4, 1.5, b.d - 0.6), wall, -hw, 0.75, 0); add(this.box(0.4, 1.5, b.d - 0.6), wall, hw, 0.75, 0);
        for (let i = -hw; i <= hw; i += 0.7) { add(this.box(0.3, 0.3, 0.45), wall, i, 1.65, -hd); add(this.box(0.3, 0.3, 0.45), wall, i, 1.65, hd); }
        add(this.box(1.1, 1.0, 0.45), M.black, 0, 0.5, hd + 0.02);
        // 四隅の塔
        for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) { add(this.cyl(0.7, 0.8, 3.0, 8), wall, x, 1.5, z); add(this.cone(0.95, 1.6, 8), roof, x, 3.8, z); }
        // 天守
        add(this.box(4, 3.4, 2.6), wall, 0, 1.7, -0.6);
        const g = this.prism(4.4, 3.0, 1.5); add(g, roof, 0, 3.4, -0.6);
        add(this.cyl(0.8, 0.9, 5.2, 8), wall, 1.2, 2.6, -1.2); add(this.cone(1.1, 2.2, 8), roof, 1.2, 6.3, -1.2);
        for (let i = 0; i < 3; i++) add(this.box(0.25, 0.4, 0.05), M.win, -1.2 + i * 1.2, 2.4, 0.72);
        banner(1.2, -1.2, 7.3, kcol); banner(-hw, hd, 4.4, kcol); banner(hw, hd, 4.4, kcol);
        this.parts_castle = this.parts_castle || [];
        break;
      }
      case 'demoncastle': {
        add(this.box(6, 3.2, 5.5), M.darkBrick, 0, 1.6, -0.3);
        add(this.prism(6.4, 5.8, 2), M.demonRoof, 0, 3.2, -0.3);
        for (const [x, z] of [[-3, -3], [3, -3], [-3, 2.8], [3, 2.8]]) { add(this.cyl(0.7, 0.9, 4.5, 6), M.darkBrick, x, 2.25, z); add(this.cone(0.9, 3.2, 6), M.demonRoof, x, 6.1, z); }
        add(this.cyl(1.1, 1.3, 7.5, 6), M.darkBrick, 0, 3.75, -1.2); add(this.cone(1.5, 4.5, 6), M.demonRoof, 0, 9.7, -1.2);
        for (let i = 0; i < 5; i++) add(this.box(0.3, 0.5, 0.05), M.redGlow, -2 + i, 2.2, 2.46);
        add(this.box(1.4, 1.8, 0.1), M.black, 0, 0.9, 2.5);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(this.cone(0.18, 1.4, 4), M.black, Math.cos(a) * 3.6, 0.7, Math.sin(a) * 3.4); }
        break;
      }
      case 'pyramid':
        for (let i = 0; i < 6; i++) { const s = b.w - 0.2 - i * 1.15; add(this.box(s, 0.7, s), M.sandstone, 0, 0.35 + i * 0.7, 0); }
        add(this.box(0.9, 1.0, 0.1), M.black, 0, 0.5, b.d / 2 - 0.05);
        break;
      case 'cave': {
        const g = new THREE.DodecahedronGeometry(1.6, 0).scale(1.1, 0.8, 0.9); add(g, M.darkStone, 0, 0.6, -0.3);
        add(this.box(1.0, 1.0, 0.2), M.black, 0, 0.5, b.d / 2 - 0.1);
        break;
      }
      case 'observatory':
        add(this.cyl(0.8, 0.9, 3.6, 8), M.stone, 0, 1.8, 0);
        add(new THREE.SphereGeometry(0.9, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.dome, 0, 3.6, 0);
        { const t = this.cyl(0.12, 0.16, 1.4, 6); t.rotateZ(0.9); add(t, M.gold, 0.5, 4.2, 0); }
        add(this.box(0.4, 0.6, 0.08), M.door, 0, 0.3, 0.86);
        break;
      case 'hideout':
        for (const [x, z] of [[-0.6, -0.5], [0.7, 0.4]]) add(this.cone(0.8, 1.2, 5), M.cloth, x, 0.6, z);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(this.box(0.12, 0.9, 0.12), M.wood, Math.cos(a) * 1.35, 0.45, Math.sin(a) * 1.35); }
        add(this.box(0.3, 0.2, 0.3), M.fire, 0, 0.1, 0);
        break;
      case 'mine':
        add(this.box(1.6, 0.14, 0.2), M.wood, 0, 1.0, 0.3); for (const s of [-1, 1]) add(this.box(0.14, 1.0, 0.14), M.wood, s * 0.7, 0.5, 0.3);
        add(this.box(1.2, 0.9, 0.1), M.black, 0, 0.45, 0.25);
        add(this.box(0.5, 0.3, 0.35), M.darkStone, 1.0, 0.15, 0.6);
        break;
      case 'ruins':
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, h = 0.4 + hsh(b.x, b.z, i) * 1.6; add(this.cyl(0.18, 0.2, h, 6), M.stone, Math.cos(a) * 1.1, h / 2, Math.sin(a) * 1.1); }
        add(this.box(1.2, 0.3, 0.5), M.stone, 0.2, 0.15, -0.2, 0.4);
        break;
      case 'watchtower':
        for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) add(this.box(0.1, 2.2, 0.1), M.wood, x, 1.1, z);
        add(this.box(0.9, 0.1, 0.9), M.planks, 0, 2.2, 0);
        for (const [x, z, w2, d2] of [[0, -0.45, 0.9, 0.06], [0, 0.45, 0.9, 0.06], [-0.45, 0, 0.06, 0.9], [0.45, 0, 0.06, 0.9]]) add(this.box(w2, 0.35, d2), M.wood, x, 2.42, z);
        add(this.cone(0.75, 0.6, 4), M.thatch, 0, 2.95, 0, Math.PI / 4);
        break;
      case 'clinic':
        houseLike(1.2, M.timber, M.tileRoof);
        add(this.box(0.4, 0.12, 0.05), M.red, face[0] * (W_ / 2 + 0.06), 1.0, face[1] * (D_ / 2 + 0.06) + (face[1] ? 0 : 0.3));
        add(this.box(0.12, 0.4, 0.05), M.red, face[0] * (W_ / 2 + 0.06), 1.0, face[1] * (D_ / 2 + 0.06) + (face[1] ? 0 : 0.3));
        break;
      case 'school':
        houseLike(1.4, M.timber2, M.slate);
        add(this.box(0.5, 0.6, 0.5), M.wood, 0, 2.4, 0); add(this.cyl(0.12, 0.2, 0.25, 8), M.gold, 0, 2.3, 0);
        break;
      case 'stable':
        add(this.box(W_, 1.0, D_), M.planks, 0, 0.5, 0); add(this.prism(W_ + 0.3, D_ + 0.4, 0.6), M.thatch, 0, 1.0, 0);
        add(this.box(W_ * 0.7, 0.8, 0.05), M.black, 0, 0.4, D_ / 2 + 0.02);
        break;
      case 'mill':
        add(this.cyl(0.7, 0.9, 2.2, 8), south ? M.adobe : M.stone, 0, 1.1, 0); add(this.cone(0.95, 0.9, 8), M.thatch, 0, 2.65, 0);
        door(1.6, 1.6, 0.6);
        break;
      case 'lighthouse':
        for (let i = 0; i < 5; i++) add(this.cyl(0.42 - i * 0.03, 0.45 - i * 0.03, 1, 8), i % 2 ? M.red : M.white, 0, 0.5 + i, 0);
        add(this.box(0.5, 0.4, 0.5), M.lamp, 0, 5.2, 0); add(this.cone(0.45, 0.5, 8), M.red, 0, 5.65, 0);
        break;
      case 'guardpost': {
        // 門の詰所：石の小屋に見張りの小塔と旗
        const wall = south ? M.sandstone : M.stone;
        add(this.box(W_, 1.1, D_), wall, 0, 0.55, 0);
        add(this.box(W_ + 0.1, 0.12, D_ + 0.1), M.darkStone, 0, 1.16, 0);
        for (let i = 0; i < 4; i++) add(this.box(0.22, 0.22, 0.22), wall, (i % 2 ? 1 : -1) * (W_ / 2 - 0.12), 1.32, (i < 2 ? 1 : -1) * (D_ / 2 - 0.12));
        add(this.box(0.7, 0.9, 0.7), wall, -W_ / 4, 1.6, -D_ / 4); add(this.cone(0.6, 0.6, 4), M.slate, -W_ / 4, 2.35, -D_ / 4, Math.PI / 4);
        windows(W_, D_, 0.7, M.black); door(W_, D_, 0.7); banner(W_ / 4, D_ / 4, 1.2, kcol);
        add(this.box(0.1, 0.9, 0.1), M.wood, face[0] * (W_ / 2 + 0.3) + face[1] * 0.5, 0.45, face[1] * (D_ / 2 + 0.3) + face[0] * 0.5); // 槍立て
        break;
      }
      case 'drillyard': {
        // 練兵場：柵で囲んだ砂地に、打ち込み台・的・武器掛け
        const hw = b.w / 2 - 0.1, hd = b.d / 2 - 0.1;
        for (const [x, z, w2, d2] of [[0, -hd, b.w - 0.2, 0.06], [0, hd, b.w - 0.2, 0.06], [-hw, 0, 0.06, b.d - 0.2], [hw, 0, 0.06, b.d - 0.2]]) { add(this.box(w2, 0.08, d2), M.wood, x, 0.35, z); add(this.box(w2, 0.08, d2), M.wood, x, 0.15, z); }
        for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) add(this.box(0.12, 0.5, 0.12), M.wood, x, 0.25, z);
        for (let i = 0; i < 3; i++) { const x = -hw + 0.8 + i * ((b.w - 1.6) / 2); add(this.box(0.1, 0.9, 0.1), M.wood, x, 0.45, -hd + 0.5); add(this.box(0.5, 0.1, 0.1), M.wood, x, 0.7, -hd + 0.5); add(this.cyl(0.14, 0.14, 0.35, 6), M.cloth, x, 0.95, -hd + 0.5); }
        add(this.cyl(0.35, 0.35, 0.06, 10), M.red, hw - 0.5, 0.8, hd - 0.35); add(this.cyl(0.2, 0.2, 0.07, 10), M.white, hw - 0.5, 0.8, hd - 0.33);
        add(this.box(0.08, 0.8, 0.08), M.wood, hw - 0.5, 0.4, hd - 0.4);
        add(this.box(1.0, 0.06, 0.2), M.wood, -hw + 0.7, 0.8, hd - 0.3); for (let i = 0; i < 4; i++) add(this.box(0.04, 0.7, 0.04), M.black, -hw + 0.35 + i * 0.22, 0.45, hd - 0.28);
        banner(-hw + 0.1, -hd + 0.1, 0, kcol);
        break;
      }
      case 'academy': {
        // 魔法学園：石造りの学舎に、星見の塔と紫の尖り屋根
        const wall = south ? M.sandstone : M.stone;
        add(this.box(W_, 1.7, D_), wall, 0, 0.85, 0);
        gable(W_, D_, 1.7, M.purple);
        for (const k of [-1, 1]) { add(this.cyl(0.55, 0.62, 3.2, 8), wall, k * (W_ / 2 - 0.4), 1.6, -D_ / 2 + 0.4); add(this.cone(0.8, 1.6, 8), M.purple, k * (W_ / 2 - 0.4), 4.0, -D_ / 2 + 0.4); }
        add(this.box(0.3, 0.3, 0.3), M.crystal, W_ / 2 - 0.4, 5.0, -D_ / 2 + 0.4);
        windows(W_, D_, 1.0); door(W_, D_, 0.8);
        add(this.box(0.9, 0.5, 0.05), M.purple, face[0] * (W_ / 2 + 0.05), 1.45, face[1] * (D_ / 2 + 0.05));
        break;
      }
      case 'dojo': {
        // 道場：板張りの大屋根と、軒先の看板
        add(this.box(W_, 1.2, D_), south ? M.adobe : M.planks, 0, 0.6, 0);
        add(this.box(W_ + 0.4, 0.1, D_ + 0.4), M.darkStone, 0, 1.25, 0);
        gable(W_, D_, 1.3, south ? M.tileRoofS : M.greyRoof);
        windows(W_, D_, 0.8); door(W_, D_, 0.75);
        add(this.box(face[0] ? 0.06 : 0.9, 0.3, face[1] ? 0.06 : 0.9), M.wood, face[0] * (W_ / 2 + 0.08), 1.05, face[1] * (D_ / 2 + 0.08));
        for (let i = 0; i < 2; i++) add(this.box(0.06, 0.8, 0.06), M.wood, face[0] * (W_ / 2 + 0.4) + (face[1] ? -0.6 + i * 1.2 : 0), 0.4, face[1] * (D_ / 2 + 0.4) + (face[0] ? -0.6 + i * 1.2 : 0));
        break;
      }
      case 'fort': {
        // 国境の砦：石の囲いと見張り塔、国の旗
        const wall = south ? M.sandstone : M.stone;
        const hw = b.w / 2 - 0.25, hd = b.d / 2 - 0.25;
        add(this.box(b.w - 0.5, 1.2, 0.35), wall, 0, 0.6, -hd); add(this.box(0.35, 1.2, b.d - 0.5), wall, -hw, 0.6, 0); add(this.box(0.35, 1.2, b.d - 0.5), wall, hw, 0.6, 0);
        add(this.box(b.w - 0.5, 1.2, 0.35), wall, 0, 0.6, hd);
        for (let i = -hw; i <= hw + 0.01; i += 0.55) { add(this.box(0.22, 0.22, 0.4), wall, i, 1.31, -hd); add(this.box(0.22, 0.22, 0.4), wall, i, 1.31, hd); }
        add(this.box(0.9, 0.95, 0.4), M.black, face[0] * hw, 0.47, face[1] * hd + (face[1] ? 0.02 * face[1] : 0));
        add(this.cyl(0.55, 0.65, 2.8, 8), wall, -hw + 0.3, 1.4, -hd + 0.3); add(this.cone(0.8, 1.1, 8), M.slate, -hw + 0.3, 3.35, -hd + 0.3);
        add(this.box(1.2, 0.8, 1.0), M.planks, 0.3, 0.4, 0); add(this.prism(1.4, 1.2, 0.5), M.thatch, 0.3, 0.8, 0);
        banner(-hw + 0.3, -hd + 0.3, 3.4, kcol);
        break;
      }
      case 'camp': {
        // 開拓者の小屋：丸太小屋と切り株、薪の山
        add(this.box(W_ * 0.8, 0.9, D_ * 0.8), M.wood, 0, 0.45, 0);
        add(this.prism(W_ * 0.8 + 0.3, D_ * 0.8 + 0.4, 0.6), M.thatch, 0, 0.9, 0);
        door(W_ * 0.8, D_ * 0.8, 0.6);
        for (let i = 0; i < 3; i++) add(this.cyl(0.14, 0.16, 0.2, 6), M.wood, -W_ / 2 + 0.2 + i * 0.35, 0.1, D_ / 2 + 0.25 - (i % 2) * 0.2);
        for (let i = 0; i < 3; i++) add(this.box(0.7, 0.12, 0.12), M.wood, W_ / 2 - 0.2, 0.08 + i * 0.12, -D_ / 2 + 0.3 + (i % 2) * 0.06);
        break;
      }
      default: houseLike(1.15, M.timber, M.thatch);
    }
    BG.extraSignParts(this, b, add); // 形はそのままで看板だけ足す建物（聖堂・魔法の塔など）
    return parts;
  }

  buildBuildings() {
    const byMat = new Map();
    for (const b of this.sim.S.world.buildings) this.addBuildingParts(b, byMat);
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }
  addBuildingParts(b, byMat) {
    if (b.type === 'site') return;   // 工事中：本物の建物は完成してから描く（普請場の姿は constructgfx.js）
    const w = this.sim.S.world;
    const cx = wx(b.x) + (b.w - 1) / 2, cz = wz(b.z) + (b.d - 1) / 2;
    const y = topY(w.hgt[b.door.z * W + b.door.x]);
    for (const { g, mat } of this.buildingParts(b)) {
      g.translate(cx, y, cz);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (byMat) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); }
      else { const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; this.scene.add(m); }
    }
  }
  addBuilding(id) { const b = this.sim.building(id); this.addBuildingParts(b, null); this.chunks.rebuildRect(b.x - 1, b.z - 1, b.x + b.w, b.z + b.d); }
  // 風車の羽根（回る）
  buildMills() {
    this.mills = [];
    const w = this.sim.S.world;
    const mat = new THREE.MeshLambertMaterial({ color: '#f0e6d0', side: THREE.DoubleSide });
    for (const b of w.buildings.filter((x) => x.type === 'mill')) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.03), mat); blade.position.y = 0.8; const arm = new THREE.Group(); arm.add(blade); arm.rotation.z = i * Math.PI / 2; g.add(arm); }
      const face = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
      g.position.set(wx(b.x) + 0.5 + face[0] * 0.95, topY(w.hgt[b.door.z * W + b.door.x]) + 1.9, wz(b.z) + 0.5 + face[1] * 0.95);
      g.rotation.y = Math.atan2(face[0], face[1]);
      for (const c of g.children) c.children[0].castShadow = true;
      this.scene.add(g); this.mills.push(g);
    }
  }

  buildWeather() {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 16; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.precip = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe3ff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    this.precip.visible = false;
    this.scene.add(this.precip);
  }

  // ---------- 生き物のスプライト ----------
  ageKey(p) { const a = this.sim.ageOf(p); return a < 5 ? 'baby' : a < 13 ? 'child' : a >= 64 ? 'elder' : 'adult'; }
  makeSheet(e, isHuman) {
    let cv = null;
    try {
      if (isHuman && SPR.drawPerson) cv = SPR.drawPerson(e, { age: this.sim.ageOf(e) });
      else if (!isHuman && SPR.drawCreature) cv = SPR.drawCreature(e, SPECIES[e.sp]);
    } catch (err) { cv = null; }
    if (!cv) {
      if (isHuman) { const t = personTexture(e, this.ageKey(e) === 'baby' ? 'child' : this.ageKey(e)); return { tex: t, cols: 1, rows: 1, fw: 16, fh: 20, worldH: 0.95 }; }
      return null;
    }
    const u = cv.userData || {};
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const cols = u.cols || 1, rows = u.rows || 1;
    const fw = u.frameW || cv.width / cols, fh = u.frameH || cv.height / rows;
    let worldH = u.worldH || (isHuman ? 0.95 : (SPECIES[e.sp]?.size || 1) * 0.7);
    if (isHuman) { const a = this.sim.ageOf(e); if (!u.worldH) worldH = a < 5 ? 0.5 : a < 13 ? 0.7 : 0.95; }
    return { tex, cols, rows, fw, fh, worldH };
  }
  ensure(e, isHuman) {
    let r = this.ents.get(e.id);
    const key = isHuman ? `${this.ageKey(e)}|${e.job}|${e.rank}|${e.jail != null}|${e.advClass || ''}` : `${e.sp}|${e.lv}`;
    if (r && r.key === key) return r;
    if (r) this.drop(e.id);
    const sheet = this.makeSheet(e, isHuman);
    if (!sheet) return null;
    const mat = new THREE.SpriteMaterial({ map: sheet.tex, transparent: true, alphaTest: 0.5 });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    const hgt = sheet.worldH, wid = hgt * sheet.fw / sheet.fh;
    sprite.scale.set(wid, hgt, 1);
    sheet.tex.repeat.set(1 / sheet.cols, 1 / sheet.rows);
    sprite.userData = { id: e.id, human: isHuman };
    const shadow = this.shadows.make(Math.min(0.5, wid * 0.35));
    this.scene.add(sprite);
    r = { sprite, shadow, sheet, key, dir: 0, lx: e.pos.x, lz: e.pos.z, phase: Math.random() * 10, flash: 0, sx: e.pos.x, sz: e.pos.z, fx: e.pos.x, fz: e.pos.z, tx: e.pos.x, tz: e.pos.z, tChange: 0, dur: 1 };
    this.ents.set(e.id, r);
    return r;
  }
  drop(id) {
    const r = this.ents.get(id);
    if (!r) return;
    this.scene.remove(r.sprite, r.shadow);
    r.sheet.tex.dispose(); r.sprite.material.dispose(); r.shadow.geometry.dispose();
    if (r.animTex) for (const a of r.animTex.values()) (a.tex || a).dispose?.();
    this.ents.delete(id);
  }
  hit(id) {
    const r = this.ents.get(id);
    if (!r) return;
    r.flash = 0.18; r.hurtUntil = performance.now() + 300;
    if (r.sprite.userData.human) r.once = { anim: 'hurt', until: performance.now() / 1000 + 0.35 };
  }

  // 人のアニメ：an が null なら歩行シートに戻す
  applyAnim(r, e, an, now, row, walkFrame) {
    const m = r.sprite.material;
    if (!an) {
      if (m.map !== r.sheet.tex) { m.map = r.sheet.tex; m.needsUpdate = true; const h = r.sheet.worldH; r.sprite.scale.set(h * r.sheet.fw / r.sheet.fh, h, 1); }
      r.sheet.tex.offset.set(walkFrame / r.sheet.cols, 1 - (row + 1) / r.sheet.rows);
      r.anim = null; return;
    }
    r.animTex = r.animTex || new Map();
    let a = r.animTex.get(an);
    if (!a) {
      let s;
      try { s = drawPersonAnim(e, { age: this.sim.ageOf(e), dead: e.deathYear != null }, an); } catch (err) { return this.applyAnim(r, e, null, now, row, walkFrame); }
      const tex = new THREE.CanvasTexture(s.canvas);
      tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / s.frames, 1 / 4);
      a = { s, tex }; r.animTex.set(an, a);
      if (r.animTex.size > 5) { for (const [k, v] of r.animTex) { if (v !== a && v.tex !== m.map) { v.tex.dispose(); r.animTex.delete(k); break; } } }
    }
    if (r.anim !== an) { r.anim = an; r.animT0 = now; }
    if (m.map !== a.tex) { m.map = a.tex; m.needsUpdate = true; r.sprite.scale.set(a.s.frameW * SPR.PIXEL_SCALE, a.s.frameH * SPR.PIXEL_SCALE, 1); }
    const f = pFrameAt(a.s, now - r.animT0);
    a.tex.offset.set(f / a.s.frames, 1 - (row + 1) / 4);
  }

  // 生き物のアニメ：切り替えたら true
  creatureAnim(r, e, moving, nowMs) {
    const hurt = r.hurtUntil > nowMs;
    const name = creatureAnimState(this.sim, e, { moving, hurt, dead: !!r.corpse });
    if (r.anim !== name) { r.anim = name; r.animT0 = nowMs; }
    let a = peekCreatureAnim(e, name);
    if (!a) {
      if (this._animMs > 8 && r.animInfo) a = r.animInfo; // 1フレームに作る量を抑える
      else { const t0 = performance.now(); try { a = drawCreatureAnim(e, SPECIES[e.sp], name); } catch (err) { return false; } this._animMs += performance.now() - t0; }
    }
    r.animTex = r.animTex || new Map();
    let tex = r.animTex.get(a);
    if (!tex) {
      tex = new THREE.CanvasTexture(a.canvas);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / a.cols, 1 / a.rows);
      r.animTex.set(a, tex);
      if (r.animTex.size > 6) { const [k0, t0] = r.animTex.entries().next().value; if (t0 !== r.sprite.material.map) { t0.dispose(); r.animTex.delete(k0); } }
    }
    if (r.sprite.material.map !== tex) {
      r.sprite.material.map = tex; r.sprite.material.needsUpdate = true;
      r.sprite.scale.set(a.frameW * a.scale, a.frameH * a.scale, 1);
      r.sprite.center.set(0.5, a.anchorY / a.frameH);
    }
    const k = cFrameAt(a, nowMs - r.animT0);
    tex.offset.set(k / a.cols, 1 - (r.dir + 1) / a.rows);
    r.animInfo = a;
    return true;
  }

  entityPos(e, px = e.pos.x, pz = e.pos.z) {
    const w = this.sim.S.world;
    if (e.inside != null) {
      const b = this.sim.building(e.inside);
      return new THREE.Vector3(wx(b.x) + (b.w - 1) / 2, topY(b.h || 0) + 1.8, wz(b.z) + (b.d - 1) / 2);
    }
    const x = Math.round(px), z = Math.round(pz);
    const t = w.tiles[z * W + x];
    let y = (t === T.SEA || t === T.DEEP) ? SEA_Y : t === T.DOCK ? SEA_Y + 0.18 : topY(w.hgt[z * W + x] || 0);
    return new THREE.Vector3(wx(px), y, wz(pz));
  }

  updateEntities(realDt, now) {
    const sim = this.sim;
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const fwd = new THREE.Vector2(camDir.x, camDir.z).normalize();
    const right = new THREE.Vector2(-fwd.y, fwd.x);
    const seen = new Set();
    const t = this.controls.target;
    const viewR = 22 / this.camera.zoom + 8;
    const nowMs = performance.now(); this._animMs = 0;
    this.partyRings.begin();
    const farView = this.camera.zoom < 0.55;
    this.dots.begin();
    spacingBegin(sim);
    const place = (e, isHuman) => {
      const near = Math.abs(e.pos.x - (t.x + W / 2)) < viewR * 1.6 && Math.abs(e.pos.z - (t.z + H / 2)) < viewR * 1.6;
      if (farView) {   // 引いた眺め：点だけ（絵は作らない。作ってあった絵は下で片づく）
        if (near && e.inside == null && !e.dormant && (isHuman || e.hp > 0)) { const q = this.entityPos(e); this.dots.add(q.x, q.y + 0.3, q.z, dotColor(e, isHuman)); }
        return;
      }
      if (!near && !this.ents.has(e.id)) return;
      const r = this.ensure(e, isHuman);
      if (!r) return;
      seen.add(e.id);
      if (!isHuman) r.e = e;
      const vis = e.inside == null && !e.dormant;
      r.sprite.visible = r.shadow.visible = vis && near;
      if (!r.sprite.visible) { r.hid = true; return; }
      // 表示の位置：世界は0.5分きざみ（数フレームに1回）で動くので、前の位置から今の位置へ一定の速さでつなぐ
      // 立ち止まっている者は、ほかと重ならない立ち位置へ（見た目だけ。本当の位置は変えない。spacing.js）
      const sp = formationPos(sim, e, isHuman) || spacedPos(sim, e, isHuman), ex = sp.x, ez = sp.z;   // パーティは隊列の位置（formation.js）
      if (r.tx !== ex || r.tz !== ez || r.hid) {
        const jump = r.hid || Math.abs(e.pos.x - (r.rx ?? r.tx)) + Math.abs(e.pos.z - (r.rz ?? r.tz)) > 3;
        r.fx = jump ? ex : r.sx; r.fz = jump ? ez : r.sz;
        r.tx = ex; r.tz = ez; r.rx = e.pos.x; r.rz = e.pos.z; r.hid = false;
        r.dur = Math.min(700, Math.max(40, nowMs - r.tChange)); r.tChange = nowMs;
      }
      const kk = Math.min(1, (nowMs - r.tChange) / r.dur);
      r.sx = r.fx + (r.tx - r.fx) * kk; r.sz = r.fz + (r.tz - r.fz) * kk;
      const p = this.entityPos(e, r.sx, r.sz);
      const dx = r.sx - r.lx, dz = r.sz - r.lz;
      const moved = Math.hypot(dx, dz);
      let target = null;
      if (e.fight) { const o = sim.entity(e.fight.target); if (o) target = o; }
      const fc = !target && isHuman && moved < 0.0005 ? (formationFace(sim, e) || spacingFace(sim, e)) : null;   // 立ち止まったら、話し相手や輪の中心を向く
      const vx = target ? target.pos.x - e.pos.x : fc ? fc.x - r.sx : dx, vz = target ? target.pos.z - e.pos.z : fc ? fc.z - r.sz : dz;
      if (Math.hypot(vx, vz) > 0.001) {
        const sx = vx * right.x + vz * right.y, sf = vx * fwd.x + vz * fwd.y;
        r.dir = Math.abs(sx) > Math.abs(sf) ? (sx > 0 ? 2 : 1) : (sf > 0 ? 3 : 0);
      }
      r.lx = r.sx; r.lz = r.sz;
      const walking = moved > 0.0005 || !!e.fight;
      if (!isHuman && moved > 0.0005) r.movedAt = nowMs; // 止まっても0.4秒は歩きを続ける（がたつき防止）
      const anim = !isHuman && r.sheet.cols >= 3 && this.creatureAnim(r, e, nowMs - (r.movedAt || 0) < 400, nowMs);
      if (walking) r.phase += realDt * (e.fight ? 10 : 7);
      const seq = [0, 1, 2, 1];
      const frame = r.sheet.cols >= 3 ? (walking ? seq[Math.floor(r.phase) % 4] : 1) : 0;
      const row = r.sheet.rows >= 4 ? r.dir : 0;
      if (isHuman && r.sheet.cols >= 3) {
        // 画面の近くの人だけ、しぐさのアニメを付ける
        const close = Math.abs(e.pos.x - (t.x + W / 2)) < viewR && Math.abs(e.pos.z - (t.z + H / 2)) < viewR;
        let an = !close ? null : r.once && now < r.once.until ? r.once.anim : personAnimState(sim, e, moved > 0.0005 && !e.fight);
        if (an === 'walk') an = null;
        this.applyAnim(r, e, an, now, row, frame);
      } else if (!anim) r.sheet.tex.offset.set(frame / r.sheet.cols, 1 - (row + 1) / r.sheet.rows);
      const def = !isHuman ? SPECIES[e.sp] : null;
      let y = p.y + 0.01;
      const air = anim ? r.animInfo.airborne : def?.flies;
      if (air) y += 1.1 + Math.sin(now * 3 + r.phase) * 0.1;
      if (def?.swims) y = SEA_Y - 0.05 + Math.sin(now * 2 + r.phase) * 0.05;
      if (!anim && r.sheet.cols < 3 && walking) y += Math.abs(Math.sin(r.phase * 1.5)) * 0.06;
      r.sprite.position.set(p.x, y, p.z);
      r.shadow.position.set(p.x, p.y + 0.015, p.z);
      if (isHuman && e.party != null) this.partyRings.add(sim, e, p.x, p.y, p.z);
      r.shadow.visible = !def?.swims;
      if (r.flash > 0) { r.flash -= realDt; if (!r.red) { r.red = true; r.sprite.material.color.set('#ff6a6a'); } } else if (r.red) { r.red = false; r.sprite.material.color.set('#ffffff'); }
    };
    for (const p of sim.living()) place(p, true);
    for (const c of Object.values(sim.S.creatures)) place(c, false);
    // 亡骸：倒れる姿を見せてから消す
    for (const [id, r] of this.ents) {
      if (seen.has(id) || !r.sprite.visible) continue;
      if (r.sprite.userData.human) {
        const e = sim.person(id);
        if (!e || e.deathYear == null || r.sheet.cols < 3) continue;
        if (!r.corpse) r.corpse = { t0: now };
        spacingSlideCorpse(sim, id, r, realDt);
        const k = now - r.corpse.t0;
        this.applyAnim(r, e, 'death', now, r.dir, 1);
        const dur = r.animTex?.get('death') ? animDuration(r.animTex.get('death').s) : 1;
        r.sprite.material.opacity = k < dur + 4 ? 1 : Math.max(0, 1 - (k - dur - 4));
        r.sprite.material.transparent = true; r.shadow.visible = false;
        if (k < dur + 5) seen.add(id);
      } else if (r.e && r.e.hp <= 0) {
        if (!r.corpse) r.corpse = nowMs;
        spacingSlideCorpse(sim, id, r, realDt, r.e);
        if (nowMs - r.corpse < 20000) { this.creatureAnim(r, r.e, false, nowMs); seen.add(id); }
      }
    }
    for (const id of [...this.ents.keys()]) if (!seen.has(id)) this.drop(id);
    this.shadows.flush(this.ents);
    this.dots.end();
    this.partyRings.end(now);
  }

  // ---------- 隊商（荷車と船）：logistics.js の convoyViews を毎フレーム映す ----------
  makeConvoyMesh(kind) {
    const M = this.mats, g = new THREE.Group();
    if (kind === 'ship') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.7), M.hull); hull.position.y = 0.12;
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.08), M.wood); mast.position.y = 1.0;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.1), M.sail); sail.position.set(0.05, 1.1, 0); sail.rotation.y = Math.PI / 2;
      g.add(hull, mast, sail);
    } else {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.55), M.planks); bed.position.y = 0.32;
      const load = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.45), M.cloth); load.position.y = 0.54; load.name = 'load';
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.05), M.wood); pole.position.set(0.7, 0.3, 0);
      g.add(bed, load, pole);
      for (const [x, z] of [[-0.25, 0.3], [-0.25, -0.3], [0.25, 0.3], [0.25, -0.3]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10), M.wood);
        wh.rotation.x = Math.PI / 2; wh.position.set(x, 0.17, z); g.add(wh);
      }
    }
    for (const o of g.children) o.castShadow = true;
    return g;
  }
  updateConvoys(now) {
    const w = this.sim.S.world, seen = new Set(), away = new Set();
    this.convoyObjs = this.convoyObjs || new Map();
    for (const v of [...convoyViews(this.sim), ...mintViews(this.sim)]) {
      let o = this.convoyObjs.get(v.id);
      if (!o) { o = v.mf ? mintCartMesh(v) : this.makeConvoyMesh(v.kind); this.scene.add(o); this.convoyObjs.set(v.id, o); }
      seen.add(v.id);
      if (v.kind === 'ship') away.add(v.home);
      const x = Math.round(v.x), z = Math.round(v.z), t = w.tiles[z * W + x];
      const onSea = v.kind === 'ship' || t === T.SEA || t === T.DEEP;
      o.position.set(wx(v.x), onSea ? SEA_Y + Math.sin(now * 1.5 + v.x) * 0.05 : topY(w.hgt[z * W + x] || 0), wz(v.z));
      o.rotation.y = -v.angle;                       // 進む向き（+x が船首・荷車の前）
      if (v.kind === 'ship') o.rotation.x = Math.sin(now + v.z) * (v.state === 'storm' ? 0.18 : 0.04);
      else { const ld = o.getObjectByName('load'); if (ld) ld.visible = v.load > 0; }
    }
    for (const [id, o] of this.convoyObjs) if (!seen.has(id)) { this.scene.remove(o); o.traverse((m) => m.geometry?.dispose()); this.convoyObjs.delete(id); }
    // 定期船が出ている港では、桟橋の船を隠す
    for (const b of this.boats) b.visible = !away.has(b.userData.sid);
  }

  // ---------- 毎フレーム ----------
  update(realDt, selectedId, followId) {
    const sim = this.sim;
    LG.leisureGfxSync(this);
    const si = sim.seasonIdx();
    if (si !== this.lastSeason) { this.applySeason(si); this.lastSeason = si; }
    const now = performance.now() / 1000;
    this.updateEntities(realDt, now);
    actGfxFrame(this, realDt, now); // 暮らしと仕事の跡（js/actgfx.js）
    // 選択・追従
    const sel = selectedId != null ? sim.entity(selectedId) : null;
    if (sel && (sel.deathYear == null) && sel.hp > 0) {
      const rs = this.ents.get(sel.id);
      const pos = rs && sel.inside == null && rs.sprite.visible ? this.entityPos(sel, rs.sx, rs.sz) : this.entityPos(sel);
      this.selRing.visible = sel.inside == null;
      this.selRing.position.set(pos.x, pos.y + 0.03, pos.z);
      this.selRing.scale.setScalar(1 + Math.sin(now * 5) * 0.1);
      if (followId === selectedId) {
        const t = this.controls.target;
        const d = new THREE.Vector3(pos.x - t.x, pos.y - t.y, pos.z - t.z).multiplyScalar(Math.min(1, realDt * 4));
        t.add(d); this.camera.position.add(d);
      }
    } else this.selRing.visible = false;
    // 昼夜
    const h = sim.hour();
    const dayF = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 20 ? 1 - (h - 18) / 2 : 0;
    const dusk = (h > 5 && h < 7.5) || (h > 17 && h < 20) ? 1 - Math.min(1, Math.abs(h - (h < 12 ? 6.2 : 18.5)) / 1.3) : 0;
    const t = this.controls.target;
    const demonD = Math.hypot(t.x + W / 2 - sim.S.world.demon.x, t.z + H / 2 - sim.S.world.demon.z);
    const sky = new THREE.Color('#0e1633').lerp(new THREE.Color('#8fd0ff'), dayF).lerp(new THREE.Color('#f29a5c'), dusk * 0.5);
    const weather = sim.S.weather;
    if (weather === 'rain' || weather === 'cloudy') sky.lerp(new THREE.Color('#7c8894'), weather === 'rain' ? 0.5 : 0.3);
    if (demonD < 30 || sim.S.demon?.active) sky.lerp(new THREE.Color('#5a1a2a'), demonD < 30 ? 0.55 : 0.12);
    this.scene.background = sky;
    const ang = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(t.x + Math.cos(ang) * -30, Math.max(10, Math.sin(ang) * 45), t.z + 20);
    this.sun.target.position.copy(t);
    this.sun.intensity = 0.25 + dayF * (weather === 'sunny' ? 2.3 : 1.2);
    this.sun.color.set(dusk > 0.3 ? '#ffc08a' : dayF > 0.2 ? '#fff2d6' : '#8aa0ff');
    this.hemi.intensity = 0.5 + dayF * 0.9;
    this.hemi.color.set(dayF > 0.3 ? '#dff1ff' : '#5a6aa8');
    for (const m of this.nightMats) m.emissiveIntensity = (1 - dayF) * 1.6;
    BG.bldFxUpdate(this, dayF, now, realDt); // 看板の夜の明るさと、煙突の煙
    this.waterTex.offset.x = (now * 0.02) % 1;
    for (const m of this.mills) m.rotation.z = now * 0.8 * (sim.S.weather === 'rain' ? 1.8 : 1);
    for (const b of this.boats) { b.position.y = SEA_Y + Math.sin(now * 1.5 + b.position.x) * 0.05; b.rotation.z = Math.sin(now + b.position.z) * 0.05; }
    this.updateConvoys(now);
    this.cgfx?.update(now, realDt);   // 普請場の姿と、資材を担いで歩く人の荷
    // 雨・雪（カメラの周りだけ）
    const precip = weather === 'rain' || weather === 'snow';
    this.precip.visible = precip;
    if (precip) {
      this.precip.position.set(t.x, t.y, t.z);
      const pos = this.precip.geometry.attributes.position;
      const spd = weather === 'rain' ? 16 : 1.6;
      this.precip.material.color.set(weather === 'rain' ? '#bcd6f5' : '#ffffff');
      this.precip.material.size = weather === 'rain' ? 1.5 : 2.5;
      for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - spd * realDt; if (y < 0) y += 16; pos.setY(i, y); }
      pos.needsUpdate = true;
    }
    // 遠くから見ているときは影を省く（軽くする）
    const wantShadow = this.shadowsOn !== false && this.camera.zoom > 0.7;
    if (this.sun.castShadow !== wantShadow) this.sun.castShadow = wantShadow;
    this.controls.update();
    this.chunks.update(this.camera, this.controls.target, this.renderer);
    this.renderer.render(this.scene, this.camera);
  }

  // ---------- 視点 ----------
  viewInfo() { const t = this.controls.target; return { x: t.x + W / 2, z: t.z + H / 2, r: 18 / this.camera.zoom + 6 }; }
  project(v) {
    const p = v.clone().project(this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && p.z > -1 && p.x > -1.1 && p.x < 1.1 && p.y > -1.1 && p.y < 1.1 };
  }
  spriteTop(e) {
    const r = this.ents.get(e.id);
    if (!r || e.inside != null || !r.sprite.visible) return this.entityPos(e).add(new THREE.Vector3(0, 1, 0));
    return r.sprite.position.clone().add(new THREE.Vector3(0, r.sprite.scale.y + 0.08, 0));
  }
  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const sprites = [...this.ents.values()].filter((r) => r.sprite.visible).map((r) => r.sprite);
    const hit = this.raycaster.intersectObjects(sprites, false);
    if (hit.length) return { entity: hit[0].object.userData.id };
    let best = null, bd = 20;
    for (const r of this.ents.values()) {
      if (!r.sprite.visible) continue;
      const s = this.project(r.sprite.position.clone().add(new THREE.Vector3(0, r.sprite.scale.y / 2, 0)));
      const d = Math.hypot(s.x - (clientX - rect.left), s.y - (clientY - rect.top));
      if (d < bd) { bd = d; best = r.sprite.userData.id; }
    }
    if (best != null) return { entity: best };
    const tile = this.chunks.raycastTile(this.raycaster.ray);
    {
      if (tile) {
        const { x, z } = tile;
        const w = this.sim.S.world;
        // 建物は地面の上に立っているので、少し手前（カメラ側）も調べる
        for (const [ddx, ddz] of [[0, 0], [0, -1], [-1, 0], [0, 1], [1, 0]]) {
          const b = w.bldAt[(z + ddz) * W + (x + ddx)];
          if (b != null && b >= 0) return { building: b };
        }
        return { tile: { x, z } };
      }
    }
    return null;
  }
  lookAt(x, z, zoom) {
    const t = this.controls.target;
    const off = this.camera.position.clone().sub(t);
    if (off.length() < 1) off.set(26, 30, 26);
    t.set(wx(x), topY(this.sim.S.world.hgt[Math.round(z) * W + Math.round(x)] || 0), wz(z));
    this.camera.position.copy(t).add(off);
    if (zoom) { this.camera.zoom = zoom; this.camera.updateProjectionMatrix(); }
  }
  focusOn(e) { this.lookAt(e.pos.x, e.pos.z, Math.max(this.camera.zoom, 2.4)); }
  rotateBy(rad) { const t = this.controls.target, c = this.camera.position; const off = c.clone().sub(t); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad); c.copy(t).add(off); }
  topView() { const t = this.controls.target; this.camera.position.set(t.x + 0.01, t.y + 50, t.z + 0.01); }
  isoView() { const t = this.controls.target; this.camera.position.set(t.x + 26, t.y + 30, t.z + 26); }
  lowView() { const t = this.controls.target, c = this.camera.position; const off = c.clone().sub(t); off.y = 0; off.normalize().multiplyScalar(40); this.camera.position.set(t.x + off.x, t.y + 9, t.z + off.z); }
  worldView() { this.lookAt(W / 2, H / 2, 0.18 * 160 / W); this.topView(); }
}
