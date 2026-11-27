// Canvas renderer (Milestone 2). Reads state only and never mutates it. Draws in a 960x540
// logical space scaled to the canvas (1920x1080 for the TV). The world (house) is drawn through a
// gentle camera; motion is interpolated between ticks (alpha 0..1) with squash and stretch.
// Nothing here feeds back into the rules.
import { LEVELS, LEVEL_LIST } from './engine.js';
import { CONFIG } from './config.js';

const CELL = 80, FH = 160, LW = 960, LH = 540;
const C = {
  sky0: '#0a1230', sky1: '#23306a', roof: '#4a2848', roofEdge: '#6c3a5e', beam: '#6b4a3a', beamL: '#8a6248',
  lamp: '#ffd36b', warm: '#ffb84d', cream: '#f7ead0', wood: '#a8754c', woodD: '#6e4a30', red: '#ff4d5a',
  ink: '#1d1a2a', skin: '#f1c9a5', skin2: '#e4b48e', pj: '#9a7fc8', cap: '#5fb8a8', panel: 'rgba(12,18,46,0.84)',
};
const ROOM_TINT = { attic: '#3a3862', landing: '#3b3d6c', parents: '#4a3c68', kitchen: '#53436a', hall: '#3f4170', kids: '#4c3f70', nursery: '#544269' };
const ROOF = { littlehouse: '#4f6a3a', cottage: '#7a3448', tallhouse: '#2f4f7a', bighouse: '#5a3a7a' };

const cx = (x) => x * CELL + CELL / 2;
const fb = (y) => (y + 1) * FH - 10;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);

function circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function ell(ctx, x, y, rx, ry, fill, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot || 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function rr(ctx, x, y, w, h, r, fill) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
function rrs(ctx, x, y, w, h, r, stroke, lw) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}
function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  ctx.fillStyle = fill; ctx.fill();
}
function line(ctx, pts, col, w) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function eyes(ctx, x, y, gap, open, look) {
  for (const s of [-1, 1]) {
    if (open) { circle(ctx, x + s * gap, y, 4.2, '#fff8e8'); circle(ctx, x + s * gap + (look || 0), y + 0.5, 2.4, C.ink); }
    else { ctx.beginPath(); ctx.arc(x + s * gap, y - 2, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke(); }
  }
}
function zzz(ctx, x, y, t, k) {
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    const ph = ((t / 1600) + i / 3 + k * 0.13) % 1;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
    ctx.fillStyle = '#f7ead0'; ctx.font = 'bold ' + Math.round(12 + ph * 10) + 'px Georgia, serif';
    ctx.fillText('z', x + ph * 18 + Math.sin(ph * 6 + k) * 3, y - ph * 40);
  }
  ctx.globalAlpha = 1;
}

// ---------- characters (drawn standing on (x, fy), facing d) ----------

function drawCat(ctx, x, fy, mode, d, t, holding) {
  const col = '#a3a9c4', dark = '#767c9c', belly = '#d6d9ea';
  d = d || -1;
  if (mode === 'asleep') {
    const br = Math.sin(t / 520) * 1.2;
    ell(ctx, x, fy - 13 - br, 25, 14 + br, col);
    ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 20, fy - 6); ctx.quadraticCurveTo(x - 4, fy + 2, x + 14, fy - 4); ctx.stroke();
    circle(ctx, x + 15, fy - 18 - br, 12, col);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x + 6, fy - 25); ctx.lineTo(x + 9, fy - 38); ctx.lineTo(x + 16, fy - 28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 17, fy - 28); ctx.lineTo(x + 25, fy - 36); ctx.lineTo(x + 26, fy - 21); ctx.fill();
    eyes(ctx, x + 15, fy - 18 - br, 4.5, false);
    circle(ctx, x + 15, fy - 12 - br, 1.8, '#ff9fb0');
    return;
  }
  const sit = mode === 'pounce' || mode === 'play' || mode === 'awake';
  const startled = mode === 'startled';
  const bodyY = sit ? fy - 22 : fy - 20;
  if (startled) { // arched back, fur up
    ctx.beginPath(); ctx.moveTo(x - 24, fy - 6); ctx.quadraticCurveTo(x, fy - 52, x + 24, fy - 6); ctx.lineTo(x - 24, fy - 6); ctx.fillStyle = col; ctx.fill();
    for (let i = -3; i <= 3; i++) line(ctx, [x + i * 6, fy - 38 + Math.abs(i) * 3, x + i * 7, fy - 46 + Math.abs(i) * 3], dark, 2.5);
  } else if (sit) ell(ctx, x - d * 4, bodyY, 17, 20, col);
  else ell(ctx, x, bodyY, 23, 12, col);
  ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const tw = Math.sin(t / 160) * 6;
  ctx.beginPath(); ctx.moveTo(x - d * 18, bodyY); ctx.quadraticCurveTo(x - d * 36, bodyY - 12 + tw, x - d * 30, bodyY - 34 + tw); ctx.stroke();
  if (!sit && !startled) {
    const ph = Math.sin(t / 70);
    for (const [lx, k] of [[-13, 1], [13, -1]]) line(ctx, [x + lx, bodyY + 6, x + lx + ph * 5 * k, fy - 2], dark, 6);
  } else line(ctx, [x + d * 8, bodyY + 10, x + d * 12, fy - 2], dark, 6);
  const hx = x + d * (sit ? 10 : 22), hy = (sit ? fy - 46 : fy - 32) - (startled ? 8 : 0);
  ell(ctx, x + d * 2, bodyY + 4, 8, 6, belly);
  circle(ctx, hx, hy, 13, col);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(hx - 12, hy - 4); ctx.lineTo(hx - 9, hy - 21); ctx.lineTo(hx - 1, hy - 10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(hx + 12, hy - 4); ctx.lineTo(hx + 9, hy - 21); ctx.lineTo(hx + 1, hy - 10); ctx.fill();
  circle(ctx, hx - 9, hy - 12, 2.5, '#ffb3c1'); circle(ctx, hx + 9, hy - 12, 2.5, '#ffb3c1');
  if (mode === 'play' || mode === 'pounce') { // happy closed eyes
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 5, hy, 3.5, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke(); }
  } else {
    circle(ctx, hx - 5, hy - 1, 4.8, '#fff6c0'); circle(ctx, hx + 5, hy - 1, 4.8, '#fff6c0');
    circle(ctx, hx - 5 + d * 1.5, hy - 1, startled ? 1.4 : 2.4, C.ink); circle(ctx, hx + 5 + d * 1.5, hy - 1, startled ? 1.4 : 2.4, C.ink);
  }
  circle(ctx, hx, hy + 5, 2, '#ff9fb0');
  line(ctx, [hx - 14, hy + 4, hx - 24, hy + 2], '#e8e8f4', 1.2); line(ctx, [hx + 14, hy + 4, hx + 24, hy + 2], '#e8e8f4', 1.2);
  if (holding) drawMouse(ctx, x + d * 22, fy - 2, d, t, true);
}

function drawDog(ctx, x, fy, mode, d, t, carrying) {
  const col = '#cf9058', dark = '#8a5a32', spot = '#b37440';
  d = d || 1;
  if (mode === 'asleep') {
    const br = Math.sin(t / 640) * 1.4;
    ell(ctx, x + 4, fy - 15 - br, 30, 15 + br, col);
    ell(ctx, x + 12, fy - 22 - br, 9, 6, spot);
    circle(ctx, x - 20, fy - 15, 13, col);
    ell(ctx, x - 25, fy - 9, 7, 11, dark, 0.3);
    eyes(ctx, x - 17, fy - 18, 4.5, false);
    circle(ctx, x - 32, fy - 13, 3, C.ink);
    line(ctx, [x + 32, fy - 10, x + 42, fy - 6 + Math.sin(t / 900) * 2], dark, 6);
    return;
  }
  const lying = mode === 'done';
  const ph = lying ? 0 : Math.sin(t / 85);
  const bodyY = lying ? fy - 16 : fy - 26;
  ell(ctx, x, bodyY, 28, lying ? 13 : 15, col);
  ell(ctx, x - d * 6, bodyY - 6, 9, 6, spot);
  if (!lying) for (const [lx, k] of [[-16, 1], [16, -1]]) line(ctx, [x + lx, bodyY + 8, x + lx + ph * 5 * k, fy - 2], dark, 7);
  const wag = Math.sin(t / (lying ? 120 : 60)) * 8;
  line(ctx, [x - d * 26, bodyY - 4, x - d * 38, bodyY - 16 + wag], dark, 6);
  const hx = x + d * 28, hy = bodyY - 12;
  circle(ctx, hx, hy, 15, col);
  ell(ctx, hx - d * 10, hy + 3, 6, 12, dark, d * 0.3);
  ell(ctx, hx + d * 12, hy + 4, 9, 7, '#e2b07c');
  circle(ctx, hx + d * 18, hy + 1, 4, C.ink);
  if (lying) eyes(ctx, hx + d * 3, hy - 4, 3.5, false);
  else { circle(ctx, hx + d * 3, hy - 4, 4, '#fff8e8'); circle(ctx, hx + d * 4, hy - 4, 2.4, C.ink); }
  if (!carrying && !lying) ell(ctx, hx + d * 11, hy + 13, 4, 6, '#ff8fa3');
}

function drawMouse(ctx, x, fy, d, t, caught) {
  d = d || 1;
  const wob = caught ? 0 : Math.sin(t / 60) * 1;
  ell(ctx, x, fy - 9 + wob, 13, 9, '#c9b8c8');
  circle(ctx, x + d * 11, fy - 11 + wob, 6.5, '#c9b8c8');
  circle(ctx, x + d * 9, fy - 18 + wob, 4.5, '#ffb3c8');
  circle(ctx, x + d * 15, fy - 12 + wob, 1.6, C.ink);
  circle(ctx, x + d * 17.5, fy - 9 + wob, 1.8, '#ff7fa0');
  ctx.strokeStyle = '#ffb3c8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - d * 12, fy - 8); ctx.quadraticCurveTo(x - d * 22, fy - 18, x - d * 26, fy - 6); ctx.stroke();
  // wind-up key
  line(ctx, [x, fy - 18, x, fy - 23], '#ffd36b', 2.5);
  ell(ctx, x - 4, fy - 25, 4, 2.5, '#ffd36b'); ell(ctx, x + 4, fy - 25, 4, 2.5, '#ffd36b');
  circle(ctx, x - 6, fy - 1, 2.5, '#6b5a6b'); circle(ctx, x + 6, fy - 1, 2.5, '#6b5a6b');
}

