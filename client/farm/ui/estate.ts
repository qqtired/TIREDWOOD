// Окно «Хозяйство» (design-v11 §6, §12, §13, §14.2): «Улучшения» — карточки грядок, инструментов и построек (что даёт, ур., 🪙,
// ресурсы «есть/нужно», причина запрета прямо на кнопке), «Кладовая» — ресурсы, сумка, репутация, «Убранство» — титул, рамка,
// скины инструментов, вещи участка, эмоции; «Достижения» — прогресс по счётчикам. Покупает и надевает сервер.
import { farmLevel, repLevel, upgradeBlock, upgradeStep, bagCap, bagUsed } from '../../../shared/farm.ts';
import {
  ACHIEVEMENTS, BAG_PLACES, CAN_CHARGES, FARM_BEDS, FARM_DECOR, RAKE_BEDS, REP_LEVELS, RESOURCES, SHOVEL_DOUBLE, TRUFFLE, UPGRADES,
  cropById, resourceById, type FarmDecorKind, type UpgradeDef, type UpgradeKind,
} from '../../../shared/farmdata.ts';
import { FarmWin, btn, big, el, fmtLeft, icon, needChip, pigView, resIcon } from './common.ts';
import { rewardName, rewardSource } from './names.ts';

type Tab = 'up' | 'store' | 'look' | 'ach';

const GROUPS: readonly { title: string; kinds: readonly UpgradeKind[] }[] = [
  { title: 'Грядки', kinds: ['bed'] },
  { title: 'Инструменты', kinds: ['rake', 'shovel', 'can', 'bag'] },
  { title: 'Постройки на заднем дворе', kinds: ['pig', 'bees', 'compost'] },
];

const KIND_ICON: Record<UpgradeKind, [name: string, fallback: string]> = {
  bed: ['', '🌱'], rake: ['rake', '🧹'], shovel: ['trowel', '⛏'], can: ['watering-can', '💧'], bag: ['bag', '🎒'],
  pig: ['truffle-pig', '🐖'], bees: ['beehive', '🐝'], compost: ['compost', '♻️'],
};

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

const DECOR_TITLE: Record<FarmDecorKind, string> = {
  ti: 'Титулы', fr: 'Рамки карточки', tl: 'Скины инструментов', pl: 'Участок', em: 'Эмоции',
};

export class EstateWin extends FarmWin {
  protected firstTab(): string {
    return 'up';
  }

  protected draw(body: HTMLElement): void {
    this.setTabs([['up', '🔧', 'Улучшения'], ['store', '📦', 'Кладовая'], ['look', '🎨', 'Убранство'], ['ach', '🏆', 'Достижения']] as [Tab, string, string][]);
    if (this.tab === 'store') this.drawStore(body);
    else if (this.tab === 'look') this.drawLook(body);
    else if (this.tab === 'ach') this.drawAch(body);
    else this.drawUp(body);
  }

  // ------------------------------------------------------------ улучшения

  private current(kind: UpgradeKind): string {
    const f = this.host.f;
    const t = f.tools;
    switch (kind) {
      case 'bed': return `Открыто грядок: ${f.beds.length} из ${FARM_BEDS}`;
      case 'rake': return `Грабли ${t.rake}: до ${RAKE_BEDS[t.rake - 1]} гряд. за раз`;
      case 'shovel': return SHOVEL_DOUBLE[t.shovel - 1] > 0 ? `Лопатка ${t.shovel}: двойной урожай ${Math.round(SHOVEL_DOUBLE[t.shovel - 1] * 100)} %` : `Лопатка ${t.shovel}: без двойного урожая`;
      case 'can': return `Лейка ${t.can}: ${CAN_CHARGES[t.can - 1]} зарядов`;
      case 'bag': return `Сумка ${t.bag}: ${BAG_PLACES[t.bag - 1]} мест`;
      case 'pig': return f.built.pig ? 'Свин живёт во дворе' : 'Ещё не построено';
      case 'bees': return f.built.bees ? 'Пчёлы работают' : 'Ещё не построено';
      case 'compost': return f.built.compost ? 'Компост работает' : 'Ещё не построено';
    }
  }

