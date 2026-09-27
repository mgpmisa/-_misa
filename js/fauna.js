// 動物の暮らし：名前・家族・住処・空腹と飢え・序列・縄張り・人との絆・記憶と学習・鳴き声
// 対象は魔物でない生き物（家畜・野生動物・鳥・海の生き物）。魔物は monsters.js が受け持つ。
// 状態：S.fauna（遅延初期化）。生き物に足す印：
//   c.given（名前・あだ名）、c.sex、c.mate、c.parents、c.young（子のid配列）、c.juv（まだ子ども）、
//   c.home（住処 {x,z}）、c.den（住処の種類）、c.hunger（0〜100）、c.rank（群れの序列。1が長）、
//   c.bond（飼い主へのなつき）、c.master（主人の人id）、c.wary（覚えた狩人）、c.likes（餌をくれる人）、
//   c.forage（人里へ降りている）、c.mig（季節移動・渡り）、c.hibernate（冬眠）、c.mourn（主人の墓守り）
import { SPECIES, KINGDOMS, DAYS_PER_YEAR, DAYS_PER_SEASON } from './data.js';
import { T, W, H, CORE, walkable, tileAt, biomeOf, isWater } from './world.js';
import { makeCreature, killCreature, applyStats, townMask } from './creatures.js';
import { startFight } from './society.js';

// ---------- 渡り鳥（ガン）：data.js に無いので、ここで種を足す ----------
if (!SPECIES.goose) SPECIES.goose = { name: 'ガン', kind: 'wild', shape: 'bird', col: '#8a7a66', col2: '#f2eee4', size: 0.5, hp: 7, atk: 1, speed: 1.5, diet: 'grass', flies: true };

// ---------- 種ごとの性質 ----------
// creatures.js の POP（生息数の目安）と同じ値。春の子育てはこの1.3倍まで
const POP = { rat: 8, crow: 10, owl: 6, frog: 8, snake: 6, turtle: 5, bat: 6, deer: 14, boar: 8, wolf: 10, bear: 5, fox: 7, rabbit: 16, squirrel: 8, camel: 6, scorpion: 8, croc: 5, monkey: 8, tiger: 4, parrot: 6, reindeer: 8, polarbear: 3, penguin: 8, seagull: 10, eagle: 4, dolphin: 8, whale: 3, goose: 14 };
const PRED = new Set(['wolf', 'bear', 'fox', 'tiger', 'polarbear', 'croc', 'scorpion', 'eagle', 'snake', 'owl']);
// 寿命（年）。1年は40日
const LIFE = {
  rabbit: 4, rat: 2, squirrel: 5, frog: 5, deer: 12, boar: 10, wolf: 10, bear: 22, fox: 8, camel: 28, scorpion: 5, croc: 45, monkey: 20, tiger: 16, parrot: 40,
  reindeer: 13, polarbear: 22, penguin: 16, seagull: 15, eagle: 22, dolphin: 30, whale: 70, crow: 13, owl: 16, snake: 10, turtle: 60, bat: 14, goose: 18,
  cow: 18, sheep: 12, pig: 12, chicken: 7, duck: 8, horse: 26, goat: 14, dog: 13, cat: 15, donkey: 30,
};
// 大人になるまでの日数
const MATURE = { rabbit: 6, rat: 4, squirrel: 8, frog: 6, chicken: 8, duck: 8, bat: 10, scorpion: 10, snake: 12, fox: 12, owl: 12, crow: 12, parrot: 14, seagull: 14, goose: 14, cat: 12, dog: 14, penguin: 16 };
const matureOf = (sp) => MATURE[sp] ?? ((SPECIES[sp]?.size || 1) >= 1.2 ? 30 : 20);
// 一度に生まれる子の数
const LITTER = { rabbit: [2, 4], rat: [2, 4], squirrel: [2, 3], fox: [2, 4], wolf: [2, 4], boar: [2, 4], dog: [2, 4], cat: [2, 3], pig: [2, 4], bear: [1, 2], polarbear: [1, 2], tiger: [1, 3], snake: [2, 3], frog: [2, 4], owl: [1, 3], crow: [2, 3], goose: [2, 3], chicken: [2, 4], duck: [2, 4], seagull: [1, 2], eagle: [1, 2], croc: [2, 3], turtle: [2, 3], scorpion: [2, 3], parrot: [1, 2] };
// 群れで暮らす種（序列がある）
const SOCIAL = new Set(['wolf', 'deer', 'reindeer', 'boar', 'monkey', 'penguin', 'seagull', 'camel', 'dolphin', 'crow', 'goose', 'chicken', 'duck', 'cow', 'sheep', 'goat', 'horse']);
// 一生つがいでいる種
const MONOGAMOUS = new Set(['wolf', 'fox', 'eagle', 'owl', 'crow', 'goose', 'penguin', 'seagull', 'parrot', 'swan']);
// 独り立ちすると遠くへ移る種
const SOLITARY = new Set(['bear', 'polarbear', 'fox', 'tiger', 'owl', 'eagle', 'snake', 'croc', 'squirrel', 'scorpion', 'turtle', 'frog', 'rabbit']);
// 夜に動き、昼に眠る種
const NOCT = new Set(['owl', 'bat', 'fox', 'tiger', 'scorpion', 'frog', 'rat']);
// 子を守るためなら、捕食者にも立ち向かう種
const FIERCE = new Set(['bear', 'polarbear', 'boar', 'wolf', 'tiger', 'croc', 'goose', 'cow', 'goat', 'horse', 'camel', 'reindeer', 'deer', 'dog', 'eagle', 'crow']);
// 人にまで襲いかかる母
const FIERCE_HUMAN = new Set(['bear', 'polarbear', 'boar', 'tiger', 'wolf', 'croc', 'goose']);
// 木の実・果物も食べる
// 罠にかからない（かけない）種
const NO_TRAP = new Set(['rat', 'turtle', 'frog', 'snake', 'scorpion', 'croc']);
const OMNI = new Set(['bear', 'boar', 'monkey', 'rat', 'crow', 'squirrel', 'parrot', 'pig', 'fox']);
// 住処の呼び名
const DEN = {
  bear: '山の洞穴', polarbear: '雪の穴ぐら', wolf: '岩陰の巣穴', fox: '土手の巣穴', rabbit: '草むらの巣穴', squirrel: '木の上の巣', owl: '古木のうろ', crow: '高い木の上の巣', eagle: '崖の上の巣',
  parrot: '大樹の上の巣', deer: '森のねぐら', reindeer: '雪原のねぐら', boar: '藪のねぐら', camel: '砂丘のねぐら', tiger: '密林のねぐら', monkey: '木の上のねぐら',
  frog: '水辺', turtle: '水辺', croc: '川べり', seagull: '岩場のコロニー', penguin: '氷の岸のコロニー', bat: '洞窟の天井', snake: '岩の割れ目', scorpion: '岩の下',
  dolphin: '沖の群れ', whale: '深い海', rat: '家の床下', goose: '水辺の草地',
  cow: '牛舎', sheep: '羊小屋', pig: '豚小屋', chicken: '鶏小屋', duck: 'アヒル小屋', goat: 'ヤギ小屋', horse: '厩舎', donkey: '厩舎', dog: '犬小屋', cat: 'かまどのそば',
};
// 鳴き声・しぐさ
const VOICE = {
  cow: ['モー', 'モォー……'], sheep: ['メェー', 'メェェ'], pig: ['ブヒッ', 'ブーブー'], chicken: ['コッコッ', 'コケッ'], duck: ['ガーガー', 'グワッ'], goat: ['メェェ〜', 'ンメェ'],
  horse: ['ヒヒーン', 'ブルルッ'], donkey: ['ヒーホー', 'ヒィーホー'], dog: ['ワンワン！', 'ワン！', 'クゥン'], cat: ['ニャー', 'ニャッ', 'ゴロゴロ……'],
  deer: ['ピャッ', 'キュウン'], boar: ['ブギッ', 'フゴッ'], wolf: ['アオーン……', 'ウゥ……'], bear: ['グルル……', 'グオォ'], fox: ['コンコン', 'ケーン'], rabbit: ['（鼻をひくひくさせた）', '（耳をぴんと立てた）'],
  squirrel: ['キッキッ', '（頬袋をふくらませた）'], camel: ['ブフー', 'ムォー'], scorpion: ['（尾を振り上げた）'], croc: ['（大きな口を開けた）', 'グルッ'], monkey: ['キキッ', 'ウキャキャ'], tiger: ['ガオォ', 'グルルル'],
  parrot: ['オハヨウ！', 'コンニチハ！', 'パン、パン！'], reindeer: ['フゴッ', 'ブフッ'], polarbear: ['グオォ', 'フシュー'], penguin: ['クワッ', 'グワァ'], seagull: ['ミャーオ', 'キャウキャウ'],
  eagle: ['ピーヒョロロ', 'キィーッ'], dolphin: ['キュイキュイ', 'キューイ'], whale: ['ブォォォ……', '（潮を吹いた）'], crow: ['カァー', 'カァカァ'], owl: ['ホーホー', 'ホッホー'], frog: ['ケロケロ', 'ゲコゲコ'],
  snake: ['シャーッ'], turtle: ['（首をのばした）'], bat: ['キィキィ'], rat: ['チュウ', 'チュチュッ'], goose: ['クワァ、クワァ', 'ガハン'],
};
const ANGRY = { bear: 'グオオォッ！', polarbear: 'グオオォッ！', boar: 'ブギィィッ！', wolf: 'グルルルッ！', tiger: 'ガアァッ！', croc: 'ガブッ！', goose: 'シャーッ！', cow: 'ブモォォッ！', goat: 'メェッ！', horse: 'ヒヒィィン！', camel: 'ブォッ！', reindeer: 'フンッ！', deer: 'ピィッ！', dog: 'ウゥ〜ワンワン！', eagle: 'キィーッ！', crow: 'ギャア！' };

// 家畜の名前（国柄ごと）。0：アルデリア、1：北のヴェルムント（ドイツ風）、2：南のサハル（アラビア風）
const NAMES = [
  {
    cow: ['ハナ', 'モモ', 'ウメ', 'サクラ', 'ユキ', 'マメ', 'キク', 'ミルク', 'ボタン', 'フジ'], horse: ['疾風', '黒王', '白雪', '雷電', '月影', '春風', '流星', '紅葉', '朝霧', '松風'],
    dog: ['ポチ', 'シロ', 'クロ', 'ハチ', 'タロ', 'コロ', 'ゴン', 'チビ', 'リキ', 'マル'], cat: ['タマ', 'ミケ', 'トラ', 'クロ', 'ミイ', 'ソラ', 'チャコ', 'ハク'],
    sheep: ['モコ', 'ワタ', 'フワリ', 'メイ', 'ユキ', 'コム'], pig: ['ブー', 'トン', 'マル', 'コブ', 'ハム', 'ぶた吉'], goat: ['メイ', 'ヒゲ', 'チャコ', 'ユキ', 'ツノ'],
    chicken: ['コッコ', 'ピヨ', 'トサカ', 'ヒヨ', 'ゴマ', 'キナコ'], duck: ['ガー子', 'アヒ', 'ペタ', 'ヨチ'], donkey: ['ロバ吉', 'ポコ', 'のんびり', 'トコ'],
  },
  {
    cow: ['ベルタ', 'リーゼル', 'エルゼ', 'ミルヒェン', 'ローザ', 'グレーテル', 'ハイデ', 'ブルーメ'], horse: ['ドンナー', 'ブリッツ', 'シュトゥルム', 'ファルケ', 'シュヴァルツ', 'ヴィント', 'シュネー', 'アイゼン'],
    dog: ['ブルーノ', 'ハッソ', 'ルクス', 'ベロ', 'ルーディ', 'ヴァルディ', 'アックス', 'ザイバー'], cat: ['ミーツェ', 'ムッキ', 'ペーター', 'ルーナ', 'シュヌルリ', 'モーレ'],
    sheep: ['フロッケ', 'ヴォルケ', 'ヴォリ', 'シュネッケ'], pig: ['ウルゼル', 'ボリス', 'シュヴァイニ', 'グスティ'], goat: ['ハイディ', 'ザンディ', 'ゲルティ', 'メッキ'],
    chicken: ['ヘンニ', 'ゴルディ', 'ピッケ', 'フリーダ'], duck: ['クヴァッキ', 'エンテリ', 'パドル'], donkey: ['ベンノ', 'エーゼル', 'グラウ'],
  },
  {
    cow: ['ラーダ', 'ヌーラ', 'ハリーマ', 'サミーラ', 'バディーア'], horse: ['ルーフ', 'バルク', 'アスワド', 'シャーヒン', 'ナジュム', 'ラアド', 'サハーブ', 'ヒラール'],
    dog: ['ザヒール', 'ファーリス', 'ヤズィード', 'サイフ', 'ナミル', 'ラーミ'], cat: ['ミシュミシュ', 'カマル', 'ルル', 'ズィーナ', 'アンバル', 'スッカル'],
    sheep: ['ソーファ', 'ナアジャ', 'バヤード'], pig: ['ブトゥン'], goat: ['ワルダ', 'ガザーラ', 'ザフラ', 'ラビーア', 'ヌジュマ'],
    chicken: ['ハビーバ', 'ドゥッラ', 'サフラ', 'ルルア'], duck: ['ラミース', 'バッタ'], donkey: ['サブル', 'アブー・サブル', 'ハリーム'],
  },
];
// 人々が呼ぶあだ名（野生の群れの長・長寿・人を恐れさせた個体）
const NICK = {
  bear: ['片耳の大熊', '黒金の大熊', '傷顔の大熊', '森の主', '月の輪の大熊'], polarbear: ['氷原の白王', '氷の爪'],
  wolf: ['灰色の牙', '銀の背', '片目の狼', '夜吠え', '白い喉の狼'], deer: { m: ['白い牡鹿', '十二枝の角', '霧の牡鹿'], f: ['白い牝鹿', '星額の牝鹿'] },
  boar: ['大牙の猪', '岩割り', '藪のヌシ'], fox: ['古狐', '尾白の狐', '三度化けの狐'], tiger: ['金の虎', '密林の王', '傷の縞王'], eagle: ['嵐の大鷲', '峰の王'],
  owl: ['長老フクロウ', '月見の梟'], crow: ['物知りのカラス', '町の大烏'], croc: ['川の主', '岩鰐'], monkey: ['赤っ面のボス猿', '古傷のボス猿', '白眉のボス猿'],
  reindeer: ['雪角', '白い先導'], camel: ['砂の古老', '瘤の長老'], whale: ['老いた大鯨', '白い大鯨'], turtle: ['百歳亀', '苔むした甲羅'], dolphin: ['歌うイルカ'],
  snake: ['大蛇ヌシ'], penguin: ['皇帝ペンギン'], seagull: ['港の親分カモメ'], rabbit: ['月見兎'], parrot: ['おしゃべり長老'], goose: ['先導の雁'], squirrel: ['森の蓄え屋'],
  frog: ['沼の主'], bat: ['洞窟の古老'], scorpion: ['砂の黒刃'],
};

