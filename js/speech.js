// 言葉の生成エンジン（外部AI・APIを使わない「仮想の心の声」）
// 性格・身分・記憶・人間関係・世界の情勢から、その人らしい言葉を組み立てる。
// 同じ人が同じ台詞をくり返さないよう、最近の発言を覚えておく。
import { casualKin } from './kin.js';
import { careerThought } from './career.js';
import { underworldTopic, underworldThoughts } from './underworld.js';
import { healthThoughts, healthTopic } from './health.js';
import { financeThoughts, financeTopic, financeTopicWeight } from './finance.js';
import { calendarTopicWeight, calendarTopic, calendarReact, calendarThought } from './calendar.js';
import { JOBS, GOODS, TECHS, RANKS } from './data.js';

// ---- 話し方 ----
export function speechStyle(p, age) {
  if (age < 13) return 'child';
  if (p.rank === 'king') return 'royal';
  if (p.rank === 'royal') return age >= 64 ? 'royal' : 'noble';
  if (p.rank === 'noble') return 'noble';
  if (p.job === 'knight') return 'knight';
  if (p.job === 'wizard' || p.job === 'scholar') return age >= 64 ? 'elder' : 'sage';
  if (age >= 64) return 'elder';
  const { A, C, E } = p.pers;
  if (A > 0.62 && C > 0.55 && E < 0.6) return 'polite';
  if (A < 0.36 || (p.sex === 'm' && E > 0.65 && C < 0.4) || p.job === 'thief') return 'rough';
  return 'plain';
}
export function firstPerson(p, style) {
  const m = p.sex === 'm';
  switch (style) {
    case 'child': return m ? 'ぼく' : 'あたし';
    case 'elder': return m ? 'わし' : 'わたし';
    case 'polite': return m ? '私' : 'わたし';
    case 'rough': return m ? '俺' : 'あたし';
    case 'royal': return '余';
    case 'noble': return m ? '私' : 'わたくし';
    case 'knight': return m ? '自分' : '私';
    case 'sage': return p.job === 'wizard' && m ? '我' : '私';
    default: return m ? (p.pers.A > 0.6 ? '僕' : '俺') : 'わたし';
  }
}

const TAILS = {
  n: { plain_m: ['だ', 'だな', 'だよ'], plain_f: ['よ', 'ね', 'なのよ'], polite: ['です', 'ですね', 'ですよ'], rough_m: ['だぜ', 'だろ', 'だな'], rough_f: ['だよ', 'さ', 'だね'], elder: ['じゃ', 'じゃのう', 'じゃよ'], child: ['だよ', 'なの', 'だね'], royal: ['じゃ', 'である', 'であるぞ'], noble_m: ['だ', 'であろう', 'だね'], noble_f: ['ですわ', 'ですのよ'], knight: ['であります', 'です'], sage: ['だ', 'なのだ', 'であろう'] },
  v: { plain_m: ['よ', 'な', 'んだ', 'んだよ'], plain_f: ['わ', 'の', 'のよ', 'ね'], polite: ['んです', 'んですよ'], rough_m: ['ぜ', 'んだよ', 'な', 'んだ'], rough_f: ['んだよ', 'さ', 'よ'], elder: ['のう', 'んじゃ', 'わい', 'んじゃよ'], child: ['よ', 'の', 'んだ', 'もん'], royal: ['のじゃ', 'ぞ', 'のだ'], noble_m: ['のだ', 'のだよ'], noble_f: ['のですわ', 'のよ'], knight: ['のであります', 'のです'], sage: ['のだ', 'のだよ'] },
  a: { plain_m: ['ね', 'な'], plain_f: ['ね', 'わね'], polite: ['ですね'], rough_m: ['な'], rough_f: ['ね'], elder: ['のう'], child: ['ね'], royal: ['のう'], noble_m: ['ね'], noble_f: ['ですわね'], knight: ['ですな'], sage: ['な'] },
  qn: { plain_m: ['？', 'かい？'], plain_f: ['？', 'なの？'], polite: ['ですか？'], rough_m: ['か？'], rough_f: ['かい？'], elder: ['かのう？', 'かね？'], child: ['？', 'なの？'], royal: ['か？'], noble_m: ['かね？'], noble_f: ['ですの？'], knight: ['でありますか？'], sage: ['かね？'] },
  qv: { plain_m: ['の？', 'のかい？'], plain_f: ['の？'], polite: ['んですか？'], rough_m: ['のか？'], rough_f: ['のかい？'], elder: ['のかね？'], child: ['の？'], royal: ['のか？'], noble_m: ['のかね？'], noble_f: ['のですか？'], knight: ['のでありますか？'], sage: ['のかね？'] },
};
const GENDERED = new Set(['plain', 'noble', 'rough']);

export class Voice {
  constructor(api, p, listener) {
    this.api = api; this.p = p; this.listener = listener;
    this.age = api.ageOf(p);
    let style = p.style || speechStyle(p, this.age);
    // 目上の相手には丁寧に（嫌っている相手には崩れたまま）
    if (listener && ['plain', 'rough', 'sage', 'knight'].includes(style)) {
      const gap = (RANKS[listener.rank]?.lv ?? 4) - (RANKS[p.rank]?.lv ?? 4);
      const hate = (p.rel?.[listener.id]?.a ?? 0) < -30;
      if (gap >= 2 && !api.kinTerm(p, listener) && !hate) style = style === 'knight' ? 'knight' : 'polite';
    }
    this.style = style;
    this.me = firstPerson(p, style === 'polite' && p.style !== 'polite' ? (p.sex === 'm' ? 'polite' : 'polite') : style);
    this.rng = api.rng;
  }
  get key() { return GENDERED.has(this.style) ? `${this.style}_${this.p.sex}` : this.style; }
  tail(kind) { return this.rng.pick(TAILS[kind][this.key] || TAILS[kind].plain_m); }
  s(body, kind = 'n') {
    body = this.fill(body);
    if (kind === 'raw') return body;
    let out = body + this.tail(kind);
    if (!/[？！。…」]$/.test(out)) out += this.rng.chance(0.12) ? '！' : '。';
    return out;
  }
  r(variants) {
    const v = variants[this.key] ?? variants[this.style] ?? (this.style === 'noble' || this.style === 'royal' || this.style === 'knight' || this.style === 'sage' ? variants.polite : null) ?? variants.plain ?? variants.default ?? variants.polite ?? Object.values(variants)[0];
    const out = this.fill(Array.isArray(v) ? this.rng.pick(v) : v);
    // 荒っぽい女性の話し方：男言葉をやわらげる
    if (this.style === 'rough' && this.p.sex === 'f' && variants.rough_f == null) return out.replace(/じゃねえか/g, 'じゃないか').replace(/言うだろ/g, '言うでしょ').replace(/だろ([？。！])/g, 'でしょ$1').replace(/だぜ/g, 'だよ').replace(/めでてえ/g, 'めでたい').replace(/疲れてんじゃ/g, '疲れてるんじゃ');
    return out;
  }
  fill(txt) {
    return txt.replace(/\{me\}/g, this.me).replace(/\{you\}/g, this.listener ? address(this.api, this.p, this.listener, this.style) : 'きみ');
  }
  end() { return { polite: 'です。', elder: 'のう。', royal: 'のう。', noble: this.p.sex === 'f' ? 'ですわ。' : 'ね。', knight: 'であります。', sage: 'な。', child: 'ね。', rough: 'な。' }[this.style] || 'ね。'; }
}

// 相手の呼び方
export function address(api, a, b, style) {
  const term = api.kinTerm(a, b);
  const childish = style === 'child';
  const high = ['royal', 'noble'].includes(style) || ['king', 'royal', 'noble'].includes(a.rank);
  if (term) {
    if (term === '父' || term === '母') return high ? (term === '父' ? '父上' : '母上') : childish ? casualKin(term, true) : term === '父' ? '父さん' : '母さん';
    if (['祖父', '祖母', '曾祖父', '曾祖母'].includes(term)) return high ? (term.endsWith('父') ? 'おじいさま' : 'おばあさま') : childish ? casualKin(term, true) : { 祖父: 'じいちゃん', 祖母: 'ばあちゃん', 曾祖父: 'ひいじいちゃん', 曾祖母: 'ひいばあちゃん' }[term];
    if (term === '兄') return high ? '兄上' : childish ? 'お兄ちゃん' : '兄さん';
    if (term === '姉') return high ? '姉上' : childish ? 'お姉ちゃん' : '姉さん';
    if (term === '妻' || term === '夫') return b.rank === 'king' && a.rank !== 'king' ? '陛下' : b.given;
    if (['息子', '娘', '孫', '弟', '妹'].includes(term)) return b.given;
    if (term === 'おじ') return childish ? 'おじちゃん' : 'おじさん';
    if (term === 'おば') return childish ? 'おばちゃん' : 'おばさん';
  }
  const lvA = RANKS[a.rank]?.lv ?? 4, lvB = RANKS[b.rank]?.lv ?? 4;
  if (b.rank === 'king' && a.rank !== 'king') return '陛下';
  if (b.rank === 'royal' && lvA < 8) return `${b.given}殿下`;
  if (a.rank === 'king' && lvB < 7) return api.rng.chance(0.5) ? 'そなた' : `${b.given}よ`;
  if (b.rank === 'noble' && lvA < 7) return `${b.given}さま`;
  if (b.job === 'knight' && lvA < 6) return '騎士さま';
  if (b.job === 'jailer' && a.rank === 'prisoner') return '看守の旦那';
  if (a.job === 'jailer' && b.rank === 'prisoner') return 'おい、そこの';
  if (b.job === 'priest' && lvA <= 5) return '司祭さま';
  const bAge = api.ageOf(b);
  const rel = a.rel?.[b.id];
  if (rel && rel.a < -40 && ['plain', 'rough'].includes(style)) return 'あんた';
  if (bAge < 13) return b.given + (b.sex === 'm' ? 'くん' : 'ちゃん');
  if (style === 'polite' || style === 'knight') return b.given + 'さん';
  if (style === 'noble' || style === 'royal') return b.given;
  if (style === 'child') return b.given + (bAge > 40 ? (b.sex === 'm' ? 'おじさん' : 'おばさん') : (b.sex === 'm' ? 'にいちゃん' : 'ねえちゃん'));
  if (bAge >= 64 && style !== 'elder') return b.given + (b.sex === 'm' ? 'じいさん' : 'ばあさん');
  if (rel && rel.a > 35 && rel.f > 50) return b.given;
  return b.given + 'さん';
}

