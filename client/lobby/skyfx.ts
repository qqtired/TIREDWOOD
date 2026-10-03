// Небо в грозу и после: разряд молнии (один меш на все удары — ломаный канал с ветками, яркое ядро и свечение,
// 2–3 мерцания), отсвет в тучах, вспышка и кольцо пара на воде в точке удара — и радуга. Без пост-эффектов:
// всё — несколько дешёвых мешей и спрайтов; свет сцены на вспышку поднимает мир (world.ts) по flash.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';
import { makeRng } from '../../shared/math.ts';
import type { Strike } from '../../shared/weather.ts';
import { glowTexture } from '../render/kit.ts';

type V3 = [number, number, number];

/** Сколько отрезков в разряде (канал и ветки) — буфер на столько */
const MAX_SEG = 160;
/** Высота нижней кромки туч над водой, м: оттуда выходит разряд */
const CLOUD_BASE: readonly [number, number] = [85, 120];
/** Мерцания: через сколько после первого (с) и насколько ярко */
const PULSE_DECAY = 0.032;

// ------------------------------------------------------------ разряд

function boltMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 }, uBranch: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec3 aDir;
      attribute vec4 aW;
      varying float vSide;
      varying float vB;
      varying float vBranch;
      varying float vFade;
      void main() {
        // лента вдоль отрезка, развёрнута к камере; вдали не тоньше пары пикселей
        vec3 dir = normalize(aDir);
        vec3 toCam = cameraPosition - position;
        float dist = length(toCam);
        vec3 side = normalize(cross(dir, toCam / max(dist, 1e-3)) + vec3(1e-5, 0.0, 0.0));
        // ширина со знаком: меньше нуля — ветка
        float w = max(abs(aW.x), dist * 0.0042);
        vec3 p = position + side * (aW.y * w) + dir * (aW.z * w * 0.4);
        vSide = aW.y;
        vB = aW.w;
        vBranch = aW.x < 0.0 ? 1.0 : 0.0;
        vFade = exp(-dist / 1100.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uI;
      uniform float uBranch;
      varying float vSide;
      varying float vB;
      varying float vBranch;
      varying float vFade;
      void main() {
        float v = abs(vSide);
        float core = 1.0 - smoothstep(0.07, 0.24, v);
        float glow = exp(-v * 3.4) * 0.5;
        float k = vB * mix(uI, uBranch, vBranch) * vFade;
        vec3 c = mix(vec3(0.5, 0.6, 1.0), vec3(1.0, 1.0, 1.0), core) * (core * 1.7 + glow) * k;
        if (max(c.r, max(c.g, c.b)) < 0.004) discard;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

/** Ломаная от a до b: n отрезков, отклонение вбок — «мост» случайного блуждания (концы на месте). */
function channel(rng: () => number, a: V3, b: V3, n: number, rough: number): V3[] {
  const walk: V3[] = [[0, 0, 0]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const step = (len / n) * rough;
  for (let i = 1; i <= n; i++) {
    const p = walk[i - 1];
    walk.push([p[0] + (rng() * 2 - 1) * step, p[1] + (rng() * 2 - 1) * step * 0.25, p[2] + (rng() * 2 - 1) * step]);
  }
  const end = walk[n];
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([
      a[0] + (b[0] - a[0]) * t + walk[i][0] - end[0] * t,
      a[1] + (b[1] - a[1]) * t + walk[i][1] - end[1] * t,
      a[2] + (b[2] - a[2]) * t + walk[i][2] - end[2] * t,
    ]);
  }
  return out;
}

class BoltMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: THREE.BufferAttribute;
  private readonly dir: THREE.BufferAttribute;
  private readonly w: THREE.BufferAttribute;
  private seg = 0;
  /** Верх разряда (в тучах) — для отсвета */
  readonly top = new THREE.Vector3();

  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(MAX_SEG * 4 * 3), 3);
    this.dir = new THREE.BufferAttribute(new Float32Array(MAX_SEG * 4 * 3), 3);
    this.w = new THREE.BufferAttribute(new Float32Array(MAX_SEG * 4 * 4), 4);
    for (const a of [this.pos, this.dir, this.w]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aDir', this.dir);
    g.setAttribute('aW', this.w);
    const idx: number[] = [];
    for (let i = 0; i < MAX_SEG; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, boltMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
  }

  /** Новый разряд в точку (x, z) — форма по сиду shape. */
  build(x: number, z: number, shape: number): void {
    const rng = makeRng(shape);
    const h = CLOUD_BASE[0] + (CLOUD_BASE[1] - CLOUD_BASE[0]) * rng();
    const lean = h * (0.12 + 0.18 * rng());
    const a = rng() * Math.PI * 2;
    const top: V3 = [x + Math.cos(a) * lean, WATER_Y + h, z + Math.sin(a) * lean];
    this.top.set(...top);
    this.seg = 0;
    const main = channel(rng, top, [x, WATER_Y, z], 26, 0.55);
    this.line(main, 1.7, 1, h, false);
    // ветки: от верхних двух третей канала вниз и в сторону, тоньше и тусклее
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const i = 3 + Math.floor(rng() * 14);
      const from = main[i];
      const b = rng() * Math.PI * 2;
      const len = h * (0.14 + 0.22 * rng());
      const to: V3 = [from[0] + Math.cos(b) * len * 0.75, from[1] - len * (0.6 + 0.3 * rng()), from[2] + Math.sin(b) * len * 0.75];
      const br = channel(rng, from, to, 9 + Math.floor(rng() * 4), 0.7);
      this.line(br, 1.0, 0.55 - 0.15 * rng(), h, true);
      // у ветки — короткий отросток
      if (rng() < 0.5) {
        const j = 2 + Math.floor(rng() * 5);
        const f2 = br[j];
        const to2: V3 = [f2[0] + (rng() - 0.5) * len * 0.5, f2[1] - len * 0.3, f2[2] + (rng() - 0.5) * len * 0.5];
        this.line(channel(rng, f2, to2, 5, 0.8), 0.7, 0.35, h, true);
      }
    }
    for (const a2 of [this.pos, this.dir, this.w]) a2.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, this.seg * 6);
  }

  /** Отрезки ломаной: ширина свечения (м), яркость (1 — канал, меньше — ветки); у туч — гаснет. */
  private line(pts: V3[], width: number, bright: number, h: number, branch: boolean): void {
    const p = this.pos.array as Float32Array;
    const d = this.dir.array as Float32Array;
    const w = this.w.array as Float32Array;
    for (let i = 0; i + 1 < pts.length && this.seg < MAX_SEG; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      // в тучах канал тает
      const fade = Math.min(1, Math.max(0, (WATER_Y + h - a[1]) / 14));
      const k = bright * (0.2 + 0.8 * fade);
      const base = this.seg * 4;
      const ends: Array<[V3, number, number]> = [[a, -1, -1], [a, 1, -1], [b, -1, 1], [b, 1, 1]];
      ends.forEach(([q, side, end], j) => {
        p.set(q, (base + j) * 3);
        d.set([dx, dy, dz], (base + j) * 3);
        w.set([branch ? -width : width, side, end, k], (base + j) * 4);
      });
      this.seg++;
    }
  }
}

