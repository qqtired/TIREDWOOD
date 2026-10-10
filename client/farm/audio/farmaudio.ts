// Звук фермы: своя спокойная тема (theme.ts) по кругу на шине «Музыка» (ползунок «Музыка» из настроек) и окружение
// (ambience.ts) на шине «Окружение»; ровный рокот прибоя набережной на ферме убран (Sound.setSurf) — на тихом холме он
// звучал как сильный ветер. Всё появляется плавно при входе и затихает при выходе; вкладка спрятана или кадры встали
// (обрыв связи) — тема и окружение тоже затихают, а вернулись — тема продолжает с того места, где «была бы».
// Подключение — пять строк в client/farm/scene.ts: enter, exit и update из кадра.
import type * as THREE from 'three';
import type { Sound } from '../../audio.ts';
import { MusicPlayer } from '../../music/engine.ts';
import { compileSong, type CompiledSong } from '../../music/song.ts';
import { FarmAmbience } from './ambience.ts';
import { farmTheme, FARM_THEME_META } from './theme.ts';

/** Прибой набережной на ферме: доля громкости (0 — нет; своё далёкое море — в ambience.ts) */
const SURF_ON_FARM = 0;
/** Появление и затухание — постоянные времени, с (≈ 4 с до полной громкости, ≈ 3 с до тишины) */
const FADE_IN = 1.3;
const FADE_OUT = 0.7;
/** Через столько секунд после начала затухания проигрыватели и голоса снимаются */
const DROP_AFTER = 4;
/** Кадров нет дольше (мс) — игра стоит: тишина (спрятанная вкладка — сразу, по document.hidden); короткие подвисания
 * при входе (сборка шейдеров на слабой машине) тему не прерывают */
const STALE_MS = 5000;
/** Следующий круг темы ставится на второй проигрыватель за столько секунд до шва */
const LOOP_AHEAD = 1.5;

let compiled: CompiledSong | null = null;
/** Ноты темы — собираются один раз */
export function farmThemeSong(): CompiledSong {
  return (compiled ??= compileSong(farmTheme, FARM_THEME_META));
}

function fadeTo(g: GainNode, v: number, tau: number): void {
  const t = g.context.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.setTargetAtTime(v, t, tau);
}

/**
 * Тема по кругу без шва: два проигрывателя по очереди — следующий круг начинается точно на конце прошлого, а у прошлого
 * спокойно дозвучивают хвосты нот и реверберация (один проигрыватель при новом старте гасит прошлую песню).
 */
class ThemeLoop {
  private ctx: BaseAudioContext | null = null;
  private out: GainNode | null = null;
  private players: MusicPlayer[] = [];
  private turn = 0;
  /** Время контекста, где начался текущий круг (и после паузы — откуда считать место в теме) */
  private origin = NaN;
  private queued = false;
  private dropAt = Infinity;
  private fresh = true;
  running = false;

  /** Новый вход на ферму: следующий запуск — с начала */
  restart(): void {
    this.fresh = true;
  }

  /** Звучать или затихнуть (плавно); ctx и dest — контекст и шина «Музыка» */
  want(ctx: BaseAudioContext, dest: AudioNode, on: boolean): void {
    if (this.ctx !== ctx) {
      if (!on) return;
      this.build(ctx, dest);
    }
    const out = this.out!;
    if (on) {
      if (this.dropAt !== Infinity || !this.running) fadeTo(out, 1, FADE_IN);
      this.dropAt = Infinity;
      if (!this.running) this.play();
      this.fresh = false;
    } else if (this.running && this.dropAt === Infinity) {
      fadeTo(out, 0, FADE_OUT);
      this.dropAt = ctx.currentTime + DROP_AFTER;
    }
  }

  private build(ctx: BaseAudioContext, dest: AudioNode): void {
    for (const p of this.players) p.dispose();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.players = [new MusicPlayer(ctx, this.out, { live: true }), new MusicPlayer(ctx, this.out, { live: true })];
    this.running = false;
    this.origin = NaN;
  }

  private play(): void {
    const song = farmThemeSong();
    const when = this.ctx!.currentTime + 0.05;
    const len = song.length;
    const pos = this.fresh || Number.isNaN(this.origin) ? 0 : (((when - this.origin) % len) + len) % len;
    this.turn = 0;
    this.players[0].start(song, pos, when);
    this.origin = when - pos;
    this.queued = false;
    this.running = true;
  }

