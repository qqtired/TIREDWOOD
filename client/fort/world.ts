// Мир «Старой крепости»: ясный летний день, кучевые облака, море на юге за скалистым берегом, луг с грунтовками,
// по которым идут зомби, лес по краю луга и холмы до горизонта. Стены и башни — из боксов карты (кладка, тёсаный
// камень), двор — брусчатка; живое (ворота, кристалл, колокол, таблички) — в props.ts; арсенал (лестницы, лавка,
// башни на стенах, гранаты, снаряды) — в arsenal3d.ts.
// Статика склеена по материалам, тени от солнца считаются один раз (и заново — когда ворота падают или встают).
import * as THREE from 'three';
import { FORT, GATE, INSIDE, ROADS, SHOP_COUNTER, THROAT_Z, type FortMap } from '../../shared/fortmap.ts';
import type { MapBox } from '../../shared/maps/types.ts';
import { makeRng } from '../../shared/math.ts';
import { Gulls, addBox, buildDeco, buildGeo, fitShadow, mergeColored, paint, parts, place, staticMesh, updateFloaters, type Floater, type GeoParts } from '../render/kit.ts';
import type { Renderer } from '../render/renderer.ts';
import type { Quality } from '../settings.ts';
import { fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import * as rtex from '../render/textures.ts';
import { Arsenal3D } from './arsenal3d.ts';
import { FortProps } from './props.ts';
import { buildShore } from './shore.ts';
import * as tex from './textures.ts';

/**
 * Ясный день: солнце высоко на юге (за спиной у защитников, смотрящих на север — на дороги), голубое небо, белые
 * кучевые облака, бирюзовое море. Зомби идут лицом к солнцу — их хорошо видно.
 */
export const DAY: SkyPalette = {
  sunDir: new THREE.Vector3(0.38, 0.8, 0.46).normalize(),
  horizon: 0xd6ecf8,
  mid: 0x92c8f0,
  zenith: 0x3a8ae0,
  sunGlow: 0xfff0c8,
  cloud: [0.74, 0.8, 0.92],
  cloudLit: [1.1, 1.08, 1.04],
  clouds: { cover: 0.5, alpha: 0.96, top: 0.95 },
  stars: 0,
  deep: 0x17709a,
  shallow: 0x35b3c2,
  exposure: 1.0,
  fogNear: 110,
  fogFar: 620,
  sun: 1,
};

/** Ширина грунтовки и мягкая кромка по бокам, м */
const ROAD_W = 4.4;
const ROAD_FADE = 1.4;
/** Деревья только за краем поля (там, где люди не ходят): поле — границы карты с запасом */
const FIELD = { x0: -70, x1: 70, z0: -90 };

export class FortWorld {
  readonly renderer: Renderer;
  readonly palette = DAY;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly props: FortProps;
  readonly arsenal: Arsenal3D;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly floaters: Floater[] = [];
  private readonly gulls: Gulls;
  private readonly crowns: THREE.InstancedMesh[] = [];
  time = 0;
  private decorEvery = 0;
  private decorAcc = 0;

  constructor(renderer: Renderer, map: FortMap) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 1600);
    this.camera.rotation.order = 'YXZ';
    const scene = this.scene;
    const p = this.palette;
    const fog = fogColor(p);
    scene.fog = new THREE.Fog(fog, p.fogNear, p.fogFar);
    scene.background = fog.clone();

    // --- свет: белое высокое солнце и голубое небо, отсвет снизу — от травы
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7f9a5a, 1.55));
    this.sun = new THREE.DirectionalLight(0xfff4e2, 3.1);
    this.sun.position.copy(p.sunDir).multiplyScalar(120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    // тени — на крепость и «горло» перед воротами
    fitShadow(this.sun, this.sun.target.position, new THREE.Box3(new THREE.Vector3(-26, -0.5, -26), new THREE.Vector3(26, 9, 20)));

    const sky = makeSky(p);
    this.skyMat = sky.material;
    scene.add(sky);
    const sea = makeSea(p);
    this.seaMat = sea.material;
    scene.add(sea);

    this.buildGround();
    this.buildRoads();
    this.buildWalls(map);
    this.buildYardProps(map);
    buildShore(this.scene);
    this.buildForest();
    this.buildFar();
    buildDeco(scene, map.deco, this.floaters);
    this.props = new FortProps(scene, map);
    this.arsenal = new Arsenal3D(scene, this.camera);
    this.gulls = new Gulls(scene, 0, 50);
  }

  // ------------------------------------------------------------ земля

  /** Луг до горизонта (на юге — до берега), брусчатка двора, пыльная площадка перед воротами. */
  private buildGround(): void {
    const rng = makeRng(7);
    const w = 900;
    const zs = 24;
    const ze = -620;
    const g = new THREE.PlaneGeometry(w, zs - ze, 90, 64);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, (zs + ze) / 2);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      uv.setXY(i, x / 8, -z / 8);
      // пятна посочнее и посуше; к краям — светлее (дымка) — пусть туман доделает
      const n = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.05 - 0.7) + 0.5 * Math.sin(x * 0.11 - z * 0.09) + (rng() - 0.5) * 0.25;
      c.setRGB(1, 1, 1).multiplyScalar(0.92 + n * 0.07);
      c.g += n * 0.03;
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const grass = new THREE.MeshStandardMaterial({ map: tex.grassTexture(), vertexColors: true, roughness: 0.96 });
    this.scene.add(staticMesh(g, grass, true));

    // двор: брусчатка внутри стен (чуть выше травы)
    const yard = new THREE.PlaneGeometry(INSIDE.x1 - INSIDE.x0, INSIDE.z1 - INSIDE.z0);
    yard.rotateX(-Math.PI / 2);
    yard.translate((INSIDE.x0 + INSIDE.x1) / 2, 0.012, (INSIDE.z0 + INSIDE.z1) / 2);
    const yuv = yard.getAttribute('uv');
    const ypos = yard.getAttribute('position');
    for (let i = 0; i < ypos.count; i++) yuv.setXY(i, ypos.getX(i) / 3, -ypos.getZ(i) / 3);
    const cobble = new THREE.MeshStandardMaterial({ map: tex.cobbleTexture(), color: 0xe6dccb, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.scene.add(staticMesh(yard, cobble, true));
  }

  /**
   * Грунтовки от края леса к воротам: лента по точкам дороги с мягкими краями (прозрачность в вершинах),
   * пятачок перед «горлом» и само «горло» под воротами.
   */
  private buildRoads(): void {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const lines: Array<ReadonlyArray<readonly [number, number]>> = ROADS.map((r) => r.pts);
    // «горло»: от развилки к воротам
    lines.push([[0, -20.5], [0, GATE.face + 0.1]]);
    const across = [-ROAD_W / 2 - ROAD_FADE, -ROAD_W / 2, ROAD_W / 2, ROAD_W / 2 + ROAD_FADE];
    const alpha = [0, 1, 1, 0];
    for (const pts of lines) {
      // сглаживаем изломы: точки через ~1,5 м по ломаной, нормаль — средняя соседних отрезков
      const dense: Array<[number, number]> = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
        for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      dense.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
      let len = 0;
      const base = pos.length / 3;
      for (let i = 0; i < dense.length; i++) {
        const [x, z] = dense[i];
        const [px, pz] = dense[Math.max(0, i - 1)];
        const [nx, nz] = dense[Math.min(dense.length - 1, i + 1)];
        let tx = nx - px;
        let tz = nz - pz;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        if (i > 0) len += Math.hypot(x - px, z - pz);
        for (let k = 0; k < 4; k++) {
          const o = across[k];
          pos.push(x - tz * o, 0.008, z + tx * o);
          uv.push(o / 4, len / 4);
          col.push(1, 1, 1, alpha[k]);
        }
        if (i > 0) {
          const a = base + (i - 1) * 4;
          const b = base + i * 4;
          // против часовой, если смотреть сверху (лицом вверх)
          for (let k = 0; k < 3; k++) idx.push(a + k, b + k + 1, b + k, a + k, a + k + 1, b + k + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({
      map: tex.dirtTexture(), color: 0xe8d2ae, vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    const mesh = staticMesh(g, m, false);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    this.scene.add(mesh);

    // утоптанный пятачок перед воротами (развилка дорог)
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(6.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: rtex.softDot('rgba(200,168,120,0.95)', 'rgba(200,168,120,0)'), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    );
    spot.position.set(0, 0.009, THROAT_Z - 1.6);
    spot.receiveShadow = true;
    spot.renderOrder = 1;
    this.scene.add(spot);
  }

  // ------------------------------------------------------------ стены

  /** Боксы карты: кладка, тёсаный камень, ящики. Ворота, телега и стог — свои модели (props.ts и ниже). */
  private buildWalls(map: FortMap): void {
    const rng = makeRng(13);
    const groups: Record<string, GeoParts> = {};
    map.boxes.forEach((b, i) => {
      if (b.mat === 'invisible' || b.mat === 'deck' || i === map.gateBox) return;
      if ((b.mat === 'wood' && b.variant === undefined) || isWell(b)) return;
      addBox((groups[b.mat] ??= parts()), b, b.mat, rng);
    });
    const mats: Record<string, THREE.Material> = {
      brick: new THREE.MeshStandardMaterial({ map: tex.stoneTexture(), vertexColors: true, roughness: 0.92, color: 0xfff8ee }),
      concrete: new THREE.MeshStandardMaterial({ map: tex.cutStoneTexture(), vertexColors: true, roughness: 0.88 }),
      wood: new THREE.MeshStandardMaterial({ map: rtex.crateTexture(), vertexColors: true, roughness: 0.85 }),
    };
    for (const [mat, p] of Object.entries(groups)) {
      const m = mats[mat];
      if (m) this.scene.add(staticMesh(buildGeo(p), m, true));
    }
    this.buildBanners();
  }

  /** Флаги на бастионах и над воротами: на шестах, красно-жёлтые, колышутся (вершинный сдвиг в шейдере — не надо). */
  private buildBanners(): void {
    const poles: THREE.BufferGeometry[] = [];
    const spots: Array<[number, number, number]> = [[-18, -16, 0xe0492f], [18, -16, 0xf2c230], [-3.9, -17.6, 0xe0492f], [3.9, -17.6, 0xf2c230]];
    for (const [x, z] of spots) poles.push(place(paint(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6), 0x6b4a2c), x, 3.4 + 1.6, z));
    this.scene.add(staticMesh(mergeColored(poles), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true));
    for (const [x, z, c] of spots) {
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.8, 8, 1).translate(0.65, 0, 0),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide }),
      );
      flag.position.set(x, 3.4 + 2.75, z);
      flag.userData.phase = x * 0.3 + z;
      this.flags.push(flag);
      this.scene.add(flag);
    }
  }

  private readonly flags: THREE.Mesh[] = [];

  /** Двор: колодец, телега, стог — по их боксам (коллизия — боксы, вид — свой). */
  private buildYardProps(map: FortMap): void {
    const wood: THREE.BufferGeometry[] = [];
    const boxes = map.boxes.filter((b, i) => b.mat === 'wood' && b.variant === undefined && i !== map.gateBox && !isCounter(b));
    for (const b of boxes) {
      const [x0, y0, z0] = b.min;
      const [x1, y1, z1] = b.max;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const sx = x1 - x0;
      const sz = z1 - z0;
      const h = y1 - y0;
      if (b.color === 0xd9b45a) {
        // стог: круглая копна сена
        const hay = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        hay.scale(sx * 0.62, h * 1.05, sz * 0.62);
        hay.translate(cx, y0, cz);
        const mesh = staticMesh(hay, new THREE.MeshStandardMaterial({ map: tex.hayTexture(), roughness: 1 }), true);
        this.scene.add(mesh);
        continue;
      }
      // телега: кузов на двух колёсах, оглобли
      const along = sz > sx;
      const L = along ? sz : sx;
      const W = along ? sx : sz;
      const yaw = along ? 0 : Math.PI / 2;
      const local: THREE.BufferGeometry[] = [];
      local.push(paint(new THREE.BoxGeometry(W, 0.12, L).translate(0, h * 0.55, 0), 0x9a6b42));
      for (const s of [-1, 1]) {
        local.push(paint(new THREE.BoxGeometry(0.1, h * 0.38, L).translate((s * W) / 2, h * 0.78, 0), 0x8a5c36));
        local.push(paint(new THREE.CylinderGeometry(h * 0.48, h * 0.48, 0.12, 14).rotateZ(Math.PI / 2).translate((s * (W / 2 + 0.08)), h * 0.48, 0), 0x6b4a2c));
      }
      local.push(paint(new THREE.BoxGeometry(W, h * 0.38, 0.1).translate(0, h * 0.78, L / 2), 0x8a5c36));
      local.push(paint(new THREE.BoxGeometry(W, h * 0.38, 0.1).translate(0, h * 0.78, -L / 2), 0x8a5c36));
      for (const s of [-1, 1]) local.push(paint(new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(s * 0.35, h * 0.5, -L / 2 - 0.8), 0x6b4a2c));
      for (const g of local) wood.push(place(g, cx, y0, cz, yaw));
    }
    // колодец: круглый сруб из камня, внутри — тёмная вода
    const well = map.boxes.find(isWell);
    if (well) {
      const cx = (well.min[0] + well.max[0]) / 2;
      const cz = (well.min[2] + well.max[2]) / 2;
      const r = (well.max[0] - well.min[0]) / 2;
      const h = well.max[1];
      const ring = new THREE.CylinderGeometry(r, r * 1.05, h, 18, 1, true);
      wood.push(place(paint(ring, 0xb9ad94), cx, h / 2, cz));
      wood.push(place(paint(new THREE.TorusGeometry(r * 0.92, 0.12, 6, 18).rotateX(Math.PI / 2), 0xd6ccb4), cx, h, cz));
      wood.push(place(paint(new THREE.CircleGeometry(r * 0.86, 18).rotateX(-Math.PI / 2), 0x2d4b5c), cx, h - 0.25, cz));
    }
    if (wood.length) this.scene.add(staticMesh(mergeColored(wood), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true));
  }

  // ------------------------------------------------------------ берег, лес, даль

  /**
   * Лес по краю поля: из него выходят зомби. Деревья — инстансы (ствол и две кроны); у дорог — просеки.
   * Внутри поля — только низкие кусты (там бегают люди).
   */
  private buildForest(): void {
    const rng = makeRng(31);
    const trees: Array<[number, number, number, THREE.Color]> = [];
    const greens = [0x4f8f3a, 0x5c9c40, 0x67a646, 0x447f34, 0x78ad4c];
    const nearRoad = (x: number, z: number, d: number): boolean => {
      for (const r of ROADS) {
        const [sx, sz] = r.pts[0];
        // просека — вдоль продолжения дороги за край поля
        const [nx, nz] = r.pts[1];
        const dx = sx - nx;
        const dz = sz - nz;
        const l = Math.hypot(dx, dz);
        const t = ((x - sx) * dx + (z - sz) * dz) / l;
        if (t > -2 && t < 40) {
          const px = sx + (dx / l) * t;
          const pz = sz + (dz / l) * t;
          if (Math.hypot(x - px, z - pz) < d) return true;
        }
      }
      return false;
    };
    for (let i = 0; i < 9000 && trees.length < 900; i++) {
      const x = -260 + rng() * 520;
      const z = -330 + rng() * 352;
      if (x > FIELD.x0 && x < FIELD.x1 && z > FIELD.z0) continue;
      if (z > 18) continue;
      // гуще у края поля, реже вдали; у моря — реже
      const edge = Math.max(FIELD.x0 - x, x - FIELD.x1, FIELD.z0 - z, 0);
      if (rng() < Math.min(0.75, edge / 160)) continue;
      if (nearRoad(x, z, 5 + rng() * 2)) continue;
      const r = 2.2 + rng() * 2.4;
      trees.push([x, z, r, new THREE.Color(greens[Math.floor(rng() * greens.length)])]);
    }
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4c33, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.15, 1, 6).translate(0, 0.5, 0), trunkMat, trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    const c2 = new THREE.Color();
    trees.forEach(([x, z, r, c], i) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rng() * Math.PI * 2);
      const th = 1.6 + r * 0.55;
      trunks.setMatrixAt(i, m.compose(v.set(x, 0, z), q, s.set(0.2 + r * 0.05, th, 0.2 + r * 0.05)));
      crowns.setMatrixAt(i * 2, m.compose(v.set(x, th + r * 0.7, z), q, s.set(r, r * 1.05, r)));
      crowns.setColorAt(i * 2, c);
      crowns.setMatrixAt(i * 2 + 1, m.compose(v.set(x + (rng() - 0.5) * r * 0.6, th + r * 1.45, z + (rng() - 0.5) * r * 0.6), q, s.set(r * 0.68, r * 0.7, r * 0.68)));
      crowns.setColorAt(i * 2 + 1, c2.copy(c).multiplyScalar(1.12));
    });
    for (const mesh of [trunks, crowns]) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    }
    this.crowns.push(crowns);

    // кусты и камни на поле — низкие, сквозь них можно пройти
    const bush: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 160; i++) {
      const x = -64 + rng() * 128;
      const z = -84 + rng() * 106;
      if (x > FORT.x0 - 5 && x < FORT.x1 + 5 && z > FORT.z0 - 6 && z < FORT.z1 + 4) continue;
      if (nearRoadAny(x, z, 4.5)) continue;
      if (rng() < 0.7) {
        const g = new THREE.IcosahedronGeometry(0.45 + rng() * 0.45, 0);
        g.scale(1.3, 0.75, 1.1);
        bush.push(place(paint(g, new THREE.Color(greens[Math.floor(rng() * greens.length)]).multiplyScalar(0.9)), x, 0.2, z, rng() * 3));
      } else {
        const g = new THREE.IcosahedronGeometry(0.3 + rng() * 0.4, 0);
        g.scale(1.2, 0.6, 1);
        bush.push(place(paint(g, 0xa59d8c), x, 0.08, z, rng() * 3));
      }
    }
    this.scene.add(staticMesh(mergeColored(bush), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), false));
  }

  /** Холмы до горизонта и мельница с деревней на северо-востоке: без тумана, дымка «запечена». */
  private buildFar(): void {
    const rng = makeRng(41);
    const haze = new THREE.Color(this.palette.horizon);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.95 + (i / 25) * Math.PI * 0.9;
      const d = 520 + rng() * 260;
      const x = Math.cos(a) * d * 1.3;
      const z = Math.sin(a) * d;
      if (z > -60) continue;
      const r = 120 + rng() * 140;
      const h = 40 + rng() * 70;
      const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(r, h, r * 0.8);
      geos.push(place(paint(g, new THREE.Color(0x6f9a5a).lerp(haze, 0.45 + rng() * 0.2)), x, -2, z));
    }
    // деревня: домики с красными крышами на холме за лесом
    for (let i = 0; i < 14; i++) {
      const x = 150 + rng() * 90;
      const z = -260 - rng() * 70;
      const w = 5 + rng() * 4;
      const wall = new THREE.Color(0xf1e6cf).lerp(haze, 0.35);
      const roof = new THREE.Color(0xc4553a).lerp(haze, 0.35);
      geos.push(place(paint(new THREE.BoxGeometry(w, 4, w * 0.8), wall), x, 2, z));
      geos.push(place(paint(new THREE.ConeGeometry(w * 0.78, 3, 4).rotateY(Math.PI / 4), roof), x, 5.5, z));
    }
    // мельница
    const mill = new THREE.Color(0xe9dcc4).lerp(haze, 0.3);
    geos.push(place(paint(new THREE.CylinderGeometry(3, 4.2, 14, 10), mill), 126, 7, -236));
    geos.push(place(paint(new THREE.ConeGeometry(3.6, 4, 10), new THREE.Color(0x8a5a3c).lerp(haze, 0.3)), 126, 16, -236));
    this.scene.add(staticMesh(mergeColored(geos), new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), false));
    // крылья мельницы крутятся
    const blades = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.2).translate(0, 4.8, 0), new THREE.MeshLambertMaterial({ color: new THREE.Color(0xf4ecdd).lerp(haze, 0.3), fog: false }));
      b.rotation.z = (k * Math.PI) / 2;
      blades.add(b);
    }
    blades.position.set(126, 14, -232.2);
    this.mill = blades;
    this.scene.add(blades);
  }

  private mill: THREE.Group | null = null;

  // ------------------------------------------------------------ кадр

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(q: Quality, slow = false): void {
    const tier = q === 'auto' ? slow ? 'low' : 'high' : q;
    this.decorEvery = tier === 'low' ? 1 / 12 : tier === 'medium' ? 1 / 24 : 0;
    this.sun.castShadow = tier !== 'low';
    for (const crown of this.crowns) crown.castShadow = tier === 'high';
    this.arsenal.setQuality(q, slow);
    this.renderer.refreshShadows();
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    this.decorAcc += dt;
    if (this.decorAcc >= this.decorEvery) {
      this.decorAcc = 0;
      updateFloaters(this.floaters, t);
      this.gulls.update(t);
      if (this.mill) this.mill.rotation.z = -t * 0.35;
      for (const f of this.flags) f.rotation.y = Math.sin(t * 1.9 + (f.userData.phase as number)) * 0.32 + 0.9;
    }
    this.props.update(dt, t, camPos);
  }

  renderScene(): void {
    this.renderer.render(this.scene, this.camera, this.palette.exposure);
  }
}

/** Бокс колодца во дворе (рисуется круглым срубом, а не кубом) */
function isWell(b: MapBox): boolean {
  return b.mat === 'concrete' && Math.abs(b.min[0] + 9.4) < 0.01 && Math.abs(b.min[2] + 2.4) < 0.01;
}

/** Бокс прилавка лавки на террасе (корпус рисует arsenal3d.ts, а не телегой) */
function isCounter(b: MapBox): boolean {
  return b.mat === 'wood' && Math.abs(b.min[0] - SHOP_COUNTER.x0) < 0.01 && Math.abs(b.min[2] - SHOP_COUNTER.z0) < 0.01;
}

/** Ближе d к любой дороге (по отрезкам) */
function nearRoadAny(x: number, z: number, d: number): boolean {
  for (const r of ROADS) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < d) return true;
    }
  }
  return false;
}
