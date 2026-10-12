// Экран «Топ проигравших» в павильоне автоматов — на западной стене изнутри, лицом к площади: кто больше всех
// проиграл жетонов в автоматах. Считает сервер: ставки минус выигрыши, со дня LOSERS_SINCE (раньше ставки не
// записывались). Светодиодное табло в тёмной раме, как табло джекпота рядом: заголовок, «считаем с …», пять строк —
// место (первые три — медали), ник, сколько проиграл и золотая монетка (рисуем сами: эмодзи монеты есть не везде).
// Своя строка подсвечена. Холст перерисовывается, только когда меняется топ.
import * as THREE from 'three';
import { LOSERS_ROWS, type LoserRow } from '../../shared/messages.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { glowCardTexture } from '../render/textures.ts';

/** С какого дня считаем проигрыши (в этот день начали записывать ставки) — подпись на экране */
export const LOSERS_SINCE = '2 октября';

/** Экран, м: ширина и высота; середина — на внутренней стороне западной стены павильона (x −27,4) */
const SCREEN_W = 6;
const SCREEN_H = 2.3;
const AT = { x: -27.4, y: 2.95, z: -20.8 };
const FRAME = 0.12;
/** Холст */
const W = 1024;
const H = Math.round((W * SCREEN_H) / SCREEN_W);
const FONT = 'Rubik, system-ui, sans-serif';
/** Поля, середина шапки, черта под ней (пиксели холста) */
const PAD = 38;
const HEAD_Y = 50;
const LINE_Y = 90;
const MEDALS = ['#f5c542', '#d3d8e2', '#d98c4f'];

export class LosersScreen {
  readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private key: string | null = null;

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // рама — тёмный короб с золотыми планками сверху и снизу; экран светится сам; на кирпиче — тёплый отсвет
    const fw = SCREEN_W + FRAME * 2;
    const fh = SCREEN_H + FRAME * 2;
    const frame = new THREE.Mesh(
      mergeColored([
        place(paint(new THREE.BoxGeometry(fw, fh, 0.08), 0x3a2418), 0, 0, 0.04),
        place(paint(new THREE.BoxGeometry(fw + 0.06, 0.05, 0.1), 0xc99a3e), 0, fh / 2 + 0.01, 0.05),
        place(paint(new THREE.BoxGeometry(fw + 0.06, 0.05, 0.1), 0xc99a3e), 0, -fh / 2 - 0.01, 0.05),
      ]),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 }),
    );
    const face = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    face.position.z = 0.085;
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(fw + 0.8, fh + 0.8),
      new THREE.MeshBasicMaterial({
        map: glowCardTexture(fw, fh, 0.4), color: 0xffb46a, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending,
        fog: false, toneMapped: false,
      }),
    );
    halo.position.z = 0.015;
    this.group.add(halo, frame, face);
    this.group.position.set(AT.x, AT.y, AT.z);
    // лицом на восток, в зал
    this.group.rotation.y = Math.PI / 2;
    scene.add(this.group);
    this.draw([], 0);
  }

  /** Топ с сервера; myPid — свой профиль (его строка подсвечена). */
  set(rows: readonly LoserRow[], myPid: number): void {
    const list = rows.slice(0, LOSERS_ROWS);
    const key = JSON.stringify([list, myPid]);
    if (key === this.key) return;
    this.key = key;
    this.draw(list, myPid);
  }

  private draw(rows: readonly LoserRow[], myPid: number): void {
    const c = this.ctx;
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#24110c');
    bg.addColorStop(1, '#0e0605');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.textBaseline = 'middle';

    // шапка: монетка, заголовок — слева, с какого дня считаем — справа; светятся, как лампы
    coin(c, PAD + 20, HEAD_Y, 20);
    c.shadowColor = 'rgba(255, 176, 64, 0.75)';
    c.shadowBlur = 14;
    c.textAlign = 'left';
    c.fillStyle = '#ffcf5a';
    fit(c, 'ТОП ПРОИГРАВШИХ', 900, 58, W * 0.56);
    c.fillText('ТОП ПРОИГРАВШИХ', PAD + 56, HEAD_Y + 2);
    c.shadowBlur = 0;
    c.textAlign = 'right';
    c.fillStyle = '#d9a35a';
    const since = `считаем с ${LOSERS_SINCE}`;
    fit(c, since, 700, 30, W * 0.3);
    c.fillText(since, W - PAD, HEAD_Y + 6);
    c.fillStyle = 'rgba(255, 207, 90, 0.5)';
    c.fillRect(PAD, LINE_Y, W - PAD * 2, 3);

    const top = LINE_Y + 8;
    const rowH = (H - top - 10) / LOSERS_ROWS;
    if (rows.length === 0) {
      const y = top + (H - top) / 2 - 6;
      const text = 'Пока никто не проиграл — всё впереди';
      c.textAlign = 'center';
      c.fillStyle = '#efe2c4';
      fit(c, text, 700, 44, W - PAD * 2 - 140);
      const tw = c.measureText(text).width;
      c.fillText(text, W / 2, y);
      coin(c, W / 2 - tw / 2 - 40, y, 18);
      coin(c, W / 2 + tw / 2 + 40, y, 18);
      ledGrid(c);
      this.tex.needsUpdate = true;
      return;
    }

    const size = Math.round(rowH * 0.6);
    const coinR = Math.round(rowH * 0.28);
    const coinX = W - PAD - coinR;
    const nickX = PAD + 74;
    for (let i = 0; i < LOSERS_ROWS; i++) {
      const y = top + rowH * (i + 0.5);
      const r = rows[i];
      const mine = !!r && myPid > 0 && r.pid === myPid;
      if (mine) {
        c.fillStyle = 'rgba(255, 207, 90, 0.17)';
        c.fillRect(PAD - 10, y - rowH / 2 + 3, W - PAD * 2 + 20, rowH - 6);
      } else if (i % 2 === 0) {
        c.fillStyle = 'rgba(255, 255, 255, 0.045)';
        c.fillRect(PAD - 10, y - rowH / 2 + 3, W - PAD * 2 + 20, rowH - 6);
      }
      badge(c, PAD + 26, y, i, !!r, rowH);
      if (!r) {
        c.textAlign = 'left';
        c.fillStyle = 'rgba(239, 226, 196, 0.22)';
        c.font = `700 ${size}px ${FONT}`;
        c.fillText('—', nickX, y);
        continue;
      }
      // сколько проиграл — справа, с монеткой
      coin(c, coinX, y, coinR);
      c.textAlign = 'right';
      c.fillStyle = '#ff9370';
      c.font = `900 ${size}px ${FONT}`;
      const amount = Math.round(r.n).toLocaleString('ru-RU');
      const amountX = coinX - coinR - 12;
      c.fillText(amount, amountX, y + 1);
      const aw = c.measureText(amount).width;
      // ник — сколько влезет; у первого, если есть место, — шутливая плашка
      const room = amountX - aw - 36 - nickX;
      c.textAlign = 'left';
      c.fillStyle = mine ? '#ffd27a' : '#f4ead6';
      fit(c, r.nick, mine ? 900 : 700, size, room);
      c.fillText(r.nick, nickX, y + 1);
      if (i === 0) sponsorTag(c, nickX + c.measureText(r.nick).width + 18, y, Math.round(size * 0.54), nickX + room);
    }
    ledGrid(c);
    this.tex.needsUpdate = true;
  }
}

