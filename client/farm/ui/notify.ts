// Уведомления фермы (design-v11 §14.4, решение 18: только в игре, без push). На ферме: грядка созрела → тост «У тебя созрело N»
// (склеивается за 3 с, внутри — что именно). При входе: одна строка «Пока тебя не было: созрело 8 · свин нашёл 2 трюфеля · …».
// Один тост за сутки при переходе дневного потолка продаж 700 🪙. Вне фермы тосты и росток над калиткой на площади — забота
// сцены площади: для неё здесь countRipe и awayText (на площади профиль фермы приходит от сервера, см. отчёт B2).
import { mskDay } from '../../../shared/economy.ts';
import type { FarmProgress } from '../../../shared/farm.ts';
import { DAILY_CAP, RIPE_TOAST_MERGE_MS, VAN_SLOTS_BY_LEVEL, cropById } from '../../../shared/farmdata.ts';
import type { FarmAway } from '../../../shared/farmsys.ts';
import { vanTime } from '../../../shared/farmvan.ts';
import { farmLevel } from '../../../shared/farm.ts';
import { clockHour, mskHour } from './common.ts';

export type Toast = (text: string, sub?: string, key?: string) => void;

/** Сколько грядок спелых прямо сейчас */
export function countRipe(f: FarmProgress, now: number): number {
  return f.beds.filter((b) => b.crop && now >= b.ripeAt).length;
}

/** «🌱 На ферме созрело 6 — загляни» (вне фермы, не чаще раза в AWAY_TOAST_MS) */
export function awayText(n: number): string {
  return `🌱 На ферме созрело ${n} — загляни`;
}

function trufflePlural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'трюфель' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'трюфеля' : 'трюфелей';
}

export class FarmNotify {
  private readonly toast: Toast;
  /** Спелые грядки, о которых уже знаем: «номер:созревание:культура» */
  private known: Set<string> | null = null;
  private pending = new Map<string, number>();
  private pendingSince = 0;
  private lastSold = -1;
  private capDay = '';

  constructor(toast: Toast) {
    this.toast = toast;
  }

  /** Вошли на ферму или ушли: забываем прошлое, первая проверка ничего не объявляет */
  reset(): void {
    this.known = null;
    this.pending.clear();
    this.lastSold = -1;
  }

  /** Раз в секунду и при каждом новом прогрессе: что стало спелым, не пора ли тост */
  check(f: FarmProgress, now: number): void {
    const cur = new Set<string>();
    const fresh: string[] = [];
    f.beds.forEach((b, i) => {
      if (!b.crop || now < b.ripeAt) return;
      const key = `${i}:${b.ripeAt}:${b.crop}`;
      cur.add(key);
      if (this.known && !this.known.has(key)) fresh.push(b.crop);
    });
    this.known = cur;
    for (const id of fresh) {
      const name = cropById(id)?.product ?? id;
      if (this.pending.size === 0) this.pendingSince = Date.now();
      this.pending.set(name, (this.pending.get(name) ?? 0) + 1);
    }
    if (this.pending.size && Date.now() - this.pendingSince >= RIPE_TOAST_MERGE_MS) this.flush();
  }

  private flush(): void {
    let n = 0;
    const parts: string[] = [];
    for (const [name, k] of this.pending) { n += k; parts.push(k > 1 ? `${name} ×${k}` : name); }
    this.pending.clear();
    this.toast(`У тебя созрело ${n}`, parts.join(', '), 'farm-ripe');
  }

  /** Касса Гриба на сегодня полна: один тост за сутки при переходе через потолок */
  checkCap(f: FarmProgress, now: number): void {
    const day = mskDay(now);
    const sold = f.sold.day === day ? f.sold.coins : 0;
    const was = this.lastSold;
    this.lastSold = sold;
    if (was < 0 || was >= DAILY_CAP || sold < DAILY_CAP || this.capDay === day) return;
    this.capDay = day;
    this.toast('Касса Гриба на сегодня полна', 'Дальше ×0,25 до 00:00. Заказы платят полностью', 'farm-cap');
  }

  /** Строка при входе (farmAway от сервера): созрело, трюфели свина, кто полил, Фургон */
  away(a: FarmAway, f: FarmProgress, now: number): void {
    const parts: string[] = [];
    if (a.ripe > 0) parts.push(`созрело ${a.ripe}`);
    if (a.truffles > 0) parts.push(`свин нашёл ${a.truffles} ${trufflePlural(a.truffles)}`);
    if (a.helped > 0) parts.push(a.by.length ? `${a.by.slice(0, 2).join(' и ')} полил${a.by.length > 1 ? 'и' : ''} грядки (${a.helped})` : `соседи полили грядки: ${a.helped}`);
    if (farmLevel(f.xp) >= VAN_SLOTS_BY_LEVEL[0].level && vanTime(now).open) parts.push(`Фургон открыт до ${clockHour(mskHour(vanTime(now).next))}`);
    if (parts.length) this.toast('Пока тебя не было', parts.join(' · '), 'farm-entry');
  }
}