// ---------- 小道具 ----------
const isAnimal = (c) => { const d = SPECIES[c?.sp]; return !!d && !d.monster && (d.kind === 'wild' || d.kind === 'livestock'); };
const alive = (S, c) => !!c && c.hp > 0 && S.creatures[c.id] === c;
const cr = (S, id) => (id != null ? S.creatures[id] : null);
const d2 = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const lifeDays = (sp) => (LIFE[sp] || 10) * DAYS_PER_YEAR;
const power = (c) => c.lv * 10 + c.atk;
const isLive = (c) => SPECIES[c.sp].kind === 'livestock';
const juvKids = (S, c) => (c.young || []).map((id) => S.creatures[id]).filter((k) => k && k.hp > 0 && k.juv);
function inTownBox(sim, x, z, pad = 1) {
  for (const s of sim.S.world.settlements) if (Math.abs(s.x - x) <= s.r + pad && Math.abs(s.z - z) <= s.r + pad) return s;
  return null;
}
function nearestTown(sim, x, z) {
  let best = null, bd = 1e9;
  for (const s of sim.S.world.settlements) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
  return best ? { s: best, d: bd } : null;
}
function kingdomOfC(sim, c) {
  if (c.owner != null) return sim.town(c.owner)?.kingdom ?? 0;
  const k = sim.S.world.kingdomOf?.[Math.round(c.pos.z) * W + Math.round(c.pos.x)];
  return k >= 0 ? k : nearestTown(sim, c.pos.x, c.pos.z)?.s.kingdom ?? 0;
}
function say(sim, c, text, force = false) {
  const S = sim.S;
  if (!text) return;
  if (!force && (c._sayT || 0) > S.t) return;
  if (!sim.isWatched(c)) return;
  c._sayT = S.t + 20;
  sim.events.push({ type: 'say', id: c.id, text });
}
const voice = (sim, c) => { const v = VOICE[c.sp]; return v ? sim.rng.pick(v) : null; };
function log(sim, text, ids = [], pos = null) { sim.pushLog(text, 'event', ids, pos); }
const beastLabel = (c) => (c.given && c.title ? c.name : SPECIES[c.sp].name);
function townsfolk(sim, sid, n, pred) {
  const out = [];
  for (const q of sim.living()) if (q.s === sid && q.jail == null && (!pred || pred(q))) out.push(q);
  for (let i = out.length - 1; i > 0; i--) { const j = sim.rng.int(0, i); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, n);
}
const hhMembers = (sim, hh) => (hh ? hh.members.map((id) => sim.S.people[id]).filter((q) => q && q.deathYear == null) : []);
const posR = (c) => ({ x: Math.round(c.pos.x), z: Math.round(c.pos.z) });
// 町の外に立てる場所を探す（町の中心から外へずらす）
function outsideTown(sim, x, z) {
  const mask = townMask(sim);
  const t = nearestTown(sim, x, z);
  for (let k = 0; k < 14; k++) {
    const xi = Math.round(x), zi = Math.round(z);
    if (xi > 1 && zi > 1 && xi < W - 2 && zi < H - 2 && !mask[zi * W + xi] && walkable(tileAt(sim.S.world, xi, zi)) && tileAt(sim.S.world, xi, zi) !== T.BLD) return { x: xi, z: zi };
    if (!t) break;
    const dx = x - t.s.x || 0.5, dz = z - t.s.z || 0.5, d = Math.hypot(dx, dz) || 1;
    x += dx / d * 1.5; z += dz / d * 1.5;
  }
  return null;
}

// ---------- 初期化（遅延） ----------
export function initFauna(sim) {
  const S = sim.S;
  S.fauna = S.fauna || {};
  const F = S.fauna;
  F.v = F.v || 1;
  F.nicks = F.nicks || {};
  F.traps = F.traps || [];
  F.newsCool = F.newsCool || {};
  F.stats = F.stats || { births: 0, litters: 0, livestockBirths: 0, starved: 0, old: 0, forage: 0, cropRaids: 0, stockKilled: 0, trapped: 0, trapDodged: 0, rankFights: 0, outcasts: 0, independent: 0, protect: 0, dogDefend: 0, mourning: 0, migrations: 0, hibernate: 0, fed: 0, nick: 0, adopt: 0, feedCost: 0, products: 0, culled: 0 };
  F.hist = F.hist || [];
  F.flocks = F.flocks || {};
  return F;
}
const F_ = (sim) => sim.S.fauna || initFauna(sim);

// ---------- 個体の身支度（遅延） ----------
export function ensureAnimal(sim, c) {
  if (c.fa || !isAnimal(c)) return;
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp];
  c.fa = 1;
  c.sex = c.sex || (R.chance(0.5) ? 'f' : 'm');
  if (c.mate === undefined) c.mate = null;
  c.parents = c.parents || [];
  c.young = c.young || [];
  c.rank = c.rank || 0;
  c.wary = c.wary || {};
  c.likes = c.likes || {};
  c.den = c.den || DEN[c.sp] || 'ねぐら';
  if (isLive(c)) c.bond = c.bond ?? 45 + R.int(0, 25);
  const life = lifeDays(c.sp);
  // 生まれたて：親を見つけて家族にする
  if ((c.age || 0) <= 0 && !c.juv) { adoptNewborn(sim, c); return; }
  if (c.age > life * 0.8) c.age = R.int(matureOf(c.sp), Math.floor(life * 0.7));
  if (c.role === 'young' && c.age >= matureOf(c.sp)) c.role = isLive(c) ? liveRole(sim, c) : def.pack ? 'member' : 'loner';
  if (isLive(c) && !c.given) nameBeast(sim, c, false);
}

function liveRole(sim, c) {
  const LIVE = { cow: ['dairy', 'plow', 'meat'], sheep: ['wool'], pig: ['meat'], chicken: ['layer'], duck: ['layer'], goat: ['dairy'], horse: ['mount', 'pack'], donkey: ['pack'], dog: ['watchdog'], cat: ['mouser'] };
  return LIVE[c.sp] ? sim.rng.pick(LIVE[c.sp]) : 'member';
}

// 家畜に名前をつける（飼い主の家族が名付ける）
function nameBeast(sim, c, announce, namer) {
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp];
  const k = Math.max(0, Math.min(2, kingdomOfC(sim, c)));
  const pool = NAMES[k][c.sp] || NAMES[0][c.sp];
  if (!pool) return;
  const used = new Set();
  for (const o of Object.values(S.creatures)) if (o.sp === c.sp && o.owner === c.owner && o.given) used.add(o.given);
  let name = R.pick(pool);
  for (let i = 0; i < 8 && used.has(name); i++) name = R.pick(pool);
  if (used.has(name)) name = name + (['二世', 'Ⅱ', 'ジュニア'][R.int(0, 2)]);
  c.given = name;
  c.title = `${def.name}の${name}`;
  c.name = c.title;
  if (announce && namer) sim.remember(namer, `生まれた${def.name}の子に「${name}」と名付けた`, { emo: 0.7, imp: 0.5, k: 'pet' });
}

// 生まれた子の親を決める（creatures.js の繁殖や牧場の繁殖で生まれた子）
function adoptNewborn(sim, c) {
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp];
  let mom = null, bd = 6;
  for (const o of Object.values(S.creatures)) {
    if (o === c || o.sp !== c.sp || o.hp <= 0 || o.juv || (o.age || 0) < matureOf(c.sp)) continue;
    if (o.sex && o.sex !== 'f') continue;
    const d = d2(o, c);
    if (d < bd) { bd = d; mom = o; }
  }
  if (!mom) {
    // 親の見当たらない子は、よそから流れてきた若い個体として扱う
    c.age = matureOf(c.sp);
    if (isLive(c) && !c.given) nameBeast(sim, c, false);
    return;
  }
  if (!mom.fa) ensureAnimal(sim, mom);
  mom.sex = 'f';
  birthLink(sim, mom, c);
  S.fauna.stats.births++;
  if (isLive(c)) livestockBirthJoy(sim, mom, [c]);
}

function birthLink(sim, mom, kid) {
  const S = sim.S;
  kid.fa = 1;
  kid.juv = true;
  kid.age = 0;
  kid.sex = kid.sex || (sim.rng.chance(0.5) ? 'f' : 'm');
  kid.mate = null; kid.young = []; kid.wary = {}; kid.likes = {};
  kid.parents = [mom.id, mom.mate && S.creatures[mom.mate] ? mom.mate : null].filter((x) => x != null);
  kid.den = DEN[kid.sp] || 'ねぐら';
  kid.adultRole = kid.role !== 'young' ? kid.role : null;
  kid.role = 'young';
  kid.power = 0.45;
  applyStats(kid); kid.hp = kid.maxhp;
  if (kid.title) kid.name = kid.title;
  kid.home = { ...mom.home };
  kid.range = mom.range;
  kid.hunger = 80;
  kid.rank = 0;
  mom.young = (mom.young || []).filter((id) => S.creatures[id]);
  mom.young.push(kid.id);
  const dad = cr(S, mom.mate);
  if (dad) { dad.young = (dad.young || []).filter((id) => S.creatures[id]); dad.young.push(kid.id); }
  if (isLive(mom)) kid.bond = 60;
}

// 家畜の出産は飼い主の喜び
function livestockBirthJoy(sim, mom, kids) {
  const S = sim.S, R = sim.rng, def = SPECIES[mom.sp];
  const hh = S.households[mom.keeper];
  const fam = hhMembers(sim, hh);
  const namer = fam.filter((q) => sim.ageOf(q) >= 5 && sim.ageOf(q) < 14)[0] || fam.find((q) => sim.ageOf(q) >= 14) || null;
  for (const k of kids) { k.keeper = mom.keeper; nameBeast(sim, k, true, namer); }
  const names = kids.map((k) => k.given).join('と');
  const momName = mom.given ? `${def.name}の${mom.given}` : def.name;
  S.fauna.stats.livestockBirths += kids.length;
  for (const q of fam) if (sim.ageOf(q) >= 5) sim.remember(q, `うちの${momName}が${kids.length > 1 ? `${kids.length}頭の` : ''}子を産んだ。${names}と名付けた`, { emo: 0.8, imp: 0.6, k: 'pet' });
  const head = fam.find((q) => sim.ageOf(q) >= 16);
  if (head) {
    log(sim, `${sim.fullName(head)}の家で${momName}が子を産んだ。${namer ? namer.given : head.given}が「${names}」と名付けた。`, [head.id], mom.pos);
    if (R.chance(0.5)) sim.gossip(head, `飼っている${def.name}に子が生まれた`, 0.4, sim.living().filter((q) => q.s === head.s && q.hh !== head.hh).slice(0, 12), { congrat: `${def.name}の子が生まれたんだってね`, silent: true });
  }
  say(sim, mom, voice(sim, mom), true);
}

// ---------- 考える（creatures.js の think の最初で呼ぶ。true なら目的地を決めた） ----------
export function faunaThink(sim, c, def, all, humans) {
  if (def.monster || !(def.kind === 'wild' || def.kind === 'livestock')) return false;
  if (!c.fa) { if (!sim.S.fauna) initFauna(sim); ensureAnimal(sim, c); }
  const S = sim.S, R = sim.rng;
  c.sleeping = false;
  // 冬眠
  if (c.hibernate) { c.sleeping = true; c.goal = d2h(c) > 1 ? { x: c.home.x, z: c.home.z } : null; return true; }
  // 主人の墓を離れない犬
  if (c.mourn) {
    if (S.t < c.mourn.until) { c.goal = { x: c.mourn.x + R.range(-1, 1), z: c.mourn.z + R.range(-1, 1) }; if (R.chance(0.08)) say(sim, c, R.pick(['クゥーン……', '……', 'クゥン']), false); return true; }
    c.mourn = null;
  }
  // 子は親について歩く
  if (c.juv) {
    const mom = cr(S, c.parents?.[0]);
    if (mom && mom.hp > 0 && !mom.inDungeon) {
      const d = d2(c, mom);
      if (d > 1.4 || mom.goal?.run) { c.goal = { x: mom.pos.x + R.range(-0.6, 0.6), z: mom.pos.z + R.range(-0.6, 0.6), run: d > 3 || !!mom.goal?.run }; return true; }
      c.goal = null; return true;
    }
  }
  // 母は子を守る
  if (c.young?.length && !c.juv && protectYoung(sim, c, def, all, humans)) return true;
  // 覚えた狩人・自分を傷つけた人から逃げる
  if (def.kind === 'wild' && humans.length && c.wary) {
    for (const h of humans) {
      if (!c.wary[h.id] || h.inside != null || h.deathYear != null) continue;
      const dx = c.pos.x - h.pos.x, dz = c.pos.z - h.pos.z, d = Math.hypot(dx, dz);
      if (d > 8 + c.wary[h.id]) continue;
      c.goal = { x: c.pos.x + dx / (d || 1) * 7, z: c.pos.z + dz / (d || 1) * 7, run: true };
      if (R.chance(0.2)) say(sim, c, voice(sim, c));
      return true;
    }
  }
  // 犬と馬：主人とともに
  if ((c.sp === 'dog' || c.sp === 'horse') && c.master != null && masterThink(sim, c, def)) return true;
  // 季節移動・渡り
  if (c.mig && d2h(c) > 6) {
    c.goal = { x: c.home.x + R.range(-2, 2), z: c.home.z + R.range(-2, 2), path: !def.flies && !def.swims && d2h(c) > 10, run: !!def.flies };
    return true;
  }
  if (c.mig && d2h(c) <= 6) c.mig.arrived = true;
  // 飢えて人里へ降りる
  if (c.forage && d2h(c) > 6) { c.goal = { x: c.home.x, z: c.home.z, path: !def.flies && d2h(c) > 10 }; return true; }
  // 眠る（夜行性は昼に、ほかは夜に）。お腹がすいていたら眠らずに探す
  const h = sim.hour();
  const night = h >= 21 || h < 5;
  const sleepy = NOCT.has(c.sp) ? h >= 8 && h < 17 : c.sp === 'wolf' ? h >= 11 && h < 15 : night;
  if (sleepy && c.hunger > 35 && !c.forage && !c.raid) {
    if (isLive(c)) {
      const s = c.owner != null ? sim.town(c.owner) : null;
      if (s?.ranch && c.range === 0) {
        // 牧場の家畜は夜は小屋（牧場の隅）に集まる
        const barn = { x: s.ranch.x0 + (['chicken', 'duck'].includes(c.sp) ? 0 : 1), z: s.ranch.z0 + (['sheep', 'goat'].includes(c.sp) ? 1 : 0) };
        c.sleeping = true;
        c.goal = Math.hypot(c.pos.x - barn.x, c.pos.z - barn.z) > 1.2 ? { x: barn.x + R.range(-0.5, 0.5), z: barn.z + R.range(-0.5, 0.5) } : null;
        return true;
      }
      if (c.sp === 'dog' || c.sp === 'horse' || c.sp === 'donkey') { c.sleeping = true; c.goal = d2h(c) > 1.5 ? { x: c.home.x, z: c.home.z } : null; return true; }
      return false;
    }
    if (c.role === 'sentry' && R.chance(0.5)) return false; // 見張りは交代で起きている
    c.sleeping = true;
    c.goal = d2h(c) > 1.5 ? { x: c.home.x + R.range(-0.5, 0.5), z: c.home.z + R.range(-0.5, 0.5), path: !def.flies && !def.swims && d2h(c) > 14 } : null;
    return true;
  }
  // 牧場の家畜は、飢えて人里へ降りた獣でなければ狙わない（柵・牧夫・犬がいるので近寄りがたい）
  if (def.kind === 'wild' && preyFor(c.sp).length && c.hunger < 45 && huntByWeb(sim, c, def, all)) return true;
  // 数の減った獲物は、天敵から早めに逃げる（安全弁：狩られにくくする）
  if (def.kind === 'wild' && trophicLevel(c.sp) <= 2 && isRare(sim, c.sp)) {
    for (const o of all) {
      if (o === c || o.hp <= 0 || o.dormant || !preyFor(o.sp).includes(c.sp)) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d > 7) continue;
      c.goal = { x: c.pos.x + dx / (d || 1) * 6, z: c.pos.z + dz / (d || 1) * 6, run: true };
      return true;
    }
  }
  // 餌をくれる人に寄っていく
  if (c.likes && humans.length && !c.hostile && c.hunger < 85) {
    for (const q of humans) {
      if ((c.likes[q.id] || 0) < 2 || q.inside != null || q.deathYear != null) continue;
      const d = Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z);
      if (d < 8 && d > 1.2) { c.goal = { x: q.pos.x + R.range(-0.8, 0.8), z: q.pos.z + R.range(-0.8, 0.8) }; if (R.chance(0.25)) say(sim, c, voice(sim, c)); return true; }
    }
  }
  return false;
}
// 野生の獲物（creatures.js の PREY から家畜を除いたもの）
const WILD_PREY = new Set(['deer', 'boar', 'rabbit', 'squirrel', 'camel', 'reindeer', 'penguin', 'monkey', 'slime', 'frog', 'turtle']);
// 表にもとづく狩り：好きな獲物（餌の量が多く、近く、弱ったもの）を選ぶ。家畜は飢えて人里へ降りたときだけ
function huntByWeb(sim, c, def, all) {
  const R = sim.rng, S = sim.S;
  const list = preyFor(c.sp);
  const desperate = c.hunger < 8;
  let prey = null, bs = 0;
  for (const o of all) {
    if (o === c || o.hp <= 0 || o.dormant || o.inDungeon || !list.includes(o.sp)) continue;
    if (o.owner != null && !c.forage && !desperate) continue;
    if (!canHunt(sim, c.sp, o.sp, desperate)) continue;
    if (SPECIES[o.sp].size > def.size * (FOOD_WEB[c.sp]?.pack ? 1.4 : 1.25) && !o.juv) continue;
    const d = d2(o, c);
    if (d > 12 || inTownBox(sim, o.pos.x, o.pos.z)) continue;
    const sc = foodValue(o.sp) / (d + 2) * (o.juv ? 1.6 : 1) * (o.hp < o.maxhp * 0.5 || o.thin ? 1.5 : 1);
    if (sc > bs) { bs = sc; prey = o; }
  }
  if (prey) {
    if (d2(prey, c) < 1.4) startFight(sim, c, prey); else c.goal = { x: prey.pos.x, z: prey.pos.z, run: true };
    return true;
  }
  if (c.hunger < 12) return false; // 飢えきった獣は何でも襲う（creatures.js の狩りにまかせる）
  // 獲物を探して縄張りを歩く
  c.goal = { x: c.home.x + R.range(-c.range, c.range), z: c.home.z + R.range(-c.range, c.range) };
  return true;
}
function ranchGuard(sim, c, def, all) {
  const R = sim.rng;
  let near = null;
  for (const s of sim.S.world.settlements) {
    if (!s.ranch) continue;
    const cx = (s.ranch.x0 + s.ranch.x1) / 2, cz = (s.ranch.z0 + s.ranch.z1) / 2;
    if (Math.hypot(cx - c.pos.x, cz - c.pos.z) < 16) { near = { x: cx, z: cz }; break; }
  }
  if (!near) return false;
  // 牧場の近くでは野生の獲物だけを狩る
  let prey = null, bd = 12;
  for (const o of all) {
    if (o === c || o.hp <= 0 || o.dormant || o.owner != null || !WILD_PREY.has(o.sp) || SPECIES[o.sp].size > def.size * 1.4) continue;
    const d = d2(o, c);
    if (d < bd && !inTownBox(sim, o.pos.x, o.pos.z)) { bd = d; prey = o; }
  }
  if (prey) {
    if (bd < 1.4) startFight(sim, c, prey); else c.goal = { x: prey.pos.x, z: prey.pos.z, run: true };
    return true;
  }
  // 獲物がいなければ、牧場から離れた方へ探しに行く
  const dx = c.pos.x - near.x, dz = c.pos.z - near.z, d = Math.hypot(dx, dz) || 1;
  c.goal = { x: c.pos.x + dx / d * 8 + R.range(-2, 2), z: c.pos.z + dz / d * 8 + R.range(-2, 2) };
  return true;
}
const d2h = (c) => Math.hypot(c.pos.x - c.home.x, c.pos.z - c.home.z);

