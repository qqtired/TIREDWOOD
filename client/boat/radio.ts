// Радио на лодке — связка клиента: что включено на каждой лодке (сервер, shared/boatradio.ts), какое радио слышно
// (на борту — полностью, рядом — тише с расстоянием, звучит одно — громче всех), синтез станции движком автомата
// (client/music + client/boat/radiostream.ts) в «эфирном» месте потока по серверным часам, кнопка и окно радио.
// Плавно: включение — нарастание, выключение — затухание, смена станции — короткий «шорох эфира». Пока тянешь рыбу —
// радио тише; автомат на площади уступает радио, когда оно рядом. Скрытая вкладка или ползунок «Музыка» на нуле — не
// синтезируем.
//
// Носители: лодки пакета B (deps.boats — где лодка и на борту ли я) и тестовый носитель (/radio) — желейка хозяина.
import type * as THREE from 'three';
import type { Sound } from '../audio.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import {
  RADIO_DEV_ABOARD_R, RADIO_EPOCH, RADIO_FAR, RADIO_NEAR, RADIO_STATIONS, RADIO_VOL_DEFAULT, RADIO_VOL_MAX, RADIO_VOL_MIN, radioGain, radioVolGain,
  type RadioPatch, type RadioServerMsg, type RadioWire,
} from '../../shared/boatradio.ts';
import { MusicPlayer } from '../music/engine.ts';
import { RadioPanel, type RadioPanelState } from './radiopanel.ts';
import { stationFeed, type StationFeed } from './radiostream.ts';
import { STATION_DEFS } from './stations/index.ts';

type P3 = { x: number; y: number; z: number };

/** Лодки пакета B для радио: где лодка с этим номером и на борту ли я (сижу на месте) */
export interface RadioBoats {
  where(id: number): P3 | null;
  aboard(id: number): boolean;
}

export interface RadioDeps {
  sound: Sound;
  send(msg: ClientMsg): void;
  toast(text: string): void;
  myPid(): number;
  ping(): number;
  /** Где желейка игрока (тестовый носитель — у хозяина в руках) */
  playerPos(pid: number): P3 | null;
  /** Где я (тестовый носитель: «на борту» — рядом с хозяином) */
  mePos(): P3 | null;
  /** Свои лодки (пакет B); null — лодок ещё нет */
  boats: RadioBoats | null;
  /** Тяну рыбу (шкала вываживания) — радио тише */
  reeling(): boolean;
  /** Окно открылось / закрылось: отпустить мышь / забрать обратно */
  onOpen(): void;
  onClose(): void;
  hudRoot: HTMLElement;
}

/** Расхождение с эфиром, после которого начинаем заново с верного места, с */
const RESYNC = 0.6;
/** Другое радио громче на столько — переключаемся на него (иначе дрожало бы на границе) */
const SWITCH = 1.3;
/** Пока тянешь рыбу — радио тише */
const REEL_DUCK = 0.5;
const LP_FAR = 2600;

export class BoatRadio {
  private readonly d: RadioDeps;
  private readonly panel: RadioPanel;
  private wires: RadioWire[] = [];
  /** Серверное время минус performance.now() */
  private offset = 0;
  private on = false;
  private inLobby = false;
  private player: MusicPlayer | null = null;
  /** Плавное появление и затухание (вкл/выкл) — после проигрывателя */
  private fade: GainNode | null = null;
  /** Какое радио звучит: носитель и станция */
  private playing: { id: number; st: number } | null = null;
  private stopAt = 0;
  private readonly feeds = new Map<number, StationFeed>();
  /** Носитель, на борту которого я (кнопка и окно — про него); null — ни на каком */
  private mineId: number | null = null;
  private nextSync = 0;
  private nextPanel = 0;
  private hidden = typeof document !== 'undefined' && document.hidden;

