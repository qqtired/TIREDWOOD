// Убранство земли фермы: живая земля (ground.ts), трава пучками, полевые цветы куртинами, кусты, камни, пни, сено,
// тыквы, бочки, скамейки-брёвна, подсолнухи за северным забором, высокая трава по кромке луга, дальние холмы
// с полями и деревьями. Раскладка детерминирована (seed) и обходит дорожки, участки, площадки, предметы и места E.
//
// Отрисовки: земля 2, трава и цветы — по InstancedMesh на вид (≤ 12, всё дальше 40–110 м и вне экрана не рисуется,
// отбор на процессоре только при сдвиге камеры), неподвижная мелочь — StaticBatch (1–2), дальний план — StaticBatch
// (2). Ветер — в вершинном шейдере одной программы на все виды (сдвиг в мировых осях, порывы волной по полю).
//
// Подключение (world.ts): new FarmDecor(scene, camera) вместо buildGround(), `await decor.ready` в load() до снятия
// loading, decor.update(time) в update().
import * as THREE from 'three';
import { makeRng } from '../../../shared/math.ts';
import { TOUCH } from '../../touch.ts';
import { StaticBatch, loadModel, type FarmModel, type Part } from '../models.ts';
import { cliffGeometry, farMesh, fbm, grassRGB, heightAt, meadowRGB, nearMesh, paintFar, paintNear, type FarFeatures, type GroundMarks } from './ground.ts';
import { FarmZones } from './zones.ts';

// ------------------------------------------------------------ виды растений

type Kind = 'fuzz' | 'tuft' | 'tuft_tall' | 'clover' | 'daisy' | 'poppy' | 'cornflower' | 'lavender' | 'marigold' | 'bush_round' | 'bush_bloom'
  | 'bush_low' | 'sunflower';

interface KindSpec {
  file: string;
  node: string;
  /** дальше — не рисуем (м); fade — где плавно уходит в землю */
  cull: number;
  fade: [number, number];
  /** качание макушки на ветру, м */
  sway: number;
  /** насколько нормали смотрят вверх (трава светится как земля) */
  up: number;
  /** радиус экземпляра для отбора по экрану */
  bound: number;
}

const KINDS: Record<Kind, KindSpec> = {
  fuzz: { file: 'decor_grass', node: 'fuzz', cull: 19, fade: [12, 19], sway: 0.025, up: 0.9, bound: 0.2 },
  tuft: { file: 'decor_grass', node: 'tuft', cull: 36, fade: [26, 36], sway: 0.07, up: 0.85, bound: 0.4 },
  tuft_tall: { file: 'decor_grass', node: 'tuft_tall', cull: 72, fade: [58, 72], sway: 0.16, up: 0.7, bound: 0.9 },
  clover: { file: 'decor_grass', node: 'clover', cull: 42, fade: [32, 42], sway: 0.025, up: 0.6, bound: 0.3 },
  daisy: { file: 'decor_flowers', node: 'daisy', cull: 55, fade: [42, 55], sway: 0.06, up: 0.45, bound: 0.4 },
  poppy: { file: 'decor_flowers', node: 'poppy', cull: 55, fade: [42, 55], sway: 0.07, up: 0.45, bound: 0.5 },
  cornflower: { file: 'decor_flowers', node: 'cornflower', cull: 55, fade: [42, 55], sway: 0.07, up: 0.45, bound: 0.5 },
  lavender: { file: 'decor_flowers', node: 'lavender', cull: 60, fade: [48, 60], sway: 0.05, up: 0.4, bound: 0.5 },
  marigold: { file: 'decor_flowers', node: 'marigold', cull: 60, fade: [48, 60], sway: 0.04, up: 0.4, bound: 0.4 },
  bush_round: { file: 'decor_bushes', node: 'bush_round', cull: 130, fade: [200, 210], sway: 0.025, up: 0.15, bound: 1.1 },
  bush_bloom: { file: 'decor_bushes', node: 'bush_bloom', cull: 130, fade: [200, 210], sway: 0.025, up: 0.15, bound: 1.2 },
  bush_low: { file: 'decor_bushes', node: 'bush_low', cull: 130, fade: [200, 210], sway: 0.02, up: 0.15, bound: 1.1 },
  sunflower: { file: 'trees', node: 'sunflower_decor', cull: 120, fade: [100, 120], sway: 0.12, up: 0.15, bound: 1.2 },
};
const KIND_LIST = Object.keys(KINDS) as Kind[];

interface Item {
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  /** наклон (трава и цветы не стоят по линейке) */
  tilt: number;
  /** множитель цвета (линейный) */
  tint: [number, number, number];
}

/** Неподвижный предмет: модель, узел, место; tint — перекрасить (тыквы разных сортов) */
interface Prop {
  file: string;
  node: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  tint?: number;
}

interface Plan {
  inst: Record<Kind, Item[]>;
  props: Prop[];
  far: Prop[];
  marks: GroundMarks;
  feats: FarFeatures;
}

const WHITE: [number, number, number] = [1, 1, 1];
const smooth01 = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };
const _c = new THREE.Color();
const _ref = new THREE.Color(0x6c9f47);

