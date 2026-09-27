// 新発見のお知らせ（開発部）：この世界で初めて手に入った物（図鑑で「？？？」から★に変わる物）を知らせる
//
// ■ しくみ
//   matter.js の markSeen が、初めての物のときに sim.onDiscover(id, ctx) を呼ぶ（ctx：p＝手に入れた人、hh＝世帯、how＝手に入れ方、sp＝獲物の種、place＝宝の場所）。
//   その場で「誰が・どこで」を文にして S.discover.q にためる（その人があとで動いても、手に入れた場所を正しく出すため）。
//   毎時（discoveryHourly）ためた分を出す：
//     ・1件ずつのお知らせ（画面の上の知らせ・出来事の欄）：1時間に2件まで、1日に6件まで。めずらしい物を先に。
//     ・速報：まれな物（rare 2 以上）のときだけ。
//     ・入りきらなかった物は、日が変わったときに「春3日、新しく12種類の物が見つかった（〈…〉〈…〉など）」とまとめて出す。
//   世界の始まりの日（1日目）は出さない（世界ができたときに市場や持ち物にある物は、もう知られている）。
//
// ■ 画面（main.js の events の振り分けで showDiscovery(ui, e.entry)）
//   画面の上に数秒で消える知らせを出す。人の名前を押すとその人を、物の名前を押すと図鑑のその物を開く。
import { MAT } from './matter.js';
import { JOBS, SPECIES, SEASONS, DAYS_PER_SEASON, DAYS_PER_YEAR } from './data.js';
import { W, H, TILE_NAME, T, tileAt } from './world.js';

const PER_HOUR = 2, PER_DAY = 6;
const PLACE_JP = { dungeon: 'ダンジョン', cave: 'ダンジョン', ruins: '遺跡', pyramid: 'ピラミッド', demoncastle: '魔王城', hideout: '盗賊のアジト', mine: '鉱山' };
const UNDER = new Set(['mine', 'cave', 'ruins', 'pyramid', 'demoncastle', 'hideout']);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function DS(sim) {
  const S = sim.S;
  if (!S.discover) S.discover = { v: 1, q: [], day: -1, shown: 0, dayN: 0, names: [], total: 0, told: 0 };
  return S.discover;
}
export function discoveryStats(sim) { const D = DS(sim); return { total: D.total, told: D.told, summaries: D.summaries || 0 }; }

// ---------- どこで ----------
function nearestTown(sim, x, z, r = 14) {
  let best = null, bd = r;
  for (const s of sim.S.world.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd + (s.r || 0) * 0.5) { bd = d; best = s; } }
  return best;
}
function whereText(sim, p, ctx) {
  const S = sim.S;
  if (p && p.inside != null) {
    const b = sim.building(p.inside);
    if (b && (UNDER.has(b.type) || ctx.place)) return b.name || PLACE_JP[b.type] || '洞窟';
  }
  if (ctx.place) return PLACE_JP[ctx.place] || ctx.place;
  if (p?.pos) {
    const x = Math.round(p.pos.x), z = Math.round(p.pos.z);
    if (x >= 0 && z >= 0 && x < W && z < H) {
      const t = tileAt(S.world, x, z);
      const s = nearestTown(sim, x, z);
      if (s) {
        if (t === T.SEA || t === T.DEEP || t === T.DOCK || t === T.BEACH) return `${s.name}の${t === T.BEACH ? '浜' : '沖'}`;
        if (t === T.RIVER || t === T.BRIDGE) return `${s.name}近くの川`;
        if (t === T.FIELD) return `${s.name}の畑`;
        if (t === T.PASTURE) return `${s.name}の牧草地`;
        if ([T.ROAD, T.PLAZA, T.BLD, T.FENCE, T.WALL].includes(t)) return s.name;
        return `${s.name}近くの${TILE_NAME[t] || '野'}`;
      }
      return `人里はなれた${TILE_NAME[t] || '野'}`;
    }
  }
  const s = ctx.s != null ? sim.town(ctx.s) : null;
  return s ? s.name : '';
}
function personOf(sim, ctx) {
  const S = sim.S;
  if (ctx.p != null && S.people[ctx.p]) return S.people[ctx.p];
  const hh = ctx.hh != null ? S.households[ctx.hh] : null;
  if (!hh) return null;
  const mem = hh.members.map((id) => S.people[id]).filter((q) => q && q.deathYear == null && sim.ageOf(q) >= 14);
  return mem.sort((a, b) => sim.ageOf(b) - sim.ageOf(a))[0] || null;
}

