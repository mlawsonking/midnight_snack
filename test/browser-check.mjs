// Keyboard-only playthrough in Playwright Chromium at 1920x1080 with screenshots into shots/.
// title -> 3 players -> house 1 (teaching): intro, tour bubble, ghost bubble, win with the dot alone ->
// house 2 win -> house 3: fail (explained), take back, retry, win -> house 4: win -> help replay.
// Then a stuck run with its explanation, hint after one fail, save migration, a gamepad check. Prints a JSON report; exits 1 on any failure.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  const req = createRequire(import.meta.url);
  try { ({ chromium } = req('playwright')); } catch { ({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright')); }
}

const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const b = await readFile(f); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const out = { errors: [], steps: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const ok = (name, cond, extra) => { out.steps.push({ name, ok: !!cond, ...(extra || {}) }); if (!cond) out.failed = true; };

async function newPage(init) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => out.errors.push('page: ' + e.message));
  if (init) await page.addInitScript(init);
  await page.goto(url); await page.waitForFunction(() => window.__game);
  return page;
}
const G = (p, f) => p.evaluate(f);
async function waitScreen(p, s, ms = 60000) { await p.waitForFunction((s) => window.__game.screen === s, s, { timeout: ms }); }
async function key(p, k) { await p.keyboard.press(k); await sleep(40); }
async function trayTo(p, kind) {
  const list = await G(p, () => window.__game.ui.trayList);
  const idx = list.indexOf(kind);
  for (let i = 0; i < 20 && (await G(p, () => window.__game.ui.tray)) !== idx; i++) await key(p, 'ArrowRight');
}
async function place(p, type, x, y) {
  await trayTo(p, type); await key(p, 'Enter');
  for (let i = 0; i < 40; i++) {
    const c = await G(p, () => { const u = window.__game.ui; const c = u.cells[u.cellIdx]; return c ? c.x + ',' + c.y : null; });
    if (c === x + ',' + y) break; await key(p, 'ArrowRight');
  }
  const before = await G(p, () => window.__game.state.parts.length);
  await key(p, 'Enter');
  ok(`placed ${type} ${x},${y}`, (await G(p, () => window.__game.state.parts.length)) === before + 1);
}
async function holdGo(p) {
  await trayTo(p, 'go');
  await p.keyboard.down('Enter'); await sleep(300); await p.keyboard.up('Enter'); await sleep(100);
  const tapped = await G(p, () => window.__game.screen);
  await p.keyboard.down('Enter'); await sleep(1250); await p.keyboard.up('Enter');
  return tapped;
}
const shot = (p, name) => p.screenshot({ path: join(root, 'shots', name) });

const enterHouse = async (pg, expectIntro = true) => {
  await key(pg, 'Enter');
  if (expectIntro) { await waitScreen(pg, 'intro', 5000); await sleep(150); await key(pg, 'Enter'); }
  await waitScreen(pg, 'build', 5000);
};
const p = await newPage();
await sleep(800); await shot(p, 'title.png');
ok('starts on title', (await G(p, () => window.__game.screen)) === 'title');
await key(p, 'Enter'); await waitScreen(p, 'players');
await key(p, 'ArrowRight'); // 2 -> 3 players
await key(p, 'Enter'); await waitScreen(p, 'picker');
ok('three players chosen', (await G(p, () => window.__game.players)) === 3);
ok('picker shows four houses, starts on house 1', (await G(p, () => window.__game.houses.length)) === 4 && (await G(p, () => window.__game.pickerSel)) === 1);

// house 1 (teaching house): the goal intro, the tour, then the red dot alone wins
await key(p, 'Enter'); await waitScreen(p, 'intro', 5000);
ok('intro shows on first entering a house', (await G(p, () => window.__game.tour.join())) === 'cat,dog,meter');
await sleep(4700); await shot(p, 'intro.png');
await waitScreen(p, 'tour', 5000); await sleep(1500);
ok('tour plays the cat habit bubble first', (await G(p, () => window.__game.tourStop)) === 'cat');
await shot(p, 'bubble.png');
await key(p, 'Enter'); await waitScreen(p, 'build', 3000);
ok('button skips the tour into building', (await G(p, () => window.__game.screen)) === 'build');
await trayTo(p, 'dot'); await key(p, 'Enter');
for (let i = 0; i < 20 && (await G(p, () => { const u = window.__game.ui; const c = u.cells[u.cellIdx]; return c ? c.x : -1; })) !== 0; i++) await key(p, 'ArrowRight');
await sleep(1300);
ok('dot ghost seen by the cat shows the cat bubble', (await G(p, () => window.__game.bubble)) === 'cat');
await shot(p, 'house1-teach.png');
await key(p, 'Enter');
ok('teaching house: one piece placed', (await G(p, () => window.__game.state.parts.length)) === 1);
await holdGo(p);
await waitScreen(p, 'win'); await sleep(1500);
ok('house 1 won with the red dot alone', (await G(p, () => window.__game.solved[0])) === true);
await key(p, 'Enter'); await waitScreen(p, 'picker'); await sleep(600);
ok('picker moved to house 2', (await G(p, () => window.__game.pickerSel)) === 2);
await shot(p, 'picker.png');

// house 2 (cottage): only new habits are toured; dog route (red dot by the jar + string)
await key(p, 'Enter'); await waitScreen(p, 'intro', 5000);
const t2 = await G(p, () => window.__game.tour);
ok('cottage tour skips the habit already seen (cat), offers the rest', !t2.includes('cat') && t2.includes('door') && t2.includes('baby'), { tour: t2.join() });
await key(p, 'Enter'); await waitScreen(p, 'build', 3000);
ok('house 2 opened', (await G(p, () => window.__game.house)) === 1);
await place(p, 'dot', 0, 1); await place(p, 'string', 5, 1);
ok('turn passed to third player', (await G(p, () => window.__game.state.turn)) === 2);
const tap = await holdGo(p);
ok('short tap on go does not start', tap === 'build');
await waitScreen(p, 'win'); await sleep(1500);
ok('house 2 won', (await G(p, () => window.__game.solved[1])) === true);
await key(p, 'Enter'); await waitScreen(p, 'picker');

// house 3 (tall house): a noisy first try (ball next to the dog), take it back, finish quietly
await enterHouse(p);
await place(p, 'dot', 0, 0); await place(p, 'rampR', 1, 0); await place(p, 'ball', 3, 1);
await holdGo(p);
await waitScreen(p, 'beat'); await sleep(1100);
const ex3 = await G(p, () => window.__game.explain);
ok('house 3 first run wakes the grown-up, explained', (await G(p, () => window.__game.beat)) === 'woke' && ex3 && ex3.result === 'woke', { reason: ex3 && ex3.reason, bubble: ex3 && ex3.bubble });
await shot(p, 'fail-beat.png');
await waitScreen(p, 'rewind', 10000); await waitScreen(p, 'build', 10000); await sleep(300);
const f = await G(p, () => ({ fails: window.__game.fails[2], lf: window.__game.state.lastFailure && window.__game.state.lastFailure.result, parts: window.__game.state.parts.length }));
ok('machine stays as built, failure marked', f.fails === 1 && f.lf === 'woke' && f.parts === 3, f);
await trayTo(p, 'undo'); await key(p, 'Enter');
ok('take-back removes the ball', (await G(p, () => window.__game.state.parts.map((q) => q.type).join())) === 'dot,rampR');
await place(p, 'string', 4, 1); await place(p, 'rampR', 5, 1);
await trayTo(p, 'go'); await sleep(400);
await shot(p, 'house3-build.png');
await holdGo(p);
await waitScreen(p, 'win'); await sleep(1500);
ok('house 3 won on the retry', (await G(p, () => window.__game.solved[2])) === true);
await key(p, 'Enter'); await waitScreen(p, 'picker');

// house 4 (big house): left stairs, the dog carries the cookie through the string-opened door
ok('picker moved to house 4', (await G(p, () => window.__game.pickerSel)) === 4);
await enterHouse(p);
await place(p, 'dot', 0, 0); await place(p, 'rampL', 3, 0); await place(p, 'string', 3, 1);
await holdGo(p);
await waitScreen(p, 'run');
await p.waitForFunction(() => window.__game.state.items[0].y === 1 || window.__game.state.tick > 12, null, { timeout: 30000 });
await sleep(250);
await shot(p, 'house4-run.png');
await waitScreen(p, 'win'); await sleep(1600);
ok('house 4 won', (await G(p, () => window.__game.solved[3])) === true);
await shot(p, 'win.png');
const stored = await G(p, () => localStorage.getItem('midnight-snack-solved'));
ok('solved houses stored by id', stored === '{"v":2,"solved":{"littlehouse":true,"cottage":true,"tallhouse":true,"bighouse":true}}', { stored });
// the help slot replays the intro and the whole tour
await key(p, 'Enter'); await waitScreen(p, 'picker'); await enterHouse(p, false);
await trayTo(p, 'help'); await key(p, 'Enter');
ok('help slot replays the intro with every habit', (await G(p, () => window.__game.screen)) === 'intro' && (await G(p, () => window.__game.tour.length)) === 3);
await key(p, 'Enter'); await waitScreen(p, 'build', 3000);
await p.context().close();

// a stuck run in the cottage (a lone ramp) explains itself: the cat never woke, so the jar never tipped
const sp = await newPage();
await key(sp, 'Enter'); await key(sp, 'Enter'); await waitScreen(sp, 'picker'); await key(sp, 'ArrowRight');
await enterHouse(sp);
await place(sp, 'rampR', 2, 1);
await holdGo(sp);
await waitScreen(sp, 'beat', 30000); await sleep(1700);
const exs = await G(sp, () => window.__game.explain);
ok('stuck run shows the explanation (cat bubble)', exs && exs.result === 'stuck' && exs.reason === 'catAsleep' && exs.bubble === 'cat', exs);
await shot(sp, 'explain-stuck.png');
await waitScreen(sp, 'build', 15000); await sleep(300);
const h1 = await G(sp, () => window.__game.hint);
ok('hint glows after one failed run', h1 && h1.type === 'dot' && h1.x === 0, { hint: h1 });
await sp.context().close();

// hint: one woke run in the cottage (red dot alone), then a soft glow shows where the string goes
const hp = await newPage();
await key(hp, 'Enter'); await key(hp, 'Enter'); await waitScreen(hp, 'picker'); await key(hp, 'ArrowRight');
await enterHouse(hp);
await G(hp, () => { window.__game.speed = 3; });
await place(hp, 'dot', 0, 1);
await holdGo(hp); await waitScreen(hp, 'beat');
const exw = await G(hp, () => window.__game.explain);
ok('woke run explained: the creak woke the baby', exw && exw.reason === 'noiseWokeBaby' && exw.bubble === 'door', exw);
await waitScreen(hp, 'build', 15000); await sleep(300);
const hint = await G(hp, () => window.__game.hint);
ok('hint glows after one failed run (woke)', hint && hint.type === 'string' && hint.x === 5, { hint });
await trayTo(hp, 'string'); await sleep(500); await shot(hp, 'hint.png');
await hp.context().close();

// an old Milestone 2 save (3-entry array: cottage, tall, big) is migrated to house ids
const mp = await newPage(() => { try { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('midnight-snack-solved', '[true,false,true]'); } } catch (e) {} });
await mp.reload(); await mp.waitForFunction(() => window.__game);
ok('old 3-entry save migrated', (await G(mp, () => window.__game.solved.join())) === 'false,true,false,true');
await mp.context().close();

