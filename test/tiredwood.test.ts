// Надпись TIREDWOOD на горе (выпуск 6): шрифт, раскладка по склону с колеса, подъём холма за буквами, пустое место под
// ними, склеенные меши, взгляд при посадке в колесо.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WHEEL } from '../shared/wheel.ts';
import { HILL_BEARING, LETTER_H, SIGN_BEARING, SIGN_WORD, Tiredwood, WHEEL_VIEW, glyph, layoutSign, signHill, signHillK, wordWidth, type Ground } from '../client/lobby/tiredwood.ts';

/** Холм вокруг колеса: земля поднимается на 0,08 м с каждым метром, плюс бугры — как у настоящего склона */
const hill: Ground = (x, z) => 0.08 * Math.hypot(x - WHEEL.x, z - WHEEL.z) + 5 * Math.sin(x / 70) + 4 * Math.cos(z / 90);

/**
 * Земля города — копия формул landY из client/lobby/world.ts (он тянет статую и в Node не загружается): склон от воды,
 * купол за городом, бугры и подъём за надписью. Поменяли рельеф там — поменять и здесь.
 */
function land(x: number, z: number): number {
  const depth = Math.max(Math.min(x - 30, 22 - z), Math.min(-26 - z, x + 30));
  if (depth < 0) return -3.2;
  const ramp = Math.min(1, Math.max(0, (depth - 150) / 350));
  const dome = 34 * Math.sin(x * 0.006 + 0.4) * Math.cos(z * 0.0045 - 0.3) * ramp;
  const wob = 5 * Math.sin(x * 0.011 + 1.3) * Math.sin(z * 0.014 - 0.7) * Math.min(1, Math.max(0, (depth - 60) / 120));
  return -0.6 + Math.max(0, Math.max(0, depth - 70) * 0.1 + dome + signHill(x, z) + wob);
}

/** Азимут (от севера к востоку, рад) и расстояние от колеса до точки */
function fromWheel(x: number, z: number): { b: number; d: number } {
  return { b: Math.atan2(x - WHEEL.x, WHEEL.z - z), d: Math.hypot(x - WHEEL.x, z - WHEEL.z) };
}

/** Точка на луче с колеса под азимутом b на расстоянии d, смещённая поперёк луча на s (вправо) */
function onRay(b: number, d: number, s = 0): [number, number] {
  return [WHEEL.x + Math.sin(b) * d + Math.cos(b) * s, WHEEL.z - Math.cos(b) * d + Math.sin(b) * s];
}

/** Наименьшее и наибольшее значение атрибута меша */
function range(m: THREE.Mesh, name: string): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of m.geometry.getAttribute(name).array) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