function drawCrib(ctx, x, fy) {
  rr(ctx, x - 36, fy - 46, 72, 9, 4, '#efd6aa');
  ctx.strokeStyle = '#efd6aa'; ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 30 + i * 12, fy - 38); ctx.lineTo(x - 30 + i * 12, fy - 6); ctx.stroke(); }
  rr(ctx, x - 38, fy - 9, 76, 8, 3, '#efd6aa');
  // mobile
  line(ctx, [x, fy - 120, x, fy - 96], '#cdbf9e', 1.5); line(ctx, [x - 22, fy - 96, x + 22, fy - 96], '#cdbf9e', 2);
}
function drawBaby(ctx, x, fy, mode, t) {
  const cry = mode === 'crying';
  const wob = cry ? Math.sin(t / 55) * 2.5 : 0;
  for (const [k, c] of [[-22, '#ffd36b'], [0, '#9fd3ff'], [22, '#ffb3c8']]) { line(ctx, [x + k, fy - 96, x + k, fy - 86], '#cdbf9e', 1.2); star(ctx, x + k, fy - 82 + Math.sin(t / 700 + k) * 2, 6, c); }
  ell(ctx, x + 6, fy - 46, 20, 9, '#9fd3ff');
  circle(ctx, x - 14 + wob, fy - 53, 12.5, '#ffd9b8');
  circle(ctx, x - 14 + wob, fy - 64, 3, '#e9b48e');
  if (cry) {
    ell(ctx, x - 14 + wob, fy - 47, 5, 4 + Math.abs(Math.sin(t / 90)) * 2, '#7a2a3a');
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x - 14 + wob + s * 3, fy - 56); ctx.lineTo(x - 14 + wob + s * 8, fy - 54); ctx.stroke(); }
    for (const s of [-1, 1]) { const ty = (t / 4) % 14; ell(ctx, x - 14 + wob + s * 9, fy - 50 + ty, 2.2, 3.2, '#7fd0ff'); }
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = 'rgba(255,170,120,' + (0.8 - i * 0.22) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - 14, fy - 54, 22 + i * 10 + (t / 30) % 10, -1.3, -0.3); ctx.stroke(); }
  } else {
    eyes(ctx, x - 14, fy - 55, 4, false);
    if (mode === 'hushed') { ctx.fillStyle = '#ffb3c8'; ctx.beginPath(); ctx.arc(x - 14, fy - 48, 3, 0, Math.PI); ctx.fill(); }
  }
}

function drawParentBed(ctx, x, fy, occupied, t) {
  rr(ctx, x - 56, fy - 58, 12, 58, 4, C.woodD);
  rr(ctx, x + 44, fy - 44, 12, 44, 4, C.woodD);
  rr(ctx, x - 52, fy - 30, 104, 24, 6, '#7a5fa3');
  rr(ctx, x - 46, fy - 42, 30, 14, 7, C.cream);
  if (!occupied) { ell(ctx, x + 8, fy - 32, 38, 8, '#8f75bb'); return; }
  const br = Math.sin(t / 700) * 1.5;
  circle(ctx, x - 30, fy - 44, 12, C.skin);
  eyes(ctx, x - 30, fy - 46, 4, false);
  ctx.fillStyle = C.cap; ctx.beginPath(); ctx.moveTo(x - 42, fy - 50); ctx.lineTo(x - 18, fy - 54); ctx.lineTo(x - 24, fy - 72); ctx.fill();
  circle(ctx, x - 24, fy - 72, 5, C.cream);
  ell(ctx, x + 10, fy - 34 - br, 42, 13 + br, '#a389d0');
}
function drawParent(ctx, x, fy, mode, d, t, awake) {
  const walk = mode === 'sleepwalk';
  const ph = walk ? Math.sin(t / 150) : 0;
  const bob = Math.abs(ph) * -3;
  rr(ctx, x - 17, fy - 80 + bob, 34, 70, 13, C.pj);
  for (let i = 0; i < 3; i++) circle(ctx, x, fy - 66 + i * 16 + bob, 2.2, '#cdb9ee');
  line(ctx, [x - 8, fy - 14 + bob, x - 8 + ph * 6, fy - 2], C.skin, 7); line(ctx, [x + 8, fy - 14 + bob, x + 8 - ph * 6, fy - 2], C.skin, 7);
  const hx = x, hy = fy - 94 + bob;
  circle(ctx, hx, hy, 16, C.skin);
  ctx.fillStyle = C.cap; ctx.beginPath(); ctx.moveTo(hx - 16, hy - 6); ctx.lineTo(hx + 15, hy - 8); ctx.lineTo(hx - d * 22, hy - 30); ctx.fill();
  circle(ctx, hx - d * 22, hy - 30, 5, C.cream);
  if (awake) {
    eyes(ctx, hx, hy - 1, 6, true, 0);
    ell(ctx, hx, hy + 8, 4.5, 6, '#7a2a3a');
    line(ctx, [hx + 14, fy - 66, hx + 28, fy - 62], C.skin, 6);
    rr(ctx, hx + 24, fy - 74, 8, 22, 2, C.cream); ell(ctx, hx + 28, fy - 82 + Math.sin(t / 70), 4, 7, C.lamp);
    glow(ctx, hx + 28, fy - 82, 60, 'rgba(255,220,140,0.9)', 0.5);
  } else {
    eyes(ctx, hx, hy - 1, 6, false);
    ell(ctx, hx, hy + 7, 3, 2, '#c58a7a');
    line(ctx, [hx - 14, fy - 66 + bob, hx + d * 30 - 14, fy - 70 + bob], C.skin, 6);
    line(ctx, [hx + 14, fy - 66 + bob, hx + d * 30 + 14, fy - 70 + bob], C.skin, 6);
  }
  if (mode === 'rocking') { ctx.fillStyle = '#ffb3c8'; ctx.font = 'bold 20px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('♪', hx + 26, hy - 18 + Math.sin(t / 300) * 4); }
}

function drawKidsBed(ctx, x, fy, t, happy) {
  rr(ctx, x + 42, fy - 62, 12, 62, 4, C.woodD); rr(ctx, x - 62, fy - 46, 10, 46, 4, C.woodD);
  rr(ctx, x - 58, fy - 34, 106, 26, 7, '#5fb8a8');
  for (let i = 0; i < 4; i++) circle(ctx, x - 44 + i * 26, fy - 20, 4, '#86d4c4');
  const awake = happy === 'awake';
  if (awake) happy = false;
  const up = happy ? -10 - Math.abs(Math.sin(t / 180)) * 4 : awake ? -12 : 0;
  circle(ctx, x + 20, fy - 42 + up, 11, C.skin); circle(ctx, x - 2, fy - 42 + up * 0.8, 11, C.skin2);
  ell(ctx, x + 20, fy - 52 + up, 11, 5, '#7a4a2a'); ell(ctx, x - 2, fy - 52 + up * 0.8, 11, 5, '#e0a040');
  if (happy) {
    for (const hx of [x + 20, x - 2]) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(hx + s * 4, fy - 42 + up, 3, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke(); } ctx.beginPath(); ctx.arc(hx, fy - 38 + up, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); }
  } else if (awake) { eyes(ctx, x + 20, fy - 43 + up, 4, true, -1.5); eyes(ctx, x - 2, fy - 43 + up * 0.8, 4, true, -1.5); }
  else { eyes(ctx, x + 20, fy - 43, 4, false); eyes(ctx, x - 2, fy - 43, 4, false); }
}

function drawCookie(ctx, x, y, r, rot, bite) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circle(ctx, 0, 0, r, '#c98a48');
  circle(ctx, 0, 0, r * 0.84, '#e8b66e');
  for (const [a, b] of [[-0.4, -0.3], [0.35, -0.2], [0, 0.4], [-0.35, 0.3], [0.4, 0.35], [0.05, -0.05]]) circle(ctx, a * r, b * r, r * 0.13, '#5a3420');
  if (bite) { ctx.globalCompositeOperation = 'destination-out'; circle(ctx, r * 0.85, -r * 0.6, r * 0.4, '#000'); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
}
function drawBall(ctx, x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circle(ctx, 0, 0, r, '#ff6b7a');
  ctx.fillStyle = '#6ad0ff';
  ctx.beginPath(); ctx.arc(0, 0, r, -0.5, 0.5); ctx.lineTo(0, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI - 0.5, Math.PI + 0.5); ctx.lineTo(0, 0); ctx.fill();
  circle(ctx, -r * 0.35, -r * 0.4, r * 0.22, 'rgba(255,255,255,0.6)');
  ctx.restore();
}

// ---------- icons (tray, picker, hints) ----------

export function drawIcon(ctx, type, x, fy, s, t, extra) {
  s = s || 1;
  ctx.save(); ctx.translate(x, fy); ctx.scale(s, s);
  if (type === 'rampR' || type === 'rampL') {
    const d = type === 'rampR' ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(-34 * d, -40); ctx.lineTo(34 * d, 0); ctx.lineTo(-34 * d, 0); ctx.closePath();
    ctx.fillStyle = C.wood; ctx.fill(); ctx.strokeStyle = C.woodD; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = C.lamp; ctx.beginPath(); ctx.moveTo(4 * d, -27); ctx.lineTo(22 * d, -17); ctx.lineTo(2 * d, -11); ctx.fill();
  } else if (type === 'ball') drawBall(ctx, 0, -15, 15, 0.3);
  else if (type === 'mouse') drawMouse(ctx, 0, 0, 1, 0, true);
  else if (type === 'dot') {
    rr(ctx, -11, -18, 22, 18, 4, '#5a5e7a'); rr(ctx, -6, -38, 12, 22, 4, '#7b7f9e');
    circle(ctx, 0, -40, 7, C.red); glow(ctx, 0, -40, 20, 'rgba(255,77,90,0.9)', 0.6);
  } else if (type === 'string') {
    ctx.strokeStyle = C.cream; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-28, -6); ctx.quadraticCurveTo(0, -18, 28, -56); ctx.stroke();
    circle(ctx, -28, -6, 6, C.red);
    ctx.strokeStyle = C.red; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(-35, -10, 6, 4, 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-21, -10, 6, 4, -0.5, 0, Math.PI * 2); ctx.stroke();
  } else if (type === 'undo') {
    ctx.strokeStyle = C.cream; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(2, -20, 15, Math.PI * 1.15, Math.PI * 2.7); ctx.stroke();
    ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(-24, -32); ctx.lineTo(-4, -28); ctx.lineTo(-18, -12); ctx.fill();
  } else if (type === 'go') {
    circle(ctx, 0, -20, 25, '#4fbf6a'); circle(ctx, -6, -27, 9, 'rgba(255,255,255,0.25)');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-8, -34); ctx.lineTo(14, -20); ctx.lineTo(-8, -6); ctx.fill();
    if (extra > 0) { ctx.strokeStyle = C.lamp; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -20, 32, -Math.PI / 2, -Math.PI / 2 + extra * Math.PI * 2); ctx.stroke(); }
  } else if (type === 'home') {
    ctx.fillStyle = '#e88a6a'; ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(0, -44); ctx.lineTo(24, -24); ctx.fill();
    rr(ctx, -18, -26, 36, 24, 3, C.cream); rr(ctx, -5, -16, 10, 14, 2, C.woodD); rr(ctx, 7, -22, 8, 7, 1, C.lamp);
    if (extra > 0) { ctx.strokeStyle = C.lamp; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, -22, 32, -Math.PI / 2, -Math.PI / 2 + extra * Math.PI * 2); ctx.stroke(); }
  } else if (type === 'sound') {
    ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(-18, -27); ctx.lineTo(-8, -27); ctx.lineTo(5, -38); ctx.lineTo(5, -4); ctx.lineTo(-8, -15); ctx.lineTo(-18, -15); ctx.fill();
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    if (extra) { ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(11, -30); ctx.lineTo(25, -12); ctx.moveTo(25, -30); ctx.lineTo(11, -12); ctx.stroke(); }
    else { ctx.strokeStyle = C.cream; ctx.beginPath(); ctx.arc(6, -21, 10, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(6, -21, 18, -0.8, 0.8); ctx.stroke(); }
  } else if (type === 'full') {
    ctx.strokeStyle = C.cream; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const b = 10;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ox = sx * 22, oy = -20 + sy * 17;
      const kx = extra ? ox - sx * b : ox, ky = extra ? oy - sy * b : oy; // corner points out, or in when full
      ctx.beginPath(); ctx.moveTo(ox - sx * b, oy); ctx.lineTo(kx, ky); ctx.lineTo(ox, oy - sy * b); ctx.stroke();
    }
  } else if (type === 'help') { // a thought bubble with a little cat face: "show me the habits"
    ell(ctx, 0, -26, 26, 19, C.cream); circle(ctx, -14, -2, 5, C.cream); circle(ctx, -22, 7, 3, C.cream);
    ctx.fillStyle = '#a3a9c4'; circle(ctx, 0, -24, 10, '#a3a9c4');
    ctx.beginPath(); ctx.moveTo(-9, -28); ctx.lineTo(-7, -40); ctx.lineTo(-1, -32); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, -28); ctx.lineTo(7, -40); ctx.lineTo(1, -32); ctx.fill();
    circle(ctx, -4, -25, 2, C.ink); circle(ctx, 4, -25, 2, C.ink); circle(ctx, 16, -30, 4, C.red);
  } else if (type === 'back') {
    ctx.strokeStyle = C.cream; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -33); ctx.lineTo(13, -7); ctx.moveTo(13, -33); ctx.lineTo(-13, -7); ctx.stroke();
  }
  ctx.restore();
}

