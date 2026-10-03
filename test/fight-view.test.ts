// Реальный тик удара и видимая фаза должны совпадать; камера не ждёт сглаживания мыши.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FA_GRAB, FA_HEAVY, FA_HOLD, FA_HOOK, FA_JAB, FA_JAB2, FA_NONE, FA_THROW } from '../shared/fight.ts';
import { GATE_FIGHT, buildFightWorld, freshFighter, makeFightEvents, makeFighter, stepFighter } from '../shared/fightsim.ts';
import { BTN_ADS, BTN_FIRE, BTN_USE, makeInput } from '../shared/sim.ts';
import { handsFor } from '../client/fight/hands.ts';
import { assistedFightYaw, fightAvatarVisible, sampleFighterEye } from '../client/fight/presentation.ts';
import { fightVisualBudget, gradeSize } from '../client/fight/quality.ts';
import { FightFists } from '../client/fight/fists.ts';
import { Crowd } from '../client/fight/crowd.ts';

const world = buildFightWorld();

// Сломается, если художник перенесёт полное касание дальше реального события strike/grab.
for (const { act, button, hand, want } of [
  { act: FA_JAB, button: BTN_FIRE, hand: 3, want: [0.08, 1.05, -1.02] },
  { act: FA_JAB2, button: BTN_FIRE, hand: 0, want: [-0.06, 1.06, -1] },
  { act: FA_HOOK, button: BTN_FIRE, hand: 3, want: [-0.06, 1.08, -0.9] },
  { act: FA_HEAVY, button: BTN_ADS, hand: 3, want: [0.04, 1, -1.18] },
  { act: FA_GRAB, button: BTN_USE, hand: 0, want: [-0.46, 1, -0.95] },
]) {
  test(`рука действия ${act} достигает контакта в тот же тик, что серверный strike/grab`, () => {
    const f = makeFighter();
    freshFighter(f, 0, 0, 0);
    const input = makeInput();
    const ev = makeFightEvents();
    // Второй джеб и хук начинаются из отхода предыдущего удара; сам тик проверяет настоящий stepFighter.
    if (act === FA_JAB2) { f.act = FA_JAB; f.actT = 9; }
    if (act === FA_HOOK) { f.act = FA_JAB2; f.actT = 9; }
    input.buttons = button;
    stepFighter(f, input, world, 5, GATE_FIGHT, ev);
    assert.equal(f.act, act);
    input.buttons = 0;
    const out: number[] = [];
    let contacts = 0;
    for (let t = 0; t < 55; t++) {
      stepFighter(f, input, world, 5, GATE_FIGHT, ev);
      if (ev.strike || ev.grab) {
        contacts++;
        handsFor(out, f.act, f.actT, false, false, false, false, 0);
        assert.deepEqual(out.slice(hand, hand + 3), want);
      }
    }
    assert.equal(contacts, 1, 'контакт один, без повторного удара в активной фазе');
  });
}

test('вылет непрерывен до контакта и отход возвращает руку в стойку', () => {
  const out: number[] = [];
  handsFor(out, FA_NONE, 0, false, false, false, false, 0);
  const guard = out.slice(3, 6);
  handsFor(out, FA_JAB, 5.99, false, false, false, false, 0);
  assert.ok(Math.abs(out[5] + 1.02) < 0.001, 'у контакта нет скачка из замаха');
  handsFor(out, FA_JAB, 18, false, false, false, false, 0);
  assert.deepEqual(out.slice(3, 6), guard, 'отход закончен');
});

