// Одежда фермы на желейке (docs/farm/design-v11.md §12.1, art/farm/MODELS.md «Косметика»): верх u и низ l — слой ткани
// прямо в шейдере желе (развёртка по углу и высоте тела, PNG из client/assets/farm/textures, параметры из
// cos_layers.json) плюс мелкие детали из glb, которые гнутся тем же шейдером, что шапки; манжеты, перчатки и корзинка —
// на варежках; эффект f — несколько светящихся точек (след светлячков, вихрь искр при появлении). Все желейки — одна
// программа шейдера: у кого одежды нет, слой просто выключен. В пейнтболе u, l и f прячутся, как телесные аксессуары
// рыбалки (SHELL_ACCS); с телесным аксессуаром у верха остаётся только слой. Сюда же каждая желейка сообщает, где она
// и какой у неё ходячий питомец, — их рисует client/farm/3d/pets.ts на ферме и на набережной (по сети ничего).
import * as THREE from 'three';
import { SHELL_ACCS } from '../../shared/fishstyle.ts';
import { slotKey, type Outfit } from '../../shared/outfit.ts';
import { ACT_DANCE, ACT_FIVE, ACT_HUG, ACT_LAUGH, ACT_WAVE } from '../../shared/lobby.ts';
import LAYERS from '../assets/farm/textures/cos_layers.json' with { type: 'json' };
import { farmPiece, farmWearVersion, type FarmPiece } from './farmwear.ts';
import { makeHatMaterial } from './hatpose.ts';
import { metalEnvTexture, softDot } from './textures.ts';

type Geo = THREE.BufferGeometry;

interface LayerDef { png: string; glow?: string; roughness: number; clearcoat?: number; y: number[] }
const LAYER: Record<string, LayerDef> = LAYERS.layers as Record<string, LayerDef>;
/** Ходячие питомцы фермы (слот s): остальные ключи — наплечные (чайка, попугай, outfitfish.ts) */
export const WALK_PETS: ReadonlySet<string> = new Set(['chick', 'piglet', 'beetle', 'firefly', 'mushroom']);
/** Подол верха: детали низа выше него под верхом не видны */
const HEM = 0.27;

// ------------------------------------------------------------ текстуры слоёв

const texCache = new Map<string, THREE.Texture>();
let empty: THREE.DataTexture | null = null;

function emptyTex(): THREE.DataTexture {
  if (!empty) {
    empty = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    empty.needsUpdate = true;
  }
  return empty;
}

function layerTex(png: string, color: boolean): THREE.Texture {
  let t = texCache.get(png);
  if (!t) {
    t = new THREE.TextureLoader().load(new URL(`../assets/farm/textures/${png}`, import.meta.url).href);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    // шов развёртки — посередине спины: по кругу повторяем, выборка с явным градиентом (textureGrad)
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texCache.set(png, t);
  }
  return t;
}

// ------------------------------------------------------------ шейдер желе

export interface ClothUniforms {
  uClothU: THREE.IUniform<THREE.Texture>;
  uClothL: THREE.IUniform<THREE.Texture>;
  uClothG: THREE.IUniform<THREE.Texture>;
  /** верх включён, низ включён, низ поверх верха (комбинезон), сила свечения узора */
  uCloth: THREE.IUniform<THREE.Vector4>;
  /** шероховатость верха и низа, лак верха и низа */
  uClothR: THREE.IUniform<THREE.Vector4>;
}