/** Множитель цвета пучка, чтобы он совпал с землёй под ним */
function grassTint(rgb: [number, number, number], k = 1): [number, number, number] {
  _c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  const f = (a: number, b: number) => Math.min(1.8, Math.max(0.55, (a / b) * k));
  return [f(_c.r, _ref.r), f(_c.g, _ref.g), f(_c.b, _ref.b)];
}

// ------------------------------------------------------------ раскладка

const FLOWERS: readonly Kind[] = ['daisy', 'daisy', 'daisy', 'poppy', 'poppy', 'cornflower', 'cornflower', 'clover', 'clover'];

/** Дороги за воротами (тот же путь, что рисует ground.ts) — мимо них высокую траву и сено не ставим */
function nearGateRoad(x: number, z: number): boolean {
  return (x < -35 && Math.abs(z - (-27 + (x + 36) * 0.125)) < 2.6) || (x > 35 && Math.abs(z - (27 + (x - 36) * 0.125)) < 2.6);
}

function makePlan(zones: FarmZones, density: number): Plan {
  const rng = makeRng(20261010);
  const inst = Object.fromEntries(KIND_LIST.map((k) => [k, [] as Item[]])) as Record<Kind, Item[]>;
  const props: Prop[] = [];
  const far: Prop[] = [];
  const marks: GroundMarks = { shadows: [], worn: [], lush: [] };
  const B = zones.L.bounds;
  const r = (a: number, b: number) => a + rng() * (b - a);
  const put = (k: Kind, x: number, z: number, s: number, tint: [number, number, number] = WHITE, tilt = 0.1): void => {
    inst[k].push({ x, y: heightAt(x, z), z, yaw: rng() * Math.PI * 2, s, tilt: (rng() - 0.5) * tilt * 2, tint });
  };
  const prop = (node: string, x: number, z: number, yaw: number, s = 1, shadow = 0, tint?: number, file = 'decor_props'): void => {
    props.push({ file, node, x, y: heightAt(x, z), z, yaw, s, tint });
    if (shadow > 0) marks.shadows.push([x, z, shadow * s, 1]);
  };
  const inside = (x: number, z: number) => zones.fenceDist(x, z) > 0.3;
  const vary = (k = 0.08): [number, number, number] => {
    const v = 1 + (rng() - 0.5) * 2 * k;
    return [v, v * (1 + (rng() - 0.5) * 0.04), v];
  };

  // ---------------- трава: пучки по лужайкам, гуще у заборов, деревьев и площадок, реже у дорожек, не на грядках
  const cell = 0.55;
  for (let x = -44; x < 44; x += cell) {
    for (let z = -46; z < 37.7; z += cell) {
      const px = x + rng() * cell;
      const pz = z + rng() * cell;
      const fd = zones.fenceDist(px, pz);
      let dens: number;
      let big = 1;
      if (fd < -0.3) {
        if (pz > 37.5 || Math.abs(px) > 44) continue;
        dens = pz > 35 ? 0.5 : 0.7;
        big = 1.2;
      } else {
        if (fd < 0.15) continue;
        const pd = zones.pathDist(px, pz);
        if (pd < -0.2) continue;
        const pl = zones.plotDist(px, pz);
        if (pl < 0.12) continue;
        const pad = zones.padDist(px, pz);
        if (pad < 0.15) continue;
        const bd = zones.blockDist(px, pz);
        if (bd < 0.12) continue;
        const td = zones.treeDist(px, pz);
        if (td < 0.38) continue;
        // по открытой лужайке — редкими куртинами (шум), у заборов, деревьев, площадок и предметов — гуще и выше
        dens = 0.5 * (0.25 + 1.5 * smooth01((fbm(px / 3.2, pz / 3.2, 61, 2) - 0.42) / 0.2));
        if (Math.hypot(px, pz) < 17.6) dens *= 0.5;
        if (pd < 0.8) dens *= pd < 0 ? 0.3 : 0.6;
        else if (pl < 1.3) { dens = Math.max(dens, 0.5) * 2.6; big = 1.2; }
        if (fd < 1.3) { dens = Math.max(dens, 0.5) * 3.0; big = 1.3; }
        if (td < 2.4) { dens = Math.max(dens, 0.5) * 2.6; big = Math.max(big, 1.25); }
        if (pad < 1.4) { dens = Math.max(dens, 0.5) * 2.4; big = Math.max(big, 1.2); }
        if (bd < 0.9) dens = Math.max(dens, 0.4) * 2.0;
        if (pz > 34.8) dens *= 0.55;
      }
      const n = dens * density * cell * cell;
      let k = Math.floor(n) + (rng() < n - Math.floor(n) ? 1 : 0);
      while (k-- > 0) {
        const gx = px + (rng() - 0.5) * 0.2;
        const gz = pz + (rng() - 0.5) * 0.2;
        const col = fd < -0.3 ? meadowRGB(gx, gz) : grassRGB(gx, gz);
        put('tuft', gx, gz, r(0.75, 1.15) * big, grassTint(col, r(0.86, 0.98)), 0.18);
      }
    }
  }

  // ---------------- ближний «ковёр»: мелкие пучки везде на траве (рисуются только в 19 м от камеры)
  const fc = 0.27;
  for (let x = -36; x < 36; x += fc) {
    for (let z = -36; z < 37.4; z += fc) {
      if (rng() > 0.7 * density) continue;
      const px = x + rng() * fc;
      const pz = z + rng() * fc;
      if (zones.fenceDist(px, pz) < 0.05) continue;
      const pd = zones.pathDist(px, pz);
      if (pd < -0.05 || (pd < 0.35 && rng() > (pd + 0.05) / 0.4)) continue;
      if ((zones.plotDist(px, pz) < 0.1 && !zones.yardLawn(px, pz)) || zones.padDist(px, pz) < 0.05 || zones.blockDist(px, pz) < 0.05 || zones.treeDist(px, pz) < 0.3) continue;
      put('fuzz', px, pz, r(0.9, 1.45), grassTint(grassRGB(px, pz), r(0.9, 1.06)), 0.2);
    }
  }

  // ---------------- высокая трава по кромке луга за забором и в углах
  for (let x = -47; x < 47; x += 1) {
    for (let z = -49; z < 36; z += 1) {
      const px = x + rng();
      const pz = z + rng();
      const fd = zones.fenceDist(px, pz);
      let dens = 0;
      if (fd < -0.5) {
        if (pz > 35.5 || nearGateRoad(px, pz)) continue;
        const out = -fd;
        dens = out < 5 ? 0.6 : 0.6 - (out - 5) * 0.06;
        if (pz < -36.4 && pz > -41.2 && Math.abs(px) < 38) dens = 0.12;
      } else if (fd > 0.4) {
        const corner = (Math.abs(px) > 26 && pz < -26) || (px < -27 && pz > 27);
        const td = zones.treeDist(px, pz);
        if (corner) dens = 0.22;
        else if (td > 0.6 && td < 1.7) dens = 0.35;
        if (dens > 0 && !zones.free(px, pz, 0.35)) dens = 0;
      }
      if (dens > 0 && rng() < dens * density) {
        const col = fd < 0 ? meadowRGB(px, pz) : grassRGB(px, pz);
        put('tuft_tall', px, pz, r(0.8, 1.25), grassTint(col, 1.04), 0.16);
      }
    }
  }

  // ---------------- подсолнухи: полоса за северным забором (лицом на юг, к ферме и к солнцу)
  for (let row = 0; row < 4; row++) {
    const z0 = B.minZ - 1.0 - row * 1.0;
    for (let x = -38; x < 38; x += 0.95) {
      if (rng() < 0.08) continue;
      const px = x + (rng() - 0.5) * 0.3 + (row % 2) * 0.4;
      const pz = z0 + (rng() - 0.5) * 0.3;
      inst.sunflower.push({ x: px, y: heightAt(px, pz), z: pz, yaw: 2.8 + (rng() - 0.5) * 0.6, s: r(0.85, 1.15) - row * 0.02, tilt: (rng() - 0.5) * 0.1, tint: vary(0.06) });
    }
  }
  // и три — за лотком Семечкина
  for (const [x, z] of [[5.4, -12.7], [6.4, -12.95], [7.5, -12.65]]) inst.sunflower.push({ x, y: 0, z, yaw: 3.0 + (rng() - 0.5) * 0.4, s: r(0.9, 1.0), tilt: 0, tint: WHITE });

  // ---------------- полевые цветы куртинами
  const cluster = (kind: Kind, cx: number, cz: number, rad: number, n: number, pad = 0.15, inFarm = true): void => {
    let placed = 0;
    for (let i = 0; i < n * 2 && placed < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * rad;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (inFarm ? !(inside(x, z) && zones.free(x, z, pad)) : (zones.fenceDist(x, z) > -0.6 || nearGateRoad(x, z))) continue;
      put(kind, x, z, r(0.95, 1.3), vary(0.06), 0.16);
      placed++;
    }
    if (placed) marks.lush.push([cx, cz, rad]);
  };
  let made = 0;
  for (let i = 0; i < 400 && made < 48; i++) {
    const x = r(-34.5, 34.5);
    const z = r(-34.5, 34.5);
    if (Math.hypot(x, z) < 7 || !zones.free(x, z, 0.7)) continue;
    const kind = FLOWERS[(rng() * FLOWERS.length) | 0];
    cluster(kind, x, z, r(0.6, 1.5), kind === 'clover' ? 6 + ((rng() * 5) | 0) : 5 + ((rng() * 8) | 0));
    made++;
  }
  // клевер на подстриженном круге — пятнышками
  for (let i = 0; i < 60 && made < 62; i++) {
    const a = rng() * Math.PI * 2;
    const d = r(6, 17);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!zones.free(x, z, 0.6)) continue;
    cluster('clover', x, z, r(0.4, 0.9), 4 + ((rng() * 4) | 0));
    made++;
  }
  // у перил над морем — маки и васильки
  for (let x = -33; x < 33; x += r(3.5, 6.5)) {
    const z = r(33.6, 35.2);
    if (!zones.free(x, z, 0.4)) continue;
    cluster(rng() < 0.55 ? 'poppy' : 'cornflower', x, z, r(0.6, 1.2), 5 + ((rng() * 5) | 0), 0.1);
  }
  // луг за забором
  for (let i = 0; i < 70; i++) {
    const side = (rng() * 3) | 0;
    const t = r(-44, 44);
    const out = r(1.2, 9);
    const [x, z] = side === 0 ? [t, B.minZ - 6 - out] : side === 1 ? [B.maxX + out, t * 0.8] : [B.minX - out, t * 0.8];
    if (z > 34) continue;
    cluster(['poppy', 'daisy', 'cornflower', 'poppy'][(rng() * 4) | 0] as Kind, x, z, r(0.8, 2), 6 + ((rng() * 8) | 0), 0, false);
  }

  // ---------------- кусты: цветущие вдоль дорожек, в клиньях между участками, по углам, за забором
  const bush = (k: Kind, x: number, z: number, s: number, pad = 0.45): boolean => {
    if (!zones.free(x, z, pad + 0.4 * s)) return false;
    put(k, x, z, s, vary(0.1), 0.04);
    marks.shadows.push([x, z, 1.0 * s + 0.2, 0.9]);
    return true;
  };
  for (const rad of zones.L.paths.radial) {
    const [ax, az] = rad.from;
    const [bx, bz] = rad.to;
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    for (const d of [8.6, 13.8]) {
      for (const side of [-1, 1]) {
        const t = (d - 4.3) / len;
        bush(rng() < 0.75 ? 'bush_bloom' : 'bush_round', ax + (bx - ax) * t + nx * side * 2.25, az + (bz - az) * t + nz * side * 2.25, r(0.8, 1.0), 0.2);
      }
    }
  }
  for (const t of zones.trees) {
    const a = Math.atan2(t.z, t.x) + r(-0.5, 0.5);
    const d = r(1.5, 2.3);
    bush(rng() < 0.5 ? 'bush_low' : 'bush_round', t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, r(0.75, 1.05), 0.25);
  }
  for (const [k, x, z] of [
    ['bush_bloom', 31.2, -31.8], ['bush_bloom', 33.4, -29.2], ['bush_round', 25.6, -31.5],
    ['bush_bloom', -27.2, 31.6], ['bush_bloom', -31.8, 27.4], ['bush_round', -34.2, 30.5],
    ['bush_round', 33.6, 33.4], ['bush_low', 24.4, 33.8], ['bush_low', -33.8, -24.6], ['bush_bloom', -24.8, -34.2],
  ] as const) bush(k, x, z, r(0.85, 1.1), 0.2);
  for (let i = 0; i < 26; i++) {
    const side = i % 3;
    const t = r(-40, 40);
    const out = r(1.4, 3.2);
    const [x, z] = side === 0 ? [B.maxX + out, t * 0.8] : side === 1 ? [B.minX - out, t * 0.8] : [t, B.minZ - 6.5 - out];
    if (z > 33 || nearGateRoad(x, z)) continue;
    put(rng() < 0.6 ? 'bush_low' : 'bush_round', x, z, r(0.8, 1.2), vary(0.1), 0.04);
  }

  // ---------------- колодец: бочки и мостки у корыт
  prop('barrel', 3.25, -3.25, 0.4, 1, 0.5);
  prop('barrel', -3.25, 3.25, 2.1, 0.95, 0.5);
  prop('stone_s', 3.85, -2.7, 1.2, 0.8, 0.25);
  for (const t of zones.L.troughs) prop('planks', t.use.x, t.use.z, t.id === 'E' || t.id === 'W' ? Math.PI / 2 : 0, 1, 0);

  // ---------------- базар: ящики с цветами у Семечкина и Гриба, тыквы у лотка
  const planter = (x: number, z: number, yaw: number, kinds: readonly Kind[]): void => {
    prop('planter', x, z, yaw, 1, 0.55);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    kinds.forEach((k, i) => {
      const lx = (i - (kinds.length - 1) / 2) * 0.4;
      inst[k].push({ x: x + lx * c, y: 0.27, z: z - lx * s, yaw: rng() * 6.28, s: r(0.95, 1.15), tilt: 0, tint: vary(0.05) });
    });
  };
  planter(4.35, -10.9, Math.PI / 2, ['marigold', 'lavender', 'marigold']);
  planter(8.75, -11.5, Math.PI / 2, ['lavender', 'daisy', 'marigold']);
  planter(11.0, -8.75, 0, ['lavender', 'marigold', 'lavender']);
  planter(11.0, -4.45, 0, ['marigold', 'daisy', 'lavender']);
  prop('pumpkin', 3.95, -12.35, 0.4, 1.05, 0.45);
  prop('pumpkin', 4.6, -12.75, 2.2, 0.8, 0.35, 0xffe2a0);
  prop('pumpkin', 3.6, -12.95, 4.1, 0.7, 0.3);

  // ---------------- у телеги — тюки соломы; у ворот в город — тюки и тыквы
  prop('bale_block', -12.25, -15.35, 0.08, 1, 0.75);
  prop('bale_block', -12.3, -15.85, 0.02 + Math.PI, 1, 0);
  props.push({ file: 'decor_props', node: 'bale_block', x: -12.27, y: 0.42, z: -15.6, yaw: 1.62, s: 1 });
  prop('bale_block', -29.6, -31.0, 0.5, 1, 0.7);
  prop('pumpkin', -33.9, -29.2, 1.0, 0.9, 0.4);
  prop('pumpkin', -34.5, -30.0, 2.0, 1.1, 0.45, 0xa8c87a);

  // ---------------- костёр: камешки по краю вытоптанного круга (с проходами), дрова и колода
  const f = zones.fire;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    // проходы: к южному лучу (восток) и к Древу (юго-запад)
    const gapE = Math.abs(Math.atan2(Math.sin(a - 0.0), Math.cos(a - 0.0))) < 0.34;
    const gapSW = Math.abs(Math.atan2(Math.sin(a - 2.0), Math.cos(a - 2.0))) < 0.36;
    if (gapE || gapSW) continue;
    const rr = f.r + 0.28 + (rng() - 0.5) * 0.12;
    prop('stone_s', f.x + Math.cos(a) * rr, f.z + Math.sin(a) * rr, rng() * 6.28, r(0.55, 0.8), 0.2);
  }
  prop('woodpile', -9.95, 4.25, 1.04, 1, 0.8);
  prop('stump', -8.65, 3.15, 0.6, 0.9, 0.5);

  // ---------------- Древо: две скамейки-бревна лицом к пьедесталу (с юго-востока, симметрично), цветочный бордюр, камни
  const pd = zones.pedestal;
  for (const deg of [22, 68]) {
    const phi = (deg * Math.PI) / 180;
    const x = pd.x + Math.cos(phi) * 5.0;
    const z = pd.z + Math.sin(phi) * 5.0;
    const yaw = Math.atan2(-Math.cos(phi), -Math.sin(phi));
    prop('log_seat', x, z, yaw, 1, 0);
    marks.worn.push([x, z, yaw, 2.3, 1.3]);
    marks.shadows.push([x, z, 1.1, 0.6]);
  }
  const edge = pd.half + 0.34;
  const bed: Kind[] = ['daisy', 'poppy', 'cornflower', 'daisy', 'lavender'];
  let bi = 0;
  for (let t = -pd.half + 0.25; t <= pd.half - 0.2; t += 0.55) {
    for (const [x, z] of [[pd.x + t, pd.z - edge], [pd.x - edge, pd.z + t], [pd.x + t, pd.z + edge]]) {
      inst[bed[bi++ % bed.length]].push({ x, y: 0, z, yaw: rng() * 6.28, s: r(0.95, 1.2), tilt: 0.05, tint: vary(0.05) });
    }
  }
  prop('stone_m', pd.x - edge - 0.2, pd.z - edge - 0.2, 0.7, 0.9, 0.55);
  prop('stone_m', pd.x - edge - 0.2, pd.z + edge + 0.2, 2.4, 0.85, 0.55);

  // ---------------- тыквы у забора
  for (const [cx, cz] of [[-21, -35.1], [9.6, -35.1], [35.1, -9.6], [35.1, 18.5], [-35.1, 9.6], [-35.1, -16.5], [19.5, -35.1]]) {
    let n = 0;
    for (let i = 0; i < 10 && n < 4; i++) {
      const x = cx + (rng() - 0.5) * 2.2;
      const z = cz + (rng() - 0.5) * 2.2;
      if (zones.fenceDist(x, z) < 0.45 || !zones.free(x, z, 0.35)) continue;
      const kind = rng();
      prop('pumpkin', x, z, rng() * 6.28, r(0.65, 1.15), 0.4, kind < 0.2 ? 0xfff0c8 : kind < 0.32 ? 0xb8d890 : undefined);
      n++;
    }
  }

  // ---------------- камни и пни по лужайкам и углам
  for (let i = 0, n = 0; i < 300 && n < 16; i++) {
    const x = r(-35, 35);
    const z = r(-35, 35.3);
    if (Math.hypot(x, z) < 19 || !zones.free(x, z, 0.5)) continue;
    prop('stone_s', x, z, rng() * 6.28, r(0.7, 1.3), 0.3);
    n++;
  }
  for (let i = 0, n = 0; i < 200 && n < 6; i++) {
    const x = r(-35, 35);
    const z = r(-35, 35);
    if (Math.hypot(x, z) < 19 || !zones.free(x, z, 0.8)) continue;
    prop('stone_m', x, z, rng() * 6.28, r(0.8, 1.15), 0.6);
    n++;
  }
  for (const [x, z, yaw] of [[31.6, 25.6, 0.4], [26.0, 27.2, 2.1], [-33.6, -14.0, 1.2]] as const) if (zones.free(x, z, 0.6)) prop('stump', x, z, yaw, r(0.85, 1.1), 0.5);

  // ---------------- за забором: валуны, рулоны сена, стога, пни; камни на краю обрыва
  for (const [node, x, z, yaw, s] of [
    ['boulder', 41.5, -14, 0.3, 1.2], ['boulder', -42.5, 6, 2.0, 1.1], ['boulder', 39.6, -40.5, 1.0, 1.0], ['boulder', -40.2, -41.0, 2.6, 1.25],
    ['bale_round', 44.5, 4.5, 0.3, 1], ['bale_round', 46.2, 7.0, 1.4, 1], ['bale_round', -45, -12, 0.9, 1], ['bale_round', -47, 18, 0.2, 1],
    ['bale_round', 15, -47.5, 1.2, 1], ['bale_round', -18, -48.5, 2.5, 1],
    ['stump', 40.5, 12.5, 0.4, 1], ['stump', -39.5, 24.0, 1.4, 1.1], ['stone_m', 42, 20, 0.9, 1.3], ['stone_m', -43.5, -30, 2.2, 1.2],
  ] as const) prop(node, x, z, yaw, s, 0);
  far.push({ file: 'decor', node: 'haystack', x: 46, y: heightAt(46, -22), z: -22, yaw: 0.6, s: 1 });
  far.push({ file: 'decor', node: 'haystack', x: -47, y: heightAt(-47, -4), z: -4, yaw: 1.9, s: 1.1 });
  for (let x = -37; x < 37; x += r(4, 9)) {
    prop(rng() < 0.75 ? 'stone_s' : 'stone_m', x, r(36.6, 37.5), rng() * 6.28, r(0.7, 1.2), 0);
  }
  return { inst, props, far, marks, feats: { trees: [], bales: [] } };
}

