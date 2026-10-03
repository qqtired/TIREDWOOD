// Жители набережной — только у себя в браузере: сервер о них не знает. Двое рыбаков сидят на раскладных стульчиках
// у маяка: удочки те же, что у игроков (fishing.ts), распорядок — свой (FisherBrain), улов — в ведро.
import * as THREE from 'three';
import { rollCatch } from '../../shared/fishing.ts';
import { RULE, rollCatch2, SP_BOOT, T_EPIC, T_JUNK } from '../../shared/fishrules.ts';
import { ACT_SIT } from '../../shared/lobby.ts';
import type { Outfit } from '../../shared/outfit.ts';
import { E_ALIVE, E_GROUNDED } from '../../shared/protocol.ts';
import type { Sound } from '../audio.ts';
import { Avatar, type AvatarPose, type GroundQuery } from '../render/avatar.ts';
import type { Effects } from '../render/effects.ts';
import { mergeColored, paint, place } from '../render/kit.ts';
import { FishingSpots, type FishPlace } from './fishing.ts';
import { FisherBrain } from './folksim.ts';
import type { LobbyFx } from './fx.ts';

/** Номера желеек рыбаков (не пересекаются с игроками) */
const FISHER_ID = 950;
const FISHER_RAIN = 'В дождь самый клёв!';

/**
 * Рыбаки у маяка: место (лицом к воде, ведро — по левую руку) и наряд. Первый — в тельняшке, рыбацкой шляпе
 * и с усами (сонный — давно сидит), второй — в панаме и шарфе.
 */
const FISHERS: ReadonlyArray<{ place: FishPlace; outfit: Outfit; extra: 'thermos' | 'tackle' }> = [
  {
    place: { x: -14.6, z: 40.3, yaw: -Math.PI / 2, bucket: [-14.85, 0, 39.35] },
    outfit: { c: 13, c2: 15, p: 'stripes', e: 'sleepy', h: 'fisher', a: 'mustache' },
    extra: 'thermos',
  },
  {
    place: { x: -23.4, z: 43.6, yaw: Math.PI / 2, bucket: [-23.25, 0, 44.55] },
    outfit: { c: 8, c2: 15, p: 'none', e: 'happy', h: 'panama', a: 'scarf' },
    extra: 'tackle',
  },
];
/** Сиденье стульчика — на высоте, где сидит желейка */
const STOOL_H = 0.3;

export class LobbyFolk {
  private readonly ground: GroundQuery;
  private readonly fishers: Avatar[] = [];
  private readonly brains: FisherBrain[];
  private readonly spots: FishingSpots;
  private readonly fisherPose: AvatarPose[];
  private raining = false;
  private started = false;
  private fisherSayT = -1;
  private fisherSayer = 0;
  private visualDt = 0;

