// Прототип «Блинчики»: плоский камешек по воде, шкала силы, считаются блинчики.
import type { Group, Vector3 } from 'three';
import { COLOR, jelly, pier, ripple, scene, trophyBadge } from '../art.ts';
import type { Experiment } from '../types.ts';

export const skipStones: Experiment = {
  id: 'skip-stones',
  n: 6,
  title: 'Блинчики',
  category: 'world',
  size: 'S',
  pitch: 'Плоский камешек по воде: целишься, отпускаешь, считаются «блинчики». Рекорд дня на табличке.',
  fun: 'Затягивает «ещё разок», мирное соревнование; зрители с мостков комментируют бросок.',
  art: () =>
    scene('sea', 'Желейка запускает по морю плоский камень, он оставляет круги на воде', [
      pier(0, 150, 96),
      jelly({ x: 52, y: 148, c: 'sky', hat: 'cap', face: 'cheer', arms: 'wave', s: 0.78 }),
      `<g fill="${COLOR.gray}" stroke="#7b8791" stroke-width="1.5"><ellipse cx="104" cy="134" rx="7" ry="3"/><ellipse cx="146" cy="128" rx="6" ry="2.6"/><ellipse cx="188" cy="130" rx="5" ry="2.2"/></g>`,
      `<path d="M104 134Q124 112 146 128Q160 116 188 130" stroke="${COLOR.ink}" stroke-width="2" fill="none" stroke-dasharray="3 6" opacity=".4"/>`,
      ripple(146, 138, 16), ripple(188, 140, 12), ripple(224, 142, 9), ripple(254, 143, 6),
      trophyBadge(240, 44, '7 блинчиков!', 108),
    ]),
  live: {
    cta: 'Бросить камешек',
    hint: 'Зажми «Бросить»: шкала разгоняется и качается. Отпусти в зелёной зоне, и камень проскачет дальше всего.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      // камера сбоку: бросающий слева, цепочка кругов уходит вправо
      const d = kit.diorama({ cam: [5.6, 2.6, 6.8], look: [8.4, -1.0, 0.2], radius: 6, fov: 56 });
      const W = kit.WATER;
      const DX = Math.cos(-0.05);
      const DZ = Math.sin(-0.05);

      const thrower = d.jelly({ name: 'Ты', x: 4.5, z: -0.1, outfit: { c: 9, h: 'cap' } });
      thrower.face(thrower.pos.x + DX * 10, thrower.pos.z + DZ * 10);
      const score = d.badge(10.4, 1.5, -0.5, 3.6);

      // буйки в море: глубина кадра и праздничный вид
      const buoys: Array<{ g: Group; ph: number }> = [];
      for (const [x, z] of [[11.5, -2.8], [15.5, -3.6], [20, -3]] as const) {
        const g = new THREE.Group();
        d.ball(0.3, 0xff5a4e, g, 14).position.y = 0.05;
        d.cyl(0.04, 0.05, 0.9, 0xf4efe4, g, 8).position.y = 0.6;
        d.box(0.36, 0.2, 0.03, 0xffd23f, g).position.set(0.2, 0.95, 0);
        g.position.set(x, W + 0.1, z);
        d.scene.add(g);
        buoys.push({ g, ph: x });
      }

      // камень: плоский светлый «блин»
      const stone = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8), d.mat(0xf1ead8, { rough: 0.8 }));
      stone.scale.set(1, 0.36, 1);
      d.scene.add(stone);

      // положение точки в осях желейки (+z — назад, x — вправо) в мире
      const hand = (lx: number, ly: number, lz: number): Vector3 => {
        const c = Math.cos(thrower.yaw);
        const s = Math.sin(thrower.yaw);
        return new THREE.Vector3(thrower.pos.x + c * lx + s * lz, thrower.pos.y + ly, thrower.pos.z - s * lx + c * lz);
      };
      const setHand = (z: number, y: number): void => {
        thrower.avatar.hands = [-0.3, 0.7, -0.1, 0.46, y, z];
        stone.position.copy(hand(0.46, y + 0.1, z - 0.05));
      };

      type Leg = { len: number; dur: number; h: number };
      /** Одинаковая сила — одинаковый бросок: эту функцию потом можно перенести на сервер. */
      const plan = (p: number): { n: number; legs: Leg[] } => {
        const n = Math.round(11 * Math.exp(-(((p - 0.74) / 0.16) ** 2)));
        const legs: Leg[] = [{ len: 2.8 + 1.4 * p, dur: 0.6, h: 0.45 + 0.5 * p }];
        let len = 1.1 + 0.5 * p;
        let dur = 0.4;
        let h = 0.25 + 0.65 * p;
        for (let i = 0; i < n; i++) {
          legs.push({ len, dur, h });
          len *= 0.82;
          dur = Math.max(0.13, dur * 0.88);
          h *= 0.7;
        }
        return { n, legs };
      };

      const meter = ui.meter('Сила');
      meter.zone(0.62, 0.86);
      const lastStat = ui.stat('Блинчики', '—');
      let record = 0;
      try {
        record = Number(localStorage.getItem('lab.skip.record')) || 0;
      } catch {
        // без памяти
      }
      const recStat = ui.stat('Рекорд', record ? String(record) : '—');

      let phase: 'idle' | 'charge' | 'swing' | 'flight' | 'after' = 'idle';
      let chargeT = 0;
      let power = 0;
      let swingT = 0;
      let flightT = 0;
      let legIdx = 0;
      let legT = 0;
      let after = 0;
      let bounces = 0;
      let pl = plan(0);
      let ox = 0;
      let oy = 0;
      let oz = 0;

      const btn = ui.hold(
        'Бросить',
        () => {
          if (phase !== 'idle') return;
          phase = 'charge';
          chargeT = 0;
          score.hide();
          ui.note('Отпусти, когда указатель в зелёной зоне.');
        },
        () => {
          if (phase !== 'charge') return;
          phase = 'swing';
          swingT = 0;
          pl = plan(power);
        },
      );

      /** Расстояние от руки до начала звена */
      const legStartS = (): number => {
        let s = 0;
        for (let i = 0; i < legIdx; i++) s += pl.legs[i]!.len;
        return s;
      };

      function release(): void {
        phase = 'flight';
        flightT = 0;
        legIdx = 0;
        legT = 0;
        bounces = 0;
        ox = stone.position.x;
        oy = stone.position.y;
        oz = stone.position.z;
        thrower.avatar.jolt(0.5);
        sound.whoosh();
      }

      function touch(): void {
        const px = stone.position.x;
        const pz = stone.position.z;
        const last = legIdx === pl.n;
        d.ripples.spawn(px, pz, last ? 1.7 : Math.max(0.7, 1.2 - 0.06 * bounces));
        d.spray.burst(px, W + 0.1, pz, last ? 18 : 10, 0xf4fdff, last ? 2.6 : 2, 1, 0.06);
        sound.plip(1 + bounces * 0.1);
        if (legIdx > 0) {
          bounces++;
          lastStat.set(String(bounces));
          score.show(String(bounces));
        }
        if (last) endThrow();
      }

      function endThrow(): void {
        phase = 'after';
        after = 0;
        stone.visible = false;
        thrower.avatar.hands = null;
        const n = pl.n;
        lastStat.set(String(n));
        score.show(n === 0 ? 'бульк' : `${n} блинч${n === 1 ? 'ик' : n < 5 ? 'ика' : 'иков'}!`, n >= 6 ? '#ffd23f' : '#ffffff');
        if (n > record) {
          record = n;
          recStat.set(String(n));
          try {
            localStorage.setItem('lab.skip.record', String(n));
          } catch {
            // не запомнили
          }
        }
        if (n >= 6) {
          thrower.action(kit.ACT.wave);
          d.fx.confetti(thrower.pos.x, 2, thrower.pos.z, 36, 0, 1, 0, 0.8, 5);
          sound.fanfare();
        } else if (n <= 1) {
          thrower.action(kit.ACT.laugh);
        }
        ui.note(n === 0 ? 'Бульк! Слишком слабо или слишком сильно?' : n >= 6 ? `Вот это бросок: ${n}!` : 'Неплохо, можно ещё.');
      }

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          for (const b of buoys) {
            b.g.position.y = W + 0.1 + Math.sin(t * 1.6 + b.ph) * 0.06;
            b.g.rotation.z = Math.sin(t * 1.3 + b.ph) * 0.1;
          }
          if (phase === 'idle') {
            meter.set(0);
            stone.visible = true;
            setHand(-0.5, 0.95);
          } else if (phase === 'charge') {
            chargeT += dt;
            power = 0.5 - 0.5 * Math.cos(chargeT * 2.4);
            meter.set(power);
            setHand(-0.5 + 0.95 * power, 0.95 + 0.15 * power);
          } else if (phase === 'swing') {
            swingT += dt;
            const k = Math.min(1, swingT / 0.2);
            setHand(0.45 - 1.2 * k * k, 1.1 - 0.25 * k);
            if (k >= 1) release();
          } else if (phase === 'flight') {
            flightT += dt;
            legT += dt;
            const leg = pl.legs[legIdx]!;
            const u = Math.min(1, legT / leg.dur);
            const s = legStartS() + leg.len * u;
            const endY = W + 0.06;
            const y0 = legIdx === 0 ? oy : endY;
            const y = y0 + (endY - y0) * u + leg.h * 4 * u * (1 - u);
            stone.position.set(ox + DX * s, y, oz + DZ * s);
            stone.rotation.y += dt * 26;
            stone.rotation.z = Math.sin(flightT * 14) * 0.15;
            if (u >= 1) {
              stone.position.y = endY;
              touch();
              if (phase === 'flight') {
                legIdx++;
                legT = 0;
              }
            }
          } else {
            after += dt;
            if (after > 2.6) {
              phase = 'idle';
              thrower.avatar.hands = null;
              thrower.action(kit.ACT.none);
              score.hide();
            }
          }
          if (phase !== 'idle' && phase !== 'charge') btn.disabled = true;
          else btn.disabled = false;
          d.update(dt, t);
        },
        dispose() {
          d.dispose();
        },
      };
    },
  },
};
