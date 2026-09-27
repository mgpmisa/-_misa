// 布・糸・衣服・靴（gear3.js）
import { add, r, CR, LOOT, TR, uWear } from './g0_common.mjs';

const F = 'gear3';
export function genClothes() {
  // ---- 糸と布（服・袋・帆の材料） ----
  const TH = [
    ['hempthread', '麻糸', { hemp: 1 }, 0.1, 0.4, 'weaver', '麻の繊維を撚った丈夫な糸。'],
    ['linenthread', '亜麻糸', { flax: 1 }, 0.1, 0.6, 'weaver', '亜麻から紡いだ細くつややかな糸。'],
    ['woolyarn', '毛糸', { wool: 1 }, 0.1, 0.6, 'weaver', '羊毛を紡いだ温かい糸。'],
    ['cottonthread', '木綿糸', { cotton: 1 }, 0.1, 0.5, 'weaver', '南の国の綿から紡いだ柔らかい糸。'],
    ['silkthread', '絹糸', { cocoon: 3 }, 0.05, 4, 'weaver', '蚕の繭からとった光沢のある糸。'],
    ['goldthread', '金糸', { gold: 1, silkthread: 2 }, 0.05, 30, 'jeweler', '絹糸に金の箔を巻いた糸。王族の刺繍に使う。'],
  ];
  for (const [id, name, from, w, v, by, desc] of TH) add(F, { id, name, sub: 'thread', w, v, stack: 50, rare: id === 'goldthread' ? 2 : 0, demand: 2,
    src: [CR], use: [{ k: 'craft', note: '布を織る・縫う' }, ...(id === 'goldthread' ? [{ k: 'luxury' }] : [])], make: { from, by, t: 1, n: 2 }, desc });
  const FB = [
    ['cloth', '布', { wool: 1, hemp: 1 }, 1, 8, 0, 3, 'ふつうの布ひと巻き。服にも袋にも使う。'],
    ['hempcloth', '麻布', { hempthread: 4 }, 1, 4, 0, 3, '目の粗い丈夫な布。袋・前掛け・野良着に。'],
    ['linen', '亜麻布', { linenthread: 4 }, 0.8, 7, 0, 2, '白く涼しい上等な布。肌着と敷布に。'],
    ['woolcloth', '毛織物', { woolyarn: 4 }, 1.2, 8, 0, 3, '温かい羊毛の布。上着と外套に。'],
    ['cottoncloth', '木綿布', { cottonthread: 4 }, 0.8, 6, 0, 2, '柔らかく汗を吸う布。砂の国で好まれる。'],
    ['silkcloth', '絹布', { silkthread: 4 }, 0.5, 40, 1, 1, 'なめらかに光る布。貴族の服に。'],
    ['spidersilkcloth', '蜘蛛絹', { silk: 4 }, 0.4, 50, 2, 1, '大蜘蛛の糸で織った、鋼より強い布。'],
    ['felt', '毛氈', { wool: 3 }, 1.5, 6, 0, 1, '羊毛を押し固めた厚い布。帽子・敷物・天幕に。'],
    ['velvet', '天鵞絨', { silkthread: 6 }, 0.7, 60, 2, 1, '毛足の短い、なめらかで深い色の布。'],
    ['brocade', '錦', { silkthread: 4, goldthread: 2 }, 0.7, 120, 2, 1, '金糸で模様を織り出した布。王族の衣装に。'],
    ['sailcloth', '帆布', { hempthread: 8 }, 2, 10, 0, 1, '厚く織った麻布。帆・天幕・荷車の幌に。'],
    ['oilcloth', '油布', { hempcloth: 1, linseed_oil: 1 }, 1.2, 8, 0, 1, '油を染ませた水を通さない布。雨具と荷の覆いに。'],
    ['elvencloth', 'エルフ織り', { linenthread: 4, silkthread: 1 }, 0.3, 90, 2, 1, '森の奥の人々が織る、軽く丈夫で色の変わる布。'],
  ];
  for (const [id, name, from, w, v, rare, dem, desc] of FB) add(F, { id, name, sub: 'fabric', w, v, stack: 20, rare, demand: dem,
    src: id === 'elvencloth' ? [TR(['forest', 'dense']), CR] : id === 'silkcloth' || id === 'brocade' || id === 'velvet' ? [CR, TR(['desert', 'sea'])] : [CR],
    use: [{ k: 'craft', note: '服・袋・天幕を作る' }, ...(v >= 40 ? [{ k: 'luxury' }, { k: 'gift' }] : [{ k: 'trade' }]), ...(id === 'cloth' || id === 'hempcloth' ? [{ k: 'medicine', note: '裂いて包帯にする' }] : [])],
    make: { from, by: id === 'felt' ? 'feltmaker' : 'weaver', t: r(2 + v / 10, 1) }, desc });

  // ---- 布ごとの基本の服 ----
  const FAB = {
    hemp: { n: '麻', c: 'hempcloth', cv: 4, rare: 0, dem: 3 },
    linen: { n: '亜麻', c: 'linen', cv: 7, rare: 0, dem: 2 },
    wool: { n: '毛織', c: 'woolcloth', cv: 8, rare: 0, dem: 3, warm: 1 },
    cotton: { n: '木綿', c: 'cottoncloth', cv: 6, rare: 0, dem: 2 },
    silk: { n: '絹', c: 'silkcloth', cv: 40, rare: 1, dem: 1 },
  };
  const GA = [
    ['under', '肌着', 'armor', 'under', 1, 0.2, 1, '肌にじかに着る下着。'],
    ['tunic', '上衣', 'armor', 'body', 2, 0.5, 2, '頭からかぶって帯を締める上着。'],
    ['trousers', 'ズボン', 'armor', 'legs', 2, 0.5, 1.5, '脚を包む衣。'],
    ['skirt', 'スカート', 'armor', 'legs', 2, 0.5, 1.5, '腰から下を覆う衣。'],
    ['cloak', '外套', 'armor', 'over', 3, 1.2, 3, '肩から羽織る外套。雨風と寒さをしのぐ。'],
    ['hood', '頭巾', 'head', '', 1, 0.2, 1, '頭と肩を覆う頭巾。'],
    ['gloves', '手袋', 'hands', '', 1, 0.1, 1.5, '指まで覆う布の手袋。'],
    ['sash', '帯', 'accessory', '', 1, 0.1, 1, '腰に巻く帯。財布や短剣を挟む。'],
    ['socks', '靴下', 'feet', 'under', 1, 0.1, 0.5, '靴の下に履く足袋。'],
  ];
  for (const fk of Object.keys(FAB)) for (const [gk, gn, slot, layer, qty, w, lab, desc] of GA) {
    const f = FAB[fk];
    if (fk === 'silk' && (gk === 'socks' || gk === 'gloves' && false)) { /* 絹の靴下も作る */ }
    const v = r(f.cv * qty * 1.3 + lab * 2);
    const eq = { slot, def: gk === 'cloak' && fk === 'wool' ? 1 : 0 };
    if (layer) eq.layer = layer;
    if (f.warm && (gk === 'cloak' || gk === 'tunic' || gk === 'gloves' || gk === 'socks' || gk === 'hood')) eq.warm = 1;
    add(F, { id: `${fk}_${gk}`, name: `${f.n}の${gn}`, sub: 'clothes', w, v, rare: f.rare, demand: gk === 'under' || gk === 'tunic' ? f.dem : Math.max(1, f.dem - 1),
      src: [CR], use: [uWear('着る'), ...(f.rare ? [{ k: 'luxury' }, { k: 'gift' }] : [{ k: 'craft', note: '古着はほどいて布切れ・雑巾に' }])],
      make: { from: { [f.c]: qty }, by: 'tailor', t: r(1 + qty * 0.8 + lab * 0.5, 1) }, eq, desc });
  }

  // ---- 今ある品 ----
  add(F, { id: 'clothes', name: '布の服', sub: 'clothes', w: 0.8, v: 6, demand: 3, src: [CR, LOOT(0.03, ['ruins'])], use: [uWear('着る'), { k: 'craft', note: '古着はほどいて布切れに' }],
    make: { from: { cloth: 1 }, by: 'tailor', t: 3 }, eq: { slot: 'armor', def: 1 }, desc: 'だれもが着ているふつうの服。' });
  add(F, { id: 'robe', name: '魔導のローブ', sub: 'clothes', w: 1.2, v: 55, rare: 1, demand: 1, src: [CR], use: [uWear('魔法使いが着る'), { k: 'magic', note: '呪文の力を少し高める' }],
    make: { from: { cloth: 2, silk: 1 }, by: 'tailor', t: 8 }, eq: { slot: 'armor', def: 3, mag: 1 }, desc: '魔法使いの長いローブ。蜘蛛の糸で守りの文字を縫い取ってある。' });
  add(F, { id: 'shoes', name: '靴', sub: 'shoes', w: 0.8, v: 10, demand: 3, src: [CR], use: [uWear('履く'), { k: 'tool', note: '長い道を歩く' }],
    make: { from: { leather: 1 }, by: 'cobbler', t: 4 }, eq: { slot: 'feet', def: 0 }, desc: '革で作ったふつうの靴。' });

  // ---- 靴と履物 ----
  const SHO = [
    ['strawsandals', '草鞋', { straw: 2 }, 0.2, 0.5, 0, 3, 'weaver', '藁で編んだ履物。貧しい者も旅人も履く。すぐすり切れる。'],
    ['woodenclogs', '木靴', { wood: 1 }, 1, 2, 0, 2, 'carpenter', '木をくり抜いた靴。畑のぬかるみでも足が濡れない。'],
    ['sandals', '革のサンダル', { leather: 1 }, 0.3, 4, 0, 2, 'cobbler', '砂の国の人が履く、紐で結ぶ履物。'],
    ['workboots', '仕事の長靴', { leather: 2 }, 1.5, 14, 0, 2, 'cobbler', '鉱夫や石工が履く、つま先の硬い長靴。'],
    ['ridingboots', '乗馬の長靴', { leather: 2 }, 1.4, 25, 0, 1, 'cobbler', '膝まである乗馬用の長靴。騎士と貴族が履く。'],
    ['travelboots', '旅の靴', { leather: 2, felt: 1 }, 1.2, 18, 0, 2, 'cobbler', '底を厚くした旅人の靴。長く歩いても疲れにくい。'],
    ['fishingboots', '漁師の防水長靴', { leather: 2, pitch: 1 }, 1.8, 16, 0, 1, 'cobbler', '松脂で目を塞いだ水の入らない長靴。'],
    ['ladyshoes', '貴婦人の刺繍靴', { silkcloth: 1, leather: 1 }, 0.3, 45, 1, 1, 'cobbler', '絹に刺繍をほどこした踵の高い靴。'],
    ['dancingshoes', '踊り子の靴', { leather: 1, silkcloth: 1 }, 0.3, 15, 0, 1, 'cobbler', '柔らかく、足音の響く踊りの靴。'],
    ['furboots', '毛皮の長靴', { hide: 2 }, 1.6, 20, 0, 1, 'cobbler', '毛皮を内側にした冬の長靴。'],
    ['snowshoes', 'かんじき', { willow: 2, sinew: 1 }, 0.8, 4, 0, 1, 'basketweaver', '靴の下に付ける輪。深い雪に沈まない。'],
    ['childshoes', '子どもの靴', { leather: 1 }, 0.3, 5, 0, 2, 'cobbler', '子どもの小さな靴。すぐ履けなくなるので兄弟で回す。'],
    ['slippers', '室内履き', { felt: 1 }, 0.2, 3, 0, 1, 'cobbler', '家の中で履く毛氈の履物。'],
    ['nobleshoes', '貴族の留め金靴', { leather: 1, silver: 1 }, 0.6, 60, 1, 1, 'cobbler', '銀の留め金が付いた先の尖った靴。'],
    ['royalslippers', '王家の天鵞絨の靴', { velvet: 1, goldthread: 1, gem: 1 }, 0.4, 300, 2, 0, 'cobbler', '宝石を縫い付けた王族の靴。'],
    ['monksandals', '修道者の素足履き', { leather: 1, hemp: 1 }, 0.2, 2, 0, 1, 'cobbler', '神に仕える者が履く、飾りのない履物。'],
  ];
  for (const [id, name, from, w, v, rare, dem, by, desc] of SHO) add(F, { id, name, sub: 'shoes', w, v, rare, demand: dem, src: [CR],
    use: [uWear('履く'), ...(v >= 40 ? [{ k: 'luxury' }] : [{ k: 'tool', note: '道を歩く' }])], make: { from, by, t: r(1 + v / 6, 1) },
    eq: { slot: 'feet', def: 0, ...(/毛皮|かんじき/.test(name) ? { warm: 1 } : {}), ...(id === 'snowshoes' ? { snow: 1 } : {}) }, desc });

  // ---- 帽子・頭の物 ----
  const HAT = [
    ['strawhat', '麦わら帽子', { straw: 2 }, 0.2, 1, 0, 3, 'weaver', '日差しよけに農民がかぶる帽子。'],
    ['feltcap', '毛氈の帽子', { felt: 1 }, 0.2, 4, 0, 2, 'hatter', '町の人がかぶるつばのない帽子。'],
    ['featherhat', '羽根付き帽子', { felt: 1, feather: 3 }, 0.3, 12, 0, 1, 'hatter', '弓使いと吟遊詩人が好む、羽根を挿した帽子。'],
    ['wizardhat', 'とんがり帽子', { woolcloth: 2 }, 0.3, 15, 0, 1, 'hatter', '魔法使いの先の尖った帽子。'],
    ['mitre', '司教冠', { silkcloth: 2, goldthread: 1 }, 0.4, 150, 2, 0, 'tailor', '司教が式典でかぶる高い冠。'],
    ['whitemitre', '僧侶の白い帽子', { linen: 1 }, 0.2, 10, 0, 1, 'tailor', '僧侶の白い帽子。'],
    ['furhat', '毛皮の帽子', { hide: 1 }, 0.3, 8, 0, 1, 'hatter', '耳まで覆う冬の帽子。'],
    ['foxhat', '狐の毛皮の帽子', { fox_pelt: 1 }, 0.3, 30, 1, 1, 'hatter', '尾を垂らした狐の帽子。貴族の冬の装い。'],
    ['turban', '砂の国の頭布', { cottoncloth: 2 }, 0.3, 8, 0, 2, 'tailor', '頭に巻く長い布。日差しを遮る。'],
    ['veil', '面紗', { linen: 1 }, 0.1, 5, 0, 1, 'tailor', '顔を覆う薄い布。婚礼や葬儀で着ける。'],
    ['coif', '頭巾帽', { linen: 1 }, 0.1, 2, 0, 2, 'tailor', '髪をまとめる白い布の帽子。女中や料理人が着ける。'],
    ['nightcap', '寝帽', { woolcloth: 1 }, 0.1, 3, 0, 1, 'tailor', '寝るときにかぶる帽子。'],
    ['headband', '鉢巻き', { cottoncloth: 1 }, 0.05, 1, 0, 2, 'tailor', '額に巻く布。剣士や職人が汗止めに締める。'],
    ['bandana', '盗賊の頭巾と口当て', { cottoncloth: 1 }, 0.1, 3, 0, 1, 'tailor', '顔を隠す布。盗賊と山賊が好む。'],
    ['jesterhat', '道化の鈴帽子', { woolcloth: 2, copper: 1 }, 0.3, 12, 0, 0, 'hatter', '先が三つに分かれ鈴の付いた帽子。'],
    ['flowercrown', '花冠', { flowers: 5 }, 0.1, 1, 0, 1, 'gardener', '春の祭りで娘たちがかぶる花の冠。数日でしおれる。', 4],
    ['circlet', '王族の額冠', { gold: 1, gem: 1 }, 0.2, 400, 2, 0, 'jeweler', '額に着ける細い金の輪。王子・王女のしるし。'],
    ['sunhat', '貴婦人のつば広帽', { straw: 1, silkcloth: 1, feather: 2 }, 0.3, 30, 1, 1, 'hatter', 'りぼんと羽根の付いたつばの広い帽子。'],
    ['pilgrimhat', '巡礼の帽子', { felt: 1, shell: 1 }, 0.3, 6, 0, 1, 'hatter', '貝殻の印を付けた巡礼者の帽子。'],
    ['helmetliner', '兵士の軍帽', { felt: 1 }, 0.2, 3, 0, 1, 'hatter', '兵士が兜を脱いだときにかぶる帽子。'],
  ];
  for (const [id0, name, from, w, v, rare, dem, by, desc, keep] of HAT) {
    const id = id0 === 'coif' ? 'linen_coif' : id0;
    add(F, { id, name, sub: 'hat', w, v, rare, demand: dem, ...(keep ? { keep } : {}), src: [CR],
      use: [uWear('かぶる'), ...(v >= 100 ? [{ k: 'luxury' }, { k: 'ritual', note: '式典' }] : id === 'flowercrown' ? [{ k: 'ritual', note: '春の祭り' }, { k: 'gift' }] : [{ k: 'trade' }])],
      make: { from, by, t: r(1 + v / 8, 1) }, eq: { slot: 'head', def: 0, ...(/毛皮/.test(name) ? { warm: 1 } : {}) }, desc });
  }

  // ---- 毛皮の外套 ----
  const FUR = [
    ['wolf', '狼', 'wolf_pelt', 30, 1], ['bear', '熊', 'bear_pelt', 45, 1], ['fox', '狐', 'fox_pelt', 60, 1], ['polarbear', '白熊', 'polarbear_pelt', 120, 2],
    ['reindeer', '馴鹿', 'reindeer_pelt', 35, 1], ['rabbit', '兎', 'rabbit_pelt', 20, 0], ['tiger', '虎', 'tiger_pelt', 150, 2], ['sheepskin', '羊', 'sheepskin', 18, 0],
  ];
  for (const [k, n, mat, v, rare] of FUR) add(F, { id: `${k}_furcloak`, name: `${n}の毛皮の外套`, sub: 'clothes', w: 3, v, rare, demand: 1, src: [CR],
    use: [uWear('冬に羽織る'), ...(v >= 60 ? [{ k: 'luxury' }, { k: 'gift' }] : [{ k: 'tool', note: '野宿の敷物にもなる' }])],
    make: { from: { [mat]: k === 'rabbit' ? 6 : 2, woolcloth: 1 }, by: 'furrier', t: r(4 + v / 10, 1) }, eq: { slot: 'armor', def: 1, layer: 'over', warm: 2 },
    desc: `${n}の毛皮で仕立てた温かい外套。` + (v >= 100 ? '北の王侯が好む。' : '') });

  // ---- 身分と仕事の服 ----
  const OUT = [
    ['peasantgarb', '農民の野良着', { hempcloth: 3 }, 1, 5, 0, 3, 'tailor', 'armor', '畑仕事で着る丈夫な麻の上下。泥にまみれても洗える。'],
    ['shepherdcloak', '羊飼いの外套', { woolcloth: 3 }, 2, 14, 0, 1, 'tailor', 'over', '雨を弾く脂の多い羊毛の外套。'],
    ['craftapron', '職人の前掛け', { hempcloth: 1 }, 0.3, 3, 0, 2, 'tailor', 'over', '服を汚さないための麻の前掛け。'],
    ['smithapron', '鍛冶屋の革の前掛け', { leather: 2 }, 1.5, 10, 0, 1, 'leatherworker', 'over', '火の粉と熱から身を守る厚い革の前掛け。'],
    ['cookapron', '料理人の白い前掛け', { linen: 1 }, 0.3, 5, 0, 1, 'tailor', 'over', '宮廷の厨房で着ける白い前掛け。'],
    ['maiduniform', '侍女のお仕着せ', { woolcloth: 2, linen: 1 }, 1, 20, 0, 1, 'tailor', 'armor', '城の侍女に支給される黒い服と白い前掛け。'],
    ['butlercoat', '執事の黒い礼服', { woolcloth: 3, silver: 0 }, 1.2, 40, 0, 1, 'tailor', 'armor', '裾の長い黒い上着。主人の家の格を表す。'],
    ['merchantcoat', '商人の上着', { woolcloth: 2, cottoncloth: 1 }, 1.2, 25, 0, 1, 'tailor', 'armor', '染めた毛織物の上着。懐が深く財布を隠せる。'],
    ['noblecoat', '貴族の礼服', { velvet: 2, silkcloth: 1 }, 1.5, 220, 1, 1, 'tailor', 'armor', '天鵞絨の上着に絹の襟。貴族の男の正装。'],
    ['noblegown', '貴婦人の長衣', { silkcloth: 4, velvet: 1 }, 1.8, 280, 1, 1, 'tailor', 'armor', '裾を引きずる絹の長衣。貴族の女の正装。'],
    ['kingrobe', '王の礼装', { brocade: 3, ermine: 2 }, 3, 1500, 3, 0, 'tailor', 'armor', '錦に白貂の毛皮を縁取った王の衣。戴冠式と謁見で着る。'],
    ['queengown', '王妃の衣', { brocade: 3, pearl: 5 }, 2.5, 1600, 3, 0, 'tailor', 'armor', '真珠を縫い付けた錦の長衣。'],
    ['princeclothes', '王子の服', { velvet: 2, goldthread: 1 }, 1.2, 400, 2, 0, 'tailor', 'armor', '金の刺繍の入った天鵞絨の服。'],
    ['royalcloak', '王家の紫の外套', { velvet: 3, purple_dye: 1 }, 2.5, 900, 3, 0, 'tailor', 'over', '王家にしか許されない紫の外套。'],
    ['priestvestment', '司祭の祭服', { linen: 2, silkcloth: 1, goldthread: 1 }, 1.5, 120, 1, 1, 'tailor', 'armor', '祭りの日に司祭が着る刺繍の入った衣。'],
    ['clericrobe', '僧侶の白い法衣', { linen: 3 }, 1.2, 25, 0, 1, 'tailor', 'armor', '白い法衣に金の帯。旅の僧侶の装い。'],
    ['nunhabit', '修道女の修道服', { woolcloth: 3 }, 1.4, 16, 0, 1, 'tailor', 'armor', '黒い修道服と白い頭巾。'],
    ['monkrobe', '修道士の頭巾付き長衣', { woolcloth: 3, hemp: 1 }, 1.5, 14, 0, 1, 'tailor', 'armor', '縄を帯にした茶色の長衣。'],
    ['wizardrobe', '魔法使いの長衣', { woolcloth: 3 }, 1.4, 30, 0, 1, 'tailor', 'armor', '星と月の模様を染めた長衣。'],
    ['sorcererrobe', '魔導士の頭巾付きローブ', { woolcloth: 3, goldthread: 1, magicstone: 1 }, 1.5, 150, 1, 1, 'tailor', 'armor', '金の縁取りと胸の光る紋を持つ青いローブ。'],
    ['scholarrobe', '学者の長衣', { woolcloth: 3 }, 1.4, 28, 0, 1, 'tailor', 'armor', '学び舎の学者と導師が着る黒い長衣。'],
    ['jestersuit', '道化の服', { woolcloth: 2, dye: 2 }, 1, 20, 0, 0, 'tailor', 'armor', '左右で色の違うまだらの服。'],
    ['bardclothes', '吟遊詩人の服', { cottoncloth: 2, feather: 1 }, 1, 22, 0, 1, 'tailor', 'armor', '派手な色の袖の膨らんだ服。'],
    ['dancerdress', '踊り子の衣装', { silkcloth: 1, copper: 1 }, 0.4, 60, 1, 1, 'tailor', 'armor', '薄布に鈴飾りを付けた衣装。回ると裾が広がる。'],
    ['soldiertabard', '兵士の陣羽織', { woolcloth: 2, dye: 1 }, 0.8, 8, 0, 2, 'tailor', 'over', '国の色と紋章を染めた、鎧の上に着る外衣。'],
    ['knighttabard', '騎士の紋章の外衣', { silkcloth: 1, woolcloth: 1, goldthread: 1 }, 0.8, 70, 1, 1, 'tailor', 'over', '家の紋章を刺繍した騎士の外衣。'],
    ['guardcoat', '衛兵の制服', { woolcloth: 3, dye: 1 }, 1.4, 20, 0, 2, 'tailor', 'armor', '町の衛兵に配られる揃いの上着。'],
    ['prisonergarb', '囚人服', { hempcloth: 2 }, 0.8, 1, 0, 1, 'tailor', 'armor', '縞の入った粗い麻の服。牢で配られる。'],
    ['beggarrags', '物乞いのぼろ', { rag: 3 }, 0.6, 0.2, 0, 1, 'tailor', 'armor', '継ぎはぎだらけのぼろ布。'],
    ['adventurergarb', '冒険者の旅装', { woolcloth: 2, leather: 1 }, 2, 30, 0, 2, 'tailor', 'armor', '革の肩当てと物入れの多い丈夫な服。'],
    ['thiefgarb', '盗賊の黒装束', { cottoncloth: 2, dye: 1 }, 0.8, 18, 0, 1, 'tailor', 'armor', '夜に紛れる焦げ茶の身軽な服。'],
    ['huntergarb', '狩人の緑の服', { woolcloth: 2, dye: 1 }, 1.2, 16, 0, 1, 'tailor', 'armor', '森に紛れる緑に染めた服。'],
    ['fisheroilskin', '漁師の油合羽', { oilcloth: 3 }, 2, 20, 0, 1, 'tailor', 'over', '波しぶきを通さない油布の合羽。'],
    ['raincloak', '油布の雨外套', { oilcloth: 2 }, 1.5, 15, 0, 2, 'tailor', 'over', '雨の日に羽織る油布の外套。'],
    ['minergarb', '鉱夫の作業着', { hempcloth: 2, leather: 1 }, 1.5, 10, 0, 1, 'tailor', 'armor', '肘と膝に革を当てた作業着。'],
    ['desertrobe', '砂の民の白い長衣', { cottoncloth: 4 }, 1.2, 18, 0, 2, 'tailor', 'armor', '日差しを跳ね返す白い長衣。'],
    ['northcoat', '雪国の綿入れ上着', { woolcloth: 3, hide: 1 }, 2.5, 30, 0, 1, 'tailor', 'armor', '羊毛を詰めた分厚い上着。'],
    ['sailorclothes', '船乗りの縞の服', { cottoncloth: 2 }, 0.8, 8, 0, 1, 'tailor', 'armor', '動きやすい縞の上着とゆったりしたズボン。'],
    ['midwifeapron', '産婆の前掛け', { linen: 2 }, 0.4, 6, 0, 1, 'tailor', 'over', '洗い晒した白い前掛け。'],
    ['doctorcoat', '医者の長衣', { woolcloth: 3 }, 1.4, 35, 0, 1, 'tailor', 'armor', '黒い長衣。病人を診るときに着る。'],
    ['plaguemask', '疫病医の嘴の面', { leather: 2, glass: 1, herbs: 2 }, 0.6, 40, 1, 0, 'leatherworker', 'head', '嘴に薬草を詰めた面。はやり病の家を訪ねるときに着ける。'],
  ];
  for (const [id, name, from, w, v, rare, dem, by, layer, desc] of OUT) {
    for (const k in from) if (!from[k]) delete from[k];
    const slot = layer === 'head' ? 'head' : 'armor';
    add(F, { id, name, sub: 'outfit', w, v, rare, demand: dem, src: [CR],
      use: [uWear('着る'), ...(v >= 100 ? [{ k: 'luxury' }, { k: 'gift' }] : v < 5 ? [{ k: 'craft', note: 'ほどいて布切れに' }] : [{ k: 'trade' }]), ...(/司祭|司教|僧侶|修道/.test(name) ? [{ k: 'ritual' }] : [])],
      make: { from, by, t: r(2 + v / 15, 1) }, eq: { slot, def: 0, ...(layer === 'over' ? { layer } : {}), ...(/雪国|羊飼い/.test(name) ? { warm: 1 } : {}), ...(id === 'wizardrobe' || id === 'sorcererrobe' ? { mag: id === 'sorcererrobe' ? 2 : 1 } : {}) }, desc });
  }
  // ---- 祭り・婚礼・喪・子ども ----
  const FES = [
    ['springdress', '春祭りの晴れ着', { linen: 2, dye: 1 }, 0.8, 25, 0, 1, '花の刺繍の入った春祭りの服。', 'ritual'],
    ['harvestclothes', '収穫祭の晴れ着', { woolcloth: 2, dye: 2 }, 1, 28, 0, 1, '麦の穂の色に染めた収穫祭の服。', 'ritual'],
    ['wintersolstice', '冬至祭の赤い外套', { woolcloth: 3, dye: 1 }, 1.5, 30, 0, 1, '一年でいちばん長い夜に着る赤い外套。', 'ritual'],
    ['bridegown', '花嫁衣装', { silkcloth: 3, linen: 2 }, 1.5, 180, 1, 1, '白い絹の婚礼の衣。母から娘へ受け継ぐ家も多い。', 'ritual'],
    ['groomcoat', '花婿の礼服', { velvet: 1, woolcloth: 2 }, 1.4, 90, 1, 1, '婚礼の日に花婿が着る上着。', 'ritual'],
    ['commonwedding', '村の婚礼の晴れ着', { linen: 2, dye: 1 }, 0.8, 20, 0, 1, '村の娘が婚礼のために縫う晴れ着。', 'ritual'],
    ['mourningdress', '喪服', { woolcloth: 3, black_dye: 1 }, 1.2, 18, 0, 1, '葬儀で着る黒い服。', 'ritual'],
    ['mourningveil', '喪の黒い面紗', { linen: 1, black_dye: 1 }, 0.1, 6, 0, 1, '葬儀で顔を覆う黒い薄布。', 'ritual'],
    ['noblemourning', '貴族の喪服', { velvet: 2, black_dye: 1 }, 1.4, 150, 1, 0, '黒い天鵞絨の喪服。', 'ritual'],
    ['baptismgown', '洗礼の白衣', { linen: 1 }, 0.3, 10, 0, 1, '赤子が教会で祝福を受けるときの白い衣。', 'ritual'],
    ['swaddling', 'おくるみ', { linen: 1 }, 0.2, 2, 0, 2, '生まれた赤子を包む布。', 'tool'],
    ['childclothes', '子どもの服', { hempcloth: 1 }, 0.3, 3, 0, 2, '子どもの小さな服。兄弟で着回す。', 'wear'],
    ['nightgown', '寝間着', { linen: 2 }, 0.4, 8, 0, 1, '寝るときに着るゆったりした衣。', 'wear'],
    ['bathrobe', '湯上がりの長衣', { cottoncloth: 3 }, 0.8, 12, 0, 1, '湯屋で着る厚手の長衣。', 'luxury'],
    ['festivalmask', '仮面祭の仮面', { wood: 1, feather: 2, dye: 1 }, 0.2, 12, 0, 1, '仮面祭で身分を隠して踊るための仮面。', 'ritual'],
    ['masquegown', '仮面舞踏会の衣装', { silkcloth: 3, velvet: 1 }, 1.4, 260, 2, 0, '貴族が仮面舞踏会で着る華やかな衣装。', 'luxury'],
  ];
  for (const [id, name, from, w, v, rare, dem, desc, uk] of FES) add(F, { id, name, sub: 'festive', w, v, rare, demand: dem, src: [CR],
    use: [uWear('着る'), { k: uk === 'wear' ? 'gift' : uk, note: uk === 'ritual' ? '祭り・婚礼・葬儀' : undefined }, ...(v >= 100 ? [{ k: 'luxury' }] : [])],
    make: { from, by: id === 'festivalmask' ? 'carpenter' : 'tailor', t: r(2 + v / 12, 1) }, eq: { slot: id === 'festivalmask' || id === 'mourningveil' ? 'head' : 'armor', def: 0 }, desc });
  // ---- 帯と小物 ----
  const BLT = [
    ['leatherbelt', '革帯', { leather: 1, iron: 0 }, 0.3, 4, 0, 3, '留め金の付いた革の帯。剣や袋を下げる。'],
    ['swordbelt', '剣帯', { leather: 2, iron: 1 }, 0.5, 10, 0, 1, '剣を吊るす肩掛けの帯。'],
    ['silksash', '絹の飾り帯', { silkcloth: 1 }, 0.1, 30, 1, 1, '貴族が腰に巻く色鮮やかな帯。'],
    ['ropebelt', '縄の帯', { rope: 1 }, 0.2, 0.5, 0, 1, '修道士や貧しい者が締める縄。'],
    ['collar', '飾り襟', { linen: 1, lace: 1 }, 0.1, 25, 1, 1, '首周りを飾る白い襟。'],
    ['woolscarf', '毛糸の襟巻き', { woolyarn: 3 }, 0.2, 5, 0, 2, '首に巻く毛糸の布。'],
    ['furmuff', '毛皮の手あぶり', { fox_pelt: 1 }, 0.3, 25, 1, 0, '両手を入れて温める毛皮の筒。貴婦人の冬の持ち物。'],
    ['handkerchief', '手巾', { linen: 1 }, 0.02, 1, 0, 2, '汗をふく小さな布。刺繍して恋人に贈る。'],
    ['shawl', '肩掛け', { woolcloth: 1 }, 0.4, 7, 0, 2, '女が肩に羽織る四角い布。'],
    ['earmuffs', '毛皮の耳当て', { rabbit_pelt: 1 }, 0.1, 4, 0, 1, '冬に耳を守る毛皮。'],
  ];
  for (const [id, name, from, w, v, rare, dem, desc] of BLT) {
    for (const k in from) if (!from[k]) delete from[k];
    add(F, { id, name, sub: 'accessory_cloth', w, v, rare, demand: dem, src: [CR],
      use: [uWear('身に着ける'), ...(v >= 20 ? [{ k: 'luxury' }, { k: 'gift' }] : [{ k: 'gift' }])], make: { from, by: /革|剣帯/.test(name) ? 'leatherworker' : /毛皮/.test(name) ? 'furrier' : 'tailor', t: r(1 + v / 8, 1) },
      eq: { slot: 'accessory', ...(/毛皮|襟巻き|肩掛け/.test(name) ? { warm: 1 } : {}) }, desc });
  }
}
