// Табло набережной — холсты на плоскостях: экран над воротами склада, табло картинга, доска почёта (с обратной
// стороны — «Последние входы»), табло джекпота.
// Холст перерисовывается, только когда меняется то, что на нём видно.
import * as THREE from 'three';
import { PHASE_END, PHASE_PLAY } from '../../shared/constants.ts';
import { buildRaceCourse, DEFAULT_TRACK, raceTrackName, type RaceTrackId } from '../../shared/racecourse.ts';
import { KPOS_STRIDE, RECENT_ROWS, type HonorInfo, type HonorRow, type KartStatus, type PbStatus, type RecentRow } from '../../shared/messages.ts';
import { BOTS_RULE, botsAllowed, botsWord } from '../../shared/solobots.ts';
import { KART_COLORS } from '../race/kart3d.ts';

const FONT = 'Rubik, system-ui, sans-serif';
const BLUE = '#7088ff';
const ORANGE = '#ffa24a';

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

function surface(w: number, h: number): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex };
}

/** Шрифт размера size, уменьшенный, чтобы текст влез в maxW. */
function fit(ctx: CanvasRenderingContext2D, text: string, size: number, maxW: number, weight = 900): void {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
}

/** Тёмные линии между «светодиодами» — экран читается как табло, а не как монитор. */
function ledGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step = 4): void {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  for (let x = 0; x < w; x += step) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function num(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

// ------------------------------------------------------------ экран над воротами склада

/** Что сейчас в пейнтболе: бой или разминка, счёт, кто играет. Секунды тикают сами между сообщениями сервера. */
export class GateScreen {
  readonly mesh: THREE.Mesh;
  private readonly s: Surface;
  private pb: PbStatus = { phase: 0, left: 0, scores: [0, 0], humans: 0, names: [] };
  /** Время мира, когда пришёл pb */
  private at = 0;
  private now = 0;
  private shown = '';

  constructor(width: number, height: number) {
    this.s = surface(1024, Math.round((1024 * height) / width));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.s.tex, toneMapped: false }));
    this.draw();
  }

  update(pb: PbStatus): void {
    this.pb = { phase: pb.phase, left: pb.left, scores: [pb.scores[0], pb.scores[1]], humans: pb.humans, names: pb.names.slice() };
    this.at = this.now;
    this.draw();
  }

  /** Каждый кадр (время мира в секундах). */
  tick(time: number): void {
    this.now = time;
    if (this.key() !== this.shown) this.draw();
  }

  private left(): number {
    return Math.max(0, this.pb.left - Math.floor(this.now - this.at));
  }

  private key(): string {
    const p = this.pb;
    return `${p.humans}|${p.phase}|${this.left()}|${p.scores[0]}:${p.scores[1]}|${p.names.join(',')}|${Math.floor(this.now * 1.25) % 2}`;
  }

  private draw(): void {
    this.shown = this.key();
    const { ctx, canvas, tex } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    const p = this.pb;
    const blink = Math.floor(this.now * 1.25) % 2 === 0;
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // строка 1: что происходит
    let status: string;
    if (p.humans === 0) status = 'ПУСТО — ЗАХОДИ ПЕРВЫМ!';
    else if (p.phase === PHASE_PLAY) status = `ИДЁТ БОЙ · ${mmss(this.left())}`;
    else if (p.phase === PHASE_END) status = `РАУНД ОКОНЧЕН · ${mmss(this.left())}`;
    else status = `РАЗМИНКА · ${mmss(this.left())}`;
    ctx.fillStyle = '#ffb648';
    fit(ctx, status, 80, W - 70);
    ctx.fillText(status, W / 2, H * 0.2);

    // строка 2: счёт или приглашение
    const y2 = H * 0.5;
    if (p.humans > 0) {
      const score = `${p.scores[0]} : ${p.scores[1]}`;
      ctx.font = `900 78px ${FONT}`;
      const sw = ctx.measureText(score).width;
      ctx.fillStyle = '#fff4e0';
      ctx.fillText(score, W / 2, y2);
      ctx.textAlign = 'right';
      ctx.fillStyle = BLUE;
      fit(ctx, 'ЧЕРНИКА', 64, W / 2 - sw / 2 - 60);
      ctx.fillText('ЧЕРНИКА', W / 2 - sw / 2 - 30, y2);
      ctx.textAlign = 'left';
      ctx.fillStyle = ORANGE;
      fit(ctx, 'МАНДАРИН', 64, W / 2 - sw / 2 - 60);
      ctx.fillText('МАНДАРИН', W / 2 + sw / 2 + 30, y2);
    } else {
      ctx.fillStyle = '#d9a35a';
      // пустая площадка: ботов на ней нет, они приходят к тому, кто зашёл один
      const idle = 'пейнтбол желейками — боты, только пока ты один';
      fit(ctx, idle, 52, W - 90, 700);
      ctx.fillText(idle, W / 2, y2);
    }

    // строка 3: кто играет и мигающее «заходи»
    const y3 = H * 0.8;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e9dcc0';
    const who = p.humans > 0
      ? `играют: ${p.names.join(', ')}${p.humans > p.names.length ? '…' : ''}${botsAllowed(p.humans) ? ' + боты' : ''}`
      : 'E у ворот — и ты в игре';
    fit(ctx, who, 42, W - 330, 700);
    ctx.fillText(who, 40, y3);
    if (blink) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd27a';
      ctx.font = `900 50px ${FONT}`;
      ctx.fillText('ЗАХОДИ ▸', W - 40, y3);
    }
    ledGrid(ctx, W, H);
    tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------ табло картинга

