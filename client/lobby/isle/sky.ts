// Погода острова «Последний свет» поверх погоды набережной (флаг ISLE): туман, цвет неба и моря, солнце, мягкий свет и
// экспозиция — по дальности камеры от бухты и от острова (shared/isle.ts — isleClimate). Мир (client/lobby/world.ts)
// зовёт step каждый кадр и apply в конце своей погоды; в бухте (до 250 м от площади) ничего не меняется.
// «Туман наступает» приходит от сервера (письмо isle) и наплывает за 20 с, как тучи дождя.
// Море идёт за камерой, когда она далеко от площади (ЗАГЛУШКА до пакета B «море за камерой»): плоскость моря 3 × 3 км
// стоит у площади, а остров — в 2,4 км; волны в шейдере — по мировым координатам, сдвиг не виден.
import * as THREE from 'three';
import { ISLE_EXPOSURE, ISLE_FOG, ISLE_FOG_EVENT, isleClimate, type IsleClimate } from '../../../shared/isle.ts';
import { isleDist } from '../../../shared/maps/isle.ts';

/** Переход «Туман наступает», с */
const EVENT_S = 20;
/** Мягкий свет у острова: небо светлое и жемчужное, земля — серо-зелёная (как на странице ревью) */
const HEMI_ISLE: readonly [number, number, number] = [2.1, 0xf6f1e8, 0x5f665b];
const SKY_KEYS = ['uHorizon', 'uMid', 'uZenith', 'uSunGlow', 'uCloud', 'uCloudLit'] as const;
/** Вода у острова: серо-зелёная, как на странице ревью */
const SEA_DEEP = 0x4f6b69;
const SEA_SHALLOW = 0x86a09c;

const _pearl = new THREE.Color();
const _cold = new THREE.Color();
const _col = new THREE.Color();

/** Цвет униформы (Color или vec3 облаков) — к цвету c на долю k */
function toward(u: { value: unknown } | undefined, c: THREE.Color, k: number): void {
  const v = u?.value as (THREE.Color & { isColor?: boolean }) | (THREE.Vector3 & { isVector3?: boolean }) | undefined;
  if (!v || k <= 0) return;
  if ((v as THREE.Color).isColor) (v as THREE.Color).lerp(c, k);
  else if ((v as THREE.Vector3).isVector3) {
    const w = v as THREE.Vector3;
    w.set(w.x + (c.r - w.x) * k, w.y + (c.g - w.y) * k, w.z + (c.b - w.z) * k);
  }
}
const ss = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

interface HazeLike {
  uHaze: { value: number };
  uHazeColor: { value: THREE.Color };
}

export class IsleSky {
  /** «Туман наступает»: 0…1, плавно */
  ev = 0;
  private evTarget = 0;
  readonly climate: IsleClimate = { near: Infinity, far: Infinity, tint: 0, haze: 0, sun: 1, isle: 0, rainMute: 0 };
  private sea: THREE.Object3D | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private seaMat: THREE.ShaderMaterial | null = null;
  private key = '';

  /** Насколько стих дождь набережной у острова (0 — идёт как есть) */
  get rainMute(): number {
    return this.climate.rainMute;
  }

  /** Насколько камера уже у острова (0…1) */
  get isle(): number {
    return this.climate.isle;
  }

  attach(sea: THREE.Object3D, skyMat: THREE.ShaderMaterial, seaMat: THREE.ShaderMaterial): void {
    this.sea = sea;
    this.skyMat = skyMat;
    this.seaMat = seaMat;
  }

  /** Сервер: идёт ли «Туман наступает»; instant — сразу (вход на набережную) */
  setEvent(on: boolean, instant = false): void {
    this.evTarget = on ? 1 : 0;
    if (instant) this.ev = this.evTarget;
  }

  /** Кадр: true — погоду пора пересчитать (камера ушла дальше или туман наступает) */
  step(dt: number, cam: THREE.Vector3): boolean {
    const d = this.evTarget - this.ev;
    if (d !== 0) this.ev = Math.abs(d) <= dt / EVENT_S ? this.evTarget : this.ev + Math.sign(d) * dt / EVENT_S;
    const dBay = Math.hypot(cam.x, cam.z);
    // море — вокруг камеры, когда она ушла от бухты (в бухте плоскость стоит как стояла)
    if (this.sea) {
      const k = ss(250, 600, dBay);
      this.sea.position.x = cam.x * k;
      this.sea.position.z = cam.z * k;
    }
    const c = isleClimate(dBay, isleDist(cam.x, cam.z), this.ev, this.climate);
    const key = c.tint <= 0 && c.sun >= 1 && c.haze <= 0 && !Number.isFinite(c.far) ? 'bay'
      : `${Math.round(c.near * 4)}|${Math.round(c.far)}|${Math.round(c.tint * 300)}|${Math.round(c.sun * 300)}|${Math.round(c.haze * 300)}|${Math.round(this.ev * 300)}`;
    if (key === this.key) return false;
    this.key = key;
    return true;
  }

  /** В конце погоды мира: туман, небо, море, свет; вернуть экспозицию */
  apply(fog: THREE.Fog, background: THREE.Color, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, haze: HazeLike, exposure: number): number {
    const c = this.climate;
    if (this.key === 'bay' || this.key === '') return exposure;
    if (Number.isFinite(c.far)) {
      fog.near = Math.min(fog.near, c.near);
      fog.far = Math.min(fog.far, c.far);
    }
    _pearl.set(ISLE_FOG.color).lerp(_cold.set(ISLE_FOG_EVENT.color), this.ev);
    fog.color.lerp(_pearl, c.tint);
    background.copy(fog.color);
    for (const mat of [this.skyMat, this.seaMat]) {
      if (!mat) continue;
      for (const k of SKY_KEYS) toward(mat.uniforms[k], _pearl, c.tint * (mat === this.seaMat ? 0.7 : 0.92));
      if (mat === this.seaMat) {
        toward(mat.uniforms.uDeep, _col.set(SEA_DEEP), c.isle);
        toward(mat.uniforms.uShallow, _col.set(SEA_SHALLOW), c.isle);
      }
      if (mat.uniforms.uSunVis) mat.uniforms.uSunVis.value *= c.sun;
    }
    sun.intensity *= c.sun;
    hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, HEMI_ISLE[0], c.isle);
    hemi.color.lerp(_col.set(HEMI_ISLE[1]), c.isle);
    hemi.groundColor.lerp(_col.set(HEMI_ISLE[2]), c.isle);
    haze.uHaze.value = Math.max(haze.uHaze.value, c.haze);
    haze.uHazeColor.value.copy(fog.color).convertLinearToSRGB();
    return THREE.MathUtils.lerp(exposure, ISLE_EXPOSURE, c.isle);
  }
}
