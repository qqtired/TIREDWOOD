// «Ракушка» в мире (флаг QUIZ, docs/quiz/tech.md §2, §11, §14): площадка из quiz_venue.glb в точке world из
// shared/quiz/venue-data.json, пульты (в части 1 — в люках) — инстансами, лампочки кромки и рамки табло — один InstancedMesh
// с бегущим светом (яркостью, без настоящих ламп), табло и вывеска — холсты на квады board_face / sign_face (рисует
// интерфейс: uikit.ts). Материалы — общие семейства павильонов plaza3 (p3_matte / p3_gloss / p3_glow): новых программ нет.
// Неподвижное вместе с 24 креслами склеено по семейству, как у павильонов (pavilions.ts): 3 отрисовки с тенью общей
// программой; у инстансов и Затейника тени нет — тень инстансов и скининга собрала бы новые программы глубины.
// Табло, вывеска и пульты — p3keep
// (не гаснут по дальности, plaza3/perf.ts), остальное — как павильоны. Размеры берутся из данных: v3 встаёт заменой GLB и json.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import type { QzBoard } from '../../../shared/quiz/types.ts';
import { worldGeometry } from '../plaza3/models.ts';
import { plaza3Shadows } from '../plaza3/mounts.ts';
import { QuizEasel, type EaselDeps } from './easel.ts';
import { canvasTex, familyOf, type CanvasTex, type Family, type FamilyMats } from './kit3d.ts';
import { QuizPults } from './pults.ts';
import { boardUi, paintBoard, paintSign } from './uikit.ts';

export type { Family, FamilyMats };

/** Газон площадки в GLB лежит на 1,6 см, пятна пола plaza3 — до 1,3 см: подъём на 2 см даёт зазор ≥ 1,5 см (AGENTS §7) */
export const VENUE_LIFT = 0.02;
/** Холсты: табло — не чаще 4 раз в секунду и только при изменении (время — раз в секунду), вывеска — раз в секунду */
const BOARD_MIN_S = 0.25;
/** Дальше этого лампочки не мигают (они и так в пиксель) */
const BULBS_FAR = 70;

/** Адрес GLB «Ракушки» (Vite собирает шаблон new URL в список файлов папки, как plaza3/models.ts) */
export function quizAsset(file: string): string {
  const name = file.replace(/\.glb$/, '');
  return new URL(`../../assets/quiz/${name}.glb`, import.meta.url).href;
}

