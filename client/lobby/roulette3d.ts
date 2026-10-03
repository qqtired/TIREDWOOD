// Стол рулетки рыбака в 3D (fisheco, флаг ROULETTE): деревянный стол с зелёным сукном (поля «красное ×2», «чёрное ×2»,
// «зеро ×36» и фишки ставок на них), европейское колесо на 37 лунок с латунной крестовиной и шариком, табличка с
// приёмом ставок и итогом. Вращение одинаково у всех: сервер шлёт выпавшее число и сколько осталось крутить; колесо
// тормозит, шарик сходит с бортика и ложится в эту лунку. Место — ROULETTE_SPOT (shared/fishplaces.ts).
import * as THREE from 'three';
import { ROULETTE_SPOT } from '../../shared/fishplaces.ts';
import {
  ROULETTE_COLOR_NAMES, ROULETTE_PAYOUT, ROULETTE_SPIN_MS, ROULETTE_WHEEL, rouletteColor, type RouletteColor, type RouletteView,
} from '../../shared/roulette.ts';
import { mergeColored, paint, place } from '../render/kit.ts';

const TAU = Math.PI * 2;
const POCKET = TAU / 37;
/** Колесо: центр на столе (вдоль длинной стороны), радиусы бортика, лунок и шарика */
const WHEEL_X = -0.62;
const WHEEL_Y = 0.98;
const R_RIM = 0.46;
const R_DISK = 0.36;
const R_TRACK = 0.41;
const R_POCKET = 0.27;
const TABLE_W = 2.3;
const TABLE_D = 1.15;
const TABLE_H = 0.86;
const COLORS: Record<RouletteColor, string> = { red: '#b3262b', black: '#1d1d22', green: '#1e7a3d' };
const FIELD: Record<RouletteColor, number> = { red: 0.15, black: 0.62, green: 1.02 };

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
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f6a3c';
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = 'rgba(240,226,180,.8)';
  g.lineWidth = 5;
  g.strokeRect(14, 14, 996, 484);
  const boxes: Array<[RouletteColor, string]> = [['red', 'КРАСНОЕ'], ['black', 'ЧЁРНОЕ'], ['green', 'ЗЕРО']];
  // поля ставок — правые две трети сукна (слева колесо)
  boxes.forEach(([col, name], i) => {
    const x = 470 + i * 182, y = 90, w = 166, h = 330;
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
  private readonly sign: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture };
  private view: RouletteView | null = null;
  /** Вращение: локальные часы начала и конца, угол колеса и шарика в начале и в конце */
  private spin: { t0: number; t1: number; w0: number; w1: number; r0: number; r1: number } | null = null;
  private wheelAngle = 0;
  private ballAngle = 0;
  private ballR = R_TRACK;
  private phaseEnd = 0;
  private signKey = '';

  constructor(scene: THREE.Scene) {
    const g = this.group;
    g.name = 'fish-roulette';
    g.position.set(ROULETTE_SPOT.x, ROULETTE_SPOT.y, ROULETTE_SPOT.z);
    g.rotation.y = ROULETTE_SPOT.yaw;
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
    legs.push(place(paint(new THREE.CylinderGeometry(R_RIM + 0.06, R_RIM + 0.06, 0.012, 48), 0xc8a45a), WHEEL_X, WHEEL_Y + 0.003, 0));
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
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.25, metalness: 0.05 }));
    this.ball.castShadow = true;
    g.add(this.ball);
    g.add(this.chips);
    // табличка: приём ставок, кто на что поставил, итог
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 384;
    const ctx = canvas.getContext('2d')!;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.sign = { ctx, tex };
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    board.position.set(0.45, 1.95, -TABLE_D / 2 - 0.08);
    g.add(board);
    const back = new THREE.Mesh(mergeColored([
      place(paint(new THREE.BoxGeometry(1.4, 0.75, 0.04), 0x4a3221), 0.45, 1.95, -TABLE_D / 2 - 0.105),
      place(paint(new THREE.BoxGeometry(0.06, 1.6, 0.06), 0x4a3221), -0.17, 0.8, -TABLE_D / 2 - 0.1),
      place(paint(new THREE.BoxGeometry(0.06, 1.6, 0.06), 0x4a3221), 1.07, 0.8, -TABLE_D / 2 - 0.1),
    ]), wood);
    back.castShadow = true;
    g.add(back);
    this.placeBall();
    this.drawSign(performance.now());
    scene.add(g);
  }

  /** Включена ли рулетка (флаг сервера) */
  setOn(on: boolean): void {
    this.group.visible = on;
  }

  setView(v: RouletteView): void {
    const was = this.view;
    this.view = v;
    const now = performance.now();
    this.phaseEnd = v.phase === 'idle' ? 0 : now + v.left;
    if (v.phase === 'spin' && v.n !== undefined && (!was || was.phase !== 'spin' || was.round !== v.round)) this.startSpin(v.n, now, v.left);
    if (v.phase !== 'spin' && v.n !== undefined && !this.spin) this.settle(v.n);
    this.layChips(v);
    this.signKey = '';
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    const now = performance.now();
    const s = this.spin;
    if (s) {
      const k = Math.min(1, Math.max(0, (now - s.t0) / (s.t1 - s.t0)));
      const e = 1 - (1 - k) ** 3;
      this.wheelAngle = s.w0 + (s.w1 - s.w0) * e;
      // шарик бежит навстречу колесу и тормозит раньше; к концу сходит с бортика в лунку с парой подскоков
      const kb = Math.min(1, k / 0.86);
      const eb = 1 - (1 - kb) ** 2.4;
      this.ballAngle = this.wheelAngle + s.r0 + (s.r1 - s.r0) * eb;
      const drop = Math.min(1, Math.max(0, (k - 0.62) / 0.24));
      this.ballR = R_TRACK - (R_TRACK - R_POCKET) * drop;
      if (k >= 1) this.spin = null;
    } else if (!this.view || this.view.phase !== 'spin') {
      // в покое колесо тихо крутится, шарик лежит в лунке
      this.wheelAngle += dt * 0.25;
      this.ballAngle += dt * 0.25;
    }
    this.wheel.rotation.y = this.wheelAngle;
    this.placeBall(s ? Math.min(1, Math.max(0, (now - s.t0) / (s.t1 - s.t0))) : 1);
    const key = `${this.view?.phase}|${this.view?.round}|${this.phaseEnd ? Math.ceil((this.phaseEnd - now) / 1000) : 0}|${this.view?.bets.length}|${this.spin ? 1 : 0}`;
    if (key !== this.signKey) {
      this.signKey = key;
      this.drawSign(now);
    }
  }

  /** Пришло вращение: n — выпавшее число, left — сколько ещё крутить (опоздавший видит конец) */
  private startSpin(n: number, now: number, left: number): void {
    const i = ROULETTE_WHEEL.indexOf(n);
    const elapsed = Math.max(0, ROULETTE_SPIN_MS - left);
    const w0 = this.wheelAngle;
    // шарик относительно колеса: из далёкого «назад» — в лунку i (угол лунки на колесе i·2π/37)
    const r1 = i * POCKET;
    this.spin = { t0: now - elapsed, t1: now - elapsed + ROULETTE_SPIN_MS, w0, w1: w0 + TAU * 4.3, r0: r1 + TAU * 9.5, r1 };
    if (this.spin.t1 <= now) {
      this.spin = null;
      this.settle(n);
    }
  }

  private settle(n: number): void {
    const i = ROULETTE_WHEEL.indexOf(n);
    this.ballAngle = this.wheelAngle + i * POCKET;
    this.ballR = R_POCKET;
  }

  private placeBall(k = 1): void {
    const bounce = k > 0.62 && k < 0.9 ? Math.abs(Math.sin((k - 0.62) * 34)) * 0.025 * (1 - (k - 0.62) / 0.28) : 0;
    const y = WHEEL_Y + (this.ballR > R_POCKET + 0.02 ? 0.01 : -0.012) + bounce;
    this.ball.position.set(WHEEL_X + Math.cos(this.ballAngle) * this.ballR, y, -Math.sin(this.ballAngle) * this.ballR);
  }

  private layChips(v: RouletteView): void {
    this.chips.clear();
    const per: Record<RouletteColor, number> = { red: 0, black: 0, green: 0 };
    for (const b of v.bets) {
      const k = per[b.c]++;
      const stack = Math.min(6, 2 + Math.round(Math.log10(Math.max(10, b.stake)) * 1.2));
      for (let j = 0; j < stack; j++) {
        const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 18), new THREE.MeshStandardMaterial({ color: j % 2 ? 0xf1e6c8 : b.c === 'red' ? 0xd04040 : b.c === 'black' ? 0x2b2b33 : 0x2f9a57, roughness: 0.5 }));
        chip.position.set(FIELD[b.c] + (k % 2) * 0.1 - 0.05, TABLE_H + 0.03 + j * 0.015, -0.12 + Math.floor(k / 2) * 0.11);
        chip.castShadow = true;
        this.chips.add(chip);
      }
    }
  }

  private drawSign(now: number): void {
    const { ctx: g, tex } = this.sign;
    const v = this.view;
    g.fillStyle = '#26332b';
    g.fillRect(0, 0, 768, 384);
    g.strokeStyle = '#d8b86a';
    g.lineWidth = 8;
    g.strokeRect(10, 10, 748, 364);
    g.fillStyle = '#f2e6c4';
    g.textAlign = 'center';
    g.font = 'bold 50px Rubik, system-ui, sans-serif';
    g.fillText('РУЛЕТКА РЫБАКА', 384, 74);
    g.font = '30px Rubik, system-ui, sans-serif';
    let line = 'E — поставить весь улов на цвет';
    let big = 'Красное ×2 · Чёрное ×2 · Зеро ×36';
    if (v?.phase === 'open') {
      line = `Приём ставок · ${Math.max(0, Math.ceil((this.phaseEnd - now) / 1000))} с`;
      big = v.bets.slice(0, 2).map((b) => `${b.nick}: ${ROULETTE_COLOR_NAMES[b.c]}`).join(' · ') + (v.bets.length > 2 ? ` · ещё ${v.bets.length - 2}` : '');
    } else if (v?.phase === 'spin' && this.spin) {
      line = 'Колесо крутится…';
      big = 'Ставки сделаны';
    } else if (v?.n !== undefined) {
      line = `Выпало ${v.n} · ${ROULETTE_COLOR_NAMES[rouletteColor(v.n)]}`;
      big = 'E — новая ставка';
    }
    g.fillText(line, 384, 160);
    g.font = 'bold 34px Rubik, system-ui, sans-serif';
    g.fillStyle = v?.n !== undefined && v.phase !== 'open' && !this.spin ? COLORS[rouletteColor(v.n)] === COLORS.black ? '#f2e6c4' : '#f08a7e' : '#e7c77a';
    g.fillText(big.length > 40 ? `${big.slice(0, 39)}…` : big, 384, 250);
    g.font = '24px Rubik, system-ui, sans-serif';
    g.fillStyle = '#b9c4ad';
    g.fillText('Проиграл — улов пропадает. Число выбирает сервер.', 384, 330);
    tex.needsUpdate = true;
  }
}
