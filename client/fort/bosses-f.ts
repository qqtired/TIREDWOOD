// Новые боссы «Крепости» на клиенте (fort-bosses): Король-Тыква, Ткачиха, Леший — тексты тревог и полоски босса,
// вспышки их ударов ('blast'), что летит в 'throw', и паутина Ткачихи на поверхностях (живёт, пока не порвут или
// не спадёт). match.ts и hud.ts зовут отсюда по одной строке; модели — client/fort/mobs/set-f.ts.
import * as THREE from 'three';
import { TICK_RATE } from '../../shared/constants.ts';
import {
  ZS_LS_HEAL, ZS_LS_RISE, ZS_LS_ROOTS, ZS_LS_SINK, ZS_LS_UNDER, ZS_PK_ROLL, ZS_PK_ROLL_WARN, ZS_PK_SPIT, ZS_PK_SUMMON,
  ZS_WV_BITE, ZS_WV_BROOD, ZS_WV_CLIMB, ZS_WV_HANG, ZS_WV_OVER, ZS_WV_SWEEP, ZS_WV_TORN, ZS_WV_WEB,
} from '../../shared/fort.ts';
import { WV_WEB_TICKS } from '../../shared/fortbosses.ts';
import { Z_LESHY, Z_PUMPKIN, Z_WEAVER } from '../../shared/fortkinds.ts';
import { CRYSTAL, GATE, WALL_H } from '../../shared/fortmap.ts';
import type { Sound } from '../audio.ts';
import type { Effects } from '../render/effects.ts';

/** Строка полоски босса для состояния нового босса (null — не их состояние) */
export function newBossHudLine(state: number): string | null {
  switch (state) {
    case ZS_PK_SUMMON: return 'Сеет тыквят · лопайте их подальше от ворот';
    case ZS_PK_ROLL_WARN: return 'Сворачивается · прыгайте, когда круг под вами';
    case ZS_PK_ROLL: return 'Катится!';
    case ZS_PK_SPIT: return 'Семечки · уйдите из круга';
    case ZS_WV_CLIMB: return 'Лезет на стену';
    case ZS_WV_HANG: return 'Висит на стене · бейте сверху';
    case ZS_WV_SWEEP: return 'Хлёст лапами · уйдите из круга, прыжок не спасёт';
    case ZS_WV_WEB: return 'Паутина · уйдите из круга, рвите её выстрелами';
    case ZS_WV_BROOD: return 'Кладка · сейчас полезут паучата';
    case ZS_WV_BITE: return 'Тянется к кристаллу · бейте!';
    case ZS_WV_OVER: return 'Лезет через стену!';
    case ZS_LS_ROOTS: return 'Корни · уйдите из круга, прыжок не спасёт';
    case ZS_LS_HEAL: return 'Лечит армию · бейте, чтобы сорвать!';
    case ZS_LS_SINK: return 'Уходит под землю';
    case ZS_LS_UNDER: return 'Под землёй · где круг — там вылезет';
    case ZS_LS_RISE: return 'Вылезает!';
  }
  return null;
}

