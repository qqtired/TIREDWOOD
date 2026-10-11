// Огни новой набережной (WP8): гирлянды между фонарями и под перголой веранды, пятна света на земле. Старые buildGarlands/
// buildLightPools (client/lobby/world.ts) в plaza3 не строятся — здесь то же по-новому и дешевле: никаких настоящих ламп
// (бюджет docs/plaza3/tech-foundation.md §5 — лампы уже заняты POINT_LIGHTS), всё светится яркостью: провод — один
// LineSegments, лампочки — один InstancedMesh, ореолы — один Points, пятна света — ОДИН склеенный меш с аддитивным ореолом
// (в старой площади их было 10 отдельных). Итого 4 отрисовки на всю площадь. Все четыре объекта лежат в ctx.powered:
// гаснут вместе с городом (гроза шторма, ночной режим) без пересборки программ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CANOPY_POLES, CANOPY_POLE_H, type LobbyMap } from '../../../shared/maps/lobby.ts';
import { P3 } from '../../../shared/plaza3/layout.ts';
import { glowTexture } from '../../render/kit.ts';
import type { VenueCtx } from '../plaza/venue.ts';
import { DECAL_LIFT } from './floor.ts';

type V3 = readonly [number, number, number];

/** Нить гирлянды: концы, провис в середине (м), цветные ли лампочки (веранда) или тёплые (фонари) */
export interface Garland {
  a: V3;
  b: V3;
  sag: number;
  colored: boolean;
}

/** Пятно света на земле: центр, размеры, цвет и сила */
export interface Pool {
  x: number;
  z: number;
  w: number;
  d: number;
  color: number;
  opacity: number;
}

/**
 * Высота пятен света: как на старой площади (1,2 см) плюс подъём наклеек plaza3 — выше площади, розы, дорожек и плитки
 * моделей (plaza3/floor.ts). Раньше пятна лежали под площадью и дорожками и то пропадали, то проступали по мере подхода.
 */
const POOL_Y = 0.012 + DECAL_LIFT;
/** Тёплый свет ламп накаливания (как LAMP в world.ts) */
const LAMP = 0xffb46a;
/** Высота головки фонаря и крепления нити у верха столба; лампочка висит чуть ниже провода */
const POST_Y = 4.75;
/** Нити между фонарями не длиннее (м): кольцо фонарей вокруг розы ветров открыто на бульвар — через разрыв не тянем */
const LAMP_SPAN = 16;
const BULB_STEP = 0.45;
const WARM = [0xffdcaa, 0xffd090, 0xffe6c0];
const RETRO = [0xff6b5a, 0xffd25a, 0x7ad67a, 0x6fa8ff, 0xffa14a];

/** Нити между соседними фонарями (расстояние не больше LAMP_SPAN) */
export function lampGarlands(lamps: ReadonlyArray<{ x: number; z: number }>): Garland[] {
  const out: Garland[] = [];
  for (let i = 0; i < lamps.length; i++) {
    for (let j = i + 1; j < lamps.length; j++) {
      const d = Math.hypot(lamps[j].x - lamps[i].x, lamps[j].z - lamps[i].z);
      if (d > LAMP_SPAN) continue;
      out.push({ a: [lamps[i].x, POST_Y, lamps[i].z], b: [lamps[j].x, POST_Y, lamps[j].z], sag: d > 12 ? 1.5 : 1.1, colored: false });
    }
  }
  return out;
}

/**
 * Нити под низкой перголой веранды (CANOPY_POLES: два ряда стоек, крыша из реек): вдоль рядов, поперёк по торцам и зигзагом
 * между рядами — как была на старой террасе. Лампочки не ниже 2,3 м над настилом (рост игрока 1,8 м).
 */
