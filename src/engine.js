/*
Midnight Snack - deterministic rules engine (Milestone 2).

Pure rules only: no rendering, no host APIs, no randomness except the seeded
PRNG below, no clock. Integer grid, one fixed tick per step. Plain objects and
arrays only, so it can be ported to Roku BrightScript.

HEADLESS API (all functions return NEW state objects; inputs are never mutated)
  createState(seed, level?, opts?)  -> state in phase 'build'. level: a level object, a level
                                      id ('cottage'), or an index into LEVEL_LIST (0, 1, 2).
                                      Defaults to LEVEL_1. opts.players 1..4 (default 2).
  legalPlacements(state)            -> [{type, x, y}] legal for the current player now.
  place(state, {type, x, y})        -> new state; the piece belongs to state.turn and the
                                      turn passes on. ILLEGAL: returns the SAME state object.
  undo(state, player)               -> that player's most recent piece taken back (inventory
                                      refunded, turn returns to them). Nothing: same object.
  lastPlacer(state)                 -> player index of the most recent piece, or -1.
  startRun(state)                   -> phase 'run', tick 0, machine reset to its start pose.
  step(state)                       -> one tick ('build': only tick + cosmetic PRNG; 'done':
                                      same object).
  runToEnd(state, maxTicks?)        -> {result, failedAtTick, failedEvent, ticks, noise, state}
                                      result: 'win' | 'woke' | 'stuck' | 'timeout'.
  resetRun(state)                   -> back to 'build', machine as built, failure kept in
                                      state.lastFailure for marking.
  hint(state)                       -> {type, x, y} a helpful legal placement from the level's
                                      known solutions, or null.
  routeOf(state)                    -> route tag of a finished run, e.g.
                                      'tip:cat door:string carry:roll stairs mouse'.
  stateHash(state)                  -> stable 8-hex FNV-1a hash of canonical state JSON.
  levelList()                       -> [{index, id, w, h, budget, floors}] in play order.
  explain(state)                    -> for a finished run: {result, reason, bubble, x, y, spot, also,
                                      event} naming the link that never happened (teaching pass).
  tourStops(state)                  -> [{bubble, who, x, y}] the habits worth showing in this house.
  reaction(state, {type, x, y})     -> {bubble, who, x, y} for the creature that would react to a
                                      piece put there, or null.
  LEVEL_LIST, LEVELS, LEVEL_0, LEVEL_1, PART_TYPES, mulberry32 are exported too.

PART TYPES: 'rampR', 'rampL' (sets roll direction, power 3), 'string' (tripwire tied to the
adjacent closed door: anything entering its cell opens the door quietly), 'ball' (an item;
may sit on a ramp), 'dot' (red-dot lamp), 'mouse' (wind-up toy mouse: an item the cat chases).

GRID: x 0..w-1, y 0..h-1 (y 0 is the top floor). A door sits between cell x and x+1 on
floor y. Stairs {x, y} join (x, y) (the stair head, a hole nobody builds on) to (x, y+1).

TICK ORDER (fixed): 1 cat, 2 dog, 3 baby, 4 parent, 5 items in id order (cookie first),
6 checks: noise over budget -> 'woke'; cookie on goal -> 'win'; quietLimit quiet ticks ->
'stuck'; tick limit -> 'timeout'. The baby hears events of the previous tick.

HABITS
  cat:    sleeps; chases the nearest lure it can see on its floor (no closed door between):
          the red dot or the toy mouse (a tie goes to the mouse). One cell per tick; it
          re-aims every tick. Entering the jar cell tips the jar. Entering a cell with a
          resting item knocks it rolling (power 2). Reaching the dot: sits. Reaching the
          mouse: catches it (squeak) and plays. A rolling item entering a sleeping cat's
          cell startles it (yowl). The cat does not use the stairs.
  dog:    sleeps; when an item lies at rest within dogView cells of its bed on its floor it
          fetches that item (the leftmost such item: it may fetch the wrong thing) and
          carries it to the kids' bed (the goal), using the stairs. Noses closed doors open
          (loud creak). Fetches once.
  baby:   cries once when it hears an event of noise >= threshold within babyHear cells on
          its floor, or when an item rolls into its crib.
  parent: wakes ('woke', the loss) only when the total noise exceeds the budget. When the
          baby cries the parent sleepwalks to the crib by the stairs, quietly opening doors.
  items:  roll one cell per tick while power lasts; a ramp sets direction and power; a wall
          or closed door stops them (thud). Rolling into a stair head they tumble down one
          floor and keep rolling (power stairPower). A rolling ball or mouse tips the jar.
Seed: only cosmetic values (snore rhythm) come from the PRNG, so outcomes never depend on it.
*/

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nextRand(s) {
  const a = (s.rng + 0x6d2b79f5) >>> 0;
  s.rng = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

export const PART_TYPES = ['rampR', 'rampL', 'string', 'ball', 'dot', 'mouse'];

const BASE_NOISE = { jarTip: 1, knock: 1, thud: 2, stringPull: 1, creak: 3, yowl: 3, cry: 3, tumble: 1, squeak: 1, doorOpen: 0, plop: 0, dogWake: 0, pickUp: 0, drop: 0, catWake: 0, hush: 0, stairs: 0 };
const DEFAULTS = { dogView: 1, babyHear: 4, babyThreshold: 2, rampPower: 3, knockPower: 2, jarPower: 2, stairPower: 2, quietLimit: 8, tickLimit: 240, stairs: [], solutions: [] };

function makeLevel(o) {
  const L = Object.assign({}, DEFAULTS, o);
  L.noise = Object.assign({}, BASE_NOISE, o.noise || {});
  if (!L.buildFloors) L.buildFloors = [o.buildY === undefined ? L.h - 1 : o.buildY];
  if (!L.jar.dir) L.jar = { x: L.jar.x, y: L.jar.y, dir: 1 };
  return L;
}
const P = (type, x, y) => ({ type, x, y });

// Teaching house (house 1 in play order): the red dot alone wins. The cat tips the jar, the
// cookie rolls to rest by the dog, the dog carries it through open doors to the kids' bed.
export const LEVEL_0 = makeLevel({
  id: 'littlehouse', w: 8, h: 2,
  rooms: [
    { id: 'attic', kind: 'attic', y: 0, x0: 0, x1: 3 }, { id: 'parents', kind: 'parents', y: 0, x0: 4, x1: 7 },
    { id: 'kitchen', kind: 'kitchen', y: 1, x0: 0, x1: 2 }, { id: 'hall', kind: 'hall', y: 1, x0: 3, x1: 4 },
    { id: 'kids', kind: 'kids', y: 1, x0: 5, x1: 7 },
  ],
  doors: [{ id: 'kitchenDoor', x: 2, y: 1, open: true }, { id: 'kidsDoor', x: 4, y: 1, open: true }, { id: 'parentsDoor', x: 3, y: 0, open: true }],
  jar: { x: 0, y: 1, dir: 1 }, goal: { x: 6, y: 1 }, buildFloors: [1],
  creatures: [{ id: 'cat', kind: 'cat', x: 1, y: 1 }, { id: 'dog', kind: 'dog', x: 3, y: 1 }, { id: 'parent', kind: 'parent', x: 6, y: 0 }],
  inventory: { rampR: 1, dot: 1 },
  budget: 4,
  solutions: [[P('dot', 0, 1)]],
});

// House 1: the cottage. Everything happens on the ground floor.
export const LEVEL_1 = makeLevel({
  id: 'cottage', w: 10, h: 2,
  rooms: [
    { id: 'attic', kind: 'attic', y: 0, x0: 0, x1: 3 }, { id: 'landing', kind: 'landing', y: 0, x0: 4, x1: 4 },
    { id: 'parents', kind: 'parents', y: 0, x0: 5, x1: 9 }, { id: 'kitchen', kind: 'kitchen', y: 1, x0: 0, x1: 2 },
    { id: 'hall', kind: 'hall', y: 1, x0: 3, x1: 5 }, { id: 'kids', kind: 'kids', y: 1, x0: 6, x1: 7 },
    { id: 'nursery', kind: 'nursery', y: 1, x0: 8, x1: 9 },
  ],
  doors: [{ id: 'kidsDoor', x: 5, y: 1, open: false }, { id: 'nurseryDoor', x: 7, y: 1, open: false }, { id: 'parentsDoor', x: 4, y: 0, open: true }],
  stairs: [{ x: 4, y: 0 }],
  jar: { x: 0, y: 1, dir: 1 }, goal: { x: 7, y: 1 }, buildFloors: [1],
  creatures: [{ id: 'cat', kind: 'cat', x: 1, y: 1 }, { id: 'dog', kind: 'dog', x: 3, y: 1 }, { id: 'baby', kind: 'baby', x: 9, y: 1 }, { id: 'parent', kind: 'parent', x: 7, y: 0 }],
  inventory: { rampR: 2, rampL: 1, string: 1, ball: 1, dot: 1 },
  budget: 6,
  solutions: [[P('dot', 0, 1), P('string', 5, 1)], [P('dot', 0, 1), P('rampR', 2, 1), P('rampR', 5, 1)], [P('dot', 0, 1), P('rampR', 2, 1), P('rampR', 4, 1), P('string', 5, 1)]],
});

// House 2: the tall house. The cookie jar is upstairs; the cookie has to come down the stairs.
export const LEVEL_2 = makeLevel({
  id: 'tallhouse', w: 10, h: 2,
  rooms: [
    { id: 'kitchen', kind: 'kitchen', y: 0, x0: 0, x1: 3 }, { id: 'landing', kind: 'landing', y: 0, x0: 4, x1: 4 },
    { id: 'parents', kind: 'parents', y: 0, x0: 5, x1: 9 }, { id: 'hall', kind: 'hall', y: 1, x0: 0, x1: 4 },
    { id: 'kids', kind: 'kids', y: 1, x0: 5, x1: 7 }, { id: 'nursery', kind: 'nursery', y: 1, x0: 8, x1: 9 },
  ],
  doors: [{ id: 'kidsDoor', x: 4, y: 1, open: false }, { id: 'nurseryDoor', x: 7, y: 1, open: false }, { id: 'parentsDoor', x: 4, y: 0, open: true }],
  stairs: [{ x: 4, y: 0 }],
  jar: { x: 0, y: 0, dir: 1 }, goal: { x: 7, y: 1 }, buildFloors: [0, 1],
  creatures: [{ id: 'cat', kind: 'cat', x: 2, y: 0 }, { id: 'dog', kind: 'dog', x: 2, y: 1 }, { id: 'baby', kind: 'baby', x: 9, y: 1 }, { id: 'parent', kind: 'parent', x: 8, y: 0 }],
  inventory: { rampR: 2, rampL: 1, string: 1, ball: 1, dot: 1 },
  budget: 7, babyHear: 5,
  solutions: [
    [P('dot', 0, 0), P('rampR', 1, 0), P('string', 4, 1), P('rampR', 5, 1)],
    [P('dot', 0, 0), P('rampR', 1, 0), P('string', 4, 1), P('rampL', 5, 1)],
    [P('dot', 0, 0), P('rampR', 1, 0), P('rampR', 4, 1)],
  ],
});

// House 3: the big house. Tight noise budget, a toy mouse, two staircases.
export const LEVEL_3 = makeLevel({
  id: 'bighouse', w: 12, h: 2,
  rooms: [
    { id: 'parents', kind: 'parents', y: 0, x0: 0, x1: 1 }, { id: 'landing', kind: 'landing', y: 0, x0: 2, x1: 2 },
    { id: 'kitchen', kind: 'kitchen', y: 0, x0: 3, x1: 8 }, { id: 'landing2', kind: 'landing', y: 0, x0: 9, x1: 9 },
    { id: 'attic', kind: 'attic', y: 0, x0: 10, x1: 11 }, { id: 'hall', kind: 'hall', y: 1, x0: 0, x1: 3 },
    { id: 'kids', kind: 'kids', y: 1, x0: 4, x1: 7 }, { id: 'hall2', kind: 'hall', y: 1, x0: 8, x1: 9 },
    { id: 'nursery', kind: 'nursery', y: 1, x0: 10, x1: 11 },
  ],
  doors: [{ id: 'kidsDoor', x: 3, y: 1, open: false }, { id: 'kidsDoor2', x: 7, y: 1, open: false }, { id: 'nurseryDoor', x: 9, y: 1, open: false }, { id: 'parentsDoor', x: 1, y: 0, open: true }],
  stairs: [{ x: 2, y: 0 }, { x: 9, y: 0 }],
  jar: { x: 7, y: 0, dir: -1 }, goal: { x: 6, y: 1 }, buildFloors: [0, 1],
  creatures: [{ id: 'cat', kind: 'cat', x: 8, y: 0 }, { id: 'dog', kind: 'dog', x: 0, y: 1 }, { id: 'baby', kind: 'baby', x: 11, y: 1 }, { id: 'parent', kind: 'parent', x: 0, y: 0 }],
  inventory: { rampR: 1, rampL: 1, string: 1, ball: 1, dot: 1, mouse: 1 },
  budget: 4,
  solutions: [
    [P('dot', 0, 0), P('rampL', 3, 0), P('string', 3, 1)],
    [P('dot', 0, 0), P('rampR', 6, 0), P('rampL', 9, 1), P('string', 8, 1)],
    [P('rampR', 6, 0), P('mouse', 6, 0), P('rampL', 9, 1), P('string', 8, 1)],
  ],
});

export const LEVEL_LIST = [LEVEL_0, LEVEL_1, LEVEL_2, LEVEL_3];
export const LEVELS = { littlehouse: LEVEL_0, cottage: LEVEL_1, tallhouse: LEVEL_2, bighouse: LEVEL_3 };

export function levelList() {
  return LEVEL_LIST.map((L, index) => ({ index, id: L.id, w: L.w, h: L.h, budget: L.budget, floors: L.buildFloors.slice() }));
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }
function lvl(s) { return LEVELS[s.levelId]; }
function sign(n) { return n > 0 ? 1 : n < 0 ? -1 : 0; }

function resolveLevel(level) {
  if (level === undefined || level === null) return LEVEL_1;
  if (typeof level === 'number') return LEVEL_LIST[level] || LEVEL_1;
  if (typeof level === 'string') return LEVELS[level] || LEVEL_1;
  if (!LEVELS[level.id]) LEVELS[level.id] = makeLevel(level);
  return LEVELS[level.id];
}

export function createState(seed, level, opts) {
  const L = resolveLevel(level);
  let players = (opts && opts.players) || 2;
  if (players < 1) players = 1;
  if (players > 4) players = 4;
  const s = {
    seed: seed >>> 0, rng: seed >>> 0, levelId: L.id, w: L.w, h: L.h, phase: 'build', tick: 0,
    players, turn: 0, inventory: clone(L.inventory), parts: [], nextPartId: 1, history: [],
    snore: [0, 0, 0, 0], lastFailure: null,
  };
  initMachine(s);
  return s;
}

function initMachine(s) {
  const L = lvl(s);
  s.doors = clone(L.doors);
  s.jar = { x: L.jar.x, y: L.jar.y, tipped: false };
  s.items = [{ id: 'cookie', kind: 'cookie', x: L.jar.x, y: L.jar.y, dir: 0, power: 0, state: 'inJar', bumped: false }];
  for (const p of s.parts) {
    if (p.type === 'ball' || p.type === 'mouse') s.items.push({ id: p.type + p.id, kind: p.type, x: p.x, y: p.y, dir: 0, power: 0, state: 'rest', bumped: false });
  }
  s.creatures = L.creatures.map((c) => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, homeX: c.x, homeY: c.y, mode: 'asleep', dir: 0, target: null, carrying: null }));
  s.noise = { budget: L.budget, total: 0 };
  s.events = [];
  s.nextEventId = 1;
  s.quiet = 0;
  s.result = null;
  s.failedAtTick = -1;
  s.failedEvent = null;
  s.overEvent = null;
}

