// Физическая версия принятой башни: 185 м, 6 витков, 18 участков.
// Каждая видимая опора строится клиентом из этих прямоугольников; GLB даёт архитектуру и формы механизмов.
import type { MapBox, Vec3 } from './maps/types.ts';
import type { SkillBox, SkillCheckpoint, SkillCloud, SkillDisc, SkillLink, SkillLook, SkillMap, SkillMover, SkillPad, SkillRam, SkillRect, SkillSack, SkillStep, SkillTarget, SkillUpdraft, SkillWind } from './skillmap.ts';
import { RAM_PERIOD } from './skilltraps.ts';

export const CLOUD_TOWER_HEIGHTS = [0, 8, 20, 30, 42, 52, 60, 70, 82, 90, 101, 110, 120, 132, 142, 150, 163, 175, 185] as const;
export const CLOUD_TOWER_RADIUS = 13;
export const CLOUD_TOWER_TOP = 185;
const ARC = Math.PI * 2 / 3;
const round = (v: number): number => Math.round(v * 1e6) / 1e6;
export function towerPoint(section: number, u: number, y: number, radius = CLOUD_TOWER_RADIUS): Vec3 {
  const a = (section + u) * ARC;
  return [round(-Math.sin(a) * radius), y, round(Math.cos(a) * radius)];
}

