# Milestone 1 - smallest playable proof

Goal: one small house, cat, dog, baby and one parent, a few inert parts (ramp, string, ball, red dot), one full build-then-run cycle that can be won or lost. (Updated per DECISIONS.md, 26 Nov 2026.)

## Bots/automated tests can verify

1. `createState(seed)` is deterministic: same seed gives identical JSON after N steps; different seeds differ.
2. `src/engine.js` imports nothing from rendering and references no DOM, `Math.random`, or `Date`.
3. A level of at least a 4x3 room grid contains a cookie jar in the kitchen and a goal cell in the kids' bedroom.
4. Placing a part on a legal empty cell succeeds and illegal placement is rejected with state unchanged.
5. Placement inventory limits are enforced.
6. The cat moves toward the red dot each tick it is in line of sight, identically on every run of the same setup (run 100 times, identical state hash).
7. The dog fetches a thrown item and returns it by a fixed rule.
8. The baby cries when noise at its cell exceeds the threshold; a parent then walks a fixed path and opens the door on that path.
9. Noise total accumulates per tick and run ends in loss when it exceeds the budget.
10. Cookie reaching the goal cell within budget sets phase `done` with result win.
11. A scripted input sequence (left/right/button only) can complete a full build and run to a win in a reference level. One placement per player per turn; a player may take back their own last piece before the run; the run starts only after a short hold-to-confirm on go; after a failed run the machine stays as built.
12. Page loads with zero console and page errors; Enter and gamepad A start play.
13. A solved reference level is solvable by an automated search by at least two genuinely different routes and has at least one failing arrangement.
14. A failed run plays through to the moment someone wakes, holds a short beat (parent in the doorway), then rewinds and marks the step that went wrong.
15. Sound is synthesised in code (snores, creaks, a meow), starts only after a user gesture, and has a mute toggle.

## Only Michael (and the kids) can judge

1. A child aged four to seven understands the goal with no reading in under a minute.
2. Passing the remote and placing one thing per turn feels fun, not slow.
3. Watching the run is funny; the failure is funnier than the win.
4. The cat/dog/baby habits feel predictable and fair once learned.
5. The look is warm and storybook, readable on the living-room TV from the sofa.
6. Two directions and one button feels natural with the gamepad.
7. The family wants to play a second time.
