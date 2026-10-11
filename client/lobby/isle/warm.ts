// Две фазы существующего островного prefetch: из бухты нужны силуэт/маяк, full+Игнат — по пути к520м LOD.
import * as THREE from 'three';

const FULL_WARM_R = 850;

export class IslandWarmup {
  fullReady = false;
  private farWarm: Promise<void> | null = null;
  private fullWarm: Promise<void> | null = null;
  private readonly gl: THREE.WebGLRenderer;
  private readonly camera: THREE.Camera;
  private readonly scene: THREE.Scene;
  private readonly full: THREE.Object3D;
  private readonly farObjects: readonly THREE.Object3D[];

  constructor(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, full: THREE.Object3D, farObjects: readonly THREE.Object3D[]) {
    this.gl = gl; this.camera = camera; this.scene = scene; this.full = full; this.farObjects = farObjects;
  }

  far(): Promise<void> {
    return this.farWarm ??= this.compile(this.farObjects);
  }

  approach(distance: number): Promise<void> | null {
    if (!this.fullWarm && distance <= FULL_WARM_R) {
      this.fullWarm = this.compile([this.full]).then(() => { this.fullReady = true; });
    }
    return this.fullWarm;
  }

  private async compile(roots: readonly THREE.Object3D[]): Promise<void> {
    // WebGLRenderer.compile traverses даже invisible объекты. Выбираем фазу через обход,
    // как Plaza3Perf.warm, без reparent/visible=true и кадра полной детализации из бухты.
    const objects = {
      traverse: (fn: (o: THREE.Object3D) => void) => { for (const root of roots) root.traverse(fn); },
      traverseVisible: () => {}, // своих настоящих ламп у острова нет; свет берётся из targetScene
    };
    try {
      await this.gl.compileAsync(objects as unknown as THREE.Object3D, this.camera, this.scene);
    } catch {
      // Прежний fallback без parallel compile: Three соберёт отсутствующее при первом показе.
    }
  }
}
