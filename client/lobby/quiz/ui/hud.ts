// «Ракушка»: HUD на ките UI 2.0 (docs/quiz/tech.md §14, образец — lab/quiz/v2/js/hud.js, vote.js, riddle.js).
// Строится сам по снимку внутри ограды: update(v, me, b, now) — на каждый снимок и раз в секунду; v === null — игрока нет
// внутри, всё убрано. Части: плашка сверху (TopCenter.event: голосование «Во что играем?» с четырьмя кнопками, «Играем:
// …», вызов роли, «Ты загадал: …» с кольцом времени, «Проверяем…», итог, «Сменить игру?»), полоса внизу («Сыграем?»,
// «Загадываю!» / «Пропустить», ряд клавиш и «Подсказка» загадывающего), док «В игру» над чатом (слот bl) с отметками
// 1/2/3, «↩ Вернуть» и «Z отменить», карточка «Тепло» (слот tl) с «✕» у загадывающего, кнопка «Встать», окна «Что
// загадал?» и «Подсказка». Клавиши (1–4, F, 1/2/3, Z, H) ловит контроллер (client/lobby/quiz/index.ts onKey), не HUD:
// их эффекты приходят сюда через send и fx. Тексты — «на ты»; цвета, шрифты и тени — только токены кита.
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import type { QzBoard, QzMark, QzMe, QzRole, QzView } from '../../../../shared/quiz/types.ts';
import { keyMark } from '../state.ts';
import { placeAt } from '../../../../shared/quiz/venue.ts';
import type { QuizFx } from '../fx.ts';
import { BottomBars } from './hud-bars.ts';
import { DockView, Flyer, OwnView, WarmView } from './hud-dock.ts';
import { resolveKit, type QuizHudKit, type ResolvedKit } from './hud-kit.ts';
import { ModesHud } from './hud-modes.ts';
import { digitsBusy, keyHit, lineMsg, modeLines, modePlate, plainDock, todoRow } from './hud-modes-model.ts';
import { OWN_SHOW_MS, PLATE_KEY, againBar, dockModel, hostBar, isRiddling, keyCap, ownGuess, plateSpec, playBar, queueBar, rolesBar, warmBar, warmModel, warmVisible, type DockModel } from './hud-model.ts';
import { QuizSounds } from './hud-sound.ts';
import { QuizWindows } from './hud-windows.ts';
import { QuizWindow } from './hud-window.ts';
import './quiz-ui.css';
import './quiz-ui2.css';

export type { QuizHudKit };
/** Что HUD шлёт: сообщения «Ракушки» и общий «встать» из кресла (общий unuse хаба) */
export type QuizHudSend = (m: QuizClientMsg | { t: 'unuse' }) => void;

const still = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** «Точно открыть?» ждёт второго нажатия столько */
const ARM_MS = 3000;

/** Поставить элемент в слот (если ещё не там); first — над остальным, иначе под ним */
function attach(e: HTMLElement, parent: HTMLElement, first = false): void {
  if (e.parentElement === parent) return;
  if (first) parent.prepend(e);
  else parent.append(e);
}

export class QuizHud {
  /** Цифры заняты (голос 1–4, отметки 1/2/3): эмоции 1–7 в это время выключены (их выключает контроллер) */
  wantsDigits = false;

  private readonly send: QuizHudSend;
  private readonly kitArg: QuizHudKit | undefined;
  private readonly sound: QuizSounds;
  private readonly windows: QuizWindows;
  private readonly modes: ModesHud;
  private readonly win: QuizWindow;
  private readonly bars = new BottomBars();
  private readonly dock = new DockView();
  private readonly warm = new WarmView();
  private readonly ownView = new OwnView();
  /** моя последняя догадка: когда она или её отметка менялись в последний раз (по своим часам) */
  private own: { id: number; mark: QzMark; since: number } | null = null;
  private ownShown = false;
  private ownTimer = 0;
  private stand: HTMLButtonElement | null = null;
  private flyer: Flyer | null = null;
  private kit: ResolvedKit | null = null;
  private v: QzView | null = null;
  private me: QzMe | null = null;
  private now = 0;
  private plateOn = false;
  private armed = false;
  private armTimer = 0;
  /** паки, которым я уже поставил «Пак понравился» (сервер тоже считает один раз на пак) */
  private readonly liked = new Set<string>();
  private used = false;
  private usedKey = '';
  private disposed = false;
  /** строки, что летят из дока в «Тепло»: в карточке спрятаны до приземления */
  private readonly flying = new Set<number>();
  private readonly pending = new Map<number, { node: HTMLElement; from: DOMRect; at: number }>();
  private readonly unbind: Array<() => void> = [];

