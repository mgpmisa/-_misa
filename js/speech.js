// 言葉の生成エンジン（外部AI・APIを使わない「仮想の心の声」）
// 性格・記憶・人間関係・状況から、その人らしい言葉を組み立てる。
import { casualKin } from './kin.js';
import { JOBS, GOODS, SEASONS } from './data.js';

// ---- 話し方 ----
export function speechStyle(p, age) {
  if (age < 13) return 'child';
  if (age >= 64) return 'elder';
  const { A, C, E } = p.pers;
  if (A > 0.62 && C > 0.55 && E < 0.6) return 'polite';
  if (A < 0.36 || (p.sex === 'm' && E > 0.65 && C < 0.4)) return 'rough';
  return 'plain';
}
export function firstPerson(p, style) {
  const m = p.sex === 'm';
  switch (style) {
    case 'child': return m ? 'ぼく' : 'あたし';
    case 'elder': return m ? 'わし' : 'わたし';
    case 'polite': return m ? '私' : 'わたし';
    case 'rough': return m ? '俺' : 'あたし';
    default: return m ? (p.pers.A > 0.6 ? '僕' : '俺') : 'わたし';
  }
}

const TAILS = {
  n: { plain_m: ['だ', 'だな', 'だよ'], plain_f: ['よ', 'ね', 'なのよ'], polite: ['です', 'ですね', 'ですよ'], rough: ['だぜ', 'だろ', 'だな'], elder: ['じゃ', 'じゃのう', 'じゃよ'], child: ['だよ', 'なの', 'だね'] },
  v: { plain_m: ['よ', 'な', 'んだ', 'んだよ'], plain_f: ['わ', 'の', 'のよ', 'ね'], polite: ['んです', 'んですよ'], rough: ['ぜ', 'んだよ', 'な', 'んだ'], elder: ['のう', 'んじゃ', 'わい', 'んじゃよ'], child: ['よ', 'の', 'んだ', 'もん'] },
  a: { plain_m: ['ね', 'な'], plain_f: ['ね', 'わね'], polite: ['ですね'], rough: ['な'], elder: ['のう'], child: ['ね'] },
  qn: { plain_m: ['？', 'かい？'], plain_f: ['？', 'なの？'], polite: ['ですか？'], rough: ['か？'], elder: ['かのう？', 'かね？'], child: ['？', 'なの？'] },
  qv: { plain_m: ['の？', 'のかい？'], plain_f: ['の？'], polite: ['んですか？'], rough: ['のか？'], elder: ['のかね？'], child: ['の？'] },
};

export class Voice {
  constructor(api, p, listener) {
    this.api = api; this.p = p; this.listener = listener;
    this.age = api.ageOf(p);
    this.style = p.style || speechStyle(p, this.age);
    this.me = firstPerson(p, this.style);
    this.rng = api.rng;
  }
  get key() { return this.style === 'plain' ? `plain_${this.p.sex}` : this.style; }
  tail(kind) { return this.rng.pick(TAILS[kind][this.key]); }
  // body に語尾をつけて一文にする
  s(body, kind = 'n') {
    body = this.fill(body);
    if (kind === 'raw') return body;
    let t = this.tail(kind);
    let out = body + t;
    if (!/[？！。…]$/.test(out)) out += this.rng.chance(0.12) ? '！' : '。';
    return out;
  }
  // 話し方ごとに違う決まり文句
  r(variants) {
    const v = variants[this.style] ?? variants[this.key] ?? variants.plain ?? variants.default;
    return this.fill(Array.isArray(v) ? this.rng.pick(v) : v);
  }
  fill(txt) {
    return txt.replace(/\{me\}/g, this.me).replace(/\{you\}/g, this.listener ? address(this.api, this.p, this.listener, this.style) : 'きみ');
  }
}

