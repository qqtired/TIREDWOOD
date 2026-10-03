// Руки в осях тела и отдельной камеры первого лица. Полный вылет приходится на MOVES[act].w —
// тот же тик, на котором stepFighter сообщает серверу strike/grab. Анимация не меняет симуляцию.
import { FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2, FA_THROW, MOVES } from '../../shared/fight.ts';
import { clamp } from '../../shared/math.ts';

type V3 = readonly [number, number, number];
type Pair = readonly [V3, V3];
interface StrikePose { hand: 0 | 3; back: V3; hit: V3; other?: V3 }
interface HandStyle {
  guard: Pair;
  strikes: Readonly<Record<number, StrikePose>>;
  block: Pair;
  held: Pair;
  stun: Pair;
  ko: Pair;
  grabY: number;
  grabZ: number;
  grabX: number;
  hold: Pair;
  throw: Pair;
}

const WORLD: HandStyle = {
  guard: [[-0.25, 1, -0.47], [0.23, 0.96, -0.5]],
  strikes: {
    [FA_JAB]: { hand: 3, back: [0.26, 0.98, -0.36], hit: [0.08, 1.05, -1.02], other: [-0.2, 1.1, -0.42] },
    [FA_JAB2]: { hand: 0, back: [-0.27, 1, -0.34], hit: [-0.06, 1.06, -1], other: [0.2, 1.08, -0.42] },
    [FA_HOOK]: { hand: 3, back: [0.64, 1.06, -0.22], hit: [-0.06, 1.08, -0.9] },
    [FA_HEAVY]: { hand: 3, back: [0.46, 1.3, 0.16], hit: [0.04, 1, -1.18], other: [-0.2, 1.06, -0.62] },
  },
  block: [[-0.1, 1.22, -0.56], [0.12, 1.16, -0.58]],
  held: [[-0.5, 1.25, -0.05], [0.5, 1.25, -0.05]],
  stun: [[-0.42, 0.6, -0.12], [0.42, 0.6, -0.12]],
  ko: [[-0.55, 0.12, -0.1], [0.55, 0.12, -0.1]],
  grabY: 1, grabZ: -0.95, grabX: 0.46,
  hold: [[-0.3, 1.25, -0.78], [0.3, 1.25, -0.78]],
  throw: [[-0.22, 1.45, -1], [0.22, 1.45, -1]],
};

const FIRST_PERSON: HandStyle = {
  guard: [[-0.36, -0.22, -0.74], [0.35, -0.24, -0.76]],
  strikes: {
    [FA_JAB]: { hand: 3, back: [0.37, -0.25, -0.62], hit: [0.06, -0.12, -1.23], other: [-0.32, -0.21, -0.73] },
    [FA_JAB2]: { hand: 0, back: [-0.38, -0.23, -0.62], hit: [-0.05, -0.11, -1.23], other: [0.31, -0.22, -0.73] },
    [FA_HOOK]: { hand: 3, back: [0.4, -0.14, -0.68], hit: [-0.16, -0.13, -1.18] },
    [FA_HEAVY]: { hand: 3, back: [0.27, -0.1, -0.6], hit: [0.04, -0.12, -1.32], other: [-0.31, -0.22, -0.78] },
  },
  block: [[-0.17, -0.03, -0.51], [0.17, -0.06, -0.53]],
  held: [[-0.47, -0.05, -0.53], [0.47, -0.05, -0.53]],
  stun: [[-0.42, -0.53, -0.45], [0.42, -0.53, -0.45]],
  ko: [[-0.5, -0.8, -0.45], [0.5, -0.8, -0.45]],
  grabY: -0.15, grabZ: -1.04, grabX: 0.4,
  hold: [[-0.24, -0.06, -0.96], [0.24, -0.06, -0.96]],
  throw: [[-0.21, 0.12, -1.14], [0.21, 0.12, -1.14]],
};

function smooth(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

function put(out: number[], i: number, a: V3, b: V3 = a, t = 0): void {
  if (t <= 0 || t >= 1) {
    const p = t >= 1 ? b : a;
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
    return;
  }
  out[i] = a[0] + (b[0] - a[0]) * t;
  out[i + 1] = a[1] + (b[1] - a[1]) * t;
  out[i + 2] = a[2] + (b[2] - a[2]) * t;
}

function pair(out: number[], p: Pair, bob = 0): void {
  put(out, 0, p[0]);
  put(out, 3, p[1]);
  out[1] += bob;
  out[4] -= bob;
}

/** Вылет заканчивается на общем тике контакта; активная фаза удерживает кулак, затем идёт отход. */
function strikeHand(out: number[], i: number, guard: V3, back: V3, hit: V3, act: number, actT: number): void {
  const m = MOVES[act];
  const chamber = m.w * (act === FA_HEAVY ? 0.7 : 0.4);
  if (actT < chamber) put(out, i, guard, back, smooth(actT / chamber));
  else if (actT < m.w) put(out, i, back, hit, smooth((actT - chamber) / (m.w - chamber)));
  else if (actT < m.w + m.a) put(out, i, hit);
  else put(out, i, hit, guard, smooth((actT - m.w - m.a) / m.r));
}

export function handsFor(out: number[], act: number, actT: number, block: boolean, stun: boolean, held: boolean, ko: boolean, time: number, firstPerson = false): void {
  const s = firstPerson ? FIRST_PERSON : WORLD;
  if (ko) { pair(out, s.ko); return; }
  if (held) { pair(out, s.held, Math.sin(time * 15) * 0.12); return; }
  if (stun) { pair(out, s.stun, Math.sin(time * 9) * 0.04); return; }
  if (block) { pair(out, s.block); return; }
  const bob = Math.sin(time * 5) * 0.02;
  const gl: V3 = [s.guard[0][0], s.guard[0][1] + bob, s.guard[0][2]];
  const gr: V3 = [s.guard[1][0], s.guard[1][1] - bob, s.guard[1][2]];
  put(out, 0, gl);
  put(out, 3, gr);
  const strike = s.strikes[act];
  if (strike) {
    strikeHand(out, strike.hand, strike.hand === 0 ? gl : gr, strike.back, strike.hit, act, actT);
    if (strike.other) put(out, strike.hand === 0 ? 3 : 0, strike.other);
    return;
  }
  if (act === FA_GRAB) {
    const m = MOVES[FA_GRAB];
    const t = actT < m.w ? smooth(actT / m.w) : actT < m.w + m.a ? 1 : 1 - smooth((actT - m.w - m.a) / m.r);
    const close = actT >= m.w ? smooth((actT - m.w) / m.a) : 0;
    const x = s.grabX + (0.18 - s.grabX) * close;
    put(out, 0, gl, [-x, s.grabY, s.grabZ], t);
    put(out, 3, gr, [x, s.grabY, s.grabZ], t);
  } else if (act === FA_HOLD) {
    pair(out, s.hold);
  } else if (act === FA_THROW) {
    const t = smooth(actT / MOVES[FA_THROW].r);
    put(out, 0, s.throw[0], gl, t);
    put(out, 3, s.throw[1], gr, t);
  }
}
