// 生きる目的（開発部）：人生の目的 → いまの計画 → 今日の心づもり → いまの行動の「なぜ」
// 動物・魔物にも、種族と知能に応じた目的と、いまの行動の理由を持たせる。
//
// 本体からは次の関数を呼ぶだけで動く。状態はすべて遅延初期化なので古いセーブでも動く。
//   purposeDaily(sim)                 … newDay の最後のほう（careerDaily・financeDaily のあと）。目的の見直し・計画・贈り物の手渡し
//   purposeDecide(sim, p, cands, add) … decide で cands.sort の直前（healthDecide の次）。目的・計画・今日の心づもり・生活の癖で点数を直し、候補を足す
//   purposeChosen(sim, p, c)          … decide の startAction の直後。p.action.why（なぜ）と出どころを付ける
//   purposeArrive(sim, p)             … arrive の最後。心づもり・癖を「済んだ」にし、贈り物を買う
//   purposeDo(sim, p, dt)             … doAction の choreDo の隣。学問（study）の効き目
//   purposeWhy(sim, p)                … 詳細欄の「なぜ」（いまの行動の理由。なければ null）
//   purposeThoughts(sim, p)           … 心の声の候補（配列）
//   purposeCard(sim, p)               … 詳細欄の行（[見出し, 本文] の配列）
//   creatureWhy(sim, c)               … 生き物の { purpose, why }。c.why・c.purpose にも入れる
//   spreadSample(sim, acc) / spreadReport(acc) … 同じ職業の人の行動のばらつきを測る（試験用）
//   PURPOSE_LABEL / PURPOSE_GO / PURPOSE_PREF … ui.js の行動ラベル（study・errand）
//
// 人の状態：
//   p.pur = { v, life, st, lifeWhy, since, target, prev:[{k,d}], memMin,
//             plan:{k,txt,since,target}, today:{day,k,type,h0,h1,kind,friend,txt,why,cut,done},
//             hab:{ws,len,list:[{k,h0,h1,type,kind,days,w,txt,why,dur}]}, hd:{癖:日}, gift:{to,what,day} }
//   p.action.why（いまの行動の理由）、p.action.pk（'today' / 'habit:癖' / 'life' / 'plan'）
//   S.purpose = { v, stats:{ changed, gifts, ... } }
import { JOBS, SPECIES, DAYS_PER_YEAR } from './data.js';
import { calendarHalfDay } from './calendar.js';
import { pay, earn, spendable } from './property.js';
import { debtsOf } from './finance.js';
import { careerWorkPlace } from './career.js';