  /** Часто (кадр или таймер): поставить следующий круг, снять затихшее */
  tick(): void {
    if (!this.running) return;
    const now = this.ctx!.currentTime;
    if (now >= this.dropAt) {
      for (const p of this.players) p.stop(0.05);
      this.running = false;
      this.dropAt = Infinity;
      return;
    }
    const song = farmThemeSong();
    const end = this.origin + song.length;
    if (!this.queued && now > end - LOOP_AHEAD) {
      const next = this.players[1 - this.turn];
      // опоздали (кадры стояли) — следующий круг с того места, где он уже должен быть
      if (now < end - 0.05) next.start(song, 0, end);
      else next.start(song, now + 0.05 - end, now + 0.05);
      this.queued = true;
    }
    if (this.queued && now >= end) {
      this.turn = 1 - this.turn;
      this.origin = end;
      this.queued = false;
    }
  }

  /** Для проверок: место в теме, с */
  get position(): number {
    return this.running && this.ctx ? (this.ctx.currentTime - this.origin) % farmThemeSong().length : NaN;
  }

  get level(): number {
    return this.out?.gain.value ?? 0;
  }
}

export class FarmAudio {
  private sound: Sound | null = null;
  private active = false;
  private seen = -Infinity;
  private timer: ReturnType<typeof setInterval> | null = null;
  private surfDown = false;
  private readonly theme = new ThemeLoop();
  private amb: FarmAmbience | null = null;
  private ambOn = false;
  private ambDrop = Infinity;

  /** Вошли на ферму (под экраном загрузки): тема — с начала, как только пойдут кадры */
  enter(): void {
    this.active = true;
    this.theme.restart();
    if (!this.timer) this.timer = setInterval(() => this.sync(), 300);
  }

  /** Ушли с фермы: тема и окружение затихают, прибой набережной возвращается */
  exit(): void {
    this.active = false;
    this.sync();
  }

  /** Кадр фермы: слушатель — камера; события окружения; тема по кругу */
  update(sound: Sound, cam: THREE.Camera): void {
    this.sound = sound;
    this.seen = performance.now();
    const kit = sound.kit;
    if (kit) {
      const e = cam.matrixWorld.elements;
      const p = cam.position;
      sound.setListener(p.x, p.y, p.z, -e[8], -e[9], -e[10]);
      if (this.ambOn) this.amb?.update(p.x, p.z, e[2]);
    }
    this.sync();
  }

  private sync(): void {
    const sound = this.sound;
    const kit = sound?.kit;
    if (!sound || !kit) {
      if (!this.active && !this.theme.running) this.stopTimer();
      return;
    }
    const hidden = typeof document !== 'undefined' && document.hidden;
    const live = this.active && !hidden && performance.now() - this.seen < STALE_MS;
    if (this.active !== this.surfDown) {
      sound.setSurf(this.active ? SURF_ON_FARM : 1);
      this.surfDown = this.active;
    }
    this.theme.want(kit.ctx, kit.music, live && sound.musicLevel > 0.001);
    this.theme.tick();
    // окружение: своя громкость поверх шины, плавно
    const now = kit.ctx.currentTime;
    if (live && (!this.amb || this.amb.out.context !== kit.ctx)) {
      this.amb = new FarmAmbience(kit.ctx, kit.amb);
      this.amb.out.gain.value = 0;
      this.ambOn = false;
    }
    const amb = this.amb;
    if (amb && live !== this.ambOn) {
      this.ambOn = live;
      fadeTo(amb.out, live ? 1 : 0, live ? FADE_IN : FADE_OUT);
      this.ambDrop = live ? Infinity : now + DROP_AFTER;
    }
    if (amb && now >= this.ambDrop) {
      amb.release();
      this.ambDrop = Infinity;
    }
    if (!this.active && !this.theme.running && this.ambDrop === Infinity) this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Для проверок (window.__opus.app.farm.audio.debug()) */
  debug(): Record<string, unknown> {
    return { active: this.active, surfDown: this.surfDown, theme: { running: this.theme.running, position: this.theme.position, level: this.theme.level }, ambience: { on: this.ambOn, level: this.amb?.out.gain.value ?? 0, ...this.amb?.debug() } };
  }
}
