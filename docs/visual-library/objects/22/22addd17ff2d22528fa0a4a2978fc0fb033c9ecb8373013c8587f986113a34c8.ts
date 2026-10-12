// Матрос Колян рыбачит у северного борта «Альбатроса» (shared/barkas.ts — BARKAS_CREW.kolyan): своё место в ряду мест
// рыбалки за тентом рулетки, игрокам оно не нужно. Только картинка — сервер о нём не знает (тело твёрдое — в карте).
// По кругу: заброс → ждёт, поплавок покачивается → пробы → подсечка → вываживание (удилище вверх, рыба бьётся у
// поверхности, брызги) → рыба вылетает из воды с плеском → показывает улов → в ведро → снова заброс. Иногда сходит —
// тогда опускает удочку и качает головой. Вдали (дальше HIDE) не рисуется, дальше LAZY — двигается реже.
import * as THREE from 'three';
import { BARKAS, BARKAS_CREW } from '../../../shared/barkas.ts';
import { WATER_Y } from '../../../shared/constants.ts';
import { RULE, T_COMMON, zoneSpecies } from '../../../shared/fishrules.ts';
import { makeFish3D } from '../fishart.ts';
import { reach } from './crew.ts';
import { at, crewMesh, ease, makePerson, type Person } from './people.ts';
import type { Smoke } from './smoke.ts';

const K = BARKAS_CREW.kolyan;
const HIDE = 75;
const LAZY = 40;
/** Удилище: длина, где комель (в осях туловища), наклон в покое и при подсечке/вываживании (рад над горизонтом) */
const ROD_LEN = 2.7;
const ROD_BUTT = new THREE.Vector3(0.1, 0.22, -0.3);
const PITCH_WAIT = 0.5;
const PITCH_UP = 1.05;
/** Куда падает поплавок: столько метров перед Коляном (за бортом) и вбок */
const CAST_FAR: readonly [number, number] = [6.5, 8.5];
const CAST_SIDE = 1.2;
/** Сколько ждёт поклёвку, с; доля сходов после подсечки */
const WAIT_S: readonly [number, number] = [9, 22];
const MISS_P = 0.2;
const SPRAY = 0xeef6f8;

type Phase = 'cast' | 'wait' | 'nibble' | 'hook' | 'reel' | 'land' | 'show' | 'store' | 'miss';
const DUR: Record<Phase, number> = { cast: 1.5, wait: 0, nibble: 2.6, hook: 0.35, reel: 4, land: 0.8, show: 2.2, store: 1.2, miss: 1.8 };

