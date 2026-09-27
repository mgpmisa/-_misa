// 会話の思考（開発部）：その人の記憶・経験・知識から「いま話したいこと」を選び、
// その人の話し方（性格・年齢・身分・出身・口癖）で文を組み立てる。相手の返事も相手の記憶から作る。
// 同じ人が同じ日に同じ文を二度言わないようにし、町じゅうで同じ文が飛び交わないようにする。
//
// 本体からは次の2つを呼ぶだけで動く（speech.js は編集しない）。
//   mindConversation(sim, a, b) … sim.startTalk の composeConversation の代わり。戻り値は { lines, effects } で同じ形
//   mindThought(sim, p)         … newHour の innerThought の代わり。今日すでに思った文なら別の考えにする（なければ null）
//
// 人の状態（遅延初期化。古いセーブで欠けていても動く）：
//   p.tm = {
//     d   : h の日付,  h: 今日口にした文のハッシュ,  th: 今日の心の声のハッシュ,
//     r   : 最近（数日）の文のハッシュ（48件の輪）,
//     tk  : 最近自分が話した話題の鍵（16件）,
//     told: { 相手id: [その相手に話した話題の鍵…] }（相手24人・各8件まで）,
//     met : { 相手id: { d: 最後に話した日, n: 回数, s: 相手が最後に話してくれたこと, sd: その日, k } }（40人まで）,
//     kn  : 人から聞いた知識 [{ key, k:'px'|'nw'|'lore'|'danger', ... , from, d }]（12件）,
//     px  : 覚えている値段 { 品: [値, 日] },
//     wx  : 覚えている天気 { w, d },
//     kk  : 知っている知識の鍵（60件。同じことを教え返さないため）,
//     th/tr: 今日・最近の心の声のハッシュ
//   }
// どの配列も上限つきなので、セーブが際限なく太ることはない（1人あたり数KB以内）。
import { Voice, pickTopic, react, firstPerson, innerThought, composeConversation } from './speech.js';
import { casualKin } from './kin.js';
import { JOBS, GOODS, SPECIES } from './data.js';
import { WX_NAME, ensureWx, regionIndex } from './weather.js';
import { calendarUpcoming } from './calendar.js';
import { isBedridden, ailName } from './health.js';
import { purposeThoughts, LIFE } from './purpose.js';