export function makeCloudTowerMap(): SkillMap {
  const boxes: MapBox[] = [], pads: SkillPad[] = [], movers: SkillMover[] = [], clouds: SkillCloud[] = [], steps: SkillStep[] = [];
  const checkpoints: SkillCheckpoint[] = [], links: SkillLink[] = [], sacks: SkillSack[] = [], rams: SkillRam[] = [];
  const winds: SkillWind[] = [], shelters: SkillBox[] = [], updrafts: SkillUpdraft[] = [];
  const boxesOfCore: number[] = [];
  const addBox = (lo: Vec3, hi: Vec3): number => { boxes.push({ min: lo, max: hi, mat: 'deck', color: 0xffffff }); return boxes.length - 1; };
  const rect = (p: Vec3, w = 2.65, d = w): SkillRect => ({ x0: p[0] - w / 2, x1: p[0] + w / 2, z0: p[2] - d / 2, z1: p[2] + d / 2, y: p[1] });
  const center = (r: SkillRect): Vec3 => [(r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2];
  const pad = (r: SkillRect, sec: number, look: SkillLook = 'deck', h = .4, bounce?: number): SkillRect => {
    pads.push({ box: addBox([r.x0, r.y - h, r.z0], [r.x1, r.y, r.z1]), sec, look, ...(bounce ? { bounce } : {}) }); return r;
  };
  const join = (from: SkillRect, to: SkillTarget, sec: number, how: SkillLink['how'] = 'walk', opt: Partial<SkillLink> = {}): void => {
    const p = center(from); links.push({ name: `${sec + 1}: переход ${links.length + 1}`, x: p[0], y: p[1], z: p[2], to, how, ...opt });
  };
  const mover = (sec: number, look: SkillLook, p: Vec3, d: Vec3, phase = 0, bounce?: number): number => {
    const i = movers.length;
    movers.push({ box: addBox([0, 0, 0], [0, 0, 0]), sec, look, kind: 'line', w: 2.8, d: 2.8, h: .4,
      x: p[0], y: p[1], z: p[2], dx: d[0], dy: d[1], dz: d[2], r: 0, period: 0, phase: 0,
      sched: { rest: 100, go: 240, stay: 100, back: 240, phase }, ...(bounce ? { bounce } : {}) }); return i;
  };
  // Корпус принятого GLB: отдельные пояса и круглые террасы. Полосы дают выпуклый силуэт с погрешностью < 0,12 м.
  const discBoxes = (radius: number, y0: number, y1: number, sec: number, look: SkillLook, n = 32): number[] => {
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const z0 = -radius + 2 * radius * i / n, z1 = -radius + 2 * radius * (i + 1) / n;
      const near = Math.min(Math.abs(z0), Math.abs(z1));
      const x = Math.sqrt(Math.max(0, radius * radius - near * near));
      const b = addBox([-x, y0, z0], [x, y1, z1]); ids.push(b); pads.push({ box: b, look, sec });
    }
    return ids;
  };
  for (let belt = 0; belt < 6; belt++) {
    const top = belt === 5 ? 185 : (belt + 1) * 30;
    boxesOfCore.push(...discBoxes(7.6 - belt * .44, belt * 30 - .01, top, belt * 3, 'tower'));
    boxesOfCore.push(...discBoxes(9.15, top - .44, top, Math.min(17, belt * 3 + 2), 'belfry'));
    // Верёвочный борт террасы: игрок может перепрыгнуть его, но не пройти насквозь.
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI * 2 / 32, b = (k + 1) * Math.PI * 2 / 32;
      const x0 = Math.cos(a) * 8.95, z0 = Math.sin(a) * 8.95, x1 = Math.cos(b) * 8.95, z1 = Math.sin(b) * 8.95;
      pads.push({ box: addBox([Math.min(x0, x1) - .045, top, Math.min(z0, z1) - .045], [Math.max(x0, x1) + .045, top + .9, Math.max(z0, z1) + .045]), look: 'post', sec: Math.min(17, belt * 3 + 2) });
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, x = Math.sin(a) * 5, z = Math.cos(a) * 5;
    pads.push({ box: addBox([x - .2, 185, z - .2], [x + .2, 191, z + .2]), look: 'post', sec: 17 });
  }
  // Чекпоинт до каждого испытания — достаточно большой, чтобы ждать цикл, не закрывая траекторию механизма.
  for (let sec = 0; sec < 18; sec++) {
    const p = towerPoint(sec, 0, CLOUD_TOWER_HEIGHTS[sec]);
    const r = pad(rect(p, sec === 0 ? 7 : 3.6), sec, sec === 0 ? 'start' : 'cp', .6);
    pads.at(-1)!.cp = sec;
    const q = towerPoint(sec, .1, p[1]);
    checkpoints.push({ ...r, px: p[0], pz: p[2], yaw: Math.atan2(p[0] - q[0], p[2] - q[2]), kill: p[1] - 6, sec });
  }
  let disc: SkillDisc = { cx: 1000, cz: 1000, top: 95, r: 2.5, period: 840, boxes: [] };
  const carousels: NonNullable<SkillMap['carousels']> = [];
  let stairLength = 0;
  const gallery = rect(towerPoint(17, 1, CLOUD_TOWER_TOP), 5);
  pad(gallery, 17, 'pier', .6);

  for (let sec = 0; sec < 18; sec++) {
    const lo = CLOUD_TOWER_HEIGHTS[sec], hi = CLOUD_TOWER_HEIGHTS[sec + 1];
    const end: SkillRect = sec === 17 ? gallery : checkpoints[sec + 1];
    let last: SkillRect = checkpoints[sec];
    const p = (u: number, y: number, radius?: number): Vec3 => towerPoint(sec, u, y, radius);
    const next = (u: number, y: number, width = 2.65, look: SkillLook = 'deck', how: SkillLink['how'] = 'walk'): SkillRect => {
      const r = pad(rect(p(u, y), width), sec, look); join(last, r, sec, how); last = r; return r;
    };
    // Колесо на северной стороне: по X/Y, нижний и верхний причалы сбоку, ничто не входит в оболочку.
    if (sec === 1) {
      for (let k = 1; k <= 5; k++) next(k * .08, lo);
      const cx = 0, cz = -17.5, cy = (lo + hi) / 2;
      const ids: number[] = [];
      for (let k = 0; k < 4; k++) {
        ids.push(movers.length);
        movers.push({ box: addBox([0, 0, 0], [0, 0, 0]), sec, look: 'gondola', kind: 'orbit', w: 2.8, d: 2.8, h: .4,
          x: cx, y: cy, z: cz, dx: 0, dy: 0, dz: 0, sched: { rest: 0, go: 1, stay: 0, back: 1, phase: 0 }, r: 6, period: 840, phase: k * 210 });
      }
      const approach = pad(rect([cx - 6.5, lo, -14.4], 2.5, 2.2), sec, 'pier'); join(last, approach, sec, 'jump');
      const low = pad(rect([cx - 6.5, lo, cz], 3), sec, 'pier'); join(approach, low, sec, 'walk');
      const upper = pad(rect([cx + 7, hi, cz], 3), sec, 'pier');
      join(low, { movers: ids }, sec, 'jump', { at: [0, 10, 20, 30, 50, 70] });
      links.push({ name: '2: люлька → верхний причал', x: 0, y: 0, z: 0, from: ids[0], to: upper, how: 'jump', at: [450, 470, 490, 510] });
      last = upper;
      const exit = pad(rect([cx + 6.5, hi, -14.4], 2.5, 2.2), sec, 'pier'); join(last, exit, sec); last = exit;
      next(.72, hi, 3.2, 'pier', 'walk');
      for (let k = 1; k <= 3; k++) next(.72 + k * .066, hi);
      join(last, end, sec); continue;
    }
    // Воздушные корзины: одинаковая высота в начале и конце. Пересекающиеся направления разнесены на 6 м.
    if (sec === 11 || sec === 14) {
      for (let k = 1; k <= 5; k++) next(k * .075, lo);
      const low = p(.40, lo, 16), upper = p(.60, hi, 16);
      const dock0 = pad(rect(low, 3.4), sec, 'pier'); join(last, dock0, sec);
      const dock1 = pad(rect(upper, 3.4), sec, 'pier');
      // На дуге корзина идёт вертикально у внешнего края, её борт не заходит под причал.
      const a = p(.5, lo, 17.8), z = p(.5, hi, 17.8);
      const mi = mover(sec, 'basket', a, [0, hi - lo, 0]);
      join(dock0, { movers: [mi] }, sec, 'jump', { at: [0, 30, 60] });
      links.push({ name: `${sec + 1}: шар → причал`, x: 0, y: 0, z: 0, from: mi, to: dock1, how: 'jump', at: [340, 370, 400] });
      if (sec === 11) {
        const alt = mover(sec, 'basket', p(.5, lo, 23.8), [0, hi - lo, 0], 340);
        // Вторая корзина доступна с продолжения двух причалов, пути шаров никогда не пересекаются.
        const d0 = pad(rect(p(.40, lo, 21.2), 3.4), sec, 'pier');
        const d1 = pad(rect(p(.60, hi, 21.2), 3.4), sec, 'pier');
        join(dock0, d0, sec, 'jump', { alt: true });
        join(d0, { movers: [alt] }, sec, 'jump', { alt: true, at: [340, 380, 410] });
        links.push({ name: '12: вторая корзина → причал', x: 0, y: 0, z: 0, from: alt, to: d1, how: 'jump', at: [0, 30, 60], alt: true });
        join(d1, dock1, sec, 'jump', { alt: true });
      }
      last = dock1; for (let k = 1; k <= 5; k++) next(.625 + k * .06, hi); join(last, end, sec); void z; continue;
    }
    // Два управляемых подброса: подъём 6 м с запасом над посадкой; сначала вверх, затем правка вбок.
    if (sec === 7 || sec === 12) {
      for (let k = 1; k <= 4; k++) next(k * .07, lo);
      for (let k = 0; k < 2; k++) {
        const u = .35 + k * .28, y = lo + k * 6;
        const springPos = p(u, y, 15.8);
        let mi: number | undefined;
        if (sec === 7 && k === 0) {
          mi = mover(sec, 'cart', springPos, [1.4, 0, 0], 0, 18.2);
          movers[mi].sched = { rest: 120, go: 180, stay: 120, back: 180, phase: 0 };
          join(last, { movers: [mi] }, sec, 'jump', { at: [0, 20, 60] });
        } else pad(rect(springPos, 2.8), sec, 'mushroom', .35, 18.2);
        const landing = pad(rect(p(u + .11, y + 6, 15.8), 3.8), sec);
        if (mi !== undefined) links.push({ name: `${sec + 1}: тележка → посадка`, x: 0, y: 0, z: 0, from: mi, to: landing, how: 'bounce', at: [0, 30] });
        else join(last, landing, sec, 'bounce', { via: [springPos[0], springPos[2]] });
        last = landing;
      }
      for (let k = 1; k <= 3; k++) next(.78 + k * .05, hi); join(last, end, sec); continue;
    }
    if (sec === 8) {
      for (let k = 1; k <= 5; k++) next(k * .075, lo);
      const v = p(.46, lo, 15.2), land = p(.56, hi, 15.2);
      const foot = pad(rect(v, 3.4), sec, 'pocket'); join(last, foot, sec);
      updrafts.push({ x: v[0], z: v[2], r: 1.6, y0: lo - .3, y1: hi + 1.2, vmax: 7 });
      const top = pad(rect(land, 3.4), sec, 'pier'); join(foot, top, sec, 'lift', { via: [v[0], v[2]] });
      last = top; for (let k = 1; k <= 5; k++) next(.625 + k * .06, hi); join(last, end, sec); continue;
    }
    if (sec === 4 || sec === 10) {
      const n = hi - lo;
      for (let k = 1; k <= n; k++) {
        const r = rect(p(k / (n + 1), lo + k), 2.65);
        const phase = (k - 1) * 54;
        clouds.push({ box: addBox([r.x0, r.y - .7, r.z0], [r.x1, r.y, r.z1]), sec, phase, rect: r });
        join(last, r, sec, 'jump', { at: [phase + 10, phase + 30], flow: k > 1 }); last = r;
      }
      join(last, end, sec, 'jump', { at: [n * 54 + 10], flow: true });
      if (sec === 10) {
        const q = center(clouds[clouds.length - 3].rect);
        sacks.push({ px: q[0], py: q[1] + 6.8, pz: q[2], len: 6, amp: .80, period: 252, phase: 80, axis: 'x', r: .65, sec });
      }
      continue;
    }
    if (sec === 15) {
      // Двадцать шесть шагов +0,5 м. Обвал бежит по длине дуги, начальные четыре опоры постоянны.
      for (let k = 1; k <= 25; k++) {
        const q: Vec3 = k <= 10 ? [-k * 1.3, lo + k * .5, 13] : [-13, lo + k * .5, 13 - (k - 10) * (19.5 / 16)];
        const r = rect(q, k <= 10 ? 1.3 : 2.4, k <= 10 ? 2.4 : 19.5 / 16);
        const at = (k - 1) * 1.05 + .5;
        steps.push({ box: addBox([r.x0, r.y - .45, r.z0], [r.x1, r.y, r.z1]), s: at, corner: k % 6 === 1, rect: r });
        join(last, r, sec, 'walk', { flow: k > 1 }); last = r;
      }
      stairLength = 28; join(last, end, sec, 'walk', { flow: true }); continue;
    }
    if (sec === 9) {
      for (let k = 1; k <= 4; k++) next(k * .1, lo + k, 2.1, 'stair', 'jump');
      const rotor = (x: number, z: number, direction: 1 | -1): void => {
        const floor = pad(rect([x, 95, z], 3.8), sec, 'disc');
        const d: SkillDisc = { cx: x, cz: z, top: 95, r: 1.9, period: 840, dir: direction, boxes: [pads.at(-1)!.box] };
        const bar = { y0: 95.2, y1: 95.85, len: 1.2, r: .16, period: 240, dir: (direction === 1 ? -1 : 1) as 1 | -1 };
        carousels.push({ disc: d, bar, bumpers: [] }); if (carousels.length === 1) disc = d;
        const entry = rect([x + 1.35, 95, z + 1.35], .9), exit = rect([x - 1.35, 95, z - 1.35], .9);
        join(last, entry, sec, 'jump'); join(entry, exit, sec, 'jump', { flow: true }); last = exit; void floor;
      };
      rotor(-13.85, 8, 1);
      const bridge = pad(rect([-17.2, 95, 6], 3), sec, 'pocket'); join(last, bridge, sec, 'jump'); last = bridge;
      rotor(-20, 2, -1);
      const exit = pad(rect([-20, 95, -1.7], 2.6), sec, 'pocket'); join(last, exit, sec, 'jump'); last = exit;
      for (const [i, q] of [[-20, -4], [-19, -7], [-16.5, -9], [-13.5, -10], [-11, -9]].entries()) {
        const r = pad(rect([q[0], 96 + i, q[1]], 2.1), sec, 'stair'); join(last, r, sec, 'jump'); last = r;
      }
      join(last, end, sec, 'jump'); continue;
    }
    // Основные лестничные участки. Более высокие ступени и пропуски требуют прыжка; карманы позволяют ждать.
    const n = hi - lo;
    const platformByStep = new Map<number, SkillRect>();
    for (let k = 1; k < n; k++) {
      const width = sec === 5 ? 1.8 : 2.1;
      const r = next(k / n, lo + k, width, k % 4 === 0 ? 'pocket' : 'stair', 'jump');
      platformByStep.set(k, r);
    }
    join(last, end, sec, hi - last.y > .55 ? 'jump' : 'walk');
    const trapSteps = [Math.floor(n * .24), Math.floor(n * .52), Math.floor(n * .78)].map(k => platformByStep.has(k) ? k : k + 1);
    if (sec === 2 || sec === 5) for (const [i, k] of trapSteps.entries()) {
      const r = platformByStep.get(k); if (!r) continue;
      const q = center(r); const axis = Math.abs(q[0]) > Math.abs(q[2]) ? 'x' : 'z';
      sacks.push({ px: q[0], py: q[1] + 6.9, pz: q[2], len: 6, amp: .85, period: sec === 5 ? 228 : 252, phase: i * 78, axis, r: .72, sec });
    }
    if (sec === 3 || sec === 13) for (const [i, k] of trapSteps.entries()) {
      const r = platformByStep.get(k); if (!r) continue;
      const q = center(r); const alongX = Math.abs(q[0]) > Math.abs(q[2]);
      const dx = alongX ? Math.sign(q[0]) : 0, dz = alongX ? 0 : Math.sign(q[2]);
      rams.push({ fx: q[0] - dx * 2.6, fz: q[2] - dz * 2.6, dx, dz, w: 1.25, y0: q[1] + .2, y1: q[1] + 1.4, stroke: 4.4, phase: i % 2 ? RAM_PERIOD / 2 : 0, sec });
      const ram = rams.at(-1)!, hx = ram.fx - dx * .5, hz = ram.fz - dz * .5;
      pads.push({ box: addBox([hx - (dx ? .4 : .8), q[1] + .05, hz - (dz ? .4 : .8)], [hx + (dx ? .4 : .8), q[1] + 1.55, hz + (dz ? .4 : .8)]), look: 'housing', sec });
    }
    if (sec === 6 || sec === 16) {
      for (let k = 2; k < n - 1; k++) {
        const r = platformByStep.get(k); if (!r) continue;
        const q = center(r); const l = Math.hypot(q[0], q[2]);
        winds.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: r.y - .1, y1: r.y + 2, dx: q[0] / l, dz: q[2] / l, phase: sec === 6 ? 0 : 70, sec });
        if (k % 5 === 2) shelters.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: r.y - .1, y1: r.y + 2.6 });
      }
    }
  }
  const b = center(gallery);
  for (const m of movers) if (m.look === 'gondola' || m.look === 'basket') {
    const w = m.w / 2, d = m.d / 2, e = .055;
    const outlines: Array<[Vec3, Vec3]> = [
      [[-w, 0, -d], [w, .89, -d + e]], [[-w, 0, d - e], [w, .89, d]],
      [[-w, 0, -d], [-w + e, .89, d]], [[w - e, 0, -d], [w, .89, d]],
    ];
    m.bodies = outlines.map(([min, max]) => ({ box: addBox([...min], [...max]), min, max }));
  }
  const bell: SkillBox = { x0: b[0] - .9, x1: b[0] + .9, z0: b[2] - .9, z1: b[2] + .9, y0: 186.8, y1: 189.0 };
  join(gallery, { bell: true }, 17, 'jump');
  const start = checkpoints[0];
  const slots = [0, 1, 2, 3, 4].map(i => ({ x: (i - 2) * 1.25, y: 0, z: 13.4, yaw: start.yaw }));
  return { name: 'Выше облаков · 185 метров', boxes, pads, movers, clouds, steps, disc, carousels, sacks, rams,
    bar: carousels[0].bar, bumpers: [],
    winds, shelters, updrafts, checkpoints, bell, gallery, start, slots, links, stairLength,
    spawns: [{ x: start.px, y: start.y, z: start.pz, yaw: start.yaw, team: 0 }],
    trampolines: [], pickups: [], deco: [], bounds: { minX: -45, maxX: 45, minZ: -45, maxZ: 45 } };
}
