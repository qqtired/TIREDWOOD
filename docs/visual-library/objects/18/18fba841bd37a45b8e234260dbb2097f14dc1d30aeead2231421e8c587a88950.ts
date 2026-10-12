// Мир гонки: общий для обеих трасс — свет ясного полдня (новый вид: тёплое солнце, голубоватые тени, своя кривая
// тона, пушистые облака и искры на воде), небо и море, дорога с краями (trackgeo.ts), помехи (hazardvis.ts), ящики с
// бонусами, банки-ловушки, зрители и флажки (crowd.ts). Окружение — своё у каждой трассы: порт (harborscene.ts) или
// приморский городок на холме (hillsscene.ts). Статика склеена по материалам, тени от солнца считаются один раз.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { MV_SLIDE, deckAt } from '../../shared/hazards.ts';
import type { TrapSnap } from '../../shared/kartnet.ts';
import type { Ring } from '../../shared/maps/ring.ts';
import { landHas, rightNormal } from '../../shared/maps/ringland.ts';
import type { Deco } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { DEFAULT_TRACK, buildRaceCourse, type RaceTrackId } from '../../shared/racecourse.ts';
import { NO_GROUND, locate, locateAny, makeLoc, onGround, type Track, type TrackLoc } from '../../shared/track.ts';
import type { LobbyQuality } from '../lobby/world.ts';
import { Gulls, buildDeco, fitShadow, glowSprite, glowTexture, staticMesh, updateFloaters, type Floater } from '../render/kit.ts';
import { LOOK2 } from '../render/look.ts';
import { installLookTone, lookTone, paintMaterial, paintable, type PaintOptions } from '../render/lookpaint.ts';
import { lookSea, lookSky } from '../render/looksky.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import * as tex from '../render/textures.ts';
import { TOUCH } from '../touch.ts';
import { Festive } from './crowd.ts';
import { HarborScene } from './harborscene.ts';
import { HazardVis, type HazardCtx } from './hazardvis.ts';
import { HillsScene } from './hillsscene.ts';
import { RaceItemFx } from './itemfx.ts';
import { MARK_Y, TrackGeo, edgeLayout, type EdgeLayout, type Theme } from './trackgeo.ts';

/** Ясный полдень: солнце высоко на юго-западе, густая синева, белые кучевые облака, бирюзовая вода */
const DAY: SkyPalette = {
  sunDir: new THREE.Vector3(-0.42, 0.74, 0.3).normalize(),
  horizon: 0xd4e8f6,
  mid: 0x8cc4f0,
  zenith: 0x2a6ad6,
  sunGlow: 0xfff3d2,
  cloud: [0.66, 0.72, 0.92],
  cloudLit: [1.14, 1.1, 1.04],
  clouds: { cover: 0.44, alpha: 1.0, top: 1.0 },
  stars: 0,
  deep: 0x12688f,
  shallow: 0x2fb6c0,
  exposure: 1.0,
  fogNear: 160,
  fogFar: 820,
  sun: 1,
};

/** Свет нового вида: солнце золотистое, небесный свет голубее — тени голубоватые, от земли — тёплый отсвет */
const SUN2 = 0xffe2b4;
const SUN2_I = 3.3;
const HEMI2_SKY = 0xc6d4f0;
const HEMI2_GROUND = 0xd8b892;
const HEMI2_I = 1.6;
const SHADE2: readonly [number, number, number] = [0.95, 0.98, 1.08];

/** Проём в стене у пути контейнера: на столько метров шире контейнера с каждой стороны */
const GATE_PAD = 1.6;
/** Отрезок на повороте: сумма кривизн его концов больше этого (радиус меньше ~100 м) */
const CORNER_CURV = 0.02;
const CRATE_SIZE = 0.9;
/** Ящик висит над дорогой */
const CRATE_HOVER = 0.85;
const MAX_TRAPS = 10;
const JAR_SCALE = 1.5;

