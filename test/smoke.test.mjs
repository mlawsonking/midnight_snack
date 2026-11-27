import { createState, step, legalPlacements, place, undo, startRun, runToEnd, stateHash, resetRun, hint, routeOf, levelList, explain, tourStops, reaction, LEVEL_1, LEVEL_LIST } from '../src/engine.js';
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

  // --- Milestone 2 + teaching pass: four houses (the teaching house first; createState defaults to the cottage) ---
  const list = levelList();
  assert.equal(list.length, 4, 'four houses');
  assert.deepEqual(list.map((l) => l.id), ['littlehouse', 'cottage', 'tallhouse', 'bighouse']);
  assert.equal(createState(1).levelId, 'cottage', 'default level is still the cottage');
  assert.ok(list[3].budget < list[1].budget && list[3].budget < list[2].budget, 'the big house has the tightest budget of the M2 houses');
  assert.equal(createState(1, 2).levelId, 'tallhouse'); assert.equal(createState(1, 'bighouse').levelId, 'bighouse'); assert.equal(createState(1, LEVEL_LIST[3]).levelId, 'bighouse');
  for (const n of [1, 2, 3, 4]) assert.equal(createState(1, 0, { players: n }).players, n);
  assert.equal(createState(1, 0, { players: 9 }).players, 4);
  const one = place(createState(1, 0, { players: 1 }), { type: 'dot', x: 0, y: 1 }); assert.equal(one.turn, 0, 'one player keeps the turn');
  const mk = (li, ps) => ps.reduce((s, p) => { const n = place(s, p); assert.notEqual(n, s, 'legal ' + JSON.stringify(p)); return n; }, createState(5, li));
  for (let li = 1; li < 4; li++) {
    const L = LEVEL_LIST[li];
    const tags = new Set();
    for (const sol of L.solutions) {
      const r = runToEnd(mk(li, sol));
      assert.equal(r.result, 'win', L.id + ' listed solution wins'); assert.ok(r.noise <= L.budget);
      tags.add(routeOf(r.state));
      const h = stateHash(r.state);
      for (let i = 0; i < 100; i++) assert.equal(stateHash(runToEnd(mk(li, sol)).state), h, L.id + ' deterministic');
    }
    assert.ok(tags.size >= (li === 3 ? 3 : 2), L.id + ' has distinct routes: ' + [...tags].join(' | '));
    assert.notEqual(runToEnd(createState(1, li)).result, 'win', L.id + ' empty house fails');
    const h0 = hint(createState(1, li));
    assert.ok(h0 && place(createState(1, li), h0) !== createState(1, li), L.id + ' hint is a legal placement');
  }
  // house 2: both floors buildable, the cookie tumbles down the stairs, the grown-up uses them
  assert.ok(legalPlacements(createState(1, 2)).some((p) => p.y === 0) && legalPlacements(createState(1, 2)).some((p) => p.y === 1));
  assert.equal(place(createState(1, 2), { type: 'rampR', x: 4, y: 0 }).parts.length, 0, 'no building on the stair head');
  const pr = runToEnd(mk(2, LEVEL_LIST[2].solutions[2])).state;
  assert.ok(pr.events.some((e) => e.type === 'tumble' && e.who === 'cookie'), 'cookie tumbles down the stairs');
  assert.ok(pr.events.some((e) => e.type === 'stairs' && e.who === 'parent'), 'grown-up walks down the stairs');
  // house 3: tight budget and interfering parts
  const noisy = runToEnd(mk(3, [{ type: 'dot', x: 0, y: 0 }]));
  assert.equal(noisy.result, 'woke', 'dot alone is too noisy in the big house');
  const wrong = runToEnd(mk(3, [...LEVEL_LIST[3].solutions[0], { type: 'ball', x: 1, y: 1 }]));
  assert.notEqual(wrong.result, 'win'); assert.equal(wrong.state.events.find((e) => e.type === 'pickUp').what.slice(0, 4), 'ball', 'the dog fetches the wrong thing');
  // toy mouse: the cat chases it, it competes with the red dot, the nearer lure wins
  const lured = runToEnd(mk(3, [{ type: 'dot', x: 0, y: 0 }, { type: 'mouse', x: 10, y: 0 }]));
  assert.ok(lured.state.events.some((e) => e.type === 'squeak'), 'cat catches the mouse');
  assert.ok(!lured.state.jar.tipped, 'a nearer mouse pulls the cat away from the dot and the jar');
  const far = runToEnd(mk(3, [{ type: 'dot', x: 6, y: 0 }, { type: 'mouse', x: 3, y: 0 }]));
  assert.ok(far.state.jar.tipped && !far.state.events.some((e) => e.type === 'squeak'), 'a nearer red dot beats a farther mouse');
  const mo = runToEnd(mk(3, LEVEL_LIST[3].solutions[2])).state;
  assert.ok(mo.events.some((e) => e.type === 'jarTip' && e.who.indexOf('mouse') === 0), 'a rolling toy mouse can tip the jar');

  // --- teaching pass ---
  // house 1 (teaching house): the red dot by the jar alone wins; every other single piece does not
  const teach = createState(1, 0);
  assert.ok(Object.values(teach.inventory).reduce((a, b) => a + b, 0) <= 2, 'one or two parts in the tray');
  let singleWins = 0;
  for (const pl of legalPlacements(teach)) {
    const r = runToEnd(place(teach, pl));
    if (pl.type === 'dot' && pl.x === 0) { assert.equal(r.result, 'win', 'the dot alone wins'); assert.equal(routeOf(r.state), 'tip:cat door:none carry:dog'); }
    else assert.notEqual(r.result, 'win', 'single ' + JSON.stringify(pl) + ' must not win');
    if (r.result === 'win') singleWins++;
  }
  assert.equal(singleWins, 1, 'exactly one single-piece win');
  assert.notEqual(runToEnd(teach).result, 'win', 'empty teaching house fails');
  assert.deepEqual(hint(teach), { type: 'dot', x: 0, y: 1 }, 'teaching hint is the dot by the jar');
  // explain(): the link that never happened
  assert.equal(explain(teach), null, 'no explanation before a run');
  const ramp1 = explain(runToEnd(place(createState(1, 1), { type: 'rampR', x: 2, y: 1 })).state); // the playtest case
  assert.equal(ramp1.result, 'stuck'); assert.equal(ramp1.reason, 'catAsleep'); assert.equal(ramp1.bubble, 'cat');
  assert.deepEqual([ramp1.x, ramp1.y, ramp1.spot.x, ramp1.spot.y], [1, 1, 0, 1], 'bubble on the cat, spotlight on the jar');
  const far1 = explain(runToEnd(place(teach, { type: 'dot', x: 4, y: 1 })).state);
  assert.equal(far1.reason, 'catMissedJar'); assert.equal(far1.bubble, 'cat');
  const roll1 = explain(runToEnd(mk(1, [{ type: 'dot', x: 0, y: 1 }, { type: 'rampR', x: 2, y: 1 }])).state);
  assert.equal(roll1.reason, 'cookieStopped'); assert.equal(roll1.bubble, 'dog'); assert.deepEqual(roll1.spot, { x: 5, y: 1 });
  const door1 = explain(runToEnd(mk(1, [{ type: 'dot', x: 0, y: 1 }, { type: 'rampR', x: 2, y: 1 }, { type: 'rampR', x: 4, y: 1 }])).state);
  assert.equal(door1.reason, 'closedDoor', 'the cookie stops at the closed kids door'); assert.equal(door1.bubble, 'door');
  const woke1 = explain(woke.state);
  assert.equal(woke1.result, 'woke'); assert.equal(woke1.reason, 'noiseWokeBaby'); assert.equal(woke1.bubble, 'door'); assert.equal(woke1.event.type, 'creak');
  assert.equal(woke1.also.bubble, 'baby', 'the crying baby is the second link');
  const bigLoud = explain(noisy.state); assert.equal(bigLoud.reason, 'loudDoor'); assert.equal(bigLoud.bubble, 'door');
  const loop1 = explain(runToEnd(build([['dot', 0], ['rampR', 2], ['rampL', 5]])).state); assert.equal(loop1.result, 'timeout'); assert.ok(loop1.reason);
  const wrong1 = explain(wrong.state); assert.ok(wrong1.result !== 'win' && wrong1.bubble);
  assert.equal(explain(runToEnd(place(teach, { type: 'dot', x: 0, y: 1 })).state).reason, 'win');
  // tour stops and ghost reactions come from level data
  assert.deepEqual(tourStops(teach).map((t) => t.bubble), ['cat', 'dog', 'meter']);
  assert.deepEqual(tourStops(createState(1, 1)).map((t) => t.bubble), ['cat', 'tip', 'dog', 'door', 'baby', 'meter']);
  assert.equal(tourStops(createState(1, 3))[0].bubble, 'catMouse');
  assert.equal(reaction(teach, { type: 'dot', x: 0, y: 1 }).bubble, 'cat');
  assert.equal(reaction(teach, { type: 'rampR', x: 2, y: 1 }), null);
  assert.equal(reaction(createState(1, 1), { type: 'string', x: 5, y: 1 }).bubble, 'door');
  assert.equal(reaction(createState(1, 1), { type: 'ball', x: 4, y: 1 }).bubble, 'dog');
  assert.equal(reaction(createState(1, 1), { type: 'dot', x: 6, y: 1 }), null, 'the cat cannot see past the closed door');
  assert.equal(reaction(createState(1, 3), { type: 'mouse', x: 4, y: 0 }).bubble, 'catMouse');
  console.log('smoke test: PASS');
} catch (e) { console.error('smoke test: FAIL', e.message); process.exit(1); }
