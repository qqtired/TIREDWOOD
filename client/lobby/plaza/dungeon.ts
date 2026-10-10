// Вход в «Подземелье» на западной лужайке (docs/survivors/level.md §8, режим за флагом DUNGEON): скала с пещерой, вывеска
// «ПОДЗЕМЕЛЬЕ» над зевом, пара моргающих глаз в глубине, два факела и доска рекордов («За всё время» / «За неделю», топ-5).
// Таблицу рекордов берёт у client/lobby/dgstatus.ts (её кладёт туда сцена набережной, когда пришёл статус от сервера).
// Модель — plaza_entrance.glb (docs/survivors/models/README-kits-b.md). Скачивается и строится при первом показе режима: пока
// сервер не прислал статус (флага нет), набережная такая же, как была, и файл не грузится. Неподвижное склеено по материалам
// (камень с вершинными цветами и свечение — по одному мешу), на холстах — вывеска и лицо доски. Всего 7 отрисовок: камень,
// свечение, глаза, вывеска, доска и два ореола факелов.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { DgRec, DgStatus } from '../../../shared/dungeon/api.ts';
import { DUNGEON_BOARD, DUNGEON_ROCK } from '../../../shared/plaza2.ts';
import { paint } from '../../render/kit.ts';
import { dgStatus, onDgStatus } from '../dgstatus.ts';
import { FONT, bigText, canvasTexture, fitFont, makeCanvas, roundRectPath, speckle } from './gfx.ts';
import { Venue, type VenueCtx } from './venue.ts';

const MODEL_URL = new URL('../../assets/dungeon/plaza/plaza_entrance.glb', import.meta.url).href;

// ------------------------------------------------------------ данные доски (чистые функции, их проверяют тесты)

/** Строк в каждой колонке доски */
export const BOARD_ROWS = 5;

