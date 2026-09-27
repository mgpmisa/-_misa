import { Book, U, loot, trade, g, D } from './h.mjs';
const B = new Book(); const I = B.I.bind(B); const C = B.C.bind(B);
const LU = 'luthier', TM = 'toymaker';

// ================= 楽器 =================
C('instrument', '楽器', 'instrument', 2, 30, 'carpenter', { planks: 2, silk: 0.5, resin: 0.2 }, 8, { st: 1, d: 1, use: U('hobby:演奏', 'tool:楽師と吟遊詩人の商売道具', 'luxury'), fx: { mood: 5 }, desc: '町の職人がこしらえた、ありふれた楽器。' });
const INS = [
  ['harp', '竪琴', { planks: 3, gut: 2 }, 70, 1, 4, '宮廷の楽師が奏でる大きな竪琴。'],
  ['lyre', '小竪琴', { planks: 1, gut: 1 }, 25, 0, 1, '吟遊詩人が抱えて歌う小さな竪琴。'],
  ['lute', 'リュート', { planks: 2, gut: 1, resin: 0.2 }, 40, 0, 1.5, '丸い胴の弦楽器。酒場でいちばん聞く音色。'],
  ['fiddle', '提琴', { planks: 2, gut: 1, horse_hair: 0.5 }, 45, 1, 1, '弓でこすって鳴らす弦楽器。踊りの伴奏に。'],
  ['flute_wood', '木の笛', { wood: 0.3 }, 5, 0, 0.2, '羊飼いが吹く素朴な縦笛。'],
  ['flute_side', '横笛', { wood: 0.3, silver: 0.1 }, 20, 0, 0.3, '銀の飾りのついた横笛。祭りの行列で吹く。'],
  ['panpipe', '葦笛', { reed: 3 }, 4, 0, 0.2, '長さの違う葦を束ねた笛。'],
  ['horn_hunt', '角笛', { horn_cattle: 1 }, 8, 0, 0.5, '狩りと戦の合図の角笛。'],
  ['horn_great', '大角笛', { horn_cattle: 2, copper: 0.5 }, 40, 1, 3, '山の向こうまで響く長い角笛。ヤルヴィ族の祭りに。'],
  ['bagpipe', '風袋笛', { leather: 1, wood: 0.5, reed: 1 }, 35, 0, 2, '革袋に息をためて吹く、北の国の笛。'],
  ['drum', '太鼓', { wood: 1, hide: 1 }, 15, 0, 3, '皮を張った胴の太鼓。祭りと行軍に。'],
  ['drum_small', '小太鼓', { wood: 0.5, hide: 0.5 }, 8, 0, 1, '肩から下げて叩く小太鼓。'],
  ['drum_thunder', '雷太鼓', { wood: 2, hide: 2 }, 45, 1, 6, 'ドルグ族の大太鼓。雷鳥ボルガイを呼ぶという。'],
  ['tambourine', '鈴太鼓', { wood: 0.3, hide: 0.3, copper: 0.1 }, 10, 0, 0.5, '縁に鈴をつけた踊り子の太鼓。'],
  ['handbell', '手鐘', { copper: 0.5, tin: 0.1 }, 12, 0, 0.5, '祈りと合図に鳴らす手持ちの鐘。'],
  ['jaw_harp', '口琴', { iron: 0.05 }, 3, 0, 0.05, '口にくわえて弾く小さな鉄の楽器。'],
  ['bone_flute', '骨笛', { bone: 1 }, 6, 0, 0.1, '鳥の骨の笛。奥地の民が精霊を呼ぶのに吹く。'],
  ['sitar_desert', '砂漠の三弦', { planks: 1, gut: 1, gourd: 1 }, 30, 0, 1, 'サハルの隊商の夜にかき鳴らす三弦。'],
  ['conch_horn', '法螺貝', { seashell_conch: 1 }, 10, 0, 1, '海の民が舟から吹き鳴らす大きな巻き貝。'],
  ['xylophone', '木琴', { planks: 2 }, 18, 0, 3, '長さの違う板を並べて叩く楽器。子どもも喜ぶ。'],
  ['organetto', '手回し琴', { planks: 2, gut: 1, iron: 0.2 }, 60, 1, 3, '取っ手を回すと鳴る箱。辻の芸人が使う。'],
  ['harp_golden', '黄金の竪琴', { harp: 1, gold: 1 }, 500, 3, 5, '王家の宴でだけ奏でられる、金の竪琴。'],
];
for (const [id, name, from, v, r, w, desc] of INS) C(id, name, 'instrument', w, v, LU, from, 2 + v / 10, { st: 1, r, d: 1, use: U('hobby:演奏すると自分もまわりも楽しくなる', 'tool:楽師・吟遊詩人の稼ぎ', r >= 1 ? 'luxury' : 'gift'), fx: { mood: 4 + r * 2 }, eq: { slot: 'tool' }, desc });
const INP = [['strings_gut', '楽器の弦', { gut: 1 }, 2, '腸を撚った弦。よく切れるので楽師は予備を持つ。'], ['rosin', '松脂の塊', { resin: 1 }, 1, '提琴の弓にすり込む松脂。'], ['sheet_music', '楽譜', { paper_hemp: 2, ink_gall: 0.2 }, 6, '新しい歌と踊りの節を書いた紙。楽師が買い集める。'], ['reeds_spare', '笛の簧', { reed: 1 }, 0.5, '風袋笛や笛の吹き口の替え。']];
for (const [id, name, from, v, desc] of INP) C(id, name, 'instrument', 0.05, v, id === 'sheet_music' ? 'musician' : LU, from, 0.3, { st: 20, d: 1, use: U('craft:楽器の手入れ', 'hobby'), desc });

