// Прототип «Самолёт с баннером»: пролетает над набережной с твоим текстом до 40 знаков.
import { COLOR, banner, jelly, palm, plane, scene } from '../art.ts';
import type { BufferAttribute, Group, Mesh, PlaneGeometry } from 'three';
import { sanitizeChat } from '../../../shared/text.ts';
import type { Experiment } from '../types.ts';

export const bannerPlane: Experiment = {
  id: 'banner-plane',
  n: 19,
  title: 'Самолёт с баннером',
  category: 'social',
  size: 'S',
  net: true,
  pitch: 'За 50 жетонов над набережной пролетает самолёт с твоим текстом до 40 знаков.',
  fun: 'Пляжная классика: поздравить, подколоть, позвать играть — на всю площадь.',
  art: () =>
    scene('sand', 'Над пляжем летит самолёт и тянет полотнище «С днём рождения!»', [
      palm(40, 156, 0.9),
      `<path d="M206 82Q214 74 226 68" stroke="${COLOR.ink}" stroke-width="1.6" fill="none"/>`,
      banner(52, 64, 154, 'С ДНЁМ РОЖДЕНИЯ!', 11),
      plane(262, 58, 1.1),
      jelly({ x: 120, y: 188, c: 'pink', face: 'cheer', arms: 'wave', s: 0.8, look: 0 }),
      jelly({ x: 196, y: 190, c: 'mint', hat: 'party', face: 'laugh', arms: 'up', s: 0.8 }),
      jelly({ x: 270, y: 188, c: 'yellow', face: 'cheer', arms: 'wave', s: 0.7, flip: true }),
    ]),
  live: {
    cta: 'Пустить самолёт',
    hint: 'Впиши свой текст (до 40 знаков) и нажми «Пустить самолёт» — он пролетит над площадью с твоим баннером.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const ACT = kit.ACT;
      // камера смотрит снизу вверх, как зритель с настила
      const d = kit.diorama({ cam: [0, 2.0, 5.6], look: [0, 3.0, -3.0], radius: 6.2, fov: 54 });
      const crowd = [
        d.jelly({ name: 'Аня', x: -2.4, z: -1.1, outfit: { c: 12, h: 'straw' } }),
        d.jelly({ name: 'Ты', x: 0.1, z: -0.7, outfit: { c: 5, h: 'party' } }),
        d.jelly({ name: 'Коля', x: 2.4, z: -1.2, outfit: { c: 2, h: 'cap' } }),
      ];

      // самолёт: нос в −x, размах вдоль z
      const RED = 0xe8453c;
      const CREAM = 0xfff1d6;
      const YEL = 0xffd23f;
      const plane: Group = new THREE.Group();
      const fus = d.cyl(0.22, 0.22, 1.5, RED, plane, 18);
      fus.rotation.z = Math.PI / 2;
      fus.position.x = -0.05;
      const cowl = d.cyl(0.25, 0.25, 0.32, CREAM, plane, 18);
      cowl.rotation.z = Math.PI / 2;
      cowl.position.x = -0.9;
      const tailCone = d.cyl(0.03, 0.22, 0.9, RED, plane, 14);
      tailCone.rotation.z = -Math.PI / 2;
      tailCone.position.x = 1.15;
      d.box(0.55, 0.05, 2.7, YEL, plane).position.set(-0.2, 0.42, 0);
      d.box(0.5, 0.05, 2.5, YEL, plane).position.set(-0.2, -0.1, 0);
      for (const sz of [-1, 1]) {
        d.box(0.57, 0.07, 0.22, RED, plane).position.set(-0.2, 0.42, sz * 1.31);
        d.box(0.52, 0.07, 0.2, RED, plane).position.set(-0.2, -0.1, sz * 1.21);
        for (const sx of [-0.05, -0.35]) d.box(0.035, 0.52, 0.035, 0x8d5a34, plane).position.set(sx, 0.16, sz * 0.95);
        d.box(0.04, 0.34, 0.04, 0x3b3340, plane).position.set(-0.45, -0.27, sz * 0.26);
        const wheel = d.cyl(0.15, 0.15, 0.07, 0x3b3340, plane, 14);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(-0.45, -0.44, sz * 0.3);
      }
      d.box(0.45, 0.5, 0.04, RED, plane).position.set(1.5, 0.32, 0);
      d.box(0.4, 0.04, 1.0, YEL, plane).position.set(1.45, 0.08, 0);
      d.ball(0.16, 0xffd1a8, plane, 14).position.set(0.1, 0.34, 0);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), d.mat(0x2a6df4));
      cap.position.set(0.1, 0.37, 0);
      plane.add(cap);
      const prop: Group = new THREE.Group();
      prop.position.x = -1.1;
      d.ball(0.07, 0x3b3340, prop, 10);
      d.box(0.03, 0.95, 0.11, 0x6b5744, prop);
      d.box(0.03, 0.11, 0.95, 0x6b5744, prop);
      plane.add(prop);

      // баннер: полоса ткани с надписью, сзади самолёта
      const BL = 6.4;
      const BH = 0.95;
      const SEG = 40;
      const geo: PlaneGeometry = new THREE.PlaneGeometry(BL, BH, SEG, 4);
      geo.translate(BL / 2, 0, 0);
      const pos = geo.getAttribute('position') as BufferAttribute;
      const basePos = Float32Array.from(pos.array);
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = Math.round((1024 * BH) / BL);
      const g2 = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const bannerMat = d.mat(0xffffff, { map: tex, rough: 0.9 });
      bannerMat.side = THREE.DoubleSide;
      const banner: Mesh = new THREE.Mesh(geo, bannerMat);
      banner.position.set(1.95, -0.02, 0);

      const paint = (text: string): void => {
        const W = canvas.width;
        const H = canvas.height;
        g2.clearRect(0, 0, W, H);
        g2.fillStyle = '#fffaf0';
        g2.fillRect(0, 0, W, H);
        const bw = Math.max(8, Math.round(H * 0.07));
        g2.strokeStyle = '#d6384a';
        g2.lineWidth = bw;
        g2.strokeRect(bw / 2, bw / 2, W - bw, H - bw);
        g2.fillStyle = '#d6384a';
        for (let x = 24; x < W - 24; x += 40) {
          g2.fillRect(x, bw + 4, 16, 4);
          g2.fillRect(x, H - bw - 8, 16, 4);
        }
        let size = Math.round(H * 0.6);
        g2.font = `900 ${size}px Rubik, system-ui, sans-serif`;
        while (g2.measureText(text).width > W - 90 && size > 18) {
          size -= 4;
          g2.font = `900 ${size}px Rubik, system-ui, sans-serif`;
        }
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        g2.fillStyle = '#b3232f';
        g2.fillText(text, W / 2, H / 2 + 5);
        tex.needsUpdate = true;
      };

      const rope = (ax: number, ay: number, bx: number, by: number): void => {
        const len = Math.hypot(bx - ax, by - ay);
        const r = d.cyl(0.012, 0.012, len, 0x5b4a3a, fly, 5);
        r.position.set((ax + bx) / 2, (ay + by) / 2, 0);
        r.rotation.z = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
      };
      const fly: Group = new THREE.Group();
      fly.add(plane, banner);
      rope(1.6, 0.05, 1.95, BH / 2 - 0.05);
      rope(1.6, 0.05, 1.95, -BH / 2 - 0.05);
      d.scene.add(fly);

      // полёт: пролёт справа налево по диагонали, в середине медленнее — надпись успевают прочесть
      const HEAD = 0.14;
      const DIR_X = -Math.cos(HEAD);
      const DIR_Z = Math.sin(HEAD);
      const START = { x: 8.2, y: 4.5, z: -2.5 };
      const TOTAL = 23;
      fly.rotation.y = HEAD;
      fly.position.set(START.x + DIR_X * TOTAL, START.y, START.z + DIR_Z * TOTAL); // за кадром слева, пока не начался первый пролёт
      let s = TOTAL;
      let wait = 0;
      let waving = false;
      let confettied = false;

      const input = ui.input('Текст баннера', 'С днём рождения, Миша!', 40);
      const count = ui.stat('Знаков', '22 из 40');
      const SAMPLES = ['С днём рождения, Миша!', 'Кто со мной в карты?', 'Собираемся на арбуз!', 'Коля, ты слабак :)', 'Всем привет с острова!'];
      let sample = 0;
      const cleanText = (): string => sanitizeChat(input.value).slice(0, 40) || 'Привет!';
      input.addEventListener('input', () => count.set(`${Math.min(40, input.value.length)} из 40`));
      const launch = (): void => {
        paint(cleanText());
        s = 0;
        confettied = false;
        wait = 0;
        sound.whoosh();
        ui.note('Самолёт заходит на площадь.');
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') launch();
      });
      ui.button('Пустить самолёт', launch, true);
      ui.button('Другой пример', () => {
        sample = (sample + 1) % SAMPLES.length;
        input.value = SAMPLES[sample]!;
        count.set(`${input.value.length} из 40`);
        launch();
      });
      paint(cleanText());
      void document.fonts?.load('900 80px Rubik').then(() => paint(cleanText()));

      const flap = (t: number): void => {
        for (let i = 0; i < pos.count; i++) {
          const bx = basePos[i * 3]!;
          const by = basePos[i * 3 + 1]!;
          const u = bx / BL;
          const ph = u * 9 - t * 6.5;
          pos.setXYZ(i, bx, by - 0.16 * u * u + 0.04 * u * Math.sin(ph * 0.8), (0.03 + 0.2 * u) * Math.sin(ph));
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      };

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        tap() {
          launch();
        },
        update(dt, t) {
          prop.rotation.x += dt * 38;
          if (s < TOTAL) {
            const cx = fly.position.x + Math.cos(HEAD) * (1.95 + BL / 2);
            s += (1.5 + 3.2 * Math.min(1, (cx / 5) * (cx / 5))) * dt;
            fly.position.set(START.x + DIR_X * s, START.y + 0.14 * Math.sin(t * 1.9), START.z + DIR_Z * s);
            plane.rotation.set(0.1 * Math.sin(t * 1.3), 0, 0.05 * Math.sin(t * 1.7));
            const near = Math.abs(cx) < 4;
            if (near !== waving) {
              waving = near;
              for (const j of crowd) j.action(near ? ACT.wave : ACT.none);
            }
            if (!confettied && cx < 0.4) {
              confettied = true;
              d.fx.confetti(fly.position.x + 1.5, fly.position.y - 0.3, fly.position.z, 40, 0, -0.2, 0.4, 1.2, 3);
              sound.pop();
            }
            if (s >= TOTAL) {
              wait = 1.4;
              for (const j of crowd) j.action(ACT.none);
              waving = false;
            }
          } else if ((wait -= dt) <= 0) {
            launch();
          }
          flap(t);
          d.update(dt, t);
        },
        dispose() {
          tex.dispose();
          d.dispose();
        },
      };
    },
  },
};