// 相手の呼び方
export function address(api, a, b, style) {
  const term = api.kinTerm(a, b);
  const childish = style === 'child';
  if (term) {
    if (['父', '母', '祖父', '祖母', '曾祖父', '曾祖母'].includes(term)) return childish ? casualKin(term, true) : { 父: '父さん', 母: '母さん', 祖父: 'じいちゃん', 祖母: 'ばあちゃん', 曾祖父: 'ひいじいちゃん', 曾祖母: 'ひいばあちゃん' }[term];
    if (term === '兄') return childish ? 'お兄ちゃん' : '兄さん';
    if (term === '姉') return childish ? 'お姉ちゃん' : '姉さん';
    if (term === '妻' || term === '夫') return b.given;
    if (['息子', '娘', '孫', '弟', '妹'].includes(term)) return b.given;
    if (term === 'おじ') return childish ? 'おじちゃん' : 'おじさん';
    if (term === 'おば') return childish ? 'おばちゃん' : 'おばさん';
  }
  const bAge = api.ageOf(b);
  const rel = a.rel?.[b.id];
  if (bAge < 13) return b.given + (b.sex === 'm' ? 'くん' : 'ちゃん');
  if (style === 'polite') return b.given + 'さん';
  if (style === 'child') return b.given + (bAge > 40 ? (b.sex === 'm' ? 'おじさん' : 'おばさん') : (b.sex === 'm' ? 'にいちゃん' : 'ねえちゃん'));
  if (bAge >= 64 && style !== 'elder') return b.given + (b.sex === 'm' ? 'じいさん' : 'ばあさん');
  if (rel && rel.a > 35 && rel.f > 50) return b.given;
  return b.given + 'さん';
}

function greeting(v, hour) {
  if (hour < 10) return v.r({ polite: 'おはようございます、{you}。', elder: 'おはよう、{you}。', rough: ['よう、{you}。', 'おう、{you}。早いな。'], child: 'おはよう、{you}！', plain: ['おはよう、{you}。', 'あ、{you}。おはよう。'] });
  if (hour < 17) return v.r({ polite: 'こんにちは、{you}。', elder: 'おや、{you}か。', rough: ['よう、{you}。', 'おう、{you}。'], child: '{you}、こんにちは！', plain: ['こんにちは、{you}。', 'やあ、{you}。'] });
  return v.r({ polite: 'こんばんは、{you}。', elder: 'おお、{you}。いい晩じゃな。', rough: ['よう、{you}。', 'お、{you}じゃねえか。'], child: '{you}、こんばんは！', plain: ['こんばんは、{you}。', 'やあ、{you}。'] });
}

// ---- 話題の選択 ----
function topics(api, A, B) {
  const list = [];
  const add = (w, fn) => { if (w > 0) list.push({ w, fn }); };
  const age = api.ageOf(A);
  const low = Object.entries(A.needs).sort((x, y) => x[1] - y[1])[0];
  add(low[1] < 35 ? 2.2 : 0, topicNeed);
  add(0.6, topicWeather);
  add(A.job && age >= 14 ? 1.1 : 0, topicWork);
  const breadR = api.priceRatio('bread');
  add(age >= 14 ? 0.5 + Math.abs(breadR - 1) * 3 + (api.householdMoney(A) < 20 ? 1.5 : 0) : 0, topicEconomy);
  add(age >= 16 ? A.values.family * 1.4 : 0.4, topicFamily);
  add(0.7 + (A.values.family * 0.5), topicAncestor);
  add(0.3, topicChronicle);
  const gos = freshGossip(api, A, B);
  add(gos.length ? 1.2 + A.pers.E * 1.5 + (A.pers.A < 0.45 ? 0.8 : 0) : 0, (api2, a, b, v) => topicGossip(api2, a, b, v, gos));
  const aboutB = recentAbout(api, A, B);
  add(aboutB ? 3 : 0, (api2, a, b, v) => topicAboutYou(api2, a, b, v, aboutB));
  add(A.pers.O * 0.8, topicDream);
  add(0.6, topicChildhood);
  add(A.pers.O > 0.68 ? 0.25 : 0.03, topicWonder);
  const grief = A.memories.find((m) => m.k === 'death' && api.today - m.t < 15 && m.src === 'self');
  add(grief ? 3 : 0, (api2, a, b, v) => topicGrief(api2, a, b, v, grief));
  const rel = A.rel[B.id] || { a: 0, f: 0 };
  const canRomance = age >= 17 && api.ageOf(B) >= 17 && A.spouseId == null && B.spouseId == null && A.sex !== B.sex && rel.a > 45 && !api.isKin(A, B) && Math.abs(age - api.ageOf(B)) < 14;
  add(canRomance ? 1.5 + rel.a / 50 : 0, topicRomance);
  add(Math.abs(A.mood - 50) > 25 ? 0.9 : 0, topicMood);
  add(0.5, topicOpinion);
  if (age < 13) add(2, topicPlay);
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
    energy: [['昨日はあまり眠れなかった', 'v'], ['くたくたで、立ったまま眠れそう', 'n'], ['今日は体が重い', 'v']],
    social: [['このところ誰ともちゃんと話してなかった', 'v'], ['{you}の顔を見たらほっとした', 'v']],
    fun: [['毎日同じことの繰り返しで、ちょっと退屈', 'n'], ['何か面白いことでもないかな', 'raw']],
  }[need];
  const [body, kind] = R.pick(t);
  return { kind: 'complain', text: kind === 'raw' ? v.s(body, 'raw') + '……' : v.s(body, kind), sentiment: -0.4 };
}