test('крупные руки от первого лица различают серию, блок, захват и бросок, не уходят за камеру', () => {
  const out: number[] = [];
  const pose = (act: number, t: number, block = false) => {
    handsFor(out, act, t, block, false, false, false, 0, true);
    return [...out];
  };
  const guard = pose(FA_NONE, 0);
  const jab = pose(FA_JAB, 6);
  const jab2 = pose(FA_JAB2, 6);
  assert.ok(jab[5] < guard[5] - 0.4, 'первый джеб правой рукой');
  assert.ok(jab2[2] < guard[2] - 0.4, 'второй джеб левой рукой');
  assert.ok(pose(FA_HOOK, 8)[3] < 0, 'хук пересекает центр');
  assert.ok(pose(FA_NONE, 0, true)[1] > guard[1] + 0.15, 'блок у лица');
  const grab = pose(FA_GRAB, 5);
  assert.ok(grab[2] < -0.9 && grab[5] < -0.9, 'обе руки тянутся к захвату');
  assert.ok(pose(FA_HOLD, 12)[1] > guard[1], 'держит поднятыми руками');
  assert.ok(pose(FA_THROW, 0)[2] < -1, 'бросок начинается выталкиванием обеих рук');
  assert.deepEqual(pose(FA_THROW, 16), guard, 'после броска возвращается стойка');
  for (let t = 0; t <= 50; t += 0.25) {
    const heavy = pose(FA_HEAVY, t);
    assert.ok(heavy[2] < -0.2 && heavy[5] < -0.2, 'тяжёлый замах не проходит сквозь лицо');
  }
});

test('камера стоит в глазах предсказанного бойца и сразу берёт свежий yaw/pitch', () => {
  const eye = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  sampleFighterEye(eye, { x: 2, y: 0.5, z: 3 }, { x: 4, y: 1, z: 7 }, { x: 0.1, y: 0.2, z: 0.3 }, 0.25, 1.2, -0.7);
  assert.ok(Math.abs(eye.x - 2.6) < 1e-12);
  assert.ok(Math.abs(eye.y - 1.995) < 1e-12);
  assert.ok(Math.abs(eye.z - 4.3) < 1e-12);
  assert.equal(eye.yaw, 1.2);
  assert.equal(eye.pitch, -0.7);
  sampleFighterEye(eye, eye, eye, { x: 0, y: 0, z: 0 }, 0, -1.8, 0.8);
  assert.equal(eye.yaw, -1.8, 'разворот не сглаживается до старого курса');
  assert.equal(eye.pitch, 0.8, 'вертикальный обзор тоже прямой');
});

test('соперники видны вплотную к камере; только своё тело скрыто в первом лице', () => {
  assert.equal(fightAvatarVisible(false, true, false, 0), true, 'плотный бой');
  assert.equal(fightAvatarVisible(false, true, false, 0.5), true, 'дистанция удара');
  assert.equal(fightAvatarVisible(true, true, false, 0), false, 'своё тело');
  assert.equal(fightAvatarVisible(true, true, true, 0), true, 'своё тело видно в итогах');
  assert.equal(fightAvatarVisible(false, false, false, 0), false, 'толпа прямо в камере');
  assert.equal(fightAvatarVisible(false, false, false, 5), true, 'толпа дальше');
});

test('настольный прицел сохраняет курс; помощь пальцу ограничена скоростью и кратчайшим поворотом', () => {
  assert.equal(assistedFightYaw(0.4, 1, false, 1 / 60), 0.4);
  const touch = assistedFightYaw(0, 1, true, 1 / 60);
  assert.ok(touch > 0 && touch <= 0.021, `не рывок к цели: ${touch}`);
  const wrap = assistedFightYaw(Math.PI - 0.01, -Math.PI + 0.01, true, 1 / 60);
  assert.ok(wrap > Math.PI - 0.01 && wrap <= Math.PI + 0.01, 'через шов, не полный оборот');
  assert.equal(assistedFightYaw(0.4, 1, true, 0), 0.4, 'без прошедшего времени нет доворота');
});

