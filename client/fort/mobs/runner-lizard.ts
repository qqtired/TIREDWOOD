// «Ящерка-бегунок» — шустрик: плащеносная ящерица бежит на задних лапах, корпус вперёд, хвост на отлёте, рот нараспашку,
// вокруг шеи раскрытый воротник (оранжевый в пятнах варенья — его видно со стены), глаза навыкате светятся сиреневым.
// Кусает с выпадом, воротник при этом раздувается; гибнет — кувырок на спину, лапами дрыгает и уходит в землю.
import * as THREE from 'three';
import { ZS_ATTACK, ZS_HOP } from '../../../shared/fort.ts';
import { Z_RUNNER } from '../../../shared/fortkinds.ts';
import { ARMY, colored, merge, setBone, setChild, setChildS, type MobAnim, type MobDef, type MobPose } from './kit.ts';
import { TAU, blob, jolt, lathe, legAt, newLeg, paint, smooth, splat, stepLen, walkAmount } from './set-a-shapes.ts';

const SKIN = 0x8fca3c;
const SKIN_DARK = 0x4f8a2a;
const BELLY = 0xf1df7a;
const HIP = 0.42;
const LEG = 0.42;
/** Шея — верх корпуса (в осях тела от бедра) */
const NECK = 0.5;

function bodyGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    lathe([[0, -0.1], [0.12, -0.07], [0.165, 0.06], [0.155, 0.24], [0.115, 0.4], [0.075, 0.5], [0, 0.55]], 9, SKIN),
    blob(0.1, 0.2, 0.06, BELLY, 7, 4).translate(0, 0.2, 0.115),
    splat(0.12, 0.26, -0.08, 0.06, 0.8, 0, -0.6),
    splat(-0.1, 0.08, 0.1, 0.05, -0.7, 0, 0.7, ARMY.jamLight),
  ];
  // гребень по спине
  for (let i = 0; i < 4; i++) parts.push(colored(new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(-0.6).translate(0, 0.02 + i * 0.13, -0.15 + i * 0.03), SKIN_DARK));
  // ручки растопырены вперёд — машет ими на бегу (вместе с телом)
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.CapsuleGeometry(0.03, 0.17, 1, 5).translate(0, -0.1, 0).rotateX(-1.1).rotateZ(s * 0.5).translate(s * 0.13, 0.4, 0.04), SKIN));
    parts.push(blob(0.04, 0.03, 0.045, SKIN_DARK, 5, 3).translate(s * 0.2, 0.29, 0.2));
  }
  return merge(parts);
}

/** Голова с открытой пастью и воротником; начало — шея */
function headGeo(): THREE.BufferGeometry {
  const frill = paint(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 14, 1).rotateX(Math.PI / 2), (x, y, _z, c) => {
    const r = Math.hypot(x, y) / 0.27;
    c.set(0xffd34a).lerp(new THREE.Color(0xf0642a), Math.min(1, r * 1.1));
  });
  return merge([
    frill.rotateX(-0.25).translate(0, 0.04, -0.02),
    splat(0.15, 0.13, 0.03, 0.045, 0, 0.25, 1),
    splat(-0.17, 0.06, 0.02, 0.04, 0, 0.25, 1),
    splat(0.02, 0.2, 0.0, 0.035, 0, 0.3, 1),
    blob(0.105, 0.085, 0.16, SKIN, 9, 6).translate(0, 0.08, 0.12),
    // нижняя челюсть открыта, в пасти розово, язык
    blob(0.085, 0.03, 0.13, SKIN_DARK, 7, 4).rotateX(0.38).translate(0, -0.005, 0.15),
    blob(0.07, 0.025, 0.1, 0xc8445e, 6, 3).rotateX(0.2).translate(0, 0.025, 0.16),
    colored(new THREE.CapsuleGeometry(0.018, 0.08, 1, 4).rotateX(1.3).translate(0.02, 0.0, 0.24), 0xf07a96),
  ]);
}

/** Хвост назад по −Z, в полоску; начало — у бедра */
function tailGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.1, 0.78, 8, 6, true).rotateX(-Math.PI / 2).translate(0, 0, -0.39);
  return paint(g, (_x, _y, z, c) => {
    c.set(Math.floor(-z / 0.13) % 2 ? SKIN_DARK : SKIN);
  });
}

/** Нога: бедро вперёд, голень назад, три пальца; начало — бедро, подошва на −LEG */
function legGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    colored(new THREE.CapsuleGeometry(0.055, 0.16, 1, 6).rotateX(-0.45).translate(0, -0.1, 0.05), SKIN),
    colored(new THREE.CapsuleGeometry(0.035, 0.18, 1, 5).rotateX(0.5).translate(0, -0.27, 0.05), SKIN),
  ];
  for (const a of [-0.4, 0, 0.4]) parts.push(blob(0.025, 0.022, 0.085, SKIN_DARK, 5, 3).translate(0, 0, 0.06).rotateY(a).translate(0, -LEG + 0.022, 0.0));
  return merge(parts);
}

const _m0 = new THREE.Matrix4();
const legL = newLeg();
const legR = newLeg();

