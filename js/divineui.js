// 神の力の画面：右下の「神の力」ボタン、祈りの力のゲージ、奇跡の一覧、人々の願い、御業の記録、信仰のようす。
// 奇跡を選び、地図の場所か人・生き物をクリック（スマホはタップ）して使う。取り消しボタンつき。
// 人・生き物の詳細欄にも、その相手に使える奇跡のボタンを出す（divinePersonHTML / divineCreatureHTML）。
// ui.js からは mountDivine(ui) と ui.divine.update() を呼ぶだけ。main.js は書き換えない
// （地図のクリックは renderer.pick を包んで横取りする）。
import { MIRACLES, MIRACLE_CATS, DREAM_GOALS, MAX_POWER, ensureDivine, castMiracle, canCast, miracleCost, answerWish, ignoreWish, wishCost, divineSummary, miraclesFor, personDivineNote } from './divine.js';
import { DivineFx } from './divinefx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

// ---------- 12×12 のドット絵アイコン ----------
const PAL = { k: '#120c07', w: '#f3e6c4', W: '#ffffff', y: '#ffd84a', o: '#e8a93a', r: '#d2553f', b: '#8fd0ff', B: '#3a5a9a', g: '#7fb04a', G: '#3f6a2a', p: '#ff8fb0', P: '#7a4aa8', d: '#3a2a4a', s: '#9a9aa8', S: '#5a5a68', n: '#8a5a2a' };
const ICONS = {
  rain: ['....ssss....', '..ssSSSSss..', '.sSSSSSSSSs.', 'sSSSSSSSSSSs', '.ssssssssss.', '............', '.b..b..b..b.', 'b..b..b..b..', '............', '..b..b..b..b', '.b..b..b..b.', '............'],
  wheat: ['.....y......', '....yoy.....', '.....y..y...', '....yoy.yoy.', '.y...y...y..', 'yoy.yoy.yoy.', '.y..gy...y..', '.g...g..gg..', '..g..g.g....', '...g.gg.....', '....ggg.....', '....g.g.....'],
  sun: ['.....y......', '..y..y..y...', '...y.o.y....', '....ooo.....', 'yy.oyyyo.yy.', '...oyyyyo...', '....oyyo....', '...y.oo.y...', '..y..y...y..', '.....y......', '............', '............'],
  storm: ['...SSSS.....', '.SSddddSS...', 'SddddddddS..', 'SddddddddS..', '.SSSSSSSS...', '....yy......', '...yy.......', '..yyyy......', '....yy......', '...yy.......', '..yy........', '..y.........'],
  skull: ['...wwwww....', '..wwwwwww...', '.wwwwwwwww..', '.wkkwwwkkw..', '.wkkwwwkkw..', '.wwwwkwwww..', '..wwwwwww...', '...wkwkw....', '...wwwww....', '.G......G...', 'GgG....GgG..', '.G......G...'],
  cross: ['....gggg....', '....gWWg....', '....gWWg....', '.ggggWWgggg.', '.gWWWWWWWWg.', '.gWWWWWWWWg.', '.ggggWWgggg.', '....gWWg....', '....gWWg....', '....gggg....', '............', '............'],
  dream: ['..........y.', '.........yyy', '..bbb.....y.', '.bWWWb......', 'bWWWWWbbb...', 'bWWWWWWWWb..', '.bWWWWWWWb..', '..bbbbbbb...', '....y.......', '...yyy..W...', '....y..WWW..', '........W...'],
  heart: ['............', '.rr....rr...', 'rppr..rppr..', 'rpWprrpppr..', 'rppppppppr..', '.rppppppr...', '..rppppr....', '...rppr.....', '....rr......', '............', '............', '............'],
  flame: ['.....r......', '....rr......', '....ror.....', '...rroor....', '..rrooyor...', '..royyyor...', '.rroyyyyorr.', '.royyWyyor..', '.royyWWyor..', '..rooyyoor..', '...rrooor...', '....rrrr....'],
  snake: ['............', '.....GGG....', '....GgggG...', '....GgkgG...', '.....Gggr...', '......Gg.r..', '..GGGGgG....', '.GggggG.....', '.GgGGGG.....', '.GggggggG...', '..GGGGGGG...', '............'],
  dove: ['............', '..WW........', '.WkWW.......', 'WWWWWW...W..', '..WWWWWWWW..', '..WWWWWWWWW.', '...WWWWsWW..', '....WWsW....', '.....ss.....', '......o.....', '............', '............'],
  sword: ['..........WW', '.........WsW', '........WsW.', '.......WsW..', '......WsW...', '.....WsW....', '..y.WsW.....', '...yyW......', '....yy......', '...n.yy.....', '..n.........', '.n..........'],
  scroll: ['............', '..nnnnnnnn..', '.nwwwwwwwwn.', '.nwkkkkkwwn.', '..wwwwwwww..', '..wkkkkkkw..', '..wwwwwwww..', '..wkkkkww...', '..wwwwwwww..', '.nwwwwwwwwn.', '..nnnnnnnn..', '............'],
  gold: ['..........W.', '.........WWW', '..........W.', '............', '..oooooooo..', '.oyyyyyyyyo.', 'oyyWyyyyyyyo', 'oyyyyyyyyyyo', '.oooooooooo.', '............', '.W..........', 'WWW.........'],
  dragon: ['............', '.r.......r..', '.rr.....rr..', '..rrrrrrr...', '.rrrrrrrrr..', '.rryrrryrr..', '.rrrrrrrrr..', '..rrrrrrrrr.', '...rWrWrWr..', '....rrrrr...', '............', '............'],
  horde: ['............', '............', '.GG..GG..GG.', 'GggGGggGGggG', 'GrgGGrgGGrgG', '.GG..GG..GG.', '.gg..gg..gg.', 'gggggggggggg', '.g.g.g.g.g.g', '............', '............', '............'],
  crown: ['............', '.r...r...r..', '.dr.drd.rd..', '.ddrdddrdd..', '.dddddddddd.', '.dPdddPdddd.', '.dddddddddd.', '.PPPPPPPPPP.', '............', '............', '............', '............'],
  moon: ['.....bbb....', '...bbb......', '..bbb.......', '.bbbb.......', '.bbbb.......', '.bbbb.......', '.bbbbb......', '..bbbbb..b..', '...bbbbbbb..', '.....bbbb...', '............', '............'],
  wing: ['.........WW.', '.......WWWW.', '.....WWWWyW.', '....WWWWyWW.', '...WWWWyWW..', '..WWWWyWW...', '.WWWWyWW....', '.WWWyWW.....', '..WyWW......', '...WW.......', '............', '............'],
  bolt: ['......yyy...', '.....yyy....', '....yyy.....', '...yyy......', '..yyyyyy....', '.....yy.....', '....yy......', '...yy.......', '..yy........', '..y.........', '.y..........', '............'],
  candle: ['.....y......', '....yoy.....', '....yoy.....', '.....o......', '....www.....', '....www.....', '....wsw.....', '....www.....', '....www.....', '...nnnnn....', '..nnnnnnn...', '............'],
  eye: ['.....yy.....', '....yooy....', '....y..y....', '...y....y...', '...y.kk.y...', '..y.kWWk.y..', '..y.kWbk.y..', '.y...kk...y.', '.y........y.', 'yyyyyyyyyyyy', '............', '............'],
  pray: ['............', '....ww......', '...wwww.....', '....ww......', '...wwww..y..', '..ww..ww.y..', '..w.ww.w....', '....ww...y..', '...w..w.....', '...w..w.....', '..nnnnnn....', '............'],
};
const iconCache = {};
export function iconURL(name) {
  if (iconCache[name]) return iconCache[name];
  const rows = ICONS[name] || ICONS.eye;
  const c = document.createElement('canvas'); c.width = 12; c.height = 12;
  const g = c.getContext('2d');
  rows.forEach((row, y) => { for (let x = 0; x < 12; x++) { const ch = row[x]; if (ch && ch !== '.' && PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } } });
  return (iconCache[name] = c.toDataURL());
}
const icon = (name, cls = 'dv-ic') => `<img class="${cls}" alt="" src="${iconURL(name)}">`;