test('надпись: шрифт — у каждой буквы слова контур внутри клетки, от низа до верха, опоры под буквой', () => {
  assert.equal(SIGN_WORD, 'TIREDWOOD');
  for (const ch of SIGN_WORD) {
    const g = glyph(ch);
    assert.ok(g.w > 0.2 && g.w <= 1, `${ch}: ширина ${g.w}`);
    assert.ok(g.parts.length > 0 && g.feet.length > 0, `${ch}: нет частей или опор`);
    let bottom = Infinity;
    let top = -Infinity;
    for (const p of g.parts) {
      for (const [x, y] of [...p.outer, ...(p.holes ?? []).flat()]) {
        assert.ok(x > -1e-9 && x < g.w + 1e-9 && y > -1e-9 && y < 1 + 1e-9, `${ch}: точка (${x}, ${y}) вне клетки`);
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
    }
    assert.ok(Math.abs(bottom) < 1e-9 && Math.abs(top - 1) < 1e-9, `${ch}: стоит на низу клетки и достаёт до верха`);
    for (const f of g.feet) assert.ok(f > 0 && f < g.w, `${ch}: опора ${f} вне буквы`);
  }
  assert.throws(() => glyph('Q'), /нет буквы/);
});

test('надпись: ширина строки — девять букв и восемь просветов', () => {
  const letters = [...SIGN_WORD].reduce((sum, ch) => sum + glyph(ch).w, 0);
  const gap = (wordWidth() - letters) / (SIGN_WORD.length - 1);
  assert.ok(gap > 0.1 && gap < 0.3, `просвет между буквами ${gap} высот`);
  assert.ok(wordWidth() > 5 && wordWidth() < 10, 'строка в 5–10 раз шире высоты букв, как у HOLLYWOOD');
});

test('надпись: буквы идут слева направо, с колеса — по углу зрения, не наползая друг на друга', () => {
  const row = layoutSign(hill);
  assert.equal(row.map((l) => l.ch).join(''), SIGN_WORD);
  let prevRight = NaN;
  let first = NaN;
  row.forEach((l, i) => {
    const { b, d } = fromWheel(l.x, l.z);
    const half = Math.atan2(l.w / 2, d);
    assert.ok(Math.abs(b - SIGN_BEARING) < 0.45, `${l.ch}: далеко от середины надписи (${b} рад)`);
    if (i === 0) first = b - half;
    else {
      const gap = b - half - prevRight;
      assert.ok(gap > 0.004, `${l.ch}${i}: просвет до соседа ${gap} рад — наползают`);
      assert.ok(gap < 0.03, `${l.ch}${i}: просвет до соседа ${gap} рад — слово рассыпалось`);
    }
    prevRight = b + half;
  });
  assert.ok(prevRight - first < (45 * Math.PI) / 180, 'всё слово — в одном кадре камеры с колеса');
  assert.ok(Math.abs((first + prevRight) / 2 - SIGN_BEARING) < 0.03, 'середина слова — на азимуте SIGN_BEARING');
});

test('надпись: каждая буква лицом к колесу, на своей высоте, плита над землёй и чуть откинута назад', () => {
  const row = layoutSign(hill);
  for (const l of row) {
    assert.equal(l.w, glyph(l.ch).w * LETTER_H);
    let dyaw = l.yaw - Math.atan2(WHEEL.x - l.x, WHEEL.z - l.z);
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    assert.ok(Math.abs(dyaw) < 0.06, `${l.ch}: лицо отвёрнуто от колеса на ${dyaw} рад`);
    assert.ok(l.lean > 0 && l.lean < 0.06, `${l.ch}: наклон ${l.lean}`);
    assert.ok(l.lift >= 0.05 * LETTER_H - 1e-9 && l.lift <= 0.12 * LETTER_H + 1e-9, `${l.ch}: плита приподнята на ${l.lift} м`);
    // вдоль плиты земля нигде не поднимается выше её низа
    for (let k = -2; k <= 2; k++) {
      const lx = (k / 4) * l.w;
      const ground = hill(l.x + lx * Math.cos(l.yaw), l.z - lx * Math.sin(l.yaw));
      assert.ok(l.y >= ground + l.lift - 1e-6, `${l.ch}: плита в земле на ${ground - l.y} м`);
    }
  }
  assert.ok(new Set(row.map((l) => l.lean)).size === row.length, 'стоят вразнобой: у каждой свой наклон');
  assert.ok(new Set(row.map((l) => Math.round(l.y * 10))).size > 5, 'и на разной высоте');
});

test('надпись: раскладка повторяется от запуска к запуску и не ломается на плоской земле', () => {
  assert.deepEqual(layoutSign(hill), layoutSign(hill));
  const flat = layoutSign(() => 0);
  assert.equal(flat.length, SIGN_WORD.length);
  for (const l of flat) for (const v of [l.x, l.y, l.z, l.yaw, l.lean, l.w, l.lift]) assert.ok(Number.isFinite(v), `${l.ch}: ${v}`);
});

test('холм за надписью: у города и колеса ровно ноль, дальше вдоль луча растёт до гребня, поперёк — колоколом', () => {
  assert.equal(signHillK(0, 0), 0, 'на площади');
  assert.equal(signHillK(WHEEL.x, WHEEL.z), 0, 'у колеса');
  assert.equal(signHill(...onRay(SIGN_BEARING, 300)), 0, 'в 300 м от колеса подъёма ещё нет');
  assert.equal(signHill(...onRay(SIGN_BEARING + Math.PI, 700)), 0, 'позади колеса — тоже');
  // вдоль оси подъёма: не убывает, к гребню — полная добавка (а на луче с колеса на надпись, чуть сбоку, — почти полная)
  let prev = -1;
  for (let d = 0; d <= 1400; d += 50) {
    const k = signHillK(...onRay(HILL_BEARING, d));
    assert.ok(k >= prev - 1e-12 && k >= 0 && k <= 1, `d=${d}: k=${k} не растёт`);
    prev = k;
  }
  assert.ok(prev > 0.999, 'дальше 800 м — гребень');
  assert.ok(signHillK(...onRay(SIGN_BEARING, 1000)) > 0.95, 'за надписью — почти гребень');
  assert.ok(signHill(...onRay(HILL_BEARING, 1000)) > 85 && signHill(...onRay(HILL_BEARING, 1000)) <= 90 + 1e-9, 'гребень выше прежнего холма метров на 90');
  // там, где стоят буквы (500–570 м), подъём уже заметный, но не гребень
  const mid = signHillK(...onRay(SIGN_BEARING, 540));
  assert.ok(mid > 0.1 && mid < 0.5, `у букв подъём ${mid}`);
  // поперёк оси подъёма: симметричен и затухает
  const side = signHillK(...onRay(HILL_BEARING, 1000, 700));
  assert.ok(Math.abs(side - signHillK(...onRay(HILL_BEARING, 1000, -700))) < 1e-12, 'справа и слева одинаково');
  assert.ok(side < signHillK(...onRay(HILL_BEARING, 1000)) && side > 0.3, 'сбоку ниже, но гора широкая');
  assert.ok(signHillK(...onRay(HILL_BEARING, 1000, 2500)) < 0.01, 'далеко сбоку подъёма нет');
});

test('надпись: с верха колеса за буквами зелёный склон, а не небо — верх букв ниже гребня, буквы в 500–570 м', () => {
  const eye = 16.5;
  const row = layoutSign(land);
  let covered = 0;
  let share = 0;
  for (const l of row) {
    const { b, d } = fromWheel(l.x, l.z);
    const base = Math.atan((l.y - eye) / d);
    const top = Math.atan((l.y + LETTER_H - eye) / d);
    // гребень за буквой: самый большой угол земли дальше неё по тому же азимуту (земля города кончается на x = 1100, z = −1006)
    let sky = -Infinity;
    for (let r = d + 8; r < 1450; r += 6) {
      const [x, z] = onRay(b, r);
      if (x > 1100 || z < -1006) break;
      sky = Math.max(sky, Math.atan((land(x, z) - eye) / r));
    }
    if (sky >= top) covered++;
    share += Math.min(1, Math.max(0, (sky - base) / (top - base)));
    assert.ok(d > 480 && d < 600, `${l.ch}: ${d} м от колеса`);
  }
  assert.ok(covered >= 6, `целиком на фоне склона ${covered} букв из ${row.length}`);
  assert.ok(share / row.length > 0.9, `в среднем на фоне склона ${share / row.length} высоты букв`);
});

test('надпись: под буквами и за ними место занято (дома и деревья не лезут), вдали и на площади свободно', () => {
  const sign = new Tiredwood(hill);
  assert.equal(sign.letters.length, SIGN_WORD.length);
  for (const l of sign.letters) {
    const [fx, fz] = [Math.sin(l.yaw), Math.cos(l.yaw)];
    assert.ok(sign.blocks(l.x, l.z), `${l.ch}: под самой буквой`);
    assert.ok(sign.blocks(l.x - fx * 20, l.z - fz * 20), `${l.ch}: сзади, где стоят раскосы`);
    assert.ok(!sign.blocks(l.x + fx * 200, l.z + fz * 200), `${l.ch}: впереди, к колесу, свободно`);
  }
  assert.ok(!sign.blocks(WHEEL.x, WHEEL.z), 'у колеса');
  assert.ok(!sign.blocks(0, 0), 'на площади');
  // справа от последней буквы: свободно, а с запасом — уже занято
  const last = sign.letters[sign.letters.length - 1];
  const rx = last.x + (last.w / 2 + 2) * Math.cos(last.yaw);
  const rz = last.z - (last.w / 2 + 2) * Math.sin(last.yaw);
  assert.ok(!sign.blocks(rx, rz), 'в двух метрах от края — свободно');
  assert.ok(sign.blocks(rx, rz, 4), 'с запасом 4 м — занято');
});

test('надпись: склеена в два меша без теней и текстур — белые буквы без освещения и тумана, тёмные опоры, дёшево', () => {
  const scene = new THREE.Scene();
  let wrapped = 0;
  const sign = new Tiredwood(hill);
  const meshes = sign.build(scene, (m) => {
    wrapped++;
    return m;
  });
  assert.equal(meshes.length, 2);
  assert.equal(scene.children.length, 2, 'в сцену — только эти два меша');
  assert.equal(wrapped, 2, 'оба материала проходят через общую дымку дождя');
  let tris = 0;
  for (const m of meshes) {
    assert.equal(m.castShadow, false);
    assert.equal(m.receiveShadow, false);
    const mat = m.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
    assert.ok(!Array.isArray(mat) && mat.vertexColors, 'цвета вершин');
    assert.equal(mat.fog, false, 'туман даль не выбеливает');
    assert.equal(m.geometry.getAttribute('uv'), undefined, 'без текстурных координат');
    const [lo, hi] = range(m, 'position');
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi), 'координаты конечные');
    tris += m.geometry.getAttribute('position').count / 3;
  }
  assert.ok(tris > 500 && tris < 3000, `треугольников ${tris}`);
  const [letters, posts] = meshes;
  // буквы: непрозрачный белый без освещения и тонмаппинга — не кремовый и не серый
  const white = letters.material;
  assert.ok(white instanceof THREE.MeshBasicMaterial, 'буквы не освещаются');
  assert.equal(white.toneMapped, false);
  assert.equal(white.transparent, false);
  assert.equal(white.opacity, 1);
  const [faceLo, faceHi] = range(letters, 'color');
  assert.equal(faceHi, 1, 'лицо букв чисто белое');
  assert.ok(faceLo >= 0.45 && faceLo < 0.9, `торцы и боковые грани светло-серые (${faceLo})`);
  // опоры — Lambert, тёмные
  assert.ok(posts.material instanceof THREE.MeshLambertMaterial);
  assert.ok(range(posts, 'color')[1] < 0.3, 'опоры тёмные');
  // опоры уходят в землю глубже низа любой плиты, а буквы — в полную высоту
  const lowest = Math.min(...sign.letters.map((l) => l.y));
  const highest = Math.max(...sign.letters.map((l) => l.y));
  assert.ok(range(posts, 'position')[0] < lowest - 3, 'стойки врыты в склон');
  letters.geometry.computeBoundingBox();
  const box = letters.geometry.boundingBox;
  assert.ok(box !== null && box.max.y - box.min.y >= LETTER_H + (highest - lowest) - 1, 'высота букв');
});

test('колесо: при посадке взгляд на надпись со сдвигом на восток — желейка и крыша кабинки её не закрывают', () => {
  const view = -WHEEL_VIEW.yaw;
  const shift = view - SIGN_BEARING;
  assert.ok(shift > (20 * Math.PI) / 180 && shift < (35 * Math.PI) / 180, `сдвиг взгляда ${shift} рад`);
  assert.ok(WHEEL_VIEW.pitch > 0 && WHEEL_VIEW.pitch < 0.3, 'чуть вверх');
  // вся строка слева от желейки: правый край надписи левее середины кадра на 8° и больше, левый — в кадре (95° по горизонтали)
  const row = layoutSign(land);
  const bearings = row.map((l) => {
    const { b, d } = fromWheel(l.x, l.z);
    return [b - Math.atan2(l.w / 2, d), b + Math.atan2(l.w / 2, d)];
  });
  const left = view - bearings[0][0];
  const right = view - bearings[bearings.length - 1][1];
  assert.ok(right > (8 * Math.PI) / 180, `последняя буква в ${right} рад от середины кадра`);
  assert.ok(left < (47 * Math.PI) / 180, `первая буква выходит за кадр (${left} рад)`);
});