// ------------------------------------------------------------ радуга

/**
 * Направление из глаза в центр радуги («против солнца»): над морем за маяком (юг, чуть к западу), центр под горизонтом —
 * верх дуги ~22° над морем, концы уходят в горизонт. Настоящее солнце вечером на западе-юго-западе, и честная дуга
 * встала бы над городом на востоке — её ставим туда, где её видно с площади и с мостков: над морем за маяком.
 */
const RAINBOW_AXIS = new THREE.Vector3(-Math.sin(0.27) * Math.cos(-0.35), Math.sin(-0.35), Math.cos(0.27) * Math.cos(-0.35)).normalize();
/** Радиус купола радуги, м: перед дальним берегом, за всем на набережной */
const RAINBOW_R = 430;
/** Появляется за столько секунд, тает за столько */
const RAINBOW_IN = 4;
const RAINBOW_OUT = 6;

function rainbowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    side: THREE.DoubleSide,
    // свет радуги прибавляется к небу, тёмная полоса Александра чуть притеняет его (альфа уже умножена)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uAxis: { value: RAINBOW_AXIS.clone() }, uK: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = wp.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAxis;
      uniform float uK;
      varying vec3 vDir;
      // s: 0 — фиолетовый (внутренний край), 1 — красный (внешний)
      vec3 spectrum(float s) {
        vec3 c = mix(vec3(0.50, 0.28, 0.92), vec3(0.22, 0.42, 1.00), smoothstep(0.0, 0.18, s));
        c = mix(c, vec3(0.16, 0.82, 0.62), smoothstep(0.18, 0.36, s));
        c = mix(c, vec3(0.50, 0.95, 0.25), smoothstep(0.36, 0.5, s));
        c = mix(c, vec3(1.00, 0.92, 0.22), smoothstep(0.5, 0.64, s));
        c = mix(c, vec3(1.00, 0.56, 0.14), smoothstep(0.64, 0.8, s));
        c = mix(c, vec3(0.95, 0.18, 0.14), smoothstep(0.8, 1.0, s));
        return c;
      }
      void main() {
        vec3 d = normalize(vDir);
        float th = degrees(acos(clamp(dot(d, uAxis), -1.0, 1.0)));
        // первичная дуга 40,3…42,7°: мягкие края
        float s1 = (th - 40.3) / 2.4;
        float b1 = smoothstep(-0.3, 0.2, s1) * (1.0 - smoothstep(0.8, 1.3, s1));
        vec3 col = spectrum(clamp(s1, 0.0, 1.0)) * b1;
        // вторичная 50,2…53,8°: цвета наоборот, слабее и шире
        float s2 = (th - 50.2) / 3.6;
        float b2 = smoothstep(-0.3, 0.25, s2) * (1.0 - smoothstep(0.75, 1.3, s2));
        col += spectrum(clamp(1.0 - s2, 0.0, 1.0)) * b2 * 0.17;
        // внутри дуги небо светлее
        float inner = exp((min(th, 40.3) - 40.3) / 5.0) * smoothstep(30.5, 36.0, th) * (1.0 - smoothstep(40.0, 41.0, th));
        col += vec3(0.9, 0.92, 0.95) * inner * 0.09;
        // тёмная полоса Александра между дугами
        float alex = smoothstep(42.4, 43.6, th) * (1.0 - smoothstep(49.0, 50.4, th));
        // к горизонту тает, ниже — море
        float a = uK * smoothstep(-0.004, 0.085, d.y);
        gl_FragColor = vec4(col * 0.5 * a, (alex * 0.07 + b1 * 0.1 + b2 * 0.02) * a);
      }
    `,
  });
}

/** Купол-полоса вокруг оси радуги: от 30° до 57° — внутри неё шейдер рисует обе дуги. */
function rainbowGeometry(): THREE.BufferGeometry {
  const rings = [30, 34, 38, 40, 41.5, 43, 46, 49, 51, 53, 55, 57];
  const seg = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const deg of rings) {
    const th = THREE.MathUtils.degToRad(deg);
    for (let i = 0; i <= seg; i++) {
      const f = (i / seg) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(f) * RAINBOW_R, Math.sin(th) * Math.sin(f) * RAINBOW_R, Math.cos(th) * RAINBOW_R);
    }
  }
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Rainbow {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** Видна ли (0…1): плавно догоняет target */
  k = 0;
  target = 0;

  constructor() {
    this.mesh = new THREE.Mesh(rainbowGeometry(), rainbowMaterial());
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), RAINBOW_AXIS);
    this.mesh.frustumCulled = false;
    // раньше прочего прозрачного: капли и стекло — поверх; близкое непрозрачное закрывает её по глубине
    this.mesh.renderOrder = -5;
    this.mesh.visible = false;
  }

  update(dt: number, cam: THREE.Vector3): void {
    const t = Math.max(0, Math.min(1, this.target));
    this.k = this.k < t ? Math.min(t, this.k + dt / RAINBOW_IN) : Math.max(t, this.k - dt / RAINBOW_OUT);
    this.mesh.visible = this.k > 0.002;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(cam);
    this.mesh.material.uniforms.uK.value = this.k * this.k * (3 - 2 * this.k);
  }
}

// ------------------------------------------------------------ удар целиком

/** Удар для других модулей: где, насколько сильный, далёкий ли, сколько до камеры и где он на слух (−1 — слева, 1 — справа) */
export interface StrikeEvent {
  x: number;
  z: number;
  power: number;
  far: boolean;
  dist: number;
  pan: number;
}

export class SkyFx {
  readonly rainbow = new Rainbow();
  private readonly bolt = new BoltMesh();
  /** Отсвет в тучах над разрядом и вспышка у воды */
  private readonly cloudGlow: THREE.Sprite;
  private readonly waterGlow: THREE.Sprite;
  /** Кольцо по воде и облачко пара в точке удара */
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly steam: THREE.Sprite;
  /** Своё время, с */
  private t = 0;
  /** Текущий удар: когда, мерцания (через сколько, яркость), сила, далёкий ли, насколько виден */
  private at = -10;
  private pulses: Array<[number, number]> = [];
  private power = 0;
  private far = false;
  private vis = 1;
  /** Вспышка сейчас (0…~1): ею мир поднимает свет и небо */
  flash = 0;
  /** Для снимков (__opus): держать удар в этом мгновении, с от начала; null — как обычно */
  hold: number | null = null;

  constructor(scene: THREE.Scene) {
    scene.add(this.bolt.mesh, this.rainbow.mesh);
    const tex = glowTexture();
    const sprite = (color: number, blending: THREE.Blending): THREE.Sprite => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, fog: false, blending, opacity: 0 }));
      s.visible = false;
      s.renderOrder = 6;
      scene.add(s);
      return s;
    };
    this.cloudGlow = sprite(0xc8d4ff, THREE.AdditiveBlending);
    this.waterGlow = sprite(0xe8eeff, THREE.AdditiveBlending);
    this.steam = sprite(0xdfe5ea, THREE.NormalBlending);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeaf4ff, transparent: true, depthWrite: false, opacity: 0, fog: false }));
    this.ring.visible = false;
    this.ring.renderOrder = 4;
    scene.add(this.ring);
  }

  /** Ударила молния (s — уже со сдвигом от игрока), cam — откуда смотрим: начинаем разряд и вспышку. */
  strike(s: Strike, cam: THREE.Vector3): void {
    const rng = makeRng(s.shape ^ 0x51ca);
    this.at = this.t;
    this.power = s.power;
    this.far = s.far;
    // 2–3 мерцания за 0,12–0,25 с
    const n = rng() < 0.55 ? 3 : 2;
    this.pulses = [[0, 1]];
    let tp = 0;
    for (let i = 1; i < n; i++) {
      tp += 0.05 + 0.05 * rng();
      this.pulses.push([tp, 0.5 + 0.45 * rng()]);
    }
    const dist = Math.hypot(s.x - cam.x, s.z - cam.z);
    this.vis = s.far ? 0.18 : Math.max(0.35, Math.min(1, 1.25 - dist / 450));
    if (s.far) {
      // далёкая гроза: только отсвет в тучах в той стороне
      const dx = s.x - cam.x, dz = s.z - cam.z, d = Math.max(1, Math.hypot(dx, dz));
      this.cloudGlow.position.set(cam.x + (dx / d) * 600, 130, cam.z + (dz / d) * 600);
      this.cloudGlow.scale.setScalar(420);
      this.bolt.mesh.visible = false;
      this.waterGlow.visible = this.ring.visible = this.steam.visible = false;
      return;
    }
    this.bolt.build(s.x, s.z, s.shape);
    this.bolt.mesh.visible = true;
    this.cloudGlow.position.copy(this.bolt.top);
    this.cloudGlow.scale.setScalar(120);
    // центр — над водой: море срезает только бледный край свечения
    this.waterGlow.position.set(s.x, WATER_Y + 4.2, s.z);
    this.waterGlow.scale.setScalar(11);
    this.ring.position.set(s.x, WATER_Y + 0.06, s.z);
    this.steam.position.set(s.x, WATER_Y + 1, s.z);
    this.waterGlow.visible = this.ring.visible = this.steam.visible = true;
  }

  /** Огибающая мерцаний: 1 — пик первого */
  private envelope(t: number): number {
    let e = 0;
    for (const [tp, amp] of this.pulses) if (t >= tp) e = Math.max(e, amp * Math.exp(-(t - tp) / PULSE_DECAY));
    return e;
  }

  update(dt: number, cam: THREE.Vector3): void {
    this.t += dt;
    this.rainbow.update(dt, cam);
    const age = this.hold ?? this.t - this.at;
    const env = age < 0.6 ? this.envelope(age) : 0;
    this.flash = env * this.power * this.vis;
    // разряд и отсвет
    const bm = this.bolt.mesh.material.uniforms;
    bm.uI.value = env * (0.6 + 0.4 * this.power);
    // ветки — ярко только в первом мерцании
    bm.uBranch.value = age < (this.pulses[1]?.[0] ?? 1) ? env : env * 0.3;
    if (this.bolt.mesh.visible && age > 0.6) this.bolt.mesh.visible = false;
    const cg = this.cloudGlow.material;
    cg.opacity = Math.min(1, env * (this.far ? 0.16 : 0.28) * this.power);
    this.cloudGlow.visible = cg.opacity > 0.003;
    if (!this.waterGlow.visible) return;
    this.waterGlow.material.opacity = Math.min(1, env * 0.7);
    // кольцо расходится за 1,4 с, пар поднимается и тает за 2,4 с
    const r = Math.min(1, age / 1.4);
    this.ring.scale.setScalar(2 + 20 * (1 - (1 - r) * (1 - r)));
    this.ring.material.opacity = 0.55 * (1 - r) * Math.min(1, age / 0.05);
    const st = Math.min(1, age / 2.4);
    this.steam.position.y = WATER_Y + 1 + 7 * st;
    this.steam.scale.setScalar(6 + 14 * st);
    this.steam.material.opacity = 0.42 * Math.sin(Math.PI * Math.min(1, st * 1.25 + 0.02)) * (1 - st);
    if (age > 2.5) this.waterGlow.visible = this.ring.visible = this.steam.visible = false;
  }
}