const loader = new GLTFLoader();
async function load(file: string): Promise<THREE.Group | null> {
  try {
    return (await loader.loadAsync(quizAsset(file))).scene;
  } catch (e) {
    console.warn('[ракушка] модель', file, e);
    return null;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
const WARM = new THREE.Color(0xffe3a6);

export class QuizVenue3D {
  readonly group = new THREE.Group();
  private readonly mats: FamilyMats;
  private readonly gl: THREE.WebGLRenderer;
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  /** Корень площадки: world с поворотом (местные координаты GLB → мир) */
  private readonly root = new THREE.Group();
  private board: CanvasTex | null = null;
  private sign: CanvasTex | null = null;
  /** Квад табло — для луча мыши (клик по карточке, клетке, паку) */
  boardMesh: THREE.Mesh | null = null;
  /** Часть 2: пульты в люках и мольберт */
  pults: QuizPults | null = null;
  easel: QuizEasel | null = null;
  private readonly easelDeps: Pick<EaselDeps, 'canvas' | 'canDraw' | 'send' | 'tool'> | null;
  private readonly mySlot: () => number;
  private bulbs: THREE.InstancedMesh | null = null;
  /** Лампочки рамки табло идут по кругу: их номера в InstancedMesh */
  private frameBulbs = 0;
  private edgeBulbs = 0;
  private snap: QzBoard | null = null;
  private serverNow: () => number = () => Date.now();
  private dirty = true;
  private paintedAt = -1;
  private paintedSec = -1;
  private signSec = -1;
  /** Праздник: лампочки бегут быстрее до этого времени (с) */
  private partyUntil = 0;
  private checking = false;
  private time = 0;
  readonly stats = { ready: false, draws: 0, tris: 0, failed: [] as string[] };

  constructor(o: { scene: THREE.Scene; gl: THREE.WebGLRenderer; camera: THREE.Camera; mats: FamilyMats; mySlot?: () => number; easel?: Pick<EaselDeps, 'canvas' | 'canDraw' | 'send' | 'tool'> }) {
    this.scene = o.scene;
    this.mySlot = o.mySlot ?? (() => 0);
    this.easelDeps = o.easel ?? null;
    this.gl = o.gl;
    this.camera = o.camera;
    this.mats = o.mats;
    const w = QUIZ_VENUE.world;
    this.group.name = 'quiz-venue';
    this.root.position.set(w.x, (w.y ?? 0) + VENUE_LIFT, w.z);
    this.root.rotation.y = w.yaw;
    this.group.add(this.root);
    this.scene.add(this.group);
    void this.build();
  }

  /** Табло и вывеска рисуют этот снимок (часы сервера — для отсчётов) */
  setBoard(b: QzBoard | null, serverNow: () => number): void {
    this.snap = b;
    this.serverNow = serverNow;
    this.dirty = true;
    this.checking = !!b?.riddle?.checking;
    this.applyParts();
  }

  /** Табло перерисовать (подсветка мышью, новый мазок на мольберте) */
  markBoard(): void {
    this.dirty = true;
  }

  /** Пульты и мольберт — по снимку; рисунок «Крокодила» табло дублирует, пока мольберт на сцене */
  private applyParts(): void {
    const b = this.snap;
    const now = this.serverNow();
    this.pults?.set(b, this.mySlot(), now);
    this.easel?.set(b);
    boardUi.drawing = b?.mode === 'croc' && this.easel ? this.easel.canvas : null;
  }

  /** Праздник на сцене: лампочки бегут быстро seconds секунд */
  party(seconds: number): void {
    this.partyUntil = this.time + seconds;
  }

  private async build(): Promise<void> {
    const d = QUIZ_VENUE.data;
    const [venue, chair, pult, easel] = await Promise.all([load(d.glb.venue), load(d.glb.chair), load(d.glb.pult), load(d.glb.easel)]);
    if (!venue) {
      this.stats.failed.push(d.glb.venue);
      return;
    }
    venue.updateMatrixWorld(true);
    // --- неподвижное: склейка по семейству (листва — матовое), лица табло и вывески — свои сетки с холстами
    const buckets: Record<Family, THREE.BufferGeometry[]> = { matte: [], gloss: [], glow: [] };
    const bulbAt: THREE.Vector3[] = [];
    const frameAt: THREE.Vector3[] = [];
    venue.traverse((o) => {
      const n = (typeof o.userData.name === 'string' ? o.userData.name : o.name) as string;
      if (n.startsWith('anchor_bulbs_board_')) frameAt.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
      else if (n.startsWith('anchor_bulbs_') && !n.startsWith('anchor_bulbs_board')) bulbAt.push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const owner = mesh.parent && mesh.parent !== venue && !mesh.name.startsWith('board_face') && !mesh.name.startsWith('sign_face') ? mesh.parent.name : mesh.name;
      if (owner.startsWith('board_face') || owner.startsWith('sign_face') || owner.startsWith('plate_faces')) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      buckets[familyOf(mats[0])].push(worldGeometry(mesh.geometry, mesh.matrixWorld));
    });
    // кресла не двигаются — в ту же склейку (тень — общей программой статики, отдельной отрисовки нет)
    if (chair) {
      chair.updateMatrixWorld(true);
      for (const c of d.chairs) {
        _m.compose(_p.set(c.x, c.y, c.z), _q.setFromAxisAngle(_up, c.yaw), _one);
        chair.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) buckets[familyOf(Array.isArray(m.material) ? m.material[0] : m.material)].push(worldGeometry(m.geometry, new THREE.Matrix4().multiplyMatrices(_m, m.matrixWorld)));
        });
      }
    } else this.stats.failed.push(d.glb.chair);
    let tris = 0;
    for (const f of ['matte', 'gloss', 'glow'] as const) {
      const list = buckets[f];
      if (!list.length) continue;
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats[f]);
      mesh.name = `quiz-static-${f}`;
      mesh.castShadow = f !== 'glow';
      mesh.receiveShadow = f !== 'glow';
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
      this.root.add(mesh);
    }
    // --- табло и вывеска: квад из GLB, холст интерфейса (MeshBasic без тонмаппинга — цвета как в UI)
    const face = (name: string, w: number, h: number): CanvasTex | null => {
      const src = venue.getObjectByName(name) as THREE.Mesh | undefined;
      if (!src?.isMesh) return null;
      const t = canvasTex(w, h);
      const m = new THREE.Mesh(src.geometry, new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false }));
      m.name = `quiz-${name}`;
      m.matrixAutoUpdate = false;
      m.matrix.copy(src.matrixWorld);
      // не гаснет по дальности (сетка — p3keep); материал приводит к общему виду plaza3/perf.ts — своей программы нет
      m.userData.p3keep = true;
      this.root.add(m);
      if (name === 'board_face') this.boardMesh = m;
      return t;
    };
    this.board = face('board_face', d.board.canvas[0] ?? 2048, d.board.canvas[1] ?? 1024);
    // вывеска — там, где в GLB лежит узел sign_face (с оградой — над аркой, без ограды — где положил левел-дизайнер; нет узла — нет вывески)
    this.sign = face('sign_face', d.sign?.canvas?.[0] ?? 1024, d.sign?.canvas?.[1] ?? 256);
    // --- пульты в люках (крышка вровень с настилом); в «Своей игре» занятые выезжают (pults.ts)
    if (pult) {
      this.pults = new QuizPults(this.root, pult, venue, this.mats);
      tris += this.pults.tris;
    } else this.stats.failed.push(d.glb.pult);
    // --- мольберт ждёт за кулисами, в «Крокодиле» выезжает (easel.ts)
    if (easel && this.easelDeps) {
      this.easel = new QuizEasel({ ...this.easelDeps, root: this.root, easel, mats: this.mats, camera: this.camera, changed: () => this.markBoard() });
      tris += this.easel.tris;
    }
    this.applyParts();
    // --- лампочки: кромка ракушки и рама табло — один InstancedMesh, цвет экземпляра — яркость
    const all = [...frameAt, ...bulbAt];
    if (all.length) {
      const g = new THREE.IcosahedronGeometry(0.055, 0);
      const n = g.getAttribute('position').count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const inst = new THREE.InstancedMesh(g, this.mats.glow, all.length);
      all.forEach((p, i) => {
        inst.setMatrixAt(i, _m.makeTranslation(p.x, p.y, p.z));
        inst.setColorAt(i, WARM);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.name = 'quiz-bulbs';
      inst.castShadow = false;
      this.root.add(inst);
      this.bulbs = inst;
      this.frameBulbs = frameAt.length;
      this.edgeBulbs = bulbAt.length;
      tris += all.length * 20;
    }
    this.group.updateMatrixWorld(true);
    try {
      await this.gl.compileAsync(this.group, this.camera, this.scene);
    } catch {
      // нет KHR_parallel_shader_compile — соберутся на первом кадре
    }
    let draws = 0;
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) draws++; });
    this.stats.draws = draws;
    this.stats.tris = Math.round(tris);
    this.stats.ready = true;
    this.dirty = true;
    // тени набережной пересчитываются по событию (shadowMap.autoUpdate = false) — площадка встала
    plaza3Shadows.refresh();
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.time += dt;
    if (!this.stats.ready) return;
    const now = this.serverNow();
    const sec = Math.floor(now / 1000);
    // табло: изменился снимок — не чаще 4 раз в секунду; идёт отсчёт — раз в секунду
    const b = this.snap;
    this.pults?.update(dt);
    this.easel?.update(dt);
    const ends = Math.max(b?.endsAt ?? 0, b?.riddle?.endsAt ?? 0, b?.jp?.endsAt ?? 0, b?.croc?.endsAt ?? 0, b?.who?.endsAt ?? 0);
    if (this.board && b && (this.dirty || (sec !== this.paintedSec && ends > now)) && this.time - this.paintedAt >= BOARD_MIN_S) {
      this.paintedAt = this.time;
      this.paintedSec = sec;
      this.dirty = false;
      paintBoard(this.board.ctx, b, now);
      this.board.tex.needsUpdate = true;
    }
    if (this.sign && sec !== this.signSec) {
      this.signSec = sec;
      paintSign(this.sign.ctx, b ?? IDLE, now);
      this.sign.tex.needsUpdate = true;
    }
    this.updateBulbs(camPos);
  }

  /** Бегущий свет: по раме табло идёт волна; в проверке — быстрее и ярче, в празднике — всё мигает */
  private updateBulbs(camPos: THREE.Vector3): void {
    const inst = this.bulbs;
    if (!inst || !inst.instanceColor) return;
    if (camPos.distanceTo(this.root.position) > BULBS_FAR) return;
    const t = this.time;
    const party = t < this.partyUntil;
    const speed = party ? 26 : this.checking ? 18 : 5;
    const n = this.frameBulbs;
    for (let i = 0; i < inst.count; i++) {
      let k: number;
      if (i < n) {
        const ph = ((i / Math.max(1, n)) * 16 - t * speed / 4) % 1;
        const wave = 0.5 + 0.5 * Math.cos((ph < 0 ? ph + 1 : ph) * Math.PI * 2);
        k = party ? (Math.floor(t * 8 + i) % 2 ? 1.4 : 0.35) : 0.55 + 0.6 * wave * wave;
      } else {
        k = party ? (Math.floor(t * 6 + i) % 3 ? 1.2 : 0.4) : 0.9 + 0.1 * Math.sin(t * 1.3 + i);
      }
      inst.setColorAt(i, _c.copy(WARM).multiplyScalar(k));
    }
    inst.instanceColor.needsUpdate = true;
  }

  debug(): Record<string, unknown> {
    return { ...this.stats, bulbs: { frame: this.frameBulbs, edge: this.edgeBulbs }, pults: this.pults?.raised ?? null, easel: this.easel?.shown ?? null };
  }
}

/** Снимок «игры нет» до первого письма сервера — вывеска не пустая */
const IDLE: QzBoard = {
  rev: 0, now: 0, phase: 'idle', endsAt: 0, mode: null, count: 0, seated: 0, vote: null, riddle: null, results: null, evening: [], noTokens: true, zat: null,
};