// ---------- 詳細欄に出す「神の御業」 ----------
function actsHTML(sim, e, kind) {
  const list = miraclesFor(sim, e);
  if (!list.length) return '';
  const D = ensureDivine(sim);
  return `<div class="dv-acts">${list.map(({ id, M, cost }) => {
    const ok = canCast(sim, id, { kind, id: e.id }).ok;
    return `<button class="dv-act${ok ? '' : ' off'}" data-dv="${id}" data-dvt="${kind}:${e.id}" title="${esc(M.desc)}">${icon(M.icon)}<span>${esc(M.name)}</span><b>${cost}</b></button>`;
  }).join('')}</div><div class="dv-note">祈りの力 ${Math.floor(D.power)}／${MAX_POWER}</div>`;
}
export function divinePersonHTML(sim, p) {
  if (!p || p.deathYear != null) return '';
  const notes = personDivineNote(sim, p);
  return `<details class="section dv-sec" data-k="divine"><summary><h4>神の御業をこの人に${notes.length ? `<span class="dv-tags">${notes.map(esc).join('・')}</span>` : ''}</h4></summary>${actsHTML(sim, p, 'person')}</details>`;
}
export function divineCreatureHTML(sim, c) {
  if (!c || c.hp <= 0) return '';
  return `<details class="section dv-sec" data-k="divine"><summary><h4>神の御業をこの生き物に</h4></summary>${actsHTML(sim, c, 'creature')}</details>`;
}

