// «Ракушка», HUD «Своей игры», «Крокодила» и «Кто из нас?» (docs/quiz/tech.md §19, §22, §23): панели внизу по центру
// («Жму!», ответ, ставка, выбор темы и слова, «Хочу рисовать», свои вопросы), справа внизу (панель ведущего, полоса
// инструментов рисующего) и звуки перемен. Что показывать — решают чистые функции hud-jp-model.ts и hud-modes-model.ts;
// здесь только разметка в слотах кита и клики. Образец вида — lab/quiz/v2/js/others.js. Цвета, шрифты, тени — токены кита.
import type { QuizClientMsg } from '../../../../shared/quiz/net.ts';
import type { QzMe, QzView } from '../../../../shared/quiz/types.ts';
import { crocInk } from '../easel.ts';
import { answerModel, betModel, betQuick, dropModel, hostPanel, type BetModel } from './hud-jp-model.ts';
import { askModel, queueModel, toolOut, toolsHtml, toolsVisible, whoHint, whoPreview, wordsHtml, wordsModel, type KeyHit, type ToolSel } from './hud-modes-model.ts';
import { esc, keyCap } from './hud-model.ts';
import type { QuizSounds } from './hud-sound.ts';
import { buzzModel } from './hud-jp-model.ts';
import { mmss } from './paint.ts';

const div = (cls: string): HTMLDivElement => {
  const e = document.createElement('div');
  e.className = cls;
  return e;
};

/** Одна панель: разметка перерисовывается только при смене sig (поля ввода живут между секундными тиками) */
class Holder {
  readonly el = div('qz-h');
  private sig: string | null = null;

  constructor() {
    this.el.hidden = true;
  }

  get shown(): boolean {
    return this.sig !== null;
  }

  /** true — разметку заменили (надо заново найти узлы) */
  show(html: string, sig: string): boolean {
    const was = this.sig;
    this.sig = sig;
    this.el.hidden = false;
    if (was === sig) return false;
    this.el.innerHTML = html;
    return true;
  }

  hide(): void {
    if (this.sig === null) return;
    this.sig = null;
    this.el.hidden = true;
    this.el.replaceChildren();
  }

  q<T extends HTMLElement>(sel: string): T | null {
    return this.el.querySelector<T>(sel);
  }
}

/** Поле ввода внутри панели HUD: клавиши не уходят игре, Enter отправляет, Esc убирает фокус */
function bindInput(input: HTMLInputElement, submit: () => void): void {
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') input.blur();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
}

const METER = '<span class="k-meter k-meter--thin" style="--v:1"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>';
const setMeter = (root: HTMLElement | null, sel: string, p: number): void => {
  root?.querySelector<HTMLElement>(sel)?.style.setProperty('--v', String(Math.round(p * 1000) / 1000));
};

/** «Завершить раунд» ждёт второго нажатия столько */
const END_ARM_MS = 3000;
const ASK_NOTE = 'титул — через «=», до двух своих вопросов';

export class ModesHud {
  /** внизу по центру (слот bc) и справа внизу (слот br) */
  readonly bc = div('qz-bc2');
  readonly br = div('qz-br2');
  /** мой выбор пака (сервер его не присылает): подсвечивает карточку на плашке */
  pvMine = -1;
  /** выбранное на полосе инструментов */
  readonly sel: ToolSel = { color: 0, width: 1, erase: false, fill: false };

  private readonly send: (m: QuizClientMsg) => void;
  private readonly sound: QuizSounds;
  private readonly onPlate: () => void;
  private readonly buzz = new Holder();
  private readonly ans = new Holder();
  private readonly bet = new Holder();
  private readonly drop = new Holder();
  private readonly words = new Holder();
  private readonly queue = new Holder();
  private readonly ask = new Holder();
  private readonly prompt = new Holder();
  private readonly host = new Holder();
  private readonly tools = new Holder();
  private v: QzView | null = null;
  private me: QzMe | null = null;
  private moreUsed = 0;
  private endArmed = false;
  private endTimer = 0;
  private qKey = '';
  private buzzState = '';
  private ansOpened = false;
  private wordPicked = -1;
  private seen = { step: '', buzz: -1, verdict: '', guessed: 0, got: false, revealKey: '' };
  private betModel: BetModel | null = null;

  constructor(send: (m: QuizClientMsg) => void, sound: QuizSounds, onPlate: () => void) {
    this.send = send;
    this.sound = sound;
    this.onPlate = onPlate;
    this.bc.append(this.buzz.el, this.ans.el, this.bet.el, this.drop.el, this.words.el, this.queue.el, this.ask.el, this.prompt.el);
    this.br.append(this.host.el, this.tools.el);
  }

