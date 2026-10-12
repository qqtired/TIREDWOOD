// Задний двор участков (design-v11 §16.6): загон с трюфельным свином, компост с парком из щелей, улей с пчёлами — по
// публичному виду участка (FarmPlotView.pig / compost / bees). Открыто по уровню, но ещё не построено — колышек «место».
// Загоны, ящики, ульи, колышки и пчёлы — инстансами (по отрисовке на часть). Свины со скелетом — только у ближних
// участков (не больше PIG_MAX), дальние стоят пустые загоны.
import * as THREE from 'three';
import type { FarmPlotView } from '../../../shared/farmnet.ts';
import { FARM_LAYOUT } from '../../../shared/farmlayout.ts';
import { Actor, PartInstances, type FarmModel } from '../models.ts';
import type { FarmFx } from './fx.ts';

const L = FARM_LAYOUT;
const PL = L.plotLocal;
const PIG_MAX = 6;
const PIG_R = 40;
const BEES = 6;
const BEE_R = 35;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _y = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler();

function plotMatrix(plot: number, lx: number, lz: number, yaw = 0, y = 0): THREE.Matrix4 {
  const p = L.plots[plot];
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  _q.setFromAxisAngle(_y, p.yaw + yaw);
  _s.set(1, 1, 1);
  return _m.compose(_p.set(p.x + lx * c + lz * s, y, p.z - lx * s + lz * c), _q, _s);
}

interface Pig {
  actor: Actor;
  plot: number;
  /** Где в загоне (оси участка) и куда идёт */
  x: number;
  z: number;
  tx: number;
  tz: number;
  yaw: number;
  next: number;
}

export class FarmYard {
  private readonly fx: FarmFx;
  private readonly pen: PartInstances;
  private readonly compost: PartInstances;
  private readonly hive: PartInstances;
  private readonly peg: PartInstances;
  private readonly bee: PartInstances;
  private readonly wings: PartInstances;
  private readonly pigModel: FarmModel | undefined;
  private readonly pigs: Pig[] = [];
  private plots: readonly (FarmPlotView | undefined)[] = [];
  private dirty = true;
  private time = 0;
  private assignT = 0;
  private steamT = 0;
  private shadowKey = '';

  private readonly refresh: () => void;

  /** refresh — пересчитать запечённые тени (построили загон, компост или улей) */
  constructor(scene: THREE.Scene, models: Map<string, FarmModel>, fx: FarmFx, refresh: () => void) {
    this.fx = fx;
    this.refresh = refresh;
    const node = (m: string, n: string) => models.get(m)?.nodes.get(n);
    const mk = (parts: ReturnType<typeof node>, cap: number, shadows = true) => {
      const pi = new PartInstances(parts, cap, shadows);
      pi.addTo(scene);
      return pi;
    };
    const n = L.plots.length;
    this.pen = mk(node('pig-pen', 'pig-pen'), n);
    this.compost = mk(node('compost', 'compost'), n);
    this.hive = mk(node('hive', 'hive'), n);
    this.peg = mk(node('compost', 'spot_peg'), n * 3, false);
    this.bee = mk(node('hive', 'bee'), n * BEES, false);
    this.wings = mk(node('hive', 'bee_wings'), n * BEES, false);
    this.pigModel = models.get('truffle-pig');
    for (let i = 0; i < PIG_MAX && this.pigModel?.gltf.animations.length; i++) {
      const actor = new Actor(this.pigModel);
      actor.root.visible = false;
      actor.loop('dig');
      scene.add(actor.root);
      this.pigs.push({ actor, plot: -1, x: 0, z: 0, tx: 0, tz: 0, yaw: 0, next: 0 });
    }
  }

  setPlots(list: readonly (FarmPlotView | undefined)[]): void {
    this.plots = list;
    this.dirty = true;
  }

  private rebuild(): void {
    this.dirty = false;
    for (const pi of [this.pen, this.compost, this.hive, this.peg]) pi.begin();
    for (let i = 0; i < L.plots.length; i++) {
      const v = this.plots[i];
      if (!v || !v.pid) continue;
      const spot = (on: boolean, lv: number, x: number, z: number, pi: PartInstances): void => {
        if (on) pi.push(plotMatrix(i, x, z));
        else if (v.level >= lv) this.peg.push(plotMatrix(i, x, z + 0.3));
      };
      spot(v.pig, PL.pen.level, PL.pen.x, PL.pen.z, this.pen);
      spot(v.compost, PL.compost.level, PL.compost.x, PL.compost.z, this.compost);
      spot(v.bees, PL.hive.level, PL.hive.x, PL.hive.z, this.hive);
    }
    for (const pi of [this.pen, this.compost, this.hive, this.peg]) pi.end();
    const key = [this.pen, this.compost, this.hive].map((p) => p.meshes[0]?.count ?? 0).join();
    if (key !== this.shadowKey) {
      this.shadowKey = key;
      this.refresh();
    }
  }