/** Тревога на метку атаки нового босса (null — не их атака); near — метка у меня под ногами */
export function newBossWarnText(attack: number, near: boolean, tx: number, ty: number, tz: number): string | null {
  switch (attack) {
    case ZS_PK_SUMMON: return '🎃 Король-Тыква сеет тыквят · лопайте их подальше от ворот';
    case ZS_PK_ROLL_WARN:
      return ty > WALL_H ? '🎃 Король сворачивается для переката · прыгай, когда круг под тобой' : '🎃 Король катится к кристаллу · прочь с дороги';
    case ZS_PK_SPIT: return near ? '🎃 Семечки летят в тебя · уйди из круга' : '🎃 Король плюётся семечками · следи за кругом';
    case ZS_WV_SWEEP: return '🕷 Ткачиха замахнулась лапами · уйди из круга, прыжок не спасёт';
    case ZS_WV_WEB: return near ? '🕸 Паутина летит в тебя · уйди из круга' : '🕸 Ткачиха плетёт паутину · рвите её выстрелами';
    case ZS_WV_BROOD: return '🕷 Ткачиха откладывает паучат · сбейте их со стены';
    case ZS_WV_BITE: return '🕷 Ткачиха тянется к кристаллу · бейте её!';
    case ZS_LS_ROOTS:
      if (near) return '🌳 Корни под тобой · уйди из круга, прыжок не спасёт';
      if (tz < GATE.face && Math.abs(tx) < 1) return '🌳 Леший пускает корни под ворота';
      if (Math.hypot(tx - CRYSTAL.x, tz - CRYSTAL.z) < 1) return '🌳 Корни под кристаллом · Лешему стены не помеха';
      return '🌳 Леший пускает корни · кто в круге — прочь';
    case ZS_LS_HEAL: return '🌳 Леший лечит армию · бейте его, чтобы сорвать колдовство!';
    case ZS_LS_UNDER: return '🌳 Леший ушёл под землю · где круг — там вылезет';
  }
  return null;
}

/** Ярость нового босса (null — не новый) */
export function newBossRageText(kind: number): string | null {
  return kind === Z_PUMPKIN ? '🎃 Король-Тыква в ярости · катится туда и обратно'
    : kind === Z_WEAVER ? '🕷 Ткачиха в ярости · лезет через стену к кристаллу!'
    : kind === Z_LESHY ? '🌳 Леший в ярости · корни бьют дважды, лесовиков больше'
    : null;
}

/** Прорыв во двор нового босса (null — не новый) */
export function newBossBreachText(kind: number): string | null {
  return kind === Z_PUMPKIN ? '🎃 Ворота пали — Король-Тыква скачет во двор · к кристаллу!'
    : kind === Z_WEAVER ? '🕷 Ткачиха лезет через стену во двор · к кристаллу!'
    : kind === Z_LESHY ? '🌳 Ворота пали — Леший идёт во двор · корни под кристаллом!'
    : null;
}

/** Что летит в 'throw' у новых боссов: семечки — комок, паутина — клубок (null — не их) */
export function newBossThrow(what: number): 'glob' | 'ink' | null {
  return what === ZS_PK_SPIT ? 'glob' : what === ZS_WV_WEB ? 'ink' : null;
}

// ------------------------------------------------------------ паутина

