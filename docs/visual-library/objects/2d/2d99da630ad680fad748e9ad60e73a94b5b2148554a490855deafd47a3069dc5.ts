// Снасти-награды рыбалки в 3D (shared/fishstyle.ts): удочки «Орешник», «Резная», «Золотая» и поплавки «Гусиное перо»,
// «Уточка», «Светлячок», «Золотая рыбка». Удочка — те же части, что у обычной (fishing.ts: у мешей имена blank, tip,
// handle, reel, knob), другие материалы и пара деталей; поплавок — своя модель вместо красно-белого. Модели и материалы
// общие на все места рыбалки, строятся при первом показе. Что держит рыбак — по его наряду (слоты r и b).
import * as THREE from 'three';
import type { Sound } from '../audio.ts';
import type { Avatar } from '../render/avatar.ts';
import { metalEnvTexture, softDot } from '../render/textures.ts';
import type { LobbyFx } from './fx.ts';

// ------------------------------------------------------------ материалы

const mats = new Map<string, THREE.Material>();

function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

const std = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

/** Золото с отражением неба — как у медалей на желейке */
const gold = (color = 0xe0b030): THREE.MeshStandardMaterial => std(color, 0.25, 0.9, { envMap: metalEnvTexture(), envMapIntensity: 1.2 });

/**
 * Узор на колене удилища (u — по кругу, v — вдоль колена, на колено — один период): spiral — резная спираль,
 * wraps — тёмные обмотки у концов колена, bark — кора с прожилками и обвязкой бечёвкой у сгиба, bands — полосы поперёк.
 */
function pattern(kind: 'spiral' | 'wraps' | 'bark' | 'bands', base: string, ink: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = ink;
  g.strokeStyle = ink;
  if (kind === 'spiral') {
    // две нитки спирали: по кругу на 32 px подъём на 32 px, на колене — два витка
    g.lineWidth = 7;
    for (let k = -2; k <= 2; k++) {
      g.beginPath();
      g.moveTo(-4, k * 32 - 4);
      g.lineTo(36, k * 32 + 36);
      g.stroke();
    }
  } else if (kind === 'wraps') {
    // обмотки только у сгибов: на стыке колен — одна тёмная полоса
    g.fillRect(0, 0, 32, 3);
    g.fillRect(0, 61, 32, 3);
  } else if (kind === 'bark') {
    g.globalAlpha = 0.5;
    for (let i = 0; i < 9; i++) g.fillRect((i * 37) % 32, (i * 23) % 56, 2, 8 + (i % 3) * 4);
    g.globalAlpha = 1;
    g.fillStyle = '#d8c38f';
    g.fillRect(0, 0, 32, 5);
  } else {
    for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 32, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ удочки

interface RodLook {
  blank: () => THREE.Material;
  tip: () => THREE.Material;
  handle: () => THREE.Material;
  reel: () => THREE.Material;
  knob: () => THREE.Material;
  /** Детали поверх: в осях удочки (−Z — к кончику, катушка снизу) */
  extra?: () => THREE.Object3D;
}

const RODS: Record<string, RodLook> = {
  // ореховая ветка в коре, обвязка бечёвкой у сгибов, деревянное мотовило вместо катушки
  hazel: {
    blank: () => mat('r:hazel:blank', () => std(0xffffff, 0.95, 0, { map: pattern('bark', '#7a5634', '#3e2a17') })),
    tip: () => mat('r:hazel:tip', () => std(0xd8b98a, 0.85)),
    handle: () => mat('r:hazel:handle', () => std(0xffffff, 1, 0, { map: pattern('spiral', '#cbb38a', '#9c8256') })),
    reel: () => mat('r:hazel:reel', () => std(0x9a6b3c, 0.8)),
    knob: () => mat('r:hazel:knob', () => std(0x6e4a2a, 0.8)),
  },
  // светлое дерево с тёмной резной спиралью, тёмная рукоятка, латунная катушка, кончик в красно-белую полоску
  carved: {
    blank: () => mat('r:carved:blank', () => std(0xffffff, 0.6, 0, { map: pattern('spiral', '#e2b97f', '#5b3a1e') })),
    tip: () => mat('r:carved:tip', () => std(0xffffff, 0.5, 0, { map: pattern('bands', '#f6f1e6', '#d8322a') })),
    handle: () => mat('r:carved:handle', () => std(0x5a3a22, 0.5)),
    reel: () => mat('r:carved:reel', () => gold(0xc9a24a)),
    knob: () => mat('r:carved:knob', () => std(0x5a3a22, 0.5)),
  },
  // золото с чёрными обмотками, рукоятка цвета слоновой кости, рубин на катушке и рубиновый кончик
  gold: {
    blank: () => mat('r:gold:blank', () => std(0xffffff, 0.25, 0.9, { map: pattern('wraps', '#e8b93a', '#141414'), envMap: metalEnvTexture(), envMapIntensity: 1.2 })),
    tip: () => mat('r:gold:tip', () => std(0xc0182a, 0.3, 0.2, { emissive: 0x4a0208 })),
    handle: () => mat('r:gold:handle', () => std(0xf1e6cc, 0.4)),
    reel: () => mat('r:gold:reel', () => gold()),
    knob: () => mat('r:gold:knob', () => std(0xf1e6cc, 0.4)),
    extra: () => {
      const ruby = new THREE.Mesh(gem(), mat('ruby', () => std(0xd0102a, 0.15, 0.3, { emissive: 0x5a0410 })));
      ruby.position.set(0.024, -0.075, -0.08);
      ruby.rotation.z = Math.PI / 2;
      return ruby;
    },
  },
};

let gemGeo: THREE.BufferGeometry | null = null;
function gem(): THREE.BufferGeometry {
  return (gemGeo ??= new THREE.OctahedronGeometry(0.018).scale(1, 0.55, 1));
}

/**
 * Удочка рыбака по ключу слота r: материалы частей и детали поверх. «basic» и неизвестное — как было (материалы,
 * с которыми удочку построили, запоминаются при первом переодевании).
 */
export function dressRig(root: THREE.Object3D, key: string): void {
  const look = Object.hasOwn(RODS, key) ? RODS[key] : null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name) return;
    m.userData.base ??= m.material;
    const part = m.name as keyof Omit<RodLook, 'extra'>;
    m.material = look && typeof look[part] === 'function' ? look[part]() : (m.userData.base as THREE.Material);
  });
  const old = root.getObjectByName('gear-extra');
  if (old) root.remove(old);
  if (look?.extra) {
    const x = look.extra();
    x.name = 'gear-extra';
    root.add(x);
  }
}

