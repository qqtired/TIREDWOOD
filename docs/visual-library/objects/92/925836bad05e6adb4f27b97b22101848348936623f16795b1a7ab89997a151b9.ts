// Набор для живых сцен лаборатории на коде игры: диорама (деревянный настил посреди моря, небо и море игры в ясный
// день, праздничный свет), желейка на настоящем Avatar, брызги, круги на воде и надписи. Этот модуль тянет three.js и
// код отрисовки, поэтому страница грузит его только после нажатия «Живое превью» (stage.ts), а файлы прототипов видят
// из него одни типы и получают всё нужное через ctx.kit.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { ACT_DANCE, ACT_LAUGH, ACT_NONE, ACT_SIT, ACT_TIRED, ACT_WAVE } from '../../shared/lobby.ts';
import { DEFAULT_OUTFIT, PALETTE, type Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { LobbyFx } from '../lobby/fx.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { glowSprite } from '../render/kit.ts';
import { installLookTone, lookTone, paintMaterial, type PaintOptions } from '../render/lookpaint.ts';
import { LOOK_EVENING, lookSea, lookSky } from '../render/looksky.ts';
import { makeSea, makeSky, type SkyPalette } from '../render/sky.ts';

/** Действия желейки (как в игре) */
export const ACT = { none: ACT_NONE, wave: ACT_WAVE, dance: ACT_DANCE, tired: ACT_TIRED, laugh: ACT_LAUGH, sit: ACT_SIT } as const;

/** Ясный день: высокое солнце, белые крупные облака, бирюзовое море */
const DAY: SkyPalette = {
  ...LOOK_EVENING,
  sunDir: new THREE.Vector3(-0.36, 0.3, -0.88).normalize(),
  horizon: 0xcdeaf7,
  mid: 0x84c5f2,
  zenith: 0x2f86e0,
  sunGlow: 0xfff0c0,
  cloud: [0.78, 0.85, 0.97],
  cloudLit: [1.2, 1.16, 1.08],
  clouds: { cover: 0.46, alpha: 1.0, top: 1.0 },
  deep: 0x1790b4,
  shallow: 0x4fd1c8,
  exposure: 1.0,
  fogNear: 90,
  fogFar: 700,
  sun: 1,
};

const SUN_COLOR = 0xffe2b0;
const SUN_I = 3.0;
const HEMI_SKY = 0xbcd9ff;
const HEMI_GROUND = 0xe6c39a;
const HEMI_I = 1.35;
/** Верх настила */
export const DECK_Y = 0;

const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export interface DioramaOpts {
  /** Радиус настила, м */
  radius?: number;
  /** Где стоит камера и куда смотрит; поле зрения */
  cam?: [number, number, number];
  look?: [number, number, number];
  fov?: number;
  /** Рамка из столбиков и каната по дальнему краю */
  rail?: boolean;
}

export interface JellyOpts {
  name?: string;
  outfit?: Partial<Outfit>;
  x?: number;
  z?: number;
  yaw?: number;
}

/** Желейка на настоящем Avatar: ставится позой (x, y, z, yaw), всё остальное — анимация игры. */
export class Jelly {
  readonly avatar: Avatar;
  readonly pos = new THREE.Vector3();
  /** Куда смотрит: 0 — в −Z (от камеры), π — на камеру */
  yaw = 0;
  grounded = true;
  /** Табличка с именем: на кувырке прячется, чтобы не кружилась вверх ногами */
  nameTag: THREE.Sprite | null = null;
  /** Кувырок вперёд вокруг середины тела, рад (положительный — лицом вниз) */
  flip = 0;
  private readonly pose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };

  constructor(avatar: Avatar) {
    this.avatar = avatar;
  }

  /** Развернуться к точке */
  face(x: number, z: number): void {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-6) this.yaw = Math.atan2(-dx, -dz);
  }

  action(act: number, arg = 0): void {
    this.avatar.setAction(act, arg);
  }

  /** Высота над настилом, на которой центр тела (для подписей и эффектов) */
  get head(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
  }

  update(dt: number, t: number, camPos: THREE.Vector3): void {
    const p = this.pose;
    p.x = this.pos.x;
    p.y = this.pos.y;
    p.z = this.pos.z;
    p.yaw = this.yaw;
    p.flags = E_ALIVE | (this.grounded ? E_GROUNDED : 0);
    this.avatar.update(p, dt, t, GROUND, camPos, false);
    const root = this.avatar.root;
    if (this.nameTag) this.nameTag.visible = this.flip === 0;
    if (this.flip !== 0) {
      // кувырок вокруг середины тела: поворачиваем в осях желейки и возвращаем центр на место
      const c = 0.8;
      root.rotation.order = 'YXZ';
      root.rotation.x = -this.flip;
      root.position.y += c - c * Math.cos(this.flip);
      const dz = c * Math.sin(this.flip);
      root.position.x += dz * Math.sin(this.yaw);
      root.position.z += dz * Math.cos(this.yaw);
    } else if (root.rotation.x !== 0) {
      root.rotation.x = 0;
    }
  }
}