// ------------------------------------------------------------ материал с ветром

const WIND_VERT = /* glsl */ `
#ifdef USE_INSTANCING
	vec4 decorRoot = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	float decorScale = length( instanceMatrix[ 1 ].xyz );
#else
	vec4 decorRoot = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
	float decorScale = 1.0;
#endif
	float decorFade = 1.0 - smoothstep( uDecorFade.x, uDecorFade.y, distance( decorRoot.xyz, cameraPosition ) );
	transformed *= decorFade;
	float decorT = uDecorTime * 1.7 + decorRoot.x * 0.21 + decorRoot.z * 0.17;
	float decorGust = 0.55 + 0.45 * sin( uDecorTime * 0.63 - decorRoot.x * 0.07 + decorRoot.z * 0.05 );
	vec2 decorWind = vec2( sin( decorT ) + 0.35 * sin( decorT * 2.3 + 1.7 ), 0.5 * cos( decorT * 0.8 + 0.5 ) ) * aSway * decorScale * decorFade * decorGust;
`;

function windMaterial(time: THREE.IUniform<number>, fade: readonly [number, number]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.78 });
  const uFade = { value: new THREE.Vector2(fade[0], fade[1]) };
  m.onBeforeCompile = (s) => {
    s.uniforms.uDecorTime = time;
    s.uniforms.uDecorFade = uFade;
    s.vertexShader = 'uniform float uDecorTime;\nuniform vec2 uDecorFade;\nattribute float aSway;\n' + s.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERT}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tmvPosition.xyz += ( viewMatrix * vec4( decorWind.x, 0.0, decorWind.y, 0.0 ) ).xyz;\n\tgl_Position = projectionMatrix * mvPosition;');
  };
  m.customProgramCacheKey = () => 'farm-decor-wind';
  m.name = 'farm_decor_wind';
  return m;
}

