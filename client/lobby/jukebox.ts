// Музыкальный автомат на площади — связка: что играет (по серверному времени: все слышат одно место песни),
// синтез песни (client/music), громкость и панорама по расстоянию до автомата, приглушение прочей музыки, окно выбора
// и модель. В режимах (не в лобби), в скрытой вкладке, без звука и при ползунке «Музыка» на нуле — не синтезируем;
// вернулся — песня продолжается с нужного места.
import type * as THREE from 'three';
import type { Sound } from '../audio.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import { JUKEBOX, JUKE_FAR, JUKE_H, JUKE_NEAR, JUKE_SONGS, JUKE_USE, jukeGain, songPrice, type JukeServerMsg, type JukeView } from '../../shared/jukebox.ts';
import { MusicPlayer } from '../music/engine.ts';
import { songByIndex } from '../music/songs.ts';

/** Состояние для окна выбора (client/ui/jukebox.ts) */
export interface JukePanelState {
  view: JukeView | null;
  serverNow: number;
  myPid: number;
  tokens: number;
  pending: number | null;
  note: string | null;
}
export interface JukePanelActions {
  play(song: number): void;
  close(): void;
}
export interface JukePanelLike {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(s: JukePanelState): void;
  onKey(code: string, e: KeyboardEvent): boolean;
}
/** Модель на площади (client/lobby/jukebox3d.ts) */
export interface JukeModelLike {
  setVisible(on: boolean): void;
  update(dt: number, playing: boolean, bands: Float32Array, beat: number): void;
}

export interface JukeDeps {
  sound: Sound;
  send: (msg: ClientMsg) => void;
  toast: (text: string) => void;
  myPid: () => number;
  tokens: () => number;
  /** Пинг до сервера, мс (половина — задержка сообщения) */
  ping: () => number;
  /** Окно открылось / закрылось: отпустить мышь / забрать обратно */
  onOpen: () => void;
  onClose: () => void;
  /** Корпус стал твёрдым или пропал (флаг сервера) */
  setSolid: (on: boolean) => void;
  /** Модель появилась или пропала: тени перерисовать (карта теней — по запросу) */
  refreshShadows: () => void;
}

/** Окно закрывается, если отошёл дальше этого от места заказа */
const CLOSE_R = JUKE_USE.r + 1.4;
/** Расхождение с нужным местом песни, после которого начинаем заново с верного места, с */
const RESYNC = 0.35;
/** Срез высоких вдали: у автомата — без среза, на краю слышимости — глуше */
const LP_NEAR = 20000;
const LP_FAR = 3200;

export class LobbyJukebox {
  private readonly d: JukeDeps;
  private view: JukeView | null = null;
  /** Серверное время минус performance.now() (по последнему сообщению) */
  private offset = 0;
  private on = false;
  private inLobby = false;
  private player: MusicPlayer | null = null;
  private panel: JukePanelLike | null = null;
  private model: JukeModelLike | null = null;
  private pending: number | null = null;
  private pendingUntil = 0;
  private note: string | null = null;
  private nextPanel = 0;
  private nextSync = 0;
  private readonly bands = new Float32Array(7);
  private modelShown = false;
  private hidden = typeof document !== 'undefined' && document.hidden;