const CLOTH_GLSL = /* glsl */ `
  float clothA = 0.0;
  float clothRough = 0.0;
  float clothCoat = 0.0;
  vec3 clothGlow = vec3(0.0);
  if (uCloth.x + uCloth.y > 0.5) {
    float ca = atan(vObj.x, vObj.z) * 0.15915494;
    float cf = fract(ca);
    float cv = vObj.y / 1.58;
    float ax = dFdx(ca), bx = dFdx(cf), ay = dFdy(ca), by = dFdy(cf);
    vec2 gx = vec2(abs(ax) < abs(bx) ? ax : bx, dFdx(cv));
    vec2 gy = vec2(abs(ay) < abs(by) ? ay : by, dFdy(cv));
    vec2 cuv = vec2(cf, cv);
    vec4 cu = uCloth.x > 0.5 ? textureGrad(uClothU, cuv, gx, gy) : vec4(0.0);
    vec4 cl = uCloth.y > 0.5 ? textureGrad(uClothL, cuv, gx, gy) : vec4(0.0);
    bool over = uCloth.z > 0.5;
    vec4 c1 = over ? cu : cl;
    vec4 c2 = over ? cl : cu;
    vec2 r1 = over ? uClothR.xz : uClothR.yw;
    vec2 r2 = over ? uClothR.yw : uClothR.xz;
    diffuseColor.rgb = mix(diffuseColor.rgb, c1.rgb, c1.a);
    diffuseColor.rgb = mix(diffuseColor.rgb, c2.rgb, c2.a);
    clothA = 1.0 - (1.0 - c1.a) * (1.0 - c2.a);
    clothRough = mix(r1.x, r2.x, c2.a);
    clothCoat = mix(r1.y, r2.y, c2.a);
    if (uCloth.w > 0.0) clothGlow = textureGrad(uClothG, cuv, gx, gy).r * cu.a * uCloth.w * vec3(1.0, 0.76, 0.35);
  }`;

/** Вставить слой ткани в материал желе (после его собственного onBeforeCompile); одна программа на всех */
export function patchJelly(mat: THREE.MeshPhysicalMaterial, u: ClothUniforms): void {
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform sampler2D uClothU;\nuniform sampler2D uClothL;\nuniform sampler2D uClothG;\nuniform vec4 uCloth;\nuniform vec4 uClothR;\n' + shader.fragmentShader
      .replace('diffuseColor.rgb = patternColor(diffuseColor.rgb);', `diffuseColor.rgb = patternColor(diffuseColor.rgb);\n${CLOTH_GLSL}`)
      // после правки металла и шероховатости у золотого желе (avatar.ts): ткань не блестит и не металл
      .replace('roughnessFactor = mix(roughnessFactor, 0.28, uMetal);', 'roughnessFactor = mix(roughnessFactor, 0.28, uMetal);\n  metalnessFactor *= 1.0 - clothA;\n  roughnessFactor = mix(roughnessFactor, clothRough, clothA);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance = totalEmissiveRadiance * (1.0 - clothA) + clothGlow;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat *= 1.0 - clothA * (1.0 - clothCoat);\n#endif')
      .replace('outgoingLight += uRim * rimF * uRimK;', 'outgoingLight += uRim * rimF * uRimK * (1.0 - 0.75 * clothA);');
  };
  mat.customProgramCacheKey = () => `${key}-cloth1`;
}

// ------------------------------------------------------------ детали и варежки

let handMat: THREE.MeshStandardMaterial | null = null;
const baseMats = new Map<string, THREE.MeshStandardMaterial>();

function baseMat(kind: 'cloth' | 'gloss' | 'metal'): THREE.MeshStandardMaterial {
  let m = baseMats.get(kind);
  if (!m) {
    m = kind === 'metal'
      ? new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.3, envMap: metalEnvTexture(), envMapIntensity: 1.1 })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'gloss' ? 0.3 : 0.62, metalness: 0.04, side: THREE.DoubleSide });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    baseMats.set(kind, m);
  }
  return m;
}

/** Детали низа: ниже подола верха и выше (выше — прячутся, когда надет верх; кроме комбинезона) */
const splitCache = new Map<Geo, [Geo, Geo]>();

function splitAt(g: Geo, anchor: number): [Geo, Geo] {
  let s = splitCache.get(g);
  if (s) return s;
  const pos = g.getAttribute('position');
  const idx = g.index!;
  const lo: number[] = [];
  const hi: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i);
    const b = idx.getX(i + 1);
    const c = idx.getX(i + 2);
    const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 + anchor;
    (y > HEM ? hi : lo).push(a, b, c);
  }
  const part = (list: number[]): Geo => {
    const p = g.clone();
    p.setIndex(list);
    return p;
  };
  s = [part(lo), part(hi)];
  splitCache.set(g, s);
  return s;
}

interface Detail {
  node: THREE.Group;
  anchor: THREE.IUniform<number>;
  cloth: THREE.Mesh;
  gloss: THREE.Mesh;
  metal: THREE.Mesh;
}

