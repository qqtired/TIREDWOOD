// Ферма: сообщения части B1 (сервер → клиент): Фургон, Древо разлома, награды (заказы, помощь, достижения,
// репутация), сводка «Пока тебя не было». farmnet.ts и messages.ts уже включают FarmSysMsg; сервер шлёт через
// FarmCtx.send, клиент получает их в FarmHud.onSys (окна, B2) и FarmWorld.onSys (3D, B3).
//
// Что клиент берёт сам из своего прогресса (farmMe.me), без отдельных сообщений:
// - заказы — me.orders (day, list, rerolls = сколько замен осталось); шаблоны — ORDER_TEMPLATES, подсказки —
//   shared/farmorders.ts (orderReady, ordersResetAt);
// - очки помощи — me.help (points — сколько осталось, resetAt — когда полный сброс; 0 — таймер не идёт): показывать
//   через helpView из shared/farmhelp.ts — он учитывает сброс по часам;
// - репутация — me.rep (repLevel, repBonus из shared/farm.ts), баффы — me.buffs, достижения — me.achievements и
//   me.counters (прогресс — achProgress из shared/farmach.ts);
// - экран нового уровня — событие farmEv 'level' + levelUnlocks(level) из shared/farmach.ts («Открыто: …»).
import type { FarmBuffKind } from './farmdata.ts';
import type { VanOffer } from './farmvan.ts';

/** Слот Фургона: предложение, сдан ли он в этом цикле; закрытый — чем открывается («ур. 5» или «репутация 4») */
export interface FarmVanSlotView {
  i: number;
  offer: VanOffer | null;
  done: boolean;
  lock: { level?: number; rep?: number } | null;
}

export interface FarmVanView {
  cycle: number;
  open: boolean;
  /** Когда Фургон уедет (open) или приедет (закрыт), мс серверного времени */
  next: number;
  /** Фургон доступен с ур. 3; до него — все слоты с замком «ур. 3» */
  slots: FarmVanSlotView[];
}

export interface FarmBossRow {
  pid: number;
  nick: string;
  pts: number;
}

/**
 * Древо разлома: sleep — спит до start; soon — анонс (с 18:55); awake — идёт событие; bloom — расцвело (до end
 * показывать праздник); gone — не расцвело и ушло спать.
 */
export interface FarmBossView {
  st: 'sleep' | 'soon' | 'awake' | 'bloom' | 'gone';
  start: number;
  end: number;
  /** «Цветение»: сколько нужно (2 000 × N) и сколько набрано; фаза 1–4 */
  hp: number;
  bloom: number;
  phase: number;
  n: number;
  /** Топ-5 вклада, свои очки и место (0 — ещё без вклада) */
  top: FarmBossRow[];
  mine: number;
  place: number;
  /** Шишки-ворчуньи на земле (фазы 2–3) */
  cones: { id: number; x: number; z: number }[];
}

/** Итог события — каждому, кто на ферме, и для «Итога Древа» */
export interface FarmBossResult {
  bloom: boolean;
  last: { pid: number; nick: string } | null;
  top: { pid: number; nick: string; share: number }[];
  /** Свой вклад: доля 0–1, место (0 — без вклада), выпавший бафф и репутация */
  mine: { share: number; place: number; buff: FarmBuffKind | null; rep: number };
}

/**
 * Награда для тоста: откуда, id (шаблон заказа, достижение, ступень репутации, pid соседа, день Древа), что выдано.
 * items — вещи каталога или убранства; у Древа — 'buff:xp' | 'buff:price' | 'buff:grow' (BUFFS). Сделка Фургона
 * приходит обычным farmEv 'sold' + 'xp'.
 */
export interface FarmGot {
  src: 'order' | 'help' | 'ach' | 'rep' | 'boss';
  id: string;
  coins: number;
  xp: number;
  rep: number;
  items: string[];
}

/** Сводка при входе: созрело, трюфели у свина, сколько раз полили соседи и кто (ники, кого сервер знает) */
export interface FarmAway {
  ripe: number;
  truffles: number;
  helped: number;
  by: string[];
}

export type FarmSysMsg =
  /** Фургон: при входе, при смене часа, после сделки и нового уровня */
  | { t: 'farmVan'; v: FarmVanView }
  /** Древо: при входе и при каждом изменении (не чаще раза в секунду) */
  | { t: 'farmBoss'; b: FarmBossView }
  | { t: 'farmBossEnd'; r: FarmBossResult }
  /** Эффекты Древа: чих (фаза 2, раз в 40 с); шишку подобрали (id, кто) */
  | { t: 'farmBossFx'; k: 'sneeze' | 'cone'; id?: number; by?: number }
  | { t: 'farmGot'; g: FarmGot }
  | { t: 'farmAway'; a: FarmAway };

/**
 * Причины отказа частей B1 (событие farmEv fail): общий список FarmFail занят фундаментом, поэтому у действий
 * help/van/order/cone свои значения. Текст — для подсказки на месте.
 */
export function sysFailText(a: 'help' | 'van' | 'order' | 'cone', why: string): string | null {
  const t: Record<string, Record<string, string>> = {
    help: {
      level: 'Помогать соседям можно с ур. 2 фермы',
      plot: 'Это не соседский участок',
      count: 'Очки помощи кончились — скоро сброс',
      water: 'Лейка пуста — набери воды у колодца',
      empty: 'Грядка пустая',
      unripe: 'Почти созрело — помощь не нужна',
      watered: 'Ты уже помог этой грядке',
      max: 'Этой грядке уже помогли трое',
      far: 'Подойди ближе',
    },
    van: {
      off: 'Фургон уехал — вернётся в чётный час',
      level: 'Этот ящик ещё закрыт',
      max: 'Ящик уже сдан — жди следующий Фургон',
      item: 'Не хватает урожая в сумке',
      far: 'Подойди к Фургону',
    },
    order: {
      order: 'Заказ ещё не выполнен',
      max: 'Замен на сегодня не осталось',
      item: 'Награда уже забрана',
      far: 'Подойди к доске заказов',
    },
    cone: {
      off: 'Древо спит',
      item: 'Шишку уже подобрали',
      max: 'Хватит шишек: 30 за событие',
      far: 'Подойди ближе',
    },
  };
  return t[a]?.[why] ?? null;
}