  private drawUp(body: HTMLElement): void {
    const f = this.host.f;
    for (const g of GROUPS) {
      const sec = body.appendChild(el('section', 'fm-sec'));
      sec.append(el('h3', '', g.title));
      const grid = sec.appendChild(el('div', 'fm-ups'));
      for (const kind of g.kinds) {
        const all = UPGRADES.filter((u) => u.kind === kind);
        const next = all.find((u) => upgradeStep(f, u) < u.step && upgradeStep(f, u) === u.step - 1);
        grid.append(this.upCard(kind, next));
      }
    }
    const pig = pigView(f, this.host.now);
    if (pig) {
      const sec = body.appendChild(el('section', 'fm-sec'));
      sec.append(el('h3', '', 'Трюфельный свин'));
      const row = sec.appendChild(el('div', 'fm-row'));
      row.append(icon('truffle', '🍄', 'fm-ico lg'));
      const main = row.appendChild(el('div', 'fm-row-main'));
      main.append(el('b', '', `В загоне: ${pig.stored} из 3`));
      const sub = main.appendChild(el('small'));
      this.live(sub, () => {
        const p = pigView(this.host.f, this.host.now);
        return !p || !p.nextAt ? 'Загон полон — свин спит, забери трюфели' : `Следующий трюфель через ${fmtLeft(p.nextAt - this.host.now)}`;
      });
      const take = btn('fm-go', 'Забрать в сумку', () => this.host.send({ t: 'farm', a: 'pig' }));
      take.disabled = pig.stored <= 0;
      row.append(take);
    }
  }

  private upCard(kind: UpgradeKind, u: UpgradeDef | undefined): HTMLElement {
    const f = this.host.f;
    const card = el('article', `fm-up${u ? '' : ' maxed'}`);
    const [ic, fb] = KIND_ICON[kind];
    const top = card.appendChild(el('div', 'fm-card-top'));
    top.append(icon(ic, fb, 'fm-ico lg'));
    const name = top.appendChild(el('div', 'fm-card-name'));
    name.append(el('b', '', u ? u.name : 'Максимум'), el('small', '', this.current(kind)));
    if (!u) {
      card.append(el('div', 'fm-done', 'Всё куплено ✓'));
      return card;
    }
    card.append(el('p', 'fm-up-gives', `Даёт: ${u.gives}`));
    const chips = card.appendChild(el('div', 'fm-needs'));
    if (u.coins > 0) chips.append(el('span', `fm-need ${this.host.tokens >= u.coins ? 'ok' : 'low'}`, `${big(u.coins)} 🪙`));
    for (const [res, n] of Object.entries(u.res)) chips.append(needChip(res, f.cellar[res] ?? 0, n ?? 0));
    const block = upgradeBlock(f, u);
    let why = '';
    if (block === 'level') why = `ур. ${u.level}`;
    else if (block === 'res') {
      const lack = Object.entries(u.res).find(([res, n]) => (f.cellar[res] ?? 0) < (n ?? 0));
      if (lack) why = `нужно ${lack[1]} ${resourceById(lack[0])?.name.toLowerCase()} (есть ${f.cellar[lack[0]] ?? 0})`;
    } else if (!block && u.coins > this.host.tokens) why = `не хватает ${u.coins - this.host.tokens} 🪙`;
    const verb = u.kind === 'bed' ? 'Открыть грядку' : u.kind === 'pig' || u.kind === 'bees' || u.kind === 'compost' ? 'Построить' : 'Улучшить';
    const go = btn('fm-go', why ? `${verb} · ${why}` : verb, () => this.host.send({ t: 'farm', a: 'upgrade', id: u.id }));
    go.disabled = !!why;
    card.append(go);
    return card;
  }

  // ------------------------------------------------------------ кладовая

  private drawStore(body: HTMLElement): void {
    const f = this.host.f;
    const rep = body.appendChild(el('section', 'fm-sec'));
    const lv = repLevel(f.rep);
    const cur = REP_LEVELS[lv - 1];
    const nxt = REP_LEVELS[lv];
    rep.append(el('h3', '', `Репутация: ${cur.name}`));
    const bar = rep.appendChild(el('div', 'fm-bar big'));
    const fill = el('i');
    fill.style.width = nxt ? `${Math.min(100, ((f.rep - cur.need) / (nxt.need - cur.need)) * 100)}%` : '100%';
    bar.append(fill);
    rep.append(el('small', 'fm-fine', nxt ? `${f.rep} из ${nxt.need} до «${nxt.name}» · сейчас +${Math.round(cur.bonus * 100)} % к продаже` : `Высшая ступень · +${Math.round(cur.bonus * 100)} % к продаже`));

    const res = body.appendChild(el('section', 'fm-sec'));
    res.append(el('h3', '', 'Ресурсы'));
    const grid = res.appendChild(el('div', 'fm-store'));
    for (const r of RESOURCES) {
      const n = f.cellar[r.id] ?? 0;
      const cell = grid.appendChild(el('div', `fm-cell${n ? '' : ' zero'}`));
      cell.append(resIcon(r.id, 'fm-ico lg'), el('b', '', String(n)), el('small', '', r.name));
    }

    const bag = body.appendChild(el('section', 'fm-sec'));
    bag.append(el('h3', '', `Сумка: ${bagUsed(f)} из ${bagCap(f)}`));
    const items = Object.entries(f.bag).filter(([, n]) => n > 0);
    if (!items.length) bag.append(el('p', 'fm-fine', 'Пусто. Урожай и трюфели лежат здесь, пока не продашь их Грибу или не сдашь Фургону.'));
    const bg = bag.appendChild(el('div', 'fm-store'));
    for (const [id, n] of items) {
      const c = cropById(id);
      const cell = bg.appendChild(el('div', 'fm-cell'));
      cell.append(icon(id === TRUFFLE ? 'truffle' : (c?.icon ?? ''), '🌱', 'fm-ico lg'), el('b', '', String(n)), el('small', '', id === TRUFFLE ? 'Трюфель' : (c?.product ?? id)));
    }
  }