// ---------- building ----------

function partAt(s, x, y) {
  const out = [];
  for (const p of s.parts) if (p.x === x && p.y === y) out.push(p);
  return out;
}
function isHome(L, x, y) { for (const c of L.creatures) if (c.x === x && c.y === y) return true; return false; }
function stairHead(L, x, y) { for (const st of L.stairs) if (st.x === x && st.y === y) return st; return null; }
function isRamp(p) { return p.type === 'rampR' || p.type === 'rampL'; }
function doorForString(L, x, y) {
  for (const d of L.doors) if (d.y === y && !d.open && (d.x === x || d.x + 1 === x)) return d;
  return null;
}

function cellLegal(s, type, x, y) {
  const L = lvl(s);
  if (L.buildFloors.indexOf(y) < 0 || x < 0 || x >= L.w) return false;
  if (stairHead(L, x, y)) return false;
  const here = partAt(s, x, y);
  if (type === 'dot') return here.length === 0;
  if ((x === L.jar.x && y === L.jar.y) || (x === L.goal.x && y === L.goal.y) || isHome(L, x, y)) return false;
  if (type === 'ball' || type === 'mouse') return here.length === 0 || (here.length === 1 && isRamp(here[0]));
  if (here.length !== 0) return false;
  if (type === 'string') return !!doorForString(L, x, y);
  return type === 'rampR' || type === 'rampL';
}

