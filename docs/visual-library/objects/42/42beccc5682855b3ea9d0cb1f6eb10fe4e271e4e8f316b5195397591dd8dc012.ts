// Голоса звуков: сколько звучит одновременно и кому место, когда звуков слишком много (толпа в «Крепости»).
// Чистая логика без WebAudio — проверяется в node (test/voices.test.ts); узлы и шины — в client/audio.ts.

/** Одновременно звуков в мире (с позицией). Свои звуки и интерфейс не вытесняются, но считаются. */
export const WORLD_MAX = 24;
/** Один и тот же звук (по ключу) — не больше KEY_MAX запусков за KEY_WINDOW секунд */
export const KEY_MAX = 4;
export const KEY_WINDOW = 0.1;
/** Новый звук вытесняет самый слабый, только если заметно громче на месте слушателя (иначе не играет сам) */
export const STEAL_MARGIN = 1.2;
/** Без новых нот голос считается звучащим столько секунд (тон и шум продлевают его до своего конца) */
export const VOICE_LIFE = 0.3;

export interface Voice {
  key: string;
  /** Громкость на месте слушателя 0…1 (затухание по расстоянию); свои и интерфейс — 1 */
  prio: number;
  /** Звук в мире (с позицией) — его можно не сыграть или вытеснить */
  world: boolean;
  start: number;
  end: number;
  dead: boolean;
  /** Заглушить (вытеснили) */
  stop: (() => void) | null;
}

export interface VoiceStats {
  /** Звучит сейчас: всего и в мире */
  voices: number;
  world: number;
  /** Максимум одновременно с последнего сброса */
  peakVoices: number;
  peakWorld: number;
  started: number;
  /** Не сыграны: мест нет и новый тише всех; вытеснены; один и тот же звук слишком часто; тревога склеена с прошлой */
  dropped: number;
  stolen: number;
  keyed: number;
  merged: number;
}

const zero = (): VoiceStats => ({ voices: 0, world: 0, peakVoices: 0, peakWorld: 0, started: 0, dropped: 0, stolen: 0, keyed: 0, merged: 0 });

/** Громкость звука на месте слушателя: та же модель, что у PannerNode ('inverse', rolloff 1.15) */
export function voicePrio(dist: number, ref: number, rolloff = 1.15): number {
  return ref / (ref + rolloff * Math.max(0, dist - ref));
}

export class VoicePool {
  /** Без ограничений — только счёт (сравнить «до» и «после» в разработке) */
  off = false;
  readonly stats: VoiceStats = zero();
  private readonly list: Voice[] = [];
  private readonly recent = new Map<string, number[]>();
  private readonly last = new Map<string, number>();

  /** Можно ли начать звук; null — не играть. key '' — без ограничения частоты. */
  admit(key: string, prio: number, world: boolean, now: number): Voice | null {
    this.prune(now);
    let starts: number[] | undefined;
    if (key) {
      starts = this.recent.get(key);
      if (!starts) this.recent.set(key, (starts = []));
      while (starts.length && now - starts[0] >= KEY_WINDOW) starts.shift();
      if (!this.off && starts.length >= KEY_MAX) {
        this.stats.keyed++;
        return null;
      }
    }
    if (world && !this.off) {
      let n = 0;
      let weak: Voice | null = null;
      for (const v of this.list) {
        if (!v.world) continue;
        n++;
        if (!weak || v.prio < weak.prio || (v.prio === weak.prio && v.start < weak.start)) weak = v;
      }
      if (n >= WORLD_MAX) {
        if (!weak || prio < weak.prio * STEAL_MARGIN) {
          this.stats.dropped++;
          return null;
        }
        this.kill(weak);
        this.stats.stolen++;
      }
    }
    starts?.push(now);
    const v: Voice = { key, prio, world, start: now, end: now + VOICE_LIFE, dead: false, stop: null };
    this.list.push(v);
    this.stats.started++;
    this.count(now);
    return v;
  }

  /** Заглушить голос (вытеснили) */
  kill(v: Voice): void {
    if (v.dead) return;
    v.dead = true;
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    v.stop?.();
  }

  /** Сколько звучит сейчас; обновляет счётчики и максимумы */
  count(now: number): VoiceStats {
    this.prune(now);
    let world = 0;
    for (const v of this.list) if (v.world) world++;
    const s = this.stats;
    s.voices = this.list.length;
    s.world = world;
    s.peakVoices = Math.max(s.peakVoices, s.voices);
    s.peakWorld = Math.max(s.peakWorld, world);
    return s;
  }

  /** Тревога или сигнал: не чаще раза в gap секунд на тип; одинаковые в этом окне склеиваются в первый */
  once(key: string, gap: number, now: number): boolean {
    const t = this.last.get(key);
    if (!this.off && t !== undefined && now - t < gap) {
      this.stats.merged++;
      return false;
    }
    this.last.set(key, now);
    return true;
  }

  resetStats(now: number): void {
    Object.assign(this.stats, zero());
    this.count(now);
  }

  private prune(now: number): void {
    let j = 0;
    for (const v of this.list) if (v.end > now && !v.dead) this.list[j++] = v;
    this.list.length = j;
  }
}

/** Эффекты под толпу: до 10 звуков в мире — как есть, дальше плавно тише, не ниже −4 дБ. Музыку и голоса не трогает. */
export function crowdDuck(world: number): number {
  return world <= 10 ? 1 : Math.max(0.63, 1 - 0.03 * (world - 10));
}

const db2lin = (db: number): number => Math.pow(10, db / 20);
const lin2db = (x: number): number => (x <= 0 ? -1000 : 20 * Math.log10(x));

/**
 * Автоподъём DynamicsCompressorNode (спецификация Web Audio, как в Chromium/WebKit/Gecko): тихий сигнал он поднимает
 * на (1 / кривая(1))^0.6. Ограничитель на выходе делим на этот подъём — ниже порога громкость прежняя.
 */
export function compressorMakeup(thresholdDb: number, kneeDb: number, ratio: number): number {
  const linT = db2lin(thresholdDb);
  const knee = (x: number, k: number): number => (x < linT ? x : linT + (1 - Math.exp(-k * (x - linT))) / k);
  const slopeAt = (x: number, k: number): number => {
    if (x < linT) return 1;
    const x2 = x * 1.001;
    return (lin2db(knee(x2, k)) - lin2db(knee(x, k))) / (lin2db(x2) - lin2db(x));
  };
  const xKnee = db2lin(thresholdDb + kneeDb);
  let minK = 0.1;
  let maxK = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(xKnee, k) < 1 / ratio) maxK = k;
    else minK = k;
    k = Math.sqrt(minK * maxK);
  }
  const kneeDbAbs = thresholdDb + kneeDb;
  const kneeLin = db2lin(kneeDbAbs);
  const yKneeDb = lin2db(knee(kneeLin, k));
  const full = 1 < kneeLin ? knee(1, k) : db2lin(yKneeDb + (0 - kneeDbAbs) / ratio);
  return Math.pow(1 / full, 0.6);
}