export class Angler {
  readonly group = new THREE.Group();
  private readonly p: Person;
  private readonly rod = new THREE.Group();
  private readonly bobber: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly linePos = new Float32Array(9 * 3);
  private readonly fishes: THREE.Group[] = [];
  private fish: THREE.Group | null = null;
  private readonly bucket = new THREE.Vector3(K.x - 0.62, 0.3, K.z + 0.22);
  private phase: Phase = 'wait';
  private t = 0;
  private wait = 4;
  private pitch = PITCH_WAIT;
  private yaw = 0;
  private lazy = 0;
  private splashT = 0;
  /** Куда упал поплавок и где рыба при вываживании (мир) */
  private readonly target = new THREE.Vector3();
  private readonly fishAt = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  /** Сколько поймал (для отладки) */
  caught = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'barkas-angler';
    // Колян: оранжевая штормовка поверх тельняшки, вязаная шапка, рыжая борода — рыбак на подхвате у боцмана
    this.p = makePerson({
      skin: 0xd8a585, coat: 0xd9772f, trim: 0x2f3a40, pants: 0x34404a, boots: 0x22302a, hat: 'knit', hatColor: 0x2f5d57,
      hair: 0x9a5a2c, brows: 0x8a4f26, beard: 0xa8622e, build: 1.04,
    });
    this.p.group.position.set(K.x, K.y, K.z);
    this.p.group.rotation.y = K.yaw;
    this.group.add(this.p.group);
    // удилище: бамбуковое, к концу тоньше, с катушкой у комля; ось — вдоль −Z группы
    this.rod.add(crewMesh([
      at(new THREE.CylinderGeometry(0.008, 0.02, ROD_LEN, 6).rotateX(-Math.PI / 2), 0xc8a46a, 0, 0, -ROD_LEN / 2),
      at(new THREE.CylinderGeometry(0.026, 0.026, 0.32, 8).rotateX(-Math.PI / 2), 0x3a2a1e, 0, 0, -0.12),
      at(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 12).rotateZ(Math.PI / 2), 0x6f777a, 0.05, -0.04, -0.3),
    ]));
    this.rod.position.copy(ROD_BUTT);
    this.p.torso.add(this.rod);
    // поплавок: красный верх, белый низ
    this.bobber = crewMesh([
      at(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xe0402e, 0, 0, 0),
      at(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xf4f1e8, 0, 0, 0),
      at(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), 0x2a2a2a, 0, 0.08, 0),
    ]);
    this.group.add(this.bobber);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe9ece6, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.group.add(this.line);
    // ведро для улова — у левой ноги
    this.group.add(crewMesh([
      at(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 14, 1, true), 0x8d9aa0, this.bucket.x, 0.15, this.bucket.z),
      at(new THREE.CircleGeometry(0.16, 14).rotateX(-Math.PI / 2), 0x4f7d86, this.bucket.x, 0.22, this.bucket.z),
      at(new THREE.TorusGeometry(0.17, 0.012, 4, 14).rotateX(Math.PI / 2), 0x6c777c, this.bucket.x, 0.3, this.bucket.z),
    ]));
    // улов: обычные морские рыбы баркаса (три заготовки — новой сетки на каждую поимку не строим)
    const sea = zoneSpecies('barkas').filter((sp) => RULE[sp]?.tier === T_COMMON);
    for (let i = 0; i < 3 && sea.length > 0; i++) {
      const f = makeFish3D(sea[Math.floor(Math.random() * sea.length)], 500 + Math.random() * 900);
      f.visible = false;
      this.group.add(f);
      this.fishes.push(f);
    }
    this.aim();
    scene.add(this.group);
  }

  update(dt: number, cam: THREE.Vector3, smoke: Smoke): void {
    const d = Math.hypot(cam.x - BARKAS.x, cam.z - BARKAS.z);
    this.group.visible = d < HIDE;
    // невидим — замер на месте (никто не видит); дальше LAZY — 8 раз в секунду
    if (!this.group.visible) return;
    this.lazy += dt;
    if (d > LAZY && this.lazy < 0.125) return;
    const step = this.lazy;
    this.lazy = 0;
    this.step(step, smoke);
  }

  private step(dt: number, smoke: Smoke | null): void {
    this.t += dt;
    const p = this.p;
    const t = this.t;
    let pitch = PITCH_WAIT;
    let yaw = 0;
    let bob = WATER_Y + 0.02 + Math.sin(performance.now() * 0.0021) * 0.012;
    let tension = 0.35;
    switch (this.phase) {
      case 'cast': {
        // замах назад и бросок: поплавок летит дугой от кончика к цели
        const k = t / DUR.cast;
        pitch = k < 0.4 ? PITCH_WAIT + (1.35 - PITCH_WAIT) * Math.sin((k / 0.4) * Math.PI / 2) : 1.35 - (1.35 - 0.3) * Math.min(1, (k - 0.4) / 0.25);
        if (k >= 0.55) {
          const u = Math.min(1, (k - 0.55) / 0.45);
          this.tipWorld();
          this.bobber.position.lerpVectors(this.tip, this.target, u);
          this.bobber.position.y = this.tip.y + (WATER_Y - this.tip.y) * u + Math.sin(u * Math.PI) * 1.4;
          tension = 0.9;
        } else this.tipWorld(this.bobber.position);
        if (t >= DUR.cast) {
          this.splash(smoke, this.target, 2, 0.5);
          this.next('wait');
        }
        break;
      }
      case 'wait':
        yaw = Math.sin(t * 0.37) * 0.05;
        if (t >= this.wait) this.next('nibble');
        break;
      case 'nibble': {
        // три пробы: поплавок дёргается, Колян подаётся вперёд
        const k = (t / DUR.nibble) * 3;
        const f = k - Math.floor(k);
        if (f < 0.25) bob -= Math.sin((f / 0.25) * Math.PI) * 0.07;
        p.torso.rotation.x = ease(p.torso.rotation.x, 0.12, dt, 0.3);
        if (t >= DUR.nibble) this.next('hook');
        break;
      }
      case 'hook':
        pitch = PITCH_WAIT + (PITCH_UP - PITCH_WAIT) * Math.min(1, t / DUR.hook);
        bob = WATER_Y - 0.25;
        tension = 1;
        if (t >= DUR.hook) {
          this.splash(smoke, this.target, 3, 0.6);
          this.next(Math.random() < MISS_P ? 'miss' : 'reel');
        }
        break;
      case 'miss':
        // сошла: удочка вниз, леска провисла, поплавок выскочил; качает головой
        pitch = ease(this.pitch, 0.25, dt, 0.4);
        tension = 0;
        p.head.rotation.y = Math.sin(t * 9) * 0.35 * Math.max(0, 1 - t / DUR.miss);
        if (t >= DUR.miss) this.next('cast');
        break;
      case 'reel': {
        // рыба бьётся и подходит к борту; удилище вверх и пляшет, правая рука крутит катушку
        const k = Math.min(1, t / DUR.reel);
        pitch = PITCH_UP + Math.sin(t * 7.3) * 0.06;
        yaw = Math.sin(t * 2.9) * 0.18;
        this.fishAt.lerpVectors(this.target, this.nearWater(), k * k);
        this.fishAt.x += Math.sin(t * 3.7) * 0.6 * (1 - k);
        bob = WATER_Y - 0.12 + Math.sin(t * 11) * 0.05;
        this.splashT -= dt;
        if (this.splashT <= 0) {
          this.splashT = 0.35 + Math.random() * 0.3;
          this.splash(smoke, this.fishAt, 1, 0.45);
        }
        tension = 1;
        if (t >= DUR.reel) {
          this.splash(smoke, this.fishAt, 4, 0.9);
          this.fish = this.fishes.length ? this.fishes[Math.floor(Math.random() * this.fishes.length)] : null;
          this.next('land');
        }
        break;
      }
      case 'land': {
        // рыба вылетает из воды дугой к рукам
        const k = Math.min(1, t / DUR.land);
        pitch = PITCH_UP - 0.2 * k;
        this.handWorld();
        this.tmp.lerpVectors(this.fishAt, this.hand, k);
        this.tmp.y += Math.sin(k * Math.PI) * 1.2;
        this.showFish(this.tmp, -Math.PI / 2 + k * 1.2, true);
        tension = 1;
        if (t >= DUR.land) this.next('show');
        break;
      }
      case 'show':
        // показывает улов: рыба в левой руке, голова к ней
        pitch = 0.2;
        p.head.rotation.x = ease(p.head.rotation.x, 0.25, dt, 0.3);
        this.handWorld();
        this.showFish(this.hand, Math.sin(t * 6) * 0.25, true);
        tension = 0;
        if (t >= DUR.show) this.next('store');
        break;
      case 'store': {
        // в ведро
        const k = Math.min(1, t / DUR.store);
        pitch = 0.2;
        p.torso.rotation.x = ease(p.torso.rotation.x, 0.35 * Math.sin(k * Math.PI), dt, 0.15);
        this.handWorld();
        this.tmp.lerpVectors(this.hand, this.bucket, k);
        this.showFish(this.tmp, Math.PI / 2 * k, k < 0.95);
        tension = 0;
        if (t >= DUR.store) {
          this.caught++;
          this.next('cast');
        }
        break;
      }
    }
    this.pitch = ease(this.pitch, pitch, dt, this.phase === 'hook' || this.phase === 'cast' ? 0.05 : 0.25);
    this.yaw = ease(this.yaw, yaw, dt, 0.3);
    this.rod.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    if (this.phase !== 'nibble' && this.phase !== 'store') p.torso.rotation.x = ease(p.torso.rotation.x, 0, dt, 0.4);
    if (this.phase !== 'show') p.head.rotation.x = ease(p.head.rotation.x, 0.12, dt, 0.4);
    if (this.phase !== 'miss') p.head.rotation.y = ease(p.head.rotation.y, this.yaw * 0.5, dt, 0.4);
    // руки на удилище: правая у катушки (крутит при вываживании), левая — выше по удилищу; в «показать» левая с рыбой
    const crank = this.phase === 'reel' ? 0.05 : 0;
    const a = this.t * 9;
    this.gripAt(0.3, this.tmp);
    reach(p.armR, this.tmp.x + Math.cos(a) * crank, this.tmp.y + Math.sin(a) * crank, this.tmp.z, Math.min(1, dt / 0.08));
    if (this.phase === 'show' || this.phase === 'store') reach(p.armL, -0.28, 0.62, -0.35, Math.min(1, dt / 0.2));
    else {
      this.gripAt(0.75, this.tmp);
      reach(p.armL, this.tmp.x, this.tmp.y, this.tmp.z, Math.min(1, dt / 0.08));
    }
    if (this.phase !== 'cast') this.bobber.position.set(this.target.x, bob, this.target.z);
    this.bobber.visible = this.phase !== 'land' && this.phase !== 'show' && this.phase !== 'store';
    if (this.phase !== 'land' && this.phase !== 'show' && this.phase !== 'store') for (const f of this.fishes) f.visible = false;
    this.drawLine(tension);
  }

  private next(ph: Phase): void {
    this.phase = ph;
    this.t = 0;
    if (ph === 'cast') this.aim();
    if (ph === 'wait') this.wait = WAIT_S[0] + Math.random() * (WAIT_S[1] - WAIT_S[0]);
    if (ph === 'cast' || ph === 'wait') this.fish = null;
  }

  /** Новая точка заброса: за бортом перед Коляном (на север), немного вбок */
  private aim(): void {
    const far = CAST_FAR[0] + Math.random() * (CAST_FAR[1] - CAST_FAR[0]);
    this.target.set(K.x + (Math.random() * 2 - 1) * CAST_SIDE, WATER_Y, K.z - far);
  }

  /** Вода у самого борта под удилищем — сюда рыба подходит перед тем, как её выдернут */
  private nearWater(): THREE.Vector3 {
    return this.tmp.set(K.x + 0.2, WATER_Y, BARKAS.z - BARKAS.half - 0.9);
  }

  /** Кончик удилища в мире (out) */
  private tipWorld(out: THREE.Vector3 = this.tip): THREE.Vector3 {
    this.p.group.updateMatrixWorld(true);
    return this.rod.localToWorld(out.set(0, 0, -ROD_LEN));
  }

  /** Левая кисть в мире (где держит рыбу) */
  private handWorld(): void {
    this.p.group.updateMatrixWorld(true);
    this.p.armL.localToWorld(this.hand.set(0, -0.42, -0.05));
  }

  /** Точка на удилище в d м от комля — в осях туловища (за неё берётся рука) */
  private gripAt(d: number, out: THREE.Vector3): void {
    const cp = Math.cos(this.pitch);
    out.set(ROD_BUTT.x - Math.sin(this.yaw) * cp * d, ROD_BUTT.y + Math.sin(this.pitch) * d, ROD_BUTT.z - Math.cos(this.yaw) * cp * d);
  }

  private showFish(at: THREE.Vector3, roll: number, visible: boolean): void {
    for (const f of this.fishes) f.visible = false;
    const f = this.fish;
    if (!f) return;
    f.visible = visible;
    f.position.copy(at);
    f.rotation.set(0, Math.PI / 2, roll);
  }

  /** Брызги: n клубов водяной пыли и всплеск */
  private splash(smoke: Smoke | null, where: THREE.Vector3, n: number, size: number): void {
    if (!smoke) return;
    for (let i = 0; i < n; i++) {
      smoke.puff(where.x + (Math.random() - 0.5) * 0.4, WATER_Y + 0.1, where.z + (Math.random() - 0.5) * 0.4, SPRAY, 0.55 + Math.random() * 0.3, size * 0.4, size * 1.3, 1.2 + Math.random(), 0.75);
    }
  }

  /** Леска от кончика к поплавку (или к рыбе): провисает, когда не натянута */
  private drawLine(tension: number): void {
    this.tipWorld();
    const end = this.phase === 'reel' || this.phase === 'land' ? (this.phase === 'land' && this.fish ? this.fish.position : this.fishAt) : this.bobber.position;
    const show = this.phase !== 'show' && this.phase !== 'store';
    this.line.visible = show;
    if (!show) return;
    const n = this.linePos.length / 3;
    const len = this.tip.distanceTo(end);
    const sag = (1 - tension) * 0.12 * len + 0.02 * len;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      this.linePos[i * 3] = this.tip.x + (end.x - this.tip.x) * u;
      this.linePos[i * 3 + 1] = this.tip.y + (end.y - this.tip.y) * u - Math.sin(u * Math.PI) * sag;
      this.linePos[i * 3 + 2] = this.tip.z + (end.z - this.tip.z) * u;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  debug(): Record<string, unknown> {
    return { phase: this.phase, caught: this.caught };
  }
}
