// Остров «Последний свет» на клиенте (флаг ISLE): сцена набережной создаёт его по первому письму isle. Здесь —
// когда грузить остров (камера ближе 2 км или игрок уже у острова — тогда экран загрузки «Последний свет»), погода
// острова (sky.ts), туман «Туман наступает» и сезон острова от сервера, доска сезона у Игната, звук: ревун маяка (ближе
// 900 м, раз в 30 с, в туман-событие — раз в 15 с и глуше; в начале сезона — трижды) и колокольный буй (раз в 4–9 с).
// Кнопка «На большую землю» в окне Игната — ignathome.ts. Отладка (?debug): __opus.app.lobby.isle.debugCam = {x, y, z,
// lx, ly, lz} — камера в точку (для снимков подхода с моря), null — как обычно.
import * as THREE from 'three';
import { ISLE_WATERS_R, ISLE_BELL, ISLE_Y, inIsleWaters, isleDist } from '../../../shared/maps/isle.ts';
import type { IsleView } from '../../../shared/isle.ts';
import type { ClientMsg } from '../../../shared/messages.ts';
import type { Sound } from '../../audio.ts';
import type { Renderer } from '../../render/renderer.ts';
import { FishClock, fishTimeLeft } from '../fishclock.ts';
import { seasonLeft, seasonWait } from '../fishseason.ts';
import type { LobbyWorld } from '../world.ts';
import { IsleCover } from './cover.ts';
import { IgnatHome, type IgnatDialog } from './ignathome.ts';
import { Island3D } from './island3d.ts';
import { ISLE_SEASON, isleSeasonMsg } from './season.ts';
import { IsleSky } from './sky.ts';

/** Грузить остров, когда камера ближе, м */
const LOAD_R = 2000;
/** Ревун слышно ближе, м; раз в столько секунд (в «Туман наступает» — вдвое чаще) */
const HORN_R = 900;
const HORN_EVERY = 30;
/** Колокольный буй слышно ближе, м */
const BELL_R = 260;

export interface IsleDeps {
  world: LobbyWorld;
  renderer: Renderer;
  sound: Sound;
  overlay: HTMLElement;
  npc: IgnatDialog;
  send(msg: ClientMsg): void;
  tokens(): number;
  toast(text: string, ms?: number): void;
}

const _lamp = new THREE.Vector3();

export class IsleClient {
  readonly sky = new IsleSky();
  /** Отладка: камера в точку (снимок подхода с моря) */
  debugCam: { x: number; y: number; z: number; lx: number; ly: number; lz: number } | null = null;
  private readonly d: IsleDeps;
  private readonly clock = new FishClock();
  private readonly island: Island3D;
  private readonly cover: IsleCover;
  private readonly home: IgnatHome;
  private view: IsleView | null = null;
  private loading = false;
  private hornAt = 0;
  private bellAt = 0;
  private boardAt = 0;
  /** Ревун трижды (начало сезона): когда — по часам кадра, с */
  private horns: number[] = [];
  private inWaters = false;
  private time = 0;

  constructor(d: IsleDeps) {
    this.d = d;
    this.island = new Island3D(d.world.scene);
    this.cover = new IsleCover(d.overlay);
    this.home = new IgnatHome(d.npc, d.tokens, d.send);
    d.world.setIsleSky(this.sky);
  }

  /** Письмо сервера isle: туман, сезон острова */
  onMsg(m: { now: number } & IsleView): void {
    const first = this.view === null;
    const wasSeason = this.view ? this.seasonOn() : false;
    this.view = { fog: m.fog, fogUntil: m.fogUntil, season: m.season };
    this.clock.sync(m.now);
    isleSeasonMsg(m.season, m.now);
    this.sky.setEvent(m.fog, first);
    if (this.island.ready) this.boardText();
    for (const i of this.d.world.map.isleBoxes) this.d.world.collision.setEnabled(i, true);
    // начался сезон: ревун трижды (если слышно)
    if (!first && !wasSeason && this.seasonOn()) this.horns = [this.time + 0.5, this.time + 4.5, this.time + 8.5];
    this.boardAt = 0;
  }

  /** Ответ на «На большую землю» пришёл */
  onHome(): void {
    this.home.done();
  }