/** Части узла → одна геометрия: позиция, нормаль (с наклоном вверх), цвет RGB, aSway (0 у земли → sway у макушки) */
function plantGeometry(parts: readonly Part[], spec: KindSpec): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  let n = 0;
  let ni = 0;
  for (const p of parts) {
    n += p.geo.getAttribute('position').count;
    ni += p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count;
  }
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const sway = new Float32Array(n);
  const idx = new Uint32Array(ni);
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let o = 0;
  let oi = 0;
  let top = 0.01;
  for (const p of parts) {
    const P = p.geo.getAttribute('position');
    const N = p.geo.getAttribute('normal');
    const C = p.geo.getAttribute('color');
    nm.getNormalMatrix(p.matrix);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(p.matrix);
      pos.set([v.x, v.y, v.z], (o + i) * 3);
      top = Math.max(top, v.y);
      if (N) w.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      else w.set(0, 1, 0);
      w.lerp(new THREE.Vector3(0, 1, 0), spec.up).normalize();
      nrm.set([w.x, w.y, w.z], (o + i) * 3);
      if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], (o + i) * 3);
      else col.set([1, 1, 1], (o + i) * 3);
    }
    if (p.geo.index) for (let i = 0; i < p.geo.index.count; i++) idx[oi + i] = p.geo.index.getX(i) + o;
    else for (let i = 0; i < P.count; i++) idx[oi + i] = i + o;
    oi += p.geo.index ? p.geo.index.count : P.count;
    o += P.count;
  }
  for (let i = 0; i < n; i++) sway[i] = spec.sway * Math.pow(Math.max(0, pos[i * 3 + 1]) / top, 1.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------ слой растений: InstancedMesh + отбор по экрану

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Клетка сетки для отбора (м): густые слои перебирают только клетки рядом с камерой */
const CELL = 8;
const cellKey = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512);