export function legalPlacements(s) {
  const out = [];
  if (s.phase !== 'build') return out;
  for (const type of PART_TYPES) {
    if (!(s.inventory[type] > 0)) continue;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (cellLegal(s, type, x, y)) out.push({ type, x, y });
  }
  return out;
}

export function place(state, pl) {
  if (!pl || state.phase !== 'build' || PART_TYPES.indexOf(pl.type) < 0) return state;
  if (!(state.inventory[pl.type] > 0) || !cellLegal(state, pl.type, pl.x, pl.y)) return state;
  const s = clone(state);
  const id = s.nextPartId++;
  const part = { id, type: pl.type, x: pl.x, y: pl.y, player: s.turn };
  if (pl.type === 'string') part.door = doorForString(lvl(s), pl.x, pl.y).id;
  s.parts.push(part);
  s.inventory[pl.type]--;
  s.history.push({ player: s.turn, partId: id });
  s.turn = (s.turn + 1) % s.players;
  initMachine(s);
  return s;
}

export function lastPlacer(s) { return s.history.length ? s.history[s.history.length - 1].player : -1; }

export function undo(state, player) {
  if (state.phase !== 'build') return state;
  let idx = -1;
  for (let i = state.history.length - 1; i >= 0; i--) if (state.history[i].player === player) { idx = i; break; }
  if (idx < 0) return state;
  const s = clone(state);
  const h = s.history.splice(idx, 1)[0];
  const pi = s.parts.findIndex((p) => p.id === h.partId);
  const part = s.parts.splice(pi, 1)[0];
  s.inventory[part.type]++;
  s.turn = player;
  initMachine(s);
  return s;
}

