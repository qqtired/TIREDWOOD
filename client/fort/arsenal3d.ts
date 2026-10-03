// Арсенал «Крепости» в мире: деревянные лестницы у стен, прилавок с навесом и торговцем на террасе, места башен на
// стенах и сами башни (баллиста, пушка, смоляной котёл, жаровня — целятся, отдают, льют, полыхают), болты и ядра в
// полёте, гранаты и дуга броска, лужи смолы, огонь на горящих зомби и тяжёлые стволы в руках у желеек. Здесь только
// меши и их анимация; что и когда — решает ArsenalClient (client/fort/arsenalc.ts) по событиям сервера.
import * as THREE from 'three';
import { GREN_R, GUN_CROSSBOW, GUN_MG, GUN_SHOTGUN, TOWER_SPOT_COUNT, TW_TAR } from '../../shared/fortarsenal.ts';
import { LADDERS } from '../../shared/fortladder.ts';
import { SHOP_COUNTER, TERRACE, TOWER_MUZZLE, TOWER_SPOTS, WALL_H } from '../../shared/fortmap.ts';
import { damp } from '../../shared/math.ts';
import type { Avatar } from '../render/avatar.ts';
import { glowSprite, mergeColored, paint, place, staticMesh } from '../render/kit.ts';
import { ringTexture } from './textures.ts';

const WOOD = 0x9a6438;
const WOOD_DARK = 0x6b4428;
const WOOD_LIGHT = 0xc08a52;
const IRON = 0x45484d;
const IRON_DARK = 0x2c2d31;
const BRASS = 0xc99a3a;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function vc(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Полосатая ткань навеса с фестонами по краю (прозрачные полукруги) */
function awningTexture(a: string, b: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 256);
  const n = 8;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect((i * 512) / n, 0, 512 / n, 256);
  }
  // складки
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // фестоны: внизу вырезаем полукруги
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc((i + 0.5) * (512 / n), 256 + 6, 512 / n / 2 - 2, Math.PI, 0);
    ctx.fill();
  }
  return tex(c);
}

/** Вывеска «ЛАВКА» на доске */
function signTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 160);
  ctx.fillStyle = '#7a4f2e';
  ctx.beginPath();
  ctx.roundRect(6, 6, 500, 148, 26);
  ctx.fill();
  ctx.strokeStyle = '#3b2616';
  ctx.lineWidth = 10;
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(40,24,12,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 40 + i * 28);
    ctx.lineTo(492, 44 + i * 28);
    ctx.stroke();
  }
  ctx.font = '900 92px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2b1a10';
  ctx.fillText(text, 260, 88);
  ctx.fillStyle = '#ffd35a';
  ctx.fillText(text, 256, 82);
  return tex(c);
}

/** Чёрная блестящая лужа смолы */
function tarTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, ctx] = canvas(S, S);
  ctx.translate(S / 2, S / 2);
  ctx.beginPath();
  for (let k = 0; k <= 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const r = S * (0.38 + 0.08 * Math.sin(k * 2.7) + 0.04 * Math.cos(k * 5.1));
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-24, -24, 8, 0, 0, S * 0.48);
  g.addColorStop(0, '#3a2a1e');
  g.addColorStop(0.6, '#1a120c');
  g.addColorStop(1, '#0e0906');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,236,200,0.35)';
  ctx.beginPath();
  ctx.ellipse(-34, -30, 30, 8, -0.5, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = 'rgba(255,220,170,0.18)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(Math.sin(i * 2.1) * 50, Math.cos(i * 1.7) * 50, 8 + i * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  const t = tex(c);
  return t;
}

/** Язычок пламени (спрайт): тёплый градиент */
let flameTex: THREE.CanvasTexture | null = null;
function flameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const [c, ctx] = canvas(64, 128);
  const g = ctx.createRadialGradient(32, 92, 4, 32, 80, 40);
  g.addColorStop(0, 'rgba(255,250,210,1)');
  g.addColorStop(0.35, 'rgba(255,190,70,0.95)');
  g.addColorStop(0.7, 'rgba(255,90,30,0.6)');
  g.addColorStop(1, 'rgba(255,60,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.bezierCurveTo(56, 52, 60, 92, 32, 124);
  ctx.bezierCurveTo(4, 92, 8, 52, 32, 4);
  ctx.fill();
  flameTex = tex(c);
  return flameTex;
}

function flame(size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size * 0.55, size, 1);
  return s;
}

// ------------------------------------------------------------ тяжёлые стволы в руках

/** Модель ствола в системе узла маркера аватара (ствол смотрит в −z) и где у неё дуло */
interface GunModel {
  group: THREE.Group;
  muzzle: THREE.Vector3;
}