  /** Есть ли что-то внизу по центру / справа внизу (пустой узел в слоте добавил бы зазор) */
  get bcEmpty(): boolean {
    return ![this.buzz, this.ans, this.bet, this.drop, this.words, this.queue, this.ask, this.prompt].some((h) => h.shown);
  }

  get brEmpty(): boolean {
    return !this.host.shown && !this.tools.shown;
  }

  update(v: QzView, me: QzMe, now: number): void {
    this.v = v;
    this.me = me;
    const jp = v.jp;
    const key = `${jp?.q?.th}|${jp?.q?.cell}`;
    if (key !== this.qKey) { this.qKey = key; this.moreUsed = 0; }
    this.syncBuzz(v, me, now);
    this.syncAnswer(v, me, now);
    this.syncBet(v, me);
    this.syncDrop(v, me);
    this.syncWords(v, me, now);
    this.syncQueue(v, me);
    this.syncAsk(v, me);
    if (whoHint(v, me)) this.prompt.show('<div class="k-prompt qz-prompt"><i class="k-mouse k-mouse--l"></i><span>Клик по желейке — голос</span><span class="k-prompt-sep"></span><span class="k-prompt-note">за себя нельзя</span></div>', 'who');
    else this.prompt.hide();
    const hm = hostPanel(v, me, { moreUsed: this.moreUsed, endArmed: this.endArmed });
    if (hm) this.host.show(hm.html, hm.sig); else this.host.hide();
    if (toolsVisible(v, me)) {
      this.tools.show(toolsHtml(this.sel), `${this.sel.color}|${this.sel.width}|${this.sel.erase}|${this.sel.fill}`);
      const full = this.tools.q<HTMLElement>('.qz-full');
      if (full) full.hidden = !crocInk.full;
    } else this.tools.hide();
    this.bell(v, me);
  }

  /** Убрать всё (ушли из ограды, режим сменился) */
  clear(): void {
    for (const h of [this.buzz, this.ans, this.bet, this.drop, this.words, this.queue, this.ask, this.prompt, this.host, this.tools]) h.hide();
    clearTimeout(this.endTimer);
    this.endArmed = false;
    this.pvMine = -1;
    this.buzzState = '';
    this.ansOpened = false;
    this.wordPicked = -1;
    this.seen = { step: '', buzz: -1, verdict: '', guessed: 0, got: false, revealKey: '' };
  }

  /** Что выбрал рисующий: color 0–8 (8 — ластик), width 0–2 — как ждёт мазок qzInk; size и erase — для удобства */
  tool(): { color: number; width: number; size: number; erase: boolean; fill: boolean } {
    return toolOut(this.sel);
  }

  // ---------------------------------------------------------------- панели

  private syncBuzz(v: QzView, me: QzMe, now: number): void {
    const m = buzzModel(v, me, now);
    if (!m) { this.buzz.hide(); this.buzzState = ''; return; }
    this.buzz.show(`<div class="k-plate qz-buzz"><button type="button" class="k-btn k-btn--lg qz-buzz-btn" data-qz="buzz">Жму!${keyCap('Пробел', 'tr')}</button><span class="k-meter k-meter--thin qz-buzz-meter" style="--v:0"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span><span class="k-faint qz-buzz-note"></span></div>`, 'buzz');
    const btn = this.buzz.q('.qz-buzz-btn');
    btn?.classList.toggle('k-btn--go', m.state === 'open');
    btn?.classList.toggle('is-blocked', m.state === 'blocked' || m.state === 'out');
    setMeter(this.buzz.el, '.qz-buzz-meter', m.p);
    const note = this.buzz.q('.qz-buzz-note');
    if (note && note.textContent !== m.note) note.textContent = m.note;
    if (m.state !== this.buzzState) {
      if (m.state === 'open') this.sound.play('tick');
      else if (m.state === 'blocked') this.sound.play('miss');
      this.buzzState = m.state;
    }
  }

