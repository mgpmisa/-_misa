import { Sim } from './sim.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

const MIN_PER_SEC = 2; // 1倍速のとき、現実の1秒 = 村の2分

let sim, renderer, ui, last = performance.now();

function boot(fresh) {
  sim = new Sim();
  if (fresh || !sim.load()) {
    Sim.clearSave();
    sim.newWorld();
    sim.save();
  }
  const canvas = document.getElementById('view');
  renderer = new Renderer(canvas, sim);
  ui = new UI(sim, renderer);
  ui.onNewWorld = () => { Sim.clearSave(); location.reload(); };
  window.__village = { sim, renderer, ui };
  document.getElementById('loading').hidden = true;
}

function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let minutes = realDt * ui.speed * MIN_PER_SEC;
  while (minutes > 0) {
    const d = Math.min(0.5, minutes);
    sim.step(d);
    minutes -= d;
  }
  for (const e of sim.events) {
    if (e.type === 'say') ui.say(e.id, e.text);
    else if (e.type === 'log') ui.addLog(e.entry);
    else if (e.type === 'died' && ui.follow === e.id) ui.follow = null;
  }
  sim.events.length = 0;
  renderer.update(realDt, ui.selected, ui.follow);
  ui.update();
  requestAnimationFrame(frame);
}

function setupInput() {
  const canvas = document.getElementById('view');
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    const hit = renderer.pick(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.person != null) ui.select(hit.person, false);
    else if (hit.building != null) ui.selectBuilding(hit.building);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { ui.setSpeed(ui.speed ? 0 : 1); e.preventDefault(); }
    if (e.key === '1') ui.setSpeed(1);
    if (e.key === '2') ui.setSpeed(4);
    if (e.key === '3') ui.setSpeed(15);
    if (e.key === '4') ui.setSpeed(60);
    if (e.key === 'q') renderer.rotateBy(-Math.PI / 4);
    if (e.key === 'e') renderer.rotateBy(Math.PI / 4);
    if (e.key === 'Escape') ui.deselect();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sim.save(); });
}

setTimeout(() => {
  try {
    boot(false);
  } catch (err) {
    console.error(err);
    // 保存データが壊れていたら作り直す
    Sim.clearSave();
    boot(true);
  }
  setupInput();
  requestAnimationFrame((t) => { last = t; frame(t); });
}, 30);
