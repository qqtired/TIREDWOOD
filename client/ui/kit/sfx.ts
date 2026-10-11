// Тихие звуки интерфейса кита на WebAudio — без файлов, всё синтезируется (lab/ui/kit/sfx.js).
// Свой AudioContext не заводим: attach(sound.kit) даёт контекст игры и шину «Интерфейс» (client/audio.ts),
// поэтому звук идёт после первого жеста и слушается общей громкости, «без звука» и ползунка «Интерфейс».
// sfx.enabled — настройка «Звуки интерфейса» (settings.uiSounds, ставит App.applySettings).
// Повторы одного звука чаще 40 мс глушатся — нет «пулемёта».

export type SfxName = 'click' | 'open' | 'close' | 'reward' | 'error' | 'toast' | 'tick' | 'pop' | 'level';

const MASTER = 0.16;

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let out: GainNode | null = null;
const last = new Map<SfxName, number>();

interface ToneOpts { type?: OscillatorType; vol?: number; at?: number; to?: number | null; attack?: number }

/** короткий тон: частота, длительность, форма, громкость, сдвиг старта, скольжение частоты */
function tone(c: AudioContext, o: GainNode, f: number, dur: number, { type = 'sine', vol = 1, at = 0, to = null, attack = 0.006 }: ToneOpts = {}): void {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(o);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** короткий шорох (щелчок/шелест бумаги) */
function noise(c: AudioContext, o: GainNode, dur: number, { vol = 0.4, at = 0, freq = 2400, q = 0.9 } = {}): void {
  const t0 = c.currentTime + at;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(o);
  src.start(t0);
}

const SOUNDS: Record<SfxName, (c: AudioContext, o: GainNode) => void> = {
  click(c, o) { tone(c, o, 880, 0.05, { type: 'triangle', vol: 0.5 }); noise(c, o, 0.025, { vol: 0.18, freq: 3200 }); },
  tick(c, o) { tone(c, o, 1320, 0.03, { type: 'square', vol: 0.12 }); },
  pop(c, o) { tone(c, o, 520, 0.09, { type: 'sine', vol: 0.6, to: 980 }); },
  open(c, o) { tone(c, o, 440, 0.09, { type: 'triangle', vol: 0.45, to: 660 }); tone(c, o, 660, 0.12, { type: 'sine', vol: 0.3, at: 0.06, to: 880 }); noise(c, o, 0.08, { vol: 0.08, freq: 1800 }); },
  close(c, o) { tone(c, o, 660, 0.09, { type: 'triangle', vol: 0.4, to: 420 }); noise(c, o, 0.06, { vol: 0.08, freq: 1400 }); },
  toast(c, o) { tone(c, o, 988, 0.12, { type: 'sine', vol: 0.4 }); tone(c, o, 1319, 0.16, { type: 'sine', vol: 0.3, at: 0.07 }); },
  error(c, o) { tone(c, o, 220, 0.12, { type: 'square', vol: 0.18 }); tone(c, o, 185, 0.16, { type: 'square', vol: 0.16, at: 0.1 }); },
  reward(c, o) {
    // монетки: маленькое арпеджио до-ми-соль-до + звон
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(c, o, f, 0.16, { type: 'triangle', vol: 0.42, at: i * 0.065 }));
    tone(c, o, 2637, 0.35, { type: 'sine', vol: 0.18, at: 0.27 });
  },
  level(c, o) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, o, f, 0.22, { type: 'triangle', vol: 0.4, at: i * 0.08 }));
    tone(c, o, 1568, 0.6, { type: 'sine', vol: 0.22, at: 0.4 });
  },
};

export const sfx = {
  /** «Звуки интерфейса» в настройках (settings.uiSounds) */
  enabled: true,

  /** Подключить к звуку игры (sound.kit после первого жеста); null — звук ещё не разрешён, ждём следующего раза */
  attach(kit: { ctx: AudioContext; ui: GainNode } | null): void {
    if (!kit || (kit.ctx === ctx && kit.ui === bus)) return;
    out?.disconnect();
    ctx = kit.ctx;
    bus = kit.ui;
    out = ctx.createGain();
    out.gain.value = MASTER;
    out.connect(bus);
  },

  play(name: SfxName): void {
    if (!sfx.enabled || !ctx || !out) return;
    const now = performance.now();
    if (now - (last.get(name) ?? -Infinity) < 40) return;
    last.set(name, now);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    try { SOUNDS[name](ctx, out); } catch { /* звук не важнее интерфейса */ }
  },
};

/** Что звучит по клику: свой звук — data-sfx, крестик — «закрыть», вкладка — «тик», остальное — щелчок */
const CLICKABLE = '[data-sfx], .k-btn, .k-tab, .k-close, .k-seg > button';

/** Один обработчик на слой (#hud, #menus): клики по кнопкам кита звучат сами. Старые кнопки игры молчат */
export function bindClickSounds(root: HTMLElement): void {
  root.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.<HTMLElement>(CLICKABLE);
    if (!el || !root.contains(el)) return;
    const own = el.dataset.sfx as SfxName | undefined;
    sfx.play(own && own in SOUNDS ? own : el.classList.contains('k-close') ? 'close' : el.classList.contains('k-tab') ? 'tick' : 'click');
  });
}
