// Над катером во время посадки — табличка-зазывала: «Садись!», большой отсчёт до отплытия, свободные места и капитан.
// Висит над тентом, покачивается и «дышит», стрелка под ней подпрыгивает над катером; последние 5 с число желтеет
// и подскакивает, а ореол вспыхивает на каждой секунде. Всегда смотрит в камеру; издалека крупнее — читается с площади.
// Холсты перерисовываются, только когда меняется текст (число — раз в секунду), анимация — трансформациями.
import * as THREE from 'three';
import { BOAT_SEATS, BP_BOARD, LAUNCH } from '../../shared/boat.ts';
import { TICK_RATE } from '../../shared/constants.ts';
import type { BoatStatus } from '../../shared/messages.ts';
import { glowCardTexture } from '../render/textures.ts';

const FONT = 'Rubik, system-ui, sans-serif';
/** Холст доски; вблизи она шириной BOARD_W (м), число и стрелка — в том же масштабе (PX метров на пиксель) */
const W = 768;
const H = 512;
const BOARD_W = 2.5;
const PX = BOARD_W / W;
/** Число отсчёта — свой холст поверх доски (подскакивает отдельно), середина — на этой высоте холста доски */
const NUM_W = 400;
const NUM_H = 200;
const NUM_AT = 246;
/** Стрелка вниз: холст; её острие — начало координат таблички */
const ARROW_W = 128;
const ARROW_H = 160;
/** Низ доски над острием стрелки, м (вблизи) */
const BOARD_Y = 1.0;
/** Острие стрелки — над тентом (он до y ≈ 0,73) над серединой катера: она на 0,2 м к носу (на восток) от LAUNCH */
const TIP_Y = 1.2;
const MID_X = 0.2;
/** Ближе NEAR_M табличка своего размера, дальше растёт почти как расстояние (на экране мельчает совсем чуть-чуть) */
const NEAR_M = 5.5;
const FAR_POW = 0.9;
/**
 * Дальше DRAW_M от камеры табличку рисуем на DRAW_M (во столько же раз меньше): на экране то же самое, но гирлянды,
 * фонари и тент между камерой и катером её не заслоняют — заслоняет только то, что у самой камеры: своя желейка
 * (камера отъезжает от неё до 6 м) — она всегда ближе.
 */
const DRAW_M = 6.6;
/** Появляется и исчезает за FADE_S с; последние HOT_S секунд — «торопись» */
const FADE_S = 0.3;
const HOT_S = 5;
const NAVY = '#1f4a72';
const INK = '#0f2a44';
const WHITE = '#f4f2ec';
const RED = '#e8473a';
const YELLOW = '#ffd35c';
const _white = new THREE.Color(0xffffff);
const _yellow = new THREE.Color(YELLOW);

export class BoatBanner {
  private readonly group = new THREE.Group();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly numCtx: CanvasRenderingContext2D;
  private readonly numTex: THREE.CanvasTexture;
  private readonly boardMat: THREE.MeshBasicMaterial;
  private readonly numMat: THREE.MeshBasicMaterial;
  private readonly arrowMat: THREE.MeshBasicMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly num: THREE.Mesh;
  private readonly arrow: THREE.Mesh;
  private boardKey = '';
  /** Секунд до отплытия на табличке и когда число сменилось (для «подскока») */
  private secs = -1;
  private numAt = -9;
  /** Видна (0…1, плавно) и «торопись» (0…1, плавно) */
  private vis = 0;
  private hot = 0;
  /** Фаза подскоков стрелки (частота меняется — копим, а не берём от времени) */
  private bounce = 0;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const [canvas, ctx] = makeCanvas(W, H);
    this.ctx = ctx;
    this.tex = texture(canvas);
    const [numCanvas, numCtx] = makeCanvas(NUM_W, NUM_H);
    this.numCtx = numCtx;
    this.numTex = texture(numCanvas);
    const [arrowCanvas, arrowCtx] = makeCanvas(ARROW_W, ARROW_H);
    drawArrow(arrowCtx);

