// Независимое превью: настоящий игровой аватар, без комнат, профиля и сетевых записей.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { FittingItem, FittingProject, FittingTransform } from '../../shared/fitting-room.ts';
import { ACT_DANCE, ACT_NONE, ACT_WAVE } from '../../shared/lobby.ts';
import { DEFAULT_OUTFIT, slotKey, type Slot } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import { Diorama } from '../lab/kit3d.ts';
import { dressFloat, dressRig } from '../lobby/fishgear.ts';
import { Avatar, tickAvatarShared, type AvatarPose } from '../render/avatar.ts';
import type { Wear } from '../render/outfit3d.ts';
import { petGeometry, wearFor } from '../render/outfitfish.ts';
import { Renderer } from '../render/renderer.ts';
import { createFittingWear, fittingWearObject, transformFittingWear } from './models.ts';
import { parsePreviewGlb } from './glb-preview.ts';

type Motion = 'idle' | 'walk' | 'wave' | 'dance';
interface ImportedModel { root: THREE.Group; transform?: FittingTransform }
interface CachedWear { signature: string; wear: Wear }

/** Dispose only owned trees. Never call this on an Avatar or a game-cache model. */
function disposeTree(root: THREE.Object3D, disposeTextures = true): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) geometries.add(mesh.geometry);
    const material = mesh.material;
    if (material) for (const m of Array.isArray(material) ? material : [material]) {
      materials.add(m);
      // Sprite maps (e.g. Diorama's glow) may be shared by the rest of the game.
      if (disposeTextures && !(o as THREE.Sprite).isSprite) for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
  for (const m of materials) m.dispose();
}

const EMPTY: Wear = { geo: null, metal: null, y: 0 };
const GROUND = { groundBelow: () => 0 };