  /**
   * send — сеть (qz-сообщения и { t: 'unuse' }); kit — слоты и верх-центр кита ({ slots, top, audio }): не передали —
   * находим в странице по классам кита, звуки идут через общий sfx.
   */
  constructor(send: QuizHudSend, kit?: QuizHudKit) {
    this.send = send;
    this.kitArg = kit;
    this.sound = new QuizSounds(kit?.audio);
    this.windows = new QuizWindows((m) => this.send(m));
    this.modes = new ModesHud((m) => this.send(m), this.sound, () => this.syncPlate());
    this.win = new QuizWindow({ send: (m) => this.send(m), level: () => this.kitArg?.level?.() ?? null });
  }

  /** Снимок: внутри ограды — v и me (b — то же табло, отдельно не нужно); v === null — убрать всё */
  update(v: QzView | null, me: QzMe | null, _b: QzBoard | null, nowMs: number): void {
    if (this.disposed) return;
    if (!v || !me) { this.leave(); return; }
    const kit = this.kit ?? this.connect();
    if (!kit) return;
    this.v = v;
    this.me = me;
    this.now = nowMs;
    const riddling = isRiddling(v, me);
    this.wantsDigits = v.phase === 'vote' || (riddling && v.riddle?.step === 'round') || digitsBusy(v, me);
    this.syncPlate();
    this.syncBottom(kit, riddling);
    this.syncModes(kit);
    this.syncDock(kit, riddling);
    this.syncOwn(kit);
    this.syncWarm(kit, riddling);
    this.syncStand(kit);
    this.windows.sync(v, me);
    this.win.sync(v, me);
    this.land();
  }

  /** Разовые эффекты контроллера: звуки, полёт строки в «Тепло», конфетти, «Подсказка» по H */
  fx(e: QuizFx): void {
    if (this.disposed) return;
    switch (e.k) {
      case 'sound': this.sound.play(e.name); break;
      case 'warmFly': this.startFly(e.lineId, e.from ?? null); break;
      case 'confetti': this.flyer?.confetti(this.kit?.top.root.querySelector('.k-event')?.getBoundingClientRect() ?? null); break;
      case 'inside': if (!e.on) this.sound.stop(); break;
      case 'hint': if (this.v && this.me) this.windows.openHint(this.v, this.me); break;
      default: break;
    }
  }

  /**
   * Клавиши части 2 (Пробел — «Жму!», 1 / 2 у ведущего, R, 1–3 — пак и слово, 1–5 — тема в финале, Z — отмена мазка, F —
   * «Хочу рисовать»): true — клавишу съел HUD, игре её отдавать не надо (и `preventDefault`).
   */
  onKey(code: string): boolean {
    if (this.disposed || !this.v || !this.me) return false;
    const v = this.v, me = this.me;
    // «Ракушка» 1.1: R — «Ещё раз!» на итогах; F — «Веду я» (выбор пака), разминка (игры нет), «Хочу загадать» / слово заранее («Загадка»)
    if (code === 'KeyR' && againBar(v, me)) { this.toggleAgain(); return true; }
    if (code === 'KeyF') {
      if (hostBar(v, me)) { this.send({ t: 'qz', a: 'role', take: true, r: 'host' }); this.sound.play('pop'); return true; }
      if (warmBar(v, me)) { this.send({ t: 'qz', a: 'warm', on: true }); this.sound.play('pop'); return true; }
      if (queueBar(v, me)) { this.queueKey(); return true; }
    }
    const hit = keyHit(this.v, this.me, code);
    if (!hit) return false;
    this.modes.key(hit);
    return true;
  }

