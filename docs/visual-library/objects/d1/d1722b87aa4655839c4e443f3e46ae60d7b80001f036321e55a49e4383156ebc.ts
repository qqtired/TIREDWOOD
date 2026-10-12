// Прототип «Лавка розыгрышей»: банановая кожура и подушка-пукалка на скамейке.
import { COLOR, bench, cushion, jelly, label, peel, scene, star } from '../art.ts';
import type { Group } from 'three';
import type { Jelly } from '../kit3d.ts';
import type { Experiment } from '../types.ts';

export const prankShop: Experiment = {
  id: 'prank-shop',
  n: 18,
  title: 'Лавка розыгрышей',
  category: 'social',
  size: 'M',
  net: true,
  pitch: 'Банановая кожура, подушка-пукалка на скамейку, резиновая утка, хлопушка другу в подарок.',
  fun: 'Безобидные подколы на весь вечер; ловушку видно, если присмотреться, а автору приходит «Коля поскользнулся».',
  art: () =>
    scene('deck', 'Желейка поскользнулась на банановой кожуре и кувыркается, на скамейке лежит подушка-пукалка', [
      peel(98, 186, 1.3),
      jelly({ x: 104, y: 148, c: 'orange', face: 'oh', arms: 'up', s: 0.8, rot: -42, shadow: false }),
      star(66, 64, 8), star(134, 58, 6), star(100, 40, 7),
      bench(246, 180, 1.1),
      cushion(246, 156, 1.1),
      label(262, 108, 'ПФФФ!', 15, COLOR.pink, 900),
      jelly({ x: 296, y: 188, c: 'mint', face: 'laugh', arms: 'wave', s: 0.62, flip: true }),
    ]),
  live: {
    cta: 'Живые розыгрыши',
    hint: 'Кнопки «Банан» и «Подушка» подкладывают ловушку: смотри, что случится. Камеру можно покрутить.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ cam: [0.6, 3.3, 8.0], look: [0.3, 1.2, 0], radius: 6.2 });
      const scene = d.scene;

      // скамейка справа
      const benchX = 2.6;
      const benchZ = -0.4;
      const bench = new THREE.Group();
      bench.position.set(benchX, 0, benchZ);
      const seat = d.box(1.9, 0.12, 0.62, 0xc98d4f, bench);
      seat.position.y = 0.46;
      const back = d.box(1.9, 0.5, 0.1, 0xb87a3d, bench);
      back.position.set(0, 0.86, -0.26);
      for (const x of [-0.8, 0.8]) {
        d.box(0.12, 0.46, 0.52, 0x8d5a34, bench).position.set(x, 0.23, 0);
      }
      scene.add(bench);

      // подушка-пукалка
      const cushion = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 28), d.mat(0xff7aa8, { rough: 0.35 }));
      body.scale.y = 1;
      const nozzle = d.cyl(0.05, 0.06, 0.18, 0xd9487f, cushion, 10);
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(0.38, 0, 0.12);
      cushion.add(body);
      cushion.position.set(benchX, 0.58, benchZ + 0.02);
      cushion.visible = false;
      scene.add(cushion);

      // банановая кожура: три лепестка и «серединка»
      const peel: Group = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const petal = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), d.mat(0xffd23f, { rough: 0.4 }));
        petal.scale.set(0.3, 0.035, 0.12);
        const a = (i / 3) * Math.PI * 2 + 0.4;
        petal.position.set(Math.cos(a) * 0.16, 0.03, Math.sin(a) * 0.16);
        petal.rotation.y = -a;
        petal.rotation.z = 0.12;
        peel.add(petal);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), d.mat(0xfff3a8));
      core.scale.y = 0.4;
      core.position.y = 0.04;
      peel.add(core);
      peel.position.set(-0.4, 0, 1.5);
      peel.visible = false;
      scene.add(peel);
      const PEEL = 1.7;

      // актёры
      const victim = d.jelly({ name: 'Миша', x: -4.2, z: 1.5, yaw: -Math.PI / 2, outfit: { c: 9, h: 'cap' } });
      const sitter = d.jelly({ name: 'Аня', x: 4.3, z: -2.2, yaw: Math.PI / 2, outfit: { c: 12, h: 'bandana' } });
      const watcher = d.jelly({ name: 'Коля', x: -2.2, z: -1.8, outfit: { c: 5, h: 'panama' } });
      watcher.face(0, 6);

      type Stage = 'idle' | 'walk' | 'slip' | 'dizzy' | 'back';
      let vs: Stage = 'idle';
      let vt = 0;
      type SitStage = 'idle' | 'walk' | 'turn' | 'sit' | 'pff' | 'jump' | 'laugh' | 'away';
      let ss: SitStage = 'idle';
      let st = 0;
      let cushionK = 1;
      const lastStat = ui.stat('Жертва', '—');

      const startBanana = (): void => {
        if (vs !== 'idle') return;
        peel.visible = true;
        peel.scale.setScalar(0.01);
        peel.position.set(-0.4, 0, 1.5);
        sound.pop();
        victim.pos.set(-4.2, 0, 1.5);
        victim.yaw = -Math.PI / 2;
        victim.flip = 0;
        vs = 'walk';
        vt = 0;
        ui.note('Миша идёт мимо. Он не заметил кожуру…');
        lastStat.set('Миша');
      };
      const startCushion = (): void => {
        if (ss !== 'idle') return;
        cushion.visible = true;
        cushionK = 1;
        cushion.scale.set(1, 1, 1);
        sound.pop();
        sitter.pos.set(4.3, 0, -2.2);
        sitter.action(kit.ACT.none);
        ss = 'walk';
        st = 0;
        ui.note('Аня идёт присесть на скамейку. Подушка уже лежит…');
        lastStat.set('Аня');
      };
      ui.button('Банан', startBanana, true);
      ui.button('Подушка', startCushion, true);

      const approach = (j: Jelly, x: number, z: number, speed: number, dt: number): number => {
        const dx = x - j.pos.x;
        const dz = z - j.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-3) {
          const s = Math.min(dist, speed * dt);
          j.pos.x += (dx / dist) * s;
          j.pos.z += (dz / dist) * s;
          j.face(x, z);
        }
        return dist;
      };
      const turnTo = (j: Jelly, yaw: number, dt: number): void => {
        let da = yaw - j.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        j.yaw += Math.max(-5 * dt, Math.min(5 * dt, da));
      };

      // начало: сразу показываем банан, а когда он закончится, один раз — подушку
      let autoCushion = true;
      const timer = window.setTimeout(startBanana, 700);

      return {
        scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          if (peel.visible && peel.scale.x < PEEL) peel.scale.setScalar(Math.min(PEEL, peel.scale.x + dt * 6));

          // --- Миша и банан
          vt += dt;
          if (vs === 'walk') {
            victim.pos.x += 2.3 * dt;
            if (victim.pos.x > peel.position.x - 0.35) {
              vs = 'slip';
              vt = 0;
              victim.grounded = false;
              sound.slip();
              victim.avatar.say('Ой!');
            }
          } else if (vs === 'slip') {
            const u = Math.min(1, vt / 1.0);
            victim.pos.x += 1.6 * dt;
            victim.pos.y = 1.5 * Math.sin(u * Math.PI);
            victim.flip = -u * Math.PI * 2;
            if (u >= 1) {
              victim.flip = 0;
              victim.pos.y = 0;
              victim.grounded = true;
              vs = 'dizzy';
              vt = 0;
              victim.avatar.jolt(1.3);
              victim.action(kit.ACT.tired);
              sound.splat();
              d.fx.icons(victim.pos.x, 1.8, victim.pos.z, 0, 7);
              d.fx.floatText(victim.pos.x, 2.5, victim.pos.z, 'Ой!', '#ffd23f');
              watcher.action(kit.ACT.laugh);
              watcher.avatar.react(0);
              ui.note('Миша кувыркнулся. Звёздочки!');
            }
          } else if (vs === 'dizzy') {
            if (Math.floor(vt * 2) !== Math.floor((vt - dt) * 2)) d.fx.icons(victim.pos.x, 1.8, victim.pos.z, 0, 3);
            if (vt > 2.4) {
              vs = 'back';
              vt = 0;
              victim.action(kit.ACT.none);
              watcher.action(kit.ACT.none);
            }
          } else if (vs === 'back') {
            if (approach(victim, -4.2, 1.5, 2.0, dt) < 0.05) {
              victim.yaw = -Math.PI / 2;
              vs = 'idle';
              if (autoCushion) {
                autoCushion = false;
                startCushion();
              } else if (ss === 'idle') ui.note('Можно подложить банан или подушку ещё раз.');
            }
          }

          // --- Аня и подушка
          st += dt;
          if (ss === 'walk') {
            if (approach(sitter, benchX + 0.3, benchZ + 1.1, 2.0, dt) < 0.05) {
              ss = 'turn';
              st = 0;
            }
          } else if (ss === 'turn') {
            turnTo(sitter, Math.PI, dt);
            if (st > 0.5) {
              ss = 'sit';
              st = 0;
              sitter.pos.set(benchX + 0.3, 0.2, benchZ + 0.1);
              sitter.action(kit.ACT.sit);
            }
          } else if (ss === 'sit') {
            if (st > 0.9) {
              ss = 'pff';
              st = 0;
              sound.honk();
              d.spray.burst(cushion.position.x + 0.3, 0.7, cushion.position.z + 0.15, 22, 0xffffff, 2.2, 0.5, 0.05);
              d.fx.floatText(benchX, 1.9, benchZ + 0.4, 'ПФФФ!', '#ff7aa8');
              ui.note('Пффф! Подушка сдулась.');
            }
          } else if (ss === 'pff') {
            cushionK = Math.max(0.12, cushionK - dt * 2.6);
            if (st > 0.35) {
              ss = 'jump';
              st = 0;
              sitter.action(kit.ACT.none);
              sitter.grounded = false;
              sitter.avatar.jolt(1.4);
              sitter.avatar.say('Ой!');
            }
          } else if (ss === 'jump') {
            const u = Math.min(1, st / 0.7);
            sitter.pos.y = 0.2 * (1 - u) + 1.0 * Math.sin(u * Math.PI);
            sitter.pos.z += 1.2 * dt;
            if (u >= 1) {
              sitter.pos.y = 0;
              sitter.grounded = true;
              ss = 'laugh';
              st = 0;
              sitter.action(kit.ACT.laugh);
              watcher.action(kit.ACT.laugh);
              watcher.avatar.react(0);
            }
          } else if (ss === 'laugh') {
            if (st > 2.0) {
              ss = 'away';
              st = 0;
              sitter.action(kit.ACT.none);
              watcher.action(kit.ACT.none);
            }
          } else if (ss === 'away') {
            if (approach(sitter, 4.3, -2.2, 2.0, dt) < 0.05) {
              ss = 'idle';
              cushionK = 1;
              cushion.visible = false;
              if (vs === 'idle') ui.note('Можно подложить банан или подушку ещё раз.');
            }
          }
          cushion.scale.set(1 + (1 - cushionK) * 0.25, cushionK, 1 + (1 - cushionK) * 0.25);

          d.update(dt, t);
        },
        dispose() {
          window.clearTimeout(timer);
          d.dispose();
        },
      };
    },
  },
};