function topicWeather(api, A, B, v) {
  const R = api.rng, w = api.weather(), season = api.season();
  const opts = {
    sunny: [['いい天気', 'n'], [`${season}の日差しは気持ちいい`, 'v'], ['こんな日は外で昼寝したい', 'v']],
    cloudy: [['雲が厚い。夕方には降るかも', 'raw'], ['空がどんよりしてる', 'v']],
    rain: [['よく降る', 'v'], ['雨で道がぬかるんで歩きにくい', 'v'], ['この雨で麦がよく育つといいけど', 'raw']],
    snow: [['雪が積もってきた', 'v'], ['寒さが骨までしみる', 'v'], ['薪が足りるか心配', 'n']],
  }[w];
  const [body, kind] = R.pick(opts);
  if (kind === 'raw') return { kind: 'weather', text: v.s(body, 'raw') + (v.style === 'polite' ? 'ですね。' : v.style === 'elder' ? 'のう。' : 'な。'), sentiment: 0 };
  return { kind: 'weather', text: v.s(body, kind), sentiment: w === 'sunny' ? 0.3 : -0.1 };
}

function topicWork(api, A, B, v) {
  const R = api.rng;
  const job = A.job;
  const season = api.season();
  const lines = {
    farmer: season === '秋' ? [['いよいよ刈り入れ。腰が痛くなる季節', 'n'], ['今年の麦は穂がずっしり重い', 'v']]
      : season === '冬' ? [['冬は畑が眠ってる。鍬の手入れでもするかな', 'raw']]
      : [['麦の芽がそろってきた', 'v'], ['畑の雑草がすぐ伸びる', 'v'], ['雨がもう少し欲しい', 'v']],
    baker: [['朝から窯の前に立ちっぱなし', 'n'], ['今朝のパンはよく膨らんだ', 'v'], ['小麦の値が上がると、うちも苦しい', 'v']],
    fisher: [['湖の北側で、けっこう大きいのがかかった', 'v'], ['最近は魚が警戒してて、なかなか釣れない', 'v'], ['朝もやの湖は、きれい', 'n']],
    woodcutter: [['森の奥のカシの木は、斧がはね返るほど硬い', 'v'], ['冬に向けて薪をたくさん割っておかないと', 'raw']],
    smith: [['鍬の刃を三本も打ち直した', 'v'], ['鉄を打つ音を聞くと落ち着く', 'v'], ['炉の火を絶やさないのが一番むずかしい', 'v']],
    innkeeper: [['昨夜は遅くまで客がいて寝不足', 'n'], ['旅の商人が妙な噂を置いていった', 'v'], ['麦酒の仕込みがうまくいった', 'v']],
    merchant: [[`${GOODS.bread.name}が${api.price('bread')}銅貨、${GOODS.wheat.name}が${api.price('wheat')}銅貨。値動きから目が離せない`, 'v'], ['王都の相場は、この村とは大違い', 'n']],
    carpenter: [['ハンナさんの家の梁がゆるんでたから直してきた', 'v'], ['いい木目の板が手に入った', 'v']],
    priest: [['最近、祈りに来る人が減った気がする', 'v'], ['次の安息日の説教をまだ考えてる', 'v']],
    mayor: [['村の蓄えの帳簿を見てたら、頭が痛くなった', 'v'], ['収穫祭の段取りを考えないと', 'raw']],
  }[job] || [['毎日なにかと忙しい', 'v']];
  const [body, kind] = R.pick(lines);
  if (kind === 'raw') return { kind: 'work', text: v.s(body, 'raw') + (v.style === 'polite' ? 'と思っています。' : '。'), sentiment: 0.1 };
  return { kind: 'work', text: v.s(body, kind), sentiment: 0.1 };
}

