// «Ракушка» 1.1, E3: мягкое пятно света под тем, кто сейчас главный (cues.ts spotSlot): загадывающий, отвечающий за пультом,
// рисующий, лидер «Кто из нас?». Без настоящей лампы: прозрачный диск с мягким краем на полу и над ним мягкий луч сверху
// (конус без донышка, только лицевые грани) — тот же вид материала, что у теней желеек (MeshBasic + карта + прозрачность,
// render/avatar.ts), поэтому новой программы шейдера нет; две отрисовки и только пока пятно видно. Пятно на полу из зала
// часто закрыто пультом или креслами — луч видно с любого места. Плавно переезжает к новому главному, гаснет за 0,4 с.
import * as THREE from 'three';
import type { Avatar } from '../../render/avatar.ts';
import { softDot } from '../../render/textures.ts';

/** Диаметр пятна (м), подъём над полом (зазор от мерцания, AGENTS §7), яркость */
const SIZE = 2.3;
const LIFT = 0.03;
const PEAK = 0.55;
/** Луч: высота, радиус сверху и снизу (м), яркость */
const BEAM_H = 3.4;
const BEAM_R0 = 0.16;
const BEAM_R1 = 0.8;
const BEAM_PEAK = 0.65;
const WARM = 'rgba(255,236,186,';
/** Переезд и затухание (1/с) */
const FOLLOW = 5;
const FADE = 2.5;

export class QuizSpot {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly beam: THREE.Mesh;
  private readonly beamMat: THREE.MeshBasicMaterial;
  private slot = 0;
  private k = 0;

  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({
      map: softDot(`${WARM}0.95)`, `${WARM}0)`), color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.mat.name = 'quiz-spot';
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2), this.mat);
    this.mesh.name = 'quiz-spot';
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    // игровое — не гаснет по дальности (plaza3/perf.ts)
    this.mesh.userData.p3keep = true;
    this.mesh.visible = false;
    parent.add(this.mesh);
    // луч: снизу ярче, кверху тает (карта — вертикальный градиент); только лицевые грани — без второй программы
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, `${WARM}0)`);
    grad.addColorStop(0.55, `${WARM}0.22)`);
    grad.addColorStop(1, `${WARM}0.6)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.beamMat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beamMat.name = 'quiz-beam';
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R0, BEAM_R1, BEAM_H, 24, 1, true).translate(0, BEAM_H / 2, 0), this.beamMat);
    this.beam.name = 'quiz-beam';
    this.beam.castShadow = this.beam.receiveShadow = false;
    this.beam.renderOrder = 2;
    this.beam.userData.p3keep = true;
    this.beam.visible = false;
    parent.add(this.beam);
  }

  /** Кто главный (0 — никто: пятно гаснет) */
  set(slot: number): void {
    this.slot = slot;
  }

  update(dt: number, avatarOf: (slot: number) => Avatar | null): void {
    const av = this.slot ? avatarOf(this.slot) : null;
    const on = !!av && av.inWorld;
    if (on) {
      const p = av.root.position, m = this.mesh.position;
      // загорается на месте, дальше — плавно следом
      if (this.k <= 0.01) m.set(p.x, p.y + LIFT, p.z);
      else {
        const f = 1 - Math.exp(-dt * FOLLOW);
        m.x += (p.x - m.x) * f;
        m.y += (p.y + LIFT - m.y) * f;
        m.z += (p.z - m.z) * f;
      }
    }
    this.k = on ? Math.min(1, this.k + dt * FADE) : Math.max(0, this.k - dt * FADE);
    this.mat.opacity = PEAK * this.k;
    this.beamMat.opacity = BEAM_PEAK * this.k;
    this.mesh.visible = this.beam.visible = this.k > 0;
    this.beam.position.copy(this.mesh.position);
  }

  get on(): boolean {
    return this.mesh.visible;
  }
}