function gunModel(gun: number): GunModel {
  const g: THREE.BufferGeometry[] = [];
  let muzzle = new THREE.Vector3(0, 0.035, -0.62);
  if (gun === GUN_SHOTGUN) {
    // двустволка: тёплый приклад, два вороных ствола, латунная колодка
    g.push(place(paint(new THREE.BoxGeometry(0.09, 0.13, 0.36), WOOD), 0, -0.02, 0.1, 0, -0.18));
    g.push(place(paint(new THREE.BoxGeometry(0.1, 0.1, 0.16), BRASS), 0, 0.03, -0.14));
    for (const x of [-0.028, 0.028]) g.push(place(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.58, 10).rotateX(Math.PI / 2), IRON_DARK), x, 0.05, -0.5));
    g.push(place(paint(new THREE.BoxGeometry(0.1, 0.05, 0.3), WOOD_DARK), 0, 0.0, -0.36));
    muzzle = new THREE.Vector3(0, 0.05, -0.82);
  } else if (gun === GUN_CROSSBOW) {
    // арбалет: ложе, дуга с тетивой, болт с красным оперением
    g.push(place(paint(new THREE.BoxGeometry(0.08, 0.09, 0.7), WOOD), 0, 0.01, -0.2));
    g.push(place(paint(new THREE.BoxGeometry(0.62, 0.05, 0.06), WOOD_DARK), 0, 0.05, -0.5));
    for (const s of [-1, 1]) g.push(place(paint(new THREE.BoxGeometry(0.06, 0.05, 0.16), WOOD_DARK), s * 0.3, 0.05, -0.44, s * 0.4));
    g.push(place(paint(new THREE.BoxGeometry(0.6, 0.012, 0.012), 0xf2e6c8), 0, 0.06, -0.33));
    g.push(place(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.56, 6).rotateX(Math.PI / 2), 0xd8c39a), 0, 0.08, -0.48));
    g.push(place(paint(new THREE.ConeGeometry(0.025, 0.07, 6).rotateX(-Math.PI / 2), 0xb8bcc2), 0, 0.08, -0.79));
    g.push(place(paint(new THREE.BoxGeometry(0.05, 0.04, 0.06), 0xd9483b), 0, 0.08, -0.22));
    g.push(place(paint(new THREE.BoxGeometry(0.03, 0.08, 0.06), IRON), 0, -0.05, -0.08));
    muzzle = new THREE.Vector3(0, 0.08, -0.82);
  } else if (gun === GUN_MG) {
    // ручной «гатлинг»: шесть латунных стволов, барабан, рукоять
    g.push(place(paint(new THREE.BoxGeometry(0.1, 0.12, 0.3), WOOD), 0, -0.02, 0.06));
    g.push(place(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 12).rotateX(Math.PI / 2), IRON), 0, 0.04, -0.16));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.push(place(paint(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6).rotateX(Math.PI / 2), BRASS), Math.cos(a) * 0.045, 0.04 + Math.sin(a) * 0.045, -0.46));
    }
    g.push(place(paint(new THREE.TorusGeometry(0.06, 0.012, 6, 12), IRON_DARK), 0, 0.04, -0.68));
    g.push(place(paint(new THREE.BoxGeometry(0.12, 0.1, 0.12), 0x7a8a3a), 0.09, 0.0, -0.12));
    muzzle = new THREE.Vector3(0, 0.04, -0.74);
  }
  const mesh = new THREE.Mesh(mergeColored(g), vc());
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, muzzle };
}

/** У аватара закрыт узел маркера — берём его через узкий интерфейс (как у AWP в пейнтболе) */
interface AvatarGun {
  node: THREE.Group;
  marker: THREE.Mesh[];
}

const skins = new WeakMap<Avatar, { gun: number; models: Map<number, GunModel> }>();

/** Какой ствол в руках у аватара: 0 — маркер, 1–3 — тяжёлый (модель создаётся при первом показе) */
export function setAvatarGun(av: Avatar, gun: number): void {
  const g = (av as unknown as { gun: AvatarGun | null }).gun;
  if (!g) return;
  let s = skins.get(av);
  if (!s) {
    s = { gun: 0, models: new Map() };
    skins.set(av, s);
  }
  if (s.gun === gun) return;
  s.gun = gun;
  for (const [k, m] of s.models) m.group.visible = k === gun;
  if (gun > 0 && !s.models.has(gun)) {
    const m = gunModel(gun);
    g.node.add(m.group);
    s.models.set(gun, m);
  }
  for (const m of g.marker) m.visible = gun === 0;
}

/** Мировая точка дула тяжёлого ствола (null — в руках маркер) */
export function avatarMuzzle(av: Avatar, out: THREE.Vector3): THREE.Vector3 | null {
  const s = skins.get(av);
  const g = (av as unknown as { gun: AvatarGun | null }).gun;
  if (!s || !g || s.gun === 0) return null;
  const m = s.models.get(s.gun);
  if (!m) return null;
  g.node.updateWorldMatrix(true, false);
  return out.copy(m.muzzle).applyMatrix4(g.node.matrixWorld);
}

// ------------------------------------------------------------ башни

interface TowerModel {
  group: THREE.Group;
  yaw: THREE.Group;
  pitch: THREE.Group | null;
  /** Дуло в системе pitch (или yaw) */
  muzzle: THREE.Vector3;
  flames: THREE.Sprite[];
  glow: THREE.Sprite | null;
  /** Чаша котла (наклоняется, когда льёт) */
  tilt: THREE.Object3D | null;
}

interface TowerVis {
  root: THREE.Group;
  ring: THREE.Mesh;
  models: Array<TowerModel | null>;
  pennant: THREE.Mesh;
  pennantMat: THREE.MeshStandardMaterial;
  type: number;
  level: number;
  pop: number;
  yaw: number;
  wantYaw: number;
  pitch: number;
  wantPitch: number;
  recoil: number;
  lastShot: number;
  pour: number;
  flare: number;
}

