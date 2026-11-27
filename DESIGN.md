# Midnight Snack - Design

## Pitch (as Michael gave it)

Midnight Snack (the family game; plays on a TV). A cooperative contraption builder where the parts are the sleeping household. Goal: get the cookie from the jar in the kitchen to the kids' bedroom without waking anyone. A turn: pass the remote, each player places one thing; when the family agrees it is ready, press go and watch the whole chain run. The parts are creatures with habits: the cat always chases the red dot, the dog always fetches, the baby cries if startled and then a parent walks to the nursery and opens a door on the way. You build chain reactions out of behaviour as well as ramps and string. Kids get it instantly: no reading, aiming or timing. Everyone is on one team; the payoff is watched together and failures are funnier than wins. Depth: later houses have several valid routes, a noise budget, and parts that interfere. Controls: two directions and one button, turn-based, so it fits a single TV remote; it runs first in a browser on his living-room PC with a gamepad, and a port to a Roku device is a hoped-for second step, so keep the rules engine separate from rendering. Known risk: predictable creature behaviour inside a physics simulation must be exactly repeatable; if the cat does something different on the same setup the game feels broken. Tone: storybook, warm, laugh-along. The players are young children (roughly four to seven).

## Core loop

Players take turns holding the remote. On your turn you move a cursor around a cutaway house and place one thing (a ramp, a length of string, a red-dot lamp, a bowl, a door-wedge, etc.). When the family agrees it is ready, someone presses go. Phase changes from build to run and the whole chain plays out by itself, tick by tick: the cookie starts in the kitchen jar, creatures react to triggers according to their fixed habits, and the cookie is passed along. If it reaches the kids' bedroom without the noise level exceeding the budget, the family wins; otherwise someone wakes up, the funny failure plays, and the family rewinds to build and tries again.

## Control scheme

Two directions (previous/next) plus one button, everywhere. Title: button starts. Players: left/right picks 1 to 4 tokens, button confirms. House picker: left/right over the players card and three house pictures, button opens. Build: a tray of slots (the parts this house has, take back, go, home, sound, fullscreen); button on a part shows a ghost that left/right moves over the legal spots (plus an X spot to back out), button places it. Go and home need a 1-second hold (a ring fills). Run: holding the button speeds it up. Keyboard: Left/Right + Enter/Space (M mutes, F toggles fullscreen as conveniences). Gamepad: d-pad/stick left-right + A. A Roku remote (left/right/OK) is enough.

## Win and loss

- Win: the cookie reaches the kids' bedroom cell while the noise total is within budget.
- Loss: noise exceeds the budget (someone wakes), the cookie is stuck/lost, or the run ends (tick limit) with no progress. Losing is a gentle comic outcome, not a game-over.

## Systems needed

1. House grid and parts: rooms as a small integer grid, placeable parts with a limited inventory per level.
2. Creatures and habits: each creature has a deterministic rule set (trigger -> action), e.g. cat chases dot, dog fetches, baby cries when noise nearby exceeds a threshold, then a parent walks a fixed path and opens a door.
3. Tick simulation: a fixed-step, integer, discrete step function; same state in gives same state out. Events are resolved in a fixed order.
4. Noise budget: every action emits noise at cells; noise totals decide waking. Later levels add interfering parts.
5. (Later) Level/house data and turn/player management.

## Simulation decision (for Michael)

Recommendation: a discrete, tick-based grid simulation with integer state, not floating-point physics. Repeatability then holds by construction (no float drift, no frame-rate dependence), and the engine ports cleanly to BrightScript. Cost: ramps and rolling become stepped movement rather than smooth physics; presentation can interpolate visually without affecting rules. This is flagged as a decision for Michael.

## Milestone 2 changes

- Three houses: the cottage (ground floor only), the tall house (jar upstairs; build on both floors; the cookie comes down the stairs), the big house (two staircases, budget 4, toy mouse, three route families). Picked from a picture-only picker; solved houses get a star, kept in localStorage.
- Stairs rule: an item rolling into a stair head tumbles down one floor (noise 1) and keeps rolling with power 2. The dog and the grown-up walk to the nearest stairs when their target is on another floor; the cat stays on its floor.
- Toy mouse (a part that becomes an item): the cat chases the nearer of the red dot and the mouse (tie: the mouse), catches it with a squeak and plays. A rolling mouse or ball tips the jar. The dog fetches whichever item rests nearest its bed first, so it can fetch the wrong thing.
- The jar spills in a fixed direction per house (the jar leans), drawn so it can be seen.
- Hint: after two failed runs in a house, a soft glow marks one piece of the known solution closest to what is built (`hint()` in the engine).
- Presentation: 1920x1080 canvas, a gentle camera (fits the house while building, leans in on the action while running), squash and stretch with anticipation, noise ripples, the budget shown as sleeping faces that stir, the woken grown-up in the doorway with a candle.

## Visual direction

Storybook cutaway house seen from the side, like a doll's house at night. Warm lamp-yellows against deep blue, soft shapes, big readable silhouettes, chunky icons instead of text. Creatures have exaggerated expressive faces and sleepy animations. All art is original and drawn procedurally/vector at first.

## Known risks

- Exact repeatability of creature behaviour (mitigated by integer ticks, seeded PRNG, fixed event order, no Math.random/Date in the engine).
- Readability on a TV from the sofa for ages 4-7: no text dependence, large targets.
- Levels with too few or too many valid routes; hard to tune without playtesting.
- Roku port: BrightScript limits; keep engine data as plain structures and avoid language-specific features.
- Failure must stay funny, not frustrating.

## Open questions for Michael

Answered by the hub on Michael's behalf (DECISIONS.md, 26 Nov 2026); Michael can overrule any.

1. Discrete tick-based grid simulation? ANSWERED: yes, step-by-step grid; look physical through animation between ticks.
2. Placements per turn / undo? ANSWERED: one placement per player per turn; a player may take back their own last piece before the run; after a failed run the machine stays as built.
3. Who confirms go? ANSWERED: whoever holds the remote, with a short hold-to-confirm. No agreement screen.
4. Creatures and houses in the first version? ANSWERED: cat, dog, baby, one parent, one house, plus a few inert parts (ramp, string, ball, red dot).
5. Sound? ANSWERED: yes, made in code and small (snores, creaks, a meow), with a mute.
6. Failure replay? ANSWERED: play through to the moment someone wakes, hold a short funny beat (parent in the doorway), then rewind and mark the step that went wrong.
7. Names or look for the household? STILL OPEN. Milestone 1 uses generic storybook names, all in src/config.js; no real family names.
