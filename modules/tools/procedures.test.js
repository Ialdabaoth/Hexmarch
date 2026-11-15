// node --test modules/tools/procedures.test.js
const test = require('node:test'), assert = require('node:assert');
const P = require('./procedures.js'), E9 = require('../e9-core/procedures/e9.json');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };  // rng values in [0, 1)
const MOD = { events: {
  triggers: [{ id: 'bog', on: 'manual', label: 'Bog', run: { table: 'bog-hazards' } }, { id: 'loop', on: 'manual', run: { call: 'loop' } }],
  tables: { 'bog-hazards': { die: 'd6', rows: [{ roll: [1, 3], text: 'Mist.' }, { roll: [4, 6], text: 'Mud.', call: 'mired', with: { threat: 'serious' } }] } },
  macros: { threat: ['minor', 'serious'] } },
  procedures: { e9: { format: 'hexmarch-procedures/1', rules: ['e9'], aliases: { mired: 'stuck' }, macros: { threat: { minor: { damage: 1 }, serious: { damage: '1d6' } } },
    procedures: { stuck: { params: ['threat'], steps: [{ text: 'The bog grips ({threat}).' }, { roll: '1d6', as: 'r' }, { branch: 'r', ranges: [{ roll: [1, 3], steps: [{ effect: 'damage', target: 'who', amount: '{threat.damage}', text: 'Hurt for {amount}.' }] }, { roll: [4, 6], steps: [{ effect: 'clock', n: 1, unit: 'hour', text: 'An hour lost.' }] }] }] },
      loop: { steps: [{ call: 'loop' }] } } } } };

test('travel and sight-range answer from e9-core', () => {
  const l = P.load('e9', [E9], null);
  assert.strictEqual(P.ask(l, 'sight-range', { view: 'automatic' }), 6);  // by the hex's view grade (terrain traits)
  assert.strictEqual(P.ask(l, 'sight-range', { terrain: 'unknown-type' }), 3);
  assert.strictEqual(P.ask(l, 'travel', { terrain: 'bog', road: '' }), 1);  // retired by terrain traits
  assert.strictEqual(P.ask(P.load('acks', [E9], null), 'sight-range', { view: 'easy' }), undefined);  // not served
});

test('module procedures, aliases, macros and tables', () => {
  const l = P.load('e9', [E9], MOD);
  assert.deepStrictEqual(l.report, []);
  const e = P.run(l, l.triggers[0], { rng: seq(0.9, 0.0, 0.5) });  // d6 -> 6 (Mud), 1d6 -> 1 (hurt), damage 1d6 -> 4
  assert.deepStrictEqual(e.text, ['Mud.', 'The bog grips (serious).', 'Hurt for 4.']);
  assert.deepStrictEqual(e.effects, [{ effect: 'damage', target: 'who', amount: 4 }]);
  const e2 = P.run(l, l.triggers[0], { rng: seq(0.9, 0.9) });
  assert.strictEqual(e2.effects[0].effect, 'clock');
});

test('a loop stops at the depth limit', () => {
  const l = P.load('e9', [E9], MOD), e = P.run(l, l.triggers[1]);
  assert.ok(e.warnings.some(w => /deeper than 6/.test(w)));
});

test('the load report lists missing names and macros', () => {
  const l = P.load('mm', [E9], { events: { triggers: [{ id: 'x', on: 'manual', run: { call: 'ambush' } }], macros: { threat: ['deadly'] } } });
  assert.ok(l.report.some(w => /"ambush" is not a procedure of mm/.test(w)));
  assert.ok(l.report.some(w => /macro threat: "deadly"/.test(w)));
});

test('arithmetic in templates, walk, offers and previews', () => {
  const l = P.load('e9', [E9], null);
  assert.strictEqual(P.value('{mi} * {pace} / {mph}', { mi: 3, pace: 2, mph: 3 }), 2);
  assert.strictEqual(P.value('(1 + 2) * 3', {}), 9);
  assert.strictEqual(P.value('bog', {}), 'bog');
  assert.deepStrictEqual(P.offers(l, 'hex').map(o => o.name), ['navigate']);
  const seen = [];
  const e = P.run(l, 'navigate', { walk: (name, vars, sub, entry, stop) => { seen.push(stop); for (const mi of [3, 1.5]) seen.push(sub(name, { mi, mph: 3, to: 'x', traverse: 'easy', speed: 1 }).effects[0].hours); } });
  assert.deepStrictEqual(seen, ['queued', 1, 0.5]);
  assert.deepStrictEqual(e.warnings, []);
  assert.deepStrictEqual(P.rollsOf(l, 'navigate'), []);
});

test('e9 movement: move times a hex by the party speed (e9-core movement.md)', () => {
  const l = P.load('e9', [E9], null);
  const hours = w => P.run(l, { id: 'm', run: { call: 'move', with: w } }, { rng: () => 0.5 }).effects.find(e => e.effect === 'clock').hours;
  const hex = { mi: 3, mph: 3, to: 'x' };
  assert.strictEqual(hours({ ...hex, traverse: 'automatic', speed: 1 }), 1);    // a league an hour
  assert.strictEqual(hours({ ...hex, traverse: 'automatic', speed: 2 }), 0.5);  // forced march
  assert.strictEqual(hours({ ...hex, traverse: 'easy', speed: 0.5 }), 2);       // sneaking
  assert.strictEqual(hours({ ...hex, traverse: 'hard', speed: 0.5 }), 2);       // hard ground forces Climb/Swim/Maneuver
  const e = P.run(l, { id: 'm', run: { call: 'move', with: { ...hex, speed: 1 } } }, { rng: () => 0.5 });
  assert.deepStrictEqual(e.rolls, []);  // roll-free, so the Atlas can dry-run it
});
