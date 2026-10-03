// «Выше облаков» — Небесная каланча: картинка вокруг тех же боксов, что у сервера. Яркий день, белое море облаков,
// оштукатуренная каланча с кирпичной колокольней и медным шатром. Всё подвижное (люльки, тележка, корзины шаров,
// мешки, тараны, облака, ступени, карусель) ставится по тем же расписаниям, что и физика (shared/skilltraps.ts) —
// что видно, то и бьёт. Предупреждения: таран отъезжает и мигает, облако дрожит и сереет, флажки рвутся перед
// порывом, ступень трясётся и пылит перед обвалом.
import * as THREE from 'three';
import { SKILL_TOWER, makeSkillMap, type SkillMover, type SkillPad, type SkillRect } from '../../shared/skillmap.ts';
import { barAngle, discAngle, makeSackPose, moverAt, sackAt, type P3 } from '../../shared/skillphysics.ts';
import {
  CRUMBLE_PERIOD, CRUMBLE_SPEED, cloudReform, cloudState, crumbleFront, crumbleState, cyc, orbitAngle, ramState, windState, type RamPhase,
} from '../../shared/skilltraps.ts';
import { SKILL_SECTIONS } from '../../shared/skilltest.ts';
import { CollisionWorld } from '../../shared/world.ts';
import { Gulls, fitShadow } from '../render/kit.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSky } from '../render/sky.ts';
import type { Quality } from '../settings.ts';
import { Batch, C, SKY_DAY, makeMaterials, puffGeometry, signTexture, stripeTexture } from './look.ts';

const TICK = 60;
const SEA_Y = -22;

interface Flag { cloth: THREE.Mesh; base: Float32Array; cp: number; mat: THREE.MeshStandardMaterial; star: THREE.Mesh }
interface Mushroom { cap: THREE.Group; box: number; squash: number }
interface Ram { root: THREE.Group; lamp: THREE.MeshStandardMaterial; dx: number; fx: number; puff: number; last: RamPhase }
interface Sack { pivot: THREE.Group; shadow: THREE.Mesh; floorY: number }
interface Cloud { root: THREE.Group; mat: THREE.MeshStandardMaterial; x: number; y: number; z: number; was: number }
interface Step { mesh: THREE.Group; x: number; y: number; z: number; s: number; down: boolean }