function greeting(v, hour, B) {
  if (B.rank === 'king' && v.p.rank !== 'king' && !v.api.kinTerm(v.p, B)) return v.r({ child: '王さま、こんにちは！', rough: '……陛下。', default: '陛下、ご機嫌うるわしゅう。', plain: '陛下、ご機嫌うるわしゅうございます。', polite: '陛下、ご機嫌うるわしゅうございます。' });
  if (v.style === 'royal') return v.r({ royal: ['うむ、{you}か。', 'よく来た、{you}。'] });
  if (hour < 10) return v.r({ polite: 'おはようございます、{you}。', elder: 'おはよう、{you}。', rough: ['よう、{you}。', 'おう、{you}。早いな。'], child: 'おはよう、{you}！', plain: ['おはよう、{you}。', 'あ、{you}。おはよう。'], noble_f: 'ごきげんよう、{you}。', noble_m: 'おはよう、{you}。', knight: 'おはようございます、{you}！', sage: 'おお、{you}か。おはよう。' });
  if (hour < 17) return v.r({ polite: 'こんにちは、{you}。', elder: 'おや、{you}か。', rough: ['よう、{you}。', 'おう、{you}。'], child: '{you}、こんにちは！', plain: ['こんにちは、{you}。', 'やあ、{you}。'], noble_f: 'ごきげんよう、{you}。', noble_m: 'やあ、{you}。', knight: '{you}、ご苦労さまです！', sage: '{you}か。ちょうどいいところに。' });
  return v.r({ polite: 'こんばんは、{you}。', elder: 'おお、{you}。いい晩じゃな。', rough: ['よう、{you}。', 'お、{you}じゃねえか。'], child: '{you}、こんばんは！', plain: ['こんばんは、{you}。', 'やあ、{you}。'], noble_f: 'ごきげんよう、{you}。', noble_m: 'こんばんは、{you}。', knight: '{you}、こんばんは！', sage: 'おや、{you}。星のきれいな晩だ。' });
}

// ---- 話題の選択 ----
function topics(api, A, B) {
  const list = [];
  const add = (w, fn) => { if (w > 0) list.push({ w, fn }); };
  const age = api.ageOf(A), n = A.needs;
  const D = api.S.demon;
  const low = Object.entries(n).sort((x, y) => x[1] - y[1])[0];
  add(low[1] < 35 ? 2.4 : 0, topicNeed);
  add(0.5, topicWeather);
  add(calendarTopicWeight(api, A), calendarTopic);
  add(financeTopicWeight(api, A, B), (a1, a2, a3, v) => financeTopic(a1, a2, a3, v));
  const ut = underworldTopic(api, A, B); if (ut) add(ut.w, ut.fn);
  const ht = healthTopic(api, A, B); if (ht) add(ht.w, ht.fn);
  add(A.job && age >= 14 ? 1.2 : 0, topicWork);
  add(age >= 14 ? 0.4 + Math.abs(api.priceRatio('bread', A.s) - 1) * 3 + (api.householdMoney(A) < 20 ? 1.2 : 0) : 0, topicEconomy);
  add(age >= 16 ? A.values.family * 1.2 : 0.3, topicFamily);
  add(0.5 + A.values.family * 0.4, topicAncestor);
  add(0.25, topicChronicle);
  const gos = freshGossip(api, A, B);
  add(gos.length ? 1.2 + A.pers.E * 1.5 + (A.pers.A < 0.45 ? 0.8 : 0) : 0, (a1, a2, a3, v) => topicGossip(a1, a2, a3, v, gos));
  const aboutB = recentAbout(api, A, B);
  add(aboutB ? 3 : 0, (a1, a2, a3, v) => topicAboutYou(a1, a2, a3, v, aboutB));
  add(A.pers.O * 0.6, topicDream);
  add(0.5, topicChildhood);
  add(A.pers.O > 0.68 ? 0.25 : 0.03, topicWonder);
  const grief = A.memories.find((m) => m.k === 'death' && api.today - m.t < 15 && m.src === 'self');
  add(grief ? 3 : 0, (a1, a2, a3, v) => topicGrief(a1, a2, a3, v, grief));
  const rel = api.rel(A, B);
  const canRomance = age >= 17 && api.ageOf(B) >= 17 && A.spouseId == null && B.spouseId == null && A.sex !== B.sex && rel.a > 45 && !api.isKin(A, B) && Math.abs(age - api.ageOf(B)) < 14;
  add(canRomance ? 1.2 + rel.a / 50 + (100 - n.lust) / 50 : 0, topicRomance);
  add(A.spouseId != null && n.lust < 40 && age >= 18 ? 0.7 : 0, topicIntimacy);
  add(Math.abs(A.mood - 50) > 25 ? 0.8 : 0, topicMood);
  add(0.4, topicOpinion);
  if (age < 13) add(2, topicPlay);
  add(D && D.active ? 2.2 : D && api.today >= D.awakenDay - 3 ? 1.2 : 0, topicDemon);
  add(api.kingdomOf(A)?.war ? 2.2 : 0, topicWar);
  const sight = A.memories.filter((m) => m.k === 'sight' && api.today - m.t < 6);
  add(sight.length ? 1.8 : 0, (a1, a2, a3, v) => topicSighting(a1, a2, a3, v, sight));
  const dangerKeys = Object.entries(A.danger || {}).filter(([, v]) => v > 2);
  add(dangerKeys.length ? 1 + A.pers.A : 0, (a1, a2, a3, v) => topicDanger(a1, a2, a3, v, dangerKeys));
  const crime = A.memories.filter((m) => ['theft', 'robbed', 'crime'].includes(m.k) && api.today - m.t < 8 && m.src === 'self');
  add(crime.length ? 1.6 : 0, (a1, a2, a3, v) => topicCrime(a1, a2, a3, v, crime));
  const brag = A.memories.filter((m) => ['hunt', 'quest', 'discovery', 'hero', 'justice', 'trade'].includes(m.k) && m.emo > 0 && api.today - m.t < 10);
  add(brag.length ? (100 - n.esteem) / 25 + 0.6 : 0, (a1, a2, a3, v) => topicBoast(a1, a2, a3, v, brag));
  add(['scholar', 'wizard'].includes(A.job) ? 1.4 : 0.15, topicResearch);
  const k = api.kingdomOf(A);
  add(age >= 16 && k && A.rank !== 'king' && B.rank !== 'king' ? 0.6 + (k.tax > 0.08 ? 1 : 0) : 0, topicKing);
  add(B.rank === 'king' && A.rank !== 'king' && age >= 16 ? 2.5 : 0, topicPetition);
  add(A.rank === 'king' ? 2 : 0, topicRule);
  add(['wanderer', 'bard', 'merchant'].includes(A.job) ? 1.4 : 0, topicTravel);
  add(A.treasures?.length ? 1 + (100 - n.esteem) / 40 : 0, topicTreasure);
  add(api.S.culture[A.s]?.length ? 0.6 : 0, topicSaying);
  add(A.jail != null ? 4 : 0, topicJail);
  add(A.rank === 'homeless' && api.householdMoney(B) > 20 ? 2.5 : 0, topicBeg);
  add(A.rank === 'noble' && (RANKS[B.rank]?.lv ?? 4) < 6 ? 1 : 0, topicNoble);
  add(api.hh(A)?.refugee != null ? 2.5 : 0, topicRefugee);
  add(api.living().some((p) => p.hero && p.id !== A.id) ? 0.4 : 0, topicHero);
  add(n.sloth < 30 ? 1 : 0, topicSloth);
  add(n.pleasure < 30 ? 1 : 0, topicPleasure);
  return list;
}

function freshGossip(api, A, B) {
  return A.memories.filter((m) => m.g && m.g.subj !== B.id && !(B.gk && B.gk[m.g.key]) && api.today - m.t < 12 && api.person(m.g.subj));
}
function recentAbout(api, A, B) {
  return A.memories.find((m) => m.g && m.g.subj === B.id && api.today - m.t < 10 && m.g.congrat);
}

export function pickTopic(api, A, B, v) {
  const list = topics(api, A, B);
  const t = api.rng.weighted(list, (x) => x.w);
  return t ? t.fn(api, A, B, v) : topicWeather(api, A, B, v);
}

