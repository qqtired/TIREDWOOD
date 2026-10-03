// Мобы крепости, набор F (fort-bosses): модели новых боссов — Король-Тыква, Ткачиха, Леший. Цвета, бюджет, конечные
// позы во всех их состояниях, рост по хитбоксу, ярость и окно — своими частями, Ткачиха висит на стене (голова над
// бруствером), Леший под землёй (холм на поверхности, торчат кончики рогов), ноги Ткачихи не скользят, поза без new.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_MOBS } from '../client/fort/mobs/index.ts';
import { newPose, type MobAnim, type MobDef, type MobPose } from '../client/fort/mobs/kit.ts';
import { MOBS_F } from '../client/fort/mobs/set-f.ts';
import * as F from '../shared/fort.ts';
import { LS_UNDER_Y, WV_HANG_Y, WV_HANG_Z, ZF_WV_WALL } from '../shared/fortbosses.ts';
import { GATE, PARAPET_H, WALL_H } from '../shared/fortmap.ts';

function anim(over: Partial<MobAnim> = {}): MobAnim {
  return { t: 1.3, gait: 0.4, speed: 0, st: 0, stT: 0.2, hit: 0, die: 0, seed: 0.5, rage: false, flags: 0, stage: 1, ...over };
}

const BY_KIND = new Map<number, MobDef>(MOBS_F.map((d) => [d.kinds[0], d]));
const STATES: Record<number, number[]> = {
  [F.Z_PUMPKIN]: [F.ZS_WALK, F.ZS_BOSS_APPROACH, F.ZS_BOSS_OPEN, F.ZS_PK_SUMMON, F.ZS_PK_ROLL_WARN, F.ZS_PK_ROLL, F.ZS_PK_SPIT],
  [F.Z_WEAVER]: [F.ZS_WALK, F.ZS_BOSS_APPROACH, F.ZS_BOSS_OPEN, F.ZS_WV_CLIMB, F.ZS_WV_HANG, F.ZS_WV_SWEEP, F.ZS_WV_WEB, F.ZS_WV_BROOD, F.ZS_WV_BITE, F.ZS_WV_OVER],
  [F.Z_LESHY]: [F.ZS_WALK, F.ZS_BOSS_APPROACH, F.ZS_BOSS_OPEN, F.ZS_LS_ROOTS, F.ZS_LS_HEAL, F.ZS_LS_SINK, F.ZS_LS_UNDER, F.ZS_LS_RISE],
};

const _box = new THREE.Box3();
const _b = new THREE.Box3();
function bounds(def: MobDef, pose: MobPose, only?: (bone: string) => boolean): THREE.Box3 {
  _box.makeEmpty();
  for (const part of def.parts) {
    if (only && !only(part.bone)) continue;
    if (!part.geo.boundingBox) part.geo.computeBoundingBox();
    _b.copy(part.geo.boundingBox!).applyMatrix4(pose[part.bone]);
    _box.union(_b);
  }
  return _box;
}

/** Видна ли часть: кость не сжата в точку (спрятанные — масштаб 0,02) */
function shown(pose: MobPose, bone: keyof MobPose): boolean {
  return Math.abs(pose[bone].determinant()) > 1e-3;
}

test('набор F: три босса — свои виды, до 6 частей, до 6000 треугольников, цвет у вершин, светятся глаза; в общем списке', () => {
  assert.deepEqual(MOBS_F.map((d) => d.kinds[0]).sort(), [F.Z_PUMPKIN, F.Z_WEAVER, F.Z_LESHY].sort());
  for (const def of MOBS_F) {
    assert.ok(ALL_MOBS.includes(def), `${def.id}: в ALL_MOBS`);
    assert.ok(def.kinds.every((k) => F.isBossKind(k)), `${def.id}: рисует босса`);
    assert.ok(def.parts.length <= 6, `${def.id}: ${def.parts.length} частей`);
    let tris = 0;
    for (const part of def.parts) {
      for (const name of ['position', 'normal', 'color']) assert.ok(part.geo.getAttribute(name), `${def.id}/${part.bone}: есть ${name}`);
      tris += (part.geo.index ? part.geo.index.count : part.geo.getAttribute('position').count) / 3;
    }
    assert.ok(tris <= 6000, `${def.id}: ${tris} треугольников`);
    assert.ok(def.parts.filter((p) => p.glow).length >= 2, `${def.id}: светятся глаза и окно`);
  }
});

