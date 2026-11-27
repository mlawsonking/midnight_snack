# STATUS (Milestone 2 + teaching pass)

## Teaching pass

### Done
- Teaching house (`littlehouse`, house 1 of 4, budget 4, tray: one ramp and one red dot, no baby). The dot by the jar alone wins: the cat chases it and tips the jar, the cookie rolls to rest beside the dog, the dog carries it through two open doors to the kids' bed. The other 11 single placements all stick (solver: 41 arrangements, 4 wins, all needing the dot by the jar). The cottage, tall house and big house are now houses 2 to 4; their rules and outcomes are untouched.
- Engine additions (pure, plain data): `explain(state)`, `tourStops(state)`, `reaction(state, placement)`, `LEVEL_0`. `explain` walks the chain in order (jar tipped? cookie stopped at a closed door? dog fetched something else? cookie lying where nobody fetches?) and, for woke runs, names the avoidable loud link (a creaked door first, else what made the baby cry, else the noise that tipped the meter).
- Goal intro (about 5.6 s, wordless): spotlight on the kids sitting up with a cookie thought bubble, then the cookie glowing in its jar, then a dotted arrow from jar to bed (down the stairs where needed) with a cookie travelling it. The button skips.
- Habit bubbles (thought clouds with tiny looping animations): cat chases the red dot and tips the jar; cat chases the toy mouse; a rolling ball tips the jar; the dog carries a cookie from beside its bed to the kids' bed; doors (dog noses one: big red bang / string: soft and quiet); a bang makes the baby cry; noises stir the sleeping faces one by one until the grown-up opens its eyes.
- How bubbles are reached with left/right + one button (design choice): (1) a "meet the house" tour right after the intro, the camera visiting each creature for one bubble cycle (2.6 s), progress dots at the bottom; on later houses only habits not yet toured are shown, so the tour stays short (teaching house: cat, dog, meter; cottage adds tip, door, baby); (2) the placement ghost: when a creature would react to the piece where the ghost sits, its bubble pops up over that creature, so the lesson arrives exactly when the player is deciding; (3) a thought-bubble slot in the tray replays the intro and every habit. Reason: no menus or extra buttons, the tour is passive (kids just watch), and the ghost bubble ties each habit to a concrete placement.
- Failure explained: the bare "?" beat is gone. Stuck/timeout runs dim the house, spotlight the missing link (for the playtest case, a lone ramp in the cottage: the jar, with the sleeping cat and its red-dot bubble) and ring it. Woke runs keep the grown-up in the doorway, ring the loud link with its bubble (usually the door bubble) and ring the sleeping-faces meter. The explanation stays in the build view until the next piece is placed. The beat holds 3.6 s (CONFIG.explainMs).
- Hint glow after 1 failed run (CONFIG.hintAfterFails = 1); the ghost starts on the hint after 2.
- Picker shows 4 houses. Saves are stored by house id (`{v:2, solved:{...}}`); old 3-entry arrays are migrated (cottage, tall, big keep their stars). Seen intros/habits are stored under `midnight-snack-seen`.
- Tests:
  - Smoke (`node test/smoke.test.mjs`): PASS. Adds: 4 houses in order, default level still the cottage; teaching house dot-alone wins and all 11 other singles fail; `explain()` cases (catAsleep for the lone cottage ramp, catMissedJar, cookieStopped, closedDoor, noiseWokeBaby with the creak, loudDoor in the big house, timeout, win); `tourStops` and `reaction` cases.
  - Solver (`node test/solver.mjs all 2000000`): house 1 littlehouse 41 (all), 4 wins, 37 stuck; house 2 cottage 7,953 (all), 161 wins; house 3 tall house 795,004 (all), 633 wins; house 4 big house 2,000,000 (capped, complete to 4 pieces), 1,948 wins. All deterministic. Unchanged counts for the three M2 houses.
  - Browser (`node test/browser-check.mjs`, keyboard only, 1920x1080 DSF 1): 42/42 steps, 0 console errors, 0 page errors. Covers: intro shows and the button skips, the tour plays the cat bubble, the dot ghost shows the cat bubble, the teaching house is won with the dot alone, the cottage tour skips habits already seen, all 4 houses won, ids stored, the help slot replays, a stuck run shows the cat explanation, hint after one stuck run and after one woke run, old-save migration, gamepad.
- Screenshots (all looked at): intro.png, bubble.png, house1-teach.png, explain-stuck.png, plus title, picker, house3-build (was house2-build), house4-run (was house3-run), fail-beat, hint, win. Fixed after looking: the cat bubble was cramped (cat on top of the jar) and too small; figures enlarged and spaced, bubble lifted off the creature. The woke explanation first pointed at a tumble ("meter") instead of the creaked door; the rule now prefers the avoidable loud link. The quiet half of the door bubble drew a burst like the loud half; it is now one faint ring.

### Skipped
- No new parts, no art overhaul, no voice or text.
- Teaching house has one route tag by design (the M2 "two routes" rule covers houses 2 to 4).
- The tour does not pause per stop for a button press (one press skips the rest, to keep the controls to one meaning).
- Git and publishing.

### Unverified
- Learnability itself: whether an adult cold, or a 4-year-old with help, understands the intro, the bubbles and the failure explanation can only be judged by people playing.
- Whether 5.6 s intro + 2.6 s per habit feels too long or too short on a TV.
- Bubble legibility from the sofa (checked only on 1920x1080 screenshots).
- The explanation for less common failures (dog fetched the wrong thing, timeouts) has smoke coverage but no screenshot.

# Milestone 2 status (unchanged history)


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
