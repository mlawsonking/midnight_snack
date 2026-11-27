// Keyboard-only playthrough in Playwright Chromium at 1920x1080 with screenshots into shots/.
// title -> 3 players -> win house 1 -> picker (star) -> house 2: fail, take back, retry, win ->
// house 3: win. Then a short gamepad check. Prints a JSON report; exits 1 on any failure.
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

const p = await newPage();
await sleep(800); await shot(p, 'title.png');
ok('starts on title', (await G(p, () => window.__game.screen)) === 'title');
await key(p, 'Enter'); await waitScreen(p, 'players');
await key(p, 'ArrowRight'); // 2 -> 3 players
await key(p, 'Enter'); await waitScreen(p, 'picker');
ok('three players chosen', (await G(p, () => window.__game.players)) === 3);
ok('picker starts on house 1', (await G(p, () => window.__game.pickerSel)) === 1);

// house 1: dog route (red dot by the jar + string by the kids' door)
await key(p, 'Enter'); await waitScreen(p, 'build');
ok('house 1 opened', (await G(p, () => window.__game.house)) === 0);
await place(p, 'dot', 0, 1); await place(p, 'string', 5, 1);
ok('turn passed to third player', (await G(p, () => window.__game.state.turn)) === 2);
const tap = await holdGo(p);
ok('short tap on go does not start', tap === 'build');
await waitScreen(p, 'win'); await sleep(1500);
ok('house 1 won', (await G(p, () => window.__game.solved[0])) === true);
await key(p, 'Enter'); await waitScreen(p, 'picker'); await sleep(600);
ok('picker moved to house 2', (await G(p, () => window.__game.pickerSel)) === 2);
await shot(p, 'picker.png');

// house 2: a noisy first try (ball next to the dog), take it back, finish quietly
await key(p, 'Enter'); await waitScreen(p, 'build');
await place(p, 'dot', 0, 0); await place(p, 'rampR', 1, 0); await place(p, 'ball', 3, 1);
await holdGo(p);
await waitScreen(p, 'beat'); await sleep(900);
ok('house 2 first run wakes the grown-up', (await G(p, () => window.__game.beat)) === 'woke');
await shot(p, 'fail-beat.png');
await waitScreen(p, 'rewind', 10000); await waitScreen(p, 'build', 10000); await sleep(300);
const f = await G(p, () => ({ fails: window.__game.fails[1], lf: window.__game.state.lastFailure && window.__game.state.lastFailure.result, parts: window.__game.state.parts.length }));
ok('machine stays as built, failure marked', f.fails === 1 && f.lf === 'woke' && f.parts === 3, f);
await trayTo(p, 'undo'); await key(p, 'Enter');
ok('take-back removes the ball', (await G(p, () => window.__game.state.parts.map((q) => q.type).join())) === 'dot,rampR');
await place(p, 'string', 4, 1); await place(p, 'rampR', 5, 1);
await trayTo(p, 'go'); await sleep(400);
await shot(p, 'house2-build.png');
await holdGo(p);
await waitScreen(p, 'win'); await sleep(1500);
ok('house 2 won on the retry', (await G(p, () => window.__game.solved[1])) === true);
await key(p, 'Enter'); await waitScreen(p, 'picker');

// house 3: left stairs, the dog carries the cookie through the string-opened door
ok('picker moved to house 3', (await G(p, () => window.__game.pickerSel)) === 3);
await key(p, 'Enter'); await waitScreen(p, 'build');
await place(p, 'dot', 0, 0); await place(p, 'rampL', 3, 0); await place(p, 'string', 3, 1);
await holdGo(p);
await waitScreen(p, 'run');
await p.waitForFunction(() => window.__game.state.items[0].y === 1 || window.__game.state.tick > 12, null, { timeout: 30000 });
await sleep(250);
await shot(p, 'house3-run.png');
await waitScreen(p, 'win'); await sleep(1600);
ok('house 3 won', (await G(p, () => window.__game.solved[2])) === true);
await shot(p, 'win.png');
const stored = await G(p, () => localStorage.getItem('midnight-snack-solved'));
ok('solved houses stored', stored === '[true,true,true]', { stored });
await p.context().close();

// hint: two failed runs in the cottage (red dot alone), then a soft glow shows where a part could go
const hp = await newPage();
await key(hp, 'Enter'); await key(hp, 'Enter'); await key(hp, 'Enter'); await waitScreen(hp, 'build');
await G(hp, () => { window.__game.speed = 3; });
await place(hp, 'dot', 0, 1);
for (let i = 0; i < 2; i++) { await holdGo(hp); await waitScreen(hp, 'beat'); await waitScreen(hp, 'build', 15000); await sleep(300); }
const hint = await G(hp, () => window.__game.hint);
ok('hint glows after two failed runs', hint && hint.type === 'string' && hint.x === 5, { hint });
await trayTo(hp, 'string'); await sleep(500); await shot(hp, 'hint.png');
await hp.context().close();

// gamepad: A starts from the title, d-pad moves, held A on go runs
const padInit = () => {
  window.__pad = { a: false, l: false, r: false };
  navigator.getGamepads = () => [{ connected: true, index: 0, id: 'fake', buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: i === 0 ? window.__pad.a : i === 14 ? window.__pad.l : i === 15 ? window.__pad.r : false, value: 0 })), axes: [0, 0, 0, 0] }];
};
const g = await newPage(padInit);
const padTap = async (k) => { await g.evaluate((k) => { window.__pad[k] = true; }, k); await sleep(120); await g.evaluate((k) => { window.__pad[k] = false; }, k); await sleep(120); };
await padTap('a'); await padTap('a'); await padTap('a');
ok('gamepad A reaches a house', (await G(g, () => window.__game.screen)) === 'build');
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
