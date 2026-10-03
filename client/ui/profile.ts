// Профиль (Esc → «Профиль»): ник, жетоны, статистика, альбом рыбака, смена ника и код для входа с другого устройства.
import { fmtAquaTime } from '../../shared/aqua.ts';
import { MAX_NAME } from '../../shared/constants.ts';
import type { Stats } from '../../shared/economy.ts';
import { fmtWeight, type FishAlbum } from '../../shared/fishing.ts';
import type { FishProgress } from '../../shared/fishprogress.ts';
import { COLLECTION_SIZE, collectionCount } from '../../shared/fishrules.ts';
import { FISH2 } from '../lobby/fish2.ts';
import { fishSkillBlock } from '../lobby/fishprogresshud.ts';
import { fmtRaceTime } from '../race/hud.ts';
import { albumBlock } from './album.ts';
import { LevelProgressView } from './levelprogress.ts';
import { setCoinText } from './coin.ts';

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

export class ProfilePanel {
  readonly root: HTMLElement;
  private readonly nickEl: HTMLElement;
  private readonly tokensEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly nickInput: HTMLInputElement;
  private readonly renameBtn: HTMLButtonElement;
  private readonly codeBtn: HTMLButtonElement;
  private readonly codeBox: HTMLElement;
  private readonly note: HTMLElement;
  private codeTimer = 0;
  private nick = '';
  private readonly levelProgress = new LevelProgressView();
  onRename: (nick: string) => void = () => {};
  onCode: () => void = () => {};
  onBack: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pause-card profile';
    this.root.innerHTML = `
      <div class="prof-head">
        <div class="pause-title prof-nick"></div>
        <div class="prof-tokens"></div>
      </div>
      <div class="prof-stats"></div>
      <label class="field small">
        <span>Сменить ник (не чаще раза в минуту)</span>
        <div class="prof-row">
          <input class="prof-nick-input" type="text" maxlength="${MAX_NAME}" autocomplete="off" spellcheck="false" />
          <button class="btn ghost prof-rename">Сменить</button>
        </div>
      </label>
      <div class="prof-note"></div>
      <button class="btn ghost prof-code">Код для входа на другом устройстве</button>
      <div class="prof-codebox"></div>
      <button class="btn primary prof-back">Назад</button>`;
    this.root.querySelector('.prof-head')!.after(this.levelProgress.root);
    this.nickEl = this.root.querySelector('.prof-nick')!;
    this.tokensEl = this.root.querySelector('.prof-tokens')!;
    this.statsEl = this.root.querySelector('.prof-stats')!;
    this.nickInput = this.root.querySelector('.prof-nick-input')!;
    this.renameBtn = this.root.querySelector('.prof-rename')!;
    this.codeBtn = this.root.querySelector('.prof-code')!;
    this.codeBox = this.root.querySelector('.prof-codebox')!;
    this.note = this.root.querySelector('.prof-note')!;

