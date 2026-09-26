import { Sim } from '../../../../js/sim.js';
const days = +process.argv[2] || 3;
const sim = new Sim().newWorld(12345);
const S = sim.S;
const t0 = Date.now();
const orig = sim.pushLog.bind(sim); const caught = [];
sim.pushLog = (t, ...a) => { if (/家賃|追い出|買い取|空き家|パーティー|相続|受け継|畑を買|やって来た|飛び出した|宿屋|解散/.test(t)) caught.push(t); return orig(t, ...a); };
const logs = [];
for (let i = 0; i < days * 1440 / 0.5; i++) { sim.step(0.5); if (sim.events.length > 2000) sim.events.length = 0; }
const L = sim.living();
const hhs = Object.values(S.households);
const houses = S.world.buildings.filter((b) => b.type === 'house');
console.log(JSON.stringify({
  sec: (Date.now() - t0) / 1000, living: L.length,
  purseAvg: Math.round(L.reduce((s, p) => s + (p.purse || 0), 0) / L.length), purseMax: Math.round(Math.max(...L.map((p) => p.purse || 0))),
  hhMoneyAvg: Math.round(hhs.reduce((s, h) => s + h.money, 0) / hhs.length), negHh: hhs.filter((h) => h.money < 0).length,
  owned: houses.filter((b) => b.hh != null && b.owner === b.hh).length, rented: houses.filter((b) => b.hh != null && b.owner != null && b.owner !== b.hh).length, empty: houses.filter((b) => b.hh == null).length,
  street: hhs.filter((h) => h.street).length,
  parties: Object.values(S.advParties || {}).filter((p) => !p.gone).map((p) => `${p.name}(${p.members.length})done${p.done}`),
  gone: Object.values(S.advParties || {}).filter((p) => p.gone).length,
  quests: (S.quests || []).map((q) => q.state).join(','),
  land: hhs.filter((h) => h.land > 0).length + ' landed / tenantFarmers ' + hhs.filter((h) => !h.land && h.members.some((id) => S.people[id].job === 'farmer')).length,
  keepers: Object.values(S.creatures).filter((c) => c.keeper != null).length,
}, null, 1));
const recent = caught.slice(-25);
const mem = L.flatMap((p) => p.memories.filter((m) => ['inherit','rent','evicted','house','party','land'].includes(m.k)).map((m) => p.given + ':' + m.txt)).slice(0, 20);
console.log(mem.join('\n'));
console.log(recent.join('\n'));
