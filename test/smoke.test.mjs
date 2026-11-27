import { createState, step, legalPlacements, place, undo, startRun, runToEnd, stateHash, resetRun, hint, routeOf, levelList, LEVEL_1, LEVEL_LIST } from '../src/engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const run = (seed, n) => { let s = createState(seed); for (let i = 0; i < n; i++) s = step(s); return JSON.stringify(s); };
try {
  assert.deepEqual(JSON.parse(run(42, 50)), JSON.parse(run(42, 50)), 'same seed must match');
  assert.equal(JSON.parse(run(42, 50)).tick, 50);
  let differs = false;
  for (let s = 1; s < 20 && !differs; s++) if (run(s, 5) !== run(s + 100, 5)) differs = true;
  assert.ok(differs, 'different seeds must differ');
  const src = readFileSync(fileURLToPath(new URL('../src/engine.js', import.meta.url)), 'utf8')
    .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['document', 'window', 'canvas', 'Math.random', 'Date', 'import ', 'navigator'])
    assert.ok(!src.includes(bad), 'engine.js must not contain ' + bad);

  // --- placement ---
  const s0 = createState(7);
  const legal = legalPlacements(s0);
  assert.ok(legal.length > 0, 'some legal placements');
  const s1 = place(s0, { type: 'dot', x: 0, y: 1 });
  assert.notEqual(s1, s0); assert.equal(s1.parts.length, 1); assert.equal(s1.inventory.dot, 0); assert.equal(s1.turn, 1);
  assert.equal(s0.parts.length, 0, 'place must not mutate input');
  const h1 = stateHash(s1);
  for (const bad of [{ type: 'dot', x: 0, y: 1 }, { type: 'rampR', x: 7, y: 1 }, { type: 'rampR', x: 1, y: 1 }, { type: 'rampR', x: 2, y: 0 }, { type: 'string', x: 2, y: 1 }, { type: 'nope', x: 2, y: 1 }, { type: 'rampR', x: 99, y: 1 }]) {
    assert.equal(place(s1, bad), s1, 'illegal placement rejected: ' + JSON.stringify(bad));
  }
  assert.equal(stateHash(s1), h1, 'state unchanged after rejections');
  assert.equal(place(s1, { type: 'dot', x: 5, y: 1 }), s1, 'inventory limit (one dot)');
  let inv = place(place(s1, { type: 'rampR', x: 2, y: 1 }), { type: 'rampR', x: 4, y: 1 });
  assert.equal(inv.inventory.rampR, 0);
  assert.equal(place(inv, { type: 'rampR', x: 5, y: 1 }), inv, 'inventory limit (two rampR)');
  assert.ok(!legalPlacements(inv).some((p) => p.type === 'rampR'), 'legalPlacements honours inventory');
  for (const p of legal) assert.notEqual(place(s0, p), s0, 'every listed placement is accepted');
  // --- undo ---
  const u0 = place(place(s0, { type: 'dot', x: 0, y: 1 }), { type: 'string', x: 5, y: 1 }); // p0 dot, p1 string
  const u1 = undo(u0, 0);
  assert.equal(u1.parts.length, 1); assert.equal(u1.parts[0].type, 'string'); assert.equal(u1.inventory.dot, 1); assert.equal(u1.turn, 0);
  assert.equal(undo(u1, 0), u1, 'nothing left to undo for player 0');
  const u2 = undo(undo(u0, 1), 0); assert.equal(u2.parts.length, 0); assert.deepEqual(u2.inventory, createState(7).inventory, 'undo all refunds inventory');
  assert.equal(undo(startRun(u0), 0).phase, 'run', 'no undo during run');
  // --- runs, routes and determinism ---
  const build = (list) => list.reduce((s, [t, x]) => { const n = place(s, { type: t, x, y: 1 }); assert.notEqual(n, s, 'setup placement ' + t + x); return n; }, createState(3));
  const routes = { dog: [['dot', 0], ['string', 5]], roll: [['dot', 0], ['rampR', 2], ['rampR', 4], ['string', 5]], baby: [['dot', 0], ['rampR', 2], ['rampR', 5]] };
  for (const [name, list] of Object.entries(routes)) {
    const r = runToEnd(build(list));
    assert.equal(r.result, 'win', name + ' route wins'); assert.ok(r.noise <= LEVEL_1.budget);
    assert.equal(r.state.phase, 'done');
  }
  const woke = runToEnd(build([['dot', 0]]));
  assert.equal(woke.result, 'woke'); assert.equal(woke.failedEvent.type, 'cry'); assert.ok(woke.failedAtTick > 0); assert.ok(woke.noise > LEVEL_1.budget);
  assert.equal(runToEnd(createState(3)).result, 'stuck');
  assert.equal(runToEnd(build([['dot', 0], ['rampR', 2], ['rampL', 5]])).result, 'timeout');
  const ref = build(routes.baby); const refHash = stateHash(runToEnd(ref).state);
  for (let i = 0; i < 100; i++) assert.equal(stateHash(runToEnd(ref).state), refHash, 'identical run ' + i);
  let a = startRun(ref), b = startRun(ref);
  while (a.phase === 'run') { a = step(a); b = step(b); assert.equal(stateHash(a), stateHash(b)); }
  // after a failed run the machine stays as built and the failure is kept for marking
  const back = resetRun(woke.state);
  assert.equal(back.phase, 'build'); assert.equal(back.parts.length, 1); assert.equal(back.lastFailure.result, 'woke'); assert.equal(back.lastFailure.cause.type, 'creak');
  assert.equal(runToEnd(place(back, { type: 'string', x: 5, y: 1 })).result, 'win', 'continue building after failure');

  // --- Milestone 2: three houses ---
  const list = levelList();
  assert.equal(list.length, 3, 'three houses');
  assert.deepEqual(list.map((l) => l.id), ['cottage', 'tallhouse', 'bighouse']);
  assert.ok(list[2].budget < list[0].budget && list[2].budget < list[1].budget, 'house 3 has the tightest budget');
  assert.equal(createState(1, 1).levelId, 'tallhouse'); assert.equal(createState(1, 'bighouse').levelId, 'bighouse'); assert.equal(createState(1, LEVEL_LIST[2]).levelId, 'bighouse');
  for (const n of [1, 2, 3, 4]) assert.equal(createState(1, 0, { players: n }).players, n);
  assert.equal(createState(1, 0, { players: 9 }).players, 4);
  const one = place(createState(1, 0, { players: 1 }), { type: 'dot', x: 0, y: 1 }); assert.equal(one.turn, 0, 'one player keeps the turn');
  const mk = (li, ps) => ps.reduce((s, p) => { const n = place(s, p); assert.notEqual(n, s, 'legal ' + JSON.stringify(p)); return n; }, createState(5, li));
  for (let li = 0; li < 3; li++) {
    const L = LEVEL_LIST[li];
    const tags = new Set();
    for (const sol of L.solutions) {
      const r = runToEnd(mk(li, sol));
      assert.equal(r.result, 'win', L.id + ' listed solution wins'); assert.ok(r.noise <= L.budget);
      tags.add(routeOf(r.state));
      const h = stateHash(r.state);
      for (let i = 0; i < 100; i++) assert.equal(stateHash(runToEnd(mk(li, sol)).state), h, L.id + ' deterministic');
    }
    assert.ok(tags.size >= (li === 2 ? 3 : 2), L.id + ' has distinct routes: ' + [...tags].join(' | '));
    assert.notEqual(runToEnd(createState(1, li)).result, 'win', L.id + ' empty house fails');
    const h0 = hint(createState(1, li));
    assert.ok(h0 && place(createState(1, li), h0) !== createState(1, li), L.id + ' hint is a legal placement');
  }
  // house 2: both floors buildable, the cookie tumbles down the stairs, the grown-up uses them
  assert.ok(legalPlacements(createState(1, 1)).some((p) => p.y === 0) && legalPlacements(createState(1, 1)).some((p) => p.y === 1));
  assert.equal(place(createState(1, 1), { type: 'rampR', x: 4, y: 0 }).parts.length, 0, 'no building on the stair head');
  const pr = runToEnd(mk(1, LEVEL_LIST[1].solutions[2])).state;
  assert.ok(pr.events.some((e) => e.type === 'tumble' && e.who === 'cookie'), 'cookie tumbles down the stairs');
  assert.ok(pr.events.some((e) => e.type === 'stairs' && e.who === 'parent'), 'grown-up walks down the stairs');
  // house 3: tight budget and interfering parts
  const noisy = runToEnd(mk(2, [{ type: 'dot', x: 0, y: 0 }]));
  assert.equal(noisy.result, 'woke', 'dot alone is too noisy in the big house');
  const wrong = runToEnd(mk(2, [...LEVEL_LIST[2].solutions[0], { type: 'ball', x: 1, y: 1 }]));
  assert.notEqual(wrong.result, 'win'); assert.equal(wrong.state.events.find((e) => e.type === 'pickUp').what.slice(0, 4), 'ball', 'the dog fetches the wrong thing');
  // toy mouse: the cat chases it, it competes with the red dot, the nearer lure wins
  const lured = runToEnd(mk(2, [{ type: 'dot', x: 0, y: 0 }, { type: 'mouse', x: 10, y: 0 }]));
  assert.ok(lured.state.events.some((e) => e.type === 'squeak'), 'cat catches the mouse');
  assert.ok(!lured.state.jar.tipped, 'a nearer mouse pulls the cat away from the dot and the jar');
  const far = runToEnd(mk(2, [{ type: 'dot', x: 6, y: 0 }, { type: 'mouse', x: 3, y: 0 }]));
  assert.ok(far.state.jar.tipped && !far.state.events.some((e) => e.type === 'squeak'), 'a nearer red dot beats a farther mouse');
  const mo = runToEnd(mk(2, LEVEL_LIST[2].solutions[2])).state;
  assert.ok(mo.events.some((e) => e.type === 'jarTip' && e.who.indexOf('mouse') === 0), 'a rolling toy mouse can tip the jar');
  console.log('smoke test: PASS');
} catch (e) { console.error('smoke test: FAIL', e.message); process.exit(1); }