/** Шашечки финишного флага полосой: rows рядов клеток size от x0 до x1. */
function checker(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, size: number, rows: number): void {
  for (let r = 0; r < rows; r++) {
    for (let x = x0, k = 0; x < x1; x += size, k++) {
      ctx.fillStyle = (r + k) % 2 ? '#f2ede2' : '#141414';
      ctx.fillRect(x, y + r * size, Math.min(size, x1 - x), size);
    }
  }
}

/** Отрезок трассы → точка на холсте табло (схема «Портового кольца» слева) */
interface RingLayout {
  n: number;
  cx: Float32Array;
  cy: Float32Array;
  /** Ширина дороги на схеме в каждой точке, пикселей холста */
  road: Float32Array;
}

/** Схема трассы вписана в прямоугольник (x0, y0)–(x1, y1) холста; север трассы — вверху, как на мини-карте гонки. */
function ringLayout(x0: number, y0: number, x1: number, y1: number, id: RaceTrackId = DEFAULT_TRACK): RingLayout {
  const tr = buildRaceCourse(id).track;
  let a = Infinity;
  let b = -Infinity;
  let c = Infinity;
  let d = -Infinity;
  for (let i = 0; i < tr.n; i++) {
    a = Math.min(a, tr.px[i]);
    b = Math.max(b, tr.px[i]);
    c = Math.min(c, tr.pz[i]);
    d = Math.max(d, tr.pz[i]);
  }
  const pad = tr.half;
  const k = Math.min((x1 - x0) / (b - a + 2 * pad), (y1 - y0) / (d - c + 2 * pad));
  const ox = (x0 + x1) / 2 - ((a + b) / 2) * k;
  const oy = (y0 + y1) / 2 - ((c + d) / 2) * k;
  const cx = new Float32Array(tr.n);
  const cy = new Float32Array(tr.n);
  const road = new Float32Array(tr.n);
  for (let i = 0; i < tr.n; i++) {
    cx[i] = ox + tr.px[i] * k;
    cy[i] = oy + tr.pz[i] * k;
    road[i] = Math.max(8, tr.hw[i] * 2 * k);
  }
  return { n: tr.n, cx, cy, road };
}

const KART_CSS = KART_COLORS.map((c) => `#${c.toString(16).padStart(6, '0')}`);
/** Точки бегут от снимка к снимку за столько секунд (снимки — 10 раз в секунду) */
const DOT_LERP = 0.11;
const DOT_R = 15;
/** Схема трассы: левая часть табло */
const MAP = { x0: 34, y0: 118, x1: 486, y1: 530 };

interface BoardDot {
  readonly group: THREE.Group;
  readonly fill: THREE.MeshBasicMaterial;
  /** Отрезки: откуда и куда бежит (to может выходить за n — так короче через линию старта) */
  from: number;
  to: number;
  at: number;
  seen: boolean;
}

/**
 * Табло картинга: свободно, отсчёт в круге «Старт», гонка и итоги. В гонке — схема трассы с точками картов
 * (точки — кружки поверх холста, бегут сами между снимками kpos) и таблица мест. Секунды тикают сами.
 */
