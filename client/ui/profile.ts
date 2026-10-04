// Профиль в меню (Esc): разделы «Обзор» (ник в рамке — как его видят другие, жетоны, уровень и рамки, смена ника),
// «Рекорды» (лучшие результаты и счёт по режимам — списками из records.ts), «Коллекция» (рыбалка и альбом рыбака)
// и код для входа с другого устройства (раздел «Подарки и коды»). Каждый раздел — свой элемент: меню
// (client/ui/menu/menu.ts) ставит их к себе.
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
import { LevelProgressView } from './levelprogress.ts';
import { FISHING_STATS, MODE_STATS, RECORDS, statText, type ModeStats, type ProfileFacts } from './records.ts';

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

export class ProfilePanel {
  /** Обзор: ник в рамке, жетоны, уровень, смена ника */
  readonly overview: HTMLElement;
  /** Рекорды по режимам и счёт */
  readonly records: HTMLElement;
  /** Рыбалка и альбом рыбака */
  readonly collection: HTMLElement;
  /** Код для входа на другом устройстве */
  readonly device: HTMLElement;
  private readonly tag: HTMLCanvasElement;
  private readonly tokensEl: HTMLElement;
  private readonly bestEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly nickInput: HTMLInputElement;
  private readonly codeBox: HTMLElement;
  private readonly note: HTMLElement;
  private codeTimer = 0;
  private nick = '';
  private tagKey = '';
  private readonly levelProgress = new LevelProgressView();
  onRename: (nick: string) => void = () => {};
  onCode: () => void = () => {};

  constructor() {
    this.overview = el('div', 'prof-overview');
    this.overview.innerHTML = `
      <div class="prof-head">
        <div class="prof-id">
          <canvas class="prof-tag" width="${TAG_W * 2}" height="${TAG_H * 2}" role="img"></canvas>
          <span class="prof-tag-note">Так тебя видят другие игроки</span>
        </div>
        <div class="prof-tokens" title="Жетоны"></div>
      </div>
      <label class="field small prof-rename">
        <span>Сменить ник · не чаще раза в минуту</span>
        <div class="prof-row">
          <input class="prof-nick-input" type="text" maxlength="${MAX_NAME}" autocomplete="off" spellcheck="false" />
          <button class="btn ghost prof-rename-btn" type="button">Сменить</button>
        </div>
      </label>
      <div class="prof-note" role="status"></div>`;
    this.overview.querySelector('.prof-head')!.after(this.levelProgress.root);
    this.tag = this.overview.querySelector('.prof-tag')!;
    this.tokensEl = this.overview.querySelector('.prof-tokens')!;
    this.nickInput = this.overview.querySelector('.prof-nick-input')!;
    this.note = this.overview.querySelector('.prof-note')!;

    this.records = el('div', 'prof-records');
    this.records.innerHTML = `
      <h3 class="prof-h">Рекорды по режимам</h3>
      <div class="prof-best"></div>
      <h3 class="prof-h">Счёт по режимам</h3>
      <div class="prof-stats"></div>`;
    this.bestEl = this.records.querySelector('.prof-best')!;
    this.statsEl = this.records.querySelector('.prof-stats')!;

    this.collection = el('div', 'prof-collection');

    this.device = el('div', 'prof-device');
    this.device.innerHTML = `
      <button class="btn ghost prof-code" type="button">Получить код для входа</button>
      <div class="prof-codebox"></div>`;
    this.codeBox = this.device.querySelector('.prof-codebox')!;

    const rename = () => {
      const n = this.nickInput.value.replace(/\s+/g, ' ').trim();
      if (!n || n === this.nick) return;
      this.note.textContent = '';
      this.onRename(n);
    };
    this.overview.querySelector('.prof-rename-btn')!.addEventListener('click', rename);
    // буквы — в поле, а не игре; Esc — меню
    this.nickInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.key === 'Enter') rename();
    });
    this.nickInput.addEventListener('keyup', (e) => {
      if (e.key !== 'Escape') e.stopPropagation();
    });
    this.device.querySelector('.prof-code')!.addEventListener('click', () => this.onCode());
  }

  update(p: ProfileView): void {
    if (p.nick !== this.nick) {
      this.nick = p.nick;
      this.nickInput.value = p.nick;
    }
    this.drawTag(p.nick, p.level);
    setCoinText(this.tokensEl, `🪙 ${fmt.format(p.tokens)}`);
    this.levelProgress.update(p.xp);
    // рекорд крепости — что последним сказал сервер (client/fort/record.ts)
    const f: ProfileFacts = { stats: p.stats, album: p.album, fishing: p.fishing, fort: { on: fortKnown(), top: fortRecord() } };
    this.bestEl.replaceChildren(...RECORDS.filter((r) => !r.played || r.played(p.stats, f)).map((r) => {
      const v = r.value(p.stats, f);
      const row = el('div', v === null ? 'prof-rec none' : 'prof-rec');
      const name = row.appendChild(el('span', 'prof-rec-name'));
      name.appendChild(el('b', '')).textContent = r.mode;
      const what = r.whatOf?.(f) ?? r.what;
      name.appendChild(el('small', '')).textContent = r.course ? `${r.course} · ${what}` : what;
      setCoinText(row.appendChild(el('span', 'prof-rec-val')), statText(v));
      return row;
    }));
    this.statsEl.replaceChildren(...MODE_STATS.filter((m) => !m.played || m.played(p.stats)).map((m) => card(m, f)));
    // сначала сами рыбы, ниже — счёт рыбалки и навык
    this.collection.replaceChildren(albumBlock(p.album, p.stats));
    if (FISH2.on) {
      const fish = this.collection.appendChild(card(FISHING_STATS, f));
      fish.classList.add('prof-fishing');
      fish.appendChild(fishSkillBlock(p.fishing));
      const note = fish.appendChild(el('p', 'prof-fish-note'));
      note.textContent = 'Забросы, поклёвки, срывы и заработок учитываются с этого обновления. Заработок включает продажу рыб, сундуки, открытия видов и задания. Старые уловы и коллекция сохранены.';
    }
  }

  /** Ошибка смены ника (из уведомления сервера) */
  setNote(text: string): void {
    setCoinText(this.note, text);
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
      this.codeBox.innerHTML = `<b class="prof-code-val"></b><span>Введи его на другом устройстве: «У меня есть код». Одноразовый, ещё ${m}:${sec}</span>`;
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

/** Карточка режима: название и строки «что — сколько» */
function card(m: ModeStats, f: ProfileFacts): HTMLElement {
  const b = el('div', 'prof-block');
  b.appendChild(el('b', '')).textContent = m.mode;
  for (const [label, get] of m.rows) {
    const r = b.appendChild(el('div', ''));
    r.appendChild(el('span', '')).textContent = label;
    setCoinText(r.appendChild(el('i', '')), statText(get(f.stats, f)));
  }
  return b;
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