  /** После камеры, до кадра мира. me — свой игрок (null — ещё нет) */
  update(dt: number, me: { x: number; y: number; z: number } | null): void {
    this.time += dt;
    const w = this.d.world;
    const cam = w.camera;
    if (this.debugCam) {
      const c = this.debugCam;
      cam.position.set(c.x, c.y, c.z);
      cam.lookAt(c.lx, c.ly, c.lz);
      cam.updateMatrixWorld();
    }
    const cp = cam.position;
    const dCam = isleDist(cp.x, cp.z);
    const atIsle = !!me && inIsleWaters(me.x, me.z);
    if (!this.loading && (dCam < LOAD_R || atIsle)) {
      this.loading = true;
      void this.island.load(this.d.renderer.gl, cam, w.scene).catch((e: unknown) => {
        console.error('остров не загрузился', e);
        this.loading = false;
      });
    }
    // у острова, а он ещё грузится — экран загрузки
    if (atIsle && !this.island.ready) this.cover.show(this.island.progress);
    else if (this.cover.on && this.island.ready) {
      this.cover.show(1);
      this.cover.hide();
    }
    if (atIsle && !this.inWaters) this.d.toast('🌫 Воды острова «Последний свет»: туман, маяк и свой улов', 4200);
    this.inWaters = atIsle;
    const fog = w.scene.fog as THREE.Fog;
    this.island.update(dt, this.time, cp, fog.far, this.d.renderer.canvas.height, cam.fov, this.seasonOn(), me);
    if (this.island.ready && dCam < 150 && this.time >= this.boardAt) this.boardText();
    this.sounds(dCam, cp);
  }

  private seasonOn(): boolean {
    return ISLE_SEASON.state()?.on ?? false;
  }

  /** Доска сезона: «Сезон острова / через 47 мин» или «Великий туман! / ещё 6:40», ниже — туман */
  private boardText(): void {
    this.boardAt = this.time + 1;
    const st = ISLE_SEASON.state();
    const v = this.view;
    const now = this.clock.now();
    const fogLine = v?.fog && !st?.on ? `Туман: ещё ${v.fogUntil ? fishTimeLeft(v.fogUntil, now) : '…'}` : st?.on ? 'Туманные виды ×2' : 'Туман: ясно';
    const text = st ? (st.on ? `Великий туман!\nещё ${seasonLeft(st.left)}\n${fogLine}` : `Сезон острова\nчерез ${seasonWait(st.left)}\n${fogLine}`) : `Сезон острова\n…\n${fogLine}`;
    this.island.setBoard(text);
  }

  /** Ревун маяка и колокольный буй */
  private sounds(dCam: number, cp: THREE.Vector3): void {
    const s = this.d.sound;
    const ev = this.sky.ev;
    const muffle = 0.25 + 0.75 * ev;
    // ревун: направленный, громкость — от дальности; точку подносим к слушателю (панорама — по направлению)
    if (this.island.ready && dCam < HORN_R) {
      const every = HORN_EVERY / (1 + ev);
      const due = this.horns.length && this.time >= this.horns[0];
      if (due) this.horns.shift();
      if (due || this.time - this.hornAt >= every) {
        this.hornAt = this.time;
        const lamp = this.island.lampWorld(_lamp);
        const dist = Math.hypot(lamp.x - cp.x, lamp.z - cp.z);
        const k = dist > 1 ? Math.min(1, 24 / dist) : 0;
        const gain = 0.42 * Math.max(0.12, Math.min(1, (HORN_R - dist) / (HORN_R - 150)));
        s.foghorn(gain, [cp.x + (lamp.x - cp.x) * k, cp.y + (lamp.y - cp.y) * k * 0.3, cp.z + (lamp.z - cp.z) * k], muffle);
      }
    } else if (this.horns.length && this.time > this.horns[this.horns.length - 1]) this.horns = [];
    // колокольный буй по волне
    const db = Math.hypot(ISLE_BELL.x - cp.x, ISLE_BELL.z - cp.z);
    if (this.island.ready && db < BELL_R && this.time >= this.bellAt) {
      this.bellAt = this.time + 4 + Math.random() * 5;
      s.buoyBell([ISLE_BELL.x, ISLE_Y + 3, ISLE_BELL.z], muffle * 0.6);
    }
  }

  /** Для отладки (__opus): где остров и что с ним */
  debug(): Record<string, unknown> {
    const cp = this.d.world.camera.position;
    return { ready: this.island.ready, progress: this.island.progress, dist: Math.round(isleDist(cp.x, cp.z)), waters: ISLE_WATERS_R, view: this.view, ev: this.sky.ev, climate: { ...this.sky.climate } };
  }
}
