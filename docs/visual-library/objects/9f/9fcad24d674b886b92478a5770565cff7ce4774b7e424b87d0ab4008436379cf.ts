// Голосование «сдаться» у белого флага крепости. Чистая логика: без сети и без часов — время приходит тиками от игры
// (FortGame.tick), кто в крепости — списком номеров. Игра (game.ts) только зовёт методы и по ответам рассылает
// состояние, пишет в чат и, если прошло, заканчивает матч так же, как при разбитом кристалле.
//
// Правила (решает сервер):
// - первое E у флага — «нажми ещё раз» (3 с), второе — голосование; одному игроку второе E сразу заканчивает игру;
// - голосуют все люди в крепости на начало (живые, сбитые и ждущие на террасе), предложивший — уже «за»;
// - прошло, как только «за» строго больше половины (1→1, 2→2, 3→2, 4→3, 5→3, 6→4); не прошло — как только «за» уже
//   не набрать, или через 20 с; ушедший выбывает из подсчёта вместе со своим голосом; голос не меняют;
// - после неудачи всем 45 с нельзя предлагать снова.
import {
  SURR_ASK_TICKS, SURR_COOLDOWN_TICKS, SURR_VOTE_TICKS, surrenderNeed, type FortSurrender,
} from '../../shared/fortsurrender.ts';

/** Чем кончилось голосование: view — финальное состояние для рассылки (open: false, cd — когда можно снова) */
export interface SurrenderOutcome {
  result: 'passed' | 'failed';
  /** enough — «за» хватило; time — вышло время; hopeless — «за» уже не набрать */
  why: 'enough' | 'time' | 'hopeless';
  yes: number;
  no: number;
  /** Сколько голосовало к концу (без ушедших) и сколько «за» было нужно */
  voters: number;
  need: number;
  by: number;
  name: string;
  view: FortSurrender;
}

/** Ответ на E у флага */
export type SurrenderPress =
  /** Первое нажатие: нажми ещё раз до тика until */
  | { k: 'ask'; until: number }
  /** После неудачи: сколько тиков ещё нельзя */
  | { k: 'wait'; left: number }
  /** Голосование уже идёт */
  | { k: 'busy' }
  /** Голосование началось */
  | { k: 'started' }
  /** Голосовать некому, кроме предложившего: сразу итог */
  | { k: 'ended'; out: SurrenderOutcome };

/** Голос или выход изменили состояние; out — если этим голосование и кончилось */
export interface SurrenderStep {
  out: SurrenderOutcome | null;
}

interface Vote {
  by: number;
  name: string;
  voters: number[];
  yes: number[];
  no: number[];
  end: number;
}

export class Surrender {
  private cur: Vote | null = null;
  private cooldownUntil = 0;
  /** Кто нажал E первый раз и до какого тика второе нажатие ещё считается подтверждением */
  private readonly asked = new Map<number, number>();

  get open(): boolean {
    return this.cur !== null;
  }

  /** Сколько тиков ещё нельзя предлагать (0 — можно) */
  waitLeft(now: number): number {
    return Math.max(0, this.cooldownUntil - now);
  }

  /** E у флага. voters — номера всех людей в крепости сейчас (с предложившим), name — имя предложившего */
  press(by: number, name: string, voters: readonly number[], now: number): SurrenderPress {
    if (this.cur) return { k: 'busy' };
    if (now < this.cooldownUntil) return { k: 'wait', left: this.cooldownUntil - now };
    const until = this.asked.get(by);
    if (until === undefined || now > until) {
      const t = now + SURR_ASK_TICKS;
      this.asked.set(by, t);
      return { k: 'ask', until: t };
    }
    this.asked.clear();
    const list = [...new Set(voters)];
    if (!list.includes(by)) list.push(by);
    this.cur = { by, name, voters: list, yes: [by], no: [], end: now + SURR_VOTE_TICKS };
    const out = this.judge(now);
    return out ? { k: 'ended', out } : { k: 'started' };
  }

  /** Голос. null — не считается (нет голосования, не голосующий, уже голосовал) */
  vote(id: number, yes: boolean, now: number): SurrenderStep | null {
    const v = this.cur;
    if (!v || !v.voters.includes(id) || v.yes.includes(id) || v.no.includes(id)) return null;
    (yes ? v.yes : v.no).push(id);
    return { out: this.judge(now) };
  }

  /** Человек вышел из крепости: выбывает из подсчёта вместе со своим голосом. null — голосование не затронуто */
  leave(id: number, now: number): SurrenderStep | null {
    this.asked.delete(id);
    const v = this.cur;
    if (!v) return null;
    const i = v.voters.indexOf(id);
    if (i < 0) return null;
    v.voters.splice(i, 1);
    v.yes = v.yes.filter((x) => x !== id);
    v.no = v.no.filter((x) => x !== id);
    if (v.voters.length === 0) {
      this.cur = null;
      return { out: null };
    }
    return { out: this.judge(now) };
  }

  /** Шаг времени: вышли 20 с — не прошло */
  step(now: number): SurrenderOutcome | null {
    const v = this.cur;
    if (!v || now < v.end) return null;
    return this.close(v, 'failed', 'time', now);
  }

  /** Игра кончилась (кристалл разбит): голосование снимается, перезарядки не будет */
  cancel(): void {
    this.cur = null;
    this.asked.clear();
  }

  /** Новая игра: всё с чистого листа, и перезарядка тоже */
  reset(): void {
    this.cancel();
    this.cooldownUntil = 0;
  }

  /** Состояние для клиентов */
  view(now: number): FortSurrender {
    const v = this.cur;
    const cd = this.cooldownUntil > now ? this.cooldownUntil : 0;
    if (!v) return { open: false, by: 0, name: '', voters: [], yes: [], no: [], need: 0, end: 0, cd };
    return { open: true, by: v.by, name: v.name, voters: [...v.voters], yes: [...v.yes], no: [...v.no], need: surrenderNeed(v.voters.length), end: v.end, cd };
  }

  /** Хватает «за» — прошло; «за» плюс ещё не голосовавшие меньше нужного — не прошло; иначе ждём */
  private judge(now: number): SurrenderOutcome | null {
    const v = this.cur;
    if (!v) return null;
    const need = surrenderNeed(v.voters.length);
    if (v.yes.length >= need) return this.close(v, 'passed', 'enough', now);
    const waiting = v.voters.length - v.yes.length - v.no.length;
    if (v.yes.length + waiting < need) return this.close(v, 'failed', 'hopeless', now);
    return null;
  }

  private close(v: Vote, result: SurrenderOutcome['result'], why: SurrenderOutcome['why'], now: number): SurrenderOutcome {
    this.cur = null;
    const failed = result === 'failed';
    if (failed) this.cooldownUntil = now + SURR_COOLDOWN_TICKS;
    const need = surrenderNeed(v.voters.length);
    return {
      result, why, yes: v.yes.length, no: v.no.length, voters: v.voters.length, need, by: v.by, name: v.name,
      view: {
        open: false, by: v.by, name: v.name, voters: [...v.voters], yes: [...v.yes], no: [...v.no], need, end: v.end,
        cd: failed ? this.cooldownUntil : 0, ...(failed ? { fail: true } : {}),
      },
    };
  }
}