// A helpful next piece: from the known solution closest to what is built, the first piece
// that is missing and can legally go down now.
export function hint(s) {
  const L = lvl(s);
  if (s.phase !== 'build') return null;
  const has = (p) => s.parts.some((q) => q.type === p.type && q.x === p.x && q.y === p.y);
  let order = L.solutions.map((sol, i) => {
    let match = 0;
    for (const p of sol) if (has(p)) match++;
    return { sol, i, score: match * 2 - (s.parts.length - match) - sol.length * 0.01 };
  });
  order.sort((a, b) => b.score - a.score || a.i - b.i);
  for (const o of order) for (const p of o.sol) if (!has(p) && s.inventory[p.type] > 0 && cellLegal(s, p.type, p.x, p.y)) return { type: p.type, x: p.x, y: p.y };
  return null;
}

// ---------- running ----------

export function startRun(state) {
  if (state.phase !== 'build') return state;
  const s = clone(state);
  startInPlace(s);
  return s;
}
function startInPlace(s) {
  initMachine(s);
  s.phase = 'run';
  s.tick = 0;
  const L = lvl(s);
  for (const it of s.items) {
    const r = rampAt(s, it.x, it.y);
    if (r && it.state === 'rest') { it.state = 'roll'; it.dir = r; it.power = L.rampPower; }
  }
}

