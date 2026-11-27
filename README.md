# Midnight Snack (Milestone 2 + teaching pass)

Cooperative contraption builder for the family TV. Get the cookie from the kitchen jar to the kids' bed without waking the grown-up. Four houses (the first one teaches), 1 to 4 players, left/right plus one button. Design: DESIGN.md. Acceptance list: MILESTONE-2.md (M1: MILESTONE-1.md). Status: STATUS.md.

Run: `python3 -m http.server 8000` in this folder, open http://localhost:8000/. No build step, no dependencies, no network.
Tests: `node test/smoke.test.mjs` (rules), `node test/solver.mjs all [cap]` (searches every house; writes test/solver-results.json), `node test/browser-check.mjs` (keyboard-only Playwright playthrough; writes shots/).

## Controls (left/right + one button)
Keyboard Left/Right + Enter/Space; gamepad d-pad or left stick + A. Conveniences: M toggles sound, F toggles fullscreen.
- Title: press to start. Players: left/right lights 1 to 4 tokens, press to confirm. Picker: the players card, then four house pictures (cookies show how tricky each one is; a star means solved). Press to open.
- First visit to a house: a wordless intro shows the goal (the kids wake and think of the cookie, the cookie glows in its jar, a dotted path runs from the jar to the kids' bed), then a short "meet the house" tour: the camera visits each creature and a thought bubble acts out its habit. Only habits not toured before are shown. The button skips. The thought-bubble slot in the tray replays the intro and every habit.
- While moving a piece's ghost, a creature that would react to it shows its habit bubble (the red dot where the cat can see it: the cat chases it and tips the jar; a ball by the dog: the dog carries it; a string: doors open quietly).
- Build: a tray holds the parts this house has, take back, go, home, sound and fullscreen. The big token on the left shows whose turn it is. Press a part, move the ghost along the legal spots (the X spot backs out), and press to place it. The turn passes on.
- Take back removes the most recent piece and gives the turn back to its owner. Go and home need a one-second hold (a ring fills). Holding the button during a run speeds it up.
- A failed run plays to its end and then points at the link that never happened: the cookie never left the jar -> the cat is spotlit with its red-dot bubble; the cookie stopped at a closed door -> the door/string bubble; the cookie lay where nobody fetches it -> the dog bubble; the grown-up woke -> the grown-up appears in the doorway and the loud link (usually a door the dog creaked open, which made the baby cry) gets its bubble while the sleeping-faces meter is ringed. The run rewinds; the bubble stays until the next piece goes down. The machine stays as built. After one failed run in a house, a soft glow shows a spot where a helpful piece could go.

## Houses
0. Little house (`littlehouse`, 8x2, budget 4, tray: one ramp, one red dot): the teaching house. The red dot by the jar alone wins: the cat tips the jar, the cookie rolls to the dog, the dog carries it through the open doors to the kids' bed. Every other single piece fails (the ramp alone: nothing wakes).
1. Cottage (`cottage`, 10x2, budget 6): build on the ground floor. For example, the red dot by the jar plus the string by the kids' door.
2. Tall house (`tallhouse`, 10x2, budget 7): the jar is upstairs. Build on both floors; the cookie tumbles down the stairs. For example, the dot by the jar, a ramp upstairs, a string at the foot of the stairs and a ramp into the kids' room.
3. Big house (`bighouse`, 12x2, budget 4): two staircases and a toy mouse. Routes: down the left stairs to the dog, down the right stairs and roll, or let the toy mouse tip the jar. Beware: the dog fetches whatever lies nearest it, and the cat goes for the nearer lure.

Storage: solved houses are saved by id (`{v: 2, solved: {id: true}}`); an old Milestone 2 save (a 3-entry array) is migrated on load. Seen intros and toured habits are saved under a second key. All storage is wrapped in try/catch.

## Headless engine API (`src/engine.js`, plain ES module, no DOM)
All functions return new state objects and never mutate their input.
- `createState(seed, level?, opts?)` -> build-phase state. `level`: index (0 to 3; 0 is the teaching house), id or level object; defaults to the cottage. `opts.players` 1 to 4 (default 2).
- `levelList()` -> `[{index, id, w, h, budget, floors}]`. `LEVEL_LIST`, `LEVELS`, `LEVEL_1` are exported too.
- `legalPlacements(state)` -> `[{type, x, y}]` for the current player (`state.turn`), honouring inventory and build floors.
- `place(state, {type, x, y})` -> new state; the turn passes on. Illegal: returns the same object (`result === state`).
- `undo(state, player)` takes back that player's most recent piece; the turn returns to them. `lastPlacer(state)` -> player or -1.
- `startRun(state)`, `step(state)`, `runToEnd(state, maxTicks?)` -> `{result: 'win'|'woke'|'stuck'|'timeout', failedAtTick, failedEvent, ticks, noise, state}`. `resetRun(state)` returns to build with `state.lastFailure`.
- `explain(state)` (finished run) -> `{result, reason, bubble, x, y, spot, also, event}`: reason is one of `win`, `catAsleep`, `catMissedJar`, `jarNotTipped`, `closedDoor`, `dogFetchedOther`, `cookieStopped`, `goingRound`, `noiseWokeBaby`, `loudDoor`, `tooLoud`; bubble names the habit to show (`cat`, `catMouse`, `tip`, `dog`, `door`, `baby`, `meter`); (x, y) is where the bubble belongs and `spot` the cell to spotlight.
- `tourStops(state)` -> `[{bubble, who, x, y}]` habits present in the house. `reaction(state, {type, x, y})` -> the `{bubble, who, x, y}` of the creature that would react to a piece there, or null.
- `hint(state)` -> a helpful legal `{type, x, y}` or null. `routeOf(state)` -> route tag of a finished run. `stateHash(state)` -> 8-hex FNV-1a hash.

Part types: `rampR`, `rampL`, `string`, `ball`, `dot`, `mouse`. Grid y 0 is the top floor; stairs `{x, y}` join (x, y) to (x, y+1). See the rules comment at the top of engine.js for each creature's habit, the fixed tick order and noise values. `state.events` lists every event (`{id, tick, type, x, y, noise, who, cause, what}`). The seed only drives the cosmetic snore rhythm.

## Browser hook for Playwright
`window.__game`: `screen` ('title'|'players'|'picker'|'intro'|'tour'|'build'|'run'|'beat'|'rewind'|'win'), `tour` (habit list of the current intro), `tourStop`, `explain` (last run's explanation), `bubble` (ghost habit bubble), `state`, `ui` (`trayList`, `tray`, `cells`, `cellIdx`, ...), `beat` ('woke'|'shrug'), `players`, `playersSel`, `pickerSel` (0 = players card, 1 to 4 = houses), `house`, `houses`, `solved`, `fails`, `hint`, `camera`, `input(name, down=true)` with name 'left'|'right'|'button' (send `input('button', false)` to release), `tap(name)`, and `speed` (presentation speed multiplier).

Layout: `src/engine.js` (rules), `src/render.js` (canvas, camera), `src/audio.js` (WebAudio synth and ambience), `src/config.js` (names, colours, timings), `index.html` (screens, input, storage).