export function token(ctx, x, y, r, p, dim) {
  const col = CONFIG.playerColors[p % CONFIG.playerColors.length];
  const shape = CONFIG.playerShapes[p % CONFIG.playerShapes.length];
  ctx.globalAlpha = dim ? 0.28 : 1;
  circle(ctx, x, y + r * 0.08, r, 'rgba(0,0,0,0.25)');
  circle(ctx, x, y, r, col);
  ctx.strokeStyle = 'rgba(255,248,230,0.9)'; ctx.lineWidth = Math.max(2, r * 0.1); ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, Math.PI * 2); ctx.stroke();
  const ink = '#fff8e6';
  if (shape === 'star') star(ctx, x, y + r * 0.04, r * 0.62, ink);
  else if (shape === 'moon') { circle(ctx, x, y, r * 0.58, ink); circle(ctx, x + r * 0.28, y - r * 0.2, r * 0.5, col); }
  else if (shape === 'heart') {
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.52);
    ctx.bezierCurveTo(x - r * 0.9, y - r * 0.1, x - r * 0.4, y - r * 0.78, x, y - r * 0.28);
    ctx.bezierCurveTo(x + r * 0.4, y - r * 0.78, x + r * 0.9, y - r * 0.1, x, y + r * 0.52); ctx.fillStyle = ink; ctx.fill();
  } else {
    circle(ctx, x, y, r * 0.34, ink);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(ctx, [x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48, x + Math.cos(a) * r * 0.68, y + Math.sin(a) * r * 0.68], ink, Math.max(2, r * 0.1)); }
  }
  ctx.globalAlpha = 1;
}

// ---------- sky and house ----------

function drawSky(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, C.sky0); g.addColorStop(1, C.sky1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  let k = 7;
  for (let i = 0; i < 70; i++) {
    k = (k * 1103515245 + 12345) >>> 0; const sx = k % LW; k = (k * 1103515245 + 12345) >>> 0; const sy = k % 300;
    ctx.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t / 900 + i * 1.7));
    circle(ctx, sx, sy, i % 9 === 0 ? 2.2 : 1.3, '#fff4c8');
  }
  ctx.globalAlpha = 1;
  glow(ctx, 880, 64, 90, 'rgba(255,240,190,0.6)', 0.35);
  circle(ctx, 880, 64, 30, '#fff1b8'); circle(ctx, 894, 56, 26, '#121b40');
  for (let i = 0; i < 3; i++) { // drifting clouds
    const x = ((t / (90 + i * 30)) + i * 380) % (LW + 300) - 150, y = 70 + i * 60;
    ctx.globalAlpha = 0.16; ell(ctx, x, y, 80, 16, '#c9d2ff'); ell(ctx, x + 40, y - 10, 46, 16, '#c9d2ff'); ctx.globalAlpha = 1;
  }
}

function drawHills(ctx) {
  ctx.fillStyle = '#16204a'; ctx.beginPath(); ctx.moveTo(0, 470); ctx.quadraticCurveTo(240, 400, 520, 450); ctx.quadraticCurveTo(760, 490, 960, 430); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
  ctx.fillStyle = '#101838'; ctx.beginPath(); ctx.moveTo(0, 505); ctx.quadraticCurveTo(300, 470, 600, 500); ctx.quadraticCurveTo(800, 520, 960, 495); ctx.lineTo(960, 540); ctx.lineTo(0, 540); ctx.fill();
}

function roomAt(L, x, y) { for (const r of L.rooms) if (r.y === y && x >= r.x0 && x <= r.x1) return r; return null; }

function drawHouse(ctx, s, L, t, lit) {
  const W = L.w * CELL, H = L.h * FH;
  // ground and garden
  rr(ctx, -200, H - 4, W + 400, 60, 0, '#1a2a3e');
  for (let i = -4; i < L.w + 4; i++) { const bx = i * CELL + 40; ell(ctx, bx, H + 6, 34, 12, '#22384a'); }
  // chimney + roof
  rr(ctx, W * 0.72, -96, 34, 70, 3, '#5a3a40'); rr(ctx, W * 0.72 - 4, -100, 42, 10, 3, '#6c4a50');
  for (let i = 0; i < 3; i++) { const ph = ((t / 2400) + i / 3) % 1; ctx.globalAlpha = 0.25 * (1 - ph); circle(ctx, W * 0.72 + 17 + Math.sin(ph * 5) * 8, -110 - ph * 50, 8 + ph * 14, '#c9d2ff'); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = ROOF[L.id] || C.roof; ctx.beginPath(); ctx.moveTo(-34, 4); ctx.lineTo(W / 2, -96); ctx.lineTo(W + 34, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.roofEdge; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.save(); ctx.clip();
  for (let r = 0; r < 6; r++) for (let i = -12; i < 30; i++) { ctx.globalAlpha = 0.18; ell(ctx, i * 34 + (r % 2) * 17, -84 + r * 17, 15, 7, '#000'); }
  ctx.restore(); ctx.globalAlpha = 1;
  circle(ctx, W / 2, -38, 17, C.lamp); glow(ctx, W / 2, -38, 50, 'rgba(255,211,107,0.7)', 0.5);
  line(ctx, [W / 2 - 17, -38, W / 2 + 17, -38], C.roofEdge, 3); line(ctx, [W / 2, -55, W / 2, -21], C.roofEdge, 3);
  // rooms
  for (const r of L.rooms) {
    const x0 = r.x0 * CELL, wd = (r.x1 - r.x0 + 1) * CELL, y0 = r.y * FH;
    ctx.fillStyle = ROOM_TINT[r.kind] || '#3a3a66'; ctx.fillRect(x0, y0, wd, FH);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, wd, FH); ctx.clip();
    ctx.globalAlpha = 0.09; // wallpaper
    for (let yy = 12; yy < FH; yy += 22) for (let xx = 10 + ((yy / 22) % 2) * 11; xx < wd; xx += 22) circle(ctx, x0 + xx, y0 + yy, 2.4, '#fff3d0');
    ctx.globalAlpha = 1;
    const lx = x0 + wd / 2;
    glow(ctx, lx, y0 + 46, 70 + wd * 0.6, 'rgba(255,200,110,0.6)', (lit ? 0.85 : 0.5) + 0.04 * Math.sin(t / 900 + r.x0));
    rr(ctx, x0, y0 + FH - 26, wd, 16, 0, 'rgba(0,0,0,0.12)'); // skirting
    ctx.restore();
    line(ctx, [lx, y0, lx, y0 + 22], '#2a2030', 2);
    ctx.fillStyle = lit ? '#fff0b0' : C.lamp; ctx.beginPath(); ctx.moveTo(lx - 15, y0 + 38); ctx.lineTo(lx + 15, y0 + 38); ctx.lineTo(lx + 8, y0 + 22); ctx.lineTo(lx - 8, y0 + 22); ctx.fill();
    drawRoomDecor(ctx, r, L, x0, wd, y0, t);
  }
  // stairs
  for (const st of L.stairs) {
    const x = st.x * CELL, top = (st.y + 1) * FH, bot = fb(st.y + 1);
    ctx.fillStyle = ROOM_TINT[(roomAt(L, st.x, st.y) || {}).kind] || '#3b3d6c'; ctx.fillRect(x + 6, top - 7, CELL - 12, 14);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const sx = x + CELL - 10 - (i + 1) * ((CELL - 14) / n), sy = top + 6 + i * ((bot - top - 6) / n);
      rr(ctx, sx, sy, 22, 9, 2, i % 2 ? C.woodD : '#7d5638');
    }
    line(ctx, [x + CELL - 4, top - 30, x + 6, bot - 52], C.beamL, 4);
    for (let i = 0; i < 5; i++) { const k = i / 4; line(ctx, [lerp(x + CELL - 4, x + 6, k), lerp(top - 30, bot - 52, k), lerp(x + CELL - 4, x + 6, k), lerp(top - 30, bot - 52, k) + 30], C.beamL, 2.5); }
  }
  // floors and walls
  for (let y = 0; y <= L.h; y++) {
    const yy = y * FH;
    for (let x = 0; x < L.w; x++) {
      const hole = y > 0 && y < L.h && L.stairs.some((st) => st.x === x && st.y === y - 1);
      if (!hole) rr(ctx, x * CELL - (x === 0 ? 12 : 0), yy - 6, CELL + (x === 0 || x === L.w - 1 ? 12 : 0), 12, 3, C.beam);
    }
  }
  rr(ctx, -12, 0, 12, H, 3, C.beam); rr(ctx, W, 0, 12, H, 3, C.beam);
  for (let i = 1; i < L.rooms.length; i++) {
    const r = L.rooms[i], prev = L.rooms[i - 1];
    if (prev.y !== r.y) continue;
    const wx = r.x0 * CELL, y0 = r.y * FH;
    const door = s.doors.find((d) => d.y === r.y && d.x + 1 === r.x0);
    ctx.fillStyle = C.beam; ctx.fillRect(wx - 5, y0 + 4, 10, door ? 34 : FH - 8);
    if (door) {
      if (door.open) { ctx.fillStyle = '#c99260'; ctx.beginPath(); ctx.moveTo(wx, y0 + 38); ctx.lineTo(wx + 24, y0 + 50); ctx.lineTo(wx + 24, y0 + FH - 4); ctx.lineTo(wx, y0 + FH - 8); ctx.fill(); circle(ctx, wx + 18, y0 + 100, 3, C.lamp); }
      else { rr(ctx, wx - 9, y0 + 38, 18, FH - 46, 3, '#c99260'); rr(ctx, wx - 6, y0 + 46, 12, 30, 2, '#b47e50'); circle(ctx, wx + 3, y0 + 100, 3.5, C.lamp); }
    }
  }
}

