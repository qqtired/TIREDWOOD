// Прототип «Силомер»: ярмарочный аппарат: молот, шкала, колокол, надпись «слабак» или «силач».
import { COLOR, bubble, jelly, mallet, scene, tower } from '../art.ts';
import type { Group } from 'three';
import type { Experiment } from '../types.ts';

export const strongman: Experiment = {
  id: 'strongman',
  n: 7,
  title: 'Силомер',
  category: 'world',
  size: 'S',
  pitch: 'Ярмарочный аппарат: поймай момент на шкале, ударь молотом — шайба летит к колоколу.',
  fun: 'Мем «слабак», зрители подзуживают, звон колокола на всю площадь.',
  art: () =>
    scene('deck', 'Желейка бьёт молотом по ярмарочному силомеру, шайба летит к колоколу', [
      tower(222, 182, 1.05, 0.8),
      mallet(128, 140, 1, 34),
      jelly({ x: 98, y: 188, c: 'orange', hat: 'bandana', face: 'angry', arms: 'hold', s: 0.95 }),
      jelly({ x: 40, y: 190, c: 'green', face: 'smug', arms: 'down', s: 0.68 }),
      bubble(6, 76, 64, 'слабак!', 'l', 12),
      `<rect x="266" y="60" width="46" height="22" rx="8" fill="${COLOR.red}" stroke="#a82a30" stroke-width="2"/><text x="289" y="76" font-size="11" font-weight="900" fill="#fff" text-anchor="middle">СИЛАЧ</text>`,
    ]),
  live: {
    cta: 'Ударить молотом',
    hint: 'Жми «Бей!» в момент, когда указатель у зелёной зоны: чем точнее, тем выше шайба и громче колокол.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const ACT = kit.ACT;
      const d = kit.diorama({ cam: [0.9, 2.7, 6.8], look: [1.1, 2.2, -0.8], radius: 6.2 });
      const TX = 1.55;
      const TZ = -1.2;
      const PAD_Z = -0.1;
      const Y0 = 0.6; // центр шайбы внизу
      const SPAN = 3.3; // на сколько шайба поднимается при полной силе
      const BELL_AT = 0.945; // с этой силы шайба достаёт до колокола
      const BANDS: Array<[number, string, string]> = [
        [0.2, '#d9dee5', 'слабак'],
        [0.45, '#fff0c4', 'так себе'],
        [0.7, '#ffd978', 'сила есть'],
        [BELL_AT, '#ffb25a', 'силач'],
        [1.05, '#ffd23f', 'ЗВОН!'],
      ];

      // башня: основание, стойка, шкала с зонами
      const base = d.box(1.8, 0.34, 1.2, 0x8d5a34, d.scene);
      base.position.set(TX, 0.17, TZ);
      const post = d.box(1.12, 4.3, 0.16, 0xb87a3d, d.scene);
      post.position.set(TX, 2.15 + 0.15, TZ - 0.18);
      const BOARD_H = 3.5;
      const BOARD_Y0 = 0.45;
      const board = d.panel(0.94, BOARD_H, 256, (g, W, H) => {
        let from = 0;
        for (const [to, color, label] of BANDS) {
          // граница зоны p → высота на доске → строка холста
          const y = (p: number): number => (1 - (0.15 + SPAN * Math.min(1, p)) / BOARD_H) * H;
          const top = to >= 1 ? 0 : y(to);
          const bottom = from === 0 ? H : y(from);
          g.fillStyle = color;
          g.fillRect(0, top, W, bottom - top);
          g.fillStyle = 'rgba(70, 40, 20, 0.35)';
          g.fillRect(0, bottom - 3, W, 3);
          g.fillStyle = '#4a2c1a';
          g.font = '900 38px Rubik, system-ui, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, W / 2, (top + bottom) / 2);
          from = to;
        }
        g.fillStyle = 'rgba(70, 40, 20, 0.5)';
        for (let i = 0; i <= 20; i++) {
          const yy = H - 8 - (i / 20) * (H - 16);
          g.fillRect(0, yy, i % 5 === 0 ? 28 : 14, 3);
          g.fillRect(W - (i % 5 === 0 ? 28 : 14), yy, i % 5 === 0 ? 28 : 14, 3);
        }
      });
      board.position.set(TX, BOARD_Y0 + BOARD_H / 2, TZ - 0.09);
      d.scene.add(board);
      for (const sx of [-0.5, 0.5]) {
        d.cyl(0.045, 0.045, BOARD_H, 0x6b7280, d.scene, 8).position.set(TX + sx, BOARD_Y0 + BOARD_H / 2, TZ - 0.02);
      }
      const plaque = d.panel(1.5, 0.3, 512, (g, W, H) => {
        g.fillStyle = '#e8453c';
        g.beginPath();
        g.roundRect(0, 0, W, H, 40);
        g.fill();
        g.fillStyle = '#fff7e0';
        g.font = '900 100px Rubik, system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('СИЛОМЕР', W / 2, H / 2 + 6);
      });
      plaque.position.set(TX, 0.2, TZ + 0.62);
      d.scene.add(plaque);

      // колокол на перекладине
      const BELL_Y = 4.6;
      for (const sx of [-0.52, 0.52]) {
        d.box(0.08, BELL_Y - 3.95, 0.08, 0xb87a3d, d.scene).position.set(TX + sx, (BELL_Y + 3.95) / 2, TZ - 0.02);
      }
      d.box(1.2, 0.09, 0.09, 0xb87a3d, d.scene).position.set(TX, BELL_Y, TZ - 0.02);
      const bell = new THREE.Group();
      bell.position.set(TX, BELL_Y - 0.02, TZ - 0.02);
      const prof = [[0.01, 0], [0.07, -0.02], [0.17, -0.08], [0.25, -0.2], [0.29, -0.34], [0.34, -0.46], [0.42, -0.57], [0.45, -0.6], [0.4, -0.6], [0.3, -0.5], [0.22, -0.34], [0.14, -0.2], [0.01, -0.1]];
      const lathe = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 28);
      const bellMat = d.mat(0xf3b634, { rough: 0.3, metal: 0.35 });
      bellMat.side = THREE.DoubleSide;
      bell.add(new THREE.Mesh(lathe, bellMat));
      d.ball(0.1, 0xb9801f, bell, 12).position.y = -0.58;
      d.scene.add(bell);
      const flag = d.box(0.38, 0.24, 0.03, 0xff5a6e, d.scene);
      flag.position.set(TX + 0.2, BELL_Y + 0.3, TZ - 0.02);
      d.cyl(0.02, 0.02, 0.5, 0xf4efe4, d.scene, 6).position.set(TX, BELL_Y + 0.25, TZ - 0.02);

      // шайба и указатель
      const puck = new THREE.Group();
      const disc = d.cyl(0.23, 0.23, 0.16, 0xe8453c, puck, 28);
      disc.rotation.x = Math.PI / 2;
      const ring = d.cyl(0.14, 0.14, 0.17, 0xfff1d6, puck, 24);
      ring.rotation.x = Math.PI / 2;
      puck.position.set(TX, Y0, TZ + 0.1);
      d.scene.add(puck);
      const needleDot = d.glow(0xffe9a0, 0.75, 0.95);
      needleDot.position.set(TX - 0.78, Y0, TZ + 0.1);
      const arrow = d.box(0.26, 0.1, 0.05, 0xff5a6e, d.scene);
      arrow.position.set(TX - 0.66, Y0, TZ + 0.1);

      // площадка для удара
      const pad = d.cyl(0.46, 0.5, 0.12, 0xe8453c, d.scene, 28);
      pad.position.set(TX, 0.06, PAD_Z);
      const padRing = d.cyl(0.3, 0.3, 0.125, 0xfff1d6, d.scene, 24);
      padRing.position.set(TX, 0.06, PAD_Z);

      // герой с молотом: молот лежит в «руках» желейки и двигается вместе с её телом
      const me = d.jelly({ name: 'Ты', x: TX - 1.22, z: PAD_Z, outfit: { c: 5, h: 'bandana' } });
      me.face(TX, PAD_Z);
      const anya = d.jelly({ name: 'Аня', x: TX - 4.1, z: -1.1, outfit: { c: 12, h: 'straw' } });
      anya.face(TX, TZ + 0.6);
      const kolya = d.jelly({ name: 'Коля', x: TX + 2.9, z: -0.8, outfit: { c: 2, h: 'cap' } });
      kolya.face(TX, TZ + 0.6);
      const crowd = [anya, kolya];

      const hammer: Group = new THREE.Group();
      d.cyl(0.04, 0.045, 1.2, 0xb98249, hammer, 8).position.y = 0.46;
      const mallet = new THREE.Group();
      const headCyl = d.cyl(0.17, 0.17, 0.5, 0xe8453c, mallet, 18);
      headCyl.rotation.x = Math.PI / 2;
      for (const sz of [-0.27, 0.27]) {
        const cap = d.cyl(0.18, 0.18, 0.06, 0xf4d35e, mallet, 18);
        cap.rotation.x = Math.PI / 2;
        cap.position.z = sz;
      }
      mallet.position.y = 1.08;
      hammer.add(mallet);
      me.avatar.held.add(hammer);

      // поза молота: угол вокруг оси «вправо» желейки (плюс — назад) и положение рук
      const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
      const pose = (a: number, gy: number, gz: number): void => {
        hammer.position.set(0, gy, gz);
        hammer.rotation.x = a;
        me.avatar.hands = [-0.13, gy, gz, 0.13, gy, gz];
      };
      const READY = { a: 0.55, gy: 0.95, gz: -0.3 };
      const RAISED = { a: 1.25, gy: 1.45, gz: -0.05 };
      const STRIKE = { a: -2.45, gy: 1.05, gz: -0.55 };
      const REBOUND = { a: -1.9, gy: 1.0, gz: -0.5 };
      const setPose = (p: { a: number; gy: number; gz: number }): void => pose(p.a, p.gy, p.gz);
      const mix = (p: typeof READY, q: typeof READY, k: number): void => pose(lerp(p.a, q.a, k), lerp(p.gy, q.gy, k), lerp(p.gz, q.gz, k));
      setPose(READY);

      const verdict = (p: number): { text: string; color: string; me: number; crowd: number } => {
        if (p < 0.2) return { text: 'слабак!', color: '#d9dee5', me: ACT.tired, crowd: ACT.laugh };
        if (p < 0.45) return { text: 'так себе', color: '#ffffff', me: ACT.tired, crowd: ACT.laugh };
        if (p < 0.7) return { text: 'сила есть', color: '#ffe08a', me: ACT.wave, crowd: ACT.wave };
        if (p < BELL_AT) return { text: 'силач!', color: '#ffb347', me: ACT.dance, crowd: ACT.wave };
        return { text: 'ЗВОН!', color: '#ffd23f', me: ACT.dance, crowd: ACT.dance };
      };

      const badge = d.badge(TX - 2.2, 3.1, 0, 3.4);
      const meter = ui.meter('Сила');
      meter.zone(BELL_AT, 1);
      const powerStat = ui.stat('Удар', '—');
      let best = 0;
      try {
        best = Number(localStorage.getItem('lab.strong.best')) || 0;
      } catch {
        // без памяти
      }
      const bestStat = ui.stat('Рекорд', best ? String(best) : '—');

      type Phase = 'ready' | 'wind' | 'swing' | 'rise' | 'fall' | 'after';
      let phase: Phase = 'ready';
      let ph = 0;
      let needleT = 0;
      let needle = 0;
      let power = 0;
      let peakY = Y0;
      let bellT = 99;
      let padK = 0;

      const strike = (): void => {
        if (phase !== 'ready') return;
        power = needle;
        phase = 'wind';
        ph = 0;
        meter.set(power);
        badge.hide();
        sound.tick(1.3);
      };
      const btn = ui.button('Бей!', strike, true);

      function impact(): void {
        phase = 'rise';
        ph = 0;
        peakY = Y0 + SPAN * power;
        padK = 1;
        sound.tone({ f0: 150, f1: 55, dur: 0.22, type: 'sine', vol: 0.6 });
        sound.noise({ dur: 0.1, vol: 0.3, lp0: 2200, lp1: 400 });
        d.fx.sparkle(TX, 0.35, PAD_Z, 8 + Math.round(power * 30));
        me.avatar.jolt(0.35 + 0.5 * power);
        sound.whoosh();
      }

      function peak(): void {
        const v = verdict(power);
        badge.show(v.text, v.color);
        me.action(v.me);
        for (const c of crowd) c.action(v.crowd);
        const pct = Math.round(power * 100);
        powerStat.set(String(pct));
        if (pct > best) {
          best = pct;
          bestStat.set(String(pct));
          try {
            localStorage.setItem('lab.strong.best', String(pct));
          } catch {
            // не запомнили
          }
        }
        if (power >= BELL_AT) {
          bellT = 0;
          sound.ding();
          window.setTimeout(() => sound.ding(), 180);
          d.fx.confetti(TX, BELL_Y - 0.4, TZ + 0.3, 46, 0, 1, 0.2, 0.9, 5.5);
          sound.fanfare();
          ui.note('Звон на всю площадь! Попробуй ещё раз.');
        } else {
          sound.tone({ f0: 330 + 380 * power, f1: 200 + 200 * power, dur: 0.18, type: 'triangle', vol: 0.18 });
          ui.note(power < 0.2 ? 'Это был слабак? Жми ещё.' : `Сила ${Math.round(power * 100)}. Чтобы позвонить в колокол, жми в самом верху шкалы.`);
        }
      }

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        tap() {
          strike();
        },
        update(dt, t) {
          ph += dt;
          if (phase === 'ready') {
            needleT += dt;
            needle = 0.5 - 0.5 * Math.cos(needleT * 2.3);
            meter.set(needle);
            setPose(READY);
          } else if (phase === 'wind') {
            const k = Math.min(1, ph / 0.3);
            mix(READY, RAISED, k * k * (3 - 2 * k));
            if (ph >= 0.36) {
              phase = 'swing';
              ph = 0;
            }
          } else if (phase === 'swing') {
            const k = Math.min(1, ph / 0.17);
            mix(RAISED, STRIKE, k * k);
            if (k >= 1) impact();
          } else if (phase === 'rise') {
            const dur = 0.2 + 0.75 * Math.pow(power, 0.8);
            const u = Math.min(1, ph / dur);
            puck.position.y = lerp(Y0, peakY, 1 - Math.pow(1 - u, 2.2));
            mix(STRIKE, REBOUND, Math.min(1, ph / 0.15));
            if (u >= 1) {
              phase = 'fall';
              ph = 0;
              peak();
            }
          } else if (phase === 'fall') {
            const dur = 0.3 + 0.6 * power;
            const u = Math.min(1, ph / dur);
            puck.position.y = lerp(peakY, Y0, u * u);
            if (u >= 1) {
              phase = 'after';
              ph = 0;
              d.fx.sparkle(TX, Y0 + 0.2, TZ + 0.2, 4);
            }
          } else {
            const k = Math.min(1, ph / 0.6);
            mix(REBOUND, READY, k * k * (3 - 2 * k));
            if (ph > 2.4) {
              phase = 'ready';
              needleT = 0;
              badge.hide();
              me.action(ACT.none);
              for (const c of crowd) c.action(ACT.none);
            }
          }
          // указатель идёт вдоль шкалы, пока нужно целиться
          const ny = phase === 'ready' ? Y0 + SPAN * needle : Y0 + SPAN * power;
          needleDot.position.y = ny;
          arrow.position.y = ny;
          needleDot.visible = arrow.visible = phase === 'ready' || phase === 'wind' || phase === 'swing';
          // колокол звонит, пока затухает
          bellT += dt;
          bell.rotation.z = bellT < 4 ? 0.5 * Math.exp(-bellT * 1.7) * Math.sin(bellT * 15) : 0;
          // площадка проседает от удара
          padK = Math.max(0, padK - dt * 5);
          pad.scale.y = padRing.scale.y = 1 - 0.55 * padK;
          btn.disabled = phase !== 'ready';
          d.update(dt, t);
        },
        dispose() {
          d.dispose();
        },
      };
    },
  },
};