test('низкое и среднее качество снимают MSAA, уменьшают работу толпы и оставляют графику в лимите устройства', () => {
  const high = fightVisualBudget('high', false, false, 8);
  const medium = fightVisualBudget('medium', false, false, 8);
  const low = fightVisualBudget('low', false, false, 8);
  assert.equal(medium.samples, 0);
  assert.equal(low.samples, 0);
  assert.ok(high.samples > 0 && high.samples <= 2);
  assert.equal(fightVisualBudget('high', false, false, 0).samples, 0, 'без аппаратного MSAA работает');
  assert.ok(low.crowdRows < medium.crowdRows && medium.crowdRows < high.crowdRows);
  assert.ok(low.crowdHz < medium.crowdHz && medium.crowdHz < high.crowdHz);
  assert.ok(low.dust < medium.dust && medium.dust < high.dust);
  const [lw, lh] = gradeSize(2560, 1440, low.scale);
  const [hw, hh] = gradeSize(2560, 1440, high.scale);
  assert.ok(lw * lh <= hw * hh * 0.65, 'низкий пресет уменьшает заполнение кадра');
  assert.deepEqual(gradeSize(0, 0, low.scale), [1, 1], 'свёрнутое окно не создаёт нулевую текстуру');
  assert.equal(fightVisualBudget('auto', true, false, 8).samples, 0, 'авто снижает нагрузку при slow');
  assert.equal(fightVisualBudget('auto', false, true, 8).samples, 0, 'авто на телефоне без MSAA');
});

function handBounds(fists: FightFists, name: string): { min: THREE.Vector3; max: THREE.Vector3; maxZ: number } {
  fists.scene.updateMatrixWorld(true);
  fists.camera.updateMatrixWorld(true);
  const hand = fists.scene.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry>;
  const p = hand.geometry.getAttribute('position');
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  let maxZ = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(hand.matrixWorld);
    maxZ = Math.max(maxZ, v.z);
    v.project(fists.camera);
    min.min(v); max.max(v);
  }
  return { min, max, maxZ };
}

test('реальные кулаки в стойке оставляют центр свободным и занимают не больше трети высоты кадра', () => {
  const fists = new FightFists();
  try {
    fists.update(makeFighter(), 0, 0, 1 / 60, 16 / 9, true);
    for (const name of ['fc-left-fist', 'fc-right-fist']) {
      const b = handBounds(fists, name);
      assert.ok((b.max.y - b.min.y) / 2 <= 0.33, `${name}: высота ${(b.max.y - b.min.y) / 2}`);
      assert.ok(b.max.y < 0, 'стойка под центром обзора');
      assert.ok(b.min.x >= -1 && b.max.x <= 1, 'кулак не срезан сбоку');
    }
  } finally { fists.dispose(); }
});

test('реальный тяжёлый замах виден целиком на телефоне и не пересекает ближнюю плоскость', () => {
  const fists = new FightFists();
  const f = makeFighter();
  f.act = FA_HEAVY;
  try {
    for (let t = 0; t <= 22; t += 0.25) {
      fists.update(f, t, 0, 1 / 60, 393 / 852, true);
      const b = handBounds(fists, 'fc-right-fist');
      assert.ok(b.maxZ < -fists.camera.near, `за ближней плоскостью: ${t}`);
      assert.ok(b.min.x >= -1 && b.max.x <= 1 && b.min.y >= -1 && b.max.y <= 1, `в кадре телефона: ${t}`);
    }
    f.ko = 1;
    fists.update(f, 22, 0, 1 / 60, 393 / 852, true);
    assert.equal(fists.visible, false, 'после нокаута кулаков нет');
    f.ko = 0;
    fists.update(f, 0, 0, 1 / 60, 393 / 852, false);
    assert.equal(fists.visible, false, 'у зрителя и в итогах нет первого лица');
  } finally { fists.dispose(); }
});

test('реальная толпа уменьшает инстансы на низком качестве и сохраняет пустые места живых зрителей', () => {
  const crowd = new Crowd();
  try {
    const visible = (q: 'high' | 'medium' | 'low') => {
      crowd.setQuality(fightVisualBudget(q));
      return (crowd.group.children[0] as THREE.InstancedMesh).count;
    };
    const high = visible('high');
    const medium = visible('medium');
    const low = visible('low');
    assert.ok(low < medium && medium < high);
    crowd.setTaken(1);
    crowd.update(1 / 60, 0, new THREE.Vector3(0, 1.17, 0));
    const first = new THREE.Matrix4();
    (crowd.group.children[0] as THREE.InstancedMesh).getMatrixAt(0, first);
    assert.equal(first.determinant(), 0, 'место 0 занято живым зрителем даже в низком пресете');
  } finally { crowd.dispose(); }
});
