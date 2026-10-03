// Мир «Причал»: небо, море, причал с контейнерами, склады, портовый терминал на другом берегу.
// Вся статика склеена в несколько мешей (по материалу) — пара десятков вызовов отрисовки на кадр.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import type { GameMap, MapBox } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { Gulls, Trampolines, addBox, buildDeco, buildGeo, craneGeometry, glowTexture, paint, parts, staticMesh, updateFloaters, type Floater, type GeoParts } from './kit.ts';
import { makeAwp } from './awp.ts';
import type { Renderer } from './renderer.ts';
import type { Quality } from '../settings.ts';
import { SUNSET, fogColor, makeSea, makeSky, type SkyPalette } from './sky.ts';
import * as tex from './textures.ts';

/** Направление НА солнце «Причала» (тень от солнца у вида от первого лица). */
export const SUN_DIR = SUNSET.sunDir;

export interface JarVis {
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  visible: boolean;
  pop: number;
}

/** AWP над крышей креста: на высоте груди желейки — край крыши не прячет её от тех, кто внизу (с 10–11 м) */
const AWP_HOVER = 1.25;
const AWP_SCALE = 1.5;

/** Снайперская AWP на верху креста: висит над крышей, медленно крутится; pivot — центр винтовки */
export interface AwpVis {
  group: THREE.Group;
  pivot: THREE.Group;
  y: number;
  visible: boolean;
  pop: number;
}

export class World {
  readonly renderer: Renderer;
  readonly palette: SkyPalette;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly trampolines: Trampolines;
  readonly jars: JarVis[] = [];
  /** AWP на кресте (null — на карте её нет) */
  awp: AwpVis | null = null;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly floaters: Floater[] = [];
  private readonly gulls: Gulls;
  private cranes: THREE.BufferGeometry[] = [];
  time = 0;

  setQuality(q: Exclude<Quality, 'auto'>): void {
    const size = q === 'low' ? 1024 : 2048;
    const shadow = this.sun.shadow;
    if (shadow.mapSize.x === size) return;
    shadow.mapSize.set(size, size);
    shadow.map?.dispose();
    shadow.map = null;
    this.renderer.refreshShadows();
  }

  constructor(renderer: Renderer, map: GameMap, palette: SkyPalette = SUNSET) {
    this.renderer = renderer;
    this.palette = palette;
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 1600);
    this.camera.rotation.order = 'YXZ';

    const scene = this.scene;
    const fog = fogColor(palette);
    scene.fog = new THREE.Fog(fog, palette.fogNear, palette.fogFar);
    scene.background = fog.clone();