// ================= 盤上遊戯・札・骰子 =================
const GM = [
  ['chess_set', '王と騎士の盤戯', { planks: 1, wood: 0.5 }, 20, '王・騎士・僧兵の駒で戦う盤。貴族と将軍のたしなみ。', 'carpenter'],
  ['chess_ivory', '牙の駒の盤戯', { fang: 4, marble: 1 }, 120, '牙と大理石で作った豪華な盤戯。王族の贈答品。', TM],
  ['backgammon', '双六盤', { planks: 1 }, 10, '骰子を振って駒を進める、酒場の定番の遊び。', 'carpenter'],
  ['stone_game', '石取り盤', { planks: 1, pebble: 20 }, 6, '白黒の石で陣地を取り合う盤。', 'carpenter'],
  ['fox_geese', '狐と鵞鳥', { planks: 1 }, 5, '一匹の狐と十三羽の鵞鳥で遊ぶ盤。農家の冬の遊び。', 'carpenter'],
  ['nine_mens', '九石並べ', { planks: 0.5 }, 3, '三つ並べたら相手の石を取れる、兵士の遊び。', 'carpenter'],
  ['mancala_desert', '砂漠の種まき盤', { wood: 1 }, 5, '穴に種を配っていくサハルの遊び。', 'carpenter'],
  ['playing_cards', '遊び札', { paper_hemp: 2, ink_color: 0.2 }, 4, '剣・杯・貨・杖の四つの組の札。賭けにも使う。', TM],
  ['playing_cards_gilt', '金縁の遊び札', { paper_gilt: 2, ink_color: 0.3 }, 40, '貴族の遊戯室の金縁の札。', TM],
  ['dice_bone', '骨の骰子', { bone: 0.2 }, 1, '骨を削った骰子。兵舎と酒場で転がる。', TM],
  ['dice_wood', '木の骰子', { wood: 0.1 }, 0.5, '子どもの双六に使う木の骰子。', TM],
  ['dice_crystal', '水晶の骰子', { quartz: 0.3 }, 25, '透きとおった水晶の骰子。好事家が集める。', 'jeweler'],
  ['dice_loaded', 'いかさま骰子', { bone: 0.2, lead: 0.05 }, 8, '鉛を仕込んだ骰子。見つかれば袋叩き。', TM],
  ['dominoes', '骨牌', { bone: 1 }, 8, '点を刻んだ骨の札を並べる遊び。', TM],
  ['puzzle_box', '謎解きの箱', { planks: 0.5 }, 15, '板をずらす順を知らないと開かない箱。', 'carpenter'],
  ['puzzle_rings', '知恵の輪', { iron: 0.1 }, 3, '絡んだ鉄の輪を外す遊び。', 'smith'],
  ['dart_board', '投げ矢の的', { planks: 1, feather: 3 }, 6, '酒場の壁に掛ける的と投げ矢。', 'carpenter'],
  ['bowls_set', '木の転がし玉', { wood: 2 }, 6, '芝の上で玉を転がし的に寄せる遊び。', 'carpenter'],
];
for (const [id, name, from, v, desc, by] of GM) C(id, name, 'game', 0.8, v, by, from, 1 + v / 10, { st: 1, r: v >= 40 ? 1 : 0, d: 1, use: U('hobby:友と遊ぶと気分が晴れ、仲が深まる', v >= 40 ? 'gift:貴族への贈り物' : 'trade'), fx: { mood: 4, bond: 2 }, desc });

