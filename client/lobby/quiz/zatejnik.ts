// «Ракушка»: Затейник — житель по пайплайну plaza3 (client/lobby/plaza3/npc.ts: одна сетка, жёсткие кости, buildCrowd).
// Стоит в zatejnik из shared/quiz/venue-data.json. Клипы — в самом GLB (concepts_blender/quiz/zatejnik, 9 клипов): невидимая
// копия сцены GLB крутит THREE.AnimationMixer, и каждый кадр позы её узлов-частей переписываются в кости (README модели,
// «Как встроить»). Реплика из снимка zat — облачко 6 с и клип один раз, потом idle (docs/quiz/tech.md §10).
// Материал — стандартный со скинингом и цветом вершин, как у зверьков набережной (critter-kit.ts): своей программы нет.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BUBBLE_MS } from '../../../shared/lobby.ts';
import type { QzZatClip } from '../../../shared/quiz/types.ts';
import { QUIZ_VENUE } from '../../../shared/quiz/venue.ts';
import { buildCrowd, npcParts } from '../plaza3/npc.ts';
import type { NpcDef } from '../plaza3/npcdata.ts';
import { drawSpeech } from '../../render/avatar.ts';
import { quizAsset, VENUE_LIFT } from './venue3d.ts';

/** Дальше этого Затейник не рисуется и не анимируется (как жители на «Близко», plaza3/npc.ts NPC_FAR) */
const FAR = 60;
/** Облачко дальше не видно (как у желеек) */
const SPEECH_FAR = 35;
const SPEECH_W = 0.265;
const SPEECH_H = 0.1035;
/** Переход между клипами, с */
const FADE = 0.25;

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

export class Zatejnik {
  /** Куда встаёт: группа площадки (флаг выключен — прячется вместе с ней) */
  private readonly parent: THREE.Object3D;
  private mesh: THREE.SkinnedMesh | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private model: THREE.Object3D | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  /** Кость части → её узел в невидимой копии GLB и узел-родитель (ближайшая часть выше или корень модели) */
  private links: Array<{ bone: THREE.Bone; node: THREE.Object3D; parent: THREE.Object3D }> = [];
  private bubble: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture } | null = null;
  private bubbleUntil = 0;
  private readonly spot = QUIZ_VENUE.zatejnik;
  readonly stats = { ready: false, tris: 0, clips: [] as string[], failed: false };

  constructor(parent: THREE.Object3D, material: THREE.Material) {
    this.parent = parent;
    void this.load(material);
  }

  private async load(material: THREE.Material): Promise<void> {
    let gltf;
    try {
      gltf = await new GLTFLoader().loadAsync(quizAsset('quiz_zatejnik.glb'));
    } catch (e) {
      console.warn('[ракушка] Затейник', e);
      this.stats.failed = true;
      return;
    }
    const s = this.spot;
    const def = { id: 'zatejnik', x: s.x, y: s.y + VENUE_LIFT, z: s.z, yaw: s.yaw } as unknown as NpcDef;
    // склейка — из той же модели, что крутит миксер: позы покоя совпадают
    const model = gltf.scene;
    const crowd = buildCrowd([{ def, model }]);
    const rig = crowd.rigs[0];
    const mesh = new THREE.SkinnedMesh(crowd.geometry, material);
    mesh.name = 'quiz-zatejnik';
    mesh.frustumCulled = false;
    // как у жителей plaza3 (npc.ts): без тени — тень скининга была бы новой программой глубины
    mesh.castShadow = false;
    mesh.raycast = () => {};
    mesh.add(rig.root);
    mesh.bind(new THREE.Skeleton(crowd.bones));
    const parts = npcParts(model);
    for (const [name, bone] of rig.bones) {
      const node = parts.get(name);
      if (!node) continue;
      let up = node.parent;
      while (up && up !== model && typeof up.userData.animation_part !== 'string') up = up.parent;
      this.links.push({ bone, node, parent: up ?? model });
    }
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      if (clip.name !== 'idle' && clip.name !== 'walk' && clip.name !== 'talk') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(clip.name, a);
    }
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.current) this.play('idle');
    });
    this.stats.clips = [...this.actions.keys()];
    this.stats.tris = crowd.triangles;
    this.mesh = mesh;
    this.parent.add(mesh);
    this.play('idle');
    this.stats.ready = true;
  }

  /** Клип один раз (talk — 2 круга), потом idle */
  play(clip: QzZatClip | 'idle'): void {
    const a = this.actions.get(clip) ?? this.actions.get('idle');
    if (!a || a === this.current) {
      a?.reset().play();
      return;
    }
    a.reset();
    if (clip === 'talk') {
      a.setLoop(THREE.LoopRepeat, 2);
      a.clampWhenFinished = true;
    }
    a.play();
    if (this.current) a.crossFadeFrom(this.current, FADE, false);
    this.current = a;
  }

  /** Реплика: облачко над головой на 6 с и клип */
  say(text: string, clip: QzZatClip): void {
    this.play(clip);
    const b = (this.bubble ??= this.makeBubble());
    if (!b) return;
    drawSpeech(b.canvas, text, 'new', 'Затейник');
    b.tex.needsUpdate = true;
    this.bubbleUntil = performance.now() + BUBBLE_MS;
  }

  private makeBubble(): Zatejnik['bubble'] {
    if (!this.mesh) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 200;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthWrite: false, transparent: true, fog: false }));
    sprite.scale.set(SPEECH_W, SPEECH_H, 1);
    sprite.center.set(0.5, 0);
    const s = this.spot;
    sprite.position.set(s.x, s.y + VENUE_LIFT + 1.95, s.z);
    sprite.renderOrder = 6;
    sprite.visible = false;
    sprite.userData.p3keep = true;
    this.parent.add(sprite);
    return { sprite, canvas, tex };
  }

  update(dt: number, camPos: THREE.Vector3): void {
    const mesh = this.mesh;
    if (!mesh || !this.mixer || !this.model) return;
    const d = Math.hypot(camPos.x - this.spot.x, camPos.z - this.spot.z);
    mesh.visible = d < FAR;
    const b = this.bubble;
    if (b) {
      const left = this.bubbleUntil - performance.now();
      b.sprite.visible = left > 0 && d < SPEECH_FAR;
      if (b.sprite.visible) b.sprite.material.opacity = Math.min(1, left / 600, (SPEECH_FAR - d) / 5);
    }
    if (!mesh.visible) return;
    this.mixer.update(dt);
    this.model.updateMatrixWorld(true);
    for (const l of this.links) {
      _m.multiplyMatrices(_inv.copy(l.parent.matrixWorld).invert(), l.node.matrixWorld);
      _m.decompose(l.bone.position, l.bone.quaternion, l.bone.scale);
    }
  }

  debug(): Record<string, unknown> {
    return { ...this.stats, clip: this.current?.getClip().name ?? null };
  }
}