function drawRoomDecor(ctx, r, L, x0, wd, y0, t) {
  const f = y0 + FH - 10;
  const free = (x) => !L.creatures.some((c) => c.x === x && c.y === r.y) && !(L.goal.x === x && L.goal.y === r.y) && !(L.jar.x === x && L.jar.y === r.y);
  if (wd >= 160) { // window with the night outside
    const wx = x0 + wd / 2 - (wd >= 240 ? wd / 4 : 0);
    rr(ctx, wx - 22, y0 + 42, 44, 48, 6, '#0f1a3a'); star(ctx, wx + 8, y0 + 58, 4, '#fff1b8');
    ctx.strokeStyle = C.beamL; ctx.lineWidth = 4; ctx.strokeRect(wx - 22, y0 + 42, 44, 48); line(ctx, [wx, y0 + 42, wx, y0 + 90], C.beamL, 3);
    rr(ctx, wx - 28, y0 + 88, 56, 6, 2, C.beamL);
  }
  if (r.kind === 'kitchen') {
    for (let x = r.x0; x <= r.x1; x++) if (x !== L.jar.x || r.y !== L.jar.y) { if (free(x) && (x - r.x0) % 3 === 1) { rr(ctx, cx(x) - 16, y0 + 50, 32, 5, 2, C.beamL); circle(ctx, cx(x) - 6, y0 + 42, 7, '#d46a6a'); rr(ctx, cx(x) + 3, y0 + 34, 9, 16, 3, '#6ab0d4'); } }
  } else if (r.kind === 'kids') {
    star(ctx, x0 + 18, y0 + 30, 7, 'rgba(255,211,107,0.7)'); star(ctx, x0 + wd - 20, y0 + 44, 6, 'rgba(255,179,200,0.7)');
    const bx = x0 + 12; if (free(r.x0)) { rr(ctx, bx, f - 16, 16, 16, 2, '#6ad0ff'); rr(ctx, bx + 6, f - 30, 16, 14, 2, '#ffb84d'); }
  } else if (r.kind === 'nursery') {
    circle(ctx, x0 + 14, f - 14, 7, '#fff1b8'); glow(ctx, x0 + 14, f - 14, 26, 'rgba(255,240,180,0.8)', 0.5);
  } else if (r.kind === 'hall') {
    rr(ctx, x0 + 14, f - 3, wd - 28, 5, 2, '#8a4a5a');
    if (wd < 160) { rr(ctx, x0 + wd / 2 - 14, y0 + 50, 28, 22, 3, C.beamL); rr(ctx, x0 + wd / 2 - 10, y0 + 54, 20, 14, 2, '#6a9a7a'); }
  } else if (r.kind === 'attic') {
    for (let x = r.x0; x <= r.x1; x++) if (free(x) && (x - r.x0) % 2 === 0) { rr(ctx, cx(x) - 26, f - 34, 42, 34, 3, '#7a6a52'); line(ctx, [cx(x) - 26, f - 24, cx(x) + 16, f - 24], '#5e5040', 2); }
  } else if (r.kind === 'landing') {
    ell(ctx, x0 + 14, f - 10, 8, 10, '#6a4a3a'); for (const a of [-0.6, 0, 0.6]) ell(ctx, x0 + 14 + a * 10, f - 26, 4, 10, '#5a9a6a', a);
  } else if (r.kind === 'parents') {
    rr(ctx, x0 + 6, f - 70, 30, 70, 3, '#5e4a6a'); circle(ctx, x0 + 29, f - 36, 2, C.lamp);
  }
}

function drawFurniture(ctx, s, L, t, screen, view_beat) {
  // jar counter, beds, cushions
  const jx = cx(L.jar.x), jy = fb(L.jar.y);
  rr(ctx, jx - 36, jy - 56, 72, 56, 4, '#7d5a8a'); rr(ctx, jx - 40, jy - 62, 80, 8, 3, C.cream);
  rr(ctx, jx - 28, jy - 46, 24, 36, 3, '#6a4a78'); rr(ctx, jx + 4, jy - 46, 24, 36, 3, '#6a4a78');
  for (const c of L.creatures) {
    const x = cx(c.x), f = fb(c.y);
    if (c.kind === 'cat') rr(ctx, x - 30, f - 9, 60, 10, 5, '#d46a6a');
    else if (c.kind === 'dog') { rr(ctx, x - 42, f - 12, 84, 12, 6, '#6a8ad4'); rr(ctx, x - 44, f - 18, 10, 18, 4, '#5a78c0'); rr(ctx, x + 34, f - 18, 10, 18, 4, '#5a78c0'); }
    else if (c.kind === 'baby') drawCrib(ctx, x, f);
    else if (c.kind === 'parent') { const p = s.creatures.find((q) => q.id === c.id); drawParentBed(ctx, x, f, p && p.mode === 'asleep' && p.x === c.x && p.y === c.y && !(screen === 'beat' && view_beat === 'woke'), t); }
  }
  const won = screen === 'win';
  drawKidsBed(ctx, cx(L.goal.x), fb(L.goal.y), t, won || (screen === 'intro' ? 'awake' : false));
  if (!won) star(ctx, cx(L.goal.x) - 26, fb(L.goal.y) - 84 + Math.sin(t / 400) * 4, 12, 'rgba(255,211,107,0.95)');
}

function drawJar(ctx, s, L, prev, alpha) {
  const x = cx(s.jar.x), y = fb(s.jar.y) - 62;
  const wasTipped = prev ? prev.jar.tipped : s.jar.tipped;
  const k = s.jar.tipped ? (wasTipped ? 1 : ease(alpha)) : 0;
  ctx.save(); ctx.translate(x + 10 * L.jar.dir, y);
  ctx.rotate(L.jar.dir * 1.25 * k + (s.jar.tipped ? 0 : Math.sin(alpha * Math.PI) * 0));
  ctx.fillStyle = 'rgba(190,220,255,0.5)'; ctx.beginPath(); ctx.roundRect(-17, -46, 34, 46, 9); ctx.fill();
  ctx.strokeStyle = 'rgba(230,245,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-17, -46, 34, 46, 9); ctx.stroke();
  rr(ctx, -13, -53, 26, 9, 3, '#d46a6a');
  line(ctx, [-10, -38, -10, -12], 'rgba(255,255,255,0.5)', 3);
  ctx.restore();
}

function drawParts(ctx, s, L, t, showTokens) {
  for (const p of s.parts) {
    const x = cx(p.x), f = fb(p.y);
    if (p.type === 'ball' || p.type === 'mouse') continue; // drawn as items
    if (p.type === 'string') {
      const d = L.doors.find((dd) => dd.id === p.door), door = s.doors.find((dd) => dd.id === p.door);
      const doorX = (d.x + 1) * CELL;
      const sag = door && door.open ? 2 : 10;
      ctx.strokeStyle = C.cream; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, f - 4); ctx.quadraticCurveTo((x + doorX) / 2, f - sag, doorX + (door && door.open ? 22 : 0), p.y * FH + 70); ctx.stroke();
      circle(ctx, x, f - 4, 6, C.red);
    } else if (p.type === 'dot') {
      drawIcon(ctx, 'dot', x + 24, f, 0.8, t);
      ell(ctx, x, f - 2, 10, 4, C.red); glow(ctx, x, f - 2, 28, 'rgba(255,60,80,0.9)', 0.55 + 0.3 * Math.sin(t / 150));
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x + 24, f - 32); ctx.lineTo(x - 8, f - 3); ctx.lineTo(x + 8, f - 1); ctx.fillStyle = C.red; ctx.fill(); ctx.globalAlpha = 1;
    } else drawIcon(ctx, p.type, x, f, 1, t);
    if (showTokens) token(ctx, x - 28, f - 66, 10, p.player);
  }
}

// Interpolated world position: walking hop, stairs paths, and the progress through the tick.
function motion(prev, cur, list, id, alpha) {
  const c = cur[list].find((o) => o.id === id);
  const p = prev ? prev[list].find((o) => o.id === id) : null;
  if (!p || (p.x === c.x && p.y === c.y)) return { x: cx(c.x), f: fb(c.y), moving: false, k: 0, p };
  const a = alpha;
  if (p.y !== c.y) {
    const down = c.y > p.y;
    const topY = fb(Math.min(p.y, c.y)), botY = fb(Math.max(p.y, c.y));
    const xs = cx(p.x), xh = cx(c.x) + CELL * 0.35, xf = cx(c.x) - CELL * 0.35;
    if (down) {
      if (a < 0.2) { const k = a / 0.2; return { x: lerp(xs, xh, k), f: topY, moving: true, k: Math.sin(Math.PI * k), p, stairs: true }; }
      if (a < 0.85) { const k = (a - 0.2) / 0.65; return { x: lerp(xh, xf, k), f: lerp(topY, botY, k) - Math.abs(Math.sin(k * Math.PI * 4)) * 8, moving: true, k: Math.sin(Math.PI * k), p, stairs: true }; }
      const k = (a - 0.85) / 0.15; return { x: lerp(xf, cx(c.x), k), f: botY, moving: true, k: Math.sin(Math.PI * k), p, stairs: true, land: k };
    }
    return { x: lerp(xf, xh, a), f: lerp(botY, topY, a), moving: true, k: Math.sin(Math.PI * a), p, stairs: true };
  }
  return { x: lerp(cx(p.x), cx(c.x), a), f: fb(c.y), moving: true, k: Math.sin(Math.PI * a), p };
}

function withSquash(ctx, x, f, sx, sy, fn) { ctx.save(); ctx.translate(x, f); ctx.scale(sx, sy); ctx.translate(-x, -f); fn(); ctx.restore(); }

function drawCreatures(ctx, s, prev, alpha, t, screen, beat) {
  for (const c of s.creatures) {
    if (c.kind === 'parent' && screen === 'beat' && beat === 'woke') continue; // drawn in the doorway
    if (c.kind === 'parent' && c.mode === 'asleep' && c.x === c.homeX && c.y === c.homeY) continue; // in bed
    const m = motion(prev, s, 'creatures', c.id, alpha);
    const pc = m.p || c;
    let sx = 1, sy = 1, hop = 0;
    if (m.moving) { hop = m.k * (c.kind === 'cat' ? 9 : 6); sy = 1 + 0.1 * m.k; sx = 1 - 0.07 * m.k; if (alpha > 0.82) { const q = Math.sin(Math.PI * (alpha - 0.82) / 0.18); sy -= 0.12 * q; sx += 0.1 * q; } }
    const woke = prev && pc.mode === 'asleep' && c.mode !== 'asleep';
    if (woke) { // anticipation: crouch, then pop up
      if (alpha < 0.55) { const q = Math.sin(Math.PI * alpha / 0.55); sy = 1 - 0.18 * q; sx = 1 + 0.12 * q; }
      else { const q = Math.sin(Math.PI * (alpha - 0.55) / 0.45); sy = 1 + 0.14 * q; sx = 1 - 0.08 * q; hop = 8 * q; }
    }
    if (c.mode === 'asleep') { const b = Math.sin(t / 650 + c.x) * 0.025; sy += b; sx -= b * 0.6; }
    const mode = woke && alpha < 0.55 ? (c.kind === 'cat' ? 'startled' : c.mode) : c.mode;
    const x = m.x, f = m.f - hop;
    const d = c.dir || (c.kind === 'cat' ? -1 : 1);
    withSquash(ctx, x, m.f, sx, sy, () => {
      if (c.kind === 'cat') drawCat(ctx, x, f, mode, d, t, c.mode === 'play');
      else if (c.kind === 'dog') drawDog(ctx, x, f, mode, d, t, c.carrying);
      else if (c.kind === 'baby') drawBaby(ctx, x, f, mode, t);
      else if (c.kind === 'parent') drawParent(ctx, x, f, c.mode, d, t, screen === 'beat' && beat === 'woke');
    });
    if (woke) { ctx.globalAlpha = Math.sin(Math.PI * alpha); circle(ctx, x, f - 76, 13, C.lamp); ctx.fillStyle = C.ink; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x, f - 69); ctx.globalAlpha = 1; }
    if (c.mode === 'asleep') zzz(ctx, x + (c.kind === 'baby' ? -14 : c.kind === 'dog' ? -14 : 12), f - (c.kind === 'baby' ? 66 : 40), t, c.x + c.y * 3);
  }
}