export function resetRun(state) {
  const s = clone(state);
  if (s.result && s.result !== 'win') {
    const cause = s.failedEvent && s.failedEvent.cause ? s.events.find((e) => e.id === s.failedEvent.cause) || null : null;
    s.lastFailure = { result: s.result, failedAtTick: s.failedAtTick, failedEvent: s.failedEvent, cause };
  }
  s.phase = 'build';
  s.tick = 0;
  initMachine(s);
  return s;
}

function emit(s, type, x, y, who, cause, what) {
  const n = lvl(s).noise[type] || 0;
  const e = { id: s.nextEventId++, tick: s.tick, type, x, y, noise: n, who: who || '', cause: cause || 0, what: what || '' };
  s.events.push(e);
  s.noise.total += n;
  if (s.noise.total > s.noise.budget && !s.overEvent) s.overEvent = e;
  s.acted = true;
  return e;
}

function rampAt(s, x, y) {
  for (const p of s.parts) if (p.x === x && p.y === y) {
    if (p.type === 'rampR') return 1;
    if (p.type === 'rampL') return -1;
  }
  return 0;
}
function closedDoorBetween(s, y, xa, xb) {
  const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
  for (const d of s.doors) if (d.y === y && !d.open && d.x >= lo && d.x < hi) return d;
  return null;
}
function creature(s, id) { for (const c of s.creatures) if (c.id === id) return c; return null; }
function item(s, id) { for (const it of s.items) if (it.id === id) return it; return null; }

function entered(s, x, y, who) {
  for (const p of s.parts) {
    if (p.type === 'string' && p.x === x && p.y === y) {
      const d = s.doors.find((dd) => dd.id === p.door);
      if (d && !d.open) { d.open = true; emit(s, 'stringPull', x, y, who); }
    }
  }
}

function tipJar(s, who) {
  if (s.jar.tipped) return;
  const L = lvl(s);
  s.jar.tipped = true;
  emit(s, 'jarTip', s.jar.x, s.jar.y, who);
  const c = s.items[0];
  if (c.state === 'inJar') { c.state = 'roll'; c.dir = L.jar.dir; c.power = L.jarPower; c.bumped = false; }
}

function dotPart(s) { for (const p of s.parts) if (p.type === 'dot') return p; return null; }

function lureFor(s, c) {
  let best = null, bd = 1000;
  for (const it of s.items) {
    if (it.kind !== 'mouse' || (it.state !== 'rest' && it.state !== 'roll') || it.y !== c.y) continue;
    if (closedDoorBetween(s, c.y, c.x, it.x)) continue;
    const d = Math.abs(it.x - c.x);
    if (d < bd) { bd = d; best = { kind: 'mouse', x: it.x, id: it.id }; }
  }
  const dot = dotPart(s);
  if (dot && dot.y === c.y && !closedDoorBetween(s, c.y, c.x, dot.x) && Math.abs(dot.x - c.x) < bd) best = { kind: 'dot', x: dot.x, id: '' };
  return best;
}

function catchMouse(s, c, it) {
  it.state = 'caught'; it.dir = 0; it.power = 0; it.x = c.x; it.y = c.y;
  c.mode = 'play';
  emit(s, 'squeak', c.x, c.y, 'cat', 0, it.id);
}

function actCat(s, c) {
  if (c.mode === 'pounce' || c.mode === 'play') return;
  const L = lvl(s);
  const lure = lureFor(s, c);
  if (c.mode !== 'chase') {
    if (lure) { c.mode = 'chase'; emit(s, 'catWake', c.x, c.y, 'cat'); }
    else if (c.mode === 'startled') c.mode = 'awake';
    return;
  }
  if (!lure) { c.mode = 'awake'; s.acted = true; return; }
  if (lure.x === c.x) {
    if (lure.kind === 'mouse') catchMouse(s, c, item(s, lure.id));
    else { c.mode = 'pounce'; s.acted = true; }
    return;
  }
  const d = sign(lure.x - c.x);
  c.dir = d;
  c.x += d;
  s.acted = true;
  entered(s, c.x, c.y, 'cat');
  if (c.x === s.jar.x && c.y === s.jar.y && !s.jar.tipped) tipJar(s, 'cat');
  if (lure.kind === 'mouse') {
    const m = item(s, lure.id);
    if (m.x === c.x && m.y === c.y) { catchMouse(s, c, m); return; }
  }
  for (const it of s.items) {
    if (it.state === 'rest' && it.x === c.x && it.y === c.y) {
      it.state = 'roll'; it.dir = d; it.power = L.knockPower; it.bumped = false;
      emit(s, 'knock', c.x, c.y, 'cat', 0, it.id);
    }
  }
  if (lure.kind === 'dot' && c.x === lure.x) c.mode = 'pounce';
}

// Next move for a walker heading to (tx, ty): along the floor, or to the nearest stairs.
function route(L, x, y, tx, ty) {
  if (y === ty) return { dx: sign(tx - x), dy: 0 };
  let best = null, bd = 1000;
  for (const st of L.stairs) {
    const fy = ty > y ? st.y : st.y + 1;
    if (fy !== y) continue;
    const d = Math.abs(st.x - x);
    if (d < bd) { bd = d; best = st; }
  }
  if (!best) return { dx: 0, dy: 0 };
  if (best.x === x) return { dx: 0, dy: ty > y ? 1 : -1 };
  return { dx: sign(best.x - x), dy: 0 };
}

