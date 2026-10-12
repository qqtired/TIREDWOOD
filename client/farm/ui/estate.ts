// Окно «Хозяйство» (lab/ui/screens/farm.js «Хозяйство: улучшения, кладовая, убранство, достижения»; владелец: «очень неплохо»).
// Каждая карточка улучшения отвечает на три вопроса: что даёт («было → станет»), что нужно (есть/нужно зелёным и красным)
// и почему пока нельзя — отдельной строкой, а не текстом внутри кнопки; готовое — зелёной кнопкой. «Кладовая» — репутация и
// ресурсы, «Убранство» — титулы, рамки, скины и вещи участка (с картинками и «откуда взять»), «Достижения» — прогресс.
// Покупает и надевает сервер.
import { FARM_IDENTITY_ICONS, farmLevel, repLevel, upgradeBlock, upgradeStep } from '../../../shared/farm.ts';
import { achProgress } from '../../../shared/farmach.ts';
import {
  ACHIEVEMENTS, BAG_PLACES, CAN_CHARGES, FARM_DECOR, PIG_STORE, RAKE_RESOURCE_BONUS, REP_LEVELS, RESOURCES, SHOVEL_DOUBLE, UPGRADES,
  type FarmDecorKind, type UpgradeDef, type UpgradeKind,
} from '../../../shared/farmdata.ts';
import { C, FarmWin, big, esc, fi, fmtLeft, meter, pigView, plural, resIconName, resName, ui } from './common.ts';
import { UPGRADE_ICON, rewardName, rewardSource } from './names.ts';

type Tab = 'up' | 'store' | 'look' | 'ach';

/** Слот убранства для вещи: серверная карта look (title/frame/can/shovel/fence/decor) */
function lookSlot(id: string): 'title' | 'frame' | 'can' | 'shovel' | 'fence' | 'decor' | null {
  switch (id.split(':')[0]) {
    case 'ti': return 'title';
    case 'fr': return 'frame';
    case 'tl': return id === 'tl:goldshovel' ? 'shovel' : 'can';
    case 'pl': return id === 'pl:harvest' ? 'fence' : 'decor';
    default: return null;
  }
}

const DECOR_ICON: Record<FarmDecorKind, string> = { ti: 'star', fr: 'ui:card-frame', tl: 'watering-can', pl: 'ui:garden-bed', em: 'ui:emote' };
const DECOR_KIND: Record<FarmDecorKind, string> = { ti: 'Титул', fr: 'Рамка карточки', tl: 'Скин инструмента', pl: 'Участок', em: 'Эмоция' };

const IDENTITY_LABELS: Record<string, string> = { radish: 'Редис', pumpkin: 'Тыква', strawberry: 'Клубника', 'sunflower-seeds': 'Подсолнух', beehive: 'Улей', 'watering-can': 'Лейка', 'giant-mushroom': 'Гриб', basket: 'Корзина' };
const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

export class EstateWin extends FarmWin {
  private identityName: string | null = null;
  private identityIcon = '';
  private identityWaiting = false;
  private identityTimer = 0;
  open(tab?: string): void {
    this.identityName = null; this.identityIcon = ''; this.identityWaiting = false;
    clearTimeout(this.identityTimer); super.open(tab);
  }
  identityFailed(): void { this.identityWaiting = false; clearTimeout(this.identityTimer); if (this.isOpen) this.refresh(); }

  protected firstTab(): string {
    return 'up';
  }

  protected draw(body: HTMLElement): void {
    const f = this.host.f;
    this.setHead({ eyebrow: `Ферма · участок ${this.host.plot + 1}` });
    if (!['up', 'store', 'look', 'ach'].includes(this.tab)) this.tab = 'up';
    const can = UPGRADES.filter((u) => this.isNext(u) && this.status(u).ready).length;
    const got = f.achievements.length;
    this.setTabs([
      { id: 'up', icon: fi('rake'), label: 'Улучшения', count: can ? `${can} можно` : undefined },
      { id: 'store', icon: fi('rootlet'), label: 'Кладовая' },
      { id: 'look', icon: ui('wardrobe'), label: 'Убранство' },
      { id: 'ach', icon: fi('star'), label: 'Достижения', count: `${got} из ${ACHIEVEMENTS.length}` },
    ]);
    const tab = this.tab as Tab;
    if (tab === 'store') this.drawStore(body);
    else if (tab === 'look') this.drawLook(body);
    else if (tab === 'ach') this.drawAch(body);
    else this.drawUp(body);
  }

