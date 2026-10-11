// Ряд аркадных автоматов в курзале (флаг PLAZA3): шесть корпусов по точкам 'arcade' карты (по два на игру), собраны
// в three.js — в модели курзала (pav_kursaal) их нет, только якоря. Классический «стоячий» автомат в стиле курорта:
// эмаль цвета игры, кремовая окантовка, вывеска с названием и лампочками, экран 4:3 с наклоном, панель с джойстиком.
// Отрисовок 2: корпуса (один меш на все, вершинные цвета — та же программа, что у коробок plaza3/world.ts), экраны
// и вывески (одна текстура-атлас 640×880 на все шесть экранов и три вывески; лампочки нарисованы на вывеске).
// На экранах — демо с автопилотом; кто-то играет — «ИГРАЕТ <ник>» и его живой счёт (решение 3а). Экраны обновляем
// 12 раз в секунду и только ближе FAR м; дальше — последний кадр.
import * as THREE from 'three';
import { arcGameOfCab } from '../../../../shared/arcade/games.ts';
import { H, W, type ArcGameId } from '../../../../shared/arcade/kit.ts';
import type { Interactable } from '../../../../shared/maps/lobby.ts';
import { mergeColored, paint, place, staticMesh } from '../../../render/kit.ts';
import type { Wet } from '../../plaza/gfx.ts';
import { Cabinet, txt, type GameDef } from './kit.ts';

/** От точки игрока до середины корпуса, м (корпус глубиной 0,85 спиной к стене курзала) */
export const CAB_FROM_USE = 1.25;
const FAR = 24;
const REDRAW = 1 / 12;
const AW = 640;
const AH = 880;

const THEME: Record<ArcGameId, { c: number; side: number; dark: number; trim: number }> = {
  train: { c: 0xd9483a, side: 0xb33a2d, dark: 0x6e2418, trim: 0xfff3de },
  tir: { c: 0x2f8a4a, side: 0x23703a, dark: 0x174a29, trim: 0xfff3de },
  castle: { c: 0x2a9bb0, side: 0x1d8396, dark: 0x144f5e, trim: 0xf3d9a4 },
};
const INK = 0x2a1f24;
const GAME_INDEX: Record<ArcGameId, number> = { train: 0, tir: 1, castle: 2 };

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0): THREE.BufferGeometry {
  return place(paint(new THREE.BoxGeometry(w, h, d), color), x, y, z, 0, rx);
}