// ---- 各話題 ----
function topicNeed(api, A, B, v) {
  const [need] = Object.entries(A.needs).sort((x, y) => x[1] - y[1])[0];
  const R = api.rng;
  const t = {
    hunger: [['朝から何も食べてなくて、腹が鳴りっぱなし', 'n'], ['お腹がすいて力が出ない', 'v'], ['パンのにおいがすると、たまらなくなる', 'v']],
    sleep: [['昨日はあまり眠れなかった', 'v'], ['くたくたで、立ったまま眠れそう', 'n'], ['まぶたが重い', 'v']],
    survival: [['最近、夜道を歩くのが怖い', 'v'], ['魔物の噂を聞くたびに胸がざわつく', 'v'], ['戸締まりを二度も確かめてしまった', 'v']],
    lust: [['ひとり寝の夜は、どうにも長い', 'v'], ['誰かにそばにいてほしい夜もある', 'v']],
    sloth: [['今日はもう何もしたくない', 'v'], ['一日じゅう寝転がっていたい', 'v']],
    pleasure: [['毎日同じことの繰り返しで、ちょっと退屈', 'n'], ['何か面白いことでもないかな', 'raw']],
    esteem: [['誰も{me}の苦労なんてわかっちゃくれない', 'v'], ['たまには誰かに褒められたい', 'v']],
  }[need];
  const [body, kind] = R.pick(t);
  return { kind: 'complain', text: kind === 'raw' ? v.s(body, 'raw') + '……' : v.s(body, kind), sentiment: -0.4 };
}

function topicWeather(api, A, B, v) {
  const R = api.rng, w = api.weather(A), season = api.season();
  const s = api.townOf(A);
  const hot = s.kingdom === 2;
  const opts = {
    sunny: hot ? [['今日も焼けつくような日差し', 'n'], ['砂が熱くて、裸足じゃ歩けない', 'v']] : [['いい天気', 'n'], [`${season}の日差しは気持ちいい`, 'v'], ['こんな日は外で昼寝したい', 'v']],
    cloudy: [['空がどんよりしてる', 'v'], ['雲が厚い。夕方には降るかも', 'raw']],
    rain: [['よく降る', 'v'], ['雨で道がぬかるんで歩きにくい', 'v'], ['この雨で麦がよく育つといいけど', 'raw']],
    snow: [['雪が積もってきた', 'v'], ['寒さが骨までしみる', 'v'], ['薪が足りるか心配', 'n']],
  }[w];
  const [body, kind] = R.pick(opts);
  if (kind === 'raw') return { kind: 'weather', text: v.s(body, 'raw') + v.end(), sentiment: 0 };
  return { kind: 'weather', text: v.s(body, kind), sentiment: w === 'sunny' ? 0.3 : -0.1 };
}

const JOB_LINES = {
  farmer: [['麦の芽がそろってきた', 'v'], ['畑の雑草がすぐ伸びる', 'v'], ['雨がもう少し欲しい', 'v'], ['刈り入れの季節は腰が痛くなる', 'v']],
  rancher: [['うちの牛がまた柵を越えて逃げた', 'v'], ['子羊が三頭も生まれた', 'v'], ['夜に狼の遠吠えがすると、羊が落ち着かない', 'v']],
  hunter: [['森の奥でシカの足跡を追った', 'v'], ['今日はウサギ一羽だけ', 'n'], ['クマの爪あとを見つけた。近くにいる', 'v']],
  baker: [['朝から窯の前に立ちっぱなし', 'n'], ['今朝のパンはよく膨らんだ', 'v'], ['小麦の値が上がると、うちも苦しい', 'v']],
  fisher: [['北の浜で、けっこう大きいのがかかった', 'v'], ['最近は魚が警戒してて、なかなか釣れない', 'v'], ['朝もやの海は、きれい', 'n']],
  sailor: [['沖でクジラの潮吹きを見た', 'v'], ['嵐の晩は、生きた心地がしない', 'v'], ['次の航海では海の向こうまで行ってみたい', 'v']],
  woodcutter: [['森の奥のカシの木は、斧がはね返るほど硬い', 'v'], ['冬に向けて薪をたくさん割っておかないと', 'raw']],
  miner: [['鉱山の奥は真っ暗で、ランプの油がすぐ切れる', 'v'], ['今日は鉄の筋のいいところを掘り当てた', 'v'], ['坑道の奥で妙な音がした', 'v']],
  smith: [['鍬の刃を三本も打ち直した', 'v'], ['鉄を打つ音を聞くと落ち着く', 'v'], ['剣の注文が増えた。物騒な世の中', 'n']],
  carpenter: [['梁がゆるんでた家を直してきた', 'v'], ['いい木目の板が手に入った', 'v']],
  tailor: [['貴族さまの礼服を仕立ててる。袖ひとつに三日かかる', 'v'], ['いい布が手に入らない', 'v']],
  innkeeper: [['昨夜は遅くまで客がいて寝不足', 'n'], ['旅の商人が妙な噂を置いていった', 'v'], ['麦酒の仕込みがうまくいった', 'v']],
  merchant: [['よその町では値段がまるで違う。商売はそこが面白い', 'v'], ['街道の盗賊のせいで、遠回りばかり', 'n']],
  servant: [['お城の廊下は長すぎて、磨いても磨いても終わらない', 'v'], ['王家の方々のお食事の支度で朝から大忙し', 'n']],
  priest: [['最近、祈りに来る人が増えた気がする', 'v'], ['次の安息日の説教をまだ考えてる', 'v']],
  elder: [['村の蓄えの帳簿を見てたら、頭が痛くなった', 'v'], ['収穫祭の段取りを考えないと', 'raw']],
  knight: [['朝の鍛錬で剣を千回振った', 'v'], ['王家に忠誠を誓った身。命は惜しくない', 'n'], ['見回りの途中で怪しい者を見かけた', 'v']],
  soldier: [['槍の稽古で手の皮がむけた', 'v'], ['兵舎の飯はまずい', 'v'], ['いつ出陣の命令が下るか、落ち着かない', 'v']],
  guard: [['今夜も門番。あくびが止まらない', 'n'], ['お尋ね者の手配書がまた増えた', 'v']],
  jailer: [['牢の連中は、みんな自分は悪くないと言う', 'v'], ['鍵の束が重くて肩がこる', 'v']],
  wizard: [['新しい呪文の詠唱を覚えた', 'v'], ['魔力の流れが最近おかしい。魔界のせい', 'n']],
  scholar: [['星の動きを三晩続けて記録した', 'v'], ['古文書の一節がどうしても読み解けない', 'v']],
  adventurer: [['ギルドの掲示板に新しい依頼が貼られてた', 'v'], ['{me}もいつか名のある冒険者になる', 'v']],
  bard: [['新しい歌を作った。今夜酒場で歌う', 'v'], ['古い英雄の歌は、どこへ行っても喜ばれる', 'v']],
  wanderer: [['次はどの町へ行こうか', 'raw'], ['歩いた道の数だけ、知らない話がある', 'v']],
  thief: [['……最近、衛兵の見回りが増えた', 'v'], ['金持ちの屋敷は裏口の鍵が甘い', 'v']],
  beggar: [['今日はまだ一枚も恵んでもらってない', 'v'], ['冷たい石畳で寝るのは、もう慣れた', 'v']],
  chancellor: [['陛下に進言した策が通った', 'v'], ['隣国の使者との交渉は骨が折れる', 'v']],
  treasurer: [['国庫の帳尻を合わせるのに三晩かかった', 'v'], ['税を上げれば民が泣き、下げれば兵が泣く', 'n']],
  general: [['兵の士気を保つのが将の務め', 'n'], ['次の戦に備えて、陣形を練り直している', 'v']],
  royalguard: [['陛下のおそばを離れるわけにはいかない', 'v'], ['城門の警備は一瞬も気が抜けない', 'v']],
  courtmage: [['王家の星占いは、近ごろ不吉な相が出ている', 'v'], ['宮廷の結界を張り直した', 'v']],
  butler: [['お城の銀器を磨き終えた', 'v'], ['晩餐会の段取りで頭がいっぱい', 'n']],
  maid: [['お城の廊下は長すぎて、磨いても磨いても終わらない', 'v'], ['姫さまの髪を結うのは、わたしの役目', 'n']],
  cook: [['今夜の晩餐は、鹿肉の香草焼き', 'n'], ['陛下はにんじんがお嫌い。内緒', 'n']],
  gardener: [['お城の薔薇がやっと咲いた', 'v'], ['庭木の剪定で腕がぱんぱん', 'n']],
  jester: [['陛下を笑わせるのは、魔王を倒すより難しい', 'v'], ['新しい芸を考えた。見てて', 'raw']],
  doctor: [['今日は熱を出した子を三人診た', 'v'], ['薬草が足りない', 'v'], ['手を洗うだけで病はずいぶん防げる', 'v']],
  herbalist: [['森で珍しい薬草を見つけた', 'v'], ['この薬は苦いけど、よく効く', 'v']],
  midwife: [['ゆうべ、元気な赤ん坊を取り上げた', 'v'], ['この町の子の半分は、わたしが取り上げた', 'n']],
  teacher: [['子どもたちが文字を覚えてくれるのが何よりの喜び', 'n'], ['いたずら小僧に手を焼いている', 'v']],
  scribe: [['王の布告を百枚も書き写した', 'v'], ['年代記に今日の出来事を書き留めておいた', 'v']],
  changer: [['よその国の金貨は、重さを量らないと信用できない', 'v'], ['金は天下の回りもの', 'n']],
  butcher: [['今日は上等なあばら肉が入った', 'v'], ['包丁を研ぐのが朝の日課', 'n']],
  brewer: [['今年の麦酒は、いい出来', 'n'], ['樽の中で酒が歌ってる', 'v']],
  cobbler: [['旅人の靴は底がすぐ減る', 'v'], ['いい革が手に入った', 'v']],
  potter: [['窯から出すまでは、どう焼けるかわからない', 'v'], ['ろくろを回していると、無心になれる', 'v']],
  weaver: [['機を織る音は子守歌みたい', 'n'], ['新しい柄を考えた', 'v']],
  jeweler: [['この宝石は王妃さまの首飾りになる', 'v'], ['石は磨けば必ず光る', 'v']],
  alchemist: [['鉛を金に変える日は、もうすぐ', 'n'], ['昨日の実験で眉毛が焦げた', 'v']],
  fortune: [['あなたの未来に、大きな出会いが見える', 'v'], ['星が騒がしい。何かが起きる', 'v']],
  painter: [['夕焼けの色がどうしても出せない', 'v'], ['王さまの肖像画を頼まれた', 'v']],
  musician: [['新しい曲ができた', 'v'], ['リュートの弦が切れた', 'v']],
  dancer: [['今夜も酒場で踊る', 'v'], ['足が棒みたい', 'n']],
  stablehand: [['王さまの白馬は気位が高い', 'v'], ['馬の機嫌は天気で変わる', 'v']],
  messenger: [['隣町まで一日で走った', 'v'], ['知らせを運ぶのが{me}の仕事', 'n']],
  watchman: [['夜の町は、昼とは別の顔をしてる', 'v'], ['ゆうべ怪しい影を見た', 'v']],
  gravedigger: [['墓地は静かでいい', 'v'], ['今年は墓を掘る数が多い', 'v']],
  laundress: [['川の水が冷たくて手がかじかむ', 'v'], ['貴族の服は洗うのに気を使う', 'v']],
  nanny: [['子どもたちの寝かしつけがひと苦労', 'n'], ['この家の子は、わが子同然', 'n']],
  barber: [['ひげを剃りながら聞く噂話が一番面白い', 'v'], ['今日は十人も散髪した', 'v']],
  storyteller: [['昔話を子どもたちに聞かせるのが楽しみ', 'n'], ['この話は、わしのじいさまから聞いたもの', 'n']],
  nun: [['祈りと奉仕の毎日', 'n'], ['病の人の手を握っていた', 'v']],
  shepherd: [['羊の数を数えていたら眠くなった', 'v'], ['牧羊犬がいなかったら、羊はとっくに散り散り', 'n']],
  beekeeper: [['蜂に三か所刺された', 'v'], ['今年のはちみつは花の香りが強い', 'v']],
  miller: [['風が強いと粉ひきがはかどる', 'v'], ['風車の羽根を修理した', 'v']],
  charcoal: [['炭焼き小屋の煙で目がしみる', 'v'], ['いい炭は鍛冶屋が喜ぶ', 'v']],
  mason: [['石を積むのは根気の仕事', 'n'], ['城壁の修理を頼まれた', 'v']],
  gatherer: [['森の奥に薬草の群生地を見つけた', 'v'], ['毒草と薬草は見分けが難しい', 'v']],
  captain: [['次の航海は東の島まで', 'n'], ['船乗りは海に嘘をつかない', 'v']],
  shipwright: [['新しい船の竜骨を組んでいる', 'v'], ['いい船はいい木から', 'n']],
  keeper: [['灯台の火は一晩も絶やせない', 'v'], ['嵐の夜は灯台が揺れる', 'v']],
  diver: [['海の底で大きな真珠貝を見つけた', 'v'], ['息を止めるのは得意', 'n']],
  pirate: [['海は誰のものでもない', 'n'], ['次の獲物は商船', 'n']],
  smuggler: [['……荷のことは聞かないでくれ', 'raw'], ['関所の役人は鼻薬がよく効く', 'v']],
  warrior: [['剣の腕なら誰にも負けない', 'v'], ['昨日の傷がまだうずく', 'v']],
  archer: [['百歩先の林檎も射抜ける', 'v'], ['弓の弦を張り替えた', 'v']],
  cleric: [['仲間の傷を癒やすのが{me}の役目', 'n'], ['神のご加護があらんことを', 'raw']],
  sage: [['知恵は剣より強い', 'n'], ['古文書に魔王の弱点が書かれていた', 'v']],
  paladin: [['聖なる誓いにかけて、民を守る', 'v'], ['魔を討つのが聖騎士の務め', 'n']],
  guildmaster: [['腕のいい冒険者が減った', 'v'], ['賞金首の手配書を貼り替えた', 'v']],
  banditchief: [['手下どもを食わせるのも楽じゃない', 'n'], ['次の獲物は決まってる', 'v']],
  pickpocket: [['……今日は人出が多い', 'v']],
  swindler: [['このお守りを持てば、幸運間違いなし', 'n'], ['あなただけに特別な話がある', 'v']],
  king: [['国の舵取りは、思うようにはいかぬもの', 'n'], ['民の暮らしが気がかり', 'n']],
  royal: [['城の外の暮らしを見てみたい', 'v'], ['礼儀作法の稽古はうんざり', 'n']],
  noble: [['舞踏会の招待状がまた届いた', 'v'], ['領地の収穫が落ちて、実入りが減った', 'v']],
};
function topicWork(api, A, B, v) {
  const R = api.rng;
  const lines = JOB_LINES[A.job] || [['毎日なにかと忙しい', 'v']];
  if (A.job === 'thief' && B.job !== 'thief') return topicWeather(api, A, B, v);
  const [body, kind] = R.pick(lines);
  if (kind === 'raw') return { kind: 'work', text: v.s(body, 'raw') + v.end(), sentiment: 0.1 };
  return { kind: 'work', text: v.s(body, kind), sentiment: 0.1 };
}