  // ------------------------------------------------------------ улучшения

  /** Следующая ступень своего вида — единственная, которую можно купить сейчас */
  private isNext(u: UpgradeDef): boolean {
    const step = upgradeStep(this.host.f, u);
    return step < u.step && step === u.step - 1;
  }

  /** «было → станет» для карточки */
  private nowGives(u: UpgradeDef): { now: string; gives: string } {
    const f = this.host.f;
    const t = f.tools;
    const pct = (a: number): string => `двойной урожай ${Math.round(a * 100)} %`;
    switch (u.kind) {
      case 'bed': return { now: `${f.beds.length} ${plural(f.beds.length, 'грядка', 'грядки', 'грядок')}`, gives: `${u.step} ${plural(u.step, 'грядка', 'грядки', 'грядок')}` };
      case 'rake': return { now: `ресурс +${Math.round(RAKE_RESOURCE_BONUS[t.rake - 1] * 100)} п.п.`, gives: `ресурс +${Math.round(RAKE_RESOURCE_BONUS[u.step - 1] * 100)} п.п.` };
      case 'shovel': return { now: SHOVEL_DOUBLE[t.shovel - 1] > 0 ? pct(SHOVEL_DOUBLE[t.shovel - 1]) : 'без двойного урожая', gives: pct(SHOVEL_DOUBLE[u.step - 1]) };
      case 'can': return { now: `${CAN_CHARGES[t.can - 1]} зарядов`, gives: `${CAN_CHARGES[u.step - 1]} зарядов` };
      case 'bag': return { now: `${BAG_PLACES[t.bag - 1]} мест`, gives: `${BAG_PLACES[u.step - 1]} мест` };
      default: return { now: '', gives: u.gives };
    }
  }

  /** Готово ли, чего не хватает: уровень, ресурсы, жетоны */
  private status(u: UpgradeDef): { ready: boolean; lvOk: boolean; why: string } {
    const f = this.host.f;
    const lvOk = farmLevel(f.xp) >= u.level;
    const lack: string[] = [];
    for (const [res, n] of Object.entries(u.res)) {
      const have = f.cellar[res] ?? 0;
      if (have < (n ?? 0)) lack.push(`${lowerFirst(resName(res))} ×${(n ?? 0) - have}`);
    }
    if (u.coins > this.host.tokens) lack.push(`${u.coins - this.host.tokens} жетонов`);
    const block = upgradeBlock(f, u);
    if (!lvOk || block === 'level') return { ready: false, lvOk: false, why: `Откроется на ур. ${u.level}${lack.length === 1 ? ` · ещё ${lack[0]}` : ''}` };
    if (lack.length) return { ready: false, lvOk: true, why: `Не хватает: ${lack.join(', ')}` };
    return { ready: !block, lvOk: true, why: '' };
  }

  private cost(u: UpgradeDef): string {
    const f = this.host.f;
    const pills: string[] = [];
    if (u.coins > 0) pills.push(`<span class="k-pill k-pill--sm ${this.host.tokens >= u.coins ? 'k-pill--good' : 'k-pill--bad'}">${C()}${big(u.coins)}</span>`);
    for (const [res, n] of Object.entries(u.res)) {
      const have = f.cellar[res] ?? 0;
      pills.push(`<span class="k-pill k-pill--sm ${have >= (n ?? 0) ? 'k-pill--good' : 'k-pill--bad'}">${fi(resIconName(res))}${have}/${n}</span>`);
    }
    return pills.join('');
  }

