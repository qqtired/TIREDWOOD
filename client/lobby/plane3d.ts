// Гидроплан «Стриж» в 3D: мультяшный высокоплан на двух поплавках — кремовый фюзеляж с синей полосой, красно-
// оранжевые крыло и хвост, белые поплавки, деревянный винт (на оборотах — прозрачный диск), открытая кабина с
// желейкой пилота, верёвка к кнехту на стоянке; над самолётом в небе — ник пилота (видно издалека). И табличка
// на столбике у угла павильона: что за самолёт, цена и что с ним сейчас.
// Начало координат самолёта — его опорная точка: нос смотрит на −Z, поплавки снизу на PLANE_FLOAT_Y ниже.
import * as THREE from 'three';
import { PLANE_DOCK, PLANE_FLOAT_Y, PLANE_PRICE, PLANE_SIGN } from '../../shared/plane.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { Avatar, type AvatarPose } from '../render/avatar.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const CREAM = 0xf6efe2;
const RED = 0xe8573c;
const DARK_RED = 0xb8402c;
const BLUE = 0x3c7fc4;
const WHITE = 0xf4f4f0;
const STRUT = 0x6c7078;
const WOOD = 0x8a5a36;
const SEAT = 0x4a3a32;
const FONT = 'Rubik, system-ui, sans-serif';

/** Кабина: где сидит пилот (его ступни) в осях самолёта */
const SEAT_AT = new THREE.Vector3(0, -0.42, -0.55);
/** Ник в небе — над крылом */
const LABEL_Y = 2.3;

/** Цилиндр вдоль оси Z (от z0 до z1), радиусы r0 (у z0) и r1 */
function tube(r0: number, r1: number, z0: number, z1: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, z1 - z0, seg, 1, false);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

/** Стойка от точки a к точке b */
function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return paint(g, color);
}

function planeBody(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // фюзеляж: капот, кабина, хвостовой конус; синяя полоса — кольцом чуть шире; кок винта
  parts.push(paint(tube(0.5, 0.6, -2.95, -2.35), RED));
  parts.push(paint(tube(0.6, 0.64, -2.35, 1.0), CREAM));
  parts.push(paint(tube(0.64, 0.2, 1.0, 3.9), CREAM));
  parts.push(paint(tube(0.645, 0.645, -2.1, -1.8), BLUE));
  parts.push(paint(tube(0.6, 0.46, 1.3, 1.6), BLUE));
  const spinner = new THREE.ConeGeometry(0.22, 0.42, 12);
  spinner.rotateX(-Math.PI / 2);
  parts.push(place(paint(spinner, WHITE), 0, 0, -3.15));
  // кабина: тёмный проём сверху, сиденье, козырёк
  parts.push(place(paint(new THREE.BoxGeometry(0.78, 0.08, 1.35), SEAT), 0, 0.6, -0.45));
  parts.push(place(paint(new THREE.BoxGeometry(0.66, 0.5, 0.5), SEAT), 0, -0.42 + 0.25, 0.05));
  // крыло над кабиной: размах 9,4 м, белые законцовки; стойки к фюзеляжу и подкосы
  parts.push(place(paint(new THREE.BoxGeometry(8.2, 0.14, 1.5), RED), 0, 1.22, -0.85));
  for (const sx of [-1, 1]) {
    parts.push(place(paint(new THREE.BoxGeometry(0.6, 0.14, 1.5), WHITE), sx * 4.4, 1.22, -0.85));
    parts.push(place(paint(new THREE.BoxGeometry(2.2, 0.03, 0.3), DARK_RED), sx * 2.7, 1.16, -0.2));
    parts.push(strut(new THREE.Vector3(sx * 0.35, 0.5, -1.4), new THREE.Vector3(sx * 0.35, 1.16, -1.4), 0.04, STRUT));
    parts.push(strut(new THREE.Vector3(sx * 0.35, 0.5, -0.3), new THREE.Vector3(sx * 0.35, 1.16, -0.3), 0.04, STRUT));
    parts.push(strut(new THREE.Vector3(sx * 0.55, -0.15, -0.85), new THREE.Vector3(sx * 2.6, 1.16, -0.85), 0.035, STRUT));
  }
  // хвост: стабилизатор и киль с белой полосой
  parts.push(place(paint(new THREE.BoxGeometry(3.2, 0.08, 0.8), RED), 0, 0.15, 3.45));
  parts.push(place(paint(new THREE.BoxGeometry(0.1, 1.25, 0.95), RED), 0, 0.8, 3.5));
  parts.push(place(paint(new THREE.BoxGeometry(0.11, 0.22, 0.75), WHITE), 0, 1.0, 3.55));
  // поплавки: белые, с красной полосой сверху, носы приподняты; стойки к фюзеляжу
  for (const sx of [-1, 1]) {
    const x = sx * 1.3;
    parts.push(place(paint(tube(0.26, 0.26, -1.9, 1.6), WHITE), x, -1.0, 0));
    const nose = new THREE.ConeGeometry(0.26, 0.9, 12);
    nose.rotateX(-Math.PI / 2 - 0.12);
    parts.push(place(paint(nose, WHITE), x, -0.95, -2.33));
    const tail = new THREE.ConeGeometry(0.26, 0.7, 12);
    tail.rotateX(Math.PI / 2);
    parts.push(place(paint(tail, WHITE), x, -1.0, 1.95));
    parts.push(place(paint(new THREE.BoxGeometry(0.12, 0.05, 3.6), RED), x, -0.74, -0.15));
    for (const z of [-1.3, 0.7]) parts.push(strut(new THREE.Vector3(x, -0.8, z), new THREE.Vector3(sx * 0.42, -0.45, z), 0.04, STRUT));
  }
  return mergeColored(parts);
}

