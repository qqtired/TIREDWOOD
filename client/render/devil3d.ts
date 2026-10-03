// Small sculpted costume pieces. All surfaces join the existing cached vertex-color outfit mesh;
// no textures, extra materials, independent animation loop or per-avatar geometry allocations.
import * as THREE from 'three';

type Point = [number, number, number];
const SCARLET = new THREE.Color(0xf1342a);
const ROOT_RED = new THREE.Color(0xba182c);

/** Closed, smoothly lit tapered sweep. Frames follow the curve, so curled tips remain circular. */
function sweep(points: Point[], radius: (t: number) => number, steps: number, sides: number, width = 1): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const frames = path.computeFrenetFrames(steps, false);
  const positions: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
  const v = new THREE.Vector3();
  const shade = new THREE.Color();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, center = path.getPointAt(t), r = radius(t);
    // A restrained deeper red at the roots, bright vermilion on the curved tip.
    shade.copy(ROOT_RED).lerp(SCARLET, .65 + .35 * Math.sin(t * Math.PI / 2));
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2;
      v.copy(center).addScaledVector(frames.normals[i], Math.cos(angle) * r)
        .addScaledVector(frames.binormals[i], Math.sin(angle) * r * width);
      positions.push(v.x, v.y, v.z);
      colors.push(shade.r, shade.g, shade.b);
      uv.push(t, j / sides);
      if (i < steps && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  // End caps have their own rim normals; otherwise a flat cap dents the smooth tube shading.
  for (const end of [0, steps]) {
    const center = path.getPointAt(end / steps);
    const base = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    colors.push(SCARLET.r, SCARLET.g, SCARLET.b); uv.push(.5, .5);
    for (let j = 0; j <= sides; j++) {
      const k = (end * (sides + 1) + j) * 3;
      positions.push(positions[k], positions[k + 1], positions[k + 2]);
      colors.push(colors[k], colors[k + 1], colors[k + 2]); uv.push(j / sides, 0);
      if (j < sides) {
        if (end === 0) indices.push(base, base + j + 2, base + j + 1);
        else indices.push(base, base + j + 1, base + j + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals();
  // Merge smooth normals across the duplicated UV seam.
  const normal = g.getAttribute('normal');
  for (let i = 0; i <= steps; i++) {
    const a = i * (sides + 1), b = a + sides;
    v.set(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize();
    normal.setXYZ(a, v.x, v.y, v.z); normal.setXYZ(b, v.x, v.y, v.z);
  }
  const flat = g.toNonIndexed(); g.dispose();
  return flat;
}

/** Fitted padded arch across the crown, with a matched pair of curved, tapered horns. */
export function devilHeadParts(bodyRadius: (y: number) => number): THREE.BufferGeometry[] {
  const hornScale = .5;
  const bandScale = .58;
  const heights = [1.24, 1.34, 1.43, 1.51, 1.565];
  const side = (y: number, sign: number): Point => {
    const t = THREE.MathUtils.clamp((y - 1.24) / .19, 0, 1);
    const blend = t * t * (3 - 2 * t);
    // The narrow tips end just inside the jelly, with no exposed flat red end caps.
    return [sign * (bodyRadius(y) + .018 - .027 * (1 - blend)), y + .009, .005];
  };
  const arch: Point[] = heights.map(y => side(y, -1));
  arch.push([-.035, 1.592, .005], [0, 1.596, .005], [.035, 1.592, .005]);
  arch.push(...heights.toReversed().map(y => side(y, 1)));
  return [
    // Narrow only the band section; its centreline must keep following the body profile.
    sweep(arch, t => {
      const edge = Math.min(1, Math.min(t, 1 - t) / .2);
      return .001 + (.024 * bandScale - .001) * edge * edge * (3 - 2 * edge);
    }, 36, 8, 1.55),
    ...[-1, 1].map(s => {
      const root = new THREE.Vector3(s * .27, 1.487, .005);
      const horn = sweep([
        [s * .27, 1.487, .005], [s * .365, 1.63, .008],
        [s * .415, 1.795, .018], [s * .405, 1.925, .025], [s * .36, 2.025, .015],
      ], t => .083 * Math.pow(1 - t, .83) + .0015, 22, 12, .84);
      // Keep each root seated on the band while reducing curve length and girth together.
      return horn.translate(-root.x, -root.y, -root.z).scale(hornScale, hornScale, hornScale).translate(root.x, root.y, root.z);
    }),
  ];
}

/** A small bevelled arrow/spade, seated over the narrow end of the open curl. */
function spade(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -.042);
  s.bezierCurveTo(-.044, -.061, -.119, -.054, -.115, -.002);
  s.bezierCurveTo(-.112, .051, -.037, .11, 0, .176);
  s.bezierCurveTo(.037, .11, .112, .051, .115, -.002);
  s.bezierCurveTo(.119, -.054, .044, -.061, 0, -.042);
  const g = new THREE.ExtrudeGeometry(s, { depth: .03, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .012, bevelThickness: .012, curveSegments: 6 });
  g.translate(0, 0, -.015);
  g.scale(.72, .78, .75);
  g.rotateZ(-.19); g.rotateY(-.18); g.translate(.93, .53, .762);
  const color = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < color.length; i += 3) color.set([SCARLET.r, SCARLET.g, SCARLET.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return g;
}

/** Lower-back root with one open S/J curve. Monotonic X/Z prevents a projected knot near the tip. */
export function devilTailParts(): THREE.BufferGeometry[] {
  return [sweep([
    [.16, .43, .485], [.30, .435, .57], [.47, .345, .65], [.64, .255, .705],
    [.77, .275, .726], [.84, .33, .737], [.905, .43, .75], [.93, .53, .762],
  ], t => .026 - .014 * t, 56, 8), spade()].map(part =>
    // Shorten the whole silhouette around its attachment, preserving the curl and proportions.
    part.translate(-.16, -.43, -.485).scale(.8, .8, .8).translate(.16, .43, .485));
}