function drawItems(ctx, s, L, prev, alpha, t, screen) {
  for (const it of s.items) {
    if (it.state === 'inJar') { drawCookie(ctx, cx(it.x) + 10 * L.jar.dir, fb(it.y) - 84, 11, 0); continue; }
    if (it.state === 'caught') continue; // in the cat's paws
    const m = motion(prev, s, 'items', it.id, alpha);
    let x = m.x, y = m.f - 15;
    const pi = m.p;
    if (pi && pi.state === 'inJar') { // falls out of the jar onto the floor with a bounce
      const k = alpha;
      x = lerp(cx(pi.x) + 10 * L.jar.dir, m.x, k);
      y = lerp(fb(it.y) - 84, fb(it.y) - 15, Math.min(1, k * 1.6)) - (k > 0.62 ? Math.sin((k - 0.62) / 0.38 * Math.PI) * 14 : 0);
    }
    const dog = s.creatures.find((c) => c.id === 'dog');
    if (it.state === 'carried' && dog) { const dm = motion(prev, s, 'creatures', 'dog', alpha); x = dm.x + (dog.dir || 1) * 44; y = dm.f - 34 - dm.k * 6; }
    if (it.state === 'goal') { y = fb(it.y) - 46; x = cx(it.x) - 36; if (screen === 'win') y -= 8 + Math.abs(Math.sin(t / 250)) * 8; }
    let sq = 1;
    if (m.land !== undefined) sq = 1 - 0.25 * Math.sin(Math.PI * m.land);
    const rot = (m.x / CELL) * 1.7;
    ctx.save(); ctx.translate(x, y + 15); ctx.scale(1 + (1 - sq) * 0.8, sq); ctx.translate(-x, -(y + 15));
    if (it.kind === 'cookie') { glow(ctx, x, y, 38, 'rgba(255,211,107,0.85)', 0.4 + 0.1 * Math.sin(t / 300)); drawCookie(ctx, x, y, 14, screen === 'win' ? Math.sin(t / 300) * 0.3 : rot); }
    else if (it.kind === 'ball') drawBall(ctx, x, y, 13, rot);
    else drawMouse(ctx, x, y + 15, it.dir || 1, t, it.state !== 'roll');
    ctx.restore();
  }
}

