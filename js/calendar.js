// 国ごとの年中行事
// 各国に決まった祭り（国柄に合わせたもの）と、年代記（建国・戦・魔王）から生まれた記念日・慰霊日がある。
// 行事の日は町の人が広場や教会に集まり、仕事は昼までになる。
//
// 使い方：newDay の中で calendarDaily(sim) を呼ぶだけ。
// 状態は S.calendar に入る（古いセーブで無くても、最初に呼ばれたときに作られる）。
import { DAYS_PER_YEAR, DAYS_PER_SEASON } from './data.js';

const HARVEST_DAY = DAYS_PER_SEASON * 3 - 1; // 既存の収穫祭
const d = (season, day) => season * DAYS_PER_SEASON + day; // 季節0〜3、日0〜9

// ---- 暦データ ----
// kind: feast（にぎやか）/ solemn（しめやか） / where: all | port | capital | villages
// from/hours: 集まる時刻（時）と長さ / halfDay: 仕事は昼まで
// talk: 会話の決まり文句（v.s で語尾がつく） / thought: 心の声 / memo: その日の思い出
export const CALENDAR = {
  0: [ // アルデリア王国 ― 剣と麦の国
    { id: 'sowing', name: '春の種まき祭', doy: d(0, 3), kind: 'feast', where: 'all', place: 'plaza', from: 10, hours: 6, halfDay: true,
      news: '今日は{k}の種まき祭。畑に麦の種がまかれ、広場では踊りの輪ができる',
      talk: [['今年も麦がよく実るといい', 'v'], ['種まき祭の踊り、今年こそ一番になる', 'v'], ['種をまいたら、あとはお天道さま次第', 'n']],
      thought: ['いい種をまいた。秋が楽しみだ。', '踊りの輪に入ろうかな……。'], memo: '種まき祭で、みんなと輪になって踊った' },
    { id: 'boat', name: '夏至の舟祭', doy: d(1, 5), kind: 'feast', where: 'port', place: 'plaza', from: 15, hours: 6, halfDay: true,
      news: '今日は{town}の夏至の舟祭。花で飾った小舟が海へ流される',
      talk: [['花の小舟、どこまで流れていくんだろう', 'raw'], ['舟祭の日は、海の神さまも機嫌がいい', 'v'], ['今年の舟くらべ、どの網元が勝つかな', 'raw']],
      thought: ['海の神さま、今年も無事に帰らせてください。', '小舟に願いごとを乗せよう。'], memo: '夏至の舟祭で、花の小舟を海に流した' },
  ],
  1: [ // ヴェルムント王国 ― 鉄と雪の国
    { id: 'forge', name: '鍛冶神の火祭り', doy: d(2, 3), kind: 'feast', where: 'all', place: 'plaza', from: 16, hours: 6, halfDay: true,
      news: '今日は{k}の火祭り。鍛冶場の火を広場に移し、夜どおし槌の音が響く',
      talk: [['火祭りの槌打ちを、今年も見に行く', 'v'], ['鍛冶神さまに、いい鉄が打てるよう祈った', 'v'], ['火の粉を浴びると一年病気をしないって話', 'n']],
      thought: ['槌の音を聞くと、体が熱くなる。', '火の粉がきれいだ……。'], memo: '火祭りで、広場の大かがり火に火の粉が舞うのを見た' },
    { id: 'lantern', name: '冬至の灯籠祭', doy: d(3, 5), kind: 'feast', where: 'all', place: 'plaza', from: 17, hours: 5, halfDay: true,
      news: '今日は{k}の冬至の灯籠祭。雪の夜に、家々の灯籠が並ぶ',
      talk: [['いちばん長い夜だから、灯りをともす', 'v'], ['灯籠に、亡くなった人の名前を書いた', 'v'], ['雪の上の灯籠は、何度見てもきれい', 'n']],
      thought: ['この灯りが、あの人にも届くといい。', '長い夜も、灯りがあればこわくない。'], memo: '冬至の灯籠祭で、雪の上に灯籠をともした' },
  ],
  2: [ // サハル王国 ― 砂と黄金の国
    { id: 'water', name: '水の恵み祭', doy: d(0, 6), kind: 'feast', where: 'all', place: 'plaza', from: 7, hours: 5, halfDay: true,
      news: '今日は{k}の水の恵み祭。井戸とオアシスに感謝し、水をかけ合って祝う',
      talk: [['水の恵み祭は、びしょぬれになってこそ！', 'raw'], ['井戸の神さまに、今年も水が涸れないよう祈った', 'v'], ['砂の国では、水は黄金より尊い', 'v']],
      thought: ['冷たい水が気持ちいい。', '今年も井戸が涸れませんように。'], memo: '水の恵み祭で、みんなと水をかけ合った' },
    { id: 'stars', name: '砂漠の星祭り', doy: d(1, 4), kind: 'feast', where: 'all', place: 'plaza', from: 19, hours: 4, halfDay: true,
      news: '今日は{k}の星祭り。砂漠の夜空の下、人々は星に願いをかける',
      talk: [['星祭りの夜は、流れ星が多い', 'v'], ['ご先祖さまは星になって見ている', 'v'], ['星に願いをかけた。中身はないしょ', 'n']],
      thought: ['星がこぼれてきそうだ。', 'あの星のどれかが、ご先祖さまだろうか。'], memo: '星祭りの夜、砂漠の空に願いをかけた' },
  ],
};