// ------------------------------------------------------------ поплавки

/** Поплавки: y = 0 — у воды, леска цепляется в начале координат */
const FLOATS: Record<string, () => THREE.Object3D[]> = {
  // длинное гусиное перо: светлое под водой, чёрное колечко, красная верхушка
  quill: () => {
    const lathe = (pts: Array<[number, number]>) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 10);
    return [
      new THREE.Mesh(lathe([[0.002, -0.2], [0.014, -0.15], [0.026, -0.07], [0.028, -0.02], [0.026, 0.02]]), mat('b:quill:low', () => std(0xf3ead2, 0.5))),
      new THREE.Mesh(lathe([[0.026, 0.02], [0.024, 0.04]]), mat('b:quill:ring', () => std(0x1c1c1c, 0.5))),
      new THREE.Mesh(lathe([[0.024, 0.04], [0.016, 0.1], [0.008, 0.16], [0.002, 0.19]]), mat('b:quill:top', () => std(0xe8392a, 0.35, 0, { emissive: 0x3a0804 }))),
    ];
  },
  // жёлтая резиновая уточка, смотрит вперёд
  duck: () => {
    const yellow = mat('b:duck', () => std(0xffd23a, 0.35));
    const ball = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(sphere(), m);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const black = mat('b:duck:eye', () => std(0x141414, 0.3));
    return [
      ball(0.095, 0.07, 0.12, 0, 0.015, 0, yellow),
      ball(0.03, 0.035, 0.04, 0, 0.065, 0.1, yellow),
      ball(0.06, 0.058, 0.058, 0, 0.11, -0.055, yellow),
      ball(0.034, 0.013, 0.032, 0, 0.1, -0.11, mat('b:duck:beak', () => std(0xff8a1f, 0.4))),
      ball(0.022, 0.035, 0.06, 0.085, 0.035, 0.01, yellow),
      ball(0.022, 0.035, 0.06, -0.085, 0.035, 0.01, yellow),
      ball(0.011, 0.011, 0.011, 0.03, 0.128, -0.096, black),
      ball(0.011, 0.011, 0.011, -0.03, 0.128, -0.096, black),
    ];
  },
  // тёмно-зелёный поплавок с тёплой светящейся головкой и ореолом — виден в грозу
  firefly: () => {
    const glow = mat('b:firefly:glow', () => std(0xffe6a0, 0.4, 0, { emissive: 0xffb43a, emissiveIntensity: 1.6 }));
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8).scale(1, 1.3, 1), mat('b:firefly:body', () => std(0x2f5a3a, 0.45)));
    body.position.y = -0.03;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.066, 12, 8), glow);
    bulb.position.y = 0.085;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), mat('b:firefly:stick', () => std(0x2f3a2a, 0.5)));
    stick.position.y = 0.2;
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glow);
    bead.position.y = 0.27;
    // ореол тёплый: поверх голубой воды аддитивно — тёплый белый, не бирюзовый
    const halo = new THREE.Sprite(mat('b:firefly:halo', () => new THREE.SpriteMaterial({
      map: softDot('rgba(255,160,50,0.8)', 'rgba(255,140,40,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    })) as THREE.SpriteMaterial);
    halo.scale.setScalar(0.42);
    halo.position.y = 0.12;
    return [body, bulb, stick, bead, halo];
  },
  // золотая рыбка торчком, в короне: хвост в воде, голова и корона над водой
  goldfish: () => {
    const g = mat('b:goldfish', () => std(0xffc83d, 0.3, 0.55, { envMap: metalEnvTexture(), envMapIntensity: 1.4, emissive: 0x3a2400 }));
    const fin = mat('b:goldfish:fin', () => std(0xff9a2a, 0.4, 0.3, { side: THREE.DoubleSide }));
    const body = new THREE.Mesh(sphere(), g);
    body.scale.set(0.034, 0.1, 0.05);
    body.position.y = 0.05;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 4).scale(0.3, 1, 1), fin);
    tail.position.y = -0.07;
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 3).scale(0.3, 1, 1).rotateX(-Math.PI / 2), fin);
    dorsal.position.set(0, 0.05, 0.05);
    const parts: THREE.Object3D[] = [body, tail, dorsal];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(sphere(), mat('b:goldfish:eye', () => std(0x141414, 0.3)));
      eye.scale.setScalar(0.009);
      eye.position.set(s * 0.028, 0.115, -0.02);
      const pec = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3).scale(0.3, 1, 1), fin);
      pec.position.set(s * 0.035, 0.03, -0.01);
      pec.rotation.z = s * 0.9;
      parts.push(eye, pec);
    }
    // корона: обруч и пять зубцов
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 14).rotateX(Math.PI / 2), g);
    band.position.y = 0.152;
    parts.push(band);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.026, 4), g);
      tooth.position.set(Math.sin(a) * 0.022, 0.168, Math.cos(a) * 0.022);
      parts.push(tooth);
    }
    // крупнее обычного поплавка: рыбка — главная награда, её должно быть видно с мостков
    const fish = new THREE.Group();
    fish.add(...parts);
    fish.scale.setScalar(1.3);
    return [fish];
  },
};

