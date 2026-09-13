// ---------- Sons simples via WebAudio (sem ficheiros externos) ----------

let ctx = null;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio() {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
}

function tone(freq, start, duration, type = 'sine', gain = 0.18) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.02);
}

export function playCorrect() {
  tone(660, 0, 0.12, 'triangle');
  tone(880, 0.09, 0.16, 'triangle');
}

export function playWrong() {
  tone(200, 0, 0.18, 'sawtooth', 0.12);
  tone(140, 0.1, 0.22, 'sawtooth', 0.1);
}

export function playClick() {
  tone(440, 0, 0.05, 'square', 0.08);
}

export function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i * 0.11, 0.28, 'triangle', 0.16));
}

export function playTick() {
  tone(880, 0, 0.04, 'square', 0.06);
}