  private upCard(u: UpgradeDef): string {
    const st = this.status(u);
    const { now, gives } = this.nowGives(u);
    const compact = !st.lvOk && (u.kind === 'pig' || u.kind === 'bees' || u.kind === 'compost');
    const verb = u.kind === 'bed' ? 'Открыть грядку' : u.kind === 'pig' || u.kind === 'bees' || u.kind === 'compost' ? 'Построить' : 'Улучшить';
    return `
      <div class="k-cell farm-up${st.ready ? ' is-ready' : ''}${compact ? ' is-compact' : ''}">
        ${fi(UPGRADE_ICON[u.kind], 'farm-up-ic')}
        <div class="farm-up-head"><div class="farm-up-name">${u.name}</div><div class="farm-up-gives">${now ? `<span class="k-dim">${now} →</span> ` : ''}<b>${gives}</b></div></div>
        ${compact ? '' : `<div class="farm-up-cost">${this.cost(u)}</div>`}
        ${st.ready ? '' : `<div class="farm-why ${st.lvOk ? 'k-bad' : 'k-dim'}">${ui('lock')}${st.why}</div>`}
        ${compact ? '' : `<button class="k-btn ${st.ready ? 'k-btn--go' : 'k-btn--ghost'} k-btn--sm k-btn--wide farm-up-btn" type="button"${st.ready ? ` data-up="${u.id}" data-sfx="reward"` : ' disabled'}>${verb}</button>`}
      </div>`;
  }

  private maxedCard(kind: UpgradeKind, text: string): string {
    return `<div class="k-cell farm-up is-compact">${fi(UPGRADE_ICON[kind], 'farm-up-ic')}<div class="farm-up-head"><div class="farm-up-name">${text}</div><div class="farm-up-gives"><b class="k-good">Всё куплено ✓</b></div></div></div>`;
  }

  private drawUp(body: HTMLElement): void {
    const f = this.host.f;
    const kinds: readonly UpgradeKind[] = ['rake', 'bed', 'shovel', 'can', 'bag'];
    const cards = (list: readonly UpgradeKind[]): string => list.map((kind) => {
      const next = UPGRADES.find((u) => u.kind === kind && this.isNext(u));
      return next ? this.upCard(next) : this.maxedCard(kind, kind === 'bed' ? 'Грядки' : UPGRADES.filter((u) => u.kind === kind).at(-1)?.name ?? '');
    }).join('');
    const built = (['pig', 'bees', 'compost'] as const).map((kind) => {
      const u = UPGRADES.find((x) => x.kind === kind)!;
      const have = kind === 'pig' ? !!f.built.pig : f.built[kind];
      return have ? this.maxedCard(kind, u.name) : this.upCard(u);
    }).join('');
    const pig = pigView(f, this.host.now);
    const pigRow = pig ? `
      <div class="k-cell farm-pig">
        ${fi('truffle', 'farm-up-ic')}
        <div class="farm-up-head"><div class="farm-up-name">Трюфельный свин</div><div class="farm-up-gives">В загоне: <b>${pig.stored} из ${PIG_STORE}</b> · <span class="k-dim" data-live="pig"></span></div></div>
        <button class="k-btn k-btn--go k-btn--sm" type="button" data-pig data-sfx="reward"${pig.stored <= 0 ? ' disabled' : ''}>Забрать в сумку</button>
      </div>` : '';
    body.innerHTML = `
      <div class="farm-pane">
        <p class="k-eyebrow farm-h">Инструменты и грядки</p>
        <div class="farm-ups">${cards(kinds)}</div>
        <p class="k-eyebrow farm-h">Постройки</p>
        <div class="farm-ups farm-ups--sm">${built}</div>
        ${pigRow}
      </div>`;
    this.live('[data-live=pig]', () => {
      const p = pigView(this.host.f, this.host.now);
      return !p || !p.nextAt ? 'загон полон — свин спит' : `следующий через ${fmtLeft(p.nextAt - this.host.now)}`;
    });
    this.onClick('[data-up]', (b) => this.host.send({ t: 'farm', a: 'upgrade', id: b.dataset.up! }));
    this.onClick('[data-pig]', () => this.host.send({ t: 'farm', a: 'pig' }));
  }

