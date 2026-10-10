// Фургон Тёти Зины (design-v11 §10.2, §16.3–16.4): по Москве открыт в чётные часы и уезжает в нечётные. Пока сервер
// (farmVan) не прислал своё состояние, фургон живёт по этим часам сам. Подъезжает по аллее с покачиванием, открывает
// витрину (Зина звонит в колокольчик), за 2 минуты до отъезда закрывается, уезжает; на пустой стоянке — грифельный
// «домик». Зина в окошке листает блокнот и кивает с галочкой, когда сдают ящик.
import * as THREE from 'three';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { Actor, type FarmModel, type Part } from '../models.ts';

export type VanState = 'away' | 'open' | 'closed';

const VAN = FARM_LAYOUT.objects.find((o) => o.id === 'van') as unknown as {
  x: number; z: number; awaySign: { x: number; z: number }; drive: number[][];
};
/** Сколько едет по аллее, с */
const DRIVE_S = 9;
/** Зина в окошке: в осях фургона (окошко в −X), пол фургона */
const ZINA = { x: -0.35, y: 0.52, z: 0.25 };
/** За сколько до отъезда витрина закрывается */
const CLOSE_MS = 2 * 60_000;

/** Вид по расписанию (shared/farmvan.ts): открыт, последние 2 минуты — закрыт (сворачивается), иначе уехал */
function vanState(open: boolean, next: number, now: number): VanState {
  return open ? (next - now < CLOSE_MS ? 'closed' : 'open') : 'away';
}

