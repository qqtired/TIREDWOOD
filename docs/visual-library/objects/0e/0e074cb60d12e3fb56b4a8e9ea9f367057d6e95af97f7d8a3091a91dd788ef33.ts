// Прототип «Паровозик»: цепочка желеек бежит за ведущим, цепочка извивается и подпрыгивает.
import { COLOR, jelly, note, scene } from '../art.ts';
import type { MeshBasicMaterial } from 'three';
import type { Jelly } from '../kit3d.ts';
import type { Experiment } from '../types.ts';

export const congaTrain: Experiment = {
  id: 'conga-train',
  n: 15,
  title: 'Паровозик',
  category: 'social',
  size: 'M',
  net: true,
  pitch: 'Нажал E на идущего — встал ему в хвост. Цепочка извивается по площади и подпрыгивает в такт.',
  fun: 'Веселье на 8 человек даром; рулишь хвостом и сталкиваешь чужие паровозики.',
  art: () =>
    scene('deck', 'Восемь желеек бегут цепочкой за ведущим в праздничном колпаке', [
      ...([
        [44, 174, 'pink'], [84, 184, 'sky'], [126, 176, 'green'], [168, 186, 'yellow'], [210, 178, 'mint'], [250, 188, 'purple'],
      ] as const).map(([x, y, c], i) => jelly({ x, y, c, face: i % 2 ? 'laugh' : 'cheer', arms: 'hold', s: i % 2 ? 0.62 : 0.56, shadow: i > 0 })),
      jelly({ x: 290, y: 178, c: 'orange', hat: 'party', face: 'cheer', arms: 'up', s: 0.66 }),
      note(70, 82, 1.2, COLOR.blue), note(150, 66, 1.4, COLOR.red), note(236, 78, 1.2, COLOR.green),
    ]),
  live: {
    cta: 'Живой паровозик',
    hint: 'Ведущий в колпаке бежит по настилу, цепочка за ним. Тапни по настилу — он повернёт туда. «Добавить в хвост» ставит ещё одну желейку (всего до десяти).',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ cam: [0, 5.6, 8.2], look: [0, 0.7, 0.2], radius: 6.4 });
      const R = 6.4;
      const SPACING = 1.2;
      const MAX = 10;
      const SPEED = 3.1;
      const palette = [
        { c: 0, h: 'none' }, { c: 5, h: 'panama' }, { c: 12, h: 'none' }, { c: 3, h: 'bandana' }, { c: 8, h: 'none' },
        { c: 11, h: 'none' }, { c: 4, h: 'sailor' }, { c: 6, h: 'none' }, { c: 1, h: 'cap' }, { c: 14, h: 'none' },
      ];

      // след ведущего: точки с накопленной длиной; хвост берёт позицию на нужном расстоянии позади
      type Pt = { x: number; z: number; s: number };
      const trail: Pt[] = [];
      let head = { x: -2.4, z: 1.2, a: 0 };
      let dest = { x: 3, z: -0.5 };
      let dist = 0;
      for (let i = 0; i < 40; i++) trail.push({ x: head.x - (40 - i) * 0.05, z: head.z, s: -(40 - i) * 0.05 });
      trail.push({ x: head.x, z: head.z, s: 0 });

      const at = (s: number): { x: number; z: number; yaw: number } => {
        let lo = 0;
        let hi = trail.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (trail[mid]!.s <= s) lo = mid;
          else hi = mid;
        }
        const p = trail[lo]!;
        const q = trail[hi]!;
        const u = q.s > p.s ? Math.min(1, Math.max(0, (s - p.s) / (q.s - p.s))) : 0;
        return { x: p.x + (q.x - p.x) * u, z: p.z + (q.z - p.z) * u, yaw: Math.atan2(-(q.x - p.x), -(q.z - p.z)) };
      };

      const members: Jelly[] = [];
      const addMember = (i: number): Jelly => {
        const look = palette[i % palette.length]!;
        const j = d.jelly({ x: head.x, z: head.z, outfit: i === 0 ? { c: 9, h: 'cap' } : { c: look.c, h: look.h } });
        j.avatar.hands = i === 0 ? null : [-0.36, 0.9, -0.58, 0.36, 0.9, -0.58];
        members.push(j);
        return j;
      };
      // ведущий — в праздничном колпаке: берём шапку «колпак дурака», она самая весёлая из доступных
      const leader = addMember(0);
      leader.avatar.setOutfit(kit.outfit({ c: 3, h: 'fool', e: 'happy' }));
      leader.action(kit.ACT.wave);
      for (let i = 1; i < 8; i++) addMember(i);

      // метка «сюда»
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      mark.rotation.x = -Math.PI / 2;
      mark.position.y = 0.03;
      d.scene.add(mark);
      let markT = 0;

      const count = ui.stat('Паровозик', '8');
      ui.button('Добавить в хвост', () => {
        if (members.length >= MAX) {
          ui.note('Больше десяти не помещается на настил.');
          return;
        }
        const last = members[members.length - 1]!;
        const j = addMember(members.length);
        j.pos.copy(last.pos);
        j.yaw = last.yaw;
        d.fx.confetti(j.pos.x, 1.4, j.pos.z, 24, 0, 1, 0, 0.8, 4.5);
        sound.pop();
        count.set(String(members.length));
      }, true);
      ui.button('Сначала', () => {
        while (members.length > 8) d.removeJelly(members.pop()!);
        count.set(String(members.length));
        ui.note('');
      });

      const pickDest = (): void => {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (R - 1.6);
        dest = { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8 };
      };
      let beat = 0;
      let beatT = 0;
      let idleT = 0;
      d.fx.confetti(head.x, 1.6, head.z, 30, 0, 1, 0, 0.8, 5);

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        tap(nx, ny) {
          const p = kit.floorAt(d.camera, nx, ny);
          if (!p) return;
          const r = Math.hypot(p.x, p.z);
          const k = r > R - 1.2 ? (R - 1.2) / r : 1;
          dest = { x: p.x * k, z: p.z * k };
          idleT = 0;
          mark.position.set(dest.x, 0.03, dest.z);
          markT = 1;
          sound.plip(1.3);
        },
        update(dt, t) {
          // курс ведущего: к цели с ограниченной скоростью поворота
          const dx = dest.x - head.x;
          const dz = dest.z - head.z;
          const want = Math.atan2(dx, dz);
          let da = want - head.a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          head.a += Math.max(-2.6 * dt, Math.min(2.6 * dt, da));
          const step = SPEED * dt;
          head = { x: head.x + Math.sin(head.a) * step, z: head.z + Math.cos(head.a) * step, a: head.a };
          dist += step;
          trail.push({ x: head.x, z: head.z, s: dist });
          if (trail.length > 900) trail.splice(0, 300);
          if (Math.hypot(dx, dz) < 0.6) {
            idleT += dt;
            if (idleT > 0.4) pickDest();
          }
          for (let i = 0; i < members.length; i++) {
            const p = at(dist - i * SPACING);
            const j = members[i]!;
            j.pos.x = p.x;
            j.pos.z = p.z;
            j.yaw = i === 0 ? Math.atan2(-Math.sin(head.a), -Math.cos(head.a)) : p.yaw;
          }
          beatT += dt;
          if (beatT >= 0.25) {
            beatT -= 0.25;
            sound.step(beat++);
          }
          if (markT > 0) {
            markT = Math.max(0, markT - dt * 1.4);
            (mark.material as MeshBasicMaterial).opacity = markT;
            mark.scale.setScalar(1.4 - markT * 0.4);
          }
          d.update(dt, t);
        },
        dispose() {
          mark.geometry.dispose();
          d.dispose();
        },
      };
    },
  },
};