  // ------------------------------------------------------------ кладовая

  private drawStore(body: HTMLElement): void {
    const f = this.host.f;
    const lv = repLevel(f.rep);
    const cur = REP_LEVELS[lv - 1];
    const nxt = REP_LEVELS[lv];
    const extra = nxt
      ? `Дальше «${nxt.name}»: ${nxt.vanSlot ? '<b>+1 ящик Фургона</b> и ' : ''}<b>+${Math.round(nxt.bonus * 100)} %</b> к цене. Репутация — за помощь соседям и вклад в Древо.`
      : `Высшая ступень · +${Math.round(cur.bonus * 100)} % к продаже.`;
    const res = RESOURCES.map((r) => {
      const n = f.cellar[r.id] ?? 0;
      return `<div class="k-stat${n ? '' : ' k-stat--empty'}">${fi(r.icon, 'k-stat-ic')}<div class="k-stat-num">${n}</div><div class="k-stat-cap">${r.name}</div></div>`;
    }).join('');
    body.innerHTML = `
      <div class="farm-pane">
        <div class="k-cell farm-rep">
          ${fi('help-hands', 'farm-rep-ic')}
          <div class="farm-rep-main"><p class="k-eyebrow">Репутация ${lv} · «${cur.name}»</p>
            ${meter(nxt ? f.rep / nxt.need : 1, 'k-meter--lg', nxt ? `${f.rep} из ${nxt.need}` : `${f.rep}`)}
            <div class="k-dim farm-rep-next">${extra}</div></div>
        </div>
        <div class="farm-res">${res}</div>
        <p class="farm-lead k-dim">Ресурсы падают при сборе. Лишние можно превратить в опыт у Дядюшки Гриба.</p>
      </div>`;
  }

  // ------------------------------------------------------------ убранство

  private decorWhy(id: string): string {
    const a = ACHIEVEMENTS.find((x) => x.items.includes(id));
    if (a) {
      const p = achProgress(this.host.f, a);
      return `«${a.hidden ? '???' : a.name}»: ${p.have} из ${p.need}`;
    }
    return lowerFirst(rewardSource(id));
  }

