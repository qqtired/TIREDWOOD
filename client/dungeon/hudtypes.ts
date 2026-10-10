// «Подземелье»: что сцена отдаёт интерфейсу (hud.ts) и что интерфейс просит у сцены. Только типы — интерфейс не знает
// ни симуляцию, ни three.js: сцена каждый кадр собирает HudFrame из состояния забега, а экраны открывает отдельными
// вызовами (карточки, сундук, пауза, итоги). Всё жмётся мышью и клавишами (клавиши ловит сцена и зовёт те же колбэки).
import type { DgStage } from '../../shared/dungeon/api.ts';

/** Вещь в сборке героя: оружие или пассивка */
export interface HudItem {
  id: string;
  icon: string;
  name: string;
  lv: number;
  max: number;
  /** эволюция (золотая рамка) */
  evo?: boolean;
}

export interface HudBuff {
  id: string;
  icon: string;
  name: string;
  /** осталось, с */
  left: number;
  /** всего, с (для полоски) */
  total: number;
}

/** Состояние на кадр (вызывается каждый кадр; интерфейс сам не трогает DOM, если ничего не поменялось) */
export interface HudFrame {
  stage: DgStage;
  wave: number;
  /** до конца волны или передышки, с (−1 — без таймера: босс) */
  timeLeft: number;
  /** отряд волны: сколько осталось и сколько было (полоса под «Волна N») */
  squadLeft: number;
  squadTotal: number;
  hp: number;
  hpMax: number;
  level: number;
  /** опыт внутри уровня 0…1 */
  xp01: number;
  kills: number;
  buffs: HudBuff[];
  weapons: HudItem[];
  passives: HudItem[];
  /** слоты (5 + 5): пустые рисуются тёмными ячейками */
  weaponSlots: number;
  passiveSlots: number;
  /** рывок: 1 — готов; меньше — заполнение по кругу */
  dash01: number;
  /** удар Q: готовность 0…1; charge — идёт заряд (0…1, 1 — полный) или −1 */
  q01: number;
  qCharge: number;
  /** босс на экране: имя, HP 0…1 и риски фаз (доли HP) */
  boss: { name: string; hp01: number; marks: number[] } | null;
  /** передышка: карточка следующей волны */
  breather: { left: number; next: number; mobs: { icon: string; name: string }[]; event: string } | null;
  /** «Орда» и прочая тревога — красноватая рамка */
  alarm: boolean;
  /** герой при смерти (HP < 25 %) — пульс рамки */
  lowHp: boolean;
}

/** Карточка улучшения */
export interface HudCard {
  icon: string;
  name: string;
  /** «Ур. 3 → 4» — from = 0 значит новая вещь */
  from: number;
  to: number;
  /** одна строка эффекта */
  text: string;
  kind: 'weapon' | 'passive' | 'misc';
}

/** Экран карточек при новом уровне (мир на паузе) */
export interface HudCards {
  cards: HudCard[];
  /** «★ 2 из 3»: какой выбор по счёту и сколько всего ждёт подряд */
  index: number;
  total: number;
  rerolls: number;
  banishes: number;
}

/** Сундук-барабан: что выпало (1–3 строки), эволюция — золотом */
export interface HudChest {
  items: { icon: string; name: string; from: number; to: number; evo?: boolean }[];
  /** большой (босса) */
  big: boolean;
  /** всё собрано: вместо вещей — «+50 опыта и +30 HP» */
  fallback?: string;
}

/** Экран итогов (по образцу блэкджека) */
export interface HudResults {
  waves: number;
  /** игровое время, мс */
  ms: number;
  newBest: boolean;
  /** место за неделю (0 — нет) */
  weekRank: number;
  /** строки жетонов: «Волны · 6 🪙» … и итог */
  coins: { label: string; n: number }[];
  coinsTotal: number;
  /** «Тебя одолел Бочар на 12-й волне» или пусто */
  killedBy: string;
  weapons: HudItem[];
  passives: HudItem[];
  /** урон по оружиям: сильнейшее сверху */
  dmg: { icon: string; name: string; n: number }[];
  kills: number;
  level: number;
  chests: number;
  /** ждём итог от сервера (дальше придёт второй вызов с монетами) */
  pending: boolean;
}

/** Стрелка у края экрана к цели за кадром */
export interface HudArrow {
  /** точка у края экрана, px, и куда смотрит (рад, 0 — вправо, по часовой — вниз) */
  x: number;
  y: number;
  angle: number;
  kind: 'elite' | 'chest' | 'spring' | 'altar' | 'boss';
  /** до цели, м */
  dist: number;
}

export type HudBannerStyle = 'wave' | 'win' | 'elite' | 'boss' | 'level' | 'warn';

/** Что интерфейс просит у сцены (клик мышью; те же действия сцена делает по клавишам) */
export interface HudActions {
  pick(i: number): void;
  reroll(): void;
  /** убрать карточку i навсегда */
  ban(i: number): void;
  /** в бой раньше (передышка) */
  go(): void;
  /** Q с экрана телефона: true — нажали (заряд), false — отпустили (удар) */
  q(on: boolean): void;
  /** закрыть сундук и продолжить */
  chestDone(): void;
  pause(): void;
  resume(): void;
  /** выйти из забега (засчитать отбитые волны) */
  quit(): void;
  again(): void;
  toLobby(): void;
}

/** Интерфейс режима — его реализует hud.ts */
export interface DungeonHudApi {
  setVisible(on: boolean): void;
  frame(f: HudFrame, now: number): void;
  /** null — закрыть */
  cards(c: HudCards | null): void;
  /** режим «Убрать»: клик по карточке убирает её */
  readonly banMode: boolean;
  setBanMode(on: boolean): void;
  chest(c: HudChest | null): void;
  /** пауза: wavesDone — «Выйти (засчитать N волн)» */
  pause(open: boolean, wavesDone: number): void;
  results(r: HudResults | null): void;
  banner(title: string, sub: string, style: HudBannerStyle): void;
  /** звёздочка нового уровня прыгает в угол / вспышка */
  levelFlash(level: number): void;
  arrows(list: HudArrow[]): void;
  /** «Загрузка…» поверх, пока грузятся модели (0…1) */
  loading(p: number | null): void;
  /** телефон: заглушка вместо игры */
  phoneStub(on: boolean): void;
  dispose(): void;
}
