// Образец для стенда: «Мешок-прыгун» — проверить стенд, пока в наборах нет моделей (?mob=sample). В игру не идёт.
// Показывает договор целиком: кости, светящиеся глаза, прыжок от gait, удар от stT, вздрагивание от hit, гибель от die.
import * as THREE from 'three';
import { ARMY, colored, merge, setBoneS, setChild, type MobAnim, type MobDef, type MobPose } from '../../client/fort/mobs/kit.ts';
import { ZS_ATTACK } from '../../shared/fort.ts';
import { Z_WALKER } from '../../shared/fortkinds.ts';

const V = (x: number, y: number) => new THREE.Vector2(x, y);

const body = merge([
  colored(new THREE.LatheGeometry([V(0, 0), V(0.3, 0.04), V(0.38, 0.4), V(0.3, 0.86), V(0.12, 0.98), V(0, 1)], 16), 0xc9a46a),
  colored(new THREE.TorusGeometry(0.15, 0.035, 6, 14).rotateX(Math.PI / 2).translate(0, 0.94, 0), 0x7a5232),
  colored(new THREE.SphereGeometry(0.12, 8, 6).scale(1, 0.7, 0.35).translate(0.14, 0.42, 0.33), ARMY.jam),
  colored(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 1.4, 0.35).translate(-0.18, 0.62, 0.3), ARMY.jamLight),
]);
const head = colored(new THREE.SphereGeometry(0.25, 16, 12), 0xd8b47a);
const eyes = merge([-1, 1].map((s) => colored(new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.1, 0.5).translate(s * 0.1, 0.03, 0.225), ARMY.eye)));
const arm = colored(new THREE.CapsuleGeometry(0.06, 0.36, 4, 8).translate(0, -0.22, 0), 0xb8925a);

export const SAMPLE: MobDef = {
  id: 'sample-sack',
  name: 'Мешок-прыгун (образец стенда)',
  kinds: [Z_WALKER],
  height: 1.55,
  parts: [
    { bone: 'body', geo: body },
    { bone: 'head', geo: head },
    { bone: 'extra', geo: eyes, glow: true },
    { bone: 'armL', geo: arm },
    { bone: 'armR', geo: arm },
  ],
  pose(a: MobAnim, out: MobPose) {
    const s = 0.92 + a.seed * 0.16;
    const walk = Math.min(1, a.speed / 1.5);
    // один прыжок на период походки: в воздухе 60 % периода, на земле — приседает
    const ph = a.gait;
    const air = ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI) : 0;
    const squash = ph >= 0.6 ? Math.sin(((ph - 0.6) / 0.4) * Math.PI) : 0;
    const hop = air * 0.28 * walk;
    const breathe = Math.sin(a.t * 2 + a.seed * 9) * 0.015;
    let lean = 0.1 * walk - a.hit * 0.35;
    // руки: поворот вокруг X со знаком минус поднимает их вперёд (модель смотрит по +Z)
    let arms = 0.3 + air * 0.5 * walk;
    if (a.st === ZS_ATTACK) {
      // замах вверх к 0,15 с, удар вниз к 0,25 с, потом руки опускаются
      const st = a.stT;
      arms = st < 0.15 ? 0.3 + (st / 0.15) * 2.6 : st < 0.25 ? 2.9 - ((st - 0.15) / 0.1) * 2.1 : 0.8 - Math.min(1, (st - 0.25) / 0.3) * 0.5;
      lean += st > 0.15 && st < 0.4 ? 0.3 : 0;
    }
    const fall = Math.min(1, a.die * 1.8);
    const sink = Math.max(0, a.die - 0.5) / 0.5;
    const sy = s * (1 - squash * 0.12 * walk + breathe) * (1 - sink * 0.7);
    const sxz = s * (1 + squash * 0.08 * walk) * (1 - sink * 0.7);
    setBoneS(out.body, 0, hop - sink * 0.3, 0, -lean - fall * 1.45, 0, 0, sxz, sy, sxz);
    setChild(out.head, out.body, 0, 1.12, 0, -a.hit * 0.4, Math.sin(a.t * 0.7 + a.seed * 5) * 0.25, 0);
    out.extra.copy(out.head);
    setChild(out.armL, out.body, 0.36, 0.7, 0.05, -arms, 0, 0.35);
    setChild(out.armR, out.body, -0.36, 0.7, 0.05, -arms, 0, -0.35);
  },
};
