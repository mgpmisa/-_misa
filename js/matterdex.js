// 物の図鑑（画面の「図鑑」の欄）：種類・産地・使い道で探す。まだ誰も手に入れていない物は「？」
// ui.js の renderBestiary の最初で renderDex(ui) を呼ぶ。true を返したら物の図鑑を描いたので、生き物の図鑑は描かない。
import { SPECIES, JOBS } from './data.js';
import { MAT, CAT_JP, HOW_JP, USE_JP, ON_JP, MAKER } from './matter.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LIMIT_JP = { vein: '鉱脈（掘れば減り、長い年月で少し戻る）', grove: '林や群生地（採れば減り、育てば戻る）', herd: '群れ（生き物の数しだい）', relic: '遺物（世界に数えるほど）', none: '尽きない' };
const RARE_JP = ['ふつう', '少ない', 'まれ', 'とてもまれ', '伝説'];
const ALL = [...MAT.values()];

function mount(ui) {
  if (document.getElementById('dexbar')) return;
  const tab = document.getElementById('tab-bestiary'); if (!tab) return;
  const bar = document.createElement('div');
  bar.id = 'dexbar';
  bar.innerHTML = `<div class="dexmode"><button data-dexmode="0" class="on">生き物</button><button data-dexmode="1">物</button></div>
<div id="dexctl" hidden><input id="dexq" placeholder="名前で探す" style="width:9em">
<select id="dexcat"><option value="">すべての種類</option>${Object.entries(CAT_JP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
<select id="dexhow"><option value="">すべての手に入れ方</option>${Object.entries(HOW_JP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
<select id="dexon"><option value="">すべての産地</option>${Object.entries(ON_JP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
<select id="dexuse"><option value="">すべての使い道</option>${Object.entries(USE_JP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
<select id="dexknown"><option value="">知っている物も知らない物も</option><option value="1">手に入れた物だけ</option><option value="0">まだの物だけ</option></select>
<div id="dexcount" class="sub"></div><div id="dexdetail"></div><ul id="dexlist" class="plist"></ul><button id="dexmore">もっと見る</button></div>`;
  tab.insertBefore(bar, tab.firstChild);
  ui._dex = { on: false, sig: '', t: 0, n: 150, sel: null };
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dexmode]');
    if (b) {
      ui._dex.on = b.dataset.dexmode === '1';
      bar.querySelectorAll('[data-dexmode]').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('dexctl').hidden = !ui._dex.on;
      const bl = document.getElementById('bestiary'); if (bl) bl.hidden = ui._dex.on;
      ui._dex.sig = ''; ui.renderBestiary();
      return;
    }
    const li = e.target.closest('[data-mat]');
    if (li) { ui._dex.sel = li.dataset.mat; ui._dex.sig = ''; ui.renderBestiary(); return; }
    if (e.target.id === 'dexmore') { ui._dex.n += 150; ui._dex.sig = ''; ui.renderBestiary(); }
  });
  for (const id of ['dexq', 'dexcat', 'dexhow', 'dexon', 'dexuse', 'dexknown']) {
    const el = document.getElementById(id);
    el.addEventListener(id === 'dexq' ? 'input' : 'change', () => { ui._dex.n = 150; ui._dex.sig = ''; ui.renderBestiary(); });
  }
}

function priceInfo(sim, id) {
  const S = sim.S; let lo = Infinity, hi = 0, where = [];
  for (const [sid, t] of Object.entries(S.towns)) {
    if ((t.stock?.[id] || 0) < 0.5 || !(t.price?.[id] > 0)) continue;
    const pr = t.price[id]; lo = Math.min(lo, pr); hi = Math.max(hi, pr);
    where.push(sim.town(+sid)?.name);
  }
  return where.length ? { lo, hi, where } : null;
}
function srcText(s) {
  const how = HOW_JP[s.how] || s.how;
  const on = (s.on || []).map((o) => (s.how === 'hunt' || s.how === 'milk' ? SPECIES[o]?.name || o : ON_JP[o] || o)).join('・');
  return `${how}${on ? `（${on}）` : ''}${s.rate ? `　1回あたり平均${s.rate}` : ''}`;
}
function makerName(by) { const j = (MAKER[by] || [by])[0]; return by === 'household' ? '家の人' : JOBS[j]?.name || JOBS[by]?.name || by; }

