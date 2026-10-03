// Интерфейс пряток: сверху раунд, время и сколько прячется; слева — кто ты; справа — лента (смешная);
// в центре — прицел и подсказка «ЛКМ — стать: …»; снизу — кляксы и насмешка прячущегося или бак краски ловца.
// Поверх — ожидание, слепота ловца в сторожке, итоги раунда и пьедестал матча; Tab — таблица.
import { HIDE_ROUNDS, PAINT, TAUNT, type HideRoundResult, type HideStateMsg } from '../../shared/hide.ts';
import { HIDE_KIND, hideCap, hideHits, plural, type HideKind } from '../../shared/hideprops.ts';
import { TOUCH } from '../touch.ts';
import './hide.css';

export type HideTouchAction = 'take' | 'lock' | 'rotate' | 'taunt';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const clock = (ticks: number) => { const s = Math.max(0, Math.ceil(ticks / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class HideHud {
  readonly root = el('div', 'hud hd hidden');
  private readonly round = el('div', 'hd-round');
  private readonly time = el('div', 'hd-time');
  private readonly left = el('div', 'hd-left');
  private readonly role = el('div', 'hd-role');
  private readonly roleName = el('b');
  private readonly roleSub = el('span');
  private readonly feedBox = el('div', 'hd-feed');
  private readonly cross = el('div', 'hd-cross');
  private readonly hint = el('div', 'hd-hint');
  private readonly panel = el('div', 'hd-panel');
  private readonly noteBox = el('div', 'hd-note');
  private readonly ptsBox = el('div', 'hd-pts');
  private readonly over = el('div', 'hd-over');
  private readonly board = el('div', 'hd-board');
  private readonly help = el('div', 'hd-help');
  private readonly touch = el('div', 'hd-touch');
  private readonly hitmark = el('div', 'hd-hit');
  private blocked = false;
  private overKey = '';
  private panelKey = '';
  private noteTimer = 0;
  boardOpen = false;
  private last: HideStateMsg | null = null;

  constructor(parent: HTMLElement, onTouch: (a: HideTouchAction) => void) {
    const top = el('div', 'hd-top');
    top.append(this.round, this.time, this.left);
    this.role.append(this.roleName, this.roleSub);
    this.root.append(top, this.role, this.feedBox, this.cross, this.hint, this.panel, this.noteBox, this.ptsBox, this.help, this.over, this.board, this.hitmark);
    if (TOUCH) {
      for (const [a, icon, name] of [['take', '✨', 'стать'], ['lock', '🔒', 'замереть'], ['rotate', '↻', 'повернуть'], ['taunt', '🦆', 'дразнить']] as const) {
        const b = el('button', `hd-tb hd-tb-${a}`);
        b.type = 'button';
        b.append(el('i', '', icon), el('span', '', name));
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onTouch(a); });
        this.touch.append(b);
      }
      this.root.append(this.touch);
    }
    this.help.innerHTML = '<b>Ты — предмет</b><span><kbd>ЛКМ</kbd> стать тем, на что смотришь</span><span><kbd>F</kbd> замереть · <kbd>R</kbd> повернуть (<kbd>Shift</kbd> — чуть-чуть)</span><span><kbd>Z</kbd> подразнить ловцов: ближе — больше очков (раз в 15 с)</span><span>Раз в 30 с ты чуть вздрагиваешь — заметит тот, кто смотрит прямо на тебя</span><span>Маленьким быстрее, но хватит 1 кляксы. Прячься среди таких же!</span>';
    parent.appendChild(this.root);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) { this.feedBox.textContent = ''; this.ptsBox.textContent = ''; this.over.textContent = ''; this.overKey = ''; this.panelKey = ''; this.scoreboard(false); }
  }

  // ------------------------------------------------------------ события

  feed(text: string, cls = ''): void {
    const line = el('div', `hd-line ${cls}`, text);
    this.feedBox.prepend(line);
    while (this.feedBox.children.length > 6) this.feedBox.lastElementChild!.remove();
    setTimeout(() => line.classList.add('out'), 8000);
    setTimeout(() => line.remove(), 8600);
  }

  note(text: string): void {
    this.noteBox.textContent = text;
    this.noteBox.classList.add('on');
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => this.noteBox.classList.remove('on'), 2200);
  }

  points(n: number, why: string): void {
    const p = el('div', 'hd-pop', `+${n} ${why}`);
    this.ptsBox.append(p);
    setTimeout(() => p.remove(), 1600);
  }

  /** Попал (ловец): метка в прицеле; caught — поймал */
  hit(caught: boolean): void {
    this.hitmark.className = `hd-hit on${caught ? ' big' : ''}`;
    void this.hitmark.offsetWidth;
    setTimeout(() => (this.hitmark.className = 'hd-hit'), 260);
  }

  scoreboard(open: boolean): void {
    this.boardOpen = open;
    this.board.classList.toggle('on', open);
    if (open && this.last) this.fillBoard(this.last);
  }

  // ------------------------------------------------------------ состояние

  /** Подсказка под прицелом; blocked — серый прицел и подсказка: этим предметом сейчас не стать (не помещается, заляпан) */
  setHint(text: string | null, blocked = false): void {
    this.hint.textContent = text ?? '';
    this.hint.classList.toggle('on', !!text);
    this.blocked = !!text && blocked;
    this.hint.classList.toggle('no', this.blocked);
    this.cross.classList.toggle('no', this.blocked);
  }

  /** Клик по предмету, которым не стать: причина уже в подсказке под прицелом — она вздрагивает (без тоста внизу: он
   *  дублировал бы её и на узком окне налезал на памятку) */
  refuse(): void {
    this.hint.classList.remove('shake');
    void this.hint.offsetWidth;
    this.hint.classList.add('shake');
  }

  update(m: HideStateMsg, tick: number): void {
    this.last = m;
    const s = m.self, phase = m.phase;
    const playing = phase === 'hide' || phase === 'seek';
    const toEnd = m.phaseEnd ? m.phaseEnd - tick : 0;
    const final = phase === 'seek' && toEnd <= 1800;
    this.round.textContent = m.round ? `Раунд ${m.round} из ${HIDE_ROUNDS}` : 'Прятки';
    this.time.textContent = phase === 'gather' ? (m.phaseEnd ? clock(toEnd) : '—') : phase === 'hide' ? `прячутся ${clock(toEnd)}` : clock(toEnd);
    this.time.classList.toggle('final', final);
    this.left.textContent = playing ? `Прячутся: ${m.left} из ${m.total}` : '';
    this.root.classList.toggle('hd-final', final);

    // роль
    const hunter = s.role === 'hunter', prop = s.role === 'prop';
    this.role.className = `hd-role ${s.role}`;
    if (phase === 'result' || phase === 'final') {
      this.roleName.textContent = phase === 'final' ? 'Итоги матча' : 'Итоги раунда';
      this.roleSub.textContent = phase === 'final' ? 'Потом новый матч' : 'Дальше роли меняются';
      this.role.className = 'hd-role';
    } else if (prop) {
      this.roleName.textContent = `Ты — ${HIDE_KIND[s.kind].name}`;
      const hp = hideHits(s.kind) - s.hits;
      this.roleSub.textContent = phase === 'hide' ? 'Прячься! Ловцы ещё в сторожке' : `${hp} ${plural(hp, 'клякса', 'кляксы', 'клякс')} — и ты пойман`;
    } else if (hunter) {
      this.roleName.textContent = 'Ты — ловец';
      this.roleSub.textContent = phase === 'hide' ? 'Ждёшь в сторожке' : 'Стреляй краской в подозрительное';
    } else if (s.role === 'caught') {
      this.roleName.textContent = 'Попался!';
      this.roleSub.textContent = 'Сейчас станешь ловцом';
    } else {
      this.roleName.textContent = 'Зритель';
      this.roleSub.textContent = phase === 'gather' ? 'Ждём игроков' : 'Войдёшь в следующий раунд';
    }
    this.cross.className = `hd-cross ${hunter && phase === 'seek' ? 'gun' : prop && playing ? (this.blocked ? 'dot no' : 'dot') : 'off'}`;
    this.help.classList.toggle('on', prop && phase === 'hide');
    if (!(prop && playing)) this.setHint(null);

    // нижняя панель
    let key = '';
    if (prop && playing) {
      const hp = hideHits(s.kind);
      const cd = Math.max(0, s.tauntCd - tick), forced = Math.max(0, s.tauntAt - tick);
      key = `p|${s.kind}|${s.hits}|${s.locked}|${Math.ceil(cd / 60)}|${Math.ceil(forced / 60)}|${phase}`;
      if (key !== this.panelKey) {
        this.panel.className = 'hd-panel prop';
        this.panel.textContent = '';
        const blobs = el('div', 'hd-blobs');
        for (let i = 0; i < hp; i++) blobs.append(el('i', i < s.hits ? 'hit' : ''));
        // на телефоне клавиш нет — подписи без них (кнопки «стать / замереть / повернуть / дразнить» рядом)
        const lock = el('div', `hd-lock ${s.locked ? 'on' : ''}`, s.locked ? (TOUCH ? '🔒 Замер' : '🔒 Замер · F') : TOUCH ? '' : 'F — замереть');
        const taunt = el('div', 'hd-taunt');
        if (phase === 'hide') taunt.textContent = 'Дразнить — когда выйдут ловцы';
        else if (cd > 0) taunt.textContent = `Дразнить через ${Math.ceil(cd / 60)} с`;
        else if (TOUCH) taunt.textContent = 'Можно дразнить 🦆';
        else taunt.innerHTML = '<kbd>Z</kbd> дразнить';
        if (phase === 'seek') taunt.append(el('small', '', `вздрогнешь через ${Math.ceil(forced / 60)} с`));
        this.panel.append(el('div', 'hd-kind', hideCap(HIDE_KIND[s.kind].name)), blobs, lock, taunt);
      }
    } else if (hunter && phase === 'seek') {
      key = `h|${Math.round(s.paint)}|${s.jam}`;
      if (key !== this.panelKey) {
        this.panel.className = `hd-panel hunter ${s.jam ? 'jam' : ''}`;
        this.panel.textContent = '';
        const bar = el('div', 'hd-tank');
        const fill = el('i');
        fill.style.width = `${Math.max(0, Math.min(100, (s.paint / PAINT.max) * 100))}%`;
        bar.append(fill);
        this.panel.append(el('div', 'hd-kind', s.jam ? 'Краска кончилась!' : 'Краска'), bar, el('div', 'hd-tip', s.jam ? 'Бак наполняется…' : `мимо −${PAINT.decor} · попал +${PAINT.hit}`));
      }
    } else if (key !== this.panelKey) { this.panel.className = 'hd-panel off'; this.panel.textContent = ''; }
    this.panelKey = key;

    this.overlay(m, tick);
    if (this.boardOpen) this.fillBoard(m);
  }

  private overlay(m: HideStateMsg, tick: number): void {
    const s = m.self, toEnd = Math.max(0, m.phaseEnd - tick);
    let key = '';
    const box = () => { this.over.textContent = ''; const c = el('div', 'hd-card'); this.over.append(c); return c; };
    if (m.phase === 'gather') {
      const n = m.rows.length;
      key = `g|${n}|${m.phaseEnd ? Math.ceil(toEnd / 60) : -1}`;
      if (key !== this.overKey) {
        const c = box();
        c.append(el('h2', '', 'Прятки: Рыбный двор'), el('p', '', m.phaseEnd ? `Начинаем через ${Math.ceil(toEnd / 60)} с` : `Ждём игроков: ${n} из 8 — нужно хотя бы двое`));
        c.append(el('p', 'dim', 'Одни превращаются в бочки, вёдра и гномов, другие ищут их краской'));
      }
    } else if (m.phase === 'hide' && s.role !== 'prop') {
      key = `b|${Math.ceil(toEnd / 60)}`;
      if (key !== this.overKey) {
        const c = box();
        c.classList.add('blind');
        c.append(el('h2', '', 'Ты — ловец'), el('div', 'hd-big', clock(toEnd)), el('p', '', 'Предметы прячутся. Дверь сторожки откроется — и вперёд!'));
        const ul = el('ul');
        for (const t of ['Стреляй краской (ЛКМ) в то, что выглядит подозрительно', `Мимо по пустому предмету — минус ${PAINT.decor} краски, попал — плюс ${PAINT.hit}`, 'Присматривайся: раз в 30 с спрятавшиеся чуть вздрагивают, а дразнилки тихо слышно вблизи', 'Пойманные выходят из сторожки ловцами — вместе веселее']) ul.append(el('li', '', t));
        c.append(ul);
      }
    } else if (s.role === 'caught' && m.phase === 'seek') {
      key = `c|${Math.ceil(Math.max(0, s.back - tick) / 60)}`;
      if (key !== this.overKey) {
        const c = box();
        c.classList.add('small');
        c.append(el('h2', '', 'Попался!'), el('p', '', `Через ${Math.ceil(Math.max(0, s.back - tick) / 60)} с ты — ловец. Отомсти!`));
      }
    } else if ((m.phase === 'result' || m.phase === 'final') && m.res) {
      key = `r|${m.phase}|${m.res.round}|${Math.ceil(toEnd / 60)}`;
      if (key !== this.overKey) this.result(box(), m.res, m, toEnd);
    }
    if (!key && this.overKey) this.over.textContent = '';
    this.overKey = key;
    this.over.classList.toggle('on', !!key);
  }

  private result(c: HTMLElement, r: HideRoundResult, m: HideStateMsg, toEnd: number): void {
    c.classList.add('result');
    if (m.phase === 'final') {
      c.append(el('h2', '', 'Итоги матча'));
      const podium = el('div', 'hd-podium');
      const top = [...m.rows].sort((a, b) => b.score - a.score).slice(0, 3);
      ['🥇', '🥈', '🥉'].forEach((medal, i) => {
        const row = top[i];
        if (!row) return;
        const p = el('div', `hd-place p${i + 1}`);
        p.append(el('i', '', medal), el('b', '', row.nick), el('span', '', `${row.score} ${plural(row.score, 'очко', 'очка', 'очков')}`));
        podium.append(p);
      });
      c.append(podium);
      // пара смешных строк последнего раунда — чтобы было что обсудить
      if (r.lines.length) {
        const lines = el('div', 'hd-lines');
        for (const l of r.lines.slice(0, 2)) lines.append(el('div', '', l));
        c.append(lines);
      }
      c.append(el('p', 'dim', `Новый матч через ${Math.ceil(toEnd / 60)} с · Esc — на набережную`));
      return;
    }
    const title = r.winner === 'hunters' ? 'Ловцы нашли всех!' : r.winner === 'props' ? 'Предметы продержались!' : 'Раунд без наград';
    c.append(el('h2', `win-${r.winner}`, title));
    const lines = el('div', 'hd-lines');
    for (const l of r.lines) lines.append(el('div', '', l));
    c.append(lines);
    const table = el('div', 'hd-table');
    for (const row of r.rows) {
      const tr = el('div', `hd-tr ${row.id === m.self.id ? 'me' : ''}`);
      tr.append(el('b', '', row.nick), el('span', '', `+${row.pts}`), el('span', 'dim', `${row.score}`), el('span', 'tok', row.tokens ? `+${row.tokens} 🪙` : ''));
      table.append(tr);
    }
    c.append(table, el('p', 'dim', r.last ? `Итоги матча через ${Math.ceil(toEnd / 60)} с` : `Раунд ${r.round + 1} через ${Math.ceil(toEnd / 60)} с — роли меняются`));
  }

  private fillBoard(m: HideStateMsg): void {
    this.board.textContent = '';
    this.board.append(el('h3', '', `Раунд ${m.round || 1} из ${HIDE_ROUNDS}`));
    const icon: Record<string, string> = { h: '🎯', p: '📦', c: '💥', s: '👀' };
    for (const r of [...m.rows].sort((a, b) => b.score - a.score)) {
      const tr = el('div', `hd-tr ${r.id === m.self.id ? 'me' : ''}`);
      tr.append(el('i', '', icon[r.role] ?? ''), el('b', '', r.nick), el('span', '', `${r.pts}`), el('span', 'dim', `${r.score}`));
      this.board.append(tr);
    }
    this.board.append(el('p', 'dim', 'очки за раунд · за матч'));
  }
}

/** Подсказка над целью: «ЛКМ — стать: ведро (быстрое, 1 клякса)»; на телефоне — без клавиши (там кнопка «стать») */
export function takeHint(kind: HideKind, hits: number, hint: string): string {
  return hits >= hideHits(kind) ? `Заляпан — ${HIDE_KIND[kind].name} не выдержит` : `${TOUCH ? 'Стать' : 'ЛКМ — стать'}: ${hint}`;
}

export const TAUNT_CD = TAUNT.cd;