/** Корпус в своих координатах: пол — y 0, лицо — к −Z, середина основания — (0, 0, 0) */
function cabinetParts(theme: (typeof THEME)[ArcGameId]): THREE.BufferGeometry[] {
  const { c, side, dark, trim } = theme;
  const g: THREE.BufferGeometry[] = [];
  const back = 0.425;
  const sec = (y0: number, y1: number, front: number, color: number): void => {
    g.push(box(0.84, y1 - y0, back - front, color, 0, (y0 + y1) / 2, (front + back) / 2));
  };
  sec(0, 0.92, -0.3, c); // тумба
  sec(0.92, 1.02, -0.48, dark); // панель управления
  sec(1.02, 1.6, -0.05, INK); // ниша экрана
  sec(1.6, 1.95, -0.4, dark); // короб вывески
  // боковины с кремовой окантовкой по лицу
  for (const sx of [-1, 1]) {
    const x = sx * 0.435;
    g.push(box(0.03, 0.92, back + 0.3, side, x, 0.46, (back - 0.3) / 2));
    g.push(box(0.03, 0.1, back + 0.48, side, x, 0.97, (back - 0.48) / 2));
    g.push(box(0.03, 0.58, back + 0.3, side, x, 1.31, (back - 0.3) / 2));
    g.push(box(0.03, 0.35, back + 0.42, side, x, 1.775, (back - 0.42) / 2));
    g.push(box(0.035, 0.92, 0.02, trim, x, 0.46, -0.31));
    g.push(box(0.035, 0.58, 0.02, trim, x, 1.31, -0.31));
    g.push(box(0.035, 0.35, 0.02, trim, x, 1.775, -0.43));
  }
  g.push(box(0.9, 0.03, 0.5, trim, 0, 1.955, -0.15)); // крышка
  g.push(box(0.86, 0.025, 0.02, trim, 0, 1.6, -0.41)); // кант под вывеской
  g.push(box(0.84, 0.025, 0.5, trim, 0, 1.025, -0.23)); // кант панели
  g.push(box(0.84, 0.11, 0.02, INK, 0, 0.055, -0.31)); // цоколь
  // дверца для жетонов с тёплым огоньком
  g.push(box(0.2, 0.24, 0.02, INK, 0, 0.42, -0.31));
  g.push(box(0.05, 0.08, 0.025, 0xffb36b, 0, 0.44, -0.315));
  // наклонная рамка экрана (15° назад)
  g.push(box(0.74, 0.6, 0.03, 0x241a1e, 0, 1.3, -0.17, Math.PI / 12));
  // джойстик и две кнопки
  g.push(place(paint(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), INK), -0.18, 1.07, -0.33));
  g.push(place(paint(new THREE.SphereGeometry(0.032, 10, 8), 0xd9283a), -0.18, 1.12, -0.33));
  g.push(place(paint(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 12), 0xffd35a), 0.08, 1.04, -0.33));
  g.push(place(paint(new THREE.CylinderGeometry(0.028, 0.028, 0.022, 12), trim), 0.18, 1.04, -0.33));
  return g;
}

/** Прямоугольник атласа (пиксели холста) на плоскость w × h, лицом к −Z, повёрнутую rx вокруг X */
function quad(w: number, h: number, px: number, py: number, pw: number, ph: number, y: number, z: number, rx: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateY(Math.PI);
  g.rotateX(rx);
  g.translate(0, y, z);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const u0 = px / AW;
  const v0 = 1 - (py + ph) / AH;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (pw / AW), v0 + uv.getY(i) * (ph / AH));
  return g;
}