// matter.js の markSeen から呼ばれる（初めての物のときだけ）
function record(sim, id, ctx = {}) {
  const it = MAT.get(id);
  if (!it) return;
  const D = DS(sim);
  const p = personOf(sim, ctx);
  const where = whereText(sim, p, ctx);
  const who = p ? `${JOBS[p.job]?.name || ''}${p.given}` : (ctx.hh != null && sim.S.households[ctx.hh]?.name) || 'ある人';
  const name = `〈${it.name}〉`;
  const sp = ctx.sp ? SPECIES[ctx.sp]?.name || '' : '';
  let verb;
  switch (ctx.how) {
    case 'craft': case 'home': verb = `${where ? `${where}で` : ''}${name}をはじめて作り上げた`; break;
    case 'hunt': verb = `${where ? `${where}で` : ''}${sp || '獲物'}を仕留め、${name}を手に入れた`; break;
    case 'milk': verb = `飼っている${sp || '家畜'}から${name}を手に入れた`; break;
    case 'loot': verb = `${where || '宝箱'}で${name}を見つけた`; break;
    case 'trade': verb = `${where ? `${where}に` : ''}遠い国から${name}を仕入れた`; break;
    case 'buy': verb = `${where ? `${where}の市場で` : '市場で'}${name}を買い求めた`; break;
    default: verb = `${where ? `${where}で` : ''}${name}を手に入れた`;
  }
  D.q.push({ id, t: sim.S.t, pid: p ? p.id : null, x: p?.pos?.x, z: p?.pos?.z, text: `${who}が${verb}`, who, rare: it.rare || 0, v: it.v || 0 });
  if (D.q.length > 300) D.q.splice(0, D.q.length - 300);
}