export class PlaneModel {
  readonly root = new THREE.Group();
  private readonly prop = new THREE.Group();
  private readonly blades: THREE.Mesh;
  private readonly disc: THREE.Mesh;
  private readonly rope: THREE.Mesh;
  private readonly label: THREE.Sprite;
  private readonly labelCtx: CanvasRenderingContext2D;
  private readonly labelTex: THREE.CanvasTexture;
  private labelText = '';
  private rider: Avatar | null = null;
  private riderKey = '';
  private readonly riderPose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 1 };
  private readonly scene: THREE.Scene;
  private spin = 0;
  private readonly seat = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
    const body = new THREE.Mesh(planeBody(), mat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    // козырёк кабины — прозрачный
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.05), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.45, roughness: 0.1 }));
    glass.position.set(0, 0.78, -1.2);
    glass.rotation.x = -0.45;
    this.root.add(glass);
    // винт: две деревянные лопасти; на оборотах — полупрозрачный диск
    this.blades = new THREE.Mesh(mergeColored([paint(new THREE.BoxGeometry(0.14, 2.1, 0.05), WOOD)]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28), new THREE.MeshBasicMaterial({ color: 0xd9cbb8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.prop.add(this.blades, this.disc);
    this.prop.position.set(0, 0, -3.05);
    this.root.add(this.prop);
    this.root.position.set(PLANE_DOCK.x, PLANE_FLOAT_Y, PLANE_DOCK.z);
    this.root.rotation.set(0, PLANE_DOCK.yaw, 0, 'YXZ');
    scene.add(this.root);
    // верёвка от кнехта на набережной к левому поплавку (на стоянке)
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.9 }));
    scene.add(this.rope);
    // ник пилота: постоянного размера на экране, виден издалека
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    this.labelCtx = cv.getContext('2d')!;
    this.labelTex = new THREE.CanvasTexture(cv);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTex, sizeAttenuation: false, depthWrite: false, depthTest: false, transparent: true, fog: false }));
    this.label.scale.set(0.2, 0.0375, 1);
    this.label.center.set(0.5, 0);
    this.label.renderOrder = 6;
    this.label.visible = false;
    scene.add(this.label);
  }

  set visible(v: boolean) {
    this.root.visible = v;
    this.rope.visible = v && this.rope.visible;
    if (!v) {
      this.label.visible = false;
      this.rope.visible = false;
    }
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Пилот сменился: своя желейка в кабине (с его нарядом), ник над самолётом */
  setPilot(slot: number, nick: string, outfit: Outfit | null, level: number): void {
    const key = slot > 0 && outfit ? `${slot}|${nick}|${JSON.stringify(outfit)}|${level}` : '';
    if (key === this.riderKey) return;
    this.riderKey = key;
    if (this.rider && (!key || !this.rider.id || this.rider.id !== slot)) {
      this.rider.dispose(this.scene);
      this.rider = null;
    }
    if (!key || !outfit) return;
    if (!this.rider) {
      this.rider = new Avatar(slot, { gun: false });
      this.rider.driving = true;
      this.rider.addTo(this.scene);
    }
    this.rider.setOutfit(outfit);
    this.rider.setInfo(nick, null, false, level);
    this.drawLabel(nick);
  }

  private drawLabel(nick: string): void {
    const text = nick ? `✈ ${nick}` : '';
    if (text === this.labelText) return;
    this.labelText = text;
    const c = this.labelCtx;
    const w = c.canvas.width;
    const h = c.canvas.height;
    c.clearRect(0, 0, w, h);
    if (!text) return;
    c.font = `800 46px ${FONT}`;
    const tw = Math.min(w - 20, c.measureText(text).width + 44);
    c.fillStyle = 'rgba(28, 36, 52, 0.72)';
    const x0 = (w - tw) / 2;
    c.beginPath();
    c.roundRect(x0, 14, tw, h - 24, 28);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 4, w - 40);
    this.labelTex.needsUpdate = true;
  }

  /**
   * Кадр: поза самолёта, обороты винта (0 — стоит, 1 — полный газ), качка на воде, пилот в кабине, ник (label —
   * показывать ли), верёвка (только на стоянке).
   */
  update(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, prop: number, docked: boolean, label: boolean, dt: number, time: number, camPos: THREE.Vector3, local: boolean): void {
    const onWater = y < PLANE_FLOAT_Y + 0.15;
    const bob = onWater ? Math.sin(time * 1.3) * 0.05 + Math.sin(time * 2.1 + 1) * 0.02 : 0;
    const sway = onWater ? Math.sin(time * 0.9) * 0.025 : 0;
    this.root.position.set(x, y + bob, z);
    this.root.rotation.set(pitch + (onWater ? Math.sin(time * 1.1 + 0.5) * 0.012 : 0), yaw, roll + sway, 'YXZ');
    this.root.updateMatrixWorld(true);
    this.spin += dt * prop * 48;
    this.prop.rotation.z = this.spin;
    const fast = Math.min(1, Math.max(0, (prop - 0.45) / 0.4));
    this.blades.visible = fast < 0.95;
    (this.disc.material as THREE.MeshBasicMaterial).opacity = fast * 0.32;
    // верёвка: кнехт (−29,2; −12) → нос левого поплавка
    this.rope.visible = docked && this.root.visible;
    if (this.rope.visible) {
      const a = new THREE.Vector3(-29.2, 0.42, -12);
      const b = new THREE.Vector3(-1.3, -0.85, -1.9).applyMatrix4(this.root.matrixWorld);
      this.rope.position.copy(a).add(b).multiplyScalar(0.5);
      this.rope.scale.set(1, a.distanceTo(b), 1);
      this.rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    }
    const r = this.rider;
    if (r) {
      this.seat.copy(SEAT_AT).applyMatrix4(this.root.matrixWorld);
      Object.assign(this.riderPose, { x: this.seat.x, y: this.seat.y, z: this.seat.z, yaw, pitch: 0 });
      r.update(this.root.visible ? this.riderPose : null, dt, time, { groundBelow: () => -1000 }, camPos, local);
      if (this.root.visible) r.root.rotation.set(pitch, yaw, roll + sway, 'YXZ');
    }
    this.label.visible = label && this.labelText !== '' && this.root.visible;
    if (this.label.visible) this.label.position.set(x, y + LABEL_Y, z);
  }

  dispose(): void {
    this.rider?.dispose(this.scene);
    this.rider = null;
  }
}

