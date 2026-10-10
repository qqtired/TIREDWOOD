// Мир «Набережная»: вечерний причал. На севере — павильон автоматов, Склад №3 (вход в пейнтбол) и гараж картинга,
// на востоке — кафе «Чайка» с террасой под гирляндами, у воды — ларёк-примерочная, на юго-западе — мостки к маяку.
// Вокруг бухты — город на холмах с огнями в окнах. Статика склеена по материалам; живое — табло, лампочки вывески,
// луч маяка, батуты, чайки и лодки. Погода — от сервера: изредка дождь с прогрессией (тучи, морось, дождь, иногда
// гроза с молниями в море, стихает, бывает радуга — см. setRain, weatherfx.ts, skyfx.ts); шторм маяка — та же погода.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { CANOPY_POLES, CANOPY_POLE_H, LAMP_FORT, MACHINE_FRONT_Z, PHOTO, STATUE_SHOWN, buildLobby, type LobbyMap } from '../../shared/maps/lobby.ts';
import type { Deco, MapBox } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Trampolines, addBox, buildDeco, buildGeo, glowSprite, glowTexture, paint, parts, place, quad, staticMesh, updateFloaters, type Floater, type GeoParts, type V3 } from '../render/kit.ts';
import { LOOK2 } from '../render/look.ts';
import type { Renderer } from '../render/renderer.ts';
import { EVENING, RAIN, blendFog, blendSky, fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import type { IsleSky } from './isle/sky.ts';
import * as tex from '../render/textures.ts';
import { Backdrop, skyHaze } from './backdrop.ts';
import { GateScreen, HonorBoard, JackpotBoard, RecentBoard } from './boards.ts';
import { BARKAS, barkasCover } from '../../shared/barkas.ts';
import { Barkas } from './barkas/index.ts';
import { Boats } from './boats.ts';
import { LobbyDecor, swayAttr, windSway } from './decor.ts';
import { KartStart } from './kartstart.ts';
import { LobbyLook } from './look.ts';
import { PLAZA2 } from './plaza/flag.ts';
import type { VenueCtx } from './plaza/venue.ts';
import type { RainWire, Strike } from '../../shared/weather.ts';
import { CoverMap, RainFx, hazy, wettable, type HazeUniforms, type WetUniforms } from './rain.ts';
import { SkyFx, type StrikeEvent } from './skyfx.ts';
import { Statue } from './statue.ts';
import { Tiredwood, signHill, signHillK } from './tiredwood.ts';
import { TokarevLighthouse } from './tokarev-lighthouse.ts';
import { WeatherState } from './weatherfx.ts';

export type LobbyQuality = 'high' | 'medium' | 'low';

/** Тёплый свет ламп накаливания */
const LAMP = 0xffb46a;
/** Ближняя плоскость камеры набережной, м (была 0,05): чем она дальше, тем точнее буфер глубины, тем реже борьба плоскостей издали */
const NEAR_PLANE = 0.15;
/** Точечные источники: павильон, ворота склада, терраса, ларёк (горят только на высоком качестве) */
const POINT_LIGHTS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-20, 3, -20, 30, 15],
  [0, 3, -14, 26, 13],
  [16, 3, 3, 30, 16],
  [-24, 2.6, -3, 18, 10],
];
const BEAM_LEN = 48;
/** Фотоаппарат на штативе: высота объектива, вспышка над ним (видна всем, кто смотрит в ту сторону) */
export const PHOTO_LENS_Y = 1.43;
const PHOTO_FLASH: V3 = [PHOTO.x - 0.07, 1.56, PHOTO.z + 0.06];
/** Разметка «встаньте сюда» перед маяком: рамка видоискателя на бетоне, м */
const PHOTO_MARK_W = 5.2;
const PHOTO_MARK_D = 2.6;
/** Ореол вывесок на стене: ширина, цвет, яркость */
const SIGN_HALO_M = 0.4;
const SIGN_HALO = 0xffe2b0;
const SIGN_HALO_K = 0.3;
/** Ореол лампочек «АВТОМАТЫ» поверх вывески: яркость в одну фазу бегущей рамки и в другую */
const BULB_SIGN_GLOW: readonly [number, number] = [0.2, 0.24];
/** Свеча на столике кафе: на столько от центра к югу (между стульями 0 и 5, у края столешницы радиусом 0,66) */
const CANDLE_R = 0.58;
/** Молния не бьёт ближе стольких метров к камере (игрок — в паре метров от неё): отодвигаем */
const STRIKE_NEAR = 28;
/**
 * Свет в ясную погоду и в дождь: небесный (сила, цвет неба, цвет земли), солнце (в дождь — за тучами: ни теней,
 * ни бликов на мокром), луч маяка (во влажном воздухе виднее)
 */
const HEMI_CLEAR: readonly [number, number, number] = [1.45, 0xc6d6ee, 0xa98a6c];
const HEMI_RAIN: readonly [number, number, number] = [1.5, 0xc9ced3, 0x8f8a82];
const SUN_CLEAR = 3.3;
const SUN_RAIN = 0;
/**
 * Туман набережной в ясную погоду (м): дальше, чем у вечерней палитры (у картинга он свой), — море до дальнего
 * берега остаётся морем, а не песочной полосой; у края моря (1500 м) уже сливается с горизонтом.
 */
const FOG_CLEAR: readonly [number, number] = [200, 1400];
const BEAM_CLEAR = 0.07;
const BEAM_RAIN = 0.16;

const _col = new THREE.Color();
const _right = new THREE.Vector3();

/** Часы погоды, с: событие дождя считается от них (вкладка в фоне — время всё равно идёт) */
const clockNow = (): number => performance.now() / 1000;

/** Поворот плоскости, чтобы она смотрела в сторону (fx, fz). */
function facing(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

/**
 * Край города. Площадь — x −30…30, z −26…22; город — к востоку и к северу от неё, а берег — на линиях её набережной:
 * к востоку от площади вода начинается за z = 22, к северу — за x = −30. Земля города кончается у внутренней грани
 * каменной стенки толщиной QUAY_T; стенка с бордюром — как у площади, только на уровне улицы (на 0,6 м ниже настила).
 */
const PLAZA_E = 30;
const PLAZA_N = -26;
const QUAY_Z = 22;
const QUAY_X = -30;
const QUAY_T = 0.6;
const STREET_Y = -0.6;
/** Дальние края земли города (дальше — туман) */
const TOWN_X1 = 1100;
const TOWN_Z0 = -1006;
/** Бордюр — как у площади */
const CURB = 0xcfc7b6;

/** Сколько метров от края города (от воды или от площади) вглубь; на площади и в море — меньше нуля. */
function landDepth(x: number, z: number): number {
  return Math.max(Math.min(x - PLAZA_E, QUAY_Z - z), Math.min(PLAZA_N - z, x - QUAY_X));
}

/** Высота земли города: у края — ровная улица, вглубь — холмы. Вне суши — ниже воды. */
function landY(x: number, z: number): number {
  const d = landDepth(x, z);
  if (d < 0) return -3.2;
  const ramp = Math.min(1, Math.max(0, (d - 150) / 350));
  // signHill — широкий подъём за надписью TIREDWOOD (tiredwood.ts): за буквами зелёная гора, а не небо
  const hill = Math.max(0, d - 70) * 0.1 + 34 * Math.sin(x * 0.006 + 0.4) * Math.cos(z * 0.0045 - 0.3) * ramp + signHill(x, z);
  const wob = 5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 - 0.7) * Math.min(1, Math.max(0, (d - 60) / 120));
  return STREET_Y + Math.max(0, hill + wob);
}

/** Рамка теневой камеры направленного света точно по коробке мира. */
function fitShadow(light: THREE.DirectionalLight, target: THREE.Vector3, box: THREE.Box3): void {
  const m = new THREE.Matrix4().lookAt(light.position, target, new THREE.Vector3(0, 1, 0));
  m.setPosition(light.position);
  m.invert();
  const v = new THREE.Vector3();
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(m);
    lo.min(v);
    hi.max(v);
  }
  const c = light.shadow.camera;
  c.left = lo.x - 1;
  c.right = hi.x + 1;
  c.bottom = lo.y - 1;
  c.top = hi.y + 1;
  c.near = Math.max(0.5, -hi.z - 2);
  c.far = -lo.z + 2;
  c.updateProjectionMatrix();
}

