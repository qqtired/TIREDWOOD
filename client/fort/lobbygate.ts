// Арка «Крепость» на набережной (выпуск 6): каменные столбы в проулке между складом и гаражом, зубчатая перемычка,
// вывеска «КРЕПОСТЬ», флажки и строка «что внутри». Появляется, только если сервер прислал статус крепости
// (режим включён флагом FORTRESS): без флага на набережной ничего не меняется.
import * as THREE from 'three';
import { FORT_MAX_HUMANS, FT_BREAK, FT_END, FT_GATHER, FT_WAVE, type FortStatus } from '../../shared/fort.ts';
import { FORT_ARCH } from '../../shared/maps/lobby.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const STONE = 0xcbbfa6;
const STONE_DARK = 0xa99b80;
const WOOD = 0x7a4f2e;

/** Подсказка у точки «fort» на набережной */
export function fortHint(st: FortStatus): { keys: string[]; text: string } {
  if (st.humans >= FORT_MAX_HUMANS) return { keys: [], text: `Крепость: мест нет (${st.humans} из ${FORT_MAX_HUMANS})` };
  const who = st.humans > 0 ? ` · защитников: ${st.humans}` : '';
  switch (st.phase) {
    case FT_WAVE:
      return { keys: ['E'], text: `в крепость — идёт волна ${st.wave}${who}` };
    case FT_BREAK:
      return { keys: ['E'], text: `в крепость — передышка перед волной ${st.wave + 1}${who}` };
    case FT_END:
      return { keys: ['E'], text: `в крепость — итоги, новая игра через ${st.left} с${who}` };
    default:
      return { keys: ['E'], text: st.humans > 0 ? `в крепость — сбор, волна через ${st.left} с${who}` : 'в крепость — оборона от зомби, до 6 человек' };
  }
}

/** Строка на табличке под вывеской */
export function statusLine(st: FortStatus): string {
  if (st.humans === 0) return 'зомби идут — заходи';
  if (st.phase === FT_WAVE) return `волна ${st.wave} · держат ${st.humans}`;
  if (st.phase === FT_BREAK) return `передышка · ${st.humans} на стенах`;
  if (st.phase === FT_END) return 'итоги боя';
  if (st.phase === FT_GATHER) return `сбор · ${st.humans} на стенах`;
  return '';
}

export class FortGate {
  readonly group = new THREE.Group();
  private readonly lineCanvas = document.createElement('canvas');
  private readonly lineTex: THREE.CanvasTexture;
  private readonly flags: THREE.Mesh[] = [];
  private line = '';

  constructor(scene: THREE.Scene) {
    const { x, z, w } = FORT_ARCH;
    const half = w / 2;
    const parts: THREE.BufferGeometry[] = [];
    const block = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, c: number) => {
      parts.push(place(paint(new THREE.BoxGeometry(sx, sy, sz), c), px, py, pz));
    };
    // столбы у стен склада и гаража, с цоколем и шапкой
    for (const s of [-1, 1]) {
      const px = x + s * (half + 0.3);
      block(0.62, 3.4, 0.7, px, 1.7, z, STONE);
      block(0.8, 0.35, 0.86, px, 0.175, z, STONE_DARK);
      block(0.78, 0.18, 0.84, px, 3.45, z, STONE_DARK);
    }
    // перемычка и зубцы
    block(w + 1.4, 0.62, 0.86, x, 3.85, z, STONE);
    for (let i = 0; i < 5; i++) block(0.48, 0.42, 0.86, x - (w + 0.9) / 2 + 0.24 + (i * (w + 0.9 - 0.48)) / 4, 4.37, z, STONE);
    // флагштоки над столбами
    for (const s of [-1, 1]) block(0.06, 1.3, 0.06, x + s * (half + 0.3), 5.0, z, WOOD);
    const stone = new THREE.Mesh(mergeColored(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    stone.castShadow = true;
    stone.receiveShadow = true;
    this.group.add(stone);

    // флажки: красный и жёлтый, колышутся
    const flagGeo = new THREE.PlaneGeometry(0.7, 0.42).translate(0.35, 0, 0);
    [0xe0492f, 0xf2c230].forEach((c, i) => {
      const f = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
      f.position.set(x + (i === 0 ? -1 : 1) * (half + 0.3), 5.4, z);
      this.group.add(f);
      this.flags.push(f);
    });

    // вывеска на перемычке, лицом к площади (на юг, +Z)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, 0.5), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7 }));
    sign.position.set(x, 3.86, z + 0.44);
    this.group.add(sign);
    // табличка «что внутри» на правом столбе
    this.lineCanvas.width = 512;
    this.lineCanvas.height = 96;
    this.lineTex = new THREE.CanvasTexture(this.lineCanvas);
    this.lineTex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), new THREE.MeshStandardMaterial({ map: this.lineTex, roughness: 0.8 }));
    plate.position.set(x, 3.38, z + 0.44);
    this.group.add(plate);
    scene.add(this.group);
  }

  setStatus(st: FortStatus | null): void {
    this.group.visible = st !== null;
    if (!st) return;
    const line = statusLine(st);
    if (line === this.line) return;
    this.line = line;
    const ctx = this.lineCanvas.getContext('2d')!;
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(0, 0, 512, 96);
    ctx.strokeStyle = '#c9a46a';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 502, 86);
    ctx.font = '700 44px Rubik, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe9b8';
    ctx.fillText(line, 256, 50, 480);
    this.lineTex.needsUpdate = true;
  }

  update(time: number): void {
    if (!this.group.visible) return;
    this.flags.forEach((f, i) => {
      f.rotation.y = Math.sin(time * 2.1 + i * 1.7) * 0.35 + (i === 0 ? Math.PI : 0);
    });
  }
}

/** Вывеска «КРЕПОСТЬ»: светлые буквы по тёмному дереву, с двумя щитами по краям */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(0, 0, 1024, 128);
  for (let y = 10; y < 128; y += 22) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, y, 1024, 3);
  }
  ctx.strokeStyle = '#d8b46e';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 1012, 116);
  for (const sx of [70, 954]) {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(sx - 30, 30);
    ctx.lineTo(sx + 30, 30);
    ctx.lineTo(sx + 30, 70);
    ctx.quadraticCurveTo(sx, 104, sx - 30, 70);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(sx - 4, 38, 8, 46);
    ctx.fillRect(sx - 18, 52, 36, 8);
  }
  ctx.font = '900 84px Rubik, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#2b1a0e';
  ctx.strokeText('КРЕПОСТЬ', 512, 68);
  ctx.fillStyle = '#fff1cf';
  ctx.fillText('КРЕПОСТЬ', 512, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
