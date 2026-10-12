// Стол рулетки рыбака в 3D (fisheco, флаг ROULETTE): деревянный стол с зелёным сукном (поля «красное ×2», «чёрное ×2»,
// «зеро ×36» и фишки ставок на них), европейское колесо на 37 лунок с латунной крестовиной и шариком, табло позади стола.
// Вращение у всех одинаковое: сервер шлёт выпавшее число и сколько осталось крутить, клиент
// считает кадр по времени с начала вращения (client/lobby/roulettespin.ts) с поправкой на сеть — колесо раскручивается,
// шарик бежит навстречу, замедляется, сходит с бортика и прыгает по лункам; в конце лежит ровно в лунке этого числа.
// Остановилось — выигрышная лунка и поле цвета светятся, на табло число. Табло позади стола (rouletteboard.ts): что со столом
// и последние 10 ставок с итогом; новые строки и тост о розыгрыше — только когда шарик лёг в лунку у меня на экране.
// Место — ROULETTE_SPOT (shared/fishplaces.ts).
import * as THREE from 'three';
import { ROULETTE_SPOT } from '../../shared/fishplaces.ts';
import type { ServerMsg } from '../../shared/messages.ts';
import {
  ROULETTE_COLOR_NAMES, ROULETTE_PAYOUT, ROULETTE_SPIN_MS, ROULETTE_WHEEL, rouletteColor, type RouletteColor, type RouletteLogRow, type RouletteView,
} from '../../shared/roulette.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { RouletteBoard, type BoardHead } from './rouletteboard.ts';
import { POCKET, R_DISK, R_POCKET, R_RIM, TAU, pocketAngle, spinEndWheel, spinFrame, spinStartAt } from './roulettespin.ts';

/** Колесо: центр на столе (вдоль длинной стороны) */
const WHEEL_X = -0.62;
const WHEEL_Y = 0.98;
const TABLE_W = 2.3;
const TABLE_D = 1.15;
const TABLE_H = 0.86;
/** Стол в 3D крупнее модели в TABLE_SCALE раз */
const TABLE_SCALE = 1.25;
/** Покой: колесо тихо крутится, рад/с */
const IDLE_W = 0.25;
const COLORS: Record<RouletteColor, string> = { red: '#b3262b', black: '#1d1d22', green: '#1e7a3d' };
/** Поля ставок на сукне — прямоугольники на холсте 1024×512 (слева — колесо) */
const FELT_W = 1024;
const FELT_H = 512;
const BOX = { x0: 470, step: 182, y: 90, w: 166, h: 330 };
const BOX_AT: Record<RouletteColor, number> = { red: 0, black: 1, green: 2 };

/** Центр поля цвета на столе (в осях стола), м */
function fieldCenter(c: RouletteColor): { x: number; z: number } {
  const cx = BOX.x0 + BOX_AT[c] * BOX.step + BOX.w / 2;
  const cy = BOX.y + BOX.h / 2;
  return { x: (cx / FELT_W - 0.5) * TABLE_W, z: (cy / FELT_H - 0.5) * TABLE_D };
}

function wheelTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const cx = 512, cy = 512, R = 508;
  g.fillStyle = '#5a3a22';
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  for (let i = 0; i < 37; i++) {
    const n = ROULETTE_WHEEL[i];
    // лунка i — под углом i·2π/37 против часовой (вид сверху); на холсте y вниз — угол со знаком минус
    const a0 = -(i + 0.5) * POCKET, a1 = -(i - 0.5) * POCKET;
    g.fillStyle = COLORS[rouletteColor(n)];
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R * 0.97, a1, a0, true); g.closePath(); g.fill();
    g.strokeStyle = '#d8b86a';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx + Math.cos(a0) * R * 0.55, cy + Math.sin(a0) * R * 0.55); g.lineTo(cx + Math.cos(a0) * R * 0.97, cy + Math.sin(a0) * R * 0.97); g.stroke();
    g.save();
    g.translate(cx, cy);
    g.rotate(-i * POCKET + Math.PI / 2);
    g.fillStyle = '#f6efdc';
    g.font = 'bold 50px Rubik, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 0, -R * 0.85);
    g.restore();
  }
  // внутреннее кольцо и конус
  g.fillStyle = '#7b5230';
  g.beginPath(); g.arc(cx, cy, R * 0.55, 0, TAU); g.fill();
  g.strokeStyle = '#d8b86a';
  g.lineWidth = 6;
  for (const k of [0.55, 0.72, 0.97]) { g.beginPath(); g.arc(cx, cy, R * k, 0, TAU); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = FELT_W;
  c.height = FELT_H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f6a3c';
  g.fillRect(0, 0, FELT_W, FELT_H);
  g.strokeStyle = 'rgba(240,226,180,.8)';
  g.lineWidth = 5;
  g.strokeRect(14, 14, 996, 484);
  const boxes: Array<[RouletteColor, string]> = [['red', 'КРАСНОЕ'], ['black', 'ЧЁРНОЕ'], ['green', 'ЗЕРО']];
  // поля ставок — правые две трети сукна (слева колесо)
  boxes.forEach(([col, name], i) => {
    const x = BOX.x0 + i * BOX.step, y = BOX.y, w = BOX.w, h = BOX.h;
    g.fillStyle = col === 'green' ? '#2a8f4c' : COLORS[col];
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#e9d9a6';
    g.lineWidth = 4;
    g.strokeRect(x, y, w, h);
    g.fillStyle = '#f7f0dd';
    g.textAlign = 'center';
    g.font = 'bold 34px Rubik, system-ui, sans-serif';
    g.fillText(name, x + w / 2, y + 60);
    g.font = 'bold 54px Rubik, system-ui, sans-serif';
    g.fillText(`×${ROULETTE_PAYOUT[col]}`, x + w / 2, y + 200);
    g.font = '24px Rubik, system-ui, sans-serif';
    g.fillText(col === 'green' ? '1 из 37' : '18 из 37', x + w / 2, y + 260);
  });
  g.fillStyle = 'rgba(240,226,180,.85)';
  g.font = 'bold 30px Rubik, system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('СТАВКА — ВЕСЬ УЛОВ', 744, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Roulette3D {
  readonly group = new THREE.Group();
  private readonly wheel = new THREE.Group();
  private readonly ball: THREE.Mesh;
  private readonly chips = new THREE.Group();
  private readonly chipGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.014, 18);
  private readonly chipMats: Record<RouletteColor | 'cream', THREE.MeshStandardMaterial> = {
    red: new THREE.MeshStandardMaterial({ color: 0xd04040, roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.5 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2f9a57, roughness: 0.5 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xf1e6c8, roughness: 0.5 }),
  };
  /** Подсветка выигрышной лунки (на колесе) и выигрышного поля (на сукне) */
  private readonly pocketGlow: THREE.Mesh;
  private readonly fieldGlow: THREE.Mesh;
  /** Табло позади стола: состояние стола и последние ставки */
  private readonly board = new RouletteBoard();
  /** Что на табло сейчас: последние ставки (свежие сверху) и мой номер игрока (своя строка — золотом) */
  private rows: readonly RouletteLogRow[] = [];
  private me = 0;
  /** Пришедшее письмо о розыгрыше ждёт, пока шарик не ляжет в лунку: табло и тост не выдают результат раньше колеса */
  private pendingLog: Extract<ServerMsg, { t: 'rouletteLog' }> | null = null;
  /** Табло обновилось: новые строки и сколько верхних из них свежие (розыгрыш только что закончился у меня на экране) */
  onLogShown: (rows: readonly RouletteLogRow[], fresh: number) => void = () => {};
  private view: RouletteView | null = null;
  /** Идущее вращение: число, раунд, локальное время начала, угол колеса в начале */
  private spin: { n: number; round: number; start: number; w0: number } | null = null;
  /** Раунд, который уже крутили: повторное письмо о нём вращение не перезапускает */
  private spunRound = 0;
  /** Число в лунке (итог последнего раунда, подсвечено); undefined — стол ждёт ставок */
  private shown: number | undefined;
  private wheelAngle = 0;
  private ballAngle = 0;
  private ballR = R_POCKET;
  /** С какого момента колесо снова тихо крутится (разгоняется плавно) */
  private idleSince = -1e9;
  /** Сеть в одну сторону, мс: письмо о вращении шло столько — вращение у всех идёт по одним часам */
  private latency = 0;
  private phaseEnd = 0;
  private signKey = '';

  constructor(scene: THREE.Scene) {
    const g = this.group;
    g.name = 'fish-roulette';
    g.position.set(ROULETTE_SPOT.x, ROULETTE_SPOT.y, ROULETTE_SPOT.z);
    g.rotation.y = ROULETTE_SPOT.yaw;
    // стол крупнее на четверть: колесо и шарик видны с палубы; по ширине (1,44 м) и длине (2,9 м) он под тентом (3,3 × 4,6 м)
    g.scale.setScalar(TABLE_SCALE);
    g.visible = false;
    const wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 });
    const legs: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push(place(paint(new THREE.BoxGeometry(0.09, TABLE_H - 0.06, 0.09), 0x4a3221), sx * (TABLE_W / 2 - 0.14), (TABLE_H - 0.06) / 2, sz * (TABLE_D / 2 - 0.12)));
    legs.push(place(paint(new THREE.BoxGeometry(TABLE_W + 0.12, 0.08, TABLE_D + 0.12), 0x6b4429), 0, TABLE_H - 0.02, 0));
    legs.push(place(paint(new THREE.BoxGeometry(TABLE_W - 0.3, 0.05, 0.05), 0x4a3221), 0, 0.22, 0));
    // бортик вокруг сукна
    for (const sz of [-1, 1]) legs.push(place(paint(new THREE.BoxGeometry(TABLE_W + 0.12, 0.05, 0.07), 0x8a5a34), 0, TABLE_H + 0.045, sz * (TABLE_D / 2 + 0.025)));
    for (const sx of [-1, 1]) legs.push(place(paint(new THREE.BoxGeometry(0.07, 0.05, TABLE_D + 0.12), 0x8a5a34), sx * (TABLE_W / 2 + 0.025), TABLE_H + 0.045, 0));
    // чаша колеса
    legs.push(place(paint(new THREE.CylinderGeometry(R_RIM + 0.05, R_RIM + 0.09, 0.12, 48, 1, true), 0x5b3a23), WHEEL_X, WHEEL_Y - 0.06, 0));
    // латунный ободок — кольцо вокруг чаши, а не сплошной диск: диск закрывал лунки, шарик и подсветку (колесо было жёлтой плиткой)
    legs.push(place(paint(new THREE.RingGeometry(R_RIM, R_RIM + 0.06, 48).rotateX(-Math.PI / 2), 0xc8a45a), WHEEL_X, WHEEL_Y + 0.009, 0));
    legs.push(place(paint(new THREE.CylinderGeometry(R_RIM, R_RIM, 0.02, 48), 0x3b2616), WHEEL_X, WHEEL_Y - 0.05, 0));
    const body = new THREE.Mesh(mergeColored(legs), wood);
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }));
    felt.position.y = TABLE_H + 0.021;
    felt.receiveShadow = true;
    g.add(felt);
    // колесо: диск с лунками и латунная крестовина
    this.wheel.position.set(WHEEL_X, WHEEL_Y, 0);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(R_DISK + 0.04, 74).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: wheelTexture(), roughness: 0.45, metalness: 0.1 }));
    disk.position.y = -0.035;
    this.wheel.add(disk);
    // выигрышная лунка светится (вместе с колесом: лунка 0 в нуле угла, поворот — по числу)
    this.pocketGlow = new THREE.Mesh(
      new THREE.RingGeometry(0.17, R_DISK + 0.02, 10, 1, -POCKET / 2, POCKET).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.pocketGlow.position.y = -0.027;
    this.pocketGlow.visible = false;
    this.wheel.add(this.pocketGlow);
    const brass = new THREE.MeshStandardMaterial({ color: 0xd2a94e, roughness: 0.3, metalness: 0.85 });
    const turret = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 24), brass);
    turret.position.y = 0.02;
    this.wheel.add(turret);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), brass);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = i * Math.PI / 4;
      arm.position.y = 0.06;
      this.wheel.add(arm);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), brass);
      knob.position.set(Math.cos(i * Math.PI / 4) * 0.15, 0.06, -Math.sin(i * Math.PI / 4) * 0.15);
      this.wheel.add(knob);
      const knob2 = knob.clone();
      knob2.position.set(-knob.position.x, 0.06, -knob.position.z);
      this.wheel.add(knob2);
    }
    g.add(this.wheel);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.25, metalness: 0.05 }));
    this.ball.castShadow = true;
    g.add(this.ball);
    // выигрышное поле на сукне
    this.fieldGlow = new THREE.Mesh(
      new THREE.PlaneGeometry((BOX.w / FELT_W) * TABLE_W, (BOX.h / FELT_H) * TABLE_D).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.fieldGlow.position.y = TABLE_H + 0.027;
    this.fieldGlow.visible = false;
    g.add(this.fieldGlow);
    g.add(this.chips);
    // табло позади стола (оно в осях стола — ездит вместе со столом и баркасом)
    g.add(this.board.group);
    this.placeBall(0, 1);
    this.drawBoard(performance.now());
    scene.add(g);
  }

  /** Включена ли рулетка (флаг сервера); приветствие набережной — начало с чистого листа */
  setOn(on: boolean): void {
    this.group.visible = on;
    this.spunRound = 0;
    this.spin = null;
    this.view = null;
    this.rows = [];
    this.pendingLog = null;
    this.onLogShown([], 0);
    this.setShown(undefined);
  }

  /**
   * Письмо сервера «табло на баркасе» (rouletteLog): сразу при выходе на палубу — как есть; после розыгрыша (fresh) — когда
   * шарик ляжет в лунку у меня на экране. me — мой номер игрока, чтобы подсветить свои строки.
   */
  onLog(m: Extract<ServerMsg, { t: 'rouletteLog' }>, me: number): void {
    this.me = me;
    this.pendingLog = m;
    this.flushLog();
  }

  private flushLog(): void {
    const m = this.pendingLog;
    if (!m || (m.fresh && this.spin)) return;
    this.pendingLog = null;
    this.rows = m.rows;
    this.signKey = '';
    this.onLogShown(m.rows, m.fresh ?? 0);
  }

  /** Идёт ли вращение у этого игрока (шарик ещё не лёг в лунку) — итог показываем после него */
  get spinning(): boolean { return this.spin !== null; }

  /** Число в лунке после остановки; undefined — раунда ещё не было или идёт новый */
  get lastNumber(): number | undefined { return this.shown; }

  /**
   * Состояние стола. latencyMs — сколько шло письмо (половина пинга): вращение двигаем на столько назад, чтобы шарик
   * падал у всех в один и тот же момент.
   */
  setView(v: RouletteView, latencyMs = 0): void {
    const now = performance.now();
    this.latency = Math.min(500, Math.max(0, latencyMs));
    this.view = v;
    this.phaseEnd = v.phase === 'idle' ? 0 : now - this.latency + v.left;
    if (v.phase === 'spin' && v.n !== undefined) {
      if (v.round !== this.spunRound) this.startSpin(v.n, v.round, v.left, now);
    } else if (v.n === undefined) {
      // стол ждёт новых ставок
      this.spin = null;
      this.setShown(undefined);
    } else if (!this.spin) {
      // пришёл позже вращения (или перезашёл) — видит итог прошлого раунда
      this.setShown(v.n);
    }
    this.layChips(v);
    this.signKey = '';
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    const now = performance.now();
    const s = this.spin;
    let bounce = 0;
    let scale = 1;
    if (s) {
      const elapsed = now - s.start;
      const f = spinFrame(s.n, s.w0, elapsed);
      this.wheelAngle = f.wheel;
      this.ballAngle = f.ball;
      this.ballR = f.radius;
      bounce = f.bounce;
      // шарик «запускают»: в первые 0,3 с он вырастает на дорожке
      scale = Math.min(1, Math.max(0.01, elapsed / 300));
      if (f.done) this.finish(now);
    } else {
      // в покое колесо тихо крутится (после остановки — разгоняясь плавно), шарик лежит в лунке
      this.wheelAngle += dt * IDLE_W * Math.min(1, (now - this.idleSince) / 2500);
      this.ballAngle = this.wheelAngle + pocketAngle(this.shown ?? ROULETTE_WHEEL[0]);
      this.ballR = R_POCKET;
    }
    this.wheel.rotation.y = this.wheelAngle;
    this.placeBall(bounce, scale);
    if (this.pendingLog && !this.spin) this.flushLog();
    // подсветка выигрыша мигает спокойно
    if (this.pocketGlow.visible) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      (this.pocketGlow.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.35 * pulse;
      (this.fieldGlow.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.28 * pulse;
    }
    const key = `${this.view?.phase}|${this.view?.round}|${this.phaseEnd ? Math.ceil((this.phaseEnd - now) / 1000) : 0}|${this.view?.bets.length}|${this.spin ? 1 : 0}|${this.shown}`;
    if (key !== this.signKey) {
      this.signKey = key;
      this.drawBoard(now);
    }
  }

  /** Пришло вращение: n — выпавшее число, left — сколько ещё крутить (опоздавший видит конец) */
  private startSpin(n: number, round: number, left: number, now: number): void {
    this.spunRound = round;
    this.setShown(undefined);
    this.spin = { n, round, start: spinStartAt(now, left, this.latency, ROULETTE_SPIN_MS), w0: this.wheelAngle };
    this.ballAngle = this.wheelAngle + pocketAngle(n);
    if (now >= this.spin.start + ROULETTE_SPIN_MS) this.finish(now);
  }

  /** Шарик лёг в лунку: колесо встало, лунка и поле цвета засветились */
  private finish(now: number): void {
    const s = this.spin;
    if (!s) return;
    this.wheelAngle = spinEndWheel(s.w0);
    this.spin = null;
    this.idleSince = now;
    this.setShown(s.n);
    if (this.view) this.layChips(this.view);
  }

  private setShown(n: number | undefined): void {
    this.shown = n;
    this.pocketGlow.visible = n !== undefined;
    this.fieldGlow.visible = n !== undefined;
    if (n !== undefined) {
      this.pocketGlow.rotation.y = pocketAngle(n);
      const at = fieldCenter(rouletteColor(n));
      this.fieldGlow.position.x = at.x;
      this.fieldGlow.position.z = at.z;
    }
    this.signKey = '';
  }

  private placeBall(bounce: number, scale: number): void {
    const y = WHEEL_Y + (this.ballR > R_POCKET + 0.02 ? 0 : -0.012) + bounce;
    this.ball.position.set(WHEEL_X + Math.cos(this.ballAngle) * this.ballR, y, -Math.sin(this.ballAngle) * this.ballR);
    this.ball.scale.setScalar(scale);
  }

  /** Фишки ставок на полях: пока шарик катится, ставки остаются (сервер уже раздал выплаты) */
  private layChips(v: RouletteView): void {
    if (this.spin && v.bets.length === 0) return;
    this.chips.clear();
    const per: Record<RouletteColor, number> = { red: 0, black: 0, green: 0 };
    for (const b of v.bets) {
      const k = per[b.c]++;
      const stack = Math.min(6, 2 + Math.round(Math.log10(Math.max(10, b.stake)) * 1.2));
      const at = fieldCenter(b.c);
      for (let j = 0; j < stack; j++) {
        const chip = new THREE.Mesh(this.chipGeo, this.chipMats[j % 2 ? 'cream' : b.c]);
        chip.position.set(at.x + ((k % 3) - 1) * 0.1, TABLE_H + 0.03 + j * 0.015, -0.2 + Math.floor(k / 3) * 0.11);
        chip.castShadow = true;
        this.chips.add(chip);
      }
    }
  }

  /** Табло: шапка по состоянию стола и последние ставки */
  private drawBoard(now: number): void {
    const v = this.view;
    const bets = v?.bets.length ?? 0;
    let head: BoardHead = { kind: 'idle' };
    if (this.spin) head = { kind: 'spin', bets };
    else if (v?.phase === 'open') {
      const names = v.bets.slice(0, 2).map((b) => `${b.nick}: ${ROULETTE_COLOR_NAMES[b.c]}`).join(' · ') + (bets > 2 ? ` · ещё ${bets - 2}` : '');
      head = { kind: 'open', secs: Math.max(0, Math.ceil((this.phaseEnd - now) / 1000)), names };
    } else if (this.shown !== undefined) head = { kind: 'result', n: this.shown };
    this.board.draw({ head, rows: this.rows, me: this.me });
  }
}