function protectYoung(sim, c, def, all, humans) {
  const S = sim.S, R = sim.rng;
  const kids = juvKids(S, c);
  if (!kids.length) return false;
  let th = null;
  const kidSize = SPECIES[c.sp].size * 0.6;
  for (const o of all) {
    if (o === c || o.hp <= 0 || o.dormant || o.sp === c.sp) continue;
    if (!(PRED.has(o.sp) || o.hostile)) continue;
    // 子を狙えるほどの相手だけ（小さな捕食者は大きな獣の子を狙わない）
    if (!o.hostile && SPECIES[o.sp].size * 1.4 < kidSize) continue;
    if (PRED.has(c.sp) && o.atk < c.atk * 0.8 && !o.hostile) continue;
    if (!o.hostile && o.hunger >= 40) continue; // 腹の満ちた捕食者は子を狙わない
    if (d2(o, c) < 4.5) { th = o; break; }
  }
  let human = false;
  if (!th && def.kind === 'wild' && (c._charge || 0) < S.t) {
    for (const q of humans) {
      if (q.inside != null || q.deathYear != null || q.jail != null) continue;
      const d = Math.hypot(q.pos.x - c.pos.x, q.pos.z - c.pos.z);
      if (d < 3.2 && !inTownBox(sim, q.pos.x, q.pos.z, 3)) { th = q; human = true; break; }
    }
  }
  if (!th) return false;
  const tx = th.pos.x, tz = th.pos.z;
  // 子どもは巣へ逃げ込む
  for (const k of kids) { k.fleeUntil = S.t + 15; }
  if ((c._protT || 0) < S.t) { c._protT = S.t + 60; F_(sim).stats.protect++; }
  if (FIERCE.has(c.sp) && (!human || FIERCE_HUMAN.has(c.sp) && R.chance(0.3))) {
    const d = Math.hypot(tx - c.pos.x, tz - c.pos.z);
    if (human) {
      c._charge = S.t + 720;
      say(sim, c, ANGRY[c.sp] || voice(sim, c), true);
      if (d < 1.5) {
        startFight(sim, c, th);
        const where = sim.placeName(tx, tz);
        log(sim, `${where}で、子連れの${def.name}が子を守ろうと${th.given}に襲いかかった。`, [th.id], th.pos);
        sim.remember(th, `${where}で子連れの${def.name}に襲われた。子に近づきすぎたのだ`, { emo: -0.7, imp: 0.7, k: 'fight', where: { x: Math.round(tx), z: Math.round(tz) } });
        sim.learnDanger(th, tx, tz, 2);
      } else c.goal = { x: tx, z: tz, run: true };
      return true;
    }
    if (d < 1.4 && !c.fight && (c.atk >= th.atk * 0.4 || R.chance(0.3))) {
      startFight(sim, c, th);
      if (R.chance(0.3)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で、母${def.name}が子を狙う${th.name}に立ち向かった。`, [], c.pos);
    } else c.goal = { x: tx, z: tz, run: true };
    say(sim, c, ANGRY[c.sp] || voice(sim, c));
    return true;
  }
  if (human) return false; // おとなしい母は子と一緒に逃げる（ふつうの逃げ方にまかせる）
  // おとなしい母は子と敵のあいだに立ちはだかり、それから逃げる
  const k0 = kids[0];
  c.goal = { x: (k0.pos.x + tx) / 2, z: (k0.pos.z + tz) / 2, run: true };
  return true;
}

function masterThink(sim, c, def) {
  const S = sim.S, R = sim.rng;
  const m = S.people[c.master];
  if (!m || m.deathYear != null || m.jail != null) return false;
  const d = Math.hypot(m.pos.x - c.pos.x, m.pos.z - c.pos.z);
  // 主人を守る
  if (m.fight && d < 14) {
    const foe = sim.entity(m.fight.target);
    const ok = foe && foe.hp > 0 && (typeof foe.id === 'string' ? foe.id !== c.id : (foe.bandit || S.wanted?.[foe.id]));
    if (ok) {
      const fd = Math.hypot(foe.pos.x - c.pos.x, foe.pos.z - c.pos.z);
      if (fd < 1.4 && !c.fight) {
        startFight(sim, c, foe);
        say(sim, c, ANGRY[c.sp] || 'ワンワン！', true);
        F_(sim).stats.dogDefend++;
        if ((c._defLog || 0) < S.t) {
          c._defLog = S.t + 600;
          log(sim, `${c.name}が、主人の${m.given}を守ろうと${foe.given || foe.name}に飛びかかった。`, [m.id], c.pos);
          sim.remember(m, `${foe.given || foe.name}に襲われたとき、${c.given || def.name}が飛びかかって守ってくれた`, { emo: 0.8, imp: 0.7, k: 'pet' });
          c.bond = Math.min(100, (c.bond || 50) + 10);
        }
      } else c.goal = { x: foe.pos.x, z: foe.pos.z, run: true };
      return true;
    }
  }
  if (m.inside != null) return false;
  // 狩人の犬は狩りについていく
  if (c.sp === 'dog' && m.job === 'hunter' && m.action?.type === 'work' && d < 40) {
    if (d > 2) c.goal = { x: m.pos.x + R.range(-1, 1), z: m.pos.z + R.range(-1, 1), run: d > 4, path: d > 12 };
    else c.goal = null;
    return true;
  }
  // 騎士の愛馬は出陣についていく
  if (c.sp === 'horse' && m.mission && d < 30) {
    c.goal = { x: m.pos.x + R.range(-1, 1), z: m.pos.z + R.range(-1, 1), run: d > 3, path: d > 12 };
    return true;
  }
  // 出迎え
  if (c.sp === 'dog' && d < 7 && d > 1.5 && !m.fight) {
    c.goal = { x: m.pos.x + R.range(-0.7, 0.7), z: m.pos.z + R.range(-0.7, 0.7), run: true };
    if (R.chance(0.2)) say(sim, c, R.pick(['ワンワン！', 'ワン！', '（しっぽを振った）']));
    return true;
  }
  return false;
}

// ---------- 死んだとき（creatures.js の killCreature から呼ぶ） ----------
export function faunaDied(sim, c, killer) {
  if (!isAnimal(c) || c._faDone) return;
  c._faDone = true;
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp];
  if (!S.fauna) initFauna(sim);
  const F = S.fauna;
  const human = killer && typeof killer.id === 'number';
  // 食物連鎖の記録：誰が誰を食べたか
  if (killer) {
    // 表にない組み合わせは「返り討ち」（襲われた側が相手を倒した）として別に数える
    const eats = human ? preyFor('human').includes(c.sp) : preyFor(killer.sp).includes(c.sp);
    const k = (human ? '人' : killer.sp) + '>' + c.sp;
    const box = eats ? 'eaten' : 'fought';
    F.stats[box] = F.stats[box] || {};
    F.stats[box][k] = (F.stats[box][k] || 0) + 1;
    if (!human && eats) killer._ate = { sp: c.sp, pre: killer.hunger || 0 };
  } else if (c._cause) {
    F.stats.deaths = F.stats.deaths || {};
    const k = c._cause + '>' + c.sp;
    F.stats.deaths[k] = (F.stats.deaths[k] || 0) + 1;
  }
  // つがいと子
  const mate = cr(S, c.mate);
  if (mate) { mate.mate = null; mate.widowed = c.id; if (MONOGAMOUS.has(c.sp) && R.chance(0.4)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で、つがいを失った${beastLabel(mate)}が、いつまでも鳴いていた。`, [], mate.pos); }
  for (const id of c.young || []) { const k = S.creatures[id]; if (k && k.juv && k.parents?.[0] === c.id) k.orphan = true; }
  // 名のある獣
  if (c.nick) {
    delete F.nicks[c.nick];
    if (human) {
      sim.news(`${sim.fullName(killer)}が、人々に「${c.nick}」と呼ばれていた${def.name}を仕留めた`, 2, c.pos);
      killer.deeds?.push(`「${c.nick}」を仕留めた`);
      sim.remember(killer, `ついに「${c.nick}」を仕留めた`, { emo: 0.8, imp: 0.9, k: 'hunt' });
      killer.fame = (killer.fame || 0) + 8;
    } else if (c._cause === 'old') sim.news(`人々に「${c.nick}」と呼ばれた${def.name}が、老いて死んだらしい`, 1, c.pos);
  }
  // 家畜・ペットの死：飼い主が悲しむ
  if (isLive(c) && c.keeper != null) {
    const hh = S.households[c.keeper];
    const fam = hhMembers(sim, hh);
    const nm = c.given ? `${def.name}の${c.given}` : def.name;
    const how = c._cause === 'old' ? '老いて静かに息を引き取った' : c._cause === 'starve' ? '飢えて死んでしまった' : human ? `${killer.given}に殺された` : killer ? `${SPECIES[killer.sp]?.name || '獣'}に襲われて死んだ` : '死んでしまった';
    if (killer && !human) F.stats.stockKilled++;
    for (const q of fam) if (sim.ageOf(q) >= 5) sim.remember(q, `うちの${nm}が${how}`, { emo: c._cause === 'old' ? -0.5 : -0.7, imp: (c.bond || 50) > 70 ? 0.8 : 0.55, k: 'pet' });
    if (fam[0] && (c.sp === 'dog' || c.sp === 'horse' || c.sp === 'cat' || killer && !human)) log(sim, `${sim.fullName(fam[0])}の家の${nm}が${how}。`, [fam[0].id], c.pos);
    if (killer && !human && killer.hp > 0) {
      for (const q of fam) if (q.values?.courage > 0.6 && sim.ageOf(q) >= 16 && R.chance(0.5)) q.vendetta = q.vendetta || killer.sp;
    }
  }
  // 騎士の愛馬
  if (c.sp === 'horse' && c.master != null) {
    const m = S.people[c.master];
    if (m && m.deathYear == null) sim.remember(m, `愛馬${c.given || ''}を失った。${R.pick(['長く共に駆けた相棒だった', 'あの背の温もりを忘れない'])}`, { emo: -0.8, imp: 0.8, k: 'pet' });
  }
  // 人に殺された：近くの仲間はその人を覚えて避ける
  if (human && def.kind === 'wild') {
    for (const o of Object.values(S.creatures)) {
      if (o === c || o.sp !== c.sp || o.hp <= 0 || d2(o, c) > 12) continue;
      o.wary = o.wary || {};
      o.wary[killer.id] = Math.min(6, (o.wary[killer.id] || 0) + 2);
    }
  }
  // 猫がネズミを捕る
  if (killer && !human && killer.sp === 'cat' && c.sp === 'rat' && R.chance(0.4)) {
    say(sim, killer, 'ニャッ！', true);
    const hh = S.households[killer.keeper];
    const kid = hhMembers(sim, hh).find((q) => sim.ageOf(q) < 14 && sim.ageOf(q) >= 5);
    if (kid) sim.remember(kid, `${killer.given || '猫'}がネズミを捕まえて、得意げに見せにきた`, { emo: 0.4, imp: 0.3, k: 'pet' });
    killer.bond = Math.min(100, (killer.bond || 50) + 3);
  }
}

// killCreature を呼び、つなぎ込み前でも faunaDied が必ず走るようにする
function kill(sim, c, killer, cause) {
  c._cause = cause;
  killCreature(sim, c, killer);
  if (!c._faDone) faunaDied(sim, c, killer);
}

// ---------- 毎時 ----------
export function faunaHourly(sim) {
  const S = sim.S, R = sim.rng;
  const F = F_(sim);
  const h = Math.floor(sim.hour());
  const si = sim.seasonIdx();
  const all = Object.values(S.creatures);
  const drought = new Set(Object.keys(S.wx?.drought || {}).map(Number));
  const animals = [];
  for (const c of all) {
    if (c.hp <= 0 || c.dormant || !isAnimal(c)) continue;
    if (!c.fa) ensureAnimal(sim, c);
    animals.push(c);
  }
  // 食べる・飢える
  for (const c of animals) {
    if (c.hp <= 0 || !S.creatures[c.id]) continue;
    feedHour(sim, c, si, h, drought);
  }
  // 子育て：乳・給餌、孤児
  for (const c of animals) {
    if (!c.juv || c.hp <= 0) continue;
    const mom = cr(S, c.parents?.[0]);
    if (mom && mom.hp > 0) {
      if (d2(c, mom) < 3.5) { c.hunger = Math.max(c.hunger, Math.min(100, mom.hunger + 5)); mom.hunger = Math.max(0, mom.hunger - 0.35); }
    } else if (R.chance(0.08)) {
      // 群れの雌が母を亡くした子を引き取る
      const nm = animals.find((o) => o !== c && o.sp === c.sp && !o.juv && o.sex === 'f' && o.hp > 0 && d2(o, c) < 7);
      if (nm) {
        c.parents = [nm.id, ...(c.parents || []).slice(1)];
        nm.young = (nm.young || []).filter((id) => S.creatures[id]); nm.young.push(c.id);
        c.orphan = false; F.stats.adopt++;
        if (R.chance(0.5)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で、母を亡くした${SPECIES[c.sp].name}の子を、群れの雌が引き取って育てはじめた。`, [], c.pos);
      }
    }
  }
  packShare(sim, animals);
  if (h % 2 === 0) traps(sim, animals, h);
  if (h % 3 === 0) forageStart(sim, animals, si, drought);
  forageRaid(sim, animals, h);
  if (h % 3 === 1) peopleFeed(sim, animals, h);
  mastersCheck(sim, animals);
  if (h % 2 === 0) watchdogs(sim, animals);
  ambient(sim, animals, h);
}

function foodFactor(sim, c, def, si, drought) {
  const t = tileAt(sim.S.world, Math.round(c.pos.x), Math.round(c.pos.z));
  const b = biomeOf(t);
  const season = 1; // 季節の増減は餌場（regrowPatches）が受け持つ
  let bio = { grass: 1, forest: 1, dense: 1, jungle: 1.15, desert: 0.45, snow: 0.5, mountain: 0.6, beach: 0.8, sea: 1, deepsea: 1, river: 1, waste: 0.2, town: 0.7 }[b] ?? 0.8;
  if (c.sp === 'reindeer' && b === 'snow') bio = 0.85; // コケを掘って食べる
  if (['camel', 'scorpion', 'snake'].includes(c.sp) && b === 'desert') bio = 1;
  if (c.sp === 'bat' && b === 'mountain') bio = 1;
  if (c.sp === 'polarbear' || c.sp === 'penguin') bio = 1;
  let f = season * bio;
  // 雪原の冬はもっと厳しい
  if (si === 3 && b === 'snow' && !['reindeer', 'polarbear', 'penguin'].includes(c.sp)) f *= 0.6;
  return f;
}

function speciesCount(sim, sp) {
  const S = sim.S;
  // 広い世界では数え直しを15分ごとに（生き物が多いと毎歩の数え直しが重い）
  if (!sim._faCount || (W > 200 ? S.t - sim._faCountT >= 15 || S.t < sim._faCountT : sim._faCountT !== S.t)) {
    sim._faCount = {}; sim._faCountT = S.t;
    for (const o of Object.values(S.creatures)) if (o.hp > 0) sim._faCount[o.sp] = (sim._faCount[o.sp] || 0) + 1;
  }
  return sim._faCount[sp] || 0;
}
function rankMul(c) {
  if (!c.rank || !c._gsize || c._gsize < 2) return 1;
  return 1.1 - 0.4 * (c.rank - 1) / (c._gsize - 1);
}

function feedHour(sim, c, si, h, drought) {
  const S = sim.S, def = SPECIES[c.sp];
  const before = c.hunger;
  if (c.hibernate) { c.hunger = Math.min(100, c.hunger + 0.9); }
  else if (isLive(c)) {
    // 家畜：春〜秋は草を食む。冬と町の中の犬猫・厩舎の馬は飼い主が餌をやる（faunaDaily で c.fed）
    const s = c.owner != null ? sim.town(c.owner) : null;
    const grazing = s?.ranch && c.range === 0 && si !== 3 && h >= 6 && h < 19 && def.diet !== 'meat';
    if (grazing) { const fa = foodAt(sim, c.pos.x, c.pos.z); c.hunger = Math.min(100, c.hunger + 2.8 * Math.max(0.4, Math.min(1, fa.plant)) * rankMul(c)); eatFrom(sim, c.pos.x, c.pos.z, 'plant', needOf(c.sp) / 13 * Math.min(1, fa.plant)); }
    else if (c.fed) c.hunger = Math.min(100, c.hunger + 1.15 * rankMul(c));
    else c.hunger = Math.min(100, c.hunger + (def.diet === 'meat' ? 0.95 : 0.6)); // 犬猫は残飯やネズミ、ほかは道ばたの草で食いつなぐ
  } else {
    // 狩りの獲物：表の「餌の量 ÷ 必要な量」だけ満たされる。余りは群れに分ける（packShare）
    if (c._ate) {
      const full = c._ate.pre + foodValue(c._ate.sp) / needOf(c.sp) * 50;
      c.hunger = Math.min(100, full);
      c._left = Math.max(0, full - 100);
      c._ate = null;
    }
    const active = !c.sleeping;
    // 餌場（草・木の実・魚・虫）から食べる。狩りは faunaThink の huntByWeb
    let gain = active || PRED.has(c.sp) ? forageGain(sim, c, def, si, drought) : 0;
    if (!active) gain *= 0.3;
    if (c.juv) gain *= 0.5;
    gain *= rankMul(c);
    c.hunger = Math.min(100, c.hunger + gain);
  }
  c.thin = c.hunger < 25;
  // 飢え
  if (c.hunger < 3) {
    c.starveH = (c.starveH || 0) + 1;
    c.hp -= 2.2 + c.maxhp * 0.025;
    const limit = 70 + (c.age > lifeDays(c.sp) * 0.7 ? -30 : 0) + (c.juv ? -30 : 0);
    // 数が減った種は、最後の力で食いつなぐ（絶滅を防ぐ）。家畜は飼い主が見捨てない
    const rare = !isLive(c) && isRare(sim, c.sp);
    if (rare || isLive(c) && (c.keeper != null || c.owner != null)) { c.hp = Math.max(c.hp, c.maxhp * 0.3); c.hunger = Math.max(c.hunger, 6); }
    else if (c.hp <= 0 || c.starveH > limit) {
      c.hp = Math.max(c.hp, 0.1);
      S.fauna.stats.starved++;
      S.fauna.stats.starvedBy = S.fauna.stats.starvedBy || {};
      S.fauna.stats.starvedBy[c.sp] = (S.fauna.stats.starvedBy[c.sp] || 0) + 1;
      if (!isLive(c) && sim.rng.chance(0.35)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で、痩せ細った${beastLabel(c)}が飢えて倒れていた。`, [], c.pos);
      kill(sim, c, null, 'starve');
      return;
    }
  } else if (c.hunger > 20) c.starveH = 0;
  c._lastH = before;
}

// オオカミなど：長とそのつがいが先に食べ、末席は残り物
function packShare(sim, animals) {
  const S = sim.S, R = sim.rng;
  const groups = {};
  for (const c of animals) if (PRED.has(c.sp) && SOCIAL.has(c.sp) && c._gkey) (groups[c._gkey] = groups[c._gkey] || []).push(c);
  for (const g of Object.values(groups)) {
    if (g.length < 2) continue;
    const eater = g.find((c) => c._left > 0);
    if (!eater) continue;
    let pool = eater._left; eater._left = 0;
    const order = g.filter((c) => c !== eater && d2(c, eater) < 9).sort((a, b) => (a.rank || 99) - (b.rank || 99));
    for (const c of order) {
      const share = Math.min(100 - c.hunger, c.rank <= 2 ? 45 : pool > 40 ? 25 : 8);
      c.hunger += Math.max(0, Math.min(share, pool)); pool -= share;
      if (pool <= 0) break;
    }
    const last = order[order.length - 1];
    if (last && order.length >= 2 && R.chance(0.25) && sim.isWatched(eater)) {
      log(sim, `${sim.placeName(eater.pos.x, eater.pos.z)}で、${SPECIES[eater.sp].name}の群れが獲物を囲んだ。長とそのつがいが先に食べ、末席の一頭は残り物の骨をかじっていた。`, [], eater.pos);
    }
  }
}

// 狩人の罠
function traps(sim, animals, h) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  F.traps = F.traps.filter((t) => S.t - t.t < 1440 * 3);
  if (F.traps.length < 14) {
    for (const p of sim.living()) {
      if (p.job !== 'hunter' || p.action?.type !== 'work' || p.inside != null || p.fight) continue;
      if (inTownBox(sim, p.pos.x, p.pos.z, 3) || !R.chance(0.3)) continue;
      F.traps.push({ x: Math.round(p.pos.x), z: Math.round(p.pos.z), owner: p.id, t: S.t });
      if (F.traps.length >= 14) break;
    }
  }
  for (const t of F.traps.slice()) {
    for (const c of animals) {
      if (c.hp <= 0 || !S.creatures[c.id]) continue;
      const def = SPECIES[c.sp];
      if (def.kind !== 'wild' || def.flies || def.swims || def.size > 1.05 || NO_TRAP.has(c.sp)) continue;
      if (Math.abs(c.pos.x - t.x) > 1.8 || Math.abs(c.pos.z - t.z) > 1.8) continue;
      if (c.trapWise) {
        if (R.chance(0.15)) {
          F.stats.trapDodged++;
          if (c.nick || R.chance(0.3)) log(sim, `${sim.placeName(t.x, t.z)}で、${beastLabel(c)}が狩人の罠を見抜いて、よけて通った。`, [t.owner], t);
          F.traps.splice(F.traps.indexOf(t), 1);
          break;
        }
        continue;
      }
      if (!R.chance(0.14)) continue;
      const hunter = S.people[t.owner];
      F.traps.splice(F.traps.indexOf(t), 1);
      F.stats.trapped++;
      // 見ていた仲間は罠を覚える
      for (const o of animals) if (o !== c && o.sp === c.sp && o.hp > 0 && d2(o, c) < 10) o.trapWise = true;
      if (hunter && hunter.deathYear == null && sim.hh(hunter)) {
        sim.remember(hunter, `仕掛けておいた罠に${SPECIES[c.sp].name}がかかっていた`, { emo: 0.4, imp: 0.3, k: 'hunt' });
        if (R.chance(0.3)) log(sim, `狩人${hunter.given}の仕掛けた罠に${beastLabel(c)}がかかった。`, [hunter.id], t);
        kill(sim, c, hunter, 'trap');
      } else kill(sim, c, null, 'trap');
      break;
    }
  }
}

// 飢えた獣が人里へ降りる
function forageStart(sim, animals, si, drought) {
  const S = sim.S, R = sim.rng, F = S.fauna, w = S.world;
  let n = animals.filter((c) => c.forage).length;
  for (const c of animals) {
    if (c.forage) {
      if (c.hunger > 72 || S.t > c.forage.until || c.hp <= 0) {
        c.home = c.forage.home; c.path = null; c.goal = null;
        if (c.hunger > 72 && R.chance(0.3)) log(sim, `腹を満たした${beastLabel(c)}は、${sim.town(c.forage.sid)?.name || '人里'}の近くを離れて${c.den || 'ねぐら'}へ帰っていった。`, [], c.pos);
        c.forage = null;
      }
      continue;
    }
  }
  if (n >= 5) return;
  for (const c of animals) {
    if (n >= 5) break;
    const def = SPECIES[c.sp];
    if (def.kind !== 'wild' || c.juv || c.forage || c.mig && !c.mig.arrived || c.hibernate || def.swims || c.sp === 'rat') continue;
    const grazer = ['boar', 'deer', 'bear', 'monkey', 'rabbit', 'camel', 'reindeer', 'crow'].includes(c.sp);
    if (!PRED.has(c.sp) && !grazer) continue;
    if (['scorpion', 'snake', 'owl', 'croc'].includes(c.sp)) continue;
    const hard = si === 3 || drought.size > 0;
    if (!(c.hunger < (hard ? 22 : 8))) continue;
    if (!R.chance(0.35)) continue;
    // 近くの村：肉食は牧場、草食・雑食は畑
    let best = null, bd = 48;
    for (const s of w.settlements) {
      const d = Math.hypot(s.x - c.pos.x, s.z - c.pos.z);
      if (d > bd || S.towns[s.id]?.occupied) continue;
      let spot = null;
      if (PRED.has(c.sp) && s.ranch) spot = { x: (s.ranch.x0 + s.ranch.x1) / 2, z: (s.ranch.z0 + s.ranch.z1) / 2 };
      else if (!PRED.has(c.sp) || c.sp === 'bear') { const fl = fieldSpot(sim, s.id); if (fl) spot = fl; else if (s.ranch && c.sp === 'bear') spot = { x: (s.ranch.x0 + s.ranch.x1) / 2, z: (s.ranch.z0 + s.ranch.z1) / 2 }; }
      if (!spot) continue;
      const o = outsideTown(sim, spot.x, spot.z);
      if (!o) continue;
      bd = d; best = { s, spot: o };
    }
    if (!best) continue;
    c.forage = { sid: best.s.id, x: best.spot.x, z: best.spot.z, until: S.t + 60 * 20, home: { ...c.home } };
    c.home = { x: best.spot.x, z: best.spot.z };
    c.path = null; c.goal = null;
    n++; F.stats.forage++;
    const key = best.s.id + ':' + c.sp;
    if ((F.newsCool[key] || -1e9) < S.t - 1440 * 2) {
      F.newsCool[key] = S.t;
      const why = si === 3 ? '冬の山に食べ物がなく' : '日照りで食べ物が減り';
      sim.news(`${why}、腹をすかせた${beastLabel(c)}が${best.s.name}の近くまで降りてきているらしい`, 1, best.spot);
      for (const q of townsfolk(sim, best.s.id, 4)) {
        sim.remember(q, `${why}、腹をすかせた${SPECIES[c.sp].name}が村の近くに出るらしい。${PRED.has(c.sp) ? '家畜が心配だ' : '畑が心配だ'}`, { emo: -0.5, imp: 0.5, k: 'sight', where: best.spot });
        sim.learnDanger(q, best.spot.x, best.spot.z, PRED.has(c.sp) ? 2 : 1);
      }
    }
  }
}
function fieldSpot(sim, sid) {
  const w = sim.S.world;
  sim._fieldSpot = sim._fieldSpot || {};
  if (sid in sim._fieldSpot) return sim._fieldSpot[sid];
  const fs = (w.fields || []).filter((f) => f.s === sid);
  sim._fieldSpot[sid] = fs.length ? { x: fs.reduce((a, f) => a + f.x, 0) / fs.length, z: fs.reduce((a, f) => a + f.z, 0) / fs.length } : null;
  return sim._fieldSpot[sid];
}
// 畑を荒らす
function forageRaid(sim, animals, h) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  for (const c of animals) {
    if (!c.forage || PRED.has(c.sp) && c.sp !== 'bear' || c.hp <= 0) continue;
    if (d2h(c) > 5 || !R.chance(h >= 19 || h < 6 ? 0.6 : 0.2)) continue;
    const s = sim.town(c.forage.sid);
    const m = S.towns[c.forage.sid];
    if (!s || !m) continue;
    c.hunger = Math.min(100, c.hunger + 45);
    m.stock.wheat = Math.max(0, (m.stock.wheat || 0) - 2);
    const farms = Object.values(S.households).filter((x) => x.s === s.id && (x.land || 0) > 0);
    const hh = farms.length ? R.pick(farms) : null;
    if (hh) hh.food = Math.max(0, (hh.food || 0) - 1);
    F.stats.cropRaids++;
    const key = 'crop' + s.id;
    if ((F.newsCool[key] || -1e9) < S.t - 1440) {
      F.newsCool[key] = S.t;
      const fam = hhMembers(sim, hh);
      log(sim, `${s.name}の畑が${beastLabel(c)}に荒らされた${fam[0] ? `（${sim.fullName(fam[0])}の畑）` : ''}。`, fam[0] ? [fam[0].id] : [], c.pos);
      for (const q of fam) if (sim.ageOf(q) >= 10) sim.remember(q, `${SPECIES[c.sp].name}に畑を荒らされた。せっかく育てたのに`, { emo: -0.6, imp: 0.55, k: 'farm' });
    }
  }
}

