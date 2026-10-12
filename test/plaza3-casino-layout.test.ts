import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

process.env.PLAZA3 = '1';
const { PAVILIONS, glbJson, pavAnchors, worldNodes, rootMatrix } = await import('../client/lobby/plaza3/pavdata.ts');
const { P3 } = await import('../shared/plaza3/layout.ts');
const { SLOT_POSES } = await import('../shared/slots.ts');
const { buildLobby } = await import('../shared/maps/lobby.ts');
const { CollisionWorld } = await import('../shared/world.ts');
const { PLAYER_HALF, PLAYER_HEIGHT } = await import('../shared/constants.ts');
const casino = PAVILIONS.find((p) => p.id === 'kursaal')!;
const anchors = pavAnchors(glbJson(readFileSync(new URL(`../client/assets/plaza3/${casino.file}`, import.meta.url))), casino);
const close = (a: number, b: number, label: string) => assert.ok(Math.abs(a - b) < .005, `${label}: ${a} != ${b}`);

test('казино: каждый слот стоит на своём реальном GLB-якоре и смотрит со стены внутрь зала', () => {
  for (const [i, pose] of SLOT_POSES.entries()) {
    const a = anchors.get(`anchor_slot_${i + 1}`)!;
    close(pose.body.x, a.x, `slot${i}: x`);
    close(pose.body.z, a.z, `slot${i}: z`);
    close(Math.cos(pose.body.yaw - a.yaw), 1, `slot${i}: face`);
    close(pose.use.x, a.x - Math.sin(a.yaw) * 1.85, `slot${i}: use x`);
    close(pose.use.z, a.z - Math.cos(a.yaw) * 1.85, `slot${i}: use z`);
    close(Math.cos(pose.use.yaw - a.yaw), -1, `slot${i}: use yaw`);
  }
});

test('казино: поля двух табло совпадают с моделью, лица смотрят в зал', () => {
  const glb = glbJson(readFileSync(new URL(`../client/assets/plaza3/${casino.file}`, import.meta.url)));
  const nodes = worldNodes(glb, rootMatrix(casino));
  for (const key of ['jackpot', 'losers'] as const) {
    const m = nodes.find((n) => n.name === `anchor_${key}_face`)!.m;
    const field = P3.modes.casinoBoards[key];
    close(field.x, m[12], `${key}: x`); close(field.y, m[13], `${key}: y`); close(field.z, m[14], `${key}: z`);
    close(Math.cos(field.yaw - Math.atan2(m[8], m[10])), 1, `${key}: face`);
  }
  assert.ok(Math.sin(P3.modes.casinoBoards.jackpot.yaw) > .99, 'джекпот на западной стене смотрит внутрь');
  assert.ok(Math.cos(P3.modes.casinoBoards.losers.yaw) > .99, 'рейтинг на северной стене смотрит внутрь');
});

test('казино: от галереи и южной двери есть проход, перед всеми одиннадцатью автоматами можно стоять', () => {
  const map = buildLobby(), world = new CollisionWorld(map);
  const free = (x: number, z: number) => !world.overlaps(x - PLAYER_HALF, .06, z - PLAYER_HALF, x + PLAYER_HALF, PLAYER_HEIGHT, z + PLAYER_HALF);
  const path = (x0: number, z0: number, x1: number, z1: number) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .15);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, z = z0 + (z1 - z0) * i / steps;
      assert.ok(free(x, z), `проход (${x.toFixed(2)}; ${z.toFixed(2)})`);
    }
  };
  path(casino.x - 7, casino.z - 7.5, casino.x, casino.z - 7.5);
  path(casino.x + 1.1, casino.z + 11.5, casino.x + 1.1, casino.z + 7.8);
  for (const use of map.interact.filter((p) => p.kind === 'slot' || p.kind === 'arcade')) assert.ok(free(use.x, use.z), `${use.kind} ${use.arg}: точка E свободна`);
  // Полная ширина игрока .84 м: проход севернее казино, под аркой и дальше к калитке.
  for (const [a, b] of [
    [[50, -17], [55, -17]], [[55, -17], [53, -21.5]], [[53, -21.5], [57, -22.5]], [[57, -22.5], [60.1, -23.3]],
    [[43.8, 2], [43.8, 13]], [[46, 12.85], [50, 12.85]],
  ]) path(a[0], a[1], b[0], b[1]);
});