/** Луч маяка: светлый конус, гаснущий к концу и по краям (аддитивно, без тумана). Солнце ещё не село — луч едва заметен. */
function beamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color(0xfff0c8) }, uLen: { value: BEAM_LEN }, uStrength: { value: BEAM_CLEAR } },
    vertexShader: /* glsl */ `
      uniform float uLen;
      varying float vT;
      varying float vFace;
      void main() {
        vT = clamp(position.x / uLen, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vT;
      varying float vFace;
      void main() {
        float a = pow(1.0 - vT, 1.7) * pow(vFace, 1.4) * uStrength;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

export class LobbyWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  /** Ближняя плоскость 0,15 м (камера не подходит к стене ближе CAM_PAD = 0,2 м): глубина точнее втрое, чем при 0,05, и накладки не моргают издали */
  readonly camera = new THREE.PerspectiveCamera(60, 16 / 9, NEAR_PLANE, 1600);
  readonly map: LobbyMap = buildLobby();
  readonly collision: CollisionWorld;
  /** Середина передней грани автомата у пола; модель строится назад, по −z */
  readonly machineAnchors: THREE.Object3D[] = [];
  readonly gateScreen = new GateScreen(6, 2.2);
  /** Круг «Старт» перед гаражом, число отсчёта и табло картинга */
  readonly kartStart = new KartStart();
  readonly honorBoard = new HonorBoard(3.7, 2.4);
  /** Обратная сторона доски почёта */
  readonly recentBoard = new RecentBoard(3.7, 2.4);
  readonly jackpotBoard = new JackpotBoard(6.4, 1.3);
  private readonly sun = new THREE.DirectionalLight(0xffc48a, SUN_CLEAR);
  private readonly hemi = new THREE.HemisphereLight(HEMI_CLEAR[1], HEMI_CLEAR[2], HEMI_CLEAR[0]);
  private readonly lamps: THREE.PointLight[] = [];
  private readonly powered: THREE.Object3D[] = [];
  private readonly poweredSigns = new Map<THREE.MeshStandardMaterial, number>();
  private readonly windowGlow: THREE.BufferGeometry[] = [];
  private lampQuality: LobbyQuality = 'high';
  private lighthouseEnabled = true;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly sea: THREE.Mesh;
  /** Погода острова «Последний свет» поверх погоды набережной (client/lobby/isle/sky.ts, флаг ISLE); null — острова нет */
  private isleSky: IsleSky | null = null;
  private readonly floaters: Floater[] = [];
  private readonly trampolines: Trampolines;
  /** Катер у причала и лодка, что иногда проходит по заливу */
  readonly boats: Boats;
  /** Баркас «Альбатрос» в море и лодка Семёна «Удалая» */
  readonly barkas: Barkas;
  /** Дальний берег с горами и посёлками, острова, парусники */
  private readonly backdrop: Backdrop;
  private readonly statue: Statue | null;
  /** Луч маяка вращается вокруг фонаря; вспышка ярче, когда луч смотрит на камеру */
  readonly lighthouse = new TokarevLighthouse();
  private readonly beam = new THREE.Group();
  private readonly beamMat = beamMaterial();
  private readonly beamFlash = glowSprite(0xffe6b0, 7, 0.5);
  /** Бегущая рамка вывески: две фазы по очереди */
  private readonly chase: THREE.Mesh[] = [];
  /** Ореол лампочек вывески «АВТОМАТЫ»: дышит в такт бегущей рамке */
  private signGlow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private readonly mastLight = glowSprite(0xff3a2a, 9, 0.9);
  /** Вспышка фотоаппарата у маяка */
  private readonly photoGlow = glowSprite(0xffffff, 3.2, 0);
  /** Боксы по материалам, мелкие детали и всё светящееся — склеиваются в конце конструктора */
  private readonly batch: Record<string, GeoParts> = {};
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly glow: THREE.BufferGeometry[] = [];
  private readonly rng = makeRng(14);
  private readonly tmp = new THREE.Vector3();
  /** Время ветра для крон и флажков */
  private readonly wind = { value: 0 };
  /** Погода: on — идёт ли дождь (так сказал сервер); тучи, дождь, сумрак, ветер, мокрота (0…1) — по событию и плавно */
  readonly weather = new WeatherState();
  /** Молнии, вспышка и радуга */
  readonly sky: SkyFx;
  private readonly strikeFns = new Set<(e: StrikeEvent) => void>();
  private exposure = EVENING.exposure;
  /** Где укрыто от дождя */
  private readonly cover: CoverMap;
  private readonly rainFx: RainFx;
  /** Мокнущие материалы (плитка, доски, бетон, стены) и их общая мокрота */
  private readonly wet: WetUniforms;
  private readonly wetMats: THREE.MeshStandardMaterial[] = [];
  /** Отражение неба в мокром: ясное и дождливое — меняются на середине перехода */
  private readonly envClear: THREE.Texture;
  private readonly envRain: THREE.Texture;
  /** Дымка на дальнем городе и берегу в дождь */
  private readonly haze: HazeUniforms = { uHaze: { value: 0 }, uHazeColor: { value: new THREE.Color() } };
  /** Новый вид (look v2, client/lobby/look.ts) — только при ?look=2 или DEFAULT_LOOK = 2; иначе null и кадр как раньше */
  private readonly look: LobbyLook | null;
  time = 0;

  constructor(renderer: Renderer, quality: LobbyQuality) {
    this.renderer = renderer;
    this.collision = new CollisionWorld(this.map);
    const scene = this.scene;
    const fog = fogColor(EVENING);
    scene.fog = new THREE.Fog(fog, FOG_CLEAR[0], FOG_CLEAR[1]);
    scene.background = fog.clone();

    // --- дождь: где от него укрыто и как в мокром отражается небо (ясное и дождливое)
    // до баркаса «Альбатрос» (−60; 68): на его палубе тоже мокро, под крышей рубки и тентом — сухо
    // до баркаса включительно (он далеко в море — карта укрытий длиннее на юг)
    this.cover = new CoverMap([...this.map.boxes, ...barkasCover()], Math.floor(BARKAS.bow) - 2, -26, 30, Math.ceil(BARKAS.z + BARKAS.half) + 3);
    this.wet = { uWet: { value: 0 }, uCover: { value: this.cover.texture }, uCoverBox: { value: this.cover.box } };
    const pmrem = new THREE.PMREMGenerator(renderer.gl);
    const env = (p: SkyPalette): THREE.Texture => {
      const sky = makeSky(p);
      const t = pmrem.fromScene(new THREE.Scene().add(sky), 0, 0.1, 100, { size: 128 }).texture;
      sky.geometry.dispose();
      sky.material.dispose();
      return t;
    };
    this.envClear = env(EVENING);
    this.envRain = env(RAIN);
    pmrem.dispose();

    // --- свет: голубое небо даёт светлые тени (совсем чёрных нет), тёплое низкое солнце, лампы
    scene.add(this.hemi);
    // Солнце ~12° над морем; ниже 11° для теней не опускаем, иначе тени ложатся через всю площадь
    const toSun = new THREE.Vector3(EVENING.sunDir.x, Math.max(EVENING.sunDir.y, 0.2), EVENING.sunDir.z).normalize();
    const center = new THREE.Vector3(0, 4, 10);
    this.sun.position.copy(center).addScaledVector(toSun, 160);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    // до z 65 — с пирсом до конца и домом рыбака (shared/fishplaces.ts — FISH_PIER_HEAD)
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-31, -1, -27), new THREE.Vector3(31, 15, 65)));
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    for (const [x, y, z, power, dist] of POINT_LIGHTS) {
      const l = new THREE.PointLight(LAMP, power, dist, 2);
      l.position.set(x, y, z);
      scene.add(l);
      this.lamps.push(l);
    }

    // --- небо и море
    const sky = makeSky(EVENING);
    this.skyMat = sky.material;
    scene.add(sky);
    const sea = makeSea(EVENING);
    this.seaMat = sea.material;
    this.sea = sea;
    scene.add(sea);

    this.buildMapBoxes();
    this.buildQuay();
    this.buildArcade();
    this.buildWarehouse();
    this.buildGarage();
    this.buildKiosk();
    this.buildCafe();
    this.buildTerrace();
    this.buildBenches();
    this.buildHonorStand();
    this.buildLighthouse();
    this.buildPhotoSpot();
    this.buildGarlands();
    this.buildLightPools();
    this.buildTownQuay();
    this.flush();
    new LobbyDecor(scene, this.wind, (m) => this.wettable(m));
    this.buildTown();
    this.backdrop = new Backdrop(scene, (m, glow) => this.far(m, glow));
    this.buildFarShore();

    const pilings: Deco[] = [];
    for (const x of [-20.7, -17.3]) for (let z = 24; z <= 36; z += 4) pilings.push({ kind: 'piling', x, z });
    const beforeDeco = scene.children.length;
    buildDeco(scene, [...this.map.deco, ...pilings], this.floaters);
    // Only the just-built local lamp bulbs: never the memorial or distant building windows.
    for (const o of scene.children.slice(beforeDeco)) if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) this.powered.push(o);
    // батуты на площади: красный, жёлтый и синий обод на зелёной резиновой подложке
    this.trampolines = new Trampolines(scene, this.map.trampolines, { rims: [0xe5483b, 0xf2b330, 0x3f86c9], pads: [0x4a9466], wet: (m) => this.wettable(m) });
    this.boats = new Boats(scene, (m) => this.wettable(m));
    this.barkas = new Barkas(scene, (m) => this.wettable(m), this.wind);
    // фигура грузится фоном: когда появится, тени статики пересчитываются; памятник скрыт — не грузим вовсе
    this.statue = STATUE_SHOWN ? new Statue(scene, () => renderer.refreshShadows()) : null;
    const bulbs: V3[] = [];
    for (const d of this.map.deco) if (d.kind === 'lamp') bulbs.push([d.x - Math.sin(d.yaw) * 1.2, 4.88, d.z - Math.cos(d.yaw) * 1.2]);
    this.rainFx = new RainFx(scene, this.cover, this.skyMat, bulbs);
    this.sky = new SkyFx(scene);
    this.look = LOOK2
      ? new LobbyLook({ scene, renderer, sun: this.sun, hemi: this.hemi, sky: this.skyMat, sea: this.seaMat, haze: this.haze, wind: this.wind, wet: (m) => this.wettable(m), map: this.map }, quality)
      : null;
    this.setQuality(quality);
  }

  /** Что мир даёт оформлению площади (client/lobby/plaza): ветер, мокрота в дождь, огни, которые гаснут вместе со светом. */
  get plazaCtx(): VenueCtx {
    return { scene: this.scene, wind: this.wind, wet: (m) => this.wettable(m), signs: this.poweredSigns, powered: this.powered };
  }

  // ------------------------------------------------------------ общие помощники

  private box(key: string, min: V3, max: V3, color: number, groundY = 0.01): void {
    addBox((this.batch[key] ??= parts()), { min, max, color }, key, this.rng, groundY);
  }

  private solidBox(w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0, rx = 0): void {
    this.solid.push(place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, rx));
  }

  private cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number, seg = 10): void {
    this.solid.push(place(paint(new THREE.CylinderGeometry(rTop, rBot, h, seg), color), x, y, z));
  }

  private bulb(r: number, x: number, y: number, z: number, color: number): void {
    this.glow.push(place(paint(new THREE.SphereGeometry(r, 10, 8), color), x, y, z));
  }

  /** Материал мокнет в дождь (см. wettable). */
  private wettable<T extends THREE.MeshStandardMaterial>(m: T): T {
    wettable(m, this.wet, this.envClear);
    this.wetMats.push(m);
    return m;
  }

  /** Далёкий материал тонет в дымке в дождь (см. hazy); glow — огни: тускнеют. */
  private far<T extends THREE.Material>(m: T, glow = false): T {
    hazy(m, this.haze, glow);
    return m;
  }

  private addGlow(color: number, size: number, x: number, y: number, z: number, opacity = 0.5): void {
    const s = glowSprite(color, size, opacity);
    s.position.set(x, y, z);
    this.scene.add(s);
    this.powered.push(s);
  }

  /** Светящееся окно с рамой и переплётом. (x, y, z) — центр стекла, ry — куда смотрит (0 → +Z). */
  private window(x: number, y: number, z: number, ry: number, w: number, h: number, light: number, frame = 0x3a2c22): void {
    this.windowGlow.push(place(paint(new THREE.PlaneGeometry(w, h), light), x, y, z, ry));
    const t = 0.07;
    const d = 0.06;
    // в координатах окна: x — вдоль стены, y — вверх, z — наружу
    const bar = (bw: number, bh: number, lx: number, ly: number) => {
      const g = paint(new THREE.BoxGeometry(bw, bh, d), frame);
      g.translate(lx, ly, d / 2);
      this.solid.push(place(g, x, y, z, ry));
    };
    bar(w + t * 2, t, 0, h / 2 + t / 2);
    bar(w + t * 2, t, 0, -h / 2 - t / 2);
    bar(t, h, -w / 2 - t / 2, 0);
    bar(t, h, w / 2 + t / 2, 0);
    bar(t * 0.6, h, 0, 0);
  }

  /**
   * Крашеная вывеска: слегка подсвечена (над ней лампа или закат), чтобы читалась в сумерках.
   * halo — вывеска светится: мягкий ореол на стене вокруг неё.
   */
  private sign(map: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number, glow = 0.32, halo = false): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.75 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = ry;
    this.scene.add(m);
    this.poweredSigns.set(m.material, glow);
    if (halo) {
      // между стеной и вывеской: середину ореола закрывает сама вывеска
      const g = this.glowCard(w, h, SIGN_HALO_M, SIGN_HALO, SIGN_HALO_K);
      g.position.set(x - Math.sin(ry) * 0.015, y, z - Math.cos(ry) * 0.015);
      g.rotation.y = ry;
    }
    return m;
  }

  /** Мягкий ореол вокруг прямоугольника w × h шириной margin: аддитивная плоскость, смотрит по +Z. */
  private glowCard(w: number, h: number, margin: number, color: number, opacity: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w + margin * 2, h + margin * 2),
      new THREE.MeshBasicMaterial({
        map: tex.glowCardTexture(w, h, margin), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
      }),
    );
    this.scene.add(m);
    this.powered.push(m);
    return m;
  }

  /**
   * Матерчатый навес над окном: полосы, наклон наружу от стены.
   * (x, y, z) — середина верхнего края у стены; yaw — куда смотрит стена (как взгляд: 0 → −Z).
   */
  private awning(x: number, y: number, z: number, yaw: number, width: number, depth: number, colors: readonly [number, number]): void {
    const n = Math.max(2, Math.round(width / 0.36));
    const w = width / n;
    const tilt = 0.4;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(w, 0.02, depth);
      g.translate(-width / 2 + (i + 0.5) * w, 0, -depth / 2);
      g.rotateX(-tilt);
      this.solid.push(place(paint(g, colors[i % 2]), x, y, z, yaw));
      // оборка по краю
      const f = new THREE.BoxGeometry(w, 0.22, 0.02);
      f.translate(-width / 2 + (i + 0.5) * w, -Math.sin(tilt) * depth - 0.11, -Math.cos(tilt) * depth);
      this.solid.push(place(paint(f, colors[i % 2]), x, y, z, yaw));
    }
  }

  /** Тёплое пятно света на полу (аддитивная наклейка). */
  private decal(x: number, z: number, w: number, d: number, color: number, opacity: number): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }),
    );
    m.position.set(x, 0.012, z);
    m.renderOrder = 2;
    this.scene.add(m);
    this.powered.push(m);
  }

  /** Плоская накладка на настил (ковёр, доски террасы). */
  private overlay(map: THREE.Texture, color: number, x0: number, z0: number, x1: number, z1: number, metersPerRepeat: number): void {
    map.repeat.set((x1 - x0) / metersPerRepeat, (z1 - z0) / metersPerRepeat);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2),
      this.wettable(new THREE.MeshStandardMaterial({ map, color, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })),
    );
    m.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.scene.add(m);
  }

  // ------------------------------------------------------------ карта

  /** Боксы карты. Автоматы, столики и маяк строятся отдельно (модели, круглые столы, башня). */
  private buildMapBoxes(): void {
    const { map } = this;
    const lh = map.lighthouse;
    let deck: MapBox | null = null;
    for (const b of map.boxes) {
      if (b.mat === 'invisible' || b.mat === 'tramp' || b.mat === 'metal') continue;
      if (b.mat === 'deck') {
        deck = b;
        continue;
      }
      const cx = (b.min[0] + b.max[0]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if (b.max[1] < 1 && map.tables.some((t) => Math.abs(t.x - cx) < 0.01 && Math.abs(t.z - cz) < 0.01)) continue;
      if (b.min[1] >= 0 && b.min[0] < lh.x && b.max[0] > lh.x && b.min[2] < lh.z && b.max[2] > lh.z) continue;
      // ящики — своя текстура с рамкой, остальное деревянное — доски
      const key = b.mat === 'wood' ? (b.variant !== undefined ? 'wood' : 'plank') : b.mat;
      this.box(key, b.min, b.max, b.color);
    }
    if (!deck) return;

    // Настил: отдельный меш со второй развёрткой для карты мягких теней
    const p = parts();
    addBox(p, deck, 'deck', this.rng, -10);
    const g = buildGeo(p);
    const [x0, , z0] = deck.min;
    const [x1, , z1] = deck.max;
    const pos = g.getAttribute('position');
    const uv1 = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv1[i * 2] = (pos.getX(i) - x0) / (x1 - x0);
      uv1[i * 2 + 1] = (pos.getZ(i) - z0) / (z1 - z0);
    }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    const resting = map.boxes.filter((b) => {
      if (b.mat === 'deck' || b.min[1] > 0.3 || b.max[1] - b.min[1] > 20) return false;
      if (b.mat === 'invisible' && b.max[0] - b.min[0] < 0.5) return false;
      return true;
    });
    const ao = tex.deckAO(resting, x0, x1, z0, z1, 6);
    ao.channel = 1;
    const m = this.wettable(new THREE.MeshStandardMaterial({ map: tex.paverTexture(), aoMap: ao, aoMapIntensity: 1, vertexColors: true, roughness: 0.93, metalness: 0 }));
    this.scene.add(staticMesh(g, m, true));
  }

  /** Каменная стенка под краем набережной и основание площадки маяка — до воды и ниже. */
  private buildQuay(): void {
    const stone = 0x7d776e;
    this.box('concrete', [-30, -3.2, -26], [-29.4, -0.6, 22], stone, -10);
    this.box('concrete', [-29.4, -3.2, 21.4], [30, -0.6, 22], stone, -10);
    this.box('concrete', [-24, -3.2, 38], [-14, -0.6, 46], stone, -10);
  }

  /**
   * Берег города продолжает набережную площади по тем же линиям — на восток вдоль z = 22, на север вдоль x = −30:
   * каменная стенка до воды, бордюр и кнехты, только на уровне улицы. Строится последним из боксов: иначе сдвинулись
   * бы случайные оттенки всех боксов после него (у них общий rng).
   */
  private buildTownQuay(): void {
    const stone = 0x7d776e;
    this.box('concrete', [PLAZA_E, -3.2, QUAY_Z - QUAY_T], [TOWN_X1, STREET_Y, QUAY_Z], stone, -10);
    this.box('concrete', [QUAY_X, -3.2, TOWN_Z0], [QUAY_X + QUAY_T, STREET_Y, PLAZA_N], stone, -10);
    this.box('concrete', [PLAZA_E, STREET_Y, QUAY_Z - 0.3], [TOWN_X1, STREET_Y + 0.22, QUAY_Z], CURB);
    this.box('concrete', [QUAY_X, STREET_Y, TOWN_Z0], [QUAY_X + 0.3, STREET_Y + 0.22, PLAZA_N], CURB);
    // кнехты — те же, что на площади (kit.ts), через 8 м, пока их можно разглядеть
    const bollard = (x: number, z: number) => {
      this.cyl(0.19, 0.23, 0.46, x, STREET_Y + 0.23, z, 0x3b3f45, 14);
      this.cyl(0.27, 0.27, 0.08, x, STREET_Y + 0.5, z, 0x34373c, 14);
    };
    for (let x = PLAZA_E + 4; x < 200; x += 8) bollard(x, QUAY_Z - 0.8);
    for (let z = PLAZA_N - 8; z > -120; z -= 8) bollard(QUAY_X + 0.8, z);
  }

  // ------------------------------------------------------------ здания

  /** Павильон автоматов: ковёр, подвесные лампы, табло джекпота на задней стене, вывеска из лампочек на крыше. */
  private buildArcade(): void {
    this.overlay(tex.carpetTexture(), 0xffffff, -27.4, -25.4, -12.6, -15.7, 1.6);
    // карниз крыши
    this.box('plank', [-28.1, 4.45, -16.15], [-11.9, 5.15, -15.85], 0x4a3022);
    // лампы под крышей над проходом
    for (const x of [-24.5, -20, -15.5]) {
      this.cyl(0.012, 0.012, 0.6, x, 4.3, -21.4, 0x222222, 4);
      this.solid.push(place(paint(new THREE.ConeGeometry(0.32, 0.26, 14, 1, true), 0x2f4a3a), x, 3.88, -21.4));
      this.bulb(0.08, x, 3.74, -21.4, 0xffe2a8);
      this.addGlow(0xffc27a, 1.5, x, 3.7, -21.4, 0.55);
    }
    // якоря автоматов: сами модели строит slots3d
    for (const m of this.map.machines) {
      const a = new THREE.Object3D();
      a.position.set(m.x, 0, MACHINE_FRONT_Z);
      this.scene.add(a);
      this.machineAnchors.push(a);
    }
    // табло джекпота в рамке над автоматами
    this.solidBox(6.7, 1.6, 0.08, -20, 3.5, -25.36, 0x3a2418);
    this.jackpotBoard.mesh.position.set(-20, 3.5, -25.31);
    this.scene.add(this.jackpotBoard.mesh);
    // вывеска «АВТОМАТЫ» на краю крыши: панель на стойках, буквы и рамка из ламп
    this.solidBox(10.7, 2.1, 0.16, -20, 6.2, -16.0, 0x3c1410);
    for (const x of [-24.6, -15.4]) this.solidBox(0.12, 2.2, 0.12, x, 6.1, -16.3, 0x2a2a2a);
    const bs = tex.bulbSignTextures('АВТОМАТЫ', 1024, 192);
    const plane = (t: THREE.Texture, z: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 1.95), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
      m.position.set(-20, 6.2, z);
      this.scene.add(m);
      return m;
    };
    this.powered.push(plane(bs.letters, -15.9));
    this.chase.push(plane(bs.chaseA, -15.895), plane(bs.chaseB, -15.895));
    // лампочки подсвечивают тёмную панель и воздух вокруг — ореол поверх букв
    this.signGlow = this.glowCard(10.4, 1.95, 1.1, 0xffb866, BULB_SIGN_GLOW[0]);
    this.signGlow.position.set(-20, 6.2, -15.885);
    this.signGlow.renderOrder = 4;
  }

  /** Склад №3: открытые сдвижные ворота, свет из глубины, экран над воротами, вывеска, окна второго света. */
  private buildWarehouse(): void {
    // парапет по краю крыши
    const pc = 0x6e4034;
    this.box('brick', [-9, 9, -26], [9, 9.6, -25.6], pc);
    this.box('brick', [-9, 9, -16.4], [9, 9.6, -16], pc);
    this.box('brick', [-9, 9, -25.6], [-8.6, 9.6, -16.4], pc);
    this.box('brick', [8.6, 9, -25.6], [9, 9.6, -16.4], pc);
    // окна второго света
    for (const x of [-7.5, -4.5, 4.5, 7.5]) {
      this.window(x, 6.9, -15.97, 0, 1.5, 1.9, 0x8a5a32, 0x2c2420);
      this.box('concrete', [x - 0.95, 5.8, -16.08], [x + 0.95, 5.92, -15.84], 0xb9b0a0);
    }
    // свет в глубине ниши
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshBasicMaterial({ map: tex.gateGlowTexture(), toneMapped: false }));
    glow.position.set(0, 2.25, -17.97);
    this.scene.add(glow);
    // рама проёма, створки отъехали в стороны, рельс над ними
    const steel = 0x3b4046;
    this.solidBox(0.25, 4.5, 0.3, -3.08, 2.25, -16.05, steel);
    this.solidBox(0.25, 4.5, 0.3, 3.08, 2.25, -16.05, steel);
    this.solidBox(6.4, 0.25, 0.3, 0, 4.42, -16.05, steel);
    this.box('roof', [-6.3, 0, -16.0], [-3.25, 4.35, -15.92], 0x56656e);
    this.box('roof', [3.25, 0, -16.0], [6.3, 4.35, -15.92], 0x56656e);
    this.solidBox(13, 0.14, 0.16, 0, 4.62, -15.9, steel);
    // экран в раме над воротами
    this.solidBox(6.3, 2.5, 0.12, 0, 6.05, -15.98, 0x161616);
    this.gateScreen.mesh.position.set(0, 6.05, -15.91);
    this.scene.add(this.gateScreen.mesh);
    // вывеска и две лампы над ней (при новом оформлении площади над воротами — вывеска «ПЕЙНТБОЛ», client/lobby/plaza/north.ts)
    if (PLAZA2) return;
    this.sign(tex.signTexture('СКЛАД №3', '#33465c', '#f4efe6'), 5.2, 1.3, 0, 8.05, -15.95, 0, 0.5, true);
    for (const x of [-1.6, 1.6]) {
      this.solidBox(0.05, 0.05, 0.5, x, 8.95, -15.75, 0x2a2a2a);
      this.solid.push(place(paint(new THREE.ConeGeometry(0.16, 0.16, 10, 1, true), 0x2a3a30), x, 8.88, -15.5));
      this.addGlow(0xffc27a, 1.2, x, 8.8, -15.5, 0.45);
    }
  }

  /** Гараж картинга: рулонная дверь, короб и направляющие, табличка «КАРТИНГ», боковая дверь с лампой, круг «Старт» и табло. */
  private buildGarage(): void {
    const pc = 0x86503f;
    this.box('brick', [13, 6, -26], [28, 6.45, -25.6], pc);
    this.box('brick', [13, 6, -16.4], [28, 6.45, -16], pc);
    this.box('brick', [13, 6, -25.6], [13.4, 6.45, -16.4], pc);
    this.box('brick', [27.6, 6, -25.6], [28, 6.45, -16.4], pc);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.2), new THREE.MeshStandardMaterial({ map: tex.rollerDoorTexture(), roughness: 0.6, metalness: 0.3 }));
    door.position.set(20.5, 2.1, -15.97);
    door.receiveShadow = true;
    this.scene.add(door);
    const steel = 0x50565a;
    this.solidBox(0.16, 4.3, 0.14, 16.92, 2.15, -15.93, steel);
    this.solidBox(0.16, 4.3, 0.14, 24.08, 2.15, -15.93, steel);
    this.solidBox(7.5, 0.55, 0.4, 20.5, 4.48, -15.8, 0x666c70);
    // при новом оформлении площади над гаражом — неоновая вывеска «КАРТИНГ» (client/lobby/plaza/north.ts), табличка не нужна
    if (!PLAZA2) this.sign(tex.kartSignTexture(), 6.2, 1.03, 20.5, 5.38, -15.95, 0, 0.35);
    // боковая дверь и лампа над ней
    this.solidBox(1.0, 2.1, 0.06, 14.9, 1.05, -15.97, 0x2f4a3f);
    this.solidBox(0.08, 0.08, 0.08, 15.25, 1.0, -15.92, 0xb0a070);
    this.solidBox(0.3, 0.12, 0.3, 14.9, 2.45, -15.85, 0x2a2a2a);
    this.bulb(0.07, 14.9, 2.36, -15.8, 0xffe2a8);
    this.addGlow(0xffc27a, 1.3, 14.9, 2.33, -15.75, 0.5);
    this.scene.add(this.kartStart.group);
  }

  /** Ларёк «Примерочная»: козырёк, вывеска, окошко с прилавком и маркизой, ростовое зеркало на восточной стене. */
  private buildKiosk(): void {
    const fx = -25.5;
    const east = facing(1, 0);
    this.box('plank', [-29.8, 3.2, -6.35], [-25.15, 3.42, 0.35], 0x2c4152);
    this.sign(tex.signTexture('ПРИМЕРОЧНАЯ', '#f3e7cf', '#2f5f80', 1024, 112), 5.4, 0.59, fx + 0.03, 2.82, -3, east, 0.5, true);
    this.window(fx + 0.02, 1.68, -4.3, east, 2.1, 1.05, 0xd9a66a, 0x23384a);
    this.box('plank', [fx, 1.06, -5.45], [fx + 0.36, 1.13, -3.15], 0xc8a070);
    this.awning(fx, 2.45, -4.3, -Math.PI / 2, 2.6, 0.95, [0x2f6a8f, 0xf2ece0]);
    // зеркало: рама и «стекло» с бликами, отражает только закат
    const { mirror } = this.map;
    this.solidBox(0.08, 2.08, 1.02, fx + 0.04, 1.12, mirror.z, 0xa8823a);
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 1.9),
      new THREE.MeshStandardMaterial({ map: tex.mirrorTexture(), metalness: 0.6, roughness: 0.12, envMap: tex.metalEnvTexture(), envMapIntensity: 0.8 }),
    );
    glass.position.set(fx + 0.085, 1.12, mirror.z);
    glass.rotation.y = east;
    this.scene.add(glass);
  }

  /** Кафе «Чайка»: двускатная крыша, окно раздачи с прилавком и маркизой, дверь, вывеска. */
  private buildCafe(): void {
    const x0 = 23.5;
    const x1 = 30.5;
    const xm = 27;
    const z0 = -10.5;
    const z1 = 4.5;
    const ye = 3.95;
    const yr = 5.5;
    const tiles = (this.batch.tiles ??= parts());
    const col = new THREE.Color(0x9a4a36);
    const cols = [col, col, col, col];
    const len = Math.hypot(xm - x0, yr - ye);
    const nW: V3 = [-(yr - ye) / len, (xm - x0) / len, 0];
    const nE: V3 = [(yr - ye) / len, (xm - x0) / len, 0];
    const u0 = z0 / 2.44;
    const u1 = z1 / 2.44;
    const v1 = len / 2.6;
    quad(tiles, [x0, ye, z0], [x0, ye, z1], [xm, yr, z1], [xm, yr, z0], nW, [u0, 0, u1, 0, u1, v1, u0, v1], cols);
    quad(tiles, [x1, ye, z1], [x1, ye, z0], [xm, yr, z0], [xm, yr, z1], nE, [u1, 0, u0, 0, u0, v1, u1, v1], cols);
    // фронтоны — те же доски, что и стены
    const planks = (this.batch.plank ??= parts());
    const cream = new THREE.Color(0xe2d6be);
    const c4 = [cream, cream, cream, cream];
    quad(planks, [24, 4, 4], [30, 4, 4], [27, 5.5, 4], [27, 5.5, 4], [0, 0, 1], [12, 2, 15, 2, 13.5, 2.75, 13.5, 2.75], c4);
    quad(planks, [30, 4, -10], [24, 4, -10], [27, 5.5, -10], [27, 5.5, -10], [0, 0, -1], [15, 2, 12, 2, 13.5, 2.75, 13.5, 2.75], c4);
    // доски под свесом крыши
    this.box('plank', [x0, ye - 0.22, z0], [x0 + 0.12, ye, z1], 0x6a4430);
    this.box('plank', [x1 - 0.12, ye - 0.22, z0], [x1, ye, z1], 0x6a4430);

    const west = facing(-1, 0);
    this.window(23.98, 1.72, -3.5, west, 4.8, 1.15, 0xe0aa68, 0x2a4a5a);
    this.box('plank', [23.6, 1.06, -6.0], [24, 1.13, -1.0], 0xc8a070);
    this.awning(24, 2.62, -3.5, Math.PI / 2, 5.6, 1.0, [0xb83a2e, 0xf2ece0]);
    this.solidBox(0.06, 2.15, 1.1, 23.98, 1.075, 2.2, 0x2a5a5a);
    this.glow.push(place(paint(new THREE.PlaneGeometry(0.5, 0.7), 0xd09a5a), 23.94, 1.55, 2.2, west));
    this.sign(tex.cafeSignTexture(), 6.3, 0.9, 23.96, 3.32, -3.5, west, 0.45, true);
  }

  /** Терраса: доски, круглые столики со свечами, стулья у каждого места, столбы навеса. */
  private buildTerrace(): void {
    const t = this.map.zones.terrace;
    this.overlay(tex.plankTexture(), 0xa0704a, t.x0, t.z0, t.x1, t.z1, 2);
    for (const tb of this.map.tables) {
      this.cyl(0.66, 0.66, 0.05, tb.x, 0.75, tb.z, 0x8a5a36, 28);
      this.cyl(0.05, 0.05, 0.72, tb.x, 0.37, tb.z, 0x2e2e30, 8);
      this.cyl(0.3, 0.32, 0.03, tb.x, 0.015, tb.z, 0x2e2e30, 18);
      // свеча в баночке — у самого края, между двумя стульями: середина стола для карт
      this.bulb(0.05, tb.x, 0.82, tb.z + CANDLE_R, 0xffb060);
      this.addGlow(0xffa040, 0.6, tb.x, 0.86, tb.z + CANDLE_R, 0.55);
    }
    for (const it of this.map.interact) if (it.kind === 'durak') this.chair(it.x, it.z, it.yaw);
    for (const [x, z] of CANOPY_POLES) {
      this.cyl(0.07, 0.08, CANOPY_POLE_H, x, CANOPY_POLE_H / 2, z, 0x3a2a20, 8);
      this.cyl(0.1, 0.1, 0.08, x, CANOPY_POLE_H + 0.04, z, 0x2a2a2a, 8);
    }
  }

  /**
   * Стул: сиденье на высоте 0,3 (столько же поднимается сидящая желейка), спинка позади — внутри тела сидящего.
   * yaw — куда смотрит сидящий (0 → −Z).
   */
  private chair(x: number, z: number, yaw: number): void {
    const wood = 0x9a6a3e;
    const iron = 0x2b3a32;
    const local: Array<[THREE.BufferGeometry, number, number, number]> = [
      [new THREE.BoxGeometry(0.5, 0.05, 0.5), 0, 0.275, 0.1],
      [new THREE.BoxGeometry(0.46, 0.2, 0.03), 0, 0.72, 0.37],
    ];
    for (const sx of [-0.21, 0.21]) {
      local.push([new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), sx, 0.125, -0.12]);
      local.push([new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6), sx, 0.425, 0.36]);
    }
    local.forEach(([g, lx, ly, lz], i) => {
      g.translate(lx, ly, lz);
      this.solid.push(place(paint(g, i < 2 ? wood : iron), x, 0, z, yaw));
    });
  }

  /** Скамейки у воды: сидящие смотрят на море, спинка позади. */
  private buildBenches(): void {
    const wood = 0x8a5a34;
    const iron = 0x2a2c2e;
    for (const bn of this.map.benches) {
      const local: Array<[THREE.BufferGeometry, number, number, number, number]> = [];
      for (let k = 0; k < 4; k++) local.push([new THREE.BoxGeometry(2.0, 0.04, 0.13), 0, 0.28, -0.2 + k * 0.16, wood]);
      for (const y of [0.5, 0.7]) local.push([new THREE.BoxGeometry(2.0, 0.12, 0.035), 0, y, 0.41, wood]);
      for (const sx of [-0.88, 0.88]) {
        local.push([new THREE.BoxGeometry(0.06, 0.26, 0.06), sx, 0.13, -0.2, iron]);
        local.push([new THREE.BoxGeometry(0.06, 0.82, 0.06), sx, 0.41, 0.42, iron]);
        local.push([new THREE.BoxGeometry(0.06, 0.05, 0.68), sx, 0.24, 0.1, iron]);
      }
      for (const [g, lx, ly, lz, c] of local) {
        g.translate(lx, ly, lz);
        this.solid.push(place(paint(g, c), bn.x, 0, bn.z, bn.yaw));
      }
    }
  }

  /** Доска почёта: козырёк, листы-списки с двух сторон (сзади — «Последние входы»), по две лампы-«гусёнка». */
  private buildHonorStand(): void {
    const hb = this.map.honorBoard;
    const cx = (hb.x0 + hb.x1) / 2;
    this.box('plank', [hb.x0 - 0.2, 3.4, hb.z0 - 0.2], [hb.x1 + 0.2, 3.56, hb.z1 + 0.2], 0x3c2a1e);
    this.honorBoard.mesh.position.set(cx, 2.05, hb.z1 + 0.015);
    this.recentBoard.mesh.position.set(cx, 2.05, hb.z0 - 0.015);
    this.recentBoard.mesh.rotation.y = Math.PI;
    this.scene.add(this.honorBoard.mesh, this.recentBoard.mesh);
    // лицом — на юг (+Z), обратная сторона — на север
    for (const [z, s] of [[hb.z1, 1], [hb.z0, -1]] as const) {
      for (const dx of [-1.1, 1.1]) {
        this.solidBox(0.04, 0.04, 0.45, cx + dx, 3.47, z + 0.2 * s, 0x2a2a2a);
        this.solid.push(place(paint(new THREE.ConeGeometry(0.14, 0.15, 10, 1, true), 0x2a3a30), cx + dx, 3.42, z + 0.42 * s));
        this.addGlow(0xffc27a, 1.0, cx + dx, 3.35, z + 0.42 * s, 0.45);
      }
    }
  }

  /** «Токаревская кошка»: отдельная модель и лампа, прежняя физическая площадка. */
  private buildLighthouse(): void {
    const { x, z } = this.map.lighthouse;
    this.lighthouse.group.position.set(x, 0, z);
    this.scene.add(this.lighthouse.group);
    const lampY = this.lighthouse.lampAnchor.position.y;
    // луч: два конуса в противоположные стороны, чуть вниз
    const geo = new THREE.ConeGeometry(4.2, BEAM_LEN, 24, 1, true);
    geo.translate(0, -BEAM_LEN / 2, 0);
    geo.rotateZ(Math.PI / 2);
    const mat = this.beamMat;
    for (const a of [0, Math.PI]) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.set(0, a, -0.03, 'YXZ');
      m.frustumCulled = false;
      this.beam.add(m);
    }
    this.beam.position.set(x, lampY, z);
    this.scene.add(this.beam);
    this.beamFlash.position.set(x, lampY, z);
    this.scene.add(this.beamFlash);
  }

  /**
   * Фото у маяка: штатив с фотоаппаратом в конце мостков (объектив — на юг, на маяк; одна нога — назад, к фотографу)
   * и рамка видоискателя на бетоне перед маяком — там встают в кадр.
   */
  private buildPhotoSpot(): void {
    const { x, z } = PHOTO;
    const head = 1.32;
    const tilt = 0.3;
    const len = head / Math.cos(tilt);
    for (let i = 0; i < 3; i++) {
      // нога висит из головки вниз, отклонена наружу; первая — назад (−Z), две — вперёд в стороны
      const g = paint(new THREE.CylinderGeometry(0.016, 0.022, len, 6), 0x9aa3ab).translate(0, -len / 2, 0);
      this.solid.push(place(g, x, head, z, (i * 2 * Math.PI) / 3, tilt));
    }
    this.cyl(0.05, 0.06, 0.06, x, head + 0.02, z, 0x2a2e33, 12);
    this.solidBox(0.24, 0.15, 0.12, x, PHOTO_LENS_Y, z, 0x22262b);
    // объектив смотрит на маяк (+Z): тубус, золотое кольцо, тёмное стекло
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 16), 0x30353b), x + 0.03, PHOTO_LENS_Y, z + 0.11, 0, Math.PI / 2));
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.056, 0.056, 0.012, 16), 0xc9a24a), x + 0.03, PHOTO_LENS_Y, z + 0.155, 0, Math.PI / 2));
    this.solid.push(place(paint(new THREE.CylinderGeometry(0.04, 0.04, 0.004, 16), 0x0d1a26), x + 0.03, PHOTO_LENS_Y, z + 0.163, 0, Math.PI / 2));
    // вспышка сверху: корпус и светлое окошко спереди
    const [fx, fy, fz] = PHOTO_FLASH;
    this.solidBox(0.09, 0.06, 0.06, fx, fy, fz - 0.01, 0x1b1e22);
    this.glow.push(place(paint(new THREE.PlaneGeometry(0.075, 0.045), 0xfff6e0), fx, fy, fz + 0.021));
    this.photoGlow.position.set(fx, fy, fz + 0.05);
    this.scene.add(this.photoGlow);

    // рамка видоискателя: жёлтые уголки на бетоне
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = Math.round((512 * PHOTO_MARK_D) / PHOTO_MARK_W);
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const m = 14;
    const arm = 70;
    g.strokeStyle = '#ffd23e';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      g.moveTo(cx, cy + sy * arm);
      g.lineTo(cx, cy);
      g.lineTo(cx + sx * arm, cy);
    }
    g.stroke();
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(PHOTO_MARK_W, PHOTO_MARK_D).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map, transparent: true, opacity: 0.85, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    );
    // уголки — к фотоаппарату верхом картинки (север)
    mark.position.set(PHOTO.spotX, 0.006, PHOTO.spotZ);
    mark.receiveShadow = true;
    mark.renderOrder = 1;
    this.scene.add(mark);
  }

  /** Гирлянды: провисающие нити между фонарями и над террасой; лампочки — один инстансный меш и одно облако ореолов. */
  private buildGarlands(): void {
    const post = (x: number, z: number): V3 => [x, 4.75, z];
    const pole = (x: number, z: number): V3 => [x, CANOPY_POLE_H - 0.08, z];
    const wall = (z: number): V3 => [23.95, 3.85, z];
    const strings: Array<[V3, V3, number, boolean]> = [
      [post(-14, 16), post(2, 16), 1.1, false],
      [post(2, 16), post(14, 16), 0.9, false],
      [post(-4.5, -11), post(LAMP_FORT.x, LAMP_FORT.z), 1.6, false],
      [post(-14, -2), post(-14, 16), 1.2, false],
      [post(-14, -2), post(-4.5, -11), 1.0, false],
      [post(LAMP_FORT.x, LAMP_FORT.z), pole(14.2, -9), 0.3, false],
    ];
    const W = [pole(14.2, -9), pole(14.2, 1), pole(14.2, 11)];
    const E = [wall(-9), wall(1), pole(24, 11)];
    for (let i = 0; i < 3; i++) strings.push([W[i], E[i], 0.55, true]);
    for (let i = 0; i < 2; i++) strings.push([W[i], E[i + 1], 0.7, true], [E[i], W[i + 1], 0.7, true], [W[i], W[i + 1], 0.6, true]);
    strings.push([W[2], post(14, 16), 0.5, true]);

    const warm = [0xffdcaa, 0xffd090, 0xffe6c0];
    const retro = [0xff6b5a, 0xffd25a, 0x7ad67a, 0x6fa8ff, 0xffa14a];
    const bulbs: Array<[number, number, number, THREE.Color]> = [];
    const wire: number[] = [];
    const at = (a: V3, b: V3, sag: number, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    for (const [a, b, sag, colored] of strings) {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(2, Math.round(len / 0.45));
      for (let i = 0; i < n * 2; i++) wire.push(...at(a, b, sag, i / (n * 2)), ...at(a, b, sag, (i + 1) / (n * 2)));
      for (let i = 0; i < n; i++) {
        const p = at(a, b, sag, (i + 0.5) / n);
        const hex = colored ? retro[i % retro.length] : warm[i % warm.length];
        bulbs.push([p[0], p[1] - 0.06, p[2], new THREE.Color(hex)]);
      }
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: 0x1c1a18 }));
    this.scene.add(lines);
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), bulbs.length);
    const m4 = new THREE.Matrix4();
    const pos = new Float32Array(bulbs.length * 3);
    const col = new Float32Array(bulbs.length * 3);
    bulbs.forEach(([x, y, z, c], i) => {
      mesh.setMatrixAt(i, m4.makeTranslation(x, y, z));
      mesh.setColorAt(i, c);
      pos.set([x, y, z], i * 3);
      col.set([c.r, c.g, c.b], i * 3);
    });
    this.scene.add(mesh);
    this.powered.push(mesh);
    const halo = new THREE.BufferGeometry();
    halo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    halo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const halos = new THREE.Points(halo, new THREE.PointsMaterial({
      size: 0.55, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.scene.add(halos); this.powered.push(halos);
  }

  /** Пятна света на настиле: под фонарями, у ворот склада, у окон кафе и ларька, под навесом террасы. */
  private buildLightPools(): void {
    for (const d of this.map.deco) {
      if (d.kind !== 'lamp') continue;
      this.decal(d.x - Math.sin(d.yaw) * 1.2, d.z - Math.cos(d.yaw) * 1.2, 7, 7, LAMP, 0.2);
    }
    this.decal(0, -14.6, 7.5, 6.5, 0xffa850, 0.32);
    this.decal(22.6, -3.5, 4, 7, 0xffb060, 0.2);
    this.decal(-24.4, -4.3, 4, 4, 0xffb060, 0.2);
    const t = this.map.zones.terrace;
    this.decal((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, 13, 27, 0xffa860, 0.12);
  }

  /** Склеить накопленное: боксы по материалам, детали с вершинными цветами, светящееся. */
  private flush(): void {
    const make: Record<string, () => THREE.Texture> = {
      wood: tex.crateTexture,
      plank: tex.plankTexture,
      brick: tex.brickTexture,
      concrete: tex.concreteTexture,
      roof: tex.containerTexture,
      tiles: tex.containerTexture,
    };
    const props: Record<string, Partial<THREE.MeshStandardMaterialParameters>> = {
      wood: { roughness: 0.88 },
      plank: { roughness: 0.85 },
      brick: { roughness: 0.92 },
      concrete: { roughness: 0.95 },
      roof: { roughness: 0.6, metalness: 0.35 },
      tiles: { roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide },
    };
    for (const [key, p] of Object.entries(this.batch)) {
      const m = this.wettable(new THREE.MeshStandardMaterial({ map: make[key](), vertexColors: true, ...props[key] }));
      this.scene.add(staticMesh(buildGeo(p), m, true));
    }
    this.scene.add(staticMesh(mergeGeometries(this.solid, false)!, this.wettable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 })), true));
    const bulbs = staticMesh(mergeGeometries(this.glow, false)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
    this.scene.add(bulbs); this.powered.push(bulbs);
    if (this.windowGlow.length) this.scene.add(staticMesh(mergeGeometries(this.windowGlow, false)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false));
    this.solid.length = 0;
    this.glow.length = 0;
    this.windowGlow.length = 0;
  }

  // ------------------------------------------------------------ город и дальний берег

  /**
   * Город к востоку и к северу от площади: земля с холмами и дома с окнами (часть уже горит). Вдоль воды — набережная
   * со стенкой (buildTownQuay) и рядом деревьев, у берега дома в 2–4 этажа, на холмах выше. Без тумана — дымка
   * «запечена» в цвет.
   */
  private buildTown(): void {
    // дымка — та же, что у дальнего берега (цвет неба в направлении точки): hazeAt кладёт её цвет в haze
    const haze = new THREE.Color();
    // на горе под надписью воздух чище вдвое: склон зелёный, а не блёкло-оливковый
    const hazeAt = (x: number, z: number) => skyHaze(haze, x, landY(x, z) + 4, z) * (1 - 0.5 * signHillK(x, z));
    // надпись TIREDWOOD на горе за городом: под ней не ставим ни дома, ни деревья, ни огоньки
    const sign = new Tiredwood(landY);

    // --- земля: сетка 10 м. Крайние линии сетки — у стенки набережной (берег), ещё две — по краям площади:
    // земля кончается ровно у стенки, а не сползает склоном в воду; под площадью — дыра (там её настил)
    const xs: number[] = [QUAY_X + QUAY_T];
    for (let x = QUAY_X + 10; x <= TOWN_X1; x += 10) xs.push(x);
    const zs: number[] = [];
    for (let z = TOWN_Z0; z <= PLAZA_N; z += 10) zs.push(z);
    for (let z = PLAZA_N + 8; z < QUAY_Z - QUAY_T; z += 10) zs.push(z);
    zs.push(QUAY_Z - QUAY_T);
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    // набережная у воды и улица вдоль площади — светлая плитка, как у площади, дальше — серая мостовая
    const promenade = new THREE.Color(0xcfc6b0);
    const street = new THREE.Color(0xa6a8a0);
    const green = new THREE.Color(0x4d7a36);
    const meadow = new THREE.Color(0x7a9a44);
    for (const z of zs) {
      for (const x of xs) {
        const y = landY(x, z);
        pos.push(x, y, z);
        const d = landDepth(x, z);
        if (d < 12) c.copy(promenade);
        else if (d < 70) c.copy(street);
        else c.copy(green).lerp(meadow, (0.5 + 0.5 * Math.sin(x * 0.03 + Math.cos(z * 0.021) * 2)) * (1 - 0.7 * signHillK(x, z)));
        c.lerp(haze, hazeAt(x, z));
        col.push(c.r, c.g, c.b);
      }
    }
    const nx = xs.length;
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (xs[i + 1] <= PLAZA_E && zs[j] >= PLAZA_N) continue;
        const a = j * nx + i;
        const b = a + 1;
        const d = a + nx;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const ground = new THREE.BufferGeometry();
    ground.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ground.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    ground.setIndex(idx);
    ground.computeVertexNormals();
    this.scene.add(staticMesh(ground, this.far(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })), false));

    // --- дома: по одному на клетку 18 м; у воды пониже и под двускатными крышами, на холмах повыше и реже
    const rng = makeRng(404);
    const p = parts();
    const lots = new Map<number, [number, number, number, number]>();
    const cell = (x: number, z: number) => Math.floor((x + 40) / 18) * 1000 + Math.floor((z + 620) / 18);
    // пастель приморского городка: сливочный, персиковый, мятный, голубой, жёлтый, розовый, белый, сиреневый
    const walls = [0xf4e3c1, 0xf3c9b2, 0xc4e2d6, 0xc8dcf0, 0xf4dc8e, 0xedbcc8, 0xf7f2e8, 0xd8c6ea];
    const roofs = [0xb4553a, 0xc4683f, 0x9e4a36, 0x5f6c7a, 0xa85a3c, 0xc87a4a];
    const roofUv = [0.004, 0.996, 0.004, 0.996, 0.004, 0.996, 0.004, 0.996];
    for (let cz = -620; cz < QUAY_Z; cz += 18) {
      for (let cx = -40; cx < 640; cx += 18) {
        const w = 9 + 3 * Math.floor(rng() * 3);
        const dp = 9 + 3 * Math.floor(rng() * 2);
        const x0 = cx + rng() * (18 - w);
        const z0 = cz + rng() * (18 - dp);
        const x1 = x0 + w;
        const z1 = z0 + dp;
        const dist = Math.hypot((x0 + x1) / 2, (z0 + z1) / 2);
        const dmin = Math.min(landDepth(x0, z0), landDepth(x1, z0), landDepth(x0, z1), landDepth(x1, z1));
        if (dmin < 10 || dist > 680 || rng() > (dmin < 50 ? 0.72 : 0.56 - dist / 900)) continue;
        lots.set(cell(cx, cz), [x0 - 2, z0 - 2, x1 + 2, z1 + 2]);
        const floors = dmin < 50 ? 2 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 4);
        const y0 = Math.min(landY(x0, z0), landY(x1, z0), landY(x0, z1), landY(x1, z1)) - 0.4;
        const y1 = y0 + 0.4 + floors * 3;
        const k = hazeAt((x0 + x1) / 2, (z0 + z1) / 2);
        const wc = new THREE.Color(walls[Math.floor(rng() * walls.length)]).multiplyScalar(0.9).lerp(haze, k);
        const rc = new THREE.Color(roofs[Math.floor(rng() * roofs.length)]).lerp(haze, k);
        const ou = Math.floor(rng() * 8) / 8;
        const ov = Math.floor(rng() * 8) / 8 - 0.4 / 24;
        if (sign.blocks((x0 + x1) / 2, (z0 + z1) / 2, 14)) continue;
        const v0 = ov;
        const v1 = ov + (y1 - y0) / 24;
        const w4 = [wc, wc, wc, wc];
        const side = (a: V3, b: V3, n: V3, run: number) => {
          quad(p, a, b, [b[0], y1, b[2]], [a[0], y1, a[2]], n, [ou, v0, ou + run / 24, v0, ou + run / 24, v1, ou, v1], w4);
        };
        side([x0, y0, z1], [x1, y0, z1], [0, 0, 1], w);
        side([x1, y0, z0], [x0, y0, z0], [0, 0, -1], w);
        side([x1, y0, z1], [x1, y0, z0], [1, 0, 0], dp);
        side([x0, y0, z0], [x0, y0, z1], [-1, 0, 0], dp);
        const r4 = [rc, rc, rc, rc];
        if (dmin >= 50) {
          quad(p, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], roofUv, r4);
          continue;
        }
        // двускатная крыша, конёк вдоль длинной стороны; во фронтонах — окна мансарды
        const half = Math.min(w, dp) / 2;
        const rh = half * 0.62;
        const yr = y1 + rh;
        const len = Math.hypot(half, rh);
        const ga = v1;
        const gb = v1 + rh / 24;
        if (w >= dp) {
          const zm = (z0 + z1) / 2;
          quad(p, [x0, y1, z1], [x1, y1, z1], [x1, yr, zm], [x0, yr, zm], [0, half / len, rh / len], roofUv, r4);
          quad(p, [x1, y1, z0], [x0, y1, z0], [x0, yr, zm], [x1, yr, zm], [0, half / len, -rh / len], roofUv, r4);
          const gu = [ou, ga, ou + dp / 24, ga, ou + dp / 48, gb, ou + dp / 48, gb];
          quad(p, [x0, y1, z0], [x0, y1, z1], [x0, yr, zm], [x0, yr, zm], [-1, 0, 0], gu, w4);
          quad(p, [x1, y1, z1], [x1, y1, z0], [x1, yr, zm], [x1, yr, zm], [1, 0, 0], gu, w4);
        } else {
          const xm = (x0 + x1) / 2;
          quad(p, [x1, y1, z1], [x1, y1, z0], [xm, yr, z0], [xm, yr, z1], [rh / len, half / len, 0], roofUv, r4);
          quad(p, [x0, y1, z0], [x0, y1, z1], [xm, yr, z1], [xm, yr, z0], [-rh / len, half / len, 0], roofUv, r4);
          const gu = [ou, ga, ou + w / 24, ga, ou + w / 48, gb, ou + w / 48, gb];
          quad(p, [x0, y1, z1], [x1, y1, z1], [xm, yr, z1], [xm, yr, z1], [0, 0, 1], gu, w4);
          quad(p, [x1, y1, z0], [x0, y1, z0], [xm, yr, z0], [xm, yr, z0], [0, 0, -1], gu, w4);
        }
      }
    }
    const facade = tex.townFacadeTextures();
    this.scene.add(staticMesh(buildGeo(p), this.far(new THREE.MeshLambertMaterial({
      map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0.5, vertexColors: true, fog: false,
    })), false));

    // --- деревья рощами на склонах и редко у домов: округлые кроны на стволах (по инстансному мешу на то и другое),
    // кое-где цветущие; кроны качает ветер
    const trees: Array<[number, number, number, number, THREE.Color]> = [];
    const greens = [0x4a8436, 0x56923c, 0x5f9c44, 0x3f7634, 0x6a9a3c];
    const blossoms = [0xf0a0b8, 0xf6c4d6, 0xf3e6a0];
    for (let i = 0; i < 20000 && trees.length < 3500; i++) {
      const x = -40 + rng() * 720;
      const z = -660 + rng() * (660 + QUAY_Z);
      const d = landDepth(x, z);
      const dist = Math.hypot(x, z);
      if (d < 14 || dist > 700 || (d < 60 && rng() < 0.7)) continue;
      const grove = Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 - 0.4) + 0.5 * Math.sin(x * 0.031 - z * 0.027 + 2.2);
      if (grove < 0.1 && rng() > 0.15) continue;
      const lot = lots.get(cell(x, z));
      if (lot && x > lot[0] && x < lot[2] && z > lot[1] && z < lot[3]) continue;
      const r = 2.8 + rng() * 3.2;
      const leaf = rng() < 0.06 ? blossoms[Math.floor(rng() * blossoms.length)] : greens[Math.floor(rng() * greens.length)];
      // на горе под надписью деревьев нет — голый зелёный склон, как у HOLLYWOOD
      if (signHillK(x, z) > 0.12 || sign.blocks(x, z, 8 + r)) continue;
      trees.push([x, landY(x, z), z, r, new THREE.Color(leaf).lerp(haze, hazeAt(x, z))]);
    }
    // на набережной к востоку от площади — ряд деревьев между кнехтами и домами
    for (let x = PLAZA_E + 10; x < 300; x += 13) {
      const tx = x + (rng() - 0.5) * 3;
      const tz = QUAY_Z - 5 + (rng() - 0.5);
      trees.push([tx, landY(tx, tz), tz, 2.2 + rng() * 0.8, new THREE.Color(greens[Math.floor(rng() * greens.length)]).lerp(haze, hazeAt(tx, tz))]);
    }
    // Кроны — многогранники с нормалями шара (свет ложится мягко). Ближние к площади — из 80 граней, круглые;
    // дальние — из 20: там их не разглядеть, а деревьев тысячи
    const fine = new THREE.IcosahedronGeometry(1, 1);
    const coarse = new THREE.IcosahedronGeometry(1, 0);
    coarse.setAttribute('normal', coarse.getAttribute('position').clone());
    const crownMat = new THREE.MeshLambertMaterial({ fog: false });
    windSway(crownMat, this.wind, 0.035, 'town-crown');
    this.far(crownMat);
    const nearTrees = trees.filter(([x, , z]) => Math.hypot(x, z) < 260);
    const farTrees = trees.filter(([x, , z]) => Math.hypot(x, z) >= 260);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).translate(0, 0.5, 0), this.far(new THREE.MeshLambertMaterial({ fog: false })), trees.length);
    const tm = new THREE.Matrix4();
    const tq = new THREE.Quaternion();
    const ts = new THREE.Vector3();
    const tp = new THREE.Vector3();
    const bark = new THREE.Color();
    const meshes: THREE.InstancedMesh[] = [trunks];
    let ti = 0;
    for (const [geo, list] of [[fine, nearTrees], [coarse, farTrees]] as const) {
      const crowns = new THREE.InstancedMesh(swayAttr(geo, -1, 1), crownMat, list.length);
      list.forEach(([x, y, z, r, cc], i) => {
        tq.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI * 2);
        crowns.setMatrixAt(i, tm.compose(tp.set(x, y + 1.2 + r * 1.25, z), tq, ts.set(r, r * 1.15, r)));
        crowns.setColorAt(i, cc);
        const tr = 0.22 + r * 0.04;
        trunks.setMatrixAt(ti, tm.compose(tp.set(x, y - 0.3, z), tq, ts.set(tr, 1.5 + r * 0.6, tr)));
        trunks.setColorAt(ti++, bark.setHex(0x4a3a2c).lerp(haze, hazeAt(x, z)));
      });
      meshes.push(crowns);
    }
    for (const m of meshes) {
      m.matrixAutoUpdate = false;
      m.computeBoundingSphere();
      this.scene.add(m);
    }

    // --- огоньки на дальних холмах и мачта с красным огнём
    const lights: number[] = [];
    const lightCol: number[] = [];
    const lc = new THREE.Color();
    for (let i = 0; i < 700; i++) {
      const x = -40 + rng() * 1120;
      const z = -1000 + rng() * 1060;
      const d = landDepth(x, z);
      if (d < 120 || Math.hypot(x, z) < 560) continue;
      lc.setHex(rng() < 0.15 ? 0xd8e4ff : 0xffc27a);
      if (signHillK(x, z) > 0.12 || sign.blocks(x, z, 10)) continue;
      lights.push(x, landY(x, z) + 2, z);
      lightCol.push(lc.r, lc.g, lc.b);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lightCol, 3));
    this.scene.add(new THREE.Points(lg, this.far(new THREE.PointsMaterial({
      size: 3.2, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), true)));
    const mx = 330;
    const mz = -400;
    const my = landY(mx, mz);
    const mast: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const k = skyHaze(haze, mx, my + 5 + i * 10, mz);
      const cc = new THREE.Color(i % 2 ? 0xe8e0d4 : 0xb8402e).lerp(haze, k);
      mast.push(place(paint(new THREE.BoxGeometry(1.4 - i * 0.12, 10, 1.4 - i * 0.12), cc), mx, my + 5 + i * 10, mz));
    }
    this.scene.add(staticMesh(mergeGeometries(mast, false)!, this.far(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })), false));
    this.mastLight.material.fog = false;
    this.mastLight.position.set(mx, my + 71, mz);
    this.scene.add(this.mastLight);
    sign.build(this.scene, (m) => this.far(m));
  }

  /** Сухогруз на рейде — силуэт против солнца (дальний берег, острова и парусники — в backdrop.ts). */
  private buildFarShore(): void {
    const rng = makeRng(808);
    const haze = new THREE.Color(EVENING.horizon);
    const geos: THREE.BufferGeometry[] = [];
    // сухогруз — силуэт против солнца
    const dark = new THREE.Color(0x3b3a44).lerp(haze, 0.3);
    geos.push(place(paint(new THREE.BoxGeometry(150, 9, 22), dark), -640, WATER_Y + 3.5, 150));
    geos.push(place(paint(new THREE.BoxGeometry(16, 13, 20), new THREE.Color(0xd8d2c8).lerp(haze, 0.45)), -705, WATER_Y + 14, 150));
    for (let k = 0; k < 8; k++) {
      const cc = new THREE.Color([0x9a4a3a, 0x3f6f8f, 0x4c7a5a, 0xc07a3a][k % 4]).lerp(haze, 0.5);
      geos.push(place(paint(new THREE.BoxGeometry(13, 4 + rng() * 4, 18), cc), -680 + k * 14, WATER_Y + 10, 150));
    }
    this.scene.add(staticMesh(mergeGeometries(geos, false)!, this.far(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false })), false));

    const pts = [-640, WATER_Y + 22, 150, -700, WATER_Y + 22, 150, -575, WATER_Y + 10, 150];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Points(g, this.far(new THREE.PointsMaterial({
      color: 0xffc888, size: 3.5, map: glowTexture(), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }), true)));
  }

  // ------------------------------------------------------------ кадр

  /** Точечные лампы — только на высоком качестве (они дороже всего в кадре); на низком ещё и карта теней меньше. */
  setQuality(q: LobbyQuality): void {
    this.lampQuality = q;
    for (const l of this.lamps) l.visible = q === 'high' && this.weather.lampsOn;
    this.statue?.setQuality(q);
    this.rainFx.setQuality(q);
    const size = q === 'low' ? 1024 : 2048;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
      this.renderer.refreshShadows();
    }
    this.look?.setQuality(q);
  }

  /** Батут просел: кто-то приземлился. */
  bounceTrampoline(x: number, z: number, power = 1): void {
    this.trampolines.bounce(x, z, power);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Погода от сервера: идёт ли дождь и сам дождь (wx — сколько уже идёт, длина, сид: силу по времени и молнии считаем
   * сами). instant — сразу (только вошли на набережную), иначе — плавно, как в жизни.
   */
  setRain(on: boolean, instant = false, wx?: RainWire | null): void {
    this.weather.set(on, instant, wx, clockNow());
    this.applyWeather();
  }

  /** Шторм маяка поверх погоды: force — сила (0…1, тучи, ливень, ветер), lampsOn — свет в городе. Таймеры рыбалки не трогает. */
  setStormClimate(force: number, lampsOn: boolean): void {
    const w = this.weather;
    w.storm = Number.isFinite(force) ? Math.max(0, Math.min(1, force)) : 0;
    if (w.lampsOn === lampsOn) return;
    w.lampsOn = lampsOn;
    for (const l of this.lamps) l.visible = lampsOn && this.lampQuality === 'high';
    for (const o of this.powered) o.visible = lampsOn;
    for (const [m, strength] of this.poweredSigns) m.emissiveIntensity = lampsOn ? strength : 0;
  }

  /** Радуга после шторма маяка */
  setStormRainbow(on: boolean): void {
    this.weather.stormRainbow = on;
  }

  /** Молния по расписанию шторма маяка — та же, что в грозу. */
  strike(s: Strike): void {
    this.fire(s);
  }

  /** Подписка на удары молнии (гром, баркас…): отписка — вернувшейся функцией. */
  onStrike(fn: (e: StrikeEvent) => void): () => void {
    this.strikeFns.add(fn);
    return () => this.strikeFns.delete(fn);
  }

  /** Расписание молний дождя на within секунд вперёд (in — через сколько секунд). */
  upcomingStrikes(within: number): ReturnType<WeatherState['upcoming']> {
    return this.weather.upcoming(clockNow(), within);
  }

  /** Удар: не ближе STRIKE_NEAR к камере (отодвигаем), разряд и вспышка, всем подписчикам — где и насколько далеко. */
  private fire(s: Strike): void {
    const cam = this.camera.position;
    let { x, z } = s;
    const d = Math.hypot(x - cam.x, z - cam.z);
    if (!s.far && d < STRIKE_NEAR) {
      const k = d > 0.5 ? STRIKE_NEAR / d : 0;
      x = k ? cam.x + (x - cam.x) * k : cam.x;
      z = k ? cam.z + (z - cam.z) * k : cam.z + STRIKE_NEAR;
    }
    this.sky.strike({ ...s, x, z }, cam);
    const dist = Math.hypot(x - cam.x, z - cam.z);
    _right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const pan = dist > 0.5 ? Math.max(-1, Math.min(1, ((x - cam.x) * _right.x + (z - cam.z) * _right.z) / dist)) : 0;
    const e: StrikeEvent = { x, z, power: s.power, far: s.far, dist, pan };
    for (const fn of this.strikeFns) fn(e);
  }

  setLighthouseEnabled(on: boolean): void {
    this.lighthouseEnabled = on;
    this.lighthouse.setLampEnabled(on);
    this.beam.visible = this.beamFlash.visible = on;
  }

  /** Сила дождя сейчас (с учётом шторма): для звука и рыбаков; у острова — своя погода, дождь набережной стихает */
  get effectiveRain(): number { return this.weather.rain * (1 - (this.isleSky?.rainMute ?? 0)); }

  /** Остров «Последний свет»: туман и свет по дальности камеры поверх погоды набережной (ставит сцена по письму isle) */
  setIsleSky(s: IsleSky): void {
    this.isleSky = s;
    s.attach(this.sea, this.skyMat, this.seaMat);
    this.applyWeather();
  }

  /** Дописать крыши в карту укрытий от дождя (навес бильярда появляется только с флагом сервера). */
  addCover(boxes: readonly MapBox[]): void {
    this.cover.add(boxes);
  }

  /** Под крышей ли точка (навес, павильон): дождь там глуше, зато стучит по крыше над головой. */
  shelter(x: number, y: number, z: number): number {
    return this.cover.top(x, z) > y + 1.2 ? 1 : 0;
  }

  /**
   * Дождь идёт по событию: тучи собираются, морось, дождь, иногда гроза, стихает; пока идёт — мокнет плитка, после —
   * тучи расходятся, лужи сохнут ещё долго, иногда выходит радуга. Молнии — по расписанию события.
   */
  private stepWeather(dt: number): void {
    const w = this.weather;
    const now = clockNow();
    const changed = w.step(dt, now, (s) => this.fire(s));
    const flashing = this.sky.flash > 0.002;
    this.sky.rainbow.target = w.rainbow(now);
    this.sky.update(dt, this.camera.position);
    if (changed || flashing || this.sky.flash > 0.002) this.applyWeather();
    this.rainFx.update(dt, this.camera.position, this.effectiveRain, w.wet, w.wind);
  }

  /** Небо, туман, свет, мокрота и дымка — по текущей погоде; сумрак грозы и вспышка молнии — поверх. */
  private applyWeather(): void {
    const w = this.weather;
    const overcast = w.overcast;
    const k = overcast * overcast * (3 - 2 * overcast);
    const lerp = THREE.MathUtils.lerp;
    blendSky(this.skyMat, EVENING, RAIN, k);
    blendSky(this.seaMat, EVENING, RAIN, k);
    this.seaMat.uniforms.uRain.value = w.rain;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(blendFog(EVENING, RAIN, k));
    // чем сильнее дождь, тем ближе пелена
    fog.near = lerp(FOG_CLEAR[0], RAIN.fogNear, k) * (1 - 0.3 * w.rain);
    fog.far = lerp(FOG_CLEAR[1], RAIN.fogFar, k) * (1 - 0.25 * w.rain);
    (this.scene.background as THREE.Color).copy(fog.color);
    this.exposure = lerp(EVENING.exposure, RAIN.exposure, k);
    this.hemi.intensity = lerp(HEMI_CLEAR[0], HEMI_RAIN[0], k);
    this.hemi.color.set(HEMI_CLEAR[1]).lerp(_col.set(HEMI_RAIN[1]), k);
    this.hemi.groundColor.set(HEMI_CLEAR[2]).lerp(_col.set(HEMI_RAIN[2]), k);
    this.sun.intensity = lerp(SUN_CLEAR, SUN_RAIN, k);
    this.beamMat.uniforms.uStrength.value = lerp(BEAM_CLEAR, BEAM_RAIN, k);
    this.haze.uHaze.value = k;
    this.haze.uHazeColor.value.copy(fog.color).convertLinearToSRGB();
    this.wet.uWet.value = w.wet;
    const env = k > 0.5 ? this.envRain : this.envClear;
    for (const m of this.wetMats) m.envMap = env;
    this.look?.weather(k);
    // Поверх палитр (их пересобирают заново каждый раз — сумрак и вспышка не копятся от кадра к кадру):
    // гроза темнит небо, туман и свет; молния на миг подсвечивает всё, тучи светятся изнутри
    const dark = w.dark;
    const flash = Math.min(1.2, this.sky.flash);
    if (dark > 0 || flash > 0) {
      const light = 1 - dark * 0.82;
      this.sun.intensity = this.sun.intensity * (1 - dark * 0.94) + flash * 1.6;
      this.hemi.intensity = this.hemi.intensity * (1 - dark * 0.78) + flash * 1.1;
      this.exposure *= 1 - dark * 0.12;
      for (const mat of [this.skyMat, this.seaMat]) {
        for (const key of ['uHorizon', 'uMid', 'uZenith']) mat.uniforms[key].value.multiplyScalar(light * (1 + 0.55 * flash));
        for (const key of ['uCloud', 'uCloudLit']) mat.uniforms[key].value.multiplyScalar(light * (1 + 1.5 * flash));
      }
      fog.color.multiplyScalar(light * (1 + 0.5 * flash));
      fog.near = lerp(fog.near, 16, dark);
      fog.far = lerp(fog.far, 140, dark);
      (this.scene.background as THREE.Color).copy(fog.color);
      this.haze.uHazeColor.value.copy(fog.color).convertLinearToSRGB();
    }
    // у острова — его туман и мягкий свет (в бухте — ничего)
    if (this.isleSky) this.exposure = this.isleSky.apply(fog, this.scene.background as THREE.Color, this.sun, this.hemi, this.haze, this.exposure);
  }

  /** renderTick — часы отрисовки (тики сервера), по ним катер в поездке (в меню — 0: катер у причала). */
  update(dt: number, renderTick = 0): void {
    this.time += dt;
    const t = this.time;
    this.stepWeather(dt);
    if (this.isleSky?.step(dt, this.camera.position)) this.applyWeather();
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    this.wind.value = t;
    updateFloaters(this.floaters, t);
    this.trampolines.update(dt);
    this.boats.update(dt, t, renderTick);
    this.barkas.update(dt, t, renderTick, this.camera.position, this.effectiveRain, this.renderer.canvas.height);
    this.backdrop.update(t);
    this.look?.update(dt, t);
    const phase = Math.floor(t * 2.6) % 2;
    this.chase[0].visible = this.weather.lampsOn && phase === 0;
    this.chase[1].visible = this.weather.lampsOn && phase === 1;
    if (this.signGlow) this.signGlow.material.opacity = BULB_SIGN_GLOW[phase];
    this.gateScreen.tick(t);
    this.kartStart.tick(t);
    // луч маяка и вспышка, когда он смотрит на камеру
    const a = t * 0.55;
    this.beam.rotation.y = a;
    this.beam.visible = this.beamFlash.visible = this.lighthouseEnabled;
    const to = this.tmp.copy(this.camera.position).sub(this.beam.position).setY(0).normalize();
    const along = Math.abs(Math.cos(a) * to.x - Math.sin(a) * to.z);
    this.beamFlash.material.opacity = 0.2 + Math.pow(along, 24) * 0.5;
    this.mastLight.visible = t % 1.8 < 0.3;
    const pg = this.photoGlow.material;
    if (pg.opacity > 0) pg.opacity = pg.opacity < 0.01 ? 0 : pg.opacity * Math.exp(-dt * 6);
  }

  /** Сверкнула вспышка фотоаппарата у маяка. */
  photoFlash(): void {
    this.photoGlow.material.opacity = 1;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, this.exposure);
  }

  /** Нарисовать сцену с другой камеры (снимок фотоаппарата у маяка) — на тот же холст; дождь — вокруг неё. */
  renderWith(camera: THREE.Camera): void {
    this.rainFx.follow(camera.getWorldPosition(this.tmp));
    this.renderer.render(this.scene, camera, this.exposure);
    this.rainFx.follow(this.camera.position);
  }
}
