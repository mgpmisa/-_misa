// 神の干渉（案A）：見ている人が「神」として世界に奇跡と天罰をもたらす。
//
// ■ 祈りの力（S.divine.power）
//   ・時間とともに少しずつたまる（1時間 0.35）。
//   ・住人の祈り（教会・祠で pray の行動をしている人、民族の祭りの祈り）でも増える。
//   ・信仰が高い世界ほど増えやすい（世界の信仰 0〜100 で ×0.5〜×1.5）。
//   ・奇跡ごとに消費量がある（MIRACLES の cost）。上限は MAX_POWER。
//
// ■ 世界の反応
//   ・見た人は記憶する（p.memories、k:'divine'。会話の種になる「〜た」で終わる文）。
//   ・噂になる（sim.gossip → rumor.js の尾ひれ）。年代記に「神の御業」として残る。
//   ・一人ひとりの心：p.values.faith（信心）と p.dv = { love 慕う, fear 恐れる, grudge 恨む }（0〜100）。
//   ・恵みが続けば信仰が高まり、天罰や災いが続けば恐れと恨みが増える。恨みが深く信心が薄い人は神を捨て（p.apostate）、
//     町に背教者が集まると「異端の集まり」ができる（S.divine.heresy[町]）。恵みを受けると戻ることもある。
//   ・教会や祠の力（S.divine.church[町]）＝町の信仰×祈る人の数。祈りの力のたまり方に効く。
//   ・人々は祈るときに願いごとをする（S.divine.wishes）。神が応えれば感謝され、見送れば（期限切れも）失望される。
//
// ■ お金の決まり（社長の決まり「お金には必ず出どころと行き先がある」）
//   ・奇跡でお金は湧かせない。
//   ・黄金の鉱脈（S.divine.veins）は金の「地金」を地中に置くだけ。鉱夫が掘った分だけが王立造幣所で硬貨になる。
//     これは「外から入る分」として、銀行の帳簿（S.bank.led.issue・造幣）と S.divine.led.goldDug に記録する。
//     支払い：掘った鉱夫の家計へ9割、国庫へ造幣益1割（どちらも新しく打ち出した硬貨）。
//   ・宝の噂は、すでに土の中にある持ち主の分からない壺（S.bank.hoards の埋蔵のお金）の場所を知らせるだけ。
//     見つけた人の家計へ（正直者は半分を国庫へ）。埋蔵→家計の移動として銀行の帳簿（led.unearth）に記録する。
//     壺が無いときは、お金ではなく古い宝物（品物）が眠っている。
//   ・災いの復興費は、今までどおり weather.js が国庫から出す（国庫→家計・町の蓄え）。
//
// ■ 本体からの呼び方
//   import { divineDaily, divineHourly, divineDecide } from './divine.js';
//   newHour の最後：divineHourly(this);   newDay の最後の方：divineDaily(this);
//   decide の cands.sort の直前：divineDecide(this, p, cands, add);
//   画面は divineui.js（castMiracle / answerWish / ignoreWish を呼ぶ）。
import { DEATH_CAUSES, JOBS, SPECIES, KINGDOMS } from './data.js';
import { W, H, T, walkable } from './world.js';
import { ensureWx, regionIndex, regionGeo, forceDisaster, syncLegacyWeather } from './weather.js';
import { startEpidemic, AILS } from './health.js';
import { makeItem, addItem, autoEquip, TREASURE_ITEMS } from './items.js';
import { makeCreature, killCreature } from './creatures.js';
import { humanStats } from './society.js';

if (!DEATH_CAUSES.divine) DEATH_CAUSES.divine = '天の雷';

export const MAX_POWER = 300;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = (v) => Math.round(v);

// ---------- 奇跡の一覧 ----------
// t：使える相手（place=地図の場所、person=人、creature=生き物、none=相手なし）
// grace：恵み(+)か天罰(−)か。cd：同じ奇跡をもう一度使えるまでの日数
export const MIRACLES = {
  rain:     { name: '恵みの雨',     cat: '自然', icon: 'rain',   cost: 30,  t: ['place'],             cd: 1,  grace: 1,  desc: 'その地方に雨を降らせる。日照りを終わらせる' },
  harvest:  { name: '豊作の祝福',   cat: '自然', icon: 'wheat',  cost: 50,  t: ['place'],             cd: 3,  grace: 1,  desc: '近くの町の畑の実りを10日のあいだ増やす' },
  drought:  { name: '日照り',       cat: '自然', icon: 'sun',    cost: 60,  t: ['place'],             cd: 6,  grace: -1, desc: 'その地方の雨を止め、畑を干上がらせる' },
  storm:    { name: '大嵐',         cat: '自然', icon: 'storm',  cost: 70,  t: ['place'],             cd: 6,  grace: -1, desc: 'その地方に大嵐を吹かせ、家々の屋根を飛ばす' },
  plague:   { name: '流行り病',     cat: '自然', icon: 'skull',  cost: 80,  t: ['place'],             cd: 12, grace: -1, desc: 'いちばん近い町に流行り病をはやらせる' },
  cure:     { name: '病を癒す',     cat: '自然', icon: 'cross',  cost: 15,  costTown: 45, t: ['person', 'place'], cd: 0, grace: 1, desc: '人なら一人の病と傷を、場所ならその町の病人すべてを癒す' },
  dream:    { name: '夢のお告げ',   cat: '人',   icon: 'dream',  cost: 25,  t: ['person'],            cd: 0,  grace: 0,  desc: '夢に現れ、生きる目的を告げる' },
  love:     { name: '恋の芽生え',   cat: '人',   icon: 'heart',  cost: 20,  t: ['person'],            cd: 0,  grace: 1,  desc: 'ふさわしい相手との恋を芽生えさせる（連れ合いがいれば愛が深まる）' },
  courage:  { name: '勇気を授ける', cat: '人',   icon: 'flame',  cost: 15,  t: ['person'],            cd: 0,  grace: 1,  desc: '恐れを消し、勇気を与える' },
  doubt:    { name: '疑いの種',     cat: '人',   icon: 'snake',  cost: 20,  t: ['person'],            cd: 0,  grace: -1, desc: 'いちばん親しい人への疑いを植え、二人の仲を裂く' },
  repent:   { name: '改心',         cat: '人',   icon: 'dove',   cost: 35,  t: ['person'],            cd: 0,  grace: 1,  desc: '悪人や恨みを抱く者の心を入れ替えさせる' },
  relic:    { name: '伝説の武器',   cat: '物',   icon: 'sword',  cost: 90,  t: ['person', 'place'],   cd: 8,  grace: 1,  desc: '天から伝説の武器を授ける（場所なら、拾った者のものになる）' },
  treasure: { name: '宝の噂',       cat: '物',   icon: 'scroll', cost: 25,  t: ['place'],             cd: 3,  grace: 0,  desc: '土に眠る宝の噂を流す。人々が探しに行く' },
  gold:     { name: '黄金の鉱脈',   cat: '物',   icon: 'gold',   cost: 100, t: ['place'],             cd: 15, grace: 1,  desc: '近くの鉱山に金の鉱脈を通す。掘った分だけ硬貨になる' },
  dragon:   { name: '竜の目覚め',   cat: '魔物', icon: 'dragon', cost: 120, t: ['place'],             cd: 15, grace: -1, desc: '眠れる竜を目覚めさせる' },
  horde:    { name: '魔物の群れ',   cat: '魔物', icon: 'horde',  cost: 60,  t: ['place'],             cd: 5,  grace: -1, desc: '魔物の群れを呼び、近くの町を襲わせる' },
  demonlord:{ name: '魔王の目覚め', cat: '魔物', icon: 'crown',  cost: 250, t: ['none'],              cd: 60, grace: -1, desc: '魔界の奥で眠る魔王を目覚めさせる' },
  calm:     { name: '魔物を鎮める', cat: '魔物', icon: 'moon',   cost: 30,  t: ['place', 'creature'], cd: 0,  grace: 1,  desc: 'まわりの魔物の怒りを3日のあいだ鎮める' },
  save:     { name: '命を救う',     cat: '御業', icon: 'wing',   cost: 30,  t: ['person'],            cd: 0,  grace: 1,  desc: '死にかけた人を光で包み、命をつなぐ' },
  smite:    { name: '天罰の雷',     cat: '御業', icon: 'bolt',   cost: 40,  t: ['person', 'creature'], cd: 0, grace: -1, desc: '雷を落とす。悪人は命を落とし、罪なき者は深手を負う' },
  souls:    { name: '魂の安らぎ',   cat: '御業', icon: 'candle', cost: 20,  t: ['place'],             cd: 1,  grace: 1,  desc: 'その町の死者の魂を安らげ、遺された人の悲しみを和らげる' },
};
export const MIRACLE_CATS = ['自然', '人', '物', '魔物', '御業'];
// 夢のお告げで告げる目的
export const DREAM_GOALS = {
  king:    { name: '王になれ',         dream: '王になる',               say: '「汝、王となれ」' },
  revenge: { name: '仇を討て',         dream: '仇を討つ',               say: '「仇を討て」' },
  journey: { name: '旅に出よ',         dream: 'まだ見ぬ土地を旅する',   say: '「旅に出よ」' },
  protect: { name: '愛する者を守れ',   dream: '愛する者を守り抜く',     say: '「愛する者を守れ」' },
  wealth:  { name: '富を求めよ',       dream: '大きな富を築く',         say: '「富を求めよ」' },
  serve:   { name: '神に仕えよ',       dream: '神に仕える',             say: '「我に仕えよ」' },
};
const GOAL_DAYS = 40;

