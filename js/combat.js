// 戦いの決まり（開発部）：武器と鎧の相性・属性・状態異常・疲れ・士気と潰走・魔力と詠唱・瀕死と大けが・大きな魔物の部位・囲みと背後・パーティの撤退
//
// 社長の指示「ファンタジー世界の戦闘について徹底的に調べ、必要な情報を取り入れる」。
// 数字は調査部の docs/戦闘の研究.md（第4部③〜⑫、4-2、4-3、4-6、第5部の判断の順番）の案。調整はすべて下の TUNE で行う。
// 怒り・挑発・かばう・陣形・ランク合わせ（①②）は tactics.js にある。ここはその残り。
//
// ■ 決まり（要点）
//   ③ 武器を「斬る・突く・叩く・弓・弩・魔法」、鎧（魔物は皮の固さ）を「布・革・鎖・板金・鱗」に分け、守りの効きに倍率を掛ける。
//      槍は間合い1.8で先手、懐に入られると−20％。短剣は速く（0.8分）、大剣・大斧・長柄・戦槌は遅い（1.3分）。弩は2.5分。
//   ④ 属性（火・水・風・土・光・闇）。弱点1.5倍・耐性0.5倍・無効0倍、不死者に光は2倍。種族の表は RACE（研究の4-3）。
//      魔法使い＝火・風、魔導士＝水・土、僧侶・聖騎士・勇者・聖剣＝光、竜鱗の剣＝火。ふつうの武器は属性なし。
//   ⑤ 状態異常：毒・出血・麻痺・眠り・混乱・恐怖・呪い（と気絶）。体の状態は体力、心の状態は精神（恐怖は勇気）で抵抗。
//      不死者・ゴーレムは毒・眠り・混乱・出血が効かない。治し方：解毒薬・僧侶の祈り・時間・教会の解呪（お布施）。
//   ⑥ 息（100）。1手ごとに−3（重い武器−4）×鎧の重さ（布1・革1.1・鎖1.3・板金1.6）。30未満で攻め−20％・身のこなし半分、
//      10未満で打てずに下がって息をつく（2手）。元気な前衛がいれば入れ替わる。
//   ⑦ 士気（群れ・パーティごとに100）。仲間が倒れる−15、長が倒れる−40、背後を突かれる−10、敵が倍以上−10、傷だらけ−10、
//      長がそば＋10、敵の長を倒す＋20、勇者・聖騎士＋10。30未満で潰走。逃げる背中への攻めは1.3倍でかわされない。
//   ⑧ 魔力＝10＋知力×2＋レベル（僧侶は精神）。攻めの魔法4、強い魔法（範囲・2手）10、回復5、解毒4、起こす5。
//      詠唱の直前に打たれていたら50％（腕で下がる）で止まり、魔力を失う。魔力が切れたら杖で殴る。1時間に10戻る。
//   ⑨ 殺し合いで体力が0の人は瀕死：20手のうちに手当て（僧侶・薬・仲間の手当て・通りがかりの人）がなければ死ぬ。
//      残酷な魔物（オーク・魔族）は止めを刺しに来る（持ちこたえる70％、打たれるたびに−15％）。
//      一撃で最大体力の30％以上なら20％で大けが（頭35・腕30・脚20・胴15）。治るときに10％（医者にかかれば5％）で後遺症（health.js の古傷）。
//   ⑩ 大きな魔物は頭・翼・脚・尾・胴。最大体力の18％で部位が壊れる（頭：3手ひるむ・咆哮と息が止まる／翼：飛べず身をかわせない／
//      脚：転んで3手動けず1.5倍／尾：薙ぎ払いが止まり素材が取れる）。10％ごとに1手ひるむ。
//   ⑪ 一人を同時に殴れるのは4人まで。2人目からは命中＋10％。背後からはかわされず1.25倍（盗賊・シーフ1.5倍）。
//   ⑫ 5手ごとにリーダーが形勢を見る（力の比0.6未満・瀕死の仲間を治せない・回復が尽きて傷だらけ・士気30未満）→撤退。
//      盾役がしんがり、絆50以上の仲間は瀕死の仲間を背負って退く。負けた相手には、力が2倍そろうまで依頼を受けない。
//
// ■ お金の流れ（研究の4-6。どこからも湧かせない）
//   解毒薬を買う   … 冒険者の家計 → 市場（薬の持ち主）。market.js の marketBuy（'medicine' を1つ買い、解毒薬にする）
//   大けがの治療   … けが人の財布・家計（property.js の pay）→ 医者・薬師（earn）。払えない貧しい人を情け深い医者がただで診ることもある
//   呪いを解く     … 呪われた人（pay）→ 町の教会の施し箱（t.alms）。flow に「呪われた人 → 教会の施し箱：解呪のお布施」
//   盾の修理       … 今までどおり gear.js（かばう・盾受けで傷む → 持ち主が鍛冶屋に払う）
//   尾の素材       … 品物（竜の鱗など）が壊した人の持ち物に入るだけ。売るときに買い手から受け取る（今までの売り方）
//   それ以外（相性・属性・状態異常・息・士気・魔力・瀕死・部位・囲み・撤退）ではお金は動かない。
//
// ■ 状態（すべて遅延初期化。古いセーブでも動く）
//   S.combat = { v, stats:{...} }             … 回数の記録（保存される）
//   e.cb = { sta, staT, mp, mpT, ss:{名前: 切れる時刻}, curse, down:{...}, inj:{k, until, doc}, rout, fled, hitT, cast, lost:{種: 日}, ... }
//   c.cb.pt / c.cb.brk                        … 大きな魔物の部位の傷と、壊れた部位
//   sim._cbMor（士気）・sim._cbDown（瀕死の人）・sim._cbAff（状態異常の者）・sim._cbF（この歩で戦っている者）は保存しない控え
//
// ■ 本体からの呼び方（部長がつなぐ。patch_combat.py）
//   society.js stepCombat：combatHeld / combatReach / combatSpeed / combatTurn / combatArmorMul / combatNoDodge / combatDamage / combatAfterHit / combatFall
//   sim.js：combatStep(sim, dt)（stepCombat の直前）、combatDaily(sim)（newDay）
//   guild.js：combatQuestOk(sim, crew, q)（依頼を受けるとき）
//   ui.js：combatRows(sim, p)、combatCreatureRows(sim, c)／main.js：'cbtag' の事件（浮かぶ文字）
//   anim_people.js / anim_creatures.js：combatPersonAnim(sim, p) / combatCreatureAnim(sim, c)（瀕死・眠り・麻痺・転倒の姿）
import { JOBS, SPECIES } from './data.js';
import { ITEMS, countItem, takeItem, addItem, makeItem } from './items.js';
import { MAT } from './matter.js';
import { startFight, resolveKill, arrest } from './society.js';
import { advClassOf } from './advclass.js';
import { tacticsRole } from './tactics.js';
import { humanPower, powerC, crewPower } from './deadly.js';
import { pay, earn, spendable } from './property.js';
import { flow } from './ledger.js';
import { marketBuy } from './market.js';
import { SCARS, fallIll } from './health.js';
import { T, walkable, tileAt } from './world.js';
import { around } from './creatures.js';
import { formationArmorStrain } from './formation.js';
import { beastsStrongFoe, beastsCrew, beastsNeed, beastsNoteRetreat } from './beasts.js';

// ---------- 数の目安（docs/戦闘の研究.md の案。調整はここだけで） ----------
export const TUNE = {
  // ③ 武器と鎧（守りの効きに掛ける）
  ARMOR: {
    slash:  { cloth: 1.0, leather: 1.0, chain: 1.6, plate: 1.8, scale: 1.6 },
    pierce: { cloth: 0.9, leather: 0.9, chain: 0.8, plate: 1.3, scale: 1.4 },
    blunt:  { cloth: 1.1, leather: 0.9, chain: 0.6, plate: 0.8, scale: 1.0 },
    arrow:  { cloth: 0.8, leather: 1.0, chain: 1.3, plate: 2.0, scale: 1.6 },
    bolt:   { cloth: 0.6, leather: 0.7, chain: 1.0, plate: 1.4, scale: 1.3 },
    magic:  { cloth: 0.3, leather: 0.3, chain: 0.3, plate: 0.3, scale: 0.5 },
  },
  SPD: { fast: 0.8, normal: 1, heavy: 1.3, crossbow: 2.5 },
  REACH: { spear: 1.8, bow: 3.6, crossbow: 3.8, staff: 3.0 },
  SPEAR_CLOSE: 0.8, SPEAR_CLOSE_MUL: 0.8,       // 槍：懐に入られると
  FIRST_CD: 0.25,                               // 先手（槍・弓・シーフ・弓使い）：最初の一撃のあと、すぐにもう一撃
  SHIELD_ARROW_P: 0.35, SHIELD_ARROW_MUL: 0.55,  // 盾は矢に強い
  HEAVY_VS_SHIELD: 1.1,                         // 大振りの武器は盾の上からでも効く
  BASH_MUL: 0.5,                                // 魔力の切れた術者の杖
  // ④ 属性
  WEAK: 1.5, RESIST: 0.5, HOLY_UNDEAD: 2,
  // ⑤ 状態異常：続く長さ（手＝分）
  DUR: { poison: 30, bleed: 10, para: 3, sleep: 5, conf: 4, fear: 5, stun: 1, fall: 3 },
  POISON_DOT: 0.02, BLEED_DOT: 0.01, POISON_ATK: 0.9, FEAR_ATK: 0.8, CONF_P: 0.3,
  RESIST_STEP: 0.03,                            // 能力が10より1高いごとに、かかる確率を3％下げる
  BLEED_SLASH: 0.06, BLEED_CLASS: 0.1,          // 斬る武器が出血させる確率（剣士・盗賊は上乗せ）
  MONK_STUN: 0.03,
  // ⑥ 息
  STA: 100, STA_HAND: 3, STA_HEAVY: 4, STA_REST: 6, STA_OUT: 10,
  STA_ARMOR: { cloth: 1, leather: 1.1, chain: 1.3, plate: 1.6, scale: 1.3 },
  STA_LOW: 30, STA_OUT_OF: 10, STA_LOW_ATK: 0.8, STA_REST_HANDS: 2, STA_SWAP: 50,
  // ⑦ 士気
  MOR_ROUT: 30, MOR_ALLY: -15, MOR_LEADER: -40, MOR_FLANK: -10, MOR_OUTNUM: -10, MOR_HURT: -10,
  MOR_LEAD_NEAR: 10, MOR_KILL_LEAD: 20, MOR_HERO: 10, MOR_LORD: 15, MOR_RECOVER: 0.5, MOR_FORGET: 30,
  ROUT_MUL: 1.3, ROUT_WIN: 10, PURSUE: 8,
  CHASE_ROUT: 0.7, CHASE_FAST: 0.3, CHASE_SPEED: 1.2,   // 逃げる人を追う割合（潰走のとき／整った撤退でも足の速い獣）
  // ⑧ 魔力
  MP_BOLT: 4, MP_BIG: 10, MP_HEAL: 5, MP_CURE: 4, MP_REVIVE: 5, MP_SLEEP: 6, MP_WARD: 6, MP_REGEN: 10,
  HEAL_FRAC: 0.25, FIZZLE: 0.5, BIG_R: 2, BIG_P: 0.4, SLEEP_P: 0.3, WARD_MUL: 0.85, WARD_HANDS: 5, WARD_CD: 10,
  PALADIN_HEALS: 3, PALADIN_HEAL: 0.15,
  // ⑨ 瀕死・大けが
  DOWN_HANDS: 20, DOWN_SAVE: 0.7, DOWN_SAVE_STEP: 0.15, DOWN_SAVE_MAX: 0.9, REVIVE_FRAC: 0.1,
  HELP_R: 6, HELP_R_PARTY: 14, HELP_HANDS: 2, FINISH_P: 0.25,
  INJ_HIT: 0.3, INJ_P: 0.2, INJ_W: { head: 35, arm: 30, leg: 20, cut: 15 },
  INJ_DAYS: { head: [5, 10], arm: [30, 50], leg: [30, 60], cut: [7, 20] },
  SCAR_P: 0.1, SCAR_P_DOC: 0.05, INJ_ARM_ATK: 0.7,
  // ⑩ 部位
  PART_BREAK: 0.18, STAGGER: 0.1, STAGGER_IMMUNE: 2, FLY_DODGE: 0.15, FALL_MUL: 1.5,
  STAGGER_BOSS: 0.2, STUN_BOSS: 1,              // 親玉（竜・魔将・魔王・名のある魔物）はひるみにくく、倒れてもすぐ起きる
  BREATH_EVERY: 6, BREATH_R: 2, BREATH_MUL: 0.7, SWEEP_EVERY: 5, SWEEP_R: 1.6, SWEEP_MUL: 0.5, ROAR_EVERY: 12, ROAR_R: 4,
  // ⑪ 囲み
  MAX_MELEE: 4, SURROUND_HIT: 0.1, BACK_MUL: 1.25, BACK_ROGUE: 1.5, BACK_ANGLE: -0.5,
  // ⑫ 撤退
  CHECK_EVERY: 5, RETREAT_RATIO: 0.6, RETREAT_RATIO_LOST: 0.9, RETREAT_HP: 0.4, REAR_HANDS: 3, CARRY_BOND: 50,
  LOST_NEED: 2, LOST_DAYS: 90,
  // お金（研究の4-6）
  FEE_DOCTOR: 10, FEE_HERB: 5, FEE_CURSE: 15,
  LOG_GAP: 30,
};

