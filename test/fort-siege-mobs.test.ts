// Осадные мобы М-6…М-12 (31.10): стопа не скользит при шаге MOB_STRIDE, нужные клипы есть, игра выбирает
// правильный клип по состоянию осады, поднятые на стену летят в позе прыжка.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bakeFortModel } from '../client/fort/approved/bake.ts';
import { ApprovedMobRenderer, APPROVED_ASSETS } from '../client/fort/approved/renderer.ts';
import { Zombies3D } from '../client/fort/zombies3d.ts';
import { SiegePhaseClock } from '../client/fort/approved/phase-clock.ts';
import { MOB_STRIDE, type MobAnim } from '../client/fort/mobs/kit.ts';
import { Z_CANOPY, Z_ROPECRAB, Z_SPRING, Z_JAMPUMP, Z_FOREMAN, Z_MILLER, Z_SIEGE_TOWER, ZS_BOARD, ZS_SIEGE_ACTION, ZS_SIEGE_OPEN } from '../shared/fortsiege.ts';
import { Z_CLIMBER, Z_WALKER, ZS_ATTACK, ZS_DROP, ZS_HOP } from '../shared/fort.ts';

const REDONE = [Z_ROPECRAB, Z_JAMPUMP, Z_CANOPY, Z_FOREMAN, Z_MILLER, Z_SIEGE_TOWER, Z_SPRING];
const FEET: Record<string, string[]> = {
  ropecrab: ['footL0', 'footL1', 'footL2', 'footR0', 'footR1', 'footR2'], jampump: ['footL', 'footR'], canopy: ['footL', 'footR'],
  foreman: ['footL', 'footR'], miller: ['footL', 'footR'], spring: ['footL', 'footR'],
};
const NEEDS: Record<string, string[]> = {
  ropecrab: ['idle', 'walk', 'windup', 'attack', 'route_attach', 'reel', 'open', 'hit', 'death'],
  jampump: ['idle', 'walk', 'windup', 'attack', 'open', 'hit', 'death'],
  canopy: ['idle', 'walk', 'walk_folded', 'windup', 'attack', 'canopy_break', 'cover_disabled', 'hit', 'death'],
  foreman: ['idle', 'walk', 'device_set', 'windup', 'attack', 'open', 'hit', 'death'],
  miller: ['idle', 'walk', 'deploy', 'crank', 'gust', 'open', 'hit', 'death'],
  siegetower: ['idle', 'walk', 'deploy', 'attack', 'hit', 'death'],
  spring: ['idle', 'walk', 'deploy', 'attack', 'open', 'hit', 'death'],
};

