// 開発部：畑でしか育たない魔法の作物（docs/畑と地域の食料.md 1-4）。データだけのファイル。書き方は docs/素材の決まり.md
// 畑の区画に植えたときだけ採れる（js/farming.js）。野で摘む・無作為に採る一覧には入れないので、src の on は空にしておく。
export default [
  { id: 'moonwheat', name: '月光麦', cat: 'plant', sub: 'grain', w: 1, v: 14, stack: 20, rare: 2, src: [{ how: 'harvest', on: [] }], use: [{ k: 'food', note: '魔力が戻るパン' }, { k: 'magic', note: '魔法学園が高く買う' }, { k: 'trade' }], demand: 1, food: 9, keep: 200, fx: { mp: 10 }, desc: '遺跡や魔石の鉱脈のそばの畑でだけ育つ、銀色に光る麦。冬至の夜に刈る。土の魔力を吸い尽くす。' },
  { id: 'frostberry', name: '霜苺', cat: 'plant', sub: 'fruit', w: 0.01, v: 2, stack: 50, rare: 1, src: [{ how: 'harvest', on: [] }], use: [{ k: 'food', note: '冬に採れる唯一の生の果物' }, { k: 'medicine', note: '寒さ負けを防ぐ' }], demand: 2, food: 2, keep: 20, desc: '雪原の縁の畑で、霜の下に赤く実る苺。' },
  { id: 'dragonchili', name: '竜舌唐辛子', cat: 'plant', sub: 'spice', w: 0.01, v: 4, stack: 50, rare: 1, src: [{ how: 'harvest', on: [] }], use: [{ k: 'food', note: '寒さしのぎの香辛料・兵の士気' }, { k: 'magic', note: '燻すと魔物よけの煙' }, { k: 'trade' }], demand: 1, food: 1, keep: 365, desc: '荒れ地や溶岩のそばで育つ、火のように赤く光る唐辛子。' },
  { id: 'spiritbean', name: '精霊豆', cat: 'plant', sub: 'bean', w: 0.5, v: 3, stack: 50, rare: 1, src: [{ how: 'harvest', on: [] }], use: [{ k: 'food', note: '疲れの取れる豆' }, { k: 'fertilize', note: '植えた畑の土が肥える' }], demand: 2, food: 9, keep: 365, fx: { stamina: 10 }, desc: '森を切り開いた畑で淡く光る豆。休耕の代わりに植えると土が肥える。' },
  { id: 'screamroot', name: '叫び根', cat: 'plant', sub: 'magicherb', w: 0.05, v: 40, stack: 20, rare: 2, src: [{ how: 'harvest', on: [] }], use: [{ k: 'medicine', note: '高い薬' }, { k: 'magic', note: '錬金術の材料' }], demand: 1, keep: 60, fx: { sleep: 30 }, desc: '墓地や暗い森の縁の畑で育てる人の形の根（畑で育てたマンドラゴラ）。抜く人は耳栓が要る。' },
];
