// Табличка катера «Ласточка» на столбике у причала, лицом к площади (на север): что за катер, сколько стоит и что
// с ним сейчас — свободен, посадка (через сколько отплытие, сколько мест осталось), в поездке (когда вернётся).
// Холст перерисовывается, только когда меняется текст (раз в секунду во время отсчёта).
import * as THREE from 'three';
import { BOAT_PRICE, BOAT_RIDE_TICKS, BOAT_SEATS, BP_BOARD, BP_RIDE } from '../../shared/boat.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import { BOAT_SIGN } from '../../shared/maps/lobby.ts';
import type { BoatStatus } from '../../shared/messages.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const W = 512;
const H = 300;
const FONT = 'Rubik, system-ui, sans-serif';
/** Доска: ширина, высота, нижний край над настилом */
const BOARD_W = 0.92;
const BOARD_H = (BOARD_W * H) / W;
const BOARD_Y = 1.32;

export class BoatSign {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key = '';

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // столбик (его бокс — в карте), рамка доски; лицевая сторона — на север, к площади
    const { x, z } = BOAT_SIGN;
    const parts = [
      place(paint(new THREE.BoxGeometry(0.09, BOARD_Y + BOARD_H + 0.06, 0.09), 0x5b4130), x, (BOARD_Y + BOARD_H + 0.06) / 2, z + 0.02),
      place(paint(new THREE.BoxGeometry(BOARD_W + 0.08, BOARD_H + 0.08, 0.05), 0x7a5536), x, BOARD_Y + BOARD_H / 2, z - 0.03),
      place(paint(new THREE.ConeGeometry(0.07, 0.07, 4).rotateY(Math.PI / 4), 0x3a2a1e), x, BOARD_Y + BOARD_H + 0.1, z + 0.02),
    ];
    const wood = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    wood.castShadow = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.18 }),
    );
    face.position.set(x, BOARD_Y + BOARD_H / 2, z - 0.056);
    face.rotation.y = Math.PI;
    scene.add(wood, face);
    this.draw('', '#9fd6ff');
  }

  /** Статус катера и часы сервера (тики): что написать внизу. */
  update(st: BoatStatus, tick: number): void {
    let line: string;
    let color: string;
    if (st.ph === BP_RIDE) {
      line = `В поездке · вернётся через ${secs(st.at + BOAT_RIDE_TICKS - tick)} с`;
      color = '#9fd6ff';
    } else if (st.ph === BP_BOARD) {
      const free = BOAT_SEATS - st.n;
      line = free > 0 ? `Отплытие через ${secs(st.at - tick)} с · свободно мест: ${free}` : `Мест нет · отплытие через ${secs(st.at - tick)} с`;
      color = '#ffd35c';
    } else {
      line = 'Свободен — подойди и нажми E';
      color = '#8ff0a4';
    }
    const key = `${line}|${st.nick}`;
    if (key === this.key) return;
    this.key = key;
    this.draw(line, color, st.ph === BP_BOARD || st.ph === BP_RIDE ? st.nick : '');
  }

  private draw(line: string, color: string, captain = ''): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // доска цвета морской волны с белой каймой и спасательным кругом
    c.fillStyle = '#1f4a72';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#f4f2ec';
    c.lineWidth = 8;
    c.strokeRect(10, 10, W - 20, H - 20);
    c.lineWidth = 14;
    c.strokeStyle = '#e8473a';
    c.beginPath();
    c.arc(66, 70, 30, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = '#f4f2ec';
    c.setLineDash([12, 12]);
    c.beginPath();
    c.arc(66, 70, 30, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    fit(c, 'КАТЕР «ЛАСТОЧКА»', 112, 62, W - 136, 900, 42);
    c.fillStyle = '#d6e6f5';
    fit(c, 'Прогулка по бухте · 1 минута', 112, 102, W - 136, 700, 26);
    c.textAlign = 'center';
    fit(c, `${BOAT_PRICE} жетонов — друзьям бесплатно`, W / 2, 150, W - 50, 700, 27);
    fit(c, `До ${BOAT_SEATS} человек · посадка 30 с`, W / 2, 184, W - 50, 700, 27);
    if (captain) {
      c.fillStyle = '#ffd35c';
      fit(c, `Капитан: ${captain}`, W / 2, 218, W - 50, 700, 24);
    }
    if (line) {
      c.fillStyle = color;
      fit(c, line, W / 2, 256, W - 50, 900, 30);
    }
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

function secs(ticks: number): number {
  return Math.max(0, Math.ceil(ticks / TICK_RATE));
}