function topicEconomy(api, A, B, v) {
  const R = api.rng;
  const r = api.priceRatio('bread');
  const money = api.householdMoney(A);
  if (money < 20 && R.chance(0.6)) {
    const [b, k] = R.pick([['今月は財布がすっからかん', 'n'], ['このままじゃ冬を越せるかどうか', 'raw'], ['子どもたちに腹いっぱい食べさせてやりたい', 'v']]);
    return { kind: 'complain', text: k === 'raw' ? v.s(b, 'raw') + '……' : v.s(b, k), sentiment: -0.6 };
  }
  if (r > 1.25) return { kind: 'complain', text: v.s(`パンが${api.price('bread')}銅貨もするなんて、ひどい話`, 'n'), sentiment: -0.5 };
  if (r < 0.8) return { kind: 'good', text: v.s(`最近はパンが安くて助かる`, 'v'), sentiment: 0.4 };
  if (money > 250) return { kind: 'good', text: v.s(R.pick(['おかげさまで、うちはなんとかやれてる', '今年は少し蓄えができた']), 'v'), sentiment: 0.4 };
  const w = api.priceRatio('wheat');
  if (w > 1.3) return { kind: 'complain', text: v.s('小麦の値がじわじわ上がってる', 'v'), sentiment: -0.3 };
  return { kind: 'neutral', text: v.s('市場の値段は、まあ落ち着いてる', 'v'), sentiment: 0 };
}

function topicFamily(api, A, B, v) {
  const R = api.rng;
  const kids = A.children.map((id) => api.person(id)).filter((c) => c && c.deathYear == null);
  const sp = A.spouseId != null ? api.person(A.spouseId) : null;
  const opts = [];
  for (const c of kids) {
    const a = api.ageOf(c);
    if (a < 14) opts.push([`うちの${c.given}ももう${a}歳。あっという間`, 'n']);
    if (a < 8) opts.push([`${c.given}が夜泣きして、ゆうべはほとんど寝てない`, 'v']);
    if (a >= 14 && c.job) opts.push([`${c.given}が${JOBS[c.job].name}として一人前になってきた`, 'v']);
  }
  if (sp) {
    const rel = A.rel[sp.id]?.a ?? 50;
    if (rel > 55) opts.push([`${sp.given}の作るスープが、世界で一番うまい`, 'v'], [`${sp.given}がいなかったら、${'{me}'}はとっくにだめになってた`, 'v']);
    else if (rel < 15) opts.push([`${sp.given}とはこのところ口をきいてない`, 'v'], [`${sp.given}とまたつまらないことで言い合いになった`, 'v']);
    else opts.push([`${sp.given}と市場で何を買うかでもめた`, 'v']);
  }
  const mom = api.person(A.motherId), dad = api.person(A.fatherId);
  for (const par of [mom, dad]) if (par && par.deathYear == null) {
    const term = par.sex === 'm' ? '親父' : 'お袋';
    const t = v.style === 'child' ? (par.sex === 'm' ? 'お父さん' : 'お母さん') : v.style === 'polite' ? (par.sex === 'm' ? '父' : '母') : term;
    const pa = api.ageOf(par);
    opts.push(pa > 62 ? [`${t}が最近、腰が痛いってこぼしてる`, 'v'] : [`${t}にまた小言を言われた`, 'v']);
  }
  if (!opts.length) return topicAncestor(api, A, B, v);
  const [body, kind] = R.pick(opts);
  return { kind: 'family', text: v.s(body, kind), sentiment: 0.2 };
}

function deadAncestors(api, A) {
  const out = [];
  for (const [id, d] of api.ancestors(A)) {
    const p = api.person(id);
    if (p && p.deathYear != null && d <= 5) out.push({ p, d });
  }
  return out;
}

function topicAncestor(api, A, B, v) {
  const R = api.rng;
  const anc = deadAncestors(api, A);
  if (!anc.length) return topicChildhood(api, A, B, v);
  const withSaying = anc.filter((x) => x.p.saying && x.d <= 3);
  const withDeed = anc.filter((x) => x.p.deeds.length);
  const term = (x) => casualKin(api.kinTerm(A, x.p) || 'ご先祖', v.style === 'child');
  if (withSaying.length && R.chance(0.45)) {
    const x = R.pick(withSaying);
    return { kind: 'story', text: v.s(`死んだ${term(x)}がよく言ってた。『${x.p.saying}』って`, 'raw') + '。', sentiment: 0.2, about: [x.p.id] };
  }
  const x = R.pick(withDeed.length ? withDeed : anc);
  const deed = x.p.deeds.length ? R.pick(x.p.deeds) : `${x.p.deathYear}年に亡くなった`;
  const yearsAgo = api.year() - x.p.birthYear;
  if (x.d >= 3) return { kind: 'story', text: v.s(`${term(x)}の${x.p.given}は、${deed}らしい`, 'v'), sentiment: 0.3, about: [x.p.id] };
  return { kind: 'story', text: v.s(`${term(x)}の${x.p.given}は、${deed}`, 'v') + (x.d >= 2 && yearsAgo > 90 ? 'もう百年近くも前のことだけど。' : ''), sentiment: 0.3, about: [x.p.id] };
}