  private drawLook(body: HTMLElement): void {
    const f = this.host.f;
    const identity = f.identity;
    if (this.identityWaiting && identity.name === this.identityName && identity.icon === this.identityIcon) { this.identityWaiting = false; clearTimeout(this.identityTimer); }
    this.identityName ??= identity.name;
    if (!this.identityIcon) this.identityIcon = identity.icon;
    const identityHtml = `<section class="k-cell farm-identity"><p class="k-eyebrow">Название твоей фермы</p><label>Название<input class="k-input" data-farm-name maxlength="56" value="${esc(this.identityName)}" placeholder="Ферма ${esc(this.host.plots()[this.host.plot]?.nick ?? '')}" aria-label="Название фермы"></label><div class="farm-identity-icons" role="group" aria-label="Значок фермы">${FARM_IDENTITY_ICONS.map(id => `<button class="k-btn k-btn--icon k-btn--sm ${id === this.identityIcon ? 'k-btn--gold' : 'k-btn--ghost'}" type="button" data-farm-icon="${id}" aria-pressed="${id === this.identityIcon}" aria-label="${IDENTITY_LABELS[id]}">${fi(id)}</button>`).join('')}</div><div class="farm-identity-foot"><span class="k-dim" data-identity-note>До 28 знаков · пустое поле — имя по умолчанию</span><button class="k-btn k-btn--go k-btn--sm" type="button" data-identity-save ${this.identityWaiting ? 'disabled' : ''}>${this.identityWaiting ? 'Сохраняем…' : 'Сохранить'}</button></div></section>`;
    const cards = FARM_DECOR.map((d) => {
      const own = f.decor.includes(d.id);
      const slot = lookSlot(d.id);
      const on = slot !== null && f.look[slot] === d.id;
      let act = '';
      if (!own) act = `<div class="farm-why k-dim">${ui('lock')}${this.decorWhy(d.id)}</div>`;
      else if (d.kind === 'em') act = `<span class="k-pill k-pill--sm">в колесе: клавиши 7–9</span>`;
      else if (slot) act = on ? `<button class="k-btn k-btn--ghost k-btn--sm" type="button" data-look="${slot}" data-id="">Снять</button>` : `<button class="k-btn k-btn--sm" type="button" data-look="${slot}" data-id="${d.id}">Надеть</button>`;
      return `
        <div class="k-cell farm-dec${own ? '' : ' is-locked'}">
          ${fi(DECOR_ICON[d.kind], 'farm-dec-ic')}
          <p class="k-eyebrow">${DECOR_KIND[d.kind]}</p>
          <div class="farm-dec-name">${d.name}</div>
          ${act}
          ${on ? '<span class="k-pill k-pill--gold k-pill--sm farm-dec-on">надето</span>' : ''}
        </div>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane">${identityHtml}<p class="farm-lead k-dim">Одежду и питомцев надевай в примерочной на площади. Здесь — то, что видно на карточке и участке.</p><div class="farm-decor">${cards}</div></div>`;
    const nameInput = body.querySelector<HTMLInputElement>('[data-farm-name]')!;
    nameInput.addEventListener('input', () => { this.identityName = [...nameInput.value].slice(0, 28).join(''); nameInput.value = this.identityName; });
    this.onClick('[data-farm-icon]', b => { this.identityIcon = b.dataset.farmIcon ?? 'radish'; this.refresh(); });
    this.onClick('[data-identity-save]', () => {
      if (this.identityWaiting) return;
      this.identityWaiting = true;
      this.identityName = nameInput.value.trim();
      this.host.send({ t: 'farm', a: 'identity', name: this.identityName, icon: this.identityIcon });
      this.refresh();
      this.identityTimer = window.setTimeout(() => {
        this.identityWaiting = false;
        if (!this.isOpen) return;
        const note = this.body.querySelector('[data-identity-note]');
        if (note) note.textContent = 'Ждём подтверждение сервера…';
        const button = this.body.querySelector<HTMLButtonElement>('[data-identity-save]'); if (button) { button.disabled = false; button.textContent = 'Сохранить'; }
      }, 5000);
    });
    this.onClick('[data-look]', (b) => this.host.send({ t: 'farm', a: 'look', slot: b.dataset.look as 'title', id: b.dataset.id ?? '' }));
  }

  // ------------------------------------------------------------ достижения

  private drawAch(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    const rows = ACHIEVEMENTS.map((a) => {
      const got = f.achievements.includes(a.id);
      const hide = a.hidden && !got;
      const p = achProgress(f, a);
      const reward = [...a.items.map(rewardName), ...(a.coins ? [`${a.coins} жетонов`] : [])].join(' · ');
      return `
        <div class="k-cell farm-ach${got ? ' is-done' : ''}">
          <div class="farm-ach-main"><p class="k-eyebrow">${a.category}</p><div class="farm-ach-name">${hide ? '???' : a.name} <span class="k-dim">· ${hide ? 'скрытое достижение' : `${a.goal}${a.level > level ? ` · с ур. ${a.level}` : ''}`}</span></div>${hide ? '' : meter(got ? 1 : p.have / p.need, got ? 'k-meter--good k-meter--thin' : 'k-meter--thin')}</div>
          <div class="farm-ach-side">${hide ? '' : `<b>${got ? p.need : p.have} из ${p.need}</b><span class="k-dim">${reward}</span>`}</div>
          ${got ? '<span class="k-pill k-pill--good k-pill--sm">получено</span>' : '<span></span>'}
        </div>`;
    }).join('');
    body.innerHTML = `<div class="farm-pane"><div class="farm-rows">${rows}</div></div>`;
  }
}
