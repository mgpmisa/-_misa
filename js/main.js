import { Sim } from './sim.js';
import { showDiscovery } from './discovery.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { markTilesChanged } from './pathfar.js';
import { justiceFxFrame } from './justicefx.js';   // 広場の処刑台（3D）
import './anim_justice.js';   // 連行・裁き・群衆・刑場の人の動き（ドット絵）

const MIN_PER_SEC = 2; // 1倍速のとき、現実の1秒 = 世界の2分
const STEP_MIN = 0.5;  // 世界は0.5分きざみの「歩」で進める（ヘッドレス試験と同じきざみ）
const PEOPLE_CHUNK = 300; // 住人の処理は、この人数ごとに時間を確かめながら進める
let simAcc = 0;

let sim, renderer, ui, last = performance.now();
const msg = (t) => { const el = document.getElementById('loadMsg'); if (el) el.textContent = t; };
const tick = () => new Promise((r) => setTimeout(r, 30));

async function boot() {
  sim = new Sim();
  let loaded = false;
  try { msg('保存された世界を探しています……'); loaded = await sim.load(); } catch (e) { loaded = false; }
  if (!loaded) {
    await Sim.clearSave();
    msg('大陸を形づくっています……'); await tick();
    sim.newWorld(+(new URLSearchParams(location.search).get('seed')) || undefined, (m) => msg(m));
    await sim.save();
  }
  msg('景色を描いています……'); await tick();
  const canvas = document.getElementById('view');
  renderer = new Renderer(canvas, sim);
  ui = new UI(sim, renderer);
  ui.onNewWorld = async () => { await Sim.clearSave(); location.reload(); };
  sim.events.length = 0;
  window.__world = { sim, renderer, ui };
  document.getElementById('loading').hidden = true;
}

function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // 会話の文章づくりはカメラの近くと選択中の人に絞る
  const v = renderer.viewInfo();
  sim.focus = { x: v.x, z: v.z, r: v.r, ids: new Set(ui.selected != null ? [ui.selected] : []) };
  // 1歩の住人の処理は数フレームに分けて進め、1フレームで使う時間に上限を付ける（人口が多くても画面が止まらない）。
  // 1フレームで使う時間は8ms（1秒60コマのとき）から、コマの間隔の3割まで。遅れているとき（速い再生など）は30msまで広げる。
  simAcc = Math.min(simAcc + realDt * ui.speed * MIN_PER_SEC, STEP_MIN * (2 + ui.speed * 2));
  const budget = simAcc >= STEP_MIN * 2 ? 30 : Math.max(8, Math.min(30, realDt * 1000 * 0.3));
  const t0 = performance.now();
  while (performance.now() - t0 < budget) {
    if (sim._sl) { if (sim.stepPeople(PEOPLE_CHUNK)) sim.stepEnd(); continue; }
    if (simAcc >= STEP_MIN) { simAcc -= STEP_MIN; sim.stepBegin(STEP_MIN); continue; }
    break;
  }
  for (const e of sim.events) {
    switch (e.type) {
      case 'say': ui.say(e.id, e.text); if (ui.ivOpen != null) ui.iv.say(e.id, e.text); break;
      case 'log': ui.addLog(e.entry); break;
      case 'news': ui.onNews(e.entry); break;
      case 'discover': showDiscovery(ui, e.entry); break;
      case 'died': if (ui.follow === e.id) ui.follow = null; break;
      case 'hit': if (ui.ivOpen != null) ui.iv.hit(e.id); renderer.hit(e.id); if (ui.bubblesOn) ui.floatHit(e.id, e.dmg); break;
      case 'cbtag': if (ui.bubblesOn) { const n0 = ui.floaters.length; ui.floatHit(e.id, 0); const f = ui.floaters.length > n0 ? ui.floaters[ui.floaters.length - 1] : null; if (f) { f.el.textContent = e.text; f.el.style.color = e.col || '#ffd24a'; f.el.style.fontWeight = 'bold'; f.el.style.top = `${parseFloat(f.el.style.top) - 15 * (ui._cbTagN = ((ui._cbTagN || 0) + 1) % 3)}px`; f.until += 900; } } break;   // 状態異常・瀕死・部位の破壊など（combat.js）
      case 'building': renderer.addBuilding(e.id); break;
      case 'tiles': renderer.refreshTiles?.(e.list); markTilesChanged(sim.S.world, e.list); ui.redrawMinimapBase(); break;
      case 'borders': ui.redrawMinimapBase(); break;
    }
  }
  sim.events.length = 0;
  renderer.update(realDt, ui.selected, ui.follow);
  justiceFxFrame(renderer, sim);
  ui.updateInterior(realDt);
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
    if (hit.entity != null) ui.select(hit.entity, false);
    else if (hit.building != null) { ui.selectBuilding(hit.building); ui.openInterior(hit.building); }
    else if (hit.tile) ui.selectTile(hit.tile);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape' && ui.ivOpen != null) { ui.closeInterior(); return; }
    if (e.key === ' ') { ui.setSpeed(ui.speed ? 0 : 1); e.preventDefault(); }
    if (e.key === '1') ui.setSpeed(1);
    if (e.key === '2') ui.setSpeed(4);
    if (e.key === '3') ui.setSpeed(15);
    if (e.key === '4') ui.setSpeed(60);
    if (e.key === 'q') renderer.rotateBy(-Math.PI / 4);
    if (e.key === 'e') renderer.rotateBy(Math.PI / 4);
    if (e.key === 'm') renderer.worldView();
    if (e.key === 'Escape') ui.deselect();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) sim.save(); });
}

(async () => {
  try {
    await boot();
  } catch (err) {
    console.error(err);
    msg('保存データを読み込めなかったので、新しい世界を創ります……');
    await Sim.clearSave();
    location.reload();
    return;
  }
  setupInput();
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