const GROUND = { groundBelow: (): number => DECK_Y };

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Брызги и кусочки: пул шариков с тяжестью (сок, вода, зёрнышки). */
export class Spray {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number }> = [];
  private next = 0;
  private readonly gravity: number;

  constructor(scene: THREE.Scene, count = 90, gravity = 9.8) {
    this.gravity = gravity;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < count; i++) {
      this.list.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0 });
      this.mesh.setColorAt(i, _c.set(0xffffff));
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    scene.add(this.mesh);
  }

  /** n шариков из точки: speed — скорость вразлёт, up — доля скорости вверх */
  burst(x: number, y: number, z: number, n: number, color: number, speed = 3, up = 0.7, size = 0.06): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.list.length;
      const p = this.list[i]!;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * r * speed;
      p.vz = Math.sin(a) * r * speed;
      p.vy = (0.35 + Math.random() * 0.65) * speed * up + 0.8;
      p.max = p.life = 0.8 + Math.random() * 0.7;
      p.size = size * (0.6 + Math.random() * 0.9);
      this.mesh.setColorAt(i, _c.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i]!;
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy -= this.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.life > 0 ? Math.min(1, Math.sqrt(p.life / p.max) * 1.6) : 0;
      _s.setScalar(p.size * k);
      this.mesh.setMatrixAt(i, _m.compose(_v.set(p.x, p.y, p.z), _q.identity(), _s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Круги на воде: расходятся и гаснут. */
export class Ripples {
  private readonly rings: Array<{ mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; age: number; life: number; size: number }> = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 14) {
    const geo = new THREE.RingGeometry(0.82, 1, 44);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: 0 }));
      mesh.visible = false;
      mesh.renderOrder = 3;
      scene.add(mesh);
      this.rings.push({ mesh, age: 1, life: 1, size: 1 });
    }
  }

  spawn(x: number, z: number, size = 1.2, life = 1.6): void {
    const r = this.rings[this.next]!;
    this.next = (this.next + 1) % this.rings.length;
    r.age = 0;
    r.life = life;
    r.size = size;
    r.mesh.position.set(x, WATER_Y + 0.04, z);
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.15 + r.size * (1 - (1 - k) * (1 - k)));
      r.mesh.material.opacity = Math.pow(1 - k, 1.5) * 0.9;
    }
  }
}

function plankTexture(): THREE.CanvasTexture {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const rows = 16;
  const h = S / rows;
  for (let i = 0; i < rows; i++) {
    const hue = 28 + rnd() * 7;
    g.fillStyle = `hsl(${hue} ${34 + rnd() * 10}% ${50 + rnd() * 8}%)`;
    g.fillRect(0, i * h, S, h);
    g.lineWidth = 2;
    g.strokeStyle = `hsla(${hue} 30% 32% / .22)`;
    for (let k = 0; k < 7; k++) {
      const y = i * h + 8 + rnd() * (h - 16);
      g.beginPath();
      g.moveTo(rnd() * S * 0.3, y);
      g.lineTo(S * 0.45 + rnd() * S * 0.55, y + (rnd() - 0.5) * 4);
      g.stroke();
    }
    g.fillStyle = 'hsla(25 45% 30% / .5)';
    g.fillRect(rnd() * S, i * h, 3, h);
    g.fillStyle = 'hsla(24 50% 26% / .72)';
    g.fillRect(0, i * h, S, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Освободить сцену: геометрии, материалы и их текстуры (общие ресурсы желеек не трогаем — они снимаются раньше). */
function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const std = mat as THREE.MeshStandardMaterial;
      std.map?.dispose();
      mat.dispose();
    }
  });
}