let sphereGeo: THREE.BufferGeometry | null = null;
function sphere(): THREE.BufferGeometry {
  return (sphereGeo ??= new THREE.SphereGeometry(1, 12, 8));
}

/**
 * Поплавок по ключу слота b: модель вместо красно-белого. «classic» и неизвестное — как было (первые дети группы
 * запоминаются при первом переодевании).
 */
export function dressFloat(group: THREE.Group, key: string): void {
  const classic = (group.userData.classic ??= [...group.children]) as THREE.Object3D[];
  group.clear();
  if (!Object.hasOwn(FLOATS, key)) {
    for (const o of classic) group.add(o);
    return;
  }
  // образец строится один раз; поплавку — копии мешей (геометрия и материалы общие)
  let tpl = floatTpl.get(key);
  if (!tpl) {
    tpl = FLOATS[key]();
    floatTpl.set(key, tpl);
  }
  for (const o of tpl) group.add(o.clone());
}

const floatTpl = new Map<string, THREE.Object3D[]>();

/** Поплавок долетел до воды: золотая рыбка искрит */
export function floatSparkles(key: string): boolean {
  return key === 'goldfish';
}

// ------------------------------------------------------------ «Хозяин глубин»

const _p = new THREE.Vector3();

/** Кто-то собрал всю коллекцию: фанфары слышны рядом, золотые искры и фонтан у его желейки */
export function fishMasterCheer(av: Avatar | null | undefined, fx: LobbyFx, sound: Sound): void {
  if (!av) return;
  const p = av.root.getWorldPosition(_p);
  sound.fanfare([p.x, p.y + 1.5, p.z]);
  fx.sparkle(p.x, p.y + 1.9, p.z, 40);
  fx.fountain(p.x, p.y + 0.05, p.z, 2.5);
}