// ------------------------------------------------------------ табличка

const W = 512;
const H = 300;
const BOARD_W = 0.98;
const BOARD_H = (BOARD_W * H) / W;
const BOARD_Y = 1.3;

export class PlaneSign {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly group = new THREE.Group();
  private key = '';

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // столбик (его бокс — в карте) и рамка; лицевая сторона — на восток, к площади
    const { x, z } = PLANE_SIGN;
    const parts = [
      place(paint(new THREE.BoxGeometry(0.09, BOARD_Y + BOARD_H + 0.06, 0.09), 0x5b4130), x - 0.02, (BOARD_Y + BOARD_H + 0.06) / 2, z),
      place(paint(new THREE.BoxGeometry(0.05, BOARD_H + 0.08, BOARD_W + 0.08), 0x7a5536), x + 0.03, BOARD_Y + BOARD_H / 2, z),
      place(paint(new THREE.ConeGeometry(0.07, 0.07, 4).rotateY(Math.PI / 4), 0x3a2a1e), x - 0.02, BOARD_Y + BOARD_H + 0.1, z),
    ];
    const wood = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    wood.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.18 }),
    );
    face.position.set(x + 0.056, BOARD_Y + BOARD_H / 2, z);
    face.rotation.y = Math.PI / 2;
    this.group.add(wood, face);
    scene.add(this.group);
    this.draw('Свободен — подойди и нажми E', '#8ff0a4', '');
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  /** Что с самолётом: строка состояния (цвет) и строка очереди. */
  update(line: string, color: string, queue: string): void {
    const key = `${line}|${color}|${queue}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(line, color, queue);
  }

  private draw(line: string, color: string, queue: string): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // небесно-голубая доска с белой каймой и самолётиком
    c.fillStyle = '#2a6fa8';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#f4f2ec';
    c.lineWidth = 8;
    c.strokeRect(10, 10, W - 20, H - 20);
    c.fillStyle = '#ffd35c';
    c.font = `64px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('✈', 68, 70);
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    fit(c, 'ГИДРОПЛАН «СТРИЖ»', 116, 60, W - 140, 900, 40);
    c.fillStyle = '#d6e6f5';
    fit(c, 'Полёт над городом · 3 минуты', 116, 100, W - 140, 700, 26);
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    fit(c, `${PLANE_PRICE} 🪙 · E у самолёта`, W / 2, 152, W - 50, 800, 34);
    if (queue) {
      c.fillStyle = '#ffd35c';
      fit(c, queue, W / 2, 200, W - 50, 700, 24);
    }
    c.fillStyle = color;
    fit(c, line, W / 2, 250, W - 50, 900, 28);
    this.tex.needsUpdate = true;
  }
}

/** Строка в (x, y) не шире maxW: не влезает — шрифт мельче. */
function fit(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.fillText(text, x, y);
}
