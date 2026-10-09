// Локальный пример исследования: три конкурсных места и шесть последовательных уловов.
import { COLOR, fish, jelly, label, scene } from '../art.ts';
import {
  KEEP_NET_BONUS, KEEP_NET_CATCHES, KEEP_NET_NAMES, KEEP_NET_TARGET,
  keepnetCandidate, keepnetChoose, keepnetScore, keepnetStart, type KeepnetFish,
} from '../../../shared/lab-keepnet.ts';
import type { Experiment } from '../types.ts';

export const researchKeepnet: Experiment = {
  id: 'research-keepnet',
  n: 33,
  title: 'Конкурсный садок',
  category: 'event',
  size: 'M',
  pitch: 'Шесть уловов и три места: оставь тяжёлую рыбу или возьми новый вид ради бонуса.',
  fun: 'Лёгкий бычок иногда полезнее ещё одной большой кефали. Следующий улов заставляет пересмотреть состав.',
  touches: 'Одиночный учебный выбор. Сетевое решение пары и настоящая рыбалка здесь не подключены.',
  research: {
    sourceId: 'w3-lab-derby-selected-keepnet',
    focus: 'Вес против разнообразия в ограниченном конкурсном садке.',
    players: 'Идея: две пары. Этот стенд: один человек.',
    round: '6 уловов · 1–2 минуты',
    decision: 'Сохранить тройку или заменить один экземпляр: 100 г = 1 очко, каждый вид = ещё 15.',
    test: 'На повторе игрок хотя бы раз отказывается от более тяжёлой рыбы ради состава и может объяснить выбор.',
    scope: 'Локальная 3D-проба решений, без подтверждения напарника, настоящих рыб, жетонов и сохранений.',
    references: [{
      title: 'Bassmaster Team Championship — правила 2025: ограниченный зачётный улов',
      url: 'https://www.bassmaster.com/wp-content/uploads/2025/09/2025-Bassmaster-Team-Championship-Rules_Final.pdf',
    }],
  },
  art: () => scene('deck', 'Три лотка с рыбами и новый улов для конкурсного садка', [
    jelly({ x: 49, y: 171, c: 'orange', hat: 'straw', face: 'smug', arms: 'hold', s: 0.7 }),
    `<rect x="88" y="108" width="219" height="59" rx="9" fill="${COLOR.wood}" stroke="${COLOR.woodDark}" stroke-width="3"/>`,
    ...[124, 196, 268].map((x, i) => `<rect x="${x - 31}" y="116" width="62" height="40" rx="7" fill="${COLOR.paper}"/>` + fish(x, 137, 0.54, 0, [COLOR.gray, COLOR.orange, COLOR.green][i]) + label(x, 153, String(i + 1), 10)),
    label(193, 78, 'ВЕС + РАЗНЫЕ ВИДЫ', 15),
    fish(180, 185, 0.58, -6, COLOR.pink),
    label(268, 189, 'Оставить?', 12),
  ]),
  live: {
    cta: 'Собрать садок',
    hint: '1, 2, 3 — положить в выбранное место или заменить рыбу. 0 — пропустить. R — другой раунд. Клавиши работают внутри этой карточки; всё доступно кнопками.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ cam: [0.35, 4.1, 7.3], look: [0, 0.9, 0.3], radius: 6, rail: false, fov: 47 });
      const player = d.jelly({ name: 'Ты', x: -3.45, z: -0.4, outfit: { c: 9, h: 'straw' } });
      player.face(0, 0.2);
      let round = 0;
      let game = keepnetStart(round);
      let disposed = false;
      let locked = 0;
      let cheer = 0;

      // Одна большая столешница и три неглубоких лотка. Кандидат — на отдельном переднем столике.
      d.box(5.75, 0.2, 2.35, 0xb78048).position.set(0, 0.76, -0.5);
      for (const x of [-2.45, 2.45]) for (const z of [-1.3, 0.3]) {
        d.box(0.2, 0.65, 0.2, 0x895a38).position.set(x, 0.325, z);
      }
      d.box(2.4, 0.2, 1.5, 0xb78048).position.set(0, 0.61, 2.1);
      for (const x of [-0.95, 0.95]) d.box(0.16, 0.51, 0.85, 0x895a38).position.set(x, 0.255, 2.1);

      const xs = [-1.85, 0, 1.85];
      function tray(x: number, y: number, z: number, w: number): void {
        d.box(w, 0.06, 1.18, 0xf2dfb4).position.set(x, y, z);
        for (const dz of [-0.59, 0.59]) d.box(w, 0.13, 0.055, 0x6d9e94).position.set(x, y + 0.045, z + dz);
        for (const dx of [-w / 2, w / 2]) d.box(0.055, 0.13, 1.18, 0x6d9e94).position.set(x + dx, y + 0.045, z);
      }
      xs.forEach((x) => tray(x, 0.9, -0.5, 1.68));
      tray(0, 0.75, 2.1, 2.02);

      // Простые узнаваемые рыбы; четыре постоянных объекта переиспользуются, геометрия не создаётся на каждый улов.
      function fishModel(x: number, y: number, z: number) {
        const root = new THREE.Group();
        root.position.set(x, y, z);
        d.scene.add(root);
        const material = d.mat(0x9eafa3, { rough: 0.4 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material);
        body.scale.set(0.53, 0.23, 0.2);
        root.add(body);
        const tail = new THREE.Group();
        tail.position.x = -0.53;
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.36, 3), material);
        fin.rotation.z = -Math.PI / 2;
        fin.scale.z = 0.35;
        fin.position.x = -0.12;
        tail.add(fin);
        root.add(tail);
        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 3), material);
        dorsal.position.set(-0.08, 0.22, 0);
        dorsal.scale.z = 0.3;
        root.add(dorsal);
        for (const side of [-1, 1]) {
          d.ball(0.063, 0xfffaf0, root, 10).position.set(0.36, 0.095, side * 0.148);
          d.ball(0.034, 0x272322, root, 8).position.set(0.375, 0.1, side * 0.195);
        }
        return {
          root, tail,
          set(f: KeepnetFish | null): void {
            root.visible = !!f;
            if (!f) return;
            material.color.set(f.species === 'mullet' ? 0x9eafa3 : f.species === 'scad' ? 0x75aeb9 : 0xc48759);
            const size = 0.6 + Math.sqrt(f.g / 1000) * 0.3;
            root.scale.set(size, size * (f.species === 'goby' ? 1.16 : f.species === 'scad' ? 0.78 : 1), size);
          },
        };
      }
      const keptModels = xs.map((x) => fishModel(x, 1.13, -0.5));
      const candidateModel = fishModel(0, 0.98, 2.1);
      const slotLabels = xs.map((x) => d.badge(x, 1.87, -0.9, 1.82));
      const candidateLabel = d.badge(0, 1.75, 2.2, 3.1);
      const scoreLabel = d.badge(0, 2.85, -1.9, 4.5);
      const progress = ui.stat('Улов');
      const candidateStat = ui.stat('На выбор');
      const scoreStat = ui.stat('Счёт');
      ui.stat('Правило', `100 г = 1 очко · +${KEEP_NET_BONUS} за каждый вид · цель ${KEEP_NET_TARGET}`);
      const slotStats = xs.map((_, i) => ui.stat(`Место ${i + 1}`));
      const buttons = xs.map((_, i) => ui.button(`В место ${i + 1}`, () => choose(i), true));
      const skip = ui.button('Пропустить · 0', () => choose('skip'));
      const again = ui.button('Другой улов · R', replay);
      const kg = (g: number): string => `${(g / 1000).toFixed(1).replace('.', ',')} кг`;
      const describe = (f: KeepnetFish | null): string => f ? `${KEEP_NET_NAMES[f.species]} · ${kg(f.g)}` : 'Пусто';
      const signed = (n: number): string => n > 0 ? `+${n}` : String(n);

      function enabled(): void {
        const blocked = locked > 0 || !keepnetCandidate(game);
        for (const b of buttons) b.disabled = blocked;
        skip.disabled = blocked;
        again.disabled = locked > 0;
      }

      function render(message = ''): void {
        const candidate = keepnetCandidate(game);
        const score = keepnetScore(game.slots);
        progress.set(candidate ? `${game.next + 1} из ${KEEP_NET_CATCHES}` : `${KEEP_NET_CATCHES} из ${KEEP_NET_CATCHES} · итог`);
        candidateStat.set(candidate ? describe(candidate) : 'Все предложения закончились');
        scoreStat.set(`${score.total} = ${score.weight} за вес + ${score.variety} за виды (${score.species})`);
        scoreLabel.show(candidate ? `${score.total} / ${KEEP_NET_TARGET} очков` : `Итог: ${score.total} очков`, score.total >= KEEP_NET_TARGET ? '#ffd978' : '#ffffff');
        candidateModel.set(candidate);
        if (candidate) candidateLabel.show(`Новый: ${describe(candidate)}`, '#fff0c4');
        else candidateLabel.hide();
        game.slots.forEach((f, i) => {
          keptModels[i].set(f);
          slotLabels[i].show(`${i + 1} · ${f ? kg(f.g) : 'пусто'}`, f ? '#ffffff' : '#dbd4c5');
          slotStats[i].set(describe(f));
          if (candidate) {
            const next = keepnetScore(keepnetChoose(game, i).slots);
            buttons[i].textContent = `${f ? 'Заменить' : 'В место'} ${i + 1} · ${signed(next.total - score.total)} очк.`;
            buttons[i].title = `${f ? `Вместо ${describe(f)}` : 'Занять пустое место'}: вес ${signed(next.weight - score.weight)}, разнообразие ${signed(next.variety - score.variety)}`;
          }
        });
        ui.note(candidate
          ? message || 'У тебя три конкурсных места. Все рыбы учебные: выбирай по весу и видам, можно пропустить даже первый улов.'
          : `${score.total >= KEEP_NET_TARGET ? 'Цель достигнута!' : `До цели не хватило ${KEEP_NET_TARGET - score.total} очк.`} В садке ${kg(score.grams)}, видов ${score.species}. Другой раунд предложит новый улов.`);
        enabled();
      }

      function choose(choice: number | 'skip'): void {
        if (disposed || locked > 0) return;
        const candidate = keepnetCandidate(game);
        if (!candidate) return;
        const before = keepnetScore(game.slots);
        const next = keepnetChoose(game, choice);
        if (next === game) return;
        game = next;
        locked = 0.22;
        const score = keepnetScore(game.slots);
        if (choice === 'skip') sound.plip(0.9);
        else {
          sound.pop();
          player.avatar.jolt(0.12);
        }
        render(choice === 'skip' ? `Пропустил: ${describe(candidate)}. Состав сохранён.`
          : `В место ${choice + 1}: ${describe(candidate)}. Вес ${signed(score.weight - before.weight)}, разнообразие ${signed(score.variety - before.variety)}.`);
        if (!keepnetCandidate(game)) {
          player.action(score.total >= KEEP_NET_TARGET ? kit.ACT.wave : kit.ACT.laugh);
          cheer = 2.8;
          if (score.total >= KEEP_NET_TARGET) sound.fanfare();
          else sound.ding();
        }
      }

      function replay(): void {
        if (disposed || locked > 0) return;
        game = keepnetStart(++round);
        cheer = 0;
        player.action(kit.ACT.none);
        sound.tick();
        render('Новый улов. В одной серии выгоднее третий вид, в другой — действительно тяжёлая рыба.');
      }

      function keydown(e: KeyboardEvent): void {
        if (disposed || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
        const target = e.target;
        if (!(target instanceof HTMLElement) || !skip.closest('.lab-card')?.contains(target)) return;
        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        if (e.key === '1' || e.key === '2' || e.key === '3') { e.preventDefault(); choose(Number(e.key) - 1); }
        else if (e.code === 'KeyR') { e.preventDefault(); replay(); }
        else if (e.key === '0') { e.preventDefault(); choose('skip'); }
      }
      window.addEventListener('keydown', keydown);
      render();

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) {
          if (locked > 0) { locked = Math.max(0, locked - dt); enabled(); }
          if (cheer > 0) {
            cheer -= dt;
            if (cheer <= 0) player.action(kit.ACT.none);
          }
          candidateModel.tail.rotation.y = Math.sin(t * 2.8) * 0.12;
          keptModels.forEach((m, i) => { m.tail.rotation.y = Math.sin(t * 1.6 + i) * 0.045; });
          d.update(dt, t);
        },
        tap(nx, ny) {
          const at = kit.floorAt(d.camera, nx, ny, 0.9);
          if (!at || Math.abs(at.z + 0.5) > 0.75) return;
          const slot = xs.findIndex((x) => Math.abs(at.x - x) < 0.84);
          if (slot >= 0) choose(slot);
        },
        dispose() {
          disposed = true;
          window.removeEventListener('keydown', keydown);
          d.dispose();
        },
      };
    },
  },
};
