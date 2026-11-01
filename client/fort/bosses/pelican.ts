// Пеликан-Бомбардир — летающий босс (концепт: concepts/flyer-a-pelican-pilot.png). Воздушный бомбардировщик Барона Варенья:
// кремовые перья, тёмно-бурые концы крыльев, огромный оранжевый клюв, розовый зоб, набитый бочонками варенья, кожаный шлем
// лётчика с латунными очками, длинный красный шарф, тяжёлые сиреневые веки — вечно недоволен.
// Главная примета — зоб: в нём бомбы (видно, как он раздувается перед бомбёжкой), туда же он хватает игрока со стены.
// Когда зоб открыт и светится голубым (устал после пике, несёт игрока) — бей в зоб: бомбы рвутся у него в клюве.
// Фазы — по высоте: 1 — кружит высоко и бомбит ход стены, пикирует за игроками; 2 — подбит (повязка на крыле), летает
// ниже, садится на бастион, клюёт башню и сдувает игроков крыльями; 3 — сбит: падает, дальше ходит пешком вразвалку
// и щёлкает клювом по воротам. Гибель — кувырком на спину, лапы кверху, очки слетают.
import * as THREE from 'three';
import { colored, merge } from '../mobs/kit.ts';
import {
  HIDE, attach, ball, clamp01, composeInto, heartbeat, jamDrip, jamSpot, keys, lathe, lerp, lump, paint, smooth, tube, win, wobble,
  type Geo, type V3,
} from '../mobs/set-d-shapes.ts';
import { jitter, type BossClip, type BossDef, type BossPart } from './bosskit.ts';

export const PS = { FLY: 0, BOMB: 1, DIVE: 2, OPEN: 3, PERCH: 4, PECK: 5, GUST: 6, PHASE: 7, CRASH: 8, GROUND: 9, SNAP: 10 } as const;
const WARN = 1.8;

// ------------------------------------------------------------ размеры (корень — земля под лапами, клюв — +Z)

const BODY: V3 = [0, 2.25, 0];
const SHOULDER: V3 = [0.72, 0.42, 0.5];
const NECK: V3 = [0, 0.5, 1.2];
const N1 = 0.95;
const N2 = 0.85;
const HIP: V3 = [0.45, -0.8, -0.15];
const W1 = 1.75;
const W2 = 1.55;

// ------------------------------------------------------------ цвета

const CREAM = 0xf1e9da;
const CREAM_DK = 0xd8cdb9;
const BROWN = 0x4e3a2c;
const BROWN_MID = 0x8a6a4f;
const BEAK = 0xf2a04c;
const BEAK_DK = 0xd9773a;
const POUCH = 0xf7b4a0;
const POUCH_DK = 0xec9583;
const LEATHER = 0x7a4a2c;
const LEATHER_DK = 0x5a3420;
const BRASS = 0xd6a24a;
const GLASS = 0xcfe3e6;
const SCARF = 0xc8323c;
const SCARF_DK = 0x9a2230;
const LEG = 0xf08b3a;
const LEG_DK = 0xcf6a24;
const EYE = 0x9a50f0;

// ------------------------------------------------------------ геометрия

function bodyGeo(): Geo {
  // туловище — тело вращения вдоль Z: грудь круглая и высокая, к хвосту сужается; перья рядами
  const prof: Array<[number, number]> = [[0.001, -1.75], [0.45, -1.55], [0.8, -1.0], [0.98, -0.2], [1.0, 0.45], [0.88, 1.1], [0.55, 1.5], [0.001, 1.62]];
  const g = lathe(prof, 16, 16);
  g.rotateX(Math.PI / 2);
  g.scale(0.95, 0.92, 1);
  const body = paint(g, (x, y, z, c) => {
    c.setHex(y > -0.2 ? CREAM : CREAM_DK);
    const row = Math.sin(z * 7 + Math.abs(x) * 3);
    if (row > 0.7 && y > -0.5) c.offsetHSL(0, 0, -0.05);
  });
  // пушистая грудка-манишка и пятна варенья
  const ruff = paint(new THREE.SphereGeometry(0.62, 10, 7).scale(1.1, 1.0, 0.7).translate(0, 0.15, 1.25), (_x, y, _z, c) => c.setHex(y > 0.3 ? CREAM : 0xfaf4ea));
  const spots = [jamSpot(0.28, [0.82, 0.25, 0.55], [0.9, 0.3, 0.2], 1), jamSpot(0.22, [-0.6, -0.55, -0.6], [-0.7, -0.6, 0], 2), jamSpot(0.18, [0.2, 0.8, -0.8], [0.1, 1, 0], 3)];
  const drip = jamDrip(0.35, 0.07).translate(0.85, 0.1, 0.6);
  return merge([body, ruff, ...spots, drip]);
}

function tailGeo(): Geo {
  // веер хвоста: семь перьев, к концу — бурые
  const parts: Geo[] = [];
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) / 3) * 0.55;
    const f = new THREE.SphereGeometry(1, 8, 4).scale(0.17, 0.05, 0.62).translate(0, 0, -0.55);
    const p = paint(f, (_x, _y, z, c) => c.setHex(z < -0.85 ? BROWN_MID : CREAM_DK));
    p.rotateY(a).translate(0, 0.01 * i, 0);
    parts.push(p);
  }
  return merge(parts);
}

function neck1Geo(): Geo {
  const n = paint(tube([[0, -0.1, 0], [0, N1 * 0.5, 0.04], [0, N1 + 0.06, 0]], (u) => 0.44 - 0.12 * u, 6, 10), (_x, _y, z, c) => c.setHex(z > 0.2 ? 0xfaf4ea : CREAM));
  // красный шарф: валик вокруг шеи и узел спереди
  const collar = colored(new THREE.TorusGeometry(0.43, 0.13, 6, 14).rotateX(Math.PI / 2).translate(0, 0.12, 0), SCARF);
  const knot = ball(0.17, SCARF_DK, [0, 0.05, 0.45], [1.2, 1, 0.8], 7, 5);
  return merge([n, collar, knot]);
}

function neck2Geo(): Geo {
  return paint(tube([[0, -0.08, 0], [0, N2 * 0.5, 0.03], [0, N2 + 0.05, 0]], (u) => 0.33 - 0.03 * u, 6, 10), (_x, _y, z, c) => c.setHex(z > 0.15 ? 0xfaf4ea : CREAM));
}

