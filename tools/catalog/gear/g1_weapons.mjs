// 武器（gear.js）
import { add, r, CR, LOOT, TR, uWear, uMelt } from './g0_common.mjs';

const F = 'gear';
// 金属の材質（鉄＝1）
export const WM = {
  bronze: { n: '青銅', m: 0.8, vm: 0.8, wm: 1.05, d: 0.8, rare: 0, dem: 1, ing: 'bronze', t: 0.9 },
  iron: { n: '鉄', m: 1, vm: 1, wm: 1, d: 1, rare: 0, dem: 2, ing: 'iron', t: 1 },
  steel: { n: '鋼', m: 1.25, vm: 1.8, wm: 1, d: 1.3, rare: 1, dem: 1, ing: 'steel', t: 1.4 },
  silver: { n: '銀', m: 0.95, vm: 4, wm: 1.1, d: 0.8, rare: 1, dem: 1, ing: 'silver', t: 1.3, note: '不死の魔物（骸骨・ミイラ・リッチ）に倍の傷を与える' },
  mithril: { n: 'ミスリル', m: 1.5, vm: 12, wm: 0.5, d: 1.8, rare: 2, dem: 1, ing: 'mithril', t: 2, note: '羽のように軽く、錆びない' },
  starmetal: { n: '星鉄', m: 1.6, vm: 16, wm: 1.1, d: 2, rare: 3, dem: 1, ing: 'starmetal', t: 2.5, note: '空から落ちた鉄。魔法の守りを断ち切る' },
  adamantite: { n: 'アダマンタイト', m: 1.75, vm: 24, wm: 1.3, d: 3, rare: 3, dem: 1, ing: 'adamantite', t: 3, note: '欠けず曲がらず、ほとんど傷まない' },
  dragonbone: { n: '竜骨', m: 1.85, vm: 28, wm: 0.8, d: 2.4, rare: 3, dem: 1, ing: 'dragonbone', t: 3, note: '竜の骨を削り出した刃。竜の気配をまとう' },
};
// 形（鉄のときの強さ・材料・重さ・値打ち）
const SH = [
  { k: 'dagger', n: '短剣', atk: 4, i: 1, w: 0.4, v: 15, sub: 'sword', lt: 0, desc: '腰に差す護身の刃。' },
  { k: 'stiletto', n: '鎧通し', atk: 5, i: 1, w: 0.3, v: 20, sub: 'sword', desc: '鎖の目や鎧の継ぎ目を突く細い刃。' },
  { k: 'shortsword', n: '小剣', atk: 6, i: 1, w: 0.9, v: 25, sub: 'sword', desc: '狭い場所で振りやすい短めの剣。' },
  { k: 'sword', n: '剣', atk: 8, i: 2, w: 1.2, v: 40, sub: 'sword', desc: '片手で扱う、もっともありふれた剣。' },
  { k: 'longsword', n: '長剣', atk: 11, i: 3, w: 1.5, v: 75, sub: 'sword', desc: '騎士が好む長い刃の剣。' },
  { k: 'bastardsword', n: '片手半剣', atk: 13, i: 3, w: 1.9, v: 95, sub: 'sword', desc: '片手でも両手でも振れる長い剣。' },
  { k: 'greatsword', n: '大剣', atk: 15, i: 5, w: 3, v: 130, sub: 'sword', two: 1, desc: '両手で振り回す背丈ほどの剣。' },
  { k: 'scimitar', n: '曲刀', atk: 9, i: 2, w: 1.3, v: 48, sub: 'sword', desc: '砂の国で好まれる反りのある刀。' },
  { k: 'falchion', n: '幅広の曲刀', atk: 10, i: 2, w: 1.6, v: 50, sub: 'sword', desc: '鉈のように重い刃の片刃刀。' },
  { k: 'sabre', n: '騎兵刀', atk: 9, i: 2, w: 1.2, v: 50, sub: 'sword', desc: '馬上から斬り下ろす軽い刀。' },
  { k: 'rapier', n: '細剣', atk: 8, i: 2, w: 1.1, v: 60, sub: 'sword', fast: 1, desc: '突きに優れた貴族の剣。素早く二度突ける。' },
  { k: 'estoc', n: '刺突剣', atk: 11, i: 3, w: 1.6, v: 80, sub: 'sword', desc: '板金鎧の隙間を突く硬い剣。' },
  { k: 'tachi', n: '太刀', atk: 12, i: 3, w: 1.3, v: 110, sub: 'sword', desc: '東の海の向こうから伝わった反りの深い刀。' },
  { k: 'handaxe', n: '手斧', atk: 6, i: 1, wd: 1, w: 1, v: 18, sub: 'axe', desc: '薪割りにも戦にも使える小ぶりの斧。' },
  { k: 'axe', n: '戦斧', atk: 10, i: 2, wd: 1, w: 2, v: 45, sub: 'axe', desc: '戦のための斧。' },
  { k: 'battleaxe', n: '大斧', atk: 14, i: 4, wd: 1, w: 3.5, v: 100, sub: 'axe', two: 1, desc: '両手で振るう重い斧。盾ごと叩き割る。' },
  { k: 'halberd', n: '斧槍', atk: 14, i: 3, wd: 2, w: 3.2, v: 95, sub: 'polearm', two: 1, desc: '斧と槍と鉤を一本にした長柄の武器。' },
  { k: 'javelin', n: '投げ槍', atk: 6, i: 1, wd: 1, w: 1, v: 14, sub: 'spear', stack: 5, thrown: 1, desc: '投げて使う短い槍。拾えばまた使える。' },
  { k: 'spear', n: '槍', atk: 9, i: 1, wd: 2, w: 2.2, v: 35, sub: 'spear', desc: '兵の基本の武器。間合いが長い。' },
  { k: 'pike', n: '長槍', atk: 12, i: 2, wd: 3, w: 4, v: 55, sub: 'spear', two: 1, desc: '隊列を組んで騎兵を止める長い槍。' },
  { k: 'lance', n: '騎槍', atk: 13, i: 2, wd: 3, w: 5, v: 70, sub: 'spear', two: 1, desc: '馬の勢いで突く騎士の槍。' },
  { k: 'trident', n: '三叉の矛', atk: 11, i: 2, wd: 2, w: 2.5, v: 55, sub: 'spear', desc: '海辺の戦士が使う三つ又の矛。魚も突ける。' },
  { k: 'glaive', n: '薙刀', atk: 12, i: 2, wd: 2, w: 2.8, v: 65, sub: 'polearm', two: 1, desc: '長い柄の先に反った刃。薙ぎ払う。' },
  { k: 'mace', n: '鎚矛', atk: 9, i: 2, w: 2.3, v: 45, sub: 'mace', desc: '鎧の上から打ちのめす打撃武器。' },
  { k: 'warhammer', n: '戦槌', atk: 12, i: 3, wd: 1, w: 2.5, v: 70, sub: 'mace', desc: '兜ごと打ち砕く戦の槌。' },
  { k: 'morningstar', n: '星球の鎚', atk: 11, i: 3, wd: 1, w: 2.6, v: 60, sub: 'mace', desc: '棘の生えた鉄球を柄の先に付けた鎚。' },
  { k: 'flail', n: '連接棍', atk: 10, i: 2, wd: 1, w: 2.2, v: 55, sub: 'mace', desc: '鎖でつないだ錘を振り回す。盾を越えて当たる。' },
  { k: 'maul', n: '大槌', atk: 16, i: 6, wd: 2, w: 6, v: 120, sub: 'mace', two: 1, desc: '大男でなければ振れない巨大な槌。' },
  { k: 'warsickle', n: '戦鎌', atk: 8, i: 1, wd: 1, w: 1.3, v: 30, sub: 'sickle', desc: '農具の鎌を戦向きに鍛え直したもの。' },
  { k: 'warscythe', n: '大鎌', atk: 13, i: 3, wd: 2, w: 3, v: 80, sub: 'sickle', two: 1, desc: '刃を真っすぐに付け替えた戦の大鎌。' },
  { k: 'throwaxe', n: '投げ斧', atk: 6, i: 1, wd: 1, w: 0.8, v: 16, sub: 'axe', stack: 4, thrown: 1, desc: '回転させて投げる小さな斧。' },
  { k: 'throwknife', n: '投げ刃', atk: 3, i: 1, w: 0.15, v: 5, sub: 'thrown', stack: 10, thrown: 1, desc: '手の中に隠せる小さな投げ刃。' },
];
// 材質ごとに作れない形
const EXCL = {
  bronze: ['stiletto', 'bastardsword', 'greatsword', 'rapier', 'estoc', 'tachi', 'halberd', 'lance', 'maul', 'morningstar', 'flail', 'warscythe', 'sabre', 'pike', 'battleaxe'],
  silver: ['bastardsword', 'greatsword', 'scimitar', 'falchion', 'sabre', 'tachi', 'handaxe', 'battleaxe', 'halberd', 'pike', 'lance', 'glaive', 'maul', 'warsickle', 'warscythe', 'flail', 'throwaxe', 'trident', 'axe'],
  mithril: ['maul', 'handaxe', 'throwaxe', 'warsickle'],
  starmetal: ['handaxe', 'throwaxe', 'warsickle', 'javelin', 'throwknife', 'trident', 'stiletto', 'flail', 'lance', 'pike', 'falchion', 'sabre'],
  adamantite: ['handaxe', 'throwaxe', 'warsickle', 'throwknife', 'stiletto', 'javelin', 'rapier', 'sabre'],
  dragonbone: ['stiletto', 'shortsword', 'scimitar', 'falchion', 'sabre', 'rapier', 'estoc', 'handaxe', 'axe', 'halberd', 'javelin', 'lance', 'trident', 'mace', 'warhammer', 'morningstar', 'flail', 'warsickle', 'throwaxe', 'throwknife', 'bastardsword'],
};
// 今ある ITEMS の id（鉄）
const EXIST = { dagger: 'dagger', sword: 'sword', longsword: 'longsword', greatsword: 'greatsword', spear: 'spear', axe: 'axe', mace: 'mace' };
const EXIST_NAME = { mace: 'メイス' };
// 質の違い
export const Q = [
  { k: 'crude', n: '粗末な', m: 0.75, vm: 0.45, d: 0.6, rare: 0, dem: 2, t: 0.6, desc: '急ぎで打った安物。すぐ刃こぼれする。' },
  { k: 'fine', n: '上等な', m: 1.15, vm: 1.8, d: 1.15, rare: 1, dem: 1, t: 1.5, desc: '腕の良い職人が丁寧に仕上げた品。' },
  { k: 'master', n: '名工の', m: 1.35, vm: 4, d: 1.4, rare: 2, dem: 1, t: 3, desc: '名のある名工が銘を刻んだ逸品。' },
];
const QSHAPES = ['dagger', 'shortsword', 'sword', 'longsword', 'greatsword', 'scimitar', 'rapier', 'axe', 'battleaxe', 'spear', 'pike', 'mace', 'warhammer', 'halberd'];