class Layer {
  readonly mesh: THREE.InstancedMesh;
  private readonly mats: Float32Array;
  private readonly cols: Float32Array;
  private readonly at: Float32Array;
  /** клетка → [начало, конец) в отсортированных массивах */
  private readonly cells = new Map<number, [number, number]>();
  readonly spec: KindSpec;
  readonly n: number;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, spec: KindSpec, items: readonly Item[]) {
    this.spec = spec;
    const n = items.length;
    this.n = n;
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = `farm-decor-${spec.node}`;
    this.mats = new Float32Array(n * 16);
    this.cols = new Float32Array(n * 3);
    this.at = new Float32Array(n * 4);
    const key = (it: Item) => cellKey(Math.floor(it.x / CELL), Math.floor(it.z / CELL));
    const order = items.map((_, i) => i).sort((p, q) => key(items[p]) - key(items[q]));
    order.forEach((src, i) => {
      const it = items[src];
      _e.set(it.tilt, it.yaw, it.tilt * 0.6, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.s, it.s, it.s));
      _m.toArray(this.mats, i * 16);
      this.cols.set(it.tint, i * 3);
      this.at.set([it.x, it.y + 0.3 * it.s, it.z, spec.bound * it.s], i * 4);
      const k = key(it);
      const c = this.cells.get(k);
      if (c) c[1] = i + 1;
      else this.cells.set(k, [i, i + 1]);
    });
  }

  /** Оставить только то, что ближе cull и попадает в (расширенный) кадр */
  cull(cam: THREE.Vector3, frustum: THREE.Frustum): void {
    const lim = this.spec.cull;
    let k = 0;
    if (this.n > 1500) {
      const x0 = Math.floor((cam.x - lim) / CELL);
      const x1 = Math.floor((cam.x + lim) / CELL);
      const z0 = Math.floor((cam.z - lim) / CELL);
      const z1 = Math.floor((cam.z + lim) / CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const c = this.cells.get(cellKey(cx, cz));
          if (c) k = this.range(c[0], c[1], k, cam, frustum);
        }
      }
    } else {
      k = this.range(0, this.n, 0, cam, frustum);
    }
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, k * 16);
    im.needsUpdate = true;
    const ic = this.mesh.instanceColor!;
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, k * 3);
    ic.needsUpdate = true;
  }

  private range(from: number, to: number, k: number, cam: THREE.Vector3, frustum: THREE.Frustum): number {
    const planes = frustum.planes;
    const lim2 = this.spec.cull * this.spec.cull;
    const dst = this.mesh.instanceMatrix.array as Float32Array;
    const dc = this.mesh.instanceColor!.array as Float32Array;
    for (let i = from; i < to; i++) {
      const x = this.at[i * 4];
      const y = this.at[i * 4 + 1];
      const z = this.at[i * 4 + 2];
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > lim2) continue;
      const pad = this.at[i * 4 + 3] + 1.5 + Math.sqrt(d2) * 0.12;
      let out = false;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -pad) { out = true; break; }
      }
      if (out) continue;
      dst.set(this.mats.subarray(i * 16, i * 16 + 16), k * 16);
      dc.set(this.cols.subarray(i * 3, i * 3 + 3), k * 3);
      k++;
    }
    return k;
  }
}