/** Голова: череп, шлем лётчика с ушами и ремешком, брови, верхний клюв с крючком; начало координат — сустав шеи */
function headGeo(): Geo {
  const parts: Geo[] = [];
  parts.push(paint(new THREE.SphereGeometry(0.55, 14, 10).scale(0.88, 0.92, 1.1).translate(0, 0.3, 0.2), (_x, y, z, c) => c.setHex(z > 0.45 && y < 0.25 ? 0xfaf4ea : CREAM)));
  // шлем: кожаная шапочка сверху и сзади, шов по темени, уши-клапаны, ремешок под клювом
  const cap = new THREE.SphereGeometry(0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.9, 0.9, 1.05).rotateX(-0.35).translate(0, 0.36, 0.1);
  parts.push(paint(cap, (x, y, z, c) => {
    c.setHex(LEATHER);
    c.offsetHSL(0, 0, 0.05 * lump(x * 4, y * 4, z * 4, 2));
  }));
  parts.push(colored(tube([[0, 0.98, 0.4], [0, 1.0, 0.05], [0, 0.85, -0.3], [0, 0.55, -0.45]], () => 0.045, 10, 4), LEATHER_DK));
  for (const s of [-1, 1]) {
    const flap = new THREE.SphereGeometry(0.26, 9, 6).scale(0.35, 1.1, 0.8).translate(s * 0.47, 0.12, 0.05);
    parts.push(colored(flap, LEATHER));
    parts.push(colored(tube([[s * 0.45, -0.05, 0.12], [s * 0.3, -0.18, 0.42], [0, -0.16, 0.55]], () => 0.035, 6, 3), LEATHER_DK));
    // брови: густые, нахмуренные (внутренний край ниже)
    const brow = new THREE.BoxGeometry(0.34, 0.09, 0.14).rotateZ(s * 0.32).rotateY(-s * 0.5).translate(s * 0.31, 0.62, 0.55);
    parts.push(colored(brow, 0xb9ad98));
  }
  // верхний клюв: длинный, плоский, к концу тоньше, с красным крючком; бороздка по бокам
  const beak = tube([[0, 0.34, 0.5], [0, 0.31, 1.1], [0, 0.24, 1.8], [0, 0.17, 2.35], [0, 0.1, 2.55]], (u) => 0.24 - 0.13 * u, 14, 8);
  const bp = beak.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const z = bp.getZ(i);
    const yc = 0.34 - (z - 0.5) * 0.11;
    bp.setX(i, bp.getX(i) * 1.55);
    bp.setY(i, yc + (bp.getY(i) - yc) * 0.5);
  }
  beak.computeVertexNormals();
  parts.push(paint(beak, (_x, y, z, c) => c.setHex(z > 2.35 ? 0xd9533a : y > 0.34 - (z - 0.5) * 0.11 + 0.02 ? BEAK : BEAK_DK)));
  parts.push(paint(tube([[0, 0.13, 2.45], [0, 0.04, 2.65], [0, -0.1, 2.68]], (u) => 0.08 - 0.05 * u, 5, 5), (_x, _y, _z, c) => c.setHex(0xd9533a)));
  // ноздря и пятно варенья на клюве
  parts.push(jamSpot(0.12, [0.15, 0.4, 1.6], [0.3, 1, 0], 4));
  return merge(parts);
}

function eyesGeo(): Geo {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.15, 10, 8).scale(0.7, 1, 1).rotateY(s * 0.6).translate(s * 0.36, 0.42, 0.47);
    parts.push(colored(e, EYE));
  }
  return merge(parts);
}

/** Тяжёлые веки: верхняя половина у каждого глаза; поворот вокруг оси глаз (0 — полуприкрыты, ворчливо) */
function lidsGeo(): Geo {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const lid = new THREE.SphereGeometry(0.17, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.75, 1, 1.05).rotateX(0.35);
    lid.rotateY(s * 0.6).translate(s * 0.36, 0, 0);
    parts.push(colored(lid, CREAM_DK));
  }
  return merge(parts);
}

/** Очки: латунные ободки, стёкла, ремешок вокруг шлема; построены опущенными на глаза, ось — центр шлема */
const GOG_PIVOT: V3 = [0, 0.3, 0.15];
function gogglesGeo(): Geo {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) {
    const at: V3 = [s * 0.3, 0.44, 0.62];
    const rim = new THREE.TorusGeometry(0.17, 0.05, 6, 14).rotateY(s * 0.45).translate(at[0], at[1], at[2]);
    parts.push(colored(rim, BRASS));
    const lens = new THREE.CircleGeometry(0.15, 12).rotateY(s * 0.45).translate(at[0] + s * 0.02, at[1], at[2] + 0.02);
    parts.push(paint(lens, (x, y, _z, c) => c.setHex(y - at[1] > 0.05 - 0.2 * (x - at[0]) ? 0xffffff : GLASS)));
  }
  parts.push(colored(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 5).rotateZ(Math.PI / 2).translate(0, 0.44, 0.7), BRASS));
  const strap = new THREE.TorusGeometry(0.56, 0.05, 4, 20).scale(1, 1, 1.12).rotateX(Math.PI / 2 - 0.3).translate(GOG_PIVOT[0], GOG_PIVOT[1] + 0.12, GOG_PIVOT[2] + 0.02);
  parts.push(colored(strap, LEATHER_DK));
  return merge(parts).translate(-GOG_PIVOT[0], -GOG_PIVOT[1], -GOG_PIVOT[2]);
}

/** Нижний клюв (две тонкие ветви); начало — шарнир у основания клюва */
const JAW: V3 = [0, 0.2, 0.55];
function jawGeo(): Geo {
  const parts: Geo[] = [];
  for (const s of [-1, 1]) parts.push(colored(tube([[s * 0.22, 0, 0], [s * 0.2, -0.02, 0.7], [s * 0.1, -0.04, 1.5], [0, -0.06, 2.05]], (u) => 0.06 - 0.02 * u, 10, 4), BEAK_DK));
  return merge(parts);
}