// 王の誕生日（都だけ。休みにはならない）
const KING_BIRTHDAY = {
  id: 'kingbday', name: '王の誕生日', kind: 'feast', where: 'capital', place: 'plaza', from: 12, hours: 4, halfDay: false,
  news: '今日は{k}の{title}{king}さまの誕生日。都の広場で祝いの酒がふるまわれる',
  talk: [['{title}さまのご健康を祝して、乾杯！', 'raw'], ['今日は都でただ酒が飲めるらしい', 'v']],
  thought: ['{title}さま、おめでとうございます。'], memo: '{title}さまの誕生日の祝い酒をいただいた',
};

// 文字列 → 日付（年代記の出来事に日を割り当てる）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function freeDay(taken, seed) {
  let doy = seed % DAYS_PER_YEAR;
  for (let i = 0; i < DAYS_PER_YEAR && (taken.has(doy) || doy === 0 || doy === HARVEST_DAY); i++) doy = (doy + 1) % DAYS_PER_YEAR;
  taken.add(doy);
  return doy;
}

// 年代記から、建国記念日と、いちばん新しい戦・魔王の出来事の記念日を作る
function eventsFromChronicle(sim, kid, taken) {
  const S = sim.S, K = S.kingdoms || [];
  const out = [];
  const chron = S.chronicle || [];
  const founding = chron.find((c) => c.k === kid && /建国/.test(c.text));
  if (founding) out.push({
    id: 'founding', name: '建国記念日', doy: freeDay(taken, hash(founding.text)), kind: 'feast', where: 'all', place: 'plaza', from: 11, hours: 6, halfDay: true,
    since: founding.y, origin: founding.text,
    news: '今日は{k}の建国記念日。建国から{n}年、王城に旗がひるがえる',
    talk: [['建国から{n}年。たいしたもの', 'n'], ['今日は初代さまがこの国を開いた日', 'n'], ['建国記念日くらい、仕事は休まないと。', 'raw']],
    thought: ['この国に生まれてよかった……のかな。'], memo: '建国記念日の祝いに、広場で旗を振った',
  });
  // 戦と魔王：いちばん新しいものを1つ
  let best = null;
  for (const c of chron) {
    let ev = null;
    let m = c.text.match(/「(.+)」が終わり、(.+?)が(有利な和平を結んだ|勝利した)/);
    if (m) {
      const war = m[1];
      const start = chron.find((x) => x.text.includes(`「${war}」が始まった`));
      const winner = K.findIndex((o) => o.name === m[2]) >= 0 ? K.findIndex((o) => o.name === m[2]) : c.k;
      const loser = start ? K.findIndex((o, i) => i !== winner && start.text.includes(o.name)) : -1;
      if (winner === kid) ev = { id: 'victory', name: `「${war}」戦勝記念日`, kind: 'feast', place: 'plaza', from: 13, hours: 5,
        news: '今日は「{war}」の戦勝記念日。{n}年前の勝利を祝い、兵士たちが町を練り歩く',
        talk: [['「{war}」で勝ったのは、ずっと昔のこと', 'n'], ['戦勝記念日だけど、戦はもうこりごり', 'n'], ['兵隊さんの行進、かっこよかった', 'v']],
        thought: ['勝った戦にも、帰らなかった人はいたんだろうな。'], memo: '「{war}」の戦勝記念日に、兵士の行進を見た' };
      else if (loser === kid) ev = { id: 'fallen', name: `「${war}」戦没者の慰霊日`, kind: 'solemn', place: 'church', from: 9, hours: 4,
        news: '今日は「{war}」の戦没者の慰霊日。{n}年前に倒れた兵たちのため、教会の鐘が鳴らされる',
        talk: [['「{war}」で倒れた人たちに、祈りを捧げてきた', 'v'], ['慰霊日の鐘の音は、いつ聞いても胸にしみる', 'v'], ['戦で死んだご先祖さまの名前が、石碑に刻まれている', 'v']],
        thought: ['二度と、あんな戦が起きませんように。'], memo: '「{war}」の慰霊日に、教会で祈りを捧げた' };
      if (ev) ev.war = war;
    }
    m = !ev && c.text.match(/勇者(.+?)・.+が(.+)を討ち果たした/);
    if (m && c.k === kid) ev = { id: 'demonslay', name: `勇者${m[1]}の日`, kind: 'feast', place: 'plaza', from: 14, hours: 5, hero: m[1], demon: m[2],
      news: '今日は勇者{hero}の日。{n}年前に{demon}が討たれたことを祝い、子どもたちが勇者ごっこに興じる',
      talk: [['勇者{hero}さまみたいに、なりたい', 'v'], ['{demon}が討たれた日だから、今日はごちそう', 'n'], ['勇者{hero}の歌を、吟遊詩人がまた歌っていた', 'v']],
      thought: ['勇者{hero}さまも、はじめはふつうの人だったのかな。'], memo: '勇者{hero}の日に、勇者の芝居を見た' };
    m = !ev && c.text.match(/魔王軍が(.+)を襲った/);
    if (m && c.k === kid) ev = { id: 'raid', name: `${m[1]}の慰霊日`, kind: 'solemn', place: 'church', from: 9, hours: 4, village: m[1],
      news: '今日は{village}の慰霊日。{n}年前に魔王軍に襲われた人々を悼み、鐘が鳴らされる',
      talk: [['{village}が襲われた日のことを、ばあさんがよく話していた', 'v'], ['魔王軍に殺された人たちのために、祈ってきた', 'v']],
      thought: ['あの日のようなことが、もう起きませんように。'], memo: '{village}の慰霊日に、教会で祈った' };
    if (ev) { ev.since = c.y; ev.origin = c.text; best = ev; } // 年代記は古い順なので、最後が最新
  }
  if (best) { best.doy = freeDay(taken, hash(best.origin)); best.where = 'all'; best.halfDay = true; out.push(best); }
  return out;
}