  /** Текст из чата «В игру» (Enter): ответ отвечающему, ответ финала, иначе реплика — готовое письмо серверу */
  lineMsg(text: string): QuizClientMsg {
    return lineMsg(this.v, this.me, text);
  }

  /** Что выбрано на полосе инструментов рисующего (мазок мышью по мольберту читает это): цвет 0–7, ластик, толщина 0–2 */
  crocTool(): { color: number; size: number; erase: boolean; width: number } {
    return this.modes.tool();
  }

  /** Окно «Ракушка» (E у трибуны): вкладка 'play' | 'packs' | 'upload' | 'records'; у ведущего в шаге setup — 'setup' */
  openWindow(tab?: string): void {
    this.win.open(tab);
  }

  /** Письма окна «Ракушка»: паки, состав пака, билет загрузки, рекорды и отказы (qzErr) — интегратор пересылает сюда */
  onMsg(m: { t: string }): boolean {
    return this.disposed ? false : this.win.onMsg(m);
  }

  dispose(): void {
    if (this.disposed) return;
    this.leave();
    this.disposed = true;
    for (const off of this.unbind) off();
    this.unbind.length = 0;
    this.flyer?.dispose();
    this.sound.dispose();
  }

  // ---------------------------------------------------------------- подключение к странице

  private connect(): ResolvedKit | null {
    const k = resolveKit(this.kitArg);
    if (!k) return null;
    this.kit = k;
    this.flyer = new Flyer(k.shell);
    // один обработчик на часть: кнопки находим по data-qz; мышь не забирает фокус у клавиш игры
    const down = (e: Event): void => { if ((e.target as Element | null)?.closest('button[data-qz]')) e.preventDefault(); };
    for (const root of [k.top.root, this.bars.host, this.dock.root, this.warm.root, this.modes.bc, this.modes.br]) {
      root.addEventListener('click', this.onClick);
      root.addEventListener('mousedown', down);
      this.unbind.push(() => { root.removeEventListener('click', this.onClick); root.removeEventListener('mousedown', down); });
    }
    return k;
  }