function buildBallista(): TowerModel {
  const group = new THREE.Group();
  const stand: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) {
    stand.push(place(paint(new THREE.BoxGeometry(0.1, 0.95, 0.1), WOOD_DARK), x * 0.8, 0.47, z * 0.8, 0, 0));
  }
  stand.push(place(paint(new THREE.BoxGeometry(0.7, 0.1, 0.7), WOOD), 0, 0.92, 0));
  const sm = new THREE.Mesh(mergeColored(stand), vc());
  sm.castShadow = true;
  group.add(sm);
  const yaw = new THREE.Group();
  yaw.position.y = 1.05;
  const pitch = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  parts.push(place(paint(new THREE.BoxGeometry(0.18, 0.14, 1.7), WOOD), 0, 0.05, -0.15));
  // дуга: два плеча
  for (const s of [-1, 1]) parts.push(place(paint(new THREE.BoxGeometry(0.85, 0.09, 0.09), WOOD_LIGHT), s * 0.42, 0.08, -0.82, s * 0.32));
  parts.push(place(paint(new THREE.BoxGeometry(0.22, 0.2, 0.22), IRON), 0, 0.08, -0.92));
  // тетива и болт
  parts.push(place(paint(new THREE.BoxGeometry(1.5, 0.02, 0.02), 0xefe2c4), 0, 0.12, -0.42));
  parts.push(place(paint(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6).rotateX(Math.PI / 2), 0xd8c39a), 0, 0.16, -0.6));
  parts.push(place(paint(new THREE.ConeGeometry(0.06, 0.18, 6).rotateX(-Math.PI / 2), 0xb8bcc2), 0, 0.16, -1.32));
  parts.push(place(paint(new THREE.BoxGeometry(0.1, 0.07, 0.14), 0xd9483b), 0, 0.16, 0.0));
  // ворот сзади
  parts.push(place(paint(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8).rotateZ(Math.PI / 2), WOOD_DARK), 0, 0.06, 0.62));
  const m = new THREE.Mesh(mergeColored(parts), vc());
  m.castShadow = true;
  pitch.add(m);
  yaw.add(pitch);
  group.add(yaw);
  return { group, yaw, pitch, muzzle: new THREE.Vector3(0, 0.16, -1.4), flames: [], glow: null, tilt: null };
}

function buildCannon(): TowerModel {
  const group = new THREE.Group();
  const yaw = new THREE.Group();
  const carriage: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    carriage.push(place(paint(new THREE.BoxGeometry(0.12, 0.42, 1.0), WOOD), s * 0.26, 0.32, 0.05));
    carriage.push(place(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 14).rotateZ(Math.PI / 2), WOOD_DARK), s * 0.38, 0.3, 0.25));
    carriage.push(place(paint(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8).rotateZ(Math.PI / 2), IRON), s * 0.44, 0.3, 0.25));
  }
  carriage.push(place(paint(new THREE.BoxGeometry(0.64, 0.1, 0.4), WOOD_DARK), 0, 0.14, 0.2));
  // ядра у лафета
  for (const [x, z] of [[0.6, 0.55], [0.75, 0.38], [0.66, 0.42]] as const) carriage.push(place(paint(new THREE.SphereGeometry(0.13, 10, 8), IRON_DARK), x, 0.13, z));
  const cm = new THREE.Mesh(mergeColored(carriage), vc());
  cm.castShadow = true;
  yaw.add(cm);
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.52, 0);
  const barrel: THREE.BufferGeometry[] = [];
  barrel.push(place(paint(new THREE.CylinderGeometry(0.15, 0.21, 1.35, 16).rotateX(Math.PI / 2), IRON_DARK), 0, 0, -0.35));
  barrel.push(place(paint(new THREE.TorusGeometry(0.16, 0.035, 6, 16), IRON), 0, 0, -1.02));
  barrel.push(place(paint(new THREE.TorusGeometry(0.2, 0.03, 6, 16), BRASS), 0, 0, 0.12));
  barrel.push(place(paint(new THREE.SphereGeometry(0.16, 10, 8), IRON_DARK), 0, 0, 0.32));
  const bm = new THREE.Mesh(mergeColored(barrel), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }));
  bm.castShadow = true;
  pitch.add(bm);
  yaw.add(pitch);
  group.add(yaw);
  return { group, yaw, pitch, muzzle: new THREE.Vector3(0, 0, -1.08), flames: [], glow: null, tilt: null };
}

function buildTar(): TowerModel {
  const group = new THREE.Group();
  const legs: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = paint(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 6), IRON);
    leg.rotateZ(Math.cos(a) * 0.28);
    leg.rotateX(Math.sin(a) * 0.28);
    legs.push(place(leg, Math.cos(a) * 0.42, 0.62, Math.sin(a) * 0.42));
  }
  // дрова под котлом
  for (let k = 0; k < 3; k++) legs.push(place(paint(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6).rotateZ(Math.PI / 2), WOOD_DARK), 0, 0.08 + k * 0.02, (k - 1) * 0.12, k * 0.9));
  const lm = new THREE.Mesh(mergeColored(legs), vc());
  lm.castShadow = true;
  group.add(lm);
  const yaw = new THREE.Group();
  yaw.position.y = 1.0;
  const tilt = new THREE.Group();
  const prof = [[0.001, -0.42], [0.22, -0.4], [0.4, -0.25], [0.46, -0.02], [0.43, 0.2], [0.46, 0.24], [0.42, 0.25]].map(([r, y]) => new THREE.Vector2(r, y));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), new THREE.MeshStandardMaterial({ color: IRON_DARK, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide }));
  pot.castShadow = true;
  const tar = new THREE.Mesh(new THREE.CircleGeometry(0.41, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x15100c, roughness: 0.08, metalness: 0.2 }));
  tar.position.y = 0.16;
  const lip = new THREE.Mesh(paint(new THREE.BoxGeometry(0.18, 0.05, 0.3), IRON), vc());
  lip.position.set(0, 0.22, -0.5);
  tilt.add(pot, tar, lip);
  yaw.add(tilt);
  group.add(yaw);
  const flames = [flame(0.45), flame(0.38)];
  flames[0].position.set(0.05, 0.3, 0);
  flames[1].position.set(-0.08, 0.26, 0.06);
  group.add(...flames);
  return { group, yaw, pitch: null, muzzle: new THREE.Vector3(0, 0.22, -0.65), flames, glow: null, tilt };
}

