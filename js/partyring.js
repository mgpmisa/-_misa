// パーティの輪：ギルドで組んだパーティの全員の足元に、パーティごとの色の細い輪を出す。
// 何人いても1回の描画で済むよう、輪は InstancedMesh（1つの形を位置と色だけ変えて並べる）で描く。
// 選択中の輪（selRing：黄色・太め・速く脈打つ）と見分けがつくよう、少し大きく・細く・半透明で、ゆっくり脈打つ。
//
// render.js からの呼び方：
//   constructor で  this.partyRings = new PartyRings(this.scene);
//   updateEntities の最初で  this.partyRings.begin();
//   人を置くたびに        if (isHuman && e.party != null) this.partyRings.add(sim, e, x, y, z);
//   updateEntities の最後で  this.partyRings.end(now);   // now は秒
import * as THREE from 'three';
import { partyRingOf } from './advclass.js';

const MAX = 512;

export class PartyRings {
  constructor(scene, max = MAX) {
    this.max = max;
    const g = new THREE.RingGeometry(0.44, 0.5, 24);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // 輪は画面の近くの人にしか出さないので、まとめて描く
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.n = 0;
    this.pos = new Float32Array(max * 4); // x, y, z, 位相
    this.col = new THREE.Color();
    this.colCache = new Map();             // 色の文字列 → THREE.Color（作り直さない）
    this.m4 = new THREE.Matrix4();
  }
  begin() { this.n = 0; }
  add(sim, e, x, y, z) {
    if (this.n >= this.max) return;
    const ring = partyRingOf(sim, e);
    if (!ring) return;
    const i = this.n++;
    this.pos[i * 4] = x; this.pos[i * 4 + 1] = y + 0.025; this.pos[i * 4 + 2] = z; this.pos[i * 4 + 3] = ring.key * 1.7;
    let c = this.colCache.get(ring.hex);
    if (!c) { c = new THREE.Color(ring.hex); this.colCache.set(ring.hex, c); }
    this.mesh.setColorAt(i, c);
  }
  end(now) {
    const n = this.n, M = this.m4;
    for (let i = 0; i < n; i++) {
      const s = 1 + Math.sin(now * 1.6 + this.pos[i * 4 + 3]) * 0.05; // ゆっくり脈打つ（仲間どうしは同じ拍子）
      M.makeScale(s, 1, s);
      M.setPosition(this.pos[i * 4], this.pos[i * 4 + 1], this.pos[i * 4 + 2]);
      this.mesh.setMatrixAt(i, M);
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