    const bh = H * PX;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, bh), (this.boardMat = material(this.tex)));
    board.position.y = BOARD_Y + bh / 2;
    board.renderOrder = 3;
    // ореол вокруг доски: всегда слегка, в последние секунды вспыхивает
    const margin = 0.4;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W + margin * 2, bh + margin * 2), (this.glowMat = material(glowCardTexture(BOARD_W, bh, margin, 0.14))));
    this.glowMat.color.set(YELLOW);
    glow.position.y = board.position.y;
    glow.renderOrder = 2;
    this.num = new THREE.Mesh(new THREE.PlaneGeometry(NUM_W * PX, NUM_H * PX), (this.numMat = material(this.numTex)));
    this.num.position.y = BOARD_Y + (H - NUM_AT) * PX;
    this.num.renderOrder = 4;
    // стрелка: острие — в начале координат (геометрия сдвинута вверх на половину высоты)
    this.arrow = new THREE.Mesh(new THREE.PlaneGeometry(ARROW_W * PX, ARROW_H * PX).translate(0, (ARROW_H * PX) / 2, 0), (this.arrowMat = material(texture(arrowCanvas))));
    this.arrow.renderOrder = 3;
    this.group.add(glow, board, this.num, this.arrow);
    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * st — статус катера с сервера, tick — часы сервера (renderTick, 60 тиков в секунду), t — время сцены (с),
   * offset — качка катера у причала (Boats.launchOffset), camPos — где камера.
   */
  update(st: BoatStatus, tick: number, t: number, offset: THREE.Vector3, camPos: THREE.Vector3): void {
    const dt = THREE.MathUtils.clamp(t - this.t, 0, 0.1);
    this.t = t;
    // часы сервера ещё не идут (меню, нет первого снимка) — сколько до отплытия, не знаем: не показываем
    const on = st.ph === BP_BOARD && tick > 0;
    this.vis = THREE.MathUtils.clamp(this.vis + (on ? dt : -dt) / FADE_S, 0, 1);
    this.group.visible = this.vis > 0;
    if (!this.group.visible) {
      this.hot = 0;
      return;
    }
    // исчезает — с последним текстом
    if (on) this.text(st, tick, t);
    this.hot = THREE.MathUtils.clamp(this.hot + (this.secs <= HOT_S ? dt : -dt) / FADE_S, 0, 1);

    const ax = LAUNCH.x + MID_X + offset.x;
    const ay = TIP_Y + offset.y;
    const az = LAUNCH.z + offset.z;
    // издалека крупнее: до NEAR_M — свой размер, дальше растёт (расстояние — до середины доски)
    const dist = Math.hypot(camPos.x - ax, camPos.y - ay - BOARD_Y - 0.8, camPos.z - az);
    const far = Math.max(1, dist / NEAR_M) ** FAR_POW;
    // появляется с отскоком, исчезает плавно
    const v = this.vis;
    const fade = v * v * (3 - 2 * v);
    const pop = on ? backOut(v) : fade;
    const g = this.group;
    // качается только вверх от острия — стрелка не утыкается в тент; «дышит» масштабом
    g.position.set(ax, ay + far * 0.12 * (0.5 + 0.5 * Math.sin(t * 1.7)), az);
    g.scale.setScalar(far * pop * (1 + 0.025 * Math.sin(t * 2.6 + 0.5) + 0.05 * this.hot));
    // издалека — ближе к камере и меньше во столько же раз (см. DRAW_M)
    const near = Math.min(1, DRAW_M / dist);
    g.position.sub(camPos).multiplyScalar(near).add(camPos);
    g.scale.multiplyScalar(near);
    g.lookAt(camPos);
    // стрелка подпрыгивает над катером: касается острием и отскакивает (торопимся — чаще)
    this.bounce = (this.bounce + dt * (3.2 + 2.2 * this.hot)) % Math.PI;
    this.arrow.position.y = 0.16 * Math.sin(this.bounce);
    // число подскакивает на каждой секунде; последние секунды — сильнее, желтеет и вспыхивает белым
    const since = t - this.numAt;
    const flash = Math.exp(-since * 5);
    this.num.scale.setScalar(1 + (0.08 + 0.27 * this.hot) * Math.exp(-since * 7));
    this.numMat.color.copy(_white).lerp(_yellow, this.hot * (1 - flash));
    this.glowMat.opacity = fade * (0.22 + 0.06 * Math.sin(t * 2.4) + this.hot * (0.2 + 0.55 * flash));
    this.boardMat.opacity = this.numMat.opacity = this.arrowMat.opacity = fade;
  }

  /** Текст по статусу: доска — когда сменились места или капитан, число — раз в секунду. */
  private text(st: BoatStatus, tick: number, t: number): void {
    const secs = Math.max(0, Math.ceil((st.at - tick) / TICK_RATE));
    const free = BOAT_SEATS - st.n;
    const key = free > 0 ? `${free}|${st.nick}` : `0|${st.nick}|${secs}`;
    if (key !== this.boardKey) {
      this.boardKey = key;
      if (free > 0) this.drawBoard('САДИСЬ!', `свободно мест: ${free} из ${BOAT_SEATS}`, 'у причала', st.nick, true);
      else this.drawBoard('ОТПЛЫВАЕМ!', 'Мест нет', `отплытие через ${secs} с`, st.nick, false);
    }
    if (secs !== this.secs) {
      this.secs = secs;
      this.numAt = t;
      this.drawNumber(String(secs));
    }
  }

  /**
   * Доска: красная шапка, под ней место для числа между двумя спасательными кругами, строка мест крупно,
   * под ней подсказка (keyE — с клавишей E впереди) и капитан.
   */
  private drawBoard(head: string, line: string, hint: string, captain: string, keyE: boolean): void {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // тёмно-синяя доска с тёмным кантом (на светлом небе) и белой рамкой внутри
    c.beginPath();
    c.roundRect(6, 6, W - 12, H - 12, 46);
    c.fillStyle = NAVY;
    c.fill();
    c.lineWidth = 7;
    c.strokeStyle = INK;
    c.stroke();
    c.beginPath();
    c.roundRect(22, 22, W - 44, H - 44, 32);
    c.lineWidth = 9;
    c.strokeStyle = WHITE;
    c.stroke();
    c.beginPath();
    c.roundRect(42, 42, W - 84, 112, 22);
    c.fillStyle = RED;
    c.fill();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    headline(c, head, W / 2, 101, W - 130, 92);
    // спасательные круги по бокам от числа
    for (const x of [120, W - 120]) lifeRing(c, x, NUM_AT, 46);
    c.fillStyle = '#ffffff';
    fit(c, line, W / 2, 372, W - 100, 900, 56);
    c.fillStyle = '#d6e6f5';
    if (keyE) keyHint(c, 'E', hint, W / 2, 424, 36);
    else fit(c, hint, W / 2, 424, W - 100, 700, 36);
    if (captain) {
      c.fillStyle = YELLOW;
      fit(c, `Капитан: ${captain}`, W / 2, 468, W - 120, 700, 30);
    }
    this.tex.needsUpdate = true;
  }

  /** Число секунд и маленькое «с» после него: белые с тёмным кантом (цвет даёт материал). */
  private drawNumber(text: string): void {
    const c = this.numCtx;
    c.clearRect(0, 0, NUM_W, NUM_H);
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    const big = 186;
    const small = 64;
    c.font = `900 ${big}px ${FONT}`;
    const wn = c.measureText(text).width;
    c.font = `900 ${small}px ${FONT}`;
    const ws = c.measureText('с').width;
    const gap = 12;
    const x = (NUM_W - wn - gap - ws) / 2;
    // цифры высотой ~0,7 кегля — по середине холста
    const base = NUM_H / 2 + big * 0.35;
    const draw = (s: string, px: number, size: number): void => {
      c.font = `900 ${size}px ${FONT}`;
      c.lineWidth = size * 0.1;
      c.strokeStyle = INK;
      c.strokeText(s, px, base);
      c.fillStyle = '#ffffff';
      c.fillText(s, px, base);
    };
    draw(text, x, big);
    draw('с', x + wn + gap, small);
    this.numTex.needsUpdate = true;
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Табличка — как вывеска-подсказка: свой цвет без тонмаппинга и тумана, глубину не пишет. */
function material(map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false });
}