function buildBrazier(): TowerModel {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    const leg = paint(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 6), IRON_DARK);
    leg.rotateZ(Math.cos(a) * 0.22);
    leg.rotateX(Math.sin(a) * 0.22);
    parts.push(place(leg, Math.cos(a) * 0.3, 0.48, Math.sin(a) * 0.3));
  }
  // чаша-корзина из прутьев и обода
  parts.push(place(paint(new THREE.CylinderGeometry(0.44, 0.24, 0.12, 14), IRON_DARK), 0, 0.98, 0));
  parts.push(place(paint(new THREE.TorusGeometry(0.5, 0.03, 6, 18).rotateX(Math.PI / 2), IRON), 0, 1.36, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const bar = paint(new THREE.BoxGeometry(0.035, 0.42, 0.035), IRON);
    bar.rotateZ(Math.cos(a) * -0.28);
    bar.rotateX(Math.sin(a) * 0.28);
    parts.push(place(bar, Math.cos(a) * 0.42, 1.17, Math.sin(a) * 0.42));
  }
  // угли
  for (let k = 0; k < 7; k++) parts.push(place(paint(new THREE.DodecahedronGeometry(0.1 + (k % 3) * 0.02, 0), k % 2 ? 0xff7a2a : 0xffb03a), Math.cos(k * 2.3) * 0.22, 1.1 + (k % 2) * 0.05, Math.sin(k * 2.3) * 0.22));
  const m = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: 0x3a1206 }));
  m.castShadow = true;
  group.add(m);
  const flames = [flame(0.95), flame(0.75), flame(0.7)];
  flames[0].position.set(0, 1.55, 0);
  flames[1].position.set(0.18, 1.48, 0.1);
  flames[2].position.set(-0.17, 1.46, -0.08);
  const glow = glowSprite(0xff8a3a, 2.6, 0.35);
  glow.position.set(0, 1.4, 0);
  group.add(...flames, glow);
  const yaw = new THREE.Group();
  group.add(yaw);
  return { group, yaw, pitch: null, muzzle: new THREE.Vector3(0, 1.4, 0), flames, glow, tilt: null };
}

const BUILDERS = [buildBallista, buildCannon, buildTar, buildBrazier];
const LEVEL_COLORS = [0xf4e6c4, 0xf4e6c4, 0x7bd88f, 0x7bd88f, 0x5fb7ff, 0x5fb7ff, 0xffd35a, 0xffd35a, 0xff7a4a, 0xff7a4a, 0xcf70d9];

// ------------------------------------------------------------ снаряды

interface Shot {
  obj: THREE.Object3D;
  active: boolean;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  arc: number;
  /** Болт: долетел — торчит ещё stick секунд */
  stick: number;
}

interface FireVis {
  sprites: THREE.Sprite[];
  zid: number;
  until: number;
}