// ================= 玩具・人形 =================
const TY = [
  ['doll_wood', '木の人形', { wood: 0.3 }, 3, '父親が冬の夜に削る木の人形。'],
  ['doll_cloth', '布人形', { cloth: 0.3, wool: 0.2 }, 3, '母親が端切れで縫う人形。女の子の宝物。'],
  ['doll_porcelain', '陶器の人形', { pottery: 1, finery: 0.1 }, 60, '絹の服を着せた貴族の娘の人形。'],
  ['rocking_horse', '木馬', { planks: 3 }, 20, '揺らして乗る木の馬。'],
  ['spinning_top', '独楽', { wood: 0.1 }, 1, '紐で回す独楽。男の子の喧嘩の種。'],
  ['kite', '凧', { paper_reed: 2, bamboo: 1, yarn: 0.2 }, 3, '春の風に揚げる凧。'],
  ['ball_leather', '革の鞠', { leather: 0.3, wool: 0.2 }, 3, '蹴ったり投げたりする鞠。'],
  ['cup_and_ball', '剣と玉', { wood: 0.2, yarn: 0.05 }, 2, '紐でつながった玉を剣先で受ける遊び。'],
  ['blocks', '積み木', { wood: 0.5 }, 3, '城を建てて遊ぶ木の塊。'],
  ['toy_sword', '木の剣', { wood: 0.3 }, 1, '騎士ごっこの木の剣。'],
  ['ship_model', '船の模型', { planks: 0.5, cloth: 0.2 }, 18, '帆まで張った小さな船。港町の土産。'],
  ['rattle', '赤子のがらがら', { wood: 0.1, pebble: 3 }, 1, '振ると鳴る、赤子のおもちゃ。'],
  ['marionette', '操り人形', { wood: 1, yarn: 0.5, cloth: 0.3 }, 15, '糸で動かす人形。旅芸人の人形劇に。'],
  ['hand_puppet', '指人形', { cloth: 0.2 }, 2, '手を入れて動かす人形。語り部が子どもに見せる。'],
  ['clay_whistle', '鳥の土笛', { clay: 0.2 }, 1, '水を入れて吹くと小鳥のさえずりになる土笛。'],
  ['hoop', '輪回し', { wood: 0.5 }, 1, '棒で転がして走る木の輪。'],
  ['toy_soldiers', '兵隊人形の組', { tin: 0.5 }, 12, '錫で鋳た兵隊の人形。貴族の男の子が戦ごっこをする。'],
  ['stilts', '竹馬', { bamboo: 2 }, 2, '背が高くなったようで楽しい。'],
  ['jumping_rope', '縄跳び', { rope_fiber: 1 }, 1, '広場の子どもたちの遊び。'],
  ['music_box', '手回しの小箱', { planks: 0.5, iron: 0.1 }, 50, '回すと小さな歌を奏でる小箱。'],
];
for (const [id, name, from, v, desc] of TY) C(id, name, 'toy', 0.4, v, TM, from, 0.5 + v / 10, { st: v < 5 ? 10 : 1, r: v >= 50 ? 1 : 0, d: 1, use: U('hobby:子どもの遊び（楽しくなる）', 'gift:子どもへの贈り物', ...(v >= 15 ? ['collect'] : [])), fx: { mood: 3 + Math.min(4, Math.floor(v / 15)), child: true }, desc });