// ------------------------------------------------------------ питомцы: кто где

/** Желейка для ходячего питомца: где стоит, куда смотрит, что делает */
export interface Walker {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pet: string;
  act: number;
  local: boolean;
  /** Когда сообщила (performance.now): давно молчит — её нет в кадре */
  at: number;
  /** Счётчик «радости» хозяина: растёт на эмоции (сбор и уровень добавляет ферма) */
  happy: number;
}

/** Сцена → желейки с питомцами. Читает client/farm/3d/pets.ts; сцены без менеджера питомцев их не рисуют */
export const WALKERS = new WeakMap<THREE.Object3D, Map<object, Walker>>();
/** Сцена → своя желейка (для жителей фермы: поздороваться, когда подошёл) */
export const LOCAL_WALKER = new WeakMap<THREE.Object3D, Walker>();

const HAPPY_ACTS = new Set([ACT_DANCE, ACT_LAUGH, ACT_WAVE, ACT_FIVE, ACT_HUG]);

// ------------------------------------------------------------ эффекты f

const FX_N = 18;
let fxMat: THREE.PointsMaterial | null = null;

interface Spark { x: number; y: number; z: number; t: number; life: number; c: THREE.Color }

/** Что желейка отдаёт одежде фермы каждый кадр */
interface AvatarLike {
  readonly root: THREE.Group;
  readonly inWorld: boolean;
  readonly action: number;
  readonly outfit: Outfit;
}

// ------------------------------------------------------------ одежда одной желейки

export class AvatarCloth {
  private readonly u: ClothUniforms;
  private readonly body: THREE.Object3D;
  private readonly pose: { uTime: THREE.IUniform<number>; uWobble: THREE.IUniform<number>; uLean: THREE.IUniform<THREE.Vector2> };
  private readonly mittens: readonly [THREE.Mesh, THREE.Mesh];
  private readonly details: Partial<Record<'u' | 'l', Detail>> = {};
  private readonly handMeshes: THREE.Mesh[] = [];
  private version = farmWearVersion;
  private key = '';
  private fx: THREE.Points | null = null;
  private fxKind = '';
  private readonly sparks: Spark[] = [];
  private lastSeen = -1;
  private trailT = 0;
  private readonly walker: Walker = { x: 0, y: 0, z: 0, yaw: 0, pet: '', act: 0, local: false, at: 0, happy: 0 };
  private lastAct = 0;

  constructor(
    body: THREE.Object3D,
    jelly: THREE.MeshPhysicalMaterial,
    pose: { uTime: THREE.IUniform<number>; uWobble: THREE.IUniform<number>; uLean: THREE.IUniform<THREE.Vector2> },
    mittens: readonly [THREE.Mesh, THREE.Mesh],
  ) {
    this.body = body;
    this.pose = pose;
    this.mittens = mittens;
    const e = emptyTex();
    this.u = {
      uClothU: { value: e },
      uClothL: { value: e },
      uClothG: { value: e },
      uCloth: { value: new THREE.Vector4() },
      uClothR: { value: new THREE.Vector4(0.85, 0.85, 0, 0) },
    };
    patchJelly(jelly, this.u);
  }

  private detail(slot: 'u' | 'l'): Detail {
    let d = this.details[slot];
    if (!d) {
      const anchor = { value: 0 };
      const mk = (kind: 'cloth' | 'gloss' | 'metal') => {
        const m = new THREE.Mesh(undefined, makeHatMaterial(baseMat(kind), this.pose, anchor));
        m.visible = false;
        return m;
      };
      const node = new THREE.Group();
      d = { node, anchor, cloth: mk('cloth'), gloss: mk('gloss'), metal: mk('metal') };
      node.add(d.cloth, d.gloss, d.metal);
      this.body.add(node);
      this.details[slot] = d;
    }
    return d;
  }