export class FittingScene {
  private readonly renderer: Renderer;
  private readonly pier = new Diorama({ radius: 3, rail: false, cam: [0, 2, -4.8], look: [0, 1.05, 0], fov: 42 });
  private readonly studio = new THREE.Scene();
  private readonly avatar = new Avatar(9100, { voice: false });
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly events = new AbortController();
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly fishing = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly bobber = new THREE.Group();
  private readonly fishingOwned = new THREE.Group();
  private readonly fishingGeometries = new Set<THREE.BufferGeometry>();
  private readonly fishingMaterials = new Set<THREE.Material>();
  private readonly extras = new THREE.Group();
  private readonly imported = new Map<string, ImportedModel>();
  private readonly wears = new Map<string, CachedWear>();
  private readonly versions = new Map<string, number>();
  private readonly pose: AvatarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: E_ALIVE | E_GROUNDED };
  private project: FittingProject = { version: 1, items: [], sets: [], outfit: { ...DEFAULT_OUTFIT }, equipped: {} };
  private scene: THREE.Scene;
  private motion: Motion = 'idle';
  private time = 0;
  private frameId = 0;
  private previous = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.scene = this.studio;
    this.studio.background = new THREE.Color(0xe9e4d9);
    this.studio.add(new THREE.HemisphereLight(0xfff9ed, 0xa0ad9d, 2.2));
    const sun = new THREE.DirectionalLight(0xffe6c5, 3);
    sun.position.set(-3, 6, -5); this.studio.add(sun);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.10, .11, 48), new THREE.MeshStandardMaterial({ color: 0xd1bfa0, roughness: .9 }));
    pedestal.position.y = -.055; this.studio.add(pedestal);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0xe9e4d9, roughness: .95 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.12; this.studio.add(floor);
    this.avatar.setInfo('TIREDWOOD', null, false, 1);
    this.avatar.addTo(this.scene);
    this.avatar.held.add(this.extras);
    this.buildFishing(); this.scene.add(this.fishing);
    this.controls = new OrbitControls(this.pier.camera, canvas);
    this.controls.target.set(0, 1.08, 0);
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minDistance = 2.6; this.controls.maxDistance = 8.5;
    this.controls.minPolarAngle = .25; this.controls.maxPolarAngle = Math.PI * .55;
    this.controls.autoRotateSpeed = .75;
    this.controls.addEventListener('change', () => this.draw());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else { this.previous = 0; this.start(); this.draw(); }
    }, { signal: this.events.signal });
    this.reduced.addEventListener('change', () => {
      this.controls.autoRotate = this.autoRotateWanted && !this.reduced.matches;
      this.stop(); this.previous = 0; this.start(); this.draw();
    }, { signal: this.events.signal });
    this.resize(); this.setProject(this.project); this.start();
  }

  setProject(project: FittingProject): void {
    this.project = project;
    const outfit = { ...project.outfit };
    for (const slot of ['h', 'a', 'e', 'p', 's', 'r', 'b', 'w', 'n'] as const) {
      const item = this.equipped(slot);
      if (item?.source === 'game' && item.gameKey) outfit[slot] = item.gameKey;
      else if (item && (item.model || this.imported.has(item.id))) {
        if (slot === 'e') outfit.e = 'normal';
        else if (slot === 'h' || slot === 'a' || slot === 's') outfit[slot] = 'none';
      }
    }
    this.avatar.setOutfit(outfit);
    // Same outfit may skip setOutfit; explicitly restore any previous laboratory override.
    for (const slot of ['h', 'a', 'e'] as const) this.avatar.setPreviewWear(slot, wearFor(slot, outfit[slot]));
    this.extras.clear();
    for (const slot of ['h', 'a', 'e', 's', 'r', 'b', 'p', 'w', 'n'] as const) {
      const item = this.equipped(slot);
      if (!item) continue;
      const imported = item.asset ? this.imported.get(item.id) : undefined;
      if (imported) {
        if (slot === 'h' || slot === 'a' || slot === 'e') this.avatar.setPreviewWear(slot, EMPTY);
        this.mountImported(imported, item); continue;
      }
      const wear = this.labWear(item);
      if (!wear) continue;
      if (slot === 'h' || slot === 'a' || slot === 'e') this.avatar.setPreviewWear(slot, wear);
      else if (slot === 's') {
        // Own matrices/materials; borrowed Wear geometry is disposed by the cache only.
        const node = new THREE.Group(); node.position.y = wear.y;
        if (wear.geo) node.add(new THREE.Mesh(wear.geo, this.extraMaterial));
        this.extras.add(node);
      }
    }
    dressRig(this.rig, slotKey(outfit, 'r')); dressFloat(this.bobber, slotKey(outfit, 'b'));
    this.rig.visible = !this.equipped('r')?.asset;
    this.bobber.visible = !this.equipped('b')?.asset;
    this.placeFishing(this.rig, [1.30, .54, .12], 1.14, 1, this.equipped('r')?.transform);
    this.placeFishing(this.bobber, [1.75, .65, -.30], 0, 3, this.equipped('b')?.transform);
    this.fishing.visible = !!(project.equipped.r || project.equipped.b || outfit.r || outfit.b);
    this.draw();
  }

  private readonly extraMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .65, side: THREE.DoubleSide });
  private autoRotateWanted = false;

  setEnvironment(env: 'studio' | 'pier'): void {
    this.scene = env === 'pier' ? this.pier.scene : this.studio;
    this.avatar.addTo(this.scene); this.scene.add(this.fishing); this.draw();
  }

  setMotion(motion: Motion): void { this.motion = motion; this.draw(); }

  setView(view: 'front' | 'back' | 'side'): void {
    const camera = this.pier.camera, distance = Math.max(3.8, camera.position.distanceTo(this.controls.target));
    const direction = view === 'front' ? [0, .22, -1] : view === 'back' ? [0, .22, 1] : [1, .22, 0];
    camera.position.copy(new THREE.Vector3(...direction).normalize().multiplyScalar(distance).add(this.controls.target));
    camera.lookAt(this.controls.target); this.controls.update(); this.draw();
  }

  setAutoRotate(on: boolean): void {
    this.autoRotateWanted = on; this.controls.autoRotate = on && !this.reduced.matches; this.draw();
  }

  resetCamera(): void {
    this.controls.target.set(0, 1.08, 0); this.pier.camera.position.set(0, 2.05, -4.8);
    this.pier.camera.lookAt(this.controls.target); this.controls.update(); this.draw();
  }

  async setImportedModel(itemId: string, buffer: ArrayBuffer, transform?: FittingTransform): Promise<void> {
    const item = this.project.items.find(i => i.id === itemId);
    if (!item) throw new Error('Вещь для модели не найдена.');
    const version = (this.versions.get(itemId) ?? 0) + 1; this.versions.set(itemId, version);
    const model = await parsePreviewGlb(buffer);
    if (this.disposed || this.versions.get(itemId) !== version) { disposeTree(model); return; }
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const largest = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(largest) || largest <= 0) { disposeTree(model); throw new Error('В модели нет видимой геометрии.'); }
    const target = item.slot === 'h' ? .9 : item.slot === 'e' ? .52 : item.slot === 's' ? .34 : .65;
    const normalized = new THREE.Group(); normalized.scale.setScalar(target / largest);
    const centered = new THREE.Group(); centered.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    centered.add(model); normalized.add(centered);
    const root = new THREE.Group(); root.add(normalized);
    const old = this.imported.get(itemId);
    if (old) { old.root.removeFromParent(); disposeTree(old.root); }
    this.imported.set(itemId, { root, transform }); this.setProject(this.project);
  }

  async exportItemModel(itemId: string): Promise<ArrayBuffer> {
    const item = this.project.items.find(i => i.id === itemId);
    if (!item) throw new Error('Вещь не найдена.');
    const imported = item.asset ? this.imported.get(itemId) : undefined;
    let object: THREE.Object3D;
    let owned = true;
    if (imported) {
      this.mountImported(imported, item, false); object = imported.root.clone(true); owned = false;
    } else {
      let wear = this.labWear(item);
      if (!wear && item.source === 'game' && item.gameKey) {
        if (item.slot === 'h' || item.slot === 'a' || item.slot === 'e') wear = wearFor(item.slot, item.gameKey);
        else if (item.slot === 's') wear = { geo: petGeometry(item.gameKey), metal: null, y: 1.2 };
        else if (item.slot === 'r' || item.slot === 'b') {
          const target = item.slot === 'r' ? this.rig : this.bobber;
          if (item.slot === 'r') dressRig(target, item.gameKey); else dressFloat(this.bobber, item.gameKey);
          object = target.clone(true); owned = false;
          try { return await this.exportGlb(object); } finally { this.setProject(this.project); }
        }
      }
      if (!wear || (!wear.geo && !wear.metal)) throw new Error('У этой вещи нет отдельной 3D-модели для экспорта.');
      object = fittingWearObject(wear, item.slot);
    }
    object.name = item.name;
    try { return await this.exportGlb(object); } finally { if (owned) disposeTree(object); }
  }

  private async exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
    const result = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('Не удалось собрать GLB.');
    return result;
  }

  screenshot(): string { this.draw(); return this.renderer.canvas.toDataURL('image/png'); }

  clearImportedModels(): void {
    for (const [id, model] of this.imported) {
      this.versions.set(id, (this.versions.get(id) ?? 0) + 1);
      model.root.removeFromParent();
      disposeTree(model.root);
    }
    this.imported.clear();
  }

  getDebugInfo(): { calls: number; triangles: number } {
    return { calls: this.renderer.gl.info.render.calls, triangles: this.renderer.gl.info.render.triangles };
  }

  private equipped(slot: Slot): FittingItem | undefined {
    const id = this.project.equipped[slot]; return this.project.items.find(i => i.id === id && i.slot === slot);
  }

  private labWear(item: FittingItem): Wear | null {
    const gameWear = item.source === 'game' && item.gameKey && (item.slot === 'h' || item.slot === 'a' || item.slot === 'e')
      ? wearFor(item.slot, item.gameKey) : null;
    if (!item.model && !gameWear) return null;
    const signature = JSON.stringify([item.slot, item.gameKey, item.model, item.color, item.transform]);
    const cached = this.wears.get(item.id);
    if (cached?.signature === signature) return cached.wear;
    const base = item.model ? createFittingWear(item.model, item.color) : gameWear;
    if (!base) return null;
    const wear = transformFittingWear(base, item.transform);
    if (item.model) { base.geo?.dispose(); base.metal?.dispose(); }
    cached?.wear.geo?.dispose(); cached?.wear.metal?.dispose();
    this.wears.set(item.id, { signature, wear }); return wear;
  }

  private mountImported(model: ImportedModel, item: FittingItem, attach = true): void {
    const transform = item.transform ?? model.transform;
    const anchor: [number, number, number] = item.slot === 'h' ? [0, 1.28, 0] : item.slot === 'e' ? [0, 1.05, -.54]
      : item.slot === 's' ? [-.56, 1.18, 0] : item.slot === 'a' ? [.60, .65, 0] : [1.5, .55, 0];
    model.root.position.set(...anchor).add(new THREE.Vector3(...(transform?.position ?? [0, 0, 0])));
    model.root.rotation.set(...(transform?.rotation ?? [0, 0, 0])); model.root.scale.setScalar(transform?.scale ?? 1);
    if (attach) this.extras.add(model.root);
  }

  private placeFishing(node: THREE.Group, anchor: [number, number, number], tilt: number, scale: number, transform?: FittingTransform): void {
    node.position.set(...anchor).add(new THREE.Vector3(...(transform?.position ?? [0, 0, 0])));
    node.rotation.set(tilt + (transform?.rotation[0] ?? 0), transform?.rotation[1] ?? 0, transform?.rotation[2] ?? 0);
    node.scale.setScalar(scale * (transform?.scale ?? 1));
  }

  private buildFishing(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0xa8825f, roughness: .8 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x63736c, metalness: .45, roughness: .4 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd66b4f, roughness: .45 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf4e8cf, roughness: .55 });
    const part = (g: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh => { const m = new THREE.Mesh(g, material); m.name = name; return m; };
    this.rig.add(part(new THREE.CylinderGeometry(.015, .022, 1.65, 10).rotateX(Math.PI / 2).translate(0, 0, -.825), metal, 'blank'));
    this.rig.add(part(new THREE.CylinderGeometry(.012, .015, .14, 10).rotateX(Math.PI / 2).translate(0, 0, -1.72), red, 'tip'));
    this.rig.add(part(new THREE.CylinderGeometry(.034, .030, .30, 10).rotateX(Math.PI / 2).translate(0, 0, .06), wood, 'handle'));
    this.rig.add(part(new THREE.CylinderGeometry(.067, .067, .07, 12).rotateZ(Math.PI / 2).translate(0, -.10, 0), metal, 'reel'));
    this.rig.add(part(new THREE.SphereGeometry(.025, 10, 8).translate(-.095, -.10, 0), wood, 'knob'));
    this.rig.position.set(1.30, .54, .12); this.rig.rotation.x = 1.14;
    this.bobber.add(part(new THREE.SphereGeometry(.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 'float'));
    this.bobber.add(part(new THREE.SphereGeometry(.045, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), cream, 'float'));
    this.bobber.add(part(new THREE.CylinderGeometry(.007, .007, .12, 6).translate(0, .075, 0), red, 'float'));
    this.bobber.position.set(1.75, .65, -.30); this.bobber.scale.setScalar(3);
    this.fishingOwned.add(part(new THREE.CylinderGeometry(.22, .26, .055, 24), wood, 'stand'));
    this.fishingOwned.children[0].position.set(1.30, .0275, .12);
    this.fishing.add(this.rig, this.bobber, this.fishingOwned);
    this.fishing.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      this.fishingGeometries.add(m.geometry);
      for (const material of Array.isArray(m.material) ? m.material : [m.material]) this.fishingMaterials.add(material);
    });
  }

  private resize(): void {
    if (this.disposed) return;
    const canvas = this.renderer.canvas, w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    this.renderer.resize(w, h, Math.min(2, devicePixelRatio || 1));
    this.pier.camera.aspect = w / h; this.pier.camera.updateProjectionMatrix(); this.draw();
  }

  private draw(dt = 0): void {
    if (this.disposed) return;
    const effective = this.reduced.matches ? 'idle' : this.motion;
    this.avatar.setAction(effective === 'wave' ? ACT_WAVE : effective === 'dance' ? ACT_DANCE : ACT_NONE, 0);
    this.pose.z = effective === 'walk' ? Math.sin(this.time * 2) * .8 : 0;
    this.avatar.update(this.pose, this.reduced.matches ? 0 : dt, this.time, GROUND, this.pier.camera.position, false);
    // Walking speed drives the game's bob/lean while the fitting position remains centered.
    this.avatar.root.position.z = 0; this.avatar.shadow.position.z = 0;
    tickAvatarShared(this.time, this.renderer.canvas.clientHeight);
    if (this.scene === this.pier.scene) this.pier.update(dt, this.time);
    this.renderer.render(this.scene, this.pier.camera);
  }

  private readonly frame = (now: number): void => {
    this.frameId = 0;
    if (this.disposed || document.hidden || this.reduced.matches) return;
    const dt = this.previous ? Math.min(1 / 30, (now - this.previous) / 1000) : 0;
    this.previous = now; this.time += dt;
    this.controls.update(dt); this.draw(dt); this.start();
  };

  private start(): void { if (!this.disposed && !document.hidden && !this.reduced.matches && !this.frameId) this.frameId = requestAnimationFrame(this.frame); }
  private stop(): void { if (this.frameId) cancelAnimationFrame(this.frameId); this.frameId = 0; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.stop(); this.events.abort(); this.resizeObserver.disconnect(); this.controls.dispose();
    this.fishing.removeFromParent(); this.extras.clear();
    this.avatar.dispose(this.scene);
    for (const model of this.imported.values()) disposeTree(model.root);
    for (const cached of this.wears.values()) { cached.wear.geo?.dispose(); cached.wear.metal?.dispose(); }
    for (const g of this.fishingGeometries) g.dispose();
    for (const m of this.fishingMaterials) m.dispose();
    // Diorama's sparks/coins borrow glowTexture/metalEnvTexture from the game.
    this.extraMaterial.dispose(); disposeTree(this.studio, false); disposeTree(this.pier.scene, false);
    this.studio.clear(); this.pier.scene.clear(); this.renderer.gl.dispose(); this.renderer.gl.forceContextLoss();
  }
}
