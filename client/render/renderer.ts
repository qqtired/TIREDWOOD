// Рендерер один на всё приложение: набережная и пейнтбол рисуют через него по очереди, у каждой сцены своя камера.
import * as THREE from 'three';

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
   * Очистить и нарисовать сцену. exposure — из палитры неба этой сцены; кривая тона — ACES, если сцена не просит свою
   * (scene.userData.toneMapping: новый вид набережной, client/render/look.ts).
   */
  render(scene: THREE.Scene, camera: THREE.Camera, exposure = 1): void {
    const r = this.gl;
    // Отдельные превью используют Renderer без оболочки App.
    if (!this.managedFrame) r.info.reset();
    r.toneMappingExposure = exposure;
    r.toneMapping = (scene.userData.toneMapping as THREE.ToneMapping | undefined) ?? THREE.ACESFilmicToneMapping;
    r.clear();
    r.render(scene, camera);
  }

  /** Пересчитать тени статики (после смены сцены). */
  refreshShadows(): void {
    this.gl.shadowMap.needsUpdate = true;
  }
}
