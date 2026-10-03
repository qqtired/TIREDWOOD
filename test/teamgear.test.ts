// Командный жилет пейнтбола: оболочка лежит на теле, смотрит наружу и не режет вещи из гардероба.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ITEMS } from '../shared/outfit.ts';
import { bodyR } from '../client/render/outfit3d.ts';
import { wearFor as wearOf } from '../client/render/outfitfish.ts';
import { SHELL_ACCS } from '../shared/fishstyle.ts';
import { VEST_Y0, buildVestGeometry, vestRadius, vestTop } from '../client/render/teamgear.ts';

const geo = buildVestGeometry();
const pos = geo.getAttribute('position');
const nor = geo.getAttribute('normal');
const uv = geo.getAttribute('uv');
const index = geo.index!;

test('жилет: оболочка лежит на теле — выше на 1–3,5 см, не внутри и не торчит, края ровные', () => {
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    assert.ok(Number.isFinite(x + y + z), `вершина ${i}`);
    const phi = Math.atan2(x, z);
    assert.ok(y >= VEST_Y0 - 1e-6 && y <= vestTop(phi) + 1e-6, `высота ${y.toFixed(3)} вне жилета`);
    const lift = Math.hypot(x, z) - bodyR(y);
    assert.ok(lift > 0.011 && lift < 0.034, `подушка ${lift.toFixed(4)} м на высоте ${y.toFixed(2)}`);
    const u = uv.getX(i);
    const v = uv.getY(i);
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, 'текстурные координаты');
  }
});

test('жилет: нормали и обход треугольников смотрят наружу, треугольников немного', () => {
  assert.ok(index.count / 3 <= 1000, `треугольников ${index.count / 3}`);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const len = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
    assert.ok(Math.abs(len - 1) < 1e-5, 'нормаль единичной длины');
    // у нижнего края оболочка круто расходится, нормаль там наклонена вниз, но от оси всё равно
    assert.ok((nor.getX(i) * x + nor.getZ(i) * z) / r > 0.5, 'нормаль смотрит от оси');
  }
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const ax = pos.getX(b) - pos.getX(a);
    const ay = pos.getY(b) - pos.getY(a);
    const az = pos.getZ(b) - pos.getZ(a);
    const bx = pos.getX(c) - pos.getX(a);
    const by = pos.getY(c) - pos.getY(a);
    const bz = pos.getZ(c) - pos.getZ(a);
    // нормаль грани = a × b; наружу — значит по направлению от оси
    const fx = ay * bz - az * by;
    const fz = ax * by - ay * bx;
    const mx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const mz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    assert.ok(fx * mx + fz * mz > 0, `треугольник ${t / 3} вывернут внутрь`);
  }
});

test('жилет: сзади выше, чем спереди; спереди ниже бабочки, цепи и медальона (вещей на груди)', () => {
  assert.ok(vestTop(0) > vestTop(Math.PI));
  // нижний край медальона золотой цепи — 0,715, бабочка — от 0,795
  assert.ok(vestTop(Math.PI) <= 0.715, 'жилет не доходит до медальона');
  assert.equal(vestRadius(VEST_Y0 - 0.01, 1), null);
  assert.equal(vestRadius(vestTop(1) + 0.01, 1), null);
  const mid = vestRadius(0.4, 2);
  assert.ok(mid !== null && mid > bodyR(0.4) + 0.02);
});

/** Сколько вершин вещи лежит под жилетом и сколько её треугольников жилет пронзает (часть снаружи, часть внутри). */
function zone(slot: 'h' | 'a' | 'e', key: string): { buried: number; pierce: number; inZone: number } {
  const w = wearOf(slot, key);
  // очки живут в системе лица: узел сдвинут на EYES_Z = −0,4
  const zOff = slot === 'e' ? -0.4 : 0;
  let buried = 0;
  let pierce = 0;
  let inZone = 0;
  for (const g of [w.geo, w.metal]) {
    if (!g) continue;
    const p = g.getAttribute('position');
    const idx = g.index;
    const tris = idx ? idx.count / 3 : p.count / 3;
    for (let t = 0; t < tris; t++) {
      const ds: number[] = [];
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
        const x = p.getX(vi);
        const y = p.getY(vi) + w.y;
        const z = p.getZ(vi) + zOff;
        const outer = vestRadius(y, Math.atan2(x, z));
        if (outer === null) continue;
        const d = Math.hypot(x, z) - outer;
        // The lower-back tail must emerge through the vest once; only its recessed root may do so.
        if (key === 'deviltail' && d < .004) {
          assert.ok(x >= .12 && x < .26 && y > .39 && y < .47 && z > .46 && z < .56,
            'tail intersects vest only at its small lower-back attachment');
          continue;
        }
        ds.push(d);
        inZone++;
        if (d < -0.002) buried++;
      }
      if (ds.some((d) => d < -0.004) && ds.some((d) => d > 0.004)) pierce++;
    }
  }
  return { buried, pierce, inZone };
}

test('жилет не режет наряд: круг и корень хвоста выходят через оболочку, цепочка монокля заправлена под край', () => {
  const touching: string[] = [];
  for (const it of ITEMS) {
    if (it.slot !== 'h' && it.slot !== 'a' && it.slot !== 'e') continue;
    // рыбацкие жилет, куртки, кукан и сачок на время пейнтбола прячутся (avatar.refreshShell)
    if (it.slot === 'a' && SHELL_ACCS.has(it.key)) continue;
    const z = zone(it.slot, it.key);
    if (z.inZone === 0) continue;
    touching.push(it.id);
    if (it.key === 'lifebuoy') {
      assert.ok(z.pierce > 0, 'круг надет поверх жилета: проходит сквозь оболочку');
    } else if (it.key === 'monocle') {
      assert.equal(z.pierce, 0, 'конец цепочки не торчит из жилета');
    } else {
      assert.equal(z.buried, 0, `${it.id}: часть вещи под жилетом`);
      assert.equal(z.pierce, 0, `${it.id}: вещь проходит сквозь жилет`);
    }
  }
  // Корень хвоста проверен отдельно; остальная часть, ранец и шарф — снаружи жилета.
  assert.deepEqual(touching.sort(), ['a:deviltail', 'a:jetpack', 'a:lifebuoy', 'a:scarf', 'e:monocle']);
});