  /** Наряд или команда сменились: слои, детали, варежки, эффект. team — пейнтбол (всё фермерское прячется) */
  set(o: Outfit, team: boolean): void {
    const uKey = team ? 'none' : slotKey(o, 'u');
    const lKey = team ? 'none' : slotKey(o, 'l');
    const shell = SHELL_ACCS.has(o.a);
    const key = `${uKey}|${lKey}|${o.a}|${shell}|${team}|${farmWearVersion}`;
    this.fxKind = team ? '' : slotKey(o, 'f');
    if (this.fx) this.fx.visible = this.fxKind !== '' && this.fxKind !== 'none';
    if (key === this.key) return;
    this.key = key;
    const uDef = LAYER[`u:${uKey}`];
    const lDef = LAYER[`l:${lKey}`];
    const c = this.u.uCloth.value;
    c.set(uDef ? 1 : 0, lDef ? 1 : 0, lKey === 'overalls' ? 1 : 0, uDef?.glow ? 0.45 : 0);
    this.u.uClothU.value = uDef ? layerTex(uDef.png, true) : emptyTex();
    this.u.uClothL.value = lDef ? layerTex(lDef.png, true) : emptyTex();
    this.u.uClothG.value = uDef?.glow ? layerTex(uDef.glow, false) : emptyTex();
    this.u.uClothR.value.set(uDef?.roughness ?? 0.85, lDef?.roughness ?? 0.85, uDef?.clearcoat ?? 0, lDef?.clearcoat ?? 0);

    const uPiece = uKey !== 'none' ? farmPiece(`u:${uKey}`) : null;
    const lPiece = lKey !== 'none' ? farmPiece(`l:${lKey}`) : null;
    this.applyDetail('u', uPiece, !shell, false);
    this.applyDetail('l', lPiece, true, uPiece !== null && lKey !== 'overalls');
    // варежки: манжеты верха, перчатки, корзинка
    for (const m of this.handMeshes) m.visible = false;
    let n = 0;
    const hand = (g: Geo | null, side: 0 | 1): void => {
      if (!g) return;
      let m = this.handMeshes[n];
      if (!m) {
        handMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
        m = new THREE.Mesh(g, handMat);
        this.handMeshes.push(m);
      }
      m.geometry = g;
      m.visible = true;
      this.mittens[side].add(m);
      n++;
    };
    const acc = !team ? farmPiece(`a:${o.a}`) : null;
    for (const p of [uPiece && !shell ? uPiece : null, acc]) {
      if (!p) continue;
      hand(p.hands[0], 1);
      hand(p.hands[1], 0);
    }
  }

  private applyDetail(slot: 'u' | 'l', p: FarmPiece | null, on: boolean, hideHigh: boolean): void {
    if (!p && !this.details[slot]) return;
    const d = this.detail(slot);
    const show = !!p && on;
    d.node.visible = show;
    if (!p || !show) return;
    d.anchor.value = p.wear.y;
    d.node.position.y = p.wear.y;
    const put = (m: THREE.Mesh, g: Geo | null): void => {
      m.visible = g !== null;
      if (g) m.geometry = g;
    };
    let cloth = p.wear.geo;
    let gloss = p.gloss;
    let metal = p.wear.metal;
    if (hideHigh) {
      cloth = cloth && splitAt(cloth, p.wear.y)[0];
      gloss = gloss && splitAt(gloss, p.wear.y)[0];
      metal = metal && splitAt(metal, p.wear.y)[0];
    }
    put(d.cloth, cloth);
    put(d.gloss, gloss);
    put(d.metal, metal);
  }

  /**
   * Кадр (желейка видна): эффект f, отчёт для ходячего питомца. true — догрузились вещи фермы, наряд надо перестроить.
   */
  update(dt: number, a: AvatarLike, local: boolean): boolean {
    const now = performance.now();
    const appeared = this.lastSeen < 0 || now - this.lastSeen > 600;
    this.lastSeen = now;
    const root = a.root;
    const scene = root.parent;
    // питомец
    const pet = slotKey(a.outfit, 's');
    if (scene && a.inWorld && WALK_PETS.has(pet)) {
      const w = this.walker;
      w.x = root.position.x;
      w.y = root.position.y;
      w.z = root.position.z;
      w.yaw = root.rotation.y;
      w.pet = pet;
      w.local = local;
      w.at = now;
      if (HAPPY_ACTS.has(a.action) && a.action !== this.lastAct) w.happy++;
      w.act = a.action;
      let list = WALKERS.get(scene);
      if (!list) WALKERS.set(scene, (list = new Map()));
      list.set(this, w);
    }
    this.lastAct = a.action;
    if (scene && local && a.inWorld) {
      const lw = LOCAL_WALKER.get(scene) ?? { x: 0, y: 0, z: 0, yaw: 0, pet: '', act: 0, local: true, at: 0, happy: 0 };
      lw.x = root.position.x;
      lw.y = root.position.y;
      lw.z = root.position.z;
      lw.yaw = root.rotation.y;
      lw.at = now;
      LOCAL_WALKER.set(scene, lw);
    }
    this.updateFx(dt, root, appeared);
    if (this.version !== farmWearVersion) {
      this.version = farmWearVersion;
      return true;
    }
    return false;
  }

