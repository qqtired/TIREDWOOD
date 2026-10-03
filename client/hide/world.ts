// Мир пряток «Рыбный двор»: солнечный портовый дворик у моря. Твёрдое — из тех же коробок, что у сервера
// (shared/hidemap.ts), сверху — то, что делает двор уютным: навесы рынка с флажками, зонты кафе, двускатная крыша
// склада и тёплые лучи из его окон, теплица, лодка, сети, кран на помосте, город за забором и море с двух сторон.
// Ничего из украшений не твёрдое и не мешает прятаться: всё — над головой, внутри коробок или за краем двора.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../shared/constants.ts';
import { HIDE_BOUNDS, HIDE_GLASS, YARD, buildHideMap } from '../../shared/hidemap.ts';
import { makeRng } from '../../shared/math.ts';
import { Gulls, addBox, buildGeo, fitShadow, glowSprite, parts, staticMesh, type GeoParts } from '../render/kit.ts';
import { LOOK2 } from '../render/look.ts';
import { installLookTone, lookTone, paintMaterial, paintable, type PaintOptions } from '../render/lookpaint.ts';
import { LOOK_EVENING, lookSea, lookSky } from '../render/looksky.ts';
import type { Renderer } from '../render/renderer.ts';
import { fogColor, makeSea, makeSky, type SkyPalette } from '../render/sky.ts';
import * as tex from '../render/textures.ts';
import { TOUCH } from '../touch.ts';

/** Ясный день: солнце высоко на юго-западе, над морем; небо голубое, облака белые и редкие. */
export const YARD_SKY: SkyPalette = {
  ...LOOK_EVENING,
  sunDir: new THREE.Vector3(-0.42, 0.66, 0.62).normalize(),
  horizon: 0xd6ebf7,
  mid: 0x8fc2ee,
  zenith: 0x2e6fd6,
  sunGlow: 0xfff0c4,
  cloud: [0.74, 0.8, 0.96],
  cloudLit: [1.16, 1.12, 1.04],
  clouds: { cover: 0.5, alpha: 0.95, top: 1.0 },
  exposure: 1.0,
  fogNear: 70,
  fogFar: 430,
};

type G = THREE.BufferGeometry;

/** Покрасить фигуру одним цветом (вершины), без развёртки — для склейки цветных украшений. */
function tint(g: G, color: number | THREE.Color): G {
  const src = g.index ? g.toNonIndexed() : g;
  src.deleteAttribute('uv');
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = src.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  src.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return src;
}
function at(g: G, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): G {
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.setPosition(x, y, z);
  return g.applyMatrix4(m);
}
const cbox = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => at(tint(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, rx, rz);
/** Коробка по углам (min/max) одним цветом */
const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number) => cbox(x1 - x0, y1 - y0, z1 - z0, color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const ccyl = (rt: number, rb: number, h: number, color: number, x: number, y: number, z: number, seg = 12, rx = 0, rz = 0) => at(tint(new THREE.CylinderGeometry(rt, rb, h, seg), color), x, y, z, 0, rx, rz);
const cball = (r: number, color: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, detail = 1) => at(tint(new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz), color), x, y, z);

/** Двускатная крыша над прямоугольником: конёк вдоль X на высоте y + rise, свесы — over. */
function gable(x0: number, x1: number, z0: number, z1: number, y: number, rise: number, over: number, color: number, end: number): G[] {
  const zm = (z0 + z1) / 2, half = (z1 - z0) / 2 + over, len = x1 - x0 + over * 2;
  const slope = Math.atan2(rise, half), w = Math.hypot(rise, half);
  const out: G[] = [];
  for (const s of [-1, 1]) out.push(cbox(len, 0.12, w, color, (x0 + x1) / 2, y + rise / 2 - 0.02, zm + (s * half) / 2, 0, s * slope));
  // фронтоны (треугольники) из стены
  const tri = new THREE.BufferGeometry();
  const hz = (z1 - z0) / 2;
  tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -hz, 0, 0, hz, 0, rise, 0], 3));
  tri.computeVertexNormals();
  for (const [x, ry] of [[x0, -Math.PI / 2], [x1, Math.PI / 2]] as const) {
    const g = tint(tri.clone(), end);
    // двусторонний треугольник: вторая копия наоборот
    const back = tint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, hz, 0, 0, -hz, 0, rise, 0], 3)), end);
    back.computeVertexNormals();
    out.push(at(g, x, y, zm, ry + Math.PI / 2), at(back, x, y, zm, ry + Math.PI / 2));
  }
  return out;
}

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
}

/** Полосатая ткань навеса с зубчатым краем снизу. */
function awningTexture(a: string, b: string): THREE.CanvasTexture {
  return canvasTex(256, 128, (ctx) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * 32, 0, 32, 104); }
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.beginPath(); ctx.arc(i * 32 + 16, 104, 16, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, 256, 6);
  });
}

