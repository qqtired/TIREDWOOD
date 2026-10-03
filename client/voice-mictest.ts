// Проверка микрофона в меню: свой поток (в игру он не уходит), уровень громкости и «послушать себя» с задержкой.
// Поток открывается только по нажатию «Проверить» и закрывается, как только панель закрыли или проверку выключили.

export interface MicTestDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createAudioContext(): AudioContext;
}
const defaults: MicTestDeps = {
  getUserMedia: c => navigator.mediaDevices.getUserMedia(c),
  createAudioContext: () => new AudioContext(),
};
/** Задержка «послушать себя»: так слышно себя со стороны, а не эхо в голове */
export const ECHO_DELAY_S = 0.6;
/** Громкость эха: ниже единицы — в колонках не раскачается до свиста */
const ECHO_GAIN = 0.8;

/** Уровень 0…1 из среднеквадратичного значения: −60 дБ и тише — ноль, 0 дБ — единица. */
export function levelOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms <= 0) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 60) / 60));
}

export class MicTest {
  private readonly deps: MicTestDeps;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private echo: GainNode | null = null;
  private buf: Float32Array<ArrayBuffer> | null = null;
  private serial = 0;
  echoOn = false;

  constructor(deps: Partial<MicTestDeps> = {}) { this.deps = { ...defaults, ...deps }; }
  get running(): boolean { return !!this.stream; }

  /** Открыть микрофон (жест: браузер может спросить разрешение). Ошибка — текстом для игрока. */
  async start(constraints: MediaStreamConstraints): Promise<string | null> {
    this.stop();
    const serial = ++this.serial;
    let stream: MediaStream;
    try { stream = await this.deps.getUserMedia(constraints); }
    catch (err) {
      const name = (err as { name?: string })?.name;
      if (serial !== this.serial) return null;
      return name === 'NotAllowedError' || name === 'SecurityError' ? 'Доступ к микрофону запрещён — разреши его в браузере (значок слева от адреса).'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'Микрофон не найден. Подключи его или выбери другой.'
        : 'Не удалось открыть микрофон.';
    }
    if (serial !== this.serial) { for (const t of stream.getTracks()) t.stop(); return null; }
    this.stream = stream;
    try {
      const ctx = this.deps.createAudioContext();
      this.ctx = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
      src.connect(analyser);
      const delay = ctx.createDelay(2); delay.delayTime.value = ECHO_DELAY_S;
      const echo = ctx.createGain(); echo.gain.value = this.echoOn ? ECHO_GAIN : 0;
      src.connect(delay); delay.connect(echo); echo.connect(ctx.destination);
      this.analyser = analyser; this.echo = echo; this.buf = new Float32Array(analyser.fftSize);
      void ctx.resume().catch(() => { /* уровень всё равно виден */ });
    } catch { /* без звукового движка — просто нет уровня */ }
    return null;
  }
  /** Текущий уровень 0…1 */
  level(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getFloatTimeDomainData(this.buf);
    return levelOf(this.buf);
  }
  setEcho(on: boolean): void {
    this.echoOn = on;
    if (this.echo && this.ctx) this.echo.gain.setTargetAtTime(on ? ECHO_GAIN : 0, this.ctx.currentTime, 0.02);
  }
  /** Название устройства, которое на самом деле открылось */
  get label(): string { return this.stream?.getAudioTracks()[0]?.label ?? ''; }
  stop(): void {
    this.serial++;
    const stream = this.stream, ctx = this.ctx;
    this.stream = null; this.ctx = null; this.analyser = null; this.echo = null; this.buf = null;
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (ctx) void ctx.close().catch(() => { /* уже закрыт */ });
  }
}
