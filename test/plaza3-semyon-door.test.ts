import assert from 'node:assert/strict';
import test from 'node:test';

test('аудит двери Семёна охватывает торцы стены и не находит значимых наложений', async () => {
  const { auditDoor } = await import(new URL('../tools/plaza3/pack1/semyon-door.mjs', import.meta.url).href);
  const result = auditDoor(new URL('../client/assets/plaza3/pav_semyon.glb', import.meta.url));
  assert.ok(result.candidateTris > 200, 'проверяется вся дверь в обоих материалах, а не только стекло');
  assert.ok(result.candidateMaxY > 2.4 && result.candidateMaxZ > -1.81, 'проверены полная высота и глубина торцов стены за наличниками');
  assert.ok(result.beforeArea < 1e-6, `площадь наложения ${result.beforeArea} м² превышает погрешность Float32`);
});