  // ------------------------------------------------------------ убранство

  private drawLook(body: HTMLElement): void {
    const f = this.host.f;
    body.append(el('p', 'fm-fine', 'Одежду, питомцев и значки фермы надевай в примерочной на площади. Здесь — то, что видно на карточке и участке.'));
    const kinds: FarmDecorKind[] = ['ti', 'fr', 'tl', 'pl', 'em'];
    for (const kind of kinds) {
      const list = FARM_DECOR.filter((d) => d.kind === kind);
      const sec = body.appendChild(el('section', 'fm-sec'));
      sec.append(el('h3', '', DECOR_TITLE[kind]));
      const grid = sec.appendChild(el('div', 'fm-ups'));
      for (const d of list) {
        const own = f.decor.includes(d.id);
        const slot = lookSlot(d.id);
        const on = slot !== null && f.look[slot] === d.id;
        const card = grid.appendChild(el('article', `fm-up fm-decor${own ? '' : ' closed'}${on ? ' on' : ''}`));
        const top = card.appendChild(el('div', 'fm-card-top'));
        top.append(el('span', 'fm-ico lg emo', own ? '🎁' : '🔒'));
        const name = top.appendChild(el('div', 'fm-card-name'));
        name.append(el('b', '', d.name), el('small', '', own ? (on ? 'Надето' : 'Есть') : `Откуда: ${rewardSource(d.id)}`));
        if (kind === 'em') {
          card.append(el('p', 'fm-fine', own ? 'Эмоция появилась в колесе: клавиши 7–9.' : 'Откроется наградой.'));
          continue;
        }
        if (!own || !slot) continue;
        card.append(btn(on ? 'fm-btn' : 'fm-go', on ? 'Снять' : 'Надеть', () => this.host.send({ t: 'farm', a: 'look', slot, id: on ? '' : d.id })));
      }
    }
  }

  // ------------------------------------------------------------ достижения

  private drawAch(body: HTMLElement): void {
    const f = this.host.f;
    const level = farmLevel(f.xp);
    const done = ACHIEVEMENTS.filter((a) => f.achievements.includes(a.id)).length;
    body.append(el('p', 'fm-fine', `Получено ${done} из ${ACHIEVEMENTS.length}. Прогресс копится сразу, награда приходит на нужном уровне фермы.`));
    const cats = [...new Set(ACHIEVEMENTS.map((a) => a.category))];
    for (const cat of cats) {
      const sec = body.appendChild(el('section', 'fm-sec'));
      sec.append(el('h3', '', cat));
      for (const a of ACHIEVEMENTS.filter((x) => x.category === cat)) {
        const got = f.achievements.includes(a.id);
        const hide = a.hidden && !got;
        const n = Math.min(a.need, f.counters[a.counter] ?? 0);
        const row = sec.appendChild(el('div', `fm-row fm-ach${got ? ' got' : ''}`));
        row.append(el('span', 'fm-check', got ? '✓' : '·'));
        const main = row.appendChild(el('div', 'fm-row-main'));
        main.append(el('b', '', hide ? '???' : a.name));
        main.append(el('small', '', hide ? 'Скрытое достижение' : `${a.goal}${a.level > level ? ` · с ур. ${a.level}` : ''}`));
        if (!hide && !got) {
          const bar = main.appendChild(el('div', 'fm-bar'));
          const fill = el('i');
          fill.style.width = `${(n / a.need) * 100}%`;
          bar.append(fill);
        }
        const reward = [...a.items.map(rewardName), ...(a.coins ? [`${a.coins} 🪙`] : [])].join(' · ');
        row.append(el('em', '', got ? 'получено' : hide ? '' : `${n} / ${a.need}${reward ? ` · ${reward}` : ''}`));
      }
    }
  }
}
