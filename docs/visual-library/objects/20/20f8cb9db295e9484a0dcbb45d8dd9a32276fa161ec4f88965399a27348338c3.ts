// Геометрия кандидатов существует только в примерочной, вне игрового каталога.
import * as THREE from 'three';
import type { FittingTransform } from '../../shared/fitting-room.ts';
import { bodyR, col, merge, tube, type Wear } from '../render/outfit3d.ts';

const OLIVE = 0x6b7652, CREAM = 0xe4d5b5, TERRA = 0xb96b4b, DARK = 0x39483b;
type Geo = THREE.BufferGeometry;
type Point = [number, number, number];

function painted(g: Geo, color: number): Geo {
  const p = col(g, color);
  if (p !== g) g.dispose();
  return p;
}

function lathe(profile: Point[] | [number, number][], color: number): Geo {
  return painted(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 36), color);
}

function ball(r: number, x: number, y: number, z: number, color: number, sx = 1, sy = 1, sz = 1): Geo {
  return painted(new THREE.SphereGeometry(r, 12, 8).scale(sx, sy, sz).translate(x, y, z), color);
}

function bodyLine(yAt: (phi: number) => number, color: number, radius = .016): Geo {
  const points: Point[] = [];
  for (let i = 0; i <= 48; i++) {
    const phi = i / 48 * Math.PI * 2, y = yAt(phi), r = bodyR(y) + .065;
    points.push([r * Math.sin(phi), y, r * Math.cos(phi)]);
  }
  return painted(tube(points, radius, 48), color);
}

function beanie(color: number): Geo[] {
  // Верх эллипсоида: частые кольца дают круглое плечо и почти горизонтальную макушку.
  const capRadius = bodyR(1.30) + .047;
  const cap = Array.from({ length: 17 }, (_, i): [number, number] => {
    const a = i / 16 * Math.PI / 2;
    return [i === 16 ? 0 : capRadius * Math.cos(a), 1.30 + .45 * Math.sin(a)];
  });
  const cuffRadius = bodyR(1.255) + .078;
  const cuff = [[bodyR(1.255) + .029, 1.255], [cuffRadius - .010, 1.255],
    [cuffRadius, 1.27], [cuffRadius, 1.41], [cuffRadius - .014, 1.425],
    [capRadius * .975, 1.425]] as [number, number][];
  const parts = [lathe(cap, color), lathe(cuff, CREAM)];
  // Рельеф вязки — геометрия, поэтому шапка остаётся читаемой и без текстуры.
  for (let i = 0; i < 24; i++) {
    const phi = i / 24 * Math.PI * 2;
    const points = cap.slice(1, -1).map(([r, y]): Point => [(r + .006) * Math.sin(phi), y, (r + .006) * Math.cos(phi)]);
    parts.push(painted(tube(points, .004, 28), 0x5a6447));
  }
  for (let i = 0; i < 32; i++) {
    const phi = i / 32 * Math.PI * 2, r = cuffRadius + .003;
    parts.push(painted(tube([[r * Math.sin(phi), 1.275, r * Math.cos(phi)],
      [r * Math.sin(phi), 1.34, r * Math.cos(phi)], [r * Math.sin(phi), 1.407, r * Math.cos(phi)]], .004, 8), 0xd6c5a4));
  }
  const patchR = cuffRadius + .009;
  parts.push(painted(new THREE.CylinderGeometry(.038, .038, .012, 20).rotateZ(Math.PI / 2).rotateY(.35)
    .translate(patchR * Math.cos(.35), 1.335, -patchR * Math.sin(.35)), TERRA));
  return parts;
}

function panama(color: number): Geo[] {
  const parts = [
    lathe([[.385, 1.37], [.34, 1.51], [.25, 1.70], [0, 1.75]], color),
    lathe([[bodyR(1.32) + .042, 1.32], [.62, 1.32], [.62, 1.35], [bodyR(1.36) + .045, 1.36]], CREAM),
    lathe([[.377, 1.405], [.36, 1.45]], OLIVE),
  ];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    parts.push(ball(.029, .34 + Math.cos(a) * .052, 1.46 + Math.sin(a) * .052, -.28, 0xfff9e8, .75, 1.2, .36));
  }
  parts.push(ball(.026, .34, 1.46, -.294, 0xd3a444, 1, 1, .45));
  // Несколько соломенных кругов — одна склеенная отрисовка с остальной шляпой.
  for (const [r, y] of [[.364, 1.44], [.331, 1.54], [.286, 1.64]])
    parts.push(painted(new THREE.TorusGeometry(r, .004, 4, 36).rotateX(Math.PI / 2).translate(0, y, 0), 0xba9867));
  return parts;
}

function bag(color: number): Geo[] {
  return [
    bodyLine(phi => .95 - .30 * Math.sin(phi), OLIVE, .025),
    painted(tube([[bodyR(.65) + .065, .65, 0], [.625, .73, 0], [.66, .785, 0]], .022, 12), OLIVE),
    painted(new THREE.BoxGeometry(.20, .32, .20, 2, 2, 1).rotateZ(-.10).translate(.66, .63, 0), color),
    painted(new THREE.BoxGeometry(.19, .14, .024).rotateZ(-.10).translate(.655, .72, -.112), OLIVE),
    painted(new THREE.BoxGeometry(.050, .060, .014).translate(.65, .665, -.132), CREAM),
    painted(tube([[.575, .50, -.112], [.66, .475, -.112], [.747, .50, -.112]], .005, 12), CREAM),
  ];
}