// gamepad: A starts from the title, d-pad moves, held A on go runs
const padInit = () => {
  window.__pad = { a: false, l: false, r: false };
  navigator.getGamepads = () => [{ connected: true, index: 0, id: 'fake', buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 ? window.__pad.a : i === 14 ? window.__pad.l : i === 15 ? window.__pad.r : false, value: 0 })), axes: [0, 0, 0, 0] }];
};
const g = await newPage(padInit);
const padTap = async (k) => { await g.evaluate((k) => { window.__pad[k] = true; }, k); await sleep(120); await g.evaluate((k) => { window.__pad[k] = false; }, k); await sleep(120); };
await padTap('a'); await padTap('a'); await padTap('a'); await sleep(200); await padTap('a');
ok('gamepad A reaches a house (A skips the intro)', (await G(g, () => window.__game.screen)) === 'build');
const goIdx = await G(g, () => window.__game.ui.trayList.indexOf('go'));
for (let i = 0; i < goIdx; i++) await padTap('r');
await g.evaluate(() => { window.__pad.a = true; }); await sleep(1400); await g.evaluate(() => { window.__pad.a = false; });
ok('gamepad held A on go runs', ['run', 'beat', 'win', 'rewind'].includes(await G(g, () => window.__game.screen)));
await g.context().close();

await browser.close(); server.close();
out.errorCount = out.errors.length;
out.passed = out.steps.filter((s) => s.ok).length + '/' + out.steps.length;
console.log(JSON.stringify(out, null, 1));
if (out.failed || out.errorCount) process.exit(1);