async function load(kind: number) {
  const spec = APPROVED_ASSETS.find((a) => a.kind === kind)!;
  const bytes = readFileSync(new URL(spec.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { spec, gltf };
}

test('every redone siege model has its clips, stays in budget and plants its feet over one MOB_STRIDE', async () => {
  for (const kind of REDONE) {
    const { spec, gltf } = await load(kind);
    const names = gltf.animations.map((c) => c.name.slice(spec.id.length + 1));
    for (const need of NEEDS[spec.id]) assert(names.includes(need), `${spec.id}: clip ${need}`);
    const baked = bakeFortModel(gltf, spec.id);
    assert(baked.triangles <= (kind === Z_MILLER || kind === Z_SIEGE_TOWER ? 6000 : 4400), `${spec.id}: ${baked.triangles} triangles`);
    const feet = FEET[spec.id];
    if (!feet) continue;
    // В клипе с корнем, идущим вперёд: опорная стопа в мире стоит на месте (рисует игра без смещения корня).
    const clip = gltf.animations.find((c) => c.name === spec.id + '_walk')!;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip); action.reset().setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const root = gltf.scene.getObjectByName(spec.id)!;
    const sample = (t: number) => { mixer.setTime(t); gltf.scene.updateMatrixWorld(true); return { root: root.position.clone(), feet: feet.map((f) => gltf.scene.getObjectByName(spec.id + '_' + f)!.getWorldPosition(new THREE.Vector3())) }; };
    const a = sample(0), b = sample(clip.duration);
    assert(Math.abs(b.root.distanceTo(a.root) - MOB_STRIDE) < .02, `${spec.id}: walk clip covers ${b.root.distanceTo(a.root).toFixed(3)} m, game expects ${MOB_STRIDE}`);
    let planted = 0, slide = 0;
    let prev = sample(0);
    for (let f = 1; f <= 24; f++) {
      const cur = sample(f / 24 * clip.duration);
      cur.feet.forEach((p, i) => {
        const q = prev.feet[i];
        if (p.y - a.feet[i].y < .012 && q.y - a.feet[i].y < .012) { planted++; slide = Math.max(slide, Math.hypot(p.x - q.x, p.z - q.z)); }
      });
      prev = cur;
    }
    assert(planted >= feet.length * 6, `${spec.id}: feet must actually stand on the ground (${planted})`);
    assert(slide < .015, `${spec.id}: planted foot slides ${slide.toFixed(3)} m per frame`);
  }
});

function anim(over: Partial<MobAnim>): MobAnim {
  return { t: 3, gait: .25, path: 0, speed: 0, st: 0, stT: 0, hit: 0, die: 0, seed: .5, rage: false, flags: 0, stage: 0, ...over };
}

test('siege state picks the authored clip in game: canopy walks, ropecrab reels, spring and tower react to each boarding', async () => {
  const slots = new Map();
  for (const kind of [Z_CANOPY, Z_ROPECRAB, Z_SPRING]) {
    const { spec, gltf } = await load(kind);
    const baked = bakeFortModel(gltf, spec.id);
    slots.set(kind, { id: spec.id, baked, mesh: new THREE.InstancedMesh(baked.geo, new THREE.MeshStandardMaterial(), 4), n: 0,
      anim: new THREE.InstancedBufferAttribute(new Float32Array(16), 4), tint: new THREE.InstancedBufferAttribute(new Float32Array(16), 4), target: new THREE.InstancedBufferAttribute(new Float32Array(16), 4) });
  }
  const r = Object.assign(Object.create(ApprovedMobRenderer.prototype), { slots }) as ApprovedMobRenderer;
  const clipOf = (kind: number, a: MobAnim) => {
    const s = slots.get(kind); s.n = 0; r.add(kind, new THREE.Matrix4(), a, 0, null, 0);
    const row = (s.anim.array as Float32Array)[0];
    return Object.entries(s.baked.clips as Record<string, { start: number; frames: number }>).find(([, c]) => row >= c.start && row < c.start + c.frames)![0];
  };
  assert.equal(clipOf(Z_CANOPY, anim({ st: ZS_SIEGE_ACTION, speed: 2.6 })), 'walk', 'canopy in its cover state still walks with steps');
  assert.equal(clipOf(Z_CANOPY, anim({ st: ZS_SIEGE_ACTION })), 'idle');
  assert.equal(clipOf(Z_CANOPY, anim({ st: ZS_SIEGE_OPEN, stT: .5 })), 'canopy_break');
  assert.equal(clipOf(Z_CANOPY, anim({ st: ZS_SIEGE_OPEN, stT: 2, speed: 2.6 })), 'walk_folded');
  assert.equal(clipOf(Z_CANOPY, anim({ st: ZS_ATTACK, stT: .1 })), 'attack');
  assert.equal(clipOf(Z_ROPECRAB, anim({ st: ZS_SIEGE_ACTION, stT: 5 })), 'reel');
  assert.equal(clipOf(Z_SPRING, anim({ st: ZS_SIEGE_ACTION, stT: 5, atkT: .05 })), 'attack');
  const fling = (slots.get(Z_SPRING).anim.array as Float32Array)[0] - slots.get(Z_SPRING).baked.clips.attack.start;
  assert(fling < 3, 'spring flings right at the boarding, not on a free-running loop');
});

test('boarded passengers fly in the jump pose, canopy gate hits come from the attack counter', () => {
  const phases = new SiegePhaseClock();
  const zombies = Object.assign(Object.create(Zombies3D.prototype), { siegePhases: phases, renderTick: 220 });
  const track = (kind: number, over = {}) => ({ id: 9, kind, firstAt: -1, lastSt: -1, stAt: 0, lastWind: 0, gait: .3, path: 0, speed: 6, back: false, atkT: 9, lastAtk: -1, jolt: 0, dead: false, lastFlags: -1, flagsAt: -99, anim: {}, ...over });
  const snap = (st: number) => ({ st, wind: 0, flags: 0, stage: 0 });
  let a = zombies.animOf(track(Z_WALKER), snap(ZS_BOARD), 900);
  assert.equal(a.st, ZS_HOP); assert.equal(a.speed, 0, 'no walking in the air');
  a = zombies.animOf(track(Z_CLIMBER), snap(ZS_BOARD), 900);
  assert.equal(a.st, ZS_DROP);
  a = zombies.animOf(track(Z_CANOPY, { lastAtk: 3, atkT: .2 }), snap(ZS_SIEGE_ACTION), 900);
  assert.equal(a.st, ZS_ATTACK); assert.equal(a.stT, .2);
  a = zombies.animOf(track(Z_CANOPY, { lastAtk: 3, atkT: 2 }), snap(ZS_SIEGE_ACTION), 900);
  assert.equal(a.st, ZS_SIEGE_ACTION);
});