// ---------- 小道具 ----------
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hashN = (a, b = 0) => { let x = (Math.imul((a | 0) + 0x9e37, 2654435761) ^ Math.imul(b + 1, 40503)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };
const KN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const kn = (n) => (n >= 1 && n <= 10 ? KN[n] : String(n));
const alive = (api, id) => { const q = id != null ? api.S.people[id] : null; return q && q.deathYear == null && q.needs ? q : null; };
const jobName = (j) => JOBS[j]?.name || '';
const stripEnd = (t) => t.replace(/[。！!]+$/, '');
const firstNum = (t) => { const m = t.match(/(\d+)銅貨/); return m ? +m[1] : null; };
// 「〜た」「〜んだ」で終わる、出来事の記憶か（「あと少しだ」のような今の状態は、いつの話かを付けない）
const isPast = (txt) => /(た|んだ)$/.test(txt.split('。')[0]);
const clip = (arr, n) => { if (arr.length > n) arr.splice(0, arr.length - n); };

// 全員の「この3日で誰かが言った文」（保存しない。読み込み直後は空で、それでかまわない）
const GL = { d: -1, seen: new Set(), prev: [new Set(), new Set()] };
function glReset(api) {
  if (GL.d === api.today) return;
  GL.prev = GL.d === api.today - 1 ? [GL.seen, GL.prev[0]] : [new Set(), new Set()];
  GL.d = api.today; GL.seen = new Set();
}
const glHas = (h) => GL.seen.has(h) || GL.prev[0].has(h) || GL.prev[1].has(h);

// ---------- 心の状態 ----------
export function mindOf(api, p) {
  let m = p.tm;
  if (!m || typeof m !== 'object') m = p.tm = {};
  if (!Array.isArray(m.h)) m.h = [];
  if (!Array.isArray(m.th)) m.th = [];
  if (!Array.isArray(m.r)) m.r = [];
  if (!Array.isArray(m.tk)) m.tk = [];
  if (!m.told || typeof m.told !== 'object') m.told = {};
  if (!m.met || typeof m.met !== 'object') m.met = {};
  if (!Array.isArray(m.kn)) m.kn = [];
  if (!m.px || typeof m.px !== 'object') m.px = {};
  if (!Array.isArray(m.kk)) m.kk = [];
  if (m.d !== api.today) { m.d = api.today; m.h = []; m.th = []; }
  return m;
}
function tellMark(mA, bid, key) {
  const t = mA.told[bid] || (mA.told[bid] = []);
  if (!t.includes(key)) t.push(key);
  clip(t, 8);
  const ids = Object.keys(mA.told);
  if (ids.length > 24) delete mA.told[ids[0]];
}
function metMark(api, mB, aid, info) {
  const e = mB.met[aid] || (mB.met[aid] = { d: api.today, n: 0 });
  e.d = api.today; e.n = (e.n || 0) + 1;
  if (info) { e.s = info.s; e.sd = api.today; e.k = info.k; e.e = info.e; }
  const ids = Object.keys(mB.met);
  if (ids.length > 40) { let old = ids[0]; for (const id of ids) if ((mB.met[id].d ?? 0) < (mB.met[old].d ?? 0)) old = id; delete mB.met[old]; }
}
function knowKey(m, key) { if (!m.kk.includes(key)) { m.kk.push(key); clip(m.kk, 60); } }
function learn(api, p, item) {
  const m = mindOf(api, p);
  const had = m.kk.includes(item.key);
  knowKey(m, item.key);
  if (had || m.kn.some((x) => x.key === item.key)) return false;
  m.kn.push({ ...item, d: api.today });
  clip(m.kn, 12);
  return true;
}

// ---------- その人らしさ（口癖・語尾の癖・なまり） ----------
const TIC = {
  plain: ['まあ、', 'なんていうか、', 'ほら、', '実はさ、', 'それがさ、', 'そうそう、', 'いやあ、', 'うーん、', '正直、', 'ねえ、', 'あのさ、', 'ところで、'],
  rough: ['おう、', 'いやあ、', 'ったく、', 'それがよ、', '聞けよ、', 'へっ、', 'まあな、', 'なあ、'],
  polite: ['実は、', 'そういえば、', 'あの、', 'ええと、', 'それが、', 'ところで、', '思えば、'],
  elder: ['ほう、', 'やれやれ、', 'さて、', 'ふむ、', 'そうそう、', 'いやはや、', 'なあ、'],
  child: ['あのね、', 'ねえねえ、', 'えっとね、', 'きいてきいて、', 'そうだ、'],
  noble: ['まあ、', 'ところで、', 'そういえば、', 'ねえ、'],
  knight: ['はっ、', '実は、', 'その、', '申し上げますと、'],
  sage: ['ふむ、', '興味深いことに、', '思うに、', 'さて、', 'つまりだね、'],
  royal: ['うむ、', '時に、', 'さて、', 'ふむ、'],
};
const AFTER = {
  plain: { 0: ['ほんとに。', 'うん。', 'いや、ほんと。', 'まあ、そういうこと。'], 1: ['へへ。', 'いいもんだね。', 'うれしいね。'], '-1': ['まったく。', 'やれやれ。', '参ったよ。', '困ったもんだ。'] },
  rough: { 0: ['まあな。', 'ま、そんなとこだ。', 'ほんとだぜ。'], 1: ['へへっ。', '悪くねえ。'], '-1': ['ちっ。', 'まったくよ。', 'やってらんねえ。'] },
  polite: { 0: ['本当に。', 'ええ。'], 1: ['ありがたいことです。'], '-1': ['困ったものです。', 'やれやれです。'] },
  elder: { 0: ['うむ。', 'ほっほ。'], 1: ['ありがたいことじゃ。', 'ほっほっほ。'], '-1': ['やれやれじゃ。', '困ったもんじゃ。'] },
  child: { 0: ['ほんとだよ。', 'うん！'], 1: ['えへへ。', 'やったね！'], '-1': ['むー。', 'やだなあ。'] },
};
function traitsOf(p) {
  const h = hashN(p.id, 7);
  const origin = p.origin || '';
  return {
    h,
    tic: [h % 97, (h >>> 8) % 89],
    ticRate: 0.1 + (p.pers?.E ?? 0.5) * 0.25 + ((h >>> 16) % 10) / 60,
    afterRate: 0.03 + ((h >>> 20) % 10) / 100,
    nameRate: 0.05 + ((h >>> 24) % 8) / 60,
    excl: (p.pers?.E ?? 0.5) > 0.62 && (h & 3) !== 0,
    shy: (p.pers?.N ?? 0.5) > 0.62 && (p.pers?.E ?? 0.5) < 0.42,
    favP: 0.35 + ((h >>> 12) % 10) / 25,
    accent: /北の雪国/.test(origin) ? 'north' : /南の砂漠/.test(origin) ? 'south' : null,
    accentOn: (h >>> 28) % 10 < 7,
  };
}

// なまり（庶民の話し方だけ）
const DIALECT = {
  north: {
    n: { m: ['だべ', 'だべな', 'だ'], f: ['だべ', 'だよ'] },
    v: { m: ['べ', 'んだべ', 'んだ'], f: ['べ', 'のよ', 'んだべ'] },
    a: { m: ['な', 'だべな'], f: ['ね', 'だべね'] },
    qn: { m: ['だべか？', 'か？'], f: ['だべか？'] },
    qv: { m: ['のか？', 'べか？'], f: ['の？', 'べか？'] },
  },
  south: {
    n: { m: ['さ', 'なのさ', 'だよ'], f: ['さ', 'なのよ'] },
    v: { m: ['のさ', 'んだよ', 'さ'], f: ['のさ', 'のよ'] },
    a: { m: ['ねえ', 'な'], f: ['ねえ'] },
    qn: { m: ['かい？'], f: ['かい？', 'なの？'] },
    qv: { m: ['のかい？'], f: ['のかい？'] },
  },
};

class MindVoice extends Voice {
  constructor(api, p, listener) {
    super(api, p, listener);
    this.tr = traitsOf(p);
    this.fav = {};
    let acc = this.tr.accent;
    if (!acc && api.townOf) { const k = api.townOf(p)?.kingdom; acc = k === 1 ? 'north' : k === 2 ? 'south' : null; }
    const commoner = ['plain', 'rough', 'child', 'elder'].includes(this.style) && !['noble', 'royal', 'king', 'knight'].includes(p.rank);
    this.dialect = acc && commoner && this.tr.accentOn && this.style !== 'elder' ? acc : null;
  }
  tail(kind) {
    if (this.dialect && DIALECT[this.dialect][kind] && this.rng.next() < 0.7) {
      const d = DIALECT[this.dialect][kind][this.p.sex === 'f' ? 'f' : 'm'];
      return d[(this.tr.h >>> 3) % d.length] && this.rng.next() < 0.6 ? d[(this.tr.h >>> 3) % d.length] : this.rng.pick(d);
    }
    // 語尾の癖：その人のお気に入りの語尾を多めに使う
    const fk = kind + this.key;
    const pick = () => { let t = super.tail(kind); if (t === 'であろう') t = super.tail(kind); return t === 'であろう' ? 'だ' : t; };
    if (this.fav[fk] == null) this.fav[fk] = pick();
    return this.rng.next() < this.tr.favP ? this.fav[fk] : pick();
  }
  group() { return this.style === 'noble' || this.style === 'royal' || this.style === 'knight' || this.style === 'sage' || this.style === 'polite' || this.style === 'elder' || this.style === 'child' || this.style === 'rough' ? this.style : 'plain'; }
}

// 文の中身に合う語尾をつける（本文の終わり方で判断する）
function say1(v, body) {
  body = stripEnd(body.trim());
  if (!body) return '';
  if (/[？?]$/.test(body)) return v.fill(body);
  if (/(です|ます|でした|ました|ません|ください)$/.test(body)) return v.fill(body) + '。';
  // もう終助詞などで終わっている文・呼びかけ・誘いは、そのまま言い切る
  if (/(かな|よね|よ|ね|さ|わ|ぞ|ぜ|もの|もん|っけ|って|なあ|かい|のに|けど|から|ように|よろしく|大事に|つけて|がんばって|頑張って|ないで|ありがとう)$/.test(body)) return v.fill(body) + '。';
  if (/[おこそとのほもよろごぞどぼ]う$/.test(body) || /(んだ|て|で)$/.test(body)) return v.fill(body) + '。';
  if (/(報い|違い|思い|災い|匂い|戦い|願い|付き合い|お互い|具合|くらい|ぐらい)$/.test(body)) return v.s(body, 'n');
  if (/だ$/.test(body) && !/[うくぐすつぬぶむるいたん]だ$/.test(body)) return v.s(body.slice(0, -1), 'n');
  if (/[うくぐすつぬぶむるたいだ]$/.test(body) || /ない$/.test(body)) return v.s(body, 'v');
  return v.s(body, 'n');
}
// 「そうか……」のような言い切らない文
const raw = (v, body, end = '。') => v.fill(body) + end;

// その人の口癖・呼びかけ・なまりを重ねる
// opt.role: 'topic'（話題の文。口癖を足してよい）/ 'reply'（返事。口癖は足さない）
function personalize(api, v, text, sentiment = 0, opt = {}) {
  const R = api.rng, tr = v.tr, g = v.group();
  let t = text;
  const q = /[？?]$/.test(t);
  let pre = false;
  if (opt.role === 'topic' && !opt.lead && R.next() < tr.ticRate * (opt.ticMul ?? 1)) {
    const list = TIC[g] || TIC.plain;
    const tic = list[tr.tic[R.next() < 0.7 ? 0 : 1] % list.length];
    if (!t.startsWith(tic)) { t = tic + t; pre = true; }
  }
  if (!pre && v.listener && R.next() < tr.nameRate * (opt.nameMul ?? 1) && !t.includes(v.fill('{you}'))) t = v.fill('{you}、') + t;
  if (!q && AFTER[g] && R.next() < tr.afterRate * (opt.afterMul ?? 1)) {
    const tbl = AFTER[g];
    const s = sentiment > 0.3 ? 1 : sentiment < -0.3 ? -1 : 0;
    const list = tbl[s] || tbl[0];
    t = t + (R.next() < 0.7 ? list[(tr.h >>> 5) % list.length] : R.pick(list));
  }
  if (tr.excl && !q && R.next() < 0.3) t = t.replace(/。$/, '！');
  if (tr.shy && R.next() < 0.3) t = t.replace(/。$/, '……');
  if (v.style === 'rough' && v.p.sex === 'f') t = t.replace(/だぜ/g, 'だよ').replace(/じゃねえか/g, 'じゃないか');
  return t;
}

// ---------- いつのことか ----------
function whenOf(api, m) {
  if (m.t < 0 || api.today - m.t > 40) {
    if (m.ageAt == null) return '昔';
    if (m.ageAt < 7) return '小さいころ';
    return `${m.ageAt}歳のころ`;
  }
  const d = api.today - m.t;
  const h = m.min != null ? (m.min % 1440) / 60 : 12;
  if (d <= 0) return h < 10 ? '今朝' : api.hour() - h < 2 ? 'さっき' : '今日';
  if (d === 1) return h >= 19 ? 'ゆうべ' : '昨日';
  if (d === 2) return 'おととい';
  if (d <= 6) return `${kn(d)}日前`;
  if (d <= 13) return 'この前';
  return `${d}日ほど前`;
}
const daysAgoTxt = (d) => (d <= 0 ? '今日' : d === 1 ? '昨日' : d === 2 ? 'おととい' : `${kn(d)}日前`);

// 記憶の文を、話し手の一人称に合わせる
const ownTxt = (v, txt) => txt.replace(/わたし/g, v.me);

// 記憶の種類ごとのひとこと（[本文]）。{n} は文中の銅貨の数、{q} はかかわった人
const COMMENT = {
  gear: { 1: ['これで少しは安心して戦える', 'いい買い物だった', '財布は軽くなったけど、後悔はない', '手になじむまで、しばらくかかりそう'], 0: ['道具は手入れが肝心', '長く使えるといいけど'], '-1': ['高くついた'] },
  trade: { 1: ['{n}銅貨のもうけ。悪くない', '次はもっと遠くまで売りに行く', '商いは足で稼ぐもの'], '-1': ['商売は甘くない', '次はもっとうまくやる', '街道の関税が痛い'], 0: ['道中は長かった'] },
  spend: { 1: ['たまの贅沢くらい、いいよね', '働いた甲斐があった', 'こういうのがあるから明日も頑張れる'], 0: ['使うときは使わないと'], '-1': ['ちょっと使いすぎた'] },
  hunt: { 1: ['腕が上がってきた気がする', '次はもっと大物を狙う', '報酬で装備を新しくしたい'] },
  quest: { 1: ['仲間のおかげ', '依頼をこなすたびに自信がつく'], '-1': ['生きて帰れただけまし', '次はもっと備えてから行く', 'しばらく奥には近づきたくない'] },
  sight: { '-1': ['しばらく近づかないほうがいい', '思い出すだけで足が震える', '夜はあのあたりを通らないほうがいい'] },
  death: { '-1': ['まだ信じられない', 'あの人の分まで生きないと', '家の中が静かすぎる', '夢に出てくる'] },
  death2: { '-1': ['人の命なんて、はかないもの', 'いい人ほど早く逝く'], 0: ['人の命なんて、はかないもの'] },
  theft: { '-1': ['腹の虫がおさまらない', '衛兵は何をしてるんだか', '人の多いところでは財布をしっかり握っておかないと'] },
  robbed: { '-1': ['街道はもう安心して歩けない'] },
  help: { 1: ['{q}には頭が上がらない', '今度お礼をしないと', '困ったときはお互いさま'] },
  gift: { 1: ['{q}にもらったもの。大事にする', 'うれしくて、何度も眺めてしまう'] },
  date: { 1: ['{q}は話が面白い', 'また一緒に行きたい'] },
  dream: { 0: ['何かの前触れかな', '妙に覚えてる', '夢って不思議なもの'], 1: ['いい夢だった'], '-1': ['目が覚めても胸がどきどきしてた'] },
  school: { 1: ['勉強も悪くない', '先生には内緒'], 0: ['覚えることがたくさんある'] },
  relief: { 0: ['ありがたいけど、情けない気もする', '早く自分の力で食べていけるようになりたい'], '-1': ['ありがたいけど、情けない気もする'] },
  tax: { 0: ['税ってのは、どうにも慣れない'], '-1': ['税ってのは、どうにも慣れない', 'お上は取ることばかり'] },
  work: { 1: ['日銭でも、ないよりまし', 'これで少し息がつける'], 0: ['地道にやるしかない'] },
  market: { 0: ['市場がにぎやかになる', 'これで値が落ち着くといい'], 1: ['これで値が下がるといい'] },
  festival: { 1: ['ああいう日があるから、また頑張れる', '来年も晴れるといい'] },
  pet: { 1: ['かわいくて仕方ない', '動物は正直'], 0: ['動物は正直'] },
  grandkids: { 1: ['孫の顔を見ると、疲れも吹き飛ぶ', '孫は目に入れても痛くない'] },
  career: { 1: ['長年の苦労が報われた', 'あと少しの辛抱'], 0: ['先のことを考えるのも大事'] },
  pension: { 0: ['これで老後の心配はひとつ減った'], 1: ['これで老後の心配はひとつ減った'] },
  money: { 0: ['証文があれば盗まれない', '銅貨は手元に置くと、つい使ってしまう'], 1: ['思わぬ実入り'] },
  ill: { '-1': ['早く治したい', '体が資本なのに', '寝込むと、あれこれ考えてしまう'] },
  fight: { '-1': ['生きてるだけで儲けもの', '次はもっと慎重にやる', 'まだ手が震える'] },
  party: { 1: ['仲間がいるって心強い'], '-1': ['寂しくなる'], 0: ['仲間は大事'] },
  craft: { 1: ['職人冥利に尽きる', '腕は裏切らない'], 0: ['腕は裏切らない'] },
  farm: { '-1': ['情が移ると、つらい'], 0: ['情が移ると、つらい'] },
  garden: { 1: ['土いじりは心が落ち着く'] },
  loan: { 0: ['ちゃんと返してくれるといいけど'] },
  debt: { '-1': ['期日までに返せるかどうか', '借金は重い'] },
  justice: { 1: ['これで町も少しは静かになる'] },
  inherit: { 0: ['形見は大事にする'], '-1': ['お金より、生きていてほしかった'] },
  duty: { 0: ['お役目だから仕方ない'], '-1': ['国境は寒いだろうな'] },
  grave: { '-1': ['墓の前だと、つい長話してしまう'], 0: ['墓の前だと、つい長話してしまう'] },
  love: { 1: ['いい人だった'], '-1': ['縁ってのは難しい'] },
  romance: { 1: ['思い出すだけで顔が熱くなる'] },
  engage: { 1: ['まだ夢みたい'] },
  marriage: { 1: ['あの日のことは一生忘れない'] },
  child: { 1: ['あの子の顔を見ると、何でもできる気がする'] },
  preg: { 1: ['家族が増える'] },
  arrival: { 0: ['知らない土地は、まだ慣れない', 'ここの水にも、少しは慣れた'] },
  uwcrime: { 0: ['……これは内緒の話', '誰にも言うなよ'] },
  gear2: {},
};
const GENERIC = { 1: ['思い出すだけで顔がゆるむ', 'いい日だった', '今でもうれしい', 'ちょっと自慢'], '-1': ['思い出すと気が重い', 'まだ胸がざわざわする', 'あれはこたえた', '忘れたいけど忘れられない'], 0: ['まあ、そんなこともある', 'それだけの話なんだけど', 'なんとなく覚えてる'] };
const KIND_NOUN = { gear: '武器の', trade: '商いの', spend: '買い物の', hunt: '魔物退治の', quest: '依頼の', sight: '魔物を見た', death: '弔いの', theft: '財布の', dream: '夢の', school: '学校の', work: '仕事の', ill: '具合の', fight: 'けんかの', party: '仲間の', festival: 'お祭りの', pet: '動物の', grandkids: '孫の', debt: '借金の', money: 'お金の', tax: '税の' };

function sgn(e) { return e > 0.25 ? 1 : e < -0.25 ? -1 : 0; }
function commentFor(api, m, qName, age = 30) {
  const tbl = (m.k === 'grandkids' && age < 30) ? GENERIC : COMMENT[m.k] || GENERIC;
  const s = sgn(m.emo);
  const list = tbl[s] || GENERIC[s];
  let c = api.rng.pick(list);
  const n = firstNum(m.txt);
  if (c.includes('{n}') && n == null) c = api.rng.pick(GENERIC[s]);
  if (c.includes('{q}') && !qName) c = api.rng.pick(GENERIC[s]);
  return c.replace('{n}', n).replace('{q}', qName || '');
}
function summaryOf(m) {
  const t = m.txt.split('。')[0];
  if (t.length <= 22) return `${t}って話`;
  return `${KIND_NOUN[m.k] || 'あの'}話`;
}

// ---------- 知識 ----------
// 職業ごとの品（値段の話の種）
const JOB_GOODS = {
  smith: ['ore', 'weapons', 'tools'], miner: ['ore', 'gem', 'stone'], farmer: ['wheat'], baker: ['wheat', 'bread'], miller: ['wheat', 'bread'],
  hunter: ['meat'], butcher: ['meat'], fisher: ['fish'], diver: ['fish', 'gem'], woodcutter: ['wood'], carpenter: ['wood', 'furniture'], charcoal: ['wood'],
  tailor: ['cloth', 'wool'], weaver: ['cloth', 'wool'], shepherd: ['wool', 'meat'], rancher: ['meat', 'wool'], brewer: ['ale', 'wheat'], innkeeper: ['ale', 'bread'],
  beekeeper: ['honey'], herbalist: ['herbs', 'medicine'], doctor: ['medicine', 'herbs'], gatherer: ['herbs'], cobbler: ['shoes'], potter: ['pottery'],
  jeweler: ['gem', 'jewelry'], mason: ['stone'], cook: ['meat', 'bread'], merchant: Object.keys(GOODS), wanderer: ['bread', 'ale', 'cloth'],
  messenger: ['bread', 'shoes'], captain: ['fish', 'cloth', 'wood'], sailor: ['fish', 'ale'], changer: ['gem', 'jewelry'], shipwright: ['wood'],
  warrior: ['weapons'], knight: ['weapons'], soldier: ['weapons', 'bread'], adventurer: ['weapons', 'medicine'], archer: ['weapons', 'wood'],
};
const CONSUMER = { smith: ['ore', 'wood'], baker: ['wheat'], brewer: ['wheat'], carpenter: ['wood'], tailor: ['cloth', 'wool'], weaver: ['wool'], cook: ['meat'], jeweler: ['gem'], doctor: ['herbs'], cobbler: ['cloth'] };

const JOB_LORE = {
  smith: ['いい鋼は、焼き入れの水の温度で決まる', '剣は叩くより冷ますほうが難しい', '鉄は真っ赤なうちより、少し暗い色のときに打つほうが割れない', '炭の質が悪いと、どんな腕でもいい刃にならない', '刃こぼれは、研ぐより打ち直したほうが長持ちする'],
  farmer: ['麦は雨のあとの三日で根を張る', '畑は三年に一度休ませると、土が戻る', 'ツバメが低く飛んだら雨が近い', '霜の降りた朝は麦踏みをしないほうがいい', '豆を植えたあとの畑は、麦がよく育つ'],
  hunter: ['シカは風上から近づくと逃げられる', 'イノシシは突進したあと、すぐには向きを変えられない', 'クマに会ったら背中を見せちゃいけない', 'オオカミは群れの頭を仕留めると散る', '足跡が乾いていたら、獲物はもう遠くにいる'],
  miner: ['坑道でランプの火が青くなったら、すぐ逃げろ', '鉄の筋は赤茶けた岩の下を走ってる', '坑道の天井がぱらぱら鳴ったら、崩れる前触れ', '宝石は硬い岩ほど奥に眠ってる'],
  fisher: ['朝まずめと夕まずめが一番釣れる', '海鳥が群れてるところに魚がいる', '南風の日は魚が浅瀬に寄る', '満ち潮の始まりが狙い目'],
  baker: ['パン生地は寒い日ほどゆっくり寝かせる', '塩ひとつまみで味が変わる', '窯の温度は手をかざせばわかる', '古い麦粉は、よく膨らまない'],
  merchant: ['安く買って高く売る。でも一番大事なのは信用', '街道は雨の翌日が一番ぬかるむ', '港町では布が、村では道具がよく売れる', '関所の役人の機嫌は、朝のうちがいい'],
  doctor: ['熱には柳の皮を煎じるといい', '傷は煮立てた布で巻くと膿みにくい', '井戸の水は沸かしてから飲むのが一番', '眠るのが何よりの薬'],
  herbalist: ['薬草は朝露が乾く前に摘むと効きがいい', '毒草は葉の裏が白いものが多い', 'カモミールは眠れない夜に効く'],
  carpenter: ['木は切ってから一年寝かせないと反る', 'カシは硬いが、割れにくい', '釘より木組みのほうが長持ちする'],
  brewer: ['麦酒は樽の木で味が変わる', '仕込みは寒い時期のほうが失敗しない'],
  innkeeper: ['旅人の靴を見れば、どこから来たかわかる', '酔った客の話の半分は作り話'],
  sailor: ['西の空が赤い朝は、海が荒れる', '帆がばたつく風は、嵐の前触れ'],
  captain: ['西の空が赤い朝は、海が荒れる', '潮の流れを読めない船長は、船を沈める'],
  woodcutter: ['木は冬に切ると、よく乾く', '倒す方向は、枝ぶりを見て決める'],
  tailor: ['いい布は、光にかざすと目がそろってる', '袖は縫う前に三度測れ'],
  weaver: ['羊毛は湿った日のほうが糸によりがかかる'],
  shepherd: ['羊は先頭の一頭についていく', '雨の前は羊が固まって動かない'],
  rancher: ['牛は機嫌がいいと乳の出もいい', '雷の夜は柵を見回ったほうがいい'],
  beekeeper: ['蜂は黒い服を嫌う', '煙をたけば蜂はおとなしくなる'],
  cook: ['肉は焼く前に塩をして少し置く', '香草は最後に入れると香りが立つ'],
  mason: ['石は目に沿って割ると、きれいに割れる', '土台の石が一番大事'],
  priest: ['祈りは言葉より心', '人の話を最後まで聞くことが、何よりの施し'],
  teacher: ['子どもは叱るより、ほめたほうが覚える'],
  midwife: ['赤ん坊は、たいてい夜明け前に生まれてくる'],
  guard: ['怪しいやつは、目を合わせようとしない', '夜明け前が一番眠い。そこを盗人は狙う'],
  jailer: ['牢の中で一番うるさいやつは、たいてい小物'],
  potter: ['粘土はよく寝かせるほど割れにくい'],
  cobbler: ['靴底は、かかとから減る'],
  alchemist: ['硫黄と水銀は、混ぜる順番が命'],
  scholar: ['古文書は、書いた人の癖をつかめば読める'],
  wizard: ['呪文は声の高さで効き目が変わる'],
  bard: ['悲しい歌ほど、酒場では喜ばれる'],
};
// 魔物の弱点（冒険者・兵士の知恵）
const MONSTER_LORE = {
  slime: '真ん中の核を突けば一撃', bigslime: '核が二つあるから、両方つぶさないとだめ', kingslime: '分裂する前に、一気に叩くのがこつ',
  goblin: '群れで来るけど、頭目を倒せば逃げ出す', hobgoblin: '力任せだから、受け流して脇を突く', goblinlord: '取り巻きを先に減らさないと囲まれる',
  orc: '力は強いが動きが鈍い。足を狙う', orcking: '斧を振り上げたときが隙',
  skeleton: '刃物より鈍器が効く', skelknight: '盾の裏に回れば、案外もろい', lich: '聖水と祈りの言葉を嫌う',
  mummy: '火に弱い。松明を忘れちゃいけない', pharaoh: '仮面を割れば力が抜ける',
  spider: '糸に絡まれたら終わり。火で焼き払う', arachne: '上半身ばかり見てると、足にやられる',
  wyvern: '翼の付け根が弱い', dragon: '腹の鱗だけは薄い', golem: '額の刻印を削れば止まる', unicorn: '清い心の者にしか近づかない',
  wolf: '群れで囲んでくる。背中を壁に預ける', bear: '立ち上がったら、目をそらさずに下がる', boar: '突進を横によければ、あとは脇腹が空く',
  tiger: '背中を見せたら飛びかかってくる', polarbear: '雪の上では、向こうのほうが速い', croc: '水辺では絶対に戦わない', scorpion: '尻尾の針にだけ気をつければ怖くない',
  snake: '首の後ろを押さえれば噛めない', bat: '明かりを振り回すと散る', rat: '群れる前に巣穴をふさぐ',
  imp: 'すばしこいが打たれ弱い', demonsoldier: '日の光の下だと動きが鈍る', demongeneral: '一人で挑むものじゃない',
};
const FIGHTERS = new Set(['adventurer', 'warrior', 'knight', 'soldier', 'guard', 'archer', 'paladin', 'hunter', 'royalguard', 'general', 'cleric', 'guildmaster', 'sage']);
const speciesIn = (txt) => { for (const [id, sp] of Object.entries(SPECIES)) if (MONSTER_LORE[id] && txt.includes(sp.name)) return id; return null; };

// ---------- 話題の候補 ----------
// 候補: { key, w, kind, make(v) → topic }
function candidates(api, A, B, mA, vA) {
  const out = [];
  const R = api.rng, today = api.today;
  const told = mA.told[B.id] || [];
  const recentKeys = mA.tk;
  const add = (key, w, make) => { if (w <= 0 || told.includes(key) || recentKeys.includes(key)) return; out.push({ key, w, make }); };
  const age = api.ageOf(A), bAge = api.ageOf(B);
  const E = A.pers.E, N = A.pers.N;
  const mB = mindOf(api, B);

  // (1) 自分の最近の体験
  const mine = [];
  for (const m of A.memories) {
    if (m.g || m.t < 0 || !isPast(m.txt)) continue;
    const d = today - m.t;
    if (d > 8) continue;
    if (m.k === 'story' || m.k === 'news' || m.k === 'death2' && m.src !== 'self') continue;
    if (m.k === 'uwcrime' && !(A.rel?.[B.id]?.a > 50)) continue;
    const sc = (0.35 + Math.abs(m.emo) * (m.imp ?? 0.3) * 2.2) * (1 - d / 10) * (m.emo < 0 ? 0.7 + N * 0.6 : 0.7 + E * 0.6);
    mine.push([sc, m]);
  }
  mine.sort((a, b) => b[0] - a[0]);
  for (const [sc, m] of mine.slice(0, 5)) {
    // 魔物を見た話は、危険を知らせるために日を変えて何度でもする
    if (m.k === 'sight') add('m' + (m.min ?? m.t) + ':' + today, 1.8, (v) => topicMem(api, A, B, v, m));
    else add('m' + (m.min ?? m.t) + ':' + (m.txt.length), sc * 1.2, (v) => topicMem(api, A, B, v, m));
  }
  // 危ない場所（危険の記憶）を教える
  const dk = Object.entries(A.danger || {}).filter(([, x]) => x > 2);
  if (dk.length) {
    dk.sort((a, b) => b[1] - a[1]);
    const [dkey, dval] = dk[R.next() < 0.6 ? 0 : (R.next() * dk.length) | 0];
    add('dg:' + dkey + ':' + today, 1 + A.pers.A, (v) => topicDangerPlace(api, A, B, v, dkey, dval));
  }
  // 昔の思い出（子どものころ・若いころ）
  if (R.next() < 0.5) {
    const olds = A.memories.filter((m) => !m.g && (m.t < 0 || today - m.t > 40) && m.ageAt != null && (m.imp ?? 0) >= 0.45 && m.k !== 'story' && isPast(m.txt));
    if (olds.length) { const m = R.pick(olds); add('o' + (m.min ?? m.t) + ':' + m.txt.length, 0.35 + (age > 50 ? 0.4 : 0), (v) => topicOld(api, A, B, v, m)); }
  }
  // 聞いた昔話を話す
  const tales = A.memories.filter((m) => m.k === 'story' && m.src === 'heard' && today - m.t < 20);
  if (tales.length) { const m = R.pick(tales); add('tl' + (m.min ?? m.t), 0.3 + A.pers.O * 0.4, (v) => topicTale(api, A, B, v, m)); }

  // (2) 噂（相手が知らなさそうなこと）
  const gos = A.memories.filter((m) => m.g && m.g.subj !== B.id && !(B.gk && B.gk[m.g.key]) && today - m.t < 12 && alive(api, m.g.subj));
  if (gos.length) {
    const m = gos.length > 1 ? gos.reduce((a, b) => (Math.abs(b.g.emo) + (b.t - a.t) * 0.1 > Math.abs(a.g.emo) ? b : a)) : gos[0];
    add('g:' + m.g.key, 0.7 + E * 0.9 + (A.pers.A < 0.45 ? 0.5 : 0), (v) => topicRumor(api, A, B, v, m));
  }
  // 相手へのお祝い・お悔やみ
  const cg = A.memories.find((m) => m.g && m.g.subj === B.id && today - m.t < 10 && m.g.congrat);
  if (cg) add('cg:' + cg.g.key, 3, (v) => topicCongrat(api, A, B, v, cg));

  // (3) 相手との共通の思い出
  const shared = A.memories.filter((m) => m.about && m.about.includes(B.id) && !m.g && ['help', 'gift', 'date', 'friend', 'romance', 'engage', 'marriage', 'life', 'love', 'quarrel', 'event', 'school'].includes(m.k));
  if (shared.length) {
    const m = R.pick(shared);
    const ok = m.k !== 'quarrel' || (A.rel?.[B.id]?.a ?? 0) > 10;
    if (ok) add('sh' + (m.min ?? m.t), 1.1 + (A.rel?.[B.id]?.f ?? 0) / 80, (v) => topicShared(api, A, B, v, m));
  }
  // 共通の知り合い
  const acq = commonAcq(api, A, B);
  if (acq) add('aq' + acq.q.id + ':' + (acq.m ? acq.m.t : 'x'), 0.9, (v) => topicAcq(api, A, B, v, acq));
  // 前に相手が話してくれたことの「その後」
  const met = mA.met[B.id];
  if (met && met.s && met.sd != null && today - met.sd >= 1 && today - met.sd <= 8) add('fu' + met.sd + ':' + met.s.length, 1.3, (v) => topicFollow(api, A, B, v, met));
  // 相手の様子（けが・病気・修業）
  if (B.hp != null && B.maxhp && B.hp < B.maxhp * 0.6) add('bh' + today, 1.6, (v) => topicAskHurt(api, A, B, v));
  else if (B.ail && B.ail.sev >= 15 && (A.rel?.[B.id]?.a ?? 0) > -10) add('ba' + today, 1.4, (v) => topicAskAil(api, A, B, v));
  if (B.appr && B.master != null && bAge < 30) add('bp' + today, 0.6, (v) => topicAskAppr(api, A, B, v));

  // (4) 仕事の知識
  if (A.job && age >= 14) {
    const goods = JOB_GOODS[A.job];
    if (goods) {
      const g = goods[(R.next() * goods.length) | 0];
      if (GOODS[g]) add('px:' + g + ':' + api.price(g, A.s), 0.9 + (A.job === 'merchant' ? 0.6 : 0), (v) => topicPrice(api, A, B, v, g));
    }
    if (['merchant', 'wanderer', 'messenger', 'captain', 'sailor', 'changer'].includes(A.job)) {
      const sp = bestSpread(api, A);
      if (sp) add('sp:' + sp.g + ':' + sp.sid, 1.2, (v) => topicSpread(api, A, B, v, sp));
    }
    if (JOB_LORE[A.job]) { const i = (R.next() * JOB_LORE[A.job].length) | 0; if (!mB.kk.includes('lr:' + hashStr(JOB_LORE[A.job][i]))) add('lr:' + A.job + i, 0.7 + (A.skill?.[A.job] ?? 0.3), (v) => topicLore(api, A, B, v, JOB_LORE[A.job][i])); }
    if (FIGHTERS.has(A.job)) {
      let sp = null;
      for (let i = A.memories.length - 1; i >= 0 && !sp; i--) { const m = A.memories[i]; if (['hunt', 'fight', 'quest', 'sight'].includes(m.k) && today - m.t < 20) sp = speciesIn(m.txt); }
      if (!sp) { const ks = Object.keys(MONSTER_LORE).filter((k) => SPECIES[k]?.kind === 'hostile' || SPECIES[k]?.kind === 'wild'); sp = ks[(R.next() * ks.length) | 0]; }
      if (sp && !mB.kk.includes('ml:' + sp)) add('ml:' + sp, 1.0, (v) => topicMonster(api, A, B, v, sp));
    }
  }
  // (5) 値段の移り変わり（覚えている値段と比べる）
  if (age >= 14) {
    for (const g of ['bread', 'wheat', 'meat', 'ale', 'fish']) {
      const old = mA.px[g];
      const now = api.price(g, A.s);
      if (old && old[0] !== now && today - old[1] >= 1 && Math.abs(now - old[0]) / old[0] >= 0.2) { add('pc:' + g + ':' + now, 1.2, (v) => topicPriceChange(api, A, B, v, g, old, now)); break; }
    }
  }
  // (6) 天気（続き具合・暑さ寒さ・仕事とのかかわり）
  add('wx:' + today + ':' + (api.hour() < 12 ? 0 : 1), 0.45, (v) => topicWx(api, A, B, v));
  // (7) 人から聞いた知識を広める
  for (const k of mA.kn) {
    if (k.from === B.id || today - k.d > 6) continue;
    if (mB.kk.includes(k.key)) continue;
    add('kn:' + k.key, (k.k === 'nw' ? 0.4 : 0.8) + E * 0.5, (v) => topicKnow(api, A, B, v, k));
    break;
  }
  // (8) 最近の大きな出来事（速報）
  const news = api.S.news;
  for (let i = news.length - 1, c = 0; i >= 0 && c < 6; i--, c++) {
    const n = news[i];
    if (api.S.t - n.t > 2880) break;
    if (/建国記念日|誕生日/.test(n.text)) continue;
    if (mB.kk.includes('nw' + n.t)) continue;
    if (R.next() < 0.3) { add('nw' + n.t, 0.35 + (n.imp || 1) * 0.15, (v) => topicNews(api, A, B, v, n)); break; }
  }
  // (9) 目的・悩み・夢
  if (A.plan && (A.plan.stage === 'saving' || A.plan.stage === 'waiting') && age >= 16) add('pl' + Math.floor(A.plan.saved / 10), 0.7, (v) => topicPlan(api, A, B, v));
  if (A.pur && LIFE[A.pur.life] && age >= 14) add('lf:' + A.pur.life, 0.4, (v) => topicLife(api, A, B, v));
  const money = api.householdMoney(A);
  if (money < 30 && age >= 16) add('mw' + Math.round(money / 5), 0.8, (v) => topicMoneyWorry(api, A, B, v, money));
  // 恋心（speech.js と同じ重み。結婚の数を変えないため）
  const rel = api.rel(A, B), n = A.needs;
  const canRomance = age >= 17 && bAge >= 17 && A.spouseId == null && B.spouseId == null && A.sex !== B.sex && rel.a > 45 && !api.isKin(A, B) && Math.abs(age - bAge) < 14;
  if (canRomance) out.push({ key: 'rm' + today + ':' + R.int(0, 9), w: 1.2 + rel.a / 50 + (100 - n.lust) / 50, make: (v) => topicRomance(api, A, B, v) });
  return out;
}

// 共通の知り合い（自分と相手の両方が知っている人）
function commonAcq(api, A, B) {
  const R = api.rng;
  const ids = Object.keys(A.rel || {});
  let best = null, bs = 0;
  for (let i = 0; i < 8 && ids.length; i++) {
    const id = ids[(R.next() * ids.length) | 0];
    if (+id === B.id || +id === A.id) continue;
    const q = alive(api, +id);
    if (!q) continue;
    const ra = A.rel[id], rb = B.rel?.[id];
    if (!rb && q.hh !== B.hh) continue;
    const sc = Math.abs(ra.a) + (ra.f || 0) * 0.3;
    if (sc > bs) { bs = sc; best = q; }
  }
  if (!best) return null;
  let m = null;
  for (let i = A.memories.length - 1; i >= 0; i--) { const x = A.memories[i]; if (x.about && x.about.includes(best.id) && !x.g && x.t >= api.today - 30 && x.k !== 'news' && isPast(x.txt)) { m = x; break; } }
  if (!m && !best.ail && best.jail == null) return null;
  return { q: best, m };
}

function bestSpread(api, A) {
  const towns = api.S.world.settlements, here = api.S.towns[A.s];
  if (!here) return null;
  let best = null;
  for (const g of Object.keys(GOODS)) {
    for (const s of towns) {
      if (s.id === A.s) continue;
      const t = api.S.towns[s.id];
      if (!t || t.occupied) continue;
      const d = t.price[g] - here.price[g];
      if (Math.abs(d) >= Math.max(2, GOODS[g].base * 0.3) && (!best || Math.abs(d) > Math.abs(best.d))) best = { g, sid: s.id, d };
    }
  }
  return best;
}

// ---------- 各話題（文の組み立て） ----------
function topicMem(api, A, B, v, m) {
  const R = api.rng;
  const q = m.about && m.about.length ? alive(api, m.about[0]) : null;
  const when = whenOf(api, m);
  const aboutYou = m.txt.includes(B.given);
  const txt = ownTxt(v, aboutYou ? m.txt.split(B.given).join(v.fill('{you}')) : m.txt);
  if (aboutYou && m.emo > 0.2) {
    const got = /(もらった|くれた|贈られた|ごちそうになった|助けられた|紹介された|誘われ)/.test(m.txt);
    const text = say1(v, `${when}、${txt}`) + say1(v, got ? R.pick(['本当にありがとう', 'あれはうれしかった', 'ちゃんとお礼を言いたかった']) : R.pick(['喜んでもらえてよかった', 'また一緒に過ごしたい', 'あれは楽しかった']));
    return { kind: 'memory', text, sentiment: 0.6, about: [B.id], lead: false, mind: { t: 'shared', m }, src: `相手とのことの記憶「${m.txt}」` };
  }
  let first;
  let st = R.int(0, 3);
  // 「〜のが昨日のこと」は、ひとつの文で「〜た」と終わる記憶だけ（「楽しみだのが」「らしいのが」にならないように）
  if (st === 2 && (/[。！？]/.test(stripEnd(txt)) || !/(た|んだ)$/.test(stripEnd(txt)))) st = 0;
  if (st === 0) first = say1(v, `${when}、${txt}`);
  else if (st === 1) first = v.r({ polite: '聞いてください。', elder: 'まあ聞いておくれ。', child: 'あのね、', rough: '聞いてくれよ。', royal: '聞け。', knight: 'ご報告します。', default: ['聞いてよ。', 'ちょっと聞いて。'] }) + say1(v, `${when}、${txt}`);
  else if (st === 2) first = say1(v, `${txt}のが${when === '今日' || when === 'さっき' || when === '今朝' ? when : when + 'のこと'}`);
  else first = say1(v, `${when}のことなんだけど、${txt}`);
  let text = first;
  if (R.next() < 0.75) text += say1(v, commentFor(api, m, q && q.id !== B.id ? q.given : q ? v.fill('{you}') : null, api.ageOf(A)));
  const topic = { kind: m.emo < -0.25 ? 'complain' : m.emo > 0.3 ? 'boast' : 'neutral', text, sentiment: m.emo, about: q ? [q.id] : undefined, mind: { t: 'mem', m }, src: `自分の記憶「${m.txt}」` };
  if (m.k === 'sight' && m.where) { topic.kind = 'warning'; topic.warning = { x: m.where.x, z: m.where.z, v: 2 }; }
  if (m.k === 'boast' || ['hunt', 'quest', 'discovery', 'hero', 'justice', 'trade'].includes(m.k) && m.emo > 0) topic.kind = 'boast';
  if (m.k === 'death' && m.src === 'self') topic.kind = 'grief';
  return topic;
}

function topicDangerPlace(api, A, B, v, key, val) {
  const R = api.rng;
  const x = Math.floor(+key / 100) * 8 + 4, z = (+key % 100) * 8 + 4;
  const place = api.placeName(x, z);
  let why = null;
  for (let i = A.memories.length - 1; i >= 0; i--) { const m = A.memories[i]; if (m.where && Math.abs(m.where.x - x) <= 8 && Math.abs(m.where.z - z) <= 8) { why = m; break; } }
  if (!why) for (let i = A.memories.length - 1; i >= 0; i--) { const m = A.memories[i]; if (['sight', 'fight', 'quest'].includes(m.k) && m.emo < 0 && api.today - m.t < 20) { why = m; break; } }
  const text = say1(v, R.pick([`${place}には気をつけて`, `${place}には近づかないほうがいい`, `${place}は危ない`])) + (why ? say1(v, `${whenOf(api, why)}、${ownTxt(v, why.txt).split('。')[0]}`) : say1(v, R.pick(['{me}はあそこで痛い目にあった', 'あそこは魔物の気配がする'])));
  return { kind: 'warning', text, sentiment: -0.4, warning: { x, z, v: val }, mind: { t: 'danger' }, teach: { key: 'dg:' + key, k: 'danger', x, z, place }, src: why ? `危険の記憶（${place}）「${why.txt}」` : `危険の記憶（${place}・${val.toFixed(1)}）` };
}

function topicOld(api, A, B, v, m) {
  const R = api.rng;
  const when = whenOf(api, m);
  const txt = ownTxt(v, m.txt).split('。')[0];
  const lead = R.pick(['ふと思い出したんだけど、', 'なぜか急に思い出した。', '']);
  const text = (lead ? v.fill(lead) : '') + say1(v, `${when}、${txt}`) + say1(v, R.pick(m.emo >= 0 ? ['あのころはよかった', 'なつかしい', '今でもはっきり覚えてる'] : ['今思い出しても胸が痛む', 'あれは忘れられない', '子どもながらに怖かった']));
  return { kind: 'memory', text, sentiment: m.emo * 0.6, mind: { t: 'old', m }, src: `昔の記憶（${m.ageAt}歳）「${m.txt}」` };
}

function topicTale(api, A, B, v, m) {
  const mm = m.txt.match(/^(.+?)から「(.+)」という昔話を聞いた/);
  if (!mm) return topicOld(api, A, B, v, m);
  const text = v.fill(`${mm[1]}から聞いた昔話なんだけど、『${mm[2]}』って。`) + (api.rng.next() < 0.6 ? say1(v, api.rng.pick(['昔の人はたくましい', '本当の話かな', '今とはずいぶん違う'])) : '');
  return { kind: 'story', text, sentiment: 0.2, mind: { t: 'tale' }, src: `聞いた昔話「${m.txt}」` };
}

function topicRumor(api, A, B, v, m) {
  const R = api.rng;
  const subj = alive(api, m.g.subj);
  const kin = api.kinTerm(A, subj);
  const who = kin ? `うちの${kin}の${subj.given}` : subj.given;
  const from = m.src === 'heard' && m.about && m.about[1] != null ? api.person(m.about[1]) : null;
  const d = api.today - m.t;
  const pred = m.g.pred.replace(/らしい$/, '');
  let lead;
  if (from && from.id !== B.id) lead = R.pick([`${from.given}から聞いたんだけど、`, `${from.given}が言ってたんだけど、`, `${daysAgoTxt(d)}${from.given}に聞いた話だと、`]);
  else if (m.src === 'self') lead = R.pick(['この目で見たんだけど、', '知ってた？ ', 'ここだけの話、']);
  else lead = R.pick(['噂なんだけど、', '聞いた？ ', 'そういえば、']);
  if (v.style === 'polite' || v.style === 'noble' || v.style === 'knight') lead = lead.replace('聞いたんだけど', '伺ったのですが').replace('言ってたんだけど', 'おっしゃっていたのですが').replace('知ってた？', 'ご存じでした？').replace('聞いた？', 'お聞きになりました？').replace('見たんだけど', '見たのですが');
  const hearsay = { polite: 'そうですよ', elder: 'そうじゃ', rough: 'ってよ', royal: 'そうじゃ', noble: A.sex === 'f' ? 'そうですわ' : 'そうだ', knight: 'とのことであります', sage: 'そうだ', child: 'んだって' }[v.style] || R.pick(['んだって', 'らしいよ', 'って']);
  let text = v.fill(lead) + `${who}が${pred}${hearsay}。`;
  const ra = api.rel(A, subj).a;
  if (R.next() < 0.6) text += say1(v, m.g.emo > 0.3 ? (ra > 20 ? R.pick(['よかった', '自分のことみたいにうれしい', 'あの人ならやると思ってた']) : R.pick(['運のいいこと', 'うまくやったもの'])) : m.g.emo < -0.3 ? (ra > 10 ? R.pick(['気の毒に', '心配', '力になれるといいけど']) : R.pick(['まあ、やりかねない', '驚きはしない'])) : R.pick(['世の中いろいろ', '人は見かけによらない']));
  return { kind: 'gossip', text, sentiment: m.g.emo, gossip: m, about: [subj.id], mind: { t: 'gossip', m }, src: `噂の記憶「${m.txt}」` };
}

function topicCongrat(api, A, B, v, m) {
  const R = api.rng;
  const c = m.g.congrat;
  const text = m.g.emo >= 0
    ? v.r({ polite: [`${c}、おめでとうございます。`, `${c}。本当によかったですね。`], elder: [`${c}、めでたいのう。`, `${c}。わしもうれしいよ。`], rough: [`${c}、めでてえな！`, `${c}。やったじゃねえか。`], child: `${c}、おめでとう！`, plain: [`${c}、おめでとう。`, `${c}。よかったね！`, `${c}。話を聞いてうれしくなった。`], royal: 'めでたいことじゃ。祝いを取らせよう。', noble_f: `${c}、おめでとうございますわ。` })
    : v.r({ polite: `${c}……お力落としのないように。`, elder: `${c}……つらいのう。`, rough: `${c}……元気出せよ。`, child: `${c}……だいじょうぶ？`, plain: [`${c}……大丈夫？`, `${c}……何かできることがあったら言って。`] });
  const from = m.src === 'heard' && m.about?.[1] != null ? api.person(m.about[1]) : null;
  const add = from && from.id !== B.id && R.next() < 0.5 ? v.fill(`${from.given}から聞いたよ。`) : '';
  return { kind: 'aboutyou', text: add + text, sentiment: m.g.emo, about: [B.id], mind: { t: 'congrat', m }, src: `噂の記憶「${m.txt}」` };
}

function topicShared(api, A, B, v, m) {
  const R = api.rng;
  const when = whenOf(api, m);
  const you = v.fill('{you}');
  let txt = m.txt.split(B.given).join(you);
  txt = ownTxt(v, txt).split('。')[0];
  let text;
  if (m.k === 'quarrel') text = say1(v, `${when}は言いすぎた。${you}と口論になったこと、ずっと気になってた`);
  else if (m.k === 'friend' || m.ageAt != null && m.ageAt < 16 && m.t < 0) text = v.fill(`覚えてる？ ${when}、${txt}こと。`) + say1(v, R.pick(['あのころは怖いもの知らずだった', '今思い出しても笑える', 'なつかしい']));
  else text = say1(v, `${when}、${txt}。${R.pick(['あのときはありがとう', 'あれはうれしかった', '今でも覚えてる'])}`);
  return { kind: 'memory', text, sentiment: m.k === 'quarrel' ? 0.2 : 0.5, about: [B.id], shared: true, mind: { t: 'shared', m }, src: `相手との思い出「${m.txt}」` };
}

function topicAcq(api, A, B, v, acq) {
  const R = api.rng, q = acq.q;
  const r = api.rel(A, q).a;
  const kin = api.kinTerm(A, q);
  const who = kin ? `うちの${casualKin(kin, v.style === 'child')}の${q.given}` : q.given;
  let text;
  if (acq.m) {
    const when = whenOf(api, acq.m);
    text = say1(v, `${who}といえば、${when}、${ownTxt(v, acq.m.txt).split('。')[0]}`) + say1(v, r > 20 ? R.pick(['あの人には世話になりっぱなし', 'ほんとにいい人']) : r < -20 ? R.pick(['あの人とはどうも合わない', '正直、苦手']) : R.pick(['元気にしてるかな', '最近どうしてるんだろう']));
  } else {
    const st = q.ail ? `${ailName(q)}で寝込んでるらしい` : `牢に入ってるらしい`;
    text = say1(v, `${who}、${st}`) + (r > 20 ? say1(v, R.pick(['心配でならない', '早く元気になってほしい'])) : '');
  }
  return { kind: 'opinion', text, sentiment: r > 0 ? 0.3 : -0.3, about: [q.id], mind: { t: 'acq', q, m: acq.m }, src: acq.m ? `知り合い${q.given}の記憶「${acq.m.txt}」` : `知り合い${q.given}の様子` };
}

function topicFollow(api, A, B, v, met) {
  const d = api.today - met.sd;
  const text = v.fill(`${daysAgoTxt(d)}{you}が話してた、${met.s}。`) + v.r({ polite: 'あれから、いかがですか？', elder: 'あれからどうなったかね？', rough: 'あれからどうなった？', child: 'あのあと、どうなったの？', plain: ['あれから、どうなった？', 'その後どう？'], royal: 'その後はどうじゃ。', noble_f: 'その後はいかが？', knight: 'その後はいかがでありますか？', sage: 'その後はどうかね？' });
  return { kind: 'ask', text, sentiment: 0.2, about: [B.id], mind: { t: 'follow', met }, src: `前の会話で聞いたこと「${met.s}」` };
}

function topicAskHurt(api, A, B, v) {
  const text = v.r({ polite: '{you}、そのおけが、どうなさったんですか？', elder: '{you}、その傷はどうしたんじゃ。', rough: 'おい{you}、その傷どうした？', child: '{you}、けがしてるの？ いたくない？', plain: ['{you}、その傷どうしたの？', 'けがしてるじゃない。大丈夫？'], royal: 'その傷はいかがした。', knight: 'その傷、いかがなさいました？', sage: 'その傷は、どうしたのかね？' });
  return { kind: 'ask', text, sentiment: -0.1, about: [B.id], mind: { t: 'hurt' }, src: `相手の傷（体力${Math.round(B.hp)}／${Math.round(B.maxhp)}）` };
}
function topicAskAil(api, A, B, v) {
  const text = v.r({ polite: '顔色がお悪いようですけど、大丈夫ですか？', elder: '顔色が悪いのう。ちゃんと寝ておるか？', rough: '顔色悪いぞ。無理すんな。', child: 'だいじょうぶ？ おかお、まっしろだよ。', plain: ['顔色が悪いね。具合でも悪いの？', '{you}、風邪でもひいた？'], royal: '顔色がすぐれぬな。', knight: 'お加減がすぐれないのでは？' });
  return { kind: 'ask', text, sentiment: -0.1, about: [B.id], mind: { t: 'ail' }, src: `相手の病（${ailName(B)}）` };
}
function topicAskAppr(api, A, B, v) {
  const text = v.r({ polite: '修業のほうは、いかがですか？', elder: '修業はどうじゃ。つらくはないか？', rough: '修業はどうだ？ しごかれてるか？', plain: ['修業はどう？ 慣れた？', '見習い、大変じゃない？'], child: '修業って、たのしい？' });
  return { kind: 'ask', text, sentiment: 0.2, about: [B.id], mind: { t: 'appr' }, src: '相手の修業' };
}

function topicPrice(api, A, B, v, g) {
  const R = api.rng, mA = mindOf(api, A);
  const now = api.price(g, A.s), r = api.priceRatio(g, A.s), nm = GOODS[g].name;
  const produce = JOBS[A.job]?.goods === g || (JOB_GOODS[A.job] || [])[0] === g;
  const old = mA.px[g];
  let body;
  if (old && old[0] !== now && api.today - old[1] >= 1) body = `${nm}が${daysAgoTxt(api.today - old[1])}は${old[0]}銅貨だったのに、今は${now}銅貨`;
  else body = R.pick([`${nm}の値が今、${now}銅貨`, `いま市場で${nm}は${now}銅貨`, `${nm}の相場は${now}銅貨くらい`]);
  let c;
  if (r > 1.3) c = produce ? R.pick(['品薄で、作っても作っても追いつかない', '今が売りどき', 'しばらくは強気でいける']) : R.pick(['高すぎて手が出ない', '品薄なんだろう', 'この調子だと、まだ上がる']);
  else if (r < 0.8) c = produce ? R.pick(['安すぎて商売にならない', '作りすぎたかな', 'しばらく売り控えたほうがいい']) : R.pick(['今のうちに買っておくといい', '安くて助かる']);
  else c = R.pick(['まあ、落ち着いてる', 'いつもどおり', '悪くない値']);
  const cons = CONSUMER[A.job]?.includes(g) ? R.pick(['うちは仕入れる側だから、値が気になる', '仕入れ値しだいで、こっちの値も決まる']) : null;
  const text = say1(v, body) + say1(v, cons && R.next() < 0.5 ? cons : c);
  mA.px[g] = [now, api.today];
  return { kind: 'work', text, sentiment: r > 1.3 && !produce ? -0.3 : 0.1, mind: { t: 'price', g, v: now, sid: A.s }, teach: { key: `px:${g}:${A.s}`, k: 'px', g, v: now, sid: A.s }, src: `仕事の知識（${nm}の値段${now}銅貨・${daysAgoTxt(0)}の市場）` };
}

function topicSpread(api, A, B, v, sp) {
  const R = api.rng;
  const here = api.price(sp.g, A.s), there = api.price(sp.g, sp.sid), town = api.town(sp.sid).name, nm = GOODS[sp.g].name;
  const text = say1(v, `${town}じゃ${nm}が${there}銅貨、ここでは${here}銅貨`) + say1(v, there > here ? R.pick(['運べばもうかる', '荷車があれば、ひと稼ぎできる']) : R.pick(['向こうで買ってくれば安くつく', '向こうは品があふれてるらしい']));
  return { kind: 'work', text, sentiment: 0.2, mind: { t: 'spread', ...sp }, teach: { key: `px:${sp.g}:${sp.sid}`, k: 'px', g: sp.g, v: there, sid: sp.sid }, src: `商いの知識（${town}の${nm}${there}銅貨／地元${here}銅貨）` };
}

function topicLore(api, A, B, v, lore) {
  const R = api.rng;
  const age = api.ageOf(A);
  const years = Math.max(1, Math.min(age - 14, Math.round((A.skill?.[A.job] ?? 0.3) * 40)));
  const master = A.master != null ? api.person(A.master) : null;
  const lead = master && R.next() < 0.5 ? `師匠の${master.given}に教わったんだけど、` : years >= 3 && R.next() < 0.6 ? `${jobName(A.job)}を${years}年やってわかったことだけど、` : R.pick(['これは意外と知られてないんだけど、', '仕事で覚えたことなんだけど、', '']);
  const text = v.fill(lead) + say1(v, lore);
  return { kind: 'work', text, sentiment: 0.2, mind: { t: 'lore', lore, job: A.job }, teach: { key: 'lr:' + hashStr(lore), k: 'lore', txt: lore, job: A.job }, src: `仕事の知識（${jobName(A.job)}${years}年・${lore}）` };
}

function topicMonster(api, A, B, v, sp) {
  const R = api.rng, nm = SPECIES[sp].name, weak = MONSTER_LORE[sp];
  let exp = null;
  for (let i = A.memories.length - 1; i >= 0; i--) { const m = A.memories[i]; if (m.txt.includes(nm) && ['hunt', 'fight', 'quest', 'sight'].includes(m.k)) { exp = m; break; } }
  const lead = exp ? `${whenOf(api, exp)}${nm}とやり合ってわかったんだけど、` : R.pick([`ギルドの古株から聞いたんだけど、`, `${nm}の話をしようか。`, '覚えておくといい。']);
  const text = v.fill(lead) + say1(v, `${nm}は${weak}`);
  return { kind: 'work', text, sentiment: 0.1, mind: { t: 'monster', sp }, teach: { key: 'ml:' + sp, k: 'lore', txt: `${nm}は${weak}`, sp }, src: exp ? `戦いの記憶「${exp.txt}」` : `魔物の知識（${nm}）` };
}

function topicPriceChange(api, A, B, v, g, old, now) {
  const R = api.rng, nm = GOODS[g].name, d = api.today - old[1];
  const up = now > old[0];
  const money = api.householdMoney(A);
  const text = say1(v, `${nm}が${daysAgoTxt(d)}は${old[0]}銅貨だったのに、今日は${now}銅貨`) + say1(v, up ? (money < 60 ? R.pick(['うちの蓄えじゃ、これ以上はきつい', '財布とにらめっこの毎日']) : R.pick(['どうなってるんだか', 'また上がるのかな'])) : R.pick(['少し助かる', 'この値が続けばいいけど']));
  mindOf(api, A).px[g] = [now, api.today];
  return { kind: up ? 'complain' : 'good', text, sentiment: up ? -0.4 : 0.3, mind: { t: 'price', g, v: now, sid: A.s }, teach: { key: `px:${g}:${A.s}`, k: 'px', g, v: now, sid: A.s }, src: `覚えていた値段（${nm}${old[0]}→${now}銅貨）` };
}

function topicWx(api, A, B, v) {
  const R = api.rng;
  const pos = A.pos || api.townOf(A);
  const wx = ensureWx(api).r[regionIndex(pos.x, pos.z)];
  const w = wx.w, nm = WX_NAME[w] || '晴れ', temp = Math.round(wx.temp), streak = wx.streak || 1;
  const parts = [];
  if (streak >= 3) parts.push(`${kn(Math.min(streak, 10))}日も${nm}が続いてる`);
  else if (streak === 1 && R.next() < 0.5) parts.push(`今日は${nm}`);
  if (temp >= 30) parts.push(R.pick([`${temp}度もある。暑くてたまらない`, '日差しが肌に刺さる']));
  else if (temp <= 2) parts.push(R.pick([`${temp <= 0 ? '水たまりが凍ってた' : '指先がかじかむ'}`, '息が真っ白']));
  const job = A.job;
  const rainy = ['rain', 'storm', 'squall'].includes(w), snowy = ['snow', 'blizzard'].includes(w), dry = ['sunny', 'hot'].includes(w);
  if (job === 'farmer' || job === 'gardener') parts.push(rainy ? R.pick(['麦にはありがたい雨', '畑がぬかるんで仕事にならない']) : dry && streak >= 3 ? R.pick(['畑が乾いてひびが入ってきた', 'そろそろ雨がほしい']) : snowy ? '麦が雪の下で眠ってる' : `${api.season()}の畑は手がかかる`);
  else if (['fisher', 'sailor', 'captain', 'diver'].includes(job)) parts.push(rainy || w === 'storm' ? R.pick(['これじゃ船が出せない', '海が荒れてる']) : R.pick(['海はおだやか', '風がちょうどいい']));
  else if (job === 'laundress') parts.push(rainy ? '洗濯物が乾かない' : dry ? '洗濯日和' : '洗濯物の乾きが悪い');
  else if (['guard', 'watchman', 'soldier'].includes(job)) parts.push(rainy || snowy ? '見張りにはつらい天気' : '見張りがはかどる');
  else if (job === 'miller') parts.push(w === 'storm' ? '風が強すぎて風車を止めた' : '今日の風なら粉ひきがはかどる');
  else if (api.ageOf(A) < 13) parts.push(snowy ? '雪だるま作ろう' : rainy ? '外で遊べない' : '外で遊びたい');
  if (!parts.length) parts.push(dry ? R.pick([`${api.season()}らしい、いい天気`, 'こんな日は外で昼寝したい']) : rainy ? R.pick(['よく降る', '雨で道がぬかるんで歩きにくい']) : R.pick(['空がどんよりしてる', 'はっきりしない天気']));
  const mA = mindOf(api, A);
  mA.wx = { w, d: api.today };
  const text = parts.slice(0, 2).map((p) => say1(v, p)).join('');
  return { kind: 'weather', text, sentiment: dry && temp < 30 ? 0.3 : -0.1, mind: { t: 'wx', w, temp, streak }, src: `天気（${nm}${temp}度・${streak}日目）` };
}

function topicKnow(api, A, B, v, k) {
  const R = api.rng;
  const from = api.person(k.from);
  const fn = from ? from.given : '人';
  let text, extra = {};
  if (k.k === 'px') {
    const town = api.town(k.sid)?.name || 'よそ';
    const here = api.price(k.g, A.s);
    text = v.fill(`${fn}から聞いたんだけど、`) + say1(v, `${k.sid === A.s ? '市場' : town}では${GOODS[k.g].name}が${k.v}銅貨らしい`) + (k.sid !== A.s ? say1(v, k.v > here ? `ここより${k.v - here}銅貨も高い` : k.v < here ? `ここより${here - k.v}銅貨も安い` : 'ここと同じ') : '');
  } else if (k.k === 'nw') text = v.fill(`${fn}に聞いたんだけど、`) + `${stripEnd(k.txt)}${R.pick(['って。', 'らしい。'])}`;
  else if (k.k === 'danger') { text = v.fill(`${fn}が言うには、`) + say1(v, `${k.place}は危ないらしい`); extra.warning = { x: k.x, z: k.z, v: 1.5 }; }
  else text = v.fill(`${fn}が言ってたんだけど、`) + say1(v, k.txt);
  return { kind: extra.warning ? 'warning' : 'neutral', text, sentiment: 0, ...extra, mind: { t: 'know', k }, teach: { ...k, from: undefined }, src: `${fn}から聞いた知識（${k.key}）` };
}

function topicNews(api, A, B, v, n) {
  const R = api.rng;
  // 速報の見出しを話し言葉に：「国名：〜」は「国名の〜」に。「群れは3体に」のように途中で切れた文は「なった」で結ぶ
  const t = stripEnd(n.text).replace(/（.*?）/g, '').replace(/らしい$/, '').replace(/：/g, 'の').replace(/(\d+(?:体|人|頭|匹)?に)$/, '$1なった');
  const opener = v.r({ polite: 'お聞きになりました？ ', elder: '聞いたかね。', rough: 'おい、聞いたか。', child: 'ねえねえ、', plain: ['聞いた？ ', 'ねえ、知ってる？ '], royal: '耳にしたか。', noble_f: 'お聞きになって？ ', knight: 'ご存じでありますか。', sage: '聞いたかね。' });
  let c;
  if (/亡くなった|倒れ|命を落と/.test(t)) c = R.pick(['気の毒に', '明日は我が身', '祈るしかない']);
  else if (/捕らえ|牢/.test(t)) c = R.pick(['当然の報い', 'これで少しは町も静かになる']);
  else if (/討ち取|倒した|退治/.test(t)) c = A.values?.courage > 0.6 ? R.pick(['{me}もいつか', 'たいしたもの']) : R.pick(['たいしたもの', '頼もしい']);
  else if (/戦|攻め/.test(t)) c = R.pick(['戦はいやだ', '若い者が取られなければいいけど']);
  else c = R.pick(['世の中いろいろある', 'この先が気になる']);
  const text = v.fill(opener) + `${t}って。` + say1(v, c);
  return { kind: 'neutral', text, sentiment: /亡く|戦|倒れ/.test(t) ? -0.4 : 0.1, mind: { t: 'news', n }, teach: { key: 'nw' + n.t, k: 'nw', txt: t }, src: `速報「${n.text}」` };
}

function topicPlan(api, A, B, v) {
  const R = api.rng, pl = A.plan;
  const saved = Math.round(pl.saved), need = pl.need;
  const text = saved >= need * 0.8 ? say1(v, `${pl.txt}ための銅貨が、もう${saved}枚。あと少し`) : say1(v, R.pick([`${pl.txt}のが目標。いま${saved}銅貨、目当ては${need}銅貨`, `${pl.txt}つもりで貯めてる。まだ${need - saved}銅貨足りない`]));
  return { kind: 'dream', text, sentiment: 0.4, mind: { t: 'plan' }, src: `人生の計画「${pl.txt}」（${saved}／${need}銅貨）` };
}
function topicLife(api, A, B, v) {
  const L = LIFE[A.pur.life];
  const why = A.pur.lifeWhy ? `${stripEnd(A.pur.lifeWhy)}。` : '';
  const text = v.fill(why) + say1(v, `今は${L.name}ことが、{me}の一番の願い`);
  return { kind: 'dream', text, sentiment: 0.3, mind: { t: 'life' }, src: `生きる目的「${L.name}」` };
}
function topicMoneyWorry(api, A, B, v, money) {
  const R = api.rng;
  const m = A.memories.slice().reverse().find((x) => ['tax', 'debt', 'relief', 'spend', 'rent'].includes(x.k) && api.today - x.t < 10);
  const text = say1(v, `うちの蓄え、あと${Math.round(money)}銅貨しかない`) + (m ? say1(v, `${whenOf(api, m)}、${ownTxt(v, m.txt).split('。')[0]}のが響いてる`) : say1(v, R.pick(['どうやって食べていこう', '冬が越せるか心配'])));
  return { kind: 'complain', text, sentiment: -0.6, mind: { t: 'money' }, src: `家計（${Math.round(money)}銅貨）${m ? `・記憶「${m.txt}」` : ''}` };
}
function topicRomance(api, A, B, v) {
  const R = api.rng;
  const m = A.memories.slice().reverse().find((x) => x.about && x.about.includes(B.id) && x.emo > 0.3 && !x.g);
  const text = m && R.next() < 0.6
    ? say1(v, `${whenOf(api, m)}、${ownTxt(v, m.txt.split(B.given).join(v.fill('{you}'))).split('。')[0]}こと、ずっと覚えてる`) + say1(v, R.pick(['{you}といると、時間を忘れる', '{you}のことばかり考えてしまう']))
    : R.next() < 0.3 ? v.s(`今度の${R.pick(['祭り', '市', '休みの日'])}、一緒に${R.pick(['踊って', '歩いて', '出かけて'])}くれる`, 'qn') : say1(v, R.pick(['{you}と話してると、時間を忘れる', '{you}の笑った顔、好き', '{you}のことを考えると、夜も眠れない']));
  return { kind: 'romance', text, sentiment: 0.8, mind: { t: 'romance' }, src: m ? `相手との思い出「${m.txt}」` : '恋心' };
}

// ---------- 返事（相手の記憶と知識から） ----------
function similarMem(api, B, m) {
  if (!m || ['life', 'story', 'news'].includes(m.k)) return null;
  let best = null, bs = 0;
  for (const x of B.memories) {
    if (x.g || x.k !== m.k || x === m || !isPast(x.txt)) continue;
    const recent = x.t >= 0 && api.today - x.t <= 12;
    const sc = (recent ? 2 : 1) + (x.imp ?? 0.3) + (x.txt === m.txt ? 3 : 0);
    if (sc > bs) { bs = sc; best = x; }
  }
  return best;
}

function mindReact(api, B, A, topic, v) {
  const R = api.rng, mt = topic.mind;
  if (!mt) return null;
  const mB = mindOf(api, B);
  // 知識が相手に伝わる（話した本人も「知っていること」として覚える）
  if (topic.teach && topic.teach.key) { knowKey(mindOf(api, A), topic.teach.key); learn(api, B, { ...topic.teach, from: A.id }); }
  if (mt.t === 'mem' || mt.t === 'old') {
    const x = similarMem(api, B, mt.m);
    if (x) {
      const w = whenOf(api, x);
      const txt = ownTxt(v, x.txt).split('。')[0];
      const same = x.txt === mt.m.txt;
      const isOld = x.t < 0 || api.today - x.t > 40;
      const lead = same ? R.pick(['{me}もなんだ。', 'え、{me}も同じ。']) : R.pick(['わかる。', 'それなら、', 'あ、', '']);
      const body = isOld ? `{me}も昔、${w}に${txt}ことがあって` : `{me}も${w}、${txt}`;
      const link = sgn(x.emo) === sgn(mt.m.emo) ? (x.emo < 0 ? R.pick(['お互い大変', '人ごとじゃない', 'だから気持ちはわかる']) : R.pick(['気が合う', 'お互い運がいい', 'なんだかうれしい'])) : R.pick(['いろいろある', '人それぞれ']);
      const text = v.fill(lead) + (isOld ? v.fill(body) + '……' : say1(v, body)) + say1(v, link);
      return { text, da: 3, src: `返事の元：自分の記憶「${x.txt}」` };
    }
    // 自分の仕事の知恵で返す
    const k = mt.m.k;
    const jobAdv = {
      ill: { doctor: 'よく眠って、温かいものを飲むこと。明日診てあげる', herbalist: '薬草を煎じて持っていこうか', priest: '今夜、快復を祈っておく', default: null },
      theft: { guard: '見回りを増やしてみる', watchman: '夜の見回りで目を光らせておく', knight: '衛兵に伝えておくであります' },
      gear: { smith: 'その武器、手入れならうちで見る', warrior: '刃の手入れは毎晩やるといい' },
      death: { priest: '祈りを捧げよう', gravedigger: '墓はいい場所に作っておいた', nun: '祈りを捧げましょう' },
      sight: { hunter: 'その辺りは{me}も気をつけてる', guard: '詰所に知らせておく', adventurer: 'ギルドに討伐依頼が出るかもしれない' },
      trade: { merchant: 'どの町で売ったの？ 次は{me}も一緒に行こうか', changer: '稼いだ銅貨は両替商に預けるといい' },
      fight: { doctor: '傷を見せて。膿むといけない', cleric: '傷を癒やしましょう' },
    }[k];
    const adv = jobAdv && (jobAdv[B.job] || null);
    if (adv) return { text: say1(v, adv), da: 3, src: `返事の元：自分の仕事（${jobName(B.job)}）` };
    // 話し手へのひとこと（数字や人に触れる）
    const n = firstNum(mt.m.txt);
    if (n != null && R.next() < 0.6) return { text: v.fill(mt.m.emo >= 0 ? R.pick([`${n}銅貨も？ `, `${n}銅貨か。`]) : `${n}銅貨……`) + say1(v, mt.m.emo >= 0 ? R.pick(['やるじゃない', 'たいしたもの', 'うらやましい']) : R.pick(['それは痛い', '高くついた'])), da: 2, src: `返事の元：話の中の数字（${n}銅貨）` };
    return null;
  }
  if (mt.t === 'gossip') {
    const key = mt.m.g.key;
    const bm = B.memories.find((x) => x.g && x.g.key === key);
    const subj = api.person(mt.m.g.subj);
    if (bm || (B.gk && B.gk[key])) {
      if (!bm) return { text: say1(v, R.pick(['その話、もう町じゅうの噂', 'ああ、みんな言ってる'])), da: 0.5, src: '返事の元：町の噂として知っていた' };
      const from = bm.src === 'heard' && bm.about?.[1] != null ? api.person(bm.about[1]) : null;
      const pred = bm.g.pred.replace(/らしい$/, '');
      if (bm.g.pred !== mt.m.g.pred && subj) return { text: v.fill(from ? `{me}は${from.given}から、` : '{me}が聞いた話だと、') + say1(v, `${api.person(bm.g.subj)?.given || subj.given}が${pred}って聞いた`) + say1(v, R.pick(['話が少し違う', 'どっちが本当なんだろう'])), da: 1, src: `返事の元：自分の噂の記憶「${bm.txt}」（話が違う）` };
      if (from) return { text: say1(v, R.pick([`その話なら、${daysAgoTxt(api.today - bm.t)}${from.given}から聞いた`, `知ってる。${from.given}が話してた`])), da: 0.5, src: `返事の元：自分の噂の記憶「${bm.txt}」` };
      return { text: say1(v, R.pick(['知ってる。{me}もその場にいた', 'ああ、{me}も見てた'])), da: 0.8, src: `返事の元：自分が見た記憶「${bm.txt}」` };
    }
    if (!subj) return null;
    const sr = api.rel(B, subj).a;
    const own = B.memories.slice().reverse().find((x) => x.about && x.about.includes(subj.id) && !x.g);
    const surprise = v.r({ polite: ['まあ、初めて伺いました。', 'まあ、本当ですか？'], elder: ['ほう、初耳じゃ。', 'ほう、そうかね。'], rough: ['マジかよ。初耳だ。', 'へえ、知らなかった。'], child: ['えーっ、ほんと？', 'しらなかった！'], plain: ['えっ、初耳。', 'へえ、そうなんだ。', 'えっ、本当？'], royal: 'ほう。', noble_f: 'まあ！', knight: 'なんと。' });
    let tail;
    if (own && R.next() < 0.7) tail = say1(v, `${subj.given}といえば、${whenOf(api, own)}${ownTxt(v, own.txt).split('。')[0]}`) ;
    else if (topic.sentiment > 0.3) tail = sr > -10 ? say1(v, 'それはめでたい') : raw(v, 'ふうん、あいつがね');
    else if (topic.sentiment < -0.3) tail = sr > 10 ? raw(v, `${subj.given}、かわいそうに`, '……') : say1(v, 'まあ、自業自得');
    else tail = '';
    return { text: surprise + tail, da: 1.5, src: own ? `返事の元：${subj.given}についての記憶「${own.txt}」` : '返事の元：初耳' };
  }
  if (mt.t === 'congrat') {
    const own = B.memories.slice().reverse().find((x) => !x.g && api.today - x.t < 12 && Math.abs(x.emo) > 0.5 && x.imp >= 0.6);
    const thanks = topic.sentiment >= 0 ? v.r({ polite: 'ありがとうございます。', elder: 'ありがとうよ。', rough: 'へへ、ありがとな。', child: 'ありがとう！', plain: ['ありがとう。うれしい。', 'ありがとう！'], royal: 'うむ。' }) : v.r({ polite: 'お気遣い、ありがとうございます。', elder: '……ありがとうよ。', rough: '……ああ。ありがとな。', child: '……うん。', plain: '……ありがとう。' });
    const more = own ? say1(v, `${whenOf(api, own)}のことは、${own.emo > 0 ? R.pick(['まだ夢みたい', '一生忘れない']) : R.pick(['まだ受け止めきれない', '思い出すとつらい'])}`) : '';
    return { text: thanks + more, da: topic.sentiment >= 0 ? 4 : 5, praise: topic.sentiment >= 0 ? 10 : 0, src: own ? `返事の元：自分の記憶「${own.txt}」` : '返事の元：お礼' };
  }
  if (mt.t === 'shared') {
    const x = B.memories.find((y) => y.about && y.about.includes(A.id) && (y.k === mt.m.k || Math.abs((y.t ?? 0) - mt.m.t) <= 1) && !y.g);
    if (mt.m.k === 'quarrel') return { text: (x ? say1(v, R.pick(['{me}も悪かった', 'もう気にしてない'])) : say1(v, 'そんなこと、もう忘れてた')) + say1(v, 'これからもよろしく'), da: 6, src: x ? `返事の元：自分の記憶「${x.txt}」` : '返事の元：覚えていない' };
    if (x) return { text: say1(v, R.pick([`覚えてる。${ownTxt(v, x.txt).split(A.given).join(v.fill('{you}')).split('。')[0]}`, 'もちろん覚えてる。なつかしい'])), da: 4, src: `返事の元：自分の記憶「${x.txt}」` };
    return { text: say1(v, R.pick(['そんなこと、あったっけ', 'よく覚えてるね'])), da: 1.5, src: '返事の元：覚えていない' };
  }
  if (mt.t === 'acq') {
    const q = mt.q, sr = api.rel(B, q).a;
    const own = B.memories.slice().reverse().find((x) => x.about && x.about.includes(q.id) && !x.g);
    if (own) return { text: say1(v, `${q.given}なら、${whenOf(api, own)}、${ownTxt(v, own.txt).split('。')[0]}`), da: 2, src: `返事の元：${q.given}についての記憶「${own.txt}」` };
    return { text: say1(v, sr > 20 ? R.pick([`${q.given}はいい人`, `${q.given}には{me}も世話になってる`]) : sr < -20 ? R.pick([`${q.given}とは口をきいてない`, `${q.given}の話はやめよう`]) : R.pick([`${q.given}とは、しばらく会ってない`, `${q.given}のことは、よく知らない`])), da: 1, src: `返事の元：${q.given}への気持ち（${Math.round(sr)}）` };
  }
  if (mt.t === 'follow') {
    const met = mt.met;
    const x = B.memories.slice().reverse().find((y) => !y.g && y.t >= met.sd && y.k === met.k && y.t >= 0);
    const d = api.today - met.sd;
    if (x && x.txt && !met.s.startsWith(x.txt.split('。')[0])) return { text: say1(v, `あれから、${whenOf(api, x)}${ownTxt(v, x.txt).split('。')[0]}`), da: 3, src: `返事の元：その後の記憶「${x.txt}」` };
    const text = say1(v, R.pick([`覚えててくれたんだ。あれからもう${kn(d)}日`, `あれから${kn(d)}日たった`])) + say1(v, (met.e ?? 0) < -0.2 ? R.pick(['少しは落ち着いてきた', 'まだ引きずってる']) : R.pick(['おかげさまで、うまくいってる', 'まあ、相変わらず']));
    return { text, da: 3.5, praise: 6, src: '返事の元：前の話を覚えていてくれたこと' };
  }
  if (mt.t === 'hurt') {
    const x = B.memories.slice().reverse().find((y) => ['fight', 'quest', 'hunt', 'crime', 'robbed'].includes(y.k) && api.today - y.t < 6);
    if (x) return { text: say1(v, `${whenOf(api, x)}、${ownTxt(v, x.txt.split(A.given).join(v.fill('{you}'))).split('。')[0]}`) + say1(v, R.pick(['たいしたことない', 'しばらくは無理できない'])), da: 3, src: `返事の元：自分の記憶「${x.txt}」` };
    return { text: say1(v, R.pick(['ちょっと転んだだけ', 'たいしたことない。心配ありがとう'])), da: 2.5, src: '返事の元：けが' };
  }
  if (mt.t === 'ail') return { text: say1(v, `${ailName(B) || '具合が悪く'}で${isBedridden(B) ? '寝込んでた' : '、少しだるい'}`) + say1(v, R.pick(['心配かけてすまない', '早く治す'])), da: 3, src: `返事の元：自分の病（${ailName(B)}）` };
  if (mt.t === 'appr') {
    const m = api.person(B.master);
    return { text: say1(v, m ? R.pick([`${m.given}師匠は厳しいけど、腕は確か`, `毎日${m.given}師匠に叱られてばかり`]) : '修業は大変'), da: 2, src: `返事の元：師匠${m?.given ?? ''}` };
  }
  if (mt.t === 'price' || mt.t === 'spread') {
    const old = mB.px[mt.g];
    const nm = GOODS[mt.g].name;
    let text;
    if (old && old[0] !== mt.v && api.today - old[1] >= 1) text = say1(v, `${daysAgoTxt(api.today - old[1])}{me}が見たときは${old[0]}銅貨だった`) + say1(v, mt.v > old[0] ? '上がったんだね' : '下がったんだね');
    else if (JOB_GOODS[B.job]?.includes(mt.g) || CONSUMER[B.job]?.includes(mt.g)) text = say1(v, R.pick([`${nm}の値は、うちにも響く`, `${nm}なら、{me}も毎日見てる`]));
    else text = say1(v, R.pick([`へえ、${nm}ってそんなにするんだ`, `${nm}の値なんて、考えたこともなかった`, 'いいことを聞いた']));
    if (mt.sid === B.s || mt.t === 'price') mB.px[mt.g] = [mt.v, api.today];
    return { text, da: 1.5, src: old ? `返事の元：覚えていた値段（${nm}${old[0]}銅貨）` : JOB_GOODS[B.job]?.includes(mt.g) || CONSUMER[B.job]?.includes(mt.g) ? `返事の元：自分の仕事（${jobName(B.job)}）` : '返事の元：初めて聞く値段' };
  }
  if (mt.t === 'lore' || mt.t === 'monster') {
    const same = mt.job && B.job === mt.job;
    const exp = mt.sp ? B.memories.slice().reverse().find((x) => x.txt.includes(SPECIES[mt.sp].name)) : null;
    if (exp) return { text: say1(v, `${whenOf(api, exp)}、${ownTxt(v, exp.txt).split('。')[0]}`) + say1(v, R.pick(['次はその手でいく', 'それを知ってればよかった'])), da: 2.5, src: `返事の元：自分の記憶「${exp.txt}」` };
    if (same) return { text: say1(v, R.pick(['{me}の師匠も同じことを言ってた', 'それは{me}も知ってる。でも、もうひとつこつがある'])), da: 2, src: `返事の元：同じ仕事（${jobName(B.job)}）` };
    return { text: say1(v, R.pick(['へえ、覚えておく', 'いいことを聞いた', 'そういうものなのか', `${A.given}は物知り`])), da: 1.5, src: '返事の元：初めて聞く知識' };
  }
  if (mt.t === 'danger') {
    const t = topic.teach, dv = B.danger?.[t.key.slice(3)] ?? 0;
    if (dv > 1) return { text: say1(v, R.pick([`${t.place}なら、{me}も怖い目にあった`, `やっぱり${t.place}は危ないんだ`])) + say1(v, 'お互い気をつけよう'), da: 3, src: `返事の元：自分の危険の記憶（${t.place}）` };
    if (['guard', 'knight', 'soldier', 'watchman'].includes(B.job)) return { text: say1(v, R.pick([`${t.place}か。見回りのときに気をつける`, `${t.place}のこと、詰所に伝えておく`])), da: 2.5, src: `返事の元：自分の仕事（${jobName(B.job)}）` };
    return { text: say1(v, R.pick([`${t.place}だね。教えてくれてありがとう`, `${t.place}には近づかないようにする`, `${t.place}か……覚えておく`])), da: 2.5, src: '返事の元：初めて聞く危ない場所' };
  }
  if (mt.t === 'know') {
    const k = mt.k;
    const had = mB.kn.find((x) => x.key === k.key && x.from !== A.id && x.from != null);
    if (had) { const f = api.person(had.from); return { text: say1(v, `それ、${f ? f.given : '誰か'}も言ってた`), da: 1, src: `返事の元：${f?.given}から聞いた知識` }; }
    return { text: say1(v, R.pick(['いいことを聞いた', 'へえ、気をつける', '覚えておく'])), da: 1.5, src: '返事の元：初めて聞く知識' };
  }
  if (mt.t === 'news') {
    const c = B.values?.courage > 0.7 && /討|魔物|魔王/.test(mt.n.text) ? '{me}もいつか、そんなふうになりたい' : B.pers.N > 0.6 ? 'なんだか落ち着かない' : B.pers.A > 0.6 ? '関わった人たちが無事だといい' : '世の中いろいろ';
    return { text: say1(v, R.pick(['初めて聞いた', 'へえ、そんなことが']) + '。' + c), da: 1.5, src: '返事の元：初めて聞く速報' };
  }
  if (mt.t === 'wx') {
    const job = B.job;
    const rainy = ['rain', 'storm', 'squall'].includes(mt.w);
    const own = job === 'farmer' ? (rainy ? '畑にはありがたいけど' : 'うちの麦もそろそろ雨がほしい') : ['fisher', 'sailor'].includes(job) ? (rainy ? '今日は船を出さない' : '海に出るにはいい日') : job === 'laundress' ? (rainy ? '洗濯物が山になってる' : '洗濯がはかどる') : mt.temp >= 30 ? '日陰から出たくない' : mt.temp <= 2 ? '家に帰って火にあたりたい' : B.pers.O > 0.6 ? '空を見てると、いろいろ考えてしまう' : null;
    if (own) return { text: say1(v, own), da: 1.5, src: `返事の元：自分の仕事と天気（${jobName(job) || '暮らし'}）` };
    return null;
  }
  if (mt.t === 'plan' || mt.t === 'life') {
    if (B.plan && (B.plan.stage === 'saving' || B.plan.stage === 'waiting') && R.next() < 0.6) return { text: say1(v, `{me}も、${B.plan.txt}ために貯めてる`) + say1(v, 'お互いがんばろう'), da: 3, src: `返事の元：自分の計画「${B.plan.txt}」` };
    if (B.saying && R.next() < 0.5) return { text: v.fill(`『${B.saying}』って言うだろう。`) + say1(v, 'きっとうまくいく'), da: 2.5, src: `返事の元：自分の座右の銘「${B.saying}」` };
    if (B.dream && R.next() < 0.5) return { text: say1(v, `応援してる。{me}の夢は${B.dream}こと`), da: 2.5, src: `返事の元：自分の夢「${B.dream}」` };
    return null;
  }
  if (mt.t === 'money') {
    const bm = api.householdMoney(B);
    if (bm > 150 && B.pers.A > 0.5) return { text: say1(v, R.pick(['困ったら言って。少しなら貸せる', 'うちも余裕があるわけじゃないけど、困ったら言って'])), da: 3, src: `返事の元：自分の家計（${Math.round(bm)}銅貨）` };
    if (bm < 40) return { text: say1(v, `うちも${Math.round(bm)}銅貨しかない。似たようなもの`), da: 2, src: `返事の元：自分の家計（${Math.round(bm)}銅貨）` };
    return null;
  }
  return null;
}

// どの話題にも使える返事：自分の最近の体験（気持ちの向きが同じもの）を返す
function ownExperience(api, B, A, topic, v) {
  const R = api.rng, s = topic.sentiment ?? 0;
  if (Math.abs(s) < 0.2 || R.next() > 0.65) return null;
  if (!['complain', 'good', 'boast', 'grief', 'family', 'memory', 'warning', 'war', 'demon'].includes(topic.kind)) return null;
  let best = null, bs = 0;
  for (const x of B.memories) {
    if (x.g || x.t < 0 || api.today - x.t > 5 || Math.abs(x.emo) < 0.3 || ['story', 'news'].includes(x.k) || !isPast(x.txt)) continue;
    const sc = (Math.sign(x.emo) === Math.sign(s) ? 2 : 0.6) + (x.imp ?? 0.3) - (api.today - x.t) * 0.1;
    if (sc > bs) { bs = sc; best = x; }
  }
  if (!best) return null;
  const w = whenOf(api, best), txt = ownTxt(v, best.txt.split(A.given).join(v.fill('{you}'))).split('。')[0];
  const same = Math.sign(best.emo) === Math.sign(s);
  const lead = same ? (s < 0 ? R.pick(['わかる。', 'それを言うなら、', '']) : R.pick(['いいね。', 'それはよかった。', ''])) : (s < 0 ? R.pick(['それは大変。', 'そうか……']) : R.pick(['いいなあ。', 'うらやましい。']));
  const body = same ? `{me}も${w}、${txt}` : `{me}のほうは${w}、${txt}`;
  const link = same ? (s < 0 ? R.pick(['お互いつらい', '人ごとじゃない']) : R.pick(['いいことって続く', 'お互い運がいい'])) : (best.emo < 0 ? R.pick(['世の中うまくいかない', 'うまくいく人もいるんだなあ']) : R.pick(['いいこともあれば悪いこともある', '元気出して']));
  return { text: v.fill(lead) + say1(v, body) + say1(v, link), da: same ? 3 : 2, src: `返事の元：自分の最近の体験「${best.txt}」` };
}

// ---------- あいさつと別れ ----------
function greetOf(api, v, A, B, hour, mA) {
  const R = api.rng;
  if (B.rank === 'king' && A.rank !== 'king' && !api.kinTerm(A, B)) return v.r({ child: ['王さま、こんにちは！', '王さまだ！ こんにちは！'], rough: ['……陛下。', '陛下、どうも。'], default: ['陛下、ご機嫌うるわしゅう。', '陛下、お目にかかれて光栄です。'], plain: ['陛下、ご機嫌うるわしゅうございます。', '陛下、お変わりなく。'], polite: ['陛下、ご機嫌うるわしゅうございます。', '陛下、本日もご健勝で何よりです。'] });
  if (v.style === 'royal') return v.r({ royal: ['うむ、{you}か。', 'よく来た、{you}。', '{you}、息災か。'] });
  const met = mA.met[B.id];
  const rel = api.rel(A, B);
  const first = !met && (rel.f || 0) < 8 && !api.kinTerm(A, B) && api.ageOf(A) >= 13;
  const t = hour < 10 ? 0 : hour < 17 ? 1 : 2;
  const G = [
    { polite: ['おはようございます、{you}。', '{you}、おはようございます。'], elder: ['おはよう、{you}。', 'おお、{you}。早いのう。'], rough: ['よう、{you}。', 'おう、{you}。早いな。'], child: ['おはよう、{you}！', '{you}、おはよー！'], plain: ['おはよう、{you}。', 'あ、{you}。おはよう。', '{you}、おはよう。'], noble_f: ['ごきげんよう、{you}。'], noble_m: ['おはよう、{you}。'], knight: ['おはようございます、{you}！'], sage: ['おお、{you}か。おはよう。'] },
    { polite: ['こんにちは、{you}。', '{you}、こんにちは。'], elder: ['おや、{you}か。', 'おお、{you}。'], rough: ['よう、{you}。', 'おう、{you}。'], child: ['{you}、こんにちは！', 'あっ、{you}だ！'], plain: ['こんにちは、{you}。', 'やあ、{you}。', 'あ、{you}。'], noble_f: ['ごきげんよう、{you}。'], noble_m: ['やあ、{you}。'], knight: ['{you}、ご苦労さまです！'], sage: ['{you}か。ちょうどいいところに。'] },
    { polite: ['こんばんは、{you}。', '{you}、こんばんは。'], elder: ['おお、{you}。いい晩じゃな。', 'おや、{you}。こんな時間に。'], rough: ['よう、{you}。', 'お、{you}じゃねえか。'], child: ['{you}、こんばんは！'], plain: ['こんばんは、{you}。', 'やあ、{you}。', 'あれ、{you}。'], noble_f: ['ごきげんよう、{you}。'], noble_m: ['こんばんは、{you}。'], knight: ['{you}、こんばんは！'], sage: ['おや、{you}。星のきれいな晩だ。'] },
  ][t];
  if (first) {
    const job = A.job ? jobName(A.job) : null;
    const intro = v.r({ polite: 'はじめまして。', elder: 'はじめましてかのう。', rough: '見ない顔だな。', child: 'はじめまして！', plain: ['はじめまして。', 'あ、はじめまして。'], noble_f: 'はじめまして。', knight: 'お初にお目にかかります。', sage: 'はじめまして。' });
    return intro + say1(v, job ? `${job}の${A.given}` : `{me}は${A.given}`);
  }
  let g = v.r(G);
  const add = [];
  if (met) {
    const d = api.today - met.d;
    if (d === 0) add.push(v.r({ polite: '今日はよくお会いしますね。', elder: 'また会ったのう。', rough: 'また会ったな。', child: 'また会ったね！', default: ['また会ったね。', '今日はよく会うね。'] }));
    else if (d === 1) add.push(v.r({ polite: '昨日はどうも。', elder: '昨日ぶりじゃな。', default: ['昨日ぶり。', '昨日はどうも。'] }));
    else if (d <= 6) add.push(say1(v, `${kn(d)}日ぶり`));
    else add.push(v.r({ polite: 'お久しぶりです。', elder: '久しぶりじゃのう。', rough: '久しぶりだな。', child: 'ひさしぶり！', default: ['久しぶり。', 'しばらくぶり。', '元気にしてた？'] }));
  }
  const act = B.action?.type;
  if (act === 'work' && B.job && !['king', 'royal', 'noble'].includes(B.job)) add.push(v.s(`${jobName(B.job)}の仕事中`, 'qn'));
  else if (act === 'tavern') add.push(v.r({ rough: '一杯やってるのか？', elder: '一杯やっとるのか。', default: ['一杯やってるの？', '今日はもう飲んでる？'] }));
  else if (B.ail && B.ail.sev >= 25) add.push(v.r({ polite: 'お加減はいかがですか？', default: ['具合、大丈夫？', '体はもういいの？'] }));
  if (add.length && R.next() < 0.75) g += R.pick(add);
  return g;
}

function byeOf(api, v, S, L, hour, ctx) {
  const R = api.rng;
  const base = v.r({ polite: ['では、また。', '失礼いたします。', 'それでは。'], elder: ['じゃあの。', '達者でな。', 'またおいで。'], rough: ['じゃあな。', 'またな。', 'そんじゃ。'], child: ['またね！', 'ばいばい！', 'またあそぼ！'], plain: ['じゃあ、また。', 'またね。', 'それじゃ。', 'じゃあね。'], royal: ['下がってよい。', '大儀であった。'], noble_f: ['ごきげんよう。', 'それでは、また。'], noble_m: ['では、また。', '失礼する。'], knight: ['失礼します！', 'では、任務に戻ります。'], sage: ['では、また。', 'また話そう。'] });
  const wishes = [];
  if (hour >= 20 || hour < 4) wishes.push(v.r({ polite: 'おやすみなさい。', elder: 'ゆっくりお休み。', rough: 'よく寝ろよ。', child: 'おやすみー！', plain: ['おやすみ。', 'ゆっくり休んでね。'], noble_f: 'よい夢を。', knight: 'お休みなさいませ。' }));
  if (L.ail && L.ail.sev >= 15) wishes.push(v.r({ polite: 'どうかお大事に。', elder: '体を大事にな。', rough: '早く治せよ。', default: ['お大事に。', '早く良くなってね。'] }));
  if (L.action?.type === 'work' && L.job) wishes.push(say1(v, `${jobName(L.job)}の仕事、${R.pick(['がんばって', '無理しないで'])}`));
  const kid = (L.children || []).map((id) => alive(api, id)).find((c) => c && api.ageOf(c) < 14);
  if (kid) wishes.push(say1(v, `${kid.given}によろしく`));
  const sp = L.spouseId != null ? alive(api, L.spouseId) : null;
  if (sp && sp.id !== S.id) wishes.push(say1(v, `${sp.given}にもよろしく`));
  const pos = L.pos || api.townOf(L);
  const w = ensureWx(api).r[regionIndex(pos.x, pos.z)].w;
  if (['rain', 'storm', 'squall', 'snow', 'blizzard'].includes(w)) wishes.push(say1(v, `${WX_NAME[w]}だから、足元に気をつけて`));
  const up = calendarUpcoming(api, S.s, 3);
  if (up && up.ev?.name) wishes.push(say1(v, `${up.ev.name}で会おう`));
  if (ctx.good) wishes.push(say1(v, `${GOODS[ctx.good].name}の話、ありがとう`));
  if (wishes.length && R.next() < 0.8) return base + R.pick(wishes);
  return base;
}

// ---------- 同じ文を避ける ----------
function lineOK(mP, h, strict) {
  if (mP.h.includes(h)) return false;
  if (strict && mP.r.includes(h)) return false;
  if (strict && glHas(h)) return false;
  return true;
}
function commit(p, mP, text) {
  const h = hashStr(text);
  mP.h.push(h); mP.r.push(h); clip(mP.r, 48);
  GL.seen.add(h);
  if (p.recent) { p.recent.push(text); if (p.recent.length > 30) p.recent.shift(); }
}
// gen を何度か回し、それでもだめなら口癖などで言い回しを変える。optional な文は最後は言わない
function pickLine(api, p, mP, v, gen, sentiment, optional, role) {
  let text = null;
  for (let i = 0; i < 5; i++) {
    const t = gen(i);
    if (!t) continue;
    if (lineOK(mP, hashStr(t), i < 3 || optional)) { text = t; break; }
    // 言い回しを変える（あいさつ・別れは変えずに言わない）
    if (optional) continue;
    for (let j = 0; j < 3; j++) {
      const t2 = personalize(api, v, t, sentiment, { role, ticMul: 4, afterMul: 3, nameMul: 4 });
      if (t2 !== t && lineOK(mP, hashStr(t2), i < 2)) { text = t2; break; }
    }
    if (text) break;
  }
  if (!text) {
    if (optional) return null;
    const t = gen(9) || '……';
    const alts = ['……', 'うん、', 'まあ、', 'そうそう、', 'ええと、', 'つまり、', 'だからさ、', 'あのね、', 'ほら、', 'やっぱり、'];
    text = t;
    for (const a of alts) { const t2 = a + t; if (lineOK(mP, hashStr(t2), false)) { text = t2; break; } }
  }
  commit(p, mP, text);
  return text;
}

// すでに前置きのある文（口癖を重ねない）
const LEAD_RE = /^(聞いて|ちょっと聞いて|まあ聞いて|聞け|あのね|ご報告|ふと|なぜか|この目|知ってた|ここだけ|噂|聞いた|そういえば|覚えてる|これは|仕事で|師匠|ギルド|覚えておく|お聞き|ねえ|おい|耳に|ご存じ|うちの|.{1,16}(から聞いた|が言って|に聞いた|が言うには|といえば|をやって|とやり合って|の話をしよう))/;

// ---------- 会話全体 ----------
export function mindConversation(api, A, B) {
  try { return mindConversation0(api, A, B); } catch (e) {
    // 万一の不具合でも世界を止めない（試験では tmDebug で例外を投げる）
    if (api.tmDebug) throw e;
    if (!api._tmErr) { api._tmErr = 1; console.warn('talkmind:', e); }
    return composeConversation(api, A, B);
  }
}
function mindConversation0(api, A, B) {
  glReset(api);
  const R = api.rng;
  const mA = mindOf(api, A), mB = mindOf(api, B);
  const vA = new MindVoice(api, A, B), vB = new MindVoice(api, B, A);
  const V = new Map([[A.id, vA], [B.id, vB]]), M = new Map([[A.id, mA], [B.id, mB]]);
  const lines = [];
  const dbg = !!api.tmDebug;
  const say = (p, gen, kind, opt = {}) => {
    const t = pickLine(api, p, M.get(p.id), V.get(p.id), gen, opt.sentiment ?? 0, opt.optional);
    if (t == null) return null;
    const l = { id: p.id, text: t, kind };
    if (dbg && opt.src) l.src = opt.src;
    lines.push(l);
    return t;
  };
  const hour = api.hour();
  const relAB = api.rel(A, B);
  const effects = { daA: 0, daB: 0, topics: [], romance: false, argument: false, shared: [], warnings: [], praiseA: 0, praiseB: 0 };

  // 口論（相手とのいやな記憶から言い分を作る）
  const quarrel = relAB.a < -15 && (A.pers.N > 0.55 || A.pers.A < 0.4) && R.chance(0.45) && A.rank !== 'king' && B.rank !== 'king';
  if (quarrel) {
    const bad = A.memories.slice().reverse().find((m) => m.about && m.about.includes(B.id) && m.emo < -0.2 && !m.g);
    say(A, () => vA.r({ polite: ['{you}、ひとこと言わせていただきます。', '{you}、少しよろしいですか。'], elder: ['{you}、ちょっと待ちなさい。', 'これ、{you}。'], rough: ['おい、{you}。', 'ちょっと顔貸せ、{you}。'], child: ['{you}のばか！', '{you}、ずるい！'], plain: ['{you}、ちょっといい？', '{you}、話がある。'], noble_f: '{you}、少しよろしくて？' }), 'quarrel');
    say(A, (i) => bad && i < 3 ? say1(vA, `${whenOf(api, bad)}、${ownTxt(vA, bad.txt.split(B.given).join(vA.fill('{you}'))).split('。')[0]}こと、まだ許してない`) : say1(vA, R.pick(['この前のこと、まだ謝ってもらってない', '{you}のそういうところが本当に嫌い', 'いいかげん、人の話を聞いて', '{you}の顔を見ると腹が立つ'])), 'quarrel', { src: bad ? `相手へのいやな記憶「${bad.txt}」` : '相手への嫌悪', sentiment: -0.8 });
    const back = B.pers.A > 0.6
      ? () => vB.r({ polite: ['……申し訳ありませんでした。', '……おっしゃるとおりです。すみません。'], elder: ['わかった、わかった。わしが悪かった。', 'すまんかったのう。'], rough: ['……悪かったよ。', '……ちっ、悪かった。'], child: ['ごめん……', 'ごめんなさい……'], plain: ['……ごめん。言いすぎた。', '……ごめん。{me}が悪かった。'] })
      : () => vB.r({ polite: ['それはこちらの台詞です。', '心外です。'], elder: ['年寄りに向かってなんじゃ！', '口を慎みなさい！'], rough: ['うるせえ、お前こそ何様だ！', 'やんのか、ああ？'], child: ['そっちこそ！', 'べーだ！'], plain: ['そっちこそ、いいかげんにして！', 'なんでそんなこと言われなきゃいけないの！'], noble_f: '無礼者！' });
    say(B, back, 'quarrel', { sentiment: -0.5 });
    const reconcile = B.pers.A > 0.6;
    effects.daA = reconcile ? 3 : -8; effects.daB = reconcile ? 2 : -10; effects.argument = !reconcile;
    effects.topics.push('quarrel');
    metMark(api, mA, B.id); metMark(api, mB, A.id);
    return { lines, effects };
  }

  const firstToday = !(A.talkedToday && A.talkedToday[B.id]);
  if (firstToday) {
    say(A, () => greetOf(api, vA, A, B, hour, mA), 'greet', { optional: true });
    if (R.chance(0.7)) say(B, () => greetOf(api, vB, B, A, hour, mB), 'greet', { optional: true });
  }
  const turns = 1 + (R.chance(0.35 + (A.pers.E + B.pers.E) / 4) ? 1 : 0) + (R.chance(0.25) ? 1 : 0);
  let speaker = A, listener = B, vs = vA, vl = vB;
  const ctx = {};
  for (let i = 0; i < turns; i++) {
    const ms = M.get(speaker.id), ml = M.get(listener.id);
    let topic = null, key = null;
    const cands = candidates(api, speaker, listener, ms, vs);
    // speech.js の話題（行事・家計・病・働き方・裏社会・王への陳情など）もまぜる
    const special = (speaker.rank === 'homeless' ? 2.5 : 0) + (listener.rank === 'king' && speaker.rank !== 'king' ? 2.5 : 0) + (speaker.jail != null ? 4 : 0) + (api.hh(speaker)?.refugee != null ? 2.5 : 0) + (api.S.demon?.active ? 1.2 : 0) + (api.kingdomOf(speaker)?.war ? 1.2 : 0) + (speaker.rank === 'king' ? 2 : 0) + (api.ageOf(speaker) < 13 ? 1.2 : 0);
    const fbKeysRecent = ms.tk.slice(-4);
    cands.push({ key: null, w: 1.3 + special, fb: true });
    const text = pickLine(api, speaker, ms, vs, (tries) => {
      for (let k = 0; k < 3; k++) {
        const c = api.rng.weighted(cands, (x) => x.w);
        if (!c) return null;
        let t;
        if (c.fb) {
          t = pickTopic(api, speaker, listener, vs);
          const fk = 'f:' + t.kind;
          if (fbKeysRecent.includes(fk) && k < 2 && tries < 3) continue;
          key = fk;
          t.text = t.text.replace(/(\d+)歳のころ、(\1歳で)/, '$2');
          t.src = t.src || `定番の話題（${t.kind}）`;
          t.lead = /^(ねえ|聞いた|なあ|おい|ご存じ|お聞き|耳に|ご報告|聞いておる|そういえば|死んだ|昔から|陛下)/.test(t.text);
        } else {
          try { t = c.make(vs); } catch (e) { if (api.tmDebug) throw e; t = null; }
          if (!t || !t.text) { c.w = 0; continue; }
          key = c.key;
          c.w *= 0.3; // 次に選び直すときは別の話題を選びやすく
        }
        if (t.lead == null) t.lead = LEAD_RE.test(t.text);
        t.text = personalize(api, vs, t.text, t.sentiment, { role: 'topic', lead: t.lead });
        topic = t;
        return t.text;
      }
      return null;
    }, 0, false, 'topic');
    if (!topic) topic = { kind: 'neutral', text, sentiment: 0 };
    lines.push({ id: speaker.id, text, kind: topic.kind });
    if (dbg) lines[lines.length - 1].src = topic.src;
    if (key) { ms.tk.push(key); clip(ms.tk, 16); tellMark(ms, listener.id, key); }
    // 返事：相手の記憶と知識から。なければ speech.js の返事
    let re = null;
    // 定番の話題にも、聞き手の記憶・仕事・夢で返せるものは返す
    if (!topic.mind) {
      if (topic.kind === 'weather') { const pos = listener.pos || api.townOf(listener); const r = ensureWx(api).r[regionIndex(pos.x, pos.z)]; topic.mind = { t: 'wx', w: r.w, temp: Math.round(r.temp) }; }
      else if (topic.kind === 'opinion' && topic.about?.length) { const q = alive(api, topic.about[0]); if (q && q.id !== listener.id) topic.mind = { t: 'acq', q }; }
      else if (topic.kind === 'dream') topic.mind = { t: 'plan' };
    }
    try { re = mindReact(api, listener, speaker, topic, vl); } catch (e) { if (api.tmDebug) throw e; re = null; }
    const base = react(api, listener, speaker, topic, vl);
    if (!re && !['romance', 'petition', 'beg', 'aboutyou', 'quarrel'].includes(topic.kind) && !(topic.kind === 'king' && topic.treason)) { try { re = ownExperience(api, listener, speaker, topic, vl); } catch (e) { if (api.tmDebug) throw e; } }
    if (!re) re = { ...base, src: '返事の元：気持ち（定番の返事）' };
    else { if (base.romance) re.romance = true; if (base.give) re.give = true; if (base.adopt) re.adopt = true; if (re.da == null) re.da = base.da; if (re.praise == null && base.praise && re.da > 0) re.praise = base.praise; }
    const reText = pickLine(api, listener, ml, vl, (tries) => personalize(api, vl, tries < 3 ? re.text : react(api, listener, speaker, topic, vl).text, topic.sentiment, { role: 'reply', nameMul: tries ? 2 : 1 }), topic.sentiment, false, 'reply');
    lines.push({ id: listener.id, text: reText, kind: 're:' + topic.kind });
    if (dbg) lines[lines.length - 1].src = re.src;
    // 相手が覚える「この人が話してくれたこと」
    const mm = topic.mind;
    metMark(api, ml, speaker.id, mm && mm.t === 'mem' ? { s: summaryOf(mm.m), k: mm.m.k, e: mm.m.emo } : null);
    if (mm && (mm.t === 'price' || mm.t === 'spread')) ctx.good = mm.g;
    effects.topics.push(topic.kind);
    if (topic.gossip) effects.shared.push({ from: speaker.id, to: listener.id, mem: topic.gossip });
    if (topic.warning) effects.warnings.push({ to: listener.id, ...topic.warning });
    if (topic.saying && re.adopt) effects.saying = { from: speaker.id, to: listener.id, text: topic.saying };
    if (re.romance) effects.romance = true;
    if (re.praise) { if (speaker === A) effects.praiseA += re.praise; else effects.praiseB += re.praise; }
    if (re.give) { const coin = 2; const hs = api.hh(speaker), hl = api.hh(listener); if (hl && hs && hl.money > coin) { hl.money -= coin; hs.money += coin; } } // 施し：聞き手の家計 → 話し手の家計
    const compat = 1 - (Math.abs(A.pers.E - B.pers.E) + Math.abs(A.pers.O - B.pers.O) + Math.abs(A.pers.A - B.pers.A)) / 3;
    const d = (re.da ?? 1) + (compat - 0.5) * 3;
    if (speaker === A) { effects.daA += d * 0.8; effects.daB += d; } else { effects.daB += d * 0.8; effects.daA += d; }
    [speaker, listener, vs, vl] = [listener, speaker, vl, vs];
  }
  if (R.chance(0.5)) say(speaker, () => byeOf(api, vs, speaker, listener, hour, ctx), 'bye', { optional: true });
  metMark(api, mA, B.id); if (!mB.met[A.id]) metMark(api, mB, A.id); else mB.met[A.id].d = api.today;
  return { lines, effects };
}

// ---------- 心の声 ----------
// innerThought の文が、自分が最近思ったことか、町じゅうでありふれた文なら、自分の記憶・知識・計画から別の考えを作る
export function mindThought(api, p) {
  try { return mindThought0(api, p); } catch (e) {
    if (api.tmDebug) throw e;
    return innerThought(api, p);
  }
}
function mindThought0(api, p) {
  if (!p.needs) return null;
  glReset(api);
  const m = mindOf(api, p);
  if (!Array.isArray(m.tr)) m.tr = [];
  const R = api.rng;
  const mine = (h) => m.th.includes(h) || m.tr.includes(h);
  const keep = (t) => { const h = hashStr(t); m.th.push(h); clip(m.th, 40); m.tr.push(h); clip(m.tr, 30); GL.seen.add(h); return t; };
  let first = null;
  for (let i = 0; i < 2; i++) {
    const t = innerThought(api, p);
    if (!t) continue;
    const h = hashStr(t);
    if (!mine(h) && !glHas(h)) return keep(t);
    if (!first && !m.th.includes(h)) first = t;
  }
  // 記憶・知識・計画・目的から、その人だけの考えを作る
  const me = firstPerson(p, p.style || 'plain');
  const opts = [];
  for (let i = p.memories.length - 1, c = 0; i >= 0 && c < 6; i--) {
    const x = p.memories[i];
    if (x.g || x.t < 0 || api.today - x.t > 5 || (x.imp ?? 0) < 0.3 || x.k === 'story' || !isPast(x.txt)) continue;
    c++;
    const w = whenOf(api, x), t = x.txt.split('。')[0].replace(/わたし/g, me);
    opts.push(x.emo >= 0 ? R.pick([`${w}、${t}。思い出すと顔がゆるむ。`, `${t}……${w}のことなのに、もう懐かしい。`, `${w}のこと。${t}。また、ああいう日があるといい。`]) : R.pick([`${w}、${t}。まだ胸がざわつく。`, `${t}……。考えないようにしよう。`, `${w}のことが、まだ頭から離れない。${t}。`]));
  }
  for (const k of m.kn) {
    const f = api.person(k.from);
    if (!f) continue;
    if (k.k === 'px') opts.push(`${f.given}の言ってた${GOODS[k.g]?.name}の${k.v}銅貨、本当かな。`);
    else if (k.txt) opts.push(`${f.given}が言ってたっけ。「${stripEnd(k.txt)}」。`);
  }
  for (const [id, e] of Object.entries(m.met)) {
    const d = api.today - e.d;
    if (d >= 3 && (p.rel?.[id]?.a ?? 0) > 30) { const q = alive(api, +id); if (q) opts.push(`${q.given}、元気かな。${kn(Math.min(d, 10))}日も会ってない。`); }
    if (e.s && e.sd != null && api.today - e.sd <= 3) { const q = alive(api, +id); if (q) opts.push(`${q.given}の${e.s}、どうなったかな。`); }
  }
  if (p.plan && p.plan.stage === 'saving') opts.push(`${p.plan.txt}まで、あと${Math.max(1, Math.round(p.plan.need - p.plan.saved))}銅貨。`);
  if (p.pur) for (const t of purposeThoughts(api, p)) opts.push(t);
  R.shuffle(opts);
  for (const t of opts) { const h = hashStr(t); if (!mine(h) && !glHas(h)) return keep(t); }
  for (const t of opts) if (!m.th.includes(hashStr(t))) return keep(t);
  return first ? keep(first) : null;
}