function chalkTexture(): THREE.CanvasTexture {
  return canvasTex(256, 384, (ctx) => {
    ctx.fillStyle = '#2b3a33'; ctx.fillRect(0, 0, 256, 384);
    ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, 240, 368);
    ctx.fillStyle = '#f4f1e6'; ctx.textAlign = 'center';
    ctx.font = '700 40px Rubik, system-ui, sans-serif'; ctx.fillText('МЕНЮ', 128, 70);
    ctx.font = '500 25px Rubik, system-ui, sans-serif';
    const rows = [['Уха', '150'], ['Пирожок', '50'], ['Мороженое', '80'], ['Чай', '30'], ['Килька', '?']];
    rows.forEach(([a, b], i) => { ctx.textAlign = 'left'; ctx.fillText(a, 30, 130 + i * 46); ctx.textAlign = 'right'; ctx.fillText(b, 226, 130 + i * 46); });
    ctx.fillStyle = '#ffd35a'; ctx.font = '700 22px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('сегодня свежая!', 128, 356);
  });
}

function netTexture(): THREE.CanvasTexture {
  const t = canvasTex(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(70,96,88,1)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - 64, 128); ctx.stroke();
    }
  }, true);
  return t;
}

/** Луч света из окна: ярче у окна, гаснет к полу. */
function shaftTexture(): THREE.CanvasTexture {
  return canvasTex(64, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,226,170,0.55)');
    g.addColorStop(1, 'rgba(255,226,170,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 256);
    const s = ctx.createLinearGradient(0, 0, 64, 0);
    s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.2, 'rgba(0,0,0,0)'); s.addColorStop(0.8, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = s; ctx.fillRect(0, 0, 64, 256);
  });
}

