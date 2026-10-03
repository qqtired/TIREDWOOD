import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackSignal } from '../client/fort/signals.ts';
import { BOSS_WARN_TICKS, FLY_DIVE_TICKS, FLY_WARN_TICKS, ZS_BOSS_BOMB, ZS_BOSS_OPEN, ZS_FLY_DIVE, ZS_FLY_WARN, ZS_WALK } from '../shared/fort.ts';

test('метка пикирования непрерывна от предупреждения до контакта', () => {
  const start = attackSignal(ZS_FLY_WARN, FLY_WARN_TICKS)!;
  const ready = attackSignal(ZS_FLY_WARN, 0)!;
  const diving = attackSignal(ZS_FLY_DIVE, FLY_DIVE_TICKS)!;
  const hit = attackSignal(ZS_FLY_DIVE, 0)!;
  assert.equal(start.progress, 0);
  assert.equal(ready.progress, diving.progress);
  assert.equal(hit.progress, 1);
  assert.ok(start.radius > 0 && start.radius === hit.radius);
});

test('босс показывает область урона только при подготовке, не во время уязвимости', () => {
  assert.equal(attackSignal(ZS_WALK, 80), null);
  assert.equal(attackSignal(ZS_BOSS_OPEN, 100), null);
  const start = attackSignal(ZS_BOSS_BOMB, BOSS_WARN_TICKS)!;
  const hit = attackSignal(ZS_BOSS_BOMB, -100)!;
  assert.equal(start.progress, 0);
  assert.equal(hit.progress, 1);
  assert.ok(start.radius > 2);
});
