// Профиль в меню (Esc): разделы «Обзор» (ник в рамке — как его видят другие, уровень и опыт, жетоны, рамки по уровням,
// лучшие рекорды, смена ника, код для входа с другого устройства), «Рекорды» (лучшие результаты и счёт по режимам —
// карточками кита из records.ts) и «Коллекция» (рыбалка и альбом рыбака). Каждый раздел — свой элемент: меню
// (client/ui/menu/menu.ts) ставит их к себе. Раскладка — как на странице lab/ui «Меню (Esc) → Профиль».
import { MAX_NAME } from '../../shared/constants.ts';
import type { Stats } from '../../shared/economy.ts';
import type { FishAlbum } from '../../shared/fishing.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import { frameForLevel } from '../../shared/levels.ts';
import { fortKnown, fortRecord } from '../fort/record.ts';
import { FISH2 } from '../lobby/fish2.ts';
import { fishSkillBlock } from '../lobby/fishprogresshud.ts';
import { drawLevelTag } from '../render/leveltag.ts';
import { albumBlock } from './album.ts';
import { setCoinText } from './coin.ts';
import { iconImg } from './kit/dom.ts';
import { uiIcon } from './kit/icons.ts';
import { LevelProgressView } from './levelprogress.ts';
import { el, ownKeys } from './menu/controls.ts';
import { FISHING_STATS, MODE_STATS, RECORDS, statText, type ModeStats, type ProfileFacts, type RecordLine, type StatValue } from './records.ts';

export interface ProfileView {
  pid: number;
  nick: string;
  tokens: number;
  xp: number;
  level: number;
  stats: Stats;
  album: FishAlbum;
  fishing: FishProgress;
}

const fmt = new Intl.NumberFormat('ru-RU');
/** Табличка ника — та же, что над желейкой (render/leveltag.ts); холст вдвое плотнее, чтобы буквы были чёткими */
const TAG_W = 320;
const TAG_H = 52;
/** Сколько рекордов — в «Обзоре» (остальные — в «Рекордах») */
const TOP_RECORDS = 4;

export class ProfilePanel {
  /** Обзор: ник в рамке, уровень, жетоны, рамки, лучшие рекорды, смена ника, код для входа */
  readonly overview: HTMLElement;
  /** Рекорды по режимам и счёт */
  readonly records: HTMLElement;
  /** Рыбалка и альбом рыбака */
  readonly collection: HTMLElement;
  private readonly tag: HTMLCanvasElement;
  private readonly tokensEl: HTMLElement;
  private readonly topEl: HTMLElement;
  private readonly topHead: HTMLElement;
  private readonly bestEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly nickInput: HTMLInputElement;
  private readonly renameBox: HTMLElement;
  private readonly renameBtn: HTMLButtonElement;
  private readonly codeBox: HTMLElement;
  private readonly note: HTMLElement;
  private codeTimer = 0;
  private nick = '';
  private tagKey = '';
  private readonly levelProgress = new LevelProgressView();
  onRename: (nick: string) => void = () => {};
  onCode: () => void = () => {};