// ------------------------------------------------------------ всё вместе

const _pv = new THREE.Matrix4();
const _dir = new THREE.Vector3();

export class FarmDecor {
  readonly group = new THREE.Group();
  /** Модели загружены и всё расставлено (world.ts ждёт это до снятия экрана загрузки) */
  readonly ready: Promise<void>;
  private readonly time = { value: 0 };
  private readonly layers: Layer[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly lastPos = new THREE.Vector3(1e9, 0, 0);
  private readonly lastDir = new THREE.Vector3();
  private lastProj = 0;
  private readonly camera: THREE.Camera;
  /** Сколько заняла сборка при входе (мс): раскладка и рисование земли — для замеров */
  readonly buildMs: { plan: number; paint: number };

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.group.name = 'farm-decor';
    scene.add(this.group);
    const t0 = performance.now();
    const zones = new FarmZones();
    // 0,85 на компьютере — режим вместе с уровнем не больше 500 тыс. треугольников (AGENTS.md, раздел 7)
    const plan = makePlan(zones, TOUCH ? 0.55 : 0.85);
    const t1 = performance.now();
    this.group.add(nearMesh(paintNear(zones, plan.marks, TOUCH ? 1024 : 2048)));
    this.group.add(farMesh(paintFar(TOUCH ? 1024 : 2048, TOUCH ? 512 : 1024, plan.feats)));
    this.buildMs = { plan: Math.round(t1 - t0), paint: Math.round(performance.now() - t1) };
    this.ready = this.load(plan);
  }