// ---------- 武器と鎧の見分け（items.js の品は下の表、ほかは catalog/gear*.js の sub から） ----------
const W_INFO = {
  dagger: ['pierce', 'fast'], sword: ['slash'], longsword: ['slash'], greatsword: ['slash', 'heavy'], spear: ['pierce', 'normal', 'spear'],
  axe: ['slash', 'normal', null, true], mace: ['blunt'], bow: ['arrow', 'normal', 'bow'], staff: ['magic', 'normal', 'staff'],
  dragonblade: ['slash', 'normal', null, false, 'fire'], holysword: ['slash', 'normal', null, false, 'light'],
};
const SUB_W = {
  sword: ['slash'], magic_sword: ['slash'], tribal_weapon: ['slash'], whip: ['slash'], magic_whip: ['slash'], sickle: ['slash'], magic_sickle: ['slash'],
  axe: ['slash', 'normal', null, true], magic_axe: ['slash', 'normal', null, true],
  spear: ['pierce', 'normal', 'spear'], magic_spear: ['pierce', 'normal', 'spear'], polearm: ['pierce', 'heavy', 'spear'], magic_polearm: ['pierce', 'heavy', 'spear'],
  mace: ['blunt'], magic_mace: ['blunt'], club: ['blunt'], fist: ['blunt', 'fast'],
  bow: ['arrow', 'normal', 'bow'], magic_bow: ['arrow', 'normal', 'bow'], sling: ['arrow', 'normal', 'bow'], thrown: ['arrow', 'normal', 'bow'],
  crossbow: ['bolt', 'crossbow', 'crossbow'], staff: ['magic', 'normal', 'staff'], magic_staff: ['magic', 'normal', 'staff'],
};
const HEAVY_NAME = /大|戦槌|ハンマー|両手|槌矛の大/;
const A_INFO = { clothes: 'cloth', robe: 'cloth', leatherarmor: 'leather', chainmail: 'chain', platearmor: 'plate', scalearmor: 'scale' };
const SUB_A = { armor_cloth: 'cloth', magic_armor: 'cloth', armor_leather: 'leather', tribal_armor: 'leather', armor_chain: 'chain', armor_plate: 'plate', armor_scale: 'scale', clothes: 'cloth', outfit: 'cloth' };
const _wCache = new Map();
export function weaponInfo(e) {
  if (!isHuman(e)) {
    const r = RACE[e.sp];
    return { type: r?.atk || MON_ATK[SPECIES[e.sp]?.shape] || 'blunt', spd: 'normal', reach: null, heavy: false, el: r?.el0 || null };
  }
  const w = e.eq?.weapon;
  const id = w?.id || '_fist';
  let v = _wCache.get(id);
  if (!v) {
    let row = W_INFO[id];
    if (!row && id !== '_fist') { const m = MAT.get(id); row = m ? SUB_W[m.sub] : null; if (row && m && HEAVY_NAME.test(m.name || '') && row[1] === 'normal' && row[0] !== 'arrow') row = [row[0], 'heavy', row[2], row[3], row[4]]; }
    if (!row) row = ['blunt', id === '_fist' ? 'fast' : 'normal'];
    v = { type: row[0], spd: row[1] || 'normal', reach: row[2] || null, heavy: row[1] === 'heavy' || !!row[3], el: row[4] || null };
    _wCache.set(id, v);
  }
  return v;
}
export function armorOf(t) {
  if (!isHuman(t)) return RACE[t.sp]?.skin || (SPECIES[t.sp]?.shape === 'lizard' ? 'scale' : 'leather');
  const a = t.eq?.armor;
  if (!a) return 'cloth';
  return A_INFO[a.id] || SUB_A[MAT.get(a.id)?.sub] || 'leather';
}
const MON_ATK = { quad: 'slash', biped: 'slash', bird: 'pierce', spider: 'pierce', blob: 'blunt', lizard: 'pierce', dragon: 'slash', fish: 'blunt', bug: 'pierce' };

// ---------- 種族の表（研究の4-3） ----------
const Wk = TUNE.WEAK, Rs = TUNE.RESIST;
const UNDEAD_IMM = ['poison', 'sleep', 'conf', 'bleed'];
const ALL_IMM = ['poison', 'bleed', 'para', 'sleep', 'conf', 'fear', 'curse', 'stun'];
const RACE = {
  slime: { skin: 'cloth', el: { fire: Wk }, ph: { slash: Rs, pierce: Rs }, imm: ['poison', 'bleed'], atk: 'blunt' },
  bigslime: { skin: 'cloth', el: { fire: Wk, water: Rs }, ph: { slash: Rs, pierce: Rs }, imm: ['poison', 'bleed'], atk: 'blunt' },
  kingslime: { skin: 'cloth', el: { fire: Wk, water: Rs }, ph: { slash: Rs, pierce: Rs }, imm: ['poison', 'sleep', 'bleed'], give: { stun: 0.1 }, atk: 'blunt', big: 1 },
  unicorn: { skin: 'leather', el: { light: 0, dark: Wk }, imm: ['poison'], atk: 'pierce' },
  golem: { skin: 'plate', el: { water: Wk, earth: Rs }, ph: { slash: Rs, pierce: Rs, blunt: Wk }, imm: [...UNDEAD_IMM, 'fear'], atk: 'blunt', big: 1, mindless: 1 },
  goblin: { skin: 'cloth', el: { fire: Wk } },
  hobgoblin: { skin: 'leather', el: { fire: Wk } },
  goblinlord: { skin: 'chain', imm: ['fear'], lord: 1, big: 1 },
  orc: { skin: 'leather', el: { light: Wk }, atk: 'blunt', cruel: 1 },
  orcking: { skin: 'chain', el: { light: Wk }, imm: ['fear'], roar: 1, cruel: 1, atk: 'blunt', lord: 1, big: 1 },
  skeleton: { skin: 'plate', el: { light: TUNE.HOLY_UNDEAD, dark: 0 }, ph: { slash: Rs, pierce: Rs, blunt: Wk }, imm: UNDEAD_IMM, mindless: 1 },
  skelknight: { skin: 'plate', el: { light: TUNE.HOLY_UNDEAD, dark: 0 }, ph: { slash: Rs, pierce: Rs, blunt: Wk }, imm: UNDEAD_IMM, mindless: 1 },
  lich: { skin: 'cloth', el: { fire: Wk, light: TUNE.HOLY_UNDEAD, dark: 0 }, ph: { slash: Rs, pierce: Rs }, imm: [...UNDEAD_IMM, 'fear'], give: { curse: 0.12, conf: 0.15 }, atk: 'magic', el0: 'dark', big: 1 },
  mummy: { skin: 'cloth', el: { fire: Wk, light: TUNE.HOLY_UNDEAD, dark: 0 }, imm: UNDEAD_IMM, give: { curse: 0.05, sleep: 0.06 }, atk: 'blunt', mindless: 1 },
  pharaoh: { skin: 'cloth', el: { fire: Wk, light: TUNE.HOLY_UNDEAD, dark: 0 }, ph: { slash: Rs, pierce: Rs, blunt: Rs }, imm: [...UNDEAD_IMM, 'fear'], give: { curse: 0.12, conf: 0.15 }, atk: 'magic', el0: 'dark', big: 1 },
  spider: { skin: 'leather', el: { fire: Wk }, imm: ['poison'], give: { poison: 0.3 }, atk: 'pierce' },
  arachne: { skin: 'leather', el: { fire: Wk }, imm: ['poison'], give: { poison: 0.35, para: 0.2 }, atk: 'pierce', big: 1 },
  wyvern: { skin: 'scale', el: { wind: Rs, earth: Wk }, give: { poison: 0.15 }, atk: 'pierce', big: 1, fly: 1, tail: 1 },
  dragon: { skin: 'scale', el: { fire: 0, water: Wk }, imm: ['poison', 'sleep', 'fear'], roar: 1, breath: 1, big: 1, fly: 1, tail: 1, boss: 1 },
  imp: { skin: 'cloth', el: { fire: Rs, light: Wk, dark: Rs } },
  demonsoldier: { skin: 'chain', el: { fire: Rs, light: Wk, dark: Rs }, cruel: 1 },
  demongeneral: { skin: 'plate', el: { fire: Rs, light: Wk, dark: 0 }, imm: ['fear'], roar: 1, cruel: 1, big: 1, lord: 1, boss: 1 },
  demonlord: { skin: 'plate', el: { fire: Rs, water: Rs, wind: Rs, earth: Rs, dark: 0 }, imm: ALL_IMM, roar: 1, give: { curse: 0.1 }, atk: 'magic', el0: 'dark', big: 1, boss: 1 },
  wolf: { skin: 'leather', el: { fire: Wk }, give: { bleed: 0.12 }, atk: 'pierce' },
  bear: { skin: 'leather', el: { fire: Wk }, give: { bleed: 0.12 }, big: 1 },
  polarbear: { skin: 'leather', el: { fire: Wk, water: Rs }, give: { bleed: 0.12 }, big: 1 },
  tiger: { skin: 'leather', el: { fire: Wk }, give: { bleed: 0.12 } },
  boar: { skin: 'leather', give: { stun: 0.1 }, atk: 'pierce' },
  croc: { skin: 'scale', ph: { slash: Rs }, give: { bleed: 0.12 }, atk: 'pierce' },
  scorpion: { skin: 'leather', el: { fire: Wk }, give: { poison: 0.35, para: 0.1 }, atk: 'pierce' },
  snake: { skin: 'cloth', el: { fire: Wk }, give: { poison: 0.3 }, atk: 'pierce' },
  whale: { skin: 'leather', big: 1 },
};
export const ELEM_NAME = { fire: '火', water: '水', wind: '風', earth: '土', light: '光', dark: '闇' };
export const SS_NAME = { poison: '毒', bleed: '出血', para: '麻痺', sleep: '眠り', conf: '混乱', fear: '恐怖', curse: '呪い', stun: '気絶', fall: '転倒' };
const SS_COL = { poison: '#9be15d', bleed: '#ff5a5a', para: '#ffe14a', sleep: '#8fb8ff', conf: '#e28bff', fear: '#b0b0c8', curse: '#b25cff', stun: '#ffffff', fall: '#ffb040' };
const BODY_SS = new Set(['poison', 'bleed', 'para', 'stun']);
const HOLD_SS = ['sleep', 'para', 'stun', 'fall'];
export const INJ_NAME = { head: '頭の傷', arm: '腕の骨折', leg: '脚の骨折', cut: '深い切り傷' };
const PART_NAME = { head: '頭', wing: '翼', leg: '脚', tail: '尾', body: '胴' };
const PART_HIT = { head: -0.15, wing: -0.1, leg: 0, tail: -0.05, body: 0.1 };
const PART_MUL = { head: 1.3, wing: 1.0, leg: 0.9, tail: 0.9, body: 0.8 };
const PART_SP = new Set(['dragon', 'wyvern', 'golem', 'kingslime', 'orcking', 'goblinlord', 'arachne', 'lich', 'pharaoh', 'demongeneral', 'demonlord', 'bear', 'polarbear', 'whale']);
const TAIL_LOOT = { dragon: ['scale', 2], wyvern: ['scale', 1] };
// 後遺症は health.js の古傷（足・片目・腕・顔）に合わせる（心の声・会話・老後の備えがそのまま使える）
const INJ_SCAR = { head: ['eye', 'face'], arm: ['arm'], leg: ['limp'], cut: ['face', 'arm'] };

const LAWFUL = new Set(['guard', 'knight', 'soldier', 'jailer', 'watchman', 'royalguard', 'general', 'paladin']);
const DRILLED = new Set(['knight', 'soldier', 'royalguard', 'paladin', 'general', 'guard', 'gatekeeper']);
const CASTER_JOB = { wizard: 'wizard', courtmage: 'wizard', sage: 'sorcerer', cleric: 'priest', priest: 'priest' };
const isHuman = (e) => typeof e.id === 'number';
const aliveH = (m) => !!m && m.deathYear == null && m.hp > 0;
const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const nm = (e) => (isHuman(e) ? e.given : e.name || SPECIES[e.sp]?.name || '魔物');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const st10 = (e, k) => (isHuman(e) ? (typeof e.stats?.[k] === 'number' ? e.stats[k] : 10) : 10 + (e.lv || 1) * 0.5);
const isDown = (p) => !!p?.cb?.down;

// ---------- 状態 ----------
const STAT_KEYS = ['poison', 'bleed', 'para', 'sleep', 'conf', 'fear', 'curse', 'stun', 'statusAll', 'cured', 'down', 'saved', 'savedBy', 'bledOut', 'finished', 'carried',
  'injury', 'scar', 'treat', 'treatFee', 'curseLifted', 'curseFee', 'antidote', 'antidoteUsed', 'rout', 'routMon', 'routHuman', 'retreat', 'questDrop', 'fleeDeath',
  'tired', 'swap', 'cast', 'fizzle', 'aoe', 'heal', 'revive', 'sleepSpell', 'ward', 'bash', 'partBreak', 'stagger', 'breath', 'sweep', 'roar', 'back', 'surroundWait',
  'firstStrike', 'weak', 'resist', 'immune', 'confHit', 'parry'];
export function combatState(sim) {
  const S = sim.S;
  if (!S.combat) S.combat = { v: 1, stats: {} };
  const X = S.combat;
  if (!X.stats) X.stats = {};
  for (const k of STAT_KEYS) if (X.stats[k] == null) X.stats[k] = 0;
  return X;
}
const ST = (sim) => combatState(sim).stats;
function cbOf(e) { return e.cb || (e.cb = {}); }
const ssOn = (sim, e, k) => (e.cb?.ss?.[k] || 0) > sim.S.t;

function canLog(sim, e, key, gap = TUNE.LOG_GAP) {
  const t = sim.S.t;
  const c = cbOf(e);
  c.lg = c.lg || {};
  if (c.lg[key] != null && t - c.lg[key] < gap) return false;
  c.lg[key] = t; return true;
}
function say(sim, e, text) { if (e && isHuman(e) && e.hp > 0 && sim.isWatched?.(e)) sim.events.push({ type: 'say', id: e.id, text }); }
function tag(sim, e, text, col) { if (e && (!isHuman(e) || sim.isWatched?.(e) || sim.focus)) sim.events.push({ type: 'cbtag', id: e.id, text, col }); }