function topicEconomy(api, A, B, v) {
  const R = api.rng;
  const r = api.priceRatio('bread', A.s);
  const money = api.householdMoney(A);
  if (money < 20 && R.chance(0.6)) {
    const [b, k] = R.pick([['今月は財布がすっからかん', 'n'], ['このままじゃ冬を越せるかどうか', 'raw'], ['子どもたちに腹いっぱい食べさせてやりたい', 'v']]);
    return { kind: 'complain', text: k === 'raw' ? v.s(b, 'raw') + '……' : v.s(b, k), sentiment: -0.6 };
  }
  if (r > 1.25) return { kind: 'complain', text: v.s(`パンが${api.price('bread', A.s)}銅貨もするなんて、ひどい話`, 'n'), sentiment: -0.5 };
  if (r < 0.8) return { kind: 'good', text: v.s('最近はパンが安くて助かる', 'v'), sentiment: 0.4 };
  if (money > 250) return { kind: 'good', text: v.s(R.pick(['おかげさまで、うちはなんとかやれてる', '今年は少し蓄えができた']), 'v'), sentiment: 0.4 };
  if (api.priceRatio('weapons', A.s) > 1.4) return { kind: 'neutral', text: v.s('剣の値段が跳ね上がってる。物騒な証拠', 'n'), sentiment: -0.2 };
  return { kind: 'neutral', text: v.s('市場の値段は、まあ落ち着いてる', 'v'), sentiment: 0 };
}

function topicFamily(api, A, B, v) {
  const R = api.rng;
  const kids = A.children.map((id) => api.person(id)).filter((c) => c && c.deathYear == null);
  const sp = A.spouseId != null ? api.person(A.spouseId) : null;
  const opts = [];
  for (const c of kids) {
    const a = api.ageOf(c);
    if (a < 1) opts.push([`${c.given}が生まれてから、毎日があっという間`, 'n']);
    else if (a < 14) opts.push([`うちの${c.given}ももう${a}歳。あっという間`, 'n']);
    if (a < 8) opts.push([`${c.given}が夜泣きして、ゆうべはほとんど寝てない`, 'v']);
    if (a >= 14 && c.job) opts.push([`${c.given}が${JOBS[c.job].name}として一人前になってきた`, 'v']);
    if (c.jail != null) opts.push([`${c.given}が牢に入れられて、夜も眠れない`, 'v']);
  }
  if (sp) {
    const rel = api.rel(A, sp).a;
    if (rel > 55) opts.push([`${sp.given}の作るスープが、世界で一番うまい`, 'v'], [`${sp.given}がいなかったら、{me}はとっくにだめになってた`, 'v']);
    else if (rel < 15) opts.push([`${sp.given}とはこのところ口をきいてない`, 'v'], [`${sp.given}とまたつまらないことで言い合いになった`, 'v']);
    else opts.push([`${sp.given}と市場で何を買うかでもめた`, 'v']);
    if (sp.mission?.type === 'march') opts.push([`前線に行った${sp.given}のことが心配でたまらない`, 'v']);
  }
  const high = ['royal', 'noble'].includes(v.style);
  for (const par of [api.person(A.motherId), api.person(A.fatherId)]) if (par && par.deathYear == null) {
    const t = high ? (par.sex === 'm' ? '父上' : '母上') : v.style === 'child' ? (par.sex === 'm' ? 'お父さん' : 'お母さん') : v.style === 'polite' ? (par.sex === 'm' ? '父' : '母') : par.sex === 'm' ? '親父' : 'お袋';
    opts.push(api.ageOf(par) > 62 ? [`${t}が最近、腰が痛いってこぼしてる`, 'v'] : [`${t}にまた小言を言われた`, 'v']);
  }
  if (!opts.length) return topicAncestor(api, A, B, v);
  const [body, kind] = R.pick(opts);
  return { kind: 'family', text: v.s(body, kind), sentiment: 0.2 };
}

