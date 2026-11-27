# Midnight Snack (Milestone 2)

Cooperative contraption builder for the family TV. Get the cookie from the kitchen jar to the kids' bed without waking the grown-up. Three houses, 1 to 4 players, left/right plus one button. Design: DESIGN.md. Acceptance list: MILESTONE-2.md (M1: MILESTONE-1.md). Status: STATUS.md.

Run: `python3 -m http.server 8000` in this folder, open http://localhost:8000/. No build step, no dependencies, no network.
Tests: `node test/smoke.test.mjs` (rules), `node test/solver.mjs all [cap]` (searches every house; writes test/solver-results.json), `node test/browser-check.mjs` (keyboard-only Playwright playthrough; writes shots/).

## Controls (left/right + one button)
Keyboard Left/Right + Enter/Space; gamepad d-pad or left stick + A. Conveniences: M toggles sound, F toggles fullscreen.
- Title: press to start. Players: left/right lights 1 to 4 tokens, press to confirm. Picker: the players card, then three house pictures (cookies show how tricky each one is; a star means solved). Press to open.
- Build: a tray holds the parts this house has, take back, go, home, sound and fullscreen. The big token on the left shows whose turn it is. Press a part, move the ghost along the legal spots (the X spot backs out), and press to place it. The turn passes on.
- Take back removes the most recent piece and gives the turn back to its owner. Go and home need a one-second hold (a ring fills). Holding the button during a run speeds it up.
- A failed run plays to the moment someone wakes, the grown-up appears in the doorway, the run rewinds, and the step that went wrong is ringed in red. The machine stays as built. After two failed runs in a house, a soft glow shows a spot where a helpful piece could go.

## Houses
1. Cottage (`cottage`, 10x2, budget 6): build on the ground floor. For example, the red dot by the jar plus the string by the kids' door.
2. Tall house (`tallhouse`, 10x2, budget 7): the jar is upstairs. Build on both floors; the cookie tumbles down the stairs. For example, the dot by the jar, a ramp upstairs, a string at the foot of the stairs and a ramp into the kids' room.
3. Big house (`bighouse`, 12x2, budget 4): two staircases and a toy mouse. Routes: down the left stairs to the dog, down the right stairs and roll, or let the toy mouse tip the jar. Beware: the dog fetches whatever lies nearest it, and the cat goes for the nearer lure.

## Headless engine API (`src/engine.js`, plain ES module, no DOM)
All functions return new state objects and never mutate their input.
- `createState(seed, level?, opts?)` -> build-phase state. `level`: index (0 to 2), id or level object; defaults to the cottage. `opts.players` 1 to 4 (default 2).
- `levelList()` -> `[{index, id, w, h, budget, floors}]`. `LEVEL_LIST`, `LEVELS`, `LEVEL_1` are exported too.
- `legalPlacements(state)` -> `[{type, x, y}]` for the current player (`state.turn`), honouring inventory and build floors.
- `place(state, {type, x, y})` -> new state; the turn passes on. Illegal: returns the same object (`result === state`).
- `undo(state, player)` takes back that player's most recent piece; the turn returns to them. `lastPlacer(state)` -> player or -1.
- `startRun(state)`, `step(state)`, `runToEnd(state, maxTicks?)` -> `{result: 'win'|'woke'|'stuck'|'timeout', failedAtTick, failedEvent, ticks, noise, state}`. `resetRun(state)` returns to build with `state.lastFailure`.
- `hint(state)` -> a helpful legal `{type, x, y}` or null. `routeOf(state)` -> route tag of a finished run. `stateHash(state)` -> 8-hex FNV-1a hash.

Part types: `rampR`, `rampL`, `string`, `ball`, `dot`, `mouse`. Grid y 0 is the top floor; stairs `{x, y}` join (x, y) to (x, y+1). See the rules comment at the top of engine.js for each creature's habit, the fixed tick order and noise values. `state.events` lists every event (`{id, tick, type, x, y, noise, who, cause, what}`). The seed only drives the cosmetic snore rhythm.

## Browser hook for Playwright
`window.__game`: `screen` ('title'|'players'|'picker'|'build'|'run'|'beat'|'rewind'|'win'), `state`, `ui` (`trayList`, `tray`, `cells`, `cellIdx`, ...), `beat` ('woke'|'shrug'), `players`, `playersSel`, `pickerSel` (0 = players card, 1 to 3 = houses), `house`, `houses`, `solved`, `fails`, `hint`, `camera`, `input(name, down=true)` with name 'left'|'right'|'button' (send `input('button', false)` to release), `tap(name)`, and `speed` (presentation speed multiplier).

Layout: `src/engine.js` (rules), `src/render.js` (canvas, camera), `src/audio.js` (WebAudio synth and ambience), `src/config.js` (names, colours, timings), `index.html` (screens, input, storage).