/** Плоская паутина единичного радиуса (лучи и кольца лентами) в плоскости XZ */
function webGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number, w: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = (-dz / l) * w;
    const nz = (dx / l) * w;
    pos.push(ax - nx, 0, az - nz, bx - nx, 0, bz - nz, ax + nx, 0, az + nz);
    pos.push(ax + nx, 0, az + nz, bx - nx, 0, bz - nz, bx + nx, 0, bz + nz);
  };
  const rays = 11;
  const angle = (i: number) => (i / rays) * Math.PI * 2 + Math.sin(i * 2.3) * 0.12;
  for (let i = 0; i < rays; i++) quad(0, 0, Math.cos(angle(i)) * 1.02, Math.sin(angle(i)) * 1.02, 0.018);
  for (const r of [0.22, 0.42, 0.62, 0.8, 0.97]) {
    for (let i = 0; i < rays; i++) {
      // кольцо провисает между лучами
      const a0 = angle(i);
      const a1 = angle(i + 1);
      const r0 = r * (1 + 0.04 * Math.sin(i * 1.7 + r * 9));
      const r1 = r * (1 + 0.04 * Math.sin((i + 1) * 1.7 + r * 9));
      const am = (a0 + a1) / 2;
      const rm = (r0 + r1) / 2 * 0.9;
      quad(Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(am) * rm, Math.sin(am) * rm, 0.014);
      quad(Math.cos(am) * rm, Math.sin(am) * rm, Math.cos(a1) * r1, Math.sin(a1) * r1, 0.014);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const MAX_WEBS = 6;
const WEB_S = WV_WEB_TICKS / TICK_RATE;

/** Паутина Ткачихи на поверхностях: появляется по 'blast' ZS_WV_WEB, рвётся по ZS_WV_TORN, гаснет к концу жизни */
export class Webs3D {
  readonly group = new THREE.Group();
  private readonly geo = webGeometry();
  private readonly slots: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; born: number; until: number; torn: number; x: number; y: number; z: number; r: number }> = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX_WEBS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xf6f0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.slots.push({ mesh, mat, born: 0, until: -1, torn: -1, x: 0, y: 0, z: 0, r: 0 });
    }
    scene.add(this.group);
  }

  add(x: number, y: number, z: number, r: number, now: number): void {
    let slot = this.slots[0];
    for (const s of this.slots) {
      if (s.until < now) {
        slot = s;
        break;
      }
      if (s.born < slot.born) slot = s;
    }
    Object.assign(slot, { born: now, until: now + WEB_S, torn: -1, x, y, z, r });
    slot.mesh.position.set(x, y + 0.05, z);
    slot.mesh.scale.set(r, 1, r);
    slot.mesh.rotation.y = (x * 7.3 + z * 3.1) % (Math.PI * 2);
    slot.mesh.visible = true;
  }

  /** Порвали: ближайшая живая в радиусе — быстро гаснет */
  tear(x: number, y: number, z: number, now: number): void {
    let best = null as (typeof this.slots)[number] | null;
    let bestD = Infinity;
    for (const s of this.slots) {
      if (s.until < now || s.torn >= 0 || Math.abs(s.y - y) > 1.6) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < s.r + 0.5 && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) best.torn = now;
  }

  clear(): void {
    for (const s of this.slots) {
      s.until = -1;
      s.mesh.visible = false;
    }
  }

  update(now: number): void {
    for (const s of this.slots) {
      if (!s.mesh.visible) continue;
      const end = s.torn >= 0 ? Math.min(s.until, s.torn + 0.3) : s.until;
      if (now >= end) {
        s.mesh.visible = false;
        s.until = -1;
        continue;
      }
      const fadeIn = Math.min(1, (now - s.born) / 0.2);
      const fadeOut = Math.min(1, (end - now) / (s.torn >= 0 ? 0.3 : 1.5));
      s.mat.opacity = 0.85 * fadeIn * fadeOut;
      if (s.torn >= 0) s.mesh.scale.setScalar(s.r * (1 + (now - s.torn) * 0.8)).setY(1);
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geo.dispose();
    for (const s of this.slots) s.mat.dispose();
  }
}

// ------------------------------------------------------------ вспышки ударов

