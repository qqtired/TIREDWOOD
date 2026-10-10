// Награды рыбалки (выпуск 7): лестница по числу видов в журнале рыбака — каждые 5 видов что-то новое, финал — за все
// виды. Пороги фиксированные; порог выше числа видов в коде сливается с финалом. Выдаёт сервер (server/fishstyle.ts)
// при входе и после каждого улова; выданное не отнимается — добавят виды, полученное останется.
// Остров «Последний свет» (флаг ISLE) — своя лестница ISLE_LADDER по видам острова: награда каждые 4 вида, сет — за все 20;
// лестница 52 видов пристани и баркаса её не считает.
import { COLLECTION } from './fishrules.ts';
import { ISLE_TOTAL } from './islestyle.ts';
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

/**
 * Лестница острова «Последний свет»: свой счётчик видов острова (isleCaught в shared/islestyle.ts), каждые 4 вида —
 * награда, все 20 — сет «Смотритель маяка» (дизайн plans/2026-10-10-fishing-island.md §7).
 */
export const ISLE_LADDER: readonly RewardStep[] = [
  { need: 4, items: ['b:bellbuoy'] },
  { need: 8, items: ['r:lighthouse'] },
  { need: 12, items: ['w:fog'] },
  { need: 16, items: ['s:puffin'] },
  { need: ISLE_TOTAL, items: ['h:keeper', 'a:keeper', 'n:lighthouse'], set: 'Смотритель маяка' },
];

/** Награды острова — по ним примерочная и журнал прячут вещи, пока остров выключен (ISLE) */
export const ISLE_ITEMS: ReadonlySet<string> = new Set(ISLE_LADDER.flatMap((s) => s.items));

/** Снасти и значок: надеваются сами при получении, меняются в журнале рыбака (J) где угодно на набережной */
export const GEAR_SLOTS: readonly Slot[] = ['r', 'b', 'w', 'n'];

/** Аксессуары рыбалки по телу и на поясе: в пейнтболе прячутся под командный жилет */
export const SHELL_ACCS: ReadonlySet<string> = new Set(['angler', 'oilskin', 'tunic', 'kukan', 'net', 'keeper']);

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
  'a:oilskin': { kind: 'аксессуар', text: 'Жёлтая роба, синий отложной воротник и застёжки-клыки' },
  's:gull': { kind: 'питомец', text: 'Чайка на плече — вертит головой' },
  'a:net': { kind: 'аксессуар', text: 'Подсачек на боку — вдруг попадётся крупная' },
  'w:night': { kind: 'окно вываживания', text: 'Звёздная ночь, лунная дорожка и фонарь' },
  'b:firefly': { kind: 'поплавок', text: 'Тёплый светящийся кончик — виден в грозу' },
  'h:captain': { kind: 'шапка', text: 'Белая фуражка, золотой шнур и «краб» с якорем' },
  'a:tunic': { kind: 'аксессуар', text: 'Двубортный китель, латунные пуговицы и эполеты с бахромой' },
  's:parrot': { kind: 'питомец', text: 'Красный попугай-ара на плече' },
  'r:gold': { kind: 'удочка', text: 'Золото, чёрные обмотки и рубин на катушке' },
  'b:goldfish': { kind: 'поплавок', text: 'Золотая рыбка торчком — искрит при падении' },
  'w:gold': { kind: 'окно вываживания', text: 'Золочёная рама и золотая зона' },
  'n:anchor': { kind: 'значок у ника', text: 'Золотой якорь у ника — видят все' },
  // остров «Последний свет» (тексты — страница ревью, одобренная владельцем 10.10)
  'b:bellbuoy': { kind: 'поплавок', text: 'Красно-белый буёк с огоньком наверху и колокольчиком: на поклёвке «дзынь»' },
  'r:lighthouse': { kind: 'удочка', text: 'Бело-красная спираль, латунная катушка, огонёк на кончике вспыхивает раз в 6 с, как маяк' },
  'w:fog': { kind: 'окно вываживания', text: 'Рама из выбеленного плавника с канатом, жемчужная вода, клочья тумана (рыбу не прячут), зона — тёплый луч маяка' },
  's:puffin': { kind: 'питомец', text: 'Атлантический тупик на плече: моргает, вертит головой, на поимке держит в клюве мойву' },
  'h:keeper': { kind: 'шапка', text: 'Вязаная шапка в бело-красную маячную полоску с помпоном' },
  'a:keeper': { kind: 'аксессуар', text: 'Свитер-«норвежец» с узором-маяками и фонарь «летучая мышь» на поясе — светится' },
  'n:lighthouse': { kind: 'значок у ника', text: 'Маленький маяк у ника мигает раз в 6 с — видят все' },
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

/** Награда острова за столько видов острова; null — не награда острова */
export function isleNeedOf(itemId: string): number | null {
  const s = ISLE_LADDER.find((st) => st.items.includes(itemId));
  return s ? stepNeed(s, ISLE_TOTAL) : null;
}

/** Всё, что положено за got видов острова (по порядку лестницы острова) */
export function isleEarned(got: number): string[] {
  return ISLE_LADDER.filter((s) => got >= stepNeed(s, ISLE_TOTAL)).flatMap((s) => s.items);
}

/** Следующая ступень острова после got видов острова; null — всё собрано */
export function isleNextStep(got: number): RewardStep | null {
  return ISLE_LADDER.find((s) => got < stepNeed(s, ISLE_TOTAL)) ?? null;
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
