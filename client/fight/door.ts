// Вход в «Fight Club» на набережной (выпуск 6): приямок в южной стене кафе «Чайка» — бетонные ступени вниз
// к клёпаной железной двери, над ней голая лампочка на проводе; на досках — FIGHT CLUB краской по трафарету, рядом
// картон с надписью маркером (режим, отсчёт, «идёт бой»), на настиле — круг мелом, на ступеньке — розовое мыло.
// Появляется, только если сервер прислал статус круга (режим включён флагом FIGHT): без флага набережная как была.
//
// Приямок — внутри бокса кафе, коллизии те же. Стену «прорезает» невидимая маска глубины: приямок рисуется первым
// (renderOrder −3), ореол лампы — за ним (−2), маска — плоскость в проёме, пишет только глубину (−1); стена кафе
// рисуется позже и в проёме не проходит тест глубины. Всё в приямке — непрозрачное (прозрачное маска бы спрятала),
// свет запечён в цвета вершин, лампа мигает — множителем цвета материала.
import * as THREE from 'three';
import { FC_CIRCLE, FC_DOOR, FC_FIGHTERS, FC_MODE_NAME, type FcStatus } from '../../shared/fight.ts';
import { BOTS_RULE, botsWord } from '../../shared/solobots.ts';
import { buildGeo, parts, type GeoParts, type V3 } from '../render/kit.ts';
import { canvas, cardboard, chalkCircle, roundRect, seeded, soapTexture, stencilTexture, texture, writeMarker } from './paint.ts';

const X0 = FC_DOOR.x - FC_DOOR.w / 2;
const X1 = FC_DOOR.x + FC_DOOR.w / 2;
const ZF = FC_DOOR.z;
const ZB = FC_DOOR.z - FC_DOOR.depth;
/** Потолок приямка — верх проёма */
const TOP = 2.25;
const RISE = 0.2;
const TREAD = 0.3;
const STEPS = 6;
/** Площадка у двери */
const LAND = -RISE * STEPS;
const BULB = new THREE.Vector3(FC_DOOR.x, 1.0, ZB + 0.5);
const WARM = new THREE.Color(1.0, 0.7, 0.4);
const DAY = new THREE.Color(0.7, 0.8, 0.95);
const AMB = 0.05;

/** Подсказки: у круга — что происходит, E — только там, где сервер примет нажатие (r + 0,5) */
export const FC_HINT_R = FC_CIRCLE.r + 1.3;
export const FC_USE_R = FC_CIRCLE.r + 0.4;

/** Своя желейка — до центра круга мелом по горизонтали (Infinity — не на настиле). */
export function fightDist(x: number, y: number, z: number): number {
  if (Math.abs(y) > 1.5) return Infinity;
  return Math.hypot(x - FC_CIRCLE.x, z - FC_CIRCLE.z);
}

/** Сколько бойцов-людей спустится: бойцами идут первые FC_FIGHTERS из круга, остальные — зрители (боты нужны, только если боец один). */
function fightersIn(st: FcStatus): number {
  return Math.min(st.names.length, FC_FIGHTERS[st.mode]);
}

/** Подсказка у двери «Fight Club» по статусу круга, своему нику и расстоянию до центра круга. */
export function fightHint(st: FcStatus, nick: string, d: number): { keys: string[]; text: string } | null {
  if (d > FC_HINT_R) return null;
  const mode = FC_MODE_NAME[st.mode];
  if (st.phase === 'fight') {
    return d <= FC_USE_R
      ? { keys: ['E'], text: `внизу идёт бой (${mode}) — спуститься посмотреть` }
      : { keys: [], text: 'Fight Club: внизу идёт бой — подойди к двери, чтобы посмотреть' };
  }
  if (d <= FC_CIRCLE.r) {
    if (st.phase !== 'count') return { keys: [], text: 'Fight Club: ты в круге — сейчас пойдёт отсчёт' };
    const idx = st.names.indexOf(nick);
    const crowd = idx >= FC_FIGHTERS[st.mode] ? ' · бойцов хватает — пойдёшь зрителем' : '';
    const bots = botsWord(fightersIn(st));
    if (st.host === nick) return { keys: ['E'], text: `режим: ${mode} — сменить · спуск через ${st.left} с · ${bots}${crowd}` };
    return { keys: [], text: `Спуск через ${st.left} с · ${mode} · ${bots} · режим выбирает ${st.host}${crowd}` };
  }
  if (st.phase === 'count') return { keys: [], text: `Fight Club: встань в круг — спуск через ${st.left} с · ${mode} · ${botsWord(fightersIn(st))}` };
  return { keys: [], text: `Fight Club: встань в круг мелом — бой начнётся сам · ${BOTS_RULE}` };
}