/** Зоб: розовый мешок под нижним клювом, бугры от бочонков; верх открыт по линии клюва */
function pouchGeo(): Geo {
  const g = new THREE.SphereGeometry(1, 16, 12);
  const p = g.getAttribute('position');
  const bumps: V3[] = [[0.25, -0.25, 0.55], [-0.28, -0.35, 0.95], [0.22, -0.45, 1.35], [-0.18, -0.55, 0.65]];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 0.3;
    let y = p.getY(i) * 0.48 - 0.28;
    let z = p.getZ(i) * 0.95 + 1.0;
    if (y > -0.03) y = -0.03 + (y + 0.03) * 0.15;
    // провис: ниже к середине длины
    y -= 0.14 * Math.max(0, Math.sin(((z - 0.05) / 1.9) * Math.PI)) * (y < -0.15 ? 1 : 0.3);
    for (const [bx, by, bz] of bumps) {
      const d2 = (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2;
      const k = Math.exp(-d2 / 0.05) * 0.1;
      x += Math.sign(x || 1) * k;
      y -= k * 0.6;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const pouch = paint(g, (x, y, z, c) => {
    c.setHex(y < -0.5 ? POUCH_DK : POUCH);
    c.offsetHSL(0, 0, 0.03 * lump(x * 5, y * 5, z * 3, 1));
  });
  const stains = [jamSpot(0.18, [0.33, -0.45, 0.8], [1, -0.3, 0], 1), jamSpot(0.14, [-0.3, -0.6, 1.3], [-1, -0.4, 0], 2)];
  const drips = [jamDrip(0.3, 0.06).translate(0.12, -0.92, 0.95), jamDrip(0.18, 0.05).translate(-0.1, -0.85, 1.25)];
  return merge([pouch, ...stains, ...drips]);
}

const BOMB_AT: V3[] = [[-0.1, -0.12, 0.45], [0.12, -0.15, 0.8], [-0.08, -0.12, 1.15], [0.1, -0.1, 1.45]];
function bombsGeo(): Geo {
  const parts: Geo[] = [];
  BOMB_AT.forEach(([x, y, z], i) => {
    parts.push(paint(new THREE.SphereGeometry(0.19, 10, 7).translate(x, y, z), (_x, yy, _z, c) => c.setHex(yy > y + 0.1 ? 0x8a3fb0 : 0x5a1a6e)));
    parts.push(colored(tube([[x, y + 0.17, z], [x + 0.04, y + 0.27, z + 0.03 * (i % 2 ? 1 : -1)], [x + 0.02, y + 0.33, z]], () => 0.025, 3, 3), 0xc8ad7a));
  });
  return merge(parts);
}

function coreGeo(): Geo {
  const lo = new THREE.Color(0x0aa6c4);
  const hi = new THREE.Color(0x8af6ff);
  return merge(BOMB_AT.map(([x, y, z]) => paint(new THREE.SphereGeometry(0.23, 10, 7).translate(x, y, z), (_x, yy, _z, c) => c.copy(lo).lerp(hi, clamp01(0.5 + (yy - y) * 3)))));
}

/** Крыло: внутреннее звено (плечо) вдоль ±X от плеча, s — сторона (+1 левое) */
function wingPanel(s: number, len: number, chord0: number, chord1: number, lead0: number, lead1: number, thick: number, color: (u: number, v: number, c: THREE.Color) => void): Geo {
  // крыло — профиль, а не доска: скруглённая толстая передняя кромка, тонкая задняя, выпуклый верх, плоский низ;
  // по размаху — сечения, концы прикрыты перьями
  const NU = 8;
  const NV = 9;
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const row = (u: number, v: number, top: boolean): void => {
    const chord = lerp(chord0, chord1, u);
    const lead = lerp(lead0, lead1, u) - 0.12 * Math.sin(Math.PI * u) * (1 - u);
    const th = thick * (1 - 0.45 * u);
    const z = lead - v * chord;
    // верх: толстый у кромки (sqrt), к хвосту сходит на нет; низ — чуть вогнут
    const yt = th * (1.3 * Math.sqrt(Math.max(v, 1e-4)) * (1 - v) + 0.02);
    const yb = -th * (0.35 * Math.sqrt(Math.max(v, 1e-4)) * (1 - v) * (1 - 1.6 * v));
    pos.push(s * u * len, top ? yt : yb, z);
    color(u, v, c);
    if (!top) c.multiplyScalar(0.9);
    col.push(c.r, c.g, c.b);
  };
  const tri: number[] = [];
  const idx = (i: number, j: number, top: boolean): number => (top ? 0 : (NU + 1) * (NV + 1)) + i * (NV + 1) + j;
  for (const top of [true, false]) for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) row(i / NU, (j / NV) ** 1.3, top);
  for (const top of [true, false]) {
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const p = idx(i, j, top);
        const q = idx(i + 1, j, top);
        const r = idx(i + 1, j + 1, top);
        const w = idx(i, j + 1, top);
        // обход: верх смотрит вверх, низ — вниз; у зеркального крыла (s < 0) — наоборот
        if (top === s > 0) tri.push(p, q, w, q, r, w);
        else tri.push(p, w, q, q, w, r);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(tri);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Перо-пластина: от точки at вдоль направления (dx, dz) в плоскости крыла */
function feather(at: V3, dx: number, dz: number, len: number, w: number, hex: number, hexTip: number): Geo {
  const f = new THREE.SphereGeometry(1, 8, 4).scale(w, 0.035, len / 2).translate(0, 0, len / 2);
  const g = paint(f, (_x, _y, z, c) => c.setHex(z > len * 0.62 ? hexTip : hex));
  g.rotateY(Math.atan2(dx, dz)).translate(at[0], at[1], at[2]);
  return g;
}

function wing1Geo(s: number): Geo {
  const panel = wingPanel(s, W1, 1.65, 1.4, 0.4, 0.3, 0.3, (u, v, c) => {
    // кроющие перья рядами-чешуёй, ближе к задней кромке — серее
    c.setHex(v > 0.62 ? CREAM_DK : CREAM);
    const scallop = Math.abs(Math.sin(u * 11 + (v > 0.35 ? 1.6 : 0)));
    if ((v > 0.22 && v < 0.3) || (v > 0.45 && v < 0.52)) c.offsetHSL(0, 0, -0.07 * scallop);
  });
  const parts: Geo[] = [panel];
  // маховые второго порядка — по задней кромке
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6;
    const z = lerp(0.4, 0.3, u) - lerp(1.65, 1.4, u) + 0.15;
    parts.push(feather([s * u * W1, 0.0, z], s * 0.12, -1, 0.85, 0.2, i % 2 ? CREAM_DK : 0xcfc3ad, BROWN_MID));
  }
  parts.push(jamSpot(0.2, [s * 0.9, 0.12, -0.3], [0, 1, 0], 5));
  return merge(parts);
}

function wing2Geo(s: number): Geo {
  const panel = wingPanel(s, W2, 1.35, 0.85, 0.3, 0.1, 0.2, (u, v, c) => {
    c.setHex(u > 0.55 || v > 0.62 ? BROWN : u > 0.3 ? BROWN_MID : CREAM);
    if (v > 0.3 && v < 0.38) c.offsetHSL(0, 0, -0.05);
  });
  const parts: Geo[] = [panel];
  // первостепенные маховые — «пальцы» веером на конце
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    const ang = lerp(0.15, 1.35, k);
    const at: V3 = [s * (W2 - 0.1 - 0.25 * k), 0, lerp(0.05, -0.6, k)];
    parts.push(feather(at, s * Math.cos(ang), -Math.sin(ang), lerp(1.25, 0.95, k), 0.15, BROWN, 0x3a2a20));
  }
  for (let i = 0; i < 4; i++) {
    const u = (i + 0.5) / 5;
    parts.push(feather([s * u * W2, 0, lerp(0.3, 0.1, u) - lerp(1.35, 0.85, u) + 0.12], s * 0.2, -1, 0.6, 0.18, BROWN_MID, BROWN));
  }
  return merge(parts);
}

/** Повязка на левом крыле — с 2-й фазы (подбит) */
function patchGeo(): Geo {
  return merge([
    colored(new THREE.BoxGeometry(0.95, 0.04, 0.24).rotateY(0.6).translate(0.95, 0.17, -0.35), 0xfbf7ec),
    colored(new THREE.BoxGeometry(0.95, 0.04, 0.24).rotateY(-0.6).translate(0.95, 0.18, -0.35), 0xf1ebdc),
    colored(new THREE.TorusGeometry(0.36, 0.06, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 1.9).translate(1.4, 0.03, -0.35), 0xfbf7ec),
  ]);
}

/** Лапа: перьевые «штаны», оранжевая цевка, перепончатая стопа; начало — бедро */
function legGeo(): Geo {
  const parts: Geo[] = [];
  parts.push(ball(0.27, CREAM, [0, -0.12, 0], [1, 1.25, 1], 9, 6));
  parts.push(paint(new THREE.CylinderGeometry(0.13, 0.11, 1.0, 8, 4).translate(0, -0.75, 0), (_x, y, _z, c) => c.setHex(Math.abs(((y * 5) % 1 + 1) % 1 - 0.5) < 0.1 ? LEG_DK : LEG)));
  const sole = -1.42;
  const tips: V3[] = [];
  for (const a of [-0.5, 0, 0.5]) {
    const len = a === 0 ? 0.85 : 0.75;
    const pts: V3[] = [];
    for (let k = 0; k <= 3; k++) {
      const u = k / 3;
      pts.push([Math.sin(a) * len * u, sole + 0.08 + 0.06 * Math.sin(Math.PI * u), Math.cos(a) * len * u - 0.05]);
    }
    parts.push(colored(tube(pts, (u) => 0.09 - 0.04 * u, 6, 5), LEG));
    tips.push(pts[3]);
    parts.push(colored(new THREE.ConeGeometry(0.045, 0.16, 4).rotateX(Math.PI / 2 + 0.3).rotateY(a).translate(pts[3][0] + Math.sin(a) * 0.05, pts[3][1] - 0.02, pts[3][2] + Math.cos(a) * 0.05), 0x3a2f2c));
  }
  const webs: number[] = [];
  const base: V3 = [0, sole + 0.08, 0];
  for (let i = 0; i < 2; i++) {
    const p = tips[i];
    const q = tips[i + 1];
    const mid: V3 = [(p[0] + q[0]) * 0.42, sole + 0.07, (p[2] + q[2]) * 0.42];
    webs.push(...base, ...p, ...mid, ...base, ...mid, ...q);
    webs.push(...base, ...mid, ...p, ...base, ...q, ...mid);
  }
  const web = new THREE.BufferGeometry();
  web.setAttribute('position', new THREE.Float32BufferAttribute(webs, 3));
  web.computeVertexNormals();
  parts.push(colored(web, 0xe97d32));
  parts.push(ball(0.13, LEG, [0, -1.27, 0], [1, 1, 1], 7, 5));
  return merge(parts);
}

/** Хвост шарфа: лента вдоль −Z, на конце — бахрома */
function scarfGeo(len: number, fringe: boolean): Geo {
  const g = new THREE.BoxGeometry(0.36, 0.04, len, 1, 1, 4).translate(0, 0, -len / 2);
  const parts: Geo[] = [paint(g, (_x, y, _z, c) => c.setHex(y > 0 ? SCARF : SCARF_DK))];
  if (fringe) for (let i = 0; i < 4; i++) parts.push(colored(new THREE.BoxGeometry(0.05, 0.03, 0.22).translate(-0.14 + i * 0.093, 0, -len - 0.1), 0xe8c070));
  return merge(parts);
}

// ------------------------------------------------------------ части

const BONES = ['body', 'tail', 'neck1', 'neck2', 'head', 'eyes', 'lids', 'goggles', 'jaw', 'pouch', 'bombs', 'core',
  'wingL1', 'wingL2', 'wingR1', 'wingR2', 'patch', 'legL', 'legR', 'scarf1', 'scarf2'] as const;

function buildParts(): BossPart[] {
  return [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'tail', geo: tailGeo() },
    { bone: 'neck1', geo: neck1Geo() },
    { bone: 'neck2', geo: neck2Geo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'eyes', geo: eyesGeo(), glow: true },
    { bone: 'lids', geo: lidsGeo() },
    { bone: 'goggles', geo: gogglesGeo() },
    { bone: 'jaw', geo: jawGeo() },
    { bone: 'pouch', geo: pouchGeo() },
    { bone: 'bombs', geo: bombsGeo() },
    { bone: 'core', geo: coreGeo(), glow: true },
    { bone: 'wingL1', geo: wing1Geo(1) },
    { bone: 'wingL2', geo: wing2Geo(1) },
    { bone: 'wingR1', geo: wing1Geo(-1) },
    { bone: 'wingR2', geo: wing2Geo(-1) },
    { bone: 'patch', geo: patchGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
    { bone: 'scarf1', geo: scarfGeo(1.3, false) },
    { bone: 'scarf2', geo: scarfGeo(1.15, true) },
  ];
}

// ------------------------------------------------------------ клипы стенда

const CLIPS: BossClip[] = [
  { id: 'fly', name: 'Летит', st: PS.FLY, dur: 0, speed: 8, note: 'Кружит над крепостью на 13 м: тяжёлые взмахи, планирует, шарф полощется. Высоко — бьют только игроки и дальнобойные башни.' },
  { id: 'bomb', name: 'Бомбёжка', st: PS.BOMB, dur: 3.4, speed: 8, mark: 'line', phase: 1, hits: [1.8, 2.05, 2.3, 2.55],
    note: '1,8 с: зоб раздувается, очки — на глаза, летит вдоль стены. Бочки падают в метки на ходу стены — уйди или встань под зубец.' },
  { id: 'dive', name: 'Пике: хватает игрока', st: PS.DIVE, dur: 3.8, mark: 'ring', phase: 1, hits: [2.4],
    note: 'Зависает и целится в игрока (красный круг) — пике. Не ушёл — унесён в зобе. Зоб светится голубым: три попадания — выплюнет на стену.' },
  { id: 'open', name: 'Устал: зоб открыт', st: PS.OPEN, dur: 3.0, phase: 1,
    note: 'После пике висит низко у стены, пыхтит с открытым клювом — бочки в зобе светятся голубым. 3 с: бей в зоб, урон ×3.' },
  { id: 'phase2', name: 'Фаза 2: подбит', st: PS.PHASE, dur: 2.4, stage: 2, phase: 2,
    note: 'На 60 %: кувырок, перья летят, на крыле — повязка. Дальше летает ниже (9 м) и садится на бастион.' },
  { id: 'perch', name: 'Садится на бастион', st: PS.PERCH, dur: 4.0, stage: 2, phase: 2,
    note: 'Выставляет лапы, тормозит крыльями и садится на зубцы бастиона. Пока сидит — башня под ним молчит, а он — лёгкая цель.' },
  { id: 'peck', name: 'Клюёт башню', st: PS.PECK, dur: 2.2, stage: 2, phase: 2, hits: [1.2], mark: 'tower',
    note: 'Замах головой назад — удар клювом по башне под собой.' },
  { id: 'gust', name: 'Ветер крыльями', st: PS.GUST, dur: 3.2, stage: 2, phase: 2, hits: [1.8], mark: 'walk',
    note: 'Расправляет крылья и набирает воздух 1,8 с — мощный взмах вдоль хода стены: сдувает игроков к краю. Пригнись за зубец.' },
  { id: 'crash', name: 'Фаза 3: сбит', st: PS.CRASH, dur: 3.2, stage: 3, rage: true, phase: 3,
    note: 'На 25 %: падает кувырком у стены, шлёпается, трясёт головой — дальше ходит пешком.' },
  { id: 'walk', name: 'Идёт пешком', st: PS.GROUND, dur: 0, speed: 2.2, stage: 3, rage: true, phase: 3,
    note: 'Вразвалку, на перепончатых лапах, крылья в стороны для равновесия, зоб болтается.' },
  { id: 'snap', name: 'Щёлкает по воротам', st: PS.SNAP, dur: 2.4, stage: 3, rage: true, phase: 3, hits: [1.2], mark: 'wall',
    note: 'Откидывает голову, раскрывает клюв (1,2 с) — бросок и щелчок по стене и воротам.' },
  { id: 'hit', name: 'Получил удар', phase: 4, st: PS.FLY, dur: 1.2, speed: 8, note: 'Вздрагивает, перья летят, жмурится.' },
  { id: 'die', name: 'Гибель', phase: 4, st: PS.GROUND, dur: 4.0, die: true, stage: 3, note: 'Кувырком на спину, лапы кверху, очки слетают, зоб сдувается — и уходит в землю.' },
];

// ------------------------------------------------------------ поза

const B = new THREE.Matrix4();
const M = new THREE.Matrix4();
const NK = new THREE.Matrix4();

interface Wing { r1x: number; r1y: number; r1z: number; r2y: number; r2z: number }
const wing: Wing = { r1x: 0, r1y: 0, r1z: 0, r2y: 0, r2z: 0 };
/** Взмах: фаза 0…1 (вниз 0…0,55, вверх — кисть подгибается) */
function flap(w: Wing, ph: number, amp: number): void {
  const p = ((ph % 1) + 1) % 1;
  const down = p < 0.55;
  const k = down ? p / 0.55 : (p - 0.55) / 0.45;
  const e = k * k * (3 - 2 * k);
  w.r1z = down ? lerp(0.75, -0.6, e) * amp : lerp(-0.6, 0.75, e) * amp;
  w.r2z = down ? lerp(0.15, -0.2, e) * amp : -0.55 * Math.sin(Math.PI * k) * amp;
  w.r2y = down ? 0 : 0.45 * Math.sin(Math.PI * k) * amp;
  w.r1y = down ? -0.1 * amp : 0.15 * Math.sin(Math.PI * k) * amp;
  w.r1x = 0.12 * amp * (down ? 1 : -1) * Math.sin(Math.PI * k);
}
function mixWing(w: Wing, o: Wing, k: number): void {
  w.r1x = lerp(w.r1x, o.r1x, k);
  w.r1y = lerp(w.r1y, o.r1y, k);
  w.r1z = lerp(w.r1z, o.r1z, k);
  w.r2y = lerp(w.r2y, o.r2y, k);
  w.r2z = lerp(w.r2z, o.r2z, k);
}
const GLIDE: Wing = { r1x: 0, r1y: 0.02, r1z: 0.1, r2y: 0.05, r2z: -0.08 };
const FOLD: Wing = { r1x: -1.25, r1y: 1.5, r1z: -0.05, r2y: 0.15, r2z: 0.05 };
const DIVE: Wing = { r1x: -0.2, r1y: 1.0, r1z: 0.35, r2y: 0.35, r2z: -0.1 };
const FLARE: Wing = { r1x: 0.5, r1y: -0.35, r1z: 0.55, r2y: -0.2, r2z: 0.25 };
const SPREAD: Wing = { r1x: 0.2, r1y: -0.15, r1z: 0.35, r2y: 0, r2z: 0.1 };
const _w2: Wing = { r1x: 0, r1y: 0, r1z: 0, r2y: 0, r2z: 0 };

export const PELICAN: BossDef = {
  id: 'boss-pelican',
  name: 'Пеликан-Бомбардир',
  height: 4.3,
  bones: BONES,
  parts: buildParts(),
  clips: CLIPS,
  pose(a, out) {
    const t = a.t;
    const T = a.stT;
    const st = a.st;
    const seed = a.seed;
    const stage = a.stage ?? 1;
    const sp = Math.abs(a.speed);
    const path = a.path ?? a.gait * 1.25;

    let px = 0;
    let py = 0;
    let pz = 0;
    let pitch = 0;
    let yaw = 0;
    let roll = 0;
    // шея: наклон звеньев (рад), голова — наклон к горизонту; клюв, зоб, бомбы, ядро, очки, веки
    let n1 = -1.1;
    let n2 = 1.9;
    let head = 0;
    let headYaw = 0;
    let jaw = 0;
    let pouch = 1;
    let core = 0;
    let gog = 0;
    let lid = 0;
    let bombs = 1;
    let legs = 1.25;
    let legSwing = 0;
    let tailUp = 0;
    let scarfAmp = 1;
    /** Крылья сложены (1) — короче и уже: кисть подогнута, маховые убраны */
    let fold = 0;
    flap(wing, t * 0.85 + seed, 1);

    const air = st === PS.FLY || st === PS.BOMB || st === PS.DIVE || st === PS.OPEN || st === PS.PHASE;
    if (air) {
      // в полёте шея сложена, голова на плечах, клюв вперёд; три взмаха — планирование
      py = 0.22 * Math.sin(2 * Math.PI * (t * 0.85 + seed) + 0.4);
      const cyc = (t * 0.85 + seed) % 5;
      const glide = smooth(3, 3.4, cyc) * (1 - smooth(4.6, 5, cyc));
      mixWing(wing, GLIDE, glide);
      py *= 1 - glide;
      pitch = 0.04;
      roll = 0.05 * Math.sin(t * 0.7);
      lid = 0.1;
    }

    if (st === PS.FLY) {
      // крен в вираж даёт стенд корнем
      headYaw = 0.25 * Math.sin(t * 0.6 + seed);
    } else if (st === PS.BOMB) {
      // зоб раздувается, очки на глаза, планирует ровно; клюв настежь — бочки падают; набор высоты
      const swell = smooth(0.2, 1.6, T) * (1 - smooth(1.9, 2.8, T));
      pouch = 1 + 0.35 * swell + 0.04 * Math.sin(T * 14) * swell;
      gog = smooth(1.0, 1.4, T);
      mixWing(wing, GLIDE, win(0.3, 0.7, 2.6, 2.9, T));
      jaw = keys(T, [[0, 0], [1.75, 0], [1.85, 0.55], [2.6, 0.5], [2.8, 0]]);
      bombs = T < 1.8 ? 1 : T < 2.7 ? 1 - (T - 1.8) / 0.9 : 0;
      pitch = 0.04 + 0.1 * win(1.7, 1.85, 2.6, 2.8, T);
      head = 0.2 * win(1.6, 1.8, 2.6, 2.8, T);
      lid = 0.25;
    } else if (st === PS.DIVE) {
      // висит и целится → пике со сложенными крыльями → хватает → тяжело уходит вверх с полным зобом
      const hover = 1 - smooth(1.75, 1.85, T);
      if (T < WARN) {
        flap(wing, T * 1.7, 0.85);
        pitch = lerp(0.04, -0.45, smooth(0, 0.5, T)) + 0.6 * smooth(1.3, 1.75, T);
        head = 0.4 * smooth(0.3, 1.0, T);
        gog = smooth(0.5, 0.9, T);
        n1 = -0.35;
        n2 = 0.7;
        legs = lerp(1.25, 0.6, smooth(0.5, 1.5, T));
        lid = 0.35;
        if (T > 1.3) mixWing(wing, { r1x: 0.1, r1y: 0, r1z: 0.85, r2y: 0, r2z: 0.2 }, smooth(1.3, 1.75, T));
      } else if (T < 2.4) {
        mixWing(wing, DIVE, 1);
        pitch = 0.7;
        head = 0.1;
        n1 = -0.1;
        n2 = 0.4;
        gog = 1;
        legs = 0.4;
        jaw = smooth(2.2, 2.35, T) * 0.75;
        lid = 0.2;
        scarfAmp = 2;
      } else {
        flap(wing, T * 1.3, 1.1);
        jaw = 0.75 * (1 - smooth(2.4, 2.5, T));
        pouch = 1 + 0.55 * smooth(2.4, 2.55, T) + 0.05 * Math.sin(T * 9);
        core = smooth(2.5, 2.8, T);
        pitch = lerp(0.7, -0.25, smooth(2.4, 2.8, T));
        gog = 1 - smooth(3.2, 3.6, T);
        legs = 1.0;
        lid = 0.15;
      }
      void hover;
    } else if (st === PS.OPEN) {
      // висит низко, редкие тяжёлые взмахи, пыхтит открытым клювом — голубой зоб
      flap(wing, T * 1.1, 0.8);
      core = win(0.1, 0.4, 2.6, 2.95, T);
      jaw = core * (0.55 + 0.12 * Math.sin(T * 7));
      pouch = 1 + 0.08 * Math.sin(T * 7);
      pitch = -0.3;
      head = -0.1 + 0.05 * Math.sin(T * 7);
      lid = 0.45;
      legs = 0.7;
      py += -0.15 * Math.sin(T * 7);
    } else if (st === PS.PHASE) {
      // подбит: кувырок через бок, перья летят, выравнивается
      const tumble = smooth(0.1, 1.2, T);
      roll = Math.PI * 2 * tumble;
      pitch = 0.3 * Math.sin(Math.PI * tumble);
      mixWing(wing, DIVE, win(0.05, 0.25, 1.0, 1.3, T));
      lid = 0.9 * win(0.05, 0.1, 1.2, 1.5, T);
      jaw = 0.4 * win(0.1, 0.2, 0.5, 0.8, T);
      gog = 0;
      headYaw = 0.3 * Math.sin(T * 9) * win(1.2, 1.4, 1.9, 2.3, T);
    }

    // на земле и на насесте: шея вверх, голова держит клюв вниз-вперёд, крылья сложены
    const ground = st === PS.PERCH || st === PS.PECK || st === PS.GUST || st === PS.CRASH || st === PS.GROUND || st === PS.SNAP;
    if (ground) {
      n1 = -0.1;
      n2 = 0.35;
      head = 0.35;
      legs = 0;
      lid = 0.1;
      mixWing(wing, FOLD, 1);
      fold = 1;
      const breath = Math.sin(t * 1.6 + seed);
      py = 0.03 * breath;
      pitch = -0.12;
      headYaw = 0.35 * Math.sin(t * 0.45 + seed * 3);
    }
    if (st === PS.PERCH) {
      // заходит на посадку: лапы вперёд, крылья тормозят — касание — складывает крылья — балансирует на зубцах
      const land = smooth(0, 1.3, T);
      if (T < 1.4) {
        flap(_w2, T * 2.2, 1);
        mixWing(_w2, FLARE, smooth(0.6, 1.2, T));
        mixWing(wing, _w2, 1 - smooth(1.3, 1.9, T));
        fold = smooth(1.3, 1.9, T);
        pitch = lerp(0, -0.6, smooth(0.4, 1.2, T));
        legs = lerp(1.2, -0.55, smooth(0.3, 1.1, T));
        n1 = -0.4;
        n2 = 0.8;
        head = 0.1;
      } else {
        mixWing(wing, _w2, 1 - smooth(1.3, 1.9, T));
        fold = smooth(1.3, 1.9, T);
        const wob = Math.sin(t * 2.3) * win(1.9, 2.4, 3.6, 4, T);
        roll = 0.08 * wob;
        // балансирует: крыло приоткрыл
        if (Math.abs(wob) > 0.6) mixWing(wing, SPREAD, 0.3 * (Math.abs(wob) - 0.6) / 0.4);
        py += -0.2 * wobble(T - 1.4, 10, 5);
      }
      void land;
    } else if (st === PS.PECK) {
      // голова назад-вверх, клюв приоткрыт — бросок вниз и удар, отдача
      n1 = keys(T, [[0, -0.1], [0.9, -0.55], [1.15, 0.7], [1.5, 0.6], [2.2, -0.1]]);
      n2 = keys(T, [[0, 0.35], [0.9, 0.2], [1.15, 0.9], [1.5, 0.8], [2.2, 0.35]]);
      head = keys(T, [[0, 0.35], [0.9, -0.2], [1.15, 1.1], [1.5, 1.0], [2.2, 0.35]]);
      jaw = keys(T, [[0, 0], [0.8, 0.4], [1.12, 0.3], [1.2, 0], [2.2, 0]]);
      pitch = keys(T, [[0, -0.12], [0.9, -0.25], [1.15, 0.35], [1.6, 0.25], [2.2, -0.12]]);
      lid = keys(T, [[0, 0.1], [0.8, 0.4], [1.2, 0.8], [1.5, 0.3], [2.2, 0.1]]);
      headYaw = 0;
      py += -0.15 * win(1.1, 1.2, 1.4, 1.8, T);
    } else if (st === PS.GUST) {
      // расправил крылья, набирает воздух — мощный взмах вперёд, держит — складывает
      const open = smooth(0, 0.7, T) * (1 - smooth(2.6, 3.2, T));
      fold = 1 - open;
      _w2.r1x = keys(T, [[0, 0.2], [1.6, -0.3], [1.85, 0.9], [2.4, 0.7], [3.2, 0.2]]);
      _w2.r1y = keys(T, [[0, -0.15], [1.6, 0.5], [1.85, -0.75], [2.4, -0.6], [3.2, -0.15]]);
      _w2.r1z = keys(T, [[0, 0.35], [1.6, 0.85], [1.85, 0.05], [2.4, 0.15], [3.2, 0.35]]);
      _w2.r2y = keys(T, [[0, 0], [1.6, 0.3], [1.85, -0.45], [3.2, 0]]);
      _w2.r2z = keys(T, [[0, 0.1], [1.6, 0.25], [1.85, -0.1], [3.2, 0.1]]);
      mixWing(wing, _w2, open);
      pitch = keys(T, [[0, -0.12], [1.6, -0.3], [1.85, 0.15], [2.6, 0.05], [3.2, -0.12]]);
      pouch = 1 + 0.25 * smooth(0.5, 1.6, T) * (1 - smooth(1.8, 2.0, T));
      n1 = keys(T, [[0, -0.1], [1.6, -0.4], [1.85, 0.2], [3.2, -0.1]]);
      lid = keys(T, [[0, 0.1], [1.5, 0.45], [1.85, 0.0], [3.2, 0.1]]);
      jaw = 0.3 * win(1.8, 1.9, 2.4, 2.7, T);
      headYaw = 0;
      scarfAmp = 1 + 2 * win(1.8, 1.9, 2.4, 2.8, T);
    } else if (st === PS.CRASH) {
      // падает кувырком (корень ведёт стенд), шлёпается, лежит, трясёт головой и встаёт
      const fall = 1 - smooth(1.1, 1.2, T);
      if (T < 1.15) {
        flap(wing, T * 3, 1.2);
        roll = 4 * T;
        pitch = 0.6;
        legs = 1;
        lid = 0.8;
        jaw = 0.4;
      } else {
        const lie = 1 - smooth(1.9, 2.6, T);
        fold = 1 - 0.6 * lie;
        py = -1.2 * lie - 0.4 * wobble(T - 1.15, 18, 6);
        roll = 0.9 * lie;
        pitch = 0.4 * lie - 0.12 * (1 - lie);
        mixWing(wing, { r1x: -0.3, r1y: 0.3, r1z: -0.5, r2y: 0.2, r2z: -0.3 }, lie);
        headYaw = 0.6 * Math.sin(T * 14) * win(1.9, 2.0, 2.5, 2.7, T);
        lid = lerp(0.9, 0.2, smooth(1.6, 2.2, T));
        legs = lerp(0.8, 0, smooth(1.9, 2.5, T));
        legSwing = 0.6 * lie * Math.sin(T * 12);
      }
      void fall;
    } else if (st === PS.GROUND) {
      // вразвалку: лапы попеременно, тело переваливается, крылья чуть в стороны
      const walk = clamp01(sp / 1.0);
      fold = 1 - 0.45 * walk;
      const ph = path / 1.6;
      legSwing = 0.45 * walk * Math.sin(2 * Math.PI * ph);
      roll = 0.14 * walk * Math.sin(2 * Math.PI * ph);
      py += 0.12 * walk * Math.abs(Math.cos(2 * Math.PI * ph));
      yaw = 0.08 * walk * Math.sin(2 * Math.PI * ph);
      mixWing(wing, { r1x: -0.6, r1y: 0.8, r1z: 0.25, r2y: 0.3, r2z: -0.2 }, 0.6 * walk);
      head = 0.35 + 0.1 * walk * Math.sin(4 * Math.PI * ph);
      n1 = -0.1 + 0.06 * walk * Math.sin(4 * Math.PI * ph);
    } else if (st === PS.SNAP) {
      // откидывает голову и раскрывает клюв — бросок вперёд, щелчок
      n1 = keys(T, [[0, -0.1], [1.0, -0.6], [1.2, 0.95], [1.6, 0.8], [2.4, -0.1]]);
      n2 = keys(T, [[0, 0.35], [1.0, 0.15], [1.2, 0.2], [2.4, 0.35]]);
      head = keys(T, [[0, 0.35], [1.0, -0.4], [1.2, 0.5], [1.6, 0.5], [2.4, 0.35]]);
      jaw = keys(T, [[0, 0], [0.9, 0.8], [1.15, 0.8], [1.22, 0], [2.4, 0]]);
      pitch = keys(T, [[0, -0.12], [1.0, -0.3], [1.2, 0.45], [1.7, 0.3], [2.4, -0.12]]);
      pz = keys(T, [[0, 0], [1.0, -0.3], [1.2, 0.8], [1.7, 0.6], [2.4, 0]]);
      mixWing(wing, { r1x: -0.4, r1y: 0.5, r1z: 0.5, r2y: 0.2, r2z: 0 }, win(0.6, 1.0, 1.6, 2.2, T));
      fold = 1 - 0.5 * win(0.6, 1.0, 1.6, 2.2, T);
      lid = keys(T, [[0, 0.1], [0.9, 0.45], [1.2, 0.0], [2.4, 0.1]]);
      headYaw = 0;
    }

    // моргает
    const bl = (t + seed * 7) % 3.9;
    lid = Math.max(lid, 0.95 * win(0, 0.05, 0.09, 0.16, bl));
    // ярость (сбит): дёргается, глаза злые
    if (a.rage && a.die <= 0) {
      px += 0.02 * jitter(t, seed);
      lid = Math.max(lid, 0.3);
    }
    // удар: вздрогнул, зажмурился
    const hit = a.hit;
    if (hit > 0) {
      pitch -= 0.15 * hit;
      lid = Math.max(lid, hit);
      px += 0.1 * hit * Math.sin(t * 50);
      headYaw += 0.2 * hit * Math.sin(t * 31);
    }
    // гибель: кувырок на спину, лапы кверху, очки слетают, зоб сдувается, уходит в землю
    const d = a.die;
    let gogFly = 0;
    let sink = 0;
    if (d > 0) {
      const flip = smooth(0.05, 0.4, d);
      fold = lerp(fold, 0.5, flip);
      sink = smooth(0.78, 1, d);
      roll = Math.PI * 0.95 * flip;
      pitch = -0.2 * flip;
      py = lerp(0, -1.1, flip) - 0.25 * wobble(d - 0.4, 50, 14) * (d > 0.4 ? 1 : 0);
      mixWing(wing, { r1x: -0.2, r1y: 0.2, r1z: -0.1, r2y: 0.1, r2z: -0.2 }, flip);
      legs = lerp(0, -0.1, flip);
      legSwing = 0.5 * Math.sin(t * 15) * win(0.4, 0.45, 0.65, 0.75, d);
      n1 = lerp(n1, 0.6, flip);
      n2 = lerp(n2, 0.2, flip);
      head = lerp(head, 0.6, flip);
      jaw = 0.5 * flip;
      pouch = lerp(1, 0.7, smooth(0.4, 0.8, d));
      lid = 1;
      gogFly = smooth(0.1, 0.5, d);
      bombs = 1;
      scarfAmp = 0.3;
    }

    // --- туловище
    composeInto(B, px, BODY[1] + py - sink * 3, pz, pitch, yaw, roll);
    out.body.copy(B);
    attach(out.tail, B, 0, 0.15, -1.6, -0.15 + tailUp + 0.08 * Math.sin(t * 1.3), 0.06 * Math.sin(t * 0.9), 0);
    // шея и голова: голова держит горизонт — компенсирует наклон звеньев и тела
    attach(out.neck1, B, NECK[0], NECK[1], NECK[2], n1, 0, 0);
    attach(out.neck2, out.neck1, 0, N1, 0, n2, headYaw * 0.4, 0);
    attach(NK, out.neck2, 0, N2, 0, -(n1 + n2) + head, headYaw * 0.6, 0);
    out.head.copy(NK);
    out.eyes.copy(NK);
    attach(out.lids, NK, 0, 0.42, 0.47, lerp(-0.3, 1.0, clamp01(lid)), 0, 0);
    attach(out.goggles, NK, GOG_PIVOT[0], GOG_PIVOT[1] + 2.4 * gogFly, GOG_PIVOT[2] - 1.2 * gogFly, lerp(-1.05, 0, gog) - 5 * gogFly, 0, 2 * gogFly);
    attach(out.jaw, NK, JAW[0], JAW[1], JAW[2], jaw, 0, 0);
    attach(out.pouch, out.jaw, 0, 0, 0, 0, 0, 0, 1 + (pouch - 1) * 0.6, pouch, 1 + (pouch - 1) * 0.2);
    const bs = bombs > 0.05 && core < 0.5 ? clamp01(bombs) * 0.6 + 0.4 : HIDE;
    attach(out.bombs, out.pouch, 0, 0, 0, 0, 0, 0, bs);
    const beat = heartbeat(t, 0.6);
    const cs = core > 0.01 ? lerp(0.5, 1.1, core) * (1 + 0.15 * beat) : HIDE;
    attach(out.core, out.pouch, 0, 0, 0, 0, 0, 0, cs);
    // крылья: плечо (взмах rz, разворот ry, поворот вдоль размаха rx), кисть — от конца плеча
    for (const s of [1, -1]) {
      const w1 = s > 0 ? out.wingL1 : out.wingR1;
      const w2 = s > 0 ? out.wingL2 : out.wingR2;
      attach(w1, B, s * SHOULDER[0], SHOULDER[1] + 0.12 * fold, SHOULDER[2], wing.r1x, s * wing.r1y, s * wing.r1z, 1 - 0.32 * fold, 1, 1 - 0.5 * fold);
      attach(w2, w1, s * (W1 - 0.08), 0, 0, 0, s * wing.r2y, s * wing.r2z);
    }
    if (stage >= 2) out.patch.copy(out.wingL1);
    else out.patch.copy(out.wingL1).multiply(M.makeScale(HIDE, HIDE, HIDE));
    // лапы: в полёте поджаты назад, на земле — шагают
    attach(out.legL, B, HIP[0], HIP[1], HIP[2], legs + legSwing, 0, 0.05);
    attach(out.legR, B, -HIP[0], HIP[1], HIP[2], legs - legSwing, 0, -0.05);
    // шарф полощется двумя звеньями
    const fl = scarfAmp * (air ? 1 : 0.4);
    const scarfBase = air ? 0.12 : -1.05;
    attach(out.scarf1, B, 0, 0.75, 0.95, scarfBase + 0.18 * fl * Math.sin(t * 7 + 0.5), 0.2 * fl * Math.sin(t * 5.3), 0.1 * Math.sin(t * 6));
    attach(out.scarf2, out.scarf1, 0, 0, -1.25, 0.35 * fl * Math.sin(t * 7 - 0.8), 0.3 * fl * Math.sin(t * 5.3 - 1), 0.2 * fl * Math.sin(t * 8));
    if (sink > 0) for (const b of ['legL', 'legR'] as const) out[b].elements[13] -= 0;
  },
};

// ------------------------------------------------------------ стенд: движение корня, метки, события

type AddMark = (shape: 'ring' | 'rect', x: number, y: number, z: number, w: number, h: number, from: number, to: number) => void;
interface Fx {
  burst(x: number, y: number, z: number, n: number, hex: number, speed: number, up: number, size: number, life?: number, g?: number, grow?: number): void;
  addShot(a: THREE.Vector3, b: THREE.Vector3, h: number, t0: number, dur: number, kind?: 'bomb' | 'drop', size?: number): void;
  shake(k: number): void;
  hit(): void;
  root: THREE.Object3D;
  stage: number;
}

const WALK_Y = 3.4;
/** Круг полёта: центр над участком стены, радиус, высота по фазе */
const C = new THREE.Vector3(-8, 0, -22);
const R = 12;
/** Бомбёжка: прямая вдоль хода северной стены */
const RUN_Z = -14.6;
const RUN_X0 = -24;
const RUN_V = 8;
const RUN_H = 10;
const BOMB_T = [1.8, 2.05, 2.3, 2.55];
/** Пике: висит здесь, цель — игрок на стене */
const HOVER = new THREE.Vector3(-7.2, 12.5, -25);
const TARGET = new THREE.Vector3(-7.2, WALK_Y + 1.4, -14.6);
/** Насест: зубцы северо-западного бастиона, смотрит вдоль хода стены */
const PERCH = new THREE.Vector3(-17.2, 4.6, -18.7);
/** Башня на бастионе (место вышки из TOWER_SPOTS) — её клюёт с насеста */
const TOWER = new THREE.Vector3(-19.2, 3.4, -17.2);
/** Пешком: перед стеной */
const GROUND_HOME = new THREE.Vector3(-9, 0, -19.6);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export const PELICAN_STAGE = {
  marks(c: BossClip, _stage: number, add: AddMark): void {
    if (c.id === 'bomb') BOMB_T.forEach((s) => add('ring', RUN_X0 + RUN_V * s, WALK_Y + 0.03, RUN_Z, 1.5, 0, 0, s + 0.6));
    if (c.id === 'dive') add('ring', TARGET.x, WALK_Y + 0.03, TARGET.z, 1.3, 0, 0, 2.4);
    if (c.id === 'peck') add('ring', TOWER.x, WALK_Y + 0.03, TOWER.z, 1.6, 0, 0, 1.2);
    if (c.id === 'gust') add('rect', PERCH.x + 7, WALK_Y + 0.03, -14.5, 11, 2.6, 0, 1.8);
    if (c.id === 'snap') add('rect', GROUND_HOME.x, WALK_Y + 0.03, -14.6, 4, 2.6, 0, 1.2);
  },

  place(c: BossClip, T: number, _dt: number, path: number, r: THREE.Object3D, a: MobAnimLike): void {
    r.rotation.order = 'YXZ';
    if (c.id === 'fly' || c.id === 'hit' || c.id === 'phase2') {
      // круг против часовой, крен внутрь виража
      const h = c.id === 'phase2' ? 9.5 : 13;
      const ang = path / R;
      r.position.set(C.x + R * Math.cos(ang), h, C.z + R * Math.sin(ang));
      r.rotation.set(0, -ang, 0.32);
      return;
    }
    if (c.id === 'bomb') {
      r.position.set(RUN_X0 + RUN_V * T, RUN_H + 0.6 * Math.sin(T * 1.3) + 1.2 * smooth(2.7, 3.4, T), RUN_Z);
      r.rotation.set(0, Math.PI / 2, 0);
      return;
    }
    if (c.id === 'dive') {
      if (T < WARN) {
        r.position.copy(HOVER).add(_a.set(0, 0.3 * Math.sin(T * 6), 0));
      } else if (T < 2.4) {
        const k = smooth(WARN, 2.4, T);
        r.position.lerpVectors(HOVER, TARGET, k);
      } else {
        const k = smooth(2.4, 3.8, T);
        _a.set(TARGET.x - 2, 12, TARGET.z - 12);
        r.position.lerpVectors(TARGET, _a, k);
      }
      // после захвата разворачивается и уходит от стены
      r.rotation.set(0, Math.PI * smooth(2.45, 3.1, T), 0);
      return;
    }
    if (c.id === 'open') {
      r.position.set(-6, 7.2 + 0.25 * Math.sin(T * 1.1 * 2 * Math.PI), -21);
      r.rotation.set(0, 0, 0);
      return;
    }
    if (c.id === 'perch' || c.id === 'peck' || c.id === 'gust') {
      if (c.id === 'perch' && T < 1.3) {
        const k = smooth(0, 1.3, T);
        _a.set(-8, 11, -27);
        r.position.lerpVectors(_a, PERCH, k);
        r.position.y += 1.5 * Math.sin(Math.PI * k) * (1 - k);
      } else r.position.copy(PERCH);
      r.rotation.set(0, c.id === 'peck' ? Math.atan2(TOWER.x - PERCH.x, TOWER.z - PERCH.z) : Math.PI / 2 + 0.15, 0);
      if (c.id === 'perch' && T < 1.3) r.rotation.set(0, Math.atan2(PERCH.x + 8, PERCH.z + 27), 0);
      return;
    }
    if (c.id === 'crash') {
      if (T < 1.15) {
        const k = T / 1.15;
        _a.set(-12, 11, -27);
        r.position.lerpVectors(_a, GROUND_HOME, k * k);
        r.position.y = lerp(11, 0, k * k);
      } else r.position.copy(GROUND_HOME);
      r.rotation.set(0, 0.3, 0);
      return;
    }
    if (c.id === 'walk') {
      // туда-обратно вдоль стены с разворотом
      const L = 8;
      const s = path % (2 * L + 2 * Math.PI * 1.5);
      if (s < L) {
        r.position.set(-13 + s, 0, -20);
        r.rotation.set(0, Math.PI / 2, 0);
      } else if (s < L + Math.PI * 1.5) {
        const q = (s - L) / 1.5;
        r.position.set(-5 + 1.5 * Math.sin(q), 0, -21.5 + 1.5 * Math.cos(q));
        r.rotation.set(0, Math.PI / 2 + q, 0);
      } else if (s < 2 * L + Math.PI * 1.5) {
        r.position.set(-5 - (s - L - Math.PI * 1.5), 0, -23);
        r.rotation.set(0, -Math.PI / 2, 0);
      } else {
        const q = (s - 2 * L - Math.PI * 1.5) / 1.5;
        r.position.set(-13 - 1.5 * Math.sin(q), 0, -21.5 - 1.5 * Math.cos(q));
        r.rotation.set(0, -Math.PI / 2 + q, 0);
      }
      return;
    }
    // удар, гибель, щелчок — у стены
    r.position.copy(GROUND_HOME);
    r.rotation.set(0, 0, 0);
  },

  events(c: BossClip, T0: number, T1: number, fx: Fx): void {
    const crossed = (s: number): boolean => T0 < s && T1 >= s;
    const p = fx.root.position;
    if (c.id === 'bomb') {
      BOMB_T.forEach((s) => {
        if (crossed(s)) {
          const x = RUN_X0 + RUN_V * s;
          fx.addShot(_a.set(x + 1.6, RUN_H + 1.3, RUN_Z), _b.set(x, WALK_Y + 0.3, RUN_Z), 0, T1, 0.6, 'drop');
        }
      });
    }
    if (c.id === 'dive' && crossed(2.4)) {
      fx.burst(TARGET.x, TARGET.y, TARGET.z, 30, 0xf1e9da, 4, 3, 0.18, 1.4, 2);
      fx.shake(0.4);
    }
    if (c.id === 'phase2' && crossed(0.15)) {
      fx.burst(p.x, p.y + 2.3, p.z, 50, 0xf1e9da, 6, 3, 0.2, 2.2, 1.2);
      fx.burst(p.x, p.y + 2.3, p.z, 12, 0x4e3a2c, 5, 2, 0.2, 2.2, 1.2);
      fx.shake(0.4);
      fx.hit();
    }
    if (c.id === 'perch' && crossed(1.3)) {
      fx.burst(PERCH.x, PERCH.y, PERCH.z, 20, 0xcbbfa6, 3, 2, 0.25, 1.0);
      fx.shake(0.3);
    }
    if (c.id === 'peck' && crossed(1.2)) {
      fx.burst(TOWER.x, WALK_Y + 0.6, TOWER.z, 30, 0xcbbfa6, 5, 4, 0.22, 1.2);
      fx.shake(0.4);
    }
    if (c.id === 'gust' && T1 > 1.8 && T1 < 2.6) {
      for (let i = 0; i < 3; i++) fx.burst(PERCH.x + 1.5 + Math.random() * 10, WALK_Y + 0.8 + Math.random(), -14.5 + (Math.random() - 0.5) * 2, 1, 0xf6f1e6, 2, 0.5, 0.25, 0.8, -0.5, 2);
    }
    if (c.id === 'crash' && crossed(1.15)) {
      fx.burst(GROUND_HOME.x, 0.4, GROUND_HOME.z, 60, 0xd6c29a, 8, 3, 0.45, 1.5, 6, 1.8);
      fx.burst(GROUND_HOME.x, 2, GROUND_HOME.z, 40, 0xf1e9da, 5, 5, 0.2, 2.0, 1.5);
      fx.shake(0.9);
    }
    if (c.id === 'snap' && crossed(1.2)) {
      fx.burst(GROUND_HOME.x, WALK_Y - 0.5, -16.1, 25, 0xcbbfa6, 4, 3, 0.25, 1.1);
      fx.shake(0.5);
    }
    if (c.id === 'hit' && crossed(0.05)) {
      fx.hit();
      fx.burst(p.x, p.y + 2.3, p.z, 24, 0xf1e9da, 4, 2, 0.18, 1.6, 1.2);
    }
    if (c.die && crossed(1.6)) {
      fx.burst(p.x, 0.5, p.z, 40, 0xd6c29a, 6, 3, 0.4, 1.4, 6, 1.6);
      fx.burst(p.x, 1.5, p.z, 40, 0xf1e9da, 5, 4, 0.2, 2.2, 1.2);
      fx.shake(0.6);
    }
  },
};

interface MobAnimLike { speed: number }