/** Вспышки и звуки новых боссов; webs — паутина. Возвращает тряску камеры (−1 — не их удар) */
export function newBossBlast(attack: number, x: number, y: number, z: number, r: number, dist: number, now: number,
  effects: Effects, sound: Sound, webs: Webs3D | null, alert: (text: string, ms: number) => void): number {
  const at: [number, number, number] = [x, y, z];
  const ring = (color: number, size: number) => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      effects.puff(x + Math.cos(a) * r * 0.7, y + 0.3, z + Math.sin(a) * r * 0.7, size, color, 0.9, 0.7, 0.5);
    }
  };
  const near = (k: number) => (dist < r + k ? Math.min(1, (r + k - dist) / k) : 0);
  switch (attack) {
    case ZS_PK_SUMMON:
      // тыквята: рыжие брызги и листья
      effects.burst(x, y + 0.5, z, 0xff9a3c, 30, 6, 0, 1, 0, 0.08);
      effects.burst(x, y + 0.5, z, 0x6fae3e, 16, 5, 0, 1, 0, 0.06);
      effects.puff(x, y + 0.6, z, r * 0.8, 0xffc58a, 0.8, 0.6, 0.5);
      sound.bloat(at);
      return 0.3 * near(8);
    case ZS_PK_ROLL:
      // докатился: в стену или в постамент — пыль кольцом и гул
      ring(0xc9b896, 1.6);
      effects.burst(x, y + 0.6, z, 0xe8822e, 22, 6, 0, 1, 0, 0.08);
      sound.boom(at, 1.2);
      return 0.8 * near(16);
    case ZS_PK_SPIT:
      // семечки: кремовые брызги и рыжая клякса
      effects.splat(x, y - 0.75, z, 0, 1, 0, r * 0.8, 0xe8822e, -1, 10);
      effects.burst(x, y, z, 0xfff1cc, 26, 5, 0, 1, 0, 0.05);
      effects.burst(x, y, z, 0xe8822e, 12, 4, 0, 1, 0, 0.06);
      sound.spit(at);
      return 0.4 * near(6);
    case ZS_WV_SWEEP:
      // хлёст: пыль кольцом и сиреневые брызги
      ring(0xd0c4b0, 1.2);
      effects.burst(x, y, z, 0x9a55a8, 18, 6, 0, 0.8, 0, 0.06);
      sound.rumble(at, 0.7);
      return 0.6 * near(10);
    case ZS_WV_WEB:
      // паутина легла: белёсая вспышка, сетка на поверхности
      webs?.add(x, y, z, r, now);
      effects.burst(x, y + 0.3, z, 0xf6f0ff, 24, 4, 0, 1, 0, 0.05);
      sound.splat(at, dist);
      return 0.2 * near(5);
    case ZS_WV_TORN:
      // порвали: клочья паутины
      webs?.tear(x, y, z, now);
      effects.burst(x, y + 0.3, z, 0xf6f0ff, 18, 5, 0, 1, 0, 0.04);
      effects.puff(x, y + 0.3, z, r * 0.6, 0xffffff, 0.4, 0.3, 0.4);
      sound.popAt(at, dist);
      return 0;
    case ZS_WV_BROOD:
      // кладка: сиреневые брызги — паучата вылупились
      effects.burst(x, y + 0.4, z, 0x9a55a8, 30, 6, 0, 1, 0, 0.07);
      effects.puff(x, y + 0.5, z, r, 0xd8b2ff, 0.7, 0.5, 0.45);
      sound.bloat(at);
      return 0.2 * near(6);
    case ZS_WV_BITE:
      // укус кристалла: голубые осколки
      effects.burst(x, y + 1.2, z, 0x9ff6ff, 34, 7, 0, 1, 0, 0.07);
      effects.burst(x, y + 1, z, 0x9a55a8, 12, 5, 0, 1, 0, 0.06);
      sound.boom(at, 0.8);
      return 0.6 * near(10);
    case ZS_LS_ROOTS:
      // корни из-под земли: комья земли, пыль кольцом, гул
      effects.burst(x, y, z, 0x6b4a2a, 40, 8, 0, 1, 0, 0.09);
      effects.burst(x, y, z, 0x7a9a44, 12, 6, 0, 1, 0, 0.06);
      ring(0xb8a888, 1.3);
      sound.rumble(at, 1.1);
      return 0.7 * near(12);
    case ZS_LS_HEAL:
      if (r > 0) return 0;
      // колдовство сорвано: листья опадают, Леший открыт
      effects.burst(x, y + 3, z, 0x8fcc5c, 30, 5, 0, 1, 0, 0.07);
      effects.puff(x, y + 3, z, 3, 0xbfbfa0, 0.8, 0.5, 0.5);
      sound.planks(at);
      alert('🌳 Колдовство сорвано! Леший открыт — огонь!', 2600);
      return 0.3;
    case ZS_LS_UNDER:
      // вылез: земля фонтаном, пыль, удар
      effects.burst(x, y, z, 0x6b4a2a, 60, 10, 0, 1, 0, 0.1);
      effects.puff(x, y + 1, z, r * 1.2, 0xb8a888, 1.2, 1, 0.6);
      ring(0xb8a888, 1.8);
      sound.boom(at, 1.3);
      sound.rumble(at, 1.2);
      return 0.9 * near(16);
  }
  return -1;
}