function group(parts: readonly Part[] | undefined): THREE.Group {
  const g = new THREE.Group();
  for (const p of parts ?? []) {
    const m = new THREE.Mesh(p.geo, p.mat);
    m.matrixAutoUpdate = false;
    m.matrix.copy(p.matrix);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export class FarmVan {
  private readonly root = new THREE.Group();
  private readonly open: THREE.Group;
  private readonly closed: THREE.Group;
  private readonly sign: THREE.Group;
  private readonly wheels: THREE.InstancedMesh[] = [];
  private readonly wheelAt: THREE.Vector3[] = [];
  private readonly zina: Actor | null;
  private state: VanState = 'away';
  /** Состояние пришло с сервера — часы больше не смотрим */
  private server: { open: boolean; next: number } | null = null;
  /** Первый кадр: встать сразу, без подъезда */
  private first = true;
  /** Езда: 0…1 по аллее; dir +1 — приезжает, −1 — уезжает; 0 — стоит */
  private k = 1;
  private dir = 0;
  private spin = 0;
  private readonly path: THREE.Vector2[];
  private readonly lens: number[] = [];
  private readonly tmp = new THREE.Matrix4();

  private readonly refresh: () => void;

  /** refresh — пересчитать запечённые тени (фургон встал или уехал) */
  constructor(scene: THREE.Scene, models: Map<string, FarmModel>, refresh: () => void) {
    this.refresh = refresh;
    const m = models.get('van');
    this.open = group(m?.nodes.get('van_open'));
    this.closed = group(m?.nodes.get('van_closed'));
    this.sign = group(m?.nodes.get('van_away_sign'));
    this.sign.position.set(VAN.awaySign.x, 0, VAN.awaySign.z);
    this.sign.rotation.y = Math.PI / 2;
    scene.add(this.sign, this.root);
    this.root.add(this.open, this.closed);
    // колёса — по 4 инстанса на часть
    const attach = (m?.gltf.scene.getObjectByName('van_open')?.userData ?? {}) as Record<string, number[]>;
    for (let i = 0; i < 4; i++) {
      const a = attach[`attach_wheel${i}`] ?? [i % 2 ? 0.8 : -0.8, 0.36, i < 2 ? 1.3 : -1.4];
      this.wheelAt.push(new THREE.Vector3(a[0], a[1], a[2]));
    }
    for (const p of m?.nodes.get('van_wheel') ?? []) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, 4);
      im.userData.part = p.matrix;
      im.castShadow = false;
      im.frustumCulled = false;
      this.wheels.push(im);
      this.root.add(im);
    }
    const z = models.get('npc-zina');
    this.zina = z && z.gltf.animations.length ? new Actor(z, true) : null;
    if (this.zina) {
      this.zina.root.position.set(ZINA.x, ZINA.y, ZINA.z);
      this.zina.root.rotation.y = Math.PI / 2;
      this.zina.loop('idle');
      this.root.add(this.zina.root);
    }
    this.path = VAN.drive.map(([x, z2]) => new THREE.Vector2(x, z2));
    let sum = 0;
    this.lens.push(0);
    for (let i = 1; i < this.path.length; i++) {
      sum += this.path[i].distanceTo(this.path[i - 1]);
      this.lens.push(sum);
    }
    this.apply('away', true);
  }

  /** Состояние с сервера (farmVan): открыт ли и когда уедет; за 2 минуты до отъезда витрина закрыта */
  setServer(open: boolean, next: number): void {
    this.server = { open, next };
  }

  /** Сдали ящик — Зина кивает и ставит галочку */
  accept(): void {
    this.zina?.play('accept');
  }

  get here(): boolean {
    return this.state !== 'away' || this.dir < 0;
  }

  private apply(state: VanState, instant: boolean): void {
    const was = this.state;
    if (state === was && !instant) return;
    this.state = state;
    if (state === 'away') {
      this.dir = instant ? 0 : -1;
      if (instant) this.k = 0;
    } else if (was === 'away') {
      this.dir = instant ? 0 : 1;
      this.k = instant ? 1 : 0;
    }
    const open = state === 'open';
    this.open.visible = open;
    this.closed.visible = !open;
    if (open && !instant) this.zina?.play('ring');
    this.refresh();
  }

  /** Точка аллеи на доле пути k (0 — въезд, 1 — стоянка) и направление */
  private at(k: number): [number, number, number] {
    const total = this.lens[this.lens.length - 1];
    const d = k * total;
    let i = 1;
    while (i < this.lens.length - 1 && this.lens[i] < d) i++;
    const a = this.path[i - 1];
    const b = this.path[i];
    const t = (d - this.lens[i - 1]) / Math.max(1e-6, this.lens[i] - this.lens[i - 1]);
    const x = a.x + (b.x - a.x) * t;
    const z = a.y + (b.y - a.y) * t;
    return [x, z, Math.atan2(-(b.x - a.x), -(b.y - a.y))];
  }

  update(dt: number, now: number, time: number): void {
    const sv = this.server;
    const vt = sv ?? vanTime(now);
    this.apply(vanState(vt.open, vt.next, now), this.first);
    this.first = false;
    let speed = 0;
    if (this.dir !== 0) {
      const k0 = this.k;
      this.k = THREE.MathUtils.clamp(this.k + (this.dir * dt) / DRIVE_S, 0, 1);
      speed = Math.abs(this.k - k0) * this.lens[this.lens.length - 1] / Math.max(dt, 1e-3);
      if (this.k === 0 || this.k === 1) {
        this.dir = 0;
        this.refresh();
      }
    }
    const moving = speed > 0.01;
    const present = this.k > 0;
    this.root.visible = present;
    this.sign.visible = !present;
    if (!present) return;
    // плавный разгон и торможение
    const e = this.k < 1 ? this.k * this.k * (3 - 2 * this.k) : 1;
    const [x, z, yaw] = this.at(e);
    this.root.position.set(x, moving ? Math.abs(Math.sin(time * 9)) * 0.03 : 0, z);
    this.root.rotation.set(0, yaw, moving ? Math.sin(time * 5.3) * 0.025 : 0);
    this.spin -= speed * dt / 0.36;
    for (const im of this.wheels) {
      const part = im.userData.part as THREE.Matrix4;
      for (let i = 0; i < 4; i++) {
        const w = this.wheelAt[i];
        this.tmp.makeRotationX(this.spin).setPosition(w).multiply(part);
        im.setMatrixAt(i, this.tmp);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    this.zina?.update(dt);
  }
}
