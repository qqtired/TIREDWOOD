import assert from 'node:assert/strict';
import test from 'node:test';
import { compressorMakeup, crowdDuck, KEY_MAX, KEY_WINDOW, VOICE_LIFE, VoicePool, voicePrio, WORLD_MAX } from '../client/voices.ts';

test('мест в мире WORLD_MAX: новый тихий не играет, заметно громче — вытесняет самый слабый (из равных — старший)', () => {
  const p = new VoicePool();
  const stopped: number[] = [];
  for (let i = 0; i < WORLD_MAX; i++) {
    const v = p.admit('', 0.1 + (i === 5 ? -0.05 : 0), true, i * 0.001)!;
    v.end = 10;
    v.stop = () => stopped.push(i);
  }
  assert.equal(p.count(0.05).world, WORLD_MAX);
  assert.equal(p.admit('', 0.055, true, 0.05), null, 'не заметно громче слабейшего — не вытесняет');
  const louder = p.admit('', 0.1, true, 0.05)!;
  assert.ok(louder);
  louder.end = 10;
  assert.deepEqual(stopped, [5], 'вытеснен самый тихий');
  assert.equal(p.admit('', 0.1, true, 0.06), null, 'все равны — новый не играет');
  assert.equal(p.stats.dropped, 2);
  assert.ok(p.admit('', 0.8, true, 0.07));
  assert.deepEqual(stopped, [5, 0], 'из равных — самый старый');
  assert.equal(p.stats.stolen, 2);
  assert.equal(p.count(0.08).world, WORLD_MAX);
  // свои звуки и интерфейс (не в мире) играют всегда
  for (let i = 0; i < 10; i++) assert.ok(p.admit('', 1, false, 0.08));
  assert.equal(p.count(0.08).voices, WORLD_MAX + 10);
  assert.equal(p.stats.peakVoices, WORLD_MAX + 10);
});

test('один и тот же звук — не больше KEY_MAX за KEY_WINDOW; голос живёт VOICE_LIFE или до конца своих нот', () => {
  const p = new VoicePool();
  for (let i = 0; i < KEY_MAX; i++) assert.ok(p.admit('groan', 0.5, true, 1 + i * 0.01));
  assert.equal(p.admit('groan', 0.5, true, 1.05), null);
  assert.ok(p.admit('pop', 0.5, true, 1.05), 'другой ключ — свой счёт');
  assert.ok(p.admit('', 0.5, true, 1.05), 'без ключа — без ограничения частоты');
  assert.equal(p.stats.keyed, 1);
  assert.ok(p.admit('groan', 0.5, true, 1 + KEY_WINDOW + 0.001), 'окно прошло');
  assert.equal(p.count(1.2).voices, 7, 'все семь ещё звучат');
  const long = p.admit('boom', 0.5, true, 1.25)!;
  long.end = 3;
  assert.equal(p.count(1.25 + VOICE_LIFE + 0.2).voices, 1, 'короткие отзвучали, продлённый звучит');
  assert.equal(p.count(3.01).voices, 0);
});

test('тревоги и сигналы: не чаще раза в gap на тип, одинаковые склеиваются; legacy — всё играет, только счёт', () => {
  const p = new VoicePool();
  assert.equal(p.once('horn', 1.5, 10), true);
  assert.equal(p.once('horn', 1.5, 11), false);
  assert.equal(p.once('bell', 1.5, 11), true, 'другой тип — свой счёт');
  assert.equal(p.once('horn', 1.5, 11.6), true);
  assert.equal(p.stats.merged, 1);
  const old = new VoicePool();
  old.off = true;
  for (let i = 0; i < 60; i++) assert.ok(old.admit('groan', 0.01, true, 0));
  assert.equal(old.once('horn', 1.5, 0), true);
  assert.equal(old.once('horn', 1.5, 0.1), true);
  assert.equal(old.count(0).world, 60);
  assert.equal(old.stats.peakWorld, 60);
  assert.equal(old.stats.dropped + old.stats.keyed + old.stats.merged, 0);
});

test('важность — громкость у слушателя (как PannerNode inverse); приглушение под толпу — не ниже −4 дБ', () => {
  assert.equal(voicePrio(2, 3), 1);
  assert.ok(Math.abs(voicePrio(13, 3) - 3 / (3 + 1.15 * 10)) < 1e-9);
  assert.ok(voicePrio(30, 16) > voicePrio(30, 4), 'громкий (пушка) важнее тихого (стон) на том же расстоянии');
  assert.equal(crowdDuck(0), 1);
  assert.equal(crowdDuck(10), 1);
  assert.ok(crowdDuck(16) < 1 && crowdDuck(16) > 0.8);
  assert.equal(crowdDuck(100), 0.63);
  assert.ok(20 * Math.log10(crowdDuck(WORLD_MAX)) >= -4.1);
});

test('автоподъём компрессора: без сжатия — 1; жёсткое колено — 0,6 × (−порог) × (1 − 1/ratio) дБ', () => {
  assert.equal(compressorMakeup(0, 0, 1), 1);
  for (const [thr, ratio] of [[-2, 20], [-6, 20], [-3, 12]] as const) {
    const db = 20 * Math.log10(compressorMakeup(thr, 0, ratio));
    assert.ok(Math.abs(db - 0.6 * -thr * (1 - 1 / ratio)) < 0.02, `${thr}/${ratio}: ${db}`);
  }
  // прежний мягкий компрессор игры (−14 дБ, колено 10, 5:1) поднимает тихое на ~4,6 дБ
  const old = 20 * Math.log10(compressorMakeup(-14, 10, 5));
  assert.ok(old > 4.3 && old < 4.9, String(old));
});