// ------------------------------------------------------------ запечённый свет приямка

const _c = new THREE.Color();

/** Цвет в точке: лампочка над дверью (тёплая), дневной свет из проёма (гаснет вглубь), чуть-чуть рассеянного. */
function lit(base: THREE.Color, x: number, y: number, z: number, n: V3, out: THREE.Color): THREE.Color {
  const dx = BULB.x - x;
  const dy = BULB.y - y;
  const dz = BULB.z - z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const d = Math.sqrt(d2) || 1;
  const lam = Math.max(0, (dx * n[0] + dy * n[1] + dz * n[2]) / d);
  const bulb = (2.4 * (0.25 + 0.75 * lam)) / (1 + 1.5 * d2);
  const depth = Math.max(0, ZF - z);
  const day = 0.5 * Math.exp(-depth * 1.25) * (0.55 + 0.45 * Math.max(0, n[2] + n[1] * 0.6)) * (0.5 + 0.5 * Math.min(1, (y + 1.2) / 3));
  return out.setRGB(
    base.r * (WARM.r * bulb + DAY.r * day + AMB),
    base.g * (WARM.g * bulb + DAY.g * day + AMB),
    base.b * (WARM.b * bulb + DAY.b * day + AMB),
  );
}

/**
 * Прямоугольник o + u·i + v·j, разбитый на nu × nv клеток (свет считается в каждой вершине). Нормаль — u × v.
 * tint — множитель цвета в точке (сырость, потёртости).
 */
function litQuad(p: GeoParts, o: V3, u: V3, v: V3, n: V3, base: number, nu: number, nv: number, tint?: (x: number, y: number, z: number) => number): void {
  const b = new THREE.Color(base);
  const start = p.pos.length / 3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const fu = i / nu;
      const fv = j / nv;
      const x = o[0] + u[0] * fu + v[0] * fv;
      const y = o[1] + u[1] * fu + v[1] * fv;
      const z = o[2] + u[2] * fu + v[2] * fv;
      p.pos.push(x, y, z);
      p.nor.push(n[0], n[1], n[2]);
      p.uv.push(fu, fv);
      lit(b, x, y, z, n, _c);
      const k = tint ? tint(x, y, z) : 1;
      p.col.push(_c.r * k, _c.g * k, _c.b * k);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = start + j * (nu + 1) + i;
      const bb = a + 1;
      const c = a + nu + 2;
      const d = a + nu + 1;
      p.idx.push(a, bb, c, a, c, d);
    }
  }
}

/** Коробка с запечённым светом (видимые грани: верх и четыре бока). */
function litBox(p: GeoParts, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, base: number): void {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  litQuad(p, [x0, y1, z1], [w, 0, 0], [0, 0, -d], [0, 1, 0], base, 1, 1);
  litQuad(p, [x0, y0, z1], [w, 0, 0], [0, h, 0], [0, 0, 1], base, 1, 1);
  litQuad(p, [x1, y0, z0], [-w, 0, 0], [0, h, 0], [0, 0, -1], base, 1, 1);
  litQuad(p, [x0, y0, z0], [0, 0, d], [0, h, 0], [-1, 0, 0], base, 1, 1);
  litQuad(p, [x1, y0, z1], [0, 0, -d], [0, h, 0], [1, 0, 0], base, 1, 1);
}

