// 刑場の見た目（開発部）：広場に組まれる処刑台
// 残酷な道具は描かない。低い木の台・手すり・鐘を吊るした枠・黒い旗だけで「刑場」とわかるようにする。
// 罪人・役人・見物人は、いつもの人のドット絵がそのまま台の上と周りに立つ。倒れる姿は render.js の「死ぬ」動きを使う。
// render.js は書き換えず、renderer.scene に自分の group を足すだけ。main.js から毎フレーム justiceFxFrame(renderer, sim) を呼ぶ。
import * as THREE from 'three';

export function justiceFxFrame(renderer, sim) {
  if (!renderer || !renderer.scene) return;
  let fx = renderer._justiceFx;
  if (!fx) fx = renderer._justiceFx = new JusticeFx(renderer, sim);
  fx.update();
}

class JusticeFx {
  constructor(r, sim) {
    this.r = r; this.sim = sim;
    this.group = new THREE.Group(); this.group.name = 'justiceFx';
    r.scene.add(this.group);
    this.items = new Map();
    this.next = 0;
    const M = r.mats || {};
    this.mPlank = M.planks || new THREE.MeshLambertMaterial({ color: '#8a6440' });
    this.mWood = M.wood || new THREE.MeshLambertMaterial({ color: '#5a3e26' });
    this.mDark = new THREE.MeshLambertMaterial({ color: '#2a2622' });
    this.mBell = new THREE.MeshLambertMaterial({ color: '#b08a3a', emissive: '#2a1e08' });
    this.mFlag = new THREE.MeshLambertMaterial({ color: '#1e1a22', side: THREE.DoubleSide });
    this.mCloth = new THREE.MeshLambertMaterial({ color: '#6a2a2a' });
  }
  shown() {
    const J = this.sim.S.justice;
    if (!J || !J.execs) return [];
    const today = this.sim.today;
    return J.execs.filter((e) => e.stage === 'built' || e.stage === 'led' || (e.stage === 'done' && e.doneDay === today && this.sim.hour() < 17));
  }
  build(e) {
    const g = new THREE.Group();
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    // 台：人のドット絵が隠れないよう、床板は薄く低くする（人は地面の高さに立つ）
    box(2.6, 0.04, 2.6, this.mPlank, 0, 0.02, 0);
    box(2.75, 0.02, 2.75, this.mDark, 0, 0.005, 0);
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) box(0.12, 0.55, 0.12, this.mWood, x, 0.27, z);
    // 手すり（前を開けて、左右と奥だけ）
    box(2.5, 0.06, 0.06, this.mWood, 0, 0.52, -1.2);
    box(0.06, 0.06, 2.5, this.mWood, -1.2, 0.52, 0);
    box(0.06, 0.06, 2.5, this.mWood, 1.2, 0.52, 0);
    // 奥の枠と鐘
    box(0.14, 2.0, 0.14, this.mWood, -0.9, 1.0, -1.3);
    box(0.14, 2.0, 0.14, this.mWood, 0.9, 1.0, -1.3);
    box(2.0, 0.14, 0.18, this.mWood, 0, 2.0, -1.3);
    const bellPivot = new THREE.Group(); bellPivot.position.set(0, 1.93, -1.3); g.add(bellPivot);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.32, 10, 1, true), this.mBell); bell.position.y = -0.2; bellPivot.add(bell);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.mBell); cap.position.y = -0.04; bellPivot.add(cap);
    // 黒い旗（刑の日のしるし）
    box(0.06, 1.4, 0.06, this.mWood, 1.35, 0.9, -1.35);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), this.mFlag); flag.position.set(1.66, 1.4, -1.35); g.add(flag);
    // 台のふちの布（低く）
    box(2.6, 0.05, 0.02, this.mCloth, 0, 0.03, 1.31);
    g.userData = { bellPivot, flag, id: e.id };
    const p = this.r.entityPos({ pos: { x: e.x, z: e.z } });
    g.position.set(p.x, p.y, p.z);
    return g;
  }
  update() {
    const now = performance.now();
    if (now >= this.next) {
      this.next = now + 500;
      const list = this.shown();
      const want = new Set(list.map((e) => e.id));
      for (const [id, g] of this.items) if (!want.has(id)) { this.group.remove(g); g.traverse((o) => o.geometry?.dispose?.()); this.items.delete(id); }
      for (const e of list) if (!this.items.has(e.id)) { const g = this.build(e); this.items.set(e.id, g); this.group.add(g); }
      this.stage = new Map(list.map((e) => [e.id, e.stage]));
    }
    const t = now / 1000;
    for (const [id, g] of this.items) {
      const st = this.stage?.get(id);
      const u = g.userData;
      // 刑の前後は鐘がゆっくり揺れ、旗がはためく
      u.bellPivot.rotation.z = st === 'led' ? Math.sin(t * 2.2) * 0.35 : st === 'done' ? Math.sin(t * 1.1) * 0.08 : 0;
      u.flag.rotation.y = Math.sin(t * 1.7 + id) * 0.25;
    }
  }
}
