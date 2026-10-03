// Статуя у входа на мостки к маяку: фигура в форме ММ-14 отдаёт честь (модель и текстуры собирает
// tools/statue/build.py по фото), постамент из тёмного полированного гранита с золотой надписью,
// цветы и лампадки у подножия, вечером — два прожектора снизу. Модель грузится фоном после набережной.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { STATUE } from '../../shared/maps/lobby.ts';
import { glowSprite, paint, place } from '../render/kit.ts';
import { metalEnvTexture } from '../render/textures.ts';
import bodyUrl from '../assets/statue/body.webp?url';
import headUrl from '../assets/statue/head.webp?url';
import statueUrl from '../assets/statue/statue.bin?url';
import { decodeStatue, type StatueMeshData } from './statueFormat.ts';
import type { LobbyQuality } from './world.ts';

/** Фигура чуть крупнее человека: ~1,96 м */
const FIGURE_SCALE = 1.1;
const INSCRIPTION = ['ALWAYS IN', 'OUR HEARTS'];
/** Постамент: цоколь, тело (сдвинуто назад — спереди полка для цветов), карниз */
const PLINTH = { w: STATUE.half * 2, h: 0.2 };
const BODY = { w: 1.0, h: 0.66, back: 0.08 };
const CAP = { w: 1.12, h: 0.1 };
const TOP = PLINTH.h + BODY.h + CAP.h;

interface Loaded {
  meshes: Map<string, StatueMeshData>;
  head: THREE.Texture;
  body: THREE.Texture;
}

let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  loading ??= (async () => {
    const tl = new THREE.TextureLoader();
    const [buf, head, body] = await Promise.all([
      fetch(statueUrl).then((r) => {
        if (!r.ok) throw new Error(`statue.bin: ${r.status}`);
        return r.arrayBuffer();
      }),
      tl.loadAsync(headUrl),
      tl.loadAsync(bodyUrl),
    ]);
    for (const t of [head, body]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
    }
    return { meshes: decodeStatue(buf), head, body };
  })();
  loading.catch(() => (loading = null));
  return loading;
}

function geometry(m: StatueMeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(m.normal, 4), 3, 0, true));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2, true));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  return g;
}

/** Полированный гранит: тёмно-серый с мелкими светлыми и чёрными крапинками. */
function graniteTexture(base: string, seed: number): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    ctx.fillStyle = v < 0.45 ? 'rgba(0,0,0,0.35)' : v < 0.85 ? 'rgba(200,196,192,0.28)' : 'rgba(150,120,110,0.3)';
    const r = 0.6 + rnd() * 1.6;
    ctx.fillRect(rnd() * size, rnd() * size, r, r);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Золотые буквы на прозрачном фоне. */
function inscriptionTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 104px Rubik, system-ui, sans-serif';
  ctx.letterSpacing = '14px';
  INSCRIPTION.forEach((line, i) => {
    const y = h * (0.3 + i * 0.42);
    // гравировка: тёмная тень снизу-справа, светлый край сверху, золото
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillText(line, w / 2 + 3, y + 4);
    const g = ctx.createLinearGradient(0, y - 52, 0, y + 52);
    g.addColorStop(0, '#f6dc96');
    g.addColorStop(0.55, '#d4a64e');
    g.addColorStop(1, '#a87a2c');
    ctx.fillStyle = g;
    ctx.fillText(line, w / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Statue {
  readonly root = new THREE.Group();
  private readonly lights: THREE.SpotLight[] = [];
  private figure: THREE.Group | null = null;

  constructor(scene: THREE.Scene, onReady: () => void) {
    const { x, z, yaw } = STATUE;
    this.root.position.set(x, 0, z);
    // модель смотрит в +Z; yaw карты: 0 — взгляд в −Z
    this.root.rotation.y = yaw + Math.PI;
    scene.add(this.root);
    this.buildPedestal();
    this.buildFlowers();
    this.buildFloodlights();
    load()
      .then((l) => {
        this.addFigure(l);
        onReady();
      })
      .catch((err) => console.warn('Статуя не загрузилась:', err));
  }

  private addFigure(l: Loaded): void {
    const fig = new THREE.Group();
    const mats: Record<string, THREE.MeshStandardMaterial> = {
      head: new THREE.MeshStandardMaterial({ map: l.head, roughness: 0.72, emissiveMap: l.head, emissive: 0xffffff, emissiveIntensity: 0.06 }),
      body: new THREE.MeshStandardMaterial({ map: l.body, roughness: 0.86, emissiveMap: l.body, emissive: 0xffffff, emissiveIntensity: 0.04 }),
    };
    for (const [name, data] of l.meshes) {
      const mesh = new THREE.Mesh(geometry(data), mats[name] ?? mats.body);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      fig.add(mesh);
    }
    fig.scale.setScalar(FIGURE_SCALE);
    fig.position.set(0, TOP, -BODY.back / 2);
    this.root.add(fig);
    this.figure = fig;
    this.root.updateMatrixWorld(true);
    for (const l of this.lights) l.target.updateMatrixWorld();
  }

  /** Цоколь, тело постамента с надписью, карниз. Всё в локальных осях: перёд — +Z. */
  private buildPedestal(): void {
    const dark = new THREE.MeshStandardMaterial({ map: graniteTexture('#2c2c30', 7), roughness: 0.28, envMap: metalEnvTexture(), envMapIntensity: 0.35 });
    const rough = new THREE.MeshStandardMaterial({ map: graniteTexture('#6e6965', 11), roughness: 0.82 });
    const box = (w: number, h: number, d: number, y: number, zOff: number, mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(0, y + h / 2, zOff);
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    };
    box(PLINTH.w, PLINTH.h, PLINTH.w, 0, 0, rough);
    box(BODY.w, BODY.h, BODY.w, PLINTH.h, -BODY.back, dark);
    box(CAP.w, CAP.h, CAP.w, PLINTH.h + BODY.h, -BODY.back, dark);
    // фаска карниза — узкая ступенька под ним
    box(BODY.w + 0.04, 0.03, BODY.w + 0.04, PLINTH.h + BODY.h - 0.03, -BODY.back, dark);

    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(0.86, 0.3),
      new THREE.MeshStandardMaterial({ map: inscriptionTexture(), transparent: true, metalness: 0.75, roughness: 0.32, envMap: metalEnvTexture(), envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    text.position.set(0, PLINTH.h + BODY.h * 0.5, -BODY.back + BODY.w / 2 + 0.002);
    this.root.add(text);
  }

  /** Два букета красных и белых цветов и три лампадки на полке цоколя перед надписью. */
  private buildFlowers(): void {
    const parts: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const shelfZ = -BODY.back + BODY.w / 2 + (PLINTH.w / 2 - (-BODY.back + BODY.w / 2)) / 2;
    const y0 = PLINTH.h;
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const bouquet = (cx: number, ang: number, heads: number[]) => {
      // букет лежит на полке: стебли вдоль оси, головки — веером у одного конца
      const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const stemLen = 0.34;
      for (let i = 0; i < 9; i++) {
        const off = (rnd() - 0.5) * 0.05;
        const g = new THREE.CylinderGeometry(0.004, 0.004, stemLen, 5).rotateZ(Math.PI / 2).rotateY(-ang);
        parts.push(place(paint(g, 0x3f7a32), cx + dir.x * 0.0 - dir.z * off, y0 + 0.012 + rnd() * 0.012, shelfZ + dir.z * 0.0 + dir.x * off));
      }
      heads.forEach((color, i) => {
        const a = (i / heads.length - 0.5) * 1.2;
        const along = stemLen / 2 + 0.02 + rnd() * 0.04;
        const side = Math.sin(a) * 0.05;
        const hx = cx + dir.x * along - dir.z * side;
        const hz = shelfZ + dir.z * along + dir.x * side;
        parts.push(place(paint(new THREE.IcosahedronGeometry(0.026 + rnd() * 0.006, 1).scale(1, 0.8, 1), color), hx, y0 + 0.03 + rnd() * 0.015, hz));
        parts.push(place(paint(new THREE.IcosahedronGeometry(0.018, 0).scale(1.6, 0.4, 1.0), 0x4a8a3a), hx - dir.x * 0.03, y0 + 0.02, hz - dir.z * 0.03, rnd() * 3));
      });
      // обёртка
      const wrap = new THREE.ConeGeometry(0.045, 0.16, 10, 1, true).rotateZ(Math.PI / 2).rotateY(-ang);
      parts.push(place(paint(wrap, 0xe9e2d2), cx - dir.x * 0.1, y0 + 0.035, shelfZ - dir.z * 0.1));
    };
    bouquet(-0.26, 0.25, [0xb3121b, 0xc4161f, 0xf2f0ea, 0xa80f18, 0xc81a24, 0xf2f0ea, 0xb3121b]);
    bouquet(0.28, Math.PI - 0.3, [0xf2f0ea, 0xb3121b, 0xc4161f, 0xf2f0ea, 0xa80f18]);
    // лампадки: красное стекло, огонёк светится
    for (const lx of [-0.06, 0.04, 0.12]) {
      parts.push(place(paint(new THREE.CylinderGeometry(0.03, 0.026, 0.012, 14), 0x8a7a5a), lx, y0 + 0.006, shelfZ));
      glass.push(place(paint(new THREE.CylinderGeometry(0.028, 0.024, 0.075, 14), 0xc8281e), lx, y0 + 0.05, shelfZ));
      const glow = glowSprite(0xff9a4a, 0.22, 0.5);
      glow.position.set(lx, y0 + 0.07, shelfZ);
      this.root.add(glow);
    }
    const flowers = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    flowers.castShadow = true;
    this.root.add(flowers);
    const lamp = new THREE.Mesh(mergeGeometries(glass, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0xff5a2a, emissiveIntensity: 0.9 }));
    this.root.add(lamp);
  }

  /** Два прожектора, утопленные в настил перед постаментом (по ним можно ходить), светят вверх на фигуру. */
  private buildFloodlights(): void {
    const rings: THREE.BufferGeometry[] = [];
    const lens: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const fx = side * 0.6;
      const fz = PLINTH.w / 2 + 0.7;
      rings.push(place(paint(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 20), 0x2a2c2e), fx, 0.006, fz));
      lens.push(place(paint(new THREE.CircleGeometry(0.08, 20).rotateX(-Math.PI / 2), 0xfff1d0), fx, 0.0135, fz));
      const glow = glowSprite(0xffd9a0, 0.55, 0.42);
      glow.position.set(fx, 0.08, fz);
      this.root.add(glow);
      // мягко: при 24 лицо снизу выгорало в белое
      const spot = new THREE.SpotLight(0xffe2b8, 16, 8, 0.32, 0.65, 1.5);
      spot.position.set(fx, 0.05, fz);
      spot.target.position.set(-side * 0.12, TOP + 1.45, 0);
      this.root.add(spot, spot.target);
      this.lights.push(spot);
    }
    const ringMesh = new THREE.Mesh(mergeGeometries(rings, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 }));
    ringMesh.receiveShadow = true;
    this.root.add(ringMesh);
    this.root.add(new THREE.Mesh(mergeGeometries(lens, false)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }

  setQuality(q: LobbyQuality): void {
    for (const l of this.lights) l.visible = q === 'high';
  }

  get loaded(): boolean {
    return this.figure !== null;
  }
}
