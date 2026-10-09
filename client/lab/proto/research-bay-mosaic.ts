// Играбельный одиночный срез исследования: выбор, поворот и шесть размещений.
import type { Group, Mesh } from 'three';
import { BAY_MOVES, BAY_SIZE, createBayMosaic, placeBayTile, rotateBayPorts, scoreBayMosaic, type BayTile } from '../../../shared/lab-bay-mosaic.ts';
import { COLOR, jelly, scene } from '../art.ts';
import type { Experiment } from '../types.ts';

export const bayMosaic: Experiment = {
  id: 'research-bay-mosaic',
  n: 31,
  title: 'Мозаика бухты',
  category: 'mode',
  size: 'M',
  pitch: 'Выбери плитку, поверни и найди ей место. За шесть ходов собери большой пляж и непрерывный деревянный настил.',
  fun: 'Подходящий угол хочется приберечь, а морская плитка иногда соединяет настил лучше песчаной.',
  research: {
    sourceId: 'w2-lab-new-bay-mosaic',
    focus: 'Пространственный выбор',
    players: '1 в превью · идея на 1–4',
    round: '6 плиток · около 2 минут',
    decision: 'Продолжить пляж или соединить выходы настила? Куда повернуть плитку, чтобы осталось место для следующей?',
    test: 'На повторе игрок меняет расстановку и может объяснить, какое соединение стало лучше.',
    scope: 'Одиночная проба правил и управления. Совместный выбор плиток с друзьями ещё требует проверки.',
    references: [{ title: 'Cascadia — Alderac Entertainment Group', url: 'https://www.alderac.com/cascadia/' }],
  },
  art: () => scene('deck', 'Желейка собирает на столе мозаичную бухту из песка, моря и деревянных дорожек', [
    jelly({ x: 49, y: 169, c: 'sky', hat: 'cap', face: 'smile', arms: 'hold', s: 0.85 }),
    '<rect x="99" y="34" width="190" height="132" rx="12" fill="#875c42"/>',
    ...Array.from({ length: 9 }, (_, i) => {
      const x = 108 + (i % 3) * 59;
      const y = 43 + Math.floor(i / 3) * 38;
      const fill = i === 2 || i === 5 ? COLOR.sea : i < 7 ? COLOR.sand : '#c29b72';
      return `<rect x="${x}" y="${y}" width="54" height="33" rx="4" fill="${fill}"/>`;
    }),
    '<path d="M135 43V97H253V135H194" fill="none" stroke="#a5663c" stroke-width="9" stroke-linejoin="round"/>',
    '<rect x="127" y="176" width="31" height="19" rx="3" fill="#f7dfa4"/><rect x="170" y="176" width="31" height="19" rx="3" fill="#3fbfca"/><rect x="213" y="176" width="31" height="19" rx="3" fill="#f7dfa4"/>',
  ]),
  live: {
    cta: 'Собрать бухту',
    hint: 'Выбери плитку. Кнопками со стрелками или касанием поля выбери клетку, поверни и нажми «Поставить». Счёт: крупнейший пляж + крупнейший связный настил; диагонали не соединяются.',
    create(ctx) {
      const { THREE, kit, ui, sound } = ctx;
      const d = kit.diorama({ radius: 6, rail: false, cam: [3.8, 6.4, 6.6], look: [0, 0.7, 0.25], fov: 46 });
      const GAP = 1.4;
      const SIZE = 1.29;
      const BOARD_Z = -0.7;
      const TILE_Y = 0.8;
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
      const arrows = ['↑', '→', '↓', '←'];
      const cellName = (cell: number): string => `${['А', 'Б', 'В'][Math.floor(cell / BAY_SIZE)]}${cell % BAY_SIZE + 1}`;
      const at = (cell: number): [number, number] => [(cell % BAY_SIZE - 1) * GAP, BOARD_Z + (Math.floor(cell / BAY_SIZE) - 1) * GAP];

      let state = createBayMosaic();
      let offer = 0;
      let turns = 0;
      let cell = 4;
      const me = d.jelly({ name: 'Ты', x: -3.1, z: 0.6, outfit: { c: 9, h: 'cap' } });
      me.face(0, BOARD_Z);
      const resultBadge = d.badge(0, 2.1, -2.5, 3.4);

      d.box(4.38, 0.55, 4.38, 0x865d42).position.set(0, 0.32, BOARD_Z);
      const sand = d.mat(0xf2d49b, { rough: 0.95 });
      const water = d.mat(0x3fbbc5, { rough: 0.45 });
      const wood = d.mat(0x9b633b, { rough: 0.85 });
      const ghostSand = d.mat(0xf2d49b);
      const ghostWater = d.mat(0x3fbbc5);
      const ghostWood = d.mat(0x9b633b);
      for (const material of [ghostSand, ghostWater, ghostWood]) {
        material.transparent = true;
        material.opacity = 0.5;
        material.depthWrite = false;
      }

      interface TileView { root: Group; base: Mesh; center: Mesh; paths: Mesh[]; ghost: boolean }
      const makeTile = (x: number, y: number, z: number, scale = 1, ghost = false): TileView => {
        const root = new THREE.Group();
        root.position.set(x, y, z);
        root.scale.setScalar(scale);
        d.scene.add(root);
        const base = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 0.16, SIZE), ghost ? ghostSand : sand);
        root.add(base);
        const pathMaterial = ghost ? ghostWood : wood;
        const center = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.065, 0.29), pathMaterial);
        center.position.y = 0.115;
        root.add(center);
        const paths = directions.map(([dx, dz]) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(dx ? SIZE / 2 : 0.29, 0.065, dz ? SIZE / 2 : 0.29), pathMaterial);
          mesh.position.set(dx * SIZE / 4, 0.115, dz * SIZE / 4);
          root.add(mesh);
          return mesh;
        });
        return { root, base, center, paths, ghost };
      };
      const paintTile = (view: TileView, tile: BayTile | undefined | null, rotation = 0): void => {
        view.root.visible = Boolean(tile);
        if (!tile) return;
        view.base.material = tile.ground === 'sand' ? (view.ghost ? ghostSand : sand) : (view.ghost ? ghostWater : water);
        const ports = rotateBayPorts(tile.ports, rotation);
        view.center.visible = ports !== 0;
        view.paths.forEach((mesh, i) => { mesh.visible = (ports & (1 << i)) !== 0; });
      };
      const label = (text: string, x: number, y: number, z: number, width = 0.38): void => {
        const panel = d.panel(width, 0.28, 128, (g, W, H) => {
          g.fillStyle = '#fff8e9';
          g.fillRect(0, 0, W, H);
          g.fillStyle = '#443020';
          g.font = '700 62px Rubik, sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(text, W / 2, H / 2);
        });
        panel.rotation.x = -Math.PI / 2;
        panel.position.set(x, y, z);
        d.scene.add(panel);
      };
      const boardViews = Array.from({ length: 9 }, (_, i) => {
        const [x, z] = at(i);
        d.box(SIZE, 0.08, SIZE, 0xb28d68).position.set(x, 0.65, z);
        label(cellName(i), x - 0.39, 0.985, z + 0.43);
        return makeTile(x, TILE_Y, z);
      });
      const joins: Array<{ mesh: Mesh; a: number; b: number; from: number; to: number }> = [];
      for (let i = 0; i < 9; i++) {
        const [x, z] = at(i);
        if (i % BAY_SIZE < BAY_SIZE - 1) {
          const mesh = d.box(GAP - SIZE + 0.025, 0.065, 0.29, 0x9b633b);
          mesh.position.set(x + GAP / 2, TILE_Y + 0.115, z);
          joins.push({ mesh, a: i, b: i + 1, from: 2, to: 8 });
        }
        if (i < BAY_SIZE * (BAY_SIZE - 1)) {
          const mesh = d.box(0.29, 0.065, GAP - SIZE + 0.025, 0x9b633b);
          mesh.position.set(x, TILE_Y + 0.115, z + GAP / 2);
          joins.push({ mesh, a: i, b: i + BAY_SIZE, from: 4, to: 1 });
        }
      }
      const offerViews = Array.from({ length: 3 }, (_, i) => {
        const x = (i - 1) * 1.65;
        d.box(1.2, 0.25, 1.2, 0x80583e).position.set(x, 0.125, 2.7);
        label(String(i + 1), x, 0.055, 3.49);
        return makeTile(x, 0.34, 2.7, 0.84);
      });
      const cursor = new THREE.Group();
      d.scene.add(cursor);
      for (const [dx, dz] of directions) {
        d.box(dx ? 0.055 : GAP, 0.045, dz ? 0.055 : GAP, 0xffc84b, cursor).position.set(dx * GAP / 2, 0, dz * GAP / 2);
      }
      const preview = makeTile(0, TILE_Y + 0.04, 0, 0.96, true);

      const progress = ui.stat('Плитки', `0/${BAY_MOVES}`);
      const score = ui.stat('Счёт', '0 · пляж 0 + настил 0');
      const selection = ui.stat('Клетка', cellName(cell));
      const forecast = ui.stat('После хода', '—');
      const offers = Array.from({ length: 3 }, (_, i) => ui.button(`Плитка ${i + 1}`, () => {
        offer = i;
        turns = 0;
        sound.tick();
        refresh();
      }));
      const moves: Array<{ button: HTMLButtonElement; dx: number; dy: number }> = [];
      for (const [text, dx, dy, title] of [
        ['←', -1, 0, 'Клетка слева'], ['↑', 0, -1, 'Клетка выше'],
        ['↓', 0, 1, 'Клетка ниже'], ['→', 1, 0, 'Клетка справа'],
      ] as const) {
        const button = ui.button(text, () => {
          cell += dx + dy * BAY_SIZE;
          sound.tick(0.85);
          refresh();
        });
        button.setAttribute('aria-label', title);
        button.title = title;
        moves.push({ button, dx, dy });
      }
      const rotate = ui.button('Повернуть ↻', () => {
        turns = (turns + 1) % 4;
        sound.tick(1.15);
        refresh();
      });
      const place = ui.button('Поставить плитку', () => {
        const result = placeBayTile(state, offer, cell, turns);
        if (!result.ok) {
          ui.note(result.reason === 'occupied' ? 'Здесь уже лежит плитка. Выбери пустую клетку.' : 'Раунд завершён. Начни ещё раз.');
          return;
        }
        state = result.state;
        offer = 0;
        turns = 0;
        sound.pop();
        if (state.placed === BAY_MOVES) {
          resultBadge.show(`${scoreBayMosaic(state.board).total} очков`, '#fff6dd');
          me.action(kit.ACT.wave);
          sound.ding();
        } else cell = state.board.findIndex((tile) => !tile);
        refresh();
      }, true);
      ui.button('Новый раунд', () => {
        state = createBayMosaic();
        offer = 0;
        turns = 0;
        cell = 4;
        me.action(kit.ACT.none);
        resultBadge.hide();
        sound.tick();
        refresh();
      });

      function refresh(): void {
        const done = state.placed >= BAY_MOVES;
        const chosen = state.offers[offer];
        const current = scoreBayMosaic(state.board);
        const [x, z] = at(cell);
        cursor.position.set(x, 1.0, z);
        cursor.visible = !done;
        preview.root.position.set(x, TILE_Y + 0.04, z);
        paintTile(preview, !done && !state.board[cell] ? chosen : null, turns);
        boardViews.forEach((view, i) => paintTile(view, state.board[i]));
        joins.forEach(({ mesh, a, b, from, to }) => {
          mesh.visible = Boolean((state.board[a]?.ports ?? 0) & from) && Boolean((state.board[b]?.ports ?? 0) & to);
        });
        offerViews.forEach((view, i) => paintTile(view, state.offers[i], i === offer ? turns : 0));
        offers.forEach((button, i) => {
          const tile = state.offers[i];
          const ports = tile ? rotateBayPorts(tile.ports, i === offer ? turns : 0) : 0;
          const exits = arrows.filter((_, direction) => (ports & (1 << direction)) !== 0).join('');
          button.textContent = tile ? `${i + 1} · ${tile.name}${exits ? ` ${exits}` : ''}` : `${i + 1} · —`;
          button.disabled = done || !tile;
          button.setAttribute('aria-pressed', String(i === offer && !done));
          button.dataset.primary = String(i === offer && !done);
        });
        for (const { button, dx, dy } of moves) {
          const nx = cell % BAY_SIZE + dx;
          const ny = Math.floor(cell / BAY_SIZE) + dy;
          button.disabled = done || nx < 0 || nx >= BAY_SIZE || ny < 0 || ny >= BAY_SIZE;
        }
        rotate.disabled = done || !chosen?.ports;
        rotate.title = chosen?.ports ? 'Повернуть настил на четверть оборота' : 'У этой плитки нет направленных выходов';
        place.disabled = done || Boolean(state.board[cell]);
        progress.set(`${state.placed}/${BAY_MOVES}`);
        score.set(`${current.total} · пляж ${current.beach} + настил ${current.boardwalk}`);
        selection.set(cellName(cell));
        const candidate = !done ? placeBayTile(state, offer, cell, turns) : null;
        if (candidate?.ok) {
          const next = scoreBayMosaic(candidate.state.board);
          forecast.set(`${next.total} · +${next.total - current.total}`);
        } else forecast.set(done ? 'Раунд завершён' : 'Клетка занята');
        ui.note(done
          ? `Бухта готова: ${current.total} очков. Начни тот же набор заново и попробуй другую расстановку.`
          : state.board[cell] ? 'Клетка занята. Стрелками выбери пустую или коснись её на поле.'
            : 'Полупрозрачная плитка — предпросмотр. Настил соединяется, только если выходы смотрят друг на друга.');
      }
      refresh();

      return {
        scene: d.scene,
        camera: d.camera,
        target: d.target,
        update(dt, t) { d.update(dt, t); },
        tap(nx, ny) {
          if (state.placed >= BAY_MOVES) return;
          const p = kit.floorAt(d.camera, nx, ny, TILE_Y + 0.08);
          if (!p) return;
          const column = Math.floor((p.x + GAP * 1.5) / GAP);
          const row = Math.floor((p.z - BOARD_Z + GAP * 1.5) / GAP);
          if (column < 0 || column >= BAY_SIZE || row < 0 || row >= BAY_SIZE) return;
          cell = row * BAY_SIZE + column;
          sound.tick(0.85);
          refresh();
        },
        dispose() { d.dispose(); },
      };
    },
  },
};