test('набор F: позы конечные во всех состояниях, при ударе, ярости, на стене и при гибели; стоит на земле; рост по хитбоксу', () => {
  const pose = newPose();
  for (const def of MOBS_F) {
    const kind = def.kinds[0];
    for (const st of STATES[kind]) {
      for (const stT of [0, 0.1, 0.5, 1.2, 1.62, 1.75, 1.8, 2.6, 4]) {
        for (const [hit, die] of [[0, 0], [1, 0], [0, 0.3], [0, 0.6], [0, 1]]) {
          for (const rage of [false, true]) {
            for (const flags of kind === F.Z_WEAVER ? [0, ZF_WV_WALL] : [0]) {
              def.pose(anim({ st, stT, hit, die, rage, flags, t: stT * 3 + 0.7, gait: (stT * 1.3) % 1, speed: st === F.ZS_WALK ? 2 : 0 }), pose);
              for (const part of def.parts) {
                const m = pose[part.bone];
                assert.ok(m.elements.every(Number.isFinite), `${def.id}/${part.bone}: st ${st} — конечная матрица`);
                assert.ok(Math.abs(m.determinant()) > 1e-9, `${def.id}/${part.bone}: масштаб не ноль`);
              }
            }
          }
        }
      }
    }
    def.pose(anim(), pose);
    const rest = bounds(def, pose);
    const k = F.ZK[kind];
    assert.ok(Math.abs(rest.min.y) < 0.08, `${def.id}: на земле (${rest.min.y.toFixed(3)})`);
    assert.ok(rest.max.y > def.height * 0.9 && rest.max.y < def.height * 1.1, `${def.id}: рост ${def.height} ≈ ${rest.max.y.toFixed(2)}`);
    assert.ok(Math.abs(k.hcy + k.hry - def.height) < 0.75, `${def.id}: хитбокс по росту (${(k.hcy + k.hry).toFixed(2)})`);
    assert.ok(rest.max.y > k.headY && k.headY < k.hcy + k.hry, `${def.id}: голова выше кольца «в голову»`);
    def.pose(anim({ die: 1 }), pose);
    assert.ok(bounds(def, pose).max.y < def.height * 0.45, `${def.id}: к концу гибели ушёл в землю или сплющился`);
  }
});

test('набор F: ярость — своя светящаяся часть только в ярости, окно — только в ZS_BOSS_OPEN', () => {
  const pose = newPose();
  for (const def of MOBS_F) {
    const glow = def.parts.filter((p) => p.glow).map((p) => p.bone);
    const rageBone = 'wingL' as const;
    const openBone = 'extra' as const;
    assert.ok(glow.includes(rageBone) && glow.includes(openBone), `${def.id}: части ярости и окна светятся`);
    def.pose(anim({ st: F.ZS_WALK }), pose);
    assert.ok(!shown(pose, rageBone), `${def.id}: без ярости — спрятана`);
    def.pose(anim({ st: F.ZS_WALK, rage: true }), pose);
    assert.ok(shown(pose, rageBone), `${def.id}: в ярости — видна`);
    if (def.kinds[0] !== F.Z_PUMPKIN) {
      def.pose(anim({ st: F.ZS_WALK }), pose);
      assert.ok(!shown(pose, openBone), `${def.id}: окно закрыто`);
    }
    def.pose(anim({ st: F.ZS_BOSS_OPEN, stT: 1 }), pose);
    assert.ok(shown(pose, openBone), `${def.id}: окно открыто`);
  }
  // Король: ядро в мякоти под крышкой — открыто только когда крышка поднята
  const pk = BY_KIND.get(F.Z_PUMPKIN)!;
  pk.pose(anim({ st: F.ZS_WALK }), pose);
  const closed = pose.head.elements[13] - pose.body.elements[13];
  pk.pose(anim({ st: F.ZS_BOSS_OPEN, stT: 1 }), pose);
  assert.ok(pose.head.elements[13] - pose.body.elements[13] > closed + 0.8, 'крышка поднята над ядром');
});