export const RUNNER_LIZARD: MobDef = {
  id: 'runner-lizard',
  name: 'Ящерка-бегунок',
  kinds: [Z_RUNNER],
  weight: 1,
  height: 1.22,
  parts: [
    { bone: 'body', geo: bodyGeo() },
    { bone: 'head', geo: headGeo() },
    { bone: 'head', geo: merge([-1, 1].map((s) => colored(new THREE.SphereGeometry(0.042, 8, 6).translate(s * 0.085, 0.14, 0.13), ARMY.eye))), glow: true },
    { bone: 'tail', geo: tailGeo() },
    { bone: 'legL', geo: legGeo() },
    { bone: 'legR', geo: legGeo() },
  ],
  pose(a: MobAnim, out: MobPose) {
    const seed = a.seed;
    const s = 0.92 + seed * 0.16;
    const w = walkAmount(a.speed, 0.8);
    const run = walkAmount(a.speed, 4);
    // бег: каждая нога ступает раз за период, опора 38 %, между опорами — полёт
    const duty = 0.38;
    const step = stepLen(1, duty, s);
    legAt(a.gait, duty, step, LEG, 0.1, legL);
    legAt(a.gait + 0.5, duty, step, LEG, 0.1, legR);
    const half = (a.gait * 2) % 1;
    const flight = half > duty * 2 ? (half - duty * 2) / (1 - duty * 2) : -1;
    const stanceHip = legL.down ? legL.hip : legR.down ? legR.hip : LEG * Math.cos(Math.asin(Math.min(0.95, step / 2 / LEG)));
    let hipY = HIP + (stanceHip - LEG) * w + (flight >= 0 ? 4 * flight * (1 - flight) * 0.07 * run : 0);
    const ph = a.gait * TAU;
    let lean = 0.25 + 0.55 * run * w;
    let roll = Math.sin(ph) * 0.12 * w;
    let tailYaw = -Math.sin(ph) * 0.35 * w + Math.sin(a.t * 1.4 + seed * 6) * 0.25 * (1 - w);
    let tailPitch = 0.25 - 0.45 * run;
    let headX = -lean * 0.85 + Math.sin(ph * 2) * 0.06 * w;
    let frill = 1;
    let lunge = 0;
    let lx = legL.rx * w;
    let rx = legR.rx * w;
    let lsy = 1 + (legL.sy - 1) * w;
    let rsy = 1 + (legR.sy - 1) * w;
    const look = Math.sin(a.t * 0.8 + seed * 9) * 0.4 * (1 - w);

    if (a.st === ZS_ATTACK) {
      // укус с выпадом: отпрянул, воротник раздулся — рывок вперёд — назад
      const k = a.stT;
      const rear = k < 0.12 ? smooth(k / 0.12) : k < 0.2 ? 1 - smooth((k - 0.12) / 0.08) : 0;
      const bite = k < 0.12 ? 0 : k < 0.2 ? smooth((k - 0.12) / 0.08) : 1 - smooth((k - 0.2) / 0.25);
      lean = 0.25 - 0.35 * rear + 0.75 * bite;
      headX = -lean * 0.7 - 0.3 * rear + 0.2 * bite;
      frill = 1 + 0.35 * rear + 0.2 * bite;
      lunge = 0.18 * bite;
      tailPitch = 0.1 + 0.4 * bite;
      tailYaw = Math.sin(a.stT * 30) * 0.2;
      roll = 0;
      lx = -0.35 * bite;
      rx = 0.3 * bite;
    } else if (a.st === ZS_HOP) {
      lx = rx = -0.8;
      lsy = rsy = 0.8;
      lean = 0.1;
      tailPitch = 0.5;
    }
    const j = jolt(a.hit);
    lean -= 0.35 * j;
    frill += 0.3 * j;

    // гибель: кувырок на спину (крен π вокруг тела), лапами дрыгает, уходит в землю
    const d = a.die;
    const flip = smooth(d / 0.35);
    const sink = smooth((d - 0.6) / 0.4);
    const wiggle = d > 0.3 && d < 0.8 ? Math.sin(d * 60) * 0.5 : 0;
    const air = Math.sin(Math.min(1, d / 0.35) * Math.PI) * 0.35;
    setBone(_m0, 0, (0.45 - 0.2 * flip + air) * s - 0.3 * sink, 0, -flip * 1.2, flip * 0.6, flip * Math.PI, s);
    _m0.multiply(setBone(out.prop, 0, -0.45, 0));

    setChild(out.body, _m0, 0, hipY, lunge, lean, look * 0.3, roll + (seed - 0.5) * 0.1);
    setChildS(out.head, out.body, 0, NECK, 0.03, headX - 0.25 * j, look, (seed - 0.5) * 0.3, frill, frill, 1);
    setChild(out.tail, _m0, 0, hipY - 0.02, lunge - 0.08, tailPitch, tailYaw, 0);
    setChildS(out.legL, _m0, 0.11, hipY, lunge, lx + wiggle * flip, 0, 0, 1, lsy, 1);
    setChildS(out.legR, _m0, -0.11, hipY, lunge, rx - wiggle * flip, 0, 0, 1, rsy, 1);
  },
};