// ================= 釣りの趣味の品（道具の担当の釣り竿とは別） =================
const FI = [
  ['fly_box', '毛針の箱', { planks: 0.2, feather: 3, iron: 0.02 }, 10, '鳥の羽根で虫に似せた毛針を並べた箱。釣り好きの宝。'],
  ['fly_rare', '孔雀の毛針', { peacock_feather: 1, iron: 0.01 }, 15, '大物の鱒がかかるという、名人の毛針。'],
  ['lure_silver', '銀の擬餌', { silver: 0.05 }, 12, '小魚に似せて光る銀の擬餌。'],
  ['float_painted', '飾り浮き', { cork: 0.1, dye: 0.05 }, 2, '色を塗った浮き。集める人も多い。'],
  ['rod_master', '名匠の竹竿', { bamboo: 2, silk: 0.2, lacquer: 0.1 }, 45, '漆を塗った名人の竿。道楽の極み。'],
  ['fish_print', '魚拓', { paper_hemp: 1, ink_soot: 0.1 }, 5, '釣った大物を墨で写しとった紙。壁に貼って自慢する。'],
  ['fishing_journal', '釣り日誌', { book_blank: 1 }, 14, '釣れた日と天気と餌を書いた帳面。'],
];
for (const [id, name, from, v, desc] of FI) C(id, name, 'angling', 0.2, v, id === 'fish_print' ? 'fisher' : TM, from, 1, { st: v < 5 ? 10 : 1, d: 1, use: U('hobby:釣り（釣れる魚が増え、気分が上がる）', v >= 12 ? 'gift:釣り好きへの贈り物' : 'trade', ...(id === 'fish_print' ? ['collect:大物の記録'] : [])), fx: { mood: 3, fishing: id === 'fish_print' || id === 'fishing_journal' ? 0 : 2 }, desc });

// ================= 画材・彫刻道具・手芸 =================
const AR = [
  ['canvas', '画布', { cloth: 1, glue: 0.2 }, 10, 'weaver', 'craft:絵を描く', '枠に張ってにかわを塗った布。'],
  ['easel', '画架', { planks: 1 }, 8, 'carpenter', 'tool:絵を描く', '絵を立てかける三脚。'],
  ['brush_fine', '細筆', { wood: 0.05, horse_hair: 0.1 }, 3, 'painter', 'tool:絵を描く', '細い線を引く絵筆。'],
  ['brush_broad', '太筆', { wood: 0.1, horse_hair: 0.3 }, 3, 'painter', 'tool:絵を描く', '背景を塗る刷毛のような太筆。'],
  ['palette', '絵の具皿', { planks: 0.2 }, 2, 'carpenter', 'tool:絵を描く', '親指を通す穴のある板。'],
  ['pigment_red', '赤の顔料', { ochre: 1 }, 3, 'painter', 'dye:赤い絵の具', '赤土を焼いて挽いた顔料。'],
  ['pigment_blue', '群青の顔料', { lapis: 0.5 }, 30, 'painter', 'dye:聖母の衣を塗る青', '瑠璃を挽いた群青。金より高い青。'],
  ['pigment_green', '緑の顔料', { malachite: 0.5 }, 8, 'painter', 'dye:緑の絵の具', '孔雀石を挽いた緑。'],
  ['pigment_yellow', '黄の顔料', { ochre: 1 }, 3, 'painter', 'dye:黄色い絵の具', '黄土を挽いた顔料。'],
  ['pigment_purple', '貝紫', { seashell_murex: 10 }, 50, 'dyer', 'dye:王の衣の紫', '一万の巻き貝からひと匙しか取れない紫。王族だけが着る色。'],
  ['pigment_set', '絵の具の箱', { pigment_red: 1, pigment_yellow: 1, pigment_green: 1, lead_white: 1, lampblack: 1 }, 20, 'painter', 'craft:絵を描く', '五色の顔料をそろえた画家の箱。'],
  ['charcoal_stick', '素描の木炭', { charcoal: 0.1 }, 0.5, 'painter', 'tool:下絵を描く', '柳の枝を焼いた細い木炭。'],
  ['crayon_wax', '色蝋', { wax: 0.2, dye: 0.1 }, 2, 'chandler', 'hobby:子どもの絵描き', '蝋に色を混ぜて固めた棒。'],
  ['chisel_set', '彫刻刀の組', { iron: 0.3 }, 12, 'smith', 'tool:木彫りをする', '大小の刃をそろえた彫刻刀。'],
  ['sculpt_chisel', '石彫の鑿と槌', { iron: 1 }, 15, 'smith', 'tool:石の像を刻む', '石工と彫刻家の鑿。'],
  ['clay_tools', '粘土べら', { wood: 0.2 }, 2, 'potter', 'tool:粘土で像を作る', '粘土をならす木のへら。'],
  ['embroidery_set', '刺繍の枠と糸', { wood: 0.2, silk: 0.2, dye: 0.1 }, 8, 'tailor', 'hobby:刺繍（貴婦人のたしなみ）', '色とりどりの絹糸と丸い枠。'],
  ['lace_bobbins', 'レース編みの糸巻き', { wood: 0.2, yarn: 0.3 }, 6, TM, 'hobby:レース編み', '何十本もの糸巻きで編む細かなレース。'],
  ['knitting_needles', '編み棒と毛糸', { wood: 0.1, yarn: 1 }, 3, TM, 'hobby:編み物（冬の手仕事）', '冬の炉端で編む毛糸と棒。'],
  ['pressed_flower_book', '押し花帳', { paper_reed: 5, leather: 0.2 }, 5, 'bookbinder', 'hobby:押し花集め', '野の花を挟んで押す帳面。'],
  ['calligraphy_set', '飾り文字の道具', { reed_pen: 1, ink_color: 1, silver_nib: 1 }, 20, 'scribe', 'hobby:飾り文字を書く', '写字生の飾り文字の道具。貴族の手習いにも。'],
];
for (const [id, name, from, v, by, u, desc] of AR) C(id, name, /pigment/.test(id) ? 'pigment' : 'art_tool', 0.3, v, by, from, 0.5 + v / 20, { st: /pigment|charcoal|crayon/.test(id) ? 20 : 1, r: v >= 30 ? 1 : 0, d: 1, use: U(u, 'hobby'), desc });