  constructor(d: JukeDeps) {
    this.d = d;
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      // скрытая вкладка: таймеры редки — песню гасим сразу, вернулись — синхронизация на ближайшем кадре
      if (this.hidden) this.player?.stop(0.05);
      this.nextSync = 0;
    });
  }

  /** Есть ли автомат на сервере (флаг JUKEBOX): до первого «juke» — нет */
  get enabled(): boolean {
    return this.on;
  }

  get isOpen(): boolean {
    return this.panel?.isOpen ?? false;
  }

  attachPanel(make: (actions: JukePanelActions) => JukePanelLike): void {
    this.panel = make({ play: (i) => this.order(i), close: () => this.close() });
  }

  attachModel(model: JukeModelLike): void {
    this.model = model;
    const want = this.on && this.inLobby;
    this.modelShown = want;
    model.setVisible(want);
    this.d.refreshShadows();
  }

  /** Показать или спрятать модель; true — видимость сменилась */
  private showModel(on: boolean): boolean {
    if (!this.model || on === this.modelShown) return false;
    this.modelShown = on;
    this.model.setVisible(on);
    this.d.refreshShadows();
    return true;
  }

  /** Вошли в лобби или вышли (в режимы, переподключение): до нового «juke» автомата нет */
  reset(inLobby: boolean): void {
    this.inLobby = inLobby;
    this.on = false;
    this.view = null;
    this.pending = null;
    this.note = null;
    if (this.panel?.isOpen) this.close();
    this.player?.stop(0.4);
    this.d.sound.duckMusic(1);
    this.showModel(false);
    this.d.setSolid(false);
  }

  onMsg(msg: JukeServerMsg): void {
    if (msg.t === 'juke') {
      if (!this.on) {
        this.on = true;
        this.showModel(this.inLobby);
        this.d.setSolid(true);
      }
      this.view = msg.v;
      this.offset = msg.v.now + Math.min(300, Math.max(0, this.d.ping() / 2)) - performance.now();
      this.nextSync = 0;
      this.nextPanel = 0;
      return;
    }
    this.pending = null;
    this.note = msg.text;
    this.nextPanel = 0;
    // отказ — всегда тостом (и строкой в окне); «поставлено» — строкой в окне, а если окно уже закрыли — тостом
    if (!msg.ok) this.d.toast(msg.text);
    else if (!this.panel?.isOpen) this.d.toast(`🎵 ${msg.text}`);
    if (msg.ok) this.d.sound.coin(null);
  }

  open(): void {
    if (!this.on || !this.panel || this.panel.isOpen) return;
    this.note = null;
    this.panel.open();
    this.nextPanel = 0;
    this.d.onOpen();
  }

  close(): void {
    if (!this.panel?.isOpen) return;
    this.panel.close();
    this.d.onClose();
  }

  /** E у автомата: открыть, ещё раз — закрыть (клавиша — жест: мышь захватится сразу, без паузы) */
  toggle(): void {
    if (this.panel?.isOpen) this.close();
    else this.open();
  }

  /** Клавиши, пока окно открыто: true — съело */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.panel?.isOpen) return false;
    return this.panel.onKey(code, e);
  }

  private order(song: number): void {
    const now = performance.now();
    if (this.pending !== null && now < this.pendingUntil) return;
    if (!JUKE_SONGS[song]) return;
    const price = songPrice(song);
    if (this.d.tokens() < price) {
      this.note = `Песня стоит ${price} 🪙, а у тебя ${this.d.tokens()}`;
      this.nextPanel = 0;
      this.d.toast(this.note);
      return;
    }
    this.pending = song;
    this.pendingUntil = now + 4000;
    this.nextPanel = 0;
    this.d.send({ t: 'juke', song });
  }

  private serverNow(): number {
    return performance.now() + this.offset;
  }

  /**
   * Кадр: синхронизация песни, громкость по расстоянию (слушатель — камера), окно и модель. me — игрок (закрыть окно,
   * если отошёл), cam — камера (где слушаем и куда смотрим).
   */
  update(dt: number, me: { x: number; y: number; z: number } | null, cam: THREE.Camera): void {
    const now = performance.now();
    if (this.pending !== null && now >= this.pendingUntil) this.pending = null;
    const cur = this.on && this.inLobby ? this.view?.cur ?? null : null;
    const song = cur ? songByIndex(cur.song) : null;
    const pos = cur ? (this.serverNow() - cur.start) / 1000 : NaN;
    const want = !!song && !this.hidden && this.d.sound.musicLevel > 0.001 && pos < song.total;
    if (now >= this.nextSync) {
      this.nextSync = now + 250;
      if (!want) {
        if (this.player?.current) this.player.stop(0.5);
      } else {
        if (!this.player) {
          const kit = this.d.sound.jukeKit;
          if (kit) this.player = new MusicPlayer(kit.ctx, kit.out, { live: true });
        }
        const p = this.player;
        // начало — через 50 мс (запас на постановку нот): с того места, где песня будет в этот миг
        if (p && (p.current !== song || Math.abs(p.time - pos) > RESYNC)) p.start(song!, pos + 0.05);
      }
    }
    // громкость, панорама и «глуше вдали»: от камеры до автомата
    const cp = cam.position;
    const dx = JUKEBOX.x - cp.x;
    const dz = JUKEBOX.z - cp.z;
    const dy = JUKE_H * 0.6 - cp.y;
    const dist = Math.hypot(dx, dy, dz);
    const g = jukeGain(dist);
    const playing = !!this.player?.current && want;
    if (this.player) {
      const e = cam.matrixWorld.elements;
      // правая ось камеры (x) — куда «вправо»; звук сбоку — немного в ту сторону
      const side = dist > 0.5 ? (dx * e[0] + dz * e[2]) / Math.max(0.5, Math.hypot(dx, dz)) : 0;
      const k = Math.min(1, Math.max(0, (dist - JUKE_NEAR) / (JUKE_FAR - JUKE_NEAR)));
      this.player.setSpace(g, side * 0.55, LP_NEAR + (LP_FAR - LP_NEAR) * k * k * (3 - 2 * k));
    }
    // прочая музыка (баян баркаса…) уступает автомату: рядом — сильнее
    this.d.sound.duckMusic(playing ? 1 - 0.65 * g : 1);
    // окно: отошёл — закрыть; пока открыто — обновлять 4 раза в секунду
    if (this.panel?.isOpen) {
      if (!me || Math.hypot(me.x - JUKE_USE.x, me.z - JUKE_USE.z) > CLOSE_R || Math.abs(me.y) > 2.5) this.close();
      else if (now >= this.nextPanel) {
        this.nextPanel = now + 250;
        this.panel.update({ view: this.view, serverNow: this.serverNow(), myPid: this.d.myPid(), tokens: this.d.tokens(), pending: this.pending, note: this.note });
      }
    }
    if (this.model) {
      const t = this.player && playing ? this.player.time : NaN;
      if (playing) this.player!.bands(this.bands);
      else this.bands.fill(0);
      const beat = song && t >= 0 ? (t / song.beat) % 1 : 0;
      this.model.update(dt, playing && t >= 0, this.bands, beat);
    }
  }
}