export class KartBoard {
  readonly mesh: THREE.Mesh;
  private readonly s: Surface;
  private readonly w: number;
  private readonly h: number;
  private st: KartStatus = { phase: 'idle', left: 0, n: 0, names: [], lap: 0, laps: 3 };
  /** Последние позиции: по KPOS_STRIDE чисел на карт, по местам */
  private pos: number[] = [];
  /** Время мира, когда пришёл статус */
  private at = 0;
  private now = 0;
  private shown = '';
  private layout: RingLayout | null = null;
  private readonly dots = new Map<number, BoardDot>();
  private readonly dotGeo = new THREE.CircleGeometry(1, 24);
  private readonly rimMat = new THREE.MeshBasicMaterial({ color: 0x0d0a08, toneMapped: false });

  constructor(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.s = surface(1024, Math.round((1024 * height) / width));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.s.tex, toneMapped: false }));
    this.draw();
  }

  update(st: KartStatus): void {
    if ((st.track ?? DEFAULT_TRACK) !== (this.st.track ?? DEFAULT_TRACK)) {
      this.layout = null;
      this.pos = [];
      for (const d of this.dots.values()) { d.group.visible = false; d.from = d.to = 0; }
    }
    this.st = { ...st, names: st.names.slice(), karts: st.karts?.slice() };
    this.at = this.now;
    if (!this.racing) this.pos = [];
    this.draw();
  }

  /** Где карты (kpos): точки побегут туда сами, таблица — перерисуется, если сменились места или круги. */
  setPositions(p: readonly number[]): void {
    this.pos = p.slice();
    const lay = this.ring();
    for (const d of this.dots.values()) d.seen = false;
    for (let i = 0; i + KPOS_STRIDE <= p.length; i += KPOS_STRIDE) {
      const id = p[i];
      const seg = p[i + 1];
      let d = this.dots.get(id);
      if (!d) {
        d = this.makeDot(id);
        d.from = d.to = seg;
        d.at = this.now;
      } else {
        const cur = this.dotSeg(d);
        let to = seg;
        if (to - cur > lay.n / 2) to -= lay.n;
        else if (cur - to > lay.n / 2) to += lay.n;
        d.from = cur;
        d.to = to;
        d.at = this.now;
      }
      d.seen = true;
      // позиции пришли после конца гонки — точки не показываем
      d.group.visible = this.racing;
    }
    for (const d of this.dots.values()) if (!d.seen) d.group.visible = false;
    if (this.key() !== this.shown) this.draw();
  }

  /** Каждый кадр (время мира в секундах). */
  tick(time: number): void {
    this.now = time;
    if (this.key() !== this.shown) this.draw();
    if (!this.racing) return;
    const lay = this.ring();
    for (const d of this.dots.values()) {
      if (!d.group.visible) continue;
      const s = ((this.dotSeg(d) % lay.n) + lay.n) % lay.n;
      const i = Math.floor(s);
      const j = (i + 1) % lay.n;
      const f = s - i;
      const x = lay.cx[i] + (lay.cx[j] - lay.cx[i]) * f;
      const y = lay.cy[i] + (lay.cy[j] - lay.cy[i]) * f;
      d.group.position.set((x / this.s.canvas.width - 0.5) * this.w, (0.5 - y / this.s.canvas.height) * this.h, 0.012);
    }
  }

  private get racing(): boolean {
    return (this.st.phase === 'race' || this.st.phase === 'results') && !!this.st.karts?.length;
  }

  private ring(): RingLayout {
    return (this.layout ??= ringLayout(MAP.x0, MAP.y0, MAP.x1, MAP.y1, this.st.track ?? DEFAULT_TRACK));
  }

  private dotSeg(d: BoardDot): number {
    const u = Math.min(1, Math.max(0, (this.now - d.at) / DOT_LERP));
    return d.from + (d.to - d.from) * u;
  }

  private makeDot(id: number): BoardDot {
    // метров на пиксель холста
    const k = this.w / this.s.canvas.width;
    const group = new THREE.Group();
    const rim = new THREE.Mesh(this.dotGeo, this.rimMat);
    rim.scale.setScalar((DOT_R + 4) * k);
    const fill = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const disc = new THREE.Mesh(this.dotGeo, fill);
    disc.scale.setScalar(DOT_R * k);
    disc.position.z = 0.002;
    group.add(rim, disc);
    this.mesh.add(group);
    const d: BoardDot = { group, fill, from: 0, to: 0, at: 0, seen: true };
    this.dots.set(id, d);
    this.colorDot(id, d);
    return d;
  }

  private colorDot(id: number, d: BoardDot): void {
    const info = this.st.karts?.find((k) => k.id === id);
    d.fill.color.setHex(KART_COLORS[(info?.color ?? id - 1) % KART_COLORS.length]);
  }

  private left(): number {
    return Math.max(0, this.st.left - Math.floor(this.now - this.at));
  }

  private key(): string {
    const p = this.st;
    const race = this.racing ? `|${(p.karts ?? []).map((k) => `${k.id}:${k.nick}:${k.color}`).join(',')}|${this.standings()}` : '';
    return `${p.track}|${p.phase}|${this.left()}|${p.n}|${p.lap}|${p.names.join(',')}|${Math.floor(this.now * 1.25) % 2}${race}`;
  }

  /** Места, круги и финиш — то, что видно в таблице (без отрезков: они меняются каждый снимок) */
  private standings(): string {
    let out = '';
    for (let i = 0; i + KPOS_STRIDE <= this.pos.length; i += KPOS_STRIDE) out += `${this.pos[i]}.${this.pos[i + 2]}.${this.pos[i + 4]};`;
    return out;
  }

  private draw(): void {
    this.shown = this.key();
    for (const [id, d] of this.dots) {
      if (!this.racing) d.group.visible = false;
      else this.colorDot(id, d);
    }
    if (this.racing) this.drawRace();
    else this.drawInfo();
    this.s.tex.needsUpdate = true;
  }

  /** Гонка и итоги: схема с точками слева, таблица мест справа. */
  private drawRace(): void {
    const { ctx, canvas } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    const p = this.st;
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(0, 0, W, H);
    checker(ctx, 0, W, 0, 22, 2);
    checker(ctx, 0, W, H - 44, 22, 2);
    ctx.textBaseline = 'middle';

    // заголовок
    let status: string;
    if (p.phase === 'results') status = `ФИНИШ · ИТОГИ · ЕЩЁ ${this.left()} С`;
    else status = p.lap > 0 ? `ИДЁТ ГОНКА · КРУГ ${p.lap}/${p.laps}` : 'КАРТЫ НА СТАРТЕ';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.phase === 'results' ? '#7dffb0' : '#ffb648';
    fit(ctx, status, 58, W - 80);
    ctx.fillText(status, W / 2, 68);
    ctx.fillStyle = '#c9baa0';
    ctx.font = `700 25px ${FONT}`;
    ctx.fillText(raceTrackName(p.track), W / 2, 108);

    // схема трассы: тёмная кайма, светлая дорога (ширина меняется), клетчатая линия старта
    const lay = this.ring();
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(lay.cx[0], lay.cy[0]);
      for (let i = 1; i < lay.n; i++) ctx.lineTo(lay.cx[i], lay.cy[i]);
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [style, extra] of [['#3a332b', 10], ['#8f877a', 0]] as const) {
      ctx.strokeStyle = style;
      for (let i = 0; i < lay.n; i++) {
        const j = (i + 1) % lay.n;
        ctx.lineWidth = (lay.road[i] + lay.road[j]) / 2 + extra;
        ctx.beginPath();
        ctx.moveTo(lay.cx[i], lay.cy[i]);
        ctx.lineTo(lay.cx[j], lay.cy[j]);
        ctx.stroke();
      }
    }
    path();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    const dx = lay.cx[1] - lay.cx[0];
    const dy = lay.cy[1] - lay.cy[0];
    ctx.save();
    ctx.translate(lay.cx[0], lay.cy[0]);
    ctx.rotate(Math.atan2(dy, dx));
    const cell = lay.road[0] / 4;
    for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) {
      ctx.fillStyle = (r + q) % 2 ? '#f2ede2' : '#141414';
      ctx.fillRect(-cell + r * cell, -lay.road[0] / 2 + q * cell, cell, cell);
    }
    ctx.restore();

    // таблица мест
    const x0 = 520;
    const rowH = 64;
    const top = 140;
    const rows: Array<{ id: number; place: number; lap: number; done: boolean }> = [];
    for (let i = 0; i + KPOS_STRIDE <= this.pos.length; i += KPOS_STRIDE) {
      rows.push({ id: this.pos[i], place: this.pos[i + 3], lap: this.pos[i + 2], done: this.pos[i + 4] === 1 });
    }
    if (!rows.length) for (const k of p.karts ?? []) rows.push({ id: k.id, place: 0, lap: 0, done: false });
    rows.slice(0, 6).forEach((r, i) => {
      const y = top + i * rowH;
      const info = p.karts?.find((k) => k.id === r.id);
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x0 - 12, y - rowH / 2 + 4, W - x0 - 22, rowH - 8);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = r.place === 1 ? '#ffd27a' : '#e9dcc0';
      ctx.font = `900 44px ${FONT}`;
      ctx.fillText(r.place ? String(r.place) : '·', x0 + 18, y);
      ctx.beginPath();
      ctx.arc(x0 + 72, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = KART_CSS[(info?.color ?? r.id - 1) % KART_CSS.length];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0d0a08';
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = info?.bot ? '#9c927f' : '#f4ead6';
      fit(ctx, info?.nick ?? '?', 40, 250, 700);
      ctx.fillText(info?.nick ?? '?', x0 + 100, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.done ? '#7dffb0' : '#d9a35a';
      ctx.font = `800 38px ${FONT}`;
      const lapText = r.done ? '🏁' : r.lap > 0 ? `${r.lap}/${p.laps}` : '';
      ctx.fillText(lapText, W - 44, y);
    });
    ledGrid(ctx, W, H);
  }

  /** Свободно и отсчёт: три строки — что происходит, кто едет, что делать. */
  private drawInfo(): void {
    const { ctx, canvas } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    const p = this.st;
    const blink = Math.floor(this.now * 1.25) % 2 === 0;
    const left = this.left();
    ctx.fillStyle = '#0d0a08';
    ctx.fillRect(0, 0, W, H);
    checker(ctx, 0, W, 0, 22, 2);
    checker(ctx, 0, W, H - 44, 22, 2);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // строка 1: что происходит
    let status: string;
    let color = '#ffb648';
    if (p.phase === 'count') {
      status = `СТАРТ ЧЕРЕЗ ${left} С`;
      color = '#7dffb0';
    } else if (p.phase === 'race') status = p.lap > 0 ? `ИДЁТ ГОНКА · КРУГ ${p.lap}/${p.laps}` : 'КАРТЫ НА СТАРТЕ';
    else if (p.phase === 'results') status = 'ФИНИШ · ИТОГИ';
    else status = 'ТРАССА СВОБОДНА';
    ctx.fillStyle = color;
    fit(ctx, status, 92, W - 80);
    ctx.fillText(status, W / 2, H * 0.3);

    // строка 2: кто едет или приглашение
    const y2 = H * 0.53;
    ctx.fillStyle = '#e9dcc0';
    let who: string;
    if (p.phase === 'count') who = `в круге: ${p.names.join(', ')}`;
    else if (p.phase === 'race' || p.phase === 'results') who = p.names.length ? `едут: ${p.names.join(', ')}` : 'едут одни боты';
    else who = `${raceTrackName(p.track)} · ${p.laps} круга · до 6 картов`;
    fit(ctx, who, 50, W - 90, 700);
    ctx.fillText(who, W / 2, y2);

    // строка 3: что делать
    const y3 = H * 0.74;
    let hint: string;
    if (p.phase === 'count') hint = p.n > 6 ? 'мест 6 — остальные поедут следующими' : `гонщиков: ${p.n} из 6 · ${botsWord(p.n)}`;
    else if (p.phase === 'results') hint = `круг откроется через ${left} с`;
    else if (p.phase === 'race') hint = 'следующий заезд — после финиша';
    else hint = `в круг у гаража · ${BOTS_RULE}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d9a35a';
    fit(ctx, hint, 44, W - 330, 700);
    ctx.fillText(hint, 40, y3);
    if (blink && (p.phase === 'idle' || p.phase === 'count')) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd27a';
      ctx.font = `900 50px ${FONT}`;
      ctx.fillText('ПОЕХАЛИ ▸', W - 40, y3);
    }
    ledGrid(ctx, W, H);
  }
}

// ------------------------------------------------------------ доска почёта

/** Высота шапки на листах доски почёта, px холста */
const HEAD = 92;

/** Лист доски почёта: бумага с потемневшими краями и бордовая шапка с заголовком. */
function paperSheet(s: Surface, title: string): void {
  const { ctx, canvas } = s;
  const W = canvas.width;
  const H = canvas.height;
  ctx.fillStyle = '#efe5cf';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(110,80,40,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#7a2a20';
  ctx.fillRect(0, 0, W, HEAD);
  ctx.fillStyle = '#d9b25e';
  ctx.fillRect(0, HEAD - 6, W, 4);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f6d98a';
  fit(ctx, title, 58, W - 60);
  ctx.fillText(title, W / 2, HEAD / 2);
}

/** Лист на доске: холст 768 px в ширину, бумага слегка светится, чтобы читалась и в тени. */
function sheetMesh(s: Surface, width: number, height: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ map: s.tex, emissiveMap: s.tex, emissive: 0xffffff, emissiveIntensity: 0.42, roughness: 0.92 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

/** Бумажные списки на деревянной доске: богачи по жетонам, победители по числу побед, последний джекпот. */
export class HonorBoard {
  readonly mesh: THREE.Mesh;
  private readonly s: Surface;

  constructor(width: number, height: number) {
    this.s = surface(768, Math.round((768 * height) / width));
    this.mesh = sheetMesh(this.s, width, height);
    this.update({ rich: [], wins: [], lastJackpot: null, recent: [] });
  }

  update(h: HonorInfo): void {
    const { ctx, canvas, tex } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    paperSheet(this.s, 'ДОСКА ПОЧЁТА');
    const head = HEAD;

    const colW = (W - 3 * 34) / 2;
    const column = (x: number, title: string, rows: HonorRow[]) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#7a2a20';
      ctx.font = `900 38px ${FONT}`;
      ctx.fillText(title, x, head + 46);
      ctx.fillStyle = 'rgba(122,42,32,0.5)';
      ctx.fillRect(x, head + 72, colW, 3);
      for (let i = 0; i < 5; i++) {
        const y = head + 112 + i * 54;
        const r = rows[i];
        ctx.textAlign = 'left';
        ctx.fillStyle = i === 0 && r ? '#8a5a10' : '#2b2118';
        const label = r ? `${i + 1}. ${r.nick}` : `${i + 1}. —`;
        fit(ctx, label, 34, colW - 110, 700);
        ctx.fillText(label, x, y);
        if (r) {
          ctx.textAlign = 'right';
          ctx.font = `900 34px ${FONT}`;
          ctx.fillText(num(r.n), x + colW, y);
        }
      }
    };
    column(34, 'Богачи', h.rich);
    column(34 * 2 + colW, 'Победители', h.wins);

    // последний джекпот
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7a2a20';
    const jp = h.lastJackpot;
    const line = jp ? `Последний джекпот: ${jp.nick} +${num(jp.win)}` : 'Джекпот ещё никто не срывал';
    fit(ctx, line, 32, W - 60, 700);
    ctx.fillText(line, W / 2, H - 40);
    tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------ последние входы

/** Сколько прошло с визита: «только что», «5 мин назад», «3 ч назад», «2 дн. назад»; кто сейчас здесь — «в игре». */
export function agoText(sec: number, on: boolean): string {
  if (on) return 'в игре';
  if (sec < 60) return 'только что';
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
  return `${Math.floor(sec / 86400)} дн. назад`;
}

/**
 * Обратная сторона доски почёта: кто был на набережной — сверху те, кто в игре, ниже — кто когда ушёл. «Назад» растёт
 * и между сообщениями сервера: от ago, присланного сервером, плюс сколько прошло с прихода списка.
 */
export class RecentBoard {
  readonly mesh: THREE.Mesh;
  private readonly s: Surface;
  private rows: readonly RecentRow[] = [];
  /** performance.now(), когда пришёл список, и когда последний раз сверяли надписи */
  private at = 0;
  private checked = -Infinity;
  private drawn: string | null = null;

  constructor(width: number, height: number) {
    this.s = surface(768, Math.round((768 * height) / width));
    this.mesh = sheetMesh(this.s, width, height);
    this.tick(0);
  }

  set(rows: readonly RecentRow[], now: number): void {
    this.rows = rows.slice(0, RECENT_ROWS);
    this.at = now;
    this.checked = -Infinity;
    this.tick(now);
  }

  /** Раз в кадр (now — performance.now()); надписи сверяются раз в секунду, холст — только если они сменились. */
  tick(now: number): void {
    if (now - this.checked < 1000) return;
    this.checked = now;
    const passed = (now - this.at) / 1000;
    const labels = this.rows.map((r) => agoText(r.ago + passed, r.on));
    const key = this.rows.map((r, i) => `${r.nick}|${labels[i]}`).join('\n');
    if (key === this.drawn) return;
    this.drawn = key;
    this.draw(labels);
  }

  private draw(labels: readonly string[]): void {
    const { ctx, canvas, tex } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    paperSheet(this.s, 'ПОСЛЕДНИЕ ВХОДЫ');
    if (this.rows.length === 0) {
      ctx.fillStyle = '#6b5a4a';
      ctx.font = `700 34px ${FONT}`;
      ctx.fillText('Пока никого', W / 2, (HEAD + H) / 2);
      tex.needsUpdate = true;
      return;
    }
    const step = (H - HEAD - 34) / RECENT_ROWS;
    this.rows.forEach((r, i) => {
      const y = HEAD + 17 + step * (i + 0.5);
      if (i > 0) {
        ctx.fillStyle = 'rgba(122,42,32,0.18)';
        ctx.fillRect(40, y - step / 2, W - 80, 2);
      }
      // время — справа (в игре — зелёным), ник — слева, сколько влезет
      ctx.textAlign = 'right';
      ctx.fillStyle = r.on ? '#2f7a3a' : '#6b5a4a';
      ctx.font = `${r.on ? 900 : 700} 30px ${FONT}`;
      ctx.fillText(labels[i], W - 40, y);
      const timeW = ctx.measureText(labels[i]).width;
      if (r.on) {
        ctx.beginPath();
        ctx.arc(52, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#2b2118';
      fit(ctx, r.nick, 34, W - 80 - 34 - timeW - 24, 700);
      ctx.fillText(r.nick, 74, y);
    });
    tex.needsUpdate = true;
  }
}

// ------------------------------------------------------------ табло джекпота

/** Банк джекпота: число плавно докручивается до нового значения, при выигрыше табло мигает. */
export class JackpotBoard {
  readonly mesh: THREE.Mesh;
  private readonly s: Surface;
  private shown = 0;
  private drawn = -1;
  private lastDraw = -1;
  private last = 0;
  private flashUntil = 0;
  private flashOn = false;

  constructor(width: number, height: number) {
    this.s = surface(1024, Math.round((1024 * height) / width));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: this.s.tex, toneMapped: false }));
    this.draw(null, false);
  }

  /** Каждый кадр: pool — последний известный банк, time — время в секундах. */
  update(pool: number, time: number): void {
    const dt = Math.min(0.1, Math.max(0, time - this.last));
    this.last = time;
    if (this.drawn < 0) this.shown = pool;
    else this.shown += (pool - this.shown) * (1 - Math.exp(-dt * 2.5));
    if (Math.abs(pool - this.shown) < 0.5) this.shown = pool;
    const on = time < this.flashUntil && Math.floor(time * 6) % 2 === 0;
    const v = Math.round(this.shown);
    if ((v !== this.drawn && time - this.lastDraw >= 0.25) || on !== this.flashOn) {
      this.lastDraw = time;
      this.draw(v, on);
    }
  }

  /** Мигать seconds секунд (джекпот сорвали). */
  flash(seconds: number): void {
    this.flashUntil = this.last + seconds;
  }

  private draw(v: number | null, on: boolean): void {
    this.drawn = v ?? -1;
    this.flashOn = on;
    const { ctx, canvas, tex } = this.s;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = on ? '#6a2008' : '#170605';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c99a3e';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = on ? '#fff6d8' : '#f0c868';
    ctx.font = `900 64px ${FONT}`;
    ctx.fillText('ДЖЕКПОТ', 48, H / 2 + 3);
    ctx.textAlign = 'right';
    ctx.fillStyle = on ? '#ffffff' : '#ffb43a';
    fit(ctx, v === null ? '—' : num(v), 118, W - 460);
    ctx.fillText(v === null ? '—' : num(v), W - 48, H / 2 + 5);
    ledGrid(ctx, W, H);
    tex.needsUpdate = true;
  }
}
