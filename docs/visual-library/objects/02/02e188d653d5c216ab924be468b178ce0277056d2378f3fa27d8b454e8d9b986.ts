// Подвал «Fight Club» целиком: сцена и камера, статика (room.ts), толпа (crowd.ts) и свет над рингом — 13 голых
// лампочек на проводах (качаются, под каждой — конус света в пыльном воздухе) и общий тёплый свет сверху, чей конус
// и есть «круг света»: перед ступенью лампы у края мигают, гаснут по одной (хлопок, искры), круг сужается; граница
// видна — светлое кольцо пыли и темнеющий за ним пол. Лампа дневного света над баром заикается, с трубы капает в лужу.
import * as THREE from 'three';
import { FC_CEIL, FC_ROOM, zoneLevel } from '../../shared/fight.ts';
import { buildFightWorld } from '../../shared/fightsim.ts';
import type { CollisionWorld } from '../../shared/world.ts';
import { Crowd } from './crowd.ts';
import { blobTexture, seeded } from './paint.ts';
import { DRIP_AT, TUBE_AT, buildBasement, type Tube } from './room.ts';
import type { FightVisualBudget } from './quality.ts';

const BULB_COLOR = new THREE.Color(1.0, 0.82, 0.56);
const SPOT_Y = FC_CEIL - 0.05;

interface Bulb {
  pivot: THREE.Group;
  /** Колба на конце провода (в осях pivot — вниз на len) */
  len: number;
  mat: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  cone: THREE.Mesh<THREE.ConeGeometry, THREE.ShaderMaterial>;
  amp: number;
  phase: number;
  w: number;
  /** Гаснет, когда круг света меньше этого (0 — горит всегда) */
  off: number;
  /** Яркость сейчас (плавно) и погасла ли насовсем (хлопок уже был) */
  on: number;
  dead: boolean;
  x: number;
  z: number;
}