function metalWeapon(mk, s, q) {
  const M = WM[mk];
  const base = mk === 'iron' && EXIST[s.k] ? EXIST[s.k] : `${mk}_${s.k}`;
  const id = q ? `${base}_${q.k}` : base;
  const bname = mk === 'iron' && EXIST[s.k] ? (EXIST_NAME[s.k] || s.n) : `${M.n}の${s.n}`;
  const name = q ? q.n + bname : bname;
  const atk = Math.max(1, Math.round(s.atk * M.m * (q ? q.m : 1)));
  const v = r(s.v * M.vm * (q ? q.vm : 1));
  const from = { [M.ing]: s.i };
  if (s.wd) from.wood = s.wd;
  from.leather = 1;
  if (s.thrown && s.stack > 1) { /* 1回で数本 */ }
  const eq = { slot: 'weapon', atk, dur: r(M.d * (q ? q.d : 1), 2) };
  if (s.two) eq.two = 1;
  if (s.fast) eq.fast = 1;
  if (s.thrown) eq.thrown = 1;
  if (mk === 'silver') eq.undead = 2;
  if (mk === 'starmetal') eq.antimagic = 1;
  if (mk === 'dragonbone') eq.dragon = 1.5;
  const src = [CR];
  if (['bronze', 'iron', 'steel'].includes(mk) && (!q || q.k !== 'master')) src.push(LOOT(q?.k === 'crude' ? 0.08 : 0.03, ['dungeon', 'ruins']));
  if (['mithril', 'adamantite', 'starmetal', 'dragonbone'].includes(mk) || q?.k === 'master') src.push(LOOT(0.005, ['dungeon', 'demoncastle']));
  const use = [uWear('武器として持つ')];
  if (mk !== 'dragonbone') use.push(uMelt);
  use.push({ k: 'trade' });
  if (q?.k === 'master' || M.rare >= 2) use.push({ k: 'collect', note: '名品として飾る' }, { k: 'gift', note: '騎士や王への献上品' });
  if (mk === 'silver') use.push({ k: 'ritual', note: '魔除けとして家に掛ける' });
  if (s.k === 'dagger' || s.k === 'handaxe') use.push({ k: 'tool', note: '獲物をさばく・薪を割る' });
  const rare = Math.min(4, Math.max(M.rare, q ? (q.k === 'master' ? M.rare + q.rare : q.k === 'fine' ? Math.max(M.rare, 1) : M.rare) : M.rare));
  let dem = q ? q.dem : M.dem;
  if (['sword', 'spear', 'dagger'].includes(s.k) && mk === 'iron' && !q) dem = 2;
  add(F, {
    id, name, sub: s.sub, w: r(s.w * M.wm, 2), v, stack: s.stack || 1, rare, demand: dem,
    src, use,
    make: { from, by: s.k === 'tachi' ? 'swordsmith' : 'smith', t: r((3 + s.i * 2) * M.t * (q ? q.t : 1), 1) },
    eq,
    desc: (q ? q.desc : s.desc) + (M.note && !q ? M.note + '。' : '') + (s.stack > 1 ? `${s.stack}本まで束ねて持てる。` : ''),
  });
}