  private updateFx(dt: number, root: THREE.Group, appeared: boolean): void {
    const kind = this.fxKind;
    if (kind !== 'fireflies' && kind !== 'treesparks') {
      if (this.fx) this.fx.visible = false;
      return;
    }
    if (!this.fx) {
      fxMat ??= new THREE.PointsMaterial({
        size: 0.13, map: softDot('rgba(255,255,255,1)'), vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FX_N * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FX_N * 3), 3));
      g.setDrawRange(0, 0);
      this.fx = new THREE.Points(g, fxMat);
      this.fx.frustumCulled = false;
      this.fx.renderOrder = 3;
      root.add(this.fx);
    }
    this.fx.visible = true;
    const p = root.position;
    const sp = this.sparks;
    if (kind === 'treesparks' && appeared) {
      // вихрь зелёно-золотых искорок и листочков на 1,5 с
      sp.length = 0;
      for (let i = 0; i < FX_N; i++) {
        const c = new THREE.Color(i % 3 === 0 ? 0x9be15a : i % 3 === 1 ? 0xffd36a : 0xffb347);
        sp.push({ x: i / FX_N, y: Math.random(), z: Math.random(), t: 0, life: 1.1 + Math.random() * 0.4, c });
      }
    }
    if (kind === 'fireflies') {
      // за желейкой тянутся медовые светлячки и гаснут через 2 с
      this.trailT -= dt;
      const moved = Math.hypot(p.x - (this.fx.userData.px ?? p.x), p.z - (this.fx.userData.pz ?? p.z));
      this.fx.userData.px = p.x;
      this.fx.userData.pz = p.z;
      if (this.trailT <= 0 && (moved > 0.01 || sp.length < 3)) {
        this.trailT = moved > 0.01 ? 0.3 : 1.2;
        if (sp.length >= 7) sp.shift();
        sp.push({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.4 + Math.random() * 0.9, z: p.z + (Math.random() - 0.5) * 0.5, t: 0, life: 2, c: new THREE.Color(0xffc35a) });
      }
    }
    const pos = this.fx.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.fx.geometry.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    const cos = Math.cos(-root.rotation.y);
    const sin = Math.sin(-root.rotation.y);
    for (let i = sp.length - 1; i >= 0; i--) {
      const s = sp[i];
      s.t += dt;
      if (s.t >= s.life) { sp.splice(i, 1); continue; }
      const k = s.t / s.life;
      let lx: number;
      let ly: number;
      let lz: number;
      if (kind === 'treesparks') {
        const ang = s.x * Math.PI * 2 + s.t * 5;
        const r = 0.65 + s.z * 0.2 - k * 0.2;
        lx = Math.sin(ang) * r;
        lz = Math.cos(ang) * r;
        ly = 0.1 + k * 1.6 + s.y * 0.3;
      } else {
        // мир → оси желейки (root повёрнут на yaw)
        const wx = s.x - p.x;
        const wz = s.z - p.z;
        lx = wx * cos - wz * sin;
        lz = wx * sin + wz * cos;
        ly = s.y - p.y + Math.sin(s.t * 3 + i) * 0.05;
      }
      pos.setXYZ(n, lx, ly, lz);
      const fade = Math.sin(Math.min(1, k * 1.2) * Math.PI) * (kind === 'fireflies' ? 0.9 + 0.1 * Math.sin(s.t * 9 + i) : 1);
      col.setXYZ(n, s.c.r * fade, s.c.g * fade, s.c.b * fade);
      n++;
    }
    this.fx.geometry.setDrawRange(0, n);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}
