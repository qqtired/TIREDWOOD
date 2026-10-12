// Один живой пример исследования: три броска краски и один хлопок на каждый.
import {
  createPaintClapState, PAINT_CLAP_FLIGHTS, PAINT_CLAP_WINDOW, paintClapCanReflect, stepPaintClap,
} from '../../../shared/lab-paint-clap.ts';
import type { PaintClapAction, PaintClapOutcome } from '../../../shared/lab-paint-clap.ts';
import { COLOR, jelly, scene } from '../art.ts';
import type { Experiment } from '../types.ts';

const RESULT: Record<PaintClapOutcome, string> = {
  reflected: 'Отбито!', early: 'Рано — краска попала', hit: 'Краска попала — хлопка не было',
};

export const paintClap: Experiment = {
  id: 'research-paint-clap',
  n: 32,
  title: 'Краска и Хлопок',
  category: 'mode',
  size: 'M',
  pitch: 'Краска летит видимым шаром. Сохрани хлопок до последнего момента и отбей её от своего карта.',
  fun: 'Понятно, кто кого переиграл: ранний хлопок оставляет без защиты, точный разворачивает шар.',
  touches: 'Картинг: Краска и Хлопок. В превью — только проверка момента отражения.',
  research: {
    sourceId: 'w2-racing-paint-clap-counter',
    focus: 'Видимая атака и ответ на неё',
    players: 'В идее — 2–6; в этом превью — один человек',
    round: 'Серия из трёх бросков',
    decision: 'Хлопнуть сразу или подождать, пока краска подлетит в зону отражения.',
    test: 'Во второй серии человек точнее выбирает момент и понимает, почему ранний хлопок не помог.',
    scope: 'Один неподвижный карт, видимый шар и короткое окно ответа. Без сетевых соперников, настоящих наград и изменения гонок.',
    references: [{
      title: 'CTR Nitro-Fueled: предметом можно остановить входящую атаку',
      url: 'https://support.activision.com/de/crash-team-racing/articles/crash-team-racing-nitro-fueled-gameplay-tips',
    }],
  },
  art: () => scene('deck', 'Желейка в карте отбивает розовый шар краски светлым кольцом хлопка', [
    `<rect x="22" y="143" width="276" height="35" rx="10" fill="#837e76"/>`,
    `<path d="M42 161H154" stroke="${COLOR.paper}" stroke-width="3" stroke-dasharray="12 8"/>`,
    `<rect x="194" y="149" width="75" height="17" rx="6" fill="${COLOR.orange}"/><g fill="${COLOR.ink}"><circle cx="206" cy="170" r="9"/><circle cx="258" cy="170" r="9"/></g>`,
    jelly({ x: 231, y: 151, c: 'orange', hat: 'helmet', face: 'cheer', arms: 'out', s: 0.69, look: -1 }),
    `<ellipse cx="187" cy="116" rx="18" ry="34" fill="none" stroke="${COLOR.green}" stroke-width="5"/>`,
    `<path d="M81 118Q117 86 153 112" fill="none" stroke="${COLOR.purple}" stroke-width="3" stroke-dasharray="4 6"/>`,
    `<circle cx="147" cy="111" r="14" fill="${COLOR.pink}" stroke="${COLOR.purple}" stroke-width="3"/><circle cx="143" cy="106" r="4" fill="${COLOR.white}"/>`,
  ]),
  live: {
    cta: 'Попробовать отражение',
    hint: 'Запусти шар и нажми «Хлопок», когда он войдёт в светлую полосу перед картом. Один хлопок на попытку. Кнопки работают мышью, Tab и Enter/Пробелом.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ radius: 6, cam: [0.2, 3.7, 9.8], look: [0, 1.2, 0], fov: 54, rail: false });
      const FROM = -4.1, DRIVER = 2.3, TO = DRIVER - 0.75, HEIGHT = 1.3;
      const PAINT = 0xc55b9d;

      d.box(9.4, 0.06, 2.05, 0x837e76).position.set(-0.4, 0.04, 0);
      for (const x of [-2.8, -1.2, 0.4]) d.box(0.62, 0.025, 0.09, 0xfff5df).position.set(x, 0.09, 0.78);
      // Учебный пускатель, без второго игрока или бота.
      d.box(0.8, 0.65, 0.85, 0xbc8e58).position.set(FROM - 0.25, 0.39, 0);
      const nozzle = d.cyl(0.22, 0.32, 0.7, PAINT, d.scene, 12);
      nozzle.position.set(FROM - 0.25, HEIGHT, 0);
      nozzle.rotation.z = -Math.PI / 2;

      const driver = d.jelly({ name: 'Ты', x: DRIVER, z: 0, outfit: { c: 4, h: 'helmet' } });
      driver.pos.y = 0.35;
      driver.face(FROM, 0);
      d.box(1.45, 0.32, 1.0, 0xe7933b).position.set(DRIVER, 0.37, 0);
      for (const x of [-0.48, 0.48]) for (const z of [-0.57, 0.57]) {
        const wheel = d.cyl(0.22, 0.22, 0.16, 0x3f4044, d.scene, 10);
        wheel.position.set(DRIVER + x, 0.25, z);
        wheel.rotation.x = Math.PI / 2;
      }

      const zoneMat = d.mat(0xf3d58c);
      const zone = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 1.8), zoneMat);
      zone.position.y = 0.095;
      d.scene.add(zone);
      const ball = d.ball(0.24, PAINT, d.scene, 16);
      ball.visible = false;
      const waveMat = new THREE.MeshBasicMaterial({ color: 0xfff4d4, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
      const wave = new THREE.Mesh(new THREE.RingGeometry(0.64, 0.78, 32), waveMat);
      wave.rotation.x = -Math.PI / 2;
      wave.position.set(DRIVER, 0.16, 0);
      wave.visible = false;
      d.scene.add(wave);
      const stains = new THREE.Group();
      for (const [x, y, z, r] of [[-0.6, 1.2, 0.25, 0.22], [-0.45, 1.4, 0.5, 0.12], [-0.5, 1.0, 0.5, 0.13]]) {
        const drop = d.ball(r!, PAINT, stains, 10);
        drop.scale.set(0.3, 1, 1);
        drop.position.set(DRIVER + x!, y!, z!);
      }
      stains.visible = false;
      d.scene.add(stains);
      const badge = d.badge(0, 3.25, -0.2, 4.3);

      let state = createPaintClapState();
      let resultAge = 0;
      let waveAge = 1;
      let disposed = false;
      let lastNote = '';
      let lastPanel = '';
      let nextReady = false;
      const attempt = ui.stat('Попытка', '1 / 3');
      const score = ui.stat('Отражено', '0 / 3');
      const defense = ui.stat('Хлопок', 'Один на каждый шар');
      const last = ui.stat('Последний бросок', '—');

      const launch = ui.button('Первый шар', () => {
        if (disposed || launch.disabled) return;
        change({ type: 'start' });
        clap.focus({ preventScroll: true });
      });
      const clap = ui.button('Хлопок', () => change({ type: 'clap' }), true);
      const reset = ui.button('Серия заново', () => change({ type: 'reset' }));
      clap.title = 'Дождись шара в светлой полосе. Нажми один раз.';
      // Только локальные кнопки: стрелки и клавиши страницы прототип не перехватывает.
      const stopRepeat = (e: KeyboardEvent): void => {
        if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();
      };
      for (const b of [launch, clap, reset]) b.addEventListener('keydown', stopRepeat);

      function note(text: string, short: string, color = '#ffffff'): void {
        if (text === lastNote) return;
        lastNote = text;
        ui.note(text);
        badge.show(short, color);
      }

      function sync(): void {
        const near = paintClapCanReflect(state);
        const complete = state.phase === 'complete';
        const result = state.phase === 'result' || complete;
        const key = `${state.phase}:${state.attempt}:${state.clapAt !== null}:${near}:${resultAge >= 0.65}`;
        if (key === lastPanel) return;
        lastPanel = key;
        clap.disabled = state.phase !== 'flight' || state.clapAt !== null;
        clap.textContent = state.clapAt !== null ? 'Хлопок потрачен' : near ? 'Хлопок — сейчас!' : 'Хлопок';
        launch.disabled = state.phase === 'flight' || complete || (result && resultAge < 0.65);
        launch.textContent = complete ? 'Три попытки завершены' : state.results.length ? `Следующий шар · ${state.results.length + 1}/3` : 'Первый шар';
        defense.set(state.phase === 'ready' ? 'Один на каждый шар' : state.clapAt !== null ? 'Потрачен' : result ? 'Не использован' : 'Готов');
        zoneMat.color.setHex(near ? 0x76c89a : state.clapAt !== null ? 0xe6b2a0 : 0xf3d58c);
        if (state.phase === 'ready') note('На каждый шар есть один хлопок. Начни с первого броска.', 'Три попытки');
        else if (state.phase === 'flight') {
          if (state.clapAt !== null) note('Слишком рано. Хлопок уже потрачен — этот шар не отбить.', 'Хлопок потрачен', '#ffd6b6');
          else if (near) note('Шар в полосе — сейчас хлопни!', 'Сейчас — хлопок!', '#a9efc3');
          else note('Краска летит. Подожди светлой полосы перед картом.', 'Дождись полосы');
        } else if (complete) {
          const n = state.results.filter(x => x === 'reflected').length;
          note(`Серия окончена: отражено ${n} из 3. «Серия заново» даёт ещё три попытки.`, `${n} из 3 отражены`, n ? '#a9efc3' : '#ffffff');
        } else {
          const outcome = state.results.at(-1)!;
          note(`${RESULT[outcome].replace(/!$/, '')}. Запусти следующий шар, когда будешь готов.`, RESULT[outcome], outcome === 'reflected' ? '#a9efc3' : '#ffd6b6');
        }
      }

      function change(action: PaintClapAction): void {
        if (disposed) return;
        const before = state;
        state = stepPaintClap(state, action);
        if (state === before) return;
        if (action.type === 'reset' || action.type === 'start') {
          resultAge = 0;
          waveAge = 1;
          wave.visible = false;
          stains.visible = false;
          driver.avatar.hands = null;
          driver.action(kit.ACT.none);
          const duration = PAINT_CLAP_FLIGHTS[state.attempt]!;
          const width = (TO - FROM) * PAINT_CLAP_WINDOW / duration;
          zone.scale.x = width;
          zone.position.x = TO - width / 2;
          ball.position.set(FROM, HEIGHT, 0);
          ball.visible = action.type === 'start';
          nextReady = false;
          attempt.set(`${state.attempt + 1} / 3`);
          if (action.type === 'start') sound.whoosh();
          else {
            score.set('0 / 3');
            last.set('—');
          }
        }
        if (action.type === 'clap') {
          waveAge = 0;
          wave.visible = true;
          driver.avatar.jolt(0.28);
          if (state.results.length === before.results.length) sound.pop();
        }
        if (state.results.length > before.results.length) {
          resultAge = 0;
          const outcome = state.results.at(-1)!;
          last.set(`${state.attempt + 1}: ${RESULT[outcome]}`);
          score.set(`${state.results.filter(x => x === 'reflected').length} / 3`);
          if (outcome === 'reflected') {
            sound.ding();
            d.spray.burst(TO, HEIGHT, 0, 10, 0xfff4d4, 2, 0.5, 0.05);
          } else {
            ball.visible = false;
            stains.visible = true;
            driver.avatar.jolt(0.6);
            d.spray.burst(TO, HEIGHT, 0, 14, PAINT, 1.6, 0.4, 0.08);
            sound.splat();
          }
        }
        sync();
      }

      // Первоначальная ширина полосы тоже вычислена из настоящего окна реакции.
      change({ type: 'reset' });
      return {
        scene: d.scene, camera: d.camera, target: d.target,
        update(dt, t) {
          if (disposed) return;
          if (state.phase === 'flight') change({ type: 'tick', dt });
          else if (state.phase === 'result' || state.phase === 'complete') resultAge += dt;
          waveAge += dt;
          if (state.phase === 'flight') {
            const u = state.elapsed / PAINT_CLAP_FLIGHTS[state.attempt]!;
            ball.position.set(FROM + (TO - FROM) * u, HEIGHT + Math.sin(Math.PI * u) * 0.28, 0);
            ball.rotation.z += dt * 5;
          } else if (state.results.at(-1) === 'reflected') {
            const u = Math.min(1, resultAge / 0.7);
            const at = state.elapsed / PAINT_CLAP_FLIGHTS[state.attempt]!;
            const hitX = FROM + (TO - FROM) * at;
            const hitY = HEIGHT + Math.sin(Math.PI * at) * 0.28;
            ball.visible = u < 1;
            ball.position.set(hitX + (FROM - hitX) * u, hitY + (HEIGHT - hitY) * u + Math.sin(Math.PI * u) * 0.6, 0);
          }
          if (waveAge < 0.38) {
            wave.visible = true;
            wave.scale.setScalar(0.4 + waveAge * 5);
            waveMat.opacity = 0.8 * (1 - waveAge / 0.38);
            const hands = 0.5 - 0.46 * Math.sin(Math.PI * Math.min(1, waveAge / 0.25));
            driver.avatar.hands = [-hands, 0.95, -0.5, hands, 0.95, -0.5];
          } else {
            wave.visible = false;
            driver.avatar.hands = null;
          }
          if (!nextReady && resultAge >= 0.65) {
            nextReady = true;
            sync();
          }
          d.update(dt, t);
        },
        dispose() {
          disposed = true;
          for (const b of [launch, clap, reset]) b.removeEventListener('keydown', stopRepeat);
          d.dispose();
        },
      };
    },
  },
};
