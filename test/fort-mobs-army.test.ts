// Мобы армии (М-1…М-5): пузырь у цели сначала надувается на виду (POP_FUSE_TICKS), и только потом хлопок;
// модели щитоносца, совы и пузыря отыгрывают признаки и надувание по anim.flagT и ZS_ATTACK.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as F from '../shared/fort.ts';
import { DEFAULT_OUTFIT } from '../shared/outfit.ts';
import { FortGame } from '../server/fort/game.ts';
import type { Sink } from '../server/paintball/game.ts';
import { GATE } from '../shared/fortmap.ts';
import { ZF_LIT, ZF_SHIELD } from '../shared/fortnet.ts';
import { ALL_MOBS } from '../client/fort/mobs/index.ts';
import { newPose, type MobAnim } from '../client/fort/mobs/kit.ts';
import * as THREE from 'three';

function setup() {
  const game = new FortGame();
  const sink: Sink = { sendJson() {}, sendBinary() {}, close() {} };
  const p = game.addHuman({ pid: 1, nick: 'Tester7', outfit: DEFAULT_OUTFIT }, sink)!;
  game.phase = F.FT_WAVE;
  return { game, p };
}

function atGate(game: FortGame) {
  const b = game.horde.spawn(F.Z_BLOATER, 1)!;
  Object.assign(b, { x: 0, z: GATE.face - F.Z_GATE_GAP - 0.5, vx: 0, vz: 0 });
  return b;
}

test('М-1: пузырь у ворот надувается 0,6 с на виду, потом лопается', () => {
  const { game } = setup();
  const b = atGate(game);
  let n = 0;
  while (b.alive && b.state !== F.ZS_ATTACK && n++ < 120) game.step();
  assert.equal(b.state, F.ZS_ATTACK, 'дошёл до ворот и надувается');
  assert.ok(b.alive, 'ещё не лопнул');
  const gate = game.gate;
  for (let i = 0; i < F.POP_FUSE_TICKS - 1; i++) game.step();
  assert.ok(b.alive, 'всё ещё надувается');
  assert.equal(game.gate, gate, 'воротам пока не досталось');
  game.step();
  assert.ok(!b.alive, 'хлопок');
  assert.ok(game.gate < gate, 'ворота задело');
});

test('М-1: надутый пузырь можно лопнуть заранее — убийство на счету стрелка', () => {
  const { game, p } = setup();
  const b = atGate(game);
  let n = 0;
  while (b.state !== F.ZS_ATTACK && n++ < 120) game.step();
  game.step();
  game.horde.damage(b, 999, p.id, false, b.x, 1, b.z);
  assert.ok(!b.alive);
  assert.equal(p.kills, 1);
});

const anim = (o: Partial<MobAnim>): MobAnim => ({ t: 3, gait: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: 0.3, rage: false, flags: 0, flagT: 99, stage: 0, path: 0, ...o });
const def = (id: string) => ALL_MOBS.find((d) => d.id === id)!;
const at = (id: string, a: MobAnim, bone: keyof ReturnType<typeof newPose>) => {
  const out = newPose();
  def(id).pose(a, out);
  return new THREE.Vector3().setFromMatrixPosition(out[bone]);
};
const scaleOf = (id: string, a: MobAnim, bone: keyof ReturnType<typeof newPose>) => {
  const out = newPose();
  def(id).pose(a, out);
  return new THREE.Vector3().setFromMatrixScale(out[bone]).x;
};

test('М-1: модель пузыря раздувается за время надувания, гибель — хлопок сразу', () => {
  for (const id of ['bloater-puffer', 'bloater-toad']) {
    const s0 = scaleOf(id, anim({ st: F.ZS_ATTACK, stT: 0 }), 'body');
    const s1 = scaleOf(id, anim({ st: F.ZS_ATTACK, stT: 0.55 }), 'body');
    assert.ok(s1 > s0 * 1.3, `${id}: к концу надувания вдвое толще (${s0.toFixed(2)} → ${s1.toFixed(2)})`);
    assert.ok(scaleOf(id, anim({ die: 0.15 }), 'body') < 0.01, `${id}: после гибели шара уже нет`);
  }
});