  constructor() {
    this.overview = el('div', 'mn-prof');
    this.overview.innerHTML = `
      <div class="k-cell mn-id">
        <div class="mn-id-main">
          <canvas class="prof-tag" width="${TAG_W * 2}" height="${TAG_H * 2}" role="img"></canvas>
          <span class="k-faint">Так тебя видят другие игроки</span>
        </div>
        <div class="mn-id-side">
          <span class="mn-tok prof-tokens"></span>
          <span class="k-faint">жетонов</span>
          <button class="k-btn k-btn--ghost k-btn--sm prof-rename-open" type="button" aria-expanded="false">Сменить ник</button>
        </div>
      </div>
      <div class="k-cell mn-rename" hidden>
        <label class="mn-rename-field">
          <span class="k-row-title">Новый ник</span>
          <span class="k-row-hint">Менять можно не чаще раза в минуту</span>
          <span class="mn-rename-row">
            <input class="k-input prof-nick-input" type="text" maxlength="${MAX_NAME}" autocomplete="off" spellcheck="false" />
            <button class="k-btn k-btn--sm prof-rename-btn" type="button">Сменить</button>
          </span>
        </label>
        <div class="mn-note prof-note" role="status"></div>
      </div>
      <h3 class="mn-h mn-top-h">Твои рекорды</h3>
      <div class="mn-recs mn-top"></div>
      <div class="k-cell mn-device">
        ${iconImg('online')}
        <span class="mn-device-text"><b class="k-row-title">Играешь и с телефона?</b><span class="k-row-hint">Одноразовый код: введи его там — «У меня есть код»</span></span>
        <button class="k-btn k-btn--ghost k-btn--sm prof-code" type="button">Получить код для входа</button>
        <div class="prof-codebox"></div>
      </div>`;
    const id = this.overview.querySelector('.mn-id')!;
    id.prepend(this.levelProgress.ring);
    id.querySelector('.mn-id-main')!.append(this.levelProgress.xp);
    id.after(...[this.overview.querySelector('.mn-rename')!, this.levelProgress.tiers]);
    this.tag = this.overview.querySelector('.prof-tag')!;
    this.tokensEl = this.overview.querySelector('.prof-tokens')!;
    this.nickInput = this.overview.querySelector('.prof-nick-input')!;
    this.renameBox = this.overview.querySelector('.mn-rename')!;
    this.renameBtn = this.overview.querySelector('.prof-rename-open')!;
    this.note = this.overview.querySelector('.prof-note')!;
    this.topEl = this.overview.querySelector('.mn-top')!;
    this.topHead = this.overview.querySelector('.mn-top-h')!;
    this.codeBox = this.overview.querySelector('.prof-codebox')!;

    this.records = el('div', 'mn-prof-records');
    this.records.innerHTML = `
      <h3 class="mn-h">Рекорды по режимам</h3>
      <div class="mn-recs prof-best"></div>
      <h3 class="mn-h">Счёт по режимам</h3>
      <div class="mn-modes prof-stats"></div>`;
    this.bestEl = this.records.querySelector('.prof-best')!;
    this.statsEl = this.records.querySelector('.prof-stats')!;

    this.collection = el('div', 'prof-collection');

    const rename = () => {
      const n = this.nickInput.value.replace(/\s+/g, ' ').trim();
      if (!n || n === this.nick) return;
      this.note.textContent = '';
      this.onRename(n);
    };
    this.renameBtn.addEventListener('click', () => this.openRename(this.renameBox.hasAttribute('hidden')));
    this.overview.querySelector('.prof-rename-btn')!.addEventListener('click', rename);
    // буквы — в поле, а не игре; Esc — меню
    this.nickInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') ownKeys(e);
      if (e.key === 'Enter') rename();
    });
    this.nickInput.addEventListener('keyup', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this.overview.querySelector('.prof-code')!.addEventListener('click', () => this.onCode());
  }

  update(p: ProfileView): void {
    if (p.nick !== this.nick) {
      this.nick = p.nick;
      this.nickInput.value = p.nick;
      // ник поменялся (ответ сервера) — окошко смены не нужно
      this.openRename(false);
    }
    this.drawTag(p.nick, p.level);
    setCoinText(this.tokensEl, `🪙 ${fmt.format(p.tokens)}`);
    this.levelProgress.update(p.xp);
    // рекорд крепости — что последним сказал сервер (client/fort/record.ts)
    const f: ProfileFacts = { stats: p.stats, album: p.album, fishing: p.fishing, fort: { on: fortKnown(), top: fortRecord() } };
    const lines = RECORDS.filter((r) => !r.played || r.played(p.stats, f));
    this.bestEl.replaceChildren(...lines.map((r) => recordCard(r, f)));
    // в «Обзоре» — до четырёх лучших: по одному на режим, только свои, только с результатом
    const seen = new Set<string>();
    const top: RecordLine[] = [];
    for (const r of lines) {
      if (top.length >= TOP_RECORDS) break;
      if (r.theirs || seen.has(r.mode) || r.value(p.stats, f) === null) continue;
      seen.add(r.mode);
      top.push(r);
    }
    this.topEl.replaceChildren(...top.map((r) => recordCard(r, f)));
    this.topHead.hidden = this.topEl.hidden = top.length === 0;
    this.statsEl.replaceChildren(...MODE_STATS.filter((m) => !m.played || m.played(p.stats)).map((m) => modeCard(m, f)));
    // сначала сами рыбы, ниже — счёт рыбалки и навык
    this.collection.replaceChildren(albumBlock(p.album, p.stats));
    if (FISH2.on) {
      const fish = this.collection.appendChild(modeCard(FISHING_STATS, f));
      fish.classList.add('prof-fishing');
      fish.appendChild(fishSkillBlock(p.fishing));
      const note = fish.appendChild(el('p', 'prof-fish-note'));
      note.textContent = 'Забросы, поклёвки, срывы и заработок учитываются с этого обновления. Заработок включает продажу рыб, сундуки, открытия видов и задания. Старые уловы и коллекция сохранены.';
    }
  }

  /** Ошибка смены ника (из уведомления сервера): покажем её там же, где поле */
  setNote(text: string): void {
    setCoinText(this.note, text);
    if (text) this.openRename(true);
  }

  showCode(code: string, until: number): void {
    clearInterval(this.codeTimer);
    const draw = () => {
      const left = Math.max(0, Math.round((until - Date.now()) / 1000));
      if (left <= 0) {
        clearInterval(this.codeTimer);
        this.codeBox.innerHTML = '<span class="prof-code-old">Код истёк — возьми новый</span>';
        return;
      }
      const m = Math.floor(left / 60);
      const sec = String(left % 60).padStart(2, '0');
      this.codeBox.innerHTML = `<b class="prof-code-val"></b><span class="k-dim">Введи его на другом устройстве: «У меня есть код». Одноразовый, ещё ${m}:${sec}</span>`;
      this.codeBox.querySelector('.prof-code-val')!.textContent = code;
    };
    draw();
    this.codeTimer = window.setInterval(draw, 1000);
  }

  /** Спрятать код и подсказки (ушли из профиля или закрыли меню) */
  reset(): void {
    clearInterval(this.codeTimer);
    this.codeBox.textContent = '';
    this.note.textContent = '';
    this.nickInput.value = this.nick;
    this.openRename(false);
  }

  /** Окошко смены ника: открыть (с полем в фокусе) или спрятать */
  private openRename(open: boolean): void {
    this.renameBox.hidden = !open;
    this.renameBtn.setAttribute('aria-expanded', String(open));
    if (open && this.overview.isConnected && this.overview.offsetParent !== null) {
      this.nickInput.focus();
      this.nickInput.select();
    }
  }

  /** Ник в рамке уровня — как над желейкой; перерисовываем, только когда сменился ник или уровень */
  private drawTag(nick: string, level: number): void {
    const key = `${nick}\n${level}`;
    if (key === this.tagKey) return;
    const ctx = this.tag.getContext('2d');
    if (!ctx) return;
    this.tagKey = key;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    drawLevelTag(ctx, TAG_W, TAG_H, { name: nick, level, team: null, mate: false });
    const tier = frameForLevel(level);
    this.tag.setAttribute('aria-label', `${nick}, уровень ${level}${tier.id === 'none' ? '' : `, рамка «${tier.name}»`}`);
  }
}

