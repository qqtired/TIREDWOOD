// «Подземелье»: забег, который играет сцена, — настоящая симуляция (simview.ts) или заглушка стенда (mock.ts).
// Сцена шагает его 30 раз в секунду, применяя события журнала перед шагом, и рисует DgView.
import type { DgEvent, DgResult } from '../../shared/dungeon/api.ts';
import type { DgView } from './view.ts';

export interface RunSource {
  /** номер следующего шага (события журнала с этим t применяются перед ним) */
  readonly tick: number;
  /** открыт выбор карточек или сундук — мир стоит */
  readonly frozen: boolean;
  apply(ev: DgEvent): void;
  step(): void;
  /** вид после последнего шага (fx — события этого шага) */
  view(): DgView;
  hash(): number;
  result(): DgResult;
}