function walkToward(s, c, tx, ty, doorSound) {
  const mv = route(lvl(s), c.x, c.y, tx, ty);
  if (mv.dy) { c.y += mv.dy; emit(s, 'stairs', c.x, c.y, c.id); entered(s, c.x, c.y, c.id); return; }
  if (mv.dx === 0) return;
  c.dir = mv.dx;
  const door = closedDoorBetween(s, c.y, c.x, c.x + mv.dx);
  if (door) { door.open = true; emit(s, doorSound, c.x, c.y, c.id); return; }
  c.x += mv.dx;
  s.acted = true;
  entered(s, c.x, c.y, c.id);
}

function actDog(s, c) {
  const L = lvl(s);
  if (c.mode === 'asleep') {
    for (let dx = -L.dogView; dx <= L.dogView; dx++) {
      for (const it of s.items) {
        if (it.state === 'rest' && it.y === c.homeY && it.x === c.homeX + dx) {
          c.mode = 'fetch'; c.target = it.id;
          emit(s, 'dogWake', c.x, c.y, 'dog', 0, it.id);
          return;
        }
      }
    }
    return;
  }
  if (c.mode === 'fetch') {
    const it = item(s, c.target);
    if (!it || it.state === 'goal' || it.state === 'carried' || it.state === 'caught') { c.mode = 'done'; s.acted = true; return; }
    if (it.x === c.x && it.y === c.y && it.state === 'rest') {
      it.state = 'carried'; c.carrying = it.id; c.mode = 'carry';
      emit(s, 'pickUp', c.x, c.y, 'dog', 0, it.id);
      return;
    }
    walkToward(s, c, it.x, it.y, 'creak');
    return;
  }
  if (c.mode === 'carry') {
    const it = item(s, c.carrying);
    if (c.x === L.goal.x && c.y === L.goal.y) {
      it.state = 'goal'; it.x = c.x; it.y = c.y; c.carrying = null; c.mode = 'done';
      emit(s, 'drop', c.x, c.y, 'dog', 0, it.id);
      return;
    }
    walkToward(s, c, L.goal.x, L.goal.y, 'creak');
    it.x = c.x; it.y = c.y;
  }
}

function actBaby(s, c) {
  const L = lvl(s);
  if (c.mode !== 'asleep') return;
  for (const e of s.events) {
    if (e.tick !== s.tick - 1 || e.noise < L.babyThreshold || e.y !== c.y) continue;
    if (Math.abs(e.x - c.x) <= L.babyHear) { startCry(s, c, e.id); return; }
  }
}

function startCry(s, c, causeId) {
  c.mode = 'crying';
  emit(s, 'cry', c.x, c.y, 'baby', causeId);
  const p = creature(s, 'parent');
  if (p && p.mode === 'asleep') p.mode = 'called';
}

function actParent(s, c) {
  if (c.mode === 'called') { c.mode = 'sleepwalk'; s.acted = true; return; }
  if (c.mode !== 'sleepwalk') return;
  const b = creature(s, 'baby');
  if (!b) { c.mode = 'rocking'; return; }
  if (c.x === b.x && c.y === b.y) {
    c.mode = 'rocking';
    if (b.mode === 'crying') b.mode = 'hushed';
    emit(s, 'hush', c.x, c.y, 'parent');
    return;
  }
  walkToward(s, c, b.x, b.y, 'doorOpen');
}

function arrive(s, it, fromStairs) {
  const L = lvl(s);
  entered(s, it.x, it.y, it.id);
  if (it.x === s.jar.x && it.y === s.jar.y && !s.jar.tipped && it.kind !== 'cookie') { tipJar(s, it.id); it.state = 'rest'; it.dir = 0; it.power = 0; return; }
  for (const c of s.creatures) {
    if (c.x !== it.x || c.y !== it.y) continue;
    if (c.kind === 'cat' && c.mode === 'chase' && it.kind === 'mouse') { catchMouse(s, c, it); return; }
    if (c.kind === 'cat' && c.mode === 'asleep') { c.mode = 'startled'; emit(s, 'yowl', c.x, c.y, it.id); }
    if (c.kind === 'baby' && c.mode === 'asleep') startCry(s, c, 0);
  }
  if (it.x === L.goal.x && it.y === L.goal.y) { it.state = 'goal'; it.dir = 0; it.power = 0; emit(s, 'plop', it.x, it.y, it.id); return; }
  if (!fromStairs && stairHead(L, it.x, it.y)) {
    it.y += 1; it.power = L.stairPower;
    emit(s, 'tumble', it.x, it.y, it.id);
    arrive(s, it, true);
    return;
  }
  const r = rampAt(s, it.x, it.y);
  if (r) { it.dir = r; it.power = L.rampPower; return; }
  if (it.power <= 0) { it.state = 'rest'; it.power = 0; it.dir = 0; }
}

