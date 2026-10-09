// Локальная примерка составного поплавка: никаких наград, экипировки и записей профиля.
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import { COLOR, label, pier, ripple, scene } from '../art.ts';
import type { Experiment } from '../types.ts';

const FORMS = ['Капля', 'Уточка'] as const;
const STEMS = ['Тростинка', 'Перо'] as const;
const PATTERNS = ['Коралл', 'Морская карта', 'Мята в горошек'] as const;

export const floatBuilder: Experiment = {
  id: 'research-float-builder',
  n: 34,
  title: 'Собери свой поплавок',
  category: 'outfit',
  size: 'M',
  pitch: 'Две формы, два стержня и три узора — собери свой вариант и посмотри, как он ведёт себя на воде.',
  fun: 'У снасти появляется свой характер: можно менять детали и сразу сравнивать силуэт поклёвки.',
  touches: 'Локальная примерка деталей поплавка. Прогресс, награды и настоящая снасть не меняются.',
  research: {
    sourceId: 'w3-fishing-reward-components',
    focus: 'Составная косметическая снасть',
    players: '1 в превью; идея для компании рыбаков',
    round: '1–2 минуты на несколько вариантов',
    decision: 'Какие форма, стержень и узор делают твой поплавок узнаваемым?',
    test: 'Собрать три разных варианта и проверить, хорошо ли различим каждый при поклёвке.',
    scope: 'Здесь доступны все детали: 12 сочетаний, смена модели и пробное погружение. Выдача наград, владение, сохранение и экипировка не подключены.',
    references: [{ title: 'Minecraft — Block of the Week: Loom', url: 'https://www.minecraft.net/en-us/article/block-week--loom' }],
  },
  art: () => scene('sea', 'Крупный составной поплавок на воде: форма, стержень и цвет выбираются отдельно', [
    pier(0, 165, 65),
    ripple(183, 163, 62),
    `<ellipse cx="183" cy="147" rx="29" ry="36" fill="${COLOR.red}" stroke="${COLOR.ink}" stroke-width="2"/>`,
    `<path d="M156 134h54v13h-54" fill="${COLOR.paper}"/>`,
    `<path d="M182 118V59" stroke="${COLOR.woodDark}" stroke-width="6" stroke-linecap="round"/>`,
    `<path d="M182 73V53" stroke="${COLOR.red}" stroke-width="8" stroke-linecap="round"/>`,
    `<path d="M253 125V56q24 11 0 48q-17-16 0-30" fill="${COLOR.paper}" stroke="${COLOR.woodDark}" stroke-width="2"/>`,
    `<circle cx="80" cy="111" r="14" fill="${COLOR.seaLight}"/><circle cx="75" cy="107" r="3" fill="${COLOR.white}"/><circle cx="85" cy="116" r="3" fill="${COLOR.white}"/>`,
    label(160, 29, 'СВОЙ ПОПЛАВОК', 16),
  ]),
  live: {
    cta: 'Собрать поплавок',
    hint: 'Выбери детали, затем нажми «Поклёвка». Мышью можно повернуть вид; Tab выбирает кнопку, Enter или пробел нажимает её.',
    create({ THREE, kit, ui, sound }) {
      const W = kit.WATER;
      const X = 7.2;
      const d = kit.diorama({ radius: 4.6, rail: false, cam: [8.8, 1.1, 4.4], look: [X, W + 0.95, 0], fov: 40 });
      const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      const float: Group = new THREE.Group();
      float.name = 'research-float';
      float.position.set(X, W + 0.18, 0);
      d.scene.add(float);

      // Три небольшие рисованные текстуры, созданные здесь, без внешних картинок.
      const textures = PATTERNS.map((_, index) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        const g = canvas.getContext('2d')!;
        g.fillStyle = [COLOR.red, COLOR.paper, COLOR.seaLight][index]!;
        g.fillRect(0, 0, 256, 256);
        if (index === 0) {
          g.fillStyle = COLOR.paper;
          g.fillRect(0, 88, 256, 55);
          g.fillStyle = COLOR.orange;
          g.fillRect(0, 158, 256, 18);
        } else if (index === 1) {
          g.strokeStyle = '#d6af78';
          g.lineWidth = 2;
          for (let n = 24; n < 256; n += 48) {
            g.beginPath(); g.moveTo(n, 0); g.lineTo(n, 256); g.moveTo(0, n); g.lineTo(256, n); g.stroke();
          }
          g.strokeStyle = COLOR.brown;
          g.lineWidth = 7;
          g.beginPath(); g.moveTo(0, 174); g.bezierCurveTo(72, 194, 50, 90, 116, 117); g.bezierCurveTo(170, 143, 181, 39, 256, 62); g.stroke();
          g.fillStyle = COLOR.red;
          for (const [x, y] of [[60, 150], [179, 99]]) { g.beginPath(); g.arc(x!, y!, 9, 0, Math.PI * 2); g.fill(); }
        } else {
          g.fillStyle = COLOR.paper;
          for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
            g.beginPath(); g.arc(col * 56 + (row % 2) * 28, row * 56 + 15, 11, 0, Math.PI * 2); g.fill();
          }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
      });
      const bodyMaterial: MeshStandardMaterial = d.mat(0xffffff, { map: textures[0], rough: 0.42 });
      const accentMaterial = d.mat(0xfff1d6, { rough: 0.5 });
      const shapedBall = (parent: Group, radius: number, material: MeshStandardMaterial, sx: number, sy: number, sz: number): Mesh => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 20), material);
        mesh.scale.set(sx, sy, sz);
        parent.add(mesh);
        return mesh;
      };

      const drop = new THREE.Group();
      drop.name = 'float-shape-drop';
      shapedBall(drop, 0.58, bodyMaterial, 0.84, 1.12, 0.84).position.y = 0.27;
      float.add(drop);

      const duck = new THREE.Group();
      duck.name = 'float-shape-duck';
      shapedBall(duck, 0.68, bodyMaterial, 1.05, 0.67, 0.77).position.y = 0.25;
      d.cyl(0.15, 0.2, 0.35, 0xfff1d6, duck).position.set(0.36, 0.6, 0);
      shapedBall(duck, 0.32, accentMaterial, 1, 1.05, 0.95).position.set(0.46, 0.85, 0);
      const beak = d.ball(0.2, 0xff8a1c, duck, 16);
      beak.scale.set(1.3, 0.38, 0.72);
      beak.position.set(0.77, 0.79, 0);
      for (const side of [-1, 1]) {
        d.ball(0.042, 0x3a2b31, duck, 12).position.set(0.59, 0.91, side * 0.24);
        shapedBall(duck, 0.33, accentMaterial, 1.2, 0.65, 0.25).position.set(-0.02, 0.34, side * 0.46);
      }
      float.add(duck);

      // Общее крепление: оба стержня действительно подходят к обеим формам.
      const mount = new THREE.Group();
      mount.name = 'float-stem-mount';
      float.add(mount);
      const reed = new THREE.Group();
      reed.name = 'float-stem-reed';
      d.cyl(0.034, 0.045, 1.17, 0x8d5a34, reed, 12).position.y = 0.57;
      d.cyl(0.052, 0.052, 0.24, 0xff5a5f, reed, 12).position.y = 1.04;
      d.cyl(0.047, 0.047, 0.1, 0xfff7e4, reed, 12).position.y = 0.86;
      mount.add(reed);

      const quill = new THREE.Group();
      quill.name = 'float-stem-quill';
      d.cyl(0.022, 0.032, 1.36, 0xe6c47b, quill, 10).position.y = 0.66;
      const feather = new THREE.Shape();
      feather.moveTo(0, 0.12);
      feather.bezierCurveTo(-0.29, 0.44, -0.24, 1.08, 0, 1.43);
      feather.bezierCurveTo(0.33, 1.0, 0.23, 0.44, 0, 0.12);
      const featherMaterial = d.mat(0xfff7e4, { rough: 0.8 });
      featherMaterial.side = THREE.DoubleSide;
      const vane = new THREE.Mesh(new THREE.ShapeGeometry(feather, 18), featherMaterial);
      vane.position.z = 0.022;
      quill.add(vane);
      for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
        const vein = d.box(0.19, 0.012, 0.012, 0xd6b98c, quill);
        vein.position.set(side * 0.085, 0.42 + i * 0.16, 0.038);
        vein.rotation.z = side * 0.44;
      }
      const tip = d.ball(0.052, 0xff5a5f, quill, 12);
      tip.scale.set(1.15, 2.3, 0.8);
      tip.position.set(0, 1.38, 0.03);
      mount.add(quill);
      d.cyl(0.027, 0.027, 0.72, 0x8d5a34, float, 10).position.y = -0.53;

      let form = 0;
      let stem = 0;
      let pattern = 0;
      let biteTime = -1;
      let waterTime = 0;
      let lastStage = '';
      const selections: Array<{ buttons: HTMLButtonElement[]; names: readonly string[]; active: () => number }> = [];
      const buildStat = ui.stat('Собрано');
      const waterStat = ui.stat('На воде', 'Спокойно');

      function sync(): void {
        drop.visible = form === 0;
        duck.visible = form === 1;
        reed.visible = stem === 0;
        quill.visible = stem === 1;
        mount.position.set(form === 1 ? -0.22 : 0, 0.76, 0);
        bodyMaterial.map = textures[pattern]!;
        accentMaterial.color.setHex([0xfff1d6, 0xe6c47b, 0x51b6a3][pattern]!);
        for (const row of selections) row.buttons.forEach((button, i) => {
          const selected = row.active() === i;
          button.textContent = `${selected ? '✓ ' : ''}${row.names[i]}`;
          button.setAttribute('aria-pressed', String(selected));
          if (selected) button.dataset.primary = 'true'; else delete button.dataset.primary;
        });
        buildStat.set(`${FORMS[form]} · ${STEMS[stem]} · ${PATTERNS[pattern]}`);
      }

      function stopBite(): void {
        biteTime = -1;
        lastStage = '';
        biteButton.disabled = false;
        biteButton.textContent = 'Поклёвка';
        waterStat.set('Спокойно');
      }

      function options(title: string, names: readonly string[], active: () => number, choose: (i: number) => void): void {
        const buttons = names.map((name, i) => ui.button(name, () => {
          choose(i);
          stopBite();
          sync();
          d.ripples.spawn(X, 0, 1.1, 1.1);
          sound.tick(1 + i * 0.1);
        }));
        const group = document.createElement('div');
        group.className = 'lab-field';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', title);
        const heading = document.createElement('b');
        heading.textContent = `${title}:`;
        group.append(heading);
        buttons[0]!.before(group);
        group.append(...buttons);
        selections.push({ buttons, names, active });
      }
      options('Форма', FORMS, () => form, i => { form = i; });
      options('Стержень', STEMS, () => stem, i => { stem = i; });
      options('Узор', PATTERNS, () => pattern, i => { pattern = i; });
      const biteButton = ui.button('Поклёвка', () => {
        if (biteTime >= 0) return;
        biteTime = 0;
        lastStage = '';
        biteButton.disabled = true;
        biteButton.textContent = 'Проверяем на воде…';
        d.ripples.spawn(X, 0, 1.4, 1.4);
        sound.plip(1.1);
      }, true);
      ui.button('Сбросить', () => {
        form = stem = pattern = 0;
        stopBite();
        sync();
        sound.tick();
      });
      ui.note('Все детали доступны для примерки. Этот вариант не меняет твою снасть в игре.');
      sync();

      const ease = (x: number): number => x * x * (3 - 2 * x);
      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          let dip = 0;
          let tilt = 0;
          if (biteTime >= 0) {
            biteTime += dt;
            const stage = biteTime < 0.7 ? 'Подрагивает' : biteTime < 1.25 ? 'Погружается' : biteTime < 1.8 ? 'Под водой' : 'Возвращается';
            if (stage !== lastStage) {
              lastStage = stage;
              waterStat.set(stage);
              if (stage === 'Погружается' || stage === 'Возвращается') {
                d.ripples.spawn(X, 0, 1.6, 1.4);
                sound.plip(stage === 'Возвращается' ? 1.25 : 0.85);
              }
            }
            if (biteTime < 0.7) {
              dip = -0.1 * Math.abs(Math.sin(biteTime * 15));
              tilt = Math.sin(biteTime * 17) * 0.1;
            } else if (biteTime < 1.25) dip = -2.75 * ease((biteTime - 0.7) / 0.55);
            else if (biteTime < 1.8) dip = -2.75;
            else if (biteTime < 2.8) dip = -2.75 * (1 - ease(biteTime - 1.8));
            else stopBite();
          }
          float.position.y = W + 0.18 + dip + (reducedMotion ? 0 : Math.sin(t * 1.6) * 0.045);
          float.rotation.set(0, -0.28, tilt + (reducedMotion ? 0 : Math.sin(t * 1.3) * 0.055));
          waterTime += dt;
          if (waterTime > 2.2 && biteTime < 0) {
            waterTime = 0;
            d.ripples.spawn(X, 0, 0.75, 1.8);
          }
          d.update(dt, t);
        },
        dispose() {
          // Неактивные варианты текстур не лежат в material.map, поэтому освобождаем и их.
          for (const texture of textures) texture.dispose();
          d.dispose();
        },
      };
    },
  },
};