// ---------- 小道具 ----------
const hash01 = (a, b = 0) => { let x = (Math.imul((a | 0) + 0x9e37, 2654435761) ^ Math.imul(b + 1, 40503)) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
const alive = (sim, id) => { const q = id != null ? sim.S.people[id] : null; return q && q.deathYear == null ? q : null; };
const jobName = (j) => JOBS[j]?.name || '';
const hm = (h) => { const H = Math.floor(h), M = Math.round((h - H) * 60 / 10) * 10; return M >= 60 ? `${H + 1}時` : M ? `${H}時${M}分` : `${H}時`; };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function stats(sim) {
  const S = sim.S;
  S.purpose = S.purpose || { v: 1, stats: {} };
  S.purpose.stats = S.purpose.stats || {};
  return S.purpose.stats;
}
const stat = (sim, k) => { const s = stats(sim); s[k] = (s[k] || 0) + 1; };
const isRest = (sim, p) => sim.isRestDay() || calendarHalfDay(sim, p.s);

// ---------- 人生の目的 ----------
// bias：行動の種類ごとの点数の補正。why：その行動をとる理由（{t} は目的の相手）
export const LIFE = {
  family: {
    name: '家族を守る',
    bias: { work: 1.0, home: 0.8, rest: 0.3, cook: 0.8, childcare: 1.0, nurse: 1.5, shop: 0.6, water: 0.4, tavern: -0.8, quest: -1.2, travel: -1, stroll: -0.3, grandkids: 1, garden: 0.5, errand: 0.8 },
    why: { work: '家族を食べさせるため', home: '家族のそばにいたくて', cook: '家族の食事をこしらえるため', childcare: '子どもから目を離さないため', shop: '家の食べ物を切らさないため', nurse: '家族を看病するため', rest: '明日も家族のために働けるよう' },
    thoughts: ['家族さえ無事なら、それでいい。', 'あの子たちが腹をすかせないように、今日も働こう。', '何があっても、この家は自分が守る。'],
  },
  fame: {
    name: '名を上げる',
    bias: { quest: 1.8, train: 1.5, guild: 1.3, hunt: 1.5, report: 0.8, perform: 1, plaza: 0.5, buygear: 0.8, work: 0.2, rest: -0.6, nap: -0.6, defend: 1 },
    why: { quest: '名を上げるため', train: '誰よりも強くなるため', guild: '手柄になる依頼を探すため', hunt: '賞金首を仕留めて名を上げるため', perform: '自分の名を広めるため', plaza: '噂の種を拾うため', buygear: '手柄を立てられる装備を求めて', defend: '手柄を立てる好機と見て' },
    thoughts: ['いつか吟遊詩人に歌われるような人間になってやる。', 'このまま名もなく終わるものか。', '手柄だ。手柄さえ立てれば……。'],
  },
  faith: {
    name: '神に仕える',
    bias: { pray: 2.0, grave: 1, housecall: 0.8, nurse: 0.8, help: 0.4, tavern: -1, steal: -3, rob: -3, revenge: -2, court: -0.3, study: 0.3 },
    why: { pray: '神への務めを果たすため', grave: '亡き人の魂の安らぎを祈るため', housecall: '苦しむ人に手を差し伸べるため', nurse: '神の教えのとおり病人に尽くすため', work: '与えられた務めを誠実に果たすため' },
    thoughts: ['神はきっと見ておられる。', '今日も一日、恥じることなく生きられますように。', '祈りを欠かした日は、どうも落ち着かない。'],
  },
  wealth: {
    name: '金持ちになる',
    bias: { work: 1.4, trade: 1.8, collect: 1, peddle: 1, tavern: -0.8, stroll: -0.6, rest: -0.5, plaza: -0.4, festival: -0.3, nap: -0.5 },
    why: { work: '一枚でも多く銅貨を稼ぐため', trade: 'ひと儲けするため', collect: '貸した金を取り返すため', peddle: '稼ぎを増やすため', shop: '安いうちに買っておくため' },
    thoughts: ['銅貨一枚を笑う者は、銅貨一枚に泣く。', 'いつか金貨の詰まった箱を開けてみたい。', 'もっとうまい儲け口はないものか。'],
  },
  love: {
    name: '愛する人と添い遂げる',
    bias: { court: 2.2, visit: 0.6, home: 1.0, plaza: 0.5, stroll: 0.3, work: 0.3, tavern: -0.3, errand: 0.8 },
    why: { court: '{t}に会いたくて', home: '{t}と過ごしたくて', plaza: '{t}に会えるかもしれないと思って', stroll: '{t}のことを考えながら', work: '{t}との暮らしのため' },
    thoughts: ['{t}の笑った顔が、頭から離れない。', '{t}と一緒なら、どんな苦労も平気だ。', '{t}は今ごろ、何をしているだろう。'],
  },
  revenge: {
    name: '仇を討つ',
    bias: { train: 2.0, revenge: 2.0, quest: 1.2, hunt: 1.0, festival: -1, plaza: -0.5, tavern: 0.4, pray: -0.4 },
    why: { train: '仇を討てるだけの力をつけるため', revenge: '仇を討つため', quest: '仇に近づく手がかりを求めて', hunt: '仇討ちの腕を試すため', tavern: '眠れぬ夜をやり過ごすため', work: '仇討ちの支度金を稼ぐため' },
    thoughts: ['{t}……あいつだけは、決して許さない。', 'この恨みを晴らすまでは、笑うものか。', '剣を握る手に、まだ力が足りない。'],
  },
  knowledge: {
    name: '知識を極める',
    bias: { study: 2.2, school: 1.5, academy: 1.5, work: 0.4, stroll: 0.4, tavern: -0.6, plaza: -0.2, storytell: 0.4 },
    why: { study: '知りたいことが山ほどあるので', school: '学ぶため', academy: '魔法の理を学ぶため', stroll: '草花や星を観察するため', work: '研究を前に進めるため', visit: '学のある人の話を聞くため' },
    thoughts: ['世界はまだ、わからないことだらけだ。', 'あの書物の続きが気になって仕方がない。', 'なぜそうなるのか。それが知りたい。'],
  },
  freedom: {
    name: '自由に生きる',
    bias: { stroll: 1.4, travel: 1.6, fishing: 1.2, tavern: 0.6, plaza: 0.3, work: -0.5, rest: 0.2 },
    why: { stroll: '気の向くままに', travel: '一つ所に縛られたくなくて', fishing: 'のんびり釣り糸を垂れたくて', tavern: '好きなときに好きなだけ飲むため', work: '食べていくだけは稼ぐため' },
    thoughts: ['誰の指図も受けたくない。', '風の吹くまま、気の向くまま。', '明日のことは明日考えればいい。'],
  },
  homecoming: {
    name: '故郷に錦を飾る',
    bias: { work: 1.3, trade: 1.2, tavern: -0.6, train: 0.3, pray: 0.2 },
    why: { work: '一旗揚げて故郷へ帰るため', trade: '故郷へ持って帰る財を築くため', pray: '故郷の家族の無事を祈るため' },
    thoughts: ['{t}の母さんは、元気にしているだろうか。', '立派になって{t}に帰るんだ。', '{t}の丘の景色を、ふと思い出した。'],
  },
  atone: {
    name: '罪を償う',
    bias: { pray: 1.5, help: 1, nurse: 1, childcare: 0.6, housecall: 1, water: 0.6, visit: 0.5, steal: -4, rob: -4, revenge: -3, tavern: -0.6 },
    why: { pray: '犯した罪の赦しを乞うため', help: '少しでも人の役に立つため', nurse: '罪滅ぼしに人に尽くすため', water: '人の役に立つため', work: 'まっとうに生き直すため', visit: '迷惑をかけた人に顔向けできるように' },
    thoughts: ['あのときのことを、忘れた日はない。', '償いきれるとは思っていない。それでも。', '今日は、誰かの役に立てただろうか。'],
  },
  craft: {
    name: '腕を極める',
    bias: { work: 1.5, train: 0.2, tavern: -0.4, rest: -0.3 },
    why: { work: '腕を磨くため', rest: '明日の仕事のために手を休めるため' },
    thoughts: ['今日の出来はまだまだだ。', '手が覚えるまで、何度でも。', 'いつか誰もがうなる品を作ってみせる。'],
  },
  duty: {
    name: '国と主君に仕える',
    bias: { work: 1.3, train: 1.2, defend: 1.5, pray: 0.3, tavern: -0.5, rest: -0.4 },
    why: { work: '務めを果たすため', train: 'いざというとき国を守れるよう', defend: '町を守る務めのため', pray: '国の安寧を祈るため' },
    thoughts: ['務めを果たす。それだけだ。', 'この国のために、恥ずかしくない働きを。', '主君の期待を裏切るわけにはいかない。'],
  },
  survive: {
    name: '今日を生き延びる',
    bias: { work: 1.2, beg: 1, eat: 0.5, shop: 0.5, askfood: 0.8, tavern: -1.2, stroll: -0.5 },
    why: { work: '今日の食い扶持を稼ぐため', beg: '今日を食いつなぐため', askfood: '飢えをしのぐため', shop: '今日の食べ物を手に入れるため' },
    thoughts: ['明日のことなんて考えていられない。', 'まずは今夜の寝床と、ひと切れのパンだ。', '生きてさえいれば、なんとかなる。'],
  },
  peace: {
    name: '穏やかに老いる',
    bias: { garden: 1.4, fishing: 1.2, grandkids: 1.4, storytell: 1.0, rest: 0.6, pray: 0.6, stroll: 0.6, quest: -2, train: -1, work: -0.3 },
    why: { garden: '土いじりが何よりの楽しみなので', fishing: 'のんびり過ごしたくて', grandkids: '孫の顔を見るのが生きがいなので', storytell: '昔のことを若い者に伝えたくて', rest: '無理のきかない歳なので', stroll: '足腰が弱らないよう' },
    thoughts: ['もう多くは望まない。', '若いころの苦労も、今となってはいい思い出だ。', '日だまりで茶を飲む。これ以上の贅沢はない。'],
  },
  child: {
    name: '一人前になる',
    bias: { play: 0.4, school: 0.6, help: 0.4 },
    why: { play: '遊びたくてたまらないので', school: '早く一人前になりたくて', help: '親の仕事を覚えるため' },
    thoughts: ['早く大人になりたいな。', '大きくなったら、何になろう。'],
  },
};

// ---------- いまの計画（数日〜数十日） ----------
const PLAN = {
  debt: { bias: { work: 1.6, tavern: -1.2, stroll: -0.4, plaza: -0.4, festival: -0.3 }, why: { work: '借金を返すため' } },
  nurse: { bias: { nurse: 2, work: -0.8, tavern: -1.5, stroll: -0.8, travel: -2, quest: -2 }, why: { nurse: '{t}を看病するため', work: '{t}の薬代を稼ぐため' } },
  revenge: { bias: { train: 1.5, revenge: 1.5, quest: 1, hunt: 1 }, why: { train: '{t}への仇討ちに備えるため', revenge: '{t}に報いを受けさせるため' } },
  court: { bias: { court: 2, plaza: 0.4, stroll: 0.2, visit: 0.3 }, why: { court: '{t}に想いを伝えるため', plaza: '{t}に会えるかもしれないので' } },
  baby: { bias: { work: 1, home: 0.8, shop: 0.6, tavern: -1, quest: -1.5, travel: -1 }, why: { work: 'もうすぐ生まれる子のために蓄えるため', home: '身重の{t}のそばにいるため', shop: '生まれてくる子の支度のため' } },
  save: { bias: { work: 1.2, tavern: -0.8, stroll: -0.3 }, why: { work: '{t}ための蓄えをつくるため' } },
  appr: { bias: { work: 1.5, tavern: -0.4 }, why: { work: '{t}師匠のもとで一人前になるため' } },
  quest: { bias: { quest: 1.5, gather: 1.5, hunt: 1.5, report: 1.5, guild: 0.8 }, why: { quest: '引き受けた依頼を果たすため', gather: '依頼の品を集めるため', hunt: '依頼の賞金首を追うため', report: '依頼の報告のため' } },
  mourn: { bias: { grave: 1.5, pray: 1, tavern: -0.5, festival: -1, plaza: -0.5 }, why: { grave: '亡き{t}を弔うため', pray: '亡き{t}の冥福を祈るため' } },
  house: { bias: { work: 1.5, tavern: -1 }, why: { work: '住む家を手に入れるため' } },
  study: { bias: { study: 1.5, school: 1 }, why: { study: '{t}ため' } },
  train: { bias: { train: 1.5, buygear: 0.5 }, why: { train: '腕を磨いて強くなるため' } },
  kids: { bias: { childcare: 1.2, home: 0.6, cook: 0.5, tavern: -0.6 }, why: { childcare: '幼い{t}を育てるため', home: '幼い{t}のそばにいるため' } },
  devotion: { bias: { pray: 1.5 }, why: { pray: '毎日の祈りを欠かさないため' } },
  amends: { bias: { help: 1, nurse: 1, pray: 0.8, water: 0.5 }, why: { help: '償いのため' } },
  wander: { bias: { travel: 1.2, stroll: 0.8 }, why: { travel: '次の土地を見てみたくて' } },
  daily: { bias: {}, why: {} },
};

// ---------- 生活の癖 ----------
// type：行動、kind：場所、days：'all' / 'work'（働く日） / 'rest'（休みの日） / 数（7日のうちその曜日）
const HABITS = {
  morningwalk: { txt: '朝の散歩', why: '毎朝の散歩が日課なので', type: 'stroll', kind: 'stroll', dur: [20, 40] },
  dogwalk: { txt: '朝の犬の散歩', why: '犬を散歩させるのが朝の日課なので', type: 'stroll', kind: 'stroll', dur: [20, 35] },
  morningtrain: { txt: '朝の素振り', why: '朝の素振りを欠かしたことがないので', type: 'train', kind: 'train', dur: [30, 50] },
  morningprayer: { txt: '朝の祈り', why: '朝いちばんに祈るのが習いなので', type: 'pray', kind: 'church', dur: [15, 30] },
  noondrink: { txt: '昼の一杯', why: '昼に一杯ひっかけるのが楽しみなので', type: 'tavern', kind: 'tavern', dur: [25, 40] },
  plazachat: { txt: '広場での世間話', why: '広場で顔なじみと話すのが日課なので', type: 'plaza', kind: 'plaza', dur: [30, 60] },
  eveprayer: { txt: '夕方の礼拝', why: '夕べの祈りを欠かさないので', type: 'pray', kind: 'church', dur: [20, 40] },
  aftertavern: { txt: '仕事帰りの酒場', why: '仕事帰りの一杯が何よりの楽しみなので', type: 'tavern', kind: 'tavern', dur: [50, 100] },
  garden: { txt: '夕方の庭いじり', why: '夕方に庭をいじるのが好きなので', type: 'garden', kind: 'home', dur: [40, 70] },
  readnight: { txt: '夜の読書', why: '寝る前に書物を読むのが習いなので', type: 'study', kind: 'home', dur: [40, 80] },
  holidayfish: { txt: '休日の釣り', why: '休みの日は釣りと決めているので', type: 'fishing', kind: 'shore', dur: [90, 180] },
  holidaychurch: { txt: '休日の教会', why: '休みの日の朝は教会へ行くものだから', type: 'pray', kind: 'church', dur: [40, 70] },
  holidaywalk: { txt: '休日の遠歩き', why: '休みの日は町の外まで歩くのが好きなので', type: 'stroll', kind: 'stroll', dur: [60, 120] },
  visitparents: { txt: '親の家に顔を出す', why: '週に一度は親の顔を見に行くと決めているので', type: 'visit', kind: 'parent', dur: [40, 80] },
  graveweekly: { txt: '墓参り', why: '亡き人の墓に花を手向けるのが習いなので', type: 'grave', kind: 'church', dur: [20, 40] },
};
const HABIT_TYPES = new Set(Object.values(HABITS).map((h) => h.type));

// 補正をかけない行動（命・務め・集まり）
const NO_BIAS = new Set(['flee', 'sleep', 'jail', 'march', 'crusade', 'defend', 'deliver', 'sickbed', 'funeral', 'wedding', 'festival', 'levy', 'escort', 'sail', 'riot', 'strike']);
// 休日も働く務めの仕事
const ESSENTIAL = new Set(['innkeeper', 'guard', 'knight', 'soldier', 'jailer', 'king', 'servant', 'gatekeeper', 'militia', 'watchman', 'royalguard', 'doctor', 'midwife']);
const DUTY_JOBS = new Set(['king', 'royal', 'noble', 'knight', 'soldier', 'general', 'royalguard', 'chancellor', 'treasurer', 'guard', 'jailer', 'gatekeeper', 'militia', 'watchman', 'paladin']);
const LEARNED = new Set(['scholar', 'wizard', 'sage', 'teacher', 'alchemist', 'doctor', 'scribe', 'courtmage', 'astronomer', 'herbalist']);
const FIGHT_JOBS = new Set(['knight', 'soldier', 'adventurer', 'guard', 'royalguard', 'general', 'paladin', 'watchman', 'militia', 'hunter']);
const OUTLAW = new Set(['thief', 'pickpocket', 'swindler', 'banditchief', 'pirate', 'smuggler']);
const DREAM_LIFE = {
  '伝説の魔物を倒す': 'fame', '魔王を討って名を残す': 'fame', '騎士に取り立てられる': 'fame', '王様に認められる': 'fame',
  '大金持ちになる': 'wealth', '自分の店を持つ': 'wealth', '星の運行の謎を解く': 'knowledge', '新しい魔法を編み出す': 'knowledge', '砂漠の古代遺跡の秘密を知る': 'knowledge',
  '世界の端を確かめる': 'freedom', '海の向こうへ渡る': 'freedom', '誰にも頭を下げずに生きる': 'freedom', '王都を一度この目で見る': 'freedom',
  'だれかに心から愛される': 'love', '故郷に錦を飾る': 'homecoming', '子どもたちに立派な家を残す': 'family', 'もう一度家族と暮らす': 'family',
  '静かに年をとる': 'peace', '誰よりもうまいパンを焼く': 'craft', '村いちばんの麦畑をつくる': 'craft',
};

// ---------- 準備 ----------
function kidsOf(sim, p, maxAge = 16) { return (p.children || []).map((id) => alive(sim, id)).filter((q) => q && sim.ageOf(q) < maxAge); }
function kinName(sim, p, q) { const t = sim.kinTerm(p, q); return t ? `${t}の${q.given}` : q.given; }
function ensure(sim, p) {
  if (p.pur && p.pur.v === 1) return p.pur;
  const u = p.pur = { v: 1, life: null, st: 0.8, lifeWhy: '', since: sim.today, target: null, prev: [], memMin: sim.S.t, plan: null, today: null, hab: null, hd: {} };
  chooseLife(sim, p, null);
  u.hab = makeHabits(sim, p);
  return u;
}

// 目的の候補と重み、その理由
function lifeOptions(sim, p) {
  const age = sim.ageOf(p), v = p.values || {}, P = p.pers || {}, job = p.job, hh = sim.hh(p);
  const out = [];
  const push = (k, w, why, target = null) => { if (w > 0.05) out.push({ k, w, why, target }); };
  if (age < 14) { push('child', 1, 'まだ子どもだから'); return out; }
  const dreamK = DREAM_LIFE[p.dream];
  const dreamW = (k) => (dreamK === k ? 1.6 : 0);
  const sp = alive(sim, p.spouseId);
  const kids = kidsOf(sim, p);
  // 家族を守る
  {
    const fam = (sp ? 1 : 0) + Math.min(3, kids.length) * 0.6;
    const why = kids.length ? `${sp ? `${sp.given}と` : ''}${kids.length}人の子がいるから` : sp ? `${sp.given}と所帯を持ったから` : '家族が何より大事だと育てられたから';
    push('family', (v.family || 0.5) * 2.4 + fam + (P.A || 0.5) * 0.4 + dreamW('family') - (fam ? 0 : 1.2), why);
  }
  // 名を上げる
  {
    const story = (p.memories || []).find((m) => m.k === 'story');
    const why = dreamK === 'fame' ? `「${p.dream}」と心に決めているから` : story ? story.txt.replace(/と聞かされて育った$/, '') + 'と聞かされて育ったから' : FIGHT_JOBS.has(job) ? `${jobName(job)}として生きる以上は` : '人に認められたいから';
    push('fame', (v.ambition || 0.5) * 1.8 + (v.courage || 0.5) * 1.4 + (FIGHT_JOBS.has(job) ? 1 : 0) + (job === 'adventurer' ? 1.2 : 0) + (story ? 0.4 : 0) + dreamW('fame') - (age > 55 ? 1.5 : 0), why);
  }
  // 神に仕える
  {
    const cleric = ['priest', 'nun', 'monk', 'paladin', 'cleric'].includes(job);
    const g = p.grief && p.grief.lv > 30 ? alive(sim, p.grief.who) || sim.S.people[p.grief.who] : null;
    const why = cleric ? `${jobName(job)}として神に身を捧げたから` : g ? `${kinName(sim, p, g)}を亡くしてから、祈りだけが支えだから` : '信心深い家に育ったから';
    push('faith', (v.faith || 0.5) ** 2 * 3.2 + (cleric ? 3 : 0) + (g ? 0.8 : 0) - (v.ambition || 0.5) * 0.4, why);
  }
  // 金持ちになる
  {
    const poor = (hh?.money || 0) < 40;
    const why = dreamK === 'wealth' ? `「${p.dream}」のが夢だから` : poor ? '貧しさはもうこりごりだから' : job === 'merchant' ? '商いの面白さに取りつかれたから' : '金さえあれば何でもできると思うから';
    push('wealth', (v.ambition || 0.5) * 1.6 + (1 - (P.A || 0.5)) * 0.8 + (['merchant', 'jeweler', 'changer', 'banker', 'smuggler'].includes(job) ? 1.2 : 0) + (poor ? 0.4 : 0) + dreamW('wealth'), why);
  }
  // 愛する人と添い遂げる
  if (age >= 16) {
    if (sp && sim.rel(p, sp).a > 60) push('love', 1.2 + (P.E || 0.5) * 0.4 + dreamW('love'), `${sp.given}と生涯をともにすると誓ったから`, sp.id);
    else if (!sp && age < 45) {
      const cr = sim.crushOf(p);
      if (cr) push('love', 1.4 + (P.E || 0.5) * 0.6 + (P.N || 0.5) * 0.4 + dreamW('love'), `${cr.given}のことが忘れられないから`, cr.id);
      else if (dreamK === 'love') push('love', 1.2, '誰かに心から愛されたいから');
    }
  }
  // 仇を討つ
  {
    const foe = alive(sim, p.revenge);
    if (foe) {
      const d = (p.memories || []).find((m) => m.k === 'death' && m.emo < -0.8);
      push('revenge', 3 + (v.courage || 0.5) * 1.5 + (1 - (P.A || 0.5)) * 1.5, d ? `${d.txt.replace(/。$/, '')}。その手を下した${foe.given}を許せないから` : `${foe.given}を許せないから`, foe.id);
    } else if (p.vendetta) {
      const nm = SPECIES[p.vendetta]?.name || (p.vendetta === 'demon' ? '魔王軍' : '魔物');
      push('revenge', 2.2 + (v.courage || 0.5) * 1.5, `家族を奪った${nm}を許せないから`, null);
    }
  }
  // 知識を極める
  {
    const why = LEARNED.has(job) ? `${jobName(job)}として、まだ知らないことが多すぎるから` : dreamK === 'knowledge' ? `「${p.dream}」のが夢だから` : '子どものころから、なぜなぜと聞いてばかりいたから';
    push('knowledge', (P.O || 0.5) ** 2 * 2.6 + (P.C || 0.5) * 0.4 + (LEARNED.has(job) ? 2.4 : 0) + ((p.skill?.study || 0) > 0.3 ? 0.6 : 0) + dreamW('knowledge'), why);
  }
  // 自由に生きる
  {
    const why = ['wanderer', 'bard', 'sailor'].includes(job) ? `${jobName(job)}の暮らしが性に合っているから` : dreamK === 'freedom' ? `「${p.dream}」のが夢だから` : '決まりごとに縛られるのが嫌いだから';
    push('freedom', (P.O || 0.5) * 1 + (1 - (P.C || 0.5)) * 1.4 + (['wanderer', 'bard', 'sailor', 'troupe'].includes(job) ? 1.8 : 0) + (1 - (v.family || 0.5)) * 0.6 + dreamW('freedom') - (kids.length ? 1 : 0), why);
  }
  // 故郷に錦を飾る
  if (p.origin || dreamK === 'homecoming') {
    const why = p.origin ? `${p.origin}から出てきて、まだ何も成していないから` : `「${p.dream}」と誓ったから`;
    push('homecoming', (p.origin ? 1.2 : 0.4) + (v.ambition || 0.5) * 1.2 + dreamW('homecoming'), why);
  }
  // 罪を償う
  {
    const sin = (p.memories || []).find((m) => ['crime', 'uwcrime', 'theft', 'outlaw'].includes(m.k) && m.emo < -0.2);
    const bad = OUTLAW.has(job) || p.formerJob && OUTLAW.has(p.formerJob);
    if (sin || bad) push('atone', 0.6 + (P.A || 0.5) * 1.8 + (v.faith || 0.5) * 1.2 - (bad && !sin ? 0.8 : 0), sin ? `${sin.txt.replace(/。$/, '')}ことが、今も胸に刺さっているから` : '人に言えない過去があるから');
  }
  // 腕を極める
  if (JOBS[job]?.goods || ['farmer', 'fisher', 'hunter', 'miner', 'cook'].includes(job)) {
    const sk = p.skill?.[job] || 0.3;
    push('craft', (P.C || 0.5) * 1.8 + sk * 1.2 + dreamW('craft') + (p.appr ? 0.8 : 0), p.appr ? '師匠を超える職人になりたいから' : dreamK === 'craft' ? `「${p.dream}」のが夢だから` : `${jobName(job)}の仕事に誇りを持っているから`);
  }
  // 国と主君に仕える
  if (DUTY_JOBS.has(job)) push('duty', 1.4 + (P.C || 0.5) * 1.4 + (v.faith || 0.5) * 0.3, ['king', 'royal', 'noble'].includes(job) ? '生まれながらに民を背負う身だから' : `${jobName(job)}として主君に忠誠を誓ったから`);
  // 今日を生き延びる
  if (hh?.street || job === 'beggar' || (!job && age < 60 && (hh?.money || 0) < 15)) push('survive', 2.6, hh?.street ? '住む家もなく、明日の食べ物もわからないから' : '日々の食べ物にも事欠くから');
  // 穏やかに老いる
  if (age >= 58) push('peace', 1 + (age - 58) / 10 + (p.retired ? 0.8 : 0) + (1 - (v.ambition || 0.5)) * 0.8 + dreamW('peace'), p.retired ? '長い働きを終えたから' : '歳を重ねて、欲がなくなってきたから');
  return out;
}

function chooseLife(sim, p, reason, forceK = null) {
  const u = p.pur;
  const opts = lifeOptions(sim, p);
  let pick = forceK ? opts.find((o) => o.k === forceK) : null;
  if (!pick) {
    if (!opts.length) opts.push({ k: 'family', w: 1, why: '暮らしを守るため' });
    // 強い目的ほど選ばれやすいが、同じ条件の人がみな同じにならないように揺らぎを入れる
    pick = sim.rng.weighted(opts, (o) => Math.pow(Math.max(0.05, o.w), 2.2));
  }
  const old = u.life;
  if (old && old !== pick.k) { u.prev.push({ k: old, d: sim.today }); if (u.prev.length > 5) u.prev.shift(); }
  u.life = pick.k; u.lifeWhy = pick.why; u.target = pick.target ?? null;
  u.since = sim.today;
  u.st = clampN(0.6 + Math.min(0.6, pick.w / 6), 0.6, 1.2);
  if (old && old !== pick.k && reason) {
    stat(sim, 'changed');
    sim.remember(p, `${reason}。これからは${LIFE[pick.k].name}ために生きようと心に決めた`, { emo: 0.2, imp: 0.75, k: 'purpose' });
  }
}

// ---------- 生活の癖（一度だけ作る） ----------
function makeHabits(sim, p) {
  const age = sim.ageOf(p), P = p.pers || {}, v = p.values || {}, job = p.job;
  const r = (k) => hash01(p.id, k);
  // 仕事を始める時刻と、1日に働く長さ
  const chrono = p.sleepType === 'short' ? -0.5 : p.sleepType === 'long' ? 0.6 : 0;
  const early = ['baker', 'farmer', 'fisher', 'miller', 'stablehand', 'rancher', 'shepherd'].includes(job) ? -0.6 : 0;
  const ws = clampN(7 + chrono + early + (1 - (P.C || 0.5)) * 1.2 + (r(1) - 0.35) * 1.2, 7, 9.2);
  const len = clampN(6.6 + (P.C || 0.5) * 1.4 + (v.ambition || 0.5) * 0.8 + (r(2) - 0.5) * 1.2, 5.8, 9);
  const hab = { ws: Math.round(ws * 4) / 4, len: Math.round(len * 4) / 4, list: [] };
  if (age < 14) return hab;
  const we = hab.ws + hab.len;
  const opts = [];
  const add = (k, w, h0, days = 'all') => { if (w > 0.05) opts.push({ k, w, h0, days }); };
  const hasDog = Object.values(sim.S.creatures || {}).some((c) => c.master === p.id && c.sp === 'dog' && c.hp > 0);
  if (hasDog) add('dogwalk', 2.5, hab.ws - 1.1);
  add('morningwalk', (P.O || 0.5) * 0.8 + (age > 50 ? 0.8 : 0) + (P.C || 0.5) * 0.3, hab.ws - 1.2 + r(3) * 0.3);
  if (FIGHT_JOBS.has(job)) add('morningtrain', (P.C || 0.5) * 1.2 + (v.ambition || 0.5) * 0.6, hab.ws - 1.3);
  add('morningprayer', Math.max(0, (v.faith || 0.5) - 0.55) * 3, hab.ws - 0.9);
  if (age >= 18) add('noondrink', Math.max(0, (P.E || 0.5) - 0.5) * 1.6 + Math.max(0, (P.N || 0.5) - 0.6), 12 + r(4) * 0.5, 'work');
  add('plazachat', Math.max(0, (P.E || 0.5) - 0.45) * 1.2 + Math.max(0, (P.A || 0.5) - 0.5), Math.min(19, we + 0.3 + r(5)), 'work');
  add('eveprayer', Math.max(0, (v.faith || 0.5) - 0.5) * 2.4, Math.min(18.5, we + 0.2));
  if (age >= 18) add('aftertavern', Math.max(0, (P.E || 0.5) - 0.35) * 1.6 + (p.sex === 'm' ? 0.2 : 0), Math.min(20, we + 0.1 + r(6) * 0.6), r(7) < 0.5 ? 'work' : 'all');
  if (age >= 35) add('garden', (P.C || 0.5) * 0.8 + (1 - (P.E || 0.5)) * 0.4, Math.min(18, we + 0.4));
  if ((P.O || 0.5) > 0.6 || LEARNED.has(job)) add('readnight', (P.O || 0.5) * 1.2 + (LEARNED.has(job) ? 1 : 0), 19.2 + r(8));
  add('holidayfish', Math.max(0, (1 - (P.E || 0.5)) - 0.35) * 1.8 + (['fisher', 'sailor'].includes(job) ? 0 : 0.15), 8.5 + r(9), 'rest');
  add('holidaychurch', Math.max(0, (v.faith || 0.5) - 0.4) * 1.5, 8.6, 'rest');
  add('holidaywalk', (P.O || 0.5) * 0.9, 9 + r(10) * 2, 'rest');
  const par = [p.fatherId, p.motherId].map((id) => alive(sim, id)).find((q) => q && q.hh !== p.hh && q.s === p.s);
  if (par) add('visitparents', (v.family || 0.5) * 1.6, Math.min(19, we + 0.5), Math.floor(r(11) * 7));
  const close = new Set([p.fatherId, p.motherId, ...(p.exSpouses || []), ...(p.children || [])].filter((x) => x != null));
  if ((p.memories || []).some((m) => m.k === 'death' && close.has(m.about?.[0]) && sim.today - m.t < DAYS_PER_YEAR * 5)) add('graveweekly', (v.faith || 0.5) * 1.2 + (v.family || 0.5) * 0.4, 9 + r(12) * 3, Math.floor(r(13) * 7));
  // 重みの大きいものから、癖は多くて3つ（人によっては0〜1）
  const n = r(14) < 0.15 ? 1 : r(14) < 0.55 ? 2 : 3;
  const picked = [];
  const pool = opts.slice();
  while (picked.length < n && pool.length) {
    const o = sim.rng.weighted(pool, (x) => x.w * x.w);
    pool.splice(pool.indexOf(o), 1);
    if (o.w < 0.35) continue;
    if (picked.some((q) => Math.abs(q.h0 - o.h0) < 1 && q.days === o.days)) continue;
    picked.push(o);
  }
  for (const o of picked) {
    const H = HABITS[o.k];
    const h0 = Math.max(5.5, Math.round(o.h0 * 4) / 4);
    hab.list.push({ k: o.k, h0, h1: h0 + 1.25, days: o.days, w: Math.min(1.5, o.w), type: H.type, kind: H.kind, txt: H.txt, why: H.why, dur: H.dur });
  }
  return hab;
}

// ---------- 計画（毎日見直す） ----------
function planOptions(sim, p) {
  const u = p.pur, age = sim.ageOf(p), hh = sim.hh(p), S = sim.S;
  const out = [];
  const L = u.life;
  const push = (k, w, txt, target = null) => out.push({ k, w: w + (u.plan?.k === k ? 1 : 0), txt, target });
  if (age < 14) { push('daily', 1, age >= 6 ? '学校でしっかり学ぶ' : '元気に遊ぶ'); return out; }
  const debts = debtsOf(sim, p);
  if (debts.length) { const owed = Math.round(debts.reduce((s, l) => s + (l.owed || 0), 0)); push('debt', 5 + (L === 'wealth' ? 1 : 0), `借金（${owed}銅貨）を返す`); }
  if (hh) for (const id of hh.members) {
    const q = S.people[id];
    if (q && q !== p && q.ail && q.ail.carer === p.id) { push('nurse', 6 + (L === 'family' ? 1.5 : 0), `寝込んでいる${kinName(sim, p, q)}を看病する`, q.id); break; }
  }
  const foe = alive(sim, p.revenge);
  if (foe) push('revenge', 3.5 + (L === 'revenge' ? 3 : 0), `${foe.given}に報いを受けさせる`, foe.id);
  else if (p.vendetta && L === 'revenge') push('revenge', 4, `家族を奪った${SPECIES[p.vendetta]?.name || '魔物'}を討つ`);
  if (p.spouseId == null && age >= 17 && age < 50) {
    const cr = u.life === 'love' && alive(sim, u.target) || sim.crushOf(p);
    if (cr) push('court', 1.8 + (L === 'love' ? 3.5 : 0) + (p.pers?.E || 0.5), `${cr.given}に想いを伝える`, cr.id);
  }
  const wife = p.sex === 'f' ? p : alive(sim, p.spouseId);
  if (wife && wife.pregnant > 0) push('baby', 3.5 + (L === 'family' ? 1.5 : 0), 'もうすぐ生まれる子を迎える支度をする', wife === p ? null : wife.id);
  if (p.plan && (p.plan.stage === 'saving' || p.plan.stage === 'waiting')) push('save', 2.5 + (['wealth', 'homecoming', 'craft', 'family'].includes(L) ? 2 : 0), `${p.plan.txt}ための蓄えをする`, p.plan.txt);
  if (p.appr && p.master != null) { const m = alive(sim, p.master); if (m) push('appr', 3 + (L === 'craft' ? 2 : 0), `${m.given}師匠のもとで一人前になる`, m.given); }
  if (p.quest != null) { const q = (S.quests || []).find((x) => x.id === p.quest); if (q) push('quest', 3 + (L === 'fame' ? 2 : 0), `依頼「${q.title}」を果たす`); }
  if (p.grief && p.grief.lv > 35) { const d = S.people[p.grief.who]; if (d) push('mourn', 2.5 + p.grief.lv / 30, `亡き${kinName(sim, p, d)}を弔う`, d.id); }
  if (hh?.street) push('house', 4 + (L === 'family' ? 1 : 0), '雨露をしのげる家を手に入れる');
  if (L === 'knowledge') {
    const topic = ['wizard', 'courtmage'].includes(p.job) ? '新しい呪文の組み立てを確かめる' : p.job === 'doctor' || p.job === 'herbalist' ? '薬草の効き目を書き留める' : p.job === 'scholar' || p.job === 'sage' ? '古い書物を読み解く' : p.job === 'priest' ? '聖典を学び直す' : sim.rng.pick(['星の動きを書き留める', '古い言い伝えを調べる', '読み書きを身につける']);
    push('study', 2.8, topic, topic);
  }
  if ((L === 'fame' || L === 'duty' || L === 'revenge') && age < 55) push('train', 2 + (L === 'fame' ? 0.8 : 0), '腕を磨いて強くなる');
  const small = kidsOf(sim, p, 6).filter((k) => k.hh === p.hh);
  if (small.length) push('kids', 2 + (p.values?.family || 0.5) * 1.5 + (L === 'family' ? 1 : 0), `幼い${small[0].given}を育てる`, small[0].given);
  if (L === 'faith') push('devotion', 2.2, '毎日欠かさず祈りを捧げる');
  if (L === 'atone') push('amends', 2.6, '人の役に立って罪を償う');
  if (L === 'freedom') push('wander', 1.6, '気ままに暮らして、次の旅に備える');
  push('daily', 1, L === 'peace' ? '日々をのんびり過ごす' : '毎日の暮らしを回す');
  return out;
}
function choosePlan(sim, p) {
  const u = p.pur;
  const opts = planOptions(sim, p);
  opts.sort((a, b) => b.w - a.w);
  // 上位2つのうち、重みの差が小さければ人によって選ぶものが変わる
  let pick = opts[0];
  if (opts[1] && opts[1].w > opts[0].w - 0.8 && hash01(p.id, sim.today) < 0.35) pick = opts[1];
  if (!u.plan || u.plan.k !== pick.k || u.plan.target !== pick.target) u.plan = { k: pick.k, txt: pick.txt, since: sim.today, target: pick.target };
  else u.plan.txt = pick.txt;
}

// ---------- 今日の心づもり（その日の最初の判断で決める） ----------
function planToday(sim, p) {
  const u = p.pur, age = sim.ageOf(p), R = sim.rng, L = u.life, pk = u.plan?.k;
  const hab = u.hab || (u.hab = makeHabits(sim, p));
  const we = Math.min(17, hab.ws + hab.len);
  const t = { day: sim.today, k: 'none', type: null, h0: 0, h1: 0, kind: null, friend: null, txt: '', why: '', cut: null, done: false };
  u.today = t;
  if (age < 14 || p.jail != null) { t.txt = age < 14 ? '今日もいっぱい遊ぶ' : ''; return; }
  const rest = sim.isRestDay();
  const opts = [];
  const doy = sim.dayOfYear();
  // 家族の誕生日（明日か今日）
  if (!u.gift || u.gift.day < sim.today) {
    const fam = [...kidsOf(sim, p, 16).filter((k) => k.hh === p.hh), alive(sim, p.spouseId)].filter(Boolean);
    for (const q of fam) {
      const d = (q.birthDay - doy + DAYS_PER_YEAR) % DAYS_PER_YEAR;
      if (d === 1 || d === 0) {
        const nm = kinName(sim, p, q);
        opts.push({ w: 3 + (p.values?.family || 0.5) * 3, k: 'gift', type: 'errand', kind: 'market', friend: q.id, h0: Math.max(12, we - 1.5), h1: 19, cut: Math.max(12, we - 1.5),
          txt: `${d ? '明日' : '今日'}は${nm}の誕生日。仕事を早めに切り上げて贈り物を買う`, why: `${nm}の誕生日の贈り物を買うため` });
        break;
      }
    }
  }
  if (pk === 'debt' || pk === 'house' || (pk === 'save' && L === 'wealth') || pk === 'baby') {
    const J = JOBS[p.job];
    if (J && !rest && !J.combat && (J.goods || ['farmer', 'fisher', 'merchant', 'miller'].includes(p.job)) && age < 65) {
      const why = PLAN[pk].why.work.replace('{t}', u.plan.target || '');
      opts.push({ w: 2 + (pk === 'debt' ? 1.5 : 0), k: 'overtime', type: 'work', kind: 'work', h0: 17, h1: 19.5, txt: `${why.replace(/ため$/, '')}ため、今日は日が暮れるまで働く`, why: `${why.replace(/ため$/, '')}ため、日が暮れても働いている` });
    }
  }
  if (pk === 'court' && alive(sim, u.plan.target)) {
    const q = alive(sim, u.plan.target);
    opts.push({ w: 2.5 + (L === 'love' ? 1.5 : 0), k: 'court', type: 'court', kind: 'court', friend: q.id, h0: Math.min(19, we), h1: 21, cut: L === 'love' && R.chance(0.4) ? we - 1 : null, txt: `仕事が終わったら${q.given}に会いに行く`, why: `${q.given}に会うため` });
  }
  if (L === 'faith' || pk === 'devotion') opts.push({ w: 2, k: 'pray', type: 'pray', kind: 'church', h0: 6, h1: 8, txt: '朝いちばんに教会で祈る', why: '一日を祈りから始めるため' });
  if (L === 'knowledge' || pk === 'study') opts.push({ w: 2.2, k: 'study', type: 'study', kind: 'study', h0: rest ? 9 : Math.min(19, we + 0.5), h1: rest ? 13 : 21.5, txt: `${rest ? '休みの日を使って' : '夜は'}${u.plan?.k === 'study' ? u.plan.txt : '書物を読む'}`, why: u.plan?.k === 'study' ? `${u.plan.txt}ため` : '学ぶため' });
  if ((L === 'fame' || L === 'revenge' || pk === 'train' || (L === 'duty' && FIGHT_JOBS.has(p.job))) && age < 55) opts.push({ w: 2, k: 'train', type: 'train', kind: 'train', h0: rest ? 9 : Math.min(18.5, we), h1: rest ? 12 : 20, txt: rest ? '休みの日こそ鍛錬に打ち込む' : '仕事のあとに鍛錬する', why: L === 'revenge' ? '仇を討つ力をつけるため' : '腕を磨くため' });
  if ((L === 'freedom' || L === 'peace') && rest) opts.push({ w: 2, k: 'fish', type: 'fishing', kind: 'shore', h0: 8, h1: 14, txt: '休みだから、朝から釣りに出る', why: '休みの日をのんびり過ごすため' });
  if (L === 'freedom' && !rest && !ESSENTIAL.has(p.job) && R.chance(0.35)) opts.push({ w: 1.6, k: 'earlyoff', type: 'stroll', kind: 'stroll', h0: we - 2, h1: 18.5, cut: we - 2, txt: '今日は仕事を早めに切り上げて、ぶらぶらする', why: '今日は早めに仕事を切り上げたので' });
  if (L === 'family') {
    const par = [p.fatherId, p.motherId].map((id) => alive(sim, id)).find((q) => q && q.hh !== p.hh && q.s === p.s && sim.ageOf(q) >= 60);
    if (par && R.chance(0.3)) opts.push({ w: 1.8, k: 'visitpar', type: 'visit', kind: 'friend', friend: par.id, h0: Math.min(19, we + 0.3), h1: 20.5, txt: `年老いた${kinName(sim, p, par)}の様子を見に行く`, why: `年老いた${kinName(sim, p, par)}の様子を見るため` });
    if (rest && kidsOf(sim, p, 13).some((k) => k.hh === p.hh)) opts.push({ w: 1.6, k: 'kids', type: 'home', kind: 'home', h0: 9, h1: 16, txt: '休みの日は子どもたちと家で過ごす', why: '休みの日は子どもたちと過ごすと決めているので' });
  }
  if (L === 'atone') opts.push({ w: 1.6, k: 'amends', type: 'help', kind: 'none', h0: 0, h1: 0, txt: '今日も誰かの役に立つ', why: '' });
  if (pk === 'mourn') opts.push({ w: 2, k: 'grave', type: 'grave', kind: 'church', friend: p.grief?.who, h0: 8, h1: 12, txt: `亡き${kinName(sim, p, sim.S.people[p.grief.who] || { given: '人' })}の墓に花を手向ける`, why: '亡き人を弔うため' });
  if (L === 'wealth' && !rest && p.job === 'merchant') opts.push({ w: 1.5, k: 'market', type: 'work', kind: 'work', h0: 6.5, h1: 8, txt: '朝市が開く前に店を開ける', why: '朝市の客を逃さないため' });
  // その日の気分で「何も決めない」日もある
  opts.push({ w: 1.2 + (1 - (p.pers?.C || 0.5)), k: 'none', type: null, txt: rest ? '休みの日。のんびり過ごす' : 'いつもどおり働く', why: '' });
  const o = R.weighted(opts, (x) => x.w * x.w);
  Object.assign(t, { k: o.k, type: o.type, kind: o.kind || null, friend: o.friend ?? null, h0: o.h0 || 0, h1: o.h1 || 0, cut: o.cut ?? null, txt: o.txt, why: o.why });
}

// 心づもり・癖の行き先
function placeOf(sim, p, kind, friend) {
  const s = sim.townOf(p);
  switch (kind) {
    case 'stroll': return sim.strollSpot(p);
    case 'train': { const b = sim.townBuilding(s, 'dojo') || sim.townBuilding(s, 'barracks') || sim.townBuilding(s, 'guild'); return b ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : sim.placeFor(p, 'plaza'); }
    case 'study': { const b = sim.townBuilding(s, 'academy') || sim.townBuilding(s, 'school') || sim.townBuilding(s, 'magictower') || sim.townBuilding(s, 'church'); return b && sim.hour() < 19 ? { x: b.door.x, z: b.door.z, bld: b.open ? null : b.id } : sim.placeFor(p, 'home'); }
    case 'work': { const J = JOBS[p.job]; return J ? careerWorkPlace(sim, p) || sim.placeFor(p, J.place) : null; }
    case 'court': case 'friend': { const q = alive(sim, friend); return q ? sim.placeFor(q, q.inside ? 'home' : 'home') : null; }
    case 'parent': { const q = [p.fatherId, p.motherId].map((id) => alive(sim, id)).find((x) => x && x.hh !== p.hh && x.s === p.s); return q ? { ...sim.placeFor(q, 'home'), friend: q.id } : null; }
    case 'none': return null;
    default: return sim.placeFor(p, kind);
  }
}
const inWin = (h, h0, h1) => h >= h0 && h < h1;
function habitToday(sim, hb) {
  const d = sim.today % 7, rest = sim.isRestDay();
  if (hb.days === 'all') return true;
  if (hb.days === 'work') return !rest;
  if (hb.days === 'rest') return rest;
  return hb.days === d;
}

// ---------- decide から ----------
export function purposeDecide(sim, p, cands, add) {
  if (!p.needs) return;
  const u = ensure(sim, p);
  if (!u.plan) choosePlan(sim, p);
  if (!u.today || u.today.day !== sim.today) planToday(sim, p);
  const h = sim.hour(), age = sim.ageOf(p), n = p.needs, R = sim.rng;
  const hab = u.hab;
  const L = LIFE[u.life] || LIFE.family, P = PLAN[u.plan?.k] || PLAN.daily;
  const t = u.today;
  const urgent = n.hunger < 25 || n.sleep < 12 || n.survival < 35 || p.ail?.sev > 40;
  const workAge = age >= 14 && age <= 67 && p.job;
  // 今日の心づもり
  if (t && t.type && !t.done && inWin(h, t.h0, t.h1) && !urgent) {
    if (t.type === 'work') {
      if (workAge && p.workedToday < 11 * 60 && n.sleep > 20) { const pl = placeOf(sim, p, 'work'); if (pl) add(5.2, 'work', pl, R.int(60, 120), { pk: 'today' }); }
    } else if (t.type === 'grave') {
      if (t.friend != null) add(5 + (p.values?.faith || 0.5), 'grave', sim.placeFor(p, 'church'), R.int(20, 40), { friend: t.friend, pk: 'today' });
    } else if (t.type !== 'help') {
      const pl = placeOf(sim, p, t.kind, t.friend);
      if (pl) add(5.5 + (t.k === 'gift' ? 1.5 : 0), t.type, pl, t.type === 'errand' ? 20 : t.type === 'home' ? R.int(60, 120) : R.int(40, 90), { friend: t.friend ?? pl.friend, pk: 'today' });
    }
  }
  // 生活の癖
  if (hab && !urgent) for (const hb of hab.list) {
    if (!inWin(h, hb.h0, hb.h1) || u.hd[hb.k] === sim.today || !habitToday(sim, hb)) continue;
    if (hb.type === 'tavern' && spendable(sim, p) < 8) continue;
    if (hb.type === 'train' && age > 60) continue;
    const pl = placeOf(sim, p, hb.kind);
    if (!pl) continue;
    add(4.2 + hb.w, hb.type, pl, R.int(hb.dur[0], hb.dur[1]), { friend: pl.friend, pk: 'habit:' + hb.k });
  }
  // 点数の補正
  const cut = t && !t.done && t.cut != null && h >= t.cut;
  const rest = isRest(sim, p);
  for (const c of cands) {
    if (NO_BIAS.has(c.type) || c.pk) continue;
    let b = (L.bias[c.type] || 0) * u.st + (P.bias[c.type] || 0);
    if (c.type === 'visit' && c.friend != null) {
      const q = sim.S.people[c.friend];
      if (q && u.life === 'family' && sim.kinTerm(p, q)) b += 1;
      if (q && u.target === q.id) b += 1.5;
      if (q && u.life === 'knowledge' && LEARNED.has(q.job)) b += 1.5;
    }
    if (c.type === 'court' && c.friend != null && u.target === c.friend) b += 1;
    if (c.type === 'work' && hab && !ESSENTIAL.has(p.job)) {
      // 人それぞれの始業・終業。借金や計画があれば長く働く
      const extra = P.bias.work > 0 ? 1 : 0;
      if (h < hab.ws - 0.1 && !rest) b -= 2.2;
      if (p.workedToday > (hab.len + extra) * 60) b -= 2.6;
      if (cut) b -= 3;
    }
    if (b) c.score += clampN(b, -4, 3.5);
  }
}

// 選ばれた行動に「なぜ」を付ける（decide の startAction の直後）
export function purposeChosen(sim, p, c) {
  if (!p.action || !p.pur) return;
  p.action.pk = c.pk || null;
  p.action.why = whyOf(sim, p, c);
  // 同じ建物の中で次の行動に移ったときは、startAction の中で arrive まで済んでいる
  if (p.action.phase === 'do' && p.action.pk) purposeArrive(sim, p);
}

const WHY_BASE = {
  sleep: '夜も更けたので', eat: 'お腹がすいたので', shop: '家の食べ物が心細くなったので', tavern: '一日の疲れを癒やしに', plaza: '誰かと話したくて', stroll: '気晴らしに',
  pray: '心を落ち着けたくて', play: '遊びたくて', rest: 'ひと休みしたくて', home: '家でくつろぎたくて', visit: '顔を見たくなって', court: '想い人に会いたくて',
  train: '腕がなまらないように', guild: '稼げる依頼を探しに', quest: '依頼を果たすため', school: '学校の時間なので', flee: '身の危険を感じたので', beg: '食べるものがないので',
  askfood: '食べるものがないので', buygear: '身を守る装備が要るので', water: '家の水が少なくなったので', laundry: '洗い物がたまったので', cook: '食事の支度の時間なので',
  childcare: '幼い子の面倒を見るため', nap: '眠気に勝てなくて', help: '親の仕事を覚えるため', nurse: '家族を看病するため', grave: '亡き人を偲びに', housecall: '病人を診るため',
  storytell: '昔のことを伝えたくて', fishing: 'のんびりしたくて', garden: '庭の世話をしに', grandkids: '孫の顔を見に', trade: 'ひと儲けするため', travel: '別の土地を見たくて',
  study: '学ぶため', errand: '用事をすませるため', perform: '歌を聴かせるため', steal: '金に困って', rob: '獲物を狙って', revenge: '恨みを晴らすため', jail: '罪を償うため',
  festival: '祭りを楽しみに', wedding: '婚礼を祝いに', funeral: '弔いのため', march: '国の命令で', defend: '町を守るため', crusade: '魔王を討つため', deliver: '知らせを届けるため', sickbed: '病で起き上がれないので',
};
const NEED_WHY = { hunger: 'お腹がぺこぺこなので', sleep: 'くたくたで眠いので', pleasure: '何か楽しいことがしたくて', esteem: '誰かに認めてもらいたくて', sloth: '体を休めたくて', lust: '人恋しくて', survival: '怖くて' };
const TYPE_NEED = { eat: 'hunger', sleep: 'sleep', nap: 'sleep', tavern: 'pleasure', stroll: 'pleasure', play: 'pleasure', plaza: 'esteem', rest: 'sloth', court: 'lust', flee: 'survival' };

function fill(txt, sim, p, targetTxt) { return txt.replace(/\{t\}/g, targetTxt || '大切な人'); }
function targetName(sim, p) {
  const u = p.pur;
  if (u.life === 'homecoming') return p.origin || '故郷';
  const q = sim.S.people[u.target];
  return q ? q.given : u.life === 'revenge' && p.vendetta ? SPECIES[p.vendetta]?.name || '魔物' : '';
}
function planTarget(sim, p) {
  const pl = p.pur.plan;
  if (!pl) return '';
  const q = typeof pl.target === 'number' ? sim.S.people[pl.target] : null;
  return q ? q.given : pl.target || '';
}

function whyOf(sim, p, c) {
  const u = p.pur, n = p.needs;
  if (c.pk === 'today' && u.today?.why) return u.today.why;
  if (c.pk && c.pk.startsWith('habit:')) { const hb = u.hab?.list.find((x) => 'habit:' + x.k === c.pk); if (hb) return hb.why; }
  const type = c.type;
  // 命に関わる欲求はそれが理由
  const nk = TYPE_NEED[type];
  if (nk && n[nk] < 30) return NEED_WHY[nk];
  if (type === 'sleep' || type === 'eat' || type === 'flee' || NO_BIAS.has(type)) return WHY_BASE[type] || null;
  const L = LIFE[u.life] || LIFE.family, P = PLAN[u.plan?.k] || PLAN.daily;
  const lb = (L.bias[type] || 0) * u.st, pb = P.bias[type] || 0;
  if (type === 'work') {
    const place = JOBS[p.job]?.name ? `${JOBS[p.job].name}の仕事に` : '';
    if (P.why.work && pb >= lb) return fill(P.why.work, sim, p, planTarget(sim, p));
    if (L.why.work && lb > 0.3) return fill(L.why.work, sim, p, targetName(sim, p));
    const wr = { family: '家族を養うため', debt: '借金を返すため', dream: '夢のために貯めるため', fame: '名を上げたくて', love: 'この仕事が好きだから', tax: '税を納めるため', survive: '食べていくため', duty: '務めだから' }[p.workReason];
    return wr || (place ? '暮らしのため' : '暮らしのため');
  }
  if (pb > 0.5 && pb >= lb && P.why[type]) return fill(P.why[type], sim, p, planTarget(sim, p));
  if (lb > 0.5 && L.why[type]) return fill(L.why[type], sim, p, targetName(sim, p));
  if (type === 'visit' && c.friend != null) { const q = sim.S.people[c.friend]; if (q) return `${kinName(sim, p, q)}の顔を見に`; }
  if (type === 'court' && c.friend != null) { const q = sim.S.people[c.friend]; if (q) return `${q.given}に会いたくて`; }
  if (nk && n[nk] < 50) return NEED_WHY[nk];
  return WHY_BASE[type] || null;
}

// 詳細欄の「なぜ」
export function purposeWhy(sim, p) {
  if (!p || p.deathYear != null) return null;
  if (p.jail != null) return '罪を償うため、牢につながれている';
  if (p.fight) return null;
  const a = p.action;
  if (!a) return null;
  if (a.why) return a.why;
  if (p.mission) return WHY_BASE[p.mission.type] || null;
  return WHY_BASE[a.type] || null;
}

// ---------- arrive / doAction から ----------
export function purposeArrive(sim, p) {
  const a = p.action, u = p.pur;
  if (!a || !u) return;
  if (a.pk === 'today' && u.today) {
    u.today.done = true;
    if (a.type === 'errand' && u.today.k === 'gift') buyGift(sim, p, u.today.friend);
  } else if (a.pk && a.pk.startsWith('habit:')) u.hd[a.pk.slice(6)] = sim.today;
  else if (u.today && !u.today.done && u.today.type === a.type && a.type !== 'work') u.today.done = true;
}

const GIFT = [
  { job: 'carpenter', kid: true, what: '木彫りの馬', cost: 4 }, { job: 'baker', kid: true, what: '蜂蜜の焼き菓子', cost: 3 }, { job: 'potter', kid: true, what: '小さな土笛', cost: 3 },
  { job: 'tailor', kid: false, what: '刺繍入りの肩掛け', cost: 8 }, { job: 'weaver', kid: false, what: '織りの細帯', cost: 6 }, { job: 'cobbler', kid: false, what: '新しい革靴', cost: 10 },
  { job: 'jeweler', kid: false, what: '銀の髪飾り', cost: 30, rich: true }, { job: 'baker', kid: false, what: '祝いの焼き菓子', cost: 4 },
];
function buyGift(sim, p, toId) {
  const q = alive(sim, toId);
  if (!q) return;
  const kid = sim.ageOf(q) < 14;
  const budget = spendable(sim, p) - 10;
  const makers = sim.living().filter((x) => x.s === p.s && x.hh !== p.hh && x.jail == null && sim.ageOf(x) < 68);
  const opts = GIFT.filter((g) => g.kid === kid && g.cost <= budget && (!g.rich || budget > 120)).map((g) => ({ g, m: makers.find((x) => x.job === g.job) })).filter((o) => o.m);
  let what;
  if (opts.length) {
    const { g, m } = sim.rng.pick(opts);
    // 払う側：本人（財布→家計）、受け取る側：品を作った職人の家
    pay(sim, p, g.cost);
    earn(sim, m, g.cost, 0.4);
    what = g.what;
    sim.remember(m, `${p.given}が${kinName(sim, p, q)}への贈り物に${g.what}を買っていった`, { emo: 0.3, imp: 0.2, about: [p.id], k: 'trade' });
    stat(sim, 'giftsBought');
  } else {
    what = kid ? '手作りの木のおもちゃ' : '野の花の束';
    stat(sim, 'giftsHandmade');
  }
  p.pur.gift = { to: q.id, what, day: sim.today + ((q.birthDay - sim.dayOfYear() + DAYS_PER_YEAR) % DAYS_PER_YEAR) };
  sim.remember(p, `${kinName(sim, p, q)}の誕生日に${what}を用意した`, { emo: 0.5, imp: 0.4, about: [q.id], k: 'family' });
}

export function purposeDo(sim, p, dt) {
  const a = p.action;
  if (!a || a.type !== 'study') return;
  const n = p.needs, hr = dt / 60;
  p.skill = p.skill || {};
  p.skill.study = Math.min(1, (p.skill.study || 0) + 0.003 * hr);
  if (LEARNED.has(p.job)) p.skill[p.job] = Math.min(1, (p.skill[p.job] || 0.3) + 0.001 * hr);
  n.pleasure += ((p.pers?.O || 0.5) - 0.25) * 12 * hr;
  n.esteem += 2 * hr;
  n.sloth -= 2 * hr;
  if (sim.rng.chance(0.0015 * dt)) {
    const pl = p.pur?.plan?.k === 'study' ? p.pur.plan.txt : null;
    sim.remember(p, pl ? `${pl.replace(/る$/, 'ようと')}夜更けまで書物に向かった` : sim.rng.pick(['古い書物を読みふけった', '書き留めた覚え書きが一冊になった', 'わからなかったことが、ふと腑に落ちた']), { emo: 0.4, imp: 0.3, k: 'study' });
  }
}

// ---------- 毎日の見直し ----------
export function purposeDaily(sim) {
  const S = sim.S;
  stats(sim);
  for (const p of sim.living()) {
    if (!p.needs || !p.memories) continue;
    const u = ensure(sim, p);
    const age = sim.ageOf(p);
    // 子どもが大人になった
    if (u.life === 'child' && age >= 14) { chooseLife(sim, p, '一人前として働き始めた'); u.hab = makeHabits(sim, p); }
    else reviewLife(sim, p, u, age);
    choosePlan(sim, p);
    // 贈り物の手渡し
    if (u.gift && u.gift.day <= sim.today) {
      const q = alive(sim, u.gift.to);
      if (q && q.memories && u.gift.day === sim.today) {
        sim.remember(q, `誕生日に${sim.kinTerm(q, p) || p.given}から${u.gift.what}をもらった`, { emo: 0.8, imp: 0.55, about: [p.id], k: 'family' });
        sim.relMut(q, p).a = Math.min(100, sim.rel(q, p).a + 6);
        sim.relMut(p, q).a = Math.min(100, sim.rel(p, q).a + 3);
        q.needs.pleasure = Math.min(100, q.needs.pleasure + 25);
        p.needs.esteem = Math.min(100, p.needs.esteem + 10);
        stat(sim, 'giftsGiven');
      }
      u.gift = null;
    }
    // 毎日少しずつ、目的への思いが強まる（または薄れる）
    u.st = clampN(u.st + (sim.today - u.since > 20 ? 0.005 : 0), 0.6, 1.3);
  }
}

// 人生の出来事で目的が変わる
function reviewLife(sim, p, u, age) {
  const R = sim.rng;
  const news = [];
  for (const m of p.memories) if ((m.min ?? -1) > u.memMin && m.src !== 'heard') news.push(m);
  u.memMin = sim.S.t;
  const L = u.life;
  // 目的の相手がいなくなった
  if (L === 'love' && u.target != null) {
    const q = sim.S.people[u.target];
    if (!q || q.deathYear != null) { chooseLife(sim, p, `${q ? q.given : '愛する人'}を失った`, R.chance(0.5) ? 'faith' : null); return; }
    if (q.spouseId != null && q.spouseId !== p.id) { chooseLife(sim, p, `${q.given}はほかの人と結ばれてしまった`); return; }
  }
  if (L === 'revenge' && p.revenge == null && !p.vendetta) {
    chooseLife(sim, p, '仇はもうこの世にいない', R.chance(0.4) ? 'atone' : R.chance(0.5) ? 'peace' : null); return;
  }
  for (const m of news) {
    if (m.k === 'marriage' && m.emo > 0.3) {
      if (L === 'love' || (L === 'freedom' && (p.values?.family || 0.5) > 0.4) || (L === 'fame' && R.chance(0.3))) { chooseLife(sim, p, m.txt.replace(/。$/, ''), 'family'); return; }
      u.st = Math.min(1.3, u.st + 0.1);
    } else if ((m.k === 'preg' || m.k === 'child') && m.emo > 0.5) {
      if (['freedom', 'fame', 'wealth', 'knowledge'].includes(L) && R.chance(0.25 + (p.values?.family || 0.5) * 0.4)) { chooseLife(sim, p, m.txt.replace(/。$/, ''), 'family'); return; }
    } else if (m.k === 'death' && m.emo < -0.8) {
      if (p.revenge != null && L !== 'revenge') { chooseLife(sim, p, m.txt.replace(/。$/, ''), 'revenge'); return; }
      const about = sim.S.people[m.about?.[0]];
      if (about && (about.id === p.spouseId || p.exSpouses?.includes(about.id) || (p.children || []).includes(about.id))) {
        // 変わらずにいる人もいる（keep）
        const k = R.weighted(['faith', 'family', 'peace', 'keep'], (x) => x === 'faith' ? 0.3 + (p.values?.faith || 0.5) : x === 'family' ? (kidsOf(sim, p).length ? 1.5 : 0) : x === 'peace' ? (age > 50 ? 1 : 0) : 0.8);
        if (k !== 'keep' && k !== L) { chooseLife(sim, p, m.txt.replace(/。$/, ''), k); return; }
      }
    } else if ((m.k === 'fight' || m.k === 'monster') && m.emo < -0.6 && p.hp < p.maxhp * 0.5) {
      if ((L === 'fame' || L === 'freedom') && R.chance(0.35 + (p.pers?.N || 0.5) * 0.3)) { chooseLife(sim, p, `${m.txt.replace(/。$/, '')}。命あっての物種だと身にしみた`, kidsOf(sim, p).length || p.spouseId != null ? 'family' : 'peace'); return; }
    } else if (m.k === 'crime' && m.emo < -0.5) {
      if (L !== 'atone' && R.chance(0.2 + (p.pers?.A || 0.5) * 0.5)) { chooseLife(sim, p, m.txt.replace(/。$/, ''), 'atone'); return; }
    } else if (m.k === 'career') {
      if (m.emo > 0.5 && (L === 'wealth' || L === 'homecoming' || L === 'craft')) {
        u.st = Math.min(1.3, u.st + 0.15);
        if (R.chance(0.3)) { chooseLife(sim, p, `${m.txt.replace(/。$/, '')}。ひとつ夢がかなった`); return; }
      } else if (m.emo < -0.4 && R.chance(0.3)) { chooseLife(sim, p, `${m.txt.replace(/。$/, '')}。思い描いた道は閉ざされた`); return; }
    } else if ((m.k === 'quest' || m.k === 'hero') && m.emo > 0.5) {
      if (L === 'fame') u.st = Math.min(1.3, u.st + 0.08);
    }
  }
  // 歳を重ねて、心境が変わる
  if (age >= 60 && ['fame', 'wealth', 'freedom'].includes(L) && sim.today % 20 === p.id % 20 && R.chance(0.25)) chooseLife(sim, p, '歳をとって、欲がなくなってきた', 'peace');
  // 家を失った・取り戻した
  const hh = sim.hh(p);
  if (hh?.street && L !== 'survive' && L !== 'revenge' && R.chance(0.3)) chooseLife(sim, p, '住む家を失った', 'survive');
  else if (L === 'survive' && !hh?.street && p.job !== 'beggar' && (hh?.money || 0) > 40) chooseLife(sim, p, 'ようやく暮らしが立つようになった');
}

// ---------- 心の声 ----------
export function purposeThoughts(sim, p) {
  const u = p.pur;
  if (!u || !p.needs) return [];
  const R = sim.rng, out = [];
  const L = LIFE[u.life];
  if (L) out.push(fill(R.pick(L.thoughts), sim, p, targetName(sim, p) || (u.life === 'homecoming' ? '故郷' : '')));
  const pl = u.plan;
  if (pl && pl.k !== 'daily') {
    const tg = planTarget(sim, p);
    const lines = {
      debt: ['借りた金は返す。それが筋だ。', `${pl.txt.replace(/を返す$/, '')}……早く身軽になりたい。`],
      nurse: [`${tg}、早くよくなってくれ。`, '今日は薬を飲ませて、粥を炊いて……。'],
      court: [`${tg}に、今日こそちゃんと話しかけたい。`, `${tg}は自分のことをどう思っているんだろう。`],
      baby: ['もうすぐ家族が増える。しっかりしないと。', '生まれてくる子の名前、何にしよう。'],
      save: [`${tg}ためだ。無駄づかいはしない。`],
      appr: [`${tg}師匠の手つきを、今日こそ盗む。`],
      mourn: [`${tg}がいないことに、まだ慣れない。`],
      house: ['屋根のある寝床で眠りたい。'],
      study: [`${pl.txt}。今夜も少し進めよう。`],
      train: ['昨日より少しでも強くなる。'],
      kids: [`${tg}は今日、何を覚えるだろう。`],
      devotion: ['今日の祈りを、まだ捧げていない。'],
      amends: ['誰かに手を貸せる場所はないか。'],
      wander: ['次はどこへ行こうか。'],
      revenge: [`${tg}……首を洗って待っていろ。`],
      quest: [`${pl.txt}。気を引き締めていこう。`],
    }[pl.k];
    if (lines) out.push(R.pick(lines));
  }
  const t = u.today;
  if (t && t.day === sim.today && t.k !== 'none' && !t.done && t.txt && sim.hour() < t.h1) out.push(/今日|明日/.test(t.txt) ? `${t.txt}。` : `今日は、${t.txt}。`);
  if (t && t.done && t.k === 'gift' && u.gift) out.push(`${u.gift.what}、喜んでくれるといいな。`);
  return out.map((s) => s.replace(/。。$/, '。'));
}

// ---------- 詳細欄 ----------
const DAYS_JP = (d) => (d === 'all' ? '毎日' : d === 'work' ? '働く日' : d === 'rest' ? '休みの日' : '週に一度');
export function purposeCard(sim, p) {
  const u = p.pur;
  if (!u || p.deathYear != null) return [];
  const rows = [];
  const L = LIFE[u.life];
  if (L) rows.push(['生きる目的', `${L.name}${u.lifeWhy ? `（${u.lifeWhy}）` : ''}`]);
  if (u.prev.length) { const pv = u.prev[u.prev.length - 1]; if (LIFE[pv.k]) rows.push(['以前は', `${LIFE[pv.k].name}ために生きていた`]); }
  if (u.plan) rows.push(['いまの計画', `${u.plan.txt}${sim.today - u.plan.since > 0 ? `（${sim.today - u.plan.since}日目）` : ''}`]);
  if (u.today && u.today.day === sim.today && u.today.txt) rows.push(['今日の心づもり', `${u.today.txt}${u.today.done ? '（済んだ）' : ''}`]);
  if (u.hab && sim.ageOf(p) >= 14) {
    if (p.job) rows.push(['働き方', `${hm(u.hab.ws)}ごろから、1日${u.hab.len}時間ほど`]);
    if (u.hab.list.length) rows.push(['暮らしの癖', u.hab.list.map((h) => `${h.txt}（${DAYS_JP(h.days)}・${hm(h.h0)}ごろ）`).join('、')]);
  }
  return rows;
}

// ui.js にそのまま足せるラベル
export const PURPOSE_LABEL = { study: '書物を読み、学んでいる', errand: '用事をすませている' };
export const PURPOSE_GO = { study: '学びに向かっている', errand: '用事に出かけるところ' };
export const PURPOSE_PREF = { study: '学問', errand: '用事' };

// ---------- 生き物の目的と理由 ----------
const C_PURPOSE = {
  survive: '生き延びる', raise: '子を育てる', territory: '縄張りを守る', climb: '群れで上に行く', serve_master: '主人に尽くす', grow: '親から生きる術を学ぶ', graze: '群れで穏やかに暮らす',
  hoard: '巣と宝を守る', avenge: '仇を討つ', expand: '支配を広げる', serve: '主に仕える', feed: '腹を満たす', sanctity: '清らかな森を守る', sentinel: '古い主の命を守り続ける',
};
const SOCIAL = new Set(['wolf', 'deer', 'reindeer', 'boar', 'monkey', 'penguin', 'seagull', 'camel', 'dolphin', 'crow', 'goose', 'chicken', 'duck', 'cow', 'sheep', 'goat', 'horse']);
const PRED = new Set(['wolf', 'bear', 'fox', 'tiger', 'polarbear', 'croc', 'scorpion', 'eagle', 'snake', 'owl']);

function creaturePurposeKey(sim, c) {
  const def = SPECIES[c.sp] || {}, S = sim.S;
  if (def.monster || c.hostile || def.kind === 'neutral' || def.kind === 'demon') {
    if (c.sp === 'unicorn') return 'sanctity';
    if (c.sp === 'golem') return 'sentinel';
    if (c.juv || c.role === 'young') return 'grow';
    if (c.avenge != null) return 'avenge';
    const band = c.band && S.bands?.[c.band];
    if (band?.grudge && band.grudge.sid != null && (band.grudge.count || 0) >= 2) return 'avenge';
    if (def.kind === 'demon' || c.general || c.role === 'aide' || c.role === 'castleguard' || c.role === 'herald') return 'serve';
    if (c.named || c.hoard || c.sp === 'dragon' || ['guardian', 'treasure'].includes(c.role)) return 'hoard';
    const I = c.intel ?? 0.3;
    if (band && band.leader === c.id && I >= 0.3) return 'expand';
    if (band && I >= 0.3) return 'serve';
    if (c.young?.length) return 'raise';
    return 'feed';
  }
  if (c.master != null && sim.S.people[c.master]?.deathYear == null) return 'serve_master';
  if (c.juv) return 'grow';
  if (c.young?.length) return 'raise';
  if (def.kind === 'livestock') return 'graze';
  if (SOCIAL.has(c.sp) && c.role !== 'leader' && (c.rank || 1) > 1 && c.sex !== 'f') return 'climb';
  if (PRED.has(c.sp) && !c.juv) return 'territory';
  return 'survive';
}

export function creatureWhy(sim, c) {
  const S = sim.S, def = SPECIES[c.sp] || {};
  const pk = creaturePurposeKey(sim, c);
  const name = (e) => (e ? e.given || e.name : '何か');
  let why;
  if (c.dormant) why = '魔王城の奥で、復活の時を待っている';
  else if (c.fight) {
    const foe = sim.entity(c.fight.target);
    const isHuman = foe && typeof foe.id === 'number';
    if (foe && c.avenge === foe.id) why = `仲間を殺した${name(foe)}に仇を返すため、戦っている`;
    else if (c.young?.length && pk === 'raise') why = `子を守るため、${name(foe)}に立ち向かっている`;
    else if (c.master != null) why = '主人を守るため、戦っている';
    else if (c.raid != null) why = '群れの縄張りを広げるため、人の町で暴れている';
    else if (!isHuman && c.hunger < 45) why = `腹を満たすため、${name(foe)}を仕留めようとしている`;
    else if (isHuman && pk === 'hoard') why = '巣と宝に近づいた人間を追い払うため、戦っている';
    else why = isHuman ? '縄張りに踏み込んだ人間を追い払うため、戦っている' : `身を守るため、${name(foe)}と戦っている`;
  } else if (c.raid != null) {
    const band = c.band && S.bands?.[c.band];
    const town = sim.town(c.raid)?.name || '人の町';
    why = band?.grudge?.sid === c.raid ? `仲間を殺された恨みを晴らすため、${town}を襲いに向かっている` : pk === 'serve' ? `主の命令で、${town}を襲いに向かっている` : `縄張りを広げ、獲物と宝を奪うため、${town}を襲いに向かっている`;
  } else if (c.fleeUntil && S.t < c.fleeUntil) why = c.juv ? '親の言いつけどおり、巣へ逃げ込んでいる' : '生き延びるため、住処へ逃げ帰っている';
  else if (c.hibernate) why = '冬を越すため、巣穴で眠っている';
  else if (c.mourn) why = '亡き主人の墓のそばを離れようとしない';
  else if (c.resting) why = '傷を癒やすため、住処の奥で休んでいる';
  else if (c.sleeping) why = def.kind === 'livestock' ? '夜なので、小屋に集まって眠っている' : '明日に備えて、ねぐらで眠っている';
  else if (c.warParty) why = '長の号令で、大群の集結地へ向かっている';
  else if (c.juv || c.role === 'young') why = '親のそばで、生きる術を学んでいる';
  else if (c.mig && !c.mig.arrived) why = '季節に合わせて、住処を移っている';
  else if (c.forage) why = '山に食べ物がなく、人里まで降りてきている';
  else if (c.goal?.run && c.hunger < 45) why = '腹をすかせて、獲物を追っている';
  else if (c.master != null && S.people[c.master]?.deathYear == null) why = `主人の${S.people[c.master].given}のそばを離れないようにしている`;
  else {
    switch (c.role) {
      case 'sentry': why = pk === 'avenge' ? '仲間の仇の人間が来ないか、見張りに立っている' : '群れのために、見張りに立っている'; break;
      case 'guardian': case 'treasure': why = '巣の奥の宝を守っている'; break;
      case 'leader': why = { expand: '群れを率いて、縄張りを広げる隙をうかがっている', avenge: '群れを率いて、仲間の仇の人間を探している', raise: '子らを食べさせるため、群れを率いて獲物を探している', hoard: '群れを率いて、巣と宝のまわりを固めている', serve: '群れを率いて、主の命令を待っている' }[pk] || '群れを率いて、縄張りを見回っている'; break;
      case 'herder': why = '牧場で草を食んでいる'; break;
      case 'plow': why = '畑を耕す仕事の合間に、草を食んでいる'; break;
      case 'watchdog': why = '飼い主の家に怪しい者が来ないか見張っている'; break;
      case 'mouser': why = '台所を荒らすネズミを探している'; break;
      case 'aide': case 'castleguard': why = '魔王のそばに控えて、命令を待っている'; break;
      case 'herald': why = '主の命で、人の町の様子を探っている'; break;
      default:
        why = {
          hoard: '巣と宝を守るため、住処のまわりを離れない', expand: '群れの縄張りを広げる隙をうかがっている', serve: '長の命令を待ちながら、住処のまわりを見回っている',
          avenge: '仲間の仇の人間を探している', feed: c.hunger < 50 ? '腹を満たすものを探している' : '住処のまわりをうろついている', sanctity: '森の清らかな泉のそばを守っている', sentinel: '遠い昔の主の命令どおり、遺跡を守り続けている',
          raise: '子に食べさせるものを探している', territory: '縄張りを見回り、よそ者がいないか確かめている', climb: '群れの上の者の様子をうかがいながら、力を蓄えている',
          graze: '仲間と一緒に草を食んでいる', grow: '親のそばで生きる術を学んでいる', serve_master: '主人のそばにいる', survive: c.hunger < 50 ? '腹を満たすものを探している' : '天敵に気を配りながら、住処のまわりで過ごしている',
        }[pk];
    }
  }
  c.purpose = pk;
  c.why = why;
  return { purpose: C_PURPOSE[pk], why };
}

// ---------- 行動のばらつきを測る（試験用） ----------
// acc = {}。30分ごとに spreadSample(sim, acc) を呼び、最後に spreadReport(acc)
export function spreadSample(sim, acc) {
  const h = sim.hour();
  acc.slots = acc.slots || []; acc.work = acc.work || {}; acc.kinds = acc.kinds || {};
  const groups = {};
  for (const p of sim.living()) {
    const age = sim.ageOf(p);
    if (!p.job || age < 16 || age > 67 || p.jail != null) continue;
    const k = p.talk ? 'talk' : p.fight ? 'fight' : p.action?.type || 'none';
    (groups[p.job] = groups[p.job] || []).push(k);
    // 仕事の始まりと終わり
    const d = sim.today, w = acc.work[p.id] || (acc.work[p.id] = { job: p.job, days: {} });
    const dd = w.days[d] || (w.days[d] = { first: null, last: null, kinds: new Set() });
    if (p.action?.type === 'work' && p.action.phase === 'do') { if (dd.first == null) dd.first = h; dd.last = h; }
    dd.kinds.add(k);
  }
  if (h < 6 || h >= 22) return;
  let sum = 0, cnt = 0;
  for (const [job, ks] of Object.entries(groups)) {
    if (ks.length < 4) continue;
    const c = {};
    for (const k of ks) c[k] = (c[k] || 0) + 1;
    let g = 1;
    for (const v of Object.values(c)) g -= (v / ks.length) ** 2;
    sum += g * ks.length; cnt += ks.length;
  }
  if (cnt) acc.slots.push(sum / cnt);
}
export function spreadReport(acc) {
  const sd = (xs) => { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
  const byJob = {};
  let kindsSum = 0, kindsN = 0;
  for (const w of Object.values(acc.work || {})) {
    for (const dd of Object.values(w.days)) {
      kindsSum += dd.kinds.size; kindsN++;
      if (dd.first == null) continue;
      const j = byJob[w.job] || (byJob[w.job] = { first: [], last: [] });
      j.first.push(dd.first); j.last.push(dd.last);
    }
  }
  let fs = 0, ls = 0, n = 0;
  const allFirst = [], allLast = [];
  for (const j of Object.values(byJob)) { if (j.first.length < 6) continue; fs += sd(j.first) * j.first.length; ls += sd(j.last) * j.first.length; n += j.first.length; allFirst.push(...j.first); allLast.push(...j.last); }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    mismatch: +(mean(acc.slots || [])).toFixed(3),           // 同じ職業の2人が同じ時刻に違うことをしている確率
    workStartSD: +(n ? fs / n : 0).toFixed(2),                // 同じ職業での仕事の始まりの時刻のばらつき（時間）
    workEndSD: +(n ? ls / n : 0).toFixed(2),                  // 同じ職業での仕事の終わりの時刻のばらつき（時間）
    workStartMean: +mean(allFirst).toFixed(2), workEndMean: +mean(allLast).toFixed(2),
    kindsPerDay: +(kindsN ? kindsSum / kindsN : 0).toFixed(2), // 1人が1日にとる行動の種類の数
  };
}