function moveItem(s, it) {
  if (it.state !== 'roll') return;
  const nx = it.x + it.dir;
  if (nx < 0 || nx >= s.w || closedDoorBetween(s, it.y, it.x, nx)) {
    if (!it.bumped) { it.bumped = true; emit(s, 'thud', it.x, it.y, it.id); }
    if (!rampAt(s, it.x, it.y)) { it.state = 'rest'; it.power = 0; it.dir = 0; }
    return;
  }
  it.x = nx; it.bumped = false; it.power--;
  s.acted = true;
  arrive(s, it, false);
}

function stepInPlace(s) {
  if (s.phase === 'done') return;
  s.tick++;
  for (let i = 0; i < 4; i++) s.snore[i] = nextRand(s) % 4;
  if (s.phase !== 'run') return;
  const L = lvl(s);
  s.acted = false;
  const order = ['cat', 'dog', 'baby', 'parent'];
  const fns = [actCat, actDog, actBaby, actParent];
  for (let i = 0; i < 4; i++) { const c = creature(s, order[i]); if (c) fns[i](s, c); }
  for (const it of s.items) moveItem(s, it);
  s.quiet = s.acted ? 0 : s.quiet + 1;
  delete s.acted;
  const cookie = s.items[0];
  if (s.noise.total > s.noise.budget) finish(s, 'woke', s.overEvent);
  else if (cookie.state === 'goal') finish(s, 'win', null);
  else if (s.quiet >= L.quietLimit) finish(s, 'stuck', { id: 0, tick: s.tick, type: 'stuck', x: cookie.x, y: cookie.y, noise: 0, who: 'cookie', cause: 0, what: '' });
  else if (s.tick >= L.tickLimit) finish(s, 'timeout', { id: 0, tick: s.tick, type: 'timeout', x: cookie.x, y: cookie.y, noise: 0, who: 'cookie', cause: 0, what: '' });
}

export function step(state) {
  if (state.phase === 'done') return state;
  const s = clone(state);
  stepInPlace(s);
  return s;
}

function finish(s, result, ev) {
  s.phase = 'done';
  s.result = result;
  s.failedEvent = ev;
  s.failedAtTick = ev ? ev.tick : -1;
}

export function runToEnd(state, maxTicks) {
  const s = clone(state);
  if (s.phase === 'build') startInPlace(s);
  const limit = maxTicks || 100000;
  let n = 0;
  while (s.phase === 'run' && n < limit) { stepInPlace(s); n++; }
  return { result: s.result, failedAtTick: s.failedAtTick, failedEvent: s.failedEvent, ticks: s.tick, noise: s.noise.total, state: s };
}

export function routeOf(s) {
  const ev = s.events;
  const tip = ev.find((e) => e.type === 'jarTip');
  const tipper = tip ? tip.who.replace(/\d+$/, '') : 'none';
  const carry = ev.some((e) => e.type === 'drop' && e.what === 'cookie') ? 'dog' : 'roll';
  const doors = [];
  if (ev.some((e) => e.type === 'stringPull')) doors.push('string');
  if (ev.some((e) => e.type === 'creak')) doors.push('dog');
  if (ev.some((e) => e.type === 'doorOpen')) doors.push('parent');
  let tag = 'tip:' + tipper + ' door:' + (doors.join('+') || 'none') + ' carry:' + carry;
  const L = lvl(s);
  for (let i = 0; i < L.stairs.length; i++) if (ev.some((e) => e.type === 'tumble' && e.who === 'cookie' && e.x === L.stairs[i].x)) tag += L.stairs.length > 1 ? ' stairs' + (i + 1) : ' stairs';
  if (ev.some((e) => e.type === 'squeak' || (e.who && e.who.indexOf('mouse') === 0))) tag += ' mouse';
  return tag;
}

// ---------- teaching (pure, derived from level data and a run's events) ----------

const BUBBLE_FOR_NOISE = { creak: 'door', cry: 'baby' };