    // --- свет: тёплое низкое солнце + холодное небо
    this.hemi = new THREE.HemisphereLight(0xbcd3ff, 0x8a6f58, 1.45);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc690, 3.2);
    this.sun.position.copy(palette.sunDir).multiplyScalar(120);
    this.sun.castShadow = true;
    // Рамка теневой камеры подогнана под пирс (±50 м вдоль, высота до 10 м)
    const sc = this.sun.shadow.camera;
    sc.left = -54;
    sc.right = 54;
    sc.top = 20;
    sc.bottom = -12;
    sc.near = 50;
    sc.far = 200;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);

    // --- небо и море
    const sky = makeSky(palette);
    this.skyMat = sky.material;
    scene.add(sky);
    const sea = makeSea(palette);
    this.seaMat = sea.material;
    scene.add(sea);

    this.buildMap(map);
    this.buildMarkings(map);
    this.buildWarehouses(map);
    buildDeco(scene, map.deco, this.floaters);
    for (const d of map.deco) if (d.kind === 'crane') this.buildCrane(d.x, d.z, d.yaw, d.scale);
    this.buildTerminal();
    this.buildFarScenery();
    this.trampolines = new Trampolines(scene, map.trampolines);
    this.buildJars(map);
    this.buildAwp(map);
    this.gulls = new Gulls(scene);
  }

  // ------------------------------------------------------------ карта

  private buildMap(map: GameMap): void {
    const rng = makeRng(5);
    const groups: Record<string, GeoParts> = {};
    let deckBox: MapBox | null = null;
    for (const b of map.boxes) {
      if (b.mat === 'invisible' || b.mat === 'tramp') continue;
      if (b.mat === 'deck') {
        deckBox = b;
        continue;
      }
      addBox((groups[b.mat] ??= parts()), b, b.mat, rng);
    }
    const textures: Record<string, THREE.Texture> = {
      container: tex.containerTexture(),
      wood: tex.crateTexture(),
      brick: tex.brickTexture(),
      metal: tex.metalTexture(),
      concrete: tex.concreteTexture(),
    };
    const props: Record<string, Partial<THREE.MeshStandardMaterialParameters>> = {
      container: { roughness: 0.62, metalness: 0.2 },
      wood: { roughness: 0.88, metalness: 0 },
      brick: { roughness: 0.92, metalness: 0 },
      metal: { roughness: 0.45, metalness: 0.5 },
      concrete: { roughness: 0.95, metalness: 0 },
    };
    for (const [mat, p] of Object.entries(groups)) {
      const m = new THREE.MeshStandardMaterial({ map: textures[mat], vertexColors: true, ...props[mat] });
      this.scene.add(staticMesh(buildGeo(p), m, true));
    }

    // Настил: отдельный меш со второй развёрткой для карты мягких теней
    if (deckBox) {
      const p = parts();
      addBox(p, deckBox, 'deck', rng, -10);
      const g = buildGeo(p);
      const [x0, , z0] = deckBox.min;
      const [x1, , z1] = deckBox.max;
      const pos = g.getAttribute('position');
      const uv1 = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv1[i * 2] = (pos.getX(i) - x0) / (x1 - x0);
        uv1[i * 2 + 1] = (pos.getZ(i) - z0) / (z1 - z0);
      }
      g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
      // что стоит на настиле (кнехты и фонари слишком тонкие — их пропускаем)
      const resting = map.boxes.filter((b) => {
        if (b.mat === 'deck' || b.min[1] > 0.3 || b.max[1] - b.min[1] > 20) return false;
        if (b.mat === 'invisible' && b.max[0] - b.min[0] < 0.5) return false;
        return true;
      });
      const ao = tex.deckAO(resting, x0, x1, z0, z1, 6);
      ao.channel = 1;
      const m = new THREE.MeshStandardMaterial({ map: tex.deckTexture(), aoMap: ao, aoMapIntensity: 1, vertexColors: true, roughness: 0.93, metalness: 0 });
      this.scene.add(staticMesh(g, m, true));
    }
  }

  /** Разметка на настиле: жёлтый пунктир вдоль краёв и названия команд у баз. */
  private buildMarkings(map: GameMap): void {
    const { minX, maxX, maxZ } = map.bounds;
    const dashes: THREE.BufferGeometry[] = [];
    for (const x of [minX + 1.9, maxX - 1.9]) {
      for (let z = -maxZ + 1.5; z < maxZ - 1.5; z += 2.3) {
        dashes.push(new THREE.PlaneGeometry(0.14, 1.4).rotateX(-Math.PI / 2).translate(x, 0.004, z + 0.7));
      }
    }
    const dashMat = new THREE.MeshStandardMaterial({
      color: 0xe8b53a, roughness: 0.85, transparent: true, opacity: 0.82, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const lines = new THREE.Mesh(mergeGeometries(dashes, false)!, dashMat);
    lines.receiveShadow = true;
    lines.renderOrder = 1;
    this.scene.add(lines);

    const names: Array<[string, string, number, number]> = [
      ['ЧЕРНИКА', '#5b72ff', -maxZ + 5.6, Math.PI],
      ['МАНДАРИН', '#ff9a3c', maxZ - 5.6, 0],
    ];
    names.forEach(([text, color, z, rotY], i) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tex.floorLettering(text, color, 31 + i), roughness: 0.8, transparent: true, opacity: 0.62, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75).rotateX(-Math.PI / 2).rotateY(rotY), mat);
      plane.position.set(0, 0.004, z);
      plane.receiveShadow = true;
      plane.renderOrder = 1;
      this.scene.add(plane);
    });
  }

  /** Склады за торцевыми стенами: кирпичная коробка, парапет, вентиляция, окна, вывеска. */
  private buildWarehouses(map: GameMap): void {
    const rng = makeRng(17);
    const brick = parts();
    const roof = parts();
    const glass: THREE.BufferGeometry[] = [];
    const zEnd = map.bounds.maxZ;
    for (const s of [-1, 1]) {
      // корпус: от стены к дальнему краю настила
      const zA = s * (zEnd + 1.2);
      const zB = s * (zEnd + 12);
      const zmin = Math.min(zA, zB);
      const zmax = Math.max(zA, zB);
      addBox(brick, { min: [-24, 0, zmin], max: [24, 9, zmax], color: 0x98604c }, 'brick', rng);
      // парапет по периметру крыши
      const pz0 = Math.min(s * zEnd, s * (zEnd + 12));
      const pz1 = Math.max(s * zEnd, s * (zEnd + 12));
      addBox(brick, { min: [-24, 9, pz0], max: [24, 9.6, pz0 + 0.4], color: 0x8a5645 }, 'brick', rng);
      addBox(brick, { min: [-24, 9, pz1 - 0.4], max: [24, 9.6, pz1], color: 0x8a5645 }, 'brick', rng);
      // кровля и будки вентиляции
      addBox(roof, { min: [-23.6, 9, pz0 + 0.4], max: [23.6, 9.12, pz1 - 0.4], color: 0x5d6260 }, 'roof', rng);
      for (const vx of [-14, -4, 8, 17]) {
        const vz = (pz0 + pz1) / 2 + (rng() - 0.5) * 4;
        addBox(roof, { min: [vx - 1, 9.12, vz - 1], max: [vx + 1, 10.4, vz + 1], color: 0x7b8385 }, 'roof', rng);
      }
      // ряд высоких окон на стене, обращённой к арене
      const face = s * zEnd - s * 0.02;
      for (let wx = -20; wx <= 20; wx += 4) {
        if (Math.abs(wx) < 3) continue;
        const pane = new THREE.PlaneGeometry(2.2, 1.5);
        if (s > 0) pane.rotateY(Math.PI);
        pane.translate(wx, 7.5, face);
        glass.push(pane);
      }
    }
    this.scene.add(staticMesh(buildGeo(brick), new THREE.MeshStandardMaterial({ map: tex.brickTexture(), vertexColors: true, roughness: 0.92 }), true));
    this.scene.add(staticMesh(buildGeo(roof), new THREE.MeshStandardMaterial({ map: tex.containerTexture(), vertexColors: true, roughness: 0.7, metalness: 0.3 }), true));
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5c, roughness: 0.25, metalness: 0.6, emissive: 0x1a1410 });
    this.scene.add(staticMesh(mergeGeometries(glass, false)!, glassMat, false));

    // вывески над воротами
    const sign = (text: string, bg: string, fg: string, z: number, rotY: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), new THREE.MeshStandardMaterial({ map: tex.signTexture(text, bg, fg), roughness: 0.7 }));
      m.position.set(0, 6.3, z);
      m.rotation.y = rotY;
      this.scene.add(m);
    };
    sign('СКЛАД 1', '#2f4fbf', '#f4efe6', -zEnd + 0.06, 0);
    sign('СКЛАД 2', '#d9691a', '#fff7ea', zEnd - 0.06, Math.PI);
  }

  // ------------------------------------------------------------ декор

  /** Портальный кран на краю настила (стоит на 0,9 м). */
  private buildCrane(x: number, z: number, yaw: number, s: number): void {
    this.cranes.push(craneGeometry(x, 0.9, z, yaw, s));
  }

  /** Контейнерный терминал на восточном берегу: причальная стенка, штабели, краны. */
  private buildTerminal(): void {
    const rng = makeRng(31);
    const palette = [0x9a4a3a, 0x3f6f8f, 0x4c7a5a, 0xc07a3a, 0xb89a4a, 0x7a8288, 0xcfc8b8, 0x35507a, 0x8a5a7a, 0x5a8a8a];
    const cont = parts();
    const flat: THREE.BufferGeometry[] = [...this.cranes];
    this.cranes = [];
    // причальная стенка с жёлтой кромкой
    const quay = paint(new THREE.BoxGeometry(110, 3, 520), 0x9d978b);
    quay.translate(48 + 55, 0.9 - 1.5, 0);
    flat.push(quay);
    const edge = paint(new THREE.BoxGeometry(1.2, 0.5, 520), 0xd6c95a);
    edge.translate(48.8, 1.15, 0);
    flat.push(edge);
    // штабели контейнеров: блоки по 3 в ширину
    for (const bx of [70, 82, 94, 106, 118]) {
      for (let bz = -230; bz < 230; bz += 13.5) {
        if (rng() < 0.12) continue;
        for (let col = 0; col < 3; col++) {
          const levels = 1 + Math.floor(rng() * 4);
          const x0 = bx + col * 2.5;
          for (let l = 0; l < levels; l++) {
            const y0 = 0.9 + l * 2.6;
            const box = { min: [x0, y0, bz], max: [x0 + 2.44, y0 + 2.6, bz + 12.2], color: palette[Math.floor(rng() * palette.length)], variant: Math.floor(rng() * 7) };
            addBox(cont, box, 'container', rng, 0.95);
          }
        }
      }
    }
    this.scene.add(staticMesh(buildGeo(cont), new THREE.MeshLambertMaterial({ map: tex.containerTexture(), vertexColors: true }), false));
    this.scene.add(staticMesh(mergeGeometries(flat, false)!, new THREE.MeshLambertMaterial({ vertexColors: true }), false));
  }

  /** Дальний берег: город, холмы, волнорез с маяком, силуэт сухогруза на закате. Без тумана — дымка «запечена». */
  private buildFarScenery(): void {
    const rng = makeRng(99);
    const geos: THREE.BufferGeometry[] = [];
    const haze = new THREE.Color(this.palette.horizon);
    const pushBox = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
      const g = paint(new THREE.BoxGeometry(w, h, d), c);
      g.translate(x, y, z);
      geos.push(g);
    };
    // город на восточном берегу — его освещает закат
    for (let i = 0; i < 70; i++) {
      const z = -520 + i * 15 + rng() * 8;
      const h = 12 + rng() * 38 + (Math.abs(z) < 150 ? rng() * 30 : 0);
      const w = 10 + rng() * 14;
      const x = 560 + rng() * 60;
      const c = new THREE.Color().setHSL(0.07 + rng() * 0.05, 0.25, 0.45 + rng() * 0.15).lerp(haze, 0.55);
      pushBox(w, h, w, x, WATER_Y + h / 2, z, c);
    }
    // холмы за городом
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Color(0x7c8aa6).lerp(haze, 0.45 + rng() * 0.1);
      const cone = paint(new THREE.ConeGeometry(120 + rng() * 80, 60 + rng() * 60, 7), c);
      cone.translate(760 + rng() * 120, WATER_Y + 25, -600 + i * 150);
      geos.push(cone);
    }
    // волнорез с маяком на западе, прямо под солнцем
    pushBox(6, 3, 160, -260, WATER_Y + 1, 60, new THREE.Color(0x6f6a64).lerp(haze, 0.35));
    pushBox(5, 14, 5, -260, WATER_Y + 8, -22, new THREE.Color(0xe9e3d9).lerp(haze, 0.25));
    pushBox(5.2, 3, 5.2, -260, WATER_Y + 16, -22, new THREE.Color(0xc0392b).lerp(haze, 0.25));
    // сухогруз на рейде (силуэт против солнца)
    const dark = new THREE.Color(0x3b3a44).lerp(haze, 0.3);
    pushBox(26, 10, 170, -470, WATER_Y + 4, 190, dark);
    pushBox(22, 14, 18, -470, WATER_Y + 16, 262, new THREE.Color(0xd8d2c8).lerp(haze, 0.45));
    for (let k = 0; k < 9; k++) {
      const c = new THREE.Color(palettePick(rng)).lerp(haze, 0.5);
      pushBox(22, 5 + rng() * 5, 14, -470, WATER_Y + 11, 118 + k * 15, c);
    }
    this.scene.add(staticMesh(mergeGeometries(geos, false)!, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), false));
  }

  /** Батут просел: кто-то приземлился. */
  bounceTrampoline(x: number, z: number, power = 1): void {
    this.trampolines.bounce(x, z, power);
  }

  private buildJars(map: GameMap): void {
    const glass = new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.1, depthWrite: false });
    const jam = new THREE.MeshStandardMaterial({ color: 0xb3122e, emissive: 0x5a0616, roughness: 0.35 });
    const cloth = new THREE.MeshStandardMaterial({ map: tex.ginghamTexture(), roughness: 0.9 });
    const string = new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.9 });
    const jamGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.3, 18);
    const glassGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.42, 18, 1, true);
    const lidGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.07, 18);
    const tieGeo = new THREE.TorusGeometry(0.225, 0.012, 5, 18);
    for (const p of map.pickups) {
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
      g.position.set(p.x, p.y + 0.35, p.z);
      g.scale.setScalar(1.25);
      this.scene.add(g);
      this.jars.push({ group: g, x: p.x, y: p.y, z: p.z, visible: true, pop: 0 });
    }
  }

  /** AWP на верху креста: винтовка над крышей, тёплый ореол, чтобы видно было издалека, и пятно света на крыше. */
  private buildAwp(map: GameMap): void {
    const a = map.awp;
    if (!a) return;
    const g = new THREE.Group();
    const pivot = new THREE.Group();
    const gun = makeAwp();
    // начало модели — у рукояти; сдвигаем, чтобы крутилась вокруг середины
    gun.position.z = 0.35;
    gun.rotation.z = 0.12;
    pivot.add(gun);
    pivot.scale.setScalar(AWP_SCALE);
    // золотой ореол: обычное смешивание — на светлом небе не выгорает в белое; внутри — яркое ядро
    const glow = { map: glowTexture(), transparent: true, depthWrite: false };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ ...glow, color: 0xffb21f, opacity: 0.42 }));
    halo.scale.setScalar(3.4);
    halo.position.y = AWP_HOVER;
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ ...glow, color: 0xffe7a0, opacity: 0.55, blending: THREE.AdditiveBlending }));
    core.scale.setScalar(1.6);
    core.position.y = AWP_HOVER;
    const spot = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ ...glow, color: 0xffc94d, opacity: 0.4, blending: THREE.AdditiveBlending }),
    );
    spot.position.y = 0.02;
    g.add(halo, pivot, core, spot);
    g.position.set(a.x, a.y, a.z);
    this.scene.add(g);
    this.awp = { group: g, pivot, y: a.y, visible: true, pop: 0 };
  }

  /** AWP лежит на кресте (true) или её нет (в руках у кого-то, ждёт возвращения). */
  setAwp(visible: boolean): void {
    const a = this.awp;
    if (!a || a.visible === visible) return;
    a.visible = visible;
    a.group.visible = visible;
    if (visible) a.pop = 1;
  }

  setJar(i: number, visible: boolean): void {
    const j = this.jars[i];
    if (!j || j.visible === visible) return;
    j.visible = visible;
    j.group.visible = visible;
    if (visible) j.pop = 1;
  }

  // ------------------------------------------------------------ кадр

  /** Размер кадра поменялся (сам рендерер меняет размер оболочка). */
  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.seaMat.uniforms.uTime.value = t;
    this.skyMat.uniforms.uTime.value = t;
    updateFloaters(this.floaters, t);
    this.trampolines.update(dt);
    const aw = this.awp;
    if (aw && aw.visible) {
      aw.pop = Math.max(0, aw.pop - dt * 2.5);
      aw.pivot.scale.setScalar(AWP_SCALE * (1 + Math.sin(aw.pop * Math.PI) * 0.35));
      aw.pivot.position.y = AWP_HOVER + Math.sin(t * 1.8) * 0.08;
      aw.pivot.rotation.y = t * 0.7;
    }
    for (let i = 0; i < this.jars.length; i++) {
      const j = this.jars[i];
      if (!j.visible) continue;
      j.pop = Math.max(0, j.pop - dt * 2.5);
      j.group.scale.setScalar(1.25 * (1 + Math.sin(j.pop * Math.PI) * 0.35));
      j.group.position.y = j.y + 0.38 + Math.sin(t * 2.2 + i) * 0.09;
      j.group.rotation.y = t * 1.1 + i;
    }
    this.gulls.update(t);
  }

  renderScene(): void {
    this.renderer.render(this.scene, this.camera, this.palette.exposure);
  }
}

function palettePick(rng: () => number): number {
  const p = [0x9a4a3a, 0x3f6f8f, 0x4c7a5a, 0xc07a3a, 0x7a8288];
  return p[Math.floor(rng() * p.length)];
}