// ---------- この歩で戦っている者（1歩に1回だけ作る） ----------
function fighters(sim) {
  const S = sim.S;
  if (sim._cbF && sim._cbF.t === S.t && sim._cbF.c === S.creatures) return sim._cbF;
  const humans = [], mons = [];
  for (const p of sim.living()) if (p.fight && p.hp > 0) humans.push(p);
  const src = sim._fighting instanceof Set ? sim._fighting : Object.values(S.creatures);
  for (const c of src) if (c.fight && c.hp > 0 && S.creatures[c.id] === c) mons.push(c);
  sim._cbF = { t: S.t, c: S.creatures, humans, mons, eng: null };
  return sim._cbF;
}
// 近接で t を殴っている者（先に来た順）
function engagedOn(sim, t) {
  const F = fighters(sim);
  if (!F.eng) {
    F.eng = new Map();
    for (const list of [F.humans, F.mons]) for (const f of list) {
      const tg = f.fight?.target;
      if (tg == null) continue;
      const o = sim.entity(tg);
      if (!o || dist(f, o) > 1.6 || rangedNow(sim, f)) continue;
      let a = F.eng.get(tg); if (!a) F.eng.set(tg, a = []);
      a.push(f);
    }
  }
  return F.eng.get(t.id) || [];
}
const rangedNow = (sim, e) => isHuman(e) && (['arrow', 'bolt', 'magic'].includes(weaponInfo(e).type) || ['wizard', 'sorcerer', 'archer', 'priest'].includes(e.advClass));

// ---------- 職業（冒険者の12職と、それ以外の戦う職） ----------
function clsOf(sim, e) {
  if (!isHuman(e)) return null;
  return e.advClass || advClassOf(sim, e) || null;
}
function casterKind(sim, e) {
  if (!isHuman(e)) return null;
  const c = clsOf(sim, e);
  if (c === 'wizard' || c === 'sorcerer' || c === 'priest') return c;
  if (c) return null;
  return CASTER_JOB[e.job] || null;
}
function elemOfAttack(sim, e, t) {
  if (!isHuman(e)) return weaponInfo(e).el ? { el: weaponInfo(e).el, full: true } : null;
  const ck = casterKind(sim, e);
  const r = RACE[t.sp];
  const pick = (a, b) => { const va = r?.el?.[a] ?? 1, vb = r?.el?.[b] ?? 1; return va >= vb ? a : b; };
  if (ck && !e.cb?.bashNow) {
    if (ck === 'wizard') return { el: pick('fire', 'wind'), full: true };
    if (ck === 'sorcerer') return { el: pick('water', 'earth'), full: true };
    if (ck === 'priest') return { el: 'light', full: true };
  }
  const c = clsOf(sim, e);
  const w = weaponInfo(e);
  if (w.el) return { el: w.el, full: false };
  if (c === 'paladin' || c === 'hero' || e.job === 'paladin') return { el: 'light', full: false };
  return null;
}

// ---------- 息（⑥） ----------
function staOf(sim, e) {
  const c = cbOf(e), t = sim.S.t;
  if (c.sta == null) { c.sta = TUNE.STA; c.staT = t; }
  if (t - (c.staT ?? t) > 1.5) c.sta = Math.min(TUNE.STA, c.sta + (t - c.staT) * TUNE.STA_OUT);
  c.staT = t;
  return c.sta;
}
function useSta(sim, e, amt) {
  staOf(sim, e);
  const vit = st10(e, 'vit');
  e.cb.sta = clamp(e.cb.sta - amt * (1 - (vit - 10) * 0.02), 0, TUNE.STA);
}
function restSta(sim, e) { staOf(sim, e); e.cb.sta = Math.min(TUNE.STA, e.cb.sta + TUNE.STA_REST); }

// ---------- 魔力（⑧） ----------
export function mpMax(sim, e) {
  const ck = casterKind(sim, e);
  if (!ck && clsOf(sim, e) !== 'paladin') return 0;
  const k = ck === 'priest' ? 'wis' : 'int';
  return Math.round(10 + st10(e, k) * 2 + (e.lv || 1));
}
function mpOf(sim, e) {
  const max = mpMax(sim, e);
  if (!max) return 0;
  const c = cbOf(e), t = sim.S.t;
  if (c.mp == null) { c.mp = max; c.mpT = t; }
  c.mp = Math.min(max, c.mp + Math.max(0, t - (c.mpT ?? t)) / 60 * TUNE.MP_REGEN);
  c.mpT = t;
  return c.mp;
}
function useMp(sim, e, n) { if (mpOf(sim, e) < n) return false; e.cb.mp -= n; return true; }

// ---------- 士気（⑦） ----------
// 同じ一族（長と手下が同じ群れになる）
const KIN = { hobgoblin: 'goblin', goblinlord: 'goblin', orcking: 'orc', skelknight: 'skeleton', lich: 'skeleton', pharaoh: 'mummy', arachne: 'spider', bigslime: 'slime', kingslime: 'slime', demonsoldier: 'imp', demongeneral: 'imp' };
function gkey(sim, e) {
  if (isHuman(e)) {
    if (e.party != null && sim.S.advParties?.[e.party] && !sim.S.advParties[e.party].gone) return 'P' + e.party;
    if (e.mission && ['march', 'crusade', 'defend'].includes(e.mission.type)) return 'M' + (e.mission.id ?? e.s);
    return 'H' + e.id;
  }
  if (e.band) return 'B' + e.band;
  if (e.general) return 'G' + e.general;
  // 群れの記録のない魔物・獣は、そばにいる同じ種族（16マス四方）をひとつの群れとみなす（オオカミの群れなど）
  return 'S' + (KIN[e.sp] || e.sp) + '@' + Math.floor(e.pos.x / 16) + ',' + Math.floor(e.pos.z / 16);
}
function morOf(sim, key) {
  const M = sim._cbMor || (sim._cbMor = new Map());
  const t = sim.S.t;
  let m = M.get(key);
  if (!m || t - m.t > TUNE.MOR_FORGET) { m = { ev: 0, sit: 0, t, chk: -99, routed: false }; M.set(key, m); return m; }
  const dt = t - m.t;
  if (dt > 0) { m.ev = m.ev > 0 ? Math.max(0, m.ev - dt * TUNE.MOR_RECOVER) : Math.min(0, m.ev + dt * TUNE.MOR_RECOVER); m.t = t; }
  return m;
}
const morale = (sim, e) => { const m = morOf(sim, gkey(sim, e)); return 100 + m.ev + m.sit; };
function morMul(sim, e) {
  if (!isHuman(e)) { const k = SPECIES[e.sp]?.kind; return k === 'wild' ? 1.2 : k === 'demon' ? 0.8 : 0.9; }
  const courage = e.values?.courage ?? 0.5;
  let bond = 0;
  if (e.party != null) bond = sim.S.advParties?.[e.party]?.bond?.[e.id] || 0;
  const job = DRILLED.has(e.job) ? 0.7 : e.job === 'militia' ? 1.3 : 1;
  return (1.3 - courage * 0.6) * (1 - bond / 400) * job;
}
function moraleHit(sim, e, delta) {
  if (!e) return;
  const m = morOf(sim, gkey(sim, e));
  m.ev += delta < 0 ? delta * morMul(sim, e) : delta;
}
function isLeader(sim, e) {
  if (isHuman(e)) { const pt = e.party != null ? sim.S.advParties?.[e.party] : null; return !!pt && pt.leader === e.id && pt.members.length >= 2; }
  if (e.band) return sim.S.bands?.[e.band]?.leader === e.id;
  return !!RACE[e.sp]?.lord;
}
const cannotRout = (e) => !isHuman(e) && (SPECIES[e.sp]?.boss || RACE[e.sp]?.boss || RACE[e.sp]?.mindless || e.named || e.sp === 'dragon');

// 味方と敵（そばで戦っている者）
function sideNear(sim, e, r) {
  const F = fighters(sim);
  const mine = isHuman(e) ? F.humans : F.mons, theirs = isHuman(e) ? F.mons : F.humans;
  const key = gkey(sim, e);
  const allies = [], foes = [];
  for (const o of mine) if (o !== e && Math.abs(o.pos.x - e.pos.x) <= r && Math.abs(o.pos.z - e.pos.z) <= r && gkey(sim, o) === key) allies.push(o);
  for (const o of theirs) if (Math.abs(o.pos.x - e.pos.x) <= r && Math.abs(o.pos.z - e.pos.z) <= r) foes.push(o);
  return { allies, foes };
}
// 5手ごとに形勢を見直す（群れ・パーティ）
function moraleCheck(sim, e) {
  const key = gkey(sim, e);
  const m = morOf(sim, key);
  if (sim.S.t - m.chk < TUNE.CHECK_EVERY) return m;
  m.chk = sim.S.t;
  const { allies, foes } = sideNear(sim, e, 8);
  const us = [e, ...allies];
  let sit = 0;
  if (foes.length >= us.length * 2 && foes.length >= 2) sit += TUNE.MOR_OUTNUM;
  const hpAvg = us.reduce((s, x) => s + x.hp / Math.max(1, x.maxhp), 0) / us.length;
  if (hpAvg <= 0.5) sit += TUNE.MOR_HURT;
  if (us.some((x) => isLeader(sim, x))) sit += TUNE.MOR_LEAD_NEAR;
  if (isHuman(e) && us.some((x) => ['hero', 'paladin'].includes(x.advClass) || x.job === 'paladin')) sit += TUNE.MOR_HERO;
  if (isHuman(e) && us.some((x) => x.job === 'general')) sit += 15;
  if (!isHuman(e) && us.some((x) => x.sp === 'goblinlord')) sit += TUNE.MOR_LORD;
  m.sit = sit;
  return m;
}

// ---------- 逃げる ----------
function fleeHuman(sim, p, why) {
  const S = sim.S, R = sim.rng;
  p.fight = null;
  // 整った撤退（しんがりが食い止める・起こされて下がる）なら、魔物はたいてい追わない。
  // 追うのは潰走（背中を見せて散り散りに逃げる）のときと、足の速い獣がときどき。追うのは8マスまで（monsterTurn）
  for (const c of fighters(sim).mons) {
    if (c.fight?.target !== p.id) continue;
    const fast = (SPECIES[c.sp]?.speed || 1) >= TUNE.CHASE_SPEED;
    if (why === 'rout' ? R.chance(TUNE.CHASE_ROUT) : (fast && R.chance(TUNE.CHASE_FAST))) continue;
    c.fight = null; c.calm = S.t + 60;
  }
  p.needs.survival = 0;
  const c = cbOf(p); c.fled = S.t;
  if (why === 'rout') c.rout = S.t + TUNE.ROUT_WIN;
  p.path = null;
  try { sim.startAction(p, { type: 'flee', place: sim.placeFor(p, 'home'), dur: 60 }); } catch { p.action = null; }
}
function fleeMon(sim, c, why) {
  const S = sim.S;
  c.fight = null;
  c.fleeUntil = S.t + 120; c.raid = null; c.path = null;
  if (c.home) c.goal = { x: c.home.x, z: c.home.z, run: true, path: true };
  const x = cbOf(c); x.fled = S.t;
  if (why === 'rout') x.rout = S.t + TUNE.ROUT_WIN;
}

// ---------- 状態異常（⑤） ----------
export function immuneTo(e, k) {
  if (isHuman(e)) return false;
  const r = RACE[e.sp];
  if (r?.imm?.includes(k)) return true;
  if (SPECIES[e.sp]?.undead && UNDEAD_IMM.includes(k)) return true;
  if (k === 'fear' && (SPECIES[e.sp]?.boss || e.named)) return true;
  return false;
}
function resistP(sim, e, k, base) {
  let p = base;
  if (k === 'fear' && isHuman(e)) {
    if (clsOf(sim, e) === 'hero') return 0;
    p -= ((e.values?.courage ?? 0.5) - 0.5) * 0.6;
    p -= (st10(e, 'wis') - 10) * TUNE.RESIST_STEP * 0.5;
  } else p -= (st10(e, BODY_SS.has(k) ? 'vit' : 'wis') - 10) * TUNE.RESIST_STEP;
  return clamp(p, 0.02, 0.95);
}
export function inflict(sim, src, t, k, base, opt = {}) {
  if (!t || t.hp <= 0 || immuneTo(t, k)) { if (t && immuneTo(t, k)) ST(sim).immune++; return false; }
  if (!opt.sure && !sim.rng.chance(resistP(sim, t, k, base))) return false;
  const S = sim.S, c = cbOf(t);
  if (k === 'curse') { if (c.curse) return false; c.curse = { day: sim.today, by: src ? nm(src) : null }; }
  else {
    c.ss = c.ss || {};
    let dur = opt.dur ?? TUNE.DUR[k];
    if (k === 'fear' && isHuman(t) && heroNear(sim, t)) dur = Math.ceil(dur / 2);
    c.ss[k] = Math.max(c.ss[k] || 0, S.t + dur);
    if (k === 'poison' && isHuman(t)) c.psn = sim.today;
    (sim._cbAff || (sim._cbAff = new Set())).add(t);
  }
  ST(sim)[k] = (ST(sim)[k] || 0) + 1; ST(sim).statusAll++;
  tag(sim, t, SS_NAME[k], SS_COL[k]);
  if (isHuman(t) && canLog(sim, t, 'ss' + k, 60) && (sim.isWatched?.(t) || k === 'curse' || t.party != null)) {
    const sn = src ? nm(src) : '';
    const what = { poison: `${sn ? sn + 'の' : ''}毒に侵された`, bleed: `${sn ? sn + 'に' : ''}深く切られ、血が止まらない`, para: `${sn ? sn + 'の攻撃で' : ''}体がしびれて動けなくなった`, sleep: `${sn ? sn + 'の術で' : ''}眠りに落ちた`, conf: `${sn ? sn + 'の術で' : ''}頭が混乱した`, fear: `${sn ? sn + 'を前に' : ''}恐怖で足がすくんだ`, curse: `${sn ? sn + 'に' : ''}呪いをかけられた`, stun: `${sn ? sn + 'の一撃で' : ''}気を失った`, fall: '倒れた' }[k];
    sim.pushLog(`${t.given}が${what}。`, 'event', [t.id], t.pos);
    if (k === 'curse') sim.remember(t, `${src ? nm(src) + 'に' : ''}呪いをかけられた。教会で解いてもらわねば`, { emo: -0.7, imp: 0.7, k: 'fight' });
  }
  if (isHuman(t)) say(sim, t, { poison: 'うっ…毒か…！', bleed: '血が…止まらない…', para: '体が…動かない…！', conf: 'どっちが敵だ…？', fear: 'ひっ…！', curse: 'なんだ、この寒気は…', stun: '……' }[k] || '');
  return true;
}
function heroNear(sim, t) {
  const F = fighters(sim);
  for (const o of F.humans) if (o !== t && (o.advClass === 'hero' || o.advClass === 'paladin' || o.job === 'paladin') && dist(o, t) <= 4) return true;
  return false;
}
function cureAll(sim, t, list = ['poison', 'para', 'conf', 'sleep']) {
  const c = t.cb; if (!c?.ss) return false;
  let any = false;
  for (const k of list) if ((c.ss[k] || 0) > sim.S.t) { delete c.ss[k]; any = true; }
  return any;
}

