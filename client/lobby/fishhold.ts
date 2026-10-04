// Рыба в руках (рюкзак рыбака → «Взять в руки»): модель пойманной рыбы у желейки в руках — у своей и у чужих (сервер
// проверяет рюкзак и рассылает fishHold всем на набережной). Как на фото с уловом — рыба ниже лица (глаза — 1,17 м):
// мелкая — за хвост в руке перед собой на уровне груди, средняя — двумя руками перед собой на уровне пояса, крупная
// (акула, кальмар) — стоит рядом во весь рост, хвостом на настиле, рука на ней; маленький кальмар висит за мантию.
// Пока руки заняты другим (удочка, пиво, эмоция, сидит, едет) — рыба спрятана, потом снова в руках. Своя — плашка
// «в руках · Esc — убрать».
import * as THREE from 'three';
import { FISH } from '../../shared/fishing.ts';
import { ACT_NONE } from '../../shared/lobby.ts';
import type { Avatar } from '../render/avatar.ts';
import { TOUCH } from '../touch.ts';
import { makeFish3D } from './fishart.ts';

/** Как держит: за хвост в руке на уровне груди, двумя руками перед собой, стоит рядом во весь рост */
export const P_HANG = 0;
export const P_FRONT = 1;
export const P_SIDE = 2;
/** Рука с рыбой за хвост — на уровне груди (ниже лица); рыба двумя руками — на уровне пояса, м от земли */
const CHEST_Y = 0.92;
const WAIST_Y = 0.7;

interface Hold {
  n: number;
  sp: number;
  g: number;
  fish: THREE.Group;
  len: number;
  half: THREE.Vector3;
  pose: number;
  squid: boolean;
  /** Руки желейки — свой массив (Avatar.hands): по нему видно, что руки сейчас наши */
  hands: number[];
  /** Чья желейка держит (на ней — в узле held) */
  av: Avatar | null;
  t: number;
}

/** Как держать рыбу длиной len, м (длинный кальмар за мантию касался бы щупальцами настила — двумя руками или рядом). */
export function holdPose(len: number, squid: boolean): number {
  if (squid) return len <= 0.65 ? P_HANG : len <= 1.25 ? P_FRONT : P_SIDE;
  return len <= 0.55 ? P_HANG : len <= 1.25 ? P_FRONT : P_SIDE;
}

/**
 * Поза: где рыба (f — в осях желейки: +X вправо, −Z вперёд, y — от земли) и где варежки (hands: левая x, y, z, правая
 * x, y, z); half — половина размеров модели (вдоль, по высоте, толщина), t — сколько секунд в руках (бьёт хвостом).
 */
export function placeHeld(f: THREE.Object3D, hands: number[], pose: number, len: number, half: THREE.Vector3, squid: boolean, t: number): void {
  // рыба ещё живая: изредка бьёт хвостом (первые секунды — чаще)
  const cyc = t % (t < 4 ? 1.6 : 4.2);
  const flap = cyc < 0.45 ? Math.sin((cyc / 0.45) * Math.PI) * (squid ? 0 : 1) : 0;
  const wig = Math.sin(t * 19) * 0.22 * flap;
  if (pose === P_HANG) {
    // за хвост (кальмар — за кончик мантии) в правой руке перед собой на уровне груди, висит вниз, чуть качается
    const hy = Math.max(CHEST_Y, 0.3 + len);
    set(hands, -0.44, 0.62, -0.2, 0.4, hy, -0.44);
    const sway = Math.sin(t * 1.9) * 0.07;
    f.rotation.set(0, wig, (squid ? Math.PI / 2 : -Math.PI / 2) + sway);
    const down = half.x - 0.03;
    f.position.set(0.4 + Math.sin(sway) * down, hy - Math.cos(sway) * down, -0.44);
  } else if (pose === P_FRONT) {
    // двумя руками перед собой на уровне пояса, как на фото с уловом: боком к тому, кто смотрит спереди, лицо открыто
    const hx = Math.min(0.46, Math.max(0.2, half.x * 0.62));
    const bob = Math.sin(t * 2.2) * 0.012;
    const y = WAIST_Y + bob;
    const z = -0.58 - half.z;
    set(hands, -hx, y - 0.04, z + 0.02, hx, y - 0.04, z + 0.02);
    f.rotation.set(0, Math.PI + wig * 0.5, squid ? 0.05 : -0.04 + flap * 0.08);
    f.position.set(0, y + half.y * 0.25, z);
  } else {
    // крупная — стоит рядом справа во весь рост, головой вверх, хвостом (щупальцами) на настиле; правая рука держит
    // её на уровне груди, левая — у пояса: видно и рыбу целиком, и лицо
    const bob = Math.sin(t * 2) * 0.006;
    const x = 0.6 + half.y;
    set(hands, -0.46, 0.68, -0.24, 0.6, 0.98 + bob, -0.2);
    f.rotation.set(0, wig * 0.3, Math.PI / 2);
    f.position.set(x, half.x + 0.03 + bob, -0.12);
  }
}