/** Вывеска игры (320×80): эмаль цвета игры, лампочки по краю, название золотом */
function drawMarquee(ctx: CanvasRenderingContext2D, x: number, y: number, game: ArcGameId, title: string, like: string): void {
  const t = THEME[game];
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  const g = ctx.createLinearGradient(0, y, 0, y + 80);
  g.addColorStop(0, hex(t.dark));
  g.addColorStop(1, '#2a1410');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, 320, 80);
  ctx.strokeStyle = hex(t.trim);
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 3, y + 3, 314, 74);
  ctx.fillStyle = '#fff1b8';
  for (let i = 0; i < 20; i++) {
    for (const yy of [y + 9, y + 71]) {
      ctx.beginPath();
      ctx.arc(x + 14 + i * 15.4, yy, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  txt(ctx, title.toUpperCase(), x + 160, y + 37, title.length > 10 ? 26 : 32, '#ffd35a', 'center', '#000');
  txt(ctx, like.toUpperCase(), x + 160, y + 59, 11, '#fff3de', 'center', null);
}

export interface CabinetsDeps {
  scene: THREE.Scene;
  /** Точки 'arcade' карты по номеру корпуса */
  points: readonly Interactable[];
  defs: Record<ArcGameId, GameDef<never, never>>;
  wet: Wet;
}

export class ArcadeCabinets3D {
  readonly group = new THREE.Group();
  private readonly actx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly demos: Cabinet[] = [];
  private readonly screens: HTMLCanvasElement[] = [];
  private readonly center = new THREE.Vector3();
  private redraw = 0;
  private shown = true;

  constructor(d: CabinetsDeps) {
    this.group.name = 'plaza3-arcade';
    d.scene.add(this.group);
    const atlas = document.createElement('canvas');
    atlas.width = AW;
    atlas.height = AH;
    this.actx = atlas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(atlas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;

    const parts: THREE.BufferGeometry[] = [];
    const faces: THREE.BufferGeometry[] = [];
    d.points.forEach((p, i) => {
      const game = arcGameOfCab(i);
      // игрок смотрит по yaw на корпус: середина корпуса — CAB_FROM_USE м вперёд, лицо корпуса — навстречу
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const cx = p.x + fx * CAB_FROM_USE;
      const cz = p.z + fz * CAB_FROM_USE;
      const ry = p.yaw + Math.PI;
      const m = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, 0, cz);
      for (const g of cabinetParts(THEME[game])) parts.push(g.applyMatrix4(m));
      // экран (в наклонной рамке) и вывеска — из атласа
      const col = i % 2;
      const row = Math.floor(i / 2);
      faces.push(quad(0.6, 0.45, col * W, row * H, W, H, 1.3, -0.205, Math.PI / 12).applyMatrix4(m));
      const gi = GAME_INDEX[game];
      faces.push(quad(0.8, 0.2, (gi % 2) * 320, 720 + Math.floor(gi / 2) * 80, 320, 80, 1.775, -0.42, 0).applyMatrix4(m));
      this.center.x += cx / d.points.length;
      this.center.z += cz / d.points.length;
      // экран корпуса: демо с автопилотом (не нажимается — играют в окне)
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      this.screens.push(cv);
      this.demos.push(new Cabinet(cv, d.defs[game] as unknown as GameDef<never, never>, { interactive: false, startHint: 'E — ИГРАТЬ', best: 0 }));
    });
    this.center.y = 1.3;
    const mat = d.wet(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
    const body = staticMesh(mergeColored(parts), mat, true);
    body.name = 'arcade-cabinets';
    this.group.add(body);
    const faceMesh = new THREE.Mesh(mergeFaces(faces), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    faceMesh.name = 'arcade-screens';
    faceMesh.matrixAutoUpdate = false;
    this.group.add(faceMesh);
    this.paintMarquees(d);
    // шрифт мог догрузиться позже первого рисунка — вывески ещё раз
    void document.fonts?.ready.then(() => this.paintMarquees(d));
    this.redraw = REDRAW;
  }

  private paintMarquees(d: CabinetsDeps): void {
    for (const id of Object.keys(GAME_INDEX) as ArcGameId[]) {
      const gi = GAME_INDEX[id];
      const m = d.defs[id].meta;
      drawMarquee(this.actx, (gi % 2) * 320, 720 + Math.floor(gi / 2) * 80, id, m.title, m.like);
    }
    this.tex.needsUpdate = true;
  }

  /** Кто за корпусом и его живой счёт (пусто — свободен: просто демо) */
  setCab(i: number, nick: string, live: number): void {
    this.demos[i]?.setBanner(nick, live);
  }

  setVisible(on: boolean): void {
    this.shown = on;
    this.group.visible = on;
  }

  /** Кадр: демо идут и экраны перерисовываются, только когда камера близко */
  update(dt: number, cam: THREE.Vector3): void {
    if (!this.shown || cam.distanceTo(this.center) > FAR) return;
    for (const g of this.demos) g.frame(dt, false);
    this.redraw -= dt;
    if (this.redraw > 0) return;
    this.redraw = REDRAW;
    const ctx = this.actx;
    for (let i = 0; i < this.demos.length; i++) {
      this.demos[i].draw();
      ctx.drawImage(this.screens[i], (i % 2) * W, Math.floor(i / 2) * H);
    }
    this.tex.needsUpdate = true;
  }

  debug(): Record<string, unknown> {
    return { cabs: this.demos.length, modes: this.demos.map((g) => g.mode), center: [this.center.x, this.center.z] };
  }
}

function mergeFaces(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.getAttribute('position');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      uv.push(u.getX(i), u.getY(i));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