// ---------- 瀕死（⑨） ----------
function downSet(sim) { return sim._cbDown || (sim._cbDown = new Set()); }
function causeOf(sim, killer, victim) {
  if (!killer) return 'monster';
  if (!isHuman(killer)) return SPECIES[killer.sp]?.kind === 'demon' ? 'demon' : SPECIES[killer.sp]?.monster ? 'monster' : 'beast';
  if (LAWFUL.has(killer.job) && LAWFUL.has(victim.job)) return 'war';
  if (victim.bandit || sim.S.wanted?.[victim.id]) return 'justice';
  return 'murder';
}
function goDown(sim, by, p) {
  const S = sim.S, c = cbOf(p);
  if (c.down) return;
  c.down = { until: S.t + TUNE.DOWN_HANDS, by: by ? by.id : null, cause: causeOf(sim, by, p), t0: S.t, save: TUNE.DOWN_SAVE + ({ plate: 0.1, scale: 0.1, chain: 0.05 }[armorOf(p)] || 0) + (st10(p, 'vit') - 10) * 0.01 };
  p.hp = 0;
  p._hurt = true;   // 瀕死のあいだの後遺症は、大けがの決まり（下の injure と combatDaily）で決める。health.js の古傷の判定と二重にしない
  p.fight = { target: by ? by.id : -1, cd: 1e9, lethal: true, down: true };
  p.action = null; p.path = null; p.talk = null;
  delete c.cast;
  downSet(sim).add(p);
  ST(sim).down++;
  sim.events.push({ type: 'cbtag', id: p.id, text: '瀕死', col: '#ff4040' });
  const important = p.party != null || sim.isWatched?.(p) || JOBS[p.job]?.combat;
  if (important) sim.pushLog(`${sim.fullName(p)}が${by ? nm(by) + 'の一撃で' : ''}倒れ、瀕死になった。手当てが間に合わなければ命はない。`, 'event', [p.id], p.pos);
  // 仲間が倒れた：群れの士気が下がる。倒した側は、長を倒せば勢いづく
  moraleHit(sim, p, isLeader(sim, p) ? TUNE.MOR_LEADER : TUNE.MOR_ALLY);
  if (by && isLeader(sim, p)) moraleHit(sim, by, TUNE.MOR_KILL_LEAD);
  // 仲間の叫び（見ている人がいれば）
  const pt = p.party != null ? S.advParties?.[p.party] : null;
  const mate = pt ? pt.members.map((id) => S.people[id]).find((m) => aliveH(m) && m !== p && dist(m, p) < 6) : null;
  if (mate) say(sim, mate, sim.rng.pick([`${p.given}！ しっかりしろ！`, `${p.given}が倒れた！`, `誰か、${p.given}の手当てを！`]));
}
function bleedOut(sim, p) {
  const S = sim.S, d = p.cb.down;
  downSet(sim).delete(p);
  if (p.deathYear != null) { delete p.cb.down; return; }
  const killer = d.by != null ? sim.entity(d.by) : null;
  const fleeing = (p.cb.fled || -1e9) > d.t0 - 30;
  delete p.cb.down;
  p.fight = null;
  ST(sim).bledOut++;
  if (fleeing && (p.party != null || JOBS[p.job]?.combat)) ST(sim).fleeDeath++;
  if (p.party != null || sim.isWatched?.(p) || JOBS[p.job]?.combat) sim.pushLog(`瀕死の${sim.fullName(p)}は、手当てが間に合わず息を引き取った。`, 'death', [p.id], p.pos);
  if (killer && (isHuman(killer) ? killer.deathYear == null : S.creatures[killer.id] === killer && killer.hp > 0)) resolveKill(sim, killer, p);
  else sim.die(p, d.cause || 'monster', killer || null);
}
function revive(sim, p, helper, how) {
  const S = sim.S, d = p.cb?.down;
  if (!d) return;
  downSet(sim).delete(p);
  delete p.cb.down;
  p.hp = Math.max(1, Math.round(p.maxhp * TUNE.REVIVE_FRAC));
  p.fight = null; p.action = null; p.path = null;
  cbOf(p).wd = S.t + 30;   // 30分は戦いから退く（魔物はほかの相手を狙う）
  fleeHuman(sim, p, 'withdraw');   // 戦いから退いて、休みに帰る
  ST(sim).saved++;
  if (helper && helper !== p) ST(sim).savedBy++;
  const hname = helper ? helper.given : '';
  sim.events.push({ type: 'cbtag', id: p.id, text: '助かった', col: '#7dff9a' });
  sim.remember(p, helper ? `瀕死のところを${hname}に${how}で助けられた` : `瀕死の淵から、なんとか持ち直した`, { emo: 0.6, imp: 0.9, about: helper ? [helper.id] : [], k: 'fight' });
  if (helper) {
    sim.relMut(p, helper).a = Math.min(100, sim.rel(p, helper).a + 20);
    sim.remember(helper, `倒れた${p.given}を${how}で助けた`, { emo: 0.5, imp: 0.6, about: [p.id], k: 'help' });
    say(sim, helper, sim.rng.pick([`${p.given}、目を開けろ！`, 'もう大丈夫だ、しっかりしろ', '死ぬな、まだ早いぞ！']));
  }
  sim.pushLog(`瀕死の${p.given}が、${helper ? `${hname}の${how}で` : ''}一命をとりとめた。`, 'event', helper ? [p.id, helper.id] : [p.id], p.pos);
}
// 止めを刺される（残酷な魔物）
function finishBlow(sim, e, p) {
  const d = p.cb.down;
  if (sim.rng.chance(clamp(d.save, 0, TUNE.DOWN_SAVE_MAX))) { d.save -= TUNE.DOWN_SAVE_STEP; sim.events.push({ type: 'hit', id: p.id, dmg: 0 }); return false; }
  downSet(sim).delete(p);
  delete p.cb.down; p.fight = null;
  ST(sim).finished++;
  if ((p.cb.fled || -1e9) > d.t0 - 30 && (p.party != null || JOBS[p.job]?.combat)) ST(sim).fleeDeath++;
  sim.pushLog(`${nm(e)}が、倒れていた${p.given}に止めを刺した。`, 'death', [p.id], p.pos);
  resolveKill(sim, e, p);
  return true;
}

// ---------- 大けが（⑨） ----------
function injure(sim, e, t, dmg) {
  const R = sim.rng, c = cbOf(t);
  if (c.inj) return;
  const k = R.weighted(Object.keys(TUNE.INJ_W), (x) => TUNE.INJ_W[x]);
  const [a, b] = TUNE.INJ_DAYS[k];
  c.inj = { k, until: sim.today + R.int(a, b), day: sim.today, by: nm(e), doc: false };
  ST(sim).injury++;
  if (k === 'head') inflict(sim, e, t, 'stun', 1, { sure: true });
  if (k === 'cut') inflict(sim, e, t, 'bleed', 1, { sure: true });
  tag(sim, t, INJ_NAME[k], '#ff9a5a');
  sim.remember(t, `${nm(e)}との戦いで${INJ_NAME[k]}を負った`, { emo: -0.7, imp: 0.8, k: 'fight' });
  if (t.party != null || sim.isWatched?.(t) || JOBS[t.job]?.combat) sim.pushLog(`${t.given}が${nm(e)}の一撃で${INJ_NAME[k]}を負った。`, 'event', [t.id], t.pos);
}

// ---------- 大きな魔物の部位（⑩） ----------
const hasParts = (c) => !isHuman(c) && (PART_SP.has(c.sp) || c.named);
function partsOf(c) {
  const r = RACE[c.sp] || {}, sh = SPECIES[c.sp]?.shape;
  const out = ['head', 'body'];
  if (r.fly || SPECIES[c.sp]?.flies) out.push('wing');
  if (sh !== 'blob' && sh !== 'fish') out.push('leg');
  if (r.tail) out.push('tail');
  return out;
}
function choosePart(sim, e, c) {
  const ps = partsOf(c), brk = c.cb?.brk || {};
  const cls = clsOf(sim, e), w = weaponInfo(e);
  const want = (p) => ps.includes(p) && !brk[p];
  let p = null;
  if ((cls === 'archer' || w.type === 'arrow' || w.type === 'bolt') && want('wing')) p = 'wing';
  else if (['swordsman', 'fighter', 'squire'].includes(cls) || e.job === 'knight' || e.job === 'soldier') p = want('leg') ? 'leg' : null;
  else if (cls === 'monk' || w.type === 'blunt') p = want('head') ? 'head' : null;
  else if ((cls === 'thief' || cls === 'bandit') && want('tail')) p = 'tail';
  if (!p) p = sim.rng.pick(ps.filter((x) => !brk[x]).concat(['body']));
  if (p !== 'body' && !sim.rng.chance(1 + (p === 'wing' && (cls === 'archer' || w.type === 'arrow') ? 0 : PART_HIT[p]))) p = 'body';
  return p;
}
function hitPart(sim, e, c, dmg) {
  const x = cbOf(c);
  const p = x.aim || 'body';
  delete x.aim;
  // ひるみ：最大体力の10％ごとに1手
  x.stg = (x.stg || 0) + dmg;
  const boss = !!(RACE[c.sp]?.boss || SPECIES[c.sp]?.boss || c.named);
  if (x.stg >= c.maxhp * (boss ? TUNE.STAGGER_BOSS : TUNE.STAGGER) && (x.stgImm || 0) <= sim.S.t) {
    x.stg = 0; x.stgImm = sim.S.t + 1 + TUNE.STAGGER_IMMUNE;
    inflict(sim, e, c, 'stun', 1, { sure: true }); ST(sim).stagger++;
  }
  if (p === 'body') return;
  x.pt = x.pt || {}; x.brk = x.brk || {};
  if (x.brk[p]) return;
  x.pt[p] = (x.pt[p] || 0) + dmg;
  if (x.pt[p] < c.maxhp * TUNE.PART_BREAK) return;
  x.brk[p] = sim.today + 1;   // 0日目でも「壊れた」と分かるように
  ST(sim).partBreak++;
  tag(sim, c, `${PART_NAME[p]}を破壊`, '#ffd24a');
  const who = isHuman(e) ? e.given : nm(e);
  const txt = { head: `頭を打ち砕き、${nm(c)}がよろめいた`, wing: `翼を裂き、${nm(c)}はもう飛べない`, leg: `脚を砕き、${nm(c)}がどうと倒れた`, tail: `尾を斬り落とした` }[p];
  sim.pushLog(`${who}が${nm(c)}の${txt}。`, 'event', isHuman(e) ? [e.id] : [], c.pos);
  if (p === 'head') inflict(sim, e, c, 'stun', 1, { sure: true, dur: boss ? TUNE.STUN_BOSS : 3 });
  if (p === 'leg') inflict(sim, e, c, 'fall', 1, { sure: true, dur: boss ? TUNE.STUN_BOSS : TUNE.DUR.fall });
  if (p === 'tail' && isHuman(e)) {
    const [id, n] = TAIL_LOOT[c.sp] || [({ bear: 'hide', polarbear: 'hide', arachne: 'silk', golem: 'magicstone' }[c.sp] || 'bone'), 1];
    if (ITEMS[id]) { const it = makeItem(id); it.n = n; addItem(e, it); sim.remember(e, `${nm(c)}の尾を斬り落とし、${ITEMS[id].name}を手に入れた`, { emo: 0.6, imp: 0.6, k: 'hunt' }); }
  }
  if (isHuman(e)) { e.fame = (e.fame || 0) + 1; say(sim, e, sim.rng.pick([`${PART_NAME[p]}をやったぞ！`, '今だ、畳みかけろ！', '効いてるぞ！'])); }
}

