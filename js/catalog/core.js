// 担当のあいだで誰も作っていなかった基本の品（部長が補った）
export default [
  { id: 'honey', name: 'はちみつ', cat: 'beast', sub: 'bee', w: 0.5, v: 4, stack: 20, rare: 0, demand: 2,
    src: [{ how: 'milk', on: ['bee'], rate: 1 }, { how: 'forage', on: ['forest', 'dense'], rate: 0.1 }],
    use: [{ k: 'food' }, { k: 'craft', note: '蜂蜜酒・菓子・薬の材料' }, { k: 'medicine', note: '傷に塗る' }, { k: 'trade' }],
    food: 8, desc: '養蜂家の巣箱からとれる甘い蜜。腐らない。' },
  { id: 'egg', name: '鶏の卵', cat: 'beast', sub: 'egg', w: 0.06, v: 0.5, stack: 30, rare: 0, demand: 3,
    src: [{ how: 'milk', on: ['chicken'], rate: 1 }], keep: 10,
    use: [{ k: 'food' }, { k: 'craft', note: 'パン・菓子・料理の材料、絵の具のつなぎ' }], food: 5, desc: '鶏小屋から毎朝とれる卵。' },
  { id: 'milk', name: '牛の乳', cat: 'beast', sub: 'milk', w: 1, v: 0.8, stack: 10, rare: 0, demand: 3,
    src: [{ how: 'milk', on: ['cow'], rate: 1 }], keep: 1,
    use: [{ k: 'drink' }, { k: 'craft', note: 'チーズ・バター・乳粥の材料' }], drink: 15, food: 4, desc: 'しぼりたての牛の乳。すぐ傷む。' },
  { id: 'lard', name: '豚脂', cat: 'beast', sub: 'fat', w: 0.5, v: 1.5, stack: 20, rare: 0, demand: 2,
    src: [{ how: 'craft', }], make: { from: { pork: 1 }, by: 'butcher', t: 1 }, keep: 60,
    use: [{ k: 'craft', note: '揚げ物・パイ生地・石鹸・蝋燭の材料' }, { k: 'food' }, { k: 'fuel', note: '灯りの油' }], food: 6, desc: '豚の脂を煮溶かして固めたもの。' },
];
