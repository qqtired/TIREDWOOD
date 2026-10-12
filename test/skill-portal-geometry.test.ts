import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { SkillPortal } from '../client/skilltest/portal.ts';

test('модель облачной арки не получает вторую процедурную раму и поперечину', () => {
  const scene = new THREE.Scene();
  const portal = new SkillPortal(scene, -7, -25.8, false, false);
  portal.setVisible(true);
  portal.update(1 / 60);
  assert.equal(scene.children.length, 0, 'при готовом павильоне контроллер не рисует старую арку');
  portal.dispose();
});

test('прежняя площадь сохраняет процедурный портал и его раму', () => {
  const scene = new THREE.Scene();
  const portal = new SkillPortal(scene, 1, 2, false);
  portal.setVisible(true);
  assert.equal(scene.children.length, 1);
  const frame = scene.children[0];
  assert.ok(frame.children.some(o => o.position.y === 3.125), 'поперечина нужна прежнему порталу');
  assert.equal(frame.children.length, 6, 'стойки, полосы, поперечина и порог');
  portal.dispose();
  assert.equal(scene.children.length, 0);
});