function topicChronicle(api, A, B, v) {
  const R = api.rng;
  const ev = R.pick(api.chronicle().filter((c) => c.y > 0 && c.y < api.year() - 3));
  if (!ev) return topicWeather(api, A, B, v);
  const ago = api.year() - ev.y;
  return { kind: 'story', text: v.s(`${ago}年前、${ev.text}って。${ago > 80 ? 'ご先祖さまの時代の話' : '年寄りから聞いた話'}`, 'n'), sentiment: 0.1 };
}

function topicGossip(api, A, B, v, gos) {
  const R = api.rng;
  const m = R.pick(gos);
  const subj = api.person(m.g.subj);
  const openers = { polite: 'ご存じですか？', elder: '聞いたかね？', rough: 'なあ、聞いたか？', child: 'ねえねえ、知ってる？', plain: ['ねえ、聞いた？', 'そういえば、'] };
  const op = v.r(openers);
  const who = api.kinTerm(A, subj) && A.id !== subj.id ? `うちの${api.kinTerm(A, subj)}の${subj.given}` : subj.given;
  const text = `${op}${who}が${m.g.pred}${v.style === 'polite' ? 'そうですよ。' : v.style === 'elder' ? 'そうじゃ。' : v.style === 'rough' ? 'ってよ。' : 'んだって。'}`;
  return { kind: 'gossip', text, sentiment: m.g.emo, gossip: m, about: [subj.id] };
}

function topicAboutYou(api, A, B, v, m) {
  const text = m.g.emo >= 0
    ? v.r({ polite: `${m.g.congrat}、おめでとうございます。`, elder: `${m.g.congrat}、めでたいのう。`, rough: `${m.g.congrat}、めでてえな！`, child: `${m.g.congrat}、おめでとう！`, plain: `${m.g.congrat}、おめでとう。` })
    : v.r({ polite: `${m.g.congrat}……お力落としのないように。`, elder: `${m.g.congrat}……つらいのう。`, rough: `${m.g.congrat}……元気出せよ。`, child: `${m.g.congrat}……だいじょうぶ？`, plain: `${m.g.congrat}……大丈夫？` });
  return { kind: 'aboutyou', text, sentiment: m.g.emo, about: [B.id] };
}

function topicDream(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([
    [`いつか${A.dream}のが夢`, 'n'],
    [`笑わないで聞いて。${A.dream}って決めてる`, 'v'],
    [`${A.dream}まで、死ねない`, 'raw'],
  ]);
  if (t[1] === 'raw') return { kind: 'dream', text: v.s(t[0], 'raw') + (v.style === 'polite' ? 'と思っています。' : '。'), sentiment: 0.4 };
  return { kind: 'dream', text: v.s(t[0], t[1]), sentiment: 0.4 };
}

function topicChildhood(api, A, B, v) {
  const R = api.rng;
  const mems = A.memories.filter((m) => m.src === 'self' && api.today - m.t > 40 && m.ageAt != null && m.ageAt < 16 && !m.g);
  const shared = mems.filter((m) => m.about && m.about.includes(B.id));
  const m = shared.length && R.chance(0.7) ? R.pick(shared) : mems.length ? R.pick(mems) : null;
  if (!m) return topicWeather(api, A, B, v);
  if (m.sh && m.about && m.about.includes(B.id)) {
    return { kind: 'memory', text: v.fill(`覚えてる？ ${m.ageAt}歳のころ、一緒に${m.sh}こと。`), sentiment: 0.5, about: [B.id], shared: true };
  }
  return { kind: 'memory', text: v.s(`${m.ageAt}歳のころ、${m.txt}`, 'v'), sentiment: m.emo };
}