/** Сырость: пятна по стене, темнее снизу */
function damp(seed: number): (x: number, y: number, z: number) => number {
  const r = seeded(seed);
  const blots = Array.from({ length: 7 }, () => ({ x: X0 + r() * (X1 - X0), y: LAND + r() * (TOP - LAND), z: ZB + r() * (ZF - ZB), s: 0.25 + r() * 0.5 }));
  return (x, y, z) => {
    let k = 0.82 + 0.18 * Math.min(1, (y - LAND) / 1.6);
    for (const b of blots) {
      const q = ((x - b.x) ** 2 + (y - b.y) ** 2 + (z - b.z) ** 2) / (b.s * b.s);
      if (q < 1) k *= 0.86 + 0.14 * q;
    }
    return k;
  };
}

// ------------------------------------------------------------ дверь

/** Клёпаная железная дверь: тёмно-зелёная краска, ржавые потёки, заслонка глазка, ручка. */
function doorTexture(): THREE.CanvasTexture {
  const W = 256;
  const H = 512;
  const [c, ctx] = canvas(W, H);
  const r = seeded(19);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#46564d');
  g.addColorStop(1, '#33403a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // филёнки
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 30, W - 44, H * 0.42);
  ctx.strokeRect(22, H * 0.52, W - 44, H * 0.42);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.strokeRect(25, 33, W - 44, H * 0.42);
  ctx.strokeRect(25, H * 0.52 + 3, W - 44, H * 0.42);
  // заклёпки по краю и по филёнкам
  const rivet = (x: number, y: number) => {
    ctx.fillStyle = '#25302b';
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(x - 1.2, y - 1.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let y = 14; y < H; y += 26) {
    rivet(9, y);
    rivet(W - 9, y);
  }
  for (let x = 9; x < W; x += 26) {
    rivet(x, 9);
    rivet(x, H - 9);
  }
  // заслонка глазка
  ctx.fillStyle = '#222a26';
  roundRect(ctx, W / 2 - 40, 120, 80, 22, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(W / 2 - 38, 121, 76, 3);
  // ручка-скоба
  ctx.fillStyle = '#1c1f1d';
  roundRect(ctx, W - 58, H * 0.47, 16, 64, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(W - 55, H * 0.47 + 4, 3, 56);
  // ржавые потёки и царапины
  for (let i = 0; i < 16; i++) {
    const x = r() * W;
    const y = r() * H * 0.9;
    const len = 30 + r() * 140;
    const gr = ctx.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, `rgba(122,70,36,${0.25 + r() * 0.35})`);
    gr.addColorStop(1, 'rgba(122,70,36,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x, y, 2 + r() * 5, len);
  }
  ctx.strokeStyle = 'rgba(190,200,190,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    const x = r() * W;
    const y = r() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12);
    ctx.stroke();
  }
  // низ облез до металла
  const gb = ctx.createLinearGradient(0, H * 0.85, 0, H);
  gb.addColorStop(0, 'rgba(60,40,25,0)');
  gb.addColorStop(1, 'rgba(60,40,25,0.55)');
  ctx.fillStyle = gb;
  ctx.fillRect(0, H * 0.85, W, H * 0.15);
  return texture(c);
}

// ------------------------------------------------------------ вход целиком

const BOARD_W = 0.95;
const BOARD_H = 0.72;

export class FightDoor {
  readonly group = new THREE.Group();
  /** Всё запечённое в приямке: мигает вместе с лампой (множитель цвета) */
  private readonly recessMat: THREE.MeshBasicMaterial;
  private readonly doorMat: THREE.MeshBasicMaterial;
  private readonly bulbMat: THREE.MeshBasicMaterial;
  private readonly glow: THREE.Sprite;
  private readonly crackMat: THREE.MeshBasicMaterial;
  private readonly bulbRig = new THREE.Group();
  private readonly boardCtx: CanvasRenderingContext2D;
  private readonly boardTex: THREE.CanvasTexture;
  private readonly chalkCtx: CanvasRenderingContext2D;
  private readonly chalkTex: THREE.CanvasTexture;
  private boardKey = '';
  private chalkKey = '';
  /** Внизу идёт бой: из-под двери пробивается свет ярче */
  private fighting = false;

  constructor(scene: THREE.Scene) {
    const p = parts();
    const W = X1 - X0;
    const H = TOP - LAND;
    const D = ZF - ZB;
    const wet = damp(4);
    // ступени: подступенок (лицом к проёму) и проступь; у кромки — светлая стёртая полоса
    for (let i = 0; i < STEPS; i++) {
      const zf = ZF - i * TREAD;
      const yTop = -(i + 1) * RISE;
      const len = i === STEPS - 1 ? zf - ZB : TREAD;
      litQuad(p, [X0, yTop, zf], [W, 0, 0], [0, RISE, 0], [0, 0, 1], 0x7f7d72, 4, 1, wet);
      litQuad(p, [X0, yTop, zf], [W, 0, 0], [0, 0, -len], [0, 1, 0], i === STEPS - 1 ? 0x77766c : 0x8d8a7e, 4, Math.max(1, Math.round(len / 0.15)), wet);
      litQuad(p, [X0 + 0.03, yTop + 0.003, zf], [W - 0.06, 0, 0], [0, 0, -0.045], [0, 1, 0], 0xa9a596, 3, 1);
    }
    // боковые стены, потолок, задняя стена
    litQuad(p, [X0, LAND, ZF], [0, 0, -D], [0, H, 0], [1, 0, 0], 0x8a887c, 10, 12, wet);
    litQuad(p, [X1, LAND, ZB], [0, 0, D], [0, H, 0], [-1, 0, 0], 0x8a887c, 10, 12, damp(9));
    litQuad(p, [X0, TOP, ZB], [W, 0, 0], [0, 0, D], [0, -1, 0], 0x6f6e66, 4, 8);
    litQuad(p, [X0, LAND, ZB], [W, 0, 0], [0, H, 0], [0, 0, 1], 0x84837a, 6, 12, damp(13));
    // рама двери (стальной уголок) и порожек
    const dx0 = FC_DOOR.x - 0.5;
    const dx1 = FC_DOOR.x + 0.5;
    litBox(p, dx0 - 0.06, LAND, ZB, dx0, LAND + 2.08, ZB + 0.06, 0x3a3d3a);
    litBox(p, dx1, LAND, ZB, dx1 + 0.06, LAND + 2.08, ZB + 0.06, 0x3a3d3a);
    litBox(p, dx0 - 0.06, LAND + 2.02, ZB, dx1 + 0.06, LAND + 2.1, ZB + 0.06, 0x3a3d3a);
    litBox(p, dx0, LAND, ZB, dx1, LAND + 0.03, ZB + 0.1, 0x4a4a44);
    // труба в углу и короб проводки по потолку к лампе
    litBox(p, X1 - 0.13, LAND, ZB + 0.04, X1 - 0.04, TOP, ZB + 0.13, 0x5a5e58);
    litBox(p, FC_DOOR.x - 0.025, TOP - 0.04, ZB + 0.1, FC_DOOR.x + 0.025, TOP, ZF - 0.05, 0x4c4f4a);
    // лужа на площадке: темнее и холоднее к середине (непрозрачная — маска прозрачное спрятала бы)
    puddle(p, FC_DOOR.x - 0.25, LAND + 0.004, ZB + 0.55, 0.42, 0.28);
    this.recessMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const recess = new THREE.Mesh(buildGeo(p), this.recessMat);
    recess.renderOrder = -3;
    this.group.add(recess);

    // дверь: краска с потёками; свет — запечённый градиент в цвете вершин (лампа над ней)
    const dg = new THREE.PlaneGeometry(1.0, 2.02, 2, 6);
    const pos = dg.getAttribute('position');
    const cols = new Float32Array(pos.count * 3);
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < pos.count; i++) {
      lit(white, FC_DOOR.x + pos.getX(i), LAND + 1.01 + pos.getY(i), ZB + 0.012, [0, 0, 1], _c);
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    dg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.doorMat = new THREE.MeshBasicMaterial({ map: doorTexture(), vertexColors: true });
    const door = new THREE.Mesh(dg, this.doorMat);
    door.position.set(FC_DOOR.x, LAND + 1.01, ZB + 0.012);
    door.renderOrder = -3;
    this.group.add(door);
    // щель под дверью: тёплый свет из подвала
    this.crackMat = new THREE.MeshBasicMaterial({ color: 0xffb050, toneMapped: false });
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.018), this.crackMat);
    crack.position.set(FC_DOOR.x, LAND + 0.042, ZB + 0.016);
    crack.renderOrder = -3;
    this.group.add(crack);

    // розовое мыло на верхней ступеньке
    const soapTex = soapTexture();
    const pink = new THREE.MeshBasicMaterial({ color: 0xd9849c });
    const soap = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.1), [pink, pink, new THREE.MeshBasicMaterial({ map: soapTex, color: 0xd6c4c8 }), pink, pink, pink]);
    soap.position.set(X0 + 0.32, -RISE + 0.03, ZF - 0.14);
    soap.rotation.y = 0.35;
    soap.renderOrder = -3;
    this.group.add(soap);

    // голая лампочка на проводе
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, TOP - BULB.y - 0.1, 4), new THREE.MeshBasicMaterial({ color: 0x141414 }));
    wire.position.y = -(TOP - BULB.y - 0.1) / 2;
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 8), new THREE.MeshBasicMaterial({ color: 0x1e1e1e }));
    socket.position.y = -(TOP - BULB.y) + 0.07;
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), this.bulbMat);
    bulb.position.y = -(TOP - BULB.y);
    for (const m of [wire, socket, bulb]) m.renderOrder = -3;
    this.bulbRig.position.set(BULB.x, TOP, BULB.z);
    this.bulbRig.add(wire, socket, bulb);
    this.group.add(this.bulbRig);
    // ореол — в непрозрачном проходе, сразу после приямка и до маски (прозрачное маска бы закрыла)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowMap(), color: 0xffc070, transparent: false, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glow.scale.setScalar(1.1);
    this.glow.position.copy(BULB);
    this.glow.renderOrder = -2;
    this.group.add(this.glow);

    // маска глубины в проёме: стена кафе здесь не рисуется
    const mask = new THREE.Mesh(new THREE.PlaneGeometry(W, TOP), new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }));
    mask.position.set(FC_DOOR.x, TOP / 2, ZF + 0.01);
    mask.renderOrder = -1;
    this.group.add(mask);

    // снаружи: FIGHT CLUB по трафарету над проёмом — краска на досках, свет как у стены
    const title = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.66), new THREE.MeshStandardMaterial({
      map: stencilTexture('FIGHT CLUB', 1024, 250, '#221c19', 7, 0), transparent: true, depthWrite: false, roughness: 0.85,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    title.position.set(FC_DOOR.x - 0.08, 2.86, ZF + 0.008);
    title.rotation.z = -0.04;
    this.group.add(title);

    // картон на гвоздях слева от проёма
    const [bc, bctx] = canvas(512, 388);
    this.boardCtx = bctx;
    this.boardTex = texture(bc);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshStandardMaterial({
      map: this.boardTex, alphaTest: 0.5, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    board.position.set(X0 - 0.72, 1.42, ZF + 0.014);
    board.rotation.z = 0.035;
    this.group.add(board);

    // круг мелом на настиле
    const [cc, cctx] = canvas(512, 512);
    this.chalkCtx = cctx;
    this.chalkTex = texture(cc);
    const size = FC_CIRCLE.r * 2 / 0.92;
    const chalk = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({
      map: this.chalkTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }));
    chalk.rotation.x = -Math.PI / 2;
    chalk.position.set(FC_CIRCLE.x, 0.013, FC_CIRCLE.z);
    chalk.receiveShadow = true;
    this.group.add(chalk);

    this.setStatus({ phase: 'idle', mode: 'duel', left: 0, names: [], host: '', round: 0, score: [] });
    scene.add(this.group);
  }

  setStatus(st: FcStatus): void {
    this.fighting = st.phase === 'fight';
    const lines = boardLines(st);
    const key = lines.join('|');
    if (key !== this.boardKey) {
      this.boardKey = key;
      drawBoard(this.boardCtx, lines);
      this.boardTex.needsUpdate = true;
    }
    const chalkKey = FC_MODE_NAME[st.mode];
    if (chalkKey !== this.chalkKey) {
      this.chalkKey = chalkKey;
      chalkCircle(this.chalkCtx, 512, chalkKey.toUpperCase());
      this.chalkTex.needsUpdate = true;
    }
  }

  /** Лампа покачивается и иногда мигает; щель под дверью ярче, пока внизу дерутся. */
  update(t: number): void {
    this.bulbRig.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.bulbRig.rotation.x = Math.sin(t * 0.63 + 1) * 0.04;
    const k = flicker(t);
    this.recessMat.color.setScalar(k);
    this.doorMat.color.setScalar(k);
    this.bulbMat.color.setRGB(k, k * 0.94, k * 0.78);
    this.glow.material.opacity = 0.55 * k * k;
    const pulse = this.fighting ? 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 2.3) : 0.35;
    this.crackMat.color.setRGB(pulse, pulse * 0.68, pulse * 0.3);
  }
}