  private syncAnswer(v: QzView, me: QzMe, now: number): void {
    const m = answerModel(v, me, now);
    if (!m) { this.ans.hide(); this.ansOpened = false; return; }
    const fresh = this.ans.show(`<div class="k-plate qz-ans"><span class="qz-ans-note"></span><button type="button" class="k-btn k-btn--ghost k-btn--sm qz-ans-open" data-qz="ansOpen">Написать ответ</button><span class="qz-ans-row" hidden><input class="k-input" maxlength="120" placeholder="Твой ответ" autocomplete="off" spellcheck="false"><button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="ansSend">Ответить</button></span>${METER.replace('k-meter ', 'k-meter qz-ans-meter ')}</div>`, m.sig);
    const input = this.ans.q<HTMLInputElement>('input');
    if (fresh) {
      this.ansOpened = m.kind === 'final';
      if (input) bindInput(input, () => this.sendAnswer());
    }
    const row = this.ans.q('.qz-ans-row'), open = this.ans.q('.qz-ans-open');
    if (row) row.hidden = !this.ansOpened || m.sent;
    if (open) open.hidden = this.ansOpened || m.sent;
    const note = this.ans.q('.qz-ans-note');
    const txt = `${m.note} · ${mmss(Math.ceil(m.p * ((v.jp?.total ?? 0) / 1000)))}`;
    if (note && note.textContent !== txt) note.textContent = txt;
    setMeter(this.ans.el, '.qz-ans-meter', m.p);
    if (fresh && m.kind === 'final' && !m.sent) input?.focus();
  }

  private sendAnswer(): void {
    const v = this.v, me = this.me;
    const input = this.ans.q<HTMLInputElement>('input');
    const text = input?.value.trim() ?? '';
    if (!v?.jp || !me || !input || !text) { input?.focus(); return; }
    if (v.jp.step === 'fanswer') this.send({ t: 'qz', a: 'jpFans', text });
    else this.send({ t: 'qz', a: 'jpAns', text });
    input.value = '';
    this.sound.play('pop');
  }

  private syncBet(v: QzView, me: QzMe): void {
    const m = betModel(v, me);
    this.betModel = m;
    if (!m) { this.bet.hide(); return; }
    const fresh = this.bet.show(`<div class="k-plate qz-bet"><span class="qz-bet-t">Тайная ставка</span><input type="number" class="k-input qz-bet-in" min="${m.min}" max="${m.max}" step="1" value="${m.bet || Math.max(m.min, Math.floor(m.max / 2))}" inputmode="numeric"><span class="qz-bet-q"><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="betQ" data-k="min">минимум</button><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="betQ" data-k="half">половина</button><button type="button" class="k-btn k-btn--ghost k-btn--sm" data-qz="betQ" data-k="all">всё</button></span><button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="betSend">Поставить</button><span class="k-faint qz-bet-note">${m.bet ? `ставка принята: ${m.bet} — можно поменять` : `от ${m.min} до ${m.max}`}</span></div>`, m.sig);
    if (fresh) { const input = this.bet.q<HTMLInputElement>('input'); if (input) bindInput(input, () => this.sendBet()); }
  }

  private sendBet(): void {
    const m = this.betModel, input = this.bet.q<HTMLInputElement>('input');
    if (!m || !input) return;
    const n = Math.min(m.max, Math.max(m.min, Math.floor(Number(input.value) || m.min)));
    input.value = String(n);
    this.send({ t: 'qz', a: 'jpBet', n });
    this.sound.play('pop');
  }

  private syncDrop(v: QzView, me: QzMe): void {
    const m = dropModel(v, me);
    if (!m) { this.drop.hide(); return; }
    this.drop.show(`<div class="k-plate qo-words qz-drop"><span class="qo-words-t">Убери тему</span>${m.themes.map((t, i) => `<button type="button" class="qo-word" data-qz="jpDrop" data-th="${i}">${keyCap(String(i + 1), 'tl')}<b>${esc(t.length > 16 ? `${t.slice(0, 15)}…` : t)}</b></button>`).join('')}</div>`, m.sig);
  }

  private syncWords(v: QzView, me: QzMe, now: number): void {
    const m = wordsModel(v, me, now);
    if (!m) { this.words.hide(); this.wordPicked = -1; return; }
    if (this.words.show(wordsHtml(m, this.wordPicked), `${m.sig}|${this.wordPicked}`)) this.wordPicked = this.wordPicked < 0 ? -1 : this.wordPicked;
    setMeter(this.words.el, '.qz-words-meter', m.p);
  }

  private syncQueue(v: QzView, me: QzMe): void {
    const m = queueModel(v, me);
    if (m) this.queue.show(m.html, m.sig); else this.queue.hide();
  }

