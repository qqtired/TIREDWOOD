// След катеров регаты: пенная дорожка за кормой (точки истории, гаснут за 4,5 с) и брызги — у бортов на ходу,
// веером наружу в заносе, «петушиный хвост» за кормой на ускорении. Всё — два инстанс-меша на все катера.
import * as THREE from 'three';
import { WATER_Y } from '../../shared/constants.ts';

export interface WakeBoat {
  x: number;
  z: number;
  /** Высота над водой (в прыжке следа нет) */
  y: number;
  hx: number;
  hz: number;
  speed: number;
  /** Занос: −1 вправо, 1 влево, 0 — нет; ускорение */
  drift: number;
  boost: boolean;
}

const MAX_BOATS = 6;
const HISTORY = 48;
const DROPS = 26;
const FOAM_LIFE = 4.5;

interface Trace {
  x: Float32Array;
  z: Float32Array;
  time: Float32Array;
  speed: Float32Array;
  head: number;
  count: number;
  last: number;
}

export class BoatWake {
  private readonly traces: Trace[] = Array.from({ length: MAX_BOATS }, () => ({
    x: new Float32Array(HISTORY), z: new Float32Array(HISTORY), time: new Float32Array(HISTORY), speed: new Float32Array(HISTORY), head: 0, count: 0, last: -100,
  }));
  private readonly foam: THREE.InstancedMesh;
  private readonly spray: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly fades = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOATS * HISTORY), 1);
  private readonly sprayFades = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BOATS * DROPS), 1);

  constructor(scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d')!;
    const gradient = g.createRadialGradient(64, 64, 5, 64, 64, 63);
    gradient.addColorStop(0, 'rgba(240,255,252,.88)');
    gradient.addColorStop(0.42, 'rgba(235,255,249,.62)');
    gradient.addColorStop(1, 'rgba(240,255,250,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 28; i++) {
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath();
      g.ellipse((i * 37) % 128, (i * 53) % 128, 4 + (i % 5), 2 + (i % 3), 0.3, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = (map: THREE.Texture | null) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xe7fff8, map, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      m.onBeforeCompile = (s) => {
        s.vertexShader = 'attribute float aFade; varying float vFade;\n' + s.vertexShader;
        s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade=aFade;');
        s.fragmentShader = 'varying float vFade;\n' + s.fragmentShader;
        s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a*=vFade;');
      };
      return m;
    };
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute('aFade', this.fades);
    this.foam = new THREE.InstancedMesh(plane, material(tex), MAX_BOATS * HISTORY);
    this.foam.count = 0;
    this.foam.frustumCulled = false;
    this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.foam);
    const drop = new THREE.SphereGeometry(1, 6, 4);
    drop.setAttribute('aFade', this.sprayFades);
    this.spray = new THREE.InstancedMesh(drop, material(null), MAX_BOATS * DROPS);
    this.spray.count = 0;
    this.spray.frustumCulled = false;
    this.spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.spray);
  }

  /** Катер сменился (другой заезд) — его след с начала. */
  clear(): void {
    for (const tr of this.traces) {
      tr.count = 0;
      tr.last = -100;
    }
    this.foam.count = this.spray.count = 0;
  }

  /** now — время, с; boats[i] — катер i (null — нет). */
  update(now: number, boats: ReadonlyArray<WakeBoat | null>, low: boolean): void {
    let count = 0;
    let drops = 0;
    const d = this.dummy;
    for (let b = 0; b < MAX_BOATS; b++) {
      const boat = boats[b];
      const tr = this.traces[b];
      if (!boat) {
        tr.count = 0;
        continue;
      }
      if (tr.count) {
        const old = (tr.head + HISTORY - 1) % HISTORY;
        if (Math.hypot(boat.x - tr.x[old], boat.z - tr.z[old]) > 18 || now < tr.last) tr.count = 0;
      }
      const wet = boat.y < 0.05;
      if (wet && boat.speed > 2 && now - tr.last >= 0.095) {
        tr.x[tr.head] = boat.x - boat.hx * 2;
        tr.z[tr.head] = boat.z - boat.hz * 2;
        tr.time[tr.head] = now;
        tr.speed[tr.head] = boat.speed;
        tr.head = (tr.head + 1) % HISTORY;
        tr.count = Math.min(HISTORY, tr.count + 1);
        tr.last = now;
      }
      for (let j = 0; j < tr.count; j += low ? 2 : 1) {
        const i = (tr.head + HISTORY - 1 - j) % HISTORY;
        const age = now - tr.time[i];
        if (age > FOAM_LIFE) continue;
        d.position.set(tr.x[i], WATER_Y + 0.05, tr.z[i]);
        d.rotation.set(-Math.PI / 2, 0, Math.atan2(boat.hx, boat.hz));
        d.scale.set(1.1 + age * 0.65, Math.max(0.6, tr.speed[i] * 0.13), 1);
        d.updateMatrix();
        this.foam.setMatrixAt(count, d.matrix);
        this.fades.setX(count++, Math.pow(1 - age / FOAM_LIFE, 1.5) * Math.min(1, tr.speed[i] / 13));
      }
      if (!wet || boat.speed < 4) continue;
      const v = Math.min(1, boat.speed / 20);
      // у бортов: две струи от скулы назад
      const side = low ? 6 : 14;
      for (let i = 0; i < side; i++) {
        const s = i % 2 ? 1 : -1;
        const p = (now * 2.7 + i * 0.173) % 1;
        // в заносе внешний борт (против поворота) даёт веер в 2 раза шире и выше
        const fan = boat.drift !== 0 && s === -boat.drift ? 2 : 1;
        const lateral = 0.88 + p * (0.9 + v) * fan;
        const back = 1.25 - p * (1.1 + v * 1.8);
        const x = boat.x + boat.hx * back - boat.hz * s * lateral;
        const z = boat.z + boat.hz * back + boat.hx * s * lateral;
        d.position.set(x, WATER_Y + 0.07 + Math.sin(p * Math.PI) * (0.2 + v * 0.43) * fan, z);
        d.rotation.set(p, 0, p * s);
        const r = (0.025 + v * 0.028) * (fan > 1 ? 1.5 : 1);
        d.scale.set(r, r * 1.8, r);
        d.updateMatrix();
        this.spray.setMatrixAt(drops, d.matrix);
        this.sprayFades.setX(drops++, (1 - p) * v);
      }
      // ускорение: струя от винта вверх и назад
      if (boat.boost && !low) {
        for (let i = 0; i < 10; i++) {
          const p = (now * 3.4 + i * 0.1) % 1;
          const back = 2.3 + p * 4.2;
          const x = boat.x - boat.hx * back + Math.sin(i * 2.3) * 0.15;
          const z = boat.z - boat.hz * back + Math.cos(i * 1.7) * 0.15;
          d.position.set(x, WATER_Y + 0.15 + Math.sin(p * Math.PI) * 1.3, z);
          d.rotation.set(0, 0, 0);
          const r = 0.06 + p * 0.07;
          d.scale.set(r, r, r);
          d.updateMatrix();
          this.spray.setMatrixAt(drops, d.matrix);
          this.sprayFades.setX(drops++, (1 - p) * 0.9);
        }
      }
    }
    this.foam.count = count;
    this.spray.count = drops;
    this.foam.instanceMatrix.needsUpdate = this.spray.instanceMatrix.needsUpdate = true;
    this.fades.needsUpdate = this.sprayFades.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    for (const m of [this.foam, this.spray]) {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