function detailHTML(sim, id) {
  const it = MAT.get(id); if (!it) return '';
  const seen = sim.S.matter?.seen?.[id];
  if (seen == null) return `<div class="section"><h4>？？？</h4><p>${esc(CAT_JP[it.cat] || it.cat)}の物。この世界では、まだ誰も手に入れていない。</p></div>`;
  const pi = priceInfo(sim, id);
  const mk = it.make ? `<dt>材料</dt><dd>${Object.entries(it.make.from || {}).map(([k, n]) => `${esc(MAT.get(k)?.name || k)}×${n}`).join('、') || 'なし'}（${esc(makerName(it.make.by))}が${it.make.t || 1}時間${it.make.n > 1 ? `で${it.make.n}個` : ''}）</dd>` : '';
  return `<div class="section"><h4>${esc(it.name)}</h4><p>${esc(it.desc || '')}</p><dl class="kv">
<dt>種類</dt><dd>${esc(CAT_JP[it.cat] || it.cat)}・${esc(it.sub)}（${RARE_JP[it.rare || 0]}）</dd>
<dt>手に入れ方</dt><dd>${it.src.map((s) => esc(srcText(s))).join('<br>')}</dd>${mk}
<dt>使い道</dt><dd>${it.use.map((u) => esc((USE_JP[u.k] || u.k) + (u.note ? `：${u.note}` : ''))).join('<br>')}</dd>
<dt>重さ</dt><dd>${it.w}kg（1枠に${it.stack}個まで）${it.keep ? `・${it.keep}日で傷む` : ''}</dd>
${it.limit ? `<dt>有限度</dt><dd>${esc(LIMIT_JP[it.limit] || it.limit)}</dd>` : ''}
<dt>値打ち</dt><dd>目安 ${it.v}銅貨${pi ? `・いまの値段 ${pi.lo.toFixed(1)}〜${pi.hi.toFixed(1)}銅貨（${esc(pi.where.slice(0, 5).join('・'))}${pi.where.length > 5 ? 'など' : ''}）` : '・いまはどの市場にも並んでいない'}</dd>
<dt>はじめて手に入った日</dt><dd>${seen}日目</dd></dl></div>`;
}

// ui.renderBestiary から呼ぶ。物の図鑑を描いたら true
export function renderDex(ui) {
  mount(ui);
  const D = ui._dex;
  if (!D || !D.on) return false;
  const sim = ui.sim, seen = sim.S.matter?.seen || {};
  const val = (id) => document.getElementById(id)?.value || '';
  const q = val('dexq').trim(), cat = val('dexcat'), how = val('dexhow'), on = val('dexon'), use = val('dexuse'), known = val('dexknown');
  const sig = [q, cat, how, on, use, known, D.n, D.sel].join('|');
  const now = Date.now();
  if (sig === D.sig && now - D.t < 5000) return true;
  D.sig = sig; D.t = now;
  const list = ALL.filter((it) => {
    const k = seen[it.id] != null;
    if (known === '1' && !k) return false;
    if (known === '0' && k) return false;
    if (cat && it.cat !== cat) return false;
    if (how && !it.src.some((s) => s.how === how)) return false;
    if (on && !it.src.some((s) => (s.on || []).includes(on))) return false;
    if (use && !it.use.some((u) => u.k === use)) return false;
    if (q && !(k && it.name.includes(q))) return false;
    return true;
  });
  const nKnown = ALL.filter((it) => seen[it.id] != null).length;
  document.getElementById('dexcount').textContent = `この世界で手に入った物 ${nKnown}／${ALL.length}種類　（条件に合う物 ${list.length}種類）`;
  document.getElementById('dexlist').innerHTML = list.slice(0, D.n).map((it) => {
    const k = seen[it.id] != null;
    return `<li data-mat="${it.id}"><span class="kind">${esc(CAT_JP[it.cat] || it.cat)}</span><span>${k ? '★ ' + esc(it.name) : '？？？'}</span><span class="sub">${k ? `${it.v}銅貨` : ''}</span></li>`;
  }).join('');
  document.getElementById('dexmore').hidden = list.length <= D.n;
  document.getElementById('dexdetail').innerHTML = D.sel ? detailHTML(sim, D.sel) : '';
  return true;
}
