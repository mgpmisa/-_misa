// 人ごみの描画を軽くする道具（技術部）
// ・足元の影：人と生き物ひとりずつに円の板（描く回数がひとり1回）を置いていたのを、
//   1つの InstancedMesh にまとめて、全員の影を1回で描く。
//   render.js からは今までと同じように r.shadow.visible / r.shadow.position を使える（中身は軽い入れ物）。
import * as THREE from 'three';

export class ShadowPool {
  constructor(scene, max = 6000) {
    const g = new THREE.CircleGeometry(1, 10);
    g.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false });
    this.max = max;
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.m4 = new THREE.Matrix4();
    scene.add(this.mesh);
  }
  // render.js の r.shadow の代わり
  make(radius) {
    return { visible: true, radius, position: new THREE.Vector3(), geometry: { dispose() {} }, isShadowStub: true };
  }
  // 1フレームの最後に、見えている影だけを並べる
  flush(ents) {
    const m = this.m4, arr = this.mesh.instanceMatrix.array;
    let n = 0;
    for (const r of ents.values()) {
      const s = r.shadow;
      if (!s || !s.visible || !r.sprite.visible) continue;
      if (n >= this.max) break;
      const k = s.radius;
      m.makeScale(k, 1, k);
      m.setPosition(s.position.x, s.position.y, s.position.z);
      m.toArray(arr, n * 16);
      n++;
    }
    this.mesh.count = n;
    // 送るのは使った分だけ（全部を毎フレーム送らない）
    const im = this.mesh.instanceMatrix;
    if (n > 0) { im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true; }
    this.mesh.visible = n > 0;
  }
}

// ・遠くから見ているとき（大きく引いたとき）は、人と生き物をひとりずつの絵（テクスチャ）にせず、
//   色つきの点にして1回で描く。引いた地図で数千人ぶんの絵を作らない。
export class CrowdDots {
  constructor(scene, max = 16000) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.n = 0;
    scene.add(this.points);
  }
  begin() { this.n = 0; }
  add(x, y, z, hex) {
    if (this.n >= this.max) return;
    const i = this.n++ * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z;
    this.col[i] = ((hex >> 16) & 255) / 255; this.col[i + 1] = ((hex >> 8) & 255) / 255; this.col[i + 2] = (hex & 255) / 255;
  }
  end() {
    const n = this.n;
    this.points.visible = n > 0;
    if (!n) return;   // 点が無いときは何も送らない
    this.geo.setDrawRange(0, n);
    for (const a of [this.geo.attributes.position, this.geo.attributes.color]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 3); a.needsUpdate = true; }
  }
}
// 点の色：人は服の色の見当（身分で変える）、生き物は性質で変える
const RANK_COL = { king: 0xffd24a, royal: 0xffd24a, noble: 0xd070ff, knight: 0x9ab8ff, soldier: 0x7a90c0, citizen: 0xf0e0c0, commoner: 0xe8c8a0 };
export function dotColor(e, isHuman) {
  if (isHuman) return e.fight ? 0xff5040 : RANK_COL[e.rank] ?? 0xf0d8b0;
  if (e.hostile) return 0xff3a3a;
  if (e.owner != null || e.keeper != null) return 0xffffff;
  return 0xb08a5a;
}
