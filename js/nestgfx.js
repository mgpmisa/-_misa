// 生き物の巣の3Dの姿（動物・魔物の担当）。巣の形ごとに1つの InstancedMesh にまとめて描く（重さ対策）。
// render.js：constructor で new NestGfx(this, { wx, wz, topY })、update で this.ngfx.update()
// S.nestVer（巣が増えた・消えた）が変わったときだけ並べ直す。
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/BufferGeometryUtils.js';
import { W } from './world.js';

const MAX = 2048;
function colored(geo, col) {
  const g = geo.toNonIndexed ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const merge = (parts) => mergeGeometries(parts.map(([geo, col]) => colored(geo, col)), false);
// 形ごとの姿（低い多面体。ドット絵の世界に合わせて角ばらせる）
function shapes() {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  return {
    // 巣穴：土の盛り上がりと、黒い穴
    burrow: merge([[new THREE.CylinderGeometry(0.22, 0.34, 0.12, 7).translate(0, 0.06, 0), '#7a5a36'], [new THREE.CylinderGeometry(0.1, 0.1, 0.02, 7).translate(0.05, 0.125, 0.12), '#1a120a']]),
    // 洞穴：岩の塊と、黒い口
    cave: merge([[new THREE.DodecahedronGeometry(0.55, 0).scale(1.1, 0.8, 0.9).translate(0, 0.32, -0.1), '#6e6a64'], [B(0.34, 0.3, 0.06).translate(0, 0.17, 0.38), '#141210']]),
    // 寝床：枯れ草を丸く敷いたところ
    bed: merge([[new THREE.CylinderGeometry(0.42, 0.46, 0.05, 8).translate(0, 0.03, 0), '#c8b070'], [new THREE.TorusGeometry(0.36, 0.06, 4, 8).rotateX(Math.PI / 2).translate(0, 0.06, 0), '#a88c50']]),
    // 木の上の巣：幹にかけた小枝の巣
    tree: merge([[B(0.1, 1.2, 0.1).translate(0.12, 0.6, 0), '#5a3c22'], [new THREE.CylinderGeometry(0.2, 0.12, 0.12, 7).translate(0, 1.18, 0), '#8a6a3c'], [new THREE.CylinderGeometry(0.13, 0.13, 0.02, 7).translate(0, 1.245, 0), '#4a3218']]),
    // 岩山の巣：岩の上の大きな枝の巣
    cliff: merge([[new THREE.DodecahedronGeometry(0.38, 0).scale(1, 0.9, 1).translate(0, 0.3, 0), '#7a7670'], [new THREE.CylinderGeometry(0.3, 0.2, 0.12, 7).translate(0, 0.66, 0), '#8a6a3c'], [new THREE.CylinderGeometry(0.2, 0.2, 0.02, 7).translate(0, 0.725, 0), '#4a3218']]),
    // 水辺の巣：小石で囲んだ浅いくぼみ
    shore: merge([[new THREE.TorusGeometry(0.26, 0.07, 4, 7).rotateX(Math.PI / 2).translate(0, 0.05, 0), '#b8b0a0'], [new THREE.CylinderGeometry(0.22, 0.22, 0.03, 7).translate(0, 0.02, 0), '#d8c898']]),
    // 野営地：獣の皮の天幕と焚き火の跡
    camp: merge([[new THREE.ConeGeometry(0.42, 0.7, 5).translate(0, 0.35, 0), '#6a5a3a'], [B(0.14, 0.24, 0.02).translate(0, 0.12, 0.3), '#1a140c'], [new THREE.CylinderGeometry(0.14, 0.16, 0.05, 6).translate(0.5, 0.03, 0.3), '#3a3430']]),
    // 蜘蛛の巣：白い糸を張った輪
    web: merge([[new THREE.TorusGeometry(0.34, 0.025, 3, 8).translate(0, 0.42, 0), '#e8e8f0'], [new THREE.TorusGeometry(0.2, 0.02, 3, 8).translate(0, 0.42, 0.01), '#d8d8e8'], [B(0.7, 0.02, 0.02).translate(0, 0.42, 0), '#e8e8f0'], [B(0.02, 0.7, 0.02).translate(0, 0.42, 0), '#e8e8f0'], [B(0.05, 0.8, 0.05).translate(-0.36, 0.4, 0), '#5a3c22'], [B(0.05, 0.8, 0.05).translate(0.36, 0.4, 0), '#5a3c22']]),
  };
}

export class NestGfx {
  constructor(r, { wx, wz, topY }) {
    this.r = r; this.wx = wx; this.wz = wz; this.topY = topY;
    this.ver = -1; this.meshes = {};
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const [k, geo] of Object.entries(shapes())) {
      const m = new THREE.InstancedMesh(geo, mat, MAX);
      m.count = 0; m.frustumCulled = false; m.userData.nestKind = k;
      r.scene.add(m);
      this.meshes[k] = m;
    }
  }
  update() {
    const S = this.r.sim?.S;
    if (!S?.nests) return;
    const v = (S.nestVer || 0) + ':' + Object.keys(S.nests).length;
    if (v === this.ver) return;
    this.ver = v;
    const w = S.world, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const n = {};
    for (const k of Object.keys(this.meshes)) n[k] = 0;
    for (const nest of Object.values(S.nests)) {
      const m = this.meshes[nest.kind];
      if (!m || n[nest.kind] >= MAX) continue;
      const x = Math.round(nest.x), z = Math.round(nest.z);
      q.setFromAxisAngle(up, ((nest.id * 2654435761) >>> 0) % 628 / 100);   // 巣ごとに向きを変える
      const s = nest.sp === 'wyvern' || nest.sp === 'orc' ? 1.4 : nest.sp === 'rat' || nest.sp === 'frog' ? 0.6 : 1;
      m4.compose(new THREE.Vector3(this.wx(x) + 0.18, this.topY(w.hgt[z * W + x] || 0), this.wz(z) - 0.18), q, one.clone().multiplyScalar(s));
      m.setMatrixAt(n[nest.kind]++, m4);
    }
    for (const [k, m] of Object.entries(this.meshes)) { m.count = n[k]; m.instanceMatrix.needsUpdate = true; }
  }
}