function topicWonder(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([
    ['ときどき思う。昨日の自分と今日の自分は、本当に同じなのかって', 'raw'],
    ['夢の中で、誰かにずっと見られている気がした', 'v'],
    ['山の向こうの、そのまた向こうには何があるんだろう', 'raw'],
    ['ひいじいさんたちも、この同じ空を見上げてたと思うと、不思議な気がする', 'v'],
    ['子どものころの記憶って、どこまでが本当なんだろう', 'raw'],
    ['星って、誰かが夜ごとに灯してるみたい', 'n'],
  ]);
  return { kind: 'wonder', text: t[1] === 'raw' ? v.s(t[0], 'raw') + '。' : v.s(t[0], t[1]), sentiment: 0 };
}

function topicGrief(api, A, B, v, m) {
  const who = m.txt.split('が')[0];
  return { kind: 'grief', text: v.s(`${who}がいなくなって、家の中が静かすぎる`, 'v'), sentiment: -0.8 };
}

function topicRomance(api, A, B, v) {
  const R = api.rng;
  const t = R.pick([['{you}と話してると、時間を忘れる', 'v'], ['今度の収穫祭、一緒に踊ってくれない', 'qv'], ['{you}の笑った顔、好き', 'n']]);
  let text = v.s(t[0], t[1]);
  if (t[1] === 'qv') text = v.s('今度の収穫祭、一緒に踊ってくれる', 'qn');
  return { kind: 'romance', text, sentiment: 0.8 };
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
  const t = api.rng.pick([['いっしょに湖まで競争しよう', 'raw'], ['リンデンの木にカブトムシがいた', 'v'], ['鐘楼のてっぺんには幽霊がいる', 'v'], ['大きくなったら騎士になる', 'n']]);
  return { kind: 'play', text: t[1] === 'raw' ? v.fill(t[0]) + '！' : v.s(t[0], t[1]), sentiment: 0.5 };
}

