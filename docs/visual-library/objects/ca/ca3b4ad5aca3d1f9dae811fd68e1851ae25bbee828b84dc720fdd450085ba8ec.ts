// Локальная лаборатория «Краска и Хлопок»: чистые переходы, без наград и сохранений.
export const PAINT_CLAP_FLIGHTS = [2, 1.8, 1.6] as const;
export const PAINT_CLAP_WINDOW = 0.32;

export type PaintClapOutcome = 'reflected' | 'early' | 'hit';
export interface PaintClapState {
  readonly phase: 'ready' | 'flight' | 'result' | 'complete';
  readonly attempt: number;
  readonly elapsed: number;
  readonly clapAt: number | null;
  readonly results: readonly PaintClapOutcome[];
}
export type PaintClapAction = { type: 'start' | 'clap' | 'reset' } | { type: 'tick'; dt: number };

export function createPaintClapState(): PaintClapState {
  return { phase: 'ready', attempt: 0, elapsed: 0, clapAt: null, results: [] };
}

/** Хлопок мгновенный: шар должен уже быть рядом, но ещё не коснуться желейки. */
export function paintClapCanReflect(state: PaintClapState): boolean {
  const impact = PAINT_CLAP_FLIGHTS[state.attempt]!;
  return state.phase === 'flight' && state.clapAt === null && state.elapsed >= impact - PAINT_CLAP_WINDOW && state.elapsed < impact;
}

function resolve(state: PaintClapState, outcome: PaintClapOutcome): PaintClapState {
  const results = [...state.results, outcome];
  return { ...state, results, phase: results.length === PAINT_CLAP_FLIGHTS.length ? 'complete' : 'result' };
}

export function stepPaintClap(state: PaintClapState, action: PaintClapAction): PaintClapState {
  if (action.type === 'reset') return createPaintClapState();
  if (action.type === 'start') {
    if (state.phase !== 'ready' && state.phase !== 'result') return state;
    return { ...state, phase: 'flight', attempt: state.results.length, elapsed: 0, clapAt: null };
  }
  if (state.phase !== 'flight') return state;
  if (action.type === 'clap') {
    if (state.clapAt !== null) return state;
    const spent = { ...state, clapAt: state.elapsed };
    return paintClapCanReflect(state) ? resolve(spent, 'reflected') : spent;
  }
  if (action.type === 'tick' && Number.isFinite(action.dt) && action.dt > 0) {
    const impact = PAINT_CLAP_FLIGHTS[state.attempt]!;
    const advanced = { ...state, elapsed: Math.min(impact, state.elapsed + action.dt) };
    return advanced.elapsed >= impact ? resolve(advanced, state.clapAt === null ? 'hit' : 'early') : advanced;
  }
  return state;
}