// ================= その他の道楽 =================
const MISC = [
  ['pipe_clay', '陶の煙管', { clay: 0.2 }, 2, 'potter', U('luxury:一服して気を休める', 'hobby'), { mood: 3 }, '白い陶の煙管。老人の縁側の友。'],
  ['pipe_meerschaum', '海泡石の煙管', { meerschaum: 1 }, 40, 'carpenter', U('luxury', 'collect'), { mood: 4 }, '使い込むほど飴色になる、貴族の煙管。'],
  ['birdcage', '鳥かご', { bamboo: 1, iron: 0.1 }, 8, 'carpenter', U('hobby:小鳥を飼う（歌声で気分が上がる）', 'luxury'), { mood: 2 }, '軒下に吊るす鳥かご。'],
  ['cricket_cage', '虫かご', { bamboo: 0.3 }, 1, TM, U('hobby:鳴く虫を飼う'), { mood: 1 }, '秋に鳴く虫を入れる小さなかご。'],
  ['spyglass', '遠眼鏡', { glass: 0.5, copper: 0.5 }, 60, 'glassblower', U('hobby:星と遠くを眺める', 'tool:見張りと航海'), { sight: 5 }, '遠くの船や星が近くに見える筒。'],
  ['hand_fan', '扇', { paper_fine: 1, bamboo: 0.2 }, 8, TM, U('luxury:暑い日の涼', 'gift'), { cool: 2 }, '絵を描いた紙の扇。'],
  ['parasol', '日傘', { silk: 0.5, bamboo: 1 }, 25, 'tailor', U('luxury:貴婦人の外出', 'gift'), { cool: 2, beauty: 2 }, '絹を張った貴婦人の日傘。'],
  ['snuffbox', '嗅ぎ煙草入れ', { silver: 0.3 }, 30, 'jeweler', U('luxury', 'collect'), { mood: 2 }, '紋を刻んだ銀の小箱。'],
  ['mirror_hand', '手鏡', { silver: 0.2, glass: 0.2 }, 12, 'jeweler', U('luxury:身だしなみ', 'gift'), { beauty: 1 }, '銀の縁の手鏡。'],
  ['comb_tortoise', '鼈甲の櫛', { tortoiseshell: 0.3 }, 25, 'jeweler', U('luxury', 'gift'), { beauty: 3 }, '亀の甲羅を磨いた、飴色の櫛。'],
  ['hourglass', '砂時計', { glass: 0.3, sand: 0.1, planks: 0.2 }, 10, 'glassblower', U('tool:時を計る', 'collect'), {}, '砂が落ちきると半刻。'],
  ['sundial', '日時計', { stone: 2 }, 15, 'mason', U('tool:時刻を知る', 'build:庭の飾り'), {}, '庭に据える石の日時計。'],
  ['tobacco_pouch', '刻み煙草', { tobacco: 1 }, 2, 'farmer', U('luxury:一服の楽しみ', 'trade'), { mood: 2, hook: 1 }, '干して刻んだ煙草の葉。煙管で吸う。'],
];
for (const [id, name, from, v, by, use, fx, desc] of MISC) C(id, name, 'pastime', 0.3, v, by, from, 1 + v / 20, { st: v < 5 ? 20 : 1, r: v >= 40 ? 1 : 0, d: 1, use, fx, desc });
export default B.list;