export class FishHolds {
  /** Своя рыба в руках: номер в рюкзаке (−1 — руки пустые) */
  myN = -1;
  /**
   * Своя рыба сейчас видна в руках (руки не заняты удочкой, пивом, эмоцией): плашка «в руках · Убрать» и Esc — только
   * тогда. С удочкой плашка не нужна (рыбы в руках не видно) и наезжала бы на шкалу вываживания.
   */
  myShown = false;
  /** Нажали «Убрать» на плашке */
  onPutAway: () => void = () => {};
  private readonly by = new Map<number, Hold>();
  private readonly chip: HTMLElement;
  private readonly chipName: HTMLElement;
  private myId = -1;

  constructor(hud: HTMLElement) {
    this.chip = document.createElement('div');
    this.chip.className = 'fh-chip';
    this.chipName = this.chip.appendChild(document.createElement('span'));
    const btn = this.chip.appendChild(document.createElement('button'));
    btn.type = 'button';
    btn.className = 'fh-put';
    btn.innerHTML = TOUCH ? 'Убрать' : 'Убрать <kbd>Esc</kbd>';
    btn.addEventListener('click', () => this.onPutAway());
    hud.appendChild(this.chip);
  }

  /** Свой номер в снимках (вошёл на набережную) */
  setMe(id: number): void {
    this.myId = id;
  }

  /** Сервер: игрок id держит рыбу (n ≥ 0) или убрал (n = −1). */
  set(id: number, n: number, sp: number, g: number): void {
    const old = this.by.get(id);
    if (old && old.n === n && old.sp === sp) return;
    if (old) this.remove(id, old);
    if (id === this.myId) this.myN = n >= 0 && FISH[sp] ? n : -1;
    if (n >= 0 && FISH[sp]) {
      const fish = makeFish3D(sp, g);
      fish.name = 'held-fish';
      fish.visible = false;
      const len = fish.userData.len as number;
      const squid = FISH[sp].shape === 'squid';
      this.by.set(id, {
        n, sp, g, fish, len, squid, half: (fish.userData.half as THREE.Vector3).clone(), pose: holdPose(len, squid),
        hands: [0, 0, 0, 0, 0, 0], av: null, t: 0,
      });
    }
    this.showChip();
  }

  /** Держит ли что-то игрок id (для проверок) */
  of(id: number): { n: number; sp: number; g: number; pose: number; shown: boolean } | null {
    const h = this.by.get(id);
    return h ? { n: h.n, sp: h.sp, g: h.g, pose: h.pose, shown: h.fish.visible } : null;
  }

  /**
   * Кадр — до Avatar.update (варежки берут руки отсюда). avatarOf — желейка игрока (null — не видно); руки сейчас
   * заняты другим (удочка, пиво, эмоция, сидит) — рыбу прячем и руки не трогаем.
   */
  update(dt: number, avatarOf: (id: number) => Avatar | null): void {
    let mine = false;
    for (const [id, h] of this.by) {
      const av = avatarOf(id);
      if (av !== h.av) {
        if (h.av && h.av.hands === h.hands) h.av.hands = null;
        h.fish.removeFromParent();
        h.av = av;
        if (av) av.held.add(h.fish);
      }
      if (!av) continue;
      const free = av.inWorld && av.action === ACT_NONE && (av.hands === null || av.hands === h.hands);
      h.fish.visible = free;
      if (id === this.myId) mine = free;
      if (!free) {
        if (av.hands === h.hands) av.hands = null;
        continue;
      }
      h.t += dt;
      this.pose(h);
      av.hands = h.hands;
    }
    if (mine !== this.myShown) {
      this.myShown = mine;
      this.showChip();
    }
  }

  /** Ушли с набережной: всё убрать. */
  reset(): void {
    for (const [id, h] of this.by) this.remove(id, h);
    this.myN = -1;
    this.myShown = false;
    this.showChip();
  }

  private remove(id: number, h: Hold): void {
    if (h.av && h.av.hands === h.hands) h.av.hands = null;
    h.fish.removeFromParent();
    this.by.delete(id);
  }

  private showChip(): void {
    const h = this.by.get(this.myId);
    this.chip.classList.toggle('show', !!h && this.myShown);
    if (h) this.chipName.textContent = `🐟 ${FISH[h.sp].name} в руках`;
  }

  /** Поза: где рыба и где варежки (placeHeld). */
  private pose(h: Hold): void {
    placeHeld(h.fish, h.hands, h.pose, h.len, h.half, h.squid, h.t);
  }
}

function set(a: number[], lx: number, ly: number, lz: number, rx: number, ry: number, rz: number): void {
  a[0] = lx;
  a[1] = ly;
  a[2] = lz;
  a[3] = rx;
  a[4] = ry;
  a[5] = rz;
}