  constructor(d: RadioDeps) {
    this.d = d;
    this.panel = new RadioPanel(d.hudRoot, {
      close: () => this.close(),
      toggle: () => this.toggle(),
      power: () => this.power(),
      station: (i) => this.ask({ st: i }),
      volume: (dv) => this.volume(dv),
      allowAll: (on) => this.ask({ all: on }),
    });
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (this.hidden) this.silence(0.05);
      this.nextSync = 0;
    });
  }

  get isOpen(): boolean {
    return this.panel.isOpen;
  }

  /** Вошли в лобби или вышли: до нового «radio» радио нет */
  reset(inLobby: boolean): void {
    this.inLobby = inLobby;
    this.on = false;
    this.wires = [];
    this.mineId = null;
    if (this.panel.isOpen) this.close();
    this.panel.setChip(null);
    this.silence(0.4);
  }

  onMsg(msg: RadioServerMsg): void {
    if (msg.t === 'radioRes') {
      // отказ сервера — тостом; в окне строка про хозяина и так видна — мигнём ей
      this.d.toast(msg.text);
      if (this.panel.isOpen) this.panel.flashLock();
      return;
    }
    this.on = true;
    this.wires = msg.r;
    this.offset = msg.now + Math.min(300, Math.max(0, this.d.ping() / 2)) - performance.now();
    this.nextSync = 0;
    this.nextPanel = 0;
  }

  // ------------------------------------------------------------ управление

  private mine(): RadioWire | null {
    return this.mineId === null ? null : this.wires.find((w) => w.id === this.mineId) ?? null;
  }

  private canControl(w: RadioWire): boolean {
    return w.owner === this.d.myPid() || (w.all === 1 && this.aboard(w));
  }

  private ask(patch: RadioPatch): void {
    const w = this.mine();
    if (!w) return;
    if (!this.canControl(w) || (patch.all !== undefined && w.owner !== this.d.myPid())) {
      // нельзя — строка «Радио включает хозяин лодки» в окне мигает (сервер всё равно бы отказал)
      this.panel.flashLock();
      return;
    }
    this.d.send({ t: 'radio', id: w.id, ...patch });
  }

  private power(): void {
    const w = this.mine();
    if (w) this.ask({ on: w.on !== 1 });
  }

  private volume(dv: number): void {
    const w = this.mine();
    if (!w) return;
    const v = Math.min(RADIO_VOL_MAX, Math.max(RADIO_VOL_MIN, (w.vol || RADIO_VOL_DEFAULT) + dv));
    if (v !== w.vol) this.ask({ vol: v });
  }

  open(): void {
    if (!this.mine() || this.panel.isOpen) return;
    this.panel.open();
    this.nextPanel = 0;
    this.d.onOpen();
  }

  close(): void {
    if (!this.panel.isOpen) return;
    this.panel.close();
    this.d.onClose();
  }

  toggle(): void {
    if (this.panel.isOpen) this.close();
    else this.open();
  }

  /** Клавиши: R — окно радио (на борту); в окне 1–3 — станция, 0 — вкл/выкл, −/+ — громкость, Esc — закрыть */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.panel.isOpen) {
      if (code === 'KeyR' && !e.repeat && this.mine()) {
        this.open();
        return true;
      }
      return false;
    }
    if (code === 'Escape' || code === 'KeyR') { this.close(); return true; }
    const n = code === 'Digit1' || code === 'Numpad1' ? 0 : code === 'Digit2' || code === 'Numpad2' ? 1 : code === 'Digit3' || code === 'Numpad3' ? 2 : -1;
    if (n >= 0) { this.ask({ st: n }); return true; }
    if (code === 'Digit0' || code === 'Numpad0') { this.power(); return true; }
    if (code === 'Minus' || code === 'NumpadSubtract') { this.volume(-1); return true; }
    if (code === 'Equal' || code === 'NumpadAdd') { this.volume(1); return true; }
    return false;
  }

  // ------------------------------------------------------------ где носитель

  private where(w: RadioWire): P3 | null {
    if (w.dev) return this.d.playerPos(w.owner);
    return this.d.boats?.where(w.id) ?? null;
  }

  private aboard(w: RadioWire): boolean {
    if (w.dev) {
      if (w.owner === this.d.myPid()) return true;
      const me = this.d.mePos();
      const at = this.d.playerPos(w.owner);
      return !!me && !!at && Math.hypot(me.x - at.x, me.z - at.z) <= RADIO_DEV_ABOARD_R && Math.abs(me.y - at.y) < 3;
    }
    return this.d.boats?.aboard(w.id) ?? false;
  }

  private feed(st: number): StationFeed | null {
    const had = this.feeds.get(st);
    if (had) return had;
    const meta = RADIO_STATIONS[st];
    const def = meta ? STATION_DEFS[meta.id] : undefined;
    if (!meta || !def) return null;
    const f = stationFeed(def, meta);
    this.feeds.set(st, f);
    return f;
  }

  /** Место в эфире станции, с */
  private airPos(): number {
    return (performance.now() + this.offset - RADIO_EPOCH) / 1000;
  }

  // ------------------------------------------------------------ звук

  /** Погасить радио за fade секунд (проигрыватель остановится после затухания) */
  private silence(fade: number): void {
    // уже гаснет (или молчит) — не продлеваем: проигрыватель остановится в stopAt
    if (!this.playing) return;
    this.playing = null;
    const g = this.fade;
    if (g) {
      const t = g.context.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 4));
    }
    this.stopAt = performance.now() + fade * 1000 + 100;
  }

  /** «Шорох эфира» при смене станции: короткий шум через полосу */
  private static_(gain: number): void {
    const kit = this.d.sound.kit;
    const out = this.fade;
    if (!kit || !out || gain < 0.02) return;
    const ctx = kit.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = kit.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, t);
    bp.frequency.exponentialRampToValueAtTime(3800, t + 0.35);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.04);
    g.gain.setTargetAtTime(0, t + 0.22, 0.08);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.2);
    src.stop(t + 0.6);
  }

  /** Кадр: какое радио слышно и как громко (слушатель — камера), синхронизация с эфиром, кнопка и окно */
  update(_dt: number, cam: THREE.Camera): void {
    const now = performance.now();
    const lobby = this.on && this.inLobby;
    // на борту какого носителя я (своя лодка — первой)
    let mine: RadioWire | null = null;
    if (lobby) for (const w of this.wires) if (this.aboard(w) && (!mine || w.owner === this.d.myPid())) mine = w;
    this.mineId = mine?.id ?? null;
    if (!mine && this.panel.isOpen) this.close();
    this.panel.setChip(mine ? { title: mine.on ? RADIO_STATIONS[mine.st]?.title ?? '' : 'выкл', emoji: mine.on ? RADIO_STATIONS[mine.st]?.emoji ?? '📻' : '📻', on: mine.on === 1 } : null);

    // какое радио слышно: громче всех (на борту — без потерь на расстояние)
    const cp = cam.position;
    let best: { w: RadioWire; g: number; pan: number; dist: number } | null = null;
    let cur: { w: RadioWire; g: number; pan: number; dist: number } | null = null;
    if (lobby) {
      const e = cam.matrixWorld.elements;
      for (const w of this.wires) {
        if (w.on !== 1) continue;
        const onBoard = w.id === this.mineId;
        const at = onBoard ? null : this.where(w);
        if (!onBoard && !at) continue;
        const dx = at ? at.x - cp.x : 0;
        const dz = at ? at.z - cp.z : 0;
        const dist = at ? Math.hypot(dx, (at.y + 1) - cp.y, dz) : 0;
        const g = (onBoard ? 1 : radioGain(dist)) * radioVolGain(w.vol);
        if (g <= 0.003) continue;
        const pan = dist > 1 ? ((dx * e[0] + dz * e[2]) / Math.max(1, Math.hypot(dx, dz))) * 0.5 : 0;
        const it = { w, g, pan, dist: onBoard ? 0 : dist };
        if (this.playing && this.playing.id === w.id) cur = it;
        if (!best || g > best.g) best = it;
      }
    }
    // держимся звучащего, пока другое не громче заметно
    const pick = cur && best && best.g < cur.g * SWITCH ? cur : best;
    const want = !!pick && !this.hidden && this.d.sound.musicLevel > 0.001;
    if (now >= this.nextSync) {
      this.nextSync = now + 250;
      if (!want || !pick) {
        if (this.playing) this.silence(1.2);
      } else {
        this.play(pick.w);
      }
    }
    if (this.player?.feed && !this.playing && now >= this.stopAt) this.player.stop(0.05);
    const level = want && pick ? pick.g * (this.d.reeling() ? REEL_DUCK : 1) : 0;
    if (this.player && pick) {
      const k = Math.min(1, Math.max(0, (pick.dist - RADIO_NEAR) / (RADIO_FAR - RADIO_NEAR)));
      this.player.setSpace(level, pick.pan, 20000 + (LP_FAR - 20000) * k * k * (3 - 2 * k));
    }
    // автомат на площади уступает радио рядом
    this.d.sound.duckJuke(1 - 0.85 * Math.min(1, (this.playing ? level : 0) * 2.5));

    if (this.panel.isOpen && now >= this.nextPanel) {
      this.nextPanel = now + 200;
      const w = this.mine();
      if (w) this.panel.update(this.panelState(w));
    }
    if (this.panel.isOpen) this.panel.tick(this.player && this.playing?.id === this.mineId ? this.player : null);
  }

  /** Играть радио носителя w: станция сменилась — шорох и новый поток; разошлись с эфиром — с верного места */
  private play(w: RadioWire): void {
    const kit = this.d.sound.radioKit;
    if (!kit) return;
    if (!this.player) {
      this.fade = kit.ctx.createGain();
      this.fade.gain.value = 0;
      this.fade.connect(kit.out);
      this.player = new MusicPlayer(kit.ctx, this.fade, { live: true });
    }
    const feed = this.feed(w.st);
    if (!feed) return;
    const p = this.player;
    const pos = this.airPos() + 0.05;
    const was = this.playing;
    const fresh = !was || was.id !== w.id;
    if (fresh || was.st !== w.st || p.feed !== feed || Math.abs(p.streamPos - pos) > RESYNC) {
      const t = kit.ctx.currentTime;
      const g = this.fade!.gain;
      if (fresh || !p.feed) {
        // включили (или подошли к другой лодке) — плавное нарастание
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.setTargetAtTime(1, t + 0.05, 0.45);
      } else if (was.st !== w.st) {
        this.static_(1);
      }
      p.startFeed(feed, pos);
      this.playing = { id: w.id, st: w.st };
    }
  }

  private panelState(w: RadioWire): RadioPanelState {
    const me = this.d.myPid();
    return {
      owner: w.owner === me,
      ownerNick: w.nick,
      can: this.canControl(w),
      on: w.on === 1,
      st: w.st,
      vol: w.vol,
      all: w.all === 1,
    };
  }
}
