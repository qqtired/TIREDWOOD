// Награды рыбалки (выпуск 7): лестница по числу видов в журнале рыбака — каждые 5 видов что-то новое, финал — за все
// виды. Пороги фиксированные; порог выше числа видов в коде сливается с финалом. Выдаёт сервер (server/fishstyle.ts)
// при входе и после каждого улова; выданное не отнимается — добавят виды, полученное останется.
import { COLLECTION } from './fishrules.ts';
import { EXTRA_SLOTS, itemById, type Outfit, type Slot } from './outfit.ts';

/** Порог «все виды» */
export const ALL = Infinity;

export interface RewardStep {
  /** Сколько видов в журнале нужно (ALL — все) */
  need: number;
  /** Вещи по порядку: последняя снасть слота надевается сама */
  items: readonly string[];
  /** Сет одежды: объявляется в чат */
  set?: string;
}

export const LADDER: readonly RewardStep[] = [
  { need: 5, items: ['w:chart'] },
  { need: 10, items: ['r:hazel', 'a:kukan'] },
  { need: 15, items: ['b:quill', 'b:duck'] },
  { need: 20, items: ['h:angler', 'e:angler', 'a:angler'], set: 'Бывалый рыбак' },
  { need: 25, items: ['r:carved'] },
  { need: 30, items: ['h:sou', 'a:oilskin', 's:gull'], set: 'Капитан баркаса' },
  { need: 35, items: ['a:net'] },
  { need: 40, items: ['w:night'] },
  { need: 45, items: ['b:firefly'] },
  { need: ALL, items: ['h:captain', 'a:tunic', 's:parrot', 'r:gold', 'b:goldfish', 'w:gold', 'n:anchor'], set: 'Хозяин глубин' },
];

/** Снасти и значок: надеваются сами при получении, меняются в журнале рыбака (J) где угодно на набережной */
export const GEAR_SLOTS: readonly Slot[] = ['r', 'b', 'w', 'n'];

/** Аксессуары рыбалки по телу и на поясе: в пейнтболе прячутся под командный жилет */
export const SHELL_ACCS: ReadonlySet<string> = new Set(['angler', 'oilskin', 'tunic', 'kukan', 'net']);

/** Описание награды для журнала и примерочной: что это и как выглядит */
export const REWARD_INFO: Readonly<Record<string, { kind: string; text: string }>> = {
  'w:chart': { kind: 'окно вываживания', text: 'Пергамент, морская сетка и роза ветров' },
  'r:hazel': { kind: 'удочка', text: 'Ореховая ветка в коре, бечёвка и деревянное мотовило' },
  'a:kukan': { kind: 'аксессуар', text: 'Связка рыбы на шнурке у пояса' },
  'b:quill': { kind: 'поплавок', text: 'Длинное гусиное перо с красной верхушкой' },
  'b:duck': { kind: 'поплавок', text: 'Жёлтая резиновая уточка' },
  'h:angler': { kind: 'шапка', text: 'Мягкая панама с блёснами и мушкой на ленте' },
  'e:angler': { kind: 'очки', text: 'Янтарные поляризационные очки на шнурке' },
  'a:angler': { kind: 'аксессуар', text: 'Жилет рыболова с карманами и блесной на груди' },
  'r:carved': { kind: 'удочка', text: 'Светлое дерево, резная спираль и латунная катушка' },
  'h:sou': { kind: 'шапка', text: 'Жёлтая штормовая шляпа с длинными полями сзади' },
  'a:oilskin': { kind: 'аксессуар', text: 'Жёлтая роба с воротником-стойкой и клыками-застёжками' },
  's:gull': { kind: 'питомец', text: 'Чайка на плече — вертит головой' },
  'a:net': { kind: 'аксессуар', text: 'Подсачек на боку — вдруг попадётся крупная' },
  'w:night': { kind: 'окно вываживания', text: 'Звёздная ночь, лунная дорожка и фонарь' },
  'b:firefly': { kind: 'поплавок', text: 'Тёплый светящийся кончик — виден в грозу' },
  'h:captain': { kind: 'шапка', text: 'Белая фуражка, золотой шнур и «краб» с якорем' },
  'a:tunic': { kind: 'аксессуар', text: 'Двубортный китель, латунные пуговицы и золотые погоны' },
  's:parrot': { kind: 'питомец', text: 'Красный попугай-ара на плече' },
  'r:gold': { kind: 'удочка', text: 'Золото, чёрные обмотки и рубин на катушке' },
  'b:goldfish': { kind: 'поплавок', text: 'Золотая рыбка торчком — искрит при падении' },
  'w:gold': { kind: 'окно вываживания', text: 'Золочёная рама и золотая зона' },
  'n:anchor': { kind: 'значок у ника', text: 'Золотой якорь у ника — видят все' },
};

/** Видов в коллекции сейчас (вместе с видами баркаса); порог «все» — столько */
export function fishTotal(): number {
  return COLLECTION.length;
}

/** Сколько видов нужно на этой ступени при total видах в игре */
export function stepNeed(step: RewardStep, total = fishTotal()): number {
  return Math.min(step.need, total);
}

/** Ступень, на которой выдают вещь; undefined — не награда коллекции */
export function stepOf(itemId: string): RewardStep | undefined {
  return LADDER.find((s) => s.items.includes(itemId));
}

/** Сколько видов нужно для вещи; null — не награда коллекции */
export function needOf(itemId: string, total = fishTotal()): number | null {
  const s = stepOf(itemId);
  return s ? stepNeed(s, total) : null;
}

/** Всё, что положено за got видов (по порядку лестницы) */
export function earnedItems(got: number, total = fishTotal()): string[] {
  return LADDER.filter((s) => got >= stepNeed(s, total)).flatMap((s) => s.items);
}

/** Следующая ступень после got видов; null — всё собрано */
export function nextStep(got: number, total = fishTotal()): RewardStep | null {
  return LADDER.find((s) => got < stepNeed(s, total)) ?? null;
}

/** Короткое имя награды для тостов и карточки: «поплавок «Уточка»», сет — «сет «Бывалый рыбак»» */
export function rewardLabel(itemId: string): string {
  const it = itemById(itemId);
  if (!it) return itemId;
  const kind = REWARD_INFO[itemId]?.kind;
  return kind && kind !== 'аксессуар' && kind !== 'шапка' && kind !== 'очки' ? `${kind} «${it.name}»` : `«${it.name}»`;
}

/** Ступень одним словом: «окно «Морская карта»», «удочка «Орешник» и «Кукан с уловом»», «сет «Капитан баркаса»» */
export function stepLabel(step: RewardStep): string {
  if (step.set) return `сет «${step.set}»`;
  return step.items.map(rewardLabel).join(' и ');
}

/** Вне примерочной меняются только снасти и значок: остальное — как было (сервер, room.ts onOutfit) */
export function gearOnly(current: Outfit, raw: unknown): Outfit {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Outfit = { ...current };
  for (const slot of GEAR_SLOTS) {
    const key = r[slot];
    if (typeof key === 'string') out[slot as (typeof EXTRA_SLOTS)[number]] = key;
    else delete out[slot as (typeof EXTRA_SLOTS)[number]];
  }
  return out;
}