test('казино: сервер открывает все пять слотов и шесть аркад по финальным точкам E', async () => {
  const { setupHub, login, placeAt, steps, lastOf } = await import('./kit.ts');
  const { ACT_SLOT } = await import('../shared/lobby.ts');
  const { hub, clock } = setupHub();
  const actor = login(hub, 'TesterCasino3');
  for (const p of buildLobby().interact.filter((p) => p.kind === 'slot' || p.kind === 'arcade')) {
    placeAt(hub, actor.c, p.x, p.z); clock.now += 1100;
    hub.onJson(actor.c, { t: 'use', id: p.id }); steps(hub, 2);
    if (p.kind === 'slot') {
      const who = hub.lobby.playerOf(actor.c)!;
      assert.equal(who.action, ACT_SLOT); assert.equal(who.arg, p.arg);
      close(who.state.x, p.x, 'сервер slot x'); close(who.state.z, p.z, 'сервер slot z');
      hub.onJson(actor.c, { t: 'unuse' });
    } else {
      assert.equal(lastOf(actor.s, 'arcOpen')?.cab, p.arg);
      hub.onJson(actor.c, { t: 'arc', a: 'close' });
    }
  }
});

test('кафе: реальные модели между верандой и бильярдом не пересекаются, Тоня следует окну', async () => {
  const bounds = new Map<string, { all: THREE.Box3; low: THREE.Box3 }>();
  for (const id of ['cafe', 'cardveranda', 'billiards']) {
    const p = PAVILIONS.find((p) => p.id === id)!;
    const bytes = readFileSync(new URL(`../client/assets/plaza3/${p.file}`, import.meta.url));
    const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    scene.position.set(p.x, p.y ?? 0, p.z); scene.rotation.y = p.yaw; scene.updateMatrixWorld(true);
    const all = new THREE.Box3(), low = new THREE.Box3(), point = new THREE.Vector3();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      all.union(new THREE.Box3().setFromObject(mesh));
      const a = mesh.geometry.getAttribute('position');
      for (let i = 0; i < a.count; i++) { point.fromBufferAttribute(a, i).applyMatrix4(mesh.matrixWorld); if (point.y < 2.3) low.expandByPoint(point); }
    });
    bounds.set(id, { all, low });
  }
  const cafe = bounds.get('cafe')!, cards = bounds.get('cardveranda')!, billiards = bounds.get('billiards')!;
  assert.ok(cafe.low.min.z - cards.low.max.z > 2.7, 'проход от карточной веранды');
  assert.ok(billiards.low.min.z - cafe.low.max.z > 1.2, 'проход к бильярду');
  assert.ok(billiards.all.min.z - cafe.all.max.z > .4, 'крыши раздельны');
  const place = PAVILIONS.find((p) => p.id === 'cafe')!;
  const barista = pavAnchors(glbJson(readFileSync(new URL(`../client/assets/plaza3/${place.file}`, import.meta.url))), place).get('anchor_barista')!;
  const npc = P3.npcs.find((n) => n.id === 'cafe')!;
  close(npc.x, barista.x, 'Тоня x'); close(npc.z, barista.z, 'Тоня z');
});

test('казино: корпуса и экраны аркады восстанавливаются из точек E на реальные GLB-якоря', () => {
  for (const [i, use] of P3.arcade.entries()) {
    const a = anchors.get(`anchor_arcade_${i + 1}`)!;
    close(use.x - Math.sin(use.yaw) * 1.25, a.x, `arcade${i}: body x`);
    close(use.z - Math.cos(use.yaw) * 1.25, a.z, `arcade${i}: body z`);
    close(Math.cos(use.yaw - a.yaw), -1, `arcade${i}: face`);
  }
});