  private readonly onClick = (e: Event): void => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-qz]');
    if (t && this.v && this.me) this.act(t);
  };

  private act(t: HTMLElement): void {
    const v = this.v!, me = this.me!;
    const id = Number(t.closest<HTMLElement>('[data-id]')?.dataset.id);
    switch (t.dataset.qz) {
      case 'vote': this.send({ t: 'qz', a: 'vote', m: Number(t.dataset.i) }); break;
      case 'swap': this.send({ t: 'qz', a: 'swap', on: !me.swap }); break;
      case 'play': this.send({ t: 'qz', a: 'play' }); break;
      case 'role': {
        const first = v.call?.roles?.[0] ?? v.call?.role;
        const r = t.dataset.r as QzRole | undefined;
        // «Передумал» (data-take="0") шлёт роль явно: сервер снимает именно её
        const take = t.dataset.take !== '0';
        this.send({ t: 'qz', a: 'role', take, ...(r && (r !== first || !take) ? { r } : {}) });
        break;
      }
      case 'skip': this.send({ t: 'qz', a: 'role', take: false }); break;
      case 'mark': if (Number.isFinite(id)) this.send({ t: 'qz', a: 'mark', id, m: t.dataset.m as 'warm' | 'hot' | 'miss' | 'win' }); break;
      case 'again': this.toggleAgain(); break;
      case 'hostTake': this.send({ t: 'qz', a: 'role', take: true, r: 'host' }); this.sound.play('pop'); break;
      case 'warm': this.send({ t: 'qz', a: 'warm', on: t.dataset.on === '1' }); this.sound.play('pop'); break;
      case 'queue':
        if (t.dataset.take === '1') { this.send({ t: 'qz', a: 'role', take: true, r: 'riddler' }); this.windows.wantPrep(); } else this.send({ t: 'qz', a: 'role', take: false, r: 'riddler' });
        this.sound.play(t.dataset.take === '1' ? 'pop' : 'undo');
        break;
      case 'prep': this.windows.openPrep(v, me); break;
      case 'unmark': if (Number.isFinite(id)) this.send({ t: 'qz', a: 'unmark', id }); break;
      case 'undo': this.send({ t: 'qz', a: 'undo' }); break;
      case 'like': {
        const pid = t.dataset.pack;
        if (pid && !this.liked.has(pid)) {
          this.liked.add(pid);
          this.send({ t: 'qz', a: 'packLike', id: pid });
          this.sound.play('pop');
          this.syncPlate();
        }
        break;
      }
      case 'hint': this.windows.openHint(v, me); break;
      // «Браво!» мышью или пальцем — то же письмо, что B (частоту держит контроллер, index.ts bravo)
      case 'bravo': this.send({ t: 'qz', a: 'bravo' }); break;
      case 'askopen': this.windows.openAsk(v, me); break;
      case 'unuse': this.send({ t: 'unuse' }); break;
      case 'giveup':
        // закончить загадку для всех — со вторым нажатием в течение трёх секунд
        if (!this.armed) {
          this.armed = true;
          clearTimeout(this.armTimer);
          this.armTimer = window.setTimeout(() => { this.armed = false; this.syncPlate(); }, ARM_MS);
          this.syncPlate();
        } else {
          clearTimeout(this.armTimer);
          this.armed = false;
          this.send({ t: 'qz', a: 'giveup' });
        }
        break;
      default:
        // кнопки «Своей игры», «Крокодила» и «Кто из нас?» (hud-modes.ts); «Пак и темы» открывает окно
        if (t.dataset.qz === 'winopen') this.openWindow('setup');
        else this.modes.click(t);
        break;
    }
  }

  /** A1: «Ещё раз!» — нажал / передумал (R или кнопка на полосе внизу) */
  private toggleAgain(): void {
    const me = this.me;
    if (!me) return;
    this.send({ t: 'qz', a: 'again', on: !me.again });
    this.sound.play(me.again ? 'undo' : 'vote');
  }

  /** A3: F в «Загадке» — встать в очередь «Хочу загадать» (и сразу заготовить слово), в очереди — открыть слово заранее */
  private queueKey(): void {
    const v = this.v, me = this.me;
    if (!v || !me) return;
    if ((me.queuePos ?? 0) > 0) { this.windows.openPrep(v, me); return; }
    this.send({ t: 'qz', a: 'role', take: true, r: 'riddler' });
    this.windows.wantPrep();
    this.sound.play('pop');
  }

  // ---------------------------------------------------------------- части

  private syncPlate(): void {
    const kit = this.kit;
    if (!kit || !this.v || !this.me) return;
    const spec = modePlate(this.v, this.me, this.now, { pvMine: this.modes.pvMine }) ?? plateSpec(this.v, this.me, this.now, this.armed, this.liked);
    if (spec) kit.top.event({ key: spec.key, prio: spec.prio, html: spec.html, tone: spec.tone, lamp: spec.lamp });
    else if (this.plateOn) kit.top.clear(PLATE_KEY);
    this.plateOn = !!spec;
  }

  private syncBottom(kit: ResolvedKit, riddling: boolean): void {
    const v = this.v!, me = this.me!;
    const qBar = queueBar(v, me);
    this.bars.setBar(againBar(v, me) ?? hostBar(v, me) ?? playBar(v, me) ?? warmBar(v, me) ?? rolesBar(v, me, this.now) ?? qBar);
    // B2: строка «что мне делать» с клавишей — для ролей без своей полосы (угадывающий, зритель «Своей игры»)
    this.bars.setTodo(todoRow(v, me, !!qBar));
    const R = v.riddle;
    if (riddling && R) {
      // «1 тепло · 2 мимо · 3 угадал» до первой отметки раунда, потом «Z отменить»
      const key = `${R.num}|${R.riddler?.slot ?? 0}`;
      if (key !== this.usedKey) { this.usedKey = key; this.used = false; }
      if (R.lines.some((l) => l.mark !== '')) this.used = true;
      this.bars.setRiddler({
        used: this.used, checking: !!R.checking, hintsLeft: me.hintsLeft ?? 0,
        canUndo: !!R.checking || R.lines.some((l) => l.mark === 'warm' || l.mark === 'hot' || l.mark === 'miss'),
        hot: keyMark(R.lines, 0, this.now)?.m === 'hot',
      });
    } else this.bars.setRiddler(null);
    if (this.bars.empty) this.bars.host.remove();
    else attach(this.bars.host, kit.slots.bc, true);
  }

  /** Панели «Своей игры», «Крокодила» и «Кто из нас?»: внизу по центру и справа внизу (слоты bc и br) */
  private syncModes(kit: ResolvedKit): void {
    const v = this.v!, me = this.me!;
    if (v.phase === 'game' && v.mode !== 'riddle') this.modes.update(v, me, this.now);
    else this.modes.clear();
    if (this.modes.bcEmpty) this.modes.bc.remove(); else attach(this.modes.bc, kit.slots.bc);
    if (this.modes.brEmpty) this.modes.br.remove(); else attach(this.modes.br, kit.slots.br, true);
  }

  private syncDock(kit: ResolvedKit, riddling: boolean): void {
    const v = this.v!, me = this.me!;
    const R = v.riddle;
    const riddle = v.phase === 'game' && v.mode === 'riddle' && !!R;
    // чужие режимы: свои строки «В игру» без кнопок; «Загадка» — со своим доком отметок
    if (!riddle && !(v.phase === 'game' && v.mode && v.mode !== 'riddle')) {
      this.dock.clear();
      this.dock.root.remove();
      return;
    }
    let m: DockModel;
    let marked = new Set<number>();
    if (riddle) {
      marked = new Set(R!.lines.filter((l) => l.mark === 'warm' || l.mark === 'hot').map((l) => l.id));
      m = dockModel(R!.lines, me, this.now, riddling, !!R!.checking);
    } else m = plainDock(modeLines(v), me, this.now);
    this.dock.update(m, { riddler: riddle && riddling, checking: riddle && !!R!.checking, marked });
    // правка отметки: строка вернулась в док — тихий звук «отмена» тому, кто правил
    if (riddling && this.dock.returned > 0) this.sound.play('undo');
    if (m.rows.length || m.waiting) attach(this.dock.root, kit.slots.bl, true);
    else this.dock.root.remove();
  }

  /**
   * Статус моей последней догадки над полем чата (сидящий в кресле не видит своё облачко): текст и отметка тем же тоном,
   * что у облачка; пропадает через OWN_SHOW_MS после последней перемены. Строку и отметку берём из снимка.
   */
  private syncOwn(kit: ResolvedKit): void {
    clearTimeout(this.ownTimer);
    const g = this.v && this.me ? ownGuess(this.v, this.me) : null;
    if (!g) {
      this.own = null;
      this.hideOwn();
      return;
    }
    const t = performance.now();
    if (!this.own || this.own.id !== g.id || this.own.mark !== g.mark) {
      // первый раз (вошли, пока шла игра): считаем по часам сервера, чтобы старая догадка не всплыла заново
      this.own = { id: g.id, mark: g.mark, since: this.own ? t : t - Math.max(0, this.now - g.at) };
    }
    const left = OWN_SHOW_MS - (t - this.own.since);
    if (left <= 0) {
      this.hideOwn();
      return;
    }
    this.ownView.set(g);
    if (!this.ownShown || !this.ownView.root.isConnected) {
      const slot = kit.slots.bl;
      const chat = slot.querySelector(':scope > .k-chat');
      if (chat) slot.insertBefore(this.ownView.root, chat);
      else slot.append(this.ownView.root);
      this.ownShown = true;
    }
    this.ownTimer = window.setTimeout(() => this.syncOwn(kit), left + 30);
  }

  private hideOwn(): void {
    if (!this.ownShown) return;
    this.ownShown = false;
    this.ownView.hide();
  }

  private syncWarm(kit: ResolvedKit, riddling: boolean): void {
    const v = this.v!;
    if (!warmVisible(v)) {
      this.warm.clear();
      this.warm.root.remove();
      return;
    }
    this.warm.update(warmModel(v), riddling, this.flying);
    attach(this.warm.root, kit.slots.tl);
  }

  /** «Встать» мышью — в кресле (на сцене встать нельзя): общий unuse хаба */
  private syncStand(kit: ResolvedKit): void {
    const me = this.me!;
    const chair = me.place >= 0 && placeAt(me.place)?.kind === 'chair';
    if (!chair) { this.stand?.remove(); return; }
    if (!this.stand) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'k-btn k-btn--ghost k-btn--sm qz-stand';
      b.dataset.qz = 'unuse';
      b.innerHTML = `Встать${keyCap('E', 'tr')}`;
      b.addEventListener('click', this.onClick);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      this.stand = b;
    }
    attach(this.stand, kit.slots.br);
  }

  // ---------------------------------------------------------------- полёт строки в «Тепло»

  private startFly(id: number, from: DOMRect | null): void {
    if (!this.flyer || still()) return;
    const src = this.dock.rowEl(id);
    const rect = src?.getBoundingClientRect() ?? from;
    if (!src || !rect || rect.width < 1) return;
    const node = src.cloneNode(true) as HTMLElement;
    node.classList.remove('is-new', 'is-back', 'is-gone', 'is-near');
    node.querySelectorAll('.qz-markbtns, .qz-undo, .qz-near, .k-key').forEach((x) => x.remove());
    this.flying.add(id);
    this.pending.set(id, { node, from: rect, at: performance.now() });
  }

  /** После очередного снимка карточка «Тепло» уже приняла строку (спрятанной): запускаем копию к её месту */
  private land(): void {
    for (const [id, f] of this.pending) {
      const row = this.warm.rowEl(id);
      if (!row) {
        if (performance.now() - f.at > 900) this.endFly(id, false);
        continue;
      }
      this.pending.delete(id);
      const to = row.getBoundingClientRect();
      if (!this.flyer || to.width < 1) { this.endFly(id, true); continue; }
      void this.flyer.fly(f.node, f.from, to).then(() => this.endFly(id, true));
    }
  }

  private endFly(id: number, reveal: boolean): void {
    this.pending.delete(id);
    this.flying.delete(id);
    if (reveal) this.warm.reveal(id);
  }

  // ---------------------------------------------------------------- уход

  /** Игрока нет внутри ограды: всё убрать (экземпляр живёт дальше — вернётся, когда придёт снимок) */
  private leave(): void {
    if (!this.v && !this.plateOn && this.bars.empty && !this.stand?.isConnected) return;
    this.v = this.me = null;
    this.wantsDigits = false;
    this.sound.stop();
    this.windows.dispose();
    clearTimeout(this.armTimer);
    this.armed = false;
    if (this.kit && this.plateOn) this.kit.top.clear(PLATE_KEY);
    this.plateOn = false;
    this.bars.clear();
    this.bars.host.remove();
    this.modes.clear();
    this.modes.bc.remove();
    this.modes.br.remove();
    this.win.sync(null, null);
    this.dock.clear();
    this.dock.root.remove();
    this.warm.clear();
    this.warm.root.remove();
    clearTimeout(this.ownTimer);
    this.own = null;
    this.ownShown = false;
    this.ownView.reset();
    this.stand?.remove();
    this.pending.clear();
    this.flying.clear();
    this.used = false;
    this.usedKey = '';
  }
}
