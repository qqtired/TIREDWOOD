// Баркас «Альбатрос» и лодка Семёна «Удалая» на экране (shared/barkas.ts, shared/ferry.ts): корабль, экипаж, лодка
// с мотористом Гошей, дымки, чайки, табличка у стоянки и звуки. Сцена раз в кадр сообщает звук и где свой игрок
// (setListener), статус лодки с сервера (setFerry), а мир двигает всё в update.
import * as THREE from 'three';
import { BARKAS, BARKAS_BELL, BARKAS_CREW, BARKAS_RYNDA } from '../../../shared/barkas.ts';
import { FE_AWAY, FE_BACK, FE_OUT } from '../../../shared/ferry.ts';
import type { FerryStatus } from '../../../shared/messages.ts';
import { BarkasAudio, type Kit } from './ambient.ts';
import { Crew } from './crew.ts';
import { Ferry3D } from './ferry3d.ts';
import { BarkasGulls } from './gulls.ts';
import { BarkasShip } from './ship.ts';
import { FerrySign } from './sign.ts';
import { Smoke } from './smoke.ts';

const RYNDA_AT = new THREE.Vector3(BARKAS_RYNDA.x - 0.12, BARKAS_RYNDA.y - 0.15, BARKAS_RYNDA.z);
const BELL_AT = new THREE.Vector3(BARKAS_BELL.x, BARKAS_BELL.y + 0.25, BARKAS_BELL.z);
/** Чайки видны ближе этого (м до баркаса) */
/** Чайки — мелочь: с площади (≈90 м) их не разглядеть, рисуем ближе */
const GULLS_FAR = 75;

export class Barkas {
  readonly ship: BarkasShip;
  readonly ferry: Ferry3D;
  private readonly crew: Crew;
  private readonly smoke: Smoke;
  private readonly gulls: BarkasGulls;
  private readonly audio: BarkasAudio;
  private readonly sign: FerrySign;
  private kit: Kit | null = null;
  private me: THREE.Vector3 | null = null;
  private readonly meAt = new THREE.Vector3();
  private readonly cam = new THREE.Vector3();
  private st: FerryStatus | null = null;
  private funnelT = 0;
  private viewH = 0;

  /** wet — материал мокнет в дождь; wind — время ветра (флажки) */
  constructor(scene: THREE.Scene, wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial, wind: THREE.IUniform<number>) {
    this.ship = new BarkasShip(scene, wet, wind);
    this.ferry = new Ferry3D(scene, wet);
    this.smoke = new Smoke(scene);
    this.gulls = new BarkasGulls(scene);
    this.sign = new FerrySign(scene);
    const v = BARKAS_CREW.vityok;
    this.audio = new BarkasAudio(new THREE.Vector3(v.x, v.y, v.z));
    this.crew = new Crew(scene, () => {
      this.ship.ringRynda();
      this.audio.rynda(RYNDA_AT, this.cam);
    });
  }

  /** Звук (sound.kit; null — не разрешён) и где свой игрок (null — нет: меню) — раз в кадр до update. */
  setListener(kit: Kit | null, me: { x: number; y: number; z: number } | null): void {
    this.kit = kit;
    this.me = me ? this.meAt.set(me.x, me.y, me.z) : null;
  }

  /** Статус лодки с сервера. first — при входе на набережную: без гудка и колокола. */
  setFerry(st: FerryStatus, first = false): void {
    const prev = this.st;
    this.st = { ...st };
    this.ferry.setStatus(st);
    if (first || !prev) return;
    // отошла — гудок; позвали с баркаса — колокол у калитки; подошла к баркасу — Саня машет
    if ((st.ph === FE_OUT || st.ph === FE_BACK) && st.ph !== prev.ph) this.audio.horn(this.ferry.group.position, this.cam);
    if (st.c === 1 && prev.c === 0) {
      this.ship.ringGate();
      this.audio.gateBell(BELL_AT, this.cam);
    }
    if (st.ph === FE_AWAY && prev.ph === FE_OUT) this.crew.wave();
  }

  /** renderTick — часы отрисовки (лодка в рейсе — по ним), cam — камера, rain — дождь 0…1, viewH — высота холста, px */
  update(dt: number, t: number, renderTick: number, cam: THREE.Vector3, rain: number, viewH: number): void {
    this.cam.copy(cam);
    if (viewH !== this.viewH) {
      this.viewH = viewH;
      this.smoke.setViewport(viewH);
    }
    const d = Math.hypot(cam.x - BARKAS.x, cam.z - BARKAS.z);
    this.ship.update(dt, t, rain);
    this.ferry.update(dt, t, renderTick, cam, this.smoke, rain);
    this.sign.update(this.ferry.status, renderTick);
    this.audio.update(dt, this.kit, cam, rain, this.ferry.motor());
    this.crew.update(dt, t, cam, this.me, this.smoke, this.audio.squeeze, rain);
    this.gulls.update(dt, t, rain, d < GULLS_FAR);
    // дымок из трубы: в дождь гуще и ниже стелется
    this.funnelT -= dt;
    if (this.funnelT <= 0) {
      this.funnelT = 0.55 + Math.random() * 0.35;
      const f = this.ship.funnelTop;
      this.smoke.puff(f.x, f.y, f.z, rain > 0.5 ? 0x5f6366 : 0x707477, 5, 0.35, 2.4, 0.8 - 0.3 * rain, 0.32 + 0.1 * rain);
    }
    this.smoke.update(dt);
  }

  /** Для отладки (__opus.info): где лодка и что с ней */
  debug(): Record<string, unknown> {
    const p = this.ferry.pose;
    return { ferry: this.st, x: +p.x.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(3), speed: +this.ferry.speed.toFixed(2), music: { ...this.audio.squeeze, tune: this.audio.tune } };
  }
}