/** Появление с отскоком: к 1 с перелётом ~10 %. */
function backOut(x: number): number {
  const k = 1.70158;
  return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2;
}

/** Строка в (x, y) не шире maxW: не влезает — шрифт мельче. */
function fit(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, weight: number, size: number): void {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.fillText(text, x, y);
}

/** Шапка: белый парусник и надпись — вместе по центру x, не шире maxW (не влезает — мельче). */
function headline(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number): void {
  c.font = `900 ${size}px ${FONT}`;
  const tw = c.measureText(text).width;
  const k = Math.min(1, maxW / (tw + size * 1.05));
  const s = size * k;
  c.font = `900 ${Math.floor(s)}px ${FONT}`;
  const x0 = x - (tw * k + s * 1.05) / 2;
  sailboat(c, x0 + s * 0.4, y - s * 0.02, s * 0.86);
  c.textAlign = 'left';
  c.fillText(text, x0 + s * 1.05, y);
  c.textAlign = 'center';
}

/** Парусник (цвет — текущая заливка): грот и стаксель по сторонам мачты, корпус; высота s, середина — (x, y). */
function sailboat(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const p = (pts: ReadonlyArray<readonly [number, number]>): void => {
    c.beginPath();
    c.moveTo(x + pts[0][0] * s, y + pts[0][1] * s);
    for (let i = 1; i < pts.length; i++) c.lineTo(x + pts[i][0] * s, y + pts[i][1] * s);
    c.closePath();
    c.fill();
  };
  p([[0.03, -0.5], [0.03, 0.17], [0.44, 0.17]]);
  p([[-0.04, -0.38], [-0.04, 0.17], [-0.36, 0.17]]);
  p([[-0.5, 0.25], [0.5, 0.25], [0.34, 0.47], [-0.36, 0.47]]);
}

