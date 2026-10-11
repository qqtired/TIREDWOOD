// Подсказка действия внизу по центру (E): что под прицелом и что будет. Только данные, без DOM (тест: test/farm-ui.test.ts);
// разметку .k-prompt собирает prompt.ts. Образец — lab/ui/screens/farm.js: «Полить тыкву · созреет 12:40 → 10:08 · лейка −1»,
// «Собрать тыкву · +35 опыта · сумка +1», «Набрать лейку · ведро 1 из 4», «Полить соседу · лейка −1 · помощь −1 · +1 репутация».
// Решает сервер: подсказка лишь говорит, что произойдёт, и честно молчит («серым»), если нельзя.
import { bagCap, bagUsed, bedStage, farmLevel, hasBuff, type FarmProgress } from '../../../shared/farm.ts';
import { helpView } from '../../../shared/farmhelp.ts';
import { orderReady } from '../../../shared/farmorders.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { BUFFS, HELPS_PER_BED, HELP_MIN_LEFT_MS, HELP_MIN_LEVEL, WATER_CUT, WELL_SETS, cropById } from '../../../shared/farmdata.ts';
import type { FarmObjectId } from '../../../shared/farmmap.ts';
import type { FarmBedView } from '../../../shared/farmnet.ts';
import { accusative } from './belt-model.ts';
import { clockHour, fmtLeft, mskHour, wellView } from './fmt.ts';

export interface PromptPill {
  tone?: 'gold' | 'info' | 'good' | 'bad';
  /** Иконка: имя файла фермы или «ui:id» */
  icon?: string;
  text: string;
}

export interface Prompt {
  /** Клавиши; пусто — серая подсказка («почему нельзя») */
  keys: readonly string[];
  text: string;
  /** Приглушённо за чертой; strong — жирным в конце («созреет 12:40 → 10:08») */
  note?: string;
  strong?: string;
  pills?: readonly PromptPill[];
  /** Плашка над подсказкой: чья грядка у соседа */
  whose?: { icon: string; text: string };
}

/** Пояс семян (пустая грядка) или подсказка */
export function bedPrompt(f: FarmProgress, i: number, now: number, unlockLevel: number): Prompt | 'belt' {
  const b = f.beds[i];
  if (!b) return { keys: [], text: `Грядка ${i + 1} откроется на ур. ${unlockLevel} фермы`, note: `сейчас ${farmLevel(f.xp)}` };
  const st = bedStage(b, now);
  if (st === -1) return 'belt';
  const c = cropById(b.crop);
  const name = c?.name ?? '';
  if (st === 3) {
    if (bagUsed(f) >= bagCap(f)) return { keys: [], text: 'Сумка полна', note: `${c?.product ?? 'урожай'} ждёт — продай урожай Грибу` };
    const xp = Math.round((c?.xp ?? 0) * (hasBuff(f, 'xp', now) ? BUFFS.xp.mult : 1));
    return { keys: ['E'], text: `Собрать ${accusative(c?.product ?? '')}`, pills: [{ tone: 'gold', text: `+${xp} опыта` }, { icon: 'bag', text: '+1' }] };
  }
  const left = b.ripeAt - now;
  if (b.watered) return { keys: [], text: 'Полито', note: `${name}: созреет через `, strong: fmtLeft(left) };
  if (f.water < 100) return { keys: [], text: `${name} растёт`, note: 'лейка пуста — набери у колодца' };
  return { keys: ['E'], text: `Полить ${accusative(name)}`, note: 'созреет ', strong: `${fmtLeft(left)} → ${fmtLeft(left * (1 - WATER_CUT))}`, pills: [{ tone: 'info', icon: 'watering-can', text: '−1' }] };
}

/** Можно ли помочь этой грядке соседа (клиентская проверка для подсказки; последнее слово за сервером) */
export function canHelpBed(b: FarmBedView, now: number): boolean {
  return !!b.c && b.r - now > HELP_MIN_LEFT_MS && b.h < HELPS_PER_BED;
}

/** Грядка соседа под прицелом: «Полить соседу» с ценой в зарядах и очках помощи */
export function helpPrompt(f: FarmProgress, owner: string, plot: number, b: FarmBedView, now: number): Prompt {
  const c = cropById(b.c ?? '');
  const whose = { icon: c?.icon ?? 'help-hands', text: `${c?.name ?? 'Грядка'} · ${owner} · участок ${plot + 1}${b.r > now ? ` · созреет через ${fmtLeft(b.r - now)}` : ''}` };
  const hv = helpView(f, now);
  if (farmLevel(f.xp) < HELP_MIN_LEVEL) return { keys: [], text: 'Помогать соседям', note: `можно с ур. ${HELP_MIN_LEVEL} фермы`, whose };
  if (f.water < 100) return { keys: [], text: 'Полить соседу', note: 'лейка пуста — набери у колодца', whose };
  if (hv.points < 1) return { keys: [], text: 'Полить соседу', note: 'очки помощи кончились — скоро сброс', whose };
  return {
    keys: ['E'], text: 'Полить соседу', whose,
    pills: [{ tone: 'info', icon: 'watering-can', text: '−1' }, { icon: 'help-hands', text: '−1' }, { tone: 'good', text: '+1 репутация' }],
  };
}

/** Корыто у колодца */
export function troughPrompt(f: FarmProgress, canMax: number, now: number): Prompt {
  if (f.water >= canMax) return { keys: [], text: 'Лейка полная' };
  const w = wellView(f, now);
  if (w.sets <= 0) return { keys: [], text: 'Колодец набирается', note: w.nextAt ? `следующее ведро через ${fmtLeft(w.nextAt - now)}` : undefined };
  return { keys: ['E'], text: 'Набрать лейку', pills: [{ tone: 'info', icon: 'bucket', text: `ведро ${w.sets} из ${WELL_SETS}` }] };
}

/** Общие места фермы: Гриб, Семечкин, доски, Фургон, Древо, телега */
export function usePrompt(id: FarmObjectId, f: FarmProgress, now: number): Prompt | null {
  switch (id) {
    case 'grib': return { keys: ['E'], text: 'Дядюшка Гриб', note: 'продать урожай' };
    case 'semechkin': return { keys: ['E'], text: 'Семечкин', note: 'семена и обучение' };
    case 'cart': return { keys: ['E'], text: 'В город', note: 'на набережную' };
    case 'farmBoard': return { keys: ['E'], text: 'Доска фермы', note: 'соседи и участки' };
    case 'boss': return { keys: ['E'], text: 'Древо разлома', note: 'вклад и награды' };
    case 'orders': {
      const ready = f.orders.list.filter((o) => !o.done && orderReady(f, o, now)).length;
      return { keys: ['E'], text: 'Доска заказов', pills: ready ? [{ tone: 'good', text: `${ready} ${ready === 1 ? 'готов' : 'готово'}` }] : undefined };
    }
    case 'van': {
      const t = vanTime(now);
      return { keys: ['E'], text: 'Фургон', note: 'сдать ящик', pills: [t.open ? { tone: 'good', text: `здесь до ${clockHour(mskHour(t.next))}` } : { text: `уехал, вернётся в ${clockHour(mskHour(t.next))}` }] };
    }
    default: return null;
  }
}
