// Интерфейс пряток на ките 2.0 (как сцена «Прятки» на странице lab/ui «Режимы»): сверху по центру — плашка раунда
// (раунд, сколько прячется, время, полоса); слева сверху — плашка роли и лента (смешная); снизу — подсказка «ЛКМ Стать:
// ведро» и панель бойца отдельными блоками: у предмета — кляксы до поимки, три умения (F R Z) и «вздрогнешь через»;
// у ловца — бак краски. Прицел — в слое без масштаба (.k-world). Ожидание, «Ты — ловец», «Попался!» — баннером и отсчётом
// кита; итоги раунда и матча — общим окном итогов (ModeResults); Tab — окно-таблица.
import { HIDE_COUNT_TICKS, HIDE_PREP_TICKS, HIDE_RESULT_TICKS, HIDE_PODIUM_TICKS, HIDE_ROUNDS, HIDE_SEEK_TICKS, PAINT, TAUNT, type HideRoundResult, type HideStateMsg } from '../../shared/hide.ts';
import { HIDE_KIND, hideHits, plural, type HideKind } from '../../shared/hideprops.ts';
import type { Ui } from '../scene.ts';
import { TOUCH } from '../touch.ts';
import { coinHtml, h, iconImg } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { capHtml, esc, ModeCount, ModeFeed, ModeResults, placeHtml, type ResultsRow } from '../ui/kit/modes.ts';
import { PRIO } from '../ui/kit/topcenter.ts';
import './hide.css';

export type HideTouchAction = 'take' | 'lock' | 'rotate' | 'taunt';