// 人が動物に餌をやる：子ども・年寄り・やさしい人が、猫・犬・カラス・アヒルに
function peopleFeed(sim, animals, h) {
  if (h < 7 || h > 18) return;
  const S = sim.S, R = sim.rng, F = S.fauna;
  const cands = animals.filter((c) => ['cat', 'dog', 'crow', 'duck', 'seagull', 'horse', 'donkey', 'goat', 'squirrel'].includes(c.sp) && c.hp > 0);
  if (!cands.length) return;
  const people = sim.living().filter((p) => p.inside == null && !p.fight && p.jail == null && (sim.ageOf(p) < 13 || sim.ageOf(p) > 60 || p.pers?.A > 0.72));
  for (const c of cands) {
    if (!R.chance(0.12) || c.hunger > 80) continue;
    let q = null;
    for (const p of people) if (Math.abs(p.pos.x - c.pos.x) < 5 && Math.abs(p.pos.z - c.pos.z) < 5) { q = p; break; }
    if (!q) continue;
    const hh = sim.hh(q);
    // 食べ残しがある家の人だけ（家族の食事を削ってまではやらない）
    if (!hh || (hh.food || 0) < hh.members.length * 2 + 1) continue;
    hh.food -= 0.05;
    c.hunger = Math.min(100, c.hunger + 30);
    c.likes = c.likes || {};
    c.likes[q.id] = Math.min(10, (c.likes[q.id] || 0) + 1);
    if (isLive(c) && c.keeper != null && c.keeper === q.hh) c.bond = Math.min(100, (c.bond || 50) + 2);
    q.needs.pleasure = Math.min(100, q.needs.pleasure + 6);
    F.stats.fed++;
    const nm = c.given || SPECIES[c.sp].name;
    if (c.likes[q.id] === 3) sim.remember(q, `${nm}が、わたしを見ると寄ってくるようになった`, { emo: 0.6, imp: 0.45, k: 'pet' });
    else if (R.chance(0.2)) sim.remember(q, `${nm}にパンくずをやった`, { emo: 0.35, imp: 0.2, k: 'pet' });
    say(sim, c, voice(sim, c));
  }
}

