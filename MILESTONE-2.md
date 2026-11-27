# Milestone 2 - polished vertical slice

Goal: a short version of the finished game, not more concept. Three houses in a gentle progression, picked from a picture-only house picker, for 1 to 4 players, with near-final look, motion and sound. Controls stay at left/right plus one button.

## Bots can verify

1. `levelList()` returns three houses in order: cottage, tall house, big house. `createState(seed, level, {players})` accepts an index, an id or a level object, and 1 to 4 players.
2. House 1 (cottage) builds on the ground floor only and is won with 2 pieces. House 2 builds on both floors, and every win sends the cookie down the stairs. House 3 has the smallest noise budget and at least three different route families.
3. Every house has at least two distinct winning routes (tagged with `routeOf`) and failing arrangements (woke, stuck or timeout), found by `test/solver.mjs`, which searches every house and reports anything capped.
4. The toy mouse: the cat chases the nearer of the red dot and the mouse (a tie goes to the mouse), catches it with a squeak, and a rolling mouse tips the jar.
5. Interference in house 3: a ball resting near the dog is fetched instead of the cookie, and a nearer mouse pulls the cat away from the jar.
6. Stairs: items rolling into a stair head tumble down one floor and keep rolling. The dog and the grown-up walk up and down them.
7. Determinism: the same setup gives an identical state hash over 100 runs for every listed solution, and over random setups in every house. The engine has no DOM, `Math.random`, `Date` or imports.
8. `hint(state)` returns a legal placement from a known solution. The browser shows it as a glow after two failed runs in a house.
9. Keyboard only (Left, Right, Enter): title, then player count, then house picker, then building, a held go, the run, the fail beat, the rewind and a win. Go still needs a 1-second hold, and take-back still returns the last piece to its owner.
10. Solved houses are remembered for the session and in localStorage (wrapped in try/catch), and shown as a star on the picker.
11. Page loads at 1920x1080 with zero console and page errors. The fullscreen and mute slots work, and audio starts only after a gesture.
12. `window.__game` exposes screen, state, ui, players, house, solved, fails, hint, input, tap and speed.
13. Screenshots of the title, picker, house 2 build, house 3 run, fail beat and win are taken at 1920x1080 and inspected.

## Only Michael and the kids can judge

1. A 4-year-old can win the cottage with a little help, and the step up to houses 2 and 3 feels gentle, not like a wall.
2. The picker, the player tokens and the hint glow make sense with no reading.
3. Motion feels alive: squash and stretch, anticipation before a creature moves, tumbling down the stairs.
4. The noise ripples and the stirring sleeping faces make it clear what is too loud, before the grown-up wakes.
5. It reads from the sofa on the living-room TV, and the camera framing helps rather than distracts.
6. Sound: the cues are readable and not annoying, and the night ambience is soothing rather than tiring.
7. The title, the win celebration and the grown-up in the doorway feel warm and funny, close to a finished game.
8. House 3's three routes feel genuinely different, and the interference is funny rather than unfair.