// ---------- 状態 ----------
export function ensureDivine(sim) {
  const S = sim.S;
  if (!S.divine) S.divine = { v: 1, power: 80, seq: 1, cool: {}, log: [], wishes: [], church: {}, heresy: {}, relics: [], hunts: [], veins: [], tone: { grace: 0, wrath: 0 },
    stats: { miracles: 0, punish: 0, answered: 0, ignored: 0, apostates: 0, returned: 0, prayers: 0 }, led: { goldAdded: 0, goldDug: 0, hoardFound: 0 }, holdWx: {}, faith: 50, lastHour: -1 };
  const D = S.divine;
  D.cool = D.cool || {}; D.log = D.log || []; D.wishes = D.wishes || []; D.church = D.church || {}; D.heresy = D.heresy || {};
  D.relics = D.relics || []; D.hunts = D.hunts || []; D.veins = D.veins || []; D.tone = D.tone || { grace: 0, wrath: 0 }; D.holdWx = D.holdWx || {};
  D.stats = D.stats || {}; D.led = D.led || { goldAdded: 0, goldDug: 0, hoardFound: 0 };
  if (D.faith == null) D.faith = 50;
  return D;
}
const dvOf = (p) => p.dv || (p.dv = { love: 0, fear: 0, grudge: 0 });
const aliveP = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null && q.needs ? q : null; };
// 見た目の効果（画面側 divineui.js が取り出す。保存しない）
function fx(sim, kind, x, z, extra = {}) {
  const q = sim._dvFx || (sim._dvFx = []);
  q.push({ kind, x, z, t: Date.now(), ...extra });
  if (q.length > 30) q.splice(0, q.length - 30);
}
function logD(sim, D, txt, x, z, grace) {
  D.log.push({ t: sim.S.t, txt, x, z, g: grace });
  if (D.log.length > 60) D.log.splice(0, D.log.length - 60);
}
function nearestTown(sim, x, z, maxD = 1e9) {
  let best = null, bd = maxD;
  for (const s of sim.S.world.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best;
}
const kOf = (s) => (s && s.kingdom != null ? s.kingdom : undefined);
function townPeople(sim, sid, minAge = 6) { return sim.living().filter((p) => p.s === sid && sim.ageOf(p) >= minAge); }
function peopleNear(sim, x, z, r, minAge = 6) { return sim.living().filter((p) => p.pos && Math.hypot(p.pos.x - x, p.pos.z - z) <= r && sim.ageOf(p) >= minAge); }
function walkNear(sim, x, z, maxR = 8) {
  const w = sim.S.world;
  for (let r = 0; r <= maxR; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const xx = Math.round(x) + dx, zz = Math.round(z) + dz;
    if (xx < 1 || zz < 1 || xx >= W - 1 || zz >= H - 1) continue;
    const t = w.tiles[zz * W + xx];
    if (walkable(t) && t !== T.BLD) return { x: xx, z: zz };
  }
  return null;
}
export function isEvil(sim, p) {
  if (!p) return false;
  return !!(sim.S.wanted?.[p.id] || p.bandit || p.uwRole || p.revenge != null || JOBS[p.job]?.crook || ['thief', 'pirate', 'bandit'].includes(p.job));
}

// ---------- 世界の反応（奇跡・天罰を見た人の心） ----------
// o = { x, z, r, sid, grace(+1恵み/−1天罰), deserved, mem(見た人の記憶), vmem(当事者の記憶), victims:Set(id), bless:Set(id), gossip:'述語', imp }
function react(sim, o) {
  const D = ensureDivine(sim), R = sim.rng;
  let ws = [];
  if (o.sid != null) ws = townPeople(sim, o.sid);
  if (o.x != null) { const near = peopleNear(sim, o.x, o.z, o.r || 12); const seen = new Set(ws.map((p) => p.id)); for (const p of near) if (!seen.has(p.id)) ws.push(p); }
  if (ws.length > 260) ws = R.shuffle(ws.slice()).slice(0, 260);
  const g = o.grace || 0;
  if (g > 0) D.tone.grace += g; else if (g < 0 && !o.deserved) D.tone.wrath += -g; else if (g < 0) D.tone.wrath += 0.3;
  for (const p of ws) {
    const d = dvOf(p), v = p.values;
    const me = o.victims?.has(p.id), blessed = o.bless?.has(p.id);
    const kinHit = o.victims && !me && [...o.victims].some((id) => { const q = sim.S.people[id]; return q && (q.hh === p.hh || p.spouseId === id); });
    let txt = o.mem, emo = g > 0 ? 0.6 : g < 0 ? -0.6 : 0.2;
    if (me && o.vmem) { txt = o.vmem; emo = g > 0 ? 0.95 : -0.9; }
    else if (blessed && o.bmem) { txt = o.bmem; emo = 0.9; }
    if (txt) sim.remember(p, txt, { emo, imp: me || blessed ? 0.95 : o.imp ?? 0.7, k: 'divine', where: o.x != null ? { x: r1(o.x), z: r1(o.z) } : undefined });
    if (g > 0) {
      v.faith = clamp(v.faith + (blessed || me ? 0.07 : 0.025) * g, 0.02, 0.99);
      d.love = clamp(d.love + (blessed || me ? 18 : 6), 0, 100);
      d.grudge = clamp(d.grudge - (blessed || me ? 12 : 3), 0, 100);
    } else if (g < 0) {
      if (o.deserved && !me && !kinHit) {
        d.fear = clamp(d.fear + 6, 0, 100);
        if (v.faith > 0.45 || p.pers.C > 0.6) { v.faith = clamp(v.faith + 0.015, 0.02, 0.99); d.love = clamp(d.love + 3, 0, 100); }
      } else {
        d.fear = clamp(d.fear + (me || kinHit ? 18 : 9), 0, 100);
        const hurt = me || kinHit ? 22 : 7;
        if (v.faith > 0.75 && !(me || kinHit)) { v.faith = clamp(v.faith + 0.01, 0.02, 0.99); }   // 信心深い人は「神の怒りを鎮めねば」と祈る
        else { d.grudge = clamp(d.grudge + hurt * (1.2 - v.faith), 0, 100); v.faith = clamp(v.faith - (me || kinHit ? 0.08 : 0.02) * (1.3 - p.pers.C * 0.6), 0.02, 0.99); }
      }
    }
    p.dvSeen = (p.dvSeen || 0) + 1;
  }
  // 民族の里：守り神のお恵み（またはお怒り）だと受け止める
  if (o.sid != null) {
    const s = sim.town(o.sid);
    if (s?.tribal && s.tribeV != null) { const V = sim.S.tribes?.villages?.[s.tribeV]; if (V && V.faith != null) V.faith = clamp(V.faith + (g > 0 ? 3 : g < 0 && !o.deserved ? -4 : 0), 0, 100); }
  }
  // 噂：目撃者のひとり（いちばん話し好き）が言いふらす
  if (o.gossip && ws.length) {
    const adults = ws.filter((p) => sim.ageOf(p) >= 14);
    const teller = adults.sort((a, b) => b.pers.E - a.pers.E)[0];
    if (teller) {
      const hear = sim.living().filter((q) => q.s === teller.s && q.id !== teller.id && (teller.rel?.[q.id]?.a || 0) > 15).slice(0, 8);
      sim.gossip(teller, o.gossip, g >= 0 ? 0.6 : -0.6, hear, { silent: true, imp: 0.6 });
    }
  }
  return ws.length;
}

// ---------- 使えるか ----------
export function miracleCost(id, target) {
  const M = MIRACLES[id]; if (!M) return 0;
  if (id === 'cure' && target?.kind === 'place') return M.costTown;
  return M.cost;
}
export function canCast(sim, id, target) {
  const D = ensureDivine(sim), M = MIRACLES[id];
  if (!M) return { ok: false, why: 'そのような奇跡はない' };
  const cost = miracleCost(id, target);
  if (D.power < cost) return { ok: false, why: `祈りの力が足りない（${r1(D.power)}／${cost}）` };
  if ((D.cool[id] ?? -1) > sim.today) return { ok: false, why: `この奇跡はまだ使えない（あと${D.cool[id] - sim.today}日）` };
  if (id === 'demonlord' && sim.S.demon?.active) return { ok: false, why: '魔王はすでに目覚めている' };
  if (target?.kind === 'person') {
    const p = aliveP(sim, target.id);
    if (!p) return { ok: false, why: 'その人はもういない' };
    if ((p.dvLast?.[id] ?? -99) > sim.today - 3) return { ok: false, why: `${p.given}には、少し前に同じ御業を授けたばかりだ` };
  }
  return { ok: true, cost };
}

// ---------- 奇跡を使う ----------
// target = { kind:'place', x, z } | { kind:'person', id } | { kind:'creature', id } | { kind:'none' }
// opt.goal（夢のお告げの目的） opt.wish（願いに応えるとき）
// 戻り値 { ok, msg }
export function castMiracle(sim, id, target = { kind: 'none' }, opt = {}) {
  const D = ensureDivine(sim), M = MIRACLES[id];
  const chk = canCast(sim, id, target);
  if (!chk.ok) return { ok: false, msg: chk.why };
  if (!M.t.includes(target.kind)) return { ok: false, msg: `${M.name}は、その相手には使えない` };
  const fn = CAST[id];
  let res;
  try { res = fn(sim, target, opt, D); } catch (e) { console.error(e); return { ok: false, msg: '御業がうまく届かなかった' }; }
  if (!res || !res.ok) return res || { ok: false, msg: '何も起こらなかった' };
  const cost = opt.discount ? r1(chk.cost * opt.discount) : chk.cost;
  D.power = Math.max(0, D.power - cost);
  if (M.cd) D.cool[id] = sim.today + M.cd;
  D.stats.miracles = (D.stats.miracles || 0) + 1;
  if (M.grace < 0) D.stats.punish = (D.stats.punish || 0) + 1;
  if (target.kind === 'person') { const p = sim.S.people[target.id]; if (p) (p.dvLast || (p.dvLast = {}))[id] = sim.today; }
  logD(sim, D, res.log || res.msg, res.x, res.z, M.grace);
  if (res.chron) sim.chron(`神の御業：${res.chron}`, res.k);
  return res;
}

const CAST = {
  // ===== 自然 =====
  rain(sim, t, opt, D) {
    const wx = ensureWx(sim), i = regionIndex(t.x, t.z), st = wx.r[i];
    const cold = st.temp <= 1;
    st.w = cold ? 'snow' : 'rain'; st.streak = 1; st.wet = Math.max(st.wet, 0) + 2.5; st.dry = 0;
    D.holdWx[i] = { w: st.w, until: sim.today + 1 };
    const reg = regionGeo(sim).regs[i];
    const ended = [];
    for (const sid of reg.sids) {
      if (!wx.drought[sid]) continue;
      const d = sim.S.disasters.find((q) => q.id === wx.drought[sid]);
      delete wx.drought[sid];
      if (d && !d.end) d.end = sim.today;
      ended.push(sid);
    }
    syncLegacyWeather(sim);
    const s = nearestTown(sim, t.x, t.z);
    fx(sim, 'rain', t.x, t.z);
    const names = ended.map((sid) => sim.town(sid).name).join('と');
    const msg = ended.length ? `${names}に恵みの雨が降り注いだ。長い日照りが終わった` : `${s.name}のあたりに、晴れた空からにわかに恵みの雨が降り出した`;
    sim.news(msg, ended.length ? 2 : 1, { x: t.x, z: t.z });
    for (const sid of ended.length ? ended : [s.id]) react(sim, { sid, grace: 1, mem: ended.length ? '日照りの続く空から、にわかに恵みの雨が降った。神さまが祈りを聞いてくださった' : '晴れた空から、急に不思議な雨が降り出した', gossip: '晴れた空から恵みの雨が降るのを見た', imp: 0.7 });
    return { ok: true, msg, x: t.x, z: t.z, chron: ended.length ? `${names}の日照りを、恵みの雨で終わらせた` : null, k: kOf(s) };
  },
  harvest(sim, t, opt, D) {
    const wx = ensureWx(sim);
    const towns = sim.S.world.settlements.filter((s) => Math.hypot(s.x - t.x, s.z - t.z) < s.r + 25 && !sim.S.towns[s.id]?.occupied);
    if (!towns.length) { const s = nearestTown(sim, t.x, t.z, 60); if (s) towns.push(s); }
    if (!towns.length) return { ok: false, msg: '近くに畑のある町がない' };
    for (const s of towns) {
      const f = wx.fx[s.id] || (wx.fx[s.id] = { harvest: 1, hUntil: -1, closed: -1 });
      f.harvest = Math.max(f.hUntil >= sim.today ? f.harvest : 1, 1) * 1.35;
      f.harvest = Math.min(1.6, f.harvest);
      f.hUntil = Math.max(f.hUntil, sim.today + 10);
      fx(sim, 'bless', s.x, s.z);
    }
    const names = towns.map((s) => s.name).join('と');
    const msg = `${names}の畑に金色の光が降りた。麦の穂が重く垂れはじめた`;
    sim.news(msg, 1, { x: towns[0].x, z: towns[0].z });
    const farmers = new Set(sim.living().filter((p) => towns.some((s) => s.id === p.s) && ['farmer', 'shepherd', 'rancher'].includes(p.job)).map((p) => p.id));
    for (const s of towns) react(sim, { sid: s.id, grace: 1, mem: '畑に金色の光が降りるのを見た。今年は豊作になりそうだ', bless: farmers, bmem: '自分の畑に金色の光が降りた。麦の穂がみるみる重くなった', gossip: '畑に金色の光が降りるのを見た' });
    return { ok: true, msg, x: towns[0].x, z: towns[0].z, chron: `${names}の畑に豊作の祝福を与えた`, k: kOf(towns[0]) };
  },
  drought(sim, t, opt, D) {
    const wx = ensureWx(sim), i = regionIndex(t.x, t.z), st = wx.r[i];
    const reg = regionGeo(sim).regs[i];
    const sids = reg.sids.filter((id) => !sim.S.towns[id]?.occupied && !wx.drought[id]);
    if (!sids.length) return { ok: false, msg: 'この地方には、日照りで苦しむ町がない（またはすでに日照り）' };
    st.w = 'hot'; st.wet = 0; st.dry = Math.max(st.dry, 12); st.streak = 1;
    D.holdWx[i] = { w: 'sunny', until: sim.today + 5 };
    forceDisaster(sim, 'drought', i);
    syncLegacyWeather(sim);
    const s = sim.town(sids[0]);
    fx(sim, 'sun', s.x, s.z);
    for (const sid of sids) react(sim, { sid, grace: -1, deserved: false, mem: '空が焼けるように赤く、雲ひとつない日が続いた。神さまのお怒りだろうか', gossip: '日照りは神の怒りだと言っていた', imp: 0.65 });
    const names = sids.map((id) => sim.town(id).name).join('と');
    return { ok: true, msg: `${names}に日照りをもたらした`, x: s.x, z: s.z, chron: `${names}に日照りの罰をくだした`, k: kOf(s) };
  },
  storm(sim, t, opt, D) {
    const wx = ensureWx(sim), i = regionIndex(t.x, t.z), st = wx.r[i];
    const reg = regionGeo(sim).regs[i];
    const sids = reg.sids.filter((id) => !sim.S.towns[id]?.occupied);
    if (!sids.length) return { ok: false, msg: 'この地方には町がない' };
    st.w = st.temp <= 0.5 ? 'blizzard' : 'storm'; st.streak = 1; st.wet += 1.5;
    D.holdWx[i] = { w: st.w, until: sim.today };
    forceDisaster(sim, 'storm', i);
    syncLegacyWeather(sim);
    const s = sim.town(sids[0]);
    fx(sim, 'storm', s.x, s.z);
    for (const sid of sids) react(sim, { sid, grace: -1, deserved: false, mem: '真っ黒な雲が渦を巻き、神の怒りのような大嵐が吹き荒れた', gossip: '神の怒りの大嵐に遭った', imp: 0.7 });
    const names = sids.map((id) => sim.town(id).name).join('と');
    return { ok: true, msg: `${names}に大嵐を吹かせた`, x: s.x, z: s.z, chron: `${names}に大嵐を吹かせた`, k: kOf(s) };
  },
  plague(sim, t, opt, D) {
    const s = nearestTown(sim, t.x, t.z, 80);
    if (!s || sim.S.towns[s.id]?.occupied) return { ok: false, msg: '近くに町がない' };
    const e = startEpidemic(sim, s);
    if (!e) return { ok: false, msg: `${s.name}ではすでに流行り病が広がっている` };
    fx(sim, 'plague', s.x, s.z);
    react(sim, { sid: s.id, grace: -1, deserved: false, mem: '町に緑色の霧が立ちこめ、咳をする人が増えた。神さまに見放されたのだろうか', gossip: '流行り病は天罰だと言っていた', imp: 0.7 });
    return { ok: true, msg: `${s.name}に流行り病をはやらせた`, x: s.x, z: s.z, chron: `${s.name}に流行り病の罰をくだした`, k: kOf(s) };
  },
  cure(sim, t, opt, D) {
    if (t.kind === 'person') {
      const p = aliveP(sim, t.id);
      const had = !!p.ail || p.hp < p.maxhp * 0.8 || !!p.scars?.length;
      if (!had) return { ok: false, msg: `${p.given}は病も傷もない` };
      const what = p.ail ? (AILS[p.ail.kind]?.name || '病') : '傷';
      healPerson(sim, p);
      fx(sim, 'heal', p.pos.x, p.pos.z, { id: p.id });
      react(sim, { x: p.pos.x, z: p.pos.z, r: 6, grace: 1, victims: new Set([p.id]), vmem: `${what}で苦しんでいたら、あたたかな光に包まれ、すっかり治った`, mem: `${p.given}の${what}が、光に包まれて一瞬で治るのを見た`, gossip: `${what}が光に包まれて治った`, imp: 0.7 });
      return { ok: true, msg: `${p.given}の${what}を癒した`, x: p.pos.x, z: p.pos.z, k: kOf(sim.townOf(p)) };
    }
    const s = nearestTown(sim, t.x, t.z, 60);
    if (!s) return { ok: false, msg: '近くに町がない' };
    const sick = townPeople(sim, s.id, 0).filter((p) => p.ail);
    const h = sim.S.health;
    const epi = h?.epi?.find((e) => e.sid === s.id);
    if (!sick.length && !epi) return { ok: false, msg: `${s.name}には病人がいない` };
    for (const p of sick) healPerson(sim, p);
    if (epi) { epi.until = sim.today; }
    fx(sim, 'heal', s.x, s.z, { big: true });
    const msg = `${s.name}に癒しの光が降り注ぎ、${sick.length}人の病人が床から起き上がった`;
    sim.news(msg, 2, { x: s.x, z: s.z });
    react(sim, { sid: s.id, grace: 1, bless: new Set(sick.map((p) => p.id)), bmem: '病の床で光に包まれ、熱が引いていった。神さまのおかげだ', mem: '町じゅうに癒しの光が降り注ぎ、病人たちが起き上がるのを見た', gossip: '町じゅうの病が光で癒されるのを見た', imp: 0.8 });
    return { ok: true, msg, x: s.x, z: s.z, chron: `${s.name}の病人${sick.length}人を癒した`, k: kOf(s) };
  },
  // ===== 人 =====
  dream(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    const G = DREAM_GOALS[opt.goal];
    if (!G) return { ok: false, msg: '告げる目的を選んでください' };
    if (sim.ageOf(p) < 12) return { ok: false, msg: `${p.given}はまだ幼すぎる` };
    p.dvGoal = { k: opt.goal, day: sim.today, until: sim.today + GOAL_DAYS };
    p.dream = G.dream;
    const v = p.values;
    let extra = '';
    if (opt.goal === 'king') { v.ambition = clamp(v.ambition + 0.35, 0, 1); }
    else if (opt.goal === 'wealth') { v.ambition = clamp(v.ambition + 0.25, 0, 1); }
    else if (opt.goal === 'serve') { v.faith = clamp(v.faith + 0.3, 0, 0.99); }
    else if (opt.goal === 'protect') { v.family = clamp((v.family ?? 0.5) + 0.3, 0, 1); v.courage = clamp(v.courage + 0.2, 0, 1); }
    else if (opt.goal === 'journey') { p.pers.O = clamp(p.pers.O + 0.2, 0.03, 0.97); }
    else if (opt.goal === 'revenge') {
      v.courage = clamp(v.courage + 0.25, 0, 1);
      const foe = revengeTarget(sim, p);
      if (foe?.person) { p.revenge = foe.person.id; extra = `（仇は${foe.person.given}）`; p.dvGoal.foe = foe.person.id; }
      else if (foe?.sp) { p.vendetta = foe.sp; extra = `（仇は${SPECIES[foe.sp]?.name || '魔物'}）`; }
    }
    sim.remember(p, `夢に光り輝く神が現れ、${G.say}と告げた。目が覚めても、その声が耳から離れなかった`, { emo: 0.6, imp: 1, k: 'divine' });
    dvOf(p).love = clamp(dvOf(p).love + 10, 0, 100); v.faith = clamp(v.faith + 0.08, 0.02, 0.99);
    const hear = sim.living().filter((q) => q.s === p.s && q.id !== p.id && (p.rel?.[q.id]?.a || 0) > 20).slice(0, 8);
    sim.gossip(p, `神のお告げを夢で聞いたと言っている`, 0.4, hear, { silent: true });
    fx(sim, 'dream', p.pos.x, p.pos.z, { id: p.id });
    const msg = `${sim.fullName(p)}の夢に現れ、${G.say}と告げた${extra}`;
    sim.pushLog(msg, 'event', [p.id], p.pos);
    return { ok: true, msg, x: p.pos.x, z: p.pos.z, k: kOf(sim.townOf(p)) };
  },
  love(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    if (sim.ageOf(p) < 17) return { ok: false, msg: `${p.given}はまだ恋をするには幼い` };
    const sp = aliveP(sim, p.spouseId);
    if (sp) {
      for (const [a, b] of [[p, sp], [sp, p]]) { const r = sim.relMut(a, b); r.a = clamp(r.a + 30, -100, 100); a.needs.lust = Math.max(0, a.needs.lust - 20); }
      sim.remember(p, `連れ合いの${sp.given}に、あらためて惚れ直した`, { emo: 0.8, imp: 0.8, about: [sp.id], k: 'divine' });
      sim.remember(sp, `${p.given}がいつになくやさしく、胸がときめいた`, { emo: 0.8, imp: 0.8, about: [p.id], k: 'divine' });
      fx(sim, 'love', p.pos.x, p.pos.z, { id: p.id });
      return { ok: true, msg: `${p.given}と${sp.given}の夫婦の愛を深めた`, x: p.pos.x, z: p.pos.z };
    }
    const q = findMatch(sim, p);
    if (!q) return { ok: false, msg: `${p.given}にふさわしい相手が近くにいない` };
    const ra = sim.relMut(p, q), rb = sim.relMut(q, p);
    ra.a = Math.max(ra.a, 78); rb.a = Math.max(rb.a, 74); ra.f = Math.max(ra.f || 0, 40); rb.f = Math.max(rb.f || 0, 40);
    p.crush = q.id; q.crush = p.id;
    p.needs.lust = Math.min(p.needs.lust, 30); q.needs.lust = Math.min(q.needs.lust, 30);
    sim.remember(p, `${q.given}と目が合ったとたん、胸が高鳴って止まらなくなった`, { emo: 0.85, imp: 0.9, about: [q.id], k: 'divine' });
    sim.remember(q, `${p.given}のことが、急に気になってしかたなくなった`, { emo: 0.8, imp: 0.85, about: [p.id], k: 'divine' });
    fx(sim, 'love', p.pos.x, p.pos.z, { id: p.id });
    fx(sim, 'love', q.pos.x, q.pos.z, { id: q.id });
    const msg = `${sim.fullName(p)}と${sim.fullName(q)}のあいだに恋を芽生えさせた`;
    sim.pushLog(msg, 'event', [p.id, q.id], p.pos);
    return { ok: true, msg, x: p.pos.x, z: p.pos.z };
  },
  courage(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    p.values.courage = clamp(p.values.courage + 0.3, 0, 1);
    p.needs.survival = 100; p.needs.esteem = Math.min(100, p.needs.esteem + 20);
    if (p.danger) for (const k of Object.keys(p.danger)) p.danger[k] *= 0.3;
    if (p.action?.type === 'flee') p.action.dur = 0;
    sim.remember(p, '胸の奥から熱いものが湧き上がり、もう何も怖くなくなった', { emo: 0.8, imp: 0.85, k: 'divine' });
    fx(sim, 'courage', p.pos.x, p.pos.z, { id: p.id });
    return { ok: true, msg: `${p.given}に勇気を授けた`, x: p.pos.x, z: p.pos.z };
  },
  doubt(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    const cands = Object.entries(p.rel || {}).map(([id, r]) => ({ q: aliveP(sim, +id), r })).filter((x) => x.q && x.r.a > 10);
    cands.sort((a, b) => (b.q.id === p.spouseId ? 1000 : 0) + b.r.a - ((a.q.id === p.spouseId ? 1000 : 0) + a.r.a));
    const q = cands[0]?.q;
    if (!q) return { ok: false, msg: `${p.given}には、疑いを向ける親しい人がいない` };
    const ra = sim.relMut(p, q), rb = sim.relMut(q, p);
    ra.a = clamp(ra.a - 55, -100, 100); rb.a = clamp(rb.a - 30, -100, 100);
    const spouse = q.id === p.spouseId;
    sim.remember(p, spouse ? `連れ合いの${q.given}が何か隠している気がして、問い詰めて口論になった` : `${q.given}に陰で裏切られている気がして、言い争いになった`, { emo: -0.7, imp: 0.85, about: [q.id], k: 'quarrel' });
    sim.remember(q, `${p.given}に、身に覚えのない疑いをかけられた`, { emo: -0.6, imp: 0.8, about: [p.id], k: 'quarrel' });
    fx(sim, 'doubt', p.pos.x, p.pos.z, { id: p.id });
    const msg = `${p.given}の心に、${q.given}への疑いの種を植えた`;
    sim.pushLog(msg, 'event', [p.id, q.id], p.pos);
    // 仲を裂く御業は人に知られない（噂にはならない）。ただし見ている側の記録には残る
    return { ok: true, msg, x: p.pos.x, z: p.pos.z };
  },
  repent(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    const was = [];
    if (p.revenge != null) { const f = sim.S.people[p.revenge]; was.push(`${f?.given || '仇'}への恨み`); p.revenge = null; }
    if (p.vendetta) { was.push('魔物への復讐心'); p.vendetta = null; }
    if (p.uwRole) { was.push('闇の稼業'); p.uwRole = null; }
    if ((p.addiction || 0) > 10 && !p.uwRehab) { p.uwRehab = { by: null, day: sim.today }; was.push('薬'); }
    if (sim.S.wanted?.[p.id]) was.push('犯した罪');
    if (JOBS[p.job]?.crook || ['thief', 'pirate'].includes(p.job)) { was.push('盗みの暮らし'); p.formerJob = p.job; p.job = sim.ageOf(p) < 68 ? 'farmer' : null; }
    p.pers.A = clamp(p.pers.A + 0.2, 0.03, 0.97); p.pers.C = clamp(p.pers.C + 0.1, 0.03, 0.97);
    p.values.faith = clamp(p.values.faith + 0.25, 0.02, 0.99);
    const d = dvOf(p); d.grudge = 0; d.love = clamp(d.love + 25, 0, 100);
    if (p.apostate) { p.apostate = null; D.stats.returned = (D.stats.returned || 0) + 1; }
    const what = was.length ? was.join('も') : 'これまでの生き方';
    sim.remember(p, `まばゆい光の中で神の声を聞き、${what}を悔いて涙を流した`, { emo: 0.7, imp: 1, k: 'divine' });
    fx(sim, 'heal', p.pos.x, p.pos.z, { id: p.id, dove: true });
    react(sim, { x: p.pos.x, z: p.pos.z, r: 6, grace: 1, mem: `${p.given}が光に打たれたように膝をつき、泣きながら悔い改めるのを見た`, gossip: '神の光に打たれて改心した', imp: 0.6 });
    const msg = `${sim.fullName(p)}を改心させた（${what}を捨てた）`;
    sim.pushLog(msg, 'event', [p.id], p.pos);
    return { ok: true, msg, x: p.pos.x, z: p.pos.z, chron: isEvil(sim, p) || was.length ? `${sim.fullName(p)}を改心させた` : null, k: kOf(sim.townOf(p)) };
  },
  // ===== 物 =====
  relic(sim, t, opt, D) {
    const R = sim.rng;
    const base = R.pick(['longsword', 'greatsword', 'spear', 'axe', 'bow', 'staff', 'dragonblade', 'mace']);
    const NAMES = ['天啓の', '星降る', '暁の', '神授の', '白銀の', '聖者の'];
    const KIND = { longsword: '長剣', greatsword: '大剣', spear: '槍', axe: '戦斧', bow: '弓', staff: '杖', dragonblade: '竜剣', mace: '鎚矛' };
    const nm = `${R.pick(NAMES)}${KIND[base]}${R.pick(['エルディア', 'ルミナス', 'アストラ', 'ソレイユ', 'セレスト', 'オーロラ'])}`;
    const it = makeItem(base, 1.7, { custom: nm, value: 320, divine: true });
    if (t.kind === 'person') {
      const p = aliveP(sim, t.id);
      if (sim.ageOf(p) < 14) return { ok: false, msg: `${p.given}はまだ幼すぎる` };
      givRelic(sim, p, it);
      fx(sim, 'relic', p.pos.x, p.pos.z, { id: p.id });
      react(sim, { x: p.pos.x, z: p.pos.z, r: 10, grace: 1, bless: new Set([p.id]), bmem: `天から光の柱が降り、目の前に${nm}が突き立った。神に選ばれたのだ`, mem: `天から光の柱が降り、${p.given}の前に伝説の武器が突き立つのを見た`, gossip: `天から伝説の武器を授かった`, imp: 0.8 });
      const msg = `${sim.fullName(p)}に伝説の武器「${nm}」を授けた`;
      sim.news(msg, 2, p.pos);
      p.deeds = p.deeds || []; p.deeds.unshift(`天より${nm}を授かった`);
      return { ok: true, msg, x: p.pos.x, z: p.pos.z, chron: msg, k: kOf(sim.townOf(p)) };
    }
    const at = walkNear(sim, t.x, t.z, 6);
    if (!at) return { ok: false, msg: 'そこには武器を降ろせない（海や川の上）' };
    D.relics.push({ id: D.seq++, x: at.x, z: at.z, item: it, day: sim.today });
    fx(sim, 'relic', at.x, at.z);
    const place = sim.placeName(at.x, at.z);
    const msg = `${place}に、天から伝説の武器「${nm}」が降ってきた`;
    sim.news(msg, 2, at);
    react(sim, { x: at.x, z: at.z, r: 30, grace: 1, mem: `${place}に天から光の柱が降りるのを見た。何かが地に突き立ったらしい`, gossip: `${place}に天から光の柱が降りるのを見た`, imp: 0.7 });
    return { ok: true, msg, x: at.x, z: at.z, chron: msg, k: kOf(nearestTown(sim, at.x, at.z)) };
  },
  treasure(sim, t, opt, D) {
    const s = nearestTown(sim, t.x, t.z, 90);
    if (!s) return { ok: false, msg: '噂を聞く人がいる町が近くにない' };
    const B = sim.S.bank;
    const hoards = (B?.hoards || []).filter((h) => !h.gone && h.lost && !D.hunts.some((u) => u.hoard === h.id && !u.done));
    hoards.sort((a, b) => Math.hypot(a.x - t.x, a.z - t.z) - Math.hypot(b.x - t.x, b.z - t.z));
    let hunt;
    const h = hoards[0];
    if (h && Math.hypot(h.x - t.x, h.z - t.z) < 70) {
      const at = walkNear(sim, h.x, h.z, 4) || { x: h.x, z: h.z };
      hunt = { id: D.seq++, x: at.x, z: at.z, hoard: h.id, sid: s.id, day: sim.today, until: sim.today + 20 };
    } else {
      const at = walkNear(sim, t.x, t.z, 6);
      if (!at) return { ok: false, msg: 'そこには宝を隠せない' };
      const name = sim.rng.pick(TREASURE_ITEMS);
      hunt = { id: D.seq++, x: at.x, z: at.z, item: name, sid: s.id, day: sim.today, until: sim.today + 20 };
    }
    D.hunts.push(hunt);
    const place = sim.placeName(hunt.x, hunt.z);
    // 噂の出どころ：夢でお告げを受けた（ことになる）町の話し好き
    const folk = townPeople(sim, s.id, 16).sort((a, b) => b.pers.E + b.pers.O - (a.pers.E + a.pers.O));
    const teller = folk[0];
    if (!teller) return { ok: false, msg: '噂を広める人がいない' };
    sim.remember(teller, `夢で「${place}に宝が眠っている」という声を聞いた`, { emo: 0.6, imp: 0.9, k: 'divine', where: { x: hunt.x, z: hunt.z } });
    const hear = folk.slice(1, 14);
    sim.gossip(teller, `${place}に宝が眠っているという夢のお告げを聞いた`, 0.6, hear, { silent: true, imp: 0.7 });
    for (const q of hear) q.dvHunt = hunt.id;
    teller.dvHunt = hunt.id;
    fx(sim, 'gold', hunt.x, hunt.z, { small: true });
    const msg = `${s.name}の人々に「${place}に宝が眠る」という噂を流した`;
    sim.pushLog(msg, 'event', [teller.id], s);
    return { ok: true, msg, x: hunt.x, z: hunt.z };
  },
  gold(sim, t, opt, D) {
    const mines = sim.S.world.settlements.filter((s) => s.mine != null && !sim.S.towns[s.id]?.occupied);
    let best = null, bd = 60;
    for (const s of mines) { const b = sim.building(s.mine); if (!b) continue; const d = Math.hypot(b.door.x - t.x, b.door.z - t.z); if (d < bd) { bd = d; best = s; } }
    if (!best) return { ok: false, msg: '近くに鉱山がない（鉱山のそばを選んでください）' };
    if (D.veins.some((v) => v.mine === best.mine && v.au > 0)) return { ok: false, msg: `${best.name}の鉱山には、すでに神の鉱脈が通っている` };
    const b = sim.building(best.mine);
    const au = 360;
    D.veins.push({ id: D.seq++, mine: best.mine, sid: best.id, x: b.door.x, z: b.door.z, au, au0: au, dug: 0, day: sim.today });
    D.led.goldAdded += au;
    fx(sim, 'gold', b.door.x, b.door.z, { big: true });
    const msg = `${best.name}の鉱山の奥に、黄金の鉱脈が現れた`;
    sim.news(msg, 2, b.door);
    const miners = new Set(townPeople(sim, best.id, 14).filter((p) => p.job === 'miner').map((p) => p.id));
    react(sim, { sid: best.id, grace: 1, bless: miners, bmem: '坑道の奥の岩壁が、金色に輝いているのを見つけた', mem: '鉱山の奥に黄金の鉱脈が現れたと聞いて、町じゅうが沸いた', gossip: '鉱山で黄金の鉱脈を見つけた', imp: 0.75 });
    return { ok: true, msg, x: b.door.x, z: b.door.z, chron: msg, k: kOf(best) };
  },
  // ===== 魔物 =====
  dragon(sim, t, opt, D) {
    const S = sim.S;
    // 眠っている竜がいれば起こす。いなければ地の底から古竜が這い出す
    let c = Object.values(S.creatures).find((x) => x.sp === 'dragon' && x.hp > 0 && (x.dormant || x.inDungeon) && !x.guardianOf && !x.tribeGuardian && Math.hypot(x.pos.x - t.x, x.pos.z - t.z) < 60);
    const R = sim.rng;
    if (c) { c.dormant = false; c.inDungeon = false; c.calm = null; }
    else {
      const at = walkNear(sim, t.x, t.z, 8);
      if (!at) return { ok: false, msg: 'そこには竜が降り立てない' };
      c = makeCreature(sim, 'dragon', at.x, at.z, { lv: 3, hx: at.x, hz: at.z, range: 14 });
      if (!c || c.hp <= 0) return { ok: false, msg: '竜はそこに現れなかった（町に近すぎる）' };
    }
    c.named = true; c.title = c.title || `目覚めし古竜${R.pick(['ヴァルグ', 'イグニス', 'ザラスト', 'ノクス', 'ファーヴル'])}`;
    c.name = c.title; c.dvWoke = sim.today;
    const s = nearestTown(sim, c.pos.x, c.pos.z);
    fx(sim, 'dark', c.pos.x, c.pos.z, { big: true });
    const msg = `${sim.placeName(c.pos.x, c.pos.z)}で${c.name}が目覚め、天に向かって咆哮した`;
    sim.news(msg, 3, c.pos);
    react(sim, { x: c.pos.x, z: c.pos.z, r: 40, sid: s && Math.hypot(s.x - c.pos.x, s.z - c.pos.z) < 50 ? s.id : null, grace: -1, deserved: false, mem: `遠くの空で竜の咆哮が響き、大地が震えた`, gossip: '竜が目覚める咆哮を聞いた', imp: 0.8 });
    return { ok: true, msg, x: c.pos.x, z: c.pos.z, chron: msg, k: kOf(s) };
  },
  horde(sim, t, opt, D) {
    const S = sim.S, R = sim.rng;
    const at = walkNear(sim, t.x, t.z, 10);
    if (!at) return { ok: false, msg: 'そこには魔物を呼べない' };
    const tile = S.world.tiles[at.z * W + at.x];
    const kind = tile === T.DESERT || tile === T.WASTE || tile === T.LAVA ? ['orc', 'orc', 'orc', 'orcking'] : tile === T.SNOW ? ['skeleton', 'skeleton', 'skeleton', 'skeleton'] : ['goblin', 'goblin', 'goblin', 'goblin', 'hobgoblin'];
    const town = nearestTown(sim, at.x, at.z, 70);
    const made = [];
    const n = R.int(5, 7);
    for (let i = 0; i < n; i++) {
      const sp = kind[i % kind.length];
      if (!SPECIES[sp]) continue;
      const c = makeCreature(sim, sp, at.x + R.int(-2, 2), at.z + R.int(-2, 2), { lv: R.int(1, 3), hx: at.x, hz: at.z, range: 8 });
      if (!c || c.hp <= 0) continue;
      c.dvSummoned = sim.today;
      if (town && !S.towns[town.id]?.occupied && !(town.tribal && town.annexed == null && false)) { c.raid = town.id; c.raidUntil = S.t + 1440; }
      made.push(c);
    }
    if (!made.length) return { ok: false, msg: '魔物はそこに現れなかった（町に近すぎる）' };
    fx(sim, 'dark', at.x, at.z);
    const msg = `${sim.placeName(at.x, at.z)}の地の裂け目から、${SPECIES[made[0].sp].name}の群れ${made.length}体が這い出した${town ? `。${town.name}へ向かっている` : ''}`;
    sim.news(msg, 2, at);
    if (town) react(sim, { sid: town.id, grace: -1, deserved: false, mem: `地の裂け目から魔物の群れが這い出したと聞いて、震えが止まらなかった`, gossip: '魔物の群れが地の底から湧いたのを見た', imp: 0.7 });
    return { ok: true, msg, x: at.x, z: at.z, chron: msg, k: kOf(town) };
  },
  demonlord(sim, t, opt, D) {
    const Dm = sim.S.demon;
    if (!Dm) return { ok: false, msg: 'この世界に魔王はいない' };
    if (Dm.active) return { ok: false, msg: '魔王はすでに目覚めている' };
    Dm.awakenDay = sim.today;          // 次の夜明け（politicsDaily）に目覚める
    const w = sim.S.world.demon;
    fx(sim, 'dark', w.x, w.z, { big: true, huge: true });
    const msg = `魔界の奥で、眠れる${Dm.name}のまぶたが動いた。夜明けとともに目覚めるだろう`;
    sim.news(msg, 3, w);
    for (const p of sim.living()) if (sim.rng.chance(0.25)) sim.remember(p, '夜空が赤黒く染まり、北の果てから不吉な地鳴りが聞こえた', { emo: -0.6, imp: 0.6, k: 'divine' });
    D.tone.wrath += 2;
    return { ok: true, msg, x: w.x, z: w.z, chron: `眠れる${Dm.name}を揺り起こした` };
  },
  calm(sim, t, opt, D) {
    const S = sim.S;
    let list;
    if (t.kind === 'creature') { const c = S.creatures[t.id]; list = c && c.hp > 0 ? [c] : []; }
    else list = Object.values(S.creatures).filter((c) => c.hp > 0 && !c.dormant && (c.hostile || c.raid != null) && Math.hypot(c.pos.x - t.x, c.pos.z - t.z) < 18);
    list = list.filter((c) => c.sp !== 'demonlord');
    if (!list.length) return { ok: false, msg: 'まわりに荒ぶる魔物がいない' };
    for (const c of list) {
      c.calm = S.t + 1440 * 3; c.raid = null; c.raidUntil = 0; c.hunger = 100; c.goal = c.home ? { x: c.home.x, z: c.home.z } : null;
      if (c.fight) { const e = sim.entity(c.fight.target); if (e && e.fight?.target === c.id) e.fight = null; c.fight = null; }
    }
    const c0 = list[0];
    fx(sim, 'calm', t.kind === 'creature' ? c0.pos.x : t.x, t.kind === 'creature' ? c0.pos.z : t.z);
    const x = t.kind === 'creature' ? c0.pos.x : t.x, z = t.kind === 'creature' ? c0.pos.z : t.z;
    react(sim, { x, z, r: 14, grace: 1, mem: '荒れ狂っていた魔物が、青い光に包まれて急におとなしくなるのを見た', gossip: '魔物が青い光で鎮められるのを見た', imp: 0.6 });
    const msg = `${sim.placeName(x, z)}の${list.length}体の魔物を鎮めた`;
    sim.pushLog(msg, 'event', [], { x, z });
    return { ok: true, msg, x, z };
  },
  // ===== 奇跡と天罰 =====
  save(sim, t, opt, D) {
    const p = aliveP(sim, t.id);
    const dying = p.hp < p.maxhp * 0.5 || (p.ail && p.ail.sev >= 35) || p.needs.hunger < 15 || !!p.fight;
    if (!dying) return { ok: false, msg: `${p.given}は死にかけてはいない` };
    if (p.fight) { const e = sim.entity(p.fight.target); if (e && e.fight?.target === p.id) { e.fight = null; if (typeof e.id === 'string') e.calm = sim.S.t + 240; } p.fight = null; }
    healPerson(sim, p);
    p.needs.hunger = Math.max(p.needs.hunger, 70); p.needs.survival = 100;
    fx(sim, 'heal', p.pos.x, p.pos.z, { id: p.id, big: true });
    react(sim, { x: p.pos.x, z: p.pos.z, r: 8, grace: 1, victims: new Set([p.id]), vmem: '死の淵で、まばゆい光に包まれた。気がつくと傷がふさがり、生きていた', mem: `死にかけていた${p.given}が、光に包まれて立ち上がるのを見た`, gossip: '死の淵から光に救われた', imp: 0.85 });
    const msg = `死にかけていた${sim.fullName(p)}の命を救った`;
    sim.news(msg, 1, p.pos);
    p.deeds = p.deeds || []; p.deeds.unshift('死の淵から神に救われた');
    return { ok: true, msg, x: p.pos.x, z: p.pos.z, chron: msg, k: kOf(sim.townOf(p)) };
  },
  smite(sim, t, opt, D) {
    if (t.kind === 'creature') {
      const c = sim.S.creatures[t.id];
      if (!c || c.hp <= 0) return { ok: false, msg: 'その生き物はもういない' };
      if (c.sp === 'demonlord') return { ok: false, msg: '魔王には雷が届かない（勇者に託すしかない）' };
      const dmg = Math.round(c.maxhp * (SPECIES[c.sp]?.boss ? 0.2 : c.named ? 0.45 : 0.9) + 20);
      fx(sim, 'bolt', c.pos.x, c.pos.z);
      const x = c.pos.x, z = c.pos.z, nm = c.name;
      c.hp -= dmg;
      if (c.hp <= 0) killCreature(sim, c, null);
      const dead = !sim.S.creatures[c.id];
      const evil = SPECIES[c.sp]?.kind === 'hostile' || SPECIES[c.sp]?.kind === 'demon';
      react(sim, { x, z, r: 12, grace: evil ? 1 : -1, deserved: evil, mem: `空から雷が落ち、${nm}${dead ? 'が黒焦げになって倒れた' : 'が打ち据えられた'}のを見た`, gossip: `${nm}に雷が落ちるのを見た`, imp: 0.6 });
      const msg = `${nm}に天罰の雷を落とした${dead ? '（倒れた）' : ''}`;
      sim.pushLog(msg, 'event', [], { x, z });
      return { ok: true, msg, x, z };
    }
    const p = aliveP(sim, t.id);
    const evil = isEvil(sim, p);
    const x = p.pos.x, z = p.pos.z;
    fx(sim, 'bolt', x, z, { id: p.id });
    if (p.inside != null) { const b = sim.building(p.inside); if (b) { p.pos = { ...b.door }; p.inside = null; } }
    const crime = sim.S.wanted?.[p.id]?.crime;
    if (evil) {
      const town = sim.townOf(p);
      const name = sim.fullName(p);
      react(sim, { x, z, r: 12, sid: p.s, grace: -1, deserved: true, victims: new Set([p.id]), mem: `${crime ? `${crime}のお尋ね者` : '悪名高い'}${p.given}に、空から雷が落ちるのを見た。天罰だ`, gossip: '天罰の雷に打たれて死んだ', imp: 0.8 });
      sim.die(p, 'divine');
      const msg = `悪人${name}に天罰の雷を落とした`;
      sim.news(msg, 2, { x, z });
      return { ok: true, msg, x, z, chron: `${crime ? `${crime}の罪を犯した` : '悪名高い'}${name}を雷で裁いた`, k: kOf(town) };
    }
    p.hp = Math.max(1, Math.round(p.maxhp * 0.15));
    p.needs.survival = Math.max(0, p.needs.survival - 50);
    react(sim, { x, z, r: 12, grace: -1, deserved: false, victims: new Set([p.id]), vmem: '晴れた空から雷に打たれた。何の罰なのか、わからない', mem: `罪もない${p.given}に、空から雷が落ちるのを見た。神は何をお怒りなのか`, gossip: 'わけもなく雷に打たれた', imp: 0.8 });
    const msg = `罪なき${sim.fullName(p)}に雷を落とした（深手を負った）`;
    sim.news(msg, 1, { x, z });
    return { ok: true, msg, x, z, chron: `罪なき${sim.fullName(p)}を雷で打った`, k: kOf(sim.townOf(p)) };
  },
  souls(sim, t, opt, D) {
    const s = nearestTown(sim, t.x, t.z, 60);
    if (!s) return { ok: false, msg: '近くに町がない' };
    const folk = townPeople(sim, s.id, 6);
    const grieving = folk.filter((p) => p.grief && p.grief.lv > 5);
    for (const p of grieving) { p.grief.lv = Math.max(0, p.grief.lv - 55); if (p.grief.lv <= 0) delete p.grief; }
    fx(sim, 'souls', s.x, s.z);
    const msg = `${s.name}の墓地から、たくさんの小さな光が天へ昇っていった`;
    sim.news(msg, 1, { x: s.x, z: s.z });
    react(sim, { sid: s.id, grace: 1, bless: new Set(grieving.map((p) => p.id)), bmem: '亡き人の魂が、光になって安らかに天へ昇っていくのを見た。胸のつかえが少しおりた', mem: '墓地から小さな光がいくつも天へ昇っていくのを見た', gossip: '死者の魂が光になって昇っていくのを見た', imp: 0.7 });
    return { ok: true, msg, x: s.x, z: s.z, chron: `${s.name}の死者の魂を安らげた`, k: kOf(s) };
  },
};

function healPerson(sim, p) {
  if (p.ail) { p.ail.sev = 0; p.imm = p.imm || {}; p.imm[p.ail.kind] = sim.today + 20; delete p.ail; }
  p.hp = p.maxhp;
  if (p.action?.type === 'sickbed') p.action.dur = 0;
}
function givRelic(sim, p, it) {
  addItem(p, it); autoEquip(p);
  try { Object.assign(p, humanStats(sim, p)); } catch (e) { /* 能力の再計算に失敗しても続ける */ }
}
function findMatch(sim, p) {
  const age = sim.ageOf(p);
  let best = null, bs = -1e9;
  for (const q of sim.living()) {
    if (q.id === p.id || q.sex === p.sex || q.s !== p.s || q.spouseId != null || q.jail != null) continue;
    const qa = sim.ageOf(q);
    if (qa < 17 || Math.abs(qa - age) > 14 || sim.isKin(p, q) || q.family === p.family) continue;
    const sc = (p.rel[q.id]?.a || 0) + (q.rel[p.id]?.a || 0) - Math.abs(qa - age) * 2 + sim.rng.range(0, 20);
    if (sc > bs) { bs = sc; best = q; }
  }
  return best;
}
function revengeTarget(sim, p) {
  // 家族を手にかけた者（記憶の about と死者の killedBy）→ いちばん憎い人
  for (const m of (p.memories || []).slice().reverse()) {
    if (m.k !== 'death' || !m.about?.length) continue;
    const d = sim.S.people[m.about[0]];
    if (!d || d.killedBy == null) continue;
    if (typeof d.killedBy === 'number') { const k = aliveP(sim, d.killedBy); if (k && k.id !== p.id) return { person: k }; }
    else { const sp = Object.keys(SPECIES).find((k) => SPECIES[k].name === d.killedBy || d.killedBy.startsWith?.(SPECIES[k].name)); if (sp) return { sp }; }
  }
  const foes = Object.entries(p.rel || {}).map(([id, r]) => ({ q: aliveP(sim, +id), a: r.a })).filter((x) => x.q && x.a < -25).sort((a, b) => a.a - b.a);
  if (foes[0]) return { person: foes[0].q };
  return null;
}

// ---------- 願いごと ----------
const WISH = {
  rain:    { mir: 'rain',    town: true },
  cure:    { mir: 'cure',    town: true },
  heal:    { mir: 'cure' },
  child:   { mir: null, cost: 30 },
  souls:   { mir: 'souls',   town: true },
  calm:    { mir: 'calm',    town: true },
  love:    { mir: 'love' },
  harvest: { mir: 'harvest', town: true },
  courage: { mir: 'courage' },
};
export function wishCost(w) { const d = WISH[w.kind]; if (!d) return 0; return r1((d.mir ? miracleCost(d.mir, d.town ? { kind: 'place' } : { kind: 'person' }) : d.cost) * 0.8); }

function makeWish(sim, p, D) {
  const S = sim.S, R = sim.rng, age = sim.ageOf(p), s = sim.town(p.s), hh = sim.hh(p);
  if (age < 10 || p.apostate) return;
  const opts = [];
  if (S.wx?.drought?.[p.s]) opts.push({ kind: 'rain', txt: `${s.name}に雨をください`, w: 5 });
  if (S.health?.epi?.some((e) => e.sid === p.s)) opts.push({ kind: 'cure', txt: `${s.name}の流行り病を鎮めてください`, w: 5 });
  const sickKin = (hh?.members || []).map((id) => aliveP(sim, id)).find((q) => q && q.id !== p.id && q.ail && q.ail.sev >= 25);
  if (sickKin) opts.push({ kind: 'heal', tid: sickKin.id, txt: `${sim.kinTerm(p, sickKin) || ''}${sickKin.given}の病を治してください`, w: 4 });
  if (p.ail && p.ail.sev >= 25) opts.push({ kind: 'heal', tid: p.id, txt: 'この病を治してください', w: 3 });
  const sp = aliveP(sim, p.spouseId);
  if (p.sex === 'f' && age >= 18 && age <= 40 && sp && sp.hh === p.hh && !p.pregnant && !(p.children || []).some((id) => { const c = S.people[id]; return c && c.deathYear == null && sim.ageOf(c) < 4; })) opts.push({ kind: 'child', tid: p.id, txt: '子を授けてください', w: (p.children || []).length ? 1 : 3 });
  if (p.grief && p.grief.lv > 35) { const g = S.people[p.grief.who]; opts.push({ kind: 'souls', txt: `亡き${g ? g.given : '人'}の魂が安らかでありますように`, w: 3 }); }
  if (age >= 20 && age <= 38 && p.spouseId == null && p.needs.lust < 60 && R.chance(0.5) && findMatch(sim, p)) opts.push({ kind: 'love', tid: p.id, txt: 'よい人とめぐり会えますように', w: 0.6 });
  if ((hh?.money ?? 100) < 25 && age >= 16) opts.push({ kind: 'harvest', txt: `${s.name}の暮らしが楽になりますように`, w: 1.5 });
  if (['adventurer', 'soldier', 'knight', 'guard', 'militia'].includes(p.job) || (p.values.courage < 0.3 && (p.needs.survival < 50))) opts.push({ kind: 'courage', tid: p.id, txt: '恐れに負けない勇気をください', w: 1 });
  const threat = D._threat?.[p.s];
  if (threat) opts.push({ kind: 'calm', txt: `${s.name}を魔物からお守りください`, w: 4 });
  if (!opts.length) return;
  const o = R.weighted(opts, (x) => x.w);
  if (!o) return;
  // 町ぐるみの願いは、同じ願いに祈る人が加わる
  const town = WISH[o.kind]?.town;
  const same = D.wishes.find((w) => !w.done && w.kind === o.kind && (town ? w.sid === p.s : w.tid === o.tid));
  if (same) { if (!same.who.includes(p.id)) { same.who.push(p.id); if (same.who.length > 30) same.who.shift(); same.n++; } return; }
  if (D.wishes.filter((w) => !w.done).length >= 14) return;
  if (D.wishes.some((w) => !w.done && w.pid === p.id)) return;
  D.wishes.push({ id: D.seq++, kind: o.kind, pid: p.id, tid: o.tid ?? null, sid: p.s, txt: o.txt, day: sim.today, until: sim.today + 4, n: 1, who: [p.id], x: s.x, z: s.z });
  sim.remember(p, `神さまに「${o.txt}」と祈った`, { emo: 0.1, imp: 0.45, k: 'divine' });
}

// 願いの中身が、まだ意味を持っているか（日照りが終わった・病が治った など）
function wishStillNeeded(sim, w) {
  const S = sim.S, t = aliveP(sim, w.tid);
  switch (w.kind) {
    case 'rain': return !!S.wx?.drought?.[w.sid];
    case 'cure': return !!S.health?.epi?.some((e) => e.sid === w.sid);
    case 'heal': return !!(t && t.ail);
    case 'child': return !!(t && !t.pregnant && aliveP(sim, t.spouseId));
    case 'love': return !!(t && t.spouseId == null);
    case 'souls': return w.who.some((id) => { const q = aliveP(sim, id); return q && q.grief && q.grief.lv > 15; });
    case 'calm': return !!ensureDivine(sim)._threat?.[w.sid];
    case 'courage': return !!t;
    default: return w.who.some((id) => aliveP(sim, id));
  }
}
function settleWish(sim, D, w) {
  w.done = 'moot'; w.doneDay = sim.today;
  D.wishes = D.wishes.filter((x) => !x.done || sim.today - x.doneDay < 3);
}
export function answerWish(sim, wid) {
  const D = ensureDivine(sim);
  const w = D.wishes.find((x) => x.id === wid && !x.done);
  if (!w) return { ok: false, msg: 'その願いはもうない' };
  if (!wishStillNeeded(sim, w)) { settleWish(sim, D, w); return { ok: false, msg: 'その願いは、もうひとりでに叶っていた' }; }
  const d = WISH[w.kind];
  const cost = wishCost(w);
  let res;
  if (w.kind === 'child') {
    const p = aliveP(sim, w.tid), sp = p && aliveP(sim, p.spouseId);
    if (!p || !sp || p.pregnant) return closeWish(sim, D, w, false, 'その願いはもう叶えられない');
    if (D.power < cost) return { ok: false, msg: `祈りの力が足りない（${r1(D.power)}／${cost}）` };
    D.power -= cost;
    p.pregnant = 1;
    sim.remember(p, 'お腹に子どもがいるとわかった。神さまが祈りを聞いてくださった', { emo: 1, imp: 1, k: 'preg' });
    sim.remember(sp, `${p.given}のお腹に子どもがいるとわかった。神さまのお恵みだ`, { emo: 0.95, imp: 0.95, about: [p.id], k: 'preg' });
    fx(sim, 'love', p.pos.x, p.pos.z, { id: p.id });
    res = { ok: true, msg: `${sim.fullName(p)}に子を授けた` };
    logD(sim, D, res.msg, p.pos.x, p.pos.z, 1);
    D.stats.miracles = (D.stats.miracles || 0) + 1;
  } else {
    let target;
    if (d.town) { const s = sim.town(w.sid); target = { kind: 'place', x: s.x, z: s.z }; }
    else target = { kind: 'person', id: w.tid };
    res = castMiracle(sim, d.mir, target, { discount: 0.8, wish: w.id });
    if (!res.ok) return res;
  }
  return closeWish(sim, D, w, true, res.msg);
}
export function ignoreWish(sim, wid) {
  const D = ensureDivine(sim);
  const w = D.wishes.find((x) => x.id === wid && !x.done);
  if (!w) return { ok: false, msg: 'その願いはもうない' };
  return closeWish(sim, D, w, false, `「${w.txt}」という願いを見送った`);
}
function closeWish(sim, D, w, granted, msg) {
  w.done = granted ? 'yes' : 'no'; w.doneDay = sim.today;
  for (const id of w.who) {
    const p = aliveP(sim, id); if (!p) continue;
    const d = dvOf(p);
    if (granted) {
      p.values.faith = clamp(p.values.faith + 0.06, 0.02, 0.99); d.love = clamp(d.love + 20, 0, 100); d.grudge = clamp(d.grudge - 15, 0, 100);
      sim.remember(p, `「${w.txt}」という祈りを、神さまが聞き届けてくださった`, { emo: 0.95, imp: 0.9, k: 'divine' });
      if (p.apostate && d.love > d.grudge) returnToFaith(sim, D, p);
    } else {
      p.values.faith = clamp(p.values.faith - 0.03, 0.02, 0.99); d.grudge = clamp(d.grudge + 6, 0, 100); d.love = clamp(d.love - 5, 0, 100);
      sim.remember(p, `「${w.txt}」と何度も祈ったのに、神さまは応えてくださらなかった`, { emo: -0.5, imp: 0.6, k: 'divine' });
    }
  }
  if (granted) {
    D.stats.answered = (D.stats.answered || 0) + 1;
    const p = aliveP(sim, w.pid);
    if (p) sim.gossip(p, `の祈り「${w.txt}」が神に届いた`.replace(/^の/, 'の'), 0.7, sim.living().filter((q) => q.s === p.s && q.id !== p.id && (p.rel?.[q.id]?.a || 0) > 10).slice(0, 10), { silent: true });
    sim.pushLog(`神は「${w.txt}」という${w.n > 1 ? `${w.n}人の` : ''}願いに応えた。`, 'event', [w.pid], { x: w.x, z: w.z });
  } else D.stats.ignored = (D.stats.ignored || 0) + 1;
  D.wishes = D.wishes.filter((x) => !x.done || sim.today - x.doneDay < 3);
  return { ok: true, msg };
}

// ---------- 背教と異端 ----------
function returnToFaith(sim, D, p) {
  p.apostate = null;
  D.stats.returned = (D.stats.returned || 0) + 1;
  sim.remember(p, '一度は神を捨てたが、もう一度祈ってみようと思った', { emo: 0.6, imp: 0.85, k: 'divine' });
}
function apostasyDaily(sim, D) {
  const R = sim.rng;
  const bySid = {};
  for (const p of sim.living()) {
    if (sim.ageOf(p) < 16) continue;
    const d = p.dv; if (!d) continue;
    // 恨みと恐れは少しずつ薄れ、慕う心もゆっくり冷める
    d.grudge *= 0.985; d.fear *= 0.97; d.love *= 0.985;
    if (!p.apostate && d.grudge > 50 && p.values.faith < 0.3 && d.grudge > d.love + 15 && R.chance(0.25)) {
      p.apostate = sim.today;
      D.stats.apostates = (D.stats.apostates || 0) + 1;
      sim.remember(p, '神などいない。いたとしても、あんな神には二度と祈らないと決めた', { emo: -0.5, imp: 0.95, k: 'divine' });
      const hear = sim.living().filter((q) => q.s === p.s && q.id !== p.id && (p.rel?.[q.id]?.a || 0) > 20).slice(0, 6);
      sim.gossip(p, '神を捨てたと言いふらしている', -0.4, hear, { silent: true });
      sim.pushLog(`${sim.fullName(p)}が神を捨てた。`, 'event', [p.id], p.pos);
    } else if (p.apostate && d.love > d.grudge + 10 && p.values.faith > 0.35) returnToFaith(sim, D, p);
    if (p.apostate) (bySid[p.s] = bySid[p.s] || []).push(p);
  }
  // 異端の集まり：背教者が町に一定数そろうと、説く者が現れる
  for (const [sid, list] of Object.entries(bySid)) {
    const s = sim.town(+sid); if (!s) continue;
    const adults = sim.living().filter((q) => q.s === +sid && sim.ageOf(q) >= 16).length;
    const H = D.heresy[sid];
    if (!H && list.length >= Math.max(3, adults * 0.08)) {
      const leader = list.slice().sort((a, b) => b.pers.E + b.pers.O - (a.pers.E + a.pers.O))[0];
      D.heresy[sid] = { day: sim.today, leader: leader.id, n: list.length };
      const msg = `${s.name}で${leader.given}が「神は我らを見捨てた」と説きはじめ、異端の集まりができた`;
      sim.news(msg, 2, { x: s.x, z: s.z });
      sim.chron(msg, kOf(s));
      sim.remember(leader, '神を捨てた仲間を集め、自分たちの教えを説きはじめた', { emo: 0.4, imp: 1, k: 'divine' });
      leader.deeds = leader.deeds || []; leader.deeds.unshift('異端の教えを説いた');
    } else if (H) {
      H.n = list.length;
      // 異端の教えは、信心の薄い知り合いに広がる
      for (const a of list) {
        if (!R.chance(0.05)) continue;
        const fr = Object.entries(a.rel || {}).map(([id, r]) => ({ q: aliveP(sim, +id), a: r.a })).find((x) => x.q && x.a > 30 && !x.q.apostate && x.q.values.faith < 0.4 && sim.ageOf(x.q) >= 16);
        if (fr) { dvOf(fr.q).grudge = clamp(dvOf(fr.q).grudge + 20, 0, 100); fr.q.values.faith = clamp(fr.q.values.faith - 0.05, 0.02, 0.99); sim.remember(fr.q, `${a.given}から「神などいない」という教えを聞かされた`, { emo: -0.2, imp: 0.6, about: [a.id], k: 'divine' }); }
      }
    }
  }
  for (const [sid, H] of Object.entries(D.heresy)) {
    if ((bySid[sid]?.length || 0) >= 2) continue;
    const s = sim.town(+sid);
    delete D.heresy[sid];
    if (s) { const msg = `${s.name}の異端の集まりは、いつしか散り散りになった`; sim.pushLog(msg, 'event', [], s); sim.chron(msg, kOf(s)); }
  }
}

// ---------- 毎時 ----------
export function divineHourly(sim) {
  const D = ensureDivine(sim), S = sim.S, R = sim.rng;
  const hourIdx = Math.floor(S.t / 60);
  if (D.lastHour === hourIdx) return;
  D.lastHour = hourIdx;
  let praying = 0, pw = 0;
  const prayers = [];
  for (const p of sim.living()) {
    const a = p.action;
    if (!a || a.phase !== 'do' || (a.type !== 'pray' && a.type !== 'grave')) continue;
    if (p.apostate) continue;
    praying++;
    pw += 0.05 * (0.4 + p.values.faith) * (1 + (D.church[p.s] || 0) / 200);
    prayers.push(p);
  }
  D.stats.prayers = (D.stats.prayers || 0) + praying;
  const mul = 0.5 + (D.faith || 50) / 100;
  D.power = Math.min(MAX_POWER, D.power + (0.35 + Math.min(4, pw)) * mul);
  D.lastGain = r1(((0.35 + Math.min(4, pw)) * mul) * 10) / 10;
  D.praying = praying;
  // 祈る人は願いごとをする
  for (const p of prayers) if (R.chance(0.12)) makeWish(sim, p, D);
  // 天から降った武器・宝の場所に近づいた人が見つける（判定は decide でも）
  // 天候の御業が続く地方は、その天気を保つ
  const wx = S.wx;
  if (wx) for (const [i, h] of Object.entries(D.holdWx)) { if (h.until < sim.today) { delete D.holdWx[i]; continue; } const st = wx.r[i]; if (st && st.w !== h.w) { st.w = h.w; if (h.w === 'rain' || h.w === 'snow') { st.dry = 0; } } }
}

// ---------- 毎日 ----------
export function divineDaily(sim) {
  const D = ensureDivine(sim), S = sim.S, R = sim.rng;
  // 町ごとの信仰（大人の信心の平均）と、教会・祠の力
  const acc = {};
  let tot = 0, n = 0;
  for (const p of sim.living()) {
    if (sim.ageOf(p) < 14) continue;
    const a = acc[p.s] || (acc[p.s] = { f: 0, n: 0, clergy: 0, apo: 0 });
    a.f += p.values.faith; a.n++;
    if (['priest', 'nun', 'cleric', 'shaman', 'tribe_elder'].includes(p.job)) a.clergy++;
    if (p.apostate) a.apo++;
    tot += p.values.faith; n++;
  }
  D.faith = n ? r1(tot / n * 100) : 50;
  D.towns = {};
  for (const [sid, a] of Object.entries(acc)) {
    const f = a.f / a.n * 100;
    D.towns[sid] = { faith: r1(f), apo: a.apo, n: a.n };
    D.church[sid] = r1(clamp(f * (0.6 + Math.min(4, a.clergy) * 0.15) - a.apo * 4 - (D.heresy[sid] ? 10 : 0), 0, 150));
  }
  // 恵みと災いの流れ：続けば信仰が上がる／恐れと恨みが増える
  const g = D.tone.grace, w = D.tone.wrath;
  if (g > 2 || w > 2) {
    for (const p of sim.living()) {
      if (sim.ageOf(p) < 10) continue;
      const d = dvOf(p);
      if (g > w + 1.5) { p.values.faith = clamp(p.values.faith + 0.0025 * Math.min(8, g - w), 0.02, 0.99); d.love = clamp(d.love + 0.6 * Math.min(8, g - w), 0, 100); }
      else if (w > g + 1.5) {
        d.fear = clamp(d.fear + 0.8 * Math.min(8, w - g), 0, 100);
        if (p.values.faith < 0.5) { d.grudge = clamp(d.grudge + 0.9 * Math.min(8, w - g), 0, 100); p.values.faith = clamp(p.values.faith - 0.002 * Math.min(8, w - g), 0.02, 0.99); }
      }
    }
  }
  D.tone.grace *= 0.85; D.tone.wrath *= 0.85;
  apostasyDaily(sim, D);
  // 願い：ひとりでに叶った願いは静かに閉じ、期限が過ぎたら失望に変わる
  for (const wsh of D.wishes.slice()) { if (wsh.done) continue; if (!wishStillNeeded(sim, wsh)) settleWish(sim, D, wsh); else if (wsh.until < sim.today) closeWish(sim, D, wsh, false, ''); }
  // 町の近くの魔物（願いの種）
  D._threat = {};
  for (const c of Object.values(S.creatures)) {
    if (!c.hostile || c.hp <= 0 || c.dormant || c.inDungeon || (c.calm && S.t < c.calm)) continue;
    for (const s of S.world.settlements) if (Math.abs(c.pos.x - s.x) < s.r + 10 && Math.abs(c.pos.z - s.z) < s.r + 10) { D._threat[s.id] = (D._threat[s.id] || 0) + 1; break; }
  }
  // 神の黄金の鉱脈：鉱夫が掘った分だけ、造幣所で硬貨になる（外から入るお金として帳簿に記録）
  goldRushDaily(sim, D);
  // 天から降った武器・宝の期限
  D.hunts = D.hunts.filter((u) => !u.done && u.until >= sim.today || (u.done && sim.today - u.done < 5));
  D.relics = D.relics.filter((r) => sim.today - r.day < 80);
  // 夢のお告げ：神に仕えよ → しばらく祈り続けた人は教会に入る
  for (const p of sim.living()) {
    const G = p.dvGoal; if (!G) continue;
    if (G.until < sim.today) { p.dvGoal = null; continue; }
    if (G.k === 'serve' && !['priest', 'nun', 'cleric'].includes(p.job) && sim.today - G.day >= 5 && (p.q?.pray || 0) > -0.5 && sim.ageOf(p) >= 16 && sim.ageOf(p) < 68 && !['king', 'royal'].includes(p.rank) && R.chance(0.3)) {
      p.formerJob = p.job; p.job = p.sex === 'f' ? 'nun' : 'priest'; p.skill[p.job] = p.skill[p.job] || 0.3;
      sim.remember(p, `お告げに従って${JOBS[p.formerJob]?.name || 'これまでの暮らし'}をやめ、${JOBS[p.job].name}として教会に入った`, { emo: 0.7, imp: 1, k: 'divine' });
      sim.pushLog(`${sim.fullName(p)}が神のお告げに従い、${JOBS[p.job].name}になった。`, 'event', [p.id], p.pos);
      p.deeds = p.deeds || []; p.deeds.unshift('夢のお告げに従って神に仕えた');
    }
    if (G.k === 'king' && R.chance(0.08)) {
      const hear = sim.living().filter((q) => q.s === p.s && q.id !== p.id && (p.rel?.[q.id]?.a || 0) > 25).slice(0, 5);
      if (hear.length) sim.gossip(p, 'いつか王になると本気で言っている', 0.2, hear, { silent: true });
    }
  }
}

function goldRushDaily(sim, D) {
  const S = sim.S, R = sim.rng;
  for (const v of D.veins) {
    if (v.au <= 0) continue;
    const s = sim.town(v.sid);
    if (!s || S.towns[s.id]?.occupied) continue;
    const k = s.kingdom != null ? S.kingdoms[s.kingdom] : null;
    const folk = sim.living().filter((p) => p.s === v.sid && sim.ageOf(p) >= 16 && sim.ageOf(p) < 60 && p.jail == null && !['king', 'royal', 'noble'].includes(p.rank));
    const diggers = folk.filter((p) => p.job === 'miner' || p.dvGoal?.k === 'wealth');
    // 鉱夫が少なければ、金の噂を聞いた暮らしの苦しい人や野心のある人が、つるはしを担いで集まる（金掘り）
    if (diggers.length < 3) {
      const rush = folk.filter((p) => !diggers.includes(p) && !JOBS[p.job]?.combat).sort((a, b) => (sim.householdMoney(a) - a.values.ambition * 80) - (sim.householdMoney(b) - b.values.ambition * 80)).slice(0, 3 - diggers.length);
      for (const p of rush) { diggers.push(p); if (!p.dvDug) { p.dvDug = sim.today; sim.remember(p, `${s.name}の鉱山に神の金が出たと聞き、つるはしを担いで金掘りに加わった`, { emo: 0.5, imp: 0.6, k: 'divine' }); } }
    }
    for (const p of diggers) {
      if (v.au <= 0) break;
      const g = Math.min(v.au, r1(R.range(4, 9) * (0.6 + (p.skill?.miner ?? 0.3))));
      if (g <= 0) continue;
      v.au -= g; v.dug += g; D.led.goldDug += g;
      // 造幣所が金を買い上げて打ち出した新しい硬貨：鉱夫へ9割、国庫へ造幣益1割（国のない里は、全部を掘った人へ）
      const toCrown = k ? g * 0.1 : 0;
      const hh = sim.hh(p);
      if (hh) hh.money += g - toCrown; else p.purse = (p.purse || 0) + g - toCrown;
      if (k) k.treasury += toCrown;
      const B = S.bank;
      if (B) { B.led.issue = (B.led.issue || 0) + g; B.led.divineGold = (B.led.divineGold || 0) + g; const b = k ? B.k[k.id] : null; if (b) { b.issued = (b.issued || 0) + g; b.bullion.au = (b.bullion?.au || 0) + g; } }
      if (S.econ?.ledger) { S.econ.ledger.in['神の黄金の鉱脈'] = (S.econ.ledger.in['神の黄金の鉱脈'] || 0) + g; if (S.econ.day) S.econ.day.in += g; }
      if (R.chance(0.25)) sim.remember(p, `神の鉱脈から金を掘り出し、造幣所で${r1(g - toCrown)}銅貨に換えてもらった`, { emo: 0.7, imp: 0.6, k: 'divine' });
    }
    if (v.au <= 0) { const msg = `${s.name}の神の黄金の鉱脈は、すっかり掘りつくされた`; sim.pushLog(msg, 'event', [], s); sim.chron(`${msg}（掘り出された金は${v.dug}銅貨分）`, kOf(s)); }
  }
}

// ---------- 行動の点数（decide から） ----------
export function divineDecide(sim, p, cands, add) {
  const D = sim.S.divine;
  if (!D) return;
  // 背教者は祈らない
  if (p.apostate) for (const c of cands) if (c.type === 'pray') c.score -= 6;
  // 恐れの強い人は、神の怒りを鎮めようと祈る
  const d = p.dv;
  if (d && !p.apostate && d.fear > 30 && sim.hour() >= 7 && sim.hour() < 19) add(d.fear / 20 + p.values.faith, 'pray', sim.placeFor(p, 'church'), 30);
  // 天から降った武器・宝のそばまで来たら、見つける
  if ((D.relics.length || D.hunts.length) && p.pos && p.inside == null) findThings(sim, p, D);
  // 宝の噂を聞いた人・天の光を見た勇気ある人は、探しに行く
  const h = sim.hour();
  if (h >= 7 && h < 18 && sim.ageOf(p) >= 16 && p.jail == null) {
    if (p.dvHunt != null) {
      const u = D.hunts.find((x) => x.id === p.dvHunt && !x.done);
      if (!u) p.dvHunt = null;
      else if (Math.hypot(u.x - p.pos.x, u.z - p.pos.z) < 70) add(2.5 + p.values.ambition * 3 + p.pers.O + (sim.householdMoney(p) < 40 ? 1.5 : 0), 'stroll', { x: u.x, z: u.z }, 30, { dvHunt: u.id });
    }
    for (const r of D.relics) {
      const dist = Math.hypot(r.x - p.pos.x, r.z - p.pos.z);
      if (dist < 40) add(2 + p.values.courage * 3 + (JOBS[p.job]?.combat ? 1.5 : 0) - dist / 25, 'stroll', { x: r.x, z: r.z }, 30, { dvRelic: r.id });
    }
  }
  // 夢のお告げの目的
  const G = p.dvGoal;
  if (!G || G.until < sim.today) return;
  const boost = (type, v) => { for (const c of cands) if (c.type === type) c.score += v; };
  switch (G.k) {
    case 'king': boost('train', 2.5); boost('quest', 2); boost('plaza', 1); if (h >= 8 && h < 18) add(3 + p.values.ambition * 2, 'train', sim.placeFor(p, 'barracks'), 60); break;
    case 'revenge': boost('train', 2.5); boost('revenge', 3); boost('quest', 1.5); if (h >= 8 && h < 18) add(3 + p.values.courage * 2, 'train', sim.placeFor(p, 'barracks'), 60); break;
    case 'journey': if (h >= 7 && h < 15 && sim.rng.chance(0.3)) {
      const s = sim.townOf(p);
      const dest = sim.rng.pick(sim.S.world.settlements.filter((q) => q.id !== p.s && Math.hypot(q.x - s.x, q.z - s.z) < 80 && !sim.S.towns[q.id]?.occupied));
      if (dest) add(6 + p.pers.O * 2, 'travel', { x: dest.x, z: dest.z, dest: dest.id }, 60, { dest: dest.id });
    } break;
    case 'protect': boost('home', 2); boost('visit', 1); boost('train', 1.5); boost('defend', 3); break;
    case 'wealth': boost('work', 2.5); boost('trade', 2.5); boost('tavern', -1); break;
    case 'serve': boost('pray', 3); if (h >= 7 && h < 19) add(4 + p.values.faith * 3, 'pray', sim.placeFor(p, 'church'), 60); break;
  }
}
function findThings(sim, p, D) {
  for (const r of D.relics) {
    if (Math.hypot(r.x - p.pos.x, r.z - p.pos.z) > 2.5 || sim.ageOf(p) < 14) continue;
    D.relics.splice(D.relics.indexOf(r), 1);
    givRelic(sim, p, r.item);
    const nm = r.item.custom;
    sim.remember(p, `光の柱が降りた場所で、地に突き立った${nm}を見つけて引き抜いた`, { emo: 0.95, imp: 1, k: 'divine' });
    p.deeds = p.deeds || []; p.deeds.unshift(`天より降った${nm}を引き抜いた`);
    const msg = `${sim.fullName(p)}が、天から降った伝説の武器「${nm}」を引き抜いた`;
    sim.news(msg, 2, p.pos);
    sim.chron(msg, kOf(sim.townOf(p)));
    sim.gossip(p, `天から降った伝説の武器を引き抜いた`, 0.8, sim.living().filter((q) => q.s === p.s && q.id !== p.id).slice(0, 12), { silent: true });
    fx(sim, 'relic', p.pos.x, p.pos.z, { id: p.id, small: true });
    return;
  }
  for (const u of D.hunts) {
    if (u.done || Math.hypot(u.x - p.pos.x, u.z - p.pos.z) > 2.5) continue;
    u.done = sim.today; u.finder = p.id;
    p.dvHunt = null;
    const B = sim.S.bank;
    const h = u.hoard != null ? B?.hoards?.find((x) => x.id === u.hoard && !x.gone) : null;
    const hh = sim.hh(p);
    let msg;
    if (h && hh) {
      const k = h.k != null ? sim.S.kingdoms[h.k] : null;
      const honest = p.pers.A > 0.55 && p.pers.C > 0.4;
      const toCrown = honest && k ? r1(h.amt * 0.5) : 0;      // 埋蔵物は王のもの。正直者は半分を届け出る（bank.js と同じ）
      hh.money += h.amt - toCrown; if (toCrown) k.treasury += toCrown;
      B.led.unearth += h.amt; B.stats.found = (B.stats.found || 0) + 1; h.gone = true; h.finder = p.id;
      D.led.hoardFound += h.amt;
      sim.remember(p, `噂の場所を掘ると、古い壺が出てきた。${h.amt}枚の銅貨が入っていた${toCrown ? '。半分はお上に届け出た' : ''}`, { emo: 0.95, imp: 0.95, k: 'divine' });
      msg = `${sim.fullName(p)}が、噂の宝（銅貨${h.amt}枚入りの古い壺）を掘り当てた`;
    } else {
      const name = u.item || 'いにしえの宝物';
      p.treasures = p.treasures || []; p.treasures.push(name);
      p.fame = (p.fame || 0) + 15;
      sim.remember(p, `噂の場所を掘ると、${name}が出てきた`, { emo: 0.9, imp: 0.9, k: 'divine' });
      msg = `${sim.fullName(p)}が、噂の宝「${name}」を掘り当てた`;
    }
    sim.news(msg, 2, p.pos);
    sim.gossip(p, '噂の宝を掘り当てた', 0.7, sim.living().filter((q) => q.s === p.s && q.id !== p.id).slice(0, 12), { silent: true });
    fx(sim, 'gold', u.x, u.z, { small: true });
    for (const q of sim.living()) if (q.dvHunt === u.id) { q.dvHunt = null; if (q.id !== p.id && sim.rng.chance(0.4)) sim.remember(q, `宝を探しに行ったが、${p.given}に先を越された`, { emo: -0.3, imp: 0.45, k: 'divine' }); }
    return;
  }
}

// ---------- 画面向け ----------
export function divineSummary(sim) {
  const D = ensureDivine(sim);
  return { power: D.power, max: MAX_POWER, faith: D.faith, gain: D.lastGain || 0, praying: D.praying || 0, wishes: D.wishes.filter((w) => !w.done).length, heresy: Object.keys(D.heresy).length };
}
// その人に使える奇跡（詳細欄）
export function miraclesFor(sim, e) {
  if (!e) return [];
  const human = typeof e.id === 'number';
  if (human && (e.deathYear != null || !e.needs)) return [];
  return Object.entries(MIRACLES).filter(([, M]) => M.t.includes(human ? 'person' : 'creature')).map(([id, M]) => ({ id, M, cost: miracleCost(id, { kind: human ? 'person' : 'creature' }) }));
}
export function personDivineNote(sim, p) {
  const d = p.dv; const out = [];
  if (p.apostate) out.push('神を捨てた');
  if (p.dvGoal && p.dvGoal.until >= sim.today) out.push(`お告げ「${DREAM_GOALS[p.dvGoal.k]?.name}」`);
  if (d) {
    if (d.love > 40) out.push('神を慕う'); if (d.fear > 40) out.push('神を恐れる'); if (d.grudge > 40) out.push('神を恨む');
  }
  if (isEvil(sim, p)) out.push('悪人');
  return out;
}