  /** cam — камера (дальние свины и пчёлы не рисуются); near — своя желейка (свин виляет хвостиком) */
  update(dt: number, cam: THREE.Vector3, near: { x: number; z: number } | null): void {
    this.time += dt;
    if (this.dirty) this.rebuild();
    const t = this.time;
    // свины: ближние участки со свином
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 0.7;
      const want: { plot: number; d: number }[] = [];
      for (let i = 0; i < L.plots.length; i++) {
        if (!this.plots[i]?.pig) continue;
        const d = Math.hypot(L.plots[i].x - cam.x, L.plots[i].z - cam.z);
        if (d < PIG_R) want.push({ plot: i, d });
      }
      want.sort((a, b) => a.d - b.d);
      const keep = new Set(want.slice(0, this.pigs.length).map((w) => w.plot));
      for (const pig of this.pigs) if (pig.plot >= 0 && !keep.has(pig.plot)) { pig.plot = -1; pig.actor.root.visible = false; }
      for (const plot of keep) {
        if (this.pigs.some((p) => p.plot === plot)) continue;
        const pig = this.pigs.find((p) => p.plot < 0);
        if (!pig) break;
        pig.plot = plot;
        pig.x = pig.tx = (Math.random() - 0.5) * 0.8;
        pig.z = pig.tz = (Math.random() - 0.5) * 0.5;
        pig.next = 0;
        pig.actor.root.visible = true;
      }
    }
    for (const pig of this.pigs) {
      if (pig.plot < 0) continue;
      const a = pig.actor;
      const P = L.plots[pig.plot];
      // хозяин (кто-то) у загона — смотрит и виляет хвостиком
      let close = false;
      if (near) {
        const m = plotMatrix(pig.plot, PL.pen.x, PL.pen.z);
        close = Math.hypot(near.x - m.elements[12], near.z - m.elements[14]) < 2.6;
      }
      pig.next -= dt;
      const dx = pig.tx - pig.x;
      const dz = pig.tz - pig.z;
      const dist = Math.hypot(dx, dz);
      if (close) a.loop('wag');
      else if (dist > 0.05) {
        a.loop('walk');
        const step = Math.min(dist, dt * 0.35);
        pig.x += (dx / dist) * step;
        pig.z += (dz / dist) * step;
        pig.yaw = Math.atan2(-dx, -dz);
      } else if (pig.next <= 0) {
        // роет, нюхает, перебегает; изредка спит
        const r = Math.random();
        if (r < 0.35) { pig.tx = (Math.random() - 0.5) * 1.1; pig.tz = (Math.random() - 0.5) * 0.7; }
        else a.loop(r < 0.7 ? 'dig' : r < 0.92 ? 'sniff' : 'sleep');
        if (r > 0.6 && r < 0.65) a.play('happy');
        pig.next = 2.5 + Math.random() * 4;
      }
      const m = plotMatrix(pig.plot, PL.pen.x + pig.x, PL.pen.z + pig.z, pig.yaw, 0.02);
      a.root.position.setFromMatrixPosition(m);
      a.root.rotation.y = P.yaw + pig.yaw;
      a.update(dt);
    }
    // пчёлы: кружат у летка ближних ульев
    this.bee.begin();
    this.wings.begin();
    this.steamT -= dt;
    const steam = this.steamT <= 0;
    if (steam) this.steamT = 0.9;
    for (let i = 0; i < L.plots.length; i++) {
      const v = this.plots[i];
      if (!v) continue;
      const P = L.plots[i];
      if (Math.hypot(P.x - cam.x, P.z - cam.z) > BEE_R) continue;
      if (v.bees) {
        for (let b = 0; b < BEES; b++) {
          const ph = t * (1.3 + b * 0.17) + b * 1.7 + i;
          const r = 0.35 + 0.25 * Math.sin(ph * 0.7 + b);
          const lx = PL.hive.x + Math.cos(ph) * r;
          const lz = PL.hive.z + 0.3 + Math.sin(ph * 1.3) * r * 0.8;
          const y = 0.55 + 0.25 * Math.sin(ph * 1.9 + b);
          // летит по касательной: перед пчелы — −Z
          const yaw = Math.atan2(Math.sin(ph), -Math.cos(ph * 1.3) * 1.04);
          const m = plotMatrix(i, lx, lz, yaw, y);
          this.bee.push(m);
          // крылья машут вокруг Z
          _e.set(0, 0, Math.sin(t * 60 + b) * 0.6);
          this.wings.push(m.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(_e)));
        }
      }
      // тёплый парок из щелей компоста
      if (v.compost && steam) {
        const m = plotMatrix(i, PL.compost.x + (Math.random() - 0.5) * 0.8, PL.compost.z, 0, 0.7);
        this.fx.burst({ x: m.elements[12], y: 0.7, z: m.elements[14], n: 2, color: 0xf2efe8, spread: 0.1, up: 0.4, life: 2.2, size: 0.35, gravity: -0.1 });
      }
    }
    this.bee.end();
    this.wings.end();
  }
}
