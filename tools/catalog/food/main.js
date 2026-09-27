const { items } = require('./h');
for (const f of ['a_staple', 'b_meat', 'c_veg', 'd_drink', 'e_special', 'f_cond']) require('./' + f);
module.exports = items;
if (require.main === module) {
  const subs = {}; for (const i of items) subs[i.sub] = (subs[i.sub] || 0) + 1;
  console.log(items.length, subs);
}