// 主人の死、墓のそばを離れない犬、騎士と愛馬
function mastersCheck(sim, animals) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  for (const c of animals) {
    if (c.master == null) continue;
    const m = S.people[c.master];
    if (m && m.deathYear == null) continue;
    const old = c.master;
    c.master = null;
    if (!m) continue;
    if (c.sp === 'dog') {
      const s = sim.town(m.s);
      const church = s && sim.townBuilding(s, 'church');
      const at = church ? church.door : s ? { x: s.x, z: s.z } : c.home;
      c.mourn = { until: S.t + 1440 * R.int(5, 12), x: at.x + 1, z: at.z + 1, who: old };
      F.stats.mourning++;
      sim.news(`${s?.name || ''}で、亡くなった${m.given}の飼い犬${c.given || ''}が、墓のそばを離れようとしない`, 1, at);
      for (const q of townsfolk(sim, m.s, 6)) sim.remember(q, `亡くなった${m.given}の犬${c.given || ''}が、毎日墓のそばでじっと主人を待っている。胸が痛む`, { emo: -0.6, imp: 0.6, about: [m.id], k: 'pet' });
      const heir = hhMembers(sim, S.households[c.keeper])[0];
      if (heir) sim.remember(heir, `${m.given}の犬${c.given || ''}が、墓の前から動こうとしない`, { emo: -0.7, imp: 0.65, about: [m.id], k: 'pet' });
    } else if (c.sp === 'horse') {
      log(sim, `主を亡くした愛馬${c.given || ''}が、厩舎で何日も飼い葉に口をつけなかった。`, [], c.pos);
      c.hunger = Math.min(c.hunger, 40);
    }
  }
}

// 番犬は獣の気配に吠える。獣は犬に吠えられて逃げる
function watchdogs(sim, animals) {
  const S = sim.S, R = sim.rng;
  const beasts = animals.filter((c) => PRED.has(c.sp) || c.forage);
  if (!beasts.length) return;
  for (const d of animals) {
    if (d.sp !== 'dog' || d.hp <= 0 || d.sleeping && R.chance(0.5)) continue;
    for (const b of beasts) {
      if (b === d || b.hp <= 0 || d2(b, d) > 9 || b.sp === 'owl' || b.sp === 'snake' || b.sp === 'scorpion') continue;
      say(sim, d, 'ワンワンワン！', true);
      if (R.chance(b.hunger < 10 ? 0.25 : 0.6)) b.fleeUntil = S.t + 40;
      if (R.chance(0.2) && d.owner != null) {
        const q = townsfolk(sim, d.owner, 1)[0];
        if (q) sim.remember(q, `夜中に${d.given || '犬'}がしきりに吠えていた。${SPECIES[b.sp].name}が来ていたらしい`, { emo: -0.3, imp: 0.35, k: 'sight' });
      }
      break;
    }
  }
}

// 鳴き声：一番鶏、夜明けの鳥、夕暮れの遠吠え、夜のフクロウ
function ambient(sim, animals, h) {
  const R = sim.rng;
  if (!animals.length) return;
  let n = 0;
  for (let i = 0; i < 40 && n < 5; i++) {
    const c = animals[R.int(0, animals.length - 1)];
    if (!c || c.hp <= 0 || c.fight || c.hibernate) continue;
    let text = null;
    if (c.sp === 'chicken' && h === 5 && c.sex === 'm') text = 'コケコッコー！';
    else if (c.sp === 'wolf' && (h === 19 || h === 20 || h === 2) && (c.rank === 1 || R.chance(0.4))) text = 'アオーーン……';
    else if (c.sp === 'owl' && (h >= 21 || h < 4)) text = 'ホーホー';
    else if (['crow', 'parrot', 'seagull', 'goose'].includes(c.sp) && h >= 5 && h <= 8) text = voice(sim, c);
    else if (!c.sleeping && R.chance(0.3)) text = voice(sim, c);
    if (!text) continue;
    say(sim, c, text);
    n++;
  }
}

// ---------- 毎日 ----------
export function faunaDaily(sim) {
  const S = sim.S, R = sim.rng;
  const F = F_(sim);
  const si = sim.seasonIdx(), doy = sim.dayOfYear(), dos = doy % DAYS_PER_SEASON;
  let animals = [];
  for (const c of Object.values(S.creatures)) {
    if (c.hp <= 0 || c.dormant || !isAnimal(c)) continue;
    if (!c.fa) ensureAnimal(sim, c);
    animals.push(c);
  }
  // 年をとる・大人になる・独り立ち・老衰
  for (const c of animals) {
    if (c.hp <= 0) continue;
    if (c.juv && c.age >= matureOf(c.sp)) growUp(sim, c);
    else if (c.juv && c.power && c.power < 1) { const r = c.hp / c.maxhp; c.power = Math.min(1, 0.45 + 0.55 * c.age / matureOf(c.sp)); applyStats(c); if (c.title) c.name = c.title; c.hp = c.maxhp * r; }
    const life = lifeDays(c.sp);
    if (c.age > life * 0.85 && R.chance(0.01 + 0.06 * (c.age / life - 0.85) / 0.3)) { F.stats.old++; kill(sim, c, null, 'old'); }
  }
  animals = animals.filter((c) => S.creatures[c.id] === c && c.hp > 0);
  // 群れと序列
  hierarchy(sim, animals);
  // つがい
  if (si !== 3) pairUp(sim, animals, si);
  // 季節の子育て（春が多い）
  breed(sim, animals, si, dos);
  // 冬眠・季節移動・渡り
  seasons(sim, animals, si, dos);
  // 家畜の世話・なつき・恵み
  livestockCare(sim, animals, si, dos);
  // 犬・馬の主人
  bindMasters(sim, animals);
  // あだ名
  nicknames(sim, animals);
  // 増えすぎたら（病・縄張りから追われる）静かに減らす
  overpop(sim, animals);
  // 記憶は少しずつ薄れる
  for (const c of animals) {
    if (c.wary) for (const k of Object.keys(c.wary)) { c.wary[k] -= 0.08; if (c.wary[k] <= 0) delete c.wary[k]; }
    if (c.likes) for (const k of Object.keys(c.likes)) { c.likes[k] -= 0.05; if (c.likes[k] <= 0 || S.people[k]?.deathYear != null) delete c.likes[k]; }
  }
  // 餌場の回復と、未開拓地からの移住（安全弁）
  regrowPatches(sim, si, new Set(Object.keys(S.wx?.drought || {}).map(Number)));
  frontierImmigration(sim, animals);
  // 種ごとの数の記録（60日分）
  const cnt = {};
  for (const c of animals) if (S.creatures[c.id]) cnt[c.sp] = (cnt[c.sp] || 0) + 1;
  F.hist.push({ d: sim.dayIndex, c: cnt });
  if (F.hist.length > 60) F.hist.shift();
}