test('М-2: щит цел — на месте; разбит — обломки разлетаются и пропадают, щит не висит', () => {
  for (const id of ['shield-turtle', 'shield-beaver']) {
    // щит — две половины (wingL, wingR) вместе
    const held = at(id, anim({ flags: ZF_SHIELD }), 'wingL');
    assert.ok(held.distanceTo(at(id, anim({ flags: ZF_SHIELD }), 'wingR')) < 1e-6, `${id}: щит целый — куски вместе`);
    assert.ok(scaleOf(id, anim({ flags: ZF_SHIELD }), 'wingL') > 0.5, `${id}: щит в руках`);
    assert.ok(scaleOf(id, anim({ flags: 0, flagT: 99 }), 'wingL') < 0.01, `${id}: щита давно нет`);
    const a0 = at(id, anim({ flags: 0, flagT: 0.05 }), 'wingL');
    const a1 = at(id, anim({ flags: 0, flagT: 0.5 }), 'wingL');
    assert.ok(a0.distanceTo(a1) > 0.3, `${id}: обломок летит`);
    assert.ok(scaleOf(id, anim({ flags: 0, flagT: 5 }), 'wingL') < 0.01, `${id}: обломки убраны`);
  }
});

test('М-3: сова поднимает крылья, когда сервер зажёг лечение, и машет вниз на самом лечении', () => {
  const id = 'medic-owl';
  const rest = at(id, anim({}), 'extra');
  const lit = at(id, anim({ flags: ZF_LIT, flagT: 0.4 }), 'extra');
  const out = newPose();
  def(id).pose(anim({ flags: ZF_LIT, flagT: 0.4 }), out);
  assert.ok(new THREE.Vector3().setFromMatrixScale(out.extra).x > 0.5, 'крест горит над головой');
  assert.ok(lit.y > rest.y, 'крест над головой');
  const after = at(id, anim({ flags: 0, flagT: 0.5 }), 'extra');
  assert.ok(after.y > lit.y, 'после лечения крест улетает вверх');
});

/** Опорная группа ног стоит в мире, пока корень идёт вперёд (как у Ткачихи в mobs-f) */
function slideOf(id: string, speed: number, flags: number, bone: 'legL' | 'legR'): { slide: number; path: number } {
  const d = def(id);
  const pose = newPose();
  const dt = 1 / 240;
  let z = 0;
  let gait = 0;
  let path = 0;
  let slide = 0;
  let stance = 0;
  let lastZ = NaN;
  for (let f = 0; f < 240 * 3; f++) {
    z += speed * dt;
    path += speed * dt;
    gait = (gait + (speed * dt) / 1.25) % 1;
    d.pose(anim({ gait, path, speed, t: f * dt, st: F.ZS_WALK, flags }), pose);
    const m = pose[bone].elements;
    const wz = z + m[14];
    if (m[13] < 0.004) {
      if (!Number.isNaN(lastZ)) {
        slide += Math.abs(wz - lastZ);
        stance += speed * dt;
      }
      lastZ = wz;
    } else lastZ = NaN;
  }
  return { slide, path: stance };
}

test('М-4 и М-5: ножки краба и корни Лешего не скользят — опорная группа стоит, пока тело идёт', () => {
  for (const [id, speed, flags] of [['crew-crab', F.ZK[F.Z_WALKER].speed, 8], ['boss-leshy', F.ZK[F.Z_LESHY].speed, 0]] as const) {
    for (const bone of ['legL', 'legR'] as const) {
      const { slide, path } = slideOf(id, speed, flags, bone);
      assert.ok(path > 0.5, `${id}/${bone}: стоит на земле`);
      assert.ok(slide / path < 0.1, `${id}/${bone}: скольжение ${(100 * slide / path).toFixed(0)} % пути опоры`);
    }
  }
});
