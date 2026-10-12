// Рендерер один на всё приложение: набережная и пейнтбол рисуют через него по очереди, у каждой сцены своя камера.
import * as THREE from 'three';
import { LOW_SHADOW_SIZE, type ShadowLevel } from './gfx.ts';

/** Туман ближе этого (подвал, закрытая арена) дальностью прорисовки не трогаем: там и так видно только комнату */
const MIN_FOG_FAR = 80;

/** Источник света, который умеет отбрасывать тени (солнце, прожектор, лампа) */
type ShadowLight = THREE.Light & { shadow: THREE.LightShadow };

/** Экран уже 4 : 3 (телефон стоя) — поле зрения шире, иначе по бокам почти ничего не видно; не больше 95°. */
const NARROW_ASPECT = 4 / 3;
const NARROW_MAX_FOV = 95;

/** Вертикальное поле зрения для экрана с пропорцией aspect (на обычном экране — как есть). */
export function narrowFov(fov: number, aspect: number): number {
  if (aspect >= NARROW_ASPECT) return fov;
  const t = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.sqrt(NARROW_ASPECT / aspect);
  return Math.min(NARROW_MAX_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(t)));
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  /** CPU кадра и GPU всех проходов (GPU — редкая неблокирующая выборка, null без расширения). */
  cpuMs = 0;
  gpuMs: number | null = null;
  private managedFrame = false;
  private frameStart = 0;
  private sampleFrame = 0;
  private timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private query: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  /** Тени из меню (setShadows). Версия растёт при каждой смене: сцены подстраиваются при ближайшей отрисовке, а запечённое (настил набережной) пересчитывается */
  private shadows: ShadowLevel = 'high';
  shadowGen = 0;
  /** Дальность прорисовки из меню (setViewDistance): во сколько раз ближе туман и дальняя плоскость камеры */
  private viewK = 1;
  /** Для какой версии теней сцена уже подготовлена и какие источники света с тенью в ней есть */
  private readonly prepared = new WeakMap<THREE.Scene, { gen: number; lights: ShadowLight[] }>();
  /** Размер карты теней, который хочет сцена (wanted), и тот, что стоит сейчас (applied): «низкие» тени урезают, «высокие» возвращают */
  private readonly shadowSizes = new WeakMap<ShadowLight, { wanted: number; applied: number }>();

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Тени от статики считаем один раз на сцену: карта не двигается, а у игроков — мягкие пятна-тени
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    r.autoClear = false;
    r.info.autoReset = false;
    this.gl = r;
    this.timer = r.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
    canvas.addEventListener('webglcontextlost', () => {
      this.query = null;
      this.pending.length = 0;
      this.gpuMs = null;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.timer = r.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
      // Three's earlier listener has recreated GPU resources and restored the old flags.
      // The static shadow texture was lost even if its previous needsUpdate was false.
      this.refreshShadows();
    });
  }

  /** Сброс ровно один раз на кадр: сцена, кулаки и цветокоррекция суммируются. */
  beginFrame(measureGpu = false): void {
    this.managedFrame = true;
    this.frameStart = performance.now();
    this.gl.info.reset();
    const t = this.timer;
    if (!t) return;
    const g = this.gl.getContext() as WebGL2RenderingContext;
    if (g.isContextLost()) return;
    if (this.pending.length) {
      const disjoint = g.getParameter(t.GPU_DISJOINT_EXT);
      while (this.pending.length && (disjoint || g.getQueryParameter(this.pending[0], g.QUERY_RESULT_AVAILABLE))) {
        const q = this.pending.shift()!;
        if (!disjoint) this.gpuMs = g.getQueryParameter(q, g.QUERY_RESULT) / 1e6;
        else this.gpuMs = null;
        g.deleteQuery(q);
      }
    }
    if (measureGpu && ++this.sampleFrame % 30 === 0 && this.pending.length < 4) {
      this.query = g.createQuery();
      if (this.query) g.beginQuery(t.TIME_ELAPSED_EXT, this.query);
    }
  }

  endFrame(): void {
    if (this.query && this.timer) {
      (this.gl.getContext() as WebGL2RenderingContext).endQuery(this.timer.TIME_ELAPSED_EXT);
      this.pending.push(this.query);
      this.query = null;
    }
    this.cpuMs = performance.now() - this.frameStart;
    this.managedFrame = false;
  }

  get canvas(): HTMLCanvasElement {
    return this.gl.domElement;
  }

  resize(w: number, h: number, ratio: number): void {
    this.gl.setPixelRatio(ratio);
    this.gl.setSize(w, h, false);
  }

  /**
   * Тени (меню → Графика): «выкл» — карты не рисуются и в шейдерах теней нет вовсе; «низкие» — карты не больше 1024
   * (резче и грубее); «высокие» — как задумала сцена. Действует на все сцены, в том числе ждущие в памяти: каждая
   * подстраивается при своей ближайшей отрисовке.
   */
  setShadows(level: ShadowLevel): void {
    if (level === this.shadows) return;
    this.shadows = level;
    this.shadowGen++;
    this.gl.shadowMap.enabled = level !== 'off';
    this.refreshShadows();
  }

  /** Дальность прорисовки: k = 1 — как задумала сцена, меньше — туман подступает ближе, а за ним не рисуется ничего */
  setViewDistance(k: number): void {
    this.viewK = Math.min(1, Math.max(0.1, Number.isFinite(k) ? k : 1));
  }

  /** Для отладки и проверок (window.__opus.info) */
  gfxState(): { shadows: ShadowLevel; shadowsEnabled: boolean; viewK: number } {
    return { shadows: this.shadows, shadowsEnabled: this.gl.shadowMap.enabled, viewK: this.viewK };
  }

  /**
   * Очистить и нарисовать сцену. exposure — из палитры неба этой сцены; кривая тона — ACES, если сцена не просит свою
   * (scene.userData.toneMapping: новый вид набережной, client/render/look.ts).
   */
  render(scene: THREE.Scene, camera: THREE.Camera, exposure = 1): void {
    const r = this.gl;
    // Отдельные превью используют Renderer без оболочки App.
    if (!this.managedFrame) r.info.reset();
    this.syncShadows(scene);
    r.toneMappingExposure = exposure;
    r.toneMapping = (scene.userData.toneMapping as THREE.ToneMapping | undefined) ?? THREE.ACESFilmicToneMapping;
    r.clear();
    this.draw(scene, camera);
  }

  /**
   * Пересчитать тени статики (после смены сцены). Пока тени выключены, карта не рисуется и флаг не сбросился бы:
   * мир с запечёнными тенями пересчитывал бы их каждый кадр — поэтому тогда флаг не ставим.
   */
  refreshShadows(): void {
    if (this.gl.shadowMap.enabled) this.gl.shadowMap.needsUpdate = true;
  }

  /** Перед отрисовкой: сцена подстраивается под тени из меню (она могла простоять в памяти, пока их меняли) */
  private syncShadows(scene: THREE.Scene): void {
    let rec = this.prepared.get(scene);
    if (!rec) {
      rec = { gen: -1, lights: [] };
      this.prepared.set(scene, rec);
    }
    if (rec.gen !== this.shadowGen) {
      const lights: ShadowLight[] = [];
      // тени включили или выключили — коду материалов надо собраться заново (до первой смены менять нечего)
      const rebuild = this.shadowGen > 0;
      scene.traverse((o) => {
        const light = o as ShadowLight;
        if (light.isLight && light.shadow) lights.push(light);
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (rebuild && m) for (const one of Array.isArray(m) ? m : [m]) one.needsUpdate = true;
      });
      rec.gen = this.shadowGen;
      rec.lights = lights;
      if (rebuild) this.refreshShadows();
    }
    if (rec.lights.length) {
      const cap = this.shadows === 'low' ? LOW_SHADOW_SIZE : Infinity;
      for (const l of rec.lights) this.fitShadowSize(l, cap);
    }
  }

  private fitShadowSize(l: ShadowLight, cap: number): void {
    const sh = l.shadow;
    const cur = sh.mapSize.x;
    let rec = this.shadowSizes.get(l);
    if (!rec) {
      rec = { wanted: cur, applied: cur };
      this.shadowSizes.set(l, rec);
    } else if (cur !== rec.applied) {
      // сцена сама поменяла размер (у неё свой «уровень детализации») — это её новое «хочу»
      rec.wanted = cur;
    }
    const size = Math.min(rec.wanted, cap);
    rec.applied = size;
    if (cur === size) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
    this.refreshShadows();
  }

  /**
   * Нарисовать с учётом дальности: на время кадра туман и дальняя плоскость камеры ближе (сцена пишет свои значения тумана
   * каждый кадр — их потом возвращаем как были). Небо рисуется на дальней плоскости само и не пропадает.
   */
  private draw(scene: THREE.Scene, camera: THREE.Camera): void {
    const k = this.viewK;
    const fog = scene.fog as THREE.Fog | null;
    if (k >= 1 || !fog || fog.isFog !== true || fog.far < MIN_FOG_FAR) {
      this.gl.render(scene, camera);
      return;
    }
    const near = fog.near;
    const far = fog.far;
    const cam = camera as THREE.PerspectiveCamera;
    const camFar = cam.far;
    const cut = cam.isPerspectiveCamera === true && camFar > far * k * 1.05;
    fog.near = near * k;
    fog.far = far * k;
    if (cut) {
      cam.far = far * k * 1.05;
      cam.updateProjectionMatrix();
    }
    try {
      this.gl.render(scene, camera);
    } finally {
      fog.near = near;
      fog.far = far;
      if (cut) {
        cam.far = camFar;
        cam.updateProjectionMatrix();
      }
    }
  }
}