/** Крупная надпись в воздухе (счёт, вердикт): одна на место, меняется с хлопком */
export interface Badge {
  show(text: string, color?: string): void;
  hide(): void;
}

/** Сцена-диорама: всё, что нужно для праздничного кадра. Прототип добавляет в неё своё и зовёт update. */
export class Diorama {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly target: THREE.Vector3;
  readonly fx: LobbyFx;
  readonly spray: Spray;
  readonly ripples: Ripples;
  readonly radius: number;
  readonly jellies: Jelly[] = [];
  readonly sun: THREE.DirectionalLight;
  private readonly paint: PaintOptions;
  private readonly sky: ReturnType<typeof makeSky>;
  private readonly sea: ReturnType<typeof makeSea>;
  private nextId = 9000;
  private readonly badges: Array<{ s: THREE.Sprite; pop: number; w: number }> = [];

  constructor(o: DioramaOpts = {}) {
    installLookTone();
    const scene = this.scene;
    scene.userData.toneMapping = THREE.CustomToneMapping;
    const fog = lookTone(new THREE.Color(DAY.horizon), DAY.exposure);
    scene.fog = new THREE.Fog(fog, DAY.fogNear, DAY.fogFar);
    scene.background = fog.clone();

    this.sky = makeSky(DAY);
    lookSky(this.sky.material);
    this.sea = makeSea(DAY);
    lookSea(this.sea.material);
    scene.add(this.sky, this.sea);
    // тёплый ореол вокруг диска: солнце читается и на маленькой карточке
    const halo = glowSprite(0xffeaa6, 210, 0.42);
    halo.material.fog = false;
    halo.position.copy(DAY.sunDir).multiplyScalar(1200);
    halo.renderOrder = -9;
    scene.add(halo);

    this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_I);
    this.sun.position.set(-4, 9, 7);
    scene.add(this.sun, new THREE.HemisphereLight(HEMI_SKY, HEMI_GROUND, HEMI_I));
    const lum = 0.2126 * ((SUN_COLOR >> 16) / 255) + 0.7152 * (((SUN_COLOR >> 8) & 255) / 255) + 0.0722 * ((SUN_COLOR & 255) / 255);
    this.paint = { grain: !TOUCH, uniforms: { uLookShade: { value: new THREE.Color(0.9, 0.96, 1.22) }, uLookSunInv: { value: 1.6 / (SUN_I * lum) } } };

    this.radius = o.radius ?? 6.2;
    const cam = o.cam ?? [0, 2.9, 9.4];
    const look = o.look ?? [0, 2.15, 0];
    this.camera = new THREE.PerspectiveCamera(o.fov ?? 52, 16 / 10, 0.1, 4000);
    this.camera.position.set(...cam);
    this.target = new THREE.Vector3(...look);
    this.camera.lookAt(this.target);

