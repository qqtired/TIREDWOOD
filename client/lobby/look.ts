// Новый вид набережной (look v2, план docs/superpowers/plans/2026-10-02-look-v2.md): тёплое золотистое солнце и
// голубоватые мягкие тени, сочные цвета (своя кривая тона), пушистые облака и искры на воде, «рисованные» материалы.
// Мир создаёт его только при включённом новом виде (client/render/look.ts); выключен — этого кода в кадре нет.
// Всё здесь — правка уже построенного мира (свет, материалы, небо и море), наполнение (lookdecor.ts, looktown.ts) и
// запекание (lookbake.ts: мягкие тени на плитке, отражение своего неба); погода (дождь) работает как раньше. Статую и
// свечи у неё не трогаем.
import * as THREE from 'three';
import { STATUE, type LobbyMap } from '../../shared/maps/lobby.ts';
import { fitShadow } from '../render/kit.ts';
import { installLookTone, lookTone, paintMaterial, paintable, type PaintOptions } from '../render/lookpaint.ts';
import { LOOK_EVENING, lookSea, lookSky } from '../render/looksky.ts';
import type { Renderer } from '../render/renderer.ts';
import { EVENING, RAIN, blendSky } from '../render/sky.ts';
import { TOUCH } from '../touch.ts';
import { DeckBake, lookSkyEnv, type Contact } from './lookbake.ts';
import { LookDecor } from './lookdecor.ts';
import { lookTown } from './looktown.ts';
import type { HazeUniforms } from './rain.ts';
import type { LobbyQuality } from './world.ts';

/** Что новому виду нужно от мира набережной */
export interface LookParts {
  scene: THREE.Scene;
  renderer: Renderer;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.ShaderMaterial;
  sea: THREE.ShaderMaterial;
  haze: HazeUniforms;
  /** время ветра (кроны качаются) */
  wind: THREE.IUniform<number>;
  /** материал мокнет в дождь, как у мира */
  wet: (m: THREE.MeshStandardMaterial) => THREE.MeshStandardMaterial;
  map: LobbyMap;
}

/**
 * Свет в ясную погоду (в дождь — как у мира): солнце золотистее и для света выше (≈ 24°: площадь теплее, тени
 * короче; диск на небе — где был), небесный свет голубее — тени голубоватые, отражённый от плитки — тёплый.
 */
