// Эволюции меняют форму оружия, а не только оттенок. Геометрия общая для всех инстансов вида.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color), a = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}
function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts, false)!;
}
export function flywheelGeo(): THREE.BufferGeometry {
  const parts = [paint(new THREE.TorusGeometry(.56, .065, 4, 16).rotateX(Math.PI / 2), 0xa66a37), paint(new THREE.CylinderGeometry(.13, .13, .17, 6), 0xd7a147)];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    parts.push(paint(new THREE.BoxGeometry(.19, .11, .58).translate(0, 0, .23).rotateY(a), 0x9a9ba5));
  }
  return joined(parts);
}
export function emberClusterGeo(): THREE.BufferGeometry {
  return joined([paint(new THREE.IcosahedronGeometry(.25, 0).scale(1, 1, 1.6), 0xff9c38), paint(new THREE.IcosahedronGeometry(.14, 0).translate(.16, .04, -.16), 0xcc5f20), paint(new THREE.IcosahedronGeometry(.13, 0).translate(-.13, -.03, -.13), 0xe77e3e)]);
}
export function chargeBundleGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-.17, 0, .17]) parts.push(paint(new THREE.CylinderGeometry(.1, .1, .48, 6).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(x, .1, 0), 0xb84b32));
  for (const z of [-.13, .13]) parts.push(paint(new THREE.BoxGeometry(.56, .09, .075).translate(0, .12, z), 0xd09a4c));
  parts.push(paint(new THREE.CylinderGeometry(.025, .025, .3, 4).rotateZ(-.7).translate(.2, .25, 0), 0xd7b87c));
  return joined(parts);
}
export function wingedFireflyGeo(): THREE.BufferGeometry {
  return joined([paint(new THREE.OctahedronGeometry(.15, 0).scale(.7, 1, 1.4), 0xffd46e), paint(new THREE.OctahedronGeometry(.19, 0).scale(1.4, .2, .65).translate(.19, 0, 0), 0xe4e9a0), paint(new THREE.OctahedronGeometry(.19, 0).scale(1.4, .2, .65).translate(-.19, 0, 0), 0xe4e9a0)]);
}
export function crystalGeo(): THREE.BufferGeometry {
  return joined([paint(new THREE.OctahedronGeometry(.3, 0).scale(.65, 1.7, .65), 0xc4dcff), paint(new THREE.OctahedronGeometry(.2, 0).scale(.7, 1.5, .7).translate(.2, -.13, 0).rotateZ(-.3), 0x9aacdc), paint(new THREE.OctahedronGeometry(.2, 0).scale(.7, 1.5, .7).translate(-.2, -.13, 0).rotateZ(.3), 0xa9bcdf)]);
}
export function rockClusterGeo(): THREE.BufferGeometry {
  return joined([paint(new THREE.ConeGeometry(.36, 1.3, 5).rotateX(Math.PI), 0xa18a68), paint(new THREE.ConeGeometry(.22, .8, 5).rotateX(Math.PI).translate(.3, .25, 0), 0xd0af79), paint(new THREE.ConeGeometry(.21, .9, 5).rotateX(Math.PI).translate(-.25, .18, .1), 0xc29e69)]);
}

/** Два бронзовых объектива Маяка; один общий материал, без добавочных ламп. */
export function beaconEmitter(): THREE.Group {
  const root = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xb8874b, roughness: .6 });
  root.name = 'dg-beacon-emitter';
  root.add(new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, .3, 8), mat));
  const optics = new THREE.Mesh(new THREE.BoxGeometry(.15, .22, .9), mat);
  root.add(optics);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffe6a6 });
  for (const z of [-.5, .5]) root.add(new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 4).translate(0, .01, z), glass));
  root.position.y = 1.8;
  return root;
}

export function doubleLensLantern(): THREE.Group {
  const root = new THREE.Group(); root.name = 'dg-lantern-double-lens';
  const cage = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .48), new THREE.MeshStandardMaterial({ color: 0xa9793f, roughness: .55 }));
  cage.position.y = .22; root.add(cage);
  const glass = new THREE.MeshBasicMaterial({ color: 0xffd599 });
  for (const z of [-.27, .27]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .07, 8).rotateX(Math.PI / 2), glass);
    lens.position.set(0, .22, z); root.add(lens);
  }
  return root;
}