function deadAncestors(api, A) {
  const out = [];
  for (const [id, d] of api.ancestors(A)) {
    const p = api.person(id);
    if (p && p.deathYear != null && d <= 6) out.push({ p, d });
  }
  return out;
}

function topicAncestor(api, A, B, v) {
  const R = api.rng;
  const anc = deadAncestors(api, A);
  if (!anc.length) return topicChildhood(api, A, B, v);
  const withSaying = anc.filter((x) => x.p.saying && x.d <= 3);
  const famous = anc.filter((x) => x.p.hero || x.p.monarchOf != null);
  const withDeed = anc.filter((x) => x.p.deeds.length);
  const term = (x) => casualKin(api.kinTerm(A, x.p) || 'ご先祖', v.style === 'child');
  if (famous.length && R.chance(0.5)) {
    const x = R.pick(famous);
    return { kind: 'story', text: v.s(`{me}の${term(x)}の${x.p.given}は、${x.p.deeds[0]}んだって`.replace('だったんだって', 'だったんだって'), 'raw') + '。' + (x.p.hero ? '' : ''), sentiment: 0.5, about: [x.p.id] };
  }
  if (withSaying.length && R.chance(0.45)) {
    const x = R.pick(withSaying);
    return { kind: 'story', text: v.s(`死んだ${term(x)}がよく言ってた。『${x.p.saying}』って`, 'raw') + '。', sentiment: 0.2, about: [x.p.id] };
  }
  const x = R.pick(withDeed.length ? withDeed : anc);
  const deed = x.p.deeds.length ? R.pick(x.p.deeds) : `${x.p.deathYear}年に亡くなった`;
  if (x.d >= 3) return { kind: 'story', text: v.s(`${term(x)}の${x.p.given}は、${deed}らしい`, 'v'), sentiment: 0.3, about: [x.p.id] };
  return { kind: 'story', text: v.s(`${term(x)}の${x.p.given}は、${deed}`, 'v'), sentiment: 0.3, about: [x.p.id] };
}

function topicChronicle(api, A, B, v) {
  const R = api.rng;
  const ev = R.pick(api.chronicle().filter((c) => c.y > 0 && c.y < api.year() - 3 && !/人が生まれ/.test(c.text)));
  if (!ev) return topicWeather(api, A, B, v);
  const ago = api.year() - ev.y;
  return { kind: 'story', text: v.s(`${ago}年前、${ev.text}って。${ago > 80 ? 'ご先祖さまの時代の話' : '年寄りから聞いた話'}`, 'n'), sentiment: 0.1 };
}

function topicGossip(api, A, B, v, gos) {
  const R = api.rng;
  const m = R.pick(gos);
  const subj = api.person(m.g.subj);
  const op = v.r({ polite: 'ご存じですか？', elder: '聞いたかね？', rough: 'なあ、聞いたか？', child: 'ねえねえ、知ってる？', plain: ['ねえ、聞いた？', 'そういえば、'], royal: '聞いておるか。', noble_f: 'お聞きになって？', noble_m: '聞いたかね。', knight: 'ご報告します。', sage: '耳に入っているかね。' });
  const kin = api.kinTerm(A, subj);
  const who = kin ? `うちの${kin}の${subj.given}` : subj.given;
  const tail = { polite: 'そうですよ。', elder: 'そうじゃ。', rough: 'ってよ。', royal: 'そうじゃ。', noble: A.sex === 'f' ? 'そうですわ。' : 'そうだ。', knight: 'とのことであります。', sage: 'そうだ。' }[v.style] || 'んだって。';
  // 述語がもともと「らしい」で終わっていれば、伝聞の語尾を重ねない
  const pred = m.g.pred.replace(/らしい$/, '');
  const hedged = pred !== m.g.pred;
  const tail2 = hedged ? ({ polite: 'らしいですよ。', elder: 'らしいのう。', rough: 'らしいぜ。', royal: 'らしい。', noble: A.sex === 'f' ? 'らしいですわ。' : 'らしい。', knight: 'らしいとのことであります。', sage: 'らしい。' }[v.style] || 'らしいよ。') : tail;
  return { kind: 'gossip', text: `${op}${who}が${pred}${tail2}`, sentiment: m.g.emo, gossip: m, about: [subj.id] };
}

function topicAboutYou(api, A, B, v, m) {
  const text = m.g.emo >= 0
    ? v.r({ polite: `${m.g.congrat}、おめでとうございます。`, elder: `${m.g.congrat}、めでたいのう。`, rough: `${m.g.congrat}、めでてえな！`, child: `${m.g.congrat}、おめでとう！`, plain: `${m.g.congrat}、おめでとう。`, royal: 'めでたいことじゃ。祝いを取らせよう。', noble_f: `${m.g.congrat}、おめでとうございますわ。` })
    : v.r({ polite: `${m.g.congrat}……お力落としのないように。`, elder: `${m.g.congrat}……つらいのう。`, rough: `${m.g.congrat}……元気出せよ。`, child: `${m.g.congrat}……だいじょうぶ？`, plain: `${m.g.congrat}……大丈夫？` });
  return { kind: 'aboutyou', text, sentiment: m.g.emo, about: [B.id] };
}

function topicDream(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([[`いつか${A.dream}のが夢`, 'n'], [`笑わないで聞いて。${A.dream}って決めてる`, 'v'], [`${A.dream}までは、死ねない`, 'raw']]);
  if (t[1] === 'raw') return { kind: 'dream', text: v.s(t[0], 'raw') + (v.style === 'polite' ? 'と思っています。' : '。'), sentiment: 0.4 };
  return { kind: 'dream', text: v.s(t[0], t[1]), sentiment: 0.4 };
}

function topicChildhood(api, A, B, v) {
  const R = api.rng;
  const mems = A.memories.filter((m) => m.src === 'self' && api.today - m.t > 40 && m.ageAt != null && m.ageAt < 16 && !m.g);
  const shared = mems.filter((m) => m.sh && m.about && m.about.includes(B.id));
  const m = shared.length && R.chance(0.7) ? R.pick(shared) : mems.length ? R.pick(mems) : null;
  if (!m) return topicWeather(api, A, B, v);
  if (m.sh && m.about && m.about.includes(B.id)) return { kind: 'memory', text: v.fill(`覚えてる？ ${m.ageAt}歳のころ、一緒に${m.sh}こと。`), sentiment: 0.5, about: [B.id], shared: true };
  return { kind: 'memory', text: v.s(`${m.ageAt}歳のころ、${m.txt}`, 'v'), sentiment: m.emo };
}

function topicWonder(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([
    ['ときどき思う。昨日の自分と今日の自分は、本当に同じなのかって', 'raw'],
    ['夢の中で、誰かにずっと見られている気がした', 'v'],
    ['海の向こうの、そのまた向こうには何があるんだろう', 'raw'],
    ['ご先祖さまたちも、この同じ空を見上げてたと思うと、不思議な気がする', 'v'],
    ['子どものころの記憶って、どこまでが本当なんだろう', 'raw'],
    ['星って、誰かが夜ごとに灯してるみたい', 'n'],
    ['この世界の果てには、壁でもあるのかな', 'raw'],
  ]);
  return { kind: 'wonder', text: t[1] === 'raw' ? v.s(t[0], 'raw') + '。' : v.s(t[0], t[1]), sentiment: 0 };
}

function topicGrief(api, A, B, v, m) {
  const who = m.txt.split('が')[0];
  return { kind: 'grief', text: v.s(`${who}がいなくなって、家の中が静かすぎる`, 'v'), sentiment: -0.8 };
}

function topicRomance(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([['{you}と話してると、時間を忘れる', 'v'], ['{you}の笑った顔、好き', 'n'], ['{you}のことを考えると、夜も眠れない', 'v']]);
  const text = R.chance(0.3) ? v.s('今度の祭り、一緒に踊ってくれる', 'qn') : v.s(t[0], t[1]);
  return { kind: 'romance', text, sentiment: 0.8 };
}
function topicIntimacy(api, A, B, v) {
  const sp = api.person(A.spouseId);
  if (!sp) return topicWeather(api, A, B, v);
  return { kind: 'good', text: v.s(api.rng.pick([`今夜は早く帰って、${sp.given}とゆっくり過ごしたい`, `${sp.given}の顔が早く見たい`]), 'v'), sentiment: 0.4 };
}

function topicMood(api, A, B, v) {
  if (A.mood > 70) return { kind: 'good', text: v.s(api.rng.pick(['今日はなんだか気分がいい', '朝から何もかもうまくいく']), 'v'), sentiment: 0.5 };
  return { kind: 'complain', text: v.s(api.rng.pick(['このところ、どうも気が晴れない', 'なんだか、何をしてもうまくいかない']), 'v'), sentiment: -0.5 };
}

