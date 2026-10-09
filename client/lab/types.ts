// Лаборатория: что такое запись каталога (идея или прототип), живая сцена и всё, что сцена получает от страницы.
// Файлы прототипов (proto/*.ts) берут из этого файла только типы, а рабочее — three.js, желейку, звук — из ctx:
// тогда реестр грузится без three.js (страница лёгкая) и без DOM (его читают тесты).
import type * as ThreeNs from 'three';
import type { Kit } from './kit3d.ts';

export const CATEGORIES = ['mode', 'world', 'animals', 'outfit', 'social', 'event', 'comfort'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  mode: 'Режимы',
  world: 'Мир',
  animals: 'Животные',
  outfit: 'Одежда',
  social: 'Социальное',
  event: 'События',
  comfort: 'Удобство',
};

/** S — до пары дней, M — несколько дней и состояние на сервере, L — неделя и больше или новый мир */
export type Size = 'S' | 'M' | 'L';
export const SIZE_HINT: Record<Size, string> = { S: 'до пары дней', M: 'несколько дней', L: 'неделя и больше' };

/** Отобранный пример продуктового исследования. Не меняет решение владельца. */
export interface ResearchNote {
  sourceId: string;
  focus: string;
  players: string;
  round: string;
  /** Интересный выбор игрока, который проверяет идея. */
  decision: string;
  /** Что должно произойти на повторной попытке. */
  test: string;
  /** Что показывает локальное превью и что ещё требует проверки. */
  scope: string;
  references: readonly { title: string; url: string }[];
}

export interface Idea {
  /** Латиница и дефисы, до 40 знаков: он же ключ решения в lab.json */
  id: string;
  /** Номер в плане docs/superpowers/plans/2026-10-03-lab.md; задаёт порядок показа */
  n: number;
  title: string;
  /** Суть в одном-двух предложениях */
  pitch: string;
  /** Почему это весело */
  fun: string;
  category: Category;
  size: Size;
  /** Иллюстрация — SVG-строка из art.ts (только атрибуты оформления) */
  art: () => string;
  /** Метка «очень полезно» */
  priority?: boolean;
  /** Остров и паром: идеи на вырост */
  island?: boolean;
  /** Видно другим игрокам: понадобится новый протокол */
  net?: boolean;
  /** С чем пересекается и на что смотреть, одной строкой */
  touches?: string;
  /** Живое превью: есть только у прототипов */
  live?: LiveDef;
  /** Новая карточка из продуктового ревью, с меткой New и основанием выбора. */
  research?: ResearchNote;
}

/** Идея с живым превью */
export interface Experiment extends Idea {
  live: LiveDef;
}

export interface LiveDef {
  /** Подпись кнопки запуска */
  cta?: string;
  /** Как управлять, одной-двумя фразами (показывается под сценой) */
  hint: string;
  create(ctx: LabContext): LiveScene;
}

export interface LiveScene {
  scene: ThreeNs.Scene;
  camera: ThreeNs.PerspectiveCamera;
  /** Точка, вокруг которой крутится камера (по умолчанию — куда смотрит камера на старте) */
  target?: ThreeNs.Vector3;
  /** Экспозиция кадра (1 — как есть) */
  exposure?: number;
  update(dt: number, t: number): void;
  /** Короткое касание по сцене (не вращение): x, y в долях экрана −1…1 */
  tap?(x: number, y: number): void;
  dispose(): void;
}

/** Всё, что сцена получает от страницы */
export interface LabContext {
  THREE: typeof ThreeNs;
  kit: Kit;
  ui: PanelApi;
  sound: Sound;
}

export interface Meter {
  /** 0…1 */
  set(v: number): void;
  /** Зелёная зона на шкале, доли 0…1 */
  zone(from: number, to: number): void;
}

export interface PanelApi {
  /** Кнопка под сценой */
  button(label: string, on: () => void, primary?: boolean): HTMLButtonElement;
  /** Кнопка, которую держат: down при нажатии, up при отпускании (в том числе если палец ушёл) */
  hold(label: string, down: () => void, up: () => void): HTMLButtonElement;
  meter(label: string): Meter;
  /** Строка «название: значение» */
  stat(label: string, value?: string): { set(v: string): void };
  /** Подсказка или комментарий под сценой; пустая строка прячет */
  note(text: string): void;
  /** Однострочное поле */
  input(label: string, value: string, max: number): HTMLInputElement;
}

export interface Sound {
  /** Звук можно включить, пока пользователь не нажал на «Звук: выкл» */
  tone(o: { f0: number; f1?: number; dur: number; type?: OscillatorType; vol?: number; delay?: number }): void;
  noise(o: { dur: number; vol?: number; lp0?: number; lp1?: number; delay?: number }): void;
  tick(pitch?: number): void;
  boom(): void;
  whoosh(): void;
  pop(): void;
  ding(): void;
  slip(): void;
  splat(): void;
  honk(): void;
  plip(pitch?: number): void;
  step(i: number): void;
  fanfare(): void;
}
