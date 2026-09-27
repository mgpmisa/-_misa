import { P, S, U, M, PLANT } from './core.mjs';
const X = (id, name, sub, w, v, o) => P(id, name, sub, w, v, { file: 2, ...o });
const FARM = ['farm', 'field'];
// 繊維作物：刈る→浸して腐らせる（レット）→叩いて繊維→紡いで糸
const FIB = [
  // [id, 名, 刈る場所, 繊維名, 糸名, 繊維の使い道, 糸の使い道, 説明, 値倍率, 種の名 or null]
  ['hemp', '麻', FARM, '麻の繊維', '麻糸', '縄・綱', '麻布・帆・袋・漁網', '太く強い繊維の草。国は船の綱と帆のために麻を植えさせる。', 1, ['hempseed', '麻の実']],
  ['flax', '亜麻', FARM, '亜麻の繊維', '亜麻糸', '上等な糸', '亜麻布（下着・敷布・上等な服）・弓の弦', '細くしなやかな繊維の草。亜麻布は涼しく丈夫。', 1.4, ['linseed', '亜麻仁']],
  ['nettle', '蕁麻', ['forest', 'grass', 'field'], '蕁麻の繊維', '蕁麻糸', '粗い糸', '蕁麻布・網・帆', '触るとちくちく痛む草。若葉は食べられ、茎は布になる。', 0.9, null],
  ['ramie', '苧麻', FARM, '青苧', '苧麻糸', '上布の糸', '上布（夏の上等な着物）', '雪国で育てる麻の仲間。その布は王侯の夏衣。', 1.8, null],
  ['jute', '黄麻', ['farm', 'field', 'swamp'], '黄麻の繊維', '黄麻糸', '粗い袋の糸', '穀物袋・荷の包み・敷物', '湿地で育つ麻。安い袋の材料。', 0.6, null],
  ['kudzu_vine', '葛の蔓', ['forest', 'hill', 'grass'], '葛の繊維', '葛糸', '光沢のある糸', '葛布（袴・襖）', 'どこまでも伸びる蔓。根は葛粉になる。', 1.2, null],
];
for (const [id, n, on, fn, yn, fnote, ynote, desc, m, seed] of FIB) {
  const wild = !on.includes('farm');
  X(id, n, 'fiber', 2, 0.3 * m, { d: 2, src: [wild ? S('gather', on, 0.8) : S('harvest', on, 1)], use: [U('craft', `浸して叩いて${fn}にする`)].concat(id === 'nettle' ? [U('food', '若葉の汁'), U('medicine', '血の巡り')] : []).concat(wild ? [] : [PLANT]), desc });
  X(`${id}_fiber`, fn, 'fiber', 0.5, 1 * m, { d: 2, make: M({ [id]: 3 }, 'farmer', 240), use: [U('craft', `紡いで${yn}・${fnote}`)], desc: `${n}の茎を池に10日浸し、干して叩き、梳いて取った繊維。` });
  X(`${id}_yarn`, yn, 'yarn', 0.2, 1.5 * m, { d: 2, make: M({ [`${id}_fiber`]: 1 }, 'weaver', 8), use: [U('craft', ynote)], desc: `${fn}を紡いだ糸。冬の夜、家の女たちが紡ぐ。` });
  if (seed) X(seed[0], seed[1], 'seed', 0.05, 0.3, { d: 1, src: [S('harvest', on, 1)], food: 2, keep: 365, use: [PLANT, U('craft', '搾って油'), U('feed', '小鳥と鶏の餌')].concat(id === 'flax' ? [U('medicine', '煎じて便通・湿布')] : []), desc: `${n}の種。` });
}
X('hemp_tow', '麻屑', 'fiber', 0.5, 0.3, { make: M({ hemp: 3 }, 'farmer', 240), use: [U('craft', '粗い袋布・船の隙間の詰め物（槙肌）・安い縄')], desc: '麻を梳いたときに残る短い繊維。' });
X('flax_tow', '亜麻屑', 'fiber', 0.5, 0.4, { make: M({ flax: 3 }, 'farmer', 240), use: [U('craft', '粗い袋布・ランプの芯・詰め物')], desc: '亜麻を梳いた短い繊維。' });
X('hemp_shives', '麻殻', 'straw', 0.5, 0.02, { make: M({ hemp: 3 }, 'farmer', 240), use: [U('fuel', '焚きつけ・お盆の迎え火'), U('feed', '家畜の寝床'), U('build', '土壁の混ぜ物')], desc: '麻の茎の芯を砕いたかす。捨てずに焚きつけに。' });
X('cotton_boll', '綿花', 'fiber', 0.2, 0.6, { d: 2, src: [S('harvest', FARM, 1)], use: [U('craft', '繰って綿と種に分ける'), PLANT], desc: '弾けた実から白い綿がのぞく。暖かい土地の作物。' });
X('cotton', '繰り綿', 'fiber', 0.2, 1.5, { d: 2, make: M({ cotton_boll: 3 }, 'weaver', 2), use: [U('craft', '紡いで綿糸・布団と綿入れの詰め物'), U('medicine', '傷の手当て')], desc: '種を取り除いた綿。' });
X('cotton_yarn', '綿糸', 'yarn', 0.1, 2, { d: 2, make: M({ cotton: 1 }, 'weaver', 6), use: [U('craft', '木綿の布・灯心・刺繍')], desc: '柔らかい綿の糸。' });
// 草・葦・蔓
const GR = [
  ['reed', '葦', ['swamp', 'river', 'lake'], 1, 0.1, [U('build', '屋根葺き・簾・葦簀'), U('craft', '矢柄・笛・筆・むしろ'), U('fuel')], '水辺に群れて生える背の高い草。刈っても翌年また生える。', 2],
  ['rush', '藺草', ['swamp', 'river', 'farm'], 0.5, 0.2, [U('craft', '畳表・ござ・藺草の灯心')], '丸い細い茎の草。畳の表を織る。', 1],
  ['sedge', '菅', ['swamp', 'grass'], 0.5, 0.1, [U('craft', '菅笠・蓑・縄')], '湿った野に生える細い葉の草。雨具を編む。', 1],
  ['thatch_grass', '茅', ['grass', 'hill', 'savanna'], 2, 0.1, [U('build', '茅葺き屋根（何十年も持つ）'), U('feed', '若いうちは牛の餌')], '野を覆う背の高い草。村総出で刈って屋根を葺く。', 2],
  ['cattail_leaf', '蒲の葉', ['swamp', 'lake', 'river'], 0.5, 0.05, [U('craft', 'むしろ・椅子の座面・樽の目止め')], '沼の蒲の長い葉。', 1],
  ['cattail_fluff', '蒲の穂綿', ['swamp', 'lake'], 0.05, 0.1, [U('craft', '布団と枕の詰め物'), U('fuel', '火口'), U('medicine', '花粉は血止め')], '蒲の穂がほぐれた綿毛。', 1],
  ['wisteria_vine', '藤蔓', ['forest', 'hill'], 1, 0.2, [U('craft', 'かご・吊り橋の綱・藤布'), U('build', '丸太を縛る')], '強く曲がる藤のつる。', 1],
  ['akebi_vine', '通草の蔓', ['forest', 'hill'], 0.5, 0.3, [U('craft', '手提げかご・花かご')], 'しなやかで艶のあるつる。', 1],
  ['wild_grape_vine', '山葡萄の蔓', ['forest', 'hill'], 0.5, 0.8, [U('craft', '一生使える丈夫な手提げ袋・背負いかご')], '山葡萄の皮を剥いで編む。親子三代使えるという。', 1],
  ['rattan', '籐', ['jungle'], 1, 0.6, [U('craft', '椅子・かご・盾・杖・家具を縛る')], '密林を這う長いつる。軽く丈夫で曲げやすい。', 1],
  ['ivy', '蔦', ['forest', 'town', 'ruins'], 0.3, 0.05, [U('ritual', '酒の神の冠'), U('craft', '垣根の飾り'), U('medicine', '咳の薬（少量）')], '壁を這う常緑のつる。', 0],
  ['esparto', '砂漠の針茅', ['desert', 'savanna'], 0.5, 0.2, [U('craft', '縄・草履・かご・粗い紙')], '乾いた地の硬い草。', 1],
  ['agave_fiber', '竜舌蘭の繊維', ['desert'], 0.3, 0.5, [U('craft', '強い縄・網・袋')], '剣のような葉から取る硬い繊維。', 1],
  ['broomcorn', '箒黍', ['farm', 'field'], 0.5, 0.2, [U('craft', '箒・たわし'), PLANT], '穂を箒にするための黍。', 1],
  ['paper_mulberry_bark', '楮の皮', ['forest', 'hill', 'farm'], 0.3, 0.5, [U('craft', '煮て叩いて紙を漉く（丈夫な紙）'), U('craft', '樹皮の布')], '紙の原料。毎年株から伸びる枝を刈って皮を剥ぐ。', 2],
  ['mitsumata_bark', '三椏の皮', ['forest', 'hill'], 0.3, 0.8, [U('craft', '滑らかな紙（証文・紙幣・地図）')], '枝が三つに分かれる木の皮。', 1],
  ['gampi_bark', '雁皮', ['hill', 'mountain'], 0.2, 2, [U('craft', '薄く光沢のある最上の紙（写本・魔導書）')], '栽培できない野生の木の皮。とても貴重。', 1],
  ['hemp_palm_fiber', '棕櫚の皮', ['hill', 'town', 'jungle'], 0.5, 0.3, [U('craft', '縄・箒・たわし・蓑'), U('build', '水に強い綱')], '棕櫚の幹を包む茶色い毛のような皮。', 1],
  ['abaca_fiber', '芭蕉の繊維', ['jungle'], 0.3, 0.8, [U('craft', '芭蕉布（涼しい夏の布）・船の綱')], '芭蕉の茎から取る繊維。', 1],
  ['bast_rope_grass', '縄草', ['grass', 'savanna'], 0.3, 0.05, [U('craft', 'その場で縛る縄の代わり')], 'どこにでも生える強い茎の草。旅人が縄の代わりに使う。', 0],
];
for (const [id, n, on, w, v, use, desc, d] of GR) {
  const farm = on.includes('farm');
  X(id, n, 'fiber', w, v, { d, src: [farm && id === 'broomcorn' ? S('harvest', on, 1) : S('gather', on, 0.7)], use, desc });
}
// 魔法の繊維
X('moon_hemp', '月光麻', 'magicfiber', 0.5, 20, { r: 2, src: [S('gather', ['dense', 'mountain'], 0.05)], use: [U('craft', '月光麻の布（魔導のローブ）'), U('magic', '魔力を通す糸')], desc: '満月の夜にだけ刈れる麻。糸にすると淡く光る。' });
X('moon_hemp_yarn', '月光麻の糸', 'magicfiber', 0.1, 45, { r: 2, make: M({ moon_hemp: 2 }, 'weaver', 12), use: [U('craft', '魔導のローブ・結界の縄'), U('magic')], desc: '闇の中で光る糸。' });
X('spirit_cotton', '精霊綿', 'magicfiber', 0.05, 30, { r: 3, src: [S('gather', ['dense'], 0.03)], use: [U('craft', '眠りを守る枕・聖職者の衣'), U('magic', '悪夢除け')], desc: '精霊が眠る森に一晩だけ咲く白い綿毛。' });
X('dragonbeard_grass', '竜髭草', 'magicfiber', 0.3, 15, { r: 2, src: [S('gather', ['volcano', 'mountain'], 0.08)], use: [U('craft', '鎧の下の詰め物・燃えない縄・弓弦')], desc: '火山の斜面に生える硬い髭のような草。火で燃えない。' });