  private syncAsk(v: QzView, me: QzMe): void {
    const m = askModel(v, me);
    if (!m) { this.ask.hide(); return; }
    // сколько в очереди и сколько своих — на плашке сверху; здесь только подсказка про титул и живой вид
    if (this.ask.show(m.left
      ? `<div class="k-plate qo-ask"><div class="qo-ask-row"><span class="qo-ask-pre">Кто из нас</span><input type="text" class="k-input" maxlength="153" placeholder="…первым уснёт на рыбалке? = Соня набережной" autocomplete="off" spellcheck="false"><button type="button" class="k-btn k-btn--go k-btn--sm" data-qz="whoAsk">Добавить</button></div><span class="k-faint qo-ask-n">${ASK_NOTE}</span></div>`
      : `<div class="k-plate qo-ask"><span class="qo-ask-n">Два вопроса уже в очереди — ждём остальных</span></div>`, m.sig)) {
      const input = this.ask.q<HTMLInputElement>('input');
      if (input) {
        bindInput(input, () => this.sendAsk());
        input.addEventListener('input', () => {
          const hint = this.ask.q('.qo-ask-n');
          if (!hint) return;
          const p = whoPreview(input.value);
          hint.textContent = !input.value.trim() ? ASK_NOTE : p ? `получится: «${p.q}» · титул: «${p.title}»` : 'вопрос — до 120 знаков, титул — до 30';
        });
      }
    }
  }

  private sendAsk(): void {
    const input = this.ask.q<HTMLInputElement>('input');
    const text = input?.value.trim() ?? '';
    if (!input || !text) { input?.focus(); return; }
    if (!whoPreview(text)) { this.sound.play('miss'); return; }
    this.send({ t: 'qz', a: 'whoAsk', text });
    input.value = '';
    this.sound.play('pop');
  }

  // ---------------------------------------------------------------- клики

  /** Кнопки панелей; true — это наша кнопка */
  click(t: HTMLElement): boolean {
    const v = this.v;
    const d = t.dataset;
    const num = (k: string | undefined): number => Number(k ?? NaN);
    switch (d.qz) {
      case 'buzz': this.send({ t: 'qz', a: 'jpBuzz' }); this.sound.play('pop'); return true;
      case 'pv': { const i = num(d.i); this.pvMine = i; this.send({ t: 'qz', a: 'jpPv', i }); this.sound.play('vote'); this.onPlate(); return true; }
      case 'give': this.send({ t: 'qz', a: 'jpGive', slot: num(d.slot) }); this.sound.play('pop'); return true;
      case 'dispute': this.send({ t: 'qz', a: 'jpDispute' }); return true;
      case 'dv': this.send({ t: 'qz', a: 'jpDv', ok: d.ok === '1' }); this.sound.play('pop'); return true;
      case 'jpOpen': case 'jpShow': this.send({ t: 'qz', a: d.qz }); return true;
      case 'jpJudge': this.send({ t: 'qz', a: 'jpJudge', ok: d.ok === '1' }); return true;
      case 'jpMore':
        if (this.moreUsed < 2) { this.moreUsed++; this.send({ t: 'qz', a: 'jpMore' }); if (v && this.me) this.update(v, this.me, Date.now()); }
        return true;
      case 'jpEnd':
        if (!this.endArmed) {
          this.endArmed = true;
          clearTimeout(this.endTimer);
          this.endTimer = window.setTimeout(() => { this.endArmed = false; this.repaintHost(); }, END_ARM_MS);
        } else {
          clearTimeout(this.endTimer);
          this.endArmed = false;
          this.send({ t: 'qz', a: 'jpEnd' });
        }
        this.repaintHost();
        return true;
      case 'seat': this.send({ t: 'qz', a: 'jpSeat', slot: num(d.slot), ok: d.ok === '1' }); return true;
      case 'fjudge': this.send({ t: 'qz', a: 'jpFjudge', slot: num(d.slot), ok: d.ok === '1' }); this.sound.play('pop'); return true;
      case 'jpDrop': this.send({ t: 'qz', a: 'jpDrop', th: num(d.th) }); this.sound.play('pop'); return true;
      case 'jpZat': this.send({ t: 'qz', a: 'jpZat' }); return true;
      case 'ansOpen': {
        this.ansOpened = true;
        this.ans.q('.qz-ans-row')?.removeAttribute('hidden');
        this.ans.q('.qz-ans-open')?.setAttribute('hidden', '');
        this.ans.q<HTMLInputElement>('input')?.focus();
        return true;
      }
      case 'ansSend': this.sendAnswer(); return true;
      case 'betQ': { const m = this.betModel, input = this.bet.q<HTMLInputElement>('input'); if (m && input) input.value = String(betQuick(m, (d.k ?? 'half') as 'min' | 'half' | 'all')); return true; }
      case 'betSend': this.sendBet(); return true;
      case 'crWord': { const i = num(d.i); this.wordPicked = i; this.send({ t: 'qz', a: 'crWord', i }); this.sound.play('pop'); if (v && this.me) this.update(v, this.me, Date.now()); return true; }
      case 'crQueue': this.send({ t: 'qz', a: 'role', take: d.take === '1', ...(d.take === '1' ? { r: 'drawer' as const } : {}) }); this.sound.play('pop'); return true;
      case 'crColor': this.sel.color = num(d.i); this.sel.erase = false; this.pushTool(); return true;
      case 'crWidth': this.sel.width = num(d.i); this.sel.fill = false; this.pushTool(); return true;
      case 'crErase': this.sel.erase = !this.sel.erase; this.sel.fill = false; this.pushTool(); return true;
      case 'crFill': this.toggleFill(); return true;
      case 'crUndo': crocInk.undo(); this.sound.play('undo'); return true;
      case 'crClear': crocInk.clear(); this.sound.play('undo'); return true;
      case 'whoAsk': this.sendAsk(); return true;
      case 'whoSkip': if (this.me?.who) this.send({ t: 'qz', a: 'whoSkip', on: !this.me.who.skip }); this.sound.play('pop'); return true;
      default: return false;
    }
  }

