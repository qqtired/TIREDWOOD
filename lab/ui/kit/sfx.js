// Тихие звуки интерфейса на WebAudio — без файлов, всё синтезируется.
// API:  import { sfx } from '../kit/sfx.js';
//   sfx.play('click' | 'open' | 'close' | 'reward' | 'error' | 'toast' | 'tick' | 'pop' | 'level')
//   sfx.enabled            — вкл/выкл (сохраняется в localStorage 'tw-ui-sfx')
//   sfx.setEnabled(bool)   — то же, с событием 'sfx-change' на window
// Звук начинается только после первого жеста пользователя (браузеры иначе не дают играть).
// Общая громкость низкая (MASTER), повторы одного звука чаще 40 мс глушатся — нет «пулемёта».

const KEY = 'tw-ui-sfx';
const MASTER = 0.16;

let ctx = null;
let out = null;
let unlocked = false;
const last = new Map();

function load() {
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === '1'; } catch { return true; }
}
let enabled = load();

function ensure() {
  if (ctx || !unlocked) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = MASTER;
  // мягкий «потолок», чтобы наложения не хрипели
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  out.connect(comp).connect(ctx.destination);
  return ctx;
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  window.removeEventListener('pointerdown', unlock, true);
  window.removeEventListener('keydown', unlock, true);
}
window.addEventListener('pointerdown', unlock, true);
window.addEventListener('keydown', unlock, true);

/** короткий тон: частота, длительность, форма, громкость, сдвиг старта, скольжение частоты */
function tone(f, dur, { type = 'sine', vol = 1, at = 0, to = null, attack = 0.006 } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** короткий шорох (щелчок/шелест бумаги) */
function noise(dur, { vol = 0.4, at = 0, freq = 2400, q = 0.9 } = {}) {
  const t0 = ctx.currentTime + at;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t0);
}

const SOUNDS = {
  click() { tone(880, 0.05, { type: 'triangle', vol: 0.5 }); noise(0.025, { vol: 0.18, freq: 3200 }); },
  tick() { tone(1320, 0.03, { type: 'square', vol: 0.12 }); },
  pop() { tone(520, 0.09, { type: 'sine', vol: 0.6, to: 980 }); },
  open() { tone(440, 0.09, { type: 'triangle', vol: 0.45, to: 660 }); tone(660, 0.12, { type: 'sine', vol: 0.3, at: 0.06, to: 880 }); noise(0.08, { vol: 0.08, freq: 1800 }); },
  close() { tone(660, 0.09, { type: 'triangle', vol: 0.4, to: 420 }); noise(0.06, { vol: 0.08, freq: 1400 }); },
  toast() { tone(988, 0.12, { type: 'sine', vol: 0.4 }); tone(1319, 0.16, { type: 'sine', vol: 0.3, at: 0.07 }); },
  error() { tone(220, 0.12, { type: 'square', vol: 0.18 }); tone(185, 0.16, { type: 'square', vol: 0.16, at: 0.1 }); },
  reward() {
    // монетки: маленькое арпеджио до-ми-соль-до + звон
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.42, at: i * 0.065 }));
    tone(2637, 0.35, { type: 'sine', vol: 0.18, at: 0.27 });
  },
  level() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.4, at: i * 0.08 }));
    tone(1568, 0.6, { type: 'sine', vol: 0.22, at: 0.4 });
  },
};

export const sfx = {
  get enabled() { return enabled; },
  set enabled(v) { this.setEnabled(v); },
  setEnabled(v) {
    enabled = !!v;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* приватный режим — без сохранения */ }
    window.dispatchEvent(new CustomEvent('sfx-change', { detail: enabled }));
  },
  toggle() { this.setEnabled(!enabled); return enabled; },
  play(name) {
    if (!enabled || !unlocked) return;
    const fn = SOUNDS[name];
    if (!fn || !ensure()) return;
    const now = performance.now();
    if (now - (last.get(name) ?? 0) < 40) return;
    last.set(name, now);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try { fn(); } catch { /* звук не важнее интерфейса */ }
  },
  names: Object.keys(SOUNDS),
};

export default sfx;
