// 奥地の民族の装い（グラフィック部）
//
// sprites.js の drawPerson と anim_people.js の makePainter は、同じ形の「服装の設定」と「描画の順番」を持つ。
// そこへ小さな差し込みを4か所入れ、民族の人（p.look.tribe）だけこのファイルの描き方を使う。
//   1) outfitOf の頭      … if (TG.isTribalDress(p)) return stage === 'baby' ? 'kid' : 'tribal';
//   2) 服装の switch      … case 'tribal': ({ ...今の変数 } = TG.tribeDress({ ...今の変数 })); break;
//   3) overlay の switch  … case 'tribal': TG.tribeBody(P, {...寸法}); break;    （胴の模様・首飾り・腰布・長靴）
//   4) hat の switch      … case 'tribal': TG.tribeHead(P, {...寸法}); break;    （帽子・髪飾り・顔の模様・背中の外套の柄）
// 描く座標は drawPerson の設計座標（幅16・足元 y23・中心 x8）。正面 F・横 S（左向き）・背中 B。
// 同じ人（id）なら、歩行・会話・攻撃・倒れる姿・建物の中で、いつも同じ装いになる（乱数は id から）。
//
// 11の民族の目印（地図の小さな絵でも、かぶり物の形と服の色で見分ける）
//   フィアナ  苔色の服に葉の外套、顔の左に緑の線、鹿角の首飾り。巫女は鹿角の冠
//   ヤルヴィ  藍の毛皮の上着に赤と黄の帯、四つ角の帽子、白い毛皮の長靴。雪眼鏡の人もいる
//   マヒナ    樹皮布の腰巻き、男は裸の上半身に波の入れ墨、赤い花の髪飾り、貝の首飾り、はだし
//   ミクトラ  白い木綿の貫頭衣に翠と赤の縁取り、羽根の頭飾り、翠玉の耳栓
//   ドルグ    青い長い上着を左前に合わせ黄色の帯、つばの上がった毛皮の帽子、黒い乗馬の長靴
//   ネフェル  白い麻の長い衣、男は目だけを出す藍の頭布、女は藍のかぶり布、目の縁を黒く、金の耳飾り
//   ガライ    灰色の毛織りに革の前掛け、額に鉄の輪、男女とも太い三つ編みに銀の留め具
//   ボロタ    生成りの長い上着に赤い刺繍、葦の蓑、女は色布の頭巾、男はフェルトの帽子
//   ハルン    黒い服に溶岩のような赤と橙の縞、灰よけの首巻き、耐火の革の手袋
//   エルダ    夜空色の長い衣に銀の星、額に光る水晶、若いうちから白い髪
//   ホリン    継ぎはぎの灰色の野良着、女は白い頭巾、男はつばの広い帽子、晴れ着に銀糸の襟巻き

