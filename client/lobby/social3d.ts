// «Общее» на набережной (флаг SOCIAL, shared/social.ts): световой столб над входом, куда позвали («Позвать», О-1) и огни
// букв TIREDWOOD на горе (Н-5): горящие буквы — золото и свечение, на девятой — салют над бухтой. Всё — по письмам сервера.
// Столб — один меш с вершинными цветами (аддитивный, без ламп); показывается на время, его шейдер прогревается при создании.
import * as THREE from 'three';
import { CALL_BEAM_MS, LETTER_COUNT, type CallKind } from '../../shared/social.ts';
import { BOAT_RACE_CIRCLE, FORT_ARCH, HIDE_CIRCLE, KART_START } from '../../shared/maps/lobby.ts';
import { QUIZ_VENUE } from '../../shared/quiz/venue.ts';
import { PIRATE_SHIP } from '../../shared/pirates.ts';
import type { LobbyFx } from './fx.ts';
import type { Tiredwood } from './tiredwood.ts';

/** Куда ставим столб: у входа в каждое место (мировые x, z) */
export function entranceOf(kind: CallKind): { x: number; z: number } {
  switch (kind) {
    case 'kart': return { x: KART_START.x, z: KART_START.z };
    case 'boatrace': return { x: BOAT_RACE_CIRCLE.x, z: BOAT_RACE_CIRCLE.z };
    case 'hide': return { x: HIDE_CIRCLE.x, z: HIDE_CIRCLE.z };
    case 'fort': return { x: FORT_ARCH.x, z: FORT_ARCH.z + 0.9 };
    case 'quiz': return { x: QUIZ_VENUE.center[0], z: QUIZ_VENUE.center[1] };
  }
}

const BEAM_H = 60;
const FADE_IN = 0.5;
const FADE_OUT = 3;
const TINT = new THREE.Color(1, 0.78, 0.36);
/** Вблизи столб тает: кто стоит у входа (зовущий или пришедший), не смотрит сквозь белую стену */
const NEAR_FROM = 3;
const NEAR_TO = 11;

export interface SocialLobbyDeps {
  scene: THREE.Scene;
  sign: () => Tiredwood | null;
  fx: () => LobbyFx | null;
  fanfare: () => void;
}

export class SocialLobby {
  /** Сервер сказал, что «Общее» включено: огни букв показываются */
  on = false;
  private readonly d: SocialLobbyDeps;
  private readonly beamMesh: THREE.Group;
  private readonly mat: THREE.MeshBasicMaterial;
  /** Когда столб гаснет (performance.now, мс); 0 — не горит */
  private beamUntil = 0;
  private beamFrom = 0;
  /** Пока шейдер столба прогревается: сколько кадров ещё держим его видимым и чёрным */
  private warm = 3;
  private lit = -1;
  private time = 0;
  /** Куда идти (мировые x, z) — для расстояния в плашке «Иду» */
  at: { x: number; z: number } | null = null;