export function pergolaGarlands(poles: ReadonlyArray<readonly [number, number]>, poleH: number): Garland[] {
  const zs = [...new Set(poles.map((p) => p[1]))].sort((a, b) => a - b);
  if (zs.length !== 2) return [];
  const row = (z: number) => poles.filter((p) => p[1] === z).map((p) => p[0]).sort((a, b) => a - b);
  const [n, s] = [row(zs[0]), row(zs[1])];
  if (n.length < 2 || s.length < 2) return [];
  const y = poleH - 0.08;
  const at = (x: number, z: number): V3 => [x, y, z];
  const out: Garland[] = [];
  // У новой модели крайняя южная стойка снята. Продольные нити каждого ряда и торцы по реальным
  // опорам сохраняют целую сеть без выдуманной шестой стойки и исчезновения всей гирлянды.
  for (const [r, z] of [[n, zs[0]], [s, zs[1]]] as const) for (let i = 0; i + 1 < r.length; i++) {
    out.push({ a: at(r[i], z), b: at(r[i + 1], z), sag: 0.3, colored: true });
  }
  for (let i = 0; i + 1 < Math.min(n.length, s.length); i++) {
    out.push({ a: at(n[i], zs[0]), b: at(s[i + 1], zs[1]), sag: 0.35, colored: true });
    out.push({ a: at(s[i], zs[1]), b: at(n[i + 1], zs[0]), sag: 0.35, colored: true });
  }
  out.push({ a: at(n[0], zs[0]), b: at(s[0], zs[1]), sag: 0.3, colored: true });
  out.push({ a: at(n[n.length - 1], zs[0]), b: at(s[s.length - 1], zs[1]), sag: 0.3, colored: true });
  return out;
}

/** Середина бокса павильона из layout.json (null — павильона без бокса нет) */
function pavilionCenter(id: string): { x: number; z: number } | null {
  const b = P3.pavilions.find((p) => p.id === id)?.box;
  return b ? { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 } : null;
}

/** Пятна света: под фонарями, у входов в арены, под верандой, у примерочной, курзала, ротонды и бильярдной (всё — из layout.json) */
export function lightPools(map: Pick<LobbyMap, 'deco' | 'zones'>): Pool[] {
  const out: Pool[] = [];
  for (const d of map.deco) {
    if (d.kind !== 'lamp') continue;
    out.push({ x: d.x - Math.sin(d.yaw) * 1.2, z: d.z - Math.cos(d.yaw) * 1.2, w: 7, d: 7, color: LAMP, opacity: 0.2 });
  }
  const gate = P3.lobby.pbGate;
  out.push({ x: gate.x, z: gate.z + 0.8, w: 7.5, d: 6.5, color: 0xffa850, opacity: 0.32 });
  out.push({ x: P3.modes.fortArch.x, z: P3.modes.fortArch.z + 0.8, w: 7, d: 6, color: 0xffa850, opacity: 0.28 });
  out.push({ x: P3.modes.kartStart.x, z: P3.modes.kartStart.z - 1.2, w: 7, d: 6, color: 0xffa850, opacity: 0.22 });
  const t = map.zones.terrace;
  out.push({ x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, w: t.x1 - t.x0 + 4, d: t.z1 - t.z0 + 4, color: 0xffa860, opacity: 0.14 });
  const k = P3.lobby.kiosk;
  out.push({ x: k.x - 1, z: k.z - 0.4, w: 4, d: 4, color: 0xffb060, opacity: 0.2 });
  const a = map.zones.arcade;
  out.push({ x: (a.x0 + a.x1) / 2, z: a.z1 + 1.4, w: a.x1 - a.x0 - 4, d: 5, color: 0xffa850, opacity: 0.22 });
  const rot = pavilionCenter('rotunda');
  if (rot) out.push({ x: rot.x, z: rot.z, w: 10, d: 10, color: 0xffb060, opacity: 0.14 });
  const bil = pavilionCenter('billiards');
  if (bil) out.push({ x: bil.x, z: bil.z, w: 9, d: 6, color: 0xffb060, opacity: 0.16 });
  return out;
}