/** Карточка-счётчик (.k-stat): значок режима, значение крупно, подпись; нет результата — приглушённая с «—» */
function statCard(icon: string, value: StatValue, caption: string, own = false): HTMLElement {
  const card = el('div', `k-stat${value === null ? ' k-stat--empty' : ''}${own && value !== null ? ' k-stat--own' : ''}`);
  const src = uiIcon(icon);
  if (src) {
    const img = card.appendChild(el('img', 'k-stat-ic'));
    img.src = src;
    img.alt = '';
    img.draggable = false;
  }
  setCoinText(card.appendChild(el('div', 'k-stat-num')), statText(value));
  card.appendChild(el('div', 'k-stat-cap')).textContent = caption;
  return card;
}

/** Рекорд: «Картинг · Портовое кольцо» и что за рекорд — под значением */
function recordCard(r: RecordLine, f: ProfileFacts): HTMLElement {
  const what = r.whatOf?.(f) ?? r.what;
  const caption = r.course ? `${r.mode} · ${r.course} · ${what}` : `${r.mode} · ${what}`;
  // свой рекорд — золотой каймой; чужой (рекорд всей крепости) — обычной карточкой
  return statCard(r.icon, r.value(f.stats, f), caption, !r.theirs);
}

/** Карточка режима: значок, название и строки «что — сколько» */
function modeCard(m: ModeStats, f: ProfileFacts): HTMLElement {
  const b = el('div', 'k-cell prof-block mn-mode');
  const head = b.appendChild(el('div', 'mn-block-head'));
  head.insertAdjacentHTML('beforeend', iconImg(m.icon));
  head.appendChild(el('b', '')).textContent = m.mode;
  for (const [label, get] of m.rows) {
    const r = b.appendChild(el('div', 'mn-mode-row'));
    r.appendChild(el('span', '')).textContent = label;
    setCoinText(r.appendChild(el('i', '')), statText(get(f.stats, f)));
  }
  return b;
}