// ---- 返事 ----
export function react(api, B, A, topic, v) {
  const R = api.rng;
  const rel = B.rel[A.id] || { a: 0, f: 0 };
  const kind = topic.kind;
  if (kind === 'gossip') {
    const known = B.gk && B.gk[topic.gossip.g.key];
    if (known) return { text: v.r({ polite: 'ええ、わたしも伺いました。', elder: 'ああ、その話ならわしも聞いたよ。', rough: 'ああ、知ってる。', child: 'しってるー！', plain: 'うん、その話なら聞いた。' }), da: 0.5 };
    const subj = api.person(topic.gossip.g.subj);
    const sr = B.rel[subj.id]?.a ?? 0;
    const surprise = v.r({ polite: 'まあ、本当ですか？', elder: 'ほう、そうかね。', rough: 'マジかよ。', child: 'えーっ、ほんと？', plain: ['えっ、本当？', 'へえ、そうなんだ。'] });
    let tail = '';
    if (topic.sentiment > 0.3) tail = sr > -10 ? v.s('それはめでたい', 'v') : v.s('ふうん、あいつがね', 'raw') + '。';
    else if (topic.sentiment < -0.3) tail = sr > 10 ? v.s(`${subj.given}、かわいそうに`, 'raw') + '……' : v.s('まあ、自業自得', 'n');
    return { text: surprise + tail, da: 1.5 };
  }
  if (kind === 'aboutyou') {
    if (topic.sentiment >= 0) return { text: v.r({ polite: 'ありがとうございます。', elder: 'ありがとうよ。', rough: 'へへ、ありがとな。', child: 'ありがとう！', plain: 'ありがとう。うれしい。' }), da: 4 };
    return { text: v.r({ polite: 'お気遣い、ありがとうございます。', elder: '……ありがとうよ。', rough: '……ああ。ありがとな。', child: '……うん。', plain: '……ありがとう。' }), da: 5 };
  }
  if (kind === 'romance') {
    if (rel.a > 55) return { text: v.r({ polite: '……わたしも、同じことを考えていました。', rough: 'な、何言ってんだよ……でも、悪くねえ。', plain: ['……うん。わたしも。', '……実は、僕もなんだ。'], elder: 'ほほ、若いのう。', child: 'え？' }), da: 8, romance: true };
    return { text: v.r({ polite: 'え、ええと……。', rough: 'はあ？ 急に何だよ。', plain: 'そ、そう……？', elder: 'ほほ。', child: 'へんなのー。' }), da: -1 };
  }
  if (kind === 'wonder') {
    if (B.pers.O > 0.55) return { text: v.s(R.pick(['わかる気がする', '{me}もときどき、そんなふうに思う']), 'v'), da: 2.5 };
    return { text: v.r({ polite: '難しいことをお考えになるんですね。', elder: '考えすぎじゃよ。早く寝なさい。', rough: '何ばかなこと言ってんだ。疲れてんじゃねえか？', child: 'よくわかんない。', plain: '考えすぎだよ。' }), da: 0 };
  }
  if (kind === 'story') {
    const common = topic.about && topic.about.some((id) => api.ancestors(B).has(id));
    if (common) return { text: v.s('その人、{me}のご先祖さまでもある', 'v'), da: 3 };
    return { text: v.r({ polite: ['そのお話、はじめて伺いました。', '昔の方はたくましいですね。'], elder: ['そうじゃったか。昔の者はたくましいのう。'], rough: ['へえ、そんなやつがいたのか。', '昔のやつはすげえな。'], child: ['へえー！', 'すごーい！'], plain: ['へえ、はじめて聞いた。', '昔の人はたくましいね。'] }), da: 1.5 };
  }
  if (kind === 'memory' && topic.shared) return { text: v.s(R.pick(['覚えてる。あのときは大変だった', 'なつかしい']), 'v'), da: 4 };
  if (topic.sentiment < -0.25) {
    if (B.pers.A > 0.5 || rel.a > 30) return { text: v.s(R.pick(['それは大変', 'つらい', 'あんまり無理しないで']), 'raw') .replace(/^(それは大変)$/, v.style === 'polite' ? 'それは大変ですね。' : v.style === 'elder' ? 'それは大変じゃのう。' : 'それは大変だね。').replace(/^つらい$/, v.style === 'polite' ? 'おつらいですね。' : v.style === 'elder' ? 'つらいのう。' : 'つらいね。').replace(/^あんまり無理しないで$/, v.style === 'polite' ? 'あまりご無理なさらずに。' : v.style === 'rough' ? 'あんま無理すんなよ。' : 'あんまり無理しないでね。'), da: 3 };
    if (B.pers.A < 0.35) return { text: v.r({ polite: 'みなさん同じですよ。', elder: 'わしらの若いころはもっと大変じゃった。', rough: 'みんな同じだっての。', child: 'ふーん。', plain: 'みんな同じだよ。' }), da: -2 };
    return { text: v.s('そうか……', 'raw'), da: 1 };
  }
  if (topic.sentiment > 0.3) {
    if (B.values.ambition > 0.72 && rel.a < 20) return { text: v.s('ふうん。うらやましい', 'a'), da: -0.5 };
    return { text: v.s(R.pick(['それはよかった', 'それはうれしい', 'なんだかこっちまでうれしい']), 'a'), da: 2.5 };
  }
  return { text: v.r({ polite: ['なるほど。', 'そうですね。'], elder: ['ふむ。', 'そうじゃな。'], rough: ['ふーん。', 'へえ。'], child: ['ふーん。', 'そうなんだ！'], plain: ['そうだね。', 'なるほど。', 'たしかに。'] }), da: 1 };
}

