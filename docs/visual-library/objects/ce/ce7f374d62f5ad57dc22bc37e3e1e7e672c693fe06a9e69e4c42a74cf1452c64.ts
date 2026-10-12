// Чистые правила одиночного примера /lab: шесть размещений на поле 3 × 3.
// Выходы настила по часовой стрелке: север 1, восток 2, юг 4, запад 8.
export const BAY_SIZE = 3;
export const BAY_MOVES = 6;

export interface BayTile {
  readonly name: string;
  readonly ground: 'sand' | 'water';
  readonly ports: number;
}

export interface BayMosaicState {
  readonly board: readonly (BayTile | null)[];
  readonly offers: readonly BayTile[];
  readonly next: number;
  readonly placed: number;
}

export interface BayScore { beach: number; boardwalk: number; total: number }
export type BayPlacement = { ok: true; state: BayMosaicState } | { ok: false; reason: 'occupied' | 'invalid' | 'finished' };

// Один и тот же набор при повторе: можно проверить другую расстановку, а не ждать удачи.
const TILES: readonly BayTile[] = [
  { name: 'Пляж · угол', ground: 'sand', ports: 3 },
  { name: 'Море · прямая', ground: 'water', ports: 5 },
  { name: 'Пляж · песок', ground: 'sand', ports: 0 },
  { name: 'Море · развилка', ground: 'water', ports: 11 },
  { name: 'Пляж · конец', ground: 'sand', ports: 4 },
  { name: 'Море · угол', ground: 'water', ports: 6 },
  { name: 'Пляж · прямая', ground: 'sand', ports: 10 },
  { name: 'Море · прямая', ground: 'water', ports: 5 },
  { name: 'Пляж · песок', ground: 'sand', ports: 0 },
];

export function createBayMosaic(): BayMosaicState {
  return { board: Array.from({ length: BAY_SIZE * BAY_SIZE }, () => null), offers: TILES.slice(0, 3), next: 3, placed: 0 };
}

export function rotateBayPorts(ports: number, quarterTurns: number): number {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let result = ports & 15;
  for (let i = 0; i < turns; i++) result = ((result << 1) & 15) | (result >> 3);
  return result;
}

export function placeBayTile(state: BayMosaicState, offer: number, cell: number, quarterTurns: number): BayPlacement {
  if (state.placed >= BAY_MOVES) return { ok: false, reason: 'finished' };
  if (!Number.isInteger(cell) || cell < 0 || cell >= BAY_SIZE * BAY_SIZE
    || !Number.isInteger(offer) || offer < 0 || offer >= state.offers.length
    || !Number.isInteger(quarterTurns)) return { ok: false, reason: 'invalid' };
  if (state.board[cell]) return { ok: false, reason: 'occupied' };

  const chosen = state.offers[offer]!;
  const board = [...state.board];
  board[cell] = { ...chosen, ports: rotateBayPorts(chosen.ports, quarterTurns) };
  const offers = [...state.offers];
  offers.splice(offer, 1);
  const placed = state.placed + 1;
  let next = state.next;
  if (placed < BAY_MOVES && next < TILES.length) offers.push(TILES[next++]!);
  return { ok: true, state: { board, offers, next, placed } };
}

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Баллы — число плиток в крупнейшем пляже плюс число плиток в крупнейшем связанном настиле. */
export function scoreBayMosaic(board: readonly (BayTile | null)[]): BayScore {
  function largest(accept: (tile: BayTile) => boolean, connects: (a: BayTile, b: BayTile, direction: number) => boolean): number {
    const seen = new Set<number>();
    let best = 0;
    for (let start = 0; start < BAY_SIZE * BAY_SIZE; start++) {
      const first = board[start];
      if (!first || !accept(first) || seen.has(start)) continue;
      const stack = [start];
      seen.add(start);
      let count = 0;
      while (stack.length) {
        const at = stack.pop()!;
        const tile = board[at]!;
        count++;
        const x = at % BAY_SIZE;
        const y = Math.floor(at / BAY_SIZE);
        for (let direction = 0; direction < 4; direction++) {
          const [dx, dy] = DIRECTIONS[direction]!;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= BAY_SIZE || ny >= BAY_SIZE) continue;
          const id = ny * BAY_SIZE + nx;
          const other = board[id];
          if (!other || seen.has(id) || !accept(other) || !connects(tile, other, direction)) continue;
          seen.add(id);
          stack.push(id);
        }
      }
      best = Math.max(best, count);
    }
    return best;
  }

  const beach = largest((tile) => tile.ground === 'sand', () => true);
  const boardwalk = largest((tile) => tile.ports !== 0, (a, b, direction) =>
    (a.ports & (1 << direction)) !== 0 && (b.ports & (1 << ((direction + 2) % 4))) !== 0);
  return { beach, boardwalk, total: beach + boardwalk };
}