/** Мигание голой лампочки: почти всё время ровно, раз в несколько секунд — короткая серия провалов. */
function flicker(t: number): number {
  const seg = Math.floor(t / 0.11);
  const h = Math.sin(seg * 12.9898 + 78.233) * 43758.5453;
  const n = h - Math.floor(h);
  const burst = Math.sin(t * 0.37) > 0.93 || Math.sin(t * 0.21 + 2) > 0.97;
  if (burst && n < 0.45) return 0.35 + n;
  return 0.97 + 0.03 * Math.sin(t * 23);
}

/** Лужа: круг вершинных цветов, середина темнее и холоднее, край — как пол (светом — как пол рядом). */
function puddle(p: GeoParts, x: number, y: number, z: number, rx: number, rz: number): void {
  const floor = new THREE.Color(0x77766c);
  const wetC = new THREE.Color(0x2c3436);
  const n: V3 = [0, 1, 0];
  const start = p.pos.length / 3;
  const segs = 20;
  p.pos.push(x, y, z);
  p.nor.push(0, 1, 0);
  p.uv.push(0.5, 0.5);
  lit(wetC, x, y, z, n, _c);
  p.col.push(_c.r * 1.25, _c.g * 1.25, _c.b * 1.35);
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const wob = 1 + 0.18 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 5);
    const vx = x + Math.cos(a) * rx * wob;
    const vz = z + Math.sin(a) * rz * wob;
    p.pos.push(vx, y, vz);
    p.nor.push(0, 1, 0);
    p.uv.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
    lit(floor, vx, y, vz, n, _c);
    p.col.push(_c.r * 0.82, _c.g * 0.82, _c.b * 0.82);
  }
  for (let i = 0; i < segs; i++) p.idx.push(start, start + 1 + ((i + 1) % segs), start + 1 + i);
}