// 出来事の欄に1行（名前を押せる）。imp が1以上なら速報にも出す（sim.news は同じ文を出来事の欄にもう1行書くので、ここでは速報の列にだけ積む）
function tell(sim, text, ids, pos, imp) {
  sim.pushLog(text, 'event', ids, pos);
  if (!imp) return;
  const S = sim.S, n = { t: S.t, text, imp, x: pos?.x, z: pos?.z };
  (S.news || (S.news = [])).push(n);
  if (S.news.length > 80) S.news.shift();
  sim.events.push({ type: 'news', entry: n });
}
function dayName(d) {
  const doy = ((d % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return `${SEASONS[Math.floor(doy / DAYS_PER_SEASON)]}${(doy % DAYS_PER_SEASON) + 1}日`;
}
function flushDay(sim, D) {
  if (D.day >= 0 && D.names.length && D.dayN > D.shown) {
    const rest = D.dayN;
    const txt = `${dayName(D.day)}、この世界で新しく${rest}種類の物が見つかった（${D.names.slice(0, 4).map((n) => `〈${n.name}〉`).join('')}${rest > 4 ? 'など' : ''}）`;
    tell(sim, txt, [], null, rest >= 5 ? 1 : 0);
    sim.events.push({ type: 'discover', entry: { text: txt, mat: D.names[0]?.id, sum: true } });
    D.summaries = (D.summaries || 0) + 1;
  }
  D.day = sim.today; D.shown = 0; D.dayN = 0; D.names = [];
}

// ---------- 毎時 ----------
export function discoveryHourly(sim) {
  if (!sim.onDiscover) sim.onDiscover = (id, ctx) => { try { record(sim, id, ctx); } catch (e) { /* お知らせの失敗で世界を止めない */ } };
  const D = DS(sim);
  if (D.day !== sim.today) flushDay(sim, D);
  if (!D.q.length) return;
  const list = D.q.splice(0);
  if (sim.S.t < 1440) return;   // 世界の始まりの日は出さない
  list.sort((a, b) => b.rare - a.rare || b.v - a.v);
  let hour = 0;
  for (const e of list) {
    D.total++; D.dayN++;
    const name = MAT.get(e.id)?.name || e.id;
    if (hour < PER_HOUR && D.shown < PER_DAY) {
      hour++; D.shown++; D.told++;
      const text = `新発見！ ${e.text}`;
      tell(sim, text, e.pid != null ? [e.pid] : [], e.x != null ? { x: e.x, z: e.z } : null, e.rare >= 3 ? 2 : e.rare >= 2 ? 1 : 0);
      sim.events.push({ type: 'discover', entry: { text, pid: e.pid, mat: e.id, who: e.who, name } });
      const p = e.pid != null ? sim.S.people[e.pid] : null;
      if (p && p.deathYear == null && p.memories) sim.remember(p, `この世界で誰も手にしたことのない${name}を、初めて手に入れた`, { emo: 0.7, imp: 0.6, k: 'discover' });
    } else if (D.names.length < 8) D.names.push({ id: e.id, name });
    else if (e.rare > 0 && D.names.some((n) => (MAT.get(n.id)?.rare || 0) < e.rare)) { const i = D.names.findIndex((n) => (MAT.get(n.id)?.rare || 0) < e.rare); D.names[i] = { id: e.id, name }; }
  }
}

// ---------- 画面：数秒で消える知らせ ----------
function mount() {
  let box = document.getElementById('discoverToasts');
  if (box) return box;
  const st = document.createElement('style');
  st.textContent = `#discoverToasts{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 124px);z-index:4;display:flex;flex-direction:column;gap:6px;width:min(560px,calc(100vw - 32px));pointer-events:none}
#discoverToasts .dt{pointer-events:auto;background:rgba(42,31,23,.95);border:2px solid var(--line,#120c07);box-shadow:inset 0 0 0 2px var(--amber,#e8a93a),4px 4px 0 rgba(0,0,0,.35);color:var(--parch,#f3e6c4);padding:7px 12px;font-size:13px;line-height:1.5;cursor:pointer;animation:dtIn .35s steps(4)}
#discoverToasts .dt b{color:var(--amber,#e8a93a);margin-right:6px}
#discoverToasts .dt .nm,#discoverToasts .dt .mt{text-decoration:underline;text-underline-offset:2px}
#discoverToasts .dt .mt{color:var(--sky,#8fd0ff)}
#discoverToasts .dt.out{opacity:0;transition:opacity .6s}
@keyframes dtIn{from{transform:translateY(-8px);opacity:0}to{transform:none;opacity:1}}
@media (max-width:760px){#discoverToasts{top:calc(env(safe-area-inset-top,0px) + 134px);font-size:12px}}`;
  document.head.appendChild(st);
  box = document.createElement('div');
  box.id = 'discoverToasts';
  box.setAttribute('aria-live', 'polite');
  document.body.appendChild(box);
  return box;
}
// 図鑑の「物」の欄を開いて、その物を選ぶ（matterdex.js の画面を使う）
export function openDex(ui, id) {
  document.getElementById('side')?.classList.remove('closed');
  document.querySelector('.tabs [data-tab="bestiary"]')?.click();
  ui.renderBestiary();
  document.querySelector('#dexbar [data-dexmode="1"]')?.click();
  if (ui._dex) { ui._dex.sel = id; ui._dex.sig = ''; ui.renderBestiary(); }
  document.getElementById('dexdetail')?.scrollIntoView({ block: 'nearest' });
}
export function showDiscovery(ui, e) {
  if (typeof document === 'undefined' || !e) return;
  const box = mount();
  const el = document.createElement('div');
  el.className = 'dt';
  let html = esc(e.text);
  if (e.name) html = html.replace(esc(`〈${e.name}〉`), `<span class="mt">〈${esc(e.name)}〉</span>`);
  if (e.who) html = html.replace(esc(e.who), `<span class="nm">${esc(e.who)}</span>`);
  el.innerHTML = e.sum ? `<b>図鑑</b>${html}` : html.replace('新発見！ ', '<b>新発見！</b>');
  el.title = e.pid != null ? '名前を押すとその人を、物を押すと図鑑を開きます' : '押すと図鑑を開きます';
  el.addEventListener('click', (ev) => {
    const toPerson = e.pid != null && !ev.target.closest('.mt') && ui.sim.S.people[e.pid];
    if (toPerson) ui.select(e.pid, true);
    else if (e.mat) openDex(ui, e.mat);
    el.remove();
  });
  box.insertBefore(el, box.firstChild);
  while (box.children.length > 3) box.removeChild(box.lastChild);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, 6000);
}
