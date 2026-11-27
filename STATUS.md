# STATUS (Milestone 2)

## Done
- MILESTONE-2.md: acceptance criteria split into what bots can verify and what only Michael and the kids can judge.
- Engine (`src/engine.js`, no DOM, integer ticks, plain data): three houses (`LEVEL_LIST`, `levelList()`, `createState(seed, level, {players})` by index, id or object), multi-floor building, stairs (items tumble down, the dog and the grown-up walk them), the toy mouse (the cat chases the nearer lure, catches the mouse, a rolling mouse tips the jar), `hint()`, `routeOf()`, and a fast in-place `runToEnd`. M1 API unchanged; cottage outcomes are identical to M1 (161 wins of 7953 in both).
- Houses:
  - House 1, cottage: 2 pieces minimum, 4 routes, budget 6.
  - House 2, tall house: jar upstairs, every win uses the stairs, 3 pieces minimum, 4 routes, budget 7.
  - House 3, big house: budget 4, two staircases, 3 pieces minimum, 7 route tags in 3 families: left stairs with the dog carrying, right stairs rolling, and the mouse or ball tipping the jar. Interference: the dog fetches a ball instead of the cookie, a nearer mouse pulls the cat off the dot, and the red dot alone is too loud.
- Solver (`node test/solver.mjs all 2000000`):
  - House 1: 7,953 arrangements (all), 161 wins, 7,792 failing.
  - House 2: 795,004 (all), 633 wins, 794,371 failing.
  - House 3: 2,000,000 (capped; complete up to 4 of 6 pieces), 1,948 wins, 1,998,052 failing.
  - Deterministic in every house. Results are in test/solver-results.json.
- Smoke tests (`node test/smoke.test.mjs`): PASS. Covers the M1 checks, plus: every listed solution wins, 100 identical runs each, distinct routes per house, empty houses fail, hints are legal, stairs, the mouse versus the dot, the dog fetching the wrong thing, and player count.
- Game (`index.html`): title, then players (1 to 4 tokens), then a picture-only picker with stars (session plus localStorage in try/catch), then build, run, fail beat, rewind, and a win celebration. Hold-to-confirm for go and home. Take-back. Hint glow after two failed runs. Fullscreen slot (and F). Mute slot (and M).
- Look and sound: drawn in code at 1920x1080. Gentle camera, squash and stretch, anticipation, a tumble down the stairs, noise ripples, sleeping faces that stir, and the woken grown-up with a candle. Reverb-warmed synthesized cues, plus a night ambience (wind, crickets, a music-box lullaby).
- Playwright Chromium (`node test/browser-check.mjs`, keyboard only, local server, 1920x1080, DSF 1): 29/29 steps.
  - Picked 3 players and won house 1.
  - House 2: failed once (woke), took the ball back, and won on the retry.
  - Won house 3. All three were stored as solved.
  - The hint appeared after two cottage fails, and the gamepad path works.
  - 0 console errors, 0 page errors. The server stopped.
- Screenshots in shots/ (title, picker, house2-build, house3-run, fail-beat, win, plus hint), all inspected. Fixed after the first look: the title button, the picker layout, the fail-beat framing and doorway pose, and the win button and cookie.

## Skipped
- More than one new part (only the toy mouse was added), more houses, names or customisation UI.
- A parent route in house 3 (the budget of 4 rules out a crying baby; the three families come from stairs and tippers instead).
- An exhaustive search of house 3 beyond 2,000,000 arrangements (it is capped; complete up to 4 pieces).
- Git and publishing.

## Unverified
- Real TV readability from the sofa, real gamepad and Roku remote feel, and children's understanding (Michael-only criteria).
- Whether the audio sounds pleasant. It was only run headless; nobody has listened.
- Fullscreen on a real browser, since headless Chromium does not change size. The toggle path runs without errors.
- Hold time (1 s), run speed (420 ms per tick) and beat length (2.4 s) are still guesses.
- Roku/BrightScript portability beyond keeping plain data and avoiding host APIs.