    this.buildDeck(o.rail !== false);
    this.fx = new LobbyFx(scene, 'medium');
    this.spray = new Spray(scene);
    this.ripples = new Ripples(scene);
  }

  /** Освещённый материал в виде игры («рисованный»: мягкий свет и неровность цвета) */
  mat(color: number, o: { rough?: number; metal?: number; emissive?: number; map?: THREE.Texture | null } = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, map: o.map ?? null });
    if (o.emissive !== undefined) {
      m.emissive.set(o.emissive);
      m.emissiveIntensity = 0.6;
    }
    paintMaterial(m, this.paint);
    return m;
  }

  box(w: number, h: number, d: number, color: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    parent.add(mesh);
    return mesh;
  }

  cyl(rTop: number, rBottom: number, h: number, color: number, parent: THREE.Object3D = this.scene, seg = 20): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), this.mat(color));
    parent.add(mesh);
    return mesh;
  }

  ball(r: number, color: number, parent: THREE.Object3D = this.scene, seg = 20): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.7)), this.mat(color));
    parent.add(mesh);
    return mesh;
  }

  /** Светящаяся точка (искра фитиля, огонь) */
  glow(color: number, size: number, opacity = 0.8): THREE.Sprite {
    const s = glowSprite(color, size, opacity);
    this.scene.add(s);
    return s;
  }

  /** Новая желейка на настиле */
  jelly(o: JellyOpts = {}): Jelly {
    const a = new Avatar(this.nextId++, { voice: false });
    a.setOutfit({ ...DEFAULT_OUTFIT, h: 'none', ...o.outfit });
    a.setInfo('', null, false, 1);
    a.addTo(this.scene);
    const j = new Jelly(a);
    if (o.name) this.tag(j, o.name);
    j.pos.set(o.x ?? 0, DECK_Y, o.z ?? 0);
    j.yaw = o.yaw ?? 0;
    this.jellies.push(j);
    j.update(0.016, 0, this.camera.position);
    return j;
  }

  /** Табличка с именем над желейкой (в кадре карточки табличка игры мелкая, поэтому своя) */
  tag(j: Jelly, text: string, fg = '#3a2b31'): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 112;
    const g = c.getContext('2d')!;
    g.font = '700 58px Rubik, system-ui, sans-serif';
    const w = Math.min(300, g.measureText(text).width + 56);
    g.fillStyle = 'rgba(255, 252, 244, 0.94)';
    g.beginPath();
    g.roundRect((320 - w) / 2, 10, w, 92, 46);
    g.fill();
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 160, 58);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    s.scale.set(1.15, 0.4, 1);
    s.position.y = 2.25;
    s.renderOrder = 5;
    j.avatar.root.add(s);
    j.nameTag = s;
    return s;
  }

  /** Плоскость с рисунком, нарисованным на холсте (вывеска, шкала); px — ширина холста */
  panel(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = Math.round((px * h) / w);
    draw(c.getContext('2d')!, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(0xffffff, { map: tex, rough: 0.8 }));
  }

  /** Надпись в воздухе: ширина w метров, показывается и меняется через show */
  badge(x: number, y: number, z: number, w = 3.4): Badge {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 192;
    const g = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    s.position.set(x, y, z);
    s.scale.set(w, (w * 192) / 768, 1);
    s.renderOrder = 6;
    s.visible = false;
    this.scene.add(s);
    const st = { s, pop: 0, w };
    this.badges.push(st);
    return {
      show: (text, color = '#ffffff') => {
        g.clearRect(0, 0, 768, 192);
        let size = 120;
        g.font = `900 ${size}px Rubik, system-ui, sans-serif`;
        while (g.measureText(text).width > 700 && size > 36) {
          size -= 6;
          g.font = `900 ${size}px Rubik, system-ui, sans-serif`;
        }
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        g.shadowColor = 'rgba(255, 190, 70, 0.9)';
        g.shadowBlur = 22;
        g.lineWidth = 16;
        g.strokeStyle = '#2a1206';
        g.strokeText(text, 384, 100);
        g.shadowBlur = 0;
        g.fillStyle = color;
        g.fillText(text, 384, 100);
        tex.needsUpdate = true;
        s.visible = true;
        st.pop = 1;
      },
      hide: () => {
        s.visible = false;
      },
    };
  }

  /** Убрать желейку со сцены (например, лишнюю из цепочки) */
  removeJelly(j: Jelly): void {
    const i = this.jellies.indexOf(j);
    if (i >= 0) this.jellies.splice(i, 1);
    j.avatar.dispose(this.scene);
  }

  update(dt: number, t: number): void {
    (this.sky.material.uniforms.uTime as THREE.IUniform<number>).value = t;
    (this.sea.material.uniforms.uTime as THREE.IUniform<number>).value = t;
    for (const j of this.jellies) j.update(dt, t, this.camera.position);
    for (const b of this.badges) {
      b.pop = Math.max(0, b.pop - dt * 3.2);
      const k = 1 + 0.3 * b.pop * b.pop;
      b.s.scale.set(b.w * k, ((b.w * 192) / 768) * k, 1);
    }
    this.fx.update(dt);
    this.spray.update(dt);
    this.ripples.update(dt);
  }

  dispose(): void {
    for (const j of this.jellies) j.avatar.dispose(this.scene);
    this.jellies.length = 0;
    disposeTree(this.scene);
    this.scene.clear();
  }

  /** Праздничные флажки между двумя мачтами за дальним краем настила */
  private bunting(): void {
    const R = this.radius - 0.25;
    const x0 = -R * 0.93;
    const x1 = R * 0.93;
    const z = -R * 0.36;
    const top = 2.7;
    for (const x of [x0, x1]) {
      const mast = this.cyl(0.06, 0.09, top, 0x9a6a3a, this.scene, 8);
      mast.position.set(x, DECK_Y + top / 2, z);
      this.ball(0.1, 0xffd23f, this.scene, 10).position.set(x, DECK_Y + top + 0.05, z);
    }
    const sag = 0.55;
    const at = (u: number): THREE.Vector3 => new THREE.Vector3(x0 + (x1 - x0) * u, DECK_Y + top - 0.1 - 4 * sag * u * (1 - u), z);
    const string: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) string.push(at(i / 24));
    this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(string), 48, 0.012, 5), this.mat(0x4a3a30)));
    const colors = [0xff5a5f, 0xffd23f, 0x4a63ff, 0x5ccf7a, 0xff9ec7, 0xff8a1c].map((c) => new THREE.Color(c));
    const n = 17;
    const pos: number[] = [];
    const col: number[] = [];
    for (let i = 0; i < n; i++) {
      const p = at((i + 0.5) / n);
      const w = 0.2;
      pos.push(p.x - w, p.y, p.z, p.x + w, p.y, p.z, p.x, p.y - 0.42, p.z);
      const c = colors[i % colors.length]!;
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = this.mat(0xffffff);
    m.vertexColors = true;
    m.side = THREE.DoubleSide;
    this.scene.add(new THREE.Mesh(geo, m));
  }

  private buildDeck(rail: boolean): void {
    const R = this.radius;
    const wood = this.mat(0xb07a42, { rough: 0.9 });
    const top = this.mat(0xffffff, { rough: 0.85, map: plankTexture() });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.5, 72, 1), [wood, top, wood]);
    deck.position.y = DECK_Y - 0.25;
    this.scene.add(deck);
    // кромка и сваи под настилом
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.07, 8, 72), this.mat(0xc98d4f, { rough: 0.8 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = DECK_Y + 0.01;
    this.scene.add(rim);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const post = this.cyl(0.17, 0.17, 2.6, 0x7c5230, this.scene, 10);
      post.position.set(Math.cos(a) * (R - 0.6), DECK_Y - 1.35, Math.sin(a) * (R - 0.6));
    }
    if (!rail) return;
    // столбики и канат по дальней половине кромки
    const pts: THREE.Vector3[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (1.12 + (0.76 * i) / n);
      const x = Math.cos(a) * (R - 0.25);
      const z = Math.sin(a) * (R - 0.25);
      const post = this.cyl(0.085, 0.1, 0.62, 0xc98d4f, this.scene, 10);
      post.position.set(x, DECK_Y + 0.31, z);
      const cap = this.ball(0.11, 0xe8b374, this.scene, 10);
      cap.position.set(x, DECK_Y + 0.66, z);
      pts.push(new THREE.Vector3(x, DECK_Y + 0.5, z));
    }
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 6), this.mat(0xf3e3bd, { rough: 0.95 }));
    this.scene.add(rope);
    this.bunting();
  }
}

export interface Kit {
  diorama(o?: DioramaOpts): Diorama;
  ACT: typeof ACT;
  PALETTE: readonly number[];
  /** Поворот лицом по направлению (dx, dz) */
  yawOf(dx: number, dz: number): number;
  /** Точка на плоскости y из места касания (x, y в долях экрана −1…1); null — луч мимо */
  floorAt(camera: THREE.Camera, nx: number, ny: number, y?: number): THREE.Vector3 | null;
  /** Наряд желейки: по умолчанию без шапки */
  outfit(o: Partial<Outfit>): Outfit;
  DECK_Y: number;
  /** Высота воды */
  WATER: number;
}

const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export const kit: Kit = {
  diorama: (o) => new Diorama(o),
  ACT,
  PALETTE,
  DECK_Y,
  WATER: WATER_Y,
  yawOf: (dx, dz) => Math.atan2(-dx, -dz),
  floorAt(camera, nx, ny, y = DECK_Y) {
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    plane.constant = -y;
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out);
  },
  outfit: (o) => ({ ...DEFAULT_OUTFIT, h: 'none', ...o }),
};