/** Место: первые три — медали с номером, дальше — просто номер; пустое место — тусклое. */
function badge(c: CanvasRenderingContext2D, x: number, y: number, i: number, on: boolean, rowH: number): void {
  const r = rowH * 0.34;
  c.textAlign = 'center';
  c.font = `900 ${Math.round(rowH * 0.46)}px ${FONT}`;
  if (on && i < MEDALS.length) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = MEDALS[i];
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.stroke();
    c.fillStyle = '#2a1708';
  } else {
    c.fillStyle = on ? '#bba88a' : 'rgba(187, 168, 138, 0.35)';
  }
  c.fillText(String(i + 1), x, y + 1);
}

/** Плашка «спонсор казино» у первого места: от x, если влезает до maxX (длинный ник — без неё). */
function sponsorTag(c: CanvasRenderingContext2D, x: number, y: number, size: number, maxX: number): void {
  const text = 'спонсор казино';
  c.font = `700 ${size}px ${FONT}`;
  const pad = size * 0.55;
  const w = c.measureText(text).width + pad * 2;
  if (x + w > maxX) return;
  // капсула из двух полукругов (roundRect есть не во всех браузерах)
  const r = size * 0.75;
  c.beginPath();
  c.arc(x + r, y, r, Math.PI / 2, Math.PI * 1.5);
  c.arc(x + w - r, y, r, -Math.PI / 2, Math.PI / 2);
  c.closePath();
  c.fillStyle = 'rgba(255, 207, 90, 0.18)';
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(255, 207, 90, 0.55)';
  c.stroke();
  c.textAlign = 'left';
  c.fillStyle = '#ffcf5a';
  c.fillText(text, x + pad, y + 1);
}

/** Золотая монетка: ободок, внутреннее кольцо, блик. */
function coin(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff4b8');
  g.addColorStop(0.5, '#f4c443');
  g.addColorStop(1, '#b07a18');
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = Math.max(2, r * 0.14);
  c.strokeStyle = '#8a5a12';
  c.stroke();
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, Math.PI * 2);
  c.lineWidth = Math.max(1.5, r * 0.1);
  c.strokeStyle = 'rgba(138, 90, 18, 0.75)';
  c.stroke();
}

/** Шрифт размера size, уменьшенный, чтобы текст влез в maxW. */
function fit(c: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.max(10, Math.floor((size * maxW) / w))}px ${FONT}`;
}

/** Тёмные линии между «светодиодами» — табло, а не монитор (как у остальных табло набережной). */
function ledGrid(c: CanvasRenderingContext2D): void {
  c.fillStyle = 'rgba(0, 0, 0, 0.35)';
  for (let x = 0; x < W; x += 4) c.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
}