/** Всё, что новая площадь вешает и кладёт из света (для теста и замера) */
export function plaza3Garlands(map: Pick<LobbyMap, 'deco'>): Garland[] {
  const lamps = map.deco.filter((d) => d.kind === 'lamp');
  return [...lampGarlands(lamps), ...pergolaGarlands(CANOPY_POLES, CANOPY_POLE_H)];
}

/** Точка нити в долях длины t: прямая и провис параболой */
export function garlandAt(g: Garland, t: number): V3 {
  return [g.a[0] + (g.b[0] - g.a[0]) * t, g.a[1] + (g.b[1] - g.a[1]) * t - g.sag * 4 * t * (1 - t), g.a[2] + (g.b[2] - g.a[2]) * t];
}

/** Число лампочек на нити */
export function bulbCount(g: Garland): number {
  return Math.max(2, Math.round(Math.hypot(g.b[0] - g.a[0], g.b[2] - g.a[2]) / BULB_STEP));
}

export interface Plaza3Lights {
  readonly group: THREE.Group;
  debug(): Record<string, unknown>;
}

/**
 * Строит огни и кладёт их в ctx.powered (гаснут вместе с городом). Четыре отрисовки: провод, лампочки, ореолы, пятна.
 * glow — материалу ореолов дымку огней города (world.ts far(m, true)): та же программа, что у огней задника (бюджет 80,
 * perf.ts); ближе 40 м и в ясную погоду ореолы не меняются, дальше в дождь чуть тускнеют, как огни города.
 */
export function buildPlaza3Lights(ctx: VenueCtx, map: Pick<LobbyMap, 'deco' | 'zones'>, glow?: (m: THREE.Material) => void): Plaza3Lights {
  const group = new THREE.Group();
  group.name = 'plaza3-lights';
  const strings = plaza3Garlands(map);

  const wire: number[] = [];
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const g of strings) {
    const n = bulbCount(g);
    for (let i = 0; i < n * 2; i++) wire.push(...garlandAt(g, i / (n * 2)), ...garlandAt(g, (i + 1) / (n * 2)));
    for (let i = 0; i < n; i++) {
      const p = garlandAt(g, (i + 0.5) / n);
      c.setHex(g.colored ? RETRO[i % RETRO.length] : WARM[i % WARM.length]);
      pos.push(p[0], p[1] - 0.06, p[2]);
      col.push(c.r, c.g, c.b);
    }
  }
  const count = pos.length / 3;
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wire, 3)), new THREE.LineBasicMaterial({ color: 0x1c1a18 }));
  lines.frustumCulled = true;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    bulbs.setMatrixAt(i, m4.makeTranslation(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    bulbs.setColorAt(i, c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
  }
  const halo = new THREE.BufferGeometry();
  halo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  halo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const halos = new THREE.Points(halo, new THREE.PointsMaterial({
    size: 0.55, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  glow?.(halos.material);

  // пятна света — один меш: цвет и сила запечены в цвет вершин (аддитивно это то же, что opacity у отдельных наклеек)
  const pools = lightPools(map);
  const quads = pools.map((p) => {
    const g = new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2).translate(p.x, POOL_Y, p.z);
    const k = new THREE.Color(p.color).multiplyScalar(p.opacity);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([k.r, k.g, k.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  const poolMesh = new THREE.Mesh(
    mergeGeometries(quads, false)!,
    new THREE.MeshBasicMaterial({
      map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }),
  );
  poolMesh.renderOrder = 2;
  poolMesh.matrixAutoUpdate = false;

  group.add(lines, bulbs, halos, poolMesh);
  ctx.scene.add(group);
  for (const o of [lines, bulbs, halos, poolMesh]) ctx.powered.push(o);
  return { group, debug: () => ({ strings: strings.length, bulbs: count, pools: pools.length, draws: 4 }) };
}
