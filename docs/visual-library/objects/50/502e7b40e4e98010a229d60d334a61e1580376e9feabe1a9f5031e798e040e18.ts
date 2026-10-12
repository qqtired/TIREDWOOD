// Окно рюкзака (клавиша I или плитка рюкзака) — окно кита UI 2.0 (эталон: lab/ui/screens/fishing.js, сцена «7. рюкзак»):
// портрет — картинка твоего рюкзака, вкладки «Рюкзак N/M» и «Лайвел» (своя лодка, флаг ISLE). Строки улова .fi-row:
// картинка, имя, категория, вес и значки поимки, цена крупно; «В руки» (желейка держит рыбу, видят все — fishhold.ts)
// и «Отпустить» (второе нажатие — «Точно отпустить?»: место освобождается, денег нет). Продать — у Семёна или Сани
// (подвал окна). catchRowHtml — та же строка во вкладке «Продать» у торговца (fishnpcdialog.ts).
import { FISH } from '../../shared/fishing.ts';
import { BAG_ALE, BAG_BARKAS, BAG_BEER, BAG_LORD, BAG_RAIN, bagSlots, bagValue, emptyFishProgress, type BagFish, type FishProgress } from '../../shared/fishprogress.ts';
import { BARKAS_INCOME, RAIN_DEN, RAIN_NUM, fmtCatch } from '../../shared/fishrules.ts';
import { ALE, BAGS, BEER, LORD } from '../../shared/fishshop.ts';
import { BOATS } from '../../shared/fishboat.ts';
import { ISLE } from '../../shared/fishisle.ts';
import { livewellCap, livewellOf } from '../../shared/fishlivewell.ts';
import type { ClientMsg } from '../../shared/messages.ts';
import { coinHtml, iconImg } from '../ui/kit/dom.ts';
import { uiIcon } from '../ui/kit/icons.ts';
import { fishPic, tierOf } from './fish2.ts';
import { isleFish, mul, num, pct } from './fishfmt.ts';
import { fishDialog, gearUrl, tabsHtml, tierHtml, winHeadHtml, winIn } from './fishkit.ts';
// старые стили окна (fe-*) — до уборки ведущим; плашка «рыба в руках» (client/lobby/fishhold.ts) — fishhold.css
import { escHtml as esc } from '../ui/kit/topcenter.ts';
import './fisheco.css';
import './fishhold.css';
import './fishwin.css';

/** «+10 %» (fishfmt.pct пишет «+10%») */
const pctSp = (x: number): string => pct(x).replace('%', ' %');

/** Значки поимки пилюлями: баркас, дождь или туман, напиток (биты BAG_* — как bagMarks в fishfmt.ts, без эмодзи) */
export function markPills(m: number, id: string): string {
  const pill = (img: string, text: string): string => `<span class="k-pill k-pill--gold k-pill--sm">${img}${text}</span>`;
  const pic = (url: string): string => (url ? `<img class="k-ic" src="${url}" alt="">` : '');
  const out: string[] = [];
  if (m & BAG_BARKAS) out.push(pill(iconImg('anchor'), `баркас ${mul(BARKAS_INCOME)}`));
  if (m & BAG_RAIN) out.push(pill(iconImg(isleFish(id) ? 'fog' : 'rain'), `${isleFish(id) ? 'туман' : 'дождь'} ${mul(RAIN_NUM / RAIN_DEN)}`));
  if (m & BAG_LORD) out.push(pill(pic(gearUrl('fishshop/beer')), `пиво владыки ${pctSp(LORD.income)}`));
  else if (m & BAG_ALE) out.push(pill(pic(gearUrl('fishshop/ale')), `эль ${pctSp(ALE.income)}`));
  else if (m & BAG_BEER) out.push(pill(pic(gearUrl('fishshop/beer')), `пиво ${pctSp(BEER.income)}`));
  return out.join('');
}