/** Время забега мм:сс (минуты не обрезаются: 100:05 бывает) */
export function recTime(ms: number): string {
  const t = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export interface BoardRow {
  rank: number;
  nick: string;
  waves: string;
  time: string;
  /** Рекорд самого игрока — подсвечивается золотом */
  mine: boolean;
}

/** Первые BOARD_ROWS записей таблицы рекордов в виде строк доски; me — ник игрока (без учёта регистра) */
export function boardRows(list: readonly DgRec[], me = ''): BoardRow[] {
  const mine = me.trim().toLowerCase();
  return list.slice(0, BOARD_ROWS).map((r, i) => ({
    rank: i + 1,
    nick: r.nick,
    waves: String(Math.max(0, Math.floor(r.waves))),
    time: recTime(r.ms),
    mine: mine !== '' && r.nick.trim().toLowerCase() === mine,
  }));
}

// ------------------------------------------------------------ холсты

export const SIGN_SIZE = { w: 1216, h: 320 } as const;
export const BOARD_SIZE = { w: 1080, h: 780 } as const;

const INK = '#3a2315';
const WOOD = '#4a2f1d';
const GOLD = '#a9742f';
const JAM = '#7b3fc4';
const MUTED = '#8a7352';

function parchment(ctx: CanvasRenderingContext2D, W: number, H: number, seed: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f1e4c4');
  g.addColorStop(1, '#decaa0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, seed, 'rgba(255,255,255,0.2)', 'rgba(90,58,34,0.12)', 9);
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.72, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.72, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Вывеска над зевом: крупные тёмные буквы по светлой доске, фиолетовые ромбы по краям (намёк на варенье Барона) */
export function drawSign(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  parchment(ctx, W, H, 11);
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 16;
  ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 5;
  ctx.strokeRect(32, 32, W - 64, H - 64);
  diamond(ctx, 92, H / 2, 40, JAM, '#3b1d66');
  diamond(ctx, W - 92, H / 2, 40, JAM, '#3b1d66');
  bigText(ctx, 'ПОДЗЕМЕЛЬЕ', W / 2, H / 2 + 8, 196, W - 330, INK, '#f7efd6', 12, 900, 'rgba(123,63,196,0.5)');
}

const RANK_FILL = ['#e0a81e', '#a3adb8', '#c0763f'];

/** Колонка доски: заголовок, подписи столбцов и до BOARD_ROWS строк «место · ник · волны · время» */
function drawColumn(ctx: CanvasRenderingContext2D, x: number, w: number, title: string, rows: readonly BoardRow[]): void {
  const top = 276;
  const rowH = 92;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `900 46px ${FONT}`;
  ctx.fillStyle = JAM;
  ctx.fillText(title, x + w / 2, 206, w);
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.textAlign = 'right';
  ctx.fillText('ВОЛНЫ', x + 306, 252);
  ctx.fillText('ВРЕМЯ', x + w - 4, 252);
  if (rows.length === 0) {
    ctx.textAlign = 'center';
    ctx.font = `800 54px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText('Пока пусто', x + w / 2, top + rowH * 1.6);
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText('стань первым', x + w / 2, top + rowH * 2.5);
    return;
  }
  rows.forEach((r, i) => {
    const cy = top + rowH * i + rowH / 2;
    if (r.mine) {
      roundRectPath(ctx, x - 6, cy - rowH / 2 + 6, w + 12, rowH - 12, 18);
      ctx.fillStyle = 'rgba(240,180,30,0.5)';
      ctx.fill();
    } else if (i % 2 === 0) {
      roundRectPath(ctx, x - 6, cy - rowH / 2 + 6, w + 12, rowH - 12, 18);
      ctx.fillStyle = 'rgba(90,58,34,0.07)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x + 25, cy, 23, 0, Math.PI * 2);
    ctx.fillStyle = RANK_FILL[i] ?? MUTED;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = `900 30px ${FONT}`;
    ctx.fillStyle = '#fffaf0';
    ctx.fillText(String(r.rank), x + 25, cy + 2);
    ctx.textAlign = 'left';
    // длинный ник сначала уменьшается до 40 px, дальше сжимается по ширине: мелкие буквы с площади не прочесть
    ctx.font = `800 ${Math.max(40, fitFont(ctx, r.nick, 54, 178, 800))}px ${FONT}`;
    ctx.fillStyle = r.mine ? '#6a3d00' : INK;
    ctx.fillText(r.nick, x + 56, cy + 2, 178);
    ctx.textAlign = 'right';
    fitFont(ctx, r.waves, 62, 66, 900);
    ctx.fillStyle = r.mine ? '#6a3d00' : '#4d2a86';
    ctx.fillText(r.waves, x + 306, cy + 2);
    fitFont(ctx, r.time, 44, 126, 700);
    ctx.fillStyle = r.mine ? '#6a3d00' : INK;
    ctx.fillText(r.time, x + w - 4, cy + 2);
  });
}

/** Лицо доски рекордов: заголовок «Подземелье» и две колонки по пять строк */
export function drawBoard(ctx: CanvasRenderingContext2D, W: number, H: number, top: readonly BoardRow[], week: readonly BoardRow[]): void {
  parchment(ctx, W, H, 23);
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, W - 20, H - 20);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  roundRectPath(ctx, 48, 48, W - 96, 110, 20);
  ctx.fillStyle = '#3b2a1d';
  ctx.fill();
  diamond(ctx, 118, 103, 34, JAM, '#d9c4ff');
  diamond(ctx, W - 118, 103, 34, JAM, '#d9c4ff');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'Подземелье', 96, W - 380, 900);
  ctx.fillStyle = '#fff1cf';
  ctx.fillText('Подземелье', W / 2, 108);
  ctx.strokeStyle = 'rgba(90,58,34,0.35)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W / 2, 184);
  ctx.lineTo(W / 2, H - 52);
  ctx.stroke();
  drawColumn(ctx, 58, 458, 'ЗА ВСЁ ВРЕМЯ', top);
  drawColumn(ctx, 566, 458, 'ЗА НЕДЕЛЮ', week);
}

// ------------------------------------------------------------ вход

type Phase = 'idle' | 'loading' | 'ready' | 'failed';

/** Глаза в глубине зева моргают раз в 2–6 секунд (клип cave_eyes_blink из модели) */
const BLINK_MIN_S = 2.2;
const BLINK_SPAN_S = 3.6;
/** Глаза в модели — две щёлки по 0,1 м у самого пола: с набережной их не видно, поэтому увеличены и подняты (в пустоте зева) */
const EYES_SCALE = 3.5;
const EYES_LIFT = 0.55;

interface Painted {
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  w: number;
  h: number;
}

export class DungeonEntrance {
  readonly venue: Venue;
  private readonly refreshShadows: () => void;
  private readonly myNick: () => string;
  private phase: Phase = 'idle';
  private status: DgStatus | null = null;
  private me = '';
  private drawn = '';
  private board: Painted | null = null;
  private sign: Painted | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private blink: THREE.AnimationAction | null = null;
  private nextBlink = 0;

  /** myNick — ник игрока: его строки на доске золотом */
  constructor(ctx: VenueCtx, refreshShadows: () => void, myNick: () => string = () => '') {
    this.refreshShadows = refreshShadows;
    this.myNick = myNick;
    this.venue = new Venue('dungeon', ctx, 71);
    this.venue.group.visible = false;
    ctx.scene.add(this.venue.group);
    this.status = dgStatus();
    onDgStatus((st) => this.setStatus(st));
  }

  /** Таблица рекордов от сервера (null — режим выключен флагом) */
  setStatus(st: DgStatus | null): void {
    this.status = st;
    this.me = this.myNick();
    this.repaintBoard();
  }

  /** Кадр: время мира в секундах. Пока режим скрыт — ничего не грузится и не считается. */
  update(dt: number, time: number): void {
    if (!this.venue.group.visible) return;
    if (this.phase === 'idle') this.load();
    const me = this.myNick();
    if (me !== this.me) {
      this.me = me;
      this.repaintBoard();
    }
    if (this.phase !== 'ready' || !this.mixer || !this.blink) return;
    if (time >= this.nextBlink) {
      this.blink.reset().play();
      this.nextBlink = time + BLINK_MIN_S + Math.random() * BLINK_SPAN_S;
    }
    if (this.blink.isRunning()) this.mixer.update(dt);
  }

  private load(): void {
    this.phase = 'loading';
    const get = (): Promise<GLTF> => new GLTFLoader().loadAsync(MODEL_URL);
    // один повтор через полсекунды: связь может моргнуть; после второй ошибки вход остаётся без картинки
    get()
      .catch(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        return get();
      })
      .then((gltf) => {
        this.build(gltf);
        this.phase = 'ready';
      })
      .catch((e: unknown) => {
        this.phase = 'failed';
        console.warn('Подземелье: вход на площади не построился', e);
      });
  }

  private build(gltf: GLTF): void {
    const v = this.venue;
    const rock = gltf.scene.getObjectByName('plaza_cave_entrance');
    const board = gltf.scene.getObjectByName('plaza_records_board');
    const eyes = gltf.scene.getObjectByName('plaza_cave_entrance_eyes') as THREE.Mesh | undefined;
    const sign = gltf.scene.getObjectByName('plaza_cave_entrance_sign') as THREE.Mesh | undefined;
    const face = gltf.scene.getObjectByName('board_face') as THREE.Mesh | undefined;
    if (!rock || !board || !eyes || !sign || !face) throw new Error('в plaza_entrance.glb не хватает узлов входа');
    // в файле пропы разложены сеткой: сдвиг раскладки не нужен, корень каждого ставим в нужную точку площади
    rock.position.set(0, 0, 0);
    board.position.set(0, 0, 0);
    gltf.scene.updateMatrixWorld(true);

    // живые части (вывеска, глаза, лицо доски) уходят в свои группы с прежними локальными положениями, остальное запекается
    const rockLive = new THREE.Group();
    rockLive.position.set(DUNGEON_ROCK.x, 0, DUNGEON_ROCK.z);
    rockLive.rotation.y = DUNGEON_ROCK.yaw;
    const boardLive = new THREE.Group();
    boardLive.position.set(DUNGEON_BOARD.x, 0, DUNGEON_BOARD.z);
    boardLive.rotation.y = DUNGEON_BOARD.yaw;
    const eyesPivot = new THREE.Group();
    eyesPivot.position.copy(eyes.position);
    eyesPivot.position.y += EYES_LIFT;
    eyesPivot.scale.setScalar(EYES_SCALE);
    eyes.position.set(0, 0, 0);
    eyesPivot.add(eyes);
    rockLive.add(eyesPivot, sign);
    boardLive.add(face);

    for (const [prop, at] of [[rock, DUNGEON_ROCK], [board, DUNGEON_BOARD]] as const) {
      prop.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.MeshStandardMaterial;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const glowing = mat.emissiveIntensity > 0 && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.01;
        if (glowing) v.glow.add(g, mat.emissive.getHex(), at.x, 0, at.z, at.yaw);
        else v.detail.add(g, mat.color.getHex(), at.x, 0, at.z, at.yaw);
      });
    }

    // глаза не гаснут вместе со светом в сети: они не лампы
    const eyeMat = eyes.material as THREE.MeshStandardMaterial;
    eyes.geometry = paint(eyes.geometry, eyeMat.emissive);
    eyes.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const clip = gltf.animations.find((a) => a.name === 'cave_eyes_blink');
    if (clip) {
      this.mixer = new THREE.AnimationMixer(rockLive);
      this.blink = this.mixer.clipAction(clip);
      this.blink.setLoop(THREE.LoopOnce, 1);
      this.blink.clampWhenFinished = true;
    }

    this.sign = this.canvas(sign, SIGN_SIZE.w, SIGN_SIZE.h, 0.45);
    this.board = this.canvas(face, BOARD_SIZE.w, BOARD_SIZE.h, 0.4);
    v.group.add(rockLive, boardLive);

    // ореол факелов у зева (светлое пятно, без настоящих ламп)
    const c = Math.cos(DUNGEON_ROCK.yaw);
    const s = Math.sin(DUNGEON_ROCK.yaw);
    for (const lx of [-2.1, 2.1]) {
      const lz = 3.15;
      v.lampGlow(0xffa23a, 2.4, DUNGEON_ROCK.x + lx * c + lz * s, 2.31, DUNGEON_ROCK.z - lx * s + lz * c, 0.42);
    }

    v.finish(v.group.visible);
    this.paintSign();
    this.repaintBoard();
    // шрифт Rubik мог ещё не подгрузиться, когда рисовали: перерисовать, когда будет готов
    if (typeof document !== 'undefined' && document.fonts) {
      void Promise.all([document.fonts.load('900 48px Rubik'), document.fonts.load('700 40px Rubik')]).then(() => {
        this.paintSign();
        this.drawn = '';
        this.repaintBoard();
      });
    }
    // скала и доска появились уже после того, как включили режим: тени статики пересчитать ещё раз
    this.refreshShadows();
  }

  /** Холст на плоскость из модели (развёртка glTF: v считается сверху, поэтому flipY выключен). */
  private canvas(mesh: THREE.Mesh, w: number, h: number, glow: number): Painted {
    const [c, ctx] = makeCanvas(w, h);
    const tex = canvasTexture(c);
    tex.flipY = false;
    mesh.material = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.85,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    return { ctx, tex, w: c.width, h: c.height };
  }

  private paintSign(): void {
    const p = this.sign;
    if (!p) return;
    drawSign(p.ctx, p.w, p.h);
    p.tex.needsUpdate = true;
  }

  private repaintBoard(): void {
    const p = this.board;
    const st = this.status;
    if (!p || !st) return;
    const top = boardRows(st.top, this.me);
    const week = boardRows(st.week, this.me);
    const key = JSON.stringify([top, week]);
    if (key === this.drawn) return;
    this.drawn = key;
    drawBoard(p.ctx, p.w, p.h, top, week);
    p.tex.needsUpdate = true;
  }
}