function topicOpinion(api, A, B, v) {
  const R = api.rng;
  const cands = Object.entries(A.rel).filter(([id, r]) => +id !== B.id && Math.abs(r.a) > 40 && api.person(+id) && api.person(+id).deathYear == null);
  if (!cands.length) return topicWeather(api, A, B, v);
  const [id, r] = R.pick(cands);
  const q = api.person(+id);
  const [b, k] = r.a > 0 ? R.pick([[`${q.given}は本当にいい人`, 'n'], [`${q.given}には何度も助けられた`, 'v']]) : R.pick([[`${q.given}のことは、どうも好きになれない`, 'v'], [`${q.given}はいつも自分のことばかり`, 'n']]);
  return { kind: 'opinion', text: v.s(b, k), sentiment: r.a > 0 ? 0.4 : -0.4, about: [q.id] };
}

function topicPlay(api, A, B, v) {
  const t = api.rng.pick([['いっしょに川まで競争しよう', 'raw'], ['大きな木にカブトムシがいた', 'v'], ['お城のてっぺんには幽霊がいる', 'v'], ['大きくなったら勇者になる', 'n'], ['スライムって、さわるとぷにぷにしてるんだって', 'v']]);
  return { kind: 'play', text: t[1] === 'raw' ? v.fill(t[0]) + '！' : v.s(t[0], t[1]), sentiment: 0.5 };
}

function topicDemon(api, A, B, v) {
  const D = api.S.demon, R = api.rng;
  if (!D.active) return { kind: 'demon', text: v.s('魔界のほうの空が赤いって噂、聞いた', 'qv'), sentiment: -0.5 };
  const party = api.S.parties.find((p) => !p.done);
  const hero = party && party.members.map((id) => api.person(id)).find((h) => h && h.deathYear == null);
  if (hero && !A._heroTold && R.chance(0.2)) return { kind: 'demon', text: (A._heroTold = true, v.s(`勇者${hero.given}さまたちが魔王城へ向かったらしい。どうかご無事で`, 'raw') + '。'), sentiment: 0.3 };
  if (A.values.courage > 0.7 && api.ageOf(A) >= 16) return { kind: 'demon', text: v.s(`{me}も剣が使えたら、${D.name}の軍勢と戦いたい`, 'v'), sentiment: 0.1 };
  const occ = api.S.world.settlements.find((s) => api.S.towns[s.id].occupied);
  if (occ && R.chance(0.5)) return { kind: 'demon', text: v.s(`${occ.name}が魔王軍に奪われたなんて、信じられない`, 'raw') + '……', sentiment: -0.8 };
  return { kind: 'demon', text: v.s(R.pick([`${D.name}が目覚めてから、夜が長く感じる`, '魔王軍がいつここに来るか、考えるだけで震える']), 'v'), sentiment: -0.7 };
}

function topicWar(api, A, B, v) {
  const k = api.kingdomOf(A), R = api.rng;
  const war = k.war;
  if (['soldier', 'knight'].includes(A.job)) return { kind: 'war', text: v.s(R.pick([`${war.name}の前線は地獄`, '明日も前線に立つ。生きて帰れるか']), R.chance(0.5) ? 'n' : 'raw') + (R.chance(0.5) ? '' : ''), sentiment: -0.6 };
  return { kind: 'war', text: v.s(R.pick([`${war.name}はいつ終わるんだろう`, 'また若い者が戦に取られた']), 'raw') + '……', sentiment: -0.7 };
}

function topicSighting(api, A, B, v, sight) {
  const m = api.rng.pick(sight);
  const text = v.s(`${m.txt}。しばらく近づかないほうがいい`, 'v');
  return { kind: 'warning', text, sentiment: -0.4, warning: m.where ? { x: m.where.x, z: m.where.z, v: 2 } : null };
}

function topicDanger(api, A, B, v, keys) {
  const [key, val] = keys.sort((a, b) => b[1] - a[1])[0];
  const x = Math.floor(+key / 100) * 8 + 4, z = (+key % 100) * 8 + 4;
  const place = api.placeName(x, z);
  return { kind: 'warning', text: v.s(`${place}には気をつけて。{me}はあそこで痛い目にあった`, 'v'), sentiment: -0.4, warning: { x, z, v: val } };
}

function topicCrime(api, A, B, v, list) {
  const m = api.rng.pick(list);
  if (m.k === 'crime' && A.job === 'thief') return topicWeather(api, A, B, v);
  return { kind: 'complain', text: v.s(`${m.txt}。ひどい話`, 'n'), sentiment: -0.7 };
}

function topicBoast(api, A, B, v, list) {
  const m = api.rng.pick(list);
  return { kind: 'boast', text: v.s(`聞いて。この前、${m.txt}`, 'v'), sentiment: 0.6 };
}

function topicResearch(api, A, B, v) {
  const k = api.kingdomOf(A), R = api.rng;
  if (['scholar', 'wizard'].includes(A.job) && k) {
    const next = TECHS.filter((t) => !k.techs.includes(t.id))[0];
    if (next) return { kind: 'research', text: v.s(`「${next.name}」の研究が、もう少しで形になりそう`, 'v'), sentiment: 0.4 };
  }
  const last = [...api.S.news].reverse().find((n) => n.text.includes('発見'));
  if (last) return { kind: 'research', text: v.s(`${last.text.split('。')[0]}って。すごい時代`, 'n'), sentiment: 0.4 };
  return topicWeather(api, A, B, v);
}

function topicKing(api, A, B, v) {
  const k = api.kingdomOf(A);
  const king = api.person(k.kingId);
  if (!king) return topicWeather(api, A, B, v);
  const t = king.sex === 'f' ? '女王' : '王';
  const opinion = api.rel(A, king).a - (k.tax > 0.08 ? 20 : 0);
  if (opinion > 10) return { kind: 'king', text: v.s(`${t}の${king.given}さまはよくやってくださってる`, 'v'), sentiment: 0.4, about: [king.id] };
  return { kind: 'king', text: v.s(`${t}さまは、{me}たちの暮らしなんて考えてない`, 'v'), sentiment: -0.5, about: [king.id], treason: true };
}

function topicPetition(api, A, B, v) {
  const k = api.kingdomOf(A);
  const R = api.rng;
  const ask = k.tax > 0.07 ? 'どうか税を少しお下げください' : api.S.demon?.active ? 'どうか魔王軍から民をお守りください' : R.pick(['どうか村に新しい井戸を', 'どうか街道の盗賊を退治してください']);
  return { kind: 'petition', text: v.r({ child: '王さま、あのね……', default: `陛下、恐れながら申し上げます。${ask}。`, polite: `陛下、恐れながら申し上げます。${ask}。` }), sentiment: 0 };
}

function topicRule(api, A, B, v) {
  const k = api.kingdomOf(A), R = api.rng;
  if (k.war) return { kind: 'rule', text: v.s(`${k.war.name}に勝たねばならぬ`, 'n'), sentiment: 0 };
  if (api.S.demon?.active) return { kind: 'rule', text: v.s(`${api.S.demon.name}を討つ者はおらぬのか`, 'raw') + '。', sentiment: -0.3 };
  return { kind: 'rule', text: v.s(R.pick(['民の暮らしを見てまいれ', '国庫の具合はどうなっておる']), 'raw') + '。', sentiment: 0 };
}

function topicTravel(api, A, B, v) {
  const m = A.memories.filter((x) => ['travel', 'trade'].includes(x.k)).pop();
  if (!m) return { kind: 'travel', text: v.s('旅の空の下では、どんな宿も我が家', 'n'), sentiment: 0.3 };
  return { kind: 'travel', text: v.s(`${m.txt}。旅はいい`, 'n'), sentiment: 0.4 };
}

function topicTreasure(api, A, B, v) {
  const t = api.rng.pick(A.treasures);
  return { kind: 'boast', text: v.s(`見て、これが「${t}」。命がけで手に入れた`, 'v'), sentiment: 0.6 };
}

function topicSaying(api, A, B, v) {
  const list = api.S.culture[A.s];
  const e = api.rng.weighted(list, (x) => x.w);
  if (!e) return topicWeather(api, A, B, v);
  return { kind: 'saying', text: v.s(`昔から『${e.text}』って言うでしょう`, 'raw').replace('でしょう', v.style === 'rough' ? 'だろ' : v.style === 'elder' ? 'じゃろう' : v.style === 'royal' ? 'であろう' : 'でしょう') + '。', sentiment: 0.2, saying: e.text };
}

function topicJail(api, A, B, v) {
  return { kind: 'complain', text: v.s(api.rng.pick(['ここから出たら、まともに生きる', '{me}は悪くない。運が悪かっただけ', '石の床は冷たい']), api.rng.chance(0.5) ? 'v' : 'n'), sentiment: -0.6 };
}

function topicBeg(api, A, B, v) {
  return { kind: 'beg', text: v.r({ default: 'どうか、お恵みを……銅貨一枚でいいんです。', child: 'おなかすいたの……なにかちょうだい。', elder: 'どうかお恵みを……年寄りを哀れと思って。' }), sentiment: -0.5 };
}

function topicNoble(api, A, B, v) {
  const [b, k] = api.rng.pick([['庶民の暮らしも、なかなか大変そう', 'n'], ['今度の舞踏会には、王家の方々もいらっしゃる', 'v'], ['身分をわきまえるのが、世の中を丸く収める秘訣', 'n']]);
  return { kind: 'noble', text: v.s(b, k), sentiment: 0 };
}