export class SkillWorld {
  readonly map = makeSkillMap();
  readonly collision = new CollisionWorld(this.map);
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2600);
  private readonly renderer: Renderer;
  private readonly mats = makeMaterials();
  private readonly stripeMat: THREE.MeshStandardMaterial;
  private readonly sun = new THREE.DirectionalLight(0xfff3e0, 2.8);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly detail = new THREE.Group();
  private readonly gulls: Gulls;
  private quality: Quality = 'high';
  // подвижное
  private readonly wheel = new THREE.Group();
  private readonly gondolas: THREE.Group[] = [];
  private readonly cart = new THREE.Group();
  private cartTop: THREE.Mesh;
  private cartSquash = 0;
  private readonly baskets: THREE.Group[] = [];
  private readonly sacks: Sack[] = [];
  private readonly rams: Ram[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly steps: Step[] = [];
  private readonly disc = new THREE.Group();
  private readonly bar = new THREE.Group();
  private readonly mushrooms: Mushroom[] = [];
  private readonly pennants: { mesh: THREE.Mesh; base: Float32Array; phase: number }[] = [];
  private readonly sails: { mesh: THREE.Mesh; base: Float32Array }[] = [];
  private readonly streaks: THREE.InstancedMesh;
  private readonly updraft: THREE.Mesh;
  private readonly flags: Flag[] = [];
  private readonly bell = new THREE.Group();
  private bellSwing = 0;
  private bellVel = 0;
  private readonly p: P3 = { x: 0, y: 0, z: 0 };
  private readonly sack = makeSackPose();
  private readonly ram = { e: 0, phase: 'rest' as RamPhase, k: 0 };
  private readonly dummy = new THREE.Object3D();
  /** Сюда сцена отдаёт события картинки (пыль тарана, облако растаяло) */
  onPuff: ((x: number, y: number, z: number, kind: 'dust' | 'cloud' | 'step') => void) | null = null;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    const fog = fogColor(SKY_DAY);
    this.scene.background = fog.clone();
    this.scene.fog = new THREE.Fog(fog, SKY_DAY.fogNear, SKY_DAY.fogFar);
    this.scene.add(new THREE.HemisphereLight(0xe2f2ff, 0xc9d6e2, 1.35));
    const center = new THREE.Vector3(-3, 32, 2);
    this.sun.position.copy(center).addScaledVector(SKY_DAY.sunDir, 160);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-30, -2, -24), new THREE.Vector3(24, 78, 24)));
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    const sky = makeSky(SKY_DAY);
    this.skyMat = sky.material;
    this.scene.add(sky);
    this.seaMat = this.cloudSea(fog);
    const tex = stripeTexture();
    this.stripeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    this.streaks = this.windStreaks();
    this.updraft = this.updraftColumn();
    this.cartTop = new THREE.Mesh();
    this.build();
    const flock = new THREE.Scene();
    this.gulls = new Gulls(flock, 0, 0);
    flock.position.y = 38;
    this.detail.add(flock);
    this.scene.add(this.detail);
    this.update(0, 0, 0);
  }

  // ------------------------------------------------------------ море облаков

  private cloudSea(fog: THREE.Color): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: fog }, uSun: { value: SKY_DAY.sunDir.clone() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uFog; uniform vec3 uSun; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
        float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.02; a*=0.5; } return v; }
        void main(){
          vec2 p = vW.xz * 0.018 + vec2(uTime*0.006, uTime*0.002);
          float c = fbm(p);
          float d = fbm(p + uSun.xz * 0.06);
          float lit = clamp(0.62 + (c - d) * 4.0, 0.0, 1.0);
          vec3 shade = vec3(0.70, 0.77, 0.90);
          vec3 top = vec3(1.0, 0.995, 0.98);
          vec3 col = mix(shade, top, smoothstep(0.25, 0.75, c) * 0.55 + lit * 0.45);
          float dist = length(vW - cameraPosition);
          col = mix(col, uFog, smoothstep(250.0, 1300.0, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 1, 1), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    this.scene.add(sea);
    // кучевые облака из моря и редкие вдали над ним — глубина и масштаб
    const list: THREE.BufferGeometry[] = [];
    let seed = 11;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const high = i % 5 === 0;
      const d = (high ? 160 : 55) + rnd() * (high ? 260 : 300);
      const sx = 10 + rnd() * 22;
      const g = puffGeometry(sx, sx * (0.45 + rnd() * 0.25), sx * (0.7 + rnd() * 0.5), 1000 + i, 10);
      g.translate(Math.cos(a) * d, high ? 25 + rnd() * 55 : SEA_Y + 2 + rnd() * 8, Math.sin(a) * d);
      list.push(g);
    }
    const geo = mergeGeo(list);
    const puffs = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6c7f99, emissiveIntensity: 0.35 }));
    puffs.matrixAutoUpdate = false;
    this.scene.add(puffs);
    return mat;
  }

  // ------------------------------------------------------------ стройка

  private build(): void {
    const b = new Batch();
    const map = this.map;
    this.tower(b);
    this.depot(b);
    for (const pad of map.pads) this.pad(b, pad);
    this.wheelAndGondolas(b);
    this.sackArms(b);
    this.ramsBuild(b);
    this.cloudsBuild();
    this.windBuild(b);
    this.cartBuild(b);
    this.carouselBuild(b);
    this.balloonsBuild(b);
    this.stairsBuild();
    this.bellBuild(b);
    this.flagsBuild(b);
    b.flush(this.scene, this.mats);
  }

  /** Каланча: штукатурка, кирпичные лопатки и карнизы, окна; колокольня — кирпич с арками; шатёр — медь. */
  private tower(b: Batch): void {
    const H = 6;
    b.span('plaster', C.plaster, -H, -26, -H, H, 47, H);
    // кирпичные лопатки на углах (чуть выступают — углы видно издалека)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? H - 0.6 : -H - 0.1, x1 = sx > 0 ? H + 0.1 : -H + 0.6;
      const z0 = sz > 0 ? H - 0.6 : -H - 0.1, z1 = sz > 0 ? H + 0.1 : -H + 0.6;
      b.span('brick', C.brick, x0, -26, z0, x1, 47.2, z1);
    }
    // карнизы: каждые 12 м и у террасы (не выступают за кромку — стенка гладкая для прыжков рядом)
    for (const y of [11.5, 23.5, 35.5, 46.6]) b.span('paint', C.trim, -H - 0.05, y, -H - 0.05, H + 0.05, y + 0.4, H + 0.05);
    // окна: на каждой стороне ряды, где нет площадок вплотную
    for (let y = 2.5; y < 45; y += 6) {
      for (const k of [-3, 3]) {
        b.span('glass', C.glass, k - 0.7, y, H + 0.01, k + 0.7, y + 2.2, H + 0.06);
        b.span('glass', C.glass, k - 0.7, y, -H - 0.06, k + 0.7, y + 2.2, -H - 0.01);
        b.span('glass', C.glass, H + 0.01, y, k - 0.7, H + 0.06, y + 2.2, k + 0.7);
        b.span('glass', C.glass, -H - 0.06, y, k - 0.7, -H - 0.01, y + 2.2, k + 0.7);
      }
    }
    // колокольня
    b.span('brick', C.brick, -4, 47, -4, 4, 65, 4);
    for (let y = 49; y < 63; y += 5) {
      for (const k of [-1.8, 1.8]) {
        b.span('glass', 0x3a2a26, k - 0.55, y, 4.01, k + 0.55, y + 2.6, 4.05);
        b.span('glass', 0x3a2a26, k - 0.55, y, -4.05, k + 0.55, y + 2.6, -4.01);
        b.span('glass', 0x3a2a26, 4.01, y, k - 0.55, 4.05, y + 2.6, k + 0.55);
        b.span('glass', 0x3a2a26, -4.05, y, k - 0.55, -4.01, y + 2.6, k + 0.55);
      }
    }
    b.span('paint', C.trim, -4.15, 64.6, -4.15, 4.15, 65, 4.15);
    // галерея: белые столбы и шатёр
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.span('paint', C.trim, sx * 3.6 - 0.2, 65, sz * 3.6 - 0.2, sx * 3.6 + 0.2, 69.6, sz * 3.6 + 0.2);
    b.span('paint', C.trim, -4.3, 69.6, -4.3, 4.3, 70.1, 4.3);
    const roof = new THREE.ConeGeometry(6.2, 6.5, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.translate(0, 70.1 + 3.25, 0);
    b.add('roof', roof, C.roof);
    b.cyl('metal', C.bronze, 0, 77.6, 0, 0.12, 2.4, 8);
    const ball = new THREE.SphereGeometry(0.35, 12, 8);
    ball.translate(0, 79, 0);
    b.add('metal', ball, C.bronze);
  }

  /** Крыша депо — старт: тёмный рубероид, белые клетки старта, арка с растяжкой. */
  private depot(b: Batch): void {
    const s = this.map.start;
    b.span('brick', 0xc98a63, s.x0 + 0.2, -26, s.z0 + 0.2, s.x1 - 0.2, s.y - 0.8, s.z1 - 0.2);
    for (let y = -20; y < -2; y += 5) for (let z = s.z0 + 1.5; z < s.z1 - 1; z += 2.6) b.span('glass', C.glass, s.x0 + 0.1, y, z, s.x0 + 0.2, y + 2, z + 1.3);
    this.map.slots.forEach((sl, i) => {
      b.span('paint', C.trim, sl.x - 0.7, s.y + 0.005, sl.z - 0.75, sl.x + 0.7, s.y + 0.02, sl.z - 0.67);
      b.span('paint', C.trim, sl.x - 0.7, s.y + 0.005, sl.z + 0.67, sl.x + 0.7, s.y + 0.02, sl.z + 0.75);
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: signTexture(String(i + 1), '', 128, 128, '#3f8ad4'), transparent: true }));
      // лёжа на крыше, верх цифры — по ходу бега (+x): читается из-за спины
      n.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      n.position.set(sl.x - 1.3, s.y + 0.03, sl.z);
      this.scene.add(n);
    });
    // арка «Старт» на краю крыши
    const ax = s.x1 - 0.35;
    for (const z of [s.z0 + 0.3, s.z1 - 0.3]) b.span('paint', C.red, ax - 0.12, s.y, z - 0.12, ax + 0.12, s.y + 3.6, z + 0.12);
    b.span('paint', C.red, ax - 0.15, s.y + 3.4, s.z0 + 0.2, ax + 0.15, s.y + 3.75, s.z1 - 0.2);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(s.z1 - s.z0 - 1.2, 0.95), new THREE.MeshBasicMaterial({ map: signTexture('НЕБЕСНАЯ КАЛАНЧА', 'старт · 10 участков · колокол наверху', 1024, 192, '#d8342b'), side: THREE.DoubleSide }));
    banner.rotation.y = -Math.PI / 2;
    banner.position.set(ax, s.y + 2.85, (s.z0 + s.z1) / 2);
    this.scene.add(banner);
  }

  /** Площадка по её виду. */
  private pad(b: Batch, pad: SkillPad): void {
    const box = this.map.boxes[pad.box];
    const [x0, y0, z0] = box.min;
    const [x1, y1, z1] = box.max;
    switch (pad.look) {
      case 'tower': case 'belfry': case 'post': case 'disc': case 'start':
        if (pad.look === 'start') {
          b.span('paint', C.tar, x0, y1 - 0.8, z0, x1, y1, z1);
          b.span('paint', C.trim, x1 - 0.12, y1 - 0.8, z0, x1, y1 + 0.01, z1);
        }
        return;
      case 'housing':
        b.span('brick', C.brickDark, x0, y0, z0, x1, y1, z1);
        b.span('glass', 0x231a17, x0 - 0.02, y0 + 1.55, (z0 + z1) / 2 - 1.05, x0 + 0.05, y0 + 2.85, (z0 + z1) / 2 + 1.05);
        return;
      case 'mushroom': {
        const cap = new THREE.Group();
        const w = x1 - x0, d = z1 - z0;
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: 0.45, emissive: 0x4a3600, emissiveIntensity: 0.25 }));
        top.scale.set(w * 1.05, 0.55, d * 1.05);
        const dots = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0 }));
        cap.add(top, dots);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.6, 12), new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.8 }));
        stem.position.y = -0.3;
        cap.add(stem);
        for (let i = 0; i < 6; i++) {
          const spot = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          const a = (i / 6) * Math.PI * 2;
          spot.position.set(Math.cos(a) * w * 0.3, 0.2, Math.sin(a) * d * 0.3);
          spot.lookAt(spot.position.x * 3, 2, spot.position.z * 3);
          cap.add(spot);
        }
        cap.position.set((x0 + x1) / 2, y1 - 0.25, (z0 + z1) / 2);
        cap.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
        this.scene.add(cap);
        this.mushrooms.push({ cap, box: pad.box, squash: 0 });
        return;
      }
      default: {
        const side = pad.cp !== undefined ? 0x2f9e57 : C.safe;
        b.deck(x0, x1, z0, z1, y1, Math.max(0.3, y1 - y0), side);
        this.legs(b, x0, x1, z0, z1, y1 - (y1 - y0));
      }
    }
  }

  /**
   * Опоры площадки: у стены каланчи — консоль (балка в стену и подкос), вдали — столб вниз до нижней площадки или в
   * облака. Ничего не проходит сквозь другие площадки и пути подвижного.
   */
  private legs(b: Batch, x0: number, x1: number, z0: number, z1: number, bottom: number): void {
    if (this.bracket(b, x0, x1, z0, z1, bottom)) return;
    const inset = 0.35;
    const pts: Array<[number, number]> = [[x0 + inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset], [x1 - inset, z0 + inset]];
    let n = 0;
    for (const [x, z] of pts) {
      if (n >= 2) break;
      if (Math.abs(x) < SKILL_TOWER.half + 0.4 && Math.abs(z) < SKILL_TOWER.half + 0.4) continue;
      if (this.map.movers.some((m) => this.moverSwept(m, x, z, bottom))) continue;
      // столб не встаёт на площадку ниже: там бегают — только в облака мимо всех площадок
      if (this.map.boxes.some((bx) => bx.max[1] < bottom - 0.1 && x > bx.min[0] - 0.2 && x < bx.max[0] + 0.2 && z > bx.min[2] - 0.2 && z < bx.max[2] + 0.2)) continue;
      b.beam('wood', C.woodDark, [x, SEA_Y + 1, z], [x, bottom, z], 0.1, 6);
      n++;
    }
  }

  /** Консоль к ближней стене (до 6 м от неё): балка под настилом в стену и подкос. false — стены рядом нет. */
  private bracket(b: Batch, x0: number, x1: number, z0: number, z1: number, bottom: number): boolean {
    const high = bottom >= SKILL_TOWER.top - 0.5;
    const half = high ? SKILL_TOWER.belfry : SKILL_TOWER.half;
    if (bottom > (high ? SKILL_TOWER.gallery : SKILL_TOWER.top) || bottom < 3) return false;
    // грань: по какой оси наружу (u), знак, зазор до стены, отрезок вдоль стены (v)
    const faces: Array<{ ax: 'x' | 'z'; s: 1 | -1; gap: number; v0: number; v1: number; u0: number; u1: number }> = [
      { ax: 'x', s: 1, gap: x0 - half, v0: z0, v1: z1, u0: x0, u1: x1 },
      { ax: 'x', s: -1, gap: -half - x1, v0: z0, v1: z1, u0: -x1, u1: -x0 },
      { ax: 'z', s: 1, gap: z0 - half, v0: x0, v1: x1, u0: z0, u1: z1 },
      { ax: 'z', s: -1, gap: -half - z1, v0: x0, v1: x1, u0: -z1, u1: -z0 },
    ];
    let f: (typeof faces)[number] | null = null;
    for (const c of faces) {
      const lo = Math.max(c.v0, -half + 0.4), hi = Math.min(c.v1, half - 0.4);
      if (c.gap < -0.05 || c.gap > 6.2 || hi - lo < 0.3) continue;
      if (!f || c.gap < f.gap) f = c;
    }
    if (!f) return false;
    const P = (u: number, y: number, v: number): [number, number, number] => f.ax === 'x' ? [f.s * u, y, v] : [v, y, f.s * u];
    const lo = Math.max(f.v0, -half + 0.4), hi = Math.min(f.v1, half - 0.4);
    const vs = hi - lo > 1.6 ? [lo + 0.35, hi - 0.35] : [(lo + hi) / 2];
    const drop = Math.min(3, 1.4 + (f.u1 - half) * 0.35);
    let n = 0;
    for (const v of vs) {
      const outer = f.u0 + (f.u1 - f.u0) * 0.7;
      const a = P(half, bottom - drop, v), c = P(outer, bottom - 0.12, v);
      // подкос не должен пройти сквозь площадку ниже или путь подвижного
      const xa = Math.min(a[0], c[0]) - 0.1, xb = Math.max(a[0], c[0]) + 0.1, za = Math.min(a[2], c[2]) - 0.1, zb = Math.max(a[2], c[2]) + 0.1;
      const hit = this.map.boxes.some((bx) => bx.max[1] > bottom - drop && bx.max[1] < bottom - 0.2 && bx.max[0] > xa && bx.min[0] < xb && bx.max[2] > za && bx.min[2] < zb);
      if (hit || this.map.movers.some((m) => this.moverSwept(m, c[0], c[2], bottom - drop))) continue;
      b.beam('wood', C.woodDark, P(half, bottom - 0.1, v), P(f.u1 - 0.25, bottom - 0.1, v), 0.09, 6);
      b.beam('wood', C.woodDark, a, c, 0.08, 6);
      const p = P(half, bottom - drop - 0.25, v - 0.22), q = P(half + 0.05, bottom - drop + 0.25, v + 0.22);
      b.span('metal', 0x3d4650, Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2]));
      n++;
    }
    return n > 0;
  }

  private moverSwept(m: SkillMover, x: number, z: number, bottom: number): boolean {
    if (m.kind === 'orbit') return Math.abs(z - m.z) < m.d / 2 + 0.4 && Math.abs(x - m.x) < m.r + m.w / 2 + 0.4 && bottom > m.y - m.r;
    const xa = Math.min(m.x, m.x + m.dx) - m.w / 2 - 0.4, xb = Math.max(m.x, m.x + m.dx) + m.w / 2 + 0.4;
    const za = Math.min(m.z, m.z + m.dz) - m.d / 2 - 0.4, zb = Math.max(m.z, m.z + m.dz) + m.d / 2 + 0.4;
    return x > xa && x < xb && z > za && z < zb && bottom > Math.min(m.y, m.y + m.dy) - 1;
  }

  // ------------------------------------------------------------ 2. мельница

  private wheelAndGondolas(b: Batch): void {
    const g = this.map.movers.find((m) => m.look === 'gondola')!;
    const hang = 2.4;
    const hub = new THREE.Vector3(g.x, g.y + hang, 0);
    // опоры оси — от стены каланчи сверху
    for (const z of [-2.9, 2.9]) {
      b.beam('wood', C.woodDark, [6, hub.y + 9, z], [hub.x, hub.y, z], 0.2, 8);
      b.beam('wood', C.woodDark, [6, hub.y + 3, z], [hub.x, hub.y, z], 0.16, 8);
    }
    b.beam('metal', C.steel, [hub.x, hub.y, -3.1], [hub.x, hub.y, 3.1], 0.28, 10);
    this.wheel.position.copy(hub);
    const rimMat = new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.5 });
    const spokeMat = new THREE.MeshStandardMaterial({ color: C.trim, roughness: 0.6 });
    for (const z of [-1.55, 1.55]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(g.r, 0.11, 6, 48), rimMat);
      rim.position.z = z;
      this.wheel.add(rim);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, g.r, 5), spokeMat);
        const a = (i / 8) * Math.PI * 2;
        sp.position.set(Math.sin(a) * g.r * 0.5, -Math.cos(a) * g.r * 0.5, z);
        sp.rotation.z = a;
        this.wheel.add(sp);
      }
    }
    this.scene.add(this.wheel);
    for (const m of this.map.movers) {
      if (m.look !== 'gondola') continue;
      const root = new THREE.Group();
      const floor = new Batch();
      floor.deck(-m.w / 2, m.w / 2, -m.d / 2, m.d / 2, 0, m.h, C.safe);
      for (const z of [-m.d / 2 - 0.12, m.d / 2 + 0.12]) {
        floor.span('paint', C.red, -0.07, -0.1, z - 0.05, 0.07, hang, z + 0.05);
        floor.span('paint', C.red, -m.w / 2, -0.05, z - 0.05, m.w / 2, 0.05, z + 0.05);
      }
      floor.span('paint', C.red, -0.08, hang - 0.08, -m.d / 2 - 0.2, 0.08, hang + 0.08, m.d / 2 + 0.2);
      floor.flush(root, this.mats);
      this.scene.add(root);
      this.gondolas.push(root);
    }
  }

  // ------------------------------------------------------------ мешки

  private sackArms(b: Batch): void {
    const bagMat = this.stripeMat;
    for (const k of this.map.sacks) {
      // откуда висит: у каланчи — кронштейн от стены, над пропастью (шары) — балка на двух столбах
      if (k.sec === 2) {
        b.beam('wood', C.woodDark, [k.px, k.py + 0.25, -6], [k.px, k.py + 0.25, k.pz - 0.4], 0.17, 6);
        b.beam('wood', C.woodDark, [k.px, k.py - 3.2, -6], [k.px, k.py + 0.2, k.pz + 1.2], 0.12, 6);
      } else if (k.sec === 4) {
        b.beam('wood', C.woodDark, [6, k.py + 0.25, 5.5], [k.px + 0.4, k.py + 0.25, k.pz], 0.17, 6);
        b.beam('wood', C.woodDark, [6, k.py - 4, 5.5], [k.px - 2, k.py + 0.2, k.pz - 0.4], 0.12, 6);
      }
      const pivot = new THREE.Group();
      pivot.position.set(k.px, k.py, k.pz);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, k.len - k.r * 0.9, 5), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
      rope.position.y = -(k.len - k.r * 0.9) / 2;
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(k.r * 0.86, k.r * 0.7, 6, 14), bagMat);
      bag.position.y = -k.len;
      bag.castShadow = true;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b4f33 }));
      knot.position.y = -k.len + k.r * 1.15;
      pivot.add(rope, bag, knot);
      this.scene.add(pivot);
      const floorY = k.py - k.len - 1.2;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(k.r * 0.9, 20), new THREE.MeshBasicMaterial({ color: 0x1d2a3a, transparent: true, opacity: 0.32, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 2;
      this.scene.add(shadow);
      this.sacks.push({ pivot, shadow, floorY });
    }
    // балка над пропастью шаров: два столба из облаков
    const s9 = this.map.sacks.filter((k) => k.sec === 8);
    if (s9.length) {
      const x = s9[0].px, y = s9[0].py + 0.3;
      b.beam('wood', C.woodDark, [x, y, 12.2], [x, y, 22.8], 0.22, 8);
      for (const z of [12.2, 22.8]) b.beam('wood', C.woodDark, [x, SEA_Y + 1, z], [x, y + 0.3, z], 0.3, 8);
    }
  }

  // ------------------------------------------------------------ 4. тараны

  private ramsBuild(b: Batch): void {
    for (const r of this.map.rams) {
      const root = new THREE.Group();
      const len = r.stroke + 2.6;
      const log = new THREE.Mesh(new THREE.BoxGeometry(len, (r.y1 - r.y0) * 0.62, r.w * 0.55), new THREE.MeshStandardMaterial({ color: C.woodDark, roughness: 0.8 }));
      log.position.x = -r.dx * (len / 2);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, r.y1 - r.y0, r.w), this.stripeMat);
      head.position.x = r.dx * 0.27;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, (r.y1 - r.y0) * 0.8, r.w * 0.85), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.7 }));
      cap.position.x = r.dx * 0.6;
      root.add(log, head, cap);
      root.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      root.position.set(r.fx, (r.y0 + r.y1) / 2, r.fz);
      this.scene.add(root);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0x5a1612, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lampMat);
      lamp.position.set(r.fx - 0.05, r.y1 + 0.6, r.fz);
      this.scene.add(lamp);
      // предупреждающая разметка на полу полосы удара
      b.span('paint', C.red, r.fx - r.stroke, r.y0 - 0.24, r.fz - r.w / 2 - 0.02, r.fx, r.y0 - 0.235, r.fz - r.w / 2 + 0.1);
      b.span('paint', C.red, r.fx - r.stroke, r.y0 - 0.24, r.fz + r.w / 2 - 0.1, r.fx, r.y0 - 0.235, r.fz + r.w / 2 + 0.02);
      this.rams.push({ root, lamp: lampMat, dx: r.dx, fx: r.fx, puff: 0, last: 'rest' });
      // ход тарана — как часть геометрии: r.stroke, r.dx
      (root.userData as { stroke: number }).stroke = r.stroke;
    }
  }

  // ------------------------------------------------------------ 5. облака

  private cloudsBuild(): void {
    this.map.clouds.forEach((c, i) => {
      const r = c.rect;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.12, transparent: true, opacity: 1 });
      const geo = puffGeometry((r.x1 - r.x0) * 0.62, 0.55, (r.z1 - r.z0) * 0.62, 77 + i * 13, 8);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      const root = new THREE.Group();
      root.add(mesh);
      const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2;
      root.position.set(x, r.y - 0.42, z);
      this.scene.add(root);
      this.clouds.push({ root, mat, x, y: r.y, z, was: 0 });
    });
  }

  // ------------------------------------------------------------ 6. ветер

  private windBuild(b: Batch): void {
    // паруса-ширмы у восточного края настилов: кремовая парусина с красными полосами — видно издалека
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 64;
    const g2 = cv.getContext('2d')!;
    g2.fillStyle = '#f7f0df';
    g2.fillRect(0, 0, 128, 64);
    g2.fillStyle = '#d8342b';
    g2.fillRect(0, 8, 128, 9);
    g2.fillRect(0, 47, 128, 9);
    g2.strokeStyle = '#c9b892';
    g2.lineWidth = 2;
    for (let x = 16; x < 128; x += 32) { g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, 64); g2.stroke(); }
    const sailTex = new THREE.CanvasTexture(cv);
    sailTex.colorSpace = THREE.SRGBColorSpace;
    for (const h of this.map.shelters) {
      const zc = (h.z0 + h.z1) / 2, len = h.z1 - h.z0 + 0.8;
      const deck = this.map.pads.map((p) => this.map.boxes[p.box]).find((bx) => zc > bx.min[2] && zc < bx.max[2] && bx.max[0] > 12 && bx.max[0] < 14 && bx.max[1] > 21);
      const top = deck ? deck.max[1] : 22;
      const x = 13.25;
      for (const z of [zc - len / 2, zc + len / 2]) b.beam('wood', C.woodDark, [x, top - 0.6, z], [x, top + 3.2, z], 0.09, 6);
      const geo = new THREE.PlaneGeometry(len, 2.6, 10, 4);
      geo.rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sailTex, roughness: 0.95, side: THREE.DoubleSide }));
      mesh.position.set(x, top + 1.75, zc);
      mesh.castShadow = false;
      this.scene.add(mesh);
      this.sails.push({ mesh, base: Float32Array.from(geo.getAttribute('position').array) });
    }
    // флажки-вымпелы вдоль настилов: в штиль висят, перед порывом трепещут, в порыв — струной к каланче
    const planks = this.map.pads.filter((p) => p.sec === 5 && p.look === 'plank').map((p) => this.map.boxes[p.box]);
    let n = 0;
    for (const bx of planks) {
      for (const z of [bx.min[2] + 0.2, bx.max[2] - 0.2]) {
        const x = bx.max[0] - 0.15, top = bx.max[1];
        b.beam('paint', C.trim, [x, top, z], [x, top + 2.3, z], 0.04, 5);
        const geo = new THREE.PlaneGeometry(1.1, 0.34, 8, 1);
        geo.translate(-0.55, 0, 0);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: n % 2 ? C.red : C.white, roughness: 0.8, side: THREE.DoubleSide }));
        mesh.position.set(x, top + 2.1, z);
        this.scene.add(mesh);
        this.pennants.push({ mesh, base: Float32Array.from(geo.getAttribute('position').array), phase: n * 1.7 });
        n++;
      }
    }
    // труба восходящего потока
    const u = this.map.updrafts[0];
    b.cyl('brick', C.brick, u.x, (SEA_Y + u.y0 - 0.5) / 2, u.z, u.r * 0.7, u.y0 - 0.5 - SEA_Y, 16, u.r * 0.78);
    b.cyl('paint', C.trim, u.x, u.y0 - 0.45, u.z, u.r * 0.82, 0.3, 16);
  }

  private windStreaks(): THREE.InstancedMesh {
    const geo = new THREE.PlaneGeometry(1.8, 0.05);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, 40);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  private updraftColumn(): THREE.Mesh {
    const u = this.map.updrafts[0];
    const h = u.y1 + 1.5 - u.y0;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          float s = sin((vUv.x * 6.2832 * 3.0) + (vUv.y * 9.0) - uTime * 6.0) * 0.5 + 0.5;
          float band = smoothstep(0.75, 1.0, s);
          float fade = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          gl_FragColor = vec4(1.0, 1.0, 1.0, band * fade * 0.45);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(u.r, u.r * 0.85, h, 24, 1, true), mat);
    mesh.position.set(u.x, u.y0 + h / 2, u.z);
    this.scene.add(mesh);
    return mesh;
  }

  // ------------------------------------------------------------ 7. тележка

  private cartBuild(b: Batch): void {
    const m = this.map.movers.find((x) => x.look === 'cart')!;
    // рельсы под ходом тележки
    for (const dx of [-0.8, 0.8]) b.span('metal', C.steel, m.x + dx - 0.06, m.y - 0.62, m.z - m.d / 2 - 0.2, m.x + dx + 0.06, m.y - 0.5, m.z + m.dz + m.d / 2 + 0.2);
    b.span('wood', C.woodDark, m.x - 1.2, m.y - 0.9, m.z - m.d / 2 - 0.3, m.x + 1.2, m.y - 0.62, m.z + m.dz + m.d / 2 + 0.3);
    const body = new Batch();
    body.span('paint', C.safe, -m.w / 2, -0.55, -m.d / 2, m.w / 2, -0.12, m.d / 2);
    body.span('paint', C.trim, -m.w / 2 - 0.02, -0.16, -m.d / 2 - 0.02, m.w / 2 + 0.02, -0.08, m.d / 2 + 0.02);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.9, 0.9]) body.cyl('metal', 0x2f3337, sx, -0.5, sz, 0.18, 0.12, 10);
    body.flush(this.cart, this.mats);
    const top = new THREE.Mesh(new THREE.BoxGeometry(m.w - 0.2, 0.12, m.d - 0.2), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: 0.5, emissive: 0x4a3600, emissiveIntensity: 0.25 }));
    top.position.y = -0.06;
    this.cart.add(top);
    this.cartTop = top;
    this.scene.add(this.cart);
  }

  // ------------------------------------------------------------ 8. карусель

  private carouselBuild(b: Batch): void {
    const d = this.map.disc;
    b.cyl('metal', C.steel, d.cx, (SEA_Y + d.top - 1) / 2, d.cz, 0.7, d.top - 1 - SEA_Y, 14);
    const deckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const segs = 16;
    const geo = new THREE.CylinderGeometry(d.r + 0.25, d.r + 0.25, 0.5, segs * 4, 1);
    const pos = geo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const cA = new THREE.Color(0xf6e2b6), cB = new THREE.Color(0x7fb8ec), cRim = new THREE.Color(C.safe);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const a = Math.atan2(z, x);
      const k = Math.floor(((a + Math.PI) / (Math.PI * 2)) * segs) % 2;
      const r = Math.hypot(x, z);
      const c = y < 0.2 || r > d.r + 0.1 ? cRim : k ? cA : cB;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const deck = new THREE.Mesh(geo, deckMat);
    deck.position.y = -0.25;
    deck.receiveShadow = true;
    this.disc.add(deck);
    // столбики на краю (крутятся с диском)
    for (const bm of this.map.bumpers) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(bm.rad, bm.rad, bm.y1 - bm.y0, 16), this.stripeMat);
      post.position.set(Math.cos(bm.a0) * bm.r0, (bm.y1 - bm.y0) / 2, Math.sin(bm.a0) * bm.r0);
      post.castShadow = true;
      const topCap = new THREE.Mesh(new THREE.SphereGeometry(bm.rad, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.4 }));
      topCap.position.set(post.position.x, bm.y1 - bm.y0, post.position.z);
      this.disc.add(post, topCap);
    }
    this.disc.position.set(d.cx, d.top, d.cz);
    this.scene.add(this.disc);
    // перекладина: через ось, красно-белая, на уровне колен
    const bar = this.map.bar;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(bar.len * 2, bar.y1 - bar.y0, bar.r * 2), this.stripeMat);
    beam.position.y = (bar.y0 + bar.y1) / 2 - d.top;
    beam.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 1.6, 16), new THREE.MeshStandardMaterial({ color: C.red, roughness: 0.4 }));
    hub.position.y = 0.8;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: C.yellow, roughness: 0.4 }));
    ball.position.y = 1.85;
    this.bar.add(beam, hub, ball);
    this.bar.position.set(d.cx, d.top, d.cz);
    this.scene.add(this.bar);
  }

  // ------------------------------------------------------------ 9. шары

  private balloonsBuild(_b: Batch): void {
    const colors = [[C.red, 0xffd23f], [C.safe, 0xffffff]];
    this.map.movers.forEach((m, i) => {
      if (m.look !== 'basket') return;
      const root = new THREE.Group();
      const body = new Batch();
      body.span('wood', C.wicker, -m.w / 2, -m.h, -m.d / 2, m.w / 2, -0.06, m.d / 2);
      body.deck(-m.w / 2, m.w / 2, -m.d / 2, m.d / 2, 0, 0.12, C.safe);
      body.span('wood', 0x7a5129, -m.w / 2 - 0.05, -0.02, -m.d / 2 - 0.05, m.w / 2 + 0.05, 0.12, -m.d / 2 + 0.07);
      body.span('wood', 0x7a5129, -m.w / 2 - 0.05, -0.02, m.d / 2 - 0.07, m.w / 2 + 0.05, 0.12, m.d / 2 + 0.05);
      // стропы к шару — по углам, снаружи
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.beam('wood', 0x6b4f33, [sx * (m.w / 2 + 0.05), 0, sz * (m.d / 2 + 0.05)], [sx * 1.2, 5.4, sz * 1.2], 0.03, 4);
      body.flush(root, this.mats);
      // шар: полосатый купол
      const pair = colors[this.baskets.length % 2];
      const env = new THREE.SphereGeometry(3.1, 24, 16);
      const pos = env.getAttribute('position');
      const col = new Float32Array(pos.count * 3);
      const ca = new THREE.Color(pair[0]), cb = new THREE.Color(pair[1]);
      for (let k = 0; k < pos.count; k++) {
        const a = Math.atan2(pos.getZ(k), pos.getX(k));
        const c = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 12) % 2 ? ca : cb;
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        if (pos.getY(k) < 0) pos.setY(k, pos.getY(k) * 1.25);
      }
      env.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const balloon = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
      balloon.position.y = 9.2;
      root.add(balloon);
      this.scene.add(root);
      this.baskets.push(root);
      void i;
    });
  }

  // ------------------------------------------------------------ 10. лестница

  private stairsBuild(): void {
    const wood = new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.85 });
    const side = new THREE.MeshStandardMaterial({ color: C.safe, roughness: 0.6 });
    for (const st of this.map.steps) {
      const r = st.rect;
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), wood);
      top.position.y = -0.05;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.35, d - 0.04), side);
      body.position.y = -0.27;
      top.castShadow = body.castShadow = true;
      top.receiveShadow = true;
      g.add(top, body);
      g.position.set((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2);
      this.scene.add(g);
      this.steps.push({ mesh: g, x: g.position.x, y: r.y, z: g.position.z, s: st.s, down: false });
    }
  }

  // ------------------------------------------------------------ колокол

  private bellBuild(b: Batch): void {
    const bell = this.map.bell;
    b.span('wood', C.woodDark, -3.6, 69.25, -0.2, 3.6, 69.6, 0.2);
    const pts: THREE.Vector2[] = [];
    const h = bell.y1 - bell.y0;
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const r = 0.42 + 0.62 * Math.pow(k, 1.6) + (k > 0.92 ? (k - 0.92) * 2.2 : 0);
      pts.push(new THREE.Vector2(r, h * (1 - k)));
    }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ color: C.bronze, roughness: 0.32, metalness: 0.75, side: THREE.DoubleSide }));
    shell.position.y = -h;
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x5b4a2e, metalness: 0.6, roughness: 0.4 }));
    tongue.position.y = -h + 0.25;
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), shell.material);
    crown.position.y = 0.12;
    this.bell.add(shell, tongue, crown);
    this.bell.position.set(0, bell.y1 + 0.2, 0);
    this.bell.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.scene.add(this.bell);
  }

  /** Позвонили в колокол: качнуть. */
  ringBell(power = 1): void {
    this.bellVel += 2.4 * power;
  }

  // ------------------------------------------------------------ флаги и таблички

  private flagsBuild(b: Batch): void {
    this.map.checkpoints.forEach((cp, i) => {
      if (i === 0) return;
      const fx = cp.x1 - 0.35, fz = cp.z0 + 0.35;
      b.beam('paint', C.trim, [fx, cp.y, fz], [fx, cp.y + 3.1, fz], 0.05, 6);
      const geo = new THREE.PlaneGeometry(1.2, 0.75, 10, 2);
      geo.translate(0.6, 0, 0);
      const mat = new THREE.MeshStandardMaterial({ color: C.green, roughness: 0.8, side: THREE.DoubleSide });
      const cloth = new THREE.Mesh(geo, mat);
      cloth.position.set(fx, cp.y + 2.7, fz);
      cloth.rotation.y = cp.yaw + Math.PI / 2;
      this.scene.add(cloth);
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffb400, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3 }));
      star.position.set(fx, cp.y + 3.35, fz);
      star.visible = false;
      this.scene.add(star);
      this.flags.push({ cloth, base: Float32Array.from(geo.getAttribute('position').array), cp: i, mat, star });
      // табличка участка: номер и название — у начала участка
      const sec = SKILL_SECTIONS[Math.min(i, SKILL_SECTIONS.length - 1)];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.49), new THREE.MeshBasicMaterial({ map: signTexture(`${i + 1}. ${sec.name}`, `флажок ${i}`, 512, 192), side: THREE.DoubleSide }));
      sign.position.set(fx, cp.y + 1.35, fz);
      sign.rotation.y = cp.yaw;
      this.scene.add(sign);
    });
  }

  // ------------------------------------------------------------ кадр

  /** t — время мира в тиках (с дробью), cp — последняя взятая точка, dt — секунды кадра. */
  update(t: number, cp: number, dt: number): void {
    const time = t / TICK;
    this.skyMat.uniforms.uTime.value = time;
    this.seaMat.uniforms.uTime.value = time;
    (this.updraft.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    const map = this.map;
    const p = this.p;
    // мельница
    const g0 = map.movers.find((m) => m.look === 'gondola');
    if (g0) this.wheel.rotation.z = -orbitAngle(g0.period, g0.phase, t);
    let gi = 0, bi = 0;
    for (const m of map.movers) {
      moverAt(m, t, p);
      if (m.look === 'gondola') {
        const root = this.gondolas[gi++];
        root.position.set(p.x, p.y, p.z);
        root.rotation.z = Math.sin(time * 1.3 + gi) * 0.015;
      } else if (m.look === 'cart') {
        this.cart.position.set(p.x, p.y, p.z);
        this.cartSquash = Math.max(0, this.cartSquash - dt * 4);
        this.cartTop.scale.y = 1 + this.cartSquash * 2.5;
      } else if (m.look === 'basket') {
        const root = this.baskets[bi++];
        root.position.set(p.x, p.y, p.z);
        root.rotation.z = Math.sin(time * 0.8 + bi) * 0.01;
      }
    }
    // мешки
    map.sacks.forEach((k, i) => {
      const s = sackAt(k, t, this.sack);
      const v = this.sacks[i];
      if (k.axis === 'z') v.pivot.rotation.x = -s.a;
      else v.pivot.rotation.z = s.a;
      const hh = Math.max(0, s.y - v.floorY);
      v.shadow.position.set(s.x, v.floorY + 1.2 + 0.03, s.z);
      const near = THREE.MathUtils.clamp(1 - hh / 5, 0, 1);
      (v.shadow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.3 * near;
      v.shadow.scale.setScalar(0.7 + 0.5 * near);
    });
    // тараны: замах — отъезжает и мигает лампа; удар — пыль у торца
    map.rams.forEach((r, i) => {
      const st = ramState(r.phase, t, this.ram);
      const v = this.rams[i];
      v.root.position.x = r.fx + r.dx * r.stroke * st.e;
      const warn = st.phase === 'wind' ? 0.5 + 0.5 * Math.sin(st.k * Math.PI * 7) : st.phase === 'strike' || st.phase === 'hold' ? 1 : 0;
      v.lamp.emissiveIntensity = warn * 2.2;
      if (st.phase === 'hold' && v.last === 'strike') this.onPuff?.(r.fx + r.dx * r.stroke, (r.y0 + r.y1) / 2, r.fz, 'dust');
      v.last = st.phase;
      if (st.phase === 'wind') v.root.position.y = (r.y0 + r.y1) / 2 + Math.sin(time * 60) * 0.015;
      else v.root.position.y = (r.y0 + r.y1) / 2;
    });
    // облака
    map.clouds.forEach((c, i) => {
      const v = this.clouds[i];
      const s = cloudState(c.phase, t);
      if (s < 0) {
        const re = cloudReform(c.phase, t);
        v.root.visible = re > 0;
        v.mat.opacity = re;
        v.root.scale.setScalar(0.3 + 0.7 * re);
        v.root.position.set(v.x, v.y - 0.42 - (1 - re) * 0.6, v.z);
        if (v.was >= 0) this.onPuff?.(v.x, v.y - 0.3, v.z, 'cloud');
      } else {
        v.root.visible = true;
        v.mat.opacity = 1 - s * 0.35;
        const shake = s > 0 ? s * 0.09 : 0;
        v.root.position.set(v.x + Math.sin(time * 47 + i) * shake, v.y - 0.42 + Math.sin(time * 1.2 + i) * 0.04, v.z + Math.cos(time * 41 + i) * shake);
        v.root.scale.set(1 - s * 0.12, 1 - s * 0.3, 1 - s * 0.12);
        v.mat.color.setRGB(1 - s * 0.32, 1 - s * 0.25, 1 - s * 0.12);
      }
      v.was = s;
    });
    // ветер: вымпелы, паруса, струи
    const wz = map.winds[0];
    const w = wz ? windState(wz.phase, t) : 0;
    for (const pn of this.pennants) this.flutter(pn.mesh, pn.base, time, pn.phase, w, true);
    for (const sl of this.sails) this.billow(sl.mesh, sl.base, time, w);
    this.streaksUpdate(time, w);
    // карусель
    this.disc.rotation.y = -discAngle(map, t);
    this.bar.rotation.y = -barAngle(map, t);
    // грибы
    for (const m of this.mushrooms) {
      m.squash = Math.max(0, m.squash - dt * 3.2);
      const k = Math.sin(m.squash * Math.PI * 2.5) * m.squash;
      m.cap.scale.set(1 + k * 0.25, 1 - k * 0.45, 1 + k * 0.25);
    }
    // ступени: дрожь → падают, отлетая; в конце цикла взлетают на место
    const front = crumbleFront(t);
    const left = CRUMBLE_PERIOD - cyc(t, 0, CRUMBLE_PERIOD);
    for (const st of this.steps) {
      const s = crumbleState(st.s, t);
      const m = st.mesh;
      if (s < 0) {
        if (left < 30) {
          const k = 1 - left / 30;
          m.visible = true;
          m.position.set(st.x, st.y - (1 - k) * (1 - k) * 7, st.z);
          m.rotation.set(0, 0, 0);
        } else {
          const tau = (front - st.s) / CRUMBLE_SPEED;
          m.visible = tau < 1.2;
          m.position.set(st.x, st.y - 4.9 * tau * tau, st.z);
          m.rotation.set(tau * 1.3, 0, tau * 0.8);
          if (!st.down) this.onPuff?.(st.x, st.y - 0.2, st.z, 'step');
        }
        st.down = true;
      } else {
        st.down = false;
        m.visible = true;
        const j = s > 0 ? s * 0.06 : 0;
        m.position.set(st.x + Math.sin(time * 53 + st.s) * j, st.y + Math.sin(time * 61 + st.s * 3) * j * 0.5, st.z + Math.cos(time * 47 + st.s) * j);
        m.rotation.set(0, 0, s > 0 ? Math.sin(time * 37) * 0.04 * s : 0);
      }
    }
    // флаги: взятые — со звездой, следующий — ярче
    for (const f of this.flags) {
      const passed = f.cp <= cp;
      f.star.visible = passed;
      f.star.rotation.y = time * 2;
      f.mat.color.setHex(passed ? 0x8fd19e : C.green);
      f.mat.emissive.setHex(f.cp === cp + 1 ? 0x1d6b2e : 0x000000);
      this.flutter(f.cloth, f.base, time, f.cp * 1.3, 0.25, false);
    }
    // колокол
    this.bellVel += (-this.bellSwing * 9 - this.bellVel * 0.9) * dt;
    this.bellSwing += this.bellVel * dt;
    this.bell.rotation.x = this.bellSwing * 0.35;
    if (this.quality !== 'low') this.gulls.update(time);
  }

  /** Мешки, грибы, тележка: отскок — сплющить. */
  squashAt(box: number): void {
    for (const m of this.mushrooms) if (m.box === box) m.squash = 1;
    const cart = this.map.movers.find((m) => m.look === 'cart');
    if (cart && cart.box === box) this.cartSquash = 1;
  }

  /** Площадка-гриб или тележка под ногами (x, y, z) — индекс бокса или −1. */
  bouncerUnder(x: number, y: number, z: number): number {
    const w = this.collision;
    const check = (b: number): boolean => Math.abs(w.maxY[b] - y) < 0.05 && x > w.minX[b] - 0.5 && x < w.maxX[b] + 0.5 && z > w.minZ[b] - 0.5 && z < w.maxZ[b] + 0.5;
    for (const m of this.mushrooms) if (check(m.box)) return m.box;
    const cart = this.map.movers.find((m) => m.look === 'cart');
    if (cart && check(cart.box)) return cart.box;
    return -1;
  }

  private flutter(mesh: THREE.Mesh, base: Float32Array, time: number, phase: number, wind: number, toTower: boolean): void {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const strong = wind >= 1 ? 1 : wind > 0 ? 0.55 + wind * 0.3 : 0;
    const speed = 4 + strong * 14;
    const amp = 0.08 + (wind > 0 && wind < 1 ? 0.12 : 0) + strong * 0.04;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const along = Math.abs(x);
      const droop = toTower ? (1 - strong) * along * 0.75 : along * 0.08;
      pos.setXYZ(i, x * (toTower ? 0.75 + strong * 0.25 : 1), y - droop, Math.sin(time * speed + along * 4 + phase) * amp * along);
    }
    pos.needsUpdate = true;
    if (toTower) mesh.rotation.y = 0;
  }

  private billow(mesh: THREE.Mesh, base: Float32Array, time: number, wind: number): void {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const push = wind >= 1 ? 0.55 : wind > 0 ? 0.2 * wind : 0.08;
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1], z = base[i * 3 + 2];
      const k = (1 - (z / 1.6) ** 2) * (1 - (y / 1.3) ** 2);
      pos.setXYZ(i, base[i * 3] - push * Math.max(0, k) - Math.sin(time * 6 + z) * 0.02 * k, y, z);
    }
    pos.needsUpdate = true;
  }

  private streaksUpdate(time: number, wind: number): void {
    const wz = this.map.winds[0];
    const on = wind >= 1 ? 1 : wind > 0 ? wind * 0.25 : 0;
    (this.streaks.material as THREE.MeshBasicMaterial).opacity = 0.5 * on;
    this.streaks.visible = on > 0.01 && !!wz;
    if (!this.streaks.visible) return;
    const d = this.dummy;
    for (let i = 0; i < 40; i++) {
      const r = ((i * 0.618) % 1);
      const span = wz.x1 - wz.x0;
      const x = wz.x1 - ((time * 26 + r * span * 3) % span);
      d.position.set(x, wz.y0 + 1 + ((i * 0.37) % 1) * (wz.y1 - wz.y0 - 2), wz.z0 + ((i * 0.53) % 1) * (wz.z1 - wz.z0));
      d.rotation.set(0, 0, 0);
      d.scale.set(0.6 + ((i * 0.29) % 1), 1, 1);
      d.updateMatrix();
      this.streaks.setMatrixAt(i, d.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }

  setQuality(q: Quality, slow = false): void {
    this.quality = slow ? 'low' : q;
    this.detail.visible = this.quality !== 'low';
    const size = this.quality === 'high' || this.quality === 'auto' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.refreshShadows();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, SKY_DAY.exposure);
  }

  /** Прямоугольник цели (для подсказок на экране). */
  rectOf(cp: number): SkillRect {
    return this.map.checkpoints[Math.min(cp, this.map.checkpoints.length - 1)];
  }
}

function mergeGeo(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // все части уже с цветами и без развёрток
  const pos: number[] = [];
  const col: number[] = [];
  const nor: number[] = [];
  for (const g of list) {
    const p = g.getAttribute('position'), c = g.getAttribute('color'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      col.push(c.getX(i), c.getY(i), c.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
