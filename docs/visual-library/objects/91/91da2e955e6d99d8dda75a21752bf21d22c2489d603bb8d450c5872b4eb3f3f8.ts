// Прототип «Костёр и маршмеллоу»: уют у огня и мини-игра «прожарь идеально».
import { campfire, jelly, log, marshmallow, scene, spark } from '../art.ts';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Jelly } from '../kit3d.ts';
import type { Experiment } from '../types.ts';

export const islandCampfire: Experiment = {
  id: 'island-campfire',
  n: 9,
  title: 'Костёр и маршмеллоу',
  category: 'world',
  size: 'S',
  island: true,
  pitch: 'Костёр на пляже острова: сядь на бревно, держи зефир над огнём. Золотой — «ням», чёрный — смех.',
  fun: 'Уют и повод просто посидеть и поболтать; мини-игра «прожарь идеально».',
  art: () =>
    scene('sand', 'Четыре желейки сидят у костра на пляже, одна жарит зефир на палочке', [
      log(70, 186, 1, -6), log(250, 186, 1, 6),
      jelly({ x: 76, y: 176, c: 'pink', face: 'smile', arms: 'hold', s: 0.78 }),
      jelly({ x: 246, y: 176, c: 'sky', face: 'laugh', arms: 'hold', s: 0.78, flip: true }),
      campfire(160, 176, 1.25),
      jelly({ x: 118, y: 190, c: 'yellow', face: 'cheer', arms: 'hold', s: 0.68 }),
      marshmallow(142, 142, 1, -6, 'gold'),
      jelly({ x: 206, y: 160, c: 'purple', face: 'cheer', arms: 'up', s: 0.55 }),
      spark(120, 60, 7, '#fff'), spark(214, 70, 6, '#fff'),
    ]),
  live: {
    cta: 'Живой костёр',
    hint: 'Держи «Жарить»: зефир белеет, золотится, чернеет. Отпусти на золотом — получишь «ням».',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const ACT = kit.ACT;
      const d = kit.diorama({ cam: [0, 2.7, 5.4], look: [0, 0.95, -0.4], radius: 5.6 });
      const scene = d.scene;

      // песок и камни вокруг костра
      d.cyl(2.9, 2.9, 0.05, 0xe6d0a0, scene, 48).position.y = 0.025;
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        const s = d.ball(0.17, i % 2 ? 0x8f949b : 0xa9aeb4, scene, 8);
        s.scale.set(1, 0.65, 1);
        s.position.set(Math.cos(a) * 0.9, 0.1, Math.sin(a) * 0.9);
      }

      // брёвна для сиденья (верх на высоте 0,48) и шалаш из поленьев
      const bench = (x: number, z: number, ry: number): void => {
        const g = new THREE.Group();
        g.position.set(x, 0.24, z);
        g.rotation.y = ry;
        const b = d.cyl(0.24, 0.24, 1.7, 0x8d5a34, g, 16);
        b.rotation.z = Math.PI / 2;
        for (const sx of [-0.86, 0.86]) {
          const c = d.cyl(0.235, 0.235, 0.02, 0xd9b27a, g, 16);
          c.rotation.z = Math.PI / 2;
          c.position.x = sx;
        }
        scene.add(g);
      };
      bench(-2.1, 0.2, Math.PI / 2);
      bench(2.1, 0.2, Math.PI / 2);
      bench(-1.3, -1.7, 0.65);
      bench(1.3, -1.7, -0.65);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const g = new THREE.Group();
        g.position.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3);
        g.rotation.y = a;
        const stick = d.cyl(0.07, 0.08, 0.95, 0x6e4426, g, 8);
        stick.position.y = 0.4;
        stick.rotation.z = 0.5;
        scene.add(g);
      }

      // пламя: вложенные капли (красная, оранжевая, жёлтая, белая серединка) и четыре язычка по бокам
      const dropGeo = (R: number, h: number): InstanceType<typeof THREE.LatheGeometry> => {
        const pts: Array<InstanceType<typeof THREE.Vector2>> = [];
        for (let i = 0; i <= 14; i++) {
          const u = i / 14;
          pts.push(new THREE.Vector2(Math.max(0.0001, R * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - 0.1 * u)), u * h));
        }
        return new THREE.LatheGeometry(pts, 14);
      };
      const flames: Array<{ m: Mesh; ph: number; sway: number }> = [];
      const addFlame = (R: number, h: number, color: number, op: number, order: number, x: number, z: number, ph: number): void => {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, toneMapped: false, depthWrite: false });
        const m = new THREE.Mesh(dropGeo(R, h), mat);
        m.position.set(x, 0.16, z);
        m.renderOrder = order;
        scene.add(m);
        flames.push({ m, ph, sway: x === 0 && z === 0 ? 0.05 : 0.12 });
      };
      addFlame(0.44, 1.45, 0xff5a1f, 0.88, 4, 0, 0, 0);
      addFlame(0.33, 1.15, 0xff9a2e, 0.92, 5, 0, 0, 0.6);
      addFlame(0.23, 0.88, 0xffd84a, 0.95, 6, 0, 0, 1.2);
      addFlame(0.12, 0.58, 0xfff3b8, 1, 7, 0, 0, 1.8);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.5;
        const x = Math.cos(a) * 0.36;
        const z = Math.sin(a) * 0.36;
        addFlame(0.2, 0.85, 0xff6a24, 0.88, 4, x, z, 2.1 + i * 1.3);
        addFlame(0.11, 0.55, 0xffc040, 0.95, 5, x, z, 2.5 + i * 1.3);
      }
      const glow = d.glow(0xff9a40, 3.4, 0.5);
      glow.position.set(0, 0.8, 0);
      const light = new THREE.PointLight(0xff9040, 6, 7, 1.6);
      light.position.set(0, 0.9, 0.2);
      scene.add(light);

      // компания у костра
      // сидит желейка (тело приподнято на 0,3 само) или стоит на бревне (верх бревна — 0,48)
      const pose = (j: Jelly, act: number): void => {
        j.pos.y = act === ACT.sit ? 0.18 : 0.48;
        j.action(act);
      };
      const seat = (name: string, x: number, z: number, c: number, h: 'bandana' | 'cap' | 'party' | 'straw', act: number = ACT.sit): Jelly => {
        const j = d.jelly({ name, x, z, outfit: { c, h } });
        j.face(0, 0);
        pose(j, act);
        return j;
      };
      const me = seat('Ты', -2.1, 0.2, 9, 'straw');
      const anya = seat('Аня', -1.3, -1.7, 12, 'bandana');
      const kolya = seat('Коля', 2.1, 0.25, 2, 'cap');
      seat('Миша', 1.3, -1.7, 5, 'party', ACT.dance);
      const crowd = [anya, kolya];
      let crowdT = 0;

      // палочка с зефиром в руке «Ты»
      const stick: Group = new THREE.Group();
      const rod = d.cyl(0.018, 0.027, 1.6, 0x8d5a34, stick, 6);
      rod.rotation.x = -Math.PI / 2;
      rod.position.z = -0.8;
      const mallowMat: MeshStandardMaterial = d.mat(0xfffaf0, { rough: 0.9 });
      const mallow = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 10), mallowMat);
      mallow.rotation.x = Math.PI / 2;
      mallow.position.z = -1.55;
      stick.add(mallow);
      const burn = d.glow(0xff8a30, 0.7, 0.9);
      burn.position.z = -1.55;
      burn.visible = false;
      stick.add(burn);
      stick.position.set(0.12, 0.92, -0.42);
      me.avatar.held.add(stick);

      const KEYS: Array<[number, number]> = [[0, 0xfffaf0], [0.35, 0xffe9bd], [0.55, 0xf2c36b], [0.7, 0xdc9a3a], [0.82, 0x9a5a22], [0.95, 0x3e271a], [1.3, 0x15100e]];
      const scratch = new THREE.Color();
      const tint = (p: number): void => {
        for (let i = 0; i < KEYS.length - 1; i++) {
          const [p0, c0] = KEYS[i]!;
          const [p1, c1] = KEYS[i + 1]!;
          if (p <= p1 || i === KEYS.length - 2) {
            mallowMat.color.set(c0).lerp(scratch.set(c1), Math.max(0, Math.min(1, (p - p0) / (p1 - p0))));
            return;
          }
        }
      };

      const GOOD_FROM = 0.55;
      const GOOD_TO = 0.82;
      const meter = ui.meter('Прожарка');
      meter.zone(GOOD_FROM, GOOD_TO);
      const perfect = ui.stat('Идеально', '0');
      const badge = d.badge(0.2, 2.9, 0, 3.2);
      let nice = 0;
      let phase: 'idle' | 'roast' | 'eat' = 'idle';
      let roast = 0;
      let reach = 0;
      let eatT = 0;
      let sparkT = 0;
      let crackT = 0;
      let sizzleT = 0;
      const tip = new THREE.Vector3();

      const btn = ui.hold(
        'Жарить',
        () => {
          if (phase !== 'idle') return;
          phase = 'roast';
          roast = 0;
          badge.hide();
          ui.note('Держи, пока зефир не станет золотым, и отпускай.');
        },
        () => {
          if (phase === 'roast') finish();
        },
      );

      function finish(): void {
        phase = 'eat';
        eatT = 0;
        meter.set(roast);
        mallow.getWorldPosition(tip);
        let text: string;
        let color = '#ffffff';
        if (roast < 0.3) {
          text = 'сыроват';
          ui.note('Сыроват: подержи над огнём подольше.');
        } else if (roast < GOOD_FROM) {
          text = 'почти';
          color = '#ffe08a';
          ui.note('Почти. Ещё немного, и золото.');
        } else if (roast <= GOOD_TO) {
          text = 'ням!';
          color = '#ffd23f';
          nice++;
          perfect.set(String(nice));
          ui.note('Золотой и тянется. Вот это зефир!');
          d.fx.icons(tip.x, tip.y + 0.2, tip.z, 1, 8);
          d.fx.confetti(tip.x, tip.y + 0.3, tip.z, 22, 0, 1, 0, 0.8, 4);
          sound.ding();
          pose(me, ACT.wave);
          crowdAct(ACT.wave);
        } else if (roast < 0.95) {
          text = 'пригорел';
          color = '#d9b38c';
          ui.note('Пригорел с одного бока. Сойдёт.');
          crowdAct(ACT.laugh);
        } else {
          text = 'уголёк!';
          color = '#c9ccd1';
          ui.note('Это уже уголёк. Все смеются.');
          crowdAct(ACT.laugh);
          pose(me, ACT.laugh);
          sound.tone({ f0: 300, f1: 120, dur: 0.35, type: 'sawtooth', vol: 0.12 });
        }
        badge.show(text, color);
      }

      function crowdAct(act: number): void {
        crowdT = 1.8;
        for (const j of crowd) pose(j, act);
      }

      const A_UP = 0.5;
      const A_DOWN = -0.3;
      return {
        scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          // огонь живой всегда
          for (const f of flames) {
            const s = 1 + 0.07 * Math.sin(t * 9 + f.ph);
            f.m.scale.set(s, 1 + 0.17 * Math.sin(t * 13 + f.ph * 1.3), s);
            f.m.rotation.z = f.sway * Math.sin(t * 7 + f.ph);
            f.m.rotation.x = f.sway * 0.7 * Math.sin(t * 5.3 + f.ph * 1.7);
          }
          glow.material.opacity = 0.5 + 0.07 * Math.sin(t * 11);
          light.intensity = 6 + Math.sin(t * 17) * 0.9 + Math.sin(t * 23) * 0.6;
          sparkT -= dt;
          if (sparkT <= 0) {
            sparkT = 0.16 + Math.random() * 0.22;
            d.fx.sparkle((Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5, 1);
          }
          crackT -= dt;
          if (crackT <= 0) {
            crackT = 0.35 + Math.random() * 1.0;
            sound.noise({ dur: 0.04, vol: 0.05, lp0: 3600, lp1: 1200 });
          }
          if (crowdT > 0 && (crowdT -= dt) <= 0) for (const j of crowd) pose(j, ACT.sit);

          // палочка: над огнём, пока жарим
          const want = phase === 'roast' ? 1 : 0;
          reach += (want - reach) * Math.min(1, dt * 7);
          stick.rotation.x = A_UP + (A_DOWN - A_UP) * reach;
          me.avatar.hands = [-0.3, 0.8, -0.12, 0.2, 0.92, -0.42];
          if (phase === 'roast') {
            roast = Math.min(1.25, roast + dt / 4.3);
            tint(roast);
            meter.set(Math.min(1, roast));
            burn.visible = roast >= 0.95;
            sizzleT -= dt;
            if (sizzleT <= 0) {
              sizzleT = 0.22;
              sound.noise({ dur: 0.06, vol: 0.05 + 0.04 * roast, lp0: 6000, lp1: 2500 });
            }
          } else if (phase === 'eat') {
            eatT += dt;
            burn.visible = burn.visible && eatT < 0.5;
            mallow.visible = eatT < 0.9;
            if (eatT > 2.4) {
              phase = 'idle';
              mallow.visible = true;
              tint(0);
              roast = 0;
              meter.set(0);
              badge.hide();
              pose(me, ACT.sit);
            }
          } else {
            tint(0);
            burn.visible = false;
          }
          btn.disabled = phase === 'eat';
          d.update(dt, t);
        },
        dispose() {
          d.dispose();
        },
      };
    },
  },
};
