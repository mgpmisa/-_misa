// 画面のパネル・吹き出し・ミニマップ・ニュース・詳細
import { JOBS, GOODS, DAYS_PER_YEAR, DAYS_PER_SEASON, SEASONS, ERA, RANKS, SPECIES, TECHS, DESIRES, KINGDOMS, DEATH_CAUSES, ROLES } from './data.js';
import { W, H, T, TILE_NAME, biomeOf } from './world.js';
import { innerThought } from './speech.js';
import * as SPR from './sprites.js';
import { ITEMS, itemName, itemValue } from './items.js';
import { InteriorView } from './interior.js';
import { CHORE_LABEL, CHORE_GO, CHORE_PREF } from './chores.js';
import { calendarLabel } from './calendar.js';
import { estateOf, wealthOfHousehold, headOf, spendable } from './property.js';
import { partyRole } from './guild.js';
import { RANKS_ADV, QUEST_TYPE_NAME, isAdventurer, advRank } from './guild.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

const ACTION_LABEL = {
  sleep: '眠っている', eat: '食事をしている', shop: '市場で買い物をしている', tavern: '酒場で一杯やっている', plaza: '広場でくつろいでいる',
  stroll: '散歩している', pray: '祈っている', play: '遊んでいる', rest: '家で休んでいる', home: '家で過ごしている', festival: '祭りを楽しんでいる',
  wedding: '婚礼に出ている', funeral: '弔いに参列している', askfood: '食べ物を分けてもらっている', beg: '物乞いをしている', train: '鍛錬している',
  guild: 'ギルドで依頼を探している', report: 'ギルドに依頼の報告をしている', buygear: '鍛冶場で装備を選んでいる', gather: '素材を集めている', hunt: '賞金首を追っている', quest: '冒険している', school: '学校で学んでいる', storytell: '子どもたちに昔話を聞かせている', deliver: '知らせを届けている', perform: '歌っている', jail: '牢につながれている', steal: '盗みを働いている', rob: '旅人を襲っている', revenge: '恨みを晴らそうとしている',
  march: '前線で戦っている', crusade: '魔王討伐の旅をしている', defend: '町を守っている', flee: '逃げている', court: '想い人に会いに来ている', trade: '商いをしている', travel: '旅をしている', visit: '知り合いの家を訪ねている',
};
const INTERIOR_TYPES = new Set(['house', 'castle', 'church', 'tavern', 'bakery', 'smithy', 'workshop', 'market', 'guild', 'barracks', 'prison', 'magictower', 'mansion', 'clinic', 'school', 'stable', 'mill', 'lighthouse', 'observatory', 'mine', 'hideout', 'ruins', 'well', 'cave', 'pyramid', 'demoncastle']);
const ACTION_GO = {
  sleep: '寝床へ向かっている', eat: '食事をしに家へ向かっている', shop: '市場へ向かっている', tavern: '酒場へ向かっている', plaza: '広場へ向かっている',
  stroll: 'ぶらぶら歩いている', pray: '祈りに向かっている', play: '遊びに出かけるところ', rest: '家へ帰るところ', home: '家へ帰るところ', festival: '祭りの広場へ向かっている',
  wedding: '婚礼に向かっている', funeral: '弔いに向かっている', askfood: '食べ物を分けてもらいに行くところ', visit: '知り合いの家へ向かっている', work: '仕事場へ向かっている',
  quest: '冒険に向かっている', school: '学校へ向かっている', storytell: '広場へ向かっている', deliver: '知らせを届けに走っている', train: '鍛錬に向かっている', beg: '広場へ向かっている', steal: '闇にまぎれて移動している', rob: '獲物に忍び寄っている', revenge: '恨みの相手を探している',
  march: '前線へ行軍している', crusade: '魔王城を目指して旅している', defend: '町を守りに駆けつけている', flee: '必死に逃げている', court: '想い人のもとへ向かっている', trade: '隣町へ商いに向かっている', travel: '旅をしている', perform: '酒場へ向かっている',
};
const PREF_LABEL = {
  sleep: '眠ること', eat: '食事', shop: '買い物', tavern: '酒場', plaza: '広場でのんびり', stroll: '散歩', pray: '祈り', play: '遊び', rest: '家で休むこと', home: '家で過ごすこと',
  festival: '祭り', visit: '人を訪ねること', train: '鍛錬', work: '仕事', guild: 'ギルド通い', quest: '冒険', school: '勉強', storytell: '昔話', perform: '歌', court: '恋', trade: '商い', beg: '物乞い', steal: '盗み', buygear: '装備選び',
};
Object.assign(ACTION_LABEL, CHORE_LABEL); Object.assign(ACTION_GO, CHORE_GO); Object.assign(PREF_LABEL, CHORE_PREF);
const WEATHER = { sunny: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪' };
const KIND_NAME = { livestock: '家畜', wild: '野生動物', neutral: '中立の魔物', hostile: '敵対する魔物', demon: '魔王軍' };

export class UI {
  constructor(sim, renderer) {
    this.sim = sim; this.r = renderer;
    this.selected = null; this.selBuilding = null; this.selTile = null; this.follow = null;
    this.speed = 1; this.filter = 'near'; this.bubblesOn = true; this.attention = true;
    this.bubbles = new Map(); this.floaters = [];
    this.tab = 'log'; this.lastPanel = 0; this.memLimit = 25;
    this.bind();
    this.buildMinimap();
    this.renderLogAll();
    this.ticker = [];
  }

  bind() {
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    $('rotL').onclick = () => this.r.rotateBy(-Math.PI / 4);
    $('rotR').onclick = () => this.r.rotateBy(Math.PI / 4);
    $('viewTop').onclick = () => this.r.topView();
    $('viewIso').onclick = () => this.r.isoView();
    $('viewLow').onclick = () => this.r.lowView();
    $('viewWorld').onclick = () => { this.follow = null; this.r.worldView(); };
    $('menuBtn').onclick = () => { $('menu').hidden = !$('menu').hidden; };
    $('pixelSel').onchange = (e) => { this.r.setPixel(+e.target.value); if (this.iv) this.iv.setPixel(+e.target.value); };
    $('bubbleChk').onchange = (e) => { this.bubblesOn = e.target.checked; if (!this.bubblesOn) this.clearBubbles(); };
    $('shadowChk').checked = this.r.renderer.shadowMap.enabled;
    $('shadowChk').onchange = (e) => this.r.setShadows(e.target.checked);
    $('attnChk').onchange = (e) => { this.attention = e.target.checked; };
    $('newWorld').onclick = () => { $('newWorldConfirm').hidden = false; };
    $('newWorldYes').onclick = () => this.onNewWorld && this.onNewWorld();
    $('sideToggle').onclick = () => $('side').classList.toggle('closed');
    $('closeInsp').onclick = () => this.deselect();
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tabbody').forEach((x) => { x.hidden = x.id !== 'tab-' + this.tab; });
      this.refreshPanel(true);
    }));
    document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      this.filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      this.renderLogAll();
    }));
    $('search').addEventListener('input', () => this.refreshPanel(true));
    $('econTown').addEventListener('change', () => this.refreshPanel(true));
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pid]');
      if (t) { this.select(+t.dataset.pid, true); return; }
      const c = e.target.closest('[data-cid]');
      if (c) { this.select(c.dataset.cid, true); return; }
      const bt = e.target.closest('[data-bid]');
      if (bt) { this.selectBuilding(+bt.dataset.bid, true); return; }
      const g = e.target.closest('[data-goto]');
      if (g) { const [x, z] = g.dataset.goto.split(',').map(Number); this.follow = null; this.r.lookAt(x, z, Math.max(this.r.camera.zoom, 1.6)); return; }
      const sp = e.target.closest('[data-species]');
      if (sp) { this.findSpecies(sp.dataset.species); }
    });
    $('ticker').onclick = () => { const n = this.sim.S.news[this.sim.S.news.length - 1]; if (n && n.x != null) this.r.lookAt(n.x, n.z, 2); };
    if (window.innerWidth < 760) $('side').classList.add('closed');
    const sel = $('econTown');
    sel.innerHTML = this.sim.S.world.settlements.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  }

  setSpeed(s) {
    this.speed = s;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  }

  // ---------- 選択 ----------
  select(id, focus) {
    const e = this.sim.entity(id);
    if (!e) return;
    this.selected = id; this.selBuilding = null; this.selTile = null; this.memLimit = 25;
    if (focus && (e.deathYear == null) && e.pos) this.r.focusOn(e);
    $('inspector').hidden = false; $('menu').hidden = true;
    this.renderInspector(true);
  }
  selectBuilding(id, focus) {
    this.selBuilding = id; this.selected = null; this.selTile = null; this.follow = null;
    if (focus) { const b = this.sim.building(id); this.r.lookAt(b.door.x, b.door.z, Math.max(this.r.camera.zoom, 1.8)); }
    $('inspector').hidden = false; $('menu').hidden = true;
    this.renderInspector(true);
  }
  selectTile(t) { this.selTile = t; this.selected = null; this.selBuilding = null; $('inspector').hidden = false; this.renderInspector(true); }
  deselect() { this.selected = null; this.selBuilding = null; this.selTile = null; this.follow = null; $('inspector').hidden = true; }
  findSpecies(sp) {
    const t = this.r.viewInfo();
    let best = null, bd = 1e9;
    for (const c of Object.values(this.sim.S.creatures)) { if (c.sp !== sp || c.dormant) continue; const d = Math.hypot(c.pos.x - t.x, c.pos.z - t.z); if (d < bd) { bd = d; best = c; } }
    if (best) this.select(best.id, true);
  }

  // ---------- 時間 ----------
  timeLabel(t) {
    const d = Math.floor(t / 1440), doy = d % DAYS_PER_YEAR;
    const h = Math.floor((t % 1440) / 60), m = Math.floor(t % 60);
    return `${SEASONS[Math.floor(doy / DAYS_PER_SEASON)]}${(doy % DAYS_PER_SEASON) + 1}日 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  whenLabel(m) {
    const today = this.sim.today;
    if (m.t >= today) return '今日';
    const days = today - m.t;
    if (days < DAYS_PER_YEAR) return `${days}日前`;
    const years = Math.round(days / DAYS_PER_YEAR);
    return m.ageAt != null && m.ageAt >= 0 ? `${years}年前<br>${m.ageAt}歳` : `${years}年前`;
  }

  // ---------- ログ ----------
  logVisible(e) {
    if (this.filter === 'news') return e.kind === 'news';
    if (this.filter === 'all') return true;
    if (e.kind === 'news') return true;
    if (e.x == null) return e.kind !== 'talk';
    const v = this.r.viewInfo();
    const near = Math.abs(e.x - v.x) < v.r && Math.abs(e.z - v.z) < v.r;
    if (this.selected != null && e.ids && e.ids.includes(this.selected)) return true;
    return near;
  }
  logLi(e) {
    const li = document.createElement('li');
    li.className = e.kind;
    let text = esc(e.text);
    for (const id of e.ids || []) {
      const p = this.sim.S.people[id];
      if (p) text = text.replace(esc(p.given), `<span class="nm" data-pid="${id}">${esc(p.given)}</span>`);
    }
    const go = e.x != null ? ` data-goto="${Math.round(e.x)},${Math.round(e.z)}"` : '';
    li.innerHTML = `<span class="t"${go}>${this.timeLabel(e.t)}</span>${text}`;
    return li;
  }
  renderLogAll() {
    const ol = $('log');
    ol.innerHTML = '';
    for (const e of this.sim.S.log.filter((x) => this.logVisible(x)).slice(-150).reverse()) ol.appendChild(this.logLi(e));
  }
  addLog(e) {
    if (!this.logVisible(e)) return;
    const ol = $('log');
    ol.insertBefore(this.logLi(e), ol.firstChild);
    while (ol.children.length > 150) ol.removeChild(ol.lastChild);
  }
  onNews(n) {
    this.ticker.push(n);
    const el = $('ticker');
    el.textContent = `【速報】${n.text}`;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    if (this.attention && n.imp >= 3 && n.x != null && this.follow == null && !(this.r.userMoved && performance.now() - this.r.userMoved < 8000)) {
      this.r.lookAt(n.x, n.z, Math.max(1.4, Math.min(this.r.camera.zoom, 2.4)));
    }
  }

  // ---------- 吹き出し ----------
  say(id, text) {
    if (!this.bubblesOn || this.r.camera.zoom < 0.9) return;
    const p = this.sim.S.people[id];
    if (!p) return;
    let b = this.bubbles.get(id);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      $('bubbles').appendChild(el);
      b = { el };
      this.bubbles.set(id, b);
    }
    b.el.innerHTML = `<span class="who">${esc(p.given)}</span>${esc(text)}`;
    b.w = 0;
    b.until = performance.now() + Math.max(2600, text.length * 120) / Math.max(1, Math.sqrt(this.speed));
    b.el.classList.toggle('inside', p.inside != null);
  }
  clearBubbles() { for (const b of this.bubbles.values()) b.el.remove(); this.bubbles.clear(); }
  floatHit(id, dmg) {
    const e = this.sim.entity(id);
    if (!e || !e.pos) return;
    const s = this.r.project(this.r.spriteTop(e));
    if (!s.visible || this.floaters.length > 30) return;
    const el = document.createElement('div');
    el.className = 'hitnum'; el.textContent = `-${dmg}`;
    el.style.left = `${s.x + (Math.random() - 0.5) * 16}px`; el.style.top = `${s.y}px`;
    $('bubbles').appendChild(el);
    this.floaters.push({ el, until: performance.now() + 700 });
  }

  updateOverlay() {
    const now = performance.now();
    const placed = [];
    const list = [];
    for (const [id, b] of this.bubbles) {
      const p = this.sim.S.people[id];
      if (!p || p.deathYear != null || now > b.until) { b.el.remove(); this.bubbles.delete(id); continue; }
      const s = this.r.project(this.r.spriteTop(p));
      if (!s.visible) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      if (!b.w) { b.w = b.el.offsetWidth; b.h = b.el.offsetHeight; }
      let dx = 0;
      if (p.inside != null && p.talk) dx = p.talk.a === id ? -60 : 60;
      list.push({ b, x: s.x + dx, y: s.y - 4 });
    }
    // 吹き出しが重ならないように上へずらす
    list.sort((a, b) => b.y - a.y);
    for (const it of list) {
      const w = it.b.w, h = it.b.h;
      let x = it.x - w / 2, y = it.y - h;
      for (let k = 0; k < 12; k++) {
        const hit = placed.find((r) => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y);
        if (!hit) break;
        y = hit.y - h - 4;
      }
      placed.push({ x, y, w, h });
      it.b.el.style.left = `${x}px`; it.b.el.style.top = `${y}px`;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (now > f.until) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      f.el.style.top = `${parseFloat(f.el.style.top) - 0.6}px`;
    }
    let tag = this._tag;
    const sel = this.selected != null ? this.sim.entity(this.selected) : null;
    if (sel && sel.pos && sel.deathYear == null && sel.hp > 0 && !this.bubbles.has(sel.id)) {
      if (!tag) { tag = this._tag = document.createElement('div'); tag.className = 'tag'; $('bubbles').appendChild(tag); }
      const s = this.r.project(this.r.spriteTop(sel));
      const name = sel.given || sel.name;
      tag.textContent = sel.inside != null ? `${name}（${this.sim.building(sel.inside).name}の中）` : name;
      tag.style.left = `${s.x}px`; tag.style.top = `${s.y - 4}px`; tag.style.display = s.visible ? '' : 'none';
    } else if (tag) tag.style.display = 'none';
  }

  // ---------- ミニマップ ----------
  buildMinimap() {
    const cv = $('minimap');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const col = {
      [T.DEEP]: [22, 58, 110], [T.SEA]: [40, 100, 170], [T.BEACH]: [220, 200, 140], [T.GRASS]: [95, 165, 60], [T.FOREST]: [60, 125, 50], [T.DENSE]: [40, 95, 45],
      [T.JUNGLE]: [40, 120, 55], [T.DESERT]: [225, 195, 125], [T.SNOW]: [235, 240, 245], [T.ROCK]: [130, 125, 120], [T.PEAK]: [220, 225, 230], [T.RIVER]: [70, 140, 210],
      [T.ROAD]: [200, 155, 95], [T.FIELD]: [200, 170, 80], [T.PLAZA]: [170, 165, 155], [T.BLD]: [150, 80, 50], [T.WASTE]: [70, 45, 60], [T.BRIDGE]: [150, 110, 70],
      [T.FENCE]: [120, 90, 60], [T.SAVANNA]: [185, 175, 80], [T.DOCK]: [140, 100, 60], [T.LAVA]: [230, 80, 30], [T.PASTURE]: [110, 180, 70], [T.WALL]: [120, 120, 130], [T.SWAMP]: [80, 105, 60],
    };
    this.miniBase = { img, col };
    this.redrawMinimapBase();
    cv.addEventListener('click', (e) => {
      const r = cv.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W, z = ((e.clientY - r.top) / r.height) * H;
      this.follow = null;
      this.r.lookAt(x, z, Math.max(1.2, this.r.camera.zoom));
    });
    $('miniToggle').onclick = () => $('mini').classList.toggle('small');
    this.showDanger = true;
    $('dangerToggle').onclick = () => { this.showDanger = !this.showDanger; $('dangerToggle').classList.toggle('on', this.showDanger); };
  }
  redrawMinimapBase() {
    const w = this.sim.S.world, { img, col } = this.miniBase;
    for (let i = 0; i < W * H; i++) {
      const c = col[w.tiles[i]] || [0, 0, 0];
      let [r, g, b] = c;
      const k = w.kingdomOf[i];
      if (k >= 0 && !(w.tiles[i] === T.SEA || w.tiles[i] === T.DEEP)) {
        const kc = KINGDOMS[k].color;
        const kr = parseInt(kc.slice(1, 3), 16), kg = parseInt(kc.slice(3, 5), 16), kb = parseInt(kc.slice(5, 7), 16);
        r = r * 0.82 + kr * 0.18; g = g * 0.82 + kg * 0.18; b = b * 0.82 + kb * 0.18;
      }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
  }
  drawMinimap() {
    const cv = $('minimap'), g = cv.getContext('2d');
    g.putImageData(this.miniBase.img, 0, 0);
    const S = this.sim.S;
    for (const s of S.world.settlements) {
      g.fillStyle = S.towns[s.id].occupied ? '#5a1a2a' : '#fff';
      g.fillRect(s.x - 2, s.z - 2, 4, 4);
      g.strokeStyle = KINGDOMS[s.kingdom].color; g.strokeRect(s.x - 2.5, s.z - 2.5, 5, 5);
    }
    // 魔物の分布（危険区域）
    if (this.showDanger && S.dangerMap) {
      for (let i = 0; i < S.dangerMap.length; i++) {
        const v = S.dangerMap[i];
        if (v < 0.8) continue;
        g.fillStyle = `rgba(230,40,40,${Math.min(0.55, v / 12)})`;
        g.fillRect((i % (W / 8)) * 8, Math.floor(i / (W / 8)) * 8, 8, 8);
      }
    }
    const d = S.world.demon;
    g.fillStyle = S.demon?.active ? '#ff2a3a' : '#8a3a5a'; g.fillRect(d.x - 3, d.z - 3, 6, 6);
    for (const c of Object.values(S.creatures)) {
      if (c.dormant) continue;
      if (c.raid != null || c.named) { g.fillStyle = SPECIES[c.sp].kind === 'demon' ? '#ff3a5a' : '#ff9a2a'; g.fillRect(c.pos.x - 1, c.pos.z - 1, 2, 2); }
    }
    for (const p of this.sim.living()) {
      if (p.mission?.type === 'crusade') { g.fillStyle = '#ffe066'; g.fillRect(p.pos.x - 1.5, p.pos.z - 1.5, 3, 3); }
      else if (p.mission?.type === 'march') { g.fillStyle = KINGDOMS[this.sim.townOf(p).kingdom].color; g.fillRect(p.pos.x - 1, p.pos.z - 1, 2, 2); }
    }
    const sel = this.selected != null ? this.sim.entity(this.selected) : null;
    if (sel && sel.pos) { g.strokeStyle = '#ffe066'; g.strokeRect(sel.pos.x - 3, sel.pos.z - 3, 6, 6); }
    const v = this.r.viewInfo();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1;
    g.strokeRect(v.x - v.r, v.z - v.r * 0.7, v.r * 2, v.r * 1.4);
  }

  // ---------- 毎フレーム ----------
  update() {
    const d = this.sim.dateLabel();
    const selP = this.selected != null ? this.sim.entity(this.selected) : null;
    const v = this.r.viewInfo();
    const sid = selP?.s ?? this.sim.S.world.settlements.reduce((b, t) => (Math.hypot(t.x - v.x, t.z - v.z) < Math.hypot(b.x - v.x, b.z - v.z) ? t : b)).id;
    const cal = calendarLabel(this.sim, sid);
    const extra = this.sim.isFestival() ? '・収穫祭' : cal ? '・' + cal : this.sim.isRestDay() ? '・安息日' : '';
    const D = this.sim.S.demon;
    $('clock').textContent = `${d.era} ${d.season}の${d.day}日目 ${d.time}　${this.sim.S.wxHere ? `${this.sim.S.wxHere.name} ${this.sim.S.wxHere.temp}℃` : WEATHER[this.sim.S.weather]}${extra}　人口${this.sim.living().length}人${D?.active ? '　⚠魔王復活中' : ''}`;
    this.updateOverlay();
    const now = performance.now();
    if (now - this.lastPanel > 1000) { this.lastPanel = now; this.refreshPanel(false); this.renderInspector(false); this.drawMinimap(); }
  }

  refreshPanel(force) {
    if (this.tab === 'people') this.renderPeople();
    else if (this.tab === 'chron' && force) this.renderChron();
    else if (this.tab === 'econ') this.renderEcon();
    else if (this.tab === 'nations') this.renderNations();
    else if (this.tab === 'bestiary') this.renderBestiary();
    else if (this.tab === 'graves' && force) this.renderGraves();
    else if (this.tab === 'guild') this.renderGuild();
    else if (this.tab === 'log' && force) this.renderLogAll();
  }

  renderPeople() {
    const q = $('search').value.trim();
    const list = this.sim.living().filter((p) => !q || (p.given + p.family + (this.sim.townOf(p).name) + (JOBS[p.job]?.name || '')).includes(q))
      .sort((a, b) => (RANKS[b.rank]?.lv ?? 0) - (RANKS[a.rank]?.lv ?? 0) || a.s - b.s || a.family.localeCompare(b.family, 'ja')).slice(0, 200);
    const col = (m) => (m > 65 ? 'var(--moss)' : m > 40 ? 'var(--amber)' : 'var(--rose)');
    $('peopleList').innerHTML = list.map((p) => {
      const job = p.job ? JOBS[p.job].name : this.sim.ageOf(p) < 14 ? '子ども' : '隠居';
      return `<li data-pid="${p.id}"><span class="dot" style="background:${col(p.mood)}"></span><span>${esc(p.given)}・${esc(p.family)}<br><span class="sub">${this.sim.ageOf(p)}歳 ${job}・${esc(this.sim.townOf(p).name)}</span></span><span class="sub">${esc(this.actionText(p, true))}</span></li>`;
    }).join('');
  }

  renderChron() {
    const c = this.sim.S.chronicle.slice().reverse();
    $('chron').innerHTML = c.map((e) => `<li><span class="y">${e.y}年</span><span>${e.k != null && KINGDOMS[e.k] ? `<i class="kdot" style="background:${KINGDOMS[e.k].color}"></i>` : ''}${esc(e.text)}</span></li>`).join('');
  }

  renderNations() {
    const S = this.sim.S;
    const D = S.demon;
    let h = '';
    for (const k of S.kingdoms) {
      const king = S.people[k.kingId];
      const towns = S.world.settlements.filter((s) => s.kingdom === k.id);
      const pop = this.sim.living().filter((p) => this.sim.townOf(p).kingdom === k.id).length;
      const army = this.sim.living().filter((p) => ['knight', 'soldier'].includes(p.job) && this.sim.townOf(p).kingdom === k.id).length;
      const rel = S.kingdoms.filter((o) => o !== k).map((o) => `${esc(o.name.replace('王国', ''))} <b class="${k.relations[o.id] < -30 ? 'up' : k.relations[o.id] > 30 ? 'down' : ''}">${Math.round(k.relations[o.id])}</b>`).join('　');
      h += `<div class="nation" style="border-left-color:${k.color}">
        <div class="nname" data-goto="${S.world.settlements[k.capital].x},${S.world.settlements[k.capital].z}">${esc(k.name)}</div>
        <dl class="kv"><dt>${king?.sex === 'f' ? '女王' : '国王'}</dt><dd>${king ? `<span class="link" data-pid="${king.id}">${esc(this.sim.fullName(king))}</span>（${this.sim.ageOf(king)}歳）` : '空位'}</dd>
        <dt>人口</dt><dd>${pop}人・町${towns.length}つ・兵${army}人</dd>
        <dt>国庫</dt><dd>${Math.round(k.treasury)}銅貨・税率${Math.round(k.tax * 100)}%</dd>
        <dt>技術</dt><dd>${k.techs.map((t) => esc(TECHS.find((x) => x.id === t)?.name)).join('、') || 'なし'}（研究${Math.round(k.research)}）</dd>
        <dt>関係</dt><dd>${rel}</dd>
        ${k.war ? `<dt>戦争</dt><dd class="up">${esc(k.war.name)}（${this.sim.today - k.war.since}日目）</dd>` : ''}</dl></div>`;
    }
    const lord = D ? S.creatures[D.lordId] : null;
    h += `<div class="nation demon"><div class="nname" data-goto="${S.world.demon.x},${S.world.demon.z}">魔界ネクロス</div><dl class="kv">
      <dt>魔王</dt><dd>${lord ? `<span class="link" data-cid="${lord.id}">第${D.gen}代${esc(D.name)}</span>` : esc(D?.name)}</dd>
      <dt>状態</dt><dd>${D?.active ? `<b class="up">目覚めている</b>（魔力${Math.round(D.power)}・侵攻${D.raids}回）` : `眠っている（目覚めまで約${Math.max(0, D.awakenDay - this.sim.today)}日）`}</dd>
      <dt>討たれた数</dt><dd>${D?.defeated || 0}回${D?.resist?.length ? `（耐性：${D.resist.map((x) => x === 'holy' ? '聖なる力' : x).join('、')}）` : ''}</dd>
      <dt>占領中</dt><dd>${S.world.settlements.filter((s) => S.towns[s.id].occupied).map((s) => esc(s.name)).join('、') || 'なし'}</dd></dl></div>`;
    const parties = S.parties.filter((p) => !p.done);
    if (parties.length) h += `<div class="nation"><div class="nname">魔王討伐隊</div>${parties.map((p) => p.members.map((id) => S.people[id]).filter((x) => x && x.deathYear == null).map((x) => `<span class="link" data-pid="${x.id}">${esc(x.given)}</span>（Lv${x.lv}・${JOBS[x.job]?.name}）`).join('、')).join('<br>')}</div>`;
    const wanted = Object.entries(S.wanted).map(([id, w]) => ({ p: S.people[id], w })).filter((x) => x.p && x.p.deathYear == null);
    if (wanted.length) h += `<div class="nation"><div class="nname">お尋ね者</div>${wanted.map(({ p, w }) => `<span class="link" data-pid="${p.id}">${esc(p.given)}</span>（${esc(w.crime)}・賞金${w.bounty}）`).join('<br>')}</div>`;
    $('nations').innerHTML = h;
  }

  renderBestiary() {
    const S = this.sim.S;
    const count = {};
    for (const c of Object.values(S.creatures)) if (!c.dormant) count[c.sp] = (count[c.sp] || 0) + 1;
    const rows = Object.entries(SPECIES).filter(([k]) => count[k] || S.speciesMemory[k]).map(([k, d]) => {
      const m = S.speciesMemory[k] || {};
      return `<li data-species="${k}"><span class="kind k-${d.kind}">${KIND_NAME[d.kind]}</span><span>${esc(d.name)}</span><span class="sub">${count[k] || 0}体${m.deaths ? `・死${m.deaths}` : ''}${m.evolved ? `・進化${m.evolved}` : ''}${m.fear > 2 ? '・人を警戒' : ''}</span></li>`;
    });
    $('bestiary').innerHTML = rows.join('');
  }

  renderGuild() {
    const S = this.sim.S;
    const qs = (S.quests || []).slice().sort((a, b) => ({ open: 0, taken: 1, report: 2, done: 3, failed: 4 }[a.state] - { open: 0, taken: 1, report: 2, done: 3, failed: 4 }[b.state]) || b.posted - a.posted);
    const st = { open: '募集中', taken: '進行中', report: '報告待ち', done: '達成', failed: '期限切れ' };
    let h = `<h4 class="sub-h">依頼掲示板</h4><ul class="plist quests">`;
    h += qs.slice(0, 40).map((q) => `<li class="q-${q.state}"><span class="kind">${RANKS_ADV[q.rank]}</span><span>${esc(q.title)}<br><span class="sub">${QUEST_TYPE_NAME[q.type]}・${esc(this.sim.town(q.s).name)}のギルド・報酬${q.reward}銅貨${q.takenBy.length ? `・${q.takenBy.map((id) => S.people[id]).filter(Boolean).map((p) => `<span class="link" data-pid="${p.id}">${esc(p.given)}</span>`).join('、')}` : ''}</span></span><span class="sub">${st[q.state]}</span></li>`).join('') || '<li>依頼はまだない</li>';
    h += '</ul>';
    const advs = this.sim.living().filter((p) => isAdventurer(p)).sort((a, b) => (b.qp || 0) - (a.qp || 0) || b.lv - a.lv).slice(0, 20);
    h += `<h4 class="sub-h">冒険者ランキング</h4><ul class="plist">${advs.map((p) => `<li data-pid="${p.id}"><span class="kind">${RANKS_ADV[advRank(p)]}</span><span>${esc(this.sim.fullName(p))}<br><span class="sub">${esc(JOBS[p.job].name)}・Lv${p.lv}・達成${p.qp || 0}点${p.party ? `・パーティ「${esc(S.advParties?.[p.party]?.name || '')}」` : ''}</span></span><span class="sub">${esc(this.actionText(p, true))}</span></li>`).join('')}</ul>`;
    const parties = Object.values(S.advParties || {}).filter((pt) => pt.members.some((id) => S.people[id]?.deathYear == null));
    if (parties.length) h += `<h4 class="sub-h">冒険者パーティ</h4><ul class="plist">${parties.map((pt) => `<li><span class="kind">隊</span><span>「${esc(pt.name)}」<br><span class="sub">${pt.members.map((id) => S.people[id]).filter((x) => x && x.deathYear == null).map((x) => `<span class="link" data-pid="${x.id}">${esc(x.given)}${x.id === pt.leader ? '（リーダー）' : ''}</span>`).join('、')}・達成${pt.done || 0}件</span></span></li>`).join('')}</ul>`;
    $('guildBoard').innerHTML = h;
  }

  renderGraves() {
    const S = this.sim.S;
    const list = S.graves.slice().reverse().map((id) => S.people[id]).filter(Boolean);
    $('graves').innerHTML = list.length ? list.map((p) => `<li data-pid="${p.id}"><span>${esc(this.sim.fullName(p))}<br><span class="sub">${p.birthYear}〜${p.deathYear}年・${esc(DEATH_CAUSES[p.deathCause] || p.deathCause)}</span></span>${p.lastWords ? `<span class="sub">「${esc(p.lastWords)}」</span>` : ''}</li>`).join('') : '<li>まだ誰も亡くなっていない</li>';
  }

  renderEcon() {
    const S = this.sim.S;
    const sid = +$('econTown').value || 0;
    const m = S.towns[sid];
    const rows = Object.entries(GOODS).map(([k, g]) => {
      const pr = m.price[k], r = pr / g.base;
      const cls = r > 1.15 ? 'up' : r < 0.87 ? 'down' : '';
      return `<span>${g.name}</span><span class="${cls}">${pr.toFixed(1)}銅貨</span><span>${Math.floor(m.stock[k])}個</span>`;
    }).join('');
    const hhs = Object.values(S.households).filter((h) => h.s === sid);
    const avg = hhs.reduce((s, h) => s + h.money, 0) / Math.max(1, hhs.length);
    const poor = hhs.filter((h) => h.money < 20).length;
    const hungry = this.sim.living().filter((p) => p.s === sid && p.needs.hunger < 20).length;
    $('econ').innerHTML = `
      <div class="econ-grid"><span class="h">品物</span><span class="h">市場の値段</span><span class="h">在庫</span>${rows}</div>
      <canvas id="priceChart" width="300" height="90"></canvas>
      <p>黄＝パン　緑＝小麦（最近の値動き）</p>
      <p>世帯 ${hhs.length}　平均の蓄え ${avg.toFixed(0)}銅貨　町の蓄え ${Math.round(m.fund)}銅貨<br>
      貧しい世帯 ${poor}　お腹をすかせた人 ${hungry}人　盗み ${m.crime || 0}件${m.occupied ? '<br><b class="up">魔王軍に占領されている</b>' : ''}</p>`;
    const cv = $('priceChart'), g = cv.getContext('2d');
    const hist = m.history;
    if (hist.length > 1) {
      const max = Math.max(...hist.map((x) => Math.max(x.bread, x.wheat))) * 1.1;
      for (const [key, color] of [['bread', '#e8a93a'], ['wheat', '#7fb04a']]) {
        g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
        hist.forEach((x, i) => { const px = (i / (hist.length - 1)) * 296 + 2, py = 88 - (x[key] / max) * 84; i ? g.lineTo(px, py) : g.moveTo(px, py); });
        g.stroke();
      }
    }
  }

  actionText(p, short) {
    if (p.deathYear != null) return '故人';
    if (p.jail != null) return short ? '服役中' : `牢獄につながれている（あと${p.prisonDays}日）`;
    if (p.fight) { const o = this.sim.entity(p.fight.target); return short ? '戦闘中' : `${o ? (o.given || o.name) : '何か'}と戦っている`; }
    if (p.talk) { const o = this.sim.S.people[p.talk.a === p.id ? p.talk.b : p.talk.a]; return short ? '会話中' : `${o ? o.given : '誰か'}と話している`; }
    const a = p.action;
    if (!a) return '考えごと中';
    if (a.phase === 'walk') return short ? '移動中' : ACTION_GO[a.type] || '歩いている';
    if (a.type === 'work') return short ? '仕事中' : `${JOBS[p.job]?.name ?? ''}の仕事をしている`;
    const t = ACTION_LABEL[a.type] || '過ごしている';
    return short ? t.slice(0, 10) : t;
  }

  // ---------- 内装 ----------
  openInterior(id) {
    const b = this.sim.building(id);
    if (!b || !INTERIOR_TYPES.has(b.type)) return false;
    $('interior').hidden = false;
    if (!this.iv) {
      this.iv = new InteriorView($('ivCanvas'), this.sim);
      this.iv.setPixel(+$('pixelSel').value || 2);
      let down = null;
      $('ivCanvas').addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
      $('ivCanvas').addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
        if (moved > 6) return;
        const hit = this.iv.pick(e.clientX, e.clientY);
        if (hit && hit.entity != null) this.select(hit.entity, false);
      });
      $('ivCanvas').addEventListener('contextmenu', (e) => e.preventDefault());
      $('ivClose').onclick = () => this.closeInterior();
      window.addEventListener('resize', () => this.ivOpen != null && this.iv.resize());
    }
    this.iv.resize();
    const r = this.iv.open(id);
    this.ivOpen = id;
    $('ivTitle').textContent = r.title; $('ivSub').textContent = r.subtitle;
    return true;
  }
  closeInterior() {
    if (this.iv) this.iv.close();
    this.ivOpen = null;
    $('interior').hidden = true;
  }
  updateInterior(dt) {
    if (this.ivOpen == null) return;
    this.iv.update(dt);
    this.ivT = (this.ivT || 0) + dt;
    if (this.ivT > 2) { this.ivT = 0; const b = this.sim.building(this.ivOpen); const n = this.iv.countInside?.(); if (b && n) $('ivSub').textContent = `${$('ivSub').textContent.replace(/・中に.*$/, '')}・中に${n.people}人${n.monsters ? `・魔物${n.monsters}体` : ''}`; }
  }

  // ---------- 詳細パネル ----------
  renderInspector(force) {
    if ($('inspector').hidden) return;
    const body = $('inspBody');
    const scroll = $('inspector').scrollTop;
    if (this.selBuilding != null) {
      body.innerHTML = this.buildingHtml(this.sim.building(this.selBuilding));
      const eb = $('enterBtn');
      if (eb) eb.onclick = () => this.openInterior(this.selBuilding);
    }
    else if (this.selTile) body.innerHTML = this.tileHtml(this.selTile);
    else if (this.selected != null) {
      const e = this.sim.entity(this.selected);
      if (!e) { body.innerHTML = '<div class="psub">この生き物はもういない。</div>'; return; }
      if (typeof e.id === 'number') {
        if (e.deathYear == null && (!e.thought || force)) e.thought = innerThought(this.sim, e);
        body.innerHTML = this.personHtml(e);
      } else body.innerHTML = this.creatureHtml(e);
      this.drawPortrait(e);
      const fb = $('followBtn');
      if (fb) fb.onclick = () => { this.follow = this.follow === e.id ? null : e.id; this.renderInspector(false); };
      const lb = $('lookBtn');
      if (lb) lb.onclick = () => this.r.focusOn(e);
      const mb = $('moreMem');
      if (mb) mb.onclick = () => { this.memLimit += 40; this.renderInspector(false); };
    }
    $('inspector').scrollTop = force ? 0 : scroll;
  }

  drawPortrait(e) {
    const cv = $('portrait');
    if (!cv) return;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    let sheet = null;
    try { sheet = typeof e.id === 'number' ? SPR.drawPerson(e, { age: this.sim.ageOf(e) }) : SPR.drawCreature(e, SPECIES[e.sp]); } catch (err) { sheet = null; }
    if (!sheet) return;
    const u = sheet.userData || {};
    const fw = u.frameW || sheet.width / (u.cols || 1), fh = u.frameH || sheet.height / (u.rows || 1);
    const sc = Math.min(cv.width / fw, cv.height / fh);
    const dw = fw * sc, dh = fh * sc;
    g.drawImage(sheet, (u.cols >= 3 ? fw : 0), 0, fw, fh, (cv.width - dw) / 2, cv.height - dh, dw, dh);
  }

  pLink(p, label) {
    if (!p) return '—';
    const txt = esc(label ?? p.given);
    if (p.deathYear != null) return `<span class="link dead" data-pid="${p.id}">${txt}（${p.birthYear}〜${p.deathYear}）</span>`;
    return `<span class="link" data-pid="${p.id}">${txt}</span>`;
  }

  personHtml(p) {
    const sim = this.sim, S = sim.S;
    const age = sim.ageOf(p);
    const dead = p.deathYear != null;
    const job = p.job ? JOBS[p.job].name : p.formerJob ? `元${JOBS[p.formerJob].name}` : age < 14 ? '子ども' : '無職';
    const hh = !dead ? sim.hh(p) : null;
    const town = sim.townOf(p);
    let h = `<canvas id="portrait" class="portrait" width="64" height="80"></canvas>`;
    h += `<div class="pname">${p.heroTitle ? '勇者 ' : ''}${esc(p.given)}・${esc(p.family)}</div>`;
    h += `<div class="psub">${dead ? `${p.birthYear}年〜${p.deathYear}年（${age}歳・${esc(DEATH_CAUSES[p.deathCause] || p.deathCause)}）` : `${age}歳　${job}　<span class="rank">${RANKS[p.rank]?.name || ''}</span>`}${p.birthFamily !== p.family ? `<br>旧姓 ${esc(p.birthFamily)}` : ''}${p.origin ? `<br>${esc(p.origin)}の出` : ''}<br>${esc(town.name)}（${esc(KINGDOMS[town.kingdom]?.name || '')}）${hh && hh.house != null ? `・<span class="link" data-bid="${hh.house}">${esc(hh.name)}</span>` : hh?.street ? '・住む家がない' : hh?.wander ? '・旅暮らし' : ''}</div>`;
    if (dead) {
      if (p.lastWords) h += `<div class="thought"><b>最期に思っていたこと</b>${esc(p.lastWords)}</div>`;
    } else {
      h += `<div class="psub">いま：${esc(this.actionText(p))}${p.mission ? `<br>使命：${esc(ACTION_LABEL[p.mission.type] || p.mission.type)}` : ''}${S.wanted[p.id] ? `<br><b class="up">お尋ね者（${esc(S.wanted[p.id].crime)}）</b>` : ''}</div>`;
      h += `<div class="thought"><b>心の声</b>${esc(p.thought || '……')}</div>`;
      h += `<div class="row-btns"><button id="followBtn" class="${this.follow === p.id ? 'on' : ''}">${this.follow === p.id ? '追いかけ中' : '追いかける'}</button><button id="lookBtn">この人を見る</button></div>`;
      const bar = (label, v) => `<span>${label}</span><div class="bar"><i class="${v < 30 ? 'low' : v < 55 ? 'mid' : ''}" style="width:${Math.round(v)}%"></i></div>`;
      h += `<div class="section"><h4>7つの欲求（満たされ具合）</h4><div class="bars">${bar('気分', p.mood)}${Object.entries(DESIRES).map(([k, n]) => bar(n, p.needs[k])).join('')}</div>
        <dl class="kv" style="margin-top:8px"><dt>体力</dt><dd>${Math.round(p.hp)}/${p.maxhp}　Lv${p.lv}　攻${p.atk} 守${p.def}</dd><dt>家の蓄え</dt><dd>${Math.round(hh?.money || 0)}銅貨・食糧 ${Math.floor(hh?.food || 0)}食分</dd>${p.pregnant ? '<dt>身ごもり</dt><dd>お腹に子どもがいる</dd>' : ''}<dt>名声</dt><dd>${Math.round(p.fame)}</dd>
        </dl></div>`;
      // 装備と所持品
      const eq = p.eq || {};
      const slotName = { weapon: '武器', armor: '防具', shield: '盾', accessory: '装身具', tool: '道具' };
      const inv = (p.inv || []).filter((it) => !Object.values(eq).includes(it));
      const worth = (p.inv || []).reduce((s2, it) => s2 + itemValue(it), 0);
      h += `<div class="section"><h4>装備と持ち物</h4><dl class="kv">${Object.entries(slotName).map(([k, n]) => eq[k] ? `<dt>${n}</dt><dd>${esc(itemName(eq[k]))}${ITEMS[eq[k].id].atk ? `（攻+${Math.round(ITEMS[eq[k].id].atk * eq[k].q)}）` : ITEMS[eq[k].id].def ? `（守+${Math.round(ITEMS[eq[k].id].def * eq[k].q)}）` : ''}</dd>` : '').join('')}
        <dt>持ち物</dt><dd>${inv.map((it) => esc(itemName(it))).join('、') || 'なし'}</dd>${p.treasures?.length ? `<dt>宝物</dt><dd>${p.treasures.map(esc).join('、')}</dd>` : ''}
        <dt>所持金</dt><dd>${Math.round(p.purse || 0)}銅貨（持ち物の値打ち ${worth}銅貨）</dd></dl></div>`;
      if (isAdventurer(p)) {
        const q = (S.quests || []).find((x) => x.id === p.quest);
        const pt = p.party ? S.advParties?.[p.party] : null;
        h += `<div class="section"><h4>冒険者</h4><dl class="kv"><dt>ランク</dt><dd>${RANKS_ADV[advRank(p)]}（達成${p.qp || 0}点）</dd><dt>依頼</dt><dd>${q ? esc(q.title) : 'なし'}</dd>${pt ? `<dt>パーティ</dt><dd>「${esc(pt.name)}」${pt.members.map((id) => S.people[id]).filter((x) => x && x.id !== p.id && x.deathYear == null).map((x) => this.pLink(x)).join('、')}</dd>` : ''}</dl></div>`;
      }
      // 学んだこと
      const likes = Object.entries(p.q || {}).sort((a, b) => b[1] - a[1]);
      const skills = Object.entries(p.skill || {}).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]);
      const dangers = Object.entries(p.danger || {}).filter(([, v]) => v > 1.5).sort((a, b) => b[1] - a[1]).slice(0, 3);
      h += `<div class="section"><h4>経験から学んだこと</h4><dl class="kv">
        <dt>好きな過ごし方</dt><dd>${likes.filter(([, v]) => v > 0.05).slice(0, 3).map(([k]) => esc(PREF_LABEL[k] || k)).join('、') || 'まだ手探り'}</dd>
        <dt>苦手な過ごし方</dt><dd>${likes.filter(([, v]) => v < -0.05).slice(-2).map(([k]) => esc(PREF_LABEL[k] || k)).join('、') || '特になし'}</dd>
        <dt>腕前</dt><dd>${skills.map(([k, v]) => `${esc(JOBS[k]?.name || k)} ${Math.round(v * 100)}`).join('、') || '—'}</dd>
        <dt>危ない場所</dt><dd>${dangers.map(([k]) => { const x = Math.floor(+k / 100) * 8 + 4, z = (+k % 100) * 8 + 4; return `<span class="link" data-goto="${x},${z}">${esc(sim.placeName(x, z))}</span>`; }).join('、') || '知らない'}</dd></dl></div>`;
    }
    h += `<div class="section"><h4>人となり</h4><div class="traits">${(p.traits || []).map((t) => `<span class="trait">${esc(t)}</span>`).join('')}</div>
      <dl class="kv" style="margin-top:6px">${p.dream ? `<dt>夢</dt><dd>${esc(p.dream)}こと</dd>` : ''}${p.saying ? `<dt>口ぐせ</dt><dd>『${esc(p.saying)}』</dd>` : ''}${p.deeds.length ? `<dt>語り草</dt><dd>${p.deeds.map(esc).join('<br>')}</dd>` : ''}</dl></div>`;
    h += `<div class="section"><h4>家族と祖先</h4><div class="tree">${this.familyHtml(p)}</div></div>`;
    if (!dead) {
      const rels = Object.entries(p.rel).map(([id, r]) => ({ q: S.people[id], r })).filter((x) => x.q && x.q.deathYear == null);
      const liked = rels.filter((x) => x.r.a > 20).sort((a, b) => b.r.a - a.r.a).slice(0, 6);
      const disliked = rels.filter((x) => x.r.a < -10).sort((a, b) => a.r.a - b.r.a).slice(0, 3);
      const relLi = ({ q, r }) => {
        const kin = sim.kinTerm(p, q);
        const w = Math.min(50, Math.abs(r.a) / 2);
        return `<li><span>${this.pLink(q)}${kin ? `<span class="dead">（${esc(kin)}）</span>` : ''}</span><div class="relbar"><i style="left:${r.a >= 0 ? 50 : 50 - w}%;width:${w}%;background:${r.a >= 0 ? 'var(--moss)' : 'var(--rose)'}"></i></div></li>`;
      };
      h += `<div class="section"><h4>好きな人</h4><ul class="rels">${liked.map(relLi).join('') || '<li>—</li>'}</ul></div>`;
      if (disliked.length) h += `<div class="section"><h4>苦手な人${p.revenge != null ? '・恨んでいる人' : ''}</h4><ul class="rels">${disliked.map(relLi).join('')}</ul></div>`;
      const mems = p.memories.slice().sort((a, b) => (b.min ?? b.t * 1440) - (a.min ?? a.t * 1440));
      h += `<div class="section"><h4>記憶（${mems.length}）</h4><ul class="mems">${mems.slice(0, this.memLimit).map((m) => `<li><span class="when">${this.whenLabel(m)}</span><span class="${m.emo > 0.25 ? 'pos' : m.emo < -0.25 ? 'neg' : ''}">${esc(m.txt)}</span></li>`).join('')}</ul>${mems.length > this.memLimit ? '<div class="row-btns"><button id="moreMem">もっと思い出す</button></div>' : ''}</div>`;
    }
    return h;
  }

  creatureHtml(c) {
    const d = SPECIES[c.sp], S = this.sim.S;
    const mem = S.speciesMemory[c.sp] || {};
    const state = c.dormant ? '魔王城の奥で眠っている' : c.fight ? '戦っている' : c.raid != null ? `${this.sim.town(c.raid).name}を襲いに向かっている` : c.fleeUntil && S.t < c.fleeUntil ? '逃げている' : c.goal?.run ? '獲物を追っている' : 'あたりをうろついている';
    let h = `<canvas id="portrait" class="portrait" width="64" height="80"></canvas>`;
    h += `<div class="pname">${esc(c.name)}</div><div class="psub">${KIND_NAME[d.kind]}・Lv${c.lv}${c.named ? '・名のある個体' : ''}<br>役割：<span class="rank">${esc(ROLES[c.role] || 'なし')}</span><br>${esc(this.sim.placeName(c.pos.x, c.pos.z))}</div>`;
    h += `<div class="psub">いま：${esc(state)}</div>`;
    h += `<div class="row-btns"><button id="followBtn" class="${this.follow === c.id ? 'on' : ''}">${this.follow === c.id ? '追いかけ中' : '追いかける'}</button><button id="lookBtn">見る</button></div>`;
    const bar = (label, v) => `<span>${label}</span><div class="bar"><i class="${v < 30 ? 'low' : v < 55 ? 'mid' : ''}" style="width:${Math.round(Math.max(0, Math.min(100, v)))}%"></i></div>`;
    h += `<div class="section"><h4>ようす</h4><div class="bars">${bar('体力', c.hp / c.maxhp * 100)}${bar('満腹', c.hunger)}</div>
      <dl class="kv" style="margin-top:8px"><dt>強さ</dt><dd>攻${c.atk} 守${c.def}</dd><dt>倒した数</dt><dd>${c.kills || 0}</dd><dt>経験</dt><dd>${Math.round(c.xp || 0)}${d.evolve ? `（いずれ${esc(SPECIES[d.evolve].name)}に進化する）` : ''}</dd>
      ${c.bounty ? `<dt>懸賞金</dt><dd>${c.bounty}銅貨</dd>` : ''}<dt>年齢</dt><dd>${c.age}日</dd></dl></div>`;
    h += `<div class="section"><h4>種族としての学び</h4><dl class="kv"><dt>仲間の死</dt><dd>${mem.deaths || 0}体</dd><dt>進化</dt><dd>${mem.evolved || 0}回</dd><dt>人間への警戒</dt><dd>${(mem.fear || 0) > 5 ? '強い（手強い人間は避ける）' : (mem.fear || 0) > 2 ? 'ある' : 'ない'}</dd><dt>避ける場所</dt><dd>${Object.values(mem.danger || {}).filter((v) => v > 2).length}か所</dd></dl></div>`;
    return h;
  }

  tileHtml(t) {
    const w = this.sim.S.world;
    const tt = w.tiles[t.z * W + t.x];
    const k = w.kingdomOf[t.z * W + t.x];
    const near = Object.values(this.sim.S.creatures).filter((c) => !c.dormant && Math.hypot(c.pos.x - t.x, c.pos.z - t.z) < 6);
    return `<div class="pname">${esc(this.sim.placeName(t.x, t.z))}</div><div class="psub">${esc(TILE_NAME[tt])}・標高${w.hgt[t.z * W + t.x]}${k >= 0 ? `・${esc(KINGDOMS[k].name)}の領地` : k === -1 ? '・どの国にも属さない' : ''}</div>
      ${near.length ? `<div class="section"><h4>近くにいる生き物</h4>${near.slice(0, 12).map((c) => `<span class="link" data-cid="${c.id}">${esc(c.name)}</span>`).join('、')}</div>` : ''}`;
  }

  familyHtml(p) {
    const S = this.sim.S, P = (id) => (id != null ? S.people[id] : null);
    const parts = [];
    const sp = P(p.spouseId);
    if (sp) parts.push(`連れ合い：${this.pLink(sp)}`);
    const ex = p.exSpouses.map(P).filter(Boolean);
    if (ex.length) parts.push(`先立った連れ合い：${ex.map((x) => this.pLink(x)).join('、')}`);
    const kids = p.children.map(P).filter(Boolean);
    if (kids.length) parts.push(`子：${kids.map((x) => this.pLink(x)).join('、')}`);
    const sib = new Set();
    for (const par of [P(p.fatherId), P(p.motherId)]) if (par) for (const c of par.children) if (c !== p.id) sib.add(c);
    if (sib.size) parts.push(`きょうだい：${[...sib].map(P).map((x) => this.pLink(x)).join('、')}`);
    parts.push(`父：${this.pLink(P(p.fatherId))}　母：${this.pLink(P(p.motherId))}`);
    const gens = [];
    let frontier = [P(p.fatherId), P(p.motherId)].filter(Boolean);
    const names = ['祖父母', '曾祖父母', '高祖父母', '5代前', '6代前', '7代前'];
    for (let g = 0; g < 6 && frontier.length; g++) {
      const next = [], seen = new Set();
      for (const q of frontier) for (const id of [q.fatherId, q.motherId]) { const a = P(id); if (a && !seen.has(a.id)) { seen.add(a.id); next.push(a); } }
      if (!next.length) break;
      gens.push(`<div class="gen">${names[g]}（${next.length}人）</div>${next.slice(0, 16).map((x) => this.pLink(x)).join('、')}`);
      frontier = next;
    }
    if (!gens.length && p.origin) gens.push(`<div class="gen">祖先</div>${esc(p.origin)}で暮らしていた（この地の記録にはない）`);
    return parts.join('<br>') + gens.join('');
  }

  buildingHtml(b) {
    const sim = this.sim, S = sim.S;
    const typeLabel = { watchtower: '見張り櫓', clinic: '診療所', school: '学校', stable: '厩舎', mill: '風車小屋', house: '民家', castle: '王城', church: '聖堂', bakery: 'パン屋', tavern: '宿屋・酒場', smithy: '鍛冶場', workshop: '工房', market: '市場', well: '井戸', guild: '冒険者ギルド', barracks: '兵舎', prison: '牢獄', magictower: '研究の塔', mansion: '貴族の屋敷', lighthouse: '灯台', demoncastle: '魔王城', cave: 'ダンジョン', pyramid: 'ピラミッド', observatory: '展望台', hideout: '盗賊のアジト', mine: '鉱山', ruins: '遺跡' }[b.type] || '建物';
    let h = `<div class="pname">${esc(b.name)}</div><div class="psub">${typeLabel}${b.settlement != null ? `・${esc(sim.town(b.settlement).name)}` : ''}${b.bounty ? `<br><b class="up">懸賞金 ${b.bounty}銅貨</b>` : ''}</div>`;
    if (INTERIOR_TYPES.has(b.type)) h += `<div class="row-btns"><button id="enterBtn">${['cave', 'pyramid', 'demoncastle', 'ruins', 'mine'].includes(b.type) ? '奥へ踏み込んで見る' : '中に入って見る'}</button></div>`;
    if (b.type === 'house' || b.type === 'mansion') {
      const own = b.owner != null ? S.households[b.owner] : null;
      const oh = own ? headOf(sim, own) : null;
      const status = b.hh == null ? '空き家' : b.owner === b.hh ? '持ち家' : own ? '借家' : '町の貸家';
      h += `<div class="section"><h4>家の値打ちと持ち主</h4><dl class="kv"><dt>住まい</dt><dd>${status}</dd><dt>持ち主</dt><dd>${own ? `${esc(own.name)}${oh ? `（${this.pLink(oh, oh.given)}）` : ''}` : '町'}</dd><dt>値打ち</dt><dd>${b.value || '—'}銅貨</dd>${b.rent ? `<dt>家賃</dt><dd>週${b.rent}銅貨${b.arrears ? `　<b class="down">滞納${b.arrears}週</b>` : ''}</dd>` : ''}</dl></div>`;
    }
    const hh = b.hh != null ? S.households[b.hh] : null;
    if (hh) h += `<div class="section"><h4>暮らしている家族</h4><dl class="kv"><dt>蓄え</dt><dd>${Math.round(hh.money)}銅貨</dd><dt>食糧</dt><dd>${Math.floor(hh.food)}食分</dd></dl><ul class="rels" style="margin-top:6px">${hh.members.map((id) => S.people[id]).filter(Boolean).map((q) => `<li><span>${this.pLink(q, `${q.given}・${q.family}`)}</span><span class="dead">${sim.ageOf(q)}歳</span></li>`).join('')}</ul></div>`;
    if (b.type === 'smithy' && b.settlement != null) {
      const shop = S.towns[b.settlement].shop || [];
      h += `<div class="section"><h4>店に並ぶ品</h4><ul class="rels">${shop.map((it) => `<li><span>${esc(itemName(it))}</span><span class="dead">${Math.round(itemValue(it) * 1.2)}銅貨</span></li>`).join('') || '<li>品切れ</li>'}</ul></div>`;
    }
    if (b.type === 'guild' && b.settlement != null) {
      const qs = (S.quests || []).filter((q) => q.s === b.settlement && ['open', 'taken', 'report'].includes(q.state));
      h += `<div class="section"><h4>依頼掲示板</h4><ul class="rels">${qs.map((q) => `<li><span>［${RANKS_ADV[q.rank]}］${esc(q.title)}</span><span class="dead">${q.reward}銅貨</span></li>`).join('') || '<li>いまは依頼がない</li>'}</ul></div>`;
    }
    const inside = sim.living().filter((q) => q.inside === b.id);
    if (inside.length) h += `<div class="section"><h4>いま中にいる人</h4>${inside.map((q) => this.pLink(q)).join('、')}</div>`;
    const bandits = sim.living().filter((q) => q.hideout === b.id);
    if (bandits.length) h += `<div class="section"><h4>ねぐらにしている者</h4>${bandits.map((q) => this.pLink(q)).join('、')}</div>`;
    const monsters = Object.values(S.creatures).filter((c) => c.lair === b.id && !c.dormant);
    if (monsters.length) h += `<div class="section"><h4>巣食う魔物</h4>${monsters.map((c) => `<span class="link" data-cid="${c.id}">${esc(c.name)}</span>`).join('、')}</div>`;
    return h;
  }
}