// ================================================================ 小さな道具
function strHash(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
function rngOf(key) {
  let s = strHash(key);
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex2 = (h) => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) { const A = hex2(a), B = hex2(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const lt = (c, k) => mix(c, '#ffffff', k);
const dk = (c, k) => mix(c, '#000000', k);
const pick = (arr, u) => arr[Math.floor(u * arr.length) % arr.length];

// 民族の仕事（tribes.js の TRIBAL_JOBS と同じ）。ほかの仕事に就いた人（王都に出た冒険者など）は、その仕事の装いになる
const TRIBAL_JOBS = new Set(['hunter', 'fisher', 'farmer', 'gatherer', 'tribe_elder', 'shaman', 'weaver', 'miner', 'potter']);
export const TRIBE_IDS = ['fianna', 'yarvi', 'mahina', 'mictla', 'dorgu', 'nefer', 'garai', 'bolota', 'harn', 'elda', 'hollin'];
// 仕事の動き（anim_people.js の JOB_MOTION に足す）
export const TRIBE_MOTION = { tribe_elder: 'lecture', shaman: 'pray' };

export function isTribalDress(p) {
  const t = p?.look?.tribe;
  if (!t || !TRIBE_IDS.includes(t)) return false;
  if (p.rank && !['commoner', 'homeless', 'wanderer'].includes(p.rank)) return false;
  return !p.job || TRIBAL_JOBS.has(p.job);
}

// 役目：長老・巫女・狩人・漁師…と子ども
function roleOf(p, age) {
  if (age < 13) return 'kid';
  if (p.job === 'tribe_elder') return 'elder';
  if (p.job === 'shaman') return 'shaman';
  if (age >= 64) return 'old';
  return p.job || 'none';
}

// 民族ごとの色（lore.js の look.clothes と palette に合わせる）
const PAL = {
  fianna: { main: '#4a6a3a', acc: '#8a6a3a', trim: '#c8b890', leaf: '#6fa04a', cloak: '#2f4a2a', paint: '#3f9a3a', bone: '#e8e0c8' },
  yarvi: { main: '#2a4a8a', acc: '#c9463a', trim: '#f0e8d0', band2: '#e8c83a', fur: '#f0ece0' },
  mahina: { main: '#e8d8a8', acc: '#d9463a', trim: '#3ab0c8', ink: '#2a3a5a', shell: '#f4f0e8' },
  mictla: { main: '#f0e8d0', acc: '#3a9a6a', trim: '#d9463a', gold: '#e8c83a', jade: '#3ab07a' },
  dorgu: { main: '#3a6ab0', acc: '#e8c83a', trim: '#8a3a2a', fur: '#8a6a4a', boot: '#2a1e18', felt: '#c83a2a' },
  nefer: { main: '#f0e8d0', acc: '#2a5aa8', trim: '#e8c83a', kohl: '#1a1410' },
  garai: { main: '#6a6a70', acc: '#c2542d', trim: '#c9a23a', iron: '#8a8a94', silver: '#dfe4ec', leather: '#6a4a2a' },
  bolota: { main: '#d6cba8', acc: '#8a3a3a', trim: '#6a7a4a', straw: '#c8b86a', felt: '#5a4a3a' },
  harn: { main: '#2a2228', acc: '#d9463a', trim: '#e8883a', ash: '#b8b0a8', glove: '#6a4a2a', sulfur: '#e8d040' },
  elda: { main: '#3a3a6a', acc: '#c8c0e8', trim: '#e8c83a', star: '#e8ecf4', crystal: '#a8e8ff' },
  hollin: { main: '#7a7068', acc: '#c8c0b0', trim: '#5a7a9a', white: '#f0ece0', straw: '#b8a070', silver: '#d8dce4' },
};

// ================================================================ 1人ぶんの装いの設計（id と年齢で決まる。描画のたびに使うので覚えておく）
const specCache = new Map();
export function tribeSpec(p, age) {
  const key = `${p.id}|${Math.floor(age)}|${p.job || ''}|${p.sex}`;
  let s = specCache.get(key);
  if (s) return s;
  if (specCache.size > 3000) specCache.clear();
  s = makeSpec(p, age);
  specCache.set(key, s);
  return s;
}
function makeSpec(p, age) {
  const t = p.look.tribe, C = PAL[t] || PAL.fianna, r = rngOf('tribe:' + p.id);
  const u = [r(), r(), r(), r(), r(), r(), r(), r()];
  const f = p.sex === 'f', role = roleOf(p, age), kid = role === 'kid';
  const acc = p.look.acc || '';
  const lead = role === 'elder' || role === 'shaman';
  const s = { t, C, f, role, kid, lead, u, age, acc };
  // 服の色は民族の色を少しだけ人ごとにずらす（同じ村でも一人ひとり違う）
  const j = (c, k = 0.08) => mix(c, u[0] < 0.5 ? '#000000' : '#ffffff', u[1] * k);
  s.j = j;
  switch (t) {
    case 'fianna':
      s.top = j(C.main); s.bottom = j(C.acc, 0.1); s.cape = !kid ? j(C.cloak, 0.06) : null;
      s.skirt = f && !kid; s.faceLine = true; s.neck = !kid ? C.bone : null;
      s.head = role === 'shaman' ? 'antlers' : role === 'elder' ? 'wreath' : role === 'hunter' || u[2] < 0.3 ? 'feather' : null;
      s.item = { hunter: 'bow', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs', weaver: 'yarn', potter: 'pot' }[role] || (u[3] < 0.25 && !kid ? 'bow' : null);
      break;
    case 'yarvi':
      s.top = j(C.main); s.bottom = dk(C.main, 0.35); s.long = !kid; s.bands = [C.acc, C.band2];
      s.boots = C.fur; s.head = kid ? 'redcap' : f ? 'bonnet4' : 'fourpoint';
      s.goggles = !kid && (acc.includes('雪眼鏡') || u[2] < 0.12);
      s.neck = acc.includes('琥珀') && !kid ? '#e8a030' : null;
      s.item = { hunter: 'spear', fisher: 'rod', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs' }[role] || null;
      break;
    case 'mahina':
      s.bare = !f; s.top = f ? j(C.main, 0.05) : null; s.bottom = 'skin'; s.barefoot = true;
      s.wrap = { c: j(C.main, 0.05), b1: C.acc, b2: C.trim, long: f || lead };
      s.tattoo = !kid || u[2] < 0.3; s.flower = f || lead || u[3] < 0.35; s.neck = !kid || f ? 'shell' : null;
      s.head = role === 'shaman' ? 'leis' : role === 'elder' ? 'leis' : null;
      s.item = { fisher: u[4] < 0.55 ? 'spear' : 'rod', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs' }[role] || null;
      break;
    case 'mictla':
      s.top = j(C.main, 0.04); s.long = f && !kid; s.bottom = f ? j(C.main, 0.04) : 'skin'; s.barefoot = !f && u[4] < 0.5;
      s.wrap = !f ? { c: j(C.main, 0.04), b1: C.acc, b2: C.trim, long: lead } : null;
      s.geo = true; s.earplug = !kid; s.head = kid ? 'feather1' : lead || role === 'hunter' ? 'fanbig' : 'fan';
      s.item = { hunter: 'spear', farmer: 'hoe', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs', potter: 'pot' }[role] || null;
      break;
    case 'dorgu':
      s.top = j(C.main); s.long = !kid; s.bottom = dk(C.main, 0.3); s.sash = C.acc; s.lapel = C.trim; s.boots = C.boot;
      s.head = kid ? 'furcap' : 'furhat';
      s.item = { hunter: 'bow', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs' }[role] || null;
      break;
    case 'nefer':
      s.top = j(C.main, 0.04); s.long = !kid; s.bottom = j(C.main, 0.04); s.kohl = !kid || f;
      s.veil = f && !kid; s.tagel = !f && !kid; s.head = kid ? 'band' : f ? 'veil' : null; s.goldEar = f && !kid;
      s.goldHem = true;
      s.item = { gatherer: 'basket', farmer: 'hoe', elder: 'staffplain', shaman: 'orb', weaver: 'yarn', potter: 'pot' }[role] || null;
      break;
    case 'garai':
      s.top = j(C.main); s.bottom = dk(C.main, 0.25); s.apron = !kid ? C.leather : null; s.circlet = !kid || u[2] < 0.5;
      s.braids = age >= 6; s.brooch = !kid; s.stout = u[3] < 0.55;
      s.head = 'circlet';
      s.item = { miner: 'pick', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs' }[role] || (kid ? null : 'hammer');
      break;
    case 'bolota':
      s.top = j(C.main, 0.05); s.long = !kid; s.bottom = j(C.trim); s.embroid = C.acc;
      s.cape = !kid && !lead && u[2] < 0.75 ? C.straw : null; s.mino = !!s.cape;
      s.head = f ? 'headcloth' : 'feltcap'; s.clothC = pick(['#c9463a', '#c8903a', '#b83a5a'], u[4]);
      s.item = { fisher: 'pitchfork', gatherer: 'basket', farmer: 'hoe', elder: 'staffplain', shaman: 'herbs' }[role] || null;
      break;
    case 'harn':
      s.top = j(C.main, 0.06); s.bottom = dk(C.main, 0.1); s.long = lead; s.lava = !kid || u[2] < 0.5; s.scarf = C.ash;
      s.maskUp = !kid && u[3] < 0.3; s.glove = !kid ? C.glove : null; s.boots = '#1a1416'; s.sulfur = acc.includes('硫黄') && !kid;
      s.head = null;
      s.item = { miner: 'pick', gatherer: 'basket', elder: 'staffplain', shaman: 'lantern' }[role] || (acc.includes('角灯') && !kid ? 'lantern' : acc.includes('黒曜') && !kid ? 'dagger' : null);
      break;
    case 'elda':
      s.top = j(C.main); s.long = !kid; s.bottom = dk(C.main, 0.2); s.stars = true; s.crystal = true; s.goldHem = !kid;
      s.whiten = Math.max(0, Math.min(0.85, (age - 14) / 30)); s.thin = u[3] < 0.7; s.head = 'crystal';
      s.item = { elder: 'staffplain', shaman: 'orb', gatherer: 'basket', farmer: 'hoe' }[role] || (acc.includes('角灯') && !kid ? 'lantern' : acc.includes('巻物') && !kid ? 'scroll' : null);
      break;
    case 'hollin':
    default:
      s.top = j(C.main); s.bottom = dk(C.main, 0.22); s.patches = true; s.skirt = f && !kid;
      s.head = f ? 'whitekerchief' : kid ? null : 'widehat'; s.silverScarf = lead || (!kid && u[2] < 0.12);
      s.item = { farmer: u[4] < 0.5 ? 'hoe' : 'pitchfork', gatherer: 'basket', elder: 'staffplain', shaman: 'herbs', weaver: 'yarn' }[role] || null;
      break;
  }
  // 長老・巫女は、民族の色の長い衣（長老は落ち着いた色、巫女は飾りの色）
  if (role === 'elder') { s.long = true; s.top = t === 'mahina' ? s.top : mix(s.top || C.main, '#6a5a4a', 0.25); }
  if (role === 'shaman') { s.long = true; if (t !== 'mahina' && t !== 'nefer' && t !== 'mictla') s.top = mix(s.top || C.main, C.acc, 0.35); s.paint = true; }
  if (kid) { s.long = false; s.cape = null; s.apron = null; }
  return s;
}

// ================================================================ 2) 服装の設定（今の変数を受け取り、書きかえた値を返す）
export function tribeDress(v) {
  const p = v.p, age = v.age ?? 30;
  const s = tribeSpec(p, age), C = s.C;
  const o = { ...v };
  delete o.p; delete o.age; delete o.stage; delete o.kid; delete o.f; delete o.skin; delete o.rich;
  const skin = v.skin;
  o.hat = 'tribal'; o.overlay = 'tribal'; o.hood = null; o.capeC = null; o.apron = null; o.stripes = null; o.sleeve = null; o.barefoot = !!s.barefoot;
  o.item = s.item || null;
  o.top = s.bare ? skin : s.top || v.top;
  if (s.bare) o.sleeve = 'bare';
  o.bottom = s.bottom === 'skin' ? skin : s.bottom || v.bottom;
  o.long = s.long ? o.top : null;
  o.skirt = !!s.skirt && !s.long;
  if (s.cape) o.capeC = s.cape;
  if (s.apron) o.apron = s.apron;
  if (s.glove) o.handWrap = s.glove;
  if (s.stout && o.build === 'thin') o.build = 'normal';
  if (s.stout && s.u[5] < 0.6) o.build = 'stout';
  if (s.thin) o.build = 'thin';
  if (s.tagel) { o.hood = C.acc; o.mask = true; }
  if (s.whiten && v.hair) o.hair = mix(v.hair, '#eeeef2', s.whiten);
  o.accent = C.acc;
  o.scarf = null;
  return o;
}

// ================================================================ 共通の小さな描き方
// 足元の一番下のピクセル（足・靴）を長靴の色にする
function boots(P, g, c) {
  const cols = g.S ? [3, 4, 5, 6, 7, 8, 9, 10, 11] : [4, 5, 6, 9, 10, 11];
  for (const x of cols) for (const y of [g.FEET, g.FEET - 1]) {
    if (!P.get(x, y) || P.get(x, y + 1)) continue;
    P.px(x, y, c);
    if (!g.long && P.get(x, y - 1)) P.px(x, y - 1, c); // 長い上着でなければ、足首まで長靴
  }
}
// 腰巻き（男の裸の脚の上に巻く布。縁に2色の模様）
function wrapSkirt(P, g, w) {
  const h = Math.max(2, (w.long ? g.legH - 1 : Math.ceil(g.legH / 2)) + 0);
  for (let y = 0; y < h; y++) {
    const wide = y >= h - 1 ? 1 : 0;
    if (g.S) P.rect(g.sx0 - wide, g.legTop + y, g.sw + wide * 2, 1, w.c); else P.rect(g.bx0 - wide, g.legTop + y, g.tw + wide * 2, 1, w.c);
  }
  const yb = g.legTop + h - 1, x0 = (g.S ? g.sx0 : g.bx0) - 1, x1 = (g.S ? g.sx1 : g.bx1) + 1;
  for (let x = x0; x <= x1; x++) P.px(x, yb, (x & 1) ? w.b1 : w.b2);
  P.rect(g.S ? g.sx0 : g.bx0, g.legTop, g.S ? g.sw : g.tw, 1, w.b1); // 帯
}
// 頭巾・かぶり布の下からはみ出す髪を、布の色でおおう（布が背中へ垂れる）
function coverHair(P, g, c) {
  const H = hex2(g.hair), near = (q) => { if (!q) return false; const A = hex2(q); return Math.abs(A[0] - H[0]) + Math.abs(A[1] - H[1]) + Math.abs(A[2] - H[2]) < 60; };
  for (let y = g.t - 3; y <= g.t + 12; y++) for (let x = 2; x <= 13; x++) if (near(P.get(x, y))) P.px(x, y, (x + y) % 5 === 0 ? dk(c, 0.1) : c);
}
// 首飾り
function necklace(P, g, cs) {
  const c = (i) => (Array.isArray(cs) ? cs[i % cs.length] : cs);
  if (g.F) { P.px(6, g.nk, c(0)); P.px(7, g.nk + 1, c(1)); P.px(8, g.nk + 1, c(2)); P.px(9, g.nk, c(3)); }
  else if (g.S) { P.px(g.sx0, g.nk, c(0)); P.px(g.sx0 + 1, g.nk + 1, c(1)); }
}
// 長い衣の裾の帯（2色）
function hemBands(P, g, c1, c2) {
  const x0 = (g.S ? g.sx0 : g.bx0) - 1, w = (g.S ? g.sw : g.tw) + 2;
  if (g.long) { P.overRect(x0, g.FEET - 3, w, 1, c1); if (c2) P.overRect(x0, g.FEET - 2, w, 1, c2); }
  else { P.overRect(x0 + 1, g.torsoBot, w - 2, 1, c1); if (c2) P.overRect(x0 + 1, g.torsoBot - 1, w - 2, 1, c2); }
}

// ================================================================ 3) 胴（服の模様・首飾り・腰巻き・長靴）。腕と頭より先に描く
export function tribeBody(P, g) {
  const s = tribeSpec(g.p, g.age ?? 30), C = s.C, F = g.F, S = g.S, B = g.B;
  const tx0 = g.tx0, tx1 = g.tx1, nk = g.nk, tb = g.torsoBot;
  switch (s.t) {
    case 'fianna':
      // 鹿革の胴着：胸に紐の交差、腰に木の実の数珠
      if (!B && !s.kid) { P.px(S ? g.sx0 + 1 : 7, nk + 2, dk(s.top, 0.3)); P.px(S ? g.sx0 + 1 : 8, nk + 3, dk(s.top, 0.3)); if (F) { P.px(8, nk + 2, dk(s.top, 0.3)); P.px(7, nk + 3, dk(s.top, 0.3)); } }
      P.rect(tx0, tb, tx1 - tx0 + 1, 1, dk(C.acc, 0.2));
      if (!B) for (let x = tx0 + 1; x < tx1; x += 2) P.px(x, tb, C.trim);
      if (s.neck && !B) necklace(P, g, [C.bone, '#c8b890', C.bone, '#c8b890']);
      if (s.lead) hemBands(P, g, C.leaf, null);
      break;
    case 'yarvi':
      // 赤と黄の帯：裾・肩・袖口
      hemBands(P, g, s.bands[0], s.bands[1]);
      if (!s.kid) { P.rect(S ? g.sx0 : tx0, nk, S ? g.sw : tx1 - tx0 + 1, 1, s.bands[0]); if (F) P.rect(7, nk + 1, 2, 1, s.bands[1]); }
      P.rect(tx0, tb, tx1 - tx0 + 1, 1, dk(C.main, 0.35));
      if (s.neck && !B) necklace(P, g, s.neck);
      boots(P, g, s.boots);
      break;
    case 'mahina':
      if (s.wrap) wrapSkirt(P, g, s.wrap);
      if (s.tattoo && s.bare) { // 肩と胸の波の入れ墨
        const ink = C.ink;
        if (F || B) { for (const x0 of [tx0, tx1 - 1]) { P.px(x0, nk + 1, ink); P.px(x0 + 1, nk + 2, ink); P.px(x0, nk + 3, ink); } }
        if (S) { P.px(g.sx0 + 1, nk + 1, ink); P.px(g.sx0 + 2, nk + 2, ink); P.px(g.sx0 + 3, nk + 1, ink); P.px(g.sx0 + 2, nk + 3, ink); }
      }
      if (!s.bare && !B) { P.rect(tx0, nk, tx1 - tx0 + 1, 1, lt(s.top, 0.2)); P.rect(tx0, tb, tx1 - tx0 + 1, 1, C.acc); }
      if (s.neck && !B) necklace(P, g, [C.shell, C.trim, C.shell, C.trim]);
      if (s.wrap && s.bare && g.fr != null) { /* 腰巻きは脚より上に描いた */ }
      break;
    case 'mictla':
      if (s.wrap) wrapSkirt(P, g, s.wrap);
      // 翠と赤の幾何学の縁取り：首まわりと裾
      if (!B) { P.rect(S ? g.sx0 : 6, nk, S ? 2 : 4, 1, C.acc); if (F) { P.px(7, nk + 1, C.trim); P.px(8, nk + 1, C.trim); } }
      { const y = g.long ? g.FEET - 2 : tb; const x0 = (S ? g.sx0 : g.bx0) - (g.long ? 1 : 0), x1 = (S ? g.sx1 : g.bx1) + (g.long ? 1 : 0);
        for (let x = x0; x <= x1; x++) { P.over(x, y, ((x >> 1) & 1) ? C.acc : C.trim); P.over(x, y - 1, (x & 1) ? C.acc : s.top); } }
      break;
    case 'dorgu': {
      // 左前の合わせ（首から右の脇へ斜めの縁）と黄色の帯
      if (F) { for (let i = 0; i < 4; i++) P.px(7 + i, nk + i, s.lapel); P.px(6, nk, s.lapel); }
      if (S) P.rect(g.sx0, nk, 1, 3, s.lapel);
      P.rect(tx0, tb - 1, tx1 - tx0 + 1, 2, s.sash);
      if (F) P.px(tx0 + 1, tb + 1, s.sash);
      if (g.long) P.overRect((S ? g.sx0 : g.bx0) - 1, g.FEET - 2, (S ? g.sw : g.tw) + 2, 1, s.lapel);
      boots(P, g, s.boots);
      break;
    }
    case 'nefer':
      // 白い麻：胸に青いガラスの護符、裾に金の筋
      if (!B && !s.kid) { P.px(S ? g.sx0 + 1 : 7, nk + 2, '#3a8ad8'); if (F) P.px(8, nk + 2, '#2a5aa8'); }
      if (s.goldHem) hemBands(P, g, C.trim, null);
      if (!s.long && !B) P.rect(tx0, tb, tx1 - tx0 + 1, 1, C.acc);
      break;
    case 'garai':
      // 厚い毛織りの縦うね・竜の鱗の銀の胸飾り
      for (let x = tx0 + 1; x < tx1; x += 2) P.overRect(x, nk + 1, 1, g.torsoH - 2, dk(s.top, 0.08));
      P.rect(tx0, tb, tx1 - tx0 + 1, 1, C.acc);
      if (s.brooch && !B) { P.px(S ? g.sx0 + 1 : 7, nk + 1, C.silver); if (F) P.px(8, nk + 1, lt(C.silver, 0.2)); }
      boots(P, g, '#3a3036');
      break;
    case 'bolota':
      // 赤い刺繍：襟・前立て・裾
      if (!B) { P.rect(S ? g.sx0 : 6, nk, S ? 2 : 4, 1, s.embroid); if (F) for (let y = nk + 1; y < (g.long ? g.FEET - 2 : tb); y += 2) P.px(7 + ((y >> 1) & 1), y, s.embroid); }
      hemBands(P, g, s.embroid, null);
      if (g.long) for (let x = (S ? g.sx0 : g.bx0); x <= (S ? g.sx1 : g.bx1); x += 2) P.over(x, g.FEET - 2, lt(s.embroid, 0.3));
      break;
    case 'harn':
      // 溶岩のような赤と橙の縞（斜めの流れ）
      if (s.lava) {
        const y1 = nk + 2, y2 = nk + 4;
        for (let x = tx0; x <= tx1; x++) { P.over(x, y1 + ((x >> 1) & 1), C.trim); P.over(x, y2 + ((x + 1 >> 1) & 1), C.acc); }
        if (g.long) for (let x = (S ? g.sx0 : g.bx0) - 1; x <= (S ? g.sx1 : g.bx1) + 1; x++) P.over(x, g.FEET - 2 - ((x >> 1) & 1), C.acc);
        else for (let y = g.legTop + 1; y < g.FEET - 1; y += 3) { if (!S) { P.over(5, y, C.trim); P.over(10, y + 1, C.trim); } else P.over(8, y, C.trim); }
      }
      if (s.sulfur && !B) P.rect(S ? g.sx0 : 7, nk + 3, 1, 2, C.sulfur);
      boots(P, g, s.boots);
      break;
    case 'elda':
      // 銀の星の刺繍（決まった位置に3つ）と金の裾
      { const pts = [[0.25, 0.25], [0.7, 0.45], [0.4, 0.75]], x0 = S ? g.sx0 : g.bx0, w = S ? g.sw : g.tw, h = (g.long ? g.FEET - 2 : tb) - nk;
        for (const [a, b] of pts) { const x = x0 + Math.floor(a * (w - 1)), y = nk + 1 + Math.floor(b * (h - 1)); P.over(B ? 15 - x - 1 : x, y, C.star); } }
      if (s.goldHem) hemBands(P, g, C.trim, null);
      P.rect(tx0, tb, tx1 - tx0 + 1, 1, dk(C.main, 0.3));
      break;
    case 'hollin':
    default:
      // 継ぎはぎ（生成りと青灰の当て布）
      if (s.patches) { const pts = [[s.u[5], s.u[6], C.acc], [s.u[7], s.u[1], C.trim]];
        for (const [a, b, c] of pts) { const x = (S ? g.sx0 : g.bx0) + Math.floor(a * ((S ? g.sw : g.tw) - 2)), y = nk + 1 + Math.floor(b * (g.torsoH - 3)); P.overRect(x, y, 2, 2, mix(c, s.top, 0.25)); } }
      P.rect(tx0, tb, tx1 - tx0 + 1, 1, '#4a3a2a');
      break;
  }
}

// ================================================================ 4) 頭（帽子・髪飾り・顔の模様）と、背中の外套の柄
export function tribeHead(P, g) {
  const s = tribeSpec(g.p, g.age ?? 30), C = s.C, F = g.F, S = g.S, B = g.B, t = g.t, eyY = g.eyY, hH = g.headH;
  const HX = (x) => (B ? 15 - x : x); // 背中は左右が逆
  // ---- 背中の外套（フィアナの葉の外套・ボロタの葦の蓑）
  if (B && s.cape) {
    const y0 = g.tT + 1, y1 = g.FEET - 3;
    if (s.mino) for (let y = y0; y <= y1; y++) for (let x = g.armL - 1; x <= g.armR + 1; x++) { if (P.get(x, y) === s.cape && ((x + (y >> 1)) % 3 === 0)) P.px(x, y, dk(s.cape, 0.22)); }
    else for (const [a, b] of [[0.2, 0.2], [0.65, 0.35], [0.35, 0.6], [0.8, 0.7], [0.5, 0.9]]) { const x = g.armL + Math.round(a * (g.armR - g.armL)), y = y0 + Math.round(b * (y1 - y0)); if (P.get(x, y) === s.cape) { P.px(x, y, C.leaf || lt(s.cape, 0.25)); P.px(x + 1, y, dk(C.leaf || s.cape, 0.2)); } }
  }
  if (S && s.mino && s.cape) for (let y = g.tT + 2; y <= g.FEET - 3; y += 2) P.over(g.sx1 + 2, y, dk(s.cape, 0.22));
  // ---- 顔の模様
  if (!B) {
    if (s.faceLine) { if (F) { P.px(10, eyY, C.paint); P.px(10, eyY + 1, C.paint); P.px(10, eyY + 2, C.paint); } else P.px(7, eyY + 1, C.paint); }
    if (s.paint && s.t !== 'nefer') { const pc = s.t === 'harn' ? '#e8883a' : s.t === 'elda' ? '#c8c0e8' : '#f4f0e8'; if (F) { P.px(5, eyY + 1, pc); P.px(6, eyY + 2, pc); P.px(10, eyY + 1, pc); P.px(9, eyY + 2, pc); } else P.px(6, eyY + 2, pc); }
    if (s.kohl) { if (F) { P.px(5, eyY, C.kohl); P.px(10, eyY, C.kohl); } else P.px(5, eyY, C.kohl); }
    if (s.earplug) { if (F) { P.px(4, eyY + 1, C.jade); P.px(11, eyY + 1, C.jade); } else P.px(8, eyY + 1, C.jade); }
    if (s.goldEar) { if (F) { P.px(4, eyY + 2, C.trim); P.px(11, eyY + 2, C.trim); } else P.px(8, eyY + 2, C.trim); }
    if (s.goggles) { if (F) { P.rect(4, eyY, 8, 1, '#e8dcc0'); P.px(6, eyY, '#1a1410'); P.px(9, eyY, '#1a1410'); } else { P.rect(4, eyY, 5, 1, '#e8dcc0'); P.px(5, eyY, '#1a1410'); } }
  } else if (s.earplug) { P.px(4, eyY + 1, C.jade); P.px(11, eyY + 1, C.jade); }
  // ---- 首から上の布（ハルンの灰よけ・ホリンの銀糸の襟巻き）
  if (s.scarf) {
    P.rect(S ? g.sx0 - 1 : 5, g.nk, S ? g.sw + 1 : 6, 1, s.scarf);
    if (F) P.rect(9, g.nk + 1, 1, 2, dk(s.scarf, 0.1)); if (S) P.rect(g.sx1 + 1, g.nk, 2, 1, dk(s.scarf, 0.08)); if (B) P.rect(6, g.nk + 1, 1, 2, dk(s.scarf, 0.1));
    if (s.maskUp && !B) { if (F) P.rect(5, g.mouthY - 1, 6, t + hH - g.mouthY + 1, s.scarf); else P.rect(4, g.mouthY - 1, 4, t + hH - g.mouthY + 1, s.scarf); }
  }
  if (s.silverScarf) { P.rect(S ? g.sx0 - 1 : 5, g.nk, S ? g.sw + 1 : 6, 1, C.silver); if (F) P.px(9, g.nk + 1, C.silver); }
  // ---- 髪型の上書き（ガライの太い三つ編み）
  if (s.braids && !g.hid) {
    const hc = g.hair, hd = dk(g.hair, 0.18), n = s.kid ? 4 : 7;
    if (F) for (const x of [4, 11]) { for (let i = 0; i < n; i++) P.px(x, t + 2 + i, (i & 1) ? hd : hc); P.px(x, t + 2 + n, C.silver); }
    if (B) for (const x of [6, 9]) { for (let i = 0; i < n; i++) P.px(x, t + 3 + i, (i & 1) ? hd : hc); P.px(x, t + 3 + n, C.silver); }
    if (S) { for (let i = 0; i < n; i++) P.px(10, t + 3 + i, (i & 1) ? hd : hc); P.px(10, t + 3 + n, C.silver); }
  }
  // ---- かぶり物
  const R = (x, y, w, h, c) => P.rect(x, y, w, h, c);
  switch (s.head) {
    case 'feather': { // 髪に鷹の羽根を1本
      const x = S ? 10 : HX(10);
      P.px(x, t - 1, '#f0ece0'); P.px(x, t - 2, '#f0ece0'); P.px(x + (S || !B ? 1 : -1), t - 3, '#8a6a4a'); P.px(x, t, '#8a6a4a');
      break;
    }
    case 'wreath': // 長老：葉の冠
      R(4, t, 8, 1, C.main); for (let x = 4; x <= 11; x += 2) P.px(x, t - 1, C.leaf); break;
    case 'antlers': // 巫女：鹿角の冠
      R(4, t, 8, 1, C.acc);
      for (const sgn of [-1, 1]) { const x = sgn < 0 ? 5 : 10; P.px(x, t - 1, C.bone); P.px(x + sgn, t - 2, C.bone); P.px(x + sgn, t - 3, C.bone); P.px(x + sgn * 2, t - 4, C.bone); P.px(x, t - 3, C.bone); P.px(x + sgn * 2, t - 2, C.bone); }
      if (S) { P.px(4, t - 1, C.bone); P.px(3, t - 2, C.bone); }
      break;
    case 'fourpoint': { // ヤルヴィ：四つ角の帽子（藍・赤い縁・黄の筋・4つのとがり）
      const m = C.main, red = C.acc;
      R(4, t - 1, 8, 2, m); R(4, t, 8, 1, red); R(5, t - 2, 6, 1, m); P.px(7, t - 1, C.band2); P.px(8, t - 1, C.band2);
      if (!S) { P.px(4, t - 2, m); P.px(4, t - 3, red); P.px(11, t - 2, m); P.px(11, t - 3, red); P.px(7, t - 3, m); P.px(8, t - 3, m); P.px(7, t - 4, red); }
      else { P.px(4, t - 2, m); P.px(3, t - 3, red); P.px(11, t - 2, m); P.px(12, t - 3, red); P.px(8, t - 3, m); P.px(8, t - 4, red); }
      if (s.lead) { P.px(7, t - 5, C.band2); }
      break;
    }
    case 'bonnet4': // ヤルヴィの女：赤い丸い帽子に藍の縁
      R(4, t - 1, 8, 2, C.acc); R(5, t - 2, 6, 1, C.acc); R(4, t, 8, 1, C.main); P.px(7, t - 2, C.band2); P.px(8, t - 1, C.band2);
      if (S) R(10, t + 1, 2, 2, C.acc); else { P.px(4, t + 1, C.acc); P.px(11, t + 1, C.acc); }
      break;
    case 'redcap': R(5, t - 1, 6, 2, C.acc); R(4, t, 8, 1, C.main); P.px(8, t - 2, C.band2); break;
    case 'leis': // マヒナの長老・巫女：花の冠
      for (let x = 4; x <= 11; x++) P.px(x, t, (x & 1) ? '#d9463a' : '#f0d040'); P.px(6, t - 1, '#4f9a3a'); P.px(9, t - 1, '#4f9a3a'); break;
    case 'feather1': P.px(S ? 10 : 8, t - 1, C.acc); P.px(S ? 10 : 8, t - 2, C.acc); R(5, t, 6, 1, C.trim); break;
    case 'fan': case 'fanbig': { // ミクトラ：羽根の頭飾り（緑・赤・黄の扇）
      const big = s.head === 'fanbig', cs = [C.acc, C.trim, C.gold, C.acc, C.gold, C.trim, C.acc, C.gold];
      R(4, t, 8, 1, C.gold); if (F) P.px(7, t, C.trim);
      if (!S) {
        const hts = big ? [2, 3, 4, 5, 5, 4, 3, 2] : [1, 2, 3, 3, 3, 3, 2, 1];
        for (let i = 0; i < 8; i++) for (let k = 1; k <= hts[i]; k++) P.px(4 + i, t - k, k === hts[i] ? cs[(i + 1) % 8] : cs[i]);
      } else {
        const hts = big ? [2, 3, 4, 5, 5] : [1, 2, 3, 3, 2];
        for (let i = 0; i < hts.length; i++) for (let k = 1; k <= hts[i]; k++) P.px(8 + i, t - k + (i > 2 ? 0 : 0), k === hts[i] ? cs[(i + 1) % 8] : cs[i]);
        P.px(12, t - 1, C.acc);
      }
      break;
    }
    case 'furhat': case 'furcap': { // ドルグ：つばの上がった毛皮の帽子と、赤いとがった頂
      const fur = C.fur, top = C.felt, kid = s.head === 'furcap';
      R(3, t, 10, 1, fur); R(3, t - 1, 2, 1, fur); R(11, t - 1, 2, 1, fur); R(5, t - 1, 6, 1, dk(fur, 0.15));
      R(5, t - 2, 6, 1, top); R(6, t - 3, 4, 1, top); if (!kid) { R(7, t - 4, 2, 1, top); P.px(8, t - 5, C.acc); } else P.px(7, t - 4, C.acc);
      P.px(4, t, lt(fur, 0.2)); P.px(7, t - 2, lt(top, 0.2));
      if (s.lead) { R(3, t + 1, 1, 2, fur); R(12, t + 1, 1, 2, fur); }
      break;
    }
    case 'veil': { // ネフェルの女：藍のかぶり布
      const c = C.acc;
      coverHair(P, g, c);
      R(4, t - 1, 8, 2, c);
      if (F) { R(4, t + 1, 1, 6, c); R(11, t + 1, 1, 6, c); R(3, t + 4, 1, 4, c); R(12, t + 4, 1, 4, c); }
      if (S) { R(8, t + 1, 4, 5, c); R(10, t + 6, 3, 3, c); }
      if (B) { R(4, t + 1, 8, 6, c); R(3, t + 4, 10, 4, c); }
      R(6, t - 1, 2, 1, lt(c, 0.2)); if (!B) P.px(S ? 5 : 7, t, C.trim);
      break;
    }
    case 'band': R(4, t + 1, 8, 1, C.acc); break;
    case 'circlet': // ガライ：額の鉄の輪（まん中に灰鉄の鋲）
      if (s.circlet) { R(4, t + 1, 8, 1, C.iron); if (F) P.px(7, t + 1, C.silver); if (S) P.px(4, t + 1, C.silver); if (s.lead) { P.px(7, t, C.trim); P.px(8, t, C.trim); } }
      break;
    case 'headcloth': { // ボロタの女：色布の頭巾（あごの下で結ぶ）
      const c = s.clothC; coverHair(P, g, c); R(4, t - 1, 8, 2, c); R(5, t - 2, 6, 1, c);
      if (F) { R(4, t + 1, 1, 3, c); R(11, t + 1, 1, 3, c); P.px(5, t, lt(c, 0.25)); P.px(9, t - 1, lt(c, 0.25)); }
      if (S) { R(9, t + 1, 3, 3, c); P.px(12, t + 3, c); }
      if (B) { R(4, t + 1, 8, 3, c); P.px(7, t + 4, c); P.px(8, t + 4, c); }
      break;
    }
    case 'feltcap': R(5, t - 2, 6, 2, C.felt); R(4, t, 8, 1, dk(C.felt, 0.2)); P.px(6, t - 2, lt(C.felt, 0.2)); break;
    case 'crystal': // エルダ：額に光る水晶と細い銀の輪
      R(5, t + 1, 6, 1, s.kid ? null : C.acc);
      if (F) { P.px(7, t + 1, C.crystal); P.px(8, t + 1, C.crystal); P.px(7, t, lt(C.crystal, 0.5)); }
      if (S) P.px(4, t + 1, C.crystal);
      if (s.lead && !S) { P.px(7, t - 1, C.trim); P.px(8, t - 1, C.trim); }
      break;
    case 'whitekerchief': { // ホリンの女：白い頭巾
      const c = C.white; coverHair(P, g, c); R(4, t - 1, 8, 2, c); R(5, t - 2, 6, 1, c);
      if (F) { R(4, t + 1, 1, 4, c); R(11, t + 1, 1, 4, c); R(5, t + 5, 1, 1, c); R(10, t + 5, 1, 1, c); }
      if (S) R(8, t + 1, 4, 4, c);
      if (B) R(4, t + 1, 8, 4, c);
      break;
    }
    case 'widehat': { // ホリンの男：つばの広い帽子
      const c = C.straw; R(2, t, 12, 1, dk(c, 0.15)); R(5, t - 2, 6, 2, c); R(5, t - 1, 6, 1, C.trim);
      if (F) R(5, t + 1, 6, 1, dk(g.skin, 0.1));
      break;
    }
    default: break;
  }
  // ---- 髪飾り（マヒナの赤い花）
  if (s.flower) {
    const fx = F ? 10 : S ? 9 : 4, fy = t;
    P.px(fx, fy, '#d9463a'); P.px(fx + 1, fy, '#d9463a'); P.px(fx, fy + 1, '#d9463a'); P.px(fx + 1, fy + 1, '#e86a4a'); P.px(fx + (F ? 0 : 1), fy + (F ? 1 : 0), '#f0d040');
  }
  // ---- ネフェルの男：頭布の目の細い隙間に黒い縁どり（hood と mask で頭布は描かれている）
  if (s.tagel && !B) { if (F) { P.px(5, eyY, C.kohl); P.px(10, eyY, C.kohl); } else P.px(5, eyY, C.kohl); }
}

// ================================================================ 見本・試験用：民族の人をこしらえる（本体では使わない）
export function samplePerson(tribe, o = {}) {
  const L = { fianna: [['#e8c9a8', '#d9b08c'], ['#3a2a1a', '#6b4a2a', '#8a6a3a']], yarvi: [['#f0d8c0', '#e8c8a8'], ['#e8e0c8', '#c8b080', '#3a2a1a']], mahina: [['#c8905a', '#b07a4a', '#9a6440'], ['#1a1410', '#2e1f16']], mictla: [['#c8905a', '#b07a4a'], ['#1a1410']], dorgu: [['#d9a077', '#c98e5e'], ['#1a1410', '#2e1f16']], nefer: [['#c98e5e', '#b97e55'], ['#1a1410', '#2e1f16']], garai: [['#e8b98f', '#d9a077'], ['#8a8478', '#3a2a1a', '#c2542d']], bolota: [['#f3d2b3', '#e8b98f'], ['#c2542d', '#6b4226', '#e8c872']], harn: [['#e8b98f', '#d9a077'], ['#1a1410', '#3a2020']], elda: [['#f3d2b3', '#f0dcc8'], ['#e8e0d0', '#c8c0b0', '#b07a3a']], hollin: [['#f3d2b3', '#e8b98f'], ['#b07a3a', '#6b4226', '#e8c872']] }[tribe];
  const C = PAL[tribe], r = rngOf('sample:' + tribe + (o.id || ''));
  return {
    id: o.id ?? `sample_${tribe}_${o.sex || 'm'}_${o.job || ''}`, sex: o.sex || 'm', job: o.job ?? 'gatherer', rank: 'commoner', tribe,
    look: { skin: pick(L[0], r()), hair: pick(L[1], r()), shirt: C.main, pants: C.acc, trim: C.trim, hairStyle: 1, beard: o.beard ?? false, tribe, acc: o.acc || '' },
  };
}
