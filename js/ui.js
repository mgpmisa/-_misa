// 画面のパネル・吹き出し・住人の詳細
import { JOBS, GOODS, DAYS_PER_YEAR, DAYS_PER_SEASON, SEASONS, ERA } from './data.js';
import { personTexture } from './textures.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

const ACTION_LABEL = {
  sleep: '眠っている', eat: '食事をしている', shop: '市場で買い物をしている', tavern: '酒場で一杯やっている', plaza: '広場でくつろいでいる',
  stroll: '散歩している', pray: '礼拝堂で祈っている', play: '遊んでいる', home: '家でのんびりしている', festival: '収穫祭を楽しんでいる',
  wedding: '婚礼に出ている', funeral: '弔いに参列している', askfood: '食べ物を分けてもらっている',
};
const ACTION_GO = {
  sleep: '寝に帰るところ', eat: '食事をしに家へ向かっている', shop: '市場へ向かっている', tavern: '酒場へ向かっている', plaza: '広場へ向かっている',
  stroll: 'ぶらぶら歩いている', pray: '礼拝堂へ向かっている', play: '遊びに出かけるところ', home: '家へ帰るところ', festival: '収穫祭の広場へ向かっている',
  wedding: '婚礼に向かっている', funeral: '弔いに向かっている', askfood: '食べ物を分けてもらいに行くところ', visit: '知り合いの家へ向かっている', work: '仕事場へ向かっている',
};

export class UI {
  constructor(sim, renderer) {
    this.sim = sim; this.r = renderer;
    this.selected = null; this.selBuilding = null; this.follow = null;
    this.speed = 1; this.filter = 'all'; this.bubblesOn = true;
    this.bubbles = new Map();
    this.tab = 'log';
    this.lastPanel = 0;
    this.memLimit = 25;
    this.bind();
    this.renderLogAll();
  }