export class HideWorld {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 1200);
  readonly sun = new THREE.DirectionalLight(0xfff0d6, 3.2);
  readonly hemi = new THREE.HemisphereLight(0xbcd2f6, 0xd6b089, 1.35);
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly seaMat: THREE.ShaderMaterial;
  private readonly gulls: Gulls;
  /** Дверь сторожки: закрыта, пока ловцы ждут, открывается на выходе */
  private readonly door = new THREE.Group();
  private doorOpen = 0;
  doorTarget = 0;
  private readonly flags: THREE.Mesh[] = [];
  private painted = false;
  private time = 0;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.camera.rotation.order = 'YXZ';
    const scene = this.scene;
    const p = YARD_SKY;
    const fog = LOOK2 ? new THREE.Color(p.horizon) : fogColor(p);
    if (LOOK2) {
      installLookTone();
      scene.userData.toneMapping = THREE.CustomToneMapping;
      lookTone(fog, p.exposure);
    }
    scene.fog = new THREE.Fog(fog, p.fogNear, p.fogFar);
    scene.background = fog.clone();

    // свет: высокое тёплое солнце и голубое небо
    scene.add(this.hemi);
    const center = new THREE.Vector3(0, 1.5, 0);
    this.sun.position.copy(center).addScaledVector(p.sunDir, 90);
    this.sun.target.position.copy(center);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun, this.sun.target);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    fitShadow(this.sun, center, new THREE.Box3(new THREE.Vector3(-21, -1.3, -16), new THREE.Vector3(21, 7.5, 16)));

    const sky = makeSky(p);
    const sea = makeSea(p);
    this.skyMat = sky.material;
    this.seaMat = sea.material;
    if (LOOK2) { lookSky(this.skyMat); lookSea(this.seaMat); }
    scene.add(sky, sea);

    this.buildStatic();
    this.buildGround();
    this.buildWarehouse();
    this.buildDock();
    this.buildMarket();
    this.buildCafe();
    this.buildGarden();
    this.buildBoathouse();
    this.buildTown();
    this.gulls = new Gulls(scene, 0, 0);

    if (LOOK2) {
      const paint: PaintOptions = { grain: !TOUCH, uniforms: { uLookShade: { value: new THREE.Color(0.92, 0.97, 1.18) }, uLookSunInv: { value: 1.6 / (this.sun.intensity * 0.95) } } };
      scene.onBeforeRender = () => {
        if (this.painted) return;
        this.painted = true;
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh || o.userData.noPaint) return;
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (!paintable(m) || m.customProgramCacheKey().startsWith('jelly') || m.transparent) continue;
            paintMaterial(m, paint);
          }
        });
      };
    }
    renderer.refreshShadows();
  }

  /** Предметы и ловцы появились после первой отрисовки: их материалы тоже «рисованные» (до первой компиляции). */
  paintLater(): void { this.painted = false; }

  setQuality(q: 'low' | 'medium' | 'high'): void {
    const size = q === 'low' ? 1024 : 2048;
    const sh = this.sun.shadow;
    if (sh.mapSize.x === size) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
    this.renderer.refreshShadows();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.seaMat.uniforms.uTime.value = t;
    this.gulls.update(t);
    // флажки на ветру
    for (let i = 0; i < this.flags.length; i++) this.flags[i].rotation.x = Math.sin(t * 3.1 + i * 0.7) * 0.25;
    // дверь сторожки
    const k = Math.min(1, dt * 3);
    const was = this.doorOpen;
    this.doorOpen += (this.doorTarget - this.doorOpen) * k;
    if (Math.abs(this.doorOpen - this.doorTarget) < 0.002) this.doorOpen = this.doorTarget;
    this.door.rotation.y = this.doorOpen * 1.75;
    if (this.doorOpen !== was) this.renderer.refreshShadows();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera, YARD_SKY.exposure);
  }

  // ------------------------------------------------------------ твёрдое (коробки сервера)

  private buildStatic(): void {
    const map = buildHideMap();
    const rng = makeRng(11);
    const groups: Record<string, GeoParts> = {};
    const glass: G[] = [];
    map.boxes.forEach((b, i) => {
      if (i === 0 || b.mat === 'invisible') return;
      if (b.color === HIDE_GLASS) { glass.push(span(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], 0xffffff)); return; }
      const mat = b.mat === 'wood' ? 'plank' : b.mat;
      addBox((groups[mat] ??= parts()), b, mat, rng);
    });
    const look: Record<string, [THREE.Texture, number, number]> = {
      plank: [tex.plankTexture(), 0.86, 0],
      brick: [tex.brickTexture(), 0.92, 0],
      metal: [tex.metalTexture(), 0.5, 0.45],
      concrete: [tex.concreteTexture(), 0.94, 0],
      deck: [tex.deckTexture(), 0.9, 0],
    };
    for (const [mat, g] of Object.entries(groups)) {
      const [map, roughness, metalness] = look[mat] ?? look.concrete;
      this.scene.add(staticMesh(buildGeo(g), new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness, metalness }), true));
    }
    const glassMesh = new THREE.Mesh(mergeGeometries(glass, false)!, new THREE.MeshStandardMaterial({ color: 0xd8f1f4, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false }));
    glassMesh.renderOrder = 2;
    this.scene.add(glassMesh);
  }

  // ------------------------------------------------------------ земля, причал, море

  private buildGround(): void {
    const b = HIDE_BOUNDS, W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const paver = tex.paverTexture();
    paver.repeat.set(W / 3, D / 3);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: paver, color: 0xf3ead9, roughness: 0.95 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // настил террасы кафе
    const tr = YARD.terrace;
    const planks = tex.plankTexture();
    planks.repeat.set((tr.x1 - tr.x0) / 2, (tr.z1 - tr.z0) / 2);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(tr.x1 - tr.x0, tr.z1 - tr.z0).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: planks, color: 0xe2bd8f, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    deck.position.set((tr.x0 + tr.x1) / 2, 0.004, (tr.z0 + tr.z1) / 2);
    deck.receiveShadow = true;
    this.scene.add(deck);

    const g: G[] = [];
    // набережная стенка к морю (юг и восток) и кромка с жёлтой полосой
    g.push(span(b.minX - 6, WATER_Y - 1.5, b.maxZ, b.maxX + 0.6, 0, b.maxZ + 0.6, 0x9d978b));
    g.push(span(b.maxX, WATER_Y - 1.5, -9.2, b.maxX + 0.6, 0, b.maxZ + 0.6, 0x9d978b));
    g.push(span(b.minX, 0, b.maxZ - 0.12, b.maxX, 0.08, b.maxZ, 0xd8d0bf), span(b.minX, 0.08, b.maxZ - 0.1, b.maxX, 0.1, b.maxZ, 0xe8c547));
    // сваи под помостом и у причала
    for (let z = -14.6; z < -9.2; z += 1.4) g.push(ccyl(0.16, 0.16, 2.6, 0x5b4632, b.maxX + 0.25, 1.1 - 1.3, z, 8));
    // земля города за забором и складом
    g.push(span(b.minX - 60, -0.05, b.minZ - 60, b.maxX + 0.6, 0, b.minZ, 0xb9b1a2), span(b.minX - 60, -0.05, b.minZ, b.minX, 0, b.maxZ + 0.6, 0xb9b1a2));
    // перила террасы над морем
    for (let z = YARD.terrace.z0; z <= YARD.terrace.z1 + 0.01; z += 1.34) g.push(ccyl(0.035, 0.035, 1.0, 0xf2efe6, 19.93, 0.5, z, 6));
    g.push(span(19.88, 0.96, YARD.terrace.z0, 19.98, 1.02, YARD.terrace.z1, 0xf2efe6), span(19.9, 0.5, YARD.terrace.z0, 19.96, 0.54, YARD.terrace.z1, 0xf2efe6));
    // западный забор: столбики и верхняя планка; угол у склада
    for (let z = b.minZ; z <= b.maxZ; z += 2.5) g.push(span(-20.24, 0, z - 0.06, -20.0, 2.35, z + 0.06, 0x5c3d24));
    g.push(span(-20.25, 2.2, b.minZ, -19.98, 2.28, b.maxZ, 0x6b4a30));
    g.push(span(b.minX, 0, b.minZ - 0.25, YARD.warehouse.x0, 2.2, b.minZ, 0x7b5332));
    // кирпичная стена с воротами между складом и помостом
    g.push(span(YARD.warehouse.x1, 0, b.minZ - 0.4, YARD.dock.x0, 3.2, b.minZ, 0xa65d47));
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), true));
  }

  // ------------------------------------------------------------ склад

  private buildWarehouse(): void {
    const w = YARD.warehouse;
    const g: G[] = [];
    // двускатная крыша из оцинковки, фронтоны — кирпич
    g.push(...gable(w.x0, w.x1, w.z0, w.z1, w.h + 0.3, 1.5, 0.45, 0x9a5442, 0xb86a50));
    // окна на южной стене (снаружи — рама и стекло) и на северной (изнутри светятся)
    const winX = [-16.3, -10.9, -8.8, -6.2, -3.6, 2.1];
    for (const x of winX) {
      g.push(span(x - 0.62, 1.45, w.z1 - 0.02, x + 0.62, 2.55, w.z1 + 0.04, 0xf2efe6));
      g.push(span(x - 0.55, 1.52, w.z1 + 0.03, x + 0.55, 2.48, w.z1 + 0.05, 0x5c7a8c));
      g.push(span(x - 0.02, 1.52, w.z1 + 0.04, x + 0.02, 2.48, w.z1 + 0.06, 0xf2efe6), span(x - 0.55, 1.98, w.z1 + 0.04, x + 0.55, 2.02, w.z1 + 0.06, 0xf2efe6));
    }
    // створки ворот распахнуты к стене
    for (const [d0, d1] of w.doors) {
      const hw = (d1 - d0) / 2;
      g.push(span(d0 - hw - 0.02, 0, w.z1 + 0.04, d0 - 0.06, w.doorH - 0.05, w.z1 + 0.12, 0x2f6b7a), span(d1 + 0.06, 0, w.z1 + 0.04, d1 + hw + 0.02, w.doorH - 0.05, w.z1 + 0.12, 0x2f6b7a));
      g.push(span(d0 - 0.12, 0, w.z1 - 0.02, d0, w.doorH + 0.1, w.z1 + 0.06, 0xe9e2d0), span(d1, 0, w.z1 - 0.02, d1 + 0.12, w.doorH + 0.1, w.z1 + 0.06, 0xe9e2d0), span(d0 - 0.12, w.doorH, w.z1 - 0.02, d1 + 0.12, w.doorH + 0.12, w.z1 + 0.06, 0xe9e2d0));
    }
    // внутри: лампы под потолком, балки
    for (const x of [-13, -7, -1]) {
      g.push(ccyl(0.01, 0.01, 0.9, 0x2c3035, x, w.h - 0.45, -10.8, 4), at(tint(new THREE.ConeGeometry(0.32, 0.22, 14, 1, true), 0x2f5d4a), x, w.h - 0.95, -10.8));
    }
    for (let x = w.x0 + 2; x < w.x1; x += 4) g.push(span(x - 0.12, w.h - 0.3, w.z0, x + 0.12, w.h, w.z1, 0x6b4a30));
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), true));

    // тёплый свет внутри: три лампы и лучи из южных окон
    for (const x of [-13, -7, -1]) {
      const l = new THREE.PointLight(0xffc98a, 14, 13, 1.6);
      l.position.set(x, w.h - 1.15, -10.8);
      this.scene.add(l);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c8 }));
      bulb.position.set(x, w.h - 1.05, -10.8);
      bulb.userData.noPaint = true;
      this.scene.add(bulb);
      const glow = glowSprite(0xffd89a, 1.4, 0.35);
      glow.position.copy(bulb.position);
      this.scene.add(glow);
    }
    const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const patchMat = new THREE.MeshBasicMaterial({ map: tex.softDot('rgba(255,214,150,0.55)', 'rgba(255,214,150,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const run = 2.6;
    for (const x of winX) {
      // луч: от окна вниз и вглубь (солнце с юга)
      const len = Math.hypot(run, 2.0);
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.1, len), shaftMat);
      shaft.position.set(x, 1.0, w.z1 - 0.3 - run / 2);
      shaft.rotation.set(-Math.atan2(2.0, run) + Math.PI / 2, 0, 0);
      shaft.userData.noPaint = true;
      this.scene.add(shaft);
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4).rotateX(-Math.PI / 2), patchMat);
      patch.position.set(x, 0.012, w.z1 - 0.3 - run);
      this.scene.add(patch);
    }
    // вывеска над воротами
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.0), new THREE.MeshStandardMaterial({ map: tex.signTexture('РЫБНЫЙ СКЛАД № 3', '#1f4a66', '#f2e6cc', 1024, 160), roughness: 0.7 }));
    sign.position.set(-6.6, 3.55, w.z1 + 0.04);
    this.scene.add(sign);
  }

  // ------------------------------------------------------------ помост: кран и погрузчик

  private buildDock(): void {
    const dk = YARD.dock, f = YARD.forklift, c = YARD.crane;
    const g: G[] = [];
    // кромка помоста и ступени — светлые доски по краю
    g.push(span(dk.x0, dk.top - 0.02, dk.z1 - 0.1, dk.x1, dk.top + 0.02, dk.z1 + 0.02, 0xd9b17a));
    // погрузчик: колёса, стойки кабины, крыша, мачта спереди, противовес
    for (const [x, z] of [[f.x0 + 0.05, f.z0 + 0.45], [f.x1 - 0.05, f.z0 + 0.45], [f.x0 + 0.05, f.z1 - 0.45], [f.x1 - 0.05, f.z1 - 0.45]]) g.push(ccyl(0.28, 0.28, 0.18, 0x222326, x, dk.top + 0.28, z, 14, 0, Math.PI / 2));
    for (const [x, z] of [[f.x0 + 0.1, f.z0 + 0.5], [f.x1 - 0.1, f.z0 + 0.5], [f.x0 + 0.1, f.z1 - 0.3], [f.x1 - 0.1, f.z1 - 0.3]]) g.push(span(x - 0.04, dk.top + 1.0, z - 0.04, x + 0.04, dk.top + 1.9, z + 0.04, 0x2c3035));
    g.push(span(f.x0 + 0.05, dk.top + 1.86, f.z0 + 0.4, f.x1 - 0.05, dk.top + 1.9, f.z1 - 0.25, 0x2c3035));
    g.push(span(f.x0 + 0.15, dk.top + 0.1, f.z1 - 0.12, f.x0 + 0.27, dk.top + 1.9, f.z1 - 0.02, 0x3a3f45), span(f.x1 - 0.27, dk.top + 0.1, f.z1 - 0.12, f.x1 - 0.15, dk.top + 1.9, f.z1 - 0.02, 0x3a3f45));
    g.push(span(f.x0 + 0.2, dk.top + 0.75, f.z0 + 1.0, f.x1 - 0.2, dk.top + 0.85, f.z0 + 1.3, 0x222326));
    // кран: стойка, стрела к морю, противовес, трос с крюком и ящиком
    const top = dk.top + 0.9;
    g.push(ccyl(0.16, 0.2, 5.0, 0xd9a531, c.x, top + 2.5, c.z, 10));
    g.push(at(tint(new THREE.BoxGeometry(5.6, 0.28, 0.32), 0xd9a531), c.x - 0.6, top + 4.9, c.z, 0, 0, -0.08));
    g.push(span(c.x + 1.2, top + 4.4, c.z - 0.3, c.x + 2.0, top + 5.0, c.z + 0.3, 0x3a3f45));
    g.push(ccyl(0.015, 0.015, 2.6, 0x2c3035, c.x - 3.0, top + 3.6, c.z, 4), span(c.x - 3.12, top + 2.2, c.z - 0.08, c.x - 2.88, top + 2.3, c.z + 0.08, 0x2c3035));
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }), true));
  }

  // ------------------------------------------------------------ рынок: навесы, товары, флажки

  private buildMarket(): void {
    const colors: [string, string][] = [['#e0483a', '#fff6ea'], ['#2f7fc1', '#fff6ea'], ['#3a9a5b', '#fff6ea'], ['#f2a531', '#fff6ea']];
    const g: G[] = [];
    YARD.stalls.forEach((st, i) => {
      const [a, b] = colors[i % colors.length];
      const mat = new THREE.MeshStandardMaterial({ map: awningTexture(a, b), roughness: 0.85, side: THREE.DoubleSide });
      const back = st.z - st.face * 1.4, front = st.z + st.face * 0.95;
      const depth = Math.abs(front - back), drop = 0.35;
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(3.2, Math.hypot(depth, drop)), mat);
      roof.position.set(st.x, 2.44 - drop / 2, (back + front) / 2);
      roof.rotation.set(-Math.PI / 2 + st.face * Math.atan2(drop, depth), 0, 0);
      roof.castShadow = true; roof.receiveShadow = true;
      this.scene.add(roof);
      const val = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.32), mat);
      val.position.set(st.x, 2.44 - drop - 0.16, front);
      this.scene.add(val);
      // товар на прилавке: рыба на льду, фрукты, банки
      const top = 0.96, z = st.z + st.face * 0.05;
      for (let k = 0; k < 3; k++) {
        const x = st.x - 1.0 + k * 1.0;
        g.push(span(x - 0.4, top, z - 0.28, x + 0.4, top + 0.08, z + 0.28, 0xeaf6fb));
        if ((i + k) % 2 === 0) for (let n = 0; n < 4; n++) g.push(cball(0.07, 0xb8c6d2, x - 0.24 + n * 0.16, top + 0.11, z + (n % 2 ? 0.08 : -0.08), 2.4, 0.6, 1, 0));
        else for (let n = 0; n < 7; n++) g.push(cball(0.065, n % 3 ? 0xff8a1c : 0xe8443a, x - 0.25 + (n % 4) * 0.16, top + 0.13, z + (n < 4 ? -0.1 : 0.1), 1, 1, 1, 0));
      }
      // ценник
      g.push(span(st.x + 1.1, top, st.z + st.face * 0.43, st.x + 1.4, top + 0.22, st.z + st.face * 0.45, 0xfff6ea));
    });
    // колодец: двускатная крыша на столбиках, ворот с ведром
    const wl = YARD.well;
    g.push(...gable(wl.x - 0.8, wl.x + 0.8, wl.z - 0.55, wl.z + 0.55, 2.2, 0.55, 0.12, 0x9a5442, 0x7b5332));
    g.push(ccyl(0.06, 0.06, 1.3, 0x6b4a30, wl.x - 0.05, 1.55, wl.z, 8, 0, Math.PI / 2), ccyl(0.11, 0.09, 0.2, 0x8aa0ad, wl.x + 0.1, 1.0, wl.z, 10));
    g.push(span(wl.x - wl.half + 0.08, wl.h - 0.02, wl.z - wl.half + 0.08, wl.x + wl.half - 0.08, wl.h, wl.z + wl.half - 0.08, 0x22313a));
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), true));
    // гирлянды флажков над рынком
    const flagGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.3, 0], 3));
    flagGeo.computeVertexNormals();
    const flagCols = [0xe0483a, 0xffd35a, 0x2f7fc1, 0x3a9a5b, 0xff8fb1, 0xffffff];
    const lineMat = new THREE.LineBasicMaterial({ color: 0x5b4632 });
    const lines: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-7.3, 2.4, -2.6), new THREE.Vector3(4.1, 2.4, 7.4)],
      [new THREE.Vector3(-7.3, 2.4, 7.4), new THREE.Vector3(4.1, 2.4, -2.6)],
      [new THREE.Vector3(-4.3, 2.4, -2.6), new THREE.Vector3(1.1, 2.4, -2.6)],
    ];
    lines.forEach(([a, b], li) => {
      const n = Math.round(a.distanceTo(b) / 0.5);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * 0.45;
        pts.push(p);
        if (i > 0 && i < n) {
          const mat = new THREE.MeshStandardMaterial({ color: flagCols[(i + li) % flagCols.length], side: THREE.DoubleSide, roughness: 0.8 });
          const f = new THREE.Mesh(flagGeo, mat);
          f.position.copy(p);
          f.rotation.order = 'YXZ';
          f.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
          this.flags.push(f);
          this.scene.add(f);
        }
      }
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    });
  }

  // ------------------------------------------------------------ кафе «Чайка»

  private buildCafe(): void {
    const g: G[] = [];
    // зонты: полосатые купола на шестах
    YARD.tables.forEach(([x, z], i) => {
      if (!(YARD.umbrellas as readonly number[]).includes(i)) return;
      for (let s = 0; s < 8; s++) g.push(at(tint(new THREE.ConeGeometry(1.15, 0.38, 2, 1, true, (s * Math.PI) / 4, Math.PI / 4), s % 2 ? 0xfff6ea : [0x2f7fc1, 0xe0483a, 0x3a9a5b][i % 3]), x, 2.5, z));
      g.push(cball(0.05, 0xfff6ea, x, 2.7, z));
    });
    // киоск: окно выдачи, козырёк, прилавок
    const k = YARD.kiosk;
    g.push(span(k.x0 - 0.02, 1.0, -7.5, k.x0 + 0.02, 2.1, -5.7, 0x3a2b31));
    g.push(span(k.x0 - 0.35, 0.95, -7.6, k.x0, 1.02, -5.6, 0xf2efe6));
    g.push(at(tint(new THREE.BoxGeometry(0.7, 0.05, 2.4), 0xe0483a), k.x0 - 0.3, 2.3, -6.6, 0, 0, 0.3));
    g.push(span(k.x0 - 0.1, k.h, k.z0 - 0.1, k.x1, k.h + 0.12, k.z1 + 0.1, 0x2f7fc1));
    // доска «Меню» стоит в коробке у входа на террасу
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), true));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.49), new THREE.MeshStandardMaterial({ map: tex.cafeSignTexture(), roughness: 0.7 }));
    sign.position.set(k.x0 - 0.03, 2.72, -6.6);
    sign.rotation.y = -Math.PI / 2;
    this.scene.add(sign);
    const chalk = new THREE.MeshStandardMaterial({ map: chalkTexture(), roughness: 0.9 });
    for (const s of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.54), chalk);
      board.position.set(9.05, 0.68, -4.3 + s * 0.052);
      board.rotation.y = s > 0 ? 0 : Math.PI;
      this.scene.add(board);
    }
  }

  // ------------------------------------------------------------ огородик и теплица

  private buildGarden(): void {
    const g: G[] = [];
    const rng = makeRng(41);
    for (const bd of YARD.beds) {
      g.push(span(bd.x0 + 0.06, YARD.bedH - 0.04, bd.z0 + 0.06, bd.x1 - 0.06, YARD.bedH - 0.01, bd.z1 - 0.06, 0x5a3a24));
      for (let x = bd.x0 + 0.3; x < bd.x1 - 0.2; x += 0.42) {
        for (let z = bd.z0 + 0.3; z < bd.z1 - 0.2; z += 0.5) {
          if (rng() < 0.35) continue;
          const kind = rng();
          if (kind < 0.5) g.push(cball(0.1 + rng() * 0.04, 0x6fb24a, x, YARD.bedH + 0.06, z, 1, 0.7, 1, 1));
          else g.push(at(tint(new THREE.ConeGeometry(0.06, 0.2, 5), 0x4f9a3c), x, YARD.bedH + 0.08, z));
        }
      }
    }
    // яблоня
    const t = YARD.tree;
    g.push(cball(1.5, 0x4f9a3c, t.x, 3.3, t.z, 1.1, 0.85, 1.1, 2), cball(0.9, 0x5fae47, t.x + 0.8, 3.7, t.z - 0.5, 1, 0.9, 1, 1), cball(0.8, 0x438a35, t.x - 0.9, 3.0, t.z + 0.6, 1, 0.9, 1, 1));
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, y = 2.6 + rng() * 1.4, r = 1.25 + rng() * 0.35;
      g.push(cball(0.07, 0xd8342c, t.x + Math.cos(a) * r, y, t.z + Math.sin(a) * r, 1, 1, 1, 0));
    }
    // рамы теплицы и растения в ящиках
    const gh = YARD.greenhouse;
    for (const x of [gh.x0, (gh.x0 + gh.x1) / 2, gh.x1 - 0.05]) for (const z of [gh.z0, gh.z1 - 0.05]) g.push(span(x, 0, z, x + 0.05, gh.h + 0.06, z + 0.05, 0xf4f1ea));
    for (let z = gh.z0; z < gh.z1; z += 1.55) g.push(span(gh.x0, gh.h, z, gh.x1, gh.h + 0.08, z + 0.05, 0xf4f1ea), span(gh.x0 - 0.01, 0, z, gh.x0 + 0.07, gh.h, z + 0.05, 0xf4f1ea));
    g.push(span(gh.x1 - 0.07, 0, gh.doorZ0 - 0.05, gh.x1 + 0.01, 2.15, gh.doorZ0, 0xf4f1ea), span(gh.x1 - 0.07, 0, gh.doorZ1, gh.x1 + 0.01, 2.15, gh.doorZ1 + 0.05, 0xf4f1ea));
    const pt = YARD.potting;
    for (let z = pt.z0 + 0.4; z < pt.z1; z += 0.7) g.push(cball(0.16, 0x5fae47, (pt.x0 + pt.x1) / 2, pt.top + 0.14, z, 1, 0.8, 1, 1), cball(0.04, 0xd8342c, (pt.x0 + pt.x1) / 2 + 0.1, pt.top + 0.2, z + 0.06, 1, 1, 1, 0));
    // кусты вдоль западного забора (за пределами коробок предметов — у самой доски)
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: tex.signTexture('ОГОРОД', '#3a6b3f', '#f4efe6'), roughness: 0.7 }));
    sign.position.set(YARD.fence.x + 0.07, 0.6, 1.0);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
  }

  // ------------------------------------------------------------ лодочная и сторожка ловцов

  private buildBoathouse(): void {
    const g: G[] = [];
    const bt = YARD.boat;
    // киль и белая полоса по борту
    g.push(span(bt.x0 + 0.1, bt.top, (bt.z0 + bt.z1) / 2 - 0.06, bt.x1 - 0.1, bt.top + 0.08, (bt.z0 + bt.z1) / 2 + 0.06, 0x23434a));
    g.push(span(bt.x0 - 0.01, bt.gap + 0.08, bt.z0 - 0.01, bt.x1 + 0.01, bt.gap + 0.16, bt.z1 + 0.01, 0xf4f1ea));
    // сети на раме и поплавки
    const n = YARD.nets;
    g.push(span(n.x0, 1.95, n.z - 0.03, n.x1, 2.0, n.z + 0.03, 0x6b4a30));
    for (let x = n.x0 + 0.3; x < n.x1; x += 0.45) g.push(cball(0.06, 0xff8a1c, x, 1.9, n.z, 1, 1, 1, 0));
    // кнехты — чугунные тумбы (коробки сервера внутри)
    for (const x of YARD.bollards) g.push(ccyl(0.15, 0.17, 0.42, 0x2e3338, x, 0.21, 14.6, 12), ccyl(0.2, 0.2, 0.08, 0x2e3338, x, 0.46, 14.6, 12));
    // сторожка: двускатная крыша, табличка, окно
    const sh = YARD.shed;
    g.push(...gable(sh.x0, sh.x1, sh.z0, sh.z1, sh.h + 0.2, 0.9, 0.3, 0x3f5a46, 0x7b5332));
    g.push(span(sh.x1 + 0.0, 1.3, 13.3, sh.x1 + 0.05, 2.1, 14.2, 0xf2efe6), span(sh.x1 + 0.03, 1.36, 13.36, sh.x1 + 0.07, 2.04, 14.14, 0x5c7a8c));
    this.scene.add(staticMesh(mergeGeometries(g, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), true));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(n.x1 - n.x0, 1.6), new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
    (net.material as THREE.MeshStandardMaterial).map!.repeat.set((n.x1 - n.x0) / 0.8, 2);
    net.position.set((n.x0 + n.x1) / 2, 1.15, n.z);
    net.userData.noPaint = true;
    this.scene.add(net);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshStandardMaterial({ map: tex.signTexture('СТОРОЖКА', '#3f5a46', '#f4efe6'), roughness: 0.7 }));
    sign.position.set(sh.x1 + 0.03, 2.45, (sh.doorZ0 + sh.doorZ1) / 2);
    sign.rotation.y = Math.PI / 2;
    this.scene.add(sign);
    // дверь сторожки: петли у северного края проёма, открывается наружу
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.15, sh.doorZ1 - sh.doorZ0 - 0.04).translate(0, 1.075, (sh.doorZ1 - sh.doorZ0) / 2), new THREE.MeshStandardMaterial({ map: tex.plankTexture(), color: 0x8a5a3a, roughness: 0.85 }));
    leaf.castShadow = true; leaf.receiveShadow = true;
    this.door.add(leaf);
    this.door.position.set(sh.x1 - 0.1, 0, sh.doorZ0 + 0.02);
    this.scene.add(this.door);
  }

  // ------------------------------------------------------------ город за забором, дальний берег

  private buildTown(): void {
    const rng = makeRng(7);
    const fac = tex.townFacadeTextures();
    const walls: G[] = [];
    const roofs: G[] = [];
    const pastel = [0xf2d7a8, 0xe9b8a0, 0xcfe0d0, 0xd8d0ea, 0xf4e3c3, 0xe6c3a1, 0xbfd8e6, 0xf0c9c9];
    const house = (x0: number, x1: number, z0: number, z1: number, h: number, alongX: boolean) => {
      const g = tint(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), pastel[(rng() * pastel.length) | 0]);
      // развёртка фасада: 24 м на повтор, как в городе набережной
      const box = new THREE.BoxGeometry(x1 - x0, h, z1 - z0);
      const uv = box.getAttribute('uv') as THREE.BufferAttribute;
      const dims: [number, number][] = [[z1 - z0, h], [z1 - z0, h], [x1 - x0, z1 - z0], [x1 - x0, z1 - z0], [x1 - x0, h], [x1 - x0, h]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / 24, uv.getY(i) * dims[f][1] / 24); }
      const src = box.toNonIndexed();
      src.setAttribute('color', g.getAttribute('color'));
      walls.push(at(src, (x0 + x1) / 2, h / 2, (z0 + z1) / 2));
      const roof = rng() < 0.6 ? 0xa4553f : 0x5d6f7a;
      if (alongX) roofs.push(...gable(x0, x1, z0, z1, h, 2.2, 0.3, roof, roof));
      else {
        // конёк вдоль Z: строим вдоль X у начала координат и поворачиваем на 90°
        const L = z1 - z0, D = x1 - x0;
        const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition((x0 + x1) / 2, h, (z0 + z1) / 2);
        for (const gg of gable(-L / 2, L / 2, -D / 2, D / 2, 0, 2.2, 0.3, roof, roof)) roofs.push(gg.applyMatrix4(turn));
      }
    };
    // ряд домов за складом (север)
    for (let x = -40; x < 42;) {
      const w = 6 + rng() * 4, d = 6 + rng() * 3, h = 7 + rng() * 6;
      house(x, x + w, -16.5 - d - rng() * 2, -16.5, h, true);
      x += w + 0.4 + rng() * 1.5;
    }
    // ряд за западным забором
    for (let z = -16; z < 16;) {
      const w = 6 + rng() * 4, d = 6 + rng() * 3, h = 6 + rng() * 5;
      house(-22 - d, -22, z, z + w, h, false);
      z += w + 0.6 + rng() * 2;
    }
    const facadeMat = new THREE.MeshStandardMaterial({ map: fac.map, vertexColors: true, roughness: 0.9 });
    this.scene.add(staticMesh(mergeGeometries(walls, false)!, facadeMat, true));
    this.scene.add(staticMesh(mergeGeometries(roofs, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true));
    // деревья вдоль города
    const trees: G[] = [];
    for (let i = 0; i < 18; i++) {
      const x = -21 - rng() * 1.2, z = -14 + i * 1.7 + rng();
      if (rng() < 0.4) continue;
      trees.push(ccyl(0.12, 0.16, 2.2, 0x6b4a30, x, 1.1, z, 6), cball(1.0 + rng() * 0.6, rng() < 0.5 ? 0x4f9a3c : 0x5fae47, x, 3.0 + rng() * 0.6, z, 1, 1.1, 1, 1));
    }
    this.scene.add(staticMesh(mergeGeometries(trees, false)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), true));
    // дальний берег: холмы и маяк в дымке (без тумана — дымка в цвете)
    const haze = new THREE.Color(YARD_SKY.horizon);
    const far: G[] = [];
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Color(0x6f9a7a).lerp(haze, 0.55 + rng() * 0.15);
      const a = -0.2 + i * 0.22;
      far.push(at(tint(new THREE.ConeGeometry(70 + rng() * 50, 26 + rng() * 22, 7), c), 330 * Math.sin(a) + 60, WATER_Y + 8, 330 * Math.cos(a) + 40));
    }
    far.push(ccyl(2.2, 2.8, 16, new THREE.Color(0xf2efe6).lerp(haze, 0.3).getHex(), 140, WATER_Y + 8, 210, 10), ccyl(2.6, 2.6, 3, new THREE.Color(0xd8342c).lerp(haze, 0.3).getHex(), 140, WATER_Y + 17, 210, 10));
    const farMesh = new THREE.Mesh(mergeGeometries(far, false)!, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
    farMesh.userData.noPaint = true;
    this.scene.add(farMesh);
  }
}
