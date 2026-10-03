// Заготовки набора A: шаг без скольжения стоп, капли и пятна варенья, светящиеся глаза, токарные тела.
// Всё строится один раз при загрузке модуля; функции позы (leg, die…) — без выделений памяти.
import * as THREE from 'three';
import { ARMY, MOB_STRIDE, colored, merge } from './kit.ts';

export const TAU = Math.PI * 2;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smooth(u: number): number {
  const x = clamp01(u);
  return x * x * (3 - 2 * x);
}

/** Тело вращения по парам [радиус, высота] снизу вверх */
export function lathe(points: ReadonlyArray<readonly [number, number]>, segments: number, hex: number): THREE.BufferGeometry {
  return colored(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), hex);
}

/** Зеркало по X (правая рука из левой): масштаб −1 и обратный обход треугольников, иначе грани смотрят внутрь */
export function mirrorX(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.scale(-1, 1, 1);
  for (const name of Object.keys(g.attributes)) {
    const attr = g.getAttribute(name) as THREE.BufferAttribute;
    const n = attr.itemSize;
    const arr = attr.array as Float32Array;
    for (let t = 0; t + 2 < attr.count; t += 3) {
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k;
        const i2 = (t + 2) * n + k;
        const tmp = arr[i1];
        arr[i1] = arr[i2];
        arr[i2] = tmp;
      }
    }
    attr.needsUpdate = true;
  }
  return g;
}

const _pc = new THREE.Color();

/** Раскрасить по вершинам: fn(x, y, z, цвет) — перелив, блик, тень снизу (геометрия делается неиндексной) */
export function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, out: THREE.Color) => void): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute('position');
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), _pc);
    arr[i * 3] = _pc.r;
    arr[i * 3 + 1] = _pc.g;
    arr[i * 3 + 2] = _pc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Эллипсоид */
export function blob(rx: number, ry: number, rz: number, hex: number, w = 10, h = 8): THREE.BufferGeometry {
  return colored(new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz), hex);
}

/** Пятно варенья на поверхности: приплюснутая капля, нормаль (nx, ny, nz) — наружу */
export function splat(x: number, y: number, z: number, r: number, nx: number, ny: number, nz: number, hex: number = ARMY.jam): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 7, 4).scale(1, 1, 0.32);
  g.lookAt(new THREE.Vector3(nx, ny, nz));
  return colored(g.translate(x, y, z), hex);
}

/** Капля варенья, стекающая вниз: потёк и круглая капля на конце */
export function drip(x: number, y: number, z: number, len: number, r: number, hex: number = ARMY.jam): THREE.BufferGeometry {
  return merge([
    colored(new THREE.CylinderGeometry(r * 0.75, r * 0.95, len, 5, 1, true).translate(x, y - len / 2, z), hex),
    colored(new THREE.SphereGeometry(r * 1.25, 6, 4).translate(x, y - len, z), hex),
  ]);
}

/** Пара светящихся сиреневых глаз (часть glow): центр между глазами, расстояние, радиус; смотрят по +Z */
export function eyePair(cx: number, cy: number, cz: number, gap: number, r: number, squint = 1, hex: number = ARMY.eye): THREE.BufferGeometry {
  return merge([-1, 1].map((s) => colored(new THREE.SphereGeometry(r, 9, 6).scale(1, squint, 0.55).translate(cx + s * gap / 2, cy, cz), hex)));
}

/** Нога в фазе шага: угол от бедра (минус — вперёд), сжатие по высоте в переносе, стоит ли на земле */
export interface LegState {
  rx: number;
  sy: number;
  down: boolean;
  /** Насколько бедро над землёй, если нога опорная (длина × cos угла) */
  hip: number;
}

export function newLeg(): LegState {
  return { rx: 0, sy: 1, down: true, hip: 1 };
}

/**
 * Опора [0, duty): стопа едет назад ровно со скоростью тела — не скользит; перенос: вперёд с подъёмом lift.
 * step — путь стопы за опору в осях модели, len — длина ноги от бедра до земли.
 */
export function legAt(p: number, duty: number, step: number, len: number, lift: number, out: LegState): LegState {
  const q = p - Math.floor(p);
  let z: number;
  let up = 0;
  if (q < duty) {
    z = step * (0.5 - q / duty);
    out.down = true;
  } else {
    const u = (q - duty) / (1 - duty);
    z = step * (smooth(u) - 0.5);
    up = lift * Math.sin(Math.PI * u);
    out.down = false;
  }
  const s = Math.max(-0.95, Math.min(0.95, z / len));
  out.rx = -Math.asin(s);
  out.hip = len * Math.cos(out.rx);
  out.sy = 1 - up / len;
  return out;
}

/** Путь стопы за опору для n шагов-циклов на период походки (MOB_STRIDE) при доле опоры duty, в осях модели масштаба s */
export function stepLen(n: number, duty: number, s: number): number {
  return (MOB_STRIDE / n) * duty / s;
}

/** Ходьба 0…1 от скорости: на месте — 0, с полной — 1 */
export function walkAmount(speed: number, full: number): number {
  return clamp01(speed / full);
}

/** Вздрагивание: короткий толчок назад, затухает к 0 */
export function jolt(hit: number): number {
  return hit * hit * (3 - 2 * hit);
}