    const rename = () => {
      const n = this.nickInput.value.replace(/\s+/g, ' ').trim();
      if (!n || n === this.nick) return;
      this.note.textContent = '';
      this.onRename(n);
    };
    this.renameBtn.addEventListener('click', rename);
    this.nickInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') rename();
    });
    this.nickInput.addEventListener('keyup', (e) => e.stopPropagation());
    this.codeBtn.addEventListener('click', () => this.onCode());
    this.root.querySelector('.prof-back')!.addEventListener('click', () => this.onBack());
  }

  update(p: ProfileView): void {
    if (p.nick !== this.nick) {
      this.nick = p.nick;
      this.nickInput.value = p.nick;
    }
    this.nickEl.textContent = p.nick;
    setCoinText(this.tokensEl, `🪙 ${fmt.format(p.tokens)}`);
    this.levelProgress.update(p.xp);
    const s = p.stats;
    this.statsEl.innerHTML = '';
    const block = (title: string, rows: Array<[string, number | string]>) => {
      const b = document.createElement('div');
      b.className = 'prof-block';
      const h = document.createElement('b');
      h.textContent = title;
      b.appendChild(h);
      for (const [name, v] of rows) {
        const r = document.createElement('div');
        r.innerHTML = '<span></span><i></i>';
        r.firstElementChild!.textContent = name;
        r.lastElementChild!.textContent = typeof v === 'number' ? fmt.format(v) : v;
        b.appendChild(r);
      }
      this.statsEl.appendChild(b);
      return b;
    };
    if (FISH2.on) {
      const fish = block('🎣 Рыбалка', [
        ['забросов', s.fsCasts], ['поклёвок', s.fsBites], ['поймано рыб', s.fsFish], ['сорвано рыб', s.fsLost],
        ['общий вес', fmtWeight(s.fsGrams)], ['самая тяжёлая', s.fsMaxGrams > 0 ? fmtWeight(s.fsMaxGrams) : '—'],
        ['видов поймано', `${collectionCount(p.album)} из ${COLLECTION_SIZE}`], ['сундуков', s.fsChests],
        ['жетонов заработано', s.fsEarned], ['опыт рыбалки', `${fmt.format(p.fishing.xp)} XP`], ['заданий выполнено', p.fishing.questsDone],
      ]);
      fish.classList.add('prof-fishing');
      fish.appendChild(fishSkillBlock(p.fishing));
      const note = document.createElement('p');
      note.className = 'prof-fish-note';
      note.textContent = 'Забросы, поклёвки, срывы и заработок учитываются с этого обновления. Заработок включает продажу рыб, сундуки, открытия видов и задания. Старые уловы и коллекция сохранены.';
      fish.appendChild(note);
    }
    block('🎯 Пейнтбол', [['раундов', s.pbRounds], ['побед', s.pbWins], ['сбитых', s.pbKills], ['лучший игрок', s.pbMvp]]);
    block('🎰 Автоматы', [['вращений', s.spins], ['выиграно', s.slotWon], ['лучший выигрыш', s.bestWin], ['джекпотов', s.jackpots]]);
    block('🃏 Дурак', [['партий', s.dkGames], ['в дураках', s.dkFools], ['вышел первым', s.dkFirst]]);
    block('🏁 Гонки', [['заездов', s.rcRaces], ['побед', s.rcWins], ['подиумов', s.rcPodiums], ['лучший круг · порт', s.rcBestLap > 0 ? fmtRaceTime(s.rcBestLap) : '—'], ['лучший круг · литейный', s.rcBestLapFoundry > 0 ? fmtRaceTime(s.rcBestLapFoundry) : '—']]);
    block('🌊 Аквапарк', [['пройдено', s.aqRuns], ['лучшее время', s.aqBest > 0 ? fmtAquaTime(s.aqBest) : '—']]);
    // «Крепость» — только тем, кто в ней бывал (пока режим скрыт флагом, у остальных блока нет)
    if (s.ftGames > 0) block('🏰 Крепость', [['игр', s.ftGames], ['побед', s.ftWins], ['лучшая волна', s.ftBest], ['сбито зомби', s.ftKills]]);
    // «Fight Club» — тоже только тем, кто дрался (о клубе — никому)
    if (s.fcFights > 0) block('🥊 Подвал', [['боёв', s.fcFights], ['побед', s.fcWins], ['нокаутов', s.fcKos]]);
    if (s.stStorms > 0) block('⛈️ Шторм', [['штормов', s.stStorms], ['огней зажжено', s.stLights]]);
    if (s.prRaids > 0) block('🏴‍☠️ Пираты', [['налётов', s.prRaids], ['побед', s.prWins], ['сбито пиратов', s.prKos]]);
    if (s.brRaces > 0) block('🚤 Гонки на катерах', [['заездов', s.brRaces], ['побед', s.brWins], ['лучший круг', s.brBestLap > 0 ? fmtRaceTime(s.brBestLap * 1000 / 60) : '—']]);
    if (s.hiGames > 0) block('🙈 Прятки', [['игр', s.hiGames], ['побед', s.hiWins], ['найдено', s.hiFound], ['пережито раундов', s.hiSurvived]]);
    this.statsEl.appendChild(albumBlock(p.album, s));
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

  /** Спрятать код и подсказки (при закрытии) */
  reset(): void {
    clearInterval(this.codeTimer);
    this.codeBox.textContent = '';
    this.note.textContent = '';
    this.nickInput.value = this.nick;
  }
}