// ---------- 本体から：間合い・速さ・足止め ----------
export function combatReach(sim, e, base) {
  if (!isHuman(e)) return base;
  const w = weaponInfo(e);
  let r = w.reach ? TUNE.REACH[w.reach] || base : base;
  if (w.reach === 'staff' && !casterKind(sim, e)) r = base;             // 杖を持つだけの人は近づいて殴る
  if (w.reach === 'staff' && casterKind(sim, e) && mpOf(sim, e) < TUNE.MP_BOLT) r = 1.3;   // 魔力が切れたら近づいて杖で殴る
  return Math.max(base, r);
}
// 眠り・麻痺・気絶・転倒・息切れの休みのあいだは、動かず打たない
export function combatHeld(sim, e) {
  const c = e.cb;
  if (!c) return false;
  if (c.down) return true;
  const t = sim.S.t;
  if (c.ss) for (const k of HOLD_SS) if ((c.ss[k] || 0) > t) return true;
  if ((c.rest || 0) > t) return true;
  return false;
}
export function combatSpeed(sim, e, t) {
  const f = e.fight;
  if (f && !f.cbI) {
    f.cbI = 1;
    if (isHuman(e)) {
      const w = weaponInfo(e), cls = clsOf(sim, e);
      if (w.reach === 'spear' || w.reach === 'bow' || cls === 'thief' || cls === 'archer') { ST(sim).firstStrike++; return TUNE.FIRST_CD; }
    }
  }
  if (!isHuman(e)) return 1;
  const w = weaponInfo(e);
  return TUNE.SPD[w.spd] || 1;
}

// ---------- 本体から：一手の判断（第5部の判断の順番）。false＝この手はほかのことをした／人・魔物＝狙いを変えた／null＝ふつうに攻める ----------
export function combatTurn(sim, e, t) {
  const S = sim.S;
  combatState(sim);
  if (!t) return null;
  if (!isHuman(e) && !isHuman(t)) return null;          // 獣どうしの争い（食物連鎖）はそのまま
  if (isHuman(e) && isHuman(t) && !e.fight?.lethal) return null;   // 殴り合いはそのまま
  return isHuman(e) ? humanTurn(sim, e, t) : monsterTurn(sim, e, t);
}

function humanTurn(sim, e, t) {
  const S = sim.S, R = sim.rng, c = cbOf(e);
  const cls = clsOf(sim, e);
  delete c.bashNow;
  // 0) 撤退の最中：しんがりの盾役は時間まで踏みとどまる
  if (c.rear && S.t >= c.rear) { delete c.rear; fleeHuman(sim, e, 'retreat'); return false; }
  // 1) パーティの判断：5手ごとにリーダーが形勢を見る（回復役が手当てで手いっぱいでも見落とさないよう、先に）
  if (!c.rear && !isHuman(t) && partyCheck(sim, e)) return false;
  // 2) 生き延びる：潰走・息切れ・呪われた傷・毒
  if (!c.rear) {
    const m = moraleCheck(sim, e);
    if (100 + m.ev + m.sit < TUNE.MOR_ROUT && !(cls === 'hero')) {
      if (!m.routed) {
        m.routed = true; ST(sim).rout++; ST(sim).routHuman++;
        sim.pushLog(`${e.party != null ? `パーティー「${S.advParties[e.party]?.name}」` : e.given}は総崩れになり、背を向けて逃げ出した。`, 'event', [e.id], e.pos);
      }
      say(sim, e, R.pick(['もうだめだ、逃げろ！', '退け、退けーっ！', 'かなわない…！']));
      fleeHuman(sim, e, 'rout');
      return false;
    }
  }
  const sta = staOf(sim, e);
  if (sta < TUNE.STA_OUT_OF) {
    // 息が切れた：一歩下がって息をつく。元気な前衛がいれば入れ替わる
    c.rest = S.t + TUNE.STA_REST_HANDS;
    restSta(sim, e);
    ST(sim).tired++;
    stepBack(sim, e, t);
    tag(sim, e, '息切れ', '#c8c8c8');
    const fresh = sideNear(sim, e, 4).allies.find((o) => o.hp > o.maxhp * 0.5 && staOf(sim, o) >= TUNE.STA_SWAP && !rangedNow(sim, o) && !isDown(o));
    if (fresh && !isHuman(t) && t.fight?.target === e.id) {
      t.fight.target = fresh.id;
      if (!fresh.fight || fresh.fight.target !== t.id) startFight(sim, fresh, t);
      ST(sim).swap++;
      say(sim, fresh, R.pick([`${e.given}、下がれ！ 代わる！`, '交代だ！', '後ろで息を整えろ！']));
      if (canLog(sim, e, 'swap')) sim.pushLog(`息の切れた${e.given}が下がり、${fresh.given}が前に出て入れ替わった。`, 'event', [e.id, fresh.id], e.pos);
    } else say(sim, e, 'はぁ…はぁ…');
    return false;
  }
  if (e.hp < e.maxhp * 0.35 && c.curse && countItem(e, 'potion') > 0) {   // 呪われていると薬の効きが半分
    takeItem(e, 'potion', 1); e.hp = Math.min(e.maxhp, e.hp + Math.round(ITEMS.potion.heal / 2)); sim.events.push({ type: 'heal', id: e.id }); return false;
  }
  if (ssOn(sim, e, 'poison') && countItem(e, 'antidote') > 0 && e.hp < e.maxhp * 0.7) {
    takeItem(e, 'antidote', 1); cureAll(sim, e, ['poison']); ST(sim).antidoteUsed++; ST(sim).cured++; tag(sim, e, '解毒', '#9be15d'); return false;
  }
  // 混乱：30％で近くの誰か（味方も）を打つ
  if (ssOn(sim, e, 'conf') && R.chance(TUNE.CONF_P)) {
    const near = sideNear(sim, e, 2);
    const v = R.pick([...near.allies, ...near.foes, t]);
    if (v && v !== e) { const d = Math.max(1, Math.round(e.atk * 0.5)); v.hp = Math.max(1, v.hp - d); sim.events.push({ type: 'hit', id: v.id, dmg: d }); ST(sim).confHit++; say(sim, e, 'うわああ！'); }
    return false;
  }
  // 3) 仲間の危機：回復役は瀕死・深手・毒の仲間を。誰でも、そばの瀕死の仲間を薬か手当てで
  if (helpAllies(sim, e, cls)) { restSta(sim, e); return false; }
  // 4) 位置取り：盗賊・シーフは背後へ回る
  if (!isHuman(t) && (cls === 'bandit' || cls === 'thief') && t.fight && t.fight.target !== e.id) {
    const o = sim.entity(t.fight.target);
    if (o && !behindOf(sim, e, t) && R.chance(0.6)) {
      const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z, n = Math.hypot(dx, dz) || 1;
      nudgeTo(sim, e, t.pos.x + dx / n * 0.9, t.pos.z + dz / n * 0.9);
    }
  }
  // 囲み：一人を同時に殴れるのは4人まで。あふれた者は、手の空いた敵を探すか待つ
  if (!rangedNow(sim, e) && dist(e, t) <= 1.6) {
    const eng = engagedOn(sim, t);
    const i = eng.indexOf(e);
    if (i >= TUNE.MAX_MELEE || (i < 0 && eng.length >= TUNE.MAX_MELEE)) {
      const alt = sideNear(sim, e, 4).foes.filter((o) => o !== t && engagedOn(sim, o).length < TUNE.MAX_MELEE).sort((a, b) => dist(a, e) - dist(b, e))[0];
      ST(sim).surroundWait++;
      if (alt) { e.fight.target = alt.id; return false; }
      return false;
    }
  }
  // 5) 術者の手：強い魔法（範囲）・眠り・結界。攻めの魔法は魔力4、詠唱中に打たれると止まる
  const ck = casterKind(sim, e);
  if (ck && !isHuman(t)) {
    if (c.cast && S.t >= c.cast.at) {   // 2手の詠唱が終わった：範囲の魔法を放つ
      const cast = c.cast; delete c.cast;
      if ((c.hitT || -1e9) > cast.from && R.chance(fizzleP(e))) { ST(sim).fizzle++; tag(sim, e, '詠唱中断', '#c8c8c8'); say(sim, e, 'くっ、詠唱が…！'); return false; }
      bigSpell(sim, e, sim.entity(cast.tgt) || t);
      return false;
    }
    if (c.cast) return false;
    if (ck === 'wizard' && mpOf(sim, e) >= TUNE.MP_BIG && R.chance(TUNE.BIG_P)) {
      const n = sideNear(sim, e, 8).foes.filter((o) => dist(o, t) <= TUNE.BIG_R).length;
      if (n >= 2) { useMp(sim, e, TUNE.MP_BIG); c.cast = { at: S.t + 1, from: S.t, tgt: t.id }; ST(sim).cast++; say(sim, e, R.pick(['炎よ、渦を巻け…！', '大気よ、刃となれ…！'])); tag(sim, e, '詠唱', '#8fd8ff'); return false; }
    }
    if (ck === 'sorcerer') {
      if (mpOf(sim, e) >= TUNE.MP_WARD && (c.wardCd || 0) <= S.t && sideNear(sim, e, 8).foes.length >= 2) {
        useMp(sim, e, TUNE.MP_WARD); c.wardCd = S.t + TUNE.WARD_CD; ST(sim).ward++;
        for (const o of [e, ...sideNear(sim, e, 3).allies]) cbOf(o).ward = S.t + TUNE.WARD_HANDS;
        say(sim, e, '守りの結界よ！'); tag(sim, e, '結界', '#8fd8ff');
        return false;
      }
      if (mpOf(sim, e) >= TUNE.MP_SLEEP && !immuneTo(t, 'sleep') && !ssOn(sim, t, 'sleep') && R.chance(TUNE.SLEEP_P) && !RACE[t.sp]?.boss) {
        useMp(sim, e, TUNE.MP_SLEEP); ST(sim).sleepSpell++;
        say(sim, e, '眠りの霧よ…');
        inflict(sim, e, t, 'sleep', 0.75);
        return false;
      }
    }
    if (mpOf(sim, e) >= TUNE.MP_BOLT) {
      useMp(sim, e, TUNE.MP_BOLT);
      if ((c.hitT || -1e9) > S.t - 1 && R.chance(fizzleP(e))) { ST(sim).fizzle++; tag(sim, e, '詠唱中断', '#c8c8c8'); return false; }
    } else { c.bashNow = true; ST(sim).bash++; }
  }
  // 聖騎士：1日3回、深手の仲間を少し癒す
  if (cls === 'paladin' || e.job === 'paladin') {
    const day = sim.today;
    if (c.phD !== day) { c.phD = day; c.phN = 0; }
    if (c.phN < TUNE.PALADIN_HEALS) {
      const w = [e, ...sideNear(sim, e, 4).allies].filter((o) => o.hp < o.maxhp * 0.4).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
      if (w) { c.phN++; healAmt(sim, w, w.maxhp * TUNE.PALADIN_HEAL); ST(sim).heal++; say(sim, e, '光よ、癒しを！'); return false; }
    }
  }
  useSta(sim, e, (weaponInfo(e).heavy ? TUNE.STA_HEAVY : TUNE.STA_HAND) * formationArmorStrain(e, TUNE.STA_ARMOR[armorOf(e)] || 1));   // 筋力が高いほど重い鎧で疲れにくい（formation.js）
  // 大きな魔物：狙う部位を決める
  if (hasParts(t)) cbOf(t).aim = choosePart(sim, e, t);
  return null;
}
const fizzleP = (e) => clamp(TUNE.FIZZLE - ((e.skills?.['攻撃魔法'] || 0) / 4) / 100, 0.1, TUNE.FIZZLE);
function healAmt(sim, o, amt) {
  if (o.cb?.curse) amt /= 2;
  o.hp = Math.min(o.maxhp, o.hp + Math.round(amt));
  sim.events.push({ type: 'heal', id: o.id });
}
// 回復役と仲間の手当て
function helpAllies(sim, e, cls) {
  const S = sim.S, R = sim.rng;
  const ck = casterKind(sim, e);
  const healer = ck === 'priest';
  // そばで倒れている人（同じパーティ、または同じ敵と戦っている味方）
  let downed = null, bd = healer ? 6 : 2;
  for (const p of downSet(sim)) {
    if (p === e || p.deathYear != null || !p.cb?.down) continue;
    if ((p.inside ?? null) !== (e.inside ?? null)) continue;
    const d = dist(p, e);
    if (d > bd) continue;
    if (!(p.party != null && p.party === e.party) && !(p.bandit === e.bandit)) continue;
    downed = p; bd = d;
  }
  if (downed) {
    if (healer && useMp(sim, e, TUNE.MP_REVIVE)) { revive(sim, downed, e, '祈り'); ST(sim).revive++; return true; }
    if (countItem(e, 'potion') > 0) { takeItem(e, 'potion', 1); revive(sim, downed, e, '回復薬'); return true; }
    const bond = e.party != null ? (S.advParties?.[e.party]?.bond?.[e.id] || 0) : 0;
    if (dist(downed, e) <= 1.5 && (bond >= 20 || sim.rel(e, downed).a >= 20 || downed.party === e.party)) {
      const c = cbOf(e);
      if (c.aid === downed.id && S.t - (c.aidT || 0) >= TUNE.HELP_HANDS - 0.01) { delete c.aid; revive(sim, downed, e, '手当て'); return true; }
      if (c.aid !== downed.id) { c.aid = downed.id; c.aidT = S.t; }
      return true;
    }
  }
  if (!healer) return false;
  // 回復役：深手の仲間を癒す → 毒・麻痺・混乱を治す
  const mates = [e, ...sideNear(sim, e, 6).allies];
  const hurt = mates.filter((o) => o.hp < o.maxhp * 0.5).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
  if (hurt && useMp(sim, e, TUNE.MP_HEAL)) {
    healAmt(sim, hurt, hurt.maxhp * TUNE.HEAL_FRAC); ST(sim).heal++;
    if (R.chance(0.3)) say(sim, e, R.pick(['癒しの光よ…', `${hurt === e ? '' : hurt.given + '、'}今治す！`]));
    return true;
  }
  const sick = mates.find((o) => ['poison', 'para', 'conf'].some((k) => ssOn(sim, o, k)));
  if (sick && useMp(sim, e, TUNE.MP_CURE)) { cureAll(sim, sick, ['poison', 'para', 'conf']); ST(sim).cured++; tag(sim, sick, '浄化', '#fff3a0'); return true; }
  return false;
}
// 範囲の魔法（魔法使いの強い魔法）
function bigSpell(sim, e, t) {
  if (!t || t.hp <= 0) return;
  const foes = sideNear(sim, e, 10).foes.filter((o) => dist(o, t) <= TUNE.BIG_R);
  if (!foes.includes(t) && t.hp > 0) foes.push(t);
  ST(sim).aoe++;
  const el = elemOfAttack(sim, e, t)?.el || 'fire';
  say(sim, e, el === 'fire' ? '燃え尽きろ！' : '吹き荒れろ！');
  sim.pushLog(`${e.given}の${ELEM_NAME[el]}の大魔法が炸裂し、${foes.length}体の魔物を巻き込んだ。`, 'event', [e.id], t.pos);
  for (const o of foes) {
    if (o.hp <= 0 || isHuman(o)) continue;
    let d = Math.max(1, Math.round(e.atk * sim.rng.range(0.8, 1.1) - (o.def || 0) * 0.5 * TUNE.ARMOR.magic[armorOf(o)]));
    d = Math.round(d * elemMul(sim, o, el, true));
    if (d <= 0) continue;
    o.hp -= d;
    sim.events.push({ type: 'hit', id: o.id, dmg: d });
    if (o.hp <= 0) { if (!combatFall(sim, e, o)) resolveKill(sim, e, o); }
    else if (!o.fight) startFight(sim, o, e);
  }
}
// パーティの判断（⑫）
function partyCheck(sim, e) {
  const S = sim.S;
  const pt = e.party != null ? S.advParties?.[e.party] : null;
  const c = cbOf(e);
  let crew;
  if (pt && !pt.gone) {
    const L = S.people[pt.leader];
    const leaderUp = aliveH(L) && !isDown(L) && L.fight;
    if (leaderUp && L !== e) return false;          // リーダーが見る
    if ((pt._cbChk || -99) > S.t - TUNE.CHECK_EVERY) return false;
    pt._cbChk = S.t;
    crew = pt.members.map((id) => S.people[id]).filter((m) => m && m.deathYear == null && dist(m, e) <= 10);
  } else {
    const strongF = beastsStrongFoe(sim, e);   // 手ごわい魔物には、冒険者でなくても形勢を見る（beasts.js）
    if (!(e.advClass || e.quest) && !strongF) return false;     // 一人の冒険者だけ
    if ((c.chk || -99) > S.t - TUNE.CHECK_EVERY) return false;
    c.chk = S.t;
    crew = strongF ? beastsCrew(sim, e) : [e];   // そばで一緒に戦っている人も数える
  }
  const up = crew.filter((m) => m.hp > 0 && !isDown(m));
  const downs = crew.filter(isDown);
  // 敵：いま戦っている魔物と、そばで逃げずにいる敵意の魔物（相手が倒れて手の空いた魔物も数える）
  const foes = sideNear(sim, e, 8).foes;
  if (sim._cgrid) for (const o of around(sim._cgrid, e.pos.x, e.pos.z, 8)) {
    if (o.hp > 0 && o.hostile && !o.dormant && !((o.fleeUntil || 0) > S.t) && !foes.includes(o) && sim.S.creatures[o.id] === o && Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) <= 8) foes.push(o);
  }
  if (!foes.length) return false;
  const ours = crewPower(up), theirs = foes.reduce((s, f) => s + powerC(f), 0);
  const ratio = ours / Math.max(1, theirs);
  const lostTo = foes.some((f) => lostBefore(sim, crew, f.sp));
  const healers = up.filter((m) => casterKind(sim, m) === 'priest');
  const canHeal = healers.some((h) => mpOf(sim, h) >= TUNE.MP_HEAL) || up.some((m) => countItem(m, 'potion') > 0);
  const hpAvg = up.reduce((s, m) => s + m.hp / m.maxhp, 0) / Math.max(1, up.length);
  const mor = morale(sim, e);
  let why = null;
  const needB = beastsNeed(sim, foes);   // 手ごわい魔物：相手と同じだけの力がなければ退く（beasts.js）
  if (ratio < Math.max(lostTo ? TUNE.RETREAT_RATIO_LOST : TUNE.RETREAT_RATIO, needB)) { why = '敵が強すぎる'; if (needB) beastsNoteRetreat(sim); }
  else if (downs.length && !canHeal) why = '倒れた仲間を治す手立てがない';
  else if (crew.length >= 2 && downs.length * 2 >= crew.length) why = '仲間の半分が倒れた';
  else if (healers.length && !canHeal && hpAvg <= TUNE.RETREAT_HP) why = '癒しの力が尽きた';
  else if (mor < TUNE.MOR_ROUT) why = '皆の心が折れかけている';
  if (!why) return false;
  retreatParty(sim, e, crew, foes, why, pt);
  return true;
}
function retreatParty(sim, e, crew, foes, why, pt) {
  const S = sim.S, R = sim.rng;
  ST(sim).retreat++;
  const top = foes.slice().sort((a, b) => powerC(b) - powerC(a))[0];
  const sp = top?.sp;
  // 瀕死の仲間は、絆の深い者が背負って退く
  for (const d of crew.filter(isDown)) {
    const carrier = crew.filter((m) => m.hp > 0 && !isDown(m) && ((pt?.bond?.[m.id] || 0) >= TUNE.CARRY_BOND || sim.rel(m, d).a >= TUNE.CARRY_BOND)).sort((a, b) => sim.rel(b, d).a - sim.rel(a, d).a)[0];
    if (carrier) { revive(sim, d, carrier, '背負って退くこと'); ST(sim).carried++; }
  }
  // 盾役がしんがり。後衛とけが人から先に退く
  for (const m of crew) {
    if (m.hp <= 0 || isDown(m) || m.deathYear != null) continue;
    const c = cbOf(m);
    c.lost = c.lost || {};
    if (sp) c.lost[sp] = sim.today;
    if (tacticsRole(sim, m) === 'tank' && m.fight && m.hp > m.maxhp * 0.3) { c.rear = S.t + TUNE.REAR_HANDS; say(sim, m, R.pick(['ここはおれが食い止める、先に行け！', 'しんがりは任せろ！'])); continue; }
    fleeHuman(sim, m, 'retreat');
    sim.remember(m, `${top ? nm(top) : '魔物'}に敵わず、${why}ので退いた`, { emo: -0.5, imp: 0.7, k: 'fight' });
  }
  if (pt) { pt.cbLost = pt.cbLost || {}; if (sp) pt.cbLost[sp] = sim.today; }
  say(sim, e, R.pick(['退くぞ！ 今は分が悪い！', '撤退だ！ 生きて帰るのが先だ！', '引け、引けっ！']));
  sim.pushLog(`${pt ? `パーティー「${pt.name}」` : e.given}は${top ? nm(top) + 'との戦いで' : ''}${why}と見て、撤退した${pt && crew.some((m) => m.cb?.rear) ? '（盾役がしんがりを務めた）' : ''}。`, 'event', crew.map((m) => m.id), e.pos);
  // 負けた相手の討伐依頼は、力がそろうまで引き受けない（いったん断る）
  const qid = crew.map((m) => m.quest).find((x) => x != null);
  const q = qid != null ? (S.quests || []).find((x) => x.id === qid) : null;
  if (q && q.state === 'taken' && q.type === 'hunt' && S.creatures[q.target]?.sp === sp) {
    q.state = 'failed'; q.closed = sim.today; q.rank = Math.min(6, (q.rank || 0) + 1);
    const tc = S.creatures[q.target]; if (tc) tc.quested = false;
    for (const id of q.takenBy || []) { const m = S.people[id]; if (m && m.quest === q.id) { m.quest = null; sim.remember(m, `「${q.title}」は今の力では無理だと、ギルドに断りを入れた`, { emo: -0.4, imp: 0.5, k: 'quest' }); } }
    q.takenBy = []; q.party = null;
    ST(sim).questDrop++;
  }
}
function lostBefore(sim, crew, sp) {
  if (!sp) return false;
  for (const m of crew) { const d = m.cb?.lost?.[sp]; if (d != null && sim.today - d <= TUNE.LOST_DAYS) return true; }
  return false;
}