// Why a finished run did not win: the first link of the chain that never happened.
// bubble names the habit to show ('cat', 'catMouse', 'tip', 'dog', 'door', 'baby', 'meter', '');
// (x, y) is the cell the bubble belongs to; spot is the cell to spotlight; also is a second habit.
export function explain(s) {
  if (!s || s.phase !== 'done' || !s.result) return null;
  const L = lvl(s);
  const ev = s.events;
  const cookie = s.items[0];
  const cat = creature(s, 'cat'), dog = creature(s, 'dog'), baby = creature(s, 'baby');
  const at = (c) => ({ x: c.x, y: c.y });
  const mk = (reason, bubble, where, spot, also, event) => ({ result: s.result, reason, bubble, x: where.x, y: where.y, spot: spot || { x: where.x, y: where.y }, also: also || null, event: event || null });
  if (s.result === 'win') return mk('win', '', L.goal);
  if (s.result === 'woke') {
    // The avoidable loud link: a door the dog creaked open (a string opens it quietly), else what
    // made the baby cry, else the noise that tipped the meter.
    const e = s.overEvent || s.failedEvent;
    const cry = ev.find((q) => q.type === 'cry');
    const cryCause = cry && cry.cause ? ev.find((q) => q.id === cry.cause) || null : null;
    const creak = ev.find((q) => q.type === 'creak');
    const root = creak || cryCause || cry || e;
    const bubble = BUBBLE_FOR_NOISE[root.type] || 'meter';
    const also = cry && baby && bubble !== 'baby' ? { bubble: 'baby', x: baby.x, y: baby.y } : null;
    const where = bubble === 'baby' && baby ? at(baby) : { x: root.x, y: root.y };
    const reason = cry && (root === cryCause || root === cry) ? 'noiseWokeBaby' : creak ? 'loudDoor' : 'tooLoud';
    return mk(reason, bubble, where, { x: root.x, y: root.y }, also, { type: root.type, x: root.x, y: root.y, noise: root.noise, who: root.who });
  }
  // stuck or timeout
  if (!s.jar.tipped) {
    const lureType = cat && ev.some((e) => e.type === 'catWake') ? 'catMissedJar' : 'catAsleep';
    const bubble = L.inventory.mouse !== undefined && s.parts.some((p) => p.type === 'mouse') ? 'catMouse' : 'cat';
    if (!cat) return mk('jarNotTipped', 'tip', L.jar);
    return mk(lureType, bubble, { x: cat.homeX, y: cat.homeY }, { x: L.jar.x, y: L.jar.y });
  }
  if (cookie.state === 'rest' || cookie.state === 'roll') {
    for (const d of L.doors) { // closed at the start (it may have been opened after the cookie stopped)
      if (d.open || d.y !== cookie.y || (d.x !== cookie.x && d.x + 1 !== cookie.x)) continue;
      if (ev.some((e) => e.type === 'thud' && e.who === 'cookie' && e.x === cookie.x && e.y === cookie.y)) return mk('closedDoor', 'door', at(cookie), at(cookie), null, { type: 'door', x: d.x, y: d.y, noise: 0, who: d.id });
    }
    const wrong = ev.find((e) => e.type === 'pickUp' && e.what !== 'cookie');
    if (wrong && dog) return mk('dogFetchedOther', 'dog', { x: dog.homeX, y: dog.homeY }, at(cookie));
    if (s.result === 'timeout') return mk('goingRound', '', at(cookie));
    if (dog) return mk('cookieStopped', 'dog', { x: dog.homeX, y: dog.homeY }, at(cookie));
    return mk('cookieStopped', '', at(cookie));
  }
  return mk(s.result === 'timeout' ? 'goingRound' : 'cookieStopped', '', at(cookie));
}

// The habits worth acting out in this house, in tour order.
export function tourStops(s) {
  const L = lvl(s);
  const out = [];
  const home = (kind) => L.creatures.find((c) => c.kind === kind);
  const cat = home('cat'), dog = home('dog'), baby = home('baby'), parent = home('parent');
  if (cat) out.push({ bubble: L.inventory.mouse !== undefined ? 'catMouse' : 'cat', who: 'cat', x: cat.x, y: cat.y });
  if (L.inventory.ball !== undefined || L.inventory.mouse !== undefined) out.push({ bubble: 'tip', who: 'jar', x: L.jar.x, y: L.jar.y });
  if (dog) out.push({ bubble: 'dog', who: 'dog', x: dog.x, y: dog.y });
  let door = null, bd = 1000;
  for (const d of L.doors) { if (d.open) continue; const dist = Math.abs(d.x - L.goal.x) + Math.abs(d.y - L.goal.y) * 10; if (dist < bd) { bd = dist; door = d; } }
  if (door) out.push({ bubble: 'door', who: door.id, x: door.x, y: door.y });
  if (baby) out.push({ bubble: 'baby', who: 'baby', x: baby.x, y: baby.y });
  if (parent) out.push({ bubble: 'meter', who: 'parent', x: parent.x, y: parent.y });
  return out;
}

// Which creature would react to a piece placed at (x, y) (for the placement ghost).
export function reaction(s, pl) {
  if (!pl) return null;
  const L = lvl(s);
  const home = (kind) => L.creatures.find((c) => c.kind === kind);
  const cat = home('cat'), dog = home('dog');
  const doorBetween = (y, a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return L.doors.some((d) => d.y === y && !d.open && d.x >= lo && d.x < hi); };
  const seen = (c) => c && c.y === pl.y && !doorBetween(pl.y, c.x, pl.x);
  const nearDog = dog && dog.y === pl.y && Math.abs(dog.x - pl.x) <= L.dogView;
  if (pl.type === 'dot' && seen(cat)) return { bubble: 'cat', who: 'cat', x: cat.x, y: cat.y };
  if (pl.type === 'mouse' && seen(cat)) return { bubble: 'catMouse', who: 'cat', x: cat.x, y: cat.y };
  if ((pl.type === 'ball' || pl.type === 'mouse') && nearDog) return { bubble: 'dog', who: 'dog', x: dog.x, y: dog.y };
  if (pl.type === 'ball' && pl.y === L.jar.y && rampAt(s, pl.x, pl.y) === sign(L.jar.x - pl.x)) return { bubble: 'tip', who: 'jar', x: L.jar.x, y: L.jar.y };
  if (pl.type === 'string') { const d = doorForString(L, pl.x, pl.y); if (d) return { bubble: 'door', who: d.id, x: d.x, y: d.y }; }
  return null;
}

function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

export function stateHash(s) {
  const str = canon(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