// Visible noise: rings from every noisy event of the last two ticks, warmer for louder.
function drawNoise(ctx, s, alpha) {
  for (const e of s.events) {
    const age = s.tick - e.tick + alpha;
    if (e.noise <= 0 || age > 2 || age < 0) continue;
    const x = cx(e.x), y = fb(e.y) - 44;
    const col = e.noise >= 3 ? '255,96,96' : e.noise === 2 ? '255,170,90' : '255,230,150';
    for (let i = 0; i < e.noise + 1; i++) {
      const r = 16 + i * 13 + age * 34;
      ctx.strokeStyle = 'rgba(' + col + ',' + Math.max(0, (1 - age / 2) * (1 - i * 0.18)) + ')';
      ctx.lineWidth = 5 - i; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
    if (age < 1) { // a little burst glyph
      ctx.save(); ctx.translate(x, y - 46 - age * 10); ctx.globalAlpha = 1 - age;
      for (let i = 0; i < 6 + e.noise * 2; i++) { const a = i * Math.PI * 2 / (6 + e.noise * 2); line(ctx, [Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * (14 + e.noise * 3), Math.sin(a) * (14 + e.noise * 3)], 'rgb(' + col + ')', 3); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
}

function drawMark(ctx, f, t) {
  if (!f) return;
  const marks = [];
  if (f.cause) marks.push([f.cause, 1]);
  if (f.failedEvent) marks.push([f.failedEvent, f.cause ? 0.65 : 1]);
  for (const [e, k] of marks) {
    const x = cx(e.x), y = fb(e.y) - 42;
    ctx.strokeStyle = C.red; ctx.lineWidth = 6 * k; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t / 40;
    ctx.beginPath(); ctx.arc(x, y, (38 + 4 * Math.sin(t / 160)) * k + 6, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (k === 1) { circle(ctx, x + 36, y - 44, 17, C.red); ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x + 36, y - 35); }
  }
}

function drawHint(ctx, h, t) {
  if (!h) return;
  const x = cx(h.x), f = fb(h.y);
  const p = 0.5 + 0.5 * Math.sin(t / 380);
  glow(ctx, x, f - 30, 70, 'rgba(255,225,140,0.95)', 0.35 + 0.3 * p);
  for (let i = 0; i < 4; i++) { const a = t / 900 + i * Math.PI / 2; star(ctx, x + Math.cos(a) * 34, f - 34 + Math.sin(a) * 22, 5 + p * 2, 'rgba(255,240,180,0.9)'); }
  ctx.globalAlpha = 0.28 + 0.15 * p; drawIcon(ctx, h.type, x, f, 0.9, t); ctx.globalAlpha = 1;
}

function drawCursor(ctx, s, ui, t) {
  if (ui.mode !== 'cell') return;
  const c = ui.cells[ui.cellIdx];
  if (!c) return;
  const x = cx(c.x), f = fb(c.y);
  rr(ctx, x - CELL / 2 + 4, c.y * FH + 10, CELL - 8, FH - 20, 14, 'rgba(255,240,190,0.10)');
  rrs(ctx, x - CELL / 2 + 4, c.y * FH + 10, CELL - 8, FH - 20, 14, CONFIG.playerColors[s.turn % 4], 3);
  ctx.globalAlpha = 0.6 + 0.25 * Math.sin(t / 180);
  if (ui.sel === 'dot') { ell(ctx, x, f - 2, 10, 4, C.red); drawIcon(ctx, 'dot', x + 24, f, 0.8, t); }
  else if (ui.sel === 'ball') drawBall(ctx, x, f - 15, 13, 0);
  else if (ui.sel === 'mouse') drawMouse(ctx, x, f, 1, t, true);
  else drawIcon(ctx, ui.sel, x, f, 1, t);
  ctx.globalAlpha = 1;
  const by = c.y * FH + 18 + Math.sin(t / 200) * 6;
  token(ctx, x, by + 8, 15, s.turn);
  ctx.fillStyle = CONFIG.playerColors[s.turn % 4]; ctx.beginPath(); ctx.moveTo(x - 10, by + 26); ctx.lineTo(x + 10, by + 26); ctx.lineTo(x, by + 38); ctx.fill();
}

// ---------- camera ----------

const cam = { x: 0, y: 0, z: 1, t: -1, level: '' };
function viewRect(screen) { return screen === 'build' ? { top: 64, bottom: 446 } : { top: 64, bottom: 534 }; }
const ZOOM = { win: 1.22, beat: 1.12, tour: 1.3, intro: 1 };
function fitZoom(L, vr) {
  const bw = L.w * CELL + 90, bh = L.h * FH + 130;
  return Math.min((LW - 30) / bw, (vr.bottom - vr.top) / bh);
}
function updateCamera(view, L, focus) {
  const vr = viewRect(view.screen);
  const fit = fitZoom(L, vr);
  let z = fit, tx = L.w * CELL / 2, ty = (L.h * FH - 100) / 2;
  if (focus && view.screen !== 'build') {
    z = fit * (ZOOM[view.screen] || 1.18);
    tx = lerp(tx, focus.x, 0.8); ty = lerp(ty, focus.y, 0.8);
  }
  const vw = LW / z, vh = (vr.bottom - vr.top) / z;
  const x0 = -45, x1 = L.w * CELL + 45, y0 = -115, y1 = L.h * FH + 20;
  tx = vw >= x1 - x0 ? (x0 + x1) / 2 : clamp(tx, x0 + vw / 2, x1 - vw / 2);
  ty = vh >= y1 - y0 ? (y0 + y1) / 2 : clamp(ty, y0 + vh / 2, y1 - vh / 2);
  const now = view.time || 0;
  if (cam.level !== L.id || cam.t < 0 || view.snap) { cam.x = tx; cam.y = ty; cam.z = z; cam.level = L.id; }
  else { const k = 1 - Math.exp(-Math.max(0, Math.min(100, now - cam.t)) / 420); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (z - cam.z) * k; }
  cam.t = now;
  return { vr };
}
export function cameraOf() { return { x: cam.x, y: cam.y, z: cam.z }; }

// Where the woken grown-up pops up: in the doorway of their room (or wherever they sleepwalked to).
function doorwayOf(s, L) {
  const p = s.creatures.find((c) => c.kind === 'parent');
  if (!p) return null;
  if (p.x !== p.homeX || p.y !== p.homeY || p.mode !== 'asleep') return { x: p.x, y: p.y, moved: true };
  const r = roomAt(L, p.x, p.y);
  let best = p.x, bd = 1000;
  for (const st of L.stairs) {
    if (st.y !== p.y) continue;
    const x = clamp(st.x, r.x0, r.x1), d = Math.abs(st.x - p.x);
    if (d < bd) { bd = d; best = x; }
  }
  return { x: best, y: p.y, moved: false };
}
function focusOf(s, prev, alpha, screen, beat, L, view) {
  if (screen === 'intro') return null;
  if (screen === 'tour' && view.stop) return { x: cx(view.stop.x) + (view.stop.who.indexOf('Door') > 0 ? CELL / 2 : 0), y: fb(view.stop.y) - 110 };
  if (screen === 'beat' && view.explain && beat !== 'woke') { const e = view.explain; return { x: (cx(e.x) + cx(e.spot.x)) / 2, y: (fb(e.y) + fb(e.spot.y)) / 2 - 100 }; }
  if (screen === 'win') return { x: cx(L.goal.x), y: fb(L.goal.y) - 60 };
  if (screen === 'beat' && beat === 'woke') { const d = doorwayOf(s, L), e = s.failedEvent; if (d) return { x: e ? (cx(d.x) * 2 + cx(e.x)) / 3 : cx(d.x), y: e ? (fb(d.y) * 2 + fb(e.y)) / 3 - 60 : fb(d.y) - 70 }; }
  const pts = [];
  const cm = motion(prev, s, 'items', 'cookie', alpha);
  const ck = s.items[0];
  if (ck.state === 'carried') { const dm = motion(prev, s, 'creatures', 'dog', alpha); pts.push([dm.x, dm.f - 40, 3]); }
  else pts.push([cm.x, cm.f - 40, 3]);
  for (const c of s.creatures) if (c.mode !== 'asleep' && c.mode !== 'done' && c.mode !== 'pounce' && c.mode !== 'play' && c.mode !== 'rocking' && c.mode !== 'hushed') { const m = motion(prev, s, 'creatures', c.id, alpha); pts.push([m.x, m.f - 50, 1]); }
  let wx = 0, wy = 0, ws = 0;
  for (const [x, y, w] of pts) { wx += x * w; wy += y * w; ws += w; }
  return { x: wx / ws, y: wy / ws };
}

// ---------- HUD ----------

function drawMeter(ctx, s, prev, t) {
  const n = s.noise.budget, used = s.noise.total, before = prev ? prev.noise.total : used;
  const gap = 34, w = n * gap + 70;
  rr(ctx, 14, 10, w, 50, 25, C.panel);
  for (let i = 0; i < n; i++) {
    const x = 40 + i * gap, y = 35;
    const stir = i < used, fresh = stir && i >= before;
    const wob = stir ? Math.sin(t / 70 + i) * (fresh ? 3 : 1.2) : 0;
    circle(ctx, x + wob, y, 13, stir ? '#ffd6a0' : '#e9e2f5');
    if (stir) { // stirring: one eye open, worried brow
      circle(ctx, x - 4 + wob, y - 1, 2.6, C.ink); ctx.beginPath(); ctx.arc(x + 4 + wob, y - 2, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
      line(ctx, [x - 7 + wob, y - 7, x - 2 + wob, y - 5], C.ink, 1.8); ell(ctx, x + wob, y + 6, 2.5, 1.8, '#a0505a');
      if (fresh) glow(ctx, x, y, 30, 'rgba(255,150,100,0.9)', 0.6);
    } else { eyes(ctx, x, y - 1, 4, false); ctx.globalAlpha = 0.6; ctx.fillStyle = '#a7a0c8'; ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('z', x + 11, y - 9 - Math.sin(t / 500 + i) * 2); ctx.globalAlpha = 1; }
  }
  // the grown-up's face at the end: asleep until the budget is passed
  const fx = 40 + n * gap + 8, over = used > n;
  circle(ctx, fx, 35, 18, C.skin);
  ctx.fillStyle = C.cap; ctx.beginPath(); ctx.moveTo(fx - 18, 28); ctx.lineTo(fx + 16, 26); ctx.lineTo(fx + 24, 4); ctx.fill(); circle(ctx, fx + 24, 4, 4, C.cream);
  eyes(ctx, fx, 35, 6, over, 0);
  if (over) ell(ctx, fx, 45, 4, 5, '#7a2a3a');
}

export function trayFor(state, levelId) {
  const L = LEVELS[levelId || state.levelId];
  const parts = ['rampR', 'rampL', 'string', 'ball', 'mouse', 'dot'].filter((k) => L.inventory[k] !== undefined);
  return [...parts, 'undo', 'go', 'help', 'home', 'sound', 'full'];
}

function drawTray(ctx, s, ui, view, t) {
  const tray = ui.trayList;
  rr(ctx, 12, 452, LW - 24, 82, 26, C.panel);
  token(ctx, 58, 493, 30, s.turn);
  const n = tray.length, x0 = 124, gap = Math.min(90, (LW - x0 - 20) / n);
  for (let i = 0; i < n; i++) {
    const k = tray[i], x = x0 + gap / 2 + i * gap;
    const count = s.inventory[k];
    const usable = count === undefined ? (k !== 'undo' || s.parts.length > 0) : count > 0;
    const sel = ui.mode === 'tray' && ui.tray === i;
    const bw = gap - 6;
    if (sel) { rr(ctx, x - bw / 2, 456, bw, 74, 18, 'rgba(255,211,107,0.26)'); rrs(ctx, x - bw / 2, 456, bw, 74, 18, C.lamp, 4); }
    if (ui.mode === 'cell' && ui.sel === k) rrs(ctx, x - bw / 2, 456, bw, 74, 18, CONFIG.playerColors[s.turn % 4], 4);
    if (view.hint && view.hint.type === k && ui.mode === 'tray') glow(ctx, x, 494, 44, 'rgba(255,230,150,0.9)', 0.25 + 0.2 * Math.sin(t / 380));
    ctx.globalAlpha = usable ? 1 : 0.25;
    const sc = k === 'rampR' || k === 'rampL' || k === 'string' ? 0.72 : k === 'mouse' ? 1.15 : 0.86;
    const pop = sel ? 1.08 + 0.03 * Math.sin(t / 200) : 1;
    drawIcon(ctx, k, x, k === 'mouse' ? 512 : 518, sc * pop, t, k === 'go' ? (ui.holdKind === 'go' ? ui.hold : 0) : k === 'home' ? (ui.holdKind === 'home' ? ui.hold : 0) : k === 'sound' ? ui.muted : k === 'full' ? ui.full : 0);
    ctx.globalAlpha = 1;
    if (count !== undefined) for (let j = 0; j < count; j++) circle(ctx, x - (count - 1) * 6 + j * 12, 464, 4.5, C.cream);
  }
  if (ui.mode === 'cell') { // the "back" spot, left of the house
    const selBack = !ui.cells[ui.cellIdx];
    rr(ctx, 16, 210, 64, 64, 20, selBack ? 'rgba(255,211,107,0.4)' : C.panel);
    if (selBack) rrs(ctx, 16, 210, 64, 64, 20, C.lamp, 4);
    drawIcon(ctx, 'back', 48, 262, 1, t);
  }
}

// ---------- screens ----------

function drawTitle(ctx, t) {
  drawHills(ctx);
  // a cosy little house on the hill
  ctx.save(); ctx.translate(480, 455);
  ctx.fillStyle = '#7a3448'; ctx.beginPath(); ctx.moveTo(-120, -80); ctx.lineTo(0, -160); ctx.lineTo(120, -80); ctx.fill();
  rr(ctx, -100, -82, 200, 90, 4, '#3d3c66');
  for (const [wx, wy] of [[-62, -58], [38, -58]]) { rr(ctx, wx, wy, 26, 30, 4, '#ffd36b'); glow(ctx, wx + 13, wy + 15, 50, 'rgba(255,211,107,0.8)', 0.5); line(ctx, [wx + 13, wy, wx + 13, wy + 30], '#6b4a3a', 2); }
  rr(ctx, -12, -36, 24, 44, 4, '#c99260');
  ctx.restore();
  const bob = Math.sin(t / 700) * 6;
  ctx.textAlign = 'center';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(CONFIG.title, 484, 150 + bob);
  const g = ctx.createLinearGradient(0, 80, 0, 160); g.addColorStop(0, '#fff1b8'); g.addColorStop(1, '#ffb84d');
  ctx.fillStyle = g; ctx.fillText(CONFIG.title, 480, 145 + bob);
  glow(ctx, 480, 232, 90, 'rgba(255,211,107,0.85)', 0.45);
  drawCookie(ctx, 480, 232, 40, Math.sin(t / 900) * 0.4);
  for (let i = 0; i < 5; i++) { const a = t / 1200 + i * 1.256; star(ctx, 480 + Math.cos(a) * 66, 232 + Math.sin(a) * 30, 6, 'rgba(255,240,180,0.9)'); }
  drawCat(ctx, 250, 470, 'asleep', 1, t); zzz(ctx, 262, 440, t, 1);
  drawDog(ctx, 720, 474, 'asleep', 1, t); zzz(ctx, 706, 444, t, 2);
  const p = 1 + 0.07 * Math.sin(t / 260);
  ctx.save(); ctx.translate(480, 492); ctx.scale(p, p); drawIcon(ctx, 'go', 0, 20, 1.1, t, 0); ctx.restore();
}

function drawPlayers(ctx, view, t) {
  drawHills(ctx);
  const n = view.playersSel;
  rr(ctx, 120, 130, 720, 250, 40, C.panel);
  for (let i = 0; i < 4; i++) {
    const on = i < n;
    const x = 210 + i * 180, y = 250 + (on ? Math.sin(t / 260 + i) * 8 : 0);
    if (on) glow(ctx, x, y, 90, 'rgba(255,220,140,0.8)', 0.35);
    token(ctx, x, y, on ? 62 : 48, i, !on);
  }
  for (const [x, d] of [[80, -1], [880, 1]]) { ctx.fillStyle = C.cream; ctx.beginPath(); ctx.moveTo(x + d * 22, 255); ctx.lineTo(x - d * 14, 230); ctx.lineTo(x - d * 14, 280); ctx.fill(); }
  const p = 1 + 0.06 * Math.sin(t / 260);
  ctx.save(); ctx.translate(480, 440); ctx.scale(p, p); drawIcon(ctx, 'go', 0, 20, 1.1, t, 0); ctx.restore();
}

function miniHouse(ctx, L, x, y, scale, t) {
  const cw = 14 * scale, fh = 26 * scale, W = L.w * cw, H = L.h * fh;
  ctx.save(); ctx.translate(x - W / 2, y - H);
  ctx.fillStyle = ROOF[L.id]; ctx.beginPath(); ctx.moveTo(-8 * scale, 2); ctx.lineTo(W / 2, -26 * scale); ctx.lineTo(W + 8 * scale, 2); ctx.fill();
  for (const r of L.rooms) {
    ctx.fillStyle = ROOM_TINT[r.kind]; ctx.fillRect(r.x0 * cw, r.y * fh, (r.x1 - r.x0 + 1) * cw, fh);
    const lit = (r.x0 * 3 + r.y * 7) % 5 !== 0;
    rr(ctx, (r.x0 + r.x1 + 1) / 2 * cw - 4 * scale, r.y * fh + 7 * scale, 8 * scale, 9 * scale, 2, lit ? '#ffd36b' : '#1a2450');
  }
  for (let yy = 0; yy <= L.h; yy++) ctx.fillRect(0, yy * fh - 1.5, W, 3);
  ctx.fillStyle = C.beam; for (let yy = 0; yy <= L.h; yy++) ctx.fillRect(-2, yy * fh - 2, W + 4, 4);
  for (const st of L.stairs) line(ctx, [(st.x + 0.9) * cw, (st.y + 1) * fh, (st.x + 0.1) * cw, (st.y + 2) * fh - 3], '#c08a5a', 3 * scale);
  drawCookie(ctx, (L.jar.x + 0.5) * cw, (L.jar.y + 1) * fh - 8 * scale, 5 * scale, 0);
  star(ctx, (L.goal.x + 0.5) * cw, (L.goal.y + 1) * fh - 9 * scale, 6 * scale, '#fff1b8');
  ctx.restore();
}

function drawPicker(ctx, view, t) {
  drawHills(ctx);
  const cards = [{ kind: 'players' }, ...LEVEL_LIST.map((L, i) => ({ kind: 'house', L, i }))];
  const xs = [70, 232, 434, 636, 838], widths = [110, 186, 186, 186, 186];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i], sel = view.pickerSel === i;
    const w = widths[i], h = i === 0 ? 170 : 300, x = xs[i], y = 262;
    const k = sel ? 1.06 + 0.02 * Math.sin(t / 300) : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    if (sel) glow(ctx, 0, 0, w, 'rgba(255,211,107,0.7)', 0.35);
    rr(ctx, -w / 2, -h / 2, w, h, 26, sel ? 'rgba(40,46,96,0.95)' : C.panel);
    rrs(ctx, -w / 2, -h / 2, w, h, 26, sel ? C.lamp : 'rgba(247,234,208,0.25)', sel ? 5 : 2);
    if (c.kind === 'players') {
      for (let p = 0; p < view.players; p++) token(ctx, (p % 2 ? 22 : -22), (p < 2 ? -24 : 24), 20, p);
    } else {
      const sc = (w - 40) / (c.L.w * 14);
      miniHouse(ctx, c.L, 0, 46, sc, t);
      for (let d = 0; d <= c.i; d++) drawCookie(ctx, (d - c.i / 2) * 28, 104, 11, 0); // difficulty
      if (view.solved && view.solved[c.i]) { glow(ctx, w / 2 - 26, -h / 2 + 26, 50, 'rgba(255,220,120,0.9)', 0.6); star(ctx, w / 2 - 26, -h / 2 + 26, 22 + Math.sin(t / 300) * 2, '#ffd36b'); }
    }
    ctx.restore();
  }
}

function drawWinOverlay(ctx, t, since) {
  for (let i = 0; i < 26; i++) {
    const fall = ((since / 9 + i * 53) % 600) - 40;
    const x = (i * 137 + Math.sin(since / 600 + i) * 30) % LW;
    star(ctx, x, fall, 8 + (i % 3) * 3, ['#ffd36b', '#ffb3c8', '#9fd3ff', '#b7f0a8'][i % 4]);
  }
  const k = Math.min(1, since / 700);
  const s = ease(k) * (1 + 0.05 * Math.sin(t / 250));
  ctx.save(); ctx.translate(480, 120); ctx.scale(s, s);
  glow(ctx, 0, 0, 110, 'rgba(255,220,120,0.9)', 0.6);
  star(ctx, 0, 0, 58, '#ffd36b'); star(ctx, 0, 0, 40, '#fff1b8');
  ctx.restore();
  if (since > 1200) { const p = 1 + 0.06 * Math.sin(t / 260); rr(ctx, 846, 436, 96, 92, 30, C.panel); ctx.save(); ctx.translate(894, 494); ctx.scale(p, p); drawIcon(ctx, 'go', 0, 20, 1, t, 0); ctx.restore(); }
}

// view: {screen, state, prev, alpha, ui, time, beat, w, h, players, playersSel, pickerSel, solved, hint, since}
export function render(ctx, view) {
  const { screen, state: s, prev, alpha = 1, ui, time: t = 0, beat } = view;
  ctx.setTransform((view.w || 1920) / LW, 0, 0, (view.h || 1080) / LH, 0, 0);
  drawSky(ctx, t);
  if (screen === 'title') return drawTitle(ctx, t);
  if (screen === 'players') return drawPlayers(ctx, view, t);
  if (screen === 'picker') return drawPicker(ctx, view, t);
  const L = LEVELS[s.levelId];
  const focus = focusOf(s, prev, alpha, screen, beat, L, view);
  const { vr } = updateCamera(view, L, focus);
  ctx.save();
  ctx.translate(LW / 2, (vr.top + vr.bottom) / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  const lit = screen === 'beat' && beat === 'woke';
  drawHouse(ctx, s, L, t, lit);
  drawFurniture(ctx, s, L, t, screen, beat);
  drawJar(ctx, s, L, prev, alpha);
  drawParts(ctx, s, L, t, screen === 'build');
  const ex = view.explain;
  if (screen === 'build') { drawHint(ctx, view.hint, t); if (!ex || ex.result === 'woke') drawMark(ctx, s.lastFailure, t); }
  drawCreatures(ctx, s, prev, alpha, t, screen, beat);
  drawItems(ctx, s, L, prev, alpha, t, screen);
  if (screen === 'run' || screen === 'beat') drawNoise(ctx, s, alpha);
  if (screen === 'beat' && beat !== 'woke' && ex) { spotlight(ctx, L, [ex.spot, { x: ex.x, y: ex.y }], 0.6); ring(ctx, ex.spot, t); if (ex.bubble) drawBubble(ctx, ex.bubble, anchorOf(ex, L), t, view.since || 0); }
  if (screen === 'intro') drawIntro(ctx, s, L, t, view.since || 0);
  if (screen === 'tour' && view.stop) { spotlight(ctx, L, [view.stop], 0.45); drawBubble(ctx, view.stop.bubble, anchorOf(view.stop, L), t, view.stopSince || 0, 0.85); }
  if (lit) {
    const d = doorwayOf(s, L);
    if (d) {
      const x = cx(d.x), f = fb(d.y), k = Math.min(1, (view.since || 0) / 260);
      glow(ctx, x, f - 70, 120, 'rgba(255,225,150,0.9)', 0.45);
      withSquash(ctx, x, f, 1 + 0.15 * (1 - k), 0.75 + 0.25 * ease(k) + 0.04 * Math.sin((view.since || 0) / 90) * (1 - Math.min(1, (view.since || 0) / 900)), () => drawParent(ctx, x, f, 'standing', 1, t, true));
      circle(ctx, x + 44, f - 156, 22, C.red); ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', x + 44, f - 144);
    }
  }
  if (screen === 'beat' && beat === 'woke' && ex && ex.bubble) { ring(ctx, ex.spot, t); drawBubble(ctx, ex.bubble, anchorOf(ex, L), t, view.since || 0, 0.85); }
  if (screen === 'build') {
    drawCursor(ctx, s, ui, t);
    if (view.ghostBubble) drawBubble(ctx, view.ghostBubble.bubble, anchorOf(view.ghostBubble, L), t, view.ghostSince || 0, 0.9);
    else if (ex && ex.result !== 'win') { if (ex.result !== 'woke') ring(ctx, ex.spot, t); if (ex.bubble) drawBubble(ctx, ex.bubble, anchorOf(ex, L), t, t, 0.85); }
  }
  ctx.restore();
  if ((screen === 'tour' && view.stop && view.stop.bubble === 'meter') || (screen === 'beat' && beat === 'woke')) { const w = s.noise.budget * 34 + 70; ctx.strokeStyle = C.lamp; ctx.lineWidth = 4; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t / 40; ctx.beginPath(); ctx.roundRect(8, 4, w + 12, 62, 30); ctx.stroke(); ctx.setLineDash([]); }
  if (screen === 'tour' && view.stops) for (let i = 0; i < view.stops.length; i++) circle(ctx, LW / 2 + (i - (view.stops.length - 1) / 2) * 26, 520, i === view.stopIdx ? 8 : 5, i === view.stopIdx ? C.lamp : 'rgba(247,234,208,0.45)');
  drawMeter(ctx, s, screen === 'run' ? prev : null, t);
  if (screen === 'build') drawTray(ctx, s, ui, view, t);
  else if (screen === 'intro' || screen === 'tour') { const p = 1 + 0.06 * Math.sin(t / 260); rr(ctx, 846, 436, 96, 92, 30, C.panel); ctx.save(); ctx.translate(894, 494); ctx.scale(p, p); drawIcon(ctx, 'go', 0, 20, 1, t, 0); ctx.restore(); }
  else if (screen === 'run') { // whose machine: all the players' tokens
    for (let i = 0; i < s.players; i++) token(ctx, LW - 40 - i * 46, 36, 18, s.players - 1 - i);
  }
  if (screen === 'rewind') {
    ctx.fillStyle = 'rgba(120,140,230,0.2)'; ctx.fillRect(0, 0, LW, LH);
    for (let y = 0; y < LH; y += 6) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y, LW, 2); }
    ctx.fillStyle = C.cream; for (let i = 0; i < 2; i++) { const x = LW - 70 + i * 34; ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x - 30, 56); ctx.lineTo(x, 78); ctx.fill(); }
  }
  if (screen === 'win') drawWinOverlay(ctx, t, view.since || 0);
}

// ---------- teaching: intro, habit bubbles, spotlight ----------

function spotlight(ctx, L, cells, a) {
  ctx.save(); ctx.beginPath(); ctx.rect(-600, -600, L.w * CELL + 1200, L.h * FH + 1200);
  for (const c of cells) { ctx.moveTo(cx(c.x) + 95, fb(c.y) - 45); ctx.arc(cx(c.x), fb(c.y) - 45, 95, 0, Math.PI * 2, true); }
  ctx.fillStyle = 'rgba(4,6,22,' + a + ')'; ctx.fill('evenodd'); ctx.restore();
}
function ring(ctx, c, t) {
  ctx.strokeStyle = C.lamp; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t / 40;
  ctx.beginPath(); ctx.arc(cx(c.x), fb(c.y) - 42, 50 + 4 * Math.sin(t / 160), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
// Where a bubble hangs: above the creature or thing it belongs to (doors: over the doorway).
function anchorOf(b, L) {
  const door = b.who && b.who.indexOf('Door') > 0;
  return { x: cx(b.x) + (door ? CELL / 2 : 0), y: fb(b.y) - (door ? 150 : 80), up: b.y === 0 };
}
function mini(ctx, x, f, s, fn) { ctx.save(); ctx.translate(x, f); ctx.scale(s, s); fn(); ctx.restore(); }
function miniJar(ctx, x, f, tip, dir) {
  ctx.save(); ctx.translate(x, f); ctx.rotate(dir * 1.2 * tip);
  rr(ctx, -10, -28, 20, 28, 6, 'rgba(170,205,250,0.85)'); rr(ctx, -8, -33, 16, 6, 2, '#d46a6a');
  if (tip < 0.5) drawCookie(ctx, 0, -12, 6, 0);
  ctx.restore();
}
function burst(ctx, x, y, n, col, k) {
  ctx.globalAlpha = k;
  for (let i = 0; i < n; i++) { ctx.strokeStyle = col; ctx.lineWidth = 4 - i; ctx.beginPath(); ctx.arc(x, y, 8 + i * 9 + (1 - k) * 10, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 4 + n * 2; i++) { const a = i * Math.PI * 2 / (4 + n * 2); line(ctx, [x + Math.cos(a) * (10 + n * 6), y + Math.sin(a) * (10 + n * 6), x + Math.cos(a) * (16 + n * 9), y + Math.sin(a) * (16 + n * 9)], col, 3); }
  ctx.globalAlpha = 1;
}
function face(ctx, x, y, r, awake, grown) {
  circle(ctx, x, y, r, grown ? C.skin : '#e9e2f5');
  if (grown) { ctx.fillStyle = C.cap; ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.4); ctx.lineTo(x + r * 0.9, y - r * 0.5); ctx.lineTo(x + r * 1.3, y - r * 1.6); ctx.fill(); }
  eyes(ctx, x, y, r * 0.32, awake, 0);
  if (awake) ell(ctx, x, y + r * 0.5, r * 0.22, r * 0.28, '#7a2a3a');
}
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

// A wordless thought bubble acting out one habit. (ax, ay) is the anchor above the thing it
// belongs to; the bubble floats up (or, for the top floor, sideways into the roof space).
export function drawBubble(ctx, kind, a, t, since, sc) {
  sc = sc || 1;
  const W = 210, H = 128, pop = ease(Math.min(1, (since || 0) / 260));
  const bx = a.x, by = a.y - (a.up ? 50 : 104);
  ctx.save(); ctx.translate(bx, by); ctx.scale(sc * pop, sc * pop);
  // tail dots towards the anchor
  circle(ctx, 0, (a.y - by) * 0.75, 7, C.cream); circle(ctx, 0, (a.y - by) * 0.45 + 4, 11, C.cream);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 14;
  for (const [ox, oy, r] of [[-70, -20, 44], [-30, -42, 46], [30, -42, 46], [72, -18, 44], [50, 26, 44], [-50, 26, 44], [0, 30, 46]]) circle(ctx, ox, oy, r, C.cream);
  ctx.shadowBlur = 0;
  rr(ctx, -W / 2, -H / 2, W, H, 40, '#fbf1dc');
  ctx.beginPath(); ctx.roundRect(-W / 2 + 6, -H / 2 + 6, W - 12, H - 12, 34); ctx.clip();
  rr(ctx, -W / 2, -H / 2, W, H, 0, '#2c3366');
  rr(ctx, -W / 2, 34, W, 40, 0, '#4a3a5e');
  const P = 2600;
  let p = ((since || 0) % P) / P;
  const f = 34; // floor line inside the bubble
  if (kind === 'catMouse') { if (Math.floor((since || 0) / P) % 2) kind = 'mouseOnly'; else kind = 'cat'; }
  if (kind === 'cat') { // the cat runs to the red dot on the jar; the jar tips; the cookie rolls out
    const tip = ease(seg(p, 0.5, 0.62));
    mini(ctx, -84, f, 1.3, () => miniJar(ctx, 0, 0, tip, 1));
    glow(ctx, -46, f - 4, 26, 'rgba(255,60,80,0.9)', 0.5 + 0.3 * Math.sin(t / 120)); ell(ctx, -46, f - 3, 10, 4, C.red);
    const catX = lerp(84, -4, ease(seg(p, 0.08, 0.5)));
    mini(ctx, catX, f, 0.85, () => drawCat(ctx, 0, 0, p < 0.08 ? 'asleep' : p < 0.5 ? 'chase' : 'pounce', -1, t));
    if (p > 0.58) { const k = ease(seg(p, 0.58, 0.95)); drawCookie(ctx, lerp(-56, 66, k), f - 10 - Math.abs(Math.sin(k * 9)) * 8 * (1 - k), 10, k * 8); }
  } else if (kind === 'mouseOnly') { // the cat chases the toy mouse and catches it
    const mx = lerp(-20, -66, seg(p, 0, 0.5));
    const catX = lerp(80, -40, ease(seg(p, 0.08, 0.52)));
    if (p < 0.52) mini(ctx, mx, f, 1.2, () => drawMouse(ctx, 0, 0, -1, t, false));
    mini(ctx, catX, f, 0.85, () => drawCat(ctx, 0, 0, p < 0.08 ? 'asleep' : p < 0.52 ? 'chase' : 'play', -1, t, p >= 0.52));
    if (p > 0.52 && p < 0.8) burst(ctx, -56, f - 44, 1, 'rgb(255,179,200)', 1 - seg(p, 0.52, 0.8));
  } else if (kind === 'tip') { // a rolling ball tips the jar, the cookie rolls out the other way
    const hit = 0.45, tip = ease(seg(p, hit, hit + 0.12));
    mini(ctx, -14, f, 1.3, () => miniJar(ctx, 0, 0, tip, -1));
    const bxx = p < hit ? lerp(90, 6, seg(p, 0.05, hit)) : lerp(6, 44, ease(seg(p, hit, 0.8)));
    drawBall(ctx, bxx, f - 13, 13, -bxx / 8);
    if (p > hit + 0.08) { const k = ease(seg(p, hit + 0.08, 0.92)); drawCookie(ctx, lerp(-30, -86, k), f - 10, 10, -k * 8); }
    if (p > hit && p < hit + 0.25) burst(ctx, -10, f - 40, 1, 'rgb(255,230,150)', 1 - seg(p, hit, hit + 0.25));
  } else if (kind === 'dog') { // a cookie lies by the dog's bed; the dog carries it to the kids' bed
    const bedX = 58;
    mini(ctx, bedX, f, 0.62, () => drawKidsBed(ctx, 0, 0, t, p > 0.86));
    rr(ctx, -66, f - 6, 56, 7, 3, '#6a8ad4');
    let dx = -38, mode = 'asleep', carry = false;
    if (p > 0.12 && p < 0.3) { mode = 'fetch'; dx = lerp(-38, -56, seg(p, 0.12, 0.3)); }
    else if (p >= 0.3) { mode = p < 0.82 ? 'carry' : 'done'; carry = true; dx = lerp(-56, bedX - 50, ease(seg(p, 0.3, 0.82))); }
    const d = p < 0.3 ? -1 : 1;
    if (!carry) drawCookie(ctx, -86, f - 10, 10, 0);
    mini(ctx, dx, f, 0.7, () => drawDog(ctx, 0, 0, mode, d, t, carry));
    if (carry && p < 0.84) drawCookie(ctx, dx + d * 30, f - 24, 10, 0);
    if (p >= 0.84) { drawCookie(ctx, bedX - 22, f - 32, 10, 0); for (let i = 0; i < 3; i++) star(ctx, bedX - 30 + i * 22, f - 72 - Math.sin(t / 200 + i) * 4, 7, C.lamp); }
  } else if (kind === 'door') { // left: the dog noses the door: loud creak. right: a string opens it quietly.
    for (const side of [-1, 1]) {
      const ox = side * 52, loud = side < 0;
      const q = seg(p, 0.08, 0.5), open = ease(seg(p, 0.42, 0.55));
      line(ctx, [ox, -50, ox, f], C.beam, 6);
      ctx.fillStyle = '#c99260'; ctx.beginPath(); ctx.moveTo(ox, -42); ctx.lineTo(ox + 18 * open, -36); ctx.lineTo(ox + 18 * open, f); ctx.lineTo(ox, f); ctx.closePath();
      if (open < 0.05) { ctx.beginPath(); ctx.roundRect(ox - 7, -42, 14, f + 42, 3); }
      ctx.fill();
      if (loud) {
        mini(ctx, lerp(ox - 40, ox - 24, ease(q)), f, 0.5, () => drawDog(ctx, 0, 0, 'fetch', 1, t));
        if (p > 0.44) burst(ctx, ox, -14, 3, 'rgb(255,96,96)', 1 - seg(p, 0.44, 0.95));
      } else {
        ctx.strokeStyle = C.cream; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ox - 30, f - 3); ctx.quadraticCurveTo(ox - 14, f - (open > 0 ? 6 : 2), ox + 18 * open, -20); ctx.stroke();
        circle(ctx, ox - 30, f - 3, 4, C.red);
        drawCookie(ctx, lerp(ox - 50, ox - 30, ease(q)), f - 8, 7, q * 6);
        if (p > 0.44) { ctx.globalAlpha = 0.5 * (1 - seg(p, 0.44, 0.95)); ctx.strokeStyle = C.cream; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, -14, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      }
    }
    line(ctx, [0, -52, 0, f + 2], 'rgba(247,234,208,0.35)', 2);
  } else if (kind === 'baby') { // a loud bang near the crib makes the baby cry
    const cry = p > 0.42;
    mini(ctx, 40, f + 4, 0.8, () => { drawCrib(ctx, 0, 0); drawBaby(ctx, 0, 0, cry ? 'crying' : 'asleep', t); });
    if (p > 0.1 && p < 0.6) burst(ctx, -55, -6, 3, 'rgb(255,96,96)', 1 - seg(p, 0.1, 0.6));
    if (!cry) zzz(ctx, 30, -6, t, 1);
  } else if (kind === 'meter') { // each noise wakes one sleepy face a little; one too many wakes the grown-up
    const n = 4;
    for (let i = 0; i < n; i++) {
      const on = p > 0.1 + i * 0.17;
      face(ctx, -80 + i * 34, -6, 13, false);
      if (on) { circle(ctx, -80 + i * 34, -6, 13, '#ffd6a0'); eyes(ctx, -80 + i * 34, -7, 4, true, 0); }
      const k = seg(p, 0.02 + i * 0.17, 0.12 + i * 0.17);
      if (k > 0 && k < 1) burst(ctx, -80 + i * 34, -40, 1, 'rgb(255,170,90)', 1 - k);
    }
    const woke = p > 0.8;
    face(ctx, 70, -6, 20, woke, true);
    if (woke) { circle(ctx, 92, -36, 12, C.red); ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 92, -29); }
    else zzz(ctx, 80, -24, t, 2);
  }
  ctx.restore();
}

// The goal, shown once per house: the kids wake and want the cookie; the cookie glows in its
// jar; a dotted path runs from the jar to the kids' bed.
function introPath(L) {
  const y0 = fb(L.jar.y) - 34, pts = [[cx(L.jar.x), y0]];
  if (L.jar.y !== L.goal.y) {
    let st = L.stairs[0], bd = 1000;
    for (const q of L.stairs) { if (q.y !== L.jar.y) continue; const d = Math.abs(q.x - L.jar.x) + Math.abs(q.x - L.goal.x); if (d < bd) { bd = d; st = q; } }
    pts.push([cx(st.x), y0], [cx(st.x), fb(st.y + 1) - 34]);
  }
  pts.push([cx(L.goal.x), fb(L.goal.y) - 34]);
  return pts;
}
function drawIntro(ctx, s, L, t, since) {
  const kids = { x: L.goal.x, y: L.goal.y }, jar = { x: L.jar.x, y: L.jar.y };
  const ph = since < 1600 ? 0 : since < 2900 ? 1 : 2;
  spotlight(ctx, L, ph === 0 ? [kids] : ph === 1 ? [jar] : [kids, jar], 0.55 * (ph === 2 ? 0.7 : 1));
  if (ph === 0) { // the kids sit up and think of the cookie
    const k = ease(Math.min(1, since / 500));
    const x = cx(kids.x), y = fb(kids.y) - 120;
    ctx.save(); ctx.translate(x + 20, y); ctx.scale(k, k);
    circle(ctx, -14, 52, 5, C.cream); circle(ctx, -6, 34, 8, C.cream);
    ell(ctx, 10, 0, 38, 28, C.cream); drawCookie(ctx, 10, 0, 17, Math.sin(t / 300) * 0.3);
    ctx.restore();
  }
  const jx = cx(jar.x) + 10 * L.jar.dir, jy = fb(jar.y) - 84;
  if (ph >= 1) { // the cookie glows in its jar
    const pulse = 0.5 + 0.5 * Math.sin(t / 160);
    glow(ctx, jx, jy, 70 + pulse * 16, 'rgba(255,211,107,0.95)', 0.55 + pulse * 0.3);
    for (let i = 0; i < 4; i++) { const a = t / 600 + i * Math.PI / 2; star(ctx, jx + Math.cos(a) * 44, jy + Math.sin(a) * 30, 6, 'rgba(255,240,180,0.95)'); }
    drawCookie(ctx, jx, jy, 12, 0);
  }
  if (ph === 2) { // a dotted path grows from the jar to the kids' bed, and a cookie travels it
    const pts = introPath(L);
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(d); total += d; }
    const k = ease(Math.min(1, (since - 2900) / 1300)), want = total * k;
    const posAt = (dist) => { let acc = 0; for (let i = 0; i < lens.length; i++) { if (acc + lens[i] >= dist) { const u = (dist - acc) / lens[i]; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u), i]; } acc += lens[i]; } return [pts[pts.length - 1][0], pts[pts.length - 1][1], lens.length - 1]; };
    for (let d = 0; d <= want; d += 22) { const [x, y] = posAt(d); circle(ctx, x, y, 6, C.lamp); }
    const [hx, hy, si] = posAt(want);
    const ang = Math.atan2(pts[si + 1][1] - pts[si][1], pts[si + 1][0] - pts[si][0]);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang); ctx.fillStyle = C.lamp; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-6, -14); ctx.lineTo(-6, 14); ctx.fill(); ctx.restore();
    if (k >= 1) { const q = ((since - 4200) % 1400) / 1400; const [x, y] = posAt(total * ease(q)); glow(ctx, x, y - 6, 34, 'rgba(255,211,107,0.9)', 0.6); drawCookie(ctx, x, y - 6, 12, q * 10); }
  }
}