test('Ткачиха на стене: брюхом к камню, ноги у грани, голова над бруствером; во дворе — стоит', () => {
  const def = BY_KIND.get(F.Z_WEAVER)!;
  const pose = newPose();
  const wallZ = GATE.face - WV_HANG_Z;
  for (const st of [F.ZS_WV_HANG, F.ZS_WV_SWEEP, F.ZS_WV_WEB, F.ZS_WV_BROOD, F.ZS_BOSS_OPEN]) {
    def.pose(anim({ st, stT: 0.4, flags: ZF_WV_WALL }), pose);
    const head = bounds(def, pose, (b) => b === 'head');
    assert.ok(head.max.y + WV_HANG_Y > WALL_H + PARAPET_H, `st ${st}: глаза над бруствером (${(head.max.y + WV_HANG_Y).toFixed(2)})`);
    // хлёст — замах четвёркой ног: задние уходят в камень, это удар, а не стойка
    if (st === F.ZS_WV_SWEEP) continue;
    const legs = bounds(def, pose, (b) => b === 'legL' || b === 'legR');
    assert.ok(Math.abs(legs.max.z - wallZ) < 0.35, `st ${st}: ноги у грани стены (${legs.max.z.toFixed(2)} ≈ ${wallZ.toFixed(2)})`);
    const all = bounds(def, pose);
    assert.ok(all.max.z < wallZ + 0.4, `st ${st}: в стену не входит`);
    assert.ok(all.min.y + WV_HANG_Y > -0.1, `st ${st}: не под землёй`);
  }
  def.pose(anim({ st: F.ZS_BOSS_OPEN, stT: 0.4 }), pose);
  assert.ok(Math.abs(bounds(def, pose).min.y) < 0.12, 'во дворе (без признака) — стоит на земле');
});

test('Леший под землёй: холм корней на поверхности, торчат кончики рогов, остальное — под землёй', () => {
  const def = BY_KIND.get(F.Z_LESHY)!;
  const pose = newPose();
  for (const t of [0.2, 1.1, 2.7]) {
    def.pose(anim({ st: F.ZS_LS_UNDER, stT: t, t }), pose);
    const mound = bounds(def, pose, (b) => b === 'legL');
    assert.ok(mound.max.y + LS_UNDER_Y > 0.1 && mound.max.y + LS_UNDER_Y < 1.2, `холм на поверхности (${(mound.max.y + LS_UNDER_Y).toFixed(2)})`);
    assert.ok(mound.min.y + LS_UNDER_Y < 0.2, 'холм от земли');
    const body = bounds(def, pose, (b) => b === 'body');
    assert.ok(body.max.y + LS_UNDER_Y > 0.2 && body.max.y + LS_UNDER_Y < 1.4, `кончики рогов торчат (${(body.max.y + LS_UNDER_Y).toFixed(2)})`);
    assert.ok(body.min.y + LS_UNDER_Y < -4, 'ствол под землёй');
  }
});

test('Ткачиха: четвёрки ног не скользят — стоящая четвёрка на месте, пока тело идёт', () => {
  const def = BY_KIND.get(F.Z_WEAVER)!;
  const pose = newPose();
  const speed = F.ZK[F.Z_WEAVER].speed;
  const dt = 1 / 240;
  for (const bone of ['legL', 'legR'] as const) {
    let z = 0;
    let gait = 0;
    let slide = 0;
    let path = 0;
    let lastZ = NaN;
    for (let f = 0; f < 240 * 3; f++) {
      z += speed * dt;
      gait = (gait + (speed * dt) / 1.25) % 1;
      def.pose(anim({ gait, speed, t: f * dt, st: F.ZS_WALK }), pose);
      const m = pose[bone].elements;
      const up = m[13];
      const wz = z + m[14];
      if (up < 0.004) {
        if (!Number.isNaN(lastZ)) {
          slide += Math.abs(wz - lastZ);
          path += speed * dt;
        }
        lastZ = wz;
      } else lastZ = NaN;
    }
    assert.ok(path > 0.5, `${bone}: стоит на земле`);
    assert.ok(slide / path < 0.1, `${bone}: скольжение ${(100 * slide / path).toFixed(0)} % пути опоры`);
  }
});

test('набор F: поза без выделений памяти (в pose() нет new)', () => {
  for (const file of ['boss-pumpkin.ts', 'boss-weaver.ts', 'boss-leshy.ts']) {
    const src = fs.readFileSync(new URL(`../client/fort/mobs/${file}`, import.meta.url), 'utf8');
    const start = src.indexOf('  pose(a: MobAnim, out: MobPose)');
    assert.ok(start > 0, `${file}: есть pose`);
    const body = src.slice(start);
    assert.ok(!/\bnew\s/.test(body), `${file}: в pose() есть new`);
  }
});
