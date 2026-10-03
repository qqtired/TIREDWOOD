// Арсенал «Крепости» в мире: деревянные лестницы у стен, прилавок с навесом и торговцем на террасе, башни на стенах
// (модели и анимации — client/fort/turrets/, здесь только вызовы), болты и ядра в полёте, гранаты и дуга броска, лужи
// смолы, огонь на горящих зомби и тяжёлые стволы в руках у желеек. Здесь только меши и их анимация; что и когда —
// решает ArsenalClient (client/fort/arsenalc.ts) по событиям сервера.
import * as THREE from 'three';
import { GREN_R, GUN_CROSSBOW, GUN_MG, GUN_SHOTGUN, TOWER_SPOT_COUNT } from '../../shared/fortarsenal.ts';
import { LADDERS } from '../../shared/fortladder.ts';
import { SHOP_COUNTER, TERRACE, TOWER_SPOTS, WALL_H } from '../../shared/fortmap.ts';
import { damp } from '../../shared/math.ts';
import type { Avatar } from '../render/avatar.ts';
import { glowSprite, mergeColored, paint, place, staticMesh } from '../render/kit.ts';
import type { Quality } from '../settings.ts';
import { ringTexture } from './textures.ts';
import { Turrets3D } from './turrets/turrets3d.ts';

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

/** Торговец стоит на ящике за прилавком: глаза и усы — над столешницей */
const MERCHANT_STEP = 0.5;
const MERCHANT_SCALE = 1.12;

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
  /** Башни на стенах: модели, анимации и их частицы (client/fort/turrets) */
  readonly turrets: Turrets3D;
  /** Кого последним подожгла жаровня — туда она и смотрит */
  private lastBurn = -1;
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

  /** camera — чтобы не рисовать башни вне кадра (без неё рисуются все) */
  constructor(scene: THREE.Scene, camera: THREE.Camera | null = null) {
    this.scene = scene;
    this.buildLadders();
    this.buildStall();
    this.turrets = new Turrets3D(scene, 'high', TOWER_SPOTS, camera);
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
    // ящик, на котором стоит торговец (из-за прилавка его иначе не видно)
    geos.push(place(paint(new THREE.BoxGeometry(0.72, MERCHANT_STEP, 0.56), WOOD_DARK), cx, y0 + MERCHANT_STEP / 2, 10.45));
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
    // щит с крючками за торговцем: на нём стволы, что продаются
    geos.push(place(paint(new THREE.BoxGeometry(1.7, 1.12, 0.05), WOOD_DARK), cx, y0 + 1.77, wallZ));
    for (const y of [2.04, 1.7, 1.34]) {
      for (const s of [-0.42, 0.42]) geos.push(place(paint(new THREE.BoxGeometry(0.05, 0.05, 0.14), IRON), cx + s, y0 + y, wallZ - 0.08));
    }
    const stall = staticMesh(mergeColored(geos), vc(), true);
    this.scene.add(stall);
    // три ствола на крючках одной стопкой: дробовик, арбалет, пулемёт — каждый на своей высоте
    for (const [gun, y] of [[GUN_SHOTGUN, 2.12], [GUN_CROSSBOW, 1.78], [GUN_MG, 1.42]] as const) {
      const m = gunModel(gun);
      m.group.scale.setScalar(1.2);
      m.group.rotation.set(0, Math.PI / 2, 0.08);
      m.group.position.set(cx, y0 + y, wallZ - 0.1);
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
    this.merchant.position.set(cx, y0 + MERCHANT_STEP, 10.45);
    this.merchant.scale.setScalar(MERCHANT_SCALE);
    this.scene.add(this.merchant);
  }

  // ------------------------------------------------------------ башни

  /** Что стоит на местах (из хвоста снимка): тип (−1 — пусто) и уровень; постройку и улучшение башни видят сами */
  setTowers(types: readonly number[], levels: readonly number[]): void {
    this.turrets.setAll(types, levels);
  }

  /** Баллиста выстрелила в (x, y, z) по зомби zid: поворот, отдача, болт в полёт. Возвращает, где дуло (для эффектов). */
  bolt(i: number, x: number, y: number, z: number, out: THREE.Vector3, zid = -1): THREE.Vector3 {
    this.turrets.fire(i, x, y, z, out, zid);
    this.launch(this.bolts, out.x, out.y, out.z, x, y, z, Math.max(0.05, out.distanceTo(_v.set(x, y, z)) / 70), 0, 0.5);
    return out;
  }

  /** Болт арбалета игрока: от дула к цели */
  playerBolt(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
    this.launch(this.bolts, fx, fy, fz, tx, ty, tz, Math.max(0.04, Math.hypot(tx - fx, ty - fy, tz - fz) / 90), 0, 0.6);
  }

  /** Пушка: ядро по дуге за ticks тиков */
  cannon(i: number, x: number, y: number, z: number, ticks: number, out: THREE.Vector3): THREE.Vector3 {
    this.turrets.fire(i, x, y, z, out);
    const d = out.distanceTo(_v.set(x, y, z));
    this.launch(this.balls, out.x, out.y, out.z, x, y + 0.2, z, ticks / 60, Math.min(5, d * 0.16), 0);
    return out;
  }

  /** Котёл вылил смолу в (x, z) */
  pour(i: number, x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    this.turrets.fire(i, x, 0, z, out);
    const m = this.tars[i];
    m.position.set(x, 0.035, z);
    m.rotation.y = Math.random() * Math.PI * 2;
    this.tarOn[i] = true;
    this.tarFade[i] = 0.01;
    return out;
  }

  /** Жаровня плюнула углями — в сторону последнего подожжённого (события burn приходят перед coals) */
  coals(i: number, out: THREE.Vector3): THREE.Vector3 {
    this.turrets.fire(i, NaN, NaN, NaN, out, this.lastBurn);
    this.lastBurn = -1;
    return out;
  }

  /** Качество: у башен — сколько частиц и мелочей */
  setQuality(q: Quality, slow = false): void {
    this.turrets.setQuality(q, slow);
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
    this.lastBurn = zid;
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
    this.turrets.reset();
    this.lastBurn = -1;
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

  /** where(zid, out) — где сейчас зомби (огонь на нём; башни ведут по нему цель) */
  update(dt: number, camPos: THREE.Vector3, where: (zid: number, out: THREE.Vector3) => boolean): void {
    this.time += dt;
    const t = this.time;
    // торговец (на ящике за прилавком) покачивается и поглядывает на ближнего
    this.merchant.position.y = TERRACE.h + MERCHANT_STEP + Math.abs(Math.sin(t * 2.2)) * 0.04;
    this.merchant.scale.set(MERCHANT_SCALE * (1 + Math.sin(t * 4.4) * 0.015), MERCHANT_SCALE * (1 - Math.sin(t * 4.4) * 0.015), MERCHANT_SCALE);
    const dx = camPos.x - this.merchant.position.x;
    const dz = camPos.z - this.merchant.position.z;
    if (dx * dx + dz * dz < 900) this.merchant.rotation.y = damp(this.merchant.rotation.y, Math.atan2(-dx, -dz), 3, dt);

    this.turrets.update(dt, camPos, where);

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