const SUN_COLOR = 0xffd49a;
const SUN_I = 3.4;
const SUN_ELEV = 0.42;
const HEMI_SKY = 0xb2c8f4;
const HEMI_GROUND = 0xd2a57c;
const HEMI_I = 1.3;
/** Рассеянный свет в тени — голубовато-сиреневый (множитель; в дождь — белый, как было) */
const SHADE: readonly [number, number, number] = [0.9, 0.96, 1.22];
/** Плитка площади светлее и теплее — песочно-кремовая (множитель к цвету настила) */
const DECK_TINT: readonly [number, number, number] = [1.15, 1.24, 1.5];
/** Мягкость края тени (радиус PCF: цена та же) */
const SHADOW_RADIUS = 3;
/** Рамка теней и её центр — как у мира */
const SHADOW_CENTER = new THREE.Vector3(0, 4, 10);
const SHADOW_BOX = new THREE.Box3(new THREE.Vector3(-31, -1, -27), new THREE.Vector3(31, 15, 47));

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export class LobbyLook {
  private readonly p: LookParts;
  private readonly paint: PaintOptions;
  private painted = false;
  private readonly clearSun = new THREE.Color(SUN_COLOR);
  private readonly baseSun: THREE.Color;
  private readonly shade = new THREE.Color().setRGB(...SHADE);
  private readonly decor: LookDecor;
  /** запечённые тени плитки (null — настил не нашёлся, тени как у мира) */
  private readonly bake: DeckBake | null;
  /** отражение своего неба в мокром (в ясную погоду; в дождь — дождливое мира) */
  private readonly env: THREE.Texture;
  private readonly wetMats: THREE.MeshStandardMaterial[] = [];
  private overcast = 0;

  constructor(p: LookParts, quality: LobbyQuality) {
    this.p = p;
    // телефон — облегчённый уровень: без шума на материалах
    this.paint = { grain: !TOUCH, uniforms: { uLookShade: { value: new THREE.Color() }, uLookSunInv: { value: 1 } } };
    installLookTone();
    p.scene.userData.toneMapping = THREE.CustomToneMapping;
    this.baseSun = p.sun.color.clone();
    p.sun.color.copy(this.clearSun);
    // солнце для света выше, тени — по новой рамке
    const s = EVENING.sunDir;
    const flat = Math.hypot(s.x, s.z);
    const toSun = new THREE.Vector3((s.x / flat) * Math.cos(SUN_ELEV), Math.sin(SUN_ELEV), (s.z / flat) * Math.cos(SUN_ELEV));
    p.sun.position.copy(SHADOW_CENTER).addScaledVector(toSun, 160);
    p.sun.target.position.copy(SHADOW_CENTER);
    p.sun.target.updateMatrixWorld();
    p.sun.updateMatrixWorld();
    fitShadow(p.sun, SHADOW_CENTER, SHADOW_BOX);
    p.sun.shadow.radius = SHADOW_RADIUS;
    p.renderer.refreshShadows();
    lookSky(p.sky);
    lookSea(p.sea);
    // наполнение и город — до первой отрисовки: попадут и в «рисованные» материалы, и в тени статики
    this.decor = new LookDecor({ scene: p.scene, wind: p.wind, wet: p.wet, deco: p.map.deco, lite: TOUCH });
    lookTown(p.scene, TOUCH);
    // запекание: пятна затенения у фонарей и кнехтов (кроме тех, что у статуи) и у нового наполнения
    const contacts: Contact[] = [...this.decor.contacts];
    for (const d of p.map.deco) {
      if (Math.hypot(d.x - STATUE.x, d.z - STATUE.z) < 4) continue;
      if (d.kind === 'lamp') contacts.push([d.x, d.z, 0.55, 0.4]);
      else if (d.kind === 'bollard') contacts.push([d.x, d.z, 0.5, 0.3]);
    }
    this.bake = DeckBake.create(p.renderer.gl, p.scene, p.sun, contacts, TOUCH);
    this.env = lookSkyEnv(p.renderer.gl);
    this.weather(0);
    this.setQuality(quality);
    p.scene.onBeforeRender = () => {
      // материалы — перед первой отрисовкой: к этому времени на набережной построено всё (автоматы, колесо, доски)
      if (!this.painted) {
        this.painted = true;
        this.paintAll();
      }
      // мир пересчитывает тени статики в этом кадре — плитку запечём заново (до того, как она рисуется)
      if (p.renderer.gl.shadowMap.needsUpdate) this.bake?.invalidate();
    };
  }

  /** После погоды мира (k: 0 — ясно, 1 — затянуто): свой свет, небо, море, туман той же кривой тона. */
  weather(k: number): void {
    const { sun, hemi, scene, sky, sea, haze } = this.p;
    const lerp = THREE.MathUtils.lerp;
    blendSky(sky, LOOK_EVENING, RAIN, k);
    blendSky(sea, LOOK_EVENING, RAIN, k);
    // мир уже поставил свет между ясным и дождём — ясную часть заменяем своей
    hemi.color.lerpColors(_c.set(HEMI_SKY), _c2.copy(hemi.color), k);
    hemi.groundColor.lerpColors(_c.set(HEMI_GROUND), _c2.copy(hemi.groundColor), k);
    hemi.intensity = lerp(HEMI_I, hemi.intensity, k);
    sun.color.lerpColors(this.clearSun, this.baseSun, k);
    sun.intensity = lerp(SUN_I, sun.intensity, k);
    // тень голубее, пока светит солнце; яркость солнца — чтобы шейдер понял, где «полностью на солнце»
    const u = this.paint.uniforms;
    u.uLookShade.value.lerpColors(this.shade, _c.setRGB(1, 1, 1), k);
    u.uLookSunInv.value = 1.6 / Math.max(0.05, sun.intensity * (0.2126 * sun.color.r + 0.7152 * sun.color.g + 0.0722 * sun.color.b));
    const fog = scene.fog as THREE.Fog;
    lookTone(fog.color.set(EVENING.horizon).lerp(_c.set(RAIN.horizon), k), lerp(EVENING.exposure, RAIN.exposure, k));
    (scene.background as THREE.Color).copy(fog.color);
    haze.uHazeColor.value.copy(fog.color).convertLinearToSRGB();
    this.overcast = k;
    this.skyInPuddles();
  }

  /** Мир только что поставил мокрому отражение (ясное при k ≤ 0,5) — ясное заменяем своим небом. */
  private skyInPuddles(): void {
    if (this.overcast > 0.5) return;
    for (const m of this.wetMats) m.envMap = this.env;
  }

  update(dt: number, t: number): void {
    this.decor.update(dt, t);
  }

  setQuality(_q: LobbyQuality): void {
    // уровни наполнения — на следующих шагах
  }

  /** «Рисованные» материалы мира: всё освещённое, кроме желеек (у них свой вид) и статуи со свечами. */
  private paintAll(): void {
    const { scene } = this.p;
    const tinted = new Set<THREE.Material>();
    // мокнущие материалы — у них то же отражение, что у плитки площади (у неё одной карта затенения)
    let clearEnv: THREE.Texture | null = null;
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!clearEnv && m && !Array.isArray(m) && m.isMeshStandardMaterial && m.aoMap && m.envMap) clearEnv = m.envMap;
    });
    for (const child of scene.children) {
      // статуя и свечи у неё — свои группы ровно в точке статуи
      if (Math.hypot(child.position.x - STATUE.x, child.position.z - STATUE.z) < 0.5) continue;
      let avatar = false;
      child.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        // желейки (тело — 'jelly-v…', веко — 'jelly-lid'): у них свой вид и своё лицо (lookface.ts)
        if (!avatar && m && !Array.isArray(m) && m.customProgramCacheKey().startsWith('jelly')) avatar = true;
      });
      if (avatar) continue;
      child.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!paintable(m)) continue;
          // настил площади (у него одного карта затенения) — светлее и теплее
          const std = m as THREE.MeshStandardMaterial;
          if (std.aoMap && !tinted.has(std)) {
            tinted.add(std);
            std.color.multiply(_c.setRGB(...DECK_TINT));
          }
          paintMaterial(m, this.paint);
          if (clearEnv && std.envMap === clearEnv && !this.wetMats.includes(std)) this.wetMats.push(std);
        }
      });
    }
    this.skyInPuddles();
  }
}