  /** Выбранное на полосе — и в crocInk.tool: мазок мышью по мольберту берёт его оттуда */
  private pushTool(): void {
    const o = toolOut(this.sel);
    crocInk.tool.color = o.color;
    crocInk.tool.width = o.width;
    crocInk.tool.fill = o.fill;
    this.sound.play('pop');
    const v = this.v;
    if (v && this.me) this.update(v, this.me, Date.now());
  }

  private repaintHost(): void {
    const v = this.v;
    if (!v || !this.me) return;
    const hm = hostPanel(v, this.me, { moreUsed: this.moreUsed, endArmed: this.endArmed });
    if (hm) this.host.show(hm.html, hm.sig); else this.host.hide();
  }

  /** C6: ведёрко вкл/выкл (кнопка и G); с ластика — сразу ведёрко */
  private toggleFill(): void {
    this.sel.fill = this.sel.erase || !this.sel.fill;
    this.sel.erase = false;
    this.pushTool();
  }

  /** Горячая клавиша «Отмена мазка» (Z) */
  undoStroke(): void {
    crocInk.undo();
    this.sound.play('undo');
  }

  /** Клавиша режима (keyHit в hud-modes-model.ts): выбор пака, письмо серверу или отмена мазка */
  key(hit: KeyHit): void {
    if (hit.undo) { this.undoStroke(); return; }
    if (hit.fill) { this.toggleFill(); return; }
    if (hit.mine !== undefined) {
      this.pvMine = hit.mine;
      this.sound.play('vote');
      this.onPlate();
    } else this.sound.play('pop');
    const m = hit.msg;
    if (!m) return;
    if (m.a === 'crWord') this.wordPicked = m.i;
    this.send(m);
  }

  // ---------------------------------------------------------------- звуки перемен

  /** Тихие звуки перемен, которые видят все внутри: нажал первым, верно / неверно, угадали, раскрытие */
  private bell(v: QzView, me: QzMe): void {
    const s = this.seen;
    const jp = v.phase === 'game' ? v.jp : null;
    if (jp) {
      if (jp.step === 'answer' && (s.step !== 'answer' || s.buzz !== (jp.buzz?.slot ?? -1)) && jp.buzz) this.sound.play('warm');
      if (jp.verdict !== s.verdict) { if (jp.verdict === 'yes') this.sound.play('fanfare'); else if (jp.verdict === 'no') this.sound.play('miss'); }
      s.step = jp.step;
      s.buzz = jp.buzz?.slot ?? -1;
      s.verdict = jp.verdict;
    } else { s.step = ''; s.buzz = -1; s.verdict = ''; }
    const c = v.phase === 'game' ? v.croc : null;
    if (c) {
      if (c.guessed.length > s.guessed && c.step === 'draw') this.sound.play(me.croc?.got && s.got === false ? 'fanfare' : 'warm');
      s.guessed = c.step === 'draw' ? c.guessed.length : 0;
      s.got = !!me.croc?.got;
    } else { s.guessed = 0; s.got = false; }
    const w = v.phase === 'game' ? v.who : null;
    const rk = w?.step === 'reveal' ? `${w.num}` : '';
    if (rk && rk !== s.revealKey) this.sound.play(w?.leaders.length ? 'fanfare' : 'pop');
    s.revealKey = rk;
  }
}