const clock = (ticks: number) => { const s = Math.max(0, Math.ceil(ticks / 60)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const sec = (ticks: number) => Math.max(0, Math.ceil(ticks / 60));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const meter = (v: number, cls: string) => `<span class="k-meter ${cls}" style="--v:${clamp01(v).toFixed(3)};--g:${clamp01(v).toFixed(3)}"><i class="k-meter-ghost"></i><i class="k-meter-fill"></i></span>`;
const pts = (n: number) => `${n} ${plural(n, 'очко', 'очка', 'очков')}`;
const MODE = 'Прятки · Рыбный двор';

function setMeter(m: HTMLElement, v: number): void {
  const k = clamp01(v).toFixed(3);
  if (m.style.getPropertyValue('--v') === k) return;
  m.style.setProperty('--v', k);
  m.style.setProperty('--g', k);
}
function put(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

/** Ячейка умения: картинка, подпись под ней, клавиша в углу */
interface Act { root: HTMLElement; cap: HTMLElement }

export class HideHud {
  /** Слой без масштаба HUD: прицел, «+N», красные края финала, кнопки телефона (класс prop-touch — показать кнопки) */
  readonly root: HTMLElement;
  private readonly ui: Ui;
  // верх-лево: роль и лента
  private readonly role: HTMLElement;
  private readonly roleIc: HTMLElement;
  private readonly roleName: HTMLElement;
  private readonly roleSub: HTMLElement;
  private readonly feedBox: ModeFeed;
  // низ: подсказка и панель
  private readonly prompt: HTMLElement;
  private readonly vitals: HTMLElement;
  private readonly hpNum: HTMLElement;
  private readonly hpBar: HTMLElement;
  private readonly hpCap: HTMLElement;
  private readonly arms: HTMLElement;
  private readonly lock: Act;
  private readonly turn: Act;
  private readonly taunt: Act;
  private readonly paint: Act;
  private readonly ammo: HTMLElement;
  private readonly ammoCap: HTMLElement;
  private readonly ammoRow: HTMLElement;
  private readonly ammoNum: HTMLElement;
  private readonly ammoBar: HTMLElement;
  // центр и мир
  private readonly count: ModeCount;
  private readonly cross: HTMLElement;
  private readonly glow: HTMLElement;
  private readonly touch: HTMLElement;
  // окна
  private readonly results: ModeResults;
  private readonly board: HTMLElement;
  private readonly boardBody: HTMLElement;
  private readonly boardTitle: HTMLElement;
  private readonly boardTime: HTMLElement;
  private blocked = false;
  private hintText = '';
  private panelKey = '';
  private roleKey = '';
  private heroKey = '';
  private resKey = '';
  private hitTimer = 0;
  private floats = 0;
  /** Жетоны за матч по игрокам (сумма итогов раундов, что видели): номер матча и раунды, что уже сложены */
  private tok = new Map<number, number>();
  private tokMatch = -1;
  private tokRounds = new Set<number>();
  boardOpen = false;
  private last: HideStateMsg | null = null;
  private lastTick = 0;
  /** Мышь: кнопка «На набережную» в итогах матча */
  onLeave: () => void = () => {};

  constructor(parent: HTMLElement, ui: Ui, onTouch: (a: HideTouchAction) => void) {
    this.ui = ui;
    const s = ui.slots;
    // --- верх-лево
    this.role = h('div', 'k-plate mo-role hd-role hd-only');
    this.role.innerHTML = '<span class="mo-role-ic"></span><div><b></b><small></small></div>';
    this.roleIc = this.role.querySelector('.mo-role-ic')!;
    this.roleName = this.role.querySelector('b')!;
    this.roleSub = this.role.querySelector('small')!;
    s.tl.append(this.role);
    this.feedBox = new ModeFeed(s.tl, 4, 8000);
    this.feedBox.root.classList.add('hd-feed', 'hd-only');
    // --- низ: подсказка «ЛКМ Стать: …» над панелью
    this.prompt = h('div', 'k-prompt mo-noshrink hd-prompt hd-only');
    this.prompt.hidden = true;
    this.vitals = h('div', 'k-vitals hd-vitals hd-only');
    this.vitals.hidden = true;
    const hp = h('div', 'k-vitals-hp');
    hp.innerHTML = `<div class="k-vitals-row">${iconImg('paint', 'k-vitals-ic')}<b class="k-vitals-num"></b></div>${meter(1, 'k-meter--bad')}<span class="k-vitals-cap"></span>`;
    this.hpNum = hp.querySelector('.k-vitals-num')!;
    this.hpBar = hp.querySelector('.k-meter')!;
    this.hpCap = hp.querySelector('.k-vitals-cap')!;
    this.arms = h('div', 'k-vitals-arms mo-acts3');
    const act = (icon: string, label: string, key: string, cls = 'k-arm--label'): Act => {
      const root = h('div', `k-arm ${cls}`, `${iconImg(icon, '')}<span>${label}</span>${TOUCH ? '' : capHtml(key, 'k-key--sm k-key--tr')}`);
      this.arms.append(root);
      return { root, cap: root.querySelector('span')! };
    };
    this.lock = act('lock', 'Замри', 'F');
    this.turn = act('compass', 'Поверни', 'R');
    this.taunt = act('emote', 'Дразни', 'Z');
    this.paint = act('paintballs', 'Краска', 'ЛКМ', 'is-on');
    this.ammo = h('div', 'k-vitals-ammo');
    this.ammo.innerHTML = `<span class="k-vitals-cap"></span><div class="k-vitals-row"><b class="k-vitals-num"></b></div>${meter(1, 'k-meter--thin')}`;
    this.ammoCap = this.ammo.querySelector('.k-vitals-cap')!;
    this.ammoRow = this.ammo.querySelector('.k-vitals-row')!;
    this.ammoNum = this.ammo.querySelector('.k-vitals-num')!;
    this.ammoBar = this.ammo.querySelector('.k-meter')!;
    this.vitals.append(hp, this.arms, this.ammo);
    s.bc.append(this.prompt, this.vitals);
    // --- центр: крупный отсчёт (последние секунды в сторожке и перед стартом)
    this.count = new ModeCount(s.c);
    // --- слой без масштаба: прицел, красные края, «+N», кнопки телефона
    this.root = h('div', 'k-world hd-world hd-only');
    this.root.hidden = true;
    this.glow = h('div', 'hd-glow');
    this.glow.hidden = true;
    this.cross = h('div', 'k-cross hd-cross', '<i></i><i></i><i></i><i></i>');
    this.cross.hidden = true;
    this.touch = h('div', 'hd-touch');
    this.root.append(this.glow, this.cross, this.touch);
    if (TOUCH) {
      for (const [a, icon, name] of [['take', 'hide-box', 'стать'], ['lock', 'lock', 'замри'], ['rotate', 'compass', 'поверни'], ['taunt', 'emote', 'дразни']] as const) {
        const b = h('button', `k-plate hd-tb hd-tb-${a}`, `${iconImg(icon, '')}<span>${name}</span>`);
        b.type = 'button';
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onTouch(a); });
        this.touch.append(b);
      }
    }
    parent.appendChild(this.root);
    // --- окна: итоги (общее окно режимов) и таблица по Tab
    this.results = new ModeResults(parent);
    this.results.scrim.classList.add('hd-only');
    this.results.onAction = (id) => { if (id === 'leave') this.onLeave(); };
    this.board = h('div', 'k-scrim hd-board hd-only');
    this.board.dataset.mode = 'hide';
    this.board.hidden = true;
    this.board.innerHTML = `<section class="k-window k-window--sm hd-board-win" role="dialog" aria-label="Таблица пряток">
      <header class="k-win-head"><span class="k-win-portrait">${iconImg('hide-box', '')}</span><div class="k-win-titles"><p class="k-eyebrow">${MODE}</p><h2 class="k-win-title"></h2></div>
        <div class="k-win-tools"><span class="k-pill k-pill--lg">${iconImg('stopwatch')}<b class="hd-board-time">0:00</b></span></div></header>
      <div class="k-win-body"><table class="k-table"><thead><tr><th></th><th>Игрок</th><th>Роль</th><th class="k-r">Раунд</th><th class="k-r">Матч</th></tr></thead><tbody></tbody></table></div>
      <footer class="k-win-foot"><span class="k-note">Очки за раунд и за матч</span><span class="k-note">Отпусти ${capHtml('Tab')} — вернуться в игру</span></footer></section>`;
    this.boardBody = this.board.querySelector('tbody')!;
    this.boardTitle = this.board.querySelector('.k-win-title')!;
    this.boardTime = this.board.querySelector('.hd-board-time')!;
    parent.appendChild(this.board);
    this.setVisible(false);
  }

  /** Свои части в общих слотах: прятать целиком, когда сцена не прятки */
  private setVisible(on: boolean): void {
    this.role.hidden = !on;
    this.feedBox.root.hidden = !on;
    this.root.hidden = !on;
    if (!on) {
      this.prompt.hidden = true;
      this.vitals.hidden = true;
    }
  }

  show(on: boolean): void {
    this.setVisible(on);
    if (!on) {
      this.feedBox.clear();
      this.count.set(null);
      this.results.hide();
      this.scoreboard(false);
      this.ui.top.clear('hd-round');
      this.ui.top.clearToasts('hd-');
      this.ui.top.clearHero('hd-role');
      this.panelKey = this.roleKey = this.heroKey = this.resKey = '';
      this.hintText = '';
      this.last = null;
    }
  }

  /** Итоги матча на экране (мышь свободна — кнопка «На набережную») */
  get podium(): boolean {
    return this.results.shown && this.last?.phase === 'final';
  }

  // ------------------------------------------------------------ события

  /** Строка ленты; cls 'big' — важное (золотом) */
  feed(text: string, cls = ''): void {
    this.feedBox.push(esc(text), { big: cls === 'big' });
  }

  /** Личная подсказка («Ещё 3 с», «Краска кончилась») — тостом */
  note(text: string): void {
    this.ui.top.toast({ key: 'hd-note', tone: 'info', icon: uiIcon('hide-box'), title: text, life: 2200 });
  }

  /** «+15 попадание» золотом у прицела */
  points(n: number, why: string): void {
    const f = h('div', 'k-float k-float--gold is-rise hd-float');
    f.style.top = `calc(50% - ${70 + (this.floats++ % 3) * 30}px)`;
    f.textContent = `+${n} `;
    f.appendChild(document.createElement('small')).textContent = why;
    this.root.append(f);
    setTimeout(() => { f.remove(); this.floats = Math.max(0, this.floats - 1); }, 1200);
  }

  /** Попал (ловец): косой крестик в прицеле; caught — поймал (золотом) */
  hit(caught: boolean): void {
    this.cross.classList.remove('is-hit', 'is-head');
    void this.cross.offsetWidth;
    this.cross.classList.add(caught ? 'is-head' : 'is-hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.cross.classList.remove('is-hit', 'is-head'), caught ? 380 : 240);
  }

  scoreboard(open: boolean): void {
    this.boardOpen = open;
    this.board.hidden = !open;
    if (open && this.last) this.fillBoard(this.last, this.lastTick);
  }

  // ------------------------------------------------------------ состояние

  /** Подсказка над панелью; blocked — этим предметом сейчас не стать (не помещается, заляпан): серая, с причиной */
  setHint(text: string | null, blocked = false): void {
    const t = text ?? '';
    this.blocked = !!t && blocked;
    this.cross.classList.toggle('is-no', this.blocked);
    const key = `${t}|${this.blocked}`;
    if (key === this.hintText) return;
    this.hintText = key;
    this.prompt.hidden = !t;
    this.prompt.classList.toggle('k-prompt--off', this.blocked);
    if (!t) return;
    // «ЛКМ — стать: ведро (быстрое, 1 клякса)» → [ЛКМ] Стать: ведро | быстрое, 1 клякса
    const take = /^(?:ЛКМ — )?[Сс]тать: (.+?)(?: \((.+)\))?$/.exec(t);
    const cut = t.indexOf(' — ');
    if (take) {
      this.prompt.innerHTML = `${TOUCH ? '' : capHtml('ЛКМ')}<span>Стать: ${esc(take[1])}</span>${take[2] ? `<span class="k-prompt-sep"></span><span class="k-prompt-note">${esc(take[2])}</span>` : ''}`;
    } else if (this.blocked && cut > 0) {
      this.prompt.innerHTML = `${iconImg('warn')}<span>${esc(t.slice(0, cut))}</span><span class="k-prompt-sep"></span><span class="k-prompt-note">${esc(t.slice(cut + 3))}</span>`;
    } else {
      this.prompt.innerHTML = `${this.blocked ? iconImg('warn') : iconImg('hide-box')}<span>${esc(t)}</span>`;
    }
  }

  /** Клик по предмету, которым не стать: причина уже в подсказке — она вздрагивает */
  refuse(): void {
    this.prompt.classList.remove('is-shake');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('is-shake');
  }

  update(m: HideStateMsg, tick: number): void {
    this.last = m;
    this.lastTick = tick;
    const s = m.self, phase = m.phase;
    const playing = phase === 'hide' || phase === 'seek';
    const toEnd = m.phaseEnd ? Math.max(0, m.phaseEnd - tick) : 0;
    const final = phase === 'seek' && toEnd <= 1800;
    const hunter = s.role === 'hunter', prop = s.role === 'prop';

    this.top(m, toEnd, final);
    this.glow.hidden = !final;
    this.roleUpdate(m, tick);
    this.heroes(m, toEnd);

    // прицел: ловец в поиске — крест; предмет — точка (серая, если этим не стать)
    const crossOn = (hunter && phase === 'seek') || (prop && playing);
    this.cross.hidden = !crossOn;
    this.cross.classList.toggle('hd-dot', prop && playing);
    if (!(prop && playing)) this.setHint(null);

    // крупный отсчёт: последние секунды в сторожке и перед стартом матча
    const n = sec(toEnd);
    this.count.set((phase === 'hide' && !prop && n <= 5 && n > 0) || (phase === 'gather' && m.phaseEnd && n <= 3 && n > 0) ? n : null);

    this.panel(m, tick, prop && playing, hunter && phase === 'seek');
    this.result(m, toEnd);
    if (this.boardOpen) this.fillBoard(m, tick);
  }

  /** Плашка раунда сверху по центру */
  private top(m: HideStateMsg, toEnd: number, final: boolean): void {
    const s = m.self, phase = m.phase;
    // полоса — по целым секундам: плашка перерисовывается раз в секунду, а не каждый снимок
    toEnd = sec(toEnd) * 60;
    let title = m.round ? `Раунд ${m.round} из ${HIDE_ROUNDS}` : 'Прятки';
    let sub = '', timer = '', frac = -1;
    if (phase === 'gather') {
      title = MODE;
      sub = m.phaseEnd ? 'Матч начинается' : `Ждём игроков: ${m.rows.length} из 8 — нужно хотя бы двое`;
      if (m.phaseEnd) { timer = clock(toEnd); frac = toEnd / HIDE_COUNT_TICKS; }
    } else if (phase === 'hide') {
      sub = s.role === 'prop' ? 'Прячься — ловцы в сторожке' : `Предметы прячутся: ${m.total}`;
      timer = clock(toEnd);
      frac = toEnd / HIDE_PREP_TICKS;
    } else if (phase === 'seek') {
      sub = s.role === 'prop' ? `Ловцы ищут: прячутся ${m.left} из ${m.total}` : `Прячутся: ${m.left} из ${m.total}`;
      timer = clock(toEnd);
      frac = toEnd / HIDE_SEEK_TICKS;
    } else if (phase === 'result') {
      sub = m.res?.last ? 'Итоги раунда · дальше итоги матча' : 'Итоги раунда · дальше роли меняются';
      timer = clock(toEnd);
      frac = toEnd / HIDE_RESULT_TICKS;
    } else {
      title = 'Матч окончен';
      sub = `Новый матч через ${sec(toEnd)} с`;
    }
    const html = `<span class="k-event-ic">${iconImg('hide-box', '')}</span><div class="k-event-title">${esc(title)}</div><div class="k-event-sub">${esc(sub)}</div>`
      + (timer ? `<div class="k-event-timer${final ? ' is-hurry' : ''}">${timer}</div>` : '')
      + (frac >= 0 ? meter(frac, `k-meter--thin k-meter--mode${final ? ' is-hurry' : ''}`) : '');
    this.ui.top.event({ key: 'hd-round', prio: PRIO.mode, html, tone: final ? 'danger' : undefined });
  }

  /** Плашка роли: картинка в кружке, «Ты — бочка», строка под ней; цвет полосы — роль */
  private roleUpdate(m: HideStateMsg, tick: number): void {
    const s = m.self, phase = m.phase;
    let tone = 'spectator', icon = 'camera', name = '', sub = '';
    if (phase === 'result' || phase === 'final') {
      this.role.hidden = true;
      this.roleKey = '';
      return;
    }
    if (phase === 'gather') {
      tone = 'spectator'; icon = 'hide-box'; name = 'Прятки';
      sub = 'одни прячутся, другие ищут';
    } else if (s.role === 'prop') {
      tone = 'prop'; icon = 'hide-box'; name = `Ты — ${HIDE_KIND[s.kind].name}`;
      const hp = Math.max(0, hideHits(s.kind) - s.hits);
      sub = phase === 'hide' ? 'прячься, пока ловцы в сторожке' : `${hp} ${plural(hp, 'клякса', 'кляксы', 'клякс')} — и ты пойман`;
    } else if (s.role === 'hunter') {
      tone = 'hunter'; icon = 'paintballs'; name = 'Ты — ловец';
      sub = phase === 'hide' ? 'ждёшь в сторожке' : 'крась подозрительное';
    } else if (s.role === 'caught') {
      tone = 'caught'; icon = 'paint'; name = 'Попался!';
      sub = `через ${sec(s.back - tick)} с — ловец`;
    } else {
      name = 'Зритель';
      sub = 'войдёшь в следующий раунд';
    }
    this.role.hidden = false;
    const key = `${tone}|${icon}`;
    if (key !== this.roleKey) {
      this.roleKey = key;
      this.role.dataset.role = tone;
      this.roleIc.innerHTML = iconImg(icon, '');
    }
    put(this.roleName, name);
    put(this.roleSub, sub);
  }

  /** Крупные баннеры раз на смену роли: «Ты — ловец», «Прячься!», «Попался!» */
  private heroes(m: HideStateMsg, toEnd: number): void {
    const s = m.self;
    const key = `${m.match}|${m.round}|${m.phase}|${s.role}`;
    if (key === this.heroKey) return;
    this.heroKey = key;
    if (m.phase === 'hide' && s.role === 'hunter') {
      this.ui.top.hero({ key: 'hd-role', prio: PRIO.mode, tone: 'info', title: 'Ты — ловец', sub: `Предметы прячутся · выход через ${sec(toEnd)} с` });
    } else if (m.phase === 'hide' && s.role === 'prop') {
      this.ui.top.hero({ key: 'hd-role', prio: PRIO.mode, tone: 'gold', title: 'Прячься!', sub: TOUCH ? 'Наведи на предмет двора — и «стать»' : 'Наведи на предмет двора и нажми ЛКМ' });
    } else if (m.phase === 'seek' && s.role === 'caught') {
      this.ui.top.hero({ key: 'hd-role', prio: PRIO.mode, tone: 'lose', title: 'Попался!', sub: `Через ${sec(s.back - m.tick)} с ты — ловец. Отомсти!` });
    }
  }

  /** Панель бойца: предмет — кляксы, умения, «вздрогнешь»; ловец — бак краски */
  private panel(m: HideStateMsg, tick: number, prop: boolean, hunter: boolean): void {
    const s = m.self;
    this.vitals.hidden = !prop && !hunter;
    if (prop) {
      const max = hideHits(s.kind), hp = Math.max(0, max - s.hits);
      const cd = sec(s.tauntCd - tick), forced = sec(s.tauntAt - tick);
      const key = `p|${s.kind}|${s.hits}|${s.locked}|${cd}|${forced}|${m.phase}`;
      if (key === this.panelKey) return;
      this.panelKey = key;
      this.vitals.dataset.role = 'prop';
      this.hpNum.innerHTML = `${hp}<small>${plural(hp, 'клякса', 'кляксы', 'клякс')}</small>`;
      this.hpBar.className = 'k-meter k-meter--bad';
      setMeter(this.hpBar, hp / Math.max(1, max));
      put(this.hpCap, 'до поимки');
      this.hpCap.hidden = false;
      for (const a of [this.lock, this.turn, this.taunt]) a.root.hidden = false;
      this.paint.root.hidden = true;
      this.lock.root.classList.toggle('is-on', s.locked);
      put(this.lock.cap, s.locked ? 'Замер' : 'Замри');
      const tauntOff = m.phase === 'hide' || cd > 0;
      this.taunt.root.classList.toggle('is-off', tauntOff);
      put(this.taunt.cap, m.phase !== 'hide' && cd > 0 ? `${cd} с` : 'Дразни');
      // «вздрогнешь через» — только в поиске
      this.ammo.hidden = m.phase !== 'seek';
      put(this.ammoCap, 'вздрогнешь через');
      this.ammoRow.hidden = false;
      this.ammoBar.hidden = false;
      this.ammoNum.innerHTML = `${forced}<small>с</small>`;
      this.ammoBar.className = 'k-meter k-meter--thin';
      setMeter(this.ammoBar, forced / (TAUNT.every / 60));
    } else if (hunter) {
      const p = Math.round(s.paint);
      const key = `h|${p}|${s.jam}`;
      if (key === this.panelKey) return;
      this.panelKey = key;
      this.vitals.dataset.role = 'hunter';
      this.hpNum.innerHTML = `${p}<small>/ ${PAINT.max}</small>`;
      this.hpBar.className = `k-meter ${s.jam ? 'k-meter--bad' : 'k-meter--mode'}`;
      setMeter(this.hpBar, p / PAINT.max);
      this.hpCap.hidden = !s.jam;
      put(this.hpCap, 'бак наполняется…');
      for (const a of [this.lock, this.turn, this.taunt]) a.root.hidden = true;
      this.paint.root.hidden = false;
      this.paint.root.classList.toggle('is-empty', s.jam);
      put(this.paint.cap, s.jam ? 'Пусто' : 'Краска');
      this.ammo.hidden = false;
      this.ammoCap.innerHTML = `мимо <b>−${PAINT.decor}</b><br>попал <b>+${PAINT.hit}</b>`;
      this.ammoRow.hidden = true;
      this.ammoBar.hidden = true;
    } else this.panelKey = '';
  }

  /** Итоги раунда (сами закрываются) и итоги матча (кнопка «На набережную») — общим окном итогов */
  private result(m: HideStateMsg, toEnd: number): void {
    const r = m.res;
    if (r && (m.phase === 'result' || m.phase === 'final')) this.countTokens(m.match, r);
    if (!r || (m.phase !== 'result' && m.phase !== 'final')) {
      if (this.resKey) { this.results.hide(); this.resKey = ''; }
      return;
    }
    const key = `${m.phase}|${m.match}|${r.round}`;
    if (key !== this.resKey) {
      this.resKey = key;
      if (m.phase === 'final') this.showFinal(m, r);
      else this.showRound(m, r);
    }
    const n = sec(toEnd);
    if (m.phase === 'final') this.results.note(`Новый матч через ${n} с`, toEnd / HIDE_PODIUM_TICKS);
    else this.results.note(r.last ? `Итоги матча через ${n} с` : `Раунд ${r.round + 1} через ${n} с — роли меняются`, toEnd / HIDE_RESULT_TICKS);
  }

  private countTokens(match: number, r: HideRoundResult): void {
    if (match !== this.tokMatch) { this.tokMatch = match; this.tok.clear(); this.tokRounds.clear(); }
    if (this.tokRounds.has(r.round)) return;
    this.tokRounds.add(r.round);
    for (const row of r.rows) this.tok.set(row.id, (this.tok.get(row.id) ?? 0) + row.tokens);
  }

  private showRound(m: HideStateMsg, r: HideRoundResult): void {
    const me = m.self.id;
    const title = r.winner === 'hunters' ? 'Ловцы нашли всех!' : r.winner === 'props' ? 'Предметы продержались!' : 'Раунд окончен';
    const rows: ResultsRow[] = [...r.rows].sort((a, b) => b.pts - a.pts).map((row, i) => ({
      own: row.id === me,
      cells: [placeHtml(i + 1), `<span class="k-who">${esc(row.nick)}</span>`, `+${row.pts}`, String(row.score), row.tokens ? `+${row.tokens}` : '—'],
    }));
    const mine = r.rows.find((row) => row.id === me);
    this.results.show({
      mode: 'hide', eyebrow: `${MODE} · раунд ${r.round} из ${HIDE_ROUNDS}`, title,
      sub: r.lines.slice(0, 2).map(esc).join('<br>'),
      head: ['', 'Игрок', 'Раунд', 'Матч', coinHead()], rightFrom: 2, rows,
      reward: mine?.tokens ? `+${mine.tokens} жетонов за раунд` : '',
      actions: [],
    });
  }

  private showFinal(m: HideStateMsg, r: HideRoundResult): void {
    const me = m.self.id;
    const sorted = [...m.rows].sort((a, b) => b.score - a.score);
    const rows: ResultsRow[] = sorted.map((row, i) => {
      const t = this.tok.get(row.id) ?? 0;
      return { own: row.id === me, cells: [placeHtml(i + 1), `<span class="k-who">${esc(row.nick)}</span>`, pts(row.score), t ? `+${t}` : '—'] };
    });
    const head = r.winner === 'hunters' ? 'ловцы нашли всех' : r.winner === 'props' ? 'предметы продержались' : 'без наград';
    const mine = this.tok.get(me) ?? 0;
    this.results.show({
      mode: 'hide', eyebrow: `${MODE} · ${HIDE_ROUNDS} ${plural(HIDE_ROUNDS, 'раунд', 'раунда', 'раундов')}`, title: 'Итоги матча',
      sub: esc(`Раунд ${r.round}: ${head}${r.lines[0] ? ` — ${r.lines[0]}` : ''}`),
      head: ['', 'Игрок', 'За матч', coinHead()], rightFrom: 2, rows,
      reward: mine ? `+${mine} жетонов за матч` : '',
      actions: [{ id: 'leave', label: 'На набережную', key: 'Esc', tone: 'ghost' }],
    });
  }

  private fillBoard(m: HideStateMsg, tick: number): void {
    put(this.boardTitle, m.round ? `Раунд ${m.round} из ${HIDE_ROUNDS}` : 'Сбор');
    put(this.boardTime, m.phaseEnd ? clock(m.phaseEnd - tick) : '—');
    const role: Record<string, string> = { h: 'ловец', p: 'прячется', c: 'пойман', s: 'ждёт' };
    const html = [...m.rows].sort((a, b) => b.score - a.score).map((r, i) => `<tr${r.id === m.self.id ? ' class="is-own"' : ''}><td>${placeHtml(i + 1)}</td><td><span class="k-who">${esc(r.nick)}</span></td><td class="hd-board-role">${role[r.role] ?? ''}</td><td class="k-r">${r.pts}</td><td class="k-r">${r.score}</td></tr>`).join('');
    if (this.boardBody.innerHTML !== html) this.boardBody.innerHTML = html;
  }
}

/** Заголовок колонки жетонов — монеткой */
function coinHead(): string {
  return coinHtml();
}

/** Подсказка над целью: «ЛКМ — стать: ведро (быстрое, 1 клякса)»; на телефоне — без клавиши (там кнопка «стать») */
export function takeHint(kind: HideKind, hits: number, hint: string): string {
  return hits >= hideHits(kind) ? `Заляпан — ${HIDE_KIND[kind].name} не выдержит` : `${TOUCH ? 'Стать' : 'ЛКМ — стать'}: ${hint}`;
}

export const TAUNT_CD = TAUNT.cd;