function growUp(sim, c) {
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp], F = S.fauna;
  c.juv = false; c.orphan = false;
  c.power = 1;
  const r = c.hp / c.maxhp;
  c.role = c.adultRole || (isLive(c) ? liveRole(sim, c) : def.pack ? 'member' : R.pick(['member', 'loner', 'sentry']));
  delete c.adultRole;
  applyStats(c); if (c.title) c.name = c.title; c.hp = c.maxhp * r;
  if (isLive(c)) return;
  // 独り立ち：単独で暮らす種と、群れの若い雄の一部は遠くへ
  if (SOLITARY.has(c.sp) || SOCIAL.has(c.sp) && c.sex === 'm' && R.chance(0.4)) {
    for (let i = 0; i < 12; i++) {
      const a = R.next() * Math.PI * 2, dd = R.range(9, 16);
      const x = Math.round(c.home.x + Math.cos(a) * dd), z = Math.round(c.home.z + Math.sin(a) * dd);
      if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2) continue;
      const t = tileAt(S.world, x, z);
      if (def.swims ? !(t === T.SEA || t === T.DEEP) : !def.flies && (!walkable(t) || t === T.BLD)) continue;
      if (townMask(sim)[z * W + x]) continue;
      c.home = { x, z }; c.path = null;
      if (SOCIAL.has(c.sp)) c.role = 'loner';
      F.stats.independent++;
      if (R.chance(0.25)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で育った${def.name}の若い${c.sex === 'm' ? '雄' : '雌'}が、親元を離れて独り立ちした。`, [], c.pos);
      break;
    }
  }
}

// 群れの序列：長・つがい・末席、序列争い、はぐれ者、つつき順位、ボス猿
function hierarchy(sim, animals) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  const groups = {};
  for (const c of animals) {
    c._gkey = null; c._gsize = 0;
    if (!SOCIAL.has(c.sp) || c.hp <= 0) { c.rank = 0; continue; }
    if (c.role === 'loner' && !isLive(c)) { c.rank = 0; continue; }
    if (!c.home) c.home = { x: Math.round(c.pos.x), z: Math.round(c.pos.z) };
    const key = isLive(c) ? c.sp + '@' + (c.owner ?? 'x') + (c.range === 0 ? 'r' : 't') : c.sp === 'goose' && c.flock ? 'goose@' + c.flock : c.sp + ':' + Math.floor(c.home.x / 12) + ',' + Math.floor(c.home.z / 12);
    c._gkey = key;
    (groups[key] = groups[key] || []).push(c);
  }
  for (const [key, g] of Object.entries(groups)) {
    const adults = g.filter((c) => !c.juv);
    const juv = g.filter((c) => c.juv);
    adults.sort((a, b) => power(b) - power(a) || (b.age || 0) - (a.age || 0));
    // 序列争い：二番手が長に挑む
    if (adults.length >= 3 && R.chance(adults[0].sp === 'wolf' || adults[0].sp === 'monkey' ? 0.08 : 0.05)) {
      const [top, ch] = adults;
      const old = top.age > lifeDays(top.sp) * 0.65;
      const win = power(ch) * R.range(0.7, 1.3) * (old ? 1.3 : 1) > power(top) * R.range(0.7, 1.2);
      F.stats.rankFights++;
      const def = SPECIES[top.sp];
      const verb = { deer: '角を突き合わせた', reindeer: '角を突き合わせた', goat: '頭をぶつけ合った', chicken: 'くちばしでつつき合った', duck: '羽をばたつかせてつつき合った', horse: '後ろ脚で蹴り合った', cow: '頭で押し合った', sheep: '頭をぶつけ合った', monkey: '歯をむいてつかみ合った', wolf: '牙をむいて取っ組み合った', boar: '牙でぶつかり合った' }[top.sp] || '争った';
      top.hp = Math.max(1, top.hp - top.maxhp * 0.2); ch.hp = Math.max(1, ch.hp - ch.maxhp * 0.2);
      if (win) {
        ch.lv = Math.max(ch.lv, top.lv) + 1; applyStats(ch); if (ch.title) ch.name = ch.title;
        adults[0] = ch; adults[1] = top;
        const place = sim.placeName(ch.pos.x, ch.pos.z);
        log(sim, `${place}で、${def.name}の群れの長の座をめぐって二頭が${verb}。若い挑戦者が勝ち、新しい長になった${top.nick ? `（敗れたのは「${top.nick}」）` : ''}。`, [], ch.pos);
        // 年老いて敗れた長は群れを去る
        if (old && !isLive(top)) makeOutcast(sim, top, '長の座を追われ、群れを去った');
      } else if (R.chance(0.5)) log(sim, `${sim.placeName(top.pos.x, top.pos.z)}で、${def.name}の群れの二番手が長に挑んだが、${verb}末に退けられた。`, [], top.pos);
    }
    const ranked = [...adults.filter((c) => S.creatures[c.id] && c._gkey === key)];
    // オオカミ：長のつがいは二番
    const lead = ranked[0];
    if (lead && lead.mate) { const m = ranked.findIndex((c) => c.id === lead.mate); if (m > 1) { const [x] = ranked.splice(m, 1); ranked.splice(1, 0, x); } }
    ranked.forEach((c, i) => { c.rank = i + 1; c._gsize = ranked.length + juv.length; });
    juv.forEach((c) => { c.rank = ranked.length + 1; c._gsize = ranked.length + juv.length; });
    // はぐれ者：飢えた末席の若いオオカミが群れを離れる
    const last = ranked[ranked.length - 1];
    if (last && ranked.length >= 4 && !isLive(last) && last.hunger < 20 && R.chance(0.2)) makeOutcast(sim, last, '群れでいつも最後に食べる末席の一頭が、群れを離れてはぐれ者になった');
    // つつき順位（鶏）
    if (lead && (lead.sp === 'chicken' || lead.sp === 'duck') && ranked.length >= 3 && R.chance(0.15)) {
      const low = ranked[ranked.length - 1];
      low.hunger = Math.max(0, low.hunger - 10);
      const kh = hhMembers(sim, S.households[lead.keeper]).find((q) => sim.ageOf(q) >= 5 && sim.ageOf(q) < 14);
      if (kh) sim.remember(kh, `鶏小屋では${lead.given || '一番強い鶏'}がいばっていて、${low.given || 'いちばん弱い鶏'}はいつも最後にしか餌を食べられない`, { emo: -0.1, imp: 0.3, k: 'pet' });
    }
  }
}

function makeOutcast(sim, c, why) {
  const S = sim.S, R = sim.rng, def = SPECIES[c.sp];
  for (let i = 0; i < 12; i++) {
    const a = R.next() * Math.PI * 2, dd = R.range(10, 16);
    const x = Math.round(c.home.x + Math.cos(a) * dd), z = Math.round(c.home.z + Math.sin(a) * dd);
    if (x < 2 || z < 2 || x >= W - 2 || z >= H - 2) continue;
    const t = tileAt(S.world, x, z);
    if (!def.flies && !def.swims && (!walkable(t) || t === T.BLD)) continue;
    if (def.swims && !(t === T.SEA || t === T.DEEP)) continue;
    if (townMask(sim)[z * W + x]) continue;
    c.home = { x, z }; c.path = null; c.role = 'loner'; c.rank = 0; c.outcast = true; c._gkey = null;
    if (c.mate) { const m = S.creatures[c.mate]; if (m) m.mate = null; c.mate = null; }
    S.fauna.stats.outcasts++;
    log(sim, `${sim.placeName(c.pos.x, c.pos.z)}の${def.name}の群れで、${why}。`, [], c.pos);
    return true;
  }
  return false;
}

function pairUp(sim, animals, si) {
  const S = sim.S, R = sim.rng;
  const bySp = {};
  for (const c of animals) {
    if (c.juv || c.hp <= 0 || c.outcast && R.chance(0.7)) continue;
    if (c.mate && !S.creatures[c.mate]) c.mate = null;
    // 一生つがいでない種は、夏の終わりに別れる
    if (c.mate && si === 1 && !MONOGAMOUS.has(c.sp) && !isLive(c) && R.chance(0.15)) { const m = S.creatures[c.mate]; if (m) m.mate = null; c.mate = null; }
    (bySp[c.sp] = bySp[c.sp] || []).push(c);
  }
  for (const [sp, list] of Object.entries(bySp)) {
    if (sp === 'cat' || sp === 'rat') continue;
    // 群れの長から先に選ぶ
    list.sort((a, b) => (a.rank || 99) - (b.rank || 99));
    for (const c of list) {
      if (c.mate || c.sex !== 'm') continue;
      let best = null, bd = isLive(c) ? 30 : 12;
      for (const o of list) {
        if (o.mate || o.sex !== 'f' || o === c) continue;
        if (isLive(c) && o.owner !== c.owner) continue;
        if ((c.parents || []).includes(o.id) || (o.parents || []).includes(c.id) || c.parents?.[0] && c.parents[0] === o.parents?.[0]) continue;
        const d = d2(o, c);
        if (d < bd) { bd = d; best = o; }
      }
      if (!best || !R.chance(0.5)) continue;
      c.mate = best.id; best.mate = c.id;
      if (c.nick || best.nick || R.chance(0.03)) log(sim, `${sim.placeName(c.pos.x, c.pos.z)}で、${beastLabel(c)}と${beastLabel(best)}がつがいになった。`, [], c.pos);
    }
  }
}

function breed(sim, animals, si, dos) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  const count = {};
  for (const c of animals) count[c.sp] = (count[c.sp] || 0) + 1;
  // 野生：春（ペンギンは冬、カラス・フクロウは春の前半）
  for (const mom of animals) {
    const sp = mom.sp, def = SPECIES[sp];
    if (def.kind !== 'wild' || mom.sex !== 'f' || mom.juv || mom.hp <= 0 || !mom.mate) continue;
    const season = sp === 'penguin' ? 3 : 0;
    const rareBoost = (count[sp] || 0) < (popTarget(sim, sp) || POP[sp] || 6) * 0.6;
    if (si !== season && !(rareBoost && si !== 3)) continue; // 数が減った種は夏・秋にも産む
    const dad = cr(S, mom.mate);
    if (!dad || dad.hp <= 0 || d2(dad, mom) > 14) continue;
    if (juvKids(S, mom).length || mom.hunger < 40 || (mom._bredY === sim.year())) continue;
    // オオカミは長のつがいだけが子を産む
    if (sp === 'wolf' && mom.rank > 2 && mom._gsize >= 3) continue;
    const cap = Math.round((popTarget(sim, sp) || POP[sp] || 6) * 1.3);
    if ((count[sp] || 0) >= cap) continue;
    // 安全弁：数が目安の6割を下回った種は、よく子を産む
    if (!R.chance(rareBoost ? 0.5 : 0.22)) continue;
    const [a, b] = LITTER[sp] || [1, 1];
    let n = Math.min(R.int(a, b), cap - (count[sp] || 0));
    const kids = [];
    for (let i = 0; i < n; i++) {
      const p = def.swims || def.flies ? { x: mom.pos.x, z: mom.pos.z } : sim.randomNear(mom.pos.x, mom.pos.z, 1) || { x: Math.round(mom.pos.x), z: Math.round(mom.pos.z) };
      const k = makeCreature(sim, sp, p.x, p.z, { hx: mom.home.x, hz: mom.home.z, range: mom.range, age: 0 });
      if (!S.creatures[k.id]) continue;
      if (mom.flock) k.flock = mom.flock;
      birthLink(sim, mom, k);
      kids.push(k);
    }
    if (!kids.length) continue;
    mom._bredY = sim.year();
    count[sp] = (count[sp] || 0) + kids.length;
    F.stats.births += kids.length; F.stats.litters++;
    if (mom.nick || dad.nick || R.chance(0.12)) log(sim, `${sim.placeName(mom.pos.x, mom.pos.z)}の${mom.den}で、${beastLabel(mom)}が${kids.length}${def.flies || sp === 'goose' ? '羽のひな' : '頭の子'}を${def.flies || ['goose', 'turtle', 'croc', 'snake', 'frog', 'penguin'].includes(sp) ? 'かえした' : '産んだ'}。`, [], mom.pos);
  }
  // 家畜：犬・猫・馬（牧場の家畜は creatures.js が増やす）
  if (si !== 0) return;
  for (const mom of animals) {
    if (!['dog', 'cat', 'horse'].includes(mom.sp) || mom.sex !== 'f' || mom.juv || mom.hp <= 0 || mom.owner == null) continue;
    if (mom._bredY === sim.year() || !R.chance(0.04)) continue;
    const same = animals.filter((c) => c.sp === mom.sp && c.owner === mom.owner && S.creatures[c.id]).length;
    if (same >= ({ dog: 4, cat: 4, horse: 5 }[mom.sp])) continue;
    const n = mom.sp === 'horse' ? 1 : Math.min(R.int(1, 2), ({ dog: 4, cat: 4 }[mom.sp]) - same);
    const kids = [];
    for (let i = 0; i < n; i++) {
      const k = makeCreature(sim, mom.sp, mom.pos.x, mom.pos.z, { owner: mom.owner, range: mom.range, hx: mom.home.x, hz: mom.home.z, age: 0 });
      if (!S.creatures[k.id]) continue;
      birthLink(sim, mom, k);
      kids.push(k);
    }
    if (!kids.length) continue;
    mom._bredY = sim.year();
    F.stats.births += kids.length;
    if (mom.keeper != null) livestockBirthJoy(sim, mom, kids);
  }
}

function seasons(sim, animals, si, dos) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  // 冬眠：冬の初めにクマは巣穴へ、春に腹をすかせて目覚める
  if (si === 3 && dos === 0) {
    let n = 0;
    for (const c of animals) if (c.sp === 'bear' && !c.juv && c.hp > 0 && !c.forage) { c.hibernate = true; n++; }
    if (n) { F.stats.hibernate += n; log(sim, `冬が来た。森のクマたちは巣穴にこもり、冬眠に入った。`, [], null); }
  }
  if (si === 0 && dos === 0) {
    let n = 0;
    for (const c of animals) if (c.hibernate) { c.hibernate = false; c.hunger = Math.min(c.hunger, 25); n++; }
    if (n) sim.news('春が来て、冬眠から目覚めたクマが腹をすかせて森を歩き回っているらしい', 1);
  }
  // 季節移動：雪原のトナカイ・ウサギは冬に森へ下り、春に戻る
  if (si === 3 && dos === 0) {
    const moved = {};
    for (const c of animals) {
      if (!['reindeer', 'rabbit'].includes(c.sp) || c.mig) continue;
      const b = biomeOf(tileAt(S.world, Math.round(c.home.x), Math.round(c.home.z)));
      if (b !== 'snow') continue;
      const key = Math.floor(c.home.x / 12) + ',' + Math.floor(c.home.z / 12) + c.sp;
      let to = moved[key];
      if (!to) { to = findBiomeNear(sim, c.home.x, c.home.z, ['forest', 'dense', 'grass'], 34); moved[key] = to; }
      if (!to) continue;
      c.mig = { from: { ...c.home }, arrived: false };
      c.home = { x: to.x + R.int(-1, 1), z: to.z + R.int(-1, 1) }; c.path = null;
      F.stats.migrations++;
    }
    if (Object.keys(moved).length) {
      const any = animals.find((c) => c.sp === 'reindeer' && c.mig);
      if (any) sim.news('雪が深くなり、トナカイの群れが雪原から森へ下りはじめた', 1, any.pos);
    }
  }
  if (si === 0 && dos === 1) {
    let n = 0;
    for (const c of animals) if (c.mig && c.sp !== 'goose') { c.home = c.mig.from || c.home; c.mig = { from: null, arrived: false, back: true }; c.path = null; n++; }
    if (n) log(sim, '雪がとけ、冬を森で越したトナカイたちが雪原へ帰っていく。', [], null);
  }
  for (const c of animals) if (c.mig?.back && c.mig.arrived) c.mig = null;
  // 渡り鳥（ガン）：夏は北の水辺、秋に南へ渡り、春に北へ帰る
  geese(sim, animals, si, dos);
}

function findBiomeNear(sim, x, z, biomes, r) {
  const w = sim.S.world, R = sim.rng, mask = townMask(sim);
  let best = null, bd = 1e9;
  for (let i = 0; i < 260; i++) {
    const nx = Math.round(x + R.range(-r, r)), nz = Math.round(z + R.range(-r, r));
    if (nx < 2 || nz < 2 || nx >= W - 2 || nz >= H - 2 || mask[nz * W + nx]) continue;
    const t = w.tiles[nz * W + nx];
    if (!walkable(t) || t === T.BLD || !biomes.includes(biomeOf(t))) continue;
    const d = Math.hypot(nx - x, nz - z);
    if (d < bd && d > 6) { bd = d; best = { x: nx, z: nz }; }
  }
  return best;
}

function geeseGrounds(sim) {
  const S = sim.S, F = S.fauna, w = S.world, R = sim.rng, mask = townMask(sim);
  if (F.grounds) return F.grounds;
  // 北の国と南の国（町の平均の位置）
  const kz = [0, 1, 2].map((k) => { const ss = w.settlements.filter((s) => s.kingdom === k); return ss.length ? ss.reduce((a, s) => a + s.z, 0) / ss.length : H / 2; });
  const north = kz.indexOf(Math.min(...kz)), south = kz.indexOf(Math.max(...kz));
  const pick = (k, biomes) => {
    const out = [];
    for (let i = 0; i < 6000 && out.length < 3; i++) {
      // 国の中だけを探す（広い世界では、その国の町のまわり 45 マス以内から選ぶ）
      const ss = w.settlements.filter((s) => s.kingdom === k), s0 = ss.length ? ss[R.int(0, ss.length - 1)] : { x: W / 2, z: H / 2 };
      const x = Math.min(W - 4, Math.max(3, Math.round(s0.x + R.range(-45, 45)))), z = Math.min(H - 4, Math.max(3, Math.round(s0.z + R.range(-45, 45))));
      if ((w.kingdomOf?.[z * W + x] ?? k) !== k || mask[z * W + x]) continue;
      const t = w.tiles[z * W + x];
      if (!walkable(t) || t === T.BLD || !biomes.includes(biomeOf(t))) continue;
      let water = false;
      for (let dz = -3; dz <= 3 && !water; dz++) for (let dx = -3; dx <= 3; dx++) { const tt = tileAt(w, x + dx, z + dz); if (tt === T.RIVER || tt === T.SWAMP) { water = true; break; } }
      if (!water && i < 4000) continue;
      out.push({ x, z });
    }
    return out;
  };
  F.grounds = { north: pick(north, ['grass', 'forest', 'snow']), south: pick(south, ['grass', 'jungle', 'desert', 'forest']), nk: north, sk: south };
  if (!F.grounds.north.length) F.grounds.north = [{ x: w.settlements[north]?.x ?? W / 2, z: w.settlements[north]?.z ?? H / 3 }];
  if (!F.grounds.south.length) F.grounds.south = [{ x: w.settlements[south]?.x ?? W / 2, z: w.settlements[south]?.z ?? H * 2 / 3 }];
  return F.grounds;
}

function geese(sim, animals, si, dos) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  const G = geeseGrounds(sim);
  const southSeason = si === 3 || si === 2 && dos >= 5;
  // 群れを作る（はじめて、または春にいなくなっていたら）
  const flocks = {};
  for (const c of animals) if (c.sp === 'goose' && c.flock) (flocks[c.flock] = flocks[c.flock] || []).push(c);
  for (const id of Object.keys(F.flocks)) if (!flocks[id]) delete F.flocks[id];
  if (Object.keys(F.flocks).length < Math.max(2, Math.round(popTarget(sim, 'goose') / 7)) && (Object.keys(F.flocks).length === 0 || si === 0 && R.chance(0.3))) {
    const id = 'f' + (F.flockSeq = (F.flockSeq || 0) + 1);
    const i = Object.keys(F.flocks).length;
    const g = (southSeason ? G.south : G.north)[i % (southSeason ? G.south : G.north).length];
    F.flocks[id] = { id, i, name: R.pick(['北の沼の群れ', '葦原の群れ', '湖の群れ', '白い頬の群れ']), south: southSeason };
    const n = R.int(5, 7);
    for (let k = 0; k < n; k++) {
      const c = makeCreature(sim, 'goose', g.x + R.int(-1, 1), g.z + R.int(-1, 1), { hx: g.x, hz: g.z, range: 5, age: R.int(20, 300) });
      if (!S.creatures[c.id]) continue;
      c.flock = id; ensureAnimal(sim, c);
    }
    if (F.hist.length) log(sim, `${southSeason ? '南' : '北'}の水辺に、新しいガンの群れがやって来た。`, [], g);
  }
  // 渡りの季節
  for (const fl of Object.values(F.flocks)) {
    if (fl.south === southSeason) continue;
    fl.south = southSeason;
    const list = G[southSeason ? 'south' : 'north'];
    const g = list[fl.i % list.length];
    const members = animals.filter((c) => c.flock === fl.id && S.creatures[c.id]);
    for (const c of members) { c.mig = { from: { ...c.home }, arrived: false, flock: fl.id }; c.home = { x: g.x + R.int(-1, 1), z: g.z + R.int(-1, 1) }; c.path = null; }
    if (!members.length) continue;
    F.stats.migrations += members.length;
    const lead = members[0];
    sim.news(southSeason ? `ガンの群れが列をなして南の${KINGDOMS[G.sk]?.name || '国'}へ渡っていく。冬が近い` : `ガンの群れが北の${KINGDOMS[G.nk]?.name || '国'}へ帰っていく。春が来た`, 1, lead.pos);
    // 通り道の町の人々が空を見上げる
    const mid = { x: (lead.pos.x + g.x) / 2, z: (lead.pos.z + g.z) / 2 };
    const near = S.world.settlements.filter((s) => Math.hypot(s.x - mid.x, s.z - mid.z) < 45);
    for (const s of near) for (const q of townsfolk(sim, s.id, 2)) sim.remember(q, southSeason ? '空をガンの群れが南へ渡っていくのを見た。もうすぐ冬だ' : 'ガンの群れが北へ帰っていくのを見た。春が来たんだ', { emo: 0.3, imp: 0.35, k: 'season' });
  }
  for (const c of animals) if (c.sp === 'goose' && c.mig?.arrived) c.mig = null;
}

// 家畜の世話：餌代・なつき・乳と卵・毛刈り・増えすぎたら売る
function livestockCare(sim, animals, si, dos) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  const byHh = {};
  for (const c of animals) {
    if (!isLive(c) || c.owner == null) continue;
    const s = sim.town(c.owner);
    const grazing = s?.ranch && c.range === 0 && si !== 3 && SPECIES[c.sp].diet !== 'meat';
    const def = SPECIES[c.sp];
    // 餌代（銅貨/日）：冬の干し草、犬猫の残り物、厩舎の馬
    const cost = grazing ? 0 : def.diet === 'meat' ? 0.12 : def.size >= 0.9 ? 0.5 : def.size >= 0.5 ? 0.25 : 0.08;
    c.fed = false;
    if (cost === 0) { c.fed = true; }
    else if (c.stateOwned || c.keeper == null) {
      // 国の厩舎・町の動物は町の蓄えから。蓄えが尽きても、馬丁が干し草を工面する
      const town = S.towns[c.owner];
      if (town && town.fund > cost + 20) { town.fund -= cost; F.stats.feedCost += cost; }
      c.fed = true;
    } else {
      const hh = S.households[c.keeper];
      if (hh) {
        if (def.diet === 'meat' && (hh.food || 0) > hh.members.length * 1.5) { hh.food -= 0.12; c.fed = true; }
        else if (hh.money > cost + 8) { hh.money -= cost; c.fed = true; F.stats.feedCost += cost; }
      }
    }
    // なつき
    c.bond = Math.max(0, Math.min(100, (c.bond ?? 50) + (c.fed ? 0.6 : -2) + (c.hunger > 60 ? 0.3 : -0.5)));
    if (!c.fed && c.keeper != null && R.chance(0.15)) {
      const q = hhMembers(sim, S.households[c.keeper]).find((x) => sim.ageOf(x) >= 14);
      if (q) sim.remember(q, `家計が苦しく、${c.given || def.name}に十分な餌をやれなかった`, { emo: -0.4, imp: 0.35, k: 'pet' });
    }
    if (c.keeper != null) (byHh[c.keeper] = byHh[c.keeper] || []).push(c);
  }
  // 恵み：乳・卵は飼い主の家の食卓へ（控えめ）
  for (const [hid, list] of Object.entries(byHh)) {
    const hh = S.households[hid];
    if (!hh) continue;
    let food = 0;
    for (const c of list) {
      if (c.juv || c.hunger < 35) continue;
      if (c.role === 'dairy' && c.sex !== 'm') food += 0.35;
      if (c.role === 'layer' && si !== 3) food += 0.2;
    }
    if (food > 0) { hh.food = (hh.food || 0) + food; F.stats.products += food; }
  }
  // 春の毛刈り：羊毛を市場へ
  if (si === 0 && dos === 3) {
    for (const c of animals) {
      if (c.sp !== 'sheep' || c.juv || c.keeper == null) continue;
      const hh = S.households[c.keeper];
      const m = S.towns[c.owner];
      if (!hh || !m) continue;
      m.stock.wool = (m.stock.wool || 0) + 1.5;
      const mc = sim.mcash(c.owner); const earn = Math.max(0, Math.min(1.5 * (m.price.wool || 4) * 0.85, mc.cash));   // 羊毛の代金は市場の金庫から
      mc.cash -= earn; hh.money += earn; F.stats.products += 1.5;
      const q = hhMembers(sim, hh).find((x) => sim.ageOf(x) >= 14);
      if (q) sim.remember(q, `春の毛刈りで${c.given || '羊'}の毛を刈った。よい羊毛がとれた`, { emo: 0.5, imp: 0.35, k: 'farm' });
    }
  }
  // 牧場の家畜が減りすぎたら、牧場主が隣の村から買い足す（週に一度）
  if (sim.dayIndex % 7 === 3) restock(sim, animals);
  // 牧場の家畜が増えすぎたら、年をとった食肉用を売る
  for (const s of S.world.settlements) {
    if (!s.ranch) continue;
    const herd = animals.filter((c) => c.owner === s.id && c.range === 0 && S.creatures[c.id] && !c.juv).sort((a, b) => b.age - a.age);
    if (herd.length <= 12) continue;
    const c = herd.find((x) => ['meat', 'layer'].includes(x.role)) || herd[0];
    const hh = S.households[c.keeper];
    const m = S.towns[s.id];
    const meat = Math.max(1, Math.round(SPECIES[c.sp].size * 3));
    m.stock.meat = (m.stock.meat || 0) + meat;
    if (hh) hh.money += meat * (m.price.meat || 6) * 0.85;
    const q = hhMembers(sim, hh).find((x) => sim.ageOf(x) >= 14);
    if (q) sim.remember(q, `${c.given || SPECIES[c.sp].name}を肉屋に売った。${R.pick(['少し寂しい', '世話になった', '仕方のないことだ'])}`, { emo: -0.2, imp: 0.35, k: 'farm' });
    c._faDone = true; // 飼い主の悲しみは上で記録した
    killCreature(sim, c, null);
  }
}

function restock(sim, animals) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  for (const s of S.world.settlements) {
    if (!s.ranch) continue;
    const herd = animals.filter((c) => c.owner === s.id && c.range === 0 && S.creatures[c.id] && c.sp !== 'dog');
    if (herd.length >= 5) continue;
    const want = s.kingdom === 2 ? ['goat', 'goat', 'chicken', 'chicken', 'sheep', 'cow'] : ['cow', 'sheep', 'sheep', 'pig', 'chicken', 'chicken', 'duck'];
    const have = new Set(herd.map((c) => c.sp));
    const hhs = Object.values(S.households).filter((h) => h.s === s.id && h.members.some((id) => ['rancher', 'shepherd'].includes(S.people[id]?.job)));
    const hh = hhs.sort((a, b) => b.money - a.money)[0];
    if (!hh) continue;
    const bought = [];
    for (let i = 0; i < 2 && herd.length + bought.length < 5; i++) {
      const sp = want.find((x) => !have.has(x)) || R.pick(want);
      const price = SPECIES[sp].size >= 0.9 ? 30 : SPECIES[sp].size >= 0.5 ? 16 : 6;
      if (hh.money < price + 40) break;
      const x = R.int(s.ranch.x0, s.ranch.x1), z = R.int(s.ranch.z0, s.ranch.z1);
      const c = makeCreature(sim, sp, x, z, { owner: s.id, range: 0, age: R.int(20, 120) });
      if (!S.creatures[c.id]) continue;
      hh.money -= price;
      c.keeper = hh.id; c.sex = R.chance(0.7) ? 'f' : 'm'; ensureAnimal(sim, c);
      have.add(sp); bought.push(c);
    }
    if (!bought.length) continue;
    F.stats.restock = (F.stats.restock || 0) + bought.length;
    const head = hhMembers(sim, hh).find((q) => sim.ageOf(q) >= 16);
    const names = bought.map((c) => c.name).join('と');
    if (head) {
      sim.remember(head, `牧場の家畜が減ってしまったので、隣の村から${names}を買ってきた`, { emo: 0.2, imp: 0.45, k: 'farm' });
      log(sim, `${s.name}の${sim.fullName(head)}が、減った家畜を補うため、隣の村から${names}を買ってきた。`, [head.id], { x: s.ranch.x0, z: s.ranch.z0 });
    }
  }
}

// 犬の主人（家族の子どもか狩人）、騎士の愛馬
function bindMasters(sim, animals) {
  const S = sim.S, R = sim.rng;
  for (const c of animals) {
    if (c.sp === 'dog' && c.master == null && !c.mourn && c.keeper != null) {
      // 番犬が家の戸口にいるなら、その家の犬にする
      if (!c._houseChecked) {
        c._houseChecked = true;
        const b = S.world.buildings.find((x) => x.hh != null && (x.type === 'house' || x.type === 'mansion') && x.door && Math.abs(x.door.x - c.home.x) < 0.6 && Math.abs(x.door.z - c.home.z) < 0.6);
        if (b && S.households[b.hh]) c.keeper = b.hh;
      }
      const fam = hhMembers(sim, S.households[c.keeper]);
      const m = fam.find((q) => q.job === 'hunter') || fam.find((q) => sim.ageOf(q) >= 6 && sim.ageOf(q) < 16) || fam.find((q) => sim.ageOf(q) >= 16);
      if (m) { c.master = m.id; if (!c._boundMem) { c._boundMem = true; sim.remember(m, `うちの犬${c.given || ''}は、わたしの後ばかりついてくる`, { emo: 0.6, imp: 0.4, k: 'pet' }); } }
    }
    if (c.sp === 'horse' && c.master == null && c.owner != null && !c.juv) {
      const knights = sim.living().filter((q) => q.s === c.owner && ['knight', 'paladin', 'royalguard', 'general'].includes(q.job) && !Object.values(S.creatures).some((h) => h.sp === 'horse' && h.master === q.id));
      if (!knights.length) continue;
      const k = R.pick(knights);
      c.master = k.id;
      c.bond = Math.max(c.bond || 50, 60);
      sim.remember(k, `厩舎の${c.given || '馬'}を愛馬として任された。${R.pick(['いい目をした馬だ', 'この馬となら、どこまでも駆けられる', '気位の高いやつだが、きっと心を通わせてみせる'])}`, { emo: 0.7, imp: 0.6, k: 'pet' });
    }
    if (c.master != null && c.sp === 'horse') {
      const k = S.people[c.master];
      if (k && k.deathYear == null && R.chance(0.1)) { c.bond = Math.min(100, (c.bond || 50) + 3); if (c.bond >= 90 && !c._bondMem) { c._bondMem = true; sim.remember(k, `愛馬${c.given || ''}とは、もう言葉がなくても通じ合える`, { emo: 0.8, imp: 0.6, k: 'pet' }); } }
    }
  }
}

// あだ名：群れの長・長寿・人を恐れさせた個体
function nicknames(sim, animals) {
  const S = sim.S, R = sim.rng, F = S.fauna;
  if (Object.keys(F.nicks).length >= 16 || !R.chance(0.6)) return;
  const cands = animals.filter((c) => {
    if (c.nick || c.juv || SPECIES[c.sp].kind !== 'wild' || !NICK[c.sp] || c.hp <= 0) return false;
    const life = lifeDays(c.sp);
    return c.rank === 1 && c._gsize >= 3 && c.age > matureOf(c.sp) * 2 || c.age > life * 0.6 && SPECIES[c.sp].size >= 0.5 || (c.kills || 0) >= 3 || c.trapWise && c.age > life * 0.4;
  });
  if (!cands.length) return;
  const c = R.pick(cands);
  let pool = NICK[c.sp];
  if (!Array.isArray(pool)) pool = pool[c.sex] || pool.m;
  const free = pool.filter((n) => !F.nicks[n]);
  if (!free.length) return;
  const nick = R.pick(free);
  F.nicks[nick] = c.id;
  c.nick = nick; c.given = nick; c.title = nick; c.name = nick;
  F.stats.nick++;
  const t = nearestTown(sim, c.pos.x, c.pos.z);
  const why = c.rank === 1 && c._gsize >= 3 ? `${SPECIES[c.sp].name}の群れを率いる一頭` : (c.kills || 0) >= 3 ? `何頭もの獲物を仕留めてきた${SPECIES[c.sp].name}` : c.trapWise ? `どんな罠にもかからない${SPECIES[c.sp].name}` : `長く生きた大きな${SPECIES[c.sp].name}`;
  if (t && t.d < 50) {
    sim.news(`${t.s.name}の人々は、${sim.placeName(c.pos.x, c.pos.z).replace(t.s.name + 'の', '町の')}に棲む${why}を「${nick}」と呼ぶようになった`, 1, c.pos);
    for (const q of townsfolk(sim, t.s.id, 3, (q) => ['hunter', 'woodcutter', 'shepherd', 'gatherer', 'rancher', 'farmer', 'storyteller'].includes(q.job))) sim.remember(q, `${sim.placeName(c.pos.x, c.pos.z)}には「${nick}」と呼ばれる${SPECIES[c.sp].name}がいる`, { emo: 0.1, imp: 0.5, k: 'sight', where: posR(c) });
  }
}

// 増えすぎ：種ごとの上限の1.6倍を超えたら、弱いものから静かに減る（病・縄張り争い）
function overpop(sim, animals) {
  const S = sim.S;
  const bySp = {};
  for (const c of animals) if (S.creatures[c.id] && SPECIES[c.sp].kind === 'wild') (bySp[c.sp] = bySp[c.sp] || []).push(c);
  for (const [sp, list] of Object.entries(bySp)) {
    const cap = Math.round((popTarget(sim, sp) || POP[sp] || 8) * 1.6);
    if (list.length <= cap) continue;
    list.sort((a, b) => a.hunger - b.hunger || b.age - a.age);
    for (const c of list.slice(0, list.length - cap)) { if (c.nick) continue; S.fauna.stats.culled++; kill(sim, c, null, 'sick'); }
  }
}

// ---------- 詳細欄（ui.js の creatureHtml に足す） ----------
export function faunaHtml(sim, c) {
  if (!isAnimal(c)) return '';
  if (!c.fa) ensureAnimal(sim, c);
  const S = sim.S, def = SPECIES[c.sp];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const link = (o) => (o ? `<span class="link" data-cid="${o.id}">${esc(o.name)}</span>` : '');
  const plink = (p) => (p ? `<span class="link" data-pid="${p.id}">${esc(p.given)}</span>` : '');
  const rows = [];
  const life = lifeDays(c.sp);
  const years = (c.age / DAYS_PER_YEAR).toFixed(1);
  rows.push(['性別', c.sex === 'f' ? '雌' : '雄']);
  rows.push(['年ごろ', c.juv ? `子ども（${years}歳）` : c.age > life * 0.75 ? `老いている（${years}歳）` : `${years}歳`]);
  if (c.nick) rows.push(['あだ名', `「${esc(c.nick)}」と人々に呼ばれている`]);
  const mate = cr(S, c.mate);
  rows.push(['つがい', mate ? link(mate) : c.widowed ? 'つがいを亡くした' : 'いない']);
  const par = (c.parents || []).map((id) => S.creatures[id]).filter(Boolean);
  if (c.parents?.length) rows.push(['親', par.length ? par.map(link).join('、') : 'もういない']);
  const kids = (c.young || []).map((id) => S.creatures[id]).filter(Boolean);
  if (kids.length) rows.push(['子', kids.map(link).join('、') + (juvKids(S, c).length ? '（子育て中）' : '')]);
  rows.push(['住処', `${esc(c.den || DEN[c.sp] || 'ねぐら')}（${esc(sim.placeName(c.home.x, c.home.z))}）`]);
  if (c.rank && c._gsize > 1) rows.push(['群れの序列', c.rank === 1 ? `長（${c._gsize}頭の群れ）` : `${c._gsize}頭中${c.rank}番目${c.rank === c._gsize ? '（末席）' : ''}`]);
  if (c.outcast) rows.push(['群れ', 'はぐれ者']);
  const hunger = c.hunger < 10 ? '飢えている' : c.hunger < 25 ? '痩せて腹をすかせている' : c.hunger < 55 ? '少し腹がへっている' : '満ち足りている';
  rows.push(['腹ぐあい', hunger]);
  const state = c.hibernate ? '冬眠している' : c.mourn ? '主人の墓のそばを離れない' : c.mig && !c.mig.arrived ? (c.sp === 'goose' ? '渡りの途中' : '季節の移動中') : c.forage ? `飢えて${esc(sim.town(c.forage.sid)?.name || '人里')}の近くに降りてきている` : c.sleeping ? '眠っている' : c.juv ? '親について歩いている' : '';
  if (state) rows.push(['いま', state]);
  if (isLive(c)) {
    const hh = S.households[c.keeper];
    const head = hhMembers(sim, hh)[0];
    rows.push(['飼い主', head ? `${plink(head)}の家（${esc(hh.name || '')}）` : c.stateOwned ? '国の厩舎' : 'いない']);
    rows.push(['なつき', (c.bond ?? 50) >= 80 ? 'とてもなついている' : (c.bond ?? 50) >= 50 ? 'なついている' : (c.bond ?? 50) >= 25 ? '少しよそよそしい' : '心を閉ざしている']);
    rows.push(['餌', c.fed ? '今日はもらった' : 'もらえていない']);
  }
  if (c.master != null) { const m = S.people[c.master]; if (m) rows.push([c.sp === 'horse' ? '乗り手' : '主人', plink(m)]); }
  if (c.mourn) { const m = S.people[c.mourn.who]; if (m) rows.push(['亡き主人', plink(m)]); }
  const wary = Object.keys(c.wary || {}).map((id) => S.people[id]).filter(Boolean);
  if (wary.length) rows.push(['警戒している人', wary.slice(0, 4).map(plink).join('、')]);
  if (c.trapWise) rows.push(['学び', '罠を見抜く']);
  const likes = Object.entries(c.likes || {}).filter(([, v]) => v >= 2).map(([id]) => S.people[id]).filter(Boolean);
  if (likes.length) rows.push(['寄っていく人', likes.slice(0, 4).map(plink).join('、')]);
  return `<div class="section"><h4>暮らし</h4><dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
}

// =====================================================================
// 食物連鎖：餌場の豊かさ → 草食 → 小さな肉食 → 大きな肉食 → 魔物 → 人
// =====================================================================
// lv：栄養段階（0 植物・魚、1 草食、2 小さな肉食、3 大きな肉食、4 魔物、5 人）
// base：食べる植物・小さな生き物（plant 草、nuts 木の実・果物、fish 魚、insect 虫・ネズミ、carrion 死肉）
// prey：狩る生き物。need：1日に要る餌の量（食べ物の単位。草食は餌場から減らす量）
export const FOOD_WEB = {
  // 草食・雑食（lv1）
  rabbit: { lv: 1, base: ['plant'], need: 0.5 }, squirrel: { lv: 1, base: ['nuts', 'plant'], need: 0.3 }, deer: { lv: 1, base: ['plant'], need: 3 },
  reindeer: { lv: 1, base: ['plant'], need: 3 }, boar: { lv: 1, base: ['nuts', 'plant'], need: 2.5 }, camel: { lv: 1, base: ['plant'], need: 3 },
  monkey: { lv: 1, base: ['nuts', 'plant', 'insect'], need: 1 }, parrot: { lv: 1, base: ['nuts'], need: 0.2 }, goose: { lv: 1, base: ['plant', 'fish'], need: 0.6 },
  turtle: { lv: 1, base: ['plant', 'fish'], need: 0.3 }, rat: { lv: 1, base: ['plant', 'insect'], need: 0.1 }, crow: { lv: 1, base: ['insect', 'nuts', 'carrion'], need: 0.3 },
  frog: { lv: 1, base: ['insect'], need: 0.1 }, bat: { lv: 1, base: ['insect'], need: 0.1 },
  cow: { lv: 1, base: ['plant'], need: 4 }, sheep: { lv: 1, base: ['plant'], need: 2 }, goat: { lv: 1, base: ['plant'], need: 1.5 }, pig: { lv: 1, base: ['plant', 'nuts'], need: 2 },
  horse: { lv: 1, base: ['plant'], need: 4 }, donkey: { lv: 1, base: ['plant'], need: 3 }, chicken: { lv: 1, base: ['plant', 'insect'], need: 0.2 }, duck: { lv: 1, base: ['plant', 'fish'], need: 0.2 },
  // 小さな肉食（lv2）
  fox: { lv: 2, base: ['insect', 'nuts'], prey: ['rabbit', 'squirrel', 'rat', 'frog', 'chicken', 'duck'], need: 1.5 },
  owl: { lv: 2, base: ['insect'], prey: ['rat', 'rabbit', 'squirrel', 'frog', 'bat'], need: 0.6 },
  snake: { lv: 2, base: ['insect'], prey: ['rat', 'frog', 'rabbit', 'squirrel'], need: 0.5 },
  scorpion: { lv: 2, base: ['insect'], prey: ['rat'], need: 0.2 },
  eagle: { lv: 2, base: ['fish'], prey: ['rabbit', 'squirrel', 'rat', 'monkey', 'goose', 'chicken', 'duck'], need: 1 },
  seagull: { lv: 2, base: ['fish', 'carrion'], need: 0.4 }, penguin: { lv: 2, base: ['fish'], need: 0.5 }, dolphin: { lv: 2, base: ['fish'], need: 3 },
  cat: { lv: 2, base: ['carrion'], prey: ['rat', 'frog'], need: 0.3 }, dog: { lv: 2, base: ['carrion'], prey: [], need: 1 },
  // 大きな肉食（lv3）
  wolf: { lv: 3, base: ['carrion'], prey: ['deer', 'reindeer', 'boar', 'rabbit', 'goat', 'sheep', 'camel'], need: 5, pack: true },
  bear: { lv: 3, base: ['nuts', 'fish', 'plant'], prey: ['deer', 'boar', 'rabbit', 'squirrel'], need: 7 },
  polarbear: { lv: 3, base: ['fish'], prey: ['penguin', 'reindeer'], need: 8 },
  tiger: { lv: 3, base: ['carrion'], prey: ['deer', 'boar', 'monkey', 'camel', 'goat'], need: 7 },
  croc: { lv: 3, base: ['fish'], prey: ['deer', 'boar', 'frog', 'turtle', 'monkey', 'goose', 'camel'], need: 4 },
  whale: { lv: 3, base: ['fish'], need: 8 },
  // 魔物（lv4）：monsters.js が preyFor / foodValue / canHunt を使う
  goblin: { lv: 4, base: ['nuts'], prey: ['rabbit', 'squirrel', 'frog', 'rat', 'deer', 'boar', 'chicken', 'goat', 'sheep'], need: 2 },
  hobgoblin: { lv: 4, prey: ['deer', 'boar', 'rabbit', 'goat', 'sheep', 'pig'], need: 4 },
  goblinlord: { lv: 4, prey: ['deer', 'boar', 'cow', 'sheep', 'pig'], need: 6 },
  orc: { lv: 4, prey: ['deer', 'boar', 'bear', 'cow', 'pig', 'sheep', 'horse'], need: 6 },
  orcking: { lv: 4, prey: ['deer', 'boar', 'bear', 'cow', 'horse'], need: 10 },
  spider: { lv: 4, base: ['insect'], prey: ['rabbit', 'squirrel', 'rat', 'frog', 'bat', 'monkey'], need: 2 },
  arachne: { lv: 4, prey: ['deer', 'boar', 'monkey', 'goat'], need: 5 },
  wyvern: { lv: 4, prey: ['deer', 'reindeer', 'camel', 'boar', 'goat', 'sheep', 'eagle'], need: 10 },
  dragon: { lv: 4, prey: ['deer', 'boar', 'bear', 'reindeer', 'camel', 'cow', 'horse', 'tiger', 'polarbear'], need: 30 },
  slime: { lv: 1, base: ['plant'], need: 0.4 }, bigslime: { lv: 1, base: ['plant'], need: 1 }, kingslime: { lv: 4, base: ['plant'], prey: ['rabbit', 'frog', 'rat'], need: 3 },
  unicorn: { lv: 1, base: ['plant'], need: 3 },
  // 人（lv5）：狩人・冒険者・漁師
  human: { lv: 5, base: ['fish'], prey: ['deer', 'boar', 'rabbit', 'reindeer', 'camel', 'bear', 'wolf', 'fox', 'squirrel', 'goose', 'croc', 'tiger'], need: 2 },
};
// 広さあたりの密度（生息地1000マスあたりの頭数）。大陸が広がれば、目安も広さに合わせて増える
const DENSITY = {
  rat: 1.3, crow: 1.0, owl: 4.6, frog: 31, snake: 1.75, turtle: 15, bat: 4.9, deer: 3.4, boar: 6.2, wolf: 5.4, bear: 3.9, fox: 2.0, rabbit: 4.0, squirrel: 6.2,
  camel: 13.9, scorpion: 18.5, croc: 19.3, monkey: 52, tiger: 26, parrot: 39, reindeer: 14.2, polarbear: 5.3, penguin: 55, seagull: 43, eagle: 3.2, dolphin: 5.1, whale: 0.28,
};
const BASE_RATE = { plant: 3, nuts: 2.4, fish: 2.8, insect: 2.2, carrion: 1.0 };

// 誰が誰を食べるか
export function preyFor(sp) { return FOOD_WEB[sp]?.prey || []; }
// 食べられたときの餌の量（体の大きさの2乗に比例）
export function foodValue(sp) { const s = SPECIES[sp]?.size || 0.5; return Math.round(s * s * 30 * 10) / 10; }
export function needOf(sp) { return FOOD_WEB[sp]?.need ?? Math.max(0.3, (SPECIES[sp]?.size || 0.5) * 4); }
export function trophicLevel(sp) { return FOOD_WEB[sp]?.lv ?? (SPECIES[sp]?.monster ? 4 : 1); }
// 狩ってよいか：表にあり、数が減りすぎていない（安全弁）。desperate なら安全弁を無視する
export function canHunt(sim, predSp, preySp, desperate = false) {
  if (!preyFor(predSp).includes(preySp)) return false;
  if (!desperate && isRare(sim, preySp)) return false;
  // 人は獲物を狩り尽くさない：目安の7割を下回った種は狩らない（猟師の掟）
  if (predSp === 'human') { const t = popTarget(sim, preySp); if (t && speciesCount(sim, preySp) < t * 0.7) return false; }
  return true;
}

// ---------- 生息地の広さと数の目安 ----------
function habitatCounts(sim) {
  const w = sim.S.world;
  if (sim._faHab && sim._faHabW === w) return sim._faHab;
  const cnt = {};
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = w.tiles[z * W + x];
    const b = biomeOf(t);
    cnt[b] = (cnt[b] || 0) + 1;
    if (b === 'snow') {
      const near = [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => { const tt = tileAt(w, x + dx, z + dz); return tt === T.SEA || tt === T.DEEP; });
      if (near) cnt.snowcoast = (cnt.snowcoast || 0) + 1;
    }
  }
  sim._faHab = cnt; sim._faHabW = w;
  return cnt;
}
export function habitatArea(sim, sp) {
  const cnt = habitatCounts(sim);
  return (SPECIES[sp]?.biome || []).reduce((s, b) => s + (cnt[b] || 0), 0);
}
// 数の目安：生息地の広さ × 密度（ガンは大陸の広さに比例）
// 広い世界（W>CORE）では、ひとつの種が大陸じゅうにあふれて重くならないよう、
// 「もとの 160 の大陸の目安 × 広さの倍率 × WIDE_CAP」を上限にする（密度の考え方はそのまま）
const WIDE = W > CORE, AREA_X = (W * H) / (CORE * CORE), WIDE_CAP = 0.8;
export function popTarget(sim, sp) {
  if (sp === 'goose') return Math.max(10, Math.round(14 * (WIDE ? AREA_X * WIDE_CAP : W * H / 25600)));
  const d = DENSITY[sp];
  if (d == null) return POP[sp] ?? null;
  const t = Math.max(2, Math.round(habitatArea(sim, sp) * d / 1000));
  return WIDE && POP[sp] ? Math.min(t, Math.max(2, Math.round(POP[sp] * AREA_X * WIDE_CAP))) : t;
}
export function isRare(sim, sp) {
  const t = popTarget(sim, sp);
  if (!t) return false;
  return speciesCount(sim, sp) <= Math.max(2, t * 0.45);
}