const CONE_VERT = /* glsl */ `
  uniform float uH;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vH = clamp(-position.y / uH, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const CONE_FRAG = /* glsl */ `
  uniform float uK;
  uniform vec3 uColor;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float a = uK * pow(facing, 1.7) * (1.0 - vH) * smoothstep(0.0, 0.1, vH) * 0.13;
    gl_FragColor = vec4(uColor * a, 1.0);
  }`;

const DUST_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uL;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    float s = aSeed * 6.2831;
    p.x += sin(uTime * 0.11 + s) * 0.5 + sin(uTime * 0.37 + s * 3.0) * 0.08;
    p.z += cos(uTime * 0.09 + s * 1.7) * 0.5;
    p.y += sin(uTime * 0.05 + s * 2.3) * 0.35;
    float r = length(p.xz);
    vA = (0.08 + 0.75 * (1.0 - smoothstep(uL - 0.6, uL + 0.5, r))) * (0.5 + 0.5 * sin(uTime * 0.7 + s * 5.0));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uScale * (0.6 + aSeed * 0.8) / max(0.3, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const DUST_FRAG = /* glsl */ `
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d)) * vA * 0.55;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, 1.0);
  }`;

const DARK_FRAG = /* glsl */ `
  uniform float uL;
  uniform float uK;
  varying vec2 vXZ;
  void main() {
    float r = length(vXZ);
    float a = smoothstep(uL - 0.15, uL + 0.9, r) * uK;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }`;
const DARK_VERT = /* glsl */ `
  varying vec2 vXZ;
  void main() {
    vXZ = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export class FightArena {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 60);
  readonly world: CollisionWorld = buildFightWorld();
  readonly crowd = new Crowd();
  /** Лампа над рингом погасла (хлопок, искры) — звук и брызги делает match.ts */
  onPop: (x: number, y: number, z: number) => void = () => {};
  /** Капля шлёпнулась в лужу */
  onDrip: (x: number, y: number, z: number) => void = () => {};
  /** Насколько горит лампа дневного света (0…1) — для её треска */
  tubeLevel = 1;
  R = 5;
  private L = 5;
  private Lshown = 5;
  private stage = 0;
  private warn = false;
  private readonly spot: THREE.SpotLight;
  private readonly tubeLight: THREE.PointLight;
  /** Слабая подсветка от камеры: спина своего бойца и лица напротив не проваливаются в чёрное */
  private readonly fill: THREE.PointLight;
  private readonly tube: Tube;
  private bulbs: Bulb[] = [];
  private readonly bulbGroup = new THREE.Group();
  private readonly ringLine = new THREE.Group();
  private readonly dark: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private readonly edge: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly edgeSoft: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly drop: THREE.Mesh;
  private readonly ripple: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private dropT = -1;
  private nextDrop = 1.5;
  private rippleT = -1;
  /** Раскачка ламп от ударов (0…1) */
  private swing = 0;
  private tubeNext = 4;
  private tubeBurst = 0;
  private lightCones = true;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x07090a);
    s.fog = new THREE.Fog(0x0b0e0d, 9, 26);
    s.add(new THREE.HemisphereLight(0x5f7f72, 0x1c140e, 0.7));
    this.fill = new THREE.PointLight(0xdfe4d2, 3.4, 8, 2);
    s.add(this.fill);
    this.spot = new THREE.SpotLight(0xffd3a0, 70, 0, 0.9, 0.5, 2);
    this.spot.position.set(0, SPOT_Y, 0);
    this.spot.target.position.set(0, 0, 0);
    s.add(this.spot, this.spot.target);
    this.tubeLight = new THREE.PointLight(0xc6f0d6, 6, 11, 2);
    this.tubeLight.position.copy(TUBE_AT).add(new THREE.Vector3(0.6, -0.2, 0));
    s.add(this.tubeLight);
    const door = new THREE.PointLight(0xffb870, 3, 7, 2);
    door.position.set(5.2, 3.6, -10.6);
    s.add(door);

    this.tube = buildBasement(s).tube;
    s.add(this.crowd.group, this.bulbGroup, this.ringLine);
    this.puddles();

    // темнота за кругом света и светлое кольцо пыли по его краю
    this.dark = new THREE.Mesh(new THREE.CircleGeometry(FC_ROOM, 96), new THREE.ShaderMaterial({
      vertexShader: DARK_VERT, fragmentShader: DARK_FRAG, uniforms: { uL: { value: 5 }, uK: { value: 0 } },
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.dark.rotation.x = -Math.PI / 2;
    this.dark.position.y = 0.006;
    this.dark.renderOrder = 1;
    s.add(this.dark);
    this.edge = new THREE.Mesh(new THREE.RingGeometry(0.988, 1.012, 160), new THREE.MeshBasicMaterial({
      color: 0xfff0c8, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    this.edgeSoft = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.07, 160), new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    for (const m of [this.edge, this.edgeSoft]) {
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.01;
      m.renderOrder = 2;
      m.visible = false;
      s.add(m);
    }

    // пыль в воздухе: светится в круге света
    const n = 320;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = seeded(3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 8;
      pos[i * 3] = Math.sin(a) * d;
      pos[i * 3 + 1] = 0.3 + r() * 3.6;
      pos[i * 3 + 2] = Math.cos(a) * d;
      seed[i] = r();
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, uniforms: { uTime: { value: 0 }, uScale: { value: 60 }, uL: { value: 5 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dust.frustumCulled = false;
    s.add(this.dust);

    // капля с трубы и круги на луже под ней
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: 0xbfd8d0 }));
    this.drop.scale.set(1, 1.8, 1);
    this.drop.visible = false;
    s.add(this.drop);
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({
      color: 0xcfe0d8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.ripple.rotation.x = -Math.PI / 2;
    this.ripple.position.set(DRIP_AT.x, 0.012, DRIP_AT.z);
    this.ripple.visible = false;
    s.add(this.ripple);

    this.setRing(5);
  }

  /** Лужи: тёмные и гладкие — ловят блики ламп. Одна — под капающей трубой. */
  private puddles(): void {
    // полупрозрачные: сквозь воду виден бетон, сверху — блики ламп (без прозрачности лужа — чёрная дыра)
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0d1312, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const r = seeded(77);
    const spots: Array<[number, number, number]> = [[DRIP_AT.x, DRIP_AT.z, 0.7], [-9.6, -1.5, 0.9], [7.5, 9.3, 1.1], [-2.8, -2.2, 0.55], [1.9, 3.1, 0.4], [-7.4, 8.6, 0.8], [9.4, -7.8, 0.7]];
    for (const [x, z, rad] of spots) {
      const g = new THREE.CircleGeometry(1, 18);
      const p = g.getAttribute('position');
      for (let i = 1; i < p.count; i++) {
        const k = 0.75 + r() * 0.4;
        p.setXY(i, p.getX(i) * k, p.getY(i) * k);
      }
      const m = new THREE.Mesh(g, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = r() * 3;
      m.scale.set(rad, rad * (0.6 + r() * 0.5), 1);
      m.position.set(x, 0.005, z);
      this.scene.add(m);
    }
  }

  /** Ринг радиуса R: лампы над ним, толпа, линия краской по краю. */
  setRing(R: number): void {
    this.R = R;
    this.L = this.Lshown = R;
    this.crowd.setRing(R);
    for (const b of this.bulbs) {
      b.mat.dispose();
      b.glow.material.dispose();
      b.cone.geometry.dispose();
      b.cone.material.dispose();
    }
    this.bulbGroup.clear();
    this.bulbs = [];
    const r = seeded(Math.round(R * 10));
    const add = (x: number, z: number, off: number) => {
      const len = 0.85 + r() * 0.35;
      const pivot = new THREE.Group();
      pivot.position.set(x, FC_CEIL, z);
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      wire.position.y = -len / 2;
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
      socket.position.y = -len + 0.02;
      const mat = new THREE.MeshBasicMaterial({ color: BULB_COLOR.clone(), toneMapped: false });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat);
      bulb.position.y = -len - 0.04;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap(), color: 0xffc27a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.setScalar(1.2);
      glow.position.y = -len - 0.04;
      const h = FC_CEIL - len - 0.04;
      const coneGeo = new THREE.ConeGeometry(off === 0 ? 1.25 : 1.45, h, 22, 1, true);
      coneGeo.translate(0, -h / 2, 0);
      const cone = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
        vertexShader: CONE_VERT, fragmentShader: CONE_FRAG, uniforms: { uH: { value: h }, uK: { value: 1 }, uColor: { value: new THREE.Color(1, 0.84, 0.6) } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      cone.position.y = -len - 0.04;
      cone.renderOrder = 3;
      pivot.add(wire, socket, bulb, glow, cone);
      this.bulbGroup.add(pivot);
      this.bulbs.push({ pivot, len, mat, glow, cone, amp: 0.025 + r() * 0.03, phase: r() * 10, w: Math.sqrt(9.8 / len), off, on: 1, dead: false, x, z });
    };
    add(0, 0, 0);
    // середина: гаснут, когда свет уже меньше половины ринга
    for (let j = 0; j < 4; j++) {
      const a = Math.PI / 4 + (j * Math.PI) / 2;
      add(Math.sin(a) * R * 0.42, Math.cos(a) * R * 0.42, R * (0.62 - j * 0.03));
    }
    // край: гаснут по одной вразнобой по кругу
    const order = [0, 4, 2, 6, 1, 5, 3, 7];
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      add(Math.sin(a) * R * 0.8, Math.cos(a) * R * 0.8, R * (0.97 - order.indexOf(i) * 0.028));
    }
    // линия краской по краю ринга: стёртая, с пропусками
    this.ringLine.clear();
    const parts: THREE.BufferGeometry[] = [];
    const segs = 72;
    for (let k = 0; k < segs; k++) {
      if (r() < 0.14) continue;
      const a0 = (k / segs) * Math.PI * 2 + r() * 0.02;
      const da = ((Math.PI * 2) / segs) * (0.55 + r() * 0.45);
      const w = 0.03 + r() * 0.025;
      parts.push(new THREE.RingGeometry(R - w, R + w, 3, 1, a0, da));
    }
    if (parts.length) {
      const g = parts.length === 1 ? parts[0] : mergeRings(parts);
      const line = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0xbdb6a0, roughness: 0.9, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.007;
      this.ringLine.add(line);
    }
    this.dust.material.uniforms.uL.value = R;
  }

  /** Свет по снимку: радиус, ступень, мигают ли лампы перед ступенью. */
  setZone(L: number, stage: number, warn: boolean): void {
    this.L = Math.min(this.R, L);
    this.stage = stage;
    this.warn = warn;
  }

  /** Всплеск толпы и раскачка ламп (удар, нокаут). */
  excite(k: number, x?: number, z?: number): void {
    this.crowd.excite(k, x, z);
    this.swing = Math.min(1, this.swing + k * 0.5);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.dust.material.uniforms.uScale.value = Math.max(30, h * 0.05);
  }

  setQuality(budget: FightVisualBudget): void {
    this.lightCones = budget.cones;
    this.dust.geometry.setDrawRange(0, budget.dust);
    this.crowd.setQuality(budget);
  }

  update(dt: number, time: number): void {
    this.swing = Math.max(0, this.swing - dt * 0.35);
    // круг света тянется к снимку плавно (снимки — 30 раз в секунду)
    this.Lshown += (this.L - this.Lshown) * Math.min(1, dt * 8);
    const L = this.Lshown;
    const to = this.warn ? zoneLevel(this.R, this.stage + 1) : L;
    for (const b of this.bulbs) {
      const amp = b.amp + this.swing * 0.09;
      b.pivot.rotation.x = Math.sin(time * b.w + b.phase) * amp;
      b.pivot.rotation.z = Math.cos(time * b.w * 0.93 + b.phase * 1.3) * amp * 0.8;
      let target = b.off === 0 || L >= b.off ? 1 : 0;
      // перед ступенью мигают те, что сейчас погаснут
      if (target === 1 && this.warn && b.off > to) target = flick(time, b.phase) ? 1 : 0.15;
      if (target === 0 && !b.dead && b.on > 0.5) {
        b.dead = true;
        const p = b.pivot.position;
        this.onPop(p.x, FC_CEIL - b.len, p.z);
      }
      if (target > 0.5 && b.dead && L >= b.off) b.dead = false;
      b.on += (target - b.on) * Math.min(1, dt * (target > b.on ? 30 : 18));
      const k = b.on;
      b.mat.color.copy(BULB_COLOR).multiplyScalar(0.08 + 0.92 * k);
      b.glow.material.opacity = 0.6 * k;
      b.cone.material.uniforms.uK.value = k;
      b.cone.visible = this.lightCones && k > 0.02;
    }
    // общий свет сверху: полный внутри круга, к краю — полутень
    const h = SPOT_Y;
    const outer = Math.atan((L + 0.9) / h);
    const inner = Math.atan(Math.max(0.2, L - 0.35) / h);
    this.spot.angle = outer;
    this.spot.penumbra = THREE.MathUtils.clamp(1 - inner / outer, 0.05, 1);
    // темнота и кольцо пыли — только когда свет уже меньше ринга (или вот-вот начнёт)
    const shrinking = L < this.R - 0.05 || this.warn;
    const d = this.dark.material.uniforms;
    d.uL.value = L;
    d.uK.value += ((shrinking ? 0.62 : 0) - d.uK.value) * Math.min(1, dt * 3);
    this.edge.visible = this.edgeSoft.visible = shrinking;
    if (shrinking) {
      const pulse = this.warn ? 0.25 + 0.25 * Math.abs(Math.sin(time * 9)) : 0.36 + 0.06 * Math.sin(time * 2.1);
      this.edge.scale.set(L, L, 1);
      this.edgeSoft.scale.set(L, L, 1);
      this.edge.material.opacity = pulse;
      this.edgeSoft.material.opacity = pulse * 0.3;
    }
    this.dust.material.uniforms.uTime.value = time;
    this.dust.material.uniforms.uL.value = L;
    this.fill.position.copy(this.camera.position);
    this.fill.position.y += 0.5;
    this.updateTube(dt);
    this.updateDrip(dt);
  }

  /** Лампа дневного света: почти всегда горит, изредка заикается. */
  private updateTube(dt: number): void {
    this.tubeNext -= dt;
    if (this.tubeNext <= 0) {
      this.tubeNext = 5 + Math.random() * 9;
      this.tubeBurst = 0.25 + Math.random() * 0.7;
    }
    let k = 1;
    if (this.tubeBurst > 0) {
      this.tubeBurst -= dt;
      k = Math.random() < 0.55 ? 0.08 : 0.7 + Math.random() * 0.3;
    }
    this.tubeLevel = k;
    const t = this.tube;
    t.mesh.material.color.setRGB(0.85 * k + 0.05, 1.0 * k + 0.05, 0.9 * k + 0.05);
    t.glow.material.opacity = 0.35 * k;
    t.pool.material.opacity = 0.8 * k;
    this.tubeLight.intensity = 6 * k;
  }

  /** С трубы раз в пару секунд срывается капля; в луже — круг. */
  private updateDrip(dt: number): void {
    if (this.dropT < 0) {
      this.nextDrop -= dt;
      if (this.nextDrop <= 0) {
        this.dropT = 0;
        this.nextDrop = 1.4 + Math.random() * 1.6;
        this.drop.visible = true;
      }
    } else {
      this.dropT += dt;
      const y = DRIP_AT.y - 0.5 * 9.8 * this.dropT * this.dropT;
      this.drop.position.set(DRIP_AT.x, y, DRIP_AT.z);
      if (y <= 0.01) {
        this.dropT = -1;
        this.drop.visible = false;
        this.rippleT = 0;
        this.ripple.visible = true;
        this.onDrip(DRIP_AT.x, 0, DRIP_AT.z);
      }
    }
    if (this.rippleT >= 0) {
      this.rippleT += dt;
      const u = this.rippleT / 0.9;
      if (u >= 1) {
        this.rippleT = -1;
        this.ripple.visible = false;
      } else {
        const s = 0.05 + u * 0.45;
        this.ripple.scale.set(s, s, 1);
        this.ripple.material.opacity = 0.5 * (1 - u);
      }
    }
  }

  dispose(): void {
    this.crowd.dispose();
  }
}

/** Лампа перед тем, как погаснуть: то горит, то нет — у каждой свой ритм. */
function flick(time: number, phase: number): boolean {
  const seg = Math.floor(time * 14 + phase * 7);
  const h = Math.sin(seg * 12.9898 + phase * 78.233) * 43758.5453;
  return h - Math.floor(h) > 0.4;
}

function mergeRings(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0;
  for (const g of list) count += (g.index ? g.index.count : g.getAttribute('position').count);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position');
    const n = ng.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      nor[o * 3] = n.getX(i);
      nor[o * 3 + 1] = n.getY(i);
      nor[o * 3 + 2] = n.getZ(i);
      o++;
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

let glowTex: THREE.Texture | null = null;
function glowMap(): THREE.Texture {
  glowTex ??= blobTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
  return glowTex;
}