/** Строка улова .fi-row: картинка, имя, категория + вес + значки, цена; actions — кнопки справа (готовая разметка) */
export function catchRowHtml(f: BagFish, actions: string, held = false): string {
  const sp = FISH.findIndex((x) => x.id === f.f);
  const t = tierOf(sp);
  return `<div class="fi-row${held ? ' is-held' : ''}" style="--tc:${t.css}"><div class="fi-row-art">${fishPic(sp, '').outerHTML}</div>`
    + `<div class="fi-row-t"><b>${esc(FISH[sp]?.name ?? f.f)}</b><span>${tierHtml(t.tier)}${esc(fmtCatch(f.g))}${markPills(f.m, f.f)}`
    + `${held ? '<span class="k-pill k-pill--gold k-pill--sm">в руках</span>' : ''}</span></div>`
    + `<span class="fi-row-p">${coinHtml()}${num(f.p)}</span><div class="fi-row-a">${actions}</div></div>`;
}

/** Пусто: картинка, заголовок, пояснение (.k-cell.fi-empty) */
export function emptyHtml(img: string, title: string, text: string): string {
  return `<div class="k-cell fi-empty"><img src="${img}" alt=""><div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
}

type BagTab = 'bag' | 'well';

export class FishBag {
  allowHold = true;
  onClose: () => void = () => {};
  private readonly root: HTMLDialogElement;
  private readonly win: HTMLElement;
  private readonly portrait: HTMLImageElement;
  private readonly eyebrow: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly body: HTMLElement;
  private readonly sum: HTMLElement;
  private readonly send: (msg: ClientMsg) => void;
  private progress = emptyFishProgress();
  private tab: BagTab = 'bag';
  /** Рыба, которую спросили «точно отпустить?» */
  private ask = -1;
  /** Рыба в руках (номер в рюкзаке, −1 — руки пустые): «В руки» — желейка держит её, видят все (fishhold.ts) */
  private held = -1;
  /** Что нарисовано: то же самое не перерисовываем (клик не теряется, прокрутка на месте) */
  private bodyKey = '';
  private tabsKey = '';

  constructor(parent: HTMLElement, send: (msg: ClientMsg) => void, sellerNote = 'Продать улов — у Деда Семёна или Сани на баркасе') {
    this.send = send;
    const { dlg, win } = fishDialog(parent, 'fi-win--auto fi-bagwin');
    this.root = dlg;
    this.win = win;
    dlg.setAttribute('aria-labelledby', 'fish-bag-title');
    win.innerHTML = winHeadHtml({ portrait: '<img alt="">', eyebrow: 'Рюкзак', title: 'Рюкзак' })
      + '<div class="fi-tabwrap"></div><div class="k-win-body"></div>'
      + `<footer class="k-win-foot"><span class="k-note">${esc(sellerNote)}</span><span class="fi-sum"></span></footer>`;
    this.portrait = win.querySelector<HTMLImageElement>('.k-win-portrait > img')!;
    this.eyebrow = win.querySelector<HTMLElement>('.k-eyebrow')!;
    win.querySelector('.k-win-title')!.id = 'fish-bag-title';
    this.tabs = win.querySelector<HTMLElement>('.fi-tabwrap')!;
    this.body = win.querySelector<HTMLElement>('.k-win-body')!;
    this.sum = win.querySelector<HTMLElement>('.fi-sum')!;
    win.querySelector('.k-close')!.addEventListener('click', () => this.close());
    this.tabs.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (!b || b.dataset.tab === this.tab) return;
      this.tab = b.dataset.tab as BagTab;
      this.ask = -1;
      this.body.scrollTop = 0;
      this.render();
    });
    this.body.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
      if (!b || b.disabled) return;
      const n = Number(b.dataset.n);
      if (b.dataset.act === 'hold') {
        const inHands = this.held === n;
        this.send({ t: 'fishHold', n: inHands ? -1 : n });
        // взял — окно закрывается: сразу видно рыбу в руках
        if (!inHands) this.close();
      } else if (b.dataset.act === 'release') {
        if (this.ask !== n) { this.ask = n; this.render(); return; }
        this.ask = -1;
        this.send({ t: 'fishBag', a: 'release', n });
      }
    });
    dlg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); this.close(); }
    });
    dlg.addEventListener('keyup', (e) => e.stopPropagation());
    // Esc и клик мимо окна (fishDialog шлёт cancel)
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
  }

  get isOpen(): boolean { return this.root.open; }

  open(progress: FishProgress): void {
    this.progress = progress;
    this.ask = -1;
    this.tab = 'bag';
    this.bodyKey = '';
    this.tabsKey = '';
    this.render();
    if (!this.root.open) {
      this.root.showModal();
      winIn(this.win);
    }
    this.body.scrollTop = 0;
  }

  set(progress: FishProgress): void {
    this.progress = progress;
    if (this.isOpen) this.render();
  }

  /** Сервер: какую рыбу держишь в руках (−1 — никакую) */
  setHeld(n: number): void {
    if (n === this.held) return;
    this.held = n;
    if (this.isOpen) this.render();
  }

  close(): void {
    if (!this.root.open) return;
    this.root.close();
    this.onClose();
  }

  private render(): void {
    const p = this.progress;
    const slots = bagSlots(p);
    const well = livewellOf(p);
    const cap = livewellCap(p);
    // лайвел — у своей лодки (флаг ISLE); рыба в нём осталась — вкладка видна и без флага
    const showWell = ISLE.on || cap > 0 || well.length > 0;
    if (!showWell && this.tab === 'well') this.tab = 'bag';
    const bag = BAGS.find((b) => b.tier === p.bagTier);
    const pic = gearUrl(`fishshop/bag${Math.max(1, Math.min(3, p.bagTier))}`);
    if (this.portrait.getAttribute('src') !== pic) this.portrait.src = pic;
    this.eyebrow.textContent = `${bag?.name ?? 'Без рюкзака'} · ${slots} мест`;
    const tabs = tabsHtml([
      ['bag', pic, 'Рюкзак', `${p.bag.length}/${slots}`],
      ...(showWell ? [['well', uiIcon('livewell'), 'Лайвел', cap ? `${well.length}/${cap}` : null] as const] : []),
    ], this.tab);
    if (tabs !== this.tabsKey) {
      this.tabsKey = tabs;
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.fi-tabwrap [data-tab]')?.dataset.tab;
      this.tabs.innerHTML = tabs;
      if (focused) this.tabs.querySelector<HTMLElement>(`[data-tab="${focused}"]`)?.focus();
    }
    const inWell = this.tab === 'well';
    this.sum.innerHTML = `${inWell ? 'в лайвеле' : 'в рюкзаке'} на <b>${coinHtml()}${num(bagValue(inWell ? well : p.bag))}</b>`;
    let html: string;
    if (inWell) {
      html = well.length
        ? `<div class="fi-rows">${well.map((f) => catchRowHtml(f, this.releaseBtn(f.n))).join('')}</div>`
        : cap > 0
          ? emptyHtml(uiIcon('livewell'), 'Лайвел пуст', 'Рюкзак полон — рыба ложится сюда. Продать — у скупщика или из меню лодки.')
          : emptyHtml(uiIcon('livewell'), 'Лайвел — у своей лодки', `В лодке рыба живёт в садке: ${BOATS.map((b, i) => `«${b.name}» — ${b.livewell}${i ? '' : ' рыб'}`).join(', ')}. `
            + `Лодки продаёт Дед Семён, с ${Math.min(...BOATS.map((b) => b.level))}-го уровня рыбалки.`);
    } else {
      html = p.bag.length
        ? `<div class="fi-rows">${p.bag.map((f) => {
          const inHands = this.held === f.n;
          const hold = !this.allowHold ? '' : `<button type="button" class="k-btn k-btn--ghost k-btn--sm" data-act="hold" data-n="${f.n}">${inHands ? 'Убрать' : 'В руки'}</button>`;
          return catchRowHtml(f, hold + this.releaseBtn(f.n), inHands);
        }).join('')}</div>`
        : emptyHtml(pic, 'Рюкзак пуст', 'Пойманная рыба ложится сюда по цене поимки. Рюкзак побольше — в лавке у Деда Семёна.');
    }
    if (html === this.bodyKey) return;
    this.bodyKey = html;
    const scroll = this.body.scrollTop;
    this.body.innerHTML = html;
    this.body.scrollTop = scroll;
  }

  /** «Отпустить» → второе нажатие «Точно отпустить?» (красная) */
  private releaseBtn(n: number): string {
    const asking = this.ask === n;
    return `<button type="button" class="k-btn ${asking ? 'k-btn--stop' : 'k-btn--info'} k-btn--sm" data-act="release" data-n="${n}">${asking ? 'Точно отпустить?' : 'Отпустить'}</button>`;
  }
}
