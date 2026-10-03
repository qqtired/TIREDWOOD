// Прототип «Горячий арбуз»: арбуз с тикающим фитилём перелетает от желейки к желейке, лопнул — сок и арбузная каска.
import { COLOR, jelly, melon, scene, spark, star } from '../art.ts';
import type { BufferGeometry, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import type { Experiment } from '../types.ts';

export const hotMelon: Experiment = {
  id: 'hot-melon',
  n: 1,
  title: 'Горячий арбуз',
  category: 'mode',
  size: 'M',
  net: true,
  pitch: 'Арбуз с горящим фитилём передают из рук в руки. Лопнул у тебя — ты весь в соке и в арбузной «каске». 4–10 человек, раунд 1–2 минуты.',
  fun: 'Классическая «горячая картошка»: все орут в голосовой чат, а проигравшего хочется сфотографировать.',
  art: () =>
    scene('deck', 'Арбуз с горящим фитилём летит от желейки к желейке, проигравший в арбузной каске весь в соке', [
      jelly({ x: 60, y: 188, c: 'pink', face: 'oh', arms: 'up', s: 0.9, look: 1 }),
      jelly({ x: 160, y: 190, c: 'sky', face: 'oh', arms: 'up', s: 0.9 }),
      jelly({ x: 262, y: 188, c: 'green', hat: 'melon', face: 'dizzy', arms: 'up', s: 0.9, flip: true }),
      `<path d="M72 112Q116 62 156 108" stroke="${COLOR.ink}" stroke-width="2.4" fill="none" stroke-dasharray="3 7" stroke-linecap="round" opacity=".4"/>`,
      melon(118, 84, 1.05),
      `<g fill="#ff4d6d">${[[238, 96, 5], [286, 90, 4], [250, 70, 4], [276, 112, 5], [296, 70, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`,
      star(262, 44, 10, COLOR.orange), spark(262, 44, 5, '#fff7c2'),
    ]),
  live: {
    cta: 'Живой арбуз',
    hint: 'Арбуз летит от желейки к желейке, а фитиль догорает. Когда он у тебя (голубая желейка с кольцом), жми «Передать» как можно быстрее.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ cam: [0, 2.4, 6.6], look: [0, 2.15, 0], radius: 5.6 });
      const scene = d.scene;

      // желейки по кругу лицом к середине; «Ты» — ближняя к камере
      const names = ['Ты', 'Миша', 'Аня', 'Коля', 'Лена'];
      const looks = [
        { c: 9, h: 'cap' },
        { c: 0, h: 'none' },
        { c: 5, h: 'panama' },
        { c: 12, h: 'bandana' },
        { c: 3, h: 'none' },
      ];
      // подкова: все лицом к середине и немного к камере, «Ты» — слева спереди
      const R = 2.7;
      const spots = [-78, -40, 0, 40, 78];
      const order = [0, 2, 3, 4, 1];
      const players = names.map((name, i) => {
        const a = (spots[order.indexOf(i)]! * Math.PI) / 180;
        const j = d.jelly({ name, x: Math.sin(a) * R, z: 0.7 - Math.cos(a) * R, outfit: { c: looks[i]!.c, h: looks[i]!.h } });
        j.face(Math.sin(a) * R * 0.45, 7);
        return j;
      });

      // кольцо под «Тобой»
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.74, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(players[0]!.pos.x, 0.03, players[0]!.pos.z);
      scene.add(ring);

      // арбуз: полосатый шар, черенок, фитиль с искрой
      const paintStripes = (g: SphereGeometry, c1: number, c2: number, n: number): BufferGeometry => {
        const pos = g.getAttribute('position');
        const col = new Float32Array(pos.count * 3);
        const A = new THREE.Color(c1);
        const B = new THREE.Color(c2);
        for (let i = 0; i < pos.count; i++) {
          const ang = Math.atan2(pos.getZ(i), pos.getX(i));
          const c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * n) % 2 ? A : B;
          col.set([c.r, c.g, c.b], i * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      };
      const melonMat = d.mat(0xffffff);
      melonMat.vertexColors = true;
      const melon = new THREE.Group();
      const body = new THREE.Mesh(paintStripes(new THREE.SphereGeometry(0.34, 48, 24), 0x5cc85c, 0x2f8f3f, 12), melonMat);
      body.scale.set(1, 0.9, 1);
      const stem = d.cyl(0.03, 0.04, 0.12, 0x7a4a2e, melon, 8);
      stem.position.y = 0.33;
      const fuse = d.cyl(0.012, 0.012, 0.3, 0x2d2630, melon, 6);
      melon.add(body);
      const spark = d.glow(0xffb03a, 0.34, 0.95);
      scene.add(melon);

      // арбузная каска проигравшего
      const helmMat = d.mat(0xffffff);
      helmMat.vertexColors = true;
      const dome = new THREE.Mesh(paintStripes(new THREE.SphereGeometry(0.43, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0x5cc85c, 0x2f8f3f, 12), helmMat);
      dome.scale.y = 0.9;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 8, 36), d.mat(0xff5a6e));
      rim.rotation.x = Math.PI / 2;
      const helmet = new THREE.Group();
      helmet.add(dome, rim);
      helmet.position.y = 1.4;
      helmet.visible = false;

      const rideMelon = (i: number): Vector3 => {
        const j = players[i]!;
        const fx = -Math.sin(j.yaw);
        const fz = -Math.cos(j.yaw);
        return new THREE.Vector3(j.pos.x + fx * 0.66, 1.0, j.pos.z + fz * 0.66);
      };
      const setHands = (i: number | null): void => {
        players.forEach((p, k) => {
          p.avatar.hands = k === i ? [-0.3, 0.98, -0.58, 0.3, 0.98, -0.58] : null;
        });
      };

      // состояние раунда
      let phase: 'hold' | 'flight' | 'boom' = 'hold';
      let holder = 0;
      let loser = -1;
      let timeLeft = 10;
      let total = 10;
      let holdT = 0;
      let passAfter = 1;
      let flightT = 0;
      let flightTo = 1;
      const from = new THREE.Vector3();
      const to = new THREE.Vector3();
      let boomT = 0;
      let round = 0;
      let tickT = 0;
      let sparkT = 0;
      const roundStat = ui.stat('Раунд', '1');

      const btn = ui.button('Передать', () => pass(), true);
      ui.button('Новый раунд', () => startRound(Math.max(0, loser)));

      const interval = (): number => {
        const k = 1 - timeLeft / total;
        return 1.2 - 0.7 * k + Math.random() * 0.2;
      };

      function startRound(start: number): void {
        round++;
        roundStat.set(String(round));
        total = timeLeft = 8 + Math.random() * 5;
        holder = start;
        phase = 'hold';
        holdT = 0;
        passAfter = interval();
        tickT = 0;
        melon.visible = true;
        melon.scale.setScalar(0.01);
        setHands(holder);
        for (const p of players) p.action(kit.ACT.none);
        ui.note(holder === 0 ? 'Арбуз у тебя. Передавай!' : `Арбуз у ${names[holder]}. Фитиль горит.`);
      }

      function pass(): void {
        if (phase !== 'hold') return;
        let next = holder;
        while (next === holder) next = Math.floor(Math.random() * players.length);
        from.copy(rideMelon(holder));
        to.copy(rideMelon(next));
        flightTo = next;
        flightT = 0;
        phase = 'flight';
        setHands(null);
        players[holder]!.avatar.jolt(0.25);
        sound.whoosh();
      }

      function boom(at: number): void {
        phase = 'boom';
        boomT = 0;
        loser = at;
        melon.visible = false;
        spark.visible = false;
        setHands(null);
        const p = rideMelon(at);
        d.spray.burst(p.x, p.y + 0.15, p.z, 46, 0xff4d6d, 5.2, 0.8, 0.075);
        d.spray.burst(p.x, p.y + 0.15, p.z, 14, 0x2d2630, 4.2, 0.9, 0.04);
        d.spray.burst(p.x, p.y + 0.15, p.z, 14, 0x5cc85c, 4.8, 0.9, 0.07);
        d.fx.floatText(p.x, p.y + 1.1, p.z, 'БУМ!', '#ff4d6d');
        d.fx.sparkle(p.x, p.y + 0.2, p.z, 24);
        sound.boom();
        const lj = players[at]!;
        lj.avatar.jolt(1.5);
        lj.avatar.tomato();
        lj.avatar.root.add(helmet);
        helmet.visible = true;
        players.forEach((q, k) => {
          if (k === at) return;
          q.action(kit.ACT.laugh);
          q.avatar.react(0);
        });
        ui.note(at === 0 ? 'Лопнуло у тебя! Ты весь в соке.' : `Лопнуло у ${names[at]}. Он весь в соке.`);
      }

      startRound(0);

      return {
        scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          d.update(dt, t);
          const k = Math.max(0, 1 - timeLeft / total);
          if (phase !== 'boom') {
            timeLeft -= dt;
            tickT -= dt;
            if (tickT <= 0) {
              sound.tick(1 + k * 0.7);
              tickT = 0.55 - 0.4 * k;
            }
            sparkT -= dt;
            if (sparkT <= 0) {
              sparkT = 0.07;
              d.fx.sparkle(spark.position.x, spark.position.y, spark.position.z, 1);
            }
          }
          if (phase === 'hold') {
            holdT += dt;
            melon.position.copy(rideMelon(holder));
            melon.position.y += Math.sin(t * 6) * 0.015;
            const limit = holder === 0 ? 1.8 : passAfter;
            if (timeLeft <= 0) boom(holder);
            else if (holdT > limit) pass();
          } else if (phase === 'flight') {
            flightT += dt;
            const u = Math.min(1, flightT / 0.42);
            melon.position.lerpVectors(from, to, u);
            melon.position.y += Math.sin(u * Math.PI) * 1.15;
            melon.rotation.z += dt * 9;
            if (u >= 1) {
              holder = flightTo;
              phase = 'hold';
              holdT = 0;
              passAfter = interval();
              setHands(holder);
              players[holder]!.avatar.jolt(0.3);
              sound.pop();
              if (timeLeft <= 0) boom(holder);
              else ui.note(holder === 0 ? 'Арбуз у тебя. Передавай!' : `Арбуз у ${names[holder]}. Фитиль горит.`);
            }
          } else {
            boomT += dt;
            if (boomT > 2.7) startRound(loser);
          }
          // арбуз: растёт при появлении, пульсирует всё быстрее, фитиль укорачивается
          if (melon.visible) {
            const grow = Math.min(1, melon.scale.x + dt * 5);
            const pulse = 1 + Math.sin(t * (8 + k * 18)) * 0.025 * (1 + k * 2);
            melon.scale.setScalar(grow * pulse);
            const len = 0.06 + 0.24 * Math.max(0, timeLeft / total);
            fuse.scale.y = len / 0.3;
            fuse.position.set(0.05, 0.4 + len / 2 - 0.04, 0);
            spark.visible = true;
            spark.position.set(melon.position.x + 0.05 * melon.scale.x, melon.position.y + (0.4 + len) * melon.scale.x, melon.position.z);
            melonMat.emissive.setHex(0xff2a00);
            melonMat.emissiveIntensity = 0.45 * k * (0.5 + 0.5 * Math.sin(t * 20));
          }
          btn.disabled = !(phase === 'hold' && holder === 0);
          const mine = phase === 'hold' && holder === 0;
          (ring.material as MeshBasicMaterial).opacity = mine ? 0.55 + 0.45 * Math.sin(t * 10) : 0.35;
          ring.scale.setScalar(mine ? 1 + 0.08 * Math.sin(t * 10) : 1);
        },
        dispose() {
          helmet.removeFromParent();
          dome.geometry.dispose();
          rim.geometry.dispose();
          d.dispose();
        },
      };
    },
  },
};