const _rn = { x: 0, z: 0 };
const _c = new THREE.Color();

interface CrateVis {
  group: THREE.Group;
  box: THREE.Mesh;
  shadow: THREE.Mesh;
  y: number;
  here: boolean;
  pop: number;
}

interface JarVis {
  group: THREE.Group;
  id: number;
  y: number;
  pop: number;
  seen: boolean;
}

export class RaceWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly items = new RaceItemFx(this.scene);
  readonly camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.3, 1800);
  readonly ring: Ring;
  readonly track: Track;
  readonly theme: Theme;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly floaters: Floater[] = [];
  private readonly gulls: Gulls;
  private readonly crates: CrateVis[] = [];
  private readonly jars: JarVis[] = [];
  private readonly rx: Float64Array;
  private readonly rz: Float64Array;
  private readonly corner: Int8Array;
  private readonly layout: EdgeLayout;
  /** Статика по материалам — склеивается в конце конструктора */
  private readonly solid: THREE.BufferGeometry[] = [];
  private readonly deco: Deco[] = [];
  private readonly rng = makeRng(77);
  private readonly hazards: HazardVis;
  private readonly festive: Festive;
  private readonly hills: HillsScene | null = null;
  private readonly harbor: HarborScene | null = null;
  private readonly floorLoc = makeLoc();
  time = 0;

  constructor(renderer: Renderer, quality: LobbyQuality = 'high', trackId: RaceTrackId = DEFAULT_TRACK) {
    this.ring = buildRaceCourse(trackId);
    this.renderer = renderer;
    this.track = this.ring.track;
    this.theme = trackId === 'hills' ? 'hills' : 'harbor';
    const lite = quality === 'low' || TOUCH;
    const scene = this.scene;
    const fog = fogColor(DAY);
    scene.fog = new THREE.Fog(fog, DAY.fogNear, DAY.fogFar);
    scene.background = fog.clone();

    // --- свет
    this.hemi = new THREE.HemisphereLight(LOOK2 ? HEMI2_SKY : 0xcfe2ff, LOOK2 ? HEMI2_GROUND : 0xb9ab94, LOOK2 ? HEMI2_I : 1.55);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(LOOK2 ? SUN2 : 0xfff0d4, LOOK2 ? SUN2_I : 3.2);
    const b = this.ring.land.box;
    const center = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    this.sun.position.copy(center).addScaledVector(DAY.sunDir, 360);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    const top = this.theme === 'hills' ? 26 : 36;
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(b.x0, -3, b.z0), new THREE.Vector3(b.x1, top, b.z1)));
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.5;
    // тени мягче: ясный полдень, много отражённого света (на сером асфальте тень не уходит в синеву)
    this.sun.shadow.intensity = LOOK2 ? 0.72 : 1;
    scene.add(this.sun, this.sun.target);

    // --- небо и море
    const sky = makeSky(DAY);
    this.skyMat = sky.material;
    scene.add(sky);
    const sea = makeSea(DAY);
    this.seaMat = sea.material;
    scene.add(sea);

    const tr = this.track;
    const n = tr.n;
    this.rx = new Float64Array(n);
    this.rz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      rightNormal(tr, i, _rn);
      this.rx[i] = _rn.x;
      this.rz[i] = _rn.z;
    }
    this.corner = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const c = tr.curv[i] + tr.curv[(i + 1) % n];
      if (Math.abs(c) <= CORNER_CURV) continue;
      for (let d = -1; d <= 1; d++) this.corner[(i + d + n) % n] = Math.sign(c);
    }
    this.layout = edgeLayout(tr, this.corner, (i, sd) => this.walled(i, sd));

    // --- окружение трассы
    this.festive = new Festive(scene, makeRng(91));
    if (this.theme === 'hills') {
      this.hills = new HillsScene({ scene, track: tr, layout: this.layout, solid: this.solid, box: b, festive: this.festive, rng: makeRng(53), lite, deco: this.deco });
    } else {
      this.harbor = new HarborScene({
        scene, ring: this.ring, track: tr, rx: this.rx, rz: this.rz, layout: this.layout, solid: this.solid, deco: this.deco,
        festive: this.festive, haze: new THREE.Color(DAY.horizon), lite,
      });
    }
    const ground = (x: number, z: number): number => this.landY(x, z);
    const planks = tex.plankTexture();
    const hazardTex = tex.hazardTexture();
    const surface = (x: number, z: number): number => this.surfaceY(x, z);
    const hctx: HazardCtx & { surface: (x: number, z: number) => number; theme: Theme } = { scene, solid: this.solid, planks, hazard: hazardTex, rng: this.rng, surface, theme: this.theme };
    this.hazards = new HazardVis(hctx, tr);
    const hills = this.hills;
    new TrackGeo({
      scene, track: tr, theme: this.theme, rx: this.rx, rz: this.rz, corner: this.corner, layout: this.layout, ground,
      noSkirt: hills ? (i) => hills.noSkirt(i) : undefined, solid: this.solid, hazardTex, planks,
    });
    this.flush();
    buildDeco(scene, this.deco, this.floaters);
    this.festive.build(lite);
    this.buildCrates();
    this.buildJars();
    this.gulls = new Gulls(scene, -8, 25);
    if (LOOK2) this.look2();
    this.setQuality(quality);
  }

  // ------------------------------------------------------------ помощники

  /** Край отрезка i с этой стороны: стена есть (не причал, не провал, не проём для контейнера) */
  private walled(i: number, sd: number): boolean {
    const tr = this.track;
    if (tr.gap[i] || (sd > 0 ? tr.openR[i] : tr.openL[i])) return false;
    const j = (i + 1) % tr.n;
    const lat = sd * (tr.hw[i] + (sd > 0 ? tr.vr[i] : tr.vl[i]) + 0.4);
    const mx = (tr.px[i] + tr.px[j]) / 2 + ((this.rx[i] + this.rx[j]) / 2) * lat;
    const mz = (tr.pz[i] + tr.pz[j]) / 2 + ((this.rz[i] + this.rz[j]) / 2) * lat;
    for (const m of tr.hz.movers) {
      if (m.kind !== MV_SLIDE) continue;
      const ex = m.bx - m.ax;
      const ez = m.bz - m.az;
      const t = Math.max(0, Math.min(1, ((mx - m.ax) * ex + (mz - m.az) * ez) / (ex * ex + ez * ez)));
      if (Math.hypot(mx - m.ax - ex * t, mz - m.az - ez * t) < m.r + GATE_PAD) return false;
    }
    return true;
  }

  /** Земля за дорогой: холм — рельеф, порт — плита суши на нуле (вода — ниже) */
  private landY(x: number, z: number): number {
    if (this.hills) return this.hills.ground(x, z);
    return this.harbor ? this.harbor.ground(x, z) : 0;
  }

  /** Высота поверхности дороги (или обочины) под точкой; вне дороги — земля */
  private surfaceY(x: number, z: number): number {
    const l = locateAny(this.track, x, z, this.floorLoc);
    if (onGround(l, 0.3) && l.ground !== NO_GROUND) return l.ground;
    return this.landY(x, z);
  }

  /** Склеить накопленную статику с вершинными цветами */
  private flush(): void {
    if (!this.solid.length) return;
    const list = this.solid.map((g) => {
      const src = g.index ? g.toNonIndexed() : g;
      if (src.getAttribute('uv')) src.deleteAttribute('uv');
      return src;
    });
    const mesh = staticMesh(mergeGeometries(list, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 }), true);
    this.scene.add(mesh);
  }

  /** Новый вид: своя кривая тона, облака и искры на воде, «рисованные» материалы у всего мира */
  private look2(): void {
    const scene = this.scene;
    installLookTone();
    scene.userData.toneMapping = THREE.CustomToneMapping;
    lookSky(this.skyMat);
    lookSea(this.seaMat);
    const fog = scene.fog as THREE.Fog;
    lookTone(fog.color.set(DAY.horizon), DAY.exposure);
    (scene.background as THREE.Color).copy(fog.color);
    const sun = this.sun;
    const lum = 0.2126 * sun.color.r + 0.7152 * sun.color.g + 0.0722 * sun.color.b;
    const paint: PaintOptions = {
      grain: !TOUCH,
      uniforms: { uLookShade: { value: new THREE.Color().setRGB(...SHADE2) }, uLookSunInv: { value: 1.6 / Math.max(0.05, sun.intensity * lum) } },
    };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (paintable(m)) paintMaterial(m, paint);
    });
  }

  // ------------------------------------------------------------ ящики и банки

  private buildCrates(): void {
    const mat = new THREE.MeshStandardMaterial({ map: tex.itemCrateTexture(), roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.65 });
    const geo = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: tex.softDot('rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    const shadowGeo = new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2);
    for (const c of this.track.crates) {
      const group = new THREE.Group();
      const box = new THREE.Mesh(geo, mat);
      group.add(box);
      group.add(glowSprite(0xffd27a, 2.2, 0.22));
      group.position.set(c.x, c.y + CRATE_HOVER, c.z);
      this.scene.add(group);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.position.set(c.x, c.y + MARK_Y + 0.01, c.z);
      shadow.renderOrder = 3;
      this.scene.add(shadow);
      this.crates.push({ group, box, shadow, y: c.y, here: true, pop: 0 });
    }
  }

  /** Ящики на месте: бит i — ящик i (как в снимке гонки). */
  setCrates(mask: number): void {
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      const here = (mask & (1 << i)) !== 0;
      if (here === c.here) continue;
      c.here = here;
      c.group.visible = here;
      c.shadow.visible = here;
      if (here) c.pop = 1;
    }
  }

  private buildJars(): void {
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, depthWrite: false });
    const jam = new THREE.MeshStandardMaterial({ color: 0xb3122e, emissive: 0x5a0616, roughness: 0.35 });
    const cloth = new THREE.MeshStandardMaterial({ map: tex.ginghamTexture(), roughness: 0.9 });
    const string = new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.9 });
    const jamGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 18);
    const glassGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18, 1, true);
    const lidGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.07, 18);
    const tieGeo = new THREE.TorusGeometry(0.225, 0.012, 5, 18);
    for (let i = 0; i < MAX_TRAPS; i++) {
      const g = new THREE.Group();
      const jamMesh = new THREE.Mesh(jamGeo, jam);
      jamMesh.position.y = 0.17;
      const glassMesh = new THREE.Mesh(glassGeo, glass);
      glassMesh.position.y = 0.21;
      const lid = new THREE.Mesh(lidGeo, cloth);
      lid.position.y = 0.45;
      const tie = new THREE.Mesh(tieGeo, string);
      tie.rotation.x = Math.PI / 2;
      tie.position.y = 0.4;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff6a7a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.setScalar(1.3);
      halo.position.y = 0.25;
      g.add(jamMesh, glassMesh, lid, tie, halo);
      g.scale.setScalar(JAR_SCALE);
      g.visible = false;
      this.scene.add(g);
      this.jars.push({ group: g, id: -1, y: 0, pop: 0, seen: false });
    }
  }

  /** Банки на дороге по снимку: лежащие остаются на местах, новые «выскакивают», пропавшие убираются. */
  setTraps(list: readonly TrapSnap[], count: number): void {
    for (const j of this.jars) j.seen = false;
    for (let k = 0; k < count; k++) {
      const t = list[k];
      let jar = this.jars.find((j) => j.id === t.id);
      if (!jar) {
        jar = this.jars.find((j) => j.id < 0);
        if (!jar) continue;
        jar.id = t.id;
        jar.pop = 1;
        jar.group.visible = true;
      }
      jar.seen = true;
      jar.y = t.y;
      jar.group.position.x = t.x;
      jar.group.position.z = t.z;
    }
    for (const j of this.jars) {
      if (j.seen || j.id < 0) continue;
      j.id = -1;
      j.group.visible = false;
    }
  }

  // ------------------------------------------------------------ опора и кадр

  /** Полуширина дороги: у края из-под колёс летит пыль (сама полуширина — в TrackLoc.hw) */
  get roadHalf(): number {
    return this.track.half;
  }

  /**
   * Высота опоры под точкой (тень карта): дорога, настил срезки, земля или вода.
   * loc — свой у каждого карта: в нём подсказка отрезка, поиск идёт рядом с ней.
   */
  groundAt(x: number, z: number, loc: TrackLoc): number {
    const tr = this.track;
    locate(tr, x, z, loc.seg, loc);
    if (Math.abs(loc.lat) > loc.hw + 6) locateAny(tr, x, z, loc);
    let g = onGround(loc, 0.5) && loc.ground !== NO_GROUND ? loc.ground : NO_GROUND;
    if (tr.hz.decks.length > 0) {
      const d = deckAt(tr.hz, x, z);
      if (d > g) g = d;
    }
    if (g !== NO_GROUND) return g;
    if (this.hills) return Math.max(WATER_Y, this.hills.ground(x, z));
    return landHas(this.ring.land, x, z) ? 0 : WATER_Y;
  }

  /**
   * Пол для камеры: камера не опускается ниже земли и дороги под собой (серпантин, гребень, насыпи).
   * loc — подсказка отрезка (у камеры своя).
   */
  camFloor(x: number, z: number, loc: TrackLoc): number {
    const tr = this.track;
    locate(tr, x, z, loc.seg, loc);
    let g = onGround(loc, 1.2) && loc.ground !== NO_GROUND ? loc.ground : -Infinity;
    if (this.hills) g = Math.max(g, this.hills.ground(x, z));
    else g = Math.max(g, landHas(this.ring.land, x, z) ? 0 : WATER_Y);
    return g;
  }

  /** Подвижные помехи — на момент rt (тики гонки, можно дробное): тот же, что у физики своего карта. */
  setHazardTime(rt: number): void {
    this.hazards.setTime(rt);
  }

  /** Карта теней: на всю трассу 4096, на слабом качестве — 2048 (пересчитывается один раз). */
  setQuality(q: LobbyQuality): void {
    const size = q === 'low' ? 2048 : 4096;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size);
      sh.map?.dispose();
      sh.map = null;
      this.renderer.refreshShadows();
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    updateFloaters(this.floaters, t);
    this.gulls.update(t);
    this.hazards.update(dt);
    this.items.update(dt);
    this.festive.update(t);
    this.hills?.update(dt, t);
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      if (!c.here) continue;
      // появился: вырастает с перелётом
      c.pop = Math.max(0, c.pop - dt * 3);
      const k = 1 - c.pop;
      const s = c.pop > 0 ? Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.5)) : 1;
      c.group.scale.setScalar(s);
      c.group.position.y = c.y + CRATE_HOVER + Math.sin(t * 2.3 + i * 1.7) * 0.12;
      c.group.rotation.y = t * 1.5 + i * 0.9;
      c.box.rotation.set(Math.sin(t * 1.1 + i) * 0.22, 0, Math.cos(t * 0.9 + i) * 0.22);
    }
    for (let i = 0; i < this.jars.length; i++) {
      const j = this.jars[i];
      if (j.id < 0) continue;
      j.pop = Math.max(0, j.pop - dt * 2.5);
      j.group.scale.setScalar(JAR_SCALE * (1 + Math.sin(j.pop * Math.PI) * 0.35));
      j.group.position.y = j.y + 0.05 + Math.sin(t * 2.2 + i) * 0.05;
      j.group.rotation.y = t * 0.8 + i;
    }
    void _c;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, DAY.exposure);
  }
}