// ---------- 餌場（16マス四方の区画ごとの草・木の実・魚） ----------
const CELL = 16;
const PLANT_W = { grass: 1, forest: 0.8, dense: 0.7, jungle: 1.1, desert: 0.15, snow: 0.25, mountain: 0.3, beach: 0.3, waste: 0.05, river: 0.4, town: 0.2 };
const NUTS_W = { forest: 0.45, dense: 0.6, jungle: 0.7, grass: 0.05 };
const FISH_W = { river: 1.2, sea: 0.6, deepsea: 0.4, beach: 0.2 };
function patchCaps(sim) {
  const w = sim.S.world;
  if (sim._faCap && sim._faCapW === w) return sim._faCap;
  const nx = Math.ceil(W / CELL), nz = Math.ceil(H / CELL), n = nx * nz;
  const plant = new Float32Array(n), nuts = new Float32Array(n), fish = new Float32Array(n);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const t = w.tiles[z * W + x];
    const b = t === T.SWAMP ? 'river' : t === T.PASTURE ? 'grass' : t === T.FIELD ? 'town' : biomeOf(t);
    const i = Math.floor(z / CELL) * nx + Math.floor(x / CELL);
    plant[i] += PLANT_W[b] || 0; nuts[i] += NUTS_W[b] || 0; fish[i] += FISH_W[b] || 0;
  }
  sim._faCap = { nx, nz, n, plant, nuts, fish }; sim._faCapW = w;
  return sim._faCap;
}
function patchState(sim) {
  const F = F_(sim), cap = patchCaps(sim);
  if (!F.patch || F.patch.n !== cap.n) {
    F.patch = { n: cap.n, plant: Array.from(cap.plant, (v) => Math.round(v * 0.8)), nuts: Array.from(cap.nuts, (v) => Math.round(v * 0.5)), fish: Array.from(cap.fish, (v) => Math.round(v * 0.8)) };
  }
  return F.patch;
}
function cellOf(sim, x, z) {
  const cap = patchCaps(sim);
  const cx = Math.max(0, Math.min(cap.nx - 1, Math.floor(x / CELL))), cz = Math.max(0, Math.min(cap.nz - 1, Math.floor(z / CELL)));
  return cz * cap.nx + cx;
}
// その場所の餌の豊かさ（0〜1.2、1がふつう）
export function foodAt(sim, x, z) {
  const P = patchState(sim), cap = patchCaps(sim), i = cellOf(sim, x, z);
  const a = (k) => (cap[k][i] < 1 ? 0 : Math.max(0, Math.min(1.2, P[k][i] / (cap[k][i] * 0.5))));
  const si = sim.seasonIdx();
  return { cell: i, plant: a('plant'), nuts: a('nuts'), fish: a('fish'), insect: a('plant') * [0.8, 1.1, 0.8, 0.3][si], carrion: [0.8, 0.9, 1, 1.2][si] };
}
// 餌場から食べる（魔物がスライムに草を食べさせるときなどにも使える）
export function eatFrom(sim, x, z, kind, units) {
  if (kind !== 'plant' && kind !== 'nuts' && kind !== 'fish') return 0;
  const P = patchState(sim), i = cellOf(sim, x, z);
  const take = Math.min(P[kind][i], units);
  P[kind][i] -= take;
  return take;
}
// 1日ごとの回復（季節・日照りで変わる。ロジスティック成長）
function regrowPatches(sim, si, drought) {
  const P = patchState(sim), cap = patchCaps(sim), S = sim.S;
  const rP = [0.45, 0.35, 0.2, 0.04][si], rN = [0.05, 0.1, 0.5, 0][si], rF = [0.3, 0.3, 0.25, 0.15][si];
  let dr = null;
  if (drought.size) { dr = new Set(); for (const sid of drought) { const s = sim.town(sid); if (s) for (let dz = -30; dz <= 30; dz += CELL) for (let dx = -30; dx <= 30; dx += CELL) dr.add(cellOf(sim, s.x + dx, s.z + dz)); } }
  for (let i = 0; i < cap.n; i++) {
    const g = (k, r, floor) => {
      const c = cap[k][i];
      if (c < 1) { P[k][i] = 0; return; }
      const x = P[k][i];
      P[k][i] = Math.round(Math.min(c, Math.max(0, x + r * x * (1 - x / c) + c * floor)) * 10) / 10;
    };
    g('plant', rP * (dr?.has(i) ? 0.3 : 1), si === 3 ? 0.005 : 0.02);
    if (si === 3) P.nuts[i] = Math.round(P.nuts[i] * 0.93 * 10) / 10; else g('nuts', rN, si === 2 ? 0.08 : 0.005);
    g('fish', rF, 0.01);
  }
}