  constructor(d: SocialLobbyDeps) {
    this.d = d;
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    this.mat.color.setScalar(0);
    const col = new THREE.Color();
    // столб: открытый цилиндр, светится у земли и тает к верху (аддитивно: чёрный — ничего)
    const cyl = new THREE.CylinderGeometry(0.55, 0.85, BEAM_H, 20, 1, true).translate(0, BEAM_H / 2, 0);
    const c1 = new Float32Array(cyl.getAttribute('position').count * 3);
    for (let i = 0; i < c1.length / 3; i++) {
      const k = 1 - cyl.getAttribute('position').getY(i) / BEAM_H;
      col.copy(TINT).multiplyScalar(0.7 * k * k);
      c1.set([col.r, col.g, col.b], i * 3);
    }
    cyl.setAttribute('color', new THREE.BufferAttribute(c1, 3));
    // пятно света на земле вокруг входа
    const ring = new THREE.RingGeometry(0.9, 2.6, 40).rotateX(-Math.PI / 2).translate(0, 0.06, 0);
    const c2 = new Float32Array(ring.getAttribute('position').count * 3);
    for (let i = 0; i < c2.length / 3; i++) {
      const r = Math.hypot(ring.getAttribute('position').getX(i), ring.getAttribute('position').getZ(i));
      col.copy(TINT).multiplyScalar(0.6 * (1 - (r - 0.9) / 1.7));
      c2.set([col.r, col.g, col.b], i * 3);
    }
    ring.setAttribute('color', new THREE.BufferAttribute(c2, 3));
    const a = new THREE.Mesh(cyl, this.mat);
    const b = new THREE.Mesh(ring, this.mat);
    for (const m of [a, b]) {
      m.frustumCulled = false;
      m.renderOrder = 4;
      // столб над входом — место режима: набережная plaza3 не прячет его вдали (plaza3/perf.ts)
      m.userData.p3keep = true;
    }
    this.beamMesh = new THREE.Group();
    this.beamMesh.add(a, b);
    this.beamMesh.visible = true;
    d.scene.add(this.beamMesh);
  }

  /** Позвали в место kind: столб на ms мс (один за раз — новый заменяет прежний) */
  beam(kind: CallKind, ms = CALL_BEAM_MS): void {
    const p = entranceOf(kind);
    this.at = p;
    this.beamMesh.position.set(p.x, 0, p.z);
    const now = performance.now();
    this.beamFrom = now;
    this.beamUntil = now + ms;
    this.warm = 0;
    this.beamMesh.visible = true;
  }

  /** Столб гаснет сразу (пришёл на место или ушёл) */
  clearBeam(): void {
    this.beamUntil = 0;
    this.at = null;
  }

  /** Горят первые n букв надписи на горе; boom — зажглась последняя: салют над бухтой */
  setLit(n: number, boom = false): void {
    this.on = true;
    this.lit = Math.max(0, Math.min(LETTER_COUNT, Math.floor(n)));
    this.d.sign()?.setLit(this.lit);
    if (!boom) return;
    this.d.fanfare();
    this.d.fx()?.fireworks(new THREE.Vector3(PIRATE_SHIP.x - 4, 16, 38), 16);
  }

  /** Каждый кадр лобби (time — секунды мира; cam — где камера) */
  frame(time: number, _dt: number, cam?: { x: number; z: number }): void {
    this.time = time;
    if (this.on) {
      const sign = this.d.sign();
      // надпись на горе могла собраться позже письма сервера
      if (sign && sign.litCount !== this.lit) sign.setLit(this.lit);
      sign?.tickLit(time, this.lit >= LETTER_COUNT);
    }
    if (this.warm > 0) {
      // шейдер столба собирается сейчас, а не в разговоре с друзьями: пару кадров он виден чёрным
      this.warm--;
      this.beamMesh.visible = this.warm > 0;
      return;
    }
    const now = performance.now();
    if (!this.beamUntil || now >= this.beamUntil) {
      if (this.beamUntil) this.clearBeam();
      this.beamMesh.visible = false;
      return;
    }
    const inK = Math.min(1, (now - this.beamFrom) / 1000 / FADE_IN);
    const outK = Math.min(1, (this.beamUntil - now) / 1000 / FADE_OUT);
    const pulse = 0.82 + 0.18 * Math.sin(this.time * 3.1);
    let near = 1;
    if (cam) {
      const t = Math.min(1, Math.max(0, (Math.hypot(cam.x - this.beamMesh.position.x, cam.z - this.beamMesh.position.z) - NEAR_FROM) / (NEAR_TO - NEAR_FROM)));
      near = t * t * (3 - 2 * t);
    }
    this.mat.color.setScalar(inK * outK * pulse * near);
    const s = 0.55 + 0.45 * inK;
    this.beamMesh.scale.set(s, 1, s);
    this.beamMesh.visible = true;
  }
}
