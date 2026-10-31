// Голосование за трассу картинга в круге «Старт» (сервер считает: server/lobby/room.ts voteKartTrack / kartResolve).
// Встал в круг — вверху плашка события кита (как у голосования «выгнать», client/ui/kickvote.ts): две карточки
// «1 — Портовое кольцо» и «2 — Солнечный серпантин», у каждой строка про трассу и число голосов; твоя выбрана рамкой.
// Голос — клавиши 1 / 2 (эмоции в круге на это время молчат) или клик/касание по карточке; сменить можно до старта.
// Поровну — «решит жребий», за несколько секунд до старта жребий брошен и назван: «ничья — жребий: …».
// Клиент ничего не решает: пары [игрок, трасса] приходят в статусе kart, голос уходит сообщением kartTrack.
import { RACE_TRACKS, raceTrackName, tallyTrackVotes, type RaceTrackId } from '../../shared/racecourse.ts';
import type { KartStatus } from '../../shared/messages.ts';
import { isTyping } from '../input.ts';
import { TOUCH } from '../touch.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { sfx } from '../ui/kit/sfx.ts';
import { PRIO, escHtml, type TopCenter } from '../ui/kit/topcenter.ts';
import './kartvote.css';

const KEY = 'kartvote';
/** Клавиши голоса: порядок — как RACE_TRACKS (1 — первая трасса) */
const CODES: ReadonlyArray<readonly string[]> = [['Digit1', 'Numpad1'], ['Digit2', 'Numpad2']];
/** Столько секунд отсчёта до гонки (для полоски времени) */
const COUNT_S = 15;

export interface KartVoteHost {
  /** Мой номер на набережной (по нему ищем свой голос в статусе) */
  myId(): number;
  send(track: RaceTrackId): void;
}

export class KartVoteUi {
  private readonly top: TopCenter;
  private readonly host: KartVoteHost;
  private shown = '';
  private on = false;
  /** Мой голос, отправленный, но ещё не вернувшийся в статусе (чтобы карточка отозвалась сразу) */
  private pending: number | null = null;
  private pendingAt = 0;

  constructor(top: TopCenter, host: KartVoteHost) {
    this.top = top;
    this.host = host;
    // карточки живут в плашке: плашка обновляется на месте, клик ловим на слоте
    top.root.addEventListener('mousedown', (e) => {
      if ((e.target as Element).closest?.('[data-kt]')) e.preventDefault();
    });
    top.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest?.<HTMLElement>('[data-kt]');
      if (!b || !this.on) return;
      e.preventDefault();
      this.cast(Number(b.dataset.kt));
    });
  }

  /** Плашка сейчас на экране — 1 и 2 заняты голосом (эмоции молчат) */
  get active(): boolean {
    return this.on;
  }

  /**
   * Каждый кадр: inside — игрок стоит в круге и может голосовать; st — статус kart; left — секунд до старта.
   * Перерисовывает плашку только когда что-то поменялось (секунда, голоса, жребий).
   */
  update(inside: boolean, st: KartStatus, left: number): void {
    const open = inside && st.phase === 'count' && !!st.ballots;
    if (!open) {
      if (this.on) this.hide();
      return;
    }
    const mine = this.mine(st);
    // сервер подтвердил голос — или не ответил за 1,5 с (не в круге) — ждать больше не надо
    if (this.pending !== null && (mine === this.pending || performance.now() - this.pendingAt > 1500)) this.pending = null;
    const sig = `${left}|${(st.ballots ?? []).join(';')}|${st.draw ?? ''}|${this.pending ?? mine ?? ''}|${st.n}`;
    if (this.on && sig === this.shown) return;
    this.on = true;
    this.shown = sig;
    this.render(st, left, this.pending ?? mine);
  }

  /** Цифра 1/2 — голос; true — клавиша съедена голосованием */
  onKey(code: string, e: KeyboardEvent): boolean {
    if (!this.on) return false;
    const i = CODES.findIndex((c) => c.includes(code));
    if (i < 0 || i >= RACE_TRACKS.length || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target as HTMLElement | null)) return false;
    this.cast(i);
    return true;
  }

  /** Вышел из круга, ушёл в гонку или сцена закрылась: плашку убрать */
  hide(): void {
    if (this.on) this.top.clear(KEY);
    this.on = false;
    this.shown = '';
    this.pending = null;
  }

  private mine(st: KartStatus): number | null {
    const id = this.host.myId();
    return st.ballots?.find(([slot]) => slot === id)?.[1] ?? null;
  }

  private cast(i: number): void {
    const t = RACE_TRACKS[i];
    if (!t) return;
    sfx.play('click');
    this.pending = i;
    this.pendingAt = performance.now();
    this.shown = '';
    this.host.send(t.id);
  }

  private render(st: KartStatus, left: number, mine: number | null): void {
    const ballots = st.ballots ?? [];
    const { counts, leaders } = tallyTrackVotes(ballots.map(([, t]) => RACE_TRACKS[t]?.id));
    const total = counts.reduce((a, b) => a + b, 0);
    const tie = total > 0 && leaders.length > 1;
    // ожидание ответа сервера: свой голос в счёте показываем сразу
    const shownCounts = counts.slice();
    if (this.pending !== null && this.mine(st) !== this.pending) {
      const was = this.mine(st);
      if (was !== null) shownCounts[was]--;
      shownCounts[this.pending]++;
    }
    const lead = Math.max(...shownCounts);
    const key = (n: number): string => (TOUCH ? '' : `<kbd class="k-key k-key--sm">${n}</kbd>`);
    const cards = RACE_TRACKS.map((t, i) => {
      const cls = `kt-card${mine === i ? ' is-mine' : ''}${lead > 0 && shownCounts[i] === lead ? ' is-lead' : ''}`;
      return `<button class="${cls}" type="button" data-kt="${i}" aria-pressed="${mine === i}">`
        + `<span class="kt-head">${key(i + 1)}<b>${escHtml(t.name)}</b><span class="k-pill k-pill--xs ${mine === i ? 'k-pill--good' : 'k-pill--plate'}">${shownCounts[i]}</span></span>`
        + `<small>${escHtml(t.description)}</small></button>`;
    }).join('');
    let sub: string;
    if (st.draw) sub = `ничья — жребий: «${raceTrackName(st.draw)}»`;
    else if (tie) sub = 'поровну — решит жребий';
    else if (mine !== null) sub = `ты: ${mine + 1} — ${raceTrackName(RACE_TRACKS[mine].id)}`;
    else sub = TOUCH ? 'коснись трассы' : 'нажми 1 или 2 — сменить можно до старта';
    const share = Math.min(1, left / COUNT_S).toFixed(2);
    this.top.event({
      key: KEY, prio: PRIO.vote, tone: st.draw ? 'special' : undefined, lamp: true,
      html: `<span class="k-event-ic"><img src="${uiIcon('kart')}" alt=""></span><div class="k-event-title">Какая трасса?</div><div class="k-event-sub">${escHtml(sub)}</div>`
        + `<div class="k-event-timer${left <= 3 ? ' is-hurry' : ''}">${left}</div>`
        + `<div class="k-meter k-meter--thin" style="--v:${share}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></div>`
        + `<div class="k-event-actions kt-cards" role="group" aria-label="Голосование за трассу">${cards}</div>`,
    });
  }
}