export class Arsenal3D {
  private readonly scene: THREE.Scene;
  private readonly towers: TowerVis[] = [];
  private readonly bolts: Shot[] = [];
  private readonly balls: Shot[] = [];
  private readonly grenades: THREE.Group[] = [];
  private readonly sparks: THREE.Sprite[] = [];
  private readonly tars: THREE.Mesh[] = [];
  private readonly tarFade: number[] = [];
  private readonly tarOn: boolean[] = [];
  private readonly fires: FireVis[] = [];
  private readonly arc: THREE.Points;
  private readonly arcPos: Float32Array;
  private readonly arcRing: THREE.Mesh;
  private readonly merchant = new THREE.Group();
  private readonly merchantEyes = new THREE.Group();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildLadders();
    this.buildStall();
    this.buildSpots();
    // болты баллисты и арбалета
    const boltGeo = mergeColored([
      paint(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5).rotateX(Math.PI / 2), 0xd8c39a),
      place(paint(new THREE.ConeGeometry(0.05, 0.16, 6).rotateX(-Math.PI / 2), 0xb8bcc2), 0, 0, -0.56),
      place(paint(new THREE.BoxGeometry(0.1, 0.02, 0.16), 0xd9483b), 0, 0, 0.42),
      place(paint(new THREE.BoxGeometry(0.02, 0.1, 0.16), 0xd9483b), 0, 0, 0.42),
    ]);
    const boltMat = vc();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(boltGeo, boltMat);
      m.visible = false;
      scene.add(m);
      this.bolts.push({ obj: m, active: false, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1, arc: 0, stick: 0 });
    }
    const ballGeo = new THREE.SphereGeometry(0.17, 12, 10);
    const ballMat = new THREE.MeshStandardMaterial({ color: IRON_DARK, roughness: 0.35, metalness: 0.6 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ballGeo, ballMat);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      this.balls.push({ obj: m, active: false, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, t: 0, dur: 1, arc: 0, stick: 0 });
    }
    // гранаты: чёрный шар с красным пояском и искрой фитиля
    const gGeo = mergeColored([
      paint(new THREE.SphereGeometry(0.12, 12, 10), 0x2a2a2e),
      paint(new THREE.TorusGeometry(0.122, 0.022, 6, 16).rotateX(Math.PI / 2), 0xd9483b),
      place(paint(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 6), BRASS), 0, 0.13, 0),
    ]);
    const gMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 });
    for (let i = 0; i < 16; i++) {
      const grp = new THREE.Group();
      const m = new THREE.Mesh(gGeo, gMat);
      m.castShadow = true;
      const spark = glowSprite(0xffc04a, 0.32, 0.9);
      spark.position.y = 0.18;
      grp.add(m, spark);
      grp.visible = false;
      scene.add(grp);
      this.grenades.push(grp);
      this.sparks.push(spark);
    }
    // лужи смолы
    const tt = tarTexture();
    for (let i = 0; i < TOWER_SPOT_COUNT; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(8.4, 8.4).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ map: tt, transparent: true, depthWrite: false, roughness: 0.12, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      );
      m.renderOrder = 2;
      m.visible = false;
      scene.add(m);
      this.tars.push(m);
      this.tarFade.push(0);
      this.tarOn.push(false);
    }
    // огонь на горящих зомби
    for (let i = 0; i < 20; i++) {
      const sprites = [flame(0.9), flame(0.7)];
      for (const s of sprites) {
        s.visible = false;
        scene.add(s);
      }
      this.fires.push({ sprites, zid: 0, until: 0 });
    }
    // дуга броска: точки и круг взрыва на земле
    this.arcPos = new Float32Array(48 * 3);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arc = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xfff1c8, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
    this.arc.renderOrder = 7;
    scene.add(this.arc);
    this.arcRing = new THREE.Mesh(
      new THREE.PlaneGeometry(GREN_R * 2, GREN_R * 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, color: 0xffb35a }),
    );
    this.arcRing.visible = false;
    this.arcRing.renderOrder = 7;
    scene.add(this.arcRing);
  }

  // ------------------------------------------------------------ статика

  /** Деревянные лестницы у стен: две жерди, перекладины; низ отставлен от стены, верх выше хода по стене */
  private buildLadders(): void {
    const geos: THREE.BufferGeometry[] = [];
    const H = WALL_H + 0.75;
    const foot = 0.62;
    const top = 0.1;
    const lean = Math.atan2(foot - top, H);
    const len = Math.hypot(H, foot - top);
    for (const l of LADDERS) {
      const part: THREE.BufferGeometry[] = [];
      for (const x of [-0.34, 0.34]) {
        const rail = paint(new THREE.BoxGeometry(0.09, len, 0.09), WOOD);
        rail.rotateX(-lean);
        part.push(place(rail, x, H / 2, (foot + top) / 2));
      }
      for (let y = 0.3; y < H - 0.1; y += 0.32) {
        const z = foot - (foot - top) * (y / H);
        part.push(place(paint(new THREE.CylinderGeometry(0.035, 0.035, 0.68, 6).rotateZ(Math.PI / 2), WOOD_LIGHT), 0, y, z));
      }
      const ry = Math.atan2(l.nx, l.nz);
      for (const g of part) geos.push(place(g, l.x, l.y0, l.z, ry));
    }
    this.scene.add(staticMesh(mergeColored(geos), vc(), true));
  }

  /** Прилавок: стойки, полосатый навес, вывеска, товар на прилавке и торговец-желейка за ним */
  private buildStall(): void {
    const C = SHOP_COUNTER;
    const y0 = TERRACE.h;
    const cx = (C.x0 + C.x1) / 2;
    const geos: THREE.BufferGeometry[] = [];
    // корпус (бокс коллизии карты рисуем здесь: двор его не трогает) и доски по фасаду, светлые через одну
    geos.push(place(paint(new THREE.BoxGeometry(C.x1 - C.x0, C.h, C.z1 - C.z0), WOOD), cx, y0 + C.h / 2, (C.z0 + C.z1) / 2));
    const slats = 6;
    const sw = (C.x1 - C.x0) / slats;
    for (let i = 0; i < slats; i++) {
      geos.push(place(paint(new THREE.BoxGeometry(sw - 0.05, C.h - 0.22, 0.03), i % 2 ? WOOD_LIGHT : WOOD), C.x0 + sw * (i + 0.5), y0 + (C.h - 0.22) / 2 + 0.03, C.z0 - 0.016));
    }
    // столешница с напуском и резной фартук спереди
    geos.push(place(paint(new THREE.BoxGeometry(C.x1 - C.x0 + 0.3, 0.09, C.z1 - C.z0 + 0.2), WOOD_LIGHT), cx, y0 + C.h + 0.045, (C.z0 + C.z1) / 2));
    geos.push(place(paint(new THREE.BoxGeometry(C.x1 - C.x0 + 0.02, 0.16, 0.05), 0xd9483b), cx, y0 + C.h - 0.1, C.z0 - 0.03));
    // стойки навеса: спереди у прилавка, сзади у стены
    const backZ = 10.85;
    for (const x of [C.x0 - 0.05, C.x1 + 0.05]) {
      geos.push(place(paint(new THREE.BoxGeometry(0.12, 2.5, 0.12), WOOD_DARK), x, y0 + 1.25, C.z0 - 0.08));
      geos.push(place(paint(new THREE.BoxGeometry(0.12, 2.75, 0.12), WOOD_DARK), x, y0 + 1.375, backZ));
    }
    // товар: бочонок, ящик с шариками краски, бомбы, свёрток
    geos.push(place(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 12), WOOD), C.x0 + 0.35, y0 + C.h + 0.3, C.z0 + 0.35));
    geos.push(place(paint(new THREE.TorusGeometry(0.205, 0.02, 4, 14).rotateX(Math.PI / 2), IRON), C.x0 + 0.35, y0 + C.h + 0.4, C.z0 + 0.35));
    geos.push(place(paint(new THREE.BoxGeometry(0.55, 0.22, 0.4), WOOD), cx + 0.15, y0 + C.h + 0.2, C.z0 + 0.35));
    const ballColors = [0xff5a4a, 0xffd35a, 0x5fb7ff, 0x7bd88f, 0xcf70d9, 0xff8a1c];
    for (let i = 0; i < 9; i++) geos.push(place(paint(new THREE.SphereGeometry(0.07, 8, 6), ballColors[i % 6]), cx + 0.15 + ((i % 3) - 1) * 0.15, y0 + C.h + 0.34, C.z0 + 0.35 + (Math.floor(i / 3) - 1) * 0.11));
    for (let i = 0; i < 3; i++) geos.push(place(paint(new THREE.SphereGeometry(0.12, 10, 8), 0x2a2a2e), C.x1 - 0.35 - i * 0.2, y0 + C.h + 0.21, C.z0 + 0.25 + (i % 2) * 0.12));
    // на стене за торговцем — стволы на крючках
    const wallZ = 10.97;
    geos.push(place(paint(new THREE.BoxGeometry(2.3, 0.08, 0.06), WOOD_DARK), cx, y0 + 2.0, wallZ));
    const stall = staticMesh(mergeColored(geos), vc(), true);
    this.scene.add(stall);
    for (const [gun, x] of [[GUN_SHOTGUN, cx - 0.7], [GUN_CROSSBOW, cx], [GUN_MG, cx + 0.75]] as const) {
      const m = gunModel(gun);
      m.group.scale.setScalar(1.25);
      m.group.rotation.set(0, Math.PI / 2, 0.15);
      m.group.position.set(x, y0 + 1.75, wallZ - 0.08);
      this.scene.add(m.group);
    }
    // навес: ткань наклонно от стены к прилавку, с фестонами
    const aw = new THREE.Mesh(
      new THREE.PlaneGeometry(C.x1 - C.x0 + 0.6, backZ - C.z0 + 0.5),
      new THREE.MeshStandardMaterial({ map: awningTexture('#d9483b', '#fff1d8'), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.9 }),
    );
    const span = backZ - C.z0 + 0.5;
    const drop = 0.55;
    aw.rotation.x = -Math.PI / 2 + Math.atan2(drop, span);
    aw.position.set(cx, y0 + 2.55 + drop / 2 - 0.05, (C.z0 + backZ) / 2 - 0.2);
    aw.castShadow = true;
    this.scene.add(aw);
    // вывеска над навесом
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshStandardMaterial({ map: signTexture('ЛАВКА'), transparent: true, roughness: 0.8 }));
    sign.position.set(cx, y0 + 2.92, C.z0 - 0.32);
    sign.rotation.y = Math.PI;
    sign.rotation.x = -0.12;
    this.scene.add(sign);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshStandardMaterial({ color: 0x6b4428 }));
    back.position.copy(sign.position);
    back.position.z += 0.01;
    back.rotation.x = -0.12;
    this.scene.add(back);
    // торговец: желейка в красной феске с усами
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.45, 6, 14), new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.35 }));
    body.position.y = 0.66;
    body.castShadow = true;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1e1410, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat);
      eye.position.set(s * 0.15, 0.98, -0.36);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pupilMat);
      pupil.position.set(s * 0.15, 0.98, -0.45);
      this.merchantEyes.add(eye, pupil);
    }
    const stache = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.8 }));
    stache.position.set(0, 0.84, -0.4);
    stache.rotation.set(0, 0, Math.PI);
    const fez = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.26, 14), new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.6 }));
    fez.position.set(0, 1.24, 0);
    const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffd35a }));
    tassel.position.set(0.12, 1.3, 0.12);
    this.merchant.add(body, this.merchantEyes, stache, fez, tassel);
    this.merchant.position.set(cx, y0, 10.45);
    this.scene.add(this.merchant);
  }

  /** Места башен: пунктирный круг на ходу стены; башня встаёт поверх (модели — при первой постройке) */
  private buildSpots(): void {
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, color: 0xfff1c8 });
    const poleMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.8 });
    for (const s of TOWER_SPOTS) {
      const root = new THREE.Group();
      root.position.set(s.x, s.y, s.z);
      // модель смотрит в −z: разворачиваем её наружу, по нормали места
      root.rotation.y = Math.atan2(-s.nx, -s.nz);
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2), ringMat);
      ring.position.y = 0.03;
      root.add(ring);
      // флажок уровня
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), poleMat);
      pole.position.set(0.62, 0.8, 0.45);
      const pennantMat = new THREE.MeshStandardMaterial({ color: LEVEL_COLORS[1], side: THREE.DoubleSide, roughness: 0.7 });
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.32, 0, 0.5, -0.16, 0], 3));
      tri.computeVertexNormals();
      const pennant = new THREE.Mesh(tri, pennantMat);
      pennant.position.set(0.62, 1.58, 0.45);
      pole.visible = pennant.visible = false;
      root.add(pole, pennant);
      root.userData.pole = pole;
      this.scene.add(root);
      this.towers.push({ root, ring, models: [null, null, null, null], pennant, pennantMat, type: -1, level: 0, pop: 0, yaw: 0, wantYaw: 0, pitch: 0, wantPitch: 0, recoil: 0, lastShot: -9, pour: 0, flare: 0 });
    }
  }

  // ------------------------------------------------------------ башни

  /** Что стоит на местах (из хвоста снимка): тип (−1 — пусто) и уровень */
  setTowers(types: readonly number[], levels: readonly number[]): void {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      const type = types[i] ?? -1;
      const level = levels[i] ?? 0;
      if (type === t.type && level === t.level) continue;
      if (type !== t.type) {
        for (const m of t.models) if (m) m.group.visible = false;
        if (type >= 0) {
          let m = t.models[type];
          if (!m) {
            m = BUILDERS[type]();
            t.models[type] = m;
            t.root.add(m.group);
          }
          m.group.visible = true;
          t.pop = 1;
        }
        t.ring.visible = type < 0;
        (t.root.userData.pole as THREE.Object3D).visible = t.pennant.visible = type >= 0;
      } else if (level > t.level) {
        t.pop = 0.7;
      }
      t.type = type;
      t.level = level;
      t.pennantMat.color.setHex(LEVEL_COLORS[Math.min(LEVEL_COLORS.length - 1, level)]);
      const m = type >= 0 ? t.models[type] : null;
      if (m) m.group.scale.setScalar(1 + Math.min(10, level) * 0.025);
    }
  }

  /** Мировая точка дула башни на месте i, если повернуть её на (x, y, z) */
  private aim(i: number, x: number, y: number, z: number): void {
    const t = this.towers[i];
    const s = TOWER_SPOTS[i];
    const dx = x - s.x;
    const dz = z - s.z;
    // root повёрнут: yaw — в его системе
    t.wantYaw = Math.atan2(-dx, -dz) - t.root.rotation.y;
    t.wantPitch = Math.atan2(y - (s.y + TOWER_MUZZLE), Math.hypot(dx, dz));
    t.yaw = t.wantYaw;
    t.pitch = t.wantPitch;
    t.lastShot = this.time;
  }

  private muzzle(i: number, out: THREE.Vector3): THREE.Vector3 {
    const t = this.towers[i];
    const m = t.type >= 0 ? t.models[t.type] : null;
    if (!m) {
      const s = TOWER_SPOTS[i];
      return out.set(s.x, s.y + TOWER_MUZZLE, s.z);
    }
    const node = m.pitch ?? m.yaw;
    m.yaw.rotation.y = t.yaw;
    if (m.pitch) m.pitch.rotation.x = t.pitch;
    node.updateWorldMatrix(true, false);
    return out.copy(m.muzzle).applyMatrix4(node.matrixWorld);
  }

  /** Баллиста выстрелила в (x, y, z): поворот, отдача, болт в полёт. Возвращает, где дуло (для эффектов). */
  bolt(i: number, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    this.aim(i, x, y, z);
    this.towers[i].recoil = 1;
    this.muzzle(i, out);
    this.launch(this.bolts, out.x, out.y, out.z, x, y, z, Math.max(0.05, out.distanceTo(_v.set(x, y, z)) / 70), 0, 0.5);
    return out;
  }

  /** Болт арбалета игрока: от дула к цели */
  playerBolt(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
    this.launch(this.bolts, fx, fy, fz, tx, ty, tz, Math.max(0.04, Math.hypot(tx - fx, ty - fy, tz - fz) / 90), 0, 0.6);
  }

  /** Пушка: ядро по дуге за ticks тиков */
  cannon(i: number, x: number, y: number, z: number, ticks: number, out: THREE.Vector3): THREE.Vector3 {
    this.aim(i, x, y, z);
    const t = this.towers[i];
    t.pitch = t.wantPitch = Math.min(0.5, t.wantPitch + 0.25);
    t.recoil = 1;
    this.muzzle(i, out);
    const d = out.distanceTo(_v.set(x, y, z));
    this.launch(this.balls, out.x, out.y, out.z, x, y + 0.2, z, ticks / 60, Math.min(5, d * 0.16), 0);
    return out;
  }

  /** Котёл вылил смолу в (x, z) */
  pour(i: number, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const t = this.towers[i];
    this.aim(i, x, 0, z);
    t.pour = 1;
    this.muzzle(i, out);
    const m = this.tars[i];
    m.position.set(x, 0.035, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    this.tarOn[i] = true;
    this.tarFade[i] = 0.01;
    return out;
  }

  /** Жаровня плюнула углями */
  coals(i: number, out: THREE.Vector3): THREE.Vector3 {
    const t = this.towers[i];
    t.flare = 1;
    t.lastShot = this.time;
    return this.muzzle(i, out);
  }

  /** Лужи смолы: бит на место (из хвоста) */
  setTar(bits: number): void {
    for (let i = 0; i < this.tars.length; i++) {
      const on = (bits & (1 << i)) !== 0;
      if (!on && this.tarOn[i]) this.tarOn[i] = false;
      if (on && !this.tarOn[i] && this.tarFade[i] <= 0) {
        // лужа уже лежит (вошли посреди волны) — где-то перед местом
        const s = TOWER_SPOTS[i];
        this.tars[i].position.set(s.x + s.nx * 4.2, 0.035, s.z + s.nz * 4.2);
        this.tarOn[i] = true;
        this.tarFade[i] = 0.01;
      }
    }
  }

  /** Зомби горит до until (секунды по часам сцены) */
  burn(zid: number, sec: number): void {
    let f = this.fires.find((x) => x.zid === zid);
    if (!f) f = this.fires.find((x) => x.until <= this.time) ?? this.fires[0];
    f.zid = zid;
    f.until = this.time + sec;
  }

  private launch(pool: Shot[], fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, dur: number, arc: number, stick: number): void {
    let s = pool.find((x) => !x.active);
    if (!s) s = pool.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    s.active = true;
    s.fx = fx;
    s.fy = fy;
    s.fz = fz;
    s.tx = tx;
    s.ty = ty;
    s.tz = tz;
    s.t = 0;
    s.dur = dur;
    s.arc = arc;
    s.stick = stick;
    s.obj.visible = true;
    s.obj.position.set(fx, fy, fz);
    s.obj.lookAt(tx, ty, tz);
    s.obj.rotateY(Math.PI);
  }

  // ------------------------------------------------------------ гранаты и дуга

  grenade(slot: number, x: number, y: number, z: number, spin: number): void {
    const g = this.grenades[slot];
    if (!g) return;
    g.visible = true;
    g.position.set(x, y, z);
    g.rotation.set(spin, spin * 0.7, 0);
    this.sparks[slot].material.opacity = 0.6 + 0.4 * Math.sin(this.time * 40 + slot);
  }

  hideGrenade(slot: number): void {
    const g = this.grenades[slot];
    if (g) g.visible = false;
  }

  get grenadeSlots(): number {
    return this.grenades.length;
  }

  /** Дуга броска: n точек (x, y, z подряд), где взорвётся; ok — гранаты есть */
  setArc(pts: ArrayLike<number>, n: number, ex: number, ey: number, ez: number, ok: boolean): void {
    const m = Math.min(n, this.arcPos.length / 3);
    for (let i = 0; i < m * 3; i++) this.arcPos[i] = pts[i];
    const g = this.arc.geometry;
    g.setDrawRange(0, m);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.arc.material as THREE.PointsMaterial).color.setHex(ok ? 0xfff1c8 : 0xff8a7a);
    this.arc.visible = true;
    this.arcRing.visible = true;
    this.arcRing.position.set(ex, ey + 0.06, ez);
    (this.arcRing.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0xffb35a : 0xff6b6b);
  }

  hideArc(): void {
    this.arc.visible = false;
    this.arcRing.visible = false;
  }

  /** Новая игра: башни прочь, снаряды и огонь — тоже */
  reset(): void {
    this.setTowers(new Array(TOWER_SPOT_COUNT).fill(-1), new Array(TOWER_SPOT_COUNT).fill(0));
    for (const s of [...this.bolts, ...this.balls]) {
      s.active = false;
      s.obj.visible = false;
    }
    for (const g of this.grenades) g.visible = false;
    for (let i = 0; i < this.tars.length; i++) {
      this.tarOn[i] = false;
      this.tarFade[i] = 0;
      this.tars[i].visible = false;
    }
    for (const f of this.fires) {
      f.until = 0;
      for (const s of f.sprites) s.visible = false;
    }
    this.hideArc();
  }

  // ------------------------------------------------------------ кадр

  /** where(zid, out) — где сейчас зомби (для огня на нём) */
  update(dt: number, camPos: THREE.Vector3, where: (zid: number, out: THREE.Vector3) => boolean): void {
    this.time += dt;
    const t = this.time;
    // торговец покачивается и поглядывает на ближнего
    this.merchant.position.y = TERRACE.h + Math.abs(Math.sin(t * 2.2)) * 0.04;
    this.merchant.scale.set(1 + Math.sin(t * 4.4) * 0.015, 1 - Math.sin(t * 4.4) * 0.015, 1);
    const dx = camPos.x - this.merchant.position.x;
    const dz = camPos.z - this.merchant.position.z;
    if (dx * dx + dz * dz < 900) this.merchant.rotation.y = damp(this.merchant.rotation.y, Math.atan2(-dx, -dz), 3, dt);

    for (let i = 0; i < this.towers.length; i++) {
      const tw = this.towers[i];
      if (tw.type < 0) continue;
      const m = tw.models[tw.type];
      if (!m) continue;
      tw.pop = Math.max(0, tw.pop - dt * 2.2);
      const s = 1 + Math.min(10, tw.level) * 0.025;
      m.group.scale.setScalar(s * (1 + Math.sin(tw.pop * Math.PI) * 0.25));
      if (t - tw.lastShot > 2.2) {
        tw.wantYaw = Math.sin(t * 0.35 + i * 1.7) * 0.7;
        tw.wantPitch = -0.08;
      }
      tw.yaw = dampAngle(tw.yaw, tw.wantYaw, 5, dt);
      tw.pitch = damp(tw.pitch, tw.wantPitch, 5, dt);
      tw.recoil = Math.max(0, tw.recoil - dt * 5);
      m.yaw.rotation.y = tw.yaw;
      if (m.pitch) {
        m.pitch.rotation.x = tw.pitch;
        m.pitch.position.z = tw.recoil * 0.22;
      }
      if (m.tilt) {
        tw.pour = Math.max(0, tw.pour - dt * 0.9);
        m.tilt.rotation.x = -Math.sin(Math.min(1, tw.pour * 1.4) * Math.PI) * 0.9;
      }
      tw.flare = Math.max(0, tw.flare - dt * 2);
      for (let k = 0; k < m.flames.length; k++) {
        const f = m.flames[k];
        const base = tw.type === TW_TAR ? 0.4 : 0.85 - k * 0.1;
        const h = base * (1 + 0.18 * Math.sin(t * (11 + k * 3) + k) + tw.flare * 0.9);
        f.scale.set(h * 0.55, h, 1);
        f.material.opacity = 0.75 + 0.25 * Math.sin(t * 17 + k * 2);
      }
      if (m.glow) m.glow.material.opacity = 0.3 + tw.flare * 0.4 + 0.05 * Math.sin(t * 9);
    }

    for (const s of this.bolts) this.flyShot(s, dt, true);
    for (const s of this.balls) this.flyShot(s, dt, false);

    for (let i = 0; i < this.tars.length; i++) {
      const m = this.tars[i];
      if (this.tarOn[i]) this.tarFade[i] = Math.min(1, this.tarFade[i] + dt * 2.5);
      else this.tarFade[i] = Math.max(0, this.tarFade[i] - dt * 0.8);
      m.visible = this.tarFade[i] > 0;
      if (!m.visible) continue;
      const k = this.tarFade[i];
      m.scale.setScalar(0.35 + 0.65 * (1 - Math.pow(1 - k, 3)));
      (m.material as THREE.MeshStandardMaterial).opacity = k;
    }

    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      const on = f.until > t && where(f.zid, _v2);
      for (let k = 0; k < f.sprites.length; k++) {
        const s = f.sprites[k];
        s.visible = on;
        if (!on) continue;
        const h = (k ? 0.7 : 1.0) * (1 + 0.2 * Math.sin(t * (13 + k * 4) + i));
        s.scale.set(h * 0.6, h, 1);
        s.position.set(_v2.x + (k ? 0.18 : -0.1), _v2.y + 0.9 + k * 0.25, _v2.z + (k ? -0.1 : 0.12));
      }
    }
  }

  private flyShot(s: Shot, dt: number, bolt: boolean): void {
    if (!s.active) return;
    s.t += dt;
    if (s.t >= s.dur) {
      if (bolt && s.t < s.dur + s.stick) {
        s.obj.position.set(s.tx, s.ty, s.tz);
        return;
      }
      s.active = false;
      s.obj.visible = false;
      return;
    }
    const k = s.t / s.dur;
    const x = s.fx + (s.tx - s.fx) * k;
    const y = s.fy + (s.ty - s.fy) * k + s.arc * 4 * k * (1 - k);
    const z = s.fz + (s.tz - s.fz) * k;
    if (s.arc > 0) {
      _v.set(x, y, z);
      s.obj.position.copy(_v);
    } else {
      s.obj.position.set(x, y, z);
    }
  }
}

function dampAngle(a: number, b: number, k: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
