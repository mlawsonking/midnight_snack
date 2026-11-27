// Exhaustive-ish search of every house: all unordered arrangements of placements, by piece
// count (0, 1, 2, ...), until the arrangement cap is hit. Turn order does not change outcomes.
// Usage: node test/solver.mjs [levelIndex] [cap]
import { createState, place, legalPlacements, runToEnd, stateHash, routeOf, levelList, LEVEL_LIST, mulberry32 } from '../src/engine.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const onlyLevel = process.argv[2] !== undefined && process.argv[2] !== 'all' ? Number(process.argv[2]) : null;
const CAP = Number(process.argv[3] || 150000);

function solveLevel(index) {
  const base = createState(1, index, { players: 1 });
  const cands = legalPlacements(base); // all placements legal on an empty house
  const total = Object.values(base.inventory).reduce((a, b) => a + b, 0);
  let tried = 0, capped = false, completeUpTo = -1;
  const results = { win: 0, woke: 0, stuck: 0, timeout: 0 };
  const routes = {};
  const minFail = {};
  const visit = (s, list) => {
    tried++;
    const r = runToEnd(s);
    results[r.result]++;
    if (r.result === 'win') {
      const key = routeOf(r.state);
      const rt = routes[key] || (routes[key] = { route: key, count: 0, minPieces: 99, example: null, noise: 0, ticks: 0 });
      rt.count++;
      if (list.length < rt.minPieces) { rt.minPieces = list.length; rt.example = list.map((p) => [p.type, p.x, p.y]); rt.noise = r.noise; rt.ticks = r.ticks; }
    } else if (!minFail[r.result] || list.length < minFail[r.result].length) minFail[r.result] = list.map((p) => [p.type, p.x, p.y]);
  };
  // depth-limited DFS over subsets of exactly k pieces
  const dfs = (s, list, from, k) => {
    if (capped) return;
    if (list.length === k) { if (tried >= CAP) { capped = true; return; } visit(s, list); return; }
    for (let i = from; i < cands.length; i++) {
      const n = place(s, cands[i]);
      if (n === s) continue;
      list.push(cands[i]); dfs(n, list, i + 1, k); list.pop();
      if (capped) return;
    }
  };
  for (let k = 0; k <= total && !capped; k++) { dfs(base, [], 0, k); if (!capped) completeUpTo = k; }
  const wins = results.win;
  return {
    index, id: LEVEL_LIST[index].id, budget: LEVEL_LIST[index].budget, candidates: cands.length, pieces: total,
    arrangementsTried: tried, capped, cap: CAP, allArrangementsUpToPieces: completeUpTo,
    wins, failing: { woke: results.woke, stuck: results.stuck, timeout: results.timeout },
    minimumPiecesToWin: Math.min(99, ...Object.values(routes).map((r) => r.minPieces)),
    distinctRoutes: Object.values(routes).sort((a, b) => a.minPieces - b.minPieces || b.count - a.count),
    shortestFailingExamples: minFail,
  };
}

function determinism(index) {
  const rnd = mulberry32(12345 + index);
  for (let k = 0; k < 20; k++) {
    let s = createState(Math.floor(rnd() * 1e6), index);
    const n = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) { const lp = legalPlacements(s); if (!lp.length) break; s = place(s, lp[Math.floor(rnd() * lp.length)]); }
    const h0 = stateHash(runToEnd(s).state);
    for (let j = 0; j < 50; j++) if (stateHash(runToEnd(s).state) !== h0) return false;
  }
  return true;
}

const levels = onlyLevel === null ? levelList().map((l) => l.index) : [onlyLevel];
const out = { note: 'unordered subsets of legal placements, searched by piece count; inventory enforced by engine', levels: [] };
for (const i of levels) {
  const t0 = Date.now();
  const r = solveLevel(i);
  r.deterministic = determinism(i);
  r.seconds = Math.round((Date.now() - t0) / 100) / 10;
  out.levels.push(r);
  console.log(`house ${i + 1} (${r.id}): tried ${r.arrangementsTried}${r.capped ? ' (CAPPED, complete up to ' + r.allArrangementsUpToPieces + ' pieces)' : ' (all)'}, wins ${r.wins}, routes ${r.distinctRoutes.length}, min pieces ${r.minimumPiecesToWin}, failing woke ${r.failing.woke} stuck ${r.failing.stuck} timeout ${r.failing.timeout}, deterministic ${r.deterministic}, ${r.seconds}s`);
  for (const rt of r.distinctRoutes) console.log(`   ${rt.route}  x${rt.count}  min ${rt.minPieces}  noise ${rt.noise}  e.g. ${JSON.stringify(rt.example)}`);
}
if (onlyLevel === null) writeFileSync(fileURLToPath(new URL('./solver-results.json', import.meta.url)), JSON.stringify(out, null, 1));