function monsterTurn(sim, e, t) {
  const S = sim.S, R = sim.rng, x = cbOf(e), r = RACE[e.sp] || {};
  // 潰走（親玉・心を持たない魔物は崩れない）
  if (!cannotRout(e)) {
    const m = moraleCheck(sim, e);
    if (100 + m.ev + m.sit < TUNE.MOR_ROUT) {
      if (!m.routed) {
        m.routed = true; ST(sim).rout++; ST(sim).routMon++;
        const band = e.band ? S.bands?.[e.band] : null;
        sim.pushLog(`${band?.name ? `${band.name}の${nm(e)}たち` : `${SPECIES[KIN[e.sp] || e.sp]?.name || nm(e)}の群れ`}は、士気がくじけて総崩れになり、背を向けて逃げ出した。`, 'event', [], e.pos);
      }
      tag(sim, e, '潰走', '#ffd24a');
      fleeMon(sim, e, 'rout');
      return false;
    }
  }
  // 起こされて退いた人より、まだ戦っている相手を狙う
  if (isHuman(t) && (t.cb?.wd || 0) > S.t) {
    const alt = sideNear(sim, e, 6).foes.filter((o) => !((o.cb?.wd || 0) > S.t)).sort((a, b) => dist(a, e) - dist(b, e))[0];
    if (alt) { e.fight.target = alt.id; if (!alt.fight) startFight(sim, alt, e); return dist(alt, e) <= 1.3 ? alt : false; }
  }
  // 逃げる人を追うのは8マスまで。群れの長が倒れていれば追わない
  if (isHuman(t) && (t.cb?.fled || -1e9) > S.t - 30 && !t.fight) {
    if (!x.pur || x.pur.id !== t.id) x.pur = { id: t.id, x: e.pos.x, z: e.pos.z };
    const band = e.band ? S.bands?.[e.band] : null;
    const leadGone = band && !S.creatures[band.leader];
    if (Math.hypot(e.pos.x - x.pur.x, e.pos.z - x.pur.z) > TUNE.PURSUE || leadGone) { e.fight = null; delete x.pur; return false; }
  }
  // 残酷な魔物は、倒れた人に止めを刺しに行く
  if (r.cruel && R.chance(TUNE.FINISH_P)) {
    for (const p of downSet(sim)) {
      if (p.deathYear != null || !p.cb?.down || dist(p, e) > 1.5 || (p.inside ?? null) !== (t.inside ?? null)) continue;
      finishBlow(sim, e, p);
      return false;
    }
  }
  // 大きな魔物の技：咆哮（恐怖）・火の息（範囲）・尾の薙ぎ払い
  const brk = x.brk || {};
  if (r.roar && !brk.head && (x.roarT == null || S.t - x.roarT >= TUNE.ROAR_EVERY)) {
    x.roarT = S.t; ST(sim).roar++;
    let n = 0;
    for (const h of fighters(sim).humans) if (dist(h, e) <= TUNE.ROAR_R && inflict(sim, e, h, 'fear', 0.6)) n++;
    tag(sim, e, '咆哮', '#ff8a4a');
    if (n && canLog(sim, e, 'roar', 60)) sim.pushLog(`${nm(e)}の咆哮に、${n}人が恐怖で足をすくませた。`, 'event', [], e.pos);
    return false;
  }
  if (r.breath && !brk.head && (x.brT == null || S.t - x.brT >= TUNE.BREATH_EVERY) && isHuman(t)) {
    x.brT = S.t; ST(sim).breath++;
    const hit = fighters(sim).humans.filter((h) => h.hp > 0 && dist(h, t) <= TUNE.BREATH_R);
    if (canLog(sim, e, 'breath', 30)) sim.pushLog(`${nm(e)}が炎の息を吐き、${hit.length}人を炎が包んだ。`, 'event', hit.map((h) => h.id), t.pos);
    for (const h of hit) {
      let d = Math.max(1, Math.round(e.atk * TUNE.BREATH_MUL * R.range(0.8, 1.2) - (h.def || 0) * 0.5 * TUNE.ARMOR.magic[armorOf(h)]));
      if (h.cb?.ward > S.t) d = Math.round(d * TUNE.WARD_MUL);
      h.hp -= d; sim.events.push({ type: 'hit', id: h.id, dmg: d });
      if (h.hp <= 0) goDown(sim, e, h);
    }
    return false;
  }
  if (r.tail && !brk.tail && (x.swT == null || S.t - x.swT >= TUNE.SWEEP_EVERY)) {
    const hit = fighters(sim).humans.filter((h) => h !== t && h.hp > 0 && dist(h, e) <= TUNE.SWEEP_R);
    if (hit.length) {
      x.swT = S.t; ST(sim).sweep++;
      tag(sim, e, '薙ぎ払い', '#ff8a4a');
      for (const h of hit) {
        const d = Math.max(1, Math.round(e.atk * TUNE.SWEEP_MUL - (h.def || 0) * 0.5 * TUNE.ARMOR.blunt[armorOf(h)]));
        h.hp -= d; sim.events.push({ type: 'hit', id: h.id, dmg: d });
        if (h.hp <= 0) goDown(sim, e, h);
        else if (e.sp === 'wyvern') inflict(sim, e, h, 'poison', 0.15);
      }
      return false;
    }
  }
  // 囲み（魔物の側も4体まで）
  if (isHuman(t) && dist(e, t) <= 1.6) {
    const eng = engagedOn(sim, t);
    const i = eng.indexOf(e);
    if (i >= TUNE.MAX_MELEE) {
      const alt = sideNear(sim, e, 4).foes.filter((o) => o !== t && engagedOn(sim, o).length < TUNE.MAX_MELEE)[0];
      ST(sim).surroundWait++;
      if (alt) { e.fight.target = alt.id; if (!alt.fight) startFight(sim, alt, e); }
      return false;
    }
  }
  return null;
}
// 背後か（相手が別の者と向き合っていて、その反対側から）
function behindOf(sim, e, t) {
  if (!t.fight || t.fight.target === e.id) return false;
  const o = sim.entity(t.fight.target);
  if (!o || o === e || !o.pos) return false;
  const ax = o.pos.x - t.pos.x, az = o.pos.z - t.pos.z, bx = e.pos.x - t.pos.x, bz = e.pos.z - t.pos.z;
  const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
  return (ax * bx + az * bz) / (la * lb) < TUNE.BACK_ANGLE;
}
// 相手から一歩下がる
function stepBack(sim, e, t) {
  const dx = e.pos.x - t.pos.x, dz = e.pos.z - t.pos.z, n = Math.hypot(dx, dz) || 1;
  nudgeTo(sim, e, e.pos.x + (dx / n) * 0.8, e.pos.z + (dz / n) * 0.8);
}
function nudgeTo(sim, e, x, z) {
  const tl = tileAt(sim.S.world, Math.round(x), Math.round(z));
  if (tl == null || !walkable(tl) || tl === T.BLD) return false;
  e.pos.x = x; e.pos.z = z; return true;
}

