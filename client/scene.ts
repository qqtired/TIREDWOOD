// Сцены (набережная, пейнтбол) и то, что им даёт оболочка: рендерер, ввод, звук, соединение, общий интерфейс.
import type { Stats } from '../shared/economy.ts';
import type { FishAlbum } from '../shared/fishing.ts';
import type { FishProgress } from '../shared/fishprogress.ts';
import type { RoomKind, ServerMsg } from '../shared/messages.ts';
import type { Outfit } from '../shared/outfit.ts';
import type { Sound } from './audio.ts';
import type { Chat } from './chat.ts';
import type { Input } from './input.ts';
import type { Net } from './net.ts';
import type { Renderer } from './render/renderer.ts';
import type { Settings } from './settings.ts';
import type { TouchMode } from './touch.ts';
import type { OnlineList } from './ui/online.ts';
import type { Toasts } from './ui/toasts.ts';
import type { TokensHud } from './ui/tokens.ts';

/** Мой профиль по последнему `me` (и балансу из `tokens`) */
export interface MeState {
  pid: number;
  xp: number;
  level: number;
  nick: string;
  tokens: number;
  owned: string[];
  outfit: Outfit;
  stats: Stats;
  /** Альбом рыбака: вид → [рекорд, граммы; сколько положено] */
  album: FishAlbum;
  fishing: FishProgress;
  gifts?: boolean;
}

export interface Ui {
  chat: Chat;
  tokens: TokensHud;
  toasts: Toasts;
  online: OnlineList;
  me: () => MeState;
}

export interface SceneDeps {
  renderer: Renderer;
  input: Input;
  sound: Sound;
  settings: Settings;
  net: Net;
  ui: Ui;
  /** Слой интерфейса сцен (под чатом и меню) */
  hudRoot: HTMLElement;
  /** Слой над меню (уведомления, снимок у маяка): видно и на паузе */
  overlay: HTMLElement;
  /** Сцене снова нужна мышь (вышли из примерочной): захватить, а если браузер не дал — пауза с кнопкой */
  wantPointer: () => void;
}

export interface Scene {
  readonly kind: RoomKind;
  /** Сервер перевёл в эту комнату: дальше придут её приветствие и снимки */
  enter(): void;
  /** Ушли из комнаты или пропала связь: убрать игроков, эффекты, интерфейс */
  exit(): void;
  onJson(msg: ServerMsg): void;
  onSnapshot(buf: ArrayBuffer, at: number): void;
  /** Кадр в игре: тики ввода 60 Гц — внутри */
  frame(now: number, dt: number): void;
  /** Клавиши сверх движения. true — съела */
  onKey(code: string, down: boolean, e: KeyboardEvent): boolean;
  /** ЛКМ (mouse = true) или E */
  onUse(mouse: boolean): void;
  resize(w: number, h: number): void;
  /** Нужна ли сейчас захваченная мышь (в примерочной — нет, пауза не показывается) */
  readonly wantsPointer: boolean;
  /** Телефон: какие кнопки показать на экране */
  readonly touchMode: TouchMode;
  /** Телефон: что написано на кнопке действия (по умолчанию «E») */
  readonly touchUseIcon?: string;
  /** Для window.__opus.state() */
  debugState(): Record<string, unknown> | null;
  /** Сцена ещё грузит модели: экран загрузки ждёт их (не дольше LOAD_MAX_MS, client/ui/transition.ts) */
  readonly loading?: boolean;
  /** Меню открылось или закрылось (Esc, потеря мыши): соло-режим ставит игру на паузу («Подземелье») */
  setPaused?(paused: boolean): void;
}