function topicRefugee(api, A, B, v) {
  const s = api.town(api.hh(A).refugee);
  return { kind: 'complain', text: v.s(`故郷の${s.name}に帰りたい`, 'v'), sentiment: -0.8 };
}

function topicHero(api, A, B, v) {
  const h = api.living().find((p) => p.hero && p.id !== A.id);
  return { kind: 'hero', text: v.s(`勇者${h.given}さまに、いつか会ってみたい`, 'v'), sentiment: 0.5 };
}
function topicSloth(api, A, B, v) { return { kind: 'complain', text: v.s(api.rng.pick(['今日は何もしないで寝ていたい', 'たまには仕事を忘れて、のんびりしたい']), 'v'), sentiment: -0.2 }; }
function topicPleasure(api, A, B, v) { return { kind: 'complain', text: v.s(api.rng.pick(['パーッと飲みに行きたい', 'うまいものをたらふく食べたい', '何か楽しいことがしたい']), 'v'), sentiment: -0.1 }; }

// ---- 返事 ----
export function react(api, B, A, topic, v) {
  const R = api.rng;
  const cr = calendarReact(api, B, A, topic, v); if (cr) return cr;
  const rel = api.rel(B, A);
  const kind = topic.kind;
  if (kind === 'gossip') {
    const known = B.gk && B.gk[topic.gossip.g.key];
    if (known) return { text: v.r({ polite: 'ええ、わたしも伺いました。', elder: 'ああ、その話ならわしも聞いたよ。', rough: 'ああ、知ってる。', child: 'しってるー！', plain: 'うん、その話なら聞いた。', royal: 'うむ、耳に入っておる。' }), da: 0.5 };
    const subj = api.person(topic.gossip.g.subj);
    const sr = api.rel(B, subj).a;
    const surprise = v.r({ polite: 'まあ、本当ですか？', elder: 'ほう、そうかね。', rough: 'マジかよ。', child: 'えーっ、ほんと？', plain: ['えっ、本当？', 'へえ、そうなんだ。'], royal: 'ほう。', noble_f: 'まあ！', knight: 'なんと。' });
    let tail = '';
    if (topic.sentiment > 0.3) tail = sr > -10 ? v.s('それはめでたい', 'v') : v.s('ふうん、あいつがね', 'raw') + '。';
    else if (topic.sentiment < -0.3) tail = sr > 10 ? v.s(`${subj.given}、かわいそうに`, 'raw') + '……' : v.s('まあ、自業自得', 'n');
    return { text: surprise + tail, da: 1.5 };
  }
  if (kind === 'aboutyou') {
    if (topic.sentiment >= 0) return { text: v.r({ polite: 'ありがとうございます。', elder: 'ありがとうよ。', rough: 'へへ、ありがとな。', child: 'ありがとう！', plain: 'ありがとう。うれしい。', royal: 'うむ。' }), da: 4, praise: 10 };
    return { text: v.r({ polite: 'お気遣い、ありがとうございます。', elder: '……ありがとうよ。', rough: '……ああ。ありがとな。', child: '……うん。', plain: '……ありがとう。' }), da: 5 };
  }
  if (kind === 'romance') {
    if (rel.a > 55) return { text: v.r({ polite: '……わたしも、同じことを考えていました。', rough: 'な、何言ってんだよ……でも、悪くねえ。', plain: ['……うん。わたしも。', '……実は、僕もなんだ。'], elder: 'ほほ、若いのう。', child: 'え？', noble_f: '……まあ。わたくしも、ですわ。', noble_m: '……私も同じ気持ちだ。', knight: '……光栄であります。' }), da: 8, romance: true };
    return { text: v.r({ polite: 'え、ええと……。', rough: 'はあ？ 急に何だよ。', plain: 'そ、そう……？', elder: 'ほほ。', child: 'へんなのー。', noble_f: 'お戯れを。' }), da: -1 };
  }
  if (kind === 'wonder') {
    if (B.pers.O > 0.55) return { text: v.s(R.pick(['わかる気がする', '{me}もときどき、そんなふうに思う']), 'v'), da: 2.5 };
    return { text: v.r({ polite: '難しいことをお考えになるんですね。', elder: '考えすぎじゃよ。早く寝なさい。', rough: '何ばかなこと言ってんだ。疲れてんじゃねえか？', child: 'よくわかんない。', plain: '考えすぎだよ。' }), da: 0 };
  }
  if (kind === 'story') {
    const common = topic.about && topic.about.some((id) => api.ancestors(B).has(id));
    if (common) return { text: v.s('その人、{me}のご先祖さまでもある', 'v'), da: 3 };
    return { text: v.r({ polite: ['そのお話、はじめて伺いました。', '昔の方はたくましいですね。'], elder: ['そうじゃったか。昔の者はたくましいのう。'], rough: ['へえ、そんなやつがいたのか。', '昔のやつはすげえな。'], child: ['へえー！', 'すごーい！'], plain: ['へえ、はじめて聞いた。', '昔の人はたくましいね。'], royal: '余も聞いたことがある。' }), da: 1.5 };
  }
  if (kind === 'memory' && topic.shared) return { text: v.s(R.pick(['覚えてる。あのときは大変だった', 'なつかしい']), 'v'), da: 4 };
  if (kind === 'warning') return { text: v.r({ polite: '教えてくださって、ありがとうございます。気をつけます。', rough: 'わかった、気をつける。', plain: 'わかった。気をつけるね。', elder: 'ありがとうよ。気をつけよう。', child: 'こわい……', knight: '見回りを強化します！', royal: '兵を差し向けよう。' }), da: 2.5 };
  if (kind === 'boast') {
    if (B.pers.A > 0.45 || rel.a > 20) return { text: v.r({ polite: 'すごいじゃありませんか！', rough: 'へえ、やるじゃねえか。', plain: ['すごい！ さすが！', '本当に？ すごいね！'], elder: 'たいしたもんじゃ。', child: 'すっごーい！', royal: '見事である。褒めてつかわす。', noble_f: 'まあ、ご立派ですわ。', knight: '見事であります！', sage: 'ほう、たいしたものだ。' }), da: 3, praise: 25 };
    return { text: v.r({ default: 'ふうん。自慢話はもういい。', rough: 'はいはい、すごいすごい。', polite: 'そうですか。' }), da: -2 };
  }
  if (kind === 'petition') {
    if (B.pers.A > 0.5) return { text: v.r({ royal: ['そなたの願い、しかと聞き届けた。考えておこう。', '民の声、胸に刻もう。'] }), da: 3, praise: 10 };
    return { text: v.r({ royal: ['身の程をわきまえよ。', '余に意見するとは、よい度胸じゃ。'] }), da: -6 };
  }
  if (kind === 'beg') {
    if (B.pers.A > 0.55) return { text: v.r({ default: 'ほら、少ないけど取っておいて。', rough: 'ほらよ。これで何か食え。', royal: '誰か、この者に施しを。' }), da: 2, give: true };
    return { text: v.r({ default: '悪いけど、うちも余裕がないの。', rough: 'あっちへ行け。', polite: '申し訳ありません、今は持ち合わせが……' }), da: -1 };
  }
  if (kind === 'king' && topic.treason && ['guard', 'knight', 'soldier'].includes(B.job)) return { text: v.r({ default: 'おい、口を慎め。衛兵の前だぞ。', knight: '陛下を悪く言うことは許さないのであります。' }), da: -4 };
  if (kind === 'saying') { const [b, k] = R.pick([['その言葉、胸にしみる', 'v'], ['{me}もその言葉が好き', 'n'], ['うまいことを言う', 'a']]); return { text: v.s(b, k), da: 2, adopt: true }; }
  if (topic.sentiment < -0.25) {
    if (B.pers.A > 0.5 || rel.a > 30) return { text: v.r({ polite: ['それは大変ですね。', 'おつらいですね。', 'あまりご無理なさらずに。'], elder: ['それは大変じゃのう。', 'つらいのう。'], rough: ['そりゃ大変だな。', 'あんま無理すんなよ。'], child: ['だいじょうぶ？', 'かわいそう……'], plain: ['それは大変だね。', 'つらいね。', 'あんまり無理しないでね。'], royal: '案ずるな。余が何とかしよう。', noble_f: 'お気の毒ですわ。', knight: 'お力になります！', sage: 'それは難儀だな。' }), da: 3 };
    if (B.pers.A < 0.35) return { text: v.r({ polite: ['みなさん同じですよ。', '大変なのはお互いさまです。'], elder: ['わしらの若いころはもっと大変じゃった。', '愚痴を言うても始まらんぞ。'], rough: ['みんな同じだっての。', '甘ったれんな。', 'ぐちぐち言うなよ。'], child: ['ふーん。', 'へんなの。'], plain: ['みんな同じだよ。', 'そんなこと言われても……', 'まあ、がんばるしかないね。'], royal: '甘えるでない。' }), da: -2 };
    return { text: v.s('そうか……', 'raw'), da: 1 };
  }
  if (topic.sentiment > 0.3) {
    if (B.values.ambition > 0.72 && rel.a < 20) return { text: v.s('ふうん。うらやましい', 'a'), da: -0.5 };
    return { text: v.s(R.pick(['それはよかった', 'それはうれしい', 'なんだかこっちまでうれしい']), 'a'), da: 2.5, praise: 6 };
  }
  return { text: v.r({ polite: ['なるほど。', 'そうですね。', 'たしかに、そうかもしれません。'], elder: ['ふむ。', 'そうじゃな。', 'なるほどのう。'], rough: ['ふーん。', 'へえ。', 'そうかよ。'], child: ['ふーん。', 'そうなんだ！'], plain: ['そうだね。', 'なるほど。', 'たしかに。', 'そうかもね。'], royal: ['うむ。', 'さもあろう。'], noble_f: ['そうですの。', 'まあ、そうですわね。'], noble_m: ['なるほど。', 'ふむ。'], knight: ['はっ。', '承知しました。'], sage: ['興味深い。', 'ふむ、なるほど。'] }), da: 1 };
}

