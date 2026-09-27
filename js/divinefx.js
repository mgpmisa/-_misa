// 神の御業の見た目（雷の光・癒しの光・雨雲・黄金の輝き・魔物が目覚める闇など）
// 画面の雨・雪と同じく、四角い点（大きさを距離で変えない Points）で描き、ドット絵の雰囲気に合わせる。
// render.js は書き換えず、renderer.scene に自分の group を足すだけ。毎フレーム update(dt) を divineui.js から呼ぶ。
import * as THREE from 'three';
import { W, H } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

export class DivineFx {
  constructor(renderer, sim) {
    this.r = renderer; this.sim = sim;
    this.group = new THREE.Group();
    this.group.name = 'divineFx';
    renderer.scene.add(this.group);
    this.list = [];
    this.markKey = '';
    this.marks = null;
    this.markT = 0;
  }
  // 地面の高さ（render.js の entityPos を借りる）
  ground(x, z) {
    try { const v = this.r.entityPos({ pos: { x, z } }); return v; } catch (e) { return new THREE.Vector3(x - W / 2 + 0.5, 0.5, z - H / 2 + 0.5); }
  }
  points(n, color, size = 3, opacity = 1) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.PointsMaterial({ color, size, sizeAttenuation: false, transparent: true, opacity, depthWrite: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    return p;
  }
  basic(color, opacity = 1, add = false) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
  }
  flash(color = '#fff8d0') {
    let el = document.getElementById('dvFlash');
    if (!el) { el = document.createElement('div'); el.id = 'dvFlash'; document.body.appendChild(el); }
    el.style.background = color;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  spawn(ev) {
    const base = this.ground(ev.x, ev.z);
    const root = new THREE.Group();
    root.position.copy(base);
    this.group.add(root);
    const e = { ev, root, t: 0, dur: 3, parts: [], step: null };
    const k = ev.kind;
    const big = ev.big ? 1.8 : ev.small ? 0.6 : 1;
    if (k === 'bolt') this.makeBolt(e);
    else if (k === 'heal') this.makeRise(e, ['#9cff7a', '#fff3a0', '#ffffff'], 70 * big, 1.2 * big, 3.2, 2.6, true);
    else if (k === 'rain') this.makeCloud(e, '#6c7888', '#bcd6f5', 5.5, false);
    else if (k === 'storm') this.makeCloud(e, '#3a3f52', '#9fb6d8', 5, true);
    else if (k === 'sun') this.makeSun(e);
    else if (k === 'plague') this.makeMist(e, ['#8ab04a', '#5a7a2a', '#b8d86a'], 4.5);
    else if (k === 'gold') this.makeGold(e, big);
    else if (k === 'dark') this.makeDark(e, ev.huge ? 3 : big);
    else if (k === 'love') this.makeRise(e, ['#ff8fb0', '#ff5a7a', '#ffd0dc'], 34, 0.7, 2.6, 2.2, false);
    else if (k === 'dream') this.makeSpiral(e, ['#bcd6ff', '#ffffff', '#d8c8ff'], 3);
    else if (k === 'courage') this.makeRise(e, ['#ff6a2a', '#ffb03a', '#fff0a0'], 50, 0.6, 2.2, 3.2, false);
    else if (k === 'doubt') this.makeMist(e, ['#5a3a6a', '#3a5a3a', '#8a6a9a'], 2.2, 1.2);
    else if (k === 'calm') this.makeRing(e, '#8fd0ff', ['#cfe8ff', '#8fd0ff'], 3.2);
    else if (k === 'souls') this.makeSouls(e);
    else if (k === 'relic') this.makeBeam(e, '#fff6c0', ['#ffe066', '#ffffff'], ev.small ? 1.5 : 3.5);
    else if (k === 'bless') this.makeFall(e, ['#ffe066', '#fff6c0', '#e8a93a'], 3);
    else this.makeRise(e, ['#ffffff'], 30, 0.8, 2, 2, false);
    this.list.push(e);
    if (this.list.length > 24) this.kill(this.list.shift());
  }
  kill(e) {
    this.group.remove(e.root);
    e.root.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }

  // ---------- 形ごとの作り方 ----------
  makeBolt(e) {
    e.dur = 0.9;
    const pts = [new THREE.Vector3(rnd(-1, 1), 16, rnd(-1, 1))];
    let y = 16;
    while (y > 0.2) { y = Math.max(0.1, y - rnd(1.2, 2.4)); const last = pts[pts.length - 1]; pts.push(new THREE.Vector3(y > 0.2 ? last.x + rnd(-0.9, 0.9) : 0, y, y > 0.2 ? last.z + rnd(-0.9, 0.9) : 0)); }
    const core = this.basic('#fffbe0', 1), glow = this.basic('#ffe066', 0.45, true);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), len = d.length();
      for (const [w, mat] of [[0.14, core], [0.42, glow]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(UP, d.normalize());
        e.root.add(m);
      }
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.4, 12), this.basic('#ffb03a', 0.8, true));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; e.root.add(ring);
    const sp = this.points(24, '#ffe066', 3);
    e.root.add(sp);
    const pos = sp.geometry.attributes.position, vel = [];
    for (let i = 0; i < 24; i++) { pos.setXYZ(i, 0, 0.2, 0); vel.push([rnd(-3, 3), rnd(2, 5), rnd(-3, 3)]); }
    if (!e.ev.noflash) this.flash('#fff8d0');
    e.step = (dt, t) => {
      const on = t < 0.12 || (t > 0.2 && t < 0.32) || (t > 0.45 && t < 0.52);
      core.opacity = on ? 1 : 0.15; glow.opacity = on ? 0.5 : 0.05;
      ring.scale.setScalar(1 + t * 2); ring.material.opacity = Math.max(0, 0.8 - t);
      for (let i = 0; i < 24; i++) { vel[i][1] -= 9 * dt; pos.setXYZ(i, pos.getX(i) + vel[i][0] * dt, Math.max(0.05, pos.getY(i) + vel[i][1] * dt), pos.getZ(i) + vel[i][2] * dt); }
      pos.needsUpdate = true;
    };
  }
  makeRise(e, colors, n, r, dur, speed, ring) {
    e.dur = dur;
    n = Math.round(n);
    const sets = colors.map((c) => { const p = this.points(Math.ceil(n / colors.length), c, 3); e.root.add(p); return p; });
    const seeds = sets.map((p) => { const a = []; const pos = p.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const ang = rnd(0, 6.28), rr = rnd(0, r); a.push([Math.cos(ang) * rr, rnd(-dur, 0), Math.sin(ang) * rr, rnd(0.6, 1.2)]); } return a; });
    let beam = null, rg = null;
    if (ring) {
      beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, 6, 10, 1, true), this.basic('#fff6c0', 0.18, true));
      beam.position.y = 3; e.root.add(beam);
      rg = new THREE.Mesh(new THREE.RingGeometry(r * 0.6, r * 0.9, 16), this.basic('#9cff7a', 0.7, true));
      rg.rotation.x = -Math.PI / 2; rg.position.y = 0.06; e.root.add(rg);
    }
    e.step = (dt, t) => {
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) { const s = seeds[k][i]; const y = (t + s[1]) * speed * s[3]; pos.setXYZ(i, s[0] * (1 + Math.max(0, y) * 0.08), y < 0 ? -99 : y + 0.2, s[2] * (1 + Math.max(0, y) * 0.08)); }
        pos.needsUpdate = true;
        p.material.opacity = Math.min(1, (dur - t) * 1.5);
      });
      if (beam) { beam.material.opacity = 0.2 * Math.min(1, (dur - t)); }
      if (rg) { rg.scale.setScalar(1 + t * 0.6); rg.material.opacity = Math.max(0, 0.7 - t / dur); }
    };
  }
  makeCloud(e, cloudCol, dropCol, dur, bolts) {
    e.dur = dur;
    const cloud = new THREE.Group();
    const mat = this.basic(cloudCol, 0.92);
    for (let i = 0; i < 9; i++) { const s = rnd(1.2, 2.4); const m = new THREE.Mesh(new THREE.BoxGeometry(s * 1.4, s * 0.7, s), mat); m.position.set(rnd(-2.2, 2.2), rnd(-0.3, 0.4), rnd(-1.6, 1.6)); cloud.add(m); }
    cloud.position.y = 8; e.root.add(cloud);
    const n = 160, drops = this.points(n, dropCol, 2, 0.9), pos = drops.geometry.attributes.position;
    for (let i = 0; i < n; i++) pos.setXYZ(i, rnd(-3, 3), rnd(0, 7.5), rnd(-2.4, 2.4));
    e.root.add(drops);
    let nextBolt = 0.6;
    e.step = (dt, t) => {
      const fade = Math.min(1, t * 2, (dur - t) * 1.2);
      mat.opacity = 0.92 * fade; drops.material.opacity = 0.9 * fade;
      cloud.position.x = Math.sin(t * 0.6) * 0.4;
      for (let i = 0; i < n; i++) { let y = pos.getY(i) - 14 * dt; if (y < 0.1) y += 7.4; pos.setY(i, y); }
      pos.needsUpdate = true;
      if (bolts && t > nextBolt && t < dur - 1) { nextBolt = t + rnd(0.7, 1.4); this.spawn({ kind: 'bolt', x: e.ev.x + rnd(-3, 3), z: e.ev.z + rnd(-3, 3), noflash: true }); }
    };
  }
  makeSun(e) {
    e.dur = 3.2;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 12), this.basic('#ffb03a', 0.9, true));
    disc.position.y = 10; e.root.add(disc);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.6, 12), this.basic('#ff6a2a', 0.6, true));
    halo.position.y = 10; e.root.add(halo);
    const heat = this.points(90, '#ff9a3a', 3, 0.8), pos = heat.geometry.attributes.position, seed = [];
    for (let i = 0; i < 90; i++) { seed.push([rnd(-5, 5), rnd(0, 3), rnd(-5, 5)]); }
    e.root.add(heat);
    e.step = (dt, t) => {
      const cam = this.r.camera; disc.quaternion.copy(cam.quaternion); halo.quaternion.copy(cam.quaternion);
      halo.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      const f = Math.min(1, t * 2, (3.2 - t) * 1.2);
      disc.material.opacity = 0.9 * f; halo.material.opacity = 0.6 * f; heat.material.opacity = 0.8 * f;
      for (let i = 0; i < 90; i++) { const s = seed[i]; pos.setXYZ(i, s[0] + Math.sin(t * 5 + i) * 0.15, (s[1] + t * 1.2) % 3 + 0.1, s[2]); }
      pos.needsUpdate = true;
    };
  }
  makeMist(e, colors, dur, rad = 5) {
    e.dur = dur;
    const sets = colors.map((c) => { const p = this.points(40, c, 4, 0.7); e.root.add(p); return p; });
    const seeds = sets.map(() => Array.from({ length: 40 }, () => [rnd(0, 6.28), rnd(0.3, rad), rnd(0.1, 1.6), rnd(0.2, 0.7)]));
    e.step = (dt, t) => {
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < 40; i++) { const s = seeds[k][i]; const a = s[0] + t * s[3]; const rr = s[1] * (0.6 + t / dur * 0.6); pos.setXYZ(i, Math.cos(a) * rr, s[2] + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * rr); }
        pos.needsUpdate = true;
        p.material.opacity = 0.7 * Math.min(1, t * 2, (dur - t));
      });
    };
  }
  makeGold(e, big) {
    e.dur = 4;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * big, 0.9 * big, 12, 10, 1, true), this.basic('#ffe066', 0.25, true));
    beam.position.y = 6; e.root.add(beam);
    const n = Math.round(60 * big);
    const sets = ['#ffe066', '#ffffff', '#e8a93a'].map((c) => { const p = this.points(Math.ceil(n / 3), c, 3); e.root.add(p); return p; });
    const seeds = sets.map((p) => Array.from({ length: p.geometry.attributes.position.count }, () => [rnd(-2, 2) * big, rnd(0.2, 3.5) * big, rnd(-2, 2) * big, rnd(0, 6.28)]));
    e.step = (dt, t) => {
      beam.material.opacity = 0.25 * Math.min(1, (4 - t));
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) { const s = seeds[k][i]; const on = Math.sin(t * 8 + s[3]) > 0; pos.setXYZ(i, s[0], on ? s[1] + t * 0.2 : -99, s[2]); }
        pos.needsUpdate = true;
        p.material.opacity = Math.min(1, (4 - t) * 1.2);
      });
    };
  }
  makeDark(e, big) {
    e.dur = 4.5;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.5 * big, 16), this.basic('#1a0e22', 0.7));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.08; e.root.add(disc);
    const sets = ['#3a1a4a', '#7a2a8a', '#0e0814', '#d9263a'].map((c) => { const p = this.points(45, c, 4, 0.9); e.root.add(p); return p; });
    const seeds = sets.map(() => Array.from({ length: 45 }, () => [rnd(0, 6.28), rnd(2, 6) * big, rnd(0, 5) * big, rnd(0.8, 2)]));
    e.step = (dt, t) => {
      const f = Math.min(1, t, (4.5 - t));
      disc.material.opacity = 0.7 * f; disc.scale.setScalar(0.4 + Math.min(1, t) * 0.6);
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < 45; i++) { const s = seeds[k][i]; const a = s[0] + t * s[3]; const rr = s[1] * Math.max(0.05, 1 - (t % 2.2) / 2.2); pos.setXYZ(i, Math.cos(a) * rr, s[2] * (1 - (t % 2.2) / 2.4) + 0.2, Math.sin(a) * rr); }
        pos.needsUpdate = true;
        p.material.opacity = 0.9 * f;
      });
    };
  }
  makeSpiral(e, colors, dur) {
    e.dur = dur;
    const sets = colors.map((c) => { const p = this.points(24, c, 3); e.root.add(p); return p; });
    e.step = (dt, t) => {
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < 24; i++) { const u = i / 24; const a = u * 12 + t * 3 + k * 2.1; const y = 0.6 + u * 3 + Math.sin(t * 2) * 0.2; const rr = 0.3 + u * 1.2; pos.setXYZ(i, Math.cos(a) * rr, y, Math.sin(a) * rr); }
        pos.needsUpdate = true;
        p.material.opacity = Math.min(1, t * 2, (dur - t) * 1.5);
      });
    };
  }
  makeRing(e, ringCol, colors, dur) {
    e.dur = dur;
    const rings = [0, 0.5, 1].map((d) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 20), this.basic(ringCol, 0.8, true)); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; m.userData.d = d; e.root.add(m); return m; });
    const sp = this.points(50, colors[0], 3); e.root.add(sp);
    const pos = sp.geometry.attributes.position, seed = Array.from({ length: 50 }, () => [rnd(0, 6.28), rnd(1, 10), rnd(0.2, 2)]);
    e.step = (dt, t) => {
      for (const m of rings) { const u = ((t + m.userData.d) % 1.5) / 1.5; m.scale.setScalar(1 + u * 12); m.material.opacity = (1 - u) * 0.8 * Math.min(1, dur - t); }
      for (let i = 0; i < 50; i++) { const s = seed[i]; pos.setXYZ(i, Math.cos(s[0] + t) * s[1], s[2] + Math.sin(t * 3 + i) * 0.3, Math.sin(s[0] + t) * s[1]); }
      pos.needsUpdate = true;
      sp.material.opacity = Math.min(1, dur - t);
    };
  }
  makeSouls(e) {
    e.dur = 6;
    const sets = ['#ffffff', '#fff3a0', '#cfe8ff'].map((c) => { const p = this.points(30, c, 3); e.root.add(p); return p; });
    const seeds = sets.map(() => Array.from({ length: 30 }, () => [rnd(-6, 6), rnd(-6, 6), rnd(0, 3), rnd(0.8, 1.6), rnd(0, 6.28)]));
    e.step = (dt, t) => {
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < 30; i++) { const s = seeds[k][i]; const y = Math.max(0, t - s[2]) * s[3] * 1.6; pos.setXYZ(i, s[0] + Math.sin(t * 1.5 + s[4]) * 0.3, t < s[2] ? -99 : y + 0.3, s[1] + Math.cos(t * 1.5 + s[4]) * 0.3); }
        pos.needsUpdate = true;
        p.material.opacity = Math.min(1, (6 - t));
      });
    };
  }
  makeBeam(e, beamCol, colors, dur) {
    e.dur = dur;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 30, 8, 1, true), this.basic(beamCol, 0.55, true));
    beam.position.y = 15; e.root.add(beam);
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 8, 1, true), this.basic(colors[0], 0.18, true));
    outer.position.y = 15; e.root.add(outer);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.04), this.basic('#e8eef8', 1));
    blade.position.y = 0.55; e.root.add(blade);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.08), this.basic('#e8a93a', 1));
    hilt.position.y = 1.12; e.root.add(hilt);
    const sp = this.points(40, colors[1], 3); e.root.add(sp);
    const pos = sp.geometry.attributes.position, seed = Array.from({ length: 40 }, () => [rnd(0, 6.28), rnd(0.2, 1.4), rnd(0, 4)]);
    e.step = (dt, t) => {
      const f = Math.min(1, (dur - t));
      beam.material.opacity = 0.55 * f * (0.8 + Math.sin(t * 20) * 0.2); outer.material.opacity = 0.18 * f;
      blade.position.y = Math.max(0.55, 8 - t * 20);
      hilt.position.y = blade.position.y + 0.57;
      for (let i = 0; i < 40; i++) { const s = seed[i]; pos.setXYZ(i, Math.cos(s[0] + t * 2) * s[1], (s[2] + t * 1.5) % 4, Math.sin(s[0] + t * 2) * s[1]); }
      pos.needsUpdate = true;
      sp.material.opacity = f;
      if (t > dur - 0.05) { blade.visible = hilt.visible = false; }
    };
  }
  makeFall(e, colors, dur) {
    e.dur = dur;
    const sets = colors.map((c) => { const p = this.points(50, c, 3); e.root.add(p); return p; });
    const seeds = sets.map(() => Array.from({ length: 50 }, () => [rnd(-8, 8), rnd(-8, 8), rnd(0, 8), rnd(1.5, 3)]));
    e.step = (dt, t) => {
      sets.forEach((p, k) => {
        const pos = p.geometry.attributes.position;
        for (let i = 0; i < 50; i++) { const s = seeds[k][i]; let y = s[2] + 6 - t * s[3]; y = ((y % 8) + 8) % 8; pos.setXYZ(i, s[0], y + 0.1, s[1]); }
        pos.needsUpdate = true;
        p.material.opacity = Math.min(1, t * 2, (dur - t) * 1.5);
      });
    };
  }

  // ---------- 置きっぱなしの印（地に突き立った伝説の武器・神の黄金の鉱脈） ----------
  updateMarks(t) {
    const D = this.sim.S.divine;
    const list = [];
    if (D) {
      for (const r of D.relics) list.push([r.x, r.z, 1]);
      for (const v of D.veins) if (v.au > 0) list.push([v.x, v.z, 2]);
    }
    const key = list.map((a) => a.join(',')).join(';');
    if (key !== this.markKey) {
      this.markKey = key;
      if (this.marks) { this.group.remove(this.marks); this.marks.geometry.dispose(); this.marks.material.dispose(); this.marks = null; }
      if (list.length) {
        const per = 10, p = this.points(list.length * per, '#ffe066', 3);
        const pos = p.geometry.attributes.position;
        p.userData.seed = [];
        list.forEach(([x, z, kind], j) => { const g = this.ground(x, z); for (let i = 0; i < per; i++) { const s = [g.x + rnd(-0.6, 0.6), g.y + rnd(0.1, kind === 1 ? 2.2 : 1.2), g.z + rnd(-0.6, 0.6), rnd(0, 6.28)]; p.userData.seed.push(s); pos.setXYZ(j * per + i, s[0], s[1], s[2]); } });
        this.marks = p; this.group.add(p);
      }
    }
    if (this.marks) {
      const pos = this.marks.geometry.attributes.position, sd = this.marks.userData.seed;
      for (let i = 0; i < sd.length; i++) { const s = sd[i]; const on = Math.sin(t * 5 + s[3]) > 0.2; pos.setXYZ(i, s[0], on ? s[1] + Math.sin(t + s[3]) * 0.1 : -99, s[2]); }
      pos.needsUpdate = true;
    }
  }

  update(dt) {
    this.markT += dt;
    for (const e of this.list.slice()) {
      e.t += dt;
      if (e.ev.id != null) { const ent = this.sim.entity(e.ev.id); if (ent && ent.pos && ent.inside == null) e.root.position.copy(this.ground(ent.pos.x, ent.pos.z)); }
      if (e.step) e.step(dt, e.t);
      if (e.t >= e.dur) { this.kill(e); this.list.splice(this.list.indexOf(e), 1); }
    }
    this.updateMarks(this.markT);
  }
}