function camera(color: number): Geo[] {
  return [
    bodyLine(phi => 1.10 - .20 * Math.cos(phi), DARK),
    painted(new THREE.BoxGeometry(.35, .23, .14).translate(0, .84, -.638), color),
    painted(new THREE.BoxGeometry(.13, .035, .10).translate(.075, .973, -.63), CREAM),
    painted(new THREE.CylinderGeometry(.077, .085, .10, 24).rotateX(Math.PI / 2).translate(-.025, .845, -.752), DARK),
    painted(new THREE.CylinderGeometry(.060, .060, .014, 24).rotateX(Math.PI / 2).translate(-.025, .845, -.815), 0x40736e),
    painted(new THREE.BoxGeometry(.047, .03, .01).translate(.119, .902, -.715), 0xffefcf),
    painted(tube([[-.23, 1.19, -.44], [-.24, 1.04, -.59], [-.16, .91, -.62]], .016, 16), OLIVE),
    painted(tube([[.23, 1.19, -.44], [.24, 1.04, -.59], [.16, .91, -.62]], .016, 16), OLIVE),
  ];
}

function glasses(color: number): Geo[] {
  const parts = [-1, 1].map(s => painted(new THREE.TorusGeometry(.106, .012, 6, 28).translate(s * .136, 1.17, -.505), color));
  parts.push(painted(tube([[-.035, 1.185, -.507], [0, 1.21, -.509], [.035, 1.185, -.507]], .01, 12), color));
  for (const s of [-1, 1]) {
    const points: Point[] = [[s * .242, 1.17, -.505]];
    for (let i = 0; i <= 12; i++) {
      const phi = Math.PI - .55 - i / 12 * .9, y = 1.18, r = bodyR(y) + .045;
      points.push([s * r * Math.sin(phi), y, r * Math.cos(phi)]);
    }
    parts.push(painted(tube(points, .010, 24), color));
  }
  return parts;
}

function crab(color: number): Geo[] {
  const x = -.55, y = 1.27;
  const parts = [ball(.095, x, y, 0, color, 1.2, .62, .85)];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const z = (i - 1) * .048;
      parts.push(painted(tube([[x + s * .07, y, z], [x + s * .15, y - .035, z - .012], [x + s * .18, y - .085, z]], .01, 10), color));
    }
    parts.push(painted(tube([[x + s * .055, y, -.06], [x + s * .12, y + .03, -.13]], .016, 8), color));
    parts.push(ball(.035, x + s * .14, y + .044, -.146, color, 1, 1.1, .7));
    parts.push(painted(tube([[x + s * .042, y + .025, -.045], [x + s * .046, y + .09, -.065]], .009, 8), color));
    parts.push(ball(.016, x + s * .046, y + .09, -.065, 0x242f28));
  }
  return parts;
}

export function createFittingWear(key: string, color?: string): Wear | null {
  const tint = color && /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : null;
  const defs: Record<string, [() => Geo[], number]> = {
    'harbor-beanie': [() => beanie(tint ?? OLIVE), 1.35],
    'flower-panama': [() => panama(tint ?? 0xd9ba83), 1.42],
    'messenger-bag': [() => bag(tint ?? TERRA), .94],
    camera: [() => camera(tint ?? 0x65735b), .9],
    'round-glasses': [() => glasses(tint ?? TERRA), 1.17],
    'crab-buddy': [() => crab(tint ?? TERRA), 1.23],
  };
  if (!Object.hasOwn(defs, key)) return null;
  const [factory, y] = defs[key], parts = factory();
  for (const g of parts) g.translate(0, -y, key === 'round-glasses' ? .4 : 0);
  const geo = merge(parts);
  for (const g of parts) g.dispose();
  return { geo, metal: null, y };
}

/** Настройки вещи применяются к копии; общие игровые геометрии остаются целыми. */
export function transformFittingWear(wear: Wear, transform?: FittingTransform): Wear {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...(transform?.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(transform?.rotation ?? [0, 0, 0]))),
    new THREE.Vector3().setScalar(transform?.scale ?? 1),
  );
  return { geo: wear.geo?.clone().applyMatrix4(matrix) ?? null, metal: wear.metal?.clone().applyMatrix4(matrix) ?? null, y: wear.y };
}

/** Отдельная вещь в координатах тела, без тела, света, фона и игровых шейдеров. */
export function fittingWearObject(wear: Wear, slot: string): THREE.Group {
  const root = new THREE.Group();
  root.position.set(0, wear.y, slot === 'e' ? -.4 : 0);
  if (wear.geo) root.add(new THREE.Mesh(wear.geo.clone(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .68, side: THREE.DoubleSide })));
  if (wear.metal) root.add(new THREE.Mesh(wear.metal.clone(), new THREE.MeshStandardMaterial({ color: 0xd4a93a, metalness: .85, roughness: .3, side: THREE.DoubleSide })));
  return root;
}