// ---- 会話全体（台詞の重複を避ける） ----
function uniqueLine(p, used, gen) {
  let text = gen();
  for (let i = 0; i < 6 && (used.has(text) || (p.recent || []).includes(text)); i++) text = gen();
  used.add(text);
  if (p.recent) { p.recent.push(text); if (p.recent.length > 30) p.recent.shift(); }
  return text;
}

export function composeConversation(api, A, B) {
  const R = api.rng;
  const vA = new Voice(api, A, B), vB = new Voice(api, B, A);
  const lines = [];
  const used = new Set();
  const say = (p, gen) => lines.push({ id: p.id, text: uniqueLine(p, used, gen) });
  const hour = api.hour();
  const relAB = api.rel(A, B);
  const effects = { daA: 0, daB: 0, topics: [], romance: false, argument: false, shared: [], warnings: [], praiseA: 0, praiseB: 0 };

  // 口論
  const quarrel = relAB.a < -15 && (A.pers.N > 0.55 || A.pers.A < 0.4) && R.chance(0.45) && A.rank !== 'king' && B.rank !== 'king';
  if (quarrel) {
    say(A, () => vA.r({ polite: '{you}、ひとこと言わせていただきます。', elder: '{you}、ちょっと待ちなさい。', rough: 'おい、{you}。', child: '{you}のばか！', plain: '{you}、ちょっといい？', noble_f: '{you}、少しよろしくて？' }));
    say(A, () => vA.s(R.pick(['この前のこと、まだ謝ってもらってない', '{you}のそういうところが本当に嫌い', 'いいかげん、人の話を聞いて']), 'n'));
    const back = B.pers.A > 0.6
      ? () => vB.r({ polite: '……申し訳ありませんでした。', elder: 'わかった、わかった。わしが悪かった。', rough: '……悪かったよ。', child: 'ごめん……', plain: '……ごめん。言いすぎた。' })
      : () => vB.r({ polite: 'それはこちらの台詞です。', elder: '年寄りに向かってなんじゃ！', rough: 'うるせえ、お前こそ何様だ！', child: 'そっちこそ！', plain: 'そっちこそ、いいかげんにして！', noble_f: '無礼者！' });
    say(B, back);
    const reconcile = B.pers.A > 0.6;
    effects.daA = reconcile ? 3 : -8; effects.daB = reconcile ? 2 : -10; effects.argument = !reconcile;
    effects.topics.push('quarrel');
    return { lines, effects };
  }

  const firstToday = !(A.talkedToday && A.talkedToday[B.id]);
  if (firstToday) {
    say(A, () => greeting(vA, hour, B));
    if (R.chance(0.7)) say(B, () => greeting(vB, hour, A));
  }
  const turns = 1 + (R.chance(0.35 + (A.pers.E + B.pers.E) / 4) ? 1 : 0) + (R.chance(0.25) ? 1 : 0);
  let speaker = A, listener = B, vs = vA, vl = vB;
  for (let i = 0; i < turns; i++) {
    let topic = null;
    say(speaker, () => { topic = pickTopic(api, speaker, listener, vs); return topic.text; });
    const re = react(api, listener, speaker, topic, vl);
    say(listener, () => re.text);
    effects.topics.push(topic.kind);
    if (topic.gossip) effects.shared.push({ from: speaker.id, to: listener.id, mem: topic.gossip });
    if (topic.warning) effects.warnings.push({ to: listener.id, ...topic.warning });
    if (topic.saying && re.adopt) effects.saying = { from: speaker.id, to: listener.id, text: topic.saying };
    if (re.romance) effects.romance = true;
    if (re.praise) { if (speaker === A) effects.praiseA += re.praise; else effects.praiseB += re.praise; }
    if (re.give) { const coin = 2; const hs = api.hh(speaker), hl = api.hh(listener); if (hl && hs && hl.money > coin) { hl.money -= coin; hs.money += coin; } }
    const compat = 1 - (Math.abs(A.pers.E - B.pers.E) + Math.abs(A.pers.O - B.pers.O) + Math.abs(A.pers.A - B.pers.A)) / 3;
    const d = re.da + (compat - 0.5) * 3;
    if (speaker === A) { effects.daA += d * 0.8; effects.daB += d; } else { effects.daB += d * 0.8; effects.daA += d; }
    [speaker, listener, vs, vl] = [listener, speaker, vl, vs];
  }
  if (R.chance(0.5)) say(speaker, () => vs.r({ polite: ['では、また。', '失礼いたします。'], elder: 'じゃあの。', rough: 'じゃあな。', child: 'またね！', plain: ['じゃあ、また。', 'またね。'], royal: '下がってよい。', noble_f: 'ごきげんよう。', knight: '失礼します！', sage: 'では、また。' }));
  return { lines, effects };
}

// ---- 心の声（独り言） ----
export function innerThought(api, p) {
  const R = api.rng;
  const a = p.action, act = a?.type;
  const low = Object.entries(p.needs).sort((x, y) => x[1] - y[1])[0];
  const sp = p.spouseId != null ? api.person(p.spouseId) : null;
  const opts = [];
  const ct = calendarThought(api, p); if (ct) opts.push(ct);
  for (const t of financeThoughts(api, p)) opts.push(t);
  const cth = careerThought(api, p); if (cth) opts.push(cth);
  opts.push(...underworldThoughts(api, p));
  opts.push(...healthThoughts(api, p));
  const needTxt = { hunger: 'お腹すいたな……', sleep: '眠い……今日は早く寝よう。', survival: '怖い。どこか安全な場所へ……', lust: '誰かのぬくもりが恋しい。', sloth: 'ああ、何もしたくない。', pleasure: 'たまには何か楽しいことがしたい。', esteem: '誰か、{me}のことを認めてくれないかな。' };
  if (low[1] < 30) opts.push(needTxt[low[0]]);
  if (act === 'work') opts.push(`さて、もうひと頑張り。${JOBS[p.job]?.name ?? ''}の仕事は待ってくれない。`);
  if (act === 'sleep') opts.push('（すやすや……）', '（夢を見ている……）');
  if (act === 'pray') opts.push('どうか家族が健やかでありますように。');
  if (act === 'tavern') opts.push('一杯だけ……いや、もう一杯。');
  if (act === 'jail') opts.push('ここから出られたら……。', '石の壁の染みを数えるのにも飽きた。');
  if (act === 'steal') opts.push('……誰にも見られてないな。', '今夜こそうまくやる。');
  if (act === 'rob') opts.push('いいカモが来た。');
  if (act === 'revenge') opts.push('今日こそ、あいつに思い知らせてやる。');
  if (act === 'beg') opts.push('どうか、誰か……。');
  if (act === 'quest') opts.push('名を上げるなら今だ。', '宝はきっとこの先にある。');
  if (act === 'crusade') opts.push('魔王を討つ。そのために、ここまで来た。', '仲間を守り抜く。');
  if (act === 'march') opts.push('生きて帰る。必ず。');
  if (act === 'defend') opts.push('この町は、自分が守る！');
  if (act === 'flee') opts.push('逃げなきゃ……！');
  if (act === 'court' && a.friend != null) { const f = api.person(a.friend); if (f) opts.push(`${f.given}に会いたい。今日こそ話しかけよう。`); }
  if (act === 'trade') opts.push('向こうの町なら高く売れるはずだ。');
  if (act === 'research' || (act === 'work' && ['scholar', 'wizard'].includes(p.job))) opts.push('あと少しで、何かがつかめそうだ。');
  if (sp && act !== 'sleep') opts.push(`${sp.given}は今ごろ何してるかな。`);
  if (api.householdMoney(p) < 20) opts.push('どうやって今月をしのごう……。');
  if (p.revenge != null) { const t = api.person(p.revenge); if (t) opts.push(`${t.given}のことは、決して許さない。`); }
  if (api.S.demon?.active && R.chance(0.3)) opts.push(`${api.S.demon.name}……いつかこの町にも来るのだろうか。`);
  const recent = p.memories.filter((m) => api.today - m.t < 3 && m.imp > 0.4);
  if (recent.length) { const m = R.pick(recent); opts.push(`${m.txt}……。`); }
  if (p.pers.O > 0.7) opts.push(`${p.dream}。いつか、きっと。`);
  const anc = [...api.ancestors(p)].filter(([id, d]) => d <= 2 && api.person(id)?.saying);
  if (anc.length) { const an = api.person(R.pick(anc)[0]); opts.push(`${casualKin(api.kinTerm(p, an), api.ageOf(p) < 13)}がよく言ってたっけ。『${an.saying}』`); }
  if (!opts.length) opts.push('いい一日になりそうだ。');
  return R.pick(opts).replace(/\{me\}/g, firstPerson(p, p.style || 'plain'));
}