// 草食・雑食・小さな生き物を食べる者の1時間の食事（餌場を減らす）
function forageGain(sim, c, def, si, drought) {
  const web = FOOD_WEB[c.sp];
  const base = web?.base || (def.diet === 'meat' ? ['carrion'] : ['plant']);
  const fa = foodAt(sim, c.pos.x, c.pos.z);
  const bioF = foodFactor(sim, c, def, si, drought);
  const snow = si === 3 ? 0.75 : 1; // 雪の下の草は掘らないと食べられない
  let best = 0, kind = null;
  for (const k of base) {
    let v = BASE_RATE[k] * (fa[k] ?? 0);
    if (k === 'plant') v *= snow * bioF;
    if (k === 'insect' || k === 'carrion') v *= bioF;
    if (v > best) { best = v; kind = k; }
  }
  // 餌場を減らす
  if (kind && (kind === 'plant' || kind === 'nuts' || kind === 'fish')) eatFrom(sim, c.pos.x, c.pos.z, kind, needOf(c.sp) / 16 * Math.min(1, fa[kind]));
  return best;
}

// 安全弁：数が目安の35%を下回った種は、人の住まない未開拓地（町から最も遠い生息地）から移り住んでくる
function frontierImmigration(sim, animals) {
  const S = sim.S, R = sim.rng, F = S.fauna, w = S.world, mask = townMask(sim);
  const count = {};
  for (const c of animals) if (S.creatures[c.id]) count[c.sp] = (count[c.sp] || 0) + 1;
  let moved = 0;
  for (const sp of Object.keys(DENSITY)) {
    if (moved >= 3) break;
    const def = SPECIES[sp];
    if (!def || sp === 'rat' || !def.biome) continue;
    const t = popTarget(sim, sp), n = count[sp] || 0;
    if (n >= Math.max(2, t * 0.35) || !R.chance(n === 0 ? 0.8 : 0.4)) continue;
    // 町から最も遠い生息地のマス
    let best = null, bd = -1;
    for (let i = 0; i < 500; i++) {
      const x = R.int(2, W - 3), z = R.int(2, H - 3);
      const tt = w.tiles[z * W + x];
      let b = biomeOf(tt);
      if (b === 'snow' && def.biome.includes('snowcoast') && !def.biome.includes('snow')) b = [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => { const q = tileAt(w, x + dx, z + dz); return q === T.SEA || q === T.DEEP; }) ? 'snowcoast' : 'snow';
      if (!def.biome.includes(b)) continue;
      if (def.swims ? !(tt === T.SEA || tt === T.DEEP) : !def.flies && (!walkable(tt) || tt === T.BLD)) continue;
      if (mask[z * W + x]) continue;
      let dmin = 1e9;
      for (const s of w.settlements) dmin = Math.min(dmin, Math.hypot(s.x - x, s.z - z));
      if (dmin > bd) { bd = dmin; best = { x, z }; }
    }
    if (!best) continue;
    const k = def.pack || SOCIAL.has(sp) ? 3 : 2;
    const made = [];
    for (let i = 0; i < k; i++) {
      const c = makeCreature(sim, sp, best.x + (i ? R.int(-1, 1) : 0), best.z + (i ? R.int(-1, 1) : 0), { range: def.swims ? 20 : 12, age: R.int(matureOf(sp), matureOf(sp) * 4) });
      if (!S.creatures[c.id]) continue;
      ensureAnimal(sim, c);
      c.sex = i % 2 ? 'm' : 'f';
      c.hunger = 80;
      made.push(c);
    }
    if (made.length >= 2) { made[0].mate = made[1].id; made[1].mate = made[0].id; }
    if (!made.length) continue;
    moved++;
    F.stats.immigrants = (F.stats.immigrants || 0) + made.length;
    F.stats.immigBy = F.stats.immigBy || {};
    F.stats.immigBy[sp] = (F.stats.immigBy[sp] || 0) + made.length;
    log(sim, `人の住まない${sim.placeName(best.x, best.z)}の奥から、${def.name}が${made.length}頭移り住んできた。`, [], best);
  }
}