  constructor(scene: THREE.Scene, ground: GroundQuery, effects: Effects, fx: LobbyFx, sound: Sound) {
    this.ground = ground;
    const r = Math.random;
    // стульчики, вёдра, термос и ящик со снастями — одной сеткой
    const props: THREE.BufferGeometry[] = [];
    this.fisherPose = FISHERS.map((f, i) => {
      const av = new Avatar(FISHER_ID + i, { gun: false, voice: false });
      av.setOutfit(f.outfit);
      av.setInfo('', null, false);
      av.setAction(ACT_SIT, 0);
      av.addTo(scene);
      this.fishers.push(av);
      fisherProps(props, f.place, f.extra);
      return { x: f.place.x, y: 0, z: f.place.z, yaw: f.place.yaw, pitch: 0, flags: E_ALIVE | E_GROUNDED };
    });
    const propMesh = new THREE.Mesh(mergeColored(props), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    propMesh.castShadow = true;
    propMesh.receiveShadow = true;
    scene.add(propMesh);
    this.spots = new FishingSpots(scene, effects, fx, sound, null, FISHERS.map((f) => f.place));
    this.brains = FISHERS.map((f) => new FisherBrain(f.place.x, f.place.z, f.place.yaw, r));
  }

  /** Кадр: rain — сила дождя 0…1 (начался дождь — рыбак иногда скажет, что сейчас самый клёв). */
  update(dt: number, time: number, camPos: THREE.Vector3, rain: number): void {
    // не в первый кадр: вошли под дождь — молчат
    const raining = this.raining ? rain > 0.1 : rain > 0.3;
    if (raining !== this.raining) {
      this.raining = raining;
      if (this.started && raining && Math.random() < 0.5) {
        this.fisherSayer = Math.floor(Math.random() * this.fishers.length);
        this.fisherSayT = 2 + Math.random() * 4;
      }
    }
    this.started = true;

    // распорядок → события удочек → желейки → удочки в руках
    for (let i = 0; i < this.brains.length; i++) this.brains[i].step(dt, (kind, a, b) => this.spots.onEvent(kind, i, a, b));
    if (this.fisherSayT >= 0) {
      this.fisherSayT -= dt;
      if (this.fisherSayT < 0) this.fishers[this.fisherSayer].say(FISHER_RAIN);
    }
    // Распорядок и события не пропускаем; вдали обновляем только декоративные позы/снасти реже.
    this.visualDt += dt;
    const near = this.fisherPose.some((p) => (p.x - camPos.x) ** 2 + (p.z - camPos.z) ** 2 < 30 * 30);
    if (!near && this.visualDt < 0.1) return;
    const visualDt = this.visualDt;
    this.visualDt = 0;
    for (let i = 0; i < this.fishers.length; i++) this.fishers[i].update(this.fisherPose[i], visualDt, time, this.ground, camPos, false);
    this.spots.update(visualDt, time, this.fishers);
  }

  /**
   * Рыбалка 2.0: соседи ловят её виды (в дождь — и дождевые), но не крупнее эпических: легендарных, акулу
   * и сундуки вытаскивают только игроки.
   */
  setV2(on: boolean): void {
    const roll = (r: () => number): { sp: number; g: number } => {
      for (let i = 0; i < 6; i++) {
        const c = rollCatch2(this.raining, r);
        const tier = RULE[c.sp]?.tier ?? T_JUNK;
        if (tier <= T_EPIC || tier === T_JUNK) return c;
      }
      return { sp: SP_BOOT, g: 900 };
    };
    for (const b of this.brains) b.roll = on ? roll : rollCatch;
  }

  debug(): Record<string, unknown> {
    return { caught: this.brains.map((b) => b.caught), fish: this.spots.debug() };
  }
}

// ------------------------------------------------------------ рыбацкое хозяйство

/** Стульчик под рыбаком, ведро слева, рядом — термос или ящик со снастями. */
function fisherProps(out: THREE.BufferGeometry[], at: FishPlace, extra: 'thermos' | 'tackle'): void {
  const local: THREE.BufferGeometry[] = [];
  // раскладной стульчик: брезентовое сиденье, по бокам — ножки крест-накрест
  local.push(place(paint(new THREE.BoxGeometry(0.36, 0.025, 0.3), 0x5f7a4a), 0, STOOL_H - 0.012, 0));
  for (const sx of [-0.16, 0.16]) {
    for (const a of [-0.73, 0.73]) local.push(place(paint(new THREE.BoxGeometry(0.022, 0.39, 0.022), 0x8c9399), sx, STOOL_H / 2, 0, 0, a));
    local.push(place(paint(new THREE.BoxGeometry(0.03, 0.02, 0.3), 0x8c9399), sx, STOOL_H - 0.02, 0));
  }
  // рядом с правой рукой (по ходу взгляда — справа сзади) — термос или ящик
  if (extra === 'thermos') {
    local.push(place(paint(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 10), 0x3f7a5a), 0.42, 0.15, 0.2));
    local.push(place(paint(new THREE.CylinderGeometry(0.058, 0.058, 0.07, 10), 0xc9cfd4), 0.42, 0.335, 0.2));
  } else {
    local.push(place(paint(new THREE.BoxGeometry(0.38, 0.16, 0.22), 0xd9692e), 0.45, 0.08, 0.25, 0.2));
    local.push(place(paint(new THREE.BoxGeometry(0.39, 0.02, 0.23), 0xb3531f), 0.45, 0.17, 0.25, 0.2));
    local.push(place(paint(new THREE.BoxGeometry(0.14, 0.03, 0.03), 0x2b2f33), 0.45, 0.2, 0.25, 0.2));
  }
  const g = mergeColored(local);
  g.rotateY(at.yaw);
  g.translate(at.x, 0, at.z);
  out.push(g);
  // ведро с водой (в мировых координатах — туда летит улов)
  const b = at.bucket;
  if (!b) return;
  out.push(place(paint(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 14, 1, true), 0x9aa3a8), b[0], b[1] + 0.15, b[2]));
  out.push(place(paint(new THREE.CircleGeometry(0.14, 14).rotateX(-Math.PI / 2), 0x8a9398), b[0], b[1] + 0.005, b[2]));
  out.push(place(paint(new THREE.CircleGeometry(0.163, 14).rotateX(-Math.PI / 2), 0x3e6474), b[0], b[1] + 0.24, b[2]));
  out.push(place(paint(new THREE.TorusGeometry(0.17, 0.008, 4, 16).rotateX(Math.PI / 2), 0x7d868b), b[0], b[1] + 0.3, b[2]));
  out.push(place(paint(new THREE.TorusGeometry(0.17, 0.006, 4, 10, Math.PI), 0x5b6266), b[0], b[1] + 0.3, b[2], at.yaw, -0.5));
}
