// Звуки «Ракушки» для обзора: как кит (client/ui/kit/sfx.ts) — WebAudio без файлов, тихо, повтор чаще 40 мс глушится.
// 👍 — тихий звон, 👎 — глухой стук, 🎯 — фанфара, облачко — «поп», конец времени — тик. Выключатель — кнопка на странице.
let ctx = null, out = null, on = true;
const last = new Map();
function ensure() {
  if (ctx) return true;
  try { ctx = new AudioContext(); out = ctx.createGain(); out.gain.value = 0.16; out.connect(ctx.destination); return true; } catch { return false; }
}
function tone(f, dur, { type = 'sine', vol = 1, at = 0, to = null } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(dur, { vol = 0.3, at = 0, freq = 900, q = 0.8 } = {}) {
  const t0 = ctx.currentTime + at, n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(bp).connect(g).connect(out); s.start(t0);
}
const SOUNDS = {
  click() { tone(880, 0.05, { type: 'triangle', vol: 0.5 }); },
  pop() { tone(520, 0.08, { vol: 0.35, to: 900 }); },
  warm() { tone(1175, 0.18, { type: 'triangle', vol: 0.4 }); tone(1568, 0.26, { vol: 0.28, at: 0.07 }); },
  miss() { tone(150, 0.14, { type: 'sine', vol: 0.7, to: 90 }); noise(0.08, { vol: 0.2, freq: 500 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.45, at: i * 0.09 })); tone(1319, 0.7, { vol: 0.3, at: 0.36 }); tone(1047, 0.7, { type: 'triangle', vol: 0.22, at: 0.36 }); },
  whoosh() { noise(0.45, { vol: 0.16, freq: 1600, q: 0.6 }); tone(400, 0.45, { vol: 0.12, to: 1200 }); },
  reward() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.42, at: i * 0.065 })); },
  open() { tone(440, 0.09, { type: 'triangle', vol: 0.45, to: 660 }); tone(660, 0.12, { vol: 0.3, at: 0.06, to: 880 }); },
  close() { tone(660, 0.09, { type: 'triangle', vol: 0.4, to: 420 }); },
  puff() { noise(0.3, { vol: 0.35, freq: 700, q: 0.5 }); tone(300, 0.2, { vol: 0.25, to: 600 }); },
  tick() { tone(1320, 0.03, { type: 'square', vol: 0.1 }); },
};
export const sfx = {
  get on() { return on; },
  set on(v) { on = !!v; },
  play(name) {
    if (!on || !ensure()) return;
    const now = performance.now();
    if (now - (last.get(name) ?? 0) < 40) return;
    last.set(name, now);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try { SOUNDS[name]?.(); } catch { /* звук не важнее */ }
  },
};