export function genWeapons() {
  for (const mk of Object.keys(WM)) for (const s of SH) if (!(EXCL[mk] || []).includes(s.k)) metalWeapon(mk, s);
  for (const mk of ['iron', 'steel']) for (const sk of QSHAPES) for (const q of Q) metalWeapon(mk, SH.find((x) => x.k === sk), q);

  // 竜鱗の剣・聖剣（今ある品）
  add(F, { id: 'dragonblade', name: '竜鱗の剣', sub: 'sword', w: 1.6, v: 400, rare: 3, demand: 1, src: [CR, LOOT(0.004, ['dungeon', 'demoncastle'])],
    use: [uWear('武器として持つ'), { k: 'trade' }, { k: 'collect', note: '竜殺しの証' }], make: { from: { iron: 3, scale: 2, leather: 1 }, by: 'smith', t: 30 },
    eq: { slot: 'weapon', atk: 22, dur: 2.6, dragon: 1.5 }, desc: '竜の鱗を刃に焼き付けた剣。火に強い。' });
  add(F, { id: 'holysword', name: '聖剣', sub: 'sword', w: 1.5, v: 0, rare: 4, demand: 0, limit: 'relic', src: [{ how: 'craft', note: '研究「聖剣の鍛造」を終えた国の鍛冶屋だけが打てる' }, LOOT(0.0005, ['ruins'])],
    use: [uWear('魔王と戦う武器'), { k: 'ritual', note: '国の守りのしるし' }, { k: 'quest', note: '魔王討伐' }], make: { from: { mithril: 5, starmetal: 2, magicstone: 5, gem: 1 }, by: 'smith', t: 240 },
    eq: { slot: 'weapon', atk: 30, dur: 50, undead: 2, demon: 2 }, desc: '魔を祓う伝説の剣。売り物にならない。' });

  // ---- 弓 ----
  const BW = [
    ['toybow', '子どもの弓', 2, { wood: 1, hemp: 1 }, 0.3, 4, 0, 2, '子どもが遊びと練習に使う小さな弓。'],
    ['huntbow', '狩人の弓', 6, { wood: 2, sinew: 1 }, 0.7, 25, 0, 2, '森で鹿や兎を射る素朴な弓。'],
    ['shortbow', '短弓', 5, { wood: 1, hemp: 1 }, 0.6, 18, 0, 2, '取り回しのよい短い弓。'],
    ['bow', '弓', 7, { wood: 2, silk: 1 }, 0.8, 35, 0, 2, 'ふつうの弓。'],
    ['longbow', '長弓', 10, { yew: 2, hemp: 1 }, 1.1, 60, 0, 1, 'イチイで作る背丈ほどの弓。遠くまで届く。'],
    ['horsebow', '騎射の短弓', 8, { wood: 1, horn: 0, antler: 1, sinew: 1 }, 0.6, 55, 1, 1, '馬の上から射る反り返った短弓。'],
    ['compositebow', '合成弓', 11, { wood: 1, antler: 1, sinew: 2 }, 0.9, 90, 1, 1, '木と角と腱を膠で貼り合わせた強い弓。'],
    ['greatbow', '剛弓', 13, { ironwood: 2, sinew: 2 }, 1.6, 110, 1, 1, '並の者では引けない硬い弓。'],
    ['ironwoodbow', '鉄木の弓', 12, { ironwood: 2, silk: 1 }, 1.2, 95, 1, 1, '鉄のように硬い木で作る弓。狂いが少ない。'],
    ['elvenbow', 'エルフの長弓', 14, { elderwood: 2, silk: 2 }, 0.8, 220, 2, 1, '森の奥の人々が編んだ白木の弓。音もなく矢を放つ。'],
    ['mithrilbow', 'ミスリル弦の弓', 16, { yew: 2, mithril: 1 }, 0.9, 380, 2, 1, '弦にミスリルを撚り込んだ弓。切れない。'],
    ['dragonbow', '竜骨の弓', 20, { dragonbone: 2, sinew: 2 }, 1.2, 600, 3, 1, '竜の肋骨を削った弓。矢が岩を貫く。'],
  ];
  for (const [id, name, atk, from, w, v, rare, dem, desc] of BW) {
    for (const k in from) if (!from[k]) delete from[k];
    const src = [CR];
    if (id === 'elvenbow') src.push(TR(['forest', 'dense']));
    if (rare >= 2) src.push(LOOT(0.004, ['dungeon', 'ruins']));
    add(F, { id, name, sub: 'bow', w, v, rare, demand: dem, src, use: [uWear('弓。矢を放つ'), { k: 'tool', note: '狩り' }, { k: 'trade' }],
      make: { from, by: 'bowyer', t: r(4 + v / 10, 1) }, eq: { slot: 'weapon', atk, dur: 1 + rare * 0.5, ranged: 1, ammo: 'arrow', two: 1 }, desc });
  }
  for (const b of ['shortbow', 'bow', 'longbow']) for (const q of Q) {
    const o = BW.find((x) => x[0] === b);
    add(F, { id: `${b}_${q.k}`, name: q.n + o[1], sub: 'bow', w: o[4], v: r(o[5] * q.vm), rare: q.k === 'master' ? 2 : q.k === 'fine' ? 1 : 0, demand: q.dem,
      src: [CR, ...(q.k === 'crude' ? [LOOT(0.05, ['dungeon', 'ruins'])] : [])], use: [uWear('弓。矢を放つ'), { k: 'tool', note: '狩り' }, { k: 'trade' }],
      make: { from: { ...o[3] }, by: 'bowyer', t: r((4 + o[5] / 10) * q.t, 1) }, eq: { slot: 'weapon', atk: Math.round(o[2] * q.m), dur: r(q.d, 2), ranged: 1, ammo: 'arrow', two: 1 }, desc: q.desc });
  }
  // ---- 弩 ----
  const XB = [
    ['huntcrossbow', '狩猟用の小弩', 7, { wood: 1, iron: 1, hemp: 1 }, 2, 40, 0, '鳥や兎を撃つ軽い弩。'],
    ['lightcrossbow', '軽弩', 9, { wood: 2, iron: 1, sinew: 1 }, 2.5, 50, 0, '手で引ける軽い弩。'],
    ['crossbow', '弩', 12, { wood: 2, iron: 2, sinew: 1 }, 4, 80, 0, '足をかけて弦を引く弩。素人でも当てやすい。'],
    ['heavycrossbow', '重弩', 16, { wood: 2, steel: 2, sinew: 2 }, 7, 140, 1, '巻き上げ具で引く重い弩。板金鎧も貫く。'],
    ['repeatcrossbow', '連弩', 10, { wood: 3, iron: 2, sinew: 1 }, 4.5, 120, 1, '箱に太矢を詰め、続けて撃てる弩。'],
    ['steelcrossbow', '鋼の弩', 15, { steel: 3, wood: 1, sinew: 1 }, 5, 150, 1, '弓の部分を鋼で作った強い弩。'],
    ['mithrilcrossbow', 'ミスリルの弩', 20, { mithril: 2, wood: 1, silk: 1 }, 2.5, 420, 2, '軽くて強いミスリルの弩。'],
    ['dwarfcrossbow', 'ドワーフの轟弩', 18, { steel: 4, oak: 1, sinew: 2 }, 8, 300, 2, '山の工匠が作る重い弩。歯車で引く。'],
  ];
  for (const [id, name, atk, from, w, v, rare, desc] of XB) add(F, { id, name, sub: 'crossbow', w, v, rare, demand: 1,
    src: id === 'dwarfcrossbow' ? [CR, TR(['mountain'])] : [CR], use: [uWear('弩。太矢を撃つ'), { k: 'trade' }, ...(id === 'huntcrossbow' ? [{ k: 'tool', note: '狩り' }] : [])],
    make: { from, by: 'bowyer', t: r(6 + v / 8, 1) }, eq: { slot: 'weapon', atk, dur: 1.1 + rare * 0.4, ranged: 1, ammo: 'bolt', two: 1, slow: 1 }, desc });
  // ---- 投石具・杖・鞭・棍棒・拳 ----
  const MISC = [
    ['sling', '投石紐', 'sling', 4, { hemp: 1 }, 0.1, 2, 0, 2, 'rope', { ranged: 1, ammo: 'stone' }, '羊飼いの子も使う、石を投げる紐。', 'roper'],
    ['leathersling', '革の投石具', 'sling', 5, { leather: 1, hemp: 1 }, 0.15, 5, 0, 2, 0, { ranged: 1, ammo: 'stone' }, '革の受け皿が付いた投石具。', 'leatherworker'],
    ['staffsling', '杖つき投石具', 'sling', 7, { wood: 1, leather: 1 }, 1.2, 10, 0, 1, 0, { ranged: 1, ammo: 'stone', two: 1 }, '長い柄の先で石を遠くへ飛ばす。城攻めにも。', 'carpenter'],
    ['bolas', '投げ縄玉', 'sling', 3, { leather: 1, stone: 1 }, 0.8, 6, 0, 1, 0, { ranged: 1, snare: 1 }, '縄の先に石を付けた投げ具。獣の脚にからみつく。', 'leatherworker'],
    ['club', '棍棒', 'club', 5, { wood: 1 }, 1.5, 2, 0, 2, 0, {}, '木を削っただけの棍棒。誰でも作れる。', 'carpenter'],
    ['oakclub', '樫の棍棒', 'club', 6, { oak: 1 }, 1.8, 4, 0, 2, 0, {}, '重く硬い樫の棍棒。', 'carpenter'],
    ['studclub', '鋲打ちの棍棒', 'club', 8, { oak: 1, iron: 1 }, 2.2, 12, 0, 1, 0, {}, '鉄の鋲を打ち込んだ棍棒。夜警が持ち歩く。', 'smith'],
    ['boneclub', '骨の棍棒', 'club', 6, { bone: 3 }, 1.6, 4, 0, 1, 0, {}, '大きな獣の腿の骨。', 'carpenter'],
    ['quarterstaff', '六尺棒', 'club', 5, { wood: 1 }, 1.8, 3, 0, 2, 0, { two: 1 }, '長い棒。旅人も修行者も使う。', 'carpenter'],
    ['ironstaff', '鉄の棒', 'club', 9, { iron: 3 }, 4, 25, 0, 1, 0, { two: 1 }, '鉄を打ち延ばした棒。武闘家が振るう。', 'smith'],
    ['giantclub', '巨人の棍棒', 'club', 14, { oak: 4, iron: 2 }, 9, 40, 1, 1, 0, { two: 1 }, '大鬼が振るっていた丸太の棍棒。', 'carpenter'],
    ['knuckle', '拳鍔', 'fist', 4, { iron: 1 }, 0.3, 8, 0, 1, 0, { fist: 1 }, '握り込んで殴る鉄の輪。', 'smith'],
    ['fightgauntlet', '格闘用の手甲', 'fist', 7, { steel: 1, leather: 1 }, 0.8, 35, 1, 1, 0, { fist: 1 }, '武闘家の拳を守り、重くする手甲。', 'armorer'],
    ['clawblade', '鉤爪', 'fist', 8, { steel: 1, leather: 1 }, 0.6, 45, 1, 1, 0, { fist: 1 }, '手の甲から三本の刃が出る暗殺者の武器。', 'smith'],
    ['whip', '革の鞭', 'whip', 4, { leather: 2 }, 0.6, 6, 0, 1, 0, { reach: 1 }, '打つと大きな音が鳴る鞭。', 'leatherworker'],
    ['chainwhip', '鎖の鞭', 'whip', 7, { iron: 2, leather: 1 }, 1.5, 30, 0, 1, 0, { reach: 1 }, '細い鎖を編んだ鞭。', 'smith'],
    ['thornwhip', '茨の鞭', 'whip', 6, { leather: 2, fang: 2 }, 0.8, 22, 1, 1, 0, { reach: 1 }, '牙を編み込んだ鞭。傷が深い。', 'leatherworker'],
    ['wyvernwhip', 'ワイバーン革の鞭', 'whip', 12, { wyvern_hide: 2, fang: 1 }, 0.9, 240, 2, 1, 0, { reach: 1 }, '飛竜の尾の革で編んだ鞭。音だけで獣が逃げる。', 'leatherworker'],
  ];
  for (const [id, name, sub, atk, from, w, v, rare, dem, _x, ex, desc, by] of MISC) add(F, { id, name, sub, w, v, rare, demand: dem,
    src: id === 'giantclub' ? [CR, { how: 'hunt', on: ['orcking', 'orc'], rate: 0.05 }] : [CR],
    use: [uWear('武器として持つ'), ...(sub === 'club' || sub === 'sling' ? [{ k: 'tool', note: '獣を追い払う' }] : [{ k: 'trade' }])],
    make: { from, by, t: r(1 + v / 8, 1) }, eq: { slot: 'weapon', atk, dur: 1, ...ex }, desc });

  // ---- 杖 ----
  const STF = [
    ['staff', '魔法の杖', 9, { wood: 1, magicstone: 1 }, 1.4, 60, 0, 1, { mag: 3 }, 'wizard', '魔石を先に据えた、魔法使いのふつうの杖。'],
    ['wand', '短杖', 6, { wood: 1, magicstone: 1 }, 0.3, 45, 0, 1, { mag: 2 }, 'wizard', '片手で振る短い杖。呪文を早く唱えられる。'],
    ['apprenticestaff', '見習いの杖', 7, { wood: 1, crystal: 1 }, 1.2, 30, 0, 1, { mag: 1 }, 'wizard', '魔法学園の見習いが最初に持つ杖。'],
    ['oakstaff', '樫の杖', 5, { oak: 1 }, 1.6, 6, 0, 2, {}, 'carpenter', '樫を削った杖。叩いてもよし、突いてもよし。'],
    ['rubystaff', '紅玉の杖', 13, { ebony: 1, ruby: 1, magicstone: 1 }, 1.4, 260, 2, 1, { mag: 6, fire: 1 }, 'wizard', '炎の呪文を強める紅い宝玉の杖。'],
    ['sapphirestaff', '青玉の杖', 13, { ebony: 1, sapphire: 1, magicstone: 1 }, 1.4, 260, 2, 1, { mag: 6, ice: 1 }, 'wizard', '氷と水の呪文を強める青い宝玉の杖。'],
    ['emeraldstaff', '翠玉の杖', 13, { ebony: 1, emerald: 1, magicstone: 1 }, 1.4, 260, 2, 1, { mag: 6, wind: 1 }, 'wizard', '風の呪文を強める緑の宝玉の杖。'],
    ['topazstaff', '黄玉の杖', 13, { ebony: 1, topaz: 1, magicstone: 1 }, 1.4, 240, 2, 1, { mag: 6, earth: 1 }, 'wizard', '大地の呪文を強める黄色い宝玉の杖。'],
    ['crystalstaff', '水晶の杖', 10, { wood: 1, crystal: 2 }, 1.3, 110, 1, 1, { mag: 4 }, 'wizard', '透きとおった水晶の杖。月の夜に力が増す。'],
    ['bonestaff', '骨の杖', 11, { bone: 3, magicstone: 1 }, 1.2, 90, 1, 0, { mag: 5, dark: 1 }, 'wizard', '死霊術師が好む骨の杖。持つと寒気がする。'],
    ['crozier', '司教杖', 8, { silver: 1, wood: 1, gem: 1 }, 1.8, 180, 1, 1, { mag: 3, heal: 1, holy: 1 }, 'smith', '先が渦を巻いた司教の杖。癒しの祈りを強める。'],
    ['holysymbolstaff', '聖印の杖', 9, { silver: 1, wood: 1 }, 1.5, 120, 1, 1, { mag: 3, heal: 1, holy: 1 }, 'smith', '僧侶が持つ聖印を頂いた杖。'],
    ['druidstaff', 'やどり木の杖', 10, { oak: 1, mistletoe: 1 }, 1.5, 85, 1, 1, { mag: 4, heal: 1 }, 'wizard', '森の賢者が作る、やどり木を巻いた杖。'],
    ['worldtreestaff', '世界樹の枝の杖', 18, { worldtree_branch: 1, magicstone: 2 }, 1.0, 1200, 3, 1, { mag: 10, heal: 2 }, 'wizard', '世界樹から落ちた枝の杖。持つだけで傷が癒える。'],
    ['demonstaff', '魔核の杖', 17, { ebony: 1, demoncore: 2 }, 1.4, 900, 3, 0, { mag: 10, dark: 2 }, 'wizard', '魔核を据えた禍々しい杖。使う者の心を蝕む。'],
    ['starstaff', '星読みの杖', 12, { silver: 1, crystal: 1, ebony: 1 }, 1.3, 300, 2, 1, { mag: 5, sight: 1 }, 'wizard', '占星術師の杖。星の巡りを映す。'],
  ];
  for (const [id, name, atk, from, w, v, rare, dem, ex, by, desc] of STF) add(F, { id, name, sub: 'staff', w, v, rare, demand: dem,
    src: rare >= 2 ? [CR, LOOT(0.004, ['dungeon', 'ruins', 'demoncastle'])] : [CR],
    use: [uWear('魔法の杖'), { k: 'magic', note: '呪文を強める' }, ...(rare >= 1 ? [{ k: 'trade' }] : [{ k: 'tool', note: '歩くときの支え' }])],
    make: { from, by, t: r(3 + v / 10, 1) }, eq: { slot: 'weapon', atk, dur: 1 + rare * 0.4, ...ex }, desc });

  // ---- 矢・太矢・弾 ----
  const AM = [
    ['arrow', '矢', 'arrow', { wood: 1, iron: 1, feather: 1 }, 20, 0.03, 0.4, 0, 3, 0, 'ふつうの鉄の矢じりの矢。20本ひと束で作る。'],
    ['stonearrow', '石の矢じりの矢', 'arrow', { wood: 1, flint: 1, feather: 1 }, 20, 0.03, 0.15, 0, 2, -1, '打ち欠いた火打ち石の矢じり。安いが鎧に弱い。'],
    ['bonearrow', '骨の矢', 'arrow', { wood: 1, bone: 1, feather: 1 }, 20, 0.03, 0.2, 0, 2, -1, '骨を削った矢じり。狩りに使う。'],
    ['broadarrow', '広刃の矢', 'arrow', { wood: 1, iron: 1, feather: 1 }, 15, 0.04, 0.6, 0, 1, 1, '刃の幅が広く、大きな獣を仕留める矢。'],
    ['steelarrow', '鋼の矢', 'arrow', { wood: 1, steel: 1, feather: 1 }, 20, 0.03, 0.9, 1, 1, 2, '鎧を貫く鋼の矢じり。'],
    ['silverarrow', '銀の矢', 'arrow', { wood: 1, silver: 1, feather: 1 }, 10, 0.03, 4, 1, 1, 1, '不死の魔物を射抜く銀の矢。'],
    ['mithrilarrow', 'ミスリルの矢', 'arrow', { wood: 1, mithril: 1, feather: 1 }, 20, 0.02, 8, 2, 1, 4, '風に流されないミスリルの矢。'],
    ['firearrow', '火矢', 'arrow', { wood: 1, iron: 1, pitch: 1 }, 10, 0.04, 1, 0, 1, 1, '松脂を染ませた布を巻いた矢。火を放つ。'],
    ['whistlearrow', '鏑矢', 'arrow', { wood: 1, bone: 1, feather: 1 }, 5, 0.04, 1, 0, 0, -2, '音を立てて飛ぶ合図の矢。戦の始まりを告げる。'],
    ['bolt', '太矢', 'bolt', { wood: 1, iron: 1 }, 15, 0.06, 0.6, 0, 2, 0, '弩で撃つ太く短い矢。'],
    ['steelbolt', '鋼の太矢', 'bolt', { wood: 1, steel: 1 }, 15, 0.06, 1.2, 1, 1, 2, '鋼の太矢。重弩と組み合わせると板金を貫く。'],
    ['slingstone', '投石用の丸石', 'shot', { pebble: 20 }, 20, 0.1, 0.05, 0, 2, 0, '川原で丸い石を拾いそろえた弾。'],
    ['leadshot', '鉛の弾', 'shot', { lead: 1 }, 20, 0.05, 0.3, 0, 1, 1, '鉛を鋳た投石具の弾。遠くまで飛ぶ。'],
    ['blowdart', '吹き矢の針', 'dart', { bamboo: 1, thorn: 5 }, 20, 0.005, 0.2, 0, 1, 0, '吹き矢に込める細い針。'],
    ['poisondart', '毒の吹き矢の針', 'dart', { bamboo: 1, thorn: 5, poison: 1 }, 10, 0.005, 1, 1, 1, 0, '毒を塗った針。獣を眠らせる。'],
  ];
  for (const [id, name, ammo, from, n, w, v, rare, dem, atk, desc] of AM) add(F, { id, name, sub: 'ammo', w, v, stack: 50, rare, demand: dem,
    src: id === 'slingstone' ? [CR, { how: 'gather', on: ['river', 'beach'], rate: 0.5 }] : [CR],
    use: [{ k: 'wear', note: `${ammo === 'arrow' ? '弓' : ammo === 'bolt' ? '弩' : ammo === 'shot' ? '投石具' : '吹き矢'}に込める` }, { k: 'tool', note: '狩り' }],
    make: { from, by: ammo === 'shot' ? (id === 'leadshot' ? 'smith' : 'gatherer') : ammo === 'dart' ? 'tribal_crafter' : 'fletcher', t: 1, n },
    fx: { ammo, atk }, desc });
  // 矢筒
  const QV = [
    ['quiver', '矢筒', { leather: 1 }, 0.4, 4, 0, 30, '腰か背に負う革の矢筒。30本入る。'],
    ['hipquiver', '腰の矢筒', { leather: 1 }, 0.3, 3, 0, 20, '腰に下げる小さな矢筒。すぐ抜ける。'],
    ['boltcase', '太矢入れ', { leather: 1, wood: 1 }, 0.6, 5, 0, 20, '弩の太矢をしまう箱型の入れ物。'],
    ['elvenquiver', 'エルフ織りの矢筒', { elvencloth: 1 }, 0.2, 40, 2, 50, '矢が絡まず音も立たない矢筒。'],
  ];
  for (const [id, name, from, w, v, rare, n, desc] of QV) add(F, { id, name, sub: 'quiver', w, v, rare, demand: 1, src: id === 'elvenquiver' ? [CR, TR(['forest', 'dense'])] : [CR],
    use: [uWear('矢を背負う')], make: { from, by: 'leatherworker', t: 2 }, eq: { slot: 'accessory', arrows: n }, desc });

  // ---- 民族の武器 ----
  const TW = [
    ['obsidianclub', '黒曜石の刃の木剣', 11, { wood: 2, obsidian: 3 }, 2, 40, 1, ['jungle', 'volcano'], '平たい木剣の縁に黒曜石の刃を並べた、密林の民の武器。'],
    ['stoneaxe', '石の斧', 5, { stone: 1, wood: 1, sinew: 1 }, 1.8, 3, 0, ['forest', 'hill'], '石を磨いて柄に縛った斧。'],
    ['stonespear', '石の槍', 6, { flint: 1, wood: 2, sinew: 1 }, 1.8, 4, 0, ['savanna', 'grass'], '火打ち石の穂先を付けた槍。'],
    ['bonespear', '骨の槍', 7, { bone: 2, wood: 2 }, 1.8, 6, 0, ['tundra', 'snow'], '大きな獣の骨を穂先にした槍。'],
    ['bonedagger', '骨の短剣', 3, { bone: 1 }, 0.3, 2, 0, ['tundra', 'swamp'], '骨を研いだ短剣。'],
    ['fangdagger', '牙の短剣', 5, { fang: 2, leather: 1 }, 0.3, 12, 0, ['forest', 'jungle'], '大きな獣の牙を柄に差した短剣。'],
    ['blowpipe', '吹き矢筒', 3, { bamboo: 2 }, 0.5, 5, 0, ['jungle', 'swamp'], '竹をくり抜いた長い筒。針を吹いて射る。'],
    ['throwstick', '投げ棍', 4, { wood: 1 }, 0.4, 4, 0, ['savanna', 'desert'], '曲がった木の投げ棍。回って飛び、うまく投げれば戻ってくる。'],
    ['whaleboneharpoon', '鯨骨の銛', 10, { whalebone: 2, hemp: 1 }, 2.5, 30, 1, ['sea', 'snow'], '鯨の骨を削った銛。縄をつけて投げる。'],
    ['sharkclub', '鮫の歯の棍棒', 9, { wood: 1, shark_tooth: 6 }, 1.5, 20, 1, ['sea', 'beach'], '鮫の歯を縁に並べた、島の民の棍棒。'],
    ['chainsickle', '鎖鎌', 9, { iron: 2, wood: 1 }, 1.4, 45, 1, ['mountain'], '鎌の柄に鎖と錘をつないだ山の民の武器。'],
    ['ritualblade', '祭祀の石刃', 4, { obsidian: 1, gold: 1 }, 0.4, 60, 2, ['jungle', 'mountain'], '魔物に生贄を捧げる儀式にだけ使われる黒い刃。'],
    ['ritualhalberd', '祭祀の大鉾', 10, { bronze: 3, wood: 2, feather: 5 }, 3.5, 90, 2, ['jungle', 'mountain'], '祭りの行列の先頭に立てる、羽根飾りの大鉾。'],
    ['snakefangsword', '大蛇の牙の刺し剣', 12, { snake_fang: 1, leather: 1 }, 0.8, 150, 2, ['swamp', 'jungle'], '大蛇の毒牙そのものを刃にした剣。'],
    ['paddlesword', '櫂剣', 8, { ironwood: 2 }, 2, 25, 1, ['sea', 'beach'], '櫂の形の硬い木剣。舟を漕ぎ、そのまま戦う。'],
    ['desertkhopesh', '砂の民の鎌剣', 10, { bronze: 2, leather: 1 }, 1.5, 55, 1, ['desert'], '鎌のように曲がった刃の古い型の剣。'],
    ['iceaxe', '雪原の民の氷割り斧', 8, { iron: 1, antler: 1 }, 1.2, 20, 0, ['snow', 'tundra'], '鹿角の柄に鉄の刃。氷を割り、獣を倒す。'],
    ['woodsmanbow', '森の民の蔓弓', 8, { yew: 1, vine: 2 }, 0.6, 20, 1, ['forest', 'dense'], '蔓を弦にした森の民の弓。'],
    ['bolaweights', '狩りの三つ玉', 4, { stone: 3, sinew: 2 }, 1, 8, 0, ['savanna', 'grass', 'tundra'], '三つの石玉を紐でつないだ投げ具。'],
    ['mammothspear', '大牙の槍', 13, { ivory: 1, wood: 2, sinew: 1 }, 3, 80, 2, ['tundra', 'snow'], '大牙獣の牙を穂先にした長い槍。'],
  ];
  for (const [id, name, atk, from, w, v, rare, on, desc] of TW) add(F, { id, name, sub: 'tribal_weapon', w, v, rare, demand: 1,
    src: [TR(on), CR], use: [uWear('武器として持つ'), { k: id.startsWith('ritual') ? 'ritual' : 'tool', note: id.startsWith('ritual') ? '村の祭りと生贄の儀式' : '狩り' }, { k: 'collect', note: '異郷の珍しい品' }],
    make: { from, by: 'tribal_crafter', t: r(2 + v / 10, 1) }, eq: { slot: 'weapon', atk, dur: 0.8 + rare * 0.3, ...(id === 'blowpipe' ? { ranged: 1, ammo: 'dart' } : {}), ...(id === 'woodsmanbow' ? { ranged: 1, ammo: 'arrow', two: 1 } : {}) }, desc });

  // ---- 魔法の武器（ダンジョン・魔王の屋敷の宝箱から。宝箱は復活するので数は尽きない。伝説の品だけは世界にひとつ） ----
  const MW = [
    ['flamesword', '炎の剣', 'sword', 18, 1.3, 600, 3, { fire: 1 }, '刃に炎が宿る剣。斬った傷が焼ける。'],
    ['frostdagger', '氷牙の短剣', 'sword', 12, 0.4, 420, 3, { ice: 1 }, '触れたものを凍らせる短剣。'],
    ['thunderhammer', '雷鳴の戦槌', 'mace', 22, 3, 900, 3, { thunder: 1 }, '打つたびに雷が落ちる戦槌。'],
    ['galebow', '疾風の弓', 'bow', 17, 0.8, 650, 3, { wind: 1, ranged: 1, ammo: 'arrow', two: 1 }, '矢が風に乗り、狙いを外さない。'],
    ['earthaxe', '大地の大斧', 'axe', 21, 4, 800, 3, { earth: 1, two: 1 }, '振り下ろすと地が揺れる大斧。'],
    ['vampiredagger', '吸血の短剣', 'sword', 11, 0.4, 700, 3, { drain: 1 }, '斬った相手の命を少し吸い取る。'],
    ['shadowblade', '影の刃', 'sword', 15, 0.8, 750, 3, { stealth: 1 }, '闇に溶ける黒い刀身。気づかれずに近づける。'],
    ['moonrapier', '月光の細剣', 'sword', 14, 1, 680, 3, { holy: 1, fast: 1 }, '月の光を受けて青く光る細剣。'],
    ['sunspear', '日輪の槍', 'spear', 19, 2.2, 820, 3, { holy: 1, fire: 1 }, '穂先が小さな太陽のように輝く槍。'],
    ['tidetrident', '潮騒の三叉矛', 'spear', 18, 2.4, 760, 3, { water: 1 }, '海の民の神殿に眠っていた矛。水の中でも重くならない。'],
    ['venomglaive', '毒蛇の薙刀', 'polearm', 17, 2.6, 640, 3, { poison: 1, two: 1 }, '刃から毒が滴る薙刀。'],
    ['soulscythe', '魂刈りの大鎌', 'sickle', 24, 3, 1100, 3, { drain: 1, dark: 1, two: 1 }, '死神が持つという大鎌。'],
    ['giantslayer', '巨人殺しの大剣', 'sword', 23, 3.2, 1000, 3, { giant: 2, two: 1 }, '大きな相手ほど深く斬れる大剣。'],
    ['dragonslayer', '竜殺しの剣', 'sword', 26, 1.8, 2500, 4, { dragon: 2.5 }, '竜を討つために鍛えられた古の剣。', 1],
    ['demonbane', '魔祓いの長剣', 'sword', 24, 1.5, 2200, 4, { demon: 2 }, '魔族を退ける刻印の長剣。', 1],
    ['kingsword', '初代王の剣', 'sword', 25, 1.6, 3000, 4, { command: 1 }, 'この地に国を開いた王が振るった剣。', 1],
    ['heroaxe', '英雄の戦斧', 'axe', 24, 2.2, 2000, 4, {}, '昔話に語られる英雄の斧。', 1],
    ['starfallbow', '星落としの弓', 'bow', 26, 1, 2600, 4, { ranged: 1, ammo: 'arrow', two: 1 }, '夜空の星を射落としたという弓。', 1],
    ['archmagestaff', '大賢者の杖', 'staff', 20, 1.5, 3000, 4, { mag: 14 }, '古の大賢者が残した杖。', 1],
    ['demonlordblade', '魔王の黒剣', 'sword', 28, 2, 3500, 4, { dark: 2, drain: 1 }, '魔王の屋敷の最奥に眠る黒い剣。持ち主を選ぶ。', 1],
    ['cursedsword', '呪われた剣', 'sword', 16, 1.3, 120, 2, { curse: 1 }, '強いが、持つと手放せなくなり心が荒む。'],
    ['bloodaxe', '血濡れの戦斧', 'axe', 16, 2.2, 450, 2, { frenzy: 1 }, '持つ者を狂戦士に変える斧。'],
    ['whisperdagger', '囁く短剣', 'sword', 10, 0.3, 380, 2, { stealth: 1 }, '持ち主にだけ聞こえる声で、敵の居場所を囁く。'],
    ['ghostbow', '亡霊の弓', 'bow', 14, 0.7, 520, 2, { ranged: 1, ammo: 'arrow', undead: 2, two: 1 }, '矢が壁を抜けて飛ぶ青白い弓。'],
    ['runeaxe', '古代文字の斧', 'axe', 15, 2, 480, 2, { antimagic: 1 }, '刃に古代の文字が刻まれた斧。魔法を打ち消す。'],
    ['runehammer', '古代文字の槌', 'mace', 16, 2.5, 500, 2, { antimagic: 1 }, '地下の民の古い工房から出た槌。'],
    ['flamewhip', '炎の鞭', 'whip', 13, 0.8, 420, 2, { fire: 1, reach: 1 }, '振ると火の粉が舞う鞭。'],
    ['icestaff', '凍てつく杖', 'staff', 15, 1.3, 560, 2, { mag: 8, ice: 1 }, '先端から冷気が流れ出る杖。'],
    ['firestaff', '業火の杖', 'staff', 15, 1.3, 560, 2, { mag: 8, fire: 1 }, '炎の呪文が二倍の大きさになる杖。'],
    ['stormstaff', '嵐の杖', 'staff', 16, 1.3, 620, 3, { mag: 9, thunder: 1 }, '雷雲を呼ぶ杖。'],
    ['lifestaff', '命の杖', 'staff', 10, 1.2, 700, 3, { mag: 6, heal: 3 }, '癒しの呪文を大きく強める杖。'],
    ['swiftdagger', '疾風の短剣', 'sword', 9, 0.3, 300, 2, { fast: 1 }, '二度斬りつけられる軽い短剣。'],
    ['guardsword', '守りの剣', 'sword', 12, 1.3, 350, 2, { def: 3 }, '持つ者を見えない盾で守る剣。'],
    ['luckydagger', '幸運の短剣', 'sword', 6, 0.3, 280, 2, { luck: 1 }, '宝を見つけやすくなるという短剣。'],
    ['pharaohsceptre', '王の笏の鎚矛', 'mace', 14, 1.8, 900, 3, { holy: 0, undead: 2 }, '砂の下の王墓から出た黄金の鎚矛。'],
    ['piratesabre', '沈没船の騎兵刀', 'sword', 13, 1.2, 320, 2, { water: 1 }, '海の底の沈没船で見つかった刀。錆びない。'],
    ['orcbane', '鬼斬りの太刀', 'sword', 17, 1.3, 600, 3, { orc: 2 }, '鬼や小鬼の群れを斬るための太刀。'],
    ['boneking', '骸骨王の大鎌', 'sickle', 18, 2.8, 540, 3, { dark: 1, two: 1 }, '骸骨の王が振るっていた大鎌。'],
    ['spiderfang', '大蜘蛛の牙の短剣', 'sword', 11, 0.3, 260, 2, { poison: 1 }, '大蜘蛛の毒牙から削った短剣。'],
    ['slimeblade', '粘体の剣', 'sword', 10, 1, 220, 2, { acid: 1 }, 'どんな形にも曲がる奇妙な剣。鎧を溶かす。'],
  ];
  for (const [id, name, sub, atk, w, v, rare, ex, desc, relic] of MW) add(F, { id, name, sub: 'magic_' + sub, w, v, rare, demand: 1, ...(relic ? { limit: 'relic' } : {}),
    src: [LOOT(relic ? 0.0005 : rare >= 3 ? 0.003 : 0.01, id === 'pharaohsceptre' ? ['pyramid'] : id === 'piratesabre' ? ['ruins', 'sea'] : ['dungeon', 'ruins', 'demoncastle'])],
    use: [uWear('魔法の武器'), { k: 'magic' }, { k: 'trade', note: '王族や貴族が高く買う' }, { k: 'collect' }],
    eq: { slot: 'weapon', atk, dur: relic ? 20 : 3, ...ex }, desc });
}