  private async load(plan: Plan): Promise<void> {
    const files = ['decor_grass', 'decor_flowers', 'decor_bushes', 'decor_props', 'trees', 'decor'];
    const models = new Map<string, FarmModel>();
    for (const m of await Promise.all(files.map((f) => loadModel(f)))) models.set(m.name, m);
    const node = (file: string, name: string) => models.get(file)?.nodes.get(name);

    // растения — по InstancedMesh на вид; материалы: ближний (трава) и дальний (кусты, подсолнухи) — одна программа
    const mats = new Map<string, THREE.Material>();
    for (const k of KIND_LIST) {
      const spec = KINDS[k];
      const items = plan.inst[k];
      if (!items.length) continue;
      const geo = plantGeometry(node(spec.file, spec.node) ?? [], spec);
      if (!geo) continue;
      const key = spec.fade.join('-');
      let mat = mats.get(key);
      if (!mat) { mat = windMaterial(this.time, spec.fade); mats.set(key, mat); }
      const layer = new Layer(geo, mat, spec, items);
      this.layers.push(layer);
      this.group.add(layer.mesh);
    }

    // неподвижная мелочь фермы — склейка по материалу, с тенями
    const near = new StaticBatch();
    const tinted = new Map<string, Part[]>();
    for (const p of plan.props) {
      let parts = node(p.file, p.node);
      if (!parts) continue;
      if (p.tint !== undefined) parts = tintParts(tinted, `${p.file}/${p.node}/${p.tint}`, parts, p.tint);
      near.add(parts, _m.compose(_p.set(p.x, p.y, p.z), _q.setFromAxisAngle(_s.set(0, 1, 0), p.yaw), _s.set(p.s, p.s, p.s)));
    }
    for (const mesh of near.build(true)) {
      mesh.name = 'farm-decor-props';
      this.group.add(mesh);
    }

    // дальний план: деревья у изгородей и рощицы, рулоны сена на полях, стога, обрыв к морю — без теней
    const far = new StaticBatch();
    const treeNode = { cypress: 'tree_cypress', linden: 'tree_linden', apple: 'tree_apple' } as const;
    const rng = makeRng(99);
    for (const t of plan.feats.trees) {
      const s = 0.85 + rng() * 0.5;
      far.add(node('trees', treeNode[t.kind]), _m.compose(_p.set(t.x, heightAt(t.x, t.z) - 0.1, t.z), _q.setFromAxisAngle(_s.set(0, 1, 0), rng() * 6.28), _s.set(s, s * (t.kind === 'cypress' ? 1.1 + rng() * 0.3 : 1), s)));
    }
    for (const b of plan.feats.bales) far.add(node('decor_props', 'bale_round'), _m.compose(_p.set(b.x, heightAt(b.x, b.z) - 0.05, b.z), _q.setFromAxisAngle(_s.set(0, 1, 0), b.yaw), _s.set(1, 1, 1)));
    for (const p of plan.far) far.add(node(p.file, p.node), _m.compose(_p.set(p.x, p.y, p.z), _q.setFromAxisAngle(_s.set(0, 1, 0), p.yaw), _s.set(p.s, p.s, p.s)));
    const soft = node('decor_props', 'stone_s')?.[0]?.mat;
    if (soft) far.add([{ geo: cliffGeometry(), mat: soft, matrix: new THREE.Matrix4() }], new THREE.Matrix4());
    for (const mesh of far.build(false)) {
      mesh.name = 'farm-decor-far';
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    this.lastPos.set(1e9, 0, 0);
  }

  /** Каждый кадр: время ветра; отбор экземпляров — только когда камера сдвинулась или повернулась */
  update(t: number): void {
    this.time.value = t;
    if (!this.layers.length) return;
    const cam = this.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(_dir);
    const proj = cam.projectionMatrix.elements[0] * 31 + cam.projectionMatrix.elements[5];
    const pos = cam.getWorldPosition(_p);
    if (pos.distanceToSquared(this.lastPos) < 0.36 && _dir.dot(this.lastDir) > 0.9986 && proj === this.lastProj) return;
    this.lastPos.copy(pos);
    this.lastDir.copy(_dir);
    this.lastProj = proj;
    _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(_pv);
    for (const l of this.layers) l.cull(pos, this.frustum);
  }
}

/** Копия частей с перекрашенными вершинами (тыквы: белая, зелёная) — кэш по ключу */
function tintParts(cache: Map<string, Part[]>, key: string, parts: readonly Part[], hex: number): Part[] {
  let out = cache.get(key);
  if (out) return out;
  const t = new THREE.Color(hex);
  out = parts.map((p) => {
    const geo = p.geo.clone();
    const c = geo.getAttribute('color');
    if (c) {
      for (let i = 0; i < c.count; i++) {
        // к оттенку tint, сохраняя светлоту рёбер
        const r = c.getX(i);
        const g = c.getY(i);
        const b = c.getZ(i);
        const l = 0.3 * r + 0.55 * g + 0.15 * b;
        const orange = r > g * 1.25 && r > b * 1.6;
        if (orange) c.setXYZ(i, t.r * l * 1.9, t.g * l * 1.9, t.b * l * 1.9);
      }
      c.needsUpdate = true;
    }
    return { geo, mat: p.mat, matrix: p.matrix };
  });
  cache.set(key, out);
  return out;
}

/** Точка входа для world.ts: земля сразу, растения и предметы — когда загрузятся модели (decor.ready) */
export function buildFarmDecor(scene: THREE.Scene, camera: THREE.Camera): FarmDecor {
  return new FarmDecor(scene, camera);
}