// ---------- 本体から：鎧の効き（守りに掛ける倍率） ----------
export function combatArmorMul(sim, e, t) {
  if (!isHuman(e) && !isHuman(t)) return 1;
  let type = weaponInfo(e).type;
  if (isHuman(e) && e.cb?.bashNow) type = 'blunt';
  else if (isHuman(e) && type === 'magic' && !casterKind(sim, e)) type = 'blunt';
  else if (isHuman(e) && casterKind(sim, e) && !isHuman(t)) type = 'magic';   // 術者が魔物に放つ魔法（魔力が切れた手は bashNow で杖）
  return TUNE.ARMOR[type]?.[armorOf(t)] ?? 1;
}
// ---------- 本体から：かわされた一撃を当て直す（背後・逃げる背中・息切れ・囲み） ----------
export function combatNoDodge(sim, e, t, d0) {
  if ((t.cb?.rout || 0) > sim.S.t) return d0;
  if (behindOf(sim, e, t)) return d0;
  if (isHuman(t) && (t.cb?.sta ?? 100) < TUNE.STA_LOW && sim.rng.chance(0.5)) return d0;
  const eng = engagedOn(sim, t);
  if (eng.length >= 2 && eng.indexOf(e) > 0 && sim.rng.chance(TUNE.SURROUND_HIT)) return d0;
  if ((t.cb?.ss?.fall || 0) > sim.S.t) return d0;
  return 0;
}

// ---------- 本体から：一撃の大きさ（属性・息・状態・背後・部位・結界 など） ----------
function elemMul(sim, t, el, full) {
  if (isHuman(t) || !el) return 1;
  const r = RACE[t.sp];
  let v = r?.el?.[el];
  if (v == null) v = (el === 'light' && SPECIES[t.sp]?.undead) ? TUNE.HOLY_UNDEAD : 1;
  if (!full && v < 1) return 1;          // 武器に宿る属性は、効かない相手には物理だけ
  return v;
}
export function combatDamage(sim, e, t, dmg) {
  if (dmg <= 0) return dmg;
  if (!isHuman(e) && !isHuman(t)) return dmg;
  if (isHuman(e) && isHuman(t) && !e.fight?.lethal) return dmg;
  const S = sim.S, R = sim.rng;
  let d = dmg;
  const ec = e.cb, tc = t.cb;
  const w = weaponInfo(e);
  // 攻める側の具合
  if (ec?.bashNow) d *= TUNE.BASH_MUL;
  if (ec?.ss) {
    if ((ec.ss.poison || 0) > S.t) d *= TUNE.POISON_ATK;
    if ((ec.ss.fear || 0) > S.t) d *= TUNE.FEAR_ATK;
  }
  if (isHuman(e)) {
    if ((ec?.sta ?? 100) < TUNE.STA_LOW) d *= TUNE.STA_LOW_ATK;
    if (ec?.inj?.k === 'arm') d *= TUNE.INJ_ARM_ATK;
    if (w.reach === 'spear' && dist(e, t) < TUNE.SPEAR_CLOSE) d *= TUNE.SPEAR_CLOSE_MUL;
    if (w.heavy && isHuman(t) && t.eq?.shield) d *= TUNE.HEAVY_VS_SHIELD;
  }
  // 属性と、種族ごとの物理の効き
  if (!isHuman(t)) {
    const ea = elemOfAttack(sim, e, t);
    if (ea) {
      const m = elemMul(sim, t, ea.el, ea.full);
      if (m > 1) ST(sim).weak++; else if (m < 1) ST(sim).resist++;
      if (m === 0) { tag(sim, t, '無効', '#c8c8c8'); ST(sim).immune++; return 0; }
      d *= m;
      if (m > 1 && isHuman(e) && canLog(sim, e, 'weak', 60) && sim.isWatched?.(e)) tag(sim, t, `${ELEM_NAME[ea.el]}が弱点`, '#ffd24a');
    }
    if (!ea?.full) {
      const ph = RACE[t.sp]?.ph?.[ec?.bashNow ? 'blunt' : w.type === 'arrow' || w.type === 'bolt' ? 'pierce' : w.type];
      if (ph) d *= ph;
    }
  }
  // 守る側の具合
  if (tc) {
    if ((tc.rout || 0) > S.t) d *= TUNE.ROUT_MUL;
    if ((tc.ss?.fall || 0) > S.t) d *= TUNE.FALL_MUL;
    if ((tc.ward || 0) > S.t) d *= TUNE.WARD_MUL;
  }
  // 背後から
  if (behindOf(sim, e, t)) {
    const cls = clsOf(sim, e);
    const rogue = cls === 'thief' || cls === 'bandit' || e.job === 'thief';
    d *= rogue ? TUNE.BACK_ROGUE : TUNE.BACK_MUL;
    if (rogue && R.chance(0.12)) d *= 1.5;                   // 急所の確率を倍に（advclass.js の12％に上乗せ）
    ST(sim).back++;
    const m = morOf(sim, gkey(sim, t));
    if ((m.flankT || -99) <= S.t - TUNE.CHECK_EVERY) { m.flankT = S.t; moraleHit(sim, t, TUNE.MOR_FLANK); }
  }
  // 受け流し・身のこなし（剣士・武闘家が守る側）
  if (isHuman(t)) {
    const tcls = clsOf(sim, t);
    if ((tcls === 'swordsman' && R.chance(0.05)) || (tcls === 'monk' && R.chance(0.08))) { ST(sim).parry++; tag(sim, t, tcls === 'monk' ? 'かわした' : '受け流し', '#ffffff'); return 0; }
    // 盾は矢に強い
    if ((w.type === 'arrow' || w.type === 'bolt') && t.eq?.shield && R.chance(TUNE.SHIELD_ARROW_P)) d *= TUNE.SHIELD_ARROW_MUL;
  }
  // 飛ぶ大きな魔物：翼が無事なら、近接の一撃をかわすことがある
  if (!isHuman(t) && (RACE[t.sp]?.fly) && !t.cb?.brk?.wing && !rangedNow(sim, e) && R.chance(TUNE.FLY_DODGE)) return 0;
  // 大きな魔物の部位
  if (hasParts(t) && isHuman(e)) d *= PART_MUL[t.cb?.aim || 'body'] || 1;
  return Math.max(1, Math.round(d));
}

// ---------- 本体から：一撃のあと（状態異常・大けが・詠唱の中断・眠りから覚める・部位・ひるみ） ----------
export function combatAfterHit(sim, e, t, dmg) {
  if (!dmg || dmg <= 0) return;
  if (!isHuman(e) && !isHuman(t)) return;
  if (isHuman(e) && isHuman(t) && !e.fight?.lethal) return;
  const S = sim.S, R = sim.rng;
  const tc = cbOf(t);
  tc.hitT = S.t;
  if (tc.ss?.sleep > S.t) { delete tc.ss.sleep; tag(sim, t, '目覚めた', '#ffffff'); }
  // 詠唱中の範囲魔法は、打たれると止まることがある
  if (tc.cast && R.chance(fizzleP(t))) { delete tc.cast; ST(sim).fizzle++; tag(sim, t, '詠唱中断', '#c8c8c8'); }
  if (!isHuman(e)) {
    // 魔物が人に：種族ごとの状態異常
    const give = RACE[e.sp]?.give;
    if (give && t.hp > 0) for (const k in give) if (inflict(sim, e, t, k, give[k])) break;
  } else {
    const w = weaponInfo(e), cls = clsOf(sim, e);
    if (w.type === 'slash' && t.hp > 0) {
      const p = TUNE.BLEED_SLASH + (cls === 'swordsman' || cls === 'bandit' ? TUNE.BLEED_CLASS : 0);
      if (R.chance(p)) inflict(sim, e, t, 'bleed', 1);
    }
    if (cls === 'monk' && t.hp > 0 && R.chance(TUNE.MONK_STUN)) inflict(sim, e, t, 'stun', 1, { sure: !isHuman(t) && !immuneTo(t, 'stun') });
    if (hasParts(t)) hitPart(sim, e, t, dmg);
  }
  // 大けが：一撃で最大体力の30％以上
  if (isHuman(t) && dmg >= t.maxhp * TUNE.INJ_HIT && R.chance(TUNE.INJ_P)) injure(sim, e, t, dmg);
}

// ---------- 本体から：倒れたとき。人は瀕死になる（true を返したら resolveKill しない）。魔物は士気だけ動かす ----------
export function combatFall(sim, e, t) {
  combatState(sim);
  if (isHuman(t)) {
    if (t.deathYear != null) return false;
    if (isHuman(e) && !e.fight?.lethal) return false;
    goDown(sim, e, t);
    return true;
  }
  // 魔物・獣が倒れた：群れの士気が下がる。長なら大きく。倒した側は勢いづく
  if (isHuman(e) || e.band) {
    moraleHit(sim, t, isLeader(sim, t) ? TUNE.MOR_LEADER : TUNE.MOR_ALLY);
    if (isLeader(sim, t)) moraleHit(sim, e, TUNE.MOR_KILL_LEAD);
  }
  return false;
}