let glowTex: THREE.CanvasTexture | null = null;
function glowMap(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = texture(c);
  return glowTex;
}

/** Что написано на картоне маркером: три строки. */
export function boardLines(st: FcStatus): string[] {
  const mode = FC_MODE_NAME[st.mode];
  if (st.phase === 'fight') {
    const score = st.mode === 'ffa' ? `стоят: ${st.score[0] ?? 0}` : `счёт ${st.score[0] ?? 0} : ${st.score[1] ?? 0}`;
    return ['ИДЁТ БОЙ', `${mode} · раунд ${Math.max(1, st.round)}`, score];
  }
  if (st.phase === 'count') {
    return [`СПУСК ЧЕРЕЗ ${st.left}`, `режим: ${mode}`, `в круге: ${st.names.length} · ${botsWord(fightersIn(st))} · выбирает ${st.host}`];
  }
  return ['СЕГОДНЯ БОЙ', 'встань в круг', `${mode} · ${BOTS_RULE}`];
}

function drawBoard(ctx: CanvasRenderingContext2D, lines: string[]): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  cardboard(ctx, W, H, 3);
  writeMarker(ctx, lines[0], W / 2, H * 0.27, 70, '#1a1410', W * 0.86, 2);
  writeMarker(ctx, lines[1], W / 2, H * 0.55, 42, '#1a1410', W * 0.86, 5);
  writeMarker(ctx, lines[2], W / 2, H * 0.77, 34, '#5a1a14', W * 0.88, 8);
  // гвозди по углам
  for (const [x, y] of [[26, 22], [W - 26, 24], [24, H - 22], [W - 28, H - 20]]) {
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