  bind() {
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    $('rotL').onclick = () => this.r.rotateBy(-Math.PI / 4);
    $('rotR').onclick = () => this.r.rotateBy(Math.PI / 4);
    $('viewTop').onclick = () => this.r.topView();
    $('viewIso').onclick = () => this.r.isoView();
    $('viewLow').onclick = () => this.r.lowView();
    $('menuBtn').onclick = () => { $('menu').hidden = !$('menu').hidden; };
    $('pixelSel').onchange = (e) => this.r.setPixel(+e.target.value);
    $('bubbleChk').onchange = (e) => { this.bubblesOn = e.target.checked; if (!this.bubblesOn) this.clearBubbles(); };
    $('newWorld').onclick = () => { $('newWorldConfirm').hidden = false; };
    $('newWorldYes').onclick = () => this.onNewWorld && this.onNewWorld();
    $('sideToggle').onclick = () => $('side').classList.toggle('closed');
    $('closeInsp').onclick = () => this.deselect();
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab;
      document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.classList.toggle('on', x === b));
      for (const t of ['log', 'people', 'chron', 'econ']) $('tab-' + t).hidden = t !== this.tab;
      this.refreshPanel(true);
    }));
    document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      this.filter = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
      this.renderLogAll();
    }));
    $('search').addEventListener('input', () => this.refreshPanel(true));
    document.body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pid]');
      if (t) { this.select(+t.dataset.pid, true); }
      const bt = e.target.closest('[data-bid]');
      if (bt) this.selectBuilding(+bt.dataset.bid);
    });
    if (window.innerWidth < 760) $('side').classList.add('closed');
  }

  setSpeed(s) {
    this.speed = s;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  }

  // ---------- 選択 ----------
  select(id, focus) {
    const p = this.sim.S.people[id];
    if (!p) return;
    this.selected = id; this.selBuilding = null; this.memLimit = 25;
    if (focus && p.deathYear == null) this.r.focusOn(p);
    $('inspector').hidden = false; $('menu').hidden = true;
    this.renderInspector(true);
  }
  selectBuilding(id) {
    this.selBuilding = id; this.selected = null; this.follow = null;
    $('inspector').hidden = false; $('menu').hidden = true;
    this.renderInspector(true);
  }
  deselect() { this.selected = null; this.selBuilding = null; this.follow = null; $('inspector').hidden = true; }

  // ---------- 時間表示 ----------
  timeLabel(t) {
    const d = Math.floor(t / 1440), doy = d % DAYS_PER_YEAR;
    const h = Math.floor((t % 1440) / 60), m = Math.floor(t % 60);
    return `${SEASONS[Math.floor(doy / DAYS_PER_SEASON)]}${(doy % DAYS_PER_SEASON) + 1}日 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  whenLabel(m, p) {
    const today = this.sim.today;
    if (m.t >= today) return '今日';
    const days = today - m.t;
    if (days < DAYS_PER_YEAR) return `${days}日前`;
    const years = Math.round(days / DAYS_PER_YEAR);
    return m.ageAt != null && m.ageAt >= 0 ? `${years}年前<br>${m.ageAt}歳` : `${years}年前`;
  }

  // ---------- ログ ----------
  logLi(e) {
    const li = document.createElement('li');
    li.className = e.kind;
    let text = esc(e.text);
    const S = this.sim.S;
    for (const id of e.ids || []) {
      const p = S.people[id];
      if (!p) continue;
      text = text.replace(esc(p.given), `<span class="nm" data-pid="${id}">${esc(p.given)}</span>`);
    }
    li.innerHTML = `<span class="t">${this.timeLabel(e.t)}</span>${text}`;
    return li;
  }
  renderLogAll() {
    const ol = $('log');
    ol.innerHTML = '';
    const items = this.sim.S.log.filter((e) => this.filter === 'all' || (this.filter === 'event' ? e.kind !== 'talk' : e.kind === 'talk')).slice(-150).reverse();
    for (const e of items) ol.appendChild(this.logLi(e));
  }
  addLog(e) {
    if (this.filter !== 'all' && (this.filter === 'event' ? e.kind === 'talk' : e.kind !== 'talk')) return;
    const ol = $('log');
    ol.insertBefore(this.logLi(e), ol.firstChild);
    while (ol.children.length > 150) ol.removeChild(ol.lastChild);
  }

  // ---------- 吹き出し ----------
  say(id, text) {
    if (!this.bubblesOn) return;
    const p = this.sim.S.people[id];
    if (!p) return;
    // 速度が速いときは選択中の人の会話と一部だけ
    if (this.speed >= 15 && id !== this.selected && !(p.talk && (p.talk.a === this.selected || p.talk.b === this.selected)) && this.bubbles.size > 3) return;
    let b = this.bubbles.get(id);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'bubble';
      $('bubbles').appendChild(el);
      b = { el };
      this.bubbles.set(id, b);
    }
    b.el.innerHTML = `<span class="who">${esc(p.given)}</span>${esc(text)}`;
    b.until = performance.now() + Math.max(2400, text.length * 110) / Math.max(1, Math.sqrt(this.speed));
    b.el.classList.toggle('inside', !!p.inside);
  }
  clearBubbles() { for (const b of this.bubbles.values()) b.el.remove(); this.bubbles.clear(); }

  updateOverlay() {
    const now = performance.now();
    for (const [id, b] of this.bubbles) {
      const p = this.sim.S.people[id];
      if (!p || p.deathYear != null || now > b.until) { b.el.remove(); this.bubbles.delete(id); continue; }
      const s = this.r.project(this.r.spriteTop(p));
      let dx = 0;
      if (p.inside && p.talk) dx = p.talk.a === id ? -60 : 60;
      b.el.style.left = `${s.x + dx}px`; b.el.style.top = `${s.y - 4}px`;
      b.el.style.display = s.visible ? '' : 'none';
    }
    // 選択中の名札
    let tag = this._tag;
    const sel = this.selected != null ? this.sim.S.people[this.selected] : null;
    if (sel && sel.deathYear == null && !this.bubbles.has(sel.id)) {
      if (!tag) { tag = this._tag = document.createElement('div'); tag.className = 'tag'; $('bubbles').appendChild(tag); }
      const s = this.r.project(this.r.spriteTop(sel));
      tag.textContent = sel.inside ? `${sel.given}（${this.sim.building(sel.inside).name}の中）` : sel.given;
      tag.style.left = `${s.x}px`; tag.style.top = `${s.y - 4}px`; tag.style.display = '';
    } else if (tag) tag.style.display = 'none';
  }

  // ---------- 毎フレーム ----------
  update() {
    const d = this.sim.dateLabel();
    const wmap = { sunny: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪' };
    const extra = this.sim.isFestival() ? '・収穫祭' : this.sim.isRestDay() ? '・安息日' : '';
    $('clock').textContent = `${d.era} ${d.season}の${d.day}日目 ${d.time}　${wmap[this.sim.S.weather]}${extra}　人口${this.sim.living().length}人`;
    this.updateOverlay();
    const now = performance.now();
    if (now - this.lastPanel > 1000) { this.lastPanel = now; this.refreshPanel(false); this.renderInspector(false); }
  }

  refreshPanel(force) {
    if (this.tab === 'people') this.renderPeople();
    else if (this.tab === 'chron' && force) this.renderChron();
    else if (this.tab === 'econ') this.renderEcon();
  }

  renderPeople() {
    const q = $('search').value.trim();
    const list = this.sim.living().filter((p) => !q || (p.given + p.family).includes(q)).sort((a, b) => a.family.localeCompare(b.family, 'ja') || a.birthYear - b.birthYear);
    const col = (m) => (m > 65 ? 'var(--moss)' : m > 40 ? 'var(--amber)' : 'var(--rose)');
    $('peopleList').innerHTML = list.map((p) => {
      const job = p.job ? JOBS[p.job].name : this.sim.ageOf(p) < 14 ? '子ども' : '隠居';
      return `<li data-pid="${p.id}"><span class="dot" style="background:${col(p.mood)}"></span><span>${esc(p.given)}・${esc(p.family)}<br><span class="sub">${this.sim.ageOf(p)}歳 ${job}</span></span><span class="sub">${this.actionText(p, true)}</span></li>`;
    }).join('');
  }

  renderChron() {
    const c = this.sim.S.chronicle.slice().reverse();
    $('chron').innerHTML = c.map((e) => `<li><span class="y">${e.y}年</span><span>${esc(e.text)}</span></li>`).join('');
  }

  renderEcon() {
    const S = this.sim.S, m = S.market;
    const rows = Object.entries(GOODS).map(([k, g]) => {
      const pr = m.price[k], r = pr / g.base;
      const cls = r > 1.15 ? 'up' : r < 0.87 ? 'down' : '';
      return `<span>${g.name}</span><span class="${cls}">${pr.toFixed(1)}銅貨</span><span>${Math.floor(m.stock[k])}個</span>`;
    }).join('');
    const hhs = Object.values(S.households);
    const avg = hhs.reduce((s, h) => s + h.money, 0) / Math.max(1, hhs.length);
    const poor = hhs.filter((h) => h.money < 20).length;
    const hungry = this.sim.living().filter((p) => p.needs.hunger < 20).length;
    const rich = hhs.slice().sort((a, b) => b.money - a.money)[0];
    $('econ').innerHTML = `
      <div class="econ-grid"><span class="h">品物</span><span class="h">市場の値段</span><span class="h">在庫</span>${rows}</div>
      <canvas id="priceChart" width="300" height="90"></canvas>
      <p>黄＝パン　緑＝小麦（ここ最近の値動き）</p>
      <p>世帯数 ${hhs.length}　平均の蓄え ${avg.toFixed(0)}銅貨<br>
      いちばん裕福：<span class="link" data-bid="${rich?.house}">${esc(rich?.name ?? '')}</span>（${rich?.money.toFixed(0)}銅貨）<br>
      蓄えが20銅貨未満の世帯 ${poor}　お腹をすかせた人 ${hungry}人<br>
      今年の麦の出来 ${S.harvest > 1.1 ? '豊作' : S.harvest < 0.85 ? '不作' : '並'}</p>`;
    const cv = $('priceChart'), g = cv.getContext('2d');
    const hist = m.history;
    if (hist.length > 1) {
      const max = Math.max(...hist.map((h) => Math.max(h.bread, h.wheat))) * 1.1;
      for (const [key, color] of [['bread', '#e8a93a'], ['wheat', '#7fb04a']]) {
        g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
        hist.forEach((h, i) => { const x = (i / (hist.length - 1)) * 296 + 2, y = 88 - (h[key] / max) * 84; i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
    }
  }

  actionText(p, short) {
    if (p.deathYear != null) return '故人';
    if (p.talk) {
      const o = this.sim.S.people[p.talk.a === p.id ? p.talk.b : p.talk.a];
      return short ? '会話中' : `${o ? o.given : '誰か'}と話している`;
    }
    const a = p.action;
    if (!a) return '考えごと中';
    if (a.phase === 'walk') {
      if (a.type === 'visit') { const f = this.sim.S.people[a.friend]; return short ? '移動中' : `${f ? f.given : '知り合い'}の家へ向かっている`; }
      return short ? '移動中' : ACTION_GO[a.type] || '歩いている';
    }
    if (a.type === 'work') return short ? '仕事中' : `${JOBS[p.job]?.name ?? ''}の仕事をしている`;
    if (a.type === 'visit') { const f = this.sim.S.people[a.friend]; return short ? '訪問中' : `${f ? f.given : '知り合い'}の家を訪ねている`; }
    const t = ACTION_LABEL[a.type] || '過ごしている';
    return short ? t.replace(/(をしている|している|ている)$/, '中').slice(0, 8) : t;
  }

  // ---------- 詳細パネル ----------
  renderInspector(force) {
    if ($('inspector').hidden) return;
    const body = $('inspBody');
    const scroll = $('inspector').scrollTop;
    if (this.selBuilding != null) { if (force || true) body.innerHTML = this.buildingHtml(this.sim.building(this.selBuilding)); }
    else if (this.selected != null) {
      const p = this.sim.S.people[this.selected];
      if (!p) return;
      body.innerHTML = this.personHtml(p);
      this.drawPortrait(p);
      const fb = $('followBtn');
      if (fb) fb.onclick = () => { this.follow = this.follow === p.id ? null : p.id; this.renderInspector(false); };
      const lb = $('lookBtn');
      if (lb) lb.onclick = () => this.r.focusOn(p);
      const mb = $('moreMem');
      if (mb) mb.onclick = () => { this.memLimit += 40; this.renderInspector(false); };
    }
    if (!force) $('inspector').scrollTop = scroll; else $('inspector').scrollTop = 0;
  }

  drawPortrait(p) {
    const cv = $('portrait');
    if (!cv) return;
    const a = this.sim.ageOf(p);
    const tex = personTexture(p, a < 13 ? 'child' : a >= 64 ? 'elder' : 'adult');
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(tex.image, 0, 0, 16, 20, 0, 0, 64, 80);
    tex.dispose();
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
    let h = `<canvas id="portrait" class="portrait" width="64" height="80"></canvas>`;
    h += `<div class="pname">${esc(p.given)}・${esc(p.family)}</div>`;
    h += `<div class="psub">${dead ? `${p.birthYear}年〜${p.deathYear}年（${age}歳で${esc(this.causeLabel(p))}）` : `${age}歳　${job}`}${p.birthFamily !== p.family ? `<br>旧姓 ${esc(p.birthFamily)}` : ''}${p.origin ? `<br>${esc(p.origin)}の出` : ''}${hh ? `<br><span class="link" data-bid="${hh.house}">${esc(hh.name)}</span>で暮らす` : ''}</div>`;
    if (!dead) {
      h += `<div class="psub">いま：${esc(this.actionText(p))}</div>`;
      h += `<div class="thought"><b>心の声</b>${esc(p.thought || '……')}</div>`;
      h += `<div class="row-btns"><button id="followBtn" class="${this.follow === p.id ? 'on' : ''}">${this.follow === p.id ? '追いかけ中' : '追いかける'}</button><button id="lookBtn">この人を見る</button></div>`;
      const bar = (label, v) => `<span>${label}</span><div class="bar"><i class="${v < 30 ? 'low' : v < 55 ? 'mid' : ''}" style="width:${Math.round(v)}%"></i></div>`;
      h += `<div class="section"><h4>心と体</h4><div class="bars">${bar('気分', p.mood)}${bar('満腹', p.needs.hunger)}${bar('元気', p.needs.energy)}${bar('つながり', p.needs.social)}${bar('楽しさ', p.needs.fun)}</div>
        <dl class="kv" style="margin-top:8px"><dt>家の蓄え</dt><dd>${hh.money.toFixed(0)}銅貨・食糧 ${Math.floor(hh.food)}食分</dd>${p.pregnant ? '<dt>身ごもり</dt><dd>お腹に子どもがいる</dd>' : ''}</dl></div>`;
    }
    h += `<div class="section"><h4>人となり</h4><div class="traits">${(p.traits || []).map((t) => `<span class="trait">${esc(t)}</span>`).join('')}</div>
      <dl class="kv" style="margin-top:6px"><dt>夢</dt><dd>${esc(p.dream)}こと</dd>${p.saying ? `<dt>口ぐせ</dt><dd>『${esc(p.saying)}』</dd>` : ''}${p.deeds.length ? `<dt>語り草</dt><dd>${p.deeds.map(esc).join('<br>')}</dd>` : ''}</dl></div>`;
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
      if (disliked.length) h += `<div class="section"><h4>苦手な人</h4><ul class="rels">${disliked.map(relLi).join('')}</ul></div>`;
      const mems = p.memories.slice().sort((a, b) => (b.min ?? b.t * 1440) - (a.min ?? a.t * 1440));
      h += `<div class="section"><h4>記憶（${mems.length}）</h4><ul class="mems">${mems.slice(0, this.memLimit).map((m) => `<li><span class="when">${this.whenLabel(m, p)}</span><span class="${m.emo > 0.25 ? 'pos' : m.emo < -0.25 ? 'neg' : ''} ${m.src === 'heard' ? 'heard' : ''}">${esc(m.txt)}</span></li>`).join('')}</ul>${mems.length > this.memLimit ? '<div class="row-btns"><button id="moreMem">もっと思い出す</button></div>' : ''}</div>`;
    }
    return h;
  }

  causeLabel(p) {
    return { old: '老衰', sick: '流行り病', winter: '冬の寒さ', accident: '事故', lake: '湖の事故', birth: 'お産', infant: '幼い病', war: '戦' }[p.deathCause] || '亡くなった';
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
      const next = [];
      const seen = new Set();
      for (const q of frontier) for (const id of [q.fatherId, q.motherId]) { const a = P(id); if (a && !seen.has(a.id)) { seen.add(a.id); next.push(a); } }
      if (!next.length) break;
      gens.push(`<div class="gen">${names[g]}（${next.length}人）</div>${next.slice(0, 16).map((x) => this.pLink(x)).join('、')}`);
      frontier = next;
    }
    if (!gens.length && p.origin) gens.push(`<div class="gen">祖先</div>${esc(p.origin)}で暮らしていた（村の記録にはない）`);
    return parts.join('<br>') + gens.join('');
  }

  buildingHtml(b) {
    const sim = this.sim, S = sim.S;
    const typeLabel = { house: '民家', hall: '村役場と鐘楼', chapel: '礼拝堂', bakery: 'パン屋', tavern: '酒場', smithy: '鍛冶場', workshop: '大工の作業場', market: '市場', well: '村の井戸', linden: '広場の大樹' }[b.type];
    const desc = {
      hall: `${ERA}131年に完成した青い屋根の鐘楼。村長が村の帳簿をつけている。`,
      chapel: `${ERA}58年に村人総出で建てた礼拝堂。婚礼も弔いもここで行われる。`,
      linden: '開拓者たちがこの木の下に村を開いたと伝えられている。',
      well: '村の真ん中にある古い井戸。朝は水くみの人で混み合う。',
      market: '村じゅうの品物が集まり、値段は品物の多い少ないで毎時変わる。',
    }[b.type] || '';
    let h = `<div class="pname">${esc(b.name)}</div><div class="psub">${typeLabel}</div>`;
    if (desc) h += `<p class="psub">${esc(desc)}</p>`;
    const hh = b.hh ? S.households[b.hh] : null;
    if (hh) {
      h += `<div class="section"><h4>暮らしている家族</h4><dl class="kv"><dt>蓄え</dt><dd>${hh.money.toFixed(0)}銅貨</dd><dt>食糧</dt><dd>${Math.floor(hh.food)}食分</dd><dt>家具</dt><dd>${hh.comfort}点</dd></dl><ul class="rels" style="margin-top:6px">${hh.members.map((id) => S.people[id]).map((q) => `<li><span>${this.pLink(q, `${q.given}・${q.family}`)}</span><span class="dead">${sim.ageOf(q)}歳</span></li>`).join('')}</ul></div>`;
    }
    const inside = sim.living().filter((q) => q.inside === b.id);
    if (inside.length) h += `<div class="section"><h4>いま中にいる人</h4>${inside.map((q) => this.pLink(q)).join('、')}</div>`;
    return h;
  }
}
