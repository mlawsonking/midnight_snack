// WebAudio sound kit. Everything is synthesised in code; nothing is loaded.
// The AudioContext is created only on the first user gesture (unlock()).
// A soft room reverb (a short generated impulse) warms every cue; a night ambience loop
// (breathy wind, far crickets, a slow music-box lullaby) runs under the game; mute silences all.
let ac = null, master = null, fx = null, amb = null, muted = false, ambOn = false;
let nextNote = 0, noteIx = 0, nextCricket = 0;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
  const verb = ac.createConvolver(); verb.buffer = impulse(1.6); const wet = ac.createGain(); wet.gain.value = 0.28;
  verb.connect(wet); wet.connect(master);
  fx = ac.createGain(); fx.connect(master); fx.connect(verb);
  amb = ac.createGain(); amb.gain.value = 0.0; amb.connect(master); amb.connect(verb);
  startWind();
}
export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ac.currentTime, 0.05); }
export function isMuted() { return muted; }

function impulse(sec) {
  const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
  let seed = 99;
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = ((seed / 4294967296) * 2 - 1) * Math.pow(1 - i / n, 3); } }
  return b;
}
function noiseBuf(sec) {
  const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  let seed = 12345; for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = (seed / 4294967296) * 2 - 1; }
  return b;
}

// one shaped oscillator note, optional vibrato
function tone(type, f0, f1, dur, vol, delay = 0, vib = 0, dest) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 6; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.03, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || fx);
  o.start(t); o.stop(t + dur + 0.05);
}
// filtered noise burst
function hiss(dur, freq, q, vol, delay = 0, type = 'bandpass', sweep = 0, dest) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(); src.buffer = noiseBuf(dur + 0.05);
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest || fx); src.start(t); src.stop(t + dur + 0.05);
}
// a soft bell / music-box note (two partials)
function bell(f, vol, delay = 0, dest) { tone('sine', f, f, 1.2, vol, delay, 0, dest); tone('sine', f * 2.76, f * 2.76, 0.5, vol * 0.25, delay, 0, dest); }

function startWind() {
  const src = ac.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.7;
  const g = ac.createGain(); g.gain.value = 0.05;
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain); lfo.start();
  src.connect(f); f.connect(g); g.connect(amb); src.start();
}

// Called every frame by the game; keeps the night ambience going. level 0..1 (quieter during runs).
const LULLABY = [523, 659, 784, 659, 587, 523, 440, 523, 392, 0, 523, 587, 659, 587, 523, 0];
export function ambience(on, level) {
  if (!ac) return;
  const target = on && !muted ? 0.9 * level : 0;
  if (on !== ambOn || Math.abs(amb.gain.value - target) > 0.01) amb.gain.setTargetAtTime(target, ac.currentTime, 0.6);
  ambOn = on;
  if (!on || muted) return;
  const now = ac.currentTime;
  if (now >= nextNote) {
    const f = LULLABY[noteIx % LULLABY.length]; noteIx++;
    if (f) bell(f, 0.035 * level, 0, amb);
    nextNote = now + (noteIx % 8 === 0 ? 1.8 : 0.9);
  }
  if (now >= nextCricket) {
    for (let i = 0; i < 3; i++) tone('sine', 4200, 4100, 0.05, 0.012, i * 0.09, 0, amb);
    nextCricket = now + 2.5 + ((noteIx * 7) % 5) * 0.6;
  }
}

export const sfx = {
  snore() { hiss(1.1, 260, 3, 0.1, 0, 'bandpass', 180); hiss(0.7, 600, 2, 0.04, 1.2, 'bandpass', 900); },
  creak() { tone('sawtooth', 210, 140, 0.55, 0.06, 0, 18); tone('sawtooth', 300, 190, 0.45, 0.04, 0.15, 25); hiss(0.4, 900, 8, 0.05, 0.05); },
  meow() { tone('triangle', 500, 880, 0.18, 0.16, 0, 10); tone('triangle', 880, 430, 0.36, 0.14, 0.17, 14); },
  yowl() { tone('sawtooth', 560, 1250, 0.22, 0.1, 0, 30); tone('sawtooth', 1250, 480, 0.45, 0.1, 0.2, 40); hiss(0.4, 2500, 3, 0.04); },
  clink() { bell(1568, 0.12); bell(2093, 0.06, 0.06); tone('sine', 3200, 3000, 0.08, 0.05); },
  thud() { tone('sine', 150, 45, 0.3, 0.38); hiss(0.12, 300, 1, 0.12, 0, 'lowpass'); },
  tumble() { for (let i = 0; i < 4; i++) { tone('sine', 220 - i * 25, 70, 0.14, 0.22 - i * 0.03, i * 0.11); hiss(0.06, 500, 1, 0.05, i * 0.11, 'lowpass'); } },
  squeak() { tone('sine', 1800, 2600, 0.08, 0.12); tone('sine', 2400, 1700, 0.1, 0.1, 0.09); },
  tap() { tone('sine', 520, 380, 0.07, 0.11); },
  tick() { tone('triangle', 880, 860, 0.04, 0.06); },
  pop() { tone('sine', 480, 980, 0.1, 0.18); bell(1046, 0.04, 0.05); },
  woof() { tone('square', 200, 120, 0.12, 0.06); hiss(0.1, 500, 2, 0.08, 0, 'lowpass'); },
  pull() { tone('triangle', 700, 1100, 0.12, 0.08); },
  cry() { for (let i = 0; i < 3; i++) tone('triangle', 720, 500, 0.32, 0.12, i * 0.34, 20); },
  gasp() { hiss(0.35, 1400, 2, 0.12, 0, 'bandpass', 3000); tone('triangle', 300, 720, 0.35, 0.16); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, 0.12, i * 0.13)); [262, 330, 392].forEach((f) => tone('triangle', f, f, 1.6, 0.05, 0.3)); },
  rewind() { tone('sine', 900, 180, 1.0, 0.07, 0, 40); hiss(1.0, 2000, 1, 0.03, 0, 'bandpass', 400); },
  hush() { hiss(0.9, 3000, 1, 0.05, 0, 'highpass'); bell(440, 0.05, 0.3); },
  plop() { tone('sine', 300, 700, 0.12, 0.2); bell(784, 0.06, 0.08); },
  step() { tone('sine', 120, 90, 0.06, 0.06); },
};

export const eventSound = {
  catWake: 'meow', jarTip: 'clink', knock: 'tap', thud: 'thud', stringPull: 'pull', creak: 'creak', tumble: 'tumble',
  yowl: 'yowl', cry: 'cry', doorOpen: 'creak', plop: 'plop', dogWake: 'woof', pickUp: 'tap', drop: 'plop', hush: 'hush', squeak: 'squeak', stairs: 'step',
};
