// ЗАГЛУШКА пакета лодок (B, ветка fish/boats): только то, что нужно лайвелу (shared/fishlivewell.ts) — таблица BOATS с теми же
// именами и числами, что в контракте плана docs/superpowers/plans/2026-10-10-fishing-implementation.md. При слиянии берётся
// файл пакета B целиком; лайвел читает из него только id и livewell.
export type BoatId = 'volzhanka' | 'albakor' | 'northsilver';

export interface BoatKind {
  id: BoatId;
  name: string;
  /** С какого уровня рыбалки продаётся */
  level: number;
  /** Цена у Семёна, жетонов */
  price: number;
  /** Полный ход, м/с; разгон до полного, с */
  speed: number;
  accel: number;
  /** Мест в лайвеле (садке) */
  livewell: number;
  /** Эхолот: ожидание поклёвки с якоря короче на долю */
  sonar: number;
  /** Якорь: бросить или поднять, с */
  anchor: number;
}

export const BOATS: readonly BoatKind[] = [
  { id: 'volzhanka', name: 'Волжанка', level: 6, price: 5000, speed: 12, accel: 5, livewell: 25, sonar: 0.05, anchor: 2.5 },
  { id: 'albakor', name: 'Альбакор', level: 8, price: 10_000, speed: 15.5, accel: 5, livewell: 50, sonar: 0.1, anchor: 1 },
  { id: 'northsilver', name: 'Нортсильвер', level: 10, price: 15_000, speed: 20.8, accel: 5.5, livewell: 75, sonar: 0.15, anchor: 0.3 },
];