// ---- 会話全体 ----
export function composeConversation(api, A, B) {
  const R = api.rng;
  const vA = new Voice(api, A, B), vB = new Voice(api, B, A);
  const lines = [];
  const hour = api.hour();
  const relAB = A.rel[B.id] || { a: 0, f: 0 };
  const effects = { daA: 0, daB: 0, topics: [], romance: false, argument: false, shared: [] };

  // 口論
  const quarrel = relAB.a < -15 && (A.pers.N > 0.55 || A.pers.A < 0.4) && R.chance(0.45);
  if (quarrel) {
    lines.push({ id: A.id, text: vA.r({ polite: '{you}、ひとこと言わせていただきます。', elder: '{you}、ちょっと待ちなさい。', rough: 'おい、{you}。', child: '{you}のばか！', plain: '{you}、ちょっといい？' }) });
    lines.push({ id: A.id, text: vA.s(R.pick(['この前のこと、まだ謝ってもらってない', '{you}のそういうところが本当に嫌い', 'いいかげん、人の話を聞いて']), 'n') });
    const back = B.pers.A > 0.6
      ? vB.r({ polite: '……申し訳ありませんでした。', elder: 'わかった、わかった。わしが悪かった。', rough: '……悪かったよ。', child: 'ごめん……', plain: '……ごめん。言いすぎた。' })
      : vB.r({ polite: 'それはこちらの台詞です。', elder: '年寄りに向かってなんじゃ！', rough: 'うるせえ、お前こそ何様だ！', child: 'そっちこそ！', plain: 'そっちこそ、いいかげんにして！' });
    lines.push({ id: B.id, text: back });
    const reconcile = B.pers.A > 0.6;
    effects.daA = reconcile ? 3 : -8; effects.daB = reconcile ? 2 : -10; effects.argument = !reconcile;
    effects.topics.push('quarrel');
    return { lines, effects };
  }

  const firstToday = !(A.talkedToday && A.talkedToday[B.id]);
  if (firstToday) {
    lines.push({ id: A.id, text: greeting(vA, hour) });
    if (R.chance(0.7)) lines.push({ id: B.id, text: greeting(vB, hour) });
  }
  const turns = 1 + (R.chance(0.35 + (A.pers.E + B.pers.E) / 4) ? 1 : 0) + (R.chance(0.25) ? 1 : 0);
  let speaker = A, listener = B, vs = vA, vl = vB;
  for (let i = 0; i < turns; i++) {
    const topic = pickTopic(api, speaker, listener, vs);
    lines.push({ id: speaker.id, text: topic.text });
    const re = react(api, listener, speaker, topic, vl);
    lines.push({ id: listener.id, text: re.text });
    effects.topics.push(topic.kind);
    if (topic.gossip) effects.shared.push({ from: speaker.id, to: listener.id, mem: topic.gossip });
    if (re.romance) effects.romance = true;
    const compat = 1 - (Math.abs(A.pers.E - B.pers.E) + Math.abs(A.pers.O - B.pers.O) + Math.abs(A.pers.A - B.pers.A)) / 3;
    const d = re.da + (compat - 0.5) * 3;
    if (speaker === A) { effects.daA += d * 0.8; effects.daB += d; } else { effects.daB += d * 0.8; effects.daA += d; }
    [speaker, listener, vs, vl] = [listener, speaker, vl, vs];
  }
  if (R.chance(0.5)) {
    lines.push({ id: speaker.id, text: vs.r({ polite: 'では、また。', elder: 'じゃあの。', rough: 'じゃあな。', child: 'またね！', plain: ['じゃあ、また。', 'またね。'] }) });
  }
  return { lines, effects };
}

// ---- 心の声（独り言） ----
export function innerThought(api, p) {
  const R = api.rng;
  const v = new Voice(api, p, null);
  const act = p.action?.type;
  const low = Object.entries(p.needs).sort((x, y) => x[1] - y[1])[0];
  const sp = p.spouseId != null ? api.person(p.spouseId) : null;
  const opts = [];
  if (low[1] < 30) opts.push({ hunger: 'お腹すいたな……', energy: '眠い……今日は早く寝よう。', social: '誰かと話したいな。', fun: 'たまには何か楽しいことがしたい。' }[low[0]]);
  if (act === 'work') opts.push(`さて、もうひと頑張り。${JOBS[p.job]?.name ?? ''}の仕事は待ってくれない。`);
  if (act === 'sleep') opts.push('（すやすや……）', '（夢を見ている……子どものころの夢だ）');
  if (act === 'pray') opts.push('どうか家族が健やかでありますように。');
  if (act === 'tavern') opts.push('一杯だけ……いや、もう一杯。');
  if (act === 'shop') opts.push(`パンが${api.price('bread')}銅貨か……。`);
  if (sp && act !== 'sleep') opts.push(`${sp.given}は今ごろ何してるかな。`);
  if (api.householdMoney(p) < 20) opts.push('どうやって今月をしのごう……。');
  const recent = p.memories.filter((m) => api.today - m.t < 3 && m.imp > 0.4);
  if (recent.length) { const m = R.pick(recent); opts.push(`${m.txt}……。`); }
  if (p.pers.O > 0.7) opts.push(`${p.dream}。いつか、きっと。`);
  const anc = [...api.ancestors(p)].filter(([id, d]) => d <= 2 && api.person(id)?.saying);
  if (anc.length) { const a = api.person(R.pick(anc)[0]); opts.push(`${casualKin(api.kinTerm(p, a), v.style === 'child')}がよく言ってたっけ。『${a.saying}』`); }
  if (!opts.length) opts.push('いい一日になりそうだ。');
  return R.pick(opts);
}

export const seasonName = (i) => SEASONS[i];