// ---------- 毎歩：瀕死の人・状態異常の経過（1分に1回） ----------
export function combatStep(sim, dt) {
  const S = sim.S;
  if (!sim._cbInit) {
    sim._cbInit = true;
    const D = downSet(sim), A = sim._cbAff || (sim._cbAff = new Set());
    for (const p of sim.living()) { if (p.cb?.down) D.add(p); if (p.cb?.ss) A.add(p); }
    for (const c of Object.values(S.creatures)) if (c.cb?.ss) A.add(c);
  }
  const D = sim._cbDown;
  if (D && D.size) for (const p of D) {
    if (p.deathYear != null || !p.cb?.down) { D.delete(p); continue; }
    if (p.hp > 0) p.hp = 0;
    if (!p.fight?.down) p.fight = { target: p.cb.down.by ?? -1, cd: 1e9, lethal: true, down: true };
  }
  sim._cbTick = (sim._cbTick || 0) + dt;
  if (sim._cbTick < 1) return;
  const steps = sim._cbTick; sim._cbTick = 0;
  // 瀕死の人：時間切れなら死ぬ。敵がそばにいなければ、仲間や通りがかりの人が手当てする
  if (D && D.size) for (const p of [...D]) {
    const d = p.cb?.down;
    if (!d || p.deathYear != null) { D.delete(p); continue; }
    if (S.t >= d.until) { bleedOut(sim, p); continue; }
    // 捕まるべき者（お尋ね者・盗賊）は、そばの衛兵が捕らえる
    if (S.wanted?.[p.id] || p.bandit) {
      const g = fighters(sim).humans.concat(sim.living().filter((q) => LAWFUL.has(q.job) && q.hp > 0 && !q.fight && dist(q, p) < 4)).find((q) => LAWFUL.has(q.job) && dist(q, p) < 4 && q.hp > 0);
      if (g) { downSet(sim).delete(p); delete p.cb.down; p.hp = 1; p.fight = null; try { arrest(sim, g, p); } catch { /* 牢のない町 */ } continue; }
    }
    const foeNear = fighters(sim).mons.some((c) => Math.abs(c.pos.x - p.pos.x) < 3 && Math.abs(c.pos.z - p.pos.z) < 3);
    if (foeNear) continue;
    const h = d.helper != null ? S.people[d.helper] : null;
    if (h && aliveH(h) && !isDown(h) && !h.fight && (p.inside != null || (h.action?.type === 'nurse' && h.action.friend === p.id))) {
      // 助けに来た人が、そばに着いてから2手で手当てが終わる
      if (p.inside != null || dist(h, p) <= 1.5) {
        if (d.helpT == null) d.helpT = S.t;
        else if (S.t - d.helpT >= TUNE.HELP_HANDS) revive(sim, p, h, countItem(h, 'potion') > 0 && takeItem(h, 'potion', 1) ? '回復薬' : '手当て');
      }
      continue;
    }
    const helper = findHelper(sim, p);
    if (helper) {
      d.helper = helper.id; d.helpT = null;
      if (p.inside == null) {
        try { sim.startAction(helper, { type: 'nurse', place: { x: Math.round(p.pos.x), z: Math.round(p.pos.z) }, dur: 5, friend: p.id }); } catch { helper.pos = { x: p.pos.x, z: p.pos.z }; }
      }
      say(sim, helper, sim.rng.pick([`${p.given}！ 今行く！`, 'しっかりしろ、今手当てする！', '血を止めないと…！']));
    }
  }
  // 状態異常：毒と出血は毎手少しずつ体力を削る（ここで命は奪わない）。切れたものは消す
  const A = sim._cbAff;
  if (A && A.size) for (const e of [...A]) {
    const c = e.cb;
    if (!c?.ss || (isHuman(e) ? e.deathYear != null : S.creatures[e.id] !== e || e.hp <= 0)) { A.delete(e); continue; }
    let any = false;
    for (const k of Object.keys(c.ss)) {
      if (c.ss[k] <= S.t) { delete c.ss[k]; continue; }
      any = true;
      if (k === 'poison' || k === 'bleed') {
        if (c.down) continue;
        const rate = k === 'poison' ? TUNE.POISON_DOT * (1 - (st10(e, 'vit') - 10) * 0.02) : TUNE.BLEED_DOT;
        e.hp = Math.max(1, e.hp - e.maxhp * rate * Math.min(3, steps));
      }
    }
    if (!any) { delete c.ss; A.delete(e); }
  }
  // 士気の控えの掃除（1時間ごと）
  if (sim._cbMor && Math.floor(S.t / 60) !== sim._cbMorH) {
    sim._cbMorH = Math.floor(S.t / 60);
    for (const [k, m] of sim._cbMor) if (S.t - m.t > 60) sim._cbMor.delete(k);
  }
}
function findHelper(sim, p) {
  const S = sim.S;
  const ok = (q) => aliveH(q) && q !== p && !isDown(q) && !q.fight && q.jail == null && (q.inside ?? null) === (p.inside ?? null) && sim.ageOf(q) >= 14 && dist(q, p) <= TUNE.HELP_R && !(q.bandit && !p.bandit) && !(p.bandit && !q.bandit);
  // 同じパーティの仲間は、少し離れていても（退いた後でも）引き返して手当てに来る
  const pt = p.party != null ? S.advParties?.[p.party] : null;
  if (pt) for (const id of pt.members) { const q = S.people[id]; if (q && q !== p && aliveH(q) && !isDown(q) && !q.fight && q.jail == null && (q.inside ?? null) === (p.inside ?? null) && dist(q, p) <= TUNE.HELP_R_PARTY) return q; }
  // 1分ごとに、そばの人を探す（瀕死の人は少ないので、全員をなめても軽い）
  let best = null, bd = TUNE.HELP_R;
  for (const q of sim.living()) {
    if (Math.abs(q.pos.x - p.pos.x) > bd || Math.abs(q.pos.z - p.pos.z) > bd) continue;
    if (!ok(q)) continue;
    const d = dist(q, p);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// ---------- 毎日：大けがの回復と治療・後遺症・呪いを解く・解毒薬の備え ----------
export function combatDaily(sim) {
  const S = sim.S, R = sim.rng;
  combatState(sim);
  for (const p of sim.living()) {
    const c = p.cb;
    if (!c) continue;
    const town = sim.town(p.s);
    const inTown = town && p.inside != null || (town && Math.hypot(p.pos.x - town.x, p.pos.z - town.z) < (town.r || 8) + 2);
    // 大けが：町にいれば医者・薬師にかかる（けが人 → 医者の家計）
    if (c.inj) {
      if (!c.inj.doc && inTown) treatInjury(sim, p);
      if (sim.today >= c.inj.until) {
        const k = c.inj.k, doc = c.inj.doc;
        delete c.inj;
        if (R.chance(doc ? TUNE.SCAR_P_DOC : TUNE.SCAR_P)) {
          p.scars = p.scars || [];
          const opts = INJ_SCAR[k].filter((s) => !p.scars.some((x) => x.k === s));
          if (opts.length) {
            const s = R.pick(opts);
            p.scars.push({ k: s, day: sim.today, by: null });
            if (S.health?.stats) S.health.stats.scars++;
            ST(sim).scar++;
            sim.remember(p, `${INJ_NAME[k]}は治ったが、${SCARS[s].mem}`, { emo: -0.7, imp: 0.9, k: 'scar' });
            if (p.deeds) p.deeds.push(`${sim.year?.() ?? ''}年、戦いの傷がもとで${SCARS[s].name}が残った`);
            sim.pushLog(`${sim.fullName(p)}の${INJ_NAME[k]}は治ったが、${SCARS[s].name}が残った。`, 'event', [p.id], p.pos);
          }
        } else sim.remember(p, `${INJ_NAME[k]}がすっかり治った`, { emo: 0.4, imp: 0.4, k: 'fight' });
      }
    }
    // 呪い：町の教会で解いてもらう（呪われた人 → 教会の施し箱）
    if (c.curse && inTown && S.towns[p.s]) liftCurse(sim, p);
    // 毒を受けたことのある冒険者は、解毒薬を1つ備える（家計 → 市場）
    if (c.psn != null && inTown && countItem(p, 'antidote') < 1 && (p.advClass || JOBS[p.job]?.combat)) buyAntidote(sim, p);
    if (c.lost) for (const k of Object.keys(c.lost)) if (sim.today - c.lost[k] > TUNE.LOST_DAYS) delete c.lost[k];
    // 使い終えた控えは消して、保存を軽くする
    for (const k of ['aid', 'aidT', 'pur', 'bashNow', 'chk', 'rear', 'rest', 'cast', 'ward', 'wardCd', 'lg', 'rout']) delete c[k];
    if (c.fled != null && S.t - c.fled > 1440) delete c.fled;
    if (c.ss && !Object.values(c.ss).some((v) => v > S.t)) delete c.ss;
  }
  for (const cr of Object.values(S.creatures)) {
    const x = cr.cb;
    if (!x) continue;
    for (const k of ['aim', 'pur', 'lg', 'stgImm', 'rout']) delete x[k];
    if (x.ss && !Object.values(x.ss).some((v) => v > S.t)) delete x.ss;
    if (!x.ss && !x.brk && !x.pt) delete cr.cb;
  }
}
function healerOf(sim, p) {
  let doc = null;
  for (const q of sim.living()) {
    if (q.s !== p.s || q === p || q.jail != null || (q.job !== 'doctor' && q.job !== 'herbalist')) continue;
    if (!doc || (q.job === 'doctor' && doc.job !== 'doctor')) doc = q;
  }
  return doc;
}
function treatInjury(sim, p) {
  const c = p.cb, doc = healerOf(sim, p);
  if (!doc) return;
  let fee = doc.job === 'doctor' ? TUNE.FEE_DOCTOR : TUNE.FEE_HERB;
  const can = spendable(sim, p);
  if (can < fee) {
    if (doc.pers?.A > 0.5) {
      fee = 0;
      sim.remember(p, `${doc.given}先生が、お代はいらないと言って${INJ_NAME[c.inj.k]}を診てくれた`, { emo: 0.9, imp: 0.7, about: [doc.id], k: 'help' });
      sim.relMut(p, doc).a += 10;
    } else return;
  } else {
    pay(sim, p, fee); earn(sim, doc, fee);
    flow(sim, 'けが人', doc.job === 'doctor' ? '医者' : '薬師', fee, '大けがの治療');
    ST(sim).treatFee += fee;
    sim.remember(p, `${doc.given}に${INJ_NAME[c.inj.k]}を診てもらった（${fee}銅貨）`, { emo: 0.4, imp: 0.5, about: [doc.id], k: 'help' });
  }
  c.inj.doc = true;
  c.inj.until = sim.today + Math.max(1, Math.ceil((c.inj.until - sim.today) / 2));
  ST(sim).treat++;
}
function liftCurse(sim, p) {
  const S = sim.S, t = S.towns[p.s];
  const church = sim.townBuilding?.(sim.town(p.s), 'church');
  const priest = sim.living().find((q) => q.s === p.s && q.job === 'priest' && q.jail == null);
  if (!church && !priest) return;
  const fee = TUNE.FEE_CURSE;
  if (spendable(sim, p) >= fee) {
    pay(sim, p, fee); t.alms = (t.alms || 0) + fee;
    flow(sim, '呪われた人', '教会の施し箱', fee, '解呪のお布施');
    ST(sim).curseFee += fee;
  } else if (!(priest && priest.pers?.A > 0.6)) return;
  delete p.cb.curse;
  ST(sim).curseLifted++;
  sim.remember(p, `教会で${priest ? priest.given + '司祭に' : ''}呪いを解いてもらった`, { emo: 0.7, imp: 0.6, about: priest ? [priest.id] : [], k: 'help' });
  sim.pushLog(`${sim.fullName(p)}が${sim.town(p.s)?.name || ''}の教会で呪いを解いてもらった。`, 'event', [p.id], p.pos);
}
function buyAntidote(sim, p) {
  const hh = sim.hh(p), m = sim.market?.(p.s);
  if (!hh || !m || (m.stock?.medicine || 0) < 1 || hh.money < (m.price?.medicine || 10) + 20) return;
  if (marketBuy(sim, p.s, 'medicine', 1, hh, { whole: true }) < 1) return;
  addItem(p, makeItem('antidote'));
  ST(sim).antidote++;
}

// ---------- ギルド：負けた相手の討伐は、力が2倍そろうまで受けない ----------
export function combatQuestOk(sim, crew, q) {
  if (!q || q.type !== 'hunt') return true;
  const c = sim.S.creatures[q.target];
  if (!c || !lostBefore(sim, crew, c.sp)) return true;
  return crewPower(crew) >= powerC(c) * TUNE.LOST_NEED;
}

// ---------- 見た目：アニメの状態（anim_people.js / anim_creatures.js から） ----------
export function combatPersonAnim(sim, p) {
  const c = p.cb;
  if (!c) return null;
  if (c.down) return 'dying';
  const t = sim.S.t;
  if ((c.ss?.sleep || 0) > t) return 'sleep';
  if ((c.ss?.para || 0) > t || (c.ss?.stun || 0) > t) return 'hurt';
  if ((c.rest || 0) > t) return 'idle';
  if ((c.rout || 0) > t || (p.fight == null && (c.fled || -1e9) > t - 3)) return 'flee';
  return null;
}
export function combatCreatureAnim(sim, c) {
  const x = c.cb;
  if (!x?.ss) return (x?.rout || 0) > sim.S.t ? 'run' : null;
  const t = sim.S.t;
  if ((x.ss.sleep || 0) > t) return 'sleep';
  if ((x.ss.fall || 0) > t) return 'dying';
  if ((x.ss.stun || 0) > t || (x.ss.para || 0) > t) return 'hurt';
  return null;
}

// ---------- 詳細欄 ----------
const escH = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export function combatText(sim, p) {
  const c = p.cb || {}, t = sim.S.t, out = [];
  if (c.down) out.push(`瀕死（あと${Math.max(0, Math.ceil(c.down.until - t))}分）`);
  const ss = Object.entries(c.ss || {}).filter(([, v]) => v > t).map(([k]) => SS_NAME[k]);
  if (c.curse) ss.push('呪い');
  if (ss.length) out.push(`状態：${ss.join('・')}`);
  if (c.inj) out.push(`${INJ_NAME[c.inj.k]}（あと${Math.max(0, c.inj.until - sim.today)}日${c.inj.doc ? '・治療済み' : ''}）`);
  return out.join('／');
}
export function combatRows(sim, p) {
  if (!p || p.deathYear != null) return '';
  const c = p.cb || {};
  const combat = JOBS[p.job]?.combat || p.advClass;
  let h = '';
  const txt = combatText(sim, p);
  if (txt) h += `<dt>戦いの傷</dt><dd>${escH(txt)}</dd>`;
  if (combat) {
    const w = weaponInfo(p), a = armorOf(p);
    const WN = { slash: '斬る', pierce: '突く', blunt: '叩く', arrow: '射る', bolt: '弩', magic: '魔法' };
    const AN = { cloth: '布', leather: '革', chain: '鎖', plate: '板金', scale: '鱗' };
    const sta = Math.round(staOf(sim, p));
    const mx = mpMax(sim, p);
    h += `<dt>戦い方</dt><dd>${WN[w.type] || '叩く'}（${w.spd === 'fast' ? '速い' : w.spd === 'heavy' ? '重い' : w.spd === 'crossbow' ? '巻き上げ' : 'ふつう'}）・${AN[a]}の鎧・息${sta}${mx ? `・魔力${Math.round(mpOf(sim, p))}/${mx}` : ''}</dd>`;
  }
  const lost = Object.keys(c.lost || {});
  if (lost.length) h += `<dt>苦手な相手</dt><dd>${lost.map((s) => escH(SPECIES[s]?.name || s)).join('、')}（力が2倍そろうまで挑まない）</dd>`;
  return h;
}
export function combatCreatureRows(sim, c) {
  const x = c.cb || {}, t = sim.S.t;
  let h = '';
  const r = RACE[c.sp];
  if (r) {
    const weak = Object.entries(r.el || {}).filter(([, v]) => v > 1).map(([k]) => ELEM_NAME[k]);
    const res = Object.entries(r.el || {}).filter(([, v]) => v < 1).map(([k, v]) => ELEM_NAME[k] + (v === 0 ? '（無効）' : ''));
    if (weak.length || res.length) h += `<dt>弱点・耐性</dt><dd>${weak.length ? `弱点：${weak.join('・')}` : ''}${weak.length && res.length ? '／' : ''}${res.length ? `耐性：${res.join('・')}` : ''}</dd>`;
  }
  const ss = Object.entries(x.ss || {}).filter(([, v]) => v > t).map(([k]) => SS_NAME[k]);
  if (ss.length) h += `<dt>状態</dt><dd>${ss.join('・')}</dd>`;
  const brk = Object.keys(x.brk || {});
  if (brk.length) h += `<dt>壊れた部位</dt><dd>${brk.map((k) => PART_NAME[k]).join('・')}</dd>`;
  return h;
}
export function combatSummary(sim) { return { ...ST(sim), downNow: sim._cbDown?.size || 0 }; }