// 暦を作る（年に一度つくり直す：新しい王や、年代記に増えた出来事を反映）
export function buildCalendar(sim) {
  const S = sim.S;
  const cal = { year: sim.year(), kingdoms: {}, done: {} };
  for (const k of S.kingdoms || []) {
    const fixed = (CALENDAR[k.id] || []).map((e) => ({ ...e }));
    const taken = new Set(fixed.map((e) => e.doy));
    cal.kingdoms[k.id] = [...fixed, ...eventsFromChronicle(sim, k.id, taken)].sort((a, b) => a.doy - b.doy);
  }
  return cal;
}
function ensure(sim) {
  const S = sim.S;
  if (!S.calendar || S.calendar.year !== sim.year()) {
    const done = S.calendar?.done || {};
    S.calendar = buildCalendar(sim);
    S.calendar.done = done;
  }
  S.calendar.done = S.calendar.done || {};
  return S.calendar;
}

function fill(txt, vars) { return txt.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')); }
function varsFor(sim, k, ev, town) {
  const king = k.kingId != null ? sim.S.people[k.kingId] : null;
  return {
    k: k.name, town: town?.name ?? '', n: ev.since != null ? sim.year() - ev.since : '', war: ev.war, hero: ev.hero, demon: ev.demon, village: ev.village,
    king: king ? king.given : '', title: king && king.sex === 'f' ? '女王' : '王',
  };
}
function matchesTown(ev, s) {
  if (ev.where === 'all') return true;
  if (ev.where === 'port') return s.type === 'port';
  if (ev.where === 'capital') return s.type === 'capital';
  if (ev.where === 'villages') return s.type === 'village';
  return false;
}

// その町の今日の行事（王の誕生日も含む）
export function calendarToday(sim, sid) {
  const S = sim.S;
  const s = sim.town(sid);
  if (!s || !S.kingdoms || (s.tribal && s.annexed == null)) return [];
  const cal = ensure(sim);
  const k = S.kingdoms[s.kingdom];
  if (!k) return [];
  const doy = sim.dayOfYear();
  const out = (cal.kingdoms[k.id] || []).filter((e) => e.doy === doy && matchesTown(e, s));
  const king = k.kingId != null ? S.people[k.kingId] : null;
  if (king && king.deathYear == null && king.birthDay === doy && s.type === 'capital') out.push({ ...KING_BIRTHDAY, doy });
  return out;
}

// 次の行事（n日以内）。会話の「もうすぐ○○だね」用
export function calendarUpcoming(sim, sid, within = 3) {
  const s = sim.town(sid);
  if (!s || !sim.S.kingdoms || (s.tribal && s.annexed == null)) return null;
  const cal = ensure(sim);
  const doy = sim.dayOfYear();
  let best = null;
  for (const e of cal.kingdoms[s.kingdom] || []) {
    if (!matchesTown(e, s)) continue;
    const dd = (e.doy - doy + DAYS_PER_YEAR) % DAYS_PER_YEAR;
    if (dd >= 1 && dd <= within && (!best || dd < best.days)) best = { ev: e, days: dd };
  }
  return best;
}

// 行事の日の午後は仕事を休んでよいか（decide の rest に足す）
export function calendarHalfDay(sim, sid) {
  if (sim.hour() < 12) return false;
  return calendarToday(sim, sid).some((e) => e.halfDay);
}

// ---- newDay から呼ぶ ----
export function calendarDaily(sim) {
  const S = sim.S, R = sim.rng;
  if (!S.kingdoms || !S.world) return [];
  const cal = ensure(sim);
  const day = sim.dayIndex;
  if (cal.done[day]) return [];
  cal.done = { [day]: 1 }; // 最新の1日だけ覚えておく（二重実行よけ）
  const held = [];
  const newsSent = new Set();
  for (const s of S.world.settlements) {
    if (s.kingdom == null || S.towns[s.id]?.occupied) continue;
    const k = S.kingdoms[s.kingdom];
    if (!k) continue;
    for (const ev of calendarToday(sim, s.id)) {
      const vars = varsFor(sim, k, ev, s);
      const from = day * 1440 + ev.from * 60;
      S.gatherings.push({ type: ev.kind === 'solemn' ? 'pray' : 'festival', place: ev.place, from, to: from + ev.hours * 60, s: s.id, label: fill(ev.name, vars), cal: ev.id });
      held.push({ town: s.name, name: fill(ev.name, vars), kingdom: k.name });
      const nk = `${k.id}:${ev.id}:${ev.where === 'port' || ev.where === 'capital' ? s.id : ''}`;
      if (!newsSent.has(nk)) { newsSent.add(nk); sim.news(fill(ev.news, vars), ev.kind === 'solemn' ? 1 : 1, { x: s.x, z: s.z }); }
      // 思い出（町の人の一部。記憶が増えすぎないよう控えめに）
      const memo = fill(ev.memo, vars);
      let n = 0;
      for (const p of sim.living()) {
        if (p.s !== s.id || !p.memories || p.jail != null || sim.ageOf(p) < 5) continue;
        if (!R.chance(0.15)) continue;
        sim.remember(p, memo, { emo: ev.kind === 'solemn' ? -0.1 : 0.5, imp: 0.3, k: 'festival' });
        if (ev.kind !== 'solemn' && p.needs) p.needs.pleasure = Math.min(100, p.needs.pleasure + 10);
        if (++n >= 40) break;
      }
    }
  }
  return held;
}

// ---- 会話・心の声（speech.js から使う） ----
function eventForTalk(api, A) {
  const today = calendarToday(api, A.s)[0];
  if (today) return { ev: today, days: 0 };
  return calendarUpcoming(api, A.s, 2);
}
// 話題の重み（今日なら高め、近づくと少し）
export function calendarTopicWeight(api, A) {
  const e = eventForTalk(api, A);
  if (!e) return 0;
  return e.days === 0 ? 2.2 : 0.8;
}
// 話題を作る（topics() の add に渡す）
export function calendarTopic(api, A, B, v) {
  const e = eventForTalk(api, A);
  const s = api.town(A.s), k = api.S.kingdoms[s.kingdom];
  const vars = varsFor(api, k, e.ev, s);
  const name = fill(e.ev.name, vars);
  const R = api.rng;
  if (e.days === 0) {
    const [body, tail] = R.pick(e.ev.talk);
    const line = fill(body, vars);
    const intro = R.chance(0.4) ? `今日は${name}。` : '';
    const said = tail === 'raw' ? line + (/[。！？]$/.test(line) ? '' : '。') : v.s(line, tail);
    return { kind: e.ev.kind === 'solemn' ? 'memorial' : 'festival', text: intro + said, sentiment: e.ev.kind === 'solemn' ? 0.1 : 0.6, festival: e.ev.id };
  }
  const when = e.days === 1 ? '明日' : 'あさって';
  if (e.ev.kind === 'solemn') return { kind: 'memorial', text: v.s(`${when}は${name}`, 'n'), sentiment: 0, festival: e.ev.id };
  const [body, tail] = R.pick([[`${when}は${name}。楽しみ`, 'a'], [`${when}は${name}。何を着ていこうかな。`, 'raw'], [`もう${when}が${name}`, 'n']]);
  return { kind: 'festival', text: tail === 'raw' ? body : v.s(body, tail), sentiment: 0.4, festival: e.ev.id };
}
// 返事（react の先頭で使う。null なら通常の返事）
export function calendarReact(api, B, A, topic, v) {
  if (topic.kind === 'memorial') return { text: v.r({ polite: 'ええ。わたしも祈ってまいりました。', elder: 'そうじゃな……忘れてはならん。', rough: '……ああ。忘れちゃいけねえ。', child: 'うん……。', plain: ['そうだね。忘れちゃいけないね。', '……うん。'], royal: '余も祈りを捧げた。', knight: '決して忘れません。' }), da: 2 };
  if (topic.kind === 'festival') return { text: v.r({ polite: ['ええ、本当に楽しみですね。', 'ご一緒しましょうか。'], elder: ['祭りはええのう。若返るわい。', 'わしも若いころは踊ったもんじゃ。'], rough: ['おう、今年は飲むぞ！', 'へへ、祭りは最高だな。'], child: ['おまつり！ おまつり！', 'たのしみー！'], plain: ['うん、一緒に行こう！', '楽しみだね！'], royal: 'うむ。民が楽しむ姿は何よりじゃ。', noble_f: 'まあ、すてきですわ。', knight: '警備も抜かりなくいたします！' }), da: 3 };
  return null;
}
// 心の声（innerThought の opts に足す）
export function calendarThought(api, p) {
  const today = calendarToday(api, p.s)[0];
  if (!today) return null;
  const s = api.town(p.s), k = api.S.kingdoms[s.kingdom];
  return fill(api.rng.pick(today.thought), varsFor(api, k, today, s));
}

// 画面上部の日付欄用：その町の今日の行事名（無ければ ''）
export function calendarLabel(sim, sid) {
  return calendarToday(sim, sid).map((e) => fill(e.name, varsFor(sim, sim.S.kingdoms[sim.town(sid).kingdom], e, sim.town(sid)))).join('・');
}

// 一年の暦（国ごと）。UI の「暦」欄や試験用
export function calendarYear(sim) {
  const cal = ensure(sim);
  return (sim.S.kingdoms || []).map((k) => ({
    kingdom: k.name,
    events: (cal.kingdoms[k.id] || []).map((e) => {
      const season = Math.floor(e.doy / DAYS_PER_SEASON);
      return { name: fill(e.name, varsFor(sim, k, e, null)), date: `${['春', '夏', '秋', '冬'][season]}${(e.doy % DAYS_PER_SEASON) + 1}日`, where: e.where, kind: e.kind, from: e.origin || null };
    }),
  }));
}
