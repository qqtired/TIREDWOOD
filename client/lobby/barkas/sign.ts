// Табличка лодки «Удалая» на столбике у хижины Семёна (shared/ferry.ts — FERRY_SIGN), лицом к мосткам: куда возит, кого
// берёт (с 3-го уровня рыбалки) и что с лодкой сейчас — у причала за хижиной, отсчёт до отхода, в море (когда вернётся).
// Холст перерисовывается, только когда меняется текст.
import * as THREE from 'three';
import { BARKAS_FISH_SPOTS } from '../../../shared/barkas.ts';
import { TICK_RATE } from '../../../shared/constants.ts';
import { FE_AWAY, FE_BOARD, FE_HOME, FE_OUT, FERRY_LEVEL, FERRY_SEATS, FERRY_SIGN, ferryEta } from '../../../shared/ferry.ts';
import type { FerryStatus } from '../../../shared/messages.ts';
import { mergeColored, paint, place } from '../../render/kit.ts';

const W = 512;
const H = 300;
const FONT = 'Rubik, system-ui, sans-serif';
const BOARD_W = 0.92;
const BOARD_H = (BOARD_W * H) / W;
const BOARD_Y = 1.3;

export class FerrySign {
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
    const { x, z } = FERRY_SIGN;
    const parts = [
      place(paint(new THREE.BoxGeometry(0.09, BOARD_Y + BOARD_H + 0.06, 0.09), 0x5b4130), x, (BOARD_Y + BOARD_H + 0.06) / 2, z + 0.02),
      place(paint(new THREE.BoxGeometry(BOARD_W + 0.08, BOARD_H + 0.08, 0.05), 0x6e5236), x, BOARD_Y + BOARD_H / 2, z - 0.03),
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
    this.draw('', '#bfe3dc');
  }

  update(st: FerryStatus, tick: number): void {
    let line: string;
    let color: string;
    const s = (ticks: number): number => Math.max(0, Math.ceil(ticks / TICK_RATE));
    if (st.ph === FE_HOME) {
      line = 'За хижиной, у причала — подойди и нажми E';
      color = '#8ff0a4';
    } else if (st.ph === FE_BOARD) {
      const free = FERRY_SEATS - st.n;
      line = free > 0 ? `Отход через ${s(st.at - tick)} с · свободно мест: ${free}` : `Мест нет · отход через ${s(st.at - tick)} с`;
      color = '#ffd35c';
    } else {
      const back = s(ferryEta(st.ph, st.at, tick, false));
      line = st.ph === FE_OUT ? `Идёт к баркасу · вернётся через ${back} с` : st.ph === FE_AWAY ? `У баркаса · будет здесь через ${back} с` : `Возвращается · будет через ${back} с`;
      color = '#9fd6ff';
    }
    if (line === this.key) return;
    this.key = line;
    this.draw(line, color);
  }

  private draw(line: string, color: string): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // доска цвета лодки (выцветшая бирюза) с кремовой каймой и якорем
    c.fillStyle = '#2f6f69';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = '#f2e8cc';
    c.lineWidth = 8;
    c.strokeRect(10, 10, W - 20, H - 20);
    anchor(c, 64, 70);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    fit(c, 'ЛОДКА «УДАЛАЯ»', 112, 58, W - 136, 900, 42);
    c.fillStyle = '#d9efe9';
    fit(c, 'к баркасу «Альбатрос» и обратно', 112, 100, W - 136, 700, 26);
    c.textAlign = 'center';
    c.fillStyle = '#ffe7a8';
    fit(c, `Семён берёт с ${FERRY_LEVEL}-го уровня рыбалки`, W / 2, 150, W - 50, 800, 28);
    c.fillStyle = '#d9efe9';
    fit(c, `Бесплатно · до ${FERRY_SEATS} человек · на борту ${BARKAS_FISH_SPOTS.length} мест рыбалки`, W / 2, 186, W - 50, 600, 24);
    if (line) {
      c.fillStyle = color;
      fit(c, line, W / 2, 248, W - 50, 900, 30);
    }
    this.tex.needsUpdate = true;
  }
}

/** Якорь мелом */
function anchor(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.strokeStyle = '#f2e8cc';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(x, y - 30, 9, 0, Math.PI * 2);
  c.moveTo(x, y - 21);
  c.lineTo(x, y + 30);
  c.moveTo(x - 20, y - 8);
  c.lineTo(x + 20, y - 8);
  c.moveTo(x - 30, y + 8);
  c.quadraticCurveTo(x - 26, y + 32, x, y + 32);
  c.quadraticCurveTo(x + 26, y + 32, x + 30, y + 8);
  c.stroke();
}

function fit(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.fillText(text, x, y);
}