export function mountDivine(ui) { return new DivineUI(ui); }

class DivineUI {
  constructor(ui) {
    this.ui = ui; this.sim = ui.sim; this.r = ui.r;
    ensureDivine(this.sim);
    this.tab = 'mir'; this.pending = null; this.confirm = null; this.lastPanel = 0; this.lastBtn = 0; this.last = performance.now();
    this.fx = new DivineFx(this.r, this.sim);
    this.build();
    // 地図のクリックを横取りする：狙っている間は renderer.pick の結果で奇跡を使い、main.js には何も返さない
    const orig = this.r.pick.bind(this.r);
    this.r.pick = (x, y) => { const hit = orig(x, y); if (this.pending) { this.useOn(hit); return null; } return hit; };
  }

  build() {
    const need = (id, tag, cls, html = '') => {
      let el = $(id);
      if (!el) { el = document.createElement(tag); el.id = id; if (cls) el.className = cls; el.innerHTML = html; document.body.appendChild(el); }
      return el;
    };
    this.btn = need('divineBtn', 'button', 'dv-btn');
    this.btn.innerHTML = `${icon('eye', 'dv-bic')}<span class="dv-bl">神の力</span><span class="dv-bg"><i></i></span><span class="dv-bn">0</span>`;
    this.panel = need('divinePanel', 'div', 'panel dv-panel');
    this.panel.hidden = true;
    this.bar = need('dvBar', 'div', 'dv-bar'); this.bar.hidden = true;
    this.toastEl = need('dvToast', 'div', 'dv-toast'); this.toastEl.hidden = true;
    this.goalEl = need('dvGoal', 'div', 'panel dv-goal'); this.goalEl.hidden = true;
    this.btn.onclick = () => this.toggle();
    this.panel.addEventListener('click', (e) => this.onPanelClick(e));
    this.bar.addEventListener('click', (e) => { if (e.target.closest('[data-dvcancel]')) this.cancel(); });
    this.goalEl.addEventListener('click', (e) => {
      const g = e.target.closest('[data-goal]');
      if (g) { const t = this.goalFor; this.goalEl.hidden = true; if (t) this.cast('dream', t, { goal: g.dataset.goal }); else this.startTarget('dream', { goal: g.dataset.goal }); }
      if (e.target.closest('[data-goalx]')) { this.goalEl.hidden = true; this.goalFor = null; }
    });
    // 詳細欄の「神の御業」ボタン
    document.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dv][data-dvt]');
      if (!b) return;
      e.stopPropagation();
      const [kind, raw] = b.dataset.dvt.split(':');
      const target = { kind, id: kind === 'person' ? +raw : raw };
      if (b.dataset.dv === 'dream') { this.openGoals(target); return; }
      this.cast(b.dataset.dv, target);
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.pending) this.cancel(); });
    this.updateButton();
  }

  toggle(force) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    if (open) { $('menu') && ($('menu').hidden = true); this.renderPanel(); }
  }

  // ---------- 奇跡を使う ----------
  startTarget(id, opt = {}) {
    const M = MIRACLES[id];
    if (M.t.includes('none')) { this.cast(id, { kind: 'none' }, opt); return; }
    this.pending = { id, opt };
    const what = M.t.map((t) => ({ place: '地図の場所', person: '人', creature: '生き物' }[t])).join('か');
    this.bar.innerHTML = `${icon(M.icon)}<span><b>${esc(M.name)}</b>${opt.goal ? `「${esc(DREAM_GOALS[opt.goal].name)}」` : ''}：${what}をタップして使う（祈りの力 ${id === 'cure' ? `${M.cost}〜${M.costTown}` : M.cost}）</span><button data-dvcancel>取り消し</button>`;
    this.bar.hidden = false;
    document.body.classList.add('dv-aiming');
    this.panel.hidden = true;
  }
  cancel() { this.pending = null; this.bar.hidden = true; document.body.classList.remove('dv-aiming'); }
  useOn(hit) {
    const { id, opt } = this.pending;
    const M = MIRACLES[id];
    if (!hit) { this.toast('そこには使えない。もう一度タップしてください'); return; }
    const sim = this.sim;
    let target = null;
    if (hit.entity != null) {
      const e = sim.entity(hit.entity);
      const kind = typeof hit.entity === 'number' ? 'person' : 'creature';
      if (M.t.includes(kind)) target = { kind, id: hit.entity };
      else if (M.t.includes('place') && e?.pos) target = { kind: 'place', x: e.pos.x, z: e.pos.z };
    } else if (hit.building != null) {
      const b = sim.building(hit.building);
      if (M.t.includes('place') && b) target = { kind: 'place', x: b.door.x, z: b.door.z };
    } else if (hit.tile && M.t.includes('place')) target = { kind: 'place', x: hit.tile.x, z: hit.tile.z };
    if (!target) { this.toast(M.t.includes('person') && !M.t.includes('place') ? '人をタップしてください' : M.t.includes('creature') && !M.t.includes('place') ? '生き物をタップしてください' : 'そこには使えない'); return; }
    const res = this.cast(id, target, opt);
    if (res?.ok) this.cancel();
  }
  cast(id, target, opt = {}) {
    const M = MIRACLES[id];
    if (id === 'demonlord' || id === 'plague') {
      const key = id + JSON.stringify(target);
      if (!this.confirm || this.confirm.key !== key || performance.now() - this.confirm.t > 4000) { this.confirm = { key, t: performance.now() }; this.toast(`${M.name}は世界を大きく変える。もう一度押すと使う`); return null; }
      this.confirm = null;
    }
    const res = castMiracle(this.sim, id, target, opt);
    this.toast(res.ok ? `${M.name}：${res.msg}` : res.msg, res.ok ? 'ok' : 'ng');
    if (res.ok) { this.drainFx(); this.ui.renderInspector?.(false); this.renderPanel(); this.updateButton(); }
    return res;
  }
  openGoals(target) {
    this.goalFor = target || null;
    this.goalEl.innerHTML = `<h4>${icon('dream')}夢のお告げ：何を告げますか</h4><div class="dv-goals">${Object.entries(DREAM_GOALS).map(([k, g]) => `<button data-goal="${k}">${esc(g.name)}</button>`).join('')}</div><button class="dv-x" data-goalx>やめる</button>`;
    this.goalEl.hidden = false;
  }
  toast(msg, kind = '') {
    const el = this.toastEl;
    el.textContent = msg; el.className = 'dv-toast ' + kind; el.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.hidden = true; }, 3800);
  }

  // ---------- パネル ----------
  onPanelClick(e) {
    const t = e.target;
    const tab = t.closest('[data-dvtab]');
    if (tab) { this.tab = tab.dataset.dvtab; this.renderPanel(); return; }
    if (t.closest('[data-dvclose]')) { this.toggle(false); return; }
    const m = t.closest('[data-mir]');
    if (m) {
      const id = m.dataset.mir;
      if (id === 'dream') { this.openGoals(null); return; }
      const M = MIRACLES[id];
      const chk = canCast(this.sim, id, M.t.includes('none') ? { kind: 'none' } : { kind: M.t[0] });
      if (!chk.ok && !/少し前に/.test(chk.why)) { this.toast(chk.why, 'ng'); return; }
      this.startTarget(id);
      return;
    }
    const a = t.closest('[data-wyes]');
    if (a) { const res = answerWish(this.sim, +a.dataset.wyes); this.toast(res.msg || '願いに応えた', res.ok ? 'ok' : 'ng'); this.drainFx(); this.renderPanel(); return; }
    const n = t.closest('[data-wno]');
    if (n) { const res = ignoreWish(this.sim, +n.dataset.wno); this.toast(res.msg, ''); this.renderPanel(); return; }
  }
  renderPanel() {
    if (this.panel.hidden) return;
    const sim = this.sim, D = ensureDivine(sim), sm = divineSummary(sim);
    const tabs = [['mir', '奇跡'], ['wish', `人々の願い${sm.wishes ? `（${sm.wishes}）` : ''}`], ['faith', '信仰'], ['rec', '御業の記録']];
    let h = `<div class="dv-head">${icon('eye', 'dv-hic')}<b>神の力</b><button class="close" data-dvclose aria-label="閉じる">×</button></div>`;
    h += `<div class="dv-gauge">${this.gaugeHTML()}</div>`;
    h += `<nav class="dv-tabs">${tabs.map(([k, n]) => `<button data-dvtab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</nav><div class="dv-body">`;
    if (this.tab === 'mir') {
      for (const cat of MIRACLE_CATS) {
        h += `<div class="dv-cat">${esc(cat)}</div><div class="dv-grid">`;
        for (const [id, M] of Object.entries(MIRACLES)) {
          if (M.cat !== cat) continue;
          const cost = id === 'cure' ? `${M.cost}〜${M.costTown}` : M.cost;
          const cd = (D.cool[id] ?? -1) > sim.today ? D.cool[id] - sim.today : 0;
          const off = D.power < M.cost || cd > 0 || (id === 'demonlord' && sim.S.demon?.active);
          h += `<button class="dv-m${off ? ' off' : ''}${M.grace < 0 ? ' wrath' : ''}" data-mir="${id}" title="${esc(M.desc)}">${icon(M.icon)}<span class="dv-mn">${esc(M.name)}</span><span class="dv-mc">${cost}</span>${cd ? `<span class="dv-cd">あと${cd}日</span>` : ''}<span class="dv-md">${esc(M.desc)}</span></button>`;
        }
        h += '</div>';
      }
      h += `<p class="dv-hint">奇跡を選んでから、地図の場所・人・生き物をタップします。人や生き物の詳しい欄からも使えます。恵みが続けば信仰が高まり、天罰が続けば人々は神を恐れ、恨み、やがて神を捨てる者も現れます。</p>`;
    } else if (this.tab === 'wish') {
      const open = D.wishes.filter((w) => !w.done).sort((a, b) => b.n - a.n || a.until - b.until);
      if (!open.length) h += '<p class="dv-hint">いまは願いごとがありません。人々は教会や祠で祈るときに、神に願いごとをします。</p>';
      for (const w of open) {
        const p = sim.S.people[w.pid], s = sim.town(w.sid);
        const cost = wishCost(w), left = w.until - sim.today;
        h += `<div class="dv-wish"><div class="dv-wt">${icon('pray')}「${esc(w.txt)}」</div><div class="dv-ws">${p ? `<span class="link" data-pid="${p.id}">${esc(p.given)}</span>` : '誰か'}${w.n > 1 ? `ほか${w.n - 1}人` : ''}（<span class="link" data-goto="${w.x},${w.z}">${esc(s?.name || '')}</span>）・${left > 0 ? `あと${left}日` : '今日まで'}</div>
          <div class="dv-wb"><button data-wyes="${w.id}" class="${D.power < cost ? 'off' : ''}">応える（${cost}）</button><button data-wno="${w.id}">見送る</button></div></div>`;
      }
      const done = D.wishes.filter((w) => w.done).slice(-4).reverse();
      if (done.length) h += `<div class="dv-cat">近ごろの願い</div>${done.map((w) => `<div class="dv-ws">${w.done === 'yes' ? '<span class="down">応えた</span>' : w.done === 'moot' ? '<span>ひとりでに叶った</span>' : '<span class="up">見送った</span>'}「${esc(w.txt)}」</div>`).join('')}`;
      h += `<p class="dv-hint">応えれば感謝され、信仰が深まります。見送ったり放っておいたりすると、人々は失望します。</p>`;
    } else if (this.tab === 'faith') {
      const towns = Object.entries(D.towns || {}).map(([sid, t]) => ({ s: sim.town(+sid), ...t, ch: D.church[sid] || 0 })).filter((x) => x.s && x.n >= 3).sort((a, b) => b.faith - a.faith);
      h += `<div class="dv-stat"><span>奇跡 ${D.stats.miracles || 0}回（うち天罰 ${D.stats.punish || 0}回）</span><span>願いに応えた ${D.stats.answered || 0}・見送った ${D.stats.ignored || 0}</span><span>神を捨てた人 ${D.stats.apostates || 0}・戻った人 ${D.stats.returned || 0}</span></div>`;
      h += `<div class="dv-cat">町ごとの信仰と教会・祠の力</div><div class="dv-towns">${towns.map((x) => `<div class="dv-town"><span class="link" data-goto="${x.s.x},${x.s.z}">${esc(x.s.name)}</span><span class="dv-fb"><i style="width:${x.faith}%"></i></span><span>${x.faith}</span><span class="dv-ch">${x.s.tribal ? '祠' : '教会'} ${x.ch}</span>${x.apo ? `<span class="up">背教${x.apo}</span>` : ''}${D.heresy[x.s.id] ? '<span class="up">異端</span>' : ''}</div>`).join('') || '<p class="dv-hint">明日の朝に数えます。</p>'}</div>`;
      const gl = D.led;
      if (gl.goldAdded) h += `<p class="dv-hint">神の黄金の鉱脈：通した金 ${gl.goldAdded}、掘り出されて硬貨になった分 ${Math.round(gl.goldDug)}（造幣として帳簿に記録）</p>`;
    } else {
      const log = D.log.slice().reverse().slice(0, 40);
      h += log.length ? `<ol class="dv-log">${log.map((l) => `<li class="${l.g < 0 ? 'wrath' : l.g > 0 ? 'grace' : ''}"><span class="t">${esc(this.ui.timeLabel ? this.ui.timeLabel(l.t) : '')}</span>${l.x != null ? `<span class="link" data-goto="${Math.round(l.x)},${Math.round(l.z)}">${esc(l.txt)}</span>` : esc(l.txt)}</li>`).join('')}</ol>` : '<p class="dv-hint">まだ御業を行っていません。行った御業は、年代記にも「神の御業」として残ります。</p>';
    }
    h += '</div>';
    const sc = this.panel.querySelector('.dv-body')?.scrollTop || 0;
    this.panel.innerHTML = h;
    const body = this.panel.querySelector('.dv-body'); if (body) body.scrollTop = sc;
    this.panelKey = this.liveKey();
  }
  gaugeHTML() {
    const D = ensureDivine(this.sim), sm = divineSummary(this.sim);
    return `<div class="dv-gt"><span>祈りの力</span><b>${Math.floor(D.power)}</b><span>／${MAX_POWER}</span></div><div class="dv-gb"><i style="width:${Math.min(100, D.power / MAX_POWER * 100)}%"></i></div>
      <div class="dv-gs">1時間に +${sm.gain}・いま祈っている人 ${sm.praying}人・世界の信仰 ${sm.faith}${sm.heresy ? `・<span class="up">異端 ${sm.heresy}か所</span>` : ''}</div>`;
  }
  // 中身が変わったときだけ作り直す（押している最中にボタンが入れ替わらないように）
  liveKey() {
    const D = ensureDivine(this.sim);
    if (this.tab === 'mir') return 'mir';
    if (this.tab === 'wish') return 'w' + D.wishes.map((w) => `${w.id}:${w.n}:${w.done || ''}:${w.until}`).join(',') + ':' + this.sim.today;
    if (this.tab === 'faith') return 'f' + this.sim.today + ':' + (D.stats.miracles || 0);
    return 'r' + D.log.length + ':' + (D.log[D.log.length - 1]?.t || 0);
  }
  refreshLive() {
    const D = ensureDivine(this.sim), sim = this.sim;
    const g = this.panel.querySelector('.dv-gauge'); if (g) g.innerHTML = this.gaugeHTML();
    const tb = this.panel.querySelector('[data-dvtab="wish"]'); if (tb) { const n = D.wishes.filter((w) => !w.done).length; tb.textContent = `人々の願い${n ? `（${n}）` : ''}`; }
    if (this.liveKey() !== this.panelKey) { this.renderPanel(); return; }
    if (this.tab === 'mir') for (const b of this.panel.querySelectorAll('[data-mir]')) {
      const id = b.dataset.mir, M = MIRACLES[id];
      const cd = (D.cool[id] ?? -1) > sim.today ? D.cool[id] - sim.today : 0;
      b.classList.toggle('off', D.power < M.cost || cd > 0 || (id === 'demonlord' && !!sim.S.demon?.active));
    }
    if (this.tab === 'wish') for (const b of this.panel.querySelectorAll('[data-wyes]')) { const w = D.wishes.find((x) => x.id === +b.dataset.wyes); if (w) b.classList.toggle('off', D.power < wishCost(w)); }
  }
  updateButton() {
    const D = ensureDivine(this.sim);
    const i = this.btn.querySelector('.dv-bg i'), n = this.btn.querySelector('.dv-bn');
    if (i) i.style.width = `${Math.min(100, D.power / MAX_POWER * 100)}%`;
    if (n) n.textContent = Math.floor(D.power);
    const w = D.wishes.filter((x) => !x.done).length;
    this.btn.classList.toggle('wish', w > 0);
    this.btn.dataset.w = w || '';
  }
  drainFx() {
    const q = this.sim._dvFx;
    if (!q || !q.length) return;
    for (const ev of q.splice(0)) { try { this.fx.spawn(ev); } catch (err) { console.error(err); } }
  }
  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.drainFx();
    this.fx.update(dt);
    if (now - this.lastBtn > 500) { this.lastBtn = now; this.updateButton(); }
    if (!this.panel.hidden && now - this.lastPanel > 1000) { this.lastPanel = now; this.refreshLive(); }
  }
}
