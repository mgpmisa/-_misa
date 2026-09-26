// 3D描画：見下ろし型のドット絵ボクセル世界（角度・ズーム自由）
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { W, H, T } from './world.js';
import { buildTextures, personTexture, TEX } from './textures.js';

const wx = (x) => x - W / 2 + 0.5;
const wz = (z) => z - H / 2 + 0.5;

export class Renderer {
  constructor(canvas, sim) {
    this.sim = sim;
    this.canvas = canvas;
    this.pixel = 2;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8fd0ff');
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 400);
    this.camera.position.set(26, 30, 26);
    this.camera.zoom = 1.6;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.6; this.controls.maxZoom = 7;
    this.controls.minPolarAngle = 0.12; this.controls.maxPolarAngle = 1.32;
    this.controls.screenSpacePanning = false;
    this.controls.target.set(0, 0, 0);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.addEventListener('start', () => { this.userMoved = true; });

    this.hemi = new THREE.HemisphereLight('#dff1ff', '#5d7a3a', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2d6', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    buildTextures();
    this.people = new Map();
    this.nightMats = [];
    this.buildTerrain();
    this.buildBuildings();
    this.buildTrees();
    this.buildFences();
    this.buildLamps();
    this.buildSheep();
    this.buildWeather();
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 16), new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.9, depthWrite: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.raycaster = new THREE.Raycaster();
    this.lastSeason = -1;
    this.resize();
  }

  setPixel(n) { this.pixel = n; this.resize(); }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(Math.max(1, Math.floor(w / this.pixel)), Math.max(1, Math.floor(h / this.pixel)), false);
    const aspect = w / h, s = 14;
    Object.assign(this.camera, { left: -s * aspect, right: s * aspect, top: s, bottom: -s });
    this.camera.updateProjectionMatrix();
  }

  // ---------- 地形 ----------
  buildTerrain() {
    const world = this.sim.S.world;
    const geo = new THREE.BoxGeometry(1, 0.6, 1);
    geo.translate(0, -0.3, 0);
    const side = new THREE.MeshLambertMaterial({ map: TEX.dirt });
    const mk = (tex) => new THREE.MeshLambertMaterial({ map: tex });
    this.topMats = { grass: mk(TEX.grass), road: mk(TEX.road), plaza: mk(TEX.plaza), field: mk(TEX.field[0]), sand: mk(TEX.sand) };
    const groups = { grass: [], road: [], plaza: [], field: [], sand: [] };
    const water = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const t = world.tiles[z * W + x];
      if (t === T.WATER) water.push([x, z]);
      else if (t === T.ROAD) groups.road.push([x, z]);
      else if (t === T.PLAZA) groups.plaza.push([x, z]);
      else if (t === T.FIELD) groups.field.push([x, z]);
      else if (t === T.SAND) groups.sand.push([x, z]);
      else groups.grass.push([x, z]);
    }
    const m = new THREE.Matrix4(), col = new THREE.Color();
    for (const [k, list] of Object.entries(groups)) {
      const mats = [side, side, this.topMats[k], side, side, side];
      const mesh = new THREE.InstancedMesh(geo, mats, list.length);
      list.forEach(([x, z], i) => {
        m.makeTranslation(wx(x), k === 'road' || k === 'plaza' ? -0.02 : 0, wz(z));
        mesh.setMatrixAt(i, m);
        const v = 0.93 + ((x * 7 + z * 13) % 10) / 70;
        mesh.setColorAt(i, col.setRGB(v, v, v));
      });
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // 水
    const wgeo = new THREE.BoxGeometry(1, 0.45, 1); wgeo.translate(0, -0.37, 0);
    this.waterTex = TEX.water;
    const wmat = new THREE.MeshLambertMaterial({ map: TEX.water, transparent: true, opacity: 0.92 });
    const wm = new THREE.InstancedMesh(wgeo, wmat, water.length);
    water.forEach(([x, z], i) => { m.makeTranslation(wx(x), 0, wz(z)); wm.setMatrixAt(i, m); });
    wm.receiveShadow = true;
    this.scene.add(wm);
    // 桟橋
    const pond = world.pond;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 2.2), new THREE.MeshLambertMaterial({ map: TEX.wood }));
    dock.position.set(wx(Math.round(pond.cx + pond.rx - 1)), 0.02, wz(Math.round(pond.cz)));
    dock.rotation.y = Math.PI / 2; dock.castShadow = true;
    this.scene.add(dock);
    // 作物
    const cropGeo = new THREE.BoxGeometry(0.82, 1, 0.82); cropGeo.translate(0, 0.5, 0);
    this.cropMat = new THREE.MeshLambertMaterial({ color: '#d9b24a' });
    this.crops = new THREE.InstancedMesh(cropGeo, this.cropMat, groups.field.length);
    this.cropTiles = groups.field;
    this.crops.castShadow = true; this.crops.receiveShadow = true;
    this.scene.add(this.crops);
    // 地面の下の板（マップの外側）
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 1.2, H + 0.2), new THREE.MeshLambertMaterial({ color: '#4a3220' }));
    base.position.y = -1.2; this.scene.add(base);
  }

  applySeason(si) {
    this.topMats.grass.map = [TEX.grass, TEX.grass, TEX.grassAutumn, TEX.grassSnow][si];
    this.topMats.road.map = si === 3 ? TEX.roadSnow : TEX.road;
    this.topMats.field.map = TEX.field[si];
    for (const mat of Object.values(this.topMats)) mat.needsUpdate = true;
    const h = [0.1, 0.32, 0.4, 0.0][si];
    const c = ['#79c24e', '#4f9a32', '#e0b84a', '#ffffff'][si];
    this.cropMat.color.set(c);
    const m = new THREE.Matrix4();
    this.cropTiles.forEach(([x, z], i) => {
      const hh = h * (0.8 + ((x * 3 + z * 5) % 5) / 12);
      m.makeScale(1, Math.max(0.001, hh), 1).setPosition(wx(x), 0, wz(z));
      this.crops.setMatrixAt(i, m);
    });
    this.crops.visible = h > 0;
    this.crops.instanceMatrix.needsUpdate = true;
    for (const r of this.roofs) r.material.map = si === 3 ? TEX.snowRoof : r.userData.roofTex;
    for (const r of this.roofs) r.material.needsUpdate = true;
    const crown = ['#4d9a3c', '#3f8a32', '#d0822e', '#e8eef2'][si];
    this.crownMat.color.set(crown);
    this.pineMat.color.set(si === 3 ? '#cfe0d8' : '#2f6b3a');
    this.pineMat2.color.set(si === 3 ? '#ffffff' : '#3d8247');
  }

  // ---------- 建物 ----------
  prism(L, D, Hr) {
    // x方向に棟が通る切妻屋根
    const hl = L / 2, hd = D / 2;
    const v = [
      // 南側の斜面
      -hl, 0, hd, hl, 0, hd, hl, Hr, 0, -hl, 0, hd, hl, Hr, 0, -hl, Hr, 0,
      // 北側の斜面
      hl, 0, -hd, -hl, 0, -hd, -hl, Hr, 0, hl, 0, -hd, -hl, Hr, 0, hl, Hr, 0,
      // 妻側
      hl, 0, hd, hl, 0, -hd, hl, Hr, 0,
      -hl, 0, -hd, -hl, 0, hd, -hl, Hr, 0,
    ];
    const sl = Math.hypot(hd, Hr);
    const uv = [
      0, 0, L, 0, L, sl, 0, 0, L, sl, 0, sl,
      0, 0, L, 0, L, sl, 0, 0, L, sl, 0, sl,
      0, 0, D, 0, D / 2, Hr, 0, 0, D, 0, D / 2, Hr,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  buildBuildings() {
    this.roofs = [];
    this.buildingMeshes = [];
    const winMat = new THREE.MeshLambertMaterial({ color: '#3a2f28', emissive: '#ffcf6a', emissiveIntensity: 0 });
    this.nightMats.push(winMat);
    const doorMat = new THREE.MeshLambertMaterial({ color: '#4a2c18' });
    for (const b of this.sim.S.world.buildings) {
      const g = new THREE.Group();
      g.position.set(wx(b.x) + (b.w - 1) / 2, 0, wz(b.z) + (b.d - 1) / 2);
      g.userData.building = b.id;
      const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.building = b.id; g.add(mesh); return mesh; };
      const wallTex = (tex, w, h) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w, h); return new THREE.MeshLambertMaterial({ map: t }); };
      const roof = (L, D, Hr, tex, y, rotate) => {
        const t = tex.clone(); t.needsUpdate = true;
        const mesh = new THREE.Mesh(this.prism(L, D, Hr), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
        mesh.userData.roofTex = t;
        if (rotate) mesh.rotation.y = Math.PI / 2;
        this.roofs.push(mesh);
        return add(mesh, 0, y, 0);
      };
      const faceVec = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] }[b.face] || [0, 1];
      const door = (w, d, hgt = 0.62) => {
        const m = add(new THREE.Mesh(new THREE.BoxGeometry(faceVec[0] ? 0.08 : 0.4, hgt, faceVec[1] ? 0.08 : 0.4), doorMat), 0, hgt / 2, 0);
        const dx = wx(b.door.x) - g.position.x, dz = wz(b.door.z) - g.position.z;
        m.position.x = faceVec[0] ? faceVec[0] * w / 2 : dx;
        m.position.z = faceVec[1] ? faceVec[1] * d / 2 : dz;
      };
      const windows = (w, d, y) => {
        const geo = new THREE.BoxGeometry(0.22, 0.22, 0.05);
        for (const s of [-1, 1]) {
          for (let i = 0; i < Math.max(1, Math.floor(w)); i++) {
            const x = -w / 2 + (i + 0.5) * (w / Math.max(1, Math.floor(w)));
            add(new THREE.Mesh(geo, winMat), x, y, s * (d / 2 + 0.01));
          }
          const wz_ = new THREE.Mesh(geo, winMat); wz_.rotation.y = Math.PI / 2;
          add(wz_, s * (w / 2 + 0.01), y, 0);
        }
      };
      const W_ = b.w - 0.25, D_ = b.d - 0.25;
      switch (b.type) {
        case 'house': case 'bakery': case 'smithy': case 'workshop': case 'tavern': {
          const wh = b.type === 'tavern' ? 1.5 : 1.15;
          add(new THREE.Mesh(new THREE.BoxGeometry(W_, wh, D_), wallTex(b.type === 'smithy' ? TEX.timber2 : TEX.timber, W_, wh)), 0, wh / 2, 0);
          const along = W_ >= D_;
          const rt = b.type === 'house' ? (b.roof === 'tile' ? TEX.tileRoof : TEX.thatch) : b.type === 'tavern' ? TEX.tileRoof : b.type === 'smithy' ? TEX.greyRoof : TEX.thatch;
          roof(along ? W_ + 0.35 : D_ + 0.35, along ? D_ + 0.4 : W_ + 0.4, b.type === 'tavern' ? 1.1 : 0.9, rt, wh, !along);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.28), new THREE.MeshLambertMaterial({ map: TEX.darkStone })), W_ * 0.25, wh + 0.6, D_ * 0.18);
          windows(W_, D_, wh * 0.6);
          door(W_, D_);
          if (b.type !== 'house') {
            const sign = add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.05), new THREE.MeshLambertMaterial({ color: { bakery: '#e0b060', smithy: '#555a60', tavern: '#c9a23a', workshop: '#8a5a34' }[b.type] })), 0, 1.0, 0);
            sign.position.x = faceVec[0] ? faceVec[0] * (W_ / 2 + 0.15) : 0.5;
            sign.position.z = faceVec[1] ? faceVec[1] * (D_ / 2 + 0.15) : 0.5;
            if (faceVec[0]) sign.rotation.y = Math.PI / 2;
          }
          if (b.type === 'smithy') add(new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.2), new THREE.MeshLambertMaterial({ color: '#333' })), faceVec[0] * (W_ / 2 + 0.45), 0.15, faceVec[1] * (D_ / 2 + 0.45));
          if (b.type === 'workshop') for (let i = 0; i < 3; i++) { const log = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), new THREE.MeshLambertMaterial({ color: '#8a5a34' })), -W_ / 2 - 0.35, 0.1 + i * 0.16, (i - 1) * 0.1); log.rotation.x = Math.PI / 2; }
          break;
        }
        case 'hall': {
          const wh = 1.9;
          const bw = W_ - 1.4, bd = D_ - 1.6;
          add(new THREE.Mesh(new THREE.BoxGeometry(bw, wh, bd), wallTex(TEX.stone, bw, wh)), 0.4, wh / 2, 0.3);
          const rm = roof(bw + 0.4, bd + 0.5, 1.3, TEX.slate, wh, false); rm.position.x = 0.4; rm.position.z = 0.3;
          windows(bw, bd, 1.2);
          windows(bw, bd, 0.55);
          const tower = add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 4.4, 8), wallTex(TEX.stone, 4, 3)), -1.6, 2.2, -1.4);
          tower.userData.building = b.id;
          const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.3, 8), new THREE.MeshLambertMaterial({ map: TEX.slate.clone() }));
          cone.material.map.needsUpdate = true; cone.material.map.repeat.set(4, 2);
          cone.userData.roofTex = cone.material.map; this.roofs.push(cone);
          add(cone, -1.6, 4.4 + 1.15, -1.4);
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
            const wmesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.05), winMat), -1.6 + Math.sin(a) * 1.02, 3.4, -1.4 + Math.cos(a) * 1.02);
            wmesh.rotation.y = a;
          }
          const bell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.25, 8), new THREE.MeshLambertMaterial({ color: '#c9a23a' })), -1.6, 4.0, -0.35);
          this.bell = bell;
          door(W_, D_, 0.8);
          break;
        }
        case 'chapel': {
          const wh = 1.6;
          add(new THREE.Mesh(new THREE.BoxGeometry(W_, wh, D_), wallTex(TEX.stone, W_, wh)), 0, wh / 2, 0);
          roof(D_ + 0.3, W_ + 0.4, 1.2, TEX.greyRoof, wh, true);
          add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.6), wallTex(TEX.stone, 1, 1)), 0, wh + 1.0, D_ / 2 - 0.5);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 4), new THREE.MeshLambertMaterial({ map: TEX.greyRoof.clone() }));
          sp.material.map.needsUpdate = true; sp.userData.roofTex = sp.material.map; this.roofs.push(sp);
          sp.rotation.y = Math.PI / 4;
          add(sp, 0, wh + 2.1, D_ / 2 - 0.5);
          windows(W_, D_, 0.9);
          door(W_, D_, 0.8);
          break;
        }
        case 'market': {
          for (let i = 0; i < 3; i++) {
            const x = -W_ / 2 + 0.6 + i * 1.3;
            add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.6), new THREE.MeshLambertMaterial({ map: TEX.wood })), x, 0.25, 0.1);
            for (const [gx, gc] of [[-0.25, '#e0b060'], [0, '#d9463a'], [0.25, '#6cb846']]) add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.18), new THREE.MeshLambertMaterial({ color: gc })), x + gx, 0.56, 0.1);
            const aw = add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 0.9), new THREE.MeshLambertMaterial({ map: i % 2 ? TEX.awning2 : TEX.awning })), x, 1.15, 0.0);
            aw.rotation.x = -0.35;
            for (const px of [-0.5, 0.5]) add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshLambertMaterial({ color: '#5a3a22' })), x + px, 0.6, -0.35);
          }
          break;
        }
        case 'well': {
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.45, 8), new THREE.MeshLambertMaterial({ map: TEX.darkStone })), 0, 0.22, 0);
          add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 8), new THREE.MeshLambertMaterial({ color: '#2f6394' })), 0, 0.4, 0);
          for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), new THREE.MeshLambertMaterial({ color: '#5a3a22' })), s * 0.38, 0.7, 0);
          roof(1.0, 0.9, 0.35, TEX.thatch, 1.1, false);
          break;
        }
      }
      this.scene.add(g);
      this.buildingMeshes.push(g);
    }
  }

  // ---------- 木 ----------
  buildTrees() {
    const world = this.sim.S.world;
    const list = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (world.tiles[z * W + x] === T.TREE) list.push([x, z]);
    const hsh = (x, z) => ((x * 73856093) ^ (z * 19349663)) >>> 0;
    const pines = list.filter(([x, z]) => hsh(x, z) % 10 < 6), rounds = list.filter(([x, z]) => hsh(x, z) % 10 >= 6);
    const trunkGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16); trunkGeo.translate(0, 0.25, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4226' });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const c1 = new THREE.ConeGeometry(0.5, 0.9, 6); c1.translate(0, 0.8, 0);
    const c2 = new THREE.ConeGeometry(0.36, 0.75, 6); c2.translate(0, 1.3, 0);
    this.pineMat = new THREE.MeshLambertMaterial({ color: '#2f6b3a', flatShading: true });
    this.pineMat2 = new THREE.MeshLambertMaterial({ color: '#3d8247', flatShading: true });
    const p1 = new THREE.InstancedMesh(c1, this.pineMat, pines.length);
    const p2 = new THREE.InstancedMesh(c2, this.pineMat2, pines.length);
    const cr = new THREE.IcosahedronGeometry(0.48, 0); cr.translate(0, 0.85, 0);
    this.crownMat = new THREE.MeshLambertMaterial({ color: '#4d9a3c', flatShading: true });
    const rc = new THREE.InstancedMesh(cr, this.crownMat, rounds.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let ti = 0;
    const place = (mesh, i, x, z) => {
      const h = hsh(x, z);
      const sc = 0.85 + (h % 100) / 250;
      p.set(wx(x) + ((h >> 3) % 10 - 5) / 40, 0, wz(z) + ((h >> 7) % 10 - 5) / 40);
      q.setFromEuler(e.set(0, (h % 628) / 100, 0)); s.set(sc, sc, sc);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
      return m;
    };
    pines.forEach(([x, z], i) => { place(p1, i, x, z); place(p2, i, x, z); trunks.setMatrixAt(ti++, m); });
    rounds.forEach(([x, z], i) => { place(rc, i, x, z); trunks.setMatrixAt(ti++, m); });
    // 広場のリンデンの大樹
    for (const mesh of [trunks, p1, p2, rc]) { mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); }
    const big = new THREE.Group();
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6), trunkMat); tr.position.y = 0.7;
    const cm = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), this.crownMat); cm.position.y = 2.0;
    const cm2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), this.crownMat); cm2.position.set(0.6, 2.6, 0.3);
    for (const x of [tr, cm, cm2]) { x.castShadow = true; big.add(x); }
    big.position.set(wx(26), 0, wx(26));
    this.scene.add(big);
  }

  buildFences() {
    const world = this.sim.S.world;
    const pts = [];
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (world.tiles[z * W + x] === T.FENCE) pts.push([x, z]);
    for (const f of world.fences) pts.push([f.x, f.z]);
    const set = new Set(pts.map(([x, z]) => x + ',' + z));
    const mat = new THREE.MeshLambertMaterial({ color: '#7a5230' });
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.45, 0.1).translate(0, 0.22, 0), mat, pts.length);
    const rails = [];
    pts.forEach(([x, z], i) => {
      post.setMatrixAt(i, new THREE.Matrix4().makeTranslation(wx(x), 0, wz(z)));
      if (set.has(x + 1 + ',' + z)) rails.push([wx(x) + 0.5, wz(z), 0]);
      if (set.has(x + ',' + (z + 1))) rails.push([wx(x), wz(z) + 0.5, 1]);
    });
    const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.05), mat, rails.length * 2);
    const m = new THREE.Matrix4();
    rails.forEach(([x, z, rot], i) => {
      for (let k = 0; k < 2; k++) {
        m.makeRotationY(rot ? Math.PI / 2 : 0).setPosition(x, 0.16 + k * 0.17, z);
        railMesh.setMatrixAt(i * 2 + k, m);
      }
    });
    post.castShadow = railMesh.castShadow = true;
    this.scene.add(post, railMesh);
  }

  buildLamps() {
    const lampMat = new THREE.MeshLambertMaterial({ color: '#40362c', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.nightMats.push(lampMat);
    for (const l of this.sim.S.world.lamps) {
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), new THREE.MeshLambertMaterial({ color: '#2e2a26' }));
      pole.position.set(wx(l.x), 0.55, wz(l.z)); pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), lampMat);
      head.position.set(wx(l.x), 1.2, wz(l.z));
      this.scene.add(pole, head);
    }
    this.nightLights = [];
    for (const [x, z] of [[24, 24], [17, 26], [28, 20]]) {
      const pl = new THREE.PointLight('#ffb85a', 0, 7, 1.6);
      pl.position.set(wx(x), 1.6, wz(z));
      this.scene.add(pl);
      this.nightLights.push(pl);
    }
  }

  buildSheep() {
    const pa = this.sim.S.world.pasture;
    this.sheep = [];
    const body = new THREE.BoxGeometry(0.42, 0.28, 0.3), head = new THREE.BoxGeometry(0.14, 0.16, 0.16);
    const wool = new THREE.MeshLambertMaterial({ color: '#f4f1ea' }), face = new THREE.MeshLambertMaterial({ color: '#2e2622' });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, wool); b.position.y = 0.26; b.castShadow = true;
      const h = new THREE.Mesh(head, face); h.position.set(0.26, 0.32, 0);
      for (const [lx, lz] of [[-0.14, -0.09], [0.14, -0.09], [-0.14, 0.09], [0.14, 0.09]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), face); l.position.set(lx, 0.07, lz); g.add(l); }
      g.add(b, h);
      const x = pa.x0 + Math.random() * (pa.x1 - pa.x0), z = pa.z0 + Math.random() * (pa.z1 - pa.z0);
      g.position.set(wx(x), 0, wz(z));
      g.userData = { tx: x, tz: z, x, z, wait: Math.random() * 5 };
      this.scene.add(g);
      this.sheep.push(g);
    }
  }

  buildWeather() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * W; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * H; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.precip = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe3ff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
    this.precip.visible = false;
    this.scene.add(this.precip);
  }

  // ---------- 住人 ----------
  ageGroup(p) { const a = this.sim.ageOf(p); return a < 13 ? 'child' : a >= 64 ? 'elder' : 'adult'; }
  ensurePerson(p) {
    let e = this.people.get(p.id);
    const grp = this.ageGroup(p);
    if (e && e.grp === grp) return e;
    if (e) { this.scene.remove(e.sprite, e.shadow); e.sprite.material.map.dispose(); e.sprite.material.dispose(); }
    const tex = personTexture(p, grp);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
    const sprite = new THREE.Sprite(mat);
    sprite.center.set(0.5, 0);
    const age = this.sim.ageOf(p);
    const s = age < 3 ? 0.55 : grp === 'child' ? 0.7 + age * 0.02 : 1;
    sprite.scale.set(0.72 * s, 0.9 * s, 1);
    sprite.userData.person = p.id;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.2 * s, 10), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(sprite, shadow);
    e = { sprite, shadow, grp, lastX: 0, flip: false, phase: Math.random() * 6 };
    this.people.set(p.id, e);
    return e;
  }
  removePerson(id) {
    const e = this.people.get(id);
    if (!e) return;
    this.scene.remove(e.sprite, e.shadow);
    e.sprite.material.map.dispose(); e.sprite.material.dispose();
    this.people.delete(id);
  }

  personWorldPos(p) {
    if (p.inside) {
      const b = this.sim.building(p.inside);
      return new THREE.Vector3(wx(b.x) + (b.w - 1) / 2, b.type === 'hall' ? 2.4 : 1.8, wz(b.z) + (b.d - 1) / 2);
    }
    return new THREE.Vector3(wx(p.pos.x), 0, wz(p.pos.z));
  }

  // ---------- 毎フレーム ----------
  update(realDt, selectedId, followId) {
    const sim = this.sim;
    const si = sim.seasonIdx();
    if (si !== this.lastSeason) { this.applySeason(si); this.lastSeason = si; }
    const now = performance.now() / 1000;
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const camRight = new THREE.Vector3(-camDir.z, 0, camDir.x).normalize();
    for (const p of sim.living()) {
      const e = this.ensurePerson(p);
      const vis = !p.inside;
      e.sprite.visible = e.shadow.visible = vis;
      if (!vis) continue;
      const x = wx(p.pos.x), z = wz(p.pos.z);
      const moving = p.action && p.action.phase === 'walk' && !p.talk;
      const dx = x - e.sprite.position.x, dz = z - e.sprite.position.z;
      const sideways = dx * camRight.x + dz * camRight.z;
      if (Math.abs(sideways) > 0.001) e.flip = sideways < 0;
      e.sprite.material.map.repeat.x = e.flip ? -1 : 1;
      e.sprite.material.map.offset.x = e.flip ? 1 : 0;
      const bob = moving ? Math.abs(Math.sin(now * 10 + e.phase)) * 0.07 : p.action?.type === 'work' ? Math.abs(Math.sin(now * 4 + e.phase)) * 0.04 : 0;
      e.sprite.position.set(x, 0.02 + bob, z);
      e.shadow.position.set(x, 0.015, z);
    }
    for (const id of [...this.people.keys()]) if (!sim.S.people[id] || sim.S.people[id].deathYear != null) this.removePerson(id);

    // 選択・追従
    const sel = selectedId != null ? sim.S.people[selectedId] : null;
    if (sel && sel.deathYear == null) {
      const pos = this.personWorldPos(sel);
      this.selRing.visible = !sel.inside;
      this.selRing.position.set(pos.x, 0.03, pos.z);
      this.selRing.scale.setScalar(1 + Math.sin(now * 5) * 0.1);
      if (followId === selectedId) {
        const t = this.controls.target;
        const delta = new THREE.Vector3(pos.x - t.x, 0, pos.z - t.z).multiplyScalar(Math.min(1, realDt * 4));
        t.add(delta); this.camera.position.add(delta);
      }
    } else this.selRing.visible = false;

    // 昼と夜
    const h = sim.hour();
    const dayF = h < 5 ? 0 : h < 7 ? (h - 5) / 2 : h < 18 ? 1 : h < 20 ? 1 - (h - 18) / 2 : 0;
    const dusk = (h > 5 && h < 7.5) || (h > 17 && h < 20) ? 1 - Math.min(1, Math.abs(h - (h < 12 ? 6.2 : 18.5)) / 1.3) : 0;
    const sky = new THREE.Color('#0e1633').lerp(new THREE.Color('#8fd0ff'), dayF).lerp(new THREE.Color('#f29a5c'), dusk * 0.5);
    const weather = sim.S.weather;
    if (weather === 'rain' || weather === 'cloudy') sky.lerp(new THREE.Color('#7c8894'), weather === 'rain' ? 0.5 : 0.3);
    this.scene.background = sky;
    const ang = ((h - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(ang) * -30, Math.max(8, Math.sin(ang) * 40), 18);
    this.sun.intensity = 0.25 + dayF * (weather === 'sunny' ? 2.3 : 1.2);
    this.sun.color.set(dusk > 0.3 ? '#ffc08a' : dayF > 0.2 ? '#fff2d6' : '#8aa0ff');
    this.hemi.intensity = 0.45 + dayF * 0.9;
    this.hemi.color.set(dayF > 0.3 ? '#dff1ff' : '#5a6aa8');
    const night = 1 - dayF;
    for (const m of this.nightMats) m.emissiveIntensity = night * 1.6;
    for (const l of this.nightLights) l.intensity = night * 4;

    // 水面
    this.waterTex.offset.x = (now * 0.03) % 1;
    this.waterTex.offset.y = (Math.sin(now * 0.5) * 0.05);

    // 羊
    const pa = sim.S.world.pasture;
    for (const s of this.sheep) {
      const u = s.userData;
      if (u.wait > 0) { u.wait -= realDt; continue; }
      const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { u.wait = 2 + Math.random() * 6; u.tx = pa.x0 + Math.random() * (pa.x1 - pa.x0); u.tz = pa.z0 + Math.random() * (pa.z1 - pa.z0); continue; }
      const sp = Math.min(d, realDt * 0.5);
      u.x += (dx / d) * sp; u.z += (dz / d) * sp;
      s.position.set(wx(u.x), Math.abs(Math.sin(now * 8)) * 0.02, wz(u.z));
      s.rotation.y = Math.atan2(-dz, dx);
    }

    // 雨・雪
    const precip = weather === 'rain' || weather === 'snow';
    this.precip.visible = precip;
    if (precip) {
      const pos = this.precip.geometry.attributes.position;
      const spd = weather === 'rain' ? 16 : 1.6;
      this.precip.material.color.set(weather === 'rain' ? '#bcd6f5' : '#ffffff');
      this.precip.material.size = weather === 'rain' ? 1.5 : 2.5;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - spd * realDt;
        if (y < 0) y += 14;
        pos.setY(i, y);
        if (weather === 'snow') pos.setX(i, pos.getX(i) + Math.sin(now + i) * 0.004);
      }
      pos.needsUpdate = true;
    }
    if (this.bell) this.bell.rotation.z = Math.sin(now * 2) * 0.05;

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // 画面座標
  project(v) {
    const p = v.clone().project(this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && p.z > -1 };
  }
  spriteTop(p) {
    const e = this.people.get(p.id);
    if (!e || p.inside) return this.personWorldPos(p);
    return e.sprite.position.clone().add(new THREE.Vector3(0, e.sprite.scale.y + 0.1, 0));
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const sprites = [...this.people.values()].filter((e) => e.sprite.visible).map((e) => e.sprite);
    const hitP = this.raycaster.intersectObjects(sprites, false);
    if (hitP.length) return { person: hitP[0].object.userData.person };
    // スプライトを少し広めに判定
    let best = null, bestD = 22;
    for (const e of this.people.values()) {
      if (!e.sprite.visible) continue;
      const s = this.project(e.sprite.position.clone().add(new THREE.Vector3(0, 0.4, 0)));
      const d = Math.hypot(s.x - (clientX - rect.left), s.y - (clientY - rect.top));
      if (d < bestD) { bestD = d; best = e.sprite.userData.person; }
    }
    if (best != null) return { person: best };
    const hitB = this.raycaster.intersectObjects(this.buildingMeshes, true);
    if (hitB.length) {
      let o = hitB[0].object;
      while (o && o.userData.building == null) o = o.parent;
      if (o) return { building: o.userData.building };
    }
    return null;
  }

  rotateBy(rad) {
    const t = this.controls.target, c = this.camera.position;
    const off = c.clone().sub(t);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    c.copy(t).add(off);
  }
  topView() {
    const t = this.controls.target;
    this.camera.position.set(t.x + 0.01, t.y + 45, t.z + 0.01);
  }
  isoView() {
    const t = this.controls.target;
    this.camera.position.set(t.x + 26, t.y + 30, t.z + 26);
  }
  lowView() {
    const t = this.controls.target, c = this.camera.position;
    const off = c.clone().sub(t); off.y = 0; off.normalize().multiplyScalar(40);
    this.camera.position.set(t.x + off.x, t.y + 9, t.z + off.z);
  }
  focusOn(p) {
    const pos = this.personWorldPos(p);
    const t = this.controls.target;
    const delta = new THREE.Vector3(pos.x - t.x, 0, pos.z - t.z);
    t.add(delta); this.camera.position.add(delta);
    if (this.camera.zoom < 2.5) { this.camera.zoom = 2.5; this.camera.updateProjectionMatrix(); }
  }
}