/** «[E] у причала»: клавиша — белая плашка с буквой, за ней подсказка; всё вместе по центру x. */
function keyHint(c: CanvasRenderingContext2D, k: string, text: string, x: number, y: number, size: number): void {
  c.font = `700 ${size}px ${FONT}`;
  const tw = c.measureText(text).width;
  const kw = size * 1.15;
  const gap = size * 0.35;
  const x0 = x - (kw + gap + tw) / 2;
  const fill = c.fillStyle;
  c.beginPath();
  c.roundRect(x0, y - kw / 2, kw, kw, size * 0.22);
  c.fillStyle = WHITE;
  c.fill();
  c.fillStyle = NAVY;
  c.font = `900 ${size * 0.8}px ${FONT}`;
  c.textAlign = 'center';
  c.fillText(k, x0 + kw / 2, y + size * 0.04);
  c.fillStyle = fill;
  c.font = `700 ${size}px ${FONT}`;
  c.textAlign = 'left';
  c.fillText(text, x0 + kw + gap, y);
  c.textAlign = 'center';
}

/** Спасательный круг: красный с белыми вставками (как на табличке у причала). */
function lifeRing(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.lineWidth = r * 0.46;
  c.strokeStyle = RED;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = WHITE;
  c.setLineDash([(Math.PI * r) / 6, (Math.PI * r) / 3]);
  c.lineDashOffset = (Math.PI * r) / 12;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);
  c.lineDashOffset = 0;
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(15,42,68,0.55)';
  for (const rr of [r * 0.77, r * 1.23]) {
    c.beginPath();
    c.arc(x, y, rr, 0, Math.PI * 2);
    c.stroke();
  }
}

/** Стрелка вниз: жёлтая с тёмным кантом, острие — у нижнего края холста. */
function drawArrow(c: CanvasRenderingContext2D): void {
  const w = ARROW_W;
  c.beginPath();
  c.moveTo(w / 2, ARROW_H - 8);
  c.lineTo(w - 10, ARROW_H - 70);
  c.lineTo(w / 2 + 22, ARROW_H - 70);
  c.lineTo(w / 2 + 22, 10);
  c.lineTo(w / 2 - 22, 10);
  c.lineTo(w / 2 - 22, ARROW_H - 70);
  c.lineTo(10, ARROW_H - 70);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 12;
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = YELLOW;
  c.fill();
}
